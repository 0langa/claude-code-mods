import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { describeProject, listProjects } from '../hooks/summarize'
import type { Files } from '../hooks/summarize'

type Fixture = Record<string, { text?: string; mtime?: number }>

// A repository in memory: paths to text and modification time.
const repo = (entries: Fixture): Files => ({
  read: async path => entries[path]?.text,
  mtime: async path => entries[path]?.mtime,
  dirs: async path => [...new Set(Object.keys(entries).filter(key => key.startsWith(`${path}/`)).map(key => key.slice(path.length + 1).split('/')[0] ?? ''))],
})

const STUDIO = JSON.stringify({
  slug: 'example-video',
  stages: {
    new: { at: '2026-10-16T18:53:39Z' },
    validate: { at: '2026-10-16T19:20:53Z', warnings: 0, scenes: 7, narrated_scenes: 7, estimated_seconds: 149.1, chapters: 5, claim_kinds: { 'docs-cited': 5, demonstration: 0, editorial: 2 } },
    assemble: { at: '2026-10-16T19:22:39Z' },
    publish: { at: '2026-10-16T19:29:26Z' },
  },
})
const FINAL = JSON.stringify({ duration_s: 150.833, output: { bytes: 268105538 }, loudness: { integrated_lufs: -14.1, true_peak_dbtp: -3.8 }, segments: Array(7).fill({}) })
const META = JSON.stringify({ title: 'How a thing works', series: 'example-series' })
const REGISTRY = 'id: example-video\nstatus: unlisted\n\npublish:\n  video_id: AAAAAAAAAAA\n  date: 2026-10-16\n'

const base = (extra: Fixture = {}): Fixture => ({
  'projects/example-video/studio.json': { text: STUDIO },
  'projects/example-video/final.json': { text: FINAL },
  'projects/example-video/metadata.json': { text: META, mtime: 1000 },
  'projects/example-video/sources.json': { text: '[{},{},{}]' },
  'projects/example-video/script.json': { mtime: 1000 },
  'projects/example-video/final.mp4': { mtime: 5000 },
  'projects/example-video/description.md': { mtime: 5000 },
  'projects/example-video/review/contact-sheet.png': { mtime: 6000 },
  'renders/example-video/final.mp4': { mtime: 5000 },
  'registry/videos/example-video.yaml': { text: REGISTRY },
  ...extra,
})

describe('describeProject', () => {
  test('a finished project in a few lines', async () => {
    const text = await describeProject(repo(base()), 'example-video')

    expect(text).toContain('example-video — How a thing works  [series: example-series]')
    expect(text).toContain('Cut: final.mp4 150.8 s, 256 MB, -14.1 LUFS, true peak -3.8 dBTP, 7 scenes.')
    expect(text).toContain('Script: 7 scenes (7 narrated), about 149.1 s, 5 chapters, claims 5 docs-cited / 0 demonstration / 2 editorial, 0 validate warnings.')
    expect(text).toContain('Stages run: new, validate, assemble, publish (last: publish, 2026-10-16 19:29Z). Not run: tts, align, stills, storyboard, render, thumbnail, package.')
    expect(text).toContain('Needs attention: nothing (by file times).')
    expect(text).toContain('Sources: 3 snapshots.')
    expect(text).toContain('Registry: unlisted, YouTube AAAAAAAAAAA (2026-10-16).')
    expect(text).toContain('Shorts: none planned.')
    expect(text.split('\n').length).toBeLessThan(12)
  })

  test('says what to rerun when a file is newer than what was built from it', async () => {
    const text = await describeProject(
      repo(
        base({
          'projects/example-video/script.json': { mtime: Date.parse('2026-10-16T20:00:00Z') },
          'projects/example-video/metadata.json': { text: META, mtime: 9000 },
          'projects/example-video/review/contact-sheet.png': { mtime: 4000 },
          'renders/example-video/final.mp4': { mtime: 3000 },
        }),
      ),
      'example-video',
    )

    expect(text).toContain('script.json was edited after the last validate: python -m studio validate example-video')
    expect(text).toContain('script.json is newer than final.mp4: python -m studio run example-video')
    expect(text).toContain('metadata.json is newer than description.md: python -m studio package example-video')
    expect(text).toContain('the frames have not been reviewed since the cut changed: python -m studio frames example-video')
    expect(text).toContain('renders/example-video/final.mp4 is older than final.mp4: python -m studio publish example-video')
  })

  test('a project with no cut, no registry entry and one planned Short', async () => {
    const text = await describeProject(
      repo({
        'projects/new-one/studio.json': { text: JSON.stringify({ stages: { new: { at: '2026-10-16T10:00:00Z' } } }) },
        'projects/new-one/shorts.json': { text: JSON.stringify({ shorts: [{ stem: 'short-1', shape: 'mechanism', title: 'The loop' }] }) },
        'projects/new-one/sources.json': { text: '[{}]' },
      }),
      'new-one',
    )

    expect(text).toContain('new-one — (no title yet)')
    expect(text).toContain('Cut: none yet (no final.json).')
    expect(text).toContain('Script: not validated yet.')
    expect(text).toContain('Sources: 1 snapshot.')
    expect(text).toContain('Registry: no entry yet (publish has not run).')
    expect(text).toContain('short-1 (mechanism, "The loop"): planned, not cut; no registry entry')
  })

  test('a cut Short and its registry entry', async () => {
    const text = await describeProject(
      repo(
        base({
          'projects/example-video/shorts.json': { text: JSON.stringify({ shorts: [{ stem: 'short-1', shape: 'number', title: 'Fifteen words' }] }) },
          'projects/example-video/shorts/short-1.mp4': { mtime: 7000 },
          'registry/videos/example-video-short-1.yaml': { text: 'status: in-production\npublish:\n  video_id: null\n' },
        }),
      ),
      'example-video',
    )

    expect(text).toContain('short-1 (number, "Fifteen words"): cut; in-production, not uploaded')
  })

  test('an unknown project lists the real ones', async () => {
    expect(await describeProject(repo(base()), 'nope')).toBe('No project "nope" (no projects/nope/studio.json). Projects: example-video.')
  })
})

