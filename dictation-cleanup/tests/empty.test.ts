import { describe, expect, test } from 'claude-code/testing'

import { filterFillers } from '../hooks/clean'

// Each pair is a sentence as written and as it leaves the rule filter. A
// sentence alone must come out exactly as it went in.
const each = (cases: readonly (readonly [string, string] | string)[]) => {
  for (const item of cases) {
    const [written, sent] = typeof item === 'string' ? [item, item] : item

    expect(filterFillers(written)).toBe(sent)
  }
}

describe('words that say nothing are taken out by rules', () => {
  test('hedges and emphasis go, with the commas that framed them', () => {
    each([
      ['Basically, I want the export to be faster.', 'I want the export to be faster.'],
      ['It is pretty much done, obviously.', 'It is done.'],
      ['Check that real quick, please.', 'Check that please.'],
      ['I honestly think it literally broke.', 'I think it broke.'],
      ['That works, I guess.', 'That works.'],
      ['so i think thats fine ig', 'so i think thats fine'],
      ['basically npm install fails', 'npm install fails'],
    ])
  })

  test('the same words stay where they mean something', () => {
    each([
      'It is not obviously wrong.',
      'Tell me honestly what you think.',
      'Do not take that literally.',
      'I guess so.',
      'If I guess wrong, tell me.',
      'Post it on ig tomorrow.',
      'IG is down.',
    ])
  })

  test('"kind of" is a hedge after a verb and a kind after "what" or "this"', () => {
    each([
      ['I kind of want a dark theme, and it is kinda slow.', 'I want a dark theme, and it is slow.'],
      'What kind of file is this, and which sort of error do you get?',
      'It needs a special kind of lock.',
    ])
  })

  test('openers go, but not a word that may be the answer', () => {
    each([
      ['So yeah, the build fails. But yeah, the tests pass.', 'So the build fails. But the tests pass.'],
      ['Well, I think it is fine. Well done.', 'I think it is fine. Well done.'],
      ['I mean, we could cache it. That is what I mean.', 'We could cache it. That is what I mean.'],
      ['Oh, and add a test. Oh no, the build broke.', 'And add a test. Oh no, the build broke.'],
      ['Look, the config is wrong. Look at the log.', 'The config is wrong. Look at the log.'],
      ['Anyways, the main thing is the cache.', 'The main thing is the cache.'],
      // The first word of a message, a whole sentence, and a "yeah" in front of another answer word.
      'Yeah, do it.',
      'Is it done? Yeah.',
      'The first one, yeah, sure.',
      'Open the parser, I mean the lexer.',
      // "oh" is also a zero said aloud.
      'ADR oh seven four is the one.',
    ])
  })

  test('a vague tag after a list goes, and the clause keeps its comma', () => {
    each([
      ['Check the logs and stuff, then restart the server or whatever.', 'Check the logs, then restart the server.'],
      ['It costs 300 bucks or whatever.', 'It costs 300 bucks.'],
      'Use a queue or something else.',
      'Run the tests and everything works.',
    ])
  })

  test('thinking aloud goes only where commas set it off', () => {
    each([
      ['Open the, what is it called, the settings file.', 'Open the settings file.'],
      ["Maybe a cron job, I don't know, or a queue.", 'Maybe a cron job or a queue.'],
      "I don't know why it fails.",
    ])
  })

  test('exclamations go, and a sentence that is nothing else goes with its full stop', () => {
    each([
      ['Oh shit, I deleted the branch. What the hell? Why is it gone?', 'I deleted the branch. Why is it gone?'],
      ['What the hell is this error?', 'What is this error?'],
      ['It is a fucking mess and takes a shit ton of memory.', 'It is a mess and takes a ton of memory.'],
      ['wtf is this, why did it fail', 'what is this, why did it fail'],
      ['haha nice, it works lol', 'nice, it works'],
      ['It works. Wow.', 'It works.'],
      // A verdict is not an exclamation.
      'That test is shit.',
    ])
  })

  test('"like" goes where it is a pause and stays where it compares, wishes or quotes', () => {
    each([
      ['I need you to like see what changed.', 'I need you to see what changed.'],
      ['It is, like, the third time. Like, I did not touch it.', 'It is the third time. I did not touch it.'],
      ['It is like really slow and the files are like locked.', 'It is really slow and the files are locked.'],
      ['It is like, um, broken.', 'It is broken.'],
      ['And like we could rename it later.', 'And we could rename it later.'],
      'It looks like a timeout, and I would like a retry, something like three attempts.',
      'And like I said, keep the old name.',
      'I was like, why is it red?',
      'I want people to like the video.',
    ])
  })

  test('a word that is named, not used, stays', () => {
    each([
      'I keep saying basically and like all the time.',
      'Words like basically, pretty much and kinda can go.',
      'Remove the word "basically" from the text.',
      'These fillers are obviously annoying.',
    ])
  })

  test('a sentence that is nothing but the word is an answer and stays; a message that is all filler goes out as written', () => {
    each(['Obviously.', 'Pretty much.', 'Um.', 'Wow.'])
  })

  test('code, paths and quoted words are never touched', () => {
    each(['run `basically --like` in src/yeah/like.ts', 'He wrote "um, basically, yeah" in the ticket.'])
  })

  test('filler sounds still go first, and what they leave is cleaned too', () => {
    each([
      ['Um, yeah, looks clean.', 'Yeah, looks clean.'],
      ['Okay. Um. So the bug is back.', 'Okay. So the bug is back.'],
      ['So yeah, basically fix the parser, I guess.', 'So fix the parser.'],
    ])
  })

  test('your own phrases are always taken out, and a built-in one can be left in', () => {
    expect(filterFillers('To be fair, the old one was slower too.')).toBe('To be fair, the old one was slower too.')
    expect(filterFillers('To be fair, the old one was slower too.', { own: ['to be fair'] })).toBe('The old one was slower too.')
    expect(filterFillers('Basically, fix it, I guess.', { kept: ['basically'] })).toBe('Basically, fix it.')
  })
})
