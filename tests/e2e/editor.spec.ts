import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import * as Y from "yjs";

import { fillSource, prepareEditor, setSource, source } from "./editor-helpers";

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
});

test("shows the diagram splash after closing the final tab", async ({ page }) => {
  await page.getByRole("button", { name: "Close untitled.pumlu", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Sequence diagram" }).click();
  await expect(page.locator(".cm-content")).toContainText("@startuml");
  await expect(page.locator(".document-tabs > button:not(.new-tab)")).toHaveCount(1);
});

test("creates a private collaboration link without exposing its credential in the request URL", async ({ page }) => {
  await page.evaluate(() => {
    class CollaborationWebSocket {
      static readonly OPEN = 1;
      readonly OPEN = 1;
      readyState = CollaborationWebSocket.OPEN;
      binaryType = "arraybuffer";
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(url: string, protocols?: string[]) {
        const collaborationWindow = window as Window & {
          __collaborationSocket?: CollaborationWebSocket;
          __collaborationSocketUrls?: string[];
          __collaborationMessages?: string[];
          __collaborationUpdates?: number[][];
          __collaborationSocketProtocols?: string[][];
        };
        collaborationWindow.__collaborationSocket = this;
        (collaborationWindow.__collaborationSocketUrls ??= []).push(url);
        (collaborationWindow.__collaborationSocketProtocols ??= []).push(protocols ?? []);
        window.setTimeout(() => {
          this.onopen?.();
          this.onmessage?.(new MessageEvent("message", { data: new Uint8Array([0, 0]).buffer }));
        });
      }

      send(message: string | ArrayBuffer | ArrayBufferView) {
        if (typeof message === "string")
          ((window as Window & { __collaborationMessages?: string[] }).__collaborationMessages ??= []).push(message);
        else {
          const bytes =
            message instanceof ArrayBuffer
              ? new Uint8Array(message)
              : new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
          ((window as Window & { __collaborationUpdates?: number[][] }).__collaborationUpdates ??= []).push([...bytes]);
        }
      }
      close() {
        this.readyState = 3;
      }
    }
    Object.defineProperty(window, "WebSocket", { value: CollaborationWebSocket });
    Object.defineProperty(window, "fetch", {
      value: async () => new Response(null, { status: 204 }),
    });
  });
  await page.getByRole("button", { name: "Collaborate" }).click();
  const dialog = page.getByRole("dialog", { name: "Collaboration" });
  await dialog.getByLabel("Your name").fill("Alice");
  await dialog.getByRole("button", { name: "Create private room" }).click();
  await expect(dialog).toContainText("Connected");
  const link = await dialog.getByLabel("Editor link").inputValue();
  const viewerLink = await dialog.getByLabel("Viewer link").inputValue();
  const parsed = new URL(link);
  expect(parsed.searchParams.has("collaboration")).toBe(false);
  expect(new URLSearchParams(parsed.hash.slice(1)).get("collaboration")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(new URLSearchParams(parsed.hash.slice(1)).get("mode")).toBe("editor");
  expect(new URLSearchParams(new URL(viewerLink).hash.slice(1)).get("mode")).toBe("viewer");
  expect(viewerLink).not.toBe(link);

  await page.evaluate(() => {
    const socket = (
      window as Window & { __collaborationSocket?: { onmessage: ((event: MessageEvent) => void) | null } }
    ).__collaborationSocket;
    socket?.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "presence",
          participants: [
            {
              id: "remote-bob",
              name: "Bob",
              color: "#db2777",
              cursor: { line: 1, column: 3 },
              selection: { anchor: 0, head: 8 },
            },
          ],
        }),
      }),
    );
  });
  await expect(page.locator('.cm-remote-cursor[data-participant-id="remote-bob"]')).toBeVisible();
  await expect(page.locator(".cm-remote-cursor-label")).toHaveText("Bob");
  await expect(page.locator('.cm-remote-selection[data-participant-id="remote-bob"]')).toBeVisible();

  const synchronizedUpdates = await page.evaluate(
    () => (window as Window & { __collaborationUpdates?: number[][] }).__collaborationUpdates,
  );
  expect(synchronizedUpdates?.length).toBeGreaterThan(0);
  const remoteDocument = new Y.Doc();
  for (const update of synchronizedUpdates!) Y.applyUpdate(remoteDocument, new Uint8Array(update));
  remoteDocument.getText("source").insert(0, "' Bob added this line\n");
  const remoteUpdate = [...Y.encodeStateAsUpdate(remoteDocument)];
  await page.evaluate((update) => {
    const socket = (
      window as Window & { __collaborationSocket?: { onmessage: ((event: MessageEvent) => void) | null } }
    ).__collaborationSocket;
    socket?.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "update-author",
          participant: { id: "remote-bob", name: "Bob", color: "#db2777" },
        }),
      }),
    );
    socket?.onmessage?.(new MessageEvent("message", { data: new Uint8Array(update).buffer }));
    socket?.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "presence", participants: [] }) }));
  }, remoteUpdate);
  await expect(page.locator(".cm-content")).toContainText("Bob added this line");

  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(".cm-content").fill(source("[Collaborative edit] lasts 3 days"));
  await page.waitForTimeout(1_500);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await expect(history.locator(".version-list-item").first()).toContainText("Changes by Alice");
  await expect(history.locator(".version-list-item").first()).toContainText("by Alice");
  await expect(history.locator(".version-list-item").filter({ hasText: "Changes by Bob" })).toHaveCount(1);
  await history.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: /online/ }).click();
  const rotatedDialog = page.getByRole("dialog", { name: "Collaboration" });
  const oldLink = await rotatedDialog.getByLabel("Editor link").inputValue();
  await rotatedDialog.getByRole("button", { name: "Revoke link and create new" }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Revoke collaboration link" });
  await expect(confirmation).toContainText("everyone in this room will be disconnected");
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Collaboration" }).getByLabel("Editor link")).toHaveValue(oldLink);
  await page.getByRole("button", { name: "Revoke link and create new" }).click();
  await page
    .getByRole("alertdialog", { name: "Revoke collaboration link" })
    .getByRole("button", { name: "Revoke and create new link", exact: true })
    .click();
  const newRoomDialog = page.getByRole("dialog", { name: "Collaboration" });
  await expect(newRoomDialog).toContainText("Connected");
  const newLink = await newRoomDialog.getByLabel("Editor link").inputValue();
  expect(newLink).not.toBe(oldLink);
  const rotation = await page.evaluate(() => ({
    urls: (window as Window & { __collaborationSocketUrls?: string[] }).__collaborationSocketUrls,
    messages: (window as Window & { __collaborationMessages?: string[] }).__collaborationMessages,
    protocols: (window as Window & { __collaborationSocketProtocols?: string[][] }).__collaborationSocketProtocols,
  }));
  expect(rotation.urls).toHaveLength(2);
  expect(rotation.urls?.every((url) => new URL(url).search === "")).toBe(true);
  expect(rotation.protocols?.every((protocols) => protocols.includes("plantuml-collaboration"))).toBe(true);
  expect(rotation.protocols?.every((protocols) => protocols.some((protocol) => protocol.startsWith("owner.")))).toBe(
    true,
  );
  expect(new URL(oldLink).hash).not.toContain("owner");
  expect(rotation.messages?.some((message) => JSON.parse(message).type === "revoke-room")).not.toBe(true);
});

