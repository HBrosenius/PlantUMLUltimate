# Lesson 02 pilot — edit visually and in source

Status: MimikaStudio edition exported 1 November 2026. Narrator: Emma (Kokoro), 192 kbps source MP3, 1080p/30 fps video, English captions and twelve chapters.

Target: **10 minutes**, excluding time the learner spends paused on the exercise. Audience: a new user who has completed the workspace introduction. Coverage: E01, E02, E03, with a small progress-edit example used to cross-check the two editing paths.

## Current MimikaStudio delivery

[Watch / download lesson 02](../../output/mimika-videos/pilot/plantuml-ultimate-lesson-02.mp4) · [English SRT](../../output/mimika-videos/pilot/lesson-02.srt) · [English VTT](../../output/mimika-videos/pilot/lesson-02.vtt)

The edited runtime is **6:59**. The ten-minute storyboard below is a planning budget. The same real app recordings have been retimed to MimikaStudio's measured sentence cues, with the idle gap in the original answer capture removed. All twelve scene-ending sources are checked against the practice checkpoints. See [current narration workflow](mimika-narration.md).

Actual chapter starts:

| Start | Chapter |
|---|---|
| 0:00 | One plan, two ways to edit |
| 0:24 | Open the starting checkpoint |
| 1:00 | Read the source without memorizing syntax |
| 1:34 | Make a visual change |
| 2:16 | Check what changed and what stayed |
| 2:53 | Edit the text directly |
| 3:26 | Undo and redo a plan change |
| 4:05 | Recover from an invalid value |
| 4:42 | Add a source statement and cross-check it |
| 5:22 | Try the workflow yourself |
| 6:01 | Compare the answer |
| 6:38 | Choose the quickest editing path |

## Learning outcomes

The learner can change a task through its visual inspector, identify the matching source change, edit a duration in source, use the application Undo/Redo controls, recognize an invalid inspector draft, and verify a precise final state.

## Files and starting state

Use [02-start.pumlu](assets/lesson-02/02-start.pumlu), a portable document containing one Gantt diagram. The plaintext counterpart is [02-start.puml](assets/lesson-02/02-start.puml). Opening the portable document first shows the Document navigator; select **02-start**, then close the navigator and use **Split** view. Do not begin recording on the unrelated default Gantt tab.

The fictional customer-portal launch starts on **2 November 2026**. Saturdays and Sundays are closed. There is no dynamic Today statement. Research lasts 4 working days; Design lasts 5; Build lasts 8; Launch is a milestone tied to Build's end. Later tasks use relative dependencies. Resource allocation, forecast, and linked WBS behavior are introduced in later lessons.

| Checkpoint | Design | Build | Build progress | Purpose |
|---|---:|---:|---|---|
| `02-start` | 5 days | 8 days | Not set | Learner's starting point. |
| `02-visual-edit` | 7 days | 8 days | Not set | Result of the first visual edit. |
| `02-source-edit` | 7 days | 10 days | Not set | Result of the direct source edit; also the expected state after Redo. |
| `02-demonstration-final` | 7 days | 10 days | 25% | End of the instructor demonstration. |
| `02-exercise-answer` | 6 days | 10 days | 25% | Independent exercise answer; intentionally different from the demonstration. |

Every checkpoint has `.puml` and `.pumlu` versions. Keep the start file unchanged; use a practice copy if saving. The full seven-diagram reference is [customer-portal-reference.pumlu](assets/customer-portal/customer-portal-reference.pumlu). Its diagrams are intentionally unlinked: creating and reviewing links is taught in lesson 09.

## Original preparation voice and timing

The original preparation used **KittenTTS Mini 0.8**, model `KittenML/kitten-tts-mini-0.8`, voice **Leo**, speed **1.0**, generated locally at **24 kHz**. The Python runtime package is `kittenml==0.9.7`; that package version does not change the selected 0.8 model. No hosted speech endpoint or API key is used.

