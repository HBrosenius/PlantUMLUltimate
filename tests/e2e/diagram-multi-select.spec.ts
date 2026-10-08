import { expect, test } from "@playwright/test";
import { prepareEditor, setSource, waitForDiagramRender } from "./editor-helpers";

const fixtures = [
  {
    kind: "sequence",
    body: 'participant "One" as A\nparticipant "Two" as B\nA -> B : Hello',
    attribute: "data-sequence-participant-id",
  },
  { kind: "usecase", body: 'actor "One" as A\nusecase "Two" as B\nA --> B', attribute: "data-usecase-object-id" },
  {
    kind: "class",
    body: 'class "One" as A {\n +field: String\n}\nclass "Two" as B\nA --> B',
    attribute: "data-class-object-id",
  },
  { kind: "component", body: 'component "One" as A\ncomponent "Two" as B\nA --> B', attribute: "data-class-object-id" },
  { kind: "activity", body: ":One;\n:Two;", attribute: "data-activity-object-id" },
  { kind: "wbs", body: "* Root\n**(A) One\n**(B) Two", attribute: "data-wbs-node-id" },
];
for (const fixture of fixtures) {
  test(`${fixture.kind}: multi-select, bulk style, copy/paste and undo`, async ({ page, browserName }) => {
    // This workflow performs several renders plus cache restores. WebKit's
    // engine startup and layout take longer even when each render is bounded.
    if (browserName === "webkit") test.setTimeout(180_000);
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    const names: Record<string, string> = {
      sequence: "Sequence diagram",
      usecase: "Use Case diagram",
      class: "Class diagram",
      component: "Component diagram",
      activity: "Activity diagram",
      wbs: "WBS diagram",
    };
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: new RegExp(names[fixture.kind]!) })
      .click();
    const envelope = fixture.kind === "wbs" ? "wbs" : "uml";
    await setSource(page, `@start${envelope}\n${fixture.body}\n@end${envelope}`);
    const editor = page.locator(".cm-content");
    const first =
      fixture.kind === "wbs"
        ? page.locator('.diagram .wbs-node-hit[data-wbs-node-id="wbs-1"]')
        : fixture.attribute === "data-class-object-id"
          ? page.locator('.diagram .class-semantic-hit[data-class-object-id="a"]').first()
          : page.locator(`.diagram [${fixture.attribute}][role="button"][aria-label*="One"]`).first();
    const second =
      fixture.kind === "wbs"
        ? page.locator('.diagram .wbs-node-hit[data-wbs-node-id="wbs-2"]')
        : fixture.attribute === "data-class-object-id"
          ? page.locator('.diagram .class-semantic-hit[data-class-object-id="b"]').first()
          : page.locator(`.diagram [${fixture.attribute}][role="button"][aria-label*="Two"]`).first();
    const clickElement = async (element: typeof first, shift = false, button: "left" | "right" = "left") => {
      const measuredPointer = browserName === "webkit" && ["component", "activity"].includes(fixture.kind);
      await waitForDiagramRender(page);
      // Undo and selection can rebuild the SVG between visibility, measurement and
      // clicking. Retry the entire operation so each attempt measures the current target.
      await expect(async () => {
        try {
          await expect(element).toBeVisible({ timeout: 1_000 });
          if (!measuredPointer) {
            await element.scrollIntoViewIfNeeded({ timeout: 1_000 });
          }
          const box = await element.boundingBox();
          expect(box).toBeTruthy();
          if (measuredPointer) {
            // Avoid WebKit's unstable SVG scrolling path; these small fixtures
            // are already visible. Keep real pointer and modifier events.
            if (shift) await page.keyboard.down("Shift");
            try {
              await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height * 0.5, { button });
            } finally {
              if (shift) await page.keyboard.up("Shift");
            }
            return;
          }
          await element.click({
            position: { x: box!.width * 0.25, y: box!.height * 0.5 },
            modifiers: shift ? ["Shift"] : [],
            button,
            timeout: 1_000,
            // WBS text and its transparent hit rect share a semantic ID but paint in different orders by engine.
            force: fixture.kind === "wbs",
          });
        } catch (error) {
          console.log(`Click failure: ${String(error).slice(0, 1500)}`);
          throw error;
        }
      }).toPass({ timeout: browserName === "webkit" ? 25_000 : 5_000 });
    };
    await expect(first).toBeVisible();
    await clickElement(first);
    await clickElement(second, true);
    const inspector = page.getByRole("complementary", { name: "Selected elements inspector" });
    const activate = async (button: ReturnType<typeof inspector.getByRole>) => {
      if (browserName === "webkit") await button.press("Enter");
      else await button.click();
    };
    await expect(inspector).toBeVisible();
    await expect(inspector.getByText("2 elements selected")).toBeVisible();
    await inspector.getByLabel("Color", { exact: true }).fill("Orange");
    await activate(inspector.getByRole("button", { name: "Set color", exact: true }));
    await expect(page.locator(".statusbar")).toContainText("Updated 2 elements");
    await expect(editor).toContainText("#Orange");
    await activate(page.getByRole("button", { name: "Undo", exact: true }));
    await expect(editor).not.toContainText("#Orange");
    await clickElement(first);
    await clickElement(second, true);
    // Use the inspector to avoid text-editor clipboard handling after undo restores focus.
    await activate(inspector.getByRole("button", { name: "Copy", exact: true }));
    await expect(page.locator(".statusbar")).toContainText("Copied 2 elements");
    await activate(inspector.getByRole("button", { name: "Paste", exact: true }));
    await expect(page.locator(".statusbar")).toContainText("Pasted");
    await expect.poll(async () => (await editor.innerText()).match(/One/g)?.length ?? 0).toBe(2);
    if (fixture.kind !== "activity") await expect(editor).toContainText("A_copy");
    if (fixture.kind === "class")
      await expect.poll(async () => (await editor.innerText()).match(/field: String/g)?.length ?? 0).toBe(2);
    await activate(page.getByRole("button", { name: "Undo", exact: true }));
    await expect.poll(async () => (await editor.innerText()).match(/One/g)?.length ?? 0).toBe(1);
    if (fixture.kind === "wbs") await expect(page.locator(".diagram .wbs-node-hit")).toHaveCount(3);
    await clickElement(first);
    await clickElement(second, true);
    await expect(inspector.getByText("2 elements selected")).toBeVisible();
    await clickElement(second, false, "right");
    const menu = page.getByRole("menu", { name: "Symbol actions" });
    await menu.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
    await expect(page.locator(".statusbar")).toContainText("Duplicated");
    await expect.poll(async () => (await editor.innerText()).match(/One/g)?.length ?? 0).toBe(2);
    await expect.poll(async () => (await editor.innerText()).match(/Two/g)?.length ?? 0).toBe(2);
    if (fixture.kind === "wbs") await expect(editor).toContainText("**(A_copy) One");
    await activate(page.getByRole("button", { name: "Undo", exact: true }));
    await expect.poll(async () => (await editor.innerText()).match(/One/g)?.length ?? 0).toBe(1);
  });
}

test("modifier keyboard selection toggles and text fields retain native clipboard shortcuts", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: /Class diagram/ })
    .click();
  await setSource(page, "@startuml\nclass One\nclass Two\n@enduml");
  const first = page.locator('.diagram g[data-class-hit-id="one"][tabindex]');
  const second = page.locator('.diagram g[data-class-hit-id="two"][tabindex]');
  await first.press("Enter");
  await expect(page.getByRole("complementary", { name: "Class object inspector" })).toBeVisible();
  await second.press("Shift+Enter");
  const inspector = page.getByRole("complementary", { name: "Selected elements inspector" });
  await expect(inspector).toBeVisible();
  await inspector.getByLabel("Stereotype", { exact: true }).fill("service");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.locator(".cm-content")).not.toContainText("copy");
  await second.press("ControlOrMeta+c");
  await second.press("ControlOrMeta+v");
  await expect(page.locator(".cm-content")).toContainText("One_copy");
  await page.keyboard.press("Escape");
  await expect(inspector).toHaveCount(0);
});
