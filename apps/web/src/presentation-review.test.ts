// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  emptyPresentationReview,
  loadPresentationReview,
  presentationTargets,
  resolvePresentationAnchor,
  savePresentationReview,
  type PresentationDocument,
} from "./presentation-review";
const source = "@startgantt\nProject starts 2026-10-02\n[Build] as [b] lasts 2 days\n@endgantt";
const doc: PresentationDocument = { id: "one", name: "Plan", kind: "gantt", source };
beforeEach(() => localStorage.clear());
describe("revision-aware personal review", () => {
  it("keeps alias anchors through label, duration and preceding source edits with original context", () => {
    const anchor = presentationTargets(doc)[0]!;
    expect(resolvePresentationAnchor(doc, anchor).state).toBe("Current");
    const changed = {
      ...doc,
      source: source
        .replace("[Build]", "[Compile]")
        .replace("2 days", "3 days")
        .replace("Project starts", "' preceding comment\nProject starts"),
    };
    const resolved = resolvePresentationAnchor(changed, anchor);
    expect(resolved.state).toBe("Updated");
    expect(resolved.target?.label).toBe("Compile");
    expect(anchor.excerpt).toContain("Build");
    expect(anchor.source).toBe(source);
  });
  it("does not guess a replacement after alias removal or deletion", () => {
    const anchor = presentationTargets(doc)[0]!;
    expect(resolvePresentationAnchor({ ...doc, source: source.replace("[b]", "[other]") }, anchor).state).toBe(
      "Missing",
    );
    expect(
      resolvePresentationAnchor({ ...doc, source: source.replace("[Build] as [b] lasts 2 days", "") }, anchor).state,
    ).toBe("Missing");
  });
  it("refuses duplicate alias candidates", () => {
    const anchor = presentationTargets(doc)[0]!;
    const duplicate = { ...doc, source: source.replace("@endgantt", "[Other] as [b] lasts 1 day\n@endgantt") };
    expect(resolvePresentationAnchor(duplicate, anchor).state).toBe("Ambiguous");
  });
  it("marks revision-bound anchors stale after edits rather than following parser indices", () => {
    const sequence: PresentationDocument = {
      ...doc,
      kind: "sequence",
      source: "@startuml\nparticipant A\nparticipant B\nA -> B: Send\n@enduml",
    };
    const anchor = presentationTargets(sequence).find((item) => item.label === "Send")!;
    expect(anchor).toBeDefined();
    expect(
      resolvePresentationAnchor(
        { ...sequence, source: sequence.source.replace("A -> B: Send", "B -> A: Earlier\nA -> B: Send") },
        anchor,
      ).state,
    ).toBe("Stale");
  });
  it("round trips notes and named views without changing source or leaking to another document", () => {
    const data = emptyPresentationReview(),
      anchor = presentationTargets(doc)[0]!;
    data.views.push({ id: "v", name: "Build", steps: [anchor], zoom: 1.5 });
    data.notes.push({
      id: "n",
      text: "Check this estimate",
      createdAt: "2026-10-10T12:00:00Z",
      anchor,
      resolved: false,
    });
    savePresentationReview(doc.id, data);
    expect(loadPresentationReview(doc.id)).toEqual(data);
    expect(loadPresentationReview("other")).toEqual(emptyPresentationReview());
    expect(doc.source).toBe(source);
  });
  it("refuses incompatible persisted data and propagates storage failures", () => {
    localStorage.setItem("plantuml-presentation-review-v1:one", '{"schemaVersion":2,"views":[],"notes":[]}');
    expect(() => loadPresentationReview("one")).toThrow("Unsupported");
  });
});
