import { expect, test, type Page } from "./coverage";
import { prepareEditor, readEditorSource, setSource } from "./editor-helpers";

// Every GitHub call is answered here: the real API is never contacted and no real token is used.
const TOKEN = "github_pat_e2e_fake_token";
const SOURCE = "@startuml\nAlice -> Bob : hello\n@enduml\n";
const EDITED = "@startuml\nAlice -> Bob : hello\nBob -> Carol : forward\n@enduml\n";
const OPENED_BLOB = "1".repeat(40);
const UPSTREAM_BLOB = "7".repeat(40);
const BRANCH_PATH = "/repos/octo-e2e/diagrams/git/refs/heads/plantuml/flow-e2e";
const HEAD = "2".repeat(40);
const PR_URL = "https://github.com/octo-e2e/diagrams/pull/12";

const base64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
const fromBase64 = (text: string) => Buffer.from(text, "base64").toString("utf8");

type Call = { method: string; path: string; body: Record<string, unknown> | undefined };

/**
 * `upstream`: the file changed on main after it was opened. A commit that does not carry the upstream blob sha is
 * refused with 409, and the file is then read at its newer version.
 */
async function mockGitHub(page: Page, options: { conflict?: boolean; upstream?: string } = {}) {
  const calls: Call[] = [];
  let commits = 0;
  let refused = false;
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
    const key = `${request.method()} ${url.pathname}`;
    const pull = { number: 12, html_url: PR_URL, state: "open" };
    switch (key) {
      case "GET /user":
        return reply({ login: "octo-e2e" });
      case "GET /user/repos":
        return reply([{ full_name: "octo-e2e/diagrams", name: "diagrams", owner: { login: "octo-e2e" } }]);
      case "GET /repos/octo-e2e/diagrams/contents/docs/flow.puml": {
        const newer = options.upstream !== undefined && refused;
        const content = newer ? options.upstream! : SOURCE;
        return reply({
          type: "file",
          name: "flow.puml",
          path: "docs/flow.puml",
          sha: newer ? UPSTREAM_BLOB : OPENED_BLOB,
          size: content.length,
          encoding: "base64",
          content: base64(content),
        });
      }
      case `GET /repos/octo-e2e/diagrams/git/blobs/${OPENED_BLOB}`:
        return reply({ sha: OPENED_BLOB, encoding: "base64", content: base64(SOURCE) });
      case "GET /repos/octo-e2e/diagrams/git/ref/heads/main":
        return reply({ ref: "refs/heads/main", object: { sha: HEAD } });
      case "POST /repos/octo-e2e/diagrams/git/refs":
        return reply({ ref: body!.ref }, 201);
      case "DELETE /repos/octo-e2e/diagrams/git/refs/heads/plantuml/flow-e2e":
        return route.fulfill({ status: 204, headers: cors });
      case "PUT /repos/octo-e2e/diagrams/contents/docs/flow.puml":
        if (options.conflict) return reply({ message: "does not match" }, 409);
        if (options.upstream !== undefined && body!.sha !== UPSTREAM_BLOB) {
          refused = true;
          return reply({ message: "does not match" }, 409);
        }
        commits += 1;
        return reply({ content: { sha: String(commits + 2).repeat(40) } });
      case "POST /repos/octo-e2e/diagrams/pulls":
        return reply(pull, 201);
      case "GET /repos/octo-e2e/diagrams/pulls/12":
      case "PATCH /repos/octo-e2e/diagrams/pulls/12":
        return reply(pull);
      default:
        return reply({ message: "Not Found" }, 404);
    }
  });
  return calls;
}

