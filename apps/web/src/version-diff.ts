export interface VersionDiffLine {
  kind: "equal" | "added" | "removed";
  left?: string;
  right?: string;
  leftNumber?: number;
  rightNumber?: number;
}

export function diffVersionSources(leftSource: string, rightSource: string): VersionDiffLine[] {
  const left = leftSource.split("\n");
  const right = rightSource.split("\n");
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
