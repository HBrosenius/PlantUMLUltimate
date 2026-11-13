import { openRibbonGroup, setSource, waitForDiagramRender } from "./editor-helpers";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

const integrationRoute = /(?:https:\/\/jira\.plantuml\.brosenius\.se|http:\/\/[^/]+\/__jira)\//;

async function openGantt(page: Page, url = "/") {
  await page.goto(url);
  const onboarding = page.getByRole("dialog", { name: "Welcome to PlantUML Ultimate" });
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await Promise.race([onboarding.waitFor({ state: "visible" }), chooser.waitFor({ state: "visible" })]);
  if (await onboarding.isVisible()) {
    // Tests need the Code view, which basic mode hides; opt into advanced mode during onboarding.
    await onboarding.getByRole("radio", { name: "Diagram + code" }).check();
    await onboarding.getByRole("button", { name: "Get started" }).click();
  }
  await chooser.getByRole("button", { name: "Gantt diagram" }).click();
  await chooser.getByRole("button", { name: "Create diagram", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
}

async function openJira(page: Page) {
  await openRibbonGroup(page, "Plan", "Planning tools");
  await page.getByRole("button", { name: "Jira…" }).click();
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

async function mockJira(
  page: Page,
  issues: { current: ReturnType<typeof jiraIssue>[] } = { current: [jiraIssue()] },
  fields = [{ id: "customfield_10042", name: "Start date", custom: true, type: "date" }],
) {
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  await page.route(integrationRoute, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    url.pathname = url.pathname.replace(/^\/__jira/, "");
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
      await route.fulfill({ json: { fields } });
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
    if (url.pathname === "/api/issues/update") {
      const updates = (body as { updates?: Array<{ issueId: string; issueKey: string }> } | undefined)?.updates ?? [];
      await route.fulfill({
        json: { results: updates.map((update) => ({ issueId: update.issueId, issueKey: update.issueKey, ok: true })) },
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

  await openJira(page);
  await expect(page.getByText("Connected to Acme Jira")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Jira integration" });
  await expect(dialog.getByLabel("Jira site")).toHaveValue("cloud-1");
  await dialog.getByLabel("JQL").fill("project = APP ORDER BY Rank");
  await expect(dialog.getByLabel("PlantUML start date")).toHaveValue("customfield_10042");
  await expect(dialog.getByLabel("PlantUML due date")).toHaveValue("duedate");
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

test("allows manual start-date mapping when Jira fields are ambiguous", async ({ page }) => {
  await mockJira(page, undefined, [
    { id: "customfield_10042", name: "Start date", custom: true, type: "date" },
    { id: "customfield_10043", name: "START DATE", custom: true, type: "date" },
    { id: "customfield_10044", name: "Target date", custom: true, type: "date" },
  ]);
  await openGantt(page);
  await openJira(page);

  const dialog = page.getByRole("dialog", { name: "Jira integration" });
  const startMapping = dialog.getByLabel("PlantUML start date");
  await expect(startMapping).toHaveValue("");
  await expect(dialog.getByRole("status")).toContainText("Select a Jira date field");
  await startMapping.selectOption("customfield_10044");
  await expect(dialog.getByRole("status")).toContainText("Start date is mapped to Target date");
});

test("publishes changed start and due dates to Jira", async ({ page }) => {
  const requests = await mockJira(page);
  await openGantt(page);

  await openJira(page);
  let dialog = page.getByRole("dialog", { name: "Jira integration" });
  await dialog.getByLabel("JQL").fill("project = APP");
  await expect(dialog.getByLabel("PlantUML start date")).toHaveValue("customfield_10042");
  await dialog.getByLabel("Allow reviewed summary and date changes to be published to Jira").check();
  await dialog.getByRole("button", { name: "Review import" }).click();
  await dialog.getByRole("button", { name: "Apply changes" }).click();

  const editor = page.locator(".cm-content");
  const imported = await editor.innerText();
  await editor.fill(
    imported
      .replace(
        "[Ship Jira integration] as [jira_10001] starts 2026-09-01",
        "[Ship Jira integration] as [jira_10001] starts 2026-09-02",
      )
      .replace("[jira_10001] ends 2026-09-05", "[jira_10001] ends 2026-09-06"),
  );

  await openJira(page);
  dialog = page.getByRole("dialog", { name: "Jira integration" });
  await dialog.getByRole("button", { name: "Review refresh" }).click();
  await dialog
    .getByRole("region", { name: "APP-123 startDate" })
    .getByRole("button", { name: "Publish local" })
    .click();
  await dialog.getByRole("region", { name: "APP-123 dueDate" }).getByRole("button", { name: "Publish local" }).click();
  await dialog.getByRole("button", { name: "Apply changes" }).click();

  const update = requests.find((request) => request.url === "/api/issues/update");
  expect(update).toMatchObject({
    method: "POST",
    body: {
      cloudId: "cloud-1",
      updates: [
        {
          issueId: "10001",
          issueKey: "APP-123",
          fields: { customfield_10042: "2026-09-02", duedate: "2026-09-06" },
        },
      ],
    },
  });
});

test("disconnects Jira without exposing credentials to the browser", async ({ page }) => {
  const requests = await mockJira(page);
  await openGantt(page);

  await openJira(page);
  const dialog = page.getByRole("dialog", { name: "Jira integration" });
  await expect(dialog.getByLabel("Jira site")).toHaveValue("cloud-1");
  await dialog.getByRole("button", { name: "Disconnect" }).click();

  await expect(dialog.getByRole("button", { name: "Connect with Atlassian OAuth" })).toBeVisible();
  expect(requests.some((request) => request.url === "/api/disconnect" && request.method === "POST")).toBe(true);
  expect(requests.every((request) => !JSON.stringify(request).toLowerCase().includes("client_secret"))).toBe(true);
});

test("recovers from an expired Jira session and reports OAuth denial", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url: string | URL | undefined) => {
        (window as Window & { __jiraPopupUrl?: string }).__jiraPopupUrl = String(url ?? "");
        return window;
      },
    });
  });
  await page.route(integrationRoute, async (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(/^\/__jira/, "");
    if (url.pathname === "/api/connection") {
      await route.fulfill({ status: 401, json: { error: "Jira session is invalid" } });
      return;
    }
    await route.abort();
  });
  await openGantt(page);
  await openJira(page);

  const dialog = page.getByRole("dialog", { name: "Jira integration" });
  const connect = dialog.getByRole("button", { name: "Connect with Atlassian OAuth" });
  await expect(connect).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await connect.click();
  await expect
    .poll(() => page.evaluate(() => (window as Window & { __jiraPopupUrl?: string }).__jiraPopupUrl))
    .toContain("/oauth/start?return_url=");
  await page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { type: "plantuml-studio:jira-oauth", result: "error" },
      }),
    );
  });
  await expect(dialog.getByRole("alert")).toContainText("Jira authorization was not completed");
});

