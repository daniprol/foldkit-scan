import { Effect, SubscriptionRef } from 'effect'
import { type DevToolsStore, latestEntryIndex } from 'foldkit/devtools-host'

// Experimental: a link to Foldkit DevTools' history.
//
// DevTools has no public API for other tools yet. When a Foldkit app
// starts, the runtime hands its history store to the DevTools overlay that
// the Foldkit Vite plugin registered. With `experimentalDevToolsLink`, the
// foldkit-scan Vite plugin registers a small wrapper around that overlay
// which keeps a reference to the store under the key below, then mounts
// the real overlay unchanged. See src/node/vite.ts.
//
// With the store we can stamp each frame with the history entry of its last
// Message, and jump DevTools to that entry from the panel. If the key is
// empty, everything here quietly does nothing.

/** Shared with the Vite plugin's client code, which sets it. */
export const DEVTOOLS_STORE_KEY: unique symbol = Symbol.for(
  'foldkit-scan/devtools-store',
)

export type DevToolsLink = Readonly<{
  isLinked: () => boolean
  /** The index of the newest DevTools history entry. */
  latestIndex: () => number | undefined
  /** Shows that entry in DevTools. In time-travel mode this pauses the
   *  page on it, exactly like clicking the row in DevTools. */
  jumpTo: (index: number) => void
}>

const isDevToolsStore = (value: unknown): value is DevToolsStore =>
  typeof value === 'object' &&
  value !== null &&
  'stateRef' in value &&
  'jumpTo' in value

const currentStore = (): DevToolsStore | undefined => {
  const value: unknown = Reflect.get(globalThis, DEVTOOLS_STORE_KEY)
  return isDevToolsStore(value) ? value : undefined
}

export const makeDevToolsLink = (): DevToolsLink => ({
  isLinked: () => currentStore() !== undefined,
  latestIndex: () => {
    const store = currentStore()
    if (store === undefined) return undefined
    // Reading a SubscriptionRef is an Effect. It is synchronous, so
    // `runSync` gives us the value right away.
    return latestEntryIndex(Effect.runSync(SubscriptionRef.get(store.stateRef)))
  },
  jumpTo: index => {
    const store = currentStore()
    if (store !== undefined) {
      Effect.runFork(store.jumpTo(index))
    }
  },
})
