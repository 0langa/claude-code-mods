// The free, instant part of the cleanup, done by rules: filler sounds, words
// and phrases that carry no information (the rules are in ./empty), and
// stuttered words. Code, URLs, paths and anything inside quotation marks are
// left exactly as they were.

import { isNamed, rulesFor, startsSentence } from './empty'
import type { Around, Rule } from './empty'

// Spoken filler sounds.
const SOUNDS = String.raw`u+h+|u+h+m+|u+m+|a+h+|e+r|e+r+m+|h+m+|ä+h+m*|ö+h+m*`

// Words people repeat on purpose ("no, no", "very very"), kept as said.
const KEEP_REPEATED = new Set(['no', 'yes', 'very', 'so', 'bye', 'ha', 'haha', 'la', 'really', 'that', 'had', 'is', 'knock', 'tick', 'chop', 'well'])

// "I want I want" and "if the changes land, if the changes land": a phrase of up to eight words said twice or more.
const REPEATED_PHRASE = /(?<![\p{L}\p{N}'-])(\p{L}[\p{L}']*(?:[ \t]+\p{L}[\p{L}']*){1,7})(?:,?[ \t]+\1)+(?![\p{L}\p{N}'-])/giu
const REPEATED_WORD = /(?<![\p{L}\p{N}'-])(\p{L}[\p{L}']*)(?:,?[ \t]+\1)+(?![\p{L}\p{N}'-])/giu

// Fenced and inline code, and any token holding a slash, backslash or @
// (URLs, file paths, emails, "and/or").
const CODE = '```[\\s\\S]*?```|`[^`\\n]*`'
const PATHS = String.raw`\S*[\/\\@]\S*`
// Words in quotation marks are named, not used: "the word "basically"".
const QUOTED = String.raw`"[^"\n]{1,80}"|“[^”\n]{1,80}”|„[^“”\n]{1,80}[“”]|«[^»\n]{1,80}»`
const PROTECTED = new RegExp(`${CODE}|${PATHS}`, 'g')
const PROTECTED_WITH_QUOTES = new RegExp(`${CODE}|${QUOTED}|${PATHS}`, 'g')

const CAPITALIZE = '\u0001'
const SLOT_OPEN = '\u0002'
const SLOT_CLOSE = '\u0003'
// Where something was taken out at the start of a sentence: punctuation left
// right behind it belonged to what is gone.
const REMOVED = '\u0004'
const MARKS = new RegExp(`[${CAPITALIZE}${REMOVED}]`, 'g')

export const countWords = (text: string) => {
  const trimmed = text.trim()

  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

// Swaps code, URLs and paths (and, when asked, quoted words) for placeholders
// so a rewrite cannot touch them; `restore` puts them back. A placeholder holds
// control characters, which no word pattern matches.
export const shield = (text: string, withQuotes = false) => {
  const kept: string[] = []
  const shielded = text.replace(withQuotes ? PROTECTED_WITH_QUOTES : PROTECTED, token => {
    kept.push(token)

    return `${SLOT_OPEN}${kept.length - 1}${SLOT_CLOSE}`
  })
  const restore = (value: string) =>
    value.replace(new RegExp(`${SLOT_OPEN}(\\d+)${SLOT_CLOSE}`, 'g'), (_match: string, index: string) => kept[Number(index)] ?? '')

  return { shielded, restore }
}

export const hasShieldSlot = (text: string) => text.includes(SLOT_OPEN)

const EDGE_BEFORE = String.raw`(?<![\p{L}\p{N}'’-])`
const EDGE_AFTER = String.raw`(?![\p{L}\p{N}'’-])`

// A phrase with the comma and the spaces on either side of it.
const framed = (core: string) => new RegExp(String.raw`(,?)([ \t]*)${EDGE_BEFORE}(${core})${EDGE_AFTER}(,|…|\.\.\.)?([ \t]*)`, 'giu')

// The pattern for a rule's phrases, the longest first.
const coreOf = (words: readonly string[]) =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map(word =>
      word
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/'/g, "['’]?")
        .replace(/ /g, '[ \\t]+'),
    )
    .join('|')

// A letter, a digit, or a placeholder for code.
const CONTENT = new RegExp(`[\\p{L}\\p{N}${SLOT_OPEN}]`, 'u')
const hasContent = (text: string) => CONTENT.test(text)

// Where the sentence around a phrase begins (in the text before it) and ends
// (in the text after it).
const sentenceStart = (before: string) =>
  /[.!?…]["')\]]*$/.test(before) ? before.length : Math.max(/^[\s\S]*[.!?…]["')\]]*[ \t]+/.exec(before)?.[0].length ?? 0, before.lastIndexOf('\n') + 1)

const sentenceEnd = (after: string) => {
  const end = after.search(/[.!?…]+["')\]]*(?=[ \t\n]|$)|\n/)

  return end === -1 ? after.length : end
}

// How far around a phrase the rules look.
const WINDOW = 600

type Drop = Pick<Rule, 'isEmpty' | 'isNoise' | 'closesClause' | 'put'> & {
  // Left in place where the phrase is named, not used ("the word basically").
  canBeNamed?: boolean
}

// Called for every phrase taken out, with the sentence around it, and for every
// phrase left in because it is named, not used (for tuning the rules).
export type Trace = (found: { phrase: string; left: string; right: string; isNamed: boolean }) => void

// Takes every match of `core` that the rule calls empty out of the text, with
// the commas that framed it.
const drop = (text: string, core: string, rule: Drop, trace?: Trace) =>
  text.replace(
    framed(core),
    (match: string, lead: string, gapBefore: string, phrase: string, trail: string | undefined, gapAfter: string, offset: number, whole: string) => {
      const before = whole.slice(Math.max(0, offset - WINDOW), offset).replace(MARKS, '')
      const after = whole.slice(offset + match.length, offset + match.length + WINDOW).replace(MARKS, '')
      const left = before.slice(sentenceStart(before))
      const right = after.slice(0, sentenceEnd(after))
      const around: Around = {
        before,
        after,
        phrase,
        sentence: `${left} ${right}`,
        hasCommaBefore: lead === ',',
        hasCommaAfter: trail === ',',
        isFirst: !hasContent(whole.slice(0, offset)),
      }

      if (rule.isEmpty !== undefined && !rule.isEmpty(around)) {
        return match
      }
      const isWholeSentence = !hasContent(left) && !hasContent(right)

      // An exclamation that is a whole sentence goes, with its full stop.
      // Anything else that is one is an answer ("Obviously.") and stays.
      if (isWholeSentence && rule.isNoise !== true) {
        return match
      }
      const isJustNamed = rule.canBeNamed === true && isNamed(left, right)

      trace?.({ phrase, left, right, isNamed: isJustNamed })
      if (isJustNamed) {
        return match
      }
      const isCapital = /^\p{Lu}/u.test(phrase)

      if (rule.put !== undefined) {
        return `${lead}${gapBefore}${isCapital ? rule.put.charAt(0).toUpperCase() + rule.put.slice(1) : rule.put}${trail ?? ''}${gapAfter}`
      }
      // A capital that opened the sentence moves to the word that opens it now.
      if (isWholeSentence || startsSentence(before)) {
        return `${gapBefore === '' ? '' : ' '}${REMOVED}${isCapital ? CAPITALIZE : ''}`
      }
      // Right before punctuation or the end of a line: drop it with its commas.
      if (after === '' || /^[\n.!?;:)]/.test(after)) {
        return ''
      }
      // ", uh," : both commas were the pause around the filler. A comma next
      // to a phrase that closes a clause is the clause's own.
      if (lead === ',' || (trail === ',' && rule.closesClause === true)) {
        return trail === ',' && rule.closesClause !== true ? ' ' : ', '
      }

      return gapBefore === '' && gapAfter === '' ? '' : ' '
    },
  )

export type FilterOptions = {
  // Phrases the person added: always taken out.
  own?: readonly string[]
  // Built-in phrases the person wants left in.
  kept?: readonly string[]
  trace?: Trace
}

export const filterFillers = (text: string, options: FilterOptions = {}) => {
  const { shielded, restore } = shield(text, true)
  const { beforeSounds, rules } = rulesFor(options.own, options.kept)
  let rest = shielded

  for (const rule of beforeSounds) {
    rest = drop(rest, coreOf(rule.words), { ...rule, canBeNamed: true }, options.trace)
  }
  rest = drop(rest, SOUNDS, { isNoise: true })
  for (const rule of rules) {
    rest = drop(rest, coreOf(rule.words), { ...rule, canBeNamed: true }, options.trace)
  }

  const withoutRepeats = rest
    .replace(REPEATED_PHRASE, (match: string, phrase: string) => phrase)
    .replace(REPEATED_WORD, (match: string, word: string) => (KEEP_REPEATED.has(word.toLowerCase()) ? match : word))

  const tidied = withoutRepeats
    // A sentence that is gone takes its punctuation along.
    .replace(new RegExp(`[ \\t]*${REMOVED}${CAPITALIZE}?[ \\t]*[.!?…,;:]*[ \\t]*(?=\\n|$)`, 'g'), '')
    .replace(new RegExp(`${REMOVED}(${CAPITALIZE}?)[ \\t]*[.!?…,;:]+[ \\t]*`, 'g'), '$1')
    .replaceAll(REMOVED, '')
    .replace(/,[ \t]*,/g, ',')
    .replace(/(\S)[ \t]{2,}(?=\S)/g, '$1 ')
    .replace(new RegExp(`${CAPITALIZE}+[ \\t]*(\\p{Ll})`, 'gu'), (_match: string, letter: string) => letter.toUpperCase())
    .replaceAll(CAPITALIZE, '')

  const result = restore(tidied)

  // Nothing but punctuation left: the message was all filler, and goes out as written.
  return /[\p{L}\p{N}]/u.test(result) ? result : text
}
