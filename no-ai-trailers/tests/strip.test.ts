import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { stripAttribution } from '../hooks/strip'

const TRAILER = 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>'

describe('stripAttribution', () => {
  test('removes the trailer from a bash heredoc commit', () => {
    const command = `git commit -m "$(cat <<'EOF'\nFix the thing\n\nWhy it broke.\n\n${TRAILER}\nEOF\n)"`

    expect(stripAttribution(command)).toEqual({
      command: 'git commit -m "$(cat <<\'EOF\'\nFix the thing\n\nWhy it broke.\n\nEOF\n)"',
      removed: 1,
    })
  })

  test('removes it from a PowerShell here-string, any model name, any case', () => {
    const command = `git commit -m @'\nFix\n\nco-authored-by: Claude Opus 5.5 <noreply@anthropic.com>\n'@`

    expect(stripAttribution(command).command).toBe("git commit -m @'\nFix\n\n'@")
  })

  test('removes a trailer given as its own -m argument', () => {
    expect(stripAttribution(`git commit -m "Fix it" -m "${TRAILER}"`)).toEqual({ command: 'git commit -m "Fix it"', removed: 1 })
    expect(stripAttribution(`git commit -m 'Fix it' --message='${TRAILER}'`).command).toBe("git commit -m 'Fix it'")
  })

  test('removes the Generated-with footer from a pull request body', () => {
    const command = `gh pr create --title "Add x" --body "$(cat <<'EOF'\n## Summary\n- x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\nEOF\n)"`

    expect(stripAttribution(command)).toEqual({
      command: `gh pr create --title "Add x" --body "$(cat <<'EOF'\n## Summary\n- x\n\nEOF\n)"`,
      removed: 1,
    })
  })

  test('a co-author you named yourself stays', () => {
    const command = 'git commit -m "Pair work\n\nCo-Authored-By: Ada Lovelace <ada@example.com>"'

    expect(stripAttribution(command)).toEqual({ command, removed: 0 })
  })

  test('only commit and pull request commands are touched', () => {
    const echo = `echo "${TRAILER}"`
    const log = `git log --grep "${TRAILER}"`

    expect(stripAttribution(echo)).toEqual({ command: echo, removed: 0 })
    expect(stripAttribution(`cat notes.md # ${TRAILER}`).removed).toBe(0)
    // A search of history mentions the word but does not commit.
    expect(stripAttribution(log).removed).toBe(0)
  })
})

// The engine beneath the plugin: a shell that records the command it was given,
// and the text the engine itself would compose.
let toasts: string[] = []

const engine = (on: On) => {
  const ran: string[] = []
  toasts = []
  mock.store(on)
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('tool.call', (_$, e) => {
    ran.push((e as { command: string }).command)

    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  on('attribution.text', (_$, e) => ({ text: e.text }))

  return ran
}

const commit = ($: Engine, tool: 'Bash' | 'PowerShell' = 'Bash') =>
  $.tool.call({ tool, command: `git commit -m "Fix it" -m "${TRAILER}"` } as never)

describe('the mod', () => {
  test('the model is told to write neither the trailer nor the footer', async ($, on) => {
    engine(on)

    expect(await $.attribution.text({ kind: 'commit', text: TRAILER })).toEqual({ text: '' })
    expect(await $.attribution.text({ kind: 'pr', text: '🤖 Generated with Claude Code' })).toEqual({ text: '' })
    // The other texts are not ours to change.
    expect(await $.attribution.text({ kind: 'exemption', text: 'unless exempt' })).toEqual({ text: 'unless exempt' })
  })

  test('a trailer that is written anyway is removed before the command runs', async ($, on) => {
    const ran = engine(on)
    await commit($)
    await commit($, 'PowerShell')

    expect(ran).toEqual(['git commit -m "Fix it"', 'git commit -m "Fix it"'])
    // It works silently.
    expect(toasts).toEqual([])
  })

  test('other commands run as given', async ($, on) => {
    const ran = engine(on)
    await $.tool.call({ tool: 'Bash', command: 'ls -la' } as never)

    expect(ran).toEqual(['ls -la'])
  })

  test('/trailers off leaves Claude\'s trailers alone, and on brings the mod back', async ($, on) => {
    const ran = engine(on)
    const run = (args: string) => ({ command: 'trailers', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } })

    expect((await $.command.run(run('off'))).text).toContain('is off')
    await commit($)
    expect(await $.attribution.text({ kind: 'commit', text: TRAILER })).toEqual({ text: TRAILER })
    expect(ran[0]).toContain(TRAILER)

    expect((await $.command.run(run('on'))).text).toContain('is on')
    await commit($)
    expect(ran[1]).toBe('git commit -m "Fix it"')
  })
})
