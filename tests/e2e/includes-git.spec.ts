import { expect, test, type Page } from "./coverage";
import { prepareEditor } from "./editor-helpers";
import { addGitLabToken, mockGitLab, openFromGitLabMenu, PROJECT } from "./gitlab-mock";

// Every GitHub call is answered here: the real API is never contacted and no real token is used.
const TOKEN = "github_pat_e2e_fake_token";
const base64 = (text: string) => Buffer.from(text, "utf8").toString("base64");

const FILES: Record<string, string> = {
  "docs/flow.puml": "@startuml\n!include ../common/style.puml\nAlice -> Bob : hello\n@enduml\n",
  "docs/escape.puml": "@startuml\n!include ../../secrets.puml\nAlice -> Bob : hello\n@enduml\n",
  "docs/broken.puml": "@startuml\n!include ../common/broken.puml\nAlice -> Bob : hello\n@enduml\n",
  "common/style.puml": "participant Carol\n",
  "common/broken.puml": "participant Dave\nthis line is wrong\n",
};

async function mockGitHub(page: Page) {
  const seen: Array<{ path: string; ref: string | null; authorization: string | undefined }> = [];
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.hostname !== "127.0.0.1" && url.hostname !== "api.github.com")
      external.push(request.url());
  });
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
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
    seen.push({
      path: url.pathname,
      ref: url.searchParams.get("ref"),
      authorization: route.request().headers()["authorization"],
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
    if (url.pathname.startsWith("/repos/octo-e2e/diagrams/contents/")) {
      const path = decodeURIComponent(url.pathname.replace("/repos/octo-e2e/diagrams/contents/", ""));
      const text = FILES[path];
      if (text === undefined) return reply({ message: "Not Found" }, 404);
      return reply({
        type: "file",
        name: path.split("/").pop(),
        path,
        sha: `sha-${path}`,
        size: text.length,
        encoding: "base64",
        content: base64(text),
      });
    }
    return reply({ message: "Not Found" }, 404);
  });
  return { seen, external };
}

async function addToken(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("button", { name: "GitHub", exact: true }).click();
  await settings.getByLabel("GitHub token").fill(TOKEN);
  await settings.getByRole("button", { name: "Test connection" }).click();
  await expect(settings.getByRole("status")).toContainText("Connected as octo-e2e.");
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
}

async function openFromGitHub(page: Page, path: string) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open", exact: true }).hover();
  await page
    .getByRole("menu", { name: "Open", exact: true })
    .getByRole("menuitem", { name: "From GitHub…", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Open from GitHub" });
  await dialog.getByLabel("File link").fill(`https://github.com/octo-e2e/diagrams/blob/main/${path}`);
  await dialog.getByRole("button", { name: "Open link" }).click();
  await expect(dialog).toBeHidden();
}

const includesSummary = (page: Page) => page.locator(".includes-details > summary");

test("a relative include in a file opened from GitHub is read from the same repository and branch", async ({
  page,
}) => {
  const { seen, external } = await mockGitHub(page);
  await prepareEditor(page);
  await addToken(page);
  await openFromGitHub(page, "docs/flow.puml");
  // The included file adds a participant that the opened file does not declare.
  await expect(page.locator(".diagram svg")).toContainText("Carol", { timeout: 45_000 });
  await expect(page.locator(".diagram svg")).toContainText("Alice");
  const reads = seen.filter((entry) => entry.path.endsWith("common/style.puml"));
  expect(reads).toHaveLength(1);
  expect(reads[0]).toEqual({
    path: "/repos/octo-e2e/diagrams/contents/common/style.puml",
    ref: "main",
    authorization: `Bearer ${TOKEN}`,
  });
  // The includes list says where it came from and that it loaded.
  await expect(includesSummary(page)).toContainText("1 include");
  await includesSummary(page).click();
  const list = page.getByRole("list", { name: "Includes" });
  await expect(list).toContainText("common/style.puml");
  await expect(list).toContainText("Repository");
  await expect(list).toContainText("Loaded");
  // The text of the included file is not stored in the document.
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain("Carol");
  expect(external).toEqual([]);
});

test("an include path above the repository root is refused and nothing is read for it", async ({ page }) => {
  const { seen } = await mockGitHub(page);
  await prepareEditor(page);
  await addToken(page);
  await openFromGitHub(page, "docs/escape.puml");
  await expect(includesSummary(page)).toContainText("1 not loaded", { timeout: 45_000 });
  await includesSummary(page).click();
  const list = page.getByRole("list", { name: "Includes" });
  await expect(list).toContainText("points outside the repository");
  expect(seen.filter((entry) => entry.path.includes("secrets"))).toEqual([]);
  // Opening the file may probe branch/path splits of its link; the include itself reads no other path.
  expect(seen.filter((entry) => entry.path.includes("/contents/") && entry.path.endsWith("secrets.puml"))).toEqual([]);
  await expect(page.locator(".diagram svg")).toContainText("Alice");
});

test("an error inside an included repository file names that file and line", async ({ page }) => {
  await mockGitHub(page);
  await prepareEditor(page);
  await addToken(page);
  await openFromGitHub(page, "docs/broken.puml");
  const notice = page.locator(".render-notice.syntax");
  await expect(notice).toContainText("Line 2 of common/broken.puml can't be drawn", { timeout: 45_000 });
  await expect(notice).toContainText("this line is wrong");
  // The line is not in the open file, so there is nothing to jump to there.
  await expect(notice.getByRole("button", { name: /Go to line/ })).toHaveCount(0);
});

test("a relative include in a file opened from GitLab is read from the same project and branch", async ({ page }) => {
  await mockGitLab(page);
  const reads: string[] = [];
  const file = (path: string, content: string) => ({
    file_name: path.split("/").pop(),
    file_path: path,
    size: content.length,
    encoding: "base64",
    content: base64(content),
    ref: "main",
    blob_id: "d".repeat(40),
    last_commit_id: "3".repeat(40),
  });
  // Later routes win: these answer the two files of this test before the shared mock does.
  await page.route(
    (url) =>
      url.origin === "https://gitlab.com" &&
      /repository\/files\/(docs%2Fflow\.puml|common%2Fstyle\.puml)$/.test(url.pathname),
    async (route) => {
      const url = new URL(route.request().url());
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      reads.push(decodeURIComponent(url.pathname));
      const body = url.pathname.endsWith("flow.puml")
        ? file("docs/flow.puml", "@startuml\n!include ../common/style.puml\nAlice -> Bob : hello\n@enduml\n")
        : file("common/style.puml", "participant Erin\n");
      return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
    },
  );
  await prepareEditor(page);
  await addGitLabToken(page);
  await openFromGitLabMenu(page);
  const dialog = page.getByRole("dialog", { name: "Open from GitLab" });
  await dialog.getByLabel("File link").fill(`https://gitlab.com/${PROJECT}/-/blob/main/docs/flow.puml`);
  await dialog.getByRole("button", { name: "Open link" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".diagram svg")).toContainText("Erin", { timeout: 45_000 });
  expect(reads.some((path) => path.endsWith("files/common/style.puml"))).toBe(true);
  await includesSummary(page).click();
  await expect(page.getByRole("list", { name: "Includes" })).toContainText("Repository");
});