test("groups document commands in an accessible File and Export menu", async ({ page }) => {
  const file = page.getByRole("button", { name: "File" });
  await file.click();
  const menu = page.getByRole("menu", { name: "File" });
  await expect(menu.getByRole("menuitem")).toHaveText([
    "New›",
    "Open›",
    "Save›",
    "Version history…",
    "Document settings…",
    "Jira…",
    "Backup workspace…",
    "Restore workspace…",
    "Export›",
  ]);
  await menu.getByRole("menuitem", { name: "Export" }).hover();
  const exportMenu = page.getByRole("menu", { name: "Export" });
  await expect(exportMenu.getByRole("menuitem")).toHaveText(["Source", "SVG", "PNG"]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(file).toBeFocused();

  await file.click();
  await menu.getByRole("menuitem", { name: "Jira…" }).click();
  const jira = page.getByRole("dialog", { name: "Jira integration" });
  await expect(jira).toBeVisible();
  await jira.getByRole("button", { name: "Close Jira integration" }).click();
});

test("marks synchronized and locally changed Jira tasks", async ({ page }) => {
  const binding = JSON.stringify({
    version: 1,
    bindingId: "binding-1",
    cloudId: "cloud-1",
    siteUrl: "https://acme.atlassian.net",
    jql: "key = APP-123",
    mode: "pull",
    baselines: {
      "10042": {
        updated: "2026-09-01T10:00:00Z",
        state: { key: "APP-123", summary: "Imported", startDate: "2026-09-01" },
      },
    },
  });
  const jiraSource = (startDate: string) => `@startgantt
' @studio-jira ${binding}
Project starts 2026-09-01
[Imported] as [jira_10042] starts ${startDate}
[jira_10042] lasts 2 days
[jira_10042] links to [[https://acme.atlassian.net/browse/APP-123 APP-123]]
@endgantt`;

  await setSource(page, jiraSource("2026-09-01"));
  const task = page.locator('[data-task-id="jira_10042"]').first();
  await expect(task).toHaveAttribute("data-jira-status", "synchronized");
  await task.click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector).toContainText("Synchronized with Jira");
  await inspector.getByRole("button", { name: "Close task inspector" }).click();

  await setSource(page, jiraSource("2026-09-03"));
  await expect(page.locator('[data-task-id="jira_10042"]').first()).toHaveAttribute(
    "data-jira-status",
    "local-changes",
  );
  await page.locator('[data-task-id="jira_10042"]').first().dispatchEvent("click");
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toContainText("Local changes: startDate");
});

