// Project vocabulary for dictation. Terms come from the project's own docs (no
// list to maintain); a spoken or mis-spaced version of a term is spelled the way
// the project spells it: "ADR seventy four" -> "ADR-0074", "Qwen three TTS" ->
// "Qwen3-TTS". Code, URLs and paths are never touched.

import { hasShieldSlot, shield } from './clean'

const ONES = new Map<string, number>(
  Object.entries({
    zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  }),
)
const TENS = new Map<string, number>(
  Object.entries({ twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }),
)

// Said aloud for a character the term is written with.
const SPOKEN_SEPARATORS = new Set(['dot', 'dash', 'hyphen', 'underscore', 'point'])

// Capitals used for emphasis in docs, not acronyms; kept out of the term list.
const EMPHASIS = new Set(['NEVER', 'ALWAYS', 'MUST', 'NOT', 'ONLY', 'AND', 'THE', 'FOR', 'ALL', 'ANY', 'NEW', 'DONE', 'TODO', 'NOTE', 'WARNING', 'TBD', 'WIP'])

const EXTENSIONS = new Set(['json', 'md', 'yaml', 'yml', 'py', 'ts', 'tsx', 'js', 'mjs', 'txt', 'toml', 'mp4', 'wav', 'srt', 'png', 'jpg', 'csv', 'sh', 'ps1', 'html', 'css', 'lock'])

const SMALL_WORDS = new Set(['the', 'of', 'and'])

const MAX_TOKENS = 8
const MAX_TERMS = 200

const EDGE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu
const LEAD = /^[^\p{L}\p{N}]*/u
const TRAIL = /[^\p{L}\p{N}]*$/u
const ABBREVIATION = /(?:\p{L}\.){2,}$/u

const edgeless = (token: string) => token.replace(EDGE, '')

const countUpper = (text: string) => (text.match(/\p{Lu}/gu) ?? []).length

// "seventy four" -> "74", "one hundred and five" -> "105"; digits said one by
// one ("zero zero seven four") stay separate and are joined by the key.
const mergeNumbers = (words: readonly string[]) => {
  const merged: string[] = []
  let index = 0

  while (index < words.length) {
    const word = words[index] ?? ''
    const ten = TENS.get(word)
    const one = ONES.get(word)

    if (ten !== undefined) {
      const unit = ONES.get(words[index + 1] ?? '')

      if (unit !== undefined && unit >= 1 && unit <= 9) {
        merged.push(String(ten + unit))
        index += 2
      } else {
        merged.push(String(ten))
        index += 1
      }
    } else if (one !== undefined && one >= 1 && one <= 9 && words[index + 1] === 'hundred') {
      let total = one * 100
      let next = index + 2

      if (words[next] === 'and') {
        next += 1
      }
      const tail = TENS.get(words[next] ?? '')

      if (tail !== undefined) {
        total += tail
        next += 1
      }
      const unit = ONES.get(words[next] ?? '')

      if (unit !== undefined && unit >= 1 && (tail === undefined || unit <= 9)) {
        total += unit
        next += 1
      }
      merged.push(String(total))
      index = next
    } else if (one !== undefined) {
      merged.push(String(one))
      index += 1
    } else {
      merged.push(word)
      index += 1
    }
  }

  return merged
}

const wordsOf = (tokens: readonly string[]) => {
  const words: string[] = []

  for (const token of tokens) {
    const base = edgeless(token.toLowerCase())

    if (base === '') {
      continue
    }
    const parts = base.split('-')

    if (parts.length > 1 && parts.every(part => ONES.has(part) || TENS.has(part))) {
      words.push(...parts)
    } else {
      words.push(base)
    }
  }

  return words
}

// What two spellings of the same term share: lowercase letters and digits,
// number words as digits, spoken separators gone, leading zeros gone.
export const keyOf = (tokens: readonly string[]) =>
  mergeNumbers(wordsOf(tokens))
    .filter(word => !SPOKEN_SEPARATORS.has(word))
    .join('')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/\d+/g, run => run.replace(/^0+(?=\d)/, ''))

