// foldkit-scan: see what re-renders in your Foldkit app, and why.
//
//   import { Scan } from 'foldkit-scan'
//   const scan = Scan.make<Model, Message>({ enabled: import.meta.env.DEV, container })
//
// `Scan` is a namespace, like Foldkit's own `Runtime` or `Command`.

export * as Scan from './scan'
export { decodeReport } from './report'
export type { Scan as ScanInstance, ScanOptions } from './scan'
export type {
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
