import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, PromptOrigin, PromptSubmitResult } from 'claude-code'

import { askedForEdit, editable, numbered, sharesQuote, splitSent } from '../hooks/edit'

const QUOTE_ONE = 'The page moved to a new folder at the repository root.'
const QUOTE_TWO = 'Nothing is committed.'
const REPLIES = `<!-- reply 2 -->\n> ${QUOTE_ONE}\n\nFine by me, keep it that way.\n\n<!-- reply -->\n> ${QUOTE_TWO}\n\nGood.`
// As the person sends it back: the app trims the blank lines at the end.
const EDITED = `<!-- reply -->\n> ${QUOTE_ONE}\n\nFine by me, keep it that way.\n\n<!-- reply -->\n> ${QUOTE_TWO}\n\nGood.`
// As the mod puts it into the box: two blank lines below, for a message.
const IN_BOX = `${EDITED}\n\n\n`
const OTHER = '<!-- reply 1 -->\n> A second passage that was quoted later.\n\nAnd this too.'

describe('the text of a message with replies', () => {
  test('is split into what the app put in front, the replies and the typed message', () => {
    expect(splitSent(`${REPLIES}\n\n\n#edit`)).toEqual({ prefix: '', replies: REPLIES, typed: '#edit', count: 2 })
    expect(splitSent(REPLIES)).toEqual({ prefix: '', replies: REPLIES, typed: '', count: 2 })
    expect(splitSent(`@"notes.md"\n${REPLIES}\n\n\n#edit`)?.prefix).toBe('@"notes.md"\n')
    expect(splitSent('Just a message.')).toBe(undefined)
    expect(splitSent('<!-- reply 2 -->\nno quote line')).toBe(undefined)
  })

  test('the keyword asks for the edit only as the last paragraph on its own', () => {
    for (const typed of ['#edit', '#Edit.', ' #edit ', '#EDIT']) {
      expect(askedForEdit(typed)).toEqual({ rest: '' })
    }
    expect(askedForEdit('And build it.\n\n#edit')).toEqual({ rest: 'And build it.' })
    for (const typed of ['', 'edit', 'edit replies', '#edit the second one', 'please #edit', '#editor', '#edit\n\nand more']) {
      expect(askedForEdit(typed)).toBe(undefined)
    }
  })

  test('goes into the box with a bare first marker and room for a message, and comes back numbered', () => {
    expect(editable(REPLIES)).toBe(IN_BOX)
    expect(editable(REPLIES, 'And build it.')).toBe(`${IN_BOX}And build it.`)
    expect(numbered(EDITED)).toEqual({ text: REPLIES, count: 2 })
    // One reply deleted while editing: the number follows.
    expect(numbered(`<!-- reply -->\n> ${QUOTE_TWO}\n\nGood, and thanks.`)).toEqual({ text: `<!-- reply 1 -->\n> ${QUOTE_TWO}\n\nGood, and thanks.`, count: 1 })
    // A message below two blank lines is the typed message, not a reply.
    expect(numbered(`${IN_BOX}And now build it.`)?.text).toBe(`${REPLIES}\n\n\nAnd now build it.`)
    // Two blank lines left inside a comment would cut the later replies off.
    expect(numbered(EDITED.replace('keep it that way.\n\n', 'keep it that way.\n\n\n'))).toEqual({ text: REPLIES, count: 2 })
    expect(numbered(REPLIES)).toBe(undefined)
    expect(numbered('<!-- reply -->\nno quote line')).toBe(undefined)
  })

  test('a text is known by the quotes it carries', () => {
    expect(sharesQuote(EDITED.replace('Fine by me', 'Fine with me'), IN_BOX)).toBe(true)
    expect(sharesQuote('something else', IN_BOX)).toBe(false)
    expect(sharesQuote(OTHER, IN_BOX)).toBe(false)
  })
})

const BOX: PromptOrigin = { kind: 'composer' }

// The engine and the app beneath the mod: a message box, a clock, and the list
// of prompts that entered the session.
const world = (on: On, start: { box?: string; fillFailures?: number } = {}) => {
  const state = { box: start.box ?? '', fillFailures: start.fillFailures ?? 0 }
  const entered: string[] = []
  const fills: string[] = []
  const clock = mock.clock(on)

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'replies' } }))
  // The diet's own step reads the conversation; there is none here, so no quote is shortened.
  on('session.messages', () => ({ value: [] }))
  mock.store(on)
  on('prompt.submit', (_$, e) => {
    entered.push(e.text)

    return { text: e.text }
  })
  on('prompt.read', () => ({ value: { text: state.box, cursor: 0 } }))
  on('prompt.fill', (_$, e) => {
    if (state.fillFailures > 0) {
      state.fillFailures -= 1

      return { isFilled: false }
    }
    fills.push(`${e.mode}:${e.text}`)
    state.box += e.text

    return { isFilled: true }
  })

  return { state, entered, fills, clock }
}

const reason = (result: PromptSubmitResult) => ('drop' in result ? result.drop : undefined)
const run = (draft: string) => ({ command: 'replies', args: `back ${draft}`.trim(), origin: BOX, presentation: { isFullscreen: false, columns: 80 } })

