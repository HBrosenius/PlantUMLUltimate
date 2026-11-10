# PlantUML Ultimate training course — production plan

Status: production, updated 1 November 2026. Feature inventory, foundational practice assets and lesson 02 pilot footage are prepared. The current narration workflow uses MimikaStudio / Kokoro / Emma, with the introduction and pilot rebuilt using that workflow. Remaining course lessons have not yet been recorded.

## Outcome and format

Create an educational course that takes a new user from their first diagram to a connected, reviewed, shared project. Teach each feature in context, with a visible result and an opportunity to practice.

Target **222 minutes (3 hours 42 minutes)** across **20 lessons**, plus one combined video with chapter markers. Durations are editorial budgets, not measured runtimes. Learner practice is additional: allow roughly 1½–3 hours for exercises. If the feature inventory reveals material omissions, revise the budget before scripting rather than rushing demonstrations.

Audience: technical project leads, analysts, architects, and developers. Assume basic computer literacy; introduce PlantUML syntax as needed. The course teaches the application's supported workflows. Exhaustive coverage of the wider PlantUML language belongs in a reference appendix.

Use English narration generated through the supplied local MimikaStudio client, Kokoro engine, Emma (`bf_emma`), speed 1.0, and 192 kbps MP3 exports. See [MimikaStudio narration setup](training/mimika-narration.md). Record real interactions, deliberate pointer movements, and readable close-ups. Use titles to orient the learner; the primary teaching material is the working application.

## One example project throughout

Use a fictional **customer portal launch**, with synthetic names and data:

- Alice: discovery and design; Sam: backend; Alex: frontend; Morgan: quality assurance.
- WBS: discovery, design, implementation, testing, release.
- Gantt: effort, dependencies, milestones, progress, assignments, and one intentional capacity conflict.
- Use Case: customer submits a request and tracks its status.
- Activity: request intake, validation, decision, and resolution.
- Sequence: browser, API, and database interaction.
- Class: customer, request, status, and repository types.
- Component: browser, API, worker, queue, and database.

Freeze project dates, status dates, and sample data for reproducible results. Use dedicated variants to demonstrate delayed work, resource overload, and conflicting edits. Each lesson starts from a supplied checkpoint; learners can join any chapter without replaying earlier lessons.

## Curriculum

