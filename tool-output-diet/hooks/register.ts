import type { EngineInterface, Register } from 'claude-code'

import { condense } from './condense'

// Output is left alone unless this many characters (about 75 tokens) go.
const MIN_SAVED_CHARS = 300
// Rough size of a token for English text and logs.
const CHARS_PER_TOKEN = 4

type ShellResult = { stdout?: unknown; stderr?: unknown; isImage?: unknown }

const isEnabled = async ($: EngineInterface) => (await $.store.get('enabled')) !== false

const addSaved = async ($: EngineInterface, chars: number) => {
  const total = Number(await $.store.get('savedChars')) || 0
  const calls = Number(await $.store.get('calls')) || 0

  await $.store.set('savedChars', total + chars)
  await $.store.set('calls', calls + 1)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'diet',
      description: 'Tool-output diet: on, off, or how much it has saved',
      argumentHint: '[on|off]',
      immediate: true,
    })

    return next(e)
  })

  on('command.run', { command: 'diet' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'on' || arg === 'off') {
      await $.store.set('enabled', arg === 'on')

      return { text: `Tool-output diet: ${arg}.` }
    }
    const chars = Number(await $.store.get('savedChars')) || 0
    const calls = Number(await $.store.get('calls')) || 0
    const state = (await isEnabled($)) ? 'on' : 'off'

    return {
      text: `Tool-output diet is ${state}. It has trimmed ${calls} command outputs, about ${Math.round(chars / CHARS_PER_TOKEN)} tokens in all. Use /diet on or /diet off.`,
    }
  })

  // Only the output of a command that succeeded. A failed command's output is
  // left exactly as it came: that is where the exact text matters most.
  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny !== undefined || ran.isError === true || !(await isEnabled($))) {
      return ran
    }
    const result = ran.result as ShellResult | null

    if (typeof result !== 'object' || result === null || typeof result.stdout !== 'string' || result.isImage === true) {
      return ran
    }
    const stdout = condense(result.stdout)
    const stderr = typeof result.stderr === 'string' ? condense(result.stderr) : undefined
    const before = result.stdout.length + (typeof result.stderr === 'string' ? result.stderr.length : 0)
    const after = stdout.text.length + (stderr?.text.length ?? 0)

    if (before - after < MIN_SAVED_CHARS) {
      return ran
    }
    await addSaved($, before - after)

    // A result of its own, without core's `ref` and `text`, so core maps the
    // new one for the model. Nothing is added to it: what was cut was noise.
    return {
      result: {
        ...result,
        stdout: stdout.text,
        ...(stderr === undefined ? {} : { stderr: stderr.text }),
      } as typeof ran.result,
      context: ran.context,
    }
  })
}
