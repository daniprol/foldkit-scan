import { Layer, Tracer } from 'effect'
import type { Runtime } from 'foldkit'
import { DEVTOOLS_HOST_ID } from 'foldkit/devtools-host'
import type { Document, HtmlBuilder } from 'foldkit/html'

import { makeCommandTracker } from './commands'
import { makeDevToolsLink } from './devtools'
import { type DomWatcher, makeDomWatcher } from './dom'
import { type FrameListener, makeFrameBuilder } from './frames'
import { makeHotspots } from './hotspots'
import { makeIdentities } from './identity'
import { makeIssueTracker } from './issues'
import { type KeyedLazySlot, type LazySlot, makeLazyTracker } from './lazy'
import { OVERLAY_HOST_ID, type Overlay, makeOverlay } from './overlay/overlay'
import { makePerformanceTrack } from './performanceTrack'
import { type Settings, loadSettings, saveSettings } from './settings'
import { makeSlowConfig } from './slow'
import { STUTTER_MS, makeChime } from './sound'
import type {
  CommandRecord,
  FrameRecord,
  Issue,
  LazyStat,
  Report,
} from './types'

export type ScanOptions = Readonly<{
  /** Turn foldkit-scan on. When `false`, every helper is a plain
   *  pass-through and nothing runs. Usually `import.meta.env.DEV`.
   *  Defaults to `true`. */
  enabled?: boolean
  /** The element you pass to `makeApplication` as `container`. Needed to
   *  see which parts of the page change. */
  container?: HTMLElement | null
  /** Message tags to leave out of frames and stats, like a clock tick.
   *  Same idea as DevTools' `excludeFromHistory`. */
  ignoreMessages?: ReadonlyArray<string>
  /** Show the on-screen widget and flashes. `false` runs headless: you still
   *  get `subscribe` and `report`. Defaults to `true`. */
  overlay?: boolean
  /** Where Foldkit DevTools sits. The widget takes the opposite corner.
   *  Defaults to `'BottomRight'`, like DevTools. */
  devToolsPosition?: Runtime.DevToolsPosition
  /** foldkit-scan replaces Foldkit's slow-phase warnings. Set this to keep
   *  Foldkit's console warning when a phase goes over its real budget. */
  forwardSlowWarnings?: boolean
  /** How many recent frames to keep. Defaults to 120. */
  maxFrames?: number
  /** Draw update, view, patch and Commands on their own tracks in Chrome's
   *  Performance panel. Defaults to `true`. */
  performanceTrack?: boolean
  /** A Tracer you already use, for example to send spans to OpenTelemetry.
   *  `scan.resources` passes every span on to it. */
  tracer?: Tracer.Tracer
  /** Play a short chime when a new issue appears or a frame stutters (over
   *  100 ms). Sets the starting value of the panel's sound toggle, which
   *  wins once you use it. Defaults to `false`. */
  sound?: boolean
}>

type View<Model, Message> = (model: Model, h: HtmlBuilder<Message>) => Document

/** What `Scan.make` returns. Plug `slow` and `view` into your runtime config. */
export type Scan<Model, Message> = Readonly<{
  /** Pass as `slow` to `Runtime.makeApplication`. */
  slow: Runtime.SlowConfig<Model, Message>
  /** Wrap your view: `view: scan.view(view)`. It returns your result
   *  untouched and remembers it, so flashes can name the view function. */
  view: (view: View<Model, Message>) => View<Model, Message>
  /** Wrap a `createLazy()` slot to see its hit rate:
   *  `const lazyHeader = scan.lazy('Header', createLazy())`. */
  lazy: (name: string, slot: LazySlot) => LazySlot
  /** Wrap a `createKeyedLazy()` slot, for lists. */
  keyedLazy: (name: string, slot: KeyedLazySlot) => KeyedLazySlot
  /** Pass as `resources` to see Commands: `resources: scan.resources`. If
   *  you already have resources, merge them:
   *  `Layer.merge(AppResources, scan.resources)`. */
  resources: Layer.Layer<never>
  /** Recent Commands, oldest first. Empty without `scan.resources`. */
  commands: () => ReadonlyArray<CommandRecord>
  /** Called with every finished frame. Returns a function that stops it. */
  subscribe: (listener: FrameListener) => () => void
  /** The most recent frames, oldest first. */
  frames: () => ReadonlyArray<FrameRecord>
  issues: () => ReadonlyArray<Issue>
  lazyStats: () => ReadonlyArray<LazyStat>
  /** A plain, serialisable snapshot. See `Report`. */
  report: () => Report
  /** Removes the widget and observers. Call it on hot reload. */
  dispose: () => void
}>

