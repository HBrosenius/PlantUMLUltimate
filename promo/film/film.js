// A deterministic, dependency-free Canvas 2D film. All illustrations and music
// are drawn/synthesized in JavaScript. The narration file can be replaced.
const canvas = document.querySelector("#film");
const ctx = canvas.getContext("2d", { alpha: false });
const playButton = document.querySelector("#play");
const exportButton = document.querySelector("#export");
const scrub = document.querySelector("#scrub");
const timeLabel = document.querySelector("#time");
const status = document.querySelector("#status");
const W = 1600, H = 900, DURATION = 59;
const C = {
  paper: "#f7edda", ink: "#263b48", muted: "#67716d", coral: "#e87561",
  orange: "#efa75d", yellow: "#f2cf77", teal: "#62bdb7", navy: "#213f53",
  blue: "#7daac5", lavender: "#b9afd0", white: "#fffaf0", shadow: "#cbbfa8",
};
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const lerp = (a, b, x) => a + (b - a) * x;
const hash = (n) => { const x = Math.sin(n * 127.1 + 78.233) * 43758.5453; return x - Math.floor(x); };
let now = 0, running = false, startedAt = 0, raf = 0, audioContext, master, capture, voiceBuffer;
let activeNodes = [], recorder;

function line(x1, y1, x2, y2, color = C.ink, width = 4, rough = 0) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(x1, y1);
  if (rough) ctx.quadraticCurveTo((x1+x2)/2 + rough, (y1+y2)/2 - rough, x2, y2);
  else ctx.lineTo(x2,y2);
  ctx.stroke();
}
function path(points, color = C.ink, width = 4, close = false) {
  ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x,y]) => ctx.lineTo(x,y));
  if (close) ctx.closePath();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
}
function blob(x, y, rx, ry, color, seed = 0, rotation = 0) {
  ctx.save(); ctx.translate(x,y); ctx.rotate(rotation);
  ctx.beginPath();
  for (let i=0;i<11;i++) {
    const a = i * Math.PI*2/11, w = .94 + hash(seed+i)*.12;
    const px = Math.cos(a)*rx*w, py = Math.sin(a)*ry*w;
    if (!i) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.closePath(); ctx.fillStyle=color; ctx.fill();
  ctx.strokeStyle=C.ink; ctx.lineWidth=3; ctx.stroke(); ctx.restore();
}
function paper(x,y,w,h,color=C.white,rot=0,shadow=true,seed=0) {
  ctx.save(); ctx.translate(x+w/2,y+h/2); ctx.rotate(rot);
  if (shadow) { ctx.shadowColor="#283a4350"; ctx.shadowBlur=25; ctx.shadowOffsetX=8; ctx.shadowOffsetY=12; }
  ctx.beginPath(); ctx.moveTo(-w/2+9,-h/2+3);
  for (let i=1;i<=8;i++) ctx.lineTo(-w/2+w*i/8,-h/2+(hash(seed+i)-.5)*11);
  ctx.lineTo(w/2-2,h/2-5);
  for (let i=7;i>=0;i--) ctx.lineTo(-w/2+w*i/8,h/2+(hash(seed+17+i)-.5)*11);
  ctx.closePath(); ctx.fillStyle=color; ctx.fill();
  ctx.shadowColor="transparent"; ctx.strokeStyle="#705f5144"; ctx.lineWidth=2; ctx.stroke();
  ctx.restore();
}
function text(str,x,y,size=35,color=C.ink,align="left",style="bold",font="Avenir Next, Avenir, sans-serif") {
  ctx.fillStyle=color; ctx.textAlign=align; ctx.textBaseline="middle";
  ctx.font=`${style} ${size}px ${font}`; ctx.fillText(str,x,y);
}
function hand(str,x,y,size=48,color=C.ink,align="left") {
  text(str,x,y,size,color,align,"bold","Marker Felt, Chalkboard SE, cursive");
}
function caps(str,x,y,size=22,color=C.ink,align="left") {
  ctx.save(); ctx.letterSpacing="3px"; text(str.toUpperCase(),x,y,size,color,align,"800"); ctx.restore();
}
function rounded(x,y,w,h,r,color,stroke=C.ink,lw=3) {
  ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fillStyle=color; ctx.fill();
  if (stroke) {ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}
}
function arrow(x1,y1,x2,y2,color=C.ink,width=5) {
  line(x1,y1,x2,y2,color,width,8);
  const a=Math.atan2(y2-y1,x2-x1);
  line(x2,y2,x2-Math.cos(a-.6)*16,y2-Math.sin(a-.6)*16,color,width);
  line(x2,y2,x2-Math.cos(a+.6)*16,y2-Math.sin(a+.6)*16,color,width);
}
function star(x,y,r,color=C.orange,spin=0) {
  ctx.save();ctx.translate(x,y);ctx.rotate(spin);ctx.fillStyle=color;ctx.strokeStyle=C.ink;ctx.lineWidth=2;
  ctx.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,rr=i%2?r*.43:r;const px=Math.cos(a)*rr,py=Math.sin(a)*rr;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
}
function tape(x,y,w=80,rot=0) {
  ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.fillStyle="#ead394bd";ctx.fillRect(-w/2,-14,w,28);
  ctx.strokeStyle="#bfaa7077";ctx.lineWidth=1;ctx.strokeRect(-w/2,-14,w,28);ctx.restore();
}
function dust(t) {
  ctx.fillStyle="#6b60471b";
  for(let i=0;i<520;i++){const x=hash(i+8)*W,y=hash(i+899)*H,r=hash(i+334)*1.5+.3;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();}
  for(let i=0;i<25;i++){const x=hash(i+72)*W,y=hash(i+401)*H;ctx.strokeStyle="#967f6150";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+hash(i+541)*12,y+hash(i+65)*5);ctx.stroke();}
  const drift=Math.sin(t*.4)*4;ctx.fillStyle="#e5c8a433";ctx.fillRect(0,0,12+drift,H);
}
function backdrop(t) {
  ctx.fillStyle=C.paper;ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#e8d6b6";ctx.fillRect(0,0,W,17);ctx.fillRect(0,H-16,W,16);
  dust(t);
}
function heading(kicker,title,subtitle) {
  caps(kicker,80,64,21,C.coral);
  hand(title,80,128,64);
  if(subtitle) text(subtitle,84,186,25,C.muted);
  line(82,164,Math.min(840,86+title.length*34),164,C.coral,5,5);
}
function footer(n,title) {
  caps("PLANTUML ULTIMATE",79,854,15,C.muted);
  caps(`${String(n).padStart(2,"0")} / ${title}`,1520,854,14,C.muted,"right");
}
function vignette() {
  const g=ctx.createRadialGradient(W/2,H/2,350,W/2,H/2,1000);
  g.addColorStop(0,"#0000");g.addColorStop(1,"#492a1d24");
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
}
function cursor(x,y,scale=1) {
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  ctx.fillStyle=C.white;ctx.strokeStyle=C.ink;ctx.lineWidth=4;
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(2,43);ctx.lineTo(13,31);ctx.lineTo(24,51);ctx.lineTo(34,46);ctx.lineTo(23,27);ctx.lineTo(40,24);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
}
function cardLabel(title,x,y,w,color=C.yellow) {
  rounded(x,y,w,48,9,color,C.ink,2);caps(title,x+w/2,y+25,19,C.ink,"center");
}
function fade(phase,begin,end,blend=1) {return Math.min(smooth((phase-begin)/blend),smooth((end-phase)/blend));}

