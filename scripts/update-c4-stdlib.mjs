#!/usr/bin/env node
// Refreshes the bundled C4-PlantUML library from an official release tag:
//   node scripts/update-c4-stdlib.mjs v2.14.0
// Only the .puml library files listed below and the LICENSE are copied into
// apps/web/src/render/stdlib/C4/. They are data: the app inlines them into diagram source and the
// sandboxed engine renders them. Nothing downloaded is executed, and nothing is fetched at runtime.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = "plantuml-stdlib/C4-PlantUML";
const FILES = [
  "C4.puml",
  "C4_Context.puml",
  "C4_Container.puml",
  "C4_Component.puml",
  "C4_Dynamic.puml",
  "C4_Deployment.puml",
  "C4_Sequence.puml",
  "LICENSE",
];

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error("Usage: node scripts/update-c4-stdlib.mjs <release tag, for example v2.14.0>");
  process.exit(1);
}

const target = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "src", "render", "stdlib", "C4");
await mkdir(target, { recursive: true });
let total = 0;
for (const name of FILES) {
  const response = await fetch(`https://raw.githubusercontent.com/${REPOSITORY}/${tag}/${name}`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const text = (await response.text()).replace(/\r\n/g, "\n");
  await writeFile(join(target, name), text);
  total += text.length;
  console.log(`${name}  ${text.length} bytes`);
}
await writeFile(
  join(target, "README.md"),
  `# C4-PlantUML (bundled)

- Source: https://github.com/${REPOSITORY}
- Release tag: ${tag}
- Licence: MIT (see LICENSE)
- Bundled engine: \`@plantuml/core\` (the version in apps/web/package.json)
- Files: ${FILES.filter((file) => file.endsWith(".puml")).join(", ")}

These files are data. The app inlines them into diagram source (render/includes.ts) when a diagram
includes \`<C4/...>\` or a well-known C4-PlantUML link, and the sandboxed engine renders them. They are
loaded on demand and never fetched at runtime.

The files here are the upstream files, byte for byte (line endings normalised to LF). Two things are
done to the text when it is loaded, in \`render/include-library.ts\`, never in these files:

- the \`!if %variable_exists("RELATIVE_INCLUDE")\` choice between a relative include and a download is
  replaced by the relative include, because both branches resolve to the same bundled file;
- \`$defaultPersonSprite\` is set to empty (C4-PlantUML's own \`HIDE_PERSON_SPRITE()\`), because the bundled
  engine draws no raster images and the default person icon is a raster sprite. People are drawn as boxes
  marked \`<<person>>\`.

\`C4_Sequence.puml\` is bundled so \`!include <C4/C4_Sequence>\` works; the app has no C4 sequence starter.

Refresh with \`node scripts/update-c4-stdlib.mjs <tag>\`. Do not edit these files by hand.
`,
);
console.log(`Total ${total} bytes from ${REPOSITORY}@${tag}`);
