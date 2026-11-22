import { Scan } from 'foldkit-scan'

import type { Message, Model } from '../../../example/src/main'

// The example's own scan.ts, but on in production too: the docs site is a
// production build, and the demo exists to be scanned. ?scan=off still
// turns it off, to compare.
export const scan = Scan.make<Model, Message>({
  enabled: new URLSearchParams(location.search).get('scan') !== 'off',
  container: document.getElementById('root'),
  ignoreMessages: ['Ticked'],
})
