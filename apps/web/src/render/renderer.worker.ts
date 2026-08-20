/// <reference lib="webworker" />
import type { RenderRequest, RenderResult } from "../model";
import { renderLocalGantt } from "./local-gantt-renderer";

self.onmessage = (event: MessageEvent<RenderRequest>) => {
  const started = performance.now();
  const { requestId, source } = event.data;
  let result: RenderResult;
  try {
    result = { requestId, svg: renderLocalGantt(source), durationMs: performance.now() - started };
  } catch (error) {
    result = {
      requestId,
      durationMs: performance.now() - started,
      error: error instanceof Error ? error.message : "Render failed",
    };
  }
  self.postMessage(result);
};

export {};
