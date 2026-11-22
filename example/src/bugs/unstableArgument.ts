// PLANTED BUG: an unstable lazy argument.
//
// This builds a new `{ isSelected, isHovered }` object on every render. It
// is equal in value to last time, but not the same reference, so every
// row's lazy slot misses and every row view runs again, even though only
// one row changed.
//
// foldkit-scan reports: "Unstable lazy argument · TaskRow · arg 2". The
// Hotspots tab shows TaskRow's hit rate fall to 0%. The page looks the same,
// because the patch finds nothing to change: the cost is hidden work.
// The fix (in main.ts) reuses four constant objects instead.

export type RowState = Readonly<{ isSelected: boolean; isHovered: boolean }>

export const rowStateWithBug = (
  isSelected: boolean,
  isHovered: boolean,
): RowState => ({ isSelected, isHovered })
