import { Option, Schema } from 'effect'
import type { Runtime } from 'foldkit'

// Widget choices are saved per site in localStorage, so you set them once.
// What comes back from storage could be anything (an older version, a hand
// edit), so it is decoded with a Schema. Anything that does not fit falls
// back to the defaults.

export type Corner = 'BottomLeft' | 'BottomRight' | 'TopLeft' | 'TopRight'

/** `All` flashes every change. `Problems` only flashes problems. */
export type FlashMode = 'All' | 'Problems' | 'Off'

/** When flash outlines get a text label. */
export type LabelMode = 'HotOnly' | 'OnHover' | 'Always'

export type PanelTab = 'Frames' | 'Issues' | 'Hotspots' | 'Settings'

export type Settings = Readonly<{
  corner: Corner
  flashes: FlashMode
  labels: LabelMode
  isTucked: boolean
  tab: PanelTab
  dismissedIssues: ReadonlyArray<string>
  /** The one-time "switch to problems only?" offer was answered. */
  isFlashOfferAnswered: boolean
}>

// The schema mirrors the type above. `decodeSettings` returns `Settings`,
// so the compiler tells us if the two ever disagree.
const SettingsSchema = Schema.Struct({
  corner: Schema.Literals(['BottomLeft', 'BottomRight', 'TopLeft', 'TopRight']),
  flashes: Schema.Literals(['All', 'Problems', 'Off']),
  labels: Schema.Literals(['HotOnly', 'OnHover', 'Always']),
  isTucked: Schema.Boolean,
  tab: Schema.Literals(['Frames', 'Issues', 'Hotspots', 'Settings']),
  dismissedIssues: Schema.Array(Schema.String),
  isFlashOfferAnswered: Schema.Boolean,
})

const STORAGE_KEY = 'foldkit-scan:settings'

const OPPOSITE_CORNER: Readonly<Record<Runtime.DevToolsPosition, Corner>> = {
  BottomRight: 'BottomLeft',
  BottomLeft: 'BottomRight',
  TopRight: 'TopLeft',
  TopLeft: 'TopRight',
}

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches

export const defaultSettings = (
  devToolsPosition: Runtime.DevToolsPosition,
): Settings => ({
  corner: OPPOSITE_CORNER[devToolsPosition],
  flashes: prefersReducedMotion() ? 'Problems' : 'All',
  labels: 'HotOnly',
  isTucked: false,
  tab: 'Frames',
  dismissedIssues: [],
  isFlashOfferAnswered: false,
})

const decodeSettings: (input: unknown) => Option.Option<Settings> =
  Schema.decodeUnknownOption(SettingsSchema)

export const loadSettings = (
  devToolsPosition: Runtime.DevToolsPosition,
): Settings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return defaultSettings(devToolsPosition)
    }
    const decoded: unknown = JSON.parse(raw)
    return Option.getOrElse(decodeSettings(decoded), () =>
      defaultSettings(devToolsPosition),
    )
  } catch {
    // Blocked storage or broken JSON: just use the defaults.
    return defaultSettings(devToolsPosition)
  }
}

export const saveSettings = (settings: Settings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage can be full or blocked. Settings then last for this visit.
  }
}
