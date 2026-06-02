import * as Tone from "tone";
import { useState, useRef, useEffect, useCallback, useMemo, memo, Fragment } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// §1  CONSTANTS & MATH UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
const PHI = 1.6180339887;
const IMG_TARGET_MS = 120000; // fallback duration only; real length now scales with image energy (~1:30–2:40)
const CWIN = 55;
const KB_WIN = 65;
const DN = 25, DB = 16, DH = 26;
const GOLD = '#c9a84c';
// ── Feature flag: first-visit onboarding (v3 "show, don't tell") ─────────────
// When true, first-time visitors see a hero canvas preview ("Liebestraum × Miró")
// with a big play button instead of the standard setup tile grid. After the
// sample plays — or the user taps "skip" — we set localStorage so they never
// see it again. Setting this to `false` disables the entire onboarding flow
// instantly: the app falls back to the current setup screen for everyone. No
// other code paths change.
const ONBOARDING_V3 = true;
// ── Playful design tokens (added v2.6.0) ────────────────────────────────────
// Layered dark surfaces + bright cream text + saturated accents. Used across
// the redesigned control panel. Buttons lift + glow on interaction.
//
// GOLD ROLES (two intentional golds — keep them distinct, don't blend):
//   • goldQuiet  #c9a84c (= GOLD, = rgba(201,168,76,a)) — the calm ochre used
//     for borders, hairlines, muted labels, resting UI. The workhorse gold.
//   • gold       #f0c040 — the BRIGHT gold reserved for emphasis: the wordmark,
//     active/primary accents, focus glow. Use sparingly so it stays special.
//   • gold2      #ffd96e — the lightest gold, for glow/hover highlights only.
// Helper goldA(a) builds the quiet-gold rgba so call sites stop hand-writing
// rgba(201,168,76,a) (351 of them) and can't drift.
const PF = {
  bg:'#0e0c14', card:'#161320', card2:'#1d1929', card3:'#231f31',
  gold:'#f0c040', gold2:'#ffd96e', goldQuiet:'#c9a84c', goldQuietRGB:'201,168,76',
  cream:'#f2eee8', muted:'rgba(242,238,232,0.42)', faint:'rgba(242,238,232,0.1)',
  blue:'#5b9cf6', purple:'#a97ff5', green:'#4ecb8d', orange:'#f47c3c', pink:'#f06292',
};
const goldA = (a)=>`rgba(${PF.goldQuietRGB},${a})`;
// Built once at module load — referenced by the render so the style string
// isn't re-interpolated on every React render (which thrashes during playback
// when setDisp fires many times per second).
const PF_STYLE = `
        @keyframes pf-fadeUp { from { opacity:0; transform:translateY(14px);} to { opacity:1; transform:translateY(0);} }
        .pf-fade { animation: pf-fadeUp .5s ease both; }
        .pf-tool { transition: all .18s; }
        .pf-tool, .pf-morph, .pf-vary, .pf-lift { -webkit-tap-highlight-color:transparent; }
        .pf-tool:focus, .pf-tool:focus-visible { outline:none!important; }
        .pf-tool .pf-glyph { transition: transform .18s; display:inline-block; }
        .pf-lift { transition: all .18s; }
        .pf-chip { transition: all .18s; }
        /* All hover affordances gated to real pointers. On touch screens :hover
           "sticks" after a tap — which made SOURCE tiles (Score/Image) keep their
           coloured glow as if active. (hover:hover) keeps lifts/glows for mouse
           users only; touch taps no longer leave a tile stuck highlighted. */
        @media (hover:hover) and (pointer:fine) {
        .pf-tool:hover { transform: translateY(-2px); }
        .pf-tool:hover .pf-glyph { transform: scale(1.2); }
        .pf-lift:hover { transform: translateY(-1px); }
        .pf-chip:hover { transform: translateY(-1px); }
        .pf-dice:hover { transform: rotate(20deg) translateY(-1px) !important; }
        .pf-midi:hover  { background:rgba(91,156,246,.12)!important; border-color:${PF.blue}!important; box-shadow:0 4px 16px rgba(91,156,246,.22); }
        .pf-audio:hover { background:rgba(244,124,60,.12)!important; border-color:${PF.orange}!important; box-shadow:0 4px 16px rgba(244,124,60,.22); }
        .pf-score:hover { background:rgba(169,127,245,.12)!important; border-color:${PF.purple}!important; box-shadow:0 4px 16px rgba(169,127,245,.22); }
        .pf-image:hover { background:rgba(78,203,141,.12)!important; border-color:${PF.green}!important; box-shadow:0 4px 16px rgba(78,203,141,.22); }
        .pf-compose:hover { transform: translateY(-2px); box-shadow:0 5px 18px rgba(78,203,141,.25); }
        .pf-mic:hover { transform: translateY(-2px); box-shadow:0 5px 18px rgba(240,106,166,.22); }
        .pf-morph:hover { transform: translateY(-1px); box-shadow:0 4px 16px rgba(169,127,245,.4); }
        .pf-vary:hover { transform: translateY(-1px); box-shadow:0 4px 16px rgba(244,124,60,.4); }
        .pf-moodcta:hover { border-color:${PF.gold2}!important; transform: translateY(-1px); box-shadow:0 6px 24px rgba(240,192,64,.18); }
        .pf-tab:hover:not(.pf-tab-on) { background:${PF.card3}!important; color:${PF.cream}!important; }
        .pf-artist:hover:not(.pf-artist-on) { color:${PF.cream}!important; border-color:rgba(242,238,232,.25)!important; transform:translateY(-1px); }
        }
        /* Mosaic while Shuffle is drawing an artist: stays muted/grey, no hover
           lift — it is NOT the active choice (the drawn style's outline is). */
        .pf-art-shuf, .pf-art-shuf:hover { color:${PF.muted}!important; border-color:rgba(242,238,232,.08)!important; transform:none!important; box-shadow:none!important; }
        .pf-artist, .pf-dice { outline:none!important; -webkit-tap-highlight-color:transparent; }
        .pf-artist:focus, .pf-artist:focus-visible, .pf-dice:focus, .pf-dice:focus-visible { outline:none!important; box-shadow:none; }
        .pf-artist-on:focus, .pf-artist-on:focus-visible { box-shadow:0 3px 10px rgba(240,192,64,.3)!important; }
        /* Fullscreen exit button: on MOBILE only, hang above the canvas when
           immersive (in the surrounding dark area). On desktop the shell media
           query below keeps the button inside the canvas (default top:8). */
        .pf-fs-btn-immersive { top: -44px !important; }
        /* ── Desktop mobile-shell ─────────────────────────────────────────────
           Paintiano is designed mobile-first. On wider screens we frame the
           whole app inside a phone-shaped column centered on a dark stage —
           same pixel-perfect mobile UI, just inset with rounded corners and a
           shadow. App layout/JSX is unchanged; this is purely a CSS frame.
           Mobile (<769px): no changes, app fills the viewport edge-to-edge. */
        @media (min-width: 769px) {
          html, body {
            background: #050507 !important;
            min-height: 100vh;
            height: 100vh;
            overflow: hidden;
          }
          body {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 0;
          }
          #root {
            width: min(480px, calc(100vw - 32px));
            height: 100vh;
            max-height: 100vh;
            background: radial-gradient(ellipse at 50% -10%, #0e0b16, #06060c 55%);
            box-shadow: 0 18px 60px rgba(0,0,0,.6), 0 0 0 1px rgba(242,238,232,.06);
            overflow-y: auto;
            overflow-x: hidden;
            position: relative;
            scrollbar-width: thin;
            scrollbar-color: rgba(201,168,76,.35) transparent;
          }
          #root::-webkit-scrollbar { width: 6px; }
          #root::-webkit-scrollbar-track { background: transparent; }
          #root::-webkit-scrollbar-thumb { background: rgba(201,168,76,.3); border-radius: 3px; }
          #root::-webkit-scrollbar-thumb:hover { background: rgba(201,168,76,.5); }
          /* The Paintiano root div has min-height:100vh which would overflow
             the shell on desktop. Override to fit the shell instead. */
          #root > div[style*="minHeight:100vh"],
          #root > div:first-child {
            min-height: auto !important;
          }
          /* On desktop, keep the fullscreen exit button inside the canvas —
             the mobile "hang above" position would land outside the shell. */
          .pf-fs-btn-immersive { top: 8px !important; }
        }
`;
// Anthropic model used by aiCompose. Pinned to the version prescribed by the
// "API in artifacts" feature; bump here when Anthropic publishes a newer one.
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
// ── Defensive JSON extraction for AI responses ──────────────────────────────
// Model output can be wrapped in ```json fences, prefixed with prose, or — most
// commonly — TRUNCATED when the response hits max_tokens (a long 8-language
// title pushes the notes array past the cap, cutting it mid-object). A naive
// /\{[\s\S]*\}/ + JSON.parse then throws and the user sees a false "not found".
// This tries, in order: (1) direct parse, (2) fenced/first-object slice,
// (3) repair a truncated tail by trimming to the last complete array element
// and closing any open brackets. Returns the parsed object or null.
function extractAiJson(raw){
  if(!raw || typeof raw!=='string') return null;
  let s = raw.trim();
  // Strip ```json … ``` or ``` … ``` fences if present.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if(fence) s = fence[1].trim();
  // Narrow to the first {...} span if there's surrounding prose.
  const open = s.indexOf('{');
  if(open>0) s = s.slice(open);
  // 1) straight parse
  try{ return JSON.parse(s); }catch(_){}
  // 2) greedy first-object slice
  const m = s.match(/\{[\s\S]*\}/);
  if(m){ try{ return JSON.parse(m[0]); }catch(_){} }
  // 3) repair a truncated tail: cut back to the last complete array element
  //    (a `]` or a `}` or a number/quote close) and re-balance brackets.
  let t = s;
  // drop a dangling partial token after the last comma/closer
  const lastClose = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
  if(lastClose>0) t = t.slice(0, lastClose+1);
  // count unclosed brackets and append the right closers
  let curly=0, square=0, inStr=false, esc=false;
  for(const ch of t){
    if(esc){ esc=false; continue; }
    if(ch==='\\'){ esc=true; continue; }
    if(ch==='"'){ inStr=!inStr; continue; }
    if(inStr) continue;
    if(ch==='{') curly++; else if(ch==='}') curly--;
    else if(ch==='[') square++; else if(ch===']') square--;
  }
  if(inStr) t+='"';
  while(square-->0) t+=']';
  while(curly-->0) t+='}';
  try{ return JSON.parse(t); }catch(_){}
  return null;
}
// Body 5: baked AI result for the built-in "mood from image" sample. Generated
// once on the deployed app and frozen here 1:1 so the sample plays offline and
// always free — _imgMoodCacheGet returns this whenever the hash matches. The
// hash is the _imgMoodHash of the downsampled sample image.
const SAMPLE_IMGMOOD = { hash: 0, result: {"title":"A Dream In Crimson","tempo":72,"key":"A minor","notes":[["A2",2,0,52],["E2",2,2,48],["A2",2,4,54],["F2",2,6,50],["C3",2,8,52],["G2",2,10,48],["A2",2,12,55],["E3",2,14,50],["F2",2,16,52],["C3",2,18,49],["D3",2,20,53],["A2",2,22,50],["E2",2,24,48],["A2",2,26,56],["A2",2,28,54],["E2",2,30,50],["C4",1,0,44],["E4",1,2,42],["C4",1,4,46],["A3",1,6,43],["E4",1,8,44],["D4",1,10,42],["C4",1,12,46],["G3",1,14,43],["A3",1,16,44],["E4",1,18,42],["F4",1,20,45],["E4",1,22,43],["C4",1,24,42],["E4",1,26,46],["A3",2,28,44],["C4",2,30,42],["A5",0.5,0,84],["C6",0.5,0.5,90],["B5",1,1,86],["E5",1,2,80],["D5",0.5,3,70],["E5",0.5,3.5,74],["A5",0.5,4,80],["C6",0.5,4.5,86],["B5",1,5,82],["E5",1,6,76],["F5",1,7,72],["E5",1,8,68],["C5",0.5,9,66],["D5",0.5,9.5,70],["E5",1,10,74],["A4",1,11,64],["A5",0.5,12,86],["C6",0.5,12.5,92],["B5",1,13,88],["E5",1,14,82],["G5",0.5,15,72],["A5",0.5,15.5,78],["E5",1,16,70],["C5",1,17,66],["E5",0.5,18,72],["F5",0.5,18.5,76],["E5",1,19,70],["D5",1,20,68],["C5",1,21,64],["A5",0.5,22,82],["C6",0.5,22.5,88],["B5",1,23,84],["E5",1,24,78],["E5",1,25,72],["D5",0.5,26,68],["C5",0.5,26.5,66],["A4",1,27,60],["E5",1,28,58],["C5",1,29,54],["A4",2,30,50]]} };
const S_BASE = "https://cdn.jsdelivr.net/gh/Tonejs/audio@master/salamander/";
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
// Spectral mode = chromatic rainbow. Each pitch class gets an evenly-spaced
// hue (30° steps) so the 12 PCs span the entire color wheel without gaps or
// duplicates. Replaces the previous wavelength-folding approach which
// clustered D#/E/F at violet and F#/G/G# at red with a discontinuous jump.
const SPEC_HUE=Array.from({length:12},(_,pc)=>pc*30);
const specCol=(m,v=100)=>{const h=SPEC_HUE[m%12];const s=75+(v/127)*15;const[r,g,b]=fromHsl(h,s,octL(m));return[r,g,b,0.65+(v/127)*0.35];};

