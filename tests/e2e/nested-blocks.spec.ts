import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor } from "./editor-helpers";

for (const [type, body, faulty, repaired, label] of [
  ["Sequence", "participant A\nparticipant B\nalt Ready\n  A -> B: Work\n  edn", "edn", "end", "Use end"],
  ["Activity", "start\nwhile (ready?)\n  :Work;\nendwhil (no)\nstop", "endwhil", "endwhile", "Use endwhile"],
  [
    "Sequence",
    "participant A\nparticipant B\nalt Ready\n  note over A\n    Explanation\n  end note\n  end note\n  A -> B: Work\nend",
    "  end note\n  end note",
    "  end note",
    "Remove duplicated block terminator",
  ],
] as const) {
  test(`${type} ${label} preserves source on undo`, async ({ page }) => {
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${type} diagram` })
      .click();
    const source = `@startuml\n${body}\n@enduml`;
    await fillSource(page, source);
    await page.getByLabel("Show source fix suggestions").click();
    await page.getByRole("button", { name: new RegExp(label) }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(source.replace(faulty, repaired).split("\n"));
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
  });
}
