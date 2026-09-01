import { expect, test, type Page } from "@playwright/test";

const integrationOrigin = "https://jira.plantuml.brosenius.se";

async function openGantt(page: Page) {
  await page.goto("/");
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Gantt diagram" })
    .click();
  await expect(page.locator(".cm-content")).toBeVisible();
}

function jiraIssue(summary = "Ship Jira integration", updated = "2026-08-31T10:00:00.000Z") {
  return {
    id: "10001",
    key: "APP-123",
    fields: {
      summary,
      updated,
      duedate: "2026-09-05",
      customfield_10042: "2026-09-01",
      status: { statusCategory: { key: "indeterminate" } },
      assignee: { accountId: "alice-1", displayName: "Alice Example" },
      issuelinks: [],
    },
  };
}

async function mockJira(page: Page, issues: { current: ReturnType<typeof jiraIssue>[] } = { current: [jiraIssue()] }) {
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  await page.route(`${integrationOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body: unknown;
    if (request.postData()) body = request.postDataJSON();
    requests.push({ url: url.pathname + url.search, method: request.method(), body });

    if (url.pathname === "/api/connection") {
      await route.fulfill({
        json: {
          connected: true,
          sites: [{ id: "cloud-1", name: "Acme Jira", url: "https://acme.atlassian.net" }],
        },
      });
      return;
    }
    if (url.pathname === "/api/fields") {
      await route.fulfill({
        json: { fields: [{ id: "customfield_10042", name: "Start date", custom: true, type: "date" }] },
      });
      return;
    }
    if (url.pathname === "/api/issues/search") {
      await route.fulfill({
        json: {
          issues: issues.current,
        },
      });
      return;
    }
    if (url.pathname === "/api/disconnect") {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.abort();
  });
  return requests;
}

test("imports a Jira query into a Gantt chart after review", async ({ page }) => {
  const requests = await mockJira(page);
  await openGantt(page);

  await page.getByRole("button", { name: "Jira", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Jira integration" });
  await expect(dialog.getByLabel("Jira site")).toHaveValue("cloud-1");
  await dialog.getByLabel("JQL").fill("project = APP ORDER BY Rank");
  await dialog.getByLabel("Start date").selectOption("customfield_10042");
  await dialog.getByLabel("Import assignee as a 100% resource").check();
  await dialog.getByRole("button", { name: "Review import" }).click();

  const summary = dialog.getByLabel("Jira synchronization summary");
  await expect(summary).toContainText("1 created");
  await expect(dialog).toContainText("APP-123");
  await dialog.getByRole("button", { name: "Apply changes" }).click();

  const source = page.locator(".cm-content");
  await expect(source).toContainText("Ship Jira integration");
  await expect(source).toContainText("APP-123");
  await expect(source).toContainText("Alice Example");
  await expect(source).toContainText("2026-09-01");
  await expect(source).toContainText("2026-09-05");

  const search = requests.find((request) => request.url === "/api/issues/search");
  expect(search).toMatchObject({
    method: "POST",
    body: {
      cloudId: "cloud-1",
      jql: "project = APP ORDER BY Rank",
      fields: ["customfield_10042", "issuelinks"],
    },
  });
});

test("disconnects Jira without exposing credentials to the browser", async ({ page }) => {
  const requests = await mockJira(page);
  await openGantt(page);

  await page.getByRole("button", { name: "Jira", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Jira integration" });
  await expect(dialog.getByLabel("Jira site")).toHaveValue("cloud-1");
  await dialog.getByRole("button", { name: "Disconnect" }).click();

  await expect(dialog.getByRole("button", { name: "Connect Jira" })).toBeVisible();
  expect(requests.some((request) => request.url === "/api/disconnect" && request.method === "POST")).toBe(true);
  expect(requests.every((request) => !JSON.stringify(request).toLowerCase().includes("client_secret"))).toBe(true);
});

test("requires an explicit choice when a Jira refresh conflicts with a local edit", async ({ page }) => {
  const issues = { current: [jiraIssue()] };
  await mockJira(page, issues);
  await openGantt(page);

  await page.getByRole("button", { name: "Jira", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Jira integration" });
  await dialog.getByLabel("JQL").fill("project = APP");
  await dialog.getByLabel("Start date").selectOption("customfield_10042");
  await dialog.getByRole("button", { name: "Review import" }).click();
  await expect(dialog.getByLabel("Jira synchronization summary")).toContainText("1 created");
  await dialog.getByRole("button", { name: "Apply changes" }).click();

  const editor = page.locator(".cm-content");
  await expect(editor).toContainText("Ship Jira integration");
  const imported = await editor.innerText();
  await editor.fill(imported.replace("Ship Jira integration", "Keep my local title"));
  await expect(editor).toContainText("Keep my local title");
  issues.current = [jiraIssue("Use the Jira title", "2026-09-01T08:00:00.000Z")];

  await page.getByRole("button", { name: "Jira", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Jira integration" });
  await dialog.getByRole("button", { name: "Review refresh" }).click();
  await expect(dialog).toContainText("1 fields need resolution");
  await expect(dialog.getByRole("button", { name: "Resolve 1 items" })).toBeDisabled();
  const conflict = dialog.getByRole("region", { name: "APP-123 summary" });
  await conflict.getByRole("button", { name: "Use Jira" }).click();
  await dialog.getByRole("button", { name: "Apply changes" }).click();

  await expect(editor).toContainText("Use the Jira title");
  await expect(editor).not.toContainText("Keep my local title");
});
