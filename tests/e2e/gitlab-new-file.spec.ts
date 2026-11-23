import { expect, test, type Page } from "./coverage";
import { prepareEditor, readEditorSource, setSource } from "./editor-helpers";
import {
  addGitLabToken,
  API_PROJECT,
  EDITED,
  fromBase64,
  HEAD,
  mergeRequestUrl,
  mockGitLab,
  PROJECT,
  SOURCE,
  TOKEN,
} from "./gitlab-mock";

const MR_URL = mergeRequestUrl("https://gitlab.com");

async function openNewFileDialog(page: Page) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Propose as new file on GitLab…" }).click();
  const dialog = page.getByRole("dialog", { name: "Propose as new file on GitLab" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function chooseProject(dialog: ReturnType<Page["getByRole"]>) {
  await dialog.getByRole("combobox", { name: /^Project/ }).selectOption(PROJECT);
  await expect(dialog.getByLabel("Base branch")).toHaveValue("main");
}

test("proposes a new diagram as a new file, links the tab, then adds a commit to the merge request", async ({
  page,
}) => {
  const calls = await mockGitLab(page);
  await prepareEditor(page);
  await addGitLabToken(page);
  await setSource(page, SOURCE);

  const dialog = await openNewFileDialog(page);
  await chooseProject(dialog);
  await expect(dialog.getByLabel("File path")).toHaveValue(/\.puml$/);
  await dialog.getByLabel("File path").fill("docs/new.puml");
  await dialog.getByLabel("New branch name").fill("plantuml/new-e2e");
  await dialog.getByLabel("Commit message").fill("Add new.puml");
  await dialog.getByLabel("Merge request title").fill("Add new.puml");
  await dialog.getByText("Description preview").click();
  await expect(dialog.getByTestId("github-propose-body")).toContainText("## New diagram file");
  calls.length = 0;
  await dialog.getByRole("button", { name: "Open merge request" }).click();

  await expect(dialog.getByRole("status")).toContainText(`Opened merge request !12 in ${PROJECT}.`);
  await expect(dialog.getByRole("status")).toContainText(
    "Next: review and merge it on GitLab. Until it is merged, the file is only on branch plantuml/new-e2e, not on main.",
  );
  await expect(dialog.getByRole("link", { name: "Open merge request !12 on GitLab" })).toHaveAttribute("href", MR_URL);
  expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
    `GET ${API_PROJECT}/repository/files/docs%2Fnew.puml`,
    `GET ${API_PROJECT}/repository/branches/main`,
    `POST ${API_PROJECT}/repository/branches`,
    `POST ${API_PROJECT}/repository/commits`,
    `POST ${API_PROJECT}/merge_requests`,
  ]);
  expect(calls[2]!.body).toEqual({ branch: "plantuml/new-e2e", ref: HEAD });
  const action = (calls[3]!.body!.actions as Array<Record<string, unknown>>)[0]!;
  expect(action).toMatchObject({ action: "create", file_path: "docs/new.puml" });
  expect(action).not.toHaveProperty("last_commit_id");
  expect(fromBase64(String(action.content))).toBe(SOURCE);
  expect(calls[4]!.body).toMatchObject({
    title: "Add new.puml",
    source_branch: "plantuml/new-e2e",
    target_branch: "main",
  });
  await dialog.getByRole("button", { name: "Close" }).click();

  // The tab is linked to the new file and its merge request.
  const origin = page.getByTestId("github-origin");
  await expect(origin).toContainText(`GitLab · ${PROJECT} · main · docs/new.puml`);
  await expect(origin.getByRole("link", { name: "MR !12" })).toHaveAttribute("href", MR_URL);
  // The tab has an origin now, so it is no longer offered as a new file.
  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Propose as new file on GitLab…" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Propose change adds a commit to that merge request, guarded by the commit that created the file.
  calls.length = 0;
  await setSource(page, EDITED);
  await origin.getByRole("button", { name: "Propose change…" }).click();
  const propose = page.getByRole("dialog", { name: "Propose change on GitLab" });
  await expect(propose).toContainText("Adds a commit to merge request !12");
  await propose.getByRole("button", { name: "Add commit" }).click();
  await expect(propose.getByRole("status")).toContainText("Added a commit to merge request !12");
  const writes = calls.filter((call) => call.method !== "GET");
  expect(writes.map((call) => `${call.method} ${call.path}`)).toEqual([
    `POST ${API_PROJECT}/repository/commits`,
    `PUT ${API_PROJECT}/merge_requests/12`,
  ]);
  expect((writes[0]!.body!.actions as Array<Record<string, unknown>>)[0]).toMatchObject({
    action: "update",
    last_commit_id: "3".repeat(40),
  });
  expect(await readEditorSource(page)).toBe(EDITED);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(TOKEN);
});

test("a path that already exists is refused and nothing is written", async ({ page }) => {
  const calls = await mockGitLab(page, { exists: true });
  await prepareEditor(page);
  await addGitLabToken(page);
  await setSource(page, SOURCE);
  const dialog = await openNewFileDialog(page);
  await chooseProject(dialog);
  await dialog.getByLabel("File path").fill("docs/new.puml");
  await dialog.getByLabel("New branch name").fill("plantuml/new-e2e");
  await dialog.getByRole("button", { name: "Open merge request" }).click();
  await expect(dialog.getByRole("alert")).toContainText("docs/new.puml already exists on main");
  await expect(dialog.getByRole("alert")).toContainText("Open from GitLab");
  expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
});

test("an empty project gets the diagram as its first commit, and the tab is linked to it", async ({ page }) => {
  const calls = await mockGitLab(page, { empty: true });
  await prepareEditor(page);
  await addGitLabToken(page);
  await setSource(page, SOURCE);
  const dialog = await openNewFileDialog(page);
  await chooseProject(dialog);
  await dialog.getByLabel("File path").fill("docs/new.puml");
  await dialog.getByRole("button", { name: "Open merge request" }).click();
  const notice = dialog.getByRole("alert");
  await expect(notice).toContainText(`${PROJECT} is empty.`);
  await expect(notice).toContainText("no branch a merge request could go into");
  expect(calls.filter((call) => call.method !== "GET")).toEqual([]);

  calls.length = 0;
  await dialog.getByRole("button", { name: "Add as first commit on main" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    `Added docs/new.puml to ${PROJECT} as its first commit on main.`,
  );
  await expect(dialog.getByRole("link", { name: "Open docs/new.puml on GitLab" })).toHaveAttribute(
    "href",
    `https://gitlab.com/${PROJECT}/-/blob/main/docs/new.puml`,
  );
  const writes = calls.filter((call) => call.method !== "GET");
  expect(writes.map((call) => `${call.method} ${call.path}`)).toEqual([`POST ${API_PROJECT}/repository/commits`]);
  // No branch is named: the commit creates the default branch.
  expect(writes[0]!.body).toMatchObject({ branch: "main", commit_message: expect.any(String) });
  const action = (writes[0]!.body!.actions as Array<Record<string, unknown>>)[0]!;
  expect(action).toMatchObject({ action: "create", file_path: "docs/new.puml" });
  expect(fromBase64(String(action.content))).toBe(SOURCE);
  await dialog.getByRole("button", { name: "Close" }).click();
  const origin = page.getByTestId("github-origin");
  await expect(origin).toContainText(`GitLab · ${PROJECT} · main · docs/new.puml`);
  await expect(origin.getByRole("button", { name: "Propose change…" })).toBeVisible();
  await expect(origin.getByRole("link", { name: /^MR / })).toHaveCount(0);
});
