import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptOrigin } from 'claude-code'

const PERSON: PromptOrigin = { kind: 'composer' }
const QUESTION = 'Should I make both changes?'
const CLOSE = 'mcp__deferred-answers__deferred_close'

// The engine beneath the plugin. `sent` collects what reached the model beside
// each prompt; `toasts` and `statuses` prove the mod stays quiet.
const engine = (on: On, askResult: Record<string, unknown> = {}) => {
  const sent: (readonly string[])[] = []
  const toasts: string[] = []

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('tool.register', () => ({ value: { tool: CLOSE } }))
  on('command.register', () => ({ value: { command: 'deferred' } }))
  on('ui.toast', (_$, e) => {
    toasts.push(String((e as { text?: unknown }).text))

    return { value: undefined }
  })
  on('prompt.submit', (_$, e) => {
    sent.push(e.context ?? [])

    return { text: e.text }
  })
  const boxes: Record<string, unknown>[] = []

  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: askResult }))
  on('tool.call', { tool: 'mcp__ccd_turn__wrap_up' }, (_$, e) => {
    boxes.push(e as unknown as Record<string, unknown>)

    return { result: 'shown' }
  })
  on('tool.call', { tool: 'mcp__ccd_session__start_session' }, () => ({ result: 'Started session "Probe" (session_id: local_aaaa-1111, name: probe).' }))
  on('tool.call', () => ({ result: 'ok' }))

  return { sent, toasts, boxes }
}

const start = ($: Engine) => $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
const say = ($: Engine, text: string, origin: PromptOrigin = PERSON) => $.prompt.submit({ text, origin, wait: false })
const wrapUp = ($: Engine, ask: string) =>
  $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'Done.', ask, actions: [{ label: 'Yes, do both' }, { label: 'Not now' }] })
const ask = ($: Engine) =>
  $.tool.call({
    tool: 'AskUserQuestion',
    questions: [{ question: QUESTION, header: 'Changes', multiSelect: false, options: [{ label: 'Yes', description: '' }, { label: 'No', description: '' }] }],
  })
const last = (sent: (readonly string[])[]) => (sent.at(-1) ?? []).join('\n')

describe('a question put off stays open', () => {
  test('a "later, after X" reply to a button question is attached to every later message', async ($, on) => {
    const { sent, toasts } = engine(on)

    await start($)
    await wrapUp($, QUESTION)
    await say($, 'Later, after the style rewrite.')
    await say($, 'Now fix the typo in the README.')

    expect(last(sent)).toContain(QUESTION)
    expect(last(sent)).toContain('after the style rewrite')
    expect(toasts).toEqual([])
  })

  test('the "Not now" button counts as putting it off', async ($, on) => {
    const { sent } = engine(on)

    await start($)
    await wrapUp($, QUESTION)
    await say($, 'Not now')

    expect(last(sent)).toContain(QUESTION)
  })

  test('a yes or a plain no closes the question', async ($, on) => {
    const { sent } = engine(on)

    await start($)
    await wrapUp($, QUESTION)
    await say($, 'No')
    await wrapUp($, 'Commit it?')
    await say($, 'Yes, commit it.')
    await say($, 'Next thing.')

    expect(last(sent)).toBe('')
  })

  test('a message from another session does not answer the question', async ($, on) => {
    const { sent } = engine(on)

    await start($)
    await wrapUp($, QUESTION)
    await say($, 'Another Claude session sent a message: do it later', { kind: 'peer' })
    await say($, 'Later.')

    expect(last(sent)).toContain(QUESTION)
  })

  test('a dialog note that says "after X" keeps the question open', async ($, on) => {
    const { sent } = engine(on, { answers: { [QUESTION]: 'Yes' }, annotations: { [QUESTION]: { notes: 'but after we finish the tests' } } })

    await start($)
    await ask($)
    await say($, 'Go on.')

    expect(last(sent)).toContain('but after we finish the tests')
  })

  test('a dialog that closed on its own while the person was away stays open', async ($, on) => {
    const { sent } = engine(on, { answers: { [QUESTION]: 'Yes' }, afkTimeoutMs: 60000 })

    await start($)
    await ask($)
    await say($, 'Back.')

    expect(last(sent)).toContain('closed on its own')
  })

  test('a dialog answered with a plain pick is not kept', async ($, on) => {
    const { sent } = engine(on, { answers: { [QUESTION]: 'Yes' } })

    await start($)
    await ask($)
    await say($, 'Go on.')

    expect(last(sent)).toBe('')
  })
})

