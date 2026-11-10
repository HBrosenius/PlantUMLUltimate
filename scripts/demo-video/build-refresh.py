#!/usr/bin/env python3
"""Assemble a refreshed demo with sentence captions and scene chapters."""
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def stamp(seconds, separator=','):
    milliseconds = round(max(0, seconds) * 1000)
    hours, milliseconds = divmod(milliseconds, 3600000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f'{hours:02}:{minutes:02}:{seconds:02}{separator}{milliseconds:03}'


def build(demo):
    root = REPO / 'output/demo-refresh' / demo
    timeline = json.loads((root / 'recording/timeline.json').read_text())
    narration = json.loads((root / 'timed-narration.json').read_text())
    manifest = json.loads((REPO / 'docs/demo-refresh' / f'{demo}.json').read_text())
    spoken = {scene['id']: scene for scene in narration['scenes']}
    # Remove setup time and pace each scene to its measured narration.
    # Preserve every captured frame and its order; time-map scene boundaries.
    raw = timeline
    paced = root / 'paced-recording'
    paced.mkdir(exist_ok=True)
    if not (paced / 'frames').exists():
        (paced / 'frames').symlink_to((root / 'recording/frames').resolve(), target_is_directory=True)
    frames, scenes, offset = [], [], 0.0
    for index, scene in enumerate(raw['scenes']):
        start = scene['start']
        end = raw['scenes'][index + 1]['start'] if index + 1 < len(raw['scenes']) else raw['end']
        duration = spoken[scene['id']]['audioSeconds'] + 1.5
        available = [frame for frame in raw['frames'] if start <= frame['ts'] < end]
        if not available:
            raise ValueError(f"No captured frames for {scene['id']}")
        frames.append({**available[0], 'ts': offset})
        frames.extend({**frame, 'ts': offset + (frame['ts'] - start) / (end - start) * duration} for frame in available[1:])
        scenes.append({**scene, 'start': offset, 'duration': duration})
        offset += duration
    timeline = {'frames': frames, 'scenes': scenes, 'end': offset}
    (paced / 'timeline.json').write_text(json.dumps(timeline, indent=2))
    origin = 0.0
    cues, chapters = [], []
    for index, scene in enumerate(timeline['scenes']):
        offset = scene['start'] - origin + .25
        end = (timeline['scenes'][index + 1]['start'] if index + 1 < len(timeline['scenes']) else timeline['end']) - origin
        title = scene['id'].split('-', 1)[-1].replace('-', ' ').title()
        chapters.append(f'[CHAPTER]\nTIMEBASE=1/1000\nSTART={round(max(0, offset-.25)*1000)}\nEND={round(end*1000)}\ntitle={title}\n')
        for sentence in spoken[scene['id']]['sentences']:
            cues.append((offset + sentence['start'], offset + sentence['end'], sentence['text']))
    (root / 'captions.srt').write_text('\n\n'.join(f'{i}\n{stamp(start)} --> {stamp(end)}\n{text}' for i, (start, end, text) in enumerate(cues, 1)) + '\n')
    (root / 'captions.vtt').write_text('WEBVTT\n\n' + '\n\n'.join(f'{stamp(start,".")} --> {stamp(end,".")}\n{text}' for start, end, text in cues) + '\n')
    (root / 'chapters.ffmeta').write_text(';FFMETADATA1\ntitle=' + manifest['title'] + '\n' + ''.join(chapters))
    subprocess.run(['node', str(REPO / 'scripts/demo-video/build.mjs'), '--recording', str(paced), '--audio', str(root / 'timed-audio'), '--out', str(root / 'assembled.mp4')], check=True)
    subprocess.run(['ffmpeg', '-y', '-i', str(root / 'assembled.mp4'), '-i', str(root / 'captions.srt'), '-i', str(root / 'chapters.ffmeta'), '-map', '0:v', '-map', '0:a', '-map', '1:s', '-map_metadata', '2', '-map_chapters', '2', '-c:v', 'copy', '-c:a', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-movflags', '+faststart', str(root / f'{demo}-refreshed.mp4')], check=True)
    print(f'Built {demo}: {len(cues)} sentence captions, {len(chapters)} chapters', flush=True)


if __name__ == '__main__':
    for demo in sys.argv[1:]:
        build(demo)
