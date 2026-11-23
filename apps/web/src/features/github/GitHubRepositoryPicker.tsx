import { useEffect, useRef, useState } from "react";
import { GitHubError, type GitHubClient, type GitHubRepository } from "./github-client";

export interface GitHubRepositorySelection {
  repo: GitHubRepository;
  branch: string;
}

const message = (error: unknown) =>
  error instanceof GitHubError ? error.message : "Something went wrong while talking to GitHub.";

/**
 * Choose one of the token's repositories and one of its branches (the default branch first). `onChange` reports
 * `undefined` while nothing usable is chosen (no repository, or its branches are still loading) and the
 * repository with its branch once both are known.
 */
export function GitHubRepositoryPicker({
  client,
  busy,
  branchLabel = "Branch",
  onChange,
}: {
  client: GitHubClient;
  busy: boolean;
  branchLabel?: string;
  onChange(selection: GitHubRepositorySelection | undefined): void;
}) {
  const [repositories, setRepositories] = useState<GitHubRepository[]>();
  const [truncated, setTruncated] = useState(false);
  const [filter, setFilter] = useState("");
  const [repo, setRepo] = useState<GitHubRepository>();
  const [branches, setBranches] = useState<string[]>();
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const requests = useRef({ repos: 0, branches: 0 });
  const report = useRef(onChange);
  report.current = onChange;

  useEffect(() => {
    const id = ++requests.current.repos;
    setLoading("repositories");
    client
      .listRepositories()
      .then((list) => {
        if (id !== requests.current.repos) return;
        setRepositories(list.items);
        setTruncated(list.truncated);
        setError("");
      })
      .catch((failure) => id === requests.current.repos && setError(message(failure)))
      .finally(() => id === requests.current.repos && setLoading(""));
  }, [client]);

  function chooseRepository(next: GitHubRepository | undefined) {
    setRepo(next);
    setBranches(undefined);
    setBranch("");
    setError("");
    report.current(undefined);
    if (!next) return;
    const id = ++requests.current.branches;
    setLoading("branches");
    client
      .listBranches(next.owner, next.name)
      .then((list) => {
        if (id !== requests.current.branches) return;
        setBranches([next.defaultBranch, ...list.items.filter((name) => name !== next.defaultBranch)]);
        setBranch(next.defaultBranch);
        report.current({ repo: next, branch: next.defaultBranch });
      })
      .catch((failure) => id === requests.current.branches && setError(message(failure)))
      .finally(() => id === requests.current.branches && setLoading(""));
  }

  const visible = (repositories ?? []).filter((item) =>
    item.fullName.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <>
      {loading === "repositories" && <p role="status">Loading repositories…</p>}
      {repositories && (
        <>
          <label>
            Filter repositories
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
            />
          </label>
          <label>
            Repository
            <select
              value={repo?.fullName ?? ""}
              disabled={busy}
              onChange={(event) => chooseRepository(repositories.find((item) => item.fullName === event.target.value))}
            >
              <option value="">
                {repositories.length === 0 ? "No repositories reachable by this token" : "Choose a repository…"}
              </option>
              {visible.map((item) => (
                <option key={item.fullName} value={item.fullName}>
                  {item.fullName}
                  {item.private ? " (private)" : ""}
                </option>
              ))}
            </select>
          </label>
          {truncated && <p>Showing the 1,000 most recently pushed repositories. Use a file link for others.</p>}
        </>
      )}
      {repo && branches && (
        <label>
          {branchLabel}
          <select
            value={branch}
            disabled={busy}
            onChange={(event) => {
              setBranch(event.target.value);
              report.current({ repo, branch: event.target.value });
            }}
          >
            {branches.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {loading === "branches" && <p role="status">Loading branches…</p>}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
