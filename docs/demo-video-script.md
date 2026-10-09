# Demo video script: Gantt planning with resources and version history

Target length: about 3 minutes 45 seconds. Narration is roughly 560 words, which the macOS `say` voice reads in about 3 minutes 40 seconds at its default rate. Each scene lists the on-screen action that will be scripted with Playwright and the narration that will be recorded as one audio clip. Clip numbers match scene numbers so the audio can be lined up with the video in an editor.

Recording setup: fresh browser profile, 1920 by 1080 viewport, light theme, source editor visible on the left and the diagram preview on the right. The project starts from the app's default Gantt template (Architecture, Backend, Frontend, Testing, project start 2026-09-01, weekends closed).

---

## Scene 1: Opening

**On screen:** Welcome screen. Click to create a new Gantt chart. The default project appears with four bars and the PlantUML source beside it.

**Narration:**

> This is PlantUML Ultimate, a visual editor for PlantUML diagrams. Today we will plan a small project with a Gantt chart. Everything you see on the right is generated from the PlantUML text on the left, and every change you make in the chart is written straight back into that text.
>
> That text is the whole point. PlantUML is an open, widely used format that is just plain text. Your plan is not locked inside a proprietary file. It lives next to your code, it goes into Git, every change shows up as a readable diff in a pull request, and any PlantUML tool, wiki, or pipeline can render it. You can edit it as a chart or as text, whichever is faster right now, and both stay in sync.

## Scene 2: Add a task

**On screen:** Open the Add menu in the toolbar and choose Task. In the dialog, name the task "API tests", duration 5 days. Submit. A fifth bar appears and two new lines appear in the source.

**Narration:**

> Let's add a task. We click Add, then Task, call it API tests, and give it five days. The new bar shows up immediately, and the matching lines are added to the source. No syntax to remember.

## Scene 3: Edit a task

**On screen:** Click the API tests bar. The task inspector opens. Change the duration from 5 to 6 days. Then drag the bar a few days to the right. Source lines update live.

**Narration:**

> Clicking a bar opens the task inspector. Here we change the duration to six days. We can also just drag the bar to move it. Watch the source: the start date and duration update as we go.

## Scene 3b: Edit the text instead

**On screen:** Click into the source editor. Type a new line under Architecture: `[Architecture] is 50% completed`. The Architecture bar gains a progress fill as soon as the line is complete. Then change `[Frontend] lasts 10 days` to `lasts 12 days` directly in the text. The Frontend bar grows. Briefly show the editor's autocomplete suggesting keywords while typing.

**Narration:**

> The visual tools are one option, not the only one. Sometimes it is quicker to type. Here we mark Architecture as fifty percent complete straight in the source, and the bar fills in as we finish the line. Then we change Frontend to twelve days by editing the number. The chart follows the text just as the text followed the chart. The editor understands PlantUML, so it offers completions and flags mistakes as you type. Pick whichever side you prefer, or mix them, even in the same minute.

## Scene 4: Connect tasks

**On screen:** Hover the Backend bar so its dependency handles show. Drag from the end handle of Backend to the start of API tests. A dependency arrow appears, API tests snaps to start after Backend, and the source gains a `starts at [Backend]'s end` line.

**Narration:**

> Tasks usually depend on each other. We select Backend and drag from its end handle to the start of API tests. The app draws the dependency, moves API tests so it begins when Backend finishes, and records the rule in the source. From now on, if Backend moves, API tests follows.

## Scene 5: Assign one person

**On screen:** Click the Backend bar. In the People section of the inspector, add a row: name "Alice", allocation 100. The bar stays at 8 working days. Source shows `on {Alice:100%}`.

**Narration:**

> Now let's assign people. We open Backend and add Alice at one hundred percent. The bar keeps its length: eight days of work for one person is eight days on the calendar.

## Scene 6: Assign a second person and watch the bar shrink

