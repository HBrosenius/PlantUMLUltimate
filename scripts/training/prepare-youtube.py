"""Prepare review upload metadata and the static index; never uploads or publishes."""
from pathlib import Path
import html
import json
import re
import zipfile

REPO = Path(__file__).resolve().parents[2]
COURSE = REPO / 'output/course'
TARGET = REPO / 'apps/web/public/training'
UPLOAD = REPO / 'output/youtube-upload'
TARGET.mkdir(parents=True, exist_ok=True)
UPLOAD.mkdir(parents=True, exist_ok=True)
manifest_path = TARGET / 'videos.json'
old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'lessons': []}
ids = {row['id']: row.get('youtubeId') for row in old['lessons']}
rows = []

def stamp(seconds):
    seconds = int(seconds)
    hours, rem = divmod(seconds, 3600)
    minutes, seconds = divmod(rem, 60)
    return f'{hours}:{minutes:02}:{seconds:02}' if hours else f'{minutes}:{seconds:02}'

for lesson in json.loads((COURSE / 'course-progress.json').read_text())['lessons']:
    if not lesson.get('video'):
        continue
    lid = lesson['id']
    assert re.fullmatch(r'\d{2}', lid)
    video_id = ids.get(lid)
    assert video_id is None or re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id)
    chapters = json.loads((COURSE / lid / 'chapters.json').read_text())
    title = f"PlantUML Ultimate | {lid}. {lesson['title']}"
    description = '\n'.join([
        f"Lesson {lid}: {lesson['title']}", '', lesson['successCheck'], '',
        'Try the app: https://plantuml.brosenius.se/', '',
        'Training review edition. Narration: MimikaStudio / Kokoro / Emma.',
        'Jira is excluded. Physical-device validation and full human listening review remain outstanding.',
        '', 'Chapters:', *[f"{stamp(c['start'])} {c['title']}" for c in chapters],
    ])
    (UPLOAD / f'{lid}-title.txt').write_text(title + '\n')
    (UPLOAD / f'{lid}-description.txt').write_text(description + '\n')
    rows.append({'id': lid, 'title': lesson['title'], 'youtubeId': video_id,
                 'durationSeconds': lesson['durationSeconds'], 'objective': lesson['successCheck'],
                 'chapters': [{'title': c['title'], 'start': int(c['start'])} for c in chapters]})
    (TARGET / 'captions').mkdir(exist_ok=True)
    (TARGET / 'captions' / f'lesson-{lid}.vtt').write_bytes((COURSE / lid / 'captions.vtt').read_bytes())
demos = json.loads((REPO / 'docs/training/demo-videos.json').read_text())
for demo in demos:
    assert re.fullmatch(r'demo-[a-z-]+', demo['id'])
    assert re.fullmatch(r'[A-Za-z0-9_-]{11}', demo['youtubeId'])
    (TARGET / 'captions' / f"{demo['id']}.vtt").write_bytes((REPO / 'output/demo-refresh' / demo['id'].removeprefix('demo-') / 'captions.vtt').read_bytes())
manifest = {'visibility': 'unlisted', 'edition': 'review', 'demos': demos, 'lessons': rows}
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
(UPLOAD / 'upload-manifest.json').write_text(json.dumps([
    {'id': r['id'], 'title': (UPLOAD / f"{r['id']}-title.txt").read_text().strip(),
     'video': str(COURSE / r['id'] / f"lesson-{r['id']}.mp4"),
     'captions': str(COURSE / r['id'] / 'captions.srt'),
     'description': str(UPLOAD / f"{r['id']}-description.txt"),
     'visibility': 'unlisted', 'youtubeId': r['youtubeId']} for r in rows], indent=2) + '\n')
with zipfile.ZipFile(TARGET / 'practice.zip', 'w', compression=zipfile.ZIP_DEFLATED) as z:
    for p in sorted((COURSE / 'learner-pack').rglob('*')):
        if p.is_file() and p.suffix in {'.puml', '.pumlu', '.md', '.html'}:
            z.write(p, p.relative_to(COURSE / 'learner-pack'))
cards = []
for row in rows:
    esc = html.escape
    url = f"https://www.youtube.com/watch?v={row['youtubeId']}" if row['youtubeId'] else None
    heading = f'<a href="{url}">{esc(row["title"])}</a>' if url else esc(row['title'])
    chapters = ''.join('<li>' + (f'<a href="{url}&amp;t={c["start"]}">{stamp(c["start"])} · {esc(c["title"])}</a>' if url else f'{stamp(c["start"])} · {esc(c["title"])}') + '</li>' for c in row['chapters'])
    cards.append(f'''<article><span class="number">{row['id']}</span><div><h2>{heading}</h2>
<p>{esc(row['objective'])}</p><p class="meta">{stamp(row['durationSeconds'])} · {'Unlisted review video' if url else 'YouTube upload pending'}</p>
<details><summary>Chapters and captions</summary><ol>{chapters}</ol><a href="captions/lesson-{row['id']}.vtt" download>Download English captions</a></details></div></article>''')
demo_cards = []
for row in demos:
    url = f"https://www.youtube.com/watch?v={row['youtubeId']}"
    demo_cards.append(f'''<article><span class="number">Demo</span><div><h2><a href="{url}">{html.escape(row['title'])}</a></h2>
<p>{html.escape(row['objective'])}</p><p class="meta">{stamp(row['durationSeconds'])} · Unlisted review video</p>
<a href="captions/{row['id']}.vtt" download>Download English captions</a></div></article>''')
uploaded = sum(bool(r['youtubeId']) for r in rows)
review_note = ('These videos are unlisted on YouTube. Anyone with a video link can watch.' if uploaded == len(rows) else f'{uploaded} of {len(rows)} videos are saved as unlisted YouTube uploads; remaining uploads are pending.')
(TARGET / 'index.html').write_text('''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Training · PlantUML Ultimate</title>
<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="training.css"></head>
<body><header><a href="/">PlantUML Ultimate</a><a href="/">Open editor ↗</a></header><main>
<p class="eyebrow">LEARN AT YOUR OWN PACE</p><h1>From your first diagram<br>to a working project.</h1>
<p class="lead">Nineteen guided lessons cover planning, modeling and the everyday workflow. Pause, practice and return to any chapter.</p>
<aside><strong>Review edition</strong><p>''' + review_note + ''' Human listening review remains outstanding. Jira is excluded; physical-device testing is unavailable.</p></aside>
<p><a href="https://www.youtube.com/watch?v=f-0B0l88-K4">Watch the introduction on YouTube ↗</a></p>
<p><a class="button" href="practice.zip" download>Download practice sources and transcripts</a></p>
<p class="meta">Source snapshots are plain PlantUML. Follow the videos for connected documents and browser-local workflows. Exercise time is separate from video runtime.</p>
<h2>Short feature demos</h2><p>Quick walkthroughs recorded with the current menus.</p>''' + ''.join(demo_cards) + '''<h2>Full training course</h2><section aria-label="Course lessons">''' + ''.join(cards) + '''</section><footer>Lesson 18 (Jira) is excluded from this edition. Narrated with MimikaStudio / Kokoro / Emma.</footer></main></body></html>''')
print(f'Prepared {len(rows)} lessons; {sum(bool(r["youtubeId"]) for r in rows)} YouTube IDs recorded. Nothing uploaded or published.')
