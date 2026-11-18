# reply-diet

In the Claude desktop app you can select part of Claude's message and reply to just that part. Stack a dozen of those replies and your message carries a dozen quoted passages, word for word, although the conversation already holds every one of them. Claude reads them a second time, and they stay in the conversation for every turn after. This mod cuts each long quote down to its first and last words before the message is sent.

## What it does

A reply that quotes

> The page moved to a new folder at the repository root, and git ignores that folder through a local rule, so the public ignore file did not change at all.

goes out as

> The page moved to a new folder at [… 17 words …] did not change at all.

Claude finds the rest in its own earlier message. Your comment under the quote, and the message you typed, go out exactly as you wrote them. Your sent message is drawn the way Claude got it, with the shortened quotes.

On a message with 20 stacked replies this removed about a quarter of the characters.

## What it never does

- It does not touch your own words. Comments and the typed message are never changed.
- It does not shorten a quote Claude could not look up: one that is no longer in the conversation (it was compacted away), or one Claude never wrote.
- It does not shorten a quote when the short form could mean two different passages. The opening and closing words grow until they can only mean one. If that is not possible, the quote stays whole.
- It leaves short quotes alone. Under about 20 words there is nothing to gain.
- It leaves everything else alone: a quote you typed or pasted yourself, a message without replies, a slash command.

If the mod itself fails, the message goes out as typed and one line says so.

## Editing a reply that is already attached

The app lets you remove an attached reply, not change it. With this mod: leave the replies attached, type `#edit` as the message and send.

1. The send is stopped. The app shows a card "A hook blocked your prompt" with the line that your replies are back in the message box.
2. The box now holds the replies as text: a line `<!-- reply -->`, the quote, your comment, for each one.
3. Change what you like, delete a whole reply with its marker line, and send. The message goes out as a message with replies, like any other.

What you typed above `#edit` stays in the box as your message, under the replies. The keyword only counts as the last thing you typed, on its own. The word "edit" without the number sign is an ordinary message.

Your words are safe at every step:

- The replies are kept by the mod before it tries anything, because by then the app has already emptied the box and removed the cards.
- A box that holds something is never written over. The reason on the card then tells you to put `/replies back` at the very start of the box and send it: what was in the box comes back under the replies.
- If the box does not take the text, the mod tries twice more, and `/replies back` puts it in by hand.
- If the mod itself breaks, your message goes out as you wrote it, unless the mod already holds the replies.

Good to know:

- It works for messages typed into the message box of the computer. A message sent from the phone is passed through: the phone's box cannot be filled.
- The message you stopped stays shown in the chat until the session is reloaded, although Claude never got it.
- A line you add at the very end, under the last comment, is sent as part of that comment. Type your message above `#edit` before you stop the send to keep it apart.
- Files and pictures attached to the stopped message are not kept: attach them again.
- While Claude is still working, the app has its own "Cancel and edit message" for a message that waits in the queue.
- The mod must be the first of your mods to see a message. Mods run in the order of `enabledPlugins` in `~/.claude/settings.json`: list `reply-diet@...` first there.

## Commands

| Command | Effect |
| --- | --- |
| `/replies` | Show whether it is on and how much it has saved (an estimate, at about 4 characters a token) |
| `/replies on` / `/replies off` | Turn the shortening on or off; saved across sessions. Editing with `#edit` works either way |
| `/replies back` | Put the replies of a stopped send into the message box again. In front of a draft, the draft comes back under them |

## Install

```
/plugin install reply-diet --marketplace 0langa/claude-code-mods
```
