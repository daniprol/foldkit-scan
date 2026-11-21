// The data foldkit-scan records. Everything here is plain, readonly data,
// so you can log it, store it or send it anywhere.

/** One Message that went through your `update` function. */
export type MessageRecord = Readonly<{
  /** The Message tag. Submodel Messages show their path, like
   *  `GotTableMessage › ClickedRow`. */
  tag: string
  /** Just the innermost tag, like `ClickedRow`. Used in short labels. */
  leafTag: string
  /** How long `update` took for this Message, in milliseconds. */
  updateMs: number
  /** `true` when `update` returned a new Model object. Only these
   *  Messages make Foldkit render. */
  changedModel: boolean
  /** `true` when the new Model is a different object but equal in value
   *  to the old one. That render was not needed. */
  isEqualInValue: boolean
}>

/**
 * What happened to one element during a frame.
 *
 * - `Changed`: an attribute or text inside it changed.
 * - `Created`: it is new.
 * - `Moved`: it is the same element in a new place, like a keyed reorder.
 * - `Removed`: it left the page.
 * - `Churn`: it was thrown away and rebuilt by the same view function,
 *   usually because of an unstable key.
 */
export type DomChangeKind =
  | 'Changed'
  | 'Created'
  | 'Moved'
  | 'Removed'
  | 'Churn'

export type DomChange = Readonly<{
  kind: DomChangeKind
  /** The view function that rendered it, like `src/rows.ts#todoRow`,
   *  or a `tag#id.class` fallback. */
  label: string
  element: Element
}>

/** One Foldkit render: a single view and patch, and every Message that
 *  arrived since the previous render. */
export type FrameRecord = Readonly<{
  id: number
  /** `performance.now()` when the frame finished patching. */
  at: number
  messages: ReadonlyArray<MessageRecord>
  updateMs: number
  viewMs: number
  patchMs: number
  /** `updateMs + viewMs + patchMs`. */
  totalMs: number
  changes: ReadonlyArray<DomChange>
  /** The Model changed by reference, but the page did not change at all,
   *  or the new Model was equal in value to the old one. */
  isWasted: boolean
  /** The page changed without a Foldkit render: DevTools time travel, or
   *  code outside Foldkit. Drawn grey and left out of every statistic. */
  isReplay: boolean
}>

/** Hit and miss counts for one lazy slot wrapped with `scan.lazy` or
 *  `scan.keyedLazy`. */
export type LazyStat = Readonly<{
  name: string
  hits: number
  misses: number
  /** Argument positions that changed by reference while staying equal in
   *  value. These break memoization for nothing. */
  unstableArgs: ReadonlyArray<number>
  /** `true` when the view function itself was a new function, for example
   *  an arrow function written inline in the view. */
  unstableFunction: boolean
}>

export type IssueKind =
  | 'UnstableLazyArgument'
  | 'KeyedChurn'
  | 'WastedRender'
  | 'SlowPhase'

/** Something worth fixing. Issues are only raised when they repeat. */
export type Issue = Readonly<{
  /** Stable id, used to dismiss it. */
  id: string
  kind: IssueKind
  /** What is affected, like `TodoRow` or `src/rows.ts#todoRow`. */
  subject: string
  /** One plain sentence: what happened and why it costs you. */
  explanation: string
  /** What to try. */
  hint: string
  count: number
  lastSeenAt: number
}>

/** A row in the Hotspots tab. */
export type Hotspot = Readonly<{
  name: string
  count: number
  totalMs: number
}>

/** A serialisable snapshot of everything foldkit-scan knows, returned by
 *  `scan.report()` and `window.__FOLDKIT_SCAN__.report()`. DOM elements are
 *  left out, so it survives `JSON.stringify`. */
export type Report = Readonly<{
  version: 1
  frames: ReadonlyArray<
    Readonly<{
      id: number
      messages: ReadonlyArray<
        Readonly<{ tag: string; updateMs: number; changedModel: boolean }>
      >
      updateMs: number
      viewMs: number
      patchMs: number
      totalMs: number
      changes: ReadonlyArray<Readonly<{ kind: DomChangeKind; label: string }>>
      isWasted: boolean
      isReplay: boolean
    }>
  >
  hotspots: Readonly<{
    byView: ReadonlyArray<Hotspot>
    byMessage: ReadonlyArray<Hotspot>
  }>
  lazy: ReadonlyArray<LazyStat>
  issues: ReadonlyArray<Omit<Issue, 'lastSeenAt'>>
}>
