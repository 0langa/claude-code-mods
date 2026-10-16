import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptOrigin, RenderSurface } from 'claude-code'

const TYPED = 'Um, fix the the bug, uh, please.'
const SENT = 'Fix the bug please.'
const SURFACES: readonly RenderSurface[] = ['terminal', 'desktop']
const TERMINAL: PromptOrigin = { kind: 'composer' }

// The engine beneath the plugin: the prompt enters as it arrives, and a message
// row draws its own text, which the mod's hook may rewrite or wrap.
const engine = (on: On) => {
  mock.store(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('fs.list', () => ({ value: [] }))
  on('fs.read', () => ({ value: '' }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })
}

const run = (args: string) => ({ command: 'clean', args, origin: TERMINAL, presentation: { isFullscreen: false, columns: 80 } })
const send = ($: Engine, text: string) => $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })

const row = ($: Engine, surface: RenderSurface, text: string) =>
  $.ui.mount({ plugin: 'dictation-cleanup', surface, component: 'UserMessage', props: { text, origin: TERMINAL, isExpanded: false } })

const texts = async (drawn: Awaited<ReturnType<typeof row>>) => (await drawn.findAll({ type: 'Text' })).map(element => element.text)

describe('compare: how a message row is drawn', () => {
  for (const surface of SURFACES) {
    test(`${surface}: off, a row is drawn as you typed it`, async ($, on) => {
      engine(on)
      await send($, TYPED)

      expect(await texts(await row($, surface, TYPED))).toEqual([TYPED])
    })

    test(`${surface}: on, a message you typed is drawn as Claude got it, in place`, async ($, on) => {
      engine(on)
      await send($, TYPED)
      await $.command.run(run('compare on'))

      expect(await texts(await row($, surface, TYPED))).toEqual([SENT])
      // A row that already shows what Claude got is left as it is.
      expect(await texts(await row($, surface, SENT))).toEqual([SENT])
    })

    test(`${surface}: both, the other side is drawn beneath the row`, async ($, on) => {
      engine(on)
      await send($, TYPED)
      await $.command.run(run('compare both'))

      expect(await texts(await row($, surface, TYPED))).toEqual([TYPED, 'Sent to Claude (4 words):', SENT])
      expect(await texts(await row($, surface, SENT))).toEqual([SENT, 'You dictated (7 words):', TYPED])
    })

    test(`${surface}: a row that is not a cleaned message is left as drawn, in every mode`, async ($, on) => {
      engine(on)
      await send($, TYPED)

      for (const mode of ['on', 'both', 'off']) {
        await $.command.run(run(`compare ${mode}`))
        expect(await texts(await row($, surface, 'Something else entirely.'))).toEqual(['Something else entirely.'])
      }
    })
  }

  test('switching mode redraws a row that is already on screen, and off puts it back', async ($, on) => {
    engine(on)
    await send($, TYPED)
    const drawn = await row($, 'terminal', TYPED)

    expect(await texts(drawn)).toEqual([TYPED])
    await $.command.run(run('compare on'))
    expect(await texts(drawn)).toEqual([SENT])
    await $.command.run(run('compare both'))
    expect(await texts(drawn)).toEqual([TYPED, 'Sent to Claude (4 words):', SENT])
    await $.command.run(run('compare off'))
    expect(await texts(drawn)).toEqual([TYPED])
  })

  test('what an earlier version saved still means what it did', async ($, on) => {
    // It kept true for "the line beneath each message".
    mock.store(on, { compare: true })
    on('session.cwd', () => ({ value: '/repo' }))
    on('fs.list', () => ({ value: [] }))
    on('fs.read', () => ({ value: '' }))
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('ui.status', () => ({ value: undefined }))
    on('ui.toast', () => ({ value: undefined }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('command.register', () => ({ value: { command: 'clean' } }))
    on('ui.render', { component: 'UserMessage' }, ($, e) => {
      const { Text } = $.ui.resolve(e)

      return <Text>{e.props.text}</Text>
    })
    await $.session.start({ cwd: '/repo' } as never)
    await send($, TYPED)

    expect(await texts(await row($, 'terminal', TYPED))).toEqual([TYPED, 'Sent to Claude (4 words):', SENT])
  })

  test('/clean last still shows the message as dictated and as sent', async ($, on) => {
    engine(on)
    await send($, TYPED)

    const text = (await $.command.run(run('last'))).text ?? ''

    expect(text).toContain(TYPED)
    expect(text).toContain(SENT)
  })
})
