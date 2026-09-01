import { decryptJson, encryptJson, randomToken, tokenHash } from "./crypto";

const OAUTH_STATE_SECONDS = 10 * 60;
const SESSION_SECONDS = 90 * 24 * 60 * 60;
const MAX_JSON_BYTES = 2_000_000;
const TEMP_COOKIE = "jira_oauth_session";
const SESSION_COOKIE = "jira_session";

interface AtlassianResource {
  id: string;
  url: string;
  name: string;
  avatarUrl?: string;
  scopes: string[];
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface SessionPayload {
  accessToken: string;
  refreshToken?: string;
  accessExpiresAt: number;
  resources: AtlassianResource[];
}

interface StoredSession {
  encrypted_payload: string;
  expires_at: number;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(",").map((value) => value.trim());
}

function requestOriginAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return Boolean(origin && allowedOrigins(env).includes(origin));
}

function allowedReturnUrl(value: string | null, env: Env): URL | undefined {
  if (!value || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    if (!allowedOrigins(env).includes(url.origin) || url.username || url.password) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

function cookies(request: Request): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of request.headers.get("Cookie")?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator > 0) result.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return result;
}

function cookie(name: string, value: string, requestUrl: URL, maxAge: number): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${requestUrl.protocol === "https:" ? "; Secure" : ""}`;
}

function withCors(response: Response, request: Request, env: Env): Response {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins(env).includes(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function limitedJson<T>(response: Request | Response): Promise<T> {
  const statedLength = Number(response.headers.get("Content-Length") ?? 0);
  if (statedLength > MAX_JSON_BYTES) throw new Error("Upstream response is too large");
  if (!response.body) throw new Error("Upstream response is empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new Error("Upstream response is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

async function oauthStart(request: Request, env: Env): Promise<Response> {
  const requestUrl = new URL(request.url);
  const returnUrl = allowedReturnUrl(requestUrl.searchParams.get("return_url"), env);
  if (!returnUrl) return Response.json({ error: "Invalid return URL" }, { status: 400 });
  const state = randomToken();
  const browserSession = randomToken();
  const expiresAt = nowSeconds() + OAUTH_STATE_SECONDS;
  await env.JIRA_DB.prepare(
    "INSERT INTO oauth_states (state_hash, session_hash, return_url, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(await tokenHash(state), await tokenHash(browserSession), returnUrl.toString(), expiresAt)
    .run();
  const callbackUrl = `${requestUrl.origin}/oauth/callback`;
  const authorize = new URL("https://auth.atlassian.com/authorize");
  authorize.search = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: env.ATLASSIAN_CLIENT_ID,
    scope: "read:jira-work write:jira-work offline_access",
    redirect_uri: callbackUrl,
    state,
    response_type: "code",
    prompt: "consent",
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Set-Cookie": cookie(TEMP_COOKIE, browserSession, requestUrl, OAUTH_STATE_SECONDS),
      "Cache-Control": "no-store",
    },
  });
}

async function exchangeCode(code: string, callbackUrl: string, env: Env): Promise<SessionPayload> {
  const tokenResponse = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: env.ATLASSIAN_CLIENT_ID,
      client_secret: env.ATLASSIAN_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl,
    }),
  });
  if (!tokenResponse.ok) throw new Error(`OAuth token exchange failed (${tokenResponse.status})`);
  const token = await limitedJson<TokenResponse>(tokenResponse);
  if (!token.access_token || !Number.isFinite(token.expires_in)) throw new Error("OAuth token response is invalid");
  const resourcesResponse = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" },
  });
  if (!resourcesResponse.ok) throw new Error(`Could not load Jira sites (${resourcesResponse.status})`);
  const resources = (await limitedJson<AtlassianResource[]>(resourcesResponse)).filter(
    (resource) => typeof resource.id === "string" && /^https:\/\//.test(resource.url),
  );
  return {
    accessToken: token.access_token,
    ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
    accessExpiresAt: nowSeconds() + token.expires_in,
    resources,
  };
}

function redirectResult(returnUrl: string, result: "connected" | "error"): Response {
  const target = new URL(returnUrl);
  target.searchParams.set("jira", result);
  return new Response(null, { status: 302, headers: { Location: target.toString(), "Cache-Control": "no-store" } });
}

async function oauthCallback(request: Request, env: Env): Promise<Response> {
  const requestUrl = new URL(request.url);
  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  const browserSession = cookies(request).get(TEMP_COOKIE);
  if (!state || !code || !browserSession) return Response.json({ error: "Invalid OAuth callback" }, { status: 400 });
  const consumed = await env.JIRA_DB.prepare(
    "DELETE FROM oauth_states WHERE state_hash = ? AND session_hash = ? AND expires_at >= ? RETURNING return_url",
  )
    .bind(await tokenHash(state), await tokenHash(browserSession), nowSeconds())
    .first<{ return_url: string }>();
  if (!consumed) return Response.json({ error: "OAuth state is invalid or expired" }, { status: 400 });
  try {
    const payload = await exchangeCode(code, `${requestUrl.origin}/oauth/callback`, env);
    const timestamp = nowSeconds();
    await env.JIRA_DB.prepare(
      `INSERT INTO jira_sessions (session_hash, encrypted_payload, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_hash) DO UPDATE SET encrypted_payload = excluded.encrypted_payload,
         expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
    )
      .bind(
        await tokenHash(browserSession),
        await encryptJson(payload, env.TOKEN_ENCRYPTION_KEY),
        timestamp + SESSION_SECONDS,
        timestamp,
        timestamp,
      )
      .run();
    const response = redirectResult(consumed.return_url, "connected");
    response.headers.append("Set-Cookie", cookie(SESSION_COOKIE, browserSession, requestUrl, SESSION_SECONDS));
    response.headers.append("Set-Cookie", cookie(TEMP_COOKIE, "", requestUrl, 0));
    return response;
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "Jira OAuth callback failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return redirectResult(consumed.return_url, "error");
  }
}

