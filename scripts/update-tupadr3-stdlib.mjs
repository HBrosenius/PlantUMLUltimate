#!/usr/bin/env node
// Refreshes the bundled tupadr3 icon sets from a release tag of the plantuml-icon-font-sprites repository:
//   node scripts/update-tupadr3-stdlib.mjs v3.0.0
// Only the sets listed in SETS are packed, into apps/web/src/render/stdlib/tupadr3/. The output is data: per set an
// index (name -> bucket) and one JSON file per alphabetic bucket, holding each icon's sprite as PlantUML `z` data plus
// anything that differs from the fixed macro pattern. Nothing downloaded is executed and nothing is fetched at
// runtime. The text regenerated from a bucket entry (render/tupadr3-icons.ts) is checked here against the upstream
// file for every icon before anything is written.
//
// Listing the files needs one GitHub API call; set GITHUB_TOKEN to raise the rate limit if needed.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, inflateRawSync } from "node:zlib";

const REPOSITORY = "tupadr3/plantuml-icon-font-sprites";
const SETS = {
  "font-awesome-5": {
    prefix: "FA5",
    upstream: "FortAwesome/Font-Awesome",
    upstreamRef: "branch 5.x (final release 5.15.3)",
    licenceRepository: "FortAwesome/Font-Awesome",
    licenceTag: "5.15.3",
    licenceSource: "LICENSE.txt",
    licenceFile: "LICENSE.txt",
    licenceSummary: "Icons CC BY 4.0, fonts SIL OFL 1.1, code MIT",
  },
  material: {
    prefix: "MATERIAL",
    upstream: "google/material-design-icons",
    upstreamRef: "tag 3.0.2",
    licenceRepository: "google/material-design-icons",
    licenceTag: "3.0.2",
    licenceSource: "LICENSE",
    licenceFile: "LICENSE",
    licenceSummary: "Apache License 2.0",
  },
};
// Must match tupadr3Bucket() in apps/web/src/render/tupadr3-icons.ts.
const BUCKETS = ["0a", "b", "c", "de", "f", "gh", "ik", "l", "mo", "p", "qr", "s", "tu", "vz"];
const Z_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const HEX = "0123456789ABCDEF";

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error("Usage: node scripts/update-tupadr3-stdlib.mjs <release tag, for example v3.0.0>");
  process.exit(1);
}

function bucketOf(name) {
  const first = name.charAt(0);
  if (first >= "0" && first <= "9") return "0a";
  for (const group of BUCKETS) {
    if (group.length === 1 ? first === group : first >= group.charAt(0) && first <= group.charAt(1)) return group;
  }
  return "0a";
}

function encodeZ(packed) {
  let text = "";
  for (let i = 0; i < packed.length; i += 3) {
    const a = packed[i];
    const b = packed[i + 1] ?? 0;
    const c = packed[i + 2] ?? 0;
    text += Z_ALPHABET[a >> 2] + Z_ALPHABET[((a & 3) << 4) | (b >> 4)];
    if (i + 1 < packed.length) text += Z_ALPHABET[((b & 15) << 2) | (c >> 6)];
    if (i + 2 < packed.length) text += Z_ALPHABET[c & 63];
  }
  return text;
}

function decodeZ(text) {
  const bytes = [];
  let bits = 0;
  let count = 0;
  for (const char of text) {
    bits = (bits << 6) | Z_ALPHABET.indexOf(char);
    count += 6;
    if (count >= 8) {
      count -= 8;
      bytes.push((bits >> count) & 255);
      bits &= (1 << count) - 1;
    }
  }
  return inflateRawSync(Uint8Array.from(bytes));
}

function defaultTail(prefix, name, sprite) {
  const upper = name.toUpperCase();
  const macro = `${prefix}_${upper}`;
  const stereotype = `${prefix} ${upper}`;
  return [
    `!define ${macro}(_alias) ENTITY(rectangle,black,${sprite},_alias,${stereotype})`,
    `!define ${macro}(_alias, _label) ENTITY(rectangle,black,${sprite},_label, _alias,${stereotype})`,
    `!define ${macro}(_alias, _label, _shape) ENTITY(_shape,black,${sprite},_label, _alias,${stereotype})`,
    `!define ${macro}(_alias, _label, _shape, _color) ENTITY(_shape,_color,${sprite},_label, _alias,${stereotype})`,
    `skinparam folderBackgroundColor<<${stereotype}>> White`,
    "@enduml",
  ].join("\n");
}

