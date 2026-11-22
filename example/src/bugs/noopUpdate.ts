import { modifyFields } from 'foldkit/struct'

import type { Model } from '../main'

// PLANTED BUG: an update that always returns a new Model.
//
// `modifyFields` always builds a new object, even when the value is the
// same. A new Model object makes Foldkit run view and patch, for nothing.
//
// The presence ping arrives every 2.3 s with the same count, so this costs a
// view and a patch each time that change nothing on the page.
//
// foldkit-scan reports: "Wasted render · ReceivedPresence", and the Frames
// tab tags those frames as wasted. The fix (in main.ts) returns the same
// Model when nothing changed.

export const setOnlineCountWithBug = (
  model: Model,
  onlineCount: number,
): Model => modifyFields(model, { onlineCount: () => onlineCount })
