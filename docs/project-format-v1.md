# PlantUML Ultimate project format v1

A project is a UTF-8 JSON file named `project.pumlproject` at the project root. Its content is validated by `@plantuml-studio/project-model` and has this fixed top-level shape:

```json
{
  "format": "plantuml-ultimate-project",
  "schemaVersion": 1,
  "projectId": "UUID",
  "revisionId": "UUID",
  "name": "Project name",
  "documents": [],
  "elements": [],
  "links": []
}
```

Version 1 rejects unknown fields and unsupported schema versions. Paths are NFC-normalized, relative POSIX paths and cannot contain traversal, backslashes, drive prefixes, control characters, empty segments, or reserved platform names. Case-folded paths must also be unique.

Documents have independent project UUIDs and retain their source/native formats. Element UUIDs identify explicit Sequence participants, Class entities, and Gantt tasks. Their locators are evidence only: a source hash, exact declaration hash, symbol key, and UTF-16 range. Links use only `represents` (participant to class entity) and `implements` (Gantt task to participant or class entity).

Missing source targets remain valid stored registrations so links can be repaired. Structural errors such as invalid endpoints or references to nonexistent elements/documents invalidate import. Writers serialize document, element, and link arrays in ID order.