function rebuild(set, name, entry) {
  if (typeof entry === "object" && entry.raw !== undefined) return entry.raw;
  const detail = typeof entry === "string" ? { z: entry } : entry;
  const width = detail.w ?? 48;
  const height = detail.h ?? 48;
  const sprite = detail.sprite ?? name;
  const pixels = decodeZ(detail.z);
  const rows = [];
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) row += HEX[pixels[y * width + x] & 15];
    rows.push(row);
  }
  return (
    `@startuml\nsprite $${sprite} [${width}x${height}/16] {\n${rows.join("\n")}\n}\n\n\n` +
    (detail.tail ?? defaultTail(SETS[set].prefix, name, sprite))
  );
}

// A linear parse (no backtracking regex): the header line, hex rows up to "}", then the rest.
function pack(set, name, text) {
  const rawEntry = { raw: text };
  const lines = text.split("\n");
  if (lines[0] !== "@startuml") return rawEntry;
  const header = /^sprite \$([^ ]+) \[(\d+)x(\d+)\/16\] \{$/.exec(lines[1] ?? "");
  if (!header) return rawEntry;
  const width = Number(header[2]);
  const height = Number(header[3]);
  const rows = [];
  let index = 2;
  while (index < lines.length && lines[index] !== "}") rows.push(lines[index++]);
  if (lines[index] !== "}" || rows.length !== height) return rawEntry;
  if (!rows.every((row) => row.length === width && [...row].every((char) => HEX.includes(char)))) return rawEntry;
  if (lines[index + 1] !== "" || lines[index + 2] !== "") return rawEntry;
  const tail = lines.slice(index + 3).join("\n");
  const pixels = Uint8Array.from(rows.join(""), (char) => HEX.indexOf(char));
  const z = encodeZ(deflateRawSync(pixels, { level: 9 }));
  const sprite = header[1];
  const entry = {};
  entry.z = z;
  if (width !== 48) entry.w = width;
  if (height !== 48) entry.h = height;
  if (sprite !== name) entry.sprite = sprite;
  if (tail !== defaultTail(SETS[set].prefix, name, sprite)) entry.tail = tail;
  return Object.keys(entry).length === 1 ? z : entry;
}

async function fetchText(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.text()).replace(/\r\n/g, "\n");
    } catch (error) {
      if (attempt >= 4) throw new Error(`${url}: ${error.message}`, { cause: error });
    }
  }
}

async function mapLimit(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]);
      }
    }),
  );
  return results;
}