test("creates, compares, and restores durable document versions", async ({ page }) => {
  const first = source("[A] lasts 2 days");
  const second = source("[B] lasts 4 days");
  await setSource(page, first);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const dialog = page.getByRole("dialog", { name: "Version history" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("New version name").fill("First draft");
  await dialog.getByRole("button", { name: "Create version" }).click();
  await expect(dialog.getByRole("button", { name: "Select version First draft" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await page.reload();
  await expect(page.locator(".cm-content")).toBeVisible();
  await page.getByRole("dialog", { name: "Choose a diagram type" }).getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  await expect(dialog.getByRole("button", { name: "Select version First draft" })).toBeVisible();
  await dialog.getByLabel("Selected version name").fill("Baseline");
  await dialog.getByRole("button", { name: "Save name" }).click();
  await expect(dialog.getByRole("button", { name: "Select version Baseline" })).toBeVisible();
  await dialog.getByRole("button", { name: "Unpin", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Pin", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Pin", exact: true }).click();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await setSource(page, second);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  await expect(dialog.getByLabel("Semantic changes")).toBeVisible();
  await dialog.getByRole("button", { name: "Source", exact: true }).click();
  await expect(dialog.getByRole("table", { name: "Source differences" })).toContainText("[B] lasts 4 days");
  await dialog.getByRole("button", { name: "Rendered", exact: true }).click();
  await expect(dialog.getByLabel("Rendered differences").locator("svg")).toHaveCount(2, { timeout: 20_000 });
  const renderedBaseline = dialog.getByLabel("Baseline rendered diagram");
  const renderedBox = await renderedBaseline.boundingBox();
  expect(renderedBox).not.toBeNull();
  await page.mouse.move(renderedBox!.x + renderedBox!.width / 2, renderedBox!.y + renderedBox!.height / 2);
  await page.mouse.wheel(0, -400);
  await expect(dialog.getByRole("button", { name: "Reset zoom for Baseline" })).not.toHaveText("100%");
  await renderedBaseline.evaluate(async (element) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    element.scrollLeft = 0;
  });
  await expect.poll(() => renderedBaseline.evaluate((element) => element.scrollLeft)).toBe(0);
  const zoomedCanvasBox = await renderedBaseline.boundingBox();
  const zoomedDiagramBox = await renderedBaseline.locator("svg").boundingBox();
  expect(zoomedCanvasBox).not.toBeNull();
  expect(zoomedDiagramBox).not.toBeNull();
  expect(zoomedDiagramBox!.x).toBeGreaterThanOrEqual(zoomedCanvasBox!.x);
  await expect(dialog.getByRole("button", { name: "Reset zoom for Current working copy" })).toHaveText("100%");
  await dialog.getByRole("button", { name: "Reset zoom for Baseline" }).click();
  await expect(dialog.getByRole("button", { name: "Reset zoom for Baseline" })).toHaveText("100%");
  await dialog.getByRole("button", { name: "Source", exact: true }).click();
  await dialog.getByLabel("New version name").fill("Discard me");
  await dialog.getByRole("button", { name: "Create version" }).click();
  await dialog.getByRole("button", { name: "Select version Discard me" }).click();
  page.once("dialog", (confirmation) => void confirmation.accept());
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Select version Discard me" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Select version Baseline" }).click();
  await dialog.getByLabel("Changes only").check();
  await expect(dialog.getByRole("table", { name: "Source differences" })).not.toContainText(
    "Project starts 2026-09-01",
  );
  await dialog.getByRole("button", { name: "Restore this version" }).click();
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 2 days");
  await expect(page.locator(".cm-content")).not.toContainText("[B] lasts 4 days");
});

test("resizes Version History to provide more rendered comparison space", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Native CSS resize gestures differ across browser engines");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await setSource(page, source("[Resizable] lasts 2 days"));
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const dialog = page.getByRole("dialog", { name: "Version history" });
  await expect(dialog).toHaveCSS("resize", "both");
  const before = await dialog.boundingBox();
  expect(before).not.toBeNull();
  await page.mouse.move(before!.x + before!.width - 2, before!.y + before!.height - 2);
  await page.mouse.down();
  await page.mouse.move(before!.x + before!.width + 120, before!.y + before!.height + 100, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await dialog.boundingBox())?.width ?? 0).toBeGreaterThan(before!.width + 80);
  await expect.poll(async () => (await dialog.boundingBox())?.height ?? 0).toBeGreaterThan(before!.height + 60);
});

