// The AI pass proposes, and this decides. What the model sends back is compared
// with the message word by word, and each change is taken only if it is of a
// kind that cannot alter what the message says:
//
// - a word is respelled: a typo, an apostrophe, a split or joined word;
// - a small word is added (the, a, I, it, is);
// - words are deleted that say nothing (pause words and little connecting
//   words), or that are still said right next to where they stood (a stutter,
//   a restart), or a whole passage that is said again elsewhere.
//
// Everything else the model did is undone: a word swapped for another, an
// abbreviation written out, a changed order, an added or dropped "not", a
// number, a name, or any other word that would be gone from the message. So a
// careless or creative reply costs nothing but the cleanup it would have done.

import { LIKE_MEANS } from './empty'
import { keyOf as termKeyOf } from './glossary'
import { isCommonWord } from './words'

type Token = { text: string; key: string; at: number }

const NEWLINE = '\n'

// What two spellings of a word share: lower case, no punctuation at the edges.
const keyOf = (part: string) => {
  if (part.startsWith('\n')) {
    return NEWLINE
  }
  const folded = part.toLowerCase().replaceAll('’', "'")
  const core = folded.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

  return core === '' ? folded : core
}

const tokenize = (text: string): Token[] => (text.match(/\n+|\S+/g) ?? []).map((part, at) => ({ text: part, key: keyOf(part), at }))

const set = (words: string) => new Set(words.split(' '))

// Words that can go without a trace: pause words, and the little words that
// only hold a sentence together.
const DROPPABLE = set(
  'like so really actually basically literally honestly obviously essentially okay ok alright yeah yea yep oh ah um uh hmm hm er erm anyway anyways kinda sorta and but the a an also too then hey yo',
)

