import { expect, it } from "vitest";
import { normalizeCollaborationEndpoint } from "./use-collaboration-lifecycle";

it("normalizes secure collaboration endpoints and strips URL metadata", () => {
  expect(normalizeCollaborationEndpoint("https://example.com/rooms/?token=secret#fragment", false)).toBe(
    "https://example.com/rooms",
  );
  expect(normalizeCollaborationEndpoint("http://localhost:8787/", false)).toBeUndefined();
  expect(normalizeCollaborationEndpoint("http://localhost:8787/", true)).toBe("http://localhost:8787");
  expect(normalizeCollaborationEndpoint("not a url", true)).toBeUndefined();
});