describe('listProjects', () => {
  test('one line per project', async () => {
    const text = await listProjects(repo(base({ 'projects/other/studio.json': { text: JSON.stringify({ stages: { validate: { at: '2026-10-16T10:00:00Z' } } }) } })))

    expect(text).toContain('2 projects')
    expect(text).toContain('other — (no title yet) — last stage validate — no cut — no registry entry')
    expect(text).toContain('example-video — How a thing works — last stage publish — cut 151 s — unlisted, YouTube AAAAAAAAAAA (2026-10-16)')
  })

  test('no projects at all', async () => {
    expect(await listProjects(repo({}))).toBe('No projects under projects/.')
  })
})

// The engine beneath the plugin: a folder, as the studio repo has it or not.
const folder = (on: On, entries: Fixture, isStudio: boolean) => {
  const registered: { name: string; description: string; isDeferred?: boolean }[] = []
  const pathOf = (path: string) => path.replaceAll('\\', '/')
  const find = (path: string) => Object.entries(entries).find(([name]) => pathOf(path).endsWith(`/${name}`) || pathOf(path) === name)?.[1]
  const studioFiles = ['studio/schema.py', 'projects']

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('tool.register', (_$, e) => {
    registered.push(e)

    return { value: { tool: `mcp__studio-state__${e.name}` } }
  })
  on('fs.exists', (_$, e) => ({ value: isStudio && studioFiles.some(name => pathOf(e.path).endsWith(`/${name}`)) }))
  on('fs.read', (_$, e) => {
    const text = find(e.path)?.text

    if (text === undefined) {
      throw new Error('ENOENT')
    }

    return { value: text }
  })
  on('fs.stat', (_$, e) => {
    const entry = find(e.path)

    if (entry === undefined) {
      throw new Error('ENOENT')
    }

    return { value: { kind: 'file' as const, size: 1, mtimeMs: entry.mtime ?? 0, isLink: false } }
  })
  on('fs.list', (_$, e) => ({
    value: pathOf(e.path).endsWith('/projects') ? [{ name: 'example-video', kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false }] : [],
  }))

  return registered
}

describe('the mod', () => {
  test('in the studio repo the tool is registered, in the prompt from the start', async ($, on) => {
    const registered = folder(on, base(), true)
    await $.session.start({ cwd: '/repo' } as never)

    expect(registered.length).toBe(1)
    expect(registered[0]?.name).toBe('studio_state')
    expect(registered[0]?.isDeferred).toBe(false)
    expect(registered[0]?.description).toContain('Read-only')
  })

  test('in any other folder nothing is registered, so nothing costs a token', async ($, on) => {
    const registered = folder(on, {}, false)
    await $.session.start({ cwd: '/elsewhere' } as never)

    expect(registered).toEqual([])
  })

  test('a call with a slug answers with the project, and with none lists them', async ($, on) => {
    folder(on, base(), true)
    const ask = async (input: Record<string, unknown>) => {
      const ran = (await $.tool.call({ tool: 'mcp__studio-state__studio_state', ...input } as never)) as { result?: { content: { text: string }[]; isError: boolean } }

      return ran.result?.content[0]?.text ?? ''
    }

    expect(await ask({ slug: 'example-video' })).toContain('Registry: unlisted, YouTube AAAAAAAAAAA')
    expect(await ask({})).toContain('1 projects')
    expect(await ask({ slug: '../../private' })).toContain('is not a project folder name')
  })
})
