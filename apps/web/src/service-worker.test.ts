import { describe, expect, it, vi } from "vitest";
import { serviceWorkerSource } from "../vite.config";

/** Node's Request rejects relative URLs; a service worker resolves them against its own origin. */
class FakeRequest {
  cache: string;
  constructor(
    public url: string,
    init: { cache?: string } = {},
  ) {
    this.cache = init.cache ?? "default";
  }
}

type Listener = (event: Record<string, unknown>) => void;

/** Runs the generated service worker against in-memory Cache Storage and a controllable network. */
function startWorker(files: string[], network: (url: string, init?: RequestInit) => Promise<Response>) {
  const stores = new Map<string, Map<string, Response>>();
  const key = (input: string | Request) =>
    new URL(typeof input === "string" ? input : input.url, "https://app.test").pathname;
  const openCache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      put: async (input: string | Request, response: Response) => void store.set(key(input), response),
      match: async (input: string | Request) => store.get(key(input))?.clone(),
      addAll: async (inputs: Array<string | Request>) => {
        for (const input of inputs) {
          const response = await network(typeof input === "string" ? input : input.url, {
            cache: typeof input === "string" ? "default" : input.cache,
          });
          store.set(key(input), response);
        }
      },
    };
  };
  const caches = {
    open: async (name: string) => openCache(name),
    match: async (input: string) => {
      for (const store of stores.values()) {
        const found = store.get(key(input));
        if (found) return found.clone();
      }
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const listeners = new Map<string, Listener>();
  const update = vi.fn(async () => undefined);
  const worker = {
    location: { origin: "https://app.test" },
    registration: { update },
    clients: { claim: async () => undefined },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  const fetchSpy = vi.fn((request: Request | string) =>
    network(typeof request === "string" ? request : request.url, {}),
  );
  new Function("self", "caches", "fetch", "Request", "URL", serviceWorkerSource(files))(
    worker,
    caches,
    fetchSpy,
    FakeRequest,
    URL,
  );
  const dispatch = async (type: string, event: Record<string, unknown> = {}) => {
    const waits: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listeners.get(type)!({
      ...event,
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
      respondWith: (promise: Promise<Response>) => (response = promise),
    });
    await Promise.all(waits);
    return response;
  };
  const navigate = (path: string) =>
    dispatch("fetch", { request: { method: "GET", mode: "navigate", url: `https://app.test${path}` } });
  return { stores, update, fetchSpy, dispatch, navigate };
}

const html = (label: string) => new Response(`<html>${label}</html>`);

describe("service worker navigation", () => {
  const files = ["/assets/app-1.js"];

  it("serves the cached shell without waiting for the network and checks for a new worker in the background", async () => {
    let calls = 0;
    const worker = startWorker(files, async (url) => {
      calls += 1;
      return html(url);
    });
    await worker.dispatch("install");
    const afterInstall = calls;
    // A network that never answers must not delay startup.
    worker.fetchSpy.mockImplementation(() => new Promise<Response>(() => undefined));
    const response = await worker.navigate("/");
    expect(await response!.text()).toBe("<html>/index.html</html>");
    expect(worker.fetchSpy).not.toHaveBeenCalled();
    expect(calls).toBe(afterInstall);
    expect(worker.update).toHaveBeenCalledTimes(1);
  });

  it("falls back to the network and caches the shell when nothing is cached yet", async () => {
    const worker = startWorker(files, async () => html("network"));
    const response = await worker.navigate("/index.html");
    expect(await response!.text()).toBe("<html>network</html>");
    expect(worker.update).not.toHaveBeenCalled();
    const [store] = [...worker.stores.values()];
    expect(await store!.get("/index.html")!.text()).toBe("<html>network</html>");
  });

  it("leaves other pages, such as the static guide, to the network", async () => {
    const worker = startWorker(files, async () => html("x"));
    expect(await worker.navigate("/guide/")).toBeUndefined();
  });

  it("fetches the unhashed shell past the HTTP cache at install and reuses hashed assets from it", async () => {
    const modes = new Map<string, string | undefined>();
    const worker = startWorker(files, async (url, init) => {
      modes.set(new URL(url, "https://app.test").pathname, init?.cache);
      return html(url);
    });
    await worker.dispatch("install");
    expect(modes.get("/index.html")).toBe("reload");
    expect(modes.get("/")).toBe("reload");
    expect(modes.get("/assets/app-1.js")).toBe("force-cache");
  });
});
