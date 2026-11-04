// Whether an answer puts a question off ("later", "not yet", "after X"), as
// opposed to a yes, a pick, or a plain no. A plain no closes the question and
// is not kept.
//
// Only the reply's first sentence is read: a deferral leads ("Not yet, ..."),
// and a long message that tells a story ("After the test we found ...") is not
// one. Phrases that also narrate ("after", "once", "first") count only in a
// short reply.

const CLEAR = [
  /\bnot (?:now|yet|today|right now|at the moment)\b/i,
  /\b(?:can'?t|cannot) yet\b/i,
  /\blater\b/i,
  /\bhold (?:on|off)\b/i,
  /\bpark (?:it|that|this)\b/i,
  /\bremind me\b/i,
  /\bcome back to (?:it|that|this)\b/i,
  /\b(?:next time|another time)\b/i,
  /\bnot before\b/i,
]

const SHORT_ONLY = [
  /\bafter (?:that|this|the tests?|we(?:'re)? (?:finish|are done|do)|you(?:'re)? (?:finish|are done|do)|[a-z]+ing)\b/i,
  /\b(?:first|before that)[, ]+(?:we|let'?s|i|you|do|finish)\b/i,
  /\b(?:let'?s|we|i) (?:do|finish) [^.?!\n]{1,60} first\b/i,
  /\bonce (?:we|you|i|that|this|it)\b/i,
  /\b(?:tomorrow|for now)\b/i,
]

const SHORT_WORDS = 15

const firstSentence = (text: string) => text.trim().split(/(?<=[.!?])\s|\n/)[0] ?? ''

export const isDeferral = (text: string) => {
  const lead = firstSentence(text)
  const isShort = text.trim().split(/\s+/).length <= SHORT_WORDS

  return CLEAR.some(pattern => pattern.test(lead)) || (isShort && SHORT_ONLY.some(pattern => pattern.test(lead)))
}

// The words a dialog answer carries: the picked labels, the text typed under
// "Other", and a note added to a pick.
export const joinAnswer = (...parts: readonly (string | undefined)[]) =>
  parts
    .map(part => part?.trim() ?? '')
    .filter(part => part.length > 0)
    .join(' / ')
