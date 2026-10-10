# A25 — Export preview and explicit source links

File → Export → Preview export… reuses the existing SVG/PNG/PDF downloads, with full rendered bounds, margin, background backing and raster scale. Successful exports remember these options locally. Quick export commands remain unchanged. Stale/missing renderer output is identified and cannot be downloaded from preview. Source and identities are unchanged.

PDF uses the existing JPEG-based PDF exporter, white page and A4 maximum bounds. PNG/PDF retain raster dimension limits. Authored fills are preserved; white backing does not recolor the diagram. Editor selection and transient overlays are excluded.

File → Export → Link and embed… requires explicit acknowledgement of source disclosure to the named HTTPS renderer. Encoded URL and Markdown image text are generated locally. No request/image load occurs merely to open the dialog or generate strings. It is not a collaboration link or offline artifact. Source updates clear output and consent. Credentials, non-HTTPS URLs, query/fragment and overly long links are rejected with actionable feedback.

Encoding follows [PlantUML hexadecimal URL encoding](https://plantuml.com/text-encoding), using UTF-8 bytes and `~h`. URLs longer than 8,000 characters direct users to local image/source export. External appearance may differ because the URL includes authored source rather than this app's renderer preprocessing and overlays.

Validation: full suite 203 files / 2,170 tests before final dialog tests; focused export/dialog/menu tests after safeguards; production build and changed-file lint/format. Six browser journeys across Chromium, Firefox and WebKit verify downloaded file signatures, SVG white backing, remembered options, source preservation, consent, invalid endpoint and zero requests to the sharing destination. Screenshots inspected: [phone export](a25-export-phone.png), [sharing](a25-share.png).
