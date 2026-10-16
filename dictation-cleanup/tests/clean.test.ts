import { describe, expect, mock, test } from 'claude-code/testing'
import type { ModelUsage, On, PromptOrigin, PromptSubmitResult } from 'claude-code'

import { filterFillers } from '../hooks/clean'

const USAGE: ModelUsage = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const DESKTOP: PromptOrigin = { kind: 'sdk' }
const TERMINAL: PromptOrigin = { kind: 'composer' }

const LONG_DICTATION =
  'So, um, I have been using the the microphone in Claude Code, uh, and there are a lot of, uh, filler words that still use tokens when sending. ' +
  'I am wondering if there is any way, um, I could create something that cleans up what I said, so all those fillers and repetitions are gone before it is sent.'
const MODEL_REPLY =
  'I have been using the microphone in Claude Code, and there are many filler words that still use tokens when sending. ' +
  'Is there a way to create something that cleans up what I said, so fillers and repetitions are gone before it is sent?'

// The engine beneath the plugin: the prompt enters as it arrives, and Haiku answers `reply`.
const engine = (on: On, reply = MODEL_REPLY) => {
  const sentToModel: string[] = []
  mock.store(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('model.complete', ($, e) => {
    sentToModel.push(e.prompt)

    return { value: { isAnswered: true, text: reply, usage: USAGE } }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))

  return sentToModel
}

const entered = (result: PromptSubmitResult) => ('text' in result ? result.text : undefined)

describe('filter', () => {
  test('removes filler sounds and fixes the commas around them', () => {
    expect(filterFillers('So, um, I think we should, uh, ship it.')).toBe('So I think we should ship it.')
    expect(filterFillers('Okay, um so the bug')).toBe('Okay, so the bug')
    expect(filterFillers('I uh think so')).toBe('I think so')
    expect(filterFillers('Um, so I tried it. Uh, then it broke, uh.')).toBe('So I tried it. Then it broke.')
    expect(filterFillers('Hmm, okay')).toBe('Okay')
  })

  test('removes stuttered words and phrases', () => {
    expect(filterFillers('use the the microphone')).toBe('use the microphone')
    expect(filterFillers('I, I think I want I want a fix')).toBe('I think I want a fix')
  })

  test('keeps meaningful repeats, words that only look like fillers, and code', () => {
    expect(filterFillers('no, no, that is very very wrong')).toBe('no, no, that is very very wrong')
    expect(filterFillers('Uh-huh, the umbrella and the herb')).toBe('Uh-huh, the umbrella and the herb')
    expect(filterFillers('run `um --uh` in src/um/uh.ts')).toBe('run `um --uh` in src/um/uh.ts')
    expect(filterFillers('```\nuh = um\n```')).toBe('```\nuh = um\n```')
  })
})

describe('prompt', () => {
  test('a short prompt is filtered and never sent to the model', async ($, on) => {
    const sentToModel = engine(on)
    const result = await $.prompt.submit({ text: 'Um, fix the the bug', origin: DESKTOP, wait: false })

    expect(entered(result)).toBe('Fix the bug')
    expect(sentToModel).toEqual([])
  })

  test('a long prompt is filtered, then cleaned by Haiku', async ($, on) => {
    const sentToModel = engine(on)
    const result = await $.prompt.submit({ text: LONG_DICTATION, origin: TERMINAL, wait: false })

    expect(entered(result)).toBe(MODEL_REPLY)
    expect(sentToModel.length).toBe(1)
    expect(sentToModel[0]).not.toContain(' um,')
  })

  test('an implausible model reply falls back to the filtered text', async ($, on) => {
    engine(on, 'Sure!')
    const result = await $.prompt.submit({ text: LONG_DICTATION, origin: DESKTOP, wait: false })

    expect(entered(result)).toBe(filterFillers(LONG_DICTATION))
  })

  test('messages that are not the person\'s own words are left alone', async ($, on) => {
    engine(on)
    const fromPlugin = await $.prompt.submit({ text: 'Um, fix the the bug', origin: { kind: 'plugin', name: 'other' }, wait: false })
    const fromPeer = await $.prompt.submit({ text: 'Um, fix the the bug', origin: { kind: 'peer' }, wait: false })

    expect(entered(fromPlugin)).toBe('Um, fix the the bug')
    expect(entered(fromPeer)).toBe('Um, fix the the bug')
  })

  test('a big paste is left alone', async ($, on) => {
    const sentToModel = engine(on)
    const log = Array.from({ length: 30 }, (_, i) => `line ${i} uh the the`).join('\n')
    const result = await $.prompt.submit({ text: log, origin: DESKTOP, wait: false })

    expect(entered(result)).toBe(log)
    expect(sentToModel).toEqual([])
  })
})

describe('/clean', () => {
  const run = (args: string) => ({ command: 'clean', args, origin: TERMINAL, presentation: { isFullscreen: false, columns: 80 } })

  test('off leaves prompts as they are, filter skips the model, on brings both back', async ($, on) => {
    const sentToModel = engine(on)

    await $.command.run(run('off'))
    expect(entered(await $.prompt.submit({ text: 'Um, fix the the bug', origin: DESKTOP, wait: false }))).toBe('Um, fix the the bug')

    await $.command.run(run('filter'))
    expect(entered(await $.prompt.submit({ text: LONG_DICTATION, origin: DESKTOP, wait: false }))).toBe(filterFillers(LONG_DICTATION))
    expect(sentToModel).toEqual([])
    expect((await $.command.run(run(''))).text).toContain('filter')

    await $.command.run(run('on'))
    expect(entered(await $.prompt.submit({ text: LONG_DICTATION, origin: DESKTOP, wait: false }))).toBe(MODEL_REPLY)
  })

  test('compare off hides the comparison line; on shows it, as a display-only line', async ($, on) => {
    engine(on)
    const logged: string[] = []
    on('ui.log', ($, e) => {
      logged.push(e.text)

      return { value: undefined }
    })
    const session = mock.session(on)

    await $.command.run(run('compare off'))
    const quiet = await $.prompt.submit({ text: 'Um, fix the the bug', origin: DESKTOP, wait: false })
    expect(entered(quiet)).toBe('Fix the bug')
    expect(logged).toEqual([])
    expect(session.appended()).toEqual([])
    expect((await $.command.run(run(''))).text).toContain('comparison line off')

    await $.command.run(run('compare on'))
    await $.prompt.submit({ text: 'Um, fix the the bug', origin: DESKTOP, wait: false })
    expect(logged.length).toBe(1)
    expect(logged[0]).toContain('Fix the bug')
    // Nothing is added to the conversation the model reads.
    expect(session.appended()).toEqual([])
  })

  test('last shows the message as dictated', async ($, on) => {
    engine(on)
    await $.prompt.submit({ text: 'Um, fix the the bug', origin: DESKTOP, wait: false })

    expect((await $.command.run(run('last'))).text).toContain('Um, fix the the bug')
  })
})
