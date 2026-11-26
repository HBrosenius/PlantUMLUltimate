import { expect, test, type Page } from "./coverage";
import { fillSource, prepareEditor, readEditorSource, setSource } from "./editor-helpers";

const SOURCE = `@startuml
!include <C4/C4_Container>
Person(customer, "Customer")
System_Boundary(shop, "Web shop") {
  Container(web, "Web app", "React")
  Container(api, "API", "Java")
}
Rel(customer, web, "Uses", "HTTPS")
Rel(web, api, "Calls")
@enduml
`;

async function openHistory(page: Page) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  return page.getByRole("dialog", { name: "Version history" });
}

test("version history reviews C4 edits as elements and relationships, not lines", async ({ page }) => {
  test.setTimeout(120_000);
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await chooser.getByRole("button", { name: "C4 diagram", exact: true }).click();
  await chooser.getByRole("button", { name: "Create diagram", exact: true }).click();
  await expect(chooser).toBeHidden();
  // The new diagram's starter is the first version; each step below is reviewed against it.
  const starter = await readEditorSource(page);
  expect(starter).toContain('Container(web, "Web app"');
  const relabelled = starter.replace('Container(web, "Web app"', 'Container(web, "Storefront"');
  const renamed = relabelled.replace(/\bapi\b/g, "orders_api");
  expect(renamed).not.toBe(relabelled);

  await fillSource(page, relabelled);
  let history = await openHistory(page);
  await expect(history.getByText("Change container `web`: label", { exact: true })).toBeVisible();
  await expect(history.getByRole("checkbox", { name: "Select Change container `web`: label" })).toBeEnabled();
  await expect(history).toContainText('label "Web app" → "Storefront"');
  await history.getByRole("button", { name: "Close version history" }).click();

  await fillSource(page, renamed);
  history = await openHistory(page);
  await expect(history.getByText("Rename `api` → `orders_api` (part 1)", { exact: true })).toBeVisible();
  // A rename touches the declaration and every reference, so its parts cannot be accepted one by one.
  await expect(history.getByRole("checkbox", { name: "Select Rename `api` → `orders_api` (part 1)" })).toBeDisabled();
  expect(await readEditorSource(page)).toBe(renamed);
});

// Every GitHub call is answered here: the real API is never contacted and no real token is used.
const TOKEN = "github_pat_e2e_fake_token";
const EDITED = SOURCE.replace('"Web app"', '"Storefront"').replace(/\bapi\b/g, "orders_api");
const OPENED_BLOB = "1".repeat(40);
const base64 = (text: string) => Buffer.from(text, "utf8").toString("base64");

async function mockGitHub(page: Page) {
  await page.route("https://api.github.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const reply = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(data) });
    switch (`${request.method()} ${url.pathname}`) {
      case "GET /user":
        return reply({ login: "octo-e2e" });
      case "GET /user/repos":
        return reply([{ full_name: "octo-e2e/diagrams", name: "diagrams", owner: { login: "octo-e2e" } }]);
      case "GET /repos/octo-e2e/diagrams/contents/docs/shop.puml":
        return reply({
          type: "file",
          name: "shop.puml",
          path: "docs/shop.puml",
          sha: OPENED_BLOB,
          size: SOURCE.length,
          encoding: "base64",
          content: base64(SOURCE),
        });
      case `GET /repos/octo-e2e/diagrams/git/blobs/${OPENED_BLOB}`:
        return reply({ sha: OPENED_BLOB, encoding: "base64", content: base64(SOURCE) });
      default:
        return reply({ message: "Not Found" }, 404);
    }
  });
}

test("the Propose description lists C4 groups from the source diff", async ({ page }) => {
  test.setTimeout(120_000);
  await mockGitHub(page);
  await prepareEditor(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("button", { name: "GitHub", exact: true }).click();
  await settings.getByLabel("GitHub token").fill(TOKEN);
  await settings.getByRole("button", { name: "Test connection" }).click();
  await expect(settings.getByRole("status")).toContainText("Connected as octo-e2e");
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Commands" }).click();
  await page
    .getByRole("dialog", { name: /command/i })
    .getByRole("combobox")
    .fill("Open from GitHub");
  await page.keyboard.press("Enter");
  const open = page.getByRole("dialog", { name: "Open from GitHub" });
  await open.getByLabel("File link").fill("https://github.com/octo-e2e/diagrams/blob/main/docs/shop.puml");
  await open.getByRole("button", { name: "Open link" }).click();
  await expect(open).toBeHidden();
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);

  await setSource(page, EDITED);
  await page.getByTestId("github-origin").getByRole("button", { name: "Propose change…" }).click();
  const dialog = page.getByRole("dialog", { name: "Propose change on GitHub" });
  await dialog.getByText("Description preview").click();
  const body = dialog.getByTestId("github-propose-body");
  await expect(body).toContainText("## Diagram changes");
  await expect(body).toContainText("Change container");
  await expect(body).toContainText("Storefront");
  await expect(body).toContainText("orders_api");
  await expect(body).not.toContainText("Unclassified source change");
});
