# claude-code-mods

Mods for [Claude Code](https://claude.com/claude-code). A mod is a Claude Code plugin with function hooks: TypeScript that runs inside Claude Code and changes how it behaves, for example by rewriting a prompt before it is sent or adding a slash command.

This repository is a plugin marketplace. Each folder is one mod.

| Mod | What it does |
| --- | --- |
| [dictation-cleanup](dictation-cleanup) | Removes filler words ("uh", "um") and repetitions from dictated prompts before Claude sees them. Longer prompts also get a short Haiku pass that streamlines the wording while keeping everything you meant. |

## Install

In a Claude Code terminal session:

```
/plugin install dictation-cleanup --marketplace 0langa/claude-code-mods
```

From a shell:

```bash
claude plugin install dictation-cleanup --marketplace 0langa/claude-code-mods
```

In the Claude desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `0langa/claude-code-mods`, then **Add plugin**.

Pick the **user** scope to have the mod in every session.

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
