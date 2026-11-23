import { expect, test, type Page } from "./coverage";
import { prepareEditor, readEditorSource } from "./editor-helpers";

// Every GitHub call is answered here: the real API is never contacted and no real token is used.
const TOKEN = "github_pat_e2e_fake_token";
const SOURCE = "@startuml\nAlice -> Bob : Grüße\n@enduml\n";
const tabs = (page: Page) => page.locator(".document-tab > button:first-child");

const base64 = (text: string) => Buffer.from(text, "utf8").toString("base64");

async function mockGitHub(page: Page) {
  const seen: Array<{ path: string; authorization: string | undefined }> = [];
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
    const headers = route.request().headers();
    seen.push({ path: url.pathname, authorization: headers["authorization"] });
    const ref = url.searchParams.get("ref");
    const reply = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" },
        body: JSON.stringify(body),
      });
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" },
      });
    if (url.pathname === "/user") return reply({ login: "octo-e2e" });
    if (url.pathname === "/user/repos")
      return reply([
        {
          full_name: "octo-e2e/diagrams",
          name: "diagrams",
          owner: { login: "octo-e2e" },
          default_branch: "main",
          private: true,
        },
      ]);
    if (url.pathname === "/repos/octo-e2e/diagrams/branches") return reply([{ name: "main" }, { name: "feature/x" }]);
    if (url.pathname.startsWith("/repos/octo-e2e/diagrams/contents")) {
      if (ref !== "main" && ref !== "feature/x") return reply({ message: "No commit found for the ref" }, 404);
      const path = decodeURIComponent(url.pathname.replace("/repos/octo-e2e/diagrams/contents", "")).replace(/^\//, "");
      if (path === "")
        return reply([
          { name: "README.md", path: "README.md", type: "file", size: 4 },
          { name: "docs", path: "docs", type: "dir", size: 0 },
        ]);
      if (path === "docs")
        return reply([
          { name: "flow.puml", path: "docs/flow.puml", type: "file", size: SOURCE.length },
          { name: "notes.txt", path: "docs/notes.txt", type: "file", size: 3 },
        ]);
      if (path === "docs/flow.puml")
        return reply({
          type: "file",
          name: "flow.puml",
          path,
          sha: `sha-${ref}`,
          size: SOURCE.length,
          encoding: "base64",
          content: base64(SOURCE),
        });
    }
    return reply({ message: "Not Found" }, 404);
  });
  return seen;
}

async function gitHubSettings(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("button", { name: "GitHub", exact: true }).click();
  return dialog;
}

