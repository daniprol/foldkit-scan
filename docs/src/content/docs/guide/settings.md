---
title: Settings
description: Options for Scan.make, and widget settings saved per site.
sidebar:
  order: 8
---

## Options

Everything is optional.

```ts
const scan = Scan.make<Model, Message>({
  enabled: import.meta.env.DEV,
  container: document.getElementById('root'),
  ignoreMessages: ['Ticked'],
  overlay: true,
  devToolsPosition: 'BottomRight',
  forwardSlowWarnings: false,
  maxFrames: 120,
  performanceTrack: true,
})
```

| Option                | Default         | Does                                                                                             |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| `enabled`             | `true`          | `false` turns every helper into a pass-through. Nothing runs.                                    |
| `container`           | none            | The element you give Foldkit. Needed for flashes and DOM changes.                                |
| `ignoreMessages`      | `[]`            | Message tags to leave out of frames and stats, like a clock tick.                                |
| `overlay`             | `true`          | `false` runs [headless](../data/#headless).                                                      |
| `devToolsPosition`    | `'BottomRight'` | Where Foldkit DevTools sits. The pill takes the opposite corner.                                 |
| `forwardSlowWarnings` | `false`         | Keep Foldkit's console warning for phases over budget.                                           |
| `maxFrames`           | `120`           | How many recent frames to keep.                                                                  |
| `performanceTrack`    | `true`          | Draw [tracks](../commands/#chromes-performance-panel) in Chrome's Performance panel.             |
| `tracer`              | none            | A [Tracer you already use](../commands/#keep-your-own-tracer). `scan.resources` passes spans on. |

`ignoreMessages` matches the innermost tag, so `ClickedRow` also ignores `GotTableMessage › ClickedRow`. The **ignore** button in the Frames tab does the same for the current visit.

## Widget settings

Changes you make in the widget are saved in `localStorage` under `foldkit-scan:settings`, per site:

- corner,
- flash mode: `All`, `Problems` or `Off`,
- label mode: `HotOnly`, `OnHover` or `Always`,
- whether the pill is tucked away,
- the open tab,
- dismissed issues.

If you prefer reduced motion, flashes start at `Problems`. Blocked or broken storage falls back to the defaults.

To start over, clear the key:

```ts
localStorage.removeItem('foldkit-scan:settings')
```
