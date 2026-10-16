# claude-code-mods

Mods for [Claude Code](https://claude.com/claude-code). A mod is a Claude Code plugin with function hooks: TypeScript that runs inside Claude Code and changes how it behaves, for example by rewriting a prompt before it is sent or adding a slash command.

This repository is a plugin marketplace. Each folder is one mod.

| Mod | What it does |
| --- | --- |
| [dictation-cleanup](dictation-cleanup) | Cleans dictated prompts before Claude sees them: filler words and repetitions, "quote unquote" turned into quotation marks, and project names spelled the way the project's own docs spell them ("ADR seventy four" becomes `ADR-0074`), with nothing to maintain. Longer prompts also get a short Haiku pass that streamlines the wording while keeping everything you meant. |
| [tool-output-diet](tool-output-diet) | Trims shell output before Claude reads it: colour codes, progress bars redrawn a hundred times, and long runs of identical lines. Never touches file contents or the output of a failed command. |
| [no-ai-trailers](no-ai-trailers) | Keeps the Claude co-author trailer and the "Generated with Claude Code" footer out of your commits and pull requests, even when something else tells the model to write them. `/trailers off` for a one-off. |
| [studio-state](studio-state) | For a video-production repo with a `studio/` pipeline and a `projects/<slug>/` folder per video: a `studio_state` tool that answers where a video project stands in about ten lines, instead of a dozen file reads. Registers nothing in any other folder. |

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