async function refreshTokens(payload: SessionPayload, env: Env): Promise<SessionPayload> {
  if (payload.accessExpiresAt > nowSeconds() + 60) return payload;
  if (!payload.refreshToken) throw new Error("Jira connection needs authorization again");
  const response = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: env.ATLASSIAN_CLIENT_ID,
      client_secret: env.ATLASSIAN_CLIENT_SECRET,
      refresh_token: payload.refreshToken,
    }),
  });
  if (!response.ok) throw new Error(`Jira token refresh failed (${response.status})`);
  const token = await limitedJson<TokenResponse>(response);
  if (!token.access_token || !Number.isFinite(token.expires_in))
    throw new Error("Jira token refresh response is invalid");
  return {
    ...payload,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? payload.refreshToken,
    accessExpiresAt: nowSeconds() + token.expires_in,
  };
}

async function sessionFor(request: Request, env: Env): Promise<{ hash: string; payload: SessionPayload } | undefined> {
  const raw = cookies(request).get(SESSION_COOKIE);
  if (!raw) return undefined;
  const hash = await tokenHash(raw);
  const stored = await env.JIRA_DB.prepare(
    "SELECT encrypted_payload, expires_at FROM jira_sessions WHERE session_hash = ? AND expires_at >= ?",
  )
    .bind(hash, nowSeconds())
    .first<StoredSession>();
  if (!stored) return undefined;
  let payload = await decryptJson<SessionPayload>(stored.encrypted_payload, env.TOKEN_ENCRYPTION_KEY);
  const refreshed = await refreshTokens(payload, env);
  if (refreshed !== payload) {
    payload = refreshed;
    await env.JIRA_DB.prepare("UPDATE jira_sessions SET encrypted_payload = ?, updated_at = ? WHERE session_hash = ?")
      .bind(await encryptJson(payload, env.TOKEN_ENCRYPTION_KEY), nowSeconds(), hash)
      .run();
  }
  return { hash, payload };
}

function resourceFor(payload: SessionPayload, cloudId: string): AtlassianResource | undefined {
  return payload.resources.find((resource) => resource.id === cloudId);
}

async function jiraFetch(
  payload: SessionPayload,
  cloudId: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  if (!resourceFor(payload, cloudId)) return Response.json({ error: "Jira site is not authorized" }, { status: 403 });
  return fetch(`https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${payload.accessToken}`, Accept: "application/json", ...init?.headers },
  });
}

