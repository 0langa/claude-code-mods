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
// A bare first marker with a quote line as the app's parser takes one ("> " or
// ">" alone), behind the lines the app puts in front for files attached again.
const BARE_LEAD = /^((?:@[^\n]*\n)*)<!-- reply -->(?=\n>(?: |\n|$))/
const BARE_MARKER = /(?:^|\n)<!-- reply -->\n(?=>(?: |\n|$))/g
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

// A reply as the person left it in the box: its quote lines and its comment.
type Block = { quote: string[]; comment: string }

// A line of a quote, as the app's parser takes it: ">" and a space, or ">" alone.
const QUOTE_LINE = /^>(?: |$)/

const quoteRun = (lines: string[]) => {
  let n = 0

  while (n < lines.length && QUOTE_LINE.test(lines[n] ?? '')) {
    n += 1
  }

  return n
}

// Where the quote at the start of a block's text ends.
const quoteLength = (body: string) => {
  const lines = body.split('\n')

  return lines.slice(0, quoteRun(lines)).join('\n').length
}

const block = (body: string): Block => {
  const lines = body.split('\n')
  const n = quoteRun(lines)

  // A blank quote line goes out as the app writes it, "> ": ">" alone in the
  // middle of a text would end the quote for the app's parser.
  return { quote: lines.slice(0, n).map(line => (line === '>' ? '> ' : line)), comment: lines.slice(n).join('\n').replace(/^\n+|\n+$/g, '').replace(/\n{3,}/g, '\n\n') }
}

// The app's parser goes on after a quote only when a comment follows. A reply
// whose comment the person deleted, anywhere but last, would end the replies
// there and leave every later one drawn as plain text. The app itself never
// sends such a reply. So its quote goes to the top of the next reply's quote,
// as one passage with a blank quote line between: nothing is lost, the comment
// below covers both, and the message is drawn as replies. The last reply may
// have no comment: the parser draws that one as it is.
const joined = (blocks: Block[]) => {
  const out: Block[] = []
  let carried: string[] = []

  blocks.forEach((b, i) => {
    const quote = carried.length === 0 ? b.quote : [...carried, '> ', ...b.quote]

    if (b.comment === '' && i < blocks.length - 1) {
      carried = quote
    } else {
      out.push({ quote, comment: b.comment })
      carried = []
    }
  })

  return out
}

// The edited text on its way back: a message that opens with a bare marker and
// a quote gets the number of its blocks, which makes it a message with replies
// again for everything behind this mod. Undefined for any other text.
export const numbered = (whole: string) => {
  const lead = BARE_LEAD.exec(whole)

  if (lead === null) {
    return undefined
  }
  const prefix = lead[1] ?? ''
  const text = whole.slice(prefix.length)
  // Each block opens with a marker line and a quote line. The last block's
  // comment ends at two blank lines; what follows is the typed message. Blank
  // lines before the last block belong to the replies, however many the person
  // left there while editing.
  const markers = [...text.matchAll(BARE_MARKER)]

  if (markers[0]?.index !== 0) {
    return undefined
  }
  const bodies = markers.map((m, i) => text.slice(m.index + m[0].length, markers[i + 1]?.index))
  const lastBody = bodies.pop() ?? ''
  // The typed message starts at the first two blank lines after the last quote.
  const end = lastBody.indexOf(TYPED, quoteLength(lastBody))
  const typed = end === -1 ? '' : lastBody.slice(end + TYPED.length)
  const blocks = joined([...bodies.map(block), block(end === -1 ? lastBody : lastBody.slice(0, end))])
  const count = blocks.length

  if (count < 1 || count > MAX_REPLIES) {
    return undefined
  }
  const replies = blocks.map((b, i) => `${i === 0 ? `<!-- reply ${count} -->` : BARE}\n${b.quote.join('\n')}${b.comment === '' ? '' : `\n\n${b.comment}`}`).join('\n\n')

  return { text: `${prefix}${typed === '' ? replies : `${replies}${TYPED}${typed}`}`, count }
}

// How many replies a text that opens with a bare marker holds as it came.
export const bareBlocks = (text: string) => [...text.matchAll(BARE_MARKER)].length

// The quote lines that tell a text apart: those with some length, or all of
// them when every quote is short.
const quoteLines = (text: string) => {
  const all = text.split('\n').filter(line => line.startsWith('>') && line.trim().length > 1)
  const long = all.filter(line => line.length > 8)

  return long.length > 0 ? long : all
}

// Whether a text holds any line of the replies kept, quote or comment: how an
// edited text is known to come from the box when the person changed its quotes.
export const sharesLine = (text: string, replies: string) => {
  const kept = replies.split('\n').filter(line => line.trim() !== '' && !line.startsWith('<!-- reply') && line.trim() !== '>')
  const lines = new Set(text.split('\n'))

  // A chance match only numbers a single reply, as 0.2.0 numbered every one.
  return kept.some(line => lines.has(line))
}

// Whether every quote line of a text stands as it was in the replies kept: the
// person changed no quote. Blank quote lines do not count; joining adds them.
export const keepsQuotes = (text: string, replies: string) => {
  const lines = new Set(replies.split('\n'))

  return text.split('\n').every(line => !line.startsWith('>') || line.trim() === '>' || lines.has(line))
}

// Whether every quote line of the replies kept is in a text: they were all sent.
export const carriesAll = (text: string, replies: string) => {
  const lines = new Set(text.split('\n'))

  return quoteLines(replies).every(line => lines.has(line))
}

// Whether a text holds at least one of the quotes of another: how a message is
// known to come from the replies that were put into the box, and how the box
// is known to still hold them (the person may already be editing).
export const sharesQuote = (text: string, replies: string) => {
  const lines = new Set(text.split('\n'))

  return quoteLines(replies).some(line => lines.has(line))
}
