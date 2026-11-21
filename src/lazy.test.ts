import type { Html } from 'foldkit/html'
import { describe, expect, test } from 'vitest'

import { type KeyedLazySlot, makeLazyTracker } from './lazy'

// A stand-in for Foldkit's keyed lazy slot: it caches by key and returns
// the cached vnode while the function and arguments stay the same.
const fakeKeyedSlot = (): KeyedLazySlot => {
  const cache = new Map<
    PropertyKey,
    { fn: unknown; args: ReadonlyArray<unknown>; vnode: Html }
  >()
  return (key, fn, args) => {
    const hit = cache.get(key)
    if (
      hit !== undefined &&
      hit.fn === fn &&
      hit.args.length === args.length &&
      hit.args.every((arg, index) => arg === args[index])
    ) {
      return hit.vnode
    }
    // Any fresh object stands in for a new vnode.
    // oxlint-disable-next-line typescript/consistent-type-assertions
    const vnode = { key } as unknown as Html
    cache.set(key, { fn, args, vnode })
    return vnode
  }
}

const row = (_value: unknown, _state?: unknown): Html => null

describe('lazy tracker', () => {
  test('counts hits and misses and finds an unstable argument', () => {
    const tracker = makeLazyTracker(() => {})
    const lazyRow = tracker.wrapKeyed('Row', fakeKeyedSlot())
    const stable = { id: 1 }
    for (let render = 0; render < 3; render++) {
      tracker.beginRender()
      lazyRow('a', row, [stable])
      lazyRow('b', row, [stable, { isSelected: false }])
      tracker.commitRender()
    }
    expect(tracker.statFor('Row')).toEqual({
      name: 'Row',
      hits: 2,
      misses: 4,
      unstableArgs: [1],
      unstableFunction: false,
    })
  })

  test('reports an unstable slot once per render, however long the list', () => {
    const reports: Array<string> = []
    const tracker = makeLazyTracker(name => reports.push(name))
    const lazyRow = tracker.wrapKeyed('Row', fakeKeyedSlot())
    for (let render = 0; render < 2; render++) {
      tracker.beginRender()
      for (let index = 0; index < 1000; index++) {
        lazyRow(index, row, [{ isSelected: false }])
      }
      tracker.commitRender()
    }
    // The first render has nothing to compare with.
    expect(reports).toEqual(['Row'])
  })
})