function sceneIntro(t) {
  heading("A little chaos, a lot of possibility","Every idea starts somewhere","");
  const p=smooth((t-.4)/2.8);
  ctx.save();ctx.translate(0,Math.sin(t*1.8)*5);
  paper(285,255,1000,455,C.white,-.025,true,4);
  tape(366,262,94,-.14);tape(1211,682,94,.11);
  ctx.save();ctx.beginPath();ctx.rect(295,267,980,430);ctx.clip();
  // Scribbles visibly resolve into a real diagram.
  ctx.globalAlpha=1-p;
  for(let i=0;i<14;i++){
    const x=450+i*44,y=425+Math.sin(i*1.4)*105;
    line(x,y,x+140*Math.sin(i*3),y+110*Math.cos(i*2.3),i%3?C.ink:C.coral,3,20);
  }
  hand("what if...?",750,580,70,C.coral,"center");
  ctx.globalAlpha=p;
  const nodes=[[470,428,"idea",C.yellow],[810,360,"shape",C.teal],[1080,500,"share",C.lavender]];
  arrow(570,425,740,372,C.ink,5);arrow(890,405,1000,480,C.ink,5);
  nodes.forEach(([x,y,label,color],i)=>{blob(x,y,105,57,color,i+5,Math.sin(t+i)*.02);hand(label,x,y,35,C.ink,"center");});
  ctx.restore();
  star(322,643,32,C.orange,t*.4);star(1305,255,26,C.yellow,-t*.5);
  ctx.restore();footer(1,"THE IDEA");
}
function sceneStudio(t) {
  heading("The workspace","Code meets canvas","One source of truth. Two natural ways to work.");
  const open=easeOut((t-7.8)/1.4), shift=(1-open)*760;
  paper(82-shift,235,685,525,C.navy,-.012,true,14);
  paper(823+shift,235,690,525,C.white,.013,true,22);
  cardLabel("THE SOURCE",110-shift,220,220,C.yellow);
  cardLabel("THE DIAGRAM",1220+shift,220,260,C.teal);
  ctx.save();ctx.beginPath();ctx.rect(107-shift,280,630,440);ctx.clip();
  const code=[
    ["@startuml",C.yellow],["actor User",C.teal],["participant App",C.orange],
    ["User -> App: make sense",C.white],["App --> User: clarity!",C.white],["@enduml",C.yellow],
  ];
  code.forEach(([s,c],i)=>text(s,145-shift,342+i*54,28,c,"left","500","Menlo, monospace"));
  rounded(127-shift,457,580,46,5,"#8bc6b250",null);
  ctx.restore();
  const dx=shift;
  blob(1045+dx,410,100,52,C.yellow,3);blob(1320+dx,410,105,52,C.teal,5);
  hand("User",1045+dx,410,33,C.ink,"center");hand("App",1320+dx,410,33,C.ink,"center");
  line(1045+dx,467,1045+dx,667,C.ink,3);line(1320+dx,467,1320+dx,667,C.ink,3);
  const move=70*smooth((t-11.3)/2.2);
  arrow(1088+dx,531+move,1250+dx,531+move,C.coral,5);
  text("make sense",1170+dx,500+move,24,C.ink,"center");
  arrow(1273+dx,629,1110+dx,629,C.teal,5);
  text("clarity!",1184+dx,599,24,C.ink,"center");
  cursor(1235+dx,515+move,1.2);
  // Synchronization thread.
  ctx.setLineDash([12,12]);line(761,514,823,514,C.coral,5);ctx.setLineDash([]);
  star(791,513,22,C.yellow,t*1.2);
  footer(2,"SOURCE + CANVAS");
}
function sceneWbs(t) {
  heading("Plan it. Then schedule it.","A living connection","WBS structure on the left. Gantt timing on the right.");
  const a=easeOut((t-18.5)/1.4);
  paper(70,225,600,540,C.white,-.014,true,7);
  paper(913,225,615,540,C.white,.012,true,17);
  cardLabel("WORK BREAKDOWN",105,211,288,C.yellow);
  cardLabel("GANTT SCHEDULE",1165,211,298,C.teal);
  const ys=[335,450,565,680];
  const items=[["Launch",C.coral,0],["Design",C.yellow,1],["Build",C.teal,1],["Review",C.lavender,1]];
  items.forEach(([s,c,d],i)=>{
    const x=164+d*82,y=ys[i],off=(1-a)*(i%2?-500:500);
    rounded(x+off,y-29,315,58,18,c,C.ink,3);hand(s,x+off+157,y+1,29,C.ink,"center");
    if(i) {line(185,ys[0]+31,185,ys[i]-30,C.ink,3);arrow(185,ys[i],x-5,ys[i],C.ink,3);}
  });
  const gx=981, gy=329;
  for(let i=0;i<8;i++){line(gx+i*69,gy-46,gx+i*69,gy+388,"#68797044",2);if(i<7)caps(["MON","TUE","WED","THU","FRI","MON","TUE"][i],gx+i*69+35,gy-74,14,C.muted,"center");}
  const bars=[[0,0,3,C.coral],[1,1,2,C.yellow],[2,2,4,C.teal],[3,5,2,C.lavender]];
  bars.forEach(([row,start,len,color])=>{const grow=smooth((t-20.4-row*.22)/.9);rounded(gx+start*69,gy+row*105,Math.max(5,len*69*grow),51,12,color,C.ink,2);});
  ctx.save();ctx.setLineDash([14,10]);line(674,488,901,488,C.coral,5,16);ctx.restore();
  star(782,487,35,C.yellow,t);
  caps("NAMES + STRUCTURE STAY CONNECTED",800,787,22,C.ink,"center");
  footer(3,"WBS ↔ GANTT");
}
function sceneOutline(t) {
  heading("Find your way","Outline sees the whole picture","Search, filter, and jump to a diagram element.");
  paper(135,214,655,560,C.white,-.018,true,2);paper(886,265,560,430,C.white,.019,true,12);
  cardLabel("OUTLINE",165,204,190,C.orange);
  rounded(191,293,533,66,10,C.white,"#9a9c9199",2);
  text("⌕",217,325,40,C.coral);text("Review",273,327,29,C.ink,"left","500");
  const entries=[["Launch","WBS node",410],["Design","WBS node",495],["Build","WBS node",580],["Review","WBS node",665]];
  const search=smooth((t-31.1)/1.2);
  ctx.save();
  const baseAlpha=ctx.globalAlpha;
  entries.forEach(([name,kind,y],i)=>{
    ctx.globalAlpha=baseAlpha*(search&&i!==3?lerp(1,.22,search):1);
    if(i===3)rounded(185,y-34,545,71,13,C.yellow,null);
    blob(226,y,12,12,[C.coral,C.yellow,C.teal,C.lavender][i],i);
    hand(name,260,y,31);text(kind,692,y,19,C.muted,"right");
  });ctx.restore();
  blob(1147,410,135,72,C.lavender,3);hand("Review",1147,410,36,C.ink,"center");
  arrow(788,665,1006,455,C.coral,6);
  cursor(1260,470,1.35);star(1338,340,24,C.yellow,t);
  caps("ONE CLICK → SOURCE + DIAGRAM",800,782,23,C.ink,"center");
  footer(4,"OUTLINE");
}
function sceneHistory(t) {
  heading("Keep the good ideas","History with a way back","Compare checkpoints. See the change. Restore with confidence.");
  const slide=smooth((t-39.1)/1.3);
  paper(230,304,950,370,C.lavender,-.055,true,2);
  paper(265,281,950,370,C.yellow,-.026,true,3);
  paper(310,254,950,370,C.white,.015,true,4);
  cardLabel("VERSION HISTORY",330,240,295,C.orange);
  const x=380,y=358;
  hand("Today",x,y,38);caps("CURRENT",1128,y,18,C.teal,"right");
  rounded(x,y+76,322,84,14,C.teal,C.ink,3);
  hand("Plan → Build",x+160,y+119,29,C.ink,"center");
  rounded(x+420,y+76,348,84,14,C.yellow,C.ink,3);
  hand("Plan → Review",x+594,y+119,29,C.ink,"center");
  line(x+330,y+118,x+405,y+118,C.coral,4);text("→",x+370,y+119,31,C.coral,"center");
  for(let i=0;i<5;i++){const px=390+i*176;line(px,700,px,726,C.ink,4);blob(px,702,i===3?19:11,i===3?19:11,i===3?C.coral:C.white,i);}
  line(388,704,1097,704,C.ink,3);
  const marker=slide?918:565;
  hand(slide?"Restore":"Compare",marker,771,30,C.coral,"center");
  arrow(marker,751,marker,721,C.coral,3);
  star(1230,305,34,C.yellow,t*.5);
  footer(5,"VERSION HISTORY");
}
function sceneGallery(t) {
  heading("Tools for every shape of thought","One creative studio","Seven diagram families, rendered in your browser.");
  const labels=["Sequence","Activity","Class","Component","Use case","Gantt","WBS"];
  const colors=[C.yellow,C.coral,C.teal,C.lavender,C.blue,C.orange,C.yellow];
  labels.forEach((s,i)=>{
    const col=i%4,row=Math.floor(i/4),x=84+col*374+(row?175:0),y=260+row*238;
    const a=easeOut((t-47-i*.25)/.8),off=(1-a)*270;
    paper(x,y+off,328,195,C.white,(i%2?1:-1)*.016,true,i+30);
    tape(x+271,y+off+2,68,(i%2?1:-1)*.15);
    blob(x+61,y+off+68,34,29,colors[i],i+2);
    hand(s,x+100,y+off+75,31);
    // Tiny, distinct hand-drawn diagram marks.
    if(i===0){line(x+75,y+off+131,x+260,y+off+131);arrow(x+140,y+off+153,x+230,y+off+153,C.coral,3);}
    else if(i===5){for(let j=0;j<3;j++)rounded(x+74+j*58,y+off+126,45,23,4,colors[j],C.ink,2);}
    else if(i===6){line(x+166,y+off+125,x+166,y+off+152);line(x+105,y+off+151,x+224,y+off+151);}
    else {blob(x+110,y+off+140,25,16,colors[i],i);arrow(x+139,y+off+140,x+215,y+off+140,C.ink,3);}
  });
  const a=smooth((t-50.2)/1.5);
  ctx.save();ctx.globalAlpha*=a;
  rounded(307,751,278,62,12,C.navy,null);caps("LOCAL RENDERING",446,783,17,C.white,"center");
  rounded(660,751,278,62,12,C.navy,null);caps("SVG + PNG EXPORT",799,783,17,C.white,"center");
  rounded(1013,751,278,62,12,C.navy,null);caps("LIVE COLLABORATION",1152,783,17,C.white,"center");
  ctx.restore();
  footer(6,"THE TOOLKIT");
}
function sceneFinal(t) {
  const k=smooth((t-54)/1.6);
  ctx.save();ctx.translate(800,447);ctx.scale(lerp(.87,1,k),lerp(.87,1,k));ctx.translate(-800,-447);
  paper(175,177,1250,555,C.white,-.012,true,14);
  tape(268,179,104,-.12);tape(1337,730,104,.14);
  blob(800,319,86,72,C.yellow,10,Math.sin(t*.6)*.04);
  // Friendly diagram mark: branching nodes, penned twice for an organic edge.
  line(800,283,800,349,C.ink,8);line(800,348,744,385,C.ink,8);line(800,348,856,385,C.ink,8);
  blob(799,275,22,22,C.coral,1);blob(736,392,22,22,C.teal,2);blob(864,392,22,22,C.lavender,3);
  hand("PlantUML",800,476,105,C.ink,"center");
  caps("ULTIMATE",800,565,57,C.coral,"center");
  line(549,613,1050,613,C.teal,6,8);
  text("Diagram with your hands. Keep the power of code.",800,673,28,C.muted,"center","600");
  ctx.restore();
  for(let i=0;i<8;i++){const x=210+i*170,y=160+(i%2)*580;star(x,y,12+(i%3)*5,[C.coral,C.yellow,C.teal][i%3],t*(i%2?-.4:.5));}
  footer(7,"MAKE IT CLEAR");
}

