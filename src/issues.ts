import { shortLabel } from './identity'
import { PHASE_BUDGETS_MS } from './slow'
import type { FrameRecord, Issue, IssueKind } from './types'

// Turning raw frames into a short list of things worth fixing.
//
// A one-off is not a problem: the first render, a hot reload or a tab switch
// can all be slow once. An issue is only raised when it repeats:
// - seen at least twice within 5 seconds, or
// - a phase over its budget in 3 of the last 10 frames.

const WINDOW_MS = 5000
const REPEATS_NEEDED = 2
const SLOW_FRAMES_NEEDED = 3
const SLOW_FRAMES_WINDOW = 10

type Sighting = Readonly<{
  kind: IssueKind
  subject: string
  explanation: string
  hint: string
}>

export type IssueTracker = Readonly<{
  observeFrame: (frame: FrameRecord) => void
  observeUnstableLazy: (
    name: string,
    detail: Readonly<{
      unstableArgs: ReadonlyArray<number>
      isUnstableFunction: boolean
    }>,
  ) => void
  issues: () => ReadonlyArray<Issue>
  dismiss: (id: string) => void
  reset: () => void
}>

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`

export const makeIssueTracker = (
  options: Readonly<{
    now?: () => number
    dismissed?: ReadonlyArray<string>
    onChange?: () => void
  }> = {},
): IssueTracker => {
  const now = options.now ?? (() => performance.now())
  const dismissed = new Set(options.dismissed ?? [])
  const recent = new Map<string, Array<number>>()
  const issues = new Map<string, Issue>()
  let slowHistory: Array<ReadonlyArray<keyof typeof PHASE_BUDGETS_MS>> = []

  const see = (sighting: Sighting, at = now()): void => {
    const id = `${sighting.kind}:${sighting.subject}`
    const times = (recent.get(id) ?? []).filter(t => at - t <= WINDOW_MS)
    times.push(at)
    recent.set(id, times)

    const existing = issues.get(id)
    if (existing !== undefined) {
      issues.set(id, {
        ...existing,
        ...sighting,
        count: existing.count + 1,
        lastSeenAt: at,
      })
      options.onChange?.()
    } else if (times.length >= REPEATS_NEEDED && !dismissed.has(id)) {
      issues.set(id, { id, ...sighting, count: times.length, lastSeenAt: at })
      options.onChange?.()
    }
  }

  const observeChurn = (frame: FrameRecord): void => {
    const rebuiltByLabel = new Map<string, number>()
    for (const change of frame.changes) {
      if (change.kind === 'Churn') {
        rebuiltByLabel.set(
          change.label,
          (rebuiltByLabel.get(change.label) ?? 0) + 1,
        )
      }
    }
    for (const [label, count] of rebuiltByLabel) {
      see({
        kind: 'KeyedChurn',
        subject: shortLabel(label),
        explanation: `${plural(count, 'row')} were thrown away and rebuilt instead of reused.`,
        hint: 'Key each row by a stable id from the Model, never by its position in the list.',
      })
    }
  }

  const observeWasted = (frame: FrameRecord): void => {
    // A Message that returned a new but equal Model is a bug on its own,
    // even when another Message in the same frame really changed something.
    const equalInValue = new Set(
      frame.messages.filter(m => m.isEqualInValue).map(m => m.leafTag),
    )
    for (const tag of equalInValue) {
      see({
        kind: 'WastedRender',
        subject: tag,
        explanation: `${tag} returned a new Model that is equal in value to the old one. On its own, that makes Foldkit render for nothing.`,
        hint: 'When nothing changes, return the same Model ({ model }). modifyFields always builds a new object.',
      })
    }
    if (!frame.isWasted || equalInValue.size > 0) return
    const culprit = frame.messages.filter(m => m.changedModel).at(-1)
    if (culprit === undefined) return
    see({
      kind: 'WastedRender',
      subject: culprit.leafTag,
      explanation: `${culprit.leafTag} returned a new Model, but nothing on the page changed.`,
      hint: 'If the change is not shown anywhere, check whether it belongs in the Model. Otherwise return the same Model.',
    })
  }

  const observeSlow = (frame: FrameRecord): void => {
    const slowUpdate = frame.messages.some(
      m => m.updateMs > PHASE_BUDGETS_MS.Update,
    )
    const phases: Array<keyof typeof PHASE_BUDGETS_MS> = []
    if (slowUpdate) phases.push('Update')
    if (frame.viewMs > PHASE_BUDGETS_MS.View) phases.push('View')
    if (frame.patchMs > PHASE_BUDGETS_MS.Patch) phases.push('Patch')
    slowHistory = [...slowHistory, phases].slice(-SLOW_FRAMES_WINDOW)

    for (const phase of phases) {
      const slowCount = slowHistory.filter(p => p.includes(phase)).length
      if (slowCount < SLOW_FRAMES_NEEDED) continue
      // Counts once per slow frame, so it is an issue right away.
      const id = `SlowPhase:${phase}`
      const hint = {
        Update:
          'Keep update to state changes. Move derived data for display into memoized views.',
        View: 'Wrap stable parts of the page in createLazy or createKeyedLazy.',
        Patch:
          'Key mapped lists by stable ids, split large views, or memoize stable subtrees.',
      }[phase]
      const sighting: Sighting = {
        kind: 'SlowPhase',
        subject: phase,
        explanation: `${phase} went over Foldkit's ${PHASE_BUDGETS_MS[phase]} ms budget in ${slowCount} of the last ${slowHistory.length} frames.`,
        hint,
      }
      if (!dismissed.has(id)) {
        const existing = issues.get(id)
        issues.set(id, {
          id,
          ...sighting,
          count: (existing?.count ?? 0) + 1,
          lastSeenAt: now(),
        })
        options.onChange?.()
      }
    }
  }

  return {
    observeFrame: frame => {
      if (frame.isReplay) return
      observeChurn(frame)
      observeWasted(frame)
      observeSlow(frame)
    },
    observeUnstableLazy: (name, detail) => {
      if (detail.isUnstableFunction) {
        see({
          kind: 'UnstableLazyArgument',
          subject: `${name} · view function`,
          explanation: `The view function given to ${name} is a new function every render, so the slot can never hit.`,
          hint: 'Define the view function once, outside the view, and pass data through the argument array.',
        })
      }
      for (const index of detail.unstableArgs) {
        see({
          kind: 'UnstableLazyArgument',
          subject: `${name} · arg ${index}`,
          explanation: `Argument ${index} of ${name} is a new object every render but equal in value, so the slot misses and the view runs again.`,
          hint: 'Pass the object stored in the Model instead of building a new one in the view, or pass its fields separately.',
        })
      }
    },
    // In the order they were first found, so the list does not jump around
    // while you read it.
    issues: () => [...issues.values()],
    dismiss: id => {
      dismissed.add(id)
      issues.delete(id)
      options.onChange?.()
    },
    reset: () => {
      issues.clear()
      recent.clear()
      slowHistory = []
    },
  }
}
