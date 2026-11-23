import { expect, test, type Page } from "./coverage";
import { prepareEditor, readEditorSource } from "./editor-helpers";
import { addGitLabToken, mockGitLab, openFromGitLabMenu, PROJECT, SOURCE, TOKEN } from "./gitlab-mock";

const tabs = (page: Page) => page.locator(".document-tab > button:first-child");

async function gitLabSettings(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("button", { name: "GitLab", exact: true }).click();
  return dialog;
}

async function openSubmenuItems(page: Page) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open", exact: true }).hover();
  return page.getByRole("menu", { name: "Open", exact: true }).getByRole("menuitem");
}

test("Settings → GitLab is always there, explains the token, and the GitLab menu items wait for a token", async ({
  page,
}) => {
  const calls = await mockGitLab(page);
  await prepareEditor(page);

  // No token yet: no GitLab item in the Open menu or the File menu, but Settings → GitLab is reachable.
  await expect((await openSubmenuItems(page)).filter({ hasText: "GitLab" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Propose as new file on GitLab…" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const settings = await gitLabSettings(page);
  await expect(settings.getByLabel("GitLab server")).toHaveValue("https://gitlab.com");
  await expect(settings.getByLabel("GitLab token")).toHaveAttribute("type", "password");
  await expect(settings).toContainText("Project access token");
  await expect(settings).toContainText("the narrower choice");
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();

  // With a token the items appear; forgetting it removes them again.
  await addGitLabToken(page);
  expect(calls.map((call) => call.path)).toEqual(["/api/v4/user", "/api/v4/projects"]);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(TOKEN);
  await expect((await openSubmenuItems(page)).filter({ hasText: "GitLab" })).toHaveText(["From GitLab…"]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Propose as new file on GitLab…" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Propose as new file on GitHub…" })).toBeVisible();
  await page.keyboard.press("Escape");

  const again = await gitLabSettings(page);
  await expect(again.getByRole("status")).toContainText("A token is set.");
  await again.getByRole("button", { name: "Forget token" }).click();
  await expect(again.getByRole("status")).toContainText("Token forgotten.");
  await again.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect((await openSubmenuItems(page)).filter({ hasText: "GitLab" })).toHaveCount(0);
});

test("opens a file from a pasted link in a nested group, with its label, links and a reload", async ({ page }) => {
  await mockGitLab(page);
  await prepareEditor(page);
  await addGitLabToken(page);
  const count = await tabs(page).count();
  const dialog = await openFromGitLabMenu(page);
  await expect(dialog.getByLabel("File link")).toHaveAttribute(
    "placeholder",
    "https://gitlab.com/group/project/-/blob/main/diagrams/system.puml",
  );
  // The branch has a slash, so the ref/path split has to be found by asking the server.
  await dialog.getByLabel("File link").fill(`https://gitlab.com/${PROJECT}/-/blob/feature/x/docs/flow.puml`);
  await dialog.getByRole("button", { name: "Open link" }).click();
  await expect(dialog).toBeHidden();
  await expect(tabs(page)).toHaveCount(count + 1);
  await expect(tabs(page).last()).toContainText("flow.puml");
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);

  const origin = page.getByTestId("github-origin");
  await expect(origin).toContainText("GitLab · group/sub/diagrams · feature/x · docs/flow.puml");
  const link = origin.getByRole("link", { name: "Open on GitLab" });
  await expect(link).toHaveAttribute("href", `https://gitlab.com/${PROJECT}/-/blob/feature/x/docs/flow.puml`);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(origin.getByRole("button", { name: "Propose change…" })).toBeVisible();
  await expect(origin.getByRole("link", { name: /^MR / })).toHaveCount(0);

  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("plantuml-studio.gitlab") ?? "{}").server))
    .toBe("https://gitlab.com");
  await page.reload();
  await tabs(page).last().click();
  await expect(page.getByTestId("github-origin")).toContainText("GitLab · group/sub/diagrams · feature/x");
});

