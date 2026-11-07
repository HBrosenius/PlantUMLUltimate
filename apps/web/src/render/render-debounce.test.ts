import { expect, it } from "vitest";
import { DEBOUNCE_MAX_MS, DEBOUNCE_MIN_MS, TYPING_WINDOW_MS, renderDebounceMs } from "./render-debounce";

it("sends the first edit after a pause after the minimum wait, whatever the last render cost", () => {
  expect(renderDebounceMs({ busy: false })).toBe(DEBOUNCE_MIN_MS);
  expect(renderDebounceMs({ busy: false, lastRenderMs: 400, sinceLastEditMs: TYPING_WINDOW_MS })).toBe(DEBOUNCE_MIN_MS);
});

it("follows half the last render cost while typing continues, within the clamp", () => {
  expect(renderDebounceMs({ busy: false, lastRenderMs: 160, sinceLastEditMs: 100 })).toBe(80);
  expect(renderDebounceMs({ busy: false, lastRenderMs: 4, sinceLastEditMs: 100 })).toBe(DEBOUNCE_MIN_MS);
  expect(renderDebounceMs({ busy: false, lastRenderMs: 5000, sinceLastEditMs: 100 })).toBe(DEBOUNCE_MAX_MS);
});

it("waits while a render is running even after a pause", () => {
  expect(renderDebounceMs({ busy: true, lastRenderMs: 60, sinceLastEditMs: 5000 })).toBe(DEBOUNCE_MIN_MS);
  expect(renderDebounceMs({ busy: true, lastRenderMs: 200 })).toBe(100);
});

it("uses a conservative wait before any render has been measured", () => {
  expect(renderDebounceMs({ busy: true })).toBe(DEBOUNCE_MIN_MS);
  expect(renderDebounceMs({ busy: true, lastRenderMs: Number.NaN })).toBe(DEBOUNCE_MIN_MS);
});
