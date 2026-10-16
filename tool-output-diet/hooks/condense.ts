// What a terminal would not have shown, or showed once: colour codes, progress
// frames drawn over each other, and the same line over and over. Everything
// else in the output is returned as it was.

// Colour and cursor sequences (CSI), and title or link sequences (OSC).
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g

// Runs of fewer identical lines than this are left alone.
const MIN_REPEATS = 4

export type Condensed = {
  text: string
  /** Colour or cursor sequences removed. */
  ansi: number
  /** Progress frames that a carriage return drew over. */
  frames: number
  /** Lines dropped from runs of identical ones. */
  repeats: number
}

export const condense = (input: string): Condensed => {
  const ansi = (input.match(ANSI) ?? []).length
  const lines = input.replace(ANSI, '').replaceAll('\r\n', '\n').split('\n')
  let frames = 0

  // "10%\r20%\r100%" is one line on a terminal: the last frame.
  const drawn = lines.map(line => {
    if (!line.includes('\r')) {
      return line
    }
    const parts = line.split('\r').filter(part => part !== '')

    frames += Math.max(0, parts.length - 1)

    return parts[parts.length - 1] ?? ''
  })

  let repeats = 0
  const kept: string[] = []

  for (let at = 0; at < drawn.length; ) {
    const line = drawn[at] ?? ''
    let end = at + 1

    while (end < drawn.length && drawn[end] === line) {
      end += 1
    }
    const run = end - at

    if (line.trim() !== '' && run >= MIN_REPEATS) {
      kept.push(line, `[the line above is repeated ${run - 1} more times]`)
      repeats += run - 1
    } else {
      kept.push(...drawn.slice(at, end))
    }
    at = end
  }

  return { text: kept.join('\n'), ansi, frames, repeats }
}
