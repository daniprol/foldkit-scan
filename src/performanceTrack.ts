import type { CommandRecord } from './types'

// Showing foldkit-scan's numbers in Chrome's Performance panel.
//
// `performance.measure` adds a named span of time to the page's timeline.
// Chrome reads an extra `detail.devtools` object and draws those spans on
// their own tracks, grouped under "foldkit-scan", next to the browser's
// own work. Other browsers ignore the `detail` and keep a plain measure.
//
// Chrome copies each measure into a recording the moment it is made, so we
// clear it right away. Otherwise the page's list of measures would grow
// for as long as the app runs.

const TRACK_GROUP = 'foldkit-scan'

type Color = 'primary' | 'secondary' | 'tertiary' | 'warning' | 'error'

export type PerformanceTrack = Readonly<{
  update: (tag: string, durationMs: number, isWasted: boolean) => void
  view: (durationMs: number) => void
  patch: (durationMs: number) => void
  command: (command: CommandRecord) => void
}>

const measure = (
  name: string,
  start: number,
  end: number,
  track: string,
  color: Color,
  properties: ReadonlyArray<readonly [string, string]> = [],
): void => {
  try {
    performance.measure(name, {
      start,
      end,
      detail: {
        devtools: {
          dataType: 'track-entry',
          trackGroup: TRACK_GROUP,
          track,
          color,
          properties,
        },
      },
    })
    performance.clearMeasures(name)
  } catch {
    // Very old browsers do not take an options object. Nothing to show.
  }
}

/** Marks a phase that just ended and took `durationMs`. */
const endedNow = (
  name: string,
  durationMs: number,
  track: string,
  color: Color,
): void => {
  const end = performance.now()
  measure(name, end - durationMs, end, track, color)
}

export const makePerformanceTrack = (): PerformanceTrack => ({
  update: (tag, durationMs, isWasted) =>
    endedNow(
      `update ${tag}`,
      durationMs,
      'Update',
      isWasted ? 'warning' : 'primary',
    ),
  view: durationMs => endedNow('view', durationMs, 'Render', 'secondary'),
  patch: durationMs => endedNow('patch', durationMs, 'Render', 'tertiary'),
  command: command => {
    if (command.durationMs === undefined) return
    measure(
      command.name,
      command.startedAt,
      command.startedAt + command.durationMs,
      'Commands',
      command.outcome === 'Success' ? 'primary' : 'error',
      [
        ['outcome', command.outcome],
        ['result', command.resultTag ?? '-'],
      ],
    )
  },
})
