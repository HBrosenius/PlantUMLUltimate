# Course production status

Goal: finish the feature-by-feature PlantUML Ultimate training course using MimikaStudio.

Current delivery has 19 non-Jira lessons and 259 narrated chapters. Narration uses local MimikaStudio Kokoro Emma (`bf_emma`), speed 1.0; Leo was unavailable in this workflow. Lossless WAV masters supply video audio, with 48 kHz / 192 kbps MP3 copies.

The per-unit teaching audit is complete: 101 of 101 non-Jira primary checks met. The four Jira units are excluded by user request. Physical-device testing is unavailable. Human listening and pronunciation approval remain outstanding; automated transcription is not human listening.

## Files

- Authoritative scripts and actions: `docs/training/lessons/*.json`.
- Acceptance decisions: `docs/training/feature-acceptance-decisions.json`.
- Failed experiments: `docs/training/pending-acceptance-scenes.json`.
- Internal probes: `docs/training/experiments/acceptance-probes.json`.
- Videos, captions, watch page, learner sources and ZIP: `output/course/`.
- Per-unit results: `output/course/feature-acceptance-audit.{md,csv,json}`.
- Scope and limitations: `output/course/coverage-notes.md`.

## Validation

Lesson builds check 1080p/30 fps, captions, every chapter title/time span and complete FFmpeg decode. Combined-video validation checks the 19 lesson chapters and complete decode. The manifest audit checks all 259 scripts, recorded cues and final source declarations, allowing the two explicitly identified native screenshot walkthroughs. Separate reports cover all referenced MP3 encodings, portable-file decoding, audio signal/pacing, local automated transcription and independent rechecks. New chapter midpoint images and corrected read-only date tooltip captures were visually inspected.

G06 dependent movement, G12 second-person assignment and G19 compact-chain deletion are fixed and recaptured. Root cause: default Enter/Space editing after selection moved focus to CodeMirror. The preview now consumes these keys. Plain compact chains are normalized only for rendering, preserving authored source and body diagnostics; macro and conditional blocks remain untouched. Three-browser regressions cover unchanged keyboard selection, both movement policies with Undo, resource assignment, and compact-chain deletion with pinned dates and Undo. All 2,499 unit tests, workspace type checks and the production web build pass. Original failed cases and their resolution are retained under `docs/training/experiments/`.

## Next action

Complete a human listen-through, including the short “Save the document” phrase in lesson 07 history. Renderer changes are still needed for successful hyperlink demonstrations. Jira requires a dedicated sandbox if later restored to scope.

Edit authoritative JSON directly. Do not rerun the `author-*.py` scaffolds. `record.mjs` reuses `raw/{scene}/take.json`; remove only a changed scene's marker to retake. `COURSE_SCENES` can restrict recording by scene-ID regex. Run narration, recording, build and the appropriate checks after changes. Recording uses local app port 5226; collaboration uses disposable local worker port 8787. Rebuild the combined video and learner archive only after lesson exports and their review pass.

G04/X07 hyperlinks are repaired and recaptured in lessons 03 and 20. The pinned renderer now emits SVG anchors; editing hit areas leave links clickable. Actual confirmation/cancel/separate-tab and exported SVG destinations are verified. Native confirmation text is presented in a labeled overlay, and the reference-page view is an actual opened-tab screenshot. See `output/course/hyperlink-workflow-repair.json`.

Final hyperlink repair validation: 2,520 unit tests pass, workspace type checks and production build pass; all 45 relevant three-browser cases pass across the final suite and targeted WBS cursor recheck. The rebuilt combined course contains 1,388 captions and measures 9,102.2035 seconds.
