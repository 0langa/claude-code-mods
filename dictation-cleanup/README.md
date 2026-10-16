# dictation-cleanup

If you dictate your prompts, the transcript is full of "uh", "um", false starts and repeated phrases, and project names come out wrong ("Quen three TTS", "ADR seventy four"). The model then reads all of that, and a large model may spend extra thinking just working out what you meant. This mod cleans the prompt when you press Enter, before Claude sees it.

## What it does

1. **Word filter, on every message.** Removes filler sounds (uh, um, ah, er, erm, hmm) and stuttered words or phrases ("the the", "I want I want"). Instant and free. Code blocks, inline code, URLs and file paths are never touched, and intentional repeats like "no, no" or "very very" are kept.
2. **Spoken quotation marks.** "quote unquote compress" becomes `"compress"`, and "quote this phrase unquote" (also "open quote ... close quote") becomes `"this phrase"`. Instant and free.
3. **Project spelling, from your project's own docs.** Names and identifiers said aloud or split by the dictation tool are written the way the project writes them: "ADR seventy four" becomes `ADR-0074`, "Qwen three TTS" becomes `Qwen3-TTS`, "shorts dot json" becomes `shorts.json`. Instant and free. See below.
4. **Haiku pass, on messages of 40 words or more.** A short, low-effort Haiku call streamlines the wording (fillers like "basically" or "you know", restated ideas, grammar slips) while keeping every request, detail, name, number and path. It is also told the project's terms, so a mis-heard name is written correctly. If Haiku fails, is slow, or returns something that doesn't look like a cleanup, the filtered text is sent instead.

It only touches what you typed or dictated. Messages from other sessions, plugins, scheduled tasks and slash commands pass through unchanged, and so does a block of your own lines over 8,000 characters or 20 lines, which is most likely a paste (a log, a file).

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

You can see what it did: a toast ("Spelled as in your project: ADR-0074, Qwen3-TTS"), the "Sent to Claude" line under the message, and `/clean last` for the before and after. `/clean terms` lists every term it knows for the folder you are in.

For something the docs never mention, add it once: `/clean term Remotion`. It is kept across sessions and applies in every project.

Your data stays yours. Spellings you add and your settings are kept in Claude Code's own plugin store in your user folder, never in this repository (which is public), and terms read from a project's docs are held in memory for the session only. The mod writes no files.

## Seeing what was sent

The desktop app shows your message as you typed it. With the comparison line on, the mod posts a line under each cleaned message showing what Claude actually got. That line is display-only: it is never sent to the model and costs no tokens.

## Commands

| Command | Effect |
| --- | --- |
| `/clean` | Show the current settings |
| `/clean on` | Word filter, quotes and spelling, plus the Haiku pass for longer messages (default) |
| `/clean filter` | Everything except the Haiku pass, no model calls |
| `/clean off` | Send prompts exactly as typed |
| `/clean compare on` / `/clean compare off` | Show or hide the "Sent to Claude" line (default on) |
| `/clean last` | Show your last cleaned message, as dictated and as sent |
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

Each Haiku call costs a little: the message in, the cleaned message out, plus the cleanup instructions and, for a project with docs, about a hundred short terms. That is far cheaper than the same tokens on Opus or Fable, and the cleaned message stays shorter in the conversation for every turn after it. The filter, the quotes and the spelling are free.

## Install

```
/plugin install dictation-cleanup --marketplace 0langa/claude-code-mods
```