const isDevToolsNode = (node: Node): boolean => {
  const element = node instanceof Element ? node : node.parentElement
  return element?.closest(`#${DEVTOOLS_HOST_ID}`) != null
}

const isOverlayNode = (node: Node): boolean => {
  const element = node instanceof Element ? node : node.parentElement
  return element?.closest(`#${OVERLAY_HOST_ID}`) != null
}

const makeDisabled = <Model, Message>(): Scan<Model, Message> => ({
  // An empty object means "Foldkit's defaults", exactly as if you had not
  // passed `slow` at all.
  slow: {},
  view: view => view,
  lazy: (_name, slot) => slot,
  keyedLazy: (_name, slot) => slot,
  resources: Layer.empty,
  commands: () => [],
  subscribe: () => () => {},
  frames: () => [],
  issues: () => [],
  lazyStats: () => [],
  report: () => ({
    version: 1,
    frames: [],
    hotspots: { byView: [], byMessage: [] },
    lazy: [],
    issues: [],
    commands: [],
  }),
  dispose: () => {},
})

/**
 * Sets up foldkit-scan for one app.
 *
 * ```ts
 * const scan = Scan.make<Model, Message>({ enabled: import.meta.env.DEV, container })
 * const app = Runtime.makeApplication({ ..., view: scan.view(view), slow: scan.slow })
 * ```
 */
