import { describe, expect, test } from 'claude-code/testing'

import { dietReplies, searchable, shorten } from '../hooks/replies'

// One of Claude's messages, as Markdown source. A person quotes the drawn
// message: no **, no list numbers, no link target.
const ANSWER = `## What changed

The page moved to a new folder at the repository root, and **git ignores that folder** through a local rule, so the public ignore file did not change at all.

1. My edits to the two instruction files are removed, and the old folder is gone.
2. The page now says it is local, both in its top comment and in its last section, see [the page](lab/page.html).

Nothing is committed, and a commit would stay on this machine until you say otherwise.`

const PARAGRAPH =
  'The page moved to a new folder at the repository root, and git ignores that folder through a local rule, so the public ignore file did not change at all.'
const TWO_ITEMS =
  'My edits to the two instruction files are removed, and the old folder is gone.\nThe page now says it is local, both in its top comment and in its last section, see the page.'
const NEVER_WRITTEN =
  'A sentence that the assistant never wrote, which is long enough to be shortened if it were found somewhere in the conversation, but it is not there.'

const conversation = searchable([ANSWER])

describe('shortening one quote', () => {
  test('a long quote that is in the conversation is cut to its first and last words', () => {
    expect(shorten(PARAGRAPH, conversation)).toBe('The page moved to a new folder at [… 17 words …] did not change at all.')
  })

  test('Markdown in the source does not hide a passage: bold, list numbers and a link target', () => {
    expect(shorten(TWO_ITEMS, conversation)).toBe('My edits to the two instruction files are [… 22 words …] last section, see the page.')
  })

  test('a quote too short to gain anything is left alone', () => {
    expect(shorten('Nothing is committed', conversation)).toBe(undefined)
    expect(shorten('Nothing is committed, and a commit would stay on this machine until you say otherwise.', conversation)).toBe(undefined)
  })

  test('a quote that is not in the conversation is left alone: Claude could not look the rest up', () => {
    expect(shorten(NEVER_WRITTEN, conversation)).toBe(undefined)
    expect(shorten(PARAGRAPH, searchable([]))).toBe(undefined)
  })

  test('opening words that also open another passage grow until they can only mean this one', () => {
    const first = 'When the session starts the mod reads its settings and then registers a command, a tool and two hooks before the first prompt arrives.'
    const second = 'When the session starts the mod reads its settings but only once, because a reload keeps the values it already read from the store.'

    expect(shorten(first, searchable([first, second]))).toBe(
      'When the session starts the mod reads its settings and [… 9 words …] before the first prompt arrives.',
    )
  })

  test('a quote whose opening can never be told apart is left alone', () => {
    const shared = 'Each of the three probes was started from the same empty folder with the same settings file and the same two plugins loaded,'
    const first = `${shared} and the first one answered within a second.`
    const second = `${shared} but the second one took far longer than that.`

    expect(shorten(first, searchable([first, second]))).toBe(undefined)
  })

  test('closing words that come earlier in the quote grow until they only close it', () => {
    const quote =
      'We changed the first file and then the second one as well, and the tests ran clean on both machines, so we merged it, and a day later the tests ran clean on both machines.'

    expect(shorten(quote, searchable([quote]))).toBe('We changed the first file and then the [… 19 words …] later the tests ran clean on both machines.')
  })

  test('the same passage twice in the conversation is still one passage', () => {
    expect(shorten(PARAGRAPH, searchable([ANSWER, ANSWER]))).toBe('The page moved to a new folder at [… 17 words …] did not change at all.')
  })
})

const MESSAGE = [
  '<!-- reply 3 -->',
  `> ${PARAGRAPH}`,
  '',
  'Fine by me, um, keep it that way.',
  '',
  '<!-- reply -->',
  '> Nothing is committed',
  '',
  'Good.',
  '',
  '<!-- reply -->',
  `> ${NEVER_WRITTEN}`,
  '',
  'Where did that come from?',
  '',
  '',
  'And now build the thing.',
  '',
  `> ${PARAGRAPH}`,
].join('\n')

describe('a message with stacked replies', () => {
  test('only a quote that can be shortened changes: markers, comments and the typed message stay as sent', () => {
    const slim = dietReplies(MESSAGE, conversation)

    expect(slim.text).toBe(MESSAGE.replace(`> ${PARAGRAPH}`, '> The page moved to a new folder at [… 17 words …] did not change at all.'))
    expect(slim.quotes).toBe(1)
    expect(slim.savedChars).toBe(MESSAGE.length - slim.text.length)
    // The same passage quoted by hand in the typed message is the person's own text.
    expect(slim.text.endsWith(`> ${PARAGRAPH}`)).toBe(true)
  })

  test('a quote of several lines becomes one line, and the reply after it is found as before', () => {
    const message = `<!-- reply 2 -->\n> ${TWO_ITEMS.replace('\n', '\n> ')}\n\nBoth fine.\n\n<!-- reply -->\n> ${PARAGRAPH}\n\nThis too.`
    const slim = dietReplies(message, conversation)

    expect(slim.text).toBe(
      '<!-- reply 2 -->\n> My edits to the two instruction files are [… 22 words …] last section, see the page.\n\nBoth fine.\n\n' +
        '<!-- reply -->\n> The page moved to a new folder at [… 17 words …] did not change at all.\n\nThis too.',
    )
    expect(slim.quotes).toBe(2)
  })

  test('a second pass changes nothing', () => {
    const once = dietReplies(MESSAGE, conversation)

    expect(dietReplies(once.text, conversation)).toEqual({ text: once.text, quotes: 0, savedChars: 0 })
  })

  test('a message without replies, or one that only looks like one, is returned as it was', () => {
    for (const text of [`> ${PARAGRAPH}\n\nA quote I typed myself.`, `Look at this:\n\n<!-- reply 1 -->\n> ${PARAGRAPH}\n\nNot at the start.`, '']) {
      expect(dietReplies(text, conversation)).toEqual({ text, quotes: 0, savedChars: 0 })
    }
  })
})
