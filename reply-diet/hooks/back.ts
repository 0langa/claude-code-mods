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
import { askedForEdit, editable, numbered, sharesQuote, splitSent } from './edit'

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
        await keep($, { text, isInBox: true })

        return 'filled'
      }

      return 'box holds something'
    }
    // "append" adds plain paragraphs. "replace" would turn lines that look like
    // a list or a code fence into one, and the text must come back as it was.
    const filled = await $.prompt.fill({ text, mode: 'append' })

    if (filled.isFilled) {
      await keep($, { text, isInBox: true })
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

        if (held.text !== '' && !held.isInBox && (await fillEmptyBox($, held.text)) === 'not taken') {
          retryLater($, round + 1)
        }
      } catch {
        // The text stays kept; /replies back still has it.
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

// What becomes of a prompt before anything else looks at it: stopped (the
// replies go back into the box), or let through with the text to go on with,
// which is the edited text with its number back, or the text as it came.
export async function stopOrPass($: EngineInterface, e: Prompt, signal: AbortSignal): Promise<{ drop: string } | { text: string }> {
  if (!isAtBox(e.origin)) {
    return { text: e.text }
  }
  const back = numbered(e.text)

  // The edited text on its way back. The kept copy goes only when this message
  // carries its quotes; another message that opens with a bare marker (the
  // app's own single reply) leaves it waiting.
  if (back !== undefined) {
    const held = await waiting($)

    if (held.text !== '' && sharesQuote(e.text, held.text)) {
      retry?.cancel()
      retry = undefined
      await keep($, NOTHING)
    }

    return { text: back.text }
  }
  const sent = splitSent(e.text)
  const asked = sent === undefined ? undefined : askedForEdit(sent.typed)

  if (sent === undefined || asked === undefined) {
    return { text: e.text }
  }
  // Replies of an earlier stop that never reached the box are still waiting:
  // the new ones join them.
  const earlier = await waiting($)
  const fresh = editable(sent.replies, asked.rest)
  const text = earlier.text !== '' && !earlier.isInBox && !sharesQuote(earlier.text, fresh) ? `${earlier.text.trimEnd()}\n\n${fresh}` : fresh

  kept = text
  keptFrom = e.text
  // From here the send is stopped whatever happens: the text is kept, and
  // "#edit" must not go out as a message.
  let outcome: Filled = 'not taken'

  try {
    await keep($, { text, isInBox: false })
    // An early Stop makes the app put the cards and the text back itself: no fill then.
    if (!signal.aborted) {
      outcome = await fillEmptyBox($, text)
      if (outcome === 'not taken' && !signal.aborted) {
        retryLater($, 0)
      }
    }
  } catch {
    // The reason below says where the text is.
  }

  return { drop: reasonFor(outcome, sent.prefix !== '' || (e.attachments?.length ?? 0) > 0) }
}

// For the hook's `.catch`: whether the replies of this very message are kept
// here. Then the send stays stopped; otherwise the message goes out, because a
// message that reaches Claude can be taken back and one that is dropped is gone.
export const holdsRepliesOf = (e: Prompt) => {
  const sent = isAtBox(e.origin) ? splitSent(e.text) : undefined

  return kept !== '' && keptFrom === e.text && sent !== undefined && askedForEdit(sent.typed) !== undefined
}

export const BROKEN_REASON = `Not sent. Something went wrong while your replies were put back.${BACK_HINT}`

// /replies back: the waiting replies go into the box again. What stood behind
// the command was the person's draft: it goes under the replies as the
// message, so the replies stay first and are sent as replies.
export async function putBack($: EngineInterface, draft: string) {
  const held = await waiting($)

  if (held.text === '') {
    return 'Nothing is waiting: no send has been stopped, or its replies were sent.'
  }
  retry?.cancel()
  const box = await $.prompt.read()

  if (box.text.trim() !== '') {
    return 'Your message box is not empty. Put /replies back at the very start of that text and send it: the text comes back under the replies.'
  }
  const text = draft === '' ? held.text : `${held.text.trimEnd()}\n\n\n${draft}`
  const filled = await $.prompt.fill({ text, mode: 'append' })

  if (filled.isFilled) {
    await keep($, { text, isInBox: true })
  }

  return filled.isFilled ? 'Your replies are in the message box.' : 'The message box did not take the text. Try again in a moment.'
}
