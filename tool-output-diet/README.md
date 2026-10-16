# tool-output-diet

Shell commands print a lot that Claude has no use for: colour codes, progress bars redrawn a hundred times, the same retry line forty times. Claude reads all of it, and it stays in the conversation for every turn after. This mod trims that before Claude reads it.

## What it trims

Only three things, all of which are noise by construction:

1. **Colour and cursor codes** (`ESC[31m` and friends). A terminal draws them as colour; as text they are junk.
2. **Progress frames drawn over each other.** A progress bar is one line redrawn with a carriage return (`10%`, `40%`, `100%`). A terminal shows the last frame, so that is the one Claude gets. Typical of model downloads, `pip`, `npm`, `ffmpeg` and renderers.
3. **Long runs of identical lines.** Four or more of the same line in a row are shown once, followed by `[the line above is repeated N more times]`.

When something was cut, one line at the end says what: `[output condensed: 79 overwritten progress frames removed]`. Claude is told, so nothing is silently different.

## What it never does

- It does not touch file contents. `Read`, `Grep`, `Edit` and `Write` are not hooked: Claude sees exactly what is in your files.
- It does not truncate, summarise, or drop lines by guessing they are unimportant. Everything that is not one of the three things above is returned as it was.
- It does not touch the output of a command that failed (a non-zero exit). That is where exact text matters most.
- It leaves image output and anything that would save under about 300 characters (roughly 75 tokens) alone.

If the mod itself fails, the output goes through untouched.

## Commands

| Command | Effect |
| --- | --- |
| `/diet` | Show whether it is on and how much it has saved (an estimate, at about 4 characters a token) |
| `/diet on` / `/diet off` | Turn it on or off; saved across sessions |

## Install

```
/plugin install tool-output-diet --marketplace 0langa/claude-code-mods
```
