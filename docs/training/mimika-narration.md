# Current narration workflow — MimikaStudio

Updated 1 November 2026. MimikaStudio is the selected narration provider for the course. The earlier KittenTTS/Leo files remain preparation assets; current deliveries are under `output/mimika-videos/`.

Use the supplied client at `/Users/henbro/Downloads/mimika/mimika_tts.py`, connected to the local MimikaStudio service at `http://127.0.0.1:7693`.

Selected settings:

- Engine: Kokoro through MimikaStudio.
- Voice: Emma (`bf_emma`), the supplied script's default. The available Kokoro voice list does not include Leo.
- Speed: 1.0.
- Generated MP3 bitrate: **192 kbps**.
- Editing masters: lossless 24 kHz mono WAV with measured sentence boundaries.
- Video output: 1080p/30 fps H.264, AAC stereo at 192 kbps, English subtitle track.

The supplied MP3 command requests 192 kbps, but a 24 kHz MPEG-2 MP3 is limited to 160 kbps. The production wrapper uses the supplied client's WAV option and encodes the lossless source at 48 kHz to deliver an actual 192 kbps MP3. It leaves the original client unchanged. Equivalent two-step usage:

```sh
python3 /Users/henbro/Downloads/mimika/mimika_tts.py "Better quality." --voice bf_emma --speed 1.0 --format wav --bitrate 192 --out output/mimika-videos/example.wav
ffmpeg -i output/mimika-videos/example.wav -ar 48000 -c:a libmp3lame -b:a 192k output/mimika-videos/example.mp3
```

## Rebuild both current videos

Run from the repository root with MimikaStudio running:

```sh
python3 output/mimika-videos/generate.py
python3 output/mimika-videos/build.py
python3 output/mimika-videos/verify.py
```

The generator invokes the supplied script with text on stdin and explicit output paths inside the repository. It caches individual sentence MP3s using text, voice, bitrate, speed and the client script hash. It does not change the script or write narration files into Downloads.

The pilot retains the actual app recordings. Their visible actions are mapped to the new narration's measured sentence cues. Retiming uses actual recorded action times, including removal of an idle gap in the original answer take. The final source at the end of every scene is checked against the lesson checkpoint. Original recordings and earlier video exports are preserved.

The introduction retains its authored title compositions and uses newly generated MimikaStudio narration. Both videos receive newly timed English captions. The twelve pilot chapters are recalculated from the edited durations.

## Outputs

- `output/mimika-videos/pilot/plantuml-ultimate-lesson-02.mp4`
- `output/mimika-videos/pilot/lesson-02.srt` and `lesson-02.vtt`
- `output/mimika-videos/pilot/chapters.txt`
- `output/mimika-videos/introduction/plantuml-ultimate-introduction.mp4`
- `output/mimika-videos/introduction/captions.srt`
- `output/mimika-videos/validation.json`: media/source checks and verified 192 kbps source MP3.

Course production has expanded to nineteen available lesson rough cuts. See the [course index](../../output/course/index.md), [coverage notes](../../output/course/coverage-notes.md), and [production status](course-production-status.md). Jira live recording awaits a sandbox, and the documented advanced demonstrations and full pacing review remain outstanding.