| #   | Lesson                            | Minutes | Demonstration and learning outcome                                                                                                                                                                                                                                                                                                                        | Practice / success check                                                                   |
| --- | --------------------------------- | ------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 01  | First launch and workspace        |       8 | Create a diagram; use starters (including saving a personal starter), tabs, ribbon, code/split/diagram views, the Diagram options group, Focus on diagram, pan, zoom, fit, themes, and Help. Distinguish view changes from document changes.                                                                                                              | Create and name a diagram; switch views and return to a fitted preview.                    |
| 02  | PlantUML and visual editing       |      10 | Explain delimiters, labels, aliases, and source ownership. Make a visual change, inspect the generated text, edit the text, and use shared undo/redo. Break one line deliberately: read "Line N can't be drawn", use Go to line, and fix it while the last good preview stays visible.                                                                    | Make the same change from each side and undo it without losing unrelated source.           |
| 03  | Gantt tasks and progress          |      10 | Create, rename, move, resize, reorder, and remove tasks; select several tasks and edit them together; add milestones, dividers, and notes; set effort and completion. Show that deleting a task keeps the tasks that depended on it on their dates.                                                                                                       | Build a small launch plan with a release milestone and progress values.                    |
| 04  | Dependencies and calendars        |      12 | Create and edit supported dependency types, reconnect endpoints, inspect movement behavior, and handle a problematic link. Explain the lag rule: "N days after [A]'s end" starts on A's last day + 1 + N, and a start that lands on a closed day moves to the next working day. Set start date, working days, exceptions, highlights, and timeline scale. | Add a holiday and dependency; explain the resulting schedule.                              |
| 05  | People and workload               |      10 | Assign people, adjust allocation and capacity, explain effort versus elapsed duration, inspect workload, and resolve intentional over-allocation.                                                                                                                                                                                                         | Fix an overloaded person and explain the scheduling consequence.                           |
| 06  | Forecasts and schedule scenarios  |      12 | Set a status date; compare plan and forecast; inspect finish causes; explore alternatives in Delivery Scenario Lab; review before applying a result.                                                                                                                                                                                                      | Compare two alternatives and apply only the chosen change.                                 |
| 07  | Reports and task check-in         |      20 | Demonstrate all eight report types, including critical path and near-critical work, presets, scope/dates, explicit progress observations, baseline changes, stale-report refresh, customization, and supported clipboard/download output. Explain that preparing a message does not send it.                                                              | Prepare an accurate check-in for each person without sending anything.                     |
| 08  | WBS structure                     |      10 | Create branches, edit nodes, move subtrees, reorder with keyboard and pointer, add relationships, and use colors and work details.                                                                                                                                                                                                                        | Build the launch WBS and reorganize a branch while preserving its children.                |
| 09  | Documents and connected diagrams  |      12 | Create a multi-diagram document; add/import/rename diagrams; navigate links; create Gantt from WBS; update shared details; add missing items; inspect coverage and deletion choices.                                                                                                                                                                      | Add one item on each side, reconcile coverage, and reopen the saved document.              |
| 10  | Sequence diagrams                 |      12 | Create participants and messages, reorder and reconnect, use activations, fragments and branches, notes, references, boxes, and presentation controls. Group less common arrow and flow variations in a reference segment.                                                                                                                                | Model a successful request plus an error branch and explain the interaction.               |
| 11  | Use Case diagrams                 |      10 | Create actors, use cases, packages, notes, and relationships; inspect and reconnect supported objects; adjust presentation.                                                                                                                                                                                                                               | Model portal capabilities and an include/extend relationship with a clear meaning.         |
| 12  | Class diagrams                    |      10 | Create types, structured fields and methods, parameters, packages, and relationships; use type completion and supported inspectors.                                                                                                                                                                                                                       | Model request types and a repository with appropriate relationships.                       |
| 13  | Component diagrams                |      10 | Create components, interfaces, infrastructure entities, packages, notes, and relationships; inspect and format them.                                                                                                                                                                                                                                      | Explain the portal's deployment or service structure in a readable diagram.                |
| 14  | Activity diagrams                 |      10 | Create actions, decisions, loops, parallel flows, partitions, terminals, arrows, and notes; reorder and connect supported structures.                                                                                                                                                                                                                     | Build an intake workflow containing a decision and parallel work.                          |
| 15  | Editor assistance and navigation  |      10 | Use completion, diagnostics, quick fixes, semantic highlighting, references, rename, outline/search, command palette, and practical keyboard workflows. Include Sequence semantic review and grouped acceptance.                                                                                                                                          | Diagnose an intentional error, rename a referenced element, and review a proposed patch.   |
| 16  | History and change review         |      10 | Save named checkpoints; compare source and rendered changes; restore a version; inspect document changes and review-report export. Explain retained local history.                                                                                                                                                                                        | Recover an earlier state, then identify the differences from the current version.          |
| 17  | Live collaboration                |      10 | Use two browser sessions to demonstrate editor/viewer links, presence, concurrent editing, independent navigation, reconnection, attributed checkpoints, and revocation. Explain what is shared and what history remains local, that a room expires 24 hours after creation, and that owner rights survive only a reload of the creating tab.             | Join as a viewer, demonstrate the permission boundary, then revoke the old links.          |
| 18  | Jira integration                  |      10 | Use a dedicated sandbox to connect, import, inspect mappings, review incoming/local changes and conflicts, and demonstrate optional publishing with a controlled example. Explain partial outcomes (confirmed, rejected, uncertain, unattempted) and why an uncertain write must be checked in Jira before retrying.                                      | Explain a reviewed synchronization plan and identify exactly what would be published.      |
| 19  | Saving, recovery, and offline use |      12 | Distinguish portable `.pumlu` documents from plain `.puml` source; use file access and download fallbacks, external-file change handling, workspace recovery, backups, compression, password protection and unlock, history limits, installation, offline startup, and the mobile task view.                                                              | Save, close, reopen, recover a checkpoint, and edit offline after an initial online visit. |
| 20  | Export and final handover         |      14 | Export SVG/PNG/PDF/source; use copy formats; distinguish encoded renderer URLs from collaboration links; present connected diagrams with named views, highlights and browser-local review notes; show that diagram links open only after confirmation, in a new tab; package the project and recap troubleshooting.                                       | Deliver the final document, plaintext source, and a readable exported diagram.             |
|     | **Total**                         | **222** |                                                                                                                                                                                                                                                                                                                                                           |                                                                                            |

Lessons 01–02 establish the common workflow. Lessons 03–09 form the planning path; 10–14 form the modeling path, and each modeling lesson includes that editor's multi-selection and bulk styling. All learners finish with 15–20. The combined course follows the numbered order. The table summarizes each lesson; [the feature inventory](training/feature-inventory.md) is the complete assignment of features to lessons.

Lesson 07 runs 20 minutes, twice the typical lesson. Decide after the pilot whether to split it into _Reports_ and _Task check-in_; a split adds a lesson number, so make the decision before chapter timestamps and file names are fixed.

## Teaching pattern for every lesson

1. State one practical goal and show the finished result briefly.
2. Open the supplied start checkpoint and orient the learner.
3. Demonstrate a basic case slowly, explaining the purpose of each action.
4. Show relevant advanced options in grouped examples, with source changes visible when useful.
5. Introduce one realistic mistake or misconception and recover from it.
6. Set a short repeatable exercise; show an observable success check and the supplied answer checkpoint.

