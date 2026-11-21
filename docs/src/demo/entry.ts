import { Runtime } from 'foldkit'

import {
  Model,
  init,
  subscriptions,
  update,
  view,
} from '../../../example/src/main'
import { scan } from './scan'

// The example task list from the repo, mounted as is. Its scan.ts is swapped
// for ./scan.ts by astro.config.mjs.
const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view: scan.view(view),
  slow: scan.slow,
  resources: scan.resources,
  subscriptions,
  container: document.getElementById('root'),
})

Runtime.run(application)