The twelve generated clips contain **470.083 seconds** of speech. The ten-minute storyboard therefore leaves **129.917 seconds** for actions and deliberate pauses. Action allowance is time outside narration; demonstrations can also take place while the voice explains them. These are storyboard allocations, not measured final video timings. Do not fill spare time with an unchanging screen: use comparison, pointer emphasis, or a useful pause.

Narration source: [lesson-02-narration.json](lesson-02-narration.json). Generated clips and timing metadata are under `output/training-pilot/audio/` and `output/training-pilot/narration-timings.json`. The [Leo sample](../../output/training-pilot/leo-voice-sample.wav) demonstrates the actual local voice.

## Timed storyboard

| Scene | Target | On-screen action and framing | Evidence / expected result |
|---|---|---|---|
| 01 · Goal | 00:00–00:35 | Brief lesson title, then show the completed demonstration in Split view. Highlight source and diagram as the two editing surfaces. | Show the goal before explaining the procedure; do not imply the learner already has this state. |
| 02 · Open | 00:35–01:25 | In a clean workspace use File → Open → Document; choose `02-start.pumlu`; select **02-start** in the Document navigator. Close navigator; select Split. | Design 5, Build 8, Research 4, Launch at Build's end. The file picker varies by browser/OS. |
| 03 · Read | 01:25–02:15 | Close up on the source: delimiters, fixed start date, closed weekdays, readable labels, aliases and duration statements. Briefly point at matching objects. | Teach how to read this small example; leave dependency semantics and syntax variants for later lessons. |
| 04 · Visual | 02:15–03:20 | Click Design. Frame Duration and its units; select 5, type 7, then Tab out. Hold the source and resulting chart long enough to compare them. Close inspector after render completes. | Source contains `[Design] as [design] lasts 7 days`. This inspector commits a valid duration on blur; do not generalize that behavior to every panel. |
| 05 · Check | 03:20–04:20 | Highlight the changed duration, unchanged alias, and the two dependency statements. Compare the start checkpoint with the visual-edit result. | Research remains 4; Build remains 8; dependency text is preserved. Show actual dependent movement without inventing dates. |
| 06 · Source | 04:20–05:15 | Select only the `8` in the Build declaration and type `10`. Keep the diagram visible and wait for the current preview. | Build duration becomes 10, Design stays 7. Use deliberate typing in recorded footage rather than replacing the entire document. |
| 07 · Undo/Redo | 05:15–06:10 | Use the application Undo control, show Build return to 8, then Redo and show 10. Pause on each result. | Verify both source and current preview. Distinguish application history from an active ordinary text field's editing history. |
| 08 · Invalid draft | 06:10–07:05 | Select Design; set Duration to 0; Tab out. Close up on validation feedback and the unchanged source value. Correct to 7; Tab out; show the warning clear; close inspector. | Zero remains a draft; source stays at 7. Correct the invalid value before attempting to close or switch panels. |
| 09 · Progress | 07:05–08:00 | Add `[build] is 25% completed` beneath Build's dependency. Show progress in the chart, select Build, and inspect **Progress (%)**. | Inspector reads 25; diagram and source agree. Display the exact syntax in a readable callout. |
| 10 · Practice | 08:00–08:45 | Display the three exercise requirements and the start/answer filenames. Invite the learner to pause. Do not include a long silent exercise interval in the exported video. | Reset to start: Design 6 through inspector, Build 10 through source, Build 25% through source. Preserve aliases/dependencies. |
| 11 · Answer | 08:45–09:35 | Open the answer checkpoint in a clean practice session. Highlight each requested value, Research's unchanged duration, and the milestone dependency. | Match `02-exercise-answer`, not the instructor's seven-day Design example. Compare meaning; do not fail a learner over harmless whitespace. |
| 12 · Recap | 09:35–10:00 | Return to a clear Split view and recap the editing/checking loop. End with the next lesson's goal. | Visual edit → source check; source edit → visual check; undo/redo; invalid draft recovery. |

