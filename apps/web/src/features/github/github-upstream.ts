import { resolveThreeWayMerge, threeWayMerge } from "../../external-file-merge";
import type { GitHubClient } from "./github-client";
import type { GitHubOrigin } from "./github-origin";
import type { UpstreamChangedError } from "./github-propose";

const lf = (text: string) => text.replace(/\r\n/g, "\n");

export type UpstreamMerge =
  | {
      kind: "merged";
      /** The branch the newer version was read from. */
      branch: string;
      /** The version the tab's edits were made on: the opened blob, or the content last proposed. */
      base: string;
      upstream: string;
      merged: string;
      /** The origin the tab carries once the merged source is applied: the newer blob is the new base. */
      origin: GitHubOrigin;
      /** The merged result is exactly what is on GitHub already, so there is nothing left to commit. */
      nothingToPropose: boolean;
    }
  | {
      kind: "conflict";
      branch: string;
      /** Where the overlapping edits are, as line ranges in the tab's own version. */
      regions: string[];
    }
  /** The file is not actually newer than what the tab started from, so the original error stands. */
  | { kind: "unchanged" };

/** Line ranges (1-based, in the tab's own source) of the regions both sides changed. */
function conflictRegions(merge: ReturnType<typeof threeWayMerge>): string[] {
  const regions: string[] = [];
  let line = 1;
  for (const segment of merge.segments) {
    if (segment.kind === "text") {
      line += segment.lines.length;
      continue;
    }
    const length = segment.conflict.local.length;
    regions.push(
      length === 0
        ? `near line ${line} (where you removed lines)`
        : length === 1
          ? `line ${line}`
          : `lines ${line}-${line + length - 1}`,
    );
    line += length;
  }
  return regions;
}

/**
 * After a commit was refused because the file moved on, reads the newer version and merges the tab's edits into
 * it. The merge base is the version the tab started from. Nothing is written to GitHub.
 */
export async function mergeUpstream(
  client: GitHubClient,
  origin: GitHubOrigin,
  source: string,
  changed: Pick<UpstreamChangedError, "target" | "branch">,
): Promise<UpstreamMerge> {
  const baseSha = changed.target === "proposal" ? origin.proposal?.sha : origin.sha;
  if (!baseSha) return { kind: "unchanged" };
  const [upstream, base] = await Promise.all([
    client.getFile(origin.owner, origin.repo, changed.branch, origin.path),
    client.getBlobText(origin.owner, origin.repo, baseSha),
  ]);
  if (upstream.sha === baseSha) return { kind: "unchanged" };
  const merge = threeWayMerge(lf(base), lf(source), lf(upstream.content));
  if (merge.conflicts.length) return { kind: "conflict", branch: changed.branch, regions: conflictRegions(merge) };
  const merged = resolveThreeWayMerge(merge, []);
  return {
    kind: "merged",
    branch: changed.branch,
    base,
    upstream: upstream.content,
    merged,
    origin:
      changed.target === "proposal" && origin.proposal
        ? { ...origin, proposal: { ...origin.proposal, sha: upstream.sha } }
        : { ...origin, sha: upstream.sha },
    nothingToPropose: merged === lf(upstream.content),
  };
}
