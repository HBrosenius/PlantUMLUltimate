---
title: "ESLint doesn't skip git-ignored folders, so local artifacts and trail's tool files need explicit ignores"
author: HBrosenius
date: 2026-11-10
branch: fix/browser-workflows-after-usability-update
cost: { minutes: 20, tokens: 76670 }
id: l-8b743b06
scope: repo
status: active
src: agent
touches:
  - eslint.config.js
---

## Decided
ESLint's flat config does not read `.gitignore`, so anything on disk gets linted: the untracked demo/course output folder and trail's generated hook scripts produced ~240 lint errors locally. Trail's hook script is committed, so CI lint would fail on it too. Both folders are now listed in ESLint's own ignores, alongside the existing graft and .claude entries.

## Tried and ruled out
- Fixing the trail hook's lint errors: trail generates that file and its Bash guard blocks commands that name it, so it can't be edited by hand.

## Watch out
When adding a new generated or local-only folder, add it to ESLint's ignores as well as `.gitignore`, `.ignore` and (for formatting) `.prettierignore`.

In the code:
- `eslint.config.js` `ignores`: added `".trail/**"`, `"output/**"`
- Check with `npx eslint .` (only remaining warning is pre-existing in `apps/collaboration-worker/src/worker-configuration.d.ts`)
