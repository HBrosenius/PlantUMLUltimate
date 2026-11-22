import { buildStreamBody } from "./provider";
import type { AiEditRequest } from "./prompt";

/**
 * Shows the exact request body that would be sent, built by the same function the provider sends. The API
 * key is a request header and is deliberately not part of this view.
 */
export function WhatWillBeSent({ request, model }: { request: AiEditRequest; model: string }) {
  const body = buildStreamBody(request, model);
  const system = body.system.map((block) => block.text).join("\n\n");
  const message = body.messages.map((entry) => entry.content).join("\n\n");
  return (
    <details className="ai-what-will-be-sent">
      <summary>What will be sent</summary>
      <p>
        These texts go to Anthropic (api.anthropic.com) with your API key. Only this diagram is sent: no other tabs,
        project files or collaboration data.
      </p>
      <h4>Instructions to the model</h4>
      <pre aria-label="System prompt">{system}</pre>
      <h4>Your document and request</h4>
      <pre aria-label="Document and instruction">{message}</pre>
      <h4>Full request body</h4>
      <pre aria-label="Request body">{JSON.stringify(body, null, 2)}</pre>
    </details>
  );
}
