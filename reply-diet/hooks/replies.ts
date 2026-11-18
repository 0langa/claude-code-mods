// The desktop app's Reply feature writes each attached reply into the message
// before it is sent:
//
//   <!-- reply 2 -->        the first block carries the number of replies
//   > the quoted passage
//
//   the comment
//
//   <!-- reply -->          every later block
//   > another passage
//
//   its comment
//
// and, after two empty lines, the typed message. A long quoted passage costs
// tokens a second time: the conversation already holds it. Here such a quote is
// cut down to its first and last words. Markers, comments and the typed message
// are never touched, so the app still draws the replies and the model still
// knows what each comment is about.

// A shortened quote keeps this many words at its start and at its end. Each may
// grow, up to its limit, until the quote can only mean the passage it came from.
const HEAD_WORDS = 8
const HEAD_LIMIT = 16
const TAIL_WORDS = 5
const TAIL_LIMIT = 12
// A quote is only shortened when at least this many words go.
const MIN_WORDS_CUT = 8
// A very long conversation is searched from its end, this many characters back.
const MAX_SEARCH_CHARS = 2_000_000

const FIRST_MARKER = /^<!-- reply [1-9][0-9]? -->\n>/
// A marker line and the quoted lines beneath it.
const QUOTED = /(^|\n\n)(<!-- reply(?: [1-9][0-9]?)? -->\n)((?:>(?: [^\n]*)?(?:\n|$))+)/g
// The replies end where the typed message begins.
const TYPED_MESSAGE = '\n\n\n'

// What a drawn message no longer shows of the Markdown it was drawn from: a
// link's target, a list item's number, a code fence's language.
const unmark = (text: string) =>
  text
    .replace(/\]\([^)\s]*\)/g, ']')
    .replace(/^[ \t]*\d+[.)][ \t]+/gm, '')
    .replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm, '')

// Letters and digits only, so a passage copied from the drawn message is found
// in its Markdown source: **, `, |, quotation marks and spacing all go.
const fold = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

// The messages as one string to search. A line break never survives fold(), so
// a passage cannot be found across two messages.
export const searchable = (messages: readonly string[]) => {
  const joined = messages.map(message => fold(unmark(message))).join('\n')

  return joined.length > MAX_SEARCH_CHARS ? joined.slice(-MAX_SEARCH_CHARS) : joined
}

const positions = (text: string, part: string) => {
  const found: number[] = []

  for (let at = text.indexOf(part); at !== -1; at = text.indexOf(part, at + 1)) {
    found.push(at)
  }

  return found
}

// The quote as "first words [… N words …] last words", or undefined when it
// stays as it is: too short to gain anything, not in the conversation (the
// model could not look the rest up), or not unmistakable once shortened.
export const shorten = (quote: string, conversation: string): string | undefined => {
  const words = unmark(quote).split(/\s+/).filter(word => word !== '')

  if (words.length < HEAD_WORDS + TAIL_WORDS + MIN_WORDS_CUT) {
    return undefined
  }
  const folded = words.map(fold)
  const whole = folded.join('')
  const firstWords = folded.slice(0, HEAD_WORDS).join('')

  if (whole === '' || firstWords === '') {
    return undefined
  }
  const found = positions(conversation, whole).length

  if (found === 0) {
    return undefined
  }
  const starts = positions(conversation, firstWords)

  for (let head = HEAD_WORDS; head <= HEAD_LIMIT; head += 1) {
    const opening = folded.slice(0, head).join('')

    // The opening words must occur nowhere but at the start of this passage.
    if (starts.filter(at => conversation.startsWith(opening, at)).length !== found) {
      continue
    }
    for (let tail = TAIL_WORDS; tail <= TAIL_LIMIT; tail += 1) {
      const cut = words.length - head - tail

      if (cut < MIN_WORDS_CUT) {
        break
      }
      const closing = folded.slice(-tail).join('')

      // Read on from the opening, the closing words must first come at the very end.
      if (closing !== '' && whole.indexOf(closing, opening.length) === whole.length - closing.length) {
        return `${words.slice(0, head).join(' ')} [… ${cut} words …] ${words.slice(-tail).join(' ')}`
      }
    }
  }

  return undefined
}

export const isReplyMessage = (text: string) => FIRST_MARKER.test(text)

export type Diet = { text: string; quotes: number; savedChars: number }

// The message with every quote that can be shortened cut down. `conversation`
// is what searchable() made of the messages the model can still read.
export const dietReplies = (text: string, conversation: string): Diet => {
  if (!isReplyMessage(text)) {
    return { text, quotes: 0, savedChars: 0 }
  }
  const end = text.indexOf(TYPED_MESSAGE)
  const replies = end === -1 ? text : text.slice(0, end)
  let quotes = 0

  const slim = replies.replace(QUOTED, (block: string, lead: string, marker: string, lines: string) => {
    const quote = lines
      .split('\n')
      .map(line => line.replace(/^> ?/, ''))
      .join('\n')
      .trim()
    const short = shorten(quote, conversation)

    if (short === undefined || short.length >= quote.length) {
      return block
    }
    quotes += 1

    return `${lead}${marker}> ${short}${lines.endsWith('\n') ? '\n' : ''}`
  })
  const result = end === -1 ? slim : slim + text.slice(end)

  return { text: result, quotes, savedChars: text.length - result.length }
}
