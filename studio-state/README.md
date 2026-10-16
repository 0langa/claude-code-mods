# studio-state

For a video-production repository with a `studio/` pipeline and one `projects/<slug>/` folder per video, the layout the mod looks for. To find out where a video project stands, an agent lists `projects/<slug>/`, reads `studio.json`, `final.json`, `metadata.json`, checks the registry entry, and compares file times in its head. This mod gives Claude one tool, `studio_state`, that does all of it and answers in about ten lines.

```
example-video — How a thing works  [series: example-series]
Cut: final.mp4 150.8 s, 256 MB, -14.1 LUFS, true peak -3.8 dBTP, 7 scenes.
Script: 7 scenes (7 narrated), about 149.1 s, 5 chapters, claims 5 docs-cited / 0 demonstration / 2 editorial, 0 validate warnings.
Stages run: new, validate, tts, align, stills, storyboard, render, assemble, thumbnail, package, publish (last: publish, 2026-10-16 19:29Z).
Needs attention: nothing (by file times).
Sources: 3 snapshots.
Registry: unlisted, YouTube AAAAAAAAAAA (2026-10-16).
Shorts: none planned.
```

With no slug it lists every project in one line each.

## What "Needs attention" means

It compares file times, so it is a hint, not a proof (a fresh `git clone` gives every file the same time). It says so when:

- `script.json` was edited after the last `validate`, or is newer than `final.mp4` (`run` is due);
- `metadata.json` is newer than `description.md` (`package` is due);
- the cut changed and the frames were not reviewed since (`frames` is due);
- `renders/<slug>/final.mp4` is older than `final.mp4` (`publish` is due);
- `validate` left warnings.

## What it does not do

It only reads. It never runs a stage, never touches credentials, never uploads. The slug is checked against the studio's own slug rule (lowercase letters, digits, single dashes), so it cannot be pointed at another path.

## Only in the studio repo

The mod is installed like the others, for every session, but when a session starts it checks for `studio/schema.py` and `projects/` in the folder. Anywhere else it registers nothing, so the tool is not in the prompt and costs no tokens. In the studio repo the tool is in the prompt's tool list from the start (roughly 200 tokens), which is what makes it the first thing reached for.

## Install

```
/plugin install studio-state --marketplace 0langa/claude-code-mods
```
