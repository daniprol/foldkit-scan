import { Runtime } from 'foldkit'

import { Message, Model, init, subscriptions, update, view } from './main'
import { scan } from './scan'

const application = Runtime.makeApplication({
  Model,
  init,
  update, // untouched
  view: scan.view(view), // a pass-through that remembers the result
  slow: scan.slow, // timings come from Foldkit itself
  subscriptions,
  container: document.getElementById('root'),
  devTools: {
    Message,
  },
})

Runtime.run(application)

// Remove the widget before Vite swaps in new code.
import.meta.hot?.dispose(() => scan.dispose())
