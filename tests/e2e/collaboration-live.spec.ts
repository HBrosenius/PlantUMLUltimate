import { expect, test, type Browser, type Page } from "@playwright/test";
import * as Y from "yjs";

const sharedSource = "@startgantt\n[Secured edit] lasts 4 days\n@endgantt";

async function editorSource(page: Page) {
  return page.locator(".cm-content").evaluate((editor) =>
    [...editor.querySelectorAll(".cm-line")]
      .map((line) => {
        const copy = line.cloneNode(true) as HTMLElement;
        copy.querySelectorAll(".cm-remote-cursor, .cm-remote-cursor-label").forEach((marker) => marker.remove());
        return copy.textContent ?? "";
      })
      .join("\n"),
  );
}

async function setEditorSource(page: Page, source: string) {
  const editor = page.locator(".cm-content");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await editor.fill(source);
    if ((await editorSource(page)) === source) break;
    await editor.fill("");
  }
  await expect.poll(() => editorSource(page)).toBe(source);
}

async function createGantt(page: Page) {
  await page.goto("/");
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Gantt diagram" }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
}

async function join(browser: Browser, link: string, name: string, role: "editor" | "viewer") {
  const context = await browser.newContext();
  const page = await context.newPage();
  const frames = {
    binarySent: 0,
    binaryReceived: 0,
    sentPayloads: [] as Uint8Array[],
    receivedPayloads: [] as Uint8Array[],
  };
  page.on("websocket", (socket) => {
    socket.on("framesent", (event) => {
      if (typeof event.payload !== "string") {
        frames.binarySent += 1;
        frames.sentPayloads.push(new Uint8Array(event.payload));
      }
    });
    socket.on("framereceived", (event) => {
      if (typeof event.payload !== "string") {
        frames.binaryReceived += 1;
        frames.receivedPayloads.push(new Uint8Array(event.payload));
      }
    });
  });
  await page.goto(link);
  const dialog = page.getByRole("dialog", { name: "Collaboration" });
  await dialog.getByLabel("Your name").fill(name);
  await dialog.getByRole("button", { name: `Join as ${role}` }).click();
  await expect(dialog).toContainText(role === "viewer" ? "Viewing only" : "Connected");
  return { context, page, frames };
}

function linkCredentials(link: string) {
  const fragment = new URLSearchParams(new URL(link).hash.slice(1));
  return {
    room: fragment.get("collaboration")!,
    endpoint: fragment.get("server")!,
    access: fragment.get("access")!,
  };
}

async function attemptSocket(page: Page, url: string, update?: number[]) {
  return page.evaluate(
    ({ socketUrl, bytes }) =>
      new Promise<{ opened: boolean; code?: number; reason?: string }>((resolve) => {
        const socket = new WebSocket(socketUrl);
        socket.binaryType = "arraybuffer";
        let opened = false;
        const timer = window.setTimeout(() => {
          socket.close();
          resolve({ opened });
        }, 5_000);
        socket.onopen = () => {
          opened = true;
          if (bytes) socket.send(new Uint8Array(bytes));
        };
        socket.onerror = () => {
          if (!opened) {
            window.clearTimeout(timer);
            resolve({ opened: false });
          }
        };
        socket.onclose = (event) => {
          window.clearTimeout(timer);
          resolve({ opened, code: event.code, reason: event.reason });
        };
      }),
    { socketUrl: url, bytes: update },
  );
}

