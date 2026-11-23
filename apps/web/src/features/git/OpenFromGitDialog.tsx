import { useRef, useState } from "react";
import { useDialogFocus } from "../../use-dialog-focus";
import { createOrigin, type GitOrigin } from "./git-origin";
import {
  describeGitError,
  detectLinkTarget,
  providerForTarget,
  targetKey,
  useGitProvider,
  useHostTarget,
  wordingFor,
  type GitHostTarget,
} from "./git-hosts";
import {
  GitProviderError,
  isPlantUmlFileName,
  type GitEntry,
  type GitFile,
  type GitProvider,
  type GitProviderId,
  type GitRepository,
} from "./git-provider";
import { GitRepositoryPicker, type GitRepositorySelection } from "./GitRepositoryPicker";

/** The local file path caps source at 500 kB; files from a Git host are held to the same limit once decoded. */
const MAX_SOURCE_LENGTH = 500_000;

export interface OpenedFromGit {
  source: string;
  fileName: string;
  origin: GitOrigin;
}

type Loader = () => Promise<{ file: GitFile; origin: GitOrigin }>;

/**
 * File > Open > From GitHub or From GitLab. Two ways in: paste a file link, or pick repository, branch and folder
 * (one folder is listed at a time, so large repositories stay fast). Only PlantUML files and folders are shown.
 * A pasted link picks its own host, whichever dialog it is pasted into.
 */
export function OpenFromGitDialog({
  provider = "github",
  onOpen,
  onClose,
  onOpenSettings,
  fetchImpl,
}: {
  provider?: GitProviderId;
  onOpen(opened: OpenedFromGit): Promise<void>;
  onClose(): void;
  onOpenSettings(): void;
  fetchImpl?: typeof fetch;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  const { target, servers, server, chooseServer } = useHostTarget(provider);
  const words = wordingFor(provider);
  const { ready, provider: client } = useGitProvider(target, fetchImpl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useDialogFocus(dialog, () => {
    if (!busy) onClose();
  });

  async function open(load: Loader) {
    setBusy(true);
    setError("");
    try {
      const { file, origin } = await load();
      if (file.content.length > MAX_SOURCE_LENGTH)
        throw new GitProviderError("too-large", `${file.path} is larger than the 500 kB the editor opens.`);
      await onOpen({ source: file.content, fileName: file.name, origin });
      onClose();
    } catch (failure) {
      setError(describeGitError(failure, words.name));
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
        aria-label={`Open from ${words.name}`}
        onSubmit={(event) => event.preventDefault()}
      >
        <header>
          <h2>Open from {words.name}</h2>
        </header>
        {!ready ? (
          <p role="status">Checking for a saved token…</p>
        ) : !client ? (
          <>
            <p>
              To open files from {words.name}, {words.tokenAdvice.read}. It stays in this browser.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
            >
              Open Settings → {words.name}
            </button>
          </>
        ) : (
          <GitSources
            client={client}
            target={target}
            servers={servers}
            server={server}
            onServer={chooseServer}
            fetchImpl={fetchImpl}
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

function GitSources({
  client,
  target,
  servers,
  server,
  onServer,
  fetchImpl,
  busy,
  error,
  onError,
  onOpenFile,
}: {
  client: GitProvider;
  target: GitHostTarget;
  servers: string[];
  server: string;
  onServer(server: string): void;
  fetchImpl: typeof fetch | undefined;
  busy: boolean;
  error: string;
  onError(message: string): void;
  onOpenFile(load: Loader): void;
}) {
  const [url, setUrl] = useState("");

  /**
   * A pasted link picks its host: a link to the other host (or to another GitLab server) is opened through that
   * host's own client and token, not this dialog's.
   */
  const openLink: Loader = () => {
    const linkTarget = detectLinkTarget(url);
    if (!linkTarget || targetKey(linkTarget) === targetKey(target)) return client.openFileFromUrl(url);
    return providerForTarget(linkTarget, fetchImpl).then((other) => other.openFileFromUrl(url));
  };

  return (
    <>
      {servers.length > 1 && (
        <label>
          GitLab server
          <select value={server} disabled={busy} onChange={(event) => onServer(event.target.value)}>
            {servers.map((item) => (
              <option key={item} value={item}>
                {new URL(item).host}
              </option>
            ))}
          </select>
        </label>
      )}
      <section className="document-settings-section" aria-labelledby="github-open-link-heading">
        <h3 id="github-open-link-heading">Paste a link</h3>
        <label>
          File link
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={
              client.info.id === "gitlab"
                ? `${client.info.server}/group/project/-/blob/main/diagrams/system.puml`
                : "https://github.com/owner/repo/blob/main/diagrams/system.puml"
            }
            value={url}
            disabled={busy}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (url.trim() && !busy) onOpenFile(openLink);
              }
            }}
          />
        </label>
        <button type="button" disabled={busy || !url.trim()} onClick={() => onOpenFile(openLink)}>
          Open link
        </button>
      </section>
      <Browser key={targetKey(target)} client={client} busy={busy} onOpenFile={onOpenFile} onError={onError} />
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
  client: GitProvider;
  busy: boolean;
  onOpenFile(load: Loader): void;
  onError(message: string): void;
}) {
  const words = wordingFor(client.info.id);
  const [repo, setRepo] = useState<GitRepository>();
  const [branch, setBranch] = useState("");
  const [folder, setFolder] = useState("");
  const [entries, setEntries] = useState<GitEntry[]>();
  const [loading, setLoading] = useState("");
  const [localError, setLocalError] = useState("");
  const folderRequest = useRef(0);

  const fail = (failure: unknown) => {
    setLocalError(describeGitError(failure, words.name));
    onError("");
  };

  function select(selection: GitRepositorySelection | undefined) {
    ++folderRequest.current;
    setLocalError("");
    setFolder("");
    setEntries(undefined);
    setRepo(selection?.repo);
    setBranch(selection?.branch ?? "");
    if (selection) void loadFolder(selection.repo, selection.branch, "");
  }

  function loadFolder(target: GitRepository, ref: string, path: string) {
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
      <h3 id="github-open-browse-heading">Browse your {words.repositories}</h3>
      <GitRepositoryPicker client={client} busy={busy} onChange={select} />
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
                        origin: createOrigin(client.info, {
                          owner: repo!.owner,
                          repo: repo!.name,
                          ref: branch,
                          path: file.path,
                          version: file.version,
                          blob: file.blob,
                          htmlUrl: client.fileUrl(repo!.owner, repo!.name, branch, file.path),
                        }),
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
