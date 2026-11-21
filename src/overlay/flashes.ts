import { shortLabel } from '../identity'
import type { FlashMode, LabelMode } from '../settings'
import type { DomChange, DomChangeKind, FrameRecord } from '../types'
import { ms } from './el'

// Flash outlines on one full-screen canvas that ignores the pointer.
//
// Colour means kind, thickness means heat:
// - violet: a patch touched this region
// - orange dashes: a problem (keyed churn)
// - grey dots: a DevTools replay, not counted anywhere
// A region that keeps flashing gets thicker and slightly tinted, never red,
// because busy is not the same as wrong.
//
// Rectangles are measured with an IntersectionObserver. It reports every
// element's position in one batch, without forcing the browser to lay out
// the page in the middle of a frame the way getBoundingClientRect would.

const COLOR = {
  render: '#8b5cf6',
  problem: '#ea580c',
  replay: '#64748b',
} as const
const LABEL_BG = 'rgba(30, 30, 46, 0.95)'
const HOLD_MS = 150
const FADE_MS = 600
const REMOVED_FADE_MS = 300
const REDUCED_MOTION_CLEAR_MS = 1000
const HEAT_WINDOW_MS = 1000
const MAX_OUTLINES = 40
const MAX_LABELS = 6
const TYPING_QUIET_MS = 1000

type Outline = {
  element: Element
  kind: DomChangeKind
  isReplay: boolean
  label: string
  /** `ClickedRow +17 · 2.1 ms`, shared by every outline of the frame. */
  frameSummary: string
  rect: DOMRect | undefined
  startedAt: number
  heat: number
}

export type Flashes = Readonly<{
  showFrame: (frame: FrameRecord) => void
  /** Last known rectangle of an element, for the inspector. */
  rectOf: (element: Element) => DOMRect | undefined
  clear: () => void
  dispose: () => void
}>

export type FlashOptions = Readonly<{
  canvas: HTMLCanvasElement
  mode: () => FlashMode
  labels: () => LabelMode
}>

const isTextField = (element: Element | null): boolean =>
  element instanceof HTMLTextAreaElement ||
  (element instanceof HTMLInputElement &&
    !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(
      element.type,
    )) ||
  (element instanceof HTMLElement && element.isContentEditable)

/** `ClickedRow +17 · 2.1 ms`. The `+17` is honest: Foldkit batches
 *  Messages, so the change belongs to the whole frame. */
export const summarizeFrame = (frame: FrameRecord): string => {
  const changed = frame.messages.filter(m => m.changedModel)
  const last = changed.at(-1) ?? frame.messages.at(-1)
  if (last === undefined) {
    return frame.isReplay ? 'replay' : ms(frame.totalMs)
  }
  const others = frame.messages.length - 1
  return `${last.leafTag}${others > 0 ? ` +${others}` : ''} · ${ms(frame.totalMs)}`
}

const heatStyle = (
  heat: number,
): Readonly<{ width: number; alpha: number; tint: number }> => {
  if (heat >= 10) return { width: 3, alpha: 1, tint: 0.18 }
  if (heat >= 5) return { width: 2, alpha: 1, tint: 0.1 }
  if (heat >= 2) return { width: 2, alpha: 1, tint: 0 }
  return { width: 1.5, alpha: 0.55, tint: 0 }
}

