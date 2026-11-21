import { modifyFields } from 'foldkit/struct'

import type { Model } from '../main'

// PLANTED BUG: an update that always returns a new Model.
//
// `modifyFields` always builds a new object, even when the value is the
// same. A new Model object makes Foldkit run view and patch, for nothing.
//
// foldkit-scan reports: "Wasted render · ReceivedPresence". The fix (in main.ts)
// returns the same Model when nothing changed.

export const setOnlineCountWithBug = (
  model: Model,
  onlineCount: number,
): Model => modifyFields(model, { onlineCount: () => onlineCount })
