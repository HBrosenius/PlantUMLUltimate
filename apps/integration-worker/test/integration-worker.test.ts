import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

const APP_ORIGIN = "http://localhost:5173";
const WORKER_ORIGIN = "https://integrations.example";

function cookieValue(response: Response, name: string): string {
  const match = new RegExp(`(?:^|[,;]\\s*)${name}=([^;,]+)`).exec(response.headers.get("Set-Cookie") ?? "");
  if (!match?.[1]) throw new Error(`Missing ${name} cookie`);
  return match[1];
}

async function startOAuth(): Promise<{ state: string; temporaryCookie: string }> {
  const response = await exports.default.fetch(
    new Request(`${WORKER_ORIGIN}/oauth/start?return_url=${encodeURIComponent(`${APP_ORIGIN}/editor?document=1`)}`, {
      redirect: "manual",
    }),
  );
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("Location")!);
  expect(location.origin).toBe("https://auth.atlassian.com");
  expect(location.searchParams.get("scope")).toBe("read:jira-work write:jira-work offline_access");
  expect(location.searchParams.get("redirect_uri")).toBe(`${WORKER_ORIGIN}/oauth/callback`);
  return {
    state: location.searchParams.get("state")!,
    temporaryCookie: cookieValue(response, "jira_oauth_session"),
  };
}

async function connect(): Promise<{ sessionCookie: string; state: string; temporaryCookie: string }> {
  const started = await startOAuth();
  const outbound = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "https://auth.atlassian.com/oauth/token")
      return Response.json({ access_token: "access-token", refresh_token: "refresh-token", expires_in: 3600 });
    if (url === "https://api.atlassian.com/oauth/token/accessible-resources")
      return Response.json([
        {
          id: "cloud-1",
          url: "https://acme.atlassian.net",
          name: "Acme Jira",
          avatarUrl: "https://acme.atlassian.net/avatar.png",
          scopes: ["read:jira-work"],
        },
      ]);
    throw new Error(`Unexpected outbound request: ${url}`);
  });
  vi.stubGlobal("fetch", outbound);
  const callback = await exports.default.fetch(
    new Request(`${WORKER_ORIGIN}/oauth/callback?code=authorization-code&state=${started.state}`, {
      headers: { Cookie: `jira_oauth_session=${started.temporaryCookie}` },
      redirect: "manual",
    }),
  );
  expect(callback.status).toBe(302);
  expect(callback.headers.get("Location")).toBe(`${APP_ORIGIN}/editor?document=1&jira=connected`);
  return { ...started, sessionCookie: cookieValue(callback, "jira_session") };
}

afterEach(() => vi.unstubAllGlobals());

