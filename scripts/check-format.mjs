import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import * as prettier from "prettier";
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
let failed = false;
for (const file of files) {
  const info = await prettier.getFileInfo(file);
  if (info.ignored || !info.inferredParser) continue;
  const config = await prettier.resolveConfig(file);
  const text = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
  if (!(await prettier.check(text, { ...config, filepath: file }))) {
    console.error(`Formatting: ${file}`);
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
