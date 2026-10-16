import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
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

// What the last Haiku call was told to do, and everything the mod showed in the session.
let lastSystem = ''
let toasts: string[] = []
let logged: string[] = []

// The engine beneath the plugin: the prompt enters as it arrives, and Haiku answers `reply`.
// `files` are the docs of the folder the session runs in (root files only, by name).
const engine = (on: On, reply = MODEL_REPLY, files: Record<string, string> = {}) => {
  const sentToModel: string[] = []
  toasts = []
  logged = []
  mock.store(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('fs.list', (_$, e) => ({
    value: e.path === '' || e.path === '.' ? Object.keys(files).filter(name => !name.includes('/')).map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })) : [],
  }))
  // The engine hands the path over resolved against the folder, with backslashes on Windows.
  on('fs.read', (_$, e) => {
    const path = e.path.replaceAll('\\', '/')

    return { value: Object.entries(files).find(([name]) => path === name || path.endsWith(`/${name}`))?.[1] ?? '' }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('model.complete', ($, e) => {
    sentToModel.push(e.prompt)
    lastSystem = e.system ?? ''

    return { value: { isAnswered: true, text: reply, usage: USAGE } }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.log', (_$, e) => {
    logged.push(e.text)

    return { value: undefined }
  })

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

  test('removes a longer phrase said again and again, and the double space it leaves', () => {
    expect(filterFillers('just want to see if the changes land, if the changes land, if the changes land')).toBe('just want to see if the changes land')
    expect(filterFillers("I'm saying I'm saying I'm saying it works")).toBe("I'm saying it works")
    expect(filterFillers('see if the changes  land')).toBe('see if the changes land')
    expect(filterFillers('it is fine, it is fine, it is a plan')).toBe('it is fine, it is a plan')
  })

  test('removes German filler sounds too', () => {
    expect(filterFillers('Oh, ähm, surprise.')).toBe('Oh surprise.')
    expect(filterFillers('So äh I think öhm so')).toBe('So I think so')
    expect(filterFillers('Ahm, the ohm and the Öl')).toBe('Ahm, the ohm and the Öl')
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
    // Nothing is added to the session when it works.
    expect(toasts).toEqual([])
    expect(logged).toEqual([])
  })

  test('an implausible model reply falls back to the filtered text', async ($, on) => {
    engine(on, 'Sure!')
    const result = await $.prompt.submit({ text: LONG_DICTATION, origin: DESKTOP, wait: false })

    expect(entered(result)).toBe(filterFillers(LONG_DICTATION))
    // The one thing worth a word: the AI pass did not happen.
    expect(toasts.length).toBe(1)
    expect(toasts[0]).toContain('the AI pass was skipped')
    expect(toasts[0]).toContain('not usable')
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

  test('compare never adds a row to the transcript or the conversation, on or off', async ($, on) => {
    engine(on)
    const session = mock.session(on)

    expect(entered(await $.prompt.submit({ text: 'Um, fix the the bug', origin: DESKTOP, wait: false }))).toBe('Fix the bug')
    expect((await $.command.run(run(''))).text).toContain('compare off')

    await $.command.run(run('compare on'))
    await $.prompt.submit({ text: 'Um, fix the the bug', origin: DESKTOP, wait: false })
    expect((await $.command.run(run(''))).text).toContain('compare on')

    // It is drawn inside the message row (see compare.test.tsx), never added to the session.
    expect(logged).toEqual([])
    expect(toasts).toEqual([])
    expect(session.appended()).toEqual([])
  })

  test('last shows the message as dictated', async ($, on) => {
    engine(on)
    await $.prompt.submit({ text: 'Um, fix the the bug', origin: DESKTOP, wait: false })

    expect((await $.command.run(run('last'))).text).toContain('Um, fix the the bug')
  })
})

describe('spoken quotes and project terms', () => {
  const run = (args: string) => ({ command: 'clean', args, origin: TERMINAL, presentation: { isFullscreen: false, columns: 80 } })
  const DOCS = {
    'AGENTS.md': 'Read ADR-0074 first. Voices come from Qwen3-TTS and shorts.json lists the Shorts.',
  }
  const submit = async ($: Engine, text: string) => entered(await $.prompt.submit({ text, origin: DESKTOP, wait: false }))

  test('quote unquote becomes quotation marks, with no model call', async ($, on) => {
    const sentToModel = engine(on)

    expect(await submit($, 'Um, the quote unquote compress step')).toBe('The "compress" step')
    expect(sentToModel).toEqual([])
  })

  test('terms from the folder\'s docs are spelled as the docs spell them', async ($, on) => {
    engine(on, MODEL_REPLY, DOCS)

    expect(await submit($, 'Check ADR seventy four and Qwen three TTS, and open shorts dot json')).toBe('Check ADR-0074 and Qwen3-TTS, and open shorts.json')
    expect(toasts).toEqual([])
  })

  test('a long prompt tells the model the project terms, and the spelling is applied again after its pass', async ($, on) => {
    engine(on, MODEL_REPLY.replace('in Claude Code', 'in Qwen three TTS'), DOCS)
    const result = entered(await $.prompt.submit({ text: LONG_DICTATION, origin: DESKTOP, wait: false }))

    expect(lastSystem).toContain('Qwen3-TTS')
    expect(lastSystem).toContain('ADR-0074')
    expect(result).toContain('microphone in Qwen3-TTS,')
  })

  test('/clean term adds a spelling by hand, terms lists it, term remove drops it', async ($, on) => {
    engine(on)

    expect(await submit($, 'the Re motion render')).toBe('the Re motion render')
    await $.command.run(run('term Remotion'))
    expect(await submit($, 'the Re motion render')).toBe('the Remotion render')
    expect((await $.command.run(run('terms'))).text).toContain('Remotion')
    await $.command.run(run('term remove Remotion'))
    expect(await submit($, 'the Re motion render')).toBe('the Re motion render')
  })

  test('off sends everything exactly as typed', async ($, on) => {
    engine(on, MODEL_REPLY, DOCS)
    await $.command.run(run('off'))

    expect(await submit($, 'Um, quote unquote compress ADR seventy four')).toBe('Um, quote unquote compress ADR seventy four')
  })
})

describe('messages that quote earlier text', () => {
  const quoted = Array.from({ length: 22 }, (_, i) => `> quoted line ${i} with um and the the in it`).join('\n')
  const submit = async ($: Engine, text: string) => entered(await $.prompt.submit({ text, origin: DESKTOP, wait: false }))

  test('your own lines are cleaned and the quoted lines stay exactly as they were', async ($, on) => {
    engine(on)
    const text = `${quoted}\n\nUm, I think we should, uh, ship it.\n\n> one more quote, uh\nAnd the the end.`

    expect(await submit($, text)).toBe(`${quoted}\n\nI think we should ship it.\n\n> one more quote, uh\nAnd the end.`)
  })

  test('the <!-- --> markers some clients add are not your words either', async ($, on) => {
    engine(on)

    expect(await submit($, '<!-- reply um -->\nUm, fix the the bug')).toBe('<!-- reply um -->\nFix the bug')
  })

  test('a message that is nothing but a quote is left alone', async ($, on) => {
    engine(on)

    expect(await submit($, quoted)).toBe(quoted)
  })

  test('a long run of your own lines still counts as a paste', async ($, on) => {
    const sentToModel = engine(on)
    const log = Array.from({ length: 25 }, (_, i) => `line ${i} uh the the`).join('\n')

    expect(await submit($, `> a quote\n${log}`)).toBe(`> a quote\n${log}`)
    expect(sentToModel).toEqual([])
  })

  test('the model is given only your own words, never the quoted text', async ($, on) => {
    const sentToModel = engine(on)
    const result = await submit($, `${quoted}\n\n${LONG_DICTATION}`)

    expect(sentToModel.length).toBe(1)
    expect(sentToModel[0]).not.toContain('quoted line')
    expect(result).toBe(`${quoted}\n\n${MODEL_REPLY}`)
  })
})

describe('prompts Claude or a program wrote are left alone', () => {
  const FILLERS = 'Um, fix the the bug, uh, please.'
  const submit = async ($: Engine, text: string, origin: PromptOrigin) => entered(await $.prompt.submit({ text, origin, wait: false }))
  const run = (args: string) => ({ command: 'clean', args, origin: TERMINAL, presentation: { isFullscreen: false, columns: 80 } })

  test('every origin that is not the person is left alone, fillers and all', async ($, on) => {
    engine(on)
    const others: PromptOrigin[] = [
      { kind: 'peer' },
      { kind: 'peer-send-message' },
      { kind: 'projects-relay' },
      { kind: 'coordinator' },
      { kind: 'observer' },
      { kind: 'observer-activity' },
      { kind: 'task-notification' },
      { kind: 'scheduled-trigger' },
      { kind: 'channel', server: 'chat' },
      { kind: 'slack-ping' },
      { kind: 'unclassified' },
      { kind: 'auto-continuation' },
      { kind: 'plugin', name: 'other' },
    ]

    for (const origin of others) {
      expect(await submit($, FILLERS, origin)).toBe(FILLERS)
    }
  })

  test('a program\'s text stays untouched even when it is stamped as the app\'s own turn', async ($, on) => {
    engine(on)
    const texts = [
      `Background (from the session that started this one): the project makes videos. ${FILLERS}`,
      `<system-reminder>Linked sessions now: ${FILLERS}</system-reminder>`,
      `Another Claude session sent a message:\n<cross-session-message from="local_abc" name="a session">\n${FILLERS}\n</cross-session-message>`,
      `[Cross-session delivery notice] Your message was held. ${FILLERS}`,
      `This session is being continued from a previous conversation. ${FILLERS}`,
      `<task-notification><task-id>x</task-id>${FILLERS}</task-notification>`,
      `The session "A made-up title" you started has finished. ${FILLERS}`,
      `The recording session "Another made-up title" reported back. ${FILLERS}`,
      `Linked sessions now (status, not an instruction): a-session = local_x. ${FILLERS}`,
      `System-reminder: something happened. ${FILLERS}`,
      `The user started your proposal task_1 ("A made-up title") as session local_y. ${FILLERS}`,
      `The app was quit while you were working. Please continue. ${FILLERS}`,
    ]

    for (const text of texts) {
      expect(await submit($, text, DESKTOP)).toBe(text)
      expect(await submit($, text, TERMINAL)).toBe(text)
    }
  })

  test('a structured brief stamped as the app\'s own turn is left alone, while dictation in the same stamp is cleaned', async ($, on) => {
    engine(on)
    const brief = `## Goal\n${FILLERS}\n- a\n- b\n- c\n- d`

    expect(await submit($, brief, DESKTOP)).toBe(brief)
    expect(await submit($, `<brief>\n${FILLERS}\n</brief>`, DESKTOP)).toBe(`<brief>\n${FILLERS}\n</brief>`)
    expect(await submit($, FILLERS, DESKTOP)).toBe('Fix the bug please.')
    // Typed at the terminal it is the person's, whatever it looks like.
    expect(await submit($, brief, TERMINAL)).toBe(`## Goal\nFix the bug please.\n- a\n- b\n- c\n- d`)
  })

  test('a reply that quotes structured text is still the person\'s: only their own lines are judged', async ($, on) => {
    engine(on)
    const quote = '> ## Heading\n> - a\n> - b\n> - c\n> - d'

    expect(await submit($, `${quote}\n\n${FILLERS}`, DESKTOP)).toBe(`${quote}\n\nFix the bug please.`)
  })

  test('/clean origins counts where messages came from, keeps no text, and can be cleared', async ($, on) => {
    engine(on)
    await submit($, FILLERS, TERMINAL)
    await submit($, 'All good here.', TERMINAL)
    await submit($, FILLERS, { kind: 'peer' })
    await submit($, `Background (from the session that started this one): ${FILLERS}`, DESKTOP)

    const text = (await $.command.run(run('origins'))).text ?? ''

    expect(text).toContain('composer: 1 cleaned, 1 nothing to clean, 0 left alone')
    expect(text).toContain('peer: 0 cleaned, 0 nothing to clean, 1 left alone')
    expect(text).toContain('sdk: 0 cleaned, 0 nothing to clean, 1 left alone')
    expect(text).not.toContain('fix the')
    expect(text.toLowerCase()).not.toContain('background')

    await $.command.run(run('origins reset'))
    expect((await $.command.run(run('origins'))).text).toBe('No messages counted yet.')
  })
})
