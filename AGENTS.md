# foldkit-scan agent notes

A dev-time profiler overlay for Foldkit apps. CLAUDE.md is a symlink to this file.

- The hot path (frames.ts, dom.ts, lazy.ts, overlay/*) is plain TypeScript. No Effect, no allocation per frame if avoidable.
- Effect is used at the edges only: Schema in report.ts and settings.ts, Option and Equal in slow.ts and lazy.ts, Tracer in M4.
- Timings come from Foldkit's public `slow.onSlow` hook with budgets of -1. Never wrap the user's `update`.
- For Effect 4 idioms read node_modules/effect/AGENTS.md. For Foldkit APIs read node_modules/foldkit/dist, or repos/foldkit if it has been vendored (read-only, never import from it).
- example/ is a normal Foldkit app and follows example/FOLDKIT.md. Files in example/src/bugs/ are wrong on purpose.
- Before you finish: pnpm check.
