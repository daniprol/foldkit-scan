---
title: Commands and tracing
description: See every Command, and draw frames in Chrome's Performance panel.
sidebar:
  order: 5
---

## Commands

Pass `scan.resources` to `makeApplication`:

```ts
const application = Runtime.makeApplication({
  // ...
  resources: scan.resources,
})
```

Already have resources? Merge them:

```ts
resources: Layer.merge(AppResources, scan.resources)
```

Foldkit runs each Command inside a span named after it. `scan.resources` carries a Tracer that sees those spans, so the panel can show:

- a **Commands** lane on the Frames timeline,
- each frame's Commands, how long they took, and the Message they returned,
- the **slowest Commands** in Hotspots.

Read them from code with `scan.commands()`. Each one is a [`CommandRecord`](../../api/type-aliases/commandrecord/), oldest first, and `scan.report()` includes them too.

```ts
scan.commands()
// [{ name: 'FetchWeather', durationMs: 212, outcome: 'Success', resultTag: 'GotWeather', ... }]
```

### Keep your own Tracer

If you already send spans somewhere, like OpenTelemetry, pass that Tracer as `tracer`. foldkit-scan hands every span on to it:

```ts
const scan = Scan.make<Model, Message>({ container, tracer: myTracer })
```

## Chrome's Performance panel

Record a profile in Chrome DevTools. update, view, patch and Commands show up on their own tracks, grouped under **foldkit-scan**, next to the browser's own work.

It's on by default and costs one `performance.measure` per phase. Each measure is cleared right away, so nothing piles up. Turn it off with:

```ts
Scan.make<Model, Message>({ container, performanceTrack: false })
```

Other browsers keep plain measures and skip the tracks.
