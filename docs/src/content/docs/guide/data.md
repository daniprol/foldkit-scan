---
title: Data and subscribe
description: Read frames, issues and reports from code, tests and agents.
sidebar:
  order: 5
---

Everything the overlay shows is plain data you can read yourself.

## subscribe

Called with every finished [`FrameRecord`](../../api/type-aliases/framerecord/). Returns a function that stops it.

```ts
const stop = scan.subscribe(frame => {
  if (frame.isWasted) {
    console.warn(
      'Wasted render',
      frame.messages.map(m => m.tag),
    )
  }
})
```

DevTools replays come through too, with `isReplay: true`.

## Snapshots

```ts
scan.frames() // recent FrameRecords, oldest first (120 by default)
scan.issues() // current Issues
scan.lazyStats() // one LazyStat per wrapped slot
scan.report() // all of it as a serialisable Report
```

## report

`scan.report()` returns a [`Report`](../../api/type-aliases/report/): frames, hotspots, lazy stats and issues, without DOM elements, so it survives `JSON.stringify`.

It's also on `window`, for Playwright, Chrome DevTools or an AI agent driving a browser:

```ts
const json = await page.evaluate(() =>
  JSON.stringify(window.__FOLDKIT_SCAN__.report()),
)
```

Read it back with `decodeReport`. It checks the shape with Effect Schema and throws a readable error if it's wrong:

```ts
import { decodeReport } from 'foldkit-scan'

const report = decodeReport(JSON.parse(json))
expect(report.issues).toEqual([])
```

## Headless

`overlay: false` skips the widget and flashes. Timings, `subscribe` and `report` still work:

```ts
const scan = Scan.make<Model, Message>({ container, overlay: false })
```
