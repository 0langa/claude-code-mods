import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

import type { Deferred, Pending, WrapUpAction } from '../types'
import { isDeferral, joinAnswer } from './classify'
import { isFromPerson, personText } from './source'

const PLUGIN = 'deferred-answers'
const WRAP_UP = 'mcp__ccd_turn__wrap_up'
const START_SESSION = 'mcp__ccd_session__start_session'
const CLOSE_NAME = 'deferred_close'
const CLOSE_TOOL = `mcp__${PLUGIN}__${CLOSE_NAME}`
const MAX_ANSWER_CHARS = 300

const pending = atom({ plugin: 'deferred-answers', key: 'pending' } as const, null as Pending | null)
const open = atom({ plugin: 'deferred-answers', key: 'open' } as const, [] as readonly Deferred[])
const nextId = atom({ plugin: 'deferred-answers', key: 'nextId' } as const, 1)
const running = atom({ plugin: 'deferred-answers', key: 'running' } as const, [] as readonly string[])
const turnByPerson = atom({ plugin: 'deferred-answers', key: 'turnByPerson' } as const, true)
const held = atom({ plugin: 'deferred-answers', key: 'held' } as const, null as string | null)

// The app's note once every session this one started has stopped working.
const ALL_IDLE = /None of the sessions you started is working now/i
const STARTED_ID = /\bsession_id:\s*(local_[\w-]+)/i

const HELD_NOTE =
  'The deferred-answers mod held your question back: sessions you started are still working, and a question box should only appear once everything is done. Ask it again when they have finished.'
const KEPT_NOTE =
  'The deferred-answers mod kept the question that is already on screen: the person has not answered it yet, and this turn was not started by them, so the box must not change under them. Ask anything new after they answer.'
const heldReminder = (question: string) =>
  `Every session you started has finished. You held this question back while they worked; ask it now if it still applies: "${question}"`

const clip = (text: string) => (text.length > MAX_ANSWER_CHARS ? `${text.slice(0, MAX_ANSWER_CHARS)}…` : text)

const keep = async ($: EngineInterface, question: string, answer: string) => {
  const id = await read($, nextId)

  await update($, nextId, () => id + 1)
  await update($, open, items => [...items, { id, question: clip(question.trim()), answer: clip(answer.trim()) }])
}

// What the model reads beside every message while something is open.
export const contextFor = (items: readonly Deferred[]) =>
  [
    'Open items the user put off earlier in this session (tracked by the deferred-answers mod). Each stays open until it is done or the user drops it.',
    'Bring one back when its condition is met (an "after X" once X is done) or when the current work ends. Do not act on it before then, and do not ask about it every turn.',
    `When one is done, or the user drops it, close it with the ${CLOSE_TOOL} tool. If an item was recorded by mistake, close it as dropped.`,
    ...items.map(item => `#${item.id} Asked: "${item.question}" They answered: "${item.answer}"`),
  ].join('\n')

type AskResult = {
  answers?: Readonly<Record<string, string>>
  annotations?: Readonly<Record<string, { notes?: string } | undefined>>
  response?: string
  afkTimeoutMs?: number
}

type WrapUpInput = { ask?: unknown; actions?: unknown; blocked?: unknown }

const actionsOf = (actions: unknown): readonly WrapUpAction[] =>
  Array.isArray(actions)
    ? actions
        .filter((action): action is Record<string, unknown> => action !== null && typeof action === 'object')
        .map(action => ({
          ...(typeof action.label === 'string' ? { label: action.label } : {}),
          ...(typeof action.action === 'string' ? { action: action.action } : {}),
        }))
    : []

