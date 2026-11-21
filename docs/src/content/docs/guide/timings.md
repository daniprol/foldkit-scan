---
title: How timings work
description: foldkit-scan reads Foldkit's own slow hook. It never wraps update.
sidebar:
  order: 2
---

foldkit-scan doesn't time anything itself. Foldkit already measures every `update`, `view` and `patch` for its slow-phase warnings. `scan.slow` taps into that.

## The trick

Foldkit's `slow` option calls `onSlow` when a phase takes longer than its budget:

```ts
slow: {
  thresholdOverrides: { Update: 4, View: 16, Patch: 8 }, // Foldkit's defaults
  onSlow: context => { /* context.durationMs, context.message, ... */ },
}
```

It fires when `durationMs > thresholdMs`. So a budget of `-1` fires every time, even for a 0 ms phase. That's what `scan.slow` is:

```ts
{
  show: 'Always',
  thresholdOverrides: { Update: -1, View: -1, Patch: -1 },
  onSlow, // builds frames from every measurement
}
```

Your `update` and `view` are never wrapped. The numbers are Foldkit's, not ours.

## What a frame is

Foldkit runs `update` once per Message, right away. If the Model changed, it renders once on the next animation frame, however many Messages came in. So one frame is:

```
update × N  →  view  →  patch  →  DOM changes
```

Each [`FrameRecord`](../../api/type-aliases/framerecord/) has every Message with its `updateMs`, plus `viewMs`, `patchMs` and `totalMs`.

## Wasted renders

For each Message, `onSlow` gets the previous and next Model.

- Same object: no render. Good.
- New object, equal in value (Effect's `Equal.equals`): the render was for nothing. That's a **wasted render**.
- New object, but the patch changed nothing on the page: also wasted.

The usual cause is `modifyFields`, which always returns a new object:

```ts
// Renders every 2 s for nothing
ReceivedPresence: ({ onlineCount }) => ({
  model: modifyFields(model, { onlineCount: () => onlineCount }),
}),

// Fixed: same Model when nothing changed
ReceivedPresence: ({ onlineCount }) =>
  onlineCount === model.onlineCount
    ? { model }
    : { model: modifyFields(model, { onlineCount: () => onlineCount }) },
```

## Slow phases

A phase is slow when it goes over Foldkit's budget: update 4 ms, view 16 ms, patch 8 ms. One slow frame is noise. Three in the last ten raise a [Slow phase](../issues/#slow-phase) issue.

## Foldkit's own warnings

`scan.slow` replaces Foldkit's console warnings. To keep them for phases over the real budget:

```ts
Scan.make({ forwardSlowWarnings: true })
```

## DevTools replays

DevTools time travel replays your view with timings off, so replays never reach `onSlow`. foldkit-scan still sees the DOM change, draws it grey and dotted, and leaves it out of every statistic.
