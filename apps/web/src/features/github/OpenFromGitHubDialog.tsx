import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useDialogFocus } from "../../use-dialog-focus";
import { GitProviderError, isPlantUmlFileName } from "../git/git-provider";
import {
  createGitHubClient,
  type GitHubClient,
  type GitHubEntry,
  type GitHubFile,
  type GitHubRepository,
} from "./github-client";
import { GitHubRepositoryPicker, type GitHubRepositorySelection } from "./GitHubRepositoryPicker";
import { gitHubFileUrl, type GitHubOrigin } from "./github-origin";
import { getGitHubState, getGitHubToken, loadRememberedGitHubToken, subscribeGitHub } from "./github-settings";

/** The local file path caps source at 500 kB; GitHub files are held to the same limit once decoded. */
const MAX_SOURCE_LENGTH = 500_000;

export interface OpenedFromGitHub {
  source: string;
  fileName: string;
  origin: GitHubOrigin;
}

const message = (error: unknown) =>
  error instanceof GitProviderError ? error.message : "Something went wrong while talking to GitHub.";

/**
 * File > Open > From GitHub. Two ways in: paste a file link, or pick repository, branch and folder (one folder
 * is listed at a time, so large repositories stay fast). Only PlantUML files and folders are shown.
 */
export function OpenFromGitHubDialog({
  onOpen,
  onClose,
  onOpenSettings,
  fetchImpl,
}: {
  onOpen(opened: OpenedFromGitHub): Promise<void>;
  onClose(): void;
  onOpenSettings(): void;
  fetchImpl?: typeof fetch;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  const state = useSyncExternalStore(subscribeGitHub, getGitHubState);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useDialogFocus(dialog, () => {
    if (!busy) onClose();
  });

  useEffect(() => {
    let current = true;
    void loadRememberedGitHubToken().then(() => {
      if (current) setReady(true);
    });
    return () => {
      current = false;
    };
  }, []);

  const client = useMemo<GitHubClient | undefined>(
    () =>
      state.hasToken
        ? createGitHubClient({ token: getGitHubToken() ?? "", ...(fetchImpl ? { fetch: fetchImpl } : {}) })
        : undefined,
    [state.hasToken, fetchImpl],
  );

  async function open(load: () => Promise<{ file: GitHubFile; origin: GitHubOrigin }>) {
    setBusy(true);
    setError("");
    try {
      const { file, origin } = await load();
      if (file.content.length > MAX_SOURCE_LENGTH)
        throw new GitProviderError("too-large", `${file.path} is larger than the 500 kB the editor opens.`);
      await onOpen({ source: file.content, fileName: file.name, origin });
      onClose();
    } catch (failure) {
      setError(message(failure));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form
        ref={dialog}
        className="document-settings-dialog open-work-dialog github-open-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Open from GitHub"
        onSubmit={(event) => event.preventDefault()}
      >
        <header>
          <h2>Open from GitHub</h2>
        </header>
        {!ready ? (
          <p role="status">Checking for a saved token…</p>
        ) : !client ? (
          <>
            <p>
              To open files from GitHub, add a fine-grained personal access token with read access to your repositories.
              It stays in this browser.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
            >
              Open Settings → GitHub
            </button>
          </>
        ) : (
          <GitHubSources
            client={client}
            busy={busy}
            onOpenFile={(load) => void open(load)}
            error={error}
            onError={setError}
          />
        )}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </footer>
      </form>
    </div>
  );
}

function GitHubSources({
  client,
  busy,
  error,
  onError,
  onOpenFile,
}: {
  client: GitHubClient;
  busy: boolean;
  error: string;
  onError(message: string): void;
  onOpenFile(load: () => Promise<{ file: GitHubFile; origin: GitHubOrigin }>): void;
}) {
  const [url, setUrl] = useState("");

  return (
    <>
      <section className="document-settings-section" aria-labelledby="github-open-link-heading">
        <h3 id="github-open-link-heading">Paste a link</h3>
        <label>
          File link
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://github.com/owner/repo/blob/main/diagrams/system.puml"
            value={url}
            disabled={busy}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (url.trim() && !busy) onOpenFile(() => client.openFileFromUrl(url));
              }
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy || !url.trim()}
          onClick={() => onOpenFile(() => client.openFileFromUrl(url))}
        >
          Open link
        </button>
      </section>
      <Browser client={client} busy={busy} onOpenFile={onOpenFile} onError={onError} />
      {busy && <p role="status">Opening…</p>}
      {error && <p role="alert">{error}</p>}
    </>
  );
}