// Fast RGBA string helper — avoids repeated template-string + toFixed allocations
// in the hot inner draw loops. Rounds alpha to 3 decimal places inline.
// Guards against non-finite alpha (undefined/NaN) which would produce an invalid
// CSS color string and silently blank the fill — clamps to a valid 0..1 range.
const _rgbaStr=(r,g,b,a)=>{
  let A=Math.round((a*1000))/1000;
  if(!Number.isFinite(A)) A=1;
  else if(A<0) A=0; else if(A>1) A=1;
  return `rgba(${r|0},${g|0},${b|0},${A})`;
};
const _rgbStr=(r,g,b)=>`rgb(${r|0},${g|0},${b|0})`;
const hexToRgb=(hex)=>{
  if(typeof hex!=='string')return[128,128,128];
  let h=hex.replace('#','');
  if(h.length===3)h=h.split('').map(c=>c+c).join('');
  if(!/^[0-9a-f]{6}$/i.test(h))return[128,128,128];
  return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
};
// Convert [r,g,b] (0-255) into '#rrggbb' lowercase hex string.
const rgbToHex=([r,g,b])=>'#'+[r,g,b].map(x=>Math.round(Math.max(0,Math.min(255,x))).toString(16).padStart(2,'0')).join('');

// Custom mode color: anchor on user's picked color per pitch class, then apply
// subtle octave modulation (±15% lightness vs the default ±36% of Harmony/
// Spectral) and gentle velocity modulation (saturation -10..+5%). The user's
// chosen colour is faithfully represented at the mid-octave/mezzo-velocity
// anchor point; surrounding notes shift slightly so octave and velocity remain
// visually meaningful without overwhelming the user's palette intent.
const customCol=(m,v=100,palette)=>{
  const pc=m%12;
  const hex=(palette&&palette[pc])||'#888888';
  const[r,g,b]=hexToRgb(hex);
  const[h0,s0,l0]=toHsl(r,g,b);
  // Octave: shift lightness toward 50% as anchor, then offset by octave delta.
  // Anchor lightness on user pick at MIDI 60 (middle C); ±15% across 8 octaves.
  const octDelta=(Math.max(0,Math.min(8,Math.floor(m/12)-1))-5)*3;  // -15..+9
  const l=Math.max(8,Math.min(92,l0+octDelta));
  // Velocity: gentle saturation modulation around user's chosen saturation.
  // BUT if the swatch is greyscale (s0===0, e.g. the unset #888888 default or a
  // deliberately grey pick), keep it grey — adding saturation to a hue-less
  // color resurrects hue 0 (red) and renders as stray pink. Grey stays grey.
  const velMod=(v/127-0.5)*15;  // -7.5..+7.5
  const s=s0<=0.5 ? 0 : Math.max(0,Math.min(100,s0+velMod));
  const[rr,gg,bb]=fromHsl(h0,s,l);
  return[rr,gg,bb,0.7+(v/127)*0.3];
};

