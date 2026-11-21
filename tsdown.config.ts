import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    // The library itself runs in the browser, next to the app.
    entry: ['src/index.ts'],
    platform: 'browser',
    target: 'es2022',
    // .d.ts files come from oxc because tsconfig sets isolatedDeclarations.
    dts: true,
    // Check the package the way npm users will see it.
    publint: true,
    attw: { profile: 'esm-only' },
  },
  {
    // M4 only: the optional Vite plugin runs in Node.
    entry: ['src/vite.ts'],
    platform: 'node',
    // Emit .js, not .mjs, so both entries look the same in exports.
    fixedExtension: false,
    dts: true,
  },
])
