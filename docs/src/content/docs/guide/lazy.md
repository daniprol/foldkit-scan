---
title: Lazy views
description: See hits, misses and why a lazy slot misses.
sidebar:
  order: 3
---

`createLazy()` and `createKeyedLazy()` skip a view when the function and every argument are the same references (`===`) as last time. When they aren't, the view runs again: a miss.

Misses are silent. Wrap the slot to see them.

## Wrap a slot

```ts
import { createKeyedLazy, createLazy } from 'foldkit/html'

const lazyHeader = scan.lazy('Header', createLazy())
const lazyRow = scan.keyedLazy('Row', createKeyedLazy())
```

The wrapped slot is called exactly like the original:

```ts
lazyHeader(headerView, [model.user])
lazyRow(task.id, taskRow, [task, state])
```

With `enabled: false` it returns the slot itself.

## What you see

- **Hotspots** tab: hit rate and misses per slot, and which arguments are unstable.
- **Inspect** mode: the slot and key of the element under the pointer, its hits and misses, and why it misses.
- **Issues**: an [Unstable lazy argument](../issues/#unstable-lazy-argument) issue when it repeats.
- `scan.lazyStats()` returns the same numbers as [`LazyStat`](../../api/type-aliases/lazystat/)s.

## Why it misses

On a miss, foldkit-scan compares each argument with last time. If one is a new object but equal in value (`Equal.equals`), it's **unstable**: memoization breaks for nothing.

```ts
// Misses every render: a new object each time
lazyRow(task.id, taskRow, [task, { isSelected }])

// Hits: two constant objects, made once
const SELECTED = { isSelected: true }
const NOT_SELECTED = { isSelected: false }
lazyRow(task.id, taskRow, [task, isSelected ? SELECTED : NOT_SELECTED])
```

The same goes for the view function. An arrow written inline in the view is a new function each render:

```ts
// Never hits
lazyHeader(model => h.div([], [model.title]), [model])

// Hits
const headerView = (model: Model) => h.div([], [model.title])
lazyHeader(headerView, [model])
```

If arguments really changed, the miss is fine and the card says so.
