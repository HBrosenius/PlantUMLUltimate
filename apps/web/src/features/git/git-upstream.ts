import { resolveThreeWayMerge, threeWayMerge } from "../../external-file-merge";
import {
  originProvider,
  originVersion,
  proposalVersion,
  withOriginVersion,
  withProposalVersion,
  type GitOrigin,
} from "./git-origin";
import type { GitProvider } from "./git-provider";
import type { UpstreamChangedError } from "./git-propose";

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
      origin: GitOrigin;
      /** The merged result is exactly what is on the host already, so there is nothing left to commit. */
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
 * it. The merge base is the version the tab started from. Nothing is written to the host.
 */
export async function mergeUpstream(
  client: GitProvider,
  origin: GitOrigin,
  source: string,
  changed: Pick<UpstreamChangedError, "target" | "branch">,
): Promise<UpstreamMerge> {
  const proposal = changed.target === "proposal" ? origin.proposal : undefined;
  const baseVersion = proposal ? proposalVersion(proposal) : originVersion(origin);
  if (!baseVersion) return { kind: "unchanged" };
  const [upstream, base] = await Promise.all([
    client.getFile(origin.owner, origin.repo, changed.branch, origin.path),
    client.getVersionText(origin.owner, origin.repo, {
      version: baseVersion,
      ...(proposal ? {} : { blob: origin.blob }),
      path: origin.path,
    }),
  ]);
  if (upstream.version === baseVersion) return { kind: "unchanged" };
  const merge = threeWayMerge(lf(base), lf(source), lf(upstream.content));
  if (merge.conflicts.length) return { kind: "conflict", branch: changed.branch, regions: conflictRegions(merge) };
  // The merge works on LF; the result keeps the line endings of the file on the host, so the commit does not
  // rewrite every line of a CRLF file.
  const merged = /\r\n/.test(upstream.content)
    ? resolveThreeWayMerge(merge, []).replace(/\r?\n/g, "\r\n")
    : resolveThreeWayMerge(merge, []);
  return {
    kind: "merged",
    branch: changed.branch,
    base,
    upstream: upstream.content,
    merged,
    origin: proposal
      ? { ...origin, proposal: withProposalVersion(originProvider(origin), proposal, upstream.version) }
      : withOriginVersion(origin, upstream.version, upstream.blob),
    nothingToPropose: lf(merged) === lf(upstream.content),
  };
}
