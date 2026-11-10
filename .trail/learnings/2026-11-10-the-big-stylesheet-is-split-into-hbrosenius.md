---
title: The big stylesheet is split into ordered chunks; a webkit hyperlinks test is flaky regardless
author: HBrosenius
date: 2026-11-10
branch: claude/gifted-northcutt-bd6ff4
cost: { minutes: 15, tokens: 63821 }
id: l-c7a16237
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - apps/web/src/styles.css
  - apps/web/src/styles/01-shell-and-collaboration.css
  - apps/web/src/styles/02-editor-and-diagram-canvas.css
  - apps/web/src/styles/03-gantt-and-sequence-canvas.css
  - apps/web/src/styles/04-gantt-documents-and-commands.css
  - apps/web/src/styles/05-jira-versions-and-problems.css
  - apps/web/src/styles/06-scenarios-and-versions.css
  - apps/web/src/styles/07-class-usecase-and-welcome.css
  - apps/web/src/styles/08-project-inspector.css
---

## Decided
The stylesheet is an import index over numbered chunks; the number prefix is the cascade order, so chunks are never reordered or regrouped.

## Tried and ruled out
Blaming the split for a webkit CI failure: the same hyperlinks spec fails intermittently on the original stylesheet too (repeat-each=10 on both).

## Watch out
Prettier strips a leading blank line from a chunk, so cut at a rule boundary and drop leading blanks or the format check fails. The "member links" test in the hyperlinks spec flakes on webkit with "Element is not attached to the DOM".
In the code: apps/web/src/styles.css, apps/web/src/styles/, tests/e2e/diagram-hyperlinks.spec.ts
