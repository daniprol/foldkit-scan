import type { Html } from 'foldkit/html'

type VNode = NonNullable<Html>

// Names for DOM elements.
//
// Foldkit's Vite plugin stamps every vnode a view function returns with an
// `identity` like `src/rows.ts#todoRow`. After a patch, each vnode also
// knows its real DOM node in `vnode.elm`. Walking the view result once per
// frame gives us a map from DOM node to view function name.
//
// Lazy hits return the very same vnode object as before, and the patcher
// skips those subtrees, so we skip them too: a subtree we already visited
// cannot have changed.

export type Identities = Readonly<{
  /** Walk a freshly patched view result and remember its names. */
  index: (root: VNode | null | undefined) => void
  /** The name of the closest view function that rendered this node. */
  labelFor: (node: Node) => string
}>

/** `src/feature/rows.ts#todoRow` → `rows.ts#todoRow`. */
export const shortLabel = (label: string): string => {
  const hashIndex = label.indexOf('#')
  if (hashIndex === -1) {
    return label
  }
  const path = label.slice(0, hashIndex)
  const fileName = path.slice(path.lastIndexOf('/') + 1)
  return fileName + label.slice(hashIndex)
}

/** A readable fallback when no view identity is known: `li#main.row`. */
export const describeElement = (element: Element): string => {
  const tag = element.tagName.toLowerCase()
  const id = element.id ? `#${element.id}` : ''
  const firstClass = element.classList[0]
  return `${tag}${id}${firstClass === undefined ? '' : `.${firstClass}`}`
}

export const makeIdentities = (): Identities => {
  const names = new WeakMap<Node, string>()
  const visited = new WeakSet<VNode>()

  const visit = (vnode: VNode): void => {
    if (visited.has(vnode)) {
      return
    }
    visited.add(vnode)
    if (vnode.identity !== undefined && vnode.elm !== undefined) {
      names.set(vnode.elm, vnode.identity)
    }
    for (const child of vnode.children ?? []) {
      if (typeof child !== 'string') {
        visit(child)
      }
    }
  }

  const labelFor = (node: Node): string => {
    let current: Node | null = node
    while (current !== null) {
      const name = names.get(current)
      if (name !== undefined) {
        return name
      }
      current = current.parentNode
    }
    const element = node instanceof Element ? node : node.parentElement
    return element === null ? '#text' : describeElement(element)
  }

  return {
    index: root => {
      if (root !== null && root !== undefined) {
        visit(root)
      }
    },
    labelFor,
  }
}
