import type { CommandTracker } from '../commands'
import type { DevToolsLink } from '../devtools'
import type { FrameBuilder } from '../frames'
import type { Hotspots } from '../hotspots'
import type { IssueTracker } from '../issues'
import type { LazyTracker } from '../lazy'
import type { Corner, FlashMode, Settings } from '../settings'
import type { FrameRecord } from '../types'
import { compact, el } from './el'
import { makeFlashes } from './flashes'
import { makeInspector } from './inspect'
import {
  type PanelActions,
  type PanelData,
  renderPanel,
  renderPanelBody,
} from './panel'
import {
  type Status,
  isFrameSlow,
  renderFlashOffer,
  renderPill,
  renderTuck,
} from './pill'
import { styles } from './styles'

// The on-screen widget: a corner pill, a panel, flash outlines and inspect
// mode, all inside one shadow root.
//
// The rule for this file: quiet by default. Nothing here opens by itself,
// takes focus, or moves. Problems change one dot and add a count.

export const OVERLAY_HOST_ID = 'foldkit-scan'

/** Refresh the pill and panel at most this often. */
const REFRESH_MS = 500
/** Offer "problems only" after this much flashing in All mode. */
const FLASH_OFFER_AFTER_MS = 3 * 60 * 1000
const FLASH_OFFER_MIN_FRAMES = 150
const TOAST_MS = 1000
const DRAG_THRESHOLD_PX = 5

export type OverlayInput = Readonly<{
  frames: FrameBuilder
  issues: IssueTracker
  hotspots: Hotspots
  lazy: LazyTracker
  commands: CommandTracker
  devTools: DevToolsLink
  labelFor: (node: Node) => string
  settings: () => Settings
  updateSettings: (patch: Partial<Settings>) => void
  isSoundOn: () => boolean
  /** Plays the chime once, as a sample when sound is switched on. */
  playChime: () => void
  ignoreMessage: (tag: string) => void
}>

export type Overlay = Readonly<{
  refresh: () => void
  dispose: () => void
}>

const FLASH_CYCLE: ReadonlyArray<FlashMode> = ['All', 'Problems', 'Off']
const FLASH_TOAST: Readonly<Record<FlashMode, string>> = {
  All: 'Flashes: all',
  Problems: 'Flashes: problems only',
  Off: 'Flashes: off',
}

const nearestCorner = (x: number, y: number): Corner => {
  const top = y < window.innerHeight / 2
  const left = x < window.innerWidth / 2
  return `${top ? 'Top' : 'Bottom'}${left ? 'Left' : 'Right'}`
}