type Entry = { term: string; isCaseSafe: boolean; needsSeparator: boolean; maxTokens: number }

// May a lowercase spelling be capitalised to the term? Only where the term cannot
// be an ordinary word: it has a digit ("Qwen3-TTS"), or it is a name you vouched
// for (built in or added by hand, such as "Claude Code"). A word like "url" or
// "github" can be an identifier, so those are left as typed.
const isCaseSafe = (term: string, tokenCount: number, isTrusted: boolean) =>
  (isTrusted && tokenCount > 1) || (/\d/.test(term) && /[A-Za-z]/.test(term) && term.length >= 4)

const buildIndex = (terms: readonly string[], trusted: ReadonlySet<string>) => {
  const index = new Map<string, Entry>()
  let longest = 0

  for (const term of terms) {
    const tokens = term.split(/\s+/).filter(token => token !== '')
    const key = keyOf(tokens)

    if (key.length < 3 || key.length > 40 || tokens.length > 5 || index.has(key)) {
      continue
    }
    const isTrusted = trusted.has(term)

    index.set(key, {
      term,
      isCaseSafe: isCaseSafe(term, tokens.length, isTrusted),
      // "anthropic api key" is ordinary speech; ANTHROPIC_API_KEY only when the
      // dash, dot or underscore is said or written. A digit ("Qwen3-TTS") makes
      // a term distinctive enough to match without.
      needsSeparator: /[-_.]/.test(term) && !/\d/.test(term),
      // A name found in the docs such as CodeBlock is one word: "code block" is
      // just English. One you vouched for ("YouTube") may be said as two.
      maxTokens: !isTrusted && tokens.length === 1 && /[a-z][A-Z]/.test(term) ? 1 : MAX_TOKENS,
    })
    longest = Math.max(longest, key.length)
  }

  return { index, longest }
}