const scenes=[
  [0,7.8,sceneIntro],[7,19.5,sceneStudio],[18.5,31.5,sceneWbs],
  [30.5,39.5,sceneOutline],[38.5,47.5,sceneHistory],[46.5,54.5,sceneGallery],[53.5,59,sceneFinal],
];
function render(t) {
  t=clamp(t,0,DURATION);
  backdrop(t);
  scenes.forEach(([start,end,fn],i)=>{
    const opacity=i===0?smooth((end-t)/1.1):i===scenes.length-1?smooth((t-start)/1.1):fade(t,start,end,1.1);
    if(opacity<=0)return;
    ctx.save();ctx.globalAlpha=opacity;fn(t);ctx.restore();
  });
  vignette();
  // A fine painted progress line, unobtrusive in the exported film.
  ctx.fillStyle=C.coral;ctx.fillRect(0,H-8,W*t/DURATION,8);
}

async function initAudio() {
  if(audioContext)return;
  audioContext=new AudioContext({sampleRate:48000});
  master=audioContext.createGain();master.gain.value=.88;
  capture=audioContext.createMediaStreamDestination();
  master.connect(audioContext.destination);master.connect(capture);
  if(!window.FILM_VOICE_BASE64)throw new Error("Embedded narration unavailable");
  const binary=atob(window.FILM_VOICE_BASE64);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  voiceBuffer=await audioContext.decodeAudioData(bytes.buffer.slice(0));
}
function tone(freq,at,len,gain=.05,type="sine",to=master) {
  const osc=audioContext.createOscillator(),env=audioContext.createGain();
  osc.type=type;osc.frequency.setValueAtTime(freq,at);
  env.gain.setValueAtTime(.0001,at);env.gain.exponentialRampToValueAtTime(gain,at+.02);
  env.gain.exponentialRampToValueAtTime(.0001,at+len);
  osc.connect(env).connect(to);osc.start(at);osc.stop(at+len+.02);
  activeNodes.push(osc);
}
function pluck(freq,at,gain=.055) {
  tone(freq,at,.65,gain,"triangle");
  tone(freq*2,at,.23,gain*.19,"sine");
}
function noise(at,len,gain=.009) {
  const buffer=audioContext.createBuffer(1,Math.round(audioContext.sampleRate*len),audioContext.sampleRate);
  const data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=(hash(i*5+Math.floor(at*10000))-.5)*2;
  const src=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),env=audioContext.createGain();
  src.buffer=buffer;filter.type="highpass";filter.frequency.value=3600;
  env.gain.setValueAtTime(gain,at);env.gain.exponentialRampToValueAtTime(.0001,at+len);
  src.connect(filter).connect(env).connect(master);src.start(at);src.stop(at+len);
  activeNodes.push(src);
}
function soundtrack(start,offset=0) {
  const bpm=112,beat=60/bpm;
  const notes=[261.63,329.63,392,523.25,587.33,659.25,783.99];
  const score=[0,2,4,3,1,2,5,4,0,3,5,4,2,1,4,3];
  for(let i=0;i<Math.ceil(DURATION/beat);i++){
    const filmTime=i*beat;if(filmTime<offset-.001)continue;
    const at=start+(filmTime-offset);
    if(i%2===0)pluck(notes[score[Math.floor(i/2)%score.length]],at,.045);
    if(i%8===0)tone(130.81,at,2.1,.024,"sine");
    if(i%4===2)tone(196,at,.35,.017,"triangle");
    noise(at,.07,i%2?.004:.008);
  }
  // The cue points are paper swishes and little sparkles.
  [7.5,19,31,39,47,54].filter(x=>x>=offset).forEach(x=>{
    const at=start+x-offset;
    noise(at,.22,.019);
    pluck(783.99,at+.11,.048);pluck(1046.5,at+.24,.028);
  });
  const voiceOffset=offset;
  if(voiceOffset<voiceBuffer.duration){
    const source=audioContext.createBufferSource(),gain=audioContext.createGain();
    source.buffer=voiceBuffer;
    gain.gain.value=1.05;source.connect(gain).connect(master);
    source.start(start,voiceOffset);activeNodes.push(source);
  }
}
function stopAudio() {
  activeNodes.forEach(node=>{try{node.stop()}catch{}});
  activeNodes=[];
}
function tick() {
  if(!running)return;
  now=clamp((performance.now()-startedAt)/1000,0,DURATION);
  render(now);scrub.value=now;timeLabel.value=`0:${String(Math.floor(now)).padStart(2,"0")} / 0:59`;
  if(now>=DURATION){pause();now=0;render(0);scrub.value=0;playButton.textContent="↻ Play again";return;}
  raf=requestAnimationFrame(tick);
}
async function play() {
  try {
    await initAudio();await audioContext.resume();
    stopAudio();soundtrack(audioContext.currentTime+.08,now);
    startedAt=performance.now()-now*1000;running=true;playButton.textContent="Ⅱ Pause";
    status.textContent="Playing the complete film with narration, music, and sound effects.";
    tick();
  }catch(error){status.textContent=`Audio could not start: ${error.message}. Open this through a local web server.`;}
}
function pause() {
  running=false;cancelAnimationFrame(raf);stopAudio();
  playButton.textContent="▶ Resume";
}
playButton.addEventListener("click",()=>running?pause():play());
scrub.addEventListener("input",()=>{const was=running;if(was)pause();now=Number(scrub.value);render(now);timeLabel.value=`0:${String(Math.floor(now)).padStart(2,"0")} / 0:59`;});
exportButton.addEventListener("click",async()=>{
  if(!window.MediaRecorder||!canvas.captureStream){status.textContent="This browser cannot record Canvas video. Use a current Chrome or Edge browser.";return;}
  try{
    if(running)pause();now=0;render(0);await initAudio();await audioContext.resume();
    const types=["video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus"];
    const mimeType=types.find(x=>MediaRecorder.isTypeSupported(x))||"video/webm";
    const stream=new MediaStream([...canvas.captureStream(30).getVideoTracks(),...capture.stream.getAudioTracks()]);
    const chunks=[];
    recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:8000000,audioBitsPerSecond:192000});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onstop=async()=>{
      const ext=mimeType.includes("mp4")?"mp4":"webm";
      const blob=new Blob(chunks,{type:mimeType});
      if(new URLSearchParams(location.search).has("save")){
        try{
          const response=await fetch(`/save-video?ext=${ext}`,{method:"POST",body:blob});
          if(!response.ok)throw new Error(`HTTP ${response.status}`);
        }catch(error){status.textContent=`Local video save failed: ${error.message}`;}
      }else{
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");a.href=url;a.download=`plantuml-ultimate-film.${ext}`;a.click();
        setTimeout(()=>URL.revokeObjectURL(url),30000);
      }
      stream.getTracks().forEach(track=>track.stop());
      exportButton.disabled=false;exportButton.textContent="↓ Export video";
      status.textContent=`Exported the 59-second film as ${ext.toUpperCase()} with audio.`;
    };
    recorder.start(1000);exportButton.disabled=true;exportButton.textContent="● Recording…";
    status.textContent="Recording in real time for 59 seconds. Keep this tab visible until the download starts.";
    now=0;await play();
    setTimeout(()=>{pause();recorder.stop();now=0;render(0);},DURATION*1000+500);
  }catch(error){exportButton.disabled=false;status.textContent=`Export failed: ${error.message}`;}
});
render(0);
