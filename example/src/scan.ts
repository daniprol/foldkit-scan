import { Scan } from 'foldkit-scan'

import type { Message, Model } from './main'

// One foldkit-scan instance for the whole app. It lives in its own module
// because both entry.ts (the runtime config) and main.ts (the lazy slots)
// use it.
export const scan = Scan.make<Model, Message>({
  // Off in production builds, in tests, and with ?scan=off in the URL
  // (handy to compare how fast the app is without it).
  enabled:
    import.meta.env.DEV &&
    import.meta.env.MODE !== 'test' &&
    new URLSearchParams(location.search).get('scan') !== 'off',
  container: document.getElementById('root'),
  // The header clock ticks every second. It still flashes, but stays out of
  // the Frames tab and the stats.
  ignoreMessages: ['Ticked'],
})
