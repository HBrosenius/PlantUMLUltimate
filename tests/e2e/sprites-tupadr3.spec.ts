import { readFileSync } from "node:fs";
import { regenerateTupadr3Icon, type Tupadr3Entry } from "../../apps/web/src/render/tupadr3-icons";
import { expect, test } from "./coverage";
import { fillSource, prepareEditor } from "./editor-helpers";

const stdlib = "apps/web/src/render/stdlib/tupadr3";
const body = (text: string) => text.replace(/^@startuml\n/, "").replace(/\n@enduml$/, "");

test("an icon regenerated from the packed data renders through the real engine", async ({ page }) => {
  test.setTimeout(90_000);
  const bucket = JSON.parse(readFileSync(`${stdlib}/font-awesome-5/bucket-tu.json`, "utf8")) as Record<
    string,
    Tupadr3Entry
  >;
  const icon = regenerateTupadr3Icon("font-awesome-5", "user", bucket.user!);
  await prepareEditor(page);
  await fillSource(
    page,
    [
      "@startuml",
      body(readFileSync(`${stdlib}/common.puml`, "utf8")),
      body(icon),
      'FA5_USER(u, "Customer")',
      "@enduml",
    ].join("\n"),
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            [...document.querySelectorAll(".diagram svg image")].filter((image) =>
              (image.getAttribute("href") ?? image.getAttribute("xlink:href"))?.startsWith("data:image/png;base64,"),
            ).length,
        ),
      { timeout: 45_000 },
    )
    .toBe(1);
  await expect(page.locator(".diagram svg")).toContainText("Customer");
  await expect(page.locator(".render-notice.error")).toHaveCount(0);
});
