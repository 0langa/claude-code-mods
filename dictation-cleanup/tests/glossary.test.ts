import { describe, expect, test } from 'claude-code/testing'

import { applyGlossary, harvestTerms, keyOf } from '../hooks/glossary'
import { applyQuotes } from '../hooks/spoken'

describe('spoken quotation marks', () => {
  test('quote unquote wraps the next word', () => {
    expect(applyQuotes('The quote unquote compress at the beginning')).toBe('The "compress" at the beginning')
    expect(applyQuotes('it is quote-unquote done.')).toBe('it is "done".')
    expect(applyQuotes('quote unquote compress and quote unquote cut')).toBe('"compress" and "cut"')
  })

  test('an article is quoted with its noun', () => {
    expect(applyQuotes('the quote unquote the cloud is')).toBe('the "the cloud" is')
  })

  test('quote ... unquote wraps the phrase between', () => {
    expect(applyQuotes('He said quote hello there unquote and left')).toBe('He said "hello there" and left')
    expect(applyQuotes('open quote a b end quote')).toBe('"a b"')
  })

  test('the noun "quote" and code are left alone', () => {
    expect(applyQuotes('Get me a quote from the vendor')).toBe('Get me a quote from the vendor')
    expect(applyQuotes('run `quote unquote x`')).toBe('run `quote unquote x`')
    expect(applyQuotes('quote one quote two unquote')).toBe('quote one quote two unquote')
  })
})

describe('keys', () => {
  test('number words, separators and leading zeros fold away', () => {
    expect(keyOf(['ADR', 'seventy', 'four'])).toBe(keyOf(['ADR-0074']))
    expect(keyOf(['ADR', 'zero', 'zero', 'seven', 'four'])).toBe(keyOf(['ADR-0074']))
    expect(keyOf(['Qwen', 'three', 'TTS'])).toBe(keyOf(['Qwen3-TTS']))
    expect(keyOf(['one', 'hundred', 'and', 'five'])).toBe('105')
  })
})

