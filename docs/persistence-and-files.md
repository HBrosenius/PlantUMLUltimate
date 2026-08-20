# Persistence and files

The current workspace is recovered from IndexedDB after an unexpected reload. Writes are debounced by 350 ms and include source, filename, dirty state, view mode, split position, zoom, cursor position, and theme. If IndexedDB is unavailable because of browser policy, the application falls back to local storage.

Open accepts `.puml` and `.plantuml`. Browsers with the File System Access API use native Open, Save, and Save As handles. Other browsers use a file upload for Open and downloads for Save As. Native file handles are intentionally held only for the current browser session; source recovery does not depend on retaining file-system permission.

SVG export uses the most recent successful canonical PlantUML render. PlantUML source export always downloads the current source.
