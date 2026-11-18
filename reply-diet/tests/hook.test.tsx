import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptOrigin, RenderSurface } from 'claude-code'

const PERSON: PromptOrigin = { kind: 'composer' }
const SURFACES: readonly RenderSurface[] = ['terminal', 'desktop']

const ANSWER =
  'The page moved to a new folder at the repository root, and **git ignores that folder** through a local rule, so the public ignore file did not change at all.'
const QUOTE = 'The page moved to a new folder at the repository root, and git ignores that folder through a local rule, so the public ignore file did not change at all.'
const SHORT = 'The page moved to a new folder at [… 17 words …] did not change at all.'

const TYPED = `<!-- reply 1 -->\n> ${QUOTE}\n\nFine by me, um, keep it that way.\n\n\nAnd now build the thing.`
const SENT = `<!-- reply 1 -->\n> ${SHORT}\n\nFine by me, um, keep it that way.\n\n\nAnd now build the thing.`

type Row = { role: 'user' | 'assistant'; text: string; toolUses: [] }

const CONVERSATION: Row[] = [
  { role: 'user', text: 'Move the page.', toolUses: [] },
  { role: 'assistant', text: ANSWER, toolUses: [] },
]

// The engine beneath the plugin. `entered` collects each prompt as it entered
// the session; `said` proves the mod stays quiet.
const engine = (on: On, rows: Row[] | Error = CONVERSATION) => {
  const entered: string[] = []
  const said: string[] = []

  mock.store(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'replies' } }))
  on('session.messages', () => {
    if (rows instanceof Error) {
      throw rows
    }

    return { value: rows }
  })
  on('ui.toast', (_$, e) => {
    said.push(String((e as { text?: unknown }).text))

    return { value: undefined }
  })
  on('ui.status', (_$, e) => {
    said.push(String((e as { text?: unknown }).text))

    return { value: undefined }
  })
  on('prompt.submit', (_$, e) => {
    entered.push(e.text)

    return { text: e.text }
  })
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  return { entered, said }
}

const start = ($: Engine) => $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
const send = ($: Engine, text: string, origin: PromptOrigin = PERSON) => $.prompt.submit({ text, origin, wait: false })
const run = ($: Engine, args: string) =>
  $.command.run({ command: 'replies', args, origin: PERSON, presentation: { isFullscreen: false, columns: 80 } })
const row = ($: Engine, surface: RenderSurface, text: string) =>
  $.ui.mount({ plugin: 'reply-diet', surface, component: 'UserMessage', props: { text, origin: PERSON, isExpanded: false } })
const texts = async (drawn: Awaited<ReturnType<typeof row>>) => (await drawn.findAll({ type: 'Text' })).map(element => element.text)

describe('a stacked reply on its way to Claude', () => {
  test('goes out with its long quote shortened, and nothing is said', async ($, on) => {
    const { entered, said } = engine(on)

    await start($)
    await send($, TYPED)

    expect(entered).toEqual([SENT])
    expect(said).toEqual([])
  })

  test('a message from Remote Control is shortened the same way', async ($, on) => {
    const { entered } = engine(on)

    await send($, TYPED, { kind: 'bridge' })

    expect(entered).toEqual([SENT])
  })

  test('a quote found only in a message of your own is left alone', async ($, on) => {
    const { entered, said } = engine(on, [{ role: 'user', text: ANSWER, toolUses: [] }])

    await send($, TYPED)

    expect(entered).toEqual([TYPED])
    expect(said).toEqual([])
  })

  test('a message without replies, a slash command and a note from the app go out as they came', async ($, on) => {
    const { entered, said } = engine(on)
    const plain = `Look at this passage:\n\n> ${QUOTE}`

    await send($, plain)
    await $.prompt.submit({ text: TYPED, origin: PERSON, wait: false, command: { name: 'compact', args: '' } } as never)
    await $.prompt.submit({ text: TYPED, origin: { kind: 'task-notification' }, wait: false, isMeta: true } as never)

    expect(entered).toEqual([plain, TYPED, TYPED])
    expect(said).toEqual([])
  })

  test('when the conversation cannot be read, the message goes out as typed and the mod says so', async ($, on) => {
    const { entered, said } = engine(on, new Error('unreadable'))

    await send($, TYPED)

    expect(entered).toEqual([TYPED])
    expect(said.length).toBe(1)
    expect(said[0]).toContain('went out as typed')
  })
})

describe('/replies', () => {
  test('off leaves replies alone, on brings the diet back, and both last', async ($, on) => {
    const { entered } = engine(on)

    expect((await run($, 'off')).text).toBe('Reply diet: off.')
    await send($, TYPED)
    expect((await run($, 'on')).text).toBe('Reply diet: on.')
    await send($, TYPED)

    expect(entered).toEqual([TYPED, SENT])
  })

  test('alone says whether it is on and how much it has saved', async ($, on) => {
    engine(on)

    expect((await run($, '')).text).toBe(
      'Reply diet is on. It has shortened 0 quotes in 0 messages, about 0 tokens in all. Use /replies on or /replies off. To edit attached replies, send #edit as the message.',
    )
    await send($, TYPED)

    const tokens = (sends: number) => Math.round(((TYPED.length - SENT.length) * sends) / 4)

    expect((await run($, '')).text).toBe(
      `Reply diet is on. It has shortened 1 quote in 1 message, about ${tokens(1)} tokens in all. Use /replies on or /replies off. To edit attached replies, send #edit as the message.`,
    )
    await send($, TYPED)

    expect((await run($, '')).text).toBe(
      `Reply diet is on. It has shortened 2 quotes in 2 messages, about ${tokens(2)} tokens in all. Use /replies on or /replies off. To edit attached replies, send #edit as the message.`,
    )
  })
})

describe('the message you sent is drawn as Claude got it', () => {
  for (const surface of SURFACES) {
    test(`${surface}: a shortened message is drawn shortened, in place`, async ($, on) => {
      engine(on)
      await send($, TYPED)

      expect(await texts(await row($, surface, TYPED))).toEqual([SENT])
    })

    test(`${surface}: a row that already shows what Claude got, or another message, is left as drawn`, async ($, on) => {
      engine(on)
      await send($, TYPED)

      expect(await texts(await row($, surface, SENT))).toEqual([SENT])
      expect(await texts(await row($, surface, 'Something else entirely.'))).toEqual(['Something else entirely.'])
    })
  }

  test('a row is redrawn the moment its message is shortened', async ($, on) => {
    engine(on)
    const drawn = await row($, 'desktop', TYPED)

    expect(await texts(drawn)).toEqual([TYPED])
    await send($, TYPED)
    expect(await texts(drawn)).toEqual([SENT])
  })
})
