// foldkit-scan's production build: the same exports as index.ts, but
// `Scan.make` always returns a pass-through, so nothing runs and almost
// nothing is bundled.
//
// Bundlers that know the `production` export condition (Vite, webpack,
// Rspack) pick this file on their own for production builds. Others can
// import 'foldkit-scan/noop' directly.

export * as Scan from './noopScan'
export { decodeReport } from './report'
export type { Scan as ScanInstance, ScanOptions } from './scan'
export type {
  CommandOutcome,
  CommandRecord,
  DomChange,
  DomChangeKind,
  FrameRecord,
  Hotspot,
  Issue,
  IssueKind,
  LazyStat,
  MessageRecord,
  Report,
} from './types'
