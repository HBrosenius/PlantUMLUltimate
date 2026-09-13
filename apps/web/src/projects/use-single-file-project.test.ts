import { describe, expect, it, vi } from "vitest";
import { encodeProject, projectFromPlantUml } from "@plantuml-studio/document-format";
import { decodePortableProjectFile, projectDiagramName } from "./use-single-file-project";

describe("single-file project diagram names", () => {
  it.each([
    ["Roadmap.puml", "Roadmap"],
    ["Domain.plantuml", "Domain"],
    ["Checkout.pumlu", "Checkout"],
    ["Architecture", "Architecture"],
    ["  Plan.puml  ", "Plan"],
  ])("uses %s as the display name %s", (input, expected) => {
    expect(projectDiagramName(input)).toBe(expected);
  });

  it("uses a useful fallback for an extension-only name", () => {
    expect(projectDiagramName(".puml", "Activity diagram")).toBe("Activity diagram");
  });
});

describe("portable project file opening", () => {
  it("does not request a password for an unencrypted project", async () => {
    const input = await projectFromPlantUml("@startgantt\n@endgantt\n", "gantt", "Plan");
    const encoded = await encodeProject(input, { compression: "none" });
    const requestPassword = vi.fn();

    expect((await decodePortableProjectFile(encoded.bytes, "plan.pumlu", requestPassword))?.project).toEqual(input);
    expect(requestPassword).not.toHaveBeenCalled();
  });

  it("requests a password only after detecting encryption and supports cancellation", async () => {
    const input = await projectFromPlantUml("@startgantt\n@endgantt\n", "gantt", "Plan");
    const encoded = await encodeProject(input, { compression: "none", password: "correct password" });
    const cancelled = vi.fn(async () => undefined);
    expect(await decodePortableProjectFile(encoded.bytes, "plan.pumlu", cancelled)).toBeUndefined();
    expect(cancelled).toHaveBeenCalledWith("plan.pumlu");

    const decoded = await decodePortableProjectFile(encoded.bytes, "plan.pumlu", async () => "correct password");
    expect(decoded).toMatchObject({ project: input, encrypted: true });
  });
});