Aim for roughly 125–140 spoken words per minute while narrating, with additional time for actions and thinking. Generate a timed pilot before estimating total narration volume. Avoid narrating every pointer movement or reading entire menus aloud.

## Feature coverage and accuracy gate

Before scripting, inventory the menus, dialogs, inspectors, settings, command palette, reports, and all seven diagram types in the release being recorded. Reconcile the inventory against the README and existing demonstration scripts. Existing documentation is a starting point, not proof that every current control has been covered.

Maintain `feature → lesson → scene → demonstrated result → verification status` in a coverage checklist. Classify each item as taught, grouped with a related option, reference-only, or unavailable in the recording environment. Explicitly resolve every unassigned item. Rare controls can have short reference segments; substantial workflows require demonstrations.

Verify supported visual operations separately from syntax that requires source editing. Verify exact UI labels, saving behavior, format availability, forecast calculations, linking rules, and collaboration permissions in the actual recording build. Explain any browser or account prerequisites at the relevant lesson. Do not present planned features as available.

## Production stages and gates

| Stage                      | Work                                                                                                                                                 | Exit criterion                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1. Scope and inventory     | Choose the release/commit, audit features, finalize the lesson mapping and prerequisites.                                                            | Every feature has a teaching destination; runtime budget revised if necessary.                      |
| 2. Demo assets             | Build the fictional project, lesson start/answer checkpoints, delayed-plan and conflict variants, and exercises.                                     | Every demonstration can be repeated from a clean browser profile.                                   |
| 3. Pilot                   | Script and produce lesson 02, including a visual edit, a source edit, an error, and an exercise. Use KittenML narration and actual screen recording. | Pointer pace, text size, voice pronunciation, captions, and teaching depth work at normal playback. |
| 4. Storyboards and scripts | Write scene-level narration, exact actions, expected outcomes, pauses, callouts, and recovery steps.                                                 | Feature coverage checked; technical claims verified before voice generation.                        |
| 5. Record and narrate      | Record by lesson and scene; generate KittenML clips only for reviewed text; cache audio so revisions regenerate only affected scenes.                | No missing interactions, cursor jumps, loading interruptions, or exposed credentials.               |
| 6. Edit and package        | Synchronize narration, screen actions, close-ups, callouts, captions, and chapter transitions. Export individual lessons and the combined course.    | Both versions have correct order, intelligible audio, readable UI, and usable captions.             |
| 7. Learner verification    | Follow each lesson from its supplied checkpoint; perform each exercise using only the instruction given.                                             | Expected results match; omissions and ambiguous instructions corrected.                             |

Indicative production effort for one producer: **7–12 focused working days**, subject to the feature inventory and pilot. This is a workload estimate, not a delivery commitment. Integration setup, discovered app defects, and requested revisions may extend it.

Produce an initial batch of lessons 01–05 after the pilot, check consistency, then produce the remaining lessons in batches. Assemble the combined course after individual lessons pass verification.

## Recording environment

- **Browser and display.** Record in Chromium, the browser with native file saving. Use a second browser only for lesson 19's fallback scenes. Fix the theme, window size, zoom level and editor font for the whole course.
- **Fixed clock.** New Gantt starters, the today highlight and forecasts read the real date. Either run the recording browser with a fixed clock, or build every checkpoint with explicit dates and avoid creating starters on camera. Choose the mechanism before building checkpoints.
- **Service origins.** The deployed collaboration and Jira Workers accept only `https://plantuml.brosenius.se`. From a local recording build, run the collaboration Worker locally with `--var ALLOWED_ORIGINS:<recording origin>`, and reach Jira through the dev server's `/__jira` proxy. Alternatively, record lessons 17–18 against the production site with sandbox data.
- **Collaboration room lifetime.** A room expires 24 hours after it is created. Create it on the recording day and record the sharing and revocation scenes in that window.

## Recording and audio standards

- Record at 1920×1080, 30 fps, with a consistent theme, window size, project state, and readable editor text. Use focused close-ups for dense inspectors; verify readability on a laptop-sized player.
- Keep actual app interaction as the main visual. Use brief section cards, restrained cursor highlights, and intentional pauses. Avoid long static slides during practical instruction.
- Use scene-level MimikaStudio audio with Emma; check pronunciation of PlantUML, WBS, Jira, aliases, and technical terms in the pilot. The local MimikaStudio client needs no hosted speech API key; keep any integration credentials out of scripts, footage, and deliverables.
- Target consistent speech loudness around -16 LUFS and true peaks below -1 dBTP. Keep the teaching audio free of distracting background music.
- Align English captions to the spoken audio and review technical names. The introduction's word-count-based timing is insufficient for the final training course.
- Use a local recording build for repeatable demonstrations. Collaboration needs a working service and two sessions; Jira needs a dedicated authorized sandbox. Prepare these dependencies before their lessons are scripted in detail.
- Use controlled sandbox data for external writes. Keep real account information, tokens, private links, and personal documents out of the recording.

