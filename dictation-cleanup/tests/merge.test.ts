import { describe, expect, test } from 'claude-code/testing'

import { mergeCleanup } from '../hooks/merge'

// What the model answered, and what is sent: its version, or the person's own.
const taken = (written: string, reply: string, terms: readonly string[] = []) => expect(mergeCleanup(written, reply, terms)).toBe(reply)
const undone = (written: string, reply: string, terms: readonly string[] = []) => expect(mergeCleanup(written, reply, terms)).toBe(written)

describe('of what the AI pass sends back, only the safe changes are taken', () => {
  test('a pause word may go', () => {
    taken('I need this to like actually work on the first try.', 'I need this to work on the first try.')
    taken('And so the build is like broken again.', 'The build is broken again.')
  })

  test('a word may be respelled: a typo, an apostrophe, a capital, two letters swapped', () => {
    taken('Pleas fix teh parser, it does not handle the new sintax.', 'Please fix the parser, it does not handle the new syntax.')
    taken('i dont think thats right', "I don't think that's right.")
    taken('First line\n\nsecond line with a typoo here', 'First line\n\nSecond line with a typo here.')
  })

  test('a small word may be added', () => {
    taken('Tell me when PR is merged.', 'Tell me when the PR is merged.')
  })

  test('a stutter, a restart and a passage said twice may go, because the words are still said', () => {
    const passage = 'Please rethink the layout of the page so it is not a wall of text on mobile.'

    taken('I want I think I want a dark theme.', 'I think I want a dark theme.')
    taken(`${passage} And the footer is fine. ${passage.toLowerCase()}`, `${passage} And the footer is fine.`)
  })

  test('a word swapped for another is put back', () => {
    undone('Take the old config and copy it to the new server.', 'Use the old configuration and move it to the new server.')
    undone('The other ones are optional.', 'The others are optional.')
    // A common word is spelled right: it is not a typo of its neighbour.
    undone('Check the content of the context file.', 'Check the context of the context file.')
  })

  test('shorthand and numbers stay as they were written', () => {
    undone('I alr fixed it tho.', 'I already fixed it though.')
    undone('Retry it 2 times.', 'Retry it two times.')
  })

  test('a "not" is never added and never dropped', () => {
    undone('The cache is working now.', 'The cache is not working now.')
    undone('Do not delete the logs.', 'Delete the logs.')
  })

  test('words that carry weight stay: how sure, how much, in what order', () => {
    undone('I think it only fails on the first run, maybe.', 'It fails on the first run.')
    undone('It looks like the test is not really stable.', 'It looks the test is not stable.')
    // "like 3 days" is "about 3 days".
    undone('I still need the logs for like 3 days.', 'I still need the logs for 3 days.')
  })

  test('a sentence with content is never dropped, and a statement is not turned into a question', () => {
    undone('Maybe we cache it. I am just thinking out loud here.', 'Maybe we cache it.')
    undone('I wonder if the cache is stale.', 'Is the cache stale?')
  })

  test('code and paths are never touched', () => {
    undone('Run npm run build:prod in apps/web and check `dist`.', 'Run npm run build in apps/web and check dist.')
  })

  test('a mis-heard name may be written as the project writes it, and only then', () => {
    taken('Use Quen three TTS for the voice.', 'Use Qwen3-TTS for the voice.', ['Qwen3-TTS'])
    undone('Use Quen three TTS for the voice.', 'Use Qwen3-TTS for the voice.')
    undone('Use the old voice for the intro.', 'Use Qwen3-TTS for the intro.', ['Qwen3-TTS'])
  })

  test('a change is taken whole or not at all', () => {
    // "its" could be respelled, but the "it" before it has nowhere to go.
    expect(mergeCleanup('that it its broken', "that it's broken")).toBe('that it its broken')
  })

  test('nothing to take: the message comes back to the last space', () => {
    expect(mergeCleanup('  keep   the  spacing\n', 'Totally different words here')).toBe('  keep   the  spacing\n')
  })
})
