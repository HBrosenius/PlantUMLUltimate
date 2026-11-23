import { expect, test, type Page } from "./coverage";
import { prepareEditor, readEditorSource, setSource } from "./editor-helpers";

// Every GitHub call is answered here: the real API is never contacted and no real token is used.
const TOKEN = "github_pat_e2e_fake_token";
const SOURCE = "@startuml\nAlice -> Bob : hello\n@enduml\n";
const EDITED = "@startuml\nAlice -> Bob : hello\nBob -> Carol : forward\n@enduml\n";
const NEW_BLOB = "3".repeat(40);
const HEAD = "2".repeat(40);
const PR_URL = "https://github.com/octo-e2e/diagrams/pull/12";
const REPO = "/repos/octo-e2e/diagrams";

const fromBase64 = (text: string) => Buffer.from(text, "base64").toString("utf8");

type Call = { method: string; path: string; body: Record<string, unknown> | undefined };

async function mockGitHub(page: Page, options: { exists?: boolean } = {}) {
  const calls: Call[] = [];
  let commits = 0;
  await page.route("https://api.github.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    expect(request.headers()["authorization"]).toBe(`Bearer ${TOKEN}`);
    const body = request.postData() ? (JSON.parse(request.postData()!) as Record<string, unknown>) : undefined;
    calls.push({ method: request.method(), path: url.pathname, body });
    const reply = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(data) });
    const pull = { number: 12, html_url: PR_URL, state: "open" };
    switch (`${request.method()} ${url.pathname}`) {
      case "GET /user":
        return reply({ login: "octo-e2e" });
      case "GET /user/repos":
        return reply([{ full_name: "octo-e2e/diagrams", name: "diagrams", owner: { login: "octo-e2e" } }]);
      case `GET ${REPO}/branches`:
        return reply([{ name: "main" }, { name: "develop" }]);
      case `GET ${REPO}/contents/docs/new.puml`:
        if (!options.exists) return reply({ message: "Not Found" }, 404);
        return reply({
          type: "file",
          name: "new.puml",
          path: "docs/new.puml",
          sha: "9".repeat(40),
          size: 3,
          encoding: "base64",
          content: Buffer.from("abc").toString("base64"),
        });
      case `GET ${REPO}/git/blobs/${NEW_BLOB}`:
        return reply({ sha: NEW_BLOB, encoding: "base64", content: Buffer.from(SOURCE).toString("base64") });
      case `GET ${REPO}/git/ref/heads/main`:
        return reply({ ref: "refs/heads/main", object: { sha: HEAD } });
      case `POST ${REPO}/git/refs`:
        return reply({ ref: body!.ref }, 201);
      case `PUT ${REPO}/contents/docs/new.puml`:
        commits += 1;
        return reply({ content: { sha: String(commits + 2).repeat(40) } });
      case `POST ${REPO}/pulls`:
        return reply(pull, 201);
      case `GET ${REPO}/pulls/12`:
      case `PATCH ${REPO}/pulls/12`:
        return reply(pull);
      default:
        return reply({ message: "Not Found" }, 404);
    }
  });
  return calls;
}

async function addToken(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("button", { name: "GitHub", exact: true }).click();
  await settings.getByLabel("GitHub token").fill(TOKEN);
  await settings.getByRole("button", { name: "Test connection" }).click();
  await expect(settings.getByRole("status")).toContainText("Connected as octo-e2e");
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
}

async function openNewFileDialog(page: Page) {
  await page.getByRole("button", { name: "Commands" }).click();
  await page
    .getByRole("dialog", { name: /command/i })
    .getByRole("combobox")
    .fill("Propose as new file");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Propose as new file on GitHub" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function chooseRepository(page: Page, dialog: ReturnType<Page["getByRole"]>) {
  await dialog.getByLabel("Repository").selectOption("octo-e2e/diagrams");
  await expect(dialog.getByLabel("Base branch")).toHaveValue("main");
}

test("without a token the dialog links to Settings, and the File menu offers the item for an unlinked tab", async ({
  page,
}) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Propose as new file on GitHub…" })).toBeVisible();
  await page.keyboard.press("Escape");
  const dialog = await openNewFileDialog(page);
  await expect(dialog).toContainText("Contents and Pull requests set to Read and write");
  await dialog.getByRole("button", { name: "Open Settings → GitHub" }).click();
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
});

