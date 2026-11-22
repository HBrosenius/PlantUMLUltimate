# B3: Shareable read-only snapshots — plan

Status: decided 2026-11-22 (see [section 6](#6-decisions)); S1, S0 and S2 are built. S3 is next. Source: [next steps, B3](next-steps-2026-11-20.md#b3-shareable-read-only-snapshots-and-walkthroughs--value-mediumhigh-effort-m).

## 0. What this is for

People who never open the editor (managers, customers, reviewers) need to see a document's diagrams as they were at a given moment. They should be able to click between them and read the Gantt details, without an account, a running collaboration room, or a copy of the app.

Today there are three partial ways, and none of them fits:

- **Image export** (SVG, PNG, PDF) covers one diagram at a time. Links between diagrams and the Gantt hover details are lost.
- **The collaboration viewer link** needs a live room and the app, and it shows the document as it changes, not a fixed version.
- **The "share" mode of the export dialog** builds an encoded source URL for an external PlantUML renderer. It sends the source to that server, and it only shows a plain render.

## 1. Options

| Option                 | How it works                                                                                                                                                                                                                                                       | Server                                              | Privacy                                                            | Size limit                                                           | Effort                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------- |
| **A. Snapshot file**   | One self-contained `.html` file with every diagram already rendered as SVG, a contents list, working links between diagrams, Gantt details on hover or tap, and a version stamp. Opens offline in any browser and can be attached to an email, a ticket or a wiki. | None                                                | Nothing leaves the machine. The file can carry the source, or not. | Practical up to tens of MB                                           | M                            |
| **B. Link in the URL** | The document is compressed into the URL fragment (`#snapshot=…`). The app opens it in a read-only viewer and renders locally. The fragment is never sent to a server.                                                                                              | Only the static app                                 | Anyone with the link can read the source                           | About 2–8 KB survives chat and mail clients, so only small documents | S, once a viewer mode exists |
| **C. Hosted link**     | The snapshot is uploaded to a Worker (R2 or KV) under an unguessable id, and a short link opens it in the app's viewer.                                                                                                                                            | New storage, retention, deletion and abuse handling | The content is stored by us                                        | Large                                                                | L                            |

**Recommendation: A first, then a read-only viewer mode in the app with B for small documents. C only if user sessions (M5) ask for short links.**

- A delivers the core value with no infrastructure, and it fits the local-first, account-free position.
- It also works where a link can't: attachments, offline and air-gapped reviews, and archives of "what we agreed on".
- C brings back exactly what the strategy avoids: stored user content, retention rules, and a moderation surface.

## 2. What the snapshot file contains (option A)

- **Header:** document name, the snapshot date, the version label when the current version is pinned or named, a short source fingerprint (SHA-256), and "Made with PlantUML Ultimate".
- **Contents:** one entry per diagram, with its kind and title. On a phone it collapses into a menu.
- **Diagrams:** each rendered SVG from the same pipeline and decorations as image export (theme, Jira markers, link icons). Pan and zoom use a small inline script, and the page still reads without scripts.
- **Links:**
  - Connections between diagrams in the document (the `represents` and `implements` links, and in-document `[[…]]` links) become in-page anchors.
  - External `[[url]]` links stay clickable, limited to `http:`, `https:` and `mailto:`.
- **Gantt details:** each task's hover card (dates, duration, progress, resources, dependencies, Jira key) is embedded as data. It shows on hover or focus, and on tap on touch screens.
- **Optional source:** an "Include source" checkbox, off by default. When on, the file embeds the portable document so "Open in PlantUML Ultimate" can import it again. When off, the file holds only rendered output, which is the safe default for sharing outside the team.
- **Safety:**
  - A strict CSP meta tag: no network access, inline script and style only.
  - SVG output is sanitised again before embedding: no `<script>` and no event attributes from diagram text.
  - No fonts or images from the network, and no tracking.

## 3. Walkthroughs (dropped)

The next-steps list paired snapshots with a step-through for Sequence diagrams with captions. It was dropped on 2026-11-22: it needs its own authoring UI and caption syntax, and snapshots carry the value on their own.

## 4. Slices

| Slice                                    | Delivers                                                                                                                                                                          | Notes                                                                                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S0. Render every diagram**             | A queue that renders each diagram in the document in turn (with the active theme), and reuses results that are already current. Progress and cancel.                              | I found no existing way to render diagrams other than the active one, so this is the main technical risk. Measure on the 200-task Gantt fixture and on a 10-diagram document. |
| **S1. Snapshot file, single diagram**    | "Export → Snapshot (HTML)" for the active diagram: header, SVG, pan and zoom, CSP, sanitising, external links.                                                                    | Unit tests for the HTML builder (escaping, CSP, link filtering). An e2e test that opens the saved file with `file://` and checks that no network request happens.             |
| **S2. Whole document**                   | All diagrams with contents, in-page links between them, and the version stamp.                                                                                                    | Builds on S0.                                                                                                                                                                 |
| **S3. Gantt details and touch**          | Embedded hover cards for Gantt tasks, with tap support and keyboard focus.                                                                                                        | Reuses the Gantt hover data.                                                                                                                                                  |
| **S4. Include source and open again**    | The opt-in portable document, and "Open in PlantUML Ultimate" (download the `.pumlu`, or open the app with the file when it is installed as a PWA).                               | The privacy wording is reviewed before shipping.                                                                                                                              |
| **S5. Read-only viewer and small links** | A viewer mode in the app (no editing chrome, no saving) that opens a snapshot file, and `#snapshot=` links when the document fits within the limit. Otherwise it offers the file. | Optional. Decide after S1–S3 have been used.                                                                                                                                  |

S1 can start before S0 is finished. S3 and S4 don't depend on each other.

## 5. Out of scope

- Hosted short links (option C), accounts, and access control.
- Comments on snapshots. The collaboration room covers live review.
- Exporting a whole project (several `.pumlu` files). The snapshot covers one document.
- Sequence walkthroughs (section 3).

## 6. Decisions

Decided on 2026-11-22:

1. **The snapshot file comes first (option A).** The in-app viewer with small links (S5) waits until S1–S3 have been used. Hosted links (option C) are out.
2. **Source is opt-in.** It is off by default, and a checkbox includes the portable document so the file can be opened in the app again (S4).
3. **The first PR is S1, the active diagram only.** It settles the file format, the safety rules and the version stamp before S0 takes on rendering the other diagrams.
4. **Walkthroughs are dropped**, not deferred.