describe("Jira integration Worker", () => {
  it("reports health and rejects untrusted return URLs", async () => {
    const health = await exports.default.fetch(new Request(`${WORKER_ORIGIN}/health`));
    await expect(health.json()).resolves.toEqual({ status: "ok" });
    const rejected = await exports.default.fetch(
      new Request(`${WORKER_ORIGIN}/oauth/start?return_url=${encodeURIComponent("https://evil.example/")}`),
    );
    expect(rejected.status).toBe(400);
  });

  it("completes OAuth, exposes only site metadata, and prevents state replay", async () => {
    const connected = await connect();
    const connection = await exports.default.fetch(
      new Request(`${WORKER_ORIGIN}/api/connection`, {
        headers: { Origin: APP_ORIGIN, Cookie: `jira_session=${connected.sessionCookie}` },
      }),
    );
    expect(connection.status).toBe(200);
    expect(connection.headers.get("Access-Control-Allow-Origin")).toBe(APP_ORIGIN);
    await expect(connection.json()).resolves.toEqual({
      connected: true,
      sites: [
        {
          id: "cloud-1",
          url: "https://acme.atlassian.net",
          name: "Acme Jira",
          avatarUrl: "https://acme.atlassian.net/avatar.png",
        },
      ],
    });

    const replay = await exports.default.fetch(
      new Request(`${WORKER_ORIGIN}/oauth/callback?code=authorization-code&state=${connected.state}`, {
        headers: { Cookie: `jira_oauth_session=${connected.temporaryCookie}` },
        redirect: "manual",
      }),
    );
    expect(replay.status).toBe(400);
  });

  it("proxies field discovery and paginated enhanced JQL search", async () => {
    const connected = await connect();
    const outbound = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/rest/api/3/field"))
        return Response.json([
          { id: "summary", name: "Summary", custom: false, schema: { type: "string" } },
          { id: "customfield_10042", name: "Start date", custom: true, schema: { type: "date" } },
        ]);
      if (url.endsWith("/rest/api/3/search/jql")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          jql: "project = APP ORDER BY Rank",
          fields: expect.arrayContaining(["summary", "duedate", "customfield_10042"]),
          maxResults: 100,
        });
        return Response.json({
          issues: [{ id: "10042", key: "APP-123", fields: { summary: "Implement SSO" } }],
          nextPageToken: "next-page",
        });
      }
      throw new Error(`Unexpected outbound request: ${url}`);
    });
    vi.stubGlobal("fetch", outbound);
    const headers = { Origin: APP_ORIGIN, Cookie: `jira_session=${connected.sessionCookie}` };
    const fields = await exports.default.fetch(new Request(`${WORKER_ORIGIN}/api/fields?cloudId=cloud-1`, { headers }));
    await expect(fields.json()).resolves.toEqual({
      fields: [
        { id: "summary", name: "Summary", custom: false, type: "string" },
        { id: "customfield_10042", name: "Start date", custom: true, type: "date" },
      ],
    });

    const search = await exports.default.fetch(
      new Request(`${WORKER_ORIGIN}/api/issues/search`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          cloudId: "cloud-1",
          jql: "project = APP ORDER BY Rank",
          fields: ["customfield_10042"],
        }),
      }),
    );
    expect(search.status).toBe(200);
    await expect(search.json()).resolves.toEqual({
      issues: [{ id: "10042", key: "APP-123", fields: { summary: "Implement SSO" } }],
      nextPageToken: "next-page",
    });
  });

  it("validates and publishes reviewed Jira issue fields", async () => {
    const connected = await connect();
    const outbound = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input).endsWith("/rest/api/3/issue/10042")).toBe(true);
      expect(init?.method).toBe("PUT");
      expect(JSON.parse(String(init?.body))).toEqual({
        fields: { summary: "Build locally", duedate: "2026-09-12", customfield_10042: null },
      });
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", outbound);
    const response = await exports.default.fetch(
      new Request(`${WORKER_ORIGIN}/api/issues/update`, {
        method: "POST",
        headers: {
          Origin: APP_ORIGIN,
          Cookie: `jira_session=${connected.sessionCookie}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cloudId: "cloud-1",
          updates: [
            {
              issueId: "10042",
              issueKey: "APP-123",
              fields: { summary: "Build locally", duedate: "2026-09-12", customfield_10042: null },
            },
          ],
        }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [{ issueId: "10042", issueKey: "APP-123", ok: true }],
    });
  });

  it("requires an allowed origin and can disconnect the opaque session", async () => {
    const connected = await connect();
    const cookie = `jira_session=${connected.sessionCookie}`;
    const rejected = await exports.default.fetch(
      new Request(`${WORKER_ORIGIN}/api/connection`, { headers: { Origin: "https://evil.example", Cookie: cookie } }),
    );
    expect(rejected.status).toBe(403);

    const disconnected = await exports.default.fetch(
      new Request(`${WORKER_ORIGIN}/api/disconnect`, {
        method: "POST",
        headers: { Origin: APP_ORIGIN, Cookie: cookie },
      }),
    );
    expect(disconnected.status).toBe(204);
    const after = await exports.default.fetch(
      new Request(`${WORKER_ORIGIN}/api/connection`, { headers: { Origin: APP_ORIGIN, Cookie: cookie } }),
    );
    expect(after.status).toBe(401);
  });
});