test("enforces collaboration capabilities through the real Durable Object", async ({ page, browser }) => {
  const ownerFrames = { binaryReceived: 0, receivedPayloads: [] as Uint8Array[] };
  page.on("websocket", (socket) => {
    socket.on("framereceived", (event) => {
      if (typeof event.payload !== "string") {
        ownerFrames.binaryReceived += 1;
        ownerFrames.receivedPayloads.push(new Uint8Array(event.payload));
      }
    });
  });
  await createGantt(page);
  await page.getByRole("button", { name: "Collaborate" }).click();
  const ownerDialog = page.getByRole("dialog", { name: "Collaboration" });
  await ownerDialog.getByLabel("Your name").fill("Owner Alice");
  await ownerDialog.getByRole("button", { name: "Create private room" }).click();
  await expect(ownerDialog).toContainText("Connected");
  const editorLink = await ownerDialog.getByLabel("Editor link").inputValue();
  const viewerLink = await ownerDialog.getByLabel("Viewer link").inputValue();
  const editorCredentials = linkCredentials(editorLink);
  const viewerCredentials = linkCredentials(viewerLink);
  expect(editorCredentials.room).toBe(viewerCredentials.room);
  expect(editorCredentials.access).not.toBe(viewerCredentials.access);
  await ownerDialog.getByRole("button", { name: "Close", exact: true }).click();

  const editor = await join(browser, editorLink, "Editor Bob", "editor");
  const viewer = await join(browser, viewerLink, "Viewer Vera", "viewer");
  await expect(viewer.page.locator(".cm-content")).toHaveAttribute("contenteditable", "false");
  await expect(viewer.page.getByRole("button", { name: "Add", exact: true })).toBeDisabled();

  await editor.page
    .getByRole("dialog", { name: "Collaboration" })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect.poll(() => editor.frames.binarySent).toBeGreaterThan(0);
  const framesBeforeEdit = editor.frames.binarySent;
  const ownerFramesBeforeEdit = ownerFrames.binaryReceived;
  await setEditorSource(editor.page, sharedSource);
  await expect.poll(() => editor.frames.binarySent).toBeGreaterThan(framesBeforeEdit);
  const sentDocument = new Y.Doc();
  for (const update of editor.frames.receivedPayloads) Y.applyUpdate(sentDocument, update);
  Y.applyUpdate(sentDocument, editor.frames.sentPayloads.at(-1)!);
  expect(sentDocument.getText("source").toString()).toContain("Secured edit");
  const editPayload = editor.frames.sentPayloads.at(-1)!;
  await expect(editor.page.locator(".collaboration-status")).toHaveText("Live collaboration");
  await expect.poll(() => ownerFrames.binaryReceived).toBeGreaterThan(ownerFramesBeforeEdit);
  await expect
    .poll(() => ownerFrames.receivedPayloads.some((payload) => Buffer.from(payload).equals(Buffer.from(editPayload))))
    .toBe(true);
  await expect.poll(() => editorSource(page)).toBe(sharedSource);
  await expect.poll(() => editorSource(viewer.page)).toBe(sharedSource);

  const maliciousDocument = new Y.Doc();
  maliciousDocument.getText("source").insert(0, "viewer must not write");
  const maliciousUpdate = [...Y.encodeStateAsUpdate(maliciousDocument)];
  const viewerSocket = new URL(`${viewerCredentials.endpoint}/rooms/${viewerCredentials.room}`);
  viewerSocket.protocol = "ws:";
  viewerSocket.searchParams.set("access", viewerCredentials.access);
  viewerSocket.searchParams.set("participant", "malicious-viewer");
  await expect(attemptSocket(viewer.page, viewerSocket.toString(), maliciousUpdate)).resolves.toMatchObject({
    opened: true,
    code: 1008,
    reason: "Read-only collaboration",
  });
  await expect.poll(() => editorSource(page)).not.toContain("viewer must not write");

  const invalidSocket = new URL(viewerSocket);
  invalidSocket.searchParams.set("access", "x".repeat(43));
  await expect(attemptSocket(viewer.page, invalidSocket.toString())).resolves.toEqual({ opened: false });

  await editor.context.close();
  const reconnectedEditor = await join(browser, editorLink, "Editor Bob reconnected", "editor");
  await expect.poll(() => editorSource(reconnectedEditor.page)).toBe(sharedSource);

  await page.getByRole("button", { name: /online/ }).click();
  await page
    .getByRole("dialog", { name: "Collaboration" })
    .getByRole("button", { name: "Revoke link and create new" })
    .click();
  await page
    .getByRole("alertdialog", { name: "Revoke collaboration link" })
    .getByRole("button", { name: "Revoke and create new link" })
    .click();
  await expect(page.getByRole("dialog", { name: "Collaboration" })).toContainText("Connected");
  await expect(reconnectedEditor.page.locator(".collaboration-status")).toHaveText("Collaboration offline");
  await expect(viewer.page.locator(".collaboration-status")).toHaveText("Collaboration offline");

  const revokedSocket = new URL(viewerSocket);
  revokedSocket.searchParams.set("access", editorCredentials.access);
  await expect(attemptSocket(viewer.page, revokedSocket.toString())).resolves.toEqual({ opened: false });

  await reconnectedEditor.context.close();
  await viewer.context.close();
});
