# claude-code-mods

A Claude Code plugin marketplace of mods (plugins with function hooks), published at https://github.com/0langa/claude-code-mods.

- One folder per mod: `<mod>/.claude-plugin/plugin.json`, `<mod>/hooks/hooks.json` naming the hooks module, the module in `<mod>/hooks/`, tests in `<mod>/tests/`, and a `README.md`.
- Every mod is listed in `.claude-plugin/marketplace.json` (`"source": "./<mod>"`) and in the table in `README.md`.
- Before committing a change: `claude plugin validate <mod>` and `claude plugin test <mod>`. Bump `version` in the mod's `plugin.json` for changes others should get.
- This folder is installed as the `claude-code-mods` marketplace, read from disk, so edits apply after `/reload-plugins` or in the next session.
- A mod is silent when it works: no toast, log line, status note or text appended to a result on the success path. It speaks only when something fails, or when the user asked to see it (a command, an opt-in setting). Tests assert the silence.

## This repository is public: keep personal data out (see `PRIVACY.md`)

Everything here, and every commit, is readable by anyone. Treat a push as publishing.

- Never put personal or private-project data into a file, test, README, comment or commit message: real names, titles, IDs (a YouTube video ID makes an unlisted video watchable), file paths with a username, emails, tokens, the contents of a user's settings or dictionary, or anything copied from a private repository. Use made-up examples (`AAAAAAAAAAA`, `example-video`, `C:\Users\you`, `ada@example.com`).
- A mod must never write a file or start a process. Its settings and the user's own data go in `$.store`, which Claude Code keeps in the user's own folder, never in this repository. Data read from a project (its docs, its terms) stays in memory.
- Do not generalise a private project's layout into a mod's README or tests; describe the layout the mod looks for, in neutral terms.
- Hooks in `.githooks/` run `privacy-scan.sh` on every commit and push (switch on once per clone: `git config core.hooksPath .githooks`). When they block, fix the content; do not use `--no-verify`. A harmless fixture line can carry the word `privacy-ok`.
- The user's private words live in `.privacy/denylist.local.txt` (ignored by git). Never print, copy, move or commit that file or its contents.
- Push only when the user says so, and never with `--no-verify`.