test("imports a local PlantUML file for semantic review without replacing the working copy", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  const before = '@startuml\nparticipant "Payment API" as Pay\nhide footbox\nPay -> Store: Authorize\n@enduml';
  const proposed = '@startuml\nparticipant "Billing API" as Pay\nhide footbox\nPay -> Store: Capture\n@enduml';
  await setSource(page, before);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const dialog = page.getByRole("dialog", { name: "Version history" });

  await dialog.getByLabel("PlantUML comparison file").setInputFiles({
    name: "wrong-kind.puml",
    mimeType: "text/plain",
    buffer: Buffer.from("@startgantt\n[Task] lasts 2 days\n@endgantt"),
  });
  await expect(dialog.getByRole("alert")).toContainText(
    "This gantt diagram cannot be reviewed against the current sequence diagram.",
  );
  await expect(dialog.getByLabel("Compare with")).toHaveValue("current");

  await dialog.getByLabel("PlantUML comparison file").setInputFiles({
    name: "proposed.puml",
    mimeType: "text/plain",
    buffer: Buffer.from(proposed),
  });

  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByLabel("Compare with")).toHaveValue("imported");
  await expect(dialog.getByLabel("Semantic changes")).toContainText("Rename participant Payment API to Billing API");
  await expect(page.locator(".cm-content")).toContainText('participant "Payment API" as Pay');
  await expect(page.locator(".cm-content")).not.toContainText('participant "Billing API" as Pay');

  await dialog
    .locator(".semantic-review-group")
    .filter({ hasText: "Rename participant Payment API to Billing API" })
    .getByRole("checkbox")
    .check();
  await dialog.getByRole("button", { name: "Apply selected (1)" }).click();
  await expect(page.locator(".cm-content")).toContainText('participant "Billing API" as Pay');
  await expect(page.locator(".cm-content")).toContainText("Pay -> Store: Authorize");
  await expect(page.locator(".cm-content")).not.toContainText("Capture");
});

