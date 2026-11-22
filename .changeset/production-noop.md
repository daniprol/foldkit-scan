---
'foldkit-scan': minor
---

Production builds no longer bundle foldkit-scan. The package's `production` export points at an empty build, which Vite and webpack pick on their own, and `foldkit-scan/noop` is available for other bundlers.
