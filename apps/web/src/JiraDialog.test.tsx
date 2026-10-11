// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { JiraDialog } from "./JiraDialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("connects with email and API token and links to Atlassian token creation", async () => {
  let connected = false;
  const outbound = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/api/connect-token")) {
      expect(JSON.parse(String(init?.body))).toEqual({
        siteUrl: "https://acme.atlassian.net",
        email: "user@example.com",
        apiToken: "secret",
      });
      connected = true;
      return Response.json({ connected: true });
    }
    if (String(input).includes("/api/fields")) return Response.json({ fields: [] });
    return Response.json({
      connected,
      sites: connected ? [{ id: "cloud-1", url: "https://acme.atlassian.net", name: "Acme" }] : [],
    });
  });
  vi.stubGlobal("fetch", outbound);
  render(
    <JiraDialog
      endpoint="https://integrations.example"
      source="@startgantt\n@endgantt"
      binding={undefined}
      readOnly={false}
      onApply={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  const token = await screen.findByLabelText("API token");
  expect(token.getAttribute("type")).toBe("password");
  expect(screen.getByRole("link", { name: "Atlassian API token" }).getAttribute("href")).toBe(
    "https://id.atlassian.com/manage-profile/security/api-tokens",
  );
  expect(screen.getByRole("button", { name: "Connect with Atlassian OAuth" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Jira site URL"), { target: { value: "https://acme.atlassian.net" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "user@example.com" } });
  fireEvent.change(token, { target: { value: "secret" } });
  fireEvent.click(screen.getByRole("button", { name: "Connect with API token" }));
  await waitFor(() => expect(screen.queryByLabelText("API token")).toBeNull());
});
