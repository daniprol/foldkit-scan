import { Equal } from 'effect'
import type { Html, createKeyedLazy, createLazy } from 'foldkit/html'

import type { LazyStat } from './types'

// Checking whether memoization works.
//
// `createLazy()` gives you a slot. Each render you call it with a view
// function and an argument array. When the function and every argument are
// the same references (`===`) as last time, it returns the same cached vnode
// and Foldkit skips that whole subtree. Otherwise it calls your function
// again: a miss.
//
// `scan.lazy` wraps a slot with the same call signature. We keep the
// previous call's function, arguments and result. Getting the same vnode
// back is a hit. On a miss we look at which argument changed, and use
// Effect's `Equal.equals` to ask: is the new argument equal in value to the
// old one? If yes, it is an "unstable argument": a new object built every
// render, which breaks memoization for nothing.

export type LazySlot = ReturnType<typeof createLazy>
export type KeyedLazySlot = ReturnType<typeof createKeyedLazy>

type PreviousCall = {
  fn: unknown
  args: ReadonlyArray<unknown>
  vnode: Html
}

/** What happened in one lazy call, waiting for the render to commit. */
type LazyEvent = Readonly<{
  name: string
  key: PropertyKey | undefined
  isHit: boolean
  unstableArgs: ReadonlyArray<number>
  isUnstableFunction: boolean
  vnode: Html
}>

type SlotStats = {
  hits: number
  misses: number
  unstableArgs: Set<number>
  unstableFunction: boolean
}

/** Where a rendered element came from, for the inspector. */
export type LazyOrigin = Readonly<{
  name: string
  key: PropertyKey | undefined
}>

export type LazyUnstableListener = (
  name: string,
  detail: Readonly<{
    unstableArgs: ReadonlyArray<number>
    isUnstableFunction: boolean
  }>,
) => void

export type LazyTracker = Readonly<{
  wrap: (name: string, slot: LazySlot) => LazySlot
  wrapKeyed: (name: string, slot: KeyedLazySlot) => KeyedLazySlot
  /** A view call starts. Events from an earlier view that never committed
   *  (a DevTools replay) are dropped. */
  beginRender: () => void
  /** A live view finished: count its events. */
  commitRender: () => void
  /** The patch finished: remember which element each slot rendered. */
  afterPatch: () => void
  stats: () => ReadonlyArray<LazyStat>
  statFor: (name: string) => LazyStat | undefined
  originOf: (element: Element) => LazyOrigin | undefined
  reset: () => void
}>

/** Compares the previous call with this one. */
const compareCalls = (
  previous: PreviousCall | undefined,
  fn: unknown,
  args: ReadonlyArray<unknown>,
): Readonly<{
  unstableArgs: ReadonlyArray<number>
  isUnstableFunction: boolean
}> => {
  if (previous === undefined) {
    return { unstableArgs: [], isUnstableFunction: false }
  }
  // A new function that does the same thing has the same source text.
  const isUnstableFunction =
    previous.fn !== fn && String(previous.fn) === String(fn)
  const unstableArgs: Array<number> = []
  if (previous.args.length === args.length) {
    args.forEach((arg, index) => {
      const previousArg = previous.args[index]
      if (previousArg !== arg && Equal.equals(previousArg, arg)) {
        unstableArgs.push(index)
      }
    })
  }
  return { unstableArgs, isUnstableFunction }
}

