import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor } from "./editor-helpers";

for (const type of ["Class", "Component", "Use case", "Sequence"]) {
  test(`${type} arrow shaft repair restores exact source on undo`, async ({ page }) => {
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${type} diagram` })
      .click();
    const declarations =
      type === "Class"
        ? ["class A", "class B"]
        : type === "Component"
          ? ["component A", "component B"]
          : type === "Use case"
            ? ["actor A", "usecase B"]
            : ["participant A", "participant B"];
    const label = type === "Sequence" ? ": Message" : "";
    const lines = ["@startuml", ...declarations, `A > B${label}`, "@enduml"];
    await fillSource(page, lines.join("\n"));
    await page.getByLabel("Show source fix suggestions").click();
    await page.getByRole("button", { name: /Add arrow shaft/ }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText([
      "@startuml",
      ...declarations,
      `A -> B${label}`,
      "@enduml",
    ]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
  });
}
