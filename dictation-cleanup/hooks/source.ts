// Whose words a prompt holds. The cleanup is for a person's dictation only: a
// message another session sent, a brief a session was started with, a
// notification or a note from the app is Claude's or a program's, and is never
// touched, because cleaning would change what one Claude told another.

import type { PromptOrigin } from 'claude-code'

// The terminal, the desktop app, Remote Control, or a plugin passing on the
// person's own words. Every other origin (a peer session, a coordinator, a
// notification, a schedule, a channel, an observer, ...) is left alone.
export const isFromPerson = (origin: PromptOrigin) =>
  origin.kind === 'composer' ||
  origin.kind === 'sdk' ||
  origin.kind === 'bridge' ||
  (origin.kind === 'plugin' && origin.asUser === true)

// Text a program wrote that a host still passes on as a user message, whatever
// origin it is stamped with: the app's notes, a relayed session message, the
// brief a session was started with, a compaction summary, a command's echo.
const MACHINE_OPENINGS = [
  /^\s*<(?:system-reminder|task-notification|cross-session-message|side-sessions-event|ci-monitor-event|local-command-[a-z]+|command-(?:name|message|args)|channel|user-prompt-submit-hook)\b/i,
  /^\s*Another Claude session sent a message:/i,
  /^\s*\[Cross-session delivery notice\]/i,
  /^\s*Background \(from the session that started this one\)/i,
  /^\s*This session is being continued from a previous conversation/i,
  /^\s*The [^\n:]{1,60} plugin sent a message:/i,
  // "The session "<title>" you started finished ...": a linked session's report.
  /^\s*The (?:[\w-]+ ){0,4}session "[^"\n]{1,160}"/i,
  // The app's own notes to the session.
  /^\s*(?:System-reminder:\s*)?Linked sessions now\b/i,
  /^\s*System-reminder:/i,
  /^\s*The user started your proposal\b/i,
  /^\s*The app was quit while you were working/i,
]

export const isMachineText = (text: string) => MACHINE_OPENINGS.some(opening => opening.test(text)) || /<cross-session-message\b/i.test(text)

// For an origin a program and a person can share (the desktop app's own SDK
// turns): a brief another session wrote is structured, with headings, a long
// list or tagged blocks, where dictation is prose. Judged on the person's own
// lines, so a reply that quotes such text is not mistaken for it.
export const looksMachineWritten = (text: string) =>
  /^#{1,4}[ \t]+\S/m.test(text) ||
  (text.match(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\S/gm) ?? []).length >= 4 ||
  /<([a-z][\w-]*)(?:[ \t][^>]*)?>[\s\S]*<\/\1>/i.test(text)
