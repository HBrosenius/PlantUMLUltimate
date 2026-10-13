import { test, expect } from "@playwright/test";
import { prepareEditor, setSource, source, readEditorSource, fillSource, waitForDiagramRender } from "./editor-helpers";

const diagrams: Record<string, string> = {
  Gantt: source(Array.from({ length: 50 }, (_, i) => `[Second ${i}] lasts 60 days`).join("\n")),
  Sequence:
    "@startuml\nparticipant Alice\nparticipant Bob\n" +
    Array.from({ length: 50 }, (_, i) => `Alice -> Bob: Message ${i}`).join("\n") +
    "\n@enduml",
  Class:
    "@startuml\n" +
    Array.from({ length: 20 }, (_, i) => `class Item${i}\n${i ? `Item${i - 1} --> Item${i}` : ""}`).join("\n") +
    "\n@enduml",
  Component:
    "@startuml\n" +
    Array.from({ length: 20 }, (_, i) => `component Item${i}\n${i ? `Item${i - 1} --> Item${i}` : ""}`).join("\n") +
    "\n@enduml",
  Activity: "@startuml\nstart\n" + Array.from({ length: 30 }, (_, i) => `:Step ${i};`).join("\n") + "\nstop\n@enduml",
  "Use Case":
    "@startuml\n" +
    Array.from({ length: 20 }, (_, i) => `usecase Item${i}\n${i ? `Item${i - 1} --> Item${i}` : ""}`).join("\n") +
    "\n@enduml",
  WBS:
    "@startwbs\n* Project\n" +
    Array.from({ length: 2 }, (_, branch) =>
      Array.from({ length: 12 }, (_, depth) => `${"*".repeat(depth + 2)} B${branch} item ${depth}`).join("\n"),
    ).join("\n") +
    "\n@endwbs",
};

for (const [secondKind, original] of Object.entries(diagrams)) {
  test(`restores per-document zoom and both scroll axes across tabs and reload (${secondKind})`, async ({ page }) => {
    test.setTimeout(120_000);
    await prepareEditor(page);
    const a = source(Array.from({ length: 50 }, (_, i) => `[First ${i}] lasts 60 days`).join("\n"));
    let b = original;
    await setSource(page, a);
    const viewport = page.locator(".workspace .preview-viewport");
    const zoom = page.getByRole("button", { name: /Reset zoom/ });
    const choosePosition = async (left: number, top: number) => {
      await zoom.click();
      for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      // WBS trees can be much wider than they are tall; zoom until both axes can be exercised.
      for (let i = 0; i < 80; i++) {
        const fits = await viewport.evaluate(
          (element, position) =>
            element.scrollWidth - element.clientWidth > position.left &&
            element.scrollHeight - element.clientHeight > position.top,
          { left, top },
        );
        if (fits) break;
        await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      }
      await viewport.evaluate(async (element) => {
        await Promise.all(
          [...element.querySelectorAll(".diagram")].flatMap((diagram) =>
            diagram.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
          ),
        );
      });
      await expect
        .poll(() => viewport.evaluate((element) => element.scrollWidth - element.clientWidth))
        .toBeGreaterThan(left);
      await expect
        .poll(() => viewport.evaluate((element) => element.scrollHeight - element.clientHeight))
        .toBeGreaterThan(top);
      await viewport.evaluate(
        (element, position) => {
          element.scrollLeft = position.left;
          element.scrollTop = position.top;
        },
        { left, top },
      );
      await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBe(left);
      await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(top);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const session = JSON.parse(localStorage.getItem("plantuml-studio.workspace.recovery.v6") ?? "{}");
            return session.documents?.find((doc: { id: string }) => doc.id === session.activeDocumentId)?.diagramScroll;
          }),
        )
        .toEqual({ left, top });
      return await zoom.textContent();
    };
    const checkPosition = async (left: number, top: number, label: string) => {
      await expect(zoom).toHaveText(label);
      await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBe(left);
      await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(top);
    };
    const aZoom = await choosePosition(120, 280);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${secondKind} diagram`, exact: true })
      .click();
    await setSource(page, b);
    const bZoom = await choosePosition(80, 180);
    const edited = b.replace("\n", "\n' Navigation revision\n");
    await fillSource(page, edited);
    await waitForDiagramRender(page);
    await checkPosition(80, 180, bZoom!);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => readEditorSource(page)).toBe(b);
    await waitForDiagramRender(page);
    await checkPosition(80, 180, bZoom!);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect.poll(() => readEditorSource(page)).toBe(edited);
    await waitForDiagramRender(page);
    await checkPosition(80, 180, bZoom!);
    b = edited;
    const tabs = page.locator(".document-tabs > button:not(.new-tab)");
    await tabs.first().click();
    await checkPosition(120, 280, aZoom!);
    await tabs.nth(1).click();
    await checkPosition(80, 180, bZoom!);
    // Make the first recovered SVG arrive before its viewport has usable dimensions.
    // Recovery must retry when layout becomes available without another React render.
    await page.addInitScript(() => {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          const style = document.createElement("style");
          style.id = "navigation-delayed-layout";
          style.textContent = ".workspace .preview-viewport { width: 0 !important; height: 0 !important; }";
          document.head.append(style);
        },
        { once: true },
      );
    });
    await page.reload();
    await expect(page.locator(".preview[data-render-status]")).toHaveAttribute("data-render-status", "idle", {
      timeout: 45_000,
    });
    await expect(page.locator(".diagram svg")).toHaveCount(1);
    await page.locator("#navigation-delayed-layout").evaluate((element) => element.remove());
    await checkPosition(80, 180, bZoom!);
    expect(await readEditorSource(page)).toBe(b);
    const objectAttribute: Record<string, string> = {
      Gantt: "data-task-id",
      Sequence: "data-sequence-participant-id",
      Class: "data-class-object-id",
      Component: "data-class-object-id",
      Activity: "data-activity-object-id",
      "Use Case": "data-usecase-object-id",
      WBS: "data-wbs-node-id",
    };
    const selectable = page
      .locator(`.diagram svg [${objectAttribute[secondKind]}][role="button"][tabindex="0"]`)
      .first();
    await selectable.dispatchEvent("click");
    const inspector = page.locator(".task-inspector:visible").first();
    await expect(inspector).toBeVisible();
    await inspector
      .getByRole("button", { name: /^Close/ })
      .first()
      .click();

    await tabs.first().click();
    await checkPosition(120, 280, aZoom!);
    expect(await readEditorSource(page)).toBe(a);
    const modes = page.getByRole("navigation", { name: "View mode", exact: true });
    await modes.getByRole("button", { name: "Code", exact: true }).click();
    await expect(viewport).toHaveCount(0);
    await modes.getByRole("button", { name: "Split", exact: true }).click();
    await checkPosition(120, 280, aZoom!);
    await page.getByRole("button", { name: "Fit diagram", exact: true }).click();
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(0);
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBe(0);
  });
}