// B/W mode: pitch class drives lightness chromatically — C is darkest, B is
// lightest, 12 evenly-spaced shades from black to white. Octave provides a
// subtle additional ±10% lightness offset so the same pitch class at different
// octaves is visually distinguishable. Velocity controls alpha (existing
// pattern). Saturation = 0 → pure grayscale, no colour.
const BW_LIGHT=Array.from({length:12},(_,pc)=>12+(pc/11)*76);
const bwCol=(m,v=100)=>{
  const pc=m%12;
  const octDelta=(Math.max(0,Math.min(8,Math.floor(m/12)-1))-5)*2;  // -10..+6
  const l=Math.max(6,Math.min(94,BW_LIGHT[pc]+octDelta));
  const[r,g,b]=fromHsl(0,0,l);
  return[r,g,b,0.7+(v/127)*0.3];
};

// ─────────────────────────────────────────────────────────────────────────────
// §2  MIDI / MUSIC-XML / AUDIO PARSERS
// ─────────────────────────────────────────────────────────────────────────────
function parseMidi(buf){
  const d=new Uint8Array(buf);let p=0;
  const u8=()=>d[p++];
  const u16=()=>{const v=(d[p]<<8)|d[p+1];p+=2;return v;};
  const u32=()=>{const v=(d[p]<<24)|(d[p+1]<<16)|(d[p+2]<<8)|d[p+3];p+=4;return v;};
  const vl=()=>{let v=0,b;do{b=u8();v=(v<<7)|(b&0x7f);}while(b&0x80);return v;};
  // Validate "MThd" header before parsing — otherwise a non-MIDI file produces
  // garbage track counts and divisions, then loops billions of times reading
  // junk bytes. Fail cleanly with a useful message instead.
  if(d.length<14||d[0]!==0x4d||d[1]!==0x54||d[2]!==0x68||d[3]!==0x64){
    throw new Error('Not a MIDI file (missing MThd header).');
  }
  p+=4;u32();u16();
  const nT=u16(),div=u16();
  const temps=[{tick:0,uspb:500000}],raw=[],skipped=[];
  for(let t=0;t<nT;t++){
    // Scan forward to next MTrk header
    while(p+4<d.length&&!(d[p]===0x4d&&d[p+1]===0x54&&d[p+2]===0x72&&d[p+3]===0x6b))p++;
    if(p+8>d.length)break;
    p+=4;
    const tLen=u32(),tEnd=Math.min(p+tLen,d.length);
    const trackStart=p;
    try{
      let tick=0,st=0,held={};
      while(p<tEnd){
        tick+=vl();
        let s=d[p];if(s>=0x80){st=s;p++;}
        const tp=st&0xf0;
        if(tp===0x90){const pitch=u8(),vel=u8();if(vel>0)held[pitch]=[tick,vel];else if(held[pitch]){raw.push([pitch,held[pitch][0],held[pitch][1],tick]);delete held[pitch];}}
        else if(tp===0x80){const pitch=u8();u8();if(held[pitch]){raw.push([pitch,held[pitch][0],held[pitch][1],tick]);delete held[pitch];}}
        else if(st===0xff){const mt=u8(),ml=vl();if(mt===0x51&&ml===3){const uspb=(u8()<<16)|(u8()<<8)|u8();temps.push({tick,uspb});}else p+=ml;}
        else if(st===0xf0||st===0xf7){p+=vl();}
        else if(tp===0xb0||tp===0xe0||tp===0xa0){u8();u8();}
        else if(tp===0xc0||tp===0xd0){u8();}
      }
      // Flush any held notes at track end
      for(const pi in held)raw.push([parseInt(pi),held[pi][0],held[pi][1],tEnd]);
    }catch(err){
      skipped.push(t+1); // 1-based track number for the user
    }
    p=tEnd; // always advance past the track regardless
  }
  raw.sort((a,b)=>a[1]-b[1]);
  temps.sort((a,b)=>a.tick-b.tick);
  return{raw,div,temps,skipped};
}
function t2ms(ticks,div,temps){let ms=0,prev=0,uspb=500000;for(const{tick:tc,uspb:u}of temps){if(tc>=ticks)break;ms+=(tc-prev)*uspb/div/1000;prev=tc;uspb=u;}return ms+(ticks-prev)*uspb/div/1000;}

