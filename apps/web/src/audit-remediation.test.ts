import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { SharedDocumentModel } from "./collaboration-document";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar, shiftDate, workingEndDate } from "./gantt-calendar";
import { resolveDateExpression } from "./gantt-schedule";
import { DEFAULT_SESSION } from "./workspace-storage";
import { parseWorkspaceBackup, serializeWorkspaceBackup } from "./workspace-backup";
describe("audit input boundaries", () => {
  it("rejects overflow, impossible dates and impossible calendars without expensive scanning", () => {
    expect(resolveDateExpression("D+999999999999999999", "2026-09-01")).toBeUndefined();
    expect(shiftDate("2026-02-31", 0)).toBeUndefined();
    const calendar = parseGanttCalendar(
      ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
        .map((day) => `${day} are closed`)
        .join("\n"),
    );
    expect(calendar.error).toContain("no working days");
    expect(workingEndDate("2026-09-01", 1, calendar)).toBeUndefined();
    expect(
      parseGantt(`@startgantt\n[A] lasts ${"9".repeat(400)} days\n@endgantt`).diagnostics.some(
        (d) => d.code === "resource-limit",
      ),
    ).toBe(true);
  });
  it("uses a restorable emergency backup envelope and rejects shared histories", () => {
    expect(parseWorkspaceBackup(serializeWorkspaceBackup(DEFAULT_SESSION))).toEqual(DEFAULT_SESSION);
    const first = DEFAULT_SESSION.documents[0]!;
    const session = { ...DEFAULT_SESSION, documents: [first, { ...first, id: "other" }] };
    expect(() => parseWorkspaceBackup(serializeWorkspaceBackup(session))).toThrow("invalid documents");
  });
  it("contains semantically invalid shared data at the client boundary", () => {
    const document = new Y.Doc();
    document.getMap("document-metadata").set("id", "audit");
    document.getMap("document-metadata").set("name", "Audit");
    document.getMap("document-diagrams").set("bad", "not-a-map");
    expect(new SharedDocumentModel(document).snapshot).toBeUndefined();
  });
});
