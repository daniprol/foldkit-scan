import { Cause, Exit, Option, Tracer } from 'effect'

import type { CommandRecord, Hotspot } from './types'

// Watching Commands.
//
// Foldkit runs every Command inside an Effect span named after the Command:
// `command.effect.pipe(Effect.withSpan(command.name), provideResources)`.
// Effect asks the current Tracer to create that span. If you hand Foldkit a
// Tracer through `resources`, it is the one asked, so a Tracer is the
// natural, public place to see when a Command starts and ends.
//
// We only record top-level spans. Spans nested inside a Command (an HTTP
// call, your own `Effect.withSpan`) belong to that Command.

/** Keep at most this many Commands. */
const MAX_COMMANDS = 200

export type CommandListener = (command: CommandRecord) => void

export type CommandTracker = Readonly<{
  /** A Tracer that records Commands. Spans are still created by `inner`
   *  (Effect's own tracer by default), so an existing tracer keeps working. */
  tracer: (inner?: Tracer.Tracer) => Tracer.Tracer
  /** Recent Commands, oldest first. Running ones have no `durationMs`. */
  recent: () => ReadonlyArray<CommandRecord>
  /** Commands that started after `from` and up to `to`. */
  startedBetween: (from: number, to: number) => ReadonlyArray<CommandRecord>
  /** Finished Commands grouped by name, slowest total first. */
  byName: () => ReadonlyArray<Hotspot>
  /** Called when a Command finishes. */
  subscribe: (listener: CommandListener) => () => void
  reset: () => void
}>

/** The `_tag` of the Message a Command returned, if it returned one. */
const resultTagOf = (value: unknown): string | undefined => {
  if (typeof value === 'object' && value !== null && '_tag' in value) {
    const tag = value._tag
    return typeof tag === 'string' ? tag : undefined
  }
  return undefined
}

const toFinished = (
  running: CommandRecord,
  endedAt: number,
  exit: Exit.Exit<unknown, unknown>,
): CommandRecord => {
  const durationMs = endedAt - running.startedAt
  if (Exit.isSuccess(exit)) {
    return {
      ...running,
      durationMs,
      outcome: 'Success',
      resultTag: resultTagOf(exit.value),
    }
  }
  return {
    ...running,
    durationMs,
    outcome: Cause.hasInterruptsOnly(exit.cause) ? 'Interrupted' : 'Failure',
  }
}

export const makeCommandTracker = (
  now: () => number = () => performance.now(),
): CommandTracker => {
  let commands: Array<CommandRecord> = []
  let nextId = 0
  const listeners = new Set<CommandListener>()

  const start = (name: string): CommandRecord => {
    const command: CommandRecord = {
      id: nextId++,
      name,
      startedAt: now(),
      durationMs: undefined,
      outcome: 'Running',
      resultTag: undefined,
    }
    commands.push(command)
    if (commands.length > MAX_COMMANDS) {
      commands = commands.slice(-MAX_COMMANDS)
    }
    return command
  }

  const finish = (
    running: CommandRecord,
    exit: Exit.Exit<unknown, unknown>,
  ): void => {
    const finished = toFinished(running, now(), exit)
    const index = commands.lastIndexOf(running)
    if (index !== -1) {
      commands[index] = finished
    }
    for (const listener of listeners) {
      listener(finished)
    }
  }

  const tracer = (inner: Tracer.Tracer = Tracer.nativeTracer): Tracer.Tracer =>
    Tracer.make({
      span: options => {
        const span = inner.span(options)
        if (Option.isSome(options.parent)) {
          return span
        }
        const running = start(options.name)
        const end = span.end.bind(span)
        span.end = (endTime, exit) => {
          finish(running, exit)
          end(endTime, exit)
        }
        return span
      },
      context: inner.context,
    })

  const byName = (): ReadonlyArray<Hotspot> => {
    const totals = new Map<string, { count: number; totalMs: number }>()
    for (const command of commands) {
      if (command.durationMs === undefined) continue
      const total = totals.get(command.name) ?? { count: 0, totalMs: 0 }
      total.count += 1
      total.totalMs += command.durationMs
      totals.set(command.name, total)
    }
    return [...totals]
      .map(([name, total]) => ({ name, ...total }))
      .sort((a, b) => b.totalMs - a.totalMs)
  }

  return {
    tracer,
    recent: () => commands,
    startedBetween: (from, to) =>
      commands.filter(c => c.startedAt > from && c.startedAt <= to),
    byName,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    reset: () => {
      commands = []
    },
  }
}
