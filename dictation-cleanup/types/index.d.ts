// What the mod keeps in the session's state: the last cleaned messages as typed
// and as sent, so a message row can be drawn as Claude got it, and /clean last
// can show both. Held in memory by Claude Code for the session; nothing is
// written to disk.
export type Pair = { typed: string; sent: string }

declare module 'claude-code' {
  interface PluginState {
    'dictation-cleanup': { pairs: readonly Pair[] }
  }
}