const withNote = (result: ToolCallResult, note: string): ToolCallResult =>
  'deny' in result && result.deny !== undefined ? result : { ...result, context: [...(result.context ?? []), note] }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: CLOSE_NAME,
      description:
        'Closes an item the user put off (listed as "#<id>" in the open items beside their message) once it is done or the user drops it.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'The item number, without the #.' },
          why: { type: 'string', enum: ['done', 'dropped'] },
        },
        required: ['id'],
      },
      isDeferred: false,
    })
    await $.command.register({
      name: 'deferred',
      description: 'Questions you put off: list them, or drop one',
      argumentHint: '[drop <n> | drop all]',
      immediate: true,
    })

    return next(e)
  })

  // Sessions this one starts are tracked until the app says none is working.
  on('tool.call', { tool: START_SESSION }, async ($, e, next) => {
    const result = await next(e)

    if (e.agentId !== undefined || 'deny' in result) {
      return result
    }
    const started = STARTED_ID.exec(JSON.stringify(result.result ?? ''))?.[1]

    if (started !== undefined) {
      await update($, running, list => (list.includes(started) ? list : [...list, started]))
    }

    return result
  })

  // The next-step box. It appears once, when everything is done, and does not
  // change under the person while it waits for them.
  on('tool.call', { tool: WRAP_UP }, async ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }
    const input = e as unknown as WrapUpInput
    const ask = typeof input.ask === 'string' ? input.ask.trim() : ''
    const asked = await read($, pending)

    // A turn the person did not start (a session's note, an event) keeps the
    // question that is on screen.
    if (asked !== null && !(await read($, turnByPerson)) && ask !== asked.question) {
      return withNote(await next({ ...e, ask: asked.question, actions: asked.actions } as typeof e), KEPT_NOTE)
    }

    // While sessions this one started are working, no question is shown.
    if (ask !== '' && (await read($, running)).length > 0) {
      const { ask: _ask, actions: _actions, blocked: _blocked, ...rest } = e as typeof e & WrapUpInput

      await update($, held, () => ask)

      return withNote(await next(rest as typeof e), HELD_NOTE)
    }
    const result = await next(e)

    if (!('deny' in result)) {
      await update($, pending, () => (ask === '' ? null : { question: ask, labels: actionsOf(input.actions).flatMap(action => (action.label === undefined ? [] : [action.label])), actions: actionsOf(input.actions) }))
      await update($, held, () => null)
    }

    return result
  })

  // The question dialog answers in its result: the picks, a note on a pick,
  // text typed under "Other", and whether it closed on its own.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const result = await next(e)

    if (e.tool !== 'AskUserQuestion' || e.agentId !== undefined || 'deny' in result || result.isError === true) {
      return result
    }
    const answered = (result.result ?? {}) as AskResult
    const questions = e.questions.map(question => question.question)

    for (const question of questions) {
      if (answered.afkTimeoutMs !== undefined) {
        await keep($, question, `nothing yet: the dialog closed on its own after ${Math.round(answered.afkTimeoutMs / 1000)}s while they were away`)
        continue
      }
      const words = joinAnswer(answered.answers?.[question], answered.annotations?.[question]?.notes)

      if (isDeferral(words)) {
        await keep($, question, words)
      }
    }
    if (answered.afkTimeoutMs === undefined && answered.response !== undefined && isDeferral(answered.response)) {
      await keep($, questions.join(' / '), answered.response)
    }

    return result
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command !== undefined || e.isMeta === true) {
      return next(e)
    }
    const context: string[] = []

    if (ALL_IDLE.test(e.text) && (await read($, running)).length > 0) {
      await update($, running, () => [])
      const question = await read($, held)

      if (question !== null) {
        await update($, held, () => null)
        context.push(heldReminder(question))
      }
    }
    const own = isFromPerson(e.origin) ? personText(e.text) : null

    await update($, turnByPerson, () => own !== null)

    if (own !== null) {
      const asked = await read($, pending)

      if (asked !== null) {
        await update($, pending, () => null)

        if (isDeferral(own)) {
          await keep($, asked.question, own)
        }
      }
    }
    const items = await read($, open)

    if (items.length > 0) {
      context.push(contextFor(items))
    }

    return context.length === 0 ? next(e) : next({ ...e, context: [...(e.context ?? []), ...context] })
  })

  on('tool.call', { tool: CLOSE_TOOL }, async ($, e) => {
    const id = Number((e as unknown as { id?: unknown }).id)
    const items = await read($, open)

    if (!items.some(item => item.id === id)) {
      return { result: `No open item #${id}.` }
    }
    await update($, open, list => list.filter(item => item.id !== id))

    return { result: `Closed #${id}.` }
  })

  on('command.run', { command: 'deferred' }, async ($, e) => {
    const drop = /^drop\s+(all|#?\d+)$/i.exec(e.args.trim())

    if (drop !== null) {
      const which = (drop[1] ?? '').replace('#', '').toLowerCase()

      await update($, open, list => (which === 'all' ? [] : list.filter(item => item.id !== Number(which))))
    }
    const items = await read($, open)

    if (items.length === 0) {
      return { text: 'Nothing put off.' }
    }

    return { text: items.map(item => `#${item.id} ${item.question}\n   you said: ${item.answer}`).join('\n') }
  })
}
