// Whose words a prompt holds: the person's own reply, or text a program or
// another session wrote. Only the person's reply answers a question.

import type { PromptOrigin } from 'claude-code'

export const isFromPerson = (origin: PromptOrigin) =>
  origin.kind === 'composer' ||
  origin.kind === 'sdk' ||
  origin.kind === 'bridge' ||
  (origin.kind === 'plugin' && origin.asUser === true)

// Text a program wrote that a host still passes on as a user message.
const MACHINE_OPENINGS = [
  /^\s*Another Claude session sent a message:/i,
  /^\s*\[Cross-session delivery notice\]/i,
  /^\s*Background \(from the session that started this one\)/i,
  /^\s*This session is being continued from a previous conversation/i,
  /^\s*The [^\n:]{1,60} plugin sent a message:/i,
  /^\s*The (?:[\w-]+ ){0,4}session "[^"\n]{1,160}"/i,
  /^\s*(?:System-reminder:\s*)?Linked sessions now\b/i,
  /^\s*System-reminder:/i,
  /^\s*The user started your proposal\b/i,
  /^\s*The app was quit while you were working/i,
]

// A tagged block the app puts ahead of the person's words (a reminder, a
// linked session's note, an event), closed or running to the end.
const LEADING_BLOCK = /^\s*<([a-z][\w-]*)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/i

// The person's own words in a prompt: what is left once the app's leading
// blocks are taken off, or null when the prompt is a program's text.
export const personText = (text: string): string | null => {
  let rest = text

  for (let guard = 0; guard < 20; guard += 1) {
    const block = LEADING_BLOCK.exec(rest)

    if (block === null) {
      break
    }
    rest = rest.slice(block[0].length)
  }
  rest = rest.trim()

  if (rest === '' || MACHINE_OPENINGS.some(opening => opening.test(rest))) {
    return null
  }

  return rest
}
