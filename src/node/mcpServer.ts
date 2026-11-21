import { decodeReport } from '../report'
import type { Report } from '../types'

// A small MCP server, so an AI agent can ask "what is slow in my app?".
//
// MCP (Model Context Protocol) is JSON-RPC 2.0: the agent sends requests
// like `tools/list` and `tools/call`, and we answer each one. This file
// only turns requests into answers. mcp.ts connects it to stdin and stdout.
//
// The data comes from the dev server's /__foldkit-scan/report endpoint,
// which the foldkit-scan Vite plugin adds. See vite.ts.

/** What the dev server returns. `report` is checked with `decodeReport`
 *  before use, and is `null` when the page has no foldkit-scan. */
export type PageReport = Readonly<{ url: string; report: unknown }>

export type JsonRpcRequest = Readonly<{
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Readonly<Record<string, unknown>>
}>

export type JsonRpcResponse = Readonly<{
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: Readonly<{ code: number; message: string }>
}>

export type McpServer = Readonly<{
  /** Answers one request. Notifications (no `id`) get no answer. */
  handle: (request: JsonRpcRequest) => Promise<JsonRpcResponse | undefined>
}>

const SUPPORTED_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
]
const METHOD_NOT_FOUND = -32601

const noArguments = { type: 'object', properties: {} } as const

const TOOLS = [
  {
    name: 'foldkit_scan_issues',
    description:
      'Performance problems foldkit-scan found in the running Foldkit app: wasted renders, unstable lazy arguments, keyed list churn and slow phases. Each issue says what happened and how to fix it.',
    inputSchema: noArguments,
  },
  {
    name: 'foldkit_scan_summary',
    description:
      'A short performance summary of the running Foldkit app: frame times, the slowest recent frames and the Messages behind them, the most patched views, lazy slot hit rates and the slowest Commands.',
    inputSchema: noArguments,
  },
  {
    name: 'foldkit_scan_report',
    description:
      'The full foldkit-scan report as JSON: recent frames with every Message, phase time and DOM change, plus hotspots, lazy stats, issues and Commands.',
    inputSchema: {
      type: 'object',
      properties: {
        maxFrames: {
          type: 'number',
          description:
            'How many of the most recent frames to include. Default 30.',
        },
      },
    },
  },
] as const

const round = (value: number): number => Math.round(value * 100) / 100

const percentile = (sorted: ReadonlyArray<number>, p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0

/** The numbers an agent needs first, without every frame. */
export const summarize = (report: Report): unknown => {
  const live = report.frames.filter(frame => !frame.isReplay)
  const totals = live.map(frame => frame.totalMs).sort((a, b) => a - b)
  const slowest = [...live].sort((a, b) => b.totalMs - a.totalMs).slice(0, 5)
  return {
    frames: {
      count: live.length,
      medianMs: round(percentile(totals, 0.5)),
      p95Ms: round(percentile(totals, 0.95)),
      maxMs: round(totals.at(-1) ?? 0),
      wasted: live.filter(frame => frame.isWasted).length,
    },
    slowestFrames: slowest.map(frame => ({
      id: frame.id,
      totalMs: round(frame.totalMs),
      updateMs: round(frame.updateMs),
      viewMs: round(frame.viewMs),
      patchMs: round(frame.patchMs),
      messages: frame.messages.map(message => message.tag),
      domChanges: frame.changes.length,
    })),
    mostPatchedViews: report.hotspots.byView.slice(0, 5),
    busiestMessages: report.hotspots.byMessage.slice(0, 5),
    lazySlots: report.lazy,
    issues: report.issues.map(issue => `${issue.kind}: ${issue.subject}`),
    slowestCommands: report.commands
      .filter(command => command.durationMs !== undefined)
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
      .slice(0, 5),
  }
}

const runTool = (
  name: string,
  args: Readonly<Record<string, unknown>>,
  page: PageReport,
): unknown => {
  if (page.report === null) {
    throw new Error(
      `The page at ${page.url} has no foldkit-scan instance. Check that Scan.make runs with enabled: true.`,
    )
  }
  const report = decodeReport(page.report)
  switch (name) {
    case 'foldkit_scan_issues':
      return report.issues.length === 0
        ? 'No issues. foldkit-scan raises an issue only when a problem repeats, so interact with the app first.'
        : report.issues
    case 'foldkit_scan_summary':
      return summarize(report)
    case 'foldkit_scan_report': {
      const maxFrames =
        typeof args['maxFrames'] === 'number' ? args['maxFrames'] : 30
      return { ...report, frames: report.frames.slice(-maxFrames) }
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

export const makeMcpServer = (
  options: Readonly<{
    version: string
    fetchPage: () => Promise<PageReport>
  }>,
): McpServer => {
  const answer = async (request: JsonRpcRequest): Promise<unknown> => {
    switch (request.method) {
      case 'initialize': {
        const asked = request.params?.['protocolVersion']
        return {
          protocolVersion:
            typeof asked === 'string' && SUPPORTED_VERSIONS.includes(asked)
              ? asked
              : SUPPORTED_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'foldkit-scan', version: options.version },
        }
      }
      case 'ping':
        return {}
      case 'tools/list':
        return { tools: TOOLS }
      case 'tools/call': {
        const name = request.params?.['name']
        const args = request.params?.['arguments']
        try {
          const page = await options.fetchPage()
          const result = runTool(
            typeof name === 'string' ? name : '',
            typeof args === 'object' && args !== null ? { ...args } : {},
            page,
          )
          const text =
            typeof result === 'string'
              ? result
              : JSON.stringify(result, null, 2)
          return { content: [{ type: 'text', text }] }
        } catch (error) {
          // A tool error goes back to the agent as text it can act on.
          const text = error instanceof Error ? error.message : String(error)
          return { content: [{ type: 'text', text }], isError: true }
        }
      }
      default:
        throw new MethodNotFound(request.method)
    }
  }

  return {
    handle: async request => {
      if (request.id === undefined) return undefined
      const id = request.id
      try {
        return { jsonrpc: '2.0', id, result: await answer(request) }
      } catch (error) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: error instanceof MethodNotFound ? METHOD_NOT_FOUND : -32603,
            message: error instanceof Error ? error.message : String(error),
          },
        }
      }
    },
  }
}

class MethodNotFound extends Error {
  constructor(method: string) {
    super(`Method not found: ${method}`)
  }
}
