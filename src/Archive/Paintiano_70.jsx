import * as Tone from "tone";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";

const PHI = 1.6180339887;
const CWIN = 55;
const KB_WIN = 65;
const DN = 25, DB = 16, DH = 26;
const GOLD = '#c9a84c';
const S_BASE = "https://tonejs.github.io/audio/salamander/";
const S_URLS = {"A0":"A0.mp3","C1":"C1.mp3","D#1":"Ds1.mp3","F#1":"Fs1.mp3","A1":"A1.mp3","C2":"C2.mp3","D#2":"Ds2.mp3","F#2":"Fs2.mp3","A2":"A2.mp3","C3":"C3.mp3","D#3":"Ds3.mp3","F#3":"Fs3.mp3","A3":"A3.mp3","C4":"C4.mp3","D#4":"Ds4.mp3","F#4":"Fs4.mp3","A4":"A4.mp3","C5":"C5.mp3","D#5":"Ds5.mp3","F#5":"Fs5.mp3","A5":"A5.mp3","C6":"C6.mp3","D#6":"Ds6.mp3","F#6":"Fs6.mp3","A6":"A6.mp3","C7":"C7.mp3","D#7":"Ds7.mp3","F#7":"Fs7.mp3","A7":"A7.mp3","C8":"C8.mp3"};

const m2f = m => 440 * Math.pow(2, (m - 69) / 12);
const wlToRgb = wl => {
  let r=0,g=0,b=0;
  if(wl>=380&&wl<440){r=(440-wl)/60;b=1}else if(wl>=440&&wl<490){g=(wl-440)/50;b=1}
  else if(wl>=490&&wl<510){g=1;b=(510-wl)/20}else if(wl>=510&&wl<580){r=(wl-510)/70;g=1}
  else if(wl>=580&&wl<645){r=1;g=(645-wl)/65}else if(wl>=645&&wl<=780){r=1}
  const f=wl<380||wl>780?0:wl<420?0.3+0.7*(wl-380)/40:wl<=700?1:Math.max(0,0.3+0.7*(780-wl)/80);
  return [Math.round(255*Math.pow(Math.max(0,r*f),.8)),Math.round(255*Math.pow(Math.max(0,g*f),.8)),Math.round(255*Math.pow(Math.max(0,b*f),.8))];
};
const octL = m => 12 + Math.max(0,Math.min(8,Math.floor(m/12)-1))/8*76;
const toHsl = (r,g,b) => {
  r/=255;g/=255;b/=255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,l=(mx+mn)/2;
  if(!d)return[0,0,l*100];
  const s=d/(1-Math.abs(2*l-1));
  let h=mx===r?(g-b)/d:mx===g?(b-r)/d+2:(r-g)/d+4;
  return[(((h%6)+6)%6)/6*360,s*100,l*100];
};
const COF=[0,210,60,270,120,330,180,30,240,90,300,150];
const fromHsl=(h,s,l)=>{s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>Math.round((l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1))))*255);return[f(0),f(8),f(4)];};
const harmCol=(m,v=100)=>{const[r,g,b]=fromHsl(COF[m%12],75+(v/127)*15,octL(m));return[r,g,b,0.72+(v/127)*0.28];};
const specCol=(m,v=100)=>{const VL=3.846e14,VH=7.895e14;let f=m2f(m)*Math.pow(2,40);while(f<VL)f*=2;while(f>VH)f/=2;const[r,g,b]=wlToRgb(3e17/f);const[h,s]=toHsl(r,g,b);const[r2,g2,b2]=fromHsl(h,s,octL(m));return[r2,g2,b2,0.65+(v/127)*0.35];};
const SPEC_HUE=Array.from({length:12},(_,pc)=>{const[r,g,b]=specCol(60+pc,90);return toHsl(r,g,b)[0];});

function parseMidi(buf){const d=new Uint8Array(buf);let p=0;const u8=()=>d[p++],u16=()=>{const v=(d[p]<<8)|d[p+1];p+=2;return v;},u32=()=>{const v=(d[p]<<24)|(d[p+1]<<16)|(d[p+2]<<8)|d[p+3];p+=4;return v;},vl=()=>{let v=0,b;do{b=u8();v=(v<<7)|(b&0x7f);}while(b&0x80);return v;};p+=4;u32();u16();const nT=u16(),div=u16(),temps=[{tick:0,uspb:500000}],raw=[];for(let t=0;t<nT;t++){while(p+4<d.length&&!(d[p]===0x4d&&d[p+1]===0x54&&d[p+2]===0x72&&d[p+3]===0x6b))p++;if(p+8>d.length)break;p+=4;const tLen=u32(),tEnd=Math.min(p+tLen,d.length);let tick=0,st=0,held={};while(p<tEnd){try{tick+=vl();}catch(_){break;}let s=d[p];if(s>=0x80){st=s;p++;}const tp=st&0xf0;if(tp===0x90){const pitch=u8(),vel=u8();if(vel>0)held[pitch]=[tick,vel];else if(held[pitch]){raw.push([pitch,held[pitch][0],held[pitch][1],tick]);delete held[pitch];}}else if(tp===0x80){const pitch=u8();u8();if(held[pitch]){raw.push([pitch,held[pitch][0],held[pitch][1],tick]);delete held[pitch];}}else if(st===0xff){const mt=u8(),ml=vl();if(mt===0x51&&ml===3){const uspb=(u8()<<16)|(u8()<<8)|u8();temps.push({tick,uspb});}else p+=ml;}else if(st===0xf0||st===0xf7){p+=vl();}else if((tp===0xb0||tp===0xe0||tp===0xa0)){u8();u8();}else if(tp===0xc0||tp===0xd0){u8();}}for(const pi in held)raw.push([parseInt(pi),held[pi][0],held[pi][1],tEnd]);p=tEnd;}raw.sort((a,b)=>a[1]-b[1]);temps.sort((a,b)=>a.tick-b.tick);return{raw,div,temps};}
function t2ms(ticks,div,temps){let ms=0,prev=0,uspb=500000;for(const{tick:tc,uspb:u}of temps){if(tc>=ticks)break;ms+=(tc-prev)*uspb/div/1000;prev=tc;uspb=u;}return ms+(ticks-prev)*uspb/div/1000;}
function toChords(raw,div,temps){if(!raw.length)return[];const uspb=temps[temps.length-1]?.uspb||500000,quarterMs=uspb/1000,wt=Math.max(2,Math.round(CWIN*div*1000/uspb)),out=[];let i=0;while(i<raw.length){const bt=raw[i][1],g=[];while(i<raw.length&&raw[i][1]-bt<=wt){const[m,st,v,et]=raw[i];g.push({m,v,durMs:Math.max(80,t2ms(et,div,temps)-t2ms(st,div,temps))});i++;}const maxDur=Math.max(...g.map(n=>n.durMs));out.push({n:g,startMs:t2ms(bt,div,temps),durQ:snapDurQ(maxDur/quarterMs)});}return out;}

// Paint-mode setting tables
const PAINT_DURS = [
  {ms:125, label:'1/16'},
  {ms:250, label:'1/8'},
  {ms:500, label:'1/4'},
  {ms:1000, label:'1/2'},
  {ms:2000, label:'1'},
];
const PAINT_VELS = [
  {v:55, label:'p'},
  {v:78, label:'mp'},
  {v:95, label:'mf'},
  {v:115, label:'f'},
];
const PAINT_SCALES = {
  off:  {label:'free',  root:0, scale:null},
  cmaj: {label:'C maj', root:0, scale:[0,2,4,5,7,9,11]},
  amin: {label:'A min', root:9, scale:[0,2,3,5,7,8,10]},
  gmaj: {label:'G maj', root:7, scale:[0,2,4,5,7,9,11]},
  emin: {label:'E min', root:4, scale:[0,2,3,5,7,8,10]},
  dmaj: {label:'D maj', root:2, scale:[0,2,4,5,7,9,11]},
  fmaj: {label:'F maj', root:5, scale:[0,2,4,5,7,9,11]},
  dmin: {label:'D min', root:2, scale:[0,2,3,5,7,8,10]},
};
const PAINT_SCALE_KEYS = ['off','cmaj','amin','gmaj','emin','dmaj','fmaj','dmin'];

function paintScalePCs(scaleKey){
  const s = PAINT_SCALES[scaleKey];
  if(!s || !s.scale) return null;
  return s.scale.map(o => (o + s.root) % 12);
}
function paintSnapMidi(midi, scaleKey){
  const pcs = paintScalePCs(scaleKey);
  if(!pcs) return midi;
  const oct = Math.floor(midi/12), pc = midi%12;
  let best=pcs[0], bestD=12;
  for(const sp of pcs){
    const d = Math.min(Math.abs(pc-sp), 12-Math.abs(pc-sp));
    if(d<bestD){bestD=d; best=sp;}
  }
  const cands = [oct*12+best, (oct-1)*12+best, (oct+1)*12+best];
  return cands.reduce((a,b)=>Math.abs(b-midi)<Math.abs(a-midi)?b:a);
}

function snapDurQ(q){const t=[0.25,0.5,0.75,1,1.5,2,3,4];let b=1,bd=Infinity;for(const x of t){const d=Math.abs(q-x);if(d<bd){bd=d;b=x;}}return b;}
function computeGrid(arg){
  const evs=Array.isArray(arg)?arg:new Array(arg).fill(null).map(()=>({durQ:1}));
  const totalQ=evs.reduce((s,e)=>s+(e.durQ!=null?e.durQ:1),0);
  const N=Math.max(2,Math.ceil(Math.sqrt(totalQ)));
  const rows=Math.max(1,Math.ceil(totalQ/N));
  // Uniform global scale: every event's durQ is multiplied by this so the totals fill exactly N*rows cells.
  // This way every block keeps the SAME unit width across the whole canvas (no per-row stretching) and the
  // last row reaches the right edge naturally. Long events that overrun a row wrap into the next row as
  // additional segments — visually continuing the same chord on the next line, no empty space at row ends.
  const scale=(N*rows)/totalQ;
  const BW=Math.max(4,Math.floor(480/N));
  const BH=Math.round(BW*PHI);
  const CW=N*BW;
  const CH=rows*BH;
  const cells=[];
  let curX=0,curY=0;
  for(let i=0;i<evs.length;i++){
    const dq=(evs[i].durQ!=null?evs[i].durQ:1)*scale;
    let remaining=dq*BW;
    const segments=[];
    while(remaining>0.5){
      const availableInRow=CW-curX;
      const segW=Math.min(remaining,availableInRow);
      segments.push({x:Math.round(curX),y:curY,w:Math.max(2,Math.round(segW)),h:BH});
      curX+=segW;
      remaining-=segW;
      if(curX>=CW-0.5){curX=0;curY+=BH;}
    }
    if(!segments.length){
      segments.push({x:Math.round(curX),y:curY,w:Math.max(2,Math.round(BW)),h:BH});
    }
    const f=segments[0];
    cells.push({idx:i,x:f.x,y:f.y,w:f.w,h:f.h,segments});
  }
  // CH may be slightly off if the last event rounded; recompute from cells
  const lastSeg=cells.length?cells[cells.length-1].segments[cells[cells.length-1].segments.length-1]:null;
  const finalCH=lastSeg?lastSeg.y+BH:CH;
  return{N,BW,BH,CW,CH:finalCH,cells,rows:Math.round(finalCH/BH),totalQ};
}
function drawBlock(ctx,bx,by,notes,gc,BW,BH){const sorted=[...notes].sort((a,b)=>b.m-a.m),n=sorted.length,bh=BH/n;sorted.forEach((note,i)=>{const[r,g,b,a]=gc(note.m,note.v),y=by+i*bh;ctx.fillStyle=`rgba(${r},${g},${b},${(a*.18).toFixed(3)})`;ctx.fillRect(bx-2,y-2,BW+4,bh+4);ctx.fillStyle=`rgba(${r},${g},${b},${a.toFixed(3)})`;ctx.fillRect(bx+.5,y+.5,BW-1,bh-1);});if(n>1){ctx.fillStyle='rgba(4,4,10,0.7)';for(let i=1;i<n;i++)ctx.fillRect(bx+.5,by+i*bh-.5,BW-1,1);}}

// Convert a downsampled-image pixel array into musical events using a given hue→pitch table
// (COF for harmony mode, SPEC_HUE for spectral mode). Pure: same input + same table → same output.
function pixelsToImageEvents(px,nc,nr,table){
  const CHORD_SIZE=3,msPerBlock=150,noteDur=150;
  function pxToNote(idx){
    const{r,g,b}=px[idx],[h,s,l]=toHsl(r,g,b);
    if(l<4||l>96||s<8)return null;
    let pc=0,minD=Infinity;
    table.forEach((th,ti)=>{const d=Math.min(Math.abs(h-th),360-Math.abs(h-th));if(d<minD){minD=d;pc=ti;}});
    const oct=Math.max(2,Math.min(7,Math.round((l-12)/76*8)));
    const midi=(oct+1)*12+pc;
    return{m:midi,v:Math.round(42+(s/100)*58),durMs:noteDur};
  }
  const evts=[];
  const nrBands=Math.floor(nr/CHORD_SIZE);
  let evIdx=0;
  for(let band=0;band<nrBands;band++){
    for(let col=0;col<nc;col++){
      const notes=[];
      for(let j=0;j<CHORD_SIZE;j++){
        const row=band*CHORD_SIZE+j;
        if(row>=nr)break;
        const n=pxToNote(row*nc+col);
        if(n)notes.push(n);
      }
      evts.push({n:notes,startMs:evIdx*msPerBlock,idx:evIdx});
      evIdx++;
    }
  }
  // ─── Music theory pass ──
  // 1) Krumhansl-Schmuckler key detection
  const pcCounts=new Array(12).fill(0);
  evts.forEach(ev=>ev.n.forEach(n=>pcCounts[n.m%12]++));
  const MAJOR_P=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
  const MINOR_P=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
  let bestKey=0,bestModeIsMajor=true,bestCorr=-Infinity;
  for(let key=0;key<12;key++){
    for(const isMaj of[true,false]){
      const prof=isMaj?MAJOR_P:MINOR_P;
      let corr=0;
      for(let i=0;i<12;i++)corr+=pcCounts[(i+key)%12]*prof[i];
      if(corr>bestCorr){bestCorr=corr;bestKey=key;bestModeIsMajor=isMaj;}
    }
  }
  const MAJ_OFFSETS=[0,2,4,5,7,9,11];
  const MIN_OFFSETS=[0,2,3,5,7,8,10];
  const scalePCs=(bestModeIsMajor?MAJ_OFFSETS:MIN_OFFSETS).map(o=>(o+bestKey)%12);
  function snapToScale(midi){
    const oct=Math.floor(midi/12);
    let bestPC=scalePCs[0],bestD=99;
    for(const s of scalePCs){const d=Math.min(Math.abs(midi%12-s),12-Math.abs(midi%12-s));if(d<bestD){bestD=d;bestPC=s;}}
    const cands=[oct*12+bestPC,(oct-1)*12+bestPC,(oct+1)*12+bestPC];
    return cands.reduce((a,b)=>Math.abs(b-midi)<Math.abs(a-midi)?b:a);
  }
  function tightenChord(notes){
    if(notes.length<=1)return notes;
    const sorted=[...notes].sort((a,b)=>a.m-b.m);
    const anchor=sorted[Math.floor(sorted.length/2)].m;
    return notes.map(n=>{let m=n.m;while(m>anchor+17)m-=12;while(m<anchor-17)m+=12;return{...n,m};});
  }
  function removeM2(notes){
    if(notes.length<=1)return notes;
    const byVel=[...notes].sort((a,b)=>(b.v||0)-(a.v||0));
    const kept=[];
    for(const n of byVel){if(kept.some(k=>Math.abs(k.m-n.m)===1))continue;kept.push(n);}
    return kept;
  }
  for(const ev of evts){
    ev.n=ev.n.map(n=>({...n,m:snapToScale(n.m)}));
    ev.n=tightenChord(ev.n);
    ev.n=removeM2(ev.n);
    const seen=new Set();
    ev.n=ev.n.filter(n=>seen.has(n.m)?false:(seen.add(n.m),true));
  }
  // Merge identical consecutive chords for legato, capped at whole note
  const chordKey=ns=>ns.length?ns.map(n=>n.m).sort((a,b)=>a-b).join(','):'';
  const MAX_RUN=4;
  let mi=0;
  while(mi<evts.length){
    const key=chordKey(evts[mi].n);
    if(!key){mi++;continue;}
    let mj=mi+1;
    while(mj<evts.length&&chordKey(evts[mj].n)===key)mj++;
    let k=mi;
    while(k<mj){
      const groupLen=Math.min(MAX_RUN,mj-k);
      if(groupLen>1){
        evts[k]._runLen=groupLen;
        for(let x=k+1;x<k+groupLen;x++)evts[x]._playable=false;
      }
      k+=groupLen;
    }
    mi=mj;
  }
  return evts;
}

const BKS=new Set([1,3,6,8,10]);
const{w:WKEYS,b:BKEYS}=(()=>{const w=[],b=[];let wi=0;for(let m=60;m<=84;m++){const pc=m%12;if(!BKS.has(pc))w.push({midi:m,wi:wi++});else b.push({midi:m,lw:wi-1});}return{w,b};})();
const LEGEND=[{n:'C',pc:0},{n:'G',pc:7},{n:'D',pc:2},{n:'A',pc:9},{n:'E',pc:4},{n:'B',pc:11},{n:'F#',pc:6},{n:'D♭',pc:1},{n:'A♭',pc:8},{n:'E♭',pc:3},{n:'B♭',pc:10},{n:'F',pc:5}];

// Für Elise — extended rondo (A-B-A-C-A) by Beethoven, ~1 min
const DEMO=[
{n:[{m:76,v:82,durMs:200}],d:200},{n:[{m:75,v:78,durMs:200}],d:200},{n:[{m:76,v:82,durMs:200}],d:200},{n:[{m:75,v:78,durMs:200}],d:200},{n:[{m:76,v:80,durMs:200}],d:200},{n:[{m:71,v:74,durMs:200}],d:200},{n:[{m:74,v:80,durMs:200}],d:200},{n:[{m:72,v:76,durMs:200}],d:200},
{n:[{m:69,v:90,durMs:400},{m:57,v:58,durMs:400},{m:52,v:55,durMs:400},{m:45,v:52,durMs:400}],d:400},{n:[{m:60,v:72,durMs:200}],d:200},{n:[{m:64,v:80,durMs:200}],d:200},{n:[{m:71,v:88,durMs:400},{m:52,v:58,durMs:400},{m:56,v:55,durMs:400},{m:40,v:52,durMs:400}],d:400},{n:[{m:64,v:72,durMs:200}],d:200},{n:[{m:68,v:80,durMs:200}],d:200},{n:[{m:72,v:86,durMs:400},{m:57,v:58,durMs:400},{m:52,v:55,durMs:400},{m:45,v:52,durMs:400}],d:400},{n:[{m:64,v:76,durMs:200}],d:200},
{n:[{m:76,v:82,durMs:200}],d:200},{n:[{m:75,v:78,durMs:200}],d:200},{n:[{m:76,v:82,durMs:200}],d:200},{n:[{m:75,v:78,durMs:200}],d:200},{n:[{m:76,v:80,durMs:200}],d:200},{n:[{m:71,v:74,durMs:200}],d:200},{n:[{m:74,v:80,durMs:200}],d:200},{n:[{m:72,v:76,durMs:200}],d:200},
{n:[{m:69,v:88,durMs:400},{m:57,v:58,durMs:400},{m:52,v:55,durMs:400},{m:45,v:52,durMs:400}],d:400},{n:[{m:60,v:72,durMs:200}],d:200},{n:[{m:64,v:80,durMs:200}],d:200},{n:[{m:71,v:86,durMs:400},{m:52,v:58,durMs:400},{m:56,v:55,durMs:400},{m:40,v:52,durMs:400}],d:400},{n:[{m:64,v:72,durMs:200}],d:200},{n:[{m:72,v:80,durMs:200}],d:200},{n:[{m:71,v:76,durMs:200}],d:200},{n:[{m:69,v:90,durMs:500},{m:57,v:58,durMs:500},{m:52,v:55,durMs:500},{m:45,v:55,durMs:500}],d:500},
{n:[{m:64,v:68,durMs:200}],d:200},{n:[{m:68,v:76,durMs:200}],d:200},{n:[{m:71,v:80,durMs:200}],d:200},{n:[{m:72,v:82,durMs:200}],d:200},{n:[{m:71,v:75,durMs:200}],d:200},{n:[{m:69,v:72,durMs:200}],d:200},{n:[{m:68,v:80,durMs:600},{m:56,v:55,durMs:600},{m:44,v:52,durMs:600}],d:600},{n:[{m:67,v:78,durMs:360},{m:60,v:55,durMs:360},{m:48,v:50,durMs:360}],d:360},
{n:[{m:65,v:72,durMs:200}],d:200},{n:[{m:64,v:72,durMs:200}],d:200},{n:[{m:62,v:72,durMs:200}],d:200},{n:[{m:60,v:82,durMs:360},{m:48,v:50,durMs:360},{m:36,v:48,durMs:360}],d:360},{n:[{m:67,v:75,durMs:200}],d:200},{n:[{m:72,v:82,durMs:200}],d:200},{n:[{m:76,v:78,durMs:200}],d:200},{n:[{m:79,v:82,durMs:400},{m:62,v:55,durMs:400},{m:55,v:50,durMs:400}],d:400},
{n:[{m:77,v:75,durMs:200}],d:200},{n:[{m:76,v:75,durMs:200}],d:200},{n:[{m:74,v:72,durMs:200}],d:200},{n:[{m:72,v:80,durMs:400},{m:64,v:55,durMs:400},{m:48,v:50,durMs:400}],d:400},{n:[{m:67,v:72,durMs:200}],d:200},{n:[{m:65,v:72,durMs:200}],d:200},{n:[{m:64,v:72,durMs:200}],d:200},{n:[{m:72,v:80,durMs:360},{m:60,v:55,durMs:360},{m:48,v:48,durMs:360}],d:360},
{n:[{m:76,v:78,durMs:200}],d:200},{n:[{m:79,v:82,durMs:200}],d:200},{n:[{m:81,v:86,durMs:400},{m:64,v:55,durMs:400},{m:53,v:50,durMs:400}],d:400},{n:[{m:79,v:80,durMs:200}],d:200},{n:[{m:77,v:76,durMs:200}],d:200},{n:[{m:76,v:82,durMs:500},{m:60,v:58,durMs:500},{m:48,v:52,durMs:500}],d:500},{n:[{m:72,v:75,durMs:200}],d:200},{n:[{m:76,v:78,durMs:200}],d:200},
{n:[{m:79,v:82,durMs:200}],d:200},{n:[{m:84,v:86,durMs:200}],d:200},{n:[{m:83,v:82,durMs:400},{m:67,v:55,durMs:400},{m:55,v:50,durMs:400}],d:400},{n:[{m:81,v:80,durMs:200}],d:200},{n:[{m:79,v:78,durMs:200}],d:200},{n:[{m:77,v:76,durMs:200}],d:200},{n:[{m:76,v:82,durMs:500},{m:64,v:55,durMs:500},{m:48,v:52,durMs:500}],d:500},{n:[{m:75,v:72,durMs:200}],d:200},
{n:[{m:74,v:70,durMs:200}],d:200},{n:[{m:72,v:72,durMs:200}],d:200},{n:[{m:71,v:75,durMs:400},{m:52,v:55,durMs:400},{m:40,v:52,durMs:400}],d:400},{n:[{m:76,v:80,durMs:200}],d:200},{n:[{m:75,v:76,durMs:200}],d:200},{n:[{m:76,v:80,durMs:200}],d:200},{n:[{m:75,v:76,durMs:200}],d:200},{n:[{m:76,v:78,durMs:200}],d:200},
{n:[{m:71,v:72,durMs:200}],d:200},{n:[{m:74,v:78,durMs:200}],d:200},{n:[{m:72,v:74,durMs:200}],d:200},{n:[{m:69,v:88,durMs:400},{m:57,v:56,durMs:400},{m:52,v:53,durMs:400},{m:45,v:50,durMs:400}],d:400},{n:[{m:60,v:70,durMs:200}],d:200},{n:[{m:64,v:78,durMs:200}],d:200},{n:[{m:71,v:86,durMs:400},{m:52,v:56,durMs:400},{m:56,v:53,durMs:400},{m:40,v:50,durMs:400}],d:400},{n:[{m:64,v:70,durMs:200}],d:200},
{n:[{m:68,v:78,durMs:200}],d:200},{n:[{m:72,v:84,durMs:400},{m:57,v:56,durMs:400},{m:52,v:53,durMs:400},{m:45,v:50,durMs:400}],d:400},{n:[{m:64,v:74,durMs:200}],d:200},{n:[{m:76,v:80,durMs:200}],d:200},{n:[{m:75,v:76,durMs:200}],d:200},{n:[{m:76,v:80,durMs:200}],d:200},{n:[{m:75,v:76,durMs:200}],d:200},{n:[{m:76,v:78,durMs:200}],d:200},
{n:[{m:71,v:72,durMs:200}],d:200},{n:[{m:74,v:78,durMs:200}],d:200},{n:[{m:72,v:74,durMs:200}],d:200},{n:[{m:69,v:86,durMs:400},{m:57,v:56,durMs:400},{m:52,v:53,durMs:400},{m:45,v:50,durMs:400}],d:400},{n:[{m:60,v:70,durMs:200}],d:200},{n:[{m:64,v:78,durMs:200}],d:200},{n:[{m:71,v:84,durMs:400},{m:52,v:56,durMs:400},{m:56,v:53,durMs:400},{m:40,v:50,durMs:400}],d:400},{n:[{m:64,v:70,durMs:200}],d:200},
{n:[{m:72,v:78,durMs:200}],d:200},{n:[{m:71,v:74,durMs:200}],d:200},{n:[{m:69,v:88,durMs:500},{m:57,v:56,durMs:500},{m:52,v:53,durMs:500},{m:45,v:53,durMs:500}],d:500},{n:[{m:64,v:66,durMs:200}],d:200},{n:[{m:68,v:74,durMs:200}],d:200},{n:[{m:71,v:78,durMs:200}],d:200},{n:[{m:72,v:80,durMs:200}],d:200},{n:[{m:71,v:73,durMs:200}],d:200},
{n:[{m:69,v:70,durMs:200}],d:200},{n:[{m:68,v:78,durMs:600},{m:56,v:53,durMs:600},{m:44,v:50,durMs:600}],d:600},{n:[{m:79,v:82,durMs:150},{m:38,v:60,durMs:150}],d:150},{n:[{m:77,v:75,durMs:150}],d:200},{n:[{m:76,v:82,durMs:150}],d:200},{n:[{m:75,v:75,durMs:150}],d:200},{n:[{m:76,v:82,durMs:150}],d:200},{n:[{m:75,v:75,durMs:150}],d:200},
{n:[{m:76,v:82,durMs:150}],d:200},{n:[{m:77,v:75,durMs:150}],d:200},{n:[{m:76,v:82,durMs:150}],d:200},{n:[{m:75,v:75,durMs:150}],d:200},{n:[{m:76,v:82,durMs:150}],d:200},{n:[{m:77,v:88,durMs:300},{m:53,v:58,durMs:300},{m:41,v:52,durMs:300}],d:300},{n:[{m:79,v:82,durMs:150},{m:38,v:60,durMs:150}],d:150},{n:[{m:77,v:75,durMs:150}],d:200},
{n:[{m:76,v:82,durMs:150}],d:200},{n:[{m:75,v:75,durMs:150}],d:200},{n:[{m:76,v:82,durMs:150}],d:200},{n:[{m:75,v:75,durMs:150}],d:200},{n:[{m:76,v:82,durMs:150}],d:200},{n:[{m:77,v:75,durMs:150}],d:200},{n:[{m:76,v:82,durMs:150}],d:200},{n:[{m:75,v:75,durMs:150}],d:200},
{n:[{m:76,v:82,durMs:150}],d:200},{n:[{m:77,v:88,durMs:300},{m:53,v:58,durMs:300},{m:41,v:52,durMs:300}],d:300},{n:[{m:79,v:82,durMs:150},{m:38,v:60,durMs:150}],d:150},{n:[{m:77,v:75,durMs:150}],d:200},{n:[{m:76,v:82,durMs:150}],d:200},{n:[{m:75,v:75,durMs:150}],d:200},{n:[{m:76,v:82,durMs:150}],d:200},{n:[{m:75,v:75,durMs:150}],d:200},
{n:[{m:76,v:82,durMs:150}],d:200},{n:[{m:77,v:75,durMs:150}],d:200},{n:[{m:76,v:82,durMs:150}],d:200},{n:[{m:75,v:75,durMs:150}],d:200},{n:[{m:76,v:82,durMs:150}],d:200},{n:[{m:77,v:88,durMs:300},{m:53,v:58,durMs:300},{m:41,v:52,durMs:300}],d:300},{n:[{m:76,v:75,durMs:150}],d:200},{n:[{m:75,v:72,durMs:150}],d:200},
{n:[{m:76,v:75,durMs:150}],d:200},{n:[{m:75,v:72,durMs:150}],d:200},{n:[{m:76,v:75,durMs:150}],d:200},{n:[{m:75,v:72,durMs:150}],d:200},{n:[{m:76,v:75,durMs:150}],d:200},{n:[{m:77,v:88,durMs:200},{m:40,v:55,durMs:200}],d:200},{n:[{m:76,v:75,durMs:150}],d:200},{n:[{m:75,v:75,durMs:150}],d:200},
{n:[{m:74,v:75,durMs:150}],d:200},{n:[{m:73,v:75,durMs:150}],d:200},{n:[{m:74,v:75,durMs:150}],d:200},{n:[{m:73,v:75,durMs:150}],d:200},{n:[{m:74,v:75,durMs:150}],d:200},{n:[{m:76,v:75,durMs:150}],d:200},{n:[{m:77,v:75,durMs:150}],d:200},{n:[{m:76,v:75,durMs:150}],d:200},
{n:[{m:75,v:75,durMs:150}],d:200},{n:[{m:74,v:75,durMs:150}],d:200},{n:[{m:72,v:85,durMs:400},{m:36,v:58,durMs:400}],d:400},{n:[{m:71,v:75,durMs:200}],d:200},{n:[{m:72,v:80,durMs:200}],d:200},{n:[{m:74,v:78,durMs:200}],d:200},{n:[{m:76,v:90,durMs:500},{m:40,v:60,durMs:500},{m:28,v:52,durMs:500}],d:500},{n:[{m:75,v:72,durMs:150}],d:200},
{n:[{m:74,v:72,durMs:150}],d:200},{n:[{m:73,v:72,durMs:150}],d:200},{n:[{m:72,v:72,durMs:150}],d:200},{n:[{m:73,v:72,durMs:150}],d:200},{n:[{m:72,v:72,durMs:150}],d:200},{n:[{m:71,v:72,durMs:150}],d:200},{n:[{m:69,v:72,durMs:150}],d:200},{n:[{m:67,v:72,durMs:150}],d:200},
{n:[{m:69,v:72,durMs:150}],d:200},{n:[{m:71,v:72,durMs:150}],d:200},{n:[{m:72,v:72,durMs:150}],d:200},{n:[{m:71,v:72,durMs:150}],d:200},{n:[{m:69,v:72,durMs:150}],d:200},{n:[{m:68,v:72,durMs:150}],d:200},{n:[{m:69,v:72,durMs:150}],d:200},{n:[{m:69,v:90,durMs:600},{m:45,v:60,durMs:600},{m:33,v:55,durMs:600}],d:600},
{n:[{m:76,v:85,durMs:200}],d:200},{n:[{m:75,v:81,durMs:200}],d:200},{n:[{m:76,v:85,durMs:200}],d:200},{n:[{m:75,v:81,durMs:200}],d:200},{n:[{m:76,v:83,durMs:200}],d:200},{n:[{m:71,v:77,durMs:200}],d:200},{n:[{m:74,v:83,durMs:200}],d:200},{n:[{m:72,v:79,durMs:200}],d:200},
{n:[{m:69,v:93,durMs:400},{m:57,v:61,durMs:400},{m:52,v:58,durMs:400},{m:45,v:55,durMs:400}],d:400},{n:[{m:60,v:75,durMs:200}],d:200},{n:[{m:64,v:83,durMs:200}],d:200},{n:[{m:71,v:91,durMs:400},{m:52,v:61,durMs:400},{m:56,v:58,durMs:400},{m:40,v:55,durMs:400}],d:400},{n:[{m:64,v:75,durMs:200}],d:200},{n:[{m:68,v:83,durMs:200}],d:200},{n:[{m:72,v:89,durMs:400},{m:57,v:61,durMs:400},{m:52,v:58,durMs:400},{m:45,v:55,durMs:400}],d:400},{n:[{m:64,v:79,durMs:200}],d:200},
{n:[{m:76,v:85,durMs:200}],d:200},{n:[{m:75,v:81,durMs:200}],d:200},{n:[{m:76,v:85,durMs:200}],d:200},{n:[{m:75,v:81,durMs:200}],d:200},{n:[{m:76,v:83,durMs:200}],d:200},{n:[{m:71,v:77,durMs:200}],d:200},{n:[{m:74,v:83,durMs:200}],d:200},{n:[{m:72,v:79,durMs:200}],d:200},
{n:[{m:69,v:91,durMs:400},{m:57,v:61,durMs:400},{m:52,v:58,durMs:400},{m:45,v:55,durMs:400}],d:400},{n:[{m:60,v:75,durMs:200}],d:200},{n:[{m:64,v:83,durMs:200}],d:200},{n:[{m:71,v:89,durMs:400},{m:52,v:61,durMs:400},{m:56,v:58,durMs:400},{m:40,v:55,durMs:400}],d:400},{n:[{m:64,v:75,durMs:200}],d:200},{n:[{m:72,v:83,durMs:200}],d:200},{n:[{m:71,v:79,durMs:200}],d:200},{n:[{m:69,v:93,durMs:500},{m:57,v:61,durMs:500},{m:52,v:58,durMs:500},{m:45,v:58,durMs:500}],d:500},
{n:[{m:64,v:71,durMs:200}],d:200},{n:[{m:68,v:79,durMs:200}],d:200},{n:[{m:71,v:83,durMs:200}],d:200},{n:[{m:72,v:85,durMs:200}],d:200},{n:[{m:71,v:78,durMs:200}],d:200},{n:[{m:69,v:75,durMs:200}],d:200},{n:[{m:68,v:83,durMs:600},{m:56,v:58,durMs:600},{m:44,v:55,durMs:600}],d:600},{n:[{m:76,v:80,durMs:200}],d:200},
{n:[{m:75,v:78,durMs:200}],d:200},{n:[{m:76,v:80,durMs:200}],d:200},{n:[{m:71,v:74,durMs:200}],d:200},{n:[{m:72,v:72,durMs:200}],d:200},{n:[{m:69,v:76,durMs:200}],d:200},{n:[{m:64,v:72,durMs:300},{m:52,v:55,durMs:300}],d:300},{n:[{m:68,v:74,durMs:300},{m:56,v:55,durMs:300}],d:300},{n:[{m:71,v:76,durMs:300},{m:52,v:55,durMs:300}],d:300},
{n:[{m:72,v:75,durMs:300}],d:200},{n:[{m:71,v:72,durMs:300}],d:200},{n:[{m:69,v:75,durMs:300}],d:200},{n:[{m:69,v:98,durMs:3000},{m:64,v:72,durMs:3000},{m:57,v:65,durMs:3000},{m:45,v:60,durMs:3000},{m:33,v:55,durMs:3000}],d:3000}
];

// Built-in sample files (embedded as base64; loaded through the real MIDI parser / audio decoder)
const SAMPLE_MIDI_NAME = "Liebestraum No.3 — Liszt";
const SAMPLE_AUDIO_NAME = "Liebestraum No.3 (Liszt) — 25 sec preview";
const SAMPLE_IMAGE_NAME = "The Scream — Edvard Munch";
const SAMPLE_IMAGE_B64 = "data:image/jpeg;base64,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";
const SAMPLE_MIDI_B64 = "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";
const SAMPLE_AUDIO_B64 = "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//OAwAAAAAAAAAAAAEluZm8AAAAPAAADwAADEHwAAwUICg4QEhUXGh0fIiQnKSsvMTQ2ODs+QUNFSEpOUFJVV1pcX2JkZ2lrb3F0dnh7foGDhYiKjZCSlZeanJ+ipKepq6+xtLa4u73Bw8XIys3Q0tXX2tze4uTn6evu8fT2+Pv9AAAAAExhdmM2MC4zMQAAAAAAACI6AAAAACQEUQAAAAAAAxB859XRWQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/zgMQAI1wNvHVGGAEACPKvZO2IAAABCGRBhAgQiIvwYQIRlgAhE/dwAQhd9HDgbufEAwN3c/9EABCFuiFXcOLcQEAEQv/+IEAEd3c/rgCFu5xAMDAwMDd9Hd34iF7u7u7on/7iELd/QDA3PiFQAAQq4GBixCIhf///uiIn9cAAABE+IBi3dw7vu7u5//9cDAxaIiIiF/u4cDLKgkAyn4ouQ0QmSBxwlc4Bgs8g+z5JnIM1IzIBRRPsXy0M4BikAGaAga0SQdaYvCBkAD6hhcb/84LENTXkDfQLm6ABYZkzcvsaEAGkOSG3hoZg6mcvjnlQzUIYHHhfcdDKstb0+amDkUPOak2xpakmnWjXWcSMFsmfIgfPk4gkZ1Ju7KrQrbUZsqYO1bGR5A6T5uZk2XETh8wWmhLjJ1q/MCaWUy6yNbeo6govl8vE2XyDoVHT5FzYyZazdBBlqZ3r19TLOE0gxuyJUXKBo/0CIEeZk+WEy8QM0JtAqFVA0JwplsnAOqBQKBCsTo7LbrbbZI3DGq0OLEqoAkesIYaExr1Gg6uCAP/zgsQhM8pWgl+c0AIRKEyULAUJmCRWZnH76ICkKC3J6JgIfnJJwO0duYiPgUCjcdFKaigCrCRUZnUqZLZNsSMKbQiQOTHdB1pcjE7VbCywxtpzFlsFT0a6W2pKFxoFs557zt51Pv5d3N2ZFI4K5fu/T3e/lY7T4XMO4Y4cz5ygw13+Z9/Vnvd/hv/z/KnsbwqYWc7PMa1jOxYyy5ewr4OQH6dS7Ilg0JTdKwmCaxF9v/tW7kXsSPShxwlVK6pljAkaGKS0Zbah/4PmkhaNCUwU//OCxBUquXZIFdygAYw1ALTH4AFgWRAU9UTEFUtgMCzZIfFg+peQAUGDpCVG2UBiYdpS0phC0EbCyi+HVL5MmgTFiBk2H2MFFKSDOgJoemA7GUiXVoJOW1pMcdamWqcSRZaqNTzik1Oov88J4KQ58baqj/gI5/8I5+f9I0jbwRNh89Osdm7cePtWZnbWgd+vd/X6/5te19/s/C3Fa4HXFf/70gYgrADAmMJhOAOoHnhnmUAIDIjmKrpG7aWmGoagorzChsD9F7MYBRUwiUJsSED/84LELjECKjAS7xB90OQgVmMB4coOpECFcp7m4yG0NkpdUxWWwwAzcZR4W9DbyoOlYVryFD0oBGdBXWr2bdJB+e3Bisdv8m6QNZAjNTCG57HWKCyeNhzKoccYXEmjhFSVi7Xmj2lHlZR9rl5z5P7RxqSPGvnySc35jzBh/21yAQapqVeuxj/WI+tqyW5PKIm74N4Lx6rhdl4504sqA5RjRX07CrEGjoTGDgRmEmKGLJMmIAPCADzAUDTw8EDBYHxEARiGaB3uUpiGBAWAcwIVDv/zgsQuLrniOBLvEJn4ZwgsF1CILnGQWlk6jCzVg6UxnX/MgAFY8h8qgCaoZsQAYmBW7KdqbGeEGsXt6ro/Z8mnku5/DechIW5w/jga8NG2o5SEBrcrBp8HA3VkZGswQoUVSJ0rvWKGD9dp/Wy9bTdMJ78nhgaVxNprkBPpdpf+dGVfX9lKC2H4MCV/5peZjXrt/IY6u1/nt9UWYshdYwGAMwziw2nG9VggBhi+YnkUcYKBpigKGJXmefXRiUBqamASAb9OI0FlAxUBmvi8q1lz//OCxDcnmQ5AEu8ePLhnMXsQn4MMNjZrlLVhUHczJAVWs+KeM2NeIbftkUFZ+V9N9tj1njtOKw8OChcKMNDnMDZUXBgClgYFzkmRAMSMeUYOGh16a4iFYGEPjapalg1HtHXDWWT0yrScpHb+G5JBUlIpccNqJFG0dAYtyYlsEdZhOYNgCIAYMC3JMZCECwEBw2GFiIm9RcGDwIoLGGsJ1toXnQnmFDxqtKxaKMrN4Oom4rulVNWzlNoy2ZRTjIQqzPJP9QnWT0Q9Y4YBmppiBnj/84LEXCehDjwK7taUIilUVmdVnUiokHkkDyR6GAyseUaVy0iYOjTwblAmy0fF10zbkRl4vC6npU0qY2pzBrUlKh7yevtJGCSanLNyptBe+gn/zVPWYqYPGwbD2JKAmFEqcEAAXAhgoAmDCQcwHoKDCC6ChFdEoHQHQJpYTj8vmdHy+9cChB+t6jF/LdG1Hvtlaj/K0gx9wXPyEUaFCJ4cnTsfs0xVP8z0ms9pS1ZkJSD0GlvoFWEAGYmW3JNxkLOOLrat4Hrajuau8lV727EmSf/zgsSBIvmKUDTmkLDxljS8UIVaM7FLnyLtZEYAAqYblyeBgY5bFzDgQjkIIzCEKBkKTBFOD9ecw0YGAcAtRzOGIQKKF0jrllCx34ENOQGcTt0yEXIgG3SLKotVkl1EMrDGVae6zc3veqhvap2W/jk+I4fQTnzedC8XKPFscvdDAEOxyw6XzCLjZMwHY8ARZkxtCxSgAoNKam44o1eQDAHxOt4kqpvpWzpEBM8gWcoMI1NqVMqVTEFNRRwZUmfKjC9rznUHGVOCYIJ0aGDmAgeF//OCxLknUVI8CO7QfIJzD8KzoUNhYbxIEDBESzUkhAMDaAseAgrL0SAuBXxMURHemWOGYNAeq7HSwcXDQCTi0einiIa65ZdXbDr3q5bn28q1y+4cb6liY/r+3Sc9QbnEilDi6yRGHxGkTBS14WGjx4uKgg5iWxoje+18UqaF6tthVWcGIcgBdLdp9oAa9bEXwLSpy4utVmTlMFAKMAf3OySaMEwTMHAHMV4SN+zHHBLMYxEMFH5MO2YIBBBIOGHBCnOxwDQqA0EjCwIzR4kG0d7/84LE2yfxnjwK68cMWDOMkiUCgZNwwtkL8P/ZVK393FW1SdjEqhJQG5zMAr3tZOmvKVy+nLq0X+zyvXxj9FhdmLPMsARkoMFSYMT5EH8cdcDwyEKjLuRGpEHrk567zp7K6K4V1qM+SEdFt+CVi5ijVUZLnMqhISxSSO25iOuSsqPGf/Nt61Icra1CE6yWfmzN56tbU82KHn2ZbHcWAQBiMFzAUTjBPsTBkrDAkFR4LDE0TgmIjBgMTCcFjFYfz5wJjE4EguDoVMwyCTUwKBYaAP/zgsT/MrwWLADuxtQzkcNrv2QQRRG8t7LJQ3Uwld5XzJAKmsW1kKfnOkACVg1+7EmnbrbRpmKlpNqnprDhRXWq8V3hlP55dcdDQSXRhLMbzor1Q9lH+Dgh+kCQqfQ1OtGNZs65VkLaZq+bJ//w/Mp5+jSFG5F2fRj9GN6Ztn5U0vJQaa3Z6pNf8geLjeIwkd2kvuRPycfVXIFgZC4ZGB3JnHxYGDYImAoWGJ66nKpQCQUmDAHmJTBGwCcmAQKF8SIWzmMXDD8ETCQUKhpn9w09//OCxPgvizowAO7GuXY9RuDUwGMM6M2Kkf53JxnMxtKPSOr6TpMCcl85Uh2UShScu3MJS3PtPHhyvnJsu7w7n0AuxowMNhRBg7p0iKndDdCE9ToTaK6RCJ+FKrys6VTO5Gsh8pkMfCKTM53G9jJKpE5cyPpKCIl+fENHpAnaFspPn6juOXg2Io2yNGWyZSnfR2JZgoOllQIIRBMgFQ8MRrBP7BsMFgHAIUGADomYhVEANGMwLmJ53HhpQgYlgUAgMKU1kQwFAS8xjwYfBEjQBRr/84LE/TCz/jAA7sa5exsrjAVuHgh+bS1sdBZmDJUoY8kvjKH5QEf2OQJvc2zLPKomRepMYZOqxoIJECDvLzI2eD7LHqaZD8Q8wKTE081cDx4/yl3NlLYn+Bu01F3FNSfV13EwvDiifc9c16Txa+SNnGJLw+hjCUhH3d4mdlSna+a7qknuN7iJdHu0SGXu65n/uN2rSrOfy8iJTEERaNTUwFQADBaFBNCoCIWA5MAMAQwLA0wEioYBIDgQCoYFoiZkIhqGBKACraYMPx2BpmFgIP/zgsT+MbP2MEru0LUYECw/DvUrXQOSZCNDc30eMxAN68splYFX3IzATTfqqopQ8uX3y3u8qGxSTyw8qnsoCo87lmBdbtX9ctmy2j1JB1Yy+620yQzNgpISW5G0M+TBeZ+mTyw7Pj6lEI0nl3O5rLqUzStayna2f8UpXpI1P/34mXMzhAv9uT6nkV1ymf5HlaC4DxjvJgAAuNAAgEBcw/CADmKAdMFoAowGQOTCQFsNJANEwLQJDBNAYMJInE0eB1jBuAxRKME8HY0Pw6RYPIgD//OCxPkve+Y0IPcGn2CRyembgCGKtbBDTMZhhkaPQJZiRzftEC4cdS1Dbhp45T5ICyYU7l8fnbEruCwLqYUxcCUSn3+FJDIdAlJUQkTmUYqeiiWlBhd0ZLncUkoviKmZGHJbM+q42WXURNyWxGtheeNN3JLJpPMT1ddDqS82ElUiPI7WLMEKO2Y0klbqgwpK22oYiw+RqPtXUMVMpjHKQlFDFRufPw1Ip10ctO0dUlqOPROnUVJ2owguS7EUJEq1FbubSs7qlntTZVQwZVbiMEj/84LE/0BMFhwA9xK0UZhVA5/7rWU3As+YoTEfjCWAhEMFQVMEEgMiB9UKAwxmHxWHMxHhgyFlh2ZAPwOgqQ5jwYaDDqDSzRlDpnKGsmHoqXNNSsrSwfR/hkDg6Nz5IAlApYqyVZ+Pc2yXs7qk8KbF8ZbWnJ15aTXtQwnaMnXQxWQW2p4KHjlqyTqKLSNcwigiTG4tzMqRY7DJ1CtBNaeKJ5LdWj0Xl3f5KMLQZiFTFFNWYWQXZsPQkocN4qqnNSlk5XL+8av0/cb60ZWmXuFesv/zgsTBOpwWNFTu0pxMrZF90akgj2VlJ5kMm/ZqyzcjtJJHJGIlCZA2KoU9Cs7/wI1mkpUskyoQgEjIFIUCLMGKEw2fhbzBCBOMBUCcwKyTjOXC/AAF5gngbmCeX4ZipPpgigsGAGBaYQAWRpgCRmEIBcYGGRjMpmr78KgWDhQAGUbane1dTY0cZh4vRuAQsGY3IpaVAele5D3lUGlApfGLxkiA1uKP4EA3XyEoAFqGaBvWXQ5IoxDki+VU9uIUW6fcskyTFgaFRVRNgiQMKgS0//OCxJpE7A4YAPcSudFi6Um1yMjJCMU0aVhHYpHsNxjpSMnsxxH0TZdx1BFo4i5CsZG5RphlM4RtItUcYYRS2ZyLIeTejJNIUdtmycxhCp5nJRVkQKtRk9mtVhDFb72y8HsFrVtWGQOLKNdlpxq1INtKNdCxI8pto5J6QxbdCFPZOnykGFClEIgDwYAoYFQMJgTsaGCEIyIQIhIAQwSQJTK5BgMAwCcwGAEDB7B9NFcJAoDuMCAAEwPQ4DIzFZMCsAwcAZiUMHDFmLBhfzsmCn7/84LESjpEDiQI9wy4CgAd9Txl8OFAgh/RcxoUE6dRGKA6VF1FillsNTVNq+TAaT1JlXVBn8GVoO5Wmb1Wi/fJadg0QwyY2DsKvLcSUQR11ESktXft7yS2b016Ui8elJuge5col03YxNk8PPm6vCOokcvctHfd2yZ+58y4rr81pbfIxF/Zh5UZ2xzEv3y4M5mszTkNuywjyXmcru7R6Ray82UZvNYnsYczw5krQSgKXsMGAlMGdaObShMIQCAQWGC5gmXIeBAMmCQMBZHTEg8hAP/zgsQlKymuNAjrxw8uKAUFR3NKzOMFwNS3IgcMqQMSjgFfAoRcN2FzmDAciQB5XFpMk84kCCjxSrIjWpEBWj00PJUtuv37bLAtG88Gt9xbZkmSExc/6cvOvP6TNh2iLsGplrHBKsvd9hG1H8GTCCixvrsuD+K2DbcfLfzfobkpjXtC/KOFfUa9cFb6tPcOxdxevtyKYkyMgEYAAqYixMetimLB8pwICXMpAsUMS5MKgVBYWEQqlYBmDgTmwwaDQWIMF3TIgKl614JAo8Tk86Q6//OCxDwnwxY4COvFCBw1yl9kbLGfiDOEmijNT2ufXzAUNMaRUl+9EGMwVVawKZiHDkclXc6UZ81qurP0olMns3fS6lNV5Upi0oWkzpyoldnLtqzMxrOdVQr97FvuKO0TJeSkxy3MCCU7EwGMY9mKmgh1z65JjJjDpYCf2RA7qJotCUekyRg1GMiunowssDILlduEmL1GHxDMbuiAX4dmQqB88txkvjIcWDIm6lbIKXxjsgsVVRzcUY6ER9GIDDgRHjR7knYpFyHEUhc7doVyIyP/84LEYSSqHkw84ocJyyM7+SMNmxx7DGmr1+a09Iz0n3q+//3dE899fuNse1/WR2/FQGterZ/A8+VFYvaZ/qUYVsyxFUxhQ8/FCgiEN9zAQYjKoMy7yR5hKLB+EeixKGgIYTD52cpAYfonoAQaYmRxCqYBNkTymgELKalrLI7c26cJtexl7NWMYPv8qv5veohnvDW54k5iOqGZTuQE91jFdE4WWfEkLIjq2g1udE0ETIRU0cME7sFBMiFXigMmwywUHURQ846KA+x45oZ2bbssPf/zgsSSJnHCOBDvBnxpdY/GIdjORS/g6MzQMTaLPbReMEQDJgKYFQRlkOtZMDggwW4TlrGMEg0kAgANZyxRBAVfoIEBmgruRMzZgQ+t0t2jD4MxtYvfJt9UVq2OMJfLmdx7tfcf25jap8N9m7OOOrEJdCgRE6Uc1uHiKlBDG0zRX7n2fmocSF3rf36rgp7163Z829LxbXx+0vm+pk/vOBFu7Z7e6F30zuPaO+2xRUjb7O/aoa3OL9l8TBoJjCnMzdshDAsD0YDAcHgU44EAEwHA//OCxLwoOP40AMd4AWMJijN0BqEhNL1mHNR8lyYYBFtBIvOPEmhzj+GDu0tlctMQKYphVVnzr5ujB9nS22g8zjmX6tudawnKL8saosiQLXxz3/a+pOJSUuxUhTvls9LQzaHncjTknSUsoS53//L6q/D1znMvh+ap0/fnd8iKKMV49aoUxj7FI7HWvpR/rWVNvXK9aWq37CZeQQkAAJUAsMARGMxBAwgKAyh0MAsIEw2QOiYAkLACmBIHMY+AY5gMACKLmD4HHCYQiQro9pumRwX/84LE3ymy8jQA7saZCIsBSwwSJuTL+Z8VBKXtXyYY81FdfR5rltDq3v3qZ5J/Oq0yk/U9bt5RzO7hcnO7+z+OIdzIhTD0ROMUSvZn7IKVXeDqntSowi4YsmRCpLDYHOx9+oqNSjQyG3Nz1nOgB0XWhOalhCM0M9vHPJQxGXh886juad2JWO3Js+5Wnm/XBSWmcTBJOY0AaXoYbEADIQGBYQGLHrnvROGDwDmBYDCApzEgSBCAhgwCJhadxuuXoCEIu4WCVMikEHAFZeY0BGcqbP/zgsT8MOP+LAD3Rp0aGaYw+Ofau7Jjp6nDnpLaQcvptX8rSBFtPn67e/qo5OGOo/V1qsGPMBL5cm7hZjv0B7DHHoGhsnTeUSUZrvBnZH8lJSKrPZAFgix7a7J72p4A6IyhpI1/NJS+EXjGOZ6SmXtVtnlrq0U2MTMqK7ks0pV42p0VFbjVRqloa+bE45bo2W04XB99to+5g32yN6Ym+M1y8s70hFa+NpxKINAJI0mAuAYYKxSpphArBgQJgCgBGAoBqDiFQgAYaAYMDEKEyKQi//OCxPw1NA4sEu7MtQHAprCmAsCUY4ATpgRADBYEAjYNpUMziYz6wG1BhriCQVnSO8I7mtpvKmCHdoNfGO467Qs2zu8oOayxx1252z+qOtj97XbmWOFF2xYu46MoGJ+3V8WRg4tdiBIcKeT0g7ubQE4pTN7mwYu+hm5MhfSkc8y0IgVrq8Z7SeVIZGRHhZZkR8bsTaZIJuVICMz5XsZTN3iW0Mgv1F6Qzz2p18jHZAQAEjQCBgEgAmDkFCamAAZEEaucwBAVjDCAnSvMAUAgwCD/84LE6zIEFiwI9oa8Qs4cyjBQHgkwiXjzKXGhkquDgcY0Hb5P9LzBZuYFbkJi0EJAU+buyL6zhuZ+0XXss4RGR3bNV1Od+N6wrWZPFTAjJOxQcryp41zxkMNOILlKjGqyovDFkKz3KUlSvVSsE0Li2aQsXaUaq1evQh1V3tCfz3UxDx6cLxoOrlU9dhu9NcyOfN6qX5eybx9z3SoyVW0u8JVVZ9JFdvJq01Nel5grCDbCTEFNQsMqoW7MQlqPrg/CBILLlgXjCcI3rJgSMIggNv/zgsTnMfPiLAr3EH3AKygNEviFdN9rACAsDGhgycKb69MGFIdfUdMMIWL4Vmed7ixmW56UfhOG+Sft65Gd41ZzHWXBwSQUpm+MKh+z4inOL2yuxcJ8zueTwp5ks/Pb3h/fPnw1p0itd+7Q3fn5FtFp30SdpZFm59Klbn8Np3KwlpEyT9zI9sjPXMrsXuWJK+xqGfqvOkJmGAMAoYDICZgmIWGlsGaYCwDRgFgBgEEIxOQCUbRCAKBRSDBZEFHQFAqAGGAqGSkBOYHAAAMCICwW//OCxOApI8o0CO7GmQZZJ4mbflCZhuwrmZRni051LdIi6681iVA7Uaa9EqOcwp2r2KWjhV/G/QX9bnpHljTVrNWjLlxSV/pRj0IfnJPlIlEsVNzi8pfn3NG53IKPicrx0FH1EVcHTDM+u+rMMOcs9FLMmq2S70CK1eXgjS4MQtP4179ss3GqnDE6cx0zyXSE89covM85XeHvLeyuxsXrPfTTNiqisqpOvbR07CQWjlUi4gWBEV842kIERgdBoBE8zBCpySgHTDEBjiEARIVizJj/84LE/zc0AiQI9oy5G/Hj5Jf6BRYmDjvlyiMmSZJLYJMRP4zWm1E+RP4Ee7GeQ9gTG9JIpeytv5Wpffnlb8qFUX1GELevQw5c7SoaxHTd4/8ZDj7vE7cu2ETnITRWrsdRSbiVbxFvAdag/Inbk+Q4RG/lUMj1dVJD4RemGmC3huaudPLkNzpa5gsz5o2g5U/rTagwZjZPISqg6o4AwjAUwh7I1ZIMEgYTAQFyDMDAenDAYAgqdpkCYgNBEQAAYGimahk8YLgKX/HgZBAAU9Lowv/zgsTmKzv2LADuxplxCaPKoaMKgcba9hGJdYzT+i1rqT72fPzT5YYlgqpJoBlHbIzOY2Lo8UT3o9gsk/INKB2Pmia09WQVUKTVYSWmicvOpKLzi0sgtGoknBndMZqxrSBBgd+oupN2/BzaIk9DcGIImWIxlH9nMqt8lNiyp1vMiyBQjOPb/SBEztczPowEgpKMnKspgIxuo/QlYJulQAjBQJzE3fD6UkTA8BEhRAI5noByqUNGGgynHQnBA2hwBGCgjmygzFAcJ+IWmIA17tw3//OCxP0xe54sEupHURDWxM1Q8E9t+WrIw3kn9FPvlQG+VupK4OnMqzzWsM2k0v/K7lPcjtXUql8PbqWAMi1UWWX+anHMRsiuiVLJb0/3unUFmqQnltCt1rCSi9TXkoMBpmtUmFFld8OycNrGa5zNZSm3NtOpmdhqhtvQkr7jxymazSj/W17x4mjvV9s+XvjxsN7aflPV9N9iIaqQtbI9qgQJGH1MQU1RpSjFZUr0w/Tg7PB0WCp0QoEBj4AaYQqAIAH4ysG8tIkeIhAMJhzSEdz/84LE+zNr1igS7oy5JgKVfVwqmDYKPvhswQBOX3vjcWFd8lM8aM1u1x4VJjwxmxZZs8g+L3u3eYJ0R5IGHupn7+LaDSd/HbXciA4UQNRsze0sArBnBDOf9iGGubum9pvmK+kKbjrEMlhdNacQtXeMSlDJnCn+81tmlzpMeR25MS9uxT1u59KUp93SZ5TInklMjO/p2joqgUhwC5fUOEPNaUCIoCjQGlQKAwDAQ0IgSASYGIWxkZhDgYGISARMRgE+eNgUVwuAU6QcEqOOXDKw5v/zgsTuLKwWOBzrxxBZdkhhExQxPWFgaaxSJLtQz2OglmvbVI1etPXIJtXuKr7vfTNlyp0+N0/KuUpvEjbl1jBezu0umnCoWyPzsfjnLLQ1K7uaWyesjBbPptEKQrXtSrbdTaCJs91td5EFrlJnNrpGoa+3yHu5m5QkkUml71vu6WB+7d2blGxSijslEqnMU+9qV7zfe3rEyC73JaMgudvenMLaLYAoCcmAoMGshE0QwdAEDOAgIDABBSAwyZfUEgDGAmGCeHTxhUFiICBY2m0l//OCxP80dBYkAPcMmCF3W2KwgPFiUWdmRxVCndfUGllyaTJo3c+EoFl9FTkgDg65uUQ9q7nD2WXGQWq2tDN+HIDFhyMT8Buh2VBJBbh3hi92ggXB6DYdggrUnU3EFryZW0jkLMDMhIJ2CTOPV7d0TUiC0goNhZxvYwYKg2Y7Q+iA2WpRNKpE2DwWNe/KJIihr5hAiRMUXuyB5uhtDcG7geEHYlRRUCpDfpXjoHGIuNncZEGDIEkQEGDIQmcoEAAAxCBRgwXZsITQODVGswMEY0H/84LE8TG0DigA9wZ9CNAwQJEDxIzo3CbunCQuTi5RpHzNrNyJWJvbMWL46IQchxzmOYXuvZbzp1383yX3repjC9csXJqnu6UxYtBQQaOMSE49rJsjdMnhupgbmyON8JTcMG5IAXHqJmd1faC4LKOQiIQhY0SvDJxzQkAQ1IMow2xsXXCGQPc8hFRgc/NkFoXA5mOuDoshx0iUy9jcwiLTNgbn+YggomwQWCoGgGg6BAUMAf1Mvy6JQXFQCBJImHobF+C4JhUUBwAR4KEBeZgaGv/zgsTuMeQWKAjuhroa6iKNBUquk0OGIZkUDHTOMqhl+Tli0YZVIFl8pbKlCiNLkQCYTSy/J5M9TT/5/Pqafa7Hbp8Wg9honvP3bc62q0cJXwtnyxsDHxpfDnkYSvDPrPh7UjTmx0miMn03Q3+9xeSkXmNt/e9PSbvRkahfpdTGo2/PPuS0Whn7GfTFscfGUDyVm5Ayz3bLUXLPSXeY9Fra8FfVPDEc2aeKx7fyhaw7lUxBTUUzLjEwMFVVVVVVVVVVVSpSX2y5XnLFd4O8K3gw//OCxOoyW/4kAO6MtdGoGAoiZxAClhVDGPAo9pJu6h0cegU0XyuufuKggSq/CuYhDkshuPQcztyKKNxsA4gPI0Z4jRhsiDDCihwEDHqEFye/e/z93Mq8QuvEyOQJncq8JizRf6fUXBDQABhAIQAKAYEyyxPeqVDzTrCLy76wMasdC4aTEy3W+3Ym1hYvORgEkrDq84TVOjmYAATxhjDAmJiPeZ8QYpg7ivGNg2UaSQsZmRFbmBIDWYVAh5iBC1mTOOEZSA/JmciMmF2EcY7QVpj/84LE0iWR2mA+0kcoJwHREGiYLomhkOB8mOGByYwEUYugUZBgoKB+YvEuZaCOY6k8QgCBglHQtMTAJMIxsNH5fMuRWMMg3Ag0mBQFCgGmAwIGM4VAo6VHwYAxgEB5hgApgSKhlkUAhAQFAuAglMCwMHAfEhWMWxpaGmrVRzL4rtMSBeKASikRgqOt1aQ+DXrNC+zrAQBRoGoVRQzMO61RZ0CRXdMyRPYtGprVl8MLTX5ATTyy7AAG0vhMFnccQVhWJPafP/u9a2NRkJS7DGxz2//zgsT/U2wOJAj3WN14mt1a1AprBBBBRhxZmLHKauivSaxZE267m5FTJ2jrzeMsM31yB/dhdd6sULEuxbbKScXaml7UvBzc03YK8+u+G+U/Pgp221dNab39kryiLKqMBAQhg4FxjkcJxARhmsERsO6ALZAw3HsADWYSikFyvMfEWMLfYAA7GGg5mQ4MAIlTNA4MJAY33xjGIJMJAYUE5kUrmIQQYGHZmEqBQNrMCwARNUUISia9ihKEV3mGgENAljYEAhnwWqeQPb+D3HHAQYdI//OCxHU5gmY8DO8QvS4WoelrvykxILJTUfuCpc8AJFc1h3DtLuc33CtTYMm+Z5dq0wr8io88FrfZHQeGSaNPgtpzxi81Mwrs8j5PYogROnvmiJG1uqCaeac4D99ujo8q8dX/P+ROp9a3W5fP/7Y6qf9GMFulwZxBPtQQR/+bBLKg5gLgSEJkhj+AhGNwCKZT4RpjgoTmLEEeYdoCIQDcYG4P5gegjGGgAoYwYQgCNgMIBc74Hg4EmGXcadHYAqoKACFZCBjNwAQBohmJB2YGBiH/84LEUzWCkkAS9xCc3S4Z4j+NCQ6gmxoENQLJl74qFwQAl+vNxU+vzUrMWiiN0m2nz7hCESxSyry9k+gEDEr+z3u6UVuBaoAwEiC3IoOEr5EuLXxSDhUFstYSD3FGcleLH/8b3d2iQlb1+kStco1dJHdj51lehlCHUygWxM3nlCOU0OarXW5xK2ZB9we9ixUPS+RgeACmKCPmYiAVxiJAUmMcG8YSyUZi3hImGSA4YDwDYIBnMEcDYwMAjxU0EwTAWx0fGwWWpcMpw3uEjDUKMP/zgsRBNXpGRAr3Fp0IcWSmqZtIDvI2GVw4EBNXBMHb0TQBD4qBwKTTTuL2PkmmKghz18s3kUO5go4vlP3HUlEpMDhaZiUTrU02YJBcEUX0+9zdcOnCovfMJRDHd0q07duvciTnsyimVsWcypn+O9e73Xbzkz0x818QvOq+N6bcirV44R99f26C5/KeP/2+dS/lP3/kHP1/nSaY5J/8HkbodQ4IACMNxNMxrBNKSGAyOiBnTORqzrcuREFQOBowWCAhBwx1AQ0QRYzxBYwRHO5o//OCxC8vgapECu7UnIWQzAV4+MFON1VSkQwvk1p1ipVEDWgQwwPQyEiGw19W0+xuTfVULuggFjjeDw4zRr7UodszwCZ1x0MqhuOwAZEE8vvN25FzCASbv6pfztc9lCdQmQ49CXmMyPsxipZkLMDxYckDHCzyA4GUhkKQKkKFWGWrDamgyJFdwBTPPMXRRrO5V9DGuVi06tTNmzWMAOpgAATBIUNkYIyyXgqYTWs4NafYn3RnoBGDQMIhUXBGQ4Z5yxkgVCAFgsIo4F2inCOMMDH/84LENSzBpkwU5uC00FThZUZCwOFLTBw8gCBQGWrcZ6SgRwb60yHE4gwCorYshx1we2ewSYABSntuYoJWPF0usjwi7gFZNO6aGhUfdiHFpad3v0FOZN9Rui06eQeLDCixoXFg+aDLZtBNJ0MPZWuLLuQqWUprhukKi5kNenzCj3vTW0uxjCBoVrYUDKpomYNAUZdoAZXCcGEkaWE2YZ3gYOjcZfBGYCgMFgKDgcEATmUKZmQQOmDnBt8q1IVPz2Q43+ACEVRF/QA0w+0SiYOQgf/zgsRGLDmiTBTu4JhPyteAqCmVRD9YiwaPAlNDIOIIS8c7q1UBADEN/Z1JQggltMdWyYFglTKpFNM1LzPOlYVRq6zd1ntdcz9SCVsshUvJCxxJhJ4UYvTUK2C5e4MJ97wXc1Iyoci2s4Kf3EVrKbdcaMQ1sCJvLAn/dBEFBKANGTCwyyIDfoyNfyI4AXjFQpQzLTBBIGQKZ+mpoEGiIzOLWF0gFjIyMzLFQjSuViFFRuhfQx0EbVPxk8w6SHAxJxaa7ibKP+aqCAm9H4pzC6GB//OCxFkqAbJQFObQnNP3b9rC4WfptxbX4otU2H8/vp7zIDwrfzRE/yNQU/+GgdFvcSdc56SYIOQLBge8+dAVgrywsPfF6DhMZYLwlMOVR4x/7l9JI0qg5EiVOYkJ5rXAAg8bcCpRTgwVHJAwZLj5togGcQ6IAmYTEIsMQKJjQFAM5ggEAYLxCIwAMObKFGKXhhIYuhyzD0mGHWAUTCEjlR7ZgrObujMid9ZiqkpeIiI3mlNFVo50mCIrjZouUKLm9ka6wHkumvqQpvREei7Uaj7/84DEdSwZylAU5tqYtFakJS69R6m5w2qQU2dcsI3pGtDS4q8WAogi601UuoVaPL2sAgjOSa1aKKURaLuanNgks0gWYppEiZJ1AaskllAWCABgBKEDAoENSl8dhJUCIkxmgjIdR7AwEMyq4aQhhyhtYLaiKuRMzWyYFh2eMUip1OyKHEmkLixp21OkDazKJWu3sBwBft0nLtxy8O6z1xW3mR6XAaO+rGKhygjPV1PaTasUkra+lyKrkLGHARimRIUFhpN6Q4WPPa8yQJl106mv//OCxIcnybZcHuaUmEwc3L50Y2nKsmFwo8g6ABhkoNF2Cn0MD6oACKa/bbw+xwzq8Says0Swxkk3ZEMJSpNFWJG0w+sIEppmfIU5URqaApI1+M3S09WUNYq00Lyobgcvy3TPN7dbU7Vlt3G2NSGaUwnS48q3Cas9lKOKo2cTUZaa2QQrIdkOBcnY7w6SgoSMGS5sofl2CIpoVRULgM0Nfonxg5VtNYeflshtWpfYruGkljDpZ0MMskZMQU1FqqoKKONRdiOZtHKAmMEAxnM6ahP/84LEqySxtnB+00VIB3J2ZUHKWIQCwMXrN0TxrDEg0NSCYRJb4l8OaKWLbmzRDItG0mYYsp57lKiZtlEQmmupwbgBY381a2JzmvlrkPM3WIP2HFbea/W4sB/DxDUpX7x7azr1187g9LBC0AnQoWHiY864fZa9EEioSNWTBsWeIhhh259tpPQ/R2+5nxxohXDpFihYoaoKpRL0mCImGV0VGZ4nBYNzB1wDD2wjGMFhKTAUAwUCYFAGYKhoYAzgYWhECBmMhS5StEWCH4hznWPGyf/zgsTWJqFyWB7enqysykDecgJQcYAWjsDJiOKRUdEDFaUVB5CRCRhIPSpKF04lA0Rm7EyGDVPd3JMrgkT1/idqlqJE45c33VL2pjdl9qMKc1+2efaU3NNHFAVf0Rskt220FRPEyzV3XdxCPQyKqFSV0qb8sNpWGWpGn3RNSLKb0ILihk9xUgtT9exdqYQCQBflgGGpo1VMFaQTAYJMQAw6TbhKkGJQ0cQsJo/hHJE0bUGYYMwqOkRE3B8bm7gOYtI5xVSF8wYbTlggAMkMDgxn//OCxP8xGkpAFO7QvKicbcLotSg0EBc8lERYGdpI4qiJvskok0IaBBgIp3LIkp54EmbsxQjQBCLfaXGIgIIzzfq38eblzL8+6lFr6+OfWePNvDeWtGSUuMkH0SMtWHkPjCeSbF59ZhZqvm6U1YgtIKlDTgy5BlyERIwPxU7aMZkL507GKfuEZe21BeVZHoAjVIU6mcqQMFQEEI2mOfGmXwzjRdnR7WGipzm7x3GM4vmAoGmF4NA4PDCITQJ1KipgsG5wQOQCFQFAobeCCZIsmED/84LE/TB6DkAU5tDYGiwAJLmSpEBwAhYFjDwTmgCgKoVPUkUBAKNKCNYKrYLAeYFAvKkXQEEjsw00HXIALn4WK1+meoGgrNzDe161ZR2zYu/r57X44arKoT3O9q4cuTbk84HB/1fQineU0rNxVo/K33+9drEMn3wjdVFTaosvb291wl669PuzZ9jkczFmSQp8tl7dt73/vRtGQzLmSinfxiK6Amp14XUAoWUwLXCWdNrg0Ai4/8iTG3jMiAA4aHTCADMOi8eDJgcLG8FERYYwEf/zgsT/NVvyNADqBa1wyWnwKBjBhgB3lNbJAwyBXAeYyEaXiL5mPBuw0QgtOCJvC+oRlq7itGCBFbVTLT2o1AuVjimVLupSWIZEYEr6N7lEB0lW5jym3zTsHiyY4pp50erl/8w/5IDQ6uaUlENHyjCb/cJ9BUCI+He29kv+c7D55cUrpSK2pPlM/S8irnPv35LMp53L38s9e1XpbhDufCu9hti2GVoJqRTuHQ0Yl5Q8JTA4APomkx1NzUprNliAOBIIGZgMEkoqMw8gyQJDASU+//OCxO0wbAZAFOLHaVbgUhiOMCXU6ckFkFEdhRi7RAAiBTQxBayHFNR/XbEQCcgaJIZKwlApSrJMCCKKOPJhM0ji4ZYTfeAYBwunnXgGtd3ywu1mHWAsEJZLt56Za2mLXc/vqIhVzbXOiU2FjwESD5AAhA+MPE5V5wACgBBriFBBJQBsJnbZO96Ep2r9+lvcJs7qA0LMWqwCgYYcBaasvGZnBaIhrPDnSNBC4Nu0jMSCOBgOGIwimJ4AmDAZmwspmiQRmBAjm/hLJ1iBgDOYNzT/84LE7y2BskQU5taYKXcSBZTAWAxBtqLhQWCD1LcQiYcsv6KAJCMHE8IJCWsCwsZCDzIoSHBCLqsKW7TTMBEwFTco3I/YCTovSQjOelypsr+OG68BUmFXWFiVLc+9jSWeTmPP7QZT+G+4frdsxPcE4Q1fYjUybO+X5BGPYs/hsywKoVoEHWKZSyohoVnMqXVP/uZUM6XMGIyPzvyWwsxZgrkZ3N0p502eo5mz0WY9J5SGEnaWKWUWyBcUm2MGaJGZh4BHG5iFKsZtF5twBDoAMP/zgsT9OEPWMADuxt0QODgsQBM1tJTNIVBhIMApUHBIUXyeRi9yF9OM8MlkcaADGAoq4I8UmmkF/zM6FSRdIEupdHQBuQcPQRO3+6ZZZ/crxpSIZZyldu3i0XeH/hyP2t9wyzetoNblzLLQxcfoCRMX1j4CcLhg6iKAQUBwVFChEUnBPaxjiU/FRejRXS8VyQ9GtPaz5JFFDkDnsWxTxqzNTEFNRTMuMTAwVVVVVVVVVVVVMasaTdUdDjWvYOigsHmkfxDrGdHhvwOsYqkD+BUE//OCxOAr6aJEFOaG2DJuYysIEYScWQDRMVWgyEDMlfS0MctmKmMpW2DAvJ8EgLVA3AzQndGUNSWBpDfAEzterv2RdMRYW4QMe0rNfTKFqnpqmLLFtV1+WaV+r1//9NeVufW7D8NSHq5vTiPFSjaSjmvUcaDQoNeYchyBAVUBjIYY+i6NRuAIgsL+Tsaz7tdLzTDFyNy1CAgfEg8NaW2M6g0MDBUMrp5MvS6NdjuMCBXBQLmB4zBgkFUAzSM5DM4DjAkRzWIdE4wShRoOC5ngURj/84LE4imh1lAe280scgPCU0zfnpm5aA4s2jZIGDxrDS5iAJPtKBkHa6pgY+DXxwLMSC5tZFNffalTmt3p+ZnHhCwVYpIF7vBIW9zDP9RLu8scLqjfcP1q/4r0wmpv5oGzSB6wJDiRFW0qcziEc8Y7+G9PFfXl+jh+HIurssUuqV5yvqIeavvF3mcloftUrNfFmKrkue7xrmY0A9tFtREAQ4LIEtExCDcwLC03PiYxhYc0gGA1JD0CA6YQgwTEoKBWYDP6YhBKSDkYgHWAQMMCy//zgsT/MuISNAjuxtmBauzQUfCIVS+bJTkUNGgVDgGqvyVSAaCZQ6YEAT8jQCBUSTRFmGHG5iIAkb1QrCtMr1vbwl+cGGABN6/C6/Kyq2XdU2eMTxw7vumFyfnK+88f64ZmLoNcExV65tGq1XOf3/kissNShfMnOwsv6rOtIkL+s5L9lY+k6FuT25/kk4Zz3LyTL+WsqUHq/xndCfX/pkc2nVs/SgSWFgAYBAQK7BpcTGQhUfqfpiLGmsVybfOhm0ymRxKZoHxQRR5emNSQDkYc//OCxPcym340AO7G2QQiY7A46JDeobM2LEvmmuWnBYUxoFRsFX8RwI4RbBBCXSPXTMOJTNJgQQfn0nAiY5jhQw9EHOWnYW8kOH25QJCmlGACBASdlGLP8OPu1+/yley0UXjyJ4Pwnarrn09vs3XDX0rB46ilEOs5yuIDhFFZ8IZzmBMcmXFgJ0NEpnxhwTt15JppItVJqUDjMWJuclsDjxFTTP0Fr2FQBBgNDqkGIQFiEGzXsZDBwgTEcaz3Y8zHkfgoOIiA4wJBgLHoYECADAX/84LE8DCp0kAS5pbUMkkkUDDw85UIAs0WWLnICih6Z+0FYqdSdifcqCpEglAiNLI6tUGAEiQ4GBgrWohZtX5awhCXZrV5+wUAEtMBH0kaKzSs87qhVf+FZv1dASp6eUqv5QZf3dY4b8GKi3XDLTQjQzR36vPdr/fppdQusTVNC32nbyucAmLiZZE+pYWLukS/dsF5HdXF5p8GQywNJHnxxowqTEFNRQHpaZW0ZPlmLICIAvNhhSMNiKMaVcOZELEASGHIRmAYDiEEObXQywMHQP/zgsTxMIqeSBTu0Jw3qbRYBqCDzszl5SNepMcoOUe0lAEXIJ1TFYG/pgIWyAyA5geYakkrOwoHI0jlU92nlEBl6ob3TWsk+4UChUF8wc8Hc2YR4WR9k30MmEfaiyPsyz96qzzHzA+eHAsBiwJjQA5qE0FgwZMrxSbSpCoiQQa5nH9EDUwq6wd6Ti+6x1YkFkidp99QikxBTUUzLjEwMKqqqgamcRgpSJoKTiyGQFHa06YLeBgXeFQ6ggCGQw4SgVJMyU8QwdmBQqblCjEhF3Pi//OCxO4ssaZIFO7afADqNgwG7rgDzZ2FrAs7ATpFApyzDDUczhnl5xF5C10WZXCqSmnsdZUw0clmqvK6wkwIzREWtwYbhaPnqurang8ee7unH64tRylcVTFag/lZrb+IfbuJjjrfzfrTCLRv2a9+/9te1rZsfhe3jHTEX72zCqWAv47XW/+7Qyvv/+G+A3WX7dTKVGDqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqBuNpOCYBGhoZRGbxMYOC5sJkAksGJmQfdCJgUJn/84LE8y3iFkgU5pa1g8YOMKgIxEmAcNjAHzoPBYyVLYGPAbslw27SEAL9srNuFlcTHhUtERKqHgUqIlNok0XFJ3dX962+iJ/9v706NkQgRKgxgI7KMRo7Zf1DyIz4mpPX9zT7/7VUVJicSlSpNzTIxLgmXDaGT4RIKFj9b2LUPxS6sGxVbGiWy6vTHWn212kBeyzXzFVMQU1FVQwRDCgzGeJaGVgNGAowGXr4mJIMmJSQnzpEGC4HmDA1RdIkytIgDEYYKaHuUIsamAZLHjZKFP/zgsThKUmOUBbmlpjCgVtzATpORGQ0weWorKNF7XA5HAwYcKYhcDqLGDCN/hQKMOBpDlFqtfFWUw8AjdJ2rD5cp9wMMpd9yvK43htPHDCmZ+YWLCEndHJz/VbV/sa1dSaQdbLmH0yu+vh1V/yda14sgUYaQmVuXadcHFOAMk1rHUPalS6mC8Os3aR7IfISKIqnIvcKKh7TaMAwXMRXNBw2igVmT7pGEyCiCKzOktjAADjEAPjCAAgaDYog5gkAoKCoondG8gMExwBgwVL5ozur//OCxPovig48Cu7WnKzS2WmusZkbHCEKLGlOzEQSAOby0ho5KKIEBdKqIxp+AqkH4X9PSGQJBUq/TDQV6Aqgdi7hVc6mzmnVqcr/0eohAwvp0Jv2Ik6fluLakEA7unhYq0uut7m4qEjW35ZaqY/jPXoYzNyKB6X+Hyv/ln7JfZ1FuBQ5Njy9xuL/v/sn/UKLGUbow/9HMQSoF1CIJgdHhMy5goIht485h8U5gG8508ZhgMLRhwIJh8AQCBIHE6PEeYLCSZbFsCgxCxTjTomBpfr/84LE/zE6TjwK7pDVRrNVNjmcHIUVJ0klFCo8CZcDAwGFBTauaTquJBctGSwD/NPgVvoZjEMr4KgeYzyoJ0iHvWAS6XNSz1dOOMFSPDPLD/zpcaFoFfPLD7Qc/gIxOk4oLSQUJfUWgR3EF00dKTBjnRW9bJw6I6EppARJa9WshEhqIuNLn+rFSNlzOwzv5nF9j5f/tJv//IzwX0ukx7tTEuuFMQ97aA0cA0RB0YRzgYiC8YEgmcoq8MBwY0hYfTBOYRhMIR7JhIMAgQKpaDQtA//zgsT+NTPGOBTuhtkMDtJ8WJDDmUD6hqj4XfcuDTYWmAGcgcbU6GRl2pIFyIvuaypDgG/qhBgoBBTRB0QkNufwu2YWEGT/1N2LwkARMwQBQuyr1kxu5VHz12mX3ECgPBGavaTh7WOdyjoeosZ64h6z/y8pUxx1xfPEc269/XfvBBzxLpSf8k8sg9B4xV6nOy2X+QP/6XWr//2mviWV14DtTq+Nh2/6qsqAqCAWCc0nTUMZkMDI8CGkwIRowXkg40U0WGsxRJVO9OMw/FASNQwV//OCxO0xGk44AO7QnQGNbQGJhCEQJgqbDIEUQwJUHqptyMi2MCB0ho0kUGR4EkICAw4IOQKTAA6ILvGjGcCw4FQ9/HrheFWMLlAxhZtapIkDQFuQ6XOBfk+KlNWxWl2/p+/lTZ7aLJs+65ldpMP5uP4TN/We+c170wb3SQtpmzmrPHiNDNqsJvF5/5Q/K5fIaRL5yTi75f5PenD7+Rf9csy55G1tP8sZvzeIV3Vft9NQ52lqgMhTtUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVX/84LE7DS7/jQC7sbdVVVVLbskkoIDAl40G+wPrS2C0ADng1l8D2xkfjdS5HHoKDV+2rBxsZha1HSyYuFOX6RTkQvfnB6t5UscYcKbJDQtjtGj3LqY+u3qNfZBXbUxiIEFQUGocFIEBinRRDkaz+TQ1aiLgncbDDWijmCy0BKcQbpQIwLkUNS89kVlVGSx5ZFZjZaG1jUkEcRYAMxeiCDDTA+MAoD0yqhtDAlAdCAfBKKcwIgPR0BwwXwBVWmGAAMGBvmBkCcYcAVaswMC2DiCTP/zgsTBIXHSeB7LRt4awnEBCOrcj+D1zhBAz0xtiAOGRIBSFQbPpCJhEeWFMkEgsYiGmCyyG5FWuy+NFD576W1jmAgs6YQ6NA5z6NW/DGnt/na//jcczVVfOpYwq02cv3a/6nN2su/ve7FVgQK4X1Mn3KYvZ8TklI6sDyLNjprvc9qnr0/BZGcl/LQ9kuHNy+3/uJrVr9pWOrqZnK4lkkiYX//2sZ/xvuuPiFM1TEFNRVUNOxxt900DVXIioUjjfakcKxWjPPRC2JhAoRC7XDB0//OCxP82o3YwCvaG3cWEU5IscmAyqZCSaMEclllCYiATMBAoDs2VaerkdIQhbtVpE2PFMoSH56lzzwqTL+b1vun6yTcBZaXDZVFLL3fTz6CpnX/Ir8Ixq9pVSxAcADCQqt6M5F0r/LF8mTI6XlV+83aVTp+c+flqCEJJMFzVQqNeAgEdpJseG7qzmWY6X6iCCVB860ohBIGGDAimadfmFgwgkPzG6agYbpifP5ugiQNIAxyJQwfBIwIAsxFIkiKgYE8zINQeDMUQQxkAEw+I5p//84LE4ynyplQe2sdkSOGY9DC4jcDIgQlyK3EwgWC5xd01dYsEbSoTDiI8vgx6x9YdpqSYrOkEEZBTUk/RCwx9RImNAa8r7PX7ecI3dv/+PaXdI93MdZ1cZz/1nM8psdZa5U3TNsAicoZ5I3kkk7in9izSGXHy3PDPhDasSLlFMjKMfI6rxsssHE5S1iKrJx1hxJhyllOV3XMvqoWbwiIZzRN9llXFkOd6PiFMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVD2/l3urmMwFFm6thlP/zgsT/NkPuMADuhxVqWYHAJ+gRlwqDxhhBaBH1ligBgg8LGCDzM7UPLRtuldD8PqD2JRDsblS7E+ZRnnLc1gAitoUNz9P/pcMEaMFRPCEY/zQIM3LdtJAoPeHuEHT9KEjC8833/Iuq8BRfl1O/aSXqlwq27g+iUCH/u6a1JWg0ipiy4GFDzGPXyC2UjHidJHBkI5gHVQIHpggPxjjYhmcWxgSMxxPFRjSdwJW47uQAxzUAxb8I16MYzGLcyqIcxmEcyMQ81ZAEmBkwdKoyPDEz//OCxNElUipsHtJHMCCRMkopNBRWAw3GLw+loAUDhkz4jyShAcSJvnM2RgoeDncILgQAo6FY+2xhZoKgxlooYrxDUyXgelB1kiGwNAkDlTDACZ7ZiSY1oAESYzoxF8oi1plygoKd6aVTUPR+X2pc7S8kxH65VmqDKLzT9Q0MgA8ETFL2pr+/y0LWRnwB/ZzzRJGyMYxKlCIiPd0BJNQzDGqIBH7zaKg5TzhodRzkjFqTTssPVaRJCVjaHUz0IzJUR4sI+JbUsSePqpwskI4xc7D/84LE/0AEFjAA7sb4ZgG5qJIdTRpvJm4kUcWMJhATGNHEYLHZiUKG2b8eQFKc4AuFYQQjzmLlJCqwnFmxLG6iANUREQScflQIqk802n8lhiHqV4cwZbEYdaxJSQEnAuBCWNKHIcardtdwoXkET0v3TNTHbZaMyNgXapDWy0CUHEipdlulRNxApxTfVQapOzNbU6971U0fpUTxSxp4yJHYxraxRDd6qlI+MPdRm6aJCqF+otr66mIVAfu1HjAINMbQ0xWDTAwNOCgAiJwgShzM9v/zgsTDKlIeTBTmpHwCBJpdfgNQixTMViMMDJKEDKRJQgAoiBzPFAGYAbhiEMBETfHBBhETVmdNRYxMAccaJq0tu8z3BDkX7jI7ePC36Sxyk5TR98hE2PTcUVIOugpJAdYVkWq7JFIdqGjWaMqLWJKZMr+tBSkHqPRqxLXvMqWBWvv9quTcwwdz767/fYg2zP3bLcbXL0EE1u7/6z3T/b9fU74JM/9ZyDxpvi1lDARBCYLhsaOQEZEgkYdCCcOE4YRG2Yvlad5hwYOAIZYYqagD//OCxN0uIbZMFOZg0WAkCjEhUQcG6mAtWRhOBxaUFPGMCAY8l0JMwVguIw4SLlBiGG6mRCABb9wTE8iBekY8UVxV6YIkoQnHGsleY3aD7byWbfxyYrSNlkyAwJnhIoY0q99JbrVSQkjKfvGO6/6lLcyVqr5Z8z5O61dRdUjesf3Dmv/g0UOUq/VM6BEdmRAgeT7ETMym8QfMpn5kyxNC0G5fp7Ei8t/1KFd/zVoZ8OoVXcyIjIq5ZnZnn6cB64xOIn4f9E4ghtAqBLn/zYgDDO7/84LE6DfLpjQK7kcVIEqQQgBu7CSkphsaaSpF2DcVzNpQUQMpMDhxAVNQmb0lDhnYvOYveHQYIbnLIgYARH4KY80cQtVehQC4HJc6tR4B4TMNgc7OtTFIj5NPgRwCkgMENq2TSnwN4c56uylJBYKeqk603DCNjGPREocQ8EDB8VGh2eYgfdQfCJc+F1Hagle5CheI9c+L2mkWHIZHuiQUklpjmrLpFl4s+drqIASMEQZMh6hIkADhHMnl0MLiEMS2DNuioMOA4MYAeMwRwGh4Mf/zgsTMKZFyVBzemly8ljEQBhgUDM4rQUIooR5mCASmhiMr54UaAALCWnAYGMyUkXmEiRa83mMHrzlmBIflKBZPTCIwFwb9A0EuB4ZdTy6JY078xcsMlKtkgtMO5OxupfoxweTBJ21TWMsalfOH0x8tb7zsu73rRb2U597PWudxKEgsY4hHDTIq8KIcP/LW5Gf9nkf2D3+8WqPtMgmzIZfgUyP2cN+3OZmtMYHeDcLu4rzoCPQuvFZQQR/UWv3VApFnlMLg81EWwxNGAgcYkbYi//OCxOk1io40AO6G3TEOBUFyEGi4EFAxeFhQDmE0yPEEKgAeqbJyHGDsRgwBtMg2raCASjaM5MKScaKpRvsYioGGhqarmciK6NkARBy2MDFWTmOpY+X3c42OgHrqMMh7uOEp3k8Kzb2rvytWIoEFU32rN2AuYull83L45tQMBwRF0h5o5iV3uEgsYHmGJ9CFHK95ljQyOlRRGF7wm9SjbRMkoyyTnQgwmkPpOC0896pMQU1FMy4xMDCqqqqqqqqqqqqqqg5v9boZdwE5ggo4Zo3/84LE1i0JokQU5pa4Ig0ZUx7EsCANT5SIuCUBKPgQKEFQuMRkqSNevp69uR27XkckEYj5Mnms9TexEBLoehwzfZ/4tJCzw4vpjaaTfq5iokrEOP3Z33A+9h2YiZ5pkyebr2ygyjqkqDxkiHWHHyfAbyhXVnJf426vfN8BY/3//9t/q/v0/exlo7m3c/z0F8L/2hvR7GcAoFAHGGgPmjZdjUklQCTVI1TCwIzGZMjOUdzE0ITItkjUYcDChiDvj9jiodjJMJjSISwgUDBwWzDgZ//zgsTRJXmyaB7WVj0xDGYhJ4yKFwwqCkxdIwaNEyJHURkuY+gGBgpHgSEIJmFpPi6U0zgKDXsLMERswSAytE9MY7hAzqkamGEBKDvpH0dlZ1dxYwQgDBjAIzSgSYQW7TcfmZSLZzI4Ya4quMEjSIAgo2VoE2/kldNaWXXAe8UAGQKBxC3Oz7402t1rGETuKHl23yt/anpZSTtqnvzD8Nfd/P5XOU9SXCjzBCCcBce9oWaZESwoowtH3l4eO/d0o965qVhmhbRLavvifmXhN36X//OCxP9GI7I0Eu6RGY+HtXfulXcekzfFX+zqO3Lkg2UO/+ZBMs+lAA7LP8XWM3Vs0GATECABVWMGoEwCeDq4+MCjkxOYDQgdMFsN4yD0nDJeB1PMkQyLCFYEGIKbC3Jgb+NRiKRAig0AMMLTZ5xZau2SSgxgjIg4qh9BNojFwQcKgASO8CwUKihjM7ypaVT1ZwYxRF32UJdwJB8CzFHzCrdk8ZegGiryy6paytTb+2LPassMBEVw1Mr+6PtXHfeWGfpXUTSKaWvrK3quQT2UO93/84LEqjvSwkQc57ZgpFnxSWzFeJ77zDuO8NOd3/5r+b7/65/f/meOP/c//3+OOv/+f/Nf/MP+9oQoMvEimC5gNuvGm1zJ16altuiQWAGs/WAbVQALyoWAJgkXGdKEZHBhgcJHChIY+KZkM1nLRIDQmYGWJm4OA4cTbvOTaISQxTM6SBQRCp6AtBRswaDAoa54IQC5hkIUbRRpmqdzEGCJCV8YGEN/DUCIVLrFSw5FJDhpQlIObt3ZJD9mmmJcFgUFREuXM0HC9apr/Xji1qbKgv/zgsR+N2IiRBzndmBP7Wzu49us2u6/lswALbf6v3J/uv//69KfGDQZreqag5KMr97OCJPljVmpX3LWedj+Stf2esO4Y3xWFzIMAUcaKvFBDiIncVBcKb0Cgs4UnFaW3aiyrWLn9SFDp8eG1vUAL2JNaZgECRi6cgOPUChuYIimYChcYdkGLBmIgDBBigkGDBEVTODKTMkH0dTEIJwcCEwJDi+w0DgYIbUAuErW0mDh4IOaTDksFj6JBdmHaGNM8d4sDzYxIeKpZ4rtW1FYe+zT//OCxGQ3AsJMHu6W/cnd8wwGcfG72r9LhamZzPAICyzPuXfwnf3+MwVAzbY6vUHMc92fzuzSbGUDRjPCr9BvCrVpbiXc1Uoqmd1dzLIBcdT9hSmtn0Htm4e5s8RLoiuuKtl9TVw7d71/WslP2IE7/uv+eM9bH7N25q/9m78PN3jrCRPRegE/JJHCWFMNq0MBoWAZjAeBYOEgxM0AQIAgENZkkNmAQQaQtRq8BFqA7enUxAoet0EZZSVYQGIvDRol8FspaBBJIbjatVq3MRlt0MD/84LETC7iBlge5p6UJWpMKZLgjlzK6M9o0U/wnoysjV+rZn7R7BvXx/jLceds6xoQ9GRvuFNn5xnej0FjutUtXWMQ1ffPO0UepKb3vOvbXwkZh4TaxDbSoMOUlRQaR3F4sdFxOk/5IHwVxWJGXCxocBgAyqRicqE04cXWlQDTDhguChlwCZlaApgMIRhcSpCPBMPJpUCAjCAwEFcz9AUxaCo2DtQ0kHwxdhMIVAEDmCEwdyIyiQ2RGFoxk7R/Hhg4d6cp1kuGvgo4Di8HFjP5y//zgsRUMdIGQBLu3pyIROyFSY6VZGgMdKVYZiaqvg6NSh3SkIiRB1G6Umx7jJeVKje/eHgh1WJfN1waF82ypQJ1bxfU7rF8Y/8MF9FkzmD8X3mH4TIV/x8TYz/8fDfp7tzpUTXqWLEQBv4EzDDdlXTocZYx9VauMFEEACH3V3PlVRFFz+80yAa9LwWOYGMBgGYQKGPAMDhYwFmYGC5pviAoFFYHtuFgiZr+ROMZIgR5yjo+f7OzBUc/it8svS5s0MKLmV0Nshgevj7Kjt5lmE9O//OCxFAsygZkPN4elinU6v1qE3ait0WViEz3r/+Rv//hGYrrz0SbjSLXybgDTNjCoh/MLfl7+Sh6GNDi2tH3uu/nWF24SQuxkk9wgrOBK+KnxwcD4nRDbyxk0RaGCb1/TUjc9RocgukkLQ6JEjHnhioA+l4kOJs99mjAiyM1oTTAK3MGJoxeHTCQGGa8Y3Cxj8gntLuc7M5kBYbKRlAeF1QDCKmxEEIRpUGNmq/y0BvrJLXPL4M5MxByZEQya1N0KZ8FoID1g0aHBwWWdLYJ9Bj/84LEYDHiCkAS5t6UhDKf5sGSA6CVTiMPKJDoi4CtfOr5CAW3LGi5XBga3mz1Nqit8L8HWN2+tvREJ62tGreTvavIhmOeIGIW/i+NU9ZVn7p+DL3kUA8CgMnpU1LY4ZgZod1I/71irpyzWQCJ84DihAKuGpoOTXXWiGQcxZxAQkLBAs3GHD5iIUaCImdm5l1kZ4NgkoKvAIRgxUFLQItCEKQkioQYOhiSk7qFDNomamwdFn0VlLMApLE7UPUr0QaMAAa3pC2ECVNS4WMojHJdLf/zgsRcMppKZB7eFvg1xHjTdJAk9KZVM08gRAYDKrS+Zi3IZd2TSd2ZZboI5Bbw2q8mjS2VfxO/h/5ZwY7vT5x6j4d18iheeqvmd++WkJX0/+917qYbiNymCxphEUSNMTc7WlKhcDG+RXJcJLGsOkBc6SYvFazJIQGmPTUFKSRyUv2YhoysYAIWJeF0wKJRnFfB7gDdRrGPTX9EgsZapRv6W9IidZx6KwXGxqWYyxmXSLLWNXsAl4p5x2o1qbnb/d17AwDUL5dTdSRmqD0HG6yW//OCxFUo4lp0HtNXaj6tk2E9N6lUHWuJoEMZr9jIb8zEtd7dmDyCHO97+6fazSN9oTwpUTV1Dn1Tl2hMZER8dBla56UcgRA0bCKy7Nbv5r7yRAWSRGkAyAgE+YVQTckkldnJhTg0EYMXTQ6JJocS3JhyYvAayYa+8cQZ27S8GhRIYNArlYgbHUEZpiDgaCFkdXTyz6oIllGjF+tfGfL3ARObvtbxr3D6FFerRNfeMQHpKL/EOshc0gjBlTFNXUUxbpyszVXrXGoVNGkp3qU6Dkj/84LEdSiSVng+0+DaqW6kN1q3Uz86LHimhhhocWIy9h0PGjzdZ8cRN9wxCqZ6s6XA6hzyMkHzCJxTVQCZbJHCQbCqZBwIUBMIBYcIAcCTFAEMJCEGzE0IKUERlRHBxqT5LdMLUMKweiAYNLhHWwxKGGqm00HxKTwwAVMUXfAu79j1FjaWfEAYfleNixIbHZTmIpB2qsqPLzZOI4DnYc5jrrWMdJbY70VLUDEOq0vlZcoqUtPbxqIDe7V3qMDxKZEbT5M+D7y+H2niZ85Y9an6tv/zgsSWKgoGXB7mGtChjXJg/0sdiJr1skuohqYgcw0qAAtjjnE5g7EDkZxBAKgUMGmgygGKAowDlBiCQCRq88ZIFIRh1r0q+Hvmcm7SPwyNImWSIxhb0elUAjOrJWARK1OQ/QLBgFCLqNN/XsbtU/7wixDAxevK89bvXc71GUDbxmDXvlQWmc25K+gGkv9hRZJQ+/RAYDlUeh7mOrHCsxdkOlCkNG1irTjSAeCIqPLi3dYhLkLpTK2xYaBXlw82+wY4hMMR/asPVQErJJGQkIIY//OAxLEqCh5YHt5UnK3AYaMxMnHjCzExwABAKNDRURQeDDwAY3UgJFeYFBcSWHGi5KUYbUmWtLKj0mLZWpRB9OEDo0JtZeGhjVi+/AcqyFrUQr28LlN/ZJPEoMuztkvLzlhpBVUCVNNqJWBQaTIKE2U1hZFG/rKiRn+lG3PD25ECL2w5nP2/1Fy8sIiJmRPLi0w5ouou518sPdOXW3oM8TuA7bhArA5O9TsXMy+tTEFNRQALZJHKLsnTvhF0ucbIqMO0nlfNzAioBzy+JtNZFv/zgsTLKjIGWB7bV2g21FQqUqBkTTZzQLIsrK85RTlmbNNL2lBbJSTJoxqVxGOrKMUXTIIRas7qyz+0kudYmZ7UHEJi5DQMRaZxT+oHn6iu3KFv6CfLmojOpuriKDRdUPM0mshO2SP0Vnpddp2qLWiJer3fZlOtoyLR0JMD3VOlI1zX392r7J9QJYXXMDne75/a+AYCqgDqZMhE81dKTPYlRPNZgcCFsx+AzMoaMKCUxlQjP4cFg+DIAHIZyTJwFVhC41JhGxYwIiB/pOAGCRyC//OCxOIpivZYHtZUmU3zpJLGXr8OXofYUFcPOUsumhkU4Wm3GRCgSgv34er36GLQYKjod36fel1+U1rJo8Uwzfy9r/5lVW5jv8sYFJmWGAmIec+wvCmkhOg/Yww9qERwJI0kyN9ZqnLsbQjQ0/lW9W3m3V/RZxyuqqj+6ud0R1RaTm6Ob6q6n1/1ZPyQ1bScIEQyfGUVTEFNANtKMxIRQZghBk0ADANMcC4yABjddpPi1k5EOjArqMDB4xMHggtFUIhc0Y5QGPCUq0gIACmwwAT/84LE/zDbpkQU5lTYBAIGBAEUQCBgWC2JqKIgmX1tYW8vN2XubWH3cEsjTEQ1eQUwx94IXI9nOUhUDs+UXMCHDA9qvvHGX3pBhUvM/2wA3/wI0U+zAyZDKv1SzWefPpfabkMlkZhwaHx5csFz4UOFGGXClwCUbEBwYFfzDji5hbEvvHWYreitesoazzDCzomEiZQABBVMQU1FVQD6aJBYLDGMfDLgKwsG5hyG4ULgGRKbXIgZEDoYXHMBl1MRAZMBiJMChVNsHMDrWKYZG6ipg//zgsT8MBHOUBbmlpwRnCCgQuTBEaKduTuK7jyA4WwAo2LBHm5KazJiEQBRrvEquH84rTQEYIDLLNfJJ9JmyAlg8KtzWMYx7JR4B/J5/kSzAGV7CoR1+wVph1faBW4Kbr6QGwinCUUdUlj+08/MjDcFTZEio81xBbZJFQiFYuLjHmBUKvNpKOQ+R2sqvtrLumsXSGajakxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqoQZd/209DYXJrOWAgAGEAaMNEk//OCxPovmeZMFO6QnHy4CAMh+PHxtwMFE8kVTE7BfKkIBKi0zX0L2y6deHKvM0hDBgjp1cu1LsSRqvyCRW986xfvP5Vn6iIT2W8LeX7jizebovRUE08VfhMUmL6LFtOsIjkExVto87xGs2JCYiKFHA4bLEX0oeQBgkPrcKOEzaWjrXXQ3c8T5rFhMxaADYpeXeAxhNKqAKpkBKNhnINgGW5QQwRGkwdBEzEYo+gD0xZC4xJUMBOKYAgUYvhol2Y4kci2NABgKCpCDphsY0rU+a3/84LE1ybh8mw+5gqclOC8gwAayu1112mpgg5qFwTuUszyNJlDQ1rAyyjlTsSEQUGELFfGUxVm7ITCu1u5zsiu/ZaM7uu093LC5YqA9XzAoVO0H0bQO/w8QUGJ/ueE+35idaxPeuyLqaiOv+vvviDaf7rmW1nIlp5EweNnxK15IBoSpAM6O/MptSOQ0cG0NDx82fPhlDaaYFQEwPEQx5ZAxWDgwZA8wvKYwxN8yWtAwrWkw/HEx/h0wfBsQBRnVOJKRkpQPsQYVlkQilBwcBgwaf/zgsT/MSJ6RBTulpyoKApiDLMsvS1VgUXcRO0ySXEisuLG49g98ZKogamJrGBwUPEDSI9DLKjNgltI1hbXK2CbKx4MtlezahOI0EL7Ch1rfK5qpB+23XEJPxPrJmrXga//a4W3u8y2+Leuttc1vr5trXkPRyUuExUWEIPGs2oaHapB8wLIc1i6SbIhQiiuuM6jSnqEdpFQoKGUF62tTEFNRTMuMTACe7UqLumRpumKgBpvGNgYgQYTB9EDp0oTAoPRGgpluCYUAgwSEpDYzmTa//OCxP4ywfJABO7efLnkdAXdX4M1A4ZnwVWUNfeDpmbgWPGZUPNKxPrhUnPbAZq0GheOHcq1K2QO/eb7vZGr2MAVoDFoRSGIQXcwt77NHwG1/qoxXA7RBooMtaNEaKQdzP7ovRb98r/wF8kGFVST6pfq3SZ+8b/zraTtGp6of6451E0L5WtdO01r3jb79GrMm67d5H8UTEFNRTMuMTAwqqqqqqqqqqqqAuySM8BoHMrJMFJ9JgmZRhgKGXTyfrLwMBYCRIlY0AALKDoFpHEjQIf/84LE7y0B5kwU7laZwkyrISUKeeFETb5qb36WdeAscKCMVgC7Ty/xwYMZsggVPOhuyRVNAVT7/4gnnKRGaTVKdEvSE05Hv93jBn8oM/KCHTiv9Qtypnbp+HMpVkzslea4qz09S6tV+hoyrxsnhij1pLpvj+Yr3L33MPCdbZ8ew/YwUcazz4tj3ujM3pZcAF0j3tl+fypMQU1FMy4xMDAACRtxnIyCjKD0McglM00AMjEA+Mj084CNjKRCNAOQ0CEgoBDDwxMCAMmD5EglKhkBQ//zgsTtLFI+VBbmVn0AuQ6w8VTMZeiO4DlOJFM6QDnHkouJmMofduEyVZB/4AFELjch+I4xAnTKaekfyVM+jCeEKqyuH55/79DWywjFRGXyAHu/3RIoSQWff9Z8lm7KiS7yolbIdfLN4C/rixsn+49X+eVv3/yLbbZ8V8u3WF6s7x1ibp+cKfdvh2+72EM8euz5vH2qxgCWlUIUAA0lB4z0AYxBFYxfKc0NhMz0e85YLAyeCMyEXowUA8WNk3fmUx5E4ySBcwEGADAcYChAYGgA//OCxPYuscZUHuYQuWmxSGN4giziHFwhTjExox9GMnKDBAsFBK9BAImLS4BUz6W8DTIcLAkSTPa0YiCC1sNFABJh4JbAoOIhc0kzC4OWxjCwyOoFABYvQGAEenHUbgqiYODL2pYi6sauNhldXLsotL5YZ21ljqmTpE+FZCMQUej/FY2H48Kb3uxet6texuwYLmWwfhQmQ3UtGEmrP09gCe1g4RMeDAgIDGDmlCJ8oPPhxoiQdC6noCKH1JvR8tVMQU1FVUAJy221n1EJFz3CTAL/84LE/zsZykQU7tjYpfRHJzseHSSFi+TICyJG4Tp5xy8BiTdZfMqG0jdlNb2WOoRFwcYu7s/2YVo3G736rhcC0+6Bowr7KFybto3RCERb+nnEBw6b1JXLbMxV3+a2/4pulc/CF5ypeaM8qcz6QhykXLO1CNup2H6kSjeawZQ7bLHUDmO3DBjlJavQmOtf7481Wj59DuIAuIomGYQGZQvGRYCA4FTD03TeBHzn9kDYQ6Q4NDGUCBqVDEMmDGzzjGUUgaZmxkAQPgweScOi6QQQjf/zgsTRJWrmhD7Sh08xKNCI0RWfgz8ETycx8SQCEFIYEdG79aVk2GET8tsITA2MxKAIwItVe6bY0Ehlx6JIGERdqHkBRkYXBYGEV72JuAAaRMulzcpN2xDkHf0vwF2Lde+PRzcd+i7b9pWmf/MrXOSX5gYk/1fdZ7miwJiRggNkJQMj1pMCSdmO5bETLJYvJGy29NTv7dEqytG5F66aTEFNRTMuMTAwqgCdbZWkjgGMWnAw0BBEBQSUDJHCNrsQ1iNy+JiEkg5KpemtyYPNkaHC//OCxP8y4c5EEu7enNAsNEGgRkZwoQT6lqE+AJWTBaKNWn9Fh4kJMvEeeuxy3EnqJBFdyGpb1Gww9AN6mvcetAJZTas52c0pecmt/9r/HWIAK6/klfxLNHV/0thxTvM1p0LqJ0a7KYNeFAfIAMe4o88PEvFQhijxi2WtJikuGAgt6kAyW9pLaOQ/aCQAexBJxGWQeTJVALkW2MAgBUwfxFxYKxCYBhIDCrRQMOIGwymwHTBCA/GBQzBkADMAkIcwfCmxwFswCgDjAFA1SkEYAZP/84LE7SxZ3mAe5pCcgZh+2AVYFHC2DEhZ3kvzIwFl0oi6WoIk2cHKRZaxyAwDnnjFBw2QLS4JRiGJbaXyZ8BJBQ/SQuyjuYIMvaCQds1+UyUQjVWLvBF62cO//6mtvQrrf//1BJeDFUSuZFB3Fqq/ld8hf9igpxSTHyIq/dKc769PuDHoeSPjxlkZ02k7Fn67v7eylZ1G0WubvUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVATkjbmFpmKFI8PsqMVAjPVw4BFNdCP/zgsT/MjJqSBT2xrxTMwIzGhtdZ+CC6TdxJLOiXsajijKZs8kX3JfH2vn1cLPOMCL08ox9sQkXappBhqUK31v3rkFsu1DLq5F/L1/2V0nAuHTH/b79gJ1qbfcmO42d6zljZ3EOzzoVe18dMr4bnWqHhEsFRAcQKi74OvLBAHCKFl1XNR+1v3tk2IQZ3Fe+gQFTY1LUqgDwkuMh8YpN4YygQBQoNHCPMl+DOTnrNgC6LtmNxamnYNmGQJGN+LGHQbP+ZNB5Li5ZgiAodAZhUSpd//OCxNonihZwHt5WfpdAw0DSQKpiIUZA0B20PguZRMBhoIBZWBDAkOdeAH3MT5xSq+6LdaR3zdgFhYFhiCX7WFOgV2BVqMS+BIYMhZndplKhc/NMylNvl+lzYU/WfNfySsf6cCfv38mqUnlTLPgv8ldME+vvsCpEhWYYZVcwsJyLYqPzu4liqPDNZGlLWtZreKrZ0YAaB3+8ZfVMQU1FMy4xMDBVVVVVVQAbI26dQUIYQhCYGARnUkmHOaYBU5wQ5mhDYAhYalBJgIQmiU+acAT/84LE/zIZ3kAS7lMsCAxhB64HREi54OYNVjyNsRgwLEIdCgaFWoKWIDj5EkO+VhVd2ohfVQBzmELJge7G5oiOsEilPQbqExO+u+K51cUH71SO2uYyWv4gQgQ/7IHdYkPmE/6MROzzZXSpvPMistI8XaHCVwstynC9EgaWt6BYakhUQWiyhiXUiBKW4rQhBEb2a6+KxqVMQU1FALq1ACoCJhsaYCJYEBkYwC8ZcFGCmePxh5MBB8MJDKDi3MAgvMTnHMYQYMXBD5SgWDzCgsBARv/zgsTsLDHeWB7mkJyHuGGFhk4MFwoyAUkrYTCQ+PVVlNbCqqIgUzxUHgGPJcztGVAIw8DV0iAv61Fb5MPBAXhKKHFnw8EbCgf2UV8EVKW9M2/yyb1GVBr/2H38BMdIw3+UWi6PHTNxkekTfSj2C7SNYtE5zEYek0KYW2vQtuPtfbASRZyGLRsP7lsKdosVdiFikqAI5WqyiQXmhh5BxpUhmSSZgpZhpjxR/owpi8HhkG1xhEFBiCFZrJDxo+EBgGA5p4DRhYBoFB0LBGYpraYA//OCxPsv4eJQFO7QnJEAQGQTm+nbcUbDPkCmaW6KM5nxKaCEGRV/bpMFT82toxQgnQuKLo5HIbBAAYSCQ3UgqHxwKMdC2ZAgWc6S07iDQHcsRGYu4vAXFzQrjHDw66ky+U+LiUnFndymaE03fWmzm2lVaxvLu1jCjjqiJEFj7BcgEVEFQis2XJ4GFU7l0ax2LyJlKE7kuciNP0JDssdFFQCaZgJgAFBiigwOMgdBswuPwwvlIx6p43XGkYBkyxS4yuBYAgkZ0sYYsAUEIRoajKj/84LE/zNR5kAC7trUgETARY5C2MvCgc+tkNUKn1SuJC1nbk5MCMCmGhGvtDJ5Wkg/MTKgEYIEw7G1+wxRPUFAUOPIcvSGs1QCBkgLXOJheqJYzt+40C7dfeerMeCMRNs8aEXEoxCBvUupGXcw5FY4kO5zKcjt51p8/rOPb6u7LQ7OqaypV5zebqiFRETet6Bxgcq9qTB29DL3XZUm2SUYcsm6aUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVAKsslgJQUwqawUFUlDChHP/zgsT1MfLOSBTu1JzIJYNFFQJzYEEJg0KBzFQ9MNsMBEFfJxQE2slPE5o0qJVSxYyIOOVCEBjybjIkGEhBug7qVIfpsWfO9m+NXH6VE5feO9YQQoDdWBdDXDacUE2rH9FCqj+i8iaRfUkRydn5pQ8MdLNjjQn7joTXFk5e2Dlfi196oqPd12tWn8TI3mos6ErWD3tIqgyq45giABkkdpmCBpUAwzVIoxVe00Agk+xKYxpzMGzQ/IDCs97RD4cKCZ9BoPCpeUDFp9EiYi0kSUk6//OCxNQmCbZgHuaUmGmFDU0VgsetOZDDBKDherbMemOiwW4awTqThYBkuphRd+8pZkAOED+AWIqDKKHLAzmGsA4hXKZ8siNHcY4unnHIN3sTaIkJmrok2vUTRpMPRUVbn69SSC9SGm6Cluy2eiaJuhTZAyPj81KC1BzRMDEJlRiLHgg18tBpTGgdhx8sXZvPzw+qaMUqiY1VTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVUAqtuR1RwAGAEMYLCymRngZmHpuYdrJmg2CEEGJF7/84LE/zGKKkQM7uZcmEgiMBYwxBACBAsFAaM3IbCj4Y5RhggRFAbZ8YHANfMhBlyJ2HfKBQDgmZEGDZuuLN5vQq/dmf7N3EV0KL3bvKEaBuDbGroa/egX8n6/qR5Gd/ycN0I4JPQDEARtkhIXQRXI2y+06U7bdu1n7de/rr/z/7bP2sa7Oz7UNka6ELVq7cFOcznW0IURgFA4BQwyw7TEyBSMDcAgxwwJTB+GzMTUl01VAxjBBCCMJom0wywDxIKgxiQODE+AIFBacfOBiMBrrP/zgsTiKaOyWB7ixWTIgpAHrMYroxMFjAIJMDCpgRdoxIR3Kh1vBkDGGW4FhUZreIyBHQFhNEodIBEY2Aj5IyPNK36bGCAoYaDL+R2ALQwBQEY5OFgvL5inepblDYlSLXa7gi2lCJCoFyIxhgghQZMQh3nMx4fnkCMeczLR8tRkOZUVa0uej9ezUb7z6Tepp0ye6aVMVt227mIvnMayn+t852VWyUCPWO4s1GE1jggQfAhFTEFNRTMuMTAwVQgS//bVIbESWud5TLA4wREMlNj4//OCxP84M244APcUnANBIEDB8mV03RRxZ+qmGEFLDDaGIGCTaBLTo01El9X+9TqbsRBIpXxkP+YQN94inmPqKbd5K7RZcMqT/EfoadOjbpMA4AeK+HFRi2KTiBPU8pZHLMNhUihjDgwKINkgsIgbU9AqLtQAWMFAnDgnrHqeuxCzo4/MC2ofJKbD7G98UpO2psjGI3KVAgAmBoEGISWGfYQmLRGGjKBmAOUGKe2G2T6m4xEG9qnm2aUGNhdmcCzGjpImTyQGERcmFQlBQbDB4Xz/84LE2CcRymw+29Ek03GEyzmU0HDQMGUwGCgiEssqYmCySgonuCQFBQQmXrCmH5FGhxJhwGgIBSYMkqwKCxiAGZ6zGYk51nYEWqEY6FqHNuIAQWEQcTCgOFQ84xYM7US0A8NwU011k5UEiEov6CRkzslVUdd13QmGUP00lN6BBoDRHhyJwStiGYu+z6sMMLIwwrfeOTn4dzzorah2TIovozTrS+g303edXZjoEBnoGdhRPfRgr5usQler/F4Ksp/793vo1imfY1xa+NZB3/bl///zgsT/QJpKOADuxTFfd19KAAllkfGnMUlQeOKhZjgoGFTIZaShycQiQ0MhsU22IQoBDD6eDg4nuacAXDVmS4OIhNFPEwcML5jEMFoorjFWlGeQLrEszZ4bfaxYYUPEGMGRMERxsEqqw42ty3SMzFYSiVeO8+lwt1rtUoPV/mVJbrKhHK7KSedBKhDnUP10u1SLJ6DP1uo2Wmj01Mj3YzapOVKHmHdy3s48+9ArvCQtu7KO8l3vaRTFmmWvevZVTEFNRQEL/t5hL0GmJMOvGMFY//OCxMArSkJgHuaanFQ8ygXPDJFcGGCxRts9MXNygIhaZkIch2DFygwREJpSFyu9VLu9MQACQKEBjLONW7fbIqeGRUqraljd+L67NWx1SUPaRfNcnhH+6NIqHuxutJSb6zESK/+df+vr/dKiZW1alb0anWX21O3lgRAos95OSArV5ho9G5bq/smTItipEKVFCkFEgF5BySgDGDOCiYeAeYQN0YLQGZhbizGEqaOYPx65mvkDGCCIoYfypBjPiSGDOASYqw05hXghmAmCkYGAQ4v/84LE0iWyQnAe3hrQARGDOC8YKYLJhLEPmGaX8ciFBggEmKCO0hNU0mdlFF1gwHAkLhW1mJgWbBV6Yxb8SAS6mLiMCGJysIgiZIe4WBo6B0dx4CZg0EMueskCwQCjG5AIoirGsaEUDyvuDgdcfwKEEWd8ESGMWJnsrrwcmgYmBT+wFunvy2Bam4uFgsHIZacOWuZfnMw1oET5evm1j73lN6lN0nlWyjVPu+mU8SlBoZSUNToXBs26FPpZbOZOxua2+HbIj/tbNG/Pmb8h7vvmtP/zgsT/RdvOMAL3DN1eVv+f9srHZ/nZ2lsm8X+zowKwodOK3MCKAI223j84QqkMwIZcTmIN5kb2AygdCACrGBCEFBRSEgKEBBUvbsmEZnBtnj6rjrStzQKF3hZgsoJQPHDKfk7GaVqiONG5DUqv8qwdh9yojuTE3Kvfz7O/xhbbY/uZ7hLLsjHIvDILSnf7vuZnHJW7o1zHOc/YxGuzJPN8ivAwQkFyZIMhYsGpVGrkahadRH76Ka2EYuUaZafPNScizS4rDx+g4ITKUmTKwJyI//OCxKsnukZoHt5UnCc0VHIxEDEztBU+0GMaA4RnWabBCHCqZPh0DjkbOEEgtQYARCIzDOMwedMzIVHQoyA1b1rpqJhGVTKGpKGC4BiRIao+poQQknPtZGRIOl2JAEwS0hOD+LudGrKHuaAIVEcAZc1iY5uWNyuTwgKRIImaOWU9L+VJWbKSB2dnWf6p941CEEVqq45//5cvYBKJ7ORj/ct2RKPIrLeGac7qF4dIpZQTeqRtJicu06oK1JMspewqmIe3+3zu02oMrOsX3MiRUHH/84LE0DGaQkAK7sTcbmzgwIMUXYzfnj9CrMXigw/KzKgWMNEzIv8Qgb2mGjatzEhY/G3Q26LBZuv0xUmdyHzOi2+8Djs5IlcWiTfTZNd/10O5TqdGADFGX8JgytyUwwr7DKu00CF4oASF3i4x44IQmhkEpCsnjcwstZQOFMABSrUpFErLqDJh6WTX1LY3WswF3Le4JExUHxawIRMw6VEgGavSxwih8NLmpN2xRJY1Nq9rWaBR6XLKjRMSOCj8vada2qoAvmVtLVGOF8YlBCZRsv/zgsTNL5GiRAzm5HxH5h+VGNqcbHSI8BzHbvEhuYDARkIEFCek5hUIUEjZ0ZvNhiZ1GYwQpwYCEMpYiYtDksxijhg08qhDl4qGcpYm/4wBjCADlCHyWFyn7Dck3nE4yqqlvSvjrmOlzXMm6qR33F+6QxwBON0FpKnuGgpTf8+xETFZ2WKbfwlPseiNy5CvmZaBXFi5ogBBuLUnkog4gatc2JPRqolvZtlbepDSiQCs9tvgMw8yKAxvjLioGhxjQ4Lww4Bg07IkIhKTc1c20VMa//OCxNIrwkZMFONHhCooOI40ZSwwIzMNSBoILbioUpaYSJgpYa7A9eTlAANAYcH52KaHGlkoMAAwSBIHZY+z+V6STU+dfOfVuYhMmxhWVrDmr4xwA4Oix84r9Qhvt+bvWZkNJ22bOxkgRFb/wORWY6mHDI5lu1Kexf6iYu9//cBnVrZ1KdHslTlUjLVERDh9+aLMxZyRgeI4qAVKbFaFNCKr1yZesnTVAC8cka0WxCx1MDA8GgcxmUzDJrMgF04eVkjQgOkxjMeFk3VJTqYiMFH/84LE5y9Kxmge2wtsDQGg4BNZRCFSUYhC40dWhlmUJQWBoZAlhn7lcoIRwkEYEBjzy1yX8VGQgALCl3QuBWKyGKSrGX5xV93Bp063Mh7dFWrQVjr4VMyQUAcC6zwtcrs3z+7qaGQYQx8+sbCMtPjf8AZQ32dNqllN17FZbQZnyiSJarbE0sV2OPrqBkQxO3VaXMyHZfY30ezfSytl2llnkla0pqF8fACoaQxkdUUvIBtxxb21uWoAC/3JiYBzGgJzEcBAMDBiKQBgIgJg6l4hFv/zgsTtNJrCXB7j1aSMBgFMOikJk/MMQUM6KiNASUBwLgwGi6oUAFhhheM5gUaYcIJfAEgEo4YBg0eUBlAEme/zNwMJlxAsUx6VsXgFpAXATix4SDxQXd915mw/bvcv6ibjDUPJYZp+767ct3BM1Sy8ChDsT1j8bNllko/XYqBQdes9Z1GpBYw/n75TEwFbga72a1Rw7f3nhJ2kNCnq9mbzVjs+YDIhCc5am6VmxlZnbdDNGqv32zstdEmkqh4cKhhhOshrsfe0Q9k00LpeVazK//OCxN44At5QHO7U/EINAB8lklZKCBChDAQCJR8DCeYkF5lE7h2wGQQYKSCG5gwLGrcMUZwejGIAwc7bSAM8MYjJnbZnRb9kZTmeZ/5p4woXcEx4yB6sghmHCACdI0xRIx7t0vVhY31bBIKKY2pLdMvWyfCvZLoSBZiV/zFgIffX8MHKedM1SKVpbX/kO9HWLC/tAcK0j2yzQxThf/M89f//j0bUDff//v8ff7eeRINlwMuicegeECLKAISnQzY0+IBRA59qkMIOS+h99ilE6qb/84LEwjByQlwe5p6UAAjjToEFTEUNTDwIS5Rj6MwgIwxPD412CUwJDQGmsZEAMFQrMf5tM5A7AgMLI6A5ZKfBoZcYk4BzM6IGDoDKAQnKEmX6ZfRgAmVrNAA4Ej0voWmhQeMkU1MAqKMUhjKxJ5mt2nvjAAGBsJnz1pupIhohrDqBH07OpIyF09SJYBDkCsksU886KXUdDmR5OKPo+tFAXgmpqi5qZqW9JS0lkI/W6nZS1VE5h3momIIb8SkPYVo3rkzk7mnM7F/7///1yl7n7//zgsTEM7JCUB7u4pnc61avL++izWsvwgC/v95qHwAfGg8OhDEkaCJwaIOrcYMYJdBoOcbGEU3rcicpH5AgEQkGmX4Fv1RaPTb3UGQECDwOe52kxiwZGkb7ybWvSP1pOI4uIGL9tRRoj0b6ialuoSclUmjS7/j4Fi5sh/rcOgtnSUtO63PwRGRF7pegukd6l62MzpvZ37sK4aGgix/AwxzNpetQpkR8ahaZGp7rTEfVTEEACWyx4VtGIhAI0pgJmjEtDYVD3kUGTRxTwBwqJDG1//OCxLklysJwHtNLUCgg3LcGgjea63ghDSa48GYW1ePQAZCA0ZsSqZCoRQAgoIRminLsuTJMbBJtRwCz93mi6ZOufBRDCyYk1Q9lqIiLmQ1s1jPEufojJTVolJP8iEvLW+2thUKTbrstJT1nBtUq9HTfQmqdSU2TUi8dqSNUbrVMVqE15ZY+56hRoRqGMSKjiZNjanbFTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUhCUrbbedSGbz0kGj/84LE4yniWmAe1xp4r2hmgKEEzexFQaUx2CqSvSSBVdStwGgPTGqJM//3K4Bbo3W1T2tXaBrsgicD18uVrNPc3NJDr3ucjL3GQPC6k6MtnvgEn2tgapk3Kf9yEyS/9UVCURZDoIqZsmFimdbMmn7om5cLjUEEk333ZM3WfQXUWKv24+HWhkcgObBqr2oqi73ZVxin2kEYRUCAsCIhRMyAFUZH0zFG0wXO0wmMU0fIQwRMMyb9M1ROUwsCMw+p8wEGEwkHcwiAwwnAxQIwSAYwyP/zgsTQJTKOjF7Bm2Y0MPGNMkPQMAoTzDgcRAh1SkGDTsRZBGGcplAmWB5LVkcraC/Q0JntlhEVGOawKolN2FuM0pC903FKoCOBBmjGEP7yt1yhqQQpZEhmCFBXZQtGTBjFnKxlDsAqrP9j23ViMHU2VKSjLFspjLvP09cBcLOyJTY6GQmH8+jOc9yhbzDJfz3GiCsTK5Kc6wUOJQ4YtAkESxW16iz0M8U60WXJ0B1iEOW5RJJhCgAI24ofAQGBSUHlkDA2Y4LBigvmLVOLFwwi//OCxP85GlpEBO7U3Fk0dzxdxL0NTEA0iAAwATJAoDZIRBRoubBOJt4BLSYptnTMvZAMFNaNDOHmBhA6/L1LHKyVJ1DiPgBjCyRhjEpTL3+u1ILoQocDycNxL8/wgu9aJCpQEs3FYkmWs6dRBCCUdanMFrwByIszNdeYi851roXRmCKxZCg66W56pWVMykl0mPN82S6j7Bm0seqnmkm1tG/gFaxMkQhU8MaFB416DwgkqgXbjruoiAxDGGQEh4YdJZggbGOReaoD7NjNSGOakor/84LE3i+SWlQe5pqcoGMbxZDwmB7S1Li0z2AQGmBEwPxNxL/3MzyMhqMxFQEy8xI0S6jcN7giMkIxoTwgwUSKVwIlQz0gxp4df8YwBWU5QTurOVbHRYFKCLOMCcrZb+5TJz8tcwyp+/zNVFcdez3//tA/PTqK2fpGQcN+y7YuVXSmXbPyzJ1Wi01b1S+uak9Da+rKdtz29bpzK6XPv9+vZC0ezIZ8RMvRf6saAOJJKHJFGQy2ZSCJg8EmAzkCUAMEQatphsjGJdccDBBhQOmZ0//zgsTjL2OuWBbmVN3hxVR+cuogwXbEAiMOrA1wyfMEMbI1c2YeQ3YkxM0lsHOwEwhqXQmXT0WPOMVeYRarf+5+P3bluMPeVYD9xF4dcxqSLGwiCPPJN1ub73vPltEKf01nqSb72rSPl1//2488u/PLb4x9YrIWm6e+N297Rs3XCDtbN8btFpiS1vHi9r1l2HlTVbiD4+fQxineQlXDqlVaN6Qj2PuqAAjjbiad5hhBplp7mUiiYTGhjgzKhMChYxzVDIwIAAbMsJsFC94UrLKi//OCxOkvkkJQFuae1IzshKmnak8xC4wYuUr6NcCoY0+r/GM2AJEYEbAFE70MRaSnUPWzBAHGdu7D1O89q3WkQ6eEhlLGKbDfIds4vUNLcJlpRmvW6IBimvWPcs5JiKW3qMxOlmtSi+71Gao7wjKUgtKgmnVqISqvTfoJFiazcLdEylD96YdzjvFM38PYU5qj2PiVTCVU93IP3xh7ZS+7b/323b5e1QAY3E1AWjGZRhjYEJAJupoYuQmdIBx4yEGJpuoc4MI+gB2Bys5CFeTOlnj/84LE7jCKTlAe5pq5ODQRTg4FYcYUFOkysxsDc7TfL4MTYikgKpYSyIxWcJCDGlYgYIUul8WjVWHMcJdLk+gg2s6VF/cJVhdbIhblVabX0VgJKtS0him9joYxXTQ3rH0YCyTmG6003WRQ4WWjOVI9TJlL7rMkWekmbXj9SbriQbFWNMCopFRzhOaa+azS7jzGr7hXcvVzKyBxAKC6l0mm1oZYBph4OHIiCYigoEC5xUKGViabZI58oBmIwaZjhBkIQDQJWg3BUyZxh0CGRjqCqf/zgMTvLfJCUB7eWwzl2DIIpV6BgKZCDSG7KltFzTL7ROkFNErdmGGvsSsprH7OF4xwGJD5XZ3QIDYYp4MZ4F1ocSdtMufv18Y3yy2JWGXXFJ2eZ44fOjRCGbedTBhFqvliVQpMLleP5/h2onjfpJtHX3Js9yAUhZ74Z7Xb79MzueQLjFECKB1bVGCQTY5jLSKhw29Sn1HAAQc2QmIs4MmYJkGqapKbawKMWTUADWSS+z0wlvMDCU6jSxUwlFMRDjTjgwQSMAmSLpVvMGDKKIj/84LE+jViCjwS5pcUhgCaJVtAhtP8wSIMhM5LwN0fJEeKTjiL7MRVAysMDSOJ5zdehDlHFVIt+D6Pw1+L6r2FVUkGGPkBOP9TEUSzVRpMb/7gd31ckuvySF1X3/qK5tRPLzSkJUJDVwzH1h99Oe6biaei8P4qInAa1a0NXY6InrZVReKaFOOW65nPNLvCBFLxd28CKSwSjwClJB0LgBxRycqbAVpOWaDCYVDHeIjW/TzM8aTDd3zEQlQywND0zIDw4tyM20WDjAiRBYjGgRYFgf/zgsToK8ICXB7elnxDBCMxcIDCYMHQMCKHLMVRHhE0i+M3IiJRWc1llLP3oCwISArmiFCDjBYJrTJ3dM8GIap43FnGL5oJjG38yECU3UUtQxaiIgFSgbfOBYLwzlMqgl5rzdO2tY14Ot//WYIxwC9Lna/W6zQtzUO6pu73dm7EmvSWWVeZXLNNn37trqwi6TAaKA/Y8asmu6l+Xab7bNH7auO3KyLvqcm+6UgCIwlJIHCQYCAiYtiOYFkkYRjoesiSYwCqYRICZKgSVgoYWDGY//OCxP01QfpIFN92JL4DGG4PGLJIBcAy+TJ5eY1AElW6g1VCIFAQehZq6qBRsbwKaGZCuxKH2lrwqHizp2y75Mla1JIbScEQ2CK8YuwCEBoKNIoKydJQUVm9gWA65r1yXKXPiOQMhN2SXUMIq7goA9F8ijr5PJZdvW7DSenVd5t1vrPT+DWlYkhgTsYeoHtFShk8SsJjTbYvBzXWdfRSirlHoLviy5SWJACcbbPEMjGY7FkIDQEFiAATEIZCf1RhjYimciKApkBQcAFAJCoOJnT/84LE7DD6ClAE7pq4Jo0MZWkmgWYmCaYOvMyDlReG6eidd2lomP/gJCFAkNz9ihgAsATOBIDIDbc5+3cWmHPoGkdLM4p4sAM2+RIkU5TYfmzEeGUXZ1lURh1Rq9RLtpAxEKVkdfOkCXDdSVkTZ0Fzvtd9BOpJJSn1szV6jTW1R2Ovjwwo41AiHmk2gNRVyXmBNgUKm1NSMuel49Rhbh1Q1FpOxFWunaZIZEPZjENjgcBp1MYhMxp2TMUwFAyZycgGzSJBlUoAZKjCQP1K/Cotk//zgsTsL8piVBbmmpwg0CM4YDQoMTaUgtFOhyX4ZYpccZ2NbwoNeeMv9FrIXAmsJweHCEI5mM1k2zcBJbNT95fbzMjEN1IGa3dn90LIB5LzsrSqTEZcwC2spdytJlrCIKBoNZs3ODJciJPpXnc6tuvXOHr1KcJlREZIBswlYwrcseEIkYSexYliMYdKCJ0UzTy0LufXUmPSXJi8WG2WXmVVtLVGGBSGJIEBQAzEkWguS5kElJ5wFhjSKBgMyAgBYwOCMw9RMIF0xUdMZVgwDZGj//OCxPAvefJMBOaanAgoXMMKwhaLqGBNJdlTcChMCPEyEsAQM0jDQIwMAn6apAmJKNqJLqHDpTTK7AaqgjI38vzNdVdm7TjKhIOGo/jSVN0pYBkkZi9aT4YFGwNqiktAaK5iSQvJEmnUucN41HvUzIPM3trZWrUv1I2QXXrLoLFQ2H1kJge6tVzbqkZFDBHfYKLbs71xbKpRzo5bHX1MQU1FMy4xMDBVVVVVVVVVVVVVVVVVVQDsjsobwxOEgUQHhMeBMwQLyE7Hgj6YfCRh9YH/84LE9jCqQkgE7tqckYGJ+mNg+GFNEQx4D1wN7EWzBaQtJYUGqc621iU0sPu4cwE9Ecf1XwyJQibIyoUnBLP48Yea3Y3UflccMGOTNLuGr/NNGbfvLDXNG5ZgUsbyrcjJDiv5NJxRVGpsxV+57kjVnspIqBIBWhYcBkRaekqXEUcQrU/I70pfQ5OdusN7YyHZEq7RAKpMQU1FqqqqpZdRAAzArtDjoXNNLigCkYy75DRyLEYzM9ng5ACTCICMYV4KiIDDg0KG3nS3YEDQoKnxBf/zgsTgKQoKXBbmFLgfkwAA1NWXFw4Yl8sQLMGq0FFSJfD83DjbOmOnzIE4LEb1dM9VzHAJsBEVpJS+6WimjKQrNVLPTtiz+MkJlVNyjrUsTVy+Gc3bmKesfTFAilPqTLyA1oq/W3XstFdZiMKjUC5I84IDWIUWeWJmnHj8xVAY9aDr3vGst97axuevNMdFmLxxl8DFU0xBlFtAaAY0XiAYHAaZwAoYJE8BV8Oqx7MKg5MgUDNHALQyMtxKMogCMuLMNUele40FBJEyagO6NTIA//OCxPgvOfJIBOabDOptKEdK8baMrs5UkPRmaARuXxCL0oo7EJRdZkCZMvZHGaqjxkjsglc9LiqWXnaB1ArB4T1iVcxT3Dj1qnmE05eEESMQMwxW9QxjZdZIkdY1myHRIzjtP7+jrfemfpaepNOdF1BMEyiDDnlnNWQqdVHipsUeNyJ0ML1XALL70I6ksDG0VGvIgax6TEFNRTMuMTAwqqqlWQQUYLmQEBykkZIieYJlMFSRA7ZGEAbmCqgmOAfmBAEglaTBcDwYNGfEoQOSxtD/84LE/TBqEkQE7pqcxAIMNRSgpUiBRRmCfZACv45l1YIwyuMXAACFw9lD81GywRjWgywLGCNUVjMjiZEpPPM0kaEYI0p8DATpETOk7Lc6BF2CreERNc6UjxsCTpL2M2TuTCOmRTf5rMDZvan33Us3ao4eIhsDlXlp+cbcWFIaRf+MciMPXNXSZXsMzY8U9b/FEX2oYupMQU1FqmVLrGBgWYxUJWSBIFGejYtMy14Tf8KAwhNMVUBOdpprBIGkQRDJmUC1F8CwhMOgUKKE1IFFQP/zgsT0LhHySATu2pxANMiiAoqApYuJAIcHANkDAiolG4StBfJYRii2WGJEBxRrEPOwVAZnhzg1pa9zEyYoo2YV+kDbpKFxqOgVRSZsX4e3+ttV+6vjOn/WUyfbyBgfIGT9+m8r4SPkVuIuvvuP9LZ+P6nGkBUeABRryl+SR0oWwY17wsUQbJu5ZBF3eWQN01RgpXkeygA/bLdkICCVUx8AMKBjCBkKLx7iiCukSyjVEc1sAMUQjdPQ2YmMWHg4kCBdJtBAaYyAqUBJDorUTjMI//OCxPovoipEBOaQ2AXQiYsuAHnJNyQtEoBQJWJLJQxoQkkrA0YttiLIU3kHDKMLQrCQW1tNCmEYan1BTzVq2KaDTUjRVln0h8BnvSSIc6vi43fdCFw40VqSRAhDSHtu5y6BIGFKO0qzo6kdHDEcJMP081H+ecVcrUG2b7xbGYaISk/985Y58/+8NcOG//vw34ftIBBtey/TXnwAZWkPhsBNpSKIA5wubUJGPNIF6gp252S0ZlisZcNmJKRoR0b3Kn+Ex/h2HI4hFjVwYxIqPbj/84LE/zcSbmQe3l7QopWTNy8oA0SFFAYDmW7pkRAh2TkRPX01AyYVaM/iJi5QAKmBgxyRuJELyL7lzLFlg0lflRV/qrapjGXg6I83FpRDCMooKSoRgThX9cByC2vLtLXrRB8b3NF4JzefccnRQScKUdtOVKJXUIvGp85v0/hQ78Lf7DAz6CJv/9JXu3KRBxWV1Ok9UfjEK210Vnox3qn6t6Rfs52LirrFOeFqTEFNRTMuMTAwCJuSWkVTHzgzgDChUATEx/JLPGABKQQXDBYOSv/zgsTmMCPeZA7ay4TzEctH0CBCB6Tz8N2MYKhkAZZQNNUfxQTR/FukaGAhKoOj3nh2JZRQww1S0ejlm56icK/eY/ggwaqd1esgN59WsX7XTNnG6870Pgat8W/jW9iDzK5BepnLQx2bRtX6MMDKtoJj/xgZ/FfqWvWoOLNvoMNJOeD6U+JFMEYqZkA0gHEvlTYqskKmqgiEBmaGkV+lBygRAj984TZL5T+EHja9ggMmZjukwGDYxHMc68Jc3pBAxrPMzOCIwqEowMAQwNBI2VNk//OCxOApEm58FtvLLjhxDBMIgnMOQTFADAoFGIwKgoLmKFgHkAJimJxiwHptQhxgYDoKCMwWBEQA6NBoCD58h5MBBJZWGXNyfo9HEECok5JdRladp+XCsQMREzx33CXMczWxF9Vgkk41EQoCaBN53aS+1ASTTv//1LH/qV3M02ojveMcrsseI3uxYR0wwPL1cMsdp2+v73xzSBZ/+iZ19rUoZViBxLY+wu6J1NVikerdjUyC7VSD7gdDKtL1JET0VZZJGBEFjHsIMAggcUZyUgH/84LE/zuKUkQC7pcwnaOHVyaYmDYCHZjofGHgCYaAxpnnA0FGFR4YTAoBAjXEwxKMsdImhQHQwQwfgHSl+yZbDqhRahYcv+zJK5EZF13Y2Z0TfZi3mEVa+ApzfvzQOnGYIDqMoTSZLTyGjMOafrWEoxmXTLM6kYGAX9B43oSmt6FB98o0VN+XToYaROrVnN+hQ7RFYoMMro04uPnSYqgoB5rNJQERoLuJtcTwvOOKZFFozNriyOlsguSVTEFNRTMuMTAwVVVVIABKW23KfFFbLf/zgsTUL1J2YAbmjtQqpRwAFOBQaR9aU11ZjaGVHlBlQWGJVlQGBBPwsGl0kW7zLBUU5xjQmwlRiaFosuURnlpo1Ii2I6Soo7mfWK623d10HHQRb58/6cyb2lw1dImjVhzyqh5iYNzGdZa8tTrQSRV3IgJTdCmbkSOTFEqcbaMTFJoo1ByMe1pTtQpSwTZOLFnzAZcmH1pGANC49Gu1VGHweGBDwnaxlGnPvG6BNGWAdmDwEGXZbmPQiGEYdGgntmVI4mgoZGFgZmA4bEgEGA4b//OCxM4kwpKMXtSK/pjI95hKAgEBaKpjQRGBB+SAk0uBkBzORgGDQsIRYFQMbosIcFCIqhhHbsJBcEAMGD1OhlqxWtNSEYOMRjNujTZ5TVzUQTJhSXAwVqVh+GUDJwa/qIOXTS1ZEslO8O0hUBzeUv47q0T2c/G9FZSkrPWa9TkMWHRHrmhLGsJpCa+kKVHOV1RzN5hG9kV5EW90UxNNWXflDbVdjl9WYobV9BBiLrmNfr7huos7b+e977759fPGfjzbv0oBpLK9ReA0en0DTCD/84LE/zya1kQE7xTdADngHM1o84gExYEEAPMQi8iCJg0OGpH0CmkZiDgcC0ODWUJRkRZIpO2jgYEKuVJMWutrcZ80EhANJPnSTrbmoIoo9z1izKemKOxlNhUI/ONaD5VHiQjOxDudq+FS+XOyfubzmNewGhQjajwYnblGAkPV9lHh2My7kD+sb39jnZupPoueWTqhU1fet6VQrSQGvaH3pDUiySaDIZPrehfPPcXE1mQsFgjigTWBYVZVAJuOT4VCRxIkNqYMcRywpg3tmfBswP/zgsTQLkqOYBbmlNQGA2ZEKpgEFioENC7Q0MMDH5hBQKGQEgepwdHFhCqo4X5MIDiASSPNBCEf81DBoBCoaLDJ5QWTDJfph5KAP4wlEybapZm43YAxjLbXJRuLmDjEzR0uGqUAC0M9mdfppuqmtbwgximP//Mw10HoA5rZhii92QsMsNlTuokMz1731NJ3PVGKm2opxVreYdmdRw5Li0cLFQdFazoxIuCYsCO1p2q8yKqTqWDDyQ5R2Pvw0gqltthrBwYsCgEqzQFKzHM8i2h4//OCxNoxapJYFubOvE0EBgRGPCQgNzU+M1IJEZEHFCflpywypQygqG0H1KoOHjV9J54GaigC3Q10Ji16JNKexsCRtJ8OY248jHPc3X1YCAWxmlZgDfMkVstQxkFOpce4RvnRcr1KwkRnuhcx2lC/+g77/z2UkZqtfRWE5jzUY+QbbMJig2efEZU8myNZcj29y6hRwmoTep7U3I6aTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqoWdfdLHCNyR0ohCxHMhJlhob6VhjH/84LE2CiijmgW209kJ7Bw2LDZIBmiUIObwEsqVp2WnAM1ME0LTU0vF9rlIguBaSDGoMAYeZMSRWDm1oXsVwV21+tc8nFc3ktOByjV37QgiIP1N8Kdj6VA2Fj6jTyEsJ530XmN/y/qTpQ2lTBv0fmtZJVrdJrao9vuag+DQZabNqHagaPiR9DCHj19sIxgAdFTs2VaaUlMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqgjf9/3hYAaWvKwIxh5cAMAykEDg5kYjDkSyoP/zgsTZJ4KybBbb1SjBkFwCiYiTw4KZk3z7mEHsTgRvlM2ey5CBv61pvHibgDSOXVXzeOQk8TdMmpZwK9VR1RiAjDWnUoGcyueaPU3W12CDHiv5FNRMaBX6FxIWp5v/Gnps1Tpo4G9WWlN3iduu4ytDud81k5lZuaj1Su/JKQLa57BSH7db2HafNQD63/FpSk6M6RL6lW3ItoChc01czC4MFWWc5JhnngGoh8YmAojBZlAwIhEhaNrug2UAjMgWMWApGYeB6HxiJ7JKggK3ACCk//OCxN8o2x5wNttPLTgrGZMymRRVhoK/Y4HPH4R7SbRoKgGnXmpVbk161Ov+BQzzc7KrU8ZUPPb5duzKTMpvTV7OgYVrDvdei/K8v/94F9TCTgFNQ8wwfHXxOv+g1ruVHl7HnmA0+c9yh33ELOcnVNnXW6nu9Gox1KK9dmdtPnoaimMeXohyu3orNTZDHRzXN/U+jJmkBKybg5VMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVTJH9/9sKHIZFYlSzABABE5rRCqBfBbhIQvOM4Jb0wX/84LE/zIT7lQG5o7ZBVBYIZMz0yU5RRcdvFprKhwRAUM722aCX8MyC3krP/AMnYR0VjRfvk1eerrUEBs93D1gIVA3JHo1ItxhbpSGC5K+J/8Po3+sw4Zfbf4tiG8WhX/4b6RAncYoQDdSFcY1n41nVpFivr/tP2mk7TfXUxtv8Xd1Pzev3K39Xe2DrfdmjvddcsXqTbWHjBIOTTWyTE4BDERNTkYSTG/SzY4ZzEwA0wgxUwgxDEc1Tl4yTdcQTArcGomqgDkGUBc+0hjIYoMVgv/zgsTjKeJycB7byzEDiiYaHBhMKhwIMLm0OKS9ECx4kgwCJ1nnwqRCsIEJKBHwJg2lcYqEbQJa6sMOCsoMH8CRmWsXiSlAIK/yuBbFMzweBrv7039NKk3R3k2TR5JMEgg8an9BBnOF9QdEZppWUOWJ/PouOgyQJ5GpLKIzFJupL8sFbpWSNW6nOlpOA6mmybgyIHDAqxjIbKO3IUhAdSeDgFW54ulKx7mjGegs1g9CTEFNRTMuMTAJpbdKUGjYoJHwwAGNqAzDLsylcN4ejiT0//OCxP83ak48AO8mnMDBgIHhUPML+kdjKIwAWARweJs4Oa6AgJfU6reh6y8LBFqTr7scuS04CJkr8P7JJddWdPSiWZYSuMW6lDL86yEru9M2ErZS3uOx0V2cuBn+s/5ksr/mzZxH/UXf6/yo/1abKegqmalBUEhA9p1tdioWnjWZY6ZSl1Zxjtd1lgqNLtLwyMqpQaVVTEFNRTMuMTAwVVVVVVVuSLqMAAw2icQQGzBpWDpKZGAJsUBG+fYTn4xAEVqiIXPbfwOAj32YQBGQn7D/84LE3ShKTmgW3pqYQuGaJmlYOigNC6RBUHSJSBI6jfAi80gGFtKMtXXMe5C5LahzDBx1UJchwrVYDpLVttLUwBiWQ30WOsC0GbJrnSGUEFvSDoK9+t/dI5qqqKfOtMX9pb6KV9aGVfqM0PZkyyl6TdbPf3dVqNDTO7WJEdkb/RK/v8BWMCA33fMtLjG/xv/RhsZ6inFMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUF/tdsVAgRIQgVEgma2YMRxiMLmSeeYPERh//zgsTxLXLWWAbm2n0CqgSQhhRcmBwSbIgrOZ89WTKMB6X81lZzpkosoFioZrVt8XNpW5mBWZUbyR6cl6Eu2ziiwpKpNLqJ1ApA+PoKWmeIeqvOka6uoSwt/Rb1qM/zA5yyft+dIpqepN7pcbj/RKaL0mZ0zza9vqRdloLXs9d3ZOzbtRU+69s9C/vTQ5+3S7lHqH0yKqlXmYHCYa4nAYHBAYIiYROUYivwYnHcctK0aWEmZHgKBg3MER+M3mSMvQsMSR9CoHGbARjQxGCQEmba//OCxN4owx5oFuaglEZgcD5KDl9guBA1hDrcxxbGkCMkAaTBEoTaOkdUVC/iF7noqFUFCpg1IAicOW32d1LB5Ke0HAfIZMqAIFdqcwjEvQ0jNu7rlOphPZ8s8uFgKllfX/+QZTqoWX1Cg1fYkhxbopgObdzKvogRI/Sba5qTxa9QwwxgfSV5Rp1r0selJOIx7WyCqruyLblCt69I11BMQU1FMy4xMDCqqqpRtvwhKNrO0WA5UBJFGzFqENSBg5X3AVFjGY2RzJRIZrhRMpTDI8b/84LE/zL6TkgE7s7YQGRxuoOmca2EREK0px4gglGH4l/MqgLhxpKdjjCmQgP8kG/LgPHArxmeBvwBAEXrWcFn39R1fF1uxixNqV2MrTnoV5fXsft3iwxWuwMQkH8wbqMlk/10iA1ypBRWmv3I/1f1kw1912ZWgixrXdabmhpNDRckUb1iucY/Niag+yylbo5LG0ru9dVMuZ8BEFhlC0RhABIJEExbAwxxQ0z6NkwZqUwwA4x0CIwDAgdFMw7Y0xaA834/CgaZSkDQMDhQ9/EMwP/zgsTrK8puVAbmmtRBiQ0gg0GBBCNb5lCKh5shB1CFjqQOsNFcweoKSgL5PGPK79AULe6Wz1tdj63XiEgWEQCMi0riMrrV4YCAyZlvL2FVfKaTuYIBXAiL9in0CXjgV1KNy6+XjRaCfudHoy//rKj3upBS2SqSSND4lA4NgGoNhANKoDLWcypoqTjvnn/kEVH1vRR2KkxBTUUzLjEwMKqqqqqqqqqqcRUKHQiYstLLgsPxoDmPqyYWKxvryGNA2WVRVJCOaqUJnMBgqDNkM+Bs//OCxP4wik5MBO7anFg0SA8zQ/y/ZKCRNQ1aWNhjXmggzMFgXAqeqPR68LQneTWR3n1DQcYsiABOYxWCI/lbgIWF2ocMELlkee4yARsqfVGELUk1rYvhCfRKS9AxRJNPpSeabE9CVK/JX/+ige1oKWYLWrzipnSeg7GhdRJ50xcrIXPKShNj+pTXK9tCxxZzm6joZk01SX5MCQsM9piMWQiHBrMVgqMPGNNaQoOTRrMoSUMvw7BQTmBwJmDMWGEIMGdAcEARGVI5hgLmAINGIjr/84LE7iyadlAG5prQhgiARgwEGJYQPGAgYeVGzKYcjwWODsCiAQIRUxysWfA40IrVUm8IXG32AJC/HJPUmn+00UcBqV+zPwpy5VU1Y0GErg3+1O0qPSoj3owvgl4NWfWv13Ez/lqel4Zs7/22x/+uWejnTHzjWCvP/WGMcQWkMConfhBT8GUr7d55ixQWZTavZbaKbCjTZQqYegKIdka1TEFNRTMuMTAwVVVVVVUBrJJNAQAmfVepciaELAx4YjQpjNVS0ygGQ4FLrTcFl0Dkof/zgsT/M2HOQALu3tSMRKQAcxSDE6mGmTT6ii+4sD2ooglYhMQgBYTiieVGrIYkFcMQhv49LmZl0raCCrnZtWbPaBSNmqUASzm84TgGkXkbVib02qYP5Bv5QbUZJkJX1mxCQ4DqER31Dnt/3ZHbVAVz15+WlCUTejsX7uSiOvfbXdNkHIiFmZbvyZ4yOlsmYTKnqRM30ExBTUUzLjEwMKqqqqqqqqobpZJKY8awpEk9CIISNhAABHwxYEOAIymdLiFKW9EhUMCw19nhBRiPukxU//OCxOcq+25cFuNLaMWTJg7fJIwb2hu24dBQqIlkF6TFuIjYB/wGCHJrEOE57wo7wJXJ5IUuIlH+NVjwYqeEIPAjdolK1jwIrQHGTdDF23q2aPmBeE1rgOFFwklNdVFW7RBUibf6og4UE3KLtUeUYd6GHsjHKIB9zhx0+96ujI5N1urydx8MoQACaxt6b2ICi79ust0pTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqoADbbesIgBSfXoSMCypgZRlDR4cZmQAKGBYyfJQbBE45r/84LE7y0DHnwW08syAuqQxIFgVoz4ZmrZZQZaQ6ChQcWc+kgmtJIkRMYDJg5Q1klmUsH0+H4YS2GlX/QyS1ZcDfvWadFD3L8FVzBUAu4xP/7ae5Ujc6TP/sgi42abD6dJRfTmbSYDbndaGdjaK6G3ZyoR8k1PmSzb1q1BldnVv4Zrjy0VrtVRSLXei4hULDyh0/FgGmpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqoFt/vYQnG8LqDhdICq4VBmYRnccmMDlBsdhP/zgsTlKlLmcB7SxWxtHZg4CIgkyfkiDcpzHLXLicVMe9UfU+GDWmRaAb9yeAyt3gunFgs5SosuzGYc0m6rkxo+EbSRE/H9SjM/7x/76tvI5oja0/NfupzwlapX9AiBqx9f6KZ+r1s937o6kY2W0NpMQ2eAQFBVJUBOYdHta8CXqnIg3Llg09VPa0XIppaWAwqoAB2cVRG3EDAwmN2vQwaBQwNE0+Mgu8iehqXmGWyC9BjdjHgjZnuuGTJsQQAAcWzRIOBoAAdZDyDQwEOMmAqS//OCxN4oqjZwFtPPLJQTmkgw4CslUNau5QUATLk5xDLH0iD3slLIAMcvgIQCK8fx1AuHjxNEoKQH0l0tNKpYUUSGAdIACQ/maCZo45JiYnycAPUiLip1aCZEETIb6RSSIxBLonCYEzWojysxmvUpzAq3//X/Xo6KKz9aDVnC6nrRcwZ8YovP1FprJYb/eHfS4C+b/vWNshdxhSRebD5Xf2ARp0obOnvWw35o6hmNwQDR6bDDZjJ/mWSUaV05hgaAZSGPU2bNDZkg8hx3MoicwKH/84LE/zTqjlAG5uR9YAkFu6F5kFTqWFgALHNam0wAEwgjHGEiRZz1VVPuGWABhrKVpntgRqTRjD7hHOLITZfD1aDxETMcCiMNrurykOE0tvGbjhjRyAuURjPmPIIeiSQLmSQtA2r8wIiojSLHz7kPMvZI0GSRdA2sr0nJd///9l0lOx3W60N0jdKkipRm2Odym+zXFE80qScfq0kxwASQ1CxmLJMrljuRCLBX6XsBWsz0qEjw4tLPuWh6dDB8wqRLCsCYAeGjCHl8lc1oDcjsQP/zgsTvMQKOUATmpPBLNBwSJn+gN4JGx60RAH9cF76VVU1Z5M8x8oeOvDMQWYgROqzU2rG39JuLy0yWOO0Wrdi/2ZIB6gk3R44/21OJi6DoMRCFL6k3MQ4FHZcU3uXDdcqzn85/0rUbt03PPM3NjlbtrP1JuybVmiKlOyjI1ZXh+hL4r9DaPCmL//8uoWuv/+dt3y2D1LAWy7iE81wql0rYm4GP26CgQSGk0IFDBSCAwTNWvwFJMON4WIpzA0AUHGIgUYQD4WAIKPDjN6Bl3O4o//OCxO8u8q5YBt6anURnUdjoHIgsPFxibzNZe94GyBCRZ4YBBY0MInd4FAXUQxqY53RwEAYM8jTL9x9CjWLLOACAIs2MUq2JWyJDAudcUxBfubORgkqCCJbX6abjTeXj1/1mvvcnRlIZs/QxNXjyKlqmZVQhwHIqKi2Iosq1uUhZRQ9kRSpZBhRN3Ocn9K1R1erq2xUqVcziN74iQx3KV5rxUccBrbqgELcGwPg8dCg6UchibUYAaDvC3YyAiMqbjujkw5BCAkx0OLgGEE7VkMz/84LE9zKEFlgG5AtsyQnMTDVPo4GiHxiQIFAYDdiwGiYYDGXG2RMVIHWhCgFDY0R+F4FnADRgNsAtwJwJ4ZQXIDQEAwfFLjli5iYMwxuLnFzjLjnmwX+DmJpbqLmmT4eI+Q5tBSCiCFwXhRPlJZifSZNNNZTEOWsjy1LK+6ZeLev2Uq8+ZH9bXZqSHmz0+tFBSD2JxNNbrQOioFKKlUIS5EOMkgbE4PBhDgmREAgOMBC9ezxb3MpBHquRtMA0gMQGzBQ0ygnBKGYQNAINMgPjF//zgsTxNaKmYBdboABMMTNiFUMfJgDDGCAhsvCYuqg3KBoeYSCEYEh2YngmAgyMlChMTmeYAYOBSa6+KZShOYKBQPBAc5k0YDC+HDYawHwYZAehKDAYEYCpIuGYSBGYFASgOa0/6wq18QMCTYWWOO1lSMalbcn2S7jDqcX3faopvFYVDiijTpW0KCL8zahx63GiUAdX2BgYTPfOoFgCYE8MafsmBRiUplTLnTgCLR5Cxv5VtJ9p0lx9e0jgyBoMQmwNedSG4xclLO39jNBE1tQb//OCxN5Ly6p4F5voAxSM3JXajMgbzPLF7pDrdLXx1bldqxl35fDV6WXbf3sI5YjUl3erUFqU43sq2djL9Vb3/3utYfvn/v////n////P//+lqW8t2MbVfuP/fxFFEtVyQCgAJgDAOmFAAcYDoDwFCwMCQBswFwSTAcA5MJUAowTQPgcCMYCoD5iUgrGJOFoYiwO44BiYBwApgIAJDwCK3DAPArMBsAgdABMFILUxHA8zHcWPNnxGgALegdKYIGYiiBj4LiFg9oAEBAVEIfiEAMD/84LEcjzS5lwH3qgALA4fA2wgBoGSQUFyg1URMjSdHNAgCQbSFiIcK3IuCEBAEAEvEzIqUQywMuTq1IJl0CwAJpaygLJNC8Sy1ssmQaAUiZqiMJ02XeiiOSLMH8uLRY2pfOT3/1kaPCkvqfQ1MdepOta0ql02NF6nZeqtatnqY61CxdzN9ggECWxpSg/Flf+n3dM5RAAwGGEJrGJoSmBBRiAIDEZOwcPBMJwXKMy2AQxbskxcCUwgExZph0D5ZlDsYMCIQAIYB4BJgVAUGFqEGf/zgsRCN/rGVATvmtiPEQIfUA1piLiiBQJcwCQOAoAaWSWi2EwFwOHzEIEFNKG/CwA5g9ATM0UtmtajwoAGHAkRW620nT8HgTotRT+OQVACUUvVvywgIunW/mSjPY/Cd65u0gIC/MP4cTnmMLVpngXR/FBo+LuvaYEob/r9zURJg/fsiX1JLs9bWrRoa59X1u61pqNXGuSlS0C6UEcgZDqQLOqn1krE+jst0LbXJE3TUmsWAxCFA77BgaZ2MGpTgECUcBIIPgETvHsI+zGBldRj//OCxCYt6opkBt+U1GDt6vAxsLL4A0AMEAUCoMZg6JbGZMV6YVoLocOuUAkEwAzyvdAhgFACvIvqQSiJpPBQCOHH6w7ynaoNAG2NvbZj7kb1nq6n7BOXeZ5V2xFrKPIjjmswEIki8yQbeQC8wPmo1flDU9lN2ZBcFkfI1tDDZiXlXZq3V3ZbnlmjVtxGtNwoueJHIhQHMwgqqLuVsT9FD/nEyjHWpoAjGQdRAQgAouJQYOHgUCiI8BoaOdhioIYSANJUOfmwLDL9LpMAEAAGAen/84DEMiqCimwM347ThLlQGr2KeYMgLZhPgcGAoAOWiZS5UGjwB9qnh37DpgYGqB4rzPV1njv61d3djPetQJBopusBpucEridvgRVCosbX5wNHBakfNcx/KEC3/OUeAwOHj0Mfc81CTTf926UQl7X8e8tR9sXfS6/b8/rlL2bVbOpqxkzbALfUTzXRE0r6JS0FGQJKAcGGSKJMEqrg4GKU4IxgisEhligYSyCnBIUquWkMA0AcwRAQjDJHvNj0TwwhgbzA6AyGQAVkO3JIiCgD//OCxEspiopsFt+O0CnUVm6+K8TAoACgWRb3348oz36PtZpndtQAJ09QdOuG3E79oiC6gtrT4+LhwnUdonyhE/0+jBQMjjLtjtiO58/5qMyMh6ESQmOjhkotzjLlrFkuMpa7OK0cWRSq/2EytoxhkYkVScxIAJQwKEQMcjBwEODgummcihjGSIA0yEBKAMDA7QVzgwBbmFgCIAPGROME+1MJoUMUhmMxAHDAyIgBV9CG7F/5mKqF6j6+hQFZqWSiX5QxCHWzr4dmHTzzmMHo0J3/84LEaCqaQmwG31TRzDMTbVKSpfsxxs4jdWX1IRxB3v/t9qmMpyhgrj0uYs+bQfMYSh9/PRFw8H2nLvzH8z/PWfvu1b/t3r7671k53+o/tQ3bCUR8z9PkpYGQyFHC0CEplpeYSANeBKOck1GVJA9ZAQmQPAw0r1gqAhtVNigAAwFwIjCwHJNkIMowewVjBsA9MAsAoviup1Yi2JlwWAfFgI45Ua+CgUo3Z7GcMb6SEql17W1jZ75SynC1rKtll2RvqH5Q3zCI4oiJOlvoCiYk6P/zgsSBK0KmbA7firglr9Rzf/OEpmojoesrXqrKRLnItboRdrBampclyjLXIItLpGCVUVb2qqPtFr/xSMwNKKFriIGFmERD5aUygTQGtCMAVDyk8AzhgQADA+ASYpX6+QGA0VC2ZgFAHGBuCaYWBXRquDUmEKCQYNoD4CAAZfDEbeAwAAB4ZS8DgNozFmYgYECHaTDtzNni7bnz+OLe4e7sEG9SgJ4cjA38uGMZ3+MOJgmn+t/b1qEj/sRd8sTVDUM6lflZXRa0BkYasjm9NJ5H//OCxJgpmrpsBt+K0VnS9H0036dT0Ybyeu206rrBTM6NrF0mxVCMyCxgZMFKDC2Iw0IAIOYDAHrlpraWEVJiYciEVQFwWZF8VFBUAEQAPGAoDGYIKVxm4lHmBCFKYg4ExgZAAgIA5H1m0yYCIADxggEBGqT2mfDACs5G6m+ZMKVF92Y+ab/vdfipXR8y5/8krLHgqgoL/R5QSWWb+GigM1b+VLP/poKhchnmpqW0uZ3We6KbdiptJ1C7jYhCox8VYHyahBfZXs96qmH/+FyTG+P/84LEtStSqmQG3464qF5VIBkMEFgEfEclR5VEw6k/IwGU1ASIa+oQeZJaZ086vBYBcDAYmFCE4a74AZg+AjmByBkXlS+dl0oyhZXLTJMW6WCwUBVPzv7yviDB7QkrUXNTHQlSOsxvUSz8lpV+6pw3rnPmZkVD1VMdfytFv/mBeHVFtOnOUnUm61pUl6dBbaKjib9FdDqSpUGRZT5sei4QU++l9bp0LItDVUxBTUVVDdtLbvnNwLCp7A80SKC8ptChZFFQw28yTAzzASbCxNeZjP/zgsTLKNrycBbXmrAAtRsqdKJ4MACMA8CEwMAcDChO9NLkjwwjAFzC0AQDAI0kG3kEWLRukIQI2O0VgWaAzwkT77j+DhuxJ2Iu+tAWcVEEOoqdEeGKX51rlt1U/rNDg9vU/86r+2hdEtrRotbU6DrUyL6nZ3qpJVl9l35uhrhMbPklJvhcmfeAlKNVmRaMxIladKe37rtuAwMmZoqYZCgqGw61mLx8ZeOhpVgGKQILBwwMZz1gEArmBRIMSBgRA4xQESsCQaMiJF8ZAKMAIDsw//OCxOYqwqpoDtemrD0KQxJoJTrARiMFcWYx4gozBxA0MCwAkwDwAggAEYQGMNCtAMhFAKNoF0IRACU5DjJBZVLwJiQDgRbL4+GJgG5iJhQKIQCSKO6qJwcdB0Bc6h+JZLVIY8lSeWUj5ctVMB2nRMnnP8lUUvvQXQrNltQ9TUukumpa3oUamzRU2ROobWeK2jBq70x61H1CMICIkHVOYza780qWRWV5EN8n8VTkyMIFS1WkG0ZgwUAgswBoPKYzMVcIURCLxYMXlGIgDQMIBDD/84LE/zRailAE56jECwBTAqAOMGcBsxbhjDtAFHMQ8KIhBvBoEBeVQ5uqjxIAW6gIAMDgHrNJEwEBdLsL28dqKjQBmPwL2Cl95aRXAAA3qtqtzxlIhR6D55CIRj5P8oNxiTaN/Ku37KirKmKjtW1nNnXZDDTkqtdJw2PZHMdG1YxE1sxPEFg5roFGJSpKCwoutR2n3f0VccUuaaZNhqsIiKpm4HGBy6DSiZkQhg4DhgrAqkONrsVcJisHmHxgWAWYAEQ0BVAFgQYDDAJAhMCoFP/zgsTxLZrmXAbflNCMBMPcw2ICDVySvMPcC8HGjkwUIYBsUAErOXyBgGn3IAKF4R+VP6JAgPblS5ZdhgaApkFaF5S8OAKp987wvczjDW+Z4Qkw1FC9nh9uihQnSAIWNYt8jD8Yho0q38qctv6UI26sr7GojIhx+vPefapLaoiNJ0xRgInotSjFBVQeJHDKyQPCITARadc1yMuqTEFNRTMuMTAwqqoGL9rSraM4SDDwUhAQ6wHBMwYJPPqzoia+Kjp4ZAYANBB0NILSgcgY34Ph//OCxP4xyo5UBueU1E+pZ4wAAKzCtMCNj8X8wUAlzC3BCMBwA0DADJWs2YKm7EmXJAxungpacujE7Z1MtGh2rWjG+MU51pPDudV82bUS0nlm1RMPSITZhL3zpocLNf+t/opd9bWnb009dq2etalU1GKmU6ReLdiNzpFL/xK4klX+gSVIqOd24Yx1T/EZ/xvFIMf//E+aC42n/YWZ/miVQMFQAMnghMIgsMgwAOUkTNghPEgqMDjDMnDKMJ0EMMAQMRwDMBQQMEAbGgdBwHg4DDD/84LE7yzyimgW35q1TA8wIgFjBLBHMMgJoyGVAT99NQMZ4NEwwgpjAHAzFAEiAAFRKBzAVAGZ8IwKyYCWtSvuGAdN3KACrc3c4m0PAJ0dI91G8SGc9zfxNOiQXcdf3Utt5Z5vLtstF/M+alW8oManjr5n///+BYaAFnILUfxoMTdHX7KxlQo8rRu5vK9orMdCnIgsHbYulURKYlsNj4sYHSMAtipc4VQtZC0kKmVVhbtbteL1HbY4dQ8MeAITGBgTJIkAQEIGGQ81GIoFgoWjBf/zgsT/OJrOUA7vitwAIWfwwRFEHB6YHAY35hyCiFDxqpIzhYAwwAQKRUJAwI1lTB4MmMGgGgxMAGQUDUNAMp9M1k5ehzRQAeO3s4BTopURL/N2pWlFauy7vsuz/YHCYp8lTjsR20xeXkYKqyD5EaMhPyn+rr88995pYy5R113Tp6XrPV5pRxbJv6HNMHC6xKdsn1V2rbbfCXQj+lVM/2NKAGeIzGBQCkAuCRfmFocGLwRmu8mmRY4AYLRUlDAcnzEAywgZxgI09TFgGGcscWuR//OCxOAq0opgDu+UtAADQDYcB6YH4HhjYIVnvUOgYiYnRiJBVmB+BwYCgCIBAAQkoJhGBPD6j40AFELzwICZYTAH0XcurJZ1nyKXplav5YcmlF29/v5fuSGrg8QFRnXHEQLjx6xv9BePAku1fy7/V+WKkQ2QuF2jAo8yMmGx64Yao2bXFEKICiwjNuJCDU5DXPzr1K6VcaNxq5q5qg4RmCRQarA7ikIoPpP82gSwcRAqDjz4XMtMgMVxhsRCgCMCh1fbCC25goIGA+BaYIwKxhX/84LE9y7h+lQE747U4cZjrNlHs0ieYxoSBibg6mBUA8YA4AJdh04bFQII2AADH/jl2nGgJpeLAOUtSZpgYRQMTg/nyomPrcYgbyaPWao2USKAzkL1EkWSsSGigr1ksdIS51tvuh9FFqDLRZDnnRrep60Ndk1OfSKhg6JhcLh1KmDhoSNQkLIHCYRCnUXe+sVQTk55Gt3+tQ/5TswMeUQMEAKMDwtMewMMCxzlBn/IA0WywBgGWJjWPRjebBioCRhgBaaZiiHChCiQ4BpIBxCA+P/zgsT/MWJuUAbnmsxQE4wHg3TCDjsNpVQswPRBzIJBmMHQCUwLwCAMBKGABJ8qUq0CEB4eAAhqxdCAIOBwC8/jUweN7eStxrUqffWP72tJnN7m/3dmV+ZH65HNOnaqroDFjrPf+iTCk96N81/wfnm7Z+7qrWdOnT3N5dNxd/VO+7fs/hTKfYUbdRPL3PJoyucf01c3lCE0XpaTdpM/vpVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//OCxP0y0o5QDO+W1VVVVVUpSXWz7ooCs4xmXMhUdC4guhPshHgsEIHuq0Pa9OZyi3FHnVaYahEPkefLmMjKYapaxUS3Hxh6DeJHsQyFSXxOKn+U8sxhf6C5QUHXKua7asGRFBBnKHUb0JOv87SyY+fuyM1zCi6GnFHLPHzVMR0l0OrpStLL6y72ooRJFzcnljPOM/eqcbFEFAIY6hBZswAVzLgKEgAZNLx2a6GMCWLC4wMcDWBTNDLMBKcxoIh0JEIXftAGtQwSGTAYAuMDkGP/84LEwCEK8owe7g7iMHQQAxfYbzphT8MWIAcxsARDBJAJDgLFJsEa+YDQBTUiUCNH2V1GFmAeAFLwwA/mdbbpJ42Iku/tVCD8v7qTML5vv/zAlVjhbQPB1j+5hpQLbmzvlCEsHMpmP6TP0nFz1Q0wxipOyKdY/MellZVqutyWQP7ILqSfS1BCHig209FEPEmGFDXEg97aAa6X2FgGaxsIODJg4Vi0kMGGgyKRDycyNakoHEkGlQTOxiiuGGQwKDlg5ncaM6XaIggVAOFwGgoCSf/zgsT/MSKKUAbnlNSByG8Yqks54nKBGDeLgZGQXZhBggGBoA6YCIAwGAJLdDwFbqCIAtIJ0a8ODQLj8gYBScpqWqnYsetH0cpdHlt9zvfcYEnJjrH/1G74x6gHi57o6RO5iHdCVf+XCDEQDNa62vf7lFzrH/Hv47i4ZUXERbOr7uL/dUTU/ucpVhG2GR7Xg1GsCgea95RjGsJCvCaFOXiVzG0L+AIBnGy7IiA4y2KQSAEwABYIJAAiUYGDmY/QmCjYBQEmAoPmSIcGMYaExgGE//OCxP40so5MFOeW1ODCwJh8ESF6fAKBcDAYYC4B5gZAQGEKCWY8w9h9UDYmLKIAWAnQCBkFgE0OS0XuTpkJcxoURn1lGAOATPhAAd7cusRMoAKv2U8LGa6u/Q8KMAej3x47LFlQ8MtzCNxik48xOh46MhDsozyqejF612d0dWe0g7LMScpzKiW9VfkYacAErSrrHEGpxpQKpa1RFOQeLkOW3f7aTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhAuzX7/84LE7zCiilQW75TQ2v4pN0UeltZrAWEmGwM8LqlgBxkNSlz1dqSt9EdwRVG2LKNZQPwdR3u0TjK8aC5xT/B8F2MBvCm/fNABJX5g5PxGwwO/9h8CCCFFqP/7LFBGBm8m+K/4VP/hzlW6dlo5RO88KSq72qVrs7/RHZU0dXq+lXZqxrP/Qi9Idyw4AXROLlhQo16d35KERMCwHNqiLBRvmCY1GI4NmEJUmDwyHKpmmY42FAOBYJjM4XzNoChpozF0AQwLzLMOn4UChBgOABgDQP/zgsTII0M+nN7aBR4MmAYgJRgRgICYWKWjGuSi5Zr9KJ3KoRlsQJiqGBhQDpgeBBd0whESYAoGjQQs+edcIscjHDBED6DKT0xf0ODSKOmBgKldO33blrmC2Fvax3+u0dXHvyDCAmofqtrkTw3SQn7u8f/948k0bebfaTv3Mf//1c5+u/3+d3v7glJKAhRy2PbAQbY43eq7iq7nFra8u+gnvWTeNtLZuOe+tyJmBbktrgNRw31YEiB5RZHGB8wtJOU5wdCq0EocWqMLtEAgCDGk//OCxP82sf5AAu/6wJiAc38BrULZmAMAQYDIDpgqAqGJmXecmo9Rh3A+mDICwFQE0yGixyIrdkCTtmSe3YBAD2lyf+PzS/cNsc5qc/+6VEs/6h1ealFjg5rT6FZU2FGx38qLGJyYIld/8KLLzd/c/tmua0CjE5cTjFuGHD4kEAYYUYcEI1SL3jryNTg2IEWQiAkZWC6LfqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqAidtjpGCmRjqYIAKboOBQiA5KDApBAf/84LE6CuiFmAe35a0Dtl6OxhkCGPRmPFELgVYAFB1OOA2AJHhYAoEgRgAHgwGU4TBKK+MFIF4xBgEQgFYMANUk2rjInw/IYVcqPWW2zbn+9eGQrygXdRD7ZUWn9CZEVihwlhrPTIndC90X8uoou5JP1Cy8klxAFxRyGuLBRwnETFh5hmsUSHjFkWWsTvqLrZ3dO3/v6pMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqpAGSf/XNQ4yOqHEd2SCg4wI46fUx4KIwOPGjIZQ//zgsTbJ/GmZB7nlLAFoCosUL22sUb5LiRpMB0Awwth0zZKDGMGkHowbgQTANAKLurucmRK4kbZMv5eKABbzwfznkAlchFMg0r/Fif/ihN5CyB4a/8Qx/iNjeOv5FiBF8Q1/v+DK/2VKh7hMmtTFhJ5gme6ir2uPY+e1W6+F4uZjtquIbRrJU9E+6ossmB9kUZwkrq2bkxBTUWqqg1TLy95iu2mBQUMgAeBhgYwGPTKdUdJo4QkgQAgpBIcNLPYzCBDIgJIAqACALA4HAAwSCTC//OCxOEpgu5svteQsEFjAnA3MEgGIwqQ/TIefaP3BO8x1wqDFvCJMDgCgwCwDUTFA00EmmkK3L8gN+VFjAVARnhkAO3hFtNus7tKhZSUDIdYdIlAKXs4cim/y7FZ1+72Vvua4r/k4gd8xuor90a/ztiI45ZNttVplsiPuqdeg8m1T32mA4eAQkJVEjz1Y8sob2U4+oeWTEFNRTMuMTAA+qXyVQkaGlEYScDDIYbFBMtTPe8MbgGWL9MnAsza0DIgCAx3RcMxA8OC7IBQDjgMGQL/84LE+S+CGkwM55bQMLApAgOswi5AjalUHMCMREyCwajB0AlMC0AIBAOl6lhSYANvUOcVfGcUdMBMAqLpOd+9uTUmMQdOtita/WuwXoTSKnIC/EyFUv6lGnshSv5Kg/NceF2GZKqNkBzHPspPSYp15C9ArG61PMCmkgkfW5UpVMi6HkiUu55NqUT43ijD7hLbVS8Nm6oXMt2MABM369Q4WgkKColMGksMJhyf0mqEIEGkUJBhoqmU5yGJExsOjCgmMih1JZlQEBQcFzAIAAIwD//zgsT3LvIWUBTnlNBABQwFEMJtCBjTCwBkwZwF3MDhA6DAOAFUwBUAcBgAaXGSNMAEAES6aZq92wz7ilACw3iTtFhR5TNmk2lde6uCkwIKXLhQie741MygrQFRndJUmchZx4ultB4bjgveJtn+rezu9TjDTyqSxdIcWHEnAwtFCCInSOrVfsU4CI7WythNqcmvayqxSu5iCtVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQKtscyxczgUjBINZSGEMkFZgkQnTDsb//OCxP8xyhpMDOfO0CjSleDAGRFIxgLxonAwJqAGLgkPAth7eluzACASMA8C0wOAijDVTlNhsugBDQmHoA8DgQ0IFXvw0shAArqyTV2egxndPC8McvEYXx0MMhO70BIv+5bUeml/qSo1b/jKjKg4rm+UNrDygUQtJmMRUkHwO/WtA2wUSKNcLBRhdXSOduK2I19FvRQqDKl0EAQmLyAIYAQFRaMHBrCMGlopjxqLGLeBOYC4AxgSAlhUIgwAhiACAUYB4BhgAAGGCGDiYFIAUPj/84LE2yfJlmAW547MiASHADQSBEYCALJgmiBGMJUmfBi3RlW1h0Iapk2Jhh4EZg+AxgQAKVxgUBLaqmZo/jz1w4KnbRQkNbG85LzduPHjQQxhdtagtZ0V7e/vfpB9VgiYgJbpKEKF3NZvUdMFYuPUT53upHMzLas5xbYotUy141Pcen2pAa0W7nx9ZEjRLLPY3NuyP+/9FUxBTQGjcNQVBkzSGUSAYkAtpwXBgDAEaA3SYqiMYTAaiAAjsMWwLHisGgxbuYMhMNAMmAHAmBgQMP/zgsT/MVoWSAz3TvAbAJMDICAwfwRzHiH+PrIbExURACEJ8wAQNAoAiXmVtXkDQDZck/FW6Uz4rUpVF6ft/UP2Mc413UN9wmC8Ia+ceOrQbuLh3bUlRS5pAqU6DUjGmMdX3qebejvrpMuSobNR2saYYarc5G1RuzGujLuqTTGkjTD45lUeLlQyYaKjgoxr1kIL29te9UxBTRSpDaPpn6nAUA8lClEgwiIIx1AI68GY0MFUBCkABIMAx1MRlvMFwVCBuCoMmHAEjQJrCCgRmAQQ//OCxPovos5UFu+U0BgMgimBsEQYNospilXpHBk3qYzIQ4Qn+RCGjwNw0A6iU1YGARNgEQAL/qzSaOCQAtKjxNd5dawx3mL27rPRy5r4gsyLa/f9z2hGiUQKjO+/WM9G3Gy7WVE0VI5Gb0v99RzF9fX21tPY3mkTtsLrazCNPPYpuFzIuiQVF0qcuKqqHXtbJsFfsdxdTEFNRTMuMTAwVVVVAK5IIEYHmQSrmA4AhUETEgEjBcNDEoNTa+WDGkKkK2nmXIFmOxLBhbGFgDPYBgb/84LE/DAyHkgM75bU1C1BiQBkAxgCAEmBGBQYLwUJjtvFH9CfOYjAw5j0hoGDgCeYGIEBgFAFgYAJClAepFHhi0FPLHkk6yqdnX+oS94bn0hX3FiEMybV309ZaNhriFzVcFV+s1OK/4szUIVmYIrFxOw9cbSKMErbxOLiQm+4SnhUDIBUgW+jknIWlDUv0ita+b1ruKoB40izROwwNRZBgAQwAgBjBQAXBABgODIAph5hQAEGAiA2XoMEACQwoQ1DBQBmMCYFEwbQRzBWB2MI0P/zgsTzLemiTBTvlsxAMLQIAwUw+zC9BoMVgSIwtyCTF3GIM4w+476Y5DKrA4MlgVowyxaTDJB+MPoJwwSwuzeUI5hUMnaTUA0181MYSDKg8zUfFCgwoBFi8GAheovQwNpyv3QaSt9NBTZIRCeu5AYhPWs1xabBVdsgflx5R2X515+SSmBmsQ6476O84jS4aZY6cqch64rL6mF2nuUUXsprtIcloa5HJYOwxxmmPvD0CS/tJepLENx6BGlvszRlb+sHaQ+rL2kP668MS6k3bxqU//OCxP9TA4ZMFvbTHTooWEgXEQkAcVCQRikTiBCRoGZynqBM2KLbIFiQjWYRrGF2ZpR3ci2nsFW0EW1JMLyYX3LzZfJpZOM1ItoMbgERiN5EdjwPYhIr/+RWD9ySPE6ZiFLuuSAhUoyFQuKDTEAMGHxYKUIDJAxVjDikwUKdtD9GUlAggCMSGx0uMlFzTAc19ONAkRRrNgGjURAxwhFAYSEgQChAIXqUCf9YrSn3SgfZmcZq8rITXWJciw9Ck8qKG5TjKccerqFiSg41OKtTQqL/84LEdywZtmQW5tJcJWC32O7466RvJJulbNkTpdKWkQkBmhUBIQekCCRgMpWJrDthlDStr12C4M2jvFHPtqWnu0pkaUYxNQHjaMEo9GooYREccCgkIxGLzAJbPMiY1CTiyIgIQIKnm6gsWDpqaY0+anFQwnSSq0gqOrVemhCt/2pP1ZYAiTLElYEaPXehGf0yK2qLAEMfJUE7rC9xNUHhCo/Yuc+3w4yuvgoX8zYlcd/sWTH51K3CVP4t68CgeE5JcksSF3igmAIosYyg2vYVcP/zgsSKJ5HOUBbmlnj8uZAIdkxK9p4olFjDCHsTWyv/StUAGfdWVtNepkrBRfciTRhgBGEyObU8IKfhEMRgQGSUgaQbQQZwI2FjJngIFClxgU5GhQgGmdKHW3GyRoXGIBJ0T01BkTfQvCWsBgZFibcekIhVYlAv44E2/g1jifsWXmEUDKMmWOQnPX32K0xmBg5LbFXc2aXtSg5qlCeF6sz2UXlcnqzhyNhYgv1jpWI9yARUxwfY8+gWcXarJjHVAm4srpY6lWMmIErBYCEisGsm//OCxK8tAdZUHOaYlHVUae+MAM1sjvNUM7BwFBptRYJEgSBpAMZVYVGomAqMcKCWWS8WovQQiW5w0XG7k8prYLd2dhAOKz2E9lRSGHhVOoxGpGSIMhKiDI0ETMKY6ojVEm7vMhZGWtqkUlLYMqJma/OnicVg+GpjutVa0xnEimiTk0k3d+QjZO1S7Ker9VSFVN9JfWhaiytpu7yICxOUjZ5ptjqhlzan2G+Rbc7R9KoBqlkYyCDlpMBxoCoDBwqHQoYPL55OnmeTUChKBAcblEL/84LEvydKjmQe5ppYYIabAwEXHSJzSiYzGzDF3nWAZIe70kEqQ0BRcbDYAvxlsAVPJqBbeXDWEed8E06YubLa0LlKab3S/Tr8wb78b2qic1WpUu5b+sbI4Bbl4imqtaJg6icF9NEEUnvWdQJEZCaTozqOg08rfZdtv62uueHDwySi4qbEbgy00w6+YcPIsLJGof3SJbdv7L+mjfdY+lKREABylCZgOJoWD8zEA4wNJYyQO09I2E2GLUwQFkxoIIypAszCKgeSowzF4eB8z8CUQv/zgsTlLGI2TBTmmpwCkQEhUSg4Ch0FH8NFxtFQbBwAnfjllHKdpvmWtLMbXDAp9rB4yQMAMSY2aMQ/ZkyjtaZZDgwTQkUk2Xym3Zm52xFqR4wS/Qs1qvZr52IEq1HrCgCMs9n9Y6zmIav3YkzejgK/N/292t85pq2s7v5ZXtYZc+3jvPHTIio7oXlQlSmvTJepTJp+GoUBtE3UXxrcag8xx8uJxd/2d35azYCzUs3Q6/OovP+K9ZNQOgDpCWl7jR9hggBgaBAYqAqLJiwdBjjm//OCxPc38o40AO6K/cYuiGEAeYdhYYIjwY0n4YQAQaAPmBFwEWVVVBQKLvlVTaCWgRhIsAGRDzivu+1ajh9HVH8wN+SBgxxHpGhSiAQDYmNP0kaDkyBeMU1ekP1rdynFgBvrcp/8uys1OQaAAnhHL327yn0R+03Ic/w0qAvTUz7kFbdzSFsa+/uGP30+/5z3D755ptREXVarfUp5q1a0jRqOFp1DCKVUdNY7T2M453MW73VMQU1FMy4xMDBVVVVVVVUKVSxumQ4mKFWgeOhQSBr/84LE2y8qkkQU7tacSgswKEzOcFFQ415FA0AIDBo3IgyPPQSLjtrQLslErfgjml9UvHIsNfjmIAH+L5jwsikLEf+C5a+I5sAvfaX7v/EtIBrF5o83T6gJvcaMCXZnqrp/9yTPUiamVPp/87zLZyug4Zvqfe1ckhDSeWJgULJKNSA1QqxrjqbTamC0W20sdkexVtfq71pMQQh2lRUGggwd1khDBpKMhiEKAswWoT9ArNcGtUwWfRzY2mjF2ZBD5kANDIXMfBRhihAQI1QtzigZVP/zgsTTJemWYB7mXpB5ULTDQUVBSySpFmSiQ3QAChZaYo6uGG0iqMtbZzv04wDAEB4e2s7ODXe7N2bETGQjBX5Y8/WjJah3gAYNSQD33QKSLmArNY89bLRizBZOxxBBA23qUvp4uK7C5Rgtnn9SUIt7zzXxg4g0WeBRZ9ykogiWIrXnnQxBQmaBWbFxnEZjKCK6OWySbRn6qkAAbM8X5U4GQcFlzMGQCMKDoNcbkBzTGFQUmFZdHBZuiiUGFoNGClo6NG5LK7WLhxS7StpEBHUm//OCxP0wajpEFONHiGYCPrQMXD3Tmm6T9qNGFE73AoVEhcvrK51LmUgoGxpY9eRyFnd86VtNTK4bdm3VtBwgivEY7l+epKVtcmgAssx7HlrFrWXblk9EJs1XU19fMSC4DRCCQbvZrZebzXwJZ4cStPq1vq+Mavn6hY3un3IGVtkXJUGpoPFh5xLt4kDqCN10mQgqjbtWVf0FalBEwmL7XBeQ9MAQCNzosIimEQpkUDmEAjESRmWPogAggUMpi+n53CdxnaGw8qBhuGQoAxluF5X/84LE/zN6NkAS7t6cg4m0YVgU01yUyzLgajAQL22NISSGcV4pa+6xzIIiYuYCBKS5qz6Zl9sBGa+F2YGCYCxRODFBZRSPPTUFbCwYEwjZUqZfq7ZpcKkNIxW3gnu4d/LCf9bTb1t2o/Vz/9YSFsJMAw1d7+8O//5Wtfnv785mWqMjerhD7T6YisTFGhPPGX8pfdHtk4dsMk/zIH/AcIdWWYMtLybF/PxRlOUfrxu26Sv9Rwk5hvhEDTnaXMgAkQFszWEiqMgAczo0kMkFMxCCjP/zgsT1NbsKOAruhv0MyTsCWAMFMulUKFwCbBhowQAwQAFOXlTrSHOynSxFABnycUtP9DlVshhSzaCpJNRzX+mXCjCZ0XmtUw4LDAl6s3/a8ojFRkCeAMYhUEqmYYhHTSH0Tw3EIpNFSEki4xeD2kYuVIepAaApWs/v29VXW5itNOgpt6TIO619NdenVRqNpN6UaFPrrYEbwQHkErFEEvsFnNVV7XIAoPo0I4GAswfGUwNNMxsBIGByZWD8bpuEZeh0YIiWBEEOxg/NRrPHwvN+//OCxOItqopIFOaamC8SKjliEwwAaaITrbagwFOIDEVU7jC3xWp/oalDwrrJD2hHgYWDRgAVc+4COmriwbS0Eco9DzrBz1rQweNlUplbJawHggzHXE9GIR+z20hDXiKi/2zoqIt4Ja+mo/tTN4UYshwwLNj6ry9a5ri7/E+YcExqj5IYAWji6jSFMsiUpW25A9fXKuTGkGwIGJlaMQWknpa/vjVITEFNRaqqD6aL6nTzwYIDRgoagaStLMHjQzB9QMlDCQNADsN8ps05hDcJCBX/84LE7zDB0jwS7t6YQTGNejRYlINEtbaIwk4odVNO8AU2RRSUUVR+VuLOYC5iqEWfUWMUirp2rhbFAAcB5WXrhKU+LPUUTACbDBqQfQHwoXPjDpJGnsSZ6SJedKy77lIiBZ5ygt6mXPWrUyfVQuqtk9bJaL0loJOpJer1ObSCBymgFNOWIGVurMhp7QYda+27ae/jdNWATAkCzfZ/x4AwAYxokAJhEKJhWcptFPhh8OZiSHRiySp9+SRnPkRoMHxr66tEBTxjAMxwxYiLpQESBP/zgsTqK4qOSArmmpqcAOGEEbTDI4IOEYahqBJhN4RF0eaeqUhAG0JBDkaRGCU3aK6AVC+49Kh4dyVKyyP9Sx6wutZkppr36jzTYrfqULxW7cm//+o/ueoLez879bn/+q8nmlGf52yJWKKLQoQzFA0Jn2xBnWJEzjQnFgkiKDkj6zEudKekzQFBriwB00x7iYsEjLdMYp9STEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqg3L/9pS//OAxP8xaaY4AO7wkNYNDclJYIERlnqIgmaDj2ZA3MooNDJFmqPT+pYPb1zqlu6iXMP0iDX7rm0w2eJVqPQVKXfUoCdSmRbVBAD9zaYnPlApUUt8odcLM+vyrC8Ilcrt9b7qjonOZUvVK1Qjxr9FwzOm8a0mhBGT27XDKOS2xofz+6//1b+zf/fbB3U3f2XfL7zfyaoAC0ozIqAeYvN6YXhCBCWMLQhMDAMMRR8M3GzDjsDgEMPAYOthHMvFXMXwNMNgVLxGAgRlZBcRiibL4P/zgsTIIxI2bB7SVQFXMBaBJRmhk4kShXJBLpYFhrvjIJqbSWKPqEHMXUv3LtIWAYsGldhSNJeV7hl+6ihze3ub/L4Tln9Zm9qhnf//xmyzjATXSRb3YUB6AkpMJYrDwViWjmCuQlpqHIlGVUQxqdXIDzE2P2VnPmtdt1cyYvToyMudP711pTqqOnW7Kc7te6uXcu//5mpMQU1FMy4xMDCqqqqqAapS1Y6JjOHoMJgQCmw2SFR4pmQRuZo8wCEZhEAheNGLH+ZWsgs5gNSRiEyw//OCxP8xE4JEHO6UvNFH+Cqp/H7XiEqhCHYMaJyt2Ym7PxdKhfxAMW6wt1R2BaXAu+pJXwGuJhBag654BN4+c4oBXT1rYznv6Z8NJaX9en+po3SU8CB4f//gMqRHRNaA5/+fZYm28Ggn9mIA6Du7H6OFS6WKGO9Im/umkMjVCT+qe61Rrva3bnrb/9kiPtdRPw5/8t/7WVrYjA80DXEwzDkwrBYynAQwtDMw3NE2XUcx+HYgEkyPDU5XDoxfTIy0CoyhA2wAzR5KEAnTXsTHEhj/84LE8S2BpkQU5p6RCiwIToBgFEQ1ZwyYVB95y5iVhhkBvKhuDgsOBQBWlo4FCmfChg96Kip1TtDLMBjBsbzqoMQZkW0ey7blG26ls1eUNBzKkdgdizKHS8rhU/8uTtQjp2CGAmCO7eUAkGjgtTbiGbP+Y+Ofa/52IGlPdx3b4/0GO8l3pjhznxWJItaHzYs4XxfuUUyVBlnUFdLXLRUAKXS2ErkOCQguLBAELJxmE0bmUGbEY8MFQUMJLzPso53xJp0z0nDAIMAUWEQyrBN0MP/zgsT/MxpOSATulpxB8GmAEFwMzqUCza0p+4m9FOkcaKkgALJh1p7BY2wIFDCdT1wK7tMnqJERfi84UhcZsyH8UfuWNPjjPAcGTtutFMr0TxtjbQw1ErFVE396nck4UZlHiolpCHKlaM3WyXgHBwUkSB4OGm4yTRo6uoYxuK11G/Sgtf2qu9YRz+dEeq991FLJVe8jc/oKks2b3UlcLMOEpW0RidxcwLoeqlPiQhEkUvUJqy23b9gpW5pCBRkC1JHQGnIWoSmEYISCIocXbhFn//OCxPY1oppkHtvThLoYk5CRivIyYktKKzNr17HHTwjAZ/yEVFOZ3HHs75/a7LIThv/3DX8s5Ys4WPQX7uP6xleMy+IGGZyinwy/VNqHSHIu0o/5w+gOh2pmoRNyODmNzkxixBCVl9DIzOTWTdBrmaIAiUuhQXIRYAmGsNfdHPf+UUBzs1SdLVTR2/MdLpebqyLVGbd+iPiuctXNZ4JqlBQQBYlChhmAJgQQZlcLxqe6hywAJnClJiGCRgkDg6DpoKSBpE9QOoMxGAtKIOB5QMv/84LE4yvr2oge0sunNmOxrCwTCIEiEIzKZTwuE4kAoQQLEG3kbY1U0CjKApUfjA8mDCwBkFm5PSF+M/+rlHkylTqkitxTmM1D01q1mNyt9TTMWg4M0/tNu1BFectsYBtX2XhSZ5f3C1q7GF6zlLTv7q9/6t8CgQOswzNiqbm2J39U9rVb8goKmUYXDVqmtQsiKlxsyOYylS6HO0xds8XHKSkSg9UDFuJ1hNRFplV721hdrrQGpd7ydXJHXAAXNBlQmFQUABk4Zmh+udeBJmwYmP/zgsT3N5rmTATuFTCoZgIDGCA2aPD5tfQGLBAieTAEIHDHF2mXSnEi+gBBhhNlMuTHEhszRVkM50TOzSJGV8YdLocXUvo4z4ONjdHGJTYgsx4gUPFrSuJ22LTZ48y8FGkW9PT36v7l385Ky4WUene//51DSFQ2I0YiRtDhiE8DiSpyJ+Z/0f1LfREQjqjGEioY7PRLG1NOsthfL+gGUXGl0rUz/9eGvbGfPpS8v27dOPd+/99f83zi+1pPozWTcoFswkFoxaE0w48kwtEMwtSI//OCxNww6q5YBuZVLRwdg4CzB8HDAcBDL+BzKIFxIEi+gGA8wIAewZNAYDgiVgHQKMBU/YagOCC2HxICgZlkakx9Q+VjBlUqEIcojaKhmICrExCHYMm3yMoAwy/aHKGjymWiSJIaGklcMGBmBQQQ7LLtfClfW3asOwPGPI1AvefrVa3uPvxajmdPex3+9cbGDlSdk2Sf6f+/ZU6h7Tip5LTUzu1Ol+pjWq7GKYcn1D71BhTz6oBJrZJJ3M6n6h4HXM9SKnI47pdYyetAqBx0VGH/84LE3DPCqkwC7tr68ImjpmbnM4MRZgQLCoLMGAgPjTkPE2kTEgBVxhIEgSZYaGqJWLqXaCZhwqNj1disd1JEPjbRN8zDBwDHzo3KpZyMwR25TvQYWJmMgFulZdL48WnoJUmeIuBWRBIpKqrQdkRqBbMnjqP6SZ4TRaTmvepMgYkmcVU/0H939nQ36+1JkErMtJmTUtCt3sbQ6FhE1zFkSbSeOonr3fpoTFmoUKtPIJ2OJscmcskuCwFMGq8eFpg0HGUxIZMfRvEQGXB4YGAKHP/zgsTRLTKKXAbm5HxITkYSKJkapGOwpFnXMEAJ2EnSRJqJs9UAMFINiNKuB1HurwPaaKZIHjoiMdK5eHr4Ig5Y8sZV0hQwWRmmZpemUpJ3DLd9A1NGU1fs91Kkah3gZUzf7Y0Bwsdcy9TzAGrMm/0//oNTe2tZRr6q6PdCQ+qvoCqtrGZj0n6EoJtxwP1ttqZ44FluLCk8IxSECDUSFo5FFmFgwJjPhVDFYDDAcQzKcNDI3ijEM7DMUxjEcDjCwFzC0DDr0gzYViDXYIBCCoCD//OCxOAr6uJcBuNLiEMAgHLagkFjKRaDAsCgYB6eZkahzCTAEBzBQ9w0aHpjbMRCMGm2aDBgY4JEhf9rj7kzEwKxFtyFbBjwWPkDqwE2G7AgMI3egJ/njZEYObGEjTKpzeFPx4ZHlWawNItiDaPLf/ukJ86GcBzysUY10k9TkcCGAjLSmWlFNbVZYb/XrahvvXmm1aW9dkvyeU3Rd7dtnsi2izrU6L7XVWo1eNcCyhRRJ/Y6Vnw1axRguwVVCAjHJJqMmjevYOgRYMaNocQQAtj/84LE9DfTMkQE7uL0c9eJAhAhMuKMP5AAdLN6FzVoZMqPYpOx8wRl9JZDFy/dwsNLMGCgdYOQ39WWITMTjf08TAmwXFSBVYYahsIOIz/SdYxgSNAzNm/k4b3VQ+6Q0Ba6Qsy+blFKtlqHLTv1fq2/0WwtUJCizt2QT9QEpq6Ls+ml0BANNP898+xF6at9/9d+3AjX0tNd5D+L79bTKnrgkdBwzoFoBCQYBBGWhMb2bB0UnCpAG25WGC4ImGxDm0AjGehMmYILmODZVEh9cKBeVP/zgsTYKQrieD7TRVMLMSsRFQReRn88OjgVGwIH2H8ksgYsmqcYdkwKSIJh4C0h7mBFUFZ8hIbeMONFzAhoHP7U6rpybha2U01yklQYKhUAp5XjrXbhRSjFBJjcuFP6BqxPCWc5KaPrLwqAzvRepvWbft9dTukte9Oa1qlZtb0jreo4cFhooxu1i0UZnVo2HNiQLHSJxx1Yia1rhrSLxWpMQU1FqqqqAhyyUqIJkmFI8AKdBhcC5Ar5huEJkdeJi8FgjBEwMGgzgB8LJkhOTnR4//OCxPcxUo5QBO7anAP3cB9DfzleO0vU0VEGFh4uvhZzbSq/Ow8D30KZKLBncrxVBbJMOewszQJBhEaL1W2puIx26bCrAQyCYTzDPf7u+Gpio/+ZqEeJ0iX3KKSm1nCgKWcev9v9X6v13SL1dRmf+pA47anR2ZcqPQcFVDReJyoogvFgXapO4cRIWIdZQTS+WdDUtrTVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUCx7//FvzPgtm60AUWmOLpNZHHbRmgOgPCxMb/84LE7iyKrlwW7pqcyjJmYaJILGlHTAQlD6gjFl9JfBqhAETDNZ7zPLjwiXEOqPSPK1yiwcjuuXJK1jdmivZtp3rpKC1jsq+UjpikBJmAsDZVs6bRrLiB1i8/zw1idLnFf7qf61/qdvqaXa7mJ9MDc40htMZzUjvq4S6TKxLouf9VrSaDPd2RXj6a71EJvsObwf7+KfpMQU1FMy4xMDBVVVUBCuySTMlMun4aGAyGA4OGPlgaZAhz17Gmw8YGDJhEqnIR0YYhZhkEl3WGGOA2xf/zgsTfKQJScB7eWpnZUYSQyP0DMZNLMdwGqkLoNfuzPQ2m4dM7AhAUwaVO5Oq7p0r6u60SLklHNmgjtzSX+9LUO8EhEHPnUuo8i47QDUdGMaM/oOVkBapj+ajOE8RNjpYkTjyak3ccjJo1JfrepP7cyRqnXqWitp8aOEYLrMk/etgul7hZb1sXJCs3PENVtjrDzBROpUxBTUV5WHCoBmRR4pqmAgiGDYKGBEGGNYeGeV1mEQCkQemEyAmnB5GbiRCShAoCMBADnw5LZhJ0dSUA//OCxPMt4m5cHuZa0IgPS8ArYOvQc1GPAMPwBGqZiRKBheAloGHwcWv9Ar6llIiDhCQYSzMwUKBR7B1CiNK3FEYJEd8xjxKJJyWLGeGerrpLOhUKpwlkUNReJGoaCBxyUU3Y1GuJI0zWpJ99N7u+urXq/UtU7ZNAsw6WNhYkSJgw1IeiRpRzOI4ES7q1xZavXqq75NCV+1wwEB4yBZQIDUwdEAHJmY9toZ9DgaFbgYIg2YWhAYaFsduDeZHwMZABkZUBjhGbEvIHJ/H7CQsrqID/84LE+y/iTkwE7uCcYABSZMHdihaDFNJJg7isugEuAcBYq8BKuEBbjq9Z0KBdOYaHwfDcHuSCB4FDdpbYYAQ6/RhAO6tNnKIAAoamTKKbHPVa5SRGoEnOE8ThE8g9yemMQL6pNyLa6kkyiBxQekt62VY4rvbbU85tvfQ6jMQXHTs8AUucHmOWecPCjZwosb1JaE6is1VnSJZzVWnxAhjwygCapgAqFzMsbARxMGgEapxoFLnHj6etsJjktFrTEcMN2ws0TPTMATFk8wACNQJRYP/zgsT/M6pKRALu2py26HOvwkIMXcowh2IFhOoeRYs3sOzLmqBnBqQ0BAAfIiNmM3A6Q04BAaTxuWzrWx46m2fJewFfDBanxmL0bQArmu3bne/QEBlGYSJEaSio/rOlqxoZjFi5eu7jUG6yROdRi+t5dNfuttZw0xwWXwgdpYDi1oPDcyx+aRfkn7oxwFY1gCHjY3tEbj1pALHytaJ+TEFNH98RgAzxAhogFUVhifMA00ysDzr0jNNEEwCGDD49A/6MtN8DIsKAxOYee8SLPmUm//OCxPQwMf5MFObanCoS3ddszeEclKciUNGtvoadRd6YofkS4BiAeDq2+5BQpkBeOmtZVmFoDrNOTAqGUiQh5OybJAIYMqgeddZZXdYqKI+fzpkiSg21Kl9fpqI4WOgcR+vNn1a7KscacQu1N01IutsxskpC92MV86wAyu2WXMtWmPqY48VKAK6MstN6j+ZJC55Y9aEVqZrYAC8z7QtN4kGkFAoYVN6ZuicY/4cHJGIwkIE/MmkWMYGeMRwoMGAbKoBmEgqK7HAAMFESS2guFmH/84LE9C4ajlAM5qLQISxKLQjAA4AikeykkUCEIw/cuBx1km47bVXANOFYMAAkerxmYBAUMCS1upZS1KQULpqfPWZf9OjCmx1+dIQmZMI5mLMtWaqqTLDxJhncyWUP0STBmSYzUpvz300qSz6lGqjI0Q1P1oM1SbKRXrRvtnIfeKvvmmPYXWarG9zxW2u5nPywOEuvGXrIKkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqoFOWyTkrM4Al68VQIkgKWZvalU6P/zgsT/MUqOSATumvCrkpghgomANtHE1YflZgSM7vRYAtii6u7/df9dHjsPwn8lBRQf9SYMZBJaInRgIiWv8bGjZRSfh/8nYIEQUTZnFfsaD4BSuRVYSrZT32tF/Ma+k0rWUNjkVMqLR0+YtyaNS2nOb8wbLURZdVKBl90i8ks8eFKGbIoKkXt0FDO1b1MKUVijSxJIP2RXMpA6aYmkGAguDpIZW4huMUH/ksaIKZicVmFKQa6j5g7amHR6RD1E4z6BkUi/xtAoBh7TE6YdSAiD//OCxNgnOp58HtHXKsTEIyoLFfN5natgwEGDiyiASlFAGntL2kGKgjDQMBE9Ys1QoAi1tZxyYbuvEhgCxz6WIwAKAxmUmq581qJkFSyoIlzATpnfQN3GcTgxJ7FFNfOMH8Ewio1NqavqdfUrNVi3jlqjncytqoTFWRXV2qhVuAiXuVl71v9FSiKzG7pJlb7aUq+qfr9LKwxxqy+8CiBClUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVSBJy3bbzQpgiHGIlukwzmZKZgiZQu9uar/84LE/zNTxkQE40uIN22HwNjQLyhz8Hpyg8v7+PeGxs5lKC88CkB9TNL33S2Nau8ga9PtdHhTfzu8O96ajYeY9Kf4pm7jiIny5qvfpl/vJEa3J7w38TX/1fOaUKHqTq+ETQvocDN9fRC/LTl/w5f3nelSQjUiKEvnNZqbORLM/3XKrrtyTtR8FK5+ZfIPITo39CM6iLIJ6QMCAzLXYzdKMyPK0wYB0yZp8zzL8wmqsCC4YMkYYlliahpUcXJoEb2ZBCwYriQYjCINCmYRBgbDsv/zgsTdKGvylN7Dxv8mNwRmD4kIvmI44CEKgMGxySECQYwkGV8SBZigUYdDnA5BjQyYUiCxgBkUUADGyU00BMiEUOUCtLBxiCBQzV7dgCAZZVIUGgAKEQIyq+feLLFL4s6GFcWBV/SFuMk6lsyKDKs4wSCEe0RYZs4UT7MyhqIt0gWA1bFMTBgJPKP35clqooxJZS1b0sgailjcY/nrLlfti53Vt0Jm/KhZ+aDJe1TYyNf6Ek3zG85jlV0NfZUWzKqsmhzmHHra3uraUemp90bn//OCxP9Cw9pIBO7U/dEQmNvzbkcX3UA35AmctvF5kKdmqvUhwQLHmYQIKDDsF9TSFBH2AwRnsYXXRw+RNXmgylcWhh159V+XIzAAOczUBWe9RAUHWjcrBOkUJ9BEKlW9RgEmW/SjkRWimkPpR7rRbVBKBm63Dg+o1JDfR//8aKv8Ij++FDttUG/Q7erynVTbKStTXn6VyC2luqeP+Zy1Q7QlpPqu/suVgGv8bypMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/84LEuCTTHogW00svqqqqqqqqqqqqYAFJf5dvt4zGpdoqtGsKWa861XNykcQMMrFPUtN9lH68VHiEWqLjKRc3MgKzmbY/AN9io/XFE1vsHNbqYTf86aKskwx1/UVHHuJuBRV+RRcNyvGN+v/+o79h/fCH9B/7J+xTdn0WyauvfojNVXl9fp/v2srjERMagqqDb4CdPupO6qVGCwZmOxGkQImKwrGAoXGK8VGSAAGABwrnMGAEAI1GcIpmTUcmBIao5jwKhw2wlQ8yGMFBdRIoCv/zgsS7H9PKoZbDSttMgFgDhF/5fEX8VlCAQ4BP06VAMCWsuLJlUwqSqsZY9x0MgVfYvIaKGLMtFq0Nzv2JUwMwxyX0nN/ccyJ/zTycW3lhz/3waIXHjBFHABjXypFQnD7hRzCaa7nJ9N/E5b7iYlTqICL+rnfnFW9zivQ+hxz5jmIynXecppyTd2dzzTFZixw4kaeShV25U/kd2NZFK9929QnG9IhMBoAvAYgmnR6Y+BhoNsHzAsY+URlkciIkGBzicZSxrjMGzRIYYFaOhhkK//OCxP8z+2ZcBu6O2YsCyEHGJaUWccMaCIKIbXVtIhQ4sGqpAI0MAsBDK6nEgOFAEJB6QpdtkASRbyHlLMXnHQCaEg8XJ+tfqLlAekmq15VL5kwY4Khumwr2FUu296de2gW91T/5uwIU4ej0nEALIgS30AnHynAaMU3scrGf/5Wvxd/F12obVm+ala/KmqT76TD7nFgGKHRCPNpngXFCMOWBoky/nFpBxCpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqQFdttwfsIrxEDCX/84LE8zLKtlQG5lVIXJhYI1NLtsmdJRMzQAxcoOCPPFX6poyYVC/tqEJ0TcajP1e3KWhIRmnig7/UA2eatygB1Tp3QE/8UAIX55pylRElQTT5izY9HPqUcMMxMWLT5xq91qxrMkdMZkawLhaieFn5mYQb5RbOPmYWf9G44Ft3JMlP99E577P1adZ3tyZNbm799a97v5WS2NeGBaaOHACF5jcwGLgyY2ypjcWmUjuLFwmB5iYhGyiGaruJmoPggNDCAmLWchUEOyVghWGAFfhjYf/zgsTPJNqOiDbSzycsvbuWSfKMbfYmE5CZ1CpeJJvS3CIrRAAZNr6lOc07QsdIWUXZbi/ooLcuW942wENwBrLDOqvEfuYgNqAwB43zg+MIieeTiuS89xkPRRYKMlkP6F/VlVGnMh716lRRRmxgynI7UU9/7I0sGnmQG8WBloMn6JMenSi4WAQZDQLAc/gZcXPG7XVp1r6W2YUCxnotmOAcDmSZEA5p4ym6xGZGjgCHoIEZhtAHHTecE6ZwMKp8DwpBoXHgOIwAczZwQkAaE1Qm//OCxP8w+qZcBubUnCoODwQSjBIdhLhxZhaTghC5qs3CQDJBSuF8H6XgGSvZtcczRt3O4oMRqTzT4Cb0ET3qfCetEoYDIj9HRazwRcf7eNZf1Mqk82+//xyG7k/Pbkuctt/+pvc07AhWNCaToMDPcqnbpsqUbRkiOOGLXF10o6sX0dNlR3feqLXaly1TWmdYfXPtt2mzHjMkyjoWfZVMQU1FMy4xMDBVVVUAt9tDIhCxgMlkwEMDiRoBhRgGIQQYvELYENRgMmex4Y8ggQdkbVX/84LE/zLa5lAE5lUwpMAm2XyZITbR2720H30lKVFLNxfBTh9QUqIOaYye49sgRuMzqq1mAcZN/NEgOICVff+04E3Gvm3q5EtYmMDDfQUueZVkf2OJD0QoKb/o2tbGsc5jMYe0ya4OksxDJpEN1VyltCoarC9H83Gqt1CldR8zldFv/i/4W1dyX4MJ3YRJb9MZ6Wn3e3FMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/b6XpVmtrQkDhcVR+MJjjNA4yArEimJCMjNf/zgsTrK/JeaBbj1Skig11wEnAZASgAJgGH1OipBOU2NqaYjzsrUP+ktxyCX2M3FYfUSa9Up285NwXXs/IMQ7c8PUQILN8X0fweX/1/o7VTPQMhp9SZVJUOv9XMG+Lk3/+eiqequYiO6lWRQZG1STVyZdrGNpehVbnAhOocH7IrLNMJOuCzrDYYWVEQ1KkpNFT2pWn0qkxBTUWq/9/gUBTXizMOhQQCYDDoyeKThAJMQqAw6BSzRhIuG9jWYF/ZhoYrWEh4AAmxIcCZo1yg4Q5j//OCxN8oyo5sDtvVKEHARNQMVBlkn2WClEyNFkyT0eJkQiCI67LwQwnLftLhudeoxgNokrgSGqSKEU6NSmpfxTvDB0SywxxuMgk/fxiXG7Lc3//2oEpQ5kOjp/xOJw0sbC105u70zmomuUax1YpGdGU089ER6qXRqZpSUAkLGO7YR1ygGqMDCBt0XJEHB8DjHq5pT4RqutopCVjKSYMjicxiRzCYZMp4M69FDoC4OknkKjIxwjjd55OKDg2mDjLgsM8EYu8zwVDD/moHIYGEwUX/84LE+i+SllQE5o7YZAAgoLBw2UGD+TDkgUZMNAQuOBadXWSh4QBuspGVJoPO9EEu5BLTzEwIHFkOtPeS43UyoKWELYIDLEoXqEEN2OKALok3u9OV6fr+3I0oTn//dti9B4miuEwlmNzR/NBUsh3pVqrex77zihtXvNJeyFQO08ITiTwiCxWMId9guMfp3se82lkiTHWyHWx6nVTuur/YIYBFRsdUqOgg4mDwaY2w5n/CHq1GZZMZi8HhgXOSnAx72AEbAcMSA8hggYYIgAbTQ//zgsT/MuJKUATmzrwCjKvjIwZlnjvmjAJUww0q6CrphSJ8+CohANex4k41FGmt7ClPw1DywIOMGCDxV+Io6z7GPLsqMemQMcOBV8CQKpbScJhMsqqPyCx3CNWm5rh/n4Z2BsYeJy4Zt80jEIyiqT+K6Zpmea/U45KlEv1Z6PyE5mtnkuVBUlqoNSd9KcOrUWNCBzNShrRTS4ovUpCmlkVyyRIAgKYeE0PAIYLBgYEgCYfCWZbgscojwYVgiQAkYRCmY6CgZIlyTIiKAiYcCQYD//OCxPcxam5UBOaU2AHuTkYvGiXbEAJRkVUKGr/AymMM4kq+BCUcQ/RlVpeRJuOs4fRt5ncWoJdLVTkRuFz1yUN1GRDcQqfV68FyA1c1+KpR2xlOWtf2WYtHeXX/+GIEYaYmVu12DLiBrIrPmP9NXrjG7u5tb2C26Jc/92puzn5kdq12PefbQe635C00KEnGchoY/hltbkxBTUVVv9+wAIDEAXMcC8IIaEJjB4Gl56fTUYktTDgIMABA4oTTXGxMqhsDBExcMQES12gEKACgIfD/84LE9S7DGlwG7orY6AkfRglrfZuBilLW/dSlMLgdvjW4zGgmKgxNJ0nnSUBxMlsrbNjVtqZAwkfjGdM/xmbHhsKTVu4xtCKPULCiYd+vAVrH5h6aNN+l1z/+gAqUHwzqAsWN8oNcKJOf6neYZlj89yhb9m0nuKzO7onrqzm/R1pK7kEEdh7oGLpTmYuxlc5UzSWS+hVMQU1FMy4xMDBVVVULlscEqCRjRiNJRgxkDAIxXqMM7z5MhLgMJAAxGjlprnsaSDEAEZeEodl/IITa7f/zgsT5L1LGVATmD0jBwS6SRAWLGSMWDDmXSmWREwQFQnm5IkWZchTSNyWCYbWmHV+YoV0oCcobeTKbBwtTBcQaHJ8uAWsr1yDtj6Y43+0VOUKXx/8twHdgXMKN+MA7lOO++YdTLR00kGDvudn9xMVv2LtmZpDPcQUZK2js90mZ7dLmLev9TIqjji6yHlpAcfxfvHrgRUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUILSST//OCxPMt415cDtvLZCfEDZkMkm29CoQzQk/AoHBmgsnD9jXyJmEOpchTWdyOIJb1jS84YvsWzyxuKUPQCQ7kdtVrPW4Xq1vffn3m7qvzbe1Wfh11EgNjQ3XsClCIb+G0PsJt+4O7BZf9l9iGoRWsJBlvVqpeIipdVNBg1vPOcqNoXZOLCDo6I4uOUhW49KaUINxa2iNVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVJUFOW272wg4nNXP/84LEyCMSTnw21kp+KQqKYwR5JxKeVRZkFZXViyvX7s9By0g5DKypPGlw9yw9z4ZCoFfGxhaHwBAaz9FTDw0shywtzEkajqtJHSM3YhfWSgvwVm+PAzuER8htbnDe4rVVK5miwKdKnZ2s6LUczv9SsbZle9KI+hVc3rmMY/fW/pViZf6W2O3LOyEFyKpC2Q066oijmpVM/9n4oEgusDBQMMTg4cBpgObgSYGFhwYzFoKVRkYJm8g+a2MItAzCwMFiGIQE7QXBJox2mHwqHAwIKP/zgsTPJOQGjF7LSy8xIno2wdnao12QNdEQ1TQ9zmRIMJryNZiHIgFu9LYHYAg5Ms2MIBlF9yZy6WUdwLkGualbyIhSOzBrHam8Tt6pBWCgmqNMnnhwykpeoXrf/BupVmi/Mf+05/NNike7lslt18x1fMRtWQLOQTPOdqCEgpZMc9iUuHNNtfWLrixBJrIPuZem2ym9Cm45Aacxl1iiRDMMIEwsDTCDDNSsYp35hEaGOw0Ch2aiJ5kW/GMxEPFMyUEDHQFEIBMDAIGxBwjIWjjq//OCxP4wmk5UBOaW1EkAkRiATfEIZcGLTQQML3n/KKKMkTkeeXyUzxBerkr1BIQCBYFROKGcbhN+Ns2HQLURGZDB8OSxuSAmXY0kJ1kwB2cpdq9phUa7qwo23KoWyio1cBWiBDhvqpsMVK/x+TxzrT/VdOIkPPvBlrPc459vuHmIjiK+b9bxHMuUbmxewIvJTYdpSmH7Wx4uqkMPE4WoU00hcqbqDJHF8NNMKowFCEwgIDAYFMdAQ0KizoIEKCAYlCRlQ0mwQaZhKIsdX5JjICj/84LE/zSStlQG5pDYJrdcEyOsS/IXEhFIkRk2m/NKPi/ZPFUelhQfRIhq+GWx9/niAUGNUEUbAXakCJqJlW3MYzJd6lCgEeZW7NO3LLK5vVZsBIXpg62i5nogqNDDOWGUdJVnv4adbuW0I//M/5tnLHSy5atvv3UsZcZRHixYkXtV06T1yGiVrBVF6PlO3tWrQL4bxahqi9wNBZlJXmKgiZLC5WEjE0yNU18yXWDDYSMbCs4/rDO5YMqTkwaFzDQFAITGhNREAMNsLIIGwhG5s//zgsTwLUIuXA7mlvDESHBkSAA5zSAnpmcn3ERI++2KVm2i7apthw6FTy107jPBZxgQKm0kkajE4kCkMGI7GECXdr5TTs4wVP8xTavd3jDltnz5f3GZXDQkprlb5FE7oVwkSC2GkVlX8fyh//7I/lVb/2szuEsD3iqKzfS/pnZ+rkLrcuvdezJA+r/Hr/x/6HOEP3/v3H3p/8r/1BtMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQP+u8RJAg0pGhwA//OCxP8yug5MBOaW9QyKQVpGMWn8QiMQRBApzDvBinw8GmU+CIBSO4NcmmCpNKpncatgIfq9f3UjpIWlMriv0ZsgrIska4TWWAy7bvmQr+SMEdXFExvP3+uA3nvOLdCKm0L6CosatLlnx1653Qj61MdrKapZazMsIj8OCBiXU43QhKe97L4wz3PfvvSrrecCFlb6mixBTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVAfbbSReZt4SHAAkVNLAQUaQHAv1ipaYwM2MgBzFUQSL/84LEzyTyLnAW088ohbI8MMzW5AZoB6pMqkI8ONMdCKGIBGFy1UYy6Bgwy4llz+9jqKNSU37oOHJx217Z4a5pglC5iluHcHh5+r/4QEHdS7KOZyO5KizrCbKmykBsj/bID+cv8g1lFEvO1yvvILO99WOiUe36NbqymPmRlW3ZLtmdkdURfO6/u1GbZ7y53E7xKt+oYkxBTUUzLjEwMKqOONKHB09ADMMBTNnUMSzE603j6Bz41oIMiZRNXNTPdEyQDLLpuixsJAJVCDRcZBACJP/zgMTkKevOaBbai4CD2iCVCZSnBS2H+wi2SEZ3Tjhp2OFAEpUdQlQ+91Msow5fjX0+J265kfyRXwKiIWFzXLbRt6uwf3txQvvdzvvjO//eyPTRpFEIcaKpjRoakKSn6o/Nf+E0ORloIq6M2iLs2dzvXZ02KlCMe85U2S3atbHkb9fSz1VvP2VGMrXShhrCDKraM5E7TEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/84LE9S57zlQG3orZVVVVGQVLbtuo0rB9p4kOOiOYZBLnfY8oK5+nsilq6Qj3KVw1u2Guf//QaKEWI9jrKhbznOZs62QFqHKsTRLD+f/Gfr9/ak9r9TzljxBh9++LaUb66DqyyaKbzL3vbstLMa9e6TnZt1d/r7GL1nsUElNodYmYjiMW/ctz5hDlUhaPXXPC2ng2yDxMQU1FMy4xMDBVVVVVVVVVVVVVVVVVAJ23R2Tg1VDAcAG5egwo7NLFTxTowwBEgswYjKCkx9iBo8dRQ//zgsTBIYQSkD7Bx15QJEqwQs5ukCaHIMxRVLXl3zLLQltvL660n4B69I5ebjvGgnbmsJAksl4YruFuPbxvw2/jJapAKq6V29PxY5X5UjEyHWPllFNxMJlDSffM3a0V+gs8t6K5tt/wxh/72f/pnxCpzyuXOC7YYQfX2SVJxCHk13j0I6BKvoPkrkx454ae9pxKnqNDlgxM3AKgqmEOK8YEIJhgZBbGCMBWYUwUxhuj0mSeFQYAYA5ggAXmCeI0YQAg5mSJ0GE4BOYoIXJg/ARG//OCxOkregJkFt5WnATgJGBwBmYMQIZh4gqjQMBgFA9GBgCSYE4AokDiLAWmJgDKDQCkvk9iQA8hBTMSEzVGYFDoVFy/IXDTDwgcWTn4gwUDQ6BAEoICrtOpUAYHSQSAgwNGgAEA5n4mDjUFDAQWOIuZjbGZe+r+taVuCoEAo0MHnDXM/U/I3Be6VxhwpahOMCMRomismhWmwzDjWsqKgfslDCAFi7a2okvm1yl7ulj0NQ+8su+ftU1LHZb9vtalbgHAcmyxor3dd5vHHyhze1H/84LE/0zTxkAM9ssdHOs6KLrM/2QeGB0BQkJsLnMcONdRc5nceLzRBdLrVWc7/lKy1R6Xqeqs5Rd608ch46m4xWoAmOSSmlpgw6oCASF5CAsC5OClGCAgNLqpxGW0BEuK/KBmQSvZhwDI0lkm2KzL7A42lkuzuxmeTR+kefsslJMcXLerr6cmZznMcWY5TtGJBDR5pUFmR06Oo/1kgAMA5kVn9kansTgzsO48ofBlqoGZiZrDGsgmqK0aS0FKrHcGdaXX6shaHDLkVzXMOnf75//zgsSPK/rieB7bR3O9wJRpt8ClyGGxf9jd9wXXtJS7ryT//+hm2E3SBzq/ffUL2WmAIvGLBPBhQmeAuGNoLmIptGXgpnYBmAoYDE4MjGczDKcgTYnizcwITCsJjFgPTCQGTAUBh0EDKUzCzABCwWTMHFdYAQeGhAQiQOl8m4xYCCInUbW+OSMEkAQImaFSw3OJQlNlaQ8BhgW2oQDMRhbbLqcMcFxZkT5WKWthjHSZ2NSDGzQ0tsHMDaVorTwnN4JFEOavtWCC4iAYtnLtTHa1//OCxKM6It5ECu7VGIwppvBQ8MBocpauniyq73rLdVqsigfv55svagvA8/T/nMrJnIr0RzSVK+s6crmErWohN3JsbZSQULxfZo2jyKVMj0JqSUUAvNIR7Ney3MdAWMrSGMPQSMORpM6jYNoCRWkGE+MFuYFCUbtfGZvjibwMmdjBmoMRKiHEz7tGAtC8I1jSAMEgZiQuN46dSdSuXAAQsLBhyC62QLijI2VINGBnpyL4HA7YnbaWEHz9oElnS5SEHN+WgKEyQFgoIiuflUwTAtD/84LEfjiq3kQS7uac0rxdkbMAqNiaFNSJsgJAfMUD5HGIGD5AyuUS0xkfKJcRPMfFdAUQXCJnDQgw7UyZNuiH/cgSaDrPK6GL8hTzUGupDqZal3ZW7r9Fnrbtu9RtdtR6t8yp4t3JREC6GzMNPY1X2UpxABAXIM2oNYWM4zEI8MUcwfWcxofIRJmYTBmBi7MihcNrikNdvuNsx2CwXmYQPFgEhIBBUFDCZJEGBQcSIWhJChYGBYADRAKEIy/T7o4gkb1gChUiYLzAEIS1KSSXRv/zgsRfPBLCPALuW0wFBqLVoHAirXLmsgIOH3Hg0uIcZOoGysUOO9uFFZo2c/+lophU12Al/xyBzHWVppI3STmC2p3G59lq4w4pdnKHlxmeUl6nnZZK0yAzmQENTDHPKfVYGklRtQao27J4hSEj9Cy09Zk+mqzLU+9S3SWgpFnZnXNjzVAACkS4ZIlwOPOIu3TKRcipjpBQpCotFRf76ifVA5ggWAUhmIgwZBQQkbxAwzO6gOyigZB48FjFJYBylOP8Y4UFmSmdD40QPbaNFYQE//OCxDIymgpMDObemBIWPxocJmguCXtObKV/RGhdsIBA4DM6QnyEQXAO2JjIQZenttAdp8F3vSzB1eQmHm4thAxlVIBEdTnAiFHr7OKOuABCHl+xUZpFMlZK02zitLS9JvFzev+IYyidqW1OuY+8U3jfNncf////NPsaKkmfeIzpxDjjJobOmwcWlRwaacsLJevlLKxEK2IGJ868LIYqcOIU99CTdQ/Wo6AQMEBHovmDBcmEIKmAgcMGDJSMDg2MTgoMHAHM2wTMZYzMdhVDCQr/84LEKzQSBlAM7p6ZhjIgxI6XmPMQGg4jVg7CGVy6Y0EPkoRgmX7fgqHkTDKvVBIUGFmaPUQAzerkc2WQhTdA7ixItK2ns0ZCxwmGzcsC4izmmUSFzt7M9VYRpNUvuFp+40riG7HzelLXbI8Cb/0hBbvWTeojnmDv/HSKrfZ/+Nf5r9myeBIlSwb2JuLu/Gx1pjW6Nn/8lsrfq9uFL5fTv61f93/J++/052N3qTqP4frWlVeclk7Kww0WBSciaBlPhgD5iBpKIUXLcGGIFSeDuf/zgsQeMmuufBbTy06KhBIjLnbaAZ8CuAqBDYAJZSQoDO7sqoMofeowAx22HRCnpJWLGXGt3nJTriYLdWGSdiZP1OjpQ8ZAEonYCJOpLert7CWDoeOWpIb1z/0O8NN4Op7Yy0MZlUrnpyJ0+2U70OXAqRRK7HaiqDtuQ7/hYYxRBfOjeyMR6uAgeHDCofcrkS5WZj7tKdrejP0ORiGZXkOQysildHI9SMYgkPRbWVHGBNZxBMgLca9CAZOSTS5TFAcOJQCLjQ4YvSAaZMcFlhjA//OCxBgrSrZ4Ft6Un4FMnQTIggxrABwsYoOhSxWnnzKA2XiIsByMNw3GAEgl2WcRUfVsMQhgyJanr0aRLwncZWqlFUaIT9fKr7FqeUDwyUVeMRyx1/3HjA61qMTVNBkQ1VbOOIZAFMcpUUTcy5E3mil/btypIu//0RvQ1J1iRmt/U8dLiuTn+nxt4V+uNpjw67GddmfrkQSf13zXcSewZRf9VQGc+1sucYkQKwGJAwcEm7t4SYhD6mMSBR1A8YUBGyzwC0E8lSO89kpAI5LiU+D/84LELihKsnAW289IAIpENxgsFG8rw7Ts4c4BO0uYG9m7DCWtU/246FwWMCFud8VhtoiEEB+F3xLIK9GtCr8yDM1nX8CN/FSKoeFtmH3KWLMpQMlz9TUf6DPzf6ll3/+iflznPqTf/pH2CJEA0CjTLhx9j01uRdkEOZ05ALO3CqqgPy2334MDBXPS6ZCI4EoBEubK5jHx5B8wFPDg2TvlflsClgDfJLYiE4XN6DgCfs1MolZQsnN77kYicJNREERGMl1sS8kgzn2WTfqRFbUucf/zgsRQI2K6jDbbTy76JGWTmzsqYeC92EwTy/z/lBlvL/2DB8df9NNDFTHxYpI9o01be3Utg2RS5c6qpJRTCNA1R5qkITyfkO7iKgAJv/9JDmGDkgCCkwMFM26wWBCQmrkdEzUEMMKzRCMHNatjgyiHqdIyneYaln4htxy/dJZuZtzzMfBZNSO9lT9aP2X5PEgFlCXMHc1zdKzjaj4I4v0RfPXUmOUIFbeWO7ERMH9VVaHK1Jf+hLBLups0bXywPJimtTOr+UhytlRcQlwO0JFI//OCxIYnUn50HtwHcCCFFWNJqFu9LrBU4pr37FDjSk7Dn1aqKgDkkm3UCwNJEu8pcawwH8gMnYK0crLgIYDOyAZsLLIpIrKa8HEIMijMvop9klnPWdinAwiWxLmOpK33ZjK2LDp9T+OXP3pw8megVDXYSXz8JgKflG5R3M+/JWqk18xvVBGFP1HbrMIBRpeWZS/afNSp0REQw6gWUCIUakXuFASHknkwZcQUlT94ryfcq2K4L60UNDdMQU1FVQWcklKkcix0wAjAIEMZRMxBgM7/84LErCT6anwW0pFuulSUEgKSRJmKyiBlGKOQyQMAXWKgmJDUMUsXcPv6wlFQQgMgrVss3xa5929LRIMlIlhbsiXQtzk0A8a4+PvWLIZLbpGRpuThblZZ5m7UhvexYs11r/lRt8//Kjd3t+3E4aaQEDce8utjZzj8HGDzBEXYTFgE7Gj6kqsh4yseDYPCcsyzi7Tjy2sLbklwUC5rMlBgoMPlQwiIjQP6N7Jg1YqDXYdMcDIyeTDGZ9MKbsOCBkowGVA4DghcZgY5JBawCmEx8P/zgsTXJwK2eBbbR1ZIt3D65jEQvUTE0OBjCDzJryLbL3pgNMa/EzQFVw30iVMbcbsCAOq89qG3TXACpVH1NjQFlTl5KnlUlWHZvlYISlY7X1u4V5NvH6dT7wB/1GSOZywHVIgB7C7uP1r/CR3v5r938YJ7p+e/m7qtK+pTuf4GHXVhqHakLTQi1jRKOUbFUOGoQHTwi3ni/LrBNAEPoFx6TbimQIBkyyBMx6BMwfI0weAkypIsziLAfLcwdHUwRBgeLUy/CgiPAyxBgwgOOFF8//OCxP8zqn5YDuZQ9N/UhzCmGHTBDUJMU/WjrGCoa7T8wy6phpeWAA2wxhD4ppww1poocbRtlsmUXMDIG/BQUnVlAcoyoiIndkSLQhDeKvRrCUFgqAKkpulTsAI5vUZsTyxKgM43DKKTqucmZSUKLTgy5ikr8zTlSbdaLa/P6bd096lHHXpRWvspLmUp71oc8uh0YJK9TEjkLttNuBmNDJliCVVMQU1FMy4xMDAA5tvNsCMGB5MwwoKDAwFJXmYgNJxMrAkBggBAIpBYOBddAAD/84LE9DGKRlgG7tqcEWNsCUxzgILHJEjwRhCgJVZ8m1amqz9M1V8aUhLK1BR14+phqvOUIcNnWg85ljXqupMFUkRFq+uU+GnxjH4Q0CeVRxe2wvYY/R5Mg/zxsjkykDOQM7HOLv3fV7Ofqzcz7lCeyLVHebIGkKhjyaDCGi+se5b26TEuY1tRUh6S7AiBg8BUhwoGtKoAr/ekECgyGdwcxzGYNMVEUzNozgN7NmiAWMhigDmTjaaOBpslCmigKYXARjEUiQqVqXEat2jCKUDtH//zgsToKwp+bBbmlJweVKwFtjHC4GtTrWB2QsQJOkyFuD/yG8hOEBmJRqeiQlStoAwcTiMRfqPw6mnFTJnRIdF5NnclO2Mkwixk3AiH3/ziWLYe/9WAW8fwtew/JjJ4Fj0E4PHF5JjyzdKiC/Vzz2a1X5ba/d0Qkemqm0fKsmFSxU0YeeFAMm3CL28NbnIbQeeQh4vTWxCApXUHagtuSXiMRmFlQYuCRoIHdNOFw6XAT9RaMcDoBDUxGrDAhFMvU0wuAx4AApNK2K1KWnGKSIQ1//OCxP8yUoJUFOaOvIBKzQCWPOuAlUNQNHpYZs6gMODhTXia4oHcxaQPdPfIZW8IQMj7KCAJE70toqJGzZjGqACWzNST6v0hMEsWo6RAq/4yXkdt67/wiXGu+4fKLkR8bNByF15Rv/j1GVEfU7VGKGvEEUDGs3n1yjjCKlIQKuRW0GiLXrcsWE+aFHzaACWSkeJJsoRctRoe1BNMQU1FqqqqAORtw8VAoY2MocaDH4UMBgowdojM5aP5B4RhAQAcwOZQVAzJSyMtgQuaZ+DAkBX/84LE+TDB9lQO5pa8MCPhHIMAjKIDvzKkmBJJA5a/WEOMPMQlMKDHNCr5lWiGXaZgZoU5sji0SbHBTTQ5a7n47sCMDBQgQBzyTT3X0y43RcN7ay2Pf+N7tDR//4S2OnfQlXQFnGDVGD7HoJsLUCQ5Vpf2zi7UYhUQXLKPDdQbzg4DrApJib7U7qPXzKufFu8VyPqMSdWQUEpgKJRkYQRiqCJjIPJjiCBlPbxp1EhrkjZhODph6IBi8URj+Nhly1Rj8EhhyEhgQSIKD4vCHD5rjf/zgsTzLcouWBbmiryw+BSgN8zMj8wYAV8auJRt1lqoUCCEMTEDWnEDHjtg4TsOKDEgx9Pd5l7EJsxEAYmYOGGdh8qg+KIcVKzERwvKDicDNLcodcFF+DKUhBGdy6eQ9S6u86+ncHP5huSSN/ImTsEqBHMyUQ7oNgmWlHoX/+yFr/h075mXvPwxzdzGnQ8xB559b3nWPD8R/0+96ZV2SqUhmvUEjmlyVtDFCkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqoB//OCxP82GipEBO7WvDtttrbGvUqlTzIVG7gLW7bTi4aMIXmmbYTW7bpF5abujFBVJWF69A+XQRpzusfgWT8skQfZ84A1RJD000fUzNK0JdC8inV2LuXx8k4UIuICxjc+PC1oqZR8f7yS1a4PoBp3WiPvHSsb9zqbU/L/O/rtPjTzFvrwYb/4SfsN34La7oXlg8m/HEhjDtrwwIpqcQhh0GZAYYWAUxJnsIeQ9TCAwfDswjB4z+EoyeFcy4T0xbAtrR8wMVjABAEHQrHpMgilObH/84LExSJ5zogew07rAwE7ccv+amOkwFZkUYEZaNDA3QzrBC78AOkMFgKsEzesscJBt0lKxaAY7EnAftVIig1sECMBopSuHoFLv0u66cV3RVAQZtlssVE/T7Boexrj5KaD+Xom02Uj4bKra6Dpvi/WCQoI22AUTOHgQgaSg8xKNZkIFVJStFWqY9ANFo4mVhjoj2ONKUtuxxZjxyL1ANySwGMBgwcVDIgoMSCoiJJg+vmtWeaVXwCXxlYSBzCOCbMPGBVY0DAIcwQ/CTxoHRjgAf/zgsT/MqHKRAru1pxZoEBIBC9bhGAENpcZYlWzJrQZbMSjOU2LilANzBkUZ0LOpfl22spxTaqDYTAlTMi1ro9pmIoSYAhxa1Wx5UEWOUYm5xyGiytiXNwuEzdv0huGPGxR+YAhiWmf6cKv3+cH+daITqPNBUPI6fc29zVjHHpjO8v9/++tb1v//Gs53/qkGOQps0sHZZ5ZTBV/e5yHMN1kmb/Tl0Bx6WLiOysoDN94ZRuMVDxYaBoCuky5pO+JzdjJpw8EmBFIcZmLhBiUgZ4y//OCxPg0+k5gFuaefDwKjisbBQIx5s0w0IqNhtUoCDtHBVR7YrJm4iAUmOcM2sZ/rrWiyU+ziCKqrJbDqviEWaUk5z9YtlvJKkoWhpKkbrZQWxK3drEprEYWXImqaFGOzLsRACzboppARvPKsYgfvOKJmP7RW6urW9cumpyKc33cn9dHdZzstyygzMvfaJETFRd55bKfYAUmgssYZcoNyY9Zq2oS2swbgYxQyF4CMoOAhi6YGcn+c+Bg6DC1ZjEQGHACYILJhmPiQuMYAwva4b//84LE6C6SvnAO3pScAGCINWZEOlHoQgjosQMKIBgKAWSpGGm0iQoUpMG3Gzzug6hAABiqsQtc7DoJD4SktAjaCxhK2XSlVJ9BEDAYZV/yy+lNL4dJg2x2kk2PqztB1W52pgvCrM5YY7lK0sKtrUWz2289tzTRBKHY9mnfqR//9+x1RqcqN1LN3TSll1Y0+arsTO9qzk9TqUfW32t+4FrrfLvMkrX8O/+Vn+zlZgiSRaSshisHYFAIwTD4wQB4xJXgDpWZ0D2OgWAhHMFxNHiBCv/zgsTxM0LeYAbmzt0HBhwrAGTGYNyKHkyjImDQWTgwD2AUAJECa2ZdKKyDVDWeUZaJRUy5giFn/svBRwKIQhoxMnb9gtMuaCWsIylRkZZ616WxtKmHy0xhCC4py069yPtgX3cxqkQaEshDA2s6QavGAXCfdJzQBpTWksiiZHjaMlosgXzIsqrQfZL6jb9/+/UtkziU3HZORSWUNAfJrdmOqWUs0tDzTr1CxFmwRnCVAw+dUKUA1da9JILDDRAQlAQFswMdl00HbjK4zAIREQUM//OCxOgy6k5cDu6gnBxKQGmCBYardbFAcOoW48OkIJABWNPIFAKGzJ3MMMOEaw24WJSlh7LB6QXgOlKmfznBGGlKW788XDjD8NtsL4l/TlEvaPrRAwJWi7x5c9xxr2epJZ3pROf1+H7svlRZd/8clR63nqz2SxTnlmOUagWKzxQTdBf+eQb//X9zx386XoiUTQ13PPVjXTpV6a2fORlKOZa6aM6W9K2ok7TRUasodcyL1CtSCXG33QRGX4HgIBzC4RAEG5ggZ580URqGApgMBxj/84LE4DCrxmQW5o7cDgwYIjGPD2IAgNCk2MRBzUAaUruipgwsDbwyBSNpDWauo3EwktBIIJpzF4dBAaxc00JBQOa25vJHYiX0BSLTpapx1kr5l6VtDhaYogKl5ICgAdQLABi5KjTTSBp1S/BBQETnJw3dQFKGZk0EEjoF8QEVUUhdAmij04JmblwGUsZVAvmRBTdZgfWspJ/Y7//1/Vml45RhjiaIqJjoYDMs8PjztBU6Q5IVdtv8IOVco2mPTVUADPbaDEQTKCJWUwULLrjhWf/zgsThM9pSWA7u2pyK/ZxpEWxHiYgEgMBFzzeW9BIX1lEUiyfRiShFNKP8PvLGAoKEZcOvYyRSiNhBhuJmmTay+H2yDweOQw0N/4Yq1J1TADlXEr2mb2mXoTW3qfDPNwRG97p1+Domr/SBJdFceCK9/LsgCb5dbzo9Anmc5gNUCOQ1//Z5v63S6hck46LjHWhhxgeQQxwhHxccQYdSxd6xu1y2gslKhKcR22wTvmUACKWWHkBRZUwHAQMCADA0YBlmdXiWYniEWnDAVMHRLEgY//OCxNUssepsHt6WnBEI5moLDBwMqay6coMQPMXzNYrCXzSIZc8Ajx16DAkEwQYEYmIFwqAM19tdUPcbshhbfqLzC9aGYZKOmjdpXalMyuSLjgcEFF7TtG4XPtL2t7nT7qE0EUhvLoMSaWtbhDOi6xtNR2CLN2TSqL5S5UQnJETA99RQb//S9WyK9dar6vp+q5wmPefYlrjJomsHmUfcaFcYqXAza0SiR4B0mwCMbbKSwADAZpMjggIF5gogGTGCYcHRsYZjRCMsBA0MWjGQAMb/84LE5jBCtmAe7pqcwuOWgkwSKwEIQCAWYLCAEDBZcmp5iYoyJcwYWEGEWBZSTzWsw2IyqQJk2wYIMp8WpCGZoNAJbAFNEFNEB7joI0fwCNP2eSvpJWoqvAwxAGJE2H/23HOpLXcnOW9+QNg6tvbayzCfvqa9Nto4J388J/EuRceHmHtsowa95I3hMNKa8Cnfl/760nFqC5QLn4uXU5TBXMm1uXixlQs1SixhRy2uWSlP1kxBTUUzLjEwMKqqqoQhJSbbVHjAIS9nsfgUiP5k3//zgsTpMrnqWBbmntRZK2GYHnHCBTKxmvQrPfniK+dBuWjItsFDFij5Zy4uQgts4YHd3mZGCy5US5HRrHhdVhATxxRqttILNN/hZF9BEJH+gnlS7knVGtoNhIIIOhqzh7tnXKM//85/paaaYua1HmXc50NVLFxaU+o6JVVhSeESf88Io5+rIt7U+P/9FePhR3HEX7f6tUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUF3LbNKNmUFwGWaUQBOY2PEAIFrwIj465I//OCxNYmmraU3svOuyTWondRHitrcYJSTKyYQhv8sXwlInzSR5Bh808rAqQr/dXqahT2h9rIk9ANF58veK6Od3rd/25//rQRhb+JbnP4lMe8hUYbPdSAvVVAiaijYx2dFjWa+j/5r9JyXWj9zKmrr7qxhFlPHug9v8OAs86hlJcl7dRev65bT2unLRfxNLL1EQSF2T6lCZJGfjACMYGAiCJgIrmMAYZ5OZTqjlhlAQ3CCoPENsZhwdmlnqneZCFCwbhPoWqMHmAOQAOhJkQNILz/84LE3ShixoAW088rCDq0VYAKvA0BGzTBiE1RZbxnuLHaeiTuQvtKOv3pAd7RDGjwqEPWNfOWyRV1ogXAkUmdAnXYv4SoiDZ3r572CgQrK/UACbVd86olmXakhmHiVu0//kpsb2vRjP/C5NaX8s+ZURCoSFNUVgE8bDTwkCzFiC1CBcmkSw/Spq3rD6k0nwuAwmFXmY2lqLlMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVAN/b1V9mWkY0NEg8z0qZp7UMeIWl3oaBx6wQwP/zgsT/MbHqWA7mkvCOjR3yyBka0YhaXpiymsERmDS8rfIUMaULhu9ESWOTFl3kNOr5fSqPORc3WwaDKHTS2SfAI2f2ITeVjQ5WM/r4fXrc/AWZgt/G0371ycoLySAae/Wo69F9HtTq/+b6s09kOHv04WkvEcz9fMvtjzSn/ZzvxMd1jdrPifLzLyN6m1RqZZdNRksbOmqZ8SAsxwbiYbGARmYdCZjIun2A8HJ0mJgKRZk0dKQMfiQzdDQuBjEoHTxaKu5WYRp8wsQ1QMmyLVaG//OCxOApKl5sFt5OnQlaIxIRyo27ALINIxEcJgxyMa6HfiBCUAwd5rU2wJC95m0Ekq/ROAuCD6i67ZhkKaaEN/GQY5wW/eH1RRNGYfH+RAZE0Wl6DQ0jOU5yMEzEFU5UVuj0LvznUnNO57aN729TkWcjOjl999t06XgrLr/1c+WXS+NWv1q+M7vko+IgWv43/0iIonI8nO5VaqgWEMIBpAQUmHw2AYOzCxDDqMIStrTAAIwwozCAhzBsETCcwTBxVBoKBCDwXAVSS6EFzbFz54D/84LE/zGKclgE5pTXBVzdjwwSRABiIImJKIZGh0Nf4CxAzyNQU+OZA95bhYPGZGRUYBLpwQ8vvea8eI0Bi3LiVYUsI7wgQGGPwuYonm/BbK9ufHIRht6Yxvf9+yzyBapehzAFqPl0GCwGjwtcKDZqkee9Duo8rjjObqR/yPllPpGjGJa+96N9a/J2dhq1mPa/LYqXenOHnDaVvuGR0EjA4TwoBhh+G4XDAGh8cSnMArWJAhGgYEI8KNDxemTqLg4FQUTpMAbKIW0ALEobNsE3zP/zgsT8MSIuUATujryDRntcGrQsbBVx/lATKlQw6asQj0eyOuyAHnLCoOIOLKHAlimr0JvmPHKnAc5NeaiSyaIWHBBhWuzdpeXJtAzDT6DlgzHpr84ZiaJpmpCHhAVc4fkgxBQaYIL/Pen0Y8ln9G+1HNuszVT+tLJV1Mey23p2SrMrtvVu0u7pWrcvTNWZGBlBqhlZ9yoplgiqDJmODyuRI5TB0CDBwdDvIYzL8YAQBhiUABggVZQGhg+kxnUlRlY4Ki6NDEb4VGDA9IePDsQQ//OCxPswCxpUBO6U1MfXTAweShQkYCUXtpeZjTCsGPRoWAzo1Rda9YmIzQxsJYEp2t3FC59hgBImwqjZlhJCY1PoPNhAgyYaQMojWEFd+AExctuEXVKDuTXbrDoUB5FGpyYCxOj+6ZSPGQeTZZePakqmUbVP1GSE2k1p8xiikBlhE2YOqp7ju51qSCBd/ue7XTTXULvc0VoVRm5MQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqgAkGKc2/3/bLc7/84LE/jHx7kwE7tqcNWV9GIKfFPG4ectYdY49BKGV/O6jJ1Nwr+HI6+Hkivcxe6/RSFWXcNWIRF7+hw0+Ju2BEIkVxwP+Q/ZyRn/FQ56u6IF+sgPDBAXwyn8kKwh3UNK7MOUzr//hO67M6/jX65Rz4q9Jue3TSuI5/l69afhKjqaxpvpEtjtmqVGnBQ5CKAm9IABcRCYKcctBQTGDBcYHDhiQFmBgGZRE56EcnOA+ZFFhjkbmJT6ZlBRgZbmvBsOCUeQBQHi4MFjwFBJvQCmtwf/zgsTOJMMapZ7D0JqgkPl8XxBgQcJOG7sUAKIEkjNhA40EunEoGhCEwEJWcpHrfLtC2tg8LMiCJRBsRq/33kDH4kYcoFScP3KWXUvwDLPpkXXSl2MzI/tf3mLokRmMi1MqgIISwDgGjhgXRzX+XnyR/FT6ysF8PHE81S/SDuf36v4yRweEw5qJwIirpQPmCDi06iTD1ut1/q8TToSFCw4aAxRq1qmFwMZncYYFTGJQSWMX6k4vnjSy5Dh8YbAhg/6GZAsZUTwaZ0tgESRIKDwA//OCxP80QmZYDuaQ9IcAQzMLIsxyYTWoOAAcQfXmIyY6QDucsUdCC5ggZj648aH+DUXskIhOCQtfzBFXtgOAqYGu01QAcFm/KT87To8LtEB0FoxoXIL9TL/hugqCoe1T6rP3hlhytq+NCYhnhn2IMt5X1TPNlfhXOhBWFbdMyvsuGv71Yvmb3o/uLLOxwGxy1PNspZ0J1NYxbNtRS16YVtpYDp53ngRqAL/4gFAhMBSWAwwmAgzmA4DGLAmm4xzGRY7mBwGGEYPmC0QmJQFGKJX/84LE8jISflAE5oT4Bn4HqJTzLtTLhiTGDAPG5tmYMGDW2oqFhUBj4q07IgQohgwk1s7IVvKKRkoQGApKMimDpVHDYr3TeLYoggrov2RO80luylpnUEH0Vqe195zuaKglfm7kGQFly9+7ToPzje/vOqf3v69TLOev6DL+heDGzH1qhSMBhp+y86dgjl/nJTLAIUh0qSCHYbMuQlRyxiHXIcuvQtq8e6LqgtMWKlqKCnHH2GAqZKLJcwwsTDDIZMGQIKp052NgEETDYlM0QYymC//zgsTtMqJqVBTuhtwwusTSpiBwYBQQRHiTNBCAgsfAuIRqGGEA00zQhBipUIfSmSM1W+EEFWHEJU8bbcqiAgrAiWktYiYBlPYjS8ZAGIDzETlz7S5FcMaNRtfZw5d1jxJcmCWNQVT4fj9emZk2+Z6Sg6AAcrqTj7Ox7brzdTPV5N/to59Z3rvd+qGpUtFBhY2KpBdV4W3iB7059mTsQ10OuXrDNkWe4vYNcQr+3hFAkGFEUDBjchmEgMYlUB/FNnHyUUDsiKpm00hhaMuFMyor//OCxOYwIoJYDuaO9NpYQGV4QK4qtph8qERlB0pAorUBc0GCCBGgEZS7IjJLXNSbd06aelhL/EgpZ8qVjlhCGOFBbkhzGAS1ha/A0Vtu7TiAmbgi9susyr9ZybDFmI0cvbiEzvPn/cjrnVi71HAEkFc8SKqZ9Dn/LfOUtV3Warq93yZvs7bdrrLyy9x0g1iVSMjIjOYTVsatj2c/dT0RWguNR+CENPTFQcOGWEA6HGCRpGQHGDlKVoA1MGLjxjX0cnrFulRK0tNgIYDDDzc4R4b/84DE6S3iflQE5o707pkHDP6YKixEJJtsCv6MEhISBoCYhvkyzZVHioKDCj6vxHnWPyKSydQegJ2lgVEa9xzqUCHi7rN8bcpu7xczeUVKEOqjxQxqvz+WZuax1/48b7e86kpvZ/jsJPcf9iLFl/CIHn1zH48K5selakzLrpTpagDAwtyGIeSoPPY/ck/eobrTRRFdjmgsKuABqPWJmxHVVZLoUGk1aBABAoY8hCYcBmYWFGfxI+dQG8YCDwYXguY5gcCicM5x7NSHXMGQIMVg//OCxPQwyn5UDt6G3BA4M3DfoZCUwCQcxiaNYHzNX9GtJkEFBVDAjxya+F1MDChiKWyk32NBQMooraQlQCKXASVAwCVAU8hUBQCBRYw8ZbobwEt40KuRBlsxE2NHBi9TawU7VN19Gd2bZYAAxZoqRh0xZm+/q6VQFUEZvYZdrq8k8pztKFd3KMdBIVc4q/UUnEuogPh65jI6UU5+r0R61fx5iaHoR+6Vvtu1ZH690rQ/3W7K8z3R/27mKjqRzGRHVyM5xeR5RhAaASn//6zwvoz/84LE9Dr79kAE7srdcQpgOCDQiwOxYQjWiY3UwDswb5hjPYtLZPDAiCmBBCQcLAIBk5IxZC4z2KE+zAYACzLyp/HJBdvkUAp4uOpTEvtqznDGWHr/cHX3ArtMApOuPa9TBQctKFWuo8sWd2bmN+W9LDitKoUZTAKqwARnHj5hwuaL2KJqS5CXIb9I+yi1KrTSg8sTCzhoiAI16nVJAKVX5AIIGJJmgAHjEcTAAKBhKYZyyzRjAUZawgC8xZCwwqGQxhhk7Raswu/NBBGYmKE5g//zgsTMJgH6dB7T1PAQGegxoyEa+cHolxl7aZsPg1uMLpgxsCE9ialQwfEgIzwJmpmYqUyYQGUlxD06w5gCQynICBnDgM0VRBTwRBziin4L5snCo1Q4GCUw2GW5GsJBM9SO6xtAQn21JqziyKtS5awzgh6kTRIW/F+jnbUKpc7Vh+bD7JtsWi0Vr4U9SWXe/8ol7iRPu6TWVnK3aw5WrMDh6wChICFQyTEJUXYZkng+plYqsDhFm/eiYtUxyn1Lkiq3dbnXW7XuHLoADuSS+OhE//OCxPg8IgpIFO70jMjngwkETFwQMDgAw4ETMzcGs0ucLhUx8AzF40M0fY4e0DHYaVItJuLLVDRwnF8wxHDoiUmVhEw4X1AiYdciIyEFCTdLEgBiCNOfFqc4JGQzMOzILJvMISJesOUikdSrU9CIaJnbtXkfsY5MX+4CSJPl9fD/y/60xAIgJkesfxnb//8/2gfFblpwYtG5r5ZWjFNI6OnXhA1ugn5bUY1qFsEYWCVTfm+ajP1sjdTXpejn2POOOQv3oWzNxF6cAueYasQqaSX/84LEyzTC4lwe5lUYCDUVXF00+ugEBO223J0QUFpqHasSqB/SP8PRKLIqGRoFsRc51HGsmA2h6UOM3DKAvK88rbMOUuL8qf7noDRxDpZH72l5FTquUBqClP/j/Mnw4o59eDB+P76tGHIjqW1bFM5zbxnwpM7a++u06j/USiKNSmrX+qb94Mac9RqCYX0vf4JPR9DPU4Mz+nXXMpAKOmrSeqMSF7tNvldPfhzv4z6nuKG6n8Rpj8embgFftt5lAUYEGJ8AEBQdMBJjUWc0cISiUf/zgsS8KPIGiL7GnkdC3oEHzabM54UU0RInGgxhbYjATCgsaDB0GnYcMKGVtu9SStEFqSDVgRgE/K81FghHhVWZp2YbTKIYgi33ZDt2ShpcN6f2+lTmEPIpoXTNt43/4LOSY8Vfq80jjrMF7RvCRBxxVFHxZrjf51vZsElp7avNe25c/bwrYtt5/z6419r8urpRbFtsvR6YyKuC4vk7J+00L0v2O1BYisXIBcsECxmcMSyaASskkzcEBS4ozXwqXA0cwgCBk8SqECoE1mc3JGs+//OCxNwvYsZsHtvFVLes9bwZmghImI20UtBoHhdSraR0tx6cTFyr0kFiAVndvju6uPlQv9nl188HSFjWqzZXokUE1eWU2U2jOhkF0l6Z9a6M6bh2jwtBAUjBJBajAhjwjCeLuYHTVXTTcsDEcK/ym4vHed/joRuWov/Bu9mUNzN2UzujzcTcj/fpncXnfzfV1+pzcMOOnof/dwsKIQCGBrNOi+MewfMExMMJgUMCkpB5ICYuGHQGBQGQCsJiqDhnFfRm8PRhIBRiyAxZtTddgGH/84LE4iq6Bnge1iKbTMSDtMOQ7HloMSSODgDIgXOQkTCAk0YQXiswwEwBSgCE8SMTRWRE5LRDmYoaH9MIcKQXB76gqLT7VQMnDZkMiGCNJEIGr62ASMmT2+hNI9z1fPllIZgUEg4cLQzPSh771Bju5YWW4AoEPdhlvGIVMdUE7jJU0WBcdzDmFeW5a5lngo88m+f+1qyPcSA0arOp82qHnGGqezXrQ9jZhiXOQ75tapMoq/RE/tMcyioQNbXHUllAyxrEmZkfYBVEiCoA//l6nf/zgsT7PUtGQAzu1PwBAOYPAAVDJIFzGgmM6EkI8BiwNCQKMPLAaIpueMGXRAKBTkCmxSaARAPMUAOSMK6RpJqOTATiwnADELQXvBslNUkMLqNAhazPS0QoD5oVRUtSbMYAdlFgZg7gdrYnU6XmKAShTP8YNXGF0OGZ2yGM89rYpT+ri0JaJvWsOMW/wz/Bkignivb0ja/+c1M48fv+utUzC3vB7Kn39Ne/geoCoSJCrA08JTxC0UF0BNoElnBhgdsvakyRY4SPZaEwhhuWiFFp//OCxMkyoi5QFOaelM6aAAsstgEhDjECtY5IIMdFTY88+MJI3JlZnaiDBswH9NuLzFCABbNJC95CMMeAVgIJMWCiiB2LrSaDSU7JUu20bUDLQBachfJhRPTBGUFJk+/pMJVIgpXXnG9pmlIUQj7E/vCmbPfuN1Nq2H+o/syKW9Vmd/J7gmD7ZLjSa+Ja10jcJJ9ybIriuxCOgEMIxgoXbeQWDUMCBxAzbeKMchZ9dFSEi5wK3kGMPhKnRMDaXLSHnaU1Jbu221VSuWO+8uZ6NGb/84LEwizaBmAe3lacJMYhktwmIagK3H+eWWROLCKbw50j2ApoVL0bkQLYeCV9LPC4z0+27DAx6eePPAq/FZgaLmcxEni7C7Qk3RbHii3xUpApUB4hBQj0LxRbnYfuM6cEI+FOi6Gw2B2DdjOfk8fU8wf21fV3AwxPc393DhodgIJ6vfTy200H8etmn+Tfr74cvkaA0BcNU90Xs9XqKi27IwuHTJwHMnixro4DjN0SHgSaFEJhkIGLCoZrVBiwgG+Vwa2Q4kRQgaMAWkAQ4adci//zgsTSJ4p6mB7D0JvowwpzPo2MHhQuqFwQUMSIMvf2LJlhUNGU0m+5EE2T0roCqSVzXuy1QU3B29B548M4qENt4WdCo8OgwcSnb7nhzkRwoYrnXL2tOs1pdylpJFv77ZChPC9znZqxzLUSh/VaB5Fg2INGG9Qz1ffxka341/q5+s0alw51r9WHbPdXV+q1/32T+22z06F3Ss9VOQsrlGkxwOKb07lMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVBTkt23HH//OCxPcy+9ZcBuZLMSKJw3qC3SElt49HQa60MVvQlRyO9twGIiWikAK1HJ7fc693W6GPonUchvc+ia8lY8mKDFT3OWpcSFmB+m+Rid1o/ODZ+sbSs8TjlH4sF2yIkYiZKxeWPvVP5QuRt+z9aE5f1MfnH8pt6o+9q3Xura/lDSCu3elqyqGJq9h+bLFHQMUAOJ/KzktxTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUJnJLjITKjWapgrDGhTEX/84LEyiOzIpQeylUnpQwduImKjDRYW4GpJuipKWw9DooeUPHQZFIXNctKcfb38kzDmthvqfH5hKDm8sk8Lz6y3c9f/Ti8j4PlKJyjdDOi/zWVH7IlYnRm/VupKsGMuthMvjRye38waIm/T1KZRaV9SlpbY+qdTP+Tsi3vv1lVuqdPQvtZE0bRZ2ZHFC1FjiMg6PqU2RVMQU1FMy4xMDBVVVVVK7ZX2HQmDB8jkEB4HCUyfYSj6GKA8QAEwIGjH5bMVC4zDUAsfiIGAni1leNzNf/zgsTTJdPegBbTS2c2wYUMOoA90wgd8obKyMNQ/RzS2Jon3NcGhDPLMMqpFx5dTTlwBL5WCgyTc2yyWWqUoHRtTAWAyyhsIbWv5LfsLJFYhU0eRdzQRheDwm8qWdUJTHHhKr5VXNfxeWN8vr8mI2/KN5iEZfKRdR+kcLGEhfCdNTRwKMW8j7duEUTcTtpC55YQiwjbUq/iyVRigHZg6CBgICIIBkwqsMzQFcx+AUiEAiC8wPOw3otPz/TorWAjEiFMBPFjxvy0YmyBaiOIATDy//OCxPItqlJkDuaUnIVEzAaGG9duflhfdBKEvLATGQVR2djS7zCwCXs4etDiYEZLlCE1AZACmstli8zHghkgqKAeRpGQpQDcsnTVBJSINQioMqXWI5lKRLo3iLIbJkWNTFcrUjQd5SQaYn6DV5Zm/6V1puZmy2Z25wzWIXq9gCPUtKvY9byw+g3YeR5Jg40JJLYzYseXrc6XS1FMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/84LE/zI6KlQE7uZ8VVWQAgN222GUGAUTDiiTATKXH16SQQWKEs7BGKdkPL+pcpYXidAcEa67OV1Xw936+xBpxlBvH0Wmr+hLaC8SUP0FbEwa7IEX5UM9v0ZW8aOm/PPTMf+VZPmGVNPcfLlSNG2KkfuVNPeaDo4YXSJrxKNha6tVSMAHUoS56FbmMtasWdJJzUXSSIpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqgClu0eYSayAKAJFqf/zgsTCIapKjXbLzupRkEgdmXAYbuCQIYG2AY2MuqDRR9DUHDEKf6KgBlAomFiQMPyz0oupyRmHMpeviIgQkfJXcHWK8FIr5YYeNEUnZ429PFud0yrrPQkR90wSqKLvjSKOtVbc4bmD9A8OrJnGDaBm/g43XcVGjH1udA791xG3uCMwOR7O8mUWlaBZNvQctWjarVcxdUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAO7bRIRgodCkRADAQlBhnINWGkx1ntqY//OCxNAlGdJsFttFZDuoWBjT3I2ogT6LkvpEX2MKcCQRRWJopL2QXUQ6lS/lQKJGCGMCJeQPfqRNc1eM2Y6GCF5nMqoXsx+q+tjYXA1VCIN0/TESrTY76R9287BNtBjvoNDvtBjjsv/qysc+iA6VLh0jzqwStAzHh1gCWYcDcy9uSBQlYxYQTbF6BcJIU7UaYPdqHOSXrqLgQaGLhsChitYwEHDX6+PADMwcNjCQ4FA4ZyjwYVTL/bMmn0wyKjH4KEQFR+GgKa1bokaTF5BGrsb/84LE3ChCSmwW20VkKQwgUrwwShmMbZkqQlGlqz/7iIGYcmXojD61QOkomJOOrMIja+ErhYK/ymr+S2WJtSOGCKDB0OXguRkkY4/9anUwTx5zs3m+P/vOu874no1w5RLJmE3UUEh5T4rITflXO/bf1Inl9GNcy6tK4Un6FgS6ImiMogE3Ay+SyIAQcJJnF30iydPnuoXS9rWNttjFQcYfLZAFxYKBQDmJ6SMtI4v1TACXMHBczqezJYJNTG0xsMzC4YJSSXqbxM80sBjB4qC0UP/zgsT/MbJKUATmjvTxZaUSXiSgyRdOceDKzBgY0gcxIwNol8RgQn3Ai/HoMSJduIxZ9zLgFTN1VgjCWUvqQIlbMGHKu7MP9OI8S2OI7uNL7zcgZuTp9xiXtbUng8OuW5Ubkkj39ZcdhZdG9m++5uv2JMSqY+fpVfjquYZt0QllTzyVw50gOLrLL33C297CjHP0qY5UXzifu6RiTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqoFpJJyUmChiKy5lUSVzGkIffgU//OCxPwxakpYBuaW1DKgRjQoAhoZVgETPQQKodPac0IcCQKoEPL0y1qvWtx4qqwBX4s8dr9TbPMc90rVr1dqGeX9vwvrqNXy/Uby7JYpz6g1JhlR/Vl+7qP+ZiNYXqRQi1XP7lxMUaNFBERvdKJcyVCI64eGBcskzLNOXVGCi5W1S9QocNNGNgJ8VfQOFySXrS0UbVpqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqgCdtsSGA0yo5DhUwIlL2mjLZkOOfe3GUA5jQ2biajT/84LE1ybSTnwW3gqeAGoq5yBSq8wAjV6zZk5mzmNEZjChohVnYDToUrzZRLKIzTQgE7MnFUScX71YHeyaV50DI6VRx97LQcL1lHCUCExIKX6rwjvwyoRexfQN4PQf2IJl9SBEf9iyRlRF06ubq/Eew6V/27SqKkzYWWYD9HjFDtwvlhBuZfUpRVyEMSSZrctA+4u+x9VMQU1FMy4xMDBVVVVVVVVVVVUApLa+IjGANeGWAogDgwwMk0De/k4Z2AQwYUQg8ZMMAzSNM1k4DAEysP/zgsTjKfpOZBbeStRFaplAoQUwJE0IQ6NAhs5VgOSYinBfdsxLS5QxrOrRYvNvm8xa+Ryikj6Y0vflgkcgmmyo0342FTXGr48rX+3Fu7rukCd7E4kO/ZSL/65av4JQiNpingm/c3+bWOR/2vT3909f+w0TMaHEqioovBo+lqD6EewWASO1AutbRS2xjnoIqLIiyZYjSmqUNGAWM1wnIheMUQfMGAMME22M1RrOqA3MNwSMKAlMyyWHgcMrE+CpMgYGNGHEPmeFlTofsww3CpIV//OCxO0sak5gFt5Q8MYYmm3oeGlFkiFlKrIYFBJjmssC7RGEJcQlshAHmjFEZuTL+CRrLlXBhXIyIGuXosYKCQsxAHdWBZ6if2kpxwAXrTV6wQ7zIiGQuJ6i4bqLU+VFo/p2sZF8e4/FGZoTjOYc3d9b1ucdTKTWzb6P9M8wVags6vFh24T2vI6kK1sRYRsTa839j9sRCyWsbUxBTUUzLjEwMFVVVVVVAOSyXEdTCgiMCgYwgFE4DG5KNILo5MhzF4CGgGZQJY0OjKqYMFGomAj/84LE/zHqTlAE7tqcIIqtlaDx8Gha4CtAM9Bgp9qcMTu8tWVTpkwJEYOIhgRRV/87URNAHnY1cyFgcuaSwqIuxu5VTVvDIpEm3f+/33qb/+zIbUOOMGTcicXt7or33LnCuWj08w4kt0TqnFxlXrmNnH6H0VSVmsXqrUw0tJ5Y6beATC2h1+pyKEEzg9lwo+sRHNNr05pMQU1FMy4xMDBVVVVVVVVVVVUArLLATXAIDGGAIcXKUmOm58GcYmcmBgZkYAZmcBAMY/imQMtKERkI3f/zgsTtLIJOYBbmlJx2mHxWGGOAFoBi4wBWrKgUUehy+NzADFe5ywDT2nTVSNJLjQaXv6/74oYTcWJilhTik7dX9Splr9tc7NdwlTUvyiQWnQ3Eg72kfCf6qNva+YsM+RdjV+uLX576yh08K5t6bwbcRX+OdjHAVbY2k4QGGGidHYfebojtdWYCyYqxx28TANlzjY9zlVWyBoYGIxzmA4JjxcmHoJmAa4mP4kHWYEg0IzF8HDHAszHADDOImzG88jAoDjIwEC8CmBCC5mcpJhCD//OCxO0sUk5gFt6QnEYcmHriIOJkUnBNFHVaiIKkKgxgiMYmCnMLREEgYVeliLTAQVnOEivV1219GGCbqpUGChq8kU7sTnw4oh0rECsbwrzrEb1M9K3q9pbI5mDMyTwt9GhDh8O/y4+Un8jRpjsLiSf0KuP38OXu+Lh+2o97abP+6t/+5ZnU1AobKtFIofobIKg4txpvTp0L3BouIQtpWUcwPmTKkkxBTUWqAJy2PqquZtGTmGDw0RBcwQpzapbOfhIMCqUJg8bEw5CjaMWkcWD/84LE/zT6TkgE7tbUQBQilA19lRhlPeIAWVl1gjCoHM4SJrOjdIFUkbDP1mkvm+zuxMzD7NJ2uPFUcFo5U7Ts/lCsckHRgNxUGDsxJlSIptXLIVMvlNdt/yk5V8Tz1UHqezUfT7iOv4+Gqz8rkkEbH4c7Au6eJknHA7CJI8TmhVh4EBLJUTiV90bqa9zUB1YuwDTZhr5MQU1FMy4xMDCqqqqqqqqqqqqqqqqqcbbdgoMmmI4sYmQI4yAmgGpht+VY4xgQDGULJJk4eb21nNMxWP/zgsTqK7IGYBbmVuz5mYUDgduzCTNcUADo4mmigS6lMIbONtjanM87IxCkKK7KxrtajGJAVUTNGe+CKKGxYycmRKiGUKJDrFIyKgk+J35zN0+fSwLrcYFhk9YHi3YaunqRLEXUXZkgUqb0rpN6OzNfNOHcuWcsDKJEQ2belAFRTi3ZeWVFDd5LTxBcutpnTQhCWt0NVUxBTUUzLjEwMFVVVVULjbuFQJGWiMWUApOL2GIIoZ6a58wFGAg4CgCOEAHIoyhBTUJtMKAEBKBzy9KB//OCxOkragpYBt5O8ANJHYwqFRneBlCAtrDyGUSJK0l6GgsNQyOAPZwr5nb1sNHCot8hmFxtpRe+Vr4EQVui6ct2C6s+AA7iTtPLVgO7l2+6hsSN5VsW/ybmjv+VXku5JjaWPHXLdL6d6F8Q+64rjUX/OCXeYeuFYoFqXgV7jTZyRWV1Blg6wUn6XCmKcyGRSSf3t63MTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQCp//5XJzLR9e4VES+AhbDIQI6YJa//84LE8i3CBlQO5pbULfC5CYIAGHIhhgInMjO2aTzgkzL0HQcaOH0mpWXvm3kpM2ZQsmNqruzHLZmlTberlytGGdtL29zisPZUU/U9Pib+GC6khb8aKnf0loHZiqw1kGPU7PoxPFCNRqCRaMzGso6OqIvQhqEMIoWtFVjwC83YCijYhENbTTAPjFtNgBLGObAhsTrIVJUVmBhUVzDYyBEAxjMRRhsBhkCHxgrKhlgdpieJZhqBxjEXgkxhmCdBEfYoApj6FxgWBbDmXmfh3mDYhP/zgsTaJ6IycB7byyidAnuGEE6QUCGTLikChQhh+RCSAIFD4FjpQDqLu6/BCVmDiznKouLSjyA4A4AlpFlrSeuifcoKZCLC5emEYxAtJN1ICjOHFcRW9jdf7Nqr54fjcgWMc//+Mcp8NtnyrS+Ky8ReFDkELK1GLxoqj5Go6k/Un1N9d7ZO2RXN+y067o/e1zPJehmOdu3RaqXu5G2S70WQg852Rc+KoUxBTUVVVVUApJLPltRYcjQpMXgtmYFSJtZeHERiBQODgcYFDZgsNhVd//OCxP81c9ZEBO7K3JmwNumZAATXpY0gxqiBgFAQQByBLZVm+AOWFJw3qgoFeAH+8zTIVcniwEjTY+xcZfW9UNlT2HdsnrqlWvljiwe5qpJ9+7RVw+6hvOKRTxOHXERlRYrvYXHIMb8f7dW8T/QaynCI2azA91KUxjGOEovOpYyyse+8SuQy0UsRc8RghNvIkOCYheKKRp1RCPDUxNCCAZkBhlkXmqAme0Ih70nGlkcYuDYQSzbIvMyAs2KbgghmWzmvJWsYBhkJQmcAMYGJxET/84LE5iqaLlwW5grwAxoAzBITMJhExQTgIKAwELLJAIYCAQgBBk5fGahMKiAMDpgsBlQAAosJLoLxh4tWCSJAm8p5GIhMUWENDA05octQZcPWR7Wuh0OiAdO1I6brsMchly6WXzDoFuEhIrI5igmXLpr0rypdKVlx2b0khqTLjuveRBoZPLQUYhEhBSrouEnmnnoHwX3U33BFPPEBwZn3t0ayYQKjhwD7IYJkCrVEkkGoQBKkqPp3CmmpFQvpJbjKgqJZp6cYCJkxrFdHIGCMYf/zgsT/OwJOTATmETBRVmVIoGZQgmG4rGFY6g0CjB+TDKAQzF4ExIbjAcADBsKDAYJjJs+DA8cTNgY1EXMPHEmi2ZlqOVAoxcJvpDCElJi8+l5KCiGTAwBZyqQXDRCpNLg18WRgIRCwOY4UBBOvld8AwI+AWM7SAN5I24kbIpZRqiqw/GcFo3+5amqRHZklPVy1TxV47eX1a1tmuVJF/eFksjgMuegtG8LjU1mSy5x3/c0Z/Klm2RRQGf0J/3+qKWbntJnmqinojeetl/pRmOY9//OCxNc5q9ZYBu7O3dUVl9aeyuh9XzzzJerXzVUidthQqRzC0zMjgAKGUAgkw1PTHBpMzHV7gIFyQCGSA6avUpkwEAIWmNgEj8PGUhBpjBcmYgAnMaEE5iUKmIKEMrBw5zp8ZMEIU8lZUzXmIxiLOCbAqwpVeLP56qAAMoCrUCOpXfcx46ZV4v3Os/4OWvXRVn95XlMx3KkwSgOdBuQkx2xWF16mRTNQXHKPXVur//6jv6t+UD7XqTU+30ayfUexxZFZcULB8C+lBa9pPahhgqX/84LEtC5q0mgO5pTUnsegkZyqBbi0REOJhM3JjcMxKSQoDRpJMJnWQRVEwxbCcEAMTDmYiA2ZPQ6YNgiBCMx4VRRMbIzBR8zjaOHMRQZVjAw+hUt8w8NDgcSLH4hZISjgMY3RgAHXIjUv99Wik0M7DX40/TzOKBlYMCYo777350zYNfJgz70+EyZCJLmtZM3w+2bGTnDhMHmKFrpJF5FBaZiajJTfY8PYZDqUMZBMfDdvYeiv/8/+d9djhYjrM6z19vSTzzEmFPTa6Svn7m9U8P/zgsS+MipSXAbu2pycnFxUODjRMDHAtfwQYfD2Zac2c4AGZhm+Y4IwbYBiewk6YFEEaShkUDWZEA8AgeNWqiM9QEMkxKMcQ4MHAUMRxiMCh/M/0ZMxjQERldkxoQA4MLPM1HaXGBwqn8l0YSRAiEpquZGEgojqRCRtIJJBKZ0KSGMbiqiqIgkCwEzBoUv9FlHoCX8JQtjyMqQVNMZmVCqX1h+yyC/XkDzTf0GcpJASTAXXNVZ6ZbPRYarSSdaHCufuxL4eeEw0kFImKE4aGVnl//OCxLk6qo5IAu8U3AZ13/0FYT/xnvSgggS6bEppyIruMbkLc0WkxZrENhWHjiZN7BgsKWU40w+fcjMqlrySBoKAOYvliY146dPAqCl0FFIMjv+OVTAMwRMImWMISnMYxgMEQqM7ZiGm4MlgIMRBAJgJMjgNMABRNCDKMwSlMDBxSZMURDQuMBwJMVwjFgBMCQQFQAWuYpiWEAgaYICYJA8gOBwRriX2m8ayyPBnhcKABICSCjboSaHKIZWi3qCE9CpxWspnwniWxw8yVWcw3lX/84LEkju6jkgE7psxoFUrHdzGsiEevW3U5M1sJdc5nnHs06JPnn/asXdxS0QoyVRGdFnXUwnR//+VGyH0XrtWodFpNZqdlNyd30Hsnq+Q/8JVvf5EN5dJh77GVSfr/pY5thWay2yqsgTNE244+YNBOYGJyJXwYhg0YIDwZswQYKDwYChgYLAsUDQCQvMIwZMeVFDjYMkBTER1QU0UFcU88qNQWCwLiwAZIAMQZwTBDiiw66EvGj1Js6dMVc1JIigsw2ZaIP8vWLwElkpSFQZs1f/zgsRnMuKSXA7u2pyxkUuZkYaM4SS5P/NggpnZytKfqQC66lGIKE3ZqLKM1pJILcUkGpzMfx7ryKS7Gi/rKCH+m+ofnXVqOPq8bX1JOmbMlqpFbshQjcKm9iHydBy9J9wsaSPQiSUs3B17HVxc8Oi4xSFSRjJgWH5kMrISFJiUQaCxp+aRrAT5h2DhkoB5gGLA4BYsB5mQi48wRjuDYXB1AgDCxSg4bxNbgxwHHgkykFd1zzDSUoAgcVrafsHG0pD4UEALSEb8nmgkoXV6pWz8//OCxF8ystJYDu7UvU0FIsEEtLBtDAmTxhUijb61bk2+AWLoXL9W9/SVsceZ11DWP2P3fxjYpdTpWAyy6kpowU9yAuYTW9CvX7c0XGflP8UeuY32IPcycTbqhx49kvz2euq67+zbcLDQcTdjzc8H+6d/4DGinmdpoU7VsMKgWMQDXB6qFUmBALppe1ZngIQcEBWRRgSE5gcD5icDRkNFxiOAZhOFAcHgYFZiUG4hCIxjXQxeJ4Qh48gAZMam1Qx46CoKAQBdzpjRqFxY8M9vFuX/84LEWDFq0lQE7tTYB6RxlGYAg6ESYsKjaN7DCgzXvYrQ/ZjRiQ/nL5ZOWpUATGGMKap3B2qL/7h2qozZ7+7MrEA1UmgDjVaeQoLeoOEEXvpRx9/78iLfkSfqOfz/5/z0KHNRlWULKKXvJrtRW11ZlXoddVDlNrz1zXoCy7f+MiwmX1G9EqkIhKwLTmXjZjgWXfXCuoaGTR0YHPgsWLyd8mH24GKq4qL1UmFf/Tq7xb3VhUz0mFCzYs4dvfBLs4KmtUOYzIxAvA9wY26a/qJ49//zgsRWKsKSdB7bzzEZ3ryv8fxqDkESi01J4KU183pUkO97p4M0CpojBx44/2GGs1WVkrigY/RvnD4d51SVH0UcT3EJPb/P/ZG2gd7KZ+etbc1rd6oy8kO3qPal+erjp3LbHqOSVUsQIKC7AYMMCo2YcGjR2BAMiLmdIYCMDC8SHCKs6Yz6KCKOGNDAyKPajC9mFxgU7F/2ymYHQuNU0H7qYvrDtL3cO2iGrqXh9Wc10Q1WZIrWyjhbXZykEEEyTelOGrXZSQvK+mXF8LlqP+T7//OCxG8nom58FtxPTjkHbx04VBzK3PNbfUinqpDUX1iJca0YB6my0yPABgkK3pe5D1PPnidqYYReNZY26hJNxXA0KxhMdhyYFZjeMIEG8yaTAztJwwKBwx1AQwREtFc08JPKRRdTNbGHdIgUwARBA8NrRLBqYETAX6h1tioSshTQz6IQwQgJpbIFQV7kKLEsnQMHKFtxafGWLtMRWdbc7LspcEI8qsqZkwFYHNPInnVbXUGuVfSm7qqdYdGggzUTxMayNTVb6Zhf2dtswKv6/Ur/84LElC37HlgO7uR8nT36jX+yvVUt+tqmfqeupe68+5uevEZhW6aw2IH9Y4SUiigzBmO2umYYAZgt8EboMrBAYBZlyTGASCDRYOAIaDpIDRCFDAdWTSMoChAFq5ARcBQo4xRMPTkNCItQ1jeTxMWQNcjpABuqbYQhgC6rj28qIaEc2svfGWWQKkjWu5VaWqAgy9S5X+yRJOHsuVMd1zfW6gPw2d3TSdqzNMFcSNXU60S++eP0+vUXe1SnR+5Ab519fOnvukf/pfqODIoj/UJifv/zgsSgLcKuYBbm2p2eEvCMGnfzVnSM65Dy/jGnXqY/f7/6mwYckkQEh8YrmAPio9AhoWGVEAbAPBkUWDTFEBALRBzideqnGBxngeXDVEPGq0DNcoxprHBAiLFXu1F0ADDhYLgqkL6P0b+ApfNZZFGY6sEXLUFbq322wr+SihdndqtDQFCabE8eQTGAGBuYrWXH1VA3gfHbpluo4iwQ5YeW6KKzjVFXftUU/1/zpA6tk6uyyy13dZeyxUWgZR8oB1nYbLiyzKaxW5TZQYMFdo5w//OAxK0sOm5cFubafA5r+94BOffenAgOKSQLCTHhcvcYsLmkFQCODKAJI1sZCCmHUKAZMJ+VdrDpSjiiBSYYBlQuRCLCRUdh6gsS+GTIA6GIKbqpm667FyOfbvsHalu8CI8YxhfBJMUbl8zc8+izg4/q8zMQGm6dR0w2Mi0gb6jxvU39xHCzzVlDjr7qW9ckVQWlBKm8RIel4voWpLNrvfjJNKn2+SROxU3VUtr+gIHGCp8cOE5jcuAwcGGFSYzehggjGPAuDgAYJAQKLxm5jP/zgsS/JkpudB7b1SRnU0FQkgEJWS6y2TIiOFCOFTR3gCt6+n2MUJmHBEJcWGpqJTGdlsefFTZlKFTcRIy21G68Qd1mjEZ+xy0rIAjRhgNSYrX7WSOEV1+H/EyBvCuEDepkqrUC6qY2h2xVkczo6EvqZ/lST8o3mZZUsIakLREBp1UwgTnXsLHRgNUjXJBSXATQTYXNCJMueDWS1FmUrUxBTUUzLjEwMFVVVVVVVQqv/8YHBcw3MM6BzAjcLhxgCGa25g5hKCoqiTK0ejN4YaKT//OCxOktsk5gBuaU1H8QSakyxVkgJnApUVQ4oWHA1HVOYu74oByKFPSAR525l1FFK8fU3iskkVMzeXv1/7mIkUCKXVHkpUqE/PvTqPGqCtYfx4n/hkinVQF0bQuQLeNX8N9hr/oEwRviW9mqOQzLSdyTNtlIYpkKcvrdqFepT5Xu0UZA8csVFkVjMXUsmset4hHE9b5Jb8QgIW+MTrAQjMAD6JBmMUQDMnDpMQRNMnQrMMRdHAHaeZZseZdA+bkCoGCyjSHMwXBTqsE1ihMQmDX/84LE5yrzInAW20tkApXOrHFjKgiYSsEYGPH6CVF44JVGggtoHA5h4+tQQg4AHl8siakzMKAiJRbyVSufhkqAJkI6PJD+02er0qZUr3+9zoHCE6Wuo6AqWU3MDFA+dc1jU9JbzAejXLhLuip/WPRvMP6RW61Q3u9tQeUgQmwgcMG6SqRO8gHbdrlESo9TwbQllxAemKPPCAnyakxBTUUzLjEwMKqqqqqqqqrXbVgsFzBUeMjgcwaWxUGGIUEYZdxhQJAkCGAACJANIEyUZx45Gv/zgsT/MhoKUATu2rh8sgkBtADBDCTO7jTsBV0GP30nLZQWkzLUqCIE6UjN6AZFK4cR8iEsAwF7oGtVFFXci+VnHkYQRFv7lciU4qB4T0VJovJG8GRv+Xm5kj16G8okg/Ql9Sv+E92+xKjne1qbanNZWuzI7qhp7FhvzOQO+XdVb31zoNfZr9d361Av2/4QpT89f4FlakxBkjjLhCFDN++N6gIzEhnmM2rw2C6zIQ6MrBAGmwuAQg4w1ODGYpMU6AuCgoLMDEx0jM11TVGEwdSH//OCxOorksJoBuaUtdCUHiskByROMfGCBLJnqlpsgUX2ZusCAgZiD8jRErh0sYWXuZao5B9JL6CXgY9AgVKa2dS1WKAh5N6z1Xlp1V0kxNRTV0jM+onXdy4ktF7GZpqLx5nX61Ef3ON+sYpLOJpAAZHgBKQ0aS17024YHuJMchgYopEDEtUzcQ0sQqRAxg0lLQuJ0rRXTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQlkkmx0mFeBXDNWBBj/84LE/TB6DlgG5tqcBNCMPFXKJYOdQTuw3xshBlB7Wrse5S6YNBw0xoWRlSqztB+esL6lk1HDHFhvsiXzO7X5O031YzfPV0yeDnE1a2gQzf5kME+gggGZq3r1+nr6351q/1mHs3+TS3pI9+cDolV8kS/LzAJ3Lw2df8fbmVq63HYuc9R/Da3K9vKR+inn9yHYc/xdTuJq0bjBAETAyIDdkKTOgFRQdTGszTL6vDFkJTGAJTE4GQUE5huCZgi5IBBc1hHowNB4YAQoK0wUBwz3Af/zgsTRJWoOeBbWWl8M0hrC+E/6YKg3+gE3jyKtxWMVkAadHBop6EA8HABI4OEFN5YZUOXybtXbICgyvlRa5TSZGwLFjJiJfRfzcddRplzO5+Dhtph+OurYVqx7vv7DjhQVeiZV80lqEJeQJcxygBt/T0x8vtogAxJrrADlCzJgHBU+IkOCqZtJtn1V2WEEVJNjQUCj82Jh8ss+XkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqodtlcYcFogVRxUImWR0IheFjuZ1PJk//OCxP8ychJMBO6O2AEIsHgSLkvUERyAQluA9ht2Ggo+OiDeRzjliA+sS/ei5jxM7kvtaicjcDKI1KJMydtpA9LPnYrW5WwWQxDlbDOXl2R4Dh9pCDUIs3oaR/DAbfQspdp1dX2L6GF0Im+43rv/zSfpoXGjEMM6SihUohqFwC5iMGIBNrJk9SlVFZK7ZSrizhWThLO1TEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUGZJJkwwwUwDW8xotFQkz/84LE2ieaLmQO5pR8ULTCnMwcBDEMs+y1KwCqTaG6Ou+GFZkOwFwB1qLpMhRY2C4lmyp3ZbeJgZZlUXlEZ3xtZyp+3G5Z7n+qqhS//3s4NJnyhN8GDPx+4qpnodZ9DuLkn/09/+QD53YI1k2OvYJcL938Np6lfq/QsuKc6kL8ru+uKewNwTzs91Yb9D/f/z76FyG/ydVMQU1FMy4xMDBVVVVVJLZYbAI5JTIJzIxSugAHzJBQMkywZEhkMDGChmIwUZImc++cwMfCMhi2c0Qdif/zgsTTJdIOdBbeVJuY36dEglqTcH4eN1zOq4fj6esPrdcgjYLBuEylKb2XkSd+n/n3HVDk5WElkUsZAChhayN2jyUyAzjM0MzdBEvlGmnYPw2M12On1ExOtk3/8vNRV+Udd6b1ptWp2+cQcTK8FTLil/+sq0rz+AJBUTMS/8hVBjB+wDZt/f/6//d1/XcK8jOmGpP7pbqd8wWBYHFaBwnMS07FgZMskCM4wRMaAZMJyHMnFEFA3BxKmARhjQ1GAJfmH4JGAYRmLIMoWmOxWGEh//OCxPItoi5cDuaafe5k+wGGu4hCFgRuoipqZAQCi5vpwOlnTRiBGhSjkCgaxYFESiZNogGm7E0W2hpiPqzVQZn0aFSxtBLpPd+dBAaCFlTghceREpbDMAz2FjWUBr4U86/LU1NztJTROWjABJicuYb1hh+rB6KFyEodozoG699E7ih/ylk1IF5yGQdUOUHnQdnS7UXZddNbTb6iUUkUIfdUO9Z+usglTEFNRVVVDddapcMEm4H6jIkggGgIcGhRIiEwMqjHMJhIcHGLLhiYCaj/84LE/zVyTlAE7o7cpQcDIdC3jOAcfmGoZrkBxbF5h7zBLpJC3B+wSDIzOKZZFX4abL4olS7AhiaVDkCap7+dWOR4BBhiF/DmPMmxY0qHWY5jcS+4xGq5qposhQOJ/25NepvrON0UHfvnE362VU9yYpNa5r0j6GqPnR97hTMpLMPXK3gdYdSRnAM5rBhyo/YTr1sqsWplkiggiTAFKzsEBTPlKzBQUDEAAjRQ+jEkATQglzGU0DbAGjA8IjIE7AUYhsgKIMCYwLAcwCCkuYZYD//zgsTnKtpuaA7eWtRmdh3GPoEGV4EiIBFIqEmgsJYNuYBhDZgVJpTBgc4JULrR/EJaDUjykGguY1MJbCEINDoJVSxqx9+kBBqsp3B7/SC/342QjWtTwojQtlt9+pbn9axLV5pU/b39Wku4X6SRFByDIx3+81rtEK2YgGmE5acqWAqz+9F6Dh710Q05aj6BsY0XIr2lTYWaLC0qKUuNcNDqX370bBQobclTRA1x9gbKlAEDY1GWOQyYLA5hRdnDQEZwHRgcWGFSmYVSRETDHwNM//OCxP84ukZIBO6O+Bp7KG4VjDF8TKCD7q0+1uApE2ExN46v5CaNelL5TA4BT7uFUIuwxyR1zTmF1tTiT/w6/ocA4SCSID7EOQ5ytlYiIyjXFc2igtwcBKwI0JRaitH4hxiWqXPzGMcKU4bN9e8qev+b/V/lTfWk3QNTDFnY08RsFQgH3HD7Fm27aGl3KTbRryv3ihUB1Gazy4dVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVBqSSXU6BBnDzQdiSUEJ0xsMRCyL/84LE4CqSQmAG5pp8HiNKYYGzUyLDliKDxygaAneFJhgDINLqWZzheS1yCm0QHMVEisJnLNFnk8dl4aWpG8i8uyZ4fSxtse7yaHAyr/H0S1JfWqVLDqKKBdXR635OPTD6lmXmDf5gamDd0kXZkFKOsBT8Gx1YVWNgKw0+m6ZKhkEx4lQ9ipiXJGS+hEDF0zYqXSfxdxtMv9CgxuJST+nAw4bQUoBHxnMVmiCyZtIpr0Djp5MeiR1zADKSmNKa0twMBmRm4qYmRIxx/aZY3miDAP/zgsTYJ0JOeBbWGnrQWCmlmEn8OyOhBwyBI8wMDGrsuAnzK2iS5gZkIYievhtXnYY67CJdAOcokYcShh3dosp/maCk7lLRYdw7QLfxHgBGVWi6ihL7B1ERKv1m6nYkzykkG+Qf/84ar7qX060zv29hd1/wSWm6xb+tt33nr0B36oc+d3qE4WJuZKndbjNChlN/V4rrqkxBTUUzLjEwMKqqqqqqqqqqqqqqqgI1slgHBJY/wczGswStJnZ8aT3GKGgc3Do0YeCiwczJoiQmpPTs//OCxP4wmk5QBObanfgUQQCzYjzpCTIkxrorBLmaBQ9HZane2ZxBoeaAgQhobhpmdSVkxCH4AnIS1vCMTlJlSzaJSyr1Mh7EAEZPEEBaqkZvdBiFKydCrFjwZFBxVec05MXvX9CfzzG0mWQceSWBzRRY0yZKihU6sGXnCo0QBUo29rFGiwIbeHVz6r6JEYxIy2ehNN4kB/a2tVMFAzHuUv+ZNLmDh5jIcbLGmTEDaGElQUAzD0c6G5HhwAmYKHEUzHA0sosCYiIAIiKDlSlZBdP/84LE6ivCEmAW3pR8MxS15MvTbnQYGJ5DIfA0NSyINdfgx8dUoUWkMNO5RLhlYoqrJ4Gwi0CqoLyPovLha3mWhNFDHjPcXgEP3LAbEiIeV0DeyNq3Dhi3zZPm4qjdxURlVr3R7DrmrNnsw9x4iAvcNPektTvxBJrzzU9jZZ/P6TsaDguZFBOC771tMjCzT99xcuzbKrSaWKgPYED/KnYqikxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqoJuW67GBBlGuAcJMNYMP/zgsT/M6KaZBbb0UwIi36/V4SdSkwVdd465ZjjkIMAyHojYlmUGBr5sSJUH81677bWbFWqb5ynyQeNPfBeU7lgqkDOWPQShUIXdyEASFpD2Bk1vmsEJ3EZ5j+eeKPVtzsXBseSVroTLsUrdasa/rsq9Z7qeWUkPteAKbAdw7PfL9DP1c5u2u0ft3CqudoaF3RLf7LKVQC6qMmOwuZN4IDOBtmzmVEKFguYl8ACEJtgBkDGM3CowEQztEmOqks4khEZQADDCEAZEDCG83lLNeTC//OCxNIlisaQHtPUl+OLAYqAEReaXXoaK9VIg2YnKhyoZ4LhAIEAr/DoGpeBBQ5A1jRg4yHGC6GMKxP80zVR32rmJjBiATejdyWaj6xVGorq7OtbFQ6Ce40eFpjCt+svq0BKIPIMLkxVVa41nWUQfu72kMJZ8KJv7zBWmf/7k/39TxH5TN7hq1vjyb3jWYa59pYhMUQ2ozNGs6EShUsUeZFYonGj3kWUQeMdb7DKktcqBBttttBAZMEKs2QEDOA8CgZAxhMgnEwoJTDAHEg2YuD/84LE/zeKQkwU5t68EYXCRhvFCIcGCsv6pWYQSiAKGDDDxYYTM4ciK9DCQKsneq+EFFniy5D6V2JZVTKA2uLFQS7sqgmHK0h7upKkqCgVR4Y0WFR9Jfb1DGdKpF18XRBEFz7Q9mUXmpn//Thmx0wSyElv7KTIcnPibmvq5ysuMVmc2ximqcF2wSjY0aP2igDPrImyF74jIR72VGWHiM0+0TyjHvqXHOkKTEFNRTMuMTAwqgSZdrnfAQEYA6hqaaqJggBAyCZkXmJiICKyExhMvP/zgsTkLuIuZB7mlpzXWkImTUSBdcbGlmYFqxmdAGUNRuck4XljVR0n4BIEQFgItCp9+4wssgIh1nL5x+aluH7/Gq6auL2+/zCH5rCghO6ZznNriYHpuh4DRdyhP+JyTMrAqaqvvE5IYRNfZThO5UxprM6P5cqMpcLSNSxxB6VJA87U9gu5NNRGg0/7VMIMiLNnkipemkxBTUUzLjEwMA9W3oYNoEPM22A80OElHoDHoAUyMGwXMpQBApMgIIwIEplpFJkSIIk8JbxVI1QYqGh6//OCxOIpokJsHt5OuAmq9GZSgqFKJlHwxHh72UxNZidI8VM+VGTMsli7YBQmHgRxYkMQNDDxqTi0slGoPnAMGBAGMTFPfzoY84s66El7VZogarRpHBcXuoKIwc2i4ix35FFBI8ksmlNlJeTSkbqfU3eoimxNdmRcNgFbmUObPORSN0nhiF7XPxlVrU0PV6za6aluXY4r+yIxBB4wbJkPQA0rRwwuEwHJCZCkCY3BsZHgUYanKZTgaYNCsaiScaHi0dm6hUGUBBJaQkgFSDOTULL/84LE9i66ClAM7pq4CZcAJ0oVDwsQ2cGKcpLrJMjfQuChQ6RxFgFUowDSoQiRwYmjsYGBEwBGmtLWrPlGp2EQYEGJiABG7dr8u1Xest2X/WplKx1L6LG6i0BGpOuaiZjAqOnBNh4HCpCp5OCxKaTR8Np/6JuXq9rr8rPHciBnVNdiombavQw4bqODVodoFmpUWxBeqvv4g2W00LUA2447xhoGmLgiRtwz05QKOhEOwqpyoajNpjMkpk2qUzEobNuuw0sJDbfghw1AwYoLBhryb//zgsT/MmIKSALu2pw6G4FArqp94AUEBOBQRPhkYoQOtAMAYM8NIQjqNTUHhsQgTAKAwwDAKiEhY25tLAbtxCKJHl4CI46sP6wq24i7s+3CAIclskyeedWPzucIELaSBcNoG0dz/mcJ+jR6ByCKe/xuBs9n//r91YVcnQytC5QMV3jbQ84ulQqYJ96U0sSlm1CE6lSPzJ9E5tCBQeoaljGEImGTQcHQg6GHr9GDBQGF4XmIQ+GPY3EIXGJCbG44vGIYhmGtemPgeg0rw4MDCEEj//OCxPkxGg5YFuaSnBGDUQhOFhMMc0cNUDgFUggJMICwMBGJVYkGpkpUmAhBONmiCJj4UzoFDz0OCvcWDDVBtC8xFsVKuRZTotyka5Wcs8JQkzV2BTZI3KldBGLq61rOMCQ4ifWSwUpTN2dZ13ZZiVgUuwxxj0SkX25cKASfclluWWscJev7IkomKU6oFDzvbVmd2UaKtrLj7wWIXq2gMQJNEUFcKBFBIBEz5kHKhaPDSBm1i3xqJMofCCZvQGltDLJYiIAyYBNhyAOmH16VAAb/84LE+DnCBkgE7srcNwgZHHQ4EzGwEMJ6A1qDk4jPBPMugU49HRRNGgyU9gYK6O4QmIU0kTHQTdAblNkWWaRaoCspN+JSdmElYwGZuUn8qCad185BZqYR6maSRu/O632rSTu2jEROGUiNm0ZFCWXruhaDQOqJ/504z53/OO/6FziU6WIpv5gSaoWtEOwiTEJ4VRcKB8vRtmEMn2PsnsVpZPcaB2g2TE59TBIporUP/pzBgXMRQoBqk1I9jAIsMjhwxuwwQcTJgsMq/YBFEwoHAf/zgsTVLFomYA7mWpy4AxGIjTgjchMZGQQAUCAMqRUqBBh7O1gFPmBiTghQg0uUwqAn2MQgFdquYkXXsqLjKE8Rl5RmHH+cinyt0rpUhp2GpkVXnb+ode6uMGJq0XwIVWqpkaF2oWdZ1GuEorMZ9qx4Y1eYm7L+UHb6LXM+Wh/m9q76qXXpiP3+hfvHPwtVWr995Wu6f6dTNVuM99tPt/52d1i7cMgGChN9qgttylBA7MNQQ48CTbaXMJB80WODSQoMCi8MNZj8/G5g2WXNSp8F//OCxOcwCgZUDOYhKTYNNh1czKQoBLWmTGGcph54SNxdhDugGAypaa8nMMo7GhZiiBYASade2FtMCHMEkCNdL7MFZLAWOeqy0BgyLFJrCks5Ry/IJslEJm8475noOtYI2na5cN61BbYoMTWvMCIskqUDbfyUdbdaqzyuWnTr2TMRY2lIwQi6q6muEc+oVWzsPGEuW8QdSUitTGUV3As4PsA9pYyWD5ipV4GBRIYf7x04OHdCIYfNpk8FmU6IZeGBr8GGMX6bWGRkkbmouiZTKpn/84LE6jACKlQO5qK4sUi7WSGNwYW3MTiczQiAFLh49IAmAIxmDienCiclWWkFTgCQArGyJ1mlDoUOioQHjRGClpMuzOYhdh7LVJnDRgUofybc5hGqFt2/tkjQ0XPRGVT9Jn+FNMlpNX+4afZ9QTgmiiH60FlIcZ58sNS+SjH1+tSLHXUZGoUZQPtFpxoTWgqKCAXxMKEgMPHlmuroYvSqwypPbrSTZaVI2t6aTEFNRTMuMTAwqqqqqqqqqqqqqqpEzySTqiojtC0k2owYBjoMCv/zgsTuMiIGSATmYxDFWAeFErksysMYpsGDjBC41MLMmWYAVggAn4bOqR9UdJlwpKQptzFb6QzqmVCX1XDE99ob0G2b1dffy8gUMIj79xMbqKgANrUEG3DwUIn1L0Vjy1/jI1vViVETIi6BwSGB75oZYQcoIGZplM8k6HsWGiVR+P2irRzAGFyb0Fjp2bIL3ahyqgcH1WVaUBRGMNLOMvhdNdmdMPSdMfAtBT2mN5DGCAXABhzOUJzBAGjP1fjJ4HjR0dDA0CSEBTAsL1UxYgiq//OCxNUmSgp4NtPU1jOBl1QqAgBNOnDLR5QBiYwrTGMTKKFprCKYqeCkkwGJJ4DXRxx3cqZr0Li67Kruw3Dc6LAACJo+cx17M3fuJ3DyKemFx1aS1+XtEKoKU1+9tPlVsfcQ5ExSIQPzm6/JLLLRtgv/iAWFvVqHdC6HNVnZ3qiiY4wqURhMCmd4QuZra3q2+Tn78f33Wd8nhMjrPqm/g53f32wt3u6VtVxMQU1FMy4xMDBVVVVVVRGskspS1MC6BYONDuhkNJhkymIMMIDVBIr/84LE/zYCTkAE7o75qSGeYYAgmVAAODoBW2Dy9SfhVBzHUEBFqsETpa4jAJE4SjbJxUdZGgdEoEzcKKRAvG04LgCrJBbnqvLmGM2xlCLDqbqmhoxeHlRZ28fBir8nO9SQZED31kFLq/8EMf9FPSg6Ou15TcOMeyLLam+nacKc8tCCnvqtTWhkTlG5pZIuSFWEEETwKAe6nsGSoYr9xr81mHb2YuCZrwcHHwkeCR5xolmhkIcLJxgISmggqZHTAyKQgeAIFERcCwgMEiwyc6wcl//zgsTdKIJCYBbbRWgyoJHRLwpzFrV2IQhRsXeNyoeHD0FLFylsTHcIwWEmqEvwzcQw1RQv42B+4Ecal6naZzgshKYFjVielL9SuciE9nyKxjnf3k9S0n85r8ID5Q01ExtcNNTc5rm7lm16hM6TEaSw6Ovllvv4e+u//q0gUcc8CgIEHAuTW+AjAD0RFmjDUnLXo0iwqU990eow9xUU7DwcSkxBTUUzLjEwMKqqqqqqqqqqqgC5vt7rISCCFs4xxsUOBwIYlhlQDHhUZgBI6VjE//OCxP8z6kZMBOZQ+ClI7G5g6jMCtbYUwMqAhEVkyzPU+cPXGzrsVqUm4jP5ntMw91bKNEZFAd55+W2b17fNPvTs3w09GSr0nabGvzgwJilqWjIqw0jlkjnOQ6nYch7+keRvuK9k9HtoilQ6gd3E5Tu87RxU0QJBzRcRfwwQPht4gqHEbIrkBG8chjEwtEYo8FjiDBh9TEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAKl+3rJ2ATAJxzf1xoIQCjsQgMjMGFCvAWH/84LE4Slqdmwe20tsiCplU5ihJsIzOaZ0o0GADAKB0UNQZ2vWh2hggsCIWgXxmFXV1iMOzSY8WR4anNtfk9P/MrNIWyfbv+FosyDs1h19Zg2OflJowQHSOU0aeTRkgiO/xz11Fl/2VkTvqoFkE3GuI3PGkdFRk3RENrqy+9H79ZpNX2pm5vVa3+ylSp0ZeZBs2Vn2PSpqAsxeZzA2aPmjU800hGdDExLOU/A14ATWJWMgxo6YPAQPTR0lMvhIwtWwqDGDmPAKOhswCADN6MMrKv/zgsTeKJvWbB7Si2gMQBtDCeaKz2RiyEGbB5AYKqbUIIDN6PDxczMBaJac0JpfRDsS0fYVCMMbpGYhTwwlsc40ClNu1Zo5mU0kns05QH1WgN/Me2MPmxoZGct/el+d2H7a8W2ryvH87HbsgljXCK/oooMU+oq30dW32t3ElNMMSLFlqLi7lBvoOuHKE0PWd9tNde7YolkVoxjKTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqXJLv///G//OCxP8yIkJEAuaK+DCWaopiJkI5bFpep6cmEclW9R8vW0nhj7/x9woikjOX+l/4aK2ifNVDb5eH+B/ODVFryKwyFuhCGx/jQbnV/LYesIAWuryx3BtSrHv//LjjePgTxfuqCOtTu8RNV3Ylxjg1sM987Phv+s3O85Fv5LJaggq7pL0+5jv7SmFOaHFiDWSbRk1P8oh1qtpRg0pmEkwE4c5QzzBoYMjjU4YAjU4oMLgkzTkTXgjMOgQ0SQA5SG7DyRA1R4EBBK0RhQxicwCKgdT/84LEyiOaTqQ+w9B/q5GoHTTjKcgFBZWMjGZIHzWWQmGWFmM4xJW49RUrwr2hS1QvcqdcViiyvomGaUJA63lv6jPZXthb8duyl+s98/bY0xL3/+rljB9sGwS/lrX3ebuV+DTnAYfV/Uc7ruzWTV2K1k92VxiWRM1kZ31bX2rorfequz96f9Ee390K1dHX12UTashfM5ldHIMvUUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVQD21t0uQIw4TizW4ZhhjJ0aT8GFGQkqGBZ5gYKgaP/zgsT/MjQGTATmSxXDmWjDr5dcHoDYBEIZpFltw8588L8ruMRKhKuSF9MFUdu3DSfVh6VDK6tr3xdrL3Sa93lSaARsYy3WcESIOhzXNTxSB53u0TxMQ8q+8dcdFTfopqKrWH7MayGyqoldS5NZ8qMEwWBZqgiAz5AmpCgq8MMUTaeWUF3lunIFjar2rT+mSeCLzRASKqacIwWTTRJpPpm8xf4zQ4zMam41PzzGQrNZDAxVBTXY6M3BIzIRjP4VN3GgxgEBkOmQVF+DTGjNkDTy//OCxOIpii5kFt5OtMInFnC+JnU5vBSQICbiA+Zo8c5iY0CYgEnbNJmiAfJgQENYNTxESxYZoqdSvGlzUgux9pJqVIcAY5hY3DIVpsmm5wUJnshiFs+We1DdFeh+3w8gUUk8JZeW3iLPSW1sWrFm1CpV1Q4MCQqHyCPCZcVgN6o5R7YMp3Kq2JgGQrJ6UPWuJX2qkMo4KA8G3CBMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqoAmf/eZbURDZE/nCKQQNl3jOj/84LE/zJBpkwE5p603MNKx55hkOXgYHBNxAQZ8y3QKhT+D4yy9CQMtx5pGpazEyIpvH0YSF0DDE6ms3piXwBSy5A/jSophB121uOYX5Q+i899kDrBwii60OY2NUaAv0FmeNBfK+1MRP/We/LaRElQaLnRY1YUGFDh0VNFLX48wtK5a2qI3s36EV7SIy1NXcfFypBIxtVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zgsTWJooSdB7einxVVVVVVVVVVVVVVRZTk3/++vEWLFtoTbScsxtuj3Zs7ir0ZNjEhz3LRAN7f/BhvPxfZC4MFCg+hM1REcq1HaczOEoW7nyazO5PrUCzr4rLG/M+yDGQrqU9tVJV5kdWl5Qku7OS6ohzYqCZFoqPPTtADPC6nKhbK6Q6KrOD3gIadh7NB1LwekPb6ExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVASm/3p0kBQlDM8zyZBgaFBcykrDDgeWy//OCxLkfglKoXsHLEldo3ETQTRIsZJC5ZhEx66z6q+gkwTdU7uZwIYstCIW0QLhTohaJrtuOymHaeSIBZA9OeDi1LfzP53VJKn5hYkeLEVtRwSrIjwlb1JSjCc3zE3VWjxJU+qN99WO2Y521aZZFHQCwVE5IXcPmg4eWceay96pgDnmdlThlT23NbcBz4qYILFRYwYTSTEFNAJuOThMHzBatNkjoxTfCYKGLiiY6cpkcLGgRYYxZgGdAcNDHUEBRGNIih1zB5OD/AAiwnKCSeZ7/84LE3Cg6QnAe3o58InnBxWLopGo2v+0gkEBfqB4Y8LIiyh7IGhEoSglwRKft2JFHnmdV/OxmF0r0GCMICJ7H7ssrQfQ0jyyD9uEWNusqFd19RisnrJptXl67n1HUZJHWXUk1aR91epJ2ZegZN1OpqaMym0OEBJCKWpva9DCAMpeDhtDW1vXV7CVCFxWuF8UCQu1KGspMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqALn22sqAGJKoKVzJZdOkxQCAjv/zgsT8MCJCWBbmmtTEpQNRWJgrxDht0Q89CNioTBuTt8QKCa4zUZNDXuE5wwYFRFnVWkIG5liTfQx2ggRrc5KURL8BczllsdQFCRQRw4I7VIupQoGTXYQN8oLGbxsg0y/s1TlHdRZ+iulf2MPe6Eixq0OV/KuIBtrIsXYNx4j81YihJmpz3G+QkVrcUtHKCGsoYSjW6lWaCYWg0YvJ2ZZh4a7RQYABIYsEAaDksY8G4bBDQYLm2UPoYnhuSuqWAPMix1MEwpMZBcOWVcMNQHKo//OCxNcm4kJsHt6OXEacxg6dAGe5TKAgwCjEAnZgaBtLMwiH80oGwPFOEEQHCMtMUtbNKLBV1fjrsccgMbcJp2LnwJVh06yAyims7cBs9psEAqNNAlVetFmSZ9qTGDYl728v/5kCbNQKA26fw3k4nqvxIZZ7//vXd6QygRGLmoezKqKkSqcfNxvZ2KHpeVY92ApJ4pK8w4H0kI0rSD4f1UxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVRC3ZJNOYWDqrjmu1eH/84LE/zN5zkgE7lMQVAAB2DQIdlFWYsBZcCjhMOGAkqGRR7ATJWUEAQhHIXU/ZMFQ1mWTbDAc9Ui+FaC5O2S1IfkUallLc8KDGvh7oKXGGZ8Jgvxgc+hoioUby6M94dG/rd6bleoqpikQXFXsUODVQQDo4iBb962xALWF3idwaU95V6Ux95ep6mnH7pVKUxMHQ9r2jUwwYjiGYht6CjfPHifMwxWMCRONkGUMg1vMzClMNJ3Mow1MYBMMh4cMPhQMdjNMGhCMa0VMbX/MFwaML//zgMTRJUI2fDbSyyoNyURDCwljFALElYQJAsYrH3CTAoARwDwAahnwWqD5yGiqYAOmiEWGWiGEWnm8S4EGQFW26Y8tf27PrTMfc5A4t23BLNKZAMu0hAZOi1XlRVJMroj6Yi4IKigtpSHCoaEg/KUfaX7HC+o5SJAwqQ+s43XVq7MdbpLxMJg4ccePpQLseGEXzuYQ9uh3oL67yQsQ64QEJNRgPyqzRkUVqZyzEwvMVSkuoe9rg6EDIJXMn1Q1YqTXYiM1Jsm+xigXmi3iHM3/84LE/zYSDkAC7lsMNLlowiFxo4n+WkJFYeNJhkPgQCmogEvBehdUw2kFxEQvTLEKgGhsB1J6L9R0S8BSGlv8qlAEvajAawTSIAicaw65AkcDavV84KhnOKuUz5NdtsdqzmfvpiADy336pKgg6FVQ328ZncMhQKifSGq7VpU6PCyIoIbVNSWntJvYRnjxNF567x2Uzve2ubFIh3zxqfX7WRIVmAJOJBA5JgwEagKfzirnOcQENZxiAwGzwiVgcyQ6TGKyOkDoxMExGfjziAKCQP/zgsTqLeGiTATmFwwYZGKByZBbZiQIq/LIp9mDC2jKGAgwEJjCI+NXi5GYeqgEW+DRGmsCqNIBW0QLiKS5Q95UqYjLrjwlQgjeWxkEt0/8Wjzav7KlL9buwyDaHRg5EE0ku+2GryEPCEPvDZTXdMfaCyMbFl+a3x1yfLsFSwx4wWNJUPGB5yplbU7kjrD7yXd85ZrYmojXJNVE5qGqnr2qaqiMIAJMa1JMwAiMrZIQHGJo9mZUkmBpVGkIbGGCjGZIAGC4eGJCfGSZEHTqzmI4//OCxPYxWeZQAuYXDgxhyWpj4oZdcEimYCgwYUpKY9Ac2do4kCJgOQSfBgEBo6NgUCk0NAlJAIvQuEIaNplXohvwGbKjmX9ERpZhL9Z0Aw3Tw6m4dgwGupOVoJsUrQ3enkK285TxgmCz5T19wXKmTVNf9APw6QBwIIXeBZ8SIljDgmDsizvuhusYy+BT6+G6blK9F7vftr9GrxsYP0Tre36TWEv43e++Us0h0/F+BkyeER/5ttcKJ3fT9jAVODnjKgCtt0qUmYsfmPAoXp2dmAn/84LE9DjSdkgE7lEREY9MAFcMwEDDIpVZNAyM4MSHTKLJNEDAJ3IYJA4EAAAHDKODnCksyMQENZoS0jAB8ML2MuhnwHwEwrNi0SN0CCICzTYg26nJ6mf3QWSxEfDxbUQHNrKkSPqsrRvKl6Y86Ey+nvN9BLpWpKMhkHPUSkrBFconLdDEVdqkXx9Wwy+YFiQqcKOSoZSCyS6xlQ6yWCTBAwwh1M8EDWPwumYGjHPlhmyIewGGH3wG6AESmK25hBAa0gIABAwVDSxiQCg4hmCQgf/zgsTUJ1nmaBbbzwiBiSJS1QV82mDo6a+hQFwOYaH4GNiFbD39ZRKAKC4EdBosml+NVizyQ/P4X8ZaYJASP17W+y+pFb83IpzeLZA+nhqENxGv9GgUuB0faCf74pwssL/jG3ob5IFCxSOjXTxQy1GlHYoyJcedBvPU7eL74fd8MIj2ievUev5v/P9Fijdnn/ZP43hwDuS8eb2tTa/aTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqBuSSYJHAkmLOTVv0HUMjEWwK//OCxPoxqlZcDt8QnVwVZTzGrDvjxUWJnjTLqZGa4m7DUEn3NGoMoyyKgGYiKUqmoKaTLtTF+86k9qFW4/+4RZyyub7WXRGf/eXYr48JHyrmehGLjYt8TEqnTiwjhYocnQeMVo4uAJTn9PSnKaH/Fyc9PORuHfM8Z6n2IF01uCrnAB7gBaVnpTLhQDITFxUvhJw+pwHRTEFNRTMuMTAwVVVVVVVVVVWOOVFumMs5GUnqEwCIxGFHhYhq86Y2ngGNDQkxEGBuQDiU6IAjBgDBAvP/84LE1ia6mngW0cdub4TAIKAwOC4xCo4BAVaa66/CwNnFRKFB6Qh4IbJWAC+MSYHKACDJBVYhImYtSp3TbPILdezWWmnuwDf9xilLD1qC5zDuMkBSncqef6nMKuyPiQm0qhCOK7/abO3Fq+6GLKmgMco0pjXtuU+yWVMpc5IqOCFZYmskWvtNbUr0n86u4VJwygeUelaoY0MhQy0hTpAiO3lQKhcwcKzbOiNDI07yAzENlMiDMvMaZS5lgSHkXuY/DpiQuGAVCGZlA+Z4ZGWvx//zgsTuLLoSWAbfFJw2JuQ3y/hmLQjDDAGHZksQZ4yu2XqQ5peQ+Fi1naixMCwaSgS7lcA4kaRAc8qrDsPsEM1BENXLk+M4+swnDGWjsEcmLyx9w0TVTSWG8DRz6ew6fFI0VJlviBcc4OrqugNTK/+lYl+Y1ydl8SBoJoFFD2LkzSi8RsbKwDUBUJcdFnr2PXb7P0eKI5GoD6YAtZKzxMUwYKwdIDOB5Gg8QmMwO7zDxKNLmIyLLTP4cBApMVGsWJ5/sBbYiTnmWkQUy7AZrnna//OCxP8x8epIBObWuA+fYCqZhoWXSNsK1DPvguhM2AEiCybD4OQ8bEhIGNCTBnBpQ2Ro8IsSqAbz6KdGWSETyajetw9NU8MxoLABoRWzkpC2dhIpIAPBrDUUDzkbNwBClNeNJbZew+YKpVw366q6rY9lUq6W2yWwh93N9SbmqR2DSj8SPLBUIqc+t+TjlRUmhxN2HduBFtypbCj2CZTwqZeKqq5HRBAWCwlGqiZlegOLxhgcmkAWaLcRmcdGbtyfbGphIIGNjQZbHBhB0luguET/84LE+zMyUmAW5paczeNW3CwXMkGo1sUN9AF3KWxsAmrtgIGFCoxsmOpWHyTTTmftYig0fZChoyMZVQxFTmCgA7+Xtgi6yFnmHiZM+wPNXMqCld7eA4PDQThm+M9U/9X5Qt6MYV7mVerjY0QC1N2f79ei3+XTOgaJ0zUfpqUUxZrIW7YmwqrqVQKKPRmq1EVkKVR7Kj55ZXDHKuQOEZwOmDBNw8sibIhkwfDiBMBOAswymoapuqr/vMADkxkHDQgNCzhMDhYxYJjMtUMOsA08jv/zgsTyNdLGVAbmytwzg1A/NF0THK4MTA02mvAECgIADG5GT1MLBIwyugc0MuIUrhpkhgn0gFgA6sEac9utAaiExdmb5EgG1L0AL7Ck8OLy4qhYag+XNyfJ2lhDHpyMBD1Lb2/MVil3g4WlNrN9Yxe1cs8uLC753/u1uU3CUk3lSj/dDe/f4jKiRH703roUdRSl1R9J6O+AxRYJnb6iNYoaUHDSbHz2DeZr8OBk8pIk0MqsjbcrRqMjBY1cOjKj4MGgIw8JjOslMQB838CDCXEN//OCxN4wAkJUBOaK3LJMLzmRU+Y2ARyolgoQEoCG+IcQBQoxao7g87w6noVfmXou0nOIRBhIaAwoVKlYTZcJVCKZkwKJBAgrMx9MZ7YOwoXymoANBFAQGclP0ED3n37TEhZPu1jMkXZnQUbhxy0tJI6sowawN4LBWyzzyjJlsl1/UtfTZ2MlJ7qSfQU16pReVeIHWvDQo5ZqNveNkN29y4QC3mnSrVsF0hRY1CGCv00AtZbMo2gwSCRQ11lMKBjBxY4JLM9VzeDMQ/hjJkEA5nD/84LE4jAqRlQG5qK4ngJSPTPQcNiINEYuysAA5ibmJFImEPldbUw4octTZh5gg2ZMnO0r6lcDJ84pGVhJUMjC/oiy+7b42XlCz0Ck7Tua1XkVWLXrifw8J1r0pHkuzIkwDgjo0zCYOLIMpx9b9cZQoXqmzXBYeW5RDsVkELsWY7VAA8qne79YTK0rn/gyJVaujujUbXWZmd+yztvyoqsyrba+hVYklXorFZ9tBl3qneDg8Y/LQG4ptwMAQLBhGEe+MOJsyaVTF8SDN4YNBxjCLP/zgsTlMHQKXBbbRYVhEVmonUMh1W00KIgaBwYEjHSRMQkgDcmBXje80q2oTJQSnByE8RwHfIBUSbo64WBuc4BfVlBgQQcAuAUBG2nSN3WTtjbRugY373kpilKnDK3gT2Gp09qpAtjDe7MSDg9NrLX4yvK3dkiWMxnr9X+4X9KM0JsTredJ7URVbe9kMYEd6TIVS+qweJhdROgmIQoswdWfaiEpcL4/yGEIsxQolWpmlS0qD/cjBAlACsNYAc1qAFnDBjM9sczsaQkJGHQSPXEC//OCxOcyGjJMBOaE+IUamBGdBRqmWJAgBAjVgYtyY2ImFGhlrcasMtgvtMMgOn4LNkpGIB40ifGmiTofWmuhBptqiSSuXTJorLXLIX5ttwgaP2yOokq9U3ecW9nSQY/4tLmqRv971d+qjhrPDv6qds/EFu1MufW//7nQ7+waaMUhh0VRFnFT44OGGOIE3leVTHnJ0upI54YfNqES6D5zR9FK4bcxoosdW4SWkaYNTQQQigxwsANQTYCBMNgIxiRzQjpMXjQ5CLBFIxKEgoWmGHT/84LE4i9xolAM5vBwjwvNoqBFwwOCzCw5c8gEAVUxA+OyZWNBqujW04iBhwWKmVgG4ekVsaIPi0mUrTsw2rxr5VKkQFjKY0fe6sos8kFtlM+EHgWOG7zj2nn3SKZs232bE+XZSLAn5o2yZfYvRBgOBx9SqLKOupRjp/1K7tuptVO+9VdzrGJOjVl3pjlD0JCbF2aL5qzlK79Ghll5kyKVVUxBTUUzLjEwMFVVVVVVVQApvvuPAYEwJEDJumcl6wLOHUilwjtgoGFEB1KhpjADWP/zgsToLcpCTAzmmtQQEpBZ+tJQDaWpFjVUR8YWY4YuhilkvMYMozaZjlSmgN+0tDBBEkFUXHoYdysbjeOfWAZw2/6wiJM9kzyZMBg9oY/cCtosmmaVVPGLtnbGksnvs+8+7jrhA0OfF8sZU8ybjuGXwVGyr0XrC5tCWrWJw8Wc2xyipJxYgRYaJqqPm3NuRVGMYb7rKAAIqy1QqDwNRgw6AIwoLsmDAwhHAFLGYDG0Z1B4YLKyaSgIZFmYc9zWcvDAb0kOAg9AoNGLAFCQyloT//OCxOUqggJwHtGXZAHD0z57PVDwgAMNLDDyoyD9AAGgDBBAEFR0awDhgvQIwBowMAmMjQ4YSNGrwYcamIA4sfqXvU0Bg8Hov4sAUkGCpgA0RDUHuixF3YJUVfqXNbh5mKE0BLg8FUEuj0RlMRSFmJvv7KpkxTLDFeaiGFStf3am0/Q4WsBIInpKjjJwmSmHoYkwOwTkYhwlzBaDrvRcqDM3upT12dCjUmipNWvRS9u/TZE0ZIhEBEcahi3r7mPscMLtbMLE52ihgXPOiNUA2qf/84LE/z7Sxkgc7trcbWFMSiSCBpAAVGDQLmEYPGABhmFYKjyumFQSAZJywDpiha5gQQpvUsIBNdpjgymMWsAiSFkcFUyh68ICMblF0r6HAwRDZmKC2inpW3OIqvXqVBE0syJgIkGGDRxPGNxqw+sippaGAQcaNep6uqXbtXKGX2uz4KEy4x3WsYI2ZFRIgAThSvcR4yWR9IQULQbBzB+JpYOE4szJYxYrGDCVOniYXV2rX0hFb/V87QUlZdLfWghZJ6lal3UaopJ5w3VO19rv5//zgsTHNsreWBTu2p+/umNVOs63vclN7JnpnYO7Fiwm06oAH27V2RkECysDQMwNjaKwI0I+MNQTIgMGRQCSkkjtGYF1RjSOrfAgsfTKW44CCEXSGaQzdXRhie7jNWRCgKLEi3pHBsfjUglatoZUMoC4AxWAp6XTbXE7cpgLgLWTNokae9YcrltIjAYbf0+XVcfL8SVb1rZ669P8YvBG1tCWBtSrVCk1qa8UmIzMOL7GldnVrCWG07U27vS4yfqzKlm/rOPW02xQbop2hEgzApCq//OCxK8wGt5kHtvVUPQUap4uuRbQJUOFcs6b2LoEtQArJJLJAGmXxRp4AaMUBUXDCAzGENMSTYQQL9BjwgYPBcZL0gVQkMnQ8ROSuAQiJiggBn/TcEhkcW6DgJMFRcTyTDUTLMmDghLEkL4Qh4VpNbHQQMHQ/awIQNW40h8nySzkO5xfJcWsFfPeNLN1ikN7JBeBAX2c5nzpBblzqQGUwR7YbXPOf4VoZMBXY51vWZ9NSN/jfRYWE2mvGs0m9aa58uWqU1nH//tjyqFSceuXagr/84LEsjRaQlge31544caLOJRiGi7XOLPExIOCgoHXAiqKEfhJgtISQlS+saoAP77agbKKRiKEAkyOIIIg3GX9F0QjnA7wCB58c4Hai5wuw26Dc0udtiUkNJZbTw2YArQxpjbuI4scb+mpuw/NLTNGIctBl55p76phcouYGwxldllq1mpQsHOPMry43UOMsSRjEN19BBQ7gItEcZdSIZg3nTog4RkkEEPdkU2EOUlorWpDq7hs7Zf6VmM3SiZeZQixOBDdOAbBG6HRUWcsm3Hiw//zgsSkKwrCbB7TR1SdUrbWglRFTtUAG/26+VQEwAiAy2YAKrgAQ6ZMKAEGHkoDEYRGGFh5lnuGL55ptCZYXalbeLNGXEaak0/plsQh5YBVuFF2VxKrL4xYtv6GsQlcjnV857mcB8y4pS5veMh6jiMWGuDSvdUH/xZP4jN6NGYKmNdHOb8Hws5x6N3ZYGRoBXAEeSLrBcmgKihM1EBEKnO2fka7ySXU3V4se9NSorUT2akKABkckwyLzCz9CqB0wDDtjBDjIFDEHQzYBBhrtA9D//OCxLsnGgZsHt5UmAsOhSxF60YgAAA4YYg3ORxinAgWQP3LHKg1Ct/+U+NPH3SRDXIFgTTLzr2u271JK44Wncetz0V1gUMMkI464RCE4eBnwghCI7/1iUPNQNjg4yv48DfhRRsxcZh6/o81iLWp6pXfpSff/p823t/HAhhm/srazQqKG3gimem0xStqQMGQfGACLGbAwyIUp73VTEFNRVVVVQUZJJKzCWbhFswBYiIRwGrwQWB00YngaAELDS4hJYDCqPqWxqTrnthC5xYqGzr/84LE4isaSnge0h9qN500DmpVGyI9mPIPhGpqc3nhKw4NmFxyjFTC86+Xcq8MUGv66h4mvCfPgPDjhUONbUgq5TAjbDXGa1zfUYKA0e/+dfCz4dfCpu+t0roTtypjNe5QixUSycKgyzHnLMnm46BBxqkcWr+iUHWpulbIhYgJgPiEVUYBh6ybZN95GzW/FUX521hd1SoAl/lRd4wDC4zVAEwEiMyXBwwNFAyWDowZDMx3FcxMnkWRAwxBkxrm8xcCE6tkMJHTIHA4b4QTg0YNfv/zgsTyLYrCfB7Tz1J8zjpaSgghgsA5mB8l2XpJQQCOJ1qiDh0MFZctdmrWGTjgCHdiYphZ6JPLuNYfmWUKQjJ31dMwg+B0dakVqVsVk0GWKCLCx7LI04aSkaSReD2C2bGxgZlgsTc8CeA2goFtbLQRJQpm5xB0jCmmtNcU0k0FJWqbZ6y0pdVTr+sppM3VW362/1VIGTgE9WanHpsKrGQD4qSWHppg2idc2LKrGwAK7ZIJBQMCgzNHiI1hijKI6EiOITQYuNoWApkCikzDBw7N//OCxP82+r5UFO7mnKyxGoMESkwQBDFoDOnG0MDhgcHmNmSYnapd5VOONfMZgtgBfNJwKFsyYNSIFyaC34ksuftLYwKG5GFCq2uKFmc1NJlQ1JnHEY+Gg9DNyzqV9na2l4EwQouv8aNYymoj3bYkzNkYBCAqFR/XqF9EljVEzl0wUdOpQiRSUiddbINUnyNUlrv+wFCViaukurqrM3RG5mmdIptOE50n4S2aOJW6r+vn/4+a7qv4mub/jqvWOXnu4oi2MaoArX63IqhRk42NW57/84LE5zab6lwe41GMasiIAMFETAEMEELDjFjYI7hwWMP/jDQ41snLvCBHO/U0ATPEzDJ2MaA2kPU3AxgAfWCH/BAibYaMuisreJ+oDrvSYeAT6VqWb/uDYpbFqdrSIcGFmd57OWdzQiqERm7i93q+8aJ5TX+2CBmE9Q4HQ2W/zvt6uwy/Urb8eWlsnaWtqxc5T74nICtd/8JHF0DIwy95l7drme7gyxPJVISNSMSUGpkTVyf0vWRE3QLN36pHXQCbd9a6PZhZGUax5gyEJ5jIWf/zgsTQL2qSaB7b0WwRCGCSYojjBI/HiQ1UXNYDTCEJVMxguNfcKMukYs1A0VKw23Zh4yELvMFVTCgMaYOCQQ0+GKd3XcjUMhxhULAY71eEWOV3rpZJmwJoFP+73LGOVRWSI5Yv2U/nAr9efMXRTH0IyveYkCjscZapllYi9DtKiJhhIbxfxz8xyEKoqfMxddfWn/1DrvJxnw0urpxJrEA6QCTPQ8EFrSEkxRN9VXcqAS3324xACHIYxHRujJzDQ0wUmAJSXiMBUjEAIFDpglii//OCxNYtCvZoHttRiHmQEa3ASFAOhIgBxTIT4yIQaE9lHABjwBDULT3ISAxA1B+pZdItjZ1aZwS9cFMaikVcel07uSAXMJy2a0+q5kM5LbzqN/vUJ+VV/vGVyZQ0KoQpbeQCFQnsjsrXmMCam9UNZyY2FYnnv2Y7VIrKaaLsfe49pcDghscDA9AKRcuxt1q0EqzsJwRNCqCKVixqqtBMfQDcjb4ppmHleZHERzy6mNRSmkEJYxEaTI4zEJqAVoFhUasQgtVjpSgKiJi8yfLxmLj/84LE5SzqRmwe29UQwYIEGG05sUUNAzMKeVmrirLVgBwBMNcjJYcWY4i8b+QpfNA4YGTn1HAFK2s71HuVKGMnvwYYIIjQpZ39hv7UuzdB9ko79G+pLqspSwU06k1ITxNzdIxDUgvVlQ80UlpKMV+0wEjZfUtlIvMjb1L9F867JJqW7UO6C7VqbQZl6aGp3f1K1JNOOqroyGRYHFzyhoaYO2j0B1UACy22MIdjEqFHQQZ/uwKGJgQhBcegoLmjRGDQeEQEyEMMv6C0BqQA9JiAkf/zgsT1MhMSVBbm2pz2vCLQqHmCzphK0LAj613IMmDocayrYYCSGqngYTRTaqkIlUokIYQV5iklLlyzLrRr32Ut1H6bjUUuqIgnGrUBGL5+ewGqbss3Zraoxj+Pkhtm95x//cCIE2LKRwz+K3L8ez+efebXS8y5rRxopGPDohYRMHUE2w8mQQtpFQRjYrcK0n6o6bIXIFWJCipMQU1FMy4xMDCqqqqqqhABSSyR4qgIVKwaDmHyIXGwURBc1MDMjGQoLlIsQgASVhMCCzLxlM8d//OCxPAuCkZgHubWfAw04CVhkQOARYysuW6a/0k5ZaVmckxsIL8QLMwMxtBiHZiAco3ZrzVPj2n5UcBQd3q2z4V34Pjuv/81OvUXIuhBBBP5vLGZIfiUNmFsHAHBoo8FAJcn64L+77f7W4ipiX4vBl255ll5fbeltvxDUcoYPs7jTQ2OlSFnF8UscgctO9G1cqOG7+FqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqikpdtv/84LE7SxjHoA+2gdyKGAPUKrC0iAKmgEY1qBhAteS+WGpDgQT+Omqjk4Ciy51wU0AyiEZXpU6LExL/fIs49yHNu32vGwSARDHIRzZv7TEdtvoMj7q0oiNKlvXtl1CS5zs7njR3m0iJ+tphydbccSOeIO8xmyLet6a7pw9bn2/W4b67Tds7viHm27NS//P49aveHtf+eNySNEMDJQ5YmTJVDNls8xggw62mRX4Y9GRmgWGCz+LP4DjMwUTDL5CNYN8OEoQPTdY4DAWKjswCcDIwv/zgsTIIzpGnB7CTw+zTAILRkgAIQOHfiEdXojTMLU9rRod+Ls7JxVNNd4QFQ7oXBcNYJlssg9hMCwOqQXANQWRwY30NUkNP/EJizBja1KbEl7iYCgQHlj1JMUHDQqLHbHS842joMGd8qj6aCL92Pc/W89dLoh63R9JIWdNE0XromFuxKVIkR1t2pJ3RCa3nTLBI44pq2k6VUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUFnJJKhQ0GuEyBVOML//OCxP8xknZgBuZO8B5zbgUqoJhoODkFC4x8TMAFEbhIwNXIBYDKgIZQCNJCocAQ1bgcsqMS5TBWByYWku9IKGHcHNJC6WsX98QSyLVS9ZttdIFWHtHwZhNyUaHqVNyzB8KZGlZA/Gt6D95owMbvqbm4BOzNjvmBY/JMGvhwsLFdV5bOtFlvYxe6/oqSpKurWF71G8DKTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqoB5ttRDtMfsGmpK5qQsY4rHQC5jgEbCKmFEoITChfBYaP/84LE0SVZ6oAW28sKI6ZQFi6wEBhg4iaoWuwYobmCGIosC8VTP6SCg49VCsQCl3gzRtJ/laKpjrhm0vsVPwhkr2QZLH3jVI7YQUhIj0NV2KAowUYpgca70+IBJFPWgkZieMPU0YUKOhnYlRASdo3gqfV0q398eBUAUUDVz1E1rvvU9wpvQzchjVjHsW8SNMr06V3rbi1RpoZmIEGG6wXmgAEngyNgxajLIHTEM7k1DGkHzIpSjDEjjDQbTDwOzKUIDQcpxYBQsIJreIZEF5j6N//zgsTlKnpCcBbeStACQXODkOChMERZCYU8bAwBTBflGkzLYCYXKfOiX20sWIhweDAiS2hZVlINJOevNXrM2Tu4vkDaDHA2Uv6+0ed5u8Dyu9K4HkUxbrBFfj0PTx+IAVGNHSUPzEHO4VHPNSs4Lb6dDOZxsyHEhB/sVWGQNDhYq15Gs60GbGIZdFPkrvqWMyuWYuxoEfVQv9N0sSwa0C+aNKQaFKwYaKwaPgSY9oaZzAeZfhoYhHUYtAwaQgOQjAYIgAYSG8GCWYIDsYFGgYBA//OCxP8xeeZYBu6U1BmQQdmFQxIHGY4FgEMFUjBgJQPGYK7Ohyw1/DZ3KR5G5sphRimDSy5gN2rsCntnAqY0wVAaNw2l0qHIyGwWkUDQBXNA+ksvN2qjCwSlyQOiPYw0D0I58nouKDxSrbh8d+YLcratmJOv4b9s/UvyxUhGLQtFIebJqXIobyC0d7qNDFOUpqLqkUX6XGsCpehd6ExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqCTm222QcEQhgMGL/84LE/TJB5lgE7lbsOp6FHyJqkFrOchqmNAy/AsC+k+GUyBLKBo+TBRPkSkEpyeiaU2GxrJKkikURDkhO1XuCoRHdEJixOhtZEV+hKrs9GUgkZb0amp5UQjVRlqjZHmB8dMKMHB5jxBt6tsrFEFlRaM581FU9elHqn0tm9HZ1PPmVulhDptULTX/eL+A583vXq7QrrtVySl3TAfAEA9NJSowREDHgPDxkZEfhiYXERcMymExoPQdHDCQnMLhM0GagADwoKTgqRAx7M3BgHBAO+v/zgsTPJMtWmB7Kixth3RphjVBE7MkgM4eZgpIxbcBwmgM7XO+jkJoJYSwWGwKX66FQCXC+pdIXidhhIKEImpmRJ5ztSTD9KXlFxLQWiQHA+NEgkHiGg4oyKmnixbqdYfv3ykVJ9u/0UiA4w++6EQfecMlw+FgQlz60CjA3etLS0o9wu2Pa4T/UrhojTbt2ixeCAswT4uutTEFNRVVVECVLbbwqXjLkDDKD9tREZKEYYSTREqAjKrgKBIwTTyJljU0djtOMgMPh8dLEyGRWoeEY//OCxP8xcaJkBuaY0PklNPhYKAq7BnV5G5BGoHrKx3rOMfh/VjNnmFZrr3ulZqQUEsTVFyQDOPgivYlzMYQjOUrE7nVMfajnVz+QpRWtYHMRlEH9+srMqb8lJrFhTaVrIEwtUoI1P7VqJIaUzD3MsppP2s1h25/4WqfRstzRWPh07mCfGuMxUf2IeoGkkSyxgXc4gCtiAJNuM5Ma/g46ojKw8NkTM0++THQtMZPk1qEzRh/MmMMBGI2qCTGiGAIKNml0EDYzPITRmfEQUM8GYwL/84LE9y7rOow+0kdyCQwymDmgWMBAe+YoCJmIvAUTmEAGFwuAXGazKRpj2YCEQs+WBygpjJrQOmFTZeWgCJmBwK8plpDxrIxeoehClLbPTEHTvTzsPw3Uta+8zBZKIlnqkl7Ceaf+aejCxyYAqnHReHxPz6OYA8Lh6cNwXyU9x6Kgno5Kg1PO/l21GTruXflEP2XWLyTRnt/ejLVr8iCr1ZEXjUOFzz1Xkt2OLNDIwHgkbIirghI1EATJbbKSVEMzEFWGuqgqFix4DBQeJ0mwEP/zgsT/OVraXBbmVRAIKBy0QFBFKTBAxmKaoPOk4hGCvG4xEwv9YcoHA8djcAko+YcCYfStIo5Q/FR2cJZnPW9/uJ3o6/kFt0/WoxJqJKhQkEi9RcIx8PsdE9D/+b/JQyhGBqLDmQBza0SOJrn8StFI3XLmaazHTYZGe3kn2yVl1R3sa4WctCSMhWqquroj3XT+RC+xV3IYWfbpH+kx0qaRlME2+N9UQMNDZMr7ZMGRTNqA0M8yHMNAENFR4MFBEMmQxNIgiITzMMw2MbjPEhLM//OCxN0qq8KMPtoFb0pYjs6FjFgMTA0sAYA5hCdpo8HZYB9OYwuBEyoBAZDhaznGAhUm6giFPilyGphnN1LRD3DGDxMWkY4UHCtKYCMk8w8Qvo5xQB8lFRo3vFCIGg9nkCK7mYgrEnBFHdBKQ8hS3Za6WMqcHcpr0GO2g6l26lJf/+Vu61i0qabAuOfB5bnmkPmv2G9sUmpdfrBxaA6464UdLrHr7bNqrMO5mLNgSsRX+w8aPh9FDdbYqKow3aVhQbmFJsYFIwOkhhpWmZBIYpD/84LE9jbqJlQE7lcUkYXLBh8UGRhGYaD6dBnERCIIGMSWcYfIGABhwYiIGhUqgEDjAGlQBAgsgkekoCwABgUGxhCRACRQch/K6Vg9O1Go/D8omQHBlmlgpT8bGgmTAAuZvGtAM1OZz+1vzlLyRhs3uM1hXafZu6DXQYf/cIrWA7bjdW+inRjkdTFDgr2oy1Quz7qJBsRIS2LufYzYiDDPIzdZ3tUnx/9Klb/mjCE1je1GjBkvTTN9TBo1DHYGjIRJjLYwDIIHDDlABUZjMkOxCf/zgsTeLZJmbA7jC4BQYNBaZ3BAYMB6YgFOfQgYLF+Yuh8IQ8MBDhM3wNMGQRfAwKBsBIYWA9gEVBYGH4ZsC6nsnWgEAgURp0SdNPJOgFsZBSgoBd8OzQFUqYRnKiENzuGWO/NOg3zytQc5YMo3CZRJBVZEmpnYqasy2loe2t0oIlWPCwdc2jz3CiurBK+pr1rN6a7q1mTU9Gz3Sc75mb59Ga6e6eZ1XbK7kOUxizmKIQkknDLlIWvaEa3IDJJLwoTDpKWMxhc9tODCKoMejsx6//OCxOs1gvJYBO4PELYzMBgN5TCyGMhC81eKDEosDisZ3H5icDmKGgcwqhioQmbgWkIACeUXoFAxvkBQCbYQDQ4FNnIFwNQ9Q5yoSODJ1KOpWQUkzVJgHOEAKPLdaSJIBodkoeiBQAxiO2Ksro4o80wgWjU60npEO7T6D8pixWl12MY2eVBaKlGKD3+ph7PJAnNzH9jOTpzGRnI0NMU05ffsSZRsoPNruai1BoIvNp9h58l0otgri2tEzXTySkxBTUUzLjEwMKqqqgIBTu221Ej/84DE2TFaVmAO5lUQDPMvGp1yIXJQAkEaJpErWCL7kjAHYZecBcsW/RvKxa/hZc2ap7rdiY+comH4v/SP7l7kqKL7glm7iesZ/UzUURW2+GjV1L6667jMuuZr//qkDdJoF0b8iM5mN3qnFpE1MDp8gxX/O+56kCSkXP5pjMnWOpPGWi5Khb2bFsS0NoBNF7BSEL+6Lw00rYDR3OEzsNjwgO1HjMkQVNyy6NmxjNs0BKgpmKZ3mcAoGmAEjw0mMJbGchxmGwOmDh5nypBmPIBG//OCxMojumagXsrHNncGwAFQw6JgxDBYwsCdWYwdBcyFDAwTFkODYkB0wbGc2HDsBAuqsrwx9CQmBQqgQJBu0s7jm9AiQQAYYQkzBj4pGAnM3egSeaqACuDzWnqbCJJ+pLGZCzUhdUBBwUPUxAJTWMX5enGnfus5NqBZ+VjJh2RFERD99pIPUMJabBw9fNnNO2av23vjp1yhf8O9zL5v3PjdC7ZuVqFSBdjmPgWtVevKoEBrNIsaLdduLSU6sBu1KgrkkkqKgSaSLGehBsMIQir/84LE/zuKglAM7lcsaOKm5lhlIeRQ5iZmYADGFgI6UGPGplIggeYIUGHLC7QMfiECC0BqDPowxEeaMPY41wL/EtL/pPNBaOA4PoGw9YHFY7c/CglI9GQpQUDvYYyrCvhntsMHWc+NGDcvoeg9OTNFEpS1SFZGmAbP9cWujbFUAHS08la0XsZX1TLfDKp7UGfHE91Px53+U7cCrXCpphOwUqFm3VPylGTh6YcgEHZILsexzW4sHUmDFQApt/rg4RmkhARVGLa4yiioucUDmXDwtv/zgsTULtpqfBbeFtawJMTCwsBZREPGbrwQ+luAwTPWPUYDDhZBkKGREgIe1U5gwmTMHhgkBBgvMgFH7jGBiYNF3daZpd02nLF1FInnSx5jCe8EKZuitW3pu8pr9w62NtZb3TCh4LcwepOmpOopUmOjy85n3ME2ZEO7rzF0rqZXBkWY+a6n6/6fjUq1rt/ZXdGfI093aiFtTRow08gSW5aIsZVYGh3b9K96AAksYhgRisMd5rsUGSbQDTiZmUR1Z0mkD4YVCBhYBmVySYkGgqYz//OCxNwtKyJ0HttLiB8lTOY3QpID6cxQJh0GGFSeAQSOIgKcQoFQsqAJlQSKnwsykIkYYKhqIt1ZUuDnV9VgkRY2grEICUZSSX9T5r4owxua2CgpPtFKUU7OYW5MXnZ5nq3blr1ggqIqIcXXSKV0zWZFWbrMy17VpMXympzAPkNndSBu6KRw8Z632uuki/bVW6tdZ9QQBUFhwlBFBcINHhd663R8w3Uz//XVABm2+tDBmRORvYWcfvmBFJpCMeWTGhEhrwEZgHGUgAdymOBRgSr/84LE6zEKUmQe5uDUGCcAUKYpwf/U24JTGAOmJUERUvnqGCI0isgNV2ACx2Cb/QfQlDa7BKu6kqyTQiTYWv1rLcmQlpIZFhDirC3rDRItXnq2NC1Gcz5Ewjekact43apnu2nL/dyyjj7igJjtxRgzi4Wr3mlc03rVQqH9V1HFfyWT8uWQbFNr8md1WLeHRxtoick1F8Vfjm4FbU9J7TKqVkb+khVBhZNxj825SDB4kNQN05LFDCgnN4CwygiDEJuMIlEKoAym6TLhxBAiMJmo+f/zgsTqLhpqcB7elpzCQxAAjHxTMBCox6I0Q0gEhkijHgPEQFASHEYrCyIMlAsSJbXgcQnArqiwZxm5u2AgT2iIEhc8V5gSIAC6oCBUWhmY0FMRVDJvWJOdEpM+jUN1acZDjwDurVJvc9vHKHe+FypeeF+YtTTTBwuN0Qxwxtu29k5vn0aS/6bPoPb0KJAzQYGGEEN7HIbceVl5rH3VMpjXkV8/cxCn37JMQU1FMy4xMDCqqgrltu0C0dRoWVsQcAMMHPEFNq3ErBhQylA0qXWC//OCxPUzMmZcBuaVEBEJCYGDSku3aLtIMVY1BEsoUrm4JsvCKgJnRK9fVdh1+LE1es2KbtazboGb24GrTNqIB6OInqDKvAsBWqPDl6E3Ui0IdrqDkSf3UTZiP2AzmLGzG01Mu0cdJd9l3f/38sz0wbMOKBsDCY0bZkc+9aXwsk0fLmSSGZF5IJViR2aOPCzjossq9S+qC5JKg4CzB4ZMojkzwKwUNTCQoKg9OIjZDAx4JDDwnMDBgUEYJCYCApeZDQ0uEnHAR1MEgwwx2TtcMCj/84LE4SlyVowW1hCaXHBQFMJiyVIQWFwUPwp6Agov2HViugohLYblrdVL5TGZcxlHKQqwN66WCAt2c6SpUxlEw8u77RQZ8kkfvNcxZvHQlqb1/zpXxHXnMv+a8zvnD+3WFKbjaqaYpqHag8JxFkZ2sJQ70eH+Gq+Lyxn1bz1/PEXU1m/1/8t98QryzVfoX1Hu+swqtYrtirHdstsNBcbmKj2YlJZok0GGB4AjcdnjZmc2DUmMJoMykAQFFDBg8M2BQLhYxKCQsTjYRgVsDGkOiP/zgsT/MeuOeA7mkNdMsnTUJjQZsB0IHPjBtRYQFihrSp4wUBuoxgw4VWFQxNchABgenaTGWUNEbDOqCKlDiq1C9rHmQzyPq0nada849qAGwR2kkS8Qak2IEgCySxqsqWubS3VKtW/p7qNYrkeX36n1zXn6ZvolHg4XB94gSKg81RATuXx+oypJoHUSn21kKVibS35IvWZG5O33PWqhsMCpiJVgwjnEMKY8CRj1CmUHad4SRp8LAqrGRh4Y0HphEZGtQiDRSIA0YrHpqRRrdNKB//OCxPsxcfpoBuaW1KBpBFBaPBAIIgXaibxqBphkpEpC6wyNk0YRnLkMOPEUclp4kCXMntL2bQtItIpurKkUwYKMAdfseZIFIFR4VNK3TLcodiltfDSlfrYkUZV/MVXvi8Vxp45qzXvVQGsInYKTCR8ki8kODaFnAr+LrjJ5zKWrg10TVco4Yo8VGUiV8XJEa1NOsu0PU+07WBaR4EmF+lqrMdYsoLIApddAoXAphAziwUMzO4umYnFRwgiHZgUND00cNUJAGZ5gcimTgQRAgaH/84LE+TOp9mAE5pD2yCAqCskvcyiIygMmK0qBSR3llLpmuBaIoUYEK0nUM8sgGRwuq1JQ1aifiJMUYhTCINH2am2BLAAZdnamD+qU06CdpNFLJZbzgh5mLwRyPLi3yKSWf1Upv/fcQsjoPlDFzjJrikmxihH4+xq15MxGuSfxY/X6nGVUm6mZqL9vlVbn0/a+7Kb1Zidv7sXSUy14w9lTax2mC9tpIXUHCyYWDhYgZkkLmEScYBKhqYRmkBwZMPJhcOm7KGEEmnKBBsAhQosN9P/zgsTuL/MebBbmTtjAoDA3gErgqOVYsUGexoeYgeARgkRlZADOIESwoh0WDBj3sAXqQAFa8nKkKaCAhuFEmYsKqoy5A1cTYK6uQJyhacOCQBXBUFQcCoIZnFdDlKjMs52L5sqVQhazzUGRVMcT/V9mfUt6f792dyQ5HojlCbFDAyyLuQIYtNPFB7Z4NG1MvhqXco+ORalPix0CjSqamtuZaoyRxNWXj6ioa5zG1U92oPbWxqkO3IzOw02gKESkZ0iiIUMTDAUHnJJKdAGSgsPG//OCxPIvonZsDuaUfCmDbJxGubGVBmPACptEdDwRkjmIWmQoqhTYmX+aUn2g0uSy4MyrEWVjLAFTrAhyCGh4u0xkb/DIB9Iu+cV1YrMnyjEVbA9+UffqVXsaZ8e6q9tBSPSoocqseY7E5WpgRMrTNKvuY2o3ParEl/dZzoaxxTse6k4gNA0sMMOcXSjrsekAsKR+kYsitJ9eAXkE6Bz1i9XbXVwIKjBhvMrEw0GdxgAGCDWYmOBxsliEzmUzMYLCRyBZWRODAMobJkIwVPyBRPH/84LE9zGKdmgG3o7YCFMafDhAsPJQRj+xhABjhaapQiLBAYTGQFtChlPQyYaINjX8VQCzbye9tcqYC84fTye1ccRYU6K7MVzh4cicKW0Jx8KRwFBHuRIm+EUT8npaVtfyftv0/uiiPyv///v6atO42X99Pr++Z/Zt1WX3/a8qSE4CFXOcyFMWxOowY6FmGr7dlxhrp57xy03qTEFNRaqqALa7UINHjBk02JWOMSzdhAOZDoHkTdjUR06xMIA4z0PEaOZIegd4suBCgDU0Q3BDAv/zgsT0LxpybAbmlnzQuMTLAwE4bxNExXiVZEoRkAiAjHfp3x0gxx+2FLEppHQvbChwZdcfd9UDEAclCRo1izh0KtrX8H1x183I5BEbDZEyBo24OCRpXoUlOSLn2SfLIhYDzW8b/9xj0JSIFV3vJv+KRXovr5lKqV5Hi7jLlr7XSd6UFbkmAKmE07NetoLbpuhAEPTzakxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqECnL//OCxPUuUnJsFt5QnPf+9Dgo4GkBNVngBamIFcRy+L4KgI4Yrt8KhwJO3tMKcQVLpl/q8Qr99IE89GUwu6O7IhSChBdsYqLV1dRpBhXODdhLScDu+H6vVZCENoBlTTRr5WGczxM//86OjCxjjqmGh4wZEjCrtv8Pr//3/rO1aflQrkkZhM3+gPu3uYgbmrPevO3wqm5VdttUwORAwKGmBQYhSJpQHiwjNikM6gYDH5QNWh0xQJTIhcNT7w24eTNYIfsLh0z68Qhj6KjDUgEWDgz/84LExyLKcqQ+w8pbWbN1KMmRN3OCzVJkhUgwqHX1N5AIwBrBrus4Eh4iBEahWl0JU3gQeWRwiBs+Axl9QECU7QBM2Yu+Urv14FtvHOStuL/K9cSlvtMprfJ/tnKimUbQmPI1KMe1zDAUCobPpCro05am33Y/UsbE4acx/+hivOrNrK3mPX0S9D6tpU4tGC0wD6nU0qFWjhAQzanvQWqFo65wptMqABk21vAgwMAEhLROJ/jJQsxMTOOtjzgozgBCHcWKDZhs3njOUDjBCpTNxP/zgsT/NNriZAbmjrw2cITqCM8CkRggDfCwIYeuCIIMmQy8DXRwTBIqMhTF5qhMMBIeqprCEEMPEdxuUp3IPu+/r8qOls58oCHjGgC6wGHr0s7K78ldS5SQtpzeY5TNnX8ktju8lkDODSmKxPzekDZaVrtaKFqVUsylsLso6qarjQav/yojHHN9Sc99rmuh3PFFdimMPWbmwMm5rtow/cpKABcHP2Tqu6oLtokBgktGESwagNZvd+m6w+IwkbKOQwYzVQPMwC0wQJjKZFM0f80S//OCxO8xkt5sHtrLpF0x4QzBYGHBYZ+JgsBSacFxygsiQMGQ6YzRJj4Jm/0CsAWAoQGHPmuAPM1EZGmuOuskuXYQ5mtTJdrV4DRIqESfoS/owHJgaOSGbeF8cEOFR+JjsItQapCmeiH0FWOWqVl1XOpL47R4YXmhho7rHWXOVBmFomMfFJp7TcqSI7zrXdj5UeMc7+/sabqYXZKmosyiN5qvXKPZ32udTyjQz+3fDBYrtMW3TpSeWkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqr/84LE7DSiwmAO5pT1qgU5dtvZgosWtWgUSjSFwTNXLPck4jBRaw4nBTiG4GcMtcrEgnp5DBjzJicxNZSKitqahHax4Mf7vSJdy3D85s5XoWOHIXGGiwzS7soPRenKV2oeEjeItV8Vlk+dmGmSpAoT2Sw8Uiy3mcgcMHskFVoXacQQxYcSa+KMQUKuM0G4W1G+o2iQUqpxyRwwuYjFKONDLE4LFxwRGMDebbNx20VmYRCYXCZjUcmIiMajvACMQ1TSoCwAIRbnhwPMuC0xELyITP/zgsTDIdIGnB7DzpokGU1zEiqBQTNzGECcofg1kIDA1xWI4hAPMSJjiiiK4VJGXSyRnz2u0AjDGmvrHHSyglGGJF8ICqdDvI4foJ9rlVjCzJUvqKqytdmrjp0FjO69VB+eCjTTao6gjpVmAUqVlqIizulldXUktPPmbGZ4Bnu9J0cpM9UfY8JJqjWTr07GMAzZl973MXaKRz3VyiVH7zqLkUwApbbHQIJjGJkMUHc2AdTUgoMZB8zwnTA4CBzmMVDQtsZgC5lODgaMHlPo/Ehw//OCxP8z+gZcBuaa9NxAWqYkgFCBmRLroMGdYGGCGkOgQQLIljBQgrcyRy2Oi2bF41JMzMuKceGoETLYgzChcVgSAZsSercXhqqqSSUxjJ78mxP7KqayvEDZ2Q2VbKiR3qCfFv4Pc/XmCs23kl+74yLx/7oZ0zVLJPdlT1lSQ0Ci9+Tc9bKy/awrisZi3pu7rl6KvZSqC427ZhkuGi24YsSZieKD88MqI41NFzoCYNHlYSGhhk0AAgnAnebFIJkpFAosGAwea2M4oBzE43GEUAj/84LE8i2KDmgW5pacOCRLLARMKsExYCznyjKpmYDp8QGDXk1EFJhY4QAXIUtbRTQJqOqiG3quTQBXblhdURiwYGWKRNmbAwBJG3hyPOhML9htOx/30dttYwv6dkKkJbTWI++8Iu0239q465++3ef3n1mPZRMYetGk+GR4yPZFr2Go4mkxyGxinAooLNGmWHwwg45gFao5FKkbh250P4ByD1sZQyrZsd21AKW6xAwAHDI66MKnE3UMTNQAEA8NPl46sciYCpnmbxYZBAhgyJAUDv/zgsT/NZoOWA7mkPhUI4gAhg4TmjQeiMZMDRIKDgVHqguAdlou8dXZhwkQCh6XQZ+5jbkhgccQrC1MwQgA1mkhilIAkZFkyqLo7pCqwl2JaqeQJiw7bga7A1p6Ffww4dK/j94VHhmssoRK5+xjq4Bi+dVtjQM0zIEpiTtCw1C5ZGWcyIGAGqk/eKEBgooaBjCEvfZXay9NZocWOGICFaXEzhl4QiNB7EZyqXDzFppVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVQblt2k7gSCQWMNI//OCxOwykgZkFuZK2AAJRPHEh0iqoASALxsyKzp/Exo86CclCLHg9Qh85wgRaTCenjwTbt3+TDQMiI9vbBrdTWUdxzkNyN4UtfWptS7UFwdYkLXBlxpnvRpcXq99R2bE1QxRC8XI3X5VjkN+nlJ61oqNrz7M3r9vrrez3eXRk+z6Mhye77dGdCVcw4mdjzkECSrlFwniAJ3S4jACM7moyaKjDSVOwoAx2QTR1KM2q00MCzLykBwLAzRMUPMygPwnSaw6XLOYtZYV7AT7etWIvkb/84LEzyTsBpAW1gp/nFGUQCX0CHF+CiguaWSgNKCgL0kgkwiJEp/Azo5r0NosIj07jCksC8yp3PGiUvVjsOJGqF1fcq3WSvZVE59sAOIWBwi+CSOqL5WQhmw5zfW9hbzfFQ6ats5ndTtmu27tRbw0zBE0bUOaExxA0VQf1jQAPBEWQ08tobiVPsrQMItoyOgfIlxbWioAnbbDoBCRlUsGYSMbEMhlQnmLxcY7Oh5MmhgsFTUZEGxjoLmTjMZJHR4QIXHF9RNmwI+IwyUEyIhCwP/zgsT/MNIGZBbmlpwg0E+REXTGApYeAhcIZYOuirSrxHnKMhyBKQBYABUjWTnYoMgCIm+EqDiadQ8NWHS8WK1CiZd2WXqR+aSA1Y2mz0WlYQnBQVmCkCKolhpMTwfV3v5AvZdeU01r5An57hannWBlb/zPHfvrfHzHEP/NHxFTEcw/ExyMpnpAA84B2mRq0jxUxJi39qmqF0cVlUxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqAKktt92QcKMiAMuX//OCxP8ygtJkFuaQnAjun2ZUWEtiYcAiyIhMXApIgAlpGXwA2SqHAXIQOaA4zUHOaW8e3TbV+dag1/4aL92GQFXKdzu72pF6A0Ppm9rL1iUaPM8TIcoNxhy+M6DK82DMYVPE3DqIJtCgZR1AKbwyU0n5QsFXKCd91xecgs4wAmOdS69hJ50kQM4DncuouPUWqb8CiwiqTEFNRTMuMTAwqgAZv96iaQk7G1nBoiCdUfGGBYheTFzo2UDMRADKBM244y80yjgRszFCGvAZCzgz5Yr/84LE0CUR1owe0wsmtIkGCxVPkdfLwAwpOUaBkhdvBIrTYsbVuQ6mBKOPGBpbIHRbOtFS6PyxK1ma6oeXHALi5QIrB1cElYVsGBUeFGX5Z+o/28TuiH8/c6brQORBpenbeED3Xxtf80u4ztaYFUi0o1JwPETRNuQlonHMtEIVU1Txajue8/sUgiMCpyoZJEyZBKwEWNUMrliJYFZoUJmwyIcLMhlRpmShAaUcp3QyGKQUaAGJlgWmahUY+PZh81mWTUYaBZaEadsTMgdArgeWFf/zgsT1LmoScB7elnyWQ5GpHg5QRrCqgFhQWVmHBEwQmDtSYyaEGigeYK/RfYtm6xcxg7pKKsbc4iFQsCgGurSRtBACdZVDE+6mS7p5nriPq7VZR9qctpo/N45wRY7+XNtOyAI66ZwRRh83pjH9SCnR2j48cuVcfa42ISqAandjkdFbZb5qMe5D+zu3KQPAr1VEi4CC6wuxxxRGEzOpZNogQwyvTXjGMtEoxyBj4hYM7FwxcrTGA2NXAkwssACQDVARASvbODBAjGGYCGljgNCH//OCxP8xAg5gDuaKvBEUKgTyF1ZmSIYeSsTwMqOJAyhc8qQIDEhY3a9mDjkA68OkIcFRJhAVRYcuQSgFbFqEx1K8AA7bP+1I1BqttM3FSEakV+Ir2xn3mnO4xyMY58/TqjEA9XvUSAolH42MSMsFOrJkXccx7sn7el0ORer3MdWmlyDUY+o+8XaLppSnGdFFr6qIsHNbo7FcYhUJjcogSYzMJnNHgs2PIjJTFMzJo01mjZi3ExIaHZo6bDLIhMRjoOJZpcjg0MJyFoRIAGOQcYf/84LE/zISplwO5oq8kqZNevRVYzTIxZgaxEq0vwVDhhxhpzEhIABhiAgFAJKcVUmavAemtogmWqiKoCggpY2SmBoggMW/KyARaliY7L130yj0vkqnDgy6o1gT0bhAgqUPD4x5yXrTLNU6+PdKhDqtP3MW6ZfGoJ6yFr/6SInGmixWqTYgZ13WvPHRR+gj7OLL26WMdtrMC4aoTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVQA7//7RIJNqbN+VNWXOy6Ea4xiw8aEIoglWEHwGGP/zgsT6MMHGXA7mltQuPMWxNkSM4BgVX0+J1WOXBa/JwvZphfxYQamsFTlC4rGHeCAyMbRLX2j9Mz1vWFL0mtSqPAosOu1KWc6lQZD8TDwzBAVd8DhHSBV6xq/Oo+V8Puf0YcJ0nVLKOTG+Mkvn4p8bFLrjw+XmJF7MWWZmrBPGRhoYwOL7Lyoetf2yXVZTkVIQAnjlJQCcjrpA1CmbVGZtOIIUxhEpmXzqerDx8cimORiIRyaHLJj4xGBhIbOJxhrp5wapgEsix71QYZMiJKIx//OCxOIpsg54HtYQtH9NK/Inp1iYjZBKooBihEzIeBnaUsMW6C5Yw60u818uE4jVXURnb5PeEUqmZuya/hoqj0XEh+Hk9IXDFtYKkZ45M3nSpOB5KBEL+E4c2ocUIE6SKAis/8CpFjjMYJalIG3lI+lbK10936jm4hiNbx69tKwAd1UbMQnlk1u0xEy4W3PO3rMiFgeNMipYqSTSTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkXJft/eFhbkoCwdYVStki2nG3JhxMz/84LE/zJ6DlwW5pCckiUZezHfObIP07llaThMVWMdD2nttJ6XLbOY1niazLemcq9yM0WJac1Yd9lgSCiQTMOf4wIYGihzuSLh/Z8npjbIAOOGAKDrMs8TTBuox5X4pqm/coUnhv3Pv//76loxHHdS+fPDtFrcTdFocCDrkJkB0ytpBuPrYmjuCgosOLYgXSOOCE+OFI5/1YTB8pTL0rTBIvDZMnxK0DE0Pjs5czgQmDJkLjIg7DCM/DmwBDAcTzRYGjJAgzTATBYHVVxYGTNkDP/zgsTaJ8KmnB7D0Jot6YFBEYNg0YlBaYRCsNAcYcgAY4IGFAAV4WXMMBIYIsKHBTntTOkTnJgg6QtDFj2bEQCkMyALlMAXWZQoW4OwETRMKKjBigSxgCOBQNdMGAkABjDrqdJho5Ut5nSuK0YkDt93XkcBdgWbh18fIDxjwJz9Q8E6jNRbntvwfqNFKozBWty3W5Y9OKPRwbAAQYZHF0EUzQhm0rW1D940ux5MmKC4himEbIiUhdFBE8EmytUBnJJYFAkCkIEBThQAhCzDyoz8//OCxP86ygpUBO6XEKzpBwgBjDh4GnRjJSooAjo6gOTWYIQPWEsVvLqOwLKEIGADSBAYmQo1EFPPZF46AgsuU160ZuFW1Gn/l9BQPy0Z9a8ciU3qC4JypIMh38pfJuY7FMxe4LNTq5agI+pnsfY9/RlFWoMDYBOw9ydeIEkLXhiI5YfNMpbk2a0IGNWZlZKUEAqMS1xpi9+o5EVCAKXWugAS6YBM5kRZm1RGbICRjUYnE34bEHZkgWGIRsHEUHtoxOBDNxLMTC41eC0OYWConEL/84LE1yhp5oAW3gqe5DBpgyAkYAXEEn0rS4JmQROFFQxggQUIqe0jqaEgLCh6WoyQDg5LCFoNIFgjSn6lhQOZeGPo2Xhijm35Q+kWuqOL0t5ttBN74DfnmdJhfyrU2PaXdOzGGuLWCdtjEUWoZ+yUFU7oPPGjp7N4/m8iKejNSuqElpTRysLiULoPH3VB0Ph0ikxUuZYKLA1i03Ek1nAEnt6KAK2y1goOTAxVMkO0xiqDDp7MQFk3VRDfZnM1Bcz6GjKyfMNoIwOMTLpiMBmULv/zgsT5MqK2aBbmirxUWiLFYYBZk8bA0HAwoiVBfwAdMEUJXJnAMakWCgASe6+c8YxS+xwJ5CE4eHkb7QlWi89MZR4HCwQBApe5xkurCMyyKfNaTW8IDaE2032PjScK0qOQ2ePIWLNViB54oTQ0yOvj/18vyiJVbsYXWOGi97YoKkRChB1L1p0oEbQs7UKsUunFXW+rqF1LxRBIyLmKagAJdtqcAkkgEplhbiRYMLgYxwNjXBJOjjcxkQwcLzLwzOMBIw8HQoTzCYaNRA0u4YOB//OCxPIv0gpoFuZO1E3hnIAlsFLkIQGiMQIIAIMDWgdWMosEDDla4gzw4RFNAdi5iSxayzSuSrO02CZUzlfoQ68qFL+LNjah8NvzcWAjFl45O3k7clIG53LgmFIHKGfOILUH0O2IoAEBNcFVFezABWsGHUADu3aZ6BVAAOzYWQ0HzMoCqib47yAdaeF502t4Mw0s+abGD9oxy9CaAJySPsYQLpjQgmvI6dOJBrdKmHiocpmJ7EOGUxqZ4W5kJIG1kOYILhiA9GThYajM5a8xwIT/84LE9jAh+mwe5kTUDAY1qHTC4HM4few3o4zJBAQagWWEY+fLCMuGaUZPQwSijaCC0ARXXGQFgMtlpCDYSjkwp0HuJhQoEMiHVkTAlKA7iCVCfSyZBhCuiY2+0O2K035ahjXOIBJToh/9m3NVymfKNXtOu0o+FJ37yOf6k/QeRH4xfDqyfYJS1NF9S0sVo0pd4BbYSTWmzWyBq++iAOfayoAp5mQ2dFDnpDptLwYIynkv4FOjaw4yqdMpVD7TMISjC2EzctN9RkE5poClaacXGP/zgsT5MTHqYBbmktQAmAXWbgsUhrEBpEUFIAi5lJgiphvLADjA48uyYIELIRlR0cAv0jkymCsURKQWSdYt+7TYbgiCl9HXZk6118ZI+esrwpoHdlECSi0I+7Cag2vFPtKFdSqVoNddBb0967ezYciKy0Q52YrJmUod2NNidaweQkULmWCrpFaxpVZY0mg9qKjO0wbtdl0VTEFNRTMuMTAwVVVVVVVVVVVVVVUACa26mAAxMcAQ0QBTlxdMMAsxAQTXg7OID4xWHgKLTJY7NejY//OCxPgvmpJoFt5E1BIvGCEChwaYBAAARhOL4MWOfCzpMGNjBwqRQ8uZ7pfgsAIJzABZvOXCbhOEoxeRJ5gGVtnTuwxTR5kbSRJCnWRJmHTimS8NS58E47c3FZdhra5MCmSj64K/kDLBf+ez5gEWLG6++T8KkpLsFYimQPNOt1NRRST6k97O5ZTVcuytr9abVWw7R2ElvqsYTkmZiEQajIEciDYYZmwIS0NiB3OqhiMgBAMHgmMtzzNfCuMXA4MeyPMXGgpwqXndG4QPmeqRhgn/84LE6StiDmwe5ka4GKmotBho4FG4hMDUCY0STCFwsEkKNqHhYmV8WBEyFlJQgx0nSwGSoFOMUBAonUBjgv+yNuYOJmsGUBrhCMDgcqhcyCSds7kPkyAaFoffdUKeLPLOZvBMDUf3NMQ+h6cO41TMDi3Y8VIhx7Gw1x6Yv/lHTZRYFw+cPRdC3l3JyBKPOq6wsRShbnJpJLMCtdUjHd92bpn5NfS5AOSyukYQGJkIUGYmIcKTptYEmdxWdLHBiYRmTBGYfDBjErHFiWJI8w4CAP/zgsT/NPHGUATu1pxAo3GDjBIPMxhcsBgzAHBYAGQOPZj8zElckiY78TIv+IBDGWjgAIJnDOEfcBTM3JFneaYos2N4G0p4yNGKWET0GLQZuubJYVHuMRGTjybyVXkn8KSMi51C76KKCZ1YwRKatQVgAwtFPdmWW5FCtkQ8pjdKhfEbkRJBA40gFL9sNdCnRUopPWDX0SLbHW5TjHgEODxzujSqLbkLMIis3cSjaGoOENYDDYyn5T4dqOcukyYHzE6oHWIZlVJxRKA8bGpFCcKS//OCxO8wScpkFuZQ1EYQBRiEyDgGN6sEyICwaOhIRBjtEBJGgCCBwYlAACCIoExQJEwCBAhA1eEQZMThUu0EEhrTqHWqWdQ8ioCLDBgSYai6VZfUGjKYgJJyDGPi5CVBEKdaBAzFdrtPqnVKYccuJUVNqklqjbTYxvKphAUqu7qQLKpEyiR/9DEmJZxRlHRSSYLjuq5vb9qsKjvoUpRGqJKrZKiQeqFVsoehRAnfqGqckLpzYxljl3s1tSwUGjXHHjFQ9QXctuLwmIEGIhBwsWD/84LE8TjqblgG5k8wJEJRIAYd6ywWVtDvwhhBygHDjJC4gPJYLDljlsAlyLbuMOZW0x+5S/y75SEOJxhWnh1QNDyxLZwJZaoajpUxx/bjQL/jGx/NnMp7IWOYQzn6m3x1CSe55ZTXIF5V9kU44h//KfyjaeMNZHVyPR4NFizWMHLFyIvjAo4WKpHtNTBEVZtAQCUWEyDqj5AHYopv2SgUBzKg3DGhpjOklDSsSzITwDJpYzNELiZkzJwWjK4yTAodDPtHTQYWjDIRDa0AzCcUTv/zgsTRJtpuiBbTzyql/EIgGwZlwQZCiBgSbYHA1OBgWacOAouEmsqiyA4BLY6SHPzJKEGSi5ZozcET5HBQRGMQXitRFJQBh5oAcRIiCAVA4SoExEiYWapKvE6jNW5mDEbBajH27wTi9a48qaLwbshAYHjtvP+0gUjKcaI40AREkmVjy4kgJkTIIJnGBU2dZCZef7PqLkn+jVuyHDlT+h1JzUe/MZDJxnQ8wu0PnQfUxD2gmK3k2xVxucqAZ5Qze6dTZOqqAOW204UBJkIcBc7G//OAxPk7EtpUBO7UvPsNGEiYYtoBhERmBAsZFExEByJGGtAMZoc5iUmkrk3VifMC6TBMwdJhzJB4IaEaBhbNQKHQZLvEoRGcwIBN0QRFoIyLFQ0f2DEHpFQ0zkxWmL3szpWTSKnjAKDy+Wv/jNysCgrWLzvnT2o4LXJQ1wNCJx1nyDf6bIoW/41OaoHpnEXrx0PebhEr5RMY3H8zP7z5rp6m0cSNDkJtaRQ2TNJQulZxzqlik0xp4PHjErbUx0VQmojPVQH139p2jQCgxsCO3P/zgsTPMIpubBbmkJzMxErMzLQW4g7oAQKYaImKEhlwGZBDGOjAMAjbC1SgyBWsCDJDRPNkprDM9ZUWuGGEgY5BrqNYMS2sw12orWjxdB7b027ktiKJyr4i1allsNl7NyvKjwg1I2vKbsI5qOE8qYhIWv4yYrQbGq//A/+TYmI49lHX8GzbNVVAhDrNv4LfiOpx0AWxKLX4lcmxA0n12qEozebPuiinzAWPw65Jg0yQMjiblgCbdsfDgAaGEhlcXnGxMIS4ZB35z4JnGA+zUhNJ//OCxNAsulJ0Ft5QuIPIwZ8zRq6MhA4mA5ukSgIHkwfY+ZvT5gEGqMNucduXzTPMgRMuNQhgtKsLBWwnltLXR9HgBftm6HYwQe9A8Ps6d6VAZKJDIBUtnrDcBETsLzeStbUdBpDc3qBcso2knnlcgAlBuy7Ye9R6sH7v4owQs9BJ6p0tvmzOY+7d9tjual1fohZj7poK8sMTSdAVsg93ZcCpILExSaPGDCF52oPnGkkMBU7yW6oA7bc8IVBhkodDp/NYkAxQPTBUjM+kIwgBUzT/84LE4TFSKmAW5pbUwcKTBZLNOjQxe2TEATMOVBE6EhhpLE+UJXwVDQo1yyBHTAAoiMtfZmme7dMdY7CIBU3XxSMKUytx2Zkd+Ckk0e5TG4cx2BhVPAMTpJ5n5KB5VrZ8+6bHzAHCNVz1IV/HrVf8ZVfVHQ9+vukz6n7tLV8m3Ncan2MMKrK4gJuf7FEBX0Sax71Bmw0xtSzFxgDB3AxBRhYus0lLagpxyEBQHGbA4CJCHIoxWAjRAhORrg2iJwEWBgTmAUOcsORsY2mrQ4YsB//zgsTfLRIuaBbmkJwcOJZgoEAZsRuBcEYsQKyNsa2thYULzmWmpkYExKcKAYaJUuwlzL5oSkegIAvKsoaPHVbvcnK7wlnFDnDpnplDwgo9hwvJA1qGlZxEHV6Wlh79Ry937OOSjVjdjeXxwHpk4ucaJSvmKUDlxwvLPlKWbq6Nb1LdOX0tXM1Iy9YxxnZtUQOdBn/P/7u46E7n3/9yLO/6tatNXRpnwg6+RntW7QySSqMhgwoJjA7jMaDgSUBkKyGZwyc3JJkYHAkJGAC0cUG5//OCxO4yqmZYDubOvYmqxbELh41aQSgFgYeDg5yq4VBJlOGbqILB0AAiaGGfxhCYicW4JAp9nzYgcTZ6hdAxKAL2w9HJp9n1xRtTVZw+V+fdoSTu0l9DnJQwkgAxqM7qZcb/H/3rBqkU7vv/KgneaTOiK3nSHKNHEz+793vc5Gj8xrTUL0Rpq2mOz2NTSo9PSmeW0rBpOhklUZiUJj71LNgfbY41inyCi6oA5ZLNNIHQaYsWoOiJiUGGNaQckNpnUbGHBaYcEhh0zGkSmaLEBqD/84LE5y/KtlwO5o68LxilJ0aw8GU5LqGUpGOFDYFhRq3Lwp5mQPgRsPC2AKDIbI2GfilvjQHlAnYqozAwBGm5NAo36bCmMvcRggcFcZ+64GCSlYNlH2HxTAzvVJ3ViKvjpKw/BBi+yZLplrWaV/xvqKOzD3sbt5911HbGw7huncxHzF9X03Y1lSyYTYx/1SKRfcSkjxNJZho0trteWtVFnJZhYSgqrDjyghfEUdVMQU1FMy4xMDBVVVVVVVUJ5JJlDCph1GcAEXRAJ4z00yACfP/zgsTrMdqOYBbmlpwoIWHH3QVtmhAwORZXcbyGTGm2BqRpyzkQ26Sg6teGTzykdHUwhAvJLewQ/uMpwln6g61WSbo7dxud+lJzNU3j79Q2qacw8Fr7TmhTWWIt/rGuzI5hKzHqnS6u9xNO9kYrb5znyFMGsHDVNKtYXMiRT3GVJJVA1C7KEMNvW4WaDUgkRYgDdtB/NA1M/5VBxhkQGDx2D2wYjDplv2noSqRjxU5ihQaRemjXh3zAbcHDBsaK9sHLumJgB32UQSpigun0Zqqk//OCxNgnOm58FtLLZqJK6EYiZILiU+1pCWYCEigMcc+lzDRjhEsiE1zEij9SIqb1Gu1HABV4cJbiGDcXYbiFeSwcMsPAlO0UMp9FZqbsQ3jv/puM/Vp7Yzln5RXX58kWEFUeuf/LeGtfzvMtc+7gOTrekkSIvkRaDxV0CKfDL1pNGy77RxccqWY6lr+5CdT9pVFKa+QFLDMAmqioECQwXD0waGA3uBUIQgx8ukz6aw1aFsgA4AgmZFA+cKBgYgvcZwj8YEg+aGiwCgPCB8wgCO7/84LE/zF5vlAM5vBY2c1xJCLtrxnjVTEw6YWXGYgpgYUIAhKcWDQcRnznACFzK1tniASHSUcDIViDNGYtxtNHQCJ7sNFqlnLryoxoXa4mksC/dJGAUA029y3V1gOH/UpqVF9oOuY02eid5UhHjBmSmea8mZEZKSR8srzl5/xn76nau7ml7RchNhNO4mmkUDj3UmA44PPeKy+NhlyFrMxjyltRNex1qExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zgsT9NMJOTBTu1LzAAyrd///rR5VAmJD7ukxKuENvQ4Kt6atd5OY5So/JM6ouk0oKoLE4YmWiGEbNi8alKgtzhftKVaD1FztqS1OeDSem9F3MsrDUCAvnc52iBLvuhirF31Q7PIzYRF+1VH6pjQ9kyLiAYExmOnWTJ84+LLJJgVqkLQbxgXikRA7cIhQ9FTCnwO10+g1U4BegRBSYGrAZyCyYWCsYQNQdDmmAqXBILmFo0mF4wG74nmUzVmmZLGBQkGOA5loC/JgYAYTnGJXh//OCxMQiKk6o/sNKvoaNIPmRMQYCg4DAT8YMlB3gjwhYnwQghy76hGAU0u8RBzzDgMY8OOTMJcDwczSVoLBwo0sBTTO26SoeSXlUpLzQjGAEP30qao8b1a9vKJWdpKyPHVWVYbE0aqEUALhTuiROW6/r5DWT71/w9/1XAhj8kIqwyTG5Rg069/cipDij7mGCxMJ1FzGYctLHGmVn2ukDDVoPLHrTTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/84LE/zS6DkwM7tC8VVUIMl22300NCM0tzZEC7EwqGHVtoLCIiwOajN/9qVvENGH8qYWl4+9NRApiFUZAAZqWf09Umbcv9OuCZ/fzFdtoRQ7ttO6E+UUggvqIupm+JvkzCpXyOz50K4qG6kxgHvjmNmTANWhB/NFo5Q1yWva1Bo+EyFoTRM3rUREiCUMmI069JR4dYxUA24nArgCAPTB1UhZuwuHAjB85KAIwhBgoAgHDgIB/NRhwMZ0GMDDsC4ZmDAoKKlvUqDJQijCEJSbiwf/zgsTCIZIqmD7CytqMQ4AoV1CZ8aJsYsCtlXjI0MDfbWVAh2UAmSt4OiBaG8zk0SgD+u4tdnSZBsBLuKKQGYwFJ6FMmBrC+EO9aa23nM4Yrb/HH7rH9U/KTVYL3ygvIjiJ6k3i4//Zq6fRAu+N+JueOoEMTrczWM3jlbe7i1fhvi79YqPPZgTwQY9Th2PW1c9/97T/urvTv87l//gvllzNYeWRRakAnI3MOMYvBhiVmD5eKgtMVhA8NETVQqAgEMIgAweXDhhjMby8xUzzAwKN//OCxP808qZQFu6Q2SAbVhlbzmhQ+YCPYGSrQArURA1BxqSZs0Hd2NwwxNHM97C0Y9YxBw+xg2BKMy/qXE5HXUGgKZQKfv0nbSBULLKRwIt62lqY00Sief01n/zx7ADn67q3ndMuUWgoP1UgsxKUMrELqJZDl7Il2QHOauYcZZSINTT5kZM7HhfjSa5ET17R60/6atM3mpshd5HuX+63+93Pl7biL219/WpMQU1FqqqqCfbXZLbFQYAjR3YONBRiaqfKsgAVMFAUhgKaGplJnAn/84LE7zHaSlQW5orZglQL6HyymfEoWcy4gNKxXVFQolGw5cRDj02EMNyfgr0dgxDaGJWWFAZWKUtDO6llieglK644FdeV2Xw1Uxmnvy7nB+e80WqnA4KdiV1LeWUmJOro9eqtpyzeiHPfOQmBoOkg8bAiRYOaGhKKky4gYprJLuY4Yh7PauvciOaug6ABDLkhwGgsonVMQU1FMy4xMACsjcUVTUPMWm86OHxCATC0fOCnk3bDjIAtHi6DCSbpGBgl8GM0aaRqCJDfqGrUMf2Akf/zgsTkKhoOaBbeVJwM2HBQUGKwaGRuM8ITeBwaAoWhe4R1TrdjIolYociyE4ulD9hy2+xlbEn7loOWYIpwAWtlpEASah2daMxSbzelxLPaJakuDxzEsmQo3Mdh6X5UnMajHvU9q5gt0s+ivY40gG8Sg8SAps4okylBGi43YSLGh7y9XHzcg0Pi8wXTyTIvUzhdK3zVKgCkjnCqGwURjN7JOviwDJIHFk5gzznx+MUgwwwCDCiFMvEozuLzYCEGEIHkpqrWWHM39CnQvw8gXiKp//OCxPcu2g5YFuaUnMBmTIg2CJNJbQlzSEGbqQp2a4O1DT/OQDsEugqfQJy+5Bz2pOFuX0WhGiItFguGemnwX0VhbVe60HeVMx87zwVEJv1ak//UWVFv6q6h2a/somvvlKqmL9077uUC9+rSWmvbIr6D6lui38vtAKAffrS9CP+npv7/UP77T7d0uL0//PZb6tSo9wtaV1UN1teBglMEFEyHjzh4+ByJMXZI0lAT+ALMKiAvWYsEx2oYmRJaaNWJslANdqLMALRH88G9LHcDoSz/84LE/zFaKlQW5padwWkQA0wjLIjSGCjS7NowAAqCDBd0xTktHmL5UoiDGmEurDbCmh138V00BnRWxctAfkHLMxGRfyV8jSdcM9mZ7vKFzbFC4UQQbEBpIN3VlU8SRSfkbuNG9Cbq1hw3RzXz9JE6UYxL2tdzHN0NqaiqyuR9hlShRrKzxFC1qBRJcg9rRA/bbwbSsesmFSwxIJqkVQC6qZGQmY5GArpxgsA41GY6cfJXR15QgEKGMQaYUTBhA7mal4ZaKiG5ocTMvSNTUDIeIv/zgsT9MlKSTAzmlJxKgJiuIx+YdIMfNOhNGMB2WAYug8n6d/ApubwqTHYxEGjFpMqjSkBkYqOQwdHUKBnbSwiABCywFAEMohLoNCEVqdmFNMsqibuCpxSMb3Tn3f76MC2PRuVv/yWv7fkd9zHVum5b3oTNnjYMBRwENqKtI47ArpIAjmRi98ct8yswj2t9r7HlHNydazZMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqgCbddqZPUrCABRhG4EEhg6CDLoz8hDgVzkAguPmRqQs//OCxPcvOg5MFOaW1IwgDNgKDYPqnBOVcRYdWIKJv8/BgBIkP/uVLblB1AwcNPxWdrTRQzRymq+W9ymPTA8DdfrFjHGlDqwlA2ZEACJlMRXsoZE39a18MljW/m5r9Kc1/SuQ+g34sRX43/t6/W1nVCuu5/B+L8pipthN9dP1ztErRHSvaZ7tc0p3kf+9+BxTnvnpFPxYqWyMgWJA2YYqecQAUYKhqKIec4E8bthsYgAeNA2ICpMfRmMYUdM4hNFRI2ovYQhklsaHlGXDQC0goAn/84LE5CpB0mQe3lCZkqESha9zI0Ex1aGl+s4wUCkIjmwVoZnw67Upg9Q4wYHh5+Eq24vBK2LKtHQIwMDfswgDdgAAc2Mjqf8dpFplmqXjYB4Hl1WbM0pgzBjLr+VIqqPmzkoSrvMTcrL79Ch18swuImmGBgHwuLB0sOWG2MD7xZ70C6Fh4UzDaRz3y5M0Ka23R2Ax7l16LTt5LTUNLIZAQHTBEYzGsbwOcoIAAxABswTVk2HDgSEkwpCkCC6alA4ZLEmZzj8YWQHNkqvhYBHQE//zgsT/MlnOSATu2pwVuzBqIykOiZlBKYIAxMAIhYVyZrbbFPp4TfD5A00cLQ3h7T7mNAUNMocNSd9lLEH9ZWBkKbTKiwOGnzIghUdNWQIoT+yCSrqy3icayCxVN1dRJEN9S5fJbrLTpTfM01rf3SL+tE1bSQ1HlBppYUYD0g9EVjjhRShY9aKLzioDHT4+8wxrkSuT0uw6AVCyibNiVamZyOgCYbEGYDFIctA6EA6Yii6c+o6Ybi4geBAZMAxqM6g/BCYGLxMmCZmPpLRRLT4P//OCxPkxkgpIDO7anFeDc+gi4nmbUorIs8wskyiQHNoOyEQMKCjZ719G+OExeURSCAzLACNy8EKpuionnQxMwAd0CB4cHlEUGTheyelaE0YAbnKFPCx8wTm8EtgtI/f6ZdPDjGThq12qvmf6tyjf/yexbLLFSQKuFnB841r0AMYGgZafwhMyqBg3FBboeLIfFHm3iz9rH1P1h20AKmwsNS33EWOEAvMwSA8sRTCoYJQCOk47EOCQuGmiUYoORrcFmVQsBGIYIDQZSQUFFTmCQuD/84LE9jEx0kgE7pacqHmCRCDvMTNQHUZUiYpwateJDIisO4SIZp6Spya0wR+XTWOrer+XJyQZnQZ0jlAILASHz7BhObCoeK86vlIWUWZqA/5s1vg1a0Tnf7OHP4P0eSj0bh1ew/Tv6+TLdn2Z61Aq21ReTCGnhs9/6KiHRaa3bdvxy2M1Fvt+/t+vlfe0n/j/qSc/5RxQUbdiCupMQU1FqqqqAK5ogo0YKE4EtxtYbjIDAC+PgEo8AoTS9IMNp0wiPwVYjDDFMXK0Aiox6OUI0//zgsT1L9nSTAzmltUQqhcyoOgoi22fgIZBQepeY+OawqLLAqnZiwaHDuN2IGsWK9kb+pwnMLNnf9uCZlmnjCfLwGZCSBD+iLYUZdVPeczeESAb7Xba/y6IU1JmEgXIr5MEX+yJUV35si2rGNJDe83BbSr9DD5yJUUQOw/B++sUMWvqS6MoRcl/q6/qoY4u9Q0s9ikFavzYjB8mPsy3nQy7D8DBUYnqsZYkUYRmGYQmsAuOERJmXAqGNw5GHqJGMGJvrEsGAgIgCBm/MWgTUw1F//OCxPItkc5MFOaQ1IM6B1eOKYY8GStA1SmAJoQXsVTDOvHhYXM1Mw4gd59xEMGLG8sLAC+6SMuwbshWQAY8RzhUCLxKGvASCFl17UdUdlVuGUaNZUhBnfWQCgj0vDdQd98sWcO4lM4UL0C35QbP1trydf7/qW3U1zG+eJYzna3v/j1nOYlKjdy012uem/LuZTQXSlcVpetyBVzkkOBSVdVlnhCoBMdGcwn0D0YrJiIZhep6OgHp0SAAObnZhkALHEACYfUxjFklkTxAxVQeAGn/84LE/zOKbkAC7tacRh2IZctCz+UAAQhA0AL9DjaCEsOEUcQ4zRALknEDjODJgoOCWWtYEYIYaKTy8VrwHbsUbhTxlQLTAkBrgUEoUf14T92SiQJ+EBLC61aQrk1gXby6eD5DT7C+GmNc0fSO3zLeW+zhpl11FV/Uy59/XXbb2bKh07J/4lIcLi4dNbFLShiVF9DBm4XqNx4MH52KvULiFygBpQhLQbVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAb3/3xhKaIgXBv/zgsT0MqJ6RATm1pzrWcDFoC0AtcFA5qgAMEF9wuE7WTcGS3J+Rg2JC7vGObnCEAWQ970PdKZgs3GxGOezwmE2LG69HrUYKIXERQcniKSIUI6DL6vmMJiEhyre1E2l1aYaOkzze+itZUu29XHSaFIjYaJMN0OMNrNJa5phZsVciyuSG24qYVKapu+ILUsDY172mwRStctiBIRGDAemBQBHX4EmAIamQAQGszdmXJiCESjSop34B0TmARmmY5fmCISmcIhFl2aooGRxoGEYfANw//OCxM4kohJwHtYOePmcM2sGtcCbTtlx6+VYhfoqDUbwtsaiYJIhW3aXlUsFC8ib6AEL90j7PS64RKipa+jEk0kJSjVZTVbAjjS3JesJjXjIcx51A8CBRMRcBRODqmS2nURhpszrcJXz9iNd9rGtcbTQ9hMiLA5c0HRGBFDWoeBC1LvSgwhCd3jEVM3yjAkBEk5kepgwUChGliqIsTHQlMPlZO8xwMNQHIUuOD2pNfgqMHxuNFR7MMxzMVxwMWCeMsiaMBAZM/hKHgJlK1DJU+T/84LE/zIKDkAC7pDUwTJMFmaY6jZLlbRlfh5IpxQBg3gQMBwAtkcrWj8BUJFDgWWCMQYYtF3gUWcKU0kYHhSiaTL6gYQ5IQcdUsmrC5eLPn6q25pS2Wd0QTZLDfKwiwz7eYH/3l1nkI9herbtxg/dPqW9pwBCwhQqkTpcyNMJLpKsUvQsVNseUj6LeRbzzL61jCQrwxemBiikMvGydUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUBvf/zgsT6MZnOPADultR+27DawYzdB7aCmnG1NE7xwyUUuUImA0sEL1gAQexSPOZnEj90aC8EU4wEt1QRp7GZYhiulQWt6ghXv91RY/n2o4tuR5Q/8AiyTD+G9athYrGSsNFvK8/ur1jCGGtLnBVQsnS0u+hLaUA800TIkhqbaZ8XiGGT29xiiPVjmCl3yliKkIQhgULXqg1VDiZZk4MmKeGatIhhEJjoiPUR43sSzCYWA6kMYEo0oYzC5zDNQGHo2mEECbW5GCm0YsD4cnmbGOhY//OCxMYiia5sHtYKmNLRpMOkAUSZQKGZjQNAQHKwARLyLF/UsbV4sAiHK8zDzJY5MU7EXQFglFh4EuCXsyGAUAUddBLLDQgQWZKZyis4zB81YRuGonO9ycwyfy/PbHRBUdzL8U+cRSXufqOxXKU/cG1Nj84WRezM90z22zznb1fM50jyrH/bIx5ZUq4ovBfI+/M4Rs9/xJOWBF6oZ+eohAJMAEnIajMGZYAIZDE8YuEwYAA+d5acZTtgZBiqZClWZshwZUBiZ5hWYqBkYtDAYvD/84LE/zL7XkQM4sdpsGPYnmEYKmKBYiorBnoDAjFcDvLzJijcQzhdAoVMq1NsCNSzBJ8848wRIycI0hYyQpRgsEh6yY0yEF0QGlLCK7BBEHH2XmBDRlOp6BgWyEDFhIq904kOrHjDyibE4zQSx3p8uOg6bsQuGbwgFBxLrFFCStrzyNp/Jlv5zdm0zznz3PBgIiEUJPCr0CwHE43q6VPUAR4mEoEQrqHvY9qNS8yGsiR2iViLXEip+sqAhyoAK622+0sqAQotgLQVjBToaKwHkP/zgsT3OIniQALumNQiRJxsYAYKgmtoSSGUeiKD3R2AQMRYydBRCBVhDJdjThiEAaLT5Agrtq9XGWwsEt69c+PFBb2O/Fe18qF1MYTUltdYKZHASSekpGb8pGrOx/vpt9uNok/WVmvSnzzf16tvPS5JWvRiXwfLgMopQfhAIPHCYRk1htS1PemixqARiTZZfHU7Y1fM5Pvrxc3rHGJMQU1FAK75KYCBgoEguhQONDHCuOEBEK0wyScTD4jMxGgeOBzAvGBSkYrKghCRocGhw3DN//OCxNgo8eJoHt5WfIwIYSS4VBglAMCDOTeWo+xhDYCkr2HCUqECJVALIVBBDBIm7sTKiRkAkACyuGJ7Ps4XhjzKaZY1YRAYaCgZ/q1NWi1PdZ7HO2v/NSE3g+TDgzpJfmh99zaxzD5Q4cA0ihYsgsHadBBDJxbCIWU5iKnDW/SxzEErBjlCinjUn1alsve0zaw0LJWmAJlpeDQEBxWmGAGG6QDmBTsGvxWmjRdHD5UmEwMAJeTC8yDOo5zAkkTIIrxCKYNFgEkCaImWBgmMCjT/84LE9C4xYlQU5ozUjBsPTCwA1GDJogS/MEmZWGj1K/NLJSTMWLFhJtyjGTlABrk1xX4UIALyzgIttcjURgJrYcirF2osXtiRdaJg4MwCLVVoNt3b0p4TtybNQkLCSCA3AiOFXzJtCdBAXO9+kPeK0O2b5q1t+5+/4jvj4/nQf3VXUTKTw48wg1iNYqqoVLhffTQ804rsTqtsuO2KDKndjEUNVOCQEJUhlJKHTA6YIvRrc0GV3Gf7URiISGswyY7IB40ciEhmSzsYYOHRDpmSMf/zgsT/M+p+SBTukPDV4iL5lMOYgz5lxjgSS1WMQIyqvjw2BlwWNzAEcWAwE2rBmDwAQDLxpiEGSTeYiWqR8oLvQGqxwVGnUS2rzdCMCr/4YqdQzeysLd+9UaZOOgMCNj5EfFRFnd+rH6zLzSU/4yJXio6DdhtoVcXcyzYuMtfFz9hZ5es6pzVrGUnqlkgIPP1vmUrrWpv0LYdGofr9GQcMcwfMJkaNNArMDWOK7ZM5VpMVz4MRhRMISKMQTnNnycMKTgCxehcBjFsPzCkLjf4F//OCxPMvca5MDObQnErB4xUEAkDcwtAERAWZZA6kIy806Y2mAMfGt5FrjRYCsqAw6V4ouA4Bw4qlsbgsjyRg3KYrQxOkZHLAIDujIOfQSv8YAkuunly2mjZaiTq3J+sa8GaLBc/I5oXNSP3ZIzloNiI1/dWqVAjDkGqjyqwopcu6h6xcJqi4aChs8kgZlUJcwgfE3La0vimxgqB66JUgHOQW/SoP4wQAkAALMH0WEIEGHIOHMYxmRhQmvgGAIKDOoCDBwuTTQiCggzEwjjGQ813/84LE+TLZokQC7pbwNgK6n53KIxo5cYoQDSMKghrYWXeb4xQNM9F1+FgtUIMZHEoTIhhzDIzUWVaSBEpAMyoESZGgWWyHB4UCcNNLe5PySorSAHATNJ6i9atTsxbq5UKYw5cJqURUESTx7wDw64Kbv77abnidN65Tqrj+9Imta4kfP3V56hjBGXNChmQVNqng+x7UkkkOkHZWQULW2ub8qv4oBClMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAV2/3vQE4Bi3xE3BL//zgsTxMTpCTAru0J5AesIsBPULigSJBAY8Q8gRmFMtNKBhZw2a56zDFx0FYuhAyU3mtFrb5cyyqm6GHAAPY+7rhGHeV9d5pDebU2VP1bkwUrAne16HVxBkLK5R0oWKuUdUkrXUXkX3I1mfKvXv9+qXzJZdyc1G6MudU42jBcCIDjzoSJJspQLsVXRJoHmRwmJVt1AmEUxBTUVVVQCpWfWeYlDBm9oE5vMG5My6TDQLiOEG0BIsM8QFbBr8ymMh0YqPAyEDBQjMIkYF6UOGJk9r//OCxNElgrpwHtPLCABHBNIj561rAGbAQKZe0DiBrxhWeMENSvMCebCEAyZk7sNEgIW4BYmPL5a80B2ZAjTH5Q3pdyZSqiQCALehOUfZTU3yf1XoBzCBASQUFShHcfobwTa2ITO31HZ1pfFLx+1fj7mpPhATODEDPFlT6icPJ03L6o5Llqo1FFWGk4WStTZUv7HybWPvDIsDiwpMXBgzWKDzZXMdWk6AGjmdqPdpUdO5l4tBUYnyxYZFghnUkl8wc4jDqbOWw0BAoyE9TCI7MXD/84LE+S+B4kgU5pDUBdw0MNEfW4mEwIYLQLOTBxpGgKIhYWWMXB1dJiQtEwbcWwlsDojLx9995qHB6w5/QoWlL5yh4YAMKoFmcWYoaWN52qOep0uooIjy4tMs0arr7iN8vavQ7WbigAJOYtRSo2CoHVDDxcUBZSgqwc5ZYolCnGW2sWq46LJR7rgGSPQBFDlyknLHVua4tmBgspRYSUBEYnB6YwjWTdGYImucYCsARrPKR+MNw/MQCFMBj5MVDSMhzRM9A2AAWmCgWGKgoGtadP/zgsT/MimWRAzmEygKBYEGISDmjCoAePSKh0+zGCzkaDNgDNVi0AoEUiEkkQjoti0jOG82agMFh5E+n4FfGXvShwQnolsnJiFFORslQrZc6leFntbt2WUsUlMN7rZr7nYnB3X0qTmNU7Gg1bDwHA+xb+RyGctzM3H/XwnqMmPU17lalxgXFmqHT09WlZoJMaLvEICbKmQZWl1nZe+veqOmZJTvIG0UVQC6p+QoJjGonMYHs3aGAckDrTFA5cPGvQBIEyaFzBAeJ0gZ4cZwk8hU//OCxPo0CipABO6Q2GhkwJgUUAt0GKgiGJ4wwaz/rwxSZBUnhJJIcVqAvZo16lqXqvTPDjHnDadAcgcaneYSeiMSY8Ok4xGBYhFiYqFlJoySPqYzmMSlqJD7q1UVO5mPNOH+damtQDbxliuwj70FSDyICV5xnn3/Miwk8RwtkepITOtHDnMipYGXkyK8mhCzR+WQ8PFkNgBtRgRiF6kk9eqwnK1rinUO1lEri0os+ZFgOYZq6ZUicYUFsa/Bsd/PqaxG4YEAeY7hsYansYQDyZL/84LE7THBtkwU5pLUygG1BojSFASXMTrE5nGTFoeNFDEyFIjboCZ2MlFXLDwsBzLivM7iwx8USIPkofXUYnCYQFjDcXDijNO3cSoHA6X0cd+lb37TyEgmKAkBVAmCokCcEJtYEg4GBJa2Wpq/rauqSB7celEQVE6JnutukRNEm+n1Rt6bLfFtTS0+MwvCcCw2iwXcGTgVEeo2w2Irk1MdxRxO4OX6/IsYkBklRr1Ybs1l0kQA1aBeffQeTEFNRTMuMTAwVVVVVVUEFOSSTtJBpP/zgsTqNQGqQALvHpylWrEAxDQ2qMjAVhY1axHGASjjUX6pcXANlCPgUQqxPpK2iXMppymWMKtf2IWFVJ/nZCBAkrZfJ4VAVYbWlZBkEzYW/mU8th48Hmo3V56qP8lGHh7p54qXVdax1wRY86kUBt8svmVpQoG2UUuS8XW2H7FmuxV6pQy4dNwAupWkPh4I2LFBpOcGKkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqoQhO7bXb2yt//OCxMwkCap8vtZWWtFQlJQuGcYQkDEoBaOpskuAAZesxuxQjeZC7wWgga5F4QIO2Qi8UT3ySTE8t8UtAStvPQ7/4/nrj0Cnm87aMwXPi6G17Xc6k55kcLDq7DRwgsmkVc1VD72qcshU1nDK356lwzLvM75Y3SRFNOnpSSGaJ3L///L5nn+X//Dkw865a4ZI269oxxmqDypABcZMPRNBg/m5APmIaFG2bXnYWMGBI5iQFmiIdGJxTm7w2GWQRm8sbGFgXGBYag0ozW9PTEkEDC3/84LEzCQjypTeysbfNIxBVsz8IRYLGEx4BQG27EjNCcNfA8ygTggfGARMkiYlESXpjGYRlobWEOIXAAiF4VDaML9VmgMWQliIUmFikuUKgatFIYEIeBgRRrlEEK9wq9hq1C4as9m3oajC7Lz00ZrvVjTyDPb011/VJrH+XsqP7epg6C1fiKJtOahY2KxgNobmmFZmXEggzbrUhR0iufJxsmh6S00JZ28wT9W5n2HJOkb2rwkM/KkxroVsecCcOtD8nM1gNzVd6UxBTUUAv/7bB//zgMT/PYPuPAzvBt3ZPSnHuoXGnRfH6Mk6JG1EIkBBFkqMjNU4LRKQwOWaZFRxzMWDiiwMqs04JAV6gKnGly1zYeCwbmc5QrgbDBfc9/UnpQNIyyb+m3EwWDNBztTrGm86fMbniyneBWAID7gmssCojifK0NLPGGaS4oB4jamxp0K97kV7anRqeriVNq2D0k6FOf6qADtttjj9mABwYeGBE8QajTVKgPKp84uBk+TIgBCpAMqiUyOGRE4kwzDQABoAA3JKwUNDkw8CRJLqWmD/84LEyCMhbnAe1k6YsJOe7rkhiADHECsZRlY8RDsMN1ZRCU131aai7FLX2bFDREoBomyN8M2Iz8CrBSDcFRHn9i+d7m8t8gxfKYAN0vgscBpnZ4z5WRsGalX8YxyRdHd2pBvD8uszupZr5smislabCFoxZShiyYZ+hQy6W4ux1LVKnBllbsOmGdzSSV99bDQ3HctJtQPfdQClFKoLAIYNFwY+IcAkZMFmHMrT3N4RuNGR4MAwYEIfiAOxr0zGRuzImWzCgJDEwRTAEnzYFETCUP/zgsT/MVoeWB7mTPEEyhGwwgXYPIhABmhJ7UI+YOCGO1x44UY49A4IMSNEKzHhAaBzkumWLlfuFmFBwXK1KmIOhOz6STlAUROBLlL0T5cYKAQwSBRatNjS+FsZZPG5USp5RjuVvi3XN6MspDRRO9G8t9sX3e1vvdfqzhYZg4YkwwminDjgeljTMrmVGVq6oZzGfbepEdFNtPzzfTMZqLVlglNm3v9nT6o6uiOts91YztHRKXBEWYU4CWpMQU1FMy4xMDCqqqqqqgE9/tsptrIw//OCxP05m7I8FO7E3DihY6TmaCp0QyGRErBwEQCZIGGCDBgSNCxosvocMkTASoVqWZTqDX8YyIzxoJS9zGlTjpzoGGbPhuZb18cfxy/GkiKOFLSblOMrAiTlB/teZlWdKHmm25RhbT+yHmFWKL4ZFtwQQ88ZDSG45qzyZA6hbR7idRpimU2z2xvju+bQ9jzBlmt6L601j9KYNh4YDJcaXgiYSHmcfJQamO2d3AeJBIZTBsYBBucdCgZJq8aku+SBiYGDsYgiYdbB+YkAkZcmYZD/84LEzCQZqnAe3k6YY8kcIHARwBeBgVoRhIgbQRmHjBojyquBV0tiBSAWBz4gEHDTxzo6DwWIjEiGYGdGpHIHAIOIiI2g9KABTeNCEQedH0vIjFtI6AN53Y1m2a7T1KWZWl8clmcP4suvSqPxsSA26RNsZJi67Ge1ZL3k/W1mv3dALFFwoc3a/yyWvyG+b8r88t/1/7zkFG88bSv/nCFv61Wb8jWKq3vIf7qXiOcmyrvkTEFNRaqqqgC7bXM0nZKFBIrVxEGD34f6aGsBpaowQf/zgsT/N/nWOADu0tlSQ0MmJTCWU3ZILvA6SOnTyv08zGKyxZcHpQbzr0oCJjSwhEWFhWpJqvyaMo0y/uOqWLZbzef/dcZrQcfk8hxie3wYVhuSSP+/OYY6/ccsaicT0/qTK79a5EyHAi7HY7HKvCanMuMoQzEMeBhKKX1UDDrDq0sMMnLCMskZ+ylu6plQj5pZNZV4TgwbmOhmTEYYYh+bWgWOr0arIiaD1IaNluYmgaaIhqYHj4cWj2ZjGacaoiYiB4ZYjaYpD4awrARAOFCI//OCxNwoMhZgHt6GnDFgzzyRlWA1QcLI+GCRsDWcUEmOw7IhE0BwUBkpL48ZjJmhh0FqrmMBJISkRjOQ/PSpFESWCQlMxPEA77QAPBjqo3oppQ2GEOfnfgiAZp5q3P1TvHep2zVpN8Yw1+NMB2GOw9gkKS5pFBMePU1C5e7ED9Kqaf9Jh+FX2qJVONvsiXoelKJoE30isODLmhFZJynEtokaBhpbKjSD3mLTRt0UDil1TEFNRTMuMTAwAU+1uqyUuQYeNiS8SnhjAsc4IE1Eg6L/84LE/zeaYjgK7tDYMKBJKZiOCBMNKAk5waAIrBHCmaECYEKCYehKRcqwfkdFlIpQvO4z2N4/piYDK8MZuKQW9nO93WgvZMESyzjCuykMXkQ7y7mXPM8OuKovP6DMUXc/GI7cMJOrGhr4k3TnEp5SG9yLT/wZoqPHGXnXlyTfixc7Qu8k9y6GOXsp1+bUBHtYp7nizCRMQU1FqgAY21H4AJaZWOGJMJmI8d7QnR2himefCFGZiRsUWBmI6wkEiM4ccl5nJoXBnvIm+PHEEGtqEv/zgsTbJ/pCaB7ah2AeAAUwZcSrGAAiIOY0mleCTSK5KbTiQnsYHwJCbOOtcpaYQBaWXISsfh9/eMoDpvFUHv4fJglWOYSp/IYkcssca3TWeEENMO4KOUVR2Pfkqlazee3+mtO+IfaP/wk4iIzKAy5JZzyhMA2NCGVkBXkmF9yFifZTrZVDazjNzXRcVEoWWsSlyHMKP0xBTQArJJHhd40tmDLRtMNIUyvejMpLNrm0gDw4BhGKzE4gNBAkQoUzURxGDRahuQZFMBNMBYjJfjQo//OCxPovuc5UHt6MnMhGtEkmpigeYRwcWFiaYzCku2YIPgrIZNNTDie7WH6T+YrDlzKJgYSjHop/Da363VhLMuuvdc3bgrV/uFbWHcM5rmGrHPb2gppbCjw8OQdUMTs20QvWduWIy+nDKxTq6d7M9W4fZe6R0Mv8stM+8/zPK2fcoXcFrfFvvu5fEa/vBm39vX21BD6lD8aAYw8B825DQ0MJUSVk7kkk0LOEy6EI18FwwfAIwPOkx1HYyJDsx6G4z3NIwiCE1gMowLCo1SGY08D/84LE/DAjQlwe5kbZDMagnMAQpKxBDEnOxYIEYAKkQk3GOhRmhggwYCuCQISApEEGkLRhxEdIomAABAJjTwWREAENFsCMMqs+EIuVAUwQSfJ71kq0Zuwg+6rYmTrfxeaaStna1mKkGCsBGFhYvHI1D9Idrwl/Wv/1LYP3Bz2j3bFE0TvPd+V/c94n26nfKrSw6s35w53/7lq3/X/63592N9t8fTvjzrr4tyC2ux/uGExBTUUzLjEwMKqqqqqqqqqqqgG5JJI0jOOdU3R4of8cDv/zgsT/N3mqSAru0tdeRZAzy04v4HIxdwFgZLp3BRbCwixNxYz66rBlZVfX6mi/0qkLW4OjUaVjhgW3PYr95LZDl36F+uvLj+7GsheY7q8WtWHAIKmEzAh48jE0FA7RdRpkZx5EOsa3z19HZlshhsvFxOodHCA/FXsCKZbdGtQkUQ1VpRgB2sXuvP2hY06mpGkiae0GqgqsCABMDQTNbjqCH2NDg5PIAbMaRKNYwMMdBhAQNmKiXGTIgmFQoGII9mDZuGJIemvoIGEIYGU68GYg//OCxNMl0g58HtYKfjZhQDYsEJMDSGZmOWA0MC+Q9GOuDSKjHH0EIMuhA8wwUvKDoIIXmBxKzp+EIt2gUJTzZc/0mSeG5KLxlRMc03WN5sIGhMLbGyle7wxqGUVJS/1LTy+WXt6p5XRWMJirNGYgfAQGIUx8aIMVS5FlHRdyPKriDX2R1Ql2RnlZ6ERN61blYqbJTR72Ql6KpzrItVrv5l6O/erOtNib6813MX3ZuhjlVtBqVUxBCtuOTJICGMyC5S5Jx6eVkRn5sNKznmDnilj/84LE/ziMDkgM7or02ZRsqDaGJkQokUZQUKWzDMX0rmLC+LoSNhcSb7NtGL0UaTLnQ4tnJXCpW/Mix3jJFJ13Gz3ZkPKYcuTc3GN79PmYecFCUGbc6PBjCUv0IjHIqhWoRyptSq2SXWzZakiNkfa1SXtdi2evQ2jnMHBHu7UAuO6gb1R/+7XaX//31/0zbGuFYLTinSpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqoBS22aBi7Bo8uGNAUCToq4oWAFoP/zgsTeKKrKdBbZhWcOv6EdXAhlAR62RCUCBjuxQfNXYM/aHBsdfQ49nMdoWgeBW5OOOECTEoHlbDEhgNXFmj1oJjjf18/2ziSsU5l2L2ZKDDwoTFUFIGfOWIIdAm2zn40EO+yZdVFVGQyUnQmMDiyhUallJ0i5jgKyuPRStsTMTc20q+7p2j2H/ZfW9aZEKkxa10WLVQCZVHQwZC4zcdUzzCowWGgytoczCBgAI2ZYjENCgYLDMaoB+Ybh0FQaMGwfEgZBXJmGoDGQahAqAxgG//OCxNgnCZ5oHt5KfJNUwxAIcAUxuOdfhgKDo7BMeLSTHsaqhkWg1QSYBxkdJBc2eNsnWKGUBiIYWHIlLXswPHCz7wBhGYd2VDwiBElxIjTP3E6aIQLZVouU9x3OXtgy0ULD7vHEiLcFRzpbtUGqlO3I9ZdLtou/vU6K4quNX5iJm6TGsASNwajIwihIo5FblpHqIE2svFy+hNjpGvrxEu1xShUB/mXiYIi4YuP4Y7hMBAvMtYuMXwjMtRbMIgyKAHMWUdHnQEisIAQBgHgRTPL/84LE/zRSWkQU7pDwJIMAjdIY9EBMFD0J6BzcDFZpc5QCG5hyRkvCCeGzAT0aGWngUIQFFmTdAZULERY4Q6rQdqmmLspWVHELrW5h37OTv8ZDT26CfqQ/r/2R1knuQrsX/fvQ2Tvpn5z8pYoXCA4IF0sAhl4uCrA41LzgoRHpPEg8zbmoDw5nqCTy+v72J10oe9jIdfNXrUsAqoCgBmBA0G+69GkQtGEoeHWljmcoGGbwIm2ASGAQRmONImMQRGGgVgkLDD8TjAQkjXhQ1ajIEf/zgsTxLomaTBTuzJxY3xBUAA0OgGisDgMwX9UtLCAdYgCMmHBszMIZeY02gofVuICcZJTADQkb9CJhqeVIgYLyMmZlSu6KDbrLZB2aWpOUzQ4qvCZmKBzsWJVcM+xSHq+W79JFs90uX819eiHpGsJtJmmBctaRcJCZUFXpDYmekGCLFHzg4oOdwzHbEZ9kDGM5i7pIsaHDieRQeYaWZcgk1z2nqgHqJEIqhiYiuOYTBeSgacLo8ZNhUHEoZvAaLAGYqLyJHkYhgWCQjMAgrIgv//OCxPozUWY8Au7wyANbYsBYCGYMioICaMoS4oY89SIdFzViNWUQB4YTwowIUEhpiJfxVUChIDDlRtyHh9sphAHKYRBFiVLkoW0u6jjs35KpxVjUO416PKHf5iYYjzqEBZ2VvK1EumrxIiscwmPY4jjjeMFiD3B5oweVWh+xxR5xjSZcA3LKLk3HKnKR3+39l58gXPDhCRkAwqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqiXtrboBfo0Y4Ijpgp3/84LE8C5RykwU7srUwSp0GMjCqbWgIegqHDCJdgqDFgJMwKnsAgmPQTXYhGpkxvh1bImuDF52qw6KTVotUYycBSEP4meAafaykp1WPQLraS7Vqp+/3OY6Z0O/qK9M43K2R72VDp2MqpPKDBAZZFhAbcBRU45BuEHYvz0VSMSP0L1ISvpe28UPMs2ucoSocCB1IdkXuVUAurdMAA8NAZANCCYMWwZO5xZMs0FMfjwNgRDMoQYBAZGn4bmBghmYI2mEAtjBAGmB6jQEGIZ0mlIVGP/zgsTRJVm2bB7eFshKMpiKDFGnKfqYNIzMIDL4DEiRwiCQjYTIhxY6ZZobIioYIlx4NLPBQmZIgNARoar9+nTdhOR+pxU8/H48sypGmHX5Y70OUsHWbHLVcYcJp5GBgy113vlRjEy1dpTwahGo4unrhj19e6HY0IPoC3lHvEF5FxwMD0IRFRJuYlpgkfbJ5bkXMeogrF2tQau0ZYCKTEFNRTMuMTABu6QTAwami5yZoFaE0+kuDBGZBJLGr8ieYqlBncCGOByZwm4kcjAQDEze//OCxP8y2fJEEu6Q1OqYbPmtiAFoAMNBhjLRKGSQLjAbZAQaMBLJX1ERuh2MYNUekGiYKCQpRF0DEgmBGIPnvr0I8tNs1OdmE668kAhQYgEoHNK6w6HV0ho/quJit7bvpa6S+//1+XlJ6vHRyyZV4QJBBV4tqHu7AYAdYRHLklBQqA3si/lWkDZI/bUwT0CF6p49KpkqTEFNRTMuMTAVKyEwCMzclNNSisRjw9jqzVFbO0rMyCTDAAmMNWwxAGAYIzWlGDqeYSLZuBlCxFMZO0T/84LE7yziDlAU5tC0i6YfRZgkuiTltj2QX2Ea0QsRGMMANAzCDxIiHMz3rhGDfQwB85EBeJUEDyNpSelFyAZcJCmtUl6X5WGMVZI4dV6ZDCcse5b/YwHigSkQmZqaZkamW+0EGupZ5CbxCWcdhpzy4jUgG2DxYEDINlHF1nFjUU0r3an1IiqeTULIxlanw9ZOvWISiilMQU1FAaajAoBjBQNDERxDFUHjCkXTFp5jPSBDXcjxZJAME5iuVA8so0NxkqshjcKxioPRm4XIcEBhCf/zgsT3LvmySAzmhtSSYxA0YgBsCRrMCwFAQHmK4uGBAEDwSn3FCoMLAw44WkCkSDgGtRUhoGBDkNU62VCy+egNoFHQTaQEVlkPzsrghfde1TYRSVy61n9XP98zv388bu7O/5/3lk3pRGvIJUfZFwk4oKLDiGBNsTqFN1sP5etQKGVQP1zNqQGsmLpCHXX7UPVZttcR2gINpiQAo5hlMlplCBxvVkph+q5yoKJ0GopiSUJgWxxo8CxxMORpKcBhWyprCWRiUJBogLBnGW5mWUJh//OCxPsv+VZMFV3QANAGBgnBDGJgEMZJ4lBmlD/m7CvmYAIRRiqhUHDJ5IYPANwsBgEA9nWsj8YzpGZhxCuGVeq2YpoYxgjBgmCSDgYEgFBgCgNqUGI6GIYVgIJgugGCQPxgJA3mAKA+FQJ20YDBZaJ1Ux8DAGASCgCBCA6EADKVs6LtO0u2Hp+rbaTt+wwCIWAMVjfhW9kCAZsMOReXQHO1Z2nytw/yit5l6S/bL3YchuDCXOW86Tc85TKq0Wf2I8t4Za/t7LH87q6H/isNyhz/84LE/1crrkgVnfABZ7WXyu5LJiSzkWrcob1BVxszVy1l/P/9/3ne73/wuB3IhuKy+ki0HO/K5VLJi7L5m7hlr8buV3dLc1+PP/963lz8//8v//3q3Sbs54ZWLdXVjDd/MBVp3s17dHfO3Q+VtMAAAMwGxxQYBCYBQJZiZjDGGuNMYrgKhg2A0mA6BAYK4RphWALmBEBGYQAc4cGEYDgMphOBkGAmAoYDwKZMNAYOQMJgfATGA2BMYS4khjQkUGZe8MfTLFJo/Dni4QZ/QRmkoP/zgsRmNAFiTAve4AK6wCPzEgfMeDJwEUAIExwHMWGAeYMB0iFAnGqWWQyzKSWpbvPcVyzi+MrqU2WX8//xy7n/Mbv8//3v91XleoksyC6CYImxelaD8SIHABw0wtSh8iJKFIYxqxVS/ayZqyo98ZeVICwEot/rAZWFBTBYuNhOozKAWXH5H6Z1qZzglGtxeYAC5iGqmRgWQhI0BWgM1jAhCN0JkOCg6EyLyGCU8YLOxgIQB4YDCAymBzAJxhXoz6aiOIfH0qOb2aBh0cmFgcQA//OCxFoxGWZIFOf4wLMCBsWC4BHaDTpMAHkQ9sChCJYYFgKxeb1YTNkdS7qxQpZZ7oPq4PzjzUj/v2dY5b1y72zzX6y/VW28KRGlYQGiyAUBEH0Z5hqLtKChC6VuSlxDeLtfiN2hCln3iyEHBoFqOd0leEm+lP0qHhfYMC4y9gQWQAxLAE41BIxFn8x2GIybFQyMGoxIUUyDBMDAUZrm4ZiA0DQoEsfMQQBLAjGiwGmDpbmHYEmDYCoYFYTJgfEEGD7vWYe0ARh+CuGYsCmYVoL/84LEWTLRckQK77TEMYMACIQCkYCgFQY+AsYKgUA4iJGDRwMSDi7rCmCNDlshkoQDnqS/VqxF0G7t/JoEeCtBHc6j+Xc+Z6/L9azt8/uWH47u57wpRV4sIxeQjLAsp6QMQW5sUqrfiy7p003cgHa30oSrq7+5lXpvkF0AXi1bqj/jjDIi/BmVkmFAoYID5v4dGQkGaHehkqXgwjmEDmZRE4cATCbxHAkAQ+aUKSIxgodFD1MVDgwGOU7xYE0eDLMXw488IBmjCtEOMPQJkwMwPP/zgsRRMjo+WBbnhtgwDAEy9xUAYFAAjAeAJVglquwcCkyd0hoBOIM8gTsZjMVadzVarHYnKQAAc3WDmv4th5kWAAh4AGQ01jH7HKbn4X72OrUrTUKxmGGszs4ZH3KbJEddC8nJnFn6n/leYTaiypmp5YwBQi9SgLMqPg4kjO8hFJrpXikO6/bTjzGFHMuUENTKQAhGQnR1IKHDIwCERvDAGRSIrJQAwwJzJRYoHAgfBAWAgBzAAAMMCECkwlCYDSyF5MHsA4wXwFyzCx5AmmUo//OCxEwomXZwHt+exB6UT5SgNDpdjXtCccfwVjX/zG0aw2ssNoX5nQ9empntG32gTzf7nz8QbWtZwSTUKNIz654kLBdySBkcJRR2QSLhi00twvNvarQNeiILu3DVXems2tP9ahNv/9YiyIRWl+MhM86Jaxec/ZIuaFkg8KbAF4ytztiU9T5KUWaAAKthdMgAIkD0wTro39X0wfDsyRBAMB0SAJrqqMlVghmxHF41mxv92vJtc+tN9//3jtfNfDDGvrj1Pf/+K3AIECIdlVutWVv/84LEbSaZynQe10TU910HnIFzQySRENVuWRhcripFzxGFCVgFJDWETzmrYYS86b4HlWeRVYi93r/9dQdbq6J5op1zhNYQ7BfaZGscbOdF8zUEZogzU1K0MUsbM8sZOMNljglQVGCVAcBOGA8GIaHUHixnlSpqKwYMKgIOYaMBEHlv3qfaXiRdRsxTYvNjkOHOyltu/h+7ek9IVzuqn8rOf3//6fVNj2UUmXe4Yb/93f7TWePQoXB1RWLSJ0KBgYcKAEICtYwZKPWKBRrWjhyitv/zgsSWKKF6ZB7XtsD78374eDiRPbsxOUkVCu28oiQwFliBQFo7mXpxhZ+aomk4ACgIYMhYsQkmBIpMBqyGODr5jJQDkMqj5gYQYBwAxgFgOmBEDEYTp4JpbkcGFIASYWQCAQBO/DfqVRFDg5fXJEgEJTMQTqAcd6++0D+/+723mbz936/9oW+//tY27U3u1Ysb/Gz2+q0UMN7PlpJXqsSVcrYxkkpg/bX/L6v+aawkZyVk75Llg8z2KbOX7XpdGxZCvGcPqhdrraIohmYohDRs//OCxLcqyp5oHt+G2MgNaPSw1hA6dQPpdF8h5Id8wwoIhNvyKHXsMjRMrGFDwBEwgAQRAFg0EAwcjrTTeHuMDcH4wzgOTAjAERRUuLywEWlgSbepVHlOUAB51Lf/djkB95/73dWBZ3Na+Vbp2exivXtoYDDAAGDARLxRZ0kZGAmUr8gLtYlW5uzHRp03VOdzhoGvsoSpJBgxk4R6UvUplyFXqLsXUkdqdN1MQU0KX7bKNrQMXqDIAyBPaUFZJoXhwgcBmNQi0VUxh4wYMRtMwMr/84LEzynqKmge34TUYlBE2IzoMAIwMAOYCAARgggBmHcH8bzAaJhbg/DgIojAGVTbk6MuDgBnepayXVpo6MWUEf/eV2hZ4f+8PZgAYcyvsNN/blRkljR1/VftesVa181mJDMMEHq3jmlHXWjfXDbfP9VP7c/xfdtY1pqJ/vKOC8MvSdSK1Ch+ptrDyXAUYgkH1IexnSoPpgGBs1bfTegrAQ9O6CwzYVDSbyOMkswOKzELzMnD1eRmWNmLhWYKJhrRJwcPC8FfoysgTIAiMHkF0//zgsToKxqiaB7XkNADgJYwSR1zGG2OOTZ+0xUQmQMuOYTAC4GCCAQFIKAeDiASVEAN8yECREL4oRGny3xQgiSsJAcDu2YgE9rW55/JcrC7YYKSA3N4zk5K81eUNHhy1yljf4yvvNZc3bqczrc1/9///f7/v/+qbaI9EDLDwWDtzh5qKJ2TbhceMFdjGKJJ7p29+sXUdGBcEqWvWtXnK8lVAJS+22jUGhQA4Q64KBcdAyJkwZDQKGA4Fo0KFmAQCsmVjSDjU2i2m4XWRIYksKYU//OCxP8zibZECue0xJ+HEY7mISmtDJEtecFO5nLfzGGVFcbmnS2IxYl1JyduUkzJZyPSQcEFAy+o648RgCLPC3FxBAEIQsMRrT6wPDcVkLEk5QKDW9SwY3Z25AyhBMOBx5AasgcxIFhTqxSMUl+P6pZWwk0F5CEkSJjkqeTyERy3psxIZeiAg51RZ2fHJRoT8t9QbXq4hy61rW/1ytVxDPtWn2vxHHUN8oyrjMclOMUwFMBgfMRiyAJRGEwxmZpPGGgBGXsymP4cLQBhhGB4KGD/84LE9DJiWohe7ob70I5isIBgQCIgFkeM4QEOYamSYQABRghgfmEsC8ZDafJ/MmnGMAGWYWwURgDggmAIAYFACwYCSsOYAwDC03GeovvMEoASqZfUwFgXUT11tz49xEANL5Sp0sMDQDyIICFF7A6Y8QZBAxJwEMgZtNBBqNI1QEBDdN9epwajC4hw0br1I/Um362TeghV1WrZKgjWkhQJpJ7UlprZFdaeykEamupSpgelWjIu4EIow9Oc6plQQUqb+aI2fWpt5LJ1/QcCoQyosP/zgsTuOJrGUAzvptAJY8YSB4CDEaMAFUMHcZQ3Y69AOBMYSVVEggHAmupJcLCgK+MwRCjCwSDFiiUs1+mUPM5NnVd5u0DnWpA993f4yjvK2BKA0ocpUMhN0U3RBxAVklfMzM8Kdm1eI8st/nFaer/bvT87vlyfP6uFhmRkd75Q6cpn1XmD1CmRdY75BEOBxx7BE1oc1tk8jEqxJJOcPe978jWAXAYwdB8yqo8xeBcxXBU01Vwxbc008Lc56BMybPA1cPQ6VJsGhWYwKKJE0YNh//OCxM8oGv6AFuNHbhGxIUgwFTCVETBUBDNkbzKgmjBVQCYwJAAbMFzANjEXikE4n4SeOe8SO6HNMyywMkhXMLRIMHSQMHASMRQiMBwQU3WKY8AwnApIxXABH4CkkYcgAumC3gkgOBGGK8bVaYAE+YRALJiQMVDZikuz2dckA4DFm+2ERsR/CMUNeAAgJJDu7hWyrZWLpAF7Fc4Fsd/HWWGOePPz+9e7n9/ueO//eGXNZ2c///3uYxztWe1fwu6w/uPc8dd5+P7/m975n3Wu65v/84LE8kbDLjgC7/rBy7z/y+9/8v/+Wsfy7vDvd6w/97vf8CB1VsQ7n96HyTR+DPRIu0f/ABgA42y9rSzYHBpKchvCqCJsxFMOOQxGDAHSNlRkggAWFYWIRMyAySRHUkxYCMsDQZOGAyAWYFAHRgjhDmLIqcdMhqJipgrGHuCuYDgCShrFASB+CwAXkXKSAzwCXQFNDeiWAeQ4DAvHiwO9bE2RUCFiToCUBpInE01pDLgrSb1LsktQfOkzKo1KiQldaP+eMCh4+sJIGNPqCrwi6P/zgsSbLvGWWBbfpMRt88Ejwougkl6z7AApwlsXCyFdbjrQCSkzeStHIHVENbkPJsRggyP6jRgLCoFOjggxYlzZLYNDlcxgCTGseMKCkICwJSwEAhhgQGuiuEEwQI8zoHDLZgMaqowdgQwAEEYGIw5hs63HPS7mYH4uJmJhXGFoByYF4DRgTAImAoBeYFIAI0DOj5E0ZzA9AYgdXoOAsdl62zXZfRSWGu2IJjqcpQBfRAkAQN8KZdNkCbSBpIEyNz9lpM6RMgLEamx1ZopBmcO6//OCxKM2okZECuek0DCWr2qrZ6Ca1U1OmzMv2UtFSStTLRUnV2mtbAfBcToAQIVCRkYMdeafCz6Bmx0Qe268XdT60HqFABkbaWkACk19/GkVCs55GMwSjXSA9UCEYUFVY04GUKMdJS0Je4M84bCxmRWhiyeYy2jQQIGBnMJAAQx2xnD6zAVMVwTEwoQrDAkAxC4CBf0UA+IgDzACACdeHmUjQIEOoeFvZxg8V3SVd0nO3cFHE4sUn4Z7jYs7yYza3l//lvnKjRcf1/PfgbDqlvr/84LEjDEK8lQe35TY2ZNDVONViqGmGVRq0Oas5DyGhp6nXSjMr0q2s+f2TP97mIlGZW3Jj1fZixqhiy4xbBd6+PFj+zWqBaqZQkebTCBwblG1YiLIY0iPkjABjIhQd4TDEC1XyL4EQRFPUfEmAUBeWQgDGAmBWYEgRBhrpymxGXQBhgTDuAaGgPyYAx5hGA8xRNN/ZbDSc9ZhREAXSov9zvY1pzPvMm4SPrqDqkpkKA+kbtqUkdBTk6fbcXRbLZxGgolrBGiHUrq1oovAK7TrLP/zgsSLKBluYBTXmtKSecSeSNstnXypUhoZZDj0Z115f6U1EU3+4lNIYAnFpi+owUInGTBxn8CZ4VgERDAVDAKDRacYADCguDGiCxig+XpHgOIQBGA2MTrRPvF8MGxeMmghMFQELspFEIJsoblYobDXqfS6pl63n7dvSqU5c3qatWVdgDMTPrrrCmrOz476BN+I2XdY8jKaf//UsThVl/UU6mdVCj6hj5+bjz9/zzMHlNSgjMndOYUG2prhKIyFpQB0FXhWYMng2ReLODARTbai//OCxK4qekJwHt9W0H4cMQiwHGVAgYKFpUBogFZycWA4qmCSmSgctYYPAQkAU1DBoCZsKAAiJqvAANBoBsBASAYHcw8BADeYDRMJkH4kBHEICSbrckJLZ0rYnjt7Jqmhy0sAx/fO9baj/PUEYzaYocAHRV56clXr5djmOv1BVY1ENbOGARHqX6+kx6Maczz3c000w5Z017tQohNWlsetCyEqaDFqw8LHCUTbQ+9aHocVrs4xZ577ClUEva6imS1AjGYIDoDjQSwcPyWfN/WDHgX/84LEyCv6Qmge55TUMKPyJLXIIiuIxR/IUQCg8cBwMVDggADMAICowIQlzB2S2Mywr8wiQOSYeceBEKwC2KA0AxzUYn4uUDZts8RgqIfRrXcrzJOaw62CvohAEASI20cRwpW++oWLJvacBgbNLv+VR2s61vUx2zWZLWc7lDXOSsyxROq/ZENSrUtUwuexKZBCDjwocgUitciHkOqFcLXpTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVRJf9tbLnGCOFFJyDbBQoRC9M3ygVACQ0f/zgsTcKsKyZB7flNBm2aVEHwy2vlUYtURAVRjQBJdowGgCzB/JINMsSEwKgYzCFAuMBAAEMACVKpNrrBN6wh/oQALrDnLGSlQXnU5ENERGwyn56stIpRbpsmmpwubsu7tWoPxoqfobL1KdKugpGm9mpVPbu9eauUAShdmfS91CmmSF9FcenYGHiqstW6PMZqUX6i3olAGaRG8wKBgxTYIwzBICgOaXguYIhEYcimdaDSYTi8YnG0GJWXKMFw2W0ocLGGDgvCg+AIHzAwTjB0iT//OCxNwoQhpwHteayAFIAeMBPAYTAlAKYwsEaDNRJEYjCNgSMwPoDUMAPAQwSAPDoAqYAcAVwECQA1KuIs9AwBFSkIBA1VwxAAQsficcvOsRALb32ssVAlmxEwAoARa3Q09e1Xpqi3Of9FOIEIwFJjnuWbKAvBAUcv1QldkbdW0dTjnc44xutn9WT0opjel/fPec9Z7s6U0fS7pQnSWXLqZZU1c0uhd+vd1KALv8vssUyyoQEaVOzUhsGCcYjZxzpLmIQkYRaT6Pyh4UAAQAUxD/84DE/zYa9kgU79TUBRcQyRAUOwaAx0rioCRgIglmCIHcYIsHJg9JXGGAFQY5gFZgugABAEIkAkmameSAANaoYoNAURRhTRnfTgRKhuloGEl7LOVbkBuZGiqAYHdxciisRBLfP68RAC8fdTD+hTCLKPQ1zbjUltQ9x6e5jk62o+v+7/liwsaewDmBOdcRkFxk4tzRQoWF8yAbJf8Rb0xXP7/XAK0cajgVAzUoceay6hrMGSpBgG0amPg4DM3nDTABYoVI5AqsYsJsyEJQLM6t//OCxOku+hpUHOeW0IBiEoBnDgQTBnAuMXo408HhjDD9D6MPAJMwMwKjAAALAoABgFALJlIBX/lLSgSADNVisAagGQEIet4X3oEgHZNnzif787S/AxeyNYwX/f2+YsMomZ3OiZCs1ht/7buTirltGzrjVtud+zuqvuenvpy21TD5iSW5D1pbJj2HRY4fEszYpRM2/wh9LUEwi0WvuoxqAbpEvQcAjRV8MyhYwEOTALaChMMWIY+yPzAgRMuio1sACIOmKgaHEscABmEJqZDIeBT/84LE8S+qHlge35bQygMSzER2ME0CcwUAYjCVERMhp+o/ak5zHbDGMXMI8wNAGDAbAJAwABgUgABAFBMBE7mLAzAVAMv6DAUGulxhoASGJilD/ADrKxqVy4DVI7i+AQMh5oxVNzItGxpZbstdAyFA3eyDXiQm9nruvdWpF2pqTZndGpB3V++UzV64iSoaHGdKhcXNjHm0FjSjhlFZxL0HMgLJ04xu37EVAUttrjbETJ1YwoNTONGSzHoY2xhOpPDOAcQh48kggOLegJjMDHwqIP/zgsT2M1oaTBTnpszRXbMhCgUcmCkSTowAwWAXTA9SwM3EpkdCJMQcCwwMADwcAskiIQIXJEIBaB1meKAAbzICIAWEEIAMZrU8QfhYarc3cg1x8k7BtuIg5UN0ae9DwCV2qipUJotHCWctiNzOxH3Me/3maqbfq5U89nRkr+XJhulb0niaLxyj5q8WOtoQFgFSipZw0pzhznlWP3a1AL2ICCgJMFQcoWZgcUmzU0aDZRz6EmMVEYkAJgRakwIAAgMU7YgEwJBhlgLqwg0DiTKM//OCxOwuIlZkHt+U0MaiAxGMBOAADAQwAcwKwAVMIhB2DQuwCcDpk1A12xAMVE8DAIeAMBIDQVAwmEwMVkYXZRC4AAYDpBaoDEwHH2AgDiHlMnx9BaOFBYSxcLpoTohMiDeMT4bsWxQZkbkcRBX16Qtt+petiJOz+tnpMi9Btquy7VpI1smo5TW6C2QZ0appPwy8BItCqWKrWza9ItVm8hYuvRiyGf71TEFNRTMuMTAwVVVVVVUJ7/bTUfGhgmLqE1AXM/nTMD8S7HcFBsoB0/D/84LE9zNiRlAU5+rAzUCHn18wwHkaqIkHggdCpCWgMAwPMDBQMdbfPm2wMagBMhAEDgPVohQwCU0DgtlGNO71e2x6mbBIt82GQJf+QBPkUUWPYPErqHf/bUxjOeu/5YIg3nlz8/zTNWYXm7qaht1fPv2VH9RD1F69EBnymqxl6BrWyKZ4e/HipdjmsyaWrFZmw4rFLa1MQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQW7ZI7siCpE7v/zgsTfKPIqcB7fVsxWDE8LQYcPCz61pRUeAmQhdbWLLWVcY28xVAiADZMvEZAowmaE4sNQAhkYoAWHAEtWHoPiiUc/36LghAMipmeNQm8UHQoM7D+j9sxEOAMKudd/FRrG/zTmOC11ONd3qup9VNHizm0RDRNtHQfQLsEzVNMWXofUPS4WrUZMJkySbzkn0qQ8VqR1KgC8w4wWEkzJS0MEEwUAQ2KLQ0iZ06RV4z0IMQgQYXjQHJmYBhSafFEUPGHByZDAyGBYBRfgUxbKkxcG//OCxM0kSiqAHt9OygMCfAFTAeAFAwQMBRMNGDfDYsAu8wjMGYBgJCYAeA0GAMAFaAYwAwCjT1MB2APFeyZvHVgZBCDgGlmhd9RipRS4CbgM4VUSkO8GuAjFYLWHqJlg3D0CmVB9D0pE66MwdZNCC6dF7HtjIgh44nu1CvMjV6CJoik1ToJrZrWXuqymprW+tI9h+5GtzWCR6zTItgIOruedIGUoPvUxJ9Wg0qLx92oBa2yCICEHMoeTSQVHg19bNA/D24Y5EncMGqiv1GjHf4z/84LE/zeCQkQS7+TMOAqgCF5CQDaJhjAMQqwBAFMAgCwwLQpzCKVkM6QyUwsQLR4jcoBZJgAlwpwJnGAOAnAWnefv67aVVG7uf7Zwy3D9diU5msk1rXD3CzyH/6qmykHyaufZHQfwGC4xPROcqDsxmMzPfLonqJ6vuW772NZJ2/q+tx5YXBmunPBx/3G0VCtVSqrzFPo2l0xBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqoCb/7SqzAwZQIjJN8wpOMHwkOwR5QSVP/zgsTlKwJCYB7fltAuSQUpMxSxY5dcvFMlQBREAQMKhQ0Aag8YCwCJg/klGmWJCYHQMphBgWGAgAGisyUdAUgVDtQ/Sy7sDrFi6shGH78XhYQJg3rHmVJv2nnCTRrPfB0QpxIf6GnGOeVVnpst21Wp566lTDJX0ORXmopeRSEHPLjxCuqQizFiwYM57K0NAuntJ13dtQCqQaAZjBLGBIcbWQC4DN0zNczw31Dzfq0M2i8AIw0gBgoPTU3tNolkw+ITMQYMZCwxmRzGwXMVOk0W//OCxNsn2k5wHt+UyLcwIAAUMBtAZTAoAKwwr0Z/NRHEVjCNgTUwPoDWMAlAUyqAOF1TAMwBESATTAHADlTTBuY0AOlpy5YsAJxRHatUqU6tSg1LyNXUO7KcBoAGXou+1JmbxKeePX4bfMMYfgvJJ1NQ3hiKpJ2884+cTSjVPdS27IayGHJZTZ6lT2yiGT5znUuqs9mVa792clmiI4XcDRhBs01SP69AaaKMMpXiRQBLrK1pCgENM+klMAYjTU5mMYoUy4eTQQOBy8ZmLGkw+Ij/84LE/zciskgU59TUx8yjJIpDA0k6DRkWaMSAYwsbhg2iEAQGgTmBME0YE6xJgjGQGDMDYYlgAZgigAEQFIJAABgGLJwUBE69O+jC04kn4Cxr2eVPDhFZlrhpKi+DhKIcxKQVnyss/bWXbM+boukKqkTG2tXPMVfGtzWtXUmuVsHi9pr7SKJiP+pyRi4/9ZO59uXdi5X/6vdPonlcx35B39Lylfd/VUxBTUUzLjEwMFVVVVVVVVVVCC5bbZOrGPRc2RBZg6ASTNVEjsDniUdSKv/zgsTmLtGiYB7nms3gyUi5KWarkq55KEwRVqpZs1DgOMQjDO0BKMJwmMIgJQBOC7TmSJjvOfR00dX5yh3/+6+VeQDot3JrqOdKKp6jZDdpPqDohjyiJ77mFDFUzRDaErTWoaYWZVrcYKnKInrYD2ZLqX29HZhuirFzInT+FkbuYlT3KTZitdvhBdX8hT+58+3////5KgAp0oIANCwMBgtnaGCiIAYBwE5jmgNmDsH+YdoVhjCArmHcBCYGoiJgIAbBAXBgHi1gUM8whQFDCmCK//OCxN0oShqEPs9UzzBQCJMMALowuAMTAQB5MKcLgwvBUjFOBuMYMzMzOyiDrwjjMz4d4xsxizFTCPMHIQgw8AcDArAtOzYTI1g4ZeMLQjXkgxovM5KwcDGdDBa0w8XKAcsm0NrjSFTRVabnpeJXlqkNER1dhQGL4MbSPZSqduSFkJdu/UsW8oYnXbzfR5IDdSA3HbApo9LE4Lj0ikFjde3k/lE7Dmpfs3Xgrxeal7IFdvguiGWv00OUmcopEpmuEA1EMjh2P44DoXxHLxMZJjr/84LE/1Ibdkwc9tkZvfpiy6+pmjOFB2rLh4kWNn8Cyt77t8WVX2OI1kR3Gw42/r807Z+X2llV/rIl/XvlK3mfmeveadSt/YRpGmT/syeoePETycxfZHUCZy3Z2l4ndomgQBDM5RoxC417IdBi1IdLuenkWlMKJVcNARk4jYhODH6EIkMMyoMyrOsnOD2Mc6OmaMQVBQ1jQsSDhBKGcS1cF6ek5RiifMM73SrFbGMNojcIaqUowdX+fxxaRGysiWRRFKRMuAonQnpbtxgicHQVEf/zgsR6KJGSeB7T0wQJSpZGpZYqPGHhh70kg6GiBFbulC3D3P/PNDoogiGtjSyh9bjvsRaGlQHJJI5gdDTOtcHNRE7mgnJI9AUkHqszADaOHCZcYGIiaY9MfcWSLvOaA8gkq/fIgU868SqUiZc2MgC/Cstjl+JTqRfNjZDl5HTkQ2UXCXGU6KNjn9aNAfE3rS9yeKR0l3UpdCpJ3NFsue2/nrmLb4Gb5atpGbPDUsZuS8pq/TfzIvFb7VvP/iXWpMdLlCo3I5+59L0/7nbVBqqC//OCxJsl0aZ0Ht4ak9iAQUbY7BscMmyxKYgdhitdGiAuLj40qIjBgyDkeaIIf9cc5SAzZpjRkc5gWTfndpASaLH4KEr0CThZMkNRJRCMCgBBczJB15+HFWSgDeOqOu5sfng5b35xdD0cR9QgRLpyU0LrpH2//98bYFL7X3v0p8zF6uy4rj5nxn0xCGfN33Sut8+L/gccfvme50xCE/90UISGkXDWH9av/L/2/y1O/h4mzNNoE7+qTEFNRTMuMTAwAm/3tduCDc3IzIrDqoxRrML/84LExysZolgU5p53zE0BHMpFjRhEEEwOBi0oMkRCJhqjQkBFMAkozZ8wCIlXULaCswwqAsL3Z4KggYSLO2LcbnnRTgvXOc/Ru795BLSRTIEdzle4M/7996A7rvv5Z7hm1Ke590cyeOpHxQc60IgUq1I+CqgPF0ESWoo44OeXDJ00LGQO9rAciixgS1p9LHN9GpDq/YpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqgErZJECjAwpMZ9MyolTH4CNJpQwC9TBSFNIBg0CLv/zgsTVJoGmbB7eFpQAEpBQoARmRNAo5iX8PHEFRNoelGTSAnIg5SDxfKVpGkpBqKeibyIazCJ3TYTDnyu0iLJo/zDXx6Dudw3Wfy9JofZ5XvTW7W6Pv+lDjaBre2dscTsb/zpWznT2Pd1nqdS+ccjy8e0Rnn7D8aUTucF2QdWWmYEeo3MBZrHXC6mbb1D7pOf65K1LKkxBTUWqBqlFCSsRn8EIcTn5n5CH+mGaqeJqMenmgIbqDJpRkGbDOZ3GBwF5GUAkaHEJl4yGLxgY/Bhl//OCxOIpkg5cHuaUnJAIKBBg04GkglSmOgg19WMHfAnwWlHR1XmhCIDT8cYTECyACoXSIKTxlGyON6+lVif1ZiwIuC9UgZxnAAmVlRb26LV03hT31fFGMveIGqy7+aQ728AUh0QBxYoPDzwssmTGLM3DgydFA2pIMkjazh06IINroe2V1KztKKyLHrq0NU8+kL/1MaaqTEFNHAgXAEGEwaj9IKBKaYEKdfloYVFsZwoAayDibIkcYpmUZhAqYeAMYMtWYYACZfjcYfiKITRBQcn/84LE+i+RckgU5l7kQeRgaRZiajoT4MWAIp8UXaLPCxKEnJiQxKdNAuCIRiXrNVbVhjkkUVHkRgjc4oXE7tdvn+q2c9joGHp1MtzCItPXZRVjEdlNLqbmbM7U38yvSxru+bKVoWHjiaP1RjUR2TPjWnIQDwRHk4GPh1Q9no4TfdzbU/OOWWsQoow7chZZrSqPo6q0NopMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/zgsT8MCHGRAzuitiqqqqqqqqqIVG7bW2s/pgwo4kQI+YSAJVPOXpVmahZcyBnPhcVf2XOgkqwe8/terBUZHVTaASr0R6aqZ2pf7GfyRWMWss///95lXZWA/OuvZHEnwrGtMsrmGc98EjXP6aMl0hH80/rsRWauX5ZlESH58YTzDKHNnc9969jEpWaKPz1zrCTZ/9SKExBAYYBAxDEU4mw0WbIMxg/3X8xtZYw6OY3lCs2BMAx/EA0eAgFGcYUosYLi4Pp5rBUVPwws7MLDzy5//OCxL0ggpaUXsrG+tJwADtwkCFx1JkoSYoPkiERPI0XlnTESEHMhow+sVyGvjUwoaMEZkQQ5QjGEKK1+rBSfNeHv0OgKa8CIIm7GCg9eipJJelLNLHajHfECiDgyjag50+KxPIeFj0XSDQCD5ouQCZLXGHKVgUkpKplK1sKbWinehkfXok3RiUyKLpPZUhzRiMy5rqaTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqoB/bataIFChjyeGDR4Y0D5shUKSMXBEMgx5m4Jeh3/84LE/TBhbkAQ7tacxV0YEQZQgGTygWHFwcPbEAxBDOQHQSSgMYwEIkpCsAuhuDd3THiVNnJEA8KuJW4P/ILGWzITtJGiSJeNR3jxGZBqk1t9fMRP2XtfccIpE0kTdFBE/d3smtaS6Fakt11L092ZWnrstBFet2XXs9SfTm4KGz4XEBNkaXGjVpPfc9bw8MlWbh3/03UBoDQHmSAQG+o1m4iKGPIDm0+jmEKPmdiumLo8GwJ9GKDSmOwRmEwImMLMiIdjK0KBItDAxJzBgAwEKv/zgsTiKaqOZB7mmlyavjsYslkcECJxCM5dgRhx2AaMEhFcjAeITYw4IJls2YWVvdAhBzUSAFDSH4sN0YgL3/jOGcRQYosrfHiZbOsdgcwgHgynmLT33Ic7uZRvZRWE2dJjlkEEEi4G8ik9Va9Gs1WcWYMpLSu5sJFIaGFEHPETS4fkB7DFVykxKw07PjgnoyKX4rLIuU+r1maLB2VU1RgkCowGwizC8TdMCkKgwwwhzBbNSMS3kx1PTrRePMO8yZJwhbGYgacEMxm1LB02MhkM//OCxP8zIdo8Eu7a1M7Foy8NwMPzr0HMzycNUiwoGGHuEJEPhCBIJzCqOCpowyQyRI3LFnzywGE7RYSQB1HowlYRA3xqy6CBIThL5Dgqo/T8IzNTDnT9ttHZLFtNR5uk1u3+tYMb/XdZ8zw12SNTr3cN/rX4Z5Y8qAiQFUpAKGNocGSCzly0QPFhyGPWgYlxHlCqke+vAq3gkky0/ctDd5Bmp3UqGYGBOYsjQc5SMbDlMaGjwcRYWYwJuZhhWceB+bKo0I0NCF6MFQEMv3UMYDj/84LE9jJJojwI9zQwjJELTHcXjDFLDDkSSAJDPVGDEhMTIcCyYBDAwKWHqVmKcmXEEd0HMQuLIC5rCYjlQtu4WAGdWjRwRjy/bkDJ6Bq2EjaMNC8pqnvy4oIQcqupEOWQy/kBSWxHKe/hlvOm/PVAurt7+5+m9mKgT5pl6URXNwo7Z3bblU0wEpZ9KkHhSuEjr0ixBtrqFAYEw8AJ4tQ2xAoVe8xy6J69R6BWJnleLOTVTEFNRVVK77Wx4QIBGx5BoAINRZyb4lQZKLAZJMwNVv/zgsTwNAnKPAjulvSoQhl2zEVUwQQJiicQAkiQbOTK1MpIiy4KiRl8DHAqERDU2NqKsfS9m7z/l0pA0d9MYlINYZtH4+ypMCBadsANxai1ZSo9v84hAiv277W5oWE6l4/vj7i6fDa6mJjZF91tZW37m2xXF8rRF/Nwu40LMEK9Bh42x7pxwsw+twqtplSX1KFfV/jupQGlUwZBwEDyaM5aakGmNO2dJHOYW1x2B1G/zsd5lBk9RGXTKBSQdWkxpZsFQsGUUuYcXJkgYggImUXw//OCxN4ool5oHt5WlGHrAYCBg0AhEZS6JKPDNgjGgSHHwOGgiBoBCxhEbmsymQgwAAEtQAkopaPJA3Q5AqVYVhyYrjEIBLLMHLZ8z9u4GxMKPOeMgpKzK3yis1A/Oyy7ay/mVRZ2+/+8rPa23wl26Svz+XMO0+d/Hf/qtmomcIHARCkMOAA0+w81RAQMQx0z0iyTEasi5KAgEBAZYVOGWrEV9ia3vbUahCpKr6FwOkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/84LE/zcptkQU7zA8qqqqAbkkj44xtDJlxa7xM0ZMyJVCaeeGjElxl+Di8swrtAMgkXKswGTEYisGbCsvjMTY5D9RpTmA9k7qxH7U05OcR7/cAIV+ItlMHs8fd+/mB4Y2qXrGCy/+jStFnV0olmfVVvNTNo5lqNVCyioWMKFFNJMDNZ0gOOjzk7MkCLwi17Ld7Li2z+tMQU1FMy4xMDABO1yNHcGDAwDvgsXyYOnOBgY575kEtmlQcZ7NxgFBBYRBUVmOKKZhFxfwNSg2cUFwyP/zgsTBIYJOfB7WFF6GLsGNwgrKyoYIxBzR6kgLIkKwSdyOaihx6cLnFfCzJi77jTZ3lDHOjM3BQ8bYtd5/LKtn0sbVFni4ONvff3jb65YKgv88Q74II7BrvuY3PtGzq66CzKq2e/6ZPFvrnhkc7qUb9fsOta8XYbWhrTBHD3vImwWCLnImVgufYSeasgaUCajOSVeU3w5MEQWJQENhWvNqj1MrhUOm2DNJplO7z3MESCNTj7ABvGRgPmMonGoT+GnpeCgJGWYwmK5QmEohByGG//OCxPYuuk5YHuaWnDcZZhkl4CS1CTA2J1BGKGvHwydgqUMCBRELGDL5lIeYzyKbMOAQqZACJBICQUoSACiz2O5E2wmPDiUNuKtbjEECANm07IWECk46is1PB8zC6vyin/HLXVOnU5zXMNlTDDDBrol7usIS5pmb7Ldkjh5rR82UalPcJiqFmzI1LX+9ckqe2rmGfXNLuDYdYSYRPC1LBGHCCUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVUD//7eo85k1CYSDjy6agmGPQj/84LE/zRB9kAK7sTYBusOVDKSJu4cWiIGMlUDAgxlJAYQTSESgMNEKCZ8tHR3nbUBYSuF5pctR4jVWW6kbLbFPM3qed7uoJrraoYKZoEnk9dfn16Z0IIZzy6jxqeZNkjCV61oLdE605flzbYZLWz5A0YNGkwxGF1O2uueE6sULzDUirFO32nd+9/WRDDpgGnOSTCTTCpMQU1FqgLukGAKAA4NEIOMjRUAzwGVqamAGSGNIfDzcmYhWlQWQEchhcAJjyipjcFwADjajkyR4MOLBf/zgsTWJommcB7eGpRBzEmswCwFQJp5hCMwMqAocpCMnFk0eFSoBjB0BAU5tOhcbCgADi9ji2UEzskoLHYvcnwERK11bk3K3wDgnkMxNZVNPMKzvVb2vqvzTRGBxzGnokwmSHEVl3Ksaqm7VS6KTZKJ973TSx9THlWralJsVcYC5kCFCSCV1KD5ytUQM0Xx8EMmjy/s3QLjSQBAINGx0OzG+kgbEGpgDKG3+Mc8Shmwemy04YBQYGLBhUGmXJ+ZhHAYenYhJnq0ZacCSeMJBop0//OCxPovukJMFO7OnB1AxcwUlbiFAAIDhgrKCUHD44HmDgqqJ2AuxB9EQwCDL9dgOEYFL6r2f+0+pQSOpcsUF9sQkDzzYn+QG1ZUz2xO44c//o4AsniTmjADi68+xFKJi6EREU1m8ys1ldCqdlM6CcVNRGm6utD26YusN3DhQ696SqV2JFErx5HOqHuzgnYl8mXglXDjFQTlEGgMYKCaYk6KYwCkZnBgaNOaZmsabqDAY/g+Z3ISFTlMCwhMVxgMtn4MUx6NCKzjHgyW3MJPgFH/84LE/zESkkwW5sqc4XMTI/U0YJUuMIMkrWIGtAxURQg9FAwRAIjSwUFHnmqZ7gvOBmhXKw4cduMFAZSUXlsNGCgLQbkzBmFgIDIu09+CIbn3cWEysYyDL+6HPDMKQs2fHOUOYl9jcyea7mkjFEMZDUvIJMro5mitRqlS6pItOekQhHTNeXfiB70br/3Lm4xikugyZBoe6x4SAwwzAc4kJQ19ToyCBc3fbYwl7EwUBsSlc5zIgu/zZIzMwF46zojkBuMZE41A1zMh9DFQTVcCg//zgsT+MXoqRBTu1JwMnV04sbQAGKtbPBENgE9HGMaOQIIigwDCowgbO6rCYUjRhAAYmFkQUQCIGFmTCpYsSHIKZ6CQ5GuefvKjd8VBcl8spAQxIJAgDjlHRxnnaG/j2xZ22WHef+t6x/PsklX0zUEWwofWyl7BwqddFkxyQI9B0jY/i17Bk8troqt2ghq4DucaesXnHPoWKPmNK31VAqUS7pguExnLgRjglhimIBvojZkwr5q+HZmeCYlmpk4EZnOPJhKPpgDF5kMEZimNJpSI//OCxPwyGXI8AO82TIYVGIDBEyUUMhoQCSG9oxMgmEJRaBNEzUQAqeDhExUIMCGgMzmghIXmy3azA4nASMUBZbsxQILImWmIYFxOBXTMGA25Oay+2mmnKuJTlkD/J3z8PpgVL6egOAIZv0sdUaEsFz6/uhczOuNBEJxuY1d6975tsHHqEYiCS1MD4YOhwDAF9IlYSJiJfMzZJNVI0bWPuKZASX6/Ruy9AYtUdsWo8TJqALlS1xh8FJoG65m4JRn+AJtyQxjkuxoSTIgBoyzSIzj/84LE9zWZrkQU7ta4JOMESSMJwnNDA+MiwkNsTz1nQz0gM3HUwjGXAwKDMEGS0phYuhqOhw8yiI/ZqVihKFDJogDNNcm4yJXosis2XO97OzGh0aLmywDLkL2gRCmkrIyRMgeQReKF1uw9L8pcOgQ8M3O8WibIOofRkqZCkmnrCgG9an/lyitlKrU6no0dLcvHbnaktb2dNJlLMC7zOTKNQMfQuYqYfujTBcarv22gRmhVCm24FR2uC4dAwMB81Gqc1JFI1fGU5sGgwPvYuyZqEf/zgsTkMsJCSBTu2pyGlQ9mSPRGgASGH4NGXMOGGg1GbIhqmeY94mQDKF5mVOZEYGchbcDCg5bpQLjywQrqxzFQsKgYicTHh48pZdBljtGDkKVDeJWvEOEQsTKptNhsIAKemp2UJ5AFSXM1NYOQBwbFIAajZskIMPAtjGbSdJa3H0BxPQW6JZqAWiOiU+9qaaM6pWlU9J79Ppa2Q19/sbnhxM5YLvBUeOEUXECG4xzw+wCtI2HVnSDFBcq22sXbbMbSVL31Ij+22eEKiBjl4AiY//OCxN00GkJACu7anKH82sjMVNDRgIIQDMTAxk0B0SpEy+xahdID2X6sKvwhaHJnXsvTVgNnaH8vZw2NXLzkYcrrzTrQddb+oqla3vKG7WWesl9KcdpC4pdieaHg5/Q5gUZjU8ERB/5jGMX0Me6vdjfRCootYrENbhoLL4ptHExrI/LLvPKY4fFSlEs19iGoM3VKc1biI4yRyaoAGWRuMmGhYdBURsY1k2SOKOoxi8TaxEMPD81MzzBxvOGCswEFzKD7BSPMWA82oUDAiMUvCgb/84LE0CZJ9mwe3lR8RGmzBJUDDA9YhCD/hQAGNQkQjlEsAAMUAIXIgQHzOw6dDqVIYDFWkADRW8VACzIenrrXnksyySR5d7WZdLqqmmq8Uylqiz795cXQQXJwWdTVMlwYiUOH7/3uCDMlv/t+P8ZsaSKTTGoR9669b5TwVr1ef67ZRTM/aIsv7bt7f5X8/1lMVSe0xDdbWRz9S3fixtcPafzqvOoqN9frpVy1TEFNRTMuMTAwVVVVVVUBT7WxkQqFiL7AqyZCFGXvYxCiAKBoaf/zgsT6NSruTB7jTYWVlgqJhx4mcZAoCRkBhwgKx4LRKYuYYaBUZJiF826yCAB4tJAdT7jQ4s5IQwsd5uHu+TQtA3jTDqJp2G3ArAxlJwg77iSINXz9bdQbP/qL6CoSxx1/yFahkSrQbwoxIRlzIbI5vtpEh5Hqa0m5czk/agzCwfXtMOcgBMFCmLmRdY965i3ZUdX5NQr+9LUxKFDiT0NNrsOAo7LjIjLNCgo0mGjSSfJUuZeD5hsJGVWUAkgYABJsEeEKLAgBUEMynMwwc1A4//OCxNsn4pJkHtrHMDCYG1hMkBPywjJjZEhKgIGoTRBTB5uQ+pogcnnDbQ9ioN5rMtmG/kXLdXNmKyZdDEXTGq8ivy6SQrf44asfUwfBkdJvL94Tn75BTFbmXNf+tf9juRI7TKsSG2RWqu+ZLIlJyuvDfTNoVdmfFo1I0bLjFz8v/3+/+607G7lJMstdmtbzL8sxrERZQx69TqqlwOgWYyFQbl+Ma1MiaMDsbPTOZCJoa+jaHNcbOsQYxPOYNiuhoZWzaY0DeY3CicDDgZSDIY3/84LE/zJjnkwU5obcQgkQNGfBHGAgbHCgxWLAZZTCVVMZIyw4gKWMxBQaWGJMoOdj1r8WBFHjExVfBMTiIHMCAI+YANiRsvWWs8bM6jlwFDDdUbxkGetdzuBBrLHVVFnCnociz2gxyw3nhHmiXcO52cKvf/NblzfP/Pf/+ZOLPhPV8vpqExBx9HRbenmdI933QhJiPL27JbmCThOhGGKqR/XKudfXTz/JOfwtWTM8FhELlUSLjhtdZVsdMAL6tB4Qks03uzQCdNcAQ4a3gq3jGP/zgsT5OPtyNALuxtyLwCDjRCnMSHkDLdAYaUJpkkLmcWG55gn0Y0vKTrjjALAEaZiY0A3BJ4zJYhNjT4DAIeMkGKDx9zDtx1WAMCu8VAf62D4DeYbzL7R1iDZThBXxgugu7SqmDZMJTX/v/n4UNdfGMT/1SaAwcmAgBZ1IXceA5gedaPjySBcHW7RcS9Xl2EocNJZzb0LdHkTEq15g2tJB7dILFCgtAI0wcOpaKpoC/qLigY3Py3TwXc3pLPsfTS54x5JMeLzI6xKA18gBxiZ7//OCxNktoW5MFOaekLQOKA5YfG8aN+MgDjEjmB03hYg3QyAOQM+NsJLIjR4RhWogBERMBNguhlbzFq7Jc8oRRYcJY0UBzS0ExG0rwBLFD0g4tIWHuw5c9WzsPBRb/+UvWRGtI7zuEA0VuS7756TxkVyr3xnvGCRAHkc2pouRCNQ06oo1Jw6e6LGxfGdqBWsWQNTLdSaGPuF3YqKU1QC5I3HdSsMR0wxE+zDigN0hQwyIjTAhPaJkwUAiU0GU0IcgKBgMYgwOGGSwZaCpiQgjJhn/84LE5ixJzlAU3pCcSRgjCFsIRFVEIU4hQs+yj/vSTBIDDyaomBOtVziE8WPTqbxNFuVMwZTzLMrLcFB3kl8amIJpK4o646pY9I8cuNGbetlwtrYMDiQpAf1coHjciCzmgQbsYu17lEI0GmusZY+bQj5ip4gbfP/CW7MPQIBtaFBs5JqsYipJ4SWxy5pR2xU5sujxmJ7ELCBV0mJb60xBTUUzLjEwMFVVVVVVVVUBS63ZhxIJmllJtE2dgFG8CRjqKYQpHPKJg58BRYwdsNJXMv/zgsT4MUJGWB7mULhAUMzAij/uRwUrAXNNiBVlVriwdSW26kIMUHRKZK+pVAvOCBV51VvtQhOav8FF4/M63XgbeuOhx34knIJ4nE4rpjII3yBM8wqLanPu3KHK5Vcom1FWr0d7nkjo6Dtp4RKaGyw1RUS35NS2IG1oF7GinrFXtVYoHyCPIViiEPQWBAsccH6XYqD6AP61XiMDTDpuTAosx9FDGEmRGgphAbhjwERjoLphKGxhaKBwqIpheGiBAxWXNN+jFzwxMWM4CTpFwwIw//OAxOcqqepoHt6UfBoGaqPfLWHgCwMF0IINhYfT+FQYuoYUfxYUHAUPP31LcOKp9E1TcaA6G/QpMVrN5AS4C6ocMFAGmsdpGysdy7LyYDt8457jo0AFBeXwoSxRtG3FylMh0IqEZBIRRyR6lrlOsynT0IjDAuiE1sNMKCrwx1XLTQtq3HYTepS7iVqnNkLQ801F0LP+igCplB0wABwyyaYw3Ug9sG0ywOAxCM8zBOwyhCcy3I4RAuYAqCaunkYAh0GAaYPBQcrDGYPCWSpQcf/zgsT/MWJCUBTuypwZsteYOhCwwVQwHrSRyDJlgyY2ulCmWQKoMTD5hgCameJ1jJM9oCClvRgSL4wFhRH5JKJaW0pXTRtuw4AJ/N3dMKE7zJX5uGrRWplU0RssfFfsCjVAHIE1eQ34FLsN/iuuoi+Vup7iB73MNXMTdy3dxfHHWh9pcmAhs8CrRhWfbi9zrFqoFxYBDA+JxsTnA64a0qXawoYqNIs7S9VMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVASkkcjbcjOqD//OCxP01CkJIFO7QuDFwN0iIyBDBlwAR7BhVJcGFzzBCoHhkRjjgoWes4Q3MOEVXszZEV7dFUOAUafsLqjwiaKZUxI0hX9FPIn8k9AXhQ5wEHjmMZUzmbD7MFkP7+PNmdG3PNMr73Nd1Wy2VCrKWJPYUFSTUYWk1FgGBWETSRcBggFXhosiKtGrd26/6aWKI6QwblLCKAaVVKjAQGzIOPzJKqjRwazGk7DApfjAMOjFEPTJsxDAIZzAIxjhgtzGgQwEFRgiVJqeohgqJwYBQqBD/84LEzSRqBnge087qCpFMFgjEgjFQCCErVsScM4MNWaJn5gQyc5qGxkwB3w6ayJ4CMJ2sudsSZS8vuswmEYyyGRoBYfxwkOy2iYbDxjwyWCwuUsV5+LPVW/niW3YqowBEkT/K34wFQU4Jm5IHfPUVrwerIRSEHpQZHaVuN2i58WW1XrfGrN5NYqG6ktteVEdhXXPauLMtYLYpTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAe/+3papnQeZLXGCh5lQaP/zgsT/Mfm+SBTukPAEwEkAKAxhQuniYCXGrj4hHK6lpGUp6MSTyM7C0OjnXBYYmZ9rqJrU3FgsRgQqAIGj3UMfthT5KmGy/UJ7TNEf3GUbLho8eFvb88eoD6Z0OzCYIJGl44W0OrMP22moqMhJQDWJ3Pa0qRLkng1Y/aloo+mz2Otcwck1GCrSyexsU6KVjhwNMITy1Q7CwGmFo2GLt+GJG2HO5JmrI4GQaFmdQeBywGVZyGBAsGP4xnhozGVZOkQ8mFpgGwbDmDo8oATGsBzQ//OCxNQmEeZwHtvPCMOIQk4Y4BFwToWMvWvMBAwVkB52Gk4gGTJWUWOTEVdeBYJU23YKAAvMRP0iRwBwGGAcfxbsHCdHPthQMGQkSAHmMUAEsxIMjLCl+XNx15N/rv8zidmYWrYiuHMsyTIBiSODPUzUBNDsckzslTMZ1TU6o0tX3UqrIuqTvp3TZnKzkb6foyVL/obgpkOPCLIsQryuABzGOI8SHwhLKkxBTUUzLjEwMKqqqqoBz7W6mY4ZyjmMQRTrBC4WGkhAiwHmOFoJCBj/84LE/zWLHkAK7sTYSzKjoBCMEBUVN3QlU0QUxDDyMuGVinj0i/RJXphs3YJiQJS7BoJW3WYnKKouLB4uQNj2rEO5XYtBdDksEIgL8g1OBN/XVrcASg/+efLNqCPkZURosWlN04/ih7ig4WeIkYEMMAjXitpUTPIzE/Uda/SZVaXNOyxJbrz3YnZJMDBoQB81giXcgZVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUITltttf/zgsTfKNnWaB7eENAeMAHwwEPvkB4iApskx8vNAzNCLi8EucEOuLQfyjSBly2CvlgGghCChtR2Piw01H32oh/u8k/QjqRKkorFojRAQuYR/PKYMl+h1XUs7DvTqa8r6Jtj9uODkZ/vXTtxnaMIWNo5lpn/IWYa/fFsymD+jedYxqZyxS4aVbnXAPo/eVaHEJc7h+jnwkxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//OCxMkjgaqEPtPOs1VVVVVVVVVVVVVVAIu777bd8UEwMn1HH0ae5zgx1hDPbPwYvO/bg8kkvoScqj0vEFVF3H2kIKVdb8//Heark3MJ7Ur/+hepCNzO6m/Uoy0ED3IXWjqO/W5lNr2WGpv/dkmOq7/iqGKt19XNPpFb3VKc4/EOtI4wEPsNIOszjGqampNc5qSFB86qCwveRDiaXmUZFT6fbm8ZgA0YgLYYPkmZyFYZapcZtEAY5E8daiWYsjEYcCUYXh+cQm8IBnMLFzEg0Pn/84LEuR9KopxewtC68wloN/EQaBnqrLjhQNMFPBkzHjoxAFZOBSUWHTXAxdpAEAYADiRPpqwkRxRzWrstywaWh2u5YBQDR0GhZ6hUacpFqnaJaxts8gfurX2aEU+VgGKFsXcVvaUN9HcQYGBOLBsoVgC0l1osJnyiRZJBpSRRSko+Rk4oIT0QEXwheqIkIXPXtv0G7fWzhGoA6mHQCBAcmGkBmQlQm54HmtIxmEBFBximgwdGFgsmC4dGMBQmg5SCAXzAoKBgBTRYSigzF4hhCf/zgsT/MZF6QAru1rjPHhkBoZSDo+nSJ0qReMZDTHFomDxISKgaBEdBMZOOvtAYMCjOBGPCIAJjePI6MpkcotO4kDy/JFUiqCNy6mHRKQkzDnXx0+yjPf/uEB4TCJxf/GCtxDpeHmdXdFGvAwsGiKUi6m0LPtLTii9VrROIUtfNqpIKLMufRxRCE2s22Me4rD7zyz45felMQQyqPACYghoaWHAZF36YGAUc0GsYbAAZbEcagB2Y0joYEGAZwFacLDQGFgIQWMQej/r0wtoT7MlD//OCxPwwgbZIFO7KuA1OZAsUWAKMHktMDKpGkDxk48ikPFhCKjxKWTERoz1pYYAGwiLLnKBwlIGbJ8utlOw0XHuQ4/SR4wFUUOFpW+YHecKLZ8m04t8/sc5UFDTuqLNFAsQ4qyba1+rpOWXiJxIWGiZ4NlDweMV2svCqD5WPOz5/FlI/jx1Ngf2hwqt7Y9acGExKLh2mHIBAAZiQFxn7dxkR151UVR53ApleZZkogxmKD5lYcZkmK5oAjxwQdoJAowJFIwTDw5TB8xhD8wXCMRj/84LE/DAx1kQM7s6cLmM5oGDoUA4pS7poIUQIAswFAMEUwkgUHjKi3XAPAFBjNO1qEAUKDRlUNBUMAVPl4hLrcYtK6RuphwFPXkCSiHxfCJDo6A07qR4G//NZaoqf/kmdGUDzDL4GRDKIAEGUi/WXniajmr4h7eO4XXy2bPW7PlLjkwJi4GMlzaUSgNUCgotaKxY2zFnd6+pSjy2PQMatqWE2gapcXMHFVQKkUGgIYGCSZWsKZGSyA5RNWHMAB/mL4+GnIImOJDGCJomKxhG3ZP/zgsT/NcoyPAzukPBZgkDhg4GhhFGZHlGLLYCFTMBQ6ptISsSOEJR3cK3NKkyUSMVemXBQKQEDx+kAZyFOcKgKehRUJwEAALIT/jgCvaUSmmpigYit+PMHjSWOCN95S2kuRfG+o3FLvdof6LeYWdGvtXsIqBFalWJYw2HDpweOMBMJVCiAkYFjKDozY0a9wbW1qFtYi3rjqdR8E2rPNRLICB4QUNI1BJ4qcqJsY+kD5VaMRB2ZbHOYXoGe4AAYdNeZGD5pkchJzNAKcw0nzAqf//OCxOsyQXZEFO7SnDz54MwgYwUKjFQyPMD0xsQhIUqRNXhYAiVP96TTRyedDxSYNArBCyqHQhIIkFRIstZXaoEYtCM8ZyQcS6CBHDB0bwA34m0MGicjmZKrGe5K5Vbseo1Kf//4piDNP/uDG1XUMpYFGT0g1xvHlznGfv3kCYoPEyHLSlAiOTyLLGmJamy2lzdFr7y0UnHLvdahFSbcgwdgElUA60oCqRTlMIgmMDocMYEkP7i3NbXEMFi+MTytMww2MWSmMIgvMCT3NIiyMPD/84LE5i7pvkgU7x48uTA0FjAIUDWUyTAsYhZ7EjQ64uBxgNDSwh3Mu+gCBDQhIyBSZEGBw0BCRCLBYOQ2dIcEQzMSZDcQByFcZWU9zqu3PPCWqoa+DzEIGzmYQ6QcnxBcsk+d+TK0WP456uqFBGsde2QYB4IJRf3MU8cz86998fVc2tzD2MctSzCbEgiRBUBHWj4CbDdtgZ0GnoezAFi3UF3aEWGzdK8UEJ9ckMpMQU1FMy4xMDCqqqqqqqqqqgCSl222rwUFEDKWF1RrBZShqf/zgsTuMqIGRBTu0Lhwul44AIkYAlyf4JAcNKZVjlyikrIALUyjFSAlsPNqXURygGBsMAoBCanoUuqmRCIIF0asz/t9O/8aLv8yTxzIGP650WEk0GXWT8tOtizg1MEpVz8qReaZoWAszrJPaQBYbue9ayd2xHivyiEDgbRz/l43fTm13ua8Ha8dd/0Pj0ffOrFXveJRtUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVALutud5Lw5ldOyvjhjA1RVAo8YkGnGCpmaMIiQAI//OCxNYmmhaUXspG+8ZGNgIadkeOQfujQCBMRnAYEICEeJAX5OeDdhwAhM2i0M4LGRywit8C0U0iHalCIkMsgXrWrcuQ/y5T6lbw4SkBBITEHCwYh/jUUopMsg7wsGDDF2SmqMjtPr3zRRUYc9TVGhthdRrKMNutcd0hHWi+h6SdqNmtnJ2kFvCBQqKPJqhOQB0UPigqCywyAwqGJp5z5kbShh2I5sWQhqsymlG4eAJ5lY1mQYAYyA5HHjBrJLADECyPn1syybgTOA5BkJzMJHP/84LE4im6Dmge3oq0MCgN7DgwZTCEIiNEBYRj4wECC2AoATDprAVEwZAQiFdoTTqlKIGJh5AikGCh6Qyp53MglL6fgBnDdUnQglSJLBxFZt1RC01VxKZ5pbS007yS2f3FJRzuUxZwz7qP2ZBgFHlWAWIjzABIqmLC52YqJA21Q6LrJHYYWliKkrQh7Ux/QtdNsObiynGnQrY8xFB5pw29NUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zgsT/M5luSAzvNDgBOWSSIsSM0yM3cBWMEBhERKpxN9GYQggsJQFIqOUMBTWoFCx0wqNc1K59QHFpiAx8xzkY9DlR6NScOUUEx7X7xZ+dR2eIjmODj0LUdfkFBrY4/GPXEVDLfbS6tZlQy9FejFLNYXjTGWg8CxuklOVn77CCiLd67gk9UikYhD5F3llLy/elS6mNHgC6ogA0QiwZ0xIZmNMczg+Y3lSBB5MhSkNqxFMXCNBpGGMABmkABGDorAgADEgKwGRpggG4NPg0JCcH//OCxMQiOg6AHtPK6gghYSAUGzATH4iS96CEDmjBKDAADVgBUABKgKPESILBGkl5jCl3MJQQOZyJHSLTqafJpN+eguTO/HA4nmoq3aMRpv56ULNzfr9aU0OQ0XhUq9hgR+ikjzO6/6n+n6cfc4RWgqRIC1oyFhBexN4sYNrQ+H2oOs9L0BZCphSX6SNRRoh0omBGLuavU/VVAKlkJxhwKJm3WJikNB5KLJhAYxjg7Ggzaf7HBjFAGEmYZmQhqZCgQzmAAyYeVRvOrg0REi2PPgT/84LE/zGJskwU7pDwMLh0LkAIDijhiVKBAGCwQLEQOyDMBKMQCGq4VxApxOdJ6FHa9D7Ph7OJkDCTbuuG97to5ReleZ+W6IOTiSxfl9Zt34PZ9GXpmp/U1ezuxSzqEyH/zyg/XOfdpKIKWuQVhMwKAkKJUCJN71i4mHEZsPrJB5j2vQVxeRXlu8jVSup60a9TweroDK3GlmkgambOjnoBurTkMHwfNCERM6SROTxkMXiFMAyyAJnmIovGHgohQLDHgQDNkMQCC48AYED01FLowv/zgsT8MmlqSBTvMjSQgMEwMIo6MCw2aEHGGYmPrsNTqD1okRS5KJ7TxErZSW3UpcCdElMidtMyRFUIpOdfSFTKREssUsabAw+9Ayo2vTMZo4k0Ob3P/lnhlB4idWofHmqgwir+iM6alskopELxgDQCce8PGFqSsIFMi0skVvWEibxNXyTU0gIJoyrlo9rSONKh7wbWDNVMQQC6pMUwNA4wOg4wtSE49IQzZGowGcjLS7OqEQxedBEeTPxZNmkIwkLBYTmQheeoBQWBZhschKLM//OCxPYuybJQFO6O1EBDJAy11P46EZ3hUOcM6AVBkBJaIhAhCUiTkgIRjGtN6LE2PK2Eyh7R0A1eFrml1RDnOUDpPTElybWBZQ1Go/uq63o7ST3ft7yiv3Kt7n/JaP//6/yAjTnCjjJVj0MSacPefB4VGAMwOTtlTDjdRA0LzjWCdy0vRCKbQZD63sF0Ru2q/YtQb+EFAK2gSAgYKJlSERidGZq6SBjcO5hqH5k8Ixu8FpiYMIBOUxeH8zOFYwPIIwoBUwgGAynQUwaD0LF6a2j/84LE/DAhakwU7zQwCGFIdCgbiQFqlMiQpR9LmGrAFXzSLNENJ8h+LUCAclTjswLCs3KriLLXF9JNPMotONbT6kcxH2iUylNRmCarL6OSyBsL9QW1H/0yiAHrCQVE8tQcxa+NPBhEn/6qk+KlYvp5/WWvvi+Zuf/RPaIf7hYpizwuLk4PnLkKTkUdBlDGDAfEZ0DNx0WpK0UuWGLR4QwETEEAuXWCCoLM1bMzP9zFAqOBkwwmJM66DtmM0NkMZ0TERw+wzMjtQsKmBFp+soYsGP/zgsT/M3pmSBTuUPAW8T0QYGCI0ADQ+yIJJVPpLFKpiIGQ6YIjMQ6cShBwRcx0X/DL4oMnAr+EwGrFlBUhlIsBOW38YfHX+rxZON4LMTvPW8ll1f/8uzV6tQWceZ/Q0X///doi/yKLThNTXAFBRUdBw7SAlrMRCKl5pzGDVsWqvry9mEN/8zAp9QdaoRFSIFCKTolAlUxBTQC1VYoAFxqqCGhe+e2Fh5wJGAEuZTdhyskmSkiYLX5oUzGgS2Z+ABkUSmPgeC2QY4JBgWVmgwU1//OCxPMt2WpMFObyNNGR4pJ/zXZKEgIKhEAKmmGbTo1CsIOagoMeRWtJ2NnUcUAyoJuaemmojGX3hNxW/Cq+7gR9dNRlLcGk1qWBbKeExLbHbp9iEOkiQ/m8aFf/DIi2n/H1NcH1vNv7sqttzY1gKEQqD7wAGQ+PqRpjBcXH3qUtaRCBWNa2utVznewefviO/U4lVICiDALbjwcGU7wGYzOndAiGu5umEADjyPHIoCGHZBGFAIGiIdmtIhGSKTGEgVmCAwGSJqmBwlg1izBwLgT/84LE/DAp9kgU5lDwgwDREJgUZ2Z3F2kO7h/xBlBpimIcMJCxkEgQyDD4WLsUEIwLu1LGFmEEPu2iUS/VgaKG0843MwwtfBQrrCERWTdlkgfBXrYJbIe5HwEy4gdE3RAMSscAPHIOT+P3r/5Wqp5ueb04JJDSwuIjDzYX5A69Ko0izY6muibWsRxl5hPMFte1oqdbc4nH2LeuTEFNRTMuMTAwqqqqqqoAGVJJEcCiMzDCzLxbP0DU4gvhwjGJ06bZIRiAimGjgaBLJiIaGGUSYf/zgsT/MfHyQAzukPDhGDAaaRLxhIdmFmSaMAw6EWTjwNgAzmhmWIIjqCLrBkImYncIzh4wvQQENGXmdajvuQTMYNwuyGZvxlLjHObfL35pKdocIqY2YAp6ate/+SooYw/+Df8gJ67eOufl+7hvRvSO/mzd7+5hzGghrJF1c8+uphEcMvvZuqNNos3oziLfR2SlTqm4lhgETCABzWZoTK1Qj9YITN+IQCkBhMyZsAWhj+cBjYshkyDhu8CZlELZiuO5hwFJrcDhkIQxhstZvAEx//OCxO0scipQHuZQ8IpB4YNi2UCSnuZqMSw4BA+ZohijmCgk0wTJQcgUQQAjoOYCRpHFsQGwNzGDILANZE5K924zA7SmUwd7kI5PQnXJ0lVZlA4edaQu0RAcELOwxr1Lr7RaXxCNTmN7sks6O5DgBNzxxl/FzdXE1/dzc96wrLpvFbdDNXAXb/sZM7fX5vsn0X0bJ+rO1y5nubxOd13c0ZK1MJ33m//owNn09dEdy7FMQU0BOySWGRQAMGoBHdHnEJmdYYWAByKUzgUESVkABsb/84LE/zd6EjgA7tD1AD4jIgSKoMGJh4hDhCTk5YBQUgF1rugY22U0BlGk9EfBpDGy9qUThPxHWkG8brKLCU7DVXvkdBfoT2oZginyzOAilCaDFSGsnfviHzDk5rUuf4JYsHyCr0guw2LEZGoYl9Z2xTZIne2QNvPjDsrMRGbals1pWl6KgNqdZbUDwJMYhZhoaXihUmoIVnGC4oGWovGVlNGgwImnTnmD41mSyhG6hBmNJXGLaAGWQrGvoGmBpLGIgukoJmIpPGGJJmAQJBHsmP/zgsTiKZlmXB7eFuiUExgkCY8QQgAMwgWdiYUBAYIGdnmCVHMFjAULTiAABgIFCFz0O4NhN8QiT3hI+FBY8uXusjGhCClvjTVlNjZH2DE2Wcy1nFA0WGvlEi72sUR9YeCloOcP7DMkF9zIV8rc3Z1ueWVJG0qjmOvj7gct2hX7y5252aFl7tsP3ByFW/HS1hkl8LfptX/V9nhz/oL759JKlFmLd9+rDtVMBqqlsAYAGAquYPvRp8WnG2sYRRYo1jP5ZMTFsaO5ogomWRsZFMoA//OCxP81qb48Cu6S8R6l8BlyYMDph4uBHxCBOCCMPBJohgRcP2/A2aZwYIQmnkM8weRVcIA2Yxc1E2SJKmAJcjikqKknAeEmJaSgVFLV4SQRlzVUpYrd+Zmczfeho7+R2pHMBmHS9tY4UYpAqphyBiWG6XJCZayYAQLKc1H7SuG0jBWPcNpYsebd0t6TDTdBUvFmOuMKAr61qGBwIaSFBq+kEa+PnHkx0MzM5SPGh0weIjDqfNBDc2QJjNB3MYjsMDjhwMCrAUsAPigoMAqsEDj/84LE6ywBZkwU5ljo0U0OzTURlMlDSIrEBARBibgVMX3a4SAksYsBjaEpUBkLAjfvApxRSyKJx0tWIs+fFndrrBW03Gp7Bza89f//gfVjxnVQPWT7gFbNVI3f/P1Dx23KJXc9NfzUX9VOt98GWtM7236tT+rTY2KHfrno2/5jE+0ueFnyu/WnHSa0Fyf/hk0xRtbSovF0M1RMQU1FMy4xMDBVAKll5hUXGL4YDFsEzM86CjHBUMhr8XgRkw2mE2iksaCDIEcQsMTBInMBFIxKFv/zgsT/McKWSBTm0J0wawAVBTCwKMAhUIFKNZko5IzBAQC7AEvCjwkWQABR0SKKgJlktSS7EhZaIJC2rLxGHFJmTMQfhXLj3JFDaQ7EnclrZ5XFJWye5Lat7PPIAJASGGAXc62LNEfMAKnk59NEeizY13ofSYSKMAY/jMieUkNjUGPw5W9dt7GzylIubmfOYgGoi0tsNAAZlQYxaGAylbMzZF0+DLs72fgz5Pg+On0yCgQ00IE1GZk0VUA2DUczdpo76FAwWCMyIC8xTPkwvfoy//OCxPItua5MFOZG8BCvOeYhMBilMPBPBwVGgJDmDIWCMbSA1TCEbjB8RCgYgSBpi4MRhqVhkkjpmeIAcMpAFoYkSvzSUA5u/NTEBAbmKgoGEg4+MCQzlZlIkqCQcJkQCYKVI2Gjhg0GqU9AQUgFbw1ZkKB55p1+4zLVRbdmXSe7Dpf4aAZyejVFRuCo1GHGpI5ByqBEDo08lV5Fcuw0NFO7GGnEAHG2MrhRSl8DPVVlUZiGHXwuxs97bFAcBEfVrZBYoMSzVUTBGzXzASBUfyP/84LE/0sj5jQa7tE1K5c2WaOrmIpYf9J5m/u4l5a+OZ2t9O5f/u+8cjzf/NcNY+WfHxdRluIpgBgvGkYksoqAoYOGaADJNHw+M9T9Mg5FNCjBM9hSMIArAohhyHGUISmFM3mKwjmyixwJGw8wCsDK8+wHMTFygmR7BVQzYkATM1owMjQYAxO0UhDhGVn9tgCCmXBgYY0ESsVBzIUKH0iXfd+BBkDBhkuuvLXRddbBlAHYgqMyaHogYSTyqF17W60GkBx2QiuBadzDWMNNF4jHhf/zgsSWM2puUAbu1JwJepshGghs4YFzhk+v9+f9B8NPxmb6vL9XoO/U8JnRUqfBs4KEybTC3B6ly27RXcK9buounYbbVS7hkwjAgxANgxpMkylBwxYS4xOxE1ZDcSmQwLFAtEY7iKYpA6Z8LSaahWAQiFCEYFKAXRQCfZp07GBh4JCpghj0SITV7A0YiQpQiDCcqiBQKYMAYuSAAAW8YiMhlH5EExIFYcQ+jkDWWUGNBC9kv1abxYImL0ityN860NGBAxBci3IMc5kv0IwzGr6m//OCxIwxqk5QBO8UnBh5uVLk4ufmEo0A4mMiRCbm9X//y35X3zBuxkTdVBkQn32XKSG3CUyPBexSX58eviqKCKDOSLoWKBBK+hzMKgwMbTYIE7LA0GHbhmyhvHyakGVxAmGgOmFInGKIDmVgxGmniGi4nGB4MGbQijwtGL1YcFGpp5/iMxGBgQjKZMPLB0FDFBeIhuW7FhWn6OjMLhw52qwCGCUFkQeMXhh4n2BIMXsmsDgI0xpTTwE4oahyH06VjxQx4GGSxWKOJPuOYpD71SH/84LEiTgSbkQC7xS8lD25Vn0z/meVhAi9mHNXZ2VDZaEYTzCXmFywxF5MrD8WTxJJH9SZdUrQ5aXLU8hO6aF2+pIp6heo1FWKcmRHNlnipitiRJpIkiwZHXAdFkmKJMECIpYAqr/bkMAmYXquYmHeZWAaZTrUYddkbPnwaAhqKh4SkMYQhwYAAkaSogEPgLOZ2KqYCqiEsA/EYP1Kyhgi3IxFoYInuYsZmBEoVDyY+iQgAgKHnDXQFAVVxIJBzKvULAws0NRC4eng7DVGQmhBlP/zgsRsNQJuTATu2p1YUrEocaIYCMxqIWYbrxkyAGbrFKbHerRpUkzBBlNSXSIR+ozOsZp/PD2awz1et9m7I1XRfWy6Tajaqgy59a1IVoGoPMOv5BiRNrHxFOwL4nycdt5sDW0Q2738I8//5b9rQGBum28KFlG3DBgCDRjIIZhiTIZFJpsVpiTlBkcFglPZg4JIUH4wUBgxtBMxPnEwyDkyMJMTTgEQCIXPFAzZ+MwJHUvbqKt8aQGg5eIQ4AhKwyHAdFh0SBNingvwOHjIQN5B//OCxFwzetJQBu7UnMDjDx+2OAtmQxheBgI3I8678xZuZAKTcbi8WxigQPw1IaCe/lC9C88Jo3QxjGck6jIlEB6OgrtiSX/0X9THaefNsicod7S7zTnQ6XdDTklGSeqzEnH52XNj2mSNEmavKj7BQUJnLgfFZxqIexRyBdl7HQ3VApgYPGB6IAhIcoFZ4dRHATwfoSJtEXGFxQBDgZkAJiUbHfBkRfIMFhtYJmECoYa0nshR5U0YaFhx3ARjEMzAgBjHAwCjoqGrZWks8uybTXH/84LEUjLC1kwM5s68gIItISBQoNMtTnNNDlPssi79x2DTGxSHbdx+m1ekxoTlEZ48urY8WxmirU3OzHdf/6pWh9/VTdYruOg+PCM/uYwEiMkFBKYoTanL7URm21Mc66zBQY+y3alKUaiPc/euyNfsVRShIBADNGFIc2M0kb+su+P6XpSf6C2Nxhz/mdR2ZgHAdTQkkmBc2bYU5mQTGCgGr4WNpioSGR+kY4DBi4Ea+amChJga2aeBHTkRkRoUBbYTI1V/HODgEoBDAwVlE2KBaf/zgsRLL7oyWA7m0JwIbQko2p6POWllySpfCTIEITJ4ngJFtmxeuRKNg4On452L5ZhgdDVvKe3jWp6fwMBLeEeR8+ovYeN/VQL1wE0wV/9df6wrMMhbQhq5XgWEzklHwAQDDQRyA0aVeupQE3JpzWd2VLHECEjVB0MDR63JYRfqNg/25QgBpiJ/mDj0ZwBBxtBmKN+Z7KJxIEGBRYFS2RDwwsKzXbfJryY6Jmcoxgh+FIMMPzirEw82KBB7jPlJYyvzBQEIDhUDJhVeavBIHOhA//OCxFAtulJUDObUnBHq0pgGBzfxgOHYrEk4X2eGCg4vb/KpGYZgEiFatPfqV7ICEZTbuz29zJr9wcFMvuqcwVyw6b1MKGHZMWcjb9fXtq9Dk6qVNc/0JGeA0g/aLnhcgcDi5QvHQ/5BaOpLVJ92085g6tENVOyrkyobjEaMEYbNLJAy0IjWZWNQA8FAEAlNrBg8HmWKSYjBLcAhymFgkCC2KBAwSlk4hYKUhi0Ru4noHCovanWrQ+KHJpJmALRmXLFUjIx2GBcjZEtk8cKiDvf/84LEXSpijlwM49UqGXVQKcZhmg5eAXtvr/7gG/BgxfUzyI0e/ua9hmx5L/f36WbKHObdDBezqxqWLJVnuXVnflcWYdc2dS5RR+4q1r0VDySe5N+tdCk1vrUKTUttucqCqAAMGkzFVGPDBKaW7yqbluEZDw0M+xb9jBCCt0LnrJi4DQ7EXg+HaU7m8AW4ss7nz2RdoM2vgnttZeteRcNSRn2Mjtz85/s1noBoTef+hE5T+2oULyBPeZWpz3dVeYQOrTUQq2aWZUGr/Cpkad4D2P/zgsR3JZpShD7L1Ne7w/ml9SZ+Xt685yrXv1zXedu7+QWLzwecqftiBTdjqgEZdbZGuEwuXMUHjYQUGRxhfgZ4VArjBAfLRInLsGg2QQ0GNImxTCEeDUYZwOI4X2mfAYlLnXZLZpzuUq2kYWjKCGDdnbcxPiiniI1RxznKnrGo+YU01MLz13Lnery/m8f+6dPeYBICivdJnQm4n956nXHC8ob+9K39p8p7MqnrZjFHg53dVRRqhpRgeGkLQtC4rE04LpBq9CFk3sBMo0yRbovm//OCxKQqenJkHt6OnIY99aHuIQitlswrebEgmcg4C9jPpMzMMBZSByIt8FB4HGRhAaaf1hjS1oTuAAqYImPoB+GYwpDTviVF92gBUUDgCRS3HSYYhkapnMyxj6J9I3VnlK9Um+1KEzb1/8YnTKVdulj1MANmqS5ITSr1cElSak3yOQfuc1Bcir/T81D+egyPtTSY6yh5Qs4+IBVyo8VHoGOSUlX0716guseJyJGtq1MfDDikVJcskRRcikxBTQ7N/9oBUGFOAoPDwZwWxgdZsk7/84LEvinqTmAW3pSYDiSmowSU2aWbSOVpU/DAiUEDBSZyZhOkM6lGGCoxLFyrDPE6tZRzhpQFNc4wLdItXnaLL8BPcMtigDLITQaUClUoLTm1cspUFwsid5WYP5kYB2+Y7yB4MUu0uO7mRCMxmPGGJ1m9sYOTvi51aix7mxAe1gFfUL1LMqITzlPrUtN6qYoij05NdUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUq7dbKlYTWwc0ZXBUUcoomCaJg52ApwP/zgMTXJpqScB7Sy0hIMKF3S/xiXkYePIIzPRotkhkERANbB0DVhaEYYFv1AK0ETWBQPNsDZKPSD6NijJMA7MJDpMOF5W1EOVM7f4GdfvnsLRb8R5JtZa7LqCMTfNcv6OSL85OL2920P+dYxjHoRN5tGq/KEvt9zUPseh6pLi/QDLsvZMquVgZNJyZcRUhEXk/PLirVTEFNRTMuMTABpG2SAAQCUw9SzCKtCwYN/g4y8bTV4EOJHI1GhTF5CMgAwwcAgdUzPQQQXNGB4VEoySD/84LE2ieiqmQW29UozMEzJLNMBE9GouYYloXEipkS4ymLARciqo4NR+Pm3YXdZMHJ3WSkcWHIMuSlw4fWjDtfczAkvEhjKC4CFGUvp25YTDgPxY+wdmk54Pl/lTlzBbOOMb08Yk8xlTqRGdnyrdxc5tb3N3opQa3Ew82PhyonKKIud4GkULmm1oygfVufuczDraHKUxUKcTVKUBcZNIgZJjGY3ACaNDEYgJEZ2l4RrUYxgyYGgOY1AKYdBmYvLmYNhoYXhkY4gmIgRMIBeDCZMv/zgsT3LtJKVBbmlNTIpC0wGrM3ME/LSkwUqrDBk0/iYU6xi0SzzdWEEjJwgSFAjP2dG9AqxNIhE1FpLAxMJ1djTjURcN0gU2DCrUIhL2G35cncljZswVe+7O2KNsNHh//hRBniLCgqX0FGyC+hRAdijU1TV7K5C92nJ3Z0VuYrlVbOku66O+h1MWRBwkELAQTLm1LUWOp0trZuzBwme72hUYF1TEFNRQScbjVQwIGP20ZeG4ZKTQJfBEiMCK0+yZAaNSUFhyBLdmdEAZbCANBh//OCxP80Yt5QDu6K2DCIdEAgJAYHQFPzBgwUkswwwZmbUjDHTHBFTJZSgu2gAMZDj70usgJfAVChUZL7lF/cWoPvh2igWCU7HhGEsB/d1Gs/WxEcMYm1R4PjxLDZu5pL0Rjm+pqNEhJ7qplkP/27OUbmUIV7rOViqIbSSu6oWGNskOrI94YZDtPJ+4qs+kLnVkMMvdeZ6DQAYEH5nP8mdCqGo02ZADN8gOPfc1mGDDIUMtIUIQiEo0ThDJwwMHi8CDwx2GjDacMLhE38hzHpAKL/84LE7SyCdlgW5pTUiXSA29+X1OC8NCmWEKCcYMgLEYM+tqAVHXMDh0yFgZzBbkSqGb9ymLVl/oLlkva1GgIDdIxiJJp/KklcOzeUOIh+/jOescY/nLGPf//nTK+gSFhUd7nMMdh46yVbi3dlVzMpIqQp9t774kLhhxtQ9zHqSxixG0Chd9KRMYzH7+vkmvJOfHgwhgQMC7gYTEFNC43JIBg0aoJ5nkXBmNCy7MZoM1s1zzBMAAcMGGkiDQJApklYhB5GgAYSD4FFJCVBI5GX1v/zgsT/MgJKSALmitqFgMkQFZYKosHZkZZKCCbdSInBQwKaUeAe0iIMTVbArYQwHLnqk+cQuwYPDZRzkZmUcpQYcE8tDhE4Cvctqu3qPTHMHh4YCfflLaEbD5ttSdMS2cp21Lc/b+fySg3yEynw0kFmmF6xGlnql+fc/fv6dy/fdK76tzEMrSXPX+I/zVf03nfvAahcikxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqgA5trnRCgcBMQsHhmACYChA2XMk//OCxPgvKc5UDuaU1QgXyTCwIUGwEJv+Z6qUL3iQHq2kBQSjlS2KD4elI0auyYQiBwY7MWj6Ic4ES4blEuhVl6YxyY73eNK2+X9y25lUkAjclcFpsThp2PbpEB37vmDrEW9GHj2jpdz232H/tsZ2U1EZMo9KSzyqHOkmW0FDTEhgqkdlp6+TZuY22pTtYaEy5M+8uQdRTEFNRVVVVQDjcjvo+nguJxEYBhk36NMivTT+Q5xLAyyGF4c9hxoZpyGUjAWAQUJCEmFRYm6jMqAQAQn/84LE2Cc6Kmge3o58CmeEWxnyZZjGYKFl4VfqdgAKuc4TBxICZalZbSXAyupJKPuVxrag0rptTM+hvGgYGd6EZ2HCptQTGMs5l/0VtB5b/31+yJSr9s9o3Y2LvKanbLXm38VfDZ7jptbXXCn1RRPb34di2Hd+yev+KFzIX////F/p/ROFbXTcNdg3M7sRFLvkxt5u5SKpl8mB4OmTUimJprBiJmgZCGPgYGdqdGtpBhwVGF41GKIGBgmmW4sDxyCQQJbhjYMLEwDdjnYUyx2L2P/zgsT4LzouVBbeltXcSK+pkHDTVgyIUBgOv+BxgYBoIY60qxuUhUDgtnQyYmchU/FXPn4rL29GkHkssxRhoUAIQYOFK5txiMqH0lqDVW8+DEzmUDQWJOecxENG0GTmt0ohp8RjJjvRcsvq1Z1CMCCrQKFKSbQMLpNOvMyjlmqRzXKD61BqfO34uMU292qqs60WPREwO2Pm6gDjbaAFLw0k/DKaONPgsMbpjR0GUwceDB5lIHmHy8YBEQXCIhf4KBY4QMqlHEpIbAecBmAKuKKo//OCxP8xkgZIBO7UnCh5FIZE3I1yExI4tCzROhb6PZl2jutbZqsE45CTCCCKivFL4cild/nTtvu5cHqZsLdQgJxepfjbCKejhhva9PPp+2MBDftDFl2IGoRX/xV6HCbKXp5941Yd61e7XKfzWxrV9ZO15d1H+bu7Zs//vW6ZELCf/W0Fcy1B53299aWy7r/ee0feZt+31UxBTUUzLjEwMFVVAdf+2zvGtrBBgXLGxBAmEYamLvgovNJSDixgApnBAQyGhSgSUI4XGkxiThmx5Fj/84LE/DB6LlQW5pCdWvIVMudstco6zmAGfGECl/jFA3irRdgsMyW40IVIq1Sm/S9gaU1qe+oSPBrDXHKvu32chyHDNutqzVb2pPlwZcWhR6v2GymCRnArLRf6/HcOFtVW+/lZ455rVZXRxAaHUncRAUQF1cFxQ+CgEGtBhqToplU5tD63q3i/SxqKhtZJTCDTd70aSCqo0CYGDEypx8wYGk2hEYz4EoMJ4zyWc3MHgyAHEy06Y06EMwcAAxnS4wIDww2C00EDIwUFoQFCYwhEMP/zgsTzLcpSbB7Ty2h+mDr5ioqXhNCQYyvEyA/CywLEJQOocjNWxZp2IIIQ9NtKoaS5YMBIOblJBiCCp8LgL6vQkSGJD8PcmSWfCk8LJaZhhJErQ609CEvINiQqeJ1y34cv35qXSm6o6KAMss5V7d4iy0yiE8iBDg4G9azWyyNN512faeVv0JrEQAbUBzoHBAY8TjQ07uxBLCzHCpg9brDCsab9Ta5FTEgxF6iCgGHuLwCttrZrZpIImXSePO4x+IzA53DFCcaBSLZktnCU4fcy//OCxP83ufpAAu7m2KxEnKHAyaVW0Ct0yjPPDTNRdHCzBkHSYAY0cBgZWATVYWSKWUmoCNYnoJXZLW4qTiggOIxx2W8lzOfznKclTJnQaOgzNJzwwaBoAZhTUyqDqScfRyLejntYMKT/1svMD9X9P6CTMp0Z9FJC6K1vVdjc2d3OokH9Xm9etytP39te/07O7gnX+/+2boUOX8zP7EY3DBB+PNX/+QNqlFWMCkQYy7oYHJiZhhWZDEkYCNeYlp4bpCOY1BOZgsGbLDwEA0YaHKb/84LE5C6aWlwW5pp9JISmDALmYowEopmBBOgI8DMMGzFpcjrzhMwyRbWFW+cUnmaBBEECQyg2agChxkaKyoXJ+IDjDg8aACUTHrt6TDzxWSDldRFSgOMoe41hRExFQMyAmTDQpIt2mekQBqEjpEHH9zb740nb9/ijpa+1huvU1O5/dIAdp9PIf3/91Qz9XAHVlccfJ39z/16xZ0qqOl8X2SLhU4ybhoY4u8Dj4ba3PsF5kmK+vlROtrWbzBUmQe9ItI1h0dUArb7aBlmHfsnCov/zgsTtOFpCQATu0NyNwWKiAWbGcblGzYVtggapcYY0jE4psASUAUIlCUMcmDoBhidC4C5GQciQeXo6soGTERGQUpqSB1qw9xcMotoxjt6o94WXZJcEycfe7621MHbe2s2rikFF6mHvhUJzU/uc7OLDx9EMXcYcKmkYWLzZaoaREgmE4fKl2BNAu0JImxw6XUUND6BcjgzQGPksykc4DCYgQcXaA8kRFXaTgIEZpzrmQ2CaWDxlsnGJlkaVKR5EOmSg+YlPIKOYWEBkdBDxMFBc//OCxM8pQc5oHtPPKGCS6IhcFRmClwY1FxlEmgaIzxgAHwUqoeBIMrBSD/MVA3YmAdVawGbhpmPPAgAJhxB1s+E5bbshDhcjlIMlgoybC5sukN7S6al+NkU0v1JMc/+5lKVF9b/8Mxss4YgXEJDbRo6ZjM2b/f21Wj1OenPo+jsqN9Ga1qG0vV+axNRuhqszTDas7WW7LfSaunb3/Q9VXdKLITiG0X/VIPWYU2DCsRjL6AjEMbwyHTCIHQqkhCX5qiKxi6GIACkBJePCwOmeX1D/84LE7jGj0kwM5lT1AC5l2KgGDcuePIyYKD+YHJGDDqmQyCYNPmVNGEPBwROFshg/JYBnfIFy3roHLc6Gg7E64NCpdx2QRJyFa7NWlkIgJmIAypKGLUMxSLS1C1ZUIrfL5dfdRKAGpz7rPJmnJMSpyYrvQS1k0+g9SWrDVoyGMjc9bWJ6xKV0jFPvpMjiIEaHWOff+7bo4XWupxc2lKUAr7ZOAAw7OwNqEx99AggYurGrTpjR4LKBlCkGWwGQTEXk30zL4HCEQAGTLGjsAjFUDf/zgsTrLjGmSATumtRikFljCBi6hhATCSLSuUHHH/ggDIRokJZG0sOAjgXsAwCDS04hEolxSWSyBmXYXe0Cf5EDWOIQE7SSjFuN2/AMojFE+4jB4QiEAMAKZsPDhQ7uXDIJu/y5Z5D82HDIMS+Sz8dzM/FVNkITtjW4BqcJXqAiOGLHSiqLbI8XSjsT2aqHMF08aKIcUQDhYhAoQCuYV76YpiAa3BeCBDMO0nM5EPN3gkMuQ0MZlgMOh8M+waJ4UPVSpM90aMAiNJggCwxGPgYm//OCxPYusgJUFN6QuAqXJkIihjqAwECMwcBUwSEkwSFc1lBMxMFMmCRCMAggAC+Dixx1JjwC3UDn0MkFBqQ7H8xAZAwSPp9U8Reh8nWVVZGYMAv4zgsHCgMXSKRGhT/F9GAy29JpcjqbZMl00VxolJKZjSNUTjDtQQnMFEpEe7Fc4ZXfnqVWt2JfSAY/bh+MyRPadv3YzaxkvFVo3uvHqSI2pV3djLGtDaSE/rHLPefNb5h+G765ypecHU/4eJ9oDBgmthGI1T0//vtvfnORgHL/84LE/0P63kAU7ocd/hUz+KoIKFGZ9Lo8W7uF1kIADX+WVBQDGWgeGRYrGUw9mC4GGDhSkIYGigumEAFCAnjG4LQSPBgbnRn2JhmBabKaGMjBg44GIBiRkYPGGcAjhjIMo6YIAHRChaYOBFvtdBRULDIgDIZsMcXkxZEMXEn/EA9Iq325iksYT8cTsMhBWTKWxKmqyhy9WNWLN0s+S5bRdzg+BoJutMjgIQE/HXaT1LpsP4ccwjwvE6kNBEzNkC+Zng/AgpbQJkumtGt11GIqkP/zgsSzOKLeVBzu5pxtl1OjXZGtepak0XbTd1tV0nVUlNVMu0rjwy0SknOviiRTAJDKPdrOEFYhY+RW2aoA1GLAAlULjNXBDKpDjHoaTDUJTBogTHdKDIYiw4ZzCcaDNgExgMDeeEjmQTBoFPcLDGSUcdhJlMbNTPyc4wPMbACoiuKKip6ZODVcMFR4eKgOII1hxil6jlp5wwSycwUU/3AQATGjkoYAbJi6DfyyH1mQ6jecstXHSEOy2URR5b0hic3LEpyUouKalNDIOvBBeFq5//OCxJQ6KgZEFO70jJyYILJ4a1g2J3u187P3bSjqeGEOzFlu87r/1rem4MckNzX1N8y/+65JHNBHHoh4QknlRd7Br1OS5ZW1URU9CVqSFiG9VBxiF1Q+OeSHiVLRzRYeoTUAqVAIIMfDM5/8TgzmNOjowyLjJDGNSvY5yDDMxRMsn02oRjBcAbMLlN8xGghzA4gBqDHBSYCLwkKwMCBiAmIgqFgEQlxfS3zTAUBgMIgaiXAZjYVBA3Mdg5BdWVMQIB5bMLBY0MZy+ABHaeLkTMb/84LEbzn6CkQU57hgJU793PTWUZx4MsRLVyNzuR50olqIwv3IMJAWITdjGe1QME3SbrWgQFX1tYZPhdv1MOb5XfgaCOVPhddG/nqxlq1izxzLff3vPu8P//bBCaYYXDILEypYXeDCHpFDpQwfNLU8mpNa40i79QeyyGKhx79bXwVZQOdFkgCplrBjsbnAuGa7SgljxIXmDW8BQILtoymPzHtTGlYPA88wqzoIGMRBo0uOhCEB1WHi4wkLM2WRKPZIYCtxJuxz4qYeXlrVRoyGEv/zgsRLNGoGSBTm3rzoLBAc4rU27ZfR1ACGHrhadZgw6RBclmbEpa1f5TzCOhECW0EsSjHuM6PIU9ck1UDBqnx19T6d/f5jjFhQGK6HPrbDTPxXco0i35W69SOW4daQ/GKhAT5z97v9Z/oZ0wMlSCwxc8wpAwVExw1ra2QchiRfGNwI9TiixYTlTqXuh0drR/S6YM0AG/65iIwAjDzEBIQMjgEBAIs0YOFYGNwcCSQ1iwnC4QMEy4YBSIIuA0oZGHh03BRhGKHBxaecABsISYjD//OCxD0s6ipoHuZamdULhq0IXyrP31jiBZVM4lpB++Zcw5vK0zCGbT4Gq6i9SMSx3E4WtVU6YexHQtTNGb1pCRn1qGZBbJWrGoWqLqspN6k1lEOxTMmXXzYH2S4Wfw1PdrF2wrPxCGNjFzZY0lKumt3fMu2/j4v/5n/t+lf+aSxQ8S7iAD/+2ka+TopBa6PgjCBwaZBCUzgAFIjNLwd/SoPfJBXktMMgUi1bhY03UGgm5LoJCM9TmbCttKYxDpIVdtABykpIP1DIGQxBVKTRi9n/84LETSmyEmwe0hto/G8sKkpdBe8/Xb4fQtccDe55fGmv+4ckINckjbjnDIAaBsKaRsaMhUbLYyFD6u91iEHVE1ecWRGrBE6s206OaoitFhkRXqH3vHgdEe9xFj4FAK3Ni7fZ5ZA2ABkklQ8L7gShiMomcQYYtA5g4TiQaM/B4yGRDECfNujYwcMzRF1CEcCpxbQeCF0DbjASBNwRB7tJEwCJLRDkZg8IyrC3aZGcKIUPzCA5XG5Y4kteU2IsFAjNt2gTuEgh+mcKH4q5Jm16bv/zgsRqNLpOXB7mnpgzZpMJtZNua0hoM8mUeVCIsP1esSLSzq14Om612V4YwxGCvz8YbSkjLmsZfxbN4u/5UBvOs/6xmlL5XCbxTX/zn4+/SBPBjS6Aq5BwdX3Bg2NL9trVhF4reLUuIqWpLItVWxaDCTTImDEFKySSiaIaxAAnaB5MEU7XMGHQcCBUAXhrsMc4HjyuR4LhooBv0KGE8p9Ledo1N4pbpcS7Uhf61qzXym19TIgBv3T7x+x+qedJArj4Vvak7/FQ+RmUwuYWvvem//OCxFsqwsJ8HtPPbrG7H+f7T5+QoYbsCJ//4CN7hS6ZdwayXe7jCdjUZIk8SSlWL4gBOzJaVXnHDc6++589Oht+/3UsiswZU28YyXfteWUMKhiTTHvjUraNID8VAAkskXsIQgZXphjojp7mGQqAgYYdJBgMfhYRGKsAbhDCD5nWHGQgQWyMHg9WYZDYsVy/hg8sC6C1gJJGocN4oEjvCyVRsL5xxSMgqSyAK7VAOa4hhCEVzpwzldleeUfhwQMiZVPL6fLdq3UvI6lAnOustK//84LEdDDCjlwe5mDUcxEpGyL/wliioM3WUifYroTA2Q2dNAVkdrsp0FKdbntQ9poLVqU72qJ260ltdJbp1tqM2pLHIvFcP6WTAJIFRoCCuyGmLf3jlYorOPkUHgENdtmJJ6mU0JlCKYMCGSBhYFgaMAJfAQuY/uGJCwYRmW0ZiwG19EJo4NLQugkC1h4tULmwzEwEujy48smkYVPqFT0vpLdl9gV2/xC0y6zf5u1vKvddwmL5MqoopKiFAgC1lHpWMAuqSS6zHrCBLLfWQmRqH//zgsR1LGpGaB7eWpkSRSep4RJBSTQdVS2vZZHZ1/brk42t7mHAnE3X70ZncRiLkq3tTCv4Wut6dv5bs6/f50b8JtoJt37v6166ABklkp0dT+fTmrweMM6nICS/DgmDKHTTsDiCEFj6TxsugECDrNRQvCV1gjSWbgsCQvLoNDHejTLW4DMryAx6ZX2kd5R0L08vMkxGJV+cI52U0BAgSdnJLPeTN3K3GChvPh9JepRkCybsVNogbSGmr5WZUM3PVasQtB/U+rOlJdHu9dKmTTt6//OCxIcoUkJgHtYa1J2u5ccZLtZadm2kDxvSctb69y0ulT3tbmGjKhbjbboppGEWyawKYTCBp6QsBmHgBWEkpmAnUHAAgkkqnBQPawOA6cE0PBI8RXi3c7JUnUn4VUmFzvww+gqxaBbb6BxTOofvLrDdavlrOfLABO8p6+HLes55sScOF2OO+qcCVbqNmXgbQ41l1OtcxFFJFaZPdqa00kw/p+khT8EqwGixKxQ6KHAUHWEGuuQ2w4xgRW1sNnXiFYxhEfWgSxbWJnFzuoM9Znb/84LEqSsiJmwW21GKHXzBOjFN/9qNzAWPEoIdECx9WMKB0LAcRCkcu4sKGQyhrC1KJUouTBGFEC5mVOmJ8RXlOQNO5koVXnc54iHHkgACu5BRqt/rd2m3xcRYk8ZthT5fRmvinKnFz9brYfhSfuTW3D+LdEw+TByukqVv3qcWJb6mTfME5WWBZCZUewHhqBE1ikDcypZga9QnFqHKdUTe2svrv6JxrGZZHihOAP+kvgYLzJXLMxg4HLAzSSDGJ3MLg41oZh5RmOHSZNAhiUFmLv/zgsTAJrIGcB7T2wyThUMjhII+F2V0h1EwpMydoTCRQxItt26AUaYECjlNuIClA8fMEBf1QB2FiQi+Y0o87OUs2tvi78cORoyoJEGAcDDLkOA8KNEzfFPZdVjo/2xbXXhAKfX6ImpSxZmNDh6pjHhKvc99yRtY37a58tNM31ve/9535ZnPWo48oCYFTUhcNklNvHKPF6AGhq40Dpv6n/VZ1f8dBAlt2aaWSMzHQzaUDCgTMaB0BAEwajDistEk0VCCZhDachhoREwDOdI+cUrX//OCxOku+gZUFOaelESJkCDGLaJUJ1hwKRUSEASpVfQY/wNMVKoVUlEZh1qMQDEZxbDfSm1NNyQl1O37MMoax0CPJIyF/7N+/ZKgDay2tSHzIiKUBei0UX+IoesXt1FynjCCYx2KieWhUSiLoYOoXq6KppZdTjkRX6HspqvU29PRT2VeifvRdNnT0U+h5xmiq81N92c13s7x6uL5zvT9TmbHmSKaTEFNRTMuMTAwlksAhQLGh2cZOHhgUBgpXAwaGMSWfrAZVBJjosGcweGBwxL/84LE8TFDkmQe5k6dmZAYW6MTEZaypigKGAwWIjahuzQqYeh5iqdYJTZ97C/kREoIBvQC41RJ4S/LiqajkPMI+HGt6pqztvnVNYVQ2s87uWKqTB8td7DdlAEV3miSe+wJmoM+OjjLv3cTtV/p1epjftTXGgSYMYHbQFce8iKmsfnlSRddTk1KrFzlT7pAKpeSrOlZcwpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqgQJvt36UBMXgwcMDxUNIv/zgsTnKtpCYAbmDtSFxgAvptooRBhiDEJHSQBhZWrlsggnDjPGoq4BAShfSVMnuLuX2609jE5C4+FXcYqtkXhZppzD/vKgvf+MExSZECXfqZ/W12AlxfvPyrCPyeg/H/HRDE1qPMj49qMVur0M/5p21KLh0SihUJSiQCZIahhAkdFAIiT3IvZmfMF3yK65JciYcPpmKvvuYZCxvRIm+xACpebfJJECjKWfPiQgymLDHWwMRDgABMz0lTIIDMNAk1aCDBoHEAcGhyLF4wQkij0g//OCxNMl0kJwHt4KnCTDYI+4wGMgAIPCpXER0jAwoCbZhLuuW24gdGmKt6Kk1q361VuRjRuViighVNTV4gBSRKgGmxlOEaf8mHfSyzffyej4LYFnjrdiRDXQMhaMPC0vGA9MEoyVe1yHPJl63SYbOUyY3ojncs6CthSXtaJEHTEIYEXvsQcHRdItRYpj2xH3Ac64S3NFse96iAExEMgiiIwtBIybBcy+FgwGI0iNEjekw5AQxDSY0SBQmGswQPQtEQlTsXkzhk4VmgVoM/uMoAr/84LE/zGCQkwC5pTaE0cl9FgWGBxMWHEQPgGOveFgLWXBfNnjhCNcEn2tggKr+H4bmFzmHGP/RS6CVouK/IY/Ihk9UlNBVh5O9OK7hItZoMsojOE5NFNWTU9xjKQHaU+xkN6JLHqCXqfNldbO9T7Gj/V/NjzSVoNHWn1MMtyqmpPWMvYRKD4oKpUmxVTFpQKMWiTNCG0GWmFVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVRCu1rDk4Tc0s0YdMvADLT1VUhkDvFcFJ//zgsT9MVpCTATumpwY2Ih46RHAbsOhQcOpdqBCFFUmxGWkw34EEhuKMTdVM+XbUOd9iVSg7BNxAgWkupoQNnu1OlAt7LLCIr3pwsOBTGhpYZlUDEgxtMoL1F4WvQw7UjNS/3kbIc39Cb1JO6NKFtZSydIiWKvFDJesuKDEiF00R2rNxOBCZIodHbmu2LTjlGsyR9oXWkxBTUWqqqqRts8MLiM0xiTGJrMRhowInBCPALQDZI9M2B8ybKwViSIQmJkmgLVYJPsmAwjSepKwUzWF//OCxNwoKgZkFt5UfHPIU4ZUsRmEJQsGyeWtYcsiJZSjww9bU6SSGwTAAhQjkiiEfSqL/wPQUkDrxUqlQgedaUU8WciQRmOscsdkMuPqFFjyGj7plFxxtsFZ837f75LIKb7Z3XPxf/LZ6TY+jwIlHigKCx0FgsBHJYaUA9kOOvOJ4uCpbVKoOjNrTBiBbYuZo8oKEvfVAPqxEByYHGhrYYiHhk4TDLvMjEY5qSTuYuNYE0y/XTCh9MdDw29jDdRKMEBYykMh4PgkMCE9G5E0Dh7/84LE+C8KAlQG5la4GVegpcLCjMBhpEaVuLJ0NQwkgLEBgEjxjoA+gklMomJQZcUZZGtcmzCpjgAIwwIXmWOGweREKAi569hZCTRTPg1WhwpTztKtkxoV4YVch9GYuO+qhShNJXT6aQBwBJrp2yxU+hhK0+zXI2lxKgIaUYtPR9k+I5gOBuPlHOHG4oYLjGeUZlZB0yo+DAZ71+q4fFWeU0FXw8PD/Yq1tXVpY174/vDZ8+9/v5tTWM/cOb/fvD2gkn5r78Z3/POyTto9Hf/KDf/zgsT/QbLOUBTmntX2pnfKyxO2ITLvmsCZSuGVFIGGDNTAzLoNfSzlyYBIJjDuHPYYQGk25owSLAIYSxRJYMGjhWQwISWM8LA5ctIdDmsOX2TJ3jgQa4loUvgpuzabVIY0RWmExGvOsaBom0HdNJZUvgWHaJBDN2KaUlUagerat43pKR/ylAUjk/GUITuRo6Np/7JJNaQqVDroLN+b//Gv+Nf8a5l1QaBCI/k78RHpep0MnNOqf3VlS3RSGsZWRNFdUtd+sXZVS3rESx7plQqX//OCxLwuY7JsBtrLhFgoKCkwmuTCYXHh4ZWCYiuRpQtmWBkYTBRMRAUxjEIVMnRUziC0qjB4FhhWwweCzKSXRdaRLFSKdPmWrmInfh5uK1jWYiY+3dTRkDwlUw1pY4wWRTMheM1zHDsV49Il9FIcWQwvzVaJiNuHN35/fbAnKzlBcBgL1U2IB4TPMCicRRfqaIsL8fMpK6DMl2oee//8qX+xUvVKHlTqH7FBqujaXroRkxyQsgT6e5QHeEZESPHwVIlkVGGUDEZ/wAoApvvSoSz/84LExi/atmgO5lUoSSAMfBg6RKxo46eYIgcNbAYAiEzcMABqFUBo5bKP1O7aCxiLJK36jLL8adOicgepp6FgQFaPlqSzOb7AoyhTYKPdHDo0Ov9bs45Zg4EomvGjLWAZGbnXsPrqOORw4H9Jug7l1/RkSoSgksxd1aph7ftgx/wg7aq4MQjua4QdF5oV6NIxRTaK8LI0htGVUw905BSOh76iiIa5NjlVGkLAImB0BWYABJxhfArGFEAEYtAGxhNplmQcGAZCQMpgggrGBeQYDv/zgsTKKFrWdBbcBWwO4wfgfDGbK6MQIDwWIwOgiTAJDpj0FmW/eYLEDfsvDB4zowGDQEKwaIEY1qw8WAkBQ0dRgJa56QMNgwDI7AQCmxBwhCIQU/C0pxE4z+Hx4Avo1xj0lUUMOllu4iG78wZI24GRSe9U89Ln0ssWWRQiai8QNZDgVSQhpdzEdpxlDcEVMxYieS0R8mhAyq7DWKqaJWWswSUYDmoVOf1N6mfTfH53a0zOtUiy2UbJepy5jV0l4YNOn1qQJWgwVfB6qwRgVOwD//OCxOw8Oo5IBPcmnDbHaopQdbiwzNDI0yyY7DDgBDL0kzD6xTKMwDGEQzCwAzDM+jFYJjAgJzLN9THwKRICjAsGXcEAmY2IHQchlYIHBq+mdtHX2gjrOG/ElSdFA81y2LuvQPBKoZcOixiRy4Cgb8RCgWiYQPQbTT0HWFGwuSWy2DQ5NSTBigg3GxJcLNeC7WGsKvF5tpz9c7bt9weLFh23/nR2Epb3ral8/GX3/8L/9Zgeq4+BcWRdIWs80WqXRCJKtk/dmy13dRHK0MRMpJr/84LEvzPCjlgG7ta8hXENJrxLiAChl2LNIEyNLUAFtrrjomZPpkoQhaY8bGwG5340RqygRiJUTVAsTm7PoOq1qBgNTpOt0AWGBgVdMskcvdxTpYCVwLx42RABPjEQYtL6B0gFp52i09irHC2so5lT9iICLKFzUm+aGhzU7978X0Jl0g+Jv1GjakCHfOIhqlhLVEMToqe99s5BGJG1dBkHxdlOZZKbo+SMx2agx0o5iv7TyN9aF3uMOttbSSqOWM602qdbjwuIaiAAL/7xEucYg//zgsS0KpLSbDbeFShhi4UoGYCXmHXgZPA6mM6DCUtMuDQKIGCbA4CDgC7MmWXOmfIoBD3vehwJHAUpmq0YpY8scxkqh+nc3WqhEGUXJ/edcClHiUgahggmc7U1PvAdlcVriscj5gGi9/HCKapK+tzHx1zD2pzCLc89nMbQ4KFqWY4bgw+hprFDTEfxuz9XKLiQPPnnhpzWkSk8suhlEsprVtijvZDQiJuRcaoA5tfBaDBiUMJ2GEwmYJJxhtuGIDQcUCJj4cmDDWNGUkAxmcJD//OCxM0p4o50VtvPRMmTCwXCgwn2ll4DDKKWiqOFF73SkTKVbJVYa6BAMhgZGBrNJiN3Y0xpReBJJLvooqhYs+pdrzkgQhfUWBREAYXOSpLqgvtFanapY7W1mOB50V+UDvURXI/w6g6ICzCJlE3owP52R26RId+FivRzCDKnlFmZnc07SOrsa93E8Y5MOFFsZmZPI222ePQQQi0scVeLnDZuTkjcgUBDAb3FgKLGYyUVTM4LN4Sgz4RzJwhMZskwKAjBgJMQasLCcwwCzBRlEAL/84DE6S5y1nAW4guAkRTBAcxvhMCIggKfwMcGwICgELIdok7LckWg4ADRtSbtsipnJIQUxMGn2vRSVRRuxedlFXONRaCggrWDMATZ6HqtcFAsRiyLquqWsxC1nzCfpIBaHl//hLwaficm4hFjdCI8jIPHWLyD7mdG/5Qt+VTzUKN6NFlfU1kf01ZiDidNIqFColzl8whSFjtRrfV2aFlkgSof29MRg41cTBJfmVQQbBQxlH/mlrcd5JRg8ZmF3+alAg8ZjgCiNjhYwcCTKJ6M//OCxPIw0spgBubOvA4BQAjw0NUOgxuSgUFIAFnW95gMGGLgTAjEGcPWDTOKgs1YYkBrpqWwK0oqMkcEFkoLTYYt0IhSRlp7Mgi7cDaMfw2thZqdn6xijZVxQMaQgWqvZ+c85Y3GfboqLHv/nLaDn3YZn7FFRf//UpaeQhlpmTQG1SNz/BDfhffDN+CC/0/kZbX7X6tZm8ws+0cInpUwyBnlRHkqHmZcxws17E3ItssCgxXDAAETEYENUDkxFjTToGAfDMaAsZFpqcKmFxoZfxD/84LE8jNDGlQE5kUwY+CBMEwcwUUFgA4MmnQ2XNFgSnuPMG2v4aFSBTQFyqdAYUGDwMZLNKaXELmpTgykoDSkAXPsX44YAjcpdMWrbMhHGePMHtgaOVC0sT28JQDG2z2eXE0MgeA41eo16ZuiTyz1HUjiqbf6zbq9F+oqLPWyH6zJN10LuRx1lFin0WJ2oPR5a14EDZKTF0WIa2YKkE83R2VMC5ZX2Lcms2JiR2v47UXNQHz07E+8mGBoyhoJuoaMTieEBYqKwwnciHF5n24mbf/zgsTpLmpuXAbmGyi8O0ZyRFiHhIY1Rkj3wUBZBZkzNZjMWVAySGyAGzuksQ/VqzYsOBRDlaa1KguGd8QKZfKoZ6ldZvQwrTrKKFKyyEeCCISb+YNnUrIfPonEZ1639coLepJqvyojfqbblSat6JmYLUz71q1pscQsKCp83CAbHg6WPkLr2uztm44MDdCLj5hIQsew8kxBTUUzLjEwMKqqqqqqqqqqqqqqAaS3P4XXM+czJxMMITcj4x7GNXjTchZAkYdFAIWMOBzUNEzsBX8Z//OCxPItqq5gDt6anNhT3OsCAAxucKAFFvRmQDO5DQW1yHNvyASEaEDRi9lj0MnhuySgosD0z0X70/HUVEUe4ze5cGBM0DAJtpnOrJu3nipdYQYe0CawqEb9uJB6HxTysQ45EypXoNbQ+f8SBfxAd+ID9uoL8r7dHQcyStSULqqMGVZY86TqiEXjEIDBQAE5gYfc5McmLji2QuFDDEQMFgsoMppFHmM7UY8KZ2wLGURoAYAZQCAQHjR2cM6iQeBZnYHM/GAQYSA5lGVgQZLefIz/84LE6yvytmgW20uArg5vGkBg0RCag1JpZg4ahATNQh5PKbTAbPAJUxBI1M0qDorEoKR/Fx5+5DE1HRcKaMUZQiP0kbdaSTM00Pu2q/r+uhSM+hGf/+o8WbMDZocW9BJFYnLSmifUXdPp3jH5xbo7IXnqahyH2oxi0fvQi9y0ktCxKsudFIymR2o1tP0ugYQurHObD5k2QRVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVCa7XWk6AM1BjiYYBmMKxko0bQlHQD7STCzoegAMaO//zgsT/MZrGWAbmTyw4g7Q7RCLjzMGeHQzGJGKtlwYtylKG8rkNZ9hgY6wHKQm3GZDscArtkElx1UzkSmGeF33xEgEpJRJ1THwvqZ8zLWoFuiUzQdwUjbskf6Vyme9R02O6mnG9blBugv+gxGT1Z00fUigcLVQ+LAwePhyeEriqEiXXdGKeN02WFdqLX2LE7e0q7PFByk44vpFMxi/TD4zARYMdLUyGzTTy6MPgEzyGjIgEM8FExOJDAGDMOAAwiMTKYQQPHAInUahGpkE4mUIM//OCxOMp2lJsFt6afAwicNB2zAIgmUtxjIjMGeSAZOeV6kNIoeY86INNmfFgYUBCYKTs3edkjQQgqrhWOMNsZRYYYCpsYoYoFGaZzxoFJoUm+1qHdQFY5UqwDQQC9tfL71PyRXbkrWgySpFeb/99tT7Owms7eUwn0Y53XznDP1He5FHqGvSXdJD3pFRjxSKDUHDLXHnJj+1I3muRnjhAkwNB1yOWJXbLDI8CzJRgMYiAxIKzL6CBDrMcjI5+FDEQXMlMoDXgaJhogbgpjPwYcAz/84LE/zT6TlwG5orcnMIwsXbNFHELrkdHtIA1GDG3BJOB35U2do1IRBCYiI4tKpF/H7FCJghDZhhwLFn1hmlZcGI3ap2cQ8ika4FKDBjmmUNBbVLM0owPJgGO4mVNSJjCDh8Li0XWed3QHsCIYF5nfWcNjmt5365SfnmepLyss90zFuiOw85u6i7bHxfiNs0nSt5Gk3zl/EjWp/Yvpv/Z91v/zv5f/oc5XWrbXqv3akxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqoCrbbuBRC4mP/zgsTvM1peYAbmmtUOKahIUBM0cXOk6QwlY6hLtEpiAYjTQ8Y7iOCLc4r7m24WbOplD2NF7bHKPv1XrwZ9FKm/RJ2kgIOCkxB0WsZY+kHb86d/PcWYZVGLfMF9T1fzT0f6mGcbUq2dGndotVeQddBCpW5is8/3Szs7dm6KyMuEOM04wVF2udWsNKAhQ8ONkqxVegpWPm7TSMMiUzvNQEmDE4JOukwwwnDY8dMiEgyEaTDObMrBMxuKTY55DJIiuPIIwCBhkDGLQ2CbeKSgBH4u//OCxMwkMyKIFstFVimVgq/gsBwSS32Q1YnTGNBsNFM0WUgwLyJdEWfwRgTzlnzLvk02Tu1UZaLZXt20SBRmWXAlY0tJgd6ekgoHmJYOixpxLZQwi1d5Nth9D1Lalua79yQ4fiWAaLNA9E5h/5XJiWGvECIKmRqKUEJn/3UdLZZ9IKlwNJkBRyFNFX0B06gMQUNi5dJAgH8053Ulg59suXJIGnoGDq0VTEFNRVVVl20MTpox+PHwQNnDAhgUUYOYguMJioyJzMZIwUDmJWYsLwH/84LE/zVaDlAE5o8wgIccB4Q4OM8fjIzoM8b8Sunn4IGILh2pBhi4JqBvLyQZDb81GyhhkhIA3VqUuLpK71SV7JAOjTKBGJINc6wKtnLSYTHuZbcgcYgyf5QnfB0cQXt9CXo0r/Jv106kLfo3kSP8y5OtKrjJeQEjlIeAhCrLFjwiYcDTjLXjKe5IefCyyrAEEiKjMqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqghdLbfeov/zgsTnKtpyaAbeVNQHIAamBpxCoAABNWlTsKEl2GIkiVHHrrzMnM0EhHX7TNWq+o3hjjgtMdgEs3pJKQEB0CAp2rJ7WxRGnGPR5RzIkdF+XqAdMmrrKy1OLSRFyKN9yc4nqf6in+voJq/RUtoE1UqeypqrTPzclonrW72o8Q1Q/Gzn/c3WspO/2DCX7wi3e/afQM/blUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVR3a7KPk1YimjRs4EYMJ//OCxMojmr6INswLF5tLQVPhxoQ0ho8RLDV6AggssMBNVW2qI5BMgjl68SYHKIQVCD7y2YmyVKvMxxSI9dWk0kQW0djNa+rNpDK+DVkHZoWlL/NCebufCz9SeVUKA5bypnELRu3qebyuU/Qr6vt6FfRZRs4JAoo0ibWYWgismsiRAp9y2pTEBfWlNtrH/S8YMfvsYPHKDTkECIFmAGmCROYfABjVTmEVuYwMRukVmMhOOpQChwwKMzR9HMzm0x2GwMAS8AJPmTCn73GQPANWX/L/84LE0iWaLmwO088osQ0YwY81AMFQEoFerfIlgk+GG66GVsWlyEwxxQ0wJiowCYEu9x4ffBwaTHswuYQh1jgUc1t34fuMZn423K44CxILa/cjcvwzbsqKh7hG3wVILXjhwLW2Cw52r7hOA+uTnR0yl8oxy82+fvO/MzQ7EtWXfiCUA7xQUZW8EC4uBz8ECAPrn3MsR8nUk+eZboseYsVJNtlhrQCF9gojA8yQL4WD0qCUFTwFD9MWQtJs2AQ4mDJTGNwbGdoMnSkdnppLmGR+GP/zgsT/NIIGXAbmmLzKGYcFQVAkFBcCDjMAzaR3MgGzBTky5TMmZz3Q8wwfGhBma8ALQCQQaaqL1ZOIAVeBjgCYWZGMXo0ymEDBQAPQ0pujKyIGelWF4jCQhbwBCUSQuRoOsVkEjUUhpwkyn7p3KBUKHBS7mu8rxVQwMAIrNOFMIzGXn6csBQfeUVl9aHolTchl9BENjIZKBOh8mydQRKJRNmNxQIIKVxZB4dxsySReSTmRDRCEH4ql9JSVJNm1JEXRRR3uo/rRMCJv36lJl80N//OCxPFEU0pQFO7i3ExJBSS6zUralvX1eipqKtUvmhIGls7Xhkhz5NphQfo76gAIAHKdpJjOWxMQAhCgyEJEwYDsyFKcx3GQwsDMwAAYyQEEwCJgyo4I1NIY0Q1MVHiwBpeg4IMmiDKToSbGvGJDCGYIBjkgpJVirBJkeKxpENED4EjDF1OGngkVO/LBIHEYETBEYrfDbufTP+7DsGRi8OIBWT0VNba/TWbWdFcHisTm5w1MTw1hlyi6zIhwGoYZtkI+R7QMWQd0w4kEdB3COR3/84LEozcD0lwe7uac5qMcREzJ1Ru5gsMdCzRfMmTQ+iksjRDmV9qvOf6n+f//pUfy1/qf7uym9zM1Rb/f1t9tTW3nDtMVAAjbki6jpi9KmGhCYCD5msvGDD8ZZMZqQeA4lGDiWZKAxlYGHE+MdQHEyHCB6RgORBTkwRHRGmrUzBlUsE9Qmex69JoLJG7KR8HA0fn37VqEB8/DJrIqJW7ErVeHGu2JW/EOp3mdDWCqKhqrf9oFJe5ZyfEIMUWduphjcXRu5q7KhCaGaOoOVSXRMv/zgsSLNctGYB7moLxBlO4mwFUehxF82IGXTYwKRsgT5QH4FcRsbpJGzcxPKMg8pDjRutSkVtyZ/69U6pFSCuk73dJRJ9mUZv+s52er/mLcOVPQh2xRN0j01QJcUgAJMLAH0wXQXzByAJMaAGEwDxlA4QUx+AExYCUQirmAQEMYAYMpirrmmOUEeYOYDRgGgVtqChcBHh6yeYNbjTtLDDmhIpB48QEMLDUmUjlXmYDAknnGIzE1gHMT4MBBQIYG0Y4cEGDIaJbhwt+H3Ggu3Knh//OCxHc8i1ZIBPbmvEEM0EdCXJhoinTLY7JEk4Ctt0V5ArKAaRzEul8htWGVl1cqlSVSgw0pDYSHHicESEbF8i6CCbHgyEB1KT4uJljpMDRJlbkmGVGQQ1PqmiRkH5icD3rzqKL5e1dqrXrPa/9Wo5+XP8432W9Nl9TMbXFWBVajaDK075ui1aoAzHpBoVBhKrCyg8NDTIVMTjYzUYjRg7AQmBKPBRjKDeb+goOx5iYBI1IyMfJgIZDLhhAPDwqigyG6j/gpLqYx5lrdhCIi/hj/84LESDKjcmAW5EuMBEM5NNPj7LIUaRAzNy8itcb33juZ/In+IQAOAOugJn71qrFctxzGgjaE4rqTnnGqRlTIkuH1K5pjUNkzjbuN0EeRSOzhbc6XUa2KIZUmUGV6n0xqjYZv1r6gLSpjl0O3b+nuggK7ZA635jN8XeinYyOQiOKtyOPIlkgZWLt2NU9TmKobnpEgkMdQzMWgQMQAfM6iCApYmPRnGQIrmIArmApAmZ4llgnDGj8DGcZgYE5MACl4yCGAApo2CQsCQi2RxSUfBP/zgsRBNzNKUATu2rwDHDCDN2uQO/5jpqAh0xdQcNXaBsZVwDDU3pSVYITRLh0KV/n8UFlFP8jEQIYSANaFBaX3btGyrVp8F/zzsAYNdymyp7tdnrDbG/qxELgxJm7qDsUDAl0KB2AOQgiMUU1j4fWYm66LieBTEKl/u4xQhFe2ivukytXs7a9LfeqtUwPvUyklbPRUtz30v1WMzwWeuH1HUhAy1eIfmLoACOf+SPwIk1CJEQxcXAhqh4CqoEhBkRgGFZgAGciAmdA4GH1Y83/c//OCxCgt6wZ0HtsVUDEJIABQBGjmoyvJGAwvj8XlaPZCFqNBAreic/O9cgwoJSoRMQMrRt+7LljkkgGYiDojdxiBaZrxLKJMZHaG03ow6fLHNYcLtO6EQz9flbzMsjaim76ZzEKz97+Dys8pS86Z7nlQh/rfnoTmGGMr7fZG0/6HH0SM2aqHpkLKciGAKXAdK3uqLouUxg1zS6ZMtQGe39Kn0YEUCggjkBCIED5g5GES5lJ4Y2QGSDphQmZJ5g4LKhAPAyXSExlQ8XGTmxrQWqz/84LENDY6jnQW3lr5RkZbDoKccaFQWn6IbBLJX6wzSZqVQEpMHtJRAa8otbtAlJDcscFtZDYGNBIiOtx5TVqS1PZEopWnI8Hksd/7kuiLgS27Zq0tFjXfluIUDHo4/Lr2Wq30D88TKN3nGSSM0h3F5aXoGazpcSVG1/rQZ3ysCUBIhlCYGRdHgZNapK5xAk1fE5u5O8pSI7k6epv44maWjzmM/ztOv/23zC3/p/QBb7/QBJO21XVC5CGFzhYOgkLVsBWCBtMHHBoMZg0TJoFe+f/zgsQfJ/riiBbTVWtsco1IglSPBX+X3WsJ5zNy5gzGLtmq/je61VIiZFBsC93jhe/VBRociITqYranSD+EtSN7I3OIhazzorOmPUOwGY6v6j8l11+Hhxf6PU3OFH81vNB91c9hV/+a/e5jqyGF30qRwWEUkL8Z4E61mvwybLNjDjdNeStz/uaOKr6kBIMFCSNl239TLo37VMz54R4MYEFZ2CAr5/K8NRa9qeGEjw7jdKuA884PxWIP3SSFknhZo9r3TXH0Tw9g+ubUGWaLhuxV//OCxEMk41qc3sRU/q5YTbZzg0LrU5h0hdCar/WfjqROLLamVUkdEgOk43nPplA5b0G9eVBAITiV0O/+rJdvqwzV1fUn9JqTup9HWiOa6vkz1mSIZrIJw1JIZpfiNQDT/9V2TAAxIURFzTDxESBQwNIF6gcoNSBKxhucoY9d5IFrLEm/WBMQQCM1xBHG4+PCqSF2qcLhkkU7LNPLbW33Gp8WHASBO7S2NU3eTVISjysVp4UTHNmcGjFxG7F091IlANVptSlt3lgJwNCMT/zpUjX/84LEcymTBnQW1E9oaUPlHrUDpv0fVomFqt8snoD4+dq//mt/thcw47lU84u6DmtMbue8NcV6cwpyS5lzWCtiFQDan1ClMQLiKA8VGfgxMNmNGyvCETMDFB4kMEBTTKMeW0FAUDvA0hL8UEhWORmbiIAoDoBK2C5fTtHCs6fJZWDph9ndlgoGYhXjq0js3b2GN7DUOCjKmtM+msObm90xKChBrF80+io4AWCJoqmJ7U8AdBLLP/ULVz+TrpfFgaH/qeqyxmN00fSPt8utX//u3//zgsSQKnK+bBbeWtS3WYt06bNR8RAEQuQatcRLptNDnPA1SamLoQGSkmegMnAxEeFC0kZJggUCpaaSHWOM6NN0DGz+rmfqOMfYSZNAPMGvKVyWHQwNQS/jtgwmUB0Ivzzl83GAEZhi2zSxbxrd/KvZQ6rjrWr383QY9XyiTZ3Dm1FMwBw31D53AWg9IlJfWVF9ZNUPLSvZQJETPo9CeFgTP/HG9B5zkear///duVDZyo1Tuw6k234RFBv8DFr2fyeJ8whc9XFqzCv8L27KAAjl//OCxKopuvZ0FtNPh7aCNDCuBRcZBDLwsUKQwTA0UGCphAGqqpMzuCBTAvkiAV4vMUASVJgLaGEL8ooUdcIDX3huU3wAIDwkTEECU87heuDSe1JPdWigmr5dQudQLgB+XyRW9I7RJoIygcM2d7qUCTOpO5auuCgI83+4tmOVRmydDlBwaFjPnVHiRcJxv0I6aHiroiE5z5/1Kv/XcoTORfAtblsb4x6rt58WUPT8/VUA045ymMUqlZawHHGcImm1Wm0HDouHEKAvnBUADFAaFYP/84LExylawmwe21VMwat9wgYxRiRUhx/WvpBSjtPSBUwaQc8OdqetiJA1NB8tFnBXnYZGqS1OxTJEW8sfj416n+o8eNf01/OXmuv8ts/pgjWfan/8sbThEh1vHbqMEFnmRDQ5UzrTXrM7S1f59fw+Fqk3TNk931z06/7IuuTkxOhQVUsYF3CVf9aJAda9D3VkLBFIqOCoiKoKMskRCBRhyNwyCZhIDRhyH5gEAhiaNJyeaRjsIIUAswCAEFZT1eyjWYIYYeYWAiRbXgqZNkINeP/zgsTlKyrCeBbT2xp1qiMgmg5QYlYdbnoEIjwZNAAaWR51XLVKoYZIeniKmUL4zclqiRdmBLc/J0lkBtUHIQchol08kbKCbEEkzQaJfTSSH0UCiF7i+ipbCuKMVnATwkhgTxV7lkWB/1uiM6W1HDzdaCz9M53Ov3WTJn6x1qp1q///T9jlVepSVq22N8sguOPpFS8+ETySyzYYB6Qr1diaTEFNRTMuMTAAnLvgn4YehhACHDoUEgaYDuGcS7EIEYwZqSiBgTgNDQqBGCDrMG5q//OCxPwy4wpgDu6ifH0QBxgQOtih4g6Y0LF55yhJclYkOPOWqWJM+Kdve3iB0rq8ghJufzqS9eRMOaFbD8Tm6QQIKguoEd9E6ofwyHnqcrPKWwxg1GCj3oDxWdeppjcnG0vFjey3rRqTdb/JyvTEYRYyJhj2i2rHLIvc+Qeb0nVsaSFVuJE4mNWWiwLFyIgk7A4YcwZVTEEJlkkimBmQeBg4ebDHD8wEuNE/z5kYoKjOicxUICCc1M+AzAYODmxhyxxgFgNtzB0gHQK+BsWEOjT/84LE7CwKTmwW3hrQCrJNSx3gMaEDmWJS1KSU5roORyKBZBY0pq1swwCz/akOpoOiAUW1t0XanKNpJQzY5NZ/uxhPQaoPfww52Oxfv2FppYaj07//ugl/Y2q3lXPHg1fnMe6sdq57/IW9gVz1RRZLfpdHN7OZY88mViB5hKYLigwyeIrYLoU4m/pgLuQ5rQAKsfH3y6pMQU1FDLrpaAQUMIQQBYaJJiMZGCw2YwCJ34RgENGHgwJDdX4BU4GDJf02ElLUEqWCGoJ3IrGHhZFxXv/zgsT9MErWYA7eVNx06oftYViExmAQbUluV2nHCjgRaYhKUhQWq8aRX7hyniCDvS7Ln5W7Er5m9BWFhjET+gZMPoOhd6hjOnMQDsWpsaHvcbpMed65x6JR/Tdio1aVlJn9RmbJdYlKaKU4s83r1u5ovSp1Oqm9BBakTXF44HLOZ/rr++b9/6ZBhbs0TGajyhnOHeii7kxBTUUzLjEwMKqqqnJa/aFgOPZhgOBwcMeCEAF8KMQ44YQUSR1AI1BwYMeAsaM5YAhkgJqkWmpbIjIh//OCxPsv8uJkDuZanYs8oBGVjgVbqmEcgFnphkpMDzb9500vlqIQeU45YPcnO7ZbiplXvYWGlJ5QEMrTFLllMc2i4wXO1TO1EzRKYcWpmomZ6o6DSkTWUD3UZl5RQQ32UtU3PepFN1JGzzpt/QV1SBU9Rv5JxmpeHjqh7lCw9E45zWmGAxXbMlhIfFhATWcTE6hVUptqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqgCl11I9ZgiyYWJRUy8EAJqBaI2cPDgIwFqDBweABC//84LE8y3SWmAG5mK4zKUqgnNpzJ21U2ZAl3FBZ2W07W1Ms7kBgBVOsMEkE3RSifkh2CQynK38f+3ECgixXwvRiCKpc8dE1opoGIbQOdqCHMZ0Ism3MV7h9FudZvWWMkec52etaJr6kH5o0rv71pexq9sx12t9u97NmZ5ghCBgNQq8NjnUrRvu0XJFFvYHHqGrOG3JdMVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVQGl00ZQeMUPDIRgIAzGgMWDDPT4/cFMGDzFz4ijEYzJwUWVUv/zgsTjKerCaBbeWphUgCmRxVKFDi0dr0Dixe9cOM8ltahoAQPMmT3lXLUtlbVDBg+UJOPNZx2Zwt/9sn+FjkNSm5L6ca9qDevFXf/8DMxCaW18Qt/EJ4WsNsif/wHHQTHIjeRo0V+O4iJu4WIX+EifA86nI2vSj2bQsiWxq4VFg+EQMo7tnrvpWOzmxZCHUDxh2dPXKhppTBAGjHsxDAASDGsCShWwCSRjGdJyKOBgADxg+PYY7oQRxiEe5geGKFJ1iaMIkEJggMTFVSNIxEAP//OCxOgrCr5oFtvLTDEFD3UFS4oOZ4t9Qw4JweqmHOLCzDstXgZuhqUiq4XWFBiGIYqLHATpy71WoOgQgS3AQQGsQitKGXU9ZgbBo3ZlyeokyoOoBVy0lsZkDKqCJeCAAfZZFiQXywRM8UbGaNTLTes9VWieqrQSc6Vf51TeOZRb9KUteK7x51oxtzBVwarsems64ZXs02sfUjrqC7JW5JOmGwKkA5GNOKjGlYq+pl6UF0sC0ZlA6IAQzBYIhJoSnKExhAQEFR4gAjR9dA06Yqz/84LE/zJSRkwE7qac7QQRCQwth469L4qql4HmghYkYfoTML8GQLOWmPuzuLAo4zSV1HjS9LXv+Xjc3OUNYf1iFmAYOpLs3UsasRGneBGCV0/e7mbhhIFjBsBMKz9+49VOlM/bGQtej/y9rDlPN/y3Yyb5dFPuGgHsRBgPlwOkdmEgkpA1MoDrVq1zVL1HY90lYNnQFaOSpKEtIi1NdQPls0XQKM2VzcTIzpaBgYa7anCPJ70QGCpgy+aCRGDH4DewiETTNFESEJkAgIirBmxkBv/zgsT5MVpKYA7elrwMCA4LAgGQAaYplAI/pcVDgBghASYmGmbSgCVQqEBQITNaAEAhgwUEAqIMUZiX5QnGMGSRqqq7FloWgwDMUFpIhjI3QaeQgBQWLp3NyaNv6zzN/7VSclqMzcbcqrUnzqq0UbfFw2mmAgAqQvdC4s3RJ8vcsVyGBxhkIeQCiQ1XTSxpcwmiMnYTxyrXVrVgMp2I969i2rAN4rfbeitZVK0+0bNbJw/42N6+at+v/1QTK+g1FCRl6Il2VmdTOfdbjBjq0LQp//OCxPdAgzpkFtvLyMKbgTB0SJSPCtHrF+TXcbonCj+QCNLHcWWESEYTTTOZ+IrXHS0uNhmrRCdC0JclWbrWl2ajUqDsUgCjZ1HSEKcl71sjfMAurN/alDjxCiwcwA5p/ifcSsT/21CPD//+HPvRssbsfG/vDXBipd5yMw3IJ6kf612UUC76Eg7yVX/cXf2+Y4nJvR0x93dLmOeelbmlkF1/T/6+tPrMtorr5qs6PqWVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVQScs1p0jGoooMj/84LEuSYT/pwWy87ew4IMwjcSjKVuAxcaJrKMsMFlw6Do3ppH1Co9R2HcpbRUbuybHKEyq0ZMBG5mUNEnKFkF/vf1bV9Vw73Oka5u/FPXATXdf/UqmqNUTDr+x+NPH/oZsTJERrepv037hJ/sFivIArKPqjY1P5vvKPVvs1/c1nfsg7//09//iahJnqRiDhpN/Uz8mCQFuVAQOQZ107jEarP6rA010j1JeMKi4x4STOiIDJEYhDhnfnGDQYaBMQGTBKF24IhGakoIRKAAkSFCIv/zgsTOJMPWlBbTC2PiEmYUYGJMBddrQQahcxAQyfQNkwQLGzIwaIDR4sgz4fXoIwVekWVsYoNTA8ARqmehqRAIDpLFkiI/IIXcMJOHarPTLrcfYjA1NSVGeYlUBBwRZ3Zx1NSq/ys0d+sWO27OfcbD4NqROUKk0Hnno841K5z7dSh79DxOzcVRNyXRoipJljYuXQdhk0l6QFsFGQpGH1sK3LuQGllUDiwqyKhMCwXMCFkDhKBiliIgDC+aBINhUGAYHhjgUBiOChgkNZhCf5ic//OCxP81ukZgBubO3AGZBBKEBOQg+0NQYx5EMOBQBBQOPRYcAoCtROAVBKWUBgqTAg0Lnak7IFBmRAUDKC1Psmi1riIBfuJwwwgykLX9g2JivpPCo1KlboxafKkMAK4xUmWo1Yi7Fx8crMPyAlAVS0lfPDCez7919VvZwN3X4ZZT0UshQ84ULpRnQTf+z7OMT8LfRhOvV9C/oP/VSvZSUOtGQ3tJKiMGqp9QwWaMXHtosPbljvY+KwD2+0kKgGaXMiQKIJs7AiNDxCkdBw465k7/84LE7DS7ImQG7srcoF5AuSmPN4cjjUuz5MmAOmbCIJDkzo+t4qAseRPXbelaJBCBNfNMMoASwZyVAuKqOmBFlwHzxzoSAT+7wge2o0Ay2Y3O1LVASou/yBPqy7C7Z+lyU7j2t3v3eLbmB2SfYqOJcQDMULNVlcfe7HWNPqSmM7LyULdWYVGNJGQ61y60fNFn0uap/dpjud/oW9ChxxvTs0Q87X+z2lkRBUqM4EsGgzMKAbOVgfMWUVNRg+MNg5BwJmO5IBhWDIKGGzIAIBjIof/zgsTdLLsedBbeFSyowIAcZAd7QuBBiSbAWCgBIw0RhgyYAEEwuY8cI5tLTbGjgtml4bPWorg4ZHhoQFYkLsNMgK5BD8u7dc0x4RLLTtKwyLCMCGnJ83pkNWZgEw0rhiiqN7WYWyPUQr1nqn0OLO6mN3DKaf/D93E+5S40tz1b+mg2U6BEOGiIQRj7xj55xJX7FW+4mF3nKYa/5zfQVN5tn3m3H6M2q9HdqHkdH/qqTEFNRTMuMTAAnLJQJ6mnjKTJAiGvCo5LmHA72I6ltSIV//OCxO4zEx5cBO7O3hgOM3JBJcBom2do8ggMCnbh2mPsmSkzAoO/moLag0VlZUJILbeBH9aupwa0dxmtLkSxk1w91CBWVa95xcSSH/fysjnPE6Doa+eM+LlGv6u+gksNxqbuxhvsinN9W/ExfmjU0cb9BYd6qBM/ucooMWpppqiIardKsjKyM46T9VTGWw4piFt9u6hVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVUArf/HkhzdiF7hicMLGzKn0oi06iQCMEQx4wGAgE3ZhQX/84LE3ShrHoAW288qmMkkOMhVawIy5ATzbq05ULL1aDCBJnOSnaWEtZEZgYxhXzN0tFvMZR4ob2sbdVJCa7Wk9M2REPtJa7Q2lh63KGD/uwMxNkITATS2VHOozEb6FSS9Txqc/y/omtNx9q+Kn57xMW/r+w4f5VBH5lxqyvx/dC41uKFCzFoqFxeRVyqTjL32lEpIvKqP3jGQadJXxiAVmGZEfRJ5lJkHPTsHOJDwzCpzDwRDimcERodijbQxCDKSg8WHr7mtxuNBkAgYOEAUVv/zgsTlKmsedBbZx5Awbl1zKzceQ36LAqNIAiIEUz7WIMAiYQQADKI7i6TChlvWLORGdxwKibZ/hmMSJuwMHJ5PxypREJ8oFWk6fFZ1zqf7rvrZljvUiiiJV3v67ZY7h9V0XH3BfNc7Vwyg/ics4gEtGfKlGoyzzjz0scpb6jzVblG/V/5f9jBa9vHYKsYbQjZCSoSU9TslJDGyLTOm0n1ValjPhICm2oWJB8oC57MRAy+GQxmCicBQuYVDIJBYFDZhquGBQsBpWDjOSgkiEUlT//OAxP8zmtZYBObO3Go5CAdiY8SEQgBgkveYYKF2IqSiJEOlzlWC6ZGCIQgkVHB4BgUu0/7Yaa7EHTSqg6ngCltMaBAXg70OUNm8JBVbjo65BT1T0o1i6PUXJdztTL5oBRjOKAcpDdDB4GbKPnI/wz93PRbjW/E0bdECm/UUbostvIgrp5OtNWqrcg5hKaHliz4QEC9j4dXO23JjEExBTUUzLjEwMKqqqqqqqqqqqqqqC5tnjScNR2jAhYCu53JgZDmG7EZeMUByhcDhcLEZtf/zgsTzL/siYAbmyryJj0qZ0NI6MZSZXIZGlKeRuVhTzIAZvyzaXuBYCUSU72oGrj7/sncZpSML7or5WL/NTyKOWH4YYAoGvxNxw2QRadRZXDyHVSF7LiENK2f/mwNPxQScq30fmHKad9B//vXKt+Vf1MCxv5Qd5bTNtOEnnAMmMa7cJUmxZt4HExbUBtJF8A2oAr71LgY3EgKCQb7WBGHJaZIPhmUinDA6aDC5m0jmJggIRoLHkwlwzEIJMboswEQTFYHKFVJcc9S/gwFDQGEF//OCxOMp8m5sDtvPZABSQDHggDAwynxwdIiAgGwSQmiQSJ5MRoakoqPBAyBjoM88XLfvZUaWNHTpviX/MHAVfoFApFdRpMrlcByrC5lIYzi6SybErtdcesSgjqV9Z/2ZHy0B4Q54yIG6kBE2Lj29dROP3Zm/i8380/8ZP9Tht//dURla7OVnyAoouLqPn1/4lXh95sJvJEGSYpy1AIq6ui/xj0lgKGYwCJ00CBQCoSECoaZWMZViuDhqSRMBguMfCUMZwEMRRuMHQxMSQwJpjGD/84LE/zJq1lgG5tS84nQwZBa5QaTnHQwtJSVRJgglHsEbIqI3V2MLCLjFRqdMsKCjihYG0Ks16AU+HIiTpgAE+aswkvh+DItWXimpD1u5jf+OVJTXpc5bgz5jmdNh+7wxoBw+w+upqlFfHkPNJtXNAoxjnP+uVb9H/KP9VTt3/coZMP1Rkm1SYrboz1JlBgMqGPDZAJLPlbCRRrVooQZ08QofnTEQjmmbOkxSGDQsm+AamFTPmBZRnhqym55IGH4kCwEDo2GLb0GLwSGXwqmEYf/zgsT5MmseZBbujryhoUD5jwC3A8VjDk1GUSEjAAIxCGB0AYKRGGicUEJmlCQkAyHnXwBa8SIS9AoRsWReCgyucyEWtWF2OQXHUXnGcGRBOiEGMYCogn5LZcwIaKS48Ut15yqzBkF+as1mwZP8njfeynsXJcKzqAKQoIPKnDZ1zxq0gmh5QRZU7r7Yn/lH/Exf6qW//2Qj0XO2MU7ZLnr3HhrmIkx8guFYfQ9lrxahucpPSylYMzIGZpJgAKRjQDJh0BwGNc0AgsHHyYPAMRBa//OCxPM04x5UBO7OvA0BzCspQghQw4wgCDFMHx4Sr86i0wo9RVrDExiwVnkxQgM/5YF5S9mR5kLgyN33rY/QBAJ0TDGZTbtzjtUlZ9iIXIl9AkDEsoruGGHqCXtb/UkZ/RU2ux/kfajqv//Nhp8hjif6Dur0b8NjW3T3xrr8Z/CQvpTf9U9XZxVlVk3qq2PZ7rezDvT9Scq1rX6E7DVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQtSOXKUmcwXHB0gFrwscDHY0Mb/84LE4yv7HmgG7oq8k8EgSw0iCAXOmyxgZuawwkuATSoGCGThIBW/RJawKqBpwocrTtDrNzMuIt8PvPGmwOdKB4ZZLnY/OXOWsZluXbid3wWZGwHgJ1PvQcWkyI44eTLmknTM/ZvbP+VFiQN+3iWed8iLZvQv/b9/yI4lUppRrtfvNnLRqkYwUZoQSGA+yVB9AkelVap3SaiRwRBhwjBpIDp+YTchlIvnaWWY5Jxh8VhAFAAdMXQYxSIDDZdBoANBAFKBBCYHV6TJhRQkFbiYNf/zgsTXJssedA7mlH6FLQSGByOuQGW3iStp0HzFHiX6QAoeU6MiTdIxxFy6V/6jvNZysixmONkBgubfGRYPW4TXJXvn7uuBL47jUl2KictxeTLv9AjGtE0C+/+VCv/dFif/eA9Qq/r2vroSif/56v2nIDfXzaDZq5XhLSFqn21leLIlr+biidvqXx+dHuUpqu2G9TF7Xm4XoNPqbrk+KBA3K9CYcGBwaHWox2TgVtDrjrNLFExuAn2JhIazNQGYJkcsEgMM7hUWGKwxlpOAERBU//OCxP8yEx5gBuaQ2EBgtpAUHE7kSVA0Q6JIhJgcFA0AYPeypJlPIZAJMLDmFKR8zJBoWEhlTTG6XU9gUTjWwE2b5bEPVobZqlFLLn1+0sNx7erMM9WzF6k3e724JbzhAQYCh3Q8bjHQyyfgm/z6n8wTjPo5VbaYz0tL0+9a57slFRDNdkW51ZzZhDU5DE9Jr02X1DTNgxNMQU1FVVVVdtjvPGZansDgkpgJTGBViZeOxoPlAZLmIgEuQLBgw6+y6p9kY4dM3MDhC3T5mwEAcAr/84LE+jA7HlwG5o7YFS+SwoDyhkBAQNlIwTJhcpFAJp8Sz10rcY0vS8DpsmMkPhy09cjfd28Gwl4o3LRozROFRc+BSYLO2vz7Xa6Jg8xgcE0LbBTE9nHXscPEE5PcXn9XQ4c+VFRl0O7yryMmtnTV7MYg7tzR5JqNX/QsYZFgDFZFIGNC6BKUptcG2qc3FWGNyNmctUpySNdGAMYHlBhYJCIpmAAsYCdJg1PmneuVCIYmC4UBgFDA8lDJIYImUqYagDQWmH2jmPEkJMmnAAcFDP/zgsT2Lpq2YAbmlJwGiR42TGnfHSJQLh8hBHWPjxBbU65ZMFYkDlbKzNhFLGvxyAHYcirSizHUkByOZksbh+kcpvpZaqWM6d/Jbu9K5+cjrUrECWNcpaFyhRzxcOf9EEp0y/VjTeqrgIUj7+8hY3Uen/ye+lVqPj+5gm/rRULe0r769Enuurr7/hfmceeS+90DrrMNlxeSbM44roTVftOYVABmfOmQhiYIAYc1DKjDMtiU80zjVxXDqUYGORpJRmjcAY1ABmwVmHAECnWYEDRh//OCxP8yyx5gBuaQvBDBkFPGGBCYKHJggFG+UuZEEIOVBhoCGCgJECUGjwniwQIxaRIHmcQiYoAwqCQ4AqMAgicZ4XB6jiTSXZU+JWQEodDaOLl4RRT9Ic1iwQq8VAYkvvLH+ZzSzz9W4NdF9SRCpYMZ1qGZmNS+le1wVKlZ3kpoq1q1ewnr9iEioUg4rHs/rTD/2+/jlDDz3eZ3YZO5yLpu3V1xy9ZJaWta6mMfcvSe1emSAuOlBEqv1FXXLrrfEcqGV1PEzM1fBIoZJVJC/57/84LE9z9DHlgE5hc0V2KY0UosDLdoNJRI16ATSEYcNOhgRcZmoHM4g1FmPjAQxgt/MdJUJBjJKQAZg44io4YNTWUPsHApuAIqcoERIDVRpHRV9ec0ywATaJFcWBV22ZQy2HA4GZtejU2XcVDgzhXOb8kM8ar2KSAsoXrq0q5jV+wbrJI77v3mk1iEU31Vr//94hhgJNQwoRF9sjIK5u6HTy2Xo1EOoTGpn2bz0R6nFwbCzzciJbq/T1Us8lRYbOsTqanT5LoMLQmIqnoA3JvEnP/zgsS+LirmcA7b1UzTdWW4QhRMmAxwMTLzFvcWLBo8GGMABwERy35go01AIaF0w2Y0XJHJ/LNCKIwAOIggtIjE/zdVXR9cxrnywwMRad9YHxaFwOBjlSkttdW5ZxJiKKVqDXY9P3JkVBWTvtm9y7WsYY7HgrtBavWOf+BdHHxp0XW0PJAxDUenE5sjGhzOiiUFK329dH/R0JX+31J/sL2ztR1/09St//yth96zEcG1fUcKvAGSEFYDD7XDqhJySy1ca1FfBYKVKYGWGRB5pk0D//OCxMktEyJwFt5U9IFL2mHBodAmJHhfoygLVSDA973vByGzRWZm5mgWMhiMJf9SyrHVvcZCQhjgmAESI0MPNt2Kir4Tl25EisCxmmH4SVjt23Z5MKtXdX3l/51sdZXVeZzWfMe//Z7eoT/cZv9c/XLDPQ01Spv1J//U/R/0dB9/9lFyeeTZquwUAKrKiao7zh6XeWY2adPswBIQP/IR4Mwi3yrRv4V0spUzN4R0rlIPMd+AyhK2WJIOnVogOWCqWGigJjoabMzHyjxl5sHPZgP/84LE2C7j7nQO2ofPBBnIZmgBxwPZwJBzPTBrDlmiEKtaqhMBm3nghECgkMGHkJ8QeEoC5pfRlBqw8xFOQUZA20bWzSlYUy2tN0IoGAoFsNjLfS+SkQPlH6mpUYGJKZ0ljLuPu2992u+ie9JclmE9rX4nnJgX8voyBagiYGAkoWLVrnP5z2/vKN+h0rRUZ7eVFljk4wVEQxAyKPsh36HPnul7o1yPWnVq6O2l/9Up8z9V5Kr/CalMQU1FMy4xMDBVVVVVVVVVVVVVVQhSTf//mv/zgsTgMXvuZA7bVaUm2cWLrbiYMS8tpqjrsbpXUsup33C/dtpurxJm2fpjBOSZRVl5ym+iZEPPaG6lh3JS/rJZamARxmYGtA7sUZmKZuqbL7KQJENFcodQv9Rr5/0IS6t/O0ONXRG+z3Y4wF8eMcpUoFFPOdD/55r5NS9V2Fx1ze9UIV7AMCLEc9UrT7rqD9cZPMv9+DZq7a6DS8ABxFEZBAzeMQHMwGYzIlsHRqPHUWGZz8RBzlMtkMzaZTA4GHQmJANFMYN6WpCHXufk4FzR//OCxMoju1KoPsNU+5wEWqQAwPAA0Ltr9OQEVgAk1rKP7pgUSCRq3xYIs6GIzVVXDMVV8Ee4AZ2FQLbvpK7FATFE17Ul1UdhyI3ZhiniY8MwsznaW3Vn3Qk1x6YCs4Z0u+YYSiGLL2AgKBkjWfstNRUU39TeokDyav+hTTNC4lrM7JkmvUimJ4jqppoJ1LTTUh8wQ0GqVVqmRkzeQXnwFa7ZVtmc/9nuHh5e3///zdUErtvcJAKBFqBAUQiESCwYETBoUM8iUxyIgEDTARbMbmr/84LE/zdLHmAG5prdMszE0mAzDRIAwnMdgxgRggATZi8mSmKXDBcMBI3jCYp2oMYvTu0a67ospVcvlghe0GRF+hoN/oZh28WA2EW7qGzvw0l4y5lUNRaaQRRSW2LmVasNAPdarPUw+/L91s6SllgsGNE2I8diLopM10B1B2CYDeTJzFFMooK0iHEVOIqsovPRNjEdQfsFQn5dqTrMEUSbaWlu/ZJRuWucKiyHsjdFFkEymaFouk8fqqUQRI1uhglAoNoJVnz43Hrrg8kgpowwZP/zgsTlOhrmcBbmYLy7ns1KAJt70sPASIAwgBEMx4KMGSjKwg2iBAQ4GJQiKxdtN0aziQ48jUezmWYkzU2yYOpEoRtpfQQKbo7IqJ4FnTDXTCUZeSkReZf1Ao4j2KNMg6pjPNhInLF1Wj0/lAZPS0lbEvvGqbLL7NKgPFjMnilj63W9R0CHL6RiNmy19nF8MqPw7TiJZTdE890jJEq6/qpSUFFSX9aCpcVP7/SdDq0P1Ns6KH1GaP9X5tVr869Lf9Cp73bUtn0X1sejmrEmigCs//OCxMAvY9ZwFt5inN/KlOzLVEaBQsFi0IQjhgw2KuyA9TIcFDMgUxbyBQ8NEaGQQEtfh8eYfpbTTQFS+6oAcYmbcep7r7xLRvDoECS65DQa3F4bpava7MBoXk1BPwQUHT1X8NvlLaffMc6FYlNvcy9mOP/h3dpeBeQCa2j9RkCYuFs6VOaj8qIQnf/OlQnCFJ3/XFv/9Cfo6H/u27lDfx95DQfalE2pVyijw0bDm3kP3ZJbEWBHHNi7xGWAL1Bw8aMKG006CIWeTCUQ60xPfsD/84LExim63ngW3lS8HhhhwYkyGSScbdjfKRsZUrEdoy5CZAMjSbrLIURrsjCPqVykoJh9iwOAKm5qUN/2x6HhdOpK01oi8aKE38/fqFgR9NauYZyxWWku7lTp9xtZU/7sreNYxC6yTvWpJAcYKUO4Rb1Pv6JKpf51NFYUAtzb+tclHQWy0/qmDdKXG+dQd9R/7GqActugUIbSXtiLO7DKXVJMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqFua7fSET8CodmmrJWP/zgsTjLOriaAbeWrwgxVmsXZmPbCuqkXHkq8KOqwHPUWabWhL8Ryvct9wZLuZpcukQAxUE/cWzrNKzX2GOdvdTj250260nx2m7FRTfX6hpE4Ph6SY5WdQ8zIBrb9b2GYdf9eW8WlXaIZmxFpVgdAL1j9RtR6ZnMdYjQ38+9c8Z/H1gsPJjrH8d6/GJf6qVc75SfZFX5TJZfSENuDkaCJAbDPIPMHm0wqRTKMAAQ/ASOMFIE1MajYgfBVHEQyCAEEI0iCb/ChEkJVAl4jUlE0QU//OCxNElex6UFstRO6Q5+YIDHiQEx+gXca0E24qLp4ekyCY/Z1WpllTLcsJAKC0/ACpZpuCEFbCp88y16p+rhnWlyA2plaqp8Y3+5xTDdZRp7qs882/1r/3z7BEBeMCz3LOzeB4Ik7/9RUDV/3kbavnvRH81xIVu5VPkfOS+bOsOmaOiZpuaylaO8kMONctIslmh1sghTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTuSWtWM+cYKocJS3VcUw7VWxWB7DXDzHwj/84LE/zDzXmAG5o7cukjCoIhG8zsMbeO0CCHQA8CHVcOdbjl/CUuw1hFNm9XsRQ4SvOiqWMwnCEtg+hAb2pAooKofe9Drxc4VpER+DDzBQwYNPl74qRY0FbU5fxX+JZu/65eEVCgSW/+/jE9xfWszaWYiGfDnihkvoYY9X1ETdWQhYuyafP9cC9mfYt6+NqWBB+tKIxBMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhLFNy7b/P/zgsTdKHsiiA7WEJaENxKNteL8PxCSSQjGDDQKreq5/ETkbMUEfXSfeeT+Ee8hqjbic4CbDv9pyZZNm21jjYsH35/Wc2CIACSVocvEubSR4Znrd/3uIceQpzZ7rSSRrRH00a12q6jCOr/2UZLPq6vpSRfVclC6sxLiCQ1ECr/UlGKU7M3/Re//st0f/5w2pPakBILvXUxBTUVVVQGSkr+ucYPgGQAhVOzSRYcQjAwE09yMjHgwLMJGDDSEx7PMhAwMmEQATQqr1hQUNQm4FQ09//OCxMojq5qs3nrbMiL1BmOAYcSVZ2m5RzKt4qEK/MIdjNwZfL+ukaiAwt1Zffg2oxl05FQLp1UUtl01boMS59BP1r1v9OHevWJ8OHoG7vl7mONePUuovod541f89dqocoYV6wI2YO/94Pc63P//+cRD/+8Ikf/op3zhVNn42Ellf6vnGDLo//ih/EC2BT+In/i0U0sVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/84LE+S9THmgW28+kVVVVVVVVVVVVVQIClubXf4gjvinujJ0NHuqULYzkHYlmez+fvd1A2lymbTnNHEGPPKxiIpP0S5UfzfQU4eRg1p7LOVSaGQ9/Rdzp7o18xIBFPNHwlGC4sm0HQnECN/dyokhvf3MrCq//1LfkfbIB/vZ/WxEX29/Yjvsl5jt23q/+QvIdpdUm69VMQU1FMy4xMDBhSy1BOc9wBAsYkaia4ACkxxuNIsgATmHBhgJKP2hp80tQxAsLnmijQQFQCBRy7JEFj//zgsS6H5OasX57VN5KdFQdVhMUjQo4ZUAJNSO+UJ5c4y1VDmRyrqRhqxGuxYWMauxlFwrKHsjcAfZSsszMORqMGDmTcp2Wb5zkJiYb10Enc4Lfdy15E84XhyzatJnFv2opTPGpR7ShvQTg7I/9nHQIgWnv7aBQn/+b+NG3xAjf/lOzf8c3a39l6onf3KURGUTuMFlcXUxBTUUzLjEwMFWGXTzQDiWkWCQITAspACKRJ4ZtmFgQYYgwYN1HypEkw6YAWoigp8IgJ/QaJx1uA0BH//OCxPYus55gBtvPhE74gnhsOIi572KdN7WYaUEMeBDehG7kCphDVG+bJ+zdi6VAhDr84xWxQMTpbudaIiofZrU2O9ULZzMzYY4AhFOZOg1EY6MkRlM6Z31kQviqHt1lbMt/MSWT/7uMwMlEJv6OLY8//T0j/8KIQv/6FDKP3+hM2pjUTWhH83aN4r5MT8y5zka33/UqKu0wVCA4YNwwgBswaU4zcEEwsCMxjTsywgUxiCwwrDUwVS837HwycIcyNAkypGICCAYREmGEmXqMMAj/84LE9S5rWmQG21WJCIAFhEqjcRURgCi8RpQ6Y6PBAOMDhEKuaIR4yMlXaawYAs3SMbkOn5pkJBKoFlxOCrJgoUJlaTTxA4rhTODEhJu0QiTNHXNACyIPmV85xmoz8iAHXj/rFDoB7JZBcnf2tnTq4Y9kquuanldqWXrWdSxTItkg2vKPyqA5duGcv/LVCyu5///54MhLDQw5v0URKN/1PFkznOBQVLrPGs9GZaegr1X/5Cb//o3/8qnnjVJG7M1syOMYGDBxNFBh9MDp4yyHxf/zgsT/O2uaRALu1PxDxgpZGgJoYmBAiAAERJwocGJkkYXEBnwAFuTPYBJgsxImD7WJoBAQ2+aACA3YDFQc5flaSsMbaWQIlARj8YkZQ0qShrjL5KXv8xOB3QIBodiizeLacdnxfew9FJGG4GJNPBYpLl3OvnLLlVuRdeL16DKXY/UdrLNsqnrdfl/n8xziMMJugrFI8bTjP1i3I/+oolMYCD/7kYyLf1LlJejTFlmVS0mOt//KPb/zKurZnepalO1OtS616loJU0H67fZ7TZ2W//OCxNU1Q/JYBuak+DS66QrDGgDOWyQ6C0DMAlow6IDqezDGIY6CZg4JGvCKYRCxgAGGMQiIAmZWGysiaija0n3QNM4BMQgkBAQrUgu48MNcnhhBU+kSATJ8ROKt8L+kRkFC6B+neJRo4S5uQYG3dSSk9HLdKohUcttZUvcbb/QzNfK0B1rChx7vW4JLEkQ4S67MrrYOAlAD1Crpt2v7Oj0DVxeQ/6I43Ulov9AlG61CMHVrU1EeOpdFn1ouaFooSQH2MFW2OSEptc3rnhKyHFD/84LExDKC5mgO5hr0kQgm8TVvcu0YGAcZfVSTJKGwh7GBwIYCK546Qm+ByUAAhKRjMPp1pimKJGICG63qBwOvKtDD1HTJELcmoorLYhh0mO0TnmLLSoKnxIq+dGz1ByPg6HC7GpRDo1EpXSFh8/EUSJZvdpu5MJfrG7jfyq0jpqWD4emSy5x2NOC8YJUn8qNRBAlfrQ9RTSqf/Wge/9yh/91E1Ju4w768nlGynbWylLUTjh/q8e2BfLx8jyJCMdv3HJ3e3f+nfv2Kx+aAKUkluv/zgsS+LjriaAbmmp2VihHLh0BXUreDAQxe6LXs3pw5OWPFmeyMOKotMNh+5L0BpYAVWRSBedvasya8vnD/wdXjBMvu7EQHMGJK3G/1JQGDWe7zYnvygb41YNfg8+ygtm+eflIjioANI+S1bOEK/ZpDcdy4u/5UoYiP9sNGf/iUu7ODhfid/t/Rnsun56pr5/RS10t/Xukfuuyz9sXJsXrqc1rM1ZDHTaIQQKEMFGAEEMEio4/zzpuhwKYnOY7AYIKJGjWnhgme4IRCn9IADidS//OCxMkmE2KMPtrPU0jWnh2qRYA4EjHNUy3ZY5QVJ2E8VfwiJPQGI4HFn8cp5dFQTAAqcbRZCnUToZeK7F4qEoAKUXAmT1BbE0VlTMT8bzJx6TZZKpIEcZmC6H0xtDqEXet6T+pN5ZQv9aVSmb6klE66an+jsVXRfYaaVesdJune6NSmQQUfMnCce8wM/r3f/Ps77WZqyn5OgxPfq3Zfh01MQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUTNA1Fdtu1QqLqMpYxlQP/84LE9DDq4mQG5qZdOYkIJ0vUmpZRk3scUVTDb+lpt5sFSdhKkS1l++0GluswzynstNKMSfNKjng39vwwfzYTn1duoVnPaCZXL2V6kLEoJj/dH2/yPJgSxu/f1Jdv8vmSn/UpJQ4lHmq/SQKaalpOsPJ1NTNMT6SPopaakytcO0DwEXHNOKI6WrxptEycmUhjU8bLD1IItskCfhmUbQQEQADQIUQwaB4eCk0pgwMVIUA8LE8YkEmYRigNB4YjgWW/MjwOZAuRmMZtIWGEIYEJDv/zgsTTJermmP7K2zIcCIsMCiYpH1PUqpAKK6qZDvy2dsA5Foxzo5SrKIEg6g0+yMBDTb7QxS395PuIxG8q3t9uSqBntsboFH+byyfnX7tNYUzRSkF6nNBeFUJZc47mKHlRqaIHG/zqX/VmNPZtN6p9NVNoLIvLZVM6buqndJ0FIM6J9p4kseMi9Boe4CFXBwu5wkA6wBqorsrGOD1MQU1FMy4xMDBVVVVVVVUG1JJapCZ2h0VBhgPMHBFJGD5IWAFtl2jYwkwsXUJMEBlciRRI//OCxP8yuvJcDu5a9OzL4bp39EAOVRnFGIUfjwliGFsMg7ELZY+LFfsIxjEXZ6mpWpHUeS6zTWTPtbH/8JC4c05Jq5zZV7veHHwvqq1J7ff/XCpM0llbW1iCsW/7UtZ7de/1jh3+nKXUxGof5ZtDDwCTUY89zS/aWRlsZHHxalQTes8oIh8WAMnza2EFLECFEXGrVFJNTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVWgvy27jMxyMaDER4002osuc1T/84LE6Sty5nwW287+DgVBiEcxQHREiloy1OXKF5sMysoeJvxx/12RPNxpA0aHceZ35dZRkG56lnFvpPT9123Iwvex/kmMe3EibPuvngbmVPRt+S//SRkIrXTU5ge9R5KvTfdUdyC/6+ZtV6Jikgtjb1JDm/6r391VLRb4xc10mpx//2t/lv3rXgv3c+Hg6FxLVx1A+hVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVAqOS2hQCZPkXxGb5RPMCHM8QO+qNbCGiBADOgSChw//zgsTWJpKKkDbKWzMAbTqh8mXyGCtKLPk6QEIjgVr8BQa1KVrZ0wIadzDo17MCVFmUaxIP1GcY9IcJK07r+ybU754EJCorU3q8LFKbfO99rao0nmXEfNJkMUAz/fB/54fX31tl0SkWF8V1b+N7zjf0R6v/G9WQUq1WlN3SttXbnY1cltdqPM/3p/Vqq6qgdipxvTVM1ExBTUUzLjEwMFVVVVVVACt3/gtYQ1DfBQsZktnHh4KHTbBU0T3MSiQIHkhIdCZijFjgaZL6i1EFODLW//OCxOMqA86AFtLFcxykGZnmwQrqpsJavBUNrcb4lRErpeIxYvRNr4cVEC5eEoq34MXv9CxXFR6Jy7bjQpBckuUfpHDgIluH8dSt3Bfs6q0C1Ywlv80moPA3lTUFYTGXbbcUfNc/remsvP/81e7UvhflSul/99wTvqukr/7+v7aqdYlUuq2KqCyRVS8XWiYTxXQ1yMKMAxW3RMwCFTetGMThYyVDDUYAHQAbFApoSuAaEByvAIeNljkgOYqXQx+IQhimcBqDMuJQJEAS3O4RBhn/84LE8S2C4nQe3lZ8ZoWsIhBEIfUGiIYFC4GwQ2CgCvmcM3elQhXIEBRGArUaiY0Op8EU5cna90qeezTaWq7Wepfub5PgA1IQ2D4YnmxkrscKTRcLxFD4sllITmEIFEB92TUxPN1/bKq+3r1syp60PREmHoIU03eU/b7qVTBT977vtTv/J3Lqr/v3cwjudI0IofiBA9KyAif3QomCJzh/lQIGLagZyGgiEpo8RG6z6aXWBhABA0tmkQ0YgBRhErGWEQoBm28jLikg1MUvoEChwf/zgsT/MSriaBbmlJ2mEDIhxZEVhJCFliVB1AEChUpBz1CwOaAQl7kEbQ8FNqZn7IJmDUB1dVR7LML3XrKLVcOX/j+eIKHTUfB1mLnNIXZwaU8hqTW+uXkg1D+En/XB34+///Sb5qfbz/8fxrMfVenT3KGp02W9oCTkt+1B3vndNT22Vr8h130A0U1r9P3e9E8nH2chEQ+lGnfz4/f8VUxBTUUzLjEwMFVVVVVVAKkttpW2PCqEgwkrH1k+HcDYVQYtRgGB5wBQqgHRaisArow5//OCxP4y6uZoFuaWnVm4xuSLBqzvK+EBP3dvZp2Kqyhkdm/Lral194K28uNGMtHEDvenEzjrOf8aJXEEITFXcPZPftPS079c8Ki8NpZsTU1lSLmy0TpAXOKrQ3rOFM89vX00zq0kn11TyajFHYJqaonVMyR7/m4YBh3/JZ5Q0N3ujBKyXU10ljDAnxZREFGZ99/FFUvWTEFNRTMuMTAwVVVVVVVVVVVVAlySNaFAk24kSrFZU2wJHCorHgJlGAB5EPhQeOGBTDyEyIaAwzPjQBr/84LE6CtCroQe0ttPtPK5Y1JnpmgFQtVVoq6WpTbPKiMwLDg9I2L220fVikVUdnJnPGCJDyaZfp+NZ2KEYLo3VWlFJgvDiI8Yq+5zUaQjjnWVrHGiuDoHGstH+a/uajF1j5zZy/qeyOud9WGBDe5wDz07FjFc7t3q27GOc9Zxq96zJtTqsZf/ZraoiqeqXL25e0LfHEVMQU1FMy4xMAJckjgjIgL6S6RjvYQRTeOmvPb5PGyFjYrQN6fMc/M+jJksXNiBWY9DuDAKSOaTVBYCHP/zgsTtLHPOeBbeVJshAQueGJS051QqJEnSC4iBSvBesAIotfYdG5x1d0zN7lhXW4VN5QjDCXuhjzH8K16wONNQ6jyTVmil1vPDagtJuYHDUmEgGpmQVWf9atfRpug5hU6bWq1VNapmTpn1rRaizrDqja1xJaw+w3rQ06TlSkLxkbX8+2wufZ/7nM34ehEx5jYY/tZPmw2axjQ4HpnWsBg2EZhsBhj6BJIKJgOHBotKRo2VIIA8Cg+aygwYUFgABmKCDIQbMExEGgkWFbcRhUuZ//OCxPcvAxp0FtNHk9ow7CMLiMZNAEXTWoJKt1Cgq1gJGCEgcMisjhBfycJGUcHoURqJtV1Q2gdfcMSKlqgMedpwaKs+BMVAEIypbEbru2oFVmZc2kdtZX6G93vIdstG/9CXEwUg19I50Qv/K1bFoJzWyhTkKPHDap5d8WY/8qf9sPX/7hC/+nOerds3S6ot6Zs69wxIjMa3xzBKNZfQKC9AmqzdzKkd2tWBEgUdSpIKMYgVBoEBAAjmXh0eLgpoUWMTCx1GC8YxMwJCoEChgMP/84LE/zUy4mAO7lb0bjllLtPApsLDCTohMDAxQ5ICMNJF6Jv5oInvgs0wJcYZFa0yoWoqlYtUWQ3zbo4EifFQTOcZdaT2d2VQuvdckvG9M/Yx7HbtYB+WyBgRVT9Yy73ekbkueJjhvQpAbuU64Vj+V7yic8rbDKHJ67D8t+6j0Ir6MeKmWyhFdQmGaDeGS/Zcs+IdujRbSFEuFXIxVaEiMYpzlKZQbPUUSJB2tQItsl0GA6cVr8Yag8ATmARDGDgcGG4/mtlimbRKP+Dg1NbArP/zgMTuMmLiZA7m1pzAc9TGwABwIRGERkyDJQBCTWAVBkoB3RhsFIjB0zSBelHmya9ma6odFJjgNXGEGEQyqa1noNgeSjbFyYa9MQwJEzTSFITSHVUb7tnm4ZeFJh1t3sscLWaxKkkZayqI592ySd59JZ1lPRyzvdvPe8Lz91mPf9XH/o+f/7w59bvs0My0YXcR/LtGcL02yDGuU4Za+1wEC75Gc2IxtO83nWjaUDwCmLs/u+0quyN3rD/tJn7X9f7H/+kH5rbKlom7Gs0UCY3/84LE5zayolwW7lD9AiWyI5hFoF011kiQ6yHEjU7Ir6Wz5Xqi+bscgJP0fBUanZVXf/NuQsd1o2tUVxb9Gt6f+1xI/BBDvooLE0PgbK++Ox7ekXj7N1Br/NyRUCt3yznVPh9A1O29NKP9Fryt339+VTuf/7etbTc07PpvNDhk+/m0gG0muPHV1XfgMmvBOXK3+TigHPHnO59zqH/ToVQrhlZ3fec6x1SqAe7XSUKhh+p4TFwzeiSiCRQkIj31MBKypRIDPlADD4gMSRIiFhBshP/zgsTQKeqmhBbeVl+0GiWmpSqK4ZMGIUYfEY4rakxKXsl5YBmPAw2zuKsAnXRSokJMcsVXj51WrCCE1r7lzduEwgTBeZQ62HliQPCyo1DNWz1h244m8sQnd/3RYPJpVqO2nI/zZ+Sa6/9iiy0M/4t1d76ZNXVxHVRxNPJiaEzNjBMXWLSwvDD9nhCejra7ybrnMPm3ET9RtioAEQvN7DALisyxFTNolQCBA9PQWc0kVjEAaC7BMqswzeSTCw0AR7C5CM6iEmFrB1SGAA0GAYLA//OCxOwseopsFt6WmHMJDwdO5rAAGfQARjGBcgzSmkDDZ2HMqLcsVR0i7uAJWHDrNdWA2svco+iM/6fwkhIVWM8gB1cOM8LVxezDdrkT1Fkw9PC3jXIDp6XbXN5XsqioJrmuaftKBYEcOJKH0HrdSFNtU3SSFk+xnN3c11KJupOq0RCcpWE/tOVPfZYpVjtY9Jd3ZWjcqpYodkqfpKRDNydMMhox4jihnjA3MnCcyLtDMI9dIwsQzfQHMjMMxAGzHAaSHMSiwIGqDEAQCMDEEAz/84LE/jF6ilgG5lT0EGMrmV3hPVB1WgoLXEOcRdQ2CItAHD05LjEmePPFDNBH1pV6PgyFWCQLyTHtNniMqa/TP5GEMnnkEzMRiU26dsVrSvHFj8/lUd3PCpYcdNy4dFIMm4YxhLNBix67NxfUvfnmVddeype1jWM/9PhkSbpthNrJbWyr91oHFgfB958H6z6oYP9bCJglVWsU6ItEsiuhUhJsqDmAAUdstZ9TolF1kk5pDM42aPGls8YINHIGCqQt0MEWQCSBqCgyrlzWF2maOP/zgsT8M/qOYAbmlrxZcaGs6m36tak7MlUXiEQpSFWgfrTiP+GxNU5m+tFFHg6q+jR2GzrOpK1+a99ct+N/Uf7+tpk0Qs1eyvqy4xvMVhHOI0PcmpLj9X0WdSNet7UqxPGdSumfevj1rSvtf/X/+8Trmf4e6tu29YuukNfM2dwuJ2EpUyJZrOxTJRO2m083C56lRuEsQb1/KjvgoO7MuKOQ+nbQGxZhYOpkAGgikyoB5J/WIBI+aFQTGQsw0yF9zLRg6giMOFFHwQLHFrJk7QYI//OCxPAzWx6EPtPXPhYCIiUKEYelY4ycib67YsbWVgQTHjBOmVq4iDMp1mQcFr2HQQiSVh3kyascAeN0ltkzQiKiiJqW5Wt8aBii+9krryXkVGezg+mOe+Xmb6bEURDj8yKX88ESAYBomykTFBXODWlbpNXURTZ/qZNqyVSb/99p0PyD2y4Q/f+sxNdJv9Ruh6n7mo4PFu//ERxVp//BEKV+FrWEl5GCoAn8J7AIjDMFuTVIDjAYWjB8OTdWOgNKxiMDxiaCZzeoBmOuJkgHxh3/84LE5i47TnAW29stAmYKAUY6jIGCiykRBCBBTJQXMCwMNkAyMKxNASKGfiwOPDLAF2ggndQhFzR1gkEjXY82oFLLuSvpB1lxnJW27tDQW4AwJmYAzPSqCKywYX1RbkriS2NPMOEJMLsjdeKOpRTr8oD6BuqMxnhLDDZ5bDCvZB9l/8uKylAJaqZaq5551phvEEIP4PBcLjsVCr6AhZFCm60Uk01IIFc+ZKtshY6JSNG/2y43UZisnmutReIVZIbrEp3afe87/o96ovfF3DlLY//zgsTxPIqqTATu5viJKgBhJ/oaFAKcAEpbkKtcsqFxAYiBojdoCEpVASAgDzDSPTOg17vUBtEUa+rYrOy9tBtkyUOUrdo2/mG4yNfLTl6ABquu6/d1l82gExwgu00QmUTkFTVmCop8mQPohBhtOy2OsmUqJOA5HT6aiuvURIc4gIlEnFHlpn3KJkNZg6ghtBX+ou6+zb1JpderUmQH/9RO+6hjFpeSpeXv6memX0ElGbq1oJOyZlGhFQDQoZoLmUBJb+itoCR3KgS7Lt3BQyE3//OCxMIucyJwHuaifGFhMxihBVWOBAJJDbpoiIAgCSkHq0wxgSUTgL7AoNltK26ei1lOwFItgDDlOp/lX3ICl0rMSA4qYEICQdSvnGXQnU05FM5xsgBE5akwp7r7v3Wx3DUoatweMVbQdRXsduXIDhDn98ffhSQEXJNjWMf775pGUDdjRX1d9blzrMAr8Zg1/ZN3/7UCsx5v2ocg+L+gC9nTNEWqvpu2pDsdJlo2sqlTDur0nS9TijLQ2pptx+AGhIW7EWfR2CxtNcAFdpoxuHP/84LEzC+7XnAe29VsECGASWZfGZ1dkGkRwAhiYEURloSmaxELEEqh0hAZlsXAYWMDMHAsGjYKhC7jozQYJDbg4WTTAgEsoo4o1AooJCQ6kOYjKDAEhOkUUJgWGRELfQpEQ2FxIBZcnYwoLRKCMIdJ778ZmTDBVoUvjdNZnJdgpClqMOAAT2D6tK3t6zrOi+AVQYY2M+Z7192fgICx7H1vs7Cxo43ZqREJTmt0zgPY//zC3pAZRlVBQS3/8z61/GgoXDsofYncMQhbhTYj1Kpelf/zgsTRNCMeVATmztwalJLKWNCTlPQCfhYMOCSyJjMoOOtdHRBiTIJXhghHhbICKSuaYwvBdkQDHL/oEmPNu5lSV4wUnVMLHXrFpLPw0/DZcqSYsNzHgVvDDO3Q09HUlEoSm7UsZalFWXOXyxRhxKfi2GUvy7djckBcChzj0p/h49fqwQhvZWak8u9NvxdP/+QbGMhnuQEjasUBWYbnwrGHmNVq9GOalkVmtRTm3X9NWmrqf/fdLoxuT+p9XCQikxQEPSf+ok6aVCahpgVaAZCK//OCxMQtA86AFtPVo/zBAkMXKIRAJrBZ00GIzVkIMLAYED2IhwtboW2WOxl+EJoKP6EkrCQ8ZC90zJJDcYeGAOSCIDtZi8ceMBFdHFkEZynYoWACrZQ0y/Yg/Lc3+a9PXIZWu3tb+UdMvFEC9Yqylilym5nc7coUqGo8bs4seyuWqbepVLGFpeNiKARDkcleOcZpKtr31ciavUsqn6zIsqgsyD+PJrsz0XUpNVHR19T9brJR29Yd1pzqJ2anPKJPiWP92ViEzuaLqWxEU1kVtqv/84LE1DXq9nQe41Pk6mx4ogDd2j7iIFHBAALA0yiHxqUg0DGHQWZvCpkUOIQihNEQ4NN1oSrAsfiQEkQ2VxHlbCUCwK4Z2CBKDJiAeWagqOUOVQNxWYyZFRCPjJEtTaHo+sDZlD7xp0RaZFJ9lth6xInA8JlWVlG2J3f1luMo2xTV2WuHev9xww5EVdwduIQrf/vnd43+KEQEBaZIGoTVZgMC8azbfVTgHRYNd/a1kQmM/qcVPz8F9K6kBpzXZ/UoK5GpgICEQYma0K1uek/MAf/zgsTAMTrmbBbmlNyJELHfJxuW2al5voOzkwOFDgVD4wEJMSQS5NdwQUgmTy5QgM6S1QESnOROy7bhCQe+o0AEw7Tutc5SYJiWH6jc3ixgBANA/3/X26C1cKtjJ6Xa5xlQKA61VNApFmU0Wmp0UJJGdEOir+IwhRBCf2/lDP/1ECHG6/kCKW/0PHyZpsFw1fSIVjl2M//8AwatzxkwjyEaXwOWJ4rN1pdKf31+/9FpwZ5LGsU7FUxBFuW23IJOgIdswVcWfwwCAg4seJryDA0J//OCxL8pIwaEDtqNdzUXwMTXq3dWi1bkExbzahBrQSYFOSG5vsoeOTUMiq4S4oLdluPN9IIG3IndAY1xmg1mUR8YQRdFHKX93BsKjZkxfXr7sPYLNIEEmtP/HwZOrq2sthRbVX1S+9bdamWyC31MgF7VrQczKNBkGRs7KcumAWOKQ5JQOCappTGp80sONemDUZPywaidTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUJpbJKVtGiiqXRjQ8TRUCoUGJjaEr/84LE3Cgy4owW0ttKasgiEhowyGMfAnzZGnlVuv88FqDRYCWyzUiCMYFwsfNKd06qlHdnmeloKsatfq/XWd27euaof78iK3/iCHJyTIcgvTTiTCkCcthU8z6/8ihJUTr/5EQ32apJJFRUHhfq9Q8KZxLrZqSk3WzGcLQdd0nkU1fYzNkz76RCOPfeYqafOfdJJ8U3f1pS2UQqE5jkDhCFhgtIhhGHwgAEw5HUyOG8xSEdWAEhqZJiAZ4oAZiAaBiogXmXWSdXgiCio5IhlhHJGf/zgsTZJ2sGhBba22oyABILPo/F84MrWmVgEUq4xpwoCxJj5YGHETroaS6kmZ5KCQSotm1V8pWsATCoVR7zrrCRqas/+Ntdg8zY8bi3dWVpF4nBaTdyRIDanqnA+heBdLi//Ig6P9XeYD4Lyv+o/Rat/qn16lpDLeut11MyjFCtlUKbO/Udd1tWcTpU0SJKivJNkXfuZwZfUbCf4WDIzgEAxgEYzTn42+DwwZH0w5HwybYoLgkUAuYGB+ZgCoYc3uGHYUC8YDBmEFYPBblmBiyk//OCxP8xex5gBu6anIBClEc2FkA2YABHACCQAkhQ0kjBCipgpcioDV1ACOAC3wKEHXhKPyYTmxeGHMVTJlWBUEbWMy8ZWBvHZl1p/JExGW5d1zFQ94Ksw/8WlVXKs92qsbVSNjxiLYXDNH0HICC4jPiBFpN/uPL+pLUZImQzg8/sqtEiNZsk+tTVHkFaSbDERoXra9bM2kowc6Lno01fR533h1wadVpn72b9SpdhAQqMnfuoJFTVZ0XdTIkw26CMSXzLQowIIMaNDpgE24dOFDz/84LE/TXa4lQG7uS9iJMEk4QYEBoZlnoZqwonmoIzlTQ+yX9YJlG3bCpYJVTHRFXcsSbHQzGOTnfy9G0v4GTkSwVIy11dtHls/ecPYg2IgSKn5ebjcanD7yYxMd5uTGW0rfNEbecJBybYieJMjiv9N/HEmX/3DKh2ViwyJA7Dlcs4QydTGJm7//o3Pt64eR2f+3fUc3ccTbWMiqnqLf23QHvFGGln6Cr6HxJVCnJKZ0TcjotkYTgoTxhqNYCTFhglGUPwoTIMGudSQgqBkQWAgv/zgsTpMMsebAbeVpibqmiYglImtVMA4zkBIFm4ECjjm3IFkzWTUiS7MARnkBQyyg1A32je5RLaxcOXy+bnXJgZjUYpZXyURpH2M36GX2Lsh8XEAAAEADRe63PGM4cB4KFjAbJ9iCIAfEBCLkGxaFfLlmvPcVygpNliFMG//YksubpYgLJ/jAyCb/xiUFAiTEzJcJX1DMHY8e5Z91//K10ICuvUR/9zHE3/+MxA9Yx3J3SCTCnbYf85MEOWmOsi48xo8iumRFBAZGsEiDcpTTnA//OCxOkyq4aADt5Q1u224ixV39GXbex+GDut94eIQw5jlTU6wAMrULVJQz8zTE8p+p+OMlX1CMaG1lxcv5Z2as6mFW7//qmJphEAHcXuhynG2NGAhTmUXr7DovExmMajeqP/+m36JR9Dh36EJn4qENTckNN/zdij//x6OOyTlmK6mmnqadReuqSJBkBtX+zS/Yn+Y8bVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVValubZR80SCyAEQ9KLGkeDFgmxqmFB4RGC+P/84LE4SlLnogG1hSfIgsZoHnpr4QEhr42kRK400i3I+3uXTGgM3TVbv5KnR+fO/pJGHcpmx+SdXd61g8gWDxHut4ZQwgYpGwG5xpHVNBrkw+iLgy1IMcZuiRhzi10mv9Zr/9hAPC7E/GYhfhv6l+YPk+Hhe/9LsMM7//A5DFfYqzdTMh2FXKYq3w7XyGPkuqTfPyZeXYAyRswCAAy5PExJCowfgwBAoZSOeakh6ZAEcYJCGChOMOiZAzyGrw4mbYKoXJDmL4HKlRVN/ABQKfGOP/zgsTeKLualBbTS4tpIgOAI0XGNkqGJc5qUpfqlOsRRYUELSW5WXAxUDjJjd4GeRyEwBFRJeS8ssJWPlMlC7AMKu7dAkHAuZR6ms/uKrBtN7fpDCgNxZ1PKxzVzCGkTEfgUopLNx/NbaAnIfgFFRdMyyNKD6iTPlCqv9SBwtZvrRuYt1Fv9b+soN86Uv+rZTf/zHWbAg8VSYDeKk3GaTjmBNnpItrdguETChcMLhIyKuDcQkMqMo3+NzKIcFBAMCcwcVDUgOME6QwoFGKO0AgY//OCxP80gx5gBu7avFA9bJwn4QGW6WAB3F6soGHjAZnLFYBd2XyI/Ykv2EAShmvGGnKCSUPRmj1kqqY4k3X2Ys2yX0Cm9+g5ry8YANxT63OV4anL1WUJnyKCGbWe/9WASZCYLSivT2FwthgDSsXtHr+LxoS//eOq360IPl/1L/k34qDqFs5tza3ZU2R85Fj9q1FVYJEH0NwoXHuR6js6FCnbIiqBDPgeBxNMpu0I4hByDTpWCxrJBAYOAoBMhiQHmuSaNQwwSBRUICoPCAWpsYP/84LE8TADHmgG5pS8UA3Nito8aJk4GJpLvcoxEZZGF2nshLCmCbL/fJ2lHTQAoFkmpqAWcEIUoTSKO3bLcwAKq2KtLKUNRklE7dnO5Xhy73GGVNLzGH6xqc+7DgsGE46yGkfeeFMAYDRVj0OfyE8n/+YaX/yrz28v9lL/mr8XHMa3/VFdH/8ePfFpVCkdK7ePXUQfeixNTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUIP//zgsT1LqseaAbmlNhluvVzPNcccvgEGyCwgoAyPiSwkmFv2Rw1HFvZVwuPAOJg0WpydUj/5hAm8GE8hXajBpL+/uKSZVJ5ggdqDILtvnnaCrFz/ONizIiI8endSURQYAkrkBdzG8qSp7fPIhEk89/UqXkh3NL/qSN9ynxWLq/8ouRu+T4726EZvRraIlCsrF2A8oCmVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVAAsd/lTDTeKoHGJkyKBucxlTOaHTIw1rhZYVFzjRQ05gDNID//OCxMYikuaYNsvUzgKvhEBy5UaAZJXvO+hj4E0ZLpkMAs2m7tMsGOEjliEHIgl4JdLyIao5r8NXwBkSmKo7LMItlrtjYr4Bo3wq/5g79HIeU57Mmb7/lHb7sqeeNAmBXOUZY/JTOMwpxCmHb/qbZ/zC9G9P5X6Dwj+pZC/892U0/b9+M5wXQ0wxpXGPaRZVZGPJyD9qAKa/z7IjMrtgIxAqh6TmBGyJG0wMPTCwYLRiElmPi8YbhgkVCZEKGgMpWdMnTDFrIW1g1w1rKSbWnDn/84LE6CsrHnQe29VIdm2kwlQZo+5RIbU3dCQPSDhmb626ejjSdZEUijuRuXyhG2k7Ty/NrqEutV1znbBggZjtDmLGMOjq6iktEpqOsYP1sYifAm0kFHp1aFU6YPbQW/Xso/+kbIl9+mk3rJ7p6niVkg+6RgYIJN13MbSp6r/8qeyqnbWqkdf9XNLcrsSwZ5wpyFbm7ciVD9v65ecx6eHkoRUgGXjCF8S8znng3AdDioRgBwQWZy1mfA4VGGbA4lhr9nBikVWjB3hSMOAFjG9dSP/zgsT/MRtacBbmmp1qHoZSPNUZiydCSVDLXoUxiyqbrOzHoaTuWbKngVDLqdWKnltmusiNNAs9t1d1eiDY9g6YPkbT/uoVIc2ZT7/ph9IJu5r06/+IK6gRzrmPOG5QTzQ+bGV8SdSXxo4ioZ/7ZHy7+2DE/8cEFLK/+bSr7r75//7ReOUiRMNUtISYfZsGhCti2LNgDSqDXUpgIABggbJaQwxHQxGBYwYDwx3BwybnQybA0BCeMCoMCWY0HaYSgy9BgQR9RqGyFRg9yiy6ZGdA//OCxP4w2x54Dt5WnHhcuBtixGZUMA9rtBOoHcgkJLiguEy8INQ6FCUP08mirsCQuRp7A5W06oTEaLOvOvECjZMGhq1n9T7JOzDcCMnCuFgYhaR5qoFGLRWcSOdmD4bD8OvV7icyNcmyEtc74tFjSg2IX8odHW9v5v5N+eNENTaQORzHMLQVfqLN2ZzSLoYv9qIYLniZVg9B2w4BgrMcSOMHQCMMTdMqgaBCfERgGg82mQJVBAYmEIKAqBzGBHjF0BgYBDAMbUhDRMXBMnmRwHX/84LE/jFC5mwG7pScmuwaaEAVXNYFBACQUnlH+zQhBDVxlGpBGwJkcvgkIFI6SH7OqRt4dDAIiK7T2gIakbWgEJwNYs4PGpcLANd+bG7G30D2bHCRGITQ7jAl0UTT0hrBYEoZufQ8rUOEllvqJMkFN140XTf5FZjhu/9Rqn1N/NvzH8zPdSHr/hpEiODx1RQOtjngZmUqYwwIdR4OECrI04DBgz0QgEZRDUTIANMRwIeOp3pamhCCYKDRhsvmiSgaFZQQ5CqTGGRsKKa6Cx2OgP/zgsT9MoKqZAbu2pzh69ZEcASKfw7aFQqjDTn/hiTqLmMxOKqovVeMuuCgGYCiyGpc4svMAFWGm18FCiBGqiAFRZ9jjRwUAk81SY/vUKHMtNIDxUDG5UP5k71OXAZSsfTU1b0TQfyA3mI6O3Pnpskr9FnRMj7f1G3qNP1ofUP35InUHVTqzJRoPxrnqYLNtW1avPL610i+3lRtEp9nsQiMfp8BAsxQhRI/mIRKLFU0LXgQETC4KEA3DH4YTfo8MTAoEa+ZTATkRgTZiwFV6+TU//OCxPcwKtJkBuaanIQgvgpSOCmIs0ffvaYUkyhtmz2Y1TIDqwyXeSw88SRvQskybhavrwFzbFyzfdwuLAt7L946oaLmOSv770z+3Wx/esMAKoiEY75hogRMbyAh+x887t1exQu/+Q+g5tzBr6GBXT4zmUujELlWRihyOxRy6TXsYTNWPBNbhMAUOoN0j3NuTKaQM6LqD0jOjAAXML4JE0yI6AFIzCsbNGA80T8zNRsd0wsPjbg7NaIczmIxIYPWaqEiOTDTOBtDAWv9Yh5gII//84LE+i+bHmwO5pS8I0pMETVQdV/WswMIQpvYiLYoXqMIkriiQR/TAtLdV/H3WEKDsoiwGZRuCQUGa8/WFCvBgKTctl9/9W4Yx1flLALrxvdVbzHmo9P4tiVjl9S3jlz9akkP2whTxcKV8uRSFv8q8o/2vKdCIt+cTN54TF+PSZC2tzXY0xDHW5GrJdDTo4z/6KixOyv2usRe4lUPRsjFAoas64UCAJ1xEQjIkvEI6OnW4wUXS7gBMRn8liC6GFyIOhcdFxkA+hADBoAMdsQCBP/zgsT/MlsiYAbmlNyc8vcNaxLImCARi44JBCrm7rmkSdBwgQRBphQklElJPKLGBA8GARDdaQNagFhiYsPKYApMk1IEENaXTMtbIYWCJWX7OGVTF9kCdffC+Oppb9A7NB3CG5/HBEuCMq1Nvu/+an5oOZsw8NjPHBQwu/5V5Ei+969xgb//PBbKb7sxKq5iUQwhOuqGm0YzOIy7LKBSEmuSgVu6Gf4dEscEq2m460YcAxktsDyZBw8Ncik52sgU/wuCzAIPNkgoij5ngIgECA0D//OCxPkzwx5cBubU3JqcFIqKrmE12rh3GQkWEQfWJmIMtJVilcr5KDzp1omHQCgBLbbtCzaNgFFLpG0CbRCRKviogQC4ei48vkd7KpDap3LtTGOt0jRY1vkeSipm7OdSMep/7MowYghBfj1RihvOcG4W3o8ZjxGzi43lW/1eU/a9N4uM/PPOdqwKBH9delV1Yh5m1q3YmQW9nUtt3+kumlNcN7RMygDzJbHAR8MMNQ0yQTPH/M0ERd4NJZlYVGGpmpIOBoWGppAZRtLwy8hESk3/84LE7i7DImAG5pTYVdItCC1sCkzLmHBdyJtblqh5zgTnGBHoQu1DC2xQNEzAG5e98blrulA643IHTnXZ6EIKSGKSm6HCZ2lq65V5YatzUrXpSsYgaldzHn1DSBHAwaMOFUfymSFxneytUaLm/o221//6FvU//v/68wfFf7T0/1IEa1/G1fc2YdTb5e2ppba90Op9wkWLxVabTeohUQVy6aNKD6oL33cFIo1FGMMFjII1eQJXG9MI6DGzcIFh4dNgDDWEooCi9bAjPguBHeKEIf/zgsT3MoseYATmltqhRlClhgwCMhrAgACwLGZuYjYoCQtQBPdrkBtYIIA03AXkKZi4KCEZkFdgcDrSIAPTcCK/URMEg5+2Naam/F6Iva6fUe697U/Pq+Gw6HW8eGx3bxsyux6Gv5pZDE0+UeUIN7K/0ERDeYyjpPaaAQ/rPHHPuq5zLV3LHHGuikx5wbbF71u1Z7yf8qKve4nJWWhnP+TExepMQU1FMy4xMDCqG5JdEoEWbjo0CsSYMOUC9ZsS4lHbMIACVhn1IkhL/UYKHv46//OCxPAwUw50DtvPMUIxDirLm1dMFbQslGKe7AT+ukDRMgZBC5dAmgMyWEdW26GcwnqGR0whrAgg4I1N7woybSfbzFVuEwT2gXbdb3/62rJB8jxmi29awoyhGKmzZ2ta0yTepLi35ykm+CgvRtUNBB348JZ0qTMS8cAubI1YOh9J60ofvUm4O3WRCA2wqaME3DzYbUYqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqgSktt+KAJgZUMlIm8DIxQBMArAxBW7/84LE6CsSnogO088yVqFh4EfiQtsytqFD85wcbojKvOUvrMDBdMe50GuxAn6mngNEIVEBClRZEbHU43a0s1ORV++feOZNa+2pYgwcMqVYTmlUyXvQ8d/uGcsXn816HVS7x9h888gxUt+pJj3XE2nlFRepBSAjCrhi0y+/v18zMbxv5hb6uiS/99znV+Wtlr/d6m9/xSpMQU1FMy4xMDCqqqqqCptpUpYROYGUAKCgAAFuY9YqCjILUpbRMI1EcN43jXQYVCFlDMVGgnBMqKMCqP/zgsTaJ5KOkBbTzruPLIuEQ4s+Cjq7MIHZCocts5hkuICb7ia7MgdlFUNRoG0pnDoRIyW/Gl6M8TzC5j3TXZZQssLnRKryI48aYNQNj5UhLPKmrGpCcXH4nkbi8iPTPQYBRD90GTSpuj0WplDX/qzfQmmeMidfy+/LuEcRqELR82VPQdRBEudK2Ndt1oDW1re9GhDF20xBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVFu3b//OCxPItuopwDt5UnHH2BwsRFEm1C/Yk6X/XrZYizgxWFWWWurjpNLnnkovM2COe70sDGgF5o9MHHkR9eesT+mrMEZN2bINQJW0opgxZcq/n0qWJlF36oYId5EZIF01fzupAxupv5Eex77jJ7d1TZ8kS76HTUZ2MNot9H1Z6OYea7t77K9Kqr/dT0td0kE0bMqbfROCFTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU8ttqkIE5oxxjEjUz/84LExyLzrpwWyxTSUEdwEnBxlpMLa2EBTDyx4CzZIVMQxcAOC1MRR4OK0XuyJ2pkPbAvMPo8JDWIzdqlLVT0EkVaOdlMtF6ja9LWN7/w64dg4gOQUYaLTVIjUDD3EbeVgbVs///Uv/pChQ7MomUIBq08ciXwcTMDQHrKna1wIGQzFiMRmAw1dBV0IFmZAri7nIS5nhN2SqZGFB6d4IBgMKGeg4AhWaILoPDwBUBkcYGAQyYUCQwGzVDfNAhUwkGDEAHMdCFA9LQyeMg4EjBBRf/zgsTQJUKSjA7Tyrrl3h08HVGwc/jvt82MFbNOOGF3JENDRhDbNKNZ4ODa89KDMyEWztovalgSgK7IwHJ3K34vMXGCZypmzmaj7LoeZ9XpKvyiF1JzDlPKzyIqFozE4m9TBHAJGyqFT7O0rWbvoqep5p/OecQMeac5Q5G6KqHUoWIPZ77uv16fq/s9rX66s71a+zparbvmJq+jlz6LsX0qTEEAp/+z0kLDFk9vTMwVG4xS6AW0YeejRMXxSXBIIYNxGCiENjQiEH7PpGYYmu2W//OCxP8zm/5kBuZO2ACFzSVlk0jSO81q1PoGPaBBT7wQPtFmkKANuuBWjTaT6UbnYQ9KW7NOL1y7ePKWQJkW7+rVarJhMHQnQOkA4er8M/oIz+X/8C5IUq6jlfG32P5/lYr4+Tv5pZr9fRr+KpyLnsfAjHbT3FomnzGR4Q+cJ+2tOy56/+DlRn46OU1zzTv2ZOdu67sqTEFNRapyWtAMBgk52CDEINMkCsVDRh2JGLgMZIEBgQMl4DAoOMGAI0qKgU5TAIQMOAkChAmCKthgRLP/84LE8i2i1nQW3hDVLhl5WJEaQhBYmI3GGZ9PwIBVQXQgpAzNn7CA1VgSRDS3ksZ9iUMgoRV/YZbZfTEwIRGa9WQbegRi0me2yz/G1hMG390um5ZVbW/7cbB0Tc4SFfWKRuMY5qY1HmmeOuq1OU1GJe7lW3Z7tSdc4tSzzVo+tCF+xmjy4xO4dPKQHd8dMlnBZhyL6KIySrGGCmc8NAKJBjsOEwsFnGRXgymijBYQAgCFhAYIEJgLjkANEAYMdAEwcCXRZCZTOocABG8LEDSjrv/zgsT6L7K2aAbmTtg92Rr20kZG04ijes+00LSomrEk6FhG7gEJFgFEIX2lsswJB1fdZC9C2lJECb7W85DitkGEVZdaZg/cBUzts9hNNP5MKsVJBhnO5KgXAgQwmMMa5g1BIM0FRqFCWUqcRRNU/0f2lW6HqpBttFqe844yf0LKWrmNK9Tafto5Wzx3vrfn8+lq8uWJ/973qqr9SLLVTEFNRTMuMTAwVQCl/8FoUGkqoMAgcKJyiGdR9MDTwgYgIDBwcLmxFg1VoNEyIKneSfB8//OCxP8yyyJgBuZO2Ymsh4lgXTYGWiFsXebBGpCsaJANGLPqrHJU5Z1AC5iYaeWpRPq+kFmT7gBt0MrNJVvVIEWH1n9N9+LC4RCyYKB0fdHN1Fjq4iuvoSaYTIyg88eY9Ce9H+e9y/nHL96lrHNuMpb4rWtPm1pmJTypzeo+CIbme/T7rY99rPfP+Xx2rzn2+ZRNvqpS3P6FQMZ4GAkTh00AYoGEmeZzJZhgWGJSSBQgYwAgWExjOJBggHjwsmHhIWtMP/yDlrFBIMCTgEjgdc3/84DE7SwKcnAW3k6dMWNZf9B1MM/4nIbZPqqXSgYAnvOzRrFvbgBhisEhflz7TXgUy0suGyeWSR4krKWba3D8jlc+OgYJyjMQBwnGxh5YeEkYCYWRRWI2TUWh8TzxmjKY9WnnVsQGVqrJQ6ftZPSpJ7TTr0qRM97s6v7oY+qIaex5/fnklr6VSTEKecvfSgLEoieDcPMEp+pMQU1FMy4xMDArdtlqjZsIKCg4wEHJggDCBlJSfKmCgWjy6xekxdBIggIDioHOo9slAhG+80yh//OCxP8x0x5oBuZUnJ8/jrrtldFhEk0H9fWE7tyiE4Q5Iomx3dW66zv4RexqLsWroBG+3ungfmMdbb/5SRqXWq+NeE8vc/c8yo7IgTFn80XeU52qLl05I4Veoa5jigkGu+jTsu9RV39hzb6/g0BxaQYNMBoUkLJ+msLuHdKef27EVfKH2ZspVyQ7CBn48zXGPxejY+cbDtqtwhK5vwxGDAuIFKXqETyMy201ybAcbgg8mEgwIRSaGg5l0FlgjGPCaFg23UwOADCieKwGSkhxpg3/84LE8i271oAO2UevpAEhUQBYpcUDBR9NAYdmrJhCSlGkcGLs+B0FQlGStsui8aEBNU18eBX2/zZxbBmRnuK0PtZXKkRQ8KgKXWNiKyBmdNf5kz91dXf+zXJ0ODY9R8FKJxA25QQpd0KHuqqCyWOU5XKKhL0fsj/obzjljm2pEQ/NKb6NPShyEbCA0o/QwaITD6ZIjjXeRRWsqNbZWBlalUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUQYf/zgsT/M5LKYAbmVNgnLv/uCFNYpDUKTaJBhzKZ7asHihHmwf6FcwcvlfCY7rP+Ycmc2BfHe5TSlZZ/11WPu/t8PmathH8Ojl1rhbTQvN2ecWqofc/qVkiTVLcYm6JQr0CT0Mox/1JW8pB1ekWVOUpcuYyotohY7K9KK1FWiyDra7WfgUv+HCFzDu/I+fnYwUZhpz24CkxBTUUzLjEwMKqqVt0gMCgE4OMxoVITRYZGLQECl6d6DIIEy9igBGFQMZpOA8jS+Zk4HF/FWMsH9VRk//OCxMYimyKo3sJLK4S1szSVeNfTlbdY7qNiNIxpRrQvk6JEG8CPrtC0M4y9PqzI81JKH3luyyZlooBPhADQ8a1pZkdwlKLMs1TW7kV+71utHjRc+p4hGgQsgAydFQBdGysV5VJWi9CaDxL9bezQxrtojP8Mfb234J+uPvr7GO5vfXrZP9/2v9Iit3LYPuQCbIL/derlTEFNRTMuMTAwVVVVVVVy3NaCxac9DDIMYBANKMPQzYsI/5VHmQiDjCgkMOQLql+REXAJpMMA1+p1Hfr/84LE9C4qTmgG5kq9J0Jvy8MsSoTPMEqyz+UtoBqlQDYzrSloUaQ2k4cTClAVeWWY5uCtqjX9L68BAwGWAkicmcYmozKsoIS5ucleLdM+xG+9MLyu65XvhisGDnGCyH5xeALsNY1Gr2loryHHdxn7KV/oOsKIbYTY5SHwcYIhia0UNLUFMk7VFnvI5ZyB5guFSWQLOQpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqgzf+5LDDXNLkDJ5MOBQ/LEoJfwMCRYeXcJKgu0JHf/zgsTxLVpOaAbeSrwQDhGJk4u9YI1zaStYmKXNQhYvF9IlJh1FSkCCUv0cyhZOhBlaHlm0boVb5QpZdSeguWopWywKWYqKgKlTQUHajhojEojHKHudsYrFOop/U5CSjr/NfL0ox9x1pisU66FXOLEnf2W1voMi/lC9tf6uYqI7tPSKXJi93z3/7a9z/4Trp1a69E3+ThaXKKhY0sujGAiInARNUEm8ziXj+rLM1EIVEJjs1mlxOI7AEFQyOKzKxOHAwWcMwgReGykdRRloqXCg//OCxOIpsipwDt5OfQs0gsSyX46i5AUQSTHhaZ6YABRrk6h65xOBKB0ncMR42BE0RkIkJXIoPYVTbQHUqGGkgXsc1x9JzRaWLaYu5b+I3hga549NuJOUDZ7kOXloFtGaDUgbhsIAEsxIdwJABA+jvXpIenvY6oUc9T5QepbOJ2v+oUYmb38z/39z8MQHYZmiJ+kz8TP1x+mbvDGl/7qxpGpK31IelnAYZqecDwHcXMqqGnJaFMs4J+sYsWTDFLTDrxskuFIgYCjRMwIsSIq4Ggr/84LE/zeStlwE5la+vx1ZYXHnRUsEg5BJpUk/WgurUZlAEBQMyOXV4AzitmLwfBiG8DSBk2UYxlOLT6YRglPi0Jxvq7lfRUvn9av7Sb9d5DJrSFeNj4b5FMa19W+xsZMNN6HaNXQ6iecjS6e3Vh39BLQqRqDh/+sUjz0PNXrSjf0MolrMj/02Y+/Wb7HnJ5y1HVXzfauHCkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsKsuy3f+z0AGjYgLK2MI7jAIenQav/zgsTkKrPWgA7Tz2ug5Q21Whq7Vyb23TExt0nmx97or8JO8s/i3MXxbNQ9HagLDpn0u2QhChFfGfv+31n+y+2XiwVZ17+NZcE1mcJmFxzCq9tKiGGelYLMhxae89eXtUGNjyTVcpKo/p89vqSLmGMeN1/3eVDH5Odle/h/+pqEnq14ipwWEe+gA//9eZQVHbZGNSIN1TovmDAgGsxCmGAOGDh0GVYbDB1GORdnhQ8mKI5GFhVmkWPmbQDGQB4CR5mBwaGSgoGF4SAUHAEBBiKI//OCxNknSrak3sPO+wOAMDSjNDRMCCLDACIQPAjKzIVDl1FlgEGluzTVxkwIESIDjwQhkoiZEKp5GKgIKCAuHG+xIkBkJIY0Vy5FxuCN6QIjGX4MMSTcyJDd4HwXTIZxpZMEytaQ4dgIcTIguAnhrIvQiUxhrxKENfl0O/ZcWvA9PAcsj6q8js6l10RXYCZYasksO4rFC55XjjajiSpD2X6lvc4MmmnKokTmXfOucJLpLQ2SJEnG1gg82lf5cfdqc5m8mdJamsqVKmkZAIOOCmH/84LE/z2SxkwC7s76JgEVAIHC4xeMjKieOtAcQAEGh0y65gMkzEpwMLAgwOEgMPTGAIQkLnMDBGABEZTGQIDhIiO8gq1NxmGZ1eKDIAYIjVKJJAK5CqOBCoUChE+VDTAyctSorni0RnGMr8QFSpn5zCRm7aadNWJTIOx4qklEjdovcjW4MgTu7S8ko6U9EHWKsVhUAYuWopbE57Ipw55G9TurdrS3p5zIW+Y6HaD+6fXQn2O/0qQmtzf/Mc/6v/sytd83yWTDO11ju5Od/82qKv/zgsTMMoq6YAbmTvXbARUQTWOQxwIAFsk8FWE0TuNhLwQLmMghpS6bSAmTwZaEqDBg4QYcArXf4tk9BLBBegwIdR1PoGE7Duv3OP2zMwddqy55JElg0EJEoYIXbc9Nw4CVpj1oco2/1K3Vfha2uKiSMy5kuljTZRhVh2lwTLFmmb5xx3eZQnuXzbNt3/+f7hyvjUU4w7lzQA9B5lulIutRPXoz0b0/r9E+E2/cpiCpskwC47f34RPEbV+okf7H95lbeLG5PlG8exrX+fzCSbka//OCxMUwcrZgBt6E3USTGD3EgUaVLYCUgiWJgVHHs1KYmBJg0IGhQOY1Dxl4imFwQYGDBkIOGHQQyqNmDgitBAKTZgLBAv6zsxCGnaQRN3WwFQk3Mx0QlrCofSFh4vEgWMgl3QYAm+gg0WAV7uoEEuwtVcKZZQYHRQGYxgCxhyXzKupqjgiE4P++RHCo7cmoV2PwndSlU7kE/r879q52Z3QI/2/1+jzTgpqaw7bOfQb/Nd7qKB11MnGr6l09Bk90qP0P+t7Fwki17WFGlLXdikL/84LExzWKtlgG5k9MHOZXunxz1RQBqKIPtJOIVQHTkuMSEByJmCN0qPoBGnJFWmamGCmIMGwtGsIMDUTXQsR4U844jwJHYIaYhmJHF+U1W/KHcd95INtRuWQl+Wvw/FKoQE3AWrquVdppYkE4HWq7ah538wHhbCti0pTOdf5qrFAqPmn965hqK/YFY5mnP25klrX4vIfigVMO8TLv6lQHg7dv7dDD075yvoOGMv1PzEURxLJGGKYOEDjJsIgQmUbNSgDe2xufc6aKJYJobIJSBP/zgsS0LYrehBbTz1IelCoAgVLDSfppNmhg4MojEwmBRANDI6hMshgxeBjCwFM5noxebjyIMP4AMzmhAcbh4osKDAUSCMEAUGZDWEzDDDKgkxjyxaB3X1ZyYEqoeZNGzVhKplK3ZBI0+KoIbN0pUCBiULXHpFh2KUMrQZAwwRCy/IBCi1ZznRdeAI1T9+jZkHMkuV9RWNO3VbDVuU2XVPAE6y3VLJtX8KXOqoxS2FDg4PFyGfMRnLHMDR1j6XSIPFOZMZHm10XEKEsb0tqnbzNa//OCxME5ct5gFuaa3BtdalW//ayzxsYoGqOpIk/J5VjlA6KLPKZtaNe9rXio2IDTVa4AypGy4AhyYrEsYCASYsAyGEkYREcYLEuAp5AocEABmCQ1mHIgmEurmUBTmAwQGHQAhgFDwRo9GAAJIczAUYgcM4VDFDAwbAYx0EBS57Xbp0OI0AZhUFC7bbaw01gKAyZSBkUAayOSvOYSgQ1dYNWKJqX0iaYpYylfQRdA1ofiKuWeyGLUznYQwbONmZlTyqUZPDdxrdjEhA1VR2aCks3/84LEnz0bjlwW7htQLUq4wQ6erD/h6rrlW6rCYfzuUlmJ9quG2s1e/mkVaNSAdxMk3U+9aPWVLKKHXQNGVUZG//1InS6NqKmdRmF2f6lopet0NaqluZMtqn9P6R89I9JEjbUJLkjZhIDG0Ca2Iw3IjAgIMjjwyIFjuBOFRIoWYOQg0hjoz9D2ecKIYVWYYsYQAusxoNkhiyA3HMS6RgDH52UbdpiKrBAA83Y2I8WGMHS8WgW5ERo0lFJmPRpswdolCgcIpFuVFtiQgmjUj2BjSP/zgsRuNysCXA7mppyuE8wrsvjsu9mSMQ9lsbR5FjEiSi8gPw7AF+EGWYG04Xy6xuI2JtAN2OgukJnS3mynqG6NAq2qfoMyheifDp84bvvWtNdGeV9bL60v/UqicIuz2WsiOtDqMD9YEHKDM/HBXdWGEXHCMWaecgesyLoA01q+SF5o0slYjMMiEMKAJGJhI7GVBahuoGYFKpkoOGBeoZZGSAtzyYMKqv4RCGZDJkWrAgS2duZogjvLHdGNpDLVMcJlaH7OWlT4XFg+kq+ll7cg//OCxFUvwt5oFuagvHH5Y+sbyYfVaShSjZccsrKWO/AePyuVfHRGEX/Ja1Wf3qj1/a0WSPJyxbp01HScRQMAepjwYHx+TTLr0TCNcVAt19DVqI8VTppJaq9qnb/ZXUerar/qS/P+zXHpWEQs692WQIzUU4yprp8Ai1ZMARBMqzjJggzB8BySQNJhc4c2rmGAaQRpDcZoVn2mwaomElhpACXPHgPhh4crYCVUDGxhoYUBxa8zMPoFyzc4YWPpuDA02wgCYcpS7gEITciyQwA9jxr/84LEWjOrkmAW29WItEyw1nEtZBYUfFgkMQZSqRUtv4Wwyreq1p3Y0CiJHbNK44anK+vtXjxZ9eNqVgvnSV84pwmNn821M0bgRfqHxlmrJrH/rqKoQO6E/9KFlZtquzVmtT0auk4svkbdG5RvnLequYg8Lz9VfVDXShaLnbdfUzCNAJyfU1CY8MpgwAmKSaGBmQiQONNg4MBBg4BGGwuY7GoJkbRTAAQHASsEmgzgtiFgIYCFKCcQhFnSiJgwCNrELlAgovgsksxWCITLM1OjC//zgsRPMTtKcBbj1VAIXXYeucuQHACPvxqMiZeMZLA51sHcK1jjrDHR/HcYcY2xWvIseFrE98SqlXkunu/h7pm/kpm6mKfDPSJD17a1f7NlZre2KTGddTAhMVSd+qeTnz/qSKeeeRffoYyT09JXX9C3390Q40ZQXOhoM5VrwOPlGkvQlQJ27f/6E+HAXlDwqBBxxLhXhmkPcg30E+ZaFWFkWAEKC0bEk/guM+mpsN4CUH6zK13qpXz/2WXicrTO5nFz7EUlHh8GJLPnWW4zQist//OCxE43A0qsXn4Zq7N3rOpKxLn+BKK9ckC0lZrUeQbCzEuVVhkMEvUuRM57IlGq76xyddCETM5T23hz7eo8o/LLUVy3j9V/Govg1GDZF/frs8bSm3WucIhDof378GAml9PEUh0V3os205ZU0eFYGK969a0JbLB//sL36d6GshOO6B+7j7mdfJtFGrPdNfg6ztp6f+nhn/U2f2QCU5tqbVRXq06Ghj5I1qECLcM5J1UKEYm8aDlPxkEC11gSKRvflb85fztHQkzeVNW7egggHHX/84LENiVLrpwWy8syaElnw46ZrnboxIa4VtK0H9G/1m0dzx/ryzf/pXTfvfhLuCT+K+OqPEexIfGvcidX9Bf+MYY36DvoE2fkF4Eagt3+sYQXf5aJ39beKIy392UjMoU3+Ud8kezPFwAcxNRVBRlGVQYNTM1CGJc82OgF4QVsRGBAg7rkzgEEaGALkZml01pohg2k2IggG+suU/mpKN6tULA1FTcIl0vG12Kv+m4MC4Af+leAoGNZKoRtcI5Io26gkTpWeESfKpHwYDh3PWu6Z//zgsRkKTOugAbTC4bj/edgqNbuT5eHV/5nNSrB9t6jtooKK450CYdXq5F6f0ZG/t9BNvc0C6smV/ejD/0u3//f/////o4jxcuptQkcXSpbMTgcVcwAjh0GZHWcwEEIaihglQAwcx44SMLkg+1S3xwXCBEIW3N1L4tp8wuOAUwEMkkUSSL5fIGFpx8wLhXC45EAxKTaRdrIqIKMOWJyPLJsMhG6qbpi/MGs0lTd7lAz+o4xPXN6kGS5zZL7v6P9TKb9Nvum30VJvU/V9qBqpq23//OCxIMm2yKQB1qQAnUyq2/rZKQBtALGkmSpslav2KcIUO7nQyoEALNNyykxL4wYlBI+YgiDBGRDYLRDCQAyBjMACzjyYcETCj9pZCaKjC42PBKchnwPaQGGK6o+MLBlq6n/mgusqOoAFSYZd5r3N8MCs6AAC4S8iV4FDTjC4S7IcHh36YyhQm+UByhLRNNfKl2k0UhncdzFGGMuRPu0kxHFzyxyqSwPGw6BQGno60rW6OPW6CDJ+jqX6bNxlo0dNDueVDXdth0GuY2SxhGblNf/84LEq0pkFow3m8gCsYt3klvZSnb7vZjzKAY1uP2eST0qU8Gvy+pDcRe94aeXtIaZH4KbG70h1KoFoMcKXG5u5hDtSX/9a/vGrjzXdw62JaEmV3A8kWOu9+3cmYuoIziW8/////////////+f////////////9iUTjvy/sNv/PyzmbsP5YzqWHfjd+johGdhxkc4G9QCcvZkKKrrOCoCkKXdLkoBVBV2taXcoEhKLlFykHlNmdGiTknJOR6RbRCQjoakhSi3XDEW4eoW40VCrVf/zgsRFKYE6dAPYeACq1Wq1Wq19GzBexcMSHMsWtXrCrUNQ1XK5XMz58HfUCoKgqoGQVBUFQVBoGnxYGgaBoGuDQMgqCp3gqCoLA15YGgaBl2IgVBUFTvKgqDQNHuWBoGiXWCoKgr8FgaBp/g0eTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//OCxDsAAANIAAAAAKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=";
function b64ToArrayBuffer(b64){
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for(let i=0;i<len;i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}


const SONGS=[
  {keys:['happy birthday','birthday'],title:'Happy Birthday',artist:'Traditional',n:[[55,0,375,70],[55,375,125,65],[57,500,500,75],[55,1000,500,75],[60,1500,500,80],[59,2000,1000,85],[55,3000,375,70],[55,3375,125,65],[57,3500,500,75],[55,4000,500,75],[62,4500,500,80],[60,5000,1000,85],[55,6000,375,70],[55,6375,125,65],[67,6500,500,75],[64,7000,500,75],[60,7500,500,80],[59,8000,500,75],[57,8500,1000,85],[65,9500,375,70],[65,9875,125,65],[64,10000,500,75],[60,10500,500,75],[62,11000,500,80],[60,11500,1000,85]]},
  {keys:['ode to joy','beethoven ode'],title:'Ode to Joy',artist:'Beethoven',n:[[64,0,380,75],[64,400,380,75],[65,800,380,75],[67,1200,380,80],[67,1600,380,80],[65,2000,380,75],[64,2400,380,75],[62,2800,380,70],[60,3200,380,75],[60,3600,380,75],[62,4000,380,75],[64,4400,500,80],[64,4800,500,85],[62,5300,300,70],[62,5600,800,75],[64,6400,380,75],[64,6800,380,75],[65,7200,380,75],[67,7600,380,80],[67,8000,380,80],[65,8400,380,75],[64,8800,380,75],[62,9200,380,70],[60,9600,380,75],[60,10000,380,75],[62,10400,380,75],[64,10800,380,80],[62,11200,500,85],[60,11700,300,70],[60,12000,800,80]]},
  {keys:['fur elise','fuer elise','elise'],title:'Für Elise',artist:'Beethoven',n:[[76,0,155,82],[75,180,155,78],[76,360,155,82],[75,540,155,78],[76,720,155,80],[71,900,155,74],[74,1080,155,80],[72,1260,155,76],[69,1440,320,90],[64,1440,320,72],[60,1440,320,58],[72,1800,155,72],[76,1980,155,85],[69,2160,320,88],[64,2160,320,70],[60,2160,320,58],[71,2530,155,76],[67,2530,155,62],[64,2530,155,55],[72,2720,155,78],[74,2900,155,72],[71,2900,155,68],[68,2900,155,62],[64,2900,155,55],[68,3080,155,76],[64,3080,155,62],[60,3080,155,52],[69,3260,155,80],[74,3440,155,86],[76,3620,155,84],[75,3800,155,78],[76,3980,155,80],[75,4160,155,78],[76,4340,155,80],[71,4340,155,68],[71,4520,155,74],[64,4520,155,55],[69,4700,450,92],[64,4700,450,74],[60,4700,450,62]]},
  {keys:['imagine','lennon'],title:'Imagine',artist:'John Lennon',n:[[60,0,600,75],[64,700,200,70],[65,900,400,75],[65,1400,400,75],[65,1900,200,70],[67,2200,200,70],[65,2500,400,75],[64,3000,600,80],[62,3800,200,70],[64,4100,200,70],[62,4400,400,75],[60,4900,800,80],[60,5900,600,75],[64,6600,200,70],[65,6900,400,75],[65,7400,400,75],[65,7900,200,70],[67,8200,200,70],[65,8500,400,75],[64,9000,600,80],[62,9800,200,70],[64,10100,200,70],[62,10400,400,75],[60,10900,800,80],[67,12000,400,80],[67,12500,400,80],[67,13000,200,75],[69,13300,200,75],[67,13600,600,80],[65,14300,200,75],[64,14600,600,80],[60,15400,200,70],[64,15700,200,70],[65,16000,200,70],[64,16300,400,75],[62,16800,800,80],[60,18000,400,75],[62,18500,400,75],[64,19000,1200,85]]},
  {keys:['yesterday','beatles yesterday'],title:'Yesterday',artist:'The Beatles',n:[[71,400,300,75],[69,700,200,70],[67,900,600,75],[64,1600,200,70],[62,1900,400,70],[60,2300,300,65],[69,2700,300,70],[67,3000,300,70],[65,3300,200,70],[64,3500,200,70],[62,3800,400,70],[64,4500,300,70],[62,4800,400,70],[60,5200,800,75],[71,6200,300,75],[69,6500,200,70],[67,6700,600,75],[64,7400,200,70],[62,7600,400,70],[60,8000,300,65],[69,8400,300,70],[67,8700,300,70],[65,9000,200,70],[64,9200,200,70],[62,9400,600,75],[60,10200,600,80]]},
  {keys:['let it be','beatles let'],title:'Let It Be',artist:'The Beatles',n:[[60,0,200,70],[64,200,200,70],[67,400,200,70],[67,600,200,70],[69,800,400,75],[67,1200,200,70],[64,1400,200,70],[60,1600,400,75],[64,2000,200,70],[67,2200,200,70],[67,2400,200,70],[69,2600,400,75],[67,3000,200,70],[64,3200,400,70],[60,3600,800,80]]},
  {keys:['hallelujah','cohen'],title:'Hallelujah',artist:'Leonard Cohen',n:[[60,0,400,70],[64,500,200,70],[67,700,400,75],[64,1200,200,70],[67,1400,400,75],[69,1800,400,75],[67,2200,800,80]]},
  {keys:['moonlight sonata','moonlight'],title:'Moonlight Sonata',artist:'Beethoven',n:[[44,0,200,50],[48,200,200,50],[53,400,400,60],[44,800,200,50],[48,1000,200,50],[53,1200,400,60],[44,1600,200,50],[48,1800,200,50],[53,2000,200,50],[56,2200,400,70],[53,2600,200,60]]},
  {keys:['amazing grace','amazing'],title:'Amazing Grace',artist:'Traditional',n:[[55,0,400,70],[60,800,200,70],[64,1000,400,75],[60,1400,200,70],[64,1600,200,70],[62,1800,400,75],[60,2200,400,75],[55,2600,400,70]]},
];

function fftMag(buf){const N=buf.length,re=new Float32Array(N),im=new Float32Array(N);for(let i=0;i<N;i++)re[i]=buf[i]*(0.5-0.5*Math.cos(2*Math.PI*i/N));for(let i=1,j=0;i<N;i++){let bit=N>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}for(let len=2;len<=N;len<<=1){const ang=2*Math.PI/len;for(let i=0;i<N;i+=len){let cr=1,ci=0;const wR=Math.cos(ang),wI=-Math.sin(ang);for(let k=0;k<len/2;k++){const vR=re[i+k+len/2]*cr-im[i+k+len/2]*ci,vI=re[i+k+len/2]*ci+im[i+k+len/2]*cr;re[i+k+len/2]=re[i+k]-vR;im[i+k+len/2]=im[i+k]-vI;re[i+k]+=vR;im[i+k]+=vI;const nr=cr*wR-ci*wI;ci=cr*wI+ci*wR;cr=nr;}}}const mag=new Float32Array(N/2);for(let i=0;i<N/2;i++)mag[i]=Math.sqrt(re[i]*re[i]+im[i]*im[i]);return mag;}
function pickPitches(mag,sr){const N=mag.length*2,bin=sr/N;let mx=0;for(let i=0;i<mag.length;i++)if(mag[i]>mx)mx=mag[i];if(mx<0.0005)return[];const hits=[],lo=Math.floor(27.5/bin),hi=Math.min(mag.length-2,Math.ceil(4200/bin));for(let i=Math.max(1,lo);i<hi;i++){if(mag[i]>mag[i-1]&&mag[i]>mag[i+1]&&mag[i]/mx>0.12){const d=mag[i-1]-2*mag[i]+mag[i+1],freq=(i+(d!==0?0.5*(mag[i-1]-mag[i+1])/d:0))*bin,midi=Math.round(69+12*Math.log2(freq/440));if(midi>=21&&midi<=108)hits.push({midi,mag:mag[i]/mx,freq});}}return hits.filter((p,_,a)=>!a.some(q=>q!==p&&p.freq/q.freq>1.8&&Math.abs(p.freq/q.freq-Math.round(p.freq/q.freq))<0.06&&q.mag>=p.mag*0.6)).sort((a,b)=>b.mag-a.mag).slice(0,4);}
async function transcribeAudio(audioBuf,onP){const sr=audioBuf.sampleRate,ch0=audioBuf.getChannelData(0),data=audioBuf.numberOfChannels>1?Float32Array.from({length:ch0.length},(_,i)=>(ch0[i]+audioBuf.getChannelData(1)[i])*0.5):ch0,FRAME=2048,HOP=512,total=Math.floor((data.length-FRAME)/HOP),active={},notes=[];for(let f=0;f<total;f++){const mag=fftMag(data.slice(f*HOP,f*HOP+FRAME)),found=new Set(pickPitches(mag,sr).map(p=>{if(!active[p.midi])active[p.midi]={sf:f,mx:p.mag};else active[p.midi].mx=Math.max(active[p.midi].mx,p.mag);return p.midi;}));for(const m in active){if(!found.has(+m)){notes.push({midi:+m,sf:active[m].sf,ef:f,mx:active[m].mx});delete active[m];}}if(f%80===0){onP(f/total);await new Promise(r=>setTimeout(r,0));}}for(const m in active)notes.push({midi:+m,sf:active[m].sf,ef:total,mx:active[m].mx});const f2ms=f=>f*HOP/sr*1000,raw=notes.filter(n=>f2ms(n.ef-n.sf)>=60).map(n=>({m:n.midi,startMs:f2ms(n.sf),durMs:Math.max(80,f2ms(n.ef-n.sf)),v:Math.max(40,Math.min(120,Math.round(n.mx*110)))})).sort((a,b)=>a.startMs-b.startMs);const evts=[];let i=0;while(i<raw.length){const bt=raw[i].startMs,g=[];while(i<raw.length&&raw[i].startMs-bt<=CWIN)g.push({m:raw[i].m,v:raw[i].v,durMs:raw[i++].durMs});if(g.length){const md=Math.max(...g.map(n=>n.durMs));evts.push({n:g,startMs:bt,durQ:snapDurQ(md/500)});}}return evts;}

function name2midi(note){if(!note)return null;const m=note.trim().match(/^([A-G])(#{1,2}|bb?|x)?(-?\d)$/i);if(!m)return null;const PC={C:0,D:2,E:4,F:5,G:7,A:9,B:11},pc=PC[m[1].toUpperCase()];if(pc===undefined)return null;const a=m[2]||'',acc=a.startsWith('##')||a==='x'?2:a.startsWith('#')?1:a.startsWith('bb')?-2:a.startsWith('b')?-1:0,midi=(parseInt(m[3])+1)*12+pc+acc;return midi>=21&&midi<=108?midi:null;}
function noteArr2events(notes,tempo){
  let bpm=tempo||120;
  const sorted=notes.slice().sort((a,b)=>a.beat-b.beat);
  if(!sorted.length)return [];
  // Auto-scale tempo: target ~30s playback regardless of song's natural length
  const last=sorted[sorted.length-1],totalBeats=last.beat+(last.dur||1);
  // Scale target duration by note count: longer songs play longer
  const noteCount=sorted.length;
  const TARGET=Math.max(25,Math.min(90,noteCount*0.25));
  const naturalSec=totalBeats*60/bpm;
  if(naturalSec>TARGET)bpm=bpm*naturalSec/TARGET;
  bpm=Math.min(180,Math.max(95,bpm));
  const msb=60000/bpm,evts=[];
  let i=0;
  while(i<sorted.length){
    const bt=sorted[i].beat,g=[];
    while(i<sorted.length&&Math.abs(sorted[i].beat-bt)<0.12){
      const midi=name2midi(sorted[i].note);
      if(midi)g.push({m:midi,v:80,durMs:Math.max(80,Math.round(sorted[i].dur*msb*0.92))});
      i++;
    }
    if(g.length)evts.push({n:g,startMs:Math.round(bt*msb)});
  }
  return evts;
}
function encodeMidi(events,tempo){const bpm=tempo||120,TPB=480,USPB=Math.round(60000000/bpm);function vl(v){const b=[v&0x7f];v>>=7;while(v>0){b.unshift((v&0x7f)|0x80);v>>=7;}return b;}function ms2t(ms){return Math.round(ms*TPB*bpm/60000);}const evts=[];events.forEach(ev=>ev.n.forEach(n=>{evts.push({t:ms2t(ev.startMs),on:true,m:n.m,v:n.v});evts.push({t:ms2t(ev.startMs+n.durMs),on:false,m:n.m});}));evts.sort((a,b)=>a.t-b.t||(a.on?1:-1));const track=[0,0xff,0x51,0x03,(USPB>>16)&0xff,(USPB>>8)&0xff,USPB&0xff];let prev=0;evts.forEach(ev=>{const d=ev.t-prev;prev=ev.t;track.push(...vl(d));track.push(ev.on?0x90:0x80,ev.m,ev.on?ev.v:0);});track.push(0,0xff,0x2f,0x00);const tl=track.length;return new Uint8Array([0x4d,0x54,0x68,0x64,0,0,0,6,0,0,0,1,(TPB>>8)&0xff,TPB&0xff,0x4d,0x54,0x72,0x6b,(tl>>24)&0xff,(tl>>16)&0xff,(tl>>8)&0xff,tl&0xff,...track]);}


// ─── Staff line detection for OMR-lite ─────────────────────────────
function detectStaves(canvas) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, W, H).data;

  // 1. Find rows with long continuous dark runs (likely staff lines)
  // Tolerant: allow short gaps (anti-aliased pixels), lum threshold loosened
  const lineYs = [];
  for (let y = 0; y < H; y++) {
    let maxRun = 0, curRun = 0, gap = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const lum = (imgData[i] + imgData[i+1] + imgData[i+2]) / 3;
      if (lum < 140) { curRun++; gap = 0; if (curRun > maxRun) maxRun = curRun; }
      else {
        gap++;
        if (gap <= 2 && curRun > 0) { curRun++; } // tolerate small gaps
        else { curRun = 0; gap = 0; }
      }
    }
    if (maxRun > W * 0.35) lineYs.push(y);  // 35% width threshold
  }
  if (lineYs.length < 5) return [];

  // 2. Cluster adjacent Y values (a staff line is 1-3 px thick)
  const lines = [];
  let cur = [lineYs[0]];
  for (let i = 1; i < lineYs.length; i++) {
    if (lineYs[i] - cur[cur.length-1] <= 3) cur.push(lineYs[i]);
    else {
      lines.push(Math.round(cur.reduce((a,b)=>a+b,0)/cur.length));
      cur = [lineYs[i]];
    }
  }
  lines.push(Math.round(cur.reduce((a,b)=>a+b,0)/cur.length));
  if (lines.length < 5) return [];

  // 3. Find groups of 5 evenly-spaced lines = staves
  const staves = [];
  let i = 0;
  while (i <= lines.length - 5) {
    const five = [lines[i], lines[i+1], lines[i+2], lines[i+3], lines[i+4]];
    const s = [five[1]-five[0], five[2]-five[1], five[3]-five[2], five[4]-five[3]];
    const avgSp = (s[0]+s[1]+s[2]+s[3]) / 4;
    const consistent = s.every(sp => Math.abs(sp - avgSp) <= 4);
    if (consistent && avgSp >= 5 && avgSp <= 40) {
      staves.push({ topY: five[0], bottomY: five[4], spacing: avgSp, lineYs: five });
      i += 5;
    } else i++;
  }
  return staves;
}

function staffRelativePitch(clusterY, staff, clef) {
  // Treble: bottom line E4(64), top line F5(77)
  // Bass:   bottom line G2(43), top line A3(57)
  const relFromBottom = (staff.bottomY - clusterY) / Math.max(1, staff.bottomY - staff.topY);
  const baseMidi = clef === 'treble' ? 64 : 43;
  const topMidi  = clef === 'treble' ? 77 : 57;
  // Allow notes up to 1 octave above/below the staff (ledger lines)
  const rel = Math.max(-0.7, Math.min(1.7, relFromBottom));
  const continuous = baseMidi + rel * (topMidi - baseMidi);
  // Snap to C major (diatonic)
  const CMAJ = [0, 2, 4, 5, 7, 9, 11];
  const oct = Math.floor(continuous / 12);
  const pc = continuous - oct * 12;
  let best = CMAJ[0], bestD = 99;
  for (const c of CMAJ) {
    const d = Math.abs(c - pc);
    if (d < bestD) { bestD = d; best = c; }
  }
  return Math.max(21, Math.min(108, oct * 12 + best));
}


function findNoteheadsInStaff(data, W, H, staff) {
  // Scan a region around the staff for notehead-shaped dark blobs.
  // Notehead heuristics: vertical run of staff.spacing*0.4 to *1.3 height,
  // horizontal extent of staff.spacing*0.4 to *1.5 width.
  const margin = Math.round(staff.spacing * 4);
  const yStart = Math.max(0, staff.topY - margin);
  const yEnd = Math.min(H, staff.bottomY + margin);
  const minH = Math.max(2, Math.round(staff.spacing * 0.4));
  const maxH = Math.round(staff.spacing * 1.4);
  const minW = Math.max(3, Math.round(staff.spacing * 0.4));
  const maxW = Math.round(staff.spacing * 1.6);
  const candidates = [];

  for (let x = 0; x < W; x += 2) {  // step by 2 for speed
    let runStart = -1;
    for (let y = yStart; y <= yEnd; y++) {
      const i = (y * W + x) * 4;
      const lum = (data[i] + data[i+1] + data[i+2]) / 3;
      const isDark = lum < 115;
      if (isDark) { if (runStart < 0) runStart = y; }
      else {
        if (runStart >= 0) {
          const runH = y - runStart;
          if (runH >= minH && runH <= maxH) {
            // Check horizontal extent at middle of run
            const midY = runStart + Math.floor(runH / 2);
            let leftW = 0;
            for (let dx = 1; dx <= maxW + 2 && x - dx >= 0; dx++) {
              const i2 = (midY * W + (x - dx)) * 4;
              if ((data[i2] + data[i2+1] + data[i2+2]) / 3 < 115) leftW = dx;
              else break;
            }
            let rightW = 0;
            for (let dx = 1; dx <= maxW + 2 && x + dx < W; dx++) {
              const i2 = (midY * W + (x + dx)) * 4;
              if ((data[i2] + data[i2+1] + data[i2+2]) / 3 < 115) rightW = dx;
              else break;
            }
            const totalW = leftW + 1 + rightW;
            if (totalW >= minW && totalW <= maxW) {
              const cx = x - leftW + Math.floor(totalW / 2);
              candidates.push({ x: cx, y: midY });
            }
          }
          runStart = -1;
        }
      }
    }
  }

  // Dedupe nearby candidates (within ~staff.spacing/2 in both axes)
  const mergeDist = Math.max(3, Math.round(staff.spacing * 0.6));
  candidates.sort((a, b) => a.x - b.x || a.y - b.y);
  const deduped = [];
  for (const c of candidates) {
    let merged = false;
    for (const d of deduped) {
      if (Math.abs(c.x - d.x) <= mergeDist && Math.abs(c.y - d.y) <= mergeDist) {
        merged = true;
        break;
      }
    }
    if (!merged) deduped.push(c);
  }
  return deduped;
}

// ─── PDF → image via pdf.js (no API) ──────────────────────────────
async function pdfPageToCanvas(arrayBuffer, pageNum) {
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Cannot load pdf.js from CDN'));
      document.head.appendChild(s);
    });
    if (!window.pdfjsLib) throw new Error('pdf.js failed to initialize');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNum || 1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return { canvas, totalPages: pdf.numPages };
}

// AI library — full song arrangements
const AI_LIBRARY = [
  { category:'Pop / Singer-Songwriter', keys:['angel','robbie williams angel','robbie williams'], title:'Angel · Robbie Williams', tempo:104, notes:[
    {note:'E2',dur:4,beat:0},
    {note:'E4',dur:1,beat:0},
    {note:'G#4',dur:1,beat:1},
    {note:'B4',dur:1,beat:2},
    {note:'E5',dur:1,beat:3},
    {note:'B2',dur:4,beat:4},
    {note:'B3',dur:1,beat:4},
    {note:'D#4',dur:1,beat:5},
    {note:'F#4',dur:1,beat:6},
    {note:'B4',dur:1,beat:7},
    {note:'C#2',dur:4,beat:8},
    {note:'C#4',dur:1,beat:8},
    {note:'E4',dur:1,beat:9},
    {note:'G#4',dur:1,beat:10},
    {note:'C#5',dur:1,beat:11},
    {note:'A2',dur:4,beat:12},
    {note:'A3',dur:1,beat:12},
    {note:'C#4',dur:1,beat:13},
    {note:'E4',dur:1,beat:14},
    {note:'A4',dur:1,beat:15},
    {note:'B4',dur:0.5,beat:16},
    {note:'B4',dur:0.5,beat:16.5},
    {note:'G#4',dur:1,beat:17},
    {note:'F#4',dur:1,beat:18},
    {note:'E4',dur:1,beat:19},
    {note:'B4',dur:0.5,beat:20},
    {note:'C#5',dur:0.5,beat:20.5},
    {note:'B4',dur:1,beat:21},
    {note:'A4',dur:1,beat:22},
    {note:'G#4',dur:2,beat:23},
    {note:'E4',dur:0.5,beat:25},
    {note:'F#4',dur:0.5,beat:25.5},
    {note:'G#4',dur:1,beat:26},
    {note:'A4',dur:1,beat:27},
    {note:'B4',dur:0.5,beat:28},
    {note:'A4',dur:0.5,beat:28.5},
    {note:'G#4',dur:1,beat:29},
    {note:'F#4',dur:1,beat:30},
    {note:'E4',dur:2,beat:31},
    {note:'G#4',dur:0.5,beat:33},
    {note:'A4',dur:0.5,beat:33.5},
    {note:'B4',dur:1,beat:34},
    {note:'A4',dur:1,beat:35},
    {note:'G#4',dur:1,beat:36},
    {note:'F#4',dur:1,beat:37},
    {note:'E4',dur:1,beat:38},
    {note:'B3',dur:1,beat:39},
    {note:'B4',dur:0.5,beat:40},
    {note:'A4',dur:0.5,beat:40.5},
    {note:'G#4',dur:1,beat:41},
    {note:'F#4',dur:1,beat:42},
    {note:'E4',dur:2,beat:43},
    {note:'B3',dur:1,beat:45},
    {note:'C#4',dur:1,beat:46},
    {note:'D#4',dur:1,beat:47},
    {note:'E2',dur:4,beat:16},
    {note:'E3',dur:2,beat:18},
    {note:'C#2',dur:4,beat:20},
    {note:'C#3',dur:2,beat:22},
    {note:'A2',dur:4,beat:24},
    {note:'A3',dur:2,beat:26},
    {note:'B2',dur:4,beat:28},
    {note:'B3',dur:2,beat:30},
    {note:'E2',dur:4,beat:32},
    {note:'E3',dur:2,beat:34},
    {note:'C#2',dur:4,beat:36},
    {note:'C#3',dur:2,beat:38},
    {note:'A2',dur:4,beat:40},
    {note:'A3',dur:2,beat:42},
    {note:'B2',dur:4,beat:44},
    {note:'B3',dur:2,beat:46},
    {note:'E5',dur:1,beat:48},
    {note:'D#5',dur:1,beat:49},
    {note:'C#5',dur:1,beat:50},
    {note:'B4',dur:1,beat:51},
    {note:'A4',dur:1,beat:52},
    {note:'G#4',dur:1,beat:53},
    {note:'F#4',dur:1,beat:54},
    {note:'E4',dur:1,beat:55},
    {note:'A2',dur:4,beat:48},
    {note:'E2',dur:4,beat:52},
    {note:'E5',dur:1,beat:56},
    {note:'E5',dur:0.5,beat:57},
    {note:'D#5',dur:0.5,beat:57.5},
    {note:'E5',dur:1,beat:58},
    {note:'F#5',dur:1,beat:59},
    {note:'G#5',dur:2,beat:60},
    {note:'F#5',dur:1,beat:62},
    {note:'E5',dur:1,beat:63},
    {note:'D#5',dur:1,beat:64},
    {note:'D#5',dur:0.5,beat:65},
    {note:'C#5',dur:0.5,beat:65.5},
    {note:'D#5',dur:1,beat:66},
    {note:'E5',dur:1,beat:67},
    {note:'F#5',dur:2,beat:68},
    {note:'E5',dur:1,beat:70},
    {note:'D#5',dur:1,beat:71},
    {note:'C#5',dur:1,beat:72},
    {note:'B4',dur:1,beat:73},
    {note:'A4',dur:1,beat:74},
    {note:'B4',dur:1,beat:75},
    {note:'C#5',dur:2,beat:76},
    {note:'D#5',dur:1,beat:78},
    {note:'E5',dur:1,beat:79},
    {note:'B4',dur:1,beat:80},
    {note:'A4',dur:1,beat:81},
    {note:'G#4',dur:1,beat:82},
    {note:'F#4',dur:1,beat:83},
    {note:'E4',dur:4,beat:84},
    {note:'E2',dur:4,beat:56},
    {note:'C#2',dur:4,beat:60},
    {note:'A2',dur:4,beat:64},
    {note:'B2',dur:4,beat:68},
    {note:'E2',dur:4,beat:72},
    {note:'C#2',dur:4,beat:76},
    {note:'A2',dur:4,beat:80},
    {note:'E2',dur:4,beat:84},
    {note:'E4',dur:0.5,beat:88},
    {note:'G#4',dur:0.5,beat:88.5},
    {note:'B4',dur:0.5,beat:89},
    {note:'E5',dur:0.5,beat:89.5},
    {note:'G#5',dur:1,beat:90},
    {note:'B5',dur:1,beat:91},
    {note:'E5',dur:4,beat:92},
    {note:'E2',dur:4,beat:88},
    {note:'E2',dur:4,beat:92}
  ]},
  { category:'Anime / Game', keys:['caged bird','dn angel','d n angel','d.n. angel','dnangel'], title:'Caged Bird · D.N. Angel', tempo:108, notes:[
    {note:'B2',dur:1,beat:0},
    {note:'F#3',dur:1,beat:1},
    {note:'B3',dur:1,beat:2},
    {note:'D4',dur:1,beat:3},
    {note:'F#4',dur:4,beat:0},
    {note:'F#2',dur:1,beat:4},
    {note:'C#3',dur:1,beat:5},
    {note:'F#3',dur:1,beat:6},
    {note:'A3',dur:1,beat:7},
    {note:'C#4',dur:4,beat:4},
    {note:'G2',dur:1,beat:8},
    {note:'D3',dur:1,beat:9},
    {note:'G3',dur:1,beat:10},
    {note:'B3',dur:1,beat:11},
    {note:'D4',dur:4,beat:8},
    {note:'A2',dur:1,beat:12},
    {note:'E3',dur:1,beat:13},
    {note:'A3',dur:1,beat:14},
    {note:'C#4',dur:1,beat:15},
    {note:'E4',dur:4,beat:12},
    {note:'D5',dur:0.5,beat:16},
    {note:'E5',dur:0.5,beat:16.5},
    {note:'F#5',dur:1,beat:17},
    {note:'E5',dur:0.5,beat:18},
    {note:'D5',dur:0.5,beat:18.5},
    {note:'C#5',dur:1,beat:19},
    {note:'B4',dur:1,beat:20},
    {note:'A4',dur:1,beat:21},
    {note:'F#4',dur:2,beat:22},
    {note:'B4',dur:0.5,beat:24},
    {note:'C#5',dur:0.5,beat:24.5},
    {note:'D5',dur:1,beat:25},
    {note:'E5',dur:1,beat:26},
    {note:'F#5',dur:0.5,beat:27},
    {note:'E5',dur:0.5,beat:27.5},
    {note:'D5',dur:1,beat:28},
    {note:'C#5',dur:1,beat:29},
    {note:'B4',dur:1,beat:30},
    {note:'A4',dur:1,beat:31},
    {note:'G4',dur:0.5,beat:32},
    {note:'A4',dur:0.5,beat:32.5},
    {note:'B4',dur:1,beat:33},
    {note:'A4',dur:0.5,beat:34},
    {note:'G4',dur:0.5,beat:34.5},
    {note:'F#4',dur:1,beat:35},
    {note:'E4',dur:1,beat:36},
    {note:'D4',dur:1,beat:37},
    {note:'B3',dur:2,beat:38},
    {note:'E4',dur:0.5,beat:40},
    {note:'F#4',dur:0.5,beat:40.5},
    {note:'G4',dur:1,beat:41},
    {note:'A4',dur:1,beat:42},
    {note:'B4',dur:0.5,beat:43},
    {note:'A4',dur:0.5,beat:43.5},
    {note:'G4',dur:1,beat:44},
    {note:'F#4',dur:1,beat:45},
    {note:'E4',dur:2,beat:46},
    {note:'B2',dur:4,beat:16},
    {note:'F#3',dur:2,beat:18},
    {note:'G2',dur:4,beat:20},
    {note:'D3',dur:2,beat:22},
    {note:'A2',dur:4,beat:24},
    {note:'E3',dur:2,beat:26},
    {note:'F#2',dur:4,beat:28},
    {note:'C#3',dur:2,beat:30},
    {note:'G2',dur:4,beat:32},
    {note:'D3',dur:2,beat:34},
    {note:'E2',dur:4,beat:36},
    {note:'B2',dur:2,beat:38},
    {note:'B2',dur:4,beat:40},
    {note:'F#3',dur:2,beat:42},
    {note:'F#2',dur:4,beat:44},
    {note:'C#3',dur:2,beat:46},
    {note:'B4',dur:1,beat:48},
    {note:'D5',dur:1,beat:49},
    {note:'F#5',dur:2,beat:50},
    {note:'E5',dur:1,beat:52},
    {note:'D5',dur:1,beat:53},
    {note:'B4',dur:2,beat:54},
    {note:'A4',dur:1,beat:56},
    {note:'C#5',dur:1,beat:57},
    {note:'E5',dur:2,beat:58},
    {note:'D5',dur:1,beat:60},
    {note:'C#5',dur:1,beat:61},
    {note:'A4',dur:2,beat:62},
    {note:'G4',dur:1,beat:64},
    {note:'B4',dur:1,beat:65},
    {note:'D5',dur:2,beat:66},
    {note:'C#5',dur:1,beat:68},
    {note:'B4',dur:1,beat:69},
    {note:'G4',dur:2,beat:70},
    {note:'F#4',dur:0.5,beat:72},
    {note:'G4',dur:0.5,beat:72.5},
    {note:'A4',dur:0.5,beat:73},
    {note:'B4',dur:0.5,beat:73.5},
    {note:'C#5',dur:1,beat:74},
    {note:'D5',dur:1,beat:75},
    {note:'E5',dur:2,beat:76},
    {note:'F#5',dur:4,beat:78},
    {note:'B2',dur:4,beat:48},
    {note:'F#2',dur:4,beat:52},
    {note:'A2',dur:4,beat:56},
    {note:'E2',dur:4,beat:60},
    {note:'G2',dur:4,beat:64},
    {note:'D2',dur:4,beat:68},
    {note:'B2',dur:4,beat:72},
    {note:'F#2',dur:4,beat:76},
    {note:'D5',dur:0.5,beat:82},
    {note:'E5',dur:0.5,beat:82.5},
    {note:'F#5',dur:1,beat:83},
    {note:'E5',dur:0.5,beat:84},
    {note:'D5',dur:0.5,beat:84.5},
    {note:'C#5',dur:1,beat:85},
    {note:'B4',dur:1,beat:86},
    {note:'A4',dur:1,beat:87},
    {note:'F#4',dur:2,beat:88},
    {note:'B4',dur:0.5,beat:90},
    {note:'C#5',dur:0.5,beat:90.5},
    {note:'D5',dur:1,beat:91},
    {note:'E5',dur:1,beat:92},
    {note:'F#5',dur:0.5,beat:93},
    {note:'E5',dur:0.5,beat:93.5},
    {note:'D5',dur:1,beat:94},
    {note:'C#5',dur:1,beat:95},
    {note:'B4',dur:1,beat:96},
    {note:'A4',dur:1,beat:97},
    {note:'G4',dur:0.5,beat:98},
    {note:'A4',dur:0.5,beat:98.5},
    {note:'B4',dur:1,beat:99},
    {note:'A4',dur:0.5,beat:100},
    {note:'G4',dur:0.5,beat:100.5},
    {note:'F#4',dur:1,beat:101},
    {note:'E4',dur:1,beat:102},
    {note:'D4',dur:1,beat:103},
    {note:'B3',dur:2,beat:104},
    {note:'E4',dur:0.5,beat:106},
    {note:'F#4',dur:0.5,beat:106.5},
    {note:'B2',dur:4,beat:82},
    {note:'G2',dur:4,beat:86},
    {note:'A2',dur:4,beat:90},
    {note:'F#2',dur:4,beat:94},
    {note:'G2',dur:4,beat:98},
    {note:'E2',dur:4,beat:102},
    {note:'B2',dur:4,beat:106},
    {note:'F#2',dur:4,beat:110},
    {note:'F#4',dur:1,beat:114},
    {note:'D4',dur:1,beat:115},
    {note:'B3',dur:2,beat:116},
    {note:'F#3',dur:4,beat:118},
    {note:'D3',dur:4,beat:122},
    {note:'B2',dur:4,beat:126}
  ]},
  { category:'Classical', keys:['canon in d','pachelbel canon','pachelbel'], title:'Canon in D · Pachelbel', tempo:100, notes:[
    {note:'D2',dur:2,beat:0},
    {note:'F#3',dur:2,beat:2},
    {note:'A2',dur:2,beat:4},
    {note:'C#3',dur:2,beat:6},
    {note:'B2',dur:2,beat:8},
    {note:'D3',dur:2,beat:10},
    {note:'F#2',dur:2,beat:12},
    {note:'A2',dur:2,beat:14},
    {note:'G2',dur:2,beat:16},
    {note:'B3',dur:2,beat:18},
    {note:'D2',dur:2,beat:20},
    {note:'F#3',dur:2,beat:22},
    {note:'G2',dur:2,beat:24},
    {note:'B3',dur:2,beat:26},
    {note:'A2',dur:2,beat:28},
    {note:'C#3',dur:2,beat:30},
    {note:'F#5',dur:2,beat:0},
    {note:'E5',dur:2,beat:2},
    {note:'D5',dur:2,beat:4},
    {note:'C#5',dur:2,beat:6},
    {note:'B4',dur:2,beat:8},
    {note:'A4',dur:2,beat:10},
    {note:'B4',dur:2,beat:12},
    {note:'C#5',dur:2,beat:14},
    {note:'D5',dur:2,beat:16},
    {note:'C#5',dur:2,beat:18},
    {note:'B4',dur:2,beat:20},
    {note:'A4',dur:2,beat:22},
    {note:'G4',dur:2,beat:24},
    {note:'F#4',dur:2,beat:26},
    {note:'E4',dur:2,beat:28},
    {note:'A4',dur:2,beat:30},
    {note:'D2',dur:2,beat:32},
    {note:'F#3',dur:2,beat:34},
    {note:'A2',dur:2,beat:36},
    {note:'C#3',dur:2,beat:38},
    {note:'B2',dur:2,beat:40},
    {note:'D3',dur:2,beat:42},
    {note:'F#2',dur:2,beat:44},
    {note:'A2',dur:2,beat:46},
    {note:'G2',dur:2,beat:48},
    {note:'B3',dur:2,beat:50},
    {note:'D2',dur:2,beat:52},
    {note:'F#3',dur:2,beat:54},
    {note:'G2',dur:2,beat:56},
    {note:'B3',dur:2,beat:58},
    {note:'A2',dur:2,beat:60},
    {note:'C#3',dur:2,beat:62},
    {note:'F#5',dur:1,beat:32},
    {note:'D5',dur:1,beat:33},
    {note:'E5',dur:1,beat:34},
    {note:'C#5',dur:1,beat:35},
    {note:'D5',dur:1,beat:36},
    {note:'B4',dur:1,beat:37},
    {note:'C#5',dur:1,beat:38},
    {note:'A4',dur:1,beat:39},
    {note:'B4',dur:1,beat:40},
    {note:'G4',dur:1,beat:41},
    {note:'A4',dur:1,beat:42},
    {note:'F#4',dur:1,beat:43},
    {note:'B4',dur:1,beat:44},
    {note:'G4',dur:1,beat:45},
    {note:'C#5',dur:1,beat:46},
    {note:'A4',dur:1,beat:47},
    {note:'D5',dur:1,beat:48},
    {note:'B4',dur:1,beat:49},
    {note:'C#5',dur:1,beat:50},
    {note:'A4',dur:1,beat:51},
    {note:'B4',dur:1,beat:52},
    {note:'G4',dur:1,beat:53},
    {note:'A4',dur:1,beat:54},
    {note:'F#4',dur:1,beat:55},
    {note:'G4',dur:1,beat:56},
    {note:'E4',dur:1,beat:57},
    {note:'F#4',dur:1,beat:58},
    {note:'D4',dur:1,beat:59},
    {note:'E4',dur:1,beat:60},
    {note:'C#4',dur:1,beat:61},
    {note:'A4',dur:1,beat:62},
    {note:'F#4',dur:1,beat:63},
    {note:'D2',dur:2,beat:64},
    {note:'F#3',dur:2,beat:66},
    {note:'A2',dur:2,beat:68},
    {note:'C#3',dur:2,beat:70},
    {note:'B2',dur:2,beat:72},
    {note:'D3',dur:2,beat:74},
    {note:'F#2',dur:2,beat:76},
    {note:'A2',dur:2,beat:78},
    {note:'G2',dur:2,beat:80},
    {note:'B3',dur:2,beat:82},
    {note:'D2',dur:2,beat:84},
    {note:'F#3',dur:2,beat:86},
    {note:'G2',dur:2,beat:88},
    {note:'B3',dur:2,beat:90},
    {note:'A2',dur:2,beat:92},
    {note:'C#3',dur:2,beat:94},
    {note:'F#5',dur:0.5,beat:64.0},
    {note:'A5',dur:0.5,beat:64.5},
    {note:'F#5',dur:0.5,beat:65.0},
    {note:'D5',dur:0.5,beat:65.5},
    {note:'E5',dur:0.5,beat:66.0},
    {note:'G5',dur:0.5,beat:66.5},
    {note:'E5',dur:0.5,beat:67.0},
    {note:'C#5',dur:0.5,beat:67.5},
    {note:'D5',dur:0.5,beat:68.0},
    {note:'F#5',dur:0.5,beat:68.5},
    {note:'D5',dur:0.5,beat:69.0},
    {note:'B4',dur:0.5,beat:69.5},
    {note:'C#5',dur:0.5,beat:70.0},
    {note:'E5',dur:0.5,beat:70.5},
    {note:'C#5',dur:0.5,beat:71.0},
    {note:'A4',dur:0.5,beat:71.5},
    {note:'B4',dur:0.5,beat:72.0},
    {note:'D5',dur:0.5,beat:72.5},
    {note:'B4',dur:0.5,beat:73.0},
    {note:'G4',dur:0.5,beat:73.5},
    {note:'A4',dur:0.5,beat:74.0},
    {note:'C#5',dur:0.5,beat:74.5},
    {note:'A4',dur:0.5,beat:75.0},
    {note:'F#4',dur:0.5,beat:75.5},
    {note:'B4',dur:0.5,beat:76.0},
    {note:'D5',dur:0.5,beat:76.5},
    {note:'B4',dur:0.5,beat:77.0},
    {note:'G4',dur:0.5,beat:77.5},
    {note:'C#5',dur:0.5,beat:78.0},
    {note:'E5',dur:0.5,beat:78.5},
    {note:'C#5',dur:0.5,beat:79.0},
    {note:'A4',dur:0.5,beat:79.5},
    {note:'D5',dur:0.5,beat:80.0},
    {note:'F#5',dur:0.5,beat:80.5},
    {note:'A5',dur:0.5,beat:81.0},
    {note:'F#5',dur:0.5,beat:81.5},
    {note:'C#5',dur:0.5,beat:82.0},
    {note:'E5',dur:0.5,beat:82.5},
    {note:'G5',dur:0.5,beat:83.0},
    {note:'E5',dur:0.5,beat:83.5},
    {note:'B4',dur:0.5,beat:84.0},
    {note:'D5',dur:0.5,beat:84.5},
    {note:'F#5',dur:0.5,beat:85.0},
    {note:'D5',dur:0.5,beat:85.5},
    {note:'A4',dur:0.5,beat:86.0},
    {note:'C#5',dur:0.5,beat:86.5},
    {note:'E5',dur:0.5,beat:87.0},
    {note:'C#5',dur:0.5,beat:87.5},
    {note:'G4',dur:0.5,beat:88.0},
    {note:'B4',dur:0.5,beat:88.5},
    {note:'D5',dur:0.5,beat:89.0},
    {note:'B4',dur:0.5,beat:89.5},
    {note:'F#4',dur:0.5,beat:90.0},
    {note:'A4',dur:0.5,beat:90.5},
    {note:'C#5',dur:0.5,beat:91.0},
    {note:'A4',dur:0.5,beat:91.5},
    {note:'E4',dur:0.5,beat:92.0},
    {note:'G4',dur:0.5,beat:92.5},
    {note:'B4',dur:0.5,beat:93.0},
    {note:'G4',dur:0.5,beat:93.5},
    {note:'A4',dur:0.5,beat:94.0},
    {note:'C#5',dur:0.5,beat:94.5},
    {note:'E5',dur:0.5,beat:95.0},
    {note:'A5',dur:0.5,beat:95.5}
  ]},
  { category:'Anime / Game', keys:['river flows in you','yiruma river','river yiruma','river flows'], title:'River Flows in You · Yiruma', tempo:96, notes:[
    {note:'A3',dur:0.5,beat:0},
    {note:'C#4',dur:0.5,beat:0.5},
    {note:'E4',dur:0.5,beat:1},
    {note:'A4',dur:0.5,beat:1.5},
    {note:'E4',dur:0.5,beat:2},
    {note:'C#4',dur:0.5,beat:2.5},
    {note:'A3',dur:0.5,beat:3},
    {note:'E3',dur:0.5,beat:3.5},
    {note:'A3',dur:0.5,beat:4},
    {note:'C#4',dur:0.5,beat:4.5},
    {note:'E4',dur:0.5,beat:5},
    {note:'A4',dur:0.5,beat:5.5},
    {note:'B4',dur:0.5,beat:6},
    {note:'A4',dur:0.5,beat:6.5},
    {note:'G#4',dur:0.5,beat:7},
    {note:'A4',dur:0.5,beat:7.5},
    {note:'A4',dur:0.25,beat:8},
    {note:'G#4',dur:0.25,beat:8.25},
    {note:'A4',dur:0.5,beat:8.5},
    {note:'B4',dur:0.5,beat:9},
    {note:'C#5',dur:0.5,beat:9.5},
    {note:'B4',dur:1,beat:10},
    {note:'A4',dur:0.5,beat:11},
    {note:'G#4',dur:0.5,beat:11.5},
    {note:'A4',dur:0.5,beat:12},
    {note:'B4',dur:0.5,beat:12.5},
    {note:'C#5',dur:0.5,beat:13},
    {note:'E5',dur:0.5,beat:13.5},
    {note:'C#5',dur:1,beat:14},
    {note:'B4',dur:1,beat:15},
    {note:'A4',dur:0.25,beat:16},
    {note:'G#4',dur:0.25,beat:16.25},
    {note:'A4',dur:0.5,beat:16.5},
    {note:'B4',dur:0.5,beat:17},
    {note:'C#5',dur:0.5,beat:17.5},
    {note:'D5',dur:1,beat:18},
    {note:'C#5',dur:0.5,beat:19},
    {note:'B4',dur:0.5,beat:19.5},
    {note:'A4',dur:0.5,beat:20},
    {note:'G#4',dur:0.5,beat:20.5},
    {note:'F#4',dur:0.5,beat:21},
    {note:'E4',dur:0.5,beat:21.5},
    {note:'A4',dur:2,beat:22},
    {note:'A2',dur:4,beat:8},
    {note:'A3',dur:4,beat:8},
    {note:'E2',dur:4,beat:12},
    {note:'E3',dur:4,beat:12},
    {note:'F#2',dur:4,beat:16},
    {note:'F#3',dur:4,beat:16},
    {note:'D2',dur:4,beat:20},
    {note:'D3',dur:4,beat:20},
    {note:'A5',dur:0.25,beat:24},
    {note:'G#4',dur:0.25,beat:24.25},
    {note:'A5',dur:0.5,beat:24.5},
    {note:'B5',dur:0.5,beat:25},
    {note:'C#5',dur:0.5,beat:25.5},
    {note:'B5',dur:1,beat:26},
    {note:'A5',dur:0.5,beat:27},
    {note:'G#4',dur:0.5,beat:27.5},
    {note:'A5',dur:0.5,beat:28},
    {note:'B5',dur:0.5,beat:28.5},
    {note:'C#5',dur:0.5,beat:29},
    {note:'E5',dur:0.5,beat:29.5},
    {note:'C#5',dur:1,beat:30},
    {note:'B5',dur:1,beat:31},
    {note:'A5',dur:0.25,beat:32},
    {note:'G#4',dur:0.25,beat:32.25},
    {note:'A5',dur:0.5,beat:32.5},
    {note:'B5',dur:0.5,beat:33},
    {note:'C#5',dur:0.5,beat:33.5},
    {note:'D5',dur:1,beat:34},
    {note:'C#5',dur:0.5,beat:35},
    {note:'B5',dur:0.5,beat:35.5},
    {note:'A5',dur:0.5,beat:36},
    {note:'G#4',dur:0.5,beat:36.5},
    {note:'F#4',dur:0.5,beat:37},
    {note:'E5',dur:0.5,beat:37.5},
    {note:'A5',dur:2,beat:38},
    {note:'A2',dur:4,beat:24},
    {note:'A3',dur:4,beat:24},
    {note:'E2',dur:4,beat:28},
    {note:'E3',dur:4,beat:28},
    {note:'F#2',dur:4,beat:32},
    {note:'F#3',dur:4,beat:32},
    {note:'D2',dur:4,beat:36},
    {note:'D3',dur:4,beat:36},
    {note:'E5',dur:1,beat:40},
    {note:'F#5',dur:1,beat:41},
    {note:'G#5',dur:1,beat:42},
    {note:'A5',dur:1,beat:43},
    {note:'G#5',dur:0.5,beat:44},
    {note:'F#5',dur:0.5,beat:44.5},
    {note:'E5',dur:1,beat:45},
    {note:'D5',dur:1,beat:46},
    {note:'C#5',dur:1,beat:47},
    {note:'B4',dur:1,beat:48},
    {note:'C#5',dur:1,beat:49},
    {note:'D5',dur:1,beat:50},
    {note:'E5',dur:1,beat:51},
    {note:'D5',dur:0.5,beat:52},
    {note:'C#5',dur:0.5,beat:52.5},
    {note:'B4',dur:1,beat:53},
    {note:'A4',dur:2,beat:54},
    {note:'E2',dur:4,beat:40},
    {note:'B2',dur:4,beat:44},
    {note:'F#2',dur:4,beat:48},
    {note:'A2',dur:4,beat:52},
    {note:'A4',dur:0.25,beat:56},
    {note:'G#4',dur:0.25,beat:56.25},
    {note:'A4',dur:0.5,beat:56.5},
    {note:'B4',dur:0.5,beat:57},
    {note:'C#5',dur:0.5,beat:57.5},
    {note:'B4',dur:1,beat:58},
    {note:'A4',dur:0.5,beat:59},
    {note:'G#4',dur:0.5,beat:59.5},
    {note:'A4',dur:0.5,beat:60},
    {note:'B4',dur:0.5,beat:60.5},
    {note:'C#5',dur:0.5,beat:61},
    {note:'E5',dur:0.5,beat:61.5},
    {note:'C#5',dur:1,beat:62},
    {note:'B4',dur:1,beat:63},
    {note:'A4',dur:0.25,beat:64},
    {note:'G#4',dur:0.25,beat:64.25},
    {note:'A4',dur:0.5,beat:64.5},
    {note:'B4',dur:0.5,beat:65},
    {note:'C#5',dur:0.5,beat:65.5},
    {note:'D5',dur:1,beat:66},
    {note:'C#5',dur:0.5,beat:67},
    {note:'B4',dur:0.5,beat:67.5},
    {note:'A4',dur:0.5,beat:68},
    {note:'G#4',dur:0.5,beat:68.5},
    {note:'F#4',dur:0.5,beat:69},
    {note:'E4',dur:0.5,beat:69.5},
    {note:'A4',dur:2,beat:70},
    {note:'A2',dur:4,beat:56},
    {note:'E2',dur:4,beat:60},
    {note:'F#2',dur:4,beat:64},
    {note:'D2',dur:4,beat:68},
    {note:'A3',dur:0.5,beat:72},
    {note:'C#4',dur:0.5,beat:72.5},
    {note:'E4',dur:0.5,beat:73},
    {note:'A4',dur:0.5,beat:73.5},
    {note:'C#5',dur:0.5,beat:74},
    {note:'E5',dur:1,beat:74.5},
    {note:'A4',dur:0.5,beat:75.5},
    {note:'A2',dur:8,beat:72},
    {note:'A4',dur:4,beat:76}
  ]},
  { category:'Classical', keys:['clair de lune','debussy','clair lune','moonlight debussy'], title:'Clair de Lune · Debussy', tempo:60, notes:[
    {note:'D3',dur:1,beat:0},
    {note:'A3',dur:1,beat:1},
    {note:'F#4',dur:1,beat:2},
    {note:'D4',dur:1,beat:3},
    {note:'D3',dur:1,beat:4},
    {note:'A3',dur:1,beat:5},
    {note:'F#4',dur:1,beat:6},
    {note:'D4',dur:1,beat:7},
    {note:'D3',dur:1,beat:8},
    {note:'A3',dur:1,beat:9},
    {note:'F#4',dur:1,beat:10},
    {note:'D4',dur:1,beat:11},
    {note:'D3',dur:1,beat:12},
    {note:'A3',dur:1,beat:13},
    {note:'F#4',dur:1,beat:14},
    {note:'D4',dur:1,beat:15},
    {note:'F#5',dur:2,beat:16},
    {note:'E5',dur:1,beat:18},
    {note:'D5',dur:1,beat:19},
    {note:'A4',dur:2,beat:20},
    {note:'B4',dur:2,beat:22},
    {note:'D5',dur:1,beat:24},
    {note:'E5',dur:1,beat:25},
    {note:'F#5',dur:2,beat:26},
    {note:'A5',dur:2,beat:28},
    {note:'G5',dur:1,beat:30},
    {note:'F#5',dur:1,beat:31},
    {note:'E5',dur:1,beat:32},
    {note:'D5',dur:1,beat:33},
    {note:'C#5',dur:2,beat:34},
    {note:'B4',dur:1,beat:36},
    {note:'A4',dur:1,beat:37},
    {note:'F#4',dur:2,beat:38},
    {note:'A4',dur:1,beat:40},
    {note:'B4',dur:1,beat:41},
    {note:'D5',dur:2,beat:42},
    {note:'F#5',dur:1,beat:44},
    {note:'E5',dur:1,beat:45},
    {note:'D5',dur:2,beat:46},
    {note:'D2',dur:4,beat:16},
    {note:'A2',dur:4,beat:20},
    {note:'F#2',dur:4,beat:24},
    {note:'B2',dur:4,beat:28},
    {note:'G2',dur:4,beat:32},
    {note:'D2',dur:4,beat:36},
    {note:'A2',dur:4,beat:40},
    {note:'D2',dur:4,beat:44},
    {note:'F#6',dur:2,beat:48},
    {note:'E6',dur:1,beat:50},
    {note:'D6',dur:1,beat:51},
    {note:'A5',dur:2,beat:52},
    {note:'B5',dur:2,beat:54},
    {note:'D6',dur:1,beat:56},
    {note:'E6',dur:1,beat:57},
    {note:'F#6',dur:2,beat:58},
    {note:'A6',dur:2,beat:60},
    {note:'G6',dur:1,beat:62},
    {note:'F#6',dur:1,beat:63},
    {note:'E5',dur:1,beat:64},
    {note:'D5',dur:1,beat:65},
    {note:'C#5',dur:2,beat:66},
    {note:'B4',dur:1,beat:68},
    {note:'A4',dur:1,beat:69},
    {note:'F#4',dur:2,beat:70},
    {note:'A4',dur:1,beat:72},
    {note:'B4',dur:1,beat:73},
    {note:'D5',dur:2,beat:74},
    {note:'F#5',dur:1,beat:76},
    {note:'E5',dur:1,beat:77},
    {note:'D5',dur:2,beat:78},
    {note:'D2',dur:4,beat:48},
    {note:'A2',dur:4,beat:52},
    {note:'F#2',dur:4,beat:56},
    {note:'B2',dur:4,beat:60},
    {note:'G2',dur:4,beat:64},
    {note:'D2',dur:4,beat:68},
    {note:'A2',dur:4,beat:72},
    {note:'D2',dur:4,beat:76},
    {note:'G5',dur:2,beat:80},
    {note:'F#5',dur:2,beat:82},
    {note:'F5',dur:2,beat:84},
    {note:'E5',dur:2,beat:86},
    {note:'Eb5',dur:2,beat:88},
    {note:'D5',dur:2,beat:90},
    {note:'C#5',dur:2,beat:92},
    {note:'D5',dur:2,beat:94},
    {note:'G2',dur:4,beat:80},
    {note:'F#2',dur:4,beat:84},
    {note:'Em2',dur:4,beat:88},
    {note:'D2',dur:4,beat:92},
    {note:'F#5',dur:1,beat:96},
    {note:'D5',dur:1,beat:97},
    {note:'A4',dur:1,beat:98},
    {note:'D4',dur:1,beat:99},
    {note:'F#5',dur:1,beat:100},
    {note:'D5',dur:1,beat:101},
    {note:'A4',dur:1,beat:102},
    {note:'D4',dur:1,beat:103},
    {note:'F#5',dur:1,beat:104},
    {note:'D5',dur:1,beat:105},
    {note:'A4',dur:1,beat:106},
    {note:'D4',dur:1,beat:107},
    {note:'F#5',dur:1,beat:108},
    {note:'D5',dur:1,beat:109},
    {note:'A4',dur:1,beat:110},
    {note:'D4',dur:1,beat:111},
    {note:'D2',dur:16,beat:96}
  ]},
  { category:'Classical', keys:['gymnopedie','gymnopédie','satie','gymnopedie no 1','gymnopedie 1'], title:'Gymnopédie No.1 · Satie', tempo:70, notes:[
    {note:'D2',dur:1,beat:0},
    {note:'A3',dur:1,beat:1},
    {note:'F#4',dur:1,beat:2},
    {note:'D2',dur:1,beat:3},
    {note:'A3',dur:1,beat:4},
    {note:'F#4',dur:1,beat:5},
    {note:'D2',dur:1,beat:6},
    {note:'A3',dur:1,beat:7},
    {note:'F#4',dur:1,beat:8},
    {note:'F#5',dur:3,beat:9},
    {note:'E5',dur:3,beat:12},
    {note:'D5',dur:3,beat:15},
    {note:'C#5',dur:1,beat:18},
    {note:'D5',dur:1,beat:19},
    {note:'E5',dur:1,beat:20},
    {note:'F#5',dur:3,beat:21},
    {note:'A5',dur:3,beat:24},
    {note:'G5',dur:3,beat:27},
    {note:'F#5',dur:3,beat:30},
    {note:'E5',dur:3,beat:33},
    {note:'D5',dur:3,beat:36},
    {note:'C#5',dur:3,beat:39},
    {note:'A4',dur:3,beat:42},
    {note:'F#5',dur:3,beat:45},
    {note:'E5',dur:3,beat:48},
    {note:'D5',dur:3,beat:51},
    {note:'B4',dur:1,beat:54},
    {note:'C#5',dur:1,beat:55},
    {note:'D5',dur:1,beat:56},
    {note:'D2',dur:1,beat:9},
    {note:'A3',dur:1,beat:10},
    {note:'F#4',dur:1,beat:11},
    {note:'D2',dur:1,beat:12},
    {note:'A3',dur:1,beat:13},
    {note:'F#4',dur:1,beat:14},
    {note:'D2',dur:1,beat:15},
    {note:'A3',dur:1,beat:16},
    {note:'F#4',dur:1,beat:17},
    {note:'D2',dur:1,beat:18},
    {note:'A3',dur:1,beat:19},
    {note:'F#4',dur:1,beat:20},
    {note:'D2',dur:1,beat:21},
    {note:'A3',dur:1,beat:22},
    {note:'F#4',dur:1,beat:23},
    {note:'D2',dur:1,beat:24},
    {note:'A3',dur:1,beat:25},
    {note:'F#4',dur:1,beat:26},
    {note:'G2',dur:1,beat:27},
    {note:'D3',dur:1,beat:28},
    {note:'B4',dur:1,beat:29},
    {note:'G2',dur:1,beat:30},
    {note:'D3',dur:1,beat:31},
    {note:'B4',dur:1,beat:32},
    {note:'A5',dur:3,beat:33},
    {note:'G5',dur:3,beat:36},
    {note:'F#5',dur:3,beat:39},
    {note:'E5',dur:1,beat:42},
    {note:'F#5',dur:1,beat:43},
    {note:'G5',dur:1,beat:44},
    {note:'A5',dur:3,beat:45},
    {note:'F#5',dur:3,beat:48},
    {note:'E5',dur:3,beat:51},
    {note:'D5',dur:3,beat:54},
    {note:'C#5',dur:3,beat:57},
    {note:'B4',dur:3,beat:60},
    {note:'A4',dur:6,beat:63},
    {note:'B4',dur:3,beat:69},
    {note:'C#5',dur:3,beat:72},
    {note:'D5',dur:3,beat:75},
    {note:'E5',dur:3,beat:78},
    {note:'D2',dur:1,beat:33},
    {note:'A3',dur:1,beat:34},
    {note:'F#4',dur:1,beat:35},
    {note:'D2',dur:1,beat:36},
    {note:'A3',dur:1,beat:37},
    {note:'F#4',dur:1,beat:38},
    {note:'D2',dur:1,beat:39},
    {note:'A3',dur:1,beat:40},
    {note:'F#4',dur:1,beat:41},
    {note:'D2',dur:1,beat:42},
    {note:'A3',dur:1,beat:43},
    {note:'F#4',dur:1,beat:44},
    {note:'B2',dur:1,beat:45},
    {note:'F#3',dur:1,beat:46},
    {note:'D4',dur:1,beat:47},
    {note:'B2',dur:1,beat:48},
    {note:'F#3',dur:1,beat:49},
    {note:'D4',dur:1,beat:50},
    {note:'G2',dur:1,beat:51},
    {note:'D3',dur:1,beat:52},
    {note:'B4',dur:1,beat:53},
    {note:'G2',dur:1,beat:54},
    {note:'D3',dur:1,beat:55},
    {note:'B4',dur:1,beat:56},
    {note:'F#5',dur:2,beat:57},
    {note:'A5',dur:1,beat:59},
    {note:'F#5',dur:3,beat:60},
    {note:'E5',dur:3,beat:63},
    {note:'D5',dur:1,beat:66},
    {note:'E5',dur:1,beat:67},
    {note:'F#5',dur:1,beat:68},
    {note:'A5',dur:3,beat:69},
    {note:'G5',dur:3,beat:72},
    {note:'F#5',dur:3,beat:75},
    {note:'E5',dur:3,beat:78},
    {note:'D5',dur:3,beat:81},
    {note:'C#5',dur:1,beat:84},
    {note:'D5',dur:1,beat:85},
    {note:'E5',dur:1,beat:86},
    {note:'A4',dur:3,beat:87},
    {note:'F#5',dur:3,beat:90},
    {note:'E5',dur:3,beat:93},
    {note:'D5',dur:3,beat:96},
    {note:'A4',dur:3,beat:99},
    {note:'D2',dur:1,beat:57},
    {note:'A3',dur:1,beat:58},
    {note:'F#4',dur:1,beat:59},
    {note:'D2',dur:1,beat:60},
    {note:'A3',dur:1,beat:61},
    {note:'F#4',dur:1,beat:62},
    {note:'D2',dur:1,beat:63},
    {note:'A3',dur:1,beat:64},
    {note:'F#4',dur:1,beat:65},
    {note:'D2',dur:1,beat:66},
    {note:'A3',dur:1,beat:67},
    {note:'F#4',dur:1,beat:68},
    {note:'D2',dur:1,beat:69},
    {note:'A3',dur:1,beat:70},
    {note:'F#4',dur:1,beat:71},
    {note:'D2',dur:1,beat:72},
    {note:'A3',dur:1,beat:73},
    {note:'F#4',dur:1,beat:74},
    {note:'D5',dur:3,beat:75},
    {note:'C#5',dur:3,beat:78},
    {note:'B4',dur:3,beat:81},
    {note:'A4',dur:3,beat:84},
    {note:'B4',dur:3,beat:87},
    {note:'A4',dur:3,beat:90},
    {note:'F#4',dur:3,beat:93},
    {note:'D4',dur:3,beat:96},
    {note:'D2',dur:1,beat:75},
    {note:'A3',dur:1,beat:76},
    {note:'F#4',dur:1,beat:77},
    {note:'D2',dur:1,beat:78},
    {note:'A3',dur:1,beat:79},
    {note:'F#4',dur:1,beat:80},
    {note:'D2',dur:1,beat:81},
    {note:'A3',dur:1,beat:82},
    {note:'F#4',dur:1,beat:83},
    {note:'D2',dur:1,beat:84},
    {note:'A3',dur:1,beat:85},
    {note:'F#4',dur:1,beat:86},
    {note:'D2',dur:1,beat:87},
    {note:'A3',dur:1,beat:88},
    {note:'F#4',dur:1,beat:89},
    {note:'D2',dur:1,beat:90},
    {note:'A3',dur:1,beat:91},
    {note:'F#4',dur:1,beat:92}
  ]},
  { category:'Classical', keys:['nocturne','chopin nocturne','nocturne op 9','chopin op 9'], title:'Nocturne Op.9 No.2 · Chopin', tempo:65, notes:[
    {note:'Eb2',dur:4,beat:0},
    {note:'Bb2',dur:2,beat:2},
    {note:'Eb2',dur:4,beat:4},
    {note:'Bb2',dur:2,beat:6},
    {note:'Bb4',dur:1.5,beat:8},
    {note:'G5',dur:0.5,beat:9.5},
    {note:'F5',dur:1,beat:10.0},
    {note:'Eb5',dur:1,beat:11.0},
    {note:'Bb4',dur:1.5,beat:12.0},
    {note:'Ab5',dur:0.5,beat:13.5},
    {note:'G5',dur:1,beat:14.0},
    {note:'F5',dur:1,beat:15.0},
    {note:'Eb5',dur:1.5,beat:16.0},
    {note:'Bb5',dur:0.5,beat:17.5},
    {note:'Ab5',dur:1,beat:18.0},
    {note:'G5',dur:1,beat:19.0},
    {note:'F5',dur:1,beat:20.0},
    {note:'Eb5',dur:2,beat:21.0},
    {note:'D5',dur:1,beat:23.0},
    {note:'Eb5',dur:1,beat:24.0},
    {note:'Eb2',dur:4,beat:8},
    {note:'Bb2',dur:4,beat:12},
    {note:'C2',dur:4,beat:16},
    {note:'Ab2',dur:4,beat:20},
    {note:'Bb4',dur:1,beat:24},
    {note:'Eb5',dur:1,beat:25},
    {note:'G5',dur:2,beat:26},
    {note:'Bb5',dur:1,beat:28},
    {note:'Ab5',dur:1,beat:29},
    {note:'G5',dur:1,beat:30},
    {note:'F5',dur:1,beat:31},
    {note:'Eb5',dur:1,beat:32},
    {note:'F5',dur:1,beat:33},
    {note:'G5',dur:1,beat:34},
    {note:'Ab5',dur:1,beat:35},
    {note:'Bb5',dur:2,beat:36},
    {note:'Ab5',dur:1,beat:38},
    {note:'G5',dur:1,beat:39},
    {note:'Eb2',dur:4,beat:24},
    {note:'Bb2',dur:4,beat:28},
    {note:'Eb2',dur:4,beat:32},
    {note:'Ab2',dur:4,beat:36},
    {note:'F5',dur:1,beat:40},
    {note:'G5',dur:1,beat:41},
    {note:'Ab5',dur:1,beat:42},
    {note:'Bb5',dur:1,beat:43},
    {note:'C6',dur:2,beat:44},
    {note:'Bb5',dur:1,beat:46},
    {note:'Ab5',dur:1,beat:47},
    {note:'G5',dur:2,beat:48},
    {note:'F5',dur:1,beat:50},
    {note:'Eb5',dur:1,beat:51},
    {note:'D5',dur:1,beat:52},
    {note:'Eb5',dur:1,beat:53},
    {note:'F5',dur:1,beat:54},
    {note:'G5',dur:1,beat:55},
    {note:'Eb5',dur:4,beat:56},
    {note:'F2',dur:4,beat:40},
    {note:'Bb2',dur:4,beat:44},
    {note:'Eb2',dur:4,beat:48},
    {note:'Bb2',dur:4,beat:52},
    {note:'Eb2',dur:4,beat:56},
    {note:'Bb4',dur:1.5,beat:60},
    {note:'G5',dur:0.5,beat:61.5},
    {note:'F5',dur:0.5,beat:62.0},
    {note:'Eb5',dur:0.5,beat:62.5},
    {note:'F5',dur:1,beat:63.0},
    {note:'Bb4',dur:1.5,beat:64.0},
    {note:'Ab5',dur:0.5,beat:65.5},
    {note:'G5',dur:1,beat:66.0},
    {note:'F5',dur:1,beat:67.0},
    {note:'Eb5',dur:1,beat:68.0},
    {note:'Bb5',dur:1,beat:69.0},
    {note:'Ab5',dur:1,beat:70.0},
    {note:'G5',dur:1,beat:71.0},
    {note:'F5',dur:1,beat:72.0},
    {note:'Eb5',dur:1,beat:73.0},
    {note:'D5',dur:1,beat:74.0},
    {note:'Eb5',dur:1,beat:75.0},
    {note:'Eb2',dur:4,beat:60},
    {note:'Bb2',dur:4,beat:64},
    {note:'C2',dur:4,beat:68},
    {note:'Ab2',dur:4,beat:72},
    {note:'Eb6',dur:2,beat:76},
    {note:'D6',dur:1,beat:78},
    {note:'C6',dur:1,beat:79},
    {note:'Bb5',dur:1,beat:80},
    {note:'Ab5',dur:1,beat:81},
    {note:'G5',dur:1,beat:82},
    {note:'F5',dur:1,beat:83},
    {note:'Eb5',dur:1,beat:84},
    {note:'F5',dur:1,beat:85},
    {note:'G5',dur:1,beat:86},
    {note:'Ab5',dur:1,beat:87},
    {note:'Bb5',dur:4,beat:88},
    {note:'Eb2',dur:4,beat:76},
    {note:'C2',dur:4,beat:80},
    {note:'Bb2',dur:4,beat:84},
    {note:'Eb2',dur:4,beat:88},
    {note:'G5',dur:2,beat:92},
    {note:'F5',dur:1,beat:94},
    {note:'Eb5',dur:1,beat:95},
    {note:'D5',dur:1,beat:96},
    {note:'Eb5',dur:1,beat:97},
    {note:'F5',dur:1,beat:98},
    {note:'G5',dur:1,beat:99},
    {note:'Eb5',dur:4,beat:100},
    {note:'Bb4',dur:4,beat:104},
    {note:'Bb2',dur:4,beat:92},
    {note:'Eb2',dur:4,beat:96},
    {note:'Eb2',dur:4,beat:100}
  ]},
  { category:'Classical', keys:['prelude in c','bach prelude','bach c major','prelude bach','well tempered'], title:'Prelude in C · Bach', tempo:80, notes:[
    {note:'C4',dur:0.25,beat:0.0},
    {note:'E4',dur:0.25,beat:0.25},
    {note:'G4',dur:0.25,beat:0.5},
    {note:'C5',dur:0.25,beat:0.75},
    {note:'E5',dur:0.25,beat:1.0},
    {note:'G4',dur:0.25,beat:1.25},
    {note:'C5',dur:0.25,beat:1.5},
    {note:'E5',dur:0.25,beat:1.75},
    {note:'C3',dur:2,beat:0},
    {note:'C4',dur:0.25,beat:2.0},
    {note:'D4',dur:0.25,beat:2.25},
    {note:'A4',dur:0.25,beat:2.5},
    {note:'D5',dur:0.25,beat:2.75},
    {note:'F5',dur:0.25,beat:3.0},
    {note:'A4',dur:0.25,beat:3.25},
    {note:'D5',dur:0.25,beat:3.5},
    {note:'F5',dur:0.25,beat:3.75},
    {note:'C3',dur:2,beat:2},
    {note:'B3',dur:0.25,beat:4.0},
    {note:'D4',dur:0.25,beat:4.25},
    {note:'G4',dur:0.25,beat:4.5},
    {note:'D5',dur:0.25,beat:4.75},
    {note:'F5',dur:0.25,beat:5.0},
    {note:'G4',dur:0.25,beat:5.25},
    {note:'D5',dur:0.25,beat:5.5},
    {note:'F5',dur:0.25,beat:5.75},
    {note:'B2',dur:2,beat:4},
    {note:'C4',dur:0.25,beat:6.0},
    {note:'E4',dur:0.25,beat:6.25},
    {note:'G4',dur:0.25,beat:6.5},
    {note:'C5',dur:0.25,beat:6.75},
    {note:'E5',dur:0.25,beat:7.0},
    {note:'G4',dur:0.25,beat:7.25},
    {note:'C5',dur:0.25,beat:7.5},
    {note:'E5',dur:0.25,beat:7.75},
    {note:'C3',dur:2,beat:6},
    {note:'C4',dur:0.25,beat:8.0},
    {note:'E4',dur:0.25,beat:8.25},
    {note:'A4',dur:0.25,beat:8.5},
    {note:'E5',dur:0.25,beat:8.75},
    {note:'A5',dur:0.25,beat:9.0},
    {note:'A4',dur:0.25,beat:9.25},
    {note:'E5',dur:0.25,beat:9.5},
    {note:'A5',dur:0.25,beat:9.75},
    {note:'C3',dur:2,beat:8},
    {note:'C4',dur:0.25,beat:10.0},
    {note:'D4',dur:0.25,beat:10.25},
    {note:'F#4',dur:0.25,beat:10.5},
    {note:'A4',dur:0.25,beat:10.75},
    {note:'D5',dur:0.25,beat:11.0},
    {note:'F#4',dur:0.25,beat:11.25},
    {note:'A4',dur:0.25,beat:11.5},
    {note:'D5',dur:0.25,beat:11.75},
    {note:'C3',dur:2,beat:10},
    {note:'B3',dur:0.25,beat:12.0},
    {note:'D4',dur:0.25,beat:12.25},
    {note:'G4',dur:0.25,beat:12.5},
    {note:'D5',dur:0.25,beat:12.75},
    {note:'G5',dur:0.25,beat:13.0},
    {note:'G4',dur:0.25,beat:13.25},
    {note:'D5',dur:0.25,beat:13.5},
    {note:'G5',dur:0.25,beat:13.75},
    {note:'B2',dur:2,beat:12},
    {note:'C4',dur:0.25,beat:14.0},
    {note:'E4',dur:0.25,beat:14.25},
    {note:'G4',dur:0.25,beat:14.5},
    {note:'C5',dur:0.25,beat:14.75},
    {note:'E5',dur:0.25,beat:15.0},
    {note:'G4',dur:0.25,beat:15.25},
    {note:'C5',dur:0.25,beat:15.5},
    {note:'E5',dur:0.25,beat:15.75},
    {note:'C3',dur:2,beat:14},
    {note:'C4',dur:0.25,beat:16.0},
    {note:'F4',dur:0.25,beat:16.25},
    {note:'A4',dur:0.25,beat:16.5},
    {note:'F5',dur:0.25,beat:16.75},
    {note:'A5',dur:0.25,beat:17.0},
    {note:'A4',dur:0.25,beat:17.25},
    {note:'F5',dur:0.25,beat:17.5},
    {note:'A5',dur:0.25,beat:17.75},
    {note:'C3',dur:2,beat:16},
    {note:'F3',dur:0.25,beat:18.0},
    {note:'C4',dur:0.25,beat:18.25},
    {note:'F4',dur:0.25,beat:18.5},
    {note:'C5',dur:0.25,beat:18.75},
    {note:'F5',dur:0.25,beat:19.0},
    {note:'F4',dur:0.25,beat:19.25},
    {note:'C5',dur:0.25,beat:19.5},
    {note:'F5',dur:0.25,beat:19.75},
    {note:'F2',dur:2,beat:18},
    {note:'B3',dur:0.25,beat:20.0},
    {note:'D4',dur:0.25,beat:20.25},
    {note:'G4',dur:0.25,beat:20.5},
    {note:'D5',dur:0.25,beat:20.75},
    {note:'G5',dur:0.25,beat:21.0},
    {note:'G4',dur:0.25,beat:21.25},
    {note:'D5',dur:0.25,beat:21.5},
    {note:'G5',dur:0.25,beat:21.75},
    {note:'B2',dur:2,beat:20},
    {note:'C4',dur:0.25,beat:22.0},
    {note:'E4',dur:0.25,beat:22.25},
    {note:'G4',dur:0.25,beat:22.5},
    {note:'C5',dur:0.25,beat:22.75},
    {note:'E5',dur:0.25,beat:23.0},
    {note:'G4',dur:0.25,beat:23.25},
    {note:'C5',dur:0.25,beat:23.5},
    {note:'E5',dur:0.25,beat:23.75},
    {note:'C3',dur:2,beat:22},
    {note:'C4',dur:0.25,beat:24.0},
    {note:'D4',dur:0.25,beat:24.25},
    {note:'F#4',dur:0.25,beat:24.5},
    {note:'A4',dur:0.25,beat:24.75},
    {note:'D5',dur:0.25,beat:25.0},
    {note:'F#4',dur:0.25,beat:25.25},
    {note:'A4',dur:0.25,beat:25.5},
    {note:'D5',dur:0.25,beat:25.75},
    {note:'C3',dur:2,beat:24},
    {note:'B3',dur:0.25,beat:26.0},
    {note:'D4',dur:0.25,beat:26.25},
    {note:'G4',dur:0.25,beat:26.5},
    {note:'D5',dur:0.25,beat:26.75},
    {note:'G5',dur:0.25,beat:27.0},
    {note:'G4',dur:0.25,beat:27.25},
    {note:'D5',dur:0.25,beat:27.5},
    {note:'G5',dur:0.25,beat:27.75},
    {note:'B2',dur:2,beat:26},
    {note:'B3',dur:0.25,beat:28.0},
    {note:'D#4',dur:0.25,beat:28.25},
    {note:'G4',dur:0.25,beat:28.5},
    {note:'D#5',dur:0.25,beat:28.75},
    {note:'G5',dur:0.25,beat:29.0},
    {note:'G4',dur:0.25,beat:29.25},
    {note:'D#5',dur:0.25,beat:29.5},
    {note:'G5',dur:0.25,beat:29.75},
    {note:'B2',dur:2,beat:28},
    {note:'C4',dur:0.25,beat:30.0},
    {note:'E4',dur:0.25,beat:30.25},
    {note:'G4',dur:0.25,beat:30.5},
    {note:'C5',dur:0.25,beat:30.75},
    {note:'E5',dur:0.25,beat:31.0},
    {note:'G4',dur:0.25,beat:31.25},
    {note:'C5',dur:0.25,beat:31.5},
    {note:'E5',dur:0.25,beat:31.75},
    {note:'C3',dur:2,beat:30},
    {note:'C4',dur:0.25,beat:32.0},
    {note:'D4',dur:0.25,beat:32.25},
    {note:'F4',dur:0.25,beat:32.5},
    {note:'A4',dur:0.25,beat:32.75},
    {note:'D5',dur:0.25,beat:33.0},
    {note:'F4',dur:0.25,beat:33.25},
    {note:'A4',dur:0.25,beat:33.5},
    {note:'D5',dur:0.25,beat:33.75},
    {note:'C3',dur:2,beat:32},
    {note:'C4',dur:0.25,beat:34.0},
    {note:'E4',dur:0.25,beat:34.25},
    {note:'G4',dur:0.25,beat:34.5},
    {note:'C5',dur:0.25,beat:34.75},
    {note:'E5',dur:0.25,beat:35.0},
    {note:'G4',dur:0.25,beat:35.25},
    {note:'C5',dur:0.25,beat:35.5},
    {note:'E5',dur:0.25,beat:35.75},
    {note:'C3',dur:2,beat:34},
    {note:'C4',dur:0.25,beat:36.0},
    {note:'E4',dur:0.25,beat:36.25},
    {note:'G4',dur:0.25,beat:36.5},
    {note:'C5',dur:0.25,beat:36.75},
    {note:'E5',dur:0.25,beat:37.0},
    {note:'G4',dur:0.25,beat:37.25},
    {note:'C5',dur:0.25,beat:37.5},
    {note:'E5',dur:0.25,beat:37.75},
    {note:'C3',dur:2,beat:36},
    {note:'C4',dur:0.25,beat:38.0},
    {note:'D4',dur:0.25,beat:38.25},
    {note:'G4',dur:0.25,beat:38.5},
    {note:'D5',dur:0.25,beat:38.75},
    {note:'F5',dur:0.25,beat:39.0},
    {note:'G4',dur:0.25,beat:39.25},
    {note:'D5',dur:0.25,beat:39.5},
    {note:'F5',dur:0.25,beat:39.75},
    {note:'C3',dur:2,beat:38},
    {note:'B3',dur:0.25,beat:40.0},
    {note:'D4',dur:0.25,beat:40.25},
    {note:'G4',dur:0.25,beat:40.5},
    {note:'D5',dur:0.25,beat:40.75},
    {note:'F5',dur:0.25,beat:41.0},
    {note:'G4',dur:0.25,beat:41.25},
    {note:'D5',dur:0.25,beat:41.5},
    {note:'F5',dur:0.25,beat:41.75},
    {note:'B2',dur:2,beat:40},
    {note:'C4',dur:0.25,beat:42.0},
    {note:'E4',dur:0.25,beat:42.25},
    {note:'G4',dur:0.25,beat:42.5},
    {note:'C5',dur:0.25,beat:42.75},
    {note:'E5',dur:0.25,beat:43.0},
    {note:'G4',dur:0.25,beat:43.25},
    {note:'C5',dur:0.25,beat:43.5},
    {note:'E5',dur:0.25,beat:43.75},
    {note:'C3',dur:2,beat:42},
    {note:'F3',dur:0.25,beat:44.0},
    {note:'A3',dur:0.25,beat:44.25},
    {note:'C4',dur:0.25,beat:44.5},
    {note:'F4',dur:0.25,beat:44.75},
    {note:'C5',dur:0.25,beat:45.0},
    {note:'C4',dur:0.25,beat:45.25},
    {note:'F4',dur:0.25,beat:45.5},
    {note:'C5',dur:0.25,beat:45.75},
    {note:'F2',dur:2,beat:44},
    {note:'C3',dur:0.25,beat:46.0},
    {note:'E3',dur:0.25,beat:46.25},
    {note:'G3',dur:0.25,beat:46.5},
    {note:'C4',dur:0.25,beat:46.75},
    {note:'E4',dur:0.25,beat:47.0},
    {note:'G3',dur:0.25,beat:47.25},
    {note:'C4',dur:0.25,beat:47.5},
    {note:'E4',dur:0.25,beat:47.75},
    {note:'C3',dur:2,beat:46}
  ]},
  { category:'Classical', keys:['turkish march','rondo alla turca','mozart turkish','alla turca','mozart march'], title:'Turkish March · Mozart', tempo:125, notes:[
    {note:'B4',dur:0.5,beat:0},
    {note:'A4',dur:0.5,beat:0.5},
    {note:'G#4',dur:0.5,beat:1.0},
    {note:'A4',dur:0.5,beat:1.5},
    {note:'C5',dur:1,beat:2.0},
    {note:'E5',dur:1,beat:3.0},
    {note:'D5',dur:0.5,beat:4.0},
    {note:'C5',dur:0.5,beat:4.5},
    {note:'B4',dur:0.5,beat:5.0},
    {note:'C5',dur:0.5,beat:5.5},
    {note:'D5',dur:1,beat:6.0},
    {note:'C5',dur:0.5,beat:7.0},
    {note:'B4',dur:0.5,beat:7.5},
    {note:'A4',dur:0.5,beat:8.0},
    {note:'B4',dur:0.5,beat:8.5},
    {note:'C5',dur:1,beat:9.0},
    {note:'B4',dur:0.5,beat:10.0},
    {note:'A4',dur:0.5,beat:10.5},
    {note:'G#4',dur:0.5,beat:11.0},
    {note:'A4',dur:2,beat:11.5},
    {note:'B4',dur:0.5,beat:12},
    {note:'A4',dur:0.5,beat:12.5},
    {note:'G#4',dur:0.5,beat:13.0},
    {note:'A4',dur:0.5,beat:13.5},
    {note:'C5',dur:1,beat:14.0},
    {note:'E5',dur:1,beat:15.0},
    {note:'D5',dur:0.5,beat:16.0},
    {note:'C5',dur:0.5,beat:16.5},
    {note:'B4',dur:0.5,beat:17.0},
    {note:'C5',dur:0.5,beat:17.5},
    {note:'D5',dur:1,beat:18.0},
    {note:'C5',dur:0.5,beat:19.0},
    {note:'B4',dur:0.5,beat:19.5},
    {note:'A4',dur:0.5,beat:20.0},
    {note:'B4',dur:0.5,beat:20.5},
    {note:'C5',dur:1,beat:21.0},
    {note:'B4',dur:0.5,beat:22.0},
    {note:'A4',dur:0.5,beat:22.5},
    {note:'G#4',dur:0.5,beat:23.0},
    {note:'A4',dur:2,beat:23.5},
    {note:'A5',dur:0.5,beat:24},
    {note:'G#5',dur:0.5,beat:24.5},
    {note:'A5',dur:0.5,beat:25.0},
    {note:'B5',dur:0.5,beat:25.5},
    {note:'A5',dur:0.5,beat:26.0},
    {note:'G#5',dur:0.5,beat:26.5},
    {note:'A5',dur:1,beat:27.0},
    {note:'E5',dur:1,beat:28.0},
    {note:'C6',dur:0.5,beat:29.0},
    {note:'B5',dur:0.5,beat:29.5},
    {note:'C6',dur:0.5,beat:30.0},
    {note:'D6',dur:0.5,beat:30.5},
    {note:'C6',dur:0.5,beat:31.0},
    {note:'B5',dur:0.5,beat:31.5},
    {note:'C6',dur:1,beat:32.0},
    {note:'A5',dur:1,beat:33.0},
    {note:'E5',dur:0.5,beat:36},
    {note:'A5',dur:0.5,beat:36.5},
    {note:'E5',dur:0.5,beat:37.0},
    {note:'A5',dur:0.5,beat:37.5},
    {note:'F5',dur:0.5,beat:38.0},
    {note:'A5',dur:0.5,beat:38.5},
    {note:'F5',dur:0.5,beat:39.0},
    {note:'A5',dur:0.5,beat:39.5},
    {note:'E5',dur:0.5,beat:40.0},
    {note:'B5',dur:0.5,beat:40.5},
    {note:'E5',dur:0.5,beat:41.0},
    {note:'B5',dur:0.5,beat:41.5},
    {note:'A5',dur:2,beat:42.0},
    {note:'B4',dur:0.5,beat:44},
    {note:'A4',dur:0.5,beat:44.5},
    {note:'G#4',dur:0.5,beat:45.0},
    {note:'A4',dur:0.5,beat:45.5},
    {note:'C5',dur:1,beat:46.0},
    {note:'E5',dur:1,beat:47.0},
    {note:'D5',dur:0.5,beat:48.0},
    {note:'C5',dur:0.5,beat:48.5},
    {note:'B4',dur:0.5,beat:49.0},
    {note:'C5',dur:0.5,beat:49.5},
    {note:'D5',dur:1,beat:50.0},
    {note:'C5',dur:0.5,beat:51.0},
    {note:'B4',dur:0.5,beat:51.5},
    {note:'A4',dur:0.5,beat:52.0},
    {note:'B4',dur:0.5,beat:52.5},
    {note:'C5',dur:1,beat:53.0},
    {note:'B4',dur:0.5,beat:54.0},
    {note:'A4',dur:0.5,beat:54.5},
    {note:'G#4',dur:0.5,beat:55.0},
    {note:'A4',dur:2,beat:55.5},
    {note:'A5',dur:0.5,beat:56},
    {note:'G#5',dur:0.5,beat:56.5},
    {note:'A5',dur:0.5,beat:57.0},
    {note:'B5',dur:0.5,beat:57.5},
    {note:'A5',dur:0.5,beat:58.0},
    {note:'G#5',dur:0.5,beat:58.5},
    {note:'A5',dur:1,beat:59.0},
    {note:'E5',dur:1,beat:60.0},
    {note:'C6',dur:0.5,beat:61.0},
    {note:'B5',dur:0.5,beat:61.5},
    {note:'C6',dur:0.5,beat:62.0},
    {note:'D6',dur:0.5,beat:62.5},
    {note:'C6',dur:0.5,beat:63.0},
    {note:'B5',dur:0.5,beat:63.5},
    {note:'C6',dur:1,beat:64.0},
    {note:'A5',dur:1,beat:65.0},
    {note:'B5',dur:0.5,beat:68},
    {note:'A5',dur:0.5,beat:68.5},
    {note:'G#5',dur:0.5,beat:69.0},
    {note:'A5',dur:0.5,beat:69.5},
    {note:'C6',dur:1,beat:70.0},
    {note:'E6',dur:1,beat:71.0},
    {note:'D6',dur:0.5,beat:72.0},
    {note:'C6',dur:0.5,beat:72.5},
    {note:'B5',dur:0.5,beat:73.0},
    {note:'C6',dur:0.5,beat:73.5},
    {note:'D6',dur:1,beat:74.0},
    {note:'A5',dur:0.5,beat:75.0},
    {note:'B5',dur:0.5,beat:75.5},
    {note:'C6',dur:0.5,beat:76.0},
    {note:'D6',dur:0.5,beat:76.5},
    {note:'C6',dur:0.5,beat:77.0},
    {note:'B5',dur:0.5,beat:77.5},
    {note:'A5',dur:1,beat:78.0},
    {note:'A5',dur:0.5,beat:79.0},
    {note:'G#5',dur:0.5,beat:79.5},
    {note:'A5',dur:0.5,beat:80.0},
    {note:'B5',dur:0.5,beat:80.5},
    {note:'C6',dur:0.5,beat:81.0},
    {note:'B5',dur:0.5,beat:81.5},
    {note:'A5',dur:2,beat:82.0},
    {note:'A5',dur:0.5,beat:80},
    {note:'E5',dur:0.5,beat:80.5},
    {note:'A5',dur:0.5,beat:81.0},
    {note:'E5',dur:0.5,beat:81.5},
    {note:'A5',dur:2,beat:82.0},
    {note:'A4',dur:2,beat:84.0},
    {note:'A2',dur:2,beat:0},
    {note:'A2',dur:2,beat:2},
    {note:'E2',dur:2,beat:4},
    {note:'E2',dur:2,beat:6},
    {note:'A2',dur:2,beat:8},
    {note:'A2',dur:2,beat:10},
    {note:'E2',dur:2,beat:12},
    {note:'E2',dur:2,beat:14},
    {note:'A2',dur:2,beat:16},
    {note:'A2',dur:2,beat:18},
    {note:'E2',dur:2,beat:20},
    {note:'E2',dur:2,beat:22},
    {note:'A2',dur:2,beat:24},
    {note:'A2',dur:2,beat:26},
    {note:'E2',dur:2,beat:28},
    {note:'E2',dur:2,beat:30},
    {note:'A2',dur:2,beat:32},
    {note:'A2',dur:2,beat:34},
    {note:'E2',dur:2,beat:36},
    {note:'E2',dur:2,beat:38},
    {note:'A2',dur:2,beat:40},
    {note:'A2',dur:2,beat:42},
    {note:'E2',dur:2,beat:44},
    {note:'E2',dur:2,beat:46},
    {note:'A2',dur:2,beat:48},
    {note:'A2',dur:2,beat:50},
    {note:'E2',dur:2,beat:52},
    {note:'E2',dur:2,beat:54},
    {note:'A2',dur:2,beat:56},
    {note:'A2',dur:2,beat:58},
    {note:'E2',dur:2,beat:60},
    {note:'E2',dur:2,beat:62},
    {note:'A2',dur:2,beat:64},
    {note:'A2',dur:2,beat:66},
    {note:'E2',dur:2,beat:68},
    {note:'E2',dur:2,beat:70},
    {note:'A2',dur:2,beat:72},
    {note:'A2',dur:2,beat:74},
    {note:'E2',dur:2,beat:76},
    {note:'E2',dur:2,beat:78},
    {note:'A2',dur:2,beat:80},
    {note:'A2',dur:2,beat:82}
  ]},
  { category:'Modern / Film', keys:['comptine','amelie theme','tiersen','comptine ete','yann tiersen','amelie','amélie'], title:"Comptine d'un Autre Été · Tiersen", tempo:82, notes:[
    {note:'E3',dur:0.5,beat:0},
    {note:'A3',dur:0.5,beat:0.5},
    {note:'B3',dur:0.5,beat:1.0},
    {note:'E4',dur:0.5,beat:1.5},
    {note:'B3',dur:0.5,beat:2.0},
    {note:'A3',dur:0.5,beat:2.5},
    {note:'B3',dur:0.5,beat:3.0},
    {note:'E4',dur:0.5,beat:3.5},
    {note:'E3',dur:0.5,beat:4.0},
    {note:'A3',dur:0.5,beat:4.5},
    {note:'B3',dur:0.5,beat:5.0},
    {note:'E4',dur:0.5,beat:5.5},
    {note:'B3',dur:0.5,beat:6.0},
    {note:'A3',dur:0.5,beat:6.5},
    {note:'B3',dur:0.5,beat:7.0},
    {note:'E4',dur:0.5,beat:7.5},
    {note:'E3',dur:0.5,beat:8.0},
    {note:'A3',dur:0.5,beat:8.5},
    {note:'B3',dur:0.5,beat:9.0},
    {note:'E4',dur:0.5,beat:9.5},
    {note:'B3',dur:0.5,beat:10.0},
    {note:'A3',dur:0.5,beat:10.5},
    {note:'B3',dur:0.5,beat:11.0},
    {note:'E4',dur:0.5,beat:11.5},
    {note:'E3',dur:0.5,beat:12.0},
    {note:'A3',dur:0.5,beat:12.5},
    {note:'B3',dur:0.5,beat:13.0},
    {note:'E4',dur:0.5,beat:13.5},
    {note:'B3',dur:0.5,beat:14.0},
    {note:'A3',dur:0.5,beat:14.5},
    {note:'B3',dur:0.5,beat:15.0},
    {note:'E4',dur:0.5,beat:15.5},
    {note:'E3',dur:0.5,beat:16.0},
    {note:'A3',dur:0.5,beat:16.5},
    {note:'B3',dur:0.5,beat:17.0},
    {note:'E4',dur:0.5,beat:17.5},
    {note:'B3',dur:0.5,beat:18.0},
    {note:'A3',dur:0.5,beat:18.5},
    {note:'B3',dur:0.5,beat:19.0},
    {note:'E4',dur:0.5,beat:19.5},
    {note:'E3',dur:0.5,beat:20.0},
    {note:'A3',dur:0.5,beat:20.5},
    {note:'B3',dur:0.5,beat:21.0},
    {note:'E4',dur:0.5,beat:21.5},
    {note:'B3',dur:0.5,beat:22.0},
    {note:'A3',dur:0.5,beat:22.5},
    {note:'B3',dur:0.5,beat:23.0},
    {note:'E4',dur:0.5,beat:23.5},
    {note:'E3',dur:0.5,beat:24.0},
    {note:'A3',dur:0.5,beat:24.5},
    {note:'B3',dur:0.5,beat:25.0},
    {note:'E4',dur:0.5,beat:25.5},
    {note:'B3',dur:0.5,beat:26.0},
    {note:'A3',dur:0.5,beat:26.5},
    {note:'B3',dur:0.5,beat:27.0},
    {note:'E4',dur:0.5,beat:27.5},
    {note:'E3',dur:0.5,beat:28.0},
    {note:'A3',dur:0.5,beat:28.5},
    {note:'B3',dur:0.5,beat:29.0},
    {note:'E4',dur:0.5,beat:29.5},
    {note:'B3',dur:0.5,beat:30.0},
    {note:'A3',dur:0.5,beat:30.5},
    {note:'B3',dur:0.5,beat:31.0},
    {note:'E4',dur:0.5,beat:31.5},
    {note:'E3',dur:0.5,beat:32.0},
    {note:'A3',dur:0.5,beat:32.5},
    {note:'B3',dur:0.5,beat:33.0},
    {note:'E4',dur:0.5,beat:33.5},
    {note:'B3',dur:0.5,beat:34.0},
    {note:'A3',dur:0.5,beat:34.5},
    {note:'B3',dur:0.5,beat:35.0},
    {note:'E4',dur:0.5,beat:35.5},
    {note:'E3',dur:0.5,beat:36.0},
    {note:'A3',dur:0.5,beat:36.5},
    {note:'B3',dur:0.5,beat:37.0},
    {note:'E4',dur:0.5,beat:37.5},
    {note:'B3',dur:0.5,beat:38.0},
    {note:'A3',dur:0.5,beat:38.5},
    {note:'B3',dur:0.5,beat:39.0},
    {note:'E4',dur:0.5,beat:39.5},
    {note:'E3',dur:0.5,beat:40.0},
    {note:'A3',dur:0.5,beat:40.5},
    {note:'B3',dur:0.5,beat:41.0},
    {note:'E4',dur:0.5,beat:41.5},
    {note:'B3',dur:0.5,beat:42.0},
    {note:'A3',dur:0.5,beat:42.5},
    {note:'B3',dur:0.5,beat:43.0},
    {note:'E4',dur:0.5,beat:43.5},
    {note:'E3',dur:0.5,beat:44.0},
    {note:'A3',dur:0.5,beat:44.5},
    {note:'B3',dur:0.5,beat:45.0},
    {note:'E4',dur:0.5,beat:45.5},
    {note:'B3',dur:0.5,beat:46.0},
    {note:'A3',dur:0.5,beat:46.5},
    {note:'B3',dur:0.5,beat:47.0},
    {note:'E4',dur:0.5,beat:47.5},
    {note:'E3',dur:0.5,beat:48.0},
    {note:'A3',dur:0.5,beat:48.5},
    {note:'B3',dur:0.5,beat:49.0},
    {note:'E4',dur:0.5,beat:49.5},
    {note:'B3',dur:0.5,beat:50.0},
    {note:'A3',dur:0.5,beat:50.5},
    {note:'B3',dur:0.5,beat:51.0},
    {note:'E4',dur:0.5,beat:51.5},
    {note:'E3',dur:0.5,beat:52.0},
    {note:'A3',dur:0.5,beat:52.5},
    {note:'B3',dur:0.5,beat:53.0},
    {note:'E4',dur:0.5,beat:53.5},
    {note:'B3',dur:0.5,beat:54.0},
    {note:'A3',dur:0.5,beat:54.5},
    {note:'B3',dur:0.5,beat:55.0},
    {note:'E4',dur:0.5,beat:55.5},
    {note:'E3',dur:0.5,beat:56.0},
    {note:'A3',dur:0.5,beat:56.5},
    {note:'B3',dur:0.5,beat:57.0},
    {note:'E4',dur:0.5,beat:57.5},
    {note:'B3',dur:0.5,beat:58.0},
    {note:'A3',dur:0.5,beat:58.5},
    {note:'B3',dur:0.5,beat:59.0},
    {note:'E4',dur:0.5,beat:59.5},
    {note:'E3',dur:0.5,beat:60.0},
    {note:'A3',dur:0.5,beat:60.5},
    {note:'B3',dur:0.5,beat:61.0},
    {note:'E4',dur:0.5,beat:61.5},
    {note:'B3',dur:0.5,beat:62.0},
    {note:'A3',dur:0.5,beat:62.5},
    {note:'B3',dur:0.5,beat:63.0},
    {note:'E4',dur:0.5,beat:63.5},
    {note:'E3',dur:0.5,beat:64.0},
    {note:'A3',dur:0.5,beat:64.5},
    {note:'B3',dur:0.5,beat:65.0},
    {note:'E4',dur:0.5,beat:65.5},
    {note:'B3',dur:0.5,beat:66.0},
    {note:'A3',dur:0.5,beat:66.5},
    {note:'B3',dur:0.5,beat:67.0},
    {note:'E4',dur:0.5,beat:67.5},
    {note:'E3',dur:0.5,beat:68.0},
    {note:'A3',dur:0.5,beat:68.5},
    {note:'B3',dur:0.5,beat:69.0},
    {note:'E4',dur:0.5,beat:69.5},
    {note:'B3',dur:0.5,beat:70.0},
    {note:'A3',dur:0.5,beat:70.5},
    {note:'B3',dur:0.5,beat:71.0},
    {note:'E4',dur:0.5,beat:71.5},
    {note:'E3',dur:0.5,beat:72.0},
    {note:'A3',dur:0.5,beat:72.5},
    {note:'B3',dur:0.5,beat:73.0},
    {note:'E4',dur:0.5,beat:73.5},
    {note:'B3',dur:0.5,beat:74.0},
    {note:'A3',dur:0.5,beat:74.5},
    {note:'B3',dur:0.5,beat:75.0},
    {note:'E4',dur:0.5,beat:75.5},
    {note:'E3',dur:0.5,beat:76.0},
    {note:'A3',dur:0.5,beat:76.5},
    {note:'B3',dur:0.5,beat:77.0},
    {note:'E4',dur:0.5,beat:77.5},
    {note:'B3',dur:0.5,beat:78.0},
    {note:'A3',dur:0.5,beat:78.5},
    {note:'B3',dur:0.5,beat:79.0},
    {note:'E4',dur:0.5,beat:79.5},
    {note:'E3',dur:0.5,beat:80.0},
    {note:'A3',dur:0.5,beat:80.5},
    {note:'B3',dur:0.5,beat:81.0},
    {note:'E4',dur:0.5,beat:81.5},
    {note:'B3',dur:0.5,beat:82.0},
    {note:'A3',dur:0.5,beat:82.5},
    {note:'B3',dur:0.5,beat:83.0},
    {note:'E4',dur:0.5,beat:83.5},
    {note:'E3',dur:0.5,beat:84.0},
    {note:'A3',dur:0.5,beat:84.5},
    {note:'B3',dur:0.5,beat:85.0},
    {note:'E4',dur:0.5,beat:85.5},
    {note:'B3',dur:0.5,beat:86.0},
    {note:'A3',dur:0.5,beat:86.5},
    {note:'B3',dur:0.5,beat:87.0},
    {note:'E4',dur:0.5,beat:87.5},
    {note:'E3',dur:0.5,beat:88.0},
    {note:'A3',dur:0.5,beat:88.5},
    {note:'B3',dur:0.5,beat:89.0},
    {note:'E4',dur:0.5,beat:89.5},
    {note:'B3',dur:0.5,beat:90.0},
    {note:'A3',dur:0.5,beat:90.5},
    {note:'B3',dur:0.5,beat:91.0},
    {note:'E4',dur:0.5,beat:91.5},
    {note:'E3',dur:0.5,beat:92.0},
    {note:'A3',dur:0.5,beat:92.5},
    {note:'B3',dur:0.5,beat:93.0},
    {note:'E4',dur:0.5,beat:93.5},
    {note:'B3',dur:0.5,beat:94.0},
    {note:'A3',dur:0.5,beat:94.5},
    {note:'B3',dur:0.5,beat:95.0},
    {note:'E4',dur:0.5,beat:95.5},
    {note:'E3',dur:0.5,beat:96.0},
    {note:'A3',dur:0.5,beat:96.5},
    {note:'B3',dur:0.5,beat:97.0},
    {note:'E4',dur:0.5,beat:97.5},
    {note:'B3',dur:0.5,beat:98.0},
    {note:'A3',dur:0.5,beat:98.5},
    {note:'B3',dur:0.5,beat:99.0},
    {note:'E4',dur:0.5,beat:99.5},
    {note:'E3',dur:0.5,beat:100.0},
    {note:'A3',dur:0.5,beat:100.5},
    {note:'B3',dur:0.5,beat:101.0},
    {note:'E4',dur:0.5,beat:101.5},
    {note:'B3',dur:0.5,beat:102.0},
    {note:'A3',dur:0.5,beat:102.5},
    {note:'B3',dur:0.5,beat:103.0},
    {note:'E4',dur:0.5,beat:103.5},
    {note:'E3',dur:0.5,beat:104.0},
    {note:'A3',dur:0.5,beat:104.5},
    {note:'B3',dur:0.5,beat:105.0},
    {note:'E4',dur:0.5,beat:105.5},
    {note:'B3',dur:0.5,beat:106.0},
    {note:'A3',dur:0.5,beat:106.5},
    {note:'B3',dur:0.5,beat:107.0},
    {note:'E4',dur:0.5,beat:107.5},
    {note:'E3',dur:0.5,beat:108.0},
    {note:'A3',dur:0.5,beat:108.5},
    {note:'B3',dur:0.5,beat:109.0},
    {note:'E4',dur:0.5,beat:109.5},
    {note:'B3',dur:0.5,beat:110.0},
    {note:'A3',dur:0.5,beat:110.5},
    {note:'B3',dur:0.5,beat:111.0},
    {note:'E4',dur:0.5,beat:111.5},
    {note:'E3',dur:0.5,beat:112.0},
    {note:'A3',dur:0.5,beat:112.5},
    {note:'B3',dur:0.5,beat:113.0},
    {note:'E4',dur:0.5,beat:113.5},
    {note:'B3',dur:0.5,beat:114.0},
    {note:'A3',dur:0.5,beat:114.5},
    {note:'B3',dur:0.5,beat:115.0},
    {note:'E4',dur:0.5,beat:115.5},
    {note:'E3',dur:0.5,beat:116.0},
    {note:'A3',dur:0.5,beat:116.5},
    {note:'B3',dur:0.5,beat:117.0},
    {note:'E4',dur:0.5,beat:117.5},
    {note:'B3',dur:0.5,beat:118.0},
    {note:'A3',dur:0.5,beat:118.5},
    {note:'B3',dur:0.5,beat:119.0},
    {note:'E4',dur:0.5,beat:119.5},
    {note:'E3',dur:0.5,beat:120.0},
    {note:'A3',dur:0.5,beat:120.5},
    {note:'B3',dur:0.5,beat:121.0},
    {note:'E4',dur:0.5,beat:121.5},
    {note:'B3',dur:0.5,beat:122.0},
    {note:'A3',dur:0.5,beat:122.5},
    {note:'B3',dur:0.5,beat:123.0},
    {note:'E4',dur:0.5,beat:123.5},
    {note:'E3',dur:0.5,beat:124.0},
    {note:'A3',dur:0.5,beat:124.5},
    {note:'B3',dur:0.5,beat:125.0},
    {note:'E4',dur:0.5,beat:125.5},
    {note:'B3',dur:0.5,beat:126.0},
    {note:'A3',dur:0.5,beat:126.5},
    {note:'B3',dur:0.5,beat:127.0},
    {note:'E4',dur:0.5,beat:127.5},
    {note:'B4',dur:1,beat:16},
    {note:'A4',dur:1,beat:17},
    {note:'G4',dur:1,beat:18},
    {note:'B4',dur:1,beat:19},
    {note:'E5',dur:1,beat:20},
    {note:'D5',dur:1,beat:21},
    {note:'B4',dur:1,beat:22},
    {note:'A4',dur:2,beat:23},
    {note:'B4',dur:1,beat:25},
    {note:'A4',dur:1,beat:26},
    {note:'G4',dur:1,beat:27},
    {note:'B4',dur:1,beat:28},
    {note:'E5',dur:2,beat:29},
    {note:'D5',dur:1,beat:31},
    {note:'B4',dur:1,beat:32},
    {note:'G4',dur:1,beat:33},
    {note:'A4',dur:1,beat:34},
    {note:'B4',dur:2,beat:35},
    {note:'A4',dur:1,beat:37},
    {note:'G4',dur:1,beat:38},
    {note:'E4',dur:2,beat:39},
    {note:'B4',dur:1,beat:41},
    {note:'A4',dur:1,beat:42},
    {note:'G4',dur:1,beat:43},
    {note:'B4',dur:1,beat:44},
    {note:'E5',dur:2,beat:45},
    {note:'D5',dur:1,beat:47},
    {note:'B4',dur:1,beat:48},
    {note:'G5',dur:1,beat:49},
    {note:'F#5',dur:1,beat:50},
    {note:'E5',dur:1,beat:51},
    {note:'D5',dur:1,beat:52},
    {note:'B4',dur:2,beat:53},
    {note:'A4',dur:2,beat:55},
    {note:'E5',dur:1,beat:57},
    {note:'D5',dur:1,beat:58},
    {note:'B4',dur:2,beat:59},
    {note:'G4',dur:1,beat:61},
    {note:'A4',dur:1,beat:62},
    {note:'B4',dur:2,beat:63},
    {note:'D5',dur:1,beat:65},
    {note:'C5',dur:1,beat:66},
    {note:'B4',dur:2,beat:67},
    {note:'A4',dur:1,beat:69},
    {note:'G4',dur:1,beat:70},
    {note:'E4',dur:2,beat:71},
    {note:'B4',dur:1,beat:73},
    {note:'A4',dur:1,beat:74},
    {note:'B4',dur:1,beat:75},
    {note:'G4',dur:1,beat:76},
    {note:'A4',dur:1,beat:77},
    {note:'E4',dur:3,beat:78},
    {note:'B4',dur:1,beat:81},
    {note:'A4',dur:1,beat:82},
    {note:'G4',dur:1,beat:83},
    {note:'B4',dur:1,beat:84},
    {note:'E5',dur:1,beat:85},
    {note:'D5',dur:1,beat:86},
    {note:'B4',dur:1,beat:87},
    {note:'A4',dur:2,beat:88},
    {note:'B4',dur:1,beat:90},
    {note:'A4',dur:1,beat:91},
    {note:'G4',dur:1,beat:92},
    {note:'B4',dur:1,beat:93},
    {note:'E5',dur:2,beat:94},
    {note:'D5',dur:1,beat:96},
    {note:'B4',dur:1,beat:97},
    {note:'A4',dur:1,beat:98},
    {note:'G4',dur:1,beat:99},
    {note:'A4',dur:2,beat:100},
    {note:'B4',dur:1,beat:102},
    {note:'A4',dur:1,beat:103},
    {note:'E4',dur:2,beat:104},
    {note:'B4',dur:1,beat:106},
    {note:'A4',dur:1,beat:107},
    {note:'G4',dur:1,beat:108},
    {note:'B4',dur:1,beat:109},
    {note:'E5',dur:2,beat:110},
    {note:'D5',dur:1,beat:112},
    {note:'B4',dur:1,beat:113},
    {note:'G5',dur:1,beat:114},
    {note:'F#5',dur:1,beat:115},
    {note:'E5',dur:1,beat:116},
    {note:'D5',dur:1,beat:117},
    {note:'B4',dur:2,beat:118},
    {note:'A4',dur:2,beat:120},
    {note:'E5',dur:2,beat:122},
    {note:'D5',dur:1,beat:124},
    {note:'B4',dur:1,beat:125},
    {note:'G4',dur:1,beat:126},
    {note:'A4',dur:1,beat:127},
    {note:'B4',dur:2,beat:128},
    {note:'D5',dur:1,beat:130},
    {note:'B4',dur:1,beat:131},
    {note:'G4',dur:2,beat:132},
    {note:'A4',dur:1,beat:134},
    {note:'G4',dur:1,beat:135},
    {note:'E4',dur:4,beat:136}
  ]},
  { category:'Modern / Film', keys:['nuvole bianche','nuvole','einaudi nuvole','einaudi white clouds'], title:'Nuvole Bianche · Einaudi', tempo:76, notes:[
    {note:'F3',dur:0.5,beat:0},
    {note:'Ab3',dur:0.5,beat:0.5},
    {note:'C4',dur:0.5,beat:1.0},
    {note:'F4',dur:0.5,beat:1.5},
    {note:'C4',dur:0.5,beat:2.0},
    {note:'Ab3',dur:0.5,beat:2.5},
    {note:'F3',dur:0.5,beat:3.0},
    {note:'C3',dur:0.5,beat:3.5},
    {note:'F3',dur:0.5,beat:4.0},
    {note:'Ab3',dur:0.5,beat:4.5},
    {note:'C4',dur:0.5,beat:5.0},
    {note:'F4',dur:0.5,beat:5.5},
    {note:'C4',dur:0.5,beat:6.0},
    {note:'Ab3',dur:0.5,beat:6.5},
    {note:'F3',dur:0.5,beat:7.0},
    {note:'C3',dur:0.5,beat:7.5},
    {note:'F3',dur:0.5,beat:8.0},
    {note:'Ab3',dur:0.5,beat:8.5},
    {note:'C4',dur:0.5,beat:9.0},
    {note:'F4',dur:0.5,beat:9.5},
    {note:'C4',dur:0.5,beat:10.0},
    {note:'Ab3',dur:0.5,beat:10.5},
    {note:'F3',dur:0.5,beat:11.0},
    {note:'C3',dur:0.5,beat:11.5},
    {note:'F3',dur:0.5,beat:12.0},
    {note:'Ab3',dur:0.5,beat:12.5},
    {note:'C4',dur:0.5,beat:13.0},
    {note:'F4',dur:0.5,beat:13.5},
    {note:'C4',dur:0.5,beat:14.0},
    {note:'Ab3',dur:0.5,beat:14.5},
    {note:'F3',dur:0.5,beat:15.0},
    {note:'C3',dur:0.5,beat:15.5},
    {note:'F5',dur:2,beat:16},
    {note:'Eb5',dur:1,beat:18},
    {note:'Db5',dur:1,beat:19},
    {note:'C5',dur:2,beat:20},
    {note:'Bb4',dur:2,beat:22},
    {note:'Ab4',dur:1,beat:24},
    {note:'Bb4',dur:1,beat:25},
    {note:'C5',dur:2,beat:26},
    {note:'Db5',dur:2,beat:28},
    {note:'Eb5',dur:1,beat:30},
    {note:'Db5',dur:1,beat:31},
    {note:'C5',dur:2,beat:32},
    {note:'Bb4',dur:1,beat:34},
    {note:'Ab4',dur:1,beat:35},
    {note:'F4',dur:2,beat:36},
    {note:'Ab4',dur:1,beat:38},
    {note:'Bb4',dur:1,beat:39},
    {note:'C5',dur:2,beat:40},
    {note:'Eb5',dur:2,beat:42},
    {note:'F5',dur:2,beat:44},
    {note:'F2',dur:4,beat:16},
    {note:'Db2',dur:4,beat:20},
    {note:'Ab2',dur:4,beat:24},
    {note:'Eb2',dur:4,beat:28},
    {note:'F2',dur:4,beat:32},
    {note:'F5',dur:2,beat:36},
    {note:'Ab5',dur:1,beat:38},
    {note:'G5',dur:1,beat:39},
    {note:'F5',dur:2,beat:40},
    {note:'Eb5',dur:2,beat:42},
    {note:'Db5',dur:1,beat:44},
    {note:'C5',dur:1,beat:45},
    {note:'Bb4',dur:2,beat:46},
    {note:'Ab4',dur:2,beat:48},
    {note:'Bb4',dur:2,beat:50},
    {note:'C5',dur:1,beat:52},
    {note:'Db5',dur:1,beat:53},
    {note:'Eb5',dur:2,beat:54},
    {note:'F5',dur:2,beat:56},
    {note:'Ab5',dur:1,beat:58},
    {note:'G5',dur:1,beat:59},
    {note:'F5',dur:2,beat:60},
    {note:'Eb5',dur:2,beat:62},
    {note:'Db5',dur:2,beat:64},
    {note:'F2',dur:4,beat:36},
    {note:'Db2',dur:4,beat:40},
    {note:'Ab2',dur:4,beat:44},
    {note:'Eb2',dur:4,beat:48},
    {note:'F2',dur:4,beat:52},
    {note:'F6',dur:2,beat:56},
    {note:'Eb6',dur:1,beat:58},
    {note:'Db6',dur:1,beat:59},
    {note:'C6',dur:2,beat:60},
    {note:'Bb5',dur:2,beat:62},
    {note:'Ab5',dur:1,beat:64},
    {note:'Bb5',dur:1,beat:65},
    {note:'C6',dur:2,beat:66},
    {note:'Db6',dur:2,beat:68},
    {note:'Eb6',dur:1,beat:70},
    {note:'Db6',dur:1,beat:71},
    {note:'C6',dur:2,beat:72},
    {note:'Bb5',dur:1,beat:74},
    {note:'Ab5',dur:1,beat:75},
    {note:'F5',dur:2,beat:76},
    {note:'C5',dur:1,beat:78},
    {note:'Eb5',dur:1,beat:79},
    {note:'F5',dur:2,beat:80},
    {note:'Ab5',dur:2,beat:82},
    {note:'C6',dur:2,beat:84},
    {note:'F2',dur:4,beat:56},
    {note:'Db2',dur:4,beat:60},
    {note:'Ab2',dur:4,beat:64},
    {note:'Eb2',dur:4,beat:68},
    {note:'F2',dur:4,beat:72},
    {note:'Ab6',dur:2,beat:76},
    {note:'G6',dur:1,beat:78},
    {note:'F6',dur:1,beat:79},
    {note:'Eb6',dur:2,beat:80},
    {note:'Db6',dur:2,beat:82},
    {note:'C6',dur:1,beat:84},
    {note:'Bb5',dur:1,beat:85},
    {note:'Ab5',dur:2,beat:86},
    {note:'F5',dur:2,beat:88},
    {note:'Ab5',dur:1,beat:90},
    {note:'C6',dur:1,beat:91},
    {note:'Eb6',dur:2,beat:92},
    {note:'F6',dur:2,beat:94},
    {note:'Eb6',dur:1,beat:96},
    {note:'Db6',dur:1,beat:97},
    {note:'C6',dur:2,beat:98},
    {note:'Bb5',dur:2,beat:100},
    {note:'F5',dur:2,beat:102},
    {note:'F2',dur:4,beat:76},
    {note:'Db2',dur:4,beat:80},
    {note:'Ab2',dur:4,beat:84},
    {note:'Eb2',dur:4,beat:88},
    {note:'F2',dur:4,beat:92},
    {note:'F5',dur:2,beat:96},
    {note:'Eb5',dur:1,beat:98},
    {note:'Db5',dur:1,beat:99},
    {note:'C5',dur:2,beat:100},
    {note:'Bb4',dur:2,beat:102},
    {note:'Ab4',dur:2,beat:104},
    {note:'F4',dur:4,beat:106},
    {note:'F2',dur:4,beat:96},
    {note:'Eb2',dur:4,beat:100},
    {note:'Db2',dur:4,beat:104},
    {note:'F2',dur:4,beat:108}
  ]},
  { category:'Modern / Film', keys:['una mattina','einaudi una mattina','intouchables','einaudi mattina'], title:'Una Mattina · Einaudi', tempo:70, notes:[
    {note:'D3',dur:0.5,beat:0},
    {note:'A3',dur:0.5,beat:0.5},
    {note:'F4',dur:0.5,beat:1.0},
    {note:'A4',dur:0.5,beat:1.5},
    {note:'D3',dur:0.5,beat:2.0},
    {note:'A3',dur:0.5,beat:2.5},
    {note:'F4',dur:0.5,beat:3.0},
    {note:'A4',dur:0.5,beat:3.5},
    {note:'D3',dur:0.5,beat:4.0},
    {note:'A3',dur:0.5,beat:4.5},
    {note:'F4',dur:0.5,beat:5.0},
    {note:'A4',dur:0.5,beat:5.5},
    {note:'D3',dur:0.5,beat:6.0},
    {note:'A3',dur:0.5,beat:6.5},
    {note:'F4',dur:0.5,beat:7.0},
    {note:'A4',dur:0.5,beat:7.5},
    {note:'D3',dur:0.5,beat:8.0},
    {note:'A3',dur:0.5,beat:8.5},
    {note:'F4',dur:0.5,beat:9.0},
    {note:'A4',dur:0.5,beat:9.5},
    {note:'D3',dur:0.5,beat:10.0},
    {note:'A3',dur:0.5,beat:10.5},
    {note:'F4',dur:0.5,beat:11.0},
    {note:'A4',dur:0.5,beat:11.5},
    {note:'D3',dur:0.5,beat:12.0},
    {note:'A3',dur:0.5,beat:12.5},
    {note:'F4',dur:0.5,beat:13.0},
    {note:'A4',dur:0.5,beat:13.5},
    {note:'D3',dur:0.5,beat:14.0},
    {note:'A3',dur:0.5,beat:14.5},
    {note:'F4',dur:0.5,beat:15.0},
    {note:'A4',dur:0.5,beat:15.5},
    {note:'D3',dur:0.5,beat:16.0},
    {note:'A3',dur:0.5,beat:16.5},
    {note:'F4',dur:0.5,beat:17.0},
    {note:'A4',dur:0.5,beat:17.5},
    {note:'D3',dur:0.5,beat:18.0},
    {note:'A3',dur:0.5,beat:18.5},
    {note:'F4',dur:0.5,beat:19.0},
    {note:'A4',dur:0.5,beat:19.5},
    {note:'D3',dur:0.5,beat:20.0},
    {note:'A3',dur:0.5,beat:20.5},
    {note:'F4',dur:0.5,beat:21.0},
    {note:'A4',dur:0.5,beat:21.5},
    {note:'D3',dur:0.5,beat:22.0},
    {note:'A3',dur:0.5,beat:22.5},
    {note:'F4',dur:0.5,beat:23.0},
    {note:'A4',dur:0.5,beat:23.5},
    {note:'D3',dur:0.5,beat:24.0},
    {note:'A3',dur:0.5,beat:24.5},
    {note:'F4',dur:0.5,beat:25.0},
    {note:'A4',dur:0.5,beat:25.5},
    {note:'D3',dur:0.5,beat:26.0},
    {note:'A3',dur:0.5,beat:26.5},
    {note:'F4',dur:0.5,beat:27.0},
    {note:'A4',dur:0.5,beat:27.5},
    {note:'D3',dur:0.5,beat:28.0},
    {note:'A3',dur:0.5,beat:28.5},
    {note:'F4',dur:0.5,beat:29.0},
    {note:'A4',dur:0.5,beat:29.5},
    {note:'D3',dur:0.5,beat:30.0},
    {note:'A3',dur:0.5,beat:30.5},
    {note:'F4',dur:0.5,beat:31.0},
    {note:'A4',dur:0.5,beat:31.5},
    {note:'D3',dur:0.5,beat:32.0},
    {note:'A3',dur:0.5,beat:32.5},
    {note:'F4',dur:0.5,beat:33.0},
    {note:'A4',dur:0.5,beat:33.5},
    {note:'D3',dur:0.5,beat:34.0},
    {note:'A3',dur:0.5,beat:34.5},
    {note:'F4',dur:0.5,beat:35.0},
    {note:'A4',dur:0.5,beat:35.5},
    {note:'D3',dur:0.5,beat:36.0},
    {note:'A3',dur:0.5,beat:36.5},
    {note:'F4',dur:0.5,beat:37.0},
    {note:'A4',dur:0.5,beat:37.5},
    {note:'D3',dur:0.5,beat:38.0},
    {note:'A3',dur:0.5,beat:38.5},
    {note:'F4',dur:0.5,beat:39.0},
    {note:'A4',dur:0.5,beat:39.5},
    {note:'D3',dur:0.5,beat:40.0},
    {note:'A3',dur:0.5,beat:40.5},
    {note:'F4',dur:0.5,beat:41.0},
    {note:'A4',dur:0.5,beat:41.5},
    {note:'D3',dur:0.5,beat:42.0},
    {note:'A3',dur:0.5,beat:42.5},
    {note:'F4',dur:0.5,beat:43.0},
    {note:'A4',dur:0.5,beat:43.5},
    {note:'D3',dur:0.5,beat:44.0},
    {note:'A3',dur:0.5,beat:44.5},
    {note:'F4',dur:0.5,beat:45.0},
    {note:'A4',dur:0.5,beat:45.5},
    {note:'D3',dur:0.5,beat:46.0},
    {note:'A3',dur:0.5,beat:46.5},
    {note:'F4',dur:0.5,beat:47.0},
    {note:'A4',dur:0.5,beat:47.5},
    {note:'D3',dur:0.5,beat:48.0},
    {note:'A3',dur:0.5,beat:48.5},
    {note:'F4',dur:0.5,beat:49.0},
    {note:'A4',dur:0.5,beat:49.5},
    {note:'D3',dur:0.5,beat:50.0},
    {note:'A3',dur:0.5,beat:50.5},
    {note:'F4',dur:0.5,beat:51.0},
    {note:'A4',dur:0.5,beat:51.5},
    {note:'D3',dur:0.5,beat:52.0},
    {note:'A3',dur:0.5,beat:52.5},
    {note:'F4',dur:0.5,beat:53.0},
    {note:'A4',dur:0.5,beat:53.5},
    {note:'D3',dur:0.5,beat:54.0},
    {note:'A3',dur:0.5,beat:54.5},
    {note:'F4',dur:0.5,beat:55.0},
    {note:'A4',dur:0.5,beat:55.5},
    {note:'D5',dur:1,beat:8},
    {note:'F5',dur:1,beat:9},
    {note:'A5',dur:2,beat:10},
    {note:'G5',dur:1,beat:12},
    {note:'F5',dur:1,beat:13},
    {note:'E5',dur:2,beat:14},
    {note:'D5',dur:1,beat:16},
    {note:'F5',dur:1,beat:17},
    {note:'A5',dur:2,beat:18},
    {note:'Bb5',dur:1,beat:20},
    {note:'A5',dur:1,beat:21},
    {note:'G5',dur:2,beat:22},
    {note:'F5',dur:1,beat:24},
    {note:'E5',dur:1,beat:25},
    {note:'D5',dur:2,beat:26},
    {note:'A5',dur:1,beat:28},
    {note:'G5',dur:1,beat:29},
    {note:'F5',dur:2,beat:30},
    {note:'E5',dur:1,beat:32},
    {note:'D5',dur:1,beat:33},
    {note:'A4',dur:2,beat:34},
    {note:'D5',dur:2,beat:36},
    {note:'F5',dur:2,beat:38},
    {note:'A5',dur:2,beat:36},
    {note:'G5',dur:1,beat:38},
    {note:'F5',dur:1,beat:39},
    {note:'E5',dur:2,beat:40},
    {note:'D5',dur:2,beat:42},
    {note:'F5',dur:1,beat:44},
    {note:'A5',dur:1,beat:45},
    {note:'Bb5',dur:2,beat:46},
    {note:'A5',dur:1,beat:48},
    {note:'G5',dur:1,beat:49},
    {note:'F5',dur:2,beat:50},
    {note:'E5',dur:2,beat:52},
    {note:'D5',dur:1,beat:54},
    {note:'A4',dur:1,beat:55},
    {note:'F4',dur:1,beat:56},
    {note:'D4',dur:1,beat:57},
    {note:'A3',dur:2,beat:58},
    {note:'A5',dur:2,beat:60},
    {note:'Bb5',dur:1,beat:62},
    {note:'A5',dur:1,beat:63},
    {note:'G5',dur:2,beat:64},
    {note:'F5',dur:1,beat:66},
    {note:'E5',dur:1,beat:67},
    {note:'D5',dur:2,beat:68},
    {note:'A4',dur:2,beat:70},
    {note:'D6',dur:1,beat:68},
    {note:'F6',dur:1,beat:69},
    {note:'A6',dur:2,beat:70},
    {note:'G6',dur:1,beat:72},
    {note:'F6',dur:1,beat:73},
    {note:'E6',dur:2,beat:74},
    {note:'D5',dur:1,beat:76},
    {note:'F5',dur:1,beat:77},
    {note:'A5',dur:2,beat:78},
    {note:'Bb5',dur:1,beat:80},
    {note:'A5',dur:1,beat:81},
    {note:'G5',dur:2,beat:82},
    {note:'F5',dur:1,beat:84},
    {note:'E5',dur:1,beat:85},
    {note:'D5',dur:2,beat:86},
    {note:'A4',dur:1,beat:88},
    {note:'D5',dur:1,beat:89},
    {note:'F5',dur:2,beat:90},
    {note:'E5',dur:1,beat:92},
    {note:'D5',dur:1,beat:93},
    {note:'A4',dur:2,beat:94},
    {note:'D5',dur:2,beat:96},
    {note:'A4',dur:2,beat:98},
    {note:'A4',dur:1,beat:100},
    {note:'D5',dur:1,beat:101},
    {note:'F5',dur:2,beat:102},
    {note:'E5',dur:1,beat:104},
    {note:'D5',dur:1,beat:105},
    {note:'A4',dur:2,beat:106},
    {note:'D5',dur:4,beat:108},
    {note:'A3',dur:4,beat:112}
  ]},
  { category:'Pop / Singer-Songwriter', keys:['mad world','gary jules','tears for fears mad','donnie darko'], title:'Mad World · Gary Jules', tempo:80, notes:[
    {note:'F#2',dur:4,beat:0},
    {note:'A2',dur:4,beat:4},
    {note:'E2',dur:4,beat:8},
    {note:'B2',dur:4,beat:12},
    {note:'F#5',dur:4,beat:0},
    {note:'A5',dur:4,beat:4},
    {note:'E5',dur:4,beat:8},
    {note:'B5',dur:4,beat:12},
    {note:'A4',dur:1,beat:16},
    {note:'C#5',dur:1,beat:17},
    {note:'E5',dur:1,beat:18},
    {note:'C#5',dur:1,beat:19},
    {note:'A4',dur:1,beat:20},
    {note:'C#5',dur:1,beat:21},
    {note:'E5',dur:1,beat:22},
    {note:'F#5',dur:1,beat:23},
    {note:'E5',dur:2,beat:24},
    {note:'C#5',dur:1,beat:26},
    {note:'A4',dur:1,beat:27},
    {note:'B4',dur:1,beat:28},
    {note:'A4',dur:1,beat:29},
    {note:'F#4',dur:2,beat:30},
    {note:'A4',dur:1,beat:32},
    {note:'C#5',dur:1,beat:33},
    {note:'E5',dur:1,beat:34},
    {note:'C#5',dur:1,beat:35},
    {note:'F#5',dur:1,beat:36},
    {note:'E5',dur:1,beat:37},
    {note:'C#5',dur:2,beat:38},
    {note:'B4',dur:1,beat:40},
    {note:'A4',dur:1,beat:41},
    {note:'F#4',dur:1,beat:42},
    {note:'E4',dur:1,beat:43},
    {note:'F#4',dur:4,beat:44},
    {note:'F#2',dur:4,beat:16},
    {note:'A2',dur:4,beat:20},
    {note:'E2',dur:4,beat:24},
    {note:'B2',dur:4,beat:28},
    {note:'F#2',dur:4,beat:32},
    {note:'A2',dur:4,beat:36},
    {note:'E2',dur:4,beat:40},
    {note:'B2',dur:4,beat:44},
    {note:'A4',dur:0.5,beat:48},
    {note:'B4',dur:0.5,beat:48.5},
    {note:'C#5',dur:1,beat:49.0},
    {note:'B4',dur:1,beat:50.0},
    {note:'A4',dur:1,beat:51.0},
    {note:'F#4',dur:0.5,beat:52.0},
    {note:'A4',dur:0.5,beat:52.5},
    {note:'B4',dur:1,beat:53.0},
    {note:'A4',dur:2,beat:54.0},
    {note:'A4',dur:0.5,beat:56.0},
    {note:'B4',dur:0.5,beat:56.5},
    {note:'C#5',dur:1,beat:57.0},
    {note:'B4',dur:1,beat:58.0},
    {note:'A4',dur:1,beat:59.0},
    {note:'F#4',dur:1,beat:60.0},
    {note:'E4',dur:1,beat:61.0},
    {note:'F#4',dur:2,beat:62.0},
    {note:'A4',dur:1,beat:64.0},
    {note:'B4',dur:1,beat:65.0},
    {note:'C#5',dur:2,beat:66.0},
    {note:'B4',dur:1,beat:68.0},
    {note:'A4',dur:1,beat:69.0},
    {note:'F#4',dur:2,beat:70.0},
    {note:'A4',dur:1,beat:72.0},
    {note:'B4',dur:1,beat:73.0},
    {note:'A4',dur:1,beat:74.0},
    {note:'F#4',dur:1,beat:75.0},
    {note:'E4',dur:2,beat:76.0},
    {note:'F#4',dur:2,beat:78.0},
    {note:'F#2',dur:4,beat:48},
    {note:'D2',dur:4,beat:52},
    {note:'A2',dur:4,beat:56},
    {note:'E2',dur:4,beat:60},
    {note:'F#2',dur:4,beat:64},
    {note:'D2',dur:4,beat:68},
    {note:'A2',dur:4,beat:72},
    {note:'E2',dur:4,beat:76},
    {note:'A4',dur:1,beat:80},
    {note:'C#5',dur:1,beat:81},
    {note:'E5',dur:1,beat:82},
    {note:'C#5',dur:1,beat:83},
    {note:'A4',dur:1,beat:84},
    {note:'C#5',dur:1,beat:85},
    {note:'E5',dur:1,beat:86},
    {note:'F#5',dur:1,beat:87},
    {note:'E5',dur:2,beat:88},
    {note:'C#5',dur:1,beat:90},
    {note:'A4',dur:1,beat:91},
    {note:'B4',dur:1,beat:92},
    {note:'A4',dur:1,beat:93},
    {note:'F#4',dur:2,beat:94},
    {note:'A4',dur:1,beat:96},
    {note:'C#5',dur:1,beat:97},
    {note:'E5',dur:1,beat:98},
    {note:'C#5',dur:1,beat:99},
    {note:'F#5',dur:1,beat:100},
    {note:'E5',dur:1,beat:101},
    {note:'C#5',dur:2,beat:102},
    {note:'B4',dur:1,beat:104},
    {note:'A4',dur:1,beat:105},
    {note:'F#4',dur:1,beat:106},
    {note:'E4',dur:1,beat:107},
    {note:'F#4',dur:4,beat:108},
    {note:'F#2',dur:4,beat:80},
    {note:'A2',dur:4,beat:84},
    {note:'E2',dur:4,beat:88},
    {note:'B2',dur:4,beat:92},
    {note:'F#2',dur:4,beat:96},
    {note:'A2',dur:4,beat:100},
    {note:'E2',dur:4,beat:104},
    {note:'B2',dur:4,beat:108},
    {note:'A5',dur:0.5,beat:112},
    {note:'B5',dur:0.5,beat:112.5},
    {note:'C#6',dur:1,beat:113.0},
    {note:'B5',dur:1,beat:114.0},
    {note:'A5',dur:1,beat:115.0},
    {note:'F#5',dur:0.5,beat:116.0},
    {note:'A5',dur:0.5,beat:116.5},
    {note:'B5',dur:1,beat:117.0},
    {note:'A5',dur:2,beat:118.0},
    {note:'A5',dur:0.5,beat:120.0},
    {note:'B5',dur:0.5,beat:120.5},
    {note:'C#6',dur:1,beat:121.0},
    {note:'B5',dur:1,beat:122.0},
    {note:'A5',dur:1,beat:123.0},
    {note:'F#5',dur:1,beat:124.0},
    {note:'E5',dur:1,beat:125.0},
    {note:'F#5',dur:2,beat:126.0},
    {note:'A5',dur:1,beat:128.0},
    {note:'B5',dur:1,beat:129.0},
    {note:'C#6',dur:2,beat:130.0},
    {note:'B5',dur:1,beat:132.0},
    {note:'A5',dur:1,beat:133.0},
    {note:'F#5',dur:2,beat:134.0},
    {note:'A5',dur:1,beat:136.0},
    {note:'B5',dur:1,beat:137.0},
    {note:'A5',dur:1,beat:138.0},
    {note:'F#5',dur:1,beat:139.0},
    {note:'E5',dur:2,beat:140.0},
    {note:'F#5',dur:2,beat:142.0},
    {note:'F#2',dur:4,beat:112},
    {note:'D2',dur:4,beat:116},
    {note:'A2',dur:4,beat:120},
    {note:'E2',dur:4,beat:124},
    {note:'F#2',dur:4,beat:128},
    {note:'D2',dur:4,beat:132},
    {note:'A2',dur:4,beat:136},
    {note:'E2',dur:4,beat:140},
    {note:'F#5',dur:2,beat:144},
    {note:'A4',dur:2,beat:146},
    {note:'F#4',dur:4,beat:148},
    {note:'F#2',dur:4,beat:144},
    {note:'F#2',dur:4,beat:148}
  ]},
  { category:'Pop / Singer-Songwriter', keys:['someone like you','adele someone','adele like you','someone adele'], title:'Someone Like You · Adele', tempo:67, notes:[
    {note:'A2',dur:0.5,beat:0},
    {note:'E3',dur:0.5,beat:0.5},
    {note:'A3',dur:0.5,beat:1.0},
    {note:'C#4',dur:0.5,beat:1.5},
    {note:'E4',dur:0.5,beat:2.0},
    {note:'C#4',dur:0.5,beat:2.5},
    {note:'A3',dur:0.5,beat:3.0},
    {note:'E3',dur:0.5,beat:3.5},
    {note:'C#3',dur:0.5,beat:4.0},
    {note:'G#3',dur:0.5,beat:4.5},
    {note:'C#4',dur:0.5,beat:5.0},
    {note:'E4',dur:0.5,beat:5.5},
    {note:'G#4',dur:0.5,beat:6.0},
    {note:'E4',dur:0.5,beat:6.5},
    {note:'C#4',dur:0.5,beat:7.0},
    {note:'G#3',dur:0.5,beat:7.5},
    {note:'F#2',dur:0.5,beat:8.0},
    {note:'C#3',dur:0.5,beat:8.5},
    {note:'F#3',dur:0.5,beat:9.0},
    {note:'A3',dur:0.5,beat:9.5},
    {note:'C#4',dur:0.5,beat:10.0},
    {note:'A3',dur:0.5,beat:10.5},
    {note:'F#3',dur:0.5,beat:11.0},
    {note:'C#3',dur:0.5,beat:11.5},
    {note:'D3',dur:0.5,beat:12.0},
    {note:'A3',dur:0.5,beat:12.5},
    {note:'D4',dur:0.5,beat:13.0},
    {note:'F#4',dur:0.5,beat:13.5},
    {note:'A4',dur:0.5,beat:14.0},
    {note:'F#4',dur:0.5,beat:14.5},
    {note:'D4',dur:0.5,beat:15.0},
    {note:'A3',dur:0.5,beat:15.5},
    {note:'A2',dur:0.5,beat:16.0},
    {note:'E3',dur:0.5,beat:16.5},
    {note:'A3',dur:0.5,beat:17.0},
    {note:'C#4',dur:0.5,beat:17.5},
    {note:'E4',dur:0.5,beat:18.0},
    {note:'C#4',dur:0.5,beat:18.5},
    {note:'A3',dur:0.5,beat:19.0},
    {note:'E3',dur:0.5,beat:19.5},
    {note:'C#3',dur:0.5,beat:20.0},
    {note:'G#3',dur:0.5,beat:20.5},
    {note:'C#4',dur:0.5,beat:21.0},
    {note:'E4',dur:0.5,beat:21.5},
    {note:'G#4',dur:0.5,beat:22.0},
    {note:'E4',dur:0.5,beat:22.5},
    {note:'C#4',dur:0.5,beat:23.0},
    {note:'G#3',dur:0.5,beat:23.5},
    {note:'F#2',dur:0.5,beat:24.0},
    {note:'C#3',dur:0.5,beat:24.5},
    {note:'F#3',dur:0.5,beat:25.0},
    {note:'A3',dur:0.5,beat:25.5},
    {note:'C#4',dur:0.5,beat:26.0},
    {note:'A3',dur:0.5,beat:26.5},
    {note:'F#3',dur:0.5,beat:27.0},
    {note:'C#3',dur:0.5,beat:27.5},
    {note:'D3',dur:0.5,beat:28.0},
    {note:'A3',dur:0.5,beat:28.5},
    {note:'D4',dur:0.5,beat:29.0},
    {note:'F#4',dur:0.5,beat:29.5},
    {note:'A4',dur:0.5,beat:30.0},
    {note:'F#4',dur:0.5,beat:30.5},
    {note:'D4',dur:0.5,beat:31.0},
    {note:'A3',dur:0.5,beat:31.5},
    {note:'A2',dur:0.5,beat:32.0},
    {note:'E3',dur:0.5,beat:32.5},
    {note:'A3',dur:0.5,beat:33.0},
    {note:'C#4',dur:0.5,beat:33.5},
    {note:'E4',dur:0.5,beat:34.0},
    {note:'C#4',dur:0.5,beat:34.5},
    {note:'A3',dur:0.5,beat:35.0},
    {note:'E3',dur:0.5,beat:35.5},
    {note:'C#3',dur:0.5,beat:36.0},
    {note:'G#3',dur:0.5,beat:36.5},
    {note:'C#4',dur:0.5,beat:37.0},
    {note:'E4',dur:0.5,beat:37.5},
    {note:'G#4',dur:0.5,beat:38.0},
    {note:'E4',dur:0.5,beat:38.5},
    {note:'C#4',dur:0.5,beat:39.0},
    {note:'G#3',dur:0.5,beat:39.5},
    {note:'F#2',dur:0.5,beat:40.0},
    {note:'C#3',dur:0.5,beat:40.5},
    {note:'F#3',dur:0.5,beat:41.0},
    {note:'A3',dur:0.5,beat:41.5},
    {note:'C#4',dur:0.5,beat:42.0},
    {note:'A3',dur:0.5,beat:42.5},
    {note:'F#3',dur:0.5,beat:43.0},
    {note:'C#3',dur:0.5,beat:43.5},
    {note:'D3',dur:0.5,beat:44.0},
    {note:'A3',dur:0.5,beat:44.5},
    {note:'D4',dur:0.5,beat:45.0},
    {note:'F#4',dur:0.5,beat:45.5},
    {note:'A4',dur:0.5,beat:46.0},
    {note:'F#4',dur:0.5,beat:46.5},
    {note:'D4',dur:0.5,beat:47.0},
    {note:'A3',dur:0.5,beat:47.5},
    {note:'A2',dur:0.5,beat:48.0},
    {note:'E3',dur:0.5,beat:48.5},
    {note:'A3',dur:0.5,beat:49.0},
    {note:'C#4',dur:0.5,beat:49.5},
    {note:'E4',dur:0.5,beat:50.0},
    {note:'C#4',dur:0.5,beat:50.5},
    {note:'A3',dur:0.5,beat:51.0},
    {note:'E3',dur:0.5,beat:51.5},
    {note:'C#3',dur:0.5,beat:52.0},
    {note:'G#3',dur:0.5,beat:52.5},
    {note:'C#4',dur:0.5,beat:53.0},
    {note:'E4',dur:0.5,beat:53.5},
    {note:'G#4',dur:0.5,beat:54.0},
    {note:'E4',dur:0.5,beat:54.5},
    {note:'C#4',dur:0.5,beat:55.0},
    {note:'G#3',dur:0.5,beat:55.5},
    {note:'F#2',dur:0.5,beat:56.0},
    {note:'C#3',dur:0.5,beat:56.5},
    {note:'F#3',dur:0.5,beat:57.0},
    {note:'A3',dur:0.5,beat:57.5},
    {note:'C#4',dur:0.5,beat:58.0},
    {note:'A3',dur:0.5,beat:58.5},
    {note:'F#3',dur:0.5,beat:59.0},
    {note:'C#3',dur:0.5,beat:59.5},
    {note:'D3',dur:0.5,beat:60.0},
    {note:'A3',dur:0.5,beat:60.5},
    {note:'D4',dur:0.5,beat:61.0},
    {note:'F#4',dur:0.5,beat:61.5},
    {note:'A4',dur:0.5,beat:62.0},
    {note:'F#4',dur:0.5,beat:62.5},
    {note:'D4',dur:0.5,beat:63.0},
    {note:'A3',dur:0.5,beat:63.5},
    {note:'A2',dur:0.5,beat:64.0},
    {note:'E3',dur:0.5,beat:64.5},
    {note:'A3',dur:0.5,beat:65.0},
    {note:'C#4',dur:0.5,beat:65.5},
    {note:'E4',dur:0.5,beat:66.0},
    {note:'C#4',dur:0.5,beat:66.5},
    {note:'A3',dur:0.5,beat:67.0},
    {note:'E3',dur:0.5,beat:67.5},
    {note:'C#3',dur:0.5,beat:68.0},
    {note:'G#3',dur:0.5,beat:68.5},
    {note:'C#4',dur:0.5,beat:69.0},
    {note:'E4',dur:0.5,beat:69.5},
    {note:'G#4',dur:0.5,beat:70.0},
    {note:'E4',dur:0.5,beat:70.5},
    {note:'C#4',dur:0.5,beat:71.0},
    {note:'G#3',dur:0.5,beat:71.5},
    {note:'F#2',dur:0.5,beat:72.0},
    {note:'C#3',dur:0.5,beat:72.5},
    {note:'F#3',dur:0.5,beat:73.0},
    {note:'A3',dur:0.5,beat:73.5},
    {note:'C#4',dur:0.5,beat:74.0},
    {note:'A3',dur:0.5,beat:74.5},
    {note:'F#3',dur:0.5,beat:75.0},
    {note:'C#3',dur:0.5,beat:75.5},
    {note:'D3',dur:0.5,beat:76.0},
    {note:'A3',dur:0.5,beat:76.5},
    {note:'D4',dur:0.5,beat:77.0},
    {note:'F#4',dur:0.5,beat:77.5},
    {note:'A4',dur:0.5,beat:78.0},
    {note:'F#4',dur:0.5,beat:78.5},
    {note:'D4',dur:0.5,beat:79.0},
    {note:'A3',dur:0.5,beat:79.5},
    {note:'A2',dur:0.5,beat:80.0},
    {note:'E3',dur:0.5,beat:80.5},
    {note:'A3',dur:0.5,beat:81.0},
    {note:'C#4',dur:0.5,beat:81.5},
    {note:'E4',dur:0.5,beat:82.0},
    {note:'C#4',dur:0.5,beat:82.5},
    {note:'A3',dur:0.5,beat:83.0},
    {note:'E3',dur:0.5,beat:83.5},
    {note:'C#3',dur:0.5,beat:84.0},
    {note:'G#3',dur:0.5,beat:84.5},
    {note:'C#4',dur:0.5,beat:85.0},
    {note:'E4',dur:0.5,beat:85.5},
    {note:'G#4',dur:0.5,beat:86.0},
    {note:'E4',dur:0.5,beat:86.5},
    {note:'C#4',dur:0.5,beat:87.0},
    {note:'G#3',dur:0.5,beat:87.5},
    {note:'F#2',dur:0.5,beat:88.0},
    {note:'C#3',dur:0.5,beat:88.5},
    {note:'F#3',dur:0.5,beat:89.0},
    {note:'A3',dur:0.5,beat:89.5},
    {note:'C#4',dur:0.5,beat:90.0},
    {note:'A3',dur:0.5,beat:90.5},
    {note:'F#3',dur:0.5,beat:91.0},
    {note:'C#3',dur:0.5,beat:91.5},
    {note:'D3',dur:0.5,beat:92.0},
    {note:'A3',dur:0.5,beat:92.5},
    {note:'D4',dur:0.5,beat:93.0},
    {note:'F#4',dur:0.5,beat:93.5},
    {note:'A4',dur:0.5,beat:94.0},
    {note:'F#4',dur:0.5,beat:94.5},
    {note:'D4',dur:0.5,beat:95.0},
    {note:'A3',dur:0.5,beat:95.5},
    {note:'E5',dur:1,beat:0},
    {note:'A5',dur:1,beat:1},
    {note:'A5',dur:2,beat:2},
    {note:'E5',dur:1,beat:4},
    {note:'G#5',dur:1,beat:5},
    {note:'G#5',dur:2,beat:6},
    {note:'C#5',dur:1,beat:8},
    {note:'E5',dur:1,beat:9},
    {note:'F#5',dur:2,beat:10},
    {note:'D5',dur:1,beat:12},
    {note:'A4',dur:1,beat:13},
    {note:'A4',dur:2,beat:14},
    {note:'E5',dur:1,beat:16},
    {note:'A5',dur:1,beat:17},
    {note:'B5',dur:2,beat:18},
    {note:'E5',dur:1,beat:20},
    {note:'G#5',dur:1,beat:21},
    {note:'A5',dur:2,beat:22},
    {note:'C#5',dur:1,beat:24},
    {note:'E5',dur:1,beat:25},
    {note:'F#5',dur:2,beat:26},
    {note:'D5',dur:1,beat:28},
    {note:'A4',dur:1,beat:29},
    {note:'A4',dur:2,beat:30},
    {note:'C#5',dur:1,beat:32},
    {note:'E5',dur:1,beat:33},
    {note:'A5',dur:2,beat:34},
    {note:'B5',dur:1,beat:36},
    {note:'A5',dur:1,beat:37},
    {note:'G#5',dur:2,beat:38},
    {note:'F#5',dur:1,beat:40},
    {note:'E5',dur:1,beat:41},
    {note:'D5',dur:2,beat:42},
    {note:'C#5',dur:1,beat:44},
    {note:'B4',dur:1,beat:45},
    {note:'A4',dur:2,beat:46},
    {note:'C#5',dur:1,beat:48},
    {note:'E5',dur:1,beat:49},
    {note:'A5',dur:2,beat:50},
    {note:'B5',dur:1,beat:52},
    {note:'A5',dur:1,beat:53},
    {note:'G#5',dur:2,beat:54},
    {note:'F#5',dur:1,beat:56},
    {note:'E5',dur:1,beat:57},
    {note:'D5',dur:1,beat:58},
    {note:'C#5',dur:1,beat:59},
    {note:'A4',dur:4,beat:60},
    {note:'E6',dur:1,beat:64},
    {note:'A6',dur:1,beat:65},
    {note:'A6',dur:2,beat:66},
    {note:'E6',dur:1,beat:68},
    {note:'G#6',dur:1,beat:69},
    {note:'G#6',dur:2,beat:70},
    {note:'C#6',dur:1,beat:72},
    {note:'E6',dur:1,beat:73},
    {note:'F#6',dur:2,beat:74},
    {note:'D6',dur:1,beat:76},
    {note:'A5',dur:1,beat:77},
    {note:'A5',dur:2,beat:78},
    {note:'E6',dur:1,beat:80},
    {note:'A6',dur:1,beat:81},
    {note:'B6',dur:2,beat:82},
    {note:'E6',dur:1,beat:84},
    {note:'G#6',dur:1,beat:85},
    {note:'A6',dur:2,beat:86},
    {note:'C#6',dur:1,beat:88},
    {note:'E6',dur:1,beat:89},
    {note:'F#6',dur:2,beat:90},
    {note:'D6',dur:1,beat:92},
    {note:'A5',dur:1,beat:93},
    {note:'A5',dur:2,beat:94},
    {note:'C#5',dur:1,beat:96},
    {note:'E5',dur:1,beat:97},
    {note:'A5',dur:2,beat:98},
    {note:'B5',dur:1,beat:100},
    {note:'A5',dur:1,beat:101},
    {note:'G#5',dur:2,beat:102},
    {note:'F#5',dur:1,beat:104},
    {note:'E5',dur:1,beat:105},
    {note:'D5',dur:2,beat:106},
    {note:'C#5',dur:1,beat:108},
    {note:'B4',dur:1,beat:109},
    {note:'A4',dur:2,beat:110},
    {note:'C#5',dur:1,beat:112},
    {note:'E5',dur:1,beat:113},
    {note:'A5',dur:2,beat:114},
    {note:'B5',dur:1,beat:116},
    {note:'A5',dur:1,beat:117},
    {note:'G#5',dur:2,beat:118},
    {note:'F#5',dur:1,beat:120},
    {note:'E5',dur:1,beat:121},
    {note:'D5',dur:1,beat:122},
    {note:'C#5',dur:1,beat:123},
    {note:'A4',dur:4,beat:124},
    {note:'A5',dur:2,beat:128},
    {note:'C#6',dur:2,beat:130},
    {note:'E6',dur:2,beat:132},
    {note:'A5',dur:2,beat:134},
    {note:'A4',dur:4,beat:136}
  ]},
  { category:'Pop / Singer-Songwriter', keys:['all of me','john legend','all me legend','john legend all'], title:'All of Me · John Legend', tempo:63, notes:[
    {note:'E2',dur:4,beat:0},
    {note:'C2',dur:4,beat:4},
    {note:'G2',dur:4,beat:8},
    {note:'D2',dur:4,beat:12},
    {note:'B4',dur:2,beat:0},
    {note:'D5',dur:2,beat:2},
    {note:'G5',dur:2,beat:4},
    {note:'A4',dur:2,beat:6},
    {note:'B3',dur:0.5,beat:16},
    {note:'D4',dur:0.5,beat:16.5},
    {note:'G4',dur:1,beat:17.0},
    {note:'A4',dur:1,beat:18.0},
    {note:'B4',dur:1,beat:19.0},
    {note:'B3',dur:0.5,beat:20.0},
    {note:'D4',dur:0.5,beat:20.5},
    {note:'G4',dur:1,beat:21.0},
    {note:'A4',dur:1,beat:22.0},
    {note:'B4',dur:1,beat:23.0},
    {note:'C5',dur:0.5,beat:24.0},
    {note:'D5',dur:0.5,beat:24.5},
    {note:'E5',dur:1,beat:25.0},
    {note:'D5',dur:1,beat:26.0},
    {note:'B4',dur:1,beat:27.0},
    {note:'A4',dur:1,beat:28.0},
    {note:'G4',dur:3,beat:29.0},
    {note:'B3',dur:0.5,beat:32.0},
    {note:'D4',dur:0.5,beat:32.5},
    {note:'G4',dur:1,beat:33.0},
    {note:'B4',dur:1,beat:34.0},
    {note:'D5',dur:1,beat:35.0},
    {note:'D5',dur:0.5,beat:36.0},
    {note:'C5',dur:0.5,beat:36.5},
    {note:'B4',dur:1,beat:37.0},
    {note:'A4',dur:2,beat:38.0},
    {note:'B4',dur:0.5,beat:40.0},
    {note:'G4',dur:0.5,beat:40.5},
    {note:'A4',dur:1,beat:41.0},
    {note:'G4',dur:2,beat:42.0},
    {note:'E4',dur:1,beat:44.0},
    {note:'G4',dur:1,beat:45.0},
    {note:'D4',dur:2,beat:46.0},
    {note:'E2',dur:4,beat:16},
    {note:'C2',dur:4,beat:20},
    {note:'G2',dur:4,beat:24},
    {note:'D2',dur:4,beat:28},
    {note:'E2',dur:4,beat:32},
    {note:'C2',dur:4,beat:36},
    {note:'G2',dur:4,beat:40},
    {note:'D2',dur:4,beat:44},
    {note:'D5',dur:0.5,beat:48},
    {note:'D5',dur:0.5,beat:48.5},
    {note:'D5',dur:1,beat:49.0},
    {note:'E5',dur:1,beat:50.0},
    {note:'D5',dur:1,beat:51.0},
    {note:'B4',dur:1,beat:52.0},
    {note:'A4',dur:2,beat:53.0},
    {note:'G4',dur:1,beat:55.0},
    {note:'B4',dur:0.5,beat:56.0},
    {note:'B4',dur:0.5,beat:56.5},
    {note:'B4',dur:1,beat:57.0},
    {note:'C5',dur:1,beat:58.0},
    {note:'B4',dur:1,beat:59.0},
    {note:'G4',dur:1,beat:60.0},
    {note:'E4',dur:2,beat:61.0},
    {note:'G4',dur:1,beat:63.0},
    {note:'D5',dur:0.5,beat:64.0},
    {note:'D5',dur:0.5,beat:64.5},
    {note:'E5',dur:1,beat:65.0},
    {note:'D5',dur:1,beat:66.0},
    {note:'C5',dur:1,beat:67.0},
    {note:'B4',dur:1,beat:68.0},
    {note:'A4',dur:2,beat:69.0},
    {note:'B4',dur:1,beat:71.0},
    {note:'G4',dur:1,beat:72.0},
    {note:'A4',dur:1,beat:73.0},
    {note:'B4',dur:1,beat:74.0},
    {note:'A4',dur:1,beat:75.0},
    {note:'G4',dur:4,beat:76.0},
    {note:'E2',dur:4,beat:48},
    {note:'C2',dur:4,beat:52},
    {note:'G2',dur:4,beat:56},
    {note:'D2',dur:4,beat:60},
    {note:'E2',dur:4,beat:64},
    {note:'C2',dur:4,beat:68},
    {note:'G2',dur:4,beat:72},
    {note:'D2',dur:4,beat:76},
    {note:'B3',dur:0.5,beat:80},
    {note:'D4',dur:0.5,beat:80.5},
    {note:'G4',dur:1,beat:81.0},
    {note:'A4',dur:1,beat:82.0},
    {note:'B4',dur:1,beat:83.0},
    {note:'B3',dur:0.5,beat:84.0},
    {note:'D4',dur:0.5,beat:84.5},
    {note:'G4',dur:1,beat:85.0},
    {note:'A4',dur:1,beat:86.0},
    {note:'B4',dur:1,beat:87.0},
    {note:'C5',dur:0.5,beat:88.0},
    {note:'D5',dur:0.5,beat:88.5},
    {note:'E5',dur:1,beat:89.0},
    {note:'D5',dur:1,beat:90.0},
    {note:'B4',dur:1,beat:91.0},
    {note:'A4',dur:1,beat:92.0},
    {note:'G4',dur:3,beat:93.0},
    {note:'B3',dur:0.5,beat:96.0},
    {note:'D4',dur:0.5,beat:96.5},
    {note:'G4',dur:1,beat:97.0},
    {note:'B4',dur:1,beat:98.0},
    {note:'D5',dur:1,beat:99.0},
    {note:'D5',dur:0.5,beat:100.0},
    {note:'C5',dur:0.5,beat:100.5},
    {note:'B4',dur:1,beat:101.0},
    {note:'A4',dur:2,beat:102.0},
    {note:'B4',dur:0.5,beat:104.0},
    {note:'G4',dur:0.5,beat:104.5},
    {note:'A4',dur:1,beat:105.0},
    {note:'G4',dur:2,beat:106.0},
    {note:'E4',dur:1,beat:108.0},
    {note:'G4',dur:1,beat:109.0},
    {note:'D4',dur:2,beat:110.0},
    {note:'E2',dur:4,beat:80},
    {note:'C2',dur:4,beat:84},
    {note:'G2',dur:4,beat:88},
    {note:'D2',dur:4,beat:92},
    {note:'E2',dur:4,beat:96},
    {note:'C2',dur:4,beat:100},
    {note:'G2',dur:4,beat:104},
    {note:'D2',dur:4,beat:108},
    {note:'D5',dur:0.5,beat:112},
    {note:'D5',dur:0.5,beat:112.5},
    {note:'D5',dur:1,beat:113.0},
    {note:'E5',dur:1,beat:114.0},
    {note:'D5',dur:1,beat:115.0},
    {note:'B4',dur:1,beat:116.0},
    {note:'A4',dur:2,beat:117.0},
    {note:'G4',dur:1,beat:119.0},
    {note:'B4',dur:0.5,beat:120.0},
    {note:'B4',dur:0.5,beat:120.5},
    {note:'B4',dur:1,beat:121.0},
    {note:'C5',dur:1,beat:122.0},
    {note:'B4',dur:1,beat:123.0},
    {note:'G4',dur:1,beat:124.0},
    {note:'E4',dur:2,beat:125.0},
    {note:'G4',dur:1,beat:127.0},
    {note:'D5',dur:0.5,beat:128.0},
    {note:'D5',dur:0.5,beat:128.5},
    {note:'E5',dur:1,beat:129.0},
    {note:'D5',dur:1,beat:130.0},
    {note:'C5',dur:1,beat:131.0},
    {note:'B4',dur:1,beat:132.0},
    {note:'A4',dur:2,beat:133.0},
    {note:'B4',dur:1,beat:135.0},
    {note:'G4',dur:1,beat:136.0},
    {note:'A4',dur:1,beat:137.0},
    {note:'B4',dur:1,beat:138.0},
    {note:'A4',dur:1,beat:139.0},
    {note:'G4',dur:4,beat:140.0},
    {note:'E2',dur:4,beat:112},
    {note:'C2',dur:4,beat:116},
    {note:'G2',dur:4,beat:120},
    {note:'D2',dur:4,beat:124},
    {note:'E2',dur:4,beat:128},
    {note:'C2',dur:4,beat:132},
    {note:'G2',dur:4,beat:136},
    {note:'D2',dur:4,beat:140},
    {note:'D5',dur:1,beat:144},
    {note:'E5',dur:1,beat:145},
    {note:'D5',dur:1,beat:146},
    {note:'B4',dur:1,beat:147},
    {note:'A4',dur:1,beat:148},
    {note:'G4',dur:1,beat:149},
    {note:'A4',dur:1,beat:150},
    {note:'B4',dur:1,beat:151},
    {note:'G4',dur:4,beat:152},
    {note:'C2',dur:4,beat:144},
    {note:'G2',dur:4,beat:148},
    {note:'D2',dur:4,beat:152},
    {note:'G2',dur:4,beat:156}
  ]},
  { category:'Pop / Singer-Songwriter', keys:['piano man','billy joel','billy joel piano'], title:'Piano Man · Billy Joel', tempo:75, notes:[
    {note:'G4',dur:1,beat:0},
    {note:'A4',dur:1,beat:1},
    {note:'B4',dur:1,beat:2},
    {note:'C5',dur:1,beat:3},
    {note:'D5',dur:2,beat:4},
    {note:'E5',dur:2,beat:6},
    {note:'C2',dur:2.0,beat:0},
    {note:'G2',dur:2.0,beat:2.0},
    {note:'G2',dur:2.0,beat:4},
    {note:'D3',dur:2.0,beat:6.0},
    {note:'G4',dur:1,beat:8},
    {note:'C5',dur:1,beat:9},
    {note:'E5',dur:2,beat:10},
    {note:'D5',dur:1,beat:12},
    {note:'E5',dur:1,beat:13},
    {note:'D5',dur:2,beat:14},
    {note:'C5',dur:1,beat:16},
    {note:'B4',dur:1,beat:17},
    {note:'A4',dur:1,beat:18},
    {note:'G4',dur:1,beat:19},
    {note:'A4',dur:2,beat:20},
    {note:'G4',dur:2,beat:22},
    {note:'G4',dur:1,beat:24},
    {note:'C5',dur:1,beat:25},
    {note:'E5',dur:2,beat:26},
    {note:'D5',dur:1,beat:28},
    {note:'C5',dur:1,beat:29},
    {note:'B4',dur:2,beat:30},
    {note:'C5',dur:1,beat:32},
    {note:'D5',dur:1,beat:33},
    {note:'E5',dur:1,beat:34},
    {note:'F5',dur:1,beat:35},
    {note:'E5',dur:2,beat:36},
    {note:'C5',dur:2,beat:38},
    {note:'C2',dur:2.0,beat:8},
    {note:'G2',dur:2.0,beat:10.0},
    {note:'G2',dur:2.0,beat:12},
    {note:'D3',dur:2.0,beat:14.0},
    {note:'A2',dur:2.0,beat:16},
    {note:'E3',dur:2.0,beat:18.0},
    {note:'F2',dur:2.0,beat:20},
    {note:'C3',dur:2.0,beat:22.0},
    {note:'C2',dur:2.0,beat:24},
    {note:'G2',dur:2.0,beat:26.0},
    {note:'F2',dur:2.0,beat:28},
    {note:'C3',dur:2.0,beat:30.0},
    {note:'C2',dur:2.0,beat:32},
    {note:'G2',dur:2.0,beat:34.0},
    {note:'G2',dur:2.0,beat:36},
    {note:'D3',dur:2.0,beat:38.0},
    {note:'G5',dur:1,beat:40},
    {note:'E5',dur:1,beat:41},
    {note:'C5',dur:1,beat:42},
    {note:'G4',dur:1,beat:43},
    {note:'A4',dur:2,beat:44},
    {note:'G4',dur:2,beat:46},
    {note:'F5',dur:1,beat:48},
    {note:'E5',dur:1,beat:49},
    {note:'D5',dur:1,beat:50},
    {note:'C5',dur:1,beat:51},
    {note:'D5',dur:2,beat:52},
    {note:'C5',dur:2,beat:54},
    {note:'E5',dur:1,beat:56},
    {note:'G5',dur:1,beat:57},
    {note:'A5',dur:1,beat:58},
    {note:'G5',dur:1,beat:59},
    {note:'F5',dur:1,beat:60},
    {note:'E5',dur:1,beat:61},
    {note:'D5',dur:2,beat:62},
    {note:'C5',dur:1,beat:64},
    {note:'E5',dur:1,beat:65},
    {note:'G4',dur:1,beat:66},
    {note:'C5',dur:1,beat:67},
    {note:'C5',dur:4,beat:68},
    {note:'C2',dur:2.0,beat:40},
    {note:'G2',dur:2.0,beat:42.0},
    {note:'G2',dur:2.0,beat:44},
    {note:'D3',dur:2.0,beat:46.0},
    {note:'F2',dur:2.0,beat:48},
    {note:'C3',dur:2.0,beat:50.0},
    {note:'C2',dur:2.0,beat:52},
    {note:'G2',dur:2.0,beat:54.0},
    {note:'F2',dur:2.0,beat:56},
    {note:'C3',dur:2.0,beat:58.0},
    {note:'C2',dur:2.0,beat:60},
    {note:'G2',dur:2.0,beat:62.0},
    {note:'G2',dur:2.0,beat:64},
    {note:'D3',dur:2.0,beat:66.0},
    {note:'C2',dur:2.0,beat:68},
    {note:'G2',dur:2.0,beat:70.0},
    {note:'G4',dur:1,beat:72},
    {note:'C5',dur:1,beat:73},
    {note:'E5',dur:2,beat:74},
    {note:'D5',dur:1,beat:76},
    {note:'E5',dur:1,beat:77},
    {note:'D5',dur:2,beat:78},
    {note:'C5',dur:1,beat:80},
    {note:'B4',dur:1,beat:81},
    {note:'A4',dur:1,beat:82},
    {note:'G4',dur:1,beat:83},
    {note:'A4',dur:2,beat:84},
    {note:'G4',dur:2,beat:86},
    {note:'G4',dur:1,beat:88},
    {note:'C5',dur:1,beat:89},
    {note:'E5',dur:2,beat:90},
    {note:'D5',dur:1,beat:92},
    {note:'C5',dur:1,beat:93},
    {note:'B4',dur:2,beat:94},
    {note:'C5',dur:1,beat:96},
    {note:'D5',dur:1,beat:97},
    {note:'E5',dur:1,beat:98},
    {note:'F5',dur:1,beat:99},
    {note:'E5',dur:2,beat:100},
    {note:'C5',dur:2,beat:102},
    {note:'C2',dur:2.0,beat:72},
    {note:'G2',dur:2.0,beat:74.0},
    {note:'G2',dur:2.0,beat:76},
    {note:'D3',dur:2.0,beat:78.0},
    {note:'A2',dur:2.0,beat:80},
    {note:'E3',dur:2.0,beat:82.0},
    {note:'F2',dur:2.0,beat:84},
    {note:'C3',dur:2.0,beat:86.0},
    {note:'C2',dur:2.0,beat:88},
    {note:'G2',dur:2.0,beat:90.0},
    {note:'F2',dur:2.0,beat:92},
    {note:'C3',dur:2.0,beat:94.0},
    {note:'C2',dur:2.0,beat:96},
    {note:'G2',dur:2.0,beat:98.0},
    {note:'G2',dur:2.0,beat:100},
    {note:'D3',dur:2.0,beat:102.0},
    {note:'G5',dur:1,beat:104},
    {note:'E5',dur:1,beat:105},
    {note:'C5',dur:1,beat:106},
    {note:'G4',dur:1,beat:107},
    {note:'A4',dur:2,beat:108},
    {note:'G4',dur:2,beat:110},
    {note:'F5',dur:1,beat:112},
    {note:'E5',dur:1,beat:113},
    {note:'D5',dur:1,beat:114},
    {note:'C5',dur:1,beat:115},
    {note:'D5',dur:2,beat:116},
    {note:'C5',dur:2,beat:118},
    {note:'E5',dur:1,beat:120},
    {note:'G5',dur:1,beat:121},
    {note:'A5',dur:1,beat:122},
    {note:'G5',dur:1,beat:123},
    {note:'F5',dur:1,beat:124},
    {note:'E5',dur:1,beat:125},
    {note:'D5',dur:2,beat:126},
    {note:'C5',dur:1,beat:128},
    {note:'E5',dur:1,beat:129},
    {note:'G4',dur:1,beat:130},
    {note:'C5',dur:1,beat:131},
    {note:'C5',dur:4,beat:132},
    {note:'C2',dur:2.0,beat:104},
    {note:'G2',dur:2.0,beat:106.0},
    {note:'G2',dur:2.0,beat:108},
    {note:'D3',dur:2.0,beat:110.0},
    {note:'F2',dur:2.0,beat:112},
    {note:'C3',dur:2.0,beat:114.0},
    {note:'C2',dur:2.0,beat:116},
    {note:'G2',dur:2.0,beat:118.0},
    {note:'F2',dur:2.0,beat:120},
    {note:'C3',dur:2.0,beat:122.0},
    {note:'C2',dur:2.0,beat:124},
    {note:'G2',dur:2.0,beat:126.0},
    {note:'G2',dur:2.0,beat:128},
    {note:'D3',dur:2.0,beat:130.0},
    {note:'C2',dur:2.0,beat:132},
    {note:'G2',dur:2.0,beat:134.0},
    {note:'E5',dur:1,beat:136},
    {note:'G5',dur:1,beat:137},
    {note:'C6',dur:2,beat:138},
    {note:'G4',dur:4,beat:140},
    {note:'C2',dur:2.0,beat:136},
    {note:'G2',dur:2.0,beat:138.0},
    {note:'C2',dur:2.0,beat:140},
    {note:'G2',dur:2.0,beat:142.0}
  ]},
  { category:'Pop / Singer-Songwriter', keys:['tiny dancer','elton tiny','elton john tiny dancer','tiny dancer elton'], title:'Tiny Dancer · Elton John', tempo:76, notes:[
    {note:'C5',dur:0.5,beat:0},
    {note:'E5',dur:0.5,beat:0.5},
    {note:'G5',dur:0.5,beat:1.0},
    {note:'C6',dur:0.5,beat:1.5},
    {note:'G5',dur:0.5,beat:2.0},
    {note:'E5',dur:0.5,beat:2.5},
    {note:'C5',dur:0.5,beat:3.0},
    {note:'G4',dur:0.5,beat:3.5},
    {note:'A4',dur:0.5,beat:4.0},
    {note:'C5',dur:0.5,beat:4.5},
    {note:'F5',dur:0.5,beat:5.0},
    {note:'A5',dur:0.5,beat:5.5},
    {note:'F5',dur:0.5,beat:6.0},
    {note:'C5',dur:0.5,beat:6.5},
    {note:'A4',dur:0.5,beat:7.0},
    {note:'F4',dur:0.5,beat:7.5},
    {note:'C2',dur:2.0,beat:0},
    {note:'G2',dur:2.0,beat:2.0},
    {note:'F2',dur:2.0,beat:4},
    {note:'C3',dur:2.0,beat:6.0},
    {note:'C5',dur:0.5,beat:8},
    {note:'E5',dur:0.5,beat:8.5},
    {note:'G5',dur:1,beat:9.0},
    {note:'E5',dur:0.5,beat:10.0},
    {note:'C5',dur:0.5,beat:10.5},
    {note:'G4',dur:1,beat:11.0},
    {note:'A4',dur:1,beat:12.0},
    {note:'B4',dur:0.5,beat:13.0},
    {note:'D5',dur:0.5,beat:13.5},
    {note:'G5',dur:1,beat:14.0},
    {note:'D5',dur:0.5,beat:15.0},
    {note:'B4',dur:0.5,beat:15.5},
    {note:'A4',dur:1,beat:16.0},
    {note:'G4',dur:1,beat:17.0},
    {note:'A4',dur:0.5,beat:18.0},
    {note:'C5',dur:0.5,beat:18.5},
    {note:'F5',dur:1,beat:19.0},
    {note:'C5',dur:0.5,beat:20.0},
    {note:'A4',dur:0.5,beat:20.5},
    {note:'G4',dur:1,beat:21.0},
    {note:'F4',dur:1,beat:22.0},
    {note:'G4',dur:0.5,beat:23.0},
    {note:'B4',dur:0.5,beat:23.5},
    {note:'E5',dur:1,beat:24.0},
    {note:'B4',dur:0.5,beat:25.0},
    {note:'G4',dur:0.5,beat:25.5},
    {note:'A4',dur:2,beat:26.0},
    {note:'C2',dur:2.0,beat:8},
    {note:'G2',dur:2.0,beat:10.0},
    {note:'G2',dur:2.0,beat:12},
    {note:'D3',dur:2.0,beat:14.0},
    {note:'F2',dur:2.0,beat:16},
    {note:'C3',dur:2.0,beat:18.0},
    {note:'C2',dur:2.0,beat:20},
    {note:'G2',dur:2.0,beat:22.0},
    {note:'F2',dur:2.0,beat:24},
    {note:'C3',dur:2.0,beat:26.0},
    {note:'C2',dur:2.0,beat:28},
    {note:'G2',dur:2.0,beat:30.0},
    {note:'D2',dur:2.0,beat:32},
    {note:'A2',dur:2.0,beat:34.0},
    {note:'G2',dur:2.0,beat:36},
    {note:'D3',dur:2.0,beat:38.0},
    {note:'G5',dur:1,beat:40},
    {note:'A5',dur:1,beat:41},
    {note:'G5',dur:2,beat:42},
    {note:'F5',dur:1,beat:44},
    {note:'E5',dur:1,beat:45},
    {note:'D5',dur:2,beat:46},
    {note:'G5',dur:1,beat:48},
    {note:'A5',dur:1,beat:49},
    {note:'B5',dur:2,beat:50},
    {note:'A5',dur:1,beat:52},
    {note:'G5',dur:1,beat:53},
    {note:'C5',dur:2,beat:54},
    {note:'C2',dur:2.0,beat:40},
    {note:'G2',dur:2.0,beat:42.0},
    {note:'F2',dur:2.0,beat:44},
    {note:'C3',dur:2.0,beat:46.0},
    {note:'G2',dur:2.0,beat:48},
    {note:'D3',dur:2.0,beat:50.0},
    {note:'C2',dur:2.0,beat:52},
    {note:'G2',dur:2.0,beat:54.0},
    {note:'C2',dur:2.0,beat:56},
    {note:'G2',dur:2.0,beat:58.0},
    {note:'F2',dur:2.0,beat:60},
    {note:'C3',dur:2.0,beat:62.0},
    {note:'G2',dur:2.0,beat:64},
    {note:'D3',dur:2.0,beat:66.0},
    {note:'C2',dur:2.0,beat:68},
    {note:'G2',dur:2.0,beat:70.0},
    {note:'C5',dur:1,beat:56},
    {note:'E5',dur:1,beat:57},
    {note:'G5',dur:2,beat:58},
    {note:'F5',dur:1,beat:60},
    {note:'E5',dur:1,beat:61},
    {note:'D5',dur:2,beat:62},
    {note:'C5',dur:1,beat:64},
    {note:'B4',dur:1,beat:65},
    {note:'A4',dur:2,beat:66},
    {note:'G4',dur:1,beat:68},
    {note:'A4',dur:1,beat:69},
    {note:'C5',dur:2,beat:70},
    {note:'E5',dur:1,beat:72},
    {note:'G5',dur:1,beat:73},
    {note:'C6',dur:2,beat:74},
    {note:'B5',dur:1,beat:76},
    {note:'A5',dur:1,beat:77},
    {note:'G5',dur:2,beat:78},
    {note:'F5',dur:1,beat:80},
    {note:'E5',dur:1,beat:81},
    {note:'D5',dur:1,beat:82},
    {note:'C5',dur:1,beat:83},
    {note:'C5',dur:4,beat:84},
    {note:'C2',dur:2.0,beat:56},
    {note:'G2',dur:2.0,beat:58.0},
    {note:'G2',dur:2.0,beat:60},
    {note:'D3',dur:2.0,beat:62.0},
    {note:'A2',dur:2.0,beat:64},
    {note:'E3',dur:2.0,beat:66.0},
    {note:'F2',dur:2.0,beat:68},
    {note:'C3',dur:2.0,beat:70.0},
    {note:'C2',dur:2.0,beat:72},
    {note:'G2',dur:2.0,beat:74.0},
    {note:'F2',dur:2.0,beat:76},
    {note:'C3',dur:2.0,beat:78.0},
    {note:'C2',dur:2.0,beat:80},
    {note:'G2',dur:2.0,beat:82.0},
    {note:'G2',dur:2.0,beat:84},
    {note:'D3',dur:2.0,beat:86.0},
    {note:'C5',dur:0.5,beat:88},
    {note:'E5',dur:0.5,beat:88.5},
    {note:'G5',dur:1,beat:89.0},
    {note:'E5',dur:0.5,beat:90.0},
    {note:'C5',dur:0.5,beat:90.5},
    {note:'G4',dur:1,beat:91.0},
    {note:'A4',dur:1,beat:92.0},
    {note:'B4',dur:0.5,beat:93.0},
    {note:'D5',dur:0.5,beat:93.5},
    {note:'G5',dur:1,beat:94.0},
    {note:'D5',dur:0.5,beat:95.0},
    {note:'B4',dur:0.5,beat:95.5},
    {note:'A4',dur:1,beat:96.0},
    {note:'G4',dur:1,beat:97.0},
    {note:'A4',dur:0.5,beat:98.0},
    {note:'C5',dur:0.5,beat:98.5},
    {note:'F5',dur:1,beat:99.0},
    {note:'C5',dur:0.5,beat:100.0},
    {note:'A4',dur:0.5,beat:100.5},
    {note:'G4',dur:1,beat:101.0},
    {note:'F4',dur:1,beat:102.0},
    {note:'G4',dur:0.5,beat:103.0},
    {note:'B4',dur:0.5,beat:103.5},
    {note:'E5',dur:1,beat:104.0},
    {note:'B4',dur:0.5,beat:105.0},
    {note:'G4',dur:0.5,beat:105.5},
    {note:'A4',dur:2,beat:106.0},
    {note:'C2',dur:2.0,beat:88},
    {note:'G2',dur:2.0,beat:90.0},
    {note:'G2',dur:2.0,beat:92},
    {note:'D3',dur:2.0,beat:94.0},
    {note:'F2',dur:2.0,beat:96},
    {note:'C3',dur:2.0,beat:98.0},
    {note:'C2',dur:2.0,beat:100},
    {note:'G2',dur:2.0,beat:102.0},
    {note:'F2',dur:2.0,beat:104},
    {note:'C3',dur:2.0,beat:106.0},
    {note:'C2',dur:2.0,beat:108},
    {note:'G2',dur:2.0,beat:110.0},
    {note:'D2',dur:2.0,beat:112},
    {note:'A2',dur:2.0,beat:114.0},
    {note:'G2',dur:2.0,beat:116},
    {note:'D3',dur:2.0,beat:118.0},
    {note:'C5',dur:1,beat:120},
    {note:'E5',dur:1,beat:121},
    {note:'G5',dur:2,beat:122},
    {note:'F5',dur:1,beat:124},
    {note:'E5',dur:1,beat:125},
    {note:'D5',dur:2,beat:126},
    {note:'C5',dur:1,beat:128},
    {note:'B4',dur:1,beat:129},
    {note:'A4',dur:2,beat:130},
    {note:'G4',dur:1,beat:132},
    {note:'A4',dur:1,beat:133},
    {note:'C5',dur:2,beat:134},
    {note:'E5',dur:1,beat:136},
    {note:'G5',dur:1,beat:137},
    {note:'C6',dur:2,beat:138},
    {note:'B5',dur:1,beat:140},
    {note:'A5',dur:1,beat:141},
    {note:'G5',dur:2,beat:142},
    {note:'F5',dur:1,beat:144},
    {note:'E5',dur:1,beat:145},
    {note:'D5',dur:1,beat:146},
    {note:'C5',dur:1,beat:147},
    {note:'C5',dur:4,beat:148},
    {note:'C2',dur:2.0,beat:120},
    {note:'G2',dur:2.0,beat:122.0},
    {note:'G2',dur:2.0,beat:124},
    {note:'D3',dur:2.0,beat:126.0},
    {note:'A2',dur:2.0,beat:128},
    {note:'E3',dur:2.0,beat:130.0},
    {note:'F2',dur:2.0,beat:132},
    {note:'C3',dur:2.0,beat:134.0},
    {note:'C2',dur:2.0,beat:136},
    {note:'G2',dur:2.0,beat:138.0},
    {note:'F2',dur:2.0,beat:140},
    {note:'C3',dur:2.0,beat:142.0},
    {note:'C2',dur:2.0,beat:144},
    {note:'G2',dur:2.0,beat:146.0},
    {note:'G2',dur:2.0,beat:148},
    {note:'D3',dur:2.0,beat:150.0},
    {note:'C5',dur:1,beat:152},
    {note:'E5',dur:1,beat:153},
    {note:'G5',dur:1,beat:154},
    {note:'C6',dur:1,beat:155},
    {note:'G5',dur:2,beat:156},
    {note:'C5',dur:2,beat:158},
    {note:'C2',dur:2.0,beat:152},
    {note:'G2',dur:2.0,beat:154.0},
    {note:'C2',dur:2.0,beat:156},
    {note:'G2',dur:2.0,beat:158.0}
  ]},
  { category:'Pop / Singer-Songwriter', keys:['your song','elton your song','elton john your song'], title:'Your Song · Elton John', tempo:76, notes:[
    {note:'D5',dur:2,beat:0},
    {note:'F#5',dur:2,beat:2},
    {note:'A5',dur:2,beat:4},
    {note:'D6',dur:2,beat:6},
    {note:'D2',dur:2.0,beat:0},
    {note:'A2',dur:2.0,beat:2.0},
    {note:'A2',dur:2.0,beat:4},
    {note:'E3',dur:2.0,beat:6.0},
    {note:'A4',dur:0.5,beat:8},
    {note:'B4',dur:0.5,beat:8.5},
    {note:'D5',dur:1,beat:9.0},
    {note:'B4',dur:1,beat:10.0},
    {note:'A4',dur:1,beat:11.0},
    {note:'D5',dur:1,beat:12.0},
    {note:'E5',dur:1,beat:13.0},
    {note:'F#5',dur:2,beat:14.0},
    {note:'E5',dur:1,beat:16.0},
    {note:'D5',dur:1,beat:17.0},
    {note:'B4',dur:2,beat:18.0},
    {note:'A4',dur:1,beat:20.0},
    {note:'G4',dur:1,beat:21.0},
    {note:'F#4',dur:2,beat:22.0},
    {note:'A4',dur:0.5,beat:24.0},
    {note:'B4',dur:0.5,beat:24.5},
    {note:'D5',dur:1,beat:25.0},
    {note:'F#5',dur:1,beat:26.0},
    {note:'A5',dur:1,beat:27.0},
    {note:'G5',dur:1,beat:28.0},
    {note:'F#5',dur:1,beat:29.0},
    {note:'E5',dur:2,beat:30.0},
    {note:'D5',dur:1,beat:32.0},
    {note:'B4',dur:1,beat:33.0},
    {note:'A4',dur:2,beat:34.0},
    {note:'D5',dur:4,beat:36.0},
    {note:'D2',dur:2.0,beat:8},
    {note:'A2',dur:2.0,beat:10.0},
    {note:'A2',dur:2.0,beat:12},
    {note:'E3',dur:2.0,beat:14.0},
    {note:'B2',dur:2.0,beat:16},
    {note:'F#3',dur:2.0,beat:18.0},
    {note:'D2',dur:2.0,beat:20},
    {note:'A2',dur:2.0,beat:22.0},
    {note:'G2',dur:2.0,beat:24},
    {note:'D3',dur:2.0,beat:26.0},
    {note:'D2',dur:2.0,beat:28},
    {note:'A2',dur:2.0,beat:30.0},
    {note:'A2',dur:2.0,beat:32},
    {note:'E3',dur:2.0,beat:34.0},
    {note:'D2',dur:2.0,beat:36},
    {note:'A2',dur:2.0,beat:38.0},
    {note:'F#5',dur:1,beat:40},
    {note:'A5',dur:1,beat:41},
    {note:'G5',dur:2,beat:42},
    {note:'F#5',dur:1,beat:44},
    {note:'E5',dur:1,beat:45},
    {note:'D5',dur:2,beat:46},
    {note:'B4',dur:1,beat:48},
    {note:'A4',dur:1,beat:49},
    {note:'F#4',dur:2,beat:50},
    {note:'D4',dur:2,beat:52},
    {note:'A4',dur:2,beat:54},
    {note:'F#5',dur:1,beat:56},
    {note:'G5',dur:1,beat:57},
    {note:'A5',dur:2,beat:58},
    {note:'G5',dur:1,beat:60},
    {note:'F#5',dur:1,beat:61},
    {note:'E5',dur:2,beat:62},
    {note:'D5',dur:1,beat:64},
    {note:'E5',dur:1,beat:65},
    {note:'D5',dur:1,beat:66},
    {note:'B4',dur:1,beat:67},
    {note:'D5',dur:4,beat:68},
    {note:'D2',dur:2.0,beat:40},
    {note:'A2',dur:2.0,beat:42.0},
    {note:'A2',dur:2.0,beat:44},
    {note:'E3',dur:2.0,beat:46.0},
    {note:'B2',dur:2.0,beat:48},
    {note:'F#3',dur:2.0,beat:50.0},
    {note:'D2',dur:2.0,beat:52},
    {note:'A2',dur:2.0,beat:54.0},
    {note:'G2',dur:2.0,beat:56},
    {note:'D3',dur:2.0,beat:58.0},
    {note:'D2',dur:2.0,beat:60},
    {note:'A2',dur:2.0,beat:62.0},
    {note:'A2',dur:2.0,beat:64},
    {note:'E3',dur:2.0,beat:66.0},
    {note:'D2',dur:2.0,beat:68},
    {note:'A2',dur:2.0,beat:70.0},
    {note:'A5',dur:0.5,beat:72},
    {note:'B5',dur:0.5,beat:72.5},
    {note:'D6',dur:1,beat:73.0},
    {note:'B5',dur:1,beat:74.0},
    {note:'A5',dur:1,beat:75.0},
    {note:'D6',dur:1,beat:76.0},
    {note:'E6',dur:1,beat:77.0},
    {note:'F#6',dur:2,beat:78.0},
    {note:'E6',dur:1,beat:80.0},
    {note:'D6',dur:1,beat:81.0},
    {note:'B5',dur:2,beat:82.0},
    {note:'A5',dur:1,beat:84.0},
    {note:'G5',dur:1,beat:85.0},
    {note:'F#5',dur:2,beat:86.0},
    {note:'A5',dur:0.5,beat:88.0},
    {note:'B5',dur:0.5,beat:88.5},
    {note:'D6',dur:1,beat:89.0},
    {note:'F#5',dur:1,beat:90.0},
    {note:'A5',dur:1,beat:91.0},
    {note:'G5',dur:1,beat:92.0},
    {note:'F#5',dur:1,beat:93.0},
    {note:'E5',dur:2,beat:94.0},
    {note:'D5',dur:1,beat:96.0},
    {note:'B4',dur:1,beat:97.0},
    {note:'A4',dur:2,beat:98.0},
    {note:'D5',dur:4,beat:100.0},
    {note:'D2',dur:2.0,beat:72},
    {note:'A2',dur:2.0,beat:74.0},
    {note:'A2',dur:2.0,beat:76},
    {note:'E3',dur:2.0,beat:78.0},
    {note:'B2',dur:2.0,beat:80},
    {note:'F#3',dur:2.0,beat:82.0},
    {note:'D2',dur:2.0,beat:84},
    {note:'A2',dur:2.0,beat:86.0},
    {note:'G2',dur:2.0,beat:88},
    {note:'D3',dur:2.0,beat:90.0},
    {note:'D2',dur:2.0,beat:92},
    {note:'A2',dur:2.0,beat:94.0},
    {note:'A2',dur:2.0,beat:96},
    {note:'E3',dur:2.0,beat:98.0},
    {note:'D2',dur:2.0,beat:100},
    {note:'A2',dur:2.0,beat:102.0},
    {note:'F#5',dur:1,beat:104},
    {note:'A5',dur:1,beat:105},
    {note:'G5',dur:2,beat:106},
    {note:'F#5',dur:1,beat:108},
    {note:'E5',dur:1,beat:109},
    {note:'D5',dur:2,beat:110},
    {note:'B4',dur:1,beat:112},
    {note:'A4',dur:1,beat:113},
    {note:'F#4',dur:2,beat:114},
    {note:'D4',dur:2,beat:116},
    {note:'A4',dur:2,beat:118},
    {note:'F#5',dur:1,beat:120},
    {note:'G5',dur:1,beat:121},
    {note:'A5',dur:2,beat:122},
    {note:'G5',dur:1,beat:124},
    {note:'F#5',dur:1,beat:125},
    {note:'E5',dur:2,beat:126},
    {note:'D5',dur:1,beat:128},
    {note:'E5',dur:1,beat:129},
    {note:'D5',dur:1,beat:130},
    {note:'B4',dur:1,beat:131},
    {note:'D5',dur:4,beat:132},
    {note:'D2',dur:2.0,beat:104},
    {note:'A2',dur:2.0,beat:106.0},
    {note:'A2',dur:2.0,beat:108},
    {note:'E3',dur:2.0,beat:110.0},
    {note:'B2',dur:2.0,beat:112},
    {note:'F#3',dur:2.0,beat:114.0},
    {note:'D2',dur:2.0,beat:116},
    {note:'A2',dur:2.0,beat:118.0},
    {note:'G2',dur:2.0,beat:120},
    {note:'D3',dur:2.0,beat:122.0},
    {note:'D2',dur:2.0,beat:124},
    {note:'A2',dur:2.0,beat:126.0},
    {note:'A2',dur:2.0,beat:128},
    {note:'E3',dur:2.0,beat:130.0},
    {note:'D2',dur:2.0,beat:132},
    {note:'A2',dur:2.0,beat:134.0},
    {note:'D5',dur:1,beat:136},
    {note:'F#5',dur:1,beat:137},
    {note:'A5',dur:1,beat:138},
    {note:'D6',dur:1,beat:139},
    {note:'A5',dur:2,beat:140},
    {note:'D5',dur:2,beat:142},
    {note:'D2',dur:2.0,beat:136},
    {note:'A2',dur:2.0,beat:138.0},
    {note:'D2',dur:2.0,beat:140},
    {note:'A2',dur:2.0,beat:142.0}
  ]},
  { category:'Anime / Game', keys:['merry go round','merry-go-round','howls moving castle','howl moving','hisaishi merry','merry go round life'], title:'Merry-Go-Round of Life · Hisaishi', tempo:72, notes:[
    {note:'Eb2',dur:1,beat:0},
    {note:'Bb3',dur:1,beat:1},
    {note:'G4',dur:1,beat:2},
    {note:'Eb2',dur:1,beat:3},
    {note:'Bb3',dur:1,beat:4},
    {note:'G4',dur:1,beat:5},
    {note:'Bb4',dur:3,beat:6},
    {note:'G5',dur:1,beat:9},
    {note:'F5',dur:1,beat:10},
    {note:'Eb5',dur:1,beat:11},
    {note:'D5',dur:3,beat:12},
    {note:'F5',dur:1,beat:15},
    {note:'Eb5',dur:1,beat:16},
    {note:'D5',dur:1,beat:17},
    {note:'C5',dur:3,beat:18},
    {note:'Eb5',dur:1,beat:21},
    {note:'D5',dur:1,beat:22},
    {note:'C5',dur:1,beat:23},
    {note:'Bb4',dur:2,beat:24},
    {note:'Ab4',dur:1,beat:26},
    {note:'G4',dur:1,beat:27},
    {note:'F4',dur:2,beat:28},
    {note:'Bb4',dur:3,beat:30},
    {note:'Eb5',dur:1,beat:33},
    {note:'D5',dur:1,beat:34},
    {note:'C5',dur:1,beat:35},
    {note:'Bb4',dur:2,beat:36},
    {note:'G4',dur:1,beat:38},
    {note:'Bb4',dur:3,beat:39},
    {note:'C5',dur:1,beat:42},
    {note:'D5',dur:1,beat:43},
    {note:'Eb5',dur:1,beat:44},
    {note:'F5',dur:2,beat:45},
    {note:'G5',dur:1,beat:47},
    {note:'F5',dur:1,beat:48},
    {note:'Eb5',dur:1,beat:49},
    {note:'D5',dur:1,beat:50},
    {note:'C5',dur:2,beat:51},
    {note:'Bb4',dur:1,beat:53},
    {note:'Bb4',dur:6,beat:54},
    {note:'G5',dur:3,beat:60},
    {note:'F5',dur:1,beat:63},
    {note:'Eb5',dur:1,beat:64},
    {note:'D5',dur:1,beat:65},
    {note:'C5',dur:3,beat:66},
    {note:'Bb4',dur:1,beat:69},
    {note:'Ab4',dur:1,beat:70},
    {note:'G4',dur:1,beat:71},
    {note:'Ab4',dur:3,beat:72},
    {note:'C5',dur:1,beat:75},
    {note:'Bb4',dur:1,beat:76},
    {note:'Ab4',dur:1,beat:77},
    {note:'G4',dur:2,beat:78},
    {note:'F4',dur:1,beat:80},
    {note:'Eb4',dur:3,beat:81},
    {note:'Bb5',dur:3,beat:84},
    {note:'Ab5',dur:1,beat:87},
    {note:'G5',dur:1,beat:88},
    {note:'F5',dur:1,beat:89},
    {note:'Eb5',dur:2,beat:90},
    {note:'D5',dur:1,beat:92},
    {note:'Eb5',dur:3,beat:93},
    {note:'Bb4',dur:3,beat:78},
    {note:'G5',dur:1,beat:81},
    {note:'F5',dur:1,beat:82},
    {note:'Eb5',dur:1,beat:83},
    {note:'D5',dur:3,beat:84},
    {note:'F5',dur:1,beat:87},
    {note:'Eb5',dur:1,beat:88},
    {note:'D5',dur:1,beat:89},
    {note:'C5',dur:3,beat:90},
    {note:'Eb5',dur:1,beat:93},
    {note:'D5',dur:1,beat:94},
    {note:'C5',dur:1,beat:95},
    {note:'Bb4',dur:2,beat:96},
    {note:'Ab4',dur:1,beat:98},
    {note:'G4',dur:1,beat:99},
    {note:'F4',dur:2,beat:100},
    {note:'Bb4',dur:3,beat:102},
    {note:'Eb5',dur:1,beat:105},
    {note:'D5',dur:1,beat:106},
    {note:'C5',dur:1,beat:107},
    {note:'Bb4',dur:2,beat:108},
    {note:'G4',dur:1,beat:110},
    {note:'Bb4',dur:3,beat:111},
    {note:'C5',dur:1,beat:114},
    {note:'D5',dur:1,beat:115},
    {note:'Eb5',dur:1,beat:116},
    {note:'F5',dur:2,beat:117},
    {note:'G5',dur:1,beat:119},
    {note:'F5',dur:1,beat:120},
    {note:'Eb5',dur:1,beat:121},
    {note:'D5',dur:1,beat:122},
    {note:'C5',dur:2,beat:123},
    {note:'Bb4',dur:1,beat:125},
    {note:'Bb4',dur:6,beat:126},
    {note:'Eb5',dur:3,beat:132},
    {note:'Bb4',dur:3,beat:135},
    {note:'G4',dur:3,beat:138},
    {note:'Eb4',dur:3,beat:141},
    {note:'Eb2',dur:1,beat:6},
    {note:'Eb3',dur:2,beat:7},
    {note:'Bb2',dur:1,beat:9},
    {note:'Bb3',dur:2,beat:10},
    {note:'C2',dur:1,beat:12},
    {note:'C3',dur:2,beat:13},
    {note:'Ab2',dur:1,beat:15},
    {note:'Ab3',dur:2,beat:16},
    {note:'Eb2',dur:1,beat:18},
    {note:'Eb3',dur:2,beat:19},
    {note:'F2',dur:1,beat:21},
    {note:'F3',dur:2,beat:22},
    {note:'Bb2',dur:1,beat:24},
    {note:'Bb3',dur:2,beat:25},
    {note:'Eb2',dur:1,beat:27},
    {note:'Eb3',dur:2,beat:28},
    {note:'Ab2',dur:1,beat:30},
    {note:'Ab3',dur:2,beat:31},
    {note:'Bb2',dur:1,beat:33},
    {note:'Bb3',dur:2,beat:34},
    {note:'Eb2',dur:1,beat:36},
    {note:'Eb3',dur:2,beat:37},
    {note:'Eb2',dur:1,beat:39},
    {note:'Eb3',dur:2,beat:40},
    {note:'C2',dur:1,beat:42},
    {note:'C3',dur:2,beat:43},
    {note:'Ab2',dur:1,beat:45},
    {note:'Ab3',dur:2,beat:46},
    {note:'Eb2',dur:1,beat:48},
    {note:'Eb3',dur:2,beat:49},
    {note:'Bb2',dur:1,beat:51},
    {note:'Bb3',dur:2,beat:52},
    {note:'C2',dur:1,beat:54},
    {note:'C3',dur:2,beat:55},
    {note:'Eb2',dur:1,beat:57},
    {note:'Eb3',dur:2,beat:58},
    {note:'Eb2',dur:1,beat:60},
    {note:'Eb3',dur:2,beat:61},
    {note:'Ab2',dur:1,beat:63},
    {note:'Ab3',dur:2,beat:64},
    {note:'Bb2',dur:1,beat:66},
    {note:'Bb3',dur:2,beat:67},
    {note:'Eb2',dur:1,beat:69},
    {note:'Eb3',dur:2,beat:70},
    {note:'Eb2',dur:1,beat:72},
    {note:'Eb3',dur:2,beat:73},
    {note:'Bb2',dur:1,beat:75},
    {note:'Bb3',dur:2,beat:76},
    {note:'C2',dur:1,beat:78},
    {note:'C3',dur:2,beat:79},
    {note:'Ab2',dur:1,beat:81},
    {note:'Ab3',dur:2,beat:82},
    {note:'Eb2',dur:1,beat:84},
    {note:'Eb3',dur:2,beat:85},
    {note:'F2',dur:1,beat:87},
    {note:'F3',dur:2,beat:88},
    {note:'Bb2',dur:1,beat:90},
    {note:'Bb3',dur:2,beat:91},
    {note:'Eb2',dur:1,beat:93},
    {note:'Eb3',dur:2,beat:94},
    {note:'Ab2',dur:1,beat:96},
    {note:'Ab3',dur:2,beat:97},
    {note:'Bb2',dur:1,beat:99},
    {note:'Bb3',dur:2,beat:100},
    {note:'Eb2',dur:1,beat:102},
    {note:'Eb3',dur:2,beat:103},
    {note:'Eb2',dur:1,beat:105},
    {note:'Eb3',dur:2,beat:106},
    {note:'Eb2',dur:1,beat:108},
    {note:'Eb3',dur:2,beat:109},
    {note:'Bb2',dur:1,beat:111},
    {note:'Bb3',dur:2,beat:112},
    {note:'G2',dur:1,beat:114},
    {note:'G3',dur:2,beat:115},
    {note:'Eb2',dur:1,beat:117},
    {note:'Eb3',dur:2,beat:118}
  ]},
  { category:'Anime / Game', keys:['one summers day','one summer day','spirited away','hisaishi summer','one summer'], title:"One Summer's Day · Hisaishi", tempo:70, notes:[
    {note:'F5',dur:2,beat:0},
    {note:'A5',dur:2,beat:2},
    {note:'C6',dur:2,beat:4},
    {note:'F6',dur:2,beat:6},
    {note:'F2',dur:4,beat:0},
    {note:'A2',dur:4,beat:4},
    {note:'F5',dur:2,beat:8},
    {note:'E5',dur:1,beat:10},
    {note:'D5',dur:1,beat:11},
    {note:'C5',dur:2,beat:12},
    {note:'A4',dur:2,beat:14},
    {note:'Bb4',dur:1,beat:16},
    {note:'A4',dur:1,beat:17},
    {note:'G4',dur:2,beat:18},
    {note:'F4',dur:2,beat:20},
    {note:'F5',dur:2,beat:22},
    {note:'E5',dur:1,beat:24},
    {note:'D5',dur:1,beat:25},
    {note:'C5',dur:2,beat:26},
    {note:'D5',dur:2,beat:28},
    {note:'E5',dur:2,beat:30},
    {note:'F5',dur:2,beat:32},
    {note:'A5',dur:2,beat:34},
    {note:'F5',dur:1,beat:36},
    {note:'D5',dur:1,beat:37},
    {note:'C5',dur:2,beat:38},
    {note:'A4',dur:1,beat:40},
    {note:'G4',dur:1,beat:41},
    {note:'F4',dur:4,beat:42},
    {note:'F2',dur:4,beat:8},
    {note:'A2',dur:4,beat:12},
    {note:'D2',dur:4,beat:16},
    {note:'Bb2',dur:4,beat:20},
    {note:'F2',dur:4,beat:24},
    {note:'A2',dur:4,beat:28},
    {note:'D2',dur:4,beat:32},
    {note:'Bb2',dur:4,beat:36},
    {note:'A5',dur:1,beat:40},
    {note:'G5',dur:1,beat:41},
    {note:'F5',dur:2,beat:42},
    {note:'E5',dur:1,beat:44},
    {note:'D5',dur:1,beat:45},
    {note:'C5',dur:2,beat:46},
    {note:'Bb4',dur:1,beat:48},
    {note:'A4',dur:1,beat:49},
    {note:'G4',dur:2,beat:50},
    {note:'F4',dur:4,beat:52},
    {note:'C6',dur:2,beat:56},
    {note:'A5',dur:1,beat:58},
    {note:'F5',dur:1,beat:59},
    {note:'G5',dur:2,beat:60},
    {note:'E5',dur:2,beat:62},
    {note:'D5',dur:1,beat:64},
    {note:'C5',dur:1,beat:65},
    {note:'Bb4',dur:2,beat:66},
    {note:'A4',dur:2,beat:68},
    {note:'G4',dur:1,beat:70},
    {note:'A4',dur:1,beat:71},
    {note:'F4',dur:2,beat:72},
    {note:'F4',dur:4,beat:74},
    {note:'F2',dur:4,beat:40},
    {note:'A2',dur:4,beat:44},
    {note:'D2',dur:4,beat:48},
    {note:'Bb2',dur:4,beat:52},
    {note:'F2',dur:4,beat:56},
    {note:'A2',dur:4,beat:60},
    {note:'D2',dur:4,beat:64},
    {note:'Bb2',dur:4,beat:68},
    {note:'F6',dur:2,beat:72},
    {note:'E6',dur:1,beat:74},
    {note:'D6',dur:1,beat:75},
    {note:'C6',dur:2,beat:76},
    {note:'A5',dur:2,beat:78},
    {note:'Bb5',dur:1,beat:80},
    {note:'A5',dur:1,beat:81},
    {note:'G5',dur:2,beat:82},
    {note:'F5',dur:2,beat:84},
    {note:'F6',dur:2,beat:86},
    {note:'E6',dur:1,beat:88},
    {note:'D6',dur:1,beat:89},
    {note:'C6',dur:2,beat:90},
    {note:'D6',dur:2,beat:92},
    {note:'E6',dur:2,beat:94},
    {note:'F6',dur:2,beat:96},
    {note:'A6',dur:2,beat:98},
    {note:'F6',dur:1,beat:100},
    {note:'D6',dur:1,beat:101},
    {note:'C6',dur:2,beat:102},
    {note:'A5',dur:1,beat:104},
    {note:'G5',dur:1,beat:105},
    {note:'F5',dur:4,beat:106},
    {note:'F2',dur:4,beat:72},
    {note:'A2',dur:4,beat:76},
    {note:'D2',dur:4,beat:80},
    {note:'Bb2',dur:4,beat:84},
    {note:'F2',dur:4,beat:88},
    {note:'A2',dur:4,beat:92},
    {note:'D2',dur:4,beat:96},
    {note:'Bb2',dur:4,beat:100},
    {note:'F5',dur:2,beat:104},
    {note:'A5',dur:2,beat:106},
    {note:'C6',dur:4,beat:108},
    {note:'F2',dur:4,beat:104},
    {note:'F2',dur:4,beat:108}
  ]},
  { category:'Anime / Game', keys:['to zanarkand','zanarkand','final fantasy x','ffx zanarkand','uematsu zanarkand'], title:'To Zanarkand · Uematsu (FFX)', tempo:70, notes:[
    {note:'A3',dur:0.5,beat:0},
    {note:'E4',dur:0.5,beat:0.5},
    {note:'A4',dur:0.5,beat:1.0},
    {note:'E4',dur:0.5,beat:1.5},
    {note:'A3',dur:0.5,beat:2.0},
    {note:'E4',dur:0.5,beat:2.5},
    {note:'A4',dur:0.5,beat:3.0},
    {note:'E4',dur:0.5,beat:3.5},
    {note:'A3',dur:0.5,beat:4.0},
    {note:'E4',dur:0.5,beat:4.5},
    {note:'A4',dur:0.5,beat:5.0},
    {note:'E4',dur:0.5,beat:5.5},
    {note:'A3',dur:0.5,beat:6.0},
    {note:'E4',dur:0.5,beat:6.5},
    {note:'A4',dur:0.5,beat:7.0},
    {note:'E4',dur:0.5,beat:7.5},
    {note:'A3',dur:0.5,beat:8.0},
    {note:'E4',dur:0.5,beat:8.5},
    {note:'A4',dur:0.5,beat:9.0},
    {note:'E4',dur:0.5,beat:9.5},
    {note:'A3',dur:0.5,beat:10.0},
    {note:'E4',dur:0.5,beat:10.5},
    {note:'A4',dur:0.5,beat:11.0},
    {note:'E4',dur:0.5,beat:11.5},
    {note:'A3',dur:0.5,beat:12.0},
    {note:'E4',dur:0.5,beat:12.5},
    {note:'A4',dur:0.5,beat:13.0},
    {note:'E4',dur:0.5,beat:13.5},
    {note:'A3',dur:0.5,beat:14.0},
    {note:'E4',dur:0.5,beat:14.5},
    {note:'A4',dur:0.5,beat:15.0},
    {note:'E4',dur:0.5,beat:15.5},
    {note:'A5',dur:1,beat:16},
    {note:'G5',dur:1,beat:17},
    {note:'F5',dur:1,beat:18},
    {note:'E5',dur:1,beat:19},
    {note:'D5',dur:2,beat:20},
    {note:'C5',dur:1,beat:22},
    {note:'B4',dur:1,beat:23},
    {note:'A5',dur:1,beat:24},
    {note:'G5',dur:1,beat:25},
    {note:'F5',dur:1,beat:26},
    {note:'E5',dur:1,beat:27},
    {note:'D5',dur:1,beat:28},
    {note:'C5',dur:1,beat:29},
    {note:'A4',dur:2,beat:30},
    {note:'E5',dur:1,beat:32},
    {note:'F5',dur:1,beat:33},
    {note:'G5',dur:1,beat:34},
    {note:'A5',dur:1,beat:35},
    {note:'B5',dur:2,beat:36},
    {note:'A5',dur:2,beat:38},
    {note:'G5',dur:1,beat:40},
    {note:'F5',dur:1,beat:41},
    {note:'E5',dur:1,beat:42},
    {note:'D5',dur:1,beat:43},
    {note:'C5',dur:1,beat:44},
    {note:'B4',dur:1,beat:45},
    {note:'A4',dur:2,beat:46},
    {note:'A5',dur:1,beat:48},
    {note:'B5',dur:1,beat:49},
    {note:'C6',dur:1,beat:50},
    {note:'A5',dur:1,beat:51},
    {note:'G5',dur:2,beat:52},
    {note:'F5',dur:2,beat:54},
    {note:'E5',dur:1,beat:56},
    {note:'D5',dur:1,beat:57},
    {note:'C5',dur:1,beat:58},
    {note:'B4',dur:1,beat:59},
    {note:'A4',dur:2,beat:60},
    {note:'E5',dur:2,beat:62},
    {note:'A5',dur:1,beat:64},
    {note:'G5',dur:1,beat:65},
    {note:'F5',dur:1,beat:66},
    {note:'E5',dur:1,beat:67},
    {note:'D5',dur:1,beat:68},
    {note:'C5',dur:1,beat:69},
    {note:'B4',dur:1,beat:70},
    {note:'A4',dur:1,beat:71},
    {note:'A5',dur:2,beat:72},
    {note:'E5',dur:2,beat:74},
    {note:'A5',dur:1,beat:76},
    {note:'G5',dur:1,beat:77},
    {note:'F5',dur:1,beat:78},
    {note:'E5',dur:1,beat:79},
    {note:'D5',dur:2,beat:80},
    {note:'C5',dur:1,beat:82},
    {note:'B4',dur:1,beat:83},
    {note:'A5',dur:1,beat:84},
    {note:'G5',dur:1,beat:85},
    {note:'F5',dur:1,beat:86},
    {note:'E5',dur:1,beat:87},
    {note:'D5',dur:1,beat:88},
    {note:'C5',dur:1,beat:89},
    {note:'A4',dur:2,beat:90},
    {note:'E5',dur:1,beat:92},
    {note:'F5',dur:1,beat:93},
    {note:'G5',dur:1,beat:94},
    {note:'A5',dur:1,beat:95},
    {note:'B5',dur:2,beat:96},
    {note:'A5',dur:2,beat:98},
    {note:'G5',dur:1,beat:100},
    {note:'F5',dur:1,beat:101},
    {note:'E5',dur:1,beat:102},
    {note:'D5',dur:1,beat:103},
    {note:'C5',dur:1,beat:104},
    {note:'B4',dur:1,beat:105},
    {note:'A4',dur:2,beat:106},
    {note:'A6',dur:1,beat:108},
    {note:'G6',dur:1,beat:109},
    {note:'F6',dur:1,beat:110},
    {note:'E6',dur:1,beat:111},
    {note:'D6',dur:2,beat:112},
    {note:'C6',dur:1,beat:114},
    {note:'B5',dur:1,beat:115},
    {note:'A6',dur:2,beat:116},
    {note:'E6',dur:2,beat:118},
    {note:'A5',dur:4,beat:120},
    {note:'E5',dur:1,beat:120},
    {note:'D5',dur:1,beat:121},
    {note:'C5',dur:1,beat:122},
    {note:'B4',dur:1,beat:123},
    {note:'A4',dur:4,beat:124},
    {note:'A2',dur:4,beat:16},
    {note:'F2',dur:4,beat:20},
    {note:'C2',dur:4,beat:24},
    {note:'G2',dur:4,beat:28},
    {note:'A2',dur:4,beat:32},
    {note:'F2',dur:4,beat:36},
    {note:'C2',dur:4,beat:40},
    {note:'G2',dur:4,beat:44},
    {note:'A2',dur:4,beat:48},
    {note:'F2',dur:4,beat:52},
    {note:'C2',dur:4,beat:56},
    {note:'G2',dur:4,beat:60},
    {note:'A2',dur:4,beat:64},
    {note:'F2',dur:4,beat:68},
    {note:'C2',dur:4,beat:72},
    {note:'G2',dur:4,beat:76}
  ]},
  { category:'Modern / Film', keys:['mariage damour','mariage d amour','mariage','clayderman','spring waltz mariage'], title:"Mariage d'Amour · Clayderman", tempo:72, notes:[
    {note:'F5',dur:2,beat:0},
    {note:'A5',dur:2,beat:2},
    {note:'C6',dur:2,beat:4},
    {note:'F6',dur:2,beat:6},
    {note:'F2',dur:2.0,beat:0},
    {note:'C3',dur:2.0,beat:2.0},
    {note:'C2',dur:2.0,beat:4},
    {note:'G2',dur:2.0,beat:6.0},
    {note:'A4',dur:1,beat:8},
    {note:'C5',dur:1,beat:9},
    {note:'F5',dur:2,beat:10},
    {note:'E5',dur:1,beat:12},
    {note:'D5',dur:1,beat:13},
    {note:'C5',dur:2,beat:14},
    {note:'Bb4',dur:1,beat:16},
    {note:'A4',dur:1,beat:17},
    {note:'G4',dur:2,beat:18},
    {note:'F4',dur:2,beat:20},
    {note:'A4',dur:2,beat:22},
    {note:'A4',dur:1,beat:24},
    {note:'C5',dur:1,beat:25},
    {note:'F5',dur:2,beat:26},
    {note:'G5',dur:1,beat:28},
    {note:'F5',dur:1,beat:29},
    {note:'E5',dur:2,beat:30},
    {note:'D5',dur:1,beat:32},
    {note:'C5',dur:1,beat:33},
    {note:'Bb4',dur:2,beat:34},
    {note:'A4',dur:4,beat:36},
    {note:'F2',dur:2.0,beat:8},
    {note:'C3',dur:2.0,beat:10.0},
    {note:'C2',dur:2.0,beat:12},
    {note:'G2',dur:2.0,beat:14.0},
    {note:'Bb2',dur:2.0,beat:16},
    {note:'F3',dur:2.0,beat:18.0},
    {note:'F2',dur:2.0,beat:20},
    {note:'C3',dur:2.0,beat:22.0},
    {note:'D2',dur:2.0,beat:24},
    {note:'A2',dur:2.0,beat:26.0},
    {note:'Bb2',dur:2.0,beat:28},
    {note:'F3',dur:2.0,beat:30.0},
    {note:'C2',dur:2.0,beat:32},
    {note:'G2',dur:2.0,beat:34.0},
    {note:'F2',dur:2.0,beat:36},
    {note:'C3',dur:2.0,beat:38.0},
    {note:'F5',dur:1,beat:40},
    {note:'E5',dur:1,beat:41},
    {note:'D5',dur:2,beat:42},
    {note:'C5',dur:1,beat:44},
    {note:'Bb4',dur:1,beat:45},
    {note:'A4',dur:2,beat:46},
    {note:'Bb4',dur:1,beat:48},
    {note:'A4',dur:1,beat:49},
    {note:'G4',dur:2,beat:50},
    {note:'F4',dur:4,beat:52},
    {note:'A5',dur:1,beat:56},
    {note:'G5',dur:1,beat:57},
    {note:'F5',dur:2,beat:58},
    {note:'E5',dur:1,beat:60},
    {note:'D5',dur:1,beat:61},
    {note:'C5',dur:2,beat:62},
    {note:'Bb4',dur:1,beat:64},
    {note:'C5',dur:1,beat:65},
    {note:'D5',dur:1,beat:66},
    {note:'Bb4',dur:1,beat:67},
    {note:'A4',dur:4,beat:68},
    {note:'F2',dur:2.0,beat:40},
    {note:'C3',dur:2.0,beat:42.0},
    {note:'Bb2',dur:2.0,beat:44},
    {note:'F3',dur:2.0,beat:46.0},
    {note:'C2',dur:2.0,beat:48},
    {note:'G2',dur:2.0,beat:50.0},
    {note:'F2',dur:2.0,beat:52},
    {note:'C3',dur:2.0,beat:54.0},
    {note:'F2',dur:2.0,beat:56},
    {note:'C3',dur:2.0,beat:58.0},
    {note:'Bb2',dur:2.0,beat:60},
    {note:'F3',dur:2.0,beat:62.0},
    {note:'C2',dur:2.0,beat:64},
    {note:'G2',dur:2.0,beat:66.0},
    {note:'F2',dur:2.0,beat:68},
    {note:'C3',dur:2.0,beat:70.0},
    {note:'A5',dur:1,beat:72},
    {note:'C6',dur:1,beat:73},
    {note:'F6',dur:2,beat:74},
    {note:'E6',dur:1,beat:76},
    {note:'D6',dur:1,beat:77},
    {note:'C6',dur:2,beat:78},
    {note:'Bb5',dur:1,beat:80},
    {note:'A5',dur:1,beat:81},
    {note:'G5',dur:2,beat:82},
    {note:'F5',dur:2,beat:84},
    {note:'A5',dur:2,beat:86},
    {note:'C6',dur:1,beat:88},
    {note:'Bb5',dur:1,beat:89},
    {note:'A5',dur:2,beat:90},
    {note:'G5',dur:1,beat:92},
    {note:'F5',dur:1,beat:93},
    {note:'C5',dur:2,beat:94},
    {note:'F5',dur:4,beat:96},
    {note:'F2',dur:2.0,beat:72},
    {note:'C3',dur:2.0,beat:74.0},
    {note:'C2',dur:2.0,beat:76},
    {note:'G2',dur:2.0,beat:78.0},
    {note:'Bb2',dur:2.0,beat:80},
    {note:'F3',dur:2.0,beat:82.0},
    {note:'F2',dur:2.0,beat:84},
    {note:'C3',dur:2.0,beat:86.0},
    {note:'D2',dur:2.0,beat:88},
    {note:'A2',dur:2.0,beat:90.0},
    {note:'Bb2',dur:2.0,beat:92},
    {note:'F3',dur:2.0,beat:94.0},
    {note:'F2',dur:2.0,beat:96},
    {note:'C3',dur:2.0,beat:98.0},
    {note:'A4',dur:1,beat:100},
    {note:'F4',dur:1,beat:101},
    {note:'A4',dur:1,beat:102},
    {note:'C5',dur:1,beat:103},
    {note:'F5',dur:4,beat:104},
    {note:'F2',dur:2.0,beat:100},
    {note:'C3',dur:2.0,beat:102.0},
    {note:'F2',dur:2.0,beat:104},
    {note:'C3',dur:2.0,beat:106.0}
  ]},
  { category:'Classical', keys:['greensleeves','what child is this','green sleeves'], title:'Greensleeves · Traditional', tempo:80, notes:[
    {note:'A4',dur:3,beat:0},
    {note:'E5',dur:3,beat:3},
    {note:'A5',dur:3,beat:6},
    {note:'E5',dur:3,beat:9},
    {note:'A2',dur:6.0,beat:0.0},
    {note:'E2',dur:6.0,beat:6.0},
    {note:'A4',dur:1.5,beat:12},
    {note:'C5',dur:0.5,beat:13.5},
    {note:'D5',dur:1,beat:14.0},
    {note:'E5',dur:1.5,beat:15.0},
    {note:'F5',dur:0.5,beat:16.5},
    {note:'E5',dur:1,beat:17.0},
    {note:'D5',dur:1.5,beat:18.0},
    {note:'B4',dur:0.5,beat:19.5},
    {note:'G4',dur:1,beat:20.0},
    {note:'A4',dur:1.5,beat:21.0},
    {note:'B4',dur:0.5,beat:22.5},
    {note:'C5',dur:1,beat:23.0},
    {note:'A4',dur:1.5,beat:24.0},
    {note:'A4',dur:0.5,beat:25.5},
    {note:'G#4',dur:1,beat:26.0},
    {note:'A4',dur:1.5,beat:27.0},
    {note:'B4',dur:0.5,beat:28.5},
    {note:'E5',dur:1,beat:29.0},
    {note:'A4',dur:1.5,beat:30.0},
    {note:'C5',dur:0.5,beat:31.5},
    {note:'D5',dur:1,beat:32.0},
    {note:'E5',dur:1.5,beat:33.0},
    {note:'F5',dur:0.5,beat:34.5},
    {note:'E5',dur:1,beat:35.0},
    {note:'D5',dur:1.5,beat:36.0},
    {note:'B4',dur:0.5,beat:37.5},
    {note:'G4',dur:1,beat:38.0},
    {note:'A4',dur:1.5,beat:39.0},
    {note:'B4',dur:0.5,beat:40.5},
    {note:'C5',dur:1,beat:41.0},
    {note:'B4',dur:1,beat:42.0},
    {note:'A4',dur:1,beat:43.0},
    {note:'G#4',dur:1,beat:44.0},
    {note:'A4',dur:3,beat:45.0},
    {note:'A2',dur:6.0,beat:12.0},
    {note:'G2',dur:6.0,beat:18.0},
    {note:'A2',dur:6.0,beat:24.0},
    {note:'E2',dur:6.0,beat:30.0},
    {note:'A2',dur:6.0,beat:36.0},
    {note:'G2',dur:6.0,beat:42.0},
    {note:'A2',dur:6.0,beat:48.0},
    {note:'E2',dur:6.0,beat:54.0},
    {note:'G5',dur:1.5,beat:60},
    {note:'F5',dur:0.5,beat:61.5},
    {note:'E5',dur:1.5,beat:62.0},
    {note:'C5',dur:0.5,beat:63.5},
    {note:'D5',dur:1,beat:64.0},
    {note:'B4',dur:1.5,beat:65.0},
    {note:'G4',dur:0.5,beat:66.5},
    {note:'A4',dur:1,beat:67.0},
    {note:'B4',dur:1.5,beat:68.0},
    {note:'C5',dur:0.5,beat:69.5},
    {note:'D5',dur:1,beat:70.0},
    {note:'B4',dur:1,beat:71.0},
    {note:'A4',dur:1,beat:72.0},
    {note:'G#4',dur:1,beat:73.0},
    {note:'A4',dur:3,beat:74.0},
    {note:'G5',dur:1.5,beat:77.0},
    {note:'F5',dur:0.5,beat:78.5},
    {note:'E5',dur:1.5,beat:79.0},
    {note:'C5',dur:0.5,beat:80.5},
    {note:'D5',dur:1,beat:81.0},
    {note:'B4',dur:1.5,beat:82.0},
    {note:'G4',dur:0.5,beat:83.5},
    {note:'A4',dur:1,beat:84.0},
    {note:'A4',dur:1.5,beat:85.0},
    {note:'B4',dur:0.5,beat:86.5},
    {note:'C5',dur:1,beat:87.0},
    {note:'B4',dur:1,beat:88.0},
    {note:'A4',dur:1,beat:89.0},
    {note:'G#4',dur:1,beat:90.0},
    {note:'A4',dur:3,beat:91.0},
    {note:'C2',dur:6.0,beat:60.0},
    {note:'G2',dur:6.0,beat:66.0},
    {note:'A2',dur:6.0,beat:72.0},
    {note:'E2',dur:6.0,beat:78.0},
    {note:'C2',dur:6.0,beat:84.0},
    {note:'G2',dur:6.0,beat:90.0},
    {note:'A2',dur:6.0,beat:96.0},
    {note:'E2',dur:6.0,beat:102.0},
    {note:'A5',dur:1.5,beat:108},
    {note:'C6',dur:0.5,beat:109.5},
    {note:'D6',dur:1,beat:110.0},
    {note:'E6',dur:1.5,beat:111.0},
    {note:'F6',dur:0.5,beat:112.5},
    {note:'E6',dur:1,beat:113.0},
    {note:'D6',dur:1.5,beat:114.0},
    {note:'B5',dur:0.5,beat:115.5},
    {note:'G5',dur:1,beat:116.0},
    {note:'A5',dur:1.5,beat:117.0},
    {note:'B5',dur:0.5,beat:118.5},
    {note:'C6',dur:1,beat:119.0},
    {note:'A5',dur:1.5,beat:120.0},
    {note:'A5',dur:0.5,beat:121.5},
    {note:'G#5',dur:1,beat:122.0},
    {note:'A5',dur:1.5,beat:123.0},
    {note:'B5',dur:0.5,beat:124.5},
    {note:'E6',dur:1,beat:125.0},
    {note:'A5',dur:1.5,beat:126.0},
    {note:'C6',dur:0.5,beat:127.5},
    {note:'D6',dur:1,beat:128.0},
    {note:'E6',dur:1.5,beat:129.0},
    {note:'F6',dur:0.5,beat:130.5},
    {note:'E6',dur:1,beat:131.0},
    {note:'D6',dur:1.5,beat:132.0},
    {note:'B5',dur:0.5,beat:133.5},
    {note:'G5',dur:1,beat:134.0},
    {note:'A5',dur:1.5,beat:135.0},
    {note:'B5',dur:0.5,beat:136.5},
    {note:'C6',dur:1,beat:137.0},
    {note:'B5',dur:1,beat:138.0},
    {note:'A5',dur:1,beat:139.0},
    {note:'G#5',dur:1,beat:140.0},
    {note:'A5',dur:3,beat:141.0},
    {note:'A2',dur:6.0,beat:108.0},
    {note:'G2',dur:6.0,beat:114.0},
    {note:'A2',dur:6.0,beat:120.0},
    {note:'E2',dur:6.0,beat:126.0},
    {note:'A2',dur:6.0,beat:132.0},
    {note:'G2',dur:6.0,beat:138.0},
    {note:'A2',dur:6.0,beat:144.0},
    {note:'E2',dur:6.0,beat:150.0},
    {note:'A4',dur:3,beat:156},
    {note:'A4',dur:3,beat:159},
    {note:'A2',dur:8,beat:156}
  ]},
  { category:'Anime / Game', keys:['kiss the rain','yiruma kiss','kiss rain yiruma'], title:'Kiss the Rain · Yiruma', tempo:75, notes:[
    {note:'B4',dur:0.5,beat:0},
    {note:'E5',dur:0.5,beat:0.5},
    {note:'G5',dur:1,beat:1.0},
    {note:'B5',dur:1,beat:2.0},
    {note:'G5',dur:0.5,beat:3.0},
    {note:'E5',dur:0.5,beat:3.5},
    {note:'B4',dur:1,beat:4.0},
    {note:'E2',dur:4,beat:0},
    {note:'B2',dur:4,beat:4},
    {note:'E4',dur:0.5,beat:8},
    {note:'G4',dur:0.5,beat:8.5},
    {note:'B4',dur:1,beat:9.0},
    {note:'E5',dur:1,beat:10.0},
    {note:'D5',dur:0.5,beat:11.0},
    {note:'B4',dur:0.5,beat:11.5},
    {note:'A4',dur:1,beat:12.0},
    {note:'G4',dur:1,beat:13.0},
    {note:'F#4',dur:0.5,beat:14.0},
    {note:'A4',dur:0.5,beat:14.5},
    {note:'D5',dur:1,beat:15.0},
    {note:'F#5',dur:1,beat:16.0},
    {note:'E5',dur:0.5,beat:17.0},
    {note:'D5',dur:0.5,beat:17.5},
    {note:'B4',dur:2,beat:18.0},
    {note:'G4',dur:0.5,beat:20.0},
    {note:'B4',dur:0.5,beat:20.5},
    {note:'E5',dur:1,beat:21.0},
    {note:'G5',dur:1,beat:22.0},
    {note:'F#5',dur:0.5,beat:23.0},
    {note:'E5',dur:0.5,beat:23.5},
    {note:'D5',dur:1,beat:24.0},
    {note:'B4',dur:1,beat:25.0},
    {note:'A4',dur:0.5,beat:26.0},
    {note:'C5',dur:0.5,beat:26.5},
    {note:'F#5',dur:1,beat:27.0},
    {note:'A5',dur:1,beat:28.0},
    {note:'G5',dur:0.5,beat:29.0},
    {note:'F#5',dur:0.5,beat:29.5},
    {note:'E5',dur:2,beat:30.0},
    {note:'E2',dur:4,beat:8},
    {note:'B2',dur:4,beat:12},
    {note:'C2',dur:4,beat:16},
    {note:'G2',dur:4,beat:20},
    {note:'A2',dur:4,beat:24},
    {note:'E2',dur:4,beat:28},
    {note:'D2',dur:4,beat:32},
    {note:'E2',dur:4,beat:36},
    {note:'B4',dur:1,beat:40},
    {note:'D5',dur:1,beat:41},
    {note:'F#5',dur:2,beat:42},
    {note:'E5',dur:1,beat:44},
    {note:'D5',dur:1,beat:45},
    {note:'B4',dur:2,beat:46},
    {note:'A5',dur:1,beat:48},
    {note:'G5',dur:1,beat:49},
    {note:'F#5',dur:2,beat:50},
    {note:'E5',dur:1,beat:52},
    {note:'D5',dur:1,beat:53},
    {note:'B4',dur:2,beat:54},
    {note:'B5',dur:1,beat:56},
    {note:'A5',dur:1,beat:57},
    {note:'G5',dur:2,beat:58},
    {note:'F#5',dur:1,beat:60},
    {note:'E5',dur:1,beat:61},
    {note:'D5',dur:2,beat:62},
    {note:'A4',dur:1,beat:64},
    {note:'B4',dur:1,beat:65},
    {note:'E5',dur:2,beat:66},
    {note:'B2',dur:4,beat:40},
    {note:'G2',dur:4,beat:44},
    {note:'A2',dur:4,beat:48},
    {note:'E2',dur:4,beat:52},
    {note:'G2',dur:4,beat:56},
    {note:'D2',dur:4,beat:60},
    {note:'E2',dur:4,beat:64},
    {note:'E5',dur:0.5,beat:68},
    {note:'G5',dur:0.5,beat:68.5},
    {note:'B5',dur:1,beat:69.0},
    {note:'E6',dur:1,beat:70.0},
    {note:'D6',dur:0.5,beat:71.0},
    {note:'B5',dur:0.5,beat:71.5},
    {note:'A5',dur:1,beat:72.0},
    {note:'G5',dur:1,beat:73.0},
    {note:'F#5',dur:0.5,beat:74.0},
    {note:'A5',dur:0.5,beat:74.5},
    {note:'D6',dur:1,beat:75.0},
    {note:'F#6',dur:1,beat:76.0},
    {note:'E6',dur:0.5,beat:77.0},
    {note:'D6',dur:0.5,beat:77.5},
    {note:'B5',dur:2,beat:78.0},
    {note:'G5',dur:0.5,beat:80.0},
    {note:'B5',dur:0.5,beat:80.5},
    {note:'E6',dur:1,beat:81.0},
    {note:'G6',dur:1,beat:82.0},
    {note:'F#6',dur:0.5,beat:83.0},
    {note:'E6',dur:0.5,beat:83.5},
    {note:'D6',dur:1,beat:84.0},
    {note:'B5',dur:1,beat:85.0},
    {note:'A5',dur:0.5,beat:86.0},
    {note:'C6',dur:0.5,beat:86.5},
    {note:'F#6',dur:1,beat:87.0},
    {note:'A6',dur:1,beat:88.0},
    {note:'G6',dur:0.5,beat:89.0},
    {note:'F#6',dur:0.5,beat:89.5},
    {note:'E6',dur:2,beat:90.0},
    {note:'E2',dur:4,beat:68},
    {note:'B2',dur:4,beat:72},
    {note:'C2',dur:4,beat:76},
    {note:'G2',dur:4,beat:80},
    {note:'A2',dur:4,beat:84},
    {note:'E2',dur:4,beat:88},
    {note:'D2',dur:4,beat:92},
    {note:'E2',dur:4,beat:96},
    {note:'B4',dur:1,beat:100},
    {note:'D5',dur:1,beat:101},
    {note:'F#5',dur:2,beat:102},
    {note:'E5',dur:1,beat:104},
    {note:'D5',dur:1,beat:105},
    {note:'B4',dur:2,beat:106},
    {note:'A5',dur:1,beat:108},
    {note:'G5',dur:1,beat:109},
    {note:'F#5',dur:2,beat:110},
    {note:'E5',dur:1,beat:112},
    {note:'D5',dur:1,beat:113},
    {note:'B4',dur:2,beat:114},
    {note:'B5',dur:1,beat:116},
    {note:'A5',dur:1,beat:117},
    {note:'G5',dur:2,beat:118},
    {note:'F#5',dur:1,beat:120},
    {note:'E5',dur:1,beat:121},
    {note:'D5',dur:2,beat:122},
    {note:'A4',dur:1,beat:124},
    {note:'B4',dur:1,beat:125},
    {note:'E5',dur:2,beat:126},
    {note:'B2',dur:4,beat:100},
    {note:'G2',dur:4,beat:104},
    {note:'A2',dur:4,beat:108},
    {note:'E2',dur:4,beat:112},
    {note:'G2',dur:4,beat:116},
    {note:'D2',dur:4,beat:120},
    {note:'E2',dur:4,beat:124},
    {note:'B4',dur:1,beat:128},
    {note:'A4',dur:1,beat:129},
    {note:'G4',dur:1,beat:130},
    {note:'F#4',dur:1,beat:131},
    {note:'E4',dur:4,beat:132},
    {note:'E2',dur:4,beat:128},
    {note:'E2',dur:4,beat:132}
  ]}
];

function fuzzyScore(q, k) {
  q = q.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
  k = k.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
  if (!q || !k) return 0;
  if (q === k) return 100;
  if (k.includes(q) || q.includes(k)) return 90;
  // Levenshtein
  const m = []; for (let i = 0; i <= q.length; i++) m[i] = [i];
  for (let j = 0; j <= k.length; j++) m[0][j] = j;
  for (let i = 1; i <= q.length; i++)
    for (let j = 1; j <= k.length; j++)
      m[i][j] = q[i-1] === k[j-1] ? m[i-1][j-1] : 1 + Math.min(m[i-1][j], m[i][j-1], m[i-1][j-1]);
  const d = m[q.length][k.length];
  if (d <= 2) return 80;
  if (d <= 4) return 65;
  return 0;
}

async function claudeGenMidi(title) {
  // Search AI_LIBRARY with fuzzy matching — no API call needed
  let best = null, bestScore = 0, bestTitle = '';
  for (const song of AI_LIBRARY) {
    for (const k of song.keys) {
      const s = fuzzyScore(title, k);
      if (s > bestScore) { bestScore = s; best = song; bestTitle = song.title; }
    }
  }
  if (best && bestScore >= 60) {
    return { tempo: best.tempo, notes: best.notes, title: bestTitle };
  }
  const list = AI_LIBRARY.map(s => s.title).join(' · ');
  throw new Error('"' + title + '" not in AI library yet. Available: ' + list);
}
export default function Paintiano() {
  const canvasRef    = useRef(null);
  const samplerRef   = useRef(null);
  const samplerOk    = useRef(false);
  const pendingRef   = useRef([]);
  const kbTimer      = useRef(null);
  const timers       = useRef([]);
  const idxRef       = useRef(0);
  const pixelRef     = useRef(null);
  const genRef       = useRef(0);
  const inputFocus   = useRef(false);
  const refMidi      = useRef(null);
  const refAudio     = useRef(null);
  const refImage     = useRef(null);
  const refPdf       = useRef(null);

  const [mode,      setMode]      = useState('harmony');
  const [chords,    setChords]    = useState([]);
  const [disp,      setDisp]      = useState(0);
  const [active,    setActive]    = useState(new Set());
  const [pickMode,  setPickMode]  = useState(null); // 'midi' | 'audio' | null
  const [preview,   setPreview]   = useState(null); // {url, filename, w, h, size, file}
  const [previewMsg,setPreviewMsg]= useState(null); // in-modal status text
  const [paintDur,  setPaintDur]  = useState(500);
  const [paintVel,  setPaintVel]  = useState(88);
  const [paintScale,setPaintScale]= useState('off');
  const [pending,   setPending]   = useState([]);
  const [playing,   setPlaying]   = useState(false);
  const [anim,      setAnim]      = useState(false);
  const [grid,      setGrid]      = useState({N:DN,BW:DB,BH:DH,CW:DN*DB,CH:DN*DH});
  const [info,      setInfo]      = useState(null);
  const [viewMode,  setViewMode]  = useState('paint');
  const [stamp,     setStamp]     = useState(0);
  const [piano,     setPiano]     = useState('loading');
  const [songQ,     setSongQ]     = useState('');
  const [err,       setErr]       = useState('');
  const [errInfo,   setErrInfo]   = useState(false);
  const [working,   setWorking]   = useState(false);
  const [wLabel,    setWLabel]    = useState('');
  const [wPct,      setWPct]      = useState(0);
  const [midiBlob,  setMidiBlob]  = useState(null);
  const [midiName,  setMidiName]  = useState('');
  const [showLib,   setShowLib]   = useState(false);
  const blobUrl = useMemo(()=>midiBlob?URL.createObjectURL(midiBlob):null,[midiBlob]);
  const busy = playing || anim || working;

  useEffect(()=>{
    let dead=false;
    const s=new Tone.Sampler({urls:S_URLS,baseUrl:S_BASE,
      onload:()=>{if(!dead){samplerOk.current=true;setPiano('ready');}},
      onerror:()=>{if(!dead){samplerOk.current=false;setPiano('error');}},
    }).toDestination();
    samplerRef.current=s;
    return()=>{dead=true;try{s.dispose();}catch(_){}samplerRef.current=null;samplerOk.current=false;};
  },[]);

  const gc = useCallback((m,v)=>mode==='spectral'?specCol(m,v):harmCol(m,v),[mode]);

  useEffect(()=>{
    const cv=canvasRef.current;if(!cv)return;
    const{N,BW,BH,CW,CH}=grid,ctx=cv.getContext('2d');
    if(viewMode==='image'&&pixelRef.current&&(playing||anim))return;
    ctx.fillStyle='#04040a';ctx.fillRect(0,0,CW,CH);
    if(viewMode==='image'&&pixelRef.current){
      const{nc,nr,px}=pixelRef.current;
      for(let i=0;i<nc*nr;i++){const row=Math.floor(i/nc),col=i%nc,p=px[i];ctx.fillStyle=`rgba(${p.r},${p.g},${p.b},0.18)`;ctx.fillRect(col*BW-1,row*BH-1,BW+2,BH+2);ctx.fillStyle=`rgb(${p.r},${p.g},${p.b})`;ctx.fillRect(col*BW+.5,row*BH+.5,BW-1,BH-1);}
    }else{
      ctx.strokeStyle='rgba(255,255,255,0.025)';ctx.lineWidth=.5;
      for(let i=0;i<=N;i++){ctx.beginPath();ctx.moveTo(i*BW,0);ctx.lineTo(i*BW,CH);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*BH);ctx.lineTo(CW,i*BH);ctx.stroke();}
      const lim=anim?disp:(playing&&info)?disp:chords.length;
      chords.slice(0,lim).forEach(({n:notes,idx})=>{const cell=grid.cells&&grid.cells[idx];if(cell){if(cell.segments)cell.segments.forEach(s=>drawBlock(ctx,s.x,s.y,notes,gc,s.w,s.h));else drawBlock(ctx,cell.x,cell.y,notes,gc,cell.w,cell.h);}else{const si=idx%(N*N),col=si%N,row=Math.floor(si/N);drawBlock(ctx,col*BW,row*BH,notes,gc,BW,BH);}});
      if(!info){const pi=idxRef.current,cell=grid.cells&&grid.cells[pi%(grid.cells.length||1)];const cx=cell?cell.x:((pi%(N*N))%N)*BW,cy=cell?cell.y:Math.floor((pi%(N*N))/N)*BH,cw=cell?cell.w:BW,ch=cell?cell.h:BH;ctx.strokeStyle='rgba(201,168,76,0.25)';ctx.lineWidth=.8;ctx.strokeRect(cx+.5,cy+.5,cw-1,ch-1);if(pending.length>0)drawBlock(ctx,cx,cy,pending.map(m=>({m,v:65,durMs:0})),gc,cw,ch);}
    }
  },[chords,disp,pending,mode,grid,info,gc,viewMode,playing,stamp,anim]);

  const playNote = useCallback((midi,vel=88,durMs=500)=>{
    try{
      const gain=Math.max(0.01,Math.min(1,vel/127)),dur=Math.max(0.05,durMs/1000);
      if(samplerOk.current&&samplerRef.current){samplerRef.current.triggerAttackRelease(Tone.Frequency(midi,'midi').toNote(),dur,Tone.now(),gain);return;}
      const ac=Tone.getContext().rawContext;if(!ac)return;
      if(ac.state==='suspended')ac.resume();
      const freq=440*Math.pow(2,(midi-69)/12),now=ac.currentTime,fade=Math.min(dur+.35,1.5),amp=gain*.18,master=ac.createGain();
      master.gain.setValueAtTime(amp,now);master.gain.exponentialRampToValueAtTime(.0001,now+fade);master.connect(ac.destination);
      [[1,1],[2,.5],[3,.25],[4,.1]].forEach(([h,w])=>{const osc=ac.createOscillator(),g=ac.createGain();osc.type='sine';osc.frequency.value=freq*h;g.gain.value=w;osc.connect(g);g.connect(master);osc.start(now);osc.stop(now+fade+.05);osc.onended=()=>{try{osc.disconnect();g.disconnect();}catch(_){}};});
      setTimeout(()=>{try{master.disconnect();}catch(_){}},(fade+.15)*1000);
    }catch(_){}
  },[]);

  const stopAll = useCallback(()=>{
    genRef.current++;timers.current.forEach(t=>clearTimeout(t));timers.current=[];
    setPlaying(false);setAnim(false);
  },[]);

  const commit = useCallback(()=>{
    if(!pendingRef.current.length)return;
    const notes=pendingRef.current.map(m=>({m,v:88,durMs:500}));
    pendingRef.current=[];setPending([]);
    const idx=idxRef.current++;
    setChords(p=>[...p,{n:notes,idx,startMs:0}]);
  },[]);

  const pressNote = useCallback((midi,vel=88,durMs=500)=>{
    // Apply paint settings: scale snap, chosen velocity & duration
    midi = paintSnapMidi(midi, paintScale);
    vel = paintVel;
    durMs = paintDur;
    Tone.start();playNote(midi,vel,durMs);
    if(!pendingRef.current.includes(midi)){pendingRef.current=[...pendingRef.current,midi];setPending([...pendingRef.current]);}
    clearTimeout(kbTimer.current);kbTimer.current=setTimeout(commit,KB_WIN);
    setActive(p=>new Set([...p,midi]));
    setTimeout(()=>setActive(p=>{const s=new Set(p);s.delete(midi);return s;}),Math.min(durMs,800));
  },[playNote,commit,paintDur,paintVel,paintScale]);

  useEffect(()=>{
    const map={a:60,w:61,s:62,e:63,d:64,f:65,t:66,g:67,y:68,h:69,u:70,j:71,k:72,o:73,l:74,p:75};
    const held=new Set();
    const dn=e=>{if(inputFocus.current)return;const m=map[e.key];if(m&&!held.has(e.key)){held.add(e.key);pressNote(m);}};
    const up=e=>held.delete(e.key);
    window.addEventListener('keydown',dn);window.addEventListener('keyup',up);
    return()=>{window.removeEventListener('keydown',dn);window.removeEventListener('keyup',up);};
  },[pressNote]);

  const clear = useCallback(()=>{
    stopAll();clearTimeout(kbTimer.current);
    setChords([]);idxRef.current=0;setPending([]);pendingRef.current=[];
    setDisp(0);setInfo(null);setErr('');setMidiBlob(null);setMidiName('');
    pixelRef.current=null;setViewMode('paint');setStamp(s=>s+1);
    setGrid({N:DN,BW:DB,BH:DH,CW:DN*DB,CH:DN*DH});
  },[stopAll]);

  const applyEvents = useCallback((events,title)=>{
    if(!events.length)return;
    events.forEach(ev=>{if(ev.durQ==null){const md=Math.max(...ev.n.map(n=>n.durMs||0),0);ev.durQ=md>0?snapDurQ(md/500):1;}});
    const wi=events.map((c,i)=>({...c,idx:i}));
    const g=computeGrid(wi),lastMs=wi[wi.length-1]?.startMs||0;
    pixelRef.current=null;setViewMode('paint');
    setGrid(g);setChords(wi);setDisp(wi.length);
    setInfo({title,count:wi.length,dur:Math.round(lastMs/1000)});
    idxRef.current=wi.length;
  },[]);

  const demoPlay=()=>{
    if(busy)return;Tone.start();clear();setPlaying(true);
    let t=0;
    DEMO.forEach(({n:notes,d})=>{
      const ct=t;
      timers.current.push(setTimeout(()=>{
        notes.forEach(({m,v,durMs})=>{playNote(m,v,durMs);setActive(p=>new Set([...p,m]));setTimeout(()=>setActive(p=>{const s=new Set(p);s.delete(m);return s;}),Math.min(durMs,d));});
        const idx=idxRef.current++;setChords(p=>[...p,{n:notes,idx,startMs:ct}]);
      },ct));
      t+=d+25;
    });
    timers.current.push(setTimeout(()=>setPlaying(false),t+300));
  };

  const loadMidi=e=>{
    const file=e.target.files[0];if(!file)return;e.target.value='';
    const r=new FileReader();
    r.onload=evt=>{
      try{
        const{raw,div,temps}=parseMidi(evt.target.result);
        const evts=toChords(raw,div,temps);
        if(!evts.length){setErr('No notes found in MIDI.');setErrInfo(false);return;}
        stopAll();applyEvents(evts,file.name.replace(/\.midi?$/i,'').replace(/[_-]/g,' '));
      }catch(e){setErr('MIDI parse error: '+e.message);setErrInfo(false);}
    };
    r.readAsArrayBuffer(file);
  };

  const loadAudio=useCallback(async e=>{
    const file=e.target.files[0];if(!file)return;e.target.value='';
    setWorking(true);setWLabel('transcribing audio');setWPct(0);setErr('');setErrInfo(false);stopAll();
    try{
      const buf=await file.arrayBuffer();
      const AC=window.AudioContext||window.webkitAudioContext;
      const ac=new AC();
      const audioBuf=await ac.decodeAudioData(buf);
      ac.close();
      const evts=await transcribeAudio(audioBuf,p=>{setWPct(Math.round(p*100));});
      if(!evts.length){setErr('No notes detected.');setErrInfo(false);return;}
      applyEvents(evts,file.name.replace(/\.[^.]+$/,''));
    }catch(e){setErr('Audio: '+e.message);setErrInfo(false);}
    finally{setWorking(false);setWLabel('');setWPct(0);}
  },[stopAll,applyEvents]);

  // Built-in sample loaders — embedded files, decoded through the real pipelines
  const loadSampleMidi=useCallback(()=>{
    try{
      const arrayBuffer=b64ToArrayBuffer(SAMPLE_MIDI_B64);
      const{raw,div,temps}=parseMidi(arrayBuffer);
      const evts=toChords(raw,div,temps);
      if(!evts.length){setErr('Sample MIDI: no notes.');setErrInfo(false);return;}
      stopAll();applyEvents(evts,SAMPLE_MIDI_NAME);
    }catch(e){setErr('Sample MIDI: '+e.message);setErrInfo(false);}
  },[stopAll,applyEvents]);

  const loadSampleAudio=useCallback(async()=>{
    setWorking(true);setWLabel('decoding sample audio');setWPct(0);setErr('');setErrInfo(false);stopAll();
    try{
      const arrayBuffer=b64ToArrayBuffer(SAMPLE_AUDIO_B64);
      const AC=window.AudioContext||window.webkitAudioContext;
      const ac=new AC();
      const audioBuf=await ac.decodeAudioData(arrayBuffer);
      ac.close();
      setWLabel('transcribing sample');
      const evts=await transcribeAudio(audioBuf,p=>{setWPct(Math.round(p*100));});
      if(!evts.length){setErr('Sample audio: no notes detected.');setErrInfo(false);return;}
      applyEvents(evts,SAMPLE_AUDIO_NAME);
    }catch(e){setErr('Sample audio: '+e.message);setErrInfo(false);}
    finally{setWorking(false);setWLabel('');setWPct(0);}
  },[stopAll,applyEvents]);


  const aiMidi=useCallback(async(overrideTitle)=>{
    const title=((overrideTitle&&typeof overrideTitle==='string')?overrideTitle:songQ).trim();
    if(!title||playing||anim||working)return;
    if(overrideTitle&&typeof overrideTitle==='string')setSongQ(overrideTitle);
    setWorking(true);setWLabel('AI searching');setWPct(20);setErr('');setErrInfo(false);setMidiBlob(null);stopAll();
    try{
      setWPct(50);
      const result=await claudeGenMidi(title);
      setWPct(80);
      if(!result||!result.notes||!result.notes.length){setErr('No notes returned.');setErrInfo(false);return;}
      const evts=noteArr2events(result.notes,result.tempo);
      if(!evts.length){setErr('Invalid notes returned.');setErrInfo(false);return;}
      const displayTitle = result.title || title;
      applyEvents(evts,displayTitle);
      const bytes=encodeMidi(evts,result.tempo||120);
      setMidiBlob(new Blob([bytes],{type:'audio/midi'}));
      setMidiName(displayTitle.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim()+'.mid');
    }catch(e){setErr(e.message);setErrInfo(true);}
    finally{setWorking(false);setWLabel('');setWPct(0);}
  },[songQ,playing,anim,working,stopAll,applyEvents]);

  const loadPdf=useCallback(async(e)=>{
    const file=e.target.files[0];if(!file)return;e.target.value='';
    setWorking(true);setWLabel('rendering PDF');setWPct(10);setErr('');setErrInfo(false);stopAll();
    try{
      const buf=await file.arrayBuffer();
      setWPct(35);
      const{canvas:pdfCanvas,totalPages}=await pdfPageToCanvas(buf,1);
      setWLabel('analyzing score');setWPct(55);

      // OMR-lite: detect staves, find noteheads, group into chords (like MIDI events)
      setWLabel('detecting staves');setWPct(58);
      const staves=detectStaves(pdfCanvas);
      setWPct(64);

      const haveStaves = staves.length > 0;
      if(!haveStaves){
        setWLabel('no staves — pentatonic fallback');setWPct(70);
      }

      setWLabel('finding noteheads');
      const W=pdfCanvas.width,H=pdfCanvas.height;
      const fullData=pdfCanvas.getContext('2d').getImageData(0,0,W,H).data;
      const allHeads=[];

      if(haveStaves){
        for(let si=0;si<staves.length;si++){
          const staff=staves[si];
          const clef=(si%2===0)?'treble':'bass';
          const system=Math.floor(si/2);
          const heads=findNoteheadsInStaff(fullData,W,H,staff);
          for(const h of heads)allHeads.push({...h,staff,clef,system,staffIdx:si});
        }
      } else {
        // Fallback: scan in 14x14 grid for dark clusters, use page-Y to pentatonic pitch
        const N=14, blockPxW=W/N, blockPxH=H/N;
        const PENT=[];
        for(let oct=3;oct<=6;oct++)for(const pc of [0,2,4,7,9])PENT.push((oct+1)*12+pc);
        for(let row=0;row<N;row++){
          for(let col=0;col<N;col++){
            const bx0=Math.floor(col*blockPxW),by0=Math.floor(row*blockPxH);
            const bw=Math.floor(blockPxW),bh=Math.floor(blockPxH);
            let totalDark=0;
            const darkRows=[];
            for(let y=0;y<bh;y++){
              let cnt=0;
              for(let x=0;x<bw;x++){
                const i=((by0+y)*W+(bx0+x))*4;
                const lum=(fullData[i]+fullData[i+1]+fullData[i+2])/3;
                if(lum<135){cnt++;totalDark++;}
              }
              if(cnt>=Math.max(2,bw*0.04))darkRows.push({y,cnt});
            }
            if(totalDark<bw*bh*0.02)continue;
            // Cluster dark rows
            const clusters=[];let cur=null;
            for(const dr of darkRows){
              if(!cur||dr.y-cur.end>2){cur={start:dr.y,end:dr.y,total:dr.cnt};clusters.push(cur);}
              else{cur.end=dr.y;cur.total+=dr.cnt;}
            }
            const candidates=clusters.filter(c=>{
              const h=c.end-c.start+1;
              if(h<=2&&c.total/h>bw*0.6)return false; // staff line
              return c.total>=3;
            }).sort((a,b)=>b.total-a.total).slice(0,3);
            for(const c of candidates){
              const cy=by0+(c.start+c.end)/2;
              const yNorm=Math.max(0,Math.min(1,cy/H));
              const pentIdx=Math.max(0,Math.min(PENT.length-1,Math.round((1-yNorm)*(PENT.length-1))));
              const midi=PENT[pentIdx];
              allHeads.push({x:bx0+bw/2,y:cy,_midi:midi,system:row,staff:null,clef:null,staffIdx:0});
            }
          }
        }
      }
      setWPct(78);

      if(allHeads.length===0){
        setErr('No noteheads detected. Score may be too faint or unusual.');setErrInfo(true);
        return;
      }

      // Sort noteheads by reading order: system top-to-bottom, X left-to-right
      allHeads.sort((a,b)=>{
        if(a.system!==b.system)return a.system-b.system;
        return a.x-b.x;
      });

      // Group noteheads at similar X (within a system) into chords
      const refSpacing = haveStaves ? staves[0].spacing : 12;
      const mergeDistX=Math.max(6,Math.round(refSpacing*0.7));
      const chordGroups=[];
      for(const h of allHeads){
        const last=chordGroups[chordGroups.length-1];
        if(last&&last[0].system===h.system&&h.x-last[last.length-1].x<=mergeDistX){
          last.push(h);
        }else{
          chordGroups.push([h]);
        }
      }
      setWPct(86);

      // Convert chord groups to events (like MIDI's chord events)
      const TEMPO_MS=350;
      const events=[];
      for(let ci=0;ci<chordGroups.length;ci++){
        const group=chordGroups[ci];
        const seen=new Set();
        const notes=[];
        for(const h of group){
          const midi = h._midi != null ? h._midi : staffRelativePitch(h.y,h.staff,h.clef);
          if(seen.has(midi))continue;
          seen.add(midi);
          notes.push({m:midi,v:90,durMs:TEMPO_MS-40});
        }
        if(notes.length)events.push({n:notes,startMs:ci*TEMPO_MS,durQ:1});
      }
      setWPct(92);

      if(!events.length){setErr('No valid chords formed.');setErrInfo(false);return;}

      // Apply like MIDI does: applyEvents will set up grid via computeGrid(numEvents)
      const title=file.name.replace(/\.[^.]+$/,'')+(totalPages>1?' (p1/'+totalPages+')':'')+(haveStaves?' · '+staves.length+' staves':' · fallback')+' · '+events.length+' chords';
      applyEvents(events,title);

      // Generate MIDI for download
      const bytes=encodeMidi(events,Math.round(60000/TEMPO_MS));
      setMidiBlob(new Blob([bytes],{type:'audio/midi'}));
      setMidiName(file.name.replace(/\.[^.]+$/,'').replace(/[^\w\s]/g,'').replace(/\s+/g,'_')+'.mid');
      setWPct(100);
    }catch(e){setErr('PDF: '+e.message);setErrInfo(false);}
    finally{setWorking(false);setWLabel('');setWPct(0);}
  },[stopAll,applyEvents]);

  const loadImage=useCallback(e=>{
    const file=e.target.files[0];if(!file)return;e.target.value='';
    const r=new FileReader();
    r.onerror=()=>{setErr('Could not read image.');setErrInfo(false);};
    r.onload=evt=>{
      const img=new Image();
      img.onerror=()=>{setErr('Could not decode image.');setErrInfo(false);};
      img.onload=()=>{
        try{
          const nc=96,nr=60,BW=Math.floor(480/nc),BH=Math.round(BW*PHI),msPerBlock=150;
          const ofc=document.createElement('canvas');ofc.width=nc;ofc.height=nr;
          const ctx=ofc.getContext('2d');ctx.drawImage(img,0,0,nc,nr);
          const raw=ctx.getImageData(0,0,nc,nr).data;
          const px=[];
          for(let row=0;row<nr;row++)for(let col=0;col<nc;col++){const i=(row*nc+col)*4;px.push({r:raw[i],g:raw[i+1],b:raw[i+2]});}
          pixelRef.current={nc,nr,px,lastMode:mode};
          // Process pixels into events using the current mode's hue→pitch table
          const evts=pixelsToImageEvents(px,nc,nr,mode==='spectral'?SPEC_HUE:COF);
          stopAll();
          setGrid({N:nc,BW,BH,CW:nc*BW,CH:nr*BH});setViewMode('image');
          setChords(evts);setDisp(evts.length);
          setInfo({title:file.name.replace(/\.[^.]+$/,''),count:evts.length,dur:Math.round(evts.length*msPerBlock/1000)});
          idxRef.current=evts.length;setStamp(s=>s+1);
        }catch(e){setErr('Image: '+e.message);setErrInfo(false);}
      };
      img.src=evt.target.result;
    };
    r.readAsDataURL(file);
  },[mode,stopAll]);

  // When mode is toggled while an image is loaded, re-process pixels through the new
  // hue→pitch table (HARMONY: COF / SPECTRAL: SPEC_HUE) so the audio actually follows the algorithm.
  useEffect(()=>{
    if(viewMode!=='image'||!pixelRef.current)return;
    if(pixelRef.current.lastMode===mode)return;
    pixelRef.current.lastMode=mode;
    const{nc,nr,px}=pixelRef.current;
    const evts=pixelsToImageEvents(px,nc,nr,mode==='spectral'?SPEC_HUE:COF);
    stopAll();
    setChords(evts);setDisp(evts.length);
    idxRef.current=evts.length;setStamp(s=>s+1);
  },[mode,viewMode,stopAll]);

  const loadSampleImage=useCallback(()=>{
    try{
      // Strip "data:image/jpeg;base64," prefix → decode → Blob → File → synthetic event
      const b64=SAMPLE_IMAGE_B64.split(',')[1];
      const buffer=b64ToArrayBuffer(b64);
      const blob=new Blob([buffer],{type:'image/jpeg'});
      const file=new File([blob],'sample-image.jpg',{type:'image/jpeg'});
      const fakeEvent={target:{files:[file],value:''}};
      loadImage(fakeEvent);
    }catch(e){setErr('Sample image: '+e.message);setErrInfo(false);}
  },[loadImage]);

  const paintSong=()=>{
    const q=songQ.trim().toLowerCase();if(!q||busy)return;
    let best=null,bs=0;
    for(const s of SONGS)for(const k of s.keys){
      const sc=q===k?100:q.includes(k)?90:k.includes(q)?80:k.split(' ').some(w=>w.length>3&&q.includes(w))?50:q.split(' ').some(w=>w.length>3&&k.includes(w))?40:0;
      if(sc>bs){bs=sc;best=s;}
    }
    if(!best||bs<30){setErr('Not in library. Try ✦ AI to generate it.');setErrInfo(true);return;}
    setErr('');
    const sorted=[...best.n].sort((a,b)=>a[1]-b[1]);
    const evts=[];let i=0;
    while(i<sorted.length){const bt=sorted[i][1],g=[];while(i<sorted.length&&sorted[i][1]-bt<=CWIN)g.push({m:sorted[i][0],v:sorted[i][3]||80,durMs:sorted[i][2]||300}),i++;if(g.length){const md=Math.max(...g.map(n=>n.durMs));evts.push({n:g,startMs:bt,durQ:snapDurQ(md/500)});}}
    const wi=evts.map((c,j)=>({...c,idx:j})),g=computeGrid(wi),lastMs=wi[wi.length-1]?.startMs||0;
    stopAll();applyEvents(wi.map(c=>({n:c.n,startMs:c.startMs})),best.title+' · '+best.artist);
  };

  const startAnimate=()=>{
    if(busy||!chords.length)return;stopAll();setDisp(0);setAnim(true);
    if(viewMode==='image'&&pixelRef.current){
      const{nc,nr,px}=pixelRef.current,{BW,BH,CW,CH}=grid,cv=canvasRef.current,ctx=cv?.getContext('2d'),gen=genRef.current;
      if(ctx){ctx.fillStyle='#04040a';ctx.fillRect(0,0,CW,CH);}
      let i=0;
      const CHORD_SIZE=3;
      const step=()=>{
        if(genRef.current!==gen)return;
        if(i>=chords.length){setAnim(false);setDisp(chords.length);return;}
        const band=Math.floor(i/nc),col=i%nc;
        if(ctx){
          for(let j=0;j<CHORD_SIZE;j++){
            const row=band*CHORD_SIZE+j;
            if(row>=nr)break;
            const pidx=row*nc+col,p=px[pidx];
            ctx.fillStyle=`rgba(${p.r},${p.g},${p.b},0.18)`;ctx.fillRect(col*BW-1,row*BH-1,BW+2,BH+2);
            ctx.fillStyle=`rgb(${p.r},${p.g},${p.b})`;ctx.fillRect(col*BW+.5,row*BH+.5,BW-1,BH-1);
          }
        }
        i++;
        timers.current.push(setTimeout(step,6));
      };
      step();
    }else{let i=0;const step=()=>{if(i>chords.length){setAnim(false);return;}setDisp(i++);timers.current.push(setTimeout(step,i<20?0:18));};step();}
  };

  const startPlay=()=>{
    if(busy||!chords.length)return;Tone.start();stopAll();setDisp(0);setPlaying(true);
    if(viewMode==='image'&&pixelRef.current){
      const{nc,nr,px}=pixelRef.current,{BW,BH,CW,CH}=grid,cv=canvasRef.current,ctx=cv?.getContext('2d'),gen=genRef.current;
      if(ctx){ctx.fillStyle='#04040a';ctx.fillRect(0,0,CW,CH);}
      let i=0;
      const CHORD_SIZE=3;
      const step=()=>{
        if(genRef.current!==gen)return;
        if(i>=chords.length){setPlaying(false);setDisp(chords.length);return;}
        // For chord i: compute band & column, render 3 pixels stacked vertically
        const band=Math.floor(i/nc),col=i%nc;
        if(ctx){
          for(let j=0;j<CHORD_SIZE;j++){
            const row=band*CHORD_SIZE+j;
            if(row>=nr)break;
            const pidx=row*nc+col,p=px[pidx];
            ctx.fillStyle=`rgba(${p.r},${p.g},${p.b},0.18)`;ctx.fillRect(col*BW-1,row*BH-1,BW+2,BH+2);
            ctx.fillStyle=`rgb(${p.r},${p.g},${p.b})`;ctx.fillRect(col*BW+.5,row*BH+.5,BW-1,BH-1);
          }
        }
        // Skip playback if this chord is a continuation of an identical run
        if(chords[i]._playable!==false){
          // Unmerged: 3× step interval → notes ring into next 2 chords for legato blend
          // Merged run: exact run length (held note up to whole)
          const durMul=chords[i]._runLen||3;
          // Soften velocity for unmerged (overlapping notes can pile up, want gentle blend)
          const velScale=chords[i]._runLen?1:0.75;
          try{chords[i].n.forEach(({m,v,durMs})=>playNote(m,Math.round(v*velScale),durMs*durMul));}catch(_){}
        }
        if(i%nc===0)setDisp(i+1);
        i++;
        timers.current.push(setTimeout(step,150));
      };
      step();
    }else{
      chords.forEach(({n,startMs},i)=>{const delay=info?startMs:i*350;timers.current.push(setTimeout(()=>{try{setDisp(i+1);n.forEach(({m,v,durMs})=>{playNote(m,v,durMs||300);setActive(p=>new Set([...p,m]));setTimeout(()=>setActive(p=>{const s=new Set(p);s.delete(m);return s;}),Math.min(durMs||300,800));});}catch(_){}},delay));});
      const last=chords[chords.length-1],end=info?(last?.startMs||0)+1500:chords.length*350+500;
      timers.current.push(setTimeout(()=>{setPlaying(false);setDisp(chords.length);},end));
    }
  };

  const{N,BW,BH,CW,CH}=grid;
  const WKW=26,WKH=88,BKW=16,BKH=54,PW=WKEYS.length*WKW;
  const pct=info?Math.round(disp/Math.max(1,chords.length)*100):null;
  const pianoColor={loading:'rgba(207,197,168,.35)',ready:'rgba(90,190,110,.75)',error:'rgba(255,100,80,.75)'};
  const pianoLabel={loading:' loading piano…',ready:' Salamander Grand',error:' oscillator synth'};
  const btn=(ex={})=>({background:'transparent',border:'1px solid',borderRadius:2,fontSize:'.58rem',letterSpacing:'.12em',padding:'5px 14px',cursor:'pointer',textTransform:'uppercase',color:'rgba(207,197,168,.7)',borderColor:'rgba(207,197,168,.2)',...ex});

  // Export the painting as a high-resolution PNG.
  // Artifact iframes block <a download>, window.open, and rewrite blob: URLs to a
  // sandbox-internal scheme — the only thing that reliably works is rendering the PNG
  // inside the iframe as <img> and letting iOS native long-press → Save to Photos do the job.
  const exportImage=async()=>{
    try{
      if(!chords.length){setErr('Nothing to print yet — load a song or image first.');setErrInfo(false);return;}
      const SCALE=8;
      const{N,BW,BH,CW,CH}=grid;
      const hi=document.createElement('canvas');
      hi.width=Math.round(CW*SCALE);hi.height=Math.round(CH*SCALE);
      const hctx=hi.getContext('2d');
      hctx.imageSmoothingEnabled=false;
      hctx.scale(SCALE,SCALE);
      hctx.fillStyle='#04040a';hctx.fillRect(0,0,CW,CH);
      if(viewMode==='image'&&pixelRef.current){
        const{nc,nr,px}=pixelRef.current;
        for(let i=0;i<nc*nr;i++){
          const row=Math.floor(i/nc),col=i%nc,p=px[i];
          hctx.fillStyle=`rgba(${p.r},${p.g},${p.b},0.18)`;hctx.fillRect(col*BW-1,row*BH-1,BW+2,BH+2);
          hctx.fillStyle=`rgb(${p.r},${p.g},${p.b})`;hctx.fillRect(col*BW+.5,row*BH+.5,BW-1,BH-1);
        }
      }else{
        chords.forEach(({n:notes,idx})=>{
          const cell=grid.cells&&grid.cells[idx];
          if(cell&&cell.segments)cell.segments.forEach(s=>drawBlock(hctx,s.x,s.y,notes,gc,s.w,s.h));
          else if(cell)drawBlock(hctx,cell.x,cell.y,notes,gc,cell.w,cell.h);
          else{const si=idx%(N*N),col=si%N,row=Math.floor(si/N);drawBlock(hctx,col*BW,row*BH,notes,gc,BW,BH);}
        });
      }
      const blob=await new Promise(res=>hi.toBlob(res,'image/png'));
      if(!blob){setErr('Print: could not encode image.');setErrInfo(false);return;}
      const filename=`paintiano-${(info?.title||'painting').replace(/[^\w-]+/g,'_').slice(0,60)}-${hi.width}x${hi.height}.png`;
      const file=new File([blob],filename,{type:'image/png'});
      const url=URL.createObjectURL(blob);
      // Show the PNG inline + keep File for the explicit Save button (must be user-gesture for iOS share to work)
      setPreviewMsg(null);
      setPreview({url,filename,w:hi.width,h:hi.height,size:blob.size,file});
    }catch(e){setErr('Print: '+e.message);setErrInfo(false);}
  };

  const sharePreview=async()=>{
    if(!preview)return;
    setPreviewMsg({tone:'wait',text:'opening iOS share sheet…'});
    try{
      if(!navigator.share){throw new Error('navigator.share unavailable in this iframe');}
      if(navigator.canShare&&!navigator.canShare({files:[preview.file]})){
        throw new Error('canShare returned false (sandbox blocks file share)');
      }
      await navigator.share({files:[preview.file],title:'Paintiano painting'});
      setPreviewMsg({tone:'ok',text:'shared — saved if you tapped Save Image'});
    }catch(e){
      if(e&&e.name==='AbortError'){setPreviewMsg({tone:'ok',text:'share cancelled'});return;}
      setPreviewMsg({tone:'err',text:'Share blocked by sandbox: '+(e.message||e.name||'unknown')+'. Long-press the image below instead.'});
    }
  };

  const copyPreview=async()=>{
    if(!preview)return;
    setPreviewMsg({tone:'wait',text:'copying to clipboard…'});
    try{
      if(!navigator.clipboard||!window.ClipboardItem)throw new Error('Clipboard API not available');
      await navigator.clipboard.write([new ClipboardItem({'image/png':preview.file})]);
      setPreviewMsg({tone:'ok',text:'copied PNG to clipboard — paste it into Notes / Mail / Files'});
    }catch(e){
      setPreviewMsg({tone:'err',text:'Copy blocked by sandbox: '+(e.message||e.name||'unknown')+'. Long-press the image below.'});
    }
  };

  const closePreview=()=>{
    if(preview){try{URL.revokeObjectURL(preview.url);}catch(_){}}
    setPreview(null);
  };

  return (
    <div style={{background:'radial-gradient(ellipse at 50% -10%,#0e0b16,#06060c 55%)',minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',padding:'32px 16px',fontFamily:"'Cormorant Garamond','Palatino Linotype',Georgia,serif",color:'rgba(207,197,168,.85)'}}>
      <div style={{textAlign:'center',marginBottom:18}}>
        <h1 style={{fontSize:'2.2rem',fontWeight:300,letterSpacing:'.18em',margin:'0 0 4px',color:'rgba(201,168,76,.9)'}}>Paintiano</h1>
        <p style={{fontSize:'.6rem',letterSpacing:'.3em',opacity:.38,margin:'0 0 4px',textTransform:'uppercase'}}>music → φ painting · <span style={{color:'rgba(140,255,180,.95)',fontWeight:'bold'}}>BUILD #70</span></p>
        <div style={{fontSize:'.55rem',letterSpacing:'.1em',color:pianoColor[piano]}}>{pianoLabel[piano]}</div>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:10,flexWrap:'wrap',justifyContent:'center'}}>
        <div style={{display:'flex',border:'1px solid rgba(201,168,76,.25)',borderRadius:2,overflow:'hidden'}}>
          {['harmony','spectral'].map(m=>(
            <button key={m} onClick={()=>setMode(m)} style={{...btn(),border:'none',borderRadius:0,padding:'5px 16px',background:mode===m?'rgba(201,168,76,.18)':'transparent',color:mode===m?GOLD:'rgba(207,197,168,.45)'}}>{m}</button>
          ))}
        </div>
        <button onClick={demoPlay} disabled={busy} style={btn({borderColor:'rgba(201,168,76,.4)',color:busy?'rgba(201,168,76,.3)':GOLD})}>♩ für elise</button>
        <button onClick={clear} style={btn({borderColor:'rgba(207,197,168,.14)',color:'rgba(207,197,168,.35)'})}>clear</button>
      </div>

      <div style={{width:'100%',maxWidth:480,marginBottom:10}}>
        <div style={{fontSize:'.52rem',letterSpacing:'.15em',opacity:.35,textTransform:'uppercase',textAlign:'center',marginBottom:5}}>type a song · ♩ paint = library · ✦ ai = generate any song</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <input value={songQ} onChange={e=>{setSongQ(e.target.value);setErr('');}} onKeyDown={e=>e.key==='Enter'&&paintSong()} onFocus={()=>inputFocus.current=true} onBlur={()=>inputFocus.current=false}
            placeholder="e.g. Yesterday — The Beatles" disabled={busy}
            style={{flex:1,minWidth:160,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(201,168,76,.3)',borderRadius:2,padding:'7px 10px',color:'rgba(207,197,168,.9)',fontSize:'.62rem',outline:'none',fontFamily:'inherit',opacity:busy?0.4:1}}/>
          <button onClick={paintSong} disabled={!songQ.trim()||busy} style={btn({borderColor:'rgba(201,168,76,.5)',color:!songQ.trim()||busy?'rgba(201,168,76,.2)':GOLD,padding:'7px 14px'})}>♩ paint</button>
          <button onClick={aiMidi} disabled={!songQ.trim()||busy} style={btn({borderColor:'rgba(200,120,255,.5)',color:!songQ.trim()||busy?'rgba(200,120,255,.2)':'rgba(210,150,255,.9)',padding:'7px 14px'})}>✦ ai</button>
          <button onClick={()=>setShowLib(true)} disabled={busy} style={btn({borderColor:'rgba(200,120,255,.4)',color:busy?'rgba(200,120,255,.2)':'rgba(210,150,255,.7)',padding:'7px 12px'})}>📚</button>
        </div>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',justifyContent:'center'}}>
        <input ref={refMidi} type="file" accept=".mid,.midi" onChange={loadMidi} style={{display:'none'}}/>
        <button onClick={()=>setPickMode('midi')} disabled={busy} style={btn({borderColor:'rgba(120,160,255,.4)',color:'rgba(140,180,255,.8)'})}>♬ midi</button>
        <input ref={refAudio} type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,.mp3,.wav,.ogg,.m4a,.aac" onChange={loadAudio} style={{display:'none'}}/>
        <button onClick={()=>setPickMode('audio')} disabled={busy} style={btn({borderColor:'rgba(255,160,80,.4)',color:working&&wLabel.includes('audio')?GOLD:'rgba(255,180,100,.85)'})}>{working&&wLabel.includes('audio')?'⟳ '+wPct+'%':'♫ audio'}</button>
        <input ref={refPdf} type="file" accept="application/pdf,.pdf" onChange={loadPdf} style={{display:'none'}}/>
        <button onClick={()=>refPdf.current?.click()} disabled={busy} style={btn({borderColor:'rgba(200,120,255,.4)',color:working&&wLabel.includes('PDF')?'rgba(210,150,255,.95)':'rgba(210,150,255,.85)'})}>{working&&wLabel.includes('PDF')?'⟳ '+wPct+'%':'𝄞 pdf'}</button>
        <input ref={refImage} type="file" accept="image/*" onChange={loadImage} style={{display:'none'}}/>
        <button onClick={()=>setPickMode('image')} disabled={busy} style={btn({borderColor:'rgba(200,140,255,.4)',color:'rgba(210,160,255,.85)'})}>🖼 image</button>
      </div>

      {preview && (
        <div onClick={closePreview} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.94)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1100,padding:10,overflow:'auto'}}>
          <div onClick={e=>e.stopPropagation()} style={{maxWidth:'100%',display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
            <div style={{letterSpacing:'.12em',color:'rgba(201,168,76,.85)',fontSize:'.65rem',textAlign:'center'}}>🖨 {preview.w}×{preview.h} · {(preview.size/1024/1024).toFixed(1)} MB</div>
            <button onClick={copyPreview} style={{padding:'14px 24px',background:'rgba(140,180,255,.15)',color:'rgba(160,200,255,1)',border:'1px solid rgba(140,180,255,.6)',borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.14em',fontSize:'.8rem',textTransform:'uppercase',fontWeight:'bold'}}>⎘ copy png to clipboard</button>
            <div style={{fontSize:'.65rem',color:'rgba(207,197,168,.85)',textAlign:'center',padding:'10px 14px',lineHeight:1.6,maxWidth:340,border:'1px solid rgba(140,180,255,.25)',borderRadius:6,background:'rgba(140,180,255,.04)'}}>
              after copy → open <b>Files</b>, <b>Notes</b>, <b>Mail</b>, or any messaging app → <b>paste</b>. From Files you can save it as a real PNG; from Mail you can email it to yourself.
            </div>
            {previewMsg && (
              <div style={{fontSize:'.6rem',padding:'8px 12px',borderRadius:4,maxWidth:340,textAlign:'center',lineHeight:1.4,wordBreak:'break-word',color:previewMsg.tone==='ok'?'rgba(140,255,180,.95)':previewMsg.tone==='wait'?'rgba(201,168,76,.85)':'rgba(255,140,120,.95)',border:'1px solid '+(previewMsg.tone==='ok'?'rgba(140,255,180,.4)':previewMsg.tone==='wait'?'rgba(201,168,76,.25)':'rgba(255,140,120,.3)'),background:previewMsg.tone==='ok'?'rgba(140,255,180,.08)':'transparent'}}>
                {previewMsg.text}
              </div>
            )}
            <img src={preview.url} alt={preview.filename} style={{maxWidth:'100%',maxHeight:'50vh',border:'1px solid rgba(201,168,76,.25)',borderRadius:4,display:'block',WebkitTouchCallout:'default'}}/>
            <div style={{fontSize:'.5rem',color:'rgba(180,170,150,.4)',textAlign:'center',wordBreak:'break-all',padding:'0 8px',maxWidth:340}}>{preview.filename}</div>
            <div style={{fontSize:'.55rem',color:'rgba(180,170,150,.5)',textAlign:'center',padding:'0 14px',maxWidth:340,lineHeight:1.5}}>
              alternatives: <b>long-press the image</b> for Save to Photos · or an iOS screenshot (Side + Vol↑) at screen resolution
            </div>
            <button onClick={closePreview} style={{padding:'8px 22px',background:'transparent',color:'rgba(207,197,168,.6)',border:'1px solid rgba(207,197,168,.2)',borderRadius:4,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.12em',fontSize:'.55rem',textTransform:'uppercase',marginTop:4}}>close</button>
          </div>
        </div>
      )}

      {pickMode && (
        <div onClick={()=>setPickMode(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#0a0a14',border:'1px solid rgba(201,168,76,.35)',borderRadius:10,padding:'22px 18px',minWidth:260,maxWidth:340}}>
            <div style={{textAlign:'center',marginBottom:18,letterSpacing:'.12em',color:'rgba(201,168,76,.75)',fontSize:'.65rem'}}>
              {pickMode==='midi'?'♬ MIDI INPUT':pickMode==='audio'?'♫ AUDIO INPUT':'🖼 IMAGE INPUT'}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <button onClick={()=>{
                if(pickMode==='midi') loadSampleMidi();
                else if(pickMode==='audio') loadSampleAudio();
                else loadSampleImage();
                setPickMode(null);
              }} style={{padding:'12px',background:'transparent',color:pickMode==='midi'?'rgba(140,180,255,.85)':pickMode==='audio'?'rgba(255,180,100,.85)':'rgba(210,160,255,.85)',border:'1px solid '+(pickMode==='midi'?'rgba(120,160,255,.4)':pickMode==='audio'?'rgba(255,160,80,.4)':'rgba(200,140,255,.4)'),borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',fontSize:'.75rem'}}>
                ▶ built-in sample
              </button>
              <div style={{fontSize:'.55rem',color:'rgba(180,170,150,.5)',textAlign:'center',padding:'0 8px',lineHeight:1.4}}>
                {pickMode==='midi'?SAMPLE_MIDI_NAME:pickMode==='audio'?SAMPLE_AUDIO_NAME:SAMPLE_IMAGE_NAME}
              </div>
              <button onClick={()=>{
                if(pickMode==='midi') refMidi.current?.click();
                else if(pickMode==='audio') refAudio.current?.click();
                else refImage.current?.click();
                setPickMode(null);
              }} style={{padding:'12px',background:'transparent',color:'rgba(201,168,76,.85)',border:'1px solid rgba(201,168,76,.4)',borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',fontSize:'.75rem'}}>
                📁 choose file
              </button>
              <button onClick={()=>setPickMode(null)} style={{padding:'8px',background:'transparent',color:'rgba(180,170,150,.5)',border:'none',cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',fontSize:'.6rem',marginTop:4}}>
                cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',justifyContent:'center'}}>
        <button onClick={busy?stopAll:startAnimate} style={btn({borderColor:'rgba(201,168,76,.35)',color:chords.length?anim?GOLD:'rgba(201,168,76,.7)':'rgba(201,168,76,.2)'})}>{anim?'■ stop':'▶ animate'}</button>
        <button onClick={busy?stopAll:startPlay} style={btn({borderColor:'rgba(90,190,110,.45)',color:chords.length?playing?'rgba(90,190,110,.5)':'rgba(90,190,110,.9)':'rgba(90,190,110,.2)'})}>{playing?'■ stop':'♩ play'}</button>
        <button onClick={exportImage} disabled={!chords.length||busy} style={btn({borderColor:'rgba(180,140,255,.4)',color:chords.length?'rgba(200,160,255,.9)':'rgba(180,140,255,.2)'})}>🖨 print</button>
      </div>

      {err && (
        <div style={{width:'100%',maxWidth:480,marginBottom:10,fontSize:'.6rem',lineHeight:1.5,textAlign:'left',padding:'8px 12px',borderRadius:2,maxHeight:240,overflow:'auto',wordBreak:'break-word',fontFamily:'monospace',color:errInfo?'rgba(201,168,76,.85)':'rgba(255,100,80,.85)',border:errInfo?'1px solid rgba(201,168,76,.25)':'1px solid rgba(255,100,80,.2)'}}>
          {errInfo?'𝄞 ':'✕ '}{err}
        </div>
      )}

      {working && (
        <div style={{width:'100%',maxWidth:480,marginBottom:10}}>
          <div style={{fontSize:'.55rem',letterSpacing:'.12em',opacity:.6,marginBottom:4,textAlign:'center',color:'rgba(210,150,255,.8)'}}>⟳ {wLabel}… {wPct}%</div>
          <div style={{height:2,background:'rgba(255,255,255,0.07)',borderRadius:1}}>
            <div style={{height:'100%',width:wPct+'%',background:'rgba(200,120,255,.7)',borderRadius:1,transition:'width .3s'}}/>
          </div>
        </div>
      )}

      {midiBlob && (
        <div style={{width:'100%',maxWidth:480,marginBottom:10,textAlign:'center'}}>
          <a href={blobUrl} download={midiName} style={{...btn({borderColor:'rgba(90,190,110,.5)',color:'rgba(90,190,110,.9)'}),display:'inline-block',textDecoration:'none',padding:'7px 20px'}}>↓ {midiName}</a>
        </div>
      )}

      {info && (
        <div style={{width:Math.min(CW,typeof window!=='undefined'?window.innerWidth-32:480),marginBottom:10}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:'.57rem',opacity:.5,marginBottom:4}}>
            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'60%'}}>{info.title}</span>
            <span>{disp}/{chords.length} · {info.dur}s</span>
          </div>
          <div style={{height:2,background:'rgba(255,255,255,0.07)',borderRadius:1}}>
            <div style={{height:'100%',width:pct+'%',background:playing&&info?'rgba(90,190,110,.7)':'rgba(201,168,76,.5)',borderRadius:1,transition:'width .1s linear'}}/>
          </div>
        </div>
      )}

      <div style={{position:'relative',border:'1px solid rgba(201,168,76,.18)',boxShadow:'0 0 40px rgba(0,0,0,.6)',marginBottom:14}}>
        <canvas ref={canvasRef} width={CW} height={CH} style={{display:'block',maxWidth:'100%'}}/>
        {chords.length===0&&(
          <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
            <div style={{opacity:.12,fontSize:'.6rem',letterSpacing:'.22em',textTransform:'uppercase'}}>play · paint · upload</div>
            <div style={{opacity:.05,fontSize:'2.8rem'}}>♩</div>
          </div>
        )}
      </div>

      <div style={{marginBottom:14,fontSize:'.57rem',letterSpacing:'.1em',opacity:.5,textAlign:'center'}}>
        {pending.length>0?<span style={{color:GOLD}}>▸ building chord: {pending.length} voice{pending.length>1?'s':''}</span>:viewMode==='image'?<span style={{color:'rgba(210,160,255,.7)'}}>{grid.N}×{pixelRef.current?.nr||'?'} pixel grid</span>:<span>grid {N}×{N} · {BW}×{BH}px · φ≈{(BH/BW).toFixed(3)}</span>}
      </div>

      {/* Paint-mode controls: duration, scale, velocity */}
      <div style={{display:'flex',gap:6,justifyContent:'center',marginBottom:6,fontSize:'.55rem',letterSpacing:'.08em',flexWrap:'wrap'}}>
        <button onClick={()=>{
          const cur=PAINT_DURS.findIndex(d=>d.ms===paintDur);
          setPaintDur(PAINT_DURS[(cur+1)%PAINT_DURS.length].ms);
        }} style={{padding:'5px 10px',background:'transparent',color:'rgba(201,168,76,.85)',border:'1px solid rgba(201,168,76,.35)',borderRadius:5,cursor:'pointer',letterSpacing:'.06em',fontFamily:'inherit'}}>
          ♩ {(PAINT_DURS.find(d=>d.ms===paintDur)||PAINT_DURS[2]).label}
        </button>
        <button onClick={()=>{
          const cur=PAINT_SCALE_KEYS.indexOf(paintScale);
          setPaintScale(PAINT_SCALE_KEYS[(cur+1)%PAINT_SCALE_KEYS.length]);
        }} style={{padding:'5px 10px',background:'transparent',color:paintScale==='off'?'rgba(180,180,180,.55)':'rgba(140,255,180,.85)',border:'1px solid '+(paintScale==='off'?'rgba(180,180,180,.25)':'rgba(140,255,180,.35)'),borderRadius:5,cursor:'pointer',letterSpacing:'.06em',fontFamily:'inherit'}}>
          ♫ {PAINT_SCALES[paintScale].label}
        </button>
        <button onClick={()=>{
          const cur=PAINT_VELS.findIndex(v=>v.v===paintVel);
          const next=cur>=0?(cur+1)%PAINT_VELS.length:1;
          setPaintVel(PAINT_VELS[next].v);
        }} style={{padding:'5px 10px',background:'transparent',color:'rgba(210,160,255,.85)',border:'1px solid rgba(210,160,255,.35)',borderRadius:5,cursor:'pointer',letterSpacing:'.06em',fontFamily:'inherit'}}>
          ⚡ {(PAINT_VELS.find(v=>v.v===paintVel)||PAINT_VELS[1]).label}
        </button>
      </div>
      <div style={{marginBottom:20,overflowX:'auto',maxWidth:'100%',paddingBottom:4}}>
        <div style={{position:'relative',width:PW,height:WKH,userSelect:'none',opacity:busy&&!playing?0.4:1}}>
          {WKEYS.map(({midi,wi})=>(
            <div key={midi} onMouseDown={()=>!busy&&pressNote(midi,88,500)} onTouchStart={e=>{e.preventDefault();if(!busy)pressNote(midi,88,500);}}
              style={{position:'absolute',left:wi*WKW,width:WKW-1,height:WKH,background:active.has(midi)?'linear-gradient(180deg,#c9a84c,#a88830)':pending.includes(midi)?'rgba(201,168,76,.3)':'rgba(240,235,220,1)',borderRadius:'0 0 5px 5px',border:'1px solid rgba(0,0,0,.28)',cursor:busy&&!playing?'default':'pointer',boxShadow:active.has(midi)?'0 2px 4px rgba(0,0,0,.3)':'0 4px 8px rgba(0,0,0,.4)',zIndex:1,display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:4,fontSize:'.42rem',color:'rgba(0,0,0,.35)'}}>
              {midi%12===0?'C'+(Math.floor(midi/12)-1):''}
            </div>
          ))}
          {BKEYS.map(({midi,lw})=>(
            <div key={midi} onMouseDown={()=>!busy&&pressNote(midi,80,400)} onTouchStart={e=>{e.preventDefault();if(!busy)pressNote(midi,80,400);}}
              style={{position:'absolute',left:(lw+0.65)*WKW,top:0,width:BKW,height:BKH,background:active.has(midi)?'linear-gradient(180deg,#7a5a00,#5a4000)':(paintScale!=='off'&&paintScalePCs(paintScale)&&!paintScalePCs(paintScale).includes(midi%12))?'linear-gradient(180deg,#2a2a2a,#1a1a1a)':'linear-gradient(180deg,#1a1a1a,#0a0a0a)',borderRadius:'0 0 4px 4px',border:'1px solid rgba(0,0,0,.7)',cursor:busy&&!playing?'default':'pointer',zIndex:2,boxShadow:active.has(midi)?'none':'2px 5px 10px rgba(0,0,0,.85)',transition:'background .05s'}}/>
          ))}
        </div>
      </div>

      {showLib && (
        <div onClick={()=>setShowLib(false)} style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.96)',zIndex:9999,padding:'24px 16px',overflowY:'auto',backdropFilter:'blur(8px)'}}>
          <div onClick={e=>e.stopPropagation()} style={{maxWidth:520,margin:'0 auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18,paddingBottom:12,borderBottom:'1px solid rgba(201,168,76,.2)'}}>
              <div>
                <div style={{fontSize:'1rem',letterSpacing:'.15em',color:'rgba(201,168,76,.9)'}}>AI Song Library</div>
                <div style={{fontSize:'.55rem',letterSpacing:'.2em',opacity:.4,marginTop:3}}>{AI_LIBRARY.length} pieces · tap to play</div>
              </div>
              <button onClick={()=>setShowLib(false)} style={{background:'transparent',border:'1px solid rgba(201,168,76,.3)',color:'rgba(201,168,76,.8)',padding:'8px 14px',borderRadius:2,fontSize:'.7rem',cursor:'pointer'}}>✕ close</button>
            </div>
            {['Classical','Modern / Film','Pop / Singer-Songwriter','Anime / Game'].map(cat=>{
              const songs=AI_LIBRARY.filter(s=>s.category===cat);
              if(!songs.length)return null;
              return (
                <div key={cat} style={{marginBottom:22}}>
                  <div style={{fontSize:'.6rem',letterSpacing:'.25em',opacity:.5,textTransform:'uppercase',marginBottom:8,color:'rgba(210,150,255,.8)'}}>{cat}</div>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {songs.map(s=>(
                      <button key={s.title} onClick={()=>{setShowLib(false);aiMidi(s.keys[0]);}}
                        style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(201,168,76,.2)',borderRadius:2,padding:'10px 14px',color:'rgba(207,197,168,.9)',fontSize:'.7rem',cursor:'pointer',textAlign:'left',fontFamily:'inherit',transition:'background .15s'}}
                        onTouchStart={e=>{e.currentTarget.style.background='rgba(201,168,76,.15)';}}
                        onTouchEnd={e=>{e.currentTarget.style.background='rgba(255,255,255,0.03)';}}>
                        ♩  {s.title}
                        <span style={{float:'right',opacity:.4,fontSize:'.6rem',letterSpacing:'.1em'}}>{s.notes.length} notes</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
