import type { DomChange, DomChangeKind } from './types'

// Watching the page for changes.
//
// A MutationObserver tells us which nodes a patch touched. Two Foldkit
// details matter here:
//
// 1. On the first render Foldkit replaces your container element with the
//    view's root element. An observer on the container would see nothing
//    afterwards, so we observe the container's parent.
// 2. A keyed reorder moves an element with `insertBefore`. The observer
//    reports that as "removed" plus "added" of the same node. That is a
//    healthy move, not a rebuild. A rebuild ("churn") is when removed nodes
//    are replaced by new nodes from the same view function.

/** At least this many rows rebuilt under one parent count as churn. */
const CHURN_MIN_ROWS = 2

/** Which kind wins when one element shows up several times in a frame. */
const KIND_PRIORITY: Readonly<Record<DomChangeKind, number>> = {
  Churn: 4,
  Created: 3,
  Moved: 2,
  Changed: 1,
  Removed: 0,
}

export type DomWatcherOptions = Readonly<{
  /** The element Foldkit renders into, as passed to `makeApplication`. */
  container: HTMLElement
  /** Nodes to ignore, like the DevTools panel and our own overlay. */
  isIgnored: (node: Node) => boolean
  labelFor: (node: Node) => string
  /** Called when changes arrive that no live frame is waiting for. */
  onUnclaimedChanges: (changes: ReadonlyArray<DomChange>) => void
  /** `true` while a live frame is waiting for its changes. */
  isFrameWaiting: () => boolean
}>

export type DomWatcher = Readonly<{
  /** Every change since the last call, sorted into kinds. */
  takeChanges: () => ReadonlyArray<DomChange>
  dispose: () => void
}>

const toElement = (node: Node): Element | null =>
  node instanceof Element ? node : node.parentElement

/** Sorts raw MutationRecords into one DomChange per element. */
export const classifyRecords = (
  records: ReadonlyArray<MutationRecord>,
  isIgnored: (node: Node) => boolean,
  labelFor: (node: Node) => string,
): ReadonlyArray<DomChange> => {
  const changed = new Set<Element>()
  const added = new Set<Element>()
  const removed = new Map<Element, Node>() // element → its old parent

  for (const record of records) {
    if (isIgnored(record.target)) {
      continue
    }
    if (record.type === 'childList') {
      for (const node of record.removedNodes) {
        if (node instanceof Element) {
          removed.set(node, record.target)
        } else {
          const target = toElement(record.target)
          if (target !== null) changed.add(target)
        }
      }
      for (const node of record.addedNodes) {
        if (node instanceof Element) {
          added.add(node)
        } else {
          const target = toElement(record.target)
          if (target !== null) changed.add(target)
        }
      }
    } else {
      const target = toElement(record.target)
      if (target !== null) changed.add(target)
    }
  }

  const changes = new Map<Element, DomChange>()
  const put = (element: Element, kind: DomChangeKind): void => {
    // A removed element is detached, so it is outside the app root and
    // would look ignored. Its parent was already checked above.
    if (kind !== 'Removed' && isIgnored(element)) {
      return
    }
    const existing = changes.get(element)
    if (
      existing === undefined ||
      KIND_PRIORITY[kind] > KIND_PRIORITY[existing.kind]
    ) {
      changes.set(element, { kind, element, label: labelFor(element) })
    }
  }

  // Removed and added again in the same frame: the same node, moved.
  for (const element of added) {
    if (removed.has(element) && element.isConnected) {
      put(element, 'Moved')
      removed.delete(element)
      added.delete(element)
    }
  }

  // Churn: under one parent, rows were removed and new rows with the same
  // label took their place.
  const createdByParent = new Map<Node, Array<Element>>()
  for (const element of added) {
    if (!element.isConnected || element.parentNode === null) continue
    const siblings = createdByParent.get(element.parentNode) ?? []
    siblings.push(element)
    createdByParent.set(element.parentNode, siblings)
  }
  const removedByParent = new Map<Node, Array<Element>>()
  for (const [element, parent] of removed) {
    const siblings = removedByParent.get(parent) ?? []
    siblings.push(element)
    removedByParent.set(parent, siblings)
  }
  for (const [parent, created] of createdByParent) {
    const gone = removedByParent.get(parent) ?? []
    const goneLabels = new Set(gone.map(labelFor))
    const rebuilt = created.filter(element => goneLabels.has(labelFor(element)))
    const isChurn =
      rebuilt.length >= CHURN_MIN_ROWS && gone.length >= CHURN_MIN_ROWS
    for (const element of created) {
      put(element, isChurn && rebuilt.includes(element) ? 'Churn' : 'Created')
    }
  }

  for (const [element] of removed) {
    if (!element.isConnected) {
      put(element, 'Removed')
    }
  }

  // An attribute change inside a new element is part of creating it.
  const createdElements = [...changes.values()]
    .filter(change => change.kind === 'Created' || change.kind === 'Churn')
    .map(change => change.element)
  for (const element of changed) {
    const isInsideCreated = createdElements.some(
      created => created !== element && created.contains(element),
    )
    if (!isInsideCreated && element.isConnected) {
      put(element, 'Changed')
    }
  }

  return [...changes.values()]
}

export const makeDomWatcher = (options: DomWatcherOptions): DomWatcher => {
  const { container, isIgnored, labelFor } = options
  let pending: Array<MutationRecord> = []
  let isReplayFlushQueued = false

  const takeChanges = (): ReadonlyArray<DomChange> => {
    const records = [...pending, ...observer.takeRecords()]
    pending = []
    return classifyRecords(records, isIgnored, labelFor)
  }

  // Changes that arrive while no live frame is waiting come from a
  // DevTools replay (or from code outside Foldkit). We wait one microtask
  // so a frame that is about to close can still claim them.
  const flushUnclaimed = (): void => {
    isReplayFlushQueued = false
    if (options.isFrameWaiting() || pending.length === 0) {
      return
    }
    options.onUnclaimedChanges(takeChanges())
  }

  const observer = new MutationObserver(records => {
    pending.push(...records)
    if (!options.isFrameWaiting() && !isReplayFlushQueued) {
      isReplayFlushQueued = true
      queueMicrotask(flushUnclaimed)
    }
  })

  const root = container.parentNode ?? container
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  })

  return {
    takeChanges,
    dispose: () => {
      observer.disconnect()
      pending = []
    },
  }
}
