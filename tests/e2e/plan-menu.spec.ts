import { expect, test } from "@playwright/test";
import { openRibbonGroup, prepareEditor, readEditorSource } from "./editor-helpers";

test("Plan opens existing Gantt tools and restores command focus", async ({ page }) => {
  await prepareEditor(page);
  const initial = await readEditorSource(page);
  for (const [action, close] of [
    ["Calendar & schedule", "Close project inspector"],
    ["Workload", "Close resource workload"],
    ["Reports…", "Close reports"],
    ["What-if scenario…", "Close what-if scenario"],
    ["Jira…", "Close Jira integration"],
  ]) {
    await openRibbonGroup(page, "Plan", "Planning tools");
    const command = page.getByRole("button", { name: action, exact: true });
    await command.click();
    await page.getByRole("button", { name: close, exact: true }).click();
    await expect(command).toBeFocused();
  }
  expect(await readEditorSource(page)).toBe(initial);
  await expect(page.getByRole("button", { name: "More", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  const commands = page.getByRole("dialog", { name: /command/i });
  await commands.getByRole("combobox").fill("What-if scenario");
  await commands.getByRole("option", { name: /What-if scenario/ }).click();
  await expect(page.getByRole("dialog", { name: "What-if scenario", exact: true })).toBeVisible();
});

test("Plan retains one WBS linking destination and explains applicability to Sequence", async ({ page }) => {
  await prepareEditor(page);
  for (const kind of ["WBS", "Sequence"]) {
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${kind} diagram` })
      .click();
    if (kind === "Sequence") {
      await openRibbonGroup(page, "Plan", "Planning tools");
      await expect(page.getByText("Planning tools are for Gantt and WBS diagrams.", { exact: true })).toBeVisible();
    } else {
      await openRibbonGroup(page, "Plan", "Linked diagrams");
      const create = page.getByRole("button", { name: "Create Gantt chart from WBS", exact: true });
      await expect(create).toHaveCount(1);
      await create.click();
      const dialog = page.getByRole("dialog", { name: "Create document from WBS", exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(create).toBeFocused();
    }
  }
});
