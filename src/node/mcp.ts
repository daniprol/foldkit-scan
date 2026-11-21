#!/usr/bin/env node
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'

import {
  type JsonRpcRequest,
  type PageReport,
  makeMcpServer,
} from './mcpServer'

// The `foldkit-scan-mcp` command. An MCP client (Claude Code, Cursor...)
// starts it and talks to it over stdin and stdout, one JSON message per
// line. Logs go to stderr, because stdout is the protocol.
//
// It reads reports from the Vite dev server. Set FOLDKIT_SCAN_URL when the
// dev server is not on http://localhost:5173.

const readVersion = (): string => {
  try {
    // dist/mcp.js sits one folder below package.json.
    const manifest: unknown = createRequire(import.meta.url)('../package.json')
    return typeof manifest === 'object' &&
      manifest !== null &&
      'version' in manifest
      ? String(manifest.version)
      : 'unknown'
  } catch {
    return 'unknown'
  }
}
const baseUrl = process.env['FOLDKIT_SCAN_URL'] ?? 'http://localhost:5173'
const reportUrl = new URL('/__foldkit-scan/report', baseUrl).href

const fetchPage = async (): Promise<PageReport> => {
  let response: Response
  try {
    response = await fetch(reportUrl)
  } catch {
    throw new Error(
      `Could not reach ${reportUrl}. Start the Vite dev server with the foldkitScan() plugin, or set FOLDKIT_SCAN_URL.`,
    )
  }
  const body: unknown = await response.json()
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? String(body.error)
        : `HTTP ${response.status}`
    throw new Error(message)
  }
  if (typeof body !== 'object' || body === null || !('report' in body)) {
    throw new Error(`Unexpected answer from ${reportUrl}`)
  }
  // The report itself is checked by decodeReport when a tool runs.
  return {
    url: 'url' in body ? String(body.url) : reportUrl,
    report: body.report,
  }
}

const server = makeMcpServer({ version: readVersion(), fetchPage })

const lines = createInterface({ input: process.stdin })
lines.on('line', line => {
  if (line.trim() === '') return
  let request: JsonRpcRequest
  try {
    request = JSON.parse(line)
  } catch {
    process.stdout.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`,
    )
    return
  }
  void server.handle(request).then(response => {
    if (response !== undefined) {
      process.stdout.write(`${JSON.stringify(response)}\n`)
    }
  })
})

process.stderr.write(`foldkit-scan MCP server reading ${reportUrl}\n`)