The full spoken text for every scene is in the narration JSON. Keep scene IDs identical in the recording timeline and audio filenames so later revisions can replace one scene without rebuilding unrelated narration.

## Learner exercise and answer

Start again from `02-start`, using a new practice session or discarding only your disposable demonstration changes when prompted. Make these changes:

1. Set Design to **6 working days** through the task inspector.
2. Set Build to **10 working days** through source editing.
3. Add **25% completion** for Build in the source.
4. Use Undo and Redo once, then leave the requested final values in place.

Success checks: the source and inspectors report those values; Research is still 4 days; the aliases `research`, `design`, and `build` remain; the relative dependency statements and Launch milestone remain. If a field contains an invalid draft, correct it and check that it actually committed. Do not equate a stale preview with the current plan.

Expected changed statements:

```plantuml
[Design] as [design] lasts 6 days
[Build] as [build] lasts 10 days
[build] is 25% completed
```

Compare with [02-exercise-answer.pumlu](assets/lesson-02/02-exercise-answer.pumlu) or its [plaintext source](assets/lesson-02/02-exercise-answer.puml). Checkpoint files are alternate starting states, not a shared history timeline.

## Rehearsal evidence and limits

The local-source rehearsal passed nine checks: portable start open; visual duration edit; direct source edit; Undo; Redo; invalid draft rejection; progress source edit; inspector cross-check; and independent exercise result. Screenshots and `rehearsal.json` are in `output/training-pilot/`.

All six portable artifacts round-trip through the application's document-format encoder/decoder with matching payloads. The reference portable document also opened in the running app and all seven diagrams matched their supplied source and rendered titles; see `reference-validation.json`.

The rehearsal uses Chromium's standard file-input fallback. It does not validate the native operating-system file picker or Safari/Firefox behavior. Automated setup/source replacement uses the same CodeMirror read/input approach as the repository's existing editor helpers; final footage must demonstrate the individual source edits visibly and at teaching pace. Rehearsal screenshots are technical evidence, not completed training footage.

## Recording checklist

- Use a clean profile, the chosen recording commit and a fixed 1920×1080 output. Hide development timing diagnostics. Set readable editor text and frame the inspector/source closely enough to read on a laptop player.
- Remove the unrelated default Gantt tab once the start document is open. Leave no other files or personal browser content visible.
- Show actual interactions. Use gentle cursor emphasis, short close-ups and enough time to read each changed statement.
- Wait for **Preview current** before evaluating the chart or freezing a comparison frame. Loading overlays are not the final result.
- Verify the corrected field is applied before closing an inspector. Keep the invalid-value recovery continuous so the learner sees why the warning clears.
- Sync Leo's explanation to the action; the narration's measured durations are the starting point for editing, not a reason to rush.
- Review pronunciation, especially PlantUML and the spoken percentage statement. Captions should display actual syntax such as `[build] is 25% completed`, even when narration spells out words for pronunciation.
- Align captions to speech; a word-count timing estimate is insufficient for the final training lesson. Normalize the final mix and check true peaks after encoding.
- Export the pilot, decode it fully, inspect every cut and exercise instruction, and perform the exercise from the start file using only the finished lesson.

## Reproduction

For the current MimikaStudio edition, use `generate.py`, `build.py` and `verify.py` as documented in [MimikaStudio narration](mimika-narration.md).

The commands below reproduce the original checkpoint and Leo preparation assets from the repository root:

```sh
node_modules/.bin/esbuild packages/document-format/src/index.ts --bundle --platform=node --format=esm --outfile=output/training-pilot/format-api.mjs
node output/training-pilot/build-checkpoints.mjs
node output/training-pilot/rehearse.mjs
node output/training-pilot/verify-reference.mjs
output/training-pilot/.venv/bin/python output/training-pilot/narrate-local.py
```

The two browser scripts use port 5226 and start a local development server when necessary. Narration reuses unchanged clips by a text/model/voice fingerprint. Model files are cached under `output/training-pilot/model-cache/`. Runtime setup and licensing notes are in [local narration setup](local-narration.md).
