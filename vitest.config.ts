import { defineConfig } from 'vitest/config'

import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    projects: [
      {
        // Fast tests for pure logic: frames, slow, lazy, report.
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts'],
          environment: 'happy-dom',
          server: { deps: { inline: ['foldkit'] } },
        },
      },
      {
        // Real Chromium for MutationObserver, layout rects and canvas.
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      // The example app's own Story and Scene tests.
      'example',
    ],
  },
})
