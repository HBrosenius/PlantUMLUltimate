import { prepareEditor } from "./editor-helpers";
import { expect, test } from "./coverage";

test("Help credits every bundled source and links to the full notices served by the app", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "Help", exact: true }).click();
  const help = page.getByRole("dialog", { name: "PlantUML Ultimate Help" });
  await help.getByText("Credits and licences").click();
  for (const name of ["PlantUML", "C4-PlantUML", "PlantUML themes"])
    await expect(help.getByRole("link", { name, exact: true })).toHaveAttribute("href", /^https:\/\//);
  const notices = help.getByRole("link", { name: /Full notices and licence texts/ });
  await expect(notices).toHaveAttribute("href", "/third-party-notices.txt");

  // The notices are a local file of the app, not a remote page.
  const response = await page.request.get("/third-party-notices.txt");
  expect(response.ok()).toBe(true);
  const text = await response.text();
  expect(text).toContain("# Third-party notices");
  expect(text).toContain("## C4-PlantUML");
  expect(text).toContain("| sunlust | Artem V. Ageev | GPL 3+ |");
});
