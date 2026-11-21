import { describe, expect, test } from 'vitest'

import type { Report } from '../types'
import { type PageReport, makeMcpServer } from './mcpServer'

const report: Report = {
  version: 1,
  frames: [
    {
      id: 1,
      messages: [{ tag: 'ClickedRow', updateMs: 0.5, changedModel: true }],
      updateMs: 0.5,
      viewMs: 9,
      patchMs: 3,
      totalMs: 12.5,
      changes: [{ kind: 'Changed', label: 'src/rows.ts#row' }],
      isWasted: false,
      isReplay: false,
    },
  ],
  hotspots: { byView: [], byMessage: [] },
  lazy: [],
  issues: [
    {
      id: 'WastedRender:Ticked',
      kind: 'WastedRender',
      subject: 'Ticked',
      explanation: 'Ticked returned a new Model equal in value.',
      hint: 'Return the same Model.',
      count: 3,
    },
  ],
  commands: [],
}

const serverFor = (page: PageReport) =>
  makeMcpServer({ version: '1.0.0', fetchPage: () => Promise.resolve(page) })

const call = (page: PageReport, name: string) =>
  serverFor(page).handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: {} },
  })

describe('MCP server', () => {
  test('agrees on a protocol version and lists its tools', async () => {
    const server = serverFor({ url: 'x', report })
    const init = await server.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' },
    })
    expect(init?.result).toMatchObject({
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
    })
    const list = await server.handle({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    })
    expect(list?.result).toMatchObject({
      tools: [
        { name: 'foldkit_scan_issues' },
        { name: 'foldkit_scan_summary' },
        { name: 'foldkit_scan_report' },
      ],
    })
  })

  test('answers no notification', async () => {
    const answer = await serverFor({ url: 'x', report }).handle({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    })
    expect(answer).toBeUndefined()
  })

  test('returns issues and a summary as text', async () => {
    const issues = await call({ url: 'x', report }, 'foldkit_scan_issues')
    expect(JSON.stringify(issues?.result)).toContain('WastedRender')

    const summary = await call({ url: 'x', report }, 'foldkit_scan_summary')
    expect(JSON.stringify(summary?.result)).toContain('ClickedRow')
  })

  test('explains when the page has no foldkit-scan', async () => {
    const answer = await call(
      { url: 'http://localhost:5173/', report: null },
      'foldkit_scan_summary',
    )
    expect(answer?.result).toMatchObject({ isError: true })
    expect(JSON.stringify(answer?.result)).toContain('enabled: true')
  })

  test('rejects an unknown method', async () => {
    const answer = await serverFor({ url: 'x', report }).handle({
      jsonrpc: '2.0',
      id: 9,
      method: 'resources/list',
    })
    expect(answer?.error?.code).toBe(-32601)
  })
})
