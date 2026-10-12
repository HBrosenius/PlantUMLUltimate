import { test, expect } from "@playwright/test";
import { prepareEditor, setSource, source, readEditorSource } from "./editor-helpers";

for (const secondKind of ["Gantt", "Sequence"]) {
  test(`restores per-document zoom and both scroll axes across tabs and reload (${secondKind})`, async ({ page }) => {
    test.setTimeout(90_000);
    await prepareEditor(page);
    const a = source(Array.from({ length: 50 }, (_, i) => `[First ${i}] lasts 60 days`).join("\n"));
    const b =
      secondKind === "Gantt"
        ? a.replaceAll("First", "Second")
        : "@startuml\nparticipant Alice\nparticipant Bob\n" +
          Array.from({ length: 50 }, (_, i) => `Alice -> Bob: Message ${i}`).join("\n") +
          "\n@enduml";
    await setSource(page, a);
    const viewport = page.locator(".workspace .preview-viewport");
    const zoom = page.getByRole("button", { name: /Reset zoom/ });
    const choosePosition = async (left: number, top: number) => {
      await zoom.click();
      for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
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
    const tabs = page.locator(".document-tabs > button:not(.new-tab)");
    await tabs.first().click();
    await checkPosition(120, 280, aZoom!);
    await tabs.nth(1).click();
    await checkPosition(80, 180, bZoom!);
    await page.reload();
    await checkPosition(80, 180, bZoom!);
    expect(await readEditorSource(page)).toBe(b);
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
