---
title: Issues
description: The four problems foldkit-scan looks for, and how to fix them.
sidebar:
  order: 4
---

A one-off isn't a problem: a first render or a hot reload can be slow once. An issue is raised only when it repeats, at least twice within 5 seconds. Each one shows up in the Issues tab with a hint, turns the pill's dot orange, and can be dismissed for good.

## Wasted render

`update` returned a new Model, but it was equal in value, or nothing on the page changed. When nothing changed, return the same Model: `{ model }`. See [Wasted renders](../timings/#wasted-renders).

## Unstable lazy argument

A lazy slot's argument is a new object each render, equal in value, so the slot always misses. Or its view function is a new function each time. Pass objects stored in the Model, or define the function once. See [Lazy views](../lazy/).

## Keyed churn

A keyed row was thrown away and rebuilt instead of reused. Flashed as dashed orange. The usual cause is a key built from the row's position:

```ts
// Filtering shifts every key below the hidden row
h.keyed('div')(`${index}:${task.id}`, ...)

// Stable
h.keyed('div')(task.id, ...)
```

## Slow phase

`update`, `view` or `patch` went over Foldkit's budget (4, 16 and 8 ms) in 3 of the last 10 frames.

- Slow **update**: keep it to state changes. Derive display data in memoized views.
- Slow **view**: wrap stable parts in `createLazy` or `createKeyedLazy`.
- Slow **patch**: key lists by stable ids, split large views, memoize stable subtrees.
