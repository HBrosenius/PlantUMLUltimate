# tupadr3 icon sets (bundled)

- Source: https://github.com/tupadr3/plantuml-icon-font-sprites
- Release tag: v3.0.0
- Packed on: 2026-11-28
- Licence: MIT, Copyright (c) 2017 tupadr3 (see LICENSE)
- Sets: font-awesome-5, material
- font-awesome-5: icons from FortAwesome/Font-Awesome (branch 5.x (final release 5.15.3)); licence read at tag 5.15.3, Icons CC BY 4.0, fonts SIL OFL 1.1, code MIT (see font-awesome-5/LICENSE.txt)
- material: icons from google/material-design-icons (tag 3.0.2); licence read at tag 3.0.2, Apache License 2.0 (see material/LICENSE)

These files are data, packed by `node scripts/update-tupadr3-stdlib.mjs v3.0.0`. Nothing here is fetched at runtime.

- `common.puml` is the upstream file, byte for byte (line endings normalised to LF).
- Per set, `index.json` maps each icon name to its bucket, and `bucket-<id>.json` holds the icons of that bucket.
  The bucket is the icon name's first character: digits and `a` go to `0a`, then `b`, `c`, `de`, `f`, `gh`,
  `ik`, `l`, `mo`, `p`, `qr`, `s`, `tu`, `vz`.
- An icon is stored as its sprite in PlantUML `z` form (one byte per pixel, raw deflate, PlantUML's 6-bit alphabet).
  The macro lines follow one pattern and are regenerated; an icon that deviates is stored as an object with only
  the deviating fields. `render/tupadr3-icons.ts` regenerates the exact upstream text, and the script checks that
  for every icon before writing.
- `manifest.json` records the tag, date, counts and bucket sizes. The Font Awesome 5 icons are CC BY 4.0 and need
  credit; see the third-party notices.

Refresh with `node scripts/update-tupadr3-stdlib.mjs <tag>`. Do not edit these files by hand.
