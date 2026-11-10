# Local course narration — KittenTTS 0.8 / Leo

> Current production uses [MimikaStudio narration](mimika-narration.md), selected on 1 November 2026. This page preserves the earlier KittenTTS setup for reproducibility.

The course uses **`KittenML/kitten-tts-mini-0.8`**, voice **Leo**, speed **1.0**, at 24 kHz. Model selection is explicit; the generator asserts these settings. It makes no hosted speech API requests and does not load an API key. First use downloads the model; subsequent generation uses the local CPU and cache.

The [0.8 model card](https://huggingface.co/KittenML/kitten-tts-mini-0.8) identifies the model as Apache 2.0. The [official ONNX documentation](https://github.com/KittenML/KittenTTS/blob/main/docs/onnx-models.md) describes local CPU operation and eight built-in voices. Local generation has no per-call hosted inference charge; it uses your machine's compute and storage.

## Isolated setup

The installed Python package is `kittenml==0.9.7`, used only to load the explicitly selected **0.8 model**. Newer runtime package numbering is separate from the model version. The ONNX-only dependency setup follows the official documentation and avoids installing the large optional KittenTTS 2 stack.

```sh
python3 -m venv output/training-pilot/.venv
output/training-pilot/.venv/bin/python -m pip install --no-deps kittenml==0.9.7
output/training-pilot/.venv/bin/python -m pip install -r docs/training/local-narration-requirements.txt
output/training-pilot/.venv/bin/python output/training-pilot/voice-sample.py
output/training-pilot/.venv/bin/python output/training-pilot/narrate-local.py
```

The minimal installation intentionally omits dependencies used only by the other model family. Pip may report those optional runtime-package dependency omissions; the selected ONNX model is verified by actual local generation.

## Cache and outputs

- Configuration: `output/training-pilot/voice-config.json`.
- Model cache: `output/training-pilot/model-cache/`.
- Leo sample: `output/training-pilot/leo-voice-sample.wav`.
- Scene narration: `output/training-pilot/audio/<scene-id>.wav`.
- Each clip's JSON sidecar fingerprints the text and model/voice settings. Unchanged clips are reused; edited clips regenerate locally.
- Measured clip durations and remaining storyboard allowances: `output/training-pilot/narration-timings.json`.
- Exact installed environment: `output/training-pilot/requirements-lock.txt`.

The current lesson has 12 clips totaling 470.083 seconds. Generation and basic audio integrity checks passed; final listening, pronunciation/caption alignment, mix normalization, and video synchronization remain part of pilot editing. The wider course should use one consistent Leo narrator unless a later explicit change is requested.

Keep environments and model caches out of published practice packs. The reusable generator reads the narration manifest and local model configuration; no credentials belong in either.
