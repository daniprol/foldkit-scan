import { Schema } from 'effect'

import type { Report } from './types'

// The report is the one place where foldkit-scan's data leaves the page:
// to a test, a CI script, or an AI agent driving a browser. Whoever reads
// it back gets untyped JSON, so `decodeReport` checks it with Effect Schema
// and returns a typed `Report`, or throws an error that says what is wrong.
//
// Schema.Struct describes an object, Schema.Array a list, Schema.Literals a
// fixed set of strings, and Schema.Finite a number that is not NaN or
// Infinity.

const Hotspot = Schema.Struct({
  name: Schema.String,
  count: Schema.Finite,
  totalMs: Schema.Finite,
})

const ReportSchema = Schema.Struct({
  version: Schema.Literal(1),
  frames: Schema.Array(
    Schema.Struct({
      id: Schema.Finite,
      messages: Schema.Array(
        Schema.Struct({
          tag: Schema.String,
          updateMs: Schema.Finite,
          changedModel: Schema.Boolean,
        }),
      ),
      updateMs: Schema.Finite,
      viewMs: Schema.Finite,
      patchMs: Schema.Finite,
      totalMs: Schema.Finite,
      changes: Schema.Array(
        Schema.Struct({
          kind: Schema.Literals([
            'Changed',
            'Created',
            'Moved',
            'Removed',
            'Churn',
          ]),
          label: Schema.String,
        }),
      ),
      isWasted: Schema.Boolean,
      isReplay: Schema.Boolean,
    }),
  ),
  hotspots: Schema.Struct({
    byView: Schema.Array(Hotspot),
    byMessage: Schema.Array(Hotspot),
  }),
  lazy: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      hits: Schema.Finite,
      misses: Schema.Finite,
      unstableArgs: Schema.Array(Schema.Finite),
      unstableFunction: Schema.Boolean,
    }),
  ),
  issues: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      kind: Schema.Literals([
        'UnstableLazyArgument',
        'KeyedChurn',
        'WastedRender',
        'SlowPhase',
      ]),
      subject: Schema.String,
      explanation: Schema.String,
      hint: Schema.String,
      count: Schema.Finite,
    }),
  ),
})

const decode = Schema.decodeUnknownSync(ReportSchema)

/** Checks unknown JSON (for example from `JSON.parse`) and returns a typed
 *  Report. Throws a readable error when the shape is wrong. */
// The return type is checked too: if the schema and the `Report` type in
// types.ts drift apart, this line stops compiling.
export const decodeReport = (input: unknown): Report => decode(input)
