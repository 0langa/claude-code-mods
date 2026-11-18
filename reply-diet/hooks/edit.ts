// Reading and rewriting the text the desktop app sends for a message with
// replies. Pure functions, no engine.
//
// As the app sends it:
//
//   <!-- reply 2 -->
//   > the first quote
//
//   the comment on it
//
//   <!-- reply -->
//   > the second quote
//
//   the comment on it
//
//
//   what was typed as the message
//
// The first marker carries the number of replies, the others are bare, and the
// typed message follows after two blank lines. With a file attached, the app
// puts a line for it in front of the first marker.

// The first marker, at the start of the text or of a line, with its quote line.
const NUMBERED_LEAD = /(?:^|\n)(<!-- reply [1-9][0-9]? -->)(?=\n>)/
const BARE_LEAD = /^<!-- reply -->(?=\n>)/
const BARE = '<!-- reply -->'
// Each reply block opens with a marker at the start or after a blank line, and a quote line.
const BLOCK = /(?:^|\n\n)<!-- reply(?: [1-9][0-9]?)? -->\n>/g
const TYPED = '\n\n\n'
// With the number sign, so the word "edit" alone stays an ordinary message. (A
// leading slash would not do: the app takes those for itself.)
const KEYWORD = /^#edit[.!]?$/i
const MAX_REPLIES = 99

export type Sent = {
  // What the app put in front of the replies (a line for an attached file); usually ''.
  prefix: string
  // The reply blocks, markers included, without the typed message.
  replies: string
  // What the person typed as the message; '' when there is none.
  typed: string
  count: number
}

// A message with replies, as the app sends it, in its parts. Undefined for any
// other text.
export const splitSent = (text: string): Sent | undefined => {
  const lead = NUMBERED_LEAD.exec(text)

  if (lead === null) {
    return undefined
  }
  const start = lead.index + lead[0].length - (lead[1]?.length ?? 0)
  const body = text.slice(start)
  const end = body.indexOf(TYPED)
  const replies = end === -1 ? body : body.slice(0, end)

  return { prefix: text.slice(0, start), replies, typed: end === -1 ? '' : body.slice(end + TYPED.length), count: (replies.match(BLOCK) ?? []).length }
}

// The typed message asks for the replies back when its last paragraph is the
// keyword alone ("#edit"). `rest` is what was typed
// before it, which stays the message.
export const askedForEdit = (typed: string) => {
  const trimmed = typed.trim()
  const cut = trimmed.lastIndexOf('\n\n')
  const last = cut === -1 ? trimmed : trimmed.slice(cut + 2)

  return KEYWORD.test(last.trim()) ? { rest: cut === -1 ? '' : trimmed.slice(0, cut).trimEnd() } : undefined
}

// The replies as text for the message box. The app's composer escapes a
// numbered marker in typed text when it sends ("<" becomes "&lt;") and leaves a
// bare one alone, so the first marker goes in bare. The text ends in two blank
// lines, or in what was typed besides the keyword: what the person adds below
// that is the message, not part of the last comment.
export const editable = (replies: string, rest = '') => `${replies.replace(/^<!-- reply [1-9][0-9]? -->/, BARE)}${TYPED}${rest}`

// The edited text on its way back: a message that opens with a bare marker and
// a quote gets the number of its blocks, which makes it a message with replies
// again for everything behind this mod. Undefined for any other text.
export const numbered = (text: string) => {
  if (!BARE_LEAD.test(text)) {
    return undefined
  }
  // Two blank lines end the replies for the app. Inside the replies, where the
  // person may have left some while editing, they would cut the later replies
  // off: up to the last block they become one blank line.
  const last = text.lastIndexOf(`\n\n${BARE}\n>`)
  const tidy = last === -1 ? text : `${text.slice(0, last).replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '')}${text.slice(last)}`
  const end = tidy.indexOf(TYPED)
  const count = ((end === -1 ? tidy : tidy.slice(0, end)).match(BLOCK) ?? []).length

  return count >= 1 && count <= MAX_REPLIES ? { text: `<!-- reply ${count} -->${tidy.slice(BARE.length)}`, count } : undefined
}

const quoteLines = (text: string) => text.split('\n').filter(line => line.startsWith('>') && line.length > 8)

// Whether a text holds at least one of the quotes of another: how a message is
// known to come from the replies that were put into the box, and how the box
// is known to still hold them (the person may already be editing).
export const sharesQuote = (text: string, replies: string) => {
  const lines = new Set(text.split('\n'))

  return quoteLines(replies).some(line => lines.has(line))
}
