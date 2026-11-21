import { describe, expect, test } from 'vitest'

import { decodeReport } from './report'
import type { Report } from './types'

const report: Report = {
  version: 1,
  frames: [
    {
      id: 0,
      messages: [{ tag: 'ClickedRow', updateMs: 0.2, changedModel: true }],
      updateMs: 0.2,
      viewMs: 1,
      patchMs: 0.5,
      totalMs: 1.7,
      changes: [{ kind: 'Changed', label: 'src/rows.ts#row' }],
      isWasted: false,
      isReplay: false,
      historyIndex: 3,
    },
  ],
  hotspots: {
    byView: [{ name: 'src/rows.ts#row', count: 1, totalMs: 1.5 }],
    byMessage: [],
  },
  lazy: [
    {
      name: 'Row',
      hits: 3,
      misses: 1,
      unstableArgs: [0],
      unstableFunction: false,
    },
  ],
  issues: [],
  commands: [
    {
      name: 'FetchWeather',
      startedAt: 10,
      durationMs: 42,
      outcome: 'Success',
      resultTag: 'GotWeather',
    },
    // Still running: no duration, no result.
    { name: 'FetchWeather', startedAt: 60, outcome: 'Running' },
  ],
}

describe('decodeReport', () => {
  test('accepts a report that went through JSON', () => {
    expect(decodeReport(JSON.parse(JSON.stringify(report)))).toEqual(report)
  })

  test('rejects anything else with a readable error', () => {
    expect(() => decodeReport({ version: 2 })).toThrow(/version/)
    expect(() => decodeReport({ ...report, frames: [{ id: 'one' }] })).toThrow(
      /frames/,
    )
  })
})
