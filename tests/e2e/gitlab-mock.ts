import { expect, type Page } from "./coverage";

// Every GitLab call is answered here: no real GitLab server is ever contacted and no real token is used.
export const TOKEN = "glpat-e2e-fake-token";
export const SOURCE = "@startuml\nAlice -> Bob : hello\n@enduml\n";
export const EDITED = "@startuml\nAlice -> Bob : hello\nBob -> Carol : forward\n@enduml\n";
/** What the file's blob and last commit are when it is opened. */
export const OPENED_BLOB = "a".repeat(40);
export const OPENED_COMMIT = "1".repeat(40);
export const UPSTREAM_COMMIT = "7".repeat(40);
export const HEAD = "2".repeat(40);
export const PROJECT = "group/sub/diagrams";
export const API_PROJECT = "/api/v4/projects/group%2Fsub%2Fdiagrams";

export const base64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
export const fromBase64 = (text: string) => Buffer.from(text, "base64").toString("utf8");

export type Call = { method: string; path: string; query: string; body: Record<string, unknown> | undefined };

export interface GitLabMockOptions {
  /** The server's web address. Default https://gitlab.com. */
  server?: string;
  /** The only token this server accepts. */
  token?: string;
  /** The project has no commits. */
  empty?: boolean;
  /** docs/new.puml already exists on the base branch. */
  exists?: boolean;
  /** Every commit is refused as stale. */
  conflict?: boolean;
  /** The file changed on main after it was opened: commits without this commit ID are refused once. */
  upstream?: string;
  /** The request never reaches the server, as when CORS or a network policy blocks it. */
  blocked?: boolean;
}

export const mergeRequestUrl = (server: string) => `${server}/${PROJECT}/-/merge_requests/12`;