test("keeps disconnect available when loading Jira fields fails", async ({ page }) => {
  const requests: string[] = [];
  await page.route(integrationRoute, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    url.pathname = url.pathname.replace(/^\/__jira/, "");
    requests.push(`${request.method()} ${url.pathname}`);
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
      await route.fulfill({ status: 503, json: { error: "Atlassian is temporarily unavailable" } });
      return;
    }
    if (url.pathname === "/api/disconnect") {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.abort();
  });
  await openGantt(page);
  await openJira(page);

  const dialog = page.getByRole("dialog", { name: "Jira integration" });
  await expect(dialog.getByRole("alert")).toContainText("Atlassian is temporarily unavailable");
  await dialog.getByRole("button", { name: "Disconnect" }).click();
  await expect(dialog.getByRole("button", { name: "Connect with Atlassian OAuth" })).toBeVisible();
  expect(requests).toContain("POST /api/disconnect");
});

test("requires an explicit choice when a Jira refresh conflicts with a local edit", async ({ page }) => {
  const issues = { current: [jiraIssue()] };
  await mockJira(page, issues);
  await openGantt(page);

  await openJira(page);
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

  await openJira(page);
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

test("keeps the token session on localhost through the Jira development proxy", async ({ page }) => {
  // Real HTTP responses exercise browser cookie handling and Vite's Secure/Path rewrite.
  // WebKit does not retain Set-Cookie from Playwright's intercepted responses here.
  const upstream = createHttpServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/connect-token") {
      response.setHeader("Set-Cookie", "jira_session=local-test-session; Path=/; HttpOnly; Secure; SameSite=Lax");
      response.end(JSON.stringify({ connected: true }));
    } else if (request.url === "/api/connection") {
      const connected = request.headers.cookie?.includes("jira_session=local-test-session") ?? false;
      response.end(
        JSON.stringify({
          connected,
          sites: connected ? [{ id: "cloud-1", name: "Acme Jira", url: "https://acme.atlassian.net" }] : [],
        }),
      );
    } else if (request.url?.startsWith("/api/fields")) {
      response.end(JSON.stringify({ fields: [] }));
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamAddress = upstream.address();
  if (!upstreamAddress || typeof upstreamAddress === "string") throw new Error("Missing upstream address");
  const vite = await createViteServer({
    root: fileURLToPath(new URL("../../apps/web", import.meta.url)),
    server: {
      host: "127.0.0.1",
      port: 0,
      proxy: { "/__jira/api/": { target: `http://127.0.0.1:${upstreamAddress.port}` } },
    },
  });
  try {
    await vite.listen();
    const address = vite.httpServer?.address();
    if (!address || typeof address === "string") throw new Error("Missing development server address");
    await openGantt(page, `http://127.0.0.1:${address.port}`);
    await openJira(page);
    const dialog = page.getByRole("dialog", { name: "Jira integration" });
    await dialog.getByLabel("Jira site URL").fill("https://acme.atlassian.net");
    await dialog.getByLabel("Email address").fill("user@example.com");
    await dialog.getByLabel("API token", { exact: true }).fill("test-token");
    await dialog.getByRole("button", { name: "Connect with API token" }).click();
    await expect(dialog.getByRole("combobox", { name: "Jira site" })).toHaveValue("cloud-1");
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    const session = (await page.context().cookies()).find((cookie) => cookie.name === "jira_session");
    expect(session?.httpOnly).toBe(true);
    expect(session?.path).toBe("/__jira/");
    expect(session?.secure).toBe(false);
  } finally {
    await vite.close();
    await new Promise<void>((resolve, reject) => upstream.close((error) => (error ? reject(error) : resolve())));
  }
});

test("retains uncertain publish results across panel closes and requires a fresh review", async ({ page }) => {
  await mockJira(page);
  await openGantt(page);

  await openJira(page);
  let dialog = page.getByRole("dialog", { name: "Jira integration" });
  await dialog.getByLabel("JQL").fill("project = APP");
  await expect(dialog.getByLabel("PlantUML start date")).toHaveValue("customfield_10042");
  await dialog.getByLabel("Allow reviewed summary and date changes to be published to Jira").check();
  await dialog.getByRole("button", { name: "Review import" }).click();
  await dialog.getByRole("button", { name: "Apply changes" }).click();

  const editor = page.locator(".cm-content");
  const imported = await editor.innerText();
  await editor.fill(
    imported
      .replace(
        "[Ship Jira integration] as [jira_10001] starts 2026-09-01",
        "[Ship Jira integration] as [jira_10001] starts 2026-09-02",
      )
      .replace("[jira_10001] ends 2026-09-05", "[jira_10001] ends 2026-09-06"),
  );

  await openJira(page);
  dialog = page.getByRole("dialog", { name: "Jira integration" });
  await dialog.getByRole("button", { name: "Review refresh" }).click();
  await dialog
    .getByRole("region", { name: "APP-123 startDate" })
    .getByRole("button", { name: "Publish local" })
    .click();
  await dialog.getByRole("region", { name: "APP-123 dueDate" }).getByRole("button", { name: "Publish local" }).click();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  await page.route(/\/api\/issues\/update$/, async (route) => {
    writes++;
    await pending;
    await route.fulfill({ status: 503, json: { error: "Response lost" } });
  });
  await dialog.getByRole("button", { name: "Apply changes" }).click();
  await expect(dialog.getByRole("status")).toContainText("Closing this panel does not undo requests");
  await dialog.getByRole("button", { name: "Close Jira integration" }).click();
  await openJira(page);
  dialog = page.getByRole("dialog", { name: "Jira integration" });
  await expect(dialog.getByRole("button", { name: "Checking Jira…" })).toBeDisabled();
  release();
  await expect(dialog.getByRole("region", { name: "Jira publish results" })).toContainText("Outcome uncertain");
  await expect(dialog.getByRole("button", { name: "Apply changes" })).toHaveCount(0);
  expect(writes).toBe(1);
  await dialog.getByRole("button", { name: "Close Jira integration" }).click();
  await openJira(page);
  await expect(dialog.getByRole("region", { name: "Jira publish results" })).toContainText("APP-123");
  await expect(dialog.getByRole("button", { name: "Review refresh" })).toBeEnabled();
});

test("shows live status for tasks linked to Jira issues", async ({ page }) => {
  const base = jiraIssue();
  const requests = await mockJira(page, {
    current: [
      {
        ...base,
        fields: {
          ...base.fields,
          issuetype: { name: "Epic" },
          priority: { name: "High" },
          progress: { total: 100, percent: 40 },
        },
      },
    ],
  });
  await openGantt(page);
  await setSource(
    page,
    "@startgantt\nProject starts 2026-09-01\n[Build] as [build] lasts 3 days\n[build] links to [[https://acme.atlassian.net/browse/APP-123 APP-123]]\n[Next] as [next] starts at [build]'s end and lasts 1 day\n@endgantt",
  );
  await waitForDiagramRender(page);

  await expect(page.locator('.diagram svg [data-jira-status="live-progress"]')).toHaveCount(1);
  const search = requests.find((request) => request.url === "/api/issues/search");
  expect(search?.body).toMatchObject({ cloudId: "cloud-1", jql: "key in (APP-123)" });

  const bar = page.getByRole("group", { name: "Linked Jira issues" });
  await expect(bar).toContainText("1 linked");
  const card = page.getByLabel("Task details for Build");
  await page.locator('.diagram svg a[href*="APP-123"]').first().hover({ force: true });
  // The Jira details are a section of the normal task card, not a separate popup.
  await expect(card).toContainText("Dates");
  await expect(card).toContainText("APP-123");
  await expect(card).toContainText("Ship Jira integration");
  await expect(card).toContainText("Epic · High");
  await expect(card).toContainText("2026-09-05");
  await expect(card).toContainText(/diagram \d days? earlier/);
  await expect(card).toContainText("40%");
  await expect(card).toContainText("Updated");
  // PlantUML relationships (From/To) stay together above the Jira section, so the two are not confused.
  const text = await card.innerText();
  expect(text.indexOf("Next")).toBeGreaterThan(-1);
  expect(text.indexOf("Next")).toBeLessThan(text.indexOf("Jira · APP-123"));

  // Keyboard users get the same card on focus, as for any task.
  await page.mouse.move(0, 0);
  await expect(card).toHaveCount(0);
  await page.locator('.diagram svg [data-task-id="build"]').first().focus();
  await expect(card).toContainText("APP-123");

  // Status badge on the bar, and an issue-key pill behind the "Show issue keys" toggle.
  await expect(page.locator(".diagram svg .jira-link-marker")).toHaveCount(1);
  await expect(page.locator("[data-jira-key]")).toHaveCount(0);
  await bar.getByLabel("Show issue keys").check();
  await expect(page.locator('.diagram svg [data-jira-key="APP-123"]')).toHaveCount(1);

  // Exports carry the same markers (the renderer's raw SVG has no task groups to hang them on).
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export…", exact: true }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export preview", exact: true });
  await exportDialog.getByRole("combobox", { name: "Format", exact: true }).selectOption("svg");
  const download = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Download SVG" }).click();
  const exported = readFileSync((await (await download).path())!, "utf8");
  expect(exported).toContain("jira-link-marker");
  expect(exported).toContain("APP-123");
  await page.keyboard.press("Escape");

  const before = requests.filter((request) => request.url === "/api/issues/search").length;
  await bar.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(() => requests.filter((request) => request.url === "/api/issues/search").length).toBe(before + 1);
});

test("explains why a linked task has no status and offers to connect", async ({ page }) => {
  await mockJira(page);
  await page.route(integrationRoute, async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/api/connection")) {
      await route.fulfill({ status: 401, json: { connected: false } });
      return;
    }
    await route.fallback();
  });
  await openGantt(page);
  await setSource(
    page,
    "@startgantt\nProject starts 2026-09-01\n[Build] as [build] lasts 3 days\n[build] links to [[https://acme.atlassian.net/browse/APP-123 APP-123]]\n@endgantt",
  );
  await waitForDiagramRender(page);

  await page.locator('.diagram svg [data-task-id="build"]').first().focus();
  await expect(page.getByLabel("Task details for Build")).toContainText("Not connected to Jira");
  // Both the bar above the diagram and the task card offer to connect.
  await expect(
    page.getByRole("group", { name: "Linked Jira issues" }).getByRole("button", { name: "Connect Jira…" }),
  ).toBeVisible();
  await page.getByLabel("Task details for Build").getByRole("button", { name: "Connect Jira…" }).click();
  await expect(page.getByRole("dialog", { name: "Jira integration" })).toBeVisible();
});
