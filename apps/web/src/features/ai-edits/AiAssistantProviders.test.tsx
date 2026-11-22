// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AiAssistantSettings } from "./AiAssistantSettings";
import { forgetAiKey, getAiAssistantState, getAiKey, resetAiAssistantForTests, setAiProvider } from "./ai-settings";
import { WhatWillBeSent } from "./WhatWillBeSent";

async function reset() {
  localStorage.clear();
  resetAiAssistantForTests();
  for (const provider of ["anthropic", "openai", "xai"] as const) await forgetAiKey(provider);
  localStorage.clear();
  resetAiAssistantForTests();
  setAiProvider("anthropic");
}

beforeEach(reset);
afterEach(cleanup);

it("lets the provider be chosen, with its own consent text, console link and key field", async () => {
  const user = userEvent.setup();
  render(<AiAssistantSettings />);
  await user.selectOptions(screen.getByLabelText("Provider"), "openai");
  expect(screen.getByText(/OpenAI, through its API \(api\.openai\.com\)/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "platform.openai.com" })).toHaveAttribute(
    "href",
    "https://platform.openai.com/",
  );
  expect(screen.getByText(/ChatGPT subscription does not include API access/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /turn on AI assistant/i }));
  expect(screen.getByLabelText("OpenAI API key")).toBeInTheDocument();
  expect(screen.queryByLabelText("Anthropic API key")).not.toBeInTheDocument();
  expect(getAiAssistantState()).toMatchObject({ provider: "openai", model: "gpt-6.2-sol" });

  await user.selectOptions(screen.getByLabelText("Provider"), "xai");
  // Consent to OpenAI is not consent to xAI.
  expect(screen.getByText(/xAI, through its API \(api\.x\.ai\)/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "console.x.ai" })).toHaveAttribute("href", "https://console.x.ai/");
  await user.click(screen.getByRole("button", { name: "I understand, use xAI" }));
  expect(screen.getByLabelText("xAI API key")).toBeInTheDocument();
  expect(getAiAssistantState()).toMatchObject({ provider: "xai", model: "grok-4.7" });
});

it("keeps a separate key per provider and forgets only the chosen provider's", async () => {
  const user = userEvent.setup();
  render(<AiAssistantSettings />);
  await user.click(screen.getByRole("button", { name: /turn on AI assistant/i }));
  await user.type(screen.getByLabelText("Anthropic API key"), "sk-ant-key-a");
  await user.click(screen.getByRole("button", { name: "Save key" }));
  await waitFor(() => expect(getAiKey("anthropic")).toBe("sk-ant-key-a"));

  await user.selectOptions(screen.getByLabelText("Provider"), "openai");
  await user.click(screen.getByRole("button", { name: "I understand, use OpenAI" }));
  expect(screen.getByRole("status")).toHaveTextContent("No key set");
  await user.type(screen.getByLabelText("OpenAI API key"), "sk-openai-key-b");
  await user.click(screen.getByRole("button", { name: "Save key" }));
  await waitFor(() => expect(getAiKey("openai")).toBe("sk-openai-key-b"));
  expect(getAiKey("anthropic")).toBe("sk-ant-key-a");

  await user.click(screen.getByRole("button", { name: "Forget key" }));
  await waitFor(() => expect(getAiKey("openai")).toBeUndefined());
  expect(getAiKey("anthropic")).toBe("sk-ant-key-a");
});

it("accepts a custom model id and says that it has no price", async () => {
  const user = userEvent.setup();
  render(<AiAssistantSettings />);
  await user.selectOptions(screen.getByLabelText("Provider"), "xai");
  await user.click(screen.getByRole("button", { name: /turn on AI assistant/i }));
  await user.selectOptions(screen.getByLabelText("Model"), "__custom__");
  const input = screen.getByLabelText("Custom model id");
  await user.clear(input);
  await user.type(input, "grok-9-preview");
  expect(getAiAssistantState().model).toBe("grok-9-preview");
  expect(screen.getByText(/tokens only/)).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Model"), "grok-4.3");
  expect(getAiAssistantState().model).toBe("grok-4.3");
});

it("What will be sent names the provider and endpoint and shows that provider's body", () => {
  const request = {
    kind: "sequence" as const,
    source: "@startuml\nA -> B : hi\n@enduml",
    selection: { startLine: 2, endLine: 2 },
    instruction: "Add a timeout",
  };
  const { unmount } = render(<WhatWillBeSent model="gpt-6.2-sol" provider="openai" request={request} />);
  expect(document.body.textContent).toContain("OpenAI (api.openai.com)");
  expect(document.body.textContent).toContain("https://api.openai.com/v1/responses");
  const body = screen.getByLabelText("Request body").textContent ?? "";
  expect(body).toContain('"model": "gpt-6.2-sol"');
  expect(body).toContain('"strict": true');
  expect(body).not.toMatch(/sk-|api[_-]?key/i);
  unmount();
  render(<WhatWillBeSent model="grok-4.7" provider="xai" request={request} />);
  expect(document.body.textContent).toContain("xAI (api.x.ai)");
  expect(document.body.textContent).toContain("https://api.x.ai/v1/responses");
});