// Phrases that can go as a whole, though their words alone could not ("I mean", but not "I").
const DROPPABLE_PHRASES =
  /(?<![\p{L}'])(?:you know what i mean|i mean|you know|i guess|kind of|sort of|i don't know|i dont know|what's it called|whats it called|how do i say (?:this|that|it)|let's see|lets see|let me (?:think|see)|or something|or whatever|and stuff|and everything)(?![\p{L}'])/gu

// Small words that may be put in where the grammar needs them.
const GLUE = set("a an the i it is are was were am be to of in on at for with from by as that this these those there it's i'm we you they he she and")

const NEGATIONS = set(
  'not no never none nothing nobody nowhere neither nor without cannot dont doesnt didnt cant wont wouldnt shouldnt couldnt isnt arent wasnt werent havent hasnt hadnt mustnt aint',
)

const isNegation = (key: string) => /n't$/.test(key) || NEGATIONS.has(key)

const NUMBER_WORDS = set('one two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty sixty hundred thousand million half')

// Words a message can turn on: how much, in what order, how sure, how binding.
const WEIGHTY = set('only all every each both always must should unless until except instead before after first last if think maybe probably perhaps possibly might sure yes just')

// Code, a path, a quoted word, anything with a digit: never the model's to touch.
const isLiteral = (text: string) => /[\d\/\\@`_=<>{}()[\]|$#*~^"“”„]/.test(text) || /\p{L}\.\p{L}/u.test(text) || /\p{Ll}\p{Lu}/u.test(text)

const isCritical = (token: Token) => isNegation(token.key) || WEIGHTY.has(token.key) || isLiteral(token.text)

const isPunctuation = (token: Token) => token.key === NEWLINE || !/[\p{L}\p{N}]/u.test(token.text)

const lettersOf = (tokens: readonly Token[]) =>
  tokens
    .map(token => token.text)
    .join('')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')

// How many single-letter edits (a swap of two neighbours counts as one) turn `a` into `b`.
const distance = (a: string, b: string) => {
  let twoBack: number[] = []
  let previous = Array.from({ length: b.length + 1 }, (_, at) => at)

  for (let i = 1; i <= a.length; i += 1) {
    const row = [i]

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let best = Math.min((previous[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost)

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (twoBack[j - 2] ?? 0) + 1)
      }
      row[j] = best
    }
    twoBack = previous
    previous = row
  }

  return previous[b.length] ?? 0
}

// The same word, spelled better: the same letters (only the apostrophe, the
// capitals or the hyphen differ), or a typo of one or two letters in a word
// that is not a word as it stands. Never a literal, never a word that gains or
// loses its "not" or its "'s", and never a common word: "content" is not a typo
// of "context". A short word may only have two letters swapped ("teh").
const isRespelling = (from: Token, to: Token) => {
  if (isLiteral(from.text) || isLiteral(to.text)) {
    return false
  }
  const a = lettersOf([from])
  const b = lettersOf([to])

  if (a === b) {
    return true
  }
  // "there's" is not "there": an ending after an apostrophe must be in both.
  const ending = (key: string) => /'([a-z]{1,2})$/.exec(key)?.[1] ?? ''

  if (a[0] !== b[0] || isNegation(from.key) !== isNegation(to.key) || !b.endsWith(ending(from.key)) || !a.endsWith(ending(to.key)) || isCommonWord(from.key)) {
    return false
  }
  const longest = Math.max(a.length, b.length)

  if (longest < 5) {
    return a.length === b.length && a.length >= 3 && distance(a, b) === 1 && [...a].sort().join('') === [...b].sort().join('') && isCommonWord(to.key)
  }

  return distance(a, b) <= (longest >= 8 ? 2 : 1)
}

type Step = { kind: 'same'; from: Token; to: Token } | { kind: 'change'; removed: Token[]; added: Token[] }

// The longest run of words the two texts share, in order, and what lies between.
const align = (before: readonly Token[], after: readonly Token[]): Step[] => {
  const width = after.length + 1
  const table = new Uint16Array((before.length + 1) * width)

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        before[i]?.key === after[j]?.key ? (table[(i + 1) * width + j + 1] ?? 0) + 1 : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0)
    }
  }
  const steps: Step[] = []
  const change = () => {
    const last = steps[steps.length - 1]

    if (last !== undefined && last.kind === 'change') {
      return last
    }
    const fresh = { kind: 'change' as const, removed: [] as Token[], added: [] as Token[] }

    steps.push(fresh)

    return fresh
  }
  let i = 0
  let j = 0

  while (i < before.length || j < after.length) {
    const from = before[i]
    const to = after[j]

    if (from !== undefined && to !== undefined && from.key === to.key) {
      steps.push({ kind: 'same', from, to })
      i += 1
      j += 1
    } else if (to !== undefined && (from === undefined || (table[i * width + j + 1] ?? 0) >= (table[(i + 1) * width + j] ?? 0))) {
      change().added.push(to)
      j += 1
    } else if (from !== undefined) {
      change().removed.push(from)
      i += 1
    }
  }

  return steps
}

// Where each word that stays in the message stands in it.
type Kept = ReadonlyMap<string, readonly number[]>

// A word that was deleted is "still said" when the same word stays this close by.
const NEARBY = 15
// A passage of at least this many words that is said again anywhere may go even
// though it holds a number or a "not": the other copy still says it.
const MIN_REPEAT = 8
const REPEAT_SHARE = 0.9
// A mis-heard project term is at most this many words.
const MAX_TERM_WORDS = 6

// Why a run of the person's words may go: `empty` words say nothing wherever
// they stand, and a long passage that is said again elsewhere counts as that
// too; `echo` words are still said nearby, which holds only as long as the
// words around them were not rewritten. Undefined: the run stays.
type Deletable = 'empty' | 'echo' | undefined

const canDelete = (run: readonly Token[], kept: Kept, input: readonly Token[]): Deletable => {
  const first = run[0]?.at ?? 0
  const last = run[run.length - 1]?.at ?? 0
  const isSaid = (token: Token) => kept.has(token.key)
  const isSaidNearby = (token: Token) => (kept.get(token.key) ?? []).some(at => at >= first - NEARBY && at <= last + NEARBY)
  const isRepeat = run.length >= MIN_REPEAT && run.filter(token => isPunctuation(token) || isSaid(token)).length >= run.length * REPEAT_SHARE

  if (run.some(isCritical)) {
    return isRepeat && run.filter(isCritical).every(isSaid) ? 'empty' : undefined
  }
  if (isRepeat) {
    return 'empty'
  }
  // The words of a pause phrase go together; every other word on its own merit.
  const inPhrase = new Set<number>()
  const keys = run.map(token => token.key)
  const starts = keys.map((_, at) => keys.slice(0, at).join(' ').length + (at === 0 ? 0 : 1))

  for (const match of keys.join(' ').matchAll(DROPPABLE_PHRASES)) {
    starts.forEach((start, at) => {
      if (start >= match.index && start < match.index + match[0].length) {
        inPhrase.add(at)
      }
    })
  }
  let reason: Deletable = 'empty'

  for (const [at, token] of run.entries()) {
    if (isPunctuation(token) || inPhrase.has(at)) {
      continue
    }
    const previous = input[token.at - 1]?.key ?? ''
    const following = input[token.at + 1]?.key ?? ''
    // "looks like" compares, "like 3 days" is "about 3 days", and "not really" is not "not".
    const means = (token.key === 'like' && (LIKE_MEANS.has(previous) || /^\d/.test(following) || NUMBER_WORDS.has(following))) || (token.key === 'really' && isNegation(previous))

    if (DROPPABLE.has(token.key) && !means) {
      continue
    }
    if (!isSaidNearby(token)) {
      return undefined
    }
    reason = 'echo'
  }

  return reason
}

type Resolved = { texts: string[]; isUndone: boolean; deleted?: Deletable }

// What stands in place of a change. A change is taken whole or not at all: the
// model's edits to one spot belong together, and half of them can be worse than
// none ("the other ones" must not become "the others ones").
const resolve = (removed: readonly Token[], added: readonly Token[], kept: Kept, input: readonly Token[], terms: ReadonlySet<string>): Resolved => {
  const undone = { texts: removed.map(token => token.text), isUndone: true }

  if (removed.length === 0) {
    const isGlue = added.length <= 2 && added.every(token => isPunctuation(token) || GLUE.has(token.key))

    return isGlue ? { texts: added.map(token => token.text), isUndone: false } : undone
  }
  // A mis-heard name of the project's, written the way the project writes it
  // ("Quen three TTS" -> "Qwen3-TTS"): the one case where the model may put
  // different words, because the spelling comes from the project's own docs.
  const written = added.map(token => token.text).join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

  if (terms.has(written) && removed.length <= MAX_TERM_WORDS) {
    const heard = termKeyOf(removed.map(token => token.text))
    const meant = termKeyOf(added.map(token => token.text))

    if (heard.length >= 3 && distance(heard, meant) <= Math.max(1, Math.floor(meant.length / 4))) {
      return { texts: added.map(token => token.text), isUndone: false }
    }
  }
  // "every thingyou" -> "everything you": the same letters, cut differently.
  if (added.length > 0 && lettersOf(removed) === lettersOf(added) && ![...removed, ...added].some(token => isLiteral(token.text))) {
    return { texts: added.map(token => token.text), isUndone: false }
  }
  // Each word the model wrote must respell one of the person's, in order.
  const respelled = new Map<Token, Token>()
  let from = 0

  for (const to of added) {
    const at = removed.findIndex((token, index) => index >= from && isRespelling(token, to))
    const token = removed[at]

    if (token === undefined) {
      return undone
    }
    respelled.set(token, to)
    from = at + 1
  }
  // Every other word of the person's must be one that may go.
  const texts: string[] = []
  const runs: Token[][] = []
  let run: Token[] = []

  for (const token of removed) {
    const better = respelled.get(token)

    if (better === undefined) {
      run.push(token)
    } else {
      texts.push(better.text)
      runs.push(run)
      run = []
    }
  }
  runs.push(run)
  const reasons = runs.filter(tokens => tokens.length > 0).map(tokens => canDelete(tokens, kept, input))

  if (reasons.includes(undefined)) {
    return undone
  }

  return { texts, isUndone: false, deleted: reasons.length === 0 ? undefined : reasons.includes('echo') ? 'echo' : 'empty' }
}

// How far a rewrite that was undone reaches: a deletion this close to it was
// most likely part of the same rewrite.
const REACH = 4

// The mark that ends a sentence, if the word carries one.
const endMark = (text: string) => /([.!?…])["')\]]*$/.exec(text)?.[1] ?? ''

// `output` is the model's reply to `input`. The result is `input` with those
// changes of the model's that are safe to take.
// `terms` are the project's own spellings, which the model may write in place
// of a mis-heard version.
export const mergeCleanup = (input: string, output: string, terms: readonly string[] = []) => {
  const termSet = new Set(terms)
  const before = tokenize(input)
  const steps = align(before, tokenize(output))
  const kept = new Map<string, number[]>()

  for (const step of steps) {
    if (step.kind === 'same') {
      kept.set(step.from.key, [...(kept.get(step.from.key) ?? []), step.from.at])
    }
  }
  const resolved = steps.map(step => (step.kind === 'change' ? resolve(step.removed, step.added, kept, before, termSet) : undefined))

  // A word deleted because it is "still said" stays after all when the model's
  // rewrite of the words around it was undone.
  steps.forEach((step, at) => {
    if (step.kind !== 'change' || resolved[at]?.deleted !== 'echo') {
      return
    }
    const isNearUndone = (direction: 1 | -1) => {
      let same = 0

      for (let other = at + direction; other >= 0 && other < steps.length && same <= REACH; other += direction) {
        if (steps[other]?.kind === 'same') {
          same += 1
        } else if (resolved[other]?.isUndone === true && resolved[other]?.deleted === undefined) {
          return true
        }
      }

      return false
    }

    if (isNearUndone(1) || isNearUndone(-1)) {
      resolved[at] = { texts: step.removed.map(token => token.text), isUndone: true, deleted: 'echo' }
    }
  })
  const texts: string[] = []

  steps.forEach((step, at) => {
    if (step.kind === 'change') {
      texts.push(...(resolved[at]?.texts ?? []))

      return
    }
    // Next to a change that was undone, the model's comma or capital belongs to
    // its own version of the sentence: the person's stays. So does a literal,
    // and so does the mark that makes a sentence a statement or a question.
    const isBesideUndone = resolved[at - 1]?.isUndone === true || resolved[at + 1]?.isUndone === true
    const isOtherSentence = endMark(step.from.text) !== '' && endMark(step.to.text) !== endMark(step.from.text)

    texts.push(isBesideUndone || isOtherSentence || isLiteral(step.from.text) || isLiteral(step.to.text) ? step.from.text : step.to.text)
  })

  // Nothing taken: the message as it was, to the last space.
  if (texts.length === before.length && texts.every((text, at) => text === before[at]?.text)) {
    return input
  }
  let merged = ''

  for (const text of texts) {
    if (text.startsWith('\n')) {
      merged = `${merged.replace(/[ \t]+$/, '')}${text}`
    } else {
      merged += `${merged === '' || merged.endsWith('\n') ? '' : ' '}${text}`
    }
  }

  // The blank lines around the person's text are theirs.
  return `${/^\s*/.exec(input)?.[0] ?? ''}${merged.trim()}${/\s*$/.exec(input)?.[0] ?? ''}`
}
