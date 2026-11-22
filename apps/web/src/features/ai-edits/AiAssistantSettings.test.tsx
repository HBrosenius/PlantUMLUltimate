// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SettingsDialog } from "../../SettingsDialog";
import { AiAssistantSettings } from "./AiAssistantSettings";
import { forgetAiKey, getAiAssistantState, getAiKey, resetAiAssistantForTests } from "./ai-settings";
import { WhatWillBeSent } from "./WhatWillBeSent";

beforeEach(async () => {
  localStorage.clear();
  resetAiAssistantForTests();
  await forgetAiKey();
  localStorage.clear();
  resetAiAssistantForTests();
});
afterEach(cleanup);

it("shows the consent screen first and turns on only after the user confirms", async () => {
  const user = userEvent.setup();
  render(<AiAssistantSettings />);
  expect(screen.getByText(/off by default/i)).toBeInTheDocument();
  expect(screen.getByText(/api\.anthropic\.com/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "platform.claude.com" })).toHaveAttribute(
    "href",
    "https://platform.claude.com/",
  );
  expect(screen.getByText(/Claude Pro or Max subscription does not include API access/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Anthropic API key")).not.toBeInTheDocument();
  expect(getAiAssistantState().enabled).toBe(false);
  await user.click(screen.getByRole("button", { name: /turn on AI assistant/i }));
  expect(getAiAssistantState().enabled).toBe(true);
  expect(screen.getByLabelText("Anthropic API key")).toBeInTheDocument();
});

it("saves a session key, remembers on request, forgets it, and lets the model be chosen", async () => {
  const user = userEvent.setup();
  render(<AiAssistantSettings />);
  await user.click(screen.getByRole("button", { name: /turn on AI assistant/i }));
  await user.selectOptions(screen.getByLabelText("Model"), "claude-sonnet-5-5");
  expect(getAiAssistantState().model).toBe("claude-sonnet-5-5");

  const input = screen.getByLabelText("Anthropic API key");
  await user.type(input, "sk-ant-secret-1");
  expect(screen.getByRole("button", { name: "Save key" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Save key" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Key saved for this session."));
  expect(getAiKey()).toBe("sk-ant-secret-1");
  expect(input).toHaveValue("");
  expect(document.body.textContent).not.toContain("sk-ant-secret-1");

  await user.click(screen.getByLabelText("Remember this key on this device"));
  await user.type(input, "sk-ant-secret-2");
  await user.click(screen.getByRole("button", { name: "Save key" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Key saved on this device."));
  expect(getAiAssistantState().remember).toBe(true);

  await user.click(screen.getByRole("button", { name: "Forget key" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Key forgotten."));
  expect(getAiKey()).toBeUndefined();
  await user.click(screen.getByRole("button", { name: "Turn off AI assistant" }));
  expect(getAiAssistantState().enabled).toBe(false);
});

it("does not submit the surrounding Settings form when Enter is pressed in the key field", async () => {
  const user = userEvent.setup();
  let applied = 0;
  render(
    <SettingsDialog
      mode="settings"
      current={{ theme: "system", advancedMode: true, defaultDiagramTheme: "" }}
      onApply={() => (applied += 1)}
      onClose={() => undefined}
    />,
  );
  await user.click(screen.getByRole("button", { name: "AI assistant" }));
  await user.click(screen.getByRole("button", { name: /turn on AI assistant/i }));
  await user.type(screen.getByLabelText("Anthropic API key"), "abc{Enter}");
  expect(applied).toBe(0);
});

it("What will be sent shows the exact system prompt, document and body but never a key", async () => {
  render(
    <WhatWillBeSent
      model="claude-opus-5-5"
      request={{
        kind: "sequence",
        source: "@startuml\nA -> B : hi\n@enduml",
        selection: { startLine: 2, endLine: 2 },
        instruction: "Add a timeout",
      }}
    />,
  );
  expect(screen.getByLabelText("System prompt").textContent).toContain("You edit PlantUML diagram source");
  expect(screen.getByLabelText("Document and instruction").textContent).toContain("[[[SELECTION_START]]]");
  expect(screen.getByLabelText("Document and instruction").textContent).toContain("Add a timeout");
  const body = screen.getByLabelText("Request body").textContent ?? "";
  expect(body).toContain('"model": "claude-opus-5-5"');
  expect(body).toContain("server-side-fallback");
  expect(body).not.toMatch(/sk-ant|api[_-]?key/i);
});
