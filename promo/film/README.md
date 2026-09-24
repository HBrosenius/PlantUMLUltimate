# PlantUML Ultimate film

A 59-second, 16:9, hand-drawn collage film made entirely with JavaScript Canvas and Web Audio. Double-click `index.html` to play it directly in Chrome, with no server needed. The edited ElevenLabs audio is embedded in `voice-data.js` for direct-file playback.

For a local development server, run:

```sh
python3 promo/film/server.py
```

Then visit `http://127.0.0.1:8765`. Press **Play film** to hear the ElevenLabs narration, original procedural music, and sound effects. Press **Export video** to record a 1600×900 video with audio in real time; Chrome or Edge exports WebM (or MP4 where supported). Add `?save` to the URL to save the recording into this folder through the local preview server instead of downloading it.

- `film.js`: all illustration, animation, music, sound effects, and recording code.
- `voice-data.js`: generated, embedded ElevenLabs voice for `file://` playback. Regenerate it with `node promo/film/build-voice-data.mjs` after changing the edited WAV.
- `narration.txt`: final voiceover script, under 5,000 characters.
- `narration-elevenlabs.mp3`: the updated Rachel voice supplied by the user.
- `narration-edited.wav`: the same recording at its original speech speed and pitch, with 22 quiet gaps shortened. The edit runs 58.24 seconds and fits the 59-second film. `edit-voice.py` creates it from a decoded WAV of the original MP3.
- `film-audio.wav`: the natural-speed narration mixed with the procedural score and sound cues. `render-audio.py` creates it; `mux-film.swift` replaces the audio track of the exported MP4.

The film uses no third-party graphics, music, JavaScript packages, or remote services at playback. The optional live collaboration beat refers to the app's link-based collaboration feature; local rendering is depicted separately.
