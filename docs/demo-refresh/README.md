# Refreshed instructional demos

These six replacements use the current ribbon. Replacements are unlisted for review. The user has requested removal of the six superseded public uploads after the new Help/index links are live; permanent deletion awaits final confirmation.

The JSON files here are the executable narration and scene plans. The overview uses explicitly introduced prepared examples for task editing, allocations, workload and history. The outline clip demonstrates search and docking. The scenario clip uses Plan → What-if scenario and the current form, saved alternative and review flow.

Narration: MimikaStudio, Kokoro Emma (`bf_emma`), speed 1.0. Keep sentence WAV masters; create 48 kHz, 192 kbps MP3 listening copies. `narrate-refresh.py` uses the supplied local Mimika client and reuses identical cached sentences.

- Capture forecast, task check-in and WBS with their individual `scripts/demo-video/record*.mjs` commands, passing `--audio`, `--out` and `--url`.
- Build those captures with `python3 scripts/demo-video/build-refresh.py <demo>`.
- Capture overview, outline and scenario-lab with `node scripts/demo-video/record-scenes.mjs overview outline scenario-lab`.
- Build those with `python3 scripts/demo-video/build-scenes.py overview outline scenario-lab`.

Outputs are isolated under `output/demo-refresh/<demo>/`. Captions use measured sentence boundaries; chapter timing follows the recorded scene or retimed action cues. Validation must include full video decoding, media properties, readable screen capture, script/action alignment and audio checks. Automated checks do not replace a human listen-through.

The 19-lesson course was audited separately: its 259 scene plans match the recorded narration and already use the current ribbon. Jira and physical-device demonstrations remain outside this refresh.
