import type { EngineInterface, Register } from 'claude-code'

import { describeProject, listProjects, SLUG } from './summarize'
import type { Files } from './summarize'

const TOOL = 'mcp__studio-state__studio_state'

const DESCRIPTION =
  'Where a studio video project stands, in about ten lines: title and series, the cut (length, size, loudness, scenes), script figures, ' +
  'which stages have run, files edited after what was built from them (what to rerun), source count, registry and upload status, and Shorts. ' +
  'Read-only. Use it instead of listing projects/<slug>/ and reading studio.json, final.json, metadata.json and the registry entry. ' +
  'With no slug it lists every project in one line each.'

const filesOf = ($: EngineInterface): Files => ({
  read: path => $.fs.read(path).catch(() => undefined),
  mtime: path => $.fs.stat(path).then(stat => stat.mtimeMs, () => undefined),
  dirs: path => $.fs.list(path).then(entries => entries.filter(entry => entry.kind === 'dir').map(entry => entry.name), () => []),
})

// Only the studio repo: nothing is registered, so nothing costs a token, anywhere else.
const isStudioRepo = async ($: EngineInterface) => (await $.fs.exists('studio/schema.py')) && (await $.fs.exists('projects'))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (await isStudioRepo($).catch(() => false)) {
      await $.tool.register({
        name: 'studio_state',
        description: DESCRIPTION,
        inputSchema: {
          type: 'object',
          properties: { slug: { type: 'string', description: 'The project folder name under projects/. Leave out to list all projects.' } },
        },
        // In the prompt's tool list from the start: that is what makes it the first thing reached for.
        isDeferred: false,
      })
    }

    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const slug = typeof e.slug === 'string' ? e.slug.trim() : ''
    const files = filesOf($)
    const text =
      slug === ''
        ? await listProjects(files)
        : SLUG.test(slug)
          ? await describeProject(files, slug)
          : `"${slug}" is not a project folder name (lowercase letters, digits and single dashes).`

    return { result: { content: [{ type: 'text', text }], isError: false } }
  })
}
