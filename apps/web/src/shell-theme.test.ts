// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import { applyShellTheme, SHELL_THEME_KEY } from "./shell-theme";

beforeEach(() => {
  document.head.innerHTML =
    '<meta name="theme-color" content="#f7f8fa" media="(prefers-color-scheme: light)" />' +
    '<meta name="theme-color" content="#111318" media="(prefers-color-scheme: dark)" />';
});
afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

const themeColors = () =>
  [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((meta) => meta.content);

it("mirrors an explicit theme to the document root, browser chrome and the pre-paint storage key", () => {
  applyShellTheme("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem(SHELL_THEME_KEY)).toBe("dark");
  expect(themeColors()).toEqual(["#111318", "#111318"]);

  applyShellTheme("light");
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(localStorage.getItem(SHELL_THEME_KEY)).toBe("light");
  expect(themeColors()).toEqual(["#f7f8fa", "#f7f8fa"]);
});

it("returns to the system colour scheme by clearing the mirror", () => {
  applyShellTheme("dark");
  applyShellTheme("system");
  expect(document.documentElement.dataset.theme).toBeUndefined();
  expect(localStorage.getItem(SHELL_THEME_KEY)).toBeNull();
  expect(themeColors()).toEqual(["#f7f8fa", "#111318"]);
});
