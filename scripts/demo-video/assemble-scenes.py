"""Encode completed screen takes, then mux measured captions and chapter markers."""
from pathlib import Path
import json,subprocess,time,textwrap,sys,math
root=Path(__file__).resolve().parent
config=json.loads((root/'timed-narration.json').read_text())
recording=root/'recording'; encoded=root/'encoded';encoded.mkdir(exist_ok=True)
watch='--watch' in sys.argv
def run(args):
 p=subprocess.run(args,capture_output=True,text=True)
 if p.returncode:raise RuntimeError(p.stderr[-6000:])
 return p.stdout
def stamp(t,sep=','):
 n=round(t*1000);return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02}{sep}{n%1000:03}'
offset=0;subs=[];vtt=[];chapters=[];metadata=[';FFMETADATA1','title=PlantUML Ultimate — Lesson 02: Visual and source editing']
for scene in config['scenes']:
 take_path=recording/scene['id']/'take.json'
 while not take_path.exists():
  if not watch:raise SystemExit(f'Missing screen take: {scene["id"]}')
  time.sleep(3)
 take=json.loads(take_path.read_text());assert not take['dry']
 duration=round(math.ceil(min(scene['duration'],scene['audioSeconds']+config['leadIn']+3)*30)/30,6)
 frames=sorted(take['frames'],key=lambda f:f['ts'])
 assert frames and abs(frames[0]['ts']-take['start'])<5, 'Screencast clock does not match take clock'
 initial=frames[0]
 for f in frames:
  if f['ts']<=take['start']:initial=f
 events=[{'file':initial['file'],'ts':take['start']}]+[f for f in frames if take['start']<f['ts']<take['start']+duration]
 listing=[]
 for i,f in enumerate(events):
  end=events[i+1]['ts'] if i+1<len(events) else take['start']+duration
  dt=end-f['ts']
  if dt<=0:continue
  listing.append(f"file '{recording/scene['id']/'frames'/f['file']}'\nduration {dt:.6f}")
 listing.append(f"file '{recording/scene['id']/'frames'/events[-1]['file']}'")
 concat=recording/scene['id']/'frames.txt';concat.write_text('\n'.join(listing)+'\n')
 target=encoded/(scene['id']+'.mp4')
 signature={'takeModified':take_path.stat().st_mtime,'duration':duration,'revision':4}
 signature_path=target.with_suffix('.json')
 if not target.exists() or not signature_path.exists() or json.loads(signature_path.read_text())!=signature:
  run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(concat),
   '-i',str(root/'timed-audio'/(scene['id']+'.wav')),'-map','0:v','-map','1:a',
   '-vf',f'scale=1920:1080:flags=lanczos,fps=30,tpad=stop_mode=clone:stop_duration={duration},format=yuv420p',
   '-af','loudnorm=I=-16:TP=-1.5:LRA=11,adelay=500|500,apad',
   '-t',str(duration),'-r','30','-fps_mode','cfr','-c:v','libx264','-preset','fast','-crf','18','-threads','4',
   '-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-movflags','+faststart',str(target)])
  signature_path.write_text(json.dumps(signature))
 print(f'ENCODED {scene["id"]} ({duration:.2f}s)',flush=True)
 for unit in scene['sentences']:
  start=offset+config['leadIn']+unit['start'];end=offset+config['leadIn']+unit['end']
  text=textwrap.fill(unit['text'],width=58,break_long_words=False)
  subs.append(f'{len(subs)+1}\n{stamp(start)} --> {stamp(end)}\n{text}\n')
  vtt.append(f'{stamp(start,".")} --> {stamp(end,".")}\n{text}\n')
 chapters.append({'id':scene['id'],'title':scene['title'],'start':round(offset,6),'end':round(offset+duration,6)})
 title=scene['title'].replace('=','\\=').replace(';','\\;').replace('#','\\#')
 metadata+=['[CHAPTER]','TIMEBASE=1/1000',f'START={round(offset*1000)}',f'END={round((offset+duration)*1000)}',f'title={title}']
 offset+=duration
(root/'lesson-02.srt').write_text('\n'.join(subs));(root/'lesson-02.vtt').write_text('WEBVTT\n\n'+'\n'.join(vtt))
(root/'chapters.ffmeta').write_text('\n'.join(metadata)+'\n')
(root/'chapters.json').write_text(json.dumps(chapters,indent=2))
(root/'chapters.txt').write_text('\n'.join(f'{stamp(c["start"],".")[:8]} {c["title"]}' for c in chapters)+'\n')
(root/'lesson-segments.txt').write_text(''.join(f"file '{encoded/(s['id']+'.mp4')}'\n" for s in config['scenes']))
run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(root/'lesson-segments.txt'),
 '-map','0:v:0','-map','0:a:0','-map_chapters','-1','-map_metadata','-1','-c','copy',str(root/'lesson-av.mkv')])
run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(root/'lesson-av.mkv'),
 '-i',str(root/'lesson-02.srt'),'-f','ffmetadata','-i',str(root/'chapters.ffmeta'),
 '-map','0:v','-map','0:a','-map','1:0','-map_metadata','2','-map_chapters','2','-c','copy','-c:s','mov_text',
 '-metadata:s:s:0','language=eng','-metadata:s:s:0','title=English — sentence-timed',
 '-metadata:s:a:0','language=eng','-movflags','+faststart',str(root/'plantuml-ultimate-lesson-02.mp4')])
(root/'lesson-av.mkv').unlink()
print(f'Completed {offset:.3f}s with {len(subs)} measured sentence captions and {len(chapters)} chapters.',flush=True)