// Shared normalizer: takes a flat array of {m, startMs, durMs, v}, groups
// simultaneous notes (within CWIN ms) into chord events, and computes durQ.
// Both toChords (MIDI ticks) and noteArr2events (beat/BPM) resolve their
// format first, then delegate here.
function groupToEvents(flat,quarterMs){
  if(!flat.length)return[];
  flat.sort((a,b)=>a.startMs-b.startMs);
  const out=[];let i=0;
  while(i<flat.length){
    const bt=flat[i].startMs,g=[];
    while(i<flat.length&&flat[i].startMs-bt<=CWIN){g.push(flat[i]);i++;}
    const maxDur=Math.max(...g.map(n=>n.durMs));
    out.push({n:g.map(({m,v,durMs})=>({m,v,durMs})),startMs:bt,durQ:snapDurQ(maxDur/(quarterMs||500))});
  }
  return out;
}

function toChords(raw,div,temps){
  if(!raw.length)return[];
  const uspb=temps[temps.length-1]?.uspb||500000,quarterMs=uspb/1000;
  const flat=raw.map(([m,st,v,et])=>({m,v,startMs:t2ms(st,div,temps),durMs:Math.max(80,t2ms(et,div,temps)-t2ms(st,div,temps))}));
  return groupToEvents(flat,quarterMs);
}

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

