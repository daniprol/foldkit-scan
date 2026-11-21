import { DEVTOOLS_HOST_ID } from 'foldkit/devtools-host'

import { shortLabel } from '../identity'
import type { LazyOrigin } from '../lazy'
import type { FrameRecord, LazyStat } from '../types'
import { el } from './el'
import { summarizeFrame } from './flashes'

// Inspect mode: point at any part of the page and see how often it
// re-renders and why. It answers the question a learner actually asks:
// "why does this row keep re-rendering?"
//
// While inspecting, a transparent layer catches the pointer, so clicks go
// to the inspector and not to your app. The banner says so.

const HISTORY_MS = 5000

export type InspectData = Readonly<{
  frames: () => ReadonlyArray<FrameRecord>
  labelFor: (node: Node) => string
  originOf: (element: Element) => LazyOrigin | undefined
  statFor: (name: string) => LazyStat | undefined
}>

export type Inspector = Readonly<{
  isActive: () => boolean
  start: () => void
  stop: () => void
  /** Arrow keys and Enter while inspecting. Returns true when handled. */
  handleKey: (event: KeyboardEvent) => boolean
}>

const keyText = (key: PropertyKey | undefined): string =>
  key === undefined ? '' : ` · key ${String(key)}`

/** Everything the card says about one element. */
export const describeTarget = (
  element: Element,
  data: InspectData,
  now: number = performance.now(),
): Readonly<{
  label: string
  origin: LazyOrigin | undefined
  stat: LazyStat | undefined
  patchCount: number
  lastFrame: FrameRecord | undefined
}> => {
  const recent = data
    .frames()
    .filter(f => !f.isReplay && now - f.at <= HISTORY_MS)
  const touching = recent.filter(frame =>
    frame.changes.some(change => element.contains(change.element)),
  )
  const origin = data.originOf(element)
  return {
    label: data.labelFor(element),
    origin,
    stat: origin === undefined ? undefined : data.statFor(origin.name),
    patchCount: touching.length,
    lastFrame: touching.at(-1),
  }
}

const whyItMisses = (stat: LazyStat | undefined): string | undefined => {
  if (stat === undefined) return undefined
  if (stat.unstableFunction)
    return 'the view function is a new function each render'
  if (stat.unstableArgs.length > 0) {
    return `arg ${stat.unstableArgs.join(', ')} is a new object each time, same value`
  }
  return stat.misses > 0 ? 'its arguments really changed' : undefined
}

export const makeInspector = (
  root: ShadowRoot,
  data: InspectData,
  onChange: () => void,
): Inspector => {
  let isActive = false
  let isPinned = false
  let target: Element | undefined
  let layer: HTMLElement | undefined

  const ownHost = root.host

  const elementAt = (x: number, y: number): Element | undefined =>
    document
      .elementsFromPoint(x, y)
      .find(
        element =>
          element !== ownHost &&
          !ownHost.contains(element) &&
          element.closest(`#${DEVTOOLS_HOST_ID}`) === null &&
          element !== document.documentElement &&
          element !== document.body,
      )

  const render = (): void => {
    layer?.replaceChildren()
    if (layer === undefined) return
    layer.append(
      el('div', { class: 'banner', attrs: { role: 'status' } }, [
        el('span', { class: 'dot' }),
        isPinned
          ? 'Pinned · click elsewhere to move on · Esc to leave'
          : 'Inspecting · Esc to leave',
      ]),
    )
    if (target === undefined) return

    const rect = target.getBoundingClientRect()
    const info = describeTarget(target, data)
    const name = shortLabel(info.label)
    layer.append(
      el(
        'div',
        {
          class: 'inspect-box',
          style: {
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          },
        },
        [
          el('span', {
            class: 'inspect-tag',
            text: `${name}${keyText(info.origin?.key)}`,
          }),
        ],
      ),
    )

    const below = rect.bottom + 200 < window.innerHeight
    const cardTop = below ? rect.bottom + 8 : Math.max(8, rect.top - 208)
    const cardLeft = Math.min(Math.max(8, rect.left), window.innerWidth - 308)
    const why = whyItMisses(info.stat)
    layer.append(
      el(
        'div',
        {
          class: 'inspect-card',
          style: { left: `${cardLeft}px`, top: `${cardTop}px` },
        },
        [
          el('div', { class: 'ttl' }, [
            el('code', { text: name }),
            info.origin !== undefined &&
              el('span', {
                text: `${keyText(info.origin.key).slice(3)} · lazy slot ${info.origin.name}`,
              }),
          ]),
          el('dl', { class: 'kv' }, [
            el('dt', { text: 'Patched' }),
            el('dd', { text: `${info.patchCount} times in 5 s` }),
            info.stat !== undefined && el('dt', { text: 'Lazy' }),
            info.stat !== undefined &&
              el('dd', {
                text: `${info.stat.hits} hits / ${info.stat.misses} misses`,
              }),
            why !== undefined && el('dt', { text: 'Why it misses' }),
            why !== undefined &&
              el('dd', {
                class:
                  info.stat?.unstableArgs.length || info.stat?.unstableFunction
                    ? 'bad'
                    : '',
                text: why,
              }),
            el('dt', { text: 'Last touched by' }),
            el('dd', {
              text:
                info.lastFrame === undefined
                  ? 'nothing in the last 5 s'
                  : `${summarizeFrame(info.lastFrame)}, frame ${info.lastFrame.id}`,
            }),
          ]),
          el('div', { class: 'inspect-foot' }, [
            el('span', {}, [el('kbd', { text: '↑↓' }), ' parent, child']),
            el('span', {}, [el('kbd', { text: 'Enter' }), ' pin']),
            el('span', {}, [el('kbd', { text: 'Esc' }), ' leave']),
          ]),
        ],
      ),
    )
  }

  const onMove = (event: PointerEvent): void => {
    if (isPinned) return
    const next = elementAt(event.clientX, event.clientY)
    if (next !== target) {
      target = next
      render()
    }
  }

  const onClick = (event: MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    if (isPinned) {
      isPinned = false
      target = elementAt(event.clientX, event.clientY)
    } else {
      isPinned = target !== undefined
    }
    render()
  }

  const start = (): void => {
    if (isActive) return
    isActive = true
    isPinned = false
    layer = el('div', { class: 'catcher', attrs: { 'aria-hidden': 'false' } })
    layer.addEventListener('pointermove', onMove)
    layer.addEventListener('click', onClick)
    root.append(layer)
    render()
    onChange()
  }

  const stop = (): void => {
    if (!isActive) return
    isActive = false
    target = undefined
    layer?.remove()
    layer = undefined
    onChange()
  }

  const handleKey = (event: KeyboardEvent): boolean => {
    if (!isActive || target === undefined) return false
    if (
      event.key === 'ArrowUp' &&
      target.parentElement !== null &&
      target.parentElement !== document.body
    ) {
      target = target.parentElement
    } else if (event.key === 'ArrowDown' && target.firstElementChild !== null) {
      target = target.firstElementChild
    } else if (
      event.key === 'ArrowLeft' &&
      target.previousElementSibling !== null
    ) {
      target = target.previousElementSibling
    } else if (
      event.key === 'ArrowRight' &&
      target.nextElementSibling !== null
    ) {
      target = target.nextElementSibling
    } else if (event.key === 'Enter') {
      isPinned = !isPinned
    } else {
      return false
    }
    render()
    return true
  }

  return { isActive: () => isActive, start, stop, handleKey }
}
