import type { EngineInterface, PromptOrigin, Register } from 'claude-code'

import { countWords, filterFillers } from './clean'
import type { FilterOptions } from './clean'
import { lastPair, rememberPair, sentFor } from './compare'
import { builtInWords, fold, isBuiltIn, isPhrase } from './empty'
import { applyGlossary, harvestTerms } from './glossary'
import { cleanupFrom, maxTokensFor, promptFor, systemFor, timeoutFor } from './pass'
import { isFromPerson, isMachineText, looksMachineWritten } from './source'
import { applyQuotes } from './spoken'

type Mode = 'on' | 'filter' | 'off'

// The model for the cleanup pass: an alias Claude Code resolves to its current
// version ('haiku', 'sonnet', 'opus', 'fable') or a full id ('claude-haiku-5-5').
const CLEANUP_MODEL = 'haiku'
const CLEANUP_EFFORT = 'low'

// Messages of at least this many words also get the Haiku pass, so a typo in a
// typed message is fixed as well as a dictated one. A shorter message ("yes, do
// it") is not worth the wait.
const MODEL_MIN_WORDS = 8
// Bigger than this is most likely a paste (a log, a file), not dictation.
const MAX_CHARS = 8000
const MAX_LINES = 20

// Always known, in every project. Capitalised the way they are written.
const SEED_TERMS = [
  'Claude Code', 'Anthropic', 'GitHub', 'TypeScript', 'JavaScript', 'PowerShell', 'YouTube',
  'TTS', 'API', 'CLI', 'MCP', 'JSON', 'YAML', 'CUDA', 'GPU', 'CPU', 'SDK', 'URL', 'HTML', 'CSS', 'SQL', 'PDF', 'LLM', 'SSH',
]

// The project's own docs are where its vocabulary lives.
const MAX_SOURCE_CHARS = 60000
const MAX_SKILLS = 12

const MODES: readonly Mode[] = ['on', 'filter', 'off']

const readMode = async ($: EngineInterface): Promise<Mode> => {
  const stored = await $.store.get('mode')

  return MODES.find(mode => mode === stored) ?? 'on'
}

type Outcome = 'cleaned' | 'unchanged' | 'left alone'
type Seen = Record<string, Partial<Record<Outcome, number>>>

const readSeen = async ($: EngineInterface): Promise<Seen> => {
  const stored = await $.store.get('origins')

  return typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? (stored as Seen) : {}
}

// Content-free counters (where a message came from, what became of it), so
// /clean origins can show that other sessions' messages are left alone. No text
// is kept. A counter must never get in the way of a prompt.
const note = async ($: EngineInterface, origin: PromptOrigin, outcome: Outcome) => {
  try {
    const seen = await readSeen($)
    const entry = seen[origin.kind] ?? {}

    await $.store.set('origins', { ...seen, [origin.kind]: { ...entry, [outcome]: (entry[outcome] ?? 0) + 1 } })
  } catch {
    // ignored on purpose
  }
}

const looksLikePaste = (text: string) => text.length > MAX_CHARS || text.split('\n').length > MAX_LINES

// Lines that are not the person's own words: a quoted reply (> ...) and the
// <!-- ... --> markers some clients add. They are kept exactly as they are.
const isQuoted = (line: string) => /^\s*>/.test(line) || /^\s*<!--.*-->\s*$/.test(line)

type Part = { text: string; isQuoted: boolean }

// The message in runs of quoted lines and of the person's own lines. A blank
// line stays with the run it follows, so joining the runs with a newline gives
// the message back exactly.
const splitQuoted = (text: string): Part[] => {
  const parts: Part[] = []

  for (const line of text.split('\n')) {
    const quoted = isQuoted(line)
    const last = parts[parts.length - 1]

    if (last !== undefined && (last.isQuoted === quoted || line.trim() === '')) {
      last.text += `\n${line}`
    } else {
      parts.push({ text: line, isQuoted: quoted })
    }
  }

  return parts
}

const readList = async ($: EngineInterface, key: string) => {
  const stored = await $.store.get(key)

  return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []
}

