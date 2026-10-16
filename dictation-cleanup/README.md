# dictation-cleanup

If you dictate your prompts, the transcript is full of "uh", "um", false starts and repeated phrases, and project names come out wrong ("Quen three TTS", "ADR seventy four"). The model then reads all of that, and a large model may spend extra thinking just working out what you meant. Typed messages have typos. This mod is an AI-assisted autocorrect for your prompts: it corrects the message when you press Enter, before Claude sees it, and your message is drawn as Claude got it.

## What it does

1. **Word filter, on every message.** Removes filler sounds (uh, um, ah, er, erm, hmm) and stuttered words or phrases ("the the", "I want I want"). Instant and free. Code blocks, inline code, URLs and file paths are never touched, and intentional repeats like "no, no" or "very very" are kept.
2. **Spoken quotation marks.** "quote unquote compress" becomes `"compress"`, and "quote this phrase unquote" (also "open quote ... close quote") becomes `"this phrase"`. Instant and free.
3. **Project spelling, from your project's own docs.** Names and identifiers said aloud or split by the dictation tool are written the way the project writes them: "ADR seventy four" becomes `ADR-0074`, "Qwen three TTS" becomes `Qwen3-TTS`, "shorts dot json" becomes `shorts.json`. Instant and free. See below.
4. **Haiku pass, on messages of 8 words or more, typed or dictated.** A short, low-effort Haiku call corrects typos, grammar and punctuation, and streamlines dictated wording (fillers like "basically" or "you know", restated ideas), while keeping every request, detail, name, number and path. It changes as little as it can and returns a message that is already fine exactly as it is. It is also told the project's terms, so a mis-heard name is written correctly. The call holds up sending, so it is given 4 seconds. If Haiku fails, is slow, returns something that doesn't look like a correction, or rewrites or answers the message instead of correcting it (checked: most of the reply must be your own words, in your order), the word-filtered text is sent instead and a short notice says so. A message shorter than 8 words only gets the free filter, and `/clean filter` turns the AI pass off.

It only touches what you typed or dictated. Anything Claude or a program wrote passes through exactly as it is: messages from other sessions, the brief a session was started with, notifications, scheduled tasks, channels, the app's own notes, a compaction summary, other plugins and slash commands. That is decided by where the prompt came from and, because the desktop app stamps its own turns the same whether you or a program wrote them, also by what it looks like: a known note or brief opening, or structure that dictation does not have (headings, a list of four or more items, tagged blocks). `/clean origins` shows, as counts only, where messages came from and which were cleaned or left alone. A message of yours left alone by mistake is the safe failure: it is sent as you wrote it. A block of your own lines over 8,000 characters or 20 lines is also left alone, since it is most likely a paste (a log, a file).

Text you quote back is left exactly as it is, and only your own lines around it are cleaned. A line starting with `>`, and an HTML comment line like `<!-- reply -->`, count as quoted. So a reply that quotes Claude's answer and comments on it is still cleaned, and Claude never sees the quoted lines altered. Each stretch of your own lines is judged on its own, and the Haiku pass only ever gets your words.

German filler sounds (ähm, äh, öhm) are removed along with the English ones.

## Project spelling: nothing to maintain

There is no list to keep up. When a session starts in a folder, the mod reads that folder's `CLAUDE.md`, `AGENTS.md`, `README.md` and project skills (`skills/*/SKILL.md`, `.claude/skills/*/SKILL.md`), plus the file names in its root. From them it picks out identifiers (anything with a digit, a capital inside, or a file extension), names written in backticks, and proper names the docs use over and over. A new term in your docs is known the next time a session starts. Every project gets its own set, and a few common ones (`Claude Code`, `GitHub`, `YouTube`, `TypeScript`, `PowerShell`...) are built in.

