// The last cleaned messages as typed and as sent. A message row is drawn from
// them (the `ui.render` hook in register.ts), so you see what Claude got, not
// what you typed. Only the drawing changes: the stored message, and what the
// model reads, are the cleaned text either way.
// Functions that take `$` are declarations, which is the form the engine follows.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Pair } from '../types'

const pairs = atom({ plugin: 'dictation-cleanup', key: 'pairs' } as const, [] as readonly Pair[])

// The messages kept, and how much of each: enough for a session, not a log.
const MAX_PAIRS = 100
const MAX_TEXT = 20000

export async function rememberPair($: EngineInterface, typed: string, sent: string) {
  await update($, pairs, list => [...list.slice(-(MAX_PAIRS - 1)), { typed: typed.slice(0, MAX_TEXT), sent: sent.slice(0, MAX_TEXT) }])
}

export async function lastPair($: EngineInterface) {
  return (await read($, pairs)).at(-1)
}

// What a message row should show instead of what you typed: what Claude got.
// Reading the pairs while the row draws subscribes the row to them, so a row is
// redrawn the moment its message is cleaned.
export async function sentFor($: EngineInterface, shown: string) {
  const text = shown.trim()

  return (await read($, pairs)).find(item => item.typed.trim() === text)?.sent
}
