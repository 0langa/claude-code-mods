# claude-code-mods

Mods for [Claude Code](https://claude.com/claude-code). A mod is a Claude Code plugin with function hooks: TypeScript that runs inside Claude Code and changes how it behaves, for example by rewriting a prompt before it is sent or adding a slash command.

This repository is a plugin marketplace. Each folder is one mod.

| Mod | What it does |
| --- | --- |
| [dictation-cleanup](dictation-cleanup) | Cleans dictated or typed prompts before Claude sees them: filler sounds and repetitions, words that say nothing ("basically", "so yeah", "I guess", a pause "like"), "quote unquote" turned into quotation marks, and project names spelled the way the project's own docs spell them ("ADR seventy four" becomes `ADR-0074`), with nothing to maintain. Longer prompts also get a short Haiku pass for what only context can tell. Each change it makes is checked, so it can take words out and fix spellings but never reword you. |
| [tool-output-diet](tool-output-diet) | Trims shell output before Claude reads it: colour codes, progress bars redrawn a hundred times, and long runs of identical lines. Never touches file contents or the output of a failed command. |
| [no-ai-trailers](no-ai-trailers) | Keeps the Claude co-author trailer and the "Generated with Claude Code" footer out of your commits and pull requests, even when something else tells the model to write them. `/trailers off` for a one-off. |
| [studio-state](studio-state) | For a video-production repo with a `studio/` pipeline and a `projects/<slug>/` folder per video: a `studio_state` tool that answers where a video project stands in about ten lines, instead of a dozen file reads. Registers nothing in any other folder. |
| [deferred-answers](deferred-answers) | When you answer one of Claude's questions with "not now", "later" or "after X" (a button or the question dialog), the question stays open and rides along with every message until it's done or you drop it. No reminding. `/deferred` lists them. |
| [reply-diet](reply-diet) | In the desktop app you can reply to a selected part of Claude's message. Stack many of those and every quoted passage is sent again in full. This cuts each long quote to its first and last words, and Claude looks the rest up in the conversation. Your own words are never touched. `/replies off` turns it off. It also lets you edit a reply that is already attached, which the app does not: send `#edit` as the message and the replies come back into the message box as text. |

## Install

In a Claude Code terminal session (replace the name with any mod above):

```
/plugin install dictation-cleanup --marketplace 0langa/claude-code-mods
```

From a shell:

```bash
claude plugin install dictation-cleanup --marketplace 0langa/claude-code-mods
```

In the Claude desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `0langa/claude-code-mods`, then **Add plugin**.

Pick the **user** scope to have the mod in every session.

## Privacy

This repository is public, and the mods are built so your data never needs to be in it: settings and spellings you add live in Claude Code's own folder on your machine, and a mod never writes a file. Git hooks and a GitHub Action also scan every commit and push for personal data. See [PRIVACY.md](PRIVACY.md); after cloning, switch the hooks on with `git config core.hooksPath .githooks`.

## Developing

Each mod folder has `.claude-plugin/plugin.json`, `hooks/hooks.json` naming its hooks module, the module itself in `hooks/`, and tests in `tests/`.

```bash
claude plugin validate dictation-cleanup
```

```bash
claude plugin test dictation-cleanup
```

To work on a mod from this folder, add the folder as a marketplace (`claude plugin marketplace add <path to this folder>`) and install from it. Claude Code then reads the mod from this folder directly, and `/reload-plugins` picks up edits.

## License

MIT
