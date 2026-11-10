---
title: "The format check skips files listed in the Prettier ignore file, and trail's own files are excluded"
author: HBrosenius
date: 2026-11-10
branch: fix/browser-workflows-after-usability-update
cost: { minutes: 1, tokens: 1104 }
id: l-a5a029a8
scope: repo
status: active
src: agent
touches:
  - scripts/check-format.mjs
  - ".prettierignore"
---

## Decided
The repo's format check now honors the Prettier ignore file, and trail's tool files are listed there. Trail's generated files (its hook script, README, learnings) are not ours to reformat, and the format check runs over every tracked file, so committing trail's folder made CI's format step fail.

## Tried and ruled out
- Running Prettier on trail's hook script: trail's Bash guard blocks any command that names that script, so it can't be formatted by hand (and shouldn't be — trail may regenerate it).
- Only adding the folder to the Prettier ignore file: the check script ignored that file entirely, so it had no effect until the script passed it explicitly.

## Watch out
Because the check now honors the ignore file, the `.claude` folder (already listed there) is no longer format-checked either.

In the code:
- `scripts/check-format.mjs`: `prettier.getFileInfo(file, { ignorePath: ".prettierignore" })`
- `.prettierignore`: added `.trail`
- Verify with `npm run format:check` (exit 0).