A spoken version is matched by what it sounds like written down, not by guessing: lowercase letters and digits only, number words as digits, "dot" and "dash" ignored, leading zeros ignored. So "ADR seventy-four", "adr 74" and "A D R zero zero seven four" all become `ADR-0074`. A mis-hearing that sounds different ("Quen three") is left to the Haiku pass, which has the term list.

It is built to leave ordinary writing alone:

- Code, URLs and paths are never touched, and neither is anything glued to punctuation (`.github`, `--api`, `scene's`).
- A name like `make-video` or `ANTHROPIC_API_KEY` is only written when you say or write the separator ("make dash video"). "make video" and "anthropic api key" stay as they are.
- A name from the docs like `CodeBlock` matches the single word only. "code block" stays as it is.
- Capitals are only ever added for a name with a digit (`Qwen3-TTS`) or a name you vouched for. Capitals you typed are never taken away.
- A phrase counts as a name only if the docs write it capitalised in the middle of a sentence, more than once, and never in lowercase. Title Case headings and sentence starts do not count.

It stays silent when it works. To check a message, `/clean last` shows what you dictated and what Claude got, and `/clean terms` lists every term it knows for the folder you are in.

For something the docs never mention, add it once: `/clean term Remotion`. It is kept across sessions and applies in every project.

Your data stays yours. Spellings you add and your settings are kept in Claude Code's own plugin store in your user folder, never in this repository (which is public), and terms read from a project's docs are held in memory for the session only. The mod writes no files.

## Seeing what was sent

The mod adds nothing to your session while it works. The one thing it reports on its own is a failed AI pass (a short notice; the message still goes out, cleaned by the word filter alone).

Your message is drawn as Claude got it: the app first shows what you typed, then, once the message has been cleaned (a moment later, while the AI pass runs), draws it as Claude received it. Only the drawing changes. The cleaned text is what enters the conversation and what the model reads, nothing is added to the conversation, and the model never sees what you typed. Nothing reaches Claude before the correction is done. `/clean last` shows your last cleaned message as you wrote it and as sent. The mod keeps the last 100 cleaned messages in memory for the drawing (nothing on disk), so a message from before the session started is drawn as you wrote it.

## Commands

| Command | Effect |
| --- | --- |
| `/clean` | Show the current settings |
| `/clean on` | Word filter, quotes and spelling, plus the Haiku pass for longer messages (default) |
| `/clean filter` | Everything except the Haiku pass, no model calls |
| `/clean off` | Send prompts exactly as typed |
| `/clean last` | Show your last cleaned message, as you wrote it and as sent |
| `/clean origins` | Counts of where messages came from and what became of them (cleaned, nothing to clean, left alone). No text is kept. `/clean origins reset` clears them |
| `/clean terms` | List the spellings in use here: yours, built in, and read from the folder's docs |
| `/clean term <spelling>` | Add a spelling by hand, kept for every project |
| `/clean term remove <spelling>` | Drop a spelling you added |

Settings are saved in Claude Code's plugin store on your machine and carry over to new sessions.

## Changing the model

At the top of [hooks/register.ts](hooks/register.ts):

```ts
const CLEANUP_MODEL = 'haiku'
const CLEANUP_EFFORT = 'low'
```

`haiku` is an alias that Claude Code resolves to its current Haiku version. Use a full id such as `claude-haiku-5-5` to pin one version. A bigger model works too, but each cleanup then costs more and takes longer, which eats into what the cleanup saves.

## Cost

Each Haiku call is stateless and goes out through your session's own Claude connection: the message in, the corrected message out, plus the instructions and, for a project with docs, about a hundred short terms, roughly 1,000 tokens in and 200 out. At Haiku 5.5's list price ($0.10 per million input tokens, $0.50 per million output) that is about $0.0002 a message, or 2 cents per 100 messages. How it counts for you depends on how you sign in (a plan's usage, or API billing). The filter, the quotes and the spelling are free, and `/clean filter` stops the Haiku calls.

## Install

```
/plugin install dictation-cleanup --marketplace 0langa/claude-code-mods
```