describe('closing', () => {
  test('the close tool removes an item', async ($, on) => {
    const { sent } = engine(on)

    await start($)
    await wrapUp($, QUESTION)
    await say($, 'Later.')
    await $.tool.call({ tool: CLOSE, id: 1, why: 'done' })
    await say($, 'Next.')

    expect(last(sent)).toBe('')
  })

  test('/deferred lists, and /deferred drop all clears', async ($, on) => {
    engine(on)

    await start($)
    await wrapUp($, QUESTION)
    await say($, 'Not yet.')

    const listed = await $.command.run({ command: 'deferred', args: '', origin: PERSON, presentation: { isFullscreen: false, columns: 80 } })
    const dropped = await $.command.run({ command: 'deferred', args: 'drop all', origin: PERSON, presentation: { isFullscreen: false, columns: 80 } })

    expect(listed.text ?? '').toContain(QUESTION)
    expect(dropped.text).toBe('Nothing put off.')
  })
})

describe('telling a reply from a story', () => {
  test('a long message that starts "After the ..." is not a deferral', async ($, on) => {
    const { sent } = engine(on)

    await start($)
    await wrapUp($, QUESTION)
    await say($, 'After the outcome of that test, we found another issue. I saw a card that disappeared and came back with a different spec.')
    await say($, 'Next.')

    expect(last(sent)).toBe('')
  })

  test('a reply that follows an app note in the same message still answers the question', async ($, on) => {
    const { sent } = engine(on)

    await start($)
    await wrapUp($, QUESTION)
    await say($, ['<system-reminder>', 'A linked session finished a turn.', '</system-reminder>', '', 'Done, here it is'].join('\n'))
    await say($, 'After the outcome of that test we found something.')

    expect(last(sent)).toBe('')
  })
})

describe('the next-step box appears once and does not change', () => {
  test('while a started session is working the question is held back, then handed back when all are done', async ($, on) => {
    const { boxes, sent } = engine(on)

    await start($)
    await $.tool.call({ tool: 'mcp__ccd_session__start_session', initiation: 'user_asked', title: 'Probe', prompt: 'x' })
    await wrapUp($, 'Commit both mods?')

    expect(boxes.at(-1)?.ask).toBeUndefined()
    expect(boxes.at(-1)?.recap).toBe('Done.')

    await say($, '<side-sessions-event>None of the sessions you started is working now; their notes are above.</side-sessions-event>', { kind: 'task-notification' })

    expect(last(sent)).toContain('Commit both mods?')

    await wrapUp($, 'Commit both mods?')
    expect(boxes.at(-1)?.ask).toBe('Commit both mods?')
  })

  test('a turn the person did not start keeps the question on screen', async ($, on) => {
    const { boxes } = engine(on)

    await start($)
    await say($, 'Go.')
    await wrapUp($, QUESTION)
    await say($, 'Another Claude session sent a message: report', { kind: 'peer' })
    await wrapUp($, 'Something else?')

    expect(boxes.at(-1)?.ask).toBe(QUESTION)
    expect(boxes.at(-1)?.actions).toEqual([{ label: 'Yes, do both' }, { label: 'Not now' }])
  })

  test('the person answering lets a new question through', async ($, on) => {
    const { boxes } = engine(on)

    await start($)
    await wrapUp($, QUESTION)
    await say($, 'Yes, do both')
    await wrapUp($, 'Commit it?')

    expect(boxes.at(-1)?.ask).toBe('Commit it?')
  })
})
