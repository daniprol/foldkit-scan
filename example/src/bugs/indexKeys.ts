// PLANTED BUG: row keys that include the row's position.
//
// When the filter hides a row, every row below it moves up one place, so
// its key changes. To the patcher a new key is a new row: it throws the old
// element away and builds a new one, instead of keeping it.
//
// foldkit-scan reports: "Keyed churn · main.ts#taskRow", with orange
// dashed flashes on the rebuilt rows. The fix keys rows by `task.id`.

export const rowKeyWithBug = (taskId: string, index: number): string =>
  `${index}:${taskId}`
