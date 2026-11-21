// PLANTED BUG: an unstable lazy argument.
//
// This builds a new `{ isSelected }` object on every render. It is equal in
// value to last time, but not the same reference, so the row's lazy slot
// misses on every frame and every row view runs again.
//
// foldkit-scan reports: "Unstable lazy argument · TaskRow · arg 2".
// The fix (in main.ts) reuses two constant objects instead.

export type RowState = Readonly<{ isSelected: boolean }>

export const rowStateWithBug = (isSelected: boolean): RowState => ({
  isSelected,
})
