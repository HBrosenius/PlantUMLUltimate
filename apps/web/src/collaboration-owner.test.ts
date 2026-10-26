// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { recoverOwner, rememberOwner, forgetOwner } from "./collaboration-owner";
import { collaborationShareUrl } from "./collaboration";
afterEach(() => sessionStorage.clear());
it("recovers owner access after reload without exposing it in share links", () => {
  const credentials = { ownerToken: "o".repeat(43), editorToken: "e".repeat(43), viewerToken: "v".repeat(43) };
  const room = "r".repeat(43);
  rememberOwner("https://service.test", room, credentials);
  expect(recoverOwner("https://service.test", room)).toEqual(credentials);
  expect(recoverOwner("https://other.test", room)).toBeUndefined();
  expect(recoverOwner("https://service.test", "s".repeat(43))).toBeUndefined();
  for (const role of ["editor", "viewer"] as const) {
    const link = collaborationShareUrl(
      "https://app.test",
      "https://service.test",
      room,
      credentials[`${role}Token`],
      role,
    );
    expect(link).not.toContain(credentials.ownerToken);
  }
  forgetOwner("https://service.test", room);
  expect(recoverOwner("https://service.test", room)).toBeUndefined();
});
