// Editing replies that are already attached. With replies attached, "#edit" as
// the message stops the send and puts the replies into the message box as
// text; the edited text is sent as a message with replies again.
//
// By the time a prompt.submit hook runs, the app has emptied the message box
// and removed the reply cards, and it puts nothing back after a stopped send.
// So from the stop on, the text exists only here. Everything below follows
// from that: the text is kept before anything else is tried, it is never
// written over a box that holds something, and it is given up only once it is
// seen going out.
// Functions that take `$` are declarations, which is the form the engine follows.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptOrigin, Timer } from 'claude-code'

import type { Stash } from '../types'
import { askedForEdit, bareBlocks, carriesAll, editable, keepsQuotes, numbered, sharesLine, sharesQuote, splitSent } from './edit'

const NOTHING: Stash = { text: '', isInBox: false }

const stash = atom({ plugin: 'reply-diet', key: 'stash' } as const, NOTHING)

// How long after a fill that did not land the next one is tried.
const RETRY_MS = [700, 2500]

const BACK_HINT = ' Put /replies back at the very start of the message box and send it.'

// The person at the message box of this computer. The engine marks a message
// typed there `composer`. Not `bridge` (the phone: its box is not the one this
// mod can fill), and not `sdk` (written by the app or a program).
const isAtBox = (origin: PromptOrigin) => origin.kind === 'composer'

// A second copy of the waiting text, set before the first await: it is still
// there when a write to the session's state fails. (A reload loses it; the
// state copy survives that.) `keptFrom` is the message it was taken from.
let kept = ''
let keptFrom = ''
let isFilling = false
let retry: Timer | undefined
// The edited text this mod numbered last, for the hook's `.catch`: a message
// that breaks the hook after that still goes out numbered.
let numberedLast = { from: '', to: '' }

async function waiting($: EngineInterface): Promise<Stash> {
  try {
    const held = await read($, stash)

    return held.text === '' && kept !== '' ? { text: kept, isInBox: false } : held
  } catch {
    return { text: kept, isInBox: false }
  }
}

async function keep($: EngineInterface, value: Stash) {
  kept = value.text
  try {
    await update($, stash, () => value)
  } catch {
    // `kept` still has it.
  }
}

type Filled = 'filled' | 'box holds something' | 'not taken' | 'busy'

// A fill landed. While it was on its way, a second stop may have joined more
// replies to the kept text: then that text is still waiting, not in the box.
async function markInBox($: EngineInterface, text: string) {
  if (kept !== text) {
    return
  }
  try {
    await update($, stash, held => (held.text === text ? { text, isInBox: true } : held))
  } catch {
    // Still kept, only not marked as in the box.
  }
}

// The kept replies were sent: nothing waits any more.
export async function release($: EngineInterface) {
  retry?.cancel()
  retry = undefined
  await keep($, NOTHING)
}

// Puts the text into the box when the box is empty. Never over the person's
// own text, and never while another fill of this mod is still on its way.
async function fillEmptyBox($: EngineInterface, text: string): Promise<Filled> {
  if (isFilling) {
    return 'busy'
  }
  isFilling = true
  try {
    const box = await $.prompt.read()

    if (box.text.trim() !== '') {
      // A late write of an earlier fill: the text is where it belongs.
      if (sharesQuote(box.text, text)) {
        await markInBox($, text)

        return 'filled'
      }

      return 'box holds something'
    }
    // "append" adds plain paragraphs. "replace" would turn lines that look like
    // a list or a code fence into one, and the text must come back as it was.
    const filled = await $.prompt.fill({ text, mode: 'append' })

    if (filled.isFilled) {
      await markInBox($, text)
    }

    return filled.isFilled ? 'filled' : 'not taken'
  } finally {
    isFilling = false
  }
}

// A fill that did not land is tried again, one try after the other. A fill that
// landed is never repeated: the box may be empty again because the person sent
// the text.
function retryLater($: EngineInterface, round: number) {
  const ms = RETRY_MS[round]

  if (ms === undefined) {
    return
  }
  retry?.cancel()
  retry = $.clock.after(ms, () => {
    void (async () => {
      try {
        const held = await waiting($)

        const outcome = held.text !== '' && !held.isInBox ? await fillEmptyBox($, held.text) : 'filled'

        if (outcome === 'not taken' || outcome === 'busy') {
          retryLater($, round + 1)
        }
      } catch {
        // The text stays kept; /replies back still has it.
        retryLater($, round + 1)
      }
    })()
  })
}

const reasonFor = (outcome: Filled, hasFiles: boolean) =>
  (outcome === 'filled'
    ? 'Not sent. Your replies are back in the message box as text: edit them and send again.'
    : outcome === 'box holds something'
      ? `Not sent. Your message box was not empty, so your replies were not put there.${BACK_HINT} What is in the box comes back under the replies.`
      : `Not sent. Your replies could not be put into the message box.${BACK_HINT}`) + (hasFiles ? ' Files and pictures that were attached are not kept: attach them again.' : '')

