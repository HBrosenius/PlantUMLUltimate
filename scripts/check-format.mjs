import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const prettier = fileURLToPath(import.meta.resolve("prettier/bin/prettier.cjs"));
const result = spawnSync(process.execPath, [prettier, "--check", "--ignore-unknown", ...trackedFiles], {
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
