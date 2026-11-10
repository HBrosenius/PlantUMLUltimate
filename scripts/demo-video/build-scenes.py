from pathlib import Path
import bisect,json,subprocess,sys,math,zipfile
repo=Path(__file__).resolve().parents[2];root=repo/'output/demo-refresh'
ids=sys.argv[1:]
def run(args):
 p=subprocess.run(args,capture_output=True,text=True)
 if p.returncode:raise RuntimeError(p.stderr[-5000:])
 return p.stdout
def probe(p):return json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-show_chapters','-of','json',str(p)]))
for id in ids:
 out=root/id;config=json.loads((out/'timed-narration.json').read_text());maps=[]
 for scene in config['scenes']:
  path=out/'raw'/scene['id'];take=json.loads((path/'take.json').read_text());anchors=[(0.,0.)];actions=take['actions'];duration=scene['duration']
  assert all(0<=a['sentence']<len(scene['sentences']) for a in actions),(id,scene['id'],'action cue outside narration')
  for i,a in enumerate(actions):
   assert a['sentence']<len(scene['sentences']),(id,scene['id'],a['sentence'])
   target=.5+scene['sentences'][a['sentence']]['start'];next_target=.5+scene['sentences'][actions[i+1]['sentence']]['start'] if i+1<len(actions) else duration
   assert next_target>target,(id,scene['id'],'action cues must ascend')
   actual_duration=a['ended']-a['actual'];shown=min(actual_duration,max(.1,next_target-target-.2))
   anchors.extend([(a['actual'],target),(a['ended'],target+shown)])
  raw_end=max(take['end']-take['start'],anchors[-1][0]+.001);anchors.append((raw_end,duration))
  assert all(anchors[i+1][0]>anchors[i][0] and anchors[i+1][1]>=anchors[i][1] for i in range(len(anchors)-1)),(id,scene['id'],anchors)
  def remap(t):
   if t<=0:return 0.
   if t>=raw_end:return duration
   j=min(len(anchors)-2,max(0,bisect.bisect_right([a[0] for a in anchors],t)-1));x0,y0=anchors[j];x1,y1=anchors[j+1];return y0+(y1-y0)*(t-x0)/(x1-x0)
  dest=out/'recording'/scene['id'];dest.mkdir(parents=True,exist_ok=True)
  if not (dest/'frames').exists():(dest/'frames').symlink_to(path/'frames',target_is_directory=True)
  (dest/'take.json').write_text(json.dumps({**take,'start':0.,'end':duration,'duration':duration,'dry':False,'frames':[{'file':f['file'],'ts':remap(f['ts']-take['start'])} for f in take['frames']]},indent=2))
  maps.append({'id':scene['id'],'anchors':anchors,'source':take['source']})
 (out/'retiming.json').write_text(json.dumps(maps,indent=2))
 script=(repo/'scripts/demo-video/assemble-scenes.py').read_text().replace('PlantUML Ultimate — Lesson 02: Visual and source editing',f'PlantUML Ultimate — Lesson {id}: '+config['title']).replace('plantuml-ultimate-lesson-02.mp4',f'lesson-{id}.mp4').replace('lesson-02.srt','captions.srt').replace('lesson-02.vtt','captions.vtt')
 (out/'assemble.py').write_text(script);run(['python3',str(out/'assemble.py')]);video=out/f'lesson-{id}.mp4';info=probe(video)
 expected_chapters=json.loads((out/'chapters.json').read_text())
 assert len(info['chapters'])==len(expected_chapters)
 for expected,actual in zip(expected_chapters,info['chapters']):
  assert actual['tags']['title']==expected['title'],(id,expected,actual)
  assert abs(float(actual['start_time'])-expected['start'])<.003,(id,expected,actual)
  assert abs(float(actual['end_time'])-expected['end'])<.05,(id,expected,actual)
  assert float(actual['end_time'])>float(actual['start_time']),(id,expected,actual)
 v=next(s for s in info['streams'] if s['codec_type']=='video');assert (v['width'],v['height'],v['r_frame_rate'])==(1920,1080,'30/1')
 assert any(s['codec_type']=='subtitle' for s in info['streams'])
 run(['ffmpeg','-hide_banner','-v','error','-i',str(video),'-f','null','-'])
 qa=out/'qa';qa.mkdir(exist_ok=True)
 for i,c in enumerate(info['chapters'],1):run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str((float(c['start_time'])+float(c['end_time']))/2),'-i',str(video),'-frames:v','1','-vf','scale=640:360',str(qa/f'{i:02}.png')])
 columns=3;rows=math.ceil(len(config['scenes'])/columns);run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','1','-i',str(qa/'%02d.png'),'-vf',f'tile={columns}x{rows}','-frames:v','1',str(out/'contact-sheet.png')])
 result={'id':id,'title':config['title'],'durationSeconds':float(info['format']['duration']),'chapters':len(info['chapters']),'captionUnits':sum(len(s['sentences']) for s in config['scenes']),'fullDecode':'passed','voice':'bf_emma','provider':'MimikaStudio','visualReview':'contact sheet ready for inspection'}
 (out/'validation.json').write_text(json.dumps(result,indent=2))
 print('BUILT',id,result['durationSeconds'],'seconds',flush=True)
