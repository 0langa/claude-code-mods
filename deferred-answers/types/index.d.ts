// What the mod keeps in the session's state. Held in memory by Claude Code for
// the session (it survives a plugin reload); nothing is written to disk.

// One button of the app's next-step box, as Claude asked for it.
export type WrapUpAction = { label?: string; action?: string }

// A question Claude asked with the app's next-step box, still on screen and
// waiting for the person's next message.
export type Pending = { question: string; labels: readonly string[]; actions: readonly WrapUpAction[] }

// A question the person put off: what was asked and what they answered.
export type Deferred = { id: number; question: string; answer: string }

declare module 'claude-code' {
  interface PluginState {
    'deferred-answers': {
      pending: Pending | null
      open: readonly Deferred[]
      nextId: number
      // Sessions this one started that are still working.
      running: readonly string[]
      // Whether the turn running now was started by the person's own message.
      turnByPerson: boolean
      // A question held back while started sessions were working.
      held: string | null
    }
  }
}
