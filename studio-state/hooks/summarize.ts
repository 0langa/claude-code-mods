// Where a studio video project stands, in a few lines, from the files the
// studio's stages already write (projects/<slug>/studio.json, final.json,
// metadata.json, shorts.json, and the registry entry). Read only.

export type Files = {
  /** The file's text, or undefined when there is none. */
  read: (path: string) => Promise<string | undefined>
  /** The file's modification time in milliseconds, or undefined when there is none. */
  mtime: (path: string) => Promise<number | undefined>
  /** The names of the directories inside a directory. */
  dirs: (path: string) => Promise<string[]>
}

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

// The order `python -m studio run` and `publish` go in.
const STAGES = ['new', 'validate', 'tts', 'align', 'stills', 'storyboard', 'render', 'assemble', 'thumbnail', 'package', 'publish']

type Stage = { at?: string; [key: string]: unknown }
type StudioJson = { stages?: Record<string, Stage | undefined> }
type FinalJson = {
  duration_s?: number
  output?: { bytes?: number }
  loudness?: { integrated_lufs?: number; true_peak_dbtp?: number }
  segments?: unknown[]
}
type Metadata = { title?: string; series?: string }
type ShortsPlan = { shorts?: { stem?: string; shape?: string; title?: string }[] }

const parse = <T>(text: string | undefined): T | undefined => {
  if (text === undefined) {
    return undefined
  }
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}

const num = (value: unknown) => (typeof value === 'number' ? value : undefined)
const stamp = (at: string | undefined) => (at === undefined ? '?' : `${at.slice(0, 10)} ${at.slice(11, 16)}Z`)

// A registry entry: the studio writes it as plain YAML, so two lines are enough.
const registryOf = (yaml: string | undefined) => {
  if (yaml === undefined) {
    return undefined
  }
  const status = /^status:[ \t]*(\S+)/m.exec(yaml)?.[1]
  const id = /^[ \t]+video_id:[ \t]*(\S+)/m.exec(yaml)?.[1]
  const date = /^[ \t]+date:[ \t]*(\S+)/m.exec(yaml)?.[1]
  const isUploaded = id !== undefined && id !== 'null' && id !== '~' && id !== '""'

  return { status: status ?? '?', text: isUploaded ? `${status ?? '?'}, YouTube ${id}${date !== undefined && date !== 'null' ? ` (${date})` : ''}` : `${status ?? '?'}, not uploaded` }
}

const lastStage = (studio: StudioJson | undefined) => {
  const done = STAGES.filter(stage => studio?.stages?.[stage] !== undefined)

  return done.length === 0
    ? undefined
    : done.reduce((latest, stage) => ((studio?.stages?.[stage]?.at ?? '') >= (studio?.stages?.[latest]?.at ?? '') ? stage : latest), done[0] ?? 'new')
}

export const listProjects = async (files: Files) => {
  const slugs = (await files.dirs('projects')).filter(name => SLUG.test(name)).sort()

  if (slugs.length === 0) {
    return 'No projects under projects/.'
  }
  const lines = await Promise.all(
    slugs.map(async slug => {
      const base = `projects/${slug}`
      const [studioText, metaText, finalText, registryText] = await Promise.all([
        files.read(`${base}/studio.json`),
        files.read(`${base}/metadata.json`),
        files.read(`${base}/final.json`),
        files.read(`registry/videos/${slug}.yaml`),
      ])
      const studio = parse<StudioJson>(studioText)
      const final = parse<FinalJson>(finalText)
      const last = lastStage(studio)
      const duration = num(final?.duration_s)
      const registry = registryOf(registryText)

      return [
        slug,
        parse<Metadata>(metaText)?.title ?? '(no title yet)',
        last === undefined ? 'no stage run' : `last stage ${last}`,
        duration === undefined ? 'no cut' : `cut ${duration.toFixed(0)} s`,
        registry?.text ?? 'no registry entry',
      ].join(' — ')
    }),
  )

  return `${slugs.length} projects (studio_state with a slug gives the detail):\n${lines.join('\n')}`
}

