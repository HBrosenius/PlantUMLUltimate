export interface VersionDiffLine {
  kind: "equal" | "added" | "removed";
  left?: string;
  right?: string;
  leftNumber?: number;
  rightNumber?: number;
}

const MAX_DIFF_CELLS = 4_000_000;

export function diffVersionSources(leftSource: string, rightSource: string): VersionDiffLine[] {
  const left = leftSource.split("\n");
  const right = rightSource.split("\n");
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  )
    suffix += 1;
  const leftMiddle = left.slice(prefix, left.length - suffix);
  const rightMiddle = right.slice(prefix, right.length - suffix);
  if ((leftMiddle.length + 1) * (rightMiddle.length + 1) > MAX_DIFF_CELLS) {
    return [
      ...left.slice(0, prefix).map((line, index) => ({
        kind: "equal" as const,
        left: line,
        right: line,
        leftNumber: index + 1,
        rightNumber: index + 1,
      })),
      ...leftMiddle.map((line, index) => ({
        kind: "removed" as const,
        left: line,
        leftNumber: prefix + index + 1,
      })),
      ...rightMiddle.map((line, index) => ({
        kind: "added" as const,
        right: line,
        rightNumber: prefix + index + 1,
      })),
      ...left.slice(left.length - suffix).map((line, index) => ({
        kind: "equal" as const,
        left: line,
        right: line,
        leftNumber: left.length - suffix + index + 1,
        rightNumber: right.length - suffix + index + 1,
      })),
    ];
  }
  const width = right.length + 1;
  const table = new Uint32Array((left.length + 1) * width);
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      const index = leftIndex * width + rightIndex;
      table[index] =
        left[leftIndex] === right[rightIndex]
          ? table[(leftIndex + 1) * width + rightIndex + 1]! + 1
          : Math.max(table[(leftIndex + 1) * width + rightIndex]!, table[leftIndex * width + rightIndex + 1]!);
    }
  }
  const result: VersionDiffLine[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    if (leftIndex < left.length && rightIndex < right.length && left[leftIndex] === right[rightIndex]) {
      result.push({
        kind: "equal",
        left: left[leftIndex]!,
        right: right[rightIndex]!,
        leftNumber: leftIndex + 1,
        rightNumber: rightIndex + 1,
      });
      leftIndex += 1;
      rightIndex += 1;
    } else if (
      rightIndex < right.length &&
      (leftIndex >= left.length ||
        table[leftIndex * width + rightIndex + 1]! >= table[(leftIndex + 1) * width + rightIndex]!)
    ) {
      result.push({ kind: "added", right: right[rightIndex]!, rightNumber: rightIndex + 1 });
      rightIndex += 1;
    } else {
      result.push({ kind: "removed", left: left[leftIndex]!, leftNumber: leftIndex + 1 });
      leftIndex += 1;
    }
  }
  return result;
}