// Cache of pitch-class arrays per scale key. There are only 8 possible scales
// (PAINT_SCALE_KEYS), each maps to a stable PC array. Pre-computing once at
// module load avoids 88+ per-render `.map()` allocations during keyboard render
// (paintSnapMidi → paintScalePCs runs per-key) and the 5-15Hz playback tick.
const _PAINT_SCALE_PC_CACHE = {};
function paintScalePCs(scaleKey){
  if(scaleKey in _PAINT_SCALE_PC_CACHE) return _PAINT_SCALE_PC_CACHE[scaleKey];
  const s = PAINT_SCALES[scaleKey];
  const pcs = (!s || !s.scale) ? null : s.scale.map(o => (o + s.root) % 12);
  _PAINT_SCALE_PC_CACHE[scaleKey] = pcs;
  return pcs;
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

// Decompress a .mxl (zipped MusicXML) ArrayBuffer to the inner XML text.
// Uses inline ZIP parsing + browser's built-in DecompressionStream — no library, ~50 LOC.
// Works on iOS Safari 16.4+, Chrome 80+, Firefox 113+.
async function mxlToXml(buf){
  const bytes=new Uint8Array(buf);
  const dv=new DataView(buf);
  // Find End-of-Central-Directory record (EOCD signature 0x06054b50), scanning from file end backwards
  let eocd=-1;
  for(let i=bytes.length-22;i>=0&&i>=bytes.length-65557;i--){
    if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;}
  }
  if(eocd<0) throw new Error('Not a valid .mxl (no EOCD record)');
  const cdEntries=dv.getUint16(eocd+10,true);
  const cdOffset=dv.getUint32(eocd+16,true);
  // Walk the central directory
  const files=[];
  let p=cdOffset;
  for(let i=0;i<cdEntries;i++){
    if(dv.getUint32(p,true)!==0x02014b50) throw new Error('Corrupt .mxl central directory');
    const method=dv.getUint16(p+10,true);
    const compSize=dv.getUint32(p+20,true);
    const fnameLen=dv.getUint16(p+28,true);
    const extraLen=dv.getUint16(p+30,true);
    const commentLen=dv.getUint16(p+32,true);
    const lfh=dv.getUint32(p+42,true);
    const name=new TextDecoder().decode(bytes.slice(p+46,p+46+fnameLen));
    files.push({name,method,compSize,lfh});
    p+=46+fnameLen+extraLen+commentLen;
  }
  // Pick the main score file: prefer .musicxml or .xml not in META-INF.
  // If META-INF/container.xml exists we could parse it for the rootfile path, but the heuristic below works for all musescore.com / MuseScore Studio exports.
  const main=files.find(f=>!f.name.startsWith('META-INF')&&(f.name.endsWith('.musicxml')||f.name.endsWith('.xml')))
           ||files.find(f=>f.name.endsWith('.xml'));
  if(!main) throw new Error('No score file inside .mxl');
  // Local file header → actual data offset
  if(dv.getUint32(main.lfh,true)!==0x04034b50) throw new Error('Corrupt .mxl file header');
  const lfnLen=dv.getUint16(main.lfh+26,true);
  const lexLen=dv.getUint16(main.lfh+28,true);
  const dataAt=main.lfh+30+lfnLen+lexLen;
  const compressed=bytes.slice(dataAt,dataAt+main.compSize);
  let xmlBytes;
  if(main.method===0){
    // Stored, no compression
    xmlBytes=compressed;
  }else if(main.method===8){
    // Deflate (raw, no zlib header)
    if(typeof DecompressionStream==='undefined'){
      throw new Error('This browser is too old to read compressed .mxl. Update Safari/Chrome, or re-export as uncompressed .musicxml.');
    }
    const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    xmlBytes=new Uint8Array(await new Response(stream).arrayBuffer());
  }else{
    throw new Error('Unsupported .mxl compression method: '+main.method);
  }
  return new TextDecoder('utf-8').decode(xmlBytes);
}

