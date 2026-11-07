import { expect, it } from "vitest";
import { DEBOUNCE_MAX_MS, DEBOUNCE_MIN_MS, TYPING_WINDOW_MS, renderDebounceMs } from "./render-debounce";

it("sends the first edit after a pause immediately", () => {
  expect(renderDebounceMs({ busy: false })).toBe(0);
  expect(renderDebounceMs({ busy: false, lastRenderMs: 400, sinceLastEditMs: TYPING_WINDOW_MS })).toBe(0);
});

it("follows half the last render cost while typing continues, within the clamp", () => {
  expect(renderDebounceMs({ busy: false, lastRenderMs: 90, sinceLastEditMs: 100 })).toBe(45);
  expect(renderDebounceMs({ busy: false, lastRenderMs: 4, sinceLastEditMs: 100 })).toBe(DEBOUNCE_MIN_MS);
  expect(renderDebounceMs({ busy: false, lastRenderMs: 5000, sinceLastEditMs: 100 })).toBe(DEBOUNCE_MAX_MS);
});

it("waits while a render is running even after a pause", () => {
  expect(renderDebounceMs({ busy: true, lastRenderMs: 60, sinceLastEditMs: 5000 })).toBe(30);
  expect(renderDebounceMs({ busy: true, lastRenderMs: 200 })).toBe(100);
});

it("uses a conservative wait before any render has been measured", () => {
  expect(renderDebounceMs({ busy: true })).toBe(50);
  expect(renderDebounceMs({ busy: true, lastRenderMs: Number.NaN })).toBe(50);
});