/** A fake GitLab API behind `<server>/api/v4`. Returns the calls it saw. */
export async function mockGitLab(page: Page, options: GitLabMockOptions = {}) {
  const server = options.server ?? "https://gitlab.com";
  const token = options.token ?? TOKEN;
  const calls: Call[] = [];
  let commits = 0;
  let refused = false;
  await page.route(`${server}/**`, async (route) => {
    const request = route.request();
    if (options.blocked) return route.abort("failed");
    const url = new URL(request.url());
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    expect(request.headers()["authorization"]).toBe(`Bearer ${token}`);
    const body = request.postData() ? (JSON.parse(request.postData()!) as Record<string, unknown>) : undefined;
    calls.push({ method: request.method(), path: url.pathname, query: url.search, body });
    const reply = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(data) });
    const raw = (text: string) => route.fulfill({ status: 200, contentType: "text/plain", headers: cors, body: text });
    const ref = url.searchParams.get("ref");
    const mergeRequest = { iid: 12, web_url: mergeRequestUrl(server), state: "opened" };
    const file = (path: string, content: string, commit: string, blob: string) =>
      reply({
        file_name: path.split("/").pop(),
        file_path: path,
        size: content.length,
        encoding: "base64",
        content: base64(content),
        ref,
        blob_id: blob,
        last_commit_id: commit,
      });

    const route_ = `${request.method()} ${url.pathname}`;
    switch (route_) {
      case "GET /api/v4/user":
        return reply({ username: "gl-e2e", name: "GL E2E" });
      case "GET /api/v4/projects":
        return reply([
          {
            path_with_namespace: PROJECT,
            default_branch: "main",
            visibility: "private",
            web_url: `${server}/${PROJECT}`,
          },
        ]);
      case `GET ${API_PROJECT}`:
        return reply({ default_branch: "main", empty_repo: options.empty === true });
      case `GET ${API_PROJECT}/repository/branches`:
        return reply(options.empty ? [] : [{ name: "main" }, { name: "feature/x" }]);
      case `GET ${API_PROJECT}/repository/branches/main`:
        if (options.empty) return reply({ message: "404 Branch Not Found" }, 404);
        return reply({ name: "main", commit: { id: HEAD } });
      case `POST ${API_PROJECT}/repository/branches`:
        return reply({ name: body!.branch }, 201);
      case `DELETE ${API_PROJECT}/repository/branches/plantuml%2Fflow-e2e`:
      case `DELETE ${API_PROJECT}/repository/branches/plantuml%2Fnew-e2e`:
        return route.fulfill({ status: 204, headers: cors });
      case `GET ${API_PROJECT}/repository/tree`: {
        if (ref !== "main" && ref !== "feature/x") return reply({ message: "404 Tree Not Found" }, 404);
        const folder = url.searchParams.get("path");
        if (!folder)
          return reply([
            { name: "README.md", path: "README.md", type: "blob" },
            { name: "docs", path: "docs", type: "tree" },
          ]);
        if (folder === "docs")
          return reply([
            { name: "flow.puml", path: "docs/flow.puml", type: "blob" },
            { name: "notes.txt", path: "docs/notes.txt", type: "blob" },
          ]);
        return reply([]);
      }
      case `GET ${API_PROJECT}/repository/files/docs%2Fflow.puml`: {
        if (ref !== "main" && ref !== "feature/x") return reply({ message: "404 File Not Found" }, 404);
        const newer = options.upstream !== undefined && refused;
        return newer
          ? file("docs/flow.puml", options.upstream!, UPSTREAM_COMMIT, "b".repeat(40))
          : file("docs/flow.puml", SOURCE, OPENED_COMMIT, OPENED_BLOB);
      }
      case `GET ${API_PROJECT}/repository/files/docs%2Fnew.puml`:
        if (!options.exists) return reply({ message: "404 File Not Found" }, 404);
        return file("docs/new.puml", "abc", "9".repeat(40), "c".repeat(40));
      case `GET ${API_PROJECT}/repository/files/docs%2Fnew.puml/raw`:
        return raw(SOURCE);
      case `GET ${API_PROJECT}/repository/blobs/${OPENED_BLOB}/raw`:
        return raw(SOURCE);
      case `POST ${API_PROJECT}/repository/commits`: {
        if (options.conflict) return reply({ message: "The file has changed since you started editing it" }, 400);
        const action = (body!.actions as Array<Record<string, unknown>>)[0]!;
        if (options.upstream !== undefined && action.last_commit_id !== UPSTREAM_COMMIT) {
          refused = true;
          return reply({ message: "The file has changed since you started editing it" }, 400);
        }
        commits += 1;
        return reply({ id: String(commits + 2).repeat(40) }, 201);
      }
      case `POST ${API_PROJECT}/merge_requests`:
        return reply(mergeRequest, 201);
      case `GET ${API_PROJECT}/merge_requests/12`:
      case `PUT ${API_PROJECT}/merge_requests/12`:
        return reply(mergeRequest);
      default:
        return reply({ message: "404 Not Found" }, 404);
    }
  });
  return calls;
}

/** Settings → GitLab: optionally another server, the token, Test connection. Leaves Settings closed. */
export async function addGitLabToken(page: Page, options: { server?: string; token?: string } = {}) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("button", { name: "GitLab", exact: true }).click();
  if (options.server) await settings.getByLabel("GitLab server").fill(options.server);
  await settings.getByLabel("GitLab token").fill(options.token ?? TOKEN);
  await settings.getByRole("button", { name: "Test connection" }).click();
  await expect(settings.getByRole("status")).toContainText("Connected as gl-e2e");
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
}

export async function openFromGitLabMenu(page: Page) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open", exact: true }).hover();
  await page
    .getByRole("menu", { name: "Open", exact: true })
    .getByRole("menuitem", { name: "From GitLab…", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Open from GitLab" });
}

/** Opens docs/flow.puml from main through a pasted link, leaving the tab linked to it. */
export async function openFlowFromGitLab(page: Page, server = "https://gitlab.com") {
  const dialog = await openFromGitLabMenu(page);
  await dialog.getByLabel("File link").fill(`${server}/${PROJECT}/-/blob/main/docs/flow.puml`);
  await dialog.getByRole("button", { name: "Open link" }).click();
  await expect(dialog).toBeHidden();
}
