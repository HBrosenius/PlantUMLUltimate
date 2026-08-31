import { afterEach, describe, expect, it, vi } from "vitest";
import {
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
    });
    expect(withoutCollaborationLink(link)).toBe("https://plantuml.brosenius.se/?theme=dark");
  });
});