describe('glossary', () => {
  test('spoken numbers become the project spelling', () => {
    const result = applyGlossary('open ADR seventy four and ADR seventy-four please', ['ADR-0074'])

    expect(result.text).toBe('open ADR-0074 and ADR-0074 please')
    expect(result.fixed).toEqual(['ADR-0074'])
  })

  test('mis-spaced and spelled-out terms are joined', () => {
    expect(applyGlossary('use Qwen three TTS here', ['Qwen3-TTS']).text).toBe('use Qwen3-TTS here')
    expect(applyGlossary('the Re motion render', ['Remotion']).text).toBe('the Remotion render')
    expect(applyGlossary('nova the A I is fun', ['Nova the AI']).text).toBe('Nova the AI is fun')
  })

  test('punctuation and quotes around a term stay where they were', () => {
    expect(applyGlossary('"Qwen three TTS," he said', ['Qwen3-TTS']).text).toBe('"Qwen3-TTS," he said')
    expect(applyGlossary('Nova the A.I. is fun', ['Nova the AI']).text).toBe('Nova the AI is fun')
    expect(applyGlossary('Nova the A.I. Is fun', ['Nova the AI']).text).toBe('Nova the AI. Is fun')
  })

  test('capitals are only added for names that cannot be ordinary words', () => {
    // Unvouched, plain words and acronyms stay as typed: "url", "api" or "github" can be identifiers.
    expect(applyGlossary('the remotion render', ['Remotion']).text).toBe('the remotion render')
    expect(applyGlossary('the tts engine and the api', ['TTS', 'API']).text).toBe('the tts engine and the api')
    expect(applyGlossary('never do that', ['NEVER']).text).toBe('never do that')
    expect(applyGlossary('push to github', ['GitHub'], ['GitHub']).text).toBe('push to github')
    // A digit makes a name distinctive; a name you vouched for may be capitalised.
    expect(applyGlossary('use qwen3-tts here', ['Qwen3-TTS']).text).toBe('use Qwen3-TTS here')
    expect(applyGlossary('ask claude code', ['Claude Code'], ['Claude Code']).text).toBe('ask Claude Code')
    expect(applyGlossary('ask claude code', ['Claude Code']).text).toBe('ask claude code')
    // Said or spaced differently is a spelling fix, so it applies.
    expect(applyGlossary('push to git hub', ['GitHub'], ['GitHub']).text).toBe('push to GitHub')
    expect(applyGlossary('say T T S', ['TTS']).text).toBe('say TTS')
  })

  test('capitals already typed are never lowered', () => {
    expect(applyGlossary('Qwen3 here', ['qwen3']).text).toBe('Qwen3 here')
    expect(applyGlossary('SHA-256 and ADR-0067 point 4', ['sha256', 'ADR-0067']).text).toBe('SHA-256 and ADR-0067 point 4')
  })

  test('ordinary English is not turned into a name', () => {
    expect(applyGlossary('a fenced code block', ['CodeBlock']).text).toBe('a fenced code block')
    expect(applyGlossary('a codeblock here', ['CodeBlock']).text).toBe('a codeblock here')
    expect(applyGlossary('version-stamp every video', ['VersionStamp']).text).toBe('version-stamp every video')
    expect(applyGlossary("every scene's colour", ['SCENES']).text).toBe("every scene's colour")
    expect(applyGlossary('my anthropic api key', ['ANTHROPIC_API_KEY']).text).toBe('my anthropic api key')
    expect(applyGlossary('anthropic underscore api underscore key', ['ANTHROPIC_API_KEY']).text).toBe('ANTHROPIC_API_KEY')
    expect(applyGlossary('open .github and --api now', ['GitHub', 'API'], ['GitHub', 'API']).text).toBe('open .github and --api now')
  })

  test('a file or command name needs its separator said or written', () => {
    expect(applyGlossary('open shorts dot json now', ['shorts.json']).text).toBe('open shorts.json now')
    expect(applyGlossary('open shorts-json now', ['shorts.json']).text).toBe('open shorts.json now')
    expect(applyGlossary('I want to make video content', ['make-video']).text).toBe('I want to make video content')
    expect(applyGlossary('run make dash video', ['make-video']).text).toBe('run make-video')
  })

  test('code, paths and URLs are never touched', () => {
    const text = 'see `qwen three tts` and C:/qwen three/tts and https://x.dev/adr seventy four'

    expect(applyGlossary(text, ['Qwen3-TTS', 'ADR-0074']).text).toBe(text)
  })

  test('a term that is already right stays, and nothing crosses a comma or a line', () => {
    expect(applyGlossary('Qwen3-TTS is ADR-0074', ['Qwen3-TTS', 'ADR-0074'])).toEqual({ text: 'Qwen3-TTS is ADR-0074', fixed: [] })
    expect(applyGlossary('Qwen, three TTS', ['Qwen3-TTS']).text).toBe('Qwen, three TTS')
    expect(applyGlossary('Qwen three\nTTS', ['Qwen3-TTS']).text).toBe('Qwen three\nTTS')
  })
})

const DOC = [
  '# Title Case Heading Here',
  'Nova the AI is a channel. Made by Nova the AI daily, run by Nova the AI again.',
  'It uses `studio` and `shorts.json`, plus Qwen3-TTS and ADR-0074.',
  'Claude Code sessions run Remotion. Remotion renders. Open the Remotion folder. Sessions with Claude Code, with Claude Code.',
  'Check the YouTube analytics first. He asked ("What ChatGPT does") twice. Then Check the YouTube again.',
  'We like Open Source work and open source tools. Also Open Source rules, with Open Source help.',
  'NEVER do that.',
  '```',
  'python -m studio ShouldNotBeHarvested',
  '```',
  'See commit b774805 and 2026-10-16.',
].join('\n')

describe('harvest', () => {
  const terms = harvestTerms([DOC], ['AGENTS.md', 'notes.txt', 'studio'])

  test('picks up identifiers, product names and recurring proper names', () => {
    for (const term of ['shorts.json', 'Qwen3-TTS', 'ADR-0074', 'Remotion', 'Claude Code', 'Nova the AI', 'AGENTS.md', 'notes.txt']) {
      expect(terms).toContain(term)
    }
  })

  test('leaves out plain words, emphasis, code blocks, headings, hashes and dates', () => {
    for (const term of ['studio', 'NEVER', 'ShouldNotBeHarvested', 'Title Case Heading Here', 'b774805', '2026-10-16']) {
      expect(terms).not.toContain(term)
    }
  })

  test('a phrase that only starts sentences, or is also written in lowercase, is not a name', () => {
    for (const term of ['Check the YouTube', 'What ChatGPT', 'Open Source']) {
      expect(terms).not.toContain(term)
    }
  })

  test('what it finds fixes a spoken version end to end', () => {
    expect(applyGlossary('read ADR seventy four about Qwen three TTS', terms).text).toBe('read ADR-0074 about Qwen3-TTS')
  })
})
