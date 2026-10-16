// What the mod keeps in the session's state: how the comparison is shown, and
// the last cleaned messages as typed and as sent, so a message row can show what
// Claude got. Held in memory by Claude Code for the session; nothing is written
// to disk.
//   off:  rows are drawn as you typed them
//   on:   a row you typed is drawn as Claude got it, in place
//   both: a row also shows the other side beneath it
export type Pair = { typed: string; sent: string }

declare module 'claude-code' {
  interface PluginState {
    'dictation-cleanup': { compare: 'off' | 'on' | 'both'; pairs: readonly Pair[] }
  }
}
