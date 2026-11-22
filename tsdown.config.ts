import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    // The library runs in the browser, next to the app. noop.ts is the
    // production build: the same API with nothing behind it.
    entry: ['src/index.ts', 'src/noop.ts'],
    platform: 'browser',
    target: 'es2022',
    // Emit .js to match the exports map.
    fixedExtension: false,
    // .d.ts files come from oxc because tsconfig sets isolatedDeclarations.
    dts: true,
    // Check the package the way npm users will see it.
    publint: true,
    attw: { profile: 'esm-only' },
  },
  {
    // The Vite plugin and the MCP server run in Node.
    entry: { vite: 'src/node/vite.ts', mcp: 'src/node/mcp.ts' },
    platform: 'node',
    target: 'node20',
    tsconfig: 'tsconfig.node.json',
    fixedExtension: false,
    dts: true,
  },
])
