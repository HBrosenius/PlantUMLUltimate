# Persistence and files

The current workspace is recovered from IndexedDB after an unexpected reload. Writes are debounced by 350 ms and include source, filename, dirty state, view mode, split position, zoom, cursor position, and theme. If IndexedDB is unavailable because of browser policy, the application falls back to local storage.

Open accepts portable `.pumlu` documents and legacy `.puml`/`.plantuml` source. Browsers with the File System Access API use native Open, Save, and Save As handles. Other browsers use a file upload for Open and downloads for Save As. Native file handles are intentionally held only for the current browser session. Encrypted documents keep unlocked plaintext only in memory and must be saved before closing.

SVG export uses the most recent successful canonical PlantUML render. PlantUML source export always downloads the current source.
