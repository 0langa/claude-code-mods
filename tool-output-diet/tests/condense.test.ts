import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { condense, describeCut } from '../hooks/condense'

const ESC = '\u001b'

describe('condense', () => {
  test('removes colour and cursor codes', () => {
    const out = condense(`${ESC}[31mFAILED${ESC}[0m test_a ${ESC}[1;32mok${ESC}[0m${ESC}]0;title\u0007`)

    expect(out.text).toBe('FAILED test_a ok')
    expect(out.ansi).toBe(5)
  })

  test('keeps only the last frame of a line drawn over itself', () => {
    const out = condense('Downloading\n  1%\r 40%\r 99%\r100% done\nnext line')

    expect(out.text).toBe('Downloading\n100% done\nnext line')
    expect(out.frames).toBe(3)
  })

  test('windows line endings are not progress frames', () => {
    expect(condense('one\r\ntwo\r\n').text).toBe('one\ntwo\n')
    expect(condense('one\r\ntwo\r\n').frames).toBe(0)
  })

  test('a long run of identical lines is shown once, with a count', () => {
    const out = condense(['start', ...Array(10).fill('retrying...'), 'end'].join('\n'))

    expect(out.text).toBe('start\nretrying...\n[the line above is repeated 9 more times]\nend')
    expect(out.repeats).toBe(9)
  })

  test('short runs, blank lines and ordinary output are returned as they were', () => {
    const text = ['a', 'a', 'a', '', '', '', '', '', 'b  ', '  c'].join('\n')

    expect(condense(text)).toEqual({ text, ansi: 0, frames: 0, repeats: 0 })
  })

  test('says what was cut, and only that', () => {
    expect(describeCut({ ansi: 3, frames: 0, repeats: 2 })).toBe('[output condensed: colour codes, 2 repeated lines removed]')
    expect(describeCut({ ansi: 0, frames: 40, repeats: 0 })).toBe('[output condensed: 40 overwritten progress frames removed]')
  })
})

const NOISY = `${Array.from({ length: 80 }, (_, i) => `${String(i).padStart(3)}%`).join('\r')}\nbuilt ok\n`
const QUIET = 'built ok\n'

// The shell tool beneath the plugin: it answers `result`, or an error.
const shell = (on: On, result: Record<string, unknown>, isError = false) => {
  mock.store(on)
  on('tool.call', () => (isError ? { isError: true as const, result: 'Exit code 1', text: 'Exit code 1' } : { result }))
}

const call = ($: Engine, tool: 'Bash' | 'PowerShell' = 'Bash') =>
  $.tool.call({ tool, command: 'build' } as never) as Promise<{ result?: Record<string, unknown>; isError?: boolean }>

describe('the shell hook', () => {
  test('trims a noisy successful command, and says so', async ($, on) => {
    shell(on, { stdout: NOISY, stderr: '', interrupted: false })
    const ran = await call($)

    expect(String(ran.result?.stdout)).toContain('built ok')
    expect(String(ran.result?.stdout)).toContain('[output condensed: 79 overwritten progress frames removed]')
    expect(String(ran.result?.stdout).length).toBeLessThan(NOISY.length / 3)
    expect(ran.result?.interrupted).toBe(false)
  })

  test('works on PowerShell output too', async ($, on) => {
    shell(on, { stdout: NOISY, stderr: '', interrupted: false })

    expect(String((await call($, 'PowerShell')).result?.stdout)).toContain('condensed')
  })

  test('quiet output is returned exactly as it came', async ($, on) => {
    shell(on, { stdout: QUIET, stderr: '', interrupted: false })
    expect((await call($)).result?.stdout).toBe(QUIET)
  })

  test('an image result is returned exactly as it came', async ($, on) => {
    shell(on, { stdout: NOISY, stderr: '', interrupted: false, isImage: true })
    expect((await call($)).result?.stdout).toBe(NOISY)
  })

  test('a failed command is not touched', async ($, on) => {
    shell(on, {}, true)
    const ran = await call($)

    expect(ran.isError).toBe(true)
    expect(ran.result).toBe('Exit code 1')
  })

  test('/diet off sends output as it came; /diet counts what was saved', async ($, on) => {
    shell(on, { stdout: NOISY, stderr: '', interrupted: false })
    const run = (args: string) => ({ command: 'diet', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } })

    await call($)
    expect((await $.command.run(run(''))).text).toContain('trimmed 1 command outputs')

    await $.command.run(run('off'))
    expect((await call($)).result?.stdout).toBe(NOISY)
    expect((await $.command.run(run(''))).text).toContain('is off')
  })
})
