import { PROJECT_LIMITS } from "./types";

const reserved = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

export function validateProjectPath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || value.length > PROJECT_LIMITS.maxPathCharacters)
    return "Path must be a non-empty bounded string";
  if (value.normalize("NFC") !== value) return "Path must use NFC Unicode normalization";
  if (value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) return "Path must be relative POSIX";
  const parts = value.split("/");
  if (
    parts.some(
      (part) => !part || part === "." || part === ".." || [...part].some((character) => character.codePointAt(0)! < 32),
    )
  )
    return "Path has an unsafe segment";
  if (parts.some((part) => reserved.has(part.replace(/[. ]+$/, "").toLowerCase())))
    return "Path uses a platform-reserved component";
  return undefined;
}

export function portablePathKey(path: string): string {
  return path.normalize("NFC").toLocaleLowerCase("en-US");
}
