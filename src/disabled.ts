import { Layer } from 'effect'

import type { Scan } from './scan'

// What `Scan.make` returns when foldkit-scan is off, and all that the
// production build contains: every helper hands back what it was given.

export const makeDisabled = <Model, Message>(): Scan<Model, Message> => ({
  // An empty object means "Foldkit's defaults", exactly as if you had not
  // passed `slow` at all.
  slow: {},
  view: view => view,
  lazy: (_name, slot) => slot,
  keyedLazy: (_name, slot) => slot,
  resources: Layer.empty,
  commands: () => [],
  subscribe: () => () => {},
  frames: () => [],
  issues: () => [],
  lazyStats: () => [],
  report: () => ({
    version: 1,
    frames: [],
    hotspots: { byView: [], byMessage: [] },
    lazy: [],
    issues: [],
    commands: [],
  }),
  dispose: () => {},
})
