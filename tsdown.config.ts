import { defineConfig } from 'tsdown'

export default defineConfig({
  // The library runs in the browser, next to the app.
  entry: ['src/index.ts'],
  platform: 'browser',
  target: 'es2022',
  // Emit .js to match the exports map.
  fixedExtension: false,
  // .d.ts files come from oxc because tsconfig sets isolatedDeclarations.
  dts: true,
  // Check the package the way npm users will see it.
  publint: true,
  attw: { profile: 'esm-only' },
})
