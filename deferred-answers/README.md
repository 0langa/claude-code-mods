# deferred-answers

When Claude asks you something (the next-step buttons in the desktop app, or the question dialog) and you answer "not now", "later", "not yet" or "after X", the question stays open. Until it's done or dropped, the question and your answer are attached to every message you send, so you don't have to remind Claude about it.

- **Kept open:** a reply that puts the question off ("Not now", "later, after the tests", "can't yet, we're doing Y first"), a dialog pick with a note like that, or a dialog that closed on its own while you were away.
- **Closed:** a yes, a pick, or a plain no.
- Claude closes an item with the mod's `deferred_close` tool once it's done or you drop it.
- `/deferred` lists the open items, `/deferred drop 2` drops one, and `/deferred drop all` drops them all.

The next-step box also stays put. While sessions Claude started are still working, no question is shown, and it's asked once they're done. A turn you didn't start (a session's report, an app event) can't swap out a question that's waiting for you.

Only your own replies count. A message from another session or from the app doesn't answer a question. The open items live in the session's memory, so nothing is written to disk.

## Install

```
/plugin install deferred-answers --marketplace 0langa/claude-code-mods
```
