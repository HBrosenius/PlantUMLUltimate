# Testing for agents

- Audit screenshots: e2e specs that write tracked PNGs under `docs/audits/` do so only when `AUDIT_SCREENSHOTS=1` is set
  (via `tests/e2e/audit-screenshot.ts`). The default is off, so e2e runs leave git clean. Set the flag only when you
  intend to refresh the committed audit images.
