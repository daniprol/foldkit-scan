---
title: Vite plugin and MCP
description: Read the report from outside the browser, give it to an AI agent, and link frames to Foldkit DevTools.
sidebar:
  order: 7
---

## Vite plugin

The plugin is optional and only runs on the dev server.

```ts
import { foldkitScan } from 'foldkit-scan/vite'

// vite.config.ts
import { foldkit } from '@foldkit/vite-plugin'

export default defineConfig({ plugins: [foldkit(), foldkitScan()] })
```

It serves the open page's [report](../data/#report) at `/__foldkit-scan/report`:

```sh
curl http://localhost:5173/__foldkit-scan/report
```

The dev server asks the page over Vite's HMR socket, so the page has to be open in a browser.

## MCP server

`foldkit-scan-mcp` lets an AI agent ask your running app what's slow. Add it to your agent's MCP config:

```json
{
  "mcpServers": {
    "foldkit-scan": { "command": "npx", "args": ["foldkit-scan-mcp"] }
  }
}
```

It needs the Vite plugin, and it reads from `http://localhost:5173`. Set `FOLDKIT_SCAN_URL` when your dev server runs elsewhere.

| Tool                   | Returns                                                                        |
| ---------------------- | ------------------------------------------------------------------------------ |
| `foldkit_scan_issues`  | The current issues, each with what happened and how to fix it.                 |
| `foldkit_scan_summary` | Frame times, the slowest frames, busiest views, lazy hit rates, slow Commands. |
| `foldkit_scan_report`  | The full report as JSON. `maxFrames` limits it, 30 by default.                 |

Agents that drive a browser can skip all this and call `window.__FOLDKIT_SCAN__.report()`.

## DevTools link

:::caution[Experimental]
This relies on a Foldkit internal, so a Foldkit upgrade may break it.
:::

```ts
foldkitScan({ experimentalDevToolsLink: true })
```

Each frame then knows its entry in Foldkit DevTools' history. Pick a frame in the panel and press the button to pause DevTools on its Message. The report gains a `historyIndex` per frame.
