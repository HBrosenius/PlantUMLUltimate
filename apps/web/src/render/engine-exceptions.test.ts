import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { classicEngineScript, withoutJavaExceptionStacks } from "./engine-exceptions";

const require = createRequire(import.meta.url);
const engine = readFileSync(require.resolve("@plantuml/core/plantuml.js"), "utf8");

describe("PlantUML Java exception adapter", () => {
  it("supports the installed engine and preserves exception identity, messages and causes", () => {
    const adapted = withoutJavaExceptionStacks(engine);
    const runtime = adapted.slice(adapted.indexOf("if(typeof Reflect==='object')"), adapted.indexOf("let H=err=>"));
    const cause = new Error("Original cause");
    const makeException = new Function(
      "cause",
      `
      const Bqd = Symbol("javaException");
      const D8X = exception => ({ toString: () => exception.message });
      let AJq;
      ${runtime}
      const error = new AJq("Fallback message", { cause });
      error[Bqd] = { message: "Invalid diagram" };
      return error;
    `,
    );
    const error = makeException(cause);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toBe("Error: Invalid diagram");
    expect(error.cause).toBe(cause);
    expect(error.stack).toBeUndefined();
    expect(new Error("Unrelated error").stack).toBeTruthy();
  });

  it("fails explicitly when an engine upgrade changes either adapter target", () => {
    expect(() => withoutJavaExceptionStacks("unsupported engine")).toThrow("Unsupported PlantUML exception runtime");
    expect(() => withoutJavaExceptionStacks(engine + engine)).toThrow("Unsupported PlantUML exception runtime");
  });

  it("adapts the installed module exports for a classic worker without dynamic evaluation", () => {
    const classic = classicEngineScript(engine);
    expect(classic).not.toContain("export{C as render,D as renderToString};");
    expect(classic).toContain("globalThis.__plantumlRenderToString = D;");
    expect(() => classicEngineScript(engine.replace("export{C as render,D as renderToString};", ""))).toThrow(
      "Unsupported PlantUML module exports",
    );
  });
});
