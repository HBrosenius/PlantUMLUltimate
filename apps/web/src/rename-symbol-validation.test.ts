import { describe, expect, it } from "vitest";
import { validateRenameValue } from "./rename-symbol-validation";

describe("rename symbol validation", () => {
  const options = { label: "Alias", currentIdentity: "API", identities: ["Store"] };

  it("rejects empty, invalid, and case-insensitive duplicate identifiers", () => {
    expect(validateRenameValue(" ", options)).toBe("Alias is required");
    expect(validateRenameValue("Order API", { ...options, identifier: /^[\w.$-]+$/ })).toBe(
      "Alias is not a valid identifier",
    );
    expect(validateRenameValue("store", options)).toBe("Alias “store” is already used");
  });

  it("allows case-only changes to the current identity", () => {
    expect(validateRenameValue("api", options)).toBeUndefined();
  });
});
