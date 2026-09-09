import { expect, type Page } from "@playwright/test";

export const source = (body: string) => `@startgantt\nProject starts 2026-09-01\n${body}\n@endgantt`;

export async function prepareEditor(page: Page) {
  await page.goto("/");
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await expect(chooser).toBeVisible();
  await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveCount(0);
  await chooser.getByRole("button", { name: "Gantt diagram" }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.locator(".statusbar")).toContainText("IndexedDB");
  await page.getByRole("button", { name: "Close project inspector" }).click();
}

export async function fillSource(page: Page, value: string, visibleText = value) {
  const editor = page.locator(".cm-content");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await editor.fill(value);
    try {
      await expect.poll(() => editor.innerText(), { timeout: 2_000 }).toContain(visibleText);
      return;
    } catch {
      // CodeMirror can reject a synthetic replacement while it is reconciling a previous transaction.
    }
    await editor.fill("");
  }
  await expect.poll(() => editor.innerText()).toContain(visibleText);
}

export async function setSource(page: Page, value: string) {
  await fillSource(page, value);
  await expect(page.locator(".diagram svg")).toBeVisible();
  await expect(page.locator(".diagram svg")).not.toContainText("Syntax Error");
}

export async function openAddDialog(page: Page, item: "Task…" | "Milestone…" | "Divider…") {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menu", { name: "Add" }).getByRole("menuitem", { name: item }).click();
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
