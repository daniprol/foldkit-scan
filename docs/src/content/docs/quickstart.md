---
title: Quickstart
description: Install foldkit-scan and plug it into your Foldkit runtime.
---

## Install

```sh
pnpm add -D foldkit-scan
```

It needs `foldkit` 0.171 or later and `effect` 4.1.

## Mount

Create one instance, then hand Foldkit its `view` and `slow` hooks:

```ts
import { Runtime } from 'foldkit'
import { Scan } from 'foldkit-scan'

const container = document.getElementById('root')

const scan = Scan.make<Model, Message>({
  enabled: import.meta.env.DEV,
  container,
})

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view: scan.view(view),
  slow: scan.slow,
  container,
})

Runtime.run(application)
```

That's it. Open the panel with the pill or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>.

- `scan.view(view)` returns your result untouched. It remembers it so flashes can name the view function.
- `scan.slow` gets the timings. Your `update` is never wrapped.
- `container` is the element you give Foldkit. Without it, there are no flashes.

## Name your views

Flash labels like `rows.ts#taskRow` come from Foldkit's Vite plugin. Apps made with `create-foldkit-app` already have it:

```ts
// vite.config.ts
import { foldkit } from '@foldkit/vite-plugin'

export default defineConfig({ plugins: [foldkit()] })
```

Without it, labels fall back to `tag#id.class`.

## Hot reload

Remove the widget before Vite swaps in new code:

```ts
import.meta.hot?.dispose(() => scan.dispose())
```

## Commands

To see Commands in the panel, pass `resources: scan.resources` too. See [Commands and tracing](../guide/commands/).

## Lazy views

To see hits and misses for a lazy view, wrap its slot. See [Lazy views](../guide/lazy/).

```ts
import { createKeyedLazy } from 'foldkit/html'

const rowSlot = createKeyedLazy()
const lazyRow = scan.keyedLazy('Row', rowSlot)
```