export const makeOverlay = (input: OverlayInput): Overlay => {
  const { frames, issues, hotspots, lazy, settings, updateSettings } = input

  // ---- host and shadow root ----
  const host = el('div', { attrs: { id: OVERLAY_HOST_ID } })
  const root = host.attachShadow({ mode: 'open' })
  root.append(el('style', { text: styles }))
  const canvas = el('canvas', {
    class: 'flashes',
    attrs: { 'aria-hidden': 'true' },
  })
  const chrome = el('div') // pill, panel and offer live here
  root.append(canvas, chrome)
  document.body.append(host)

  // ---- widget state ----
  let isOpen = false
  let isPaused = false
  let pausedFrames: ReadonlyArray<FrameRecord> = []
  let selectedFrameId: number | undefined
  let toast: string | undefined
  let toastTimer = 0
  let isOfferVisible = false
  let fps = 0
  let focusBeforeOpen: Element | null = null
  const startedAt = performance.now()
  let flashedFrames = 0

  const flashes = makeFlashes({
    canvas,
    mode: () => settings().flashes,
    labels: () => settings().labels,
  })

  const inspector = makeInspector(
    root,
    {
      frames: frames.recentFrames,
      labelFor: input.labelFor,
      originOf: lazy.originOf,
      statFor: lazy.statFor,
    },
    () => refresh(),
  )

  // ---- FPS: count animation frames, report twice a second ----
  let frameCount = 0
  let fpsWindowStart = performance.now()
  let fpsRequest = requestAnimationFrame(function countFrame(now) {
    frameCount += 1
    if (now - fpsWindowStart >= REFRESH_MS) {
      fps = (frameCount * 1000) / (now - fpsWindowStart)
      frameCount = 0
      fpsWindowStart = now
    }
    fpsRequest = requestAnimationFrame(countFrame)
  })

  const visibleFrames = (): ReadonlyArray<FrameRecord> =>
    isPaused ? pausedFrames : frames.recentFrames()

  const status = (): Status => {
    if (issues.issues().length > 0) return 'Issue'
    const recent = frames
      .recentFrames()
      .filter(f => !f.isReplay)
      .slice(-10)
    return recent.filter(isFrameSlow).length >= 3 ? 'Slow' : 'Ok'
  }

  const showToast = (text: string): void => {
    toast = text
    clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
      toast = undefined
      refresh()
    }, TOAST_MS)
  }

  const setFlashes = (mode: FlashMode): void => {
    updateSettings({ flashes: mode, isFlashOfferAnswered: true })
    if (mode === 'Off') flashes.clear()
    isOfferVisible = false
    showToast(FLASH_TOAST[mode])
    refresh()
  }

  const open = (moveFocus: boolean): void => {
    focusBeforeOpen = document.activeElement
    isOpen = true
    refresh()
    if (moveFocus) {
      root.querySelector<HTMLElement>('[data-key="body"]')?.focus()
    }
  }

  const close = (): void => {
    isOpen = false
    refresh()
    if (focusBeforeOpen instanceof HTMLElement && focusBeforeOpen.isConnected) {
      focusBeforeOpen.focus()
    }
  }

  const stepFrame = (direction: -1 | 1): void => {
    const list = visibleFrames()
    const index = list.findIndex(f => f.id === selectedFrameId)
    const current = index === -1 ? list.length - 1 : index
    const next =
      list[Math.min(list.length - 1, Math.max(0, current + direction))]
    if (next !== undefined) {
      selectedFrameId = next.id
      refresh()
    }
  }

  const actions: PanelActions = {
    selectTab: tab => {
      updateSettings({ tab })
      refresh()
    },
    selectFrame: id => {
      selectedFrameId = id
      refresh()
    },
    setFlashes,
    setLabels: labels => {
      updateSettings({ labels })
      refresh()
    },
    setCorner: corner => {
      updateSettings({ corner })
      refresh()
    },
    setSound: isOn => {
      updateSettings({ sound: isOn })
      // The click is the user gesture browsers need before audio can play,
      // and it shows what the chime sounds like.
      if (isOn) input.playChime()
      showToast(isOn ? 'Sound: on' : 'Sound: off')
      refresh()
    },
    toggleInspect: () =>
      inspector.isActive() ? inspector.stop() : inspector.start(),
    togglePause: () => {
      isPaused = !isPaused
      pausedFrames = frames.recentFrames()
      refresh()
    },
    close,
    ignoreMessage: tag => {
      input.ignoreMessage(tag)
      showToast(`Ignoring ${tag}`)
      refresh()
    },
    dismissIssue: id => {
      issues.dismiss(id)
      updateSettings({ dismissedIssues: [...settings().dismissedIssues, id] })
      refresh()
    },
    resetStats: () => {
      frames.clear()
      issues.reset()
      hotspots.reset()
      lazy.reset()
      input.commands.reset()
      selectedFrameId = undefined
      refresh()
    },
    openInDevTools: index => {
      input.devTools.jumpTo(index)
      showToast('Paused DevTools on this Message')
    },
  }

  // ---- pill drag: move past a few pixels to drag, otherwise it's a click ----
  const onPillPointerDown = (event: Event): void => {
    if (!(event instanceof PointerEvent) || event.button !== 0) return
    const start = { x: event.clientX, y: event.clientY }
    let isDragging = false
    const onMove = (move: PointerEvent): void => {
      if (
        Math.hypot(move.clientX - start.x, move.clientY - start.y) >
        DRAG_THRESHOLD_PX
      ) {
        isDragging = true
      }
    }
    const onUp = (up: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (isDragging) {
        updateSettings({ corner: nearestCorner(up.clientX, up.clientY) })
        refresh()
      } else if (isOpen) {
        close()
      } else {
        open(true)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // ---- rendering ----
  const panelData = (): PanelData => ({
    settings: settings(),
    frames: visibleFrames(),
    selectedFrameId,
    isPaused,
    isInspecting: inspector.isActive(),
    issues: issues.issues(),
    hotspotsByView: hotspots.byView(),
    hotspotsByMessage: hotspots.byMessage(),
    lazyStats: lazy.stats(),
    commands: input.commands.recent(),
    commandsByName: input.commands.byName(),
    isDevToolsLinked: input.devTools.isLinked(),
    isSoundOn: input.isSoundOn(),
  })

  let refreshTimer = 0
  let lastRefreshAt = 0

  /** Re-renders the pill and panel. Keeps focus and scroll where they were. */
  function refresh(): void {
    clearTimeout(refreshTimer)
    refreshTimer = 0
    lastRefreshAt = performance.now()
    const current = settings()
    const focusedKey = root.activeElement?.getAttribute('data-key')
    const scrollTop = root.querySelector('[data-key="body"]')?.scrollTop ?? 0

    const nodes: Array<Node> = []
    if (current.isTucked) {
      nodes.push(
        renderTuck(current.corner, status(), () => {
          updateSettings({ isTucked: false })
          refresh()
        }),
      )
    } else {
      nodes.push(
        renderPill(
          {
            corner: current.corner,
            isOpen,
            fps,
            frames: frames.recentFrames(),
            issueCount: issues.issues().length,
            status: status(),
            toast,
          },
          {
            pointerdown: onPillPointerDown,
            dblclick: () => {
              updateSettings({ isTucked: true })
              isOpen = false
              refresh()
            },
          },
        ),
      )
      if (isOpen) nodes.push(renderPanel(panelData(), actions))
      if (isOfferVisible && !isOpen) {
        nodes.push(
          renderFlashOffer(current.corner, switchToProblems =>
            setFlashes(switchToProblems ? 'Problems' : 'All'),
          ),
        )
      }
    }
    chrome.replaceChildren(...nodes)

    const body = root.querySelector('[data-key="body"]')
    if (body !== null) body.scrollTop = scrollTop
    if (focusedKey != null) {
      root.querySelector<HTMLElement>(`[data-key="${focusedKey}"]`)?.focus()
    }
  }

  /** Refresh soon, but not more than twice a second. */
  const scheduleRefresh = (): void => {
    if (refreshTimer !== 0) return
    const wait = Math.max(0, REFRESH_MS - (performance.now() - lastRefreshAt))
    refreshTimer = window.setTimeout(refresh, wait)
  }

  // Only the Frames tab body needs live updates while the panel is open.
  const refreshPanelBody = (): void => {
    const body = root.querySelector('[data-key="body"]')
    if (body === null || !isOpen) return
    const scrollTop = body.scrollTop
    body.replaceChildren(...compact(renderPanelBody(panelData(), actions)))
    body.scrollTop = scrollTop
  }

  const maybeOfferProblemsOnly = (frame: FrameRecord): void => {
    const current = settings()
    if (
      current.isFlashOfferAnswered ||
      current.flashes !== 'All' ||
      isOfferVisible
    )
      return
    if (frame.changes.length > 0 && !frame.isReplay) flashedFrames += 1
    if (
      performance.now() - startedAt > FLASH_OFFER_AFTER_MS &&
      flashedFrames >= FLASH_OFFER_MIN_FRAMES
    ) {
      isOfferVisible = true
    }
  }

  const stopFrames = frames.subscribe(frame => {
    flashes.showFrame(frame)
    maybeOfferProblemsOnly(frame)
    scheduleRefresh()
  })

  // The pill's FPS number needs a tick even when the app is idle.
  const idleTimer = window.setInterval(() => {
    if (!isOpen) scheduleRefresh()
    else if (!isPaused && settings().tab !== 'Settings') refreshPanelBody()
  }, REFRESH_MS * 2)

  // ---- keyboard ----
  let inspectKeyDownAt = 0

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {
      // event.code is the physical key, so this works with any layout and
      // with macOS Option, which would otherwise type a symbol.
      switch (event.code) {
        case 'KeyS':
          event.preventDefault()
          if (isOpen) close()
          else open(false)
          return
        case 'KeyF': {
          event.preventDefault()
          const index = FLASH_CYCLE.indexOf(settings().flashes)
          setFlashes(FLASH_CYCLE[(index + 1) % FLASH_CYCLE.length] ?? 'All')
          return
        }
        case 'KeyC':
          event.preventDefault()
          if (event.repeat) return
          if (inspector.isActive()) {
            inspector.stop()
          } else {
            inspectKeyDownAt = performance.now()
            inspector.start()
          }
          return
        case 'KeyP':
          event.preventDefault()
          actions.togglePause()
          return
      }
    }
    if (inspector.handleKey(event)) {
      event.preventDefault()
      return
    }
    if (event.key === 'Escape') {
      if (inspector.isActive()) inspector.stop()
      else if (isOpen) close()
      return
    }
    const isInPanel = root.activeElement !== null && isOpen
    if (
      isInPanel &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      event.preventDefault()
      stepFrame(event.key === 'ArrowLeft' ? -1 : 1)
    }
  }

  // Holding Alt Shift C is a quick look: letting go ends it.
  const onKeyUp = (event: KeyboardEvent): void => {
    const heldFor = performance.now() - inspectKeyDownAt
    if (
      event.code === 'KeyC' &&
      inspector.isActive() &&
      inspectKeyDownAt > 0 &&
      heldFor > 400
    ) {
      inspector.stop()
    }
    if (event.code === 'KeyC') inspectKeyDownAt = 0
  }

  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUp, true)

  refresh()

  return {
    refresh: scheduleRefresh,
    dispose: () => {
      stopFrames()
      cancelAnimationFrame(fpsRequest)
      clearInterval(idleTimer)
      clearTimeout(refreshTimer)
      clearTimeout(toastTimer)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      inspector.stop()
      flashes.dispose()
      host.remove()
    },
  }
}
