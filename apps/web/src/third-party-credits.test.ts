// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// The generator is plain JavaScript so it also runs as a script; it has no type declarations.
// @ts-expect-error -- untyped .mjs module
import { buildNotices, NOTICES_PATH, PUBLIC_NOTICES_PATH } from "../../../scripts/third-party-notices.mjs";
import credits from "./third-party-credits.json";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("third-party notices", () => {
  it("are up to date with the credits, the theme headers and the licence files", () => {
    const expected = (buildNotices as (root: string) => string)(root);
    for (const path of [NOTICES_PATH as string, PUBLIC_NOTICES_PATH as string])
      expect(readFileSync(join(root, path), "utf8"), `${path}: run node scripts/third-party-notices.mjs`).toBe(
        expected,
      );
  });

  it("credit every bundled source with a licence and a link", () => {
    for (const credit of credits.credits) {
      expect(credit.name).not.toBe("");
      expect(credit.licence).not.toBe("");
      expect(credit.url).toMatch(/^https:\/\//);
    }
    expect(credits.credits.map((credit) => credit.id)).toEqual(
      expect.arrayContaining(["plantuml-core", "c4-plantuml", "plantuml-themes"]),
    );
  });

  it("list every bundled theme with its declared licence", () => {
    const notices = (buildNotices as (root: string) => string)(root);
    expect(notices).toMatch(/\| sunlust \| Artem V\. Ageev \| GPL 3\+ \|/);
    expect(notices).toMatch(/\| amiga \| Matthew Leather \| Not stated \(part of the PlantUML project\) \|/);
  });
});
