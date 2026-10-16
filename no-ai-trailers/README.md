# no-ai-trailers

Claude Code adds `Co-Authored-By: Claude ... <noreply@anthropic.com>` to commits it writes and a `Generated with Claude Code` footer to pull requests it opens. If you want your commits to carry only your name, this mod keeps both out.

## How

Two layers, because telling the model is advice and a command is a fact:

1. **The model is told not to write them.** The mod blanks the text Claude Code asks the model to put in a commit or a pull request.
2. **If one is written anyway, it is removed.** Instructions can come from other places (the app, a project file, habit). Before a `git commit` or `gh pr create` / `gh pr edit` command runs, the mod deletes any Claude co-author line, any Anthropic `noreply` co-author line, and the Generated-with footer from the command, in `Bash` and `PowerShell` alike. A toast tells you when it did.

A co-author you name yourself (`Co-Authored-By: Ada Lovelace <ada@example.com>`) is never touched. Only commit and pull request commands are looked at, so `git log --grep` or an `echo` is left alone.

## Turning it off for a while

`/trailers off` lets Claude write its trailers as usual, for a repository where you want them or a one-off. `/trailers on` brings the mod back; `/trailers` shows which it is. The setting is saved across sessions and applies to every project.

## Notes

- The first layer, the `attribution.text` hook, does not run in a plugin you install where an organization manages Claude Code; there the second layer still removes the lines from the command.
- Check it once after installing: make a commit in a scratch repository and read `git log -1`.

## Install

```
/plugin install no-ai-trailers --marketplace 0langa/claude-code-mods
```