type Prompt = { text: string; origin: PromptOrigin; attachments?: readonly unknown[] }

// Let through: the text to go on with (the edited text with its number back,
// or the text as it came); `release` when, once it has gone out, the kept
// replies are sent; `mayShorten` false when the person changed a quote, which
// the diet must then leave as written.
type Passed = { text: string; release: boolean; mayShorten: boolean }

// What becomes of a prompt before anything else looks at it: stopped (the
// replies go back into the box), or let through.
export async function stopOrPass($: EngineInterface, e: Prompt, signal: AbortSignal): Promise<{ drop: string } | Passed> {
  const as = { text: e.text, release: false, mayShorten: true }

  if (!isAtBox(e.origin)) {
    return as
  }
  const back = numbered(e.text)
  // "#edit" under replies already in the box stops the send too.
  const sent = splitSent(back?.text ?? e.text)
  const asked = sent === undefined ? undefined : askedForEdit(sent.typed)

  if (sent === undefined) {
    return as
  }
  if (asked === undefined) {
    const held = await waiting($)
    const ours = held.text !== '' && (sharesQuote(e.text, held.text) || (back !== undefined && sharesLine(e.text, held.text)))
    // The kept copy goes only once a message has carried its replies out: the
    // text from the box, or all of its quotes (the cards the app put back
    // after an early Stop).
    const release = ours && (held.isInBox || carriesAll(e.text, held.text))

    if (back === undefined) {
      return { ...as, release }
    }
    // The app's own single reply, not from the box: the app draws it as it is.
    if (!ours && bareBlocks(e.text) === 1) {
      return as
    }
    numberedLast = { from: e.text, to: back.text }

    return { text: back.text, release, mayShorten: !ours || keepsQuotes(e.text, held.text) }
  }
  // Replies of an earlier stop that never reached the box are still waiting:
  // the new ones join them, unless this is the same stop again.
  const earlier = await waiting($)
  const fresh = editable(sent.replies, asked.rest)
  const text = earlier.text !== '' && !earlier.isInBox && !earlier.text.includes(fresh.trimEnd()) ? `${earlier.text.trimEnd()}\n\n${fresh}` : fresh

  kept = text
  keptFrom = e.text
  // From here the send is stopped whatever happens: the text is kept, and
  // "#edit" must not go out as a message.
  let outcome: Filled = 'not taken'

  try {
    await keep($, { text, isInBox: false })
    // An early Stop makes the app put the cards and the text back itself: no
    // fill then, and what waited before waits as it was.
    if (signal.aborted) {
      await keep($, earlier)
    } else {
      outcome = await fillEmptyBox($, text)
    }
  } catch {
    // The reason below says where the text is.
  }
  if (!signal.aborted && (outcome === 'not taken' || outcome === 'busy')) {
    retryLater($, 0)
  }

  return { drop: reasonFor(outcome, sent.prefix !== '' || (e.attachments?.length ?? 0) > 0) }
}

// For the hook's `.catch`: whether the replies of this very message are kept
// here. Then the send stays stopped; otherwise the message goes out, because a
// message that reaches Claude can be taken back and one that is dropped is gone.
export const holdsRepliesOf = (e: Prompt) => {
  const sent = isAtBox(e.origin) ? splitSent(numbered(e.text)?.text ?? e.text) : undefined

  return kept !== '' && keptFrom === e.text && sent !== undefined && askedForEdit(sent.typed) !== undefined
}

export const BROKEN_REASON = `Not sent. Something went wrong while your replies were put back.${BACK_HINT}`

// For the hook's `.catch`: the text to let through, numbered when this mod
// had numbered it before the hook broke.
export const passing = (text: string) => (numberedLast.from === text ? numberedLast.to : text)

// /replies back: the waiting replies go into the box again. What stood behind
// the command was the person's draft: it goes under the replies as the
// message, so the replies stay first and are sent as replies.
export async function putBack($: EngineInterface, draft: string) {
  const held = await waiting($)

  if (held.text === '') {
    return 'Nothing is waiting: no send has been stopped, or its replies were sent.'
  }
  // The draft behind the command exists nowhere else now: it is kept with the
  // replies before anything is tried.
  const text = draft === '' ? held.text : `${held.text.trimEnd()}\n\n\n${draft}`

  retry?.cancel()
  await keep($, { text, isInBox: false })
  let outcome: Filled = 'not taken'

  try {
    outcome = await fillEmptyBox($, text)
  } catch {
    // Answered below.
  }

  return outcome === 'filled'
    ? 'Your replies are in the message box.'
    : outcome === 'box holds something'
      ? 'Your message box is not empty. Put /replies back at the very start of that text and send it: the text comes back under the replies.'
      : 'The message box did not take the text. Try /replies back again in a moment.'
}
