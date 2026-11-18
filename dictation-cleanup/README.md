# dictation-cleanup

If you dictate your prompts, the transcript is full of "uh", "um", "basically", "so yeah", false starts and repeated phrases, and project names come out wrong ("Quen three TTS", "ADR seventy four"). The model then reads all of that, and a large model may spend extra thinking just working out what you meant. Typed messages have typos. This mod is an AI-assisted autocorrect for your prompts: it cleans the message when you press Enter, before Claude sees it, and your message is drawn as Claude got it. It takes words out and fixes spellings. It never puts your message in other words.

## What it does

1. **Filler sounds and stutters, on every message.** Removes filler sounds (uh, um, ah, er, erm, hmm) and stuttered words or phrases ("the the", "I want I want"). Instant and free. Code blocks, inline code, URLs and file paths are never touched, and intentional repeats like "no, no" or "very very" are kept.
2. **Words that say nothing, on every message.** Hedges and emphasis (basically, pretty much, obviously, honestly, literally, kind of, I guess), openers (so yeah, well, I mean, look), vague tags at the end of a sentence (or whatever, and stuff, or something), thinking aloud between commas (I don't know, what's it called), "like" used as a pause, and exclamations that only vent. By rules, so instant and free, and only where the words around a phrase show that it is empty. See below.
3. **Spoken quotation marks.** "quote unquote compress" becomes `"compress"`, and "quote this phrase unquote" (also "open quote ... close quote") becomes `"this phrase"`. Instant and free.
4. **Project spelling, from your project's own docs.** Names and identifiers said aloud or split by the dictation tool are written the way the project writes them: "ADR seventy four" becomes `ADR-0074`, "Qwen three TTS" becomes `Qwen3-TTS`, "shorts dot json" becomes `shorts.json`. Instant and free. See below.
5. **Haiku pass, on messages of 8 words or more, typed or dictated.** A short, low-effort Haiku call takes out what only the context can tell is empty (the "like" the rules left in, a restart, a passage said twice) and corrects spelling, punctuation and capitalisation. It is also told the project's terms, so a mis-heard name is written correctly. Its reply is not trusted as a whole: each change is checked, and anything that could alter what you said is put back. See "What the AI pass may change". The call holds up sending, so it gets 4 seconds, plus a little for every word of a long message, 15 at most. If Haiku fails, is slow, or answers the message instead of cleaning it, the rule-filtered text is sent instead and a short notice says so. A message shorter than 8 words only gets the free rules, and `/clean filter` turns the AI pass off.

It only touches what you typed or dictated. Anything Claude or a program wrote passes through exactly as it is: messages from other sessions, the brief a session was started with, notifications, scheduled tasks, channels, the app's own notes, a compaction summary, other plugins and slash commands. That is decided by where the prompt came from and, because the desktop app stamps its own turns the same whether you or a program wrote them, also by what it looks like: a known note or brief opening, or structure that dictation does not have (headings, a list of four or more items, tagged blocks). `/clean origins` shows, as counts only, where messages came from and which were cleaned or left alone. A message of yours left alone by mistake is the safe failure: it is sent as you wrote it. A block of your own lines over 8,000 characters or 20 lines is also left alone, since it is most likely a paste (a log, a file).

Text you quote back is left exactly as it is, and only your own lines around it are cleaned. A line starting with `>`, and an HTML comment line like `<!-- reply -->`, count as quoted. So a reply that quotes Claude's answer and comments on it is still cleaned, and Claude never sees the quoted lines altered. Each stretch of your own lines is judged on its own, and the Haiku pass only ever gets your words.

German filler sounds (ähm, äh, öhm) are removed along with the English ones.

## Words that say nothing

A phrase is only taken out where the words around it show that it is empty. The same phrase stays where it means something:

| Taken out | Left in |
| --- | --- |
| "Basically, I want the export to be faster." | "Basically." as a whole answer |
| "I kind of want a dark theme." | "what kind of file", "a special kind of lock" |
| "That works, I guess." | "I guess so.", "if I guess wrong" |
| "So yeah, the build fails." | "Yeah, do it." at the start of a message, "Is it done? Yeah." |
| "I need you to like see what changed.", "It is, like, the third time." | "looks like", "I'd like", "something like", "like I said", "I was like, why" |
| "Check the logs and stuff, then restart." | "or something else", "and everything works" |
| "Open the, what is it called, the settings file." | "I don't know why it fails." |
| "Oh shit, I deleted the branch." | "That test is shit." (a verdict, not an exclamation) |
| "I honestly think it literally broke." | "tell me honestly", "do not take that literally" |