const readTerms = ($: EngineInterface) => readList($, 'terms')

// The phrases the person added to the built-in ones, and the built-in ones they
// want left in.
const MAX_OWN_FILLERS = 100

const readFillers = async ($: EngineInterface) => ({ own: await readList($, 'fillers'), kept: await readList($, 'keptFillers') })

const readText = async ($: EngineInterface, path: string) => {
  try {
    return (await $.fs.read(path)).slice(0, MAX_SOURCE_CHARS)
  } catch {
    return undefined
  }
}

// The terms of the folder the session runs in, read from its docs: no list to keep.
const harvestFolder = async ($: EngineInterface) => {
  const skillFiles = new Map<string, string>()

  for (const dir of ['skills', '.claude/skills']) {
    const entries = await $.fs.list(dir).catch(() => [])

    for (const entry of entries.filter(item => item.kind === 'dir').slice(0, MAX_SKILLS)) {
      if (!skillFiles.has(entry.name)) {
        skillFiles.set(entry.name, `${dir}/${entry.name}/SKILL.md`)
      }
    }
  }
  const files = await $.fs.list().catch(() => [])
  const texts = await Promise.all(['CLAUDE.md', 'AGENTS.md', 'README.md', ...skillFiles.values()].map(path => readText($, path)))

  return harvestTerms(
    texts.filter((text): text is string => text !== undefined),
    files.filter(item => item.kind === 'file').map(item => item.name),
  )
}

type TermCache = Map<string, Promise<string[]>>

// What you added by hand, the always-known terms, then the folder's own. The
// first two are `trusted`: names you vouched for, which may be capitalised from
// plain lowercase and said as separate words.
const loadTerms = async ($: EngineInterface, cache: TermCache) => {
  const cwd = await $.session.cwd().catch(() => '')
  let pending = cache.get(cwd)

  if (pending === undefined) {
    pending = harvestFolder($).catch(() => [])
    cache.set(cwd, pending)
  }
  const own = await readTerms($)
  const trusted = [...own, ...SEED_TERMS]

  return { terms: [...new Set([...trusted, ...(await pending)])], trusted, own }
}

// The cleaned text, or why there is none: the only thing the mod ever reports.
type ModelOutcome = { text: string } | { problem: string }

const cleanWithModel = async ($: EngineInterface, text: string, terms: readonly string[]): Promise<ModelOutcome> => {
  $.ui.status('Cleaning dictation…')
  try {
    const reply = await $.model.complete({
      model: CLEANUP_MODEL,
      system: systemFor(terms),
      prompt: promptFor(text),
      effort: CLEANUP_EFFORT,
      maxTokens: maxTokensFor(text),
      timeoutMs: timeoutFor(countWords(text)),
    })

    if (!reply.isAnswered) {
      return { problem: reply.reason === 'aborted' ? 'it timed out' : 'the model call failed' }
    }
    const cleaned = cleanupFrom(text, reply.text, terms)

    return cleaned === undefined ? { problem: 'its reply was not usable' } : { text: cleaned }
  } finally {
    $.ui.status(undefined)
  }
}

type Cleaned = { text: string; problem?: string }

type Vocabulary = { terms: readonly string[]; trusted: readonly string[]; fillers: FilterOptions }

// One run of the person's own lines: spoken quotes, then fillers, empty words
// and stutters, project spelling, then the Haiku pass when it is long enough.
// What the pass sends back goes through the same rules once more.
const cleanPart = async ($: EngineInterface, text: string, mode: Mode, { terms, trusted, fillers }: Vocabulary): Promise<Cleaned> => {
  const byRules = (value: string) => applyGlossary(filterFillers(applyQuotes(value), fillers), terms, trusted).text
  const ruled = byRules(text)
  const isLong = countWords(ruled) >= MODEL_MIN_WORDS && !ruled.includes('```')

  if (mode !== 'on' || !isLong) {
    return { text: ruled }
  }
  const outcome = await cleanWithModel($, ruled, terms)

  return 'text' in outcome ? { text: byRules(outcome.text) } : { text: ruled, problem: outcome.problem }
}

