import { Equal, Option } from 'effect'
import { Runtime } from 'foldkit'
import { extractSubmodelInfo } from 'foldkit/devtools-host'

import type { MessageRecord } from './types'

// foldkit-scan gets its timings from Foldkit itself.
//
// Foldkit's `slow` option measures every update, view and patch, and calls
// `onSlow` when one takes longer than its budget. Foldkit only fires when
// `durationMs > thresholdMs`, so a budget of -1 makes it fire every time,
// even for a 0 ms phase. That turns a "slow warning" hook into a full
// profiler feed, without wrapping your `update` or `view`.
//
// A bonus: DevTools time travel replays your view with the timings turned
// off, so replays never show up here.

/** Foldkit's own default budgets, in milliseconds. foldkit-scan uses them to
 *  decide when a phase was slow. */
export const PHASE_BUDGETS_MS = {
  Update: 4,
  View: 16,
  Patch: 8,
} as const

const EVERY_TIME = -1

/** Turns a Message into a readable tag. Submodel Messages, which wrap a
 *  child Message as `GotChildMessage({ message })`, become
 *  `GotChildMessage › ClickedRow`, the same way DevTools shows them. */
export const describeMessage = (
  message: unknown,
): Readonly<{ tag: string; leafTag: string }> => {
  const tag =
    typeof message === 'object' && message !== null && '_tag' in message
      ? String(message._tag)
      : 'unknown'
  const { submodelPath, maybeLeafTag } = extractSubmodelInfo(tag, message)
  if (submodelPath.length === 0) {
    return { tag, leafTag: tag }
  }
  const leafTag = Option.getOrElse(maybeLeafTag, () => tag)
  return { tag: [...submodelPath, leafTag].join(' › '), leafTag }
}

/** What to do with each measurement. `Scan.make` passes these. */
export type SlowHandlers = Readonly<{
  onMessage: (message: MessageRecord) => void
  onView: (durationMs: number) => void
  onPatch: (durationMs: number) => void
}>

export type SlowOptions = Readonly<{
  handlers: SlowHandlers
  ignoreMessages: ReadonlyArray<string>
  /** Also call Foldkit's default console warning when a phase goes over
   *  Foldkit's real budget. */
  forwardSlowWarnings: boolean
}>

export const makeSlowConfig = <Model, Message>(
  options: SlowOptions,
): Runtime.SlowConfig<Model, Message> => {
  const { handlers, ignoreMessages, forwardSlowWarnings } = options

  const forward = (
    context: Runtime.SlowContext<Model, Message>,
    budgetMs: number,
  ): void => {
    if (forwardSlowWarnings && context.durationMs > budgetMs) {
      Runtime.defaultSlowCallback({ ...context, thresholdMs: budgetMs })
    }
  }

  // A plain switch on `_tag`. In your app you would use the union's
  // `match` helper (Foldkit's lint rule says so), but this runs for every
  // Message, so it stays as cheap as possible. The `default` branch keeps
  // it exhaustive.
  const onSlow = (context: Runtime.SlowContext<Model, Message>): void => {
    switch (context._tag) {
      case 'Update': {
        forward(context, PHASE_BUDGETS_MS.Update)
        const { tag, leafTag } = describeMessage(context.message)
        if (ignoreMessages.includes(leafTag)) {
          return
        }
        const changedModel = context.previousModel !== context.nextModel
        const record: MessageRecord = {
          tag,
          leafTag,
          updateMs: context.durationMs,
          changedModel,
          // Equal.equals compares plain objects and arrays by value.
          isEqualInValue:
            changedModel &&
            Equal.equals(context.previousModel, context.nextModel),
        }
        handlers.onMessage(record)
        return
      }
      case 'View':
        forward(context, PHASE_BUDGETS_MS.View)
        handlers.onView(context.durationMs)
        return
      case 'Patch':
        forward(context, PHASE_BUDGETS_MS.Patch)
        handlers.onPatch(context.durationMs)
        return
      case 'SubscriptionDependencies':
        // Not part of a frame. Measured with Foldkit's normal budget, so
        // the default warning still works when asked for.
        if (forwardSlowWarnings) {
          Runtime.defaultSlowCallback(context)
        }
        return
      default:
        // If Foldkit adds a phase, this line stops compiling.
        return context satisfies never
    }
  }

  return {
    // `enabled` in Scan.make already decides whether this runs at all.
    show: 'Always',
    thresholdOverrides: {
      Update: EVERY_TIME,
      View: EVERY_TIME,
      Patch: EVERY_TIME,
    },
    onSlow,
  }
}
