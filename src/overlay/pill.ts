import type { Corner } from '../settings'
import { PHASE_BUDGETS_MS } from '../slow'
import type { FrameRecord } from '../types'
import { el, ms } from './el'

// The corner pill: a status dot, FPS, the last frame time, a sparkline of
// recent frames, the batch ratio and the issue count. It is the only thing
// always on screen, so it says little and changes only one dot when
// something needs attention.

export type Status = 'Ok' | 'Slow' | 'Issue'

export type PillState = Readonly<{
  corner: Corner
  isOpen: boolean
  fps: number
  frames: ReadonlyArray<FrameRecord>
  issueCount: number
  status: Status
  /** A short confirmation, like "Flashes: problems only". */
  toast: string | undefined
}>

export const isFrameSlow = (frame: FrameRecord): boolean =>
  frame.viewMs > PHASE_BUDGETS_MS.View ||
  frame.patchMs > PHASE_BUDGETS_MS.Patch ||
  frame.messages.some(m => m.updateMs > PHASE_BUDGETS_MS.Update)

const SVG = 'http://www.w3.org/2000/svg'

/** 32 tiny bars, one per frame. A full bar is one 60 fps frame (16 ms). */
const sparkline = (frames: ReadonlyArray<FrameRecord>): SVGSVGElement => {
  const width = 48
  const height = 14
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'spark')
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('aria-hidden', 'true')
  const recent = frames.filter(f => !f.isReplay).slice(-32)
  const barWidth = width / 32
  recent.forEach((frame, index) => {
    const barHeight = Math.max(2, Math.min(1, frame.totalMs / 16) * height)
    const bar = document.createElementNS(SVG, 'rect')
    bar.setAttribute('x', String(index * barWidth))
    bar.setAttribute('y', String(height - barHeight))
    bar.setAttribute('width', String(barWidth - 0.5))
    bar.setAttribute('height', String(barHeight))
    bar.setAttribute('fill', isFrameSlow(frame) ? '#f5c26b' : '#cba6f7')
    svg.append(bar)
  })
  return svg
}

export const renderPill = (
  state: PillState,
  on: Readonly<{ pointerdown: (event: Event) => void; dblclick: () => void }>,
): HTMLElement => {
  const last = state.frames.filter(f => !f.isReplay).at(-1)
  const messageCount = last?.messages.length ?? 0
  const dotClass =
    state.status === 'Issue'
      ? 'dot issue'
      : state.status === 'Slow'
        ? 'dot slow'
        : 'dot'
  const statusText =
    state.status === 'Issue'
      ? `${state.issueCount} issues`
      : state.status === 'Slow'
        ? 'some frames are slow'
        : 'all good'

  return el(
    'button',
    {
      class: `pill corner-${state.corner}${state.isOpen ? ' open' : ''}`,
      title:
        'foldkit-scan (Alt Shift S). Drag to move, double-click to tuck away.',
      attrs: {
        'aria-label': `foldkit-scan: ${statusText}`,
        'aria-expanded': String(state.isOpen),
        'data-key': 'pill',
      },
      on: { pointerdown: on.pointerdown, dblclick: on.dblclick },
    },
    [
      el('span', { class: dotClass }),
      el('span', { class: 'num', text: String(Math.round(state.fps)) }),
      el('span', { class: 'unit', text: 'fps' }),
      el('span', { class: 'bar' }),
      el('span', {
        class: 'num',
        text: last === undefined ? '–' : ms(last.totalMs),
      }),
      sparkline(state.frames),
      messageCount > 1 &&
        el('span', {
          class: 'batch',
          text: `${messageCount}→1`,
          title: `${messageCount} Messages, 1 render`,
        }),
      state.issueCount > 0 &&
        el('span', { class: 'count', text: String(state.issueCount) }),
      state.toast !== undefined &&
        el('span', { class: 'toast', text: state.toast }),
    ],
  )
}

/** The pill tucked into a 12 px tab on the screen edge. */
export const renderTuck = (
  corner: Corner,
  status: Status,
  onClick: () => void,
): HTMLElement =>
  el(
    'button',
    {
      class: `tuck corner-${corner}`,
      title: 'Show foldkit-scan',
      attrs: { 'aria-label': 'Show foldkit-scan', 'data-key': 'tuck' },
      on: { click: onClick },
    },
    [el('span', { class: status === 'Issue' ? 'dot issue' : 'dot' })],
  )

/** Asked once, a few minutes in: all those flashes, still useful? */
export const renderFlashOffer = (
  corner: Corner,
  answer: (switchToProblems: boolean) => void,
): HTMLElement => {
  const isTop = corner.startsWith('Top')
  const isLeft = corner.endsWith('Left')
  return el(
    'div',
    {
      class: 'offer',
      attrs: { role: 'dialog', 'aria-label': 'Flash mode' },
      style: {
        [isTop ? 'top' : 'bottom']: '54px',
        [isLeft ? 'left' : 'right']: '12px',
      },
    },
    [
      el('p', {
        text: 'Lots of flashing. Only flash problems from now on? You can change this any time in Settings.',
      }),
      el('div', { class: 'actions' }, [
        el('button', {
          class: 'btn',
          text: 'Keep all',
          on: { click: () => answer(false) },
        }),
        el('button', {
          class: 'btn primary',
          text: 'Problems only',
          on: { click: () => answer(true) },
        }),
      ]),
    ],
  )
}