test("proposes a new diagram as a new file, links the tab, then adds a commit to the pull request", async ({
  page,
}) => {
  const calls = await mockGitHub(page);
  await prepareEditor(page);
  await addToken(page);
  await setSource(page, SOURCE);

  const dialog = await openNewFileDialog(page);
  await chooseRepository(page, dialog);
  await expect(dialog.getByLabel("File path")).toHaveValue(/\.puml$/);
  await dialog.getByLabel("File path").fill("docs/new.puml");
  await dialog.getByLabel("New branch name").fill("plantuml/new-e2e");
  await dialog.getByLabel("Commit message").fill("Add new.puml");
  await dialog.getByLabel("Pull request title").fill("Add new.puml");
  await dialog.getByText("Description preview").click();
  await expect(dialog.getByTestId("github-propose-body")).toContainText("## New diagram file");
  await expect(dialog.getByTestId("github-propose-body")).toContainText("Alice -> Bob : hello");
  calls.length = 0;
  await dialog.getByRole("button", { name: "Open pull request" }).click();

  await expect(dialog.getByRole("status")).toContainText("Opened pull request #12 in octo-e2e/diagrams.");
  await expect(dialog.getByRole("status")).toContainText(
    "Next: review and merge it on GitHub. Until it is merged, the file is only on branch plantuml/new-e2e, not on main.",
  );
  await expect(dialog.getByRole("link", { name: "Open pull request #12 on GitHub" })).toHaveAttribute("href", PR_URL);
  expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
    `GET ${REPO}/contents/docs/new.puml`,
    `GET ${REPO}/git/ref/heads/main`,
    `POST ${REPO}/git/refs`,
    `PUT ${REPO}/contents/docs/new.puml`,
    `POST ${REPO}/pulls`,
  ]);
  expect(calls[2]!.body).toEqual({ ref: "refs/heads/plantuml/new-e2e", sha: HEAD });
  expect(calls[3]!.body).not.toHaveProperty("sha");
  expect(calls[3]!.body).toMatchObject({ branch: "plantuml/new-e2e", message: "Add new.puml" });
  expect(fromBase64(String(calls[3]!.body!.content))).toBe(SOURCE);
  expect(calls[4]!.body).toMatchObject({ title: "Add new.puml", head: "plantuml/new-e2e", base: "main" });
  expect(String(calls[4]!.body!.body)).toContain("<details><summary>Source</summary>");
  await dialog.getByRole("button", { name: "Close" }).click();

  // The tab is linked to the new file and its pull request.
  const origin = page.getByTestId("github-origin");
  await expect(origin).toContainText("GitHub · octo-e2e/diagrams · main · docs/new.puml");
  await expect(origin.getByRole("link", { name: "PR #12" })).toHaveAttribute("href", PR_URL);

  // Propose change adds a commit to that pull request, guarded by the new blob.
  calls.length = 0;
  await setSource(page, EDITED);
  await origin.getByRole("button", { name: "Propose change…" }).click();
  const propose = page.getByRole("dialog", { name: "Propose change on GitHub" });
  await expect(propose).toContainText("Adds a commit to pull request #12");
  await propose.getByRole("button", { name: "Add commit" }).click();
  await expect(propose.getByRole("status")).toContainText("Added a commit to pull request #12");
  const writes = calls.filter((call) => call.method !== "GET");
  expect(writes.map((call) => `${call.method} ${call.path}`)).toEqual([
    `PUT ${REPO}/contents/docs/new.puml`,
    `PATCH ${REPO}/pulls/12`,
  ]);
  expect(writes[0]!.body).toMatchObject({ branch: "plantuml/new-e2e", sha: NEW_BLOB });
  expect(fromBase64(String(writes[0]!.body!.content))).toBe(EDITED);
  expect(await readEditorSource(page)).toBe(EDITED);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(TOKEN);
});

test("a path that already exists is refused and nothing is written", async ({ page }) => {
  const calls = await mockGitHub(page, { exists: true });
  await prepareEditor(page);
  await addToken(page);
  await setSource(page, SOURCE);
  const dialog = await openNewFileDialog(page);
  await chooseRepository(page, dialog);
  await dialog.getByLabel("File path").fill("docs/new.puml");
  await dialog.getByLabel("New branch name").fill("plantuml/new-e2e");
  await dialog.getByRole("button", { name: "Open pull request" }).click();
  await expect(dialog.getByRole("alert")).toContainText("docs/new.puml already exists on main");
  await expect(dialog.getByRole("alert")).toContainText("Open from GitHub");
  expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
  await dialog.getByLabel("File path").fill("/docs/new.puml");
  await expect(dialog.getByRole("button", { name: "Open pull request" })).toBeDisabled();
  await expect(dialog).toContainText("remove the slash at the start");
});