## Ownership, schedule and distribution

- **Roles.** Name a producer, a technical reviewer who checks every claim against the recording build, and an approver who signs off each batch. The technical reviewer, not the producer, marks coverage items verified.
- **Calendar.** Set dates for the pilot review, each batch and the combined release once the pilot has measured real pacing. The effort estimate above is not a schedule.
- **Distribution.** Decide where the course is published (learning platform, video host or internal site), who can see it, and how lessons, captions and project files are downloaded. Record that decision in the course index.

## Rights and licensing

Confirm that KittenML's terms allow the generated voice to be used for the intended audience and distribution, and record the model and version used. Use only fonts, icons and media the project may redistribute. Keep all names and data fictional.

## Accessibility of the course

Captions and transcripts are planned. In addition:

- Narrate actions that are only visible on screen, so the transcript alone describes what happened.
- Show keyboard alternatives for key pointer interactions, matching the app's keyboard support.
- Check that callouts, highlights and cursor effects meet contrast requirements, and avoid flashing transitions.
- Confirm the lessons remain understandable at 1.5× playback.

## Keeping the course current

After each app release, re-run `output/training-inventory/probe.mjs` against the release and compare its captured surfaces with the recording build. Flag every lesson whose labels, menus or results changed, and re-record only the affected scenes from their scene scripts. Record the recording-build identifier and revision date in the course index.

## Feedback and success measures

Give learners one place to report confusing steps or outdated screens. Review it with each release check. Measure success by exercise completion (learners reach each lesson's success check from its start checkpoint) and by recurring questions; revise the lessons those questions point to.

## Deliverables

- Twenty numbered lesson MP4s and one combined, chaptered MP4.
- English SRT/VTT captions and a searchable transcript per lesson.
- Course index with audience, prerequisites, duration, learning outcomes, and chapter timestamps.
- Versioned lesson start files and answer files, portable documents, and relevant plaintext sources.
- Exercise workbook with success checks and answers.
- Feature coverage checklist, recording-build identifier, known limitations, and revision notes.
- Reusable scene scripts, narration manifests, and recording/assembly instructions for updating individual lessons when the app changes.

## Completion checks

Decode every export to catch media errors; inspect transitions, narration synchronization, audio levels, and captions. Check beginning, middle, end, and every edited scene visually. Reopen all supplied project files in a clean profile. Follow the exercises and confirm their outcomes. Verify chapter timing against the final combined export. Mark the coverage checklist complete only when the corresponding teaching scene has passed review.

## Existing material to reuse

Use the existing introduction as optional promotional material, outside the 222-minute teaching budget. Existing Gantt, WBS–Gantt, forecast, and task check-in scripts provide sample stories and automation patterns, but their UI labels, dates, outcomes, and pacing must be rechecked. Their computed dates predate the 26 October lag-rule correction, so recalculate any "N days after" chains rather than reusing their expected results:

- `docs/demo-video-script.md`
- `docs/demo-video-wbs-gantt.md`
- `docs/demo-video-forecast.md`
- `docs/demo-video-task-check-in.md`
- `scripts/demo-video/`
- `output/app-introduction/`

Feature inventory completed as a scope audit: [coverage map and recording checks](training/feature-inventory.md). The audit revised the budget from 202 to 222 minutes to give reports, document protection, presentation and export workflows explicit teaching time. Runtime behavior checks remain pending as listed in the inventory.

Preparation complete: [practice files](training/assets/README.md), [lesson 02 storyboard](training/lesson-02-pilot.md), and [local narration setup](training/local-narration.md). The rehearsal passed nine editing checks and the seven-diagram reference opened and rendered in the app. Leo narration totals 470.083 seconds against the 600-second lesson budget.

Current deliveries: [course index](../output/course/index.md), [coverage notes](../output/course/coverage-notes.md), and the [MimikaStudio introduction and original lesson 02 pilot](training/mimika-narration.md#outputs). Nineteen lesson videos are available as training rough cuts; Jira has a prepared script and awaits a sandbox. Next action: complete the advanced worked demonstrations listed in the coverage notes, then perform a full narration/pacing review. Measured runtime is reported in the course index; 222 minutes remains the original budget.

Production update, 1 November 2026: added 25 worked demonstrations and refreshed lesson 02. Nineteen available lessons now contain 225 chapters. The [coverage notes](../output/course/coverage-notes.md) and [feature-to-scene evidence](../output/course/feature-scene-evidence.csv) distinguish recorded workflows from remaining acceptance/editorial review and environment-dependent gaps.
