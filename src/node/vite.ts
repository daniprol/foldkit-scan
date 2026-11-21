import type { Plugin } from 'vite'

// The foldkit-scan Vite plugin. It is optional and only runs on the dev
// server. It does two things:
//
// 1. Serves the page's report at /__foldkit-scan/report, so tools outside
//    the browser (the foldkit-scan MCP server, curl, a script) can read it.
//    The dev server asks the open page over Vite's HMR socket, the page
//    answers with `window.__FOLDKIT_SCAN__.report()`, and the server
//    returns that as JSON. This mirrors how Foldkit's DevTools MCP works.
//
// 2. With `experimentalDevToolsLink`, wraps the Foldkit DevTools overlay so
//    foldkit-scan can read the DevTools history. See src/devtools.ts.

export type FoldkitScanPluginOptions = Readonly<{
  /** Link each frame to its Message in Foldkit DevTools' history, with a
   *  button that jumps there. Relies on a Foldkit internal, so it may break
   *  on a Foldkit upgrade. Defaults to `false`. */
  experimentalDevToolsLink?: boolean
}>

export const REPORT_PATH = '/__foldkit-scan/report'

/** How long to wait for the page to answer. */
const PAGE_TIMEOUT_MS = 2000

const CLIENT_ID = 'virtual:foldkit-scan/client'
const RESOLVED_CLIENT_ID = `\0${CLIENT_ID}`

// Runs in the browser. Keep it small and plain JavaScript.
const devToolsLinkSource = `
import { overlay } from '@foldkit/devtools/vite'
import { __setDevToolsOverlay } from 'foldkit/devtools-host'

// Foldkit's own plugin registered the overlay a moment ago. Register the
// same overlay again, wrapped, so we can keep the history store it gets.
__setDevToolsOverlay((store, ...rest) => {
  globalThis[Symbol.for('foldkit-scan/devtools-store')] = store
  return overlay(store, ...rest)
})
`

const reportBridgeSource = `
if (import.meta.hot) {
  import.meta.hot.on('foldkit-scan:request', ({ id }) => {
    const handle = window.__FOLDKIT_SCAN__
    import.meta.hot.send('foldkit-scan:response', {
      id,
      url: location.href,
      report: handle === undefined ? null : handle.report(),
    })
  })
}
`

type PageResponse = Readonly<{ id: number; url: string; report: unknown }>

const isPageResponse = (data: unknown): data is PageResponse =>
  typeof data === 'object' &&
  data !== null &&
  'id' in data &&
  typeof data.id === 'number'

/**
 * ```ts
 * // vite.config.ts
 * import { foldkit } from '@foldkit/vite-plugin'
 * import { foldkitScan } from 'foldkit-scan/vite'
 *
 * export default defineConfig({ plugins: [foldkit(), foldkitScan()] })
 * ```
 */
export const foldkitScan = (options: FoldkitScanPluginOptions = {}): Plugin => {
  const isDevToolsLinked = options.experimentalDevToolsLink === true

  return {
    name: 'foldkit-scan',
    apply: 'serve',

    resolveId: id => (id === CLIENT_ID ? RESOLVED_CLIENT_ID : undefined),
    load: id =>
      id === RESOLVED_CLIENT_ID
        ? (isDevToolsLinked ? devToolsLinkSource : '') + reportBridgeSource
        : undefined,

    // Foldkit's plugin puts its DevTools script first in <head>. Ours goes
    // at the end of <head>: after it, and before the app's own script.
    // `order: 'pre'` lets Vite resolve the virtual import in the tag.
    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: `import '${CLIENT_ID}'`,
          injectTo: 'head',
        },
      ],
    },

    configureServer: server => {
      let nextId = 0
      const waiting = new Map<number, (response: PageResponse) => void>()

      server.ws.on('foldkit-scan:response', (data: unknown) => {
        if (!isPageResponse(data)) return
        // With several tabs open, the first answer wins.
        waiting.get(data.id)?.(data)
        waiting.delete(data.id)
      })

      server.middlewares.use(REPORT_PATH, (_request, response) => {
        const id = nextId++
        const send = (status: number, body: unknown): void => {
          response.statusCode = status
          response.setHeader('content-type', 'application/json')
          response.end(JSON.stringify(body))
        }
        const timer = setTimeout(() => {
          waiting.delete(id)
          send(503, {
            error:
              'No page answered. Open the app in a browser, with foldkit-scan enabled.',
          })
        }, PAGE_TIMEOUT_MS)
        waiting.set(id, page => {
          clearTimeout(timer)
          send(200, page)
        })
        server.ws.send('foldkit-scan:request', { id })
      })

      server.httpServer?.once('listening', () => {
        const base = server.resolvedUrls?.local[0]
        if (base !== undefined) {
          server.config.logger.info(
            `  foldkit-scan report: ${new URL(REPORT_PATH, base).href}`,
          )
        }
      })
    },
  }
}
