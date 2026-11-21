import { describe, expect, test } from 'vitest'

import { makeIssueTracker } from './issues'
import type { DomChange, FrameRecord } from './types'

let nextId = 0
const frame = (overrides: Partial<FrameRecord> = {}): FrameRecord => ({
  id: nextId++,
  at: 0,
  messages: [],
  updateMs: 0,
  viewMs: 1,
  patchMs: 1,
  totalMs: 2,
  changes: [],
  isWasted: false,
  isReplay: false,
  ...overrides,
})

const churn = (count: number): ReadonlyArray<DomChange> =>
  Array.from({ length: count }, () => ({
    kind: 'Churn' as const,
    label: 'src/rows.ts#row',
    element: {} as Element,
  }))

describe('issue tracker', () => {
  test('raises an issue only when it repeats', () => {
    let time = 0
    const tracker = makeIssueTracker({ now: () => time })
    tracker.observeFrame(frame({ changes: churn(3) }))
    expect(tracker.issues()).toEqual([])

    time = 1000
    tracker.observeFrame(frame({ changes: churn(3) }))
    expect(tracker.issues().map(issue => [issue.kind, issue.subject])).toEqual([
      ['KeyedChurn', 'rows.ts#row'],
    ])
  })

  test('forgets sightings older than 5 seconds', () => {
    let time = 0
    const tracker = makeIssueTracker({ now: () => time })
    tracker.observeUnstableLazy('TaskRow', {
      unstableArgs: [1],
      isUnstableFunction: false,
    })
    time = 6000
    tracker.observeUnstableLazy('TaskRow', {
      unstableArgs: [1],
      isUnstableFunction: false,
    })
    expect(tracker.issues()).toEqual([])
  })

  test('flags a Message that returns a new but equal Model', () => {
    const tracker = makeIssueTracker({ now: () => 0 })
    const presence = {
      tag: 'GotPresence',
      leafTag: 'GotPresence',
      updateMs: 0,
      changedModel: true,
      isEqualInValue: true,
    }
    tracker.observeFrame(frame({ messages: [presence] }))
    tracker.observeFrame(frame({ messages: [presence] }))
    expect(tracker.issues()[0]?.kind).toBe('WastedRender')
  })

  test('flags a phase that is over budget in 3 of the last 10 frames', () => {
    const tracker = makeIssueTracker({ now: () => 0 })
    tracker.observeFrame(frame({ viewMs: 30 }))
    tracker.observeFrame(frame({ viewMs: 30 }))
    expect(tracker.issues()).toEqual([])
    tracker.observeFrame(frame({ viewMs: 30 }))
    expect(tracker.issues()[0]?.id).toBe('SlowPhase:View')
  })

  test('ignores replays and remembers dismissals', () => {
    const tracker = makeIssueTracker({
      now: () => 0,
      dismissed: ['KeyedChurn:rows.ts#row'],
    })
    tracker.observeFrame(frame({ changes: churn(3), isReplay: true }))
    tracker.observeFrame(frame({ changes: churn(3) }))
    tracker.observeFrame(frame({ changes: churn(3) }))
    expect(tracker.issues()).toEqual([])
  })
})
