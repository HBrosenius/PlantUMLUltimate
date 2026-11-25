# C4-PlantUML (bundled)

- Source: https://github.com/plantuml-stdlib/C4-PlantUML
- Release tag: v2.14.0
- Licence: MIT (see LICENSE)
- Bundled engine: `@plantuml/core` (the version in apps/web/package.json)
- Files: C4.puml, C4_Context.puml, C4_Container.puml, C4_Component.puml, C4_Dynamic.puml, C4_Deployment.puml, C4_Sequence.puml

These files are data. The app inlines them into diagram source (render/includes.ts) when a diagram
includes `<C4/...>` or a well-known C4-PlantUML link, and the sandboxed engine renders them. They are
loaded on demand and never fetched at runtime.

The files here are the upstream files, byte for byte (line endings normalised to LF). One thing is
done to the text when it is loaded, in `render/include-library.ts`, never in these files:

- the `!if %variable_exists("RELATIVE_INCLUDE")` choice between a relative include and a download is
  replaced by the relative include, because both branches resolve to the same bundled file.

The default person icon (a raster sprite) is drawn: the renderer worker turns raster sprites into PNG
data: URLs (see `render/sprite-canvas.ts` and `docs/sprites-spike.md`).

`C4_Sequence.puml` is bundled so `!include <C4/C4_Sequence>` works; the app has no C4 sequence starter.

Refresh with `node scripts/update-c4-stdlib.mjs <tag>`. Do not edit these files by hand.
