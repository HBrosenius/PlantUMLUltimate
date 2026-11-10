/* global document, window, navigator, addEventListener, CSS */
// Sentence-cued demo capture; shares the verified course action vocabulary.
// Usage: node scripts/demo-video/record-scenes.mjs overview outline scenario-lab
import { chromium, expect } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
const ids = process.argv.slice(2);
let server;
try {
  await fetch("http://127.0.0.1:5232");
} catch {
  server = spawn(
    "npm",
    ["--workspace", "@plantuml-studio/web", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5232"],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 100; i++) {
    try {
      await fetch("http://127.0.0.1:5232");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}
const browser = await chromium.launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (const id of ids) {
    const lesson = JSON.parse(readFileSync(`docs/demo-refresh/${id}.json`));
    if (lesson.liveDemoPending) continue;
    for (const scene of lesson.scenes) {
      if (process.env.COURSE_SCENES && !new RegExp(process.env.COURSE_SCENES).test(scene.id)) continue;
      const dir = `output/demo-refresh/${id}/raw/${scene.id}`;
      if (existsSync(`${dir}/take.json`)) {
        console.log(`REUSE ${id}/${scene.id}`);
        continue;
      }
      mkdirSync(`${dir}/frames`, { recursive: true });
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: "light" });
      if (scene.fileHandleLab) {
        await context.addInitScript(() => {
          const handle = async () => {
            const root = await navigator.storage.getDirectory();
            return root.getFileHandle("portal-file-handle-practice.pumlu", { create: true });
          };
          window.showSaveFilePicker = handle;
          window.showOpenFilePicker = async () => [await handle()];
          window.trainingFileHandle = handle;
        });
      } else
        await context.addInitScript(() => {
          Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
          Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
        });
      const dialogs = [];
      let linkDecision, linkPage, lastLinkDialog;
      const linkChecks = [];
      const page = await context.newPage();
      if (scene.inspectRawRenderer)
        await page.addInitScript(() =>
          window.addEventListener("message", (event) => {
            if (event.data?.type === "result" && typeof event.data.svg === "string")
              window.courseRawRenderedSvg = event.data.svg;
          }),
        );
      page.on("dialog", (d) => {
        dialogs.push({ type: d.type(), message: d.message() });
        if (
          d.type() === "confirm" &&
          d.message().startsWith("Open this link from the diagram?") &&
          linkDecision === false
        )
          return d.dismiss();
        return d.accept(
          d.type() === "prompt" && /password/i.test(d.message()) ? "Portal training only 2026!" : d.defaultValue(),
        );
      });
      let cdp, guest, guestContext;
      let capturing = false;
      const frames = [];
      const actions = [];
      const read = () =>
        page.evaluate(() => {
          const e = document.querySelector(".cm-content");
          return e?.cmTile?.root?.view?.state.doc.toString() ?? e?.cmView?.view?.state.doc.toString() ?? "";
        });
      const current = async () => {
        await wait(900);
        await expect(page.getByText("Preview current", { exact: true })).toBeVisible({ timeout: 45000 });
        await wait(200);
        await expect(page.getByText("Preview current", { exact: true })).toBeVisible({ timeout: 45000 });
      };
      const vars = {};
      const loc = (s) => {
        const base = s.scope ? page.locator(s.scope) : page;
        return s.css
          ? base.locator(s.css)
          : s.text
            ? base.getByText(s.text, { exact: s.exact !== false })
            : s.label
              ? base.getByLabel(s.label, { exact: s.exact === true }).and(base.locator("input,select,textarea"))
              : base.getByRole(s.role ?? "button", { name: s.name, exact: s.exact !== false });
      };
      async function click(s) {
        if (s.name === "Collaborate" && !(await page.getByRole("button", { name: "Collaborate", exact: true }).count()))
          s = { name: /\d+ online/, exact: false };
        const candidate = loc(s);
        const interactive = s.css && s.css.includes("[data-") ? candidate.and(page.locator('[role="button"]')) : null;
        const l = interactive && (await interactive.count()) ? interactive.first() : candidate.first();
        await l.scrollIntoViewIfNeeded();
        const hit = await l.evaluate((e) => {
          if (e.tagName.toLowerCase() !== "path" || !e.hasAttribute("data-dependency-index")) return null;
          const matrix = e.getScreenCTM();
          for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
            const p = e.getPointAtLength(e.getTotalLength() * f).matrixTransform(matrix);
            const target = document.elementFromPoint(p.x, p.y);
            if (
              target === e ||
              target?.getAttribute("data-dependency-index") === e.getAttribute("data-dependency-index")
            )
              return { x: p.x, y: p.y };
          }
          return null;
        });
        if (hit) {
          await page.mouse.move(hit.x, hit.y, { steps: 15 });
          await wait(180);
          await page.mouse.click(hit.x, hit.y);
        } else {
          const b = await l.boundingBox();
          const svg = await l.evaluate((e) => e instanceof SVGElement);
          if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
          await wait(180);
          if (svg && b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
          else await l.click();
        }
        await wait(150);
        if (s.name === "Cancel") {
          const dialogs = page.getByRole("dialog");
          if (await dialogs.count()) {
            await page.keyboard.press("Escape");
            await wait(200);
          }
        }
      }
      async function source(text, allowErrors = false) {
        for (let i = 0; i < 3; i++) {
          await page.locator(".cm-content").click();
          await page.keyboard.press("ControlOrMeta+a");
          await page.keyboard.insertText(text);
          try {
            await expect.poll(read, { timeout: 2000 }).toBe(text);
            break;
          } catch (e) {
            if (i === 2) throw e;
          }
        }
        if (!allowErrors) await current();
        else await wait(600);
      }
      async function op(a) {
        switch (a.op) {
          case "click":
            await click(a);
            break;
          case "hover":
            await loc(a).filter({ visible: true }).first().hover();
            await wait(400);
            break;
          case "openSection": {
            const summary = page.locator("summary").filter({ hasText: a.value }).first();
            if (!(await summary.evaluate((e) => e.parentElement.open))) await summary.click();
            break;
          }
          case "connected": {
            await click({ name: "Plan", role: "tab" });
            await click({ name: "Create Gantt chart from WBS" });
            await loc({ label: "Name" }).first().fill("Customer portal course");
            await loc({ label: "Project start date" }).first().fill("2026-11-02");
            await click({ name: "Create Gantt chart" });
            await page.getByRole("complementary", { name: "Document navigator" }).waitFor();
            await wait(800);
            break;
          }
          case "importMember": {
            const nav = page.getByRole("complementary", { name: "Document navigator" });
            const event = page.waitForEvent("filechooser");
            await nav.getByRole("button", { name: "Import diagram", exact: true }).click();
            await (await event).setFiles(a.path);
            await wait(1200);
            await current();
            break;
          }
          case "renameMember": {
            const nav = page.getByRole("complementary", { name: "Document navigator" });
            await nav
              .getByRole("button", { name: /^Rename / })
              .last()
              .click();
            break;
          }
          case "deleteMember": {
            const nav = page.getByRole("complementary", { name: "Document navigator" });
            await nav
              .getByRole("button", { name: /^Delete / })
              .last()
              .click();
            await wait(500);
            break;
          }
          case "assertMemberCount":
            await expect(
              page.getByRole("complementary", { name: "Document navigator" }).locator("button:has(small)"),
            ).toHaveCount(a.count);
            break;
          case "openMember": {
            const nav = page.getByRole("complementary", { name: "Document navigator" });
            await nav.locator(`button:has(small:has-text("${a.kind}"))`).first().click();
            await current();
            break;
          }
          case "linkOpen": {
            const before = await read(),
              count = context.pages().length;
            linkDecision = a.accept !== false;
            const dialog = page.waitForEvent("dialog", {
              predicate: (d) => d.type() === "confirm" && d.message().includes(a.url),
            });
            const opened = linkDecision ? context.waitForEvent("page") : null;
            const link = page.locator(`svg a[href="${a.url}"] text`).last();
            await link.scrollIntoViewIfNeeded();
            const p = await link.evaluate((e) => {
              const b = e.getBBox(),
                m = e.getScreenCTM();
              const p = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(m);
              return { x: p.x, y: p.y, href: document.elementFromPoint(p.x, p.y)?.closest("a")?.getAttribute("href") };
            });
            expect(p.href).toBe(a.url);
            await page.mouse.move(p.x, p.y, { steps: 15 });
            await page.mouse.click(p.x, p.y);
            lastLinkDialog = (await dialog).message();
            if (opened) {
              linkPage = await opened;
              await linkPage.waitForLoadState("domcontentloaded");
              await expect(linkPage).toHaveURL(a.url);
              expect(await linkPage.evaluate(() => window.opener)).toBeNull();
            } else await expect.poll(() => context.pages().length).toBe(count);
            expect(await read()).toBe(before);
            linkChecks.push({
              url: a.url,
              accepted: linkDecision,
              dialog: lastLinkDialog,
              openedTab: !!opened,
              editorSourceUnchanged: true,
              popupUrl: opened ? linkPage.url() : null,
              dialogPresentation:
                "Actual native dialog text is shown as a labeled instructional overlay, not native window footage.",
            });
            writeFileSync(`${dir}/link-verification.json`, JSON.stringify(linkChecks, null, 2));
            linkDecision = undefined;
            await page.bringToFront();
            break;
          }
          case "linkConfirmation":
            await op({
              op: "card",
              title: "Browser confirmation · captured text",
              items: lastLinkDialog.split("\n").filter(Boolean),
            });
            break;
          case "linkPageView": {
            const buffer = await linkPage.screenshot({ path: `${dir}/opened-reference.png` });
            await page.bringToFront();
            await page.evaluate(
              (data) => {
                let e = document.querySelector("#lesson-link-page");
                if (!e) {
                  e = document.createElement("div");
                  e.id = "lesson-link-page";
                  e.style =
                    "position:fixed;z-index:2147483644;inset:40px 60px 95px;background:#132c35;padding:35px;box-shadow:0 0 0 100vw #000b;color:white;font:24px Arial";
                  document.body.append(e);
                }
                e.replaceChildren();
                const h = document.createElement("div");
                h.textContent = "Opened reference tab · actual recorded page";
                const img = document.createElement("img");
                img.src = data;
                img.style = "width:100%;height:calc(100% - 45px);object-fit:contain";
                e.append(h, img);
              },
              "data:image/png;base64," + buffer.toString("base64"),
            );
            break;
          }
          case "linkPageClose":
            if (linkPage && !linkPage.isClosed()) await linkPage.close();
            await page.evaluate(() => document.querySelector("#lesson-link-page")?.remove());
            await page.bringToFront();
            break;
          case "assertSvgFileLink": {
            const svg = readFileSync(`output/demo-refresh/${id}/${a.filename}`, "utf8");
            const links = await page.evaluate(
              (svg) =>
                [...new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("a")].map(
                  (a) => a.getAttribute("href") ?? a.getAttributeNS("http://www.w3.org/1999/xlink", "href"),
                ),
              svg,
            );
            expect(links).toContain(a.url);
            writeFileSync(
              `${dir}/export-link-verification.json`,
              JSON.stringify({ file: a.filename, url: a.url, preserved: true }, null, 2),
            );
            break;
          }
          case "inspectLinks":
            if (scene.inspectRawRenderer)
              writeFileSync(`${dir}/raw-renderer.svg`, await page.evaluate(() => window.courseRawRenderedSvg ?? ""));
            writeFileSync(
              `${dir}/rendered-links.json`,
              JSON.stringify(
                await page.locator("svg a").evaluateAll((es) =>
                  es.map((e) => ({
                    text: e.textContent,
                    href: e.getAttribute("href") ?? e.getAttribute("xlink:href"),
                  })),
                ),
                null,
                2,
              ),
            );
            break;
          case "reveal":
            await loc(a).first().scrollIntoViewIfNeeded();
            await wait(250);
            break;
          case "dumpFieldContainer":
            writeFileSync(
              `${dir}/field-container.html`,
              await loc(a)
                .first()
                .evaluate((e) => e.parentElement.parentElement.parentElement.outerHTML),
            );
            break;
          case "dumpDraggables":
            writeFileSync(
              `${dir}/draggables.json`,
              JSON.stringify(
                await page.locator('[draggable="true"]').evaluateAll((es) => es.map((e) => e.outerHTML)),
                null,
                2,
              ),
            );
            break;
          case "dumpRoles":
            writeFileSync(
              `${dir}/roles.json`,
              JSON.stringify(
                await page.locator("[role]").evaluateAll((es) =>
                  es
                    .filter((e) => e.getClientRects().length)
                    .map((e) => ({
                      tag: e.tagName,
                      role: e.getAttribute("role"),
                      aria: e.getAttribute("aria-label"),
                      text: e.textContent.slice(0, 65),
                      class: e.className?.baseVal ?? e.className,
                      keys: e.getAttribute("aria-keyshortcuts"),
                    })),
                ),
                null,
                2,
              ),
            );
            break;
          case "dumpControls":
            writeFileSync(
              `${dir}/controls.json`,
              JSON.stringify(
                await page.locator("input,select,textarea,button").evaluateAll((es) =>
                  es
                    .filter((e) => e.getClientRects().length)
                    .map((e) => ({
                      tag: e.tagName,
                      type: e.getAttribute("type"),
                      aria: e.getAttribute("aria-label"),
                      label: e.labels ? [...e.labels].map((l) => l.textContent.trim()).join(" | ") : "",
                      text: e.tagName === "BUTTON" ? e.textContent.trim() : "",
                      value: e.value,
                      options:
                        e.tagName === "SELECT"
                          ? [...e.options].map((o) => ({ value: o.value, text: o.label }))
                          : undefined,
                    })),
                ),
                null,
                2,
              ),
            );
            break;
          case "dump":
            writeFileSync(`${dir}/${a.name ?? "ui"}.txt`, await page.locator("body").innerText());
            break;
          case "history":
            await click({ name: "File" });
            await click({ name: "Version history…", role: "menuitem" });
            break;
          case "importComparison": {
            const event = page.waitForEvent("filechooser");
            await click({ name: "Import comparison…" });
            await (await event).setFiles(a.path);
            await wait(600);
            break;
          }
          case "documentSettings":
            await click({ name: "File" });
            await click({ name: "Document settings…", role: "menuitem" });
            break;
          case "exportPreview":
            await click({ name: "File" });
            await click({ name: "Export", role: "menuitem" });
            await click({ name: "Preview export…", role: "menuitem" });
            break;
          case "openFile": {
            await click({ name: "File" });
            await click({ name: "Open", role: "menuitem" });
            const event = page.waitForEvent("filechooser");
            await click({ name: "Diagram…", role: "menuitem" });
            await (await event).setFiles(`output/demo-refresh/${id}/${a.filename}`);
            await current();
            await wait(800);
            break;
          }
          case "checkpoint":
            await op({ op: "history" });
            await loc({ label: "New version name" }).fill(a.name);
            await click({ name: "Create version" });
            await wait(300);
            await click({ name: "Close version history" });
            break;
          case "symbolContextMenu": {
            const point = await page.evaluate(() => {
              const e = document.querySelector(".cm-content");
              const v = e?.cmTile?.root?.view ?? e?.cmView?.view;
              const b = v.coordsAtPos(v.state.selection.main.head);
              if (!b) throw Error("No cursor coordinates");
              return { x: b.left + 2, y: (b.top + b.bottom) / 2 };
            });
            await page.mouse.click(point.x, point.y, { button: "right" });
            await wait(200);
            break;
          }
          case "command":
            await click({ name: "Commands" });
            await loc({ label: "Search commands" }).fill(a.value);
            if (a.run) await page.keyboard.press("Enter");
            break;
          case "collabStart": {
            await click({ name: "Collaborate" });
            await loc({ label: "Your name" }).fill("Course owner");
            await click({ name: "Advanced: use a different collaboration service" });
            await loc({ label: "Collaboration service" }).fill("http://localhost:8787");
            await click({ name: "Create private room" });
            await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 20000 });
            vars.editor = await loc({ label: "Editor link" }).inputValue();
            vars.viewer = await loc({ label: "Viewer link" }).inputValue();
            await click({ name: "Close collaboration" });
            break;
          }
          case "collabJoin": {
            await guestContext?.close();
            guestContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
            guest = await guestContext.newPage();
            await guest.goto(vars[a.role ?? "viewer"]);
            await guest.getByLabel("Your name").fill(a.role === "editor" ? "Course editor" : "Course viewer");
            await guest
              .getByRole("button", { name: a.role === "editor" ? "Join as editor" : "Join as viewer", exact: true })
              .click();
            await expect(guest.getByText("Connected", { exact: true })).toBeVisible({ timeout: 20000 });
            await guest.getByRole("button", { name: "Close collaboration", exact: true }).click();
            await wait(600);
            if (a.role !== "editor") {
              await expect(guest.locator(".cm-content")).toHaveAttribute("contenteditable", "false");
            }
            await click({ name: "Collaborate" });
            await page
              .getByRole("region", { name: "Connected participants" })
              .getByText(a.role === "editor" ? "Course editor" : "Course viewer", { exact: true })
              .waitFor();
            break;
          }
          case "guestView": {
            const buffer = await guest.screenshot({ path: `${dir}/guest.png` });
            await page.evaluate(
              (data) => {
                let e = document.querySelector("#lesson-guest");
                if (!e) {
                  e = document.createElement("div");
                  e.id = "lesson-guest";
                  e.style =
                    "position:fixed;z-index:2147483644;inset:40px 60px 95px;background:#132c35;padding:35px;box-shadow:0 0 0 100vw #000b;color:white;font:24px Arial";
                  document.body.append(e);
                }
                e.replaceChildren();
                const h = document.createElement("div");
                h.textContent = "Second browser session · actual recorded state";
                const img = document.createElement("img");
                img.src = data;
                img.style = "width:100%;height:calc(100% - 45px);object-fit:contain";
                e.append(h, img);
              },
              "data:image/png;base64," + buffer.toString("base64"),
            );
            break;
          }
          case "guestSaveLocal": {
            await guest.evaluate(() =>
              Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true }),
            );
            const event = guest.waitForEvent("download");
            await guest.getByRole("button", { name: "Save a local copy", exact: true }).click();
            await (await event).saveAs(`output/demo-refresh/${id}/${a.filename}`);
            break;
          }
          case "guestOpenFile": {
            await guest.evaluate(() =>
              Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true }),
            );
            await guest.getByRole("button", { name: "File", exact: true }).click();
            await guest.getByRole("menuitem", { name: "Open", exact: true }).click();
            const event = guest.waitForEvent("filechooser");
            await guest.getByRole("menuitem", { name: "Diagram…", exact: true }).click();
            await (await event).setFiles(`output/demo-refresh/${id}/${a.filename}`);
            await expect(guest.getByText("Preview current", { exact: true })).toBeVisible({ timeout: 30000 });
            await expect
              .poll(() =>
                guest.evaluate(
                  () => document.querySelector(".cm-content")?.cmTile?.root?.view?.state.doc.toString() ?? "",
                ),
              )
              .toContain(a.contains);
            writeFileSync(
              `${dir}/local-copy-verification.json`,
              JSON.stringify({ saved: a.filename, reopened: true, expectedSource: a.contains }),
            );
            break;
          }
          case "guestHide":
            await page.locator("#lesson-guest").evaluateAll((es) => es.forEach((e) => e.remove()));
            break;
          case "guestEdit": {
            await click({ name: "Close collaboration" });
            const editor = guest.locator(".cm-content");
            await editor.click();
            await guest.keyboard.press("ControlOrMeta+Home");
            await guest.keyboard.press("ControlOrMeta+a");
            await guest.keyboard.insertText(
              (await read()).replace("Customer portal launch", "Customer portal shared launch"),
            );
            await expect.poll(read).toContain("Customer portal shared launch");
            await current();
            break;
          }
          case "guestReplace": {
            const next = (await read()).replace(a.from, a.to);
            await guest.locator(".cm-content").click();
            await guest.keyboard.press("ControlOrMeta+a");
            await guest.keyboard.insertText(next);
            await expect.poll(read).toBe(next);
            break;
          }
          case "concurrentEdit": {
            await click({ name: "Close collaboration" });
            await op({
              op: "cursor",
              value: "title Customer portal launch",
              offset: "title Customer portal launch".length,
            });
            await guest.locator(".cm-content").click();
            await guest.keyboard.press("ControlOrMeta+Home");
            await guest.keyboard.press("ArrowDown");
            await guest.keyboard.press("End");
            await Promise.all([page.keyboard.insertText(" / owner note"), guest.keyboard.insertText(" / editor note")]);
            await expect.poll(read).toContain("owner note");
            await expect.poll(read).toContain("editor note");
            const guestRead = () =>
              guest.evaluate(() => document.querySelector(".cm-content").cmTile.root.view.state.doc.toString());
            await expect.poll(guestRead).toBe(await read());
            writeFileSync(
              `${dir}/concurrent-verification.json`,
              JSON.stringify({ converged: true, ownerSource: await read(), guestSource: await guestRead() }, null, 2),
            );
            await current();
            break;
          }
          case "independentMembers": {
            await click({ name: "Close collaboration" });
            const nav = guest.getByRole("complementary", { name: "Document navigator" });
            await nav.locator('button:has(small:has-text("gantt"))').first().click();
            await op({ op: "openMember", kind: "wbs" });
            const other = await guest.evaluate(() =>
              document.querySelector(".cm-content").cmTile.root.view.state.doc.toString(),
            );
            if (!(await read()).startsWith("@startwbs") || !other.startsWith("@startgantt"))
              throw Error("Member navigation was not independent");
            writeFileSync(
              `${dir}/navigation-verification.json`,
              JSON.stringify({ owner: "wbs", guest: "gantt", independent: true }),
            );
            break;
          }
          case "guestReconnect":
            await guestContext.setOffline(true);
            await wait(1000);
            await guestContext.setOffline(false);
            await wait(1800);
            await guest.getByRole("button", { name: /Collaborate|\d+ online/ }).click();
            await expect(guest.getByText("Connected", { exact: true })).toBeVisible({ timeout: 20000 });
            break;
          case "collabRevoke":
            await guest.getByRole("button", { name: /Collaborate|\d+ online/ }).click();
            await click({ name: "Collaborate" });
            await click({ name: "Revoke link and create new" });
            await click({ name: "Revoke and create new link" });
            await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 20000 });
            await expect(guest.getByText("Collaboration stopped", { exact: true })).toBeVisible({ timeout: 20000 });
            writeFileSync(`${dir}/guest-revocation.txt`, await guest.locator("body").innerText());
            break;
          case "fillDraft":
            await loc(a).first().fill(String(a.value));
            break;
          case "fill": {
            const field = loc(a).filter({ visible: true }).first();
            await field.fill(String(a.value));
            await field.press("Tab");
            break;
          }
          case "select":
            await loc(a).first().selectOption(a.value);
            break;
          case "selectIndex":
            await loc(a).first().selectOption({ index: a.index });
            break;
          case "selectMatching": {
            const l = loc(a).first();
            await l.waitFor({ state: "visible" });
            const options = await l
              .locator("option")
              .evaluateAll((es) => es.map((e) => ({ value: e.value, text: e.label || e.textContent })));
            const chosen = options.find((x) => new RegExp(a.pattern, "i").test(x.text));
            if (!chosen) throw Error("No matching option: " + a.pattern + "; options=" + JSON.stringify(options));
            await l.selectOption(chosen.value);
            break;
          }
          case "selectReviewGroups": {
            const groups = page
              .getByRole("dialog", { name: "Version history" })
              .locator(".semantic-review input[type=checkbox]");
            for (const box of await groups.all()) if (await box.isEnabled()) await box.check();
            break;
          }
          case "check":
            await loc(a)
              .first()
              .setChecked(a.value !== false);
            break;
          case "key":
            await page.keyboard.press(a.value);
            break;
          case "cursor": {
            const text = await read();
            const index = text.indexOf(a.value);
            if (index < 0) throw Error("Cursor text missing: " + a.value);
            const prefix = text.slice(0, index + (a.offset ?? 1));
            await page.locator(".cm-content").click();
            await page.keyboard.press("ControlOrMeta+Home");
            for (let i = 0; i < prefix.split("\n").length - 1; i++) await page.keyboard.press("ArrowDown");
            await page.keyboard.press("Home");
            for (let i = 0; i < prefix.split("\n").at(-1).length; i++) await page.keyboard.press("ArrowRight");
            break;
          }
          case "type":
            await page.keyboard.insertText(a.value);
            break;
          case "viewport":
            await page.setViewportSize({ width: a.width, height: a.height });
            await wait(500);
            break;
          case "offline":
            await context.setOffline(a.value !== false);
            break;
          case "reload": {
            const overlays = await page.evaluate(() => ({
              styles: [...document.querySelectorAll("style")]
                .filter((e) => e.textContent.includes("#lesson-footer"))
                .map((e) => e.textContent),
              html: [...document.querySelectorAll('[id^="lesson-"]')].map((e) => e.outerHTML).join(""),
            }));
            await page.reload();
            await wait(800);
            for (const css of overlays.styles) await page.addStyleTag({ content: css });
            await page.evaluate((html) => document.body.insertAdjacentHTML("beforeend", html), overlays.html);
            break;
          }
          case "mobileStart": {
            await wait(1200);
            guestContext = await browser.newContext({
              viewport: { width: 430, height: 900 },
              isMobile: true,
              hasTouch: true,
              storageState: await context.storageState(),
            });
            guest = await guestContext.newPage();
            await guest.goto(page.url());
            await guest.getByRole("region", { name: "Mobile task list", exact: true }).waitFor();
            break;
          }
          case "guestClick":
            await guest
              .getByRole(a.role ?? "button", { name: a.name, exact: a.exact !== false })
              .first()
              .click();
            break;
          case "guestFill":
            await guest
              .getByLabel(a.label, { exact: a.exact === true })
              .and(guest.locator("input,select,textarea"))
              .first()
              .fill(a.value);
            break;
          case "guestDump":
            writeFileSync(`${dir}/${a.name ?? "guest-ui"}.txt`, await guest.locator("body").innerText());
            break;
          case "guestAssertText":
            await expect(guest.getByText(a.value, { exact: false }).first()).toBeVisible();
            break;
          case "backup": {
            await click({ name: "File" });
            const event = page.waitForEvent("download");
            await click({ name: "Workspace backup…", role: "menuitem" });
            await (await event).saveAs(`output/demo-refresh/${id}/portal-workspace-backup.json`);
            break;
          }
          case "fileHandleSave": {
            await click({ name: "File" });
            await click({ name: "Save as…", role: "menuitem" });
            await expect
              .poll(
                () =>
                  page.evaluate(async () => {
                    const h = await window.trainingFileHandle();
                    return (await h.getFile()).size;
                  }),
                { timeout: 15000 },
              )
              .toBeGreaterThan(0);
            const bytes = await page.evaluate(async () =>
              Array.from(new Uint8Array(await (await (await window.trainingFileHandle()).getFile()).arrayBuffer())),
            );
            writeFileSync(`output/demo-refresh/${id}/portal-file-handle-practice.pumlu`, Buffer.from(bytes));
            break;
          }
          case "externalFileWrite": {
            const bytes = Array.from(readFileSync(`output/demo-refresh/${id}/portal-offline-practice.pumlu`));
            await page.evaluate(async (bytes) => {
              const h = await window.trainingFileHandle();
              const writer = await h.createWritable();
              await writer.write(new Uint8Array(bytes));
              await writer.close();
            }, bytes);
            const away = await context.newPage();
            await away.goto("about:blank");
            await page.bringToFront();
            await away.close();
            await wait(1500);
            await click({ name: "Save" });
            await page.getByRole("dialog").waitFor({ timeout: 15000 });
            break;
          }
          case "restoreBackup": {
            await click({ name: "File" });
            const event = page.waitForEvent("filechooser");
            await click({ name: "Workspace restore…", role: "menuitem" });
            await (await event).setFiles(`output/demo-refresh/${id}/portal-workspace-backup.json`);
            await wait(800);
            break;
          }
          case "clipboardPermission":
            await context.grantPermissions(["clipboard-read", "clipboard-write"]);
            break;
          case "clipboardPreview": {
            const text = await page.evaluate(() => navigator.clipboard.readText());
            if (a.contains && !text.includes(a.contains)) throw Error("Clipboard did not include " + a.contains);
            writeFileSync(`${dir}/clipboard.txt`, text);
            await page.evaluate((text) => {
              let e = document.querySelector("#lesson-clipboard");
              if (!e) {
                e = document.createElement("div");
                e.id = "lesson-clipboard";
                e.style =
                  "position:fixed;z-index:2147483646;inset:120px 250px;background:#103a40;color:#eef8f5;padding:35px;box-shadow:0 0 0 100vw #0008;font:22px monospace;overflow:auto;white-space:pre-wrap";
                document.body.append(e);
              }
              e.textContent = "Actual clipboard content · verification preview\n\n" + text;
            }, text);
            break;
          }
          case "clipboardImagePreview": {
            await expect
              .poll(() => page.evaluate(async () => (await navigator.clipboard.read()).flatMap((i) => i.types)), {
                timeout: 15000,
              })
              .toContain("image/png");
            const result = await page.evaluate(async () => {
              const items = await navigator.clipboard.read();
              const item = items.find((i) => i.types.includes("image/png"));
              if (!item) throw Error("No PNG on clipboard");
              const blob = await item.getType("image/png");
              const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
              const bitmap = await createImageBitmap(blob);
              const width = bitmap.width,
                height = bitmap.height;
              bitmap.close();
              const old = document.querySelector("#lesson-clipboard-image");
              old?.remove();
              const panel = document.createElement("div");
              panel.id = "lesson-clipboard-image";
              Object.assign(panel.style, {
                position: "fixed",
                inset: "120px 180px",
                zIndex: 2147483646,
                background: "#fff",
                border: "3px solid #39866e",
                padding: "35px",
                overflow: "auto",
              });
              const title = document.createElement("h2");
              title.textContent = `Actual clipboard PNG: ${width} × ${height}`;
              panel.append(title);
              const image = document.createElement("img");
              image.src = URL.createObjectURL(blob);
              image.style.maxWidth = "100%";
              panel.append(image);
              document.body.append(panel);
              return { bytes, width, height };
            });
            writeFileSync(`${dir}/clipboard.png`, Buffer.from(result.bytes));
            writeFileSync(
              `${dir}/clipboard-image-verification.json`,
              JSON.stringify(
                { mimeType: "image/png", bytes: result.bytes.length, width: result.width, height: result.height },
                null,
                2,
              ),
            );
            break;
          }
          case "clipboardHide":
            await page.locator("#lesson-clipboard-image").evaluateAll((es) => es.forEach((e) => e.remove()));
            await page.locator("#lesson-clipboard").evaluateAll((es) => es.forEach((e) => e.remove()));
            break;
          case "followDiagramLink": {
            writeFileSync(
              `${dir}/rendered-links.json`,
              JSON.stringify(
                await page.locator("svg a").evaluateAll((es) =>
                  es.map((e) => ({
                    href: e.getAttribute("href") ?? e.getAttributeNS("http://www.w3.org/1999/xlink", "href"),
                    text: e.textContent,
                  })),
                ),
                null,
                2,
              ),
            );
            const anchor = page.locator("svg a").first();
            await anchor.focus();
            [guest] = await Promise.all([context.waitForEvent("page"), anchor.press("Enter")]);
            await guest.waitForLoadState("domcontentloaded");
            if (guest.url() !== a.url) throw Error("Unexpected diagram destination: " + guest.url());
            if (!(await guest.evaluate(() => window.opener === null))) throw Error("Destination retained an opener");
            const confirmation = dialogs.find((d) => d.type === "confirm" && d.message.includes(a.url));
            if (!confirmation) throw Error("No destination confirmation");
            writeFileSync(
              `${dir}/link-verification.json`,
              JSON.stringify(
                { destination: guest.url(), confirmation: confirmation.message, newTab: true, noOpener: true },
                null,
                2,
              ),
            );
            await op({
              op: "note",
              value: "Browser confirmed the destination · opened a separate tab with no opener.",
            });
            break;
          }
          case "cacheReady":
            await page.evaluate(async () => {
              await navigator.serviceWorker.ready;
            });
            await expect
              .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20000 })
              .toBe(true);
            break;
          case "press":
            await loc(a).first().press(a.value);
            break;
          case "moveObject": {
            const from = await loc(a.from).first().boundingBox(),
              to = await loc(a.to).first().boundingBox();
            if (!from || !to) throw Error("Missing object move target");
            await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
            await page.mouse.down();
            await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 30 });
            await page.mouse.up();
            await wait(500);
            break;
          }
          case "wait":
            await wait(a.ms ?? 500);
            break;
          case "waitHistoryRendered":
            await expect(page.locator(".version-render-canvas svg")).toHaveCount(2, { timeout: 60000 });
            await wait(1000);
            break;
          case "current":
            await current();
            break;
          case "source":
            await source(a.value, a.allowErrors);
            break;
          case "replace": {
            const old = await read();
            if (!old.includes(a.from)) throw Error("Missing replacement text: " + a.from);
            await source(old.replace(a.from, a.to), a.allowErrors);
            break;
          }
          case "append": {
            const old = await read();
            await source(old.replace(/\n(@end\w+)\s*$/, "\n" + a.value + "\n$1"));
            break;
          }
          case "inspect":
            await page.locator(`[data-task-id="${a.id}"][role="button"]`).first().press("Enter");
            await wait(150);
            await expect(page.locator('[aria-label="Task inspector"]').first()).toBeVisible();
            break;
          case "multiSelect":
            await click({ css: `[data-task-id="${a.ids[0]}"]` });
            await page.keyboard.down("Shift");
            for (const id of a.ids.slice(1)) await click({ css: `[data-task-id="${id}"]` });
            await page.keyboard.up("Shift");
            break;
          case "multiObjects":
            await click(a.targets[0]);
            await page.keyboard.down("Shift");
            for (const target of a.targets.slice(1)) await click(target);
            await page.keyboard.up("Shift");
            break;
          case "bulkStyle": {
            const panel = page.getByRole("complementary", { name: "Selected elements inspector", exact: true });
            await panel.waitFor();
            const before = await read();
            const stereotype = panel.getByLabel("Stereotype", { exact: true });
            if (await stereotype.count()) {
              await stereotype.fill("training");
              await panel.getByRole("button", { name: "Set stereotype", exact: true }).click();
            } else {
              await panel.locator("input").first().fill("LightBlue");
              await panel.getByRole("button", { name: "Set color", exact: true }).click();
            }
            await expect.poll(read).not.toBe(before);
            await current();
            break;
          }
          case "submitDialog": {
            const form = page.getByRole("dialog").last();
            const submit = form.locator('button[type="submit"]');
            if (await submit.count()) await submit.first().click();
            else
              await form
                .getByRole("button", { name: /^(Add |Create |Apply$)/ })
                .first()
                .click();
            await wait(300);
            break;
          }
          case "fillDialogName": {
            const form = page.getByRole("dialog").last();
            const name = form.getByLabel("Name", { exact: false }).and(form.locator("input,textarea"));
            if (await name.count()) await name.first().fill(a.value);
            else await form.locator('input:not([type]),input[type="text"],textarea').first().fill(a.value);
            break;
          }
          case "drag": {
            const target = page.locator(`[data-task-id="${a.id}"]`).first();
            const b = await target.boundingBox();
            if (!b) throw Error("Missing drag target");
            await page.mouse.move(b.x + b.width * (a.resize ? 0.95 : 0.5), b.y + b.height / 2);
            await page.mouse.down();
            if (a.shift) await page.keyboard.down("Shift");
            await page.mouse.move(
              b.x + b.width * (a.resize ? 0.95 : 0.5) + (a.dx ?? 45),
              b.y + b.height / 2 + (a.dy ?? 0),
              { steps: 30 },
            );
            await page.mouse.up();
            if (a.shift) await page.keyboard.up("Shift");
            await wait(600);
            break;
          }
          case "note":
            await page.evaluate((t) => {
              document.querySelector("#lesson-note").textContent = t;
              document.querySelector("#lesson-note").style.display = t ? "block" : "none";
            }, a.value);
            break;
          case "card":
            await page.evaluate((a) => {
              const el = document.querySelector("#lesson-card");
              el.replaceChildren();
              el.style.display = a.title ? "grid" : "none";
              if (a.title) {
                const div = document.createElement("div");
                const h = document.createElement("h1");
                h.textContent = a.title;
                div.append(h);
                for (const text of a.items ?? []) {
                  const p = document.createElement("p");
                  p.textContent = text;
                  div.append(p);
                }
                el.append(div);
              }
            }, a);
            break;
          case "focus": {
            const l = page.locator(".cm-line").filter({ hasText: a.value }).first();
            await page
              .locator(".lesson-emphasis")
              .evaluateAll((es) => es.forEach((e) => e.classList.remove("lesson-emphasis")));
            await l.evaluate((e) => e.classList.add("lesson-emphasis"));
            break;
          }
          case "assertDisabled":
            await expect(loc(a).first()).toBeDisabled();
            break;
          case "assertSourceOccurrences":
            await expect.poll(async () => (await read()).split(a.value).length - 1).toBe(a.count);
            break;
          case "activateTab":
            await page.locator(".document-tabs > button").nth(a.index).click();
            await current();
            break;
          case "assertSource":
            await expect.poll(read, { timeout: 5000 }).toContain(a.value);
            break;
          case "assertSourceAbsent":
            await expect.poll(read, { timeout: 5000 }).not.toContain(a.value);
            break;
          case "rememberSource":
            vars[a.key] = await read();
            break;
          case "assertSourceChanged":
            await expect.poll(read, { timeout: 5000 }).not.toBe(vars[a.key]);
            break;
          case "assertSourceSame":
            if ((await read()) !== vars[a.key]) throw Error("Source unexpectedly changed: " + a.key);
            break;
          case "saveFile": {
            await click({ name: "File" });
            const event = page.waitForEvent("download", { timeout: 20000 });
            await click({ name: "Save as…", role: "menuitem" });
            const d = await event;
            await d.saveAs(`output/demo-refresh/${id}/${a.filename ?? d.suggestedFilename()}`);
            break;
          }
          case "rememberField":
            vars[a.key] = await loc(a).first().inputValue();
            break;
          case "assertField":
            await expect(loc(a).first()).toHaveValue(a.value);
            break;
          case "assertFieldMatches":
            await expect(loc(a).first()).toHaveValue(new RegExp(a.pattern));
            break;
          case "assertFieldChanged":
            await expect.poll(() => loc(a).first().inputValue()).not.toBe(vars[a.key]);
            break;
          case "assertSourceOrder": {
            const t = await read();
            if (t.indexOf(a.first) < 0 || t.indexOf(a.second) < 0 || t.indexOf(a.first) >= t.indexOf(a.second))
              throw Error("Unexpected source order");
            break;
          }
          case "assertRememberedField":
            if ((await loc(a).first().inputValue()) !== vars[a.key]) throw Error("Field changed: " + a.key);
            break;
          case "assertTextAbsent":
            await expect(page.getByText(a.value, { exact: false }).first()).not.toBeVisible();
            break;
          case "assertText":
            await expect(page.getByText(a.value, { exact: false }).first()).toBeVisible();
            break;
          case "download": {
            const event = page.waitForEvent("download");
            await click(a);
            const d = await event;
            await d.saveAs(`output/demo-refresh/${id}/${a.filename ?? d.suggestedFilename()}`);
            break;
          }
          default:
            throw Error("Unknown operation " + a.op);
        }
      }
      try {
        await page.goto(scene.url ?? "http://127.0.0.1:5232");
        if (scene.chooser !== true)
          await page
            .getByRole("dialog")
            .getByRole("button", { name: (scene.kind ?? lesson.kind ?? "Gantt") + " diagram", exact: true })
            .click();
        if (!scene.chooser) {
          await page.getByRole("button", { name: "Settings", exact: true }).click();
          const settings = page.getByRole("dialog", { name: "Settings", exact: true });
          await settings.getByRole("spinbutton", { name: "Font size (px)", exact: true }).fill("18");
          await settings.getByRole("checkbox", { name: "Word wrap", exact: true }).check();
          await settings.getByRole("button", { name: "Apply", exact: true }).click();
          if (scene.source) await source(scene.source);
        }
        for (const a of scene.setup ?? []) await op(a);
        await page.addStyleTag({
          content: `#lesson-footer{position:fixed;z-index:2147483645;bottom:0;left:0;right:0;height:72px;background:#0b1724;color:#eef8f5;border-top:3px solid #96dfc6;padding:20px 35px;font:600 22px Arial;pointer-events:none}#lesson-note{display:none;position:fixed;z-index:2147483646;bottom:100px;left:35%;max-width:1000px;background:#103a40;color:#e4fff6;border:1px solid #96dfc6;border-radius:10px;padding:20px;font:600 25px/1.4 Arial;pointer-events:none}#lesson-card{display:none;position:fixed;z-index:2147483646;inset:0 0 72px;background:#0b1724f5;color:#eef6ef;place-items:center;font-family:Arial;padding:110px;pointer-events:none}#lesson-card div{width:1500px}#lesson-card h1{font-size:70px;line-height:1.15;margin:0 0 45px}#lesson-card p{font-size:32px;line-height:1.5;color:#c5dbdc}.lesson-emphasis{background:#bbebd8!important;outline:2px solid #39866e}#lesson-pointer{position:fixed;z-index:2147483647;pointer-events:none;width:26px;height:32px;transform:translate(-100px,-100px);filter:drop-shadow(1px 2px 2px #0007)}`,
        });
        await page.evaluate(
          ({ id, title }) => {
            for (const name of ["footer", "note", "card", "pointer"]) {
              const e = document.createElement("div");
              e.id = "lesson-" + name;
              document.body.append(e);
            }
            document.querySelector("#lesson-footer").textContent = `DEMO · ${title}`;
            document.querySelector("#lesson-pointer").innerHTML =
              '<svg width="26" height="32"><path d="M3 2L22 17l-8 1 5 10-4 2-5-10-7 6z" fill="#10272b" stroke="#fff" stroke-width="2"/></svg>';
            addEventListener(
              "mousemove",
              (e) =>
                (document.querySelector("#lesson-pointer").style.transform =
                  `translate(${e.clientX - 3}px,${e.clientY - 2}px)`),
              true,
            );
          },
          { id, title: scene.title },
        );
        cdp = await context.newCDPSession(page);
        cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
          if (capturing) {
            const file = `f${String(frames.length).padStart(6, "0")}.jpg`;
            frames.push({ file, ts: metadata.timestamp });
            writeFileSync(`${dir}/frames/${file}`, Buffer.from(data, "base64"));
          }
          await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
        });
        capturing = true;
        await cdp.send("Page.startScreencast", {
          format: "jpeg",
          quality: 94,
          maxWidth: 1920,
          maxHeight: 1080,
          everyNthFrame: 1,
        });
        const start = Date.now() / 1000;
        await wait(300);
        for (const step of scene.steps ?? []) {
          const began = Date.now() / 1000 - start;
          for (const a of step.actions) await op(a);
          await wait(250);
          actions.push({ sentence: step.at ?? 0, actual: began, ended: Date.now() / 1000 - start });
          await wait(400);
        }
        await wait(500);
        await page.screenshot({ path: `${dir}/end.png` });
        await cdp.send("Page.stopScreencast");
        capturing = false;
        writeFileSync(
          `${dir}/take.json`,
          JSON.stringify(
            {
              id: scene.id,
              start,
              end: Date.now() / 1000,
              frames,
              actions,
              dialogs,
              source: scene.chooser ? null : await read(),
              checks: scene.checks ?? [],
            },
            null,
            2,
          ),
        );
        console.log(`RECORDED ${id}/${scene.id}: ${frames.length} frames`);
      } catch (e) {
        await page.screenshot({ path: `${dir}/failure.png` });
        writeFileSync(`${dir}/failure.txt`, String(e) + "\n" + (await page.locator("body").innerText()));
        throw e;
      } finally {
        await guestContext?.close();
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  server?.kill();
}