test("compares two imported PlantUML files without applying over a different working copy", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  await setSource(page, "@startuml\nAlice -> Bob: Working copy\n@enduml");
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const dialog = page.getByRole("dialog", { name: "Version history" });

  await dialog.getByLabel("PlantUML base file").setInputFiles({
    name: "before.puml",
    mimeType: "text/plain",
    buffer: Buffer.from("@startuml\nAlice -> Bob: Before\n@enduml"),
  });
  await dialog.getByLabel("PlantUML comparison file").setInputFiles({
    name: "after.puml",
    mimeType: "text/plain",
    buffer: Buffer.from("@startuml\nAlice -> Bob: After\n@enduml"),
  });

  await expect(dialog.getByLabel("Version comparison")).toContainText("Imported: before.puml");
  await expect(dialog.getByLabel("Compare with")).toHaveValue("imported");
  await expect(dialog.getByLabel("Compare with")).toContainText("Imported: after.puml");
  await expect(dialog.getByLabel("Semantic changes")).toContainText("Change message Alice → Bob");
  await dialog.getByRole("checkbox").check();
  await expect(dialog.getByRole("button", { name: "Apply selected (1)" })).toBeDisabled();
  await expect(dialog.getByRole("status")).toContainText("working copy does not match the imported base");
  await expect(dialog.getByRole("button", { name: "Export selected patch" })).toBeEnabled();
  await expect(page.locator(".cm-content")).toContainText("Alice -> Bob: Working copy");
});

test("retains version history after Save As", async ({ page }) => {
  await setSource(page, source("[Original lineage] lasts 2 days"));
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await history.getByLabel("New version name").fill("Old lineage");
  await history.getByRole("button", { name: "Create version" }).click();
  await history.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async () => ({
        name: "forked-plan.pumlu",
        createWritable: async () => ({ write: async () => undefined, close: async () => undefined }),
        getFile: async () =>
          new File(
            ["@startgantt\nProject starts 2026-09-01\n[Original lineage] lasts 2 days\n@endgantt"],
            "forked-plan.pumlu",
          ),
      }),
    });
  });

  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await page.getByRole("menu", { name: "Save" }).getByRole("menuitem", { name: "Save diagram as…" }).click();
  await expect(page.locator(".document-tabs > button.active")).toContainText("forked-plan.pumlu");
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  await expect(history.getByRole("button", { name: "Select version Saved portable document" })).toBeVisible();
  await expect(history.getByRole("button", { name: "Select version Old lineage" })).toBeVisible();
});

test("copies the current source from the code editor", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Clipboard permissions are only consistently exposed by Chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const value = source("[Copy me] lasts 2 days");
  await setSource(page, value);
  await page.getByRole("button", { name: "Copy code" }).click();
  await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
});

test("backs up and restores all open documents", async ({ page }) => {
  const original = source("[Backup target] lasts 2 days");
  await setSource(page, original);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await history.getByLabel("New version name").fill("Backup checkpoint");
  await history.getByRole("button", { name: "Create version" }).click();
  await history.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "New document tab" }).click();
  await page.getByRole("button", { name: "Gantt diagram" }).click();
  await setSource(page, source("[Second tab] lasts 3 days"));
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Backup workspace…" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const backup = readFileSync(downloadPath!, "utf8");
  expect(JSON.parse(backup).session.documents).toHaveLength(2);

  await page.locator(".cm-content").fill(source("[Replaced] lasts 1 day"));
  await page.evaluate((contents) => {
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: async () => [{ name: "backup.json", getFile: async () => ({ text: async () => contents }) }],
    });
  }, backup);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Restore workspace…" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Second tab] lasts 3 days");
  await expect(page.locator(".document-tabs > button:not(.new-tab)")).toHaveCount(2);
  await page.locator(".document-tabs > button:not(.new-tab)").first().click();
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  await expect(history.getByRole("button", { name: "Select version Backup checkpoint" })).toBeVisible();
});