export const describeProject = async (files: Files, slug: string) => {
  const base = `projects/${slug}`
  const studio = parse<StudioJson>(await files.read(`${base}/studio.json`))

  if (studio === undefined) {
    const known = (await files.dirs('projects')).filter(name => SLUG.test(name)).sort()

    return `No project "${slug}" (no ${base}/studio.json). Projects: ${known.join(', ') || 'none'}.`
  }
  const [metaText, finalText, sourcesText, shortsText, registryText] = await Promise.all([
    files.read(`${base}/metadata.json`),
    files.read(`${base}/final.json`),
    files.read(`${base}/sources.json`),
    files.read(`${base}/shorts.json`),
    files.read(`registry/videos/${slug}.yaml`),
  ])
  const meta = parse<Metadata>(metaText)
  const final = parse<FinalJson>(finalText)
  const stages = studio.stages ?? {}
  const lines: string[] = []

  lines.push(`${slug} — ${meta?.title ?? '(no title yet)'}${meta?.series === undefined ? '' : `  [series: ${meta.series}]`}`)

  const duration = num(final?.duration_s)

  lines.push(
    duration === undefined
      ? 'Cut: none yet (no final.json).'
      : `Cut: final.mp4 ${duration.toFixed(1)} s, ${Math.round((num(final?.output?.bytes) ?? 0) / 1048576)} MB, ${final?.loudness?.integrated_lufs ?? '?'} LUFS, true peak ${final?.loudness?.true_peak_dbtp ?? '?'} dBTP, ${final?.segments?.length ?? '?'} scenes.`,
  )

  const validate = stages.validate
  const claims = validate?.claim_kinds as Record<string, number> | undefined

  lines.push(
    validate === undefined
      ? 'Script: not validated yet.'
      : `Script: ${validate.scenes} scenes (${validate.narrated_scenes} narrated), about ${validate.estimated_seconds} s, ${validate.chapters} chapters, claims ${claims?.['docs-cited'] ?? 0} docs-cited / ${claims?.demonstration ?? 0} demonstration / ${claims?.editorial ?? 0} editorial, ${validate.warnings} validate warnings.`,
  )

  const ran = STAGES.filter(stage => stages[stage] !== undefined)
  const notRun = STAGES.filter(stage => stages[stage] === undefined)
  const last = lastStage(studio)

  lines.push(`Stages run: ${ran.join(', ') || 'none'}${last === undefined ? '' : ` (last: ${last}, ${stamp(stages[last]?.at)})`}.${notRun.length === 0 ? '' : ` Not run: ${notRun.join(', ')}.`}`)

  // Which file was edited after the thing built from it. File times, so a hint.
  const t = async (path: string) => files.mtime(`${base}/${path}`)
  const [script, metadata, finalMp4, description, frames, validatedAt] = await Promise.all([
    t('script.json'),
    t('metadata.json'),
    t('final.mp4'),
    t('description.md'),
    t('review/contact-sheet.png'),
    Promise.resolve(validate?.at === undefined ? undefined : Date.parse(validate.at)),
  ])
  const publishCopy = await files.mtime(`renders/${slug}/final.mp4`)
  const attention: string[] = []

  if (script !== undefined && validatedAt !== undefined && script > validatedAt + 2000) {
    attention.push('script.json was edited after the last validate: python -m studio validate ' + slug)
  }
  if (script !== undefined && finalMp4 !== undefined && script > finalMp4 + 1000) {
    attention.push('script.json is newer than final.mp4: python -m studio run ' + slug)
  }
  if (metadata !== undefined && description !== undefined && metadata > description + 1000) {
    attention.push('metadata.json is newer than description.md: python -m studio package ' + slug)
  }
  if (finalMp4 !== undefined && (frames === undefined || frames < finalMp4)) {
    attention.push('the frames have not been reviewed since the cut changed: python -m studio frames ' + slug)
  }
  if (finalMp4 !== undefined && publishCopy !== undefined && publishCopy < finalMp4 - 1000) {
    attention.push(`renders/${slug}/final.mp4 is older than final.mp4: python -m studio publish ${slug}`)
  }
  if (typeof validate?.warnings === 'number' && validate.warnings > 0) {
    attention.push(`validate left ${validate.warnings} warnings: read them and decide`)
  }
  lines.push(attention.length === 0 ? 'Needs attention: nothing (by file times).' : `Needs attention (by file times):\n- ${attention.join('\n- ')}`)

  const sources = parse<unknown[]>(sourcesText)

  const sourceCount = Array.isArray(sources) ? sources.length : 0

  lines.push(`Sources: ${sourceCount} ${sourceCount === 1 ? 'snapshot' : 'snapshots'}.`)
  lines.push(`Registry: ${registryOf(registryText)?.text ?? 'no entry yet (publish has not run)'}.`)

  const shorts = parse<ShortsPlan>(shortsText)?.shorts ?? []

  if (shorts.length === 0) {
    lines.push('Shorts: none planned.')
  } else {
    const rows = await Promise.all(
      shorts.map(async short => {
        const stem = short.stem ?? '?'
        const isCut = (await files.mtime(`${base}/shorts/${stem}.mp4`)) !== undefined
        const entry = registryOf(await files.read(`registry/videos/${slug}-${stem}.yaml`))

        return `${stem} (${short.shape ?? '?'}, "${short.title ?? ''}"): ${isCut ? 'cut' : 'planned, not cut'}; ${entry?.text ?? 'no registry entry'}`
      }),
    )

    lines.push(`Shorts:\n- ${rows.join('\n- ')}`)
  }

  return lines.join('\n')
}
