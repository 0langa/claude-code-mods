import type { EngineInterface, Register } from 'claude-code'

import { BROKEN_REASON, holdsRepliesOf, putBack, stopOrPass } from './back'
import { dietReplies, isReplyMessage, searchable } from './replies'
import { rememberPair, sentFor } from './shown'

// Rough size of a token for English text.
const CHARS_PER_TOKEN = 4

const isEnabled = async ($: EngineInterface) => (await $.store.get('enabled')) !== false

const count = async ($: EngineInterface, key: string) => Number(await $.store.get(key)) || 0

// The message as typed and as sent, for the message row, and the running totals
// for /replies. Neither may ever get in the way of a prompt.
const record = async ($: EngineInterface, typed: string, sent: string, quotes: number, savedChars: number) => {
  try {
    await rememberPair($, typed, sent)
    await $.store.set('quotes', (await count($, 'quotes')) + quotes)
    await $.store.set('messages', (await count($, 'messages')) + 1)
    await $.store.set('savedChars', (await count($, 'savedChars')) + savedChars)
  } catch {
    // ignored on purpose
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'replies',
      description: 'Reply diet: on, off, how much it has saved, or back (replies of a stopped send into the message box again)',
      argumentHint: '[on|off|back]',
      immediate: true,
    })

    return next(e)
  })

  on('command.run', { command: 'replies' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const back = /^back(?:\s+([\s\S]*))?$/i.exec(e.args.trim())

    if (back !== null) {
      return { text: await putBack($, (back[1] ?? '').trim()) }
    }

    if (arg === 'on' || arg === 'off') {
      await $.store.set('enabled', arg === 'on')

      return { text: `Reply diet: ${arg}.` }
    }
    const quotes = await count($, 'quotes')
    const messages = await count($, 'messages')
    const tokens = Math.round((await count($, 'savedChars')) / CHARS_PER_TOKEN)
    const state = (await isEnabled($)) ? 'on' : 'off'

    const shortened = `${quotes} ${quotes === 1 ? 'quote' : 'quotes'} in ${messages} ${messages === 1 ? 'message' : 'messages'}`

    return {
      text: `Reply diet is ${state}. It has shortened ${shortened}, about ${tokens} tokens in all. Use /replies on or /replies off. To edit attached replies, send #edit as the message.`,
    }
  })

  // A message you sent is drawn as Claude got it: with its quotes shortened.
  // Only the drawing changes. A message that was not shortened is drawn as the
  // app draws it.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const sent = await sentFor($, e.props.text)

    return sent === undefined ? next(e) : next({ ...e, props: { ...e.props, text: sent } })
  })

  on('prompt.submit', async ($, incoming, next) => {
    if (incoming.command !== undefined || incoming.isMeta === true) {
      return next(incoming)
    }
    // First of all: "#edit" stops the send and puts the replies back into the
    // box, and edited replies get their number back. Works with the diet off.
    const passed = await stopOrPass($, incoming, next.signal)

    if ('drop' in passed) {
      return passed
    }
    const e = passed.text === incoming.text ? incoming : { ...incoming, text: passed.text }

    if (!isReplyMessage(e.text) || !(await isEnabled($))) {
      return next(e)
    }
    let slim

    try {
      // Claude's own messages, as far as they are still in the conversation: a
      // quote is only shortened when Claude can look the rest of it up there.
      const rows = await $.session.messages()

      slim = dietReplies(e.text, searchable(rows.filter(row => row.role === 'assistant').map(row => row.text)))
    } catch (error) {
      // Silent when it works. A failure is worth a word: the message still goes out, as typed.
      $.ui.toast(`Reply diet: the quotes were not shortened (${String(error).slice(0, 120)}). The message went out as typed.`)

      return next(e)
    }
    if (slim.quotes === 0) {
      return next(e)
    }
    await record($, e.text, slim.text, slim.quotes, slim.savedChars)

    return next({ ...e, text: slim.text })
    // The hook broke or ran out of time. A send that was being stopped stays
    // stopped while the replies are kept here; anything else goes out.
  }).catch(($, e, next) => (!next.called && holdsRepliesOf(e) ? { drop: BROKEN_REASON } : next(e)))
}
