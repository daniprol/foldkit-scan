import { defineConfig } from 'astro/config'
import { fileURLToPath } from 'node:url'
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc'

import starlight from '@astrojs/starlight'
import { foldkitViewIdentity } from '@foldkit/vite-plugin'

const fromHere = path => fileURLToPath(new URL(path, import.meta.url))

const librarySource = fromHere('../src/index.ts')
const exampleSource = fromHere('../example/src/')
const exampleScan = fromHere('../example/src/scan.ts')
const demoSource = fromHere('./src/demo/')
const demoScan = fromHere('./src/demo/scan.ts')

// Foldkit's view identity stamps give flash labels like `main.ts#taskRow`.
// Astro's own modules must not be touched, so stamp only the demo code.
const viewIdentity = foldkitViewIdentity()
const demoViewIdentity = {
  ...viewIdentity,
  transform(code, id) {
    const isDemo = id.startsWith(exampleSource) || id.startsWith(demoSource)
    return isDemo && id.endsWith('.ts')
      ? viewIdentity.transform.call(this, code, id)
      : null
  },
}

// The example's scan.ts only turns on in dev. The demo swaps in its own,
// which is always on.
const useDemoScan = {
  name: 'foldkit-scan-docs:demo-scan',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (source !== './scan' || importer?.startsWith(exampleSource) !== true) {
      return null
    }
    const resolved = await this.resolve(source, importer, options)
    return resolved?.id === exampleScan ? demoScan : null
  },
}

export default defineConfig({
  site: 'https://daniprol.github.io',
  base: '/foldkit-scan',
  integrations: [
    starlight({
      title: 'foldkit-scan',
      description: 'See what re-renders in your Foldkit app, and why.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/daniprol/foldkit-scan',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/daniprol/foldkit-scan/edit/main/docs/',
      },
      plugins: [
        starlightTypeDoc({
          entryPoints: ['../src/index.ts'],
          tsconfig: './tsconfig.typedoc.json',
          sidebar: { label: 'API reference', collapsed: true },
          typeDoc: {
            // Links to the source on GitHub.
            gitRevision: 'main',
            // The default README.md entry pages make starlight-typedoc drop
            // the Scan namespace page and leave a broken link to it.
            entryFileName: 'index',
          },
        }),
      ],
      sidebar: [
        { label: 'Introduction', link: '/' },
        { label: 'Quickstart', slug: 'quickstart' },
        { label: 'Live demo', slug: 'demo' },
        { label: 'Guide', items: [{ autogenerate: { directory: 'guide' } }] },
        typeDocSidebarGroup,
      ],
    }),
  ],
  vite: {
    plugins: [useDemoScan, demoViewIdentity],
    resolve: {
      // Like example/vite.config.ts: the demo imports 'foldkit-scan' and
      // gets the live source.
      alias: [{ find: /^foldkit-scan$/, replacement: librarySource }],
    },
  },
})
