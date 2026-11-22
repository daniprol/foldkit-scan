import { makeDisabled } from './disabled'
import type { Scan, ScanOptions } from './scan'

// `Scan` for the production build: the same API as ./scan.ts, but `make`
// always returns the pass-through version, so no overlay, timing or DOM
// code ends up in the bundle.

export type { Scan, ScanOptions } from './scan'

export const make = <Model, Message>(
  _options: ScanOptions = {},
): Scan<Model, Message> => makeDisabled()
