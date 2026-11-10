# PlantUML Ultimate: feature strategy for a standout product

Prepared: 2026-09-07. Status: proposed product direction, not an implementation commitment.

## The product to aim for

**An engineering workspace where diagrams explain a change, show its consequences, and connect the decision to the delivery plan.**

The strongest opportunity is to become the daily diagramming tool for software teams that keep technical documentation in Git and coordinate implementation in Jira. Developers should be able to work in text, architects in diagrams, and delivery leads in schedules while reviewing the same proposed change.

The flagship experience:

> Open a repository's diagrams. Propose a service change. See the affected interfaces, interactions, and linked delivery tasks. Review the semantic difference, compare implementation scenarios, and export an ordinary PlantUML patch for review.

This combines the app's existing strengths: source-first visual editing, six diagram types, local rendering, version history, collaboration, Gantt analysis, and Jira synchronization. It is a hypothesis about a compelling product position, not a claim that competitors cannot reproduce it or that market leadership is guaranteed.

This document complements [the next-steps plan](next-steps.md). Reliability work remains a release prerequisite, but the feature programme below supplies the larger product ambition.

## Where competitors already set the bar

Official product documentation reviewed on 2026-09-07 gives the following directional comparison. This is not an exhaustive hands-on comparison, and an unmentioned feature should not be read as absent.

