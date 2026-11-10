"""Local ASR comparison of actual scene audio against the intended script."""
from pathlib import Path
import difflib
import json
import re
import time
from faster_whisper import WhisperModel

root = Path(__file__).resolve().parents[2]/'output/demo-refresh'
dest = root/'narration-asr-review'
dest.mkdir(exist_ok=True)
model = WhisperModel('base.en', device='cpu', compute_type='int8', cpu_threads=6,
                     download_root=str(root.parent/'course/narration-asr-review/models'))
def words(text):
    text = text.lower().replace('plantuml', 'plant uml').replace('plant uml', 'plant u m l')
    return re.findall(r"[a-z0-9]+", text)

results = []
for manifest in sorted(root.glob('*/timed-narration.json')):
    lesson = json.loads(manifest.read_text())
    for scene in lesson['scenes']:
        cache = dest/f"{lesson['lessonId']}-{scene['id']}.json"
        audio = manifest.parent/'timed-audio'/f"{scene['id']}.wav"
        if cache.exists() and json.loads(cache.read_text()).get('audioModified') == audio.stat().st_mtime:
            result = json.loads(cache.read_text())
        else:
            started = time.monotonic()
            segments, info = model.transcribe(str(audio), language='en', beam_size=3,
                                              condition_on_previous_text=False, vad_filter=False)
            transcript = ' '.join(s.text.strip() for s in segments)
            expected, actual = words(scene['text']), words(transcript)
            matcher = difflib.SequenceMatcher(None, expected, actual, autojunk=False)
            changes = [{'operation':tag,'expected':' '.join(expected[a:b]),'recognized':' '.join(actual[c:d])}
                       for tag,a,b,c,d in matcher.get_opcodes() if tag != 'equal']
            errors = sum(max(b-a,d-c) for tag,a,b,c,d in matcher.get_opcodes() if tag != 'equal')
            result = {'lesson':lesson['lessonId'],'scene':scene['id'],'expected':scene['text'],
                      'recognized':transcript,'wordDifferenceRatio':round(errors/max(1,len(expected)),4),
                      'differences':changes,'audioModified':audio.stat().st_mtime,
                      'processingSeconds':round(time.monotonic()-started,2)}
            cache.write_text(json.dumps(result,indent=2)+'\n')
        results.append(result)
        print(f"{result['lesson']}/{result['scene']}: {result['wordDifferenceRatio']:.1%}",flush=True)
report = {'method':'Local faster-whisper base.en, CPU int8; comparison against complete scene scripts',
          'limitations':'Recognition differences are leads for review, not proof of mispronunciation. This is not a human listen-through.',
          'scenesReviewed':len(results),'flagThreshold':.15,
          'flagged':[r for r in results if r['wordDifferenceRatio']>.15], 'scenes':results}
(root/'narration-asr-review.json').write_text(json.dumps(report,indent=2)+'\n')
print('COMPLETE',len(results),'scenes;',len(report['flagged']),'flagged',flush=True)