export const makeLazyTracker = (
  onUnstable: LazyUnstableListener,
): LazyTracker => {
  const slots = new Map<string, SlotStats>()
  // Last call per slot and key. Keys not used by a render are dropped, the
  // same way Foldkit's keyed cache evicts them.
  const previousCalls = new Map<
    string,
    Map<PropertyKey | undefined, PreviousCall>
  >()
  let buffer: Array<LazyEvent> = []
  let committed: Array<LazyEvent> = []
  let origins = new WeakMap<Node, LazyOrigin>()

  const statsFor = (name: string): SlotStats => {
    let stats = slots.get(name)
    if (stats === undefined) {
      stats = {
        hits: 0,
        misses: 0,
        unstableArgs: new Set(),
        unstableFunction: false,
      }
      slots.set(name, stats)
    }
    return stats
  }

  const record = (
    name: string,
    key: PropertyKey | undefined,
    fn: unknown,
    args: ReadonlyArray<unknown>,
    vnode: Html,
  ): void => {
    const calls = previousCalls.get(name) ?? new Map()
    previousCalls.set(name, calls)
    const previous = calls.get(key)
    const isHit = previous !== undefined && previous.vnode === vnode
    const { unstableArgs, isUnstableFunction } = isHit
      ? { unstableArgs: [], isUnstableFunction: false }
      : compareCalls(previous, fn, args)
    calls.set(key, { fn, args, vnode })
    buffer.push({ name, key, isHit, unstableArgs, isUnstableFunction, vnode })
  }

  const wrap =
    (name: string, slot: LazySlot): LazySlot =>
    (fn, args) => {
      const vnode = slot(fn, args)
      record(name, undefined, fn, args, vnode)
      return vnode
    }

  const wrapKeyed =
    (name: string, slot: KeyedLazySlot): KeyedLazySlot =>
    (key, fn, args) => {
      const vnode = slot(key, fn, args)
      record(name, key, fn, args, vnode)
      return vnode
    }

  const commitRender = (): void => {
    const touched = new Map<string, Set<PropertyKey | undefined>>()
    // One report per slot per render, even when a list has 1,000 rows.
    const unstableBySlot = new Map<
      string,
      { unstableArgs: Set<number>; isUnstableFunction: boolean }
    >()
    for (const event of buffer) {
      const stats = statsFor(event.name)
      if (event.isHit) {
        stats.hits += 1
      } else {
        stats.misses += 1
      }
      for (const index of event.unstableArgs) {
        stats.unstableArgs.add(index)
      }
      stats.unstableFunction ||= event.isUnstableFunction
      if (event.unstableArgs.length > 0 || event.isUnstableFunction) {
        const slot = unstableBySlot.get(event.name) ?? {
          unstableArgs: new Set<number>(),
          isUnstableFunction: false,
        }
        for (const index of event.unstableArgs) slot.unstableArgs.add(index)
        slot.isUnstableFunction ||= event.isUnstableFunction
        unstableBySlot.set(event.name, slot)
      }
      const keys = touched.get(event.name) ?? new Set()
      keys.add(event.key)
      touched.set(event.name, keys)
    }
    for (const [name, slot] of unstableBySlot) {
      onUnstable(name, {
        unstableArgs: [...slot.unstableArgs].sort((a, b) => a - b),
        isUnstableFunction: slot.isUnstableFunction,
      })
    }
    // Forget keys this render did not use.
    for (const [name, calls] of previousCalls) {
      const keys = touched.get(name)
      if (keys === undefined) continue
      for (const key of calls.keys()) {
        if (!keys.has(key)) calls.delete(key)
      }
    }
    committed = buffer
    buffer = []
  }

  const afterPatch = (): void => {
    for (const event of committed) {
      if (event.vnode?.elm !== undefined) {
        origins.set(event.vnode.elm, { name: event.name, key: event.key })
      }
    }
    committed = []
  }

  const toStat = (name: string, stats: SlotStats): LazyStat => ({
    name,
    hits: stats.hits,
    misses: stats.misses,
    unstableArgs: [...stats.unstableArgs].sort((a, b) => a - b),
    unstableFunction: stats.unstableFunction,
  })

  return {
    wrap,
    wrapKeyed,
    beginRender: () => {
      buffer = []
    },
    commitRender,
    afterPatch,
    stats: () => [...slots].map(([name, stats]) => toStat(name, stats)),
    statFor: name => {
      const stats = slots.get(name)
      return stats === undefined ? undefined : toStat(name, stats)
    },
    originOf: element => {
      let current: Node | null = element
      while (current !== null) {
        const origin = origins.get(current)
        if (origin !== undefined) return origin
        current = current.parentNode
      }
      return undefined
    },
    reset: () => {
      slots.clear()
      origins = new WeakMap()
    },
  }
}
