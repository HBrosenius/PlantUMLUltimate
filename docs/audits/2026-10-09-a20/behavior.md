# A20 theme gallery and preview appearance

- App appearance, new-diagram theme defaults and current-diagram styling have separate controls and explanations.
- Six featured choices use actual local PlantUML sample renders. All bundled themes remain available through the select, including preservation of a custom theme read from source.
- One renderer loads samples serially. Successful sanitized SVG samples share a page-session cache capped at 64 entries; reopening dialogs reuses previews. The working document is never used as gallery input. Failed samples have a visible fallback.
- Current-diagram theme selection is staged until Apply. Cancel preserves source and authored appearance. New-diagram defaults affect only subsequently created diagrams.
- Adapt preview to app theme is off by default. With dark app appearance (including a dark system preference), it adds a white backing to transparent diagram areas and applies brightness(0.82) to the displayed diagram, producing a softened light surface. Light app appearance is unchanged. This is a browser preference, never a skinparam or theme directive.
- SVG/PNG exports continue to use authored renderer output. The preview-only backing and brightness adjustment are not included. The Settings explanation makes this distinction explicit.
- Selection and dependency handles remain interactive. The filter preserves geometry and hue; it does not invert colors or attempt to rewrite theme palettes. Rendered samples and keyboard focus were inspected at desktop and phone widths.

Screenshots: `a20-gallery.png`, `a20-gallery-phone.png`, `a20-dark-preview.png`.