async function openFromGitHub(page: Page) {
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
  const dialog = page.getByRole("dialog", { name: "Open from GitHub" });
  await dialog.getByLabel("File link").fill("https://github.com/octo-e2e/diagrams/blob/main/docs/flow.puml");
  await dialog.getByRole("button", { name: "Open link" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);
}

test("proposes an edit as a pull request with the review as its description, then adds a commit to it", async ({
  page,
}) => {
  const calls = await mockGitHub(page);
  await prepareEditor(page);
  await openFromGitHub(page);
  await setSource(page, EDITED);

  const origin = page.getByTestId("github-origin");
  await origin.getByRole("button", { name: "Propose change…" }).click();
  const dialog = page.getByRole("dialog", { name: "Propose change on GitHub" });
  await expect(dialog).toContainText("opens a pull request into main in octo-e2e/diagrams");
  await dialog.getByLabel("Branch").fill("plantuml/flow-e2e");
  await dialog.getByLabel("Pull request title").fill("Add Carol to the flow");
  await dialog.getByText("Description preview").click();
  await expect(dialog.getByTestId("github-propose-body")).toContainText("## Diagram changes");
  await expect(dialog.getByTestId("github-propose-body")).toContainText("+Bob -> Carol : forward");
  await dialog.getByRole("button", { name: "Open pull request" }).click();

  await expect(dialog.getByRole("status")).toContainText("Opened pull request #12 in octo-e2e/diagrams.");
  await expect(dialog.getByRole("status")).toContainText(
    "Until it is merged, your change is only on branch plantuml/flow-e2e, not on main.",
  );
  await expect(dialog.getByRole("link", { name: "Open pull request #12 on GitHub" })).toHaveAttribute("href", PR_URL);
  const writes = calls.filter((call) => call.method !== "GET");
  expect(writes.map((call) => `${call.method} ${call.path}`)).toEqual([
    "POST /repos/octo-e2e/diagrams/git/refs",
    "PUT /repos/octo-e2e/diagrams/contents/docs/flow.puml",
    "POST /repos/octo-e2e/diagrams/pulls",
  ]);
  expect(writes[0]!.body).toEqual({ ref: "refs/heads/plantuml/flow-e2e", sha: HEAD });
  expect(writes[1]!.body).toMatchObject({ branch: "plantuml/flow-e2e", sha: OPENED_BLOB });
  expect(fromBase64(String(writes[1]!.body!.content))).toBe(EDITED);
  expect(writes[2]!.body).toMatchObject({ title: "Add Carol to the flow", head: "plantuml/flow-e2e", base: "main" });
  expect(String(writes[2]!.body!.body)).toContain("<details><summary>Source patch</summary>");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(origin.getByRole("link", { name: "PR #12" })).toHaveAttribute("href", PR_URL);

  // Proposing again adds a commit to the open pull request and updates its description.
  calls.length = 0;
  await setSource(page, `${EDITED.replace("@enduml", "Carol -> Alice : done\n@enduml")}`);
  await origin.getByRole("button", { name: "Propose change…" }).click();
  await expect(dialog).toContainText("Adds a commit to pull request #12");
  await expect(dialog.getByLabel("Branch")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Add commit" }).click();
  await expect(dialog.getByRole("status")).toContainText("Added a commit to pull request #12");
  const again = calls.filter((call) => call.method !== "GET");
  expect(again.map((call) => `${call.method} ${call.path}`)).toEqual([
    "PUT /repos/octo-e2e/diagrams/contents/docs/flow.puml",
    "PATCH /repos/octo-e2e/diagrams/pulls/12",
  ]);
  expect(again[0]!.body).toMatchObject({ branch: "plantuml/flow-e2e", sha: "3".repeat(40) });
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(TOKEN);
});

test("a file that changed upstream is not overwritten, and the empty branch is removed", async ({ page }) => {
  const calls = await mockGitHub(page, { conflict: true });
  await prepareEditor(page);
  await openFromGitHub(page);
  await setSource(page, EDITED);
  await page.getByTestId("github-origin").getByRole("button", { name: "Propose change…" }).click();
  const dialog = page.getByRole("dialog", { name: "Propose change on GitHub" });
  await dialog.getByLabel("Branch").fill("plantuml/flow-e2e");
  await dialog.getByRole("button", { name: "Open pull request" }).click();
  await expect(dialog.getByRole("alert")).toContainText("changed on main since you opened it");
  expect(calls).toContainEqual(expect.objectContaining({ method: "DELETE", path: BRANCH_PATH }));
  expect(calls.some((call) => call.path.endsWith("/pulls"))).toBe(false);
});

test("merges an unrelated upstream edit into the tab, then proposes against the upstream version", async ({ page }) => {
  const upstream = "@startuml\ntitle Flow\nAlice -> Bob : hello\n@enduml\n";
  const merged = "@startuml\ntitle Flow\nAlice -> Bob : hello\nBob -> Carol : forward\n@enduml\n";
  const calls = await mockGitHub(page, { upstream });
  await prepareEditor(page);
  await openFromGitHub(page);
  await setSource(page, EDITED);
  await page.getByTestId("github-origin").getByRole("button", { name: "Propose change…" }).click();
  const dialog = page.getByRole("dialog", { name: "Propose change on GitHub" });
  await dialog.getByLabel("Branch").fill("plantuml/flow-e2e");
  await dialog.getByRole("button", { name: "Open pull request" }).click();

  await expect(dialog.getByRole("status")).toContainText(
    "docs/flow.puml changed on main since you opened it. Your changes were merged with the newer version.",
  );
  await expect(dialog).toContainText("What changed on main");
  await expect(dialog).toContainText("What your proposal will add on top");
  // Nothing is applied or committed until the merged version is accepted, and the empty branch was removed.
  expect(await readEditorSource(page)).toBe(EDITED);
  expect(calls.some((call) => call.method === "POST" && call.path.endsWith("/pulls"))).toBe(false);
  expect(calls).toContainEqual(expect.objectContaining({ method: "DELETE", path: BRANCH_PATH }));

  calls.length = 0;
  await dialog.getByRole("button", { name: "Use merged version and propose" }).click();
  await expect(dialog.getByRole("status")).toContainText("Opened pull request #12 in octo-e2e/diagrams.");
  await expect.poll(() => readEditorSource(page)).toBe(merged);
  const writes = calls.filter((call) => call.method !== "GET");
  expect(writes.map((call) => `${call.method} ${call.path}`)).toEqual([
    "POST /repos/octo-e2e/diagrams/git/refs",
    "PUT /repos/octo-e2e/diagrams/contents/docs/flow.puml",
    "POST /repos/octo-e2e/diagrams/pulls",
  ]);
  expect(writes[1]!.body).toMatchObject({ sha: UPSTREAM_BLOB });
  expect(fromBase64(String(writes[1]!.body!.content))).toBe(merged);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(TOKEN);
});

test("an upstream edit to the same lines is not merged and nothing is committed", async ({ page }) => {
  const upstream = "@startuml\nAlice -> Bob : hi there\n@enduml\n";
  const calls = await mockGitHub(page, { upstream });
  await prepareEditor(page);
  await openFromGitHub(page);
  await setSource(page, EDITED);
  await page.getByTestId("github-origin").getByRole("button", { name: "Propose change…" }).click();
  const dialog = page.getByRole("dialog", { name: "Propose change on GitHub" });
  await dialog.getByLabel("Branch").fill("plantuml/flow-e2e");
  await dialog.getByRole("button", { name: "Open pull request" }).click();
  await expect(dialog.getByRole("alert")).toContainText("the same parts were edited in both places");
  await expect(dialog.getByRole("alert")).toContainText("lines 2-3 of your version");
  await expect(dialog.getByRole("button", { name: "Use merged version and propose" })).toHaveCount(0);
  expect(await readEditorSource(page)).toBe(EDITED);
  expect(calls.some((call) => call.method === "POST" && call.path.endsWith("/pulls"))).toBe(false);
  expect(calls.some((call) => call.method === "DELETE")).toBe(true);
});

test("an unedited file has nothing to propose", async ({ page }) => {
  await mockGitHub(page);
  await prepareEditor(page);
  await openFromGitHub(page);
  await page.getByTestId("github-origin").getByRole("button", { name: "Propose change…" }).click();
  const dialog = page.getByRole("dialog", { name: "Propose change on GitHub" });
  await expect(dialog.getByRole("status")).toContainText("There are no changes to propose yet.");
  await expect(dialog.getByRole("button", { name: "Open pull request" })).toBeDisabled();
});