export const makeFlashes = (options: FlashOptions): Flashes => {
  const { canvas } = options
  const context = canvas.getContext('2d')
  const outlines = new Map<Element, Outline>()
  const ghosts: Array<Outline> = []
  const flashTimes = new WeakMap<Element, Array<number>>()
  const lastRects = new WeakMap<Element, DOMRect>()
  const reducedMotion =
    typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)')
      : undefined
  let pointer: Readonly<{ x: number; y: number }> | undefined
  let lastTypingAt = -Infinity
  let lastFlashAt = 0
  let frameRequest = 0
  let lastDrawAt = 0

  const onPointerMove = (event: PointerEvent): void => {
    pointer = { x: event.clientX, y: event.clientY }
  }
  const onInput = (event: Event): void => {
    if (event.target instanceof Element && isTextField(event.target)) {
      lastTypingAt = performance.now()
    }
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('input', onInput, { capture: true, passive: true })

  const measurer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      measurer.unobserve(entry.target)
      const outline = outlines.get(entry.target)
      lastRects.set(entry.target, entry.boundingClientRect)
      if (outline !== undefined) {
        outline.rect = entry.boundingClientRect
      }
    }
    scheduleDraw()
  })

  const resize = (): void => {
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.round(window.innerWidth * ratio)
    canvas.height = Math.round(window.innerHeight * ratio)
    context?.setTransform(ratio, 0, 0, ratio, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  const bumpHeat = (element: Element, now: number): number => {
    const times = (flashTimes.get(element) ?? []).filter(
      t => now - t < HEAT_WINDOW_MS,
    )
    times.push(now)
    flashTimes.set(element, times)
    return times.length
  }

  const showFrame = (frame: FrameRecord): void => {
    const mode = options.mode()
    if (mode === 'Off') return
    // The first render paints the whole page. Flashing it says nothing.
    if (frame.id === 0 && !frame.isReplay) return

    const now = performance.now()
    const isTyping =
      isTextField(document.activeElement) &&
      now - lastTypingAt < TYPING_QUIET_MS
    const problemsOnly = mode === 'Problems' || isTyping
    const frameSummary = summarizeFrame(frame)

    const add = (change: DomChange): void => {
      if (problemsOnly && change.kind !== 'Churn') return
      const heat = bumpHeat(change.element, now)
      const outline: Outline = {
        element: change.element,
        kind: change.kind,
        isReplay: frame.isReplay,
        label: shortLabel(change.label),
        frameSummary,
        rect: undefined,
        startedAt: now,
        heat,
      }
      if (change.kind === 'Removed') {
        // Removed nodes are gone, so draw a ghost where they last were.
        const rect = lastRects.get(change.element)
        if (rect !== undefined) ghosts.push({ ...outline, rect })
        return
      }
      outline.rect = outlines.get(change.element)?.rect
      outlines.set(change.element, outline)
      measurer.observe(change.element)
    }

    for (const change of frame.changes) add(change)
    lastFlashAt = now
    scheduleDraw()
  }

  const alphaAt = (outline: Outline, now: number): number => {
    if (reducedMotion?.matches === true) {
      return now - lastFlashAt < REDUCED_MOTION_CLEAR_MS ? 1 : 0
    }
    const fade = outline.kind === 'Removed' ? REMOVED_FADE_MS : FADE_MS
    const age =
      now - outline.startedAt - (outline.kind === 'Removed' ? 0 : HOLD_MS)
    if (age <= 0) return 1
    if (age >= fade) return 0
    const t = age / fade
    return 1 - t * (2 - t) // ease-out
  }

  const strokeColor = (outline: Outline): string =>
    outline.isReplay
      ? COLOR.replay
      : outline.kind === 'Churn'
        ? COLOR.problem
        : COLOR.render

  const drawOutline = (
    ctx: CanvasRenderingContext2D,
    outline: Outline,
    alpha: number,
  ): void => {
    const rect = outline.rect
    if (rect === undefined || rect.width === 0 || rect.height === 0) return
    const heat = heatStyle(outline.heat)
    const color = strokeColor(outline)
    const isProblem = outline.kind === 'Churn'
    ctx.globalAlpha = alpha * (isProblem || outline.isReplay ? 1 : heat.alpha)
    ctx.lineWidth = isProblem ? 2 : heat.width
    ctx.strokeStyle = color
    ctx.setLineDash(
      outline.isReplay || outline.kind === 'Removed'
        ? [2, 3]
        : isProblem
          ? [6, 4]
          : [],
    )
    const tint = isProblem ? 0.07 : outline.isReplay ? 0 : heat.tint
    if (tint > 0) {
      ctx.fillStyle = color
      ctx.globalAlpha = alpha * tint
      ctx.fillRect(rect.left, rect.top, rect.width, rect.height)
      ctx.globalAlpha = alpha
    }
    ctx.strokeRect(
      rect.left + 0.5,
      rect.top + 0.5,
      rect.width - 1,
      rect.height - 1,
    )
    const mark =
      outline.kind === 'Created' ? '+' : outline.kind === 'Moved' ? '↕' : ''
    if (mark !== '' && rect.width > 24) {
      ctx.setLineDash([])
      ctx.font = '600 11px ui-monospace, Menlo, monospace'
      ctx.fillStyle = color
      ctx.fillText(mark, rect.right - 14, rect.top + rect.height / 2 + 4)
    }
  }

  type Label = {
    text: string
    rect: DOMRect
    isProblem: boolean
    heat: number
    alpha: number
  }

  const drawLabels = (
    ctx: CanvasRenderingContext2D,
    labels: ReadonlyArray<Label>,
  ): void => {
    ctx.setLineDash([])
    ctx.font = '500 10.5px ui-monospace, Menlo, monospace'
    const placed: Array<{ x: number; y: number; w: number; h: number }> = []
    for (const label of labels) {
      const text = `${label.isProblem ? '! ' : ''}${label.text}`
      const w = ctx.measureText(text).width + 14
      const h = 18
      let x = label.rect.left - 1
      let y = label.rect.top - h - 3
      if (y < 0) y = label.rect.top + 3 // no room above: go inside
      if (x + w > window.innerWidth) x = Math.max(0, label.rect.right - w)
      const overlaps = placed.some(
        p => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y,
      )
      if (overlaps) continue // cooler labels come later and give way
      placed.push({ x, y, w, h })
      ctx.globalAlpha = label.alpha
      ctx.fillStyle = label.isProblem ? COLOR.problem : LABEL_BG
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, 4)
      ctx.fill()
      ctx.fillStyle = '#cdd6f4'
      ctx.fillText(text, x + 7, y + 12.5)
    }
  }

  const draw = (): void => {
    frameRequest = 0
    if (context === null) return
    const now = performance.now()
    lastDrawAt = now
    context.clearRect(0, 0, canvas.width, canvas.height)

    for (const [element, outline] of outlines) {
      if (alphaAt(outline, now) <= 0) outlines.delete(element)
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const ghost = ghosts[i]
      if (ghost !== undefined && alphaAt(ghost, now) <= 0) ghosts.splice(i, 1)
    }

    // Problems first, then the hottest. Cap what we draw.
    const visible = [...outlines.values(), ...ghosts]
      .sort(
        (a, b) =>
          Number(b.kind === 'Churn') - Number(a.kind === 'Churn') ||
          b.heat - a.heat,
      )
      .slice(0, MAX_OUTLINES)

    const labelMode = options.labels()
    const labelsByText = new Map<string, Label & { count: number }>()
    for (const outline of visible) {
      const alpha = alphaAt(outline, now)
      drawOutline(context, outline, alpha)
      const rect = outline.rect
      if (rect === undefined || outline.isReplay) continue
      const isProblem = outline.kind === 'Churn'
      const isHovered =
        pointer !== undefined &&
        pointer.x >= rect.left &&
        pointer.x <= rect.right &&
        pointer.y >= rect.top &&
        pointer.y <= rect.bottom
      const wantsLabel =
        isHovered ||
        labelMode === 'Always' ||
        (labelMode === 'HotOnly' && (isProblem || outline.heat >= 2))
      if (!wantsLabel) continue
      // Regions with the same label share one label with a count.
      const key = `${outline.label}|${outline.frameSummary}`
      const existing = labelsByText.get(key)
      if (existing !== undefined) {
        existing.count += 1
        if (rect.top < existing.rect.top) existing.rect = rect
      } else {
        labelsByText.set(key, {
          text: '',
          rect,
          isProblem,
          heat: outline.heat,
          alpha,
          count: 1,
        })
      }
    }
    const labels = [...labelsByText]
      .map(([key, label]) => {
        const [name] = key.split('|')
        const rate =
          label.heat >= 10
            ? ` ×${label.heat}/s`
            : label.count > 1
              ? ` ×${label.count}`
              : ''
        const summary = key.slice(key.indexOf('|') + 1)
        return { ...label, text: `${name}${rate} · ${summary}` }
      })
      .sort(
        (a, b) => Number(b.isProblem) - Number(a.isProblem) || b.heat - a.heat,
      )
      .slice(0, MAX_LABELS)
    drawLabels(context, labels)
    context.globalAlpha = 1

    if (outlines.size > 0 || ghosts.length > 0) scheduleDraw()
  }

  function scheduleDraw(): void {
    if (frameRequest !== 0) return
    if (reducedMotion?.matches === true) {
      // Redraw at most twice a second.
      const wait = Math.max(0, 500 - (performance.now() - lastDrawAt))
      frameRequest = window.setTimeout(draw, wait)
      return
    }
    frameRequest = requestAnimationFrame(draw)
  }

  const clear = (): void => {
    outlines.clear()
    ghosts.length = 0
    context?.clearRect(0, 0, canvas.width, canvas.height)
  }

  return {
    showFrame,
    rectOf: element => lastRects.get(element),
    clear,
    dispose: () => {
      measurer.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('input', onInput, { capture: true })
      window.removeEventListener('resize', resize)
      if (frameRequest !== 0) {
        cancelAnimationFrame(frameRequest)
        clearTimeout(frameRequest)
      }
      clear()
    },
  }
}
