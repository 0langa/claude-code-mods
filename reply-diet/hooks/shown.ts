// The messages this mod shortened, so a message row can be drawn as Claude got
// it: the app draws a row from what was typed. Only the drawing changes; what is
// stored, and what the model reads, is the shortened message either way.
// Functions that take `$` are declarations, which is the form the engine follows.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Pair } from '../types'

const pairs = atom({ plugin: 'reply-diet', key: 'pairs' } as const, [] as readonly Pair[])

// Enough for a session, not a log.
const MAX_PAIRS = 40

// A short stand-in for the typed message, so it is not kept twice: its length
// and a 32-bit hash of it.
const fingerprint = (text: string) => {
  let hash = 2166136261

  for (let at = 0; at < text.length; at += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(at), 16777619)
  }

  return `${text.length}:${hash >>> 0}`
}

export async function rememberPair($: EngineInterface, typed: string, sent: string) {
  await update($, pairs, list => [...list.slice(-(MAX_PAIRS - 1)), { typed: fingerprint(typed.trim()), sent }])
}

// What a message row should show instead of what was typed: what Claude got.
// Reading the pairs while the row draws subscribes the row to them, so a row is
// redrawn the moment its message is shortened.
export async function sentFor($: EngineInterface, shown: string) {
  const key = fingerprint(shown.trim())

  return (await read($, pairs)).find(item => item.typed === key)?.sent
}
