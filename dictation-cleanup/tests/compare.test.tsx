import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptOrigin, RenderSurface } from 'claude-code'

const TYPED = 'Um, fix the the bug, uh, please.'
const SENT = 'Fix the bug please.'
const SURFACES: readonly RenderSurface[] = ['terminal', 'desktop']
const TERMINAL: PromptOrigin = { kind: 'composer' }

// The engine beneath the plugin: the prompt enters as it arrives, and a message
// row draws its own text, which the mod's hook may rewrite.
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

describe('a message you typed is drawn as Claude got it', () => {
  for (const surface of SURFACES) {
    test(`${surface}: a cleaned message is drawn as Claude got it, in place, with nothing added`, async ($, on) => {
      engine(on)
      await send($, TYPED)

      expect(await texts(await row($, surface, TYPED))).toEqual([SENT])
    })

    test(`${surface}: a row that already shows what Claude got, or is another message, is left as drawn`, async ($, on) => {
      engine(on)
      await send($, TYPED)

      expect(await texts(await row($, surface, SENT))).toEqual([SENT])
      expect(await texts(await row($, surface, 'Something else entirely.'))).toEqual(['Something else entirely.'])
    })

    test(`${surface}: a message that was not changed is drawn as the app draws it`, async ($, on) => {
      engine(on)
      await send($, 'All good here, nothing to fix at all.')

      expect(await texts(await row($, surface, 'All good here, nothing to fix at all.'))).toEqual(['All good here, nothing to fix at all.'])
    })
  }

  test('a row is redrawn the moment its message is cleaned', async ($, on) => {
    engine(on)
    const drawn = await row($, 'terminal', TYPED)

    expect(await texts(drawn)).toEqual([TYPED])
    await send($, TYPED)
    expect(await texts(drawn)).toEqual([SENT])
  })

  test('/clean last shows the message as written and as sent', async ($, on) => {
    engine(on)
    await send($, TYPED)

    const text = (await $.command.run(run('last'))).text ?? ''

    expect(text).toContain(TYPED)
    expect(text).toContain(SENT)
  })

  test('there is no compare command any more', async ($, on) => {
    engine(on)

    expect((await $.command.run(run('compare on'))).text).not.toContain('Compare')
  })
})
