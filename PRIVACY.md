# Privacy: this repository is public

Anyone can read and download everything in this repository, and its whole history. Nothing personal may ever be committed: not a name list, a dictionary, a path on someone's machine, an ID, a token, or anything copied from a private project. Once it is pushed, treat it as published: clones, forks and caches keep it even after a force-push.

The rule is simple, and the tooling below enforces it so it does not depend on remembering.

## Where personal data lives (and why it cannot end up here)

| What | Where | In this repo? |
| --- | --- | --- |
| Your settings and hand-added spellings (`/clean term ...`, `/clean off`, `/diet off`, `/trailers off`) | Claude Code's own plugin store in your user folder (`~/.claude/plugins/store/`) | No |
| Terms read from a project's docs | Memory only, for the length of a session. Never written to disk | No |
| Your private words for the scanner | `.privacy/denylist.local.txt` | No: git ignores `.privacy/` |

No mod in this repository writes a file or starts a process. The scanner fails a commit that adds code which would.

## What stops a leak

1. **`.gitignore`** keeps the usual suspects out of git altogether: `.privacy/`, `.secrets/`, `.env*`, `*.local.*`, databases, keys, and anything named like a terms, dictionary, vocabulary or glossary data file.
2. **`pre-commit` hook** scans what is about to be committed.
3. **`pre-push` hook** scans every commit about to reach GitHub, including older ones. It is the last line of defence, and it is why a leak that slipped past the commit hook still does not get out.
4. **GitHub Action `privacy-scan`** runs the same scan on GitHub's side, for a push from a machine where the hooks are not switched on.

The scan, in [`.githooks/privacy-scan.sh`](.githooks/privacy-scan.sh), looks for:

- private keys and common API token shapes;
- a real person's home folder in a path (`C:\Users\<name>`, `/home/<name>`, `/Users/<name>`; placeholders like `you` and `<name>` pass);
- email addresses (except `noreply`, `example.com`, `anthropic.com`);
- YouTube video IDs, which make an unlisted video watchable by anyone (the placeholder `AAAAAAAAAAA` passes);
- files that hold personal data by nature (`.env`, databases, keys, `*terms*.json`, ...);
- code that writes a file;
- **your own words**, from `.privacy/denylist.local.txt`.

## Switch it on (once per clone)

```bash
git config core.hooksPath .githooks
```

Git does not carry hook settings in a clone, so run this in every new clone. The GitHub Action covers the gap if you forget.

## Your private words

Put anything that is yours alone in `.privacy/denylist.local.txt`: one word, name, ID or path per line, matched anywhere, ignoring case. A commit or push containing one is blocked. The file is ignored by git, so the words in it never reach GitHub.

```text
# example lines
a-private-project-name
C:\Users\your-name
```

## Writing examples, tests and docs

Use made-up data: a placeholder ID (`AAAAAAAAAAA`), `example-video`, `C:\Users\you`, `ada@example.com`. Never paste a real project name, title, ID, path or output from a private project into a README, a test or a comment. A line that is a deliberate, harmless exception can carry the word `privacy-ok`.

## If something gets out anyway

1. **Fix the source first.** A leaked unlisted video: make it private or delete it. A leaked token: revoke it and issue a new one. Rewriting git history does not recall a copy someone already has.
2. Remove it from the repository:
   ```bash
   # edit the files, then rewrite the commit(s) that contained it
   git reset --soft <last-clean-commit>
   git commit -m "..."
   git push --force-with-lease=main:<the-sha-on-GitHub> origin main
   ```
3. GitHub keeps the old commit reachable by its SHA for a while. To remove cached views and the SHA itself, ask GitHub Support to run garbage collection, or, if nothing else depends on the repository, delete it and recreate it.
4. Add the leaked word or ID to `.privacy/denylist.local.txt` so it is blocked for good.

## Checking by hand

```bash
sh .githooks/privacy-scan.sh tree        # every tracked file as it is now
sh .githooks/privacy-scan.sh range HEAD  # every commit in the history
```
