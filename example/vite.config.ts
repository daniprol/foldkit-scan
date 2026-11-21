import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

import { foldkit } from '@foldkit/vite-plugin'

import { foldkitScan } from '../src/node/vite.ts'

const librarySource = fileURLToPath(new URL('../src/index.ts', import.meta.url))

export default defineConfig({
  // foldkit() adds view identity stamps, hot reload and DevTools.
  // foldkitScan() serves reports to the MCP server and links DevTools.
  plugins: [foldkit(), foldkitScan({ experimentalDevToolsLink: true })],
  resolve: {
    // The example imports 'foldkit-scan' like a real app,
    // but gets the live source, so edits show up instantly.
    alias: [{ find: /^foldkit-scan$/, replacement: librarySource }],
  },
  optimizeDeps: { entries: ['src/entry.ts'] },
  test: {
    name: 'example',
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['./src/vitest-setup.ts'],
    server: { deps: { inline: ['foldkit', '@foldkit/devtools'] } },
  },
})
