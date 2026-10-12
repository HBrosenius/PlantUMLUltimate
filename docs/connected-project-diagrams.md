# Connected project diagrams

A PlantUML Ultimate document keeps related diagrams and their semantic links in one `.pumlu` file. See [single-file documents](single-file-projects.md) for the current create, open and save workflow, and [plan implementation status](plan-status-2026-10-11.md) for the delivered scope.

## Create and open

Use **File → New → Document** to create a document. Use its navigator to add, import, rename or delete diagrams. Save, Save As and Cmd/Ctrl-S save the complete document.

Legacy folder and ZIP projects are compatibility imports under **File → Open**. Their contents are staged and validated before conversion; save the imported result as a normal single-file document.

## Connections and repairs

Open **Diagram connections** from the project panel. Register diagram items, then connect compatible items with `represents` or `implements`. The panel shows backlinks and reverse impact.

After a rename or external edit, an unresolved item is shown conservatively. Use the suggested repair candidates only after confirming the item is the same semantic object; the app never silently connects a similarly named item.

## Saving and recovery

The following describes the legacy folder save implementation retained in the code. Current single-file save and recovery behavior is documented in [single-file documents](single-file-projects.md) and [persistence and files](persistence-and-files.md); these legacy actions are not the everyday document workflow.

**Save project** writes changed project members first and the manifest last. A short-lived recovery journal records the complete intended save. If the browser or device interrupts a write, reopening the folder replays that journal before the project is read.

If a changed member was modified outside PlantUML Ultimate after the project was opened, save stops instead of overwriting it. Reopen the project and resolve the change first.

Only tabs opened through the project are project members. Saving a project never writes an unrelated open tab with the same file name. A tab is marked clean only if it still contains the source that was saved; edits made during a save remain dirty.

Native `.pumlu` members retain their portable document metadata, history, and document identity when saved. When a project contains an encrypted native member, the app asks for its password while opening the project and re-saves it using the same encryption key. Canceling the prompt keeps that member locked; it is never flattened to plain text.

## Privacy

Legacy folder and ZIP imports are processed locally. Project links, sources, and recovery records are not uploaded by the project feature.
