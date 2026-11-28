import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TUPADR3_BUCKETS,
  TUPADR3_SETS,
  decodeZ,
  regenerateTupadr3Icon,
  tupadr3Bucket,
  type Tupadr3Entry,
} from "./tupadr3-icons";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "stdlib", "tupadr3");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");
const readJson = <T>(...parts: string[]) => JSON.parse(read(...parts)) as T;

interface Manifest {
  repository: string;
  tag: string;
  date: string;
  bucketRule: string[];
  sets: Record<
    string,
    { prefix: string; licenceTag: string; licenceFile: string; icons: number; buckets: Record<string, number> }
  >;
}
const manifest = readJson<Manifest>("manifest.json");
const sets = Object.keys(TUPADR3_SETS);
const bucketId = (file: string) => file.slice("bucket-".length, -".json".length);

describe("the bundled tupadr3 data", () => {
  it("records the release and licences, matching the manifest", () => {
    const readme = read("README.md");
    expect(readme).toContain(`Release tag: ${manifest.tag}`);
    expect(readme).toContain("https://github.com/tupadr3/plantuml-icon-font-sprites");
    expect(manifest.tag).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(manifest.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(manifest.sets).sort()).toEqual([...sets].sort());
    expect(read("LICENSE")).toContain("MIT License");
    expect(read("LICENSE")).toContain("tupadr3");
    expect(read("font-awesome-5", "LICENSE.txt")).toContain("CC BY 4.0");
    expect(read("material", "LICENSE")).toContain("Apache License");
    expect(manifest.sets["font-awesome-5"]?.licenceTag).toBe("5.15.3");
    expect(manifest.sets.material?.licenceTag).toBe("3.0.2");
    for (const [set, info] of Object.entries(manifest.sets)) {
      expect(readme, set).toContain(`licence read at tag ${info.licenceTag}`);
      expect(info.prefix).toBe(TUPADR3_SETS[set]?.prefix);
    }
    expect(manifest.bucketRule).toEqual([...TUPADR3_BUCKETS]);
  });

  it("copies common.puml with the ENTITY macro", () => {
    expect(read("common.puml")).toMatch(/^@startuml\n/);
    expect(read("common.puml")).toContain("!define ENTITY(e_type,e_color,e_sprite,e_alias,e_stereo)");
  });

  for (const set of sets) {
    const files = () =>
      readdirSync(join(root, set))
        .filter((file) => /^bucket-.+\.json$/.test(file))
        .sort();

    it(`${set}: the index and the buckets agree, with no duplicates and the bucket rule`, () => {
      const index = readJson<Record<string, string>>(set, "index.json");
      const seen = new Set<string>();
      for (const file of files()) {
        const id = bucketId(file);
        expect(TUPADR3_BUCKETS, file).toContain(id);
        const names = Object.keys(readJson<Record<string, Tupadr3Entry>>(set, file));
        expect(names.length, file).toBeGreaterThan(0);
        expect(names, file).toEqual([...names].sort());
        for (const name of names) {
          expect(seen.has(name), `${set}/${name} duplicated`).toBe(false);
          seen.add(name);
          expect(index[name], `${set}/${name}`).toBe(id);
          expect(tupadr3Bucket(name), `${set}/${name}`).toBe(id);
        }
        expect(manifest.sets[set]?.buckets[id]).toBe(names.length);
      }
      expect([...seen].sort()).toEqual(Object.keys(index).sort());
      expect(seen.size).toBe(manifest.sets[set]?.icons);
      expect(Object.keys(manifest.sets[set]?.buckets ?? {}).sort()).toEqual(files().map(bucketId).sort());
    });

    it(`${set}: every icon regenerates into a well-formed icon file`, () => {
      const prefix = TUPADR3_SETS[set]!.prefix;
      for (const file of files()) {
        const bucket = readJson<Record<string, Tupadr3Entry>>(set, file);
        for (const [name, entry] of Object.entries(bucket)) {
          const text = regenerateTupadr3Icon(set, name, entry);
          expect(text.startsWith(`@startuml\nsprite $${name} [48x48/16] {\n`), name).toBe(true);
          expect(text.endsWith("\n@enduml"), name).toBe(true);
          expect(text, name).toContain(`!define ${prefix}_${name.toUpperCase()}(_alias) `);
        }
      }
    });
  }
});

describe("regenerating icons", () => {
  const fixtures: [string, string][] = [
    ["font-awesome-5", "user"],
    ["font-awesome-5", "500px"],
    ["font-awesome-5", "zhihu"],
    ["material", "3d_rotation"],
    ["material", "account_circle"],
  ];
  const upstreamOf = (set: string, name: string) =>
    readFileSync(join(here, "tupadr3-fixtures", set, `${name}.puml`), "utf8");
  const entryOf = (set: string, name: string) =>
    readJson<Record<string, Tupadr3Entry>>(set, `bucket-${tupadr3Bucket(name)}.json`)[name];

  for (const [set, name] of fixtures) {
    it(`${set}/${name} equals the upstream file exactly`, () => {
      const entry = entryOf(set, name);
      expect(entry).toBeDefined();
      expect(regenerateTupadr3Icon(set, name, entry!)).toBe(upstreamOf(set, name));
    });

    it(`${set}/${name}: the z data decodes to the sprite rows of the upstream file`, () => {
      const rows = upstreamOf(set, name).split("\n").slice(2, 50);
      const entry = entryOf(set, name);
      const pixels = decodeZ(typeof entry === "string" ? entry : (entry?.z ?? ""));
      expect(pixels.length).toBe(48 * 48);
      const decoded = rows.map((_, y) =>
        Array.from({ length: 48 }, (__, x) => "0123456789ABCDEF"[pixels[y * 48 + x]!]).join(""),
      );
      expect(decoded).toEqual(rows);
    });
  }

  it("stores and restores icons that break the pattern", () => {
    const z = entryOf("font-awesome-5", "500px") as string;
    const text = regenerateTupadr3Icon("font-awesome-5", "500px", { z, sprite: "other", tail: "@enduml" });
    expect(text.startsWith("@startuml\nsprite $other [48x48/16] {\n")).toBe(true);
    expect(text.endsWith("}\n\n\n@enduml")).toBe(true);
    expect(regenerateTupadr3Icon("material", "x", { raw: "whatever" })).toBe("whatever");
    expect(() => regenerateTupadr3Icon("nope", "x", "")).toThrow(/Unknown/);
  });

  it("puts names into the documented buckets", () => {
    const first = ["3d_rotation", "ad", "bell", "cat", "dog", "eye", "font", "git", "hat", "ice", "jar", "key", "lamp"];
    expect(first.map(tupadr3Bucket)).toEqual([
      "0a",
      "0a",
      "b",
      "c",
      "de",
      "de",
      "f",
      "gh",
      "gh",
      "ik",
      "ik",
      "ik",
      "l",
    ]);
    const second = ["moon", "nut", "owl", "pen", "quit", "rss", "sun", "tag", "user", "wifi", "yen", "zhihu", "_x"];
    expect(second.map(tupadr3Bucket)).toEqual([
      "mo",
      "mo",
      "mo",
      "p",
      "qr",
      "qr",
      "s",
      "tu",
      "tu",
      "vz",
      "vz",
      "vz",
      "0a",
    ]);
  });
});
