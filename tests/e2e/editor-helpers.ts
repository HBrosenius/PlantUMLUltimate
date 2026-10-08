import { expect, type Page } from "@playwright/test";

export const source = (body: string) => `@startgantt\nProject starts 2026-09-01\n${body}\n@endgantt`;

export async function prepareEditor(page: Page) {
  await page.goto("/");
  const onboarding = page.getByRole("dialog", { name: "Welcome to PlantUML Ultimate" });
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await Promise.race([onboarding.waitFor({ state: "visible" }), chooser.waitFor({ state: "visible" })]);
  if (await onboarding.isVisible()) {
    // Tests need the Code view, which basic mode hides; opt into advanced mode during onboarding.
    await onboarding.getByRole("radio", { name: "Diagram + code" }).check();
    await onboarding.getByRole("button", { name: "Get started" }).click();
  }
  await expect(chooser).toBeVisible();
  await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveCount(0);
  await chooser.getByRole("button", { name: "Gantt diagram" }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.locator(".statusbar")).toContainText("Browser recovery");
  await page.getByRole("button", { name: "Close project inspector" }).click();
}

export async function readEditorSource(page: Page) {
  return page.evaluate(async () => {
    const modulePath = "/node_modules/.vite/deps/@codemirror_view.js";
    const { EditorView } = await import(modulePath);
    return EditorView.findFromDOM(document.querySelector(".cm-editor"))?.state.doc.toString() ?? "";
  });
}

export async function fillSource(page: Page, value: string, _visibleText?: string) {
  value = value.replace(/\r\n?/g, "\n");
  const editor = page.locator(".cm-content");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // Insert through CodeMirror's keyboard input path. WebKit's contenteditable fill can add a trailing line.
    await editor.focus();
    await editor.press("ControlOrMeta+a");
    await page.keyboard.insertText(value);
    try {
      await expect.poll(() => readEditorSource(page), { timeout: 2_000 }).toBe(value.replace(/\r\n/g, "\n"));
      return;
    } catch {
      // CodeMirror can reject a synthetic replacement while it is reconciling a previous transaction.
    }
  }
  await expect.poll(() => readEditorSource(page)).toBe(value.replace(/\r\n/g, "\n"));
}

export async function setSource(page: Page, value: string) {
  await fillSource(page, value);
  await waitForDiagramRender(page);
  // A cold renderer may spend 15s starting and up to 30s rendering before
  // reporting its own bounded failure, particularly on WebKit.
  await expect(page.locator(".diagram svg")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".diagram svg")).not.toContainText("Syntax Error");
}

export async function waitForDiagramRender(page: Page) {
  await expect(page.locator(".preview[data-render-status]")).toHaveAttribute("data-render-status", "idle", {
    timeout: 45_000,
  });
}

export async function openAddDialog(page: Page, item: "Task…" | "Milestone…" | "Divider…") {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menu", { name: "Add" }).getByRole("menuitem", { name: item }).click();
}

export async function linkedDiagramMenu(page: Page) {
  const trigger = page.getByRole("button", { name: "Linked diagrams" });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  return page.getByRole("menu", { name: "Linked diagrams", exact: true });
}

export async function pointInText(page: Page, lineIndex: number, needle: string) {
  return page
    .locator(".cm-content .cm-line")
    .nth(lineIndex)
    .evaluate((line, searched) => {
      const fullText = line.textContent ?? "";
      const target = fullText.indexOf(searched);
      if (target < 0) throw new Error(`Could not find ${searched}`);
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let offset = target + Math.max(1, Math.floor(searched.length / 2));
      let node: Node | null = walker.nextNode();
      while (node) {
        const length = node.textContent?.length ?? 0;
        if (offset <= length) {
          const range = document.createRange();
          range.setStart(node, offset);
          range.setEnd(node, Math.min(length, offset + 1));
          const rect = range.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        offset -= length;
        node = walker.nextNode();
      }
      throw new Error(`Could not locate ${searched}`);
    }, needle);
}