// MusicXML parser — converts MuseScore/Finale/Dorico XML exports into Paintiano events.
// Reads pitches, durations, voices, chords, multi-staff piano directly — no OMR guessing.
// Accepts uncompressed .musicxml / .xml only (compressed .mxl needs unzip and is not supported here).
function parseMusicXml(xmlText){
  const doc=new DOMParser().parseFromString(xmlText,'application/xml');
  const err=doc.querySelector('parsererror');
  if(err) throw new Error('Invalid MusicXML: '+(err.textContent||'').replace(/\s+/g,' ').slice(0,80));
  if(!doc.querySelector('score-partwise, score-timewise')) throw new Error('Not a MusicXML score (no <score-partwise> root). If you exported .mxl, re-export as uncompressed .musicxml.');
  const stepSemi={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  const notes=[]; // [{startQ, durQ, midi, vel}]
  let lastNoteStartQ=0;
  // Dynamic markings live in <direction><direction-type><dynamics><X/></dynamics>
  // and propagate forward until the next dynamic. Legacy exports sometimes put
  // them inside <note><notations><dynamics> — we keep that as a per-note fallback.
  const DYN_MAP={ppp:30,pp:42,p:55,mp:70,mf:85,f:100,ff:115,fff:115,ffff:115,sf:110,sfz:115,sffz:115,fz:108,rfz:108,fp:80,pf:90,n:85};
  const clampVel=v=>Math.max(30,Math.min(115,v));
  const readDynamicsFrom=(parent)=>{
    if(!parent)return null;
    const d=parent.querySelector(':scope > dynamics');
    if(!d)return null;
    const child=d.children[0]?.tagName;
    if(child&&DYN_MAP[child.toLowerCase()]!=null) return DYN_MAP[child.toLowerCase()];
    return null;
  };
  for(const part of doc.querySelectorAll('score-partwise > part')){
    let divisions=4;
    let curTimeQ=0;
    let curVel=85; // neutral mf at the start of each part
    for(const measure of part.querySelectorAll(':scope > measure')){
      for(const elem of measure.children){
        const tag=elem.tagName;
        if(tag==='attributes'){
          const div=elem.querySelector(':scope > divisions');
          if(div) divisions=parseInt(div.textContent)||divisions;
        }else if(tag==='direction'){
          // Dynamic marking — update the running velocity for subsequent notes
          const dt=elem.querySelector(':scope > direction-type');
          const newVel=readDynamicsFrom(dt);
          if(newVel!=null) curVel=clampVel(newVel);
        }else if(tag==='sound'){
          // <sound dynamics="N"> is an explicit playback-velocity override (0–127 in MusicXML;
          // 100 = mf in the spec). MuseScore emits these alongside markings.
          const sdAttr=elem.getAttribute('dynamics');
          if(sdAttr){const n=parseFloat(sdAttr); if(isFinite(n)) curVel=clampVel(Math.round(n*0.85));}
        }else if(tag==='note'){
          if(elem.querySelector(':scope > grace')) continue; // skip grace notes
          const isChord=elem.querySelector(':scope > chord')!==null;
          const isRest=elem.querySelector(':scope > rest')!==null;
          const durEl=elem.querySelector(':scope > duration');
          const duration=durEl?parseFloat(durEl.textContent):0;
          const durQ=duration/divisions;
          if(isRest){
            if(!isChord) curTimeQ+=durQ;
            continue;
          }
          const pitchEl=elem.querySelector(':scope > pitch');
          if(!pitchEl){
            if(!isChord) curTimeQ+=durQ;
            continue;
          }
          const step=pitchEl.querySelector(':scope > step')?.textContent||'C';
          const octave=parseInt(pitchEl.querySelector(':scope > octave')?.textContent||'4');
          const alter=parseFloat(pitchEl.querySelector(':scope > alter')?.textContent||'0');
          const midi=Math.round((octave+1)*12+(stepSemi[step]||0)+alter);
          // Velocity: running dynamic (from <direction>), with a per-note
          // override if the legacy notations/dynamics path carries one.
          let vel=curVel;
          const localDyn=readDynamicsFrom(elem.querySelector(':scope > notations'));
          if(localDyn!=null) vel=clampVel(localDyn);
          // For chord notes: same startQ as the previous note in this voice/part; curTimeQ wasn't advanced
          const noteStartQ=isChord?lastNoteStartQ:curTimeQ;
          if(midi>=0&&midi<128) notes.push({startQ:noteStartQ,durQ,midi,vel});
          if(!isChord){
            lastNoteStartQ=curTimeQ;
            curTimeQ+=durQ;
          }
        }else if(tag==='backup'){
          const dur=parseFloat(elem.querySelector(':scope > duration')?.textContent||'0');
          curTimeQ=Math.max(0,curTimeQ-dur/divisions);
        }else if(tag==='forward'){
          const dur=parseFloat(elem.querySelector(':scope > duration')?.textContent||'0');
          curTimeQ+=dur/divisions;
        }
      }
    }
  }
  if(!notes.length) throw new Error('No playable notes found in MusicXML.');
  // Sort by start time, then pitch (for stable chord rendering low→high)
  notes.sort((a,b)=>a.startQ-b.startQ||a.midi-b.midi);
  // Group simultaneous notes into chord events
  const events=[];
  const EPS=0.005;
  for(const n of notes){
    const last=events[events.length-1];
    if(last&&Math.abs(last.startQ-n.startQ)<EPS){
      last.notes.push({m:n.midi,v:n.vel,durMs:Math.round(n.durQ*500)});
      last.maxDurQ=Math.max(last.maxDurQ,n.durQ);
    }else{
      events.push({startQ:n.startQ,maxDurQ:n.durQ,notes:[{m:n.midi,v:n.vel,durMs:Math.round(n.durQ*500)}]});
    }
  }
  // Deduplicate identical pitches within each chord (multi-voice unisons)
  for(const ev of events){
    const seen=new Set();
    ev.notes=ev.notes.filter(n=>seen.has(n.m)?false:(seen.add(n.m),true));
  }
  // Build Paintiano events. Fixed 100 BPM means 600 ms per quarter; durations scale from durQ.
  const QUARTER_MS=600;
  return events.map((c,idx)=>{
    const dms=Math.max(120,Math.round(c.maxDurQ*QUARTER_MS));
    return{
      n:c.notes.map(n=>({m:n.m,v:n.v,durMs:dms})),
      startMs:Math.round(c.startQ*QUARTER_MS),
      idx,
      durQ:snapDurQ(c.maxDurQ)
    };
  });
}
function computeGrid(arg, opts){
  const evs=Array.isArray(arg)?arg:new Array(arg).fill(null).map(()=>({durQ:1}));
  const liveMode = !!(opts && opts.liveMode);
  const totalQ=evs.reduce((s,e)=>s+(e.durQ!=null?e.durQ:1),0);
  // Smart N (column count) picker — minimizes wasted space in the last row.
  // Same as before; this just chooses a column count, not the canvas shape.
  const N0=Math.max(2,Math.ceil(Math.sqrt(totalQ)));
  let bestN=N0, bestScore=-1;
  for(let dn=-1; dn<=2; dn++){
    const n=Math.max(2, N0+dn);
    const r=Math.max(1,Math.ceil(totalQ/n));
    const fillRatio=totalQ/(n*r);
    const score=fillRatio*100 - r*0.5;
    if(score>bestScore){bestScore=score; bestN=n;}
  }
  const N=bestN;
  const rows=Math.max(1,Math.ceil(totalQ/N));
  // Uniform global scale so the totals fill exactly N*rows width-units.
  // Every block keeps the SAME unit width across the canvas (no per-row stretching).
  const scale=(N*rows)/totalQ;
  let BW, BH, CW, CH;
  if(liveMode){
    // LIVE-MODE FIXED CANVAS FRAME — compose / sing / listen.
    // Width AND height stay constant regardless of chord count. Width chosen
    // by viewport (a bit larger than non-live modes since compose paintings
    // tend to be the focal point), height = width/PHI for golden-ratio frame.
    // BH (row height) = CH/rows, so adding chords makes rows thinner without
    // changing canvas shape — the "fixed picture frame" composition surface.
    const vp=(typeof window!=='undefined'&&window.innerWidth)?window.innerWidth:540;
    const targetCW=Math.min(820,Math.max(360,vp-32));
    BW=Math.max(4,Math.floor(targetCW/N));
    CW=N*BW;
    CH=Math.max(140,Math.round(CW/PHI));
    BH=Math.max(4,Math.floor(CH/rows));
  } else {
    // LOADED-MODE GROW CANVAS — MIDI / audio / score / image / mood.
    // Block height = BW * PHI (golden ratio per block), canvas height grows
    // with row count. This is the original behavior pre-treemap experiment;
    // imported content should display naturally per-chord without being
    // squished to fit a fixed frame.
    // Width is bounded to the viewport so the canvas never exceeds the screen,
    // no matter how many columns N a piece has (e.g. a long AI-composed mood).
    // Height still grows with row count (the "grow canvas" behaviour).
    const vpL=(typeof window!=='undefined'&&window.innerWidth)?window.innerWidth:540;
    const targetCWL=Math.min(820,Math.max(320,vpL-32));
    BW=Math.max(2,Math.floor(targetCWL/N));
    BH=Math.round(BW*PHI);
    CW=N*BW;
    CH=rows*BH;
  }
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
  // Ensure the very last segment reaches the right edge (clean bottom-right corner
  // after rounding). Applies to both modes.
  if(cells.length>0){
    const finalSegs=cells[cells.length-1].segments;
    const finalLast=finalSegs[finalSegs.length-1];
    if(finalLast.x+finalLast.w<CW){finalLast.w=CW-finalLast.x;}
    // Live-mode only: stretch the last row vertically to reach the bottom edge.
    // Integer flooring of BH=CH/rows can leave 1-Nrows pixels short; stretch
    // every segment in the last row to cover that gap. In grow-mode the
    // canvas height matches content exactly so no stretch is needed.
    if(liveMode){
      const lastY=finalLast.y;
      if(lastY+finalLast.h<CH){
        const extraH=CH-(lastY+finalLast.h);
        for(const c of cells){
          for(const s of c.segments){
            if(s.y===lastY) s.h+=extraH;
          }
        }
      }
    }
  }
  // Grow-mode: recompute CH from actual cell positions in case rounding
  // created a tiny mismatch. Live-mode keeps the declared CH (fixed frame).
  if(!liveMode && cells.length>0){
    const lastSeg=cells[cells.length-1].segments[cells[cells.length-1].segments.length-1];
    CH=lastSeg.y+BH;
  }
  return{N,BW,BH,CW,CH,cells,rows,totalQ};
}
// ─────────────────────────────────────────────────────────────────────────────
