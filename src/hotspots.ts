import type { FrameRecord, Hotspot } from './types'

// Which parts of the page and which Messages keep the app busy, over the
// last few seconds.

const WINDOW_MS = 5000

type Entry = Readonly<{ at: number; name: string; ms: number }>

export type Hotspots = Readonly<{
  observeFrame: (frame: FrameRecord) => void
  /** Regions patched most often, by view function label. */
  byView: () => ReadonlyArray<Hotspot>
  /** Messages seen most often, with their total update time. */
  byMessage: () => ReadonlyArray<Hotspot>
  reset: () => void
}>

const rank = (entries: ReadonlyArray<Entry>): ReadonlyArray<Hotspot> => {
  const totals = new Map<string, { count: number; totalMs: number }>()
  for (const entry of entries) {
    const total = totals.get(entry.name) ?? { count: 0, totalMs: 0 }
    total.count += 1
    total.totalMs += entry.ms
    totals.set(entry.name, total)
  }
  return [...totals]
    .map(([name, total]) => ({ name, ...total }))
    .sort((a, b) => b.count - a.count || b.totalMs - a.totalMs)
}

export const makeHotspots = (
  now: () => number = () => performance.now(),
): Hotspots => {
  let views: Array<Entry> = []
  let messages: Array<Entry> = []

  const prune = (): void => {
    const cutoff = now() - WINDOW_MS
    views = views.filter(entry => entry.at >= cutoff)
    messages = messages.filter(entry => entry.at >= cutoff)
  }

  return {
    observeFrame: frame => {
      if (frame.isReplay) return
      // One entry per label per frame, carrying that frame's render time.
      const labels = new Set(frame.changes.map(change => change.label))
      for (const name of labels) {
        views.push({ at: frame.at, name, ms: frame.viewMs + frame.patchMs })
      }
      for (const message of frame.messages) {
        messages.push({
          at: frame.at,
          name: message.leafTag,
          ms: message.updateMs,
        })
      }
      prune()
    },
    byView: () => {
      prune()
      return rank(views)
    },
    byMessage: () => {
      prune()
      return rank(messages)
    },
    reset: () => {
      views = []
      messages = []
    },
  }
}
