// What the mod keeps in the session's state: for each message it shortened, a
// fingerprint of the message as typed and the message as sent, so the message
// row can be drawn as Claude got it. Held in memory by Claude Code for the
// session; nothing is written to disk.
export type Pair = { typed: string; sent: string }

// The replies of a send that was stopped for editing, as text for the message
// box. `text` is '' when nothing is waiting. `isInBox` is true once the text
// was put into the box: from then on only the person moves it.
export type Stash = { text: string; isInBox: boolean }

declare module 'claude-code' {
  interface PluginState {
    'reply-diet': { pairs: readonly Pair[]; stash: Stash }
  }
}