function Browser({
  client,
  busy,
  onOpenFile,
  onError,
}: {
  client: GitHubClient;
  busy: boolean;
  onOpenFile(load: () => Promise<{ file: GitHubFile; origin: GitHubOrigin }>): void;
  onError(message: string): void;
}) {
  const [repo, setRepo] = useState<GitHubRepository>();
  const [branch, setBranch] = useState("");
  const [folder, setFolder] = useState("");
  const [entries, setEntries] = useState<GitHubEntry[]>();
  const [loading, setLoading] = useState("");
  const [localError, setLocalError] = useState("");
  const folderRequest = useRef(0);

  const fail = (failure: unknown) => {
    setLocalError(message(failure));
    onError("");
  };

  function select(selection: GitHubRepositorySelection | undefined) {
    ++folderRequest.current;
    setLocalError("");
    setFolder("");
    setEntries(undefined);
    setRepo(selection?.repo);
    setBranch(selection?.branch ?? "");
    if (selection) void loadFolder(selection.repo, selection.branch, "");
  }

  function loadFolder(target: GitHubRepository, ref: string, path: string) {
    const id = ++folderRequest.current;
    setLoading("folder");
    setLocalError("");
    setFolder(path);
    return client
      .listFolder(target.owner, target.name, ref, path)
      .then((list) => {
        if (id !== folderRequest.current) return;
        setEntries(
          list.filter((entry) => entry.type === "dir" || (entry.type === "file" && isPlantUmlFileName(entry.name))),
        );
      })
      .catch((failure) => {
        if (id !== folderRequest.current) return;
        setEntries(undefined);
        fail(failure);
      })
      .finally(() => id === folderRequest.current && setLoading(""));
  }

  const segments = folder ? folder.split("/") : [];

  return (
    <section className="document-settings-section" aria-labelledby="github-open-browse-heading">
      <h3 id="github-open-browse-heading">Browse your repositories</h3>
      <GitHubRepositoryPicker client={client} busy={busy} onChange={select} />
      {repo && branch && (
        <nav className="github-breadcrumb" aria-label="Folder">
          <button type="button" disabled={busy} onClick={() => void loadFolder(repo, branch, "")}>
            {repo.name}
          </button>
          {segments.map((segment, index) => (
            <span key={index}>
              {" / "}
              <button
                type="button"
                disabled={busy}
                onClick={() => void loadFolder(repo, branch, segments.slice(0, index + 1).join("/"))}
              >
                {segment}
              </button>
            </span>
          ))}
        </nav>
      )}
      {loading === "folder" && <p role="status">Loading folder…</p>}
      {entries && loading !== "folder" && (
        <ul className="github-entries" aria-label="Files and folders">
          {entries.length === 0 && <li>No PlantUML files or folders here.</li>}
          {entries.map((entry) => (
            <li key={entry.path}>
              {entry.type === "dir" ? (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Folder ${entry.name}`}
                  onClick={() => void loadFolder(repo!, branch, entry.path)}
                >
                  {entry.name}/
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`File ${entry.name}`}
                  onClick={() =>
                    onOpenFile(async () => {
                      const file = await client.getFile(repo!.owner, repo!.name, branch, entry.path);
                      return {
                        file,
                        origin: {
                          owner: repo!.owner,
                          repo: repo!.name,
                          ref: branch,
                          path: file.path,
                          sha: file.sha,
                          htmlUrl: gitHubFileUrl(repo!.owner, repo!.name, branch, file.path),
                        },
                      };
                    })
                  }
                >
                  {entry.name}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {localError && <p role="alert">{localError}</p>}
    </section>
  );
}