test("reloads clean external file edits and merges conflicting local changes", async ({ page }) => {
  const initial = source("[Initial file] lasts 2 days");
  await page.evaluate((contents) => {
    const fileWindow = window as Window & { testExternalFileSource?: string; testExternalModified?: number };
    fileWindow.testExternalFileSource = contents;
    fileWindow.testExternalModified = 1;
    const handle = {
      name: "shared.puml",
      getFile: async () =>
        new File([fileWindow.testExternalFileSource ?? ""], "shared.puml", {
          lastModified: fileWindow.testExternalModified,
          type: "text/plain",
        }),
      createWritable: async () => ({ write: async () => undefined, close: async () => undefined }),
    };
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: async () => [handle],
    });
  }, initial);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Open", exact: true }).click();
  await page.getByRole("menu", { name: "Open" }).getByRole("menuitem", { name: "Project or diagram…" }).click();
  await expect(page.locator(".cm-content")).toContainText("Initial file");

  await page.evaluate((contents) => {
    const fileWindow = window as Window & { testExternalFileSource?: string; testExternalModified?: number };
    fileWindow.testExternalFileSource = contents;
    fileWindow.testExternalModified = 2;
    window.dispatchEvent(new Event("focus"));
  }, source("[Clean external edit] lasts 3 days"));
  await expect(page.locator(".cm-content")).toContainText("Clean external edit");
  await expect(page.getByRole("dialog", { name: "External file changes" })).toHaveCount(0);

  await page.locator(".cm-content").fill(source("[Unsaved local edit] lasts 4 days"));
  await page.evaluate((contents) => {
    const fileWindow = window as Window & { testExternalFileSource?: string; testExternalModified?: number };
    fileWindow.testExternalFileSource = contents;
    fileWindow.testExternalModified = 3;
    window.dispatchEvent(new Event("focus"));
  }, source("[Conflicting external edit] lasts 5 days"));
  const conflict = page.getByRole("dialog", { name: "External file changes" });
  await expect(conflict).toBeVisible();
  await expect(conflict.getByRole("table", { name: "External file differences" })).toContainText(
    "Conflicting external edit",
  );
  await conflict.getByRole("button", { name: "Use external" }).click();
  await expect(conflict.getByLabel("Merged source")).toHaveValue(/Conflicting external edit/);
  await conflict.getByRole("button", { name: "Apply merged version" }).click();
  await expect(page.locator(".cm-content")).toContainText("Conflicting external edit");
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  await expect(page.getByRole("button", { name: "Select version Before external merge", exact: true })).toBeVisible();
});

test("protects dirty tabs from browser unload", async ({ page }) => {
  await fillSource(page, source("[Unsaved] lasts 2 days"));
  await expect(page.locator(".document-tabs > button.active .dirty-dot.visible")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        let preventDefaultCalled = false;
        const preventDefault = event.preventDefault.bind(event);
        event.preventDefault = () => {
          preventDefaultCalled = true;
          preventDefault();
        };
        window.dispatchEvent(event);
        return preventDefaultCalled;
      }),
    )
    .toBe(true);
});

test("rebuilds the renderer iframe once and explains a repeated bootstrap failure", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Direct srcdoc frame failure injection is Chromium-specific");
  const iframe = page.locator('iframe[title="Local PlantUML renderer"]');
  await expect(iframe).toHaveCount(1);
  const failCurrentFrame = async () => {
    const sourceDocument = await iframe.getAttribute("srcdoc");
    const channel = sourceDocument?.match(/const channel = ("[^"]+")/)?.[1];
    expect(channel).toBeTruthy();
    const frame = await (await iframe.elementHandle())!.contentFrame();
    await frame!.evaluate(
      (value) =>
        parent.postMessage(
          { channel: JSON.parse(value), type: "bootstrap-error", error: "Injected startup failure" },
          "*",
        ),
      channel!,
    );
  };
  await iframe.evaluate((element) => element.setAttribute("data-test-original-frame", "true"));
  await failCurrentFrame();
  await expect(iframe).toHaveCount(1);
  await expect(iframe).not.toHaveAttribute("data-test-original-frame", "true");
  await failCurrentFrame();
  await expect(page.getByRole("alert")).toContainText("could not start after an automatic retry");
  await expect(page.getByRole("alert")).toContainText("Browser security settings");
});