const endsPhrase = (token: string) => /[.,;:!?]["')\]]*$/.test(token) && !ABBREVIATION.test(token)

// "scene's" is not "scenes".
const hasApostrophe = (token: string) => /[\p{L}\p{N}]['’][\p{L}\p{N}]/u.test(token)

const hasSeparator = (tokens: readonly string[]) =>
  tokens.some(token => /[\p{L}\p{N}][-_.][\p{L}\p{N}]/u.test(token) || SPOKEN_SEPARATORS.has(edgeless(token.toLowerCase())))

export type GlossaryResult = { text: string; fixed: string[] }

// `trusted` are the terms you vouch for (built in, or added by hand).
export const applyGlossary = (text: string, terms: readonly string[], trusted: readonly string[] = []): GlossaryResult => {
  const { index, longest } = buildIndex(terms, new Set(trusted))

  if (index.size === 0) {
    return { text, fixed: [] }
  }

  const { shielded, restore } = shield(text)
  // Even entries are words, odd entries the whitespace after them.
  const parts = shielded.split(/(\s+)/)
  const count = Math.ceil(parts.length / 2)
  const wordAt = (at: number) => parts[at * 2] ?? ''
  const gapAfter = (at: number) => parts[at * 2 + 1] ?? ''
  const fixed: string[] = []
  const out: string[] = []

  const match = (start: number) => {
    for (let length = Math.min(MAX_TOKENS, count - start); length >= 1; length -= 1) {
      const tokens = Array.from({ length }, (_, offset) => wordAt(start + offset))
      const isBroken = tokens.some(
        (token, offset) =>
          token === '' || hasShieldSlot(token) || hasApostrophe(token) || (offset < length - 1 && (endsPhrase(token) || gapAfter(start + offset).includes('\n'))),
      )

      if (isBroken) {
        continue
      }
      const key = keyOf(tokens)
      const entry = key.length > longest ? undefined : index.get(key)

      if (entry === undefined || length > entry.maxTokens) {
        continue
      }

      const joined = tokens.join(' ')
      const lead = LEAD.exec(joined)?.[0] ?? ''
      let trail = TRAIL.exec(joined)?.[0] ?? ''

      // Only quotes and brackets may hug a term: ".github", "--api" and "$json"
      // are something else.
      if (!/^["'“‘(\[]*$/.test(lead) || !/^[.,;:!?)"'”’\]…]*$/.test(trail)) {
        continue
      }

      // "A.I." ends in its own dot: kept only where a sentence ends.
      if (ABBREVIATION.test(tokens[length - 1] ?? '') && trail.startsWith('.')) {
        const next = start + length < count ? wordAt(start + length) : ''

        trail = next === '' || /^\p{Lu}/u.test(next) ? trail : trail.slice(1)
      }
      const core = joined.slice(lead.length, joined.length - trail.length)
      const original = parts.slice(start * 2, (start + length - 1) * 2 + 1).join('')

      if (core === entry.term) {
        return { length, replacement: original }
      }
      // "ADR-0067 point 4": a said separator only counts between the parts.
      if (SPOKEN_SEPARATORS.has(edgeless(tokens[0]?.toLowerCase() ?? '')) || SPOKEN_SEPARATORS.has(edgeless(tokens[length - 1]?.toLowerCase() ?? ''))) {
        continue
      }
      // "version-stamp" is English; only the one-word spelling is the name.
      if (entry.maxTokens === 1 && /[^\p{L}\p{N}]/u.test(core)) {
        continue
      }
      // Capitals already typed ("SHA-256") are not turned into fewer.
      if (countUpper(entry.term) < countUpper(core)) {
        continue
      }
      if (core.toLowerCase() === entry.term.toLowerCase() && (core !== core.toLowerCase() || !entry.isCaseSafe)) {
        // Only the capitals differ: capitals already typed are deliberate, and a
        // plain lowercase word is only capitalised for a term that cannot be one.
        continue
      }
      if (entry.needsSeparator && !hasSeparator(tokens)) {
        continue
      }
      if (!fixed.includes(entry.term)) {
        fixed.push(entry.term)
      }

      return { length, replacement: `${lead}${entry.term}${trail}` }
    }

    return undefined
  }

  let at = 0

  while (at < count) {
    const found = match(at)

    if (found === undefined) {
      out.push(wordAt(at), gapAfter(at))
      at += 1
    } else {
      out.push(found.replacement, gapAfter(at + found.length - 1))
      at += found.length
    }
  }

  return { text: restore(out.join('')), fixed }
}

const isHash = (token: string) => /^[0-9a-f]{6,}$/i.test(token)

// An identifier-like token worth spelling right: has a digit with letters, a
// capital inside, is written in capitals, or is a file with a known extension.
const classifyToken = (token: string) => {
  if (!/^\p{L}[\p{L}\p{N}._-]*[\p{L}\p{N}]$/u.test(token) || token.length < 3 || token.length > 40 || isHash(token)) {
    return false
  }
  const extension = /\.([A-Za-z0-9]+)$/.exec(token)?.[1]?.toLowerCase()

  if (/\.\w/.test(token) && extension !== undefined && !EXTENSIONS.has(extension) && !/\d/.test(token)) {
    return false
  }

  return (
    (/\d/.test(token) && /\p{L}/u.test(token)) ||
    /[a-z][A-Z]/.test(token) ||
    (/^[A-Z]{3,}$/.test(token) && !EMPHASIS.has(token)) ||
    (extension !== undefined && EXTENSIONS.has(extension) && /^[\w-]+\.\w+$/.test(token))
  )
}

// Code spans are deliberate: any identifier-like one with a capital, digit,
// dot, dash or underscore counts.
const isCodeTerm = (span: string) => /^\p{L}[\p{L}\p{N}_.-]*[\p{L}\p{N}]$/u.test(span) && span.length >= 3 && span.length <= 40 && /[\dA-Z._-]/.test(span) && !isHash(span)

const isCapital = (token: string) => /^\p{Lu}[\p{L}\p{N}-]*$/u.test(token)

// A capital after a full stop, or inside an opening quote or bracket, may be
// there only because a sentence starts.
const startsSentence = (tokens: readonly string[], at: number) => {
  const previous = tokens[at - 1]

  return previous === undefined || /[.!?:]["')\]]*$/.test(previous) || /^["“‘'(\[]/.test(tokens[at] ?? '')
}

const countIn = (haystack: string, needle: string) => (needle === '' ? 0 : haystack.split(needle).length - 1)

export const harvestTerms = (texts: readonly string[], fileNames: readonly string[] = []) => {
  const counts = new Map<string, number>()
  const phrases = new Map<string, { mid: number; total: number }>()
  const capitalWords = new Map<string, number>()
  const add = (map: Map<string, number>, term: string) => map.set(term, (map.get(term) ?? 0) + 1)
  let allProse = ''

  for (const source of texts) {
    const withoutFences = source.replace(/```[\s\S]*?```/g, ' ')

    for (const span of withoutFences.matchAll(/`([^`\n]+)`/g)) {
      const code = (span[1] ?? '').trim()

      if (isCodeTerm(code)) {
        add(counts, code)
      }
    }
    const prose = withoutFences.replace(/`[^`\n]*`/g, ' ')

    for (const rawLine of prose.split('\n')) {
      // Headings are Title Case whatever the words are.
      if (/^\s*#/.test(rawLine)) {
        continue
      }
      allProse += `\n${rawLine}`
      const tokens = rawLine
        .replace(/^[\s>*+-]*(\d+[.)]\s+)?/, '')
        .replace(/\*+/g, '')
        .split(/\s+/)
        .filter(token => token !== '')
      const cores = tokens.map(edgeless)

      cores.forEach((core, at) => {
        if (classifyToken(core)) {
          add(counts, core)
        }
        if (!startsSentence(tokens, at) && /^\p{Lu}\p{Ll}{4,}$/u.test(core)) {
          add(capitalWords, core)
        }
      })

      // Runs of capitalised words ("Claude Code", "Nova the AI"). One that only
      // ever starts a sentence ("Check the YouTube") is just a sentence.
      let run: string[] = []
      let runStartsSentence = false
      const flush = () => {
        while (run.length > 0 && SMALL_WORDS.has(run[run.length - 1] ?? '')) {
          run.pop()
        }
        if (run.length >= 2 && run.length <= 4) {
          const phrase = run.join(' ')
          const seen = phrases.get(phrase) ?? { mid: 0, total: 0 }

          seen.total += 1
          seen.mid += runStartsSentence ? 0 : 1
          phrases.set(phrase, seen)
        }
        run = []
      }

      cores.forEach((core, at) => {
        const endsRun = /[.,;:!?)]$/.test(tokens[at] ?? '')

        if (isCapital(core) || (run.length > 0 && SMALL_WORDS.has(core))) {
          if (run.length === 0) {
            runStartsSentence = startsSentence(tokens, at)
          }
          run.push(core)
          if (endsRun) {
            flush()
          }
        } else {
          flush()
        }
      })
      flush()
    }
  }

  for (const name of fileNames) {
    if (classifyToken(name)) {
      add(counts, name)
    }
  }

  const lowerWords = allProse.match(/\b\p{Ll}{5,}\b/gu) ?? []
  const lowerSeen = new Set(lowerWords)

  for (const [word, seen] of capitalWords) {
    if (seen >= 2 && !lowerSeen.has(word.toLowerCase())) {
      counts.set(word, seen)
    }
  }
  for (const [phrase, seen] of phrases) {
    const isDistinctive = phrase.split(' ').some(word => /\d/.test(word) || /[a-z][A-Z]/.test(word) || /^[A-Z]{3,}$/.test(word))
    // Also written in lowercase somewhere ("open source"): an ordinary phrase, not a name.
    const isOrdinary = countIn(allProse, phrase.toLowerCase()) > 0

    if (!isOrdinary && (isDistinctive ? seen.mid >= 1 : seen.mid >= 2)) {
      counts.set(phrase, seen.total)
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, MAX_TERMS)
    .map(([term]) => term)
}
