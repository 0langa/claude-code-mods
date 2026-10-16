// The free, instant part of the cleanup: filler sounds and stuttered words,
// removed by rules. Code, URLs and paths are left exactly as they were.

// Spoken filler sounds only. Words like "like" or "basically" can carry
// meaning, so those are left to the model pass.
const FILLER = /(,?)([ \t]*)(?<![\p{L}\p{N}'-])(u+h+|u+h+m+|u+m+|a+h+|e+r|e+r+m+|h+m+|ä+h+m*|ö+h+m*)(?![\p{L}\p{N}'-])(,|…|\.\.\.)?([ \t]*)/giu

// Words people repeat on purpose ("no, no", "very very"), kept as said.
const KEEP_REPEATED = new Set(['no', 'yes', 'very', 'so', 'bye', 'ha', 'haha', 'la', 'really', 'that', 'had', 'is', 'knock', 'tick', 'chop', 'well'])

// "I want I want" and "if the changes land, if the changes land": a phrase of up to eight words said twice or more.
const REPEATED_PHRASE = /(?<![\p{L}\p{N}'-])(\p{L}[\p{L}']*(?:[ \t]+\p{L}[\p{L}']*){1,7})(?:,?[ \t]+\1)+(?![\p{L}\p{N}'-])/giu
const REPEATED_WORD = /(?<![\p{L}\p{N}'-])(\p{L}[\p{L}']*)(?:,?[ \t]+\1)+(?![\p{L}\p{N}'-])/giu

// Fenced and inline code, and any token holding a slash, backslash or @
// (URLs, file paths, emails, "and/or").
const PROTECTED = /```[\s\S]*?```|`[^`\n]*`|\S*[\/\\@]\S*/g

const CAPITALIZE = '\u0001'
const SLOT_OPEN = '\u0002'
const SLOT_CLOSE = '\u0003'

const isSentenceStart = (before: string) => /(^|\n)[ \t]*$/.test(before) || /[.!?][ \t]*$/.test(before)

export const countWords = (text: string) => {
  const trimmed = text.trim()

  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

// Swaps code, URLs and paths for placeholders so a rewrite cannot touch them;
// `restore` puts them back. A placeholder holds control characters, which no
// word pattern matches.
export const shield = (text: string) => {
  const kept: string[] = []
  const shielded = text.replace(PROTECTED, token => {
    kept.push(token)

    return `${SLOT_OPEN}${kept.length - 1}${SLOT_CLOSE}`
  })
  const restore = (value: string) =>
    value.replace(new RegExp(`${SLOT_OPEN}(\\d+)${SLOT_CLOSE}`, 'g'), (_match: string, index: string) => kept[Number(index)] ?? '')

  return { shielded, restore }
}

export const hasShieldSlot = (text: string) => text.includes(SLOT_OPEN)

export const filterFillers = (text: string) => {
  const { shielded, restore } = shield(text)

  const withoutFillers = shielded.replace(
    FILLER,
    (match: string, lead: string, gapBefore: string, _word: string, trail: string | undefined, gapAfter: string, offset: number, whole: string) => {
      const before = whole.slice(0, offset)
      const after = whole.slice(offset + match.length)

      // Right before punctuation or the end of a line: drop it with its commas.
      if (after === '' || /^[\n.!?;:)]/.test(after)) {
        return ''
      }
      if (isSentenceStart(before)) {
        return `${gapBefore === '' ? '' : ' '}${CAPITALIZE}`
      }
      // ", uh," : both commas were the pause around the filler.
      if (lead === ',') {
        return trail === ',' ? ' ' : ', '
      }

      return gapBefore === '' && gapAfter === '' ? '' : ' '
    },
  )

  const withoutRepeats = withoutFillers
    .replace(REPEATED_PHRASE, (match: string, phrase: string) => phrase)
    .replace(REPEATED_WORD, (match: string, word: string) => (KEEP_REPEATED.has(word.toLowerCase()) ? match : word))

  const tidied = withoutRepeats
    .replace(/,[ \t]*,/g, ',')
    .replace(/(\S)[ \t]{2,}(?=\S)/g, '$1 ')
    .replace(new RegExp(`${CAPITALIZE}[ \\t]*(\\p{Ll})`, 'gu'), (_match: string, letter: string) => letter.toUpperCase())
    .replaceAll(CAPITALIZE, '')

  return restore(tidied)
}