**On screen:** Add a second row: name "Bob", allocation 100. The Backend bar shrinks from 8 to 4 working days. API tests, which depends on Backend, slides earlier too. Zoom briefly on the bar and the source line `on {Alice:100%} {Bob:100%}`.

**Narration:**

> Here is the part that saves real planning time. We add Bob, also at one hundred percent. The task now has two hundred percent of a person on it, so the same eight days of work takes four days on the calendar. The bar shrinks, and because API tests depends on Backend, it moves earlier as well. The duration you type is the effort. The schedule is calculated from who is working on it.

## Scene 7: Create an over-allocation

**On screen:** Click the Frontend bar, which runs in parallel with Backend. Assign "Alice" at 100 percent. A red "Resource over-allocation" alert appears over the preview naming Alice.

**Narration:**

> Of course, people cannot be in two places at once. Frontend runs at the same time as Backend, so when we assign Alice to it too, the app warns us right away: Alice is over-allocated.

## Scene 8: The Resources panel

**On screen:** Click the Resources button in the toolbar. The Resource workload panel opens with a card for Alice and one for Bob. Alice's card shows Capacity 100%, a red meter, "Peak 200%", her two tasks, and an expanded list of over-allocated dates. Switch the Summary select from Daily to Weekly and back. Click one of the dates to select the affected task. Finally, raise Alice's capacity to 200 and show the alert disappearing.

**Narration:**

> The Resources panel shows the workload for everyone on the project. Alice peaks at two hundred percent against a capacity of one hundred, and each over-booked day is listed. We can view it by day or by week, and clicking a date jumps to the task that causes it. If Alice really can take on more, we raise her capacity and the warning clears. Otherwise, we move a task or reduce her allocation, and the chart updates as we do.

## Scene 9: Version history

**On screen:** Open File > Version history. The dialog lists the saved versions, starting with the initial version from when the document was opened. The Review view compares it with the current working copy and lists every change as a group. Switch to the Source view to show the line-by-line diff, then to the Rendered view to show the changes highlighted on the chart. Type "Team assigned" as a version name and save a checkpoint. It appears in the list. Close the dialog.

**Narration:**

> Everything we just did is recorded. The version history keeps a checkpoint from when the document was opened, and one for every save. Compare the initial version with the working copy and the app lists each change as a reviewable group. The Source view shows the exact lines that changed, and the Rendered view puts the chart before and after side by side. We can also save a named checkpoint at any point, here called Team assigned, and restore or compare against it later.

## Scene 10: Closing

**On screen:** Fit the whole chart in view. Scroll the source editor slowly from top to bottom so the full plan is visible as text. Hold for three seconds.

**Narration:**

> Add tasks, connect them, assign your team, and let the schedule and the workload take care of themselves. Every step is kept in the version history, and what you end up with is a short, readable text file. Commit it, review it, diff it, render it anywhere PlantUML runs, and open it here whenever you want to work visually again. That is PlantUML Ultimate.

---

## Notes for the recording pass

- Scene 3b uses the `is 50% completed` statement, which the parser supports, and the editor's keyword completions in `apps/web/src/gantt-language.ts`. Typing will be paced slowly so the autocomplete popup is visible on camera.
- Scene 6 depends on the effort-divided-by-allocation rule in `apps/web/src/gantt-schedule.ts`. An 8-day task with Alice and Bob both at 100% becomes 4 days. If the template's Backend duration changes, adjust the numbers in the narration.
- Scene 7 needs Backend and Frontend to overlap on the calendar. In the default template both start on 2026-09-05, so assigning Alice to both is enough to trigger the alert.
- Scene 8 assumes the default capacity of 100% per person. Raising Alice to 200% clears the alert because her peak is exactly 200%.
- Recording produces one WebM video file and one AIFF audio clip per scene, plus this script as the subtitle source. Line each clip up with the start of its scene in iMovie or a similar editor.
