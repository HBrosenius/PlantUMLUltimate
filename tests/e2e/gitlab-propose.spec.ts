import { expect, test } from "./coverage";
import { prepareEditor, readEditorSource, setSource } from "./editor-helpers";
import {
  addGitLabToken,
  API_PROJECT,
  EDITED,
  fromBase64,
  HEAD,
  mergeRequestUrl,
  mockGitLab,
  openFlowFromGitLab,
  OPENED_COMMIT,
  PROJECT,
  SOURCE,
  TOKEN,
  UPSTREAM_COMMIT,
} from "./gitlab-mock";

const BRANCHES = `${API_PROJECT}/repository/branches`;
const MR_URL = mergeRequestUrl("https://gitlab.com");

async function openFlow(page: Parameters<typeof addGitLabToken>[0]) {
  await addGitLabToken(page);
  await openFlowFromGitLab(page);
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);
}

test("proposes an edit as a merge request with the review as its description, then adds a commit to it", async ({
  page,
}) => {
  const calls = await mockGitLab(page);
  await prepareEditor(page);
  await openFlow(page);
  await setSource(page, EDITED);

  const origin = page.getByTestId("github-origin");
  await origin.getByRole("button", { name: "Propose change…" }).click();
  const dialog = page.getByRole("dialog", { name: "Propose change on GitLab" });
  await expect(dialog).toContainText(`opens a merge request into main in ${PROJECT}`);
  await dialog.getByLabel("Branch").fill("plantuml/flow-e2e");
  await dialog.getByLabel("Merge request title").fill("Add Carol to the flow");
  await dialog.getByText("Description preview").click();
  await expect(dialog.getByTestId("github-propose-body")).toContainText("## Diagram changes");
  await expect(dialog.getByTestId("github-propose-body")).toContainText("+Bob -> Carol : forward");
  calls.length = 0;
  await dialog.getByRole("button", { name: "Open merge request" }).click();

  await expect(dialog.getByRole("status")).toContainText(`Opened merge request !12 in ${PROJECT}.`);
  await expect(dialog.getByRole("status")).toContainText(
    "Next: review and merge it on GitLab. Until it is merged, your change is only on branch plantuml/flow-e2e, not on main.",
  );
  await expect(dialog.getByRole("link", { name: "Open merge request !12 on GitLab" })).toHaveAttribute("href", MR_URL);
  const writes = calls.filter((call) => call.method !== "GET");
  expect(writes.map((call) => `${call.method} ${call.path}`)).toEqual([
    `POST ${BRANCHES}`,
    `POST ${API_PROJECT}/repository/commits`,
    `POST ${API_PROJECT}/merge_requests`,
  ]);
  expect(writes[0]!.body).toEqual({ branch: "plantuml/flow-e2e", ref: HEAD });
  // The commit is guarded by the last commit ID the file was opened at.
  const action = (writes[1]!.body!.actions as Array<Record<string, unknown>>)[0]!;
  expect(action).toMatchObject({ action: "update", file_path: "docs/flow.puml", last_commit_id: OPENED_COMMIT });
  expect(fromBase64(String(action.content))).toBe(EDITED);
  expect(writes[2]!.body).toMatchObject({
    title: "Add Carol to the flow",
    source_branch: "plantuml/flow-e2e",
    target_branch: "main",
  });
  expect(String(writes[2]!.body!.description)).toContain("<details><summary>Source patch</summary>");
  await dialog.getByRole("button", { name: "Close" }).click();
  const badge = origin.getByRole("link", { name: "MR !12" });
  await expect(badge).toHaveAttribute("href", MR_URL);
  await expect(badge).toHaveAttribute("title", /Merge request !12 on branch plantuml\/flow-e2e/);

  // Proposing again adds a commit to the open merge request and updates its description.
  calls.length = 0;
  await setSource(page, EDITED.replace("@enduml", "Carol -> Alice : done\n@enduml"));
  await origin.getByRole("button", { name: "Propose change…" }).click();
  await expect(dialog).toContainText("Adds a commit to merge request !12");
  await expect(dialog.getByLabel("Branch")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Add commit" }).click();
  await expect(dialog.getByRole("status")).toContainText("Added a commit to merge request !12");
  const again = calls.filter((call) => call.method !== "GET");
  expect(again.map((call) => `${call.method} ${call.path}`)).toEqual([
    `POST ${API_PROJECT}/repository/commits`,
    `PUT ${API_PROJECT}/merge_requests/12`,
  ]);
  expect(again[0]!.body).toMatchObject({ branch: "plantuml/flow-e2e" });
  // The new guard is the commit the first proposal made.
  expect((again[0]!.body!.actions as Array<Record<string, unknown>>)[0]).toMatchObject({
    action: "update",
    last_commit_id: "3".repeat(40),
  });
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(TOKEN);
});

test("a file that changed upstream is not overwritten, and the empty branch is removed", async ({ page }) => {
  const calls = await mockGitLab(page, { conflict: true });
  await prepareEditor(page);
  await openFlow(page);
  await setSource(page, EDITED);
  await page.getByTestId("github-origin").getByRole("button", { name: "Propose change…" }).click();
  const dialog = page.getByRole("dialog", { name: "Propose change on GitLab" });
  await dialog.getByLabel("Branch").fill("plantuml/flow-e2e");
  await dialog.getByRole("button", { name: "Open merge request" }).click();
  await expect(dialog.getByRole("alert")).toContainText("changed on main since you opened it");
  expect(calls).toContainEqual(expect.objectContaining({ method: "DELETE", path: `${BRANCHES}/plantuml%2Fflow-e2e` }));
  expect(calls.some((call) => call.path.endsWith("/merge_requests"))).toBe(false);
});

test("merges an unrelated upstream edit into the tab, then proposes against the upstream version", async ({ page }) => {
  const upstream = "@startuml\ntitle Flow\nAlice -> Bob : hello\n@enduml\n";
  const merged = "@startuml\ntitle Flow\nAlice -> Bob : hello\nBob -> Carol : forward\n@enduml\n";
  const calls = await mockGitLab(page, { upstream });
  await prepareEditor(page);
  await openFlow(page);
  await setSource(page, EDITED);
  await page.getByTestId("github-origin").getByRole("button", { name: "Propose change…" }).click();
  const dialog = page.getByRole("dialog", { name: "Propose change on GitLab" });
  await dialog.getByLabel("Branch").fill("plantuml/flow-e2e");
  await dialog.getByRole("button", { name: "Open merge request" }).click();

  await expect(dialog.getByRole("status")).toContainText(
    "docs/flow.puml changed on main since you opened it. Your changes were merged with the newer version.",
  );
  await expect(dialog).toContainText("What changed on main");
  await expect(dialog).toContainText("What your proposal will add on top");
  // Nothing is applied or committed until the merged version is accepted, and the empty branch was removed.
  expect(await readEditorSource(page)).toBe(EDITED);
  expect(calls.some((call) => call.method === "POST" && call.path.endsWith("/merge_requests"))).toBe(false);
  expect(calls).toContainEqual(expect.objectContaining({ method: "DELETE", path: `${BRANCHES}/plantuml%2Fflow-e2e` }));

  calls.length = 0;
  await dialog.getByRole("button", { name: "Use merged version and propose" }).click();
  await expect(dialog.getByRole("status")).toContainText(`Opened merge request !12 in ${PROJECT}.`);
  expect(await readEditorSource(page)).toBe(merged);
  const writes = calls.filter((call) => call.method !== "GET");
  expect(writes.map((call) => `${call.method} ${call.path}`)).toEqual([
    `POST ${BRANCHES}`,
    `POST ${API_PROJECT}/repository/commits`,
    `POST ${API_PROJECT}/merge_requests`,
  ]);
  // The new commit is guarded by the upstream version, not the one the tab was opened at.
  const action = (writes[1]!.body!.actions as Array<Record<string, unknown>>)[0]!;
  expect(action).toMatchObject({ action: "update", last_commit_id: UPSTREAM_COMMIT });
  expect(fromBase64(String(action.content))).toBe(merged);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("github-origin").getByRole("link", { name: "MR !12" })).toBeVisible();
});

test("the Propose change command of a GitLab tab is named for GitLab", async ({ page }) => {
  await mockGitLab(page);
  await prepareEditor(page);
  await openFlow(page);
  await page.getByRole("button", { name: "Commands" }).click();
  await page
    .getByRole("dialog", { name: /command/i })
    .getByRole("combobox")
    .fill("Propose change");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Propose change on GitLab" })).toBeVisible();
});
