import { expect, test } from "@playwright/test";
import { prepareEditor, readEditorSource } from "./editor-helpers";

test("Plan opens existing Gantt tools, restores focus and retains alternate routes", async ({ page }, testInfo) => {
  await prepareEditor(page);
  const initial = await readEditorSource(page);
  const plan = page.getByRole("button", { name: "Plan", exact: true });
  const menu = page.getByRole("menu", { name: "Plan", exact: true });
  await plan.focus();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Calendar & schedule…",
    "Workload…",
    "Reports…",
    "What-if scenario…",
    "Jira…",
  ]);
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  if (testInfo.project.name === "chromium") {
    await page.screenshot({ path: testInfo.outputPath("plan-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(plan).toBeInViewport();
    await expect(menu.getByRole("menuitem").last()).toBeInViewport();
    const bounds = await menu.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath("plan-phone.png") });
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await menu.getByRole("menuitem").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Close project inspector" })).toBeVisible();
  await page.getByRole("button", { name: "Close project inspector" }).click();
  await expect(plan).toBeFocused();
  for (const [action, close] of [
    ["Workload…", "Close resource workload"],
    ["Reports…", "Close reports"],
    ["What-if scenario…", "Close what-if scenario"],
    ["Jira…", "Close Jira integration"],
  ]) {
    await plan.click();
    await menu.getByRole("menuitem", { name: action, exact: true }).click();
    await expect(menu).toBeHidden();
    await page.getByRole("button", { name: close, exact: true }).click();
  }
  expect(await readEditorSource(page)).toBe(initial);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Reports…" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Help", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  const commands = page.getByRole("dialog", { name: /command/i });
  await commands.getByRole("combobox").fill("What-if scenario");
  await commands.getByRole("option", { name: /What-if scenario/ }).click();
  await expect(page.getByRole("dialog", { name: "What-if scenario", exact: true })).toBeVisible();
});

test("Plan offers WBS linking and hides planning tools on other diagram types", async ({ page }) => {
  await prepareEditor(page);
  for (const kind of ["WBS", "Sequence"]) {
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${kind} diagram` })
      .click();
    const plan = page.getByRole("button", { name: "Plan", exact: true });
    if (kind === "Sequence") {
      await expect(plan).toHaveCount(0);
      break;
    }
    await plan.click();
    const menu = page.getByRole("menu", { name: "Plan", exact: true });
    await expect(menu.getByRole("menuitem")).toHaveText(["Create Gantt chart from WBS"]);
    await menu.getByRole("menuitem", { name: "Create Gantt chart from WBS" }).click();
    const dialog = page.getByRole("dialog", { name: "Create document from WBS", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Linked diagrams", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Create Gantt chart from WBS" })).toBeVisible();
    await page.keyboard.press("Escape");
  }
});
