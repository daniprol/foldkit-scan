# foldkit-scan agent notes

A dev-time profiler overlay for Foldkit apps. CLAUDE.md is a symlink to this file.

- The hot path (frames.ts, dom.ts, lazy.ts, overlay/*) is plain TypeScript. No Effect, no allocation per frame if avoidable.
- Effect is used at the edges only: Schema in report.ts and settings.ts, Option and Equal in slow.ts and lazy.ts, Tracer in commands.ts, the DevTools store in devtools.ts.
- src/noop.ts is the production build (the package's `production` export). Keep its exports in step with src/index.ts.
- src/node/ is the Node side (Vite plugin, MCP server) with its own tsconfig.node.json. The rest of src/ runs in the browser.
- Anything called once per lazy row must stay O(1): a 1,000-row list calls it 1,000 times per frame. Check big pages with the example's "Add 1,000" button.
- Timings come from Foldkit's public `slow.onSlow` hook with budgets of -1. Never wrap the user's `update`.
- For Effect 4 idioms read node_modules/effect/AGENTS.md. For Foldkit APIs read node_modules/foldkit/dist, or repos/foldkit if it has been vendored (read-only, never import from it).
- example/ is a normal Foldkit app and follows example/FOLDKIT.md. Files in example/src/bugs/ are wrong on purpose.
- The foldkit-scan MCP server in .mcp.json runs dist/mcp.js, so run pnpm build first. It reads reports from the example's dev server (pnpm dev).
- Before you finish: pnpm check.