export const make = <Model, Message>(
  options: ScanOptions = {},
): Scan<Model, Message> => {
  if (options.enabled === false || typeof window === 'undefined') {
    return makeDisabled()
  }

  const devToolsPosition = options.devToolsPosition ?? 'BottomRight'
  let settings: Settings = loadSettings(devToolsPosition)

  const identities = makeIdentities()
  const hotspots = makeHotspots()
  const isSoundOn = (): boolean => settings.sound ?? options.sound ?? false
  const chime = makeChime(isSoundOn)
  const issues = makeIssueTracker({
    dismissed: settings.dismissedIssues,
    onChange: () => overlay?.refresh(),
    onNew: chime.notify,
  })
  const lazy = makeLazyTracker(issues.observeUnstableLazy)
  const commands = makeCommandTracker()
  const devTools = makeDevToolsLink()
  const track =
    options.performanceTrack === false ? undefined : makePerformanceTrack()

  // The latest view result, kept by `scan.view`.
  let lastBody: Document['body'] | undefined

  const appRoot = (): Node | undefined => lastBody?.elm ?? undefined

  const isIgnored = (node: Node): boolean => {
    if (isDevToolsNode(node) || isOverlayNode(node)) {
      return true
    }
    const root = appRoot()
    return root !== undefined && !root.contains(node)
  }

  let domWatcher: DomWatcher | undefined

  const frames = makeFrameBuilder({
    maxFrames: options.maxFrames ?? 120,
    takeDomChanges: () => domWatcher?.takeChanges() ?? [],
    historyIndex: devTools.latestIndex,
  })

  if (options.container != null) {
    domWatcher = makeDomWatcher({
      container: options.container,
      isIgnored,
      labelFor: identities.labelFor,
      isFrameWaiting: frames.isClosing,
      onUnclaimedChanges: frames.addReplay,
    })
  }

  // Messages the user chose to ignore from the widget, for this visit.
  const ignoredAtRuntime = new Set<string>()

  const slow = makeSlowConfig<Model, Message>({
    ignoreMessages: options.ignoreMessages ?? [],
    forwardSlowWarnings: options.forwardSlowWarnings ?? false,
    handlers: {
      onMessage: message => {
        if (!ignoredAtRuntime.has(message.leafTag)) {
          frames.addMessage(message)
          track?.update(message.tag, message.updateMs, message.isEqualInValue)
        }
      },
      onView: durationMs => {
        lazy.commitRender()
        frames.setViewMs(durationMs)
        track?.view(durationMs)
      },
      onPatch: durationMs => {
        // After the patch every vnode knows its DOM node, so this is the
        // moment to learn the names of the elements.
        identities.index(lastBody)
        lazy.afterPatch()
        track?.patch(durationMs)
        frames.closeFrame(durationMs)
      },
    },
  })

  const updateSettings = (patch: Partial<Settings>): void => {
    settings = { ...settings, ...patch }
    saveSettings(settings)
  }

  const overlay: Overlay | undefined =
    options.overlay === false
      ? undefined
      : makeOverlay({
          frames,
          issues,
          hotspots,
          lazy,
          commands,
          devTools,
          labelFor: identities.labelFor,
          settings: () => settings,
          updateSettings,
          isSoundOn,
          playChime: chime.play,
          ignoreMessage: tag => {
            ignoredAtRuntime.add(tag)
          },
        })

  const stopObserving = frames.subscribe(frame => {
    hotspots.observeFrame(frame)
    issues.observeFrame(frame)
    // Skip the first render and replays: only a Message the user caused
    // counts as a stutter.
    if (frame.totalMs > STUTTER_MS && frame.messages.length > 0) {
      chime.notify()
    }
  })
  const stopTracking = commands.subscribe(command => {
    track?.command(command)
  })

  const report = (): Report => ({
    version: 1,
    frames: frames.recentFrames().map(frame => ({
      id: frame.id,
      messages: frame.messages.map(({ tag, updateMs, changedModel }) => ({
        tag,
        updateMs,
        changedModel,
      })),
      updateMs: frame.updateMs,
      viewMs: frame.viewMs,
      patchMs: frame.patchMs,
      totalMs: frame.totalMs,
      changes: frame.changes.map(({ kind, label }) => ({ kind, label })),
      isWasted: frame.isWasted,
      isReplay: frame.isReplay,
      ...(frame.historyIndex === undefined
        ? {}
        : { historyIndex: frame.historyIndex }),
    })),
    hotspots: { byView: hotspots.byView(), byMessage: hotspots.byMessage() },
    lazy: lazy.stats(),
    issues: issues
      .issues()
      .map(({ lastSeenAt: _lastSeenAt, ...issue }) => issue),
    commands: commands.recent().map(command => ({
      name: command.name,
      startedAt: command.startedAt,
      outcome: command.outcome,
      // JSON has no `undefined`, so leave the keys out instead.
      ...(command.durationMs === undefined
        ? {}
        : { durationMs: command.durationMs }),
      ...(command.resultTag === undefined
        ? {}
        : { resultTag: command.resultTag }),
    })),
  })

  // Browser-automation agents (Playwright, Chrome) can read this.
  const globalHandle = { report }
  Reflect.set(window, '__FOLDKIT_SCAN__', globalHandle)

  return {
    slow,
    view: view => (model, h) => {
      lazy.beginRender()
      const document = view(model, h)
      lastBody = document.body
      return document
    },
    lazy: lazy.wrap,
    keyedLazy: lazy.wrapKeyed,
    // Foldkit runs each Command in a span. Providing our Tracer through
    // `resources` is how we see them.
    resources: Layer.succeed(Tracer.Tracer)(commands.tracer(options.tracer)),
    commands: commands.recent,
    subscribe: frames.subscribe,
    frames: frames.recentFrames,
    issues: issues.issues,
    lazyStats: lazy.stats,
    report,
    dispose: () => {
      stopObserving()
      chime.dispose()
      stopTracking()
      domWatcher?.dispose()
      overlay?.dispose()
      if (Reflect.get(window, '__FOLDKIT_SCAN__') === globalHandle) {
        Reflect.deleteProperty(window, '__FOLDKIT_SCAN__')
      }
    },
  }
}