test("opens a file by browsing project, branch and folders, listing only PlantUML files", async ({ page }) => {
  await mockGitLab(page);
  await prepareEditor(page);
  await addGitLabToken(page);
  const dialog = await openFromGitLabMenu(page);
  await expect(dialog.getByRole("heading", { name: "Browse your projects" })).toBeVisible();
  await dialog.getByRole("combobox", { name: /^Project/ }).selectOption(PROJECT);
  const list = dialog.getByRole("list", { name: "Files and folders" });
  await expect(list.getByRole("button", { name: "Folder docs" })).toBeVisible();
  await expect(list.getByText("README.md")).toHaveCount(0);
  await list.getByRole("button", { name: "Folder docs" }).click();
  await expect(list.getByRole("button", { name: "File flow.puml" })).toBeVisible();
  await expect(list.getByText("notes.txt")).toHaveCount(0);
  await list.getByRole("button", { name: "File flow.puml" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);
  await expect(page.getByTestId("github-origin")).toContainText("GitLab · group/sub/diagrams · main · docs/flow.puml");
});

test("a pasted link picks its host: a GitLab link in the GitHub dialog, a GitHub link without a token", async ({
  page,
}) => {
  await mockGitLab(page);
  // A GitHub token as well, so the GitHub dialog shows its link field.
  await page.route("https://api.github.com/**", (route) =>
    route.fulfill({
      status: route.request().method() === "OPTIONS" ? 204 : 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" },
      body: route.request().url().endsWith("/user") ? JSON.stringify({ login: "octo-e2e" }) : "[]",
    }),
  );
  await prepareEditor(page);
  await addGitLabToken(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("button", { name: "GitHub", exact: true }).click();
  await settings.getByLabel("GitHub token").fill("github_pat_e2e_fake_token");
  await settings.getByRole("button", { name: "Test connection" }).click();
  await expect(settings.getByRole("status")).toContainText("Connected as octo-e2e");
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open", exact: true }).hover();
  await page
    .getByRole("menu", { name: "Open", exact: true })
    .getByRole("menuitem", { name: "From GitHub…", exact: true })
    .click();
  const github = page.getByRole("dialog", { name: "Open from GitHub" });
  await github.getByLabel("File link").fill(`https://gitlab.com/${PROJECT}/-/blob/main/docs/flow.puml`);
  await github.getByRole("button", { name: "Open link" }).click();
  await expect(github).toBeHidden();
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);
  await expect(page.getByTestId("github-origin")).toContainText("GitLab · group/sub/diagrams · main · docs/flow.puml");
});

test("a GitHub link pasted into the GitLab dialog says that no GitHub token is set", async ({ page }) => {
  await mockGitLab(page);
  await prepareEditor(page);
  await addGitLabToken(page);
  const dialog = await openFromGitLabMenu(page);
  await dialog.getByLabel("File link").fill("https://github.com/octo/diagrams/blob/main/docs/flow.puml");
  await dialog.getByRole("button", { name: "Open link" }).click();
  await expect(dialog.getByRole("alert")).toContainText("There is no GitHub token");
  await expect(dialog).toBeVisible();
});

test("a file that cannot be found is shown inline and keeps the dialog open", async ({ page }) => {
  await mockGitLab(page);
  await prepareEditor(page);
  await addGitLabToken(page);
  const dialog = await openFromGitLabMenu(page);
  await dialog.getByLabel("File link").fill(`https://gitlab.com/${PROJECT}/-/blob/main/missing.puml`);
  await dialog.getByRole("button", { name: "Open link" }).click();
  await expect(dialog.getByRole("alert")).toContainText("was not found");
  await expect(dialog).toBeVisible();
});

test("Open from GitLab is in the command palette once a token is set", async ({ page }) => {
  await mockGitLab(page);
  await prepareEditor(page);
  await addGitLabToken(page);
  await page.getByRole("button", { name: "Commands" }).click();
  await page
    .getByRole("dialog", { name: /command/i })
    .getByRole("combobox")
    .fill("Open from GitLab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Open from GitLab" })).toBeVisible();
});

test("a self-managed server has its own address and token, and a token only goes to its server", async ({ page }) => {
  const SELF = "https://gitlab.example.com";
  const SELF_TOKEN = "glpat-e2e-self-managed-token";
  const gitLabCom = await mockGitLab(page);
  const self = await mockGitLab(page, { server: SELF, token: SELF_TOKEN });
  await prepareEditor(page);

  const settings = await gitLabSettings(page);
  // An address that is not https, or has a path, is refused before anything is saved.
  await settings.getByLabel("GitLab server").fill("http://gitlab.example.com");
  await expect(settings.getByRole("alert")).toContainText("https address");
  await expect(settings.getByRole("button", { name: "Test connection" })).toBeDisabled();
  await settings.getByLabel("GitLab server").fill(`${SELF}/`);
  await settings.getByLabel("GitLab token").fill(SELF_TOKEN);
  await settings.getByRole("button", { name: "Test connection" }).click();
  await expect(settings.getByRole("status")).toContainText("Connected as gl-e2e. The token reaches 1 project.");
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(gitLabCom).toEqual([]);
  expect(self.map((call) => call.path)).toEqual(["/api/v4/user", "/api/v4/projects"]);

  const dialog = await openFromGitLabMenu(page);
  await expect(dialog.getByLabel("File link")).toHaveAttribute("placeholder", new RegExp(`^${SELF}/group/project/`));
  await dialog.getByLabel("File link").fill(`${SELF}/${PROJECT}/-/blob/main/docs/flow.puml`);
  await dialog.getByRole("button", { name: "Open link" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);
  const origin = page.getByTestId("github-origin");
  await expect(origin).toContainText("GitLab · group/sub/diagrams · main · docs/flow.puml");
  await expect(origin.getByRole("link", { name: "Open on GitLab" })).toHaveAttribute(
    "href",
    `${SELF}/${PROJECT}/-/blob/main/docs/flow.puml`,
  );

  // A link to another server is not sent this server's token: there is no token for gitlab.com, so nothing is called.
  const other = await openFromGitLabMenu(page);
  await other.getByLabel("File link").fill(`https://gitlab.com/${PROJECT}/-/blob/main/docs/flow.puml`);
  await other.getByRole("button", { name: "Open link" }).click();
  await expect(other.getByRole("alert")).toContainText("There is no GitLab token for gitlab.com");
  expect(gitLabCom).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(SELF_TOKEN);
});

test("a request the browser blocks says so and names the server", async ({ page }) => {
  const SELF = "https://gitlab.blocked.example";
  await mockGitLab(page, { server: SELF, blocked: true });
  await prepareEditor(page);
  const settings = await gitLabSettings(page);
  await settings.getByLabel("GitLab server").fill(SELF);
  await settings.getByLabel("GitLab token").fill(TOKEN);
  await settings.getByRole("button", { name: "Test connection" }).click();
  await expect(settings.getByRole("status")).toContainText("Could not reach gitlab.blocked.example");
  await expect(settings.getByRole("status")).toContainText("CORS");
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();

  const dialog = await openFromGitLabMenu(page);
  await dialog.getByLabel("File link").fill(`${SELF}/${PROJECT}/-/blob/main/docs/flow.puml`);
  await dialog.getByRole("button", { name: "Open link" }).click();
  await expect(dialog.getByRole("alert").first()).toContainText("Could not reach gitlab.blocked.example");
  await expect(dialog.getByRole("alert").first()).toContainText("CORS");
  await expect(tabs(page)).toHaveCount(1);
});
