import { describe, expect, it } from "vitest";
import type { PortableProject } from "@plantuml-studio/document-format";
import { EmbeddedProjectSaveCoordinator } from "./embedded-project-save";

const project = { projectId: "project", schemaVersion: 2 } as PortableProject;

describe("embedded project saves", () => {
  it("keeps a newer revision dirty after writing an earlier snapshot", async () => {
    let revision = 1;
    const writes: Uint8Array[] = [];
    const result = await new EmbeddedProjectSaveCoordinator().save(
      { projectId: "project", revision, project },
      async () => {
        revision = 2;
        return new Uint8Array([1]);
      },
      {
        name: "project.pumlu",
        async getFile() {
          return new File([], "project.pumlu");
        },
        async createWritable() {
          return {
            async write(bytes: Uint8Array) {
              writes.push(bytes);
            },
            async close() {},
          };
        },
      },
      () => revision,
    );
    expect(result.clean).toBe(false);
    expect(writes).toEqual([new Uint8Array([1])]);
  });
});
