# Feature clips: Diagram outline and Delivery Scenario Lab

Two separate short videos, one per feature. Each clip is split into numbered beats. A beat is one on-screen action with the sentence or two that goes with it.

## How to produce the voice

Generate sentence-timed MimikaStudio narration with Kokoro Emma (`bf_emma`), retaining WAV masters and 192 kbps MP3 listening copies. Name the files `outline.mp3` and `scenario-lab.mp3`. Once I have the files I will measure them and pace each beat of the recording to the real speech, using the word share of each beat to place it. If you want tighter sync, generate one file per beat instead, named `outline-1.mp3`, `outline-2.mp3`, and so on, and I will use the exact boundaries.

Both clips run from the same prepared Gantt plan so they feel like one product. Estimated read time is about 65 seconds for the outline clip and about 90 seconds for the scenario lab clip at a normal narration pace.

---

## Clip 1: Diagram outline

Estimated 130 words, about 65 seconds.

### Beat 1. The problem

**On screen:** A Gantt plan with about a dozen tasks, several people, and dependencies, in split view with the source on the left. The mouse hovers over the chart without clicking.

**Narration:**

> As a plan grows, finding one task, one person, or one dependency means scrolling the chart or reading the source. The diagram outline gives you a single place to search.

### Beat 2. Open the outline

**On screen:** Open the View tab and click Outline. The Diagram outline dialog opens with a search field focused, a type filter set to All types, and a list of every element with its type and source line.

**Narration:**

> Open it from the View tab, or with Command Shift O. Every element in the diagram is listed with its type and the line it lives on.

### Beat 3. Search and jump

**On screen:** Type "Ali" in the search field. The list narrows to Alice. Press Enter. The dialog closes, the source editor scrolls to Alice's first line and highlights it, and the matching tasks light up in the chart.

**Narration:**

> Start typing and the list narrows as you go. Press Enter, and you land on that element in both the source and the diagram at the same time.

### Beat 4. Filter by type and open an inspector

**On screen:** Reopen the outline. Change the type filter to Dependency. Only the dependency entries remain. Click one. The dialog closes and the dependency inspector opens on the right with that dependency selected.

**Narration:**

> Filter by type when you know what you are looking for. Picking an entry does not just show it, it opens the right inspector, so you can edit straight away.

### Beat 5. Works everywhere

**On screen:** Switch to a second tab with a sequence diagram. Press Command Shift O. The outline lists participants and messages. Press Escape.

**Narration:**

> The outline works the same way in every diagram kind, from Gantt tasks and people to sequence participants, classes, and WBS nodes. One shortcut, wherever you are.

---

## Clip 2: Delivery Scenario Lab

Estimated 190 words, about 90 seconds.

### Beat 1. The question

**On screen:** The same Gantt plan. Architecture leads to Backend, Backend leads to Testing, and a Release milestone sits at the end of Testing. Frontend runs in parallel and is assigned to Alice. The mouse rests on the Release milestone.

**Narration:**

> Every plan gets the same question: what happens to the release if something slips? You want to try it without touching the real plan. That is what the Delivery Scenario Lab is for.

### Beat 2. Open the lab

**On screen:** Open the Plan tab and choose What-if scenario. Switch to Rendered preview: the current plan sits read-only on the left and the editable scenario copy on the right. The impact strip below shows zero tasks changed and zero milestones moved.

**Narration:**

> The lab takes a snapshot of the current plan and gives you a scenario copy to experiment with. Nothing you do here changes the document until you decide to apply it.

### Beat 3. Make a change visually

**On screen:** In the scenario preview, select the Backend bar and drag its end handle four days to the right. Testing and the Release milestone move with it. The impact strip updates: tasks changed, one milestone moved, and the project duration delta turns positive.

**Narration:**

> Say Backend needs four more days. Drag the bar in the scenario and everything downstream follows. The impact summary updates immediately: the release moves, and the project gets longer.

### Beat 4. Understand why

**On screen:** Scroll the impact panel to the Milestones section. Release shows the old date, the new date, and the day delta, with a cause trace pointing at the Backend duration change. Below it, Schedule changes lists Backend and Testing.

**Narration:**

> The lab does not just say the release moved. It traces the movement back to the change that caused it, so you can explain the slip, not just report it.

### Beat 5. Try a fix

**On screen:** Switch to Edit scenario. Pick Backend in the task selector and add Bob as a second resource at one hundred percent. Backend shortens, and the Release milestone moves back. The impact strip shows the duration delta shrinking to zero or below.

**Narration:**

> Now try a fix in the same scenario. Add Bob to Backend and the extra effort is absorbed. The release date comes back. You have tested a problem and its remedy without editing the plan.

### Beat 6. Review and apply

**On screen:** Click Review and apply. The Review source patch view lists only the changed PlantUML lines. Click Apply scenario. The dialog closes and the source editor shows the new lines in the real document. Press Undo once to show the change reverting, then Redo.

**Narration:**

> When you are happy, review the patch. Only the changed lines will replace the current plan. Apply it, and it becomes one undoable edit in the document, tracked in the version history like everything else.

### Beat 7. Close

**On screen:** Rest the mouse on the Release milestone in the updated plan and hold for two seconds.

**Narration:**

> Ask what if, see the answer, and keep the plan you actually want.

---

## Notes for the recording pass

- Both features are on the `main` branch. The recording will run from a worktree of `origin/main`, not from the current feature branch.
- The prepared plan for both clips needs a milestone that depends on Testing, and Testing must depend on Backend, so that a Backend change visibly moves the release. I will add these to the default template before recording and show the source briefly in clip 2, beat 1.
- The outline's Dependency entries and inspector opening come from the "Expand diagram outline navigation" commit. If the dependency filter is not available in the build I record from, beat 4 will use the Person filter and open the task inspector instead, and I will adjust the narration to match.
