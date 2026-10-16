# dictation-cleanup

If you dictate your prompts, the transcript is full of "uh", "um", false starts and repeated phrases. The model then reads all of that, and a large model may spend extra thinking just working out what you meant. This mod cleans the prompt when you press Enter, before Claude sees it.

## What it does

1. **Word filter, on every message.** Removes filler sounds (uh, um, ah, er, erm, hmm) and stuttered words or phrases ("the the", "I want I want"). Instant and free. Code blocks, inline code, URLs and file paths are never touched, and intentional repeats like "no, no" or "very very" are kept.
2. **Haiku pass, on messages of 40 words or more.** A short, low-effort Haiku call streamlines the wording (fillers like "basically" or "you know", restated ideas, grammar slips) while keeping every request, detail, name, number and path. If Haiku fails, is slow, or returns something that doesn't look like a cleanup, the filtered text is sent instead.

It only touches what you typed or dictated. Messages from other sessions, plugins, scheduled tasks and slash commands pass through unchanged, and so does anything over 8,000 characters or 20 lines, which is most likely a paste.

## Seeing what was sent

The desktop app shows your message as you typed it. With the comparison line on, the mod posts a line under each cleaned message showing what Claude actually got. That line is display-only: it is never sent to the model and costs no tokens.

## Commands

| Command | Effect |
| --- | --- |
| `/clean` | Show the current settings |
| `/clean on` | Word filter, plus the Haiku pass for longer messages (default) |
| `/clean filter` | Word filter only, no model calls |
| `/clean off` | Send prompts exactly as typed |
| `/clean compare on` / `/clean compare off` | Show or hide the "Sent to Claude" line (default on) |
| `/clean last` | Show your last cleaned message, as dictated and as sent |

Settings are saved and carry over to new sessions.

## Changing the model

At the top of [hooks/register.ts](hooks/register.ts):

```ts
const CLEANUP_MODEL = 'haiku'
const CLEANUP_EFFORT = 'low'
```

`haiku` is an alias that Claude Code resolves to its current Haiku version. Use a full id such as `claude-haiku-5-5` to pin one version. A bigger model works too, but each cleanup then costs more and takes longer, which eats into what the cleanup saves.

## Cost

Each Haiku call costs a little: the message in, the cleaned message out, plus the cleanup instructions. That is far cheaper than the same tokens on Opus or Fable, and the cleaned message stays shorter in the conversation for every turn after it.
