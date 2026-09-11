import { describe, expect, it } from "vitest";
import type { PortableProject } from "@plantuml-studio/document-format";
import { embeddedProjectRecoveryRecord, parseEmbeddedProjectRecovery } from "./embedded-project-session";

const project = {
  schemaVersion: 2,
  projectId: "11111111-1111-4111-8111-111111111111",
  revisionId: "22222222-2222-4222-8222-222222222222",
  name: "Private roadmap",
  savedAt: "2026-09-11T10:00:00.000Z",
  diagrams: [],
  elements: [],
  links: [],
} as PortableProject;

describe("embedded project recovery", () => {
  it("persists a complete validated project only when it is unencrypted", () => {
    const record = embeddedProjectRecoveryRecord(project, false);
    expect(parseEmbeddedProjectRecovery(record)).toEqual({ state: "unlocked", project });
  });

  it("uses an opaque marker for encrypted projects", () => {
    const record = embeddedProjectRecoveryRecord(project, true);
    expect(record).toEqual({ kind: "plantuml-studio-embedded-project", version: 1, encrypted: true });
    expect(JSON.stringify(record)).not.toContain("Private roadmap");
    expect(JSON.stringify(record)).not.toContain(project.projectId);
    expect(parseEmbeddedProjectRecovery(record)).toEqual({ state: "locked" });
  });

  it("rejects malformed unencrypted recovery rather than partially restoring a project", () => {
    expect(
      parseEmbeddedProjectRecovery({
        kind: "plantuml-studio-embedded-project",
        version: 1,
        encrypted: false,
        project: { ...project, diagrams: "not an array" },
      }),
    ).toBeUndefined();
  });
});
