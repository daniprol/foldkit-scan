import { Duration, Effect, Fiber, Tracer } from 'effect'
import { describe, expect, test } from 'vitest'

import { makeCommandTracker } from './commands'

// Each test runs an Effect the way Foldkit runs a Command: inside a span
// named after the Command, with our Tracer provided.

let clock = 0
const fakeNow = (): number => clock

const runCommand = <A, E>(
  tracker: ReturnType<typeof makeCommandTracker>,
  name: string,
  effect: Effect.Effect<A, E>,
): Promise<unknown> =>
  Effect.runPromise(
    effect.pipe(
      Effect.withSpan(name),
      Effect.provideService(Tracer.Tracer, tracker.tracer()),
      Effect.exit,
    ),
  )

describe('command tracker', () => {
  test('records a Command and the Message it returned', async () => {
    const tracker = makeCommandTracker(fakeNow)
    clock = 10
    await runCommand(
      tracker,
      'FetchWeather',
      Effect.sync(() => {
        clock = 52
        return { _tag: 'SucceededFetchWeather' }
      }),
    )
    expect(tracker.recent()).toEqual([
      {
        id: 0,
        name: 'FetchWeather',
        startedAt: 10,
        durationMs: 42,
        outcome: 'Success',
        resultTag: 'SucceededFetchWeather',
      },
    ])
  })

  test('leaves out spans nested inside a Command', async () => {
    const tracker = makeCommandTracker(fakeNow)
    await runCommand(
      tracker,
      'Save',
      Effect.void.pipe(Effect.withSpan('http.request')),
    )
    expect(tracker.recent().map(c => c.name)).toEqual(['Save'])
  })

  test('tells failures and interruptions apart', async () => {
    const tracker = makeCommandTracker(fakeNow)
    await runCommand(tracker, 'Broken', Effect.fail('boom'))
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Effect.sleep(Duration.seconds(10)).pipe(
            Effect.withSpan('Slow'),
            Effect.provideService(Tracer.Tracer, tracker.tracer()),
          ),
        )
        yield* Effect.yieldNow
        yield* Fiber.interrupt(fiber)
      }),
    )
    expect(tracker.recent().map(c => [c.name, c.outcome])).toEqual([
      ['Broken', 'Failure'],
      ['Slow', 'Interrupted'],
    ])
  })

  test('passes spans on to an existing tracer', async () => {
    const tracker = makeCommandTracker(fakeNow)
    const names: Array<string> = []
    const inner = Tracer.make({
      span: options => {
        names.push(options.name)
        return new Tracer.NativeSpan(options)
      },
    })
    await Effect.runPromise(
      Effect.void.pipe(
        Effect.withSpan('Save'),
        Effect.provideService(Tracer.Tracer, tracker.tracer(inner)),
      ),
    )
    expect(names).toEqual(['Save'])
    expect(tracker.recent()).toHaveLength(1)
  })

  test('groups finished Commands by name, slowest first', async () => {
    const tracker = makeCommandTracker(fakeNow)
    for (const [name, ms] of [
      ['Fast', 1],
      ['Slow', 30],
      ['Fast', 3],
    ] as const) {
      clock = 0
      await runCommand(
        tracker,
        name,
        Effect.sync(() => {
          clock = ms
        }),
      )
    }
    expect(tracker.byName()).toEqual([
      { name: 'Slow', count: 1, totalMs: 30 },
      { name: 'Fast', count: 2, totalMs: 4 },
    ])
  })
})
