// A tiny helper for building DOM nodes in the widget.
//
// The widget is plain DOM on purpose. If it rendered with Foldkit, it would
// show up in its own measurements.

export type Child = Node | string | null | undefined | false

type Props = Readonly<{
  class?: string
  title?: string
  text?: string
  attrs?: Readonly<Record<string, string>>
  style?: Readonly<Record<string, string>>
  on?: Readonly<
    Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>
  >
}>

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: ReadonlyArray<Child> = [],
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag)
  if (props.class !== undefined) element.className = props.class
  if (props.title !== undefined) element.title = props.title
  if (props.text !== undefined) element.textContent = props.text
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    element.setAttribute(name, value)
  }
  for (const [name, value] of Object.entries(props.style ?? {})) {
    element.style.setProperty(name, value)
  }
  for (const [type, listener] of Object.entries(props.on ?? {})) {
    if (listener !== undefined) element.addEventListener(type, listener)
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    element.append(child)
  }
  return element
}

/** Formats milliseconds for small labels: `0.4 ms`, `12 ms`. */
export const ms = (value: number): string =>
  `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`

/** Drops the `false`, `null` and `undefined` left by `condition && el(...)`. */
export const compact = (children: ReadonlyArray<Child>): Array<Node | string> =>
  children.filter(
    (child): child is Node | string =>
      child !== null && child !== undefined && child !== false,
  )
