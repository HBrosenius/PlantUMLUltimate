/* global document, localStorage */
// Apply the last chosen theme before the first paint so the restoring state and the editor shell
// do not flash the other colour scheme while the workspace loads. A file rather than an inline
// script, so the page's CSP needs no 'unsafe-inline' for scripts.
try {
  var theme = localStorage.getItem("plantuml-studio.theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch {
  /* The system colour scheme applies. */
}
