import { buildProviderBody } from "./provider";
import { buildProviderRequest, type AiEditRequest } from "./prompt";
import { AI_PROVIDERS, DEFAULT_AI_PROVIDER, type AiProviderId } from "./providers";

/**
 * Shows the exact request body that would be sent, built by the same function the provider sends. The API
 * key is a request header and is deliberately not part of this view.
 */
export function WhatWillBeSent({
  request,
  model,
  provider = DEFAULT_AI_PROVIDER,
}: {
  request: AiEditRequest;
  model: string;
  provider?: AiProviderId;
}) {
  const info = AI_PROVIDERS[provider];
  const body = buildProviderBody(provider, request, model);
  const { system, user } = buildProviderRequest(request);
  return (
    <details className="ai-what-will-be-sent">
      <summary>What will be sent</summary>
      <p>
        These texts go to {info.recipient} ({info.host}) with your API key, as a request to {info.endpoint}. Only this
        diagram is sent: no other tabs, project files or collaboration data.
      </p>
      <h4>Instructions to the model</h4>
      <pre aria-label="System prompt">{system}</pre>
      <h4>Your document and request</h4>
      <pre aria-label="Document and instruction">{user}</pre>
      <h4>Full request body</h4>
      <pre aria-label="Request body">{JSON.stringify(body, null, 2)}</pre>
    </details>
  );
}