describe('with replies attached, the keyword stops the send', () => {
  test('the replies come back into the empty box as text, and nothing enters the session', async ($, on) => {
    const { entered, fills, state } = world(on)
    const result = await $.prompt.submit({ text: `${REPLIES}\n\n\n#edit`, origin: BOX, wait: false })

    expect(reason(result)).toContain('back in the message box')
    expect(entered).toEqual([])
    expect(fills).toEqual([`append:${IN_BOX}`])
    expect(state.box).toBe(IN_BOX)
  })

  test('the edited text is sent as a message with replies again', async ($, on) => {
    const { entered } = world(on)

    await $.prompt.submit({ text: `${REPLIES}\n\n\n#edit`, origin: BOX, wait: false })
    await $.prompt.submit({ text: EDITED.replace('Good.', 'Good, thanks.'), origin: BOX, wait: false })

    expect(entered).toEqual([REPLIES.replace('Good.', 'Good, thanks.')])
  })

  test('what was typed above the keyword stays the message', async ($, on) => {
    const { fills } = world(on)

    await $.prompt.submit({ text: `${REPLIES}\n\n\nAnd build it.\n\n#edit`, origin: BOX, wait: false })

    expect(fills).toEqual([`append:${IN_BOX}And build it.`])
  })

  test('with a file attached the app puts a line in front; the send is stopped all the same', async ($, on) => {
    const { entered, fills } = world(on)
    const result = await $.prompt.submit({ text: `@"notes.md"\n${REPLIES}\n\n\n#edit`, origin: BOX, wait: false })

    expect(reason(result)).toContain('attach them again')
    expect(entered).toEqual([])
    expect(fills).toEqual([`append:${IN_BOX}`])
  })

  test('once the text is in the box, no timer ever puts it there again', async ($, on) => {
    const { fills, state, clock } = world(on)

    await $.prompt.submit({ text: `${REPLIES}\n\n\n#edit`, origin: BOX, wait: false })
    // He sends the edited text: the app empties the box before the engine has the message.
    state.box = ''
    await clock.advance(5000)
    await $.prompt.submit({ text: EDITED, origin: BOX, wait: false })
    await clock.advance(5000)

    expect(fills.length).toBe(1)
    expect(state.box).toBe('')
  })

  test('other messages go out as they are', async ($, on) => {
    const { entered, fills } = world(on)
    const withMessage = `${REPLIES}\n\n\nAnd now build it.`
    const fromPhone = `${REPLIES}\n\n\n#edit`

    await $.prompt.submit({ text: withMessage, origin: BOX, wait: false })
    await $.prompt.submit({ text: 'edit', origin: BOX, wait: false })
    // The phone's box is not the one the mod can fill, and an app-written message is not the person's.
    await $.prompt.submit({ text: fromPhone, origin: { kind: 'bridge' }, wait: false })
    await $.prompt.submit({ text: fromPhone, origin: { kind: 'sdk' }, wait: false })

    expect(entered).toEqual([withMessage, 'edit', fromPhone, fromPhone])
    expect(fills).toEqual([])
  })
})

describe('the words are never lost', () => {
  test('a box that holds a draft is not written over; /replies back in front of the draft brings both back', async ($, on) => {
    const { fills, state, entered } = world(on, { box: 'a new thought' })
    const result = await $.prompt.submit({ text: `${REPLIES}\n\n\n#edit`, origin: BOX, wait: false })

    expect(reason(result)).toContain('was not empty')
    expect(entered).toEqual([])
    expect(fills).toEqual([])

    // While the draft is in the box, the command refuses rather than mixing the two.
    expect((await $.command.run(run(''))).text).toContain('not empty')
    // Sent in front of the draft, the app empties the box and hands the draft over.
    state.box = ''
    expect((await $.command.run(run('a new thought'))).text).toBe('Your replies are in the message box.')
    expect(state.box).toBe(`${EDITED}\n\n\na new thought`)
  })

  test('a fill that is not taken is tried again, one try after the other, and /replies back still has the text', async ($, on) => {
    const { fills, state, clock } = world(on, { fillFailures: 2 })
    const result = await $.prompt.submit({ text: `${REPLIES}\n\n\n#edit`, origin: BOX, wait: false })

    expect(reason(result)).toContain('could not be put into the message box')
    await clock.advance(800)
    expect(fills).toEqual([])
    await clock.advance(2600)
    expect(fills).toEqual([`append:${IN_BOX}`])
    expect(state.box).toBe(IN_BOX)

    await clock.advance(10000)
    expect(fills.length).toBe(1)
  })

  test('replies of a second stop join the ones still waiting', async ($, on) => {
    const { state } = world(on, { box: 'a draft', fillFailures: 0 })

    await $.prompt.submit({ text: `${REPLIES}\n\n\n#edit`, origin: BOX, wait: false })
    await $.prompt.submit({ text: `${OTHER}\n\n\n#edit`, origin: BOX, wait: false })
    state.box = ''
    await $.command.run(run(''))

    expect(state.box).toContain(QUOTE_ONE)
    expect(state.box).toContain('A second passage that was quoted later.')
    expect(numbered(state.box.trim())?.count).toBe(3)
  })

  test('another message that opens with a bare marker does not throw the waiting replies away', async ($, on) => {
    const { state, entered } = world(on, { box: 'a draft' })

    await $.prompt.submit({ text: `${REPLIES}\n\n\n#edit`, origin: BOX, wait: false })
    // The app's own single reply: a bare marker, a quote, a comment.
    await $.prompt.submit({ text: '<!-- reply -->\n> Something else entirely.\n\nYes.', origin: BOX, wait: false })
    expect(entered).toEqual(['<!-- reply 1 -->\n> Something else entirely.\n\nYes.'])

    state.box = ''
    expect((await $.command.run(run(''))).text).toBe('Your replies are in the message box.')
    expect(state.box).toBe(IN_BOX)
  })

  test('/replies back with nothing waiting says so', async ($, on) => {
    world(on)

    expect((await $.command.run(run(''))).text).toContain('Nothing is waiting')
  })
})
