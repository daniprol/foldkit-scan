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
  sound: false,
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
| `sound`               | `false`         | Start with the [sound](#sound) on. The panel's toggle wins once you use it.                      |

`ignoreMessages` matches the innermost tag, so `ClickedRow` also ignores `GotTableMessage › ClickedRow`. The **ignore** button in the Frames tab does the same for the current visit.

## Widget settings

Changes you make in the widget are saved in `localStorage` under `foldkit-scan:settings`, per site:

- corner,
- flash mode: `All`, `Problems` or `Off`,
- label mode: `HotOnly`, `OnHover` or `Always`,
- whether the pill is tucked away,
- the open tab,
- dismissed issues,
- sound on or off.

If you prefer reduced motion, flashes start at `Problems`. Blocked or broken storage falls back to the defaults.

## Sound

With sound on, foldkit-scan plays a short, soft chime when a new [issue](../issues/) appears or when a frame takes over 100 ms, which you feel as a stutter. You can keep clicking through your app and hear when something goes wrong, without watching the panel.

Turn it on with the **♪** button in the panel header, or **Sound** in the Settings tab. Switching it on plays the chime once so you know what to listen for. It plays at most once a second, never on the first render, and nothing audio-related is created while it is off. The tone is made with the Web Audio API, so there is no sound file.

To have it on from the start, pass `sound: true`.

## Starting over

To start over, clear the key:

```ts
localStorage.removeItem('foldkit-scan:settings')
```