async function apiRequest(request: Request, env: Env): Promise<Response> {
  if (!requestOriginAllowed(request, env)) return Response.json({ error: "Origin not allowed" }, { status: 403 });
  const session = await sessionFor(request, env);
  if (!session) return Response.json({ connected: false }, { status: 401 });
  const url = new URL(request.url);
  if (url.pathname === "/api/connection" && request.method === "GET") {
    return Response.json({
      connected: true,
      sites: session.payload.resources.map(({ id, url: siteUrl, name, avatarUrl }) => ({
        id,
        url: siteUrl,
        name,
        ...(avatarUrl ? { avatarUrl } : {}),
      })),
    });
  }
  if (url.pathname === "/api/disconnect" && request.method === "POST") {
    await env.JIRA_DB.prepare("DELETE FROM jira_sessions WHERE session_hash = ?").bind(session.hash).run();
    return new Response(null, {
      status: 204,
      headers: { "Set-Cookie": cookie(SESSION_COOKIE, "", url, 0) },
    });
  }
  if (url.pathname === "/api/fields" && request.method === "GET") {
    const cloudId = url.searchParams.get("cloudId") ?? "";
    const upstream = await jiraFetch(session.payload, cloudId, "/rest/api/3/field");
    if (!upstream.ok) return Response.json({ error: "Could not load Jira fields" }, { status: upstream.status });
    const fields =
      await limitedJson<Array<{ id?: string; name?: string; custom?: boolean; schema?: { type?: string } }>>(upstream);
    return Response.json({
      fields: fields
        .filter((field) => field.id && field.name)
        .map((field) => ({ id: field.id, name: field.name, custom: field.custom === true, type: field.schema?.type })),
    });
  }
  if (url.pathname === "/api/issues/search" && request.method === "POST") {
    let body: { cloudId?: string; jql?: string; fields?: string[]; nextPageToken?: string };
    try {
      body = await limitedJson(request);
    } catch {
      return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    const cloudId = body.cloudId ?? "";
    if (
      !body.jql?.trim() ||
      body.jql.length > 4_000 ||
      (body.fields !== undefined &&
        (!Array.isArray(body.fields) || body.fields.some((field) => typeof field !== "string"))) ||
      (body.nextPageToken !== undefined && typeof body.nextPageToken !== "string")
    )
      return Response.json({ error: "A valid JQL query is required" }, { status: 400 });
    const requestedFields = [
      ...new Set(["summary", "updated", "duedate", "status", "assignee", ...(body.fields ?? [])]),
    ]
      .filter((field) => /^[a-zA-Z0-9_:-]+$/.test(field))
      .slice(0, 25);
    const upstream = await jiraFetch(session.payload, cloudId, "/rest/api/3/search/jql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jql: body.jql,
        fields: requestedFields,
        maxResults: 100,
        ...(body.nextPageToken ? { nextPageToken: body.nextPageToken } : {}),
      }),
    });
    if (!upstream.ok) return Response.json({ error: "Could not search Jira issues" }, { status: upstream.status });
    const result = await limitedJson<{
      issues?: Array<{ id: string; key: string; fields?: Record<string, unknown> }>;
      nextPageToken?: string;
    }>(upstream);
    return Response.json({
      issues: result.issues ?? [],
      ...(result.nextPageToken ? { nextPageToken: result.nextPageToken } : {}),
    });
  }
  if (url.pathname === "/api/issues/update" && request.method === "POST") {
    let body: {
      cloudId?: string;
      updates?: Array<{ issueId?: string; issueKey?: string; fields?: Record<string, unknown> }>;
    };
    try {
      body = await limitedJson(request);
    } catch {
      return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    const cloudId = body.cloudId ?? "";
    if (!Array.isArray(body.updates) || body.updates.length === 0 || body.updates.length > 25)
      return Response.json({ error: "Between 1 and 25 issue updates are required" }, { status: 400 });
    const updates = body.updates.flatMap((update) => {
      if (!/^\d+$/.test(update.issueId ?? "") || !/^[A-Z][A-Z0-9_]*-\d+$/i.test(update.issueKey ?? "")) return [];
      const fields = update.fields;
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) return [];
      const entries = Object.entries(fields);
      if (
        entries.length === 0 ||
        entries.some(([field, value]) => {
          if (field === "summary") return typeof value !== "string" || !value.trim() || value.length > 255;
          if (field === "duedate" || /^customfield_\d+$/.test(field))
            return value !== null && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value));
          return true;
        })
      )
        return [];
      return [{ issueId: update.issueId!, issueKey: update.issueKey!, fields: Object.fromEntries(entries) }];
    });
    if (updates.length !== body.updates.length)
      return Response.json({ error: "One or more Jira updates are invalid" }, { status: 400 });
    const results = [];
    for (const update of updates) {
      const upstream = await jiraFetch(
        session.payload,
        cloudId,
        `/rest/api/3/issue/${encodeURIComponent(update.issueId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields: update.fields }),
        },
      );
      results.push({
        issueId: update.issueId,
        issueKey: update.issueKey,
        ok: upstream.ok,
        ...(upstream.ok ? {} : { status: upstream.status }),
      });
    }
    return Response.json({ results });
  }
  return Response.json({ error: "Not found" }, { status: 404 });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ status: "ok" });
    if (request.method === "OPTIONS") {
      if (!requestOriginAllowed(request, env)) return Response.json({ error: "Origin not allowed" }, { status: 403 });
      return withCors(
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
        request,
        env,
      );
    }
    try {
      let response: Response;
      if (url.pathname === "/oauth/start" && request.method === "GET") response = await oauthStart(request, env);
      else if (url.pathname === "/oauth/callback" && request.method === "GET")
        response = await oauthCallback(request, env);
      else if (url.pathname.startsWith("/api/")) response = await apiRequest(request, env);
      else response = Response.json({ error: "Not found" }, { status: 404 });
      ctx.waitUntil(
        env.JIRA_DB.batch([
          env.JIRA_DB.prepare("DELETE FROM oauth_states WHERE expires_at < ?").bind(nowSeconds()),
          env.JIRA_DB.prepare("DELETE FROM jira_sessions WHERE expires_at < ?").bind(nowSeconds()),
        ]).then(() => undefined),
      );
      return url.pathname.startsWith("/api/") ? withCors(response, request, env) : response;
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "Jira integration request failed",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      const response = Response.json({ error: "Jira integration service unavailable" }, { status: 503 });
      return url.pathname.startsWith("/api/") ? withCors(response, request, env) : response;
    }
  },
} satisfies ExportedHandler<Env>;
