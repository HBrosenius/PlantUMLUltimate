import { expect, it } from "vitest";
import { jiraDevelopmentOrigin } from "./vite.config";

it("supplies the accepted upstream origin for same-origin development requests on any local port", () => {
  expect(jiraDevelopmentOrigin(undefined, "localhost:5175", "GET")).toBe("http://localhost:5173");
  expect(jiraDevelopmentOrigin("http://localhost:5175", "localhost:5175", "POST")).toBe("http://localhost:5173");
  expect(jiraDevelopmentOrigin("http://127.0.0.1:5185", "127.0.0.1:5185", "POST")).toBe("http://localhost:5173");
});

it("preserves foreign origins and does not authorize originless writes", () => {
  expect(jiraDevelopmentOrigin("https://evil.example", "localhost:5175", "POST")).toBe("https://evil.example");
  expect(jiraDevelopmentOrigin("http://localhost:9999", "localhost:5175", "POST")).toBe("http://localhost:9999");
  expect(jiraDevelopmentOrigin(undefined, "localhost:5175", "POST")).toBeUndefined();
});
