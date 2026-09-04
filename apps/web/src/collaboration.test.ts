import { afterEach, describe, expect, it, vi } from "vitest";
import {
  changedRange,
  collaborationLinkDetails,
  collaborationShareUrl,
  createCollaborationRoomId,
  withoutCollaborationLink,
} from "./collaboration";

afterEach(() => vi.unstubAllGlobals());

describe("collaboration room links", () => {
  it("creates 256-bit URL-safe room credentials", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });
    vi.stubGlobal("btoa", (value: string) => Buffer.from(value, "binary").toString("base64"));
    expect(createCollaborationRoomId()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("keeps the room credential in the browser-only URL fragment", () => {
    const link = collaborationShareUrl(
      "https://plantuml.brosenius.se/?theme=dark",
      "https://collaboration.example",
      "room-token",
    );
    expect(link).toBe(
      "https://plantuml.brosenius.se/?theme=dark#collaboration=room-token&server=https%3A%2F%2Fcollaboration.example",
    );
    expect(collaborationLinkDetails(link)).toEqual({
      roomId: "room-token",
      endpoint: "https://collaboration.example",
      accessToken: undefined,
      role: "editor",
    });
    expect(withoutCollaborationLink(link)).toBe("https://plantuml.brosenius.se/?theme=dark");
  });

  it("creates separate editor and viewer capability links", () => {
    const editor = collaborationShareUrl(
      "https://plantuml.brosenius.se/",
      "https://collaboration.example",
      "room-token",
      "editor-token",
      "editor",
    );
    const viewer = collaborationShareUrl(
      "https://plantuml.brosenius.se/",
      "https://collaboration.example",
      "room-token",
      "viewer-token",
      "viewer",
    );
    expect(collaborationLinkDetails(editor)).toMatchObject({ accessToken: "editor-token", role: "editor" });
    expect(collaborationLinkDetails(viewer)).toMatchObject({ accessToken: "viewer-token", role: "viewer" });
    expect(withoutCollaborationLink(viewer)).toBe("https://plantuml.brosenius.se/");
  });
});

describe("changedRange", () => {
  it("finds a single changed character", () => {
    expect(changedRange("abcXdef", "abcYdef")).toEqual({ from: 3, to: 4 });
  });

  it("finds an inserted span", () => {
    expect(changedRange("abcdef", "abcXXdef")).toEqual({ from: 3, to: 5 });
  });

  it("finds a deleted span", () => {
    expect(changedRange("abcXXdef", "abcdef")).toEqual({ from: 3, to: 3 });
  });

  it("handles an append at the end", () => {
    expect(changedRange("hello", "hello world")).toEqual({ from: 5, to: 11 });
  });

  it("handles a prepend at the start", () => {
    expect(changedRange("world", "hello world")).toEqual({ from: 0, to: 6 });
  });

  it("handles inserting into an empty string", () => {
    expect(changedRange("", "abc")).toEqual({ from: 0, to: 3 });
  });

  it("handles deleting down to an empty string", () => {
    expect(changedRange("abc", "")).toEqual({ from: 0, to: 0 });
  });

  it("handles a full replacement with no shared prefix or suffix", () => {
    expect(changedRange("abc", "xyz")).toEqual({ from: 0, to: 3 });
  });
});
