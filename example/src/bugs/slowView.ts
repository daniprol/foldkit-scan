// PLANTED BUG: heavy work in the view, on every render.
//
// The workload card is rebuilt on every render, and here it also stands in
// for something truly heavy, like sorting a big list or laying out a chart:
// it keeps the main thread busy for about 110 ms. Every hover, keystroke
// and clock tick pays for it.
//
// foldkit-scan shows the pill's frame time jump past 100 ms and a tall view
// bar in the Frames tab, then reports "Slow phase · view". With sound on,
// each stutter plays a chime. In Chrome's Performance panel the view track
// shows the long bar.
// The fix (in main.ts) wraps the card in `createLazy`, so it runs only when
// the tasks change.

const HEAVY_WORK_MS = 110

export const doHeavyWorkWithBug = (): void => {
  const until = performance.now() + HEAVY_WORK_MS
  while (performance.now() < until) {
    // NOTE: busy on purpose. This is the slow part.
  }
}
