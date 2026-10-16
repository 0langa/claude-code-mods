// Spoken quotation marks, turned into the marks themselves. Free and instant;
// code, URLs and paths are never touched.

import { shield } from './clean'

const WORD = String.raw`\p{L}[\p{L}\p{N}'_-]*`

// "quote unquote compress" -> "compress". Just the next word, or "the"/"a" and
// the word after it ("quote unquote the cloud" -> "the cloud").
const QUOTE_ONE = new RegExp(String.raw`(?<![\p{L}\p{N}])quote[\s,-]+unquote[\s,]+((?:(?:a|an|the)\s+)?${WORD})`, 'giu')

// "quote this phrase unquote", also "open quote ... close quote" or "... end
// quote". An end marker is required, so the noun "a quote" is never touched.
const QUOTE_PAIR = /(?<![\p{L}\p{N}])(?:open\s+)?quote[\s,]+([^\n]{1,160}?)[\s,]+(?:unquote|un-quote|end[\s-]+quote|close[\s-]+quote)(?![\p{L}\p{N}])/giu

export const applyQuotes = (text: string) => {
  if (!/quote/i.test(text)) {
    return text
  }

  const { shielded, restore } = shield(text)
  const single = shielded.replace(QUOTE_ONE, (_match: string, word: string) => `"${word}"`)
  const paired = single.replace(QUOTE_PAIR, (match: string, inner: string) =>
    /(?<![\p{L}\p{N}])quote(?![\p{L}\p{N}])/iu.test(inner) ? match : `"${inner.trim()}"`,
  )

  return restore(paired)
}
