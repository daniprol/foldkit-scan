---
title: The overlay
description: The corner pill, flashes, the panel and inspect mode.
sidebar:
  order: 1
---

Everything lives in one shadow root, so your styles and the overlay's never mix. Nothing opens by itself or takes focus.

## The pill

A small pill sits in the corner opposite Foldkit DevTools. It shows:

- a status dot: green when all is well, amber when 3 of the last 10 frames were slow, orange when there are issues,
- FPS and the last frame's time,
- a sparkline of the last 32 frames (a full bar is 16 ms),
- `3→1` when several Messages were batched into one render,
- the issue count.

Click it to open the panel. Drag it to another corner. Double-click to tuck it into a tab on the screen edge.

## Flashes

Every element a patch touched gets an outline that fades out.

| Outline       | Meaning                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| Violet        | A patch changed it. `+` marks a new element, `↕` a moved one.              |
| Dashed orange | A problem: a keyed row thrown away and rebuilt.                            |
| Grey dotted   | A DevTools replay, or a change from outside Foldkit. Not counted anywhere. |

A region that keeps flashing gets a thicker, slightly tinted outline. Busy is not wrong, so it never turns red.

A label reads:

```
main.ts#taskRow · ClickedTask +2 · 1.4 ms
```

The view function, the Message that changed the Model, how many more Messages shared the frame, and the frame time. By default (**Hot only**) labels show for problems, for regions that flash again within a second, and under the pointer. Settings can switch to **On hover** or **Always**.

The first render is never flashed. While you type in a text field, only problems flash.

Cycle flash modes with <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>: **All**, **Problems** only, **Off**. If you leave All on for a few minutes of heavy flashing, the pill asks once whether to switch to Problems.

## The panel

<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> opens and closes it. Four tabs:

- **Frames**: a timeline of recent frames against the 16.7 ms line. Pick one to see its Messages (did each change the Model? how long did `update` take?) and its DOM changes. Wasted frames and DevTools replays are tagged. <kbd>←</kbd> <kbd>→</kbd> step through frames, <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> pauses. Each Message has an **ignore** button for noisy ticks.
- **Issues**: things worth fixing, each with a hint. See [Issues](../issues/).
- **Hotspots**: the most patched views and busiest Messages over the last 5 s, plus hit rates for [lazy slots](../lazy/).
- **Settings**: corner, flash mode, label mode, reset stats, and the keyboard shortcuts.

## Inspect mode

Press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>, or the ⌖ button, and point at anything. A card tells you:

- which view function rendered it,
- how many times it was patched in the last 5 s,
- its lazy slot and key, hits and misses, and why it misses,
- the last frame that touched it.

<kbd>↑</kbd> <kbd>↓</kbd> walk to the parent or child, <kbd>←</kbd> <kbd>→</kbd> to siblings. Click or <kbd>Enter</kbd> pins the card. <kbd>Esc</kbd> leaves. Hold <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> for a quick look: letting go ends it.

While inspecting, clicks go to the inspector, not your app.

## Shortcuts

| Keys                                         | Does                            |
| -------------------------------------------- | ------------------------------- |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> | Open or close the panel         |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> | Cycle flashes                   |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> | Inspect (hold for a quick look) |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> | Pause the timeline              |
| <kbd>←</kbd> <kbd>→</kbd>                    | Previous or next frame          |
| <kbd>Esc</kbd>                               | Close, or leave inspect         |

They use the physical key, so they work on any layout and with macOS <kbd>Option</kbd>.
