import { Scan } from 'foldkit-scan'

import type { Message, Model } from './main'

// One foldkit-scan instance for the whole app. It lives in its own module
// because both entry.ts (the runtime config) and main.ts (the lazy slots)
// use it.
export const scan = Scan.make<Model, Message>({
  // Off in production builds and in tests.
  enabled: import.meta.env.DEV && import.meta.env.MODE !== 'test',
  container: document.getElementById('root'),
})
