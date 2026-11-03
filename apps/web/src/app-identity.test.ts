// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { appIdentity, applyAppIdentity, jiraNetworkError } from "./app-identity";

afterEach(() => {
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
});

it.each(["localhost:5227", "127.0.0.1:5173", "127.0.0.2", "[::1]:5173", "editor.localhost"])(
  "identifies local builds by address, including production builds served on %s",
  (host) => {
    expect(appIdentity(`http://${host}/?document=private`).local).toBe(true);
    expect(appIdentity(`http://${host}/?document=private`).address).toBe(`http://${host}`);
  },
);

it("distinguishes production, custom hosts, and lookalike local domains", () => {
  expect(appIdentity("https://plantuml.brosenius.se/").environment).toBe("Production");
  expect(appIdentity("https://localhost.example/").local).toBe(false);
  expect(appIdentity("https://editor.example/").environment).toBe("Hosted app");
});

it("uses distinct local window, manifest, and icon identities without changing the document", () => {
  vi.stubGlobal("window", { location: { href: "http://127.0.0.1:5227/" } });
  document.head.innerHTML =
    '<title>PlantUML Ultimate</title><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/favicon.svg">';
  applyAppIdentity();
  expect(document.title).toBe("PlantUML Ultimate — Local");
  expect(document.querySelector('[rel="manifest"]')?.getAttribute("href")).toBe("/manifest-local.webmanifest");
  expect(document.querySelector('[rel="icon"]')?.getAttribute("href")).toBe("/icon-local.svg");
});

it("explains an unavailable local server and provides a production alternative", () => {
  const message = jiraNetworkError("https://jira.plantuml.brosenius.se", "http://127.0.0.1:5227/");
  expect(message).toContain("http://127.0.0.1:5227");
  expect(message).toContain("local server");
  expect(message).toContain("https://plantuml.brosenius.se");
});
