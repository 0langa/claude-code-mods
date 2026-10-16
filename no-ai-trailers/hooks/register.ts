import type { EngineInterface, Register } from 'claude-code'

import { stripAttribution } from './strip'

const isEnabled = async ($: EngineInterface) => (await $.store.get('enabled')) !== false

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'trailers',
      description: 'Claude co-author trailers in commits and PRs: on (removed) or off (left as Claude writes them)',
      argumentHint: '[on|off]',
      immediate: true,
    })

    return next(e)
  })

  on('command.run', { command: 'trailers' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'on' || arg === 'off') {
      await $.store.set('enabled', arg === 'on')
    }
    const state = (await isEnabled($)) ? 'on: Claude trailers are kept out of commits and pull requests' : 'off: Claude writes its trailers as usual'

    return { text: `no-ai-trailers is ${state}. Use /trailers on or /trailers off.` }
  })

  // Layer one: the model is not told to write the trailer or the footer at all.
  on('attribution.text', async ($, e, next) =>
    (e.kind === 'commit' || e.kind === 'pr') && (await isEnabled($)) ? { text: '' } : next(e),
  )

  // Layer two: if one is written anyway (an instruction from somewhere else, a
  // habit), it is removed from the command before it runs.
  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    if (!(await isEnabled($))) {
      return next(e)
    }
    const { command, removed } = stripAttribution(e.command)

    if (removed === 0) {
      return next(e)
    }

    return next({ ...e, command })
  })
}
