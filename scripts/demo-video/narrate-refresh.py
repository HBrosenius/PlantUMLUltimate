"""Generate sentence-timed legacy-demo narration with the supplied MimikaStudio client."""
from pathlib import Path
import hashlib
import json
import math
import re
import subprocess
import sys
import wave

repo = Path(__file__).resolve().parents[2]
root = repo / 'output/demo-refresh'
client = Path('/Users/henbro/Downloads/mimika/mimika_tts.py')
cache = repo / 'output/mimika-videos/speech-cache'
cache.mkdir(parents=True, exist_ok=True)
profile = {
    'provider': 'MimikaStudio', 'engine': 'Kokoro', 'voice': 'bf_emma',
    'bitrateKbps': 192, 'mp3SampleRate': 48000, 'losslessMaster': True,
    'speed': 1.0, 'client': str(client),
    'clientSha256': hashlib.sha256(client.read_bytes()).hexdigest(),
    'host': 'http://127.0.0.1:7693',
}

def run(args, **kwargs):
    result = subprocess.run(args, capture_output=True, **kwargs)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors='replace')[-3000:])
    return result.stdout

for path in sorted((repo / 'docs/demo-refresh').glob('*.json')):
    demo = json.loads(path.read_text())
    if sys.argv[1:] and demo['id'] not in sys.argv[1:]:
        continue
    out = root / demo['id']
    (out / 'timed-audio').mkdir(parents=True, exist_ok=True)
    (out / 'mp3').mkdir(exist_ok=True)
    scenes = []
    for scene in demo['scenes']:
        chunks, units, cursor = [], [], 0
        sentences = re.split(r'(?<=[.!?])\s+', scene['text'])
        for index, text in enumerate(sentences):
            key = hashlib.sha256(json.dumps({'profile': profile, 'text': text}, sort_keys=True).encode()).hexdigest()
            master, mp3 = cache / (key + '.wav'), cache / (key + '.mp3')
            if not master.exists():
                run(['python3', str(client), '-', '--voice', 'bf_emma', '--speed', '1.0',
                     '--format', 'wav', '--bitrate', '192', '--out', str(master)], input=text.encode())
            if not mp3.exists():
                run(['ffmpeg', '-v', 'error', '-y', '-i', str(master), '-ar', '48000',
                     '-c:a', 'libmp3lame', '-b:a', '192k', str(mp3)])
            pcm = run(['ffmpeg', '-v', 'error', '-i', str(master), '-f', 's16le', '-ar', '24000', '-ac', '1', '-'])
            samples = len(pcm) // 2
            units.append({'index': index, 'text': text, 'start': cursor / 24000,
                          'end': (cursor + samples) / 24000, 'mp3': str(mp3)})
            chunks.append(pcm)
            cursor += samples
            if index < len(sentences) - 1:
                chunks.append(b'\0\0' * 2880)
                cursor += 2880
        wav = out / 'timed-audio' / (scene['id'] + '.wav')
        with wave.open(str(wav), 'wb') as stream:
            stream.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
            stream.writeframes(b''.join(chunks))
        run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-ar', '48000',
             '-c:a', 'libmp3lame', '-b:a', '192k', str(out / 'mp3' / (scene['id'] + '.mp3'))])
        scenes.append({**scene, 'sentences': units, 'audioSeconds': cursor / 24000,
                       'duration': math.ceil((cursor / 24000 + 3.5) * 30) / 30})
        print(f"{demo['id']}/{scene['id']}: {cursor / 24000:.1f}s", flush=True)
    (out / 'timed-narration.json').write_text(json.dumps({
        'config': profile, 'leadIn': 0.5, 'lessonId': demo['id'], 'title': demo['title'], 'scenes': scenes,
    }, indent=2) + '\n')
