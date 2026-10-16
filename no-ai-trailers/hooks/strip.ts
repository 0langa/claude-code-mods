// Removes Claude's attribution lines from a git commit or gh pr command.
// A co-author you name yourself (a person's name and email) is never touched.

// "Co-Authored-By: Claude ... <noreply@anthropic.com>", whatever the model name.
const TRAILER_LINE = /^[ \t]*Co-Authored-By:[ \t]*(?:Claude[^\n]*|[^\n]*noreply@anthropic\.com[^\n]*)\r?\n?/gim

// The same as a whole -m argument: git commit -m "msg" -m "Co-Authored-By: Claude ..."
const TRAILER_ARGUMENT = /[ \t]+(?:-m|--message)(?:[ \t]+|=)(["'])[ \t]*Co-Authored-By:[ \t]*(?:Claude[^"'\n]*|[^"'\n]*noreply@anthropic\.com[^"'\n]*)\1/gi

// "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
const FOOTER_LINE = /^[ \t]*(?:🤖[ \t]*)?Generated with \[?Claude Code\]?(?:\([^)\n]*\))?[ \t]*\r?\n?/gim

// Only a command that commits or opens or edits a pull request.
const IS_GIT_TEXT = /\bgit\b[^\n]*\bcommit\b|\bgh[ \t]+pr[ \t]+(?:create|edit)\b/

export type Stripped = { command: string; removed: number }

export const stripAttribution = (command: string): Stripped => {
  if (!IS_GIT_TEXT.test(command)) {
    return { command, removed: 0 }
  }
  let removed = 0
  const drop = () => {
    removed += 1

    return ''
  }
  // The argument form first: the line form would otherwise eat its quote.
  const stripped = command.replace(TRAILER_ARGUMENT, drop).replace(TRAILER_LINE, drop).replace(FOOTER_LINE, drop)

  return { command: stripped, removed }
}