const headers = { Accept: "application/vnd.github+json", "User-Agent": "plantuml-ultimate-stdlib-update" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
const treeResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/git/trees/${tag}?recursive=1`, {
  headers,
});
if (!treeResponse.ok) throw new Error(`File list: HTTP ${treeResponse.status}`);
const tree = await treeResponse.json();
if (tree.truncated) throw new Error("File list was truncated");
const paths = tree.tree.map((item) => item.path);

const target = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "src", "render", "stdlib", "tupadr3");
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
const raw = (path) => `https://raw.githubusercontent.com/${REPOSITORY}/${tag}/${path}`;

const common = await fetchText(raw("icons/common.puml"));
await writeFile(join(target, "common.puml"), common);
await writeFile(join(target, "LICENSE"), await fetchText(raw("LICENSE.md")));

const manifestSets = {};
const date = new Date().toISOString().slice(0, 10);
let totalBytes = 0;
for (const [set, info] of Object.entries(SETS)) {
  const prefix = `icons/${set}/`;
  const files = paths.filter(
    (path) => path.startsWith(prefix) && path.endsWith(".puml") && !path.slice(prefix.length).includes("/"),
  );
  if (files.length === 0) throw new Error(`${set}: no icons at ${tag}`);
  const icons = await mapLimit(files, 16, async (path) => ({
    name: path.slice(prefix.length, -".puml".length),
    text: await fetchText(raw(path)),
  }));
  icons.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const dir = join(target, set);
  await mkdir(dir, { recursive: true });
  const buckets = new Map(BUCKETS.map((id) => [id, {}]));
  const index = {};
  let exceptions = 0;
  for (const { name, text } of icons) {
    const entry = pack(set, name, text);
    if (rebuild(set, name, entry) !== text) throw new Error(`${set}/${name}: regenerated text differs from upstream`);
    if (typeof entry !== "string") exceptions++;
    const bucket = bucketOf(name);
    buckets.get(bucket)[name] = entry;
    index[name] = bucket;
  }
  const lineFile = (object) =>
    "{\n" +
    Object.entries(object)
      .map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`)
      .join(",\n") +
    "\n}\n";
  await writeFile(join(dir, "index.json"), lineFile(index));
  const bucketSizes = {};
  for (const [id, content] of buckets) {
    if (Object.keys(content).length === 0) continue;
    const text = lineFile(content);
    await writeFile(join(dir, `bucket-${id}.json`), text);
    bucketSizes[id] = Object.keys(content).length;
    totalBytes += text.length;
  }
  await writeFile(
    join(dir, info.licenceFile),
    await fetchText(
      `https://raw.githubusercontent.com/${info.licenceRepository}/${info.licenceTag}/${info.licenceSource}`,
    ),
  );
  manifestSets[set] = {
    prefix: info.prefix,
    upstream: info.upstream,
    upstreamRef: info.upstreamRef,
    licenceTag: info.licenceTag,
    licenceFile: info.licenceFile,
    licenceSummary: info.licenceSummary,
    icons: icons.length,
    exceptions,
    buckets: bucketSizes,
  };
  console.log(`${set}: ${icons.length} icons, ${Object.keys(bucketSizes).length} buckets, ${exceptions} exceptions`);
}

await writeFile(
  join(target, "manifest.json"),
  JSON.stringify({ repository: REPOSITORY, tag, date, bucketRule: BUCKETS, sets: manifestSets }, null, 2) + "\n",
);
await writeFile(
  join(target, "README.md"),
  `# tupadr3 icon sets (bundled)

- Source: https://github.com/${REPOSITORY}
- Release tag: ${tag}
- Packed on: ${date}
- Licence: MIT, Copyright (c) 2017 tupadr3 (see LICENSE)
- Sets: ${Object.keys(SETS).join(", ")}
${Object.entries(SETS)
  .map(
    ([set, info]) =>
      `- ${set}: icons from ${info.upstream} (${info.upstreamRef}); licence read at tag ${info.licenceTag}, ${info.licenceSummary} (see ${set}/${info.licenceFile})`,
  )
  .join("\n")}

These files are data, packed by \`node scripts/update-tupadr3-stdlib.mjs ${tag}\`. Nothing here is fetched at runtime.

- \`common.puml\` is the upstream file, byte for byte (line endings normalised to LF).
- Per set, \`index.json\` maps each icon name to its bucket, and \`bucket-<id>.json\` holds the icons of that bucket.
  The bucket is the icon name's first character: digits and \`a\` go to \`0a\`, then \`b\`, \`c\`, \`de\`, \`f\`, \`gh\`,
  \`ik\`, \`l\`, \`mo\`, \`p\`, \`qr\`, \`s\`, \`tu\`, \`vz\`.
- An icon is stored as its sprite in PlantUML \`z\` form (one byte per pixel, raw deflate, PlantUML's 6-bit alphabet).
  The macro lines follow one pattern and are regenerated; an icon that deviates is stored as an object with only
  the deviating fields. \`render/tupadr3-icons.ts\` regenerates the exact upstream text, and the script checks that
  for every icon before writing.
- \`manifest.json\` records the tag, date, counts and bucket sizes. The Font Awesome 5 icons are CC BY 4.0 and need
  credit; see the third-party notices.

Refresh with \`node scripts/update-tupadr3-stdlib.mjs <tag>\`. Do not edit these files by hand.
`,
);
console.log(`Total ${totalBytes} bytes of buckets from ${REPOSITORY}@${tag}`);