async function openGitHubDialog(page: Page) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open", exact: true }).hover();
  await page
    .getByRole("menu", { name: "Open", exact: true })
    .getByRole("menuitem", { name: "From GitHub…", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Open from GitHub" });
}

async function addToken(page: Page) {
  const settings = await gitHubSettings(page);
  await settings.getByLabel("GitHub token").fill(TOKEN);
  await settings.getByRole("button", { name: "Test connection" }).click();
  await expect(settings.getByRole("status")).toContainText("Connected as octo-e2e. The token reaches 1 repository.");
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
}

test("without a token the dialog explains and leads to Settings → GitHub", async ({ page }) => {
  const seen = await mockGitHub(page);
  await prepareEditor(page);
  const dialog = await openGitHubDialog(page);
  await expect(dialog).toContainText("add a fine-grained personal access token");
  await dialog.getByRole("button", { name: "Open Settings → GitHub" }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings.getByRole("heading", { name: "GitHub" })).toBeVisible();
  await expect(settings.getByLabel("GitHub token")).toHaveAttribute("type", "password");
  await expect(settings.getByRole("link", { name: /personal-access-tokens\/new/ })).toHaveAttribute(
    "href",
    "https://github.com/settings/personal-access-tokens/new",
  );
  expect(seen).toEqual([]);
});

test("a token is tested, kept out of browser storage, and forgotten on request", async ({ page }) => {
  const seen = await mockGitHub(page);
  await prepareEditor(page);
  await addToken(page);
  expect(seen.map((entry) => entry.path)).toEqual(["/user", "/user/repos"]);
  expect(seen.every((entry) => entry.authorization === `Bearer ${TOKEN}`)).toBe(true);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(TOKEN);
  const settings = await gitHubSettings(page);
  await settings.getByRole("button", { name: "Forget token" }).click();
  await expect(settings.getByRole("status")).toContainText("Token forgotten.");
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  const dialog = await openGitHubDialog(page);
  await expect(dialog).toContainText("add a fine-grained personal access token");
});

test("opens a file from a pasted link, with its origin label and link, and keeps it across a reload", async ({
  page,
}) => {
  await mockGitHub(page);
  await prepareEditor(page);
  await addToken(page);
  const count = await tabs(page).count();
  const dialog = await openGitHubDialog(page);
  await dialog
    .getByLabel("File link")
    .fill("https://github.com/octo-e2e/diagrams/blob/feature/x/docs/flow.puml?plain=1");
  await dialog.getByRole("button", { name: "Open link" }).click();
  await expect(dialog).toBeHidden();
  await expect(tabs(page)).toHaveCount(count + 1);
  await expect(tabs(page).last()).toContainText("flow.puml");
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);
  const origin = page.getByTestId("github-origin");
  await expect(origin).toContainText("GitHub · octo-e2e/diagrams · feature/x · docs/flow.puml");
  const link = origin.getByRole("link", { name: "Open on GitHub" });
  await expect(link).toHaveAttribute("href", "https://github.com/octo-e2e/diagrams/blob/feature/x/docs/flow.puml");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  // Other tabs have no origin.
  await tabs(page).first().click();
  await expect(page.getByTestId("github-origin")).toHaveCount(0);
  await tabs(page).last().click();

  await expect
    .poll(() => page.evaluate(() => Object.values({ ...localStorage }).some((value) => value.includes("feature/x"))))
    .toBe(true);
  await page.reload();
  await expect(tabs(page).last()).toContainText("flow.puml");
  await tabs(page).last().click();
  await expect(page.getByTestId("github-origin")).toContainText("octo-e2e/diagrams · feature/x · docs/flow.puml");
});

test("opens a file by browsing repository, branch and folders, listing only PlantUML files", async ({ page }) => {
  await mockGitHub(page);
  await prepareEditor(page);
  await addToken(page);
  const dialog = await openGitHubDialog(page);
  await dialog.getByLabel("Repository").selectOption("octo-e2e/diagrams");
  const list = dialog.getByRole("list", { name: "Files and folders" });
  await expect(list.getByRole("button", { name: "Folder docs" })).toBeVisible();
  await expect(list.getByText("README.md")).toHaveCount(0);
  await list.getByRole("button", { name: "Folder docs" }).click();
  await expect(list.getByRole("button", { name: "File flow.puml" })).toBeVisible();
  await expect(list.getByText("notes.txt")).toHaveCount(0);
  await list.getByRole("button", { name: "File flow.puml" }).click();
  await expect(dialog).toBeHidden();
  await expect(tabs(page).last()).toContainText("flow.puml");
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);
  await expect(page.getByTestId("github-origin")).toContainText("GitHub · octo-e2e/diagrams · main · docs/flow.puml");
});

test("shows a file that cannot be found inline and keeps the dialog open", async ({ page }) => {
  await mockGitHub(page);
  await prepareEditor(page);
  await addToken(page);
  const dialog = await openGitHubDialog(page);
  await dialog.getByLabel("File link").fill("https://github.com/octo-e2e/diagrams/blob/main/missing.puml");
  await dialog.getByRole("button", { name: "Open link" }).click();
  await expect(dialog.getByRole("alert")).toContainText("token cannot see");
  await expect(dialog).toBeVisible();
});

test("Open from GitHub is also in the command palette", async ({ page }) => {
  await mockGitHub(page);
  await prepareEditor(page);
  await page.getByRole("button", { name: "Commands" }).click();
  await page
    .getByRole("dialog", { name: /command/i })
    .getByRole("combobox")
    .fill("Open from GitHub");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Open from GitHub" })).toBeVisible();
});
