# claude-code-mods

A Claude Code plugin marketplace of mods (plugins with function hooks), published at https://github.com/0langa/claude-code-mods.

- One folder per mod: `<mod>/.claude-plugin/plugin.json`, `<mod>/hooks/hooks.json` naming the hooks module, the module in `<mod>/hooks/`, tests in `<mod>/tests/`, and a `README.md`.
- Every mod is listed in `.claude-plugin/marketplace.json` (`"source": "./<mod>"`) and in the table in `README.md`.
- Before committing a change: `claude plugin validate <mod>` and `claude plugin test <mod>`. Bump `version` in the mod's `plugin.json` for changes others should get.
- This folder is installed as the `claude-code-mods` marketplace, read from disk, so edits apply after `/reload-plugins` or in the next session.
