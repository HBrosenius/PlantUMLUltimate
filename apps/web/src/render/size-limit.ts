export function renderSizeLimit(
  error: string | undefined,
): { width: number; height: number; limit: number } | undefined {
  const match = error
    ?.slice(0, 10_000)
    .match(/Diagram too large for browser rendering:\s*(\d+)\s*x\s*(\d+)\s*\(max\s+(\d+)\)/i);
  if (!match) return undefined;
  const [width, height, limit] = match.slice(1).map(Number);
  return width! > 0 && height! > 0 && limit! > 0 && [width, height, limit].every(Number.isSafeInteger)
    ? { width: width!, height: height!, limit: limit! }
    : undefined;
}
