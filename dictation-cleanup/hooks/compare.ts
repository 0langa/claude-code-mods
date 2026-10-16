// The comparison's state: how it is shown, and the last cleaned messages as
// typed and as sent. The drawing itself is the `ui.render` hook in register.tsx.
// Functions that take `$` are declarations, which is the form the engine follows.
// Only the drawing changes: the stored message, and what the model reads, never do.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Pair } from '../types'

import { countWords } from './clean'

export type CompareMode = 'off' | 'on' | 'both'

const compare = atom({ plugin: 'dictation-cleanup', key: 'compare' } as const, 'off' as CompareMode)
const pairs = atom({ plugin: 'dictation-cleanup', key: 'pairs' } as const, [] as readonly Pair[])

// The messages kept, and how much of each: enough for a session, not a log.
const MAX_PAIRS = 100
const MAX_TEXT = 20000

// What was saved: an earlier version kept true (the line beneath each message) or false.
export const storedCompare = (stored: unknown): CompareMode => (stored === 'on' || stored === 'both' ? stored : stored === true ? 'both' : 'off')

export async function setCompare($: EngineInterface, mode: CompareMode) {
  await update($, compare, () => mode)
}

export function compareMode($: EngineInterface) {
  return read($, compare)
}

export async function rememberPair($: EngineInterface, typed: string, sent: string) {
  await update($, pairs, list => [...list.slice(-(MAX_PAIRS - 1)), { typed: typed.slice(0, MAX_TEXT), sent: sent.slice(0, MAX_TEXT) }])
}

export async function lastPair($: EngineInterface) {
  return (await read($, pairs)).at(-1)
}

// What a message row should do, if anything: draw a message you typed as Claude
// got it (`on`), or add the other side beneath it (`both`). Reading the switch
// while the row draws subscribes the row to it, so a toggle redraws every row.
export type Comparison = { kind: 'replace'; text: string } | { kind: 'beneath'; label: string; other: string }

export async function comparisonFor($: EngineInterface, shown: string): Promise<Comparison | undefined> {
  const mode = await read($, compare)

  if (mode === 'off') {
    return undefined
  }
  const text = shown.trim()
  const pair = (await read($, pairs)).find(item => item.typed.trim() === text || item.sent.trim() === text)

  if (pair === undefined) {
    return undefined
  }
  const isShowingTyped = pair.typed.trim() === text

  if (mode === 'on') {
    return isShowingTyped ? { kind: 'replace', text: pair.sent } : undefined
  }
  const other = isShowingTyped ? pair.sent : pair.typed

  return { kind: 'beneath', other, label: isShowingTyped ? `Sent to Claude (${countWords(other)} words):` : `You dictated (${countWords(other)} words):` }
}
