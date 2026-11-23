// @vitest-environment jsdom
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OpenFromGitDialog } from "./OpenFromGitDialog";
import { GitHubSettings } from "../github/GitHubSettings";
import { forgetGitHubToken, resetGitHubForTests, saveGitHubToken } from "../github/github-settings";

const b64 = (text: string) => btoa(unescape(encodeURIComponent(text)));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const SOURCE = "@startuml\nAlice -> Bob : Grüße\n@enduml\n";

function fakeGitHub() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const ref = url.searchParams.get("ref");
    // Like the real API, an unknown ref is a 404.
    if (url.pathname.startsWith("/repos/octo/diagrams/contents") && ref && !["main", "feature/x"].includes(ref))
      return json({ message: "No commit found for the ref" }, 404);
    if (url.pathname === "/user") return json({ login: "octo" });
    if (url.pathname === "/user/repos")
      return json([
        {
          full_name: "octo/diagrams",
          name: "diagrams",
          owner: { login: "octo" },
          default_branch: "main",
          private: true,
        },
        { full_name: "octo/other", name: "other", owner: { login: "octo" }, default_branch: "trunk", private: false },
      ]);
    if (url.pathname === "/repos/octo/diagrams/branches") return json([{ name: "main" }, { name: "feature/x" }]);
    if (url.pathname === "/repos/octo/diagrams/contents/" || url.pathname === "/repos/octo/diagrams/contents")
      return json([
        { name: "README.md", path: "README.md", type: "file", size: 3 },
        { name: "docs", path: "docs", type: "dir", size: 0 },
        { name: "system.puml", path: "system.puml", type: "file", size: 30 },
      ]);
    if (url.pathname === "/repos/octo/diagrams/contents/docs")
      return json([
        { name: "deep.wsd", path: "docs/deep.wsd", type: "file", size: 30 },
        { name: "notes.txt", path: "docs/notes.txt", type: "file", size: 3 },
      ]);
    if (url.pathname.startsWith("/repos/octo/diagrams/contents/")) {
      const path = decodeURIComponent(url.pathname.replace("/repos/octo/diagrams/contents/", ""));
      return json({
        type: "file",
        name: path.split("/").pop(),
        path,
        sha: `sha-of-${path}-${ref}`,
        size: SOURCE.length,
        encoding: "base64",
        content: b64(SOURCE),
      });
    }
    return json({ message: "Not Found" }, 404);
  });
}

beforeEach(async () => {
  localStorage.clear();
  resetGitHubForTests();
  await forgetGitHubToken();
});
afterEach(cleanup);

function renderDialog(fetchImpl: ReturnType<typeof fakeGitHub>) {
  const onOpen = vi.fn(async (_opened: unknown) => undefined);
  const onClose = vi.fn();
  const onOpenSettings = vi.fn();
  render(
    <OpenFromGitDialog
      onOpen={onOpen}
      onClose={onClose}
      onOpenSettings={onOpenSettings}
      fetchImpl={fetchImpl as unknown as typeof fetch}
    />,
  );
  return { onOpen, onClose, onOpenSettings };
}

it("without a token explains what to do and leads to Settings → GitHub, without calling GitHub", async () => {
  const fetchImpl = fakeGitHub();
  const { onClose, onOpenSettings } = renderDialog(fetchImpl);
  expect(await screen.findByText(/add a fine-grained personal access token/)).toBeVisible();
  expect(screen.queryByLabelText("File link")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open Settings → GitHub" }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(onOpenSettings).toHaveBeenCalledOnce();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("opens a file from a pasted link with its origin", async () => {
  await saveGitHubToken("github_pat_unit", false);
  const fetchImpl = fakeGitHub();
  const { onOpen, onClose } = renderDialog(fetchImpl);
  fireEvent.change(await screen.findByLabelText("File link"), {
    target: { value: "https://github.com/octo/diagrams/blob/feature/x/docs/deep.wsd" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Open link" }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(onOpen).toHaveBeenCalledWith({
    source: SOURCE,
    fileName: "deep.wsd",
    origin: {
      owner: "octo",
      repo: "diagrams",
      ref: "feature/x",
      path: "docs/deep.wsd",
      sha: "sha-of-docs/deep.wsd-feature/x",
      htmlUrl: "https://github.com/octo/diagrams/blob/feature/x/docs/deep.wsd",
    },
  });
});

it("browses repository, branch and folders lazily, showing only PlantUML files and folders", async () => {
  await saveGitHubToken("github_pat_unit", false);
  const fetchImpl = fakeGitHub();
  const { onOpen } = renderDialog(fetchImpl);
  const repository = await screen.findByLabelText("Repository");
  fireEvent.change(repository, { target: { value: "octo/diagrams" } });
  const list = await screen.findByRole("list", { name: "Files and folders" });
  expect(within(list).getByRole("button", { name: "Folder docs" })).toBeVisible();
  expect(within(list).getByRole("button", { name: "File system.puml" })).toBeVisible();
  expect(within(list).queryByText("README.md")).not.toBeInTheDocument();
  const callsBeforeFolder = fetchImpl.mock.calls.length;
  fireEvent.click(within(list).getByRole("button", { name: "Folder docs" }));
  const inner = await screen.findByRole("button", { name: "File deep.wsd" });
  expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
  expect(fetchImpl.mock.calls.length).toBe(callsBeforeFolder + 1);
  fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "feature/x" } });
  await screen.findByRole("button", { name: "File system.puml" });
  fireEvent.click(screen.getByRole("button", { name: "File system.puml" }));
  await waitFor(() => expect(onOpen).toHaveBeenCalled());
  expect(inner).toBeDefined();
  expect(onOpen.mock.calls[0]![0]).toMatchObject({
    fileName: "system.puml",
    origin: { owner: "octo", repo: "diagrams", ref: "feature/x", path: "system.puml" },
  });
});

it("shows errors inline and keeps the dialog open", async () => {
  await saveGitHubToken("github_pat_unit", false);
  const { onOpen, onClose } = renderDialog(fakeGitHub());
  fireEvent.change(await screen.findByLabelText("File link"), {
    target: { value: "https://github.com/octo/private/blob/main/a.puml" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Open link" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("token cannot see");
  fireEvent.change(screen.getByLabelText("File link"), { target: { value: "https://example.com/a" } });
  fireEvent.click(screen.getByRole("button", { name: "Open link" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("not a link to a file on GitHub"));
  expect(onOpen).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

it("Settings: saves a token, tests the connection and forgets it", async () => {
  const fetchImpl = fakeGitHub();
  render(<GitHubSettings fetchImpl={fetchImpl as unknown as typeof fetch} />);
  const field = screen.getByLabelText("GitHub token");
  expect(field).toHaveAttribute("type", "password");
  expect(screen.getByRole("link", { name: /personal-access-tokens\/new/ })).toHaveAttribute(
    "href",
    "https://github.com/settings/personal-access-tokens/new",
  );
  expect(screen.getByRole("link", { name: /personal-access-tokens\/new/ })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  fireEvent.change(field, { target: { value: "github_pat_unit" } });
  fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Connected as octo. The token reaches 2 repositories."),
  );
  expect(field).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Forget token" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Token forgotten."));
  expect(screen.getByRole("button", { name: "Test connection" })).toBeDisabled();
});
