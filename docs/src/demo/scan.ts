import { Scan } from 'foldkit-scan'

import type { Message, Model } from '../../../example/src/main'

// The example's own scan.ts, but always on: the docs site is a production
// build, and the demo exists to be scanned.
export const scan = Scan.make<Model, Message>({
  container: document.getElementById('root'),
})