export const register: Register = on => {
  const termCache: TermCache = new Map()

  // A message you typed is drawn as Claude got it. Only the drawing changes: the
  // stored message and what the model reads are the cleaned text either way, and
  // nothing is added to the conversation. A message that was not cleaned is drawn
  // as the app draws it. The row is redrawn the moment its message is cleaned.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const sent = await sentFor($, e.props.text)

    return sent === undefined ? next(e) : next({ ...e, props: { ...e.props, text: sent } })
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'clean',
      description: 'Dictation cleanup: on, filter (no AI pass), off, last (both versions), fillers (words taken out), terms (spelling list), origins (what was cleaned or left alone)',
      argumentHint: '[on|filter|off|last|fillers|filler <phrase>|filler keep <phrase>|terms|term <spelling>|term remove <spelling>|origins]',
      immediate: true,
    })
    // An earlier version kept a compare setting; it is gone.
    await $.store.delete('compare')

    return next(e)
  })

  on('command.run', { command: 'clean' }, async ($, e) => {
    const raw = e.args.trim()
    const arg = raw.toLowerCase()
    const chosen = MODES.find(mode => mode === arg)
    const termCommand = /^term\s+(?:(add|remove)\s+)?(.+)$/i.exec(raw)
    const fillerCommand = /^filler\s+(?:(add|keep|remove)\s+)?(.+)$/i.exec(raw)

    if (fillerCommand !== null) {
      const phrase = fold(fillerCommand[2])
      const { own, kept } = await readFillers($)

      if (!isPhrase(phrase)) {
        return { text: 'A filler is one to five plain words, such as "to be fair".' }
      }
      if (fillerCommand[1] === undefined || fillerCommand[1].toLowerCase() === 'add') {
        await $.store.set('keptFillers', kept.filter(item => item !== phrase))
        if (isBuiltIn(phrase)) {
          return { text: kept.includes(phrase) ? `"${phrase}" is taken out again where it says nothing.` : `"${phrase}" is already taken out where it says nothing.` }
        }
        await $.store.set('fillers', [phrase, ...own.filter(item => item !== phrase)].slice(0, MAX_OWN_FILLERS))

        return { text: `Added "${phrase}". It is taken out of your messages from now on, wherever it stands.` }
      }
      await $.store.set('fillers', own.filter(item => item !== phrase))
      if (isBuiltIn(phrase)) {
        await $.store.set('keptFillers', [phrase, ...kept.filter(item => item !== phrase)])
      }

      return { text: isBuiltIn(phrase) || own.includes(phrase) ? `"${phrase}" stays in your messages from now on.` : `"${phrase}" is not on the list, so it stays anyway.` }
    }
    if (arg === 'fillers') {
      const { own, kept } = await readFillers($)
      const groups = [...builtInWords()].map(([group, words]) => `${group.charAt(0).toUpperCase()}${group.slice(1)}: ${words.filter(word => !kept.includes(word)).join(', ')}`)

      return {
        text:
          'Words and phrases taken out where they say nothing. One that can also mean something is only taken out where the words around it show that it is empty.\n\n' +
          `${groups.join('\n')}\n\nYours, taken out wherever they stand: ${own.join(', ') || '(none)'}\nLeft in because you said so: ${kept.join(', ') || '(none)'}\n\n` +
          'Add one with /clean filler <phrase>, leave one in with /clean filler keep <phrase>.',
      }
    }
    if (termCommand !== null) {
      const spelling = (termCommand[2] ?? '').trim()
      const stored = await readTerms($)

      if (termCommand[1]?.toLowerCase() === 'remove') {
        await $.store.set('terms', stored.filter(term => term.toLowerCase() !== spelling.toLowerCase()))

        return { text: `Removed "${spelling}" from your own terms. Terms read from the project's docs stay.` }
      }
      await $.store.set('terms', [spelling, ...stored.filter(term => term.toLowerCase() !== spelling.toLowerCase())])

      return { text: `Added "${spelling}". It will be written exactly like that from now on.` }
    }
    if (arg === 'origins reset') {
      await $.store.delete('origins')

      return { text: 'Counts cleared.' }
    }
    if (arg === 'origins') {
      const rows = Object.entries(await readSeen($)).map(
        ([kind, count]) => `${kind}: ${count.cleaned ?? 0} cleaned, ${count.unchanged ?? 0} nothing to clean, ${count['left alone'] ?? 0} left alone`,
      )

      return {
        text:
          rows.length === 0
            ? 'No messages counted yet.'
            : `Where messages came from, and what became of them (counts only, no text kept):\n${rows.join('\n')}\n\n` +
              'Only your own words are cleaned. Other sessions, notifications, schedules and programs are left alone. /clean origins reset starts the count over.',
      }
    }
    if (arg === 'terms') {
      const { terms: all, own } = await loadTerms($, termCache)
      const rest = all.filter(term => !own.includes(term) && !SEED_TERMS.includes(term))

      return {
        text:
          `Spelling list: ${own.length} added by hand, ${SEED_TERMS.length} built in, ${rest.length} read from this folder's docs.\n\n` +
          `Yours: ${own.join(', ') || '(none)'}\n\nFrom the docs: ${rest.slice(0, 60).join(', ') || '(none)'}\n\n` +
          'Add one with /clean term <spelling>, drop one with /clean term remove <spelling>.',
      }
    }

    if (chosen !== undefined) {
      await $.store.set('mode', chosen)

      return { text: `Dictation cleanup: ${chosen}.` }
    }
    if (arg === 'last') {
      const pair = await lastPair($)

      return {
        text: pair === undefined ? 'No message cleaned yet in this session.' : `You wrote:\n\n${pair.typed}\n\nClaude got:\n\n${pair.sent}`,
      }
    }

    const mode = await readMode($)

    return {
      text: `Dictation cleanup is ${mode}. Use /clean on, /clean filter (no AI pass), /clean off, /clean last, or /clean fillers.`,
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command !== undefined || e.text.trim() === '') {
      return next(e)
    }
    // Not the person's own words: another session, a notification, a program.
    if (e.isMeta === true || !isFromPerson(e.origin) || isMachineText(e.text)) {
      await note($, e.origin, 'left alone')

      return next(e)
    }

    const mode = await readMode($)

    if (mode === 'off') {
      return next(e)
    }

    const { terms, trusted } = await loadTerms($, termCache)
    const vocabulary = { terms, trusted, fillers: await readFillers($) }
    // Quoted lines, blank runs and a run of your own lines that looks like a
    // paste (a log, a file) are left as they are; the rest is cleaned run by run.
    const parts = splitQuoted(e.text)

    // The desktop app's SDK turns are stamped the same whether a person or a
    // program wrote them: a structured brief is a program's.
    if (e.origin.kind === 'sdk' && looksMachineWritten(parts.filter(part => !part.isQuoted).map(part => part.text).join('\n'))) {
      await note($, e.origin, 'left alone')

      return next(e)
    }
    const results = await Promise.all(
      parts.map(part => (part.isQuoted || part.text.trim() === '' || looksLikePaste(part.text) ? undefined : cleanPart($, part.text, mode, vocabulary))),
    )
    const cleaned = parts.map((part, at) => results[at]?.text ?? part.text).join('\n')
    const problem = results.find(result => result?.problem !== undefined)?.problem

    // Silent when it works. Only a failed AI pass is worth a word: the message
    // still goes out, with the word filter alone.
    if (problem !== undefined) {
      $.ui.toast(`Dictation cleanup: the AI pass was skipped (${problem}); only the word filter ran.`)
    }
    if (cleaned === e.text) {
      await note($, e.origin, 'unchanged')

      return next(e)
    }

    // Kept in the session's state so the message row can be drawn as Claude got
    // it, and for /clean last. Nothing is added to the session.
    await rememberPair($, e.text, cleaned)
    await note($, e.origin, 'cleaned')

    return next({ ...e, text: cleaned })
  })
}