| Competitor              | Documented strengths                                                                                                                                                                                                 | Implication for this app                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Eraser                  | Diagram-as-code, AI generation from repositories, and diagram maintenance associated with code changes. [Overview](https://docs.eraser.io/what-is-eraser), [Eraserbot](https://docs.eraser.io/eraserbot)             | “AI makes diagrams from code” is already competitive territory. Emphasize precise, reviewable edits and connections to implementation planning. |
| Mermaid Chart / Mermaid | Visual flowchart editing synchronized with source, plus inline AI editing. [Visual editor](https://mermaid.ai/products/visual-editor/), [AI editing](https://mermaid.ai/docs/build-and-edit/add-and-edit-with-ai)    | Text + canvas + AI is an expected combination. Source fidelity and deeper engineering workflows must earn the switch.                           |
| draw.io                 | Offline editing and integrations with storage and documentation platforms. [Offline](https://www.drawio.com/docs/manual/editor/offline/), [Editor overview](https://www.drawio.com/docs/getting-started/)            | Offline support alone is not a differentiator. Pair local ownership with semantic review and analysis.                                          |
| IcePanel                | Structured, collaborative C4 architecture modelling. [Getting started](https://docs.icepanel.io/getting-started)                                                                                                     | Connected architecture views are valuable but already established. Connect them to ordinary PlantUML files and delivery changes.                |
| Structurizr             | Architecture models and views described through its DSL, with export options. [Getting started](https://docs.structurizr.com/getting-started)                                                                        | Multiple views of a model are not a new category. Make adoption incremental for existing PlantUML repositories.                                 |
| Lucidchart              | Team collaboration and linking external data to diagrams. [Teams](https://www.lucidchart.com/pages/teams), [Data linking](https://help.lucid.co/hc/en-us/articles/16493391394068-Link-data-to-a-Lucidchart-document) | Competing on shape count or generic collaboration would dilute focus. Win specific engineering tasks.                                           |

**Strategic conclusion:** pursue a better complete workflow for engineering change, rather than collecting isolated features that look impressive in a comparison table.

## Target users and reasons to switch

1. **Primary: developers and technical leads maintaining PlantUML in Git.** They need diagram changes to be as reviewable and maintainable as code changes.
2. **Secondary: architects coordinating changes across services.** They need consistent views, explicit dependencies, and traceable decisions.
3. **Adjacent: engineering delivery leads using Jira.** They need to understand how technical choices affect dates, dependencies, and capacity.

Start with the first group. Do not require accounts, a migrated repository, or a complete architecture model before the app is useful. Let one existing `.puml` file provide a successful first session.

## Ranked feature sets

Effort describes a useful first slice for one experienced full-time engineer: **M ≈ 2–4 weeks, L ≈ 4–8 weeks, XL ≈ 8–16+ weeks**. Estimates exclude substantial prerequisite remediation and must be revised after technical spikes. Ranking reflects strategic judgment, not measured customer demand.

| Rank | Feature set                                    | Why it could earn repeat use                              | First-slice effort | Sequence                                                      |
| ---- | ---------------------------------------------- | --------------------------------------------------------- | ------------------ | ------------------------------------------------------------- |
| 1    | Semantic diagram review                        | Makes a diagram change understandable and safe to accept  | L                  | Build first                                                   |
| 2    | Connected project diagrams and impact analysis | Makes each additional diagram more useful                 | XL                 | Build the identity/index foundation, then one linked workflow |
| 3    | Delivery scenario lab                          | Connects technical decisions to practical consequences    | L                  | Follow review; build on existing Gantt analysis               |
| 4    | Evidence-backed diagram assistant              | Speeds up real edits while keeping users in control       | L                  | After the patch/validation contract                           |
| 5    | Repository checks and drift detection          | Keeps diagrams useful after the initial authoring session | XL                 | Start with deterministic checks                               |
| 6    | Interactive architecture walkthroughs          | Makes diagrams useful to people who do not edit them      | M                  | Follow linked views                                           |
| 7    | Reusable engineering playbooks                 | Helps teams start with a useful workflow immediately      | M                  | Ship a small curated set early                                |
| 8    | Portable, private team workspaces              | Makes the product adoptable by more demanding teams       | XL                 | Validate demand before enterprise expansion                   |

## 1. Semantic diagram review

**User promise:** “Show me what this change means, and let me accept the right parts.”

### Feature set

- Compare two versions with stable visual highlighting for added, removed, renamed, moved, and modified objects and relationships.
- Show a readable change list such as “Payment API now calls Fraud Service” or “Release moved three working days.”
- Select a change in the list to highlight its diagram geometry and exact source edits.
- Group dependent edits into valid transactions; accept or reject a group without breaking declarations or references.
- Explain conflicts in terms of objects and fields during a three-way comparison, retaining raw source as the fallback.
- Export a source patch plus a standalone visual review report; add repository-provider review integration later.
- Add comments anchored to semantic objects and source revisions, with a clear stale-anchor state after subsequent edits.

**First release:** Sequence and Gantt comparisons using existing history and source/rendered comparison as the starting point. Accept/reject applies to proposed local patches before Git hosting integration.

**Standout demo:** two people edit a participant name and a message independently. The reviewer sees both changes in context and accepts a valid combined result without searching a large textual diff.

**Success gate:** on a curated set of supported edits, the change list is correct, applying accepted groups reproduces the expected source, and five pilot reviewers complete comparison tasks faster than with their current workflow.

**Key constraint:** unsupported syntax must be labelled as an unclassified source change. Never imply complete semantic coverage when the parser only understands part of a document.

## 2. Connected project diagrams and impact analysis

**User promise:** “Change one concept and find every diagram and plan that depends on it.”

### Feature set

- A project navigator for related `.puml` files, supporting local folder access where available and ZIP import/export elsewhere.
- Explicit links between a service/class, a Sequence participant, a Use Case, a WBS deliverable, and a Gantt task.
- A project-wide symbol catalogue with search, backlinks, ownership, and links to repository paths, ADRs, and Jira issues.
- Impact queries: “Which sequences use this interface?” and “Which delivery tasks implement this proposed change?”
- Preview cross-file rename/refactor operations and apply them as a single recoverable transaction.
- Saved views filtered by service, feature, owner, release, or dependency path.
- Later: a first-class C4 workflow with locally bundled, versioned assets compatible with the renderer's external-resource restrictions.

**First release:** manually link a Sequence participant to a Class entity and a Gantt task. Provide navigation and reverse-impact lookup. Defer automatic entity matching and arbitrary view generation.

**Standout demo:** select a service scheduled for replacement and immediately inspect its linked interactions and delivery work.

**Success gate:** links survive supported renames, broken links are visible, multi-file edits recover safely after interruption, and exported PlantUML remains usable independently.

**Architecture decision:** PlantUML remains authoritative for each diagram. Store optional identity and relationship metadata in a documented project sidecar; keep the search/impact index derived and rebuildable. Do not silently create a second authoritative copy of diagram semantics. Show inferred links separately from confirmed links.

## 3. Delivery scenario lab

**User promise:** “Try the change before committing the team to it.”

The app already has Gantt scheduling, resource workload, critical-path logic, and baseline comparison machinery. Extend those into a deliberate scenario workflow rather than presenting those existing capabilities as new.

### Feature set

- Named scenario branches such as “current plan,” “reduce scope,” and “add capacity.”
- Side-by-side comparisons of milestone movement, critical paths, capacity conflicts, and changed assumptions.
- What-if controls for task duration, dependencies, availability, and calendar exceptions.
- A cause trace explaining why a milestone moved, linked to the exact dependency and calendar calculation.
- Link architecture changes from the project graph to affected tasks; users decide which schedule assumptions change.
- Promote a chosen scenario through a reviewable source patch, followed by the existing Jira synchronization review.
- Later: explicit duration ranges and simulation, only once a defined scheduling model and suitable inputs support it.

**First release:** two named scenarios, deterministic recomputation, side-by-side milestone/workload differences, and patch promotion.

**Standout demo:** move an API dependency by a week, see why the release moves, then compare a scope reduction before updating Jira.

**Success gate:** comparisons are reproducible from the same inputs, scenarios never mutate the baseline implicitly, and promotion changes only the selected source and approved Jira fields.

**Key constraint:** a diagram dependency does not automatically imply a task dependency. Require explicit mappings and display assumptions. Do not present simulated probabilities as delivery guarantees.

## 4. Evidence-backed diagram assistant

**User promise:** “Help me make a precise change I can inspect and undo.”

### Feature set

- Selection-scoped commands: add a failure path, extract a reusable interaction, explain a dependency, or repair a diagnostic.
- Generate a proposed PlantUML patch with a plain-language explanation and references to supplied repository files or specifications.
- Parse, validate, and render the proposal before offering it for acceptance.
- Show semantic and source differences; accept valid groups and use the existing undo system.
- Ask for missing domain information instead of inventing services, requirements, or delivery dates.
- Support an explicit cloud-provider connection and, later, compatible local inference. Show what context will leave the device.
- Expose the same bounded edit/validation commands to an agent integration after the internal contract is stable.

**First release:** Sequence editing from the current selection and user-supplied context. No automatic repository uploads and no autonomous publishing.

**Standout demo:** “Add timeout handling to this call.” The app previews a valid change to the selected interaction and preserves surrounding comments and syntax.

**Success gate:** benchmark tasks have valid output or an actionable failure, all edits are reviewable/reversible, and users can see which claims came from evidence versus a suggestion. Track task completion and accepted edits rather than raw generation volume.

**Differentiation hypothesis:** trustworthy patch quality and source preservation can matter more than generating a whole diagram quickly. Test this directly against users' current AI workflow.

## 5. Repository checks and drift detection

**User promise:** “Tell me when a diagram needs attention, with evidence.”

### Feature set

- Repository-ready CLI commands for validation, rendering, semantic comparison, and project-link checks.
- CI reports containing a visual change summary and broken references.
- Versioned rules for team conventions, required owners, unsupported syntax, or forbidden dependency patterns.
- Evidence links from diagram elements to code paths, OpenAPI operations, or schema objects.
- Deterministic checks for deleted paths and changed interfaces; later, suggestions based on code changes.
- Regenerate only explicitly machine-owned regions, keeping hand-authored content intact.

**First release:** a CLI that checks `.puml` files and project links and writes a standalone report. Add GitHub checks after the local result is useful; other providers follow demand.

**Standout demo:** a pull request removes a referenced API operation and receives a diagram-attention report pointing to the affected interaction.

**Success gate:** known fixture changes produce the expected alerts, unchanged inputs produce stable output, and pilot teams find alerts actionable. Choose alert thresholds from observed false positives.

**Key constraint:** code does not reveal all architectural intent. Report evidence of possible drift rather than asserting that an inferred design is correct. CLI rendering also needs a deliberate solution for the current DOM-dependent engine.

## 6. Interactive architecture walkthroughs

**User promise:** “Explain this system without making everyone learn the editor.”

- Step through Sequence interactions and highlight linked components in adjacent diagrams.
- Save a narrated path through project views with captions, decision links, and source references.
- Share a version-pinned, read-only walkthrough or export an offline HTML bundle.
- Offer keyboard navigation, reduced-motion behavior, search, and a printable summary.

**First release:** a saved Sequence walkthrough with captions and links to related diagrams. This illustrates authored behavior; it is not runtime execution or verification.

**Success gate:** a new teammate can answer a defined set of system questions using the walkthrough without opening the editor, and the export works offline without exposing unpublished project data.

## 7. Reusable engineering playbooks

**User promise:** “Start with the diagrams and checks needed for the job.”

- Curated project starters: API rollout, service extraction, incident explanation, and release planning.
- Each starter combines compatible diagrams, useful prompts, review questions, and optional linked planning tasks.
- Parameterized snippets and reusable styles that preserve ordinary PlantUML output.
- A guided import flow that diagnoses an existing repository and explains unsupported syntax without rewriting it.
- Later: a versioned team library, with previews and explicit upgrades.

**First release:** three locally bundled playbooks and a five-minute path from an existing `.puml` file to a reviewed change. Avoid building a marketplace before repeat usage exists.

**Success gate:** first-time users finish a useful task without assistance, and saved output remains readable outside the app.

## 8. Portable, private team workspaces

**User promise:** “Adopt the workflow without surrendering control of the files.”

- A documented portable project bundle containing source, optional metadata, and review artefacts.
- Explicit local-only operation and clear network activity for optional services.
- Reproducible self-hosting for collaboration and integration services.
- Later, demand-led additions: authenticated teams, project permissions, review audit history, retention controls, and organizational identity integration.
- Scoped, revocable integration credentials and administrative diagnostics that exclude document contents by default.

**First release:** portable projects and a tested self-hosting guide. Keep local editing account-free. Existing capability-link collaboration is a foundation, not equivalent to organization-level access control.

**Success gate:** an exported project can be restored on another machine, local workflows operate without a service, and hosted features have documented boundaries and deletion behavior.

## A coherent first flagship release

Call the proposed release **Engineering Change Review**. Deliver one convincing loop before the full platform:

1. Import two versions of an existing Sequence diagram.
2. Inspect semantic differences with matching source highlights.
3. Accept valid change groups into a recoverable local document.
4. Link one changed participant to a Gantt task.
5. Compare a named delivery scenario using an explicitly chosen duration change.
6. Export the PlantUML patch and an offline review report.

This is the narrow intersection of feature sets 1–3. Do not require AI, accounts, repository OAuth, or a general architecture model for this release. That keeps its value demonstrable with the app's strongest existing foundations.

### Delivery stages

| Stage                                                       | Deliverable                                                                           | Gate before expanding                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Discovery, approximately 1–2 weeks                          | Interviews and a clickable or working review prototype with 5–8 target users          | At least three bring a real diagram-change problem and agree to pilot it. |
| Technical proof, approximately 2–3 weeks                    | Semantic matching, transaction validation, and recoverable review on a fixture corpus | Supported changes round-trip correctly; unsupported changes are explicit. |
| Review beta, approximately 4–6 weeks                        | Sequence/Gantt semantic review and portable reports                                   | Pilot teams complete real reviews and return for another one.             |
| Connected planning beta, approximately 4–8 additional weeks | Explicit cross-file links and two-scenario comparison                                 | Users find the linked plan useful without extensive setup.                |
| Subsequent releases                                         | Assistant, repository checks, and walkthroughs                                        | Prioritize using observed recurring work and willingness to adopt.        |

These are rough sequential planning ranges, not additive estimates for all eight feature sets. Shared foundations overlap; unknown parser, identity, and multi-file transaction work could extend them.

## Product and engineering principles

- Preserve portable PlantUML and unknown syntax; never make export a degraded afterthought.
- Use the same validated source-edit transaction for visual actions, review, refactoring, scenarios, and AI proposals.
- Keep project identity explicit and versioned. Distinguish a rename from deletion/recreation conservatively.
- Treat diagram models, indexes, and calculations as derived state; document the optional metadata contract.
- Separate deterministic facts from inferred relationships and suggested changes.
- Design linked edits, comments, and scenario promotion for concurrency and recovery before adding automation.
- Use the reliability plan's release gates for every increment.

## How to judge whether this is working

**Primary measure:** teams returning weekly to complete a real diagram-change review. This is closer to lasting value than diagrams generated or accounts created.

Proposed pilot gates, to refine after measuring a baseline:

- At least three of five pilot teams complete a second review within two weeks.
- Median time to correctly explain a diagram change improves by at least 30% on comparable tasks.
- No silent source loss or unapproved external writes in the acceptance corpus and pilot release.
- At least three teams can explain a concrete reason to use this workflow instead of their existing editor and Git diff.

Measure with consent through observed sessions and voluntary feedback before adding product telemetry. Stop or reduce scope when users admire a demo but do not return with real work. If cross-diagram setup is the obstacle, ship review as an independently useful product first.

## Features to resist for now

- A generic infinite whiteboard competing on shapes and sticky notes.
- Support for every diagram language or promises of lossless cross-language conversion.
- A broad integration marketplace before one repository/Jira workflow earns repeat usage.
- A chat panel that regenerates entire documents without precise edit review.
- Automatic architecture-to-schedule inference presented as fact.
- An enterprise administration programme before teams ask to adopt the core workflow.

The durable advantage to pursue is a dependable combination: **source fidelity, semantic review, connected engineering context, and explainable delivery consequences**. Build that combination in small usable slices, and use actual switching behavior to decide whether it deserves further investment.
