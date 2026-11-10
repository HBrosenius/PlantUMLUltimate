"""Check exported demo media and create chapter contact sheets."""
import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'output/demo-refresh'


def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-2000:])
    return result.stdout


for demo in sys.argv[1:]:
    root = ROOT / demo
    video = root / (f'lesson-{demo}.mp4' if (root / f'lesson-{demo}.mp4').exists() else f'{demo}-refreshed.mp4')
    info = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-show_chapters', '-of', 'json', str(video)]))
    visual = next(s for s in info['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in info['streams'] if s['codec_type'] == 'audio')
    assert (visual['width'], visual['height'], visual['r_frame_rate']) == (1920, 1080, '30/1')
    assert audio['sample_rate'] == '48000' and audio['channels'] == 2
    assert any(s['codec_type'] == 'subtitle' for s in info['streams'])
    narration = json.loads((root / 'timed-narration.json').read_text())
    assert len(info['chapters']) == len(narration['scenes'])
    run(['ffmpeg', '-v', 'error', '-i', str(video), '-f', 'null', '-'])
    qa = root / 'qa'
    qa.mkdir(exist_ok=True)
    for index, chapter in enumerate(info['chapters'], 1):
        at = (float(chapter['start_time']) + float(chapter['end_time'])) / 2
        run(['ffmpeg', '-v', 'error', '-y', '-ss', str(at), '-i', str(video), '-frames:v', '1', '-vf', 'scale=640:360', str(qa / f'{index:02}.png')])
    run(['ffmpeg', '-v', 'error', '-y', '-framerate', '1', '-i', str(qa / '%02d.png'), '-vf', f'tile=3x{math.ceil(len(info["chapters"])/3)}', '-frames:v', '1', str(root / 'contact-sheet.png')])
    result = {'demo': demo, 'video': str(video), 'durationSeconds': float(info['format']['duration']), 'chapters': len(info['chapters']), 'captionUnits': sum(len(s['sentences']) for s in narration['scenes']), 'fullDecode': 'passed', 'format': '1080p30, stereo 48kHz, embedded English captions', 'visualReview': 'contact sheet prepared', 'humanListenThrough': 'pending'}
    (root / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result), flush=True)