Three things are never touched:

- **A word you are talking about.** "The word basically", "I keep saying like", every item of a list after "words like ...", anything in a sentence about fillers, and anything in quotation marks. Dictating "quote unquote basically" writes `"basically"`, which is then left alone.
- **A word that may be your answer.** A "yeah" that is the first word of your message or ends a sentence, and a sentence that is nothing but the word ("Obviously.", "Pretty much."). A message that is all filler goes out as you wrote it.
- **Code, URLs and paths.**

What the rules cannot tell is left in: most uses of "like", every "just", "actually", "so" and "I think". The AI pass sees those in context.

`/clean fillers` lists every built-in phrase. `/clean filler to be fair` adds a phrase of your own, which is then taken out wherever it stands. `/clean filler keep obviously` leaves a built-in phrase in your messages. Both are kept across sessions and apply in every project.

## What the AI pass may change

A model that is asked to clean up a message will sometimes rewrite it, and a rewrite can change what you said. On real dictation, the model wrote "two" for "2", wrote shorthand out, dropped hedges, deleted a remark that it was only thinking aloud, and turned two sentences into their opposite by adding a "not". So the reply is compared with your message word by word, and a change is taken only if it is one of these:

- **A word respelled**: a typo, an apostrophe, a capital, a split or joined word. A common English word is never "corrected" into its neighbour ("content" into "context"), and a short word may only have two letters swapped ("teh").
- **A small word added**: the, a, I, it, is.
- **Words deleted** that say nothing (like, so, really, actually, I mean, you know), or that are still said right next to where they stood (a stutter, a restart), or a passage of eight words or more that is said again elsewhere.
- **A mis-heard name** written the way your project's docs write it.

Everything else is put back the way you wrote it: a word swapped for another, shorthand written out, a changed word order, a number, an added or dropped "not", and words a message can turn on ("only", "all", "must", "first", "I think", "maybe", "just"). A sentence with content is never dropped, and a statement is not turned into a question. Each change is taken whole or not at all, and when a rewrite is put back, deletions right next to it are put back too. So a careless or creative reply costs nothing but the cleanup it would have done.

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

The mod adds nothing to your session while it works. The one thing it reports on its own is a failed AI pass (a short notice; the message still goes out, cleaned by the rules alone).

Your message is drawn as Claude got it: the app first shows what you typed, then, once the message has been cleaned (a moment later, while the AI pass runs), draws it as Claude received it. Only the drawing changes. The cleaned text is what enters the conversation and what the model reads, nothing is added to the conversation, and the model never sees what you typed. Nothing reaches Claude before the correction is done. `/clean last` shows your last cleaned message as you wrote it and as sent. The mod keeps the last 100 cleaned messages in memory for the drawing (nothing on disk), so a message from before the session started is drawn as you wrote it.

## Commands

| Command | Effect |
| --- | --- |
| `/clean` | Show the current settings |
| `/clean on` | The rules, quotes and spelling, plus the Haiku pass for longer messages (default) |
| `/clean filter` | Everything except the Haiku pass, no model calls |
| `/clean off` | Send prompts exactly as typed |
| `/clean last` | Show your last cleaned message, as you wrote it and as sent |
| `/clean fillers` | List the words and phrases that are taken out: built in, yours, and the ones you chose to keep |
| `/clean filler <phrase>` | Add a phrase of your own (one to five words), taken out wherever it stands |
| `/clean filler keep <phrase>` | Leave a phrase in your messages: a built-in one, or one you added |
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

More effort did not help. On 45 real dictated messages, Haiku at `medium` took out fewer empty words than at `low`, took longer, and on two long messages spent its whole reply on thinking and returned no text.

## Cost

Each Haiku call is stateless and goes out through your session's own Claude connection: the message in, the cleaned message out, plus the instructions and, for a project with docs, about a hundred short terms, roughly 1,200 tokens in and 200 out. At Haiku 5.5's list price ($0.10 per million input tokens, $0.50 per million output) that is about $0.0002 a message, or 2 cents per 100 messages. How it counts for you depends on how you sign in (a plan's usage, or API billing). The rules, the quotes and the spelling are free, and `/clean filter` stops the Haiku calls. A typical call takes about 2 seconds, and 4 to 6 for a message of 500 to 1,000 words.

## Install

```
/plugin install dictation-cleanup --marketplace 0langa/claude-code-mods
```
