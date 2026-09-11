# Connected project diagrams

A PlantUML Ultimate project keeps related diagrams and their semantic links in one project manifest. Projects can be stored as a writable folder or as a portable ZIP snapshot.

## Create and open

Use **File → New project…** to create a folder project. The browser asks you to select the destination folder and creates `project.pumlproject` plus a starter diagram in `diagrams/`.

Use **File → New ZIP project…** for a single downloadable `.pumlproject.zip` file. Use **File → Open ZIP Project…** to reopen it. ZIP projects are snapshots: saving downloads a new archive rather than overwriting the previously downloaded file.

Use **File → Open project…** to select an existing folder project. The browser must grant read/write permission for reliable saves.

## Connections and repairs

Open **Diagram connections** from the project panel. Register diagram items, then connect compatible items with `represents` or `implements`. The panel shows backlinks and reverse impact.

After a rename or external edit, an unresolved item is shown conservatively. Use the suggested repair candidates only after confirming the item is the same semantic object; the app never silently connects a similarly named item.

## Saving and recovery

**Save project** writes changed project members first and the manifest last. A short-lived recovery journal records the complete intended save. If the browser or device interrupts a write, reopening the folder replays that journal before the project is read.

If a changed member was modified outside PlantUML Ultimate after the project was opened, save stops instead of overwriting it. Reopen the project and resolve the change first.

Only tabs opened through the project are project members. Saving a project never writes an unrelated open tab with the same file name. A tab is marked clean only if it still contains the source that was saved; edits made during a save remain dirty.

Native `.pumlu` members retain their portable document metadata, history, and document identity when saved. When a project contains an encrypted native member, the app asks for its password while opening the project and re-saves it using the same encryption key. Canceling the prompt keeps that member locked; it is never flattened to plain text.

## Privacy

Folder projects are handled through the browser’s file-system permission selected by you. ZIP projects are processed locally and downloaded by the browser. Project links, sources, and recovery journals are not uploaded by the project feature.
