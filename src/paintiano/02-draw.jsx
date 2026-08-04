// §3  CANVAS DRAW FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────
// Block renderers — five artist-styled mark-making languages plus the
// implicit mosaic default (no selection). drawBlock dispatches per-cell.
//   picasso:   angular cubist shards with thin black contour outlines
//   kusama:    flat color field + many small dots in contrasting color +
//              occasional infinity-net curve
//   vangogh:   ribbons of pure pigment, frayed bristle ends, parallel flow
//   kandinsky: concentric-circle eye + lines + triangles + dot constellations
//   pollock:   per-cell renders the mosaic default; a separate post-pass
//              drawPollockOverlay() paints canvas-wide drips + splatters
//              IGNORING cell boundaries (the key trick that solves the
//              per-cell-architecture limitation)
//   mosaic:    the implicit default — sharp rectangles + thin halo, used when
//              no artist is explicitly selected. Not exposed in the toggle.
// (drawRembrandt remains in the source for reference but is no longer wired
// into the dispatcher — removed from the style picker.)

// Seeded RNG helper — same seed → same marks → no flicker between repaints.
// Uses a module-level state holder rather than a per-call closure so the hot
// painting path doesn't allocate a fresh function per block. Safe because
// JS is single-threaded and the RNG is only used inside drawBlock callees,
// which always re-seed at the start. _RND_STATE[0] is the live seed.
const _RND_STATE = new Uint32Array(1);
const _rnd = () => { _RND_STATE[0] = (_RND_STATE[0]*1664525+1013904223)>>>0; return _RND_STATE[0]/0x100000000; };
function _seedRnd(bx,by,BW,BH){
  _RND_STATE[0] = ((bx*73)^(by*113)^(BW*271)^(BH*947))>>>0;
  return _rnd;
}
// Per-painting seed for per-cell renderers that need a stable whole-painting
// choice (e.g. which Mondrian variant). Set by the paint loop from the session
// seed before drawing cells; read inside drawBlock callees. Single-threaded, so
// safe as a module global like _RND_STATE.
let _artistSeed = 0;
function _setArtistSeed(s){ _artistSeed = s>>>0; }

// ─── Variant cap (free-tier gating, set by 05-main before each paint) ───────
// When non-null, every artist's TOP-LEVEL variant chooser is capped to that
// many variants. Free tier: cap=2 (user sees first 2 of N). Paid tier: null
// (no cap, full N variants). The cap doesn't change the seed — it just narrows
// the set the chooser picks from, so Free's painting is stable across Vary
// within those 2 variants, and Pro sees the full library on the same key.
let _variantCap = null;
function _setVariantCap(n){ _variantCap = (n != null && n > 0) ? (n|0) : null; }
// Apply the cap to a raw N (per-artist variant count). Returns the effective
// variant count to feed into (rnd()*N)|0 chooser logic.
function _capN(N){ return (_variantCap != null && _variantCap < N) ? _variantCap : N; }

// ── Adaptive density helpers (shared by overlay styles) ─────────────────────
// Problem this solves: overlay styles used to hit a hard ceiling mid-track, so
// the back half of a long song would just re-render the same objects (visual
// "flicker" without new content). Now every style declares its own per-chord-
// count maximum, and the visible count grows linearly with playback progress —
// so the LAST chord is always when the painting "completes" its build, no
// matter how long the piece is.
//
// _adaptiveMax(cn, curve): pick the max object count for a song of `cn` chords.
//   `curve` is one of the named density profiles below. Returns an integer ≥ 1.
//
// _progressive(lim, cn, max): how many objects should be visible right now?
//   Linearly interpolates from 1 → max as playback advances from 0 → cn.
const _DENSITY_CURVES = {
  // Each row: [thresholdChords, valueAt]. Values between thresholds linearly
  // interpolate. Above the last threshold: extrapolate at the last slope.
  pollock: [[10,8],[30,25],[80,68],[200,150],[400,260],[800,400]],   // dense web
  pop:     [[10,4],[30,8], [80,14],[200,24], [400,36], [800,52]],    // punchy
  wave:    [[10,2],[30,4], [80,6], [200,8],  [400,11], [800,15]],    // few waves, lots of segments per wave
  comic:   [[10,4],[30,6], [80,9], [200,12], [400,16], [800,20]],    // panels
  gold:    [[10,40],[30,80],[80,140],[200,220],[400,300],[800,400]], // dense texture flecks
  bloom:   [[10,4],[30,10],[80,22],[200,52], [400,90], [800,140]],   // flowers
  bulge:   [[10,1],[30,2], [80,3], [200,5],  [400,7],  [800,10]],    // few big spheres
  spiral:  [[10,4],[30,8], [80,15],[200,30], [400,50], [800,75]],    // forms
  // Default curve for any style that just wants "smoothly grows with length".
  default: [[10,6],[30,15],[80,32],[200,72], [400,120],[800,180]],
};
function _adaptiveMax(cn, curveName){
  const curve = _DENSITY_CURVES[curveName] || _DENSITY_CURVES.default;
  if(cn <= curve[0][0]) return Math.max(1, Math.round(cn * (curve[0][1]/curve[0][0])));
  for(let i=1; i<curve.length; i++){
    const [t0, v0] = curve[i-1], [t1, v1] = curve[i];
    if(cn <= t1){
      const frac = (cn - t0) / (t1 - t0);
      return Math.max(1, Math.round(v0 + (v1 - v0) * frac));
    }
  }
  // Beyond the last threshold: extrapolate at the slope of the final segment.
  const [t0, v0] = curve[curve.length-2], [t1, v1] = curve[curve.length-1];
  const slope = (v1 - v0) / (t1 - t0);
  return Math.max(1, Math.round(v1 + (cn - t1) * slope));
}
function _progressive(lim, cn, max){
  if(!cn || !lim) return 0;
  const t = Math.min(1, lim / cn);
  return Math.max(1, Math.round(max * t));
}

// Velocity -> saturation helper. Lerps an [r,g,b] toward its own grey based on
// note velocity v (0..127). 'floor' is the lowest satKeep when v is tiny -- use
// 0.25 in mosaic/notes (strong effect), 0.55-0.75 in artist styles (subtle, to
// preserve each artist's signature palette). Returns [R,G,B] as integers.
function _velSat(r,g,b,v,floor){
  const vN=Math.max(0,Math.min(1,((v||80)-30)/90));
  const f=(floor==null?0.25:floor);
  const k=f + vN*(1-f);
  const grey=0.299*r+0.587*g+0.114*b;
  return [Math.round(grey+(r-grey)*k), Math.round(grey+(g-grey)*k), Math.round(grey+(b-grey)*k)];
}

// ── Mix palette (energy → saturation/lightness) ────────────────────────────
// Built-in 'fourth axis': phrase energy modulates colour. Energy per chord =
// 0.55*velocity + 0.25*density - 0.20*register, smoothed and normalised across
// the song, then mapped continuously: low energy -> pastel (less saturated,
// lighter), high energy -> dark (more saturated, deeper). Deterministic:
// same song -> same energies -> same painting. Set per chord by the paint loop
// via _setCurE; _energyTint is applied inside gc() so every style inherits it.
// Toggled by the Tone selector in Setup: Normal turns it off (raw palette
// colours), Mix and Pastel both turn it on.
let _curE = 0.5;
let _curOct = 4;   // 0..8, average chord octave (Middle C ≈ 4)
function _setCurE(e){ _curE = (e==null||isNaN(e)) ? 0.5 : e; }
function _getCurE(){ return _curE; }
// ── Song-level colour character (B1) ────────────────────────────────────────
// One number per PAINTING (not per chord): the piece's overall energy, set once
// before paint. gc() reads it to tilt the whole palette's saturation/lightness —
// a loud, heavy piece reads deeper and more saturated, a soft one lighter and
// airier — so two different songs differ in colour mood, not just structure.
// Hue is NEVER touched (blue stays blue); only sat/light shift, and gently.
// 0.5 = neutral (no shift), so pieces with no character / pure modes are
// unchanged. Audio never reads this.
let _songEnergy = 0.5;
function _setSongEnergy(e){ _songEnergy = (e==null||isNaN(e)) ? 0.5 : Math.max(0,Math.min(1,e)); }
function _getSongEnergy(){ return _songEnergy; }
// Set by pixelsToImageEvents; read by the UI so it can badge the current
// image as PHOTO or PAINTING. Null before the first image has been scanned.
let _lastImageIsPhoto = null;
function _setLastImageIsPhoto(v){ _lastImageIsPhoto = (v==null) ? null : !!v; }
function _getLastImageIsPhoto(){ return _lastImageIsPhoto; }
// Set the average octave of the current chord — used by Real mode to nudge
// high-register chords toward Pastel and low-register chords toward Dark
// (regardless of the chord's energy band). Call alongside _setCurE on each
// chord. Accepts either a number (octave 0-8) or a chord object with .n
// notes; if neither is usable, leaves the previous value untouched.
function _setCurOct(chord){
  if(typeof chord === 'number' && !isNaN(chord)){
    _curOct = Math.max(0, Math.min(8, chord));
    return;
  }
  const notes = chord && (chord.n || chord.notes);
  if(!notes || !notes.length) return;
  let sumM = 0, c = 0;
  for(const n of notes){
    const m = n.m != null ? n.m : n;
    if(typeof m !== 'number' || isNaN(m)) continue;
    sumM += m; c++;
  }
  if(!c) return;
  const avgMidi = sumM / c;
  _curOct = Math.max(0, Math.min(8, Math.floor(avgMidi/12) - 1));
}
function _getCurOct(){ return _curOct; }
let _mixOn = false;
function _setMixOn(b){ _mixOn = !!b; }

let _enChords = null;
function _ensureEnergies(chords){
  if(!chords || !chords.length){ _enChords=chords; return; }
  if(chords===_enChords && chords[chords.length-1]._E!==undefined) return;
  _enChords = chords;
  const raw = new Array(chords.length);
  for(let i=0;i<chords.length;i++){
    const ns=(chords[i]&&chords[i].n)||[]; const k=ns.length||1;
    let sv=0, sm=0;
    for(let j=0;j<ns.length;j++){ sv+=(ns[j].v||80); sm+=(ns[j].m||60); }
    const velN=Math.max(0,Math.min(1,((sv/k)-30)/90));
    const densN=Math.max(0,Math.min(1,(k-1)/3));
    const regN=Math.max(0,Math.min(1,((sm/k)-36)/48));
    // Register-aware "perceived energy": treble chords feel airy → pastel band;
    // bass chords feel weighty → dark band. The -0.40 register pull (vs the
    // older -0.20) is strong enough that a high-treble passage drops _E below
    // the pastel threshold (0.20) even at mezzo dynamics, and a low-bass
    // passage at mezzo dynamics pushes above the dark threshold (0.80).
    raw[i]=0.45*velN + 0.20*densN - 0.40*regN + 0.20;     // shift baseline so the range still spans well
  }
  const sm2=new Array(raw.length);
  for(let i=0;i<raw.length;i++){
    const a=(i>0?raw[i-1]:raw[i]), b=raw[i], c=(i<raw.length-1?raw[i+1]:raw[i]);
    sm2[i]=0.25*a+0.5*b+0.25*c;
  }
  let lo=Infinity, hi=-Infinity;
  for(let i=0;i<sm2.length;i++){ if(sm2[i]<lo)lo=sm2[i]; if(sm2[i]>hi)hi=sm2[i]; }
  const span=hi-lo;
  for(let i=0;i<chords.length;i++){ chords[i]._E = (span<1e-6) ? 0.5 : (sm2[i]-lo)/span; }
}

function _energyTint(r,g,b){
  // No-op in all tones. Real tone's Pure↔Pastel mix is fully resolved in
  // gc() (05-main) so the colour reaching this function is already correct.
  // Kept as a pass-through shim so existing call sites stay stable.
  return [Math.round(r),Math.round(g),Math.round(b)];
}

// ── PASTEL mode ─────────────────────────────────────────────────────────────
// Module-level flag toggled by _setPastelOn from 05-main. When on, _pastelTint
// shifts every colour from gc() toward a soft pastel (lower saturation, lifted
// lightness, hue preserved). Applied after _energyTint so dynamics still
// modulate within the pastel range. Same gc() path = all artists + mosaic
// stay visually coherent under pastel.
let _pastelOn = false;
function _setPastelOn(b){ _pastelOn = !!b; }
function _pastelTint(r,g,b){
  if(!_pastelOn) return [Math.round(r),Math.round(g),Math.round(b)];
  const R=r/255, G=g/255, B=b/255;
  const mx=Math.max(R,G,B), mn=Math.min(R,G,B), l=(mx+mn)/2;
  let h=0, sx=0;
  if(mx!==mn){ const dl=mx-mn; sx=l>0.5?dl/(2-mx-mn):dl/(mx+mn);
    if(mx===R)h=(G-B)/dl+(G<B?6:0); else if(mx===G)h=(B-R)/dl+2; else h=(R-G)/dl+4; h/=6; }
  const targetL = 0.80;
  const L = l + (targetL - l) * 0.55;
  const S = sx * 0.45;
  if(S < 0.005){ const g2=Math.round(L*255); return [g2,g2,g2]; }
  const q=L<0.5?L*(1+S):L+S-L*S, pp=2*L-q;
  const h2=(t)=>{ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return pp+(q-pp)*6*t; if(t<1/2)return q; if(t<2/3)return pp+(q-pp)*(2/3-t)*6; return pp; };
  return [Math.round(h2(h+1/3)*255), Math.round(h2(h)*255), Math.round(h2(h-1/3)*255)];
}

// Sharp φ-rectangle look — implicit default when no artist style selected.
function drawBlockMosaic(ctx,bx,by,notes,gc,BW,BH){
  // notes are pre-sorted by caller (drawOne) when possible; sort defensively
  const sorted=notes.length>1?[...notes].sort((a,b)=>b.m-a.m):notes;
  const n=sorted.length,bh=BH/n;
  for(let i=0;i<n;i++){
    const note=sorted[i];
    const[r,g,b,a]=gc(note.m,note.v),y=by+i*bh;
    // Velocity -> saturation: pp fades toward neutral grey, ff stays vivid.
    // Per-voice grey is the note's own luma, so lightness (octave) is preserved.
    // GATED by _mixOn: in Normal tone this modulation is skipped entirely and
    // the raw palette colour from gc() is used, per the Paintiano pure-mode
    // concept (Normal = no dynamic colour modulation of any kind).
    let R, G, B;
    if(_mixOn){
      const vN=Math.max(0,Math.min(1,((note.v||80)-30)/90));
      const satKeep=0.25+vN*0.75;
      const grey=0.299*r+0.587*g+0.114*b;
      R=Math.round(grey+(r-grey)*satKeep);
      G=Math.round(grey+(g-grey)*satKeep);
      B=Math.round(grey+(b-grey)*satKeep);
    } else {
      R=r; G=g; B=b;
    }
    ctx.fillStyle=_rgbaStr(R,G,B,a*.18);
    ctx.fillRect(bx-2,y-2,BW+4,bh+4);
    ctx.fillStyle=_rgbaStr(R,G,B,a);
    ctx.fillRect(bx+.5,y+.5,BW-1,bh-1);
  }
  if(n>1){ctx.fillStyle='rgba(4,4,10,0.7)';for(let i=1;i<n;i++)ctx.fillRect(bx+.5,by+i*bh-.5,BW-1,1);}
}

// Notes mode: instead of colour blocks, write each note's NAME (with octave,
// e.g. "C4", "D♯5") stacked in the cell exactly where the colour voices would
// sit — top voice highest. Text is tinted with the note's own colour (from gc)
// so it still reads harmonically, on the dark canvas. Mood-mode only.
function drawBlockNotes(ctx,bx,by,notes,gc,BW,BH){
  ctx.fillStyle='#04040a';ctx.fillRect(bx-1,by-1,BW+2,BH+2);
  const sorted=notes.length>1?[...notes].sort((a,b)=>b.m-a.m):notes;
  const n=sorted.length,bh=BH/n;
  // Font scales to the per-voice slot height; clamp so it stays legible but fits.
  const fs=Math.max(7,Math.min(bh*0.6,BW*0.34));
  ctx.save();
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font=`600 ${fs}px 'Cormorant Garamond', Georgia, serif`;
  for(let i=0;i<n;i++){
    const note=sorted[i];
    const[r,g,b,a]=gc(note.m,note.v);
    // Velocity -> saturation on the tinted glyph: pp fades, ff burns.
    // Higher floor (0.40) keeps glyphs legible on the dark canvas.
    // GATED by _mixOn: in Normal tone this modulation is skipped and the raw
    // palette colour is used (per Paintiano pure-mode concept).
    let R, G, B;
    if(_mixOn){
      const vN=Math.max(0,Math.min(1,((note.v||80)-30)/90));
      const satKeep=0.40+vN*0.60;
      const grey=0.299*r+0.587*g+0.114*b;
      R=Math.round(grey+(r-grey)*satKeep);
      G=Math.round(grey+(g-grey)*satKeep);
      B=Math.round(grey+(b-grey)*satKeep);
    } else {
      R=r; G=g; B=b;
    }
    const cx=bx+BW/2, cy=by+i*bh+bh/2;
    const name=_midiToName[note.m]||'';
    // subtle dark halo for contrast against any colour, then the tinted glyph
    ctx.fillStyle='rgba(4,4,10,0.85)';
    ctx.fillText(name,cx+0.6,cy+0.6);
    ctx.fillStyle=_rgbaStr(R,G,B,Math.max(0.85,a));
    ctx.fillText(name,cx,cy);
  }
  ctx.restore();
}

// Dim mosaic — same crisp φ-rectangle structure as default, but each voice
// painted at reduced alpha (~50%) so colors are visible but subdued. Used
// as the Pollock substrate: the mosaic provides color context underneath
// without competing with the drip lines on top.

// Pebble mosaic — authentic Byzantine/cobblestone substrate. Each voice slice
// is packed with many small irregular rounded tile-fragments on a hex-offset
// grid. Each pebble is a 5-7 vertex rounded polygon with slight color drift,
// outlined in dark grout. Used as the Pollock substrate so the painting has
// the dense colorful tessellation seen in real mosaic+Pollock pieces.

// Fuzzy mosaic — softened version of the default mosaic substrate, used UNDER
// the Pollock drip overlay. The original mosaic tile structure is suggested
// but not crisply drawn: each voice color is painted as a wide soft radial
// blob centered on its voice slice, bleeding past cell boundaries into
// neighbors. Adjacent colors composite optically — no sharp tile edges,
// no grout grid. Reads as the original mosaic seen through frosted glass.

// Pollock raw-canvas substrate — cream/off-white background that simulates the
// raw unprimed canvas Pollock dripped onto. Each cell paints solid cream over
// the dark canvas, plus a very faint hint of the chord's color so different
// paintings have subtle tonal variation. The cream is the dominant background;
// the dense drip overlay paints on top.
function drawBlockPollockCream(ctx,bx,by,notes,gc,BW,BH){
  // Solid cream base — covers the dark paintiano canvas with raw-canvas off-white.
  // Kept uniform (no per-chord colour tint) so nothing coloured shows through
  // under the drip overlay — the substrate reads as clean raw canvas.
  ctx.fillStyle = '#f2ede0';
  ctx.fillRect(bx-2, by-2, BW+4, BH+4);
}

function drawRembrandt(ctx,bx,by,notes,gc,BW,BH){
  // Rembrandt — chunky, sculptural, BLENDED. Opposite of Van Gogh in nearly
  // every axis:
  // • Strokes overflow cell boundaries (origins can drift 25% past edge)
  // • Length 0.8-2.4× cell long axis; occasional "long sweep" 1.6-2.4×
  // • SFUMATO tone gradient ALONG each stroke (radial gradient: light core
  //   fades to dark edges) — soft transitions, not pure pigment
  // • Faint dark underglow beneath strokes (the Rembrandt ground)
  // • 3-5 weighty strokes per voice
  // • Bristle marks subtle (within the stroke, very low contrast)
  // Result: sculpted, weighty marks that break out of the raster grid while
  // keeping the blended-pigment identity.
  const sorted=[...notes].sort((a,b)=>b.m-a.m),n=sorted.length,bh=BH/n;
  const rnd=_seedRnd(bx,by,BW,BH);
  const rough=(ax,ay,rx,ry)=>{
    const segs=12;
    ctx.beginPath();
    for(let i=0;i<segs;i++){
      const a=(i/segs)*Math.PI*2;
      const j=0.82+rnd()*0.36;
      const x=ax+Math.cos(a)*rx*j;
      const y=ay+Math.sin(a)*ry*j;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.closePath();ctx.fill();
  };
  // 1) Faint dark wash underglow — Rembrandt's signature dark ground
  // covering the cell, providing depth.
  sorted.forEach((note,vi)=>{
    const[r,g,b,a]=gc(note.m,note.v);
    const yOff=by+vi*bh;
    // Dark wash: large radial gradient covering most of the voice slice
    const wR=Math.round(r*0.22), wG=Math.round(g*0.22), wB=Math.round(b*0.22);
    const washGrad=ctx.createRadialGradient(
      bx+BW*0.5, yOff+bh*0.5, 0,
      bx+BW*0.5, yOff+bh*0.5, Math.max(BW,bh)*0.7
    );
    washGrad.addColorStop(0, `rgba(${wR},${wG},${wB},${(a*0.50).toFixed(3)})`);
    washGrad.addColorStop(0.7, `rgba(${wR},${wG},${wB},${(a*0.20).toFixed(3)})`);
    washGrad.addColorStop(1, `rgba(${wR},${wG},${wB},0)`);
    ctx.fillStyle=washGrad;
    ctx.fillRect(bx-bh*0.2, yOff-bh*0.2, BW+bh*0.4, bh+bh*0.4);
  });
  // 2) Strokes — short, stubby, contained, with sfumato gradient
  sorted.forEach((note,vi)=>{
    const[r,g,b,a]=gc(note.m,note.v);
    const yOff=by+vi*bh;
    const chordAngle=rnd()*Math.PI*2;
    const count=3+Math.floor(rnd()*3); // 3-5 strokes per voice — slightly more
    for(let k=0;k<count;k++){
      // Stroke center can drift 25% past cell boundary — breaks the raster
      // grid while preserving Rembrandt's sculptural identity (achieved
      // through the strokes' inner character, not their position).
      const cx=bx+(rnd()*1.25-0.125)*BW;
      const cy=yOff+(rnd()*1.25-0.125)*bh;
      const angle=chordAngle+(rnd()-0.5)*Math.PI/3;
      // Occasional "long sweep" stroke — spans beyond the cell entirely
      const longSweep = rnd() < 0.22;
      const length = longSweep
        ? Math.max(BW,bh)*(1.6+rnd()*0.8)   // 1.6-2.4× — clearly overflows
        : Math.min(BW,bh)*(0.8+rnd()*0.9)*1.4; // 1.1-2.4× short axis
      // Width: thicker — 0.45-0.85× of bh
      const width=bh*(0.45+rnd()*0.4);
      ctx.save();
      ctx.translate(cx,cy);
      ctx.rotate(angle);

      // Shadow — slight offset, dark
      const sR=Math.round(r*0.32), sG=Math.round(g*0.32), sB=Math.round(b*0.32);
      ctx.fillStyle=`rgba(${sR},${sG},${sB},${(a*0.65).toFixed(3)})`;
      rough(2.0, 2.0, length*1.08, width*0.58);

      // Main body — SFUMATO RADIAL GRADIENT (light core → dark edges)
      // This is the key visual change: tone modulates SMOOTHLY within the
      // stroke rather than via discrete bristles. Light hits one spot, fades
      // outward into shadow.
      const lightOffsetX = (rnd()-0.5)*length*0.4; // where the light hits
      const lightOffsetY = (rnd()-0.5)*width*0.3;
      // Lighter core color
      const cR=Math.min(255,Math.round(r+45+rnd()*20));
      const cG=Math.min(255,Math.round(g+45+rnd()*20));
      const cB=Math.min(255,Math.round(b+45+rnd()*20));
      // Edge color (back to base)
      const eR=Math.max(0,Math.round(r-15));
      const eG=Math.max(0,Math.round(g-15));
      const eB=Math.max(0,Math.round(b-15));
      const bodyGrad=ctx.createRadialGradient(
        lightOffsetX, lightOffsetY, 0,
        lightOffsetX, lightOffsetY, Math.max(length, width)*0.65
      );
      bodyGrad.addColorStop(0, `rgba(${cR},${cG},${cB},${(a*0.98).toFixed(3)})`);
      bodyGrad.addColorStop(0.5, `rgba(${r},${g},${b},${(a*0.94).toFixed(3)})`);
      bodyGrad.addColorStop(1, `rgba(${eR},${eG},${eB},${(a*0.88).toFixed(3)})`);
      ctx.fillStyle=bodyGrad;
      rough(0, 0, length/2, width/2);

      // Subtle bristle texture INSIDE the stroke — very low contrast,
      // just enough to break up the smooth gradient without dominating
      const bristles = 2 + Math.floor(rnd()*2); // 2-3 faint bristle marks
      for(let bi=0;bi<bristles;bi++){
        const t=(bi+0.5)/bristles;
        const yB=(t-0.5)*width*0.7;
        const tone=(rnd()-0.5)*15; // very small variance now
        const br=Math.max(0,Math.min(255,Math.round(r+tone)));
        const bg=Math.max(0,Math.min(255,Math.round(g+tone)));
        const bb=Math.max(0,Math.min(255,Math.round(b+tone)));
        ctx.fillStyle=`rgba(${br},${bg},${bb},${(a*0.35).toFixed(3)})`;
        rough(0, yB, length*0.42, width*0.08);
      }

      // Highlight ridge — small, contained, lighter
      const hR=Math.min(255,Math.round(r+70)), hG=Math.min(255,Math.round(g+70)), hB=Math.min(255,Math.round(b+70));
      ctx.fillStyle=`rgba(${hR},${hG},${hB},${(a*0.55).toFixed(3)})`;
      rough(lightOffsetX*0.6, -width*0.28+lightOffsetY*0.5, length*0.35, width*0.10);

      // Specular sparkle — small near-white speck on wet paint
      if(rnd()>0.55){
        ctx.fillStyle=`rgba(255,250,240,${(a*0.55).toFixed(3)})`;
        rough(lightOffsetX*0.5+(rnd()-0.5)*length*0.2, -width*0.22, length*0.06, width*0.035);
      }
      ctx.restore();
    }
  });
}

function drawKusama(ctx,bx,by,notes,gc,BW,BH){
  // Kusama — fields of polka dots on a 3D-shaded "pumpkin" field. Each voice
  // becomes a subtly rounded shape (side shadow + top highlight + vertical
  // rib curves) covered in obsessive small dots in contrasting colors. The
  // pumpkin shading is subtle — dots remain the dominant visual element, but
  // each cell now has the dimensionality of one of her iconic pumpkins.
  //
  // Per voice:
  // • Large flat background field in voice color
  // • Pumpkin shading: directional side shadow + top highlight + 2-3 vertical
  //   rib curves (bezier-curved inward at top and bottom for the fluted look)
  // • 30-60 dots in contrasting color (mostly black or white, sometimes the
  //   RGB complement)
  // • 3 size tiers: large statement (5%), medium (35%), pinpoints (60%)
  // • Sub-grid jitter so dots feel hand-placed, not mechanical
  // • 15% chance per cell: "infinity net" curving line winds through the
  //   dots — Kusama's other signature element
  const sorted=[...notes].sort((a,b)=>b.m-a.m),n=sorted.length,bh=BH/n;
  const rnd=_seedRnd(bx,by,BW,BH);
  // One net per cell, decided up-front
  const drawNet = rnd() < 0.15;

  sorted.forEach((note,vi)=>{
    const[r,g,b,a]=gc(note.m,note.v);
    const yOff = by + vi*bh;

    // === 1. BACKGROUND FIELD — flat voice color, slightly overflowed ===
    ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
    ctx.fillRect(bx-1, yOff-1, BW+2, bh+2);

    // === 1b. PUMPKIN 3D SHADING ===
    // Subtle rounded depth: side shadow + top highlight + 2-3 vertical ribs.
    // Keeps the polka-dot field as the dominant element but gives each cell
    // the subtle dimensionality of one of Kusama's iconic pumpkins.
    // Side shadow direction (left or right) rotates per voice for variety.
    const shadowSide = (vi + Math.floor(rnd()*2)) % 2 === 0 ? 'right' : 'left';
    const sR = Math.round(r*0.65), sG = Math.round(g*0.65), sB = Math.round(b*0.65);
    const shadowGrad = ctx.createLinearGradient(
      shadowSide==='left' ? bx : bx+BW, yOff,
      shadowSide==='left' ? bx+BW*0.55 : bx+BW*0.45, yOff
    );
    shadowGrad.addColorStop(0,    `rgba(${sR},${sG},${sB},${(a*0.55).toFixed(3)})`);
    shadowGrad.addColorStop(0.6,  `rgba(${sR},${sG},${sB},${(a*0.18).toFixed(3)})`);
    shadowGrad.addColorStop(1,    `rgba(${sR},${sG},${sB},0)`);
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(bx-1, yOff-1, BW+2, bh+2);

    // Top highlight — soft arc of slightly lighter tone catching light
    const hR = Math.min(255, Math.round(r*1.20 + 12));
    const hG = Math.min(255, Math.round(g*1.20 + 12));
    const hB = Math.min(255, Math.round(b*1.20 + 12));
    const topGrad = ctx.createLinearGradient(bx, yOff, bx, yOff + bh*0.45);
    topGrad.addColorStop(0,   `rgba(${hR},${hG},${hB},${(a*0.40).toFixed(3)})`);
    topGrad.addColorStop(1,   `rgba(${hR},${hG},${hB},0)`);
    ctx.fillStyle = topGrad;
    ctx.fillRect(bx-1, yOff-1, BW+2, bh*0.50);

    // Vertical rib curves — 2-3 thin darker lines suggesting pumpkin segments.
    // Curved inward at the top and bottom for the "fluted" pumpkin shape.
    const ribCount = 2 + Math.floor(rnd()*2);
    const rR = Math.round(r*0.45), rG = Math.round(g*0.45), rB = Math.round(b*0.45);
    ctx.strokeStyle = `rgba(${rR},${rG},${rB},${(a*0.50).toFixed(3)})`;
    ctx.lineWidth = Math.max(0.8, Math.min(BW,bh)*0.014);
    ctx.lineCap = 'round';
    for(let ri=1; ri<=ribCount; ri++){
      const ribX = bx + BW * (ri/(ribCount+1));
      // Curve inward at top and bottom — bezier with horizontal-pinched control points
      const pinch = BW * 0.04;
      ctx.beginPath();
      ctx.moveTo(ribX, yOff + bh*0.12);
      ctx.bezierCurveTo(
        ribX - pinch, yOff + bh*0.35,
        ribX - pinch, yOff + bh*0.65,
        ribX,          yOff + bh*0.88
      );
      ctx.stroke();
    }

    // === 2. DOT COLOR — per voice, picked from black / white / complement ===
    // The cells visually rotate through dot colors so the field reads
    // distinctly as Kusama (the contrast is the whole point).
    const dotColorRoll = rnd();
    let dotR, dotG, dotB;
    if(dotColorRoll < 0.45){
      // Black dots — most common
      dotR = 12; dotG = 8; dotB = 18;
    } else if(dotColorRoll < 0.80){
      // White dots
      dotR = 245; dotG = 240; dotB = 228;
    } else {
      // Complementary dots — rare but iconic
      dotR = Math.max(0,Math.min(255, 255 - r));
      dotG = Math.max(0,Math.min(255, 255 - g));
      dotB = Math.max(0,Math.min(255, 255 - b));
    }

    // === 3. DOT FIELD ===
    // Density 30-60 dots per voice. Sub-grid arrangement: divide the voice
    // slice into rows × cols and place dots with jitter so they feel hand-
    // placed without overlapping too much.
    const dotCount = 30 + Math.floor(rnd()*30);
    // Choose dominant dot size for this voice (mostly small, occasional big)
    const baseRadius = Math.min(BW, bh) * 0.045;
    for(let k=0; k<dotCount; k++){
      // Size tier: 5% large statement, 35% medium, 60% pinpoint
      const sizeRoll = rnd();
      const radius = sizeRoll < 0.05 ? baseRadius * (2.5 + rnd()*1.5)
                   : sizeRoll < 0.40 ? baseRadius * (1.2 + rnd()*0.6)
                                     : baseRadius * (0.4 + rnd()*0.5);
      // Position with overflow — dots can drift past cell edges slightly
      const cx = bx + (rnd()*1.1 - 0.05) * BW;
      const cy = yOff + (rnd()*1.1 - 0.05) * bh;
      // Slight per-dot alpha variation for hand-painted feel
      const dotA = (a * (0.85 + rnd()*0.15)).toFixed(3);
      ctx.fillStyle = `rgba(${dotR},${dotG},${dotB},${dotA})`;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI*2);
      ctx.fill();
    }
  });

  // === 4. INFINITY NET (15% of cells) ===
  // Single curving line winding across the cell — Kusama's other signature.
  // Drawn in white if cell is darker, black if lighter (auto-contrast).
  if(drawNet){
    // Compute approximate cell brightness from first voice color
    const[r,g,b]=gc(sorted[0].m, sorted[0].v);
    const luma = 0.299*r + 0.587*g + 0.114*b;
    const netColor = luma > 128 ? 'rgba(12,8,18,0.65)' : 'rgba(245,240,228,0.65)';
    ctx.strokeStyle = netColor;
    ctx.lineWidth = Math.max(0.8, Math.min(BW,BH)*0.008);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Wind a sinuous path through the cell with 4-6 control points
    const ptCount = 4 + Math.floor(rnd()*3);
    ctx.beginPath();
    const startX = bx - BW*0.1 + rnd()*BW*0.3;
    const startY = by + rnd()*BH;
    ctx.moveTo(startX, startY);
    for(let pi=0; pi<ptCount; pi++){
      const t1 = (pi+0.5)/ptCount;
      const t2 = (pi+1)/ptCount;
      const cpx = bx + t1*BW*1.15 - BW*0.075;
      const cpy = by + (rnd())*BH;
      const ex = bx + t2*BW*1.15 - BW*0.075;
      const ey = by + (rnd())*BH;
      ctx.quadraticCurveTo(cpx, cpy, ex, ey);
    }
    ctx.stroke();
  }
}

function drawKandinsky(ctx,bx,by,notes,gc,BW,BH){
  // Kandinsky — abstract geometric composition with a varied shape vocabulary.
  // Each voice ALWAYS paints the concentric-circle "eye" (foundation), then
  // randomly picks a subset of 2-3 ACCENT shapes from a larger pool. Different
  // voices/cells pick different combos, giving the painting visible variation
  // instead of every cell looking identical.
  //
  // Per voice:
  // • Foundation: concentric-circle "eye" + optional center dot
  // • 2-3 random accents from the pool of 11 shape types:
  //     straightLines, triangles, dotConstellation, wavyLine, pieSlice,
  //     zigzag, crescent, concentricSquares, halfDisc, star, dashedLine
  //
  // Cell-wide compositional axis means voices share rough diagonal direction
  // so the cell reads coordinated, not chaotic.
  const sorted=[...notes].sort((a,b)=>b.m-a.m),n=sorted.length,bh=BH/n;
  const rnd=_seedRnd(bx,by,BW,BH);
  const cellAxis = (rnd()*Math.PI*2);

  sorted.forEach((note,vi)=>{
    const[r,g,b,a]=gc(note.m,note.v);
    const yOff = by + vi*bh;
    const centerX = bx + BW*0.5;
    const centerY = yOff + bh*0.5;
    const minDim = Math.min(BW, bh);
    const voiceAngle = cellAxis + (vi - n/2) * 0.35 + (rnd()-0.5)*0.4;

    // === FOUNDATION: CONCENTRIC-CIRCLE EYE ===
    const eyeX = centerX + (rnd()-0.5) * BW * 0.45;
    const eyeY = yOff + bh*0.5 + (rnd()-0.5) * bh * 0.4;
    const eyeMaxR = minDim * (0.30 + rnd()*0.20);
    const rings = 3 + Math.floor(rnd()*3);
    for(let ri = rings-1; ri >= 0; ri--){
      const ringR = eyeMaxR * ((ri+1) / rings);
      const tonePattern = ri % 3;
      let rJ, gJ, bJ;
      if(tonePattern === 0){
        const t = -15 - rnd()*15;
        rJ = Math.max(0,Math.min(255,Math.round(r+t)));
        gJ = Math.max(0,Math.min(255,Math.round(g+t)));
        bJ = Math.max(0,Math.min(255,Math.round(b+t)));
      } else if(tonePattern === 1){
        const t = 30 + rnd()*30;
        rJ = Math.max(0,Math.min(255,Math.round(r+t)));
        gJ = Math.max(0,Math.min(255,Math.round(g+t)));
        bJ = Math.max(0,Math.min(255,Math.round(b+t)));
      } else {
        rJ = r; gJ = g; bJ = b;
      }
      ctx.fillStyle = `rgba(${rJ},${gJ},${bJ},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, ringR, 0, Math.PI*2);
      ctx.fill();
    }
    // Center dot (optional)
    if(rnd() < 0.55){
      const centerDotR = eyeMaxR * 0.08;
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(8,4,12,0.95)' : 'rgba(245,238,220,0.95)';
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, centerDotR, 0, Math.PI*2);
      ctx.fill();
    }

    // === SHAPE POOL — accent shape functions ===
    // Each is a small inline function that paints one shape using the voice's
    // colors and the cell-wide axis. They share rnd state for determinism.
    const shapeFns = {
      straightLines: () => {
        const lineCount = 1 + Math.floor(rnd()*2); // 1-2 lines (reduced from 2-4)
        for(let li=0; li<lineCount; li++){
          const lineAngle = voiceAngle + (rnd()-0.5)*Math.PI*0.8;
          const lineLen = Math.max(BW,bh) * (0.7 + rnd()*0.7);
          const ox = eyeX + (rnd()-0.5) * BW * 0.7;
          const oy = eyeY + (rnd()-0.5) * bh * 0.7;
          const cosL = Math.cos(lineAngle), sinL = Math.sin(lineAngle);
          const x1 = ox - cosL * lineLen/2;
          const y1 = oy - sinL * lineLen/2;
          const x2 = ox + cosL * lineLen/2;
          const y2 = oy + sinL * lineLen/2;
          const lineW = minDim * (0.015 + rnd()*0.05);
          const lineRoll = rnd();
          let lineColor;
          if(lineRoll < 0.05){
            lineColor = `rgba(8,4,12,${(a*0.92).toFixed(3)})`;
          } else if(lineRoll < 0.30){
            lineColor = `rgba(245,238,220,${(a*0.85).toFixed(3)})`;
          } else {
            const t = (rnd()-0.5)*50;
            lineColor = `rgba(${Math.max(0,Math.min(255,Math.round(r+t)))},${Math.max(0,Math.min(255,Math.round(g+t)))},${Math.max(0,Math.min(255,Math.round(b+t)))},${a.toFixed(3)})`;
          }
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = lineW;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          // 30% arrow tip
          if(rnd() < 0.30){
            const tipSize = lineW * 4;
            const px = -sinL, py = cosL;
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - cosL*tipSize + px*tipSize*0.6, y2 - sinL*tipSize + py*tipSize*0.6);
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - cosL*tipSize - px*tipSize*0.6, y2 - sinL*tipSize - py*tipSize*0.6);
            ctx.stroke();
          }
        }
      },
      triangle: () => {
        const tx = centerX + (rnd()-0.5) * BW * 0.6;
        const ty = yOff + bh * (0.25 + rnd()*0.5);
        const triSize = minDim * (0.22 + rnd()*0.25);
        const triRot = rnd() * Math.PI * 2;
        const triTone = (rnd()-0.5)*80;
        const trJ = Math.max(0,Math.min(255,Math.round(r+triTone)));
        const tgJ = Math.max(0,Math.min(255,Math.round(g+triTone)));
        const tbJ = Math.max(0,Math.min(255,Math.round(b+triTone)));
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(triRot);
        ctx.beginPath();
        ctx.moveTo(0, -triSize/2);
        ctx.lineTo(triSize/2, triSize/2);
        ctx.lineTo(-triSize/2, triSize/2);
        ctx.closePath();
        if(rnd() < 0.7){
          ctx.fillStyle = `rgba(${trJ},${tgJ},${tbJ},${(a*0.92).toFixed(3)})`;
          ctx.fill();
        } else {
          ctx.strokeStyle = `rgba(${trJ},${tgJ},${tbJ},${a.toFixed(3)})`;
          ctx.lineWidth = minDim*0.025;
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
        ctx.restore();
      },
      dotConstellation: () => {
        const dotCount = 3 + Math.floor(rnd()*4);
        const dotPathAngle = voiceAngle + (rnd()-0.5)*Math.PI*0.5;
        const dotStartX = centerX + (rnd()-0.5)*BW*0.5;
        const dotStartY = yOff + bh*0.3 + rnd()*bh*0.5;
        const dotSpacing = minDim * (0.06 + rnd()*0.06);
        const dotSize = minDim * (0.025 + rnd()*0.025);
        const cosD = Math.cos(dotPathAngle), sinD = Math.sin(dotPathAngle);
        for(let di=0; di<dotCount; di++){
          const dx = dotStartX + cosD * dotSpacing * di;
          const dy = dotStartY + sinD * dotSpacing * di;
          const dotRoll = (di + Math.floor(rnd()*3)) % 3;
          let dotColor;
          if(dotRoll === 0){
            dotColor = `rgba(${r},${g},${b},${a.toFixed(3)})`;
          } else if(dotRoll === 1){
            dotColor = `rgba(245,238,220,${(a*0.9).toFixed(3)})`;
          } else {
            dotColor = `rgba(8,4,12,${(a*0.85).toFixed(3)})`;
          }
          ctx.fillStyle = dotColor;
          ctx.beginPath();
          ctx.arc(dx, dy, dotSize, 0, Math.PI*2);
          ctx.fill();
        }
      },
      wavyLine: () => {
        const wavLen = Math.min(BW, bh) * (0.70 + rnd()*0.30);
        const wavAng = voiceAngle + (rnd()-0.5)*0.6;
        const wavX = centerX + (rnd()-0.5) * BW * 0.4;
        const wavY = yOff + bh*0.5 + (rnd()-0.5) * bh * 0.4;
        const cosW = Math.cos(wavAng), sinW = Math.sin(wavAng);
        const perpX = -sinW, perpY = cosW;
        const amp = Math.min(BW, bh) * (0.07 + rnd()*0.06);
        const cycles = 1.5 + rnd()*1.5;
        const wavTone = (rnd()-0.5)*60;
        const wR = Math.max(0,Math.min(255,Math.round(r+wavTone)));
        const wG = Math.max(0,Math.min(255,Math.round(g+wavTone)));
        const wB = Math.max(0,Math.min(255,Math.round(b+wavTone)));
        ctx.strokeStyle = rnd() < 0.18 ? `rgba(245,238,220,${(a*0.85).toFixed(3)})` : `rgba(${wR},${wG},${wB},${a.toFixed(3)})`;
        ctx.lineWidth = minDim * (0.018 + rnd()*0.020);
        ctx.lineCap = 'round';
        ctx.beginPath();
        const segs = 20;
        for(let s=0; s<=segs; s++){
          const t = s/segs;
          const baseX = wavX + cosW * (t - 0.5) * wavLen;
          const baseY = wavY + sinW * (t - 0.5) * wavLen;
          const wave = Math.sin(t * cycles * Math.PI * 2) * amp;
          const px = baseX + perpX * wave;
          const py = baseY + perpY * wave;
          if(s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      },
      pieSlice: () => {
        const psR = minDim * (0.28 + rnd()*0.25);
        const psX = bx + BW * (0.15 + rnd()*0.70);
        const psY = yOff + bh * (0.15 + rnd()*0.70);
        const startA = rnd() * Math.PI * 2;
        const sweep = (0.35 + rnd()*0.55) * Math.PI;
        const psTone = (rnd()-0.5)*70;
        const pR = Math.max(0,Math.min(255,Math.round(r+psTone)));
        const pG = Math.max(0,Math.min(255,Math.round(g+psTone)));
        const pB = Math.max(0,Math.min(255,Math.round(b+psTone)));
        ctx.fillStyle = `rgba(${pR},${pG},${pB},${(a*0.88).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(psX, psY);
        ctx.arc(psX, psY, psR, startA, startA + sweep);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(8,4,12,${(a*0.75).toFixed(3)})`;
        ctx.lineWidth = minDim * 0.018;
        ctx.lineJoin = 'round';
        ctx.stroke();
      },
      zigzag: () => {
        const zgSteps = 3 + Math.floor(rnd()*3);
        const zgLen = Math.min(BW, bh) * 0.22;
        const zgAng = voiceAngle + (rnd()-0.5)*0.4;
        const zgCos = Math.cos(zgAng), zgSin = Math.sin(zgAng);
        const zgPerpX = -zgSin, zgPerpY = zgCos;
        const zgAmp = zgLen * 0.85;
        let zgX = bx + BW * (0.20 + rnd()*0.60);
        let zgY = yOff + bh * (0.20 + rnd()*0.60);
        ctx.strokeStyle = rnd() < 0.4 ? 'rgba(8,4,12,0.92)' : `rgba(245,238,220,${(a*0.85).toFixed(3)})`;
        ctx.lineWidth = minDim * (0.022 + rnd()*0.020);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(zgX, zgY);
        for(let zi=0; zi<zgSteps; zi++){
          const dir = zi % 2 === 0 ? 1 : -1;
          zgX += zgCos * zgLen + zgPerpX * zgAmp * dir;
          zgY += zgSin * zgLen + zgPerpY * zgAmp * dir;
          ctx.lineTo(zgX, zgY);
        }
        ctx.stroke();
      },
      crescent: () => {
        // Open arc / partial ring — rainbow fragment
        const crX = bx + BW * (0.20 + rnd()*0.60);
        const crY = yOff + bh * (0.20 + rnd()*0.60);
        const crR = minDim * (0.22 + rnd()*0.18);
        const crStart = rnd() * Math.PI * 2;
        const crSweep = (0.4 + rnd()*0.6) * Math.PI;
        const crTone = (rnd()-0.5)*60;
        const crR2 = Math.max(0,Math.min(255,Math.round(r+crTone)));
        const crG2 = Math.max(0,Math.min(255,Math.round(g+crTone)));
        const crB2 = Math.max(0,Math.min(255,Math.round(b+crTone)));
        ctx.strokeStyle = `rgba(${crR2},${crG2},${crB2},${a.toFixed(3)})`;
        ctx.lineWidth = minDim * (0.035 + rnd()*0.04);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(crX, crY, crR, crStart, crStart + crSweep);
        ctx.stroke();
      },
      concentricSquares: () => {
        // Nested rectangles — the square version of the eye
        const sqX = centerX + (rnd()-0.5) * BW * 0.5;
        const sqY = yOff + bh*0.5 + (rnd()-0.5) * bh * 0.5;
        const sqMaxR = minDim * (0.22 + rnd()*0.15);
        const sqRings = 3 + Math.floor(rnd()*2);
        const sqRot = rnd() * Math.PI * 0.5;
        for(let si = sqRings-1; si >= 0; si--){
          const sqR = sqMaxR * ((si+1) / sqRings);
          const tone = (si % 2 === 0) ? -20 : 30;
          const sR = Math.max(0,Math.min(255,Math.round(r+tone)));
          const sG = Math.max(0,Math.min(255,Math.round(g+tone)));
          const sB = Math.max(0,Math.min(255,Math.round(b+tone)));
          ctx.save();
          ctx.translate(sqX, sqY);
          ctx.rotate(sqRot);
          ctx.fillStyle = `rgba(${sR},${sG},${sB},${a.toFixed(3)})`;
          ctx.fillRect(-sqR, -sqR, sqR*2, sqR*2);
          ctx.restore();
        }
      },
      halfDisc: () => {
        // Half-filled circle (half-moon)
        const hdX = bx + BW * (0.20 + rnd()*0.60);
        const hdY = yOff + bh * (0.25 + rnd()*0.50);
        const hdR = minDim * (0.20 + rnd()*0.18);
        const hdRot = rnd() * Math.PI * 2;
        const hdTone = (rnd()-0.5)*80;
        const hR = Math.max(0,Math.min(255,Math.round(r+hdTone)));
        const hG = Math.max(0,Math.min(255,Math.round(g+hdTone)));
        const hB = Math.max(0,Math.min(255,Math.round(b+hdTone)));
        ctx.fillStyle = `rgba(${hR},${hG},${hB},${(a*0.90).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(hdX, hdY, hdR, hdRot, hdRot + Math.PI);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(8,4,12,${(a*0.70).toFixed(3)})`;
        ctx.lineWidth = minDim * 0.015;
        ctx.stroke();
      },
      star: () => {
        // 5-point star
        const stX = bx + BW * (0.20 + rnd()*0.60);
        const stY = yOff + bh * (0.20 + rnd()*0.60);
        const stOuter = minDim * (0.15 + rnd()*0.10);
        const stInner = stOuter * 0.45;
        const stRot = rnd() * Math.PI * 2;
        const stTone = (rnd()-0.5)*60;
        const sR = Math.max(0,Math.min(255,Math.round(r+stTone)));
        const sG = Math.max(0,Math.min(255,Math.round(g+stTone)));
        const sB = Math.max(0,Math.min(255,Math.round(b+stTone)));
        ctx.fillStyle = `rgba(${sR},${sG},${sB},${(a*0.92).toFixed(3)})`;
        ctx.beginPath();
        for(let k=0; k<10; k++){
          const angK = stRot + k * Math.PI / 5;
          const radK = (k % 2 === 0) ? stOuter : stInner;
          const px = stX + Math.cos(angK) * radK;
          const py = stY + Math.sin(angK) * radK;
          if(k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(8,4,12,${(a*0.72).toFixed(3)})`;
        ctx.lineWidth = minDim * 0.012;
        ctx.lineJoin = 'round';
        ctx.stroke();
      },
      dashedLine: () => {
        // Long dashed line (musical staff cousin, more rhythmic)
        const dlAng = voiceAngle + (rnd()-0.5)*Math.PI*0.6;
        const dlLen = Math.max(BW, bh) * (0.7 + rnd()*0.5);
        const dlX = centerX + (rnd()-0.5) * BW * 0.5;
        const dlY = yOff + bh*0.5 + (rnd()-0.5) * bh * 0.5;
        const cosDL = Math.cos(dlAng), sinDL = Math.sin(dlAng);
        const dashCount = 5 + Math.floor(rnd()*5);
        const dashLen = dlLen / (dashCount * 1.8);
        const gapLen = dashLen * 0.8;
        ctx.strokeStyle = rnd() < 0.35 ? `rgba(245,238,220,${(a*0.85).toFixed(3)})` : `rgba(8,4,12,${(a*0.88).toFixed(3)})`;
        ctx.lineWidth = minDim * (0.018 + rnd()*0.015);
        ctx.lineCap = 'round';
        for(let di=0; di<dashCount; di++){
          const t0 = -0.5 + (di * (dashLen+gapLen)) / dlLen;
          const t1 = t0 + dashLen / dlLen;
          const px0 = dlX + cosDL * t0 * dlLen;
          const py0 = dlY + sinDL * t0 * dlLen;
          const px1 = dlX + cosDL * t1 * dlLen;
          const py1 = dlY + sinDL * t1 * dlLen;
          ctx.beginPath();
          ctx.moveTo(px0, py0);
          ctx.lineTo(px1, py1);
          ctx.stroke();
        }
      },
    };

    // === RANDOM SUBSET PICK ===
    // Per voice, pick 2-3 random shapes from the pool. Different voices/cells
    // pick different combos, giving the painting variation.
    const poolKeys = Object.keys(shapeFns);
    const pickCount = 2 + Math.floor(rnd()*2); // 2-3 shapes
    // Fisher-Yates partial shuffle
    const shuffled = poolKeys.slice();
    for(let i=shuffled.length-1; i>0; i--){
      const j = Math.floor(rnd() * (i+1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for(let p=0; p<pickCount && p<shuffled.length; p++){
      shapeFns[shuffled[p]]();
    }
  });
}

// Mondrian — re-reads the chord cell as a De Stijl composition. The φ-grid is
// already the subject; Mondrian makes it explicit. Each cell is recursively
// subdivided into asymmetric rectangles separated by thick black lines, and a
// few rectangles are flooded with quantized primaries (red/blue/yellow) drawn
// from the voice colors; the rest stay white/off-white. Deterministic per cell.
// Mondrian — two variants, chosen stably per painting from _artistSeed so a
// given piece always renders the same way (re-rolls on Vary/new mood):
//   • CLASSIC (Composition with Red/Yellow/Blue): warm-white fields, THICK
//     black lines, a few saturated primary blocks. Sparse, architectural.
//   • BOOGIE (Broadway Boogie Woogie): no black — YELLOW lines segmented with
//     small red/blue/grey squares, dense and rhythmic. Literally music-named.
// Recursive guillotine partition; note count drives how busy the cell is.
function drawMondrian(ctx,bx,by,notes,gc,BW,BH){
  const rnd=_seedRnd(bx,by,BW,BH);
  const boogie = ((_artistSeed>>>3)&1)===1;          // stable per painting
  const n=Math.max(1,notes.length);
  const sorted=[...notes].sort((a,b)=>b.m-a.m);
  // Boost a gc() color toward Mondrian's bold, flat, saturated character while
  // KEEPING its hue — so the block color tracks the active color mode (Harmony /
  // Spectral / B&W / custom) exactly like Pollock and Kandinsky do, instead of
  // snapping to fixed primaries.
  const bold=(r,g,bl)=>{
    // Pastel tone: skip the boost so the per-cell Mondrian stays soft.
    if(_pastelOn) return [Math.round(r),Math.round(g),Math.round(bl)];
    // Greyscale (B/W mode, or a grey custom swatch) has no hue to boost — the
    // 255/mx stretch would blow every grey up to white, destroying the dark↔
    // light range. Detect near-grey and pass it through untouched.
    if(Math.max(r,g,bl)-Math.min(r,g,bl) <= 6) return [Math.round(r),Math.round(g),Math.round(bl)];
    const mx=Math.max(r,g,bl,1), k=255/mx;       // stretch brightest channel to full
    let R=r*k, G=g*k, B=bl*k, m2=Math.max(R,G,B);
    const pull=(c)=>c===m2?c:c*0.72;             // deepen the non-dominant channels
    return [Math.round(Math.min(255,pull(R))),Math.round(Math.min(255,pull(G))),Math.round(Math.min(255,pull(B)))];
  };

  if(!boogie){
    // ── CLASSIC ──
    ctx.fillStyle='#f4f1e8'; ctx.fillRect(bx-1,by-1,BW+2,BH+2);
    const cuts=Math.min(5,2+Math.floor(n*0.7)+Math.floor(rnd()*2));
    let rects=[[bx,by,BW,BH]];
    for(let c=0;c<cuts;c++){
      let bi=0,barea=0; rects.forEach((rc,i)=>{const a=rc[2]*rc[3];if(a>barea){barea=a;bi=i;}});
      const [rx,ry,rw,rh]=rects[bi];
      const horizontal = rw<rh ? true : rw>rh ? false : rnd()<0.5;
      const t=0.30+rnd()*0.40; rects.splice(bi,1);
      if(horizontal){const h1=Math.round(rh*t); rects.push([rx,ry,rw,h1],[rx,ry+h1,rw,rh-h1]);}
      else{const w1=Math.round(rw*t); rects.push([rx,ry,w1,rh],[rx+w1,ry,rw-w1,rh]);}
    }
    rects.forEach((rc,i)=>{
      const [rx,ry,rw,rh]=rc, roll=rnd();
      if(roll<0.40 && sorted.length){
        const note=sorted[i%sorted.length], [r,g,bl]=gc(note.m,note.v), [pr,pg,pb]=bold(r,g,bl);
        ctx.fillStyle=`rgb(${pr},${pg},${pb})`; ctx.fillRect(rx,ry,rw,rh);
      } else if(roll<0.47){ ctx.fillStyle='#141109'; ctx.fillRect(rx,ry,rw,rh); }
    });
    const lw=Math.max(2,Math.round(Math.min(BW,BH)*0.07));
    ctx.fillStyle='#0d0b08';
    rects.forEach(rc=>{const [rx,ry,rw,rh]=rc; ctx.fillRect(rx,ry,rw,lw); ctx.fillRect(rx,ry+rh-lw,rw,lw); ctx.fillRect(rx,ry,lw,rh); ctx.fillRect(rx+rw-lw,ry,lw,rh);});
    ctx.fillRect(bx-1,by-1,BW+2,lw); ctx.fillRect(bx-1,by+BH-lw,BW+2,lw+1); ctx.fillRect(bx-1,by-1,lw,BH+2); ctx.fillRect(bx+BW-lw,by-1,lw,BH+2);
    return;
  }

  // ── BOOGIE WOOGIE ──
  ctx.fillStyle='#f1ede2'; ctx.fillRect(bx-1,by-1,BW+2,BH+2);
  // Colors derived from the chord via gc() so the cell tracks the color mode.
  // LINE color = bold() of the brightest voice (Boogie's "yellow" lines become
  // whatever the dominant hue is; in B&W they read as light grey). BEADS and
  // SQUARES pull from individual voices, boosted bold.
  const voiceBold=(i)=>{ const nt=sorted[i%Math.max(1,sorted.length)]||{m:60,v:80}; const[r,g,bl]=gc(nt.m,nt.v); return bold(r,g,bl); };
  const lineC = (()=>{ const c=voiceBold(0); return `rgb(${c[0]},${c[1]},${c[2]})`; })();
  // a few large off-white blocks first (the "buildings")
  const blocks=Math.min(3,1+Math.floor(n*0.4));
  for(let i=0;i<blocks;i++){
    const bw2=BW*(0.25+rnd()*0.30), bh2=BH*(0.18+rnd()*0.28);
    const bxx=bx+rnd()*(BW-bw2), byy=by+rnd()*(BH-bh2);
    ctx.fillStyle='#fbfaf4'; ctx.fillRect(bxx,byy,bw2,bh2);
  }
  // grid lines in the dominant chord color
  const lw=Math.max(2,Math.round(Math.min(BW,BH)*0.05));
  const vlines=2+Math.floor(rnd()*2)+Math.floor(n*0.3), hlines=2+Math.floor(rnd()*2)+Math.floor(n*0.3);
  const vxs=[], hys=[];
  for(let i=0;i<vlines;i++){const x=bx+ (i+0.5+ (rnd()-0.5)*0.5)*(BW/vlines); vxs.push(x); ctx.fillStyle=lineC; ctx.fillRect(x,by,lw,BH);}
  for(let i=0;i<hlines;i++){const y=by+ (i+0.5+ (rnd()-0.5)*0.5)*(BH/hlines); hys.push(y); ctx.fillStyle=lineC; ctx.fillRect(bx,y,BW,lw);}
  // colored beads along the lines — each bead a (bold) voice color
  const beadOn=(x,y)=>{ const c=voiceBold(Math.floor(rnd()*Math.max(1,sorted.length))); const s=lw*(1.1+rnd()*1.4); ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(x-(s-lw)/2,y-(s-lw)/2,s,s); };
  vxs.forEach(x=>{ const beads=2+Math.floor(rnd()*3); for(let b=0;b<beads;b++){ if(rnd()<0.7) beadOn(x, by+rnd()*BH); } });
  hys.forEach(y=>{ const beads=2+Math.floor(rnd()*3); for(let b=0;b<beads;b++){ if(rnd()<0.7) beadOn(bx+rnd()*BW, y); } });
  // bigger squares at intersections, with a contrasting inner accent — both
  // from voice colors so they follow the palette.
  if(sorted.length){
    const bigs=1+Math.floor(rnd()*2);
    for(let i=0;i<bigs;i++){
      const x=vxs[Math.floor(rnd()*vxs.length)]||bx+BW/2, y=hys[Math.floor(rnd()*hys.length)]||by+BH/2;
      const s=Math.min(BW,BH)*(0.12+rnd()*0.10);
      const oc=voiceBold(i), ic=voiceBold(i+1);
      ctx.fillStyle=`rgb(${oc[0]},${oc[1]},${oc[2]})`; ctx.fillRect(x-s/2,y-s/2,s,s);
      ctx.fillStyle=`rgb(${ic[0]},${ic[1]},${ic[2]})`; ctx.fillRect(x-s/5,y-s/5,s*0.4,s*0.4);
    }
  }
}

// Rothko — large luminous color fields stacked on a related deep ground, the
// way the mockups read: 2–3 big rectangles that nearly fill the cell, colors
// MORE saturated than the source (they glow, not mute), strong contrast
// between stacked fields, and soft cloudy edges where the ground bleeds
// through. Colors come from gc() so the cell tracks the active color mode.
function drawRothko(ctx,bx,by,notes,gc,BW,BH){
  const rnd=_seedRnd(bx,by,BW,BH);
  const sorted=[...notes].sort((a,b)=>b.m-a.m), n=sorted.length;

  // Saturation booster — opposite of muting: stretch the brightest channel to
  // full and deepen the others, so fields glow like Rothko's stained washes.
  // Pastel tone: bypass and return gc colour as-is so the painting stays soft.
  const lume=(r,g,b,boost)=>{
    if(_pastelOn) return [Math.round(r),Math.round(g),Math.round(b)];
    const mx=Math.max(r,g,b,1), k=(255*boost)/mx;
    let R=r*k,G=g*k,B=b*k,m2=Math.max(R,G,B);
    const pull=(c)=>c===m2?c:c*0.7;
    return [Math.min(255,pull(R)),Math.min(255,pull(G)),Math.min(255,pull(B))];
  };
  const voiceCol=(i)=>{ const nt=sorted[((i%Math.max(1,n))+n)%Math.max(1,n)]||{m:60,v:80}; const[r,g,b]=gc(nt.m,nt.v); return [r,g,b]; };

  // GROUND — a deep, rich version of the LOWEST voice (the brooding maroon /
  // dark violet surround in the refs), not a muddy average.
  let gr=40,gg=22,gb=34;
  if(n){ const [r,g,b]=voiceCol(n-1); const d=lume(r,g,b,0.5); gr=Math.round(d[0]*0.6+10); gg=Math.round(d[1]*0.6+6); gb=Math.round(d[2]*0.6+12); }
  ctx.fillStyle=`rgb(${gr},${gg},${gb})`; ctx.fillRect(bx-1,by-1,BW+2,BH+2);

  // FIELDS — 2 (or 3 for dense chords). They nearly fill the cell with small
  // margins; each field a different voice so stacked fields contrast strongly.
  const fields = n>=4 ? 3 : 2;
  const marginX = BW*0.07;
  const gap = BH*0.05;
  const topPad = BH*0.06, botPad = BH*0.06;
  const usableH = BH - topPad - botPad - gap*(fields-1);
  // asymmetric heights (Rothko rarely splits evenly) — random weights
  const weights=[]; let wsum=0;
  for(let f=0;f<fields;f++){ const w=0.8+rnd()*0.8; weights.push(w); wsum+=w; }

  // Field with a SOLID opaque core and a soft rim on all four sides. Core is
  // drawn once at full strength; the rim is a band of fading rectangles just
  // inside each edge so the field dissolves into the ground without thinning
  // the whole field (which would let the dark ground dominate).
  const drawField=(fx,fy,fw,fh,col)=>{
    const [r,g,b]=col; const R=r|0,G=g|0,B=b|0;
    const rimX=Math.max(4,fw*0.12), rimY=Math.max(4,fh*0.12);
    // 1) solid core
    ctx.fillStyle=`rgb(${R},${G},${B})`;
    ctx.fillRect(fx+rimX, fy+rimY, fw-2*rimX, fh-2*rimY);
    // 2) feather each side outward with fading alpha steps
    const STEPS=14;
    for(let s=0;s<STEPS;s++){
      const t=s/STEPS;                 // 0 at core edge → 1 at outer edge
      const a=(1-t)*(1-t)*0.9;         // strong near core, →0 at rim
      ctx.fillStyle=`rgba(${R},${G},${B},${a.toFixed(3)})`;
      const ox=rimX*t, oy=rimY*t;
      // top rim
      ctx.fillRect(fx+rimX-ox, fy+rimY-oy, fw-2*(rimX-ox), oy+1);
      // bottom rim
      ctx.fillRect(fx+rimX-ox, fy+fh-rimY+oy-1, fw-2*(rimX-ox), oy+1);
      // left rim
      ctx.fillRect(fx+rimX-ox, fy+rimY-oy, ox+1, fh-2*(rimY-oy));
      // right rim
      ctx.fillRect(fx+fw-rimX+ox-1, fy+rimY-oy, ox+1, fh-2*(rimY-oy));
    }
    // 3) faint outer halo so colour seeps into the ground (luminous bleed)
    const hg=ctx.createRadialGradient(fx+fw/2,fy+fh/2,Math.min(fw,fh)*0.25, fx+fw/2,fy+fh/2,Math.max(fw,fh)*0.7);
    hg.addColorStop(0,`rgba(${R},${G},${B},0.14)`);
    hg.addColorStop(1,`rgba(${R},${G},${B},0)`);
    ctx.fillStyle=hg; ctx.fillRect(fx-fw*0.12,fy-fh*0.12,fw*1.24,fh*1.24);
  };

  let cy=by+topPad;
  for(let f=0;f<fields;f++){
    const fh=usableH*(weights[f]/wsum);
    const baseCol=voiceCol(f);
    // glow: brighter for upper fields, deeper for lower (Rothko's light logic)
    const boost = 1.05 - f*0.12;
    const col=lume(baseCol[0],baseCol[1],baseCol[2], Math.max(0.7,boost));
    drawField(bx+marginX, cy, BW-2*marginX, fh, col);
    cy += fh + gap;
  }
}

// Matisse — paper cut-outs, mixing two of his signatures per the refs:
//   • NESTED FRAME (Jazz plates): concentric flat-color rectangle borders with
//     an organic white figure / blob in the center panel.
//   • SCATTERED CUT-OUTS: free organic blobs, four-point stars and leaf fronds
//     strewn on a contrasting ground.
// Per cell, one mode is chosen (stable via cell seed); both use flat opaque
// color straight from the voice palette.
function drawMatisse(ctx,bx,by,notes,gc,BW,BH){
  // Seed includes _artistSeed so Random (🎲) / Vary actually re-roll Matisse —
  // previously the seed was pure cell position, so re-rolling changed nothing.
  _RND_STATE[0] = ((bx*73)^(by*113)^(BW*271)^(BH*947)^(_artistSeed*2654435761))>>>0;
  const rnd=_rnd;
  const sorted=[...notes].sort((a,b)=>b.m-a.m), n=Math.max(1,sorted.length);
  const col=(i)=>{ const nt=sorted[((i%n)+n)%n]||{m:60,v:70}; const[r,g,b]=gc(nt.m,nt.v); return [r,g,b]; };

  // organic scissored blob
  const blob=(cx,cy,rad,wob,pts)=>{ ctx.beginPath();
    for(let i=0;i<=pts;i++){ const ang=(i/pts)*Math.PI*2; const rr=rad*(1+wob*Math.sin(ang*(2+Math.floor(rnd()*3))+rnd()*3));
      const x=cx+Math.cos(ang)*rr, y=cy+Math.sin(ang)*rr*0.92; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.closePath();ctx.fill(); };
  const star=(cx,cy,rad)=>{ ctx.beginPath();
    for(let i=0;i<8;i++){ const ang=(i/8)*Math.PI*2 - Math.PI/2; const rr=(i%2===0)?rad:rad*0.36;
      const x=cx+Math.cos(ang)*rr, y=cy+Math.sin(ang)*rr; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.closePath();ctx.fill(); };
  const leaf=(cx,cy,len,wid,rot)=>{ ctx.save();ctx.translate(cx,cy);ctx.rotate(rot);
    ctx.beginPath();ctx.moveTo(0,-len*0.5); ctx.bezierCurveTo(wid,-len*0.2,wid,len*0.3,0,len*0.5); ctx.bezierCurveTo(-wid,len*0.3,-wid,-len*0.2,0,-len*0.5);
    ctx.closePath();ctx.fill();ctx.restore(); };
  // Algae/coral frond — branching curved arm (a very Matisse cut-out form)
  const algae=(cx,cy,scale,rot)=>{ ctx.save();ctx.translate(cx,cy);ctx.rotate(rot);
    ctx.beginPath();
    const lobes=3+Math.floor(rnd()*3);
    ctx.moveTo(0,scale*0.9);
    for(let i=0;i<=lobes;i++){ const t=i/lobes; const y=scale*(0.9-1.8*t); const w=scale*(0.5*Math.sin(t*Math.PI)+0.12);
      ctx.quadraticCurveTo(w*1.6, y+scale*0.1, w*0.2, y-scale*0.18); }
    for(let i=lobes;i>=0;i--){ const t=i/lobes; const y=scale*(0.9-1.8*t); const w=scale*(0.5*Math.sin(t*Math.PI)+0.12);
      ctx.quadraticCurveTo(-w*1.6, y+scale*0.1, -w*0.2, y-scale*0.18); }
    ctx.closePath();ctx.fill();ctx.restore(); };

  // Composition mode now depends on the (re-rollable) seed, not cell position.
  const nested = rnd()<0.5;

  if(nested && n>=1){
    // ── NESTED FRAME ── concentric rectangles in successive voice colors
    const layers=Math.min(4, 2+Math.floor(n*0.6));
    let ix=bx, iy=by, iw=BW, ih=BH;
    for(let l=0;l<layers;l++){
      const [r,g,b]=col(l);
      ctx.fillStyle=`rgb(${r},${g},${b})`;
      ctx.fillRect(ix,iy,iw,ih);
      const insx=iw*(0.10+rnd()*0.08), insy=ih*(0.10+rnd()*0.08);
      ix+=insx; iy+=insy; iw-=2*insx; ih-=2*insy;
      if(iw<6||ih<6) break;
    }
    // organic figure in the innermost panel — white, or a contrasting voice
    const figCol = rnd()<0.6 ? [244,241,232] : col(n);
    ctx.fillStyle=`rgb(${figCol[0]|0},${figCol[1]|0},${figCol[2]|0})`;
    const cx=ix+iw/2, cy=iy+ih/2, rad=Math.min(iw,ih)*0.42;
    const fk=Math.floor(rnd()*3);
    if(fk===0) blob(cx,cy,rad,0.30,9+Math.floor(rnd()*3));
    else if(fk===1){ blob(cx,cy-rad*0.4,rad*0.6,0.25,8); blob(cx,cy+rad*0.5,rad*0.8,0.30,9); } // figure
    else algae(cx,cy,rad*1.1,(rnd()-0.5)*0.8);
    return;
  }

  // ── SCATTERED CUT-OUTS ── flat ground + strewn shapes
  let gr=22,gg=20,gb=26;
  { const [r,g,b]=col(n-1); gr=Math.round(r*0.5); gg=Math.round(g*0.5); gb=Math.round(b*0.5); }
  ctx.fillStyle=`rgb(${gr},${gg},${gb})`; ctx.fillRect(bx-1,by-1,BW+2,BH+2);
  // shape count varies with the seed so density differs between re-rolls
  sorted.forEach((note,vi)=>{
    const [r,g,b]=gc(note.m,note.v);
    ctx.fillStyle=`rgb(${r},${g},${b})`;
    const cx=bx+BW*(0.18+rnd()*0.64), cy=by+BH*((vi+0.5)/n + (rnd()-0.5)*0.18), base=Math.min(BW,BH/n)*0.6;
    const kind=Math.floor(rnd()*4);
    if(kind===0) blob(cx,cy,base*(0.7+rnd()*0.5),0.24+rnd()*0.14,9+Math.floor(rnd()*4));
    else if(kind===1) star(cx,cy,base*(0.8+rnd()*0.5));
    else if(kind===2) leaf(cx,cy,base*(1.6+rnd()*0.7),base*(0.45+rnd()*0.25),(rnd()-0.5)*2.2);
    else algae(cx,cy,base*(1.0+rnd()*0.5),(rnd()-0.5)*2.4);
    if(rnd()<0.35 && n>1){ const o=col(vi+1); ctx.fillStyle=`rgb(${o[0]},${o[1]},${o[2]})`;
      const ak=Math.floor(rnd()*2);
      if(ak===0) blob(bx+BW*(0.15+rnd()*0.7), by+BH*(0.15+rnd()*0.7), base*0.32,0.3,7);
      else star(bx+BW*(0.15+rnd()*0.7), by+BH*(0.15+rnd()*0.7), base*0.3);
    }
  });
}
function drawBlock(ctx,bx,by,notes,gc,BW,BH,style){
  // See music painting path: if any note carries _paintPc (the pixel-derived
  // pitch class captured during image scan, before snap/bar progression
  // overwrote n.m), rewrite each note's m to the same octave but with pc =
  // _paintPc. Every artist below then paints in the source-faithful colour
  // via gc(m,v) without needing to know about _paintPc. Audio engine
  // bypasses this transform — it reads notes directly from the chord array,
  // so the music still plays the harmonically-shaped pitches.
  const _hasPaintPc = notes.some(n => typeof n._paintPc === 'number');
  const _notes = _hasPaintPc
    ? notes.map(n => {
        if(typeof n._paintPc !== 'number') return n;
        const oct = Math.floor(n.m / 12);
        return { ...n, m: oct*12 + n._paintPc };
      })
    : notes;
  if(style==='mondrian')return drawMondrian(ctx,bx,by,_notes,gc,BW,BH);
  if(style==='rothko')return drawRothko(ctx,bx,by,_notes,gc,BW,BH);
  if(style==='matisse')return drawMatisse(ctx,bx,by,_notes,gc,BW,BH);
  if(style==='picasso'){
    // Picasso has its own canvas-wide cubist plane overlay that supplies all
    // color. The per-block drawer just keeps the dark canvas underneath —
    // previously this used the cream substrate from Pollock, which produced
    // an unwanted white background showing through gaps between planes.
    ctx.fillStyle='#04040a';ctx.fillRect(bx-1,by-1,BW+2,BH+2);
    return;
  }
  if(style==='kusama')return drawKusama(ctx,bx,by,_notes,gc,BW,BH);
  if(style==='kandinsky')return drawKandinsky(ctx,bx,by,_notes,gc,BW,BH);
  if(style==='pollock')return drawBlockPollockCream(ctx,bx,by,_notes,gc,BW,BH);
  if(style==='miro'){ctx.fillStyle='rgba(28,18,12,1)';ctx.fillRect(bx-1,by-1,BW+2,BH+2);return;}
  if(style==='notes')return drawBlockNotes(ctx,bx,by,_notes,gc,BW,BH);
  return drawBlockMosaic(ctx,bx,by,_notes,gc,BW,BH); // implicit default
}

// ── Shared helper for the Kusama-style overlays (Rothko, Matisse) ──
// Builds a recursive guillotine partition of the WHOLE canvas (normalized
// 0..1), splitting the largest rect each step. The rect COUNT is capped and
// scaled to track length so long tracks get more regions but never collapse
// into a fine pixel grid (same idea as drawKusamaOverlay). Returns the rect
// list plus the paintCount (how many are "revealed" at the current lim).
//
// PERF: the partition geometry depends only on (chordCount, ss, seedBase,
// capScale) — NOT on lim. During playback this is called every frame with a
// growing lim, so without caching we rebuilt the whole O(n²) partition ~7×/sec,
// which starved the audio scheduler. We memoize the rect array keyed on the
// stable inputs; only paintCount (cheap) recomputes per frame.
let _partCache = { key:'', rects:null, MAX_RECTS:0 };
function _partitionCanvas(chords, lim, ss, seedBase, capScale){
  let cs = capScale||1;
  // Song character (A3): a loud/dense piece partitions into more (smaller)
  // panels, a calm/sparse one into fewer (bigger) planes — so Matisse & Mondrian
  // differ per piece, not just by chord count. Multiplier 0.72..1.30 on the cap
  // scale. Deterministic; audio untouched. Baked into the cache key below.
  const _ch = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const _charDrive = _ch ? (0.55*_ch.energy + 0.45*_ch.density) : 0.5;
  const _csMul = 0.50 + 1.04*_charDrive;   // amplified ×1.8 (was 0.72+0.58)
  cs = cs * _csMul;
  const cn = chords.length;
  const MAX_RECTS=Math.max(2,Math.min(cn,Math.round((
    cn<=60 ? cn
    :cn<=120 ? 60+Math.floor((cn-60)*0.5)
    :cn<=300 ? 90+Math.floor((cn-120)*0.30)
    :cn<=600 ? 144+Math.floor((cn-300)*0.12)
    :cn<=1200? 180+Math.floor((cn-600)*0.10)
    :240+Math.floor((cn-1200)*0.05)
  )*cs)));
  const paintCount=Math.min(MAX_RECTS,Math.max(1,Math.round(lim*(MAX_RECTS/cn))));
  const key = cn+'|'+(ss|0)+'|'+seedBase+'|'+cs.toFixed(3);
  if(_partCache.key===key && _partCache.rects){
    return {rects:_partCache.rects, MAX_RECTS:_partCache.MAX_RECTS, paintCount};
  }
  let rects=[{x:0,y:0,w:1,h:1}];
  for(let cut=0;cut<MAX_RECTS-1;cut++){
    const cr=_seedRnd(cut+seedBase,ss,0,0);
    let bigIdx=0,bigArea=0;
    for(let i=0;i<rects.length;i++){const a=rects[i].w*rects[i].h;if(a>bigArea){bigArea=a;bigIdx=i;}}
    const r=rects[bigIdx];
    const splitPos=0.32+cr()*0.36;
    let r1,r2;
    if(r.w>=r.h){const sw=r.w*splitPos;r1={x:r.x,y:r.y,w:sw,h:r.h};r2={x:r.x+sw,y:r.y,w:r.w-sw,h:r.h};}
    else{const sh=r.h*splitPos;r1={x:r.x,y:r.y,w:r.w,h:sh};r2={x:r.x,y:r.y+sh,w:r.w,h:r.h-sh};}
    rects.splice(bigIdx,1,r1,r2);
  }
  _partCache = { key, rects, MAX_RECTS };
  return {rects, MAX_RECTS, paintCount};
}
// Sample a representative color for the rect at index pIdx by mapping it back
// onto a chord in the piece — same mapping Kusama uses.
function _rectChordColor(chords, pIdx, MAX_RECTS, gc){
  const chord=chords[Math.min(chords.length-1,Math.floor(pIdx*(chords.length/MAX_RECTS)))];
  _setCurE(chord && chord._E);
  const notes=chord.n||chord.notes||(Array.isArray(chord)?chord:null);
  if(!notes||!notes.length) return [120,100,140];
  let R=0,G=0,B=0,c=0;
  for(const note of notes){const m=note.m!==undefined?note.m:note,v=note.v!==undefined?note.v:80;const[r,g,b]=gc(m,v);R+=r;G+=g;B+=b;c++;}
  return [R/c,G/c,B/c];
}

// Rothko canvas-wide overlay. The classic Rothko is NOT a patchwork grid — it's
// a small number of soft-edged horizontal color fields STACKED VERTICALLY,
// centered within generous margins, hovering on a saturated ground. We build
// that arrangement directly (instead of the recursive partition the other
// overlays use): pick 2–4 fields whose count grows gently with track length,
// stack them with uneven heights (Rothko rarely splits evenly), inset them from
// the canvas edges, and feather every edge so the fields breathe like stained
// washes. Fields reveal progressively as lim advances.
function drawRothkoOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim||!chords||!chords.length) return;
  const ss=sessionSeed|0;
  const cn=chords.length;
  // Song character (A2): differentiate pieces beyond raw chord count. Energetic,
  // dense music → deeper saturated ground and a touch more stacked fields; calm,
  // sparse music → lighter ground, fewer fields. Deterministic; audio untouched.
  const _ch = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const _energy = _ch ? _ch.energy : 0.5;
  const _density = _ch ? _ch.density : 0.3;
  // ── 8-VARIANT CHOOSER (stable per painting, re-rolls on Vary) ──
  //  0 = Classic Rothko Stacked (vertical, the canonical layout).
  //  1 = Pastel / Light period (cream ground + pale fields, high luminosity).
  //  2 = Classic Rothko Row (horizontal Classic).
  //  3 = Classic Rothko Grid (grid-arranged Classic).
  //  4 = Multiform (early 1948, free blurred patches).
  //  5 = Seagram (dark portal frames 1958-59).
  //  6 = Chapel (Houston, 1964-67, triptych ultra-dark monochrome).
  //  7 = Incandescent (warm glowing 1955-58).
  //  Free (cap=2) sees Stacked + Pastel — dark saturated vs light luminous
  //  is the strongest art-historical contrast in Rothko's late career.
  //  Slot 1 stays Pastel (not Row Classic) so Free keeps maximal contrast.
  let _rothkoForcedLayout = null; // null = seed-roll; else 0=stack, 1=row, 2=grid
  {
    const _pn=_capN(8); const _ropick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_ropick===1){ rothkoPhasePastel(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_ropick===4){ rothkoPhaseMultiform(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_ropick===5){ rothkoPhaseSeagram(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_ropick===6){ rothkoPhaseChapel(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_ropick===7){ rothkoPhaseIncandescent(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // Slots 0, 2, 3 fall through to the Classic body with forced layout —
    // each layout is now its own Vary slot rather than a hidden seed sub-pick.
    if(_ropick===0) _rothkoForcedLayout = 0;
    else if(_ropick===2) _rothkoForcedLayout = 1;
    else if(_ropick===3) _rothkoForcedLayout = 2;
  }
  // Rothko is intentionally minimal — even 12 fields is at the high end of his
  // late stacked compositions, so we cap there rather than chasing density.
  const FIELDS = (()=>{
    let f = cn<=2 ? Math.max(1,cn)
              : cn<=8  ? 2
              : cn<=20 ? 3
              : cn<=45 ? 4
              : cn<=90 ? 5
              : cn<=160? 6
              : cn<=280? 7
              : cn<=500? 8
              : cn<=800? 9
              : cn<=1200?10
              : cn<=1800?11
              : 12;
    // Dense pieces lean +1 field, very sparse pieces -1 — still capped 1..12.
    if(_density>0.6 && f<12) f+=1;
    else if(_density<0.2 && f>1) f-=1;
    return f;
  })();
  const lume=(r,g,b,boost)=>{if(_pastelOn) return [Math.round(r),Math.round(g),Math.round(b)];const mx=Math.max(r,g,b,1),k=(255*boost)/mx;let R=r*k,G=g*k,B=b*k,m2=Math.max(R,G,B);const pull=(x)=>x===m2?x:x*0.7;return[Math.min(255,pull(R)),Math.min(255,pull(G)),Math.min(255,pull(B))];};

  // Ground: a deep saturated wash sampled from the whole piece, darkened.
  // Energy modulates the darkness — a forte piece sits on a deeper ground
  // (boost 0.24), a pianissimo one on a more luminous ground (boost 0.40).
  const gBase=_rectChordColor(chords,0,Math.max(1,FIELDS),gc);
  const _gBoost = 0.40 - 0.16*_energy;
  const gnd=lume(gBase[0],gBase[1],gBase[2],_gBoost);
  ctx.fillStyle=`rgb(${gnd[0]|0},${gnd[1]|0},${gnd[2]|0})`; ctx.fillRect(0,0,CW,CH);

  const marginX=CW*0.08, marginTop=CH*0.06, marginBot=CH*0.06;
  const innerX=marginX, innerW=CW-2*marginX;
  const innerY=marginTop, innerH=CH-marginTop-marginBot;

  // ── Layout chooser ──
  // If a Vary slot forced a specific layout (slots 0/2/3 = stack/row/grid),
  // honour it. Otherwise fall back to the legacy seed-driven micro-variation
  // (kept defensive — should not trigger now that all 3 are explicit slots).
  const lr=_seedRnd(99,ss,0,0);
  const layoutRoll=lr();
  const layout = (_rothkoForcedLayout != null)
               ? _rothkoForcedLayout
               : (FIELDS<=2 ? 0
                  : layoutRoll<0.62 ? 0
                  : layoutRoll<0.82 ? 1
                  : 2);
  const wr=_seedRnd(7,ss,0,0);

  // Build the list of field rects {x,y,w,h} based on the chosen layout.
  const fieldRects=[];
  if(layout===0){
    // Vertical stack — uneven heights.
    const gap=Math.max(6,innerH*0.030);
    const weights=[];for(let i=0;i<FIELDS;i++)weights.push(0.7+wr()*0.9);
    const wsum=weights.reduce((a,b)=>a+b,0), availH=innerH-gap*(FIELDS-1);
    let cy=innerY;
    for(let f=0;f<FIELDS;f++){const fh=availH*(weights[f]/wsum);fieldRects.push({x:innerX,y:cy,w:innerW,h:fh});cy+=fh+gap;}
  }else if(layout===1){
    // Horizontal row — uneven widths.
    const gap=Math.max(6,innerW*0.030);
    const weights=[];for(let i=0;i<FIELDS;i++)weights.push(0.7+wr()*0.9);
    const wsum=weights.reduce((a,b)=>a+b,0), availW=innerW-gap*(FIELDS-1);
    let cx=innerX;
    for(let f=0;f<FIELDS;f++){const fw=availW*(weights[f]/wsum);fieldRects.push({x:cx,y:innerY,w:fw,h:innerH});cx+=fw+gap;}
  }else{
    // Grid — cols×rows that best fit FIELDS, uneven row heights & col widths.
    const cols=Math.ceil(Math.sqrt(FIELDS)), rows=Math.ceil(FIELDS/cols);
    const gapX=Math.max(5,innerW*0.025), gapY=Math.max(5,innerH*0.025);
    const cw=(innerW-gapX*(cols-1))/cols, chh=(innerH-gapY*(rows-1))/rows;
    for(let f=0;f<FIELDS;f++){
      const r=Math.floor(f/cols), c=f%cols;
      // jitter size a touch so the grid isn't mechanical
      const jw=cw*(0.86+wr()*0.12), jh=chh*(0.86+wr()*0.12);
      const ox=(cw-jw)*0.5, oy=(chh-jh)*0.5;
      fieldRects.push({x:innerX+c*(cw+gapX)+ox, y:innerY+r*(chh+gapY)+oy, w:jw, h:jh});
    }
  }

  // Reveal progressively top→bottom / left→right by field order.
  const revealed=Math.max(1,Math.min(FIELDS,Math.ceil(lim*(FIELDS/cn))));

  // ── Per-field renderer: wavering, feathered, scumbled, frayed field drawn
  // into rect {x,y,w,h}, optionally rotated by `angle` radians about its centre.
  const drawField=(f, rect, angle)=>{
    const rnd=_seedRnd(f+1500,ss,0,0);
    const sampled=_rectChordColor(chords, f, Math.max(1,FIELDS), gc);
    const col=lume(sampled[0],sampled[1],sampled[2], 0.92+rnd()*0.14);
    const R=col[0]|0,G=col[1]|0,B=col[2]|0;

    ctx.save();
    if(angle){
      const ccx=rect.x+rect.w/2, ccy=rect.y+rect.h/2;
      ctx.translate(ccx,ccy); ctx.rotate(angle); ctx.translate(-ccx,-ccy);
    }
    const fx=rect.x + rect.w*0.02*(rnd()-0.5);
    const fw=rect.w*(0.97+rnd()*0.03);
    const by=rect.y, bh=rect.h;

    // Halo bleed into the ground.
    const halo=lume(sampled[0],sampled[1],sampled[2],0.55);
    ctx.fillStyle=`rgba(${halo[0]|0},${halo[1]|0},${halo[2]|0},0.5)`;
    ctx.fillRect(fx-fw*0.02, by-bh*0.06, fw*1.04, bh*1.12);

    const rimX=Math.max(4,fw*0.06), rimY=Math.max(6,bh*0.16);
    if(fw-2*rimX<=2||bh-2*rimY<=2){
      ctx.fillStyle=`rgb(${R},${G},${B})`; ctx.fillRect(fx,by,fw,bh); ctx.restore(); return;
    }
    const cx0=fx+rimX, cy0=by+rimY, cw0=fw-2*rimX, ch0=bh-2*rimY;
    const ej=_seedRnd(f+1701,ss,0,0);
    const phx=ej()*6.28, phy=ej()*6.28, ph2=ej()*6.28, ph3=ej()*6.28;
    const wob=Math.min(rimX,rimY)*0.5;
    const waver=(p,ph)=>Math.sin(p*Math.PI*2*1.5+ph)*0.6+Math.sin(p*Math.PI*2*2.7+ph*1.7)*0.4;
    const edgePt=(side,t)=>{
      if(side===0) return [cx0+t*cw0, cy0 + waver(t,phy)*wob];
      if(side===1) return [cx0+cw0 - waver(t,ph2)*wob*0.6, cy0+t*ch0];
      if(side===2) return [cx0+(1-t)*cw0, cy0+ch0 - waver(1-t,ph3)*wob];
      return [cx0 + waver(1-t,phx)*wob*0.6, cy0+(1-t)*ch0];
    };
    const traceCore=(grow)=>{
      ctx.beginPath(); const SEG=18; let first=true;
      for(let side=0;side<4;side++){
        for(let i=0;i<SEG;i++){
          let [x,y]=edgePt(side,i/SEG);
          if(grow){const mx=cx0+cw0/2,my=cy0+ch0/2;x+=(x-mx)/(cw0/2)*grow;y+=(y-my)/(ch0/2)*grow;}
          if(first){ctx.moveTo(x,y);first=false;}else ctx.lineTo(x,y);
        }
      }
      ctx.closePath();
    };
    const RINGS=16;
    for(let s=RINGS;s>=1;s--){
      const t=s/RINGS, grow=Math.max(rimX,rimY)*t, a=(1-t)*(1-t)*0.85;
      ctx.fillStyle=`rgba(${R},${G},${B},${a.toFixed(3)})`; traceCore(grow); ctx.fill();
    }
    ctx.fillStyle=`rgb(${R},${G},${B})`; traceCore(0); ctx.fill();

    const sc=_seedRnd(f+1801,ss,0,0);
    const passes=3+Math.floor(sc()*3);
    for(let p=0;p<passes;p++){
      const lift=0.82+sc()*0.4;
      const cr=Math.min(255,R*lift)|0, cg=Math.min(255,G*lift)|0, cb=Math.min(255,B*lift)|0;
      const px=cx0+cw0*(0.15+sc()*0.7), py=cy0+ch0*(0.15+sc()*0.7);
      const pr=Math.min(cw0,ch0)*(0.18+sc()*0.22);
      const grd=ctx.createRadialGradient(px,py,0,px,py,pr);
      grd.addColorStop(0,`rgba(${cr},${cg},${cb},0.16)`);grd.addColorStop(1,`rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle=grd; ctx.beginPath();ctx.arc(px,py,pr,0,Math.PI*2);ctx.fill();
    }
    const fr=_seedRnd(f+1901,ss,0,0);
    const frays=10+Math.floor(fr()*10);
    for(let i=0;i<frays;i++){
      const side=Math.floor(fr()*4), tt=fr();
      let [ex,ey]=edgePt(side,tt);
      const mx=cx0+cw0/2, my=cy0+ch0/2;
      const dx=(ex-mx), dy=(ey-my), dl=Math.hypot(dx,dy)||1;
      const reach=(Math.max(rimX,rimY))*(0.5+fr()*1.1);
      const tx=ex+dx/dl*reach, ty=ey+dy/dl*reach;
      const ga=0.10+fr()*0.12;
      const grd=ctx.createRadialGradient(ex,ey,0,tx,ty,reach);
      grd.addColorStop(0,`rgba(${R},${G},${B},${ga.toFixed(3)})`);grd.addColorStop(1,`rgba(${R},${G},${B},0)`);
      ctx.fillStyle=grd; ctx.beginPath();ctx.arc(tx,ty,reach*0.7,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  };

  // Per-field gentle rotation. Stacked/row layouts get a very subtle tilt;
  // the grid layout allows a touch more drift. Seeded per field.
  const ar=_seedRnd(311,ss,0,0);
  const maxTilt = layout===2 ? 0.10 : 0.045; // radians (~6° grid, ~2.5° else)
  for(let f=0;f<FIELDS;f++){
    if(f>=revealed) continue;
    const angle=(ar()-0.5)*2*maxTilt;
    drawField(f, fieldRects[f], angle);
  }
}

// Soft feathered rounded-rect field helper for new Rothko phases.
function _rothkoField(ctx,x,y,w,h,r,g,b,a){
  ctx.save();
  ctx.shadowColor=`rgba(${r},${g},${b},${a})`;ctx.shadowBlur=Math.max(8,Math.min(w,h)*0.12);
  ctx.fillStyle=`rgba(${r},${g},${b},${a})`;
  ctx.beginPath();const rad=Math.min(w,h)*0.06;
  ctx.moveTo(x+rad,y);ctx.lineTo(x+w-rad,y);ctx.quadraticCurveTo(x+w,y,x+w,y+rad);
  ctx.lineTo(x+w,y+h-rad);ctx.quadraticCurveTo(x+w,y+h,x+w-rad,y+h);
  ctx.lineTo(x+rad,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-rad);
  ctx.lineTo(x,y+rad);ctx.quadraticCurveTo(x,y,x+rad,y);
  ctx.closePath();ctx.fill();
  ctx.restore();
}

// ── Rothko D: Multiform — free blurred colour patches floating on a field. ──
function rothkoPhaseMultiform(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const g=_picChord(chords,0,gc,isBW).rgb;
  ctx.fillStyle=isBW?'#6a6660':`rgb(${Math.min(255,g[0]*0.5+90)},${Math.round(g[1]*0.5+60)},${Math.round(g[2]*0.4+30)})`;ctx.fillRect(0,0,CW,CH);
  const patches=Math.max(3,Math.min(20,Math.round(cn/6)));
  const vis=Math.max(1,Math.ceil(N/cn*patches));
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+6000,ss,0,0);
    const {rgb}=_picChord(chords,Math.floor(i*(cn/patches)),gc,isBW);
    const x=CW*(0.1+rnd()*0.6),y=CH*(0.1+rnd()*0.6),w=CW*(0.2+rnd()*0.35),h=CH*(0.12+rnd()*0.25);
    _rothkoField(ctx,x,y,w,h,rgb[0],rgb[1],rgb[2],0.7);
  }
}

// ── Rothko E: Seagram — dark maroon/black portal / blocked window. ──
function rothkoPhaseSeagram(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal=Math.max(0,Math.min(1,N/cn));
  const base=_picChord(chords,0,gc,isBW).rgb;
  // deep maroon ground
  const gr=isBW?40:Math.round(50+base[0]*0.12),gg=isBW?20:Math.round(8+base[1]*0.05),gb=isBW?22:Math.round(10+base[2]*0.05);
  ctx.fillStyle=`rgb(${gr},${gg},${gb})`;ctx.fillRect(0,0,CW,CH);
  // portal frame(s)
  const portals=Math.max(1,Math.min(3,Math.round(cn/40)));
  const vis=Math.max(1,Math.ceil(reveal*portals));
  const pw=CW/portals;
  for(let i=0;i<vis;i++){
    const {rgb}=_picChord(chords,Math.floor(i*(cn/portals)),gc,isBW);
    const cx=i*pw+pw/2;
    const ox=pw*0.5,oy=CH*0.42,iw=pw*0.34,ih=CH*0.3;
    // outer dark frame
    _rothkoField(ctx,cx-ox/2,CH*0.5-oy/2,ox,oy,Math.round(gr*1.6),Math.round(gg*1.3),Math.round(gb*1.3),0.85);
    // inner darker void tinted by chord
    _rothkoField(ctx,cx-iw/2,CH*0.5-ih/2,iw,ih,Math.round(rgb[0]*0.3+20),Math.round(rgb[1]*0.2),Math.round(rgb[2]*0.2),0.85);
  }
}

// ── Rothko F: Black on Grey recoloured — blue field over warm ochre. ──

// ── Rothko G: Incandescent — glowing orange/red/yellow stacked fields. ──
function rothkoPhaseIncandescent(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const base=_picChord(chords,0,gc,isBW).rgb;
  // Song-aware baseline tint (35% lerp) — Rothko's late incandescent series
  // glowed warm orange/red/yellow; we keep that fire but let each piece
  // burn in its own colour. A magenta-rich song shifts the bands into hot
  // pink-coral; a wandering Romantic piece into burnt sienna and rust.
  const _tint = (!isBW && typeof _songTint === 'function') ? _songTint(chords, gc) : null;
  const _T = (b)=> (typeof _tintBaseline === 'function') ? _tintBaseline(b, _tint, 0.35) : b.slice();
  const _bGnd   = _T([200, 70, 16]);
  const _bField = _T([180, 60, 20]);
  // hot ground
  ctx.fillStyle=isBW?'#8a8580':`rgb(${Math.min(255,_bGnd[0]+base[0]*0.2)},${Math.round(_bGnd[1]+base[1]*0.2)},${Math.round(_bGnd[2]+base[2]*0.1)})`;ctx.fillRect(0,0,CW,CH);
  const fields=Math.max(2,Math.min(4,Math.round(cn/30)));
  const vis=Math.max(1,Math.ceil(N/cn*fields));
  const marginX=CW*0.08,innerW=CW*0.84,innerY=CH*0.06,innerH=CH*0.88,gap=innerH*0.03;
  const availH=innerH-gap*(fields-1),fh=availH/fields;
  for(let i=0;i<vis;i++){
    const {rgb}=_picChord(chords,Math.floor(i*(cn/fields)),gc,isBW);
    // push toward incandescent warm, now song-tinted
    const r=isBW?Math.round((rgb[0]+rgb[1]+rgb[2])/3):Math.min(255,Math.round(_bField[0]+rgb[0]*0.3));
    const g=isBW?r:Math.min(255,Math.round(_bField[1]+rgb[1]*0.5));
    const b=isBW?r:Math.round(_bField[2]+rgb[2]*0.3);
    _rothkoField(ctx,marginX,innerY+i*(fh+gap),innerW,fh,r,g,b,0.9);
  }
}

// ── Rothko H: Pastel / Light period — soft pinks, pale neutrals, high
// luminosity. The opposite of Seagram/Chapel: cream ground + 3 stacked pale
// fields. Each field's chord colour is pushed toward pastel (chord*0.35 + 175)
// so saturation stays low and brightness stays high. The "happy" Rothko.
function rothkoPhasePastel(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));

  // Warm cream ground (or pale grey in B/W).
  ctx.fillStyle = isBW ? '#e0dcd2' : '#f0e2d6';
  ctx.fillRect(0,0,CW,CH);

  // Canvas grain noise — palette-independent.
  for(let i=0;i<800;i++){
    const rnd = _seedRnd(i+10000, ss, 0, 0);
    const tone = isBW ? '200,200,200' : '220,200,180';
    ctx.fillStyle = `rgba(${tone},${(0.1+rnd()*0.15).toFixed(2)})`;
    ctx.fillRect(rnd()*CW, rnd()*CH, 1+rnd()*2, 1+rnd()*2);
  }

  // 3 stacked pale fields with low saturation, high luminosity.
  const fields = 3;
  const marginX = CW*0.08, marginY = CH*0.08;
  const fieldGap = CH*0.025;
  const availH = CH - 2*marginY - (fields-1)*fieldGap;
  const fh = availH/fields;
  const vis = Math.max(1, Math.ceil(fields*reveal));

  for(let i=0;i<vis;i++){
    const ci = Math.floor((i+0.5)/fields * cn);
    const {rgb} = _picChord(chords, ci, gc, isBW);
    // Push toward pastel: high lightness, low saturation
    const r = isBW
      ? Math.min(255, Math.round(rgb[0]*0.35 + 175))
      : Math.min(255, Math.round(rgb[0]*0.35 + 175));
    const g = isBW
      ? r
      : Math.min(255, Math.round(rgb[1]*0.35 + 160));
    const b = isBW
      ? r
      : Math.min(255, Math.round(rgb[2]*0.40 + 170));
    const y = marginY + i*(fh + fieldGap);
    _rothkoField(ctx, marginX, y, CW - 2*marginX, fh, r, g, b, 0.92);
  }
}

// ── Rothko I: Chapel — Houston Rothko Chapel (1964-67). Triptych of three
// ultra-dark monochromatic panels (deep plum-maroon-blackish range). Chord
// saturation pushed down ~90%, brightness pushed down. Subtle vertical light
// gradient simulates the chapel skylight. Pure meditation, no contrast.
function rothkoPhaseChapel(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));

  // Pure dark plum-black ground (or near-black grey in B/W).
  ctx.fillStyle = isBW ? '#15131a' : '#1a0d12';
  ctx.fillRect(0,0,CW,CH);

  // Triptych: 3 vertical panels.
  const margins = CW*0.05;
  const gap = CW*0.015;
  const panelW = (CW - 2*margins - 2*gap)/3;
  const panelY = CH*0.08;
  const panelH = CH*0.84;
  const vis = Math.max(1, Math.ceil(3*reveal));

  for(let p=0;p<vis;p++){
    const x = margins + p*(panelW+gap);
    const ci = Math.floor((p+0.5)/3 * cn);
    const {rgb} = _picChord(chords, ci, gc, isBW);
    // Very dark, low saturation
    const r = isBW
      ? Math.round((rgb[0]+rgb[1]+rgb[2])/3 * 0.18 + 22)
      : Math.round(rgb[0]*0.12 + 18);
    const g = isBW
      ? r
      : Math.round(rgb[1]*0.05 + 5);
    const b = isBW
      ? r
      : Math.round(rgb[2]*0.10 + 10);
    _rothkoField(ctx, x, panelY, panelW, panelH, r, g, b, 0.92);
  }

  // Subtle vertical light gradient overlay — simulates chapel skylight.
  const grad = ctx.createLinearGradient(0,0,0,CH);
  if(isBW){
    grad.addColorStop(0, 'rgba(245,245,245,0.06)');
    grad.addColorStop(0.5, 'rgba(245,245,245,0.0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.15)');
  } else {
    grad.addColorStop(0, 'rgba(255,240,210,0.07)');
    grad.addColorStop(0.5, 'rgba(255,240,210,0.0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.15)');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,CW,CH);
}

// Matisse canvas-wide overlay. Like Mondrian's Classic/Boogie split, Matisse
// commits to ONE of its two signatures per painting (stable from the session
// seed, re-rolls on Vary/Random):
//   • NESTED FRAME (Jazz plates): each region = concentric flat-color borders
//     in successive voice colors with an organic figure in the centre panel.
//   • SCATTERED CUT-OUTS: each region = a flat saturated ground with one large
//     strewn organic shape (blob / star / leaf / algae frond).
function drawMatisseOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim||!chords||!chords.length) return;
  const ss=sessionSeed|0;
  // ── PHASE CHOOSER: commit to ONE of Matisse's modes per painting ──
  // Stable from the session seed, re-rolls on Vary/Random. Weighted ~60/40 to A.
  //  A = Cell-based panels (the original: nested voice-color frames OR scattered
  //      cut-outs, one per partition rectangle — itself picks between the two).
  //  B = Big free-form cut-out collage (a few LARGE paper-cut shapes — leaves,
  //      stars, a snail spiral, algae — placed boldly across one flat luminous
  //      ground; his late "Jazz" / "The Snail" manner, not grid-bound).
  //  A = Cell-based panels — original.  B = Big cut-out collage — original.
  //  C = Brushy Fauve composition — Open Window Collioure 1905 manner:
  //      five vertical zones (warm wall · frame · window · frame · cool wall),
  //      window split at song-register horizon, brushy strokes per zone,
  //      violent complementary accents (orange in cobalt sky, red in green
  //      water, yellow in warm/cool walls). No scatter, no outlines.
  //  D = Nice interior (window/room bands with patterned panels).
  //  E = French Window at Collioure (1914) — Matisse's most radical painting:
  //      three vertical bands (pale lavender · dark sepia centre · pale olive)
  //      with painterly vertical brushstroke texture, segmented dividers, and
  //      2-5 pendulum hanging lines. (Replaces the previous Stained Glass slot;
  //      archived as _matissePhaseStainedGlass_archived below.)
  //  F = La Gerbe / The Snail (1953) — radial cut-out gesture: chord-derived
  //      vivid leaves fanning from central anchor across calm cream; jagged
  //      scissor edges, no outlines, asymmetric accents. (Replaces the old
  //      Jazz cuts shape-menu; archived as _matissePhaseJazz_archived below.)
  //  G = Memory of Oceania (1953) — late cut-out tapestry: 7-11 large flat
  //      colour blocks on warm cream priming + biomorphic curve connectors +
  //      small white blob accents.
  const _pn=_capN(8); const pick=((phaseIndex|0)%_pn+_pn)%_pn;
  if(pick===1){ matissePhaseB(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===2){ matissePhaseFauve(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===3){ matissePhaseNice(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===4){ matissePhaseFrenchWindow(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===5){ matissePhaseLaGerbe(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===7){ matissePhaseMemoryOceania(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  // Slots 0 and 6 both run phase A's cell-based panels; the slot picks the cell
  // treatment (0 = scattered cut-outs, 6 = nested concentric frames) instead of
  // a hidden seed bit — both reachable via Vary.
  matissePhaseA(ctx,CW,CH,chords,lim,gc,ss,mode, (pick===6)?1:0);
}

// ── Matisse phase A: the original cell-based panels (nested frames / scattered
// cut-outs, chosen per painting by a seed bit). ──
function matissePhaseA(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, forcedNested){
  const ss=sessionSeed|0;
  const {rects,MAX_RECTS,paintCount}=_partitionCanvas(chords,lim,ss,2400,0.34);
  // Cell treatment: scattered cut-outs vs nested concentric frames. Now chosen
  // by the phase slot (passed in as forcedNested) so both are reachable via Vary;
  // the old seed bit remains only as a defensive fallback if no slot is passed.
  const nestedMode = (forcedNested!=null) ? (forcedNested===1) : (((ss>>>5)&1)===1);
  ctx.fillStyle='#16120a'; ctx.fillRect(0,0,CW,CH);
  const blob=(rnd,cx,cy,rad,wob,pts)=>{ctx.beginPath();for(let i=0;i<=pts;i++){const ang=(i/pts)*Math.PI*2;const rr=rad*(1+wob*Math.sin(ang*(2+Math.floor(rnd()*3))+rnd()*3));const x=cx+Math.cos(ang)*rr,y=cy+Math.sin(ang)*rr*0.92;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();};
  const star=(cx,cy,rad)=>{ctx.beginPath();for(let i=0;i<8;i++){const ang=(i/8)*Math.PI*2-Math.PI/2;const rr=(i%2===0)?rad:rad*0.36;const x=cx+Math.cos(ang)*rr,y=cy+Math.sin(ang)*rr;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();};
  const leaf=(cx,cy,len,wid,rot)=>{ctx.save();ctx.translate(cx,cy);ctx.rotate(rot);ctx.beginPath();ctx.moveTo(0,-len*0.5);ctx.bezierCurveTo(wid,-len*0.2,wid,len*0.3,0,len*0.5);ctx.bezierCurveTo(-wid,len*0.3,-wid,-len*0.2,0,-len*0.5);ctx.closePath();ctx.fill();ctx.restore();};
  const algae=(rnd,cx,cy,scale,rot)=>{ctx.save();ctx.translate(cx,cy);ctx.rotate(rot);ctx.beginPath();const lobes=3+Math.floor(rnd()*3);ctx.moveTo(0,scale*0.9);for(let i=0;i<=lobes;i++){const t=i/lobes;const y=scale*(0.9-1.8*t);const w=scale*(0.5*Math.sin(t*Math.PI)+0.12);ctx.quadraticCurveTo(w*1.6,y+scale*0.1,w*0.2,y-scale*0.18);}for(let i=lobes;i>=0;i--){const t=i/lobes;const y=scale*(0.9-1.8*t);const w=scale*(0.5*Math.sin(t*Math.PI)+0.12);ctx.quadraticCurveTo(-w*1.6,y+scale*0.1,-w*0.2,y-scale*0.18);}ctx.closePath();ctx.fill();ctx.restore();};
  rects.forEach((rect,pIdx)=>{
    const bx=rect.x*CW,by=rect.y*CH,BW=rect.w*CW,BH=rect.h*CH;
    if(pIdx>=paintCount){ return; }
    const _mci=Math.min(chords.length-1,Math.floor(pIdx*(chords.length/Math.max(1,MAX_RECTS))));
    _setCurE(chords[_mci] && chords[_mci]._E);
    const rnd=_seedRnd(pIdx+2500,ss,0,0);
    const base=_rectChordColor(chords,pIdx,MAX_RECTS,gc);

    if(nestedMode){
      // ── NESTED FRAME ── concentric voice-color rectangles + centre figure
      const layers=Math.min(4,2+Math.floor(Math.min(BW,BH)/60));
      let ix=bx,iy=by,iw=BW,ih=BH;
      for(let l=0;l<layers;l++){
        const c=_rectChordColor(chords,(pIdx+l)%MAX_RECTS,MAX_RECTS,gc);
        // alternate brightness per ring so borders read distinctly
        const f=(l%2===0)?1.0:0.7;
        ctx.fillStyle=`rgb(${Math.min(255,Math.round(c[0]*f))},${Math.min(255,Math.round(c[1]*f))},${Math.min(255,Math.round(c[2]*f))})`;
        ctx.fillRect(ix,iy,iw,ih);
        const insx=iw*(0.12+rnd()*0.05), insy=ih*(0.12+rnd()*0.05);
        ix+=insx; iy+=insy; iw-=2*insx; ih-=2*insy;
        if(iw<6||ih<6) break;
      }
      if(Math.min(BW,BH)<10) return;
      // organic figure in the innermost panel — white or a contrasting voice
      const fig = rnd()<0.6 ? [244,241,232] : _rectChordColor(chords,(pIdx+5)%MAX_RECTS,MAX_RECTS,gc);
      ctx.fillStyle=`rgb(${fig[0]|0},${fig[1]|0},${fig[2]|0})`;
      const cx=ix+iw/2, cy=iy+ih/2, rad=Math.min(iw,ih)*0.42;
      const fk=Math.floor(rnd()*3);
      if(fk===0) blob(rnd,cx,cy,rad*(0.9+rnd()*0.2),0.28,9+Math.floor(rnd()*3));
      else if(fk===1){ blob(rnd,cx,cy-rad*0.4,rad*0.6,0.25,8); blob(rnd,cx,cy+rad*0.5,rad*0.8,0.30,9); }
      else algae(rnd,cx,cy,rad*1.05,(rnd()-0.5)*0.8);
      return;
    }

    // ── SCATTERED CUT-OUTS ── flat ground + one strewn shape
    const gr=Math.round(base[0]*0.7),gg=Math.round(base[1]*0.7),gb=Math.round(base[2]*0.7);
    ctx.fillStyle=`rgb(${gr},${gg},${gb})`; ctx.fillRect(bx,by,BW,BH);
    if(Math.min(BW,BH)<8) return;
    const sib=_rectChordColor(chords,(pIdx+3)%MAX_RECTS,MAX_RECTS,gc);
    const sr=Math.min(255,Math.round(sib[0]*1.05+10)),sg=Math.min(255,Math.round(sib[1]*1.05+10)),sb=Math.min(255,Math.round(sib[2]*1.05+10));
    ctx.fillStyle=`rgb(${sr},${sg},${sb})`;
    const cx=bx+BW*(0.4+rnd()*0.2), cy=by+BH*(0.4+rnd()*0.2), rad=Math.min(BW,BH)*0.42;
    const kind=Math.floor(rnd()*4);
    if(kind===0) blob(rnd,cx,cy,rad*(0.85+rnd()*0.3),0.26+rnd()*0.12,9+Math.floor(rnd()*3));
    else if(kind===1) star(cx,cy,rad*(0.9+rnd()*0.25));
    else if(kind===2) leaf(cx,cy,Math.min(BW,BH)*(1.3+rnd()*0.4),rad*0.6,(rnd()-0.5)*2.2);
    else algae(rnd,cx,cy,rad*(1.1+rnd()*0.3),(rnd()-0.5)*2.4);
  });
  _setCurE(0.5);
}

// ── Matisse phase B: big free-form cut-out collage — his late "Jazz" / "The
// Snail" / "La Gerbe" manner. A FEW large, bold paper-cut shapes (leaves,
// stars, a snail spiral, algae, blobs) in flat saturated color, placed freely
// and well-spaced across ONE flat luminous ground — not grid-bound like phase
// A. Colors are sampled from the chords and snapped to flat saturated tones for
// that cut-paper character.
function matissePhaseB(ctx, CW, CH, chords, lim, gc, sessionSeed, mode){
  const ss=sessionSeed|0;
  const D=Math.min(CW,CH);
  const isBW=mode==='bw';
  const cn=chords.length;

  // Dominant chord color → flat luminous ground (Matisse grounds: blue, pink,
  // ochre, white). Lighten a touch so cut-outs pop.
  let domR=120,domG=110,domB=170,domSat=-1,aLum=0,c=0;
  const upto=Math.min(cn,Math.max(1,lim));
  for(let i=0;i<upto;i++){
    const chord=chords[i];const notes=chord&&(chord.n||chord.notes||[]);
    if(!notes||!notes.length) continue;
    for(const note of notes){const m=note.m!==undefined?note.m:note;const v=note.v!==undefined?note.v:80;const[r,g,b]=gc(m,v);const sat=Math.max(r,g,b)-Math.min(r,g,b);if(sat>domSat){domSat=sat;domR=r;domG=g;domB=b;}aLum+=0.299*r+0.587*g+0.114*b;c++;}
  }
  if(!c)c=1;
  const ground = isBW ? [232,228,220]
    : [Math.round(domR*0.5+90), Math.round(domG*0.5+90), Math.round(domB*0.5+95)];
  ctx.fillStyle=`rgb(${ground[0]},${ground[1]},${ground[2]})`;
  ctx.fillRect(0,0,CW,CH);

  // Flat saturated cut-out colors (the Jazz palette): force chord colors toward
  // pure, bold tones. Pastel tone skips the stretch so the cut-outs stay soft.
  const flat=(idx)=>{
    const chord=chords[Math.min(cn-1,Math.floor((idx/Math.max(1,12))*cn))];
    _setCurE(chord && chord._E);
    const notes=chord&&(chord.n||chord.notes||[]);
    let r=200,g=70,b=40;
    if(notes&&notes.length){let aR=0,aG=0,aB=0,k=0;for(const n of notes){const m=n.m!==undefined?n.m:n,v=n.v!==undefined?n.v:80;const[cr,cg,cb]=gc(m,v);aR+=cr;aG+=cg;aB+=cb;k++;}r=aR/k;g=aG/k;b=aB/k;}
    if(isBW){const lum=Math.round(0.299*r+0.587*g+0.114*b);return [lum,lum,lum];}
    if(_pastelOn) return [Math.round(r),Math.round(g),Math.round(b)];
    // stretch to full saturation, preserve hue
    const mx=Math.max(r,g,b,1),k=255/mx;let R=r*k,G=g*k,B=b*k,m2=Math.max(R,G,B);
    const pull=ch=>ch===m2?ch:ch*0.5;
    return [Math.round(pull(R)),Math.round(pull(G)),Math.round(pull(B))];
  };

  // Shape primitives (same vocabulary as phase A), drawn at the given center.
  const blob=(rnd,cx,cy,rad,wob,pts)=>{ctx.beginPath();for(let i=0;i<=pts;i++){const ang=(i/pts)*Math.PI*2;const rr=rad*(1+wob*Math.sin(ang*(2+Math.floor(rnd()*3))+rnd()*3));const x=cx+Math.cos(ang)*rr,y=cy+Math.sin(ang)*rr*0.92;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();};
  const star=(cx,cy,rad)=>{ctx.beginPath();for(let i=0;i<8;i++){const ang=(i/8)*Math.PI*2-Math.PI/2;const rr=(i%2===0)?rad:rad*0.36;const x=cx+Math.cos(ang)*rr,y=cy+Math.sin(ang)*rr;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();};
  const leaf=(cx,cy,len,wid,rot)=>{ctx.save();ctx.translate(cx,cy);ctx.rotate(rot);ctx.beginPath();ctx.moveTo(0,-len*0.5);ctx.bezierCurveTo(wid,-len*0.2,wid,len*0.3,0,len*0.5);ctx.bezierCurveTo(-wid,len*0.3,-wid,-len*0.2,0,-len*0.5);ctx.closePath();ctx.fill();ctx.restore();};
  const algae=(rnd,cx,cy,scale,rot)=>{ctx.save();ctx.translate(cx,cy);ctx.rotate(rot);ctx.beginPath();const lobes=3+Math.floor(rnd()*3);ctx.moveTo(0,scale*0.9);for(let i=0;i<=lobes;i++){const t=i/lobes;const y=scale*(0.9-1.8*t);const w=scale*(0.5*Math.sin(t*Math.PI)+0.12);ctx.quadraticCurveTo(w*1.6,y+scale*0.1,w*0.2,y-scale*0.18);}for(let i=lobes;i>=0;i--){const t=i/lobes;const y=scale*(0.9-1.8*t);const w=scale*(0.5*Math.sin(t*Math.PI)+0.12);ctx.quadraticCurveTo(-w*1.6,y+scale*0.1,-w*0.2,y-scale*0.18);}ctx.closePath();ctx.fill();ctx.restore();};
  const snail=(cx,cy,rad,col0,col1)=>{
    // Concentric rotated squares spiralling inward (homage to "The Snail").
    let s=rad, x=cx-rad, y=cy-rad, ang=0;
    for(let k=0;k<6 && s>rad*0.12;k++){
      ctx.save();ctx.translate(cx,cy);ctx.rotate(ang);
      ctx.fillStyle=`rgb(${(k%2?col1:col0).join(',')})`;
      ctx.fillRect(-s/2,-s/2,s,s);
      ctx.restore();
      s*=0.72; ang+=0.5;
    }
  };

  // A few large shapes, well spaced (farthest-point placement like Miró B).
  const shapeCount=Math.max(3,Math.min(14,3+Math.floor(cn/18)));
  const paintCount=Math.max(1,Math.min(shapeCount,Math.round(lim*(shapeCount/Math.max(1,cn)))));
  const placed=[];
  const pickPos=(rnd)=>{let best=null,bestD=-1;for(let t=0;t<6;t++){const x=CW*(0.13+rnd()*0.74),y=CH*(0.13+rnd()*0.74);let md=1e9;for(const p of placed){const d=Math.hypot(x-p.x,y-p.y);if(d<md)md=d;}if(!placed.length)md=1e9;if(md>bestD){bestD=md;best={x,y};}}return best;};

  for(let p=0;p<paintCount;p++){
    const rnd=_seedRnd(p+2700,ss, 0, 0);
    const pos=pickPos(rnd);placed.push(pos);
    const cx=pos.x,cy=pos.y;
    const col=flat(p);
    ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
    const rad=D*(0.10+rnd()*0.12);
    const kind=Math.floor(rnd()*5);
    if(kind===0) leaf(cx,cy,rad*2.4,rad*0.95,(rnd()-0.5)*Math.PI);
    else if(kind===1) star(cx,cy,rad*1.25);
    else if(kind===2) algae(rnd,cx,cy,rad*1.6,(rnd()-0.5)*1.6);
    else if(kind===3) blob(rnd,cx,cy,rad*1.15,0.24+rnd()*0.14,9+Math.floor(rnd()*3));
    else { const col1=flat(p+2); snail(cx,cy,rad*1.8,col,col1); }
  }
}

// ── Matisse C: Brushy Fauve composition — Open Window Collioure 1905 manner.
// Five vertical zones (warm wall · frame · window · frame · cool wall) with
// chord-derived palette per zone. Each zone is filled with brushy paint-quality
// strokes (irregular 4-vertex polys with vertex jitter), no outlines anywhere.
// Window splits horizontally at song-register driven horizon. Violent
// complementary accents (orange in cobalt sky, red in green water, yellow in
// violet walls) bring the Fauve dissonance. Stroke count + accent count driven
// by song density / energy. No scatter, no clean ellipses, no outlines.
function matissePhaseFauve(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0;
  const isBW=mode==='bw';
  const cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const reveal=Math.max(0,Math.min(1,N/cn));
  const D=Math.min(CW,CH);

  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const energy=_ch?_ch.energy:0.5;
  const density=_ch?_ch.density:0.3;
  const register=_ch?_ch.register:0.5;

  // Warm cream priming ground — Matisse always paints over warm underlayer.
  ctx.fillStyle=isBW?'#e0d8c8':'#e8d8b4';
  ctx.fillRect(0,0,CW,CH);

  // ── Five-zone composition ──
  // Zones: warm-wall · frame · window · frame · cool-wall
  // Frame widths fixed (decorative); wall/window widths balanced.
  // Composition is asymmetric — slight shift driven by session seed.
  const sR=_seedRnd(40001,ss,0,3); sR(); sR();
  const asym=(sR()-0.5)*0.06;       // ±3% asymmetry
  const wallL_w=0.20+asym;
  const frameL_w=0.07;
  const window_w=0.46-asym*2;
  const frameR_w=0.07;
  const wallR_w=0.20+asym;

  // Horizon Y driven by register: low register → high horizon (sky tall),
  // high register → low horizon (sky narrow, water/garden tall).
  const horizonY=CH*(0.40+(1-register)*0.30);

  // ── Per-zone chord-derived base colour (the FLAT ground brush) ──
  const _zoneBase=(idx)=>{
    const {rgb}=_picChord(chords,Math.floor(idx*cn/8)%cn,gc,isBW);
    return rgb;
  };

  // Helper: bias chord colour toward a Fauve "role" (warm/cool/cobalt/etc).
  // The chord-colour KEEPS its hue character but is pushed into the role's zone.
  const _biasToward=(rgb,target,strength)=>{
    return [
      Math.round(rgb[0]*(1-strength)+target[0]*strength),
      Math.round(rgb[1]*(1-strength)+target[1]*strength),
      Math.round(rgb[2]*(1-strength)+target[2]*strength)
    ];
  };

  // Role anchors (Fauve archetypal palette — used to STEER chord colours,
  // not replace them).
  const T_WARM_WALL =[210,55,75];     // pink/red wall
  const T_FRAME     =[230,165,40];    // ochre / gold frame
  const T_SKY       =[35,90,180];     // cobalt sky
  const T_WATER     =[40,150,110];    // emerald / kelly green
  const T_COOL_WALL =[170,55,135];    // magenta / violet wall

  // Complementary accents — the Fauve dissonance.
  const A_ORANGE   =[255,140,30];
  const A_RED      =[220,40,50];
  const A_YELLOW   =[250,215,70];

  // Get zone base colour by blending chord colour with role target.
  const zoneCol=(roleTarget,chordIdx,strength)=>{
    const base=_zoneBase(chordIdx);
    let c=_biasToward(base,roleTarget,strength);
    if(isBW){
      const lum=Math.round(c[0]*0.299+c[1]*0.587+c[2]*0.114);
      c=[lum,lum,lum];
    }
    if(typeof _energyTint==='function'){const t=_energyTint(c[0],c[1],c[2]);c=[t[0],t[1],t[2]];}
    if(typeof _pastelTint==='function'){const t=_pastelTint(c[0],c[1],c[2]);c=[t[0],t[1],t[2]];}
    return c;
  };

  // ── Paint zone bases (broad flat ground per zone) ──
  let xPos=0;
  // Wall left
  const wallL_x=xPos*CW; const wallL_W=wallL_w*CW;
  const wallL_col=zoneCol(T_WARM_WALL,0,0.55);
  ctx.fillStyle=`rgb(${wallL_col[0]},${wallL_col[1]},${wallL_col[2]})`;
  ctx.fillRect(wallL_x,0,wallL_W,CH);
  xPos+=wallL_w;

  const frameL_x=xPos*CW; const frameL_W=frameL_w*CW;
  const frameL_col=zoneCol(T_FRAME,1,0.65);
  ctx.fillStyle=`rgb(${frameL_col[0]},${frameL_col[1]},${frameL_col[2]})`;
  ctx.fillRect(frameL_x,0,frameL_W,CH);
  xPos+=frameL_w;

  const win_x=xPos*CW; const win_W=window_w*CW;
  const sky_col=zoneCol(T_SKY,2,0.55);
  const water_col=zoneCol(T_WATER,3,0.55);
  ctx.fillStyle=`rgb(${sky_col[0]},${sky_col[1]},${sky_col[2]})`;
  ctx.fillRect(win_x,0,win_W,horizonY);
  ctx.fillStyle=`rgb(${water_col[0]},${water_col[1]},${water_col[2]})`;
  ctx.fillRect(win_x,horizonY,win_W,CH-horizonY);
  xPos+=window_w;

  const frameR_x=xPos*CW; const frameR_W=frameR_w*CW;
  const frameR_col=zoneCol(T_FRAME,4,0.65);
  ctx.fillStyle=`rgb(${frameR_col[0]},${frameR_col[1]},${frameR_col[2]})`;
  ctx.fillRect(frameR_x,0,frameR_W,CH);
  xPos+=frameR_w;

  const wallR_x=xPos*CW; const wallR_W=wallR_w*CW;
  const wallR_col=zoneCol(T_COOL_WALL,5,0.55);
  ctx.fillStyle=`rgb(${wallR_col[0]},${wallR_col[1]},${wallR_col[2]})`;
  ctx.fillRect(wallR_x,0,wallR_W,CH);

  // ── Brushy strokes per zone (the painted texture) ──
  // Stroke count grows with song density (busy songs = more brushy texture).
  const strokesPerZone=Math.max(8,Math.min(30,14+Math.round(density*16)));
  const drawZoneStrokes=(zoneX,zoneW,yTop,yBottom,roleTarget,zoneIdx)=>{
    const visStrokes=Math.max(2,Math.ceil(strokesPerZone*reveal));
    for(let i=0;i<visStrokes;i++){
      const rR=_seedRnd(i+40100+zoneIdx*500,ss,0,0); rR(); rR();
      // Per-stroke chord colour (gives Paintiano signature inside the zone).
      const {rgb,energy:sE}=_picChord(chords,(i+zoneIdx*7)%cn,gc,isBW);
      // Bias toward zone role at 0.40 strength — strokes vary but stay in family.
      let c=_biasToward(rgb,roleTarget,0.40);
      if(isBW){const l=Math.round(c[0]*0.299+c[1]*0.587+c[2]*0.114);c=[l,l,l];}
      if(typeof _energyTint==='function'){const t=_energyTint(c[0],c[1],c[2]);c=[t[0],t[1],t[2]];}
      if(typeof _pastelTint==='function'){const t=_pastelTint(c[0],c[1],c[2]);c=[t[0],t[1],t[2]];}
      const cx=zoneX+rR()*zoneW;
      const cy=yTop+rR()*(yBottom-yTop);
      // Brushy stroke: vertical-ish rect with irregular 4 corners.
      const sw=zoneW*(0.30+rR()*0.35);
      const sh=(yBottom-yTop)*(0.04+rR()*0.10);
      const ang=(rR()-0.5)*0.40;
      const cosR=Math.cos(ang), sinR=Math.sin(ang);
      const jit=4;
      const corners=[
        [-sw/2,-sh/2],
        [ sw/2+(rR()-0.5)*jit, -sh/2+(rR()-0.5)*jit],
        [ sw/2+(rR()-0.5)*jit,  sh/2+(rR()-0.5)*jit],
        [-sw/2+(rR()-0.5)*jit,  sh/2+(rR()-0.5)*jit]
      ];
      ctx.beginPath();
      for(let p=0;p<4;p++){
        const lx=corners[p][0], ly=corners[p][1];
        const gx=cx+lx*cosR-ly*sinR;
        const gy=cy+lx*sinR+ly*cosR;
        if(p===0) ctx.moveTo(gx,gy); else ctx.lineTo(gx,gy);
      }
      ctx.closePath();
      const a=(0.72+sE*0.22).toFixed(2);
      ctx.fillStyle=`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
      ctx.fill();
    }
  };

  drawZoneStrokes(wallL_x,wallL_W,0,CH,T_WARM_WALL,0);
  drawZoneStrokes(frameL_x,frameL_W,0,CH,T_FRAME,1);
  drawZoneStrokes(win_x,win_W,0,horizonY,T_SKY,2);
  drawZoneStrokes(win_x,win_W,horizonY,CH,T_WATER,3);
  drawZoneStrokes(frameR_x,frameR_W,0,CH,T_FRAME,4);
  drawZoneStrokes(wallR_x,wallR_W,0,CH,T_COOL_WALL,5);

  // ── Violent complementary accents (the Fauve "wrongness" notes) ──
  // Count scales with energy — louder songs get more accent dissonance.
  const accentCt=Math.max(3,Math.min(14,4+Math.round(energy*8)));
  const visAccents=Math.max(1,Math.ceil(accentCt*reveal));
  const drawAccent=(zoneX,zoneW,yTop,yBottom,col,idx)=>{
    const aR=_seedRnd(idx+42000,ss,0,0); aR(); aR();
    const cx=zoneX+aR()*zoneW;
    const cy=yTop+aR()*(yBottom-yTop);
    const sz=D*(0.022+aR()*0.030);
    let c=col;
    if(isBW){const l=Math.round(c[0]*0.299+c[1]*0.587+c[2]*0.114);c=[l,l,l];}
    if(typeof _energyTint==='function'){const t=_energyTint(c[0],c[1],c[2]);c=[t[0],t[1],t[2]];}
    if(typeof _pastelTint==='function'){const t=_pastelTint(c[0],c[1],c[2]);c=[t[0],t[1],t[2]];}
    // Irregular accent dot — small brushy mark, NOT a perfect circle.
    ctx.beginPath();
    for(let ti=0;ti<8;ti++){
      const t=ti/8*Math.PI*2;
      const rr=sz*(0.70+aR()*0.55);
      const x=cx+Math.cos(t)*rr, y=cy+Math.sin(t)*rr;
      if(ti===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.fillStyle=`rgba(${c[0]|0},${c[1]|0},${c[2]|0},0.92)`;
    ctx.fill();
  };

  // Orange in cobalt sky (complementary), red in green water (complementary),
  // yellow in violet/red walls (complementary).
  for(let i=0;i<visAccents;i++){
    const tag=i%4;
    if(tag===0) drawAccent(win_x,win_W,0,horizonY,A_ORANGE,i*4+0);
    else if(tag===1) drawAccent(win_x,win_W,horizonY,CH,A_RED,i*4+1);
    else if(tag===2) drawAccent(wallL_x,wallL_W,0,CH,A_YELLOW,i*4+2);
    else drawAccent(wallR_x,wallR_W,0,CH,A_YELLOW,i*4+3);
  }

  // ── Loose horizon brush — a few horizontal strokes along the window's
  // horizon line so the split doesn't read as a hard rectangle edge. ──
  if(reveal>0.20){
    const hStrokes=3+Math.floor(density*3);
    for(let i=0;i<hStrokes;i++){
      const hR=_seedRnd(i+43000,ss,0,0); hR();
      const cx=win_x+(i+0.5)*(win_W/hStrokes)+(hR()-0.5)*win_W*0.10;
      const cy=horizonY+(hR()-0.5)*8;
      const sw=win_W*(0.12+hR()*0.10);
      const sh=CH*0.014;
      const ang=(hR()-0.5)*0.15;
      const cosR=Math.cos(ang), sinR=Math.sin(ang);
      const jit=3;
      const corners=[
        [-sw/2,-sh/2],
        [ sw/2+(hR()-0.5)*jit, -sh/2+(hR()-0.5)*jit],
        [ sw/2+(hR()-0.5)*jit,  sh/2+(hR()-0.5)*jit],
        [-sw/2+(hR()-0.5)*jit,  sh/2+(hR()-0.5)*jit]
      ];
      ctx.beginPath();
      for(let p=0;p<4;p++){
        const lx=corners[p][0], ly=corners[p][1];
        const gx=cx+lx*cosR-ly*sinR;
        const gy=cy+lx*sinR+ly*cosR;
        if(p===0) ctx.moveTo(gx,gy); else ctx.lineTo(gx,gy);
      }
      ctx.closePath();
      // Horizon brush takes a muted ochre / warm grey
      const hCol=isBW?[100,90,80]:[180,140,60];
      ctx.fillStyle=`rgba(${hCol[0]},${hCol[1]},${hCol[2]},0.78)`;
      ctx.fill();
    }
  }
}

// ── Matisse E: French Window at Collioure (1914) — Matisse's most radical
// painting, predates Rothko / Newman color-field by 35+ years. Three vertical
// bands: pale lavender (cool side), dark sepia (dominant centre void), pale
// olive (warm side). The centre is the radical core — chord 0 darkened into
// sepia/plum/brown family. Painterly vertical brushstroke texture per band
// (NOT flat fills), segmented painterly dividers (NOT hard lines), and 2–5
// thin pendulum/hanging lines from the chord velocity peaks.
function matissePhaseFrenchWindow(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0;
  const isBW=mode==='bw';
  const cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const reveal=Math.max(0,Math.min(1,N/cn));
  const D=Math.min(CW,CH);

  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const energy=_ch?_ch.energy:0.5;
  const density=_ch?_ch.density:0.3;

  // Outer canvas underlayer — visible at edges and through painterly gaps.
  ctx.fillStyle=isBW?'#3a3232':'#3a2a26';
  ctx.fillRect(0,0,CW,CH);

  // ── 3-band asymmetric widths driven by density ──
  // Calm song → balanced 33/33/33; energetic → strong centre dominance.
  const sR=_seedRnd(48001,ss,0,0); sR(); sR();
  const centerBias=0.05+density*0.20; // 0.05–0.25 extra to centre
  let leftW=(0.33-centerBias/2)*CW + (sR()-0.5)*CW*0.03;
  let centerW=(0.34+centerBias)*CW + (sR()-0.5)*CW*0.03;
  if(leftW<CW*0.18) leftW=CW*0.18;
  if(centerW<CW*0.25) centerW=CW*0.25;
  let rightW=CW-leftW-centerW;
  if(rightW<CW*0.18){ rightW=CW*0.18; centerW=CW-leftW-rightW; }

  // Anchor palette — Collioure 1914 trinity
  const T_LAVENDER=[165,175,200];
  const T_SEPIA   =[ 75, 45, 50];
  const T_OLIVE   =[180,185,145];

  // Helper: chord colour biased toward role, with energy/pastel tints.
  const _bandCol=(idx,target,strength)=>{
    const {rgb}=_picChord(chords,idx%cn,gc,isBW);
    let r=rgb[0], g=rgb[1], b=rgb[2];
    if(isBW){
      const l=Math.round(r*0.299+g*0.587+b*0.114);
      r=g=b=l;
    }
    r=Math.round(r*(1-strength)+target[0]*strength);
    g=Math.round(g*(1-strength)+target[1]*strength);
    b=Math.round(b*(1-strength)+target[2]*strength);
    if(typeof _energyTint==='function'){const t=_energyTint(r,g,b);r=t[0];g=t[1];b=t[2];}
    if(typeof _pastelTint==='function'){const t=_pastelTint(r,g,b);r=t[0];g=t[1];b=t[2];}
    return [r|0,g|0,b|0];
  };

  // ── PAINTERLY BAND ──
  // Base fill + ~40 vertical brushstrokes + horizontal patches. NOT a flat
  // rectangle — the band must read as oil on canvas.
  const paintBand=(x,y,w,h,baseCol,slot,isCenter)=>{
    if(w<=0) return;
    ctx.fillStyle=`rgb(${baseCol[0]},${baseCol[1]},${baseCol[2]})`;
    ctx.fillRect(x,y,w,h);
    const stripeRng=_seedRnd(slot*1000+48100,ss,0,0); stripeRng(); stripeRng();
    const stripes=40+Math.floor(density*20);
    for(let s=0;s<stripes;s++){
      const sx=x+stripeRng()*w;
      const sw=2+stripeRng()*(w*0.05);
      const sy=y+stripeRng()*h*0.4;
      const sh=h*(0.4+stripeRng()*0.7);
      const lift=stripeRng()<0.5?14:-14;
      const a=0.10+stripeRng()*0.18;
      const cR=Math.max(0,Math.min(255,baseCol[0]+lift));
      const cG=Math.max(0,Math.min(255,baseCol[1]+lift));
      const cB=Math.max(0,Math.min(255,baseCol[2]+lift));
      ctx.fillStyle=`rgba(${cR},${cG},${cB},${a.toFixed(2)})`;
      ctx.fillRect(sx,sy,sw,sh);
    }
    const patches=isCenter?50:25;
    for(let p=0;p<patches;p++){
      const py=y+stripeRng()*h;
      const pw=w*(0.30+stripeRng()*0.45);
      const ph=6+stripeRng()*14;
      const px=x+stripeRng()*(w-pw);
      const lift=stripeRng()<0.5?12:-10;
      const a=0.08+stripeRng()*0.14;
      const cR=Math.max(0,Math.min(255,baseCol[0]+lift));
      const cG=Math.max(0,Math.min(255,baseCol[1]+lift));
      const cB=Math.max(0,Math.min(255,baseCol[2]+lift));
      ctx.fillStyle=`rgba(${cR},${cG},${cB},${a.toFixed(2)})`;
      ctx.fillRect(px,py,pw,ph);
    }
  };

  // ── Reveal: left → right → centre ──
  if(reveal>0){
    paintBand(0,0,leftW,CH,_bandCol(1,T_LAVENDER,0.55),1,false);
  }
  if(reveal>0.20){
    paintBand(leftW+centerW,0,rightW,CH,_bandCol(2,T_OLIVE,0.55),2,false);
  }
  if(reveal>0.40){
    // Centre: chord 0 (root) darkened toward sepia — the radical void core.
    const v0=_picChord(chords,0,gc,isBW);
    let cR=Math.round(v0.rgb[0]*0.30+30);
    let cG=Math.round(v0.rgb[1]*0.25+20);
    let cB=Math.round(v0.rgb[2]*0.25+22);
    if(isBW){
      const l=Math.round(cR*0.299+cG*0.587+cB*0.114);
      cR=cG=cB=l;
    }
    cR=Math.round(cR*0.45+T_SEPIA[0]*0.55);
    cG=Math.round(cG*0.45+T_SEPIA[1]*0.55);
    cB=Math.round(cB*0.45+T_SEPIA[2]*0.55);
    if(typeof _energyTint==='function'){const t=_energyTint(cR,cG,cB);cR=t[0];cG=t[1];cB=t[2];}
    if(typeof _pastelTint==='function'){const t=_pastelTint(cR,cG,cB);cR=t[0];cG=t[1];cB=t[2];}
    paintBand(leftW,0,centerW,CH,[cR|0,cG|0,cB|0],3,true);
  }

  // ── PAINTERLY DIVIDERS — segmented vertical lines at band boundaries ──
  if(reveal>0.10){
    const dividerRng=_seedRnd(48200,ss,0,0); dividerRng(); dividerRng();
    const dCol=isBW?[42,38,38]:[40,28,30];
    const drawDivider=(xPos)=>{
      const segs=20;
      for(let s=0;s<segs;s++){
        const sy=s*CH/segs+dividerRng()*5;
        const sh=CH/segs*(0.7+dividerRng()*0.4);
        const a=0.20+dividerRng()*0.30;
        ctx.fillStyle=`rgba(${dCol[0]},${dCol[1]},${dCol[2]},${a.toFixed(2)})`;
        ctx.fillRect(xPos-1.5,sy,3,sh);
      }
    };
    drawDivider(leftW);
    drawDivider(leftW+centerW);
  }

  // ── PENDULUM / HANGING LINES ──
  // 2–5 thin dangling vertical lines, count from energy. Bias placement to
  // the lavender (left) and sepia (centre) bands — matches the 1914 original.
  if(reveal>0.50){
    const pendCount=Math.max(2,Math.min(5,2+Math.round(energy*3)));
    const visPend=Math.max(0,Math.ceil(pendCount*reveal));
    const pCol=isBW?'rgba(40,40,40,0.78)':'rgba(28,22,22,0.78)';
    for(let pi=0;pi<visPend;pi++){
      const pR=_seedRnd(pi+48400,ss,0,0); pR(); pR();
      const inLeft=pR()<0.55;
      const x=inLeft
        ? leftW*(0.30+pR()*0.50)
        : leftW+centerW*(0.20+pR()*0.60);
      const yStart=CH*(0.15+pR()*0.30);
      const len=CH*(0.10+pR()*0.45);
      const yEnd=Math.min(CH*0.92,yStart+len);
      const thick=1.4+pR()*0.8;
      const xEnd=x+(pR()-0.5)*4;
      const midX=(x+xEnd)/2+(pR()-0.5)*5;
      ctx.strokeStyle=pCol;
      ctx.lineWidth=thick;
      ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(x,yStart);
      ctx.bezierCurveTo(midX,yStart+len*0.3,midX,yStart+len*0.7,xEnd,yEnd);
      ctx.stroke();
      ctx.fillStyle=pCol;
      ctx.beginPath();
      ctx.arc(x,yStart,thick+0.5,0,Math.PI*2);
      ctx.fill();
    }
  }

  // ── OVERALL CANVAS GRAIN — 250 small dark dots ──
  // Paper/canvas texture across all bands. Makes the surface read as oil on
  // primed canvas, not as flat digital fill.
  if(reveal>0.05){
    const grainRng=_seedRnd(48700,ss,0,0); grainRng();
    for(let g=0;g<250;g++){
      const gx=grainRng()*CW;
      const gy=grainRng()*CH;
      const gs=1+grainRng()*1.5;
      const a=0.08+grainRng()*0.10;
      ctx.fillStyle=`rgba(28,20,18,${a.toFixed(2)})`;
      ctx.fillRect(gx,gy,gs,gs);
    }
  }
}


// ── ARCHIVED: Matisse E Stained glass grid — Vence chapel jewel grid attempt.
// Dispatcher no longer calls this; kept for possible future return. Replaced
// in slot 4 by matissePhaseFrenchWindow (Collioure 1914 manner). To restore,
// rename back to matissePhaseStainedGlass and call from drawMatisseOverlay
// slot 4.
function _matissePhaseStainedGlass_archived(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0;
  const isBW=mode==='bw';
  const cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const reveal=Math.max(0,Math.min(1,N/cn));
  const D=Math.min(CW,CH);

  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const energy=_ch?_ch.energy:0.5;
  const density=_ch?_ch.density:0.3;
  const register=_ch?_ch.register:0.5;

  // Warm cream priming — visible through ornament cut-outs and behind every pane.
  const PRIMING=isBW?[226,222,212]:[232,222,200];
  ctx.fillStyle=`rgb(${PRIMING[0]},${PRIMING[1]},${PRIMING[2]})`;
  ctx.fillRect(0,0,CW,CH);

  // Lead colour — near-black, the structural "cames" between panes.
  const LEAD=isBW?[18,18,22]:[12,10,14];

  // ── Grid dimensions ──
  // Base 5×7 for portrait, but density drives variation: calm = looser
  // (4×6, fewer larger panes), energetic = tighter (6×8, many small panes).
  const aspect=CH/CW;
  const baseCols=aspect>1.2?5:7;          // portrait → fewer cols
  const baseRows=aspect>1.2?7:5;
  const denseAdj=Math.round((density-0.30)*3); // -1..+3 from typical density
  const cols=Math.max(3,Math.min(8,baseCols+denseAdj));
  const rows=Math.max(3,Math.min(10,baseRows+denseAdj));
  const cellW=CW/cols;
  const cellH=CH/rows;
  const totalCells=cols*rows;

  // ── Cell colour assignment via chord permutation ──
  // Each cell gets a chord-derived colour from a SHUFFLED chord index map,
  // stable per session. This creates the rhythmic colour scatter of stained
  // glass without per-cell randomness in fill colour.
  const permRnd=_seedRnd(44001,ss,0,0); permRnd(); permRnd();
  const perm=[];
  for(let i=0;i<totalCells;i++) perm.push(i);
  for(let i=perm.length-1;i>0;i--){
    const j=Math.floor(permRnd()*(i+1));
    const t=perm[i]; perm[i]=perm[j]; perm[j]=t;
  }

  // Dark structural cells — count scales with chord complexity (more harmonic
  // density = more structural weight). Bounded so the grid never goes too dark.
  const darkCount=Math.max(rows,Math.min(Math.floor(totalCells*0.18),rows+Math.floor(density*8)));
  const darkCells=new Set();
  for(let i=0;i<darkCount;i++) darkCells.add(perm[i]);

  // Jewel pane colour from chord — pushed toward saturation; Vence palette is
  // jewel-rich, not pastel.
  const _jewel=(idx)=>{
    const {rgb,energy:eC}=_picChord(chords,idx%cn,gc,isBW);
    let r=rgb[0], g=rgb[1], b=rgb[2];
    if(isBW){
      const lum=Math.round(r*0.299+g*0.587+b*0.114);
      r=g=b=lum;
    } else {
      // Saturation boost — jewel tones must be vivid. Skipped in pastel tone.
      if(!_pastelOn){
        const mx=Math.max(r,g,b,1);
        const boost=180/mx; // ensure max channel hits ~180+ for vivid read
        if(boost>1){
          r=Math.min(255,Math.round(r*boost));
          g=Math.min(255,Math.round(g*boost));
          b=Math.min(255,Math.round(b*boost));
        }
      }
    }
    if(typeof _energyTint==='function'){const t=_energyTint(r,g,b);r=t[0];g=t[1];b=t[2];}
    if(typeof _pastelTint==='function'){const t=_pastelTint(r,g,b);r=t[0];g=t[1];b=t[2];}
    return [r|0,g|0,b|0,eC];
  };

  // ── Cell pass — fill panes, draw ornaments ──
  // Lead inset breathing room around each pane (lead lines drawn on top).
  const inset=2.5;
  const visCells=Math.max(1,Math.ceil(totalCells*reveal));
  let cellIdx=0;

  // Reveal order: row-major (top-to-bottom, left-to-right), so the song builds
  // the window from the top down as more chords play. Predictable, not random.
  for(let ry=0;ry<rows;ry++){
    for(let cxi=0;cxi<cols;cxi++){
      if(cellIdx>=visCells){ cellIdx++; continue; }
      const xx=cxi*cellW, yy=ry*cellH;
      const idx=ry*cols+cxi;

      if(darkCells.has(idx)){
        // Dark structural pane — composes mass into the grid.
        ctx.fillStyle=`rgb(${LEAD[0]},${LEAD[1]},${LEAD[2]})`;
        ctx.fillRect(xx+inset,yy+inset,cellW-2*inset,cellH-2*inset);
        cellIdx++;
        continue;
      }

      // Jewel pane
      const jewelChordIdx=perm[idx];
      const jc=_jewel(jewelChordIdx);
      ctx.fillStyle=`rgb(${jc[0]},${jc[1]},${jc[2]})`;
      ctx.fillRect(xx+inset,yy+inset,cellW-2*inset,cellH-2*inset);

      // Ornament — energy gates frequency (calm songs = simpler grid, energetic
      // = more ornament). Ornament kind cycles through 4 chapel motifs.
      const ornRnd=_seedRnd(idx+45000,ss,0,0); ornRnd(); ornRnd();
      const ornChance=0.25+energy*0.25; // 0.25–0.50
      if(ornRnd()<ornChance){
        const ccx=xx+cellW/2, ccy=yy+cellH/2;
        const ornKind=Math.floor(ornRnd()*4);
        const innerC=_jewel(jewelChordIdx+3);

        if(ornKind===0){
          // Concentric circle — lead ring + inner jewel
          const orR=Math.min(cellW,cellH)*0.28;
          ctx.fillStyle=`rgb(${LEAD[0]},${LEAD[1]},${LEAD[2]})`;
          ctx.beginPath(); ctx.arc(ccx,ccy,orR,0,Math.PI*2); ctx.fill();
          ctx.fillStyle=`rgb(${innerC[0]},${innerC[1]},${innerC[2]})`;
          ctx.beginPath(); ctx.arc(ccx,ccy,orR*0.55,0,Math.PI*2); ctx.fill();
        } else if(ornKind===1){
          // Cross / plus — chapel motif
          const armW=cellW*0.16, armL=Math.min(cellW,cellH)*0.32;
          ctx.fillStyle=`rgb(${LEAD[0]},${LEAD[1]},${LEAD[2]})`;
          ctx.fillRect(ccx-armW/2,ccy-armL,armW,armL*2);
          ctx.fillRect(ccx-armL,ccy-armW/2,armL*2,armW);
        } else if(ornKind===2){
          // Leaf / flame — vegetal vertical form (chapel organic motif)
          const orR=Math.min(cellW,cellH)*0.36;
          ctx.fillStyle=`rgb(${LEAD[0]},${LEAD[1]},${LEAD[2]})`;
          ctx.beginPath();
          const nPts=14;
          for(let ti=0;ti<=nPts;ti++){
            const t=ti/nPts;
            const yLocal=(t-0.5)*orR*1.7;
            const xMax=orR*0.55*Math.pow(Math.sin(t*Math.PI),1.3);
            if(ti===0) ctx.moveTo(ccx+xMax,ccy+yLocal);
            else ctx.lineTo(ccx+xMax,ccy+yLocal);
          }
          for(let ti=nPts;ti>=0;ti--){
            const t=ti/nPts;
            const yLocal=(t-0.5)*orR*1.7;
            const xMax=orR*0.55*Math.pow(Math.sin(t*Math.PI),1.3);
            ctx.lineTo(ccx-xMax,ccy+yLocal);
          }
          ctx.closePath(); ctx.fill();
        } else {
          // Diagonal split — dynamic note in the static grid
          ctx.fillStyle=`rgb(${innerC[0]},${innerC[1]},${innerC[2]})`;
          ctx.beginPath();
          if(ornRnd()<0.5){
            ctx.moveTo(xx+inset,yy+inset);
            ctx.lineTo(xx+cellW-inset,yy+inset);
            ctx.lineTo(xx+inset,yy+cellH-inset);
          } else {
            ctx.moveTo(xx+cellW-inset,yy+inset);
            ctx.lineTo(xx+cellW-inset,yy+cellH-inset);
            ctx.lineTo(xx+inset,yy+cellH-inset);
          }
          ctx.closePath(); ctx.fill();
        }
      }
      cellIdx++;
    }
  }

  // ── Lead lines (drawn AFTER panes, on top) ──
  // Vertical
  const leadW=Math.max(2.5,D*0.005);
  ctx.strokeStyle=`rgb(${LEAD[0]},${LEAD[1]},${LEAD[2]})`;
  ctx.lineWidth=leadW;
  for(let cxi=0;cxi<=cols;cxi++){
    const xx=cxi*cellW;
    ctx.beginPath(); ctx.moveTo(xx,0); ctx.lineTo(xx,CH); ctx.stroke();
  }
  for(let ry=0;ry<=rows;ry++){
    const yy=ry*cellH;
    ctx.beginPath(); ctx.moveTo(0,yy); ctx.lineTo(CW,yy); ctx.stroke();
  }
  // Outer frame thicker
  ctx.lineWidth=leadW*2.2;
  ctx.strokeRect(0,0,CW,CH);
}


// ── Matisse D: Nice interior v2 — 2-4 vertical panels with 4 pattern types. ──
function matissePhaseNice(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const sR=_seedRnd(41001,ss,0,0); sR(); sR();
  const {rgb:bg0}=_picChord(chords,0,gc,isBW);
  const bgPale=[Math.min(255,Math.round(bg0[0]*0.4+150)),Math.min(255,Math.round(bg0[1]*0.4+150)),Math.min(255,Math.round(bg0[2]*0.4+150))];
  ctx.fillStyle=`rgb(${bgPale[0]},${bgPale[1]},${bgPale[2]})`; ctx.fillRect(0,0,CW,CH);
  const INK=isBW?'rgba(20,20,20,0.71)':'rgba(15,12,20,0.71)';
  const nPanels=2+((sR()*3)|0);
  const pw=CW/nPanels;
  const vis=Math.max(1,Math.ceil(N/cn*nPanels*2.5));
  for(let i=0;i<Math.min(nPanels,vis);i++){
    const {rgb}=_picChord(chords,(i+1)%cn,gc,isBW);
    const x=i*pw;
    const pattern=(_seedRnd(i+41500,ss,0,0)()*4)|0;
    if(pattern===0){
      const sw=Math.max(3,pw/8);
      for(let s=0;s<Math.floor(pw/sw);s++){
        ctx.fillStyle=(s%2===0)?`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`:`rgb(${bgPale[0]},${bgPale[1]},${bgPale[2]})`;
        ctx.fillRect(x+s*sw,0,sw,CH);
      }
    } else if(pattern===1){
      ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; ctx.fillRect(x,0,pw,CH);
      const sp=Math.max(8,pw/6);
      ctx.fillStyle=`rgb(${bgPale[0]},${bgPale[1]},${bgPale[2]})`;
      let yy=sp/2;
      while(yy<CH){
        const offs=(Math.floor(yy/sp)%2)*sp/2;
        let xx=x+sp/2+offs;
        while(xx<x+pw){ ctx.beginPath(); ctx.arc(xx,yy,sp*0.18,0,Math.PI*2); ctx.fill(); xx+=sp; }
        yy+=sp;
      }
    } else if(pattern===2){
      ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; ctx.fillRect(x,0,pw,CH);
      const {rgb:lc}=_picChord(chords,(i*5+99)%cn,gc,isBW);
      const nLeaves=5+((sR()*8)|0);
      ctx.fillStyle=`rgba(${lc[0]},${lc[1]},${lc[2]},0.86)`;
      for(let li=0;li<nLeaves;li++){
        const lR=_seedRnd(li+41800+i*100,ss,0,0);
        const lcx=x+lR()*pw, lcy=lR()*CH;
        const lr=pw*0.10;
        ctx.beginPath();
        for(let ti=0;ti<16;ti++){
          const t=ti/16*Math.PI*2;
          const rr=lr*(1.0+0.4*Math.sin(t*3));
          const px=lcx+Math.cos(t)*rr*0.5, py=lcy+Math.sin(t)*rr;
          if(ti===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        }
        ctx.closePath(); ctx.fill();
      }
    } else {
      ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; ctx.fillRect(x,0,pw,CH);
      const {rgb:cc}=_picChord(chords,(i*5+200)%cn,gc,isBW);
      ctx.strokeStyle=`rgb(${cc[0]},${cc[1]},${cc[2]})`; ctx.lineWidth=4;
      for(let cv=0;cv<4;cv++){
        const cy=CH*(0.15+cv*0.25);
        ctx.beginPath();
        for(let pxi=0;pxi<=pw;pxi+=6){
          const cyOff=Math.sin(pxi/pw*Math.PI*3+cv)*CH*0.04;
          if(pxi===0) ctx.moveTo(x+pxi,cy+cyOff); else ctx.lineTo(x+pxi,cy+cyOff);
        }
        ctx.stroke();
      }
    }
    ctx.strokeStyle=INK; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+pw,0); ctx.lineTo(x+pw,CH); ctx.stroke();
  }
}

// ── ARCHIVED: Matisse E The Dance — schematic stickmen on sky/ground split.
// Dispatcher no longer calls this; kept for possible future return. Replaced
// in slot 4 by matissePhaseStainedGlass (Vence chapel jewel grid). To restore,
// rename back to matissePhaseDance and call from drawMatisseOverlay slot 4.
function _matissePhaseDance_archived(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const sR=_seedRnd(42001,ss,0,0); sR(); sR();
  const {rgb:sky}=_picChord(chords,0,gc,isBW);
  const {rgb:gnd}=_picChord(chords,1%cn,gc,isBW);
  const skyY=CH*(0.35+sR()*0.30);
  ctx.fillStyle=`rgb(${sky[0]},${sky[1]},${sky[2]})`; ctx.fillRect(0,0,CW,CH);
  ctx.fillStyle=`rgb(${gnd[0]},${gnd[1]},${gnd[2]})`; ctx.fillRect(0,skyY,CW,CH-skyY);
  const nFigs=3+((sR()*6)|0);
  const arr=(sR()*3)|0;
  const {rgb:fc}=_picChord(chords,2%cn,gc,isBW);
  const ft=[Math.min(255,Math.round(fc[0]*0.5+160)),Math.min(255,Math.round(fc[1]*0.3+50)),Math.min(255,Math.round(fc[2]*0.3+30))];
  const vis=Math.max(1,Math.ceil(N/cn*nFigs*2.5));
  for(let i=0;i<Math.min(nFigs,vis);i++){
    let fx,fy;
    if(arr===0){
      const cxc=CW/2, cyc=skyY, R=Math.min(CW,CH)*(0.25+sR()*0.15);
      const a=i/nFigs*Math.PI*2-Math.PI/2;
      fx=cxc+Math.cos(a)*R; fy=cyc+Math.sin(a)*R*0.7;
    } else if(arr===1){
      fx=CW*((i+0.5)/nFigs); fy=skyY+CH*(sR()-0.5)*0.10;
    } else {
      fx=CW*(0.20+sR()*0.60); fy=skyY+(sR()-0.5)*CH*0.20;
    }
    const s=Math.min(CW,CH)*0.12;
    ctx.fillStyle=`rgb(${ft[0]},${ft[1]},${ft[2]})`;
    ctx.beginPath(); ctx.arc(fx,fy-s*0.9,s*0.22,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=`rgb(${ft[0]},${ft[1]},${ft[2]})`;
    ctx.lineCap='round';
    ctx.lineWidth=Math.max(3,s*0.28);
    // Curvy body
    ctx.beginPath(); ctx.moveTo(fx,fy-s*0.65);
    const lean=i%2===0?1:-1;
    ctx.quadraticCurveTo(fx+lean*s*0.20,fy,fx,fy+s*0.6);
    ctx.stroke();
    // Arms
    ctx.lineWidth=Math.max(3,s*0.20);
    ctx.beginPath(); ctx.moveTo(fx-s*0.6,fy-s*0.15); ctx.lineTo(fx+s*0.6,fy-s*0.15); ctx.stroke();
    // Legs
    ctx.lineWidth=Math.max(3,s*0.22);
    ctx.beginPath(); ctx.moveTo(fx,fy+s*0.60); ctx.lineTo(fx-s*0.35,fy+s*1.10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx,fy+s*0.60); ctx.lineTo(fx+s*0.35,fy+s*1.10); ctx.stroke();
  }
}

// ── Matisse F: La Gerbe / The Snail (1953) manner — a radial fan of cut-out
// leaves blooming from a central anchor across a calm cream priming. Each
// leaf is an elongated jagged-edged biomorphic cut-paper shape in a vivid
// Jazz-period palette colour, derived from the song's chord. The fan span,
// leaf count, leaf length variation, anchor color and asymmetric accents are
// all chord-driven. No outlines anywhere — pure flat scissor-cut paper.
function matissePhaseLaGerbe(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0;
  const isBW=mode==='bw';
  const cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const reveal=Math.max(0,Math.min(1,N/cn));
  const D=Math.min(CW,CH);

  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const energy=_ch?_ch.energy:0.5;
  const density=_ch?_ch.density:0.3;
  const register=_ch?_ch.register:0.5;

  // Calm cream priming — the gesture must stand alone, no competing pattern.
  ctx.fillStyle=isBW?'#e2dccc':'#ebdcb8';
  ctx.fillRect(0,0,CW,CH);

  // ── Centre/anchor positioning ──
  // Anchor is centred horizontally but slightly biased downward, so the fan
  // opens UPWARD across the canvas (like a sheaf gathered at the base — that
  // is the "Gerbe" reading). Session seed nudges position ±5%.
  const sR=_seedRnd(46001,ss,0,0); sR(); sR();
  const anchorCx=CW*(0.50+(sR()-0.5)*0.10);
  const anchorCy=CH*(0.62+(sR()-0.5)*0.10);

  // ── Fan span — driven by ENERGY ──
  // Calm song = narrow upright bouquet (~120°). Energetic song = wide spread
  // (~260°). Fan is symmetric around straight-up axis (-π/2).
  const fanSpan=Math.PI*(0.65+energy*0.75); // ≈117° to 252°
  const fanCentre=-Math.PI/2;
  const fanStart=fanCentre-fanSpan/2;

  // ── Leaf count — driven by DENSITY ──
  // Sparse songs: 8 broad leaves. Busy songs: up to 18 narrower leaves.
  const leafCount=Math.max(7,Math.min(18,8+Math.round(density*12)));
  const visLeaves=Math.max(2,Math.ceil(leafCount*reveal));

  // ── Jazz palette via chord colours ──
  // Each leaf takes its chord colour and saturation-boosts it to true Jazz
  // intensity (vermilion, cobalt, gold, forest, crimson, turquoise, magenta).
  // Pastel tone skips boost to keep the cuts soft.
  const _jazzCol=(idx)=>{
    const {rgb,energy:eC}=_picChord(chords,idx%cn,gc,isBW);
    let r=rgb[0], g=rgb[1], b=rgb[2];
    if(isBW){
      const lum=Math.round(r*0.299+g*0.587+b*0.114);
      r=g=b=lum;
    } else if(!_pastelOn){
      // Pure-Jazz boost: stretch the dominant channel to 255, others halved.
      const mx=Math.max(r,g,b,1);
      const k=255/mx;
      r=r*k; g=g*k; b=b*k;
      const m2=Math.max(r,g,b);
      const pull=(ch)=>ch===m2?ch:ch*0.55;
      r=Math.round(pull(r)); g=Math.round(pull(g)); b=Math.round(pull(b));
    } else {
      r=Math.round(r); g=Math.round(g); b=Math.round(b);
    }
    if(typeof _energyTint==='function'){const t=_energyTint(r,g,b);r=t[0];g=t[1];b=t[2];}
    if(typeof _pastelTint==='function'){const t=_pastelTint(r,g,b);r=t[0];g=t[1];b=t[2];}
    return [r|0,g|0,b|0,eC];
  };

  // ── Draw the fan leaves ──
  // Each leaf radiates from anchor along its assigned angle. Length varies
  // with the chord's energy (loud chords → longer leaves), bounded so the
  // whole fan still fits in canvas. Width tapers toward the tip (almond).
  const maxLeafR=Math.min(CW*0.46,CH*0.55);
  const baseLeafW=D*(0.035+energy*0.025); // width broader in energetic songs

  // Iterate so that the fan REVEALS from the centre outward (build the bouquet
  // symmetrically as more chords play) — visually stronger than left-to-right.
  // Build an order array: middle-out indexing.
  const order=[];
  const mid=(leafCount-1)/2;
  for(let r=0;r<=Math.ceil(mid);r++){
    const left=Math.floor(mid-r);
    const right=Math.ceil(mid+r);
    if(left===right){ if(left>=0&&left<leafCount) order.push(left); }
    else {
      if(left>=0&&left<leafCount) order.push(left);
      if(right>=0&&right<leafCount&&right!==left) order.push(right);
    }
  }

  for(let oi=0;oi<visLeaves&&oi<order.length;oi++){
    const i=order[oi];
    const t=leafCount===1?0.5:(i/(leafCount-1));
    const leafAng=fanStart+t*fanSpan;

    // Leaf-specific RNG (stable per session+leaf)
    const lR=_seedRnd(i+46100,ss,0,0); lR(); lR();

    // Length & width per leaf
    const {rgb:_unused,energy:lE}=_picChord(chords,i%cn,gc,isBW);
    const lenJit=0.78+lR()*0.36; // length variation
    const leafLen=maxLeafR*(0.62+0.32*Math.sin(t*Math.PI))*lenJit;
    const leafW=baseLeafW*(0.85+lR()*0.40);

    // Get colour for THIS leaf
    const jc=_jazzCol(i);
    const alpha=(0.88+lE*0.10).toFixed(2);

    // Build the leaf polygon — elongated almond with JAGGED scissor edges.
    // Edge jitter ≈6% of leaf width — small, irregular, hand-cut quality.
    const nPts=18;
    const jit=leafW*0.10;
    ctx.save();
    ctx.translate(anchorCx,anchorCy);
    ctx.rotate(leafAng+Math.PI/2); // rotate so the almond stands along ang
    ctx.beginPath();
    // Right side, tip outward
    for(let pi=0;pi<=nPts;pi++){
      const tt=pi/nPts;
      const yLocal=-tt*leafLen;
      const xMaxBase=leafW*Math.pow(Math.sin(tt*Math.PI),1.25);
      const xMax=xMaxBase*(1+(lR()-0.5)*0.16);
      const xJit=(lR()-0.5)*jit*0.6;
      if(pi===0) ctx.moveTo(xMax+xJit,yLocal);
      else ctx.lineTo(xMax+xJit,yLocal);
    }
    // Left side, tip inward
    for(let pi=nPts;pi>=0;pi--){
      const tt=pi/nPts;
      const yLocal=-tt*leafLen;
      const xMaxBase=leafW*Math.pow(Math.sin(tt*Math.PI),1.25);
      const xMax=xMaxBase*(1+(lR()-0.5)*0.16);
      const xJit=(lR()-0.5)*jit*0.6;
      ctx.lineTo(-xMax+xJit,yLocal);
    }
    ctx.closePath();
    ctx.fillStyle=`rgba(${jc[0]},${jc[1]},${jc[2]},${alpha})`;
    ctx.fill();
    ctx.restore();
  }

  // ── Central anchor ──
  // Two-layer disc at the base: dark outer (often black in Jazz period) + warm
  // inner from the song's root chord. Acts as the visual gravity centre.
  if(reveal>0.10){
    const rootCol=_jazzCol(0);
    const anchorOuter=isBW?[20,20,24]:[15,15,18];
    const anchorR=D*(0.05+energy*0.015);
    ctx.fillStyle=`rgb(${anchorOuter[0]},${anchorOuter[1]},${anchorOuter[2]})`;
    ctx.beginPath(); ctx.arc(anchorCx,anchorCy,anchorR,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=`rgb(${rootCol[0]},${rootCol[1]},${rootCol[2]})`;
    ctx.beginPath(); ctx.arc(anchorCx,anchorCy,anchorR*0.55,0,Math.PI*2); ctx.fill();
  }

  // ── Asymmetric accent cut-shapes ──
  // A small number of organic Jazz-cut accents scattered around the fan
  // perimeter (not random — placed in the empty space outside the fan).
  // Count scales with chord velocity peaks (rough proxy: energy).
  const accentCt=Math.max(2,Math.min(6,2+Math.round(energy*4)));
  const visAccents=Math.max(0,Math.ceil(accentCt*reveal));
  for(let i=0;i<visAccents;i++){
    const aR=_seedRnd(i+47000,ss,0,0); aR(); aR();
    // Place accents BELOW or AROUND the anchor (outside the upward fan)
    // Angle from -π (left horizontal) sweeping through bottom to 0 (right hor)
    const aAng=-Math.PI*(0.95-aR()*0.90); // wraps through bottom semicircle
    const aRad=Math.min(CW,CH)*(0.20+aR()*0.18);
    const ax=anchorCx+Math.cos(aAng)*aRad;
    const ay=anchorCy+Math.sin(aAng)*aRad;
    const acCol=_jazzCol(i+5);
    const acSize=D*(0.030+aR()*0.030);
    // Organic blob with jagged edges
    ctx.beginPath();
    const nA=10;
    for(let ti=0;ti<=nA;ti++){
      const tt=ti/nA*Math.PI*2;
      const rr=acSize*(0.70+aR()*0.55);
      const x=ax+Math.cos(tt)*rr, y=ay+Math.sin(tt)*rr*0.90;
      if(ti===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.fillStyle=`rgba(${acCol[0]},${acCol[1]},${acCol[2]},0.92)`;
    ctx.fill();
  }
}



// ── Matisse G: Memory of Oceania (1953) — Matisse's late cut-out tapestry.
// Loose grid of 7–11 large flat-colour blocks on warm cream priming, joined
// by 2–5 thin biomorphic black curves and accented by a few small white blob
// silhouettes. Quintessential late-period abstraction.
function matissePhaseMemoryOceania(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0;
  const isBW=mode==='bw';
  const cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const reveal=Math.max(0,Math.min(1,N/cn));
  const D=Math.min(CW,CH);

  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const energy=_ch?_ch.energy:0.5;
  const density=_ch?_ch.density:0.3;

  // Warm cream priming ground — Matisse's late-period signature.
  ctx.fillStyle=isBW?'#e8e2d6':'#f0e6d4';
  ctx.fillRect(0,0,CW,CH);

  // Block count from density (calm = 7, busy = 11).
  const blockCount=Math.max(7,Math.min(11,7+Math.round(density*4)));
  const visBlocks=Math.max(1,Math.ceil(blockCount*reveal));

  // Saturation-boosted chord colour for each block.
  const _blockCol=(idx)=>{
    const {rgb}=_picChord(chords,idx%cn,gc,isBW);
    let r=rgb[0], g=rgb[1], b=rgb[2];
    if(isBW){
      const l=Math.round(r*0.299+g*0.587+b*0.114);
      r=g=b=l;
    } else if(!_pastelOn){
      const mx=Math.max(r,g,b,1);
      const k=180/mx;
      if(k>1){
        r=Math.min(255,Math.round(r*k));
        g=Math.min(255,Math.round(g*k));
        b=Math.min(255,Math.round(b*k));
      }
    }
    if(typeof _energyTint==='function'){const t=_energyTint(r,g,b);r=t[0];g=t[1];b=t[2];}
    if(typeof _pastelTint==='function'){const t=_pastelTint(r,g,b);r=t[0];g=t[1];b=t[2];}
    return [r|0,g|0,b|0];
  };

  // ── Place blocks via farthest-point (composed, not scatter) ──
  const placed=[];
  for(let b=0;b<visBlocks;b++){
    const bR=_seedRnd(b+49100,ss,0,0); bR(); bR();
    const wF=0.08+bR()*0.22;
    const hF=0.08+bR()*0.22;
    let bestX=0.5-wF/2, bestY=0.5-hF/2, bestD=-1;
    for(let t=0;t<8;t++){
      const tx=0.04+bR()*(0.95-wF-0.04);
      const ty=0.04+bR()*(0.95-hF-0.04);
      const ccx=tx+wF/2, ccy=ty+hF/2;
      let mind=1e9;
      for(const p of placed){
        const dx=ccx-p.cx, dy=ccy-p.cy;
        const d=Math.sqrt(dx*dx+dy*dy);
        if(d<mind) mind=d;
      }
      if(!placed.length) mind=1e9;
      if(mind>bestD){
        bestD=mind;
        bestX=tx;
        bestY=ty;
      }
    }
    const px=bestX*CW, py=bestY*CH;
    const pw=wF*CW, ph=hF*CH;
    const col=_blockCol(b);
    const j=Math.min(pw,ph)*0.04;
    ctx.beginPath();
    ctx.moveTo(px+(bR()-0.5)*j, py+(bR()-0.5)*j);
    ctx.lineTo(px+pw+(bR()-0.5)*j, py+(bR()-0.5)*j);
    ctx.lineTo(px+pw+(bR()-0.5)*j, py+ph+(bR()-0.5)*j);
    ctx.lineTo(px+(bR()-0.5)*j, py+ph+(bR()-0.5)*j);
    ctx.closePath();
    ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fill();
    placed.push({cx:bestX+wF/2, cy:bestY+hF/2});
  }

  // ── Biomorphic black curve connectors ──
  if(reveal>0.30){
    const curveCt=Math.max(2,Math.min(5,2+Math.round(density*3)));
    const visCurves=Math.max(0,Math.ceil(curveCt*reveal));
    const BLACK=isBW?'rgba(20,20,22,0.9)':'rgba(25,25,28,0.9)';
    for(let c=0;c<visCurves;c++){
      const cR=_seedRnd(c+49500,ss,0,0); cR(); cR();
      const sx=0.10*CW+cR()*0.80*CW;
      const sy=0.10*CH+cR()*0.80*CH;
      const ex=0.10*CW+cR()*0.80*CW;
      const ey=0.10*CH+cR()*0.80*CH;
      const ccx=(sx+ex)/2+(cR()-0.5)*CW*0.30;
      const ccy=(sy+ey)/2+(cR()-0.5)*CH*0.30;
      ctx.strokeStyle=BLACK;
      ctx.lineWidth=Math.max(3,D*0.008);
      ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(sx,sy);
      ctx.quadraticCurveTo(ccx,ccy,ex,ey);
      ctx.stroke();
    }
  }

  // ── Small white biomorphic blob accents ──
  if(reveal>0.50){
    const blobCt=Math.max(2,Math.min(6,3+Math.round(energy*3)));
    const visBlobs=Math.max(0,Math.ceil(blobCt*reveal));
    const BLOB_COL=isBW?'#f4eee0':'#f8f0dc';
    for(let bi=0;bi<visBlobs;bi++){
      const bR2=_seedRnd(bi+49800,ss,0,0); bR2(); bR2();
      const bx=0.10*CW+bR2()*0.80*CW;
      const by=0.10*CH+bR2()*0.80*CH;
      const rad=D*(0.020+bR2()*0.020);
      ctx.beginPath();
      const n=12;
      for(let ti=0;ti<n;ti++){
        const t=ti/n*Math.PI*2;
        const rr=rad*(1.0+0.3*Math.sin(t*3+bi));
        const x=bx+Math.cos(t)*rr*0.7;
        const y=by+Math.sin(t)*rr*1.2;
        if(ti===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.closePath();
      ctx.fillStyle=BLOB_COL;
      ctx.fill();
    }
  }
}


// ── ARCHIVED: Matisse F Jazz cuts — 5-12 cut shapes in 5 types (icarus,
// circle-cut, half-moon, algae, star) with INK outlines on cream. Dispatcher
// no longer calls this; kept for possible future return. Replaced in slot 5
// by matissePhaseLaGerbe (radial cut-out gesture).
function _matissePhaseJazz_archived(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const sR=_seedRnd(43001,ss,0,0); sR(); sR();
  ctx.fillStyle=isBW?'#ece8e0':'#f2ece0'; ctx.fillRect(0,0,CW,CH);
  const INK=isBW?'rgba(20,20,20,1)':'rgba(15,12,20,1)';
  const nShapes=5+((sR()*7)|0);
  const vis=Math.max(1,Math.ceil(N/cn*nShapes*2.5));
  for(let i=0;i<Math.min(nShapes,vis);i++){
    const {rgb}=_picChord(chords,i%cn,gc,isBW);
    const cx=CW*(0.15+sR()*0.70), cy=CH*(0.15+sR()*0.70);
    const r=Math.min(CW,CH)*(0.08+sR()*0.16);
    const shape=(sR()*5)|0;
    ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.strokeStyle=INK; ctx.lineWidth=2;
    if(shape===0){
      // Icarus: body + wings
      ctx.beginPath();
      for(let ti=0;ti<20;ti++){
        const t=ti/20*Math.PI*2;
        const rr=r*0.4*(1+0.3*Math.sin(t*2));
        const px=cx+Math.cos(t)*rr*0.4, py=cy+Math.sin(t)*rr*1.5;
        if(ti===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      for(let side=-1;side<=1;side+=2){
        ctx.beginPath();
        for(let ti=0;ti<12;ti++){
          const t=ti/12*Math.PI*2;
          const rr=r*0.5;
          const px=cx+side*r*0.4+Math.cos(t)*rr*1.3, py=cy+Math.sin(t)*rr*0.6;
          if(ti===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    } else if(shape===1){
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
      ctx.lineWidth=3; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx-r*0.8,cy+r*0.2); ctx.lineTo(cx+r*0.8,cy-r*0.2); ctx.stroke();
    } else if(shape===2){
      ctx.beginPath();
      for(let ti=0;ti<20;ti++){
        const t=Math.PI*ti/19;
        const px=cx+Math.cos(t)*r, py=cy+Math.sin(t)*r;
        if(ti===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.lineTo(cx-r,cy); ctx.closePath();
      ctx.fill(); ctx.lineWidth=3; ctx.stroke();
    } else if(shape===3){
      ctx.beginPath();
      for(let ti=0;ti<24;ti++){
        const t=ti/24*Math.PI*2;
        const rr=r*(0.7+0.4*Math.sin(t*4+i));
        const px=cx+Math.cos(t)*rr, py=cy+Math.sin(t)*rr;
        if(ti===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath(); ctx.fill(); ctx.lineWidth=3; ctx.stroke();
    } else {
      ctx.beginPath();
      for(let ti=0;ti<12;ti++){
        const t=ti/12*Math.PI*2-Math.PI/2;
        const rr=ti%2===0?r:r*0.5;
        const px=cx+Math.cos(t)*rr, py=cy+Math.sin(t)*rr;
        if(ti===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath(); ctx.fill(); ctx.lineWidth=3; ctx.stroke();
    }
  }
}

// Pollock canvas-wide drip overlay. Painted on the cream substrate to simulate
// real Pollock dense drip painting (modeled on works like Number 17A). Far
// more dense than my earlier sparse version: many drip passes accumulating
// with chord count, mixed thick/thin line characters, intense speckling,
// limited bold palette (black dominant, white, red, yellow, grey, teal).
//
// Each pass is seeded independently (passIndex + sessionSeed + canvas dims)
// so passes freeze as chord count grows; new chords unlock more passes layered
// on top. Re-randomized on Clear/Vary.
//
// Per pass: a long curving drip line (style varies — thick smooth / thin
// spidery / loop-back) + dense bead chain + heavy splatter cloud + occasional
// fat blob where paint pooled.
function drawPollockOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(lim === 0 || !chords || chords.length === 0) return;
  const ss = sessionSeed|0;
  const N = Math.min(lim, chords.length);
  const isBW = mode==='bw';
  const toGrey = (r,g,b) => { const v=Math.round(r*0.299+g*0.587+b*0.114); return [v,v,v]; };
  let _forcedPollVariant = 0; // set by the phase dispatcher: 0 = Dense, 1 = Sparse
  // ── 7-VARIANT CHOOSER (stable per painting, re-rolls on Vary) ──
  //  0 = Classic drip — Dense all-over web.
  //  1 = Autumn Rhythm — horizontal looping skeins in three passes.
  //  2 = Black pourings / theme colour pour.
  //  3 = Lavender Mist / Totem atmospheric.
  //  4 = White Light (post-drip 1954, INVERTED palette on dark ground).
  //  5 = Blue Poles.
  //  6 = Sparse — bolder strokes, more open canvas, thicker beads (was a hidden
  //      seed bit inside slot 0; now its own cyclable phase).
  //  Free (cap=2) sees Dense + Autumn Rhythm — two distinct drip
  //  compositions (all-over web vs horizontal rhythm).
  {
    const _pn=_capN(7); const _ppick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_variantCap === 2){
      // Free: 0 = Dense (fall through), 1 = Stenographic.
      if(_ppick===1){ pollockPhaseStenographic(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    } else {
      // Pro+: full ladder.
      if(_ppick===1){ pollockPhaseStenographic(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
      if(_ppick===2){ pollockPhaseBlack(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
      if(_ppick===3){ pollockPhaseTotem(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
      if(_ppick===4){ pollockPhaseWhiteLight(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
      if(_ppick===5){ pollockPhasePoles(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    }
    // Slots 0 and 6 share the dense/sparse body below; the slot decides the
    // variant (0 = Dense all-over web, 6 = Sparse bolder strokes) instead of a
    // hidden seed bit — so BOTH are always reachable by cycling Vary.
    _forcedPollVariant = (_ppick===6) ? 1 : 0;
  }

  // Palette weights rebalanced for chromatic painting: ink dropped from 0.28
  // to 0.15, every colour boosted ~30% so a typical painting reads as colour
  // with ink accents (not ink with colour accents). Total weight ~1.05.
  const _dc = [
    {col:'rgba(15,12,18,',    wt: 0.15, rgb:[15,12,18]},
    {col:'rgba(245,240,228,', wt: 0.10, rgb:[245,240,228]},
    {col:'rgba(190,40,35,',   wt: 0.09, rgb:[190,40,35]},
    {col:'rgba(235,200,55,',  wt: 0.08, rgb:[235,200,55]},
    {col:'rgba(140,140,140,', wt: 0.03, rgb:[140,140,140]},
    {col:'rgba(40,130,130,',  wt: 0.05, rgb:[40,130,130]},
    {col:'rgba(180,150,70,',  wt: 0.04, rgb:[180,150,70]},
    {col:'rgba(40,140,60,',   wt: 0.08, rgb:[40,140,60]},
    {col:'rgba(40,70,190,',   wt: 0.09, rgb:[40,70,190]},
    {col:'rgba(130,40,170,',  wt: 0.07, rgb:[130,40,170]},
    {col:'rgba(220,100,30,',  wt: 0.08, rgb:[220,100,30]},
    {col:'rgba(180,40,100,',  wt: 0.06, rgb:[180,40,100]},
    {col:'rgba(60,160,180,',  wt: 0.06, rgb:[60,160,180]},
    {col:'rgba(100,180,80,',  wt: 0.05, rgb:[100,180,80]},
    {col:'rgba(200,80,160,',  wt: 0.04, rgb:[200,80,160]},
  ];
  // B/W: keep red (wt:0.03) and yellow (wt:0.02) as rare accents, rest grey
  const dripColors = isBW ? _dc.map((c,i)=>{
    if(i===2) return{col:c.col,wt:0.03,rgb:c.rgb};
    if(i===3) return{col:c.col,wt:0.02,rgb:c.rgb};
    const[v]=toGrey(...c.rgb); return{col:`rgba(${v},${v},${v},`,wt:c.wt,rgb:[v,v,v]};
  }) : _dc;
  // Tone the drip colour per-pass: feed every picked pigment through
  // _energyTint (Real mode — energy modulates saturation/lightness) and
  // _pastelTint (Pastel mode — soft filter). Both are no-ops in Pure mode.
  // Doing this per-pass instead of once at build time lets Real mode mix
  // soft drips for piano passages with deep drips for fortes on the SAME
  // canvas, instead of every pass using the same baked palette.
  const _tonedRGB = (rgb)=>{
    let r=rgb[0], g=rgb[1], b=rgb[2];
    if(typeof _energyTint === 'function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint === 'function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return [r,g,b];
  };

  // Compute average RGB + velocity for a chord -- used to bias palette and scale thickness.
  const chordStats = (chord) => {
    const notes = chord.n || chord.notes || (Array.isArray(chord) ? chord : null);
    if(!notes || !notes.length) return null;
    let avgR=0, avgG=0, avgB=0, avgV=0, count=0;
    for(const note of notes){
      const m = note.m !== undefined ? note.m : note;
      const v = note.v !== undefined ? note.v : 100;
      const [r,g,b] = gc(m, v);
      avgR += r; avgG += g; avgB += b; avgV += v;
      count++;
    }
    if(!count) return null;
    return {
      r: avgR/count, g: avgG/count, b: avgB/count,
      v: avgV/count,
    };
  };

  // Bias the palette weights toward whichever palette color is closest to
  // the given chord color. Neutrals (ink/cream/grey, indices 0/1/4) act as
  // ground colours — they're allowed a moderate boost but never the primary
  // one, otherwise tonal chords would collapse the painting to monochrome.
  // The nearest CHROMATIC palette colour gets the 8× boost; the nearest
  // neutral gets at most 2.5×. This guarantees colour reads in every chord.
  const NEUTRAL_IDX = new Set([0, 1, 4]); // ink, cream, grey
  const biasedWeights = (chordCol) => {
    if(!chordCol) return dripColors.map(c => c.wt);
    const dists = dripColors.map(c => {
      const dr = c.rgb[0] - chordCol.r;
      const dg = c.rgb[1] - chordCol.g;
      const db = c.rgb[2] - chordCol.b;
      return Math.sqrt(dr*dr + dg*dg + db*db);
    });
    const indexed = dists.map((d,i)=>({d,i})).sort((a,b)=>a.d-b.d);
    const boosts = new Array(dripColors.length).fill(1);
    // Find the nearest chromatic and nearest neutral separately.
    let chromaticPrimary = -1, chromaticSecondary = -1, nearestNeutral = -1;
    for(const {i} of indexed){
      if(NEUTRAL_IDX.has(i)){
        if(nearestNeutral < 0) nearestNeutral = i;
      } else {
        if(chromaticPrimary < 0) chromaticPrimary = i;
        else if(chromaticSecondary < 0) chromaticSecondary = i;
      }
      if(chromaticPrimary >= 0 && chromaticSecondary >= 0 && nearestNeutral >= 0) break;
    }
    if(chromaticPrimary >= 0)   boosts[chromaticPrimary]   = 8.0;
    if(chromaticSecondary >= 0) boosts[chromaticSecondary] = 3.0;
    if(nearestNeutral >= 0)     boosts[nearestNeutral]     = 2.5;
    return dripColors.map((c,i) => c.wt * boosts[i]);
  };

  const pickColor = (rnd, weights) => {
    const total = weights.reduce((a,b)=>a+b, 0);
    let r = rnd() * total;
    let pickedRGB = dripColors[0].rgb;
    for(let i=0; i<dripColors.length; i++){
      r -= weights[i];
      if(r < 0){ pickedRGB = dripColors[i].rgb; break; }
    }
    // Apply tone per-pass: Real -> _energyTint with current chord energy;
    // Pastel -> _pastelTint. Both no-ops in Pure mode.
    const [tr,tg,tb] = _tonedRGB(pickedRGB);
    return `rgba(${tr},${tg},${tb},`;
  };

  // Pass count grows with song length, and every chord adds a drip until the
  // last one. Curve is calibrated so short mood pieces stay airy (30 chords →
  // 25 passes) while long songs build real Pollock density (400 chords → 260
  // passes). No early ceiling — the painting completes on the final chord.
  const passMaxFull = _adaptiveMax(chords.length, 'pollock');
  const passCount0 = _progressive(N, chords.length, passMaxFull);
  // ── Variant chooser (stable per painting, re-rolls on Vary) ──
  //  A = dense all-over web (the classic Pollock).
  //  B = sparse, bolder strokes with more open canvas + thicker beads.
  const pollVariant = _forcedPollVariant;   // phase-driven (slot 0 vs 6), not seed
  // Song character (A2): a loud/dense piece webs up thicker (more passes, a bit
  // wider beads); a soft/sparse one stays airy. Deterministic; audio untouched.
  const _ch = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const _charDrive = _ch ? (0.55*_ch.energy + 0.45*_ch.density) : 0.5;   // 0..1
  const _passCharMul = 0.46 + 1.08*_charDrive;                            // 0.46..1.54 (amplified ×1.8)
  const passCount = Math.max(4, Math.round(
    (pollVariant === 1 ? passCount0 * 0.55 : passCount0) * _passCharMul
  ));
  const _pollWidthMul = (pollVariant === 1 ? 1.8 : 1.0) * (0.73 + 0.54*_charDrive);

  // Map pass index → chord index. The first pass corresponds to the first
  // chord, last pass corresponds to the latest chord, evenly distributed.
  // This way each pass "represents" a specific chord in the music -- its color
  // and velocity drive the drip's appearance.
  const chordForPass = (passIdx) => {
    if(passCount <= 1) return chords[N-1];
    const t = passIdx / (passCount - 1);
    const ci = Math.min(N-1, Math.floor(t * (N - 1)));
    return chords[ci];
  };

  // Sample a point along the polyline at parameter t (0..1)
  const sampleAt = (points, t) => {
    const segIdx = Math.min(points.length-2, Math.floor(t * (points.length-1)));
    const segT = (t * (points.length-1)) - segIdx;
    const p0 = points[segIdx];
    const p1 = points[segIdx+1] || points[segIdx];
    return { x: p0.x + (p1.x - p0.x)*segT, y: p0.y + (p1.y - p0.y)*segT };
  };

  for(let p=0; p<passCount; p++){
    // Per-pass seed: passIndex + sessionSeed
    const rnd = _seedRnd(p+1, ss, 0, 0);

    // === CHORD-DRIVEN PROPERTIES ===
    // Each pass corresponds to a chord. Color is biased toward that chord's
    // averaged color; line thickness scales with that chord's velocity.
    // Set per-chord energy so the drip palette (whose colours pass through
    // _pastelTint at build time) picks up Real-mode energy modulation here —
    // every drip across the canvas reads the local dynamic, so pianissimo
    // chords lay down softer/lighter drips and forte chords lay down deeper.
    const chord = chordForPass(p);
    _setCurE(chord && chord._E);
    const stats = chord ? chordStats(chord) : null;
    const weights = biasedWeights(stats);
    const colBase = pickColor(rnd, weights);
    // Velocity scaling: low velocity (40) → 0.55× thickness, max (127) → 1.45×
    const vNorm = stats ? Math.max(0, Math.min(1, (stats.v - 30) / 90)) : 0.5;
    const velScale = 0.55 + vNorm * 0.90;

    // Line character -- picks one of 4 styles per pass for variety
    const styleRoll = rnd();
    const lineStyle = styleRoll < 0.30 ? 'thick'        // bold smooth trail
                    : styleRoll < 0.65 ? 'thin'          // spidery scribble
                    : styleRoll < 0.85 ? 'loopy'         // curling loops
                    : 'wide';                            // pooled wide trail

    // === DRIP PATH ===
    // Start/end positions. Most lines span the canvas (in from one edge,
    // out the other). Some "loopy" lines stay closer to a center.
    const padding = Math.max(CW, CH) * 0.3;
    let x0, y0, x1, y1;
    if(lineStyle === 'loopy'){
      // Loopy lines center somewhere in canvas, smaller span
      const cx = rnd()*CW, cy = rnd()*CH;
      const reach = Math.min(CW, CH) * (0.3 + rnd()*0.3);
      const a1 = rnd()*Math.PI*2;
      const a2 = a1 + Math.PI + (rnd()-0.5)*1.5;
      x0 = cx + Math.cos(a1)*reach;
      y0 = cy + Math.sin(a1)*reach;
      x1 = cx + Math.cos(a2)*reach;
      y1 = cy + Math.sin(a2)*reach;
    } else {
      // Standard cross-canvas span
      const startSide = Math.floor(rnd()*4);
      if(startSide === 0){
        x0 = rnd()*CW; y0 = -padding;
        x1 = rnd()*CW; y1 = CH + padding;
      } else if(startSide === 1){
        x0 = CW + padding; y0 = rnd()*CH;
        x1 = -padding; y1 = rnd()*CH;
      } else if(startSide === 2){
        x0 = rnd()*CW; y0 = CH + padding;
        x1 = rnd()*CW; y1 = -padding;
      } else {
        x0 = -padding; y0 = rnd()*CH;
        x1 = CW + padding; y1 = rnd()*CH;
      }
    }

    // Build polyline -- segment count varies by style (loopy = more segments)
    const segs = lineStyle === 'loopy' ? 12 + Math.floor(rnd()*6)
               : 8 + Math.floor(rnd()*5);
    const points = [];
    const lineDx = x1-x0, lineDy = y1-y0;
    const lineLen = Math.sqrt(lineDx*lineDx + lineDy*lineDy) || 1;
    const perpX = -lineDy/lineLen, perpY = lineDx/lineLen;
    // Wobble amount varies with style
    const wobScale = lineStyle === 'thick' ? 0.18
                   : lineStyle === 'thin'  ? 0.28
                   : lineStyle === 'loopy' ? 0.45
                   : 0.20;
    for(let s=0; s<=segs; s++){
      const t = s/segs;
      const lx = x0 + lineDx*t;
      const ly = y0 + lineDy*t;
      const wobAmp = Math.sin(t*Math.PI) * Math.min(CW, CH) * wobScale;
      // For loopy lines, add some longitudinal jitter too
      let lxJ = lx, lyJ = ly;
      if(lineStyle === 'loopy'){
        const jitT = (rnd()-0.5)*0.15;
        lxJ = lx + lineDx*jitT;
        lyJ = ly + lineDy*jitT;
      }
      const wob = (rnd()-0.5) * 2 * wobAmp;
      points.push({x: lxJ + perpX*wob, y: lyJ + perpY*wob});
    }

    // === STROKE THE LINE ===
    // Width depends on line style
    let lineWidth, lineAlpha;
    if(lineStyle === 'thick'){
      lineWidth = Math.min(CW, CH) * (0.010 + rnd()*0.012) * velScale;
      lineAlpha = 0.92;
    } else if(lineStyle === 'thin'){
      lineWidth = Math.min(CW, CH) * (0.0025 + rnd()*0.0035) * velScale;
      lineAlpha = 0.90;
    } else if(lineStyle === 'loopy'){
      lineWidth = Math.min(CW, CH) * (0.004 + rnd()*0.006) * velScale;
      lineAlpha = 0.92;
    } else { // wide
      lineWidth = Math.min(CW, CH) * (0.014 + rnd()*0.014) * velScale;
      lineAlpha = 0.88;
    }
    ctx.strokeStyle = colBase + lineAlpha.toFixed(2) + ')';
    ctx.lineWidth = lineWidth * _pollWidthMul;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for(let i=1; i<points.length-1; i++){
      const mid = {x:(points[i].x+points[i+1].x)/2, y:(points[i].y+points[i+1].y)/2};
      ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
    }
    ctx.lineTo(points[points.length-1].x, points[points.length-1].y);
    ctx.stroke();

    // === BEADS -- small dots along the line ===
    // Count scales with line style: thick/wide get more beads
    const beadCount = lineStyle === 'thin' ? 4 + Math.floor(rnd()*5)
                    : lineStyle === 'loopy' ? 8 + Math.floor(rnd()*8)
                    : 12 + Math.floor(rnd()*10);
    for(let b=0; b<beadCount; b++){
      const t = b / beadCount + (rnd()-0.5)*0.02;
      const pt = sampleAt(points, Math.max(0, Math.min(1, t)));
      const drift = lineWidth * (0.3 + rnd()*1.5);
      const angle = rnd()*Math.PI*2;
      const beadRadius = lineWidth * (0.35 + rnd()*0.75);
      ctx.fillStyle = colBase + (0.85 + rnd()*0.10).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(pt.x + Math.cos(angle)*drift, pt.y + Math.sin(angle)*drift, beadRadius, 0, Math.PI*2);
      ctx.fill();
    }

    // === DENSE SPECKLE CLOUD -- many tiny micro-specks around the line ===
    // Real Pollock has hundreds of micro-specks; this is where the painting
    // gets its scattered-paint texture.
    const speckCount = lineStyle === 'wide' ? 60 + Math.floor(rnd()*40)
                     : lineStyle === 'thick' ? 50 + Math.floor(rnd()*40)
                     : 35 + Math.floor(rnd()*30);
    for(let sp=0; sp<speckCount; sp++){
      const t = rnd();
      const pt = sampleAt(points, t);
      // Specks fly farther than beads
      const flyDist = lineWidth * (1.5 + rnd()*12);
      const flyAngle = rnd() * Math.PI * 2;
      const sx = pt.x + Math.cos(flyAngle) * flyDist;
      const sy = pt.y + Math.sin(flyAngle) * flyDist;
      // Speck size -- most are tiny pinpoints
      const sizeRoll = rnd();
      const speckRadius = sizeRoll < 0.85 ? lineWidth * (0.10 + rnd()*0.25)  // tiny
                       : sizeRoll < 0.97 ? lineWidth * (0.35 + rnd()*0.55)   // small
                       : lineWidth * (0.7 + rnd()*1.2);                       // occasional bigger
      ctx.fillStyle = colBase + (0.70 + rnd()*0.25).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, speckRadius, 0, Math.PI*2);
      ctx.fill();
    }

    // === FAT BLOBS -- 0-2 per pass where paint pooled ===
    // Wide-style lines get more blobs; thin/loopy rarely get them.
    const blobCount = lineStyle === 'wide' ? 2 + Math.floor(rnd()*2)
                    : lineStyle === 'thick' ? 1 + Math.floor(rnd()*2)
                    : Math.floor(rnd()*1.5);
    for(let bl=0; bl<blobCount; bl++){
      const t = 0.2 + rnd()*0.6;
      const pt = sampleAt(points, t);
      const blobRadius = lineWidth * (1.8 + rnd()*2.5);
      ctx.fillStyle = colBase + '0.92)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, blobRadius, 0, Math.PI*2);
      ctx.fill();
    }
  }
}

// Shared drip-line helper for new Pollock phases: a curving spattered trail.
function _pollDrip(ctx,x0,y0,x1,y1,col,w,ss,seed){
  const rnd=_seedRnd(seed,ss,0,0);
  ctx.strokeStyle=col;ctx.lineWidth=w;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(x0,y0);
  const segs=4+((rnd()*5)|0); let px=x0,py=y0;
  for(let s=1;s<=segs;s++){const t=s/segs;const nx=x0+(x1-x0)*t+(rnd()-0.5)*60,ny=y0+(y1-y0)*t+(rnd()-0.5)*60;ctx.quadraticCurveTo((px+nx)/2+(rnd()-0.5)*30,(py+ny)/2+(rnd()-0.5)*30,nx,ny);px=nx;py=ny;}
  ctx.stroke();
  // beads
  for(let b=0;b<segs*2;b++){const t=rnd();const bx=x0+(x1-x0)*t+(rnd()-0.5)*50,by=y0+(y1-y0)*t+(rnd()-0.5)*50;ctx.fillStyle=col;ctx.beginPath();ctx.arc(bx,by,w*(0.4+rnd()*0.6),0,Math.PI*2);ctx.fill();}
}

// ── Pollock C: Black pourings — monochrome black drip on raw canvas. ──
// ── Pollock C: Color Pour — chord-derived dominant theme colour over a
// session-varied ground. Every chord still contributes a drip, but the
// painting reads as ONE colour story (with supporting accents) instead of
// the previous monochrome ink dump. Background is one of 5 grounds chosen
// from session seed → different songs land on different surfaces. Same drip
// shape vocabulary as the main body (curves + beads + specks + blobs).
function pollockPhaseBlack(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,cn=chords.length,N=Math.max(1,Math.min(cn,lim)),isBW=mode==='bw';
  // Background palette — five grounds Pollock actually painted on.
  const GROUNDS = isBW
    ? ['#cfc3a8','#bdb39a','#c8b894','#cabb96','#c2b8a0']
    : ['#cfc3a8','#b8a07e','#c8a899','#b8b0a4','#d4c6a8']; // cream, ochre, dusty rose, cool grey, deep cream
  const _gpick=_seedRnd(411,ss,7,13); _gpick();_gpick();
  ctx.fillStyle = GROUNDS[(_gpick()*GROUNDS.length)|0];
  ctx.fillRect(0,0,CW,CH);
  // Compute the painting's dominant theme colour: weighted average of every
  // chord's averaged colour. This is the "voice" of the song in paint —
  // different songs will pour in different colours.
  let tR=0,tG=0,tB=0,tC=0;
  for(let i=0;i<chords.length;i++){
    const notes=chords[i] && (chords[i].n || chords[i].notes || []);
    if(!notes || !notes.length) continue;
    for(const note of notes){
      const m=note.m!==undefined?note.m:note;
      const v=note.v!==undefined?note.v:80;
      const [r,g,b]=gc(m,v);
      tR+=r; tG+=g; tB+=b; tC++;
    }
  }
  const theme = tC ? [Math.round(tR/tC), Math.round(tG/tC), Math.round(tB/tC)] : [180,80,60];
  // Three supporting accents pulled from a fixed Pollock-ish chromatic set,
  // ranked by distance to the theme so accents harmonise with the lead.
  const ACCENTS = [[190,40,35],[235,200,55],[40,70,190],[40,140,60],[220,100,30],[130,40,170],[60,160,180]];
  const sorted = ACCENTS.map(a=>{
    const d=Math.sqrt((a[0]-theme[0])**2+(a[1]-theme[1])**2+(a[2]-theme[2])**2);
    return {a,d};
  }).sort((x,y)=>x.d-y.d);
  const supports = sorted.slice(0,3).map(s=>s.a);
  // Drip count scales with chord count (~0.7×).
  const passes = Math.max(8, Math.min(220, Math.round(cn*0.7)));
  const vis = Math.max(1, Math.ceil(N/cn*passes));
  // Tone-adjust helper: Real -> energy modulates, Pastel -> soft. No-op Pure.
  const _tonedRGB = (col)=>{
    let r=col[0], g=col[1], b=col[2];
    if(typeof _energyTint === 'function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint === 'function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return [r,g,b];
  };
  for(let i=0;i<vis;i++){
    // Set energy from this pass's chord so Real mode breathes per-drip.
    const _pi = Math.min(cn-1, Math.floor((i/Math.max(1,passes))*cn));
    const _ch = chords[_pi];
    _setCurE(_ch && _ch._E);
    const rnd = _seedRnd(i+3100, ss, 0, 0);
    // 65% theme, 30% supporting accent, 5% deep ink for definition
    const pick = rnd();
    let col;
    if(pick < 0.65){
      // theme with slight per-drip drift so it doesn't look painted-by-numbers
      const dr = (rnd()-0.5)*40;
      col = [Math.max(0,Math.min(255,theme[0]+dr)),
             Math.max(0,Math.min(255,theme[1]+dr*0.7)),
             Math.max(0,Math.min(255,theme[2]+dr*0.9))];
    } else if(pick < 0.95){
      col = supports[(rnd()*supports.length)|0];
    } else {
      col = [15,12,18];
    }
    if(isBW){
      const v = Math.round(col[0]*0.299+col[1]*0.587+col[2]*0.114);
      col = [v,v,v];
    }
    // Tone-adjust the picked colour with the current chord's energy.
    col = _tonedRGB(col);
    const colStr = `rgba(${col[0]|0},${col[1]|0},${col[2]|0},`;
    // Drip from one edge to the other for span; some "loopy" stay central.
    const padding = Math.max(CW,CH)*0.3;
    const loopy = rnd() < 0.20;
    let x0,y0,x1,y1;
    if(loopy){
      const cx=rnd()*CW, cy=rnd()*CH;
      const reach=Math.min(CW,CH)*(0.25+rnd()*0.3);
      const a1=rnd()*Math.PI*2, a2=a1+Math.PI+(rnd()-0.5)*1.5;
      x0=cx+Math.cos(a1)*reach; y0=cy+Math.sin(a1)*reach;
      x1=cx+Math.cos(a2)*reach; y1=cy+Math.sin(a2)*reach;
    } else {
      const side=(rnd()*4)|0;
      if(side===0){x0=rnd()*CW;y0=-padding;x1=rnd()*CW;y1=CH+padding;}
      else if(side===1){x0=CW+padding;y0=rnd()*CH;x1=-padding;y1=rnd()*CH;}
      else if(side===2){x0=rnd()*CW;y0=CH+padding;x1=rnd()*CW;y1=-padding;}
      else {x0=-padding;y0=rnd()*CH;x1=CW+padding;y1=rnd()*CH;}
    }
    // Polyline + wobble (mirrors main-body logic for shape consistency).
    const segs = loopy ? 12+((rnd()*6)|0) : 8+((rnd()*5)|0);
    const dx=x1-x0, dy=y1-y0;
    const len=Math.sqrt(dx*dx+dy*dy)||1;
    const px=-dy/len, py=dx/len;
    const wobScale = loopy ? 0.42 : (rnd()<0.4 ? 0.18 : 0.25);
    const pts=[];
    for(let s=0;s<=segs;s++){
      const t=s/segs;
      const lx=x0+dx*t, ly=y0+dy*t;
      const amp=Math.sin(t*Math.PI)*Math.min(CW,CH)*wobScale;
      const wob=(rnd()-0.5)*2*amp;
      pts.push({x:lx+px*wob, y:ly+py*wob});
    }
    // Stroke
    const lineW = Math.min(CW,CH)*(0.004+rnd()*0.016);
    const alpha = 0.78+rnd()*0.18;
    ctx.strokeStyle = colStr+alpha.toFixed(2)+')';
    ctx.lineWidth = lineW;
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for(let k=1;k<pts.length-1;k++){
      const m={x:(pts[k].x+pts[k+1].x)/2, y:(pts[k].y+pts[k+1].y)/2};
      ctx.quadraticCurveTo(pts[k].x, pts[k].y, m.x, m.y);
    }
    ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
    ctx.stroke();
    // Beads along the trail
    const beads = 10+((rnd()*10)|0);
    for(let b=0;b<beads;b++){
      const t=b/beads+(rnd()-0.5)*0.02;
      const ti=Math.max(0,Math.min(pts.length-2,(t*(pts.length-1))|0));
      const tt=(t*(pts.length-1))-ti;
      const bx=pts[ti].x+(pts[ti+1].x-pts[ti].x)*tt;
      const by=pts[ti].y+(pts[ti+1].y-pts[ti].y)*tt;
      const drift=lineW*(0.3+rnd()*1.4);
      const ang=rnd()*Math.PI*2;
      const br=lineW*(0.3+rnd()*0.7);
      ctx.fillStyle = colStr+(0.85+rnd()*0.10).toFixed(2)+')';
      ctx.beginPath();
      ctx.arc(bx+Math.cos(ang)*drift, by+Math.sin(ang)*drift, br, 0, Math.PI*2);
      ctx.fill();
    }
    // Specks (micro-scatter)
    const specks = 30+((rnd()*30)|0);
    for(let s=0;s<specks;s++){
      const t=rnd();
      const ti=Math.max(0,Math.min(pts.length-2,(t*(pts.length-1))|0));
      const tt=(t*(pts.length-1))-ti;
      const px2=pts[ti].x+(pts[ti+1].x-pts[ti].x)*tt;
      const py2=pts[ti].y+(pts[ti+1].y-pts[ti].y)*tt;
      const fly=lineW*(1.5+rnd()*12);
      const fa=rnd()*Math.PI*2;
      const sr=rnd()<0.85 ? lineW*(0.10+rnd()*0.22) : lineW*(0.35+rnd()*0.55);
      ctx.fillStyle = colStr+(0.65+rnd()*0.25).toFixed(2)+')';
      ctx.beginPath();
      ctx.arc(px2+Math.cos(fa)*fly, py2+Math.sin(fa)*fly, sr, 0, Math.PI*2);
      ctx.fill();
    }
    // Pools — large irregular blobs where paint spread (1 per 4 drips)
    if(rnd() < 0.25){
      const t=0.25+rnd()*0.5;
      const ti=Math.max(0,Math.min(pts.length-2,(t*(pts.length-1))|0));
      const tt=(t*(pts.length-1))-ti;
      const blx=pts[ti].x+(pts[ti+1].x-pts[ti].x)*tt;
      const bly=pts[ti].y+(pts[ti+1].y-pts[ti].y)*tt;
      const br=lineW*(2.2+rnd()*3.0);
      ctx.fillStyle = colStr+'0.88)';
      ctx.beginPath();
      // Irregular pool: 6-8 vertex blob
      const verts=6+((rnd()*3)|0);
      for(let v=0;v<=verts;v++){
        const va=(v/verts)*Math.PI*2;
        const vr=br*(0.7+rnd()*0.6);
        const vx=blx+Math.cos(va)*vr, vy=bly+Math.sin(va)*vr;
        if(v===0) ctx.moveTo(vx,vy); else ctx.lineTo(vx,vy);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}

// ── Pollock D: Lavender Mist — atmospheric colour fog of micro-droplets.
// Inspired by 'Number 1, 1950' (Lavender Mist). No drip lines at all —
// only thousands of tiny scattered drops + a small number of intense
// colour accents. The dominant "fog" hue is the chord average tilted
// toward lavender/cream; individual chord colours appear as accent drops.
// Visually distinct from every line-based variant.
function pollockPhaseTotem(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  // 1) Compute chord-average colour (the song's "voice"), tilt toward lavender.
  let tR=0,tG=0,tB=0,tC=0;
  for(let i=0;i<cn;i++){
    const notes=chords[i] && (chords[i].n || chords[i].notes || []);
    if(!notes||!notes.length) continue;
    for(const note of notes){
      const m=note.m!==undefined?note.m:note;
      const v=note.v!==undefined?note.v:80;
      const [r,g,b]=gc(m,v);
      tR+=r; tG+=g; tB+=b; tC++;
    }
  }
  let avgR = tC ? tR/tC : 150;
  let avgG = tC ? tG/tC : 130;
  let avgB = tC ? tB/tC : 160;
  // Tilt the fog hue 35% toward Pollock's lavender (warm purple-grey) — soft
  // ground rather than saturated chord colour. In BW mode skip the tilt.
  const LAV = [205, 195, 215];
  const tilt = 0.35;
  const fogR = isBW ? Math.round(avgR*0.299+avgG*0.587+avgB*0.114)
                    : avgR*(1-tilt) + LAV[0]*tilt;
  const fogG = isBW ? fogR : avgG*(1-tilt) + LAV[1]*tilt;
  const fogB = isBW ? fogR : avgB*(1-tilt) + LAV[2]*tilt;
  // 2) Background — soft cream with subtle vertical gradient toward fog hue.
  const grad = ctx.createLinearGradient(0,0,0,CH);
  grad.addColorStop(0, isBW ? '#cfc5b2' : '#d8cdb8');
  grad.addColorStop(0.6, `rgb(${(fogR*0.45+200*0.55)|0},${(fogG*0.45+195*0.55)|0},${(fogB*0.45+185*0.55)|0})`);
  grad.addColorStop(1, isBW ? '#b8ae9c' : `rgb(${(fogR*0.65+180*0.35)|0},${(fogG*0.65+175*0.35)|0},${(fogB*0.65+170*0.35)|0})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,CW,CH);
  // Reveal progress: scale mist density and accent count proportionally.
  const progress = N/cn;
  // 3) MIST LAYER — thousands of micro-droplets in fog hue with random
  // alpha and tiny size. Builds the atmospheric haze.
  const mistTotal = Math.max(1200, Math.min(4000, Math.round(cn*18)));
  const mistVis = Math.max(50, Math.ceil(mistTotal*progress));
  for(let i=0;i<mistVis;i++){
    const rnd = _seedRnd(i+3200, ss, 0, 0);
    const x = rnd()*CW, y = rnd()*CH;
    // Hue drift: ±20 around fog hue
    const drift = (rnd()-0.5)*40;
    const r = Math.max(0, Math.min(255, fogR+drift));
    const g = Math.max(0, Math.min(255, fogG+drift*0.7));
    const b = Math.max(0, Math.min(255, fogB+drift*1.0));
    const alpha = 0.08 + rnd()*0.28;
    const size = Math.min(CW,CH) * (0.0008 + rnd()*0.0030);
    ctx.fillStyle = `rgba(${r|0},${g|0},${b|0},${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI*2);
    ctx.fill();
  }
  // 4) SOFT COLOUR PATCHES — diffuse circular gradients in chord colours.
  // Creates the colour-cloud zones inside the mist. One per ~12 chords.
  const patches = Math.max(4, Math.min(20, Math.round(cn/12)));
  const visPatches = Math.max(1, Math.ceil(patches*progress));
  for(let i=0;i<visPatches;i++){
    const rnd = _seedRnd(i+3300, ss, 0, 0);
    const ci = Math.floor(i * (cn/Math.max(1,patches)));
    const {rgb} = _picChord(chords, ci, gc, isBW);
    const cx = rnd()*CW, cy = rnd()*CH;
    const radius = Math.min(CW,CH) * (0.15 + rnd()*0.22);
    const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g2.addColorStop(0,   `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.32)`);
    g2.addColorStop(0.5, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.14)`);
    g2.addColorStop(1,   `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI*2);
    ctx.fill();
  }
  // 5) ACCENT DROPS — small but intense chord-coloured drops at higher
  // opacity, scattered across the canvas. These give the painting its
  // "rhythm" against the mist.
  const accents = Math.max(20, Math.min(140, Math.round(cn*0.4)));
  const visAccents = Math.max(2, Math.ceil(accents*progress));
  for(let i=0;i<visAccents;i++){
    const rnd = _seedRnd(i+3400, ss, 0, 0);
    const ci = Math.floor(i * (cn/Math.max(1,accents)));
    const {rgb, energy} = _picChord(chords, ci, gc, isBW);
    const x = rnd()*CW, y = rnd()*CH;
    // Sizes vary widely: most are small, some are bigger pools.
    const sizeRoll = rnd();
    const r = sizeRoll < 0.70 ? Math.min(CW,CH)*(0.003+rnd()*0.005)
            : sizeRoll < 0.92 ? Math.min(CW,CH)*(0.008+rnd()*0.012)
            : Math.min(CW,CH)*(0.018+rnd()*0.020);
    const a = 0.55 + energy*0.30 + rnd()*0.10;
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.min(0.95,a).toFixed(2)})`;
    // Slightly irregular blob, not perfect circle
    ctx.beginPath();
    const verts = 6 + ((rnd()*3)|0);
    for(let v=0;v<=verts;v++){
      const va = (v/verts)*Math.PI*2;
      const vr = r*(0.75+rnd()*0.5);
      const vx = x + Math.cos(va)*vr, vy = y + Math.sin(va)*vr;
      if(v===0) ctx.moveTo(vx,vy); else ctx.lineTo(vx,vy);
    }
    ctx.closePath();
    ctx.fill();
    // 30% of accents also get a tiny halo of micro-specks
    if(rnd() < 0.30){
      const halo = 6 + ((rnd()*8)|0);
      for(let h=0;h<halo;h++){
        const ha = rnd()*Math.PI*2;
        const hd = r*(1.5+rnd()*3.5);
        const hr = r*(0.10+rnd()*0.22);
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(0.40+rnd()*0.30).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(x+Math.cos(ha)*hd, y+Math.sin(ha)*hd, hr, 0, Math.PI*2);
        ctx.fill();
      }
    }
  }
  // 6) RARE INK DOTS — a few deep ink accents (~3% rate) for definition.
  const inkDots = Math.max(3, Math.min(30, Math.round(cn*0.08)));
  const visInk = Math.max(1, Math.ceil(inkDots*progress));
  for(let i=0;i<visInk;i++){
    const rnd = _seedRnd(i+3500, ss, 0, 0);
    const x = rnd()*CW, y = rnd()*CH;
    const r = Math.min(CW,CH)*(0.002+rnd()*0.006);
    ctx.fillStyle = `rgba(20,18,24,${(0.65+rnd()*0.25).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fill();
  }
}

// ── Pollock E: Handprints + drip — hand stamps along the edges + drip field. ──

// ── Pollock F: Blue Poles — vertical pole bars over the drip field. ──
function pollockPhasePoles(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  ctx.fillStyle=isBW?'#c0b69e':'#c8bb98';ctx.fillRect(0,0,CW,CH);
  // drip field
  const passes=Math.max(6,Math.min(150,Math.round(cn*0.6)));
  const visP=Math.max(1,Math.ceil(N/cn*passes));
  for(let i=0;i<visP;i++){const rnd=_seedRnd(i+3600,ss,0,0);const {rgb}=_picChord(chords,Math.floor(i*(cn/passes)),gc,isBW);_pollDrip(ctx,rnd()*CW,rnd()*CH,rnd()*CW,rnd()*CH,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.55)`,Math.max(1,CW*0.005),ss,i+3650);}
  // the poles — 8 leaning vertical bars
  const poles=8, visPoles=Math.max(1,Math.ceil(N/cn*poles));
  // Pre-compute signature blue tint adjusted for current tone.
  const _pollPolesBase = isBW ? [30,30,40] : [20,30,120];
  for(let i=0;i<visPoles;i++){
    const rnd=_seedRnd(i+3700,ss,0,0);
    const x=CW*(0.08+i/poles*0.84)+(rnd()-0.5)*CW*0.04;
    const lean=(rnd()-0.5)*CW*0.06;
    // Set per-pole chord energy so Real mode varies pole intensity.
    const _pi = Math.min(cn-1, Math.floor((i/poles)*cn));
    const _pch = chords[_pi];
    _setCurE(_pch && _pch._E);
    let [pr,pg,pb] = _pollPolesBase;
    if(typeof _energyTint === 'function'){ const t=_energyTint(pr,pg,pb); pr=t[0]; pg=t[1]; pb=t[2]; }
    if(typeof _pastelTint === 'function'){ const p=_pastelTint(pr,pg,pb); pr=p[0]; pg=p[1]; pb=p[2]; }
    ctx.strokeStyle=`rgba(${pr},${pg},${pb},0.9)`;
    ctx.lineWidth=Math.max(3,CW*0.014);ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(x-lean,CH*0.08);ctx.lineTo(x+lean,CH*0.92);ctx.stroke();
  }
}

// ── Pollock G: Stenographic Figure — pre-drip (1942) era. Three totemic
// vertical figures with eyes, horns, body segments, on a warm cream-yellow
// ground; floating chord-coloured symbols (eyes, arrows, triangles, squiggles)
// surround them; a black scribble line connects them across the top. Reveal
// progress scales figure count + symbol count, so short songs show one figure,
// long songs build the full composition.
function pollockPhaseStenographic(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  // ── AUTUMN RHYTHM — long horizontal looping skeins in three passes ──
  // Replaces the former vertical "stenographic" columns. Classic all-over
  // drip organised horizontally: (1) black/umber armature laid first, (2)
  // chord-coloured accents, (3) cream/white highlights arriving late. Loop
  // amplitude and skein count follow the song's energy; every value comes
  // from _seedRnd so (piece, artist, v) stays a pure address.
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const progress = N/Math.max(1,cn);
  const D=Math.min(CW,CH);

  // ── Burlap-cream ground with a faint warm wash ──
  ctx.fillStyle = isBW ? '#c6bda6' : '#ddd0b0';
  ctx.fillRect(0,0,CW,CH);
  const wash = ctx.createLinearGradient(0,0,0,CH);
  if(isBW){
    wash.addColorStop(0,'rgba(150,142,128,0.14)');
    wash.addColorStop(1,'rgba(110,104,96,0.10)');
  } else {
    wash.addColorStop(0,'rgba(205,170,120,0.14)');
    wash.addColorStop(1,'rgba(160,120,80,0.10)');
  }
  ctx.fillStyle = wash;
  ctx.fillRect(0,0,CW,CH);

  const _ch = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const drive = _ch ? (0.55*_ch.energy + 0.45*_ch.density) : 0.5;

  // Layer sizing: armature completes early, colour mid-song, lights late.
  // SONG-COLOUR FIRST: chord-coloured skeins dominate; the dark armature is
  // just a thin scaffold and cream lights only a final sparkle.
  const nArm = Math.round(4 + drive*2);    // 4-6 thin dark skeins
  const nCol = Math.round(18 + drive*8);   // 18-26 colour skeins — the painting
  const nLit = Math.round(3  + drive*2);   // 3-5 highlight skeins
  const armVis = Math.min(nArm, Math.ceil(nArm * Math.min(1, progress*1.6)));
  const colVis = Math.min(nCol, Math.ceil(nCol * Math.max(0, Math.min(1,(progress-0.10)*1.45))));
  const litVis = Math.min(nLit, Math.ceil(nLit * Math.max(0, Math.min(1,(progress-0.45)*1.9))));

  const armPal = isBW ? [[22,20,17],[64,58,50]] : [[24,20,16],[62,44,28]];
  const litPal = isBW ? [[240,236,226],[214,206,190]] : [[246,242,232],[236,224,198]];

  function skein(salt, rgbPick, baseW){
    const r=_seedRnd(salt,ss,0,0); r(); r();
    const y0   = CH*(0.06 + r()*0.88);
    const span = CW*(0.75 + r()*0.75);
    const x0   = -CW*0.15 + r()*(CW*1.3 - span);
    const slope= (r()-0.5)*CH*0.12;
    const amp  = D*(0.03 + r()*0.075)*(0.7+0.6*drive);
    const loops= 2.2 + r()*2.6;
    const ph   = r()*6.28318;
    let rgb;
    if(rgbPick==='chord'){
      const _ci=Math.floor(r()*cn);
      _setCurE(chords[_ci] && chords[_ci]._E);
      rgb=_picChord(chords,_ci,gc,isBW).rgb;
    } else {
      rgb=rgbPick[Math.floor(r()*rgbPick.length)];
    }
    const a=0.72+r()*0.16;
    ctx.strokeStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(2)})`;
    ctx.fillStyle=ctx.strokeStyle;
    ctx.lineCap='round';
    const steps=84;
    let px=0,py=0;
    for(let i2=0;i2<=steps;i2++){
      const t=i2/steps;
      const env=0.55+0.45*Math.sin(t*3.05+ph*0.7);
      const x=x0+span*t;
      const y=y0+slope*t+Math.sin(t*6.28318*loops+ph)*amp*env;
      if(i2>0){
        ctx.lineWidth=Math.max(0.9, baseW*(0.45+0.55*Math.abs(Math.sin(i2*0.21+ph))));
        ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(x,y); ctx.stroke();
      }
      px=x; py=y;
      // droplets flung off the skein
      if(((i2*7+((ph*100)|0))%17)===0){
        const dr=_seedRnd(salt*13+i2+9500,ss,0,0); dr();
        const rr=D*(0.0012+dr()*0.004);
        ctx.beginPath();
        ctx.arc(x+(dr()-0.5)*amp*0.9, y+(dr()-0.5)*amp*0.9, rr, 0, 6.28318);
        ctx.fill();
      }
    }
  }

  for(let i=0;i<armVis;i++) skein(8100+i, armPal, D*0.0032);
  for(let i=0;i<colVis;i++) skein(8300+i, 'chord', D*0.0062);
  for(let i=0;i<litVis;i++) skein(8500+i, litPal, D*0.0034);

  // fine spatter mist, grows with the song
  const mist=Math.round(90+260*progress);
  for(let i=0;i<mist;i++){
    const r=_seedRnd(8700+i,ss,0,0); r();
    const w=r();
    let rgb;
    if(w<0.20) rgb=armPal[0];
    else if(w<0.88){
      const _ci=Math.floor(r()*cn);
      rgb=_picChord(chords,_ci,gc,isBW).rgb;
    } else rgb=litPal[0];
    ctx.fillStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(0.5+r()*0.35).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(r()*CW, r()*CH, D*(0.0007+r()*0.0026), 0, 6.28318);
    ctx.fill();
  }
}
function pollockPhaseWhiteLight(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const progress = N/Math.max(1,cn);

  // Deep maroon-brown ground (or dark grey in B/W).
  const grad = ctx.createLinearGradient(0,0,CW,CH);
  if(isBW){
    grad.addColorStop(0, '#2a2622');
    grad.addColorStop(1, '#1a1816');
  } else {
    grad.addColorStop(0, '#3a1c1c');
    grad.addColorStop(1, '#2a1410');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,CW,CH);

  // Subtle dark grain noise — paint-rich texture, palette-independent.
  for(let i=0;i<800;i++){
    const rnd = _seedRnd(i+9100, ss, 0, 0);
    const tone = isBW?60:80;
    ctx.fillStyle = `rgba(${tone},${tone*0.5|0},${tone*0.4|0},${(0.1+rnd()*0.2).toFixed(2)})`;
    ctx.fillRect(rnd()*CW, rnd()*CH, 1+rnd()*2, 1+rnd()*2);
  }

  // Drip count scales with chord count (~0.7×); reveal progress controls
  // visible-pass count so painting builds up gradually as song plays.
  const passes = Math.max(8, Math.min(220, Math.round(cn*0.7)));
  const vis = Math.max(1, Math.ceil(passes*progress));

  for(let i=0;i<vis;i++){
    const rnd = _seedRnd(i+9500, ss, 0, 0);
    const ci = Math.floor(i*(cn/Math.max(1,passes)));
    const {rgb} = _picChord(chords, ci, gc, isBW);

    // 45% cream, 15% pure white, 38% chord-driven accent, 2% rare ink.
    const pick = rnd();
    let col;
    if(pick < 0.45)      col = isBW?[230,230,230]:[245,240,228];  // cream
    else if(pick < 0.60) col = [255,255,255];                       // pure white
    else if(pick < 0.98) col = rgb;                                 // chord accent
    else                 col = [15,12,18];                          // rare ink

    // Drip from edge to edge with optional loopy (15%).
    const padding = Math.max(CW,CH)*0.3;
    const loopy = rnd() < 0.15;
    let x0,y0,x1,y1;
    if(loopy){
      const cx=rnd()*CW, cy=rnd()*CH;
      const reach=Math.min(CW,CH)*(0.25+rnd()*0.3);
      const a1=rnd()*Math.PI*2, a2=a1+Math.PI+(rnd()-0.5)*1.5;
      x0=cx+Math.cos(a1)*reach; y0=cy+Math.sin(a1)*reach;
      x1=cx+Math.cos(a2)*reach; y1=cy+Math.sin(a2)*reach;
    } else {
      const side=(rnd()*4)|0;
      if(side===0){x0=rnd()*CW;y0=-padding;x1=rnd()*CW;y1=CH+padding;}
      else if(side===1){x0=CW+padding;y0=rnd()*CH;x1=-padding;y1=rnd()*CH;}
      else if(side===2){x0=rnd()*CW;y0=CH+padding;x1=rnd()*CW;y1=-padding;}
      else {x0=-padding;y0=rnd()*CH;x1=CW+padding;y1=rnd()*CH;}
    }

    // Polyline wobble (mirrors main body).
    const segs = loopy ? 12+((rnd()*6)|0) : 8+((rnd()*5)|0);
    const dx=x1-x0, dy=y1-y0;
    const len=Math.sqrt(dx*dx+dy*dy)||1;
    const px=-dy/len, py=dx/len;
    const wobScale = loopy ? 0.32 : (rnd()<0.4 ? 0.14 : 0.20);
    const pts=[];
    for(let s=0;s<=segs;s++){
      const t=s/segs;
      const lx=x0+dx*t, ly=y0+dy*t;
      const amp=Math.sin(t*Math.PI)*Math.min(CW,CH)*wobScale;
      const wob=(rnd()-0.5)*2*amp;
      pts.push({x:lx+px*wob, y:ly+py*wob});
    }

    // White/cream get slightly lower alpha so they don't completely flatten;
    // colour accents and ink get full opacity for punch against the dark.
    const isLight = col[0]>200 && col[1]>200;
    const lineW = Math.min(CW,CH)*(0.003+rnd()*0.015);
    const alpha = isLight ? (0.55+rnd()*0.30) : (0.75+rnd()*0.20);
    ctx.strokeStyle = `rgba(${col[0]|0},${col[1]|0},${col[2]|0},${alpha.toFixed(2)})`;
    ctx.lineWidth = lineW;
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for(let k=1;k<pts.length-1;k++){
      const m={x:(pts[k].x+pts[k+1].x)/2, y:(pts[k].y+pts[k+1].y)/2};
      ctx.quadraticCurveTo(pts[k].x, pts[k].y, m.x, m.y);
    }
    ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
    ctx.stroke();

    // Beads + occasional satellite splatter.
    const colStr = `rgba(${col[0]|0},${col[1]|0},${col[2]|0},${alpha.toFixed(2)})`;
    const beads = 2+Math.floor(rnd()*4);
    for(let b=0;b<beads;b++){
      const idx = Math.floor(rnd()*pts.length);
      const p = pts[idx];
      ctx.fillStyle = colStr;
      ctx.beginPath();
      ctx.arc(p.x, p.y, lineW*0.55 + rnd()*lineW*0.6, 0, Math.PI*2);
      ctx.fill();
    }
    if(rnd()<0.5){
      for(let b=0;b<3+Math.floor(rnd()*5);b++){
        const idx = Math.floor(rnd()*pts.length);
        const p = pts[idx];
        const sx = p.x + (rnd()-0.5)*lineW*8;
        const sy = p.y + (rnd()-0.5)*lineW*8;
        ctx.fillStyle = colStr;
        ctx.beginPath();
        ctx.arc(sx, sy, lineW*0.15 + rnd()*lineW*0.4, 0, Math.PI*2);
        ctx.fill();
      }
    }
  }
}

// Kandinsky canvas-wide CONTOUR overlay. Layered on top of the per-cell
// Kandinsky composition. Draws large geometric shapes as OUTLINES ONLY
// (no fills) in varied Kandinsky-palette colors, crossing cell boundaries
// to unify the painting. Same threshold-based freeze pattern as Pollock:
// shapes accumulate as chord count grows; new chords unlock new shapes,
// existing ones never reshuffle. Re-randomized on Clear/Vary via sessionSeed.
//
// Shape vocabulary (contour-only):
//   • Large outlined triangles spanning multiple cells
//   • Large concentric-circle rings (no fill, just stroked rings)
//   • Long diagonal lines crossing the canvas
//   • Outlined arc/crescent fragments
//   • Outlined zigzag lightning paths
// Miró canvas-wide overlay -- biomorphic surrealist composition.
// Visual vocabulary from the reference: thin black connector lines strung
// with dots/nodes, bold flat shapes (stars, crescents, eyes, biomorphic
// blobs, triangles) in Miró's signature palette (black, red, blue, yellow
// on a near-white textured ground). Light red/blue washes for atmosphere.
//
// Architecture: same as Kandinsky/Pollock -- one pass per chord, seeded
// from (passIndex + sessionSeed, 0, 0). Colors driven by gc() note mapping.
// Miró palette is fixed (black dominant + red/blue/yellow accents) but chord
// color biases which accent appears. Mode param for b/w support.
// Miró canvas-wide overlay -- combining both Constellations paintings.
// Dark textured ground (deep brown/black) packed edge-to-edge with shapes:
// connector lines + bead nodes, concentric-ring targets, stars/spikes,
// biomorphic blobs, eyes, crescents, triangles. Full Miró palette -- black,
// red, green, blue, yellow, orange -- driven by gc() note-color mapping.
// Same freeze/seed/chord architecture as Pollock/Kandinsky.
function drawPicassoOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim||!chords||!chords.length) return;
  const ss=sessionSeed|0;
  // ── PHASE CHOOSER: commit to ONE of Picasso's modes per painting ──
  // Stable from session seed, re-rolls on Vary/Random. Six abstract phases:
  //  LightLine       = 1949 "light drawings": one unbroken luminous stroke.
  //  BlueAtmo        = Blue Atmosphere veils (cool palette, soft edges).
  //  Analytic (A)    = recursive plane subdivision + pencil-grain hatching.
  //  FacetedDrift    = directional flow field of small angular facets.
  //  StillLife       = geometric still-life via composition only (no outlines).
  //  TonalCubism     = meditative warm-grey planes with charcoal wash masses.
  // No phase carries a literal subject — every Picasso phase is pure spatial
  // fragmentation. Identity comes from mass, edge, overlap, tonality.
  // Free (cap=2) sees positions 0,1. Analytic Cubism is the most expensive
  // phase (dense pencil-grain hatching) and caused jank on lower-end devices,
  // so it's moved OUT of the Free slots: Free gets LightLine + BlueAtmo
  // (both light to draw). Pro reaches Analytic and the rest at higher indices.
  // SyntheticPlanes was retired from the wheel (curation, Aug 2026) — the
  // function stays below for reference but is no longer reachable.
  const _picassoOrder = [picassoPhaseLightLine, picassoPhaseBlueAtmo, picassoPhaseA, picassoPhaseFacetedDrift, picassoPhaseStillLife, picassoPhaseTonalCubism];
  const _pn=_capN(6); const pick=((phaseIndex|0)%_pn+_pn)%_pn;
  (_picassoOrder[pick]||picassoPhaseSyntheticPlanes)(ctx,CW,CH,chords,lim,gc,ss,mode);
}

// ── Picasso phase LIGHT LINE — the 1949 "light drawings". ──
// One unbroken luminous stroke draws itself across a near-black ground for
// the WHOLE song: chord energy drives speed, thickness and loop-arabesques;
// quiet passages run white, energetic passages tint into the chord's colour
// (whole phrases, not single segments). BW mode = pure white light, accents
// carried by width/glow alone — which is exactly what Picasso's original
// black-and-white photographs were. Deterministic: the path is generated
// sequentially from chord 0, so any progress prefix is identical.
function picassoPhaseLightLine(ctx, CW, CH, chords, lim, gc, sessionSeed, mode){
  const ss=sessionSeed|0, isBW=mode==='bw';
  const cn=chords.length, N=Math.max(1,Math.min(cn,lim));
  const D=Math.min(CW,CH);
  // near-black ground + soft vignette
  ctx.fillStyle='#0c0b0e'; ctx.fillRect(0,0,CW,CH);
  const vg=ctx.createRadialGradient(CW/2,CH/2,D*0.2,CW/2,CH/2,D*0.75);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.42)');
  ctx.fillStyle=vg; ctx.fillRect(0,0,CW,CH);
  const r=_seedRnd(9100,ss,0,0); r(); r();
  let x=CW*(0.10+r()*0.12), y=CH*(0.35+r()*0.3), ang=r()*6.28318;
  ctx.lineCap='round'; ctx.lineJoin='round';
  let tint=0; // smoothed colour amount — whole phrases, not single segments
  for(let i=0;i<N;i++){
    const ch=chords[i];
    const E=(ch&&typeof ch._E==='number')?ch._E:0.5;
    _setCurE(E);
    const cc=_picChord(chords,i,gc,isBW).rgb;
    // phrase-level tint: eases toward the chord colour in energetic passages
    tint += ((E>0.55 ? Math.min(1,(E-0.35)*1.5) : 0) - tint)*0.25;
    const t=isBW?0:tint;
    const R=Math.round(255+(cc[0]-255)*t), G=Math.round(250+(cc[1]-250)*t), B=Math.round(240+(cc[2]-240)*t);
    const col='rgba('+R+','+G+','+B+',0.92)';
    const w=D*0.0016*(1+2.1*E);
    const per=7, sp=D*(0.006+0.007*E);
    ctx.beginPath(); ctx.moveTo(x,y);
    for(let k=0;k<per;k++){
      ang += (r()-0.5)*0.42 + 0.16*Math.sin((i*per+k)*0.13);
      if(E>0.72 && r()<0.10){        // accent → arabesque loop
        for(let q=0;q<22;q++){ ang+=0.29; x+=Math.cos(ang)*sp*0.8; y+=Math.sin(ang)*sp*0.68; ctx.lineTo(x,y); }
      }
      x+=Math.cos(ang)*sp; y+=Math.sin(ang)*sp*0.85;
      if(x<CW*0.06||x>CW*0.94){ ang=Math.PI-ang; x=Math.max(CW*0.06,Math.min(CW*0.94,x)); }
      if(y<CH*0.07||y>CH*0.93){ ang=-ang; y=Math.max(CH*0.07,Math.min(CH*0.93,y)); }
      ctx.lineTo(x,y);
    }
    // glow pass + bright core in one shadowed stroke
    ctx.shadowColor=col; ctx.shadowBlur=D*0.016*(0.8+E);
    ctx.strokeStyle=col; ctx.lineWidth=w; ctx.stroke();
  }
  ctx.shadowBlur=0;
}

// ── Picasso phase A: Analytic Cubism — the original angular shard composition. ──
function picassoPhaseA(ctx, CW, CH, chords, lim, gc, sessionSeed, mode){
  const ss=sessionSeed|0;
  const N=Math.min(lim,chords.length);
  const D=Math.min(CW,CH);
  const isBW=mode==='bw';
  const grey=(r,g,b)=>{const v=Math.round(r*0.299+g*0.587+b*0.114);return[v,v,v];};
  const _pal=[[60,110,70],[200,55,40],[100,55,130],[50,90,150],[210,170,30],[220,200,170],[15,8,18],[180,80,50]];
  const pal=isBW?_pal.map(([r,g,b])=>grey(r,g,b)):_pal;
  // Tone-adjust helper: feed colour through Real (energy) + Pastel filters so
  // Picasso's hard-coded palette breathes with the music. No-op in Pure mode.
  const _tonedRGB = (r,g,b)=>{
    if(typeof _energyTint === 'function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint === 'function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return [r,g,b];
  };
  const pickColor=(r,g,b,hint,rnd)=>{
    const lum=(r*0.299+g*0.587+b*0.114)/255;
    let c;
    if(hint%3===0){if(lum<0.25)c=pal[6];else if(lum<0.45)c=pal[3];else if(lum<0.65)c=pal[0];else if(lum<0.85)c=pal[4];else c=pal[5];}
    else if(hint%3===1){if(r>g&&r>b)c=pal[1];else if(g>r&&g>b)c=pal[0];else if(b>r&&b>g)c=pal[2];else c=pal[7];}
    else{c=pal[hint%pal.length];}
    const tr=Math.max(0,Math.min(255,c[0]+Math.round((rnd()-0.5)*28)));
    const tg=Math.max(0,Math.min(255,c[1]+Math.round((rnd()-0.5)*28)));
    const tb=Math.max(0,Math.min(255,c[2]+Math.round((rnd()-0.5)*28)));
    return _tonedRGB(tr,tg,tb);
  };
  // MAX_PLANES grows with chord count and is capped to prevent runaway subdivision
  // (each plane = one subdivision step). Curve calibrated so short pieces stay
  // legible (30 chords → 30 planes) and long pieces keep adding planes well
  // past the 300-mark (was previous cap).
  const _chP = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const _planeMul = _chP ? (0.50 + 1.01*(0.55*_chP.energy + 0.45*_chP.density)) : 1;
  const MAX_PLANES=Math.max(2,Math.round(Math.min(chords.length,Math.min(500,
    chords.length<=30  ? chords.length
    :chords.length<=80 ? 30+Math.floor((chords.length-30)*0.60)
    :chords.length<=200? 60+Math.floor((chords.length-80)*0.50)
    :chords.length<=400? 120+Math.floor((chords.length-200)*0.60)
    :chords.length<=700? 240+Math.floor((chords.length-400)*0.55)
    :405+Math.floor((chords.length-700)*0.35)
  )*_planeMul)));
  const paintCount=Math.min(MAX_PLANES,Math.round(lim*(MAX_PLANES/chords.length)));
  let planes=[[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]];
  for(let cut=0;cut<MAX_PLANES-1;cut++){
    const cr=_seedRnd(cut+1,ss,0,0);
    let bigIdx=0,bigArea=0;
    for(let pi=0;pi<planes.length;pi++){const p=planes[pi];let xMin=1,xMax=0,yMin=1,yMax=0;for(const v of p){if(v.x<xMin)xMin=v.x;if(v.x>xMax)xMax=v.x;if(v.y<yMin)yMin=v.y;if(v.y>yMax)yMax=v.y;}const ar=(xMax-xMin)*(yMax-yMin);if(ar>bigArea){bigArea=ar;bigIdx=pi;}}
    const target=planes[bigIdx];let xMin=1,xMax=0,yMin=1,yMax=0;for(const v of target){if(v.x<xMin)xMin=v.x;if(v.x>xMax)xMax=v.x;if(v.y<yMin)yMin=v.y;if(v.y>yMax)yMax=v.y;}
    const cutAng=cr()*Math.PI*2,pivX=xMin+(xMax-xMin)*(0.28+cr()*0.44),pivY=yMin+(yMax-yMin)*(0.28+cr()*0.44);
    const nX=-Math.sin(cutAng),nY=Math.cos(cutAng);
    const sA=[],sB=[];
    for(let i=0;i<target.length;i++){const v=target[i],next=target[(i+1)%target.length];const dv=(v.x-pivX)*nX+(v.y-pivY)*nY,dn=(next.x-pivX)*nX+(next.y-pivY)*nY;if(dv>=0)sA.push(v);else sB.push(v);if((dv>=0)!==(dn>=0)){const t=dv/(dv-dn);const ip={x:v.x+(next.x-v.x)*t,y:v.y+(next.y-v.y)*t};sA.push(ip);sB.push({...ip});}}
    if(sA.length>=3&&sB.length>=3)planes.splice(bigIdx,1,sA,sB);
  }
  planes.slice(0,paintCount).forEach((poly,pIdx)=>{
    const scaled=poly.map(v=>({x:v.x*CW,y:v.y*CH}));
    const chord=chords[Math.min(chords.length-1,Math.floor(pIdx*(chords.length/MAX_PLANES)))];
    _setCurE(chord && chord._E);
    const notes=chord.n||chord.notes||[];
    let aR=0,aG=0,aB=0,aA=0,aV=0,c=0;
    for(const note of notes){const m=note.m!==undefined?note.m:note;const v=note.v!==undefined?note.v:80;const[r,g,b,a]=gc(m,v);aR+=r;aG+=g;aB+=b;aA+=(a||0.9);aV+=v;c++;}
    if(!c){aR=120;aG=100;aB=160;aA=0.9;aV=80;c=1;}
    const cR=aR/c,cG=aG/c,cB=aB/c,cA=Math.min(1,aA/c),energy=Math.max(0,Math.min(1,(aV/c-30)/90));
    const rnd=_seedRnd(pIdx+500,ss,0,0);
    let xMin=CW,xMax=0,yMin=CH,yMax=0,cX=0,cY=0;
    for(const v of scaled){if(v.x<xMin)xMin=v.x;if(v.x>xMax)xMax=v.x;if(v.y<yMin)yMin=v.y;if(v.y>yMax)yMax=v.y;cX+=v.x;cY+=v.y;}
    cX/=scaled.length;cY/=scaled.length;
    const reach=Math.sqrt((xMax-xMin)**2+(yMax-yMin)**2),minDim=Math.min(xMax-xMin,yMax-yMin);
    const[pR,pG,pB]=pickColor(cR,cG,cB,pIdx,rnd);
    const buildPath=()=>{ctx.beginPath();ctx.moveTo(scaled[0].x,scaled[0].y);for(let i=1;i<scaled.length;i++)ctx.lineTo(scaled[i].x,scaled[i].y);ctx.closePath();};
    buildPath();ctx.fillStyle=`rgba(${Math.round(cR)},${Math.round(cG)},${Math.round(cB)},${(Math.min(0.97,0.80+energy*0.17)).toFixed(2)})`;ctx.fill();
    ctx.save();buildPath();ctx.clip();
    const grainAng=rnd()*Math.PI*2,cosG=Math.cos(grainAng),sinG=Math.sin(grainAng);
    const gap=Math.max(1.5,minDim*0.06),sLen=Math.max(3,minDim*0.20),sW=Math.max(0.6,minDim*0.022);
    const rows=Math.ceil(reach*2/gap)+2;
    const noteColors=notes.length?notes.map(n=>{const m=n.m!==undefined?n.m:n;const v=n.v!==undefined?n.v:80;return gc(m,v);}):[[[cR,cG,cB,cA]]];
    for(let ri=-rows;ri<=rows;ri++){const off=ri*gap+(rnd()-0.5)*gap*0.4;const nInRow=Math.ceil(reach/sLen)+1;for(let si=-nInRow;si<=nInRow;si++){const along=si*sLen*0.85+(rnd()-0.5)*sLen*0.3;const x0=cX+cosG*along+(-sinG)*off,y0=cY+sinG*along+cosG*off;const len=sLen*(0.7+rnd()*0.6);const nc=noteColors[Math.floor(rnd()*noteColors.length)];const[nr,ng,nb]=nc;const tj=(rnd()-0.5)*22;const sR2=Math.max(0,Math.min(255,Math.round(nr+tj))),sG2=Math.max(0,Math.min(255,Math.round(ng+tj*0.8))),sB2=Math.max(0,Math.min(255,Math.round(nb+tj*0.6)));ctx.strokeStyle=`rgba(${sR2},${sG2},${sB2},${(0.55+rnd()*0.28).toFixed(2)})`;ctx.lineWidth=sW*(0.7+rnd()*0.5);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x0-cosG*len*0.5,y0-sinG*len*0.5);ctx.lineTo(x0+cosG*len*0.5,y0+sinG*len*0.5);ctx.stroke();}}
    ctx.restore();
    if(rnd()<0.25+energy*0.20){ctx.save();buildPath();ctx.clip();const patNc=noteColors[Math.floor(rnd()*noteColors.length)];const useContrast=rnd()<0.35;const patC=useContrast?[Math.round(patNc[0]),Math.round(patNc[1]),Math.round(patNc[2])]:(isBW?[30,30,30]:[15,8,18]);const patA=(0.75+rnd()*0.18).toFixed(2);if(rnd()<0.55){ctx.fillStyle=`rgba(${patC[0]},${patC[1]},${patC[2]},${patA})`;const dg=Math.max(3,minDim*0.12),dr=dg*(0.22+rnd()*0.12);for(let dy=yMin;dy<yMax;dy+=dg){const ro=(Math.round((dy-yMin)/dg)%2)*dg*0.5;for(let dx=xMin;dx<xMax;dx+=dg){ctx.beginPath();ctx.arc(dx+ro,dy,dr,0,Math.PI*2);ctx.fill();}}}else{ctx.strokeStyle=`rgba(${patC[0]},${patC[1]},${patC[2]},${patA})`;const sg=Math.max(2,minDim*0.09);ctx.lineWidth=sg*0.28;const sa=rnd()*Math.PI,cosS=Math.cos(sa),sinS=Math.sin(sa);const cnt=Math.ceil(reach*2/sg)+2;for(let st=-cnt;st<cnt;st++){const off=st*sg;ctx.beginPath();ctx.moveTo(cX+(-sinS)*off-cosS*reach,cY+cosS*off-sinS*reach);ctx.lineTo(cX+(-sinS)*off+cosS*reach,cY+cosS*off+sinS*reach);ctx.stroke();}}ctx.restore();}
    const jS=D*0.003;ctx.beginPath();ctx.moveTo(scaled[0].x+(rnd()-0.5)*jS,scaled[0].y+(rnd()-0.5)*jS);for(let i=1;i<scaled.length;i++){const prev=scaled[i-1],cur=scaled[i];for(let s=1;s<=3;s++){const t=s/3;ctx.lineTo(prev.x+(cur.x-prev.x)*t+(rnd()-0.5)*jS,prev.y+(cur.y-prev.y)*t+(rnd()-0.5)*jS);}}ctx.closePath();
    ctx.strokeStyle=isBW?`rgba(20,20,20,${(0.82+energy*0.15).toFixed(2)})`:(rnd()<0.88?`rgba(15,8,18,${(0.82+energy*0.15).toFixed(2)})`:`rgba(200,55,40,0.88)`);
    ctx.lineWidth=Math.max(0.8,D*(0.003+energy*0.004));ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
  });
}

// ── Picasso Synthetic Planes: pure abstract spatial fragmentation. 5–9 large
// irregular planes, asymmetric tonal mass loaded to one side per song direction.
// One dark plane (heaviest), one bright chord-coloured accent, mid planes pulled
// toward restrained earth tones. Thick irregular charcoal contours. NO objects,
// NO silhouettes — Picasso 1921–25 mass/edge/overlap signature without subject.
function picassoPhaseSyntheticPlanes(ctx, CW, CH, chords, lim, gc, sessionSeed, mode){
  const ss=sessionSeed|0;
  const isBW=mode==='bw';
  const cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const reveal=Math.max(0,Math.min(1,N/cn));
  const D=Math.min(CW,CH);

  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const energy=_ch?_ch.energy:0.5;
  const density=_ch?_ch.density:0.3;
  const register=_ch?_ch.register:0.5;

  // Cream paper ground.
  ctx.fillStyle=isBW?'#e4e1d8':'#e8dabc';
  ctx.fillRect(0,0,CW,CH);

  // Subtle paper grain (stable per-session, not per-frame).
  ctx.save();
  ctx.globalAlpha=0.07;
  ctx.fillStyle=isBW?'rgb(50,42,32)':'rgb(70,52,28)';
  for(let i=0;i<600;i++){
    const gr=_seedRnd(i+7700,ss,0,0);
    ctx.fillRect(gr()*CW,gr()*CH,1,1);
  }
  ctx.restore();

  // Plane count: 5–9 driven by song character.
  const planeCountFull=Math.max(5,Math.min(9,5+Math.round((energy+density)*2)));
  const visPlanes=Math.max(1,Math.ceil(planeCountFull*reveal));

  // Asymmetric composition: dark mass loaded to one side.
  // Side chosen per session, vertical bias chosen by register
  // (low register → bottom heavy; high register → top heavy).
  const dirR=_seedRnd(7701,ss,0,0); dirR(); dirR();
  const heavyLeft=dirR()<0.5;
  const heavyTop=register<0.5;

  // Generate plane data (deterministic from session seed + index).
  const planes=[];
  for(let i=0;i<planeCountFull;i++){
    const r=_seedRnd(i+7900,ss,0,0); r(); r();
    let cx, cy, sz;
    if(i===0){
      // DARK MASS — largest, one side
      cx=heavyLeft?CW*(0.10+r()*0.18):CW*(0.72+r()*0.18);
      cy=heavyTop?CH*(0.15+r()*0.30):CH*(0.55+r()*0.30);
      sz=D*(0.55+r()*0.18);
    } else if(i===planeCountFull-1){
      // ACCENT — small, off-centre
      cx=CW*(0.30+r()*0.40);
      cy=CH*(0.32+r()*0.36);
      sz=D*(0.10+r()*0.07);
    } else {
      // MID — spread across canvas
      cx=CW*(0.18+r()*0.64);
      cy=CH*(0.18+r()*0.64);
      sz=D*(0.28+r()*0.22);
    }
    // Irregular polygon, 5–7 sides, deliberately uneven.
    const sides=5+Math.floor(r()*3);
    const verts=[];
    for(let s=0;s<sides;s++){
      const a=(s/sides)*Math.PI*2+(r()-0.5)*0.7;
      const rr=sz*(0.60+r()*0.65);
      verts.push([cx+Math.cos(a)*rr,cy+Math.sin(a)*rr]);
    }
    planes.push({cx,cy,sz,verts,idx:i,isDark:i===0,isAccent:i===planeCountFull-1});
  }

  // Draw in order: dark first (background), mid, accent last (top).
  for(let i=0;i<visPlanes;i++){
    const p=planes[i];
    const {rgb,energy:cE}=_picChord(chords,Math.floor(i*cn/planeCountFull),gc,isBW);

    let fR, fG, fB;
    if(p.isDark){
      fR=isBW?35:28; fG=isBW?35:22; fB=isBW?38:28;
    } else if(p.isAccent){
      // Boost saturation — bright chord colour.
      const mx=Math.max(rgb[0],rgb[1],rgb[2]);
      const k=mx>10?240/mx:1;
      fR=Math.min(255,rgb[0]*k);
      fG=Math.min(255,rgb[1]*k);
      fB=Math.min(255,rgb[2]*k);
    } else {
      // Pull mid planes toward muted earth.
      fR=Math.round(rgb[0]*0.72+34);
      fG=Math.round(rgb[1]*0.72+28);
      fB=Math.round(rgb[2]*0.72+26);
    }
    // Tone adjustments (Real energy, Pastel softness).
    if(typeof _energyTint==='function'){const t=_energyTint(fR,fG,fB);fR=t[0];fG=t[1];fB=t[2];}
    if(typeof _pastelTint==='function'){const t=_pastelTint(fR,fG,fB);fR=t[0];fG=t[1];fB=t[2];}

    const buildPath=()=>{
      ctx.beginPath();
      ctx.moveTo(p.verts[0][0],p.verts[0][1]);
      for(let v=1;v<p.verts.length;v++)ctx.lineTo(p.verts[v][0],p.verts[v][1]);
      ctx.closePath();
    };

    buildPath();
    ctx.fillStyle=`rgba(${fR|0},${fG|0},${fB|0},${(0.90+cE*0.08).toFixed(2)})`;
    ctx.fill();

    // Subtle inner grain texture — barely visible, gives surface depth.
    ctx.save();
    buildPath();
    ctx.clip();
    ctx.fillStyle=p.isDark?'rgba(255,250,240,0.045)':'rgba(15,10,18,0.07)';
    for(let g=0;g<80;g++){
      const r=_seedRnd(g+i*200+8500,ss,0,0);
      ctx.fillRect(p.cx+(r()-0.5)*p.sz*2,p.cy+(r()-0.5)*p.sz*2,1.2,1.2);
    }
    ctx.restore();

    // Thick irregular charcoal contour — per-segment jitter, no clean line.
    const jR=_seedRnd(i+9100,ss,0,0);
    const jit=D*0.005;
    ctx.beginPath();
    ctx.moveTo(p.verts[0][0]+(jR()-0.5)*jit,p.verts[0][1]+(jR()-0.5)*jit);
    for(let v=1;v<p.verts.length;v++){
      const prev=p.verts[v-1], cur=p.verts[v];
      for(let s=1;s<=3;s++){
        const t=s/3;
        ctx.lineTo(
          prev[0]+(cur[0]-prev[0])*t+(jR()-0.5)*jit,
          prev[1]+(cur[1]-prev[1])*t+(jR()-0.5)*jit
        );
      }
    }
    ctx.closePath();
    ctx.strokeStyle=isBW?'rgba(15,15,18,0.94)':'rgba(15,8,18,0.94)';
    ctx.lineWidth=Math.max(2,D*(0.0055+cE*0.003));
    ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.stroke();
  }
}

// Shared helper for the new Picasso phases: average a chord's colour + energy.
function _picChord(chords,idx,gc,isBW){
  const grey=(r,g,b)=>{const v=Math.round(r*0.299+g*0.587+b*0.114);return[v,v,v];};
  const chord=chords[Math.min(chords.length-1,Math.max(0,idx))];
  // Set the current chord's energy BEFORE calling gc so Real tone applies the
  // local dynamic level to every voice we sample here. _picChord is called by
  // ~all per-chord overlay sites (~99 callsites), so a single line here drives
  // pastel-at-piano / deep-at-forte modulation across the whole artist family.
  _setCurE(chord && chord._E);
  const notes=chord&&(chord.n||chord.notes||[]);
  let aR=0,aG=0,aB=0,aV=0,c=0;
  if(notes&&notes.length)for(const note of notes){const m=note.m!==undefined?note.m:note;const v=note.v!==undefined?note.v:80;const[r,g,b]=gc(m,v);aR+=r;aG+=g;aB+=b;aV+=v;c++;}
  if(!c)return{rgb:[120,100,160],energy:0.5};
  let rgb=[aR/c,aG/c,aB/c]; if(isBW)rgb=grey(rgb[0],rgb[1],rgb[2]);
  return{rgb:rgb.map(Math.round),energy:Math.max(0,Math.min(1,(aV/c-30)/90))};
}

// ── Picasso phase C: Blue Period — cool monochrome vertical columns. Each chord
// becomes a tall column; its hue is pulled toward Picasso's melancholic blues,
// lightness tracks the music. Reveals left-to-right with lim. ──
// ── Picasso phase C: Three Musicians v4. Each session: random figure count (1-4),
// random positions (scattered or row), 6 instrument types, 3 head shapes, 4 arm
// poses. Chord-driven colours per shard. ──

// ── Picasso phase D: Harlequin Mosaic v2. Random grid dims, 3 orientations,
// skip probability for gaps, per-cell size jitter. ──

// ── Picasso phase E: Cubist Mask v3. Random 1-2 masks, 4 face aspects, 4 eye
// styles, 3 nose styles, 3 mouth styles, tilt. ──

// ── Picasso phase F: Cubist Dove v3. Random 1-3 doves, 3 poses (standing,
// flying, looking-back), mirror, optional olive branch. ──


// ── Picasso Blue Atmosphere: cool blue cubist mood via palette shift, no
// figures. Cool gradient ground + dense overlapping shards in blue-biased
// chord palette + diagonal pencil hatching. Blue Period melancholy via colour,
// not via drawing sad people.
function picassoPhaseBlueAtmo(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));
  const D=Math.min(CW,CH);
  const sR = _seedRnd(8201,ss,0,12); sR(); sR();

  // Song character → plane count + size. Calm/sparse music = fewer, larger,
  // softer planes (meditative depth). Energetic/dense = more, busier overlap.
  // Markedly distinct compositional logic from FacetedField's dense small shards.
  const _ch = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const drive = _ch ? (0.55*_ch.energy + 0.45*_ch.density) : 0.5;
  const planeCountFull = Math.max(6, Math.round(9 + drive*7));    // 9-16 LARGE planes (was 70-110)

  // Cool blue atmospheric ground (palette-independent so the mood reads as Blue
  // Period). Tone-adjust each gradient stop so Pastel softens, Real picks up
  // the opening chord's energy.
  const _adjHex = (hex)=>{
    let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    if(typeof _energyTint === 'function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint === 'function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return `rgb(${r},${g},${b})`;
  };
  if(chords && chords.length){ const _c0=chords[0]; _setCurE(_c0 && _c0._E); }
  const grad = ctx.createLinearGradient(0,0,CW,CH);
  if(isBW){
    grad.addColorStop(0, _adjHex('#28282c'));
    grad.addColorStop(0.5, _adjHex('#3a3a40'));
    grad.addColorStop(1, _adjHex('#22222a'));
  } else {
    grad.addColorStop(0, _adjHex('#16203a'));
    grad.addColorStop(0.5, _adjHex('#243a5c'));
    grad.addColorStop(1, _adjHex('#141d2e'));
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,CW,CH);

  // Few LARGE layered translucent planes — Blue Period as depth/atmosphere,
  // not scattered confetti. Each plane has an inner radial gradient so it
  // reads as a soft veil, not a flat shard. Overlap creates depth.
  const visPlanes = Math.max(2, Math.ceil(planeCountFull * reveal));
  for(let i=0;i<visPlanes;i++){
    const r1 = _seedRnd(i+8300,ss,0,0); r1(); r1();
    const cx = r1()*CW;
    const cy = r1()*CH;
    const sz = D*(0.30 + r1()*0.45);                              // LARGE (30-75% of min dim)
    const rot = r1()*Math.PI*2;
    const sides = 3 + Math.floor(r1()*3);
    const {rgb,energy} = _picChord(chords, i%cn, gc, isBW);
    // Blue-bias the chord colour for the plane.
    const cr = isBW ? Math.round(rgb[0]*0.5+40) : Math.round(rgb[0]*0.30 + 25);
    const cg = isBW ? Math.round(rgb[1]*0.5+45) : Math.round(rgb[1]*0.42 + 40);
    const cb = isBW ? Math.round(rgb[2]*0.5+55) : Math.round(rgb[2]*0.75 + 70);
    // Inner radial gradient: bright-ish centre, fades to near-transparent edge.
    // This is the depth/atmosphere read — soft veil, not hard shard.
    const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, sz);
    pg.addColorStop(0, `rgba(${Math.min(255,cr)|0},${Math.min(255,cg)|0},${Math.min(255,cb)|0},${(0.36+energy*0.14).toFixed(2)})`);
    pg.addColorStop(1, `rgba(${Math.min(255,cr)|0},${Math.min(255,cg)|0},${Math.min(255,cb+20)|0},0.08)`);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.beginPath();
    for(let s=0;s<sides;s++){
      const a = (s/sides)*Math.PI*2;
      const r = sz * (0.70 + r1()*0.55);
      const px = Math.cos(a)*r, py = Math.sin(a)*r;
      if(s===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = pg;
    ctx.fill();
    // Thin chord-coloured contour — Paintiano signature bleeds through the
    // cool veils. Picasso's Blue Period was never pure blue: skin, rose,
    // ochre touches cut through the melancholy. Here the contour carries the
    // song's harmony. Boost dark chord colours up so the line reads against
    // the deep blue ground, without washing out the hue.
    const _mx = Math.max(rgb[0], rgb[1], rgb[2], 1);
    const _boost = _mx < 170 ? 170/_mx : 1;
    const _cR = Math.min(255, Math.round(rgb[0]*_boost));
    const _cG = Math.min(255, Math.round(rgb[1]*_boost));
    const _cB = Math.min(255, Math.round(rgb[2]*_boost));
    if(isBW){
      const _lum = Math.round(_cR*0.299 + _cG*0.587 + _cB*0.114);
      ctx.strokeStyle = `rgba(${Math.min(255,_lum+50)},${Math.min(255,_lum+50)},${Math.min(255,_lum+50)},0.78)`;
    } else {
      ctx.strokeStyle = `rgba(${_cR},${_cG},${_cB},${(0.78 + energy*0.14).toFixed(2)})`;
    }
    ctx.lineWidth = Math.max(0.9, D*0.0017);
    ctx.stroke();
    ctx.restore();
  }

  // Very faint, sparse hatching — atmospheric texture only, not the dense
  // pencil-grain signature of analytic cubism.
  const visHatches = Math.ceil(80 * reveal);
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = isBW ? 'rgba(15,15,18,0.9)' : 'rgba(15,20,30,0.9)';
  ctx.lineWidth = 0.5;
  for(let k=0;k<visHatches;k++){
    const hR = _seedRnd(k+8400,ss,0,0); hR();
    const sx = hR()*CW, sy = hR()*CH;
    const len = 10 + hR()*22;
    const a = -Math.PI/3 + (hR()-0.5)*0.3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a)*len, sy + Math.sin(a)*len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ── Picasso Rose Atmosphere: warm palette cubist mood, no figures. Same
// structure as Blue Atmo but with warm pink/ochre bias. Rose Period warmth
// via colour, not via harlequin figures.
function picassoPhaseRoseAtmo(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));
  const sR = _seedRnd(8501,ss,0,13); sR(); sR();

  const shardCountFull = 70 + Math.floor(sR()*40);
  const hatchCountFull = 250 + Math.floor(sR()*120);
  const hatchAngleBase = Math.PI/4 + (sR()-0.5)*0.4;

  // Warm pink/ochre ground.
  const _adjHex = (hex)=>{
    let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    if(typeof _energyTint === 'function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint === 'function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return `rgb(${r},${g},${b})`;
  };
  if(chords && chords.length){ const _c0=chords[0]; _setCurE(_c0 && _c0._E); }
  const grad = ctx.createLinearGradient(0,0,CW,CH);
  if(isBW){
    grad.addColorStop(0, _adjHex('#4a4038'));
    grad.addColorStop(0.5, _adjHex('#6a5848'));
    grad.addColorStop(1, _adjHex('#4a4038'));
  } else {
    grad.addColorStop(0, _adjHex('#7a3830'));
    grad.addColorStop(0.5, _adjHex('#a05848'));
    grad.addColorStop(1, _adjHex('#7a4030'));
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,CW,CH);

  const visShards = Math.max(8, Math.ceil(shardCountFull * reveal));
  for(let i=0;i<visShards;i++){
    const r1 = _seedRnd(i+8600,ss,0,0); r1(); r1();
    const cx = r1()*CW, cy = r1()*CH;
    const sz = 25 + r1()*120;
    const rot = r1()*Math.PI*2;
    const sides = 3 + Math.floor(r1()*3);
    const {rgb} = _picChord(chords, i%cn, gc, isBW);
    // Bias toward warm.
    const cr = isBW ? Math.round(rgb[0]*0.55+55) : Math.round(rgb[0]*0.70 + 55);
    const cg = isBW ? Math.round(rgb[1]*0.55+45) : Math.round(rgb[1]*0.50 + 35);
    const cb = isBW ? Math.round(rgb[2]*0.55+35) : Math.round(rgb[2]*0.35 + 30);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.beginPath();
    for(let s=0;s<sides;s++){
      const a = (s/sides)*Math.PI*2;
      const r = sz * (0.65 + r1()*0.70);
      const px = Math.cos(a)*r, py = Math.sin(a)*r;
      if(s===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${Math.min(255,cr)|0},${Math.min(255,cg)|0},${Math.min(255,cb)|0},${(0.55 + r1()*0.35).toFixed(2)})`;
    ctx.fill();
    ctx.strokeStyle = isBW ? 'rgba(20,15,12,0.7)' : 'rgba(25,8,8,0.7)';
    ctx.lineWidth = 1 + r1();
    ctx.stroke();
    ctx.restore();
  }

  const visHatches = Math.ceil(hatchCountFull * reveal);
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = isBW ? 'rgba(20,15,12,0.9)' : 'rgba(30,15,12,0.9)';
  ctx.lineWidth = 0.5;
  for(let k=0;k<visHatches;k++){
    const hR = _seedRnd(k+8700,ss,0,0); hR();
    const sx = hR()*CW, sy = hR()*CH;
    const len = 8 + hR()*20;
    const a = hatchAngleBase + (hR()-0.5)*0.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a)*len, sy + Math.sin(a)*len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ── Picasso Faceted Drift: directional analytic cubism — dense overlapping
// facets across the canvas, mostly monochrome, faint chord-colour bias only.
// Flow direction comes from song register (low → vertical, high → horizontal,
// mid → diagonal). Density gradient: tighter band for calm songs, dispersed
// for energetic. Strong charcoal hatching ties the field together (Ma Jolie /
// Kahnweiler 1910–11 feel). NO subject — pure fragmentation field.
function picassoPhaseFacetedDrift(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0;
  const isBW=mode==='bw';
  const cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const reveal=Math.max(0,Math.min(1,N/cn));
  const D=Math.min(CW,CH);

  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const energy=_ch?_ch.energy:0.5;
  const density=_ch?_ch.density:0.3;
  const register=_ch?_ch.register:0.5;

  // Cool grey-brown ground — analytic cubism muted base, NOT golden tobacco.
  ctx.fillStyle=isBW?'#5a5650':'#4a4438';
  ctx.fillRect(0,0,CW,CH);

  // Dense facet count — analytic cubism is busy and overlapping.
  const facetFull=Math.max(180,Math.min(380,220+Math.round((energy+density)*70)));
  const visFacets=Math.max(20,Math.ceil(facetFull*reveal));

  // Flow direction from register: low → vertical, high → horizontal, mid → diagonal.
  const dirR=_seedRnd(9701,ss,0,0); dirR(); dirR();
  let flowAng;
  if(register<0.35) flowAng=Math.PI/2+(dirR()-0.5)*0.45;
  else if(register>0.65) flowAng=(dirR()-0.5)*0.45;
  else flowAng=Math.PI/4+(dirR()-0.5)*0.6;
  const dx=Math.cos(flowAng), dy=Math.sin(flowAng);
  const px=-dy, py=dx;

  for(let i=0;i<visFacets;i++){
    const r=_seedRnd(i+9900,ss,0,0); r(); r();

    // Position along flow axis + perpendicular density gradient.
    // Calm songs → tighter band; energetic → dispersed.
    const tAlong=r();
    let tPerp=(r()-0.5)*2;
    tPerp*=(0.55+(1-density)*0.45);
    const flowLen=Math.sqrt(CW*CW+CH*CH);
    const cx=CW*0.5+dx*(tAlong-0.5)*flowLen+px*tPerp*flowLen*0.50;
    const cy=CH*0.5+dy*(tAlong-0.5)*flowLen+py*tPerp*flowLen*0.50;
    if(cx<-40||cx>CW+40||cy<-40||cy>CH+40) continue;

    // Facet size — bigger than before so they overlap and build a continuous field.
    const sz=D*(0.045+r()*0.075);
    const rot=flowAng+(r()-0.5)*0.9;
    const sides=3+Math.floor(r()*2);            // triangles + quads
    const {rgb,energy:fE}=_picChord(chords,i%cn,gc,isBW);

    // VERY heavy pull toward earth tones — almost monochrome.
    // Only ~22% of chord-colour bleeds through. Picasso analytic is not colourful.
    let fR=isBW?Math.round(rgb[0]*0.18+72):Math.round(rgb[0]*0.22+58);
    let fG=isBW?Math.round(rgb[1]*0.18+68):Math.round(rgb[1]*0.22+46);
    let fB=isBW?Math.round(rgb[2]*0.18+62):Math.round(rgb[2]*0.22+32);
    if(typeof _energyTint==='function'){const t=_energyTint(fR,fG,fB);fR=t[0];fG=t[1];fB=t[2];}
    if(typeof _pastelTint==='function'){const t=_pastelTint(fR,fG,fB);fR=t[0];fG=t[1];fB=t[2];}

    ctx.save();
    ctx.translate(cx,cy);
    ctx.rotate(rot);
    ctx.beginPath();
    for(let s=0;s<sides;s++){
      const a=(s/sides)*Math.PI*2;
      const rr=sz*(0.60+r()*0.80);
      const x=Math.cos(a)*rr, y=Math.sin(a)*rr;
      if(s===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.fillStyle=`rgba(${fR|0},${fG|0},${fB|0},${(0.78+fE*0.18).toFixed(2)})`;
    ctx.fill();

    // Tonal modelling: darken one edge slightly so each facet has dimension.
    // This is the analytic cubism "sculpted facet" read.
    if(r()<0.6){
      ctx.fillStyle='rgba(15,10,8,0.18)';
      ctx.beginPath();
      const a0=r()*Math.PI*2;
      ctx.moveTo(0,0);
      ctx.arc(0,0,sz,a0,a0+Math.PI);
      ctx.closePath();
      ctx.fill();
    }

    // Thin charcoal outline.
    ctx.strokeStyle=isBW?'rgba(15,12,10,0.70)':'rgba(20,12,8,0.78)';
    ctx.lineWidth=Math.max(0.6,D*0.0014);
    ctx.stroke();
    ctx.restore();
  }

  // Dense charcoal hatching — analytic cubism signature. Scales with reveal.
  // Crosshatch in two diagonals, biased toward the flow direction.
  const hatchFull=400+Math.floor(_seedRnd(11000,ss,0,0)()*250);
  const visHatches=Math.ceil(hatchFull*reveal);
  ctx.save();
  ctx.globalAlpha=0.24;
  ctx.strokeStyle=isBW?'rgba(15,12,10,0.95)':'rgba(20,14,8,0.95)';
  ctx.lineWidth=0.55;
  for(let k=0;k<visHatches;k++){
    const hR=_seedRnd(k+11200,ss,0,0); hR();
    const sx=hR()*CW, sy=hR()*CH;
    const len=6+hR()*18;
    // 70% follow flow direction (parallel to flowAng), 30% cross-hatch.
    const useFlow=hR()<0.70;
    const a=useFlow ? flowAng+(hR()-0.5)*0.30 : flowAng+Math.PI/2+(hR()-0.5)*0.30;
    ctx.beginPath();
    ctx.moveTo(sx,sy);
    ctx.lineTo(sx+Math.cos(a)*len,sy+Math.sin(a)*len);
    ctx.stroke();
  }
  ctx.restore();
}

// ── Picasso Geometric Still-Life: synthetic cubism still-life via geometry
// placement only. Earth-tone ground + table-edge gradient + chord-coloured
// rectangles/ovals/trapezoids/hexagons with cubist splits. Vase/fruit implied
// by composition (vertical-ish shapes near centre, horizontal table line)
// without any literal outlines.
function picassoPhaseStillLife(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));
  const sR = _seedRnd(9101,ss,0,15); sR(); sR();

  const shapeCountFull = 30 + Math.floor(sR()*20);           // 30-50 shapes
  const tableY = CH * (0.45 + sR()*0.15);                    // 45-60% table edge

  // Earth-tone ground.
  ctx.fillStyle = isBW ? '#8a8478' : '#c0a880';
  ctx.fillRect(0,0,CW,CH);

  // Table-plane gradient.
  const tableGrad = ctx.createLinearGradient(0, tableY, 0, CH);
  if(isBW){
    tableGrad.addColorStop(0, 'rgba(50,45,40,0)');
    tableGrad.addColorStop(0.3, 'rgba(50,45,40,0.5)');
    tableGrad.addColorStop(1, 'rgba(35,30,25,0.85)');
  } else {
    tableGrad.addColorStop(0, 'rgba(80,50,30,0)');
    tableGrad.addColorStop(0.3, 'rgba(80,50,30,0.5)');
    tableGrad.addColorStop(1, 'rgba(60,35,20,0.85)');
  }
  ctx.fillStyle = tableGrad;
  ctx.fillRect(0, tableY, CW, CH-tableY);

  // Generate shapes upfront so we can z-sort.
  const shapes = [];
  for(let i=0;i<shapeCountFull;i++){
    const r1 = _seedRnd(i+9200,ss,0,0); r1(); r1();
    const cx = CW * (0.15 + r1()*0.70);
    const cy = CH * (0.20 + r1()*0.65);
    const w = 30 + r1()*180;
    const h = 30 + r1()*180;
    const kind = (r1()*4)|0;
    const splitChance = r1();
    const sliceLift = r1();
    shapes.push({cx, cy, w, h, kind, i, splitChance, sliceLift});
  }
  shapes.sort((a,b)=>(b.w*b.h) - (a.w*a.h));

  const visShapes = Math.max(2, Math.ceil(shapeCountFull * reveal));
  let drawn = 0;
  for(const sh of shapes){
    if(drawn >= visShapes) break;
    drawn++;
    const {rgb} = _picChord(chords, sh.i%cn, gc, isBW);
    const cr = Math.round(rgb[0]*0.75 + 25);
    const cg = Math.round(rgb[1]*0.65 + 20);
    const cb = Math.round(rgb[2]*0.50 + 15);
    ctx.fillStyle = `rgba(${Math.min(255,cr)|0},${Math.min(255,cg)|0},${Math.min(255,cb)|0},${(0.75 + sh.splitChance*0.20).toFixed(2)})`;
    ctx.strokeStyle = 'rgba(15,8,5,0.85)';
    ctx.lineWidth = 1.5 + sh.sliceLift;
    if(sh.kind === 0){
      ctx.fillRect(sh.cx - sh.w/2, sh.cy - sh.h/2, sh.w, sh.h);
      ctx.strokeRect(sh.cx - sh.w/2, sh.cy - sh.h/2, sh.w, sh.h);
    } else if(sh.kind === 1){
      ctx.beginPath();
      ctx.ellipse(sh.cx, sh.cy, sh.w/2, sh.h/2, 0, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
    } else if(sh.kind === 2){
      ctx.beginPath();
      ctx.moveTo(sh.cx-sh.w/2, sh.cy+sh.h/2);
      ctx.lineTo(sh.cx+sh.w/2, sh.cy+sh.h/2);
      ctx.lineTo(sh.cx+sh.w/4, sh.cy-sh.h/2);
      ctx.lineTo(sh.cx-sh.w/4, sh.cy-sh.h/2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath();
      for(let s=0;s<6;s++){
        const a = (s/6)*Math.PI*2;
        const px = sh.cx + Math.cos(a)*sh.w/2;
        const py = sh.cy + Math.sin(a)*sh.h/2;
        if(s===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    // Cubist split — light bias on right half for larger shapes.
    if(sh.w > 80 && sh.splitChance < 0.4){
      ctx.save();
      ctx.beginPath();
      ctx.rect(sh.cx - sh.w/2, sh.cy - sh.h/2, sh.w, sh.h);
      ctx.clip();
      ctx.fillStyle = isBW ? 'rgba(220,210,190,0.25)' : 'rgba(255,220,180,0.25)';
      ctx.fillRect(sh.cx, sh.cy - sh.h, sh.w, sh.h*2);
      ctx.restore();
    }
  }

  // Faint table-edge perspective line.
  ctx.strokeStyle = isBW ? 'rgba(15,15,12,0.4)' : 'rgba(20,10,5,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, tableY + CH*0.05);
  ctx.lineTo(CW, tableY);
  ctx.stroke();
}

// ── Picasso Tonal Cubism: meditative warm-grey atmospheric cubism. 10–18 larger
// softer planes on a desaturated palette, charcoal wash regions as compositional
// masses, optional muted chord-colour wash. Soft outlines (less ink violence
// than the analytic phases). The "Cézanne-influenced 1908–09 transition" feel —
// contemplative, restrained, tonal. NO biomorphs, NO eyes, NO subject.
function picassoPhaseTonalCubism(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0;
  const isBW=mode==='bw';
  const cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const reveal=Math.max(0,Math.min(1,N/cn));
  const D=Math.min(CW,CH);

  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const energy=_ch?_ch.energy:0.5;
  const density=_ch?_ch.density:0.3;

  // Soft warm-grey ground.
  ctx.fillStyle=isBW?'#a8a59c':'#a89e8a';
  ctx.fillRect(0,0,CW,CH);

  // Paper grain.
  ctx.save();
  ctx.globalAlpha=0.07;
  ctx.fillStyle=isBW?'rgb(35,32,28)':'rgb(50,40,32)';
  for(let i=0;i<500;i++){
    const gr=_seedRnd(i+10800,ss,0,0);
    ctx.fillRect(gr()*CW,gr()*CH,1,1);
  }
  ctx.restore();

  // 10–18 larger softer planes.
  const planeFull=Math.max(10,Math.min(18,10+Math.round((energy+density)*4)));
  const visPlanes=Math.max(2,Math.ceil(planeFull*reveal));

  // Loose jittered grid of plane centres — Voronoi-like, no obvious rows.
  const cols=Math.ceil(Math.sqrt(planeFull));
  const rows=Math.ceil(planeFull/cols);
  const planes=[];
  let idx=0;
  for(let ry=0;ry<rows && idx<planeFull;ry++){
    for(let cx=0;cx<cols && idx<planeFull;cx++){
      const r=_seedRnd(idx+10900,ss,0,0); r(); r();
      const gridX=CW*(cx+0.5)/cols;
      const gridY=CH*(ry+0.5)/rows;
      const jit=D*0.11;
      const px=gridX+(r()-0.5)*jit*2;
      const py=gridY+(r()-0.5)*jit*2;
      const sz=D*(0.19+r()*0.16);
      const sides=4+Math.floor(r()*3);
      const verts=[];
      for(let s=0;s<sides;s++){
        const a=(s/sides)*Math.PI*2+(r()-0.5)*0.45;
        const rr=sz*(0.72+r()*0.48);
        verts.push([px+Math.cos(a)*rr,py+Math.sin(a)*rr]);
      }
      planes.push({cx:px,cy:py,sz,verts,idx});
      idx++;
    }
  }

  // Draw planes — heavily desaturated, pulled toward warm grey.
  for(let i=0;i<visPlanes;i++){
    const p=planes[i];
    const {rgb,energy:pE}=_picChord(chords,i%cn,gc,isBW);
    let fR=Math.round(rgb[0]*0.38+92);
    let fG=Math.round(rgb[1]*0.38+86);
    let fB=Math.round(rgb[2]*0.38+76);
    if(typeof _energyTint==='function'){const t=_energyTint(fR,fG,fB);fR=t[0];fG=t[1];fB=t[2];}
    if(typeof _pastelTint==='function'){const t=_pastelTint(fR,fG,fB);fR=t[0];fG=t[1];fB=t[2];}

    ctx.beginPath();
    ctx.moveTo(p.verts[0][0],p.verts[0][1]);
    for(let v=1;v<p.verts.length;v++)ctx.lineTo(p.verts[v][0],p.verts[v][1]);
    ctx.closePath();
    ctx.fillStyle=`rgba(${fR|0},${fG|0},${fB|0},${(0.72+pE*0.18).toFixed(2)})`;
    ctx.fill();
    ctx.strokeStyle=isBW?'rgba(40,32,28,0.42)':'rgba(50,38,28,0.46)';
    ctx.lineWidth=Math.max(0.8,D*0.0018);
    ctx.stroke();
  }

  // Charcoal wash regions — 2 large translucent dark masses as compositional weight.
  // Drawn after ~30% reveal so the painting builds up before the masses land.
  if(reveal>0.30){
    for(let w=0;w<2;w++){
      const wR=_seedRnd(w+11500,ss,0,0); wR(); wR();
      const wx=CW*(0.20+wR()*0.60);
      const wy=CH*(0.20+wR()*0.60);
      const wsz=D*(0.42+wR()*0.20);
      const wsides=5+Math.floor(wR()*3);
      ctx.beginPath();
      for(let s=0;s<wsides;s++){
        const a=(s/wsides)*Math.PI*2;
        const rr=wsz*(0.70+wR()*0.50);
        const x=wx+Math.cos(a)*rr, y=wy+Math.sin(a)*rr;
        if(s===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.closePath();
      ctx.fillStyle=isBW?`rgba(28,26,22,${(0.16+w*0.06).toFixed(2)})`:`rgba(35,28,22,${(0.18+w*0.06).toFixed(2)})`;
      ctx.fill();
    }
  }

  // Single muted chord-colour wash after ~50% — adds one tonal warm/cool note.
  if(reveal>0.50){
    const wcR=_seedRnd(12100,ss,0,0); wcR(); wcR();
    const wcx=CW*(0.25+wcR()*0.50);
    const wcy=CH*(0.25+wcR()*0.50);
    const wcsz=D*(0.38+wcR()*0.15);
    const wcsides=5+Math.floor(wcR()*3);
    const {rgb:wcRgb}=_picChord(chords,Math.floor(cn*0.5),gc,isBW);
    const wR=Math.round(wcRgb[0]*0.52+72);
    const wG=Math.round(wcRgb[1]*0.52+62);
    const wB=Math.round(wcRgb[2]*0.52+56);
    ctx.beginPath();
    for(let s=0;s<wcsides;s++){
      const a=(s/wcsides)*Math.PI*2;
      const rr=wcsz*(0.70+wcR()*0.50);
      const x=wcx+Math.cos(a)*rr, y=wcy+Math.sin(a)*rr;
      if(s===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.fillStyle=`rgba(${wR},${wG},${wB},0.30)`;
    ctx.fill();
  }
}

// Mondrian canvas-wide overlay. The per-cell drawMondrian goes pixely on long
// songs because each chord's grid cell shrinks to a few px. Here we render ONE
// De Stijl composition across the whole canvas on the capped recursive
// partition (regions stay large no matter the song length): cream ground, big
// rectangles, ~40% filled with bold chord colors (rest cream, a few black),
// thick black grid lines between every region. Reveals progressively with lim.
function drawMondrianOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim||!chords||!chords.length) return;
  const ss=sessionSeed|0;
  const cn=chords.length;
  const isBW=mode==='bw';
  const cream=isBW?'#ece9e2':'#f4f1e8';
  // Boost a gc() color toward Mondrian's flat saturated character, keeping hue.
  // In Pastel tone the boost is SKIPPED — the painting should stay soft, so
  // we return the gc colour as-is (which is already pastel-tinted by gc).
  const bold=(r,g,bl)=>{
    if(_pastelOn) return [Math.round(r),Math.round(g),Math.round(bl)];
    if(Math.max(r,g,bl)-Math.min(r,g,bl)<=6) return [Math.round(r),Math.round(g),Math.round(bl)];
    const mx=Math.max(r,g,bl,1),k=255/mx;let R=r*k,G=g*k,B=bl*k,m2=Math.max(R,G,B);
    const pull=c=>c===m2?c:c*0.72;
    return [Math.round(Math.min(255,pull(R))),Math.round(Math.min(255,pull(G))),Math.round(Math.min(255,pull(B)))];
  };
  // For Mondrian, pick the MOST SATURATED single voice of a chord rather than
  // averaging (averaging spreads hues into a desaturated near-grey that reads as
  // cream). Then force it bold/saturated so blocks always pop against the cream.
  // In Pastel tone we skip the final saturation push and just return the most
  // saturated voice's gc colour — already pastel-softened.
  const chordCol=(pIdx,MAX)=>{
    const chord=chords[Math.min(chords.length-1,Math.floor(pIdx*(chords.length/Math.max(1,MAX))))];
    // Set the current chord's energy so gc() -> _energyTint reads the local
    // dynamic level (Real tone). Without this every Mondrian block defaults to
    // mid-energy and the painting can't span pastel-to-deep across the canvas.
    _setCurE(chord && chord._E);
    const notes=chord && (chord.n||chord.notes||(Array.isArray(chord)?chord:null));
    if(!notes||!notes.length){const[r,g,bl]=bold(150,40,30);return[r,g,bl];}
    // Find the voice whose gc() color is most saturated (largest channel spread).
    let best=null,bestSat=-1;
    for(const note of notes){
      const m=note.m!==undefined?note.m:note, v=note.v!==undefined?note.v:80;
      const[r,g,b]=gc(m,v);
      const sat=Math.max(r,g,b)-Math.min(r,g,b);
      if(sat>bestSat){bestSat=sat;best=[r,g,b];}
    }
    if(!best) best=[150,40,30];
    // If even the best voice is near-grey (e.g. B/W mode), keep it; otherwise
    // force full saturation so the block reads as a bold Mondrian color.
    if(bestSat<=6) return [Math.round(best[0]),Math.round(best[1]),Math.round(best[2])];
    // Pastel tone: skip the force-saturation push, return the gc colour as-is.
    if(_pastelOn) return [Math.round(best[0]),Math.round(best[1]),Math.round(best[2])];
    // Push toward a pure, vivid hue: stretch brightest channel to 255, deepen others hard.
    const mx=Math.max(best[0],best[1],best[2],1),k=255/mx;
    let R=best[0]*k,G=best[1]*k,B=best[2]*k,m2=Math.max(R,G,B);
    const pull=c=>c===m2?c:c*0.55; // harder pull than bold() -> more saturated
    return [Math.round(Math.min(255,pull(R))),Math.round(Math.min(255,pull(G))),Math.round(Math.min(255,pull(B)))];
  };

  // ── STYLE CHOOSER: commit to ONE of Mondrian's real phases per painting ──
  // Determined by phaseIndex (modulo phase count). The Next button cycles it.
  //  A = Classic neoplastic block-grid (white-dominant, thick black lines, blocks)
  //  B = Sparse late grid (mostly white, very few color blocks, thinner lines)
  //  C = Boogie-Woogie (NO black — colored line-tracks of small alternating squares)
  //  D = New York City line-grid (interwoven colored lines, no blocks, no black)
  //  E = Broadway Boogie Woogie (yellow line grid + colour square beats)
  //  F = Lozenge (diamond canvas, grid rotated 45°)
  //  G = Tree (abstraction of branching lines)
  //  H = Pier & Ocean (scattered plus/minus marks forming a mesh)
  const PHASES = ['A','B','C','D','E','F','G','H'];
  const _mpn = _capN(8);
  const phase = PHASES[((phaseIndex|0)%_mpn+_mpn)%_mpn];
  if(phase==='E'){ mondrianPhaseBroadway(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(phase==='F'){ mondrianPhaseLozenge(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(phase==='G'){ mondrianPhaseTree(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(phase==='H'){ mondrianPhasePier(ctx,CW,CH,chords,lim,gc,ss,mode); return; }

  ctx.fillStyle='#04040a'; ctx.fillRect(0,0,CW,CH);

  // ════════ A & B: block-grid phases (partition-based) ════════
  if(phase==='A' || phase==='B'){
    const sparse = phase==='B';
    // Song character: an energetic piece pushes more colour blocks and slightly
    // heavier grid lines; a quiet one stays whiter with thinner lines. 0.5 is
    // neutral (= the untuned output). Grid fineness itself already breathes
    // with the music inside _partitionCanvas.
    const _chM=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
    const _chE=_chM?_chM.energy:0.5;
    const {rects,MAX_RECTS,paintCount}=_partitionCanvas(chords,lim,ss,2400, sparse?0.30:0.45);
    const order = rects.map((r,i)=>i).sort((a,b)=>{
      const ra=rects[a], rb=rects[b];
      const rowA=Math.round(ra.y*12), rowB=Math.round(rb.y*12);
      if(rowA!==rowB) return rowA-rowB;
      return ra.x-rb.x;
    });
    const revealed=order.slice(0,paintCount);
    const lw=sparse?Math.max(2,Math.round(Math.min(CW,CH)*0.009*(0.73+0.54*_chE))):Math.max(3,Math.round(Math.min(CW,CH)*0.012*(0.73+0.54*_chE)));
    // Fill thresholds: A is color-rich, B is white-dominant with sparse color.
    const colorThresh = (sparse?0.30:0.62)*(0.46+1.08*_chE), blackThresh = colorThresh + (sparse?0.08:0.10);
    // Seed ONE rng before the loop and advance it per block. Calling _seedRnd
    // fresh per block used each seed's poorly-mixed FIRST output, which clustered
    // badly — some session seeds produced ZERO color blocks (all-cream canvas).
    // A single warmed sequence is properly uniform.
    const fillRnd=_seedRnd(2401,ss,7,13);
    fillRnd();fillRnd(); // warm up
    let colorCount=0;
    const fillChoice=[]; // decide all fills first so we can guarantee a color floor
    revealed.forEach(()=>{
      const roll=fillRnd();
      let kind;
      if(roll<colorThresh){kind='color';colorCount++;}
      else if(roll<blackThresh){kind='black';}
      else{kind='cream';}
      fillChoice.push(kind);
    });
    // Color floor: a painting must never be totally empty. Ensure at least ~20%
    // (min 2) of revealed blocks are colored — promote some cream blocks if needed.
    const minColor=Math.max(2,Math.round(revealed.length*0.20));
    if(colorCount<minColor){
      for(let i=0;i<fillChoice.length && colorCount<minColor;i++){
        if(fillChoice[i]==='cream'){fillChoice[i]='color';colorCount++;}
      }
    }
    revealed.forEach((pIdx,k)=>{
      const rect=rects[pIdx];
      const bx=rect.x*CW,by=rect.y*CH,BW=rect.w*CW,BH=rect.h*CH;
      const kind=fillChoice[k];
      if(kind==='color'){const[pr,pg,pb]=chordCol(pIdx,MAX_RECTS);ctx.fillStyle=`rgb(${pr},${pg},${pb})`;}
      else if(kind==='black'){ctx.fillStyle=isBW?'#1a1714':'#141109';}
      else{ctx.fillStyle=cream;}
      ctx.fillRect(bx,by,BW,BH);
    });
    ctx.fillStyle='#0d0b08';
    revealed.forEach((pIdx)=>{
      const rect=rects[pIdx];
      const bx=rect.x*CW,by=rect.y*CH,BW=rect.w*CW,BH=rect.h*CH;
      ctx.fillRect(bx,by,BW,lw);ctx.fillRect(bx,by+BH-lw,BW,lw);
      ctx.fillRect(bx,by,lw,BH);ctx.fillRect(bx+BW-lw,by,lw,BH);
    });
    if(paintCount>=MAX_RECTS){
      ctx.fillRect(0,0,CW,lw);ctx.fillRect(0,CH-lw,CW,lw);
      ctx.fillRect(0,0,lw,CH);ctx.fillRect(CW-lw,0,lw,CH);
    }
    return;
  }

  // ════════ D: New York City line-grid (interwoven colored lines, no blocks) ════════
  if(phase==='D'){
    // Cream ground.
    ctx.fillStyle=cream; ctx.fillRect(0,0,CW,CH);
    // Number of lines scales gently with song length.
    const nV = Math.max(3,Math.min(18, 3+Math.round(cn/80)));
    const nH = Math.max(3,Math.min(18, 3+Math.round(cn/80)));
    const totalLines=nV+nH;
    const revealCount=Math.max(1,Math.min(totalLines,Math.ceil(lim*(totalLines/cn))));
    const lw=Math.max(4,Math.round(Math.min(CW,CH)*0.014));
    // Line colors: mostly the bold yellow-ish dominant, with occasional red/blue.
    const lr=_seedRnd(701,ss,0,0);
    // Build vertical then horizontal line positions (seeded, uneven spacing).
    const vlines=[],hlines=[];
    for(let i=0;i<nV;i++){const t=(i+0.5)/nV + (lr()-0.5)*0.06; vlines.push({x:t*CW, idx:i});}
    for(let i=0;i<nH;i++){const t=(i+0.5)/nH + (lr()-0.5)*0.06; hlines.push({y:t*CH, idx:nV+i});}
    const lineColorFor=(k)=>{
      const c=chordCol(k%Math.max(1,cn), Math.max(1,cn));
      // Bias toward a warm "yellow track" feel but keep chord hue.
      return c;
    };
    let drawn=0;
    // Interleave reveal: vertical, horizontal, vertical...
    const seq=[];
    for(let i=0;i<Math.max(nV,nH);i++){ if(i<nV)seq.push(['v',i]); if(i<nH)seq.push(['h',i]); }
    seq.forEach(([type,i])=>{
      if(drawn>=revealCount) return; drawn++;
      if(type==='v'){
        const L=vlines[i]; const[r,g,b]=lineColorFor(L.idx*7);
        ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillRect(L.x-lw/2,0,lw,CH);
      }else{
        const L=hlines[i]; const[r,g,b]=lineColorFor(L.idx*7);
        ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillRect(0,L.y-lw/2,CW,lw);
      }
    });
    // Small accent squares where some lines cross (the NYC "blips").
    const ar=_seedRnd(733,ss,0,0);
    vlines.forEach(V=>hlines.forEach(H=>{
      if(ar()<0.18){
        const[r,g,b]=chordCol((V.idx+H.idx)%Math.max(1,cn),Math.max(1,cn));
        const s=lw*1.6;
        ctx.fillStyle=`rgb(${r},${g},${b})`;
        ctx.fillRect(V.x-s/2,H.y-s/2,s,s);
      }
    }));
    return;
  }

  // ════════ C: Boogie-Woogie (no black; colored square tracks) ════════
  // White ground, a grid of "tracks" made of small alternating colored squares,
  // plus a few larger color blocks at intersections — busy, rhythmic, jazzy.
  ctx.fillStyle=cream; ctx.fillRect(0,0,CW,CH);
  const nV = Math.max(4,Math.min(14, 4+Math.round(cn/90)));
  const nH = Math.max(4,Math.min(14, 4+Math.round(cn/90)));
  const cell=Math.max(8, Math.min(CW/nV, CH/nH)*0.5); // square size along tracks
  const lr=_seedRnd(811,ss,0,0);
  const vxs=[],hys=[];
  for(let i=0;i<nV;i++) vxs.push((i+0.5)/nV*CW + (lr()-0.5)*CW*0.02);
  for(let i=0;i<nH;i++) hys.push((i+0.5)/nH*CH + (lr()-0.5)*CH*0.02);
  // Progressive reveal across the union of track segments.
  const totalTracks=nV+nH;
  const revealTracks=Math.max(1,Math.min(totalTracks,Math.ceil(lim*(totalTracks/cn))));
  let t=0;
  const drawTrackV=(x,seed)=>{
    const tr=_seedRnd(seed,ss,0,0);
    for(let y=cell*0.3; y<CH; y+=cell*1.0){
      if(tr()<0.82){
        const[r,g,b]=chordCol(Math.floor(y/cell)%Math.max(1,cn),Math.max(1,cn));
        ctx.fillStyle=`rgb(${r},${g},${b})`;
        ctx.fillRect(x-cell*0.42, y-cell*0.42, cell*0.84, cell*0.84);
      }
    }
  };
  const drawTrackH=(y,seed)=>{
    const tr=_seedRnd(seed,ss,0,0);
    for(let x=cell*0.3; x<CW; x+=cell*1.0){
      if(tr()<0.82){
        const[r,g,b]=chordCol(Math.floor(x/cell)%Math.max(1,cn),Math.max(1,cn));
        ctx.fillStyle=`rgb(${r},${g},${b})`;
        ctx.fillRect(x-cell*0.42, y-cell*0.42, cell*0.84, cell*0.84);
      }
    }
  };
  const seqC=[];
  for(let i=0;i<Math.max(nV,nH);i++){ if(i<nV)seqC.push(['v',i]); if(i<nH)seqC.push(['h',i]); }
  seqC.forEach(([type,i])=>{
    if(t>=revealTracks) return; t++;
    if(type==='v') drawTrackV(vxs[i], 900+i);
    else drawTrackH(hys[i], 950+i);
  });
  // A few larger solid blocks at random intersections (the bigger BW chords).
  const br=_seedRnd(877,ss,0,0);
  const bigCount=Math.min(revealTracks, 3+Math.floor(br()*4));
  for(let k=0;k<bigCount;k++){
    const vx=vxs[Math.floor(br()*nV)], hy=hys[Math.floor(br()*nH)];
    const[r,g,b]=chordCol(Math.floor(br()*Math.max(1,cn)),Math.max(1,cn));
    const s=cell*(1.4+br()*1.2);
    ctx.fillStyle=`rgb(${r},${g},${b})`;
    ctx.fillRect(vx-s/2, hy-s/2, s, s);
  }
}

// Mondrian palette: pure primaries + cream/black, tinted by chord saturation.
function _mondrianBlock(chords,idx,gc,isBW){
  const chord=chords[Math.min(chords.length-1,Math.max(0,idx))];
  // Set chord energy BEFORE calling gc so Real mode routes to the correct
  // palette band (pastel for piano chords, dark for forte chords).
  _setCurE(chord && chord._E);
  const notes=chord&&(chord.n||chord.notes);
  let best=null,bestSat=-1;
  if(notes&&notes.length)for(const note of notes){const m=note.m!==undefined?note.m:note,v=note.v!==undefined?note.v:80;const[r,g,b]=gc(m,v);const sat=Math.max(r,g,b)-Math.min(r,g,b);if(sat>bestSat){bestSat=sat;best=[r,g,b];}}
  if(!best)best=[150,40,30];
  if(isBW||bestSat<=6)return best.map(Math.round);
  if(_pastelOn) return best.map(Math.round);
  // Real mode at non-mezzo bands: pastel and dark variants have already been
  // applied inside gc(). The pull-to-primary normalization below would erase
  // their pastel-lightness or dark-shadow identity by re-saturating to 255
  // and crushing non-dominant channels. Bypass for extreme bands so the
  // band-aware colour reaches the canvas intact.
  const e = (typeof _getCurE === 'function') ? _getCurE() : 0.5;
  if(e < 0.20 || e > 0.80) return best.map(Math.round);
  const mx=Math.max(best[0],best[1],best[2],1),k=255/mx;let R=best[0]*k,G=best[1]*k,B=best[2]*k,m2=Math.max(R,G,B);
  const pull=c=>c===m2?c:c*0.55;
  return [Math.round(Math.min(255,pull(R))),Math.round(Math.min(255,pull(G))),Math.round(Math.min(255,pull(B)))];
}

// ── Mondrian E: Broadway Boogie Woogie — yellow line grid + colour beats. ──
function mondrianPhaseBroadway(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  ctx.fillStyle=isBW?'#ece9e2':'#f0eee4';ctx.fillRect(0,0,CW,CH);
  const lines=Math.max(4,Math.min(16,Math.round(Math.sqrt(cn))));
  const reveal=Math.max(0,Math.min(1,N/cn));
  // Broadway yellow tracks — Mondrian's signature. Tone-adjust so Pastel
  // softens and Real picks up the opening chord's energy.
  let lineColRgb = isBW ? [200,196,184] : [240,192,32];
  if(!isBW){
    if(typeof _energyTint === 'function'){ const t=_energyTint(lineColRgb[0],lineColRgb[1],lineColRgb[2]); lineColRgb=[t[0],t[1],t[2]]; }
    if(typeof _pastelTint === 'function'){ const p=_pastelTint(lineColRgb[0],lineColRgb[1],lineColRgb[2]); lineColRgb=[p[0],p[1],p[2]]; }
  }
  const lineCol=`rgb(${lineColRgb[0]},${lineColRgb[1]},${lineColRgb[2]})`;
  ctx.fillStyle=lineCol;
  const lw=Math.max(3,Math.min(CW,CH)*0.012);
  // vertical + horizontal yellow tracks
  const visV=Math.ceil(reveal*lines);
  for(let i=1;i<=visV;i++){const x=i/(lines+1)*CW;ctx.fillRect(x-lw/2,0,lw,CH);}
  for(let i=1;i<=visV;i++){const y=i/(lines+1)*CH;ctx.fillRect(0,y-lw/2,CW,lw);}
  // colour square beats at intersections
  let k=0;const beats=lines*lines,visBeats=Math.max(1,Math.ceil(reveal*beats));
  for(let r=1;r<=lines&&k<visBeats;r++)for(let c=1;c<=lines&&k<visBeats;c++,k++){
    const rnd=_seedRnd(k+5600,ss,0,0);
    if(rnd()<0.4){
      const {0:R,1:G,2:B}=_mondrianBlock(chords,Math.floor(k*(cn/beats)),gc,isBW);
      ctx.fillStyle=`rgb(${R},${G},${B})`;
      const x=c/(lines+1)*CW,y=r/(lines+1)*CH,bs=lw*2.2;
      ctx.fillRect(x-bs/2,y-bs/2,bs,bs);
    }
  }
}

// ── Mondrian F: Lozenge — neoplastic grid on a 45°-rotated diamond canvas. ──
function mondrianPhaseLozenge(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  ctx.fillStyle='#04040a';ctx.fillRect(0,0,CW,CH);
  ctx.save();ctx.translate(CW/2,CH/2);ctx.rotate(Math.PI/4);
  const D=Math.min(CW,CH)*0.62;
  // clip to the diamond (a square rotated 45°)
  ctx.beginPath();ctx.rect(-D/2,-D/2,D,D);ctx.clip();
  ctx.fillStyle=isBW?'#ece9e2':'#f4f1e8';ctx.fillRect(-D/2,-D/2,D,D);
  // grid lines
  const divs=Math.max(2,Math.min(6,Math.round(cn/12)));
  const reveal=Math.max(0,Math.min(1,N/cn));
  const visDivs=Math.max(1,Math.ceil(reveal*divs));
  const lw=Math.max(3,D*0.02);
  ctx.fillStyle='#0a0a0a';
  for(let i=1;i<=visDivs;i++){const p=-D/2+i/(divs+1)*D;ctx.fillRect(p-lw/2,-D/2,lw,D);ctx.fillRect(-D/2,p-lw/2,D,lw);}
  // a couple of colour blocks
  let k=0;const cells=(divs+1)*(divs+1),visC=Math.max(1,Math.ceil(reveal*cells));
  for(let r=0;r<=divs&&k<visC;r++)for(let c=0;c<=divs&&k<visC;c++,k++){
    const rnd=_seedRnd(k+5700,ss,0,0);
    if(rnd()<0.3){const {0:R,1:G,2:B}=_mondrianBlock(chords,Math.floor(k*(cn/cells)),gc,isBW);ctx.fillStyle=`rgb(${R},${G},${B})`;const x=-D/2+c/(divs+1)*D,y=-D/2+r/(divs+1)*D,cw=D/(divs+1);ctx.fillRect(x+lw/2,y+lw/2,cw-lw,cw-lw);}
  }
  ctx.restore();
}

// ── Mondrian G: Tree — grey/ochre abstraction of branching lines. ──
function mondrianPhaseTree(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const sR=_seedRnd(57001,ss,0,0); sR(); sR();
  const variant=(sR()*4)|0; // 0=Red Avond, 1=Grey, 2=Apple, 3=Blue
  // Background tinted by chord 0 per variant
  const {rgb:bg0}=_picChord(chords,0,gc,isBW);
  let bgR,bgG,bgB;
  if(isBW){
    if(variant===0){ bgR=bgG=bgB=70; }
    else if(variant===1){ bgR=bgG=bgB=130; }
    else if(variant===2){ bgR=bgG=bgB=220; }
    else { bgR=bgG=bgB=90; }
  } else if(variant===0){ // Red Tree / Avond — twilight
    bgR=Math.round(20+bg0[2]*0.35); bgG=Math.round(30+bg0[1]*0.30); bgB=Math.round(50+bg0[0]*0.20);
  } else if(variant===1){ // Grey Tree
    bgR=Math.round(100+bg0[0]*0.15); bgG=Math.round(95+bg0[1]*0.15); bgB=Math.round(90+bg0[2]*0.15);
  } else if(variant===2){ // Apple — cream
    bgR=Math.round(230+bg0[0]*0.04); bgG=Math.round(225+bg0[1]*0.05); bgB=Math.round(210+bg0[2]*0.05);
  } else { // Blue Tree
    bgR=Math.round(35+bg0[2]*0.20); bgG=Math.round(50+bg0[1]*0.18); bgB=Math.round(85+bg0[2]*0.20);
  }
  ctx.fillStyle=`rgb(${bgR},${bgG},${bgB})`; ctx.fillRect(0,0,CW,CH);
  // For Avond — vertical gradient toward black at bottom
  if(variant===0){
    for(let y=0;y<CH;y+=4){
      const t=y/CH;
      const r=Math.round(bgR*(1-t*0.4)+30*t), g=Math.round(bgG*(1-t*0.4)+20*t), b=Math.round(bgB*(1-t*0.4)+10*t);
      ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillRect(0,y,CW,4);
    }
  }
  // Tree dimensions
  const cx=CW*(0.40+sR()*0.20);
  const baseY=CH*(0.93+sR()*0.04);
  const topY=CH*(0.08+sR()*0.10);
  const trunkW=Math.min(CW,CH)*(0.025+sR()*0.020);
  const density=0.9+sR()*0.6;
  // Build branches array
  const branches=[];
  // Trunk — wavy vertical
  const trunkPts=[[cx,baseY]];
  let tx=cx, ty=baseY;
  for(let i=0;i<6;i++){
    const t=(i+1)/6;
    ty=baseY+(topY-baseY)*t;
    tx=cx+(sR()-0.5)*trunkW*1.5;
    trunkPts.push([tx,ty]);
  }
  branches.push({kind:'trunk', pts:trunkPts, w:trunkW});
  // Main branches — 3 to 7
  const nMain=3+((sR()*5)|0);
  const mainBr=[];
  for(let i=0;i<nMain;i++){
    const startT=0.35+sR()*0.55;
    const sx=cx+(sR()-0.5)*trunkW*1.5;
    const sy=baseY+(topY-baseY)*startT;
    const ang=(-Math.PI/2)+(sR()-0.5)*Math.PI*0.9;
    const length=(baseY-topY)*(0.35+sR()*0.35);
    const ex=sx+Math.cos(ang)*length;
    const ey=sy+Math.sin(ang)*length;
    const pts=[[sx,sy]];
    for(let k=0;k<5;k++){
      const t=(k+1)/5;
      const mx=sx+(ex-sx)*t+(sR()-0.5)*length*0.15;
      const my=sy+(ey-sy)*t+(sR()-0.5)*length*0.10;
      pts.push([mx,my]);
    }
    const w=trunkW*(0.40+sR()*0.25);
    branches.push({kind:'main', pts, w});
    mainBr.push({pts, w});
  }
  // Sub-branches
  const nSub=Math.round(density*(10+sR()*15));
  for(let si=0;si<nSub;si++){
    if(!mainBr.length) break;
    const m=mainBr[(sR()*mainBr.length)|0];
    const mp=m.pts;
    const ptT=0.3+sR()*0.7;
    const ptIdxF=ptT*(mp.length-1);
    let iLo=ptIdxF|0;
    let frac=ptIdxF-iLo;
    if(iLo>=mp.length-1){ iLo=mp.length-2; frac=1; }
    const sx2=mp[iLo][0]+(mp[iLo+1][0]-mp[iLo][0])*frac;
    const sy2=mp[iLo][1]+(mp[iLo+1][1]-mp[iLo][1])*frac;
    const ang=(-Math.PI/2)+(sR()-0.5)*Math.PI*1.2;
    const length=trunkW*(2+sR()*4);
    const ex2=sx2+Math.cos(ang)*length;
    const ey2=sy2+Math.sin(ang)*length;
    const pts=[[sx2,sy2]];
    for(let k=0;k<3;k++){
      const t=(k+1)/3;
      const mx=sx2+(ex2-sx2)*t+(sR()-0.5)*length*0.20;
      const my=sy2+(ey2-sy2)*t+(sR()-0.5)*length*0.15;
      pts.push([mx,my]);
    }
    const w=m.w*(0.35+sR()*0.30);
    branches.push({kind:'sub', pts, w});
  }
  // Twigs — single-segment fine endings
  const nTwig=Math.round(density*(15+sR()*25));
  for(let ti=0;ti<nTwig;ti++){
    if(!mainBr.length) break;
    const m=mainBr[(sR()*mainBr.length)|0];
    const mp=m.pts;
    const ptT=0.5+sR()*0.5;
    const ptIdxF=ptT*(mp.length-1);
    let iLo=ptIdxF|0;
    let frac=ptIdxF-iLo;
    if(iLo>=mp.length-1){ iLo=mp.length-2; frac=1; }
    const sx3=mp[iLo][0]+(mp[iLo+1][0]-mp[iLo][0])*frac;
    const sy3=mp[iLo][1]+(mp[iLo+1][1]-mp[iLo][1])*frac;
    const ang=(-Math.PI/2)+(sR()-0.5)*Math.PI*1.5;
    const length=trunkW*(0.8+sR()*2.0);
    const ex3=sx3+Math.cos(ang)*length;
    const ey3=sy3+Math.sin(ang)*length;
    branches.push({kind:'twig', pts:[[sx3,sy3],[ex3,ey3]], w:m.w*0.25});
  }
  // Branch colour function — chord-tinted per variant
  function branchCol(i, n){
    const {rgb:c}=_picChord(chords,i%cn,gc,isBW);
    let out;
    if(isBW){
      const lum=(c[0]+c[1]+c[2])/3;
      if(variant===0) out=[Math.round(180+lum*0.2),Math.round(40+lum*0.1),Math.round(30+lum*0.1)];
      else if(variant===1) out=[Math.round(40+lum*0.15),Math.round(38+lum*0.15),Math.round(42+lum*0.15)];
      else if(variant===2) out=[Math.round(150+lum*0.2),Math.round(80+lum*0.2),Math.round(90+lum*0.15)];
      else out=[Math.round(30+lum*0.1),Math.round(60+lum*0.15),Math.round(130+lum*0.25)];
      return out;
    }
    if(variant===0) out=[Math.min(255,Math.round(c[0]*0.6+140)),Math.round(c[1]*0.3+20),Math.round(c[2]*0.3+15)];
    else if(variant===1) out=[Math.round(40+c[0]*0.15),Math.round(38+c[1]*0.15),Math.round(42+c[2]*0.15)];
    else if(variant===2) out=[Math.min(255,Math.round(c[0]*0.4+150)),Math.round(c[1]*0.3+80),Math.round(c[2]*0.3+90)];
    else out=[Math.round(c[0]*0.2+30),Math.round(c[1]*0.3+60),Math.min(255,Math.round(c[2]*0.5+130))];
    // Tone-adjust the variant-forced colour so Pastel softens and Real
    // modulates per-chord (the picChord above already set _curE).
    if(typeof _energyTint === 'function'){ const t=_energyTint(out[0],out[1],out[2]); out=[t[0],t[1],t[2]]; }
    if(typeof _pastelTint === 'function'){ const p=_pastelTint(out[0],out[1],out[2]); out=[p[0],p[1],p[2]]; }
    return out;
  }
  // Render only revealed branches based on lim
  const vis=Math.max(1,Math.ceil(N/cn*branches.length*2.5));
  ctx.lineCap='round'; ctx.lineJoin='round';
  for(let bi=0;bi<Math.min(branches.length,vis);bi++){
    const b=branches[bi];
    const col=branchCol(bi, branches.length);
    ctx.strokeStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.lineWidth=Math.max(1, b.w);
    ctx.beginPath();
    ctx.moveTo(b.pts[0][0], b.pts[0][1]);
    for(let p=1;p<b.pts.length;p++) ctx.lineTo(b.pts[p][0], b.pts[p][1]);
    ctx.stroke();
  }
  // Blossom dots for Apple variant
  if(variant===2){
    const nBlossom=60+((sR()*60)|0);
    const blossomVis=Math.max(1,Math.ceil(N/cn*nBlossom));
    for(let i=0;i<Math.min(nBlossom,blossomVis);i++){
      const bR=_seedRnd(i+58000,ss,0,0);
      const bcx=cx+(bR()-0.5)*CW*0.7;
      const bcy=topY+bR()*(baseY-topY)*0.6;
      const br=2+((bR()*3)|0);
      const {rgb:c}=_picChord(chords,(i*3)%cn,gc,isBW);
      const r=isBW?Math.round((c[0]+c[1]+c[2])/3*0.5+150):Math.min(255,Math.round(c[0]*0.5+180));
      const g=isBW?r:Math.round(c[1]*0.3+150);
      const bbb=isBW?r:Math.round(c[2]*0.3+160);
      ctx.fillStyle=`rgba(${r},${g},${bbb},0.78)`;
      ctx.beginPath(); ctx.arc(bcx,bcy,br,0,Math.PI*2); ctx.fill();
    }
  }
}

// ── Mondrian H: Pier & Ocean — scattered plus/minus marks forming a mesh. ──
function mondrianPhasePier(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  ctx.fillStyle=isBW?'#e6e3da':'#eae6da';ctx.fillRect(0,0,CW,CH);
  const marks=Math.max(20,Math.min(500,cn*4));
  const vis=Math.max(1,Math.ceil(N/cn*marks));
  ctx.lineCap='round';
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+5900,ss,0,0);
    const {0:R,1:G,2:B}=_mondrianBlock(chords,Math.floor(i*(cn/marks)),gc,isBW);
    // cluster into an oval (pier & ocean composition is densest centre)
    const a=rnd()*Math.PI*2,rr=Math.pow(rnd(),0.5);
    const x=CW*0.5+Math.cos(a)*rr*CW*0.46,y=CH*0.5+Math.sin(a)*rr*CH*0.42;
    const s=Math.min(CW,CH)*0.018;
    ctx.strokeStyle=isBW?'rgba(30,30,40,0.8)':`rgba(${Math.round(R*0.3)},${Math.round(G*0.3)},${Math.round(B*0.4+40)},0.8)`;
    ctx.lineWidth=Math.max(1.5,s*0.4);
    ctx.beginPath();ctx.moveTo(x-s,y);ctx.lineTo(x+s,y);ctx.stroke(); // horizontal
    if(rnd()<0.6){ctx.beginPath();ctx.moveTo(x,y-s);ctx.lineTo(x,y+s);ctx.stroke();} // vertical → plus
  }
}

// ── Bulge (Vasarely op-art) ──────────────────────────────────────────────────
// A regular grid of diamonds or 3D-cubes that warps around invisible spheres,
// creating a lens / bulge illusion (Victor Vasarely's "Vega" series). The
// number of spheres scales with track length; cell shape (diamond vs cube) is
// chosen once per painting from the seed. Each grid cell is coloured from the
// chord at the corresponding position via gc(); brightness of facets builds the
// 3D read. Spheres pull cells outward and enlarge them near their centre, then
// release back to the flat grid at their rim.
function drawBulgeOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  const ss = sessionSeed | 0;
  const cn = chords.length;
  const rnd = _seedRnd(53, ss, 0, 0);
  // ── 6-VARIANT CHOOSER (stable per painting, re-rolls on Vary) ──
  //  0 = Classic bulge (Sphere swell / Cube grid, seed-driven internal pick —
  //      the two layouts read as one "bulge" identity so they share a slot).
  //  1 = Vonal — sphere with radiating rays (1968, centrifugal motion).
  //  2 = Vega — colour deformed checkerboard with central bulge.
  //  3 = Banya — diagonal split cells (1964, zigzag color rhythm).
  //  4 = Hexagon cubes — isometric tumbling block (3D).
  //  5 = Plastic-unit cells — discs in cells with central bulge.
  //  Free (cap=2) sees Sphere/Cube + Vonal — grid-warp vs ray-radiate is the
  //  strongest op-art contrast Vasarely\'s catalogue offers.
  {
    const _pn=_capN(6); const _vpick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_vpick===1){ vasarelyPhaseVonal(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_vpick===2){ vasarelyPhaseVega(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_vpick===3){ vasarelyPhaseBanya(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_vpick===4){ vasarelyPhaseHex(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_vpick===5){ vasarelyPhaseCells(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // else fall through to original sphere/cube body (variant 0; the sphere
    // vs cube sub-pick within is seed-driven, kept as natural micro-variation
    // rather than its own Vary slot).
  }
  const COLS = cn<=8 ? 10 : cn<=24 ? 14 : cn<=60 ? 18 : cn<=140 ? 24 : cn<=300 ? 32 : cn<=600 ? 40 : 48;
  const ROWS = Math.max(6, Math.round(COLS * (CH / CW)));
  const cw = CW / COLS, ch = CH / ROWS;

  // ── Sphere count auto-scales with song length (1–4) ──
  const SPHERES = cn<=10 ? 1 : cn<=40 ? 2 : cn<=120 ? 3 : 4;

  // ── Cell shape: diamonds or 3D cubes, chosen once per painting ──
  const useCubes = rnd() < 0.5;

  // ── Place sphere centres (stable per painting) ──
  const spheres = [];
  if(SPHERES === 1){
    spheres.push({ cx: CW*0.5, cy: CH*0.5, r: Math.min(CW,CH)*0.42 });
  } else {
    for(let s=0; s<SPHERES; s++){
      spheres.push({
        cx: CW * (0.22 + rnd()*0.56),
        cy: CH * (0.22 + rnd()*0.56),
        r:  Math.min(CW,CH) * (0.24 + rnd()*0.16),
      });
    }
  }

  // ── Background: deepest palette tone from the whole piece ──
  const bgC = _rectChordColor(chords, 0, 1, gc);
  ctx.fillStyle = `rgb(${(bgC[0]*0.18)|0},${(bgC[1]*0.18)|0},${(bgC[2]*0.18)|0})`;
  ctx.fillRect(0, 0, CW, CH);

  // Per-song bulge intensity. Base 0.6-1.0 from the seed (stable per painting),
  // then SONG ENERGY pushes the swell: a heavy, loud piece deforms dramatically
  // (toward ~1.5), a soft one stays gentle (toward ~0.5). The deformation IS the
  // op-art statement, so energy belongs here — not on grid density, where a finer
  // mesh would just read as noise and weaken the optical pull. Deterministic.
  const _chBu = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const _buEnergy = _chBu ? _chBu.energy : 0.5;
  const bulgeIntensity = (0.6 + rnd() * 0.4) * (0.78 + 0.5*_buEnergy);

  // Lens warp: for a point, find the strongest sphere influence and push the
  // point radially outward + scale it up (classic fish-eye bulge).
  function warp(px, py){
    let bestScale = 1, ox = px, oy = py;
    for(const sp of spheres){
      const dx = px - sp.cx, dy = py - sp.cy;
      const dist = Math.hypot(dx, dy);
      if(dist < sp.r && dist > 0.0001){
        const t = dist / sp.r;            // 0 centre … 1 rim
        // Smooth bulge profile — magnify centre, ease to 1 at rim. Per-song
        // intensity variance (0.6-1.0) so each painting has a different
        // bulge strength.
        const mag = 1 + (1 - t*t) * bulgeIntensity;
        if(mag > bestScale){
          bestScale = mag;
          ox = sp.cx + dx * mag;
          oy = sp.cy + dy * mag;
        }
      }
    }
    return [ox, oy, bestScale];
  }

  // Map a grid cell (col,row) → chord index → colour.
  function cellColor(col, row, shade){
    const gi = (row * COLS + col) % cn;
    const idx = Math.min(cn-1, gi);
    const chord = chords[idx];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes);
    if(!notes || !notes.length) return [120,100,140];
    let R=0,G=0,B=0,c=0;
    for(const note of notes){
      const m = note.m!==undefined?note.m:note;
      const v = note.v!==undefined?note.v:80;
      const [r,g,b] = gc(m, v); R+=r; G+=g; B+=b; c++;
    }
    R/=c; G/=c; B/=c;
    // Shade for 3D facet read.
    return [Math.min(255,R*shade), Math.min(255,G*shade), Math.min(255,B*shade)];
  }

  // Progressive reveal — only draw cells whose chord index is within lim.
  const revealFrac = Math.max(0, Math.min(1, lim / cn));
  const revealCells = Math.ceil(revealFrac * COLS * ROWS);

  let drawn = 0;
  for(let row=0; row<ROWS; row++){
    for(let col=0; col<COLS; col++){
      if(drawn++ > revealCells && lim < cn) continue;
      // Cell centre in flat grid.
      const fx = col*cw + cw/2;
      const fy = row*ch + ch/2;
      const [wx, wy, scale] = warp(fx, fy);
      const hw = (cw/2) * scale * 0.98;
      const hh = (ch/2) * scale * 0.98;

      if(useCubes){
        // 3D cube — three rhombus faces (top, left, right) with shading.
        const colTop = cellColor(col, row, 1.15);
        const colL   = cellColor(col, row, 0.78);
        const colR   = cellColor(col, row, 0.5);
        // Top face
        ctx.fillStyle = `rgb(${colTop[0]|0},${colTop[1]|0},${colTop[2]|0})`;
        ctx.beginPath();
        ctx.moveTo(wx, wy-hh);
        ctx.lineTo(wx+hw, wy-hh*0.5);
        ctx.lineTo(wx, wy);
        ctx.lineTo(wx-hw, wy-hh*0.5);
        ctx.closePath(); ctx.fill();
        // Left face
        ctx.fillStyle = `rgb(${colL[0]|0},${colL[1]|0},${colL[2]|0})`;
        ctx.beginPath();
        ctx.moveTo(wx-hw, wy-hh*0.5);
        ctx.lineTo(wx, wy);
        ctx.lineTo(wx, wy+hh);
        ctx.lineTo(wx-hw, wy+hh*0.5);
        ctx.closePath(); ctx.fill();
        // Right face
        ctx.fillStyle = `rgb(${colR[0]|0},${colR[1]|0},${colR[2]|0})`;
        ctx.beginPath();
        ctx.moveTo(wx+hw, wy-hh*0.5);
        ctx.lineTo(wx, wy);
        ctx.lineTo(wx, wy+hh);
        ctx.lineTo(wx+hw, wy+hh*0.5);
        ctx.closePath(); ctx.fill();
      } else {
        // Diamond (rhombus) — single facet, alternating shade like a checker.
        const checker = ((row + col) & 1) ? 1.1 : 0.62;
        const c = cellColor(col, row, checker);
        ctx.fillStyle = `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
        ctx.beginPath();
        ctx.moveTo(wx, wy-hh);
        ctx.lineTo(wx+hw, wy);
        ctx.lineTo(wx, wy+hh);
        ctx.lineTo(wx-hw, wy);
        ctx.closePath(); ctx.fill();
      }
    }
  }
}

// ── Vasarely C: Plastic-unit cells — a grid of square cells, each holding a
// circle whose size + colour read the music, with a central bulge that swells
// the cells (Vasarely's "plastic unit" / Vega-Nor language). Distinct from the
// wavy-stripe styles: this is a hard square grid with inscribed discs. ──
function vasarelyPhaseCells(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const sR = _seedRnd(91, ss, 0, 25); sR(); sR();
  ctx.fillStyle=isBW?'#1a1a1a':'#14121c';ctx.fillRect(0,0,CW,CH);
  const cols=Math.max(6,Math.min(28,Math.round(Math.sqrt(cn)*1.8))),rows=Math.max(4,Math.round(cols*CH/CW));
  const total=cols*rows,vis=Math.max(1,Math.ceil(N/cn*total));
  const cw=CW/cols,chh=CH/rows;
  // Per-song bulge centre offset + intensity + checker phase.
  const bcx=CW*(0.40+sR()*0.20),bcy=CH*(0.40+sR()*0.20);
  const bR=Math.min(CW,CH)*(0.40+sR()*0.20);
  const checkerPhase = Math.floor(sR()*2);                 // 0 or 1
  const intensityMul = 0.85 + sR()*0.30;                   // 0.85-1.15
  let k=0;
  for(let r=0;r<rows&&k<vis;r++)for(let c=0;c<cols&&k<vis;c++,k++){
    const {rgb}=_picChord(chords,Math.floor(k*(cn/total)),gc,isBW);
    const x=c*cw,y=r*chh,ccx=x+cw/2,ccy=y+chh/2;
    const d=Math.hypot(ccx-bcx,ccy-bcy);
    const swell=Math.max(0,1-d/bR)*intensityMul; // 1 at centre → 0 at rim, scaled
    // alternating cell ground: dark / light checker so discs pop (op-art read)
    const checker=((r+c+checkerPhase)&1);
    const groundCol=isBW
      ? (checker?'#2a2a2a':'#0e0e0e')
      : `rgb(${Math.round(rgb[0]*0.25)},${Math.round(rgb[1]*0.25)},${Math.round(rgb[2]*0.3)})`;
    ctx.fillStyle=groundCol;ctx.fillRect(x,y,cw+0.5,chh+0.5);
    // inscribed circle — radius grows toward the centre bulge
    const baseR=Math.min(cw,chh)*0.5;
    const rad=baseR*(0.35+0.6*swell);
    // disc colour: bright complement of the ground (the music colour, lifted)
    const dr=isBW?(checker?40:210):Math.min(255,rgb[0]+60),
          dg=isBW?(checker?40:210):Math.min(255,rgb[1]+60),
          db=isBW?(checker?40:210):Math.min(255,rgb[2]+60);
    ctx.fillStyle=`rgb(${dr},${dg},${db})`;
    ctx.beginPath();ctx.arc(ccx,ccy,rad,0,Math.PI*2);ctx.fill();
  }
}


// ── Vasarely D: Vega — colour deformed checkerboard with central bulge. ──
function vasarelyPhaseVega(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const sR = _seedRnd(91, ss, 0, 22); sR(); sR();
  ctx.fillStyle=isBW?'#1a1a1a':'#14141e';ctx.fillRect(0,0,CW,CH);
  const cols=Math.max(6,Math.min(28,Math.round(Math.sqrt(cn)*2))),rows=Math.round(cols*CH/CW);
  const total=cols*rows,vis=Math.max(1,Math.ceil(N/cn*total));
  // Per-song bulge centre offset + radius variance.
  const cx=CW*(0.40+sR()*0.20),cy=CH*(0.40+sR()*0.20),bulgeR=Math.min(CW,CH)*(0.40+sR()*0.20);
  const warp=(x,y)=>{const dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy);if(d<bulgeR&&d>0.001){const t=d/bulgeR,mag=1+(1-t*t)*0.7;return[cx+dx*mag,cy+dy*mag];}return[x,y];};
  let k=0;
  for(let r=0;r<rows&&k<vis;r++)for(let c=0;c<cols&&k<vis;c++,k++){
    const {rgb}=_picChord(chords,Math.floor(k*(cn/total)),gc,isBW);
    const dark=(r+c)%2===0;
    const cr=dark?rgb:[Math.min(255,rgb[0]+80),Math.min(255,rgb[1]+80),Math.min(255,rgb[2]+80)];
    const x0=c/cols*CW,y0=r/rows*CH,x1=(c+1)/cols*CW,y1=(r+1)/rows*CH;
    const p0=warp(x0,y0),p1=warp(x1,y0),p2=warp(x1,y1),p3=warp(x0,y1);
    ctx.fillStyle=`rgb(${cr[0]},${cr[1]},${cr[2]})`;
    ctx.beginPath();ctx.moveTo(p0[0],p0[1]);ctx.lineTo(p1[0],p1[1]);ctx.lineTo(p2[0],p2[1]);ctx.lineTo(p3[0],p3[1]);ctx.closePath();ctx.fill();
  }
}

// ── Vasarely E: Hexagon cubes — isometric tumbling-block illusion. ──
function vasarelyPhaseHex(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const sR = _seedRnd(91, ss, 0, 23); sR(); sR();
  ctx.fillStyle=isBW?'#2a2a2a':'#1c1a26';ctx.fillRect(0,0,CW,CH);
  // Per-song size variance (±20%) + light/right shading swap.
  const sizeMul = 0.85 + sR()*0.35;
  const size=Math.min(CW,CH)/Math.max(5,Math.min(14,Math.round(Math.sqrt(cn))))*sizeMul;
  // Per-song offset shift so columns start at different y phase.
  const offsetShift = sR()*size*0.5;
  // Per-song shading flip (left vs right brightness swap).
  const flipShading = sR()<0.5;
  const lShade = flipShading?0.8:0.55, rShade = flipShading?0.55:0.8;
  const cols=Math.ceil(CW/(size*1.5))+1,rows=Math.ceil(CH/(size*0.87))+1;
  const total=cols*rows,vis=Math.max(1,Math.ceil(N/cn*total));
  let k=0;
  for(let r=0;r<rows&&k<vis;r++)for(let c=0;c<cols&&k<vis;c++,k++){
    const {rgb}=_picChord(chords,Math.floor(k*(cn/total)),gc,isBW);
    const x=c*size*1.5,y=r*size*0.87+(c%2?size*0.43:0)+offsetShift;
    // three rhombus faces (top, left, right) shaded for 3D cube
    const h=size*0.5;
    const top=[[x,y-h],[x+size*0.5,y-h*0.5],[x,y],[x-size*0.5,y-h*0.5]];
    const left=[[x-size*0.5,y-h*0.5],[x,y],[x,y+h],[x-size*0.5,y+h*0.5]];
    const right=[[x,y],[x+size*0.5,y-h*0.5],[x+size*0.5,y+h*0.5],[x,y+h]];
    [[top,1.0],[left,lShade],[right,rShade]].forEach(([poly,sh])=>{
      ctx.fillStyle=`rgb(${Math.round(rgb[0]*sh)},${Math.round(rgb[1]*sh)},${Math.round(rgb[2]*sh)})`;
      ctx.beginPath();ctx.moveTo(poly[0][0],poly[0][1]);for(let p=1;p<poly.length;p++)ctx.lineTo(poly[p][0],poly[p][1]);ctx.closePath();ctx.fill();
    });
  }
}

// ── Vasarely F: Colour interval grid — flat grid of graded colour squares. ──

// ── Vasarely G: Vonal — sphere with radiating rays (1968 series). Central
// chord-gradient sphere + 48 chord-coloured wedge rays radiating outward,
// alternating bright/dark. Strong centrifugal motion. Reveal scales ray
// visibility (sphere shows throughout).
function vasarelyPhaseVonal(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));
  const sR = _seedRnd(91, ss, 0, 21); sR(); sR();

  // Dark ground.
  ctx.fillStyle = isBW ? '#0e0e0e' : '#0a0a14';
  ctx.fillRect(0,0,CW,CH);

  // Per-song variance: centre offset, R, ray count, bright pattern.
  const cx = CW * (0.40 + sR()*0.20);
  const cy = CH * (0.40 + sR()*0.20);
  const R = Math.min(CW,CH) * (0.25 + sR()*0.15);
  const rays = 32 + Math.floor(sR()*32);                  // 32-64
  const brightOffset = Math.floor(sR()*7);                // shifts which rays are bright
  const visRays = Math.max(8, Math.ceil(rays*reveal));
  for(let i=0;i<visRays;i++){
    const ang = (i/rays)*Math.PI*2;
    const {rgb} = _picChord(chords, (i*2)%cn, gc, isBW);
    // Irregular bright/dim pattern — based on (i + brightOffset) % 3.
    const isBright = ((i + brightOffset) % 3) !== 0;
    const mul = isBright ? 1 : 0.55;
    ctx.fillStyle = `rgb(${Math.min(255,rgb[0]*mul)|0},${Math.min(255,rgb[1]*mul)|0},${Math.min(255,rgb[2]*mul)|0})`;
    ctx.beginPath();
    const inner = R;
    const outer = Math.hypot(CW,CH);
    const halfAng = Math.PI/rays;
    ctx.moveTo(cx + Math.cos(ang-halfAng)*inner, cy + Math.sin(ang-halfAng)*inner);
    ctx.lineTo(cx + Math.cos(ang-halfAng)*outer, cy + Math.sin(ang-halfAng)*outer);
    ctx.lineTo(cx + Math.cos(ang+halfAng)*outer, cy + Math.sin(ang+halfAng)*outer);
    ctx.lineTo(cx + Math.cos(ang+halfAng)*inner, cy + Math.sin(ang+halfAng)*inner);
    ctx.closePath();
    ctx.fill();
  }

  // Central sphere with chord gradient.
  const gc1 = _picChord(chords, 0, gc, isBW).rgb;
  const gc2 = _picChord(chords, Math.floor(cn/2)%cn, gc, isBW).rgb;
  const grad = ctx.createRadialGradient(cx - R*0.3, cy - R*0.3, R*0.1, cx, cy, R);
  grad.addColorStop(0, `rgb(${Math.min(255,gc1[0]+80)|0},${Math.min(255,gc1[1]+80)|0},${Math.min(255,gc1[2]+80)|0})`);
  grad.addColorStop(1, `rgb(${gc2[0]|0},${gc2[1]|0},${gc2[2]|0})`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI*2);
  ctx.fill();
  ctx.strokeStyle = isBW ? '#0e0e0e' : '#0a0a14';
  ctx.lineWidth = 4;
  ctx.stroke();
}

// ── Vasarely H: Banya — diagonal split cells (1964 · Yapocsa series).
// Grid of squares, each split diagonally into 2 chord-coloured triangles.
// Diagonal direction alternates per cell creating zigzag visual rhythm.
// Reveal sweeps top-left → bottom-right.
function vasarelyPhaseBanya(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));
  const sR = _seedRnd(91, ss, 0, 24); sR(); sR();

  // Dark ground.
  ctx.fillStyle = isBW ? '#0e0e0e' : '#0a0a14';
  ctx.fillRect(0,0,CW,CH);

  // Per-song variance: cell count ±25% + diagonal direction pattern.
  const sizeMul = 0.75 + sR()*0.5;
  const colsBase = cn<=8?8:cn<=24?12:cn<=60?16:cn<=140?20:24;
  const cols = Math.max(6, Math.round(colsBase * sizeMul));
  const rows = Math.max(6, Math.round(cols*CH/CW));
  const cw = CW/cols, chh = CH/rows;
  const total = cols*rows;
  const vis = Math.max(2, Math.ceil(total*reveal));
  // Per-song diagonal pattern: 0=(r+c)%2, 1=r%2, 2=c%2, 3=(r+c)%3<2.
  const patternKind = Math.floor(sR()*4);
  const dirFor = (r,c) => {
    if(patternKind === 1) return r % 2;
    if(patternKind === 2) return c % 2;
    if(patternKind === 3) return ((r+c) % 3) < 2 ? 1 : 0;
    return (r+c) % 2;
  };

  let k=0;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      if(k >= vis) break;
      const x0 = c*cw, y0 = r*chh;
      const dir = dirFor(r, c);
      const cTop = _picChord(chords, (k*2)%cn, gc, isBW).rgb;
      const cBot = _picChord(chords, (k*2+1)%cn, gc, isBW).rgb;
      // Top/upper triangle.
      ctx.fillStyle = `rgb(${cTop[0]|0},${cTop[1]|0},${cTop[2]|0})`;
      ctx.beginPath();
      if(dir === 0){
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0+cw, y0);
        ctx.lineTo(x0, y0+chh);
      } else {
        ctx.moveTo(x0+cw, y0);
        ctx.lineTo(x0+cw, y0+chh);
        ctx.lineTo(x0, y0);
      }
      ctx.closePath();
      ctx.fill();
      // Bottom/lower triangle.
      ctx.fillStyle = `rgb(${cBot[0]|0},${cBot[1]|0},${cBot[2]|0})`;
      ctx.beginPath();
      if(dir === 0){
        ctx.moveTo(x0+cw, y0);
        ctx.lineTo(x0+cw, y0+chh);
        ctx.lineTo(x0, y0+chh);
      } else {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0+cw, y0+chh);
        ctx.lineTo(x0, y0+chh);
      }
      ctx.closePath();
      ctx.fill();
      k++;
    }
    if(k >= vis) break;
  }
}

// ── Arcs (Frank Stella) ──────────────────────────────────────────────────────
// Two Stella languages, chosen once per painting from the seed:
//   • Concentric Squares — nested rings of saturated colour with thin light
//     gaps between them, growing from a centre square outward (Stella's
//     "Concentric Squares" series).
//   • Protractor — interlocking rainbow bands sweeping in arcs and semicircles
//     (Stella's "Protractor" series).
// Each colour band/ring is pulled from a chord via gc(), so the painting is a
// direct reading of the music; rings/bands reveal progressively as lim advances.
function drawArcsOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  const ss = sessionSeed | 0;
  const cn = chords.length;
  const rnd = _seedRnd(67, ss, 0, 0);

  // Colour for chord i, optional brightness multiplier.
  function chordCol(i, mul){
    const idx = Math.min(cn-1, Math.max(0, i % cn));
    const chord = chords[idx];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes);
    if(!notes || !notes.length) return [120,100,140];
    let R=0,G=0,B=0,c=0;
    for(const note of notes){
      const m = note.m!==undefined?note.m:note;
      const v = note.v!==undefined?note.v:80;
      const [r,g,b] = gc(m, v); R+=r; G+=g; B+=b; c++;
    }
    const k = mul===undefined?1:mul;
    return [Math.min(255,R/c*k), Math.min(255,G/c*k), Math.min(255,B/c*k)];
  }
  const css = (c)=>`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
  // ── 6-VARIANT CHOOSER (stable per painting, re-rolls on Vary) ──
  //  0/1 = Concentric squares / Protractor arcs (original body below).
  //  2 = Black Paintings (colour nested frames, recoloured).
  //  3 = Mitered maze.  4 = Eccentric polygons.  5 = Interlocking arcs.
  let _stellaConcentric = true;
  {
    const _pn=_capN(6); const _spick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_spick===2){ stellaPhaseBlack(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_spick===3){ stellaPhaseMaze(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_spick===4){ stellaPhasePoly(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_spick===5){ stellaPhaseInterlock(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    _stellaConcentric = (_spick===0); // 0 = concentric squares, 1 = protractor arcs
  }

  // Background — cream/light like Stella's grounds, tinted slightly by the piece.
  const bgC = chordCol(0, 0.4);
  ctx.fillStyle = `rgb(${Math.min(255,bgC[0]+150)|0},${Math.min(255,bgC[1]+150)|0},${Math.min(255,bgC[2]+140)|0})`;
  ctx.fillRect(0, 0, CW, CH);

  const revealFrac = Math.max(0, Math.min(1, lim / cn));
  // pick 0 = concentric squares, pick 1 = protractor arcs (decided by chooser above)
  const concentric = _stellaConcentric;

  // Stella's statement is the RHYTHM of nested bands — their count and tightness.
  // Song character drives it: a dense, energetic piece nests more (tighter) rings
  // for an intense optical pulse; a calm, sparse one keeps fewer, broader bands.
  const _chSt = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const _stMul = _chSt ? (0.60 + 0.90*(0.5*_chSt.energy + 0.5*_chSt.density)) : 1;
  if(concentric){
    // ── Concentric Squares ──────────────────────────────────────────────────
    const RINGS = Math.max(2, Math.round((cn<=6 ? Math.max(2,cn) : cn<=16 ? 6 : cn<=40 ? 9 : cn<=90 ? 12 : 16) * _stMul));
    const visRings = Math.max(1, Math.ceil(revealFrac * RINGS));
    const cx = CW/2, cy = CH/2;
    const maxR = Math.min(CW, CH) * 0.46;
    const gap = maxR / RINGS;
    const lineGap = Math.max(1, gap * 0.10); // thin light separator
    // Draw outermost first so inner rings sit on top.
    for(let r=0; r<visRings; r++){
      const ringIdx = r;
      const sz = maxR - ringIdx * gap;
      if(sz <= 0) continue;
      const col = chordCol(ringIdx, ((ringIdx & 1) ? 1.0 : 0.82));
      ctx.fillStyle = css(col);
      ctx.fillRect(cx - sz, cy - sz, sz*2, sz*2);
      // Light separator (inset)
      const inner = sz - lineGap;
      if(inner > 0){
        ctx.fillStyle = 'rgba(245,242,230,0.92)';
        ctx.fillRect(cx - sz + (sz-inner), cy - sz + (sz-inner), inner*2, inner*2);
        // restore: draw inner colour back, slightly smaller — handled next loop iteration
      }
    }
    // Re-draw colour squares on top of separators for crisp nesting.
    for(let r=0; r<visRings; r++){
      const sz = maxR - r * gap - lineGap;
      if(sz <= 0) continue;
      const col = chordCol(r, ((r & 1) ? 1.0 : 0.82));
      ctx.fillStyle = css(col);
      ctx.fillRect(cx - sz, cy - sz, sz*2, sz*2);
    }
  } else {
    // ── Protractor arcs ─────────────────────────────────────────────────────
    // A few fans of concentric arcs (rainbow bands) anchored at corners/edges.
    const FANS = cn<=12 ? 2 : cn<=40 ? 3 : 4;
    const BANDS = Math.max(3, Math.round((cn<=12 ? 5 : cn<=40 ? 7 : 9) * _stMul));
    const visBands = Math.max(1, Math.ceil(revealFrac * BANDS));
    // Anchor points for fan centres.
    const anchors = [];
    for(let f=0; f<FANS; f++){
      anchors.push({
        x: CW * (0.15 + rnd()*0.7),
        y: CH * (0.15 + rnd()*0.7),
        a0: rnd() * Math.PI * 2,
        sweep: (0.5 + rnd()*1.5) * Math.PI,
        rMax: Math.min(CW,CH) * (0.35 + rnd()*0.25),
      });
    }
    let colIdx = 0;
    for(const an of anchors){
      const bandW = an.rMax / BANDS;
      for(let b=0; b<visBands; b++){
        const rOuter = an.rMax - b * bandW;
        const rInner = rOuter - bandW * 0.86;
        if(rInner <= 0) continue;
        const col = chordCol(colIdx++, ((b & 1) ? 1.0 : 0.85));
        ctx.fillStyle = css(col);
        ctx.beginPath();
        ctx.arc(an.x, an.y, rOuter, an.a0, an.a0 + an.sweep, false);
        ctx.arc(an.x, an.y, rInner, an.a0 + an.sweep, an.a0, true);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

// ── Stella C: Black Paintings — colour nested frames (recoloured from B/W). ──
function stellaPhaseBlack(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  ctx.fillStyle=isBW?'#101010':'#180a18';ctx.fillRect(0,0,CW,CH);
  const frames=cn<=8?Math.max(2,cn):cn<=30?7:cn<=80?11:15;
  const vis=Math.max(1,Math.ceil(N/cn*frames));
  const cx=CW/2,cy=CH/2,maxW=CW*0.46,maxH=CH*0.46;
  for(let i=0;i<vis;i++){
    const {rgb}=_picChord(chords,Math.floor(i*(cn/frames)),gc,isBW);
    const t=i/frames;
    const w=maxW*(1-t),h=maxH*(1-t);
    ctx.strokeStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.lineWidth=Math.max(2,maxW/frames*0.7);
    ctx.strokeRect(cx-w,cy-h,w*2,h*2);
  }
}

// ── Stella D: Mitered maze — interlocking right-angle band paths. ──
function stellaPhaseMaze(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  ctx.fillStyle=isBW?'#e6e2d8':'#ece4d4';ctx.fillRect(0,0,CW,CH);
  const bands=Math.max(4,Math.min(30,Math.round(cn/3)));
  const vis=Math.max(1,Math.ceil(N/cn*bands));
  const bw=Math.min(CW,CH)/(bands*0.7);
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+4200,ss,0,0);
    const {rgb}=_picChord(chords,Math.floor(i*(cn/bands)),gc,isBW);
    ctx.strokeStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;ctx.lineWidth=Math.max(2,bw*0.6);ctx.lineJoin='miter';ctx.lineCap='square';
    // an L / zigzag mitered path
    let x=rnd()*CW,y=rnd()*CH;ctx.beginPath();ctx.moveTo(x,y);
    const segs=3+((rnd()*4)|0);
    for(let s=0;s<segs;s++){if(s%2===0){x+=(rnd()-0.5)*CW*0.5;}else{y+=(rnd()-0.5)*CH*0.5;}ctx.lineTo(x,y);}
    ctx.stroke();
  }
}

// ── Stella E: Eccentric polygons — irregular nested colour polygons. ──
function stellaPhasePoly(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  ctx.fillStyle=isBW?'#dcd8ce':'#e4dccc';ctx.fillRect(0,0,CW,CH);
  const polys=Math.max(2,Math.min(10,Math.round(cn/14)));
  const vis=Math.max(1,Math.ceil(N/cn*polys));
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+4300,ss,0,0);
    const cx=rnd()*CW,cy=rnd()*CH,R=Math.min(CW,CH)*(0.1+rnd()*0.18);
    const sides=4+((rnd()*4)|0);
    const rot=rnd()*Math.PI*2;
    // nested rings of this polygon
    const rings=2+((rnd()*3)|0);
    for(let r=rings;r>=1;r--){
      const {rgb}=_picChord(chords,Math.floor(i*(cn/polys))+r,gc,isBW);
      ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      const rr=R*(r/rings);
      ctx.beginPath();for(let s=0;s<sides;s++){const a=rot+s/sides*Math.PI*2;const x=cx+Math.cos(a)*rr*(0.8+0.4*((s%2)));const y=cy+Math.sin(a)*rr;s?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();
    }
  }
}

// ── Stella F: Interlocking arcs — rainbow protractor arcs interleaved. ──
function stellaPhaseInterlock(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  ctx.fillStyle=isBW?'#1a1a1a':'#14121a';ctx.fillRect(0,0,CW,CH);
  const arcs=Math.max(4,Math.min(40,Math.round(cn/3)));
  const vis=Math.max(1,Math.ceil(N/cn*arcs));
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+4400,ss,0,0);
    const {rgb}=_picChord(chords,Math.floor(i*(cn/arcs)),gc,isBW);
    const cx=rnd()*CW,cy=rnd()*CH,R=Math.min(CW,CH)*(0.1+rnd()*0.25);
    const a0=rnd()*Math.PI*2,a1=a0+Math.PI*(0.5+rnd());
    ctx.strokeStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;ctx.lineWidth=Math.max(3,R*0.22);ctx.lineCap='butt';
    ctx.beginPath();ctx.arc(cx,cy,R,a0,a1);ctx.stroke();
  }
}

// ── Bloom (Sam Francis) ──────────────────────────────────────────────────────
// Saturated colour blots that bleed and bloom on a field of white, with thin
// drips running down from the masses (Sam Francis's abstract-expressionist
// color-field watercolours). Density auto-scales with track length: short
// pieces breathe with lots of white, long pieces crowd the canvas. Each blot
// is a soft radial bloom coloured from a chord via gc(); drips fall from the
// heavier blots. Reveals progressively as lim advances.
function drawBloomOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  const ss = sessionSeed | 0;
  let _forcedBloomVariant = 0; // set by phase dispatcher: 0 = field, 1 = edge
  const cn = chords.length;
  const rnd = _seedRnd(83, ss, 0, 0);

  function chordCol(i, mul){
    const idx = Math.min(cn-1, Math.max(0, i % cn));
    const chord = chords[idx];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes);
    if(!notes || !notes.length) return [120,100,200];
    let R=0,G=0,B=0,c=0;
    for(const note of notes){
      const m = note.m!==undefined?note.m:note;
      const v = note.v!==undefined?note.v:80;
      const [r,g,b] = gc(m, v); R+=r; G+=g; B+=b; c++;
    }
    const k = mul===undefined?1:mul;
    return [Math.min(255,R/c*k), Math.min(255,G/c*k), Math.min(255,B/c*k)];
  }

  // White ground (Sam Francis canvases are mostly raw white).
  ctx.fillStyle = '#f7f5ef';
  ctx.fillRect(0, 0, CW, CH);
  // ── 6-VARIANT CHOOSER (stable per painting, re-rolls on Vary) ──
  //  0 = Classic Sam Francis (Bloom blots / Edge, seed-driven internal pick —
  //      the two layouts read as one "white-ground bloom" identity so they
  //      share a single Vary slot).
  //  1 = Mandala (1970s concentric/spiritual phase).
  //  2 = Clustered masses (centre).
  //  3 = Blue Balls (blue dominant).
  //  4 = Towards Disappearance (1957-58, minimal sparse marks).
  //  5 = Hanging Drips (1960s "Hanging" series — vertical color streams).
  //  Free (cap=2) sees Bloom + Mandala — dense organic vs ordered concentric
  //  is the strongest visual contrast in Sam Francis's catalogue.
  {
    const _pn=_capN(7); const _fpick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_fpick===1){ francisPhaseMandala(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_fpick===2){ francisPhaseCluster(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_fpick===3){ francisPhaseBlueBalls(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_fpick===4){ francisPhaseDisappear(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_fpick===5){ francisPhaseHangingDrips(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // Slots 0 and 6 share the bloom body; the slot picks the layout (0 = top-
    // weighted field with drips, 6 = Edge composition: blots ring the borders,
    // open white centre) instead of a hidden seed bit — both reachable via Vary.
    _forcedBloomVariant = (_fpick===6) ? 1 : 0;
  }

  // Sam Francis's whole tension is colour vs breathing white. Song character
  // drives both how many blots and — more importantly — COVERAGE, the share of
  // canvas the colour claims. A calm, sparse piece leaves expansive white (his
  // "Towards Disappearance"); a loud, dense one crowds toward a full field.
  const _chFr = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const _frDrive = _chFr ? (0.5*_chFr.energy + 0.5*_chFr.density) : 0.5;
  const BLOTS = Math.max(1, Math.round(_adaptiveMax(cn, 'bloom') * (0.8 + 0.4*_frDrive)));
  const visBlots = Math.max(1, Math.ceil((lim / cn) * BLOTS));

  // Coverage fraction grows with length AND character — calm pieces keep more
  // white, energetic ones fill more. Clamped so the white ground never fully
  // vanishes (it's the signature of the style).
  const _covBase = cn<=12 ? 0.42 : cn<=40 ? 0.55 : cn<=100 ? 0.68 : cn<=300 ? 0.8 : 0.88;
  const coverage = Math.max(0.32, Math.min(0.92, _covBase * (0.82 + 0.32*_frDrive)));

  // ── Variant chooser (stable per painting, re-rolls on Vary) ──
  //  A = top-weighted field with drips falling down (classic Sam Francis).
  //  B = "edge" composition: blots ring the borders, open white centre.
  const bloomVariant = _forcedBloomVariant;   // phase-driven (slot 0 vs 6), not seed

  // Pre-roll blot positions (stable per painting).
  const blots = [];
  for(let i=0; i<BLOTS; i++){
    let bx, by;
    if(bloomVariant === 1){
      const edge = Math.floor(rnd()*4);
      const t = rnd();
      const m = 0.16;
      if(edge===0){ bx = t*CW; by = rnd()*CH*m; }
      else if(edge===1){ bx = t*CW; by = CH*(1-m) + rnd()*CH*m; }
      else if(edge===2){ bx = rnd()*CW*m; by = t*CH; }
      else { bx = CW*(1-m) + rnd()*CW*m; by = t*CH; }
    } else {
      const topBias = rnd();
      bx = rnd() * CW;
      by = (topBias*topBias) * CH * 0.85 + CH*0.02;
    }
    blots.push({
      x: bx,
      y: by,
      r: Math.min(CW,CH) * (0.05 + rnd()*0.14) * (0.6 + coverage*0.8),
      ci: i,
      drip: rnd(),
    });
  }

  ctx.save();
  for(let i=0; i<visBlots && i<blots.length; i++){
    const bl = blots[i];
    const col = chordCol(bl.ci, 1.0);
    const colCss = `rgb(${col[0]|0},${col[1]|0},${col[2]|0})`;
    // Soft radial bloom — translucent so overlaps mix like wet pigment.
    const g = ctx.createRadialGradient(bl.x, bl.y, 0, bl.x, bl.y, bl.r);
    g.addColorStop(0, `rgba(${col[0]|0},${col[1]|0},${col[2]|0},0.85)`);
    g.addColorStop(0.55, `rgba(${col[0]|0},${col[1]|0},${col[2]|0},0.55)`);
    g.addColorStop(1, `rgba(${col[0]|0},${col[1]|0},${col[2]|0},0)`);
    ctx.fillStyle = g;
    // Irregular bloom: blob made of a few overlapping circles.
    const lobes = 3 + Math.floor(rnd()*4);
    for(let l=0; l<lobes; l++){
      const ang = rnd()*Math.PI*2;
      const dist = rnd() * bl.r * 0.5;
      const lr = bl.r * (0.5 + rnd()*0.6);
      const lx = bl.x + Math.cos(ang)*dist;
      const ly = bl.y + Math.sin(ang)*dist;
      const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      lg.addColorStop(0, `rgba(${col[0]|0},${col[1]|0},${col[2]|0},0.7)`);
      lg.addColorStop(1, `rgba(${col[0]|0},${col[1]|0},${col[2]|0},0)`);
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI*2); ctx.fill();
    }
    // Drips — thin trails running down from heavier blots.
    if(bl.drip > 0.45){
      const nDrips = 1 + Math.floor(rnd()*3);
      for(let d=0; d<nDrips; d++){
        const dx = bl.x + (rnd()-0.5) * bl.r * 1.2;
        const dyStart = bl.y + bl.r*0.4;
        const dLen = (0.1 + rnd()*0.45) * CH;
        ctx.strokeStyle = `rgba(${col[0]|0},${col[1]|0},${col[2]|0},${(0.25+rnd()*0.35).toFixed(2)})`;
        ctx.lineWidth = 1 + rnd()*2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(dx, dyStart);
        // slight wobble
        const midx = dx + (rnd()-0.5)*6;
        ctx.quadraticCurveTo(midx, dyStart+dLen*0.5, dx+(rnd()-0.5)*4, dyStart+dLen);
        ctx.stroke();
        // small pooled drop at the end
        ctx.fillStyle = colCss;
        ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.arc(dx+(rnd()-0.5)*4, dyStart+dLen, 1.5+rnd()*2.5, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    // Occasional fine spatter around a blot (Sam Francis speckle).
    if(rnd() > 0.5){
      ctx.fillStyle = colCss;
      const spat = 6 + Math.floor(rnd()*14);
      for(let s=0; s<spat; s++){
        const sa = rnd()*Math.PI*2, sd = bl.r*(0.6+rnd()*1.1);
        const sx = bl.x + Math.cos(sa)*sd, sy = bl.y + Math.sin(sa)*sd;
        ctx.globalAlpha = 0.3 + rnd()*0.4;
        ctx.beginPath(); ctx.arc(sx, sy, 0.6+rnd()*1.8, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

// ── Sam Francis C: Clustered masses — tight cluster of colour blots centre. ──
function francisPhaseCluster(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  ctx.fillStyle=isBW?'#f4f2ee':'#f7f5ef';ctx.fillRect(0,0,CW,CH);
  const blots=Math.max(6,Math.min(120,Math.round(cn*0.9)));
  const vis=Math.max(1,Math.ceil(N/cn*blots));
  const cx=CW/2,cy=CH/2;
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+3800,ss,0,0);
    const {rgb,energy}=_picChord(chords,Math.floor(i*(cn/blots)),gc,isBW);
    const a=rnd()*Math.PI*2, rr=Math.pow(rnd(),0.6)*Math.min(CW,CH)*0.38;
    const x=cx+Math.cos(a)*rr, y=cy+Math.sin(a)*rr;
    const R=Math.min(CW,CH)*(0.04+energy*0.08+rnd()*0.03);
    ctx.fillStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(0.5+rnd()*0.35).toFixed(2)})`;
    ctx.beginPath();
    const pts=7;for(let p=0;p<=pts;p++){const aa=p/pts*Math.PI*2,r2=R*(0.7+rnd()*0.6);const px=x+Math.cos(aa)*r2,py=y+Math.sin(aa)*r2;p?ctx.lineTo(px,py):ctx.moveTo(px,py);}
    ctx.closePath();ctx.fill();
    // drip
    if(rnd()<0.4){ctx.fillStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.4)`;ctx.fillRect(x-1,y,2,R*(1+rnd()*2));}
  }
}

// ── Sam Francis D: Blue Balls — blue-dominant cellular blobs. ──
function francisPhaseBlueBalls(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  ctx.fillStyle=isBW?'#f4f2ee':'#f7f5ef';ctx.fillRect(0,0,CW,CH);
  // Song-aware baseline tint (25% lerp — blue must stay dominant). The
  // phase is named "Blue Balls" after a specific Francis painting, so the
  // identity is the blue mass. Tint only nudges the baseline: an F-major
  // piece picks up a teal-warm undertone, a magenta-rich synth-pop piece
  // shifts toward indigo-violet — never away from "blue".
  const _tint = (!isBW && typeof _songTint === 'function') ? _songTint(chords, gc) : null;
  const _T = (b)=> (typeof _tintBaseline === 'function') ? _tintBaseline(b, _tint, 0.25) : b.slice();
  const _bBall = _T([0, 30, 120]);
  const balls=Math.max(5,Math.min(80,Math.round(cn*0.6)));
  const vis=Math.max(1,Math.ceil(N/cn*balls));
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+3900,ss,0,0);
    const {rgb,energy}=_picChord(chords,Math.floor(i*(cn/balls)),gc,isBW);
    // push blue, now song-tinted at the baseline
    const r=isBW?rgb[0]:Math.round(_bBall[0]+rgb[0]*0.4),g=isBW?rgb[1]:Math.round(_bBall[1]+rgb[1]*0.5),b=isBW?rgb[2]:Math.min(255,Math.round(_bBall[2]+rgb[2]*0.6));
    const x=rnd()*CW,y=rnd()*CH,R=Math.min(CW,CH)*(0.03+energy*0.07+rnd()*0.02);
    ctx.fillStyle=`rgba(${r},${g},${b},${(0.55+rnd()*0.3).toFixed(2)})`;
    ctx.beginPath();ctx.arc(x,y,R,0,Math.PI*2);ctx.fill();
    // halo ring
    ctx.strokeStyle=`rgba(${r},${g},${b},0.4)`;ctx.lineWidth=Math.max(1,R*0.12);ctx.beginPath();ctx.arc(x,y,R*1.4,0,Math.PI*2);ctx.stroke();
  }
}

// ── Sam Francis E: Grid/lattice — colour blots seated in an open white grid. ──

// ── Sam Francis F: Hanging Drips — vertical color streams from top (1960s
// "Hanging" series). Replaces the previous "Big Red mural" — that one read as
// one dominant red polygon vs Cluster's centralised dots, and visually crowded
// the canvas. Hanging Drips is the only Francis phase (and the only style on
// the whole bench) that reads top-down: a curtain of chord-coloured heads
// raining vertical drips into the white. Density drives stream count: 5
// streams for calm pieces, up to 11 for dense ones. Each stream picks one
// chord, with ~40% chance of a drop pooling at the bottom.
function francisPhaseHangingDrips(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0, isBW=mode==='bw', cn=chords.length;
  const N=Math.max(1, Math.min(cn, lim));
  const reveal=Math.max(0, Math.min(1, N/cn));
  if(chords && chords.length){ const _c0=chords[0]; _setCurE(_c0 && _c0._E); }
  // White ground — Sam Francis raw canvas
  ctx.fillStyle=isBW?'#f4f2ee':'#f7f5ef';
  ctx.fillRect(0,0,CW,CH);
  // Song character drives the curtain density: a calm sparse piece gets 5
  // streams of breathing white, an energetic dense one fills to 11 streams.
  const _chFr = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const _drive = _chFr ? (0.5*_chFr.energy + 0.5*_chFr.density) : 0.5;
  const streamCountFull = Math.max(5, Math.min(11, Math.round(5 + _drive*6)));
  const visStreams = Math.max(1, Math.ceil(streamCountFull * reveal));
  const spacing = CW / (streamCountFull+1);
  for(let i=0; i<visStreams; i++){
    const rnd = _seedRnd(i+5500, ss, 0, 0); rnd(); rnd();
    const {rgb} = _picChord(chords, i%cn, gc, isBW);
    // X: spaced evenly across width with small jitter so it doesn't read as a comb
    const x = spacing*(i+1) + (rnd()-0.5)*spacing*0.4;
    // Head ellipse at top of stream
    const headW = Math.min(CW,CH) * (0.025 + rnd()*0.025);
    const headH = headW * 0.45;
    const headY = CH * (0.02 + rnd()*0.04);
    // (H2) Head = irregular bloom mass: 2-3 overlapping soft ellipses with
    // offset/rotation + a few spatter dots — paint, not a pushpin head.
    for(let k=0;k<3;k++){
      const ox=(rnd()-0.5)*headW*0.8, oy=(rnd()-0.5)*headH*0.8;
      const rx=headW*(0.6+rnd()*0.55), ry=rx*(0.38+rnd()*0.22);
      const rot=(rnd()-0.5)*0.7;
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(0.55+rnd()*0.3).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(x+ox, headY+oy, rx, ry, rot, 0, Math.PI*2);
      ctx.fill();
    }
    for(let k=0;k<5;k++){
      const a=rnd()*Math.PI*2, d=headW*(0.8+rnd()*1.4);
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(0.3+rnd()*0.35).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x+Math.cos(a)*d, headY+Math.sin(a)*d*0.5, 0.8+rnd()*2.0, 0, Math.PI*2);
      ctx.fill();
    }
    // (H1) Drip = tapering, gently wobbling filled path: wide at the head,
    // thin at the tail, opacity fading as it falls — gravity, not geometry.
    const dripLength = CH * (0.30 + rnd()*0.60);
    const segs=26;
    const wob=[0]; for(let s=1;s<=segs;s++) wob.push(wob[s-1]+(rnd()-0.5)*3.2);
    const grad = ctx.createLinearGradient(x, headY, x, headY+dripLength);
    grad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.82)`);
    grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.10)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    for(let s=0;s<=segs;s++){
      const t=s/segs, y=headY+headH*0.4+dripLength*t;
      const w=(headW*0.55)*(1-t*0.82)+0.8;
      const xx=x+wob[s]*(0.4+t);
      if(s===0) ctx.moveTo(xx-w/2, y); else ctx.lineTo(xx-w/2, y);
    }
    for(let s=segs;s>=0;s--){
      const t=s/segs, y=headY+headH*0.4+dripLength*t;
      const w=(headW*0.55)*(1-t*0.82)+0.8;
      const xx=x+wob[s]*(0.4+t);
      ctx.lineTo(xx+w/2, y);
    }
    ctx.closePath();
    ctx.fill();
    const endX=x+wob[segs]*1.4, endY=headY+headH*0.4+dripLength;
    // (H3) Pool ONLY when the drip reaches the floor; otherwise a droplet.
    if(rnd() < 0.4 && dripLength > CH*0.80){
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.5)`;
      ctx.beginPath();
      ctx.ellipse(endX, CH*0.965, headW*0.9, headW*0.30, 0, 0, Math.PI*2);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.6)`;
      ctx.beginPath();
      ctx.arc(endX, endY, 1.6+rnd()*1.8, 0, Math.PI*2);
      ctx.fill();
    }
    // Occasional thin secondary trail beside the main drip.
    if(rnd() < 0.5){
      const sx=x+headW*(rnd()-0.5)*1.2;
      const sl=dripLength*(0.3+rnd()*0.4);
      const g2=ctx.createLinearGradient(sx, headY, sx, headY+sl);
      g2.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.4)`);
      g2.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.05)`);
      ctx.strokeStyle=g2; ctx.lineWidth=1.4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(sx, headY+headH*0.3);
      ctx.quadraticCurveTo(sx+(rnd()-0.5)*6, headY+sl*0.5, sx+(rnd()-0.5)*4, headY+sl);
      ctx.stroke();
    }
  }
  // Bottom-edge incursions (a couple of other-chord dots resting on the floor —
  // visual ground note so the curtain doesn't float).
  const incCount = Math.max(2, Math.min(6, Math.round(cn/15)));
  const visInc = Math.max(0, Math.ceil(reveal * incCount));
  for(let i=0; i<visInc; i++){
    const rnd = _seedRnd(i+5700, ss, 0, 0); rnd(); rnd();
    const {rgb} = _picChord(chords, (i+streamCountFull) % cn, gc, isBW);
    const x = rnd()*CW;
    const y = CH - rnd()*CH*0.15;
    const R = Math.min(CW,CH)*(0.025+rnd()*0.04);
    // Soft bloom instead of a flat vector dot.
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.6)`);
    g.addColorStop(0.7, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.25)`);
    g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI*2);
    ctx.fill();
    if(rnd() < 0.6){
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.5)`;
      ctx.beginPath();
      ctx.arc(x+(rnd()-0.5)*R, y+(rnd()-0.5)*R*0.6, 1.5+rnd()*2, 0, Math.PI*2);
      ctx.fill();
    }
  }
}

// ── ARCHIVED: previous Sam Francis F — Big Red mural (dominant red field +
// edge incursions). Replaced by Hanging Drips because the central polygon
// read as too dominant and visually clashed with adjacent Francis phases
// (Cluster, Bloom). Preserved here for reference and potential revival.
function francisPhaseBigRed_archived(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  ctx.fillStyle=isBW?'#f4f2ee':'#f7f5ef';ctx.fillRect(0,0,CW,CH);
  const reveal=Math.max(0,Math.min(1,N/cn));
  // central red mass grows with reveal
  const base=_picChord(chords,0,gc,isBW).rgb;
  const rr=isBW?base[0]:Math.min(255,Math.round(160+base[0]*0.3)),rg=isBW?base[1]:Math.round(30+base[1]*0.15),rb=isBW?base[2]:Math.round(28+base[2]*0.15);
  const mw=CW*(0.3+reveal*0.5),mh=CH*(0.4+reveal*0.45);
  ctx.fillStyle=`rgb(${rr},${rg},${rb})`;
  ctx.save();ctx.translate(CW/2,CH/2);
  ctx.beginPath();
  const pts=10;for(let p=0;p<=pts;p++){const a=p/pts*Math.PI*2,wob=0.82+0.18*Math.sin(a*3+ss);const x=Math.cos(a)*mw*0.5*wob,y=Math.sin(a)*mh*0.5*wob;p?ctx.lineTo(x,y):ctx.moveTo(x,y);}
  ctx.closePath();ctx.fill();ctx.restore();
  // edge incursions of other chord colours
  const inc=Math.max(3,Math.min(40,Math.round(cn/5)));
  const vis=Math.max(1,Math.ceil(reveal*inc));
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+4100,ss,0,0);
    const {rgb}=_picChord(chords,Math.floor(i*(cn/inc))+1,gc,isBW);
    const edge=i%4;
    const x=edge===0?rnd()*CW:edge===1?rnd()*CW:edge===2?rnd()*CW*0.2:CW-rnd()*CW*0.2;
    const y=edge===0?rnd()*CH*0.2:edge===1?CH-rnd()*CH*0.2:rnd()*CH;
    const R=Math.min(CW,CH)*(0.03+rnd()*0.05);
    ctx.fillStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.7)`;
    ctx.beginPath();ctx.arc(x,y,R,0,Math.PI*2);ctx.fill();
  }
}

// ── Sam Francis G: Mandala (1970s series). White ground + 10 concentric
// chord-coloured rings + 24 petal spokes radiating outward + white centre
// dot. Sam Francis's late spiritual phase — ordered, centred, mystical.
function francisPhaseMandala(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));

  ctx.fillStyle = isBW ? '#f4f2ee' : '#f7f5ef';
  ctx.fillRect(0,0,CW,CH);

  const cx = CW/2, cy = CH/2;
  const maxR = Math.min(CW,CH)*0.45;
  const rings = 10;
  const visRings = Math.max(1, Math.ceil(rings*reveal));

  // Concentric rings outer→inner (so inner sits on top).
  for(let r=visRings;r>=1;r--){
    const radius = maxR * (r/rings);
    const {rgb} = _picChord(chords, Math.floor(r/rings * cn)%cn, gc, isBW);
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(0.55 + (r%2)*0.15).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI*2);
    ctx.fill();
  }

  // Petal spokes radiating.
  const spokes = 24;
  const visSpokes = Math.max(2, Math.ceil(spokes*reveal));
  for(let s=0;s<visSpokes;s++){
    const ang = (s/spokes)*Math.PI*2;
    const {rgb} = _picChord(chords, (s*5)%cn, gc, isBW);
    const rnd = _seedRnd(s+5000, ss, 0, 0);
    const inner = maxR*0.35;
    const outer = maxR*(0.9+rnd()*0.15);
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.65)`;
    ctx.beginPath();
    const ax = cx + Math.cos(ang)*inner;
    const ay = cy + Math.sin(ang)*inner;
    const bx = cx + Math.cos(ang+0.06)*outer;
    const by = cy + Math.sin(ang+0.06)*outer;
    const cxx = cx + Math.cos(ang-0.06)*outer;
    const cyy = cy + Math.sin(ang-0.06)*outer;
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cxx, cyy);
    ctx.closePath();
    ctx.fill();
  }

  // White centre dot — the still point.
  ctx.fillStyle = isBW ? '#f4f2ee' : '#f7f5ef';
  ctx.beginPath();
  ctx.arc(cx, cy, maxR*0.12, 0, Math.PI*2);
  ctx.fill();
}

// ── Sam Francis H: Towards Disappearance (1957-58). Minimal — but COMPOSED.
// (F1) A seed-picked corner region anchors the weight; the diagonally
// opposite corner stays an INTENTIONAL void (Francis' edge-painting
// instinct), so sparseness reads as a decision, not confetti.
// (F2) Marks carry gravity drips + spatter — they read as PAINT, not blur.
// (F3) One dominant anchor bloom + smaller satellites — a composition even
// on short tracks. All seed-deterministic; reveal grows with lim.
function francisPhaseDisappear(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));

  ctx.fillStyle = isBW ? '#f6f4f0' : '#f9f7f1';
  ctx.fillRect(0,0,CW,CH);

  // Faint canvas grain.
  for(let i=0;i<400;i++){
    const rnd = _seedRnd(i+6000, ss, 0, 0);
    const tone = isBW ? '195,195,195' : '200,195,180';
    ctx.fillStyle = `rgba(${tone},${(0.06+rnd()*0.10).toFixed(2)})`;
    ctx.fillRect(rnd()*CW, rnd()*CH, 1+rnd()*2, 1+rnd()*2);
  }

  // (F1) Anchor corner (seed-stable) — the far corner stays empty.
  const _crn = _seedRnd(6090, ss, 0, 0);
  const corner = Math.floor(_crn()*4);              // 0 TL, 1 TR, 2 BR, 3 BL
  const acx = (corner===0||corner===3) ? CW*0.24 : CW*0.76;
  const acy = (corner===0||corner===1) ? CH*0.20 : CH*0.80;
  const edgeX = (corner===0||corner===3) ? 0.10 : 0.90; // vertical edge near anchor
  const dn = Math.min(CW,CH);

  const mkBloom = (x,y,r,rgb,aMax)=>{
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${aMax})`);
    g.addColorStop(0.6, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(aMax*0.42).toFixed(2)})`);
    g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  };
  // (F2) Gravity drip: thin quadratic fall + end droplet.
  const mkDrip = (x,y,rgb,len,w,rnd)=>{
    ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.42)`;
    ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x+(rnd()-0.5)*6, y+len*0.55, x+(rnd()-0.5)*4, y+len);
    ctx.stroke();
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.5)`;
    ctx.beginPath(); ctx.arc(x+(rnd()-0.5)*4, y+len, w*0.9, 0, Math.PI*2); ctx.fill();
  };
  const mkSpatter = (x,y,rgb,n,spread,rnd)=>{
    for(let k=0;k<n;k++){
      const a=rnd()*Math.PI*2, d=rnd()*spread;
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(0.28+rnd()*0.3).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(x+Math.cos(a)*d, y+Math.sin(a)*d, 0.8+rnd()*1.8, 0, Math.PI*2); ctx.fill();
    }
  };

  // Sparse marks — anchor first, satellites hug the anchor's edges as lim grows.
  const marks = Math.max(5, Math.min(12, Math.round(cn/14) + 5));
  const vis = Math.max(2, Math.ceil(marks*reveal));

  for(let i=0;i<vis;i++){
    const rnd = _seedRnd(i+6100, ss, 0, 0);
    const {rgb} = _picChord(chords, Math.floor(rnd()*cn), gc, isBW);
    if(i===0){
      // (F3) THE anchor — one dominant bloom in the corner region.
      const x = acx + (rnd()-0.5)*dn*0.10;
      const y = acy + (rnd()-0.5)*dn*0.10;
      const r = dn * (0.16 + rnd()*0.06);
      mkBloom(x, y, r, rgb, 0.5);
      mkBloom(x + r*0.25, y - r*0.2, r*0.5, rgb, 0.4);   // inner density
      mkDrip(x - r*0.3, y + r*0.45, rgb, dn*(0.10+rnd()*0.08), 2.4, rnd);
      mkDrip(x + r*0.35, y + r*0.5, rgb, dn*(0.14+rnd()*0.10), 1.8, rnd);
      mkSpatter(x, y, rgb, 8, r*0.9, rnd);
      continue;
    }
    // (F1) Satellites: bias to the vertical edge near the anchor and the
    // bottom edge — the far corner stays empty (the void carries the frame).
    let x, y;
    if(rnd() < 0.55){
      x = CW * (edgeX + (rnd()-0.5)*0.16);
      y = CH * (0.30 + rnd()*0.62);
    } else {
      x = CW * (0.15 + rnd()*0.62);
      y = CH * (0.86 + (rnd()-0.5)*0.10);
    }
    const r = dn * (0.035 + rnd()*0.05);
    mkBloom(x, y, r, rgb, 0.32 + rnd()*0.14);
    if(i%2===0) mkDrip(x + (rnd()-0.5)*r, y + r*0.4, rgb, dn*(0.05+rnd()*0.06), 1.6, rnd);
    else mkSpatter(x, y, rgb, 4, r*1.1, rnd);
  }
}

// ── Spiral (Hilma af Klint) ──────────────────────────────────────────────────
// Spiritual / symbolist abstraction: floating flowers, concentric circles and
// snail-spirals on a warm field, OR a radiant mandala with segmented rings and
// rays (Hilma af Klint's "The Ten Largest" and "Altarpieces"). Seed picks the
// composition per painting. Each form is coloured from a chord via gc(); forms
// reveal progressively as lim advances. Soft pastel, organic, mystical.
// ─────────────────────────────────────────────────────────────────────────────
// RAFFEL — the author's signature style. No painter from art history: this one
// makes Paintiano's OWN mathematics visible. Every phase is built exclusively
// from the golden angle (137.5°, phyllotaxis — φ made visible by nature) and
// the piece's harmony; colours come through gc() so the chosen palette mode
// applies exactly like for every other artist. The only style wired to the
// full song character from day one — the music decides how it speaks:
//   density → element counts · energy → sizes/luminosity · register → gravity
// Six phases (Vary/dice address them like any other artist):
//   0 Kvet     phyllotaxis bloom — the piece grows like a sunflower
//   1 Závoje   chromatic veils — additive light, harmony births colour
//   2 Prstence orbits — radius = fifths ladder, angle = time, arc = duration
//   3 Vlnenie  interference field — every note a wave source, canvas = sum
//   4 Dych     breath — one soft colour stratum per phrase, zero shapes
//   5 Rieka    time river — the only non-radial one; pitch = altitude
// ─────────────────────────────────────────────────────────────────────────────
// Shared helper for the Jul-2026 trio (Lichtenstein / Klee / Delaunay):
// per-chord colour through gc() so the palette mode applies, plus duration /
// velocity meta. Mirrors the chordCol pattern used by every other overlay.
function _trioChordTools(chords, gc){
  const cn = chords.length;
  function col(i, mul){
    const idx = Math.min(cn-1, Math.max(0, i % cn));
    const chord = chords[idx];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes);
    if(!notes || !notes.length) return [200,150,120];
    let R=0,G=0,B=0,c=0;
    for(const note of notes){
      const m = note.m!==undefined?note.m:note;
      const v = note.v!==undefined?note.v:80;
      const [r,g,b] = gc(m, v); R+=r; G+=g; B+=b; c++;
    }
    const k = mul===undefined?1:mul;
    return [Math.min(255,R/c*k), Math.min(255,G/c*k), Math.min(255,B/c*k)];
  }
  function meta(i){
    const chord=chords[Math.min(cn-1,Math.max(0,i))]; const notes=chord&&(chord.n||chord.notes)||[];
    let d=0,v=0,c=0;
    for(const n of notes){ d+=(n.durMs||400); v+=(n.v!==undefined?n.v:80); c++; }
    return { dur: Math.min(1.6, c? (d/c)/900 : 0.5), vel: Math.min(1, c? (v/c)/110 : 0.7) };
  }
  const css=(c,a)=> a===undefined ? `rgb(${c[0]|0},${c[1]|0},${c[2]|0})` : `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
  // Lichtenstein flat: push a gc colour to a poster-flat comic version —
  // dominant channel saturates, the palette hue survives, the comic look wins.
  const flat=(c)=>{ const mx=Math.max(c[0],c[1],c[2],1); const k=232/mx;
    return [Math.min(240,c[0]*k), Math.min(240,c[1]*k), Math.min(240,c[2]*k)]; };
  const shade=(c,f)=>[Math.min(255,c[0]*f),Math.min(255,c[1]*f),Math.min(255,c[2]*f)];
  return {col, meta, css, flat, shade, cn};
}
// Adaptive watercolour glaze: mix toward white only as much as the source
// colour needs to reach a luminous-glaze ceiling (max channel ≈ 212). Dark
// saturated palettes (Harmony/Contrast) get the full watercolour lift; an
// already-pastel palette mode passes through untouched — no double-pasteling.
function _glaze(c){
  const mx=Math.max(c[0],c[1],c[2]);
  if(mx>=212) return c;
  const k=Math.min(0.55,(212-mx)/Math.max(1,255-mx));
  return [255-(255-c[0])*(1-k), 255-(255-c[1])*(1-k), 255-(255-c[2])*(1-k)];
}
function _bendayField(ctx,x,y,w,h,fill,r,step,alpha){
  ctx.fillStyle=fill; ctx.globalAlpha=alpha;
  for(let yy=y+step/2; yy<y+h; yy+=step)
    for(let xx=x+step/2+(((yy/step)|0)%2)*step/2; xx<x+w; xx+=step){
      ctx.beginPath(); ctx.arc(xx,yy,r,0,7); ctx.fill();
    }
  ctx.globalAlpha=1;
}

// ─────────────────────────────────────────────────────────────────────────────
// LICHTENSTEIN — Ben-Day dots, fat black contours, poster-flat colour.
// Phases: 0 panels · 1 burst · 2 close-up curves · 3 brushstrokes · 4 mirrors
// · 5 pop grid. Song character: density → raster tightness, energy → contour
// weight and shape sizes.
function drawLichtensteinOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  const ss=sessionSeed|0, rnd=_seedRnd(23, ss, 0, 0);
  const {col, meta, css, flat, cn}=_trioChordTools(chords, gc);
  const N=Math.max(1,Math.min(lim,cn)), S=Math.min(CW,CH);
  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const dnaD=_ch?_ch.density:0.5, dnaE=_ch?_ch.energy:0.5;
  const INK='#141414', PAPER='#f7f3ea';
  const LW=(Math.max(3,S*0.008))*(0.75+0.5*dnaE);
  const dotStep=(S*0.017)*(1.25-0.5*dnaD), dotR=dotStep*0.27;
  const GA=Math.PI*2*(1-2/(1+Math.sqrt(5)));
  ctx.fillStyle=PAPER; ctx.fillRect(0,0,CW,CH);
  const _pn=_capN(6); const pick=((phaseIndex|0)%_pn+_pn)%_pn;

  const blob=(x,y,s,fill,burst)=>{
    ctx.lineWidth=Math.max(3,s*0.13); ctx.strokeStyle=INK; ctx.fillStyle=css(fill);
    if(burst){
      ctx.beginPath();
      for(let k=0;k<12;k++){const a=k/12*Math.PI*2, r=(k%2?s*0.5:s*1.15);
        const bx=x+Math.cos(a)*r, by=y+Math.sin(a)*r; k?ctx.lineTo(bx,by):ctx.moveTo(bx,by);}
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(x,y,s,s*0.72,(rnd()-0.5)*0.8,0,7); ctx.fill(); ctx.stroke();
    }
  };

  if(pick===0){ // panels
    const panels=[[0,0,CW*0.56,CH*0.5],[CW*0.56,0,CW*0.44,CH*0.5],[0,CH*0.5,CW*0.44,CH*0.5],[CW*0.44,CH*0.5,CW*0.56,CH*0.5]];
    const per=Math.ceil(cn/4);
    panels.forEach((P,pi)=>{
      const [px,py,pw,ph]=P;
      ctx.save(); ctx.beginPath(); ctx.rect(px,py,pw,ph); ctx.clip();
      _bendayField(ctx,px,py,pw,ph,css(flat(col(pi*per))),dotR,dotStep,0.5);
      const _pstep=Math.max(1,Math.ceil(per/9));
      for(let i=pi*per;i<Math.min(N,(pi+1)*per);i+=_pstep){
        const m=meta(i);
        const x=px+pw*(0.15+0.7*(((i-pi*per)*GA/(Math.PI*2))%1)), y=py+ph*(0.2+0.6*rnd());
        blob(x,y,(pw*0.06+m.dur*pw*0.10)*(0.75+0.5*dnaE),flat(col(i)),m.dur>1.0);
      }
      ctx.restore();
      ctx.strokeStyle=INK; ctx.lineWidth=LW*1.6; ctx.strokeRect(px+LW,py+LW,pw-LW*2,ph-LW*2);
    });
    return;
  }
  if(pick===1){ // burst
    _bendayField(ctx,0,0,CW,CH,css(flat(col(1))),dotR,dotStep,0.45);
    const cx=CW/2, cy=CH*0.52;
    const _rstep=Math.max(3,Math.ceil(cn/30));
    for(let i=0;i<N;i+=_rstep){
      const m=meta(i); const a=i*GA, len=S*0.18+m.dur*S*0.24;
      ctx.fillStyle=css(flat(col(i)));
      ctx.beginPath(); ctx.moveTo(cx,cy);
      ctx.lineTo(cx+Math.cos(a-0.04)*len,cy+Math.sin(a-0.04)*len);
      ctx.lineTo(cx+Math.cos(a+0.04)*len,cy+Math.sin(a+0.04)*len);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle=PAPER; ctx.strokeStyle=INK; ctx.lineWidth=LW*1.4;
    ctx.beginPath();
    for(let k=0;k<20;k++){const a=k/20*Math.PI*2, r=(k%2?S*0.10:S*0.24)*(0.8+0.4*rnd());
      const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r; k?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle=css(flat(col(0))); ctx.beginPath(); ctx.arc(cx,cy,S*0.07*(0.75+0.5*dnaE),0,7); ctx.fill(); ctx.stroke();
    return;
  }
  if(pick===2){ // close-up curves
    _bendayField(ctx,0,0,CW,CH,css(flat(col(2))),dotR*0.95,dotStep*0.9,0.4);
    const bands=7, per=Math.ceil(cn/bands);
    for(let b=0;b<bands;b++){
      const i=Math.min(cn-1,b*per); if(i>=N && b>0) break;
      const m=meta(i);
      ctx.fillStyle=css(flat(col(i))); ctx.strokeStyle=INK; ctx.lineWidth=LW*1.2;
      ctx.beginPath();
      const y0=CH*0.12+b*CH*0.12;
      ctx.moveTo(-20,y0);
      for(let x=0;x<=CW;x+=CW/8){ ctx.quadraticCurveTo(x+CW/16, y0+(((x/(CW/8))|0)%2?-1:1)*(S*0.04+m.dur*S*0.06), x+CW/8, y0); }
      ctx.lineTo(CW+20,y0+CH*0.13); ctx.lineTo(-20,y0+CH*0.13); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    return;
  }
  if(pick===3){ // brushstrokes
    _bendayField(ctx,0,0,CW,CH,css(flat(col(3))),dotR,dotStep,0.42);
    const rows=6, per=Math.ceil(cn/rows);
    for(let k=0;k<rows;k++){
      const i=Math.min(cn-1,k*per); if(i>=N && k>0) break;
      const m=meta(i);
      const x0=CW*0.08, x1=CW*0.92, y=CH*0.14+k*CH*0.15, th=(CH*0.05+m.dur*CH*0.05)*(0.75+0.5*dnaE);
      ctx.fillStyle=css(flat(col(i))); ctx.strokeStyle=INK; ctx.lineWidth=LW;
      ctx.beginPath(); ctx.moveTo(x0,y);
      ctx.bezierCurveTo(CW*0.3,y-th*0.8, CW*0.6,y+th*0.8, x1,y+(rnd()-0.5)*th);
      ctx.lineTo(x1-S*0.04,y+th);
      ctx.bezierCurveTo(CW*0.6,y+th*1.8, CW*0.3,y+th*0.2, x0+S*0.024,y+th);
      for(let f=0;f<4;f++){ ctx.lineTo(x0+S*0.013-f*S*0.011, y+th-f*(th/4)); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    return;
  }
  if(pick===4){ // mirrors
    ctx.fillStyle=INK; ctx.fillRect(0,0,CW,CH);
    const discs=6, per=Math.ceil(cn/discs);
    for(let k=0;k<discs;k++){
      const i=Math.min(cn-1,k*per); if(i>=N && k>0) break;
      const m=meta(i);
      const cx=CW*(0.2+0.6*((k*GA/(Math.PI*2))%1)), cy=CH*(0.2+0.6*rnd());
      const R=(S*0.12+m.dur*S*0.10)*(0.75+0.5*dnaE);
      ctx.fillStyle=css(flat(col(i))); ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.clip();
      ctx.fillStyle=INK;
      const st=dotStep*0.75;
      for(let y=cy-R;y<cy+R;y+=st)
        for(let x=cx-R+(((y/st)|0)%2)*st/2;x<cx+R;x+=st){
          const d=Math.hypot(x-cx,y-cy)/R;
          ctx.beginPath(); ctx.arc(x,y,dotR*0.35+dotR*1.2*d,0,7); ctx.fill();
        }
      ctx.restore();
      ctx.strokeStyle=PAPER; ctx.lineWidth=LW; ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.stroke();
    }
    return;
  }
  { // 5 pop grid
    ctx.fillStyle=INK; ctx.fillRect(0,0,CW,CH);
    const cols=7, rows=8, cw=CW/cols, chh=CH/rows;
    for(let i=0;i<Math.min(N,cols*rows);i++){
      const m=meta(i); const f=flat(col(i));
      const x=(i%cols)*cw, y=((i/cols)|0)*chh;
      ctx.fillStyle=(i%2)?PAPER:css(f); ctx.fillRect(x+2,y+2,cw-4,chh-4);
      _bendayField(ctx,x+2,y+2,cw-4,chh-4,(i%2)?css(f):INK,dotR*0.5,dotStep*0.55,0.5);
      ctx.strokeStyle=INK; ctx.lineWidth=Math.max(2,LW*0.6); ctx.strokeRect(x+2,y+2,cw-4,chh-4);
      ctx.fillStyle=(i%2)?css(f):PAPER; ctx.strokeStyle=INK;
      const cx2=x+cw/2, cy2=y+chh/2, s2=Math.min(cw,chh)*0.22*(0.7+m.dur*0.5)*(0.75+0.5*dnaE);
      if(m.dur>0.9){
        ctx.beginPath();
        for(let k=0;k<8;k++){const a=k/8*Math.PI*2, r=(k%2?s2*0.5:s2);
          k?ctx.lineTo(cx2+Math.cos(a)*r,cy2+Math.sin(a)*r):ctx.moveTo(cx2+Math.cos(a)*r,cy2+Math.sin(a)*r);}
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else { ctx.beginPath(); ctx.arc(cx2,cy2,s2,0,7); ctx.fill(); ctx.stroke(); }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KLEE — the painter-musician. Phases: 0 magic squares + a line for a walk ·
// 1 polyphony (translucent layers) · 2 fugue (voices entering shifted) ·
// 3 fish garden · 4 arrows over terraces · 5 dot mosaic.
// Song character: register → which rows light up, energy → luminosity.
function drawKleeOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  const ss=sessionSeed|0, rnd=_seedRnd(40, ss, 0, 0);
  const {col, meta, css, shade, cn}=_trioChordTools(chords, gc);
  const N=Math.max(1,Math.min(lim,cn)), S=Math.min(CW,CH);
  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const dnaE=_ch?_ch.energy:0.5, dnaR=_ch?_ch.register:0.5;
  const PHI=(1+Math.sqrt(5))/2, GA=Math.PI*2*(1-1/PHI);
  const _pn=_capN(6); const pick=((phaseIndex|0)%_pn+_pn)%_pn;
  const ground=(a,b)=>{const g=ctx.createLinearGradient(0,0,0,CH);g.addColorStop(0,a);g.addColorStop(1,b);ctx.fillStyle=g;ctx.fillRect(0,0,CW,CH);};
  const chordTopness=(i)=>{ // 0..1 vertical home of a chord from its mean pitch
    const chord=chords[Math.min(cn-1,i)]; const notes=chord&&(chord.n||chord.notes)||[];
    if(!notes.length) return 0.5;
    let s2=0; for(const n of notes){ s2+=(n.m!==undefined?n.m:n); }
    return Math.max(0,Math.min(1,(s2/notes.length-36)/60));
  };

  if(pick===0){ // magic squares + line
    ground('#241a14','#160f0d');
    const cols=11, rows=8, colW=[], rowH=[]; let acc=0, accR=0;
    for(let c=0;c<cols;c++){const w=0.6+rnd()*0.9;colW.push(w);acc+=w;}
    for(let r=0;r<rows;r++){const h2=0.6+rnd()*0.9;rowH.push(h2);accR+=h2;}
    const per=cn/cols; let cy=0;
    for(let r2=0;r2<rows;r2++){
      let cx=0;
      for(let c=0;c<cols;c++){
        const w=colW[c]/acc*CW, h2=rowH[r2]/accR*CH;
        const ni=Math.min(cn-1,(c*per+r2*1.7)|0);
        const revealed = ni<N;
        const m=meta(ni);
        const lit = revealed && Math.abs((rows-1-r2)/(rows-1)-(0.3+0.5*m.vel))<0.30;
        const base=col(ni, lit?(0.9+0.7*m.vel*(0.75+0.5*dnaE)):0.32);
        ctx.fillStyle=css(base,0.96);
        ctx.fillRect(cx+1.5,cy+1.5,w-3,h2-3);
        const gg=ctx.createRadialGradient(cx+w/2,cy+h2/2,2,cx+w/2,cy+h2/2,Math.max(w,h2)*0.7);
        gg.addColorStop(0,'rgba(255,240,210,.10)'); gg.addColorStop(1,'rgba(0,0,0,.14)');
        ctx.fillStyle=gg; ctx.fillRect(cx+1.5,cy+1.5,w-3,h2-3);
        cx+=w;
      }
      cy+=rowH[r2]/accR*CH;
    }
    // "a line for a walk" — downsampled to ~56 walk points regardless of the
    // piece length (hundreds of chords produced a dense scribble) and smoothed
    // through quadratic midpoints; thinner and softer.
    ctx.strokeStyle='rgba(20,14,10,.7)'; ctx.lineWidth=Math.max(1.6,S*0.0024); ctx.lineJoin='round'; ctx.lineCap='round';
    const _lstep=Math.max(1,Math.ceil(cn/56));
    const _pts=[];
    for(let i=0;i<N;i+=_lstep){
      _pts.push([CW*0.04+(i/Math.max(1,cn-1))*CW*0.92,
                 CH*0.82-chordTopness(i)*CH*0.6+Math.sin((i/_lstep)*GA)*S*0.010]);
    }
    if(_pts.length>1){
      ctx.beginPath(); ctx.moveTo(_pts[0][0],_pts[0][1]);
      for(let p=1;p<_pts.length-1;p++){
        ctx.quadraticCurveTo(_pts[p][0],_pts[p][1],(_pts[p][0]+_pts[p+1][0])/2,(_pts[p][1]+_pts[p+1][1])/2);
      }
      ctx.lineTo(_pts[_pts.length-1][0],_pts[_pts.length-1][1]);
      ctx.stroke();
    }
    ctx.fillStyle='#f3dc9a'; ctx.beginPath(); ctx.arc(CW*0.16,CH*0.14,S*0.026,0,7); ctx.fill();
    ctx.fillStyle='#241a14'; ctx.beginPath(); ctx.arc(CW*0.16+S*0.012,CH*0.14-S*0.004,S*0.022,0,7); ctx.fill();
    return;
  }
  if(pick===1){ // polyphony — translucent watercolour glazes weaving voices
    ground('#efe6d2','#e0d2b6');
    ctx.globalCompositeOperation='multiply';
    // cap the weave at ~48 glazes regardless of piece length — hundreds of
    // multiply layers collapse to black no matter how pale each glaze is
    const _kstep=Math.max(1,Math.ceil(cn/48));
    for(let i=0;i<N;i+=_kstep){
      const m=meta(i);
      // R2 low-discrepancy placement — x/y decorrelated (the old i·GA / i·φ
      // pairing is linear in i, which lined every rectangle up on one diagonal)
      const x=CW*0.04+((0.7548776662*(i+1))%1)*CW*0.72;
      const y=CH*0.05+((0.5698402910*(i+1))%1)*CH*0.72;
      // pastel glaze: mix toward white so stacked multiplies stay luminous —
      // saturated fills under multiply collapse to black after a few layers
      const pale=_glaze(col(i,1.0));
      ctx.fillStyle=css(pale,0.92);
      ctx.fillRect(x,y,CW*0.09+m.dur*CW*0.15,CH*0.07+m.vel*CH*0.12);
    }
    ctx.globalCompositeOperation='source-over';
    return;
  }
  if(pick===2){ // fugue
    const base=col(0,0.35);
    ground(css(shade(base,0.9)), css(shade(base,0.45)));
    const motifN=8, voices=5;
    // Reveal scaled to the WHOLE song: the old gate (v*3+i >= N) exposed all
    // 40 marks after ~20 chords, so a full piece looked painted instantly.
    // Now voices enter one after another across the entire duration — a fugue.
    const _tot=voices*motifN;
    const _rev=Math.max(1, Math.ceil(_tot * (N/Math.max(1,cn))));
    let _k=0;
    for(let v=0;v<voices;v++){
      for(let i=0;i<motifN;i++){
        if(++_k>_rev) break;
        const m=meta(i);
        const x=CW*0.08+i*CW*0.105+v*CW*0.045, y=CH*0.16+v*CH*0.15+Math.sin(i*0.9)*CH*0.02;
        const s2=(S*0.05+m.dur*S*0.05)*(0.75+0.5*dnaE);
        ctx.fillStyle=css(col(i,0.55+v*0.18+m.vel*0.25),0.92);
        if(i%3===0){ ctx.beginPath(); ctx.arc(x,y,s2*0.62,0,7); ctx.fill(); }
        else if(i%3===1){ ctx.fillRect(x-s2*0.55,y-s2*0.55,s2*1.1,s2*1.1); }
        else { ctx.beginPath(); ctx.moveTo(x,y-s2*0.65); ctx.lineTo(x+s2*0.6,y+s2*0.5); ctx.lineTo(x-s2*0.6,y+s2*0.5); ctx.closePath(); ctx.fill(); }
      }
    }
    return;
  }
  if(pick===3){ // fish garden
    ground('#0c1418','#060a0e');
    ctx.fillStyle='rgba(240,230,200,.5)';
    for(let p=0;p<4;p++) for(let s2=0;s2<40;s2++){
      const t=s2/40, x=CW*0.1+t*CW*0.8, y=CH*(0.2+p*0.2)+Math.sin(t*6+p)*CH*0.05;
      ctx.beginPath(); ctx.arc(x,y,Math.max(1.2,S*0.0022),0,7); ctx.fill();
    }
    const _fstep=Math.max(3,Math.ceil(cn/18));
    for(let i=0;i<N;i++){
      if(i%_fstep) continue;
      const m=meta(i);
      const x=CW*0.1+((i*GA/(Math.PI*2))%1)*CW*0.8, y=CH*0.12+((i*PHI)%1)*CH*0.75;
      const s2=(S*0.03+m.dur*S*0.04)*(0.75+0.5*dnaE);
      ctx.save(); ctx.translate(x,y); ctx.rotate((rnd()-0.5)*0.8);
      ctx.fillStyle=css(col(i,1.05+m.vel*0.35),0.95);
      ctx.beginPath(); ctx.ellipse(0,0,s2,s2*0.45,0,0,7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s2*0.9,0); ctx.lineTo(s2*1.5,-s2*0.4); ctx.lineTo(s2*1.5,s2*0.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#0c1418'; ctx.beginPath(); ctx.arc(-s2*0.45,0,Math.max(1,s2*0.09),0,7); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle='rgba(120,200,150,.6)'; ctx.lineWidth=Math.max(1.6,S*0.0026);
    for(let p=0;p<6;p++){const x=CW*(0.08+p*0.16); ctx.beginPath(); ctx.moveTo(x,CH);
      for(let s2=0;s2<8;s2++){ ctx.quadraticCurveTo(x+(s2%2?S*0.018:-S*0.018),CH-(s2+0.5)*CH*0.04,x,CH-(s2+1)*CH*0.04); } ctx.stroke();}
    return;
  }
  if(pick===4){ // arrows over terraces
    const rows=9;
    for(let r=0;r<rows;r++){
      const ni=Math.min(cn-1,(r*cn/rows)|0); const m=meta(ni);
      ctx.fillStyle=css(col(ni,0.55+m.vel*0.55),0.95);
      ctx.fillRect(0,r*CH/rows,CW,CH/rows+1);
    }
    const per=Math.ceil(cn/6);
    for(let p=0;p<6;p++){
      const ai=Math.min(cn-1,p*per); if(ai>=N && p>0) break;
      const bi=Math.min(cn-1,p*per+per-1);
      const up=chordTopness(bi)>chordTopness(ai);
      const m=meta(ai);
      const x=CW*(0.14+p*0.145), y=CH*(0.5+(p%2?0.16:-0.16));
      const L=(CH*0.12+m.dur*CH*0.08)*(0.75+0.5*dnaE), dir=up?-1:1;
      ctx.fillStyle='rgba(20,14,10,.82)';
      ctx.fillRect(x-S*0.009, Math.min(y,y+dir*L*0.62), S*0.018, L*0.62);
      ctx.beginPath(); ctx.moveTo(x,y+dir*L); ctx.lineTo(x-S*0.03,y+dir*L*0.6); ctx.lineTo(x+S*0.03,y+dir*L*0.6); ctx.closePath(); ctx.fill();
    }
    return;
  }
  { // 5 dot mosaic
    ground('#2a2118','#191209');
    const step=CW/38;
    for(let y=step/2;y<CH;y+=step) for(let x=step/2;x<CW;x+=step){
      const ci=Math.min(cn-1,(x/CW*cn)|0);
      const revealed=ci<N; const m=meta(ci);
      const band=1-Math.abs(y/CH-(1-chordTopness(ci)))*2.2;
      const litK=revealed?Math.max(0,band):0;
      ctx.fillStyle=css(col(ci, 0.22+litK*(0.7+0.7*m.vel*(0.75+0.5*dnaE))),0.95);
      ctx.fillRect(x-step*0.42,y-step*0.42,step*0.84,step*0.84);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELAUNAY — Orphism: simultaneous colour circles, the circle of fifths made
// literal. Phases: 0 simultaneous discs · 1 Rythme column · 2 endless rhythm
// · 3 windows · 4 electric prisms · 5 sun & moon.
// Song character: energy → ring counts / radiance, density → disc population.
function drawDelaunayOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  const ss=sessionSeed|0, rnd=_seedRnd(85, ss, 0, 0);
  const {col, meta, css, shade, cn}=_trioChordTools(chords, gc);
  const N=Math.max(1,Math.min(lim,cn)), S=Math.min(CW,CH);
  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const dnaE=_ch?_ch.energy:0.5, dnaD=_ch?_ch.density:0.5;
  const PHI=(1+Math.sqrt(5))/2, GA=Math.PI*2*(1-1/PHI);
  const _pn=_capN(6); const pick=((phaseIndex|0)%_pn+_pn)%_pn;
  // segment colour: rotate the chord colour's channels + lightness stepping —
  // simultaneous contrast from within the active palette, no foreign hues.
  const seg=(base,s2,k)=>{
    const rot=[[0,1,2],[1,2,0],[2,0,1]][s2%3];
    const c=[base[rot[0]],base[rot[1]],base[rot[2]]];
    return shade(c, 0.7+((s2+k)%3)*0.22);
  };
  function disc(x,y,R,i,vel,ringAdd){
    const base=col(i,1.05);
    const ringN=3+((vel*3*(0.75+0.5*dnaE))|0)+(ringAdd||0);
    for(let k=ringN;k>=1;k--){
      const rr=R*k/ringN, segs=4+((i+k)%4);
      for(let s2=0;s2<segs;s2++){
        const a0=(s2/segs)*Math.PI*2+k*0.35, a1=((s2+1)/segs)*Math.PI*2+k*0.35;
        ctx.fillStyle=css(seg(base,s2,k),0.92);
        ctx.beginPath(); ctx.moveTo(x,y); ctx.arc(x,y,rr,a0,a1); ctx.closePath(); ctx.fill();
      }
    }
    ctx.strokeStyle='rgba(30,26,20,.25)'; ctx.lineWidth=Math.max(1.5,S*0.0026);
    ctx.beginPath(); ctx.arc(x,y,R,0,7); ctx.stroke();
  }

  if(pick===0){ // simultaneous discs
    ctx.fillStyle='#f0e9da'; ctx.fillRect(0,0,CW,CH);
    const stride=Math.max(Math.ceil(cn/14), Math.round(5*(1.3-0.6*dnaD)));
    const ds=[];
    for(let i=0;i<N;i+=stride){
      const m=meta(i);
      ds.push({x:CW*(0.14+0.72*((i*GA/(Math.PI*2))%1)), y:CH*(0.16+0.68*rnd()),
               r:S*0.07+m.dur*S*0.10, i, vel:m.vel});
    }
    ds.sort((a,b)=>b.r-a.r);
    for(const d of ds) disc(d.x,d.y,d.r,d.i,d.vel,0);
    return;
  }
  if(pick===1){ // Rythme column
    ctx.fillStyle='#efe7d6'; ctx.fillRect(0,0,CW,CH);
    for(let k=0;k<6;k++){
      const ni=Math.min(cn-1,k*9); const m=meta(ni);
      ctx.fillStyle=css(col(ni,0.9+k*0.06),0.9);
      ctx.beginPath(); ctx.arc(k%2?0:CW, CH*(0.12+k*0.16), CW*0.16+m.dur*CW*0.05, 0, 7); ctx.fill();
    }
    const per=Math.ceil(cn/4);
    for(let k=0;k<4;k++){
      const ni=Math.min(cn-1,k*per); if(ni>=N && k>0) break;
      const m=meta(ni);
      disc(CW*0.5+(k%2?CW*0.05:-CW*0.05), CH*(0.16+k*0.225), CW*0.15+m.dur*CW*0.06, ni, m.vel, 1);
    }
    return;
  }
  if(pick===2){ // endless rhythm
    ctx.fillStyle='#151220'; ctx.fillRect(0,0,CW,CH);
    ctx.strokeStyle='rgba(240,233,218,.22)'; ctx.lineWidth=CW*0.02;
    ctx.beginPath();
    for(let s2=0;s2<=40;s2++){const t=s2/40;
      const x=CW*(0.2+0.6*t), y=CH*(0.14+0.72*t);
      s2?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.stroke();
    const per=Math.ceil(cn/5);
    for(let k=0;k<5;k++){
      const ni=Math.min(cn-1,k*per); if(ni>=N && k>0) break;
      const m=meta(ni); const base=col(ni,1.05);
      const t=k/4, x=CW*(0.2+0.6*t), y=CH*(0.14+0.72*t)+Math.sin(t*Math.PI)*(k%2?-1:1)*CH*0.10;
      const R=CW*0.13+m.dur*CW*0.05;
      ctx.beginPath(); ctx.arc(x,y,R,Math.PI*0.5,Math.PI*1.5); ctx.closePath();
      ctx.fillStyle=css(base,0.95); ctx.fill();
      ctx.beginPath(); ctx.arc(x+R*0.22,y,R,Math.PI*1.5,Math.PI*0.5); ctx.closePath();
      ctx.fillStyle=css(seg(base,1,1),0.95); ctx.fill();
      ctx.fillStyle=css(seg(base,2,2),0.95);
      ctx.beginPath(); ctx.arc(x+R*0.11,y,R*0.4,0,7); ctx.fill();
    }
    return;
  }
  if(pick===3){ // windows — prismatic shards fanning around the centre
    // (Fenêtres): light radiates outward through pastel panes; completely
    // different composition from Klee's woven rectangles.
    ctx.fillStyle='#e9e2cf'; ctx.fillRect(0,0,CW,CH);
    ctx.globalCompositeOperation='multiply';
    const wx=CW/2, wy=CH*0.46;
    // cap the fan at ~44 shards — hundreds of chords otherwise stack every
    // golden angle into a solid black ring
    const _dstep=Math.max(1,Math.ceil(cn/44));
    for(let i=0;i<N;i+=_dstep){
      const m=meta(i);
      const a=i*GA;
      const r0=S*0.05+((0.7548776662*(i+1))%1)*S*0.26;
      const len=S*0.13+m.dur*S*0.22;
      const wid=0.10+m.vel*0.15;
      const pale=_glaze(col(i,1.05));
      ctx.fillStyle=css(pale,0.92);
      ctx.beginPath();
      ctx.moveTo(wx+Math.cos(a)*(r0+len), wy+Math.sin(a)*(r0+len));
      ctx.lineTo(wx+Math.cos(a-wid)*r0,  wy+Math.sin(a-wid)*r0);
      ctx.lineTo(wx+Math.cos(a+wid)*r0,  wy+Math.sin(a+wid)*r0);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation='source-over';
    ctx.strokeStyle='rgba(60,80,60,.35)'; ctx.lineWidth=Math.max(3,S*0.006);
    ctx.beginPath(); ctx.moveTo(CW*0.46,CH*0.9); ctx.lineTo(CW*0.5,CH*0.22); ctx.lineTo(CW*0.54,CH*0.9); ctx.stroke();
    return;
  }
  if(pick===4){ // electric prisms
    ctx.fillStyle='#efe8d8'; ctx.fillRect(0,0,CW,CH);
    const _sstep=Math.max(7,Math.ceil(cn/9));
    for(let i=0;i<N;i+=_sstep){
      const m=meta(i);
      disc(CW*(0.1+0.8*rnd()), CH*(0.1+0.8*rnd()), S*0.05+m.dur*S*0.03, i, m.vel, 0);
    }
    const p1=Math.min(cn-1,8), p2=Math.min(cn-1,Math.max(9,(cn*0.62)|0));
    [p1,p2].forEach((ni,k)=>{
      if(ni>=N && k>0) return;
      const base=col(ni,1.1);
      const x=CW*(k?0.66:0.34), y=CH*(k?0.6:0.4), R=S*0.30*(0.8+0.4*dnaE);
      for(let ring=14;ring>=1;ring--){
        const rr=R*ring/14, segs=10+ring*2;
        for(let s2=0;s2<segs;s2++){
          const a0=s2/segs*Math.PI*2+ring*0.22+k, a1=(s2+1)/segs*Math.PI*2+ring*0.22+k;
          ctx.fillStyle=css(seg(base,s2,ring),0.5);
          ctx.beginPath(); ctx.moveTo(x,y); ctx.arc(x,y,rr,a0,a1); ctx.closePath(); ctx.fill();
        }
      }
    });
    return;
  }
  { // 5 sun & moon
    ctx.fillStyle='#101425'; ctx.fillRect(0,0,CW,CH);
    let sunI=0, moonI=0, mx2=-1, mn2=2;
    for(let i=0;i<N;i++){ const m=meta(i); if(m.vel>mx2){mx2=m.vel;sunI=i;} if(m.vel<mn2){mn2=m.vel;moonI=i;} }
    const sb=col(sunI,1.25);
    const sx=CW*0.34, sy=CH*0.42, SR=S*0.26*(0.85+0.3*dnaE);
    for(let k=0;k<24;k++){
      const a=k/24*Math.PI*2;
      ctx.fillStyle=css(seg(sb,k,0),0.9);
      ctx.beginPath(); ctx.moveTo(sx,sy);
      ctx.lineTo(sx+Math.cos(a)*SR*1.35, sy+Math.sin(a)*SR*1.35);
      ctx.lineTo(sx+Math.cos(a+0.13)*SR, sy+Math.sin(a+0.13)*SR);
      ctx.closePath(); ctx.fill();
    }
    disc(sx,sy,SR*0.8,sunI,mx2,2);
    const mb=col(moonI,0.7);
    const mx=CW*0.74, my=CH*0.68, MR=S*0.17;
    for(let k=5;k>=1;k--){
      ctx.fillStyle=css(shade(mb,0.55+k*0.16),0.9);
      ctx.beginPath(); ctx.arc(mx,my,MR*k/5,0,7); ctx.fill();
      ctx.fillStyle='#101425';
      ctx.beginPath(); ctx.arc(mx+MR*k/5*0.35, my-MR*k/5*0.12, MR*k/5*0.82, 0, 7); ctx.fill();
    }
  }
}

function drawRaffelOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  // -- density cap: long pieces get a uniform subsample (sqrt scale) so the
  //    painting stays elegant. Short pieces (<=110 chords) are untouched;
  //    long ones stay visibly denser (600 -> ~198, 1400 -> ~253) but never a
  //    carpet. lim is remapped so the progressive reveal still grows smoothly
  //    with playback across the whole piece.
  const _cn0 = chords.length;
  if(_cn0 > 110){
    const _K = Math.round(110 + 4*Math.sqrt(_cn0-110));
    const _sel = new Array(_K);
    for(let _j=0;_j<_K;_j++){ _sel[_j] = chords[Math.floor(_j*_cn0/_K)]; }
    lim = Math.max(1, Math.round(Math.min(lim,_cn0)*_K/_cn0));
    chords = _sel;
  }
  const ss = sessionSeed | 0;
  const cn = chords.length;
  const N  = Math.max(1, Math.min(lim, cn));          // progressive reveal
  const rnd = _seedRnd(137, ss, 0, 0);                 // 137 — the golden angle salt
  const PHI = (1+Math.sqrt(5))/2, GA = Math.PI*2*(1-1/PHI);
  const S = Math.min(CW, CH);
  const _ch = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const dnaD = _ch ? _ch.density : 0.5;                // element counts
  const dnaE = _ch ? _ch.energy  : 0.5;                // sizes / luminosity
  const dnaR = _ch ? _ch.register: 0.5;                // vertical gravity

  function chordCol(i, mul){
    const idx = Math.min(cn-1, Math.max(0, i % cn));
    const chord = chords[idx];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes);
    if(!notes || !notes.length) return [200,150,120];
    let R=0,G=0,B=0,c=0;
    for(const note of notes){
      const m = note.m!==undefined?note.m:note;
      const v = note.v!==undefined?note.v:80;
      const [r,g,b] = gc(m, v); R+=r; G+=g; B+=b; c++;
    }
    const k = mul===undefined?1:mul;
    return [Math.min(255,R/c*k), Math.min(255,G/c*k), Math.min(255,B/c*k)];
  }
  const css=(c,a)=> a===undefined ? `rgb(${c[0]|0},${c[1]|0},${c[2]|0})` : `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
  const chordMeta=(i)=>{                               // duration+velocity 0..1-ish
    const chord=chords[Math.min(cn-1,i)]; const notes=chord&&(chord.n||chord.notes)||[];
    let d=0,v=0,c=0;
    for(const n of notes){ d+=(n.durMs||400); v+=(n.v!==undefined?n.v:80); c++; }
    return { dur: Math.min(1.6, c? (d/c)/900 : 0.5), vel: Math.min(1, c? (v/c)/110 : 0.7) };
  };
  // deep night ground tinted by the piece's opening chord — the signature dark
  const g0 = chordCol(0, 0.16);
  ctx.fillStyle = `rgb(${(g0[0]*0.5+6)|0},${(g0[1]*0.5+5)|0},${(g0[2]*0.5+12)|0})`;
  ctx.fillRect(0,0,CW,CH);

  const _pn=_capN(7); const pick=((phaseIndex|0)%_pn+_pn)%_pn;
  const cx=CW/2, cy=CH*(0.44+0.14*dnaR);               // register pulls the heart

  // ═══════════════ RafFel — active phase set (6) ═══════════════
  // pick 0=Niť(Lissajous) 1=Súhvezdie 2=Mriežka 3=Sieť 4=Vlna 5=Vejár.
  // The old phases are kept below, parked at pick===90x, in case we revisit.

  if(pick===0){
    // — 0 · NIŤ — Lissajous whose shape comes from the song's key + register —
    const A=S*0.42;
    // estimate the key: most common pitch class across the chords
    const _pcHist=new Array(12).fill(0);
    for(let i=0;i<cn;i++){ const chd=chords[i]; const nn=(chd&&(chd.n||chd.notes))||[];
      for(const nt of nn){ const mm=nt.m!==undefined?nt.m:nt; _pcHist[((Math.round(mm)%12)+12)%12]++; } }
    let _key=0,_best=-1; for(let p=0;p<12;p++){ if(_pcHist[p]>_best){ _best=_pcHist[p]; _key=p; } }
    const _FIF=[0,7,2,9,4,11,6,1,8,3,10,5]; const _slot=_FIF.indexOf(_key);
    // frequencies: fa from key position, fb from register — wide spread of shapes
    const fa = 2 + (_slot % 7);
    const fb = 2 + Math.round(dnaR*5);
    // phase from density/energy → opens loops into knots/stars; key adds offset
    const delta = (Math.PI/2)*(0.3 + dnaD*1.4) + _slot*0.13;
    const Ax = A*(0.85+0.15*dnaE), Ay = A*(0.85+0.15*(1-dnaE));
    const steps=Math.max(480, N*12);
    ctx.lineCap='round'; ctx.lineJoin='round';
    // gold underglow
    let prev=null;
    for(let s2=0;s2<=steps;s2++){ const t=s2/steps, tt=t*Math.PI*2;
      const x=cx+Math.sin(fa*tt+delta)*Ax, y=cy+Math.sin(fb*tt)*Ay;
      if(prev){ ctx.strokeStyle='rgba(201,168,76,.05)'; ctx.lineWidth=Math.max(3,S*0.011); ctx.beginPath(); ctx.moveTo(prev.x,prev.y); ctx.lineTo(x,y); ctx.stroke(); }
      prev={x,y};
    }
    // colour core (colour flows with the chords)
    prev=null;
    for(let s2=0;s2<=steps;s2++){ const t=s2/steps, idx=Math.min(N-1,(t*N)|0), col=chordCol(idx), m=chordMeta(idx), tt=t*Math.PI*2;
      const x=cx+Math.sin(fa*tt+delta)*Ax, y=cy+Math.sin(fb*tt)*Ay;
      if(prev){ ctx.strokeStyle=css(col, 0.55+0.3*m.vel); ctx.lineWidth=Math.max(1.3,S*0.0038); ctx.beginPath(); ctx.moveTo(prev.x,prev.y); ctx.lineTo(x,y); ctx.stroke(); }
      prev={x,y};
    }
    return;
  }

  if(pick===1){
    // — 1 · SÚHVEZDIE — chords on the circle of fifths; tetivy only between close ones —
    const R=S*0.40;
    const pts=[];
    for(let i=0;i<N;i++){
      const chord=chords[Math.min(cn-1,i)], notes=(chord&&(chord.n||chord.notes))||[];
      let pm=60; if(notes.length){ let s=0,c=0; for(const nt of notes){ const mm=nt.m!==undefined?nt.m:nt; s+=mm; c++; } pm=s/Math.max(1,c); }
      const pcv=((Math.round(pm)%12)+12)%12; const slot=[0,7,2,9,4,11,6,1,8,3,10,5].indexOf(pcv);
      const a=-Math.PI/2 + slot/12*Math.PI*2;
      const rr=R*(0.30+0.68*(i/Math.max(1,N-1)));
      pts.push({x:cx+Math.cos(a)*rr, y:cy+Math.sin(a)*rr, i, slot});
    }
    for(let i=1;i<pts.length;i++){ const d=Math.abs(pts[i].slot-pts[i-1].slot); if(!(d<=1||d>=11)) continue;
      const m=chordMeta(i); ctx.strokeStyle=css([201,168,76], 0.12+0.14*m.vel); ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(pts[i-1].x,pts[i-1].y); ctx.lineTo(pts[i].x,pts[i].y); ctx.stroke(); }
    for(const p of pts){ const m=chordMeta(p.i), col=chordCol(p.i); const rad=Math.max(1.2, S*0.003+m.dur*S*0.006);
      const g=ctx.createRadialGradient(p.x,p.y,0.4,p.x,p.y,rad*2.4);
      g.addColorStop(0, css(col.map(q=>Math.min(255,q*1.3+30)),0.95)); g.addColorStop(0.4, css(col,0.7)); g.addColorStop(1, css(col,0));
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,p.y,rad*2.4,0,7); ctx.fill();
      ctx.fillStyle=css([255,252,246], 0.55*m.vel+0.2); ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(0.8,rad*0.42),0,7); ctx.fill(); }
    return;
  }

  if(pick===920){
    // — 2 · MRIEŽKA — portrait golden rectangle, spiral through nested squares —
    let w=CW*0.72, h=w*PHI, x=(CW-w)/2, y=(CH-h)/2, dir=0; const cells=[]; const sqs=[];
    for(let k=0;k<12;k++){ const s=Math.min(w,h);
      if(dir===0){ sqs.push({cx:x, cy:y+s, r:s, a0:-Math.PI/2, a1:0}); cells.push({x, y, w, h:s, k}); y+=s; h-=s; }
      else if(dir===1){ sqs.push({cx:x, cy:y, r:s, a0:0, a1:Math.PI/2}); cells.push({x:x+w-s, y, w:s, h, k}); w-=s; }
      else if(dir===2){ sqs.push({cx:x+w, cy:y, r:s, a0:Math.PI/2, a1:Math.PI}); cells.push({x, y:y+h-s, w, h:s, k}); h-=s; }
      else { sqs.push({cx:x+w, cy:y+h, r:s, a0:Math.PI, a1:Math.PI*1.5}); cells.push({x, y, w:s, h, k}); x+=s; w-=s; }
      dir=(dir+1)%4; if(w<3||h<3) break; }
    // coloured field washes
    cells.forEach((c2,k)=>{ const cc=chordCol(Math.floor(k/Math.max(1,cells.length)*N)); const m=chordMeta(k);
      const g=ctx.createLinearGradient(c2.x,c2.y,c2.x+c2.w,c2.y+c2.h);
      g.addColorStop(0, css(cc, 0.10+0.14*m.vel)); g.addColorStop(1, css(cc, 0.02));
      ctx.fillStyle=g; ctx.fillRect(c2.x,c2.y,c2.w,c2.h); });
    // gold rectangle outlines
    ctx.strokeStyle='rgba(201,168,76,.30)'; ctx.lineWidth=1;
    cells.forEach(c2=>{ ctx.strokeRect(c2.x,c2.y,c2.w,c2.h); });
    // the golden spiral through the squares
    ctx.strokeStyle='rgba(201,168,76,.55)'; ctx.lineWidth=1.4; ctx.lineCap='round';
    for(const q of sqs){ ctx.beginPath(); ctx.arc(q.cx,q.cy,q.r,q.a0,q.a1); ctx.stroke(); }
    // coloured chord points distributed along the spiral
    let tot=0; for(const q of sqs) tot+=q.r*(Math.PI/2);
    for(let i=0;i<N;i++){ const m=chordMeta(i), col=chordCol(i);
      const t=i/Math.max(1,N-1); let d=t*tot, q=sqs[0];
      for(const s of sqs){ const sl=s.r*(Math.PI/2); if(d<=sl){ q=s; break; } d-=sl; }
      const sl=q.r*(Math.PI/2), fr=Math.max(0,Math.min(1,d/sl)), a=q.a0+(q.a1-q.a0)*fr;
      const px=q.cx+Math.cos(a)*q.r, py=q.cy+Math.sin(a)*q.r;
      ctx.fillStyle=css(col.map(qq=>Math.min(255,qq*1.25+25)), 0.9);
      ctx.beginPath(); ctx.arc(px,py, Math.max(1.4, S*0.0035+m.dur*S*0.005),0,7); ctx.fill(); }
    return;
  }

  if(pick===2){
    // — 3 · NIŤ — clean coloured lines along the golden-angle spiral —
    const C1 = S*0.0135*(0.9+0.35*dnaD);
    ctx.lineCap='round'; ctx.lineJoin='round';
    let px, py;
    for(let i=0;i<N;i++){
      const m=chordMeta(i), col=chordCol(i);
      const r=C1*Math.sqrt(i+1)*3.1, a=i*GA;
      const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
      if(i){
        ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(x,y);
        ctx.strokeStyle=css(col, 0.55+0.35*m.vel);
        ctx.lineWidth=Math.max(1, S*0.0016*(0.6+0.8*m.dur));
        ctx.stroke();
      }
      px=x; py=y;
    }
    return;
  }

  if(pick===3){
    // — 4 · VLNA — quiet soundwave: vertical bars on a baseline —
    const baseY=CH*(0.46+0.10*dnaR);
    ctx.strokeStyle='rgba(201,168,76,.18)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(CW*0.06,baseY); ctx.lineTo(CW*0.94,baseY); ctx.stroke();
    const span=CW*0.88, x0=CW*0.06;
    for(let i=0;i<N;i++){ const m=chordMeta(i), col=chordCol(i);
      const x=x0+(i/Math.max(1,N-1))*span;
      const chord=chords[Math.min(cn-1,i)], notes=(chord&&(chord.n||chord.notes))||[];
      let pm=60; if(notes.length){ const mm=notes[0].m!==undefined?notes[0].m:notes[0]; pm=mm; }
      const pcv=((Math.round(pm)%12)+12)%12; const dir=(pcv%2===0)?-1:1;
      const hgt=(S*0.04 + (pcv/11)*S*0.30)*(0.5+0.5*m.dur);
      ctx.strokeStyle=css(col, 0.6+0.3*m.vel); ctx.lineWidth=Math.max(1.4, span/N*0.5); ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(x,baseY); ctx.lineTo(x,baseY+dir*hgt); ctx.stroke();
      ctx.fillStyle=css(col.map(q=>Math.min(255,q*1.3+30)), 0.9); ctx.beginPath(); ctx.arc(x,baseY+dir*hgt, Math.max(1, span/N*0.3),0,7); ctx.fill(); }
    return;
  }

  if(pick===4){
    // — 5 · VEJÁR — rays radiating at the golden angle, length = duration —
    const fcy=CH*(0.52+0.10*dnaR);
    for(let i=0;i<N;i++){ const m=chordMeta(i), col=chordCol(i); const a=i*GA - Math.PI/2;
      const r0=S*0.03, r1=r0+(S*0.10+m.dur*S*0.32);
      const x0=cx+Math.cos(a)*r0, y0=fcy+Math.sin(a)*r0, x1=cx+Math.cos(a)*r1, y1=fcy+Math.sin(a)*r1;
      ctx.strokeStyle=css(col, 0.4+0.35*m.vel); ctx.lineWidth=Math.max(1, S*0.0016); ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
      ctx.fillStyle=css(col.map(q=>Math.min(255,q*1.3+30)), 0.85); ctx.beginPath(); ctx.arc(x1,y1, Math.max(1, S*0.004*m.vel+1),0,7); ctx.fill(); }
    return;
  }

  if(pick===5){
    // — 6 · VLNENIE — interference field (coarse cells for mobile) —
    const srcs=[];
    const stride=Math.max(1, Math.ceil(N/28));
    for(let i=0;i<N;i+=stride){
      const m=chordMeta(i), col=chordCol(i);
      const r=S*0.012*Math.sqrt(i+1)*3.0, a=i*GA;
      const _mid=(col[0]+col[1]+col[2])/3;
      const colS=[0,1,2].map(q=>Math.max(0,Math.min(255,_mid+(col[q]-_mid)*1.7)));
      srcs.push({x:cx+Math.cos(a)*r, y:cy+Math.sin(a)*r, col:colS,
                 f:(15.7+22.4*Math.min(1.6,m.dur))/S, amp:(0.4+0.6*m.vel)*(0.75+0.5*dnaE)});
    }
    const cell=Math.max(5, Math.round(S/170));
    const cut2=(S*0.42)*(S*0.42);
    for(let y=0;y<CH;y+=cell){
      for(let x=0;x<CW;x+=cell){
        let R=0,G=0,B=0,w=0;
        for(const s2 of srcs){
          const dx=x-s2.x, dy=y-s2.y, d2=dx*dx+dy*dy;
          if(d2>cut2) continue;
          const d=Math.sqrt(d2);
          const ww=Math.max(0, Math.cos(d*s2.f)) * s2.amp * Math.exp(-d/(S*0.42));
          if(ww<=0.002) continue;
          R+=ww*s2.col[0]; G+=ww*s2.col[1]; B+=ww*s2.col[2]; w+=ww;
        }
        if(w<=0.02) continue;
        const k=Math.min(1,w*0.9);
        ctx.fillStyle=`rgb(${Math.min(255,R/w*k)|0},${Math.min(255,G/w*k)|0},${Math.min(255,B/w*k)|0})`;
        ctx.fillRect(x,y,cell,cell);
      }
    }
    return;
  }


  if(pick===6){
    // — 7 · KOMPOZÍCIA — scattered points joined into a coloured graph —
    // Deterministic scatter seeded from the piece, so it's stable per song.
    const rnd2=_seedRnd(137, ss, 1, 0);
    const pts=[];
    for(let i=0;i<N;i++){ const m=chordMeta(i), col=chordCol(i);
      const a=i*GA + (rnd2()-0.5)*0.6;
      const rad=Math.sqrt(rnd2())*S*0.46;
      let x=cx+Math.cos(a)*rad*(0.7+0.6*rnd2()), y=cy+Math.sin(a)*rad;
      x=Math.max(CW*0.05,Math.min(CW*0.95,x)); y=Math.max(CH*0.05,Math.min(CH*0.95,y));
      pts.push({x,y,i,m,col});
    }
    // main thread: connect chords in play order
    ctx.lineCap='round'; ctx.lineJoin='round';
    for(let i=1;i<pts.length;i++){ const p=pts[i];
      ctx.strokeStyle=css(p.col, 0.4+0.3*p.m.vel); ctx.lineWidth=Math.max(1, S*0.0016*(0.6+0.7*p.m.dur));
      ctx.beginPath(); ctx.moveTo(pts[i-1].x,pts[i-1].y); ctx.lineTo(p.x,p.y); ctx.stroke(); }
    // short branches to the single nearest neighbour (faint)
    for(let i=0;i<pts.length;i++){ const p=pts[i]; let best=-1, bd=1e18;
      for(let j=0;j<pts.length;j++){ if(j===i) continue; const d=(pts[j].x-p.x)**2+(pts[j].y-p.y)**2; if(d<bd){ bd=d; best=j; } }
      if(best>=0){ ctx.strokeStyle=css(p.col, 0.12); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(pts[best].x,pts[best].y); ctx.stroke(); } }
    // coloured nodes
    for(const p of pts){ ctx.fillStyle=css(p.col, 0.92);
      ctx.beginPath(); ctx.arc(p.x,p.y, Math.max(1.4, S*0.0035+p.m.dur*S*0.005),0,7); ctx.fill(); }
    return;
  }


  // ── parked: original phases below (reachable only via pick===90x) ──


  if(pick===900){
    // ── 0 · KVET — phyllotaxis bloom ────────────────────────────────────────
    const C = S*0.0135*(0.9+0.35*dnaD);                // radial pitch of the spiral
    // golden thread first (under the petals)
    ctx.strokeStyle='rgba(201,168,76,.20)'; ctx.lineWidth=Math.max(1,S*0.0011);
    ctx.beginPath();
    for(let i=0;i<N;i++){ const r=C*Math.sqrt(i+1)*3.1,a=i*GA;
      const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r; i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
    ctx.stroke();
    for(let i=0;i<N;i++){
      const m=chordMeta(i), col=chordCol(i);
      const r=C*Math.sqrt(i+1)*3.1, a=i*GA;
      const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
      const size=(S*0.0022+m.dur*S*0.004)*(0.6+0.4*Math.sqrt((i+1)/cn));
      ctx.fillStyle=css(col, 0.5+0.18*m.vel);
      ctx.beginPath(); ctx.arc(x,y, Math.max(0.9,size), 0,7); ctx.fill();
    }
    return;
  }

  if(pick===901){
    // — 1 · NIŤ — clean coloured lines along the golden-angle spiral, no petals
    const C1 = S*0.0135*(0.9+0.35*dnaD);
    ctx.lineCap='round'; ctx.lineJoin='round';
    let px, py;
    for(let i=0;i<N;i++){
      const m=chordMeta(i), col=chordCol(i);
      const r=C1*Math.sqrt(i+1)*3.1, a=i*GA;
      const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
      if(i){
        ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(x,y);
        ctx.strokeStyle=css(col, 0.55+0.35*m.vel);
        ctx.lineWidth=Math.max(1, S*0.0016*(0.6+0.8*m.dur));
        ctx.stroke();
      }
      px=x; py=y;
    }
    return;
  }

  if(pick===902){
    // ── 2 · PRSTENCE — orbits: radius = fifths ladder, angle = time ─────────
    const FIF=[0,7,2,9,4,11,6,1,8,3,10,5];
    const rings=12, r0=S*0.065, rStep=S*0.033;
    ctx.strokeStyle='rgba(201,168,76,.07)'; ctx.lineWidth=1;
    for(let k=0;k<rings;k++){ ctx.beginPath(); ctx.arc(cx,cy,r0+k*rStep,0,7); ctx.stroke(); }
    ctx.globalCompositeOperation='lighter';
    for(let i=0;i<N;i++){
      const m=chordMeta(i), col=chordCol(i);
      const chord=chords[i], notes=chord&&(chord.n||chord.notes)||[];
      const pc=notes.length?(((notes[0].m!==undefined?notes[0].m:notes[0])%12)+12)%12:0;
      const ring=FIF.indexOf(pc);
      const r=r0+ring*rStep;
      const a0=(i/cn)*Math.PI*2-Math.PI/2;
      const sweep=0.08+m.dur*0.45;
      const width=(S*0.005+m.dur*S*0.012)*(0.55+0.45*m.vel)*(0.75+0.5*dnaE);
      ctx.strokeStyle=css(col, 0.10+0.13*m.vel); ctx.lineWidth=width*2.4; ctx.lineCap='round';
      ctx.beginPath(); ctx.arc(cx,cy,r,a0,a0+sweep); ctx.stroke();
      ctx.strokeStyle=css(col.map(q=>Math.min(255,q*1.25+25)), 0.85); ctx.lineWidth=width;
      ctx.beginPath(); ctx.arc(cx,cy,r,a0,a0+sweep); ctx.stroke();
      const hx=cx+Math.cos(a0+sweep)*r, hy=cy+Math.sin(a0+sweep)*r;
      ctx.fillStyle=css([245,240,228], 0.8*m.vel+0.1);
      ctx.beginPath(); ctx.arc(hx,hy,Math.max(1.3,width*0.42),0,7); ctx.fill();
    }
    ctx.globalCompositeOperation='source-over';
    ctx.strokeStyle='rgba(201,168,76,.5)'; ctx.lineWidth=Math.max(1,S*0.0013);
    ctx.beginPath(); ctx.arc(cx,cy,S*0.013,0,7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx,cy-S*0.02); ctx.lineTo(cx,cy+S*0.02); ctx.stroke();
    return;
  }

  if(pick===903){
    // ── 3 · VLNENIE — interference field (coarse cells for mobile) ──────────
    const srcs=[];
    const stride=Math.max(1, Math.ceil(N/28));         // cap sources ≈28
    for(let i=0;i<N;i+=stride){
      const m=chordMeta(i), col=chordCol(i);
      const r=S*0.012*Math.sqrt(i+1)*3.0, a=i*GA;
      // saturate: chord-averaged gc colours are too muted for an additive
      // wave field — without the boost the interference reads as muddy blobs
      const _mid=(col[0]+col[1]+col[2])/3;
      const colS=[0,1,2].map(q=>Math.max(0,Math.min(255,_mid+(col[q]-_mid)*1.7)));
      // wavelength scales WITH the canvas (f·S constant, mockup ratios):
      // at any resolution the ring pattern matches the approved mockup.
      srcs.push({x:cx+Math.cos(a)*r, y:cy+Math.sin(a)*r, col:colS,
                 f:(15.7+22.4*Math.min(1.6,m.dur))/S, amp:(0.4+0.6*m.vel)*(0.75+0.5*dnaE)});
    }
    const cell=Math.max(5, Math.round(S/170));
    const cut2=(S*0.42)*(S*0.42);
    for(let y=0;y<CH;y+=cell){
      for(let x=0;x<CW;x+=cell){
        let R=0,G=0,B=0,w=0;
        for(const s2 of srcs){
          const dx=x-s2.x, dy=y-s2.y, d2=dx*dx+dy*dy;
          if(d2>cut2) continue;
          const d=Math.sqrt(d2);
          const ww=Math.max(0, Math.cos(d*s2.f)) * s2.amp * Math.exp(-d/(S*0.42));
          if(ww<=0.002) continue;
          R+=ww*s2.col[0]; G+=ww*s2.col[1]; B+=ww*s2.col[2]; w+=ww;
        }
        if(w<=0.02) continue;
        const k=Math.min(1,w*0.9);
        ctx.fillStyle=`rgb(${Math.min(255,R/w*k)|0},${Math.min(255,G/w*k)|0},${Math.min(255,B/w*k)|0})`;
        ctx.fillRect(x,y,cell,cell);
      }
    }
    return;
  }

  if(pick===904){
    // ── 4 · DYCH — one soft colour stratum per phrase ───────────────────────
    const PH_N=13, phrases=[];
    for(let s2=0;s2<N;s2+=PH_N) phrases.push([s2, Math.min(N,s2+PH_N)]);
    ctx.globalCompositeOperation='lighter';
    const total=Math.max(1, Math.ceil(cn/PH_N));
    phrases.forEach((ph,pi)=>{
      // phrase colour = mean of its chord colours; energy = mean velocity
      let R=0,G=0,B=0,E=0,c=0;
      for(let i=ph[0];i<ph[1];i++){ const col=chordCol(i); const m=chordMeta(i);
        R+=col[0];G+=col[1];B+=col[2];E+=m.vel;c++; }
      if(!c) return;
      const col=[R/c,G/c,B/c], energy=E/c;
      const y0=(pi/total)*CH, bandH=(CH/total)*PHI;
      for(let k=0;k<3;k++){
        const yy=y0+bandH*(0.2+0.3*k)+(rnd()-0.5)*CH*0.035;
        const g=ctx.createRadialGradient(CW*(0.3+rnd()*0.4), yy, 8, CW/2, yy, CW*0.75);
        g.addColorStop(0, css(col, (0.13+0.10*energy)*(0.75+0.5*dnaE)));
        g.addColorStop(1, css(col, 0));
        ctx.fillStyle=g;
        ctx.fillRect(0, yy-bandH*0.9, CW, bandH*1.8);
      }
    });
    ctx.globalCompositeOperation='source-over';
    // breathing grain
    ctx.globalAlpha=0.05;
    for(let i=0;i<120;i++){
      const x=rnd()*CW;
      ctx.strokeStyle='#f2eee8'; ctx.lineWidth=0.7;
      ctx.beginPath(); ctx.moveTo(x, rnd()*CH); ctx.lineTo(x+(rnd()-0.5)*8, rnd()*CH); ctx.stroke();
    }
    ctx.globalAlpha=1;
    return;
  }

  // ── 5 · RIEKA — time flows left→right, pitch = altitude ───────────────────
  if(pick===905){
    const FIF=[0,7,2,9,4,11,6,1,8,3,10,5];
    ctx.globalCompositeOperation='lighter';
    let ladder=0; const laneY=[];
    for(let i=0;i<cn;i++){
      const chord=chords[i], notes=chord&&(chord.n||chord.notes)||[];
      const pc=notes.length?(((notes[0].m!==undefined?notes[0].m:notes[0])%12)+12)%12:0;
      ladder = ladder*0.72 + (FIF.indexOf(pc)/11 - 0.5)*0.28;
      laneY.push(CH*(0.42+0.16*dnaR) + ladder*CH*0.62);
    }
    for(let i=0;i<N;i++){
      const m=chordMeta(i), col=chordCol(i);
      const x0=CW*0.035 + (i/Math.max(1,cn-1))*(CW*0.88);
      const len=S*0.05+m.dur*S*0.20, width=(S*0.007+m.dur*S*0.026)*(0.5+0.5*m.vel)*(0.75+0.5*dnaE);
      const y0=laneY[i];
      ctx.beginPath();
      const steps=14;
      for(let s2=0;s2<=steps;s2++){
        const t=s2/steps, x=x0+t*len;
        const y=y0 + Math.sin((x*0.011*(720/S))+i*GA)*S*0.016*(1-t*0.4) + Math.sin(x*0.011*PHI*(720/S))*S*0.008;
        s2?ctx.lineTo(x,y):ctx.moveTo(x,y);
      }
      ctx.strokeStyle=css(col, 0.10+0.10*m.vel);
      ctx.lineWidth=width; ctx.lineCap='round'; ctx.stroke();
      ctx.strokeStyle=css(col.map(q=>Math.min(255,q*1.3+30)), 0.35*m.vel+0.1);
      ctx.lineWidth=Math.max(1.4,width*0.22); ctx.stroke();
    }
    ctx.globalCompositeOperation='source-over';
    return;
  }

  // ── 6 · KVÍNTY — chords mapped on the circle of fifths, gold chords between them ──
  if(pick===906){
    const FIF=[0,7,2,9,4,11,6,1,8,3,10,5];
    const R=S*0.40;
    // faint gold reference ring + 12 tone ticks
    ctx.strokeStyle='rgba(201,168,76,.14)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.stroke();
    for(let t=0;t<12;t++){ const a=-Math.PI/2 + t/12*Math.PI*2;
      ctx.strokeStyle='rgba(201,168,76,.24)';
      ctx.beginPath(); ctx.moveTo(cx+Math.cos(a)*R*0.96,cy+Math.sin(a)*R*0.96); ctx.lineTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R); ctx.stroke(); }
    // chord pitch → circle-of-fifths slot; time pulls radius outward
    const pts=[];
    for(let i=0;i<N;i++){
      const chord=chords[Math.min(cn-1,i)]; const notes=(chord&&(chord.n||chord.notes))||[];
      let pm=60; if(notes.length){ let s=0,c=0; for(const nt of notes){ const m=nt.m!==undefined?nt.m:nt; s+=m; c++; } pm=s/Math.max(1,c); }
      const pcv=((Math.round(pm)%12)+12)%12; const slot=FIF.indexOf(pcv);
      const a=-Math.PI/2 + slot/12*Math.PI*2;
      const rr=R*(0.60+0.36*(i/Math.max(1,N-1)));
      pts.push({x:cx+Math.cos(a)*rr, y:cy+Math.sin(a)*rr, i});
    }
    // gold tetivy between consecutive chords
    for(let i=1;i<pts.length;i++){ const m=chordMeta(i);
      ctx.strokeStyle=css([201,168,76], 0.09+0.11*m.vel); ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(pts[i-1].x,pts[i-1].y); ctx.lineTo(pts[i].x,pts[i].y); ctx.stroke(); }
    // coloured nodes
    for(const p of pts){ const m=chordMeta(p.i), col=chordCol(p.i);
      ctx.fillStyle=css(col, 0.9); ctx.beginPath(); ctx.arc(p.x,p.y, Math.max(1.4, S*0.004+m.dur*S*0.006), 0,7); ctx.fill(); }
    return;
  }

  // ── 7 · φ — nested golden rectangles + Fibonacci spiral of coloured points ──
  if(pick===907){
    // Build the nested golden squares; remember each square so the spiral fits them.
    let x=CW*0.12, y=CH*0.20, w=CW*0.76, h=w/PHI, dir=0;
    const sqs=[];
    ctx.strokeStyle='rgba(201,168,76,.18)'; ctx.lineWidth=1;
    for(let k=0;k<11;k++){
      ctx.strokeRect(x,y,w,h);
      const s=Math.min(w,h);
      // the square carved off this step, plus which corner the quarter-arc turns around
      if(dir===0){ sqs.push({cx:x+s, cy:y+s, r:s, a0:Math.PI, a1:Math.PI*1.5}); x+=s; w-=s; }
      else if(dir===1){ sqs.push({cx:x+ (w-h>=0? (w- s):0) + 0, cy:y+s, r:s, a0:Math.PI*1.5, a1:Math.PI*2}); y+=s; h-=s; }
      else if(dir===2){ w-=s; sqs.push({cx:x+w, cy:y, r:s, a0:0, a1:Math.PI*0.5}); }
      else { h-=s; sqs.push({cx:x, cy:y+h, r:s, a0:Math.PI*0.5, a1:Math.PI}); }
      dir=(dir+1)%4; if(w<4||h<4) break;
    }
    // Draw the true golden spiral (quarter-arc per square) as a faint gold guide.
    ctx.strokeStyle='rgba(201,168,76,.5)'; ctx.lineWidth=1.3; ctx.lineCap='round';
    for(const q of sqs){ ctx.beginPath(); ctx.arc(q.cx,q.cy,q.r,q.a0,q.a1); ctx.stroke(); }
    // Place chord points evenly ALONG that spiral so they sit on the curve.
    // Concatenate arcs; distribute i across total arc-length by square radius.
    let totLen=0; for(const q of sqs) totLen+=q.r*(Math.PI/2);
    for(let i=0;i<N;i++){ const m=chordMeta(i), col=chordCol(i);
      const t=i/Math.max(1,N-1); let d=t*totLen; let q=sqs[0];
      for(const s of sqs){ const segLen=s.r*(Math.PI/2); if(d<=segLen){ q=s; break; } d-=segLen; }
      const segLen=q.r*(Math.PI/2); const frac=Math.max(0,Math.min(1,d/segLen));
      const a=q.a0+(q.a1-q.a0)*frac;
      const px=q.cx+Math.cos(a)*q.r, py=q.cy+Math.sin(a)*q.r;
      ctx.fillStyle=css(col, 0.92); ctx.beginPath();
      ctx.arc(px,py, Math.max(1.4, S*0.0035+m.dur*S*0.006), 0,7); ctx.fill();
    }
    return;
  }

  // ── 8 · LISSAJOUS — one continuous curve, colour flows with the tones ──
  if(pick===908){
    const A=S*0.42;
    const fa=2+Math.round(dnaE*3), fb=1+Math.round(dnaD*3), delta=Math.PI/2*(0.5+dnaR);
    const steps=Math.max(240, N*8);
    ctx.lineCap='round'; ctx.lineJoin='round';
    let prev=null;
    for(let s2=0;s2<=steps;s2++){
      const t=s2/steps; const idx=Math.min(N-1, (t*N)|0);
      const col=chordCol(idx), m=chordMeta(idx);
      const tt=t*Math.PI*2;
      const px=cx+Math.sin(fa*tt+delta)*A;
      const py=cy+Math.sin(fb*tt)*A;
      if(prev){ ctx.strokeStyle=css(col, 0.5+0.32*m.vel); ctx.lineWidth=Math.max(1, S*0.0016);
        ctx.beginPath(); ctx.moveTo(prev.x,prev.y); ctx.lineTo(px,py); ctx.stroke(); }
      prev={x:px,y:py};
    }
    return;
  }

}

function drawSpiralOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  const ss = sessionSeed | 0;
  const cn = chords.length;
  const rnd = _seedRnd(91, ss, 0, 0);

  function chordCol(i, mul){
    const idx = Math.min(cn-1, Math.max(0, i % cn));
    const chord = chords[idx];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes);
    if(!notes || !notes.length) return [200,150,120];
    let R=0,G=0,B=0,c=0;
    for(const note of notes){
      const m = note.m!==undefined?note.m:note;
      const v = note.v!==undefined?note.v:80;
      const [r,g,b] = gc(m, v); R+=r; G+=g; B+=b; c++;
    }
    const k = mul===undefined?1:mul;
    return [Math.min(255,R/c*k), Math.min(255,G/c*k), Math.min(255,B/c*k)];
  }
  const css = (c,a)=> a===undefined ? `rgb(${c[0]|0},${c[1]|0},${c[2]|0})` : `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;

  // Warm ground sampled from the piece (Hilma's ochre/peach fields).
  const warm = chordCol(0, 0.55);
  ctx.fillStyle = `rgb(${Math.min(255,warm[0]+90)|0},${Math.min(255,warm[1]+55)|0},${Math.min(255,warm[2]+30)|0})`;
  ctx.fillRect(0, 0, CW, CH);

  const revealFrac = Math.max(0, Math.min(1, lim / cn));
  // ── 6-VARIANT CHOOSER (stable per painting, re-rolls on Vary) ──
  //  0/1 = Spiral / Radiant mandala (original body below, via `mandala`).
  //  2 = Ten Largest (stacked ovoid forms).  3 = The Swan (split field + swans, recoloured).
  //  4 = Altarpiece pyramid (triangle + disc).  5 = Botanical (symmetric plant chart).
  let _klintMandala = false;
  {
    const _pn=_capN(6); const _kpick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_kpick===2){ klintPhaseTen(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_kpick===3){ klintPhaseSwan(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_kpick===4){ klintPhaseAltar(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_kpick===5){ klintPhaseBotanical(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // variant 0 = spiral, variant 1 = radiant mandala — DETERMINISTIC per index
    // so the two looks are independent (previously both fell through to a coin
    // flip, which made them interchangeable instead of distinct styles).
    _klintMandala = (_kpick===1);
  }
  const mandala = _klintMandala;

  // Draw a snail-spiral.
  function snail(cx, cy, rMax, turns, col, lw){
    ctx.strokeStyle = css(col, 0.9);
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const steps = Math.max(20, turns*30);
    for(let s=0; s<=steps; s++){
      const t = s/steps;
      const ang = t * turns * Math.PI*2;
      const r = t * rMax;
      const x = cx + Math.cos(ang)*r;
      const y = cy + Math.sin(ang)*r;
      if(s===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  // Draw a petal-flower (ring of ellipses around a centre).
  function flower(cx, cy, r, petals, col, colC){
    for(let p=0; p<petals; p++){
      const ang = (p/petals)*Math.PI*2;
      const px = cx + Math.cos(ang)*r*0.55;
      const py = cy + Math.sin(ang)*r*0.55;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      ctx.fillStyle = css(col, 0.85);
      ctx.beginPath();
      ctx.ellipse(0, 0, r*0.5, r*0.26, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = css(colC, 0.95);
    ctx.beginPath(); ctx.arc(cx, cy, r*0.28, 0, Math.PI*2); ctx.fill();
  }
  // Concentric circles.
  function rings(cx, cy, rMax, n, baseIdx){
    for(let k=n; k>=1; k--){
      const col = chordCol(baseIdx+k, (k&1)?1.0:0.78);
      ctx.fillStyle = css(col, 0.9);
      ctx.beginPath(); ctx.arc(cx, cy, rMax*(k/n), 0, Math.PI*2); ctx.fill();
    }
  }

  if(mandala){
    // ── Mandala: big segmented disc + ray crown + descending column ──────────
    // Per-song variance — off-centre + R + ray count multiplier.
    const cx = CW * (0.45 + rnd()*0.10);
    const cy = CH * (0.28 + rnd()*0.10);
    const R = Math.min(CW, CH) * (0.26 + rnd()*0.10);
    // Ray crown — count grows for very long pieces AND with song character: a
    // dense, energetic piece blooms a denser, more radiant crown; a calm one
    // stays serene. The radiance is the mandala's pulse, so character belongs here.
    const _chKl = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
    const _klDrive = _chKl ? (0.55*_chKl.energy + 0.45*_chKl.density) : 0.5;
    const raysBase = cn<=120 ? 36 : cn<=300 ? 48 : cn<=600 ? 60 : 72;
    const rays = Math.max(24, Math.round(raysBase * (0.85 + rnd()*0.30) * (0.82 + 0.42*_klDrive)));
    const visRays = Math.ceil(revealFrac * rays);
    for(let i=0; i<visRays; i++){
      const ang = (i/rays)*Math.PI*2 - Math.PI/2;
      const col = chordCol(i, 1.0);
      ctx.fillStyle = css(col, 0.85);
      const r0 = R*1.02, r1 = R*1.35;
      const w = (Math.PI*2/rays)*0.4;
      ctx.beginPath();
      ctx.moveTo(cx+Math.cos(ang-w)*r0, cy+Math.sin(ang-w)*r0);
      ctx.lineTo(cx+Math.cos(ang)*r1, cy+Math.sin(ang)*r1);
      ctx.lineTo(cx+Math.cos(ang+w)*r0, cy+Math.sin(ang+w)*r0);
      ctx.closePath(); ctx.fill();
    }
    // Golden disc
    const disc = chordCol(0, 1.1);
    ctx.fillStyle = css([Math.min(255,disc[0]+40), Math.min(255,disc[1]+20), disc[2]], 1);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fill();
    // Descending column of small rings (chakra ladder)
    const cols = cn<=8?6:cn<=24?10:cn<=60?16:cn<=120?22:cn<=300?32:cn<=600?44:56;
    const visCols = Math.ceil(revealFrac*cols);
    const colTop = cy + R*1.0;
    const colBot = CH*0.98;
    for(let i=0; i<visCols; i++){
      const t = i/(cols-1);
      const y = colTop + t*(colBot-colTop);
      const halfW = (CW*0.06) + t*(CW*0.34);
      const col = chordCol(i+1, (i&1)?1.0:0.8);
      ctx.fillStyle = css(col, 0.7);
      ctx.fillRect(cx-halfW, y, halfW*2, (colBot-colTop)/cols*0.9);
      // small mandala dot in centre
      const dot = chordCol(i+3, 1.15);
      ctx.fillStyle = css(dot, 0.95);
      ctx.beginPath(); ctx.arc(cx, y+(colBot-colTop)/cols*0.45, Math.min(10, halfW*0.18), 0, Math.PI*2); ctx.fill();
    }
  } else {
    // ── Floating forms: flowers, circles, spirals scattered on warm field ────
    const FORMS = _adaptiveMax(cn, 'spiral');
    const visForms = Math.ceil(revealFrac * FORMS);
    // stable positions
    const forms = [];
    for(let i=0;i<FORMS;i++){
      forms.push({
        x: CW*(0.1+rnd()*0.8),
        y: CH*(0.08+rnd()*0.84),
        r: Math.min(CW,CH)*(0.06+rnd()*0.13),
        kind: rnd(), // <0.34 flower, <0.67 rings, else spiral
        ci: i,
        petals: 5+Math.floor(rnd()*5),
        turns: 2+rnd()*3,
      });
    }
    // thin connecting curves first (behind)
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for(let i=1;i<visForms;i++){
      const a=forms[i-1], b=forms[i];
      ctx.beginPath();
      ctx.moveTo(a.x,a.y);
      ctx.quadraticCurveTo((a.x+b.x)/2 + (rnd()-0.5)*60, (a.y+b.y)/2, b.x, b.y);
      ctx.stroke();
    }
    for(let i=0;i<visForms;i++){
      const f = forms[i];
      const col = chordCol(f.ci, 1.0);
      const colC = chordCol(f.ci+2, 1.15);
      if(f.kind < 0.34){
        flower(f.x, f.y, f.r, f.petals, col, colC);
      } else if(f.kind < 0.67){
        rings(f.x, f.y, f.r, 3+Math.floor(rnd()*3), f.ci);
      } else {
        // filled pale disc behind spiral for contrast
        ctx.fillStyle = css(col, 0.4);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI*2); ctx.fill();
        snail(f.x, f.y, f.r*0.95, f.turns, colC, 1.5+rnd()*2);
      }
    }
  }
}

// ── af Klint C: Ten Largest — stacked ovoid forms with spirals on pale ground. ──
function klintPhaseTen(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  ctx.fillStyle=isBW?'#dcd6cc':'#e8dcc8';ctx.fillRect(0,0,CW,CH);
  const forms=Math.max(3,Math.min(30,Math.round(cn/4)));
  const vis=Math.max(1,Math.ceil(N/cn*forms));
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+4500,ss,0,0);
    const {rgb,energy}=_picChord(chords,Math.floor(i*(cn/forms)),gc,isBW);
    const x=rnd()*CW,y=rnd()*CH,R=Math.min(CW,CH)*(0.05+energy*0.10);
    // Per-form shape kind (oval / circle / hexagon).
    const shapeKind = Math.floor(rnd()*3);
    // Per-form inner pattern kind (spiral / concentric rings / radiating).
    const innerKind = Math.floor(rnd()*3);

    ctx.fillStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.7)`;
    if(shapeKind === 0){
      // Ovoid (original).
      ctx.beginPath();ctx.ellipse(x,y,R*0.8,R,0,0,Math.PI*2);ctx.fill();
    } else if(shapeKind === 1){
      // Circle.
      ctx.beginPath();ctx.arc(x,y,R,0,Math.PI*2);ctx.fill();
    } else {
      // Hexagon.
      ctx.beginPath();
      for(let h=0;h<6;h++){
        const a = (h/6)*Math.PI*2;
        const hx = x + Math.cos(a)*R, hy = y + Math.sin(a)*R;
        if(h===0) ctx.moveTo(hx,hy); else ctx.lineTo(hx,hy);
      }
      ctx.closePath();ctx.fill();
    }

    ctx.strokeStyle=`rgba(${255-rgb[0]},${255-rgb[1]},${255-rgb[2]},0.7)`;
    ctx.lineWidth=Math.max(1.5,R*0.08);
    if(innerKind === 0){
      // Inner snail spiral (original).
      ctx.beginPath();let pr=0,pa=0;
      for(let t=0;t<24;t++){pa=t*0.5;pr=R*0.7*(t/24);const px=x+Math.cos(pa)*pr,py=y+Math.sin(pa)*pr;t?ctx.lineTo(px,py):ctx.moveTo(px,py);}
      ctx.stroke();
    } else if(innerKind === 1){
      // Concentric rings.
      for(let ring=1;ring<=3;ring++){
        ctx.beginPath();
        ctx.arc(x, y, R*ring/4, 0, Math.PI*2);
        ctx.stroke();
      }
    } else {
      // Radiating rays.
      for(let ray=0;ray<6;ray++){
        const a = (ray/6)*Math.PI*2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x+Math.cos(a)*R*0.7, y+Math.sin(a)*R*0.7);
        ctx.stroke();
      }
    }
  }
}

// ── af Klint D: Swan abstract — split colour field with paired ovoid forms.
// Replaces the original literal swan silhouettes. Duality (light/dark, upper/
// lower) is preserved via the colour split + opposed ovoids; companion forms
// scatter around each main ovoid like Klint's Ten Largest vocabulary.
function klintPhaseSwan(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal=Math.max(0,Math.min(1,N/cn));
  const sR = _seedRnd(91, ss, 0, 31); sR(); sR();

  // Per-song decisions.
  const splitLine = 0.45 + sR()*0.10;                  // 45-55% horizon
  const upperX = 0.40 + sR()*0.20;                     // ovoid x offset
  const lowerX = 0.40 + sR()*0.20;
  const mainR = Math.min(CW,CH) * (0.16 + sR()*0.06);  // 16-22%
  const companionsPerSide = 4 + Math.floor(sR()*4);    // 4-7 each
  const withSpiral = sR() < 0.7;                       // inner spiral most songs

  // Split colour field — top light, bottom dark (duality).
  const top = _picChord(chords, 0, gc, isBW).rgb;
  const bot = _picChord(chords, Math.floor(cn/2)%cn, gc, isBW).rgb;
  ctx.fillStyle = isBW
    ? '#e8e4dc'
    : `rgb(${Math.min(255,top[0]+60)},${Math.min(255,top[1]+60)},${Math.min(255,top[2]+60)})`;
  ctx.fillRect(0, 0, CW, CH*splitLine);
  ctx.fillStyle = isBW
    ? '#2a2e3a'
    : `rgb(${Math.round(bot[0]*0.4)},${Math.round(bot[1]*0.4)},${Math.round(bot[2]*0.5+40)})`;
  ctx.fillRect(0, CH*splitLine, CW, CH*(1-splitLine));
  // Horizon line.
  ctx.strokeStyle = 'rgba(40,30,40,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, CH*splitLine);
  ctx.lineTo(CW, CH*splitLine);
  ctx.stroke();

  // Draw one ovoid with optional inner spiral.
  function drawOvoid(cx, cy, R, fillCol, strokeCol){
    ctx.fillStyle = fillCol;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R*0.85, R, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 2;
    ctx.stroke();
    if(withSpiral){
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = Math.max(1.5, R*0.06);
      ctx.beginPath();
      for(let t=0;t<32;t++){
        const pa = t*0.4;
        const pr = R*0.65*(t/32);
        const px = cx+Math.cos(pa)*pr;
        const py = cy+Math.sin(pa)*pr*1.15;
        if(t===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.stroke();
    }
  }

  // Upper bright ovoid (appears first with reveal).
  if(reveal > 0.1){
    const upR = mainR * Math.min(1, reveal*1.5);
    const upY = CH * splitLine * 0.65;
    drawOvoid(CW * upperX, upY, upR,
      `rgba(${Math.min(255,top[0]+90)|0},${Math.min(255,top[1]+85)|0},${Math.min(255,top[2]+70)|0},0.85)`,
      `rgba(${Math.round(bot[0]*0.3)},${Math.round(bot[1]*0.3)},${Math.round(bot[2]*0.4)},0.85)`);
  }
  // Lower dark ovoid (appears after upper).
  if(reveal > 0.4){
    const downR = mainR * Math.min(1, (reveal-0.3)*1.5);
    const downY = CH * splitLine + (CH * (1-splitLine)) * 0.5;
    drawOvoid(CW * lowerX, downY, downR,
      `rgba(${Math.round(bot[0]*0.5)},${Math.round(bot[1]*0.5)},${Math.round(bot[2]*0.6)},0.9)`,
      `rgba(${Math.min(255,top[0]+80)|0},${Math.min(255,top[1]+80)|0},${Math.min(255,top[2]+80)|0},0.85)`);
  }

  // Companion forms — small ovoids/circles scattered around each main one.
  // Count grows with reveal; chord-coloured.
  const visCompPerSide = Math.ceil(companionsPerSide * reveal);
  for(let side=0; side<2; side++){
    const mainCX = CW * (side===0 ? upperX : lowerX);
    const mainCY = side===0 ? CH*splitLine*0.65 : CH*splitLine + CH*(1-splitLine)*0.5;
    const isUpper = side === 0;
    for(let i=0;i<visCompPerSide;i++){
      const ang = (i/companionsPerSide)*Math.PI*2 + (side*Math.PI/6);
      const compR = mainR * (0.18 + (i%3)*0.04);
      const compX = mainCX + Math.cos(ang) * mainR * (1.5 + (i%2)*0.3);
      const compY = mainCY + Math.sin(ang) * mainR * 0.7;
      const {rgb} = _picChord(chords, (i + side*3 + 7)%cn, gc, isBW);
      const lift = isUpper ? 60 : -30;
      const cr = Math.max(0,Math.min(255, rgb[0]+lift));
      const cg = Math.max(0,Math.min(255, rgb[1]+lift));
      const cb = Math.max(0,Math.min(255, rgb[2]+lift));
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.7)`;
      ctx.beginPath();
      ctx.arc(compX, compY, compR, 0, Math.PI*2);
      ctx.fill();
    }
  }
}

// ── af Klint E: Altarpiece pyramid — triangle ascending to a disc on dark. ──
function klintPhaseAltar(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const sR = _seedRnd(91, ss, 0, 32); sR(); sR();
  ctx.fillStyle=isBW?'#1c1c22':'#16121e';ctx.fillRect(0,0,CW,CH);
  const reveal=Math.max(0,Math.min(1,N/cn));
  // Per-song variance: apex position, base width, disc size, step count.
  const apexX = CW * (0.42 + sR()*0.16);
  const apexY = CH * (0.08 + sR()*0.08);
  const baseHalfWidth = CW * (0.27 + sR()*0.08);
  const apex=[apexX, apexY];
  const bl=[CW*0.5-baseHalfWidth, CH*0.9];
  const br=[CW*0.5+baseHalfWidth, CH*0.9];
  const stepsBase = Math.max(4,Math.min(24,Math.round(cn/4)));
  const steps = Math.max(4, Math.round(stepsBase * (0.85 + sR()*0.30)));
  const vis=Math.max(1,Math.ceil(reveal*steps));
  for(let i=vis-1;i>=0;i--){
    const t=i/steps;
    const {rgb}=_picChord(chords,Math.floor(i*(cn/steps)),gc,isBW);
    const lx=apex[0]+(bl[0]-apex[0])*t, ly=apex[1]+(bl[1]-apex[1])*t;
    const rx=apex[0]+(br[0]-apex[0])*t, ry=apex[1]+(br[1]-apex[1])*t;
    ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.beginPath();ctx.moveTo(apex[0],apex[1]);ctx.lineTo(lx,ly);ctx.lineTo(rx,ry);ctx.closePath();ctx.fill();
  }
  // Golden disc — variable size.
  if(reveal>0.2){
    const discR = Math.min(CW,CH) * (0.04 + sR()*0.04);
    ctx.fillStyle=isBW?'#d8d4c8':'#e8c84a';
    ctx.beginPath();ctx.arc(apex[0],apex[1],discR,0,Math.PI*2);ctx.fill();
  }
}

// ── af Klint F: Botanical — painterly-mystical botany (v2). Keeps her
// diagram DNA but reads as a painting: curved asymmetric stems at varied
// heights with organic spacing, watercolor-translucent leaves, af Klint
// vocabulary at the tips (spiral / concentric-ring "fruit"), soft wash
// ground + a large horizon arc (her mystical geometry).
function klintPhaseBotanical(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const sRoot = _seedRnd(91, ss, 0, 33); sRoot(); sRoot();
  // Soft wash ground.
  const gw = ctx.createRadialGradient(CW*0.5, CH*0.42, CW*0.1, CW*0.5, CH*0.5, Math.max(CW,CH)*0.75);
  gw.addColorStop(0, isBW ? '#e9e5da' : '#f5efdd');
  gw.addColorStop(1, isBW ? '#d8d4c8' : '#e6dcc2');
  ctx.fillStyle = gw; ctx.fillRect(0,0,CW,CH);
  // Horizon arc (mystical ground geometry).
  ctx.strokeStyle = isBW ? 'rgba(120,116,104,0.35)' : 'rgba(160,140,100,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(CW*0.5, CH*1.55, CH*0.75, 0, Math.PI*2); ctx.stroke();
  // Per-song stem count variance ±25%.
  const stemsBase=Math.max(2,Math.min(12,Math.round(cn/12)));
  const stems = Math.max(2, Math.round(stemsBase * (0.85 + sRoot()*0.30)));
  const vis=Math.max(1,Math.ceil(N/cn*stems));
  const sw=CW/Math.max(1,stems);
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+4600,ss,0,0);
    const {rgb}=_picChord(chords,Math.floor(i*(cn/stems)),gc,isBW);
    // Organic spacing (jitter breaks the column grid) + varied heights.
    const bx=i*sw+sw/2+(rnd()-0.5)*sw*0.55;
    const baseY=CH*(0.90+rnd()*0.04);
    const topY=CH*(0.18+rnd()*0.34);
    // Curved asymmetric stem (quadratic bow).
    const bowX=bx+(rnd()-0.5)*sw*1.1;
    const tipX=bx+(rnd()-0.5)*sw*0.4;
    ctx.strokeStyle=isBW?'rgba(80,90,70,0.75)':'rgba(70,105,80,0.75)';
    ctx.lineWidth=Math.max(1.6,sw*0.028); ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(bx,baseY);
    ctx.quadraticCurveTo(bowX,(baseY+topY)/2,tipX,topY);ctx.stroke();
    // Watercolor-translucent leaves, asymmetric along the bow.
    const nodes=3+((rnd()*4)|0);
    for(let nd=0;nd<nodes;nd++){
      const t=0.22+nd*0.62/nodes;
      const lx=bx+(bowX-bx)*2*t*(1-t)+(tipX-bx)*t*t;   // point on the quadratic
      const ly=baseY+(topY-baseY)*t;
      const side=((nd+i)%2)?1:-1;
      const r=sw*0.30*(1-t*0.45)*(0.8+rnd()*0.5);
      const ang=side*(0.45+rnd()*0.35);
      ctx.fillStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.35)`;
      ctx.beginPath();ctx.ellipse(lx+side*sw*0.16,ly,r,r*0.42,ang,0,Math.PI*2);ctx.fill();
      // faint vein
      ctx.strokeStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.35)`;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(lx,ly);ctx.lineTo(lx+side*sw*0.28*Math.cos(ang),ly+side*sw*0.10*Math.sin(ang));ctx.stroke();
    }
    // Tip: af Klint vocabulary — spiral or concentric-ring "fruit".
    if(i%2===0){
      ctx.strokeStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.8)`;ctx.lineWidth=2;
      ctx.beginPath();
      for(let s=0;s<26;s++){
        const aa=s*0.6, r2=sw*0.13*(1-s/26);
        const px=tipX+Math.cos(aa)*r2, py=topY-sw*0.10+Math.sin(aa)*r2;
        if(s===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
      }
      ctx.stroke();
    } else {
      const {rgb:rg2}=_picChord(chords,(Math.floor(i*(cn/stems))+3)%cn,gc,isBW);
      const rings=[[sw*0.14,0.8,rgb],[sw*0.09,0.6,rg2],[sw*0.045,0.9,rgb]];
      for(const [rr,op,cc] of rings){
        ctx.strokeStyle=`rgba(${cc[0]},${cc[1]},${cc[2]},${op})`;ctx.lineWidth=2.2;
        ctx.beginPath();ctx.arc(tipX,topY-sw*0.09,rr,0,Math.PI*2);ctx.stroke();
      }
    }
  }
}

// ── Gold (Gustav Klimt) ──────────────────────────────────────────────────────
// Klimt's "golden phase": a shimmering gold-leaf ground tiled with ornamental
// blocks — mosaic squares, spirals, concentric eyes, and triangle fields — each
// filled with colour from a chord via gc(). The gold dominates; colour blocks
// are inlaid like jewels. Ornaments reveal progressively as lim advances.
function drawGoldOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  const ss = sessionSeed | 0;
  const cn = chords.length;
  const rnd = _seedRnd(97, ss, 0, 0);
  let _forcedGoldVariant = 0; // set by phase dispatcher: 0 = ornament grid, 1 = frieze bands

  function chordCol(i, mul){
    const idx = Math.min(cn-1, Math.max(0, i % cn));
    const chord = chords[idx];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes);
    if(!notes || !notes.length) return [180,140,60];
    let R=0,G=0,B=0,c=0;
    for(const note of notes){
      const m = note.m!==undefined?note.m:note;
      const v = note.v!==undefined?note.v:80;
      const [r,g,b] = gc(m, v); R+=r; G+=g; B+=b; c++;
    }
    const k = mul===undefined?1:mul;
    return [Math.min(255,R/c*k), Math.min(255,G/c*k), Math.min(255,B/c*k)];
  }
  const css = (c,a)=> a===undefined ? `rgb(${c[0]|0},${c[1]|0},${c[2]|0})` : `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
  // ── 6-VARIANT CHOOSER (stable per painting, re-rolls on Vary) ──
  //  0 = Classic Klimt — Ornament tile grid (body) vs Pattern Frieze (vertical
  //      columns of stacked chord patterns), seed-driven internal pick. Both
  //      read as "gold ornament" identity so they share one Vary slot.
  //  1 = Spiral Field — 30-60 scattered Klimt curls with chord jewels.
  //  2 = Mosaic Field — chord-tile cluster patches on gold ground.
  //  3 = Danaë (golden shower, dramatic figurative, only non-gold ground).
  //  4 = Floral meadow.
  //  5 = Water Serpents.
  //  Free (cap=2) sees Ornament/Frieze + Spiral Field — gold tile grid vs
  //  abstract spiral field is the strongest decorative contrast.
  {
    const _pn=_capN(8); const _gpick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_gpick===1){ klimtPhaseSpiralField(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_gpick===2){ klimtPhaseMosaicField(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_gpick===3){ klimtPhaseDanae(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_gpick===4){ klimtPhaseMeadow(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_gpick===5){ klimtPhaseSerpents(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // Slot 6: the standalone Pattern Frieze (vertical pattern columns) — was a
    // hidden seed bit on slot 0; now its own cyclable phase.
    if(_gpick===6){ klimtPhasePatternFrieze(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // Slots 0 and 7 share the ornament body below; the slot picks the layout
    // (0 = ornament tile grid, 7 = inline frieze bands) instead of a second
    // hidden seed bit — both reachable via Vary.
    _forcedGoldVariant = (_gpick===7) ? 1 : 0;
  }
  const gg = ctx.createLinearGradient(0, 0, CW, CH);
  gg.addColorStop(0, '#b8902f');
  gg.addColorStop(0.35, '#d4ab3e');
  gg.addColorStop(0.6, '#e8c862');
  gg.addColorStop(0.85, '#c79a33');
  gg.addColorStop(1, '#9c7822');
  ctx.fillStyle = gg;
  ctx.fillRect(0, 0, CW, CH);
  // Leaf flecks — hammered-gold texture. Total density scales with song length
  // (short mood pieces stay airy, long songs build rich texture), and they
  // reveal progressively during playback so the back half of the track keeps
  // adding visible flecks instead of just re-rendering the same set.
  const flecksMaxFull = _adaptiveMax(cn, 'gold');
  const flecks = _progressive(lim, cn, flecksMaxFull);
  for(let i=0;i<flecks;i++){
    const x = rnd()*CW, y = rnd()*CH, r = 4+rnd()*22;
    const light = rnd()>0.5;
    ctx.fillStyle = light ? 'rgba(255,240,180,0.10)' : 'rgba(120,86,20,0.10)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  }

  // ── Ornament grid ─────────────────────────────────────────────────────────
  // ── Ornament composition: two variants chosen by seed ─────────────────────
  const goldVariant = _forcedGoldVariant;   // phase-driven (slot 0 vs 7), not seed
  const revealFrac = Math.max(0, Math.min(1, lim/cn));

  if(goldVariant === 1){
    // Variant B — vertical decorative bands (Klimt frieze): tall columns, each
    // filled with a stack of ornaments (eyes, spirals, triangles, chevrons).
    const COLS = cn<=8 ? 3 : cn<=24 ? 5 : cn<=60 ? 7 : 9;
    const colW = CW / COLS;
    const visCols = Math.ceil(revealFrac * COLS);
    for(let c=0; c<visCols; c++){
      const x0 = c*colW;
      const baseI = c*5;
      // band background tint
      const bandCol = chordCol(baseI, 0.92);
      ctx.fillStyle = css(bandCol, 0.55);
      ctx.fillRect(x0+colW*0.08, 0, colW*0.84, CH);
      ctx.strokeStyle = 'rgba(60,40,8,0.5)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x0+colW*0.08, 0, colW*0.84, CH);
      // stack of motifs down the column — density tracks song character so the
      // frieze variant differentiates pieces just like the grid variant.
      const _chGf = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
      const _gfMul = _chGf ? (0.68 + 0.76*(0.5*_chGf.energy + 0.5*_chGf.density)) : 1;
      const motifs = Math.max(4, Math.round((cn<=12 ? 5 : cn<=40 ? 8 : 12) * _gfMul));
      const mH = CH / motifs;
      for(let m=0; m<motifs; m++){
        const cx = x0 + colW/2;
        const cy = m*mH + mH/2;
        const col1 = chordCol(baseI+m, 1.0);
        const col2 = chordCol(baseI+m+2, 1.1);
        const r = Math.min(colW*0.7, mH*0.7)/2;
        const motifKind = (c + m) % 3;
        if(motifKind === 0){
          // eye
          for(let k=3;k>=1;k--){ ctx.fillStyle = css(k===2?col2:col1, 0.9); ctx.beginPath(); ctx.arc(cx, cy, r*(k/3), 0, Math.PI*2); ctx.fill(); }
          ctx.fillStyle='rgba(40,28,6,0.85)'; ctx.beginPath(); ctx.arc(cx,cy,r*0.16,0,Math.PI*2); ctx.fill();
        } else if(motifKind === 1){
          // chevron stack
          ctx.strokeStyle = css(col1, 0.95); ctx.lineWidth = Math.max(2, r*0.2);
          for(let z=-1;z<=1;z++){
            ctx.beginPath();
            ctx.moveTo(cx-r, cy+z*r*0.4 - r*0.2);
            ctx.lineTo(cx, cy+z*r*0.4 + r*0.2);
            ctx.lineTo(cx+r, cy+z*r*0.4 - r*0.2);
            ctx.stroke();
          }
        } else {
          // triangle
          ctx.fillStyle = css(col2, 0.9);
          ctx.beginPath(); ctx.moveTo(cx, cy-r); ctx.lineTo(cx+r, cy+r); ctx.lineTo(cx-r, cy+r); ctx.closePath(); ctx.fill();
        }
      }
    }
    return;
  }

  // ── Variant A — ornament grid (default) ───────────────────────────────────
  // Ornament density tracks song character: a dense, energetic piece inlays more
  // colour-jewels (richer Klimt decoration), a calm one fewer. A finer grid suits
  // Klimt — ornament density IS the statement (unlike op-art, where it'd be noise).
  const _chKlimt = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const _klimtMul = _chKlimt ? (0.68 + 0.76*(0.5*_chKlimt.energy + 0.5*_chKlimt.density)) : 1;
  const COLS = Math.max(4, Math.round((cn<=8 ? 4 : cn<=24 ? 6 : cn<=60 ? 8 : 10) * _klimtMul));
  const ROWS = Math.max(4, Math.round(COLS * (CH/CW)));
  const cw = CW/COLS, ch = CH/ROWS;
  const total = COLS*ROWS;
  const visCells = Math.ceil(revealFrac * total);

  let drawn=0;
  for(let row=0; row<ROWS; row++){
    for(let col=0; col<COLS; col++){
      if(drawn++ >= visCells) break;
      const i = row*COLS+col;
      const cx = col*cw + cw/2;
      const cy = row*ch + ch/2;
      const col1 = chordCol(i, 1.0);
      const col2 = chordCol(i+3, 1.1);
      const kind = (i*7 + (ss%5)) % 4;
      const pad = Math.min(cw,ch)*0.14;
      const w = cw - pad*2, h = ch - pad*2;
      const x0 = col*cw + pad, y0 = row*ch + pad;

      // Thin dark outline gives the inlaid-jewel separation.
      ctx.strokeStyle = 'rgba(60,40,8,0.5)';
      ctx.lineWidth = 1;

      if(kind === 0){
        // Mosaic square block, sometimes split into quarters.
        ctx.fillStyle = css(col1, 0.92);
        ctx.fillRect(x0, y0, w, h);
        if((i&1)){
          ctx.fillStyle = css(col2, 0.92);
          ctx.fillRect(x0, y0, w/2, h/2);
          ctx.fillRect(x0+w/2, y0+h/2, w/2, h/2);
        }
        ctx.strokeRect(x0, y0, w, h);
      } else if(kind === 1){
        // Concentric "eye" — nested circles.
        const rMax = Math.min(w,h)/2;
        for(let k=3;k>=1;k--){
          ctx.fillStyle = css(k===2?col2:col1, 0.9);
          ctx.beginPath(); ctx.arc(cx, cy, rMax*(k/3), 0, Math.PI*2); ctx.fill();
        }
        ctx.fillStyle = 'rgba(40,28,6,0.85)';
        ctx.beginPath(); ctx.arc(cx, cy, rMax*0.16, 0, Math.PI*2); ctx.fill();
      } else if(kind === 2){
        // Spiral on a colour tile.
        ctx.fillStyle = css(col1, 0.85);
        ctx.fillRect(x0, y0, w, h);
        ctx.strokeStyle = css(col2, 0.95);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const rMax = Math.min(w,h)*0.42, turns=2.5, steps=60;
        for(let s=0;s<=steps;s++){
          const t=s/steps, a=t*turns*Math.PI*2, r=t*rMax;
          const px=cx+Math.cos(a)*r, py=cy+Math.sin(a)*r;
          if(s===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(60,40,8,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x0, y0, w, h);
      } else {
        // Triangle field — two colour triangles forming the tile.
        ctx.fillStyle = css(col1, 0.9);
        ctx.beginPath();
        ctx.moveTo(x0, y0); ctx.lineTo(x0+w, y0); ctx.lineTo(x0, y0+h);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = css(col2, 0.9);
        ctx.beginPath();
        ctx.moveTo(x0+w, y0); ctx.lineTo(x0+w, y0+h); ctx.lineTo(x0, y0+h);
        ctx.closePath(); ctx.fill();
        ctx.strokeRect(x0, y0, w, h);
      }
    }
  }
}

// Gold-leaf ground helper for new Klimt phases.
function _klimtGround(ctx,CW,CH){
  const gg=ctx.createLinearGradient(0,0,CW,CH);
  gg.addColorStop(0,'#b8902f');gg.addColorStop(0.35,'#d4ab3e');gg.addColorStop(0.6,'#e8c862');gg.addColorStop(0.85,'#c79a33');gg.addColorStop(1,'#9c7822');
  ctx.fillStyle=gg;ctx.fillRect(0,0,CW,CH);
}

// ── Klimt C: Tree of Life — golden spiralling branches from a central trunk. ──
// ── Klimt C: Tree of Life — proper Klimt vocabulary (Stoclet Frieze 1909).
// Gold ground + 20 spiralling branches radiating from a central trunk, each
// ending in a tight Klimt curl with a chord-coloured jewel at its center.
// Falling eye-leaves (chord-coloured) drift across the canvas. Reveal scales
// branch + leaf count so the painting builds progressively.

// ── Klimt D: Mosaic — squares, spirals, eyes, triangles (Adele/Kiss). ──

// ── Klimt E: Floral meadow — dense flower dots over a green field. ──
function klimtPhaseMeadow(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  ctx.fillStyle=isBW?'#4a4e44':'#4a6a3a';ctx.fillRect(0,0,CW,CH);
  const flowers=Math.max(12,Math.min(360,cn*4));
  const vis=Math.max(1,Math.ceil(N/cn*flowers));
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+4900,ss,0,0);
    const {rgb}=_picChord(chords,Math.floor(i*(cn/flowers)),gc,isBW);
    const x=rnd()*CW,y=rnd()*CH,r=Math.min(CW,CH)*(0.006+rnd()*0.014);
    ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
}

// ── Klimt F: Water Serpents — flowing organic curves with golden scales. ──
function klimtPhaseSerpents(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  ctx.fillStyle=isBW?'#16181e':'#0d1a2a';ctx.fillRect(0,0,CW,CH);
  const streams=Math.max(3,Math.min(20,Math.round(cn/6)));
  const vis=Math.max(1,Math.ceil(N/cn*streams));
  ctx.lineCap='round';
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+5000,ss,0,0);
    const {rgb}=_picChord(chords,Math.floor(i*(cn/streams)),gc,isBW);
    const y0=rnd()*CH;
    ctx.strokeStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.75)`;ctx.lineWidth=Math.max(3,CH*0.03);
    ctx.beginPath();ctx.moveTo(0,y0);
    let y=y0;for(let x=0;x<=CW;x+=CW/8){y=y0+Math.sin(x/CW*Math.PI*3+i)*CH*0.12;ctx.lineTo(x,y);}
    ctx.stroke();
    // golden scales along the stream
    ctx.fillStyle=isBW?'rgba(220,216,200,0.7)':'rgba(216,176,60,0.7)';
    for(let x=CW*0.1;x<CW;x+=CW*0.12){const sy=y0+Math.sin(x/CW*Math.PI*3+i)*CH*0.12;ctx.beginPath();ctx.ellipse(x,sy,CW*0.012,CH*0.008,0,0,Math.PI*2);ctx.fill();}
  }
}

// ── Klimt G: The Kiss (1907-08) — Klimt's most iconic painting. Pair embrace
// silhouette on golden ground; left side (man) filled with black + chord-coloured
// rectangles; right side (woman) filled with chord-coloured ovals/circles. Two
// faces at top: man behind (dark hair), woman tilted forward with flowers in
// hair. Falling chord-coloured petals at the bottom. Reveal scales detail count.

// ── Klimt H: Danaë (1907-08) — golden shower. Rich maroon radial ground +
// curled female nude silhouette (right side) + diagonal cascade of golden
// coins/discs interspersed with chord-coloured ornaments. Klimt's most
// dramatic figurative work; the only non-gold-ground variant.
function klimtPhaseDanae(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));

  // Rich maroon-red radial ground (or dark grey in B/W).
  const grad = ctx.createRadialGradient(CW*0.7, CH*0.5, 50, CW*0.7, CH*0.5, Math.max(CW,CH)*0.9);
  if(isBW){
    grad.addColorStop(0, '#5a5856');
    grad.addColorStop(0.5, '#3a3836');
    grad.addColorStop(1, '#1a1816');
  } else {
    grad.addColorStop(0, '#8a3020');
    grad.addColorStop(0.5, '#5a1a14');
    grad.addColorStop(1, '#2a0810');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,CW,CH);

  // Golden ornamental spiral nest — abstract stand-in for the curled figure.
  // Nested golden arc shells (nautilus-like curled mass) + chord-jewel tiles
  // along the spiral + tight Klimt curls at the outer tips. Pure Klimt
  // ornament vocabulary (Stoclet / Tree-of-Life curls); no literal figure.
  const cx = CW*0.63, cy = CH*0.56;
  const nestR = CW*0.055;
  const _nr = _seedRnd(31200, ss, 0, 0);
  // Nested arc shells.
  for(let sh=0; sh<7; sh++){
    const r0 = nestR*(sh+1);
    const a0 = 0.6 + sh*0.35, a1 = a0 + Math.PI*(1.15 + 0.1*sh);
    ctx.strokeStyle = isBW
      ? (sh%2===0 ? 'rgba(210,206,196,0.9)' : 'rgba(140,136,126,0.9)')
      : (sh%2===0 ? 'rgba(232,200,98,0.9)' : 'rgba(184,134,46,0.9)');
    ctx.lineWidth = 7 - sh*0.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for(let s=0; s<=40; s++){
      const a = a0 + (a1-a0)*s/40;
      const rr = r0*(1 + 0.06*Math.sin(s*0.7 + sh));
      const x = cx + Math.cos(a)*rr, y = cy + Math.sin(a)*rr*0.88;
      if(s===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Chord-jewel tiles along the spiral path.
  for(let i=0; i<26; i++){
    const a = 0.6 + i*0.42, rr = nestR*0.9*(1 + i*0.22);
    if(rr > CW*0.38) break;
    const x = cx + Math.cos(a)*rr, y = cy + Math.sin(a)*rr*0.88;
    const {rgb} = _picChord(chords, i%cn, gc, isBW);
    const gold = isBW ? '#d0ccc0' : '#e8c862';
    if(i%3===0){
      ctx.save(); ctx.translate(x, y); ctx.rotate(i*0.3);
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.strokeStyle = gold; ctx.lineWidth = 1.2; ctx.strokeRect(-5, -5, 10, 10);
      ctx.restore();
    } else {
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.beginPath(); ctx.arc(x, y, 4.6, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = gold; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }
  // Tight Klimt curls at the outer tips.
  for(let i=0; i<5; i++){
    const a = 0.6 + i*1.5, rr = CW*0.36;
    const x = cx + Math.cos(a)*rr, y = cy + Math.sin(a)*rr*0.88;
    ctx.strokeStyle = isBW ? 'rgba(210,206,196,0.85)' : 'rgba(232,200,98,0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for(let s=0; s<30; s++){
      const aa = s*0.55 + _nr()*0.2, r2 = 8*(1 - s/30);
      const px = x + Math.cos(aa)*r2, py = y + Math.sin(aa)*r2;
      if(s===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // Golden coin/disc shower — diagonal cascade from upper-left. Reveal-based count.
  const showerCount = Math.max(20, Math.ceil(140*reveal));
  for(let i=0;i<showerCount;i++){
    const rnd=_seedRnd(i+31000,ss,0,0);
    const t = rnd();
    // Bias toward upper-left to lower-center cascade.
    const x = CW * (0.05 + (1-t)*0.55 + rnd()*0.15);
    const y = CH * (0.05 + t*0.85 + rnd()*0.10);
    const r = 4 + rnd()*10;
    const k = rnd();
    if(k < 0.50){
      // Solid gold disc.
      ctx.fillStyle = isBW ? '#c8c4b8' : '#e8c862';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = isBW ? 'rgba(40,40,40,0.7)' : 'rgba(80,55,15,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if(k < 0.75){
      // Larger pale gold.
      ctx.fillStyle = isBW ? 'rgba(220,218,210,0.85)' : 'rgba(244,224,128,0.85)';
      ctx.beginPath(); ctx.arc(x, y, r*1.3, 0, Math.PI*2); ctx.fill();
    } else if(k < 0.92){
      // Chord-coloured ornament disc.
      const {rgb} = _picChord(chords, Math.floor(rnd()*cn), gc, isBW);
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.75)`;
      ctx.beginPath(); ctx.arc(x, y, r*0.7, 0, Math.PI*2); ctx.fill();
    } else {
      // Square ornament.
      ctx.fillStyle = isBW ? '#a8a4a0' : '#d4ab3e';
      ctx.fillRect(x-r*0.7, y-r*0.7, r*1.4, r*1.4);
    }
  }
}


// ── Klimt I: Pattern Frieze (Beethoven Frieze, 1902) — vertical ornamental
// columns. 5-9 chord-coloured columns, each filled with a stack of pattern
// motifs (eyes, triangles, diamonds) in seed-picked chord colours. Slot 0
// seed-pair with Ornament body — same gold tile identity, different rhythm.
function klimtPhasePatternFrieze(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));
  const rnd = _seedRnd(91, ss, 0, 16);

  // Per-song layout decisions.
  const cols = 5 + Math.floor(rnd()*5);                   // 5-9 columns
  const colW = CW / cols;

  // Gold ground (or dark grey in B/W).
  if(isBW){ ctx.fillStyle='#3a3833'; ctx.fillRect(0,0,CW,CH); }
  else _klimtGround(ctx,CW,CH);

  // Subtle gold flecks.
  for(let i=0;i<60;i++){
    const r2 = _seedRnd(i+39100, ss, 0, 0);
    ctx.fillStyle = isBW
      ? (r2()>0.5 ? 'rgba(220,216,210,0.10)' : 'rgba(80,80,80,0.10)')
      : (r2()>0.5 ? 'rgba(255,240,180,0.10)' : 'rgba(120,86,20,0.10)');
    ctx.beginPath(); ctx.arc(r2()*CW, r2()*CH, 4+r2()*16, 0, Math.PI*2); ctx.fill();
  }

  // Columns appear progressively — left to right as reveal advances.
  const visCols = Math.max(1, Math.ceil(cols * reveal));
  for(let c=0;c<visCols;c++){
    const cx = c*colW + colW/2;
    const {rgb:colRgb} = _picChord(chords, (c*5)%cn, gc, isBW);
    // Light chord overlay strip
    ctx.fillStyle = `rgba(${colRgb[0]|0},${colRgb[1]|0},${colRgb[2]|0},0.30)`;
    ctx.fillRect(c*colW + colW*0.15, 0, colW*0.7, CH);

    const stackFull = 8 + Math.floor(rnd()*4);
    const visStacks = Math.max(2, Math.ceil(stackFull * reveal));
    const stackH = CH / stackFull;
    for(let s=0;s<visStacks;s++){
      const sy = s*stackH + stackH/2;
      const {rgb:sRgb} = _picChord(chords, (c*8+s)%cn, gc, isBW);
      const kind = s % 3;
      if(kind === 0){
        // Eye motif
        ctx.fillStyle = `rgb(${sRgb[0]|0},${sRgb[1]|0},${sRgb[2]|0})`;
        ctx.beginPath();
        ctx.ellipse(cx, sy, colW*0.30, stackH*0.30, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = `rgb(${Math.round(sRgb[0]*0.3)},${Math.round(sRgb[1]*0.3)},${Math.round(sRgb[2]*0.3)})`;
        ctx.beginPath();
        ctx.arc(cx, sy, colW*0.08, 0, Math.PI*2);
        ctx.fill();
      } else if(kind === 1){
        // Triangle
        ctx.fillStyle = `rgb(${sRgb[0]|0},${sRgb[1]|0},${sRgb[2]|0})`;
        ctx.beginPath();
        ctx.moveTo(cx-colW*0.30, sy+stackH*0.30);
        ctx.lineTo(cx+colW*0.30, sy+stackH*0.30);
        ctx.lineTo(cx, sy-stackH*0.30);
        ctx.closePath(); ctx.fill();
      } else {
        // Diamond
        ctx.fillStyle = `rgb(${sRgb[0]|0},${sRgb[1]|0},${sRgb[2]|0})`;
        ctx.beginPath();
        ctx.moveTo(cx, sy-stackH*0.30);
        ctx.lineTo(cx+colW*0.25, sy);
        ctx.lineTo(cx, sy+stackH*0.30);
        ctx.lineTo(cx-colW*0.25, sy);
        ctx.closePath(); ctx.fill();
      }
    }
    // Gold separator between columns
    if(c < cols-1){
      ctx.strokeStyle = isBW ? 'rgba(80,80,80,0.6)' : 'rgba(120,86,20,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo((c+1)*colW, 0);
      ctx.lineTo((c+1)*colW, CH);
      ctx.stroke();
    }
  }
}

// ── Klimt J: Spiral Field — Klimt's signature curls distributed across canvas.
// 30-60 chord-coloured spirals (Tree of Life motif extracted, no central trunk).
// Each spiral has a chord jewel at centre with inner highlight.
function klimtPhaseSpiralField(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));
  const rnd = _seedRnd(91, ss, 0, 17);

  // Per-song layout.
  const spiralCountFull = 30 + Math.floor(rnd()*30);      // 30-60 spirals

  // Gold ground.
  if(isBW){ ctx.fillStyle='#3a3833'; ctx.fillRect(0,0,CW,CH); }
  else _klimtGround(ctx,CW,CH);

  // Gold flecks.
  for(let i=0;i<60;i++){
    const r2 = _seedRnd(i+39200, ss, 0, 0);
    ctx.fillStyle = isBW
      ? (r2()>0.5 ? 'rgba(220,216,210,0.10)' : 'rgba(80,80,80,0.10)')
      : (r2()>0.5 ? 'rgba(255,240,180,0.10)' : 'rgba(120,86,20,0.10)');
    ctx.beginPath(); ctx.arc(r2()*CW, r2()*CH, 4+r2()*16, 0, Math.PI*2); ctx.fill();
  }

  // Spirals appear progressively.
  const visSpirals = Math.max(2, Math.ceil(spiralCountFull * reveal));
  for(let i=0;i<visSpirals;i++){
    const cx = rnd()*CW;
    const cy = rnd()*CH;
    const size = 12 + rnd()*40;
    const dir = rnd()<0.5 ? 1 : -1;
    const turns = 14 + Math.floor(rnd()*10);
    const {rgb} = _picChord(chords, i%cn, gc, isBW);

    // Spiral line (slightly darkened chord)
    ctx.strokeStyle = `rgba(${Math.round(rgb[0]*0.7+40)},${Math.round(rgb[1]*0.6+30)},${Math.round(rgb[2]*0.4+10)},0.85)`;
    ctx.lineWidth = 2 + rnd()*1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    let sx = cx, sy = cy, sa = rnd()*Math.PI*2;
    ctx.moveTo(sx, sy);
    for(let t=0;t<turns;t++){
      const r = (t/turns) * size;
      sa += dir * 0.55;
      sx = cx + Math.cos(sa)*r;
      sy = cy + Math.sin(sa)*r;
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // Jewel at centre — full chord colour
    ctx.fillStyle = `rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 3+rnd()*4, 0, Math.PI*2);
    ctx.fill();
    // Inner highlight
    ctx.fillStyle = `rgb(${Math.min(255,rgb[0]+80)|0},${Math.min(255,rgb[1]+80)|0},${Math.min(255,rgb[2]+80)|0})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5+rnd()*1.5, 0, Math.PI*2);
    ctx.fill();
  }
}

// ── Klimt K: Mosaic Field — irregular chord-tile patches with gold borders.
// 25-45 clusters of small tiles + bright highlight specks + final gold dust
// overlay. Klimt mosaic technique (Stoclet) without central subject.
function klimtPhaseMosaicField(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));
  const rnd = _seedRnd(91, ss, 0, 18);

  // Per-song layout.
  const clusterCountFull = 25 + Math.floor(rnd()*20);      // 25-45 clusters
  const highlightCountFull = 40 + Math.floor(rnd()*20);    // 40-60 highlights

  // Gold ground.
  if(isBW){ ctx.fillStyle='#3a3833'; ctx.fillRect(0,0,CW,CH); }
  else _klimtGround(ctx,CW,CH);

  // (G1) Mosaic flows in two meandering vertical RIVERS (Stoclet Tree-of-Life
  // branches carry the tesserae) instead of uniform confetti. Rivers grow
  // top→down with the reveal. (G2) Tesserae pack tightly inside the river
  // band. (G4) Mixed shapes: squares, triangles, circles. (G3) The gold
  // ground keeps breathing — a few small satellites, no crumbs everywhere.
  const dn = Math.min(CW,CH);
  const borderCol = isBW ? 'rgba(40,40,40,0.7)' : 'rgba(60,40,15,0.7)';
  const drawTessera = (tx,ty,s,rgb,kind)=>{
    ctx.fillStyle = `rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`;
    ctx.strokeStyle = borderCol; ctx.lineWidth = 1;
    if(kind < 0.62){
      ctx.fillRect(tx, ty, s, s*0.9); ctx.strokeRect(tx, ty, s, s*0.9);
    } else if(kind < 0.85){
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx+s, ty); ctx.lineTo(tx+s*0.5, ty-s*0.9);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(tx, ty, s*0.45, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    }
  };
  const riverDefs = [
    { x0: CW*0.30, amp: CW*0.10, ph: 0.0, wBase: dn*0.115, seedOff: 41000 },
    { x0: CW*0.72, amp: CW*0.08, ph: 1.7, wBase: dn*0.085, seedOff: 42000 },
  ];
  const stepsFull = 46;
  const visSteps = Math.max(2, Math.ceil(stepsFull * reveal));
  for(let rv=0; rv<riverDefs.length; rv++){
    const R = riverDefs[rv];
    for(let st=0; st<visSteps; st++){
      const rr = _seedRnd(R.seedOff + st, ss, 0, 0);
      const t = st/(stepsFull-1);
      const y = CH*(0.02 + t*0.96);
      const cx = R.x0 + Math.sin(t*Math.PI*2.2 + R.ph)*R.amp;
      const wband = R.wBase*(0.7 + 0.6*Math.abs(Math.sin(t*Math.PI*1.4 + R.ph)));
      const nT = Math.max(3, Math.round(3 + wband/(dn*0.02)));
      for(let k=0;k<nT;k++){
        const tx = cx + (rr()-0.5)*wband;
        const ty = y + (rr()-0.5)*CH*0.018;
        const s = dn*(0.013 + rr()*0.019);
        const {rgb} = _picChord(chords, (st*7+k+rv*13)%cn, gc, isBW);
        drawTessera(tx, ty, s, rgb, rr());
      }
    }
  }
  // Sparse satellite clusters — appear in the second half of the piece.
  if(reveal > 0.5){
    const satCount = 5 + Math.floor(rnd()*4);
    const visSats = Math.ceil(satCount * (reveal-0.5)*2);
    for(let c=0;c<visSats;c++){
      const cx = rnd()*CW, cy = rnd()*CH;
      for(let t=0;t<5;t++){
        const s = dn*(0.011 + rnd()*0.014);
        const {rgb} = _picChord(chords, (c*10+t+300)%cn, gc, isBW);
        drawTessera(cx+(rnd()-0.5)*dn*0.05, cy+(rnd()-0.5)*dn*0.05, s, rgb, rnd());
      }
    }
  }

  // Bright highlight specks — scale with reveal.
  const visHighlights = Math.ceil(highlightCountFull * reveal);
  for(let i=0;i<visHighlights;i++){
    const x = rnd()*CW, y = rnd()*CH;
    const {rgb} = _picChord(chords, (i+200)%cn, gc, isBW);
    ctx.fillStyle = `rgba(${Math.min(255,rgb[0]+60)|0},${Math.min(255,rgb[1]+60)|0},${Math.min(255,rgb[2]+70)|0},0.75)`;
    ctx.beginPath();
    ctx.arc(x, y, 2+rnd()*3, 0, Math.PI*2);
    ctx.fill();
  }

  // Gold dust overlay (final).
  ctx.globalAlpha = 0.2;
  for(let i=0;i<100;i++){
    const r3 = _seedRnd(i+39300, ss, 0, 0);
    ctx.fillStyle = isBW ? '#d0d0c8' : '#ffe0a0';
    ctx.beginPath();
    ctx.arc(r3()*CW, r3()*CH, 1+r3()*2, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── Pop (Keith Haring) ───────────────────────────────────────────────────────
// Bold flat colour blocks behind thick black-outlined glyphs, with radiating
// "energy" ticks around them (Keith Haring's street-pop language). Each cell
// is a colour from a chord via gc(); a simple glyph (figure, heart, star,
// spiral, burst) sits on top with a heavy black contour and motion dashes.
function drawPopOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  const ss = sessionSeed | 0;
  const cn = chords.length;
  let _forcedPopVariant = 0; // set by phase dispatcher: 0 = grid, 1 = mural
  const rnd = _seedRnd(101, ss, 0, 0);

  function chordCol(i, mul){
    const idx = Math.min(cn-1, Math.max(0, i % cn));
    const chord = chords[idx];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes);
    if(!notes || !notes.length) return [240,80,80];
    let R=0,G=0,B=0,c=0;
    for(const note of notes){
      const m = note.m!==undefined?note.m:note;
      const v = note.v!==undefined?note.v:80;
      const [r,g,b] = gc(m, v); R+=r; G+=g; B+=b; c++;
    }
    const k = mul===undefined?1:mul;
    // Punch up saturation toward flat pop colour.
    return [Math.min(255,R/c*k), Math.min(255,G/c*k), Math.min(255,B/c*k)];
  }
  const css = (c)=>`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
  // ── 6-VARIANT CHOOSER (stable per painting, re-rolls on Vary) ──
  //  0 = Glyph grid (original body below).
  //  1 = Mural (big scattered glyphs).  2 = Subway chalk (colour figures on dark, recoloured).
  //  3 = Radiant baby.  4 = Barking dog row.  5 = Dancing figures crowd.
  {
    const _pn=_capN(7); const _hpick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_hpick===1){ haringPhaseMural(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_hpick===2){ haringPhaseSubway(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_hpick===3){ haringPhaseBaby(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_hpick===4){ haringPhaseDog(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_hpick===5){ haringPhaseDance(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // Slots 0 and 6 share the body below; the slot picks the composition (0 =
    // glyph grid, 6 = inline mural of big scattered glyphs) instead of a hidden
    // seed bit — both reachable via Vary.
    _forcedPopVariant = (_hpick===6) ? 1 : 0;
  }
  // Haring's language is kinetic energy — song character sets how densely the
  // wall fills with figures: a loud, dense piece swarms with glyphs, a calm one
  // stays sparse and bold.
  const _chPo = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const _poMul = _chPo ? (0.68 + 0.76*(0.55*_chPo.energy + 0.45*_chPo.density)) : 1;
  const COLS = Math.max(3, Math.round((cn<=6?3:cn<=18?4:cn<=45?5:cn<=100?6:cn<=200?7:cn<=350?9:12) * _poMul));
  const ROWS = Math.max(3, Math.round(COLS*(CH/CW)));
  const cw = CW/COLS, ch = CH/ROWS;
  const total = COLS*ROWS;
  const revealFrac = Math.max(0, Math.min(1, lim/cn));
  const visCells = Math.ceil(revealFrac*total);

  // Bright flat background — pick a vivid base from the piece.
  const bg = chordCol(0, 1.0);
  ctx.fillStyle = css([Math.min(255,bg[0]*0.6+90), Math.min(255,bg[1]*0.6+90), Math.min(255,bg[2]*0.6+90)]);
  ctx.fillRect(0, 0, CW, CH);

  const BLACK = '#0c0c0c';

  function glyphFigure(cx, cy, s, col){
    // dancing figure — head + body + limbs
    ctx.fillStyle = css(col);
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = Math.max(3, s*0.13);
    ctx.lineJoin = 'round'; ctx.lineCap='round';
    // head
    ctx.beginPath(); ctx.arc(cx, cy-s*0.55, s*0.2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    // body
    ctx.beginPath(); ctx.moveTo(cx, cy-s*0.32); ctx.lineTo(cx, cy+s*0.1); ctx.stroke();
    // arms
    ctx.beginPath(); ctx.moveTo(cx, cy-s*0.2); ctx.lineTo(cx-s*0.35, cy-s*0.4); ctx.moveTo(cx, cy-s*0.2); ctx.lineTo(cx+s*0.35, cy-s*0.05); ctx.stroke();
    // legs
    ctx.beginPath(); ctx.moveTo(cx, cy+s*0.1); ctx.lineTo(cx-s*0.3, cy+s*0.5); ctx.moveTo(cx, cy+s*0.1); ctx.lineTo(cx+s*0.3, cy+s*0.45); ctx.stroke();
  }
  function glyphHeart(cx, cy, s, col){
    ctx.fillStyle = css(col); ctx.strokeStyle = BLACK; ctx.lineWidth = Math.max(3,s*0.12); ctx.lineJoin='round';
    ctx.beginPath();
    ctx.moveTo(cx, cy+s*0.4);
    ctx.bezierCurveTo(cx-s*0.6, cy-s*0.1, cx-s*0.25, cy-s*0.5, cx, cy-s*0.18);
    ctx.bezierCurveTo(cx+s*0.25, cy-s*0.5, cx+s*0.6, cy-s*0.1, cx, cy+s*0.4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  function glyphStar(cx, cy, s, col){
    ctx.fillStyle = css(col); ctx.strokeStyle = BLACK; ctx.lineWidth = Math.max(3,s*0.12); ctx.lineJoin='round';
    ctx.beginPath();
    for(let p=0;p<10;p++){
      const ang = -Math.PI/2 + p*Math.PI/5;
      const r = (p&1) ? s*0.22 : s*0.5;
      const x=cx+Math.cos(ang)*r, y=cy+Math.sin(ang)*r;
      if(p===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  function glyphBurst(cx, cy, s, col){
    ctx.fillStyle = css(col); ctx.strokeStyle = BLACK; ctx.lineWidth = Math.max(2.5,s*0.1);
    ctx.beginPath(); ctx.arc(cx, cy, s*0.32, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  }

  // Radiating energy ticks around a glyph.
  function energy(cx, cy, s){
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = Math.max(2, s*0.06);
    ctx.lineCap='round';
    const n = 8;
    for(let i=0;i<n;i++){
      const a = (i/n)*Math.PI*2 + 0.2;
      const r0 = s*0.62, r1 = s*0.82;
      ctx.beginPath();
      ctx.moveTo(cx+Math.cos(a)*r0, cy+Math.sin(a)*r0);
      ctx.lineTo(cx+Math.cos(a)*r1, cy+Math.sin(a)*r1);
      ctx.stroke();
    }
  }

  // ── Composition: two variants by seed ─────────────────────────────────────
  const popVariant = _forcedPopVariant;   // phase-driven (slot 0 vs 6), not seed

  if(popVariant === 1){
    // Variant B — mural: big scattered glyphs of varying size overlapping on a
    // single vivid ground, each with energy ticks. Haring wall style.
    const N = cn<=6?5:cn<=18?9:cn<=45?16:cn<=100?26:38;
    const visN = Math.ceil(revealFrac * N);
    const items = [];
    for(let i=0;i<N;i++){
      items.push({
        x: CW*(0.08+rnd()*0.84),
        y: CH*(0.08+rnd()*0.84),
        s: Math.min(CW,CH)*(0.08+rnd()*0.16),
        ci: i,
        kind: Math.floor(rnd()*4),
      });
    }
    for(let i=0;i<visN && i<items.length;i++){
      const it = items[i];
      const gcol = chordCol(it.ci, 1.0);
      if(it.kind===0) glyphFigure(it.x, it.y, it.s, gcol);
      else if(it.kind===1) glyphHeart(it.x, it.y, it.s, gcol);
      else if(it.kind===2) glyphStar(it.x, it.y, it.s, gcol);
      else glyphBurst(it.x, it.y, it.s, gcol);
      energy(it.x, it.y, it.s);
    }
    return;
  }

  // ── Variant A — glyph grid (default) ──────────────────────────────────────
  let drawn=0;
  for(let row=0; row<ROWS; row++){
    for(let col=0; col<COLS; col++){
      if(drawn++ >= visCells) break;
      const i = row*COLS+col;
      const cx = col*cw+cw/2, cy = row*ch+ch/2;
      const s = Math.min(cw,ch)*0.62;
      // flat colour tile
      const tile = chordCol(i, 1.0);
      ctx.fillStyle = css(tile);
      ctx.fillRect(col*cw, row*ch, cw, ch);
      // black grid seam
      ctx.strokeStyle = BLACK; ctx.lineWidth = 2;
      ctx.strokeRect(col*cw, row*ch, cw, ch);
      // glyph in contrasting colour
      const gcol = chordCol(i+4, 1.0);
      const kind = (i*5 + (ss%5)) % 5;
      if(kind===0) glyphFigure(cx, cy, s, gcol);
      else if(kind===1) glyphHeart(cx, cy, s, gcol);
      else if(kind===2) glyphStar(cx, cy, s, gcol);
      else if(kind===3) glyphBurst(cx, cy, s, gcol);
      else glyphFigure(cx, cy, s, gcol);
      energy(cx, cy, s);
    }
  }
}

// Shared Haring figure (dancing person) drawn as thick strokes.
function _haringFig(ctx,cx,cy,s,stroke){
  ctx.strokeStyle=stroke;ctx.lineWidth=Math.max(2,s*0.16);ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.arc(cx,cy-s*0.7,s*0.22,0,Math.PI*2);ctx.stroke(); // head
  ctx.beginPath();ctx.moveTo(cx,cy-s*0.48);ctx.lineTo(cx,cy+s*0.3); // torso
  ctx.moveTo(cx,cy-s*0.3);ctx.lineTo(cx-s*0.5,cy-s*0.05);ctx.moveTo(cx,cy-s*0.3);ctx.lineTo(cx+s*0.5,cy-s*0.4); // arms
  ctx.moveTo(cx,cy+s*0.3);ctx.lineTo(cx-s*0.45,cy+s*0.8);ctx.moveTo(cx,cy+s*0.3);ctx.lineTo(cx+s*0.45,cy+s*0.75); // legs
  ctx.stroke();
}

// ── Haring B: Mural — big scattered glyphs (figures/hearts) on bright ground. ──
function haringPhaseMural(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const bg=_picChord(chords,0,gc,isBW).rgb;
  ctx.fillStyle=isBW?'#d8d4cc':`rgb(${Math.min(255,bg[0]+80)},${Math.min(255,bg[1]+80)},${Math.min(255,bg[2]+60)})`;ctx.fillRect(0,0,CW,CH);
  const glyphs=Math.max(2,Math.min(14,Math.round(cn/12)));
  const vis=Math.max(1,Math.ceil(N/cn*glyphs));
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+5100,ss,0,0);
    const {rgb}=_picChord(chords,Math.floor(i*(cn/glyphs)),gc,isBW);
    const x=rnd()*CW,y=rnd()*CH,s=Math.min(CW,CH)*(0.1+rnd()*0.12);
    const k=(rnd()*3)|0;
    if(k===0){ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;_haringFig(ctx,x,y,s,'#0c0c0c');}
    else if(k===1){ // heart
      ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;ctx.beginPath();ctx.moveTo(x,y+s*0.4);ctx.quadraticCurveTo(x-s*0.7,y-s*0.2,x,y-s*0.5);ctx.quadraticCurveTo(x+s*0.7,y-s*0.2,x,y+s*0.4);ctx.fill();
      ctx.strokeStyle='#0c0c0c';ctx.lineWidth=Math.max(2,s*0.1);ctx.stroke();
    } else { // radiating sun
      ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;ctx.beginPath();ctx.arc(x,y,s*0.4,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#0c0c0c';ctx.lineWidth=Math.max(2,s*0.08);for(let r=0;r<8;r++){const a=r/8*Math.PI*2;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*s*0.5,y+Math.sin(a)*s*0.5);ctx.lineTo(x+Math.cos(a)*s*0.75,y+Math.sin(a)*s*0.75);ctx.stroke();}
    }
  }
}

// ── Haring C: Subway chalk — colour figures on a dark ground (recoloured). ──
function haringPhaseSubway(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  ctx.fillStyle=isBW?'#141414':'#1a1430';ctx.fillRect(0,0,CW,CH);
  const glyphs=Math.max(4,Math.min(40,Math.round(cn/4)));
  const vis=Math.max(1,Math.ceil(N/cn*glyphs));
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+5200,ss,0,0);
    const {rgb}=_picChord(chords,Math.floor(i*(cn/glyphs)),gc,isBW);
    const x=rnd()*CW,y=rnd()*CH,s=Math.min(CW,CH)*(0.05+rnd()*0.06);
    const stroke=`rgb(${Math.min(255,rgb[0]+80)},${Math.min(255,rgb[1]+80)},${Math.min(255,rgb[2]+80)})`;
    const k=(rnd()*3)|0;
    if(k===0)_haringFig(ctx,x,y,s,stroke);
    else if(k===1){ // radiant baby (crawling + rays)
      ctx.strokeStyle=stroke;ctx.lineWidth=Math.max(2,s*0.16);
      ctx.beginPath();ctx.arc(x,y,s*0.4,0,Math.PI*2);ctx.stroke();
      for(let r=0;r<8;r++){const a=r/8*Math.PI*2;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*s*0.5,y+Math.sin(a)*s*0.5);ctx.lineTo(x+Math.cos(a)*s*0.8,y+Math.sin(a)*s*0.8);ctx.stroke();}
    } else { // dog
      ctx.strokeStyle=stroke;ctx.lineWidth=Math.max(2,s*0.16);
      ctx.beginPath();ctx.rect(x-s*0.5,y-s*0.2,s,s*0.5);ctx.moveTo(x-s*0.5,y-s*0.2);ctx.lineTo(x-s*0.75,y-s*0.4);ctx.stroke();
    }
  }
}

// ── Haring D: Radiant baby — one big central radiant baby + smaller ones. ──
function haringPhaseBaby(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const bg=_picChord(chords,0,gc,isBW).rgb;
  ctx.fillStyle=isBW?'#d4d0c6':`rgb(${Math.min(255,bg[0]*0.5+120)},${Math.min(255,bg[1]*0.5+100)},${Math.round(bg[2]*0.4)})`;ctx.fillRect(0,0,CW,CH);
  const babies=Math.max(1,Math.min(12,Math.round(cn/12)));
  const vis=Math.max(1,Math.ceil(N/cn*babies));
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+5300,ss,0,0);
    const {rgb}=_picChord(chords,Math.floor(i*(cn/babies)),gc,isBW);
    const x=i===0?CW/2:rnd()*CW,y=i===0?CH/2:rnd()*CH,s=i===0?Math.min(CW,CH)*0.18:Math.min(CW,CH)*(0.05+rnd()*0.05);
    ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;ctx.strokeStyle='#0c0c0c';ctx.lineWidth=Math.max(2,s*0.12);
    // crawling body
    ctx.beginPath();ctx.ellipse(x,y,s*0.5,s*0.4,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.arc(x+s*0.4,y-s*0.3,s*0.22,0,Math.PI*2);ctx.fill();ctx.stroke(); // head
    // rays
    ctx.lineWidth=Math.max(2,s*0.08);for(let r=0;r<10;r++){const a=r/10*Math.PI*2;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*s*0.7,y+Math.sin(a)*s*0.6);ctx.lineTo(x+Math.cos(a)*s*0.95,y+Math.sin(a)*s*0.85);ctx.stroke();}
  }
}

// ── Haring E: Barking dog — row of dog glyphs on a bright band. ──
function haringPhaseDog(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const bg=_picChord(chords,0,gc,isBW).rgb;
  ctx.fillStyle=isBW?'#c8c4ba':`rgb(${Math.round(bg[0]*0.4)},${Math.min(255,bg[1]*0.6+80)},${Math.round(bg[2]*0.5+40)})`;ctx.fillRect(0,0,CW,CH);
  const dogs=Math.max(3,Math.min(40,Math.round(cn/3)));
  const vis=Math.max(1,Math.ceil(N/cn*dogs));
  const perRow=Math.ceil(Math.sqrt(dogs*CW/CH));
  for(let i=0;i<vis;i++){
    const {rgb}=_picChord(chords,Math.floor(i*(cn/dogs)),gc,isBW);
    const col=i%perRow,row=(i/perRow)|0;
    const s=Math.min(CW/perRow,CH/Math.ceil(dogs/perRow))*0.4;
    const x=col*(CW/perRow)+CW/perRow/2,y=row*(s*2.4)+s*1.4;
    ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;ctx.strokeStyle='#0c0c0c';ctx.lineWidth=Math.max(2,s*0.18);
    // dog body
    ctx.beginPath();ctx.moveTo(x-s,y+s*0.4);ctx.lineTo(x-s,y-s*0.3);ctx.lineTo(x-s*0.5,y-s*0.3);ctx.lineTo(x-s*0.3,y-s*0.7);ctx.lineTo(x-s*0.1,y-s*0.3);ctx.lineTo(x+s,y-s*0.3);ctx.lineTo(x+s*1.2,y);ctx.lineTo(x+s,y+s*0.4);ctx.closePath();ctx.fill();ctx.stroke();
  }
}

// ── Haring F: Dancing figures — dense crowd of colourful dancing people. ──
function haringPhaseDance(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const bg=_picChord(chords,0,gc,isBW).rgb;
  ctx.fillStyle=isBW?'#dad6cc':`rgb(${Math.min(255,bg[0]*0.5+110)},${Math.min(255,bg[1]*0.5+110)},${Math.min(255,bg[2]*0.5+90)})`;ctx.fillRect(0,0,CW,CH);
  const figs=Math.max(4,Math.min(60,Math.round(cn/2)));
  const vis=Math.max(1,Math.ceil(N/cn*figs));
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+5400,ss,0,0);
    const {rgb}=_picChord(chords,Math.floor(i*(cn/figs)),gc,isBW);
    const x=rnd()*CW,y=rnd()*CH,s=Math.min(CW,CH)*(0.05+rnd()*0.05);
    _haringFig(ctx,x,y,s,`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
    // motion ticks
    ctx.strokeStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.6)`;ctx.lineWidth=Math.max(1.5,s*0.08);
    for(let t=0;t<3;t++){const a=rnd()*Math.PI*2;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*s*0.9,y+Math.sin(a)*s*0.9);ctx.lineTo(x+Math.cos(a)*s*1.2,y+Math.sin(a)*s*1.2);ctx.stroke();}
  }
}

// ── Wave (Bridget Riley) ─────────────────────────────────────────────────────
// Op-art kinetic stripes: rows of wavy bands whose amplitude and phase shift
// across the canvas, producing optical vibration / moiré (Bridget Riley). Two
// alternating colours pulled from chords via gc(); the wave parameters are
// modulated by the music so louder/higher passages ripple harder. Reveals
// progressively top-to-bottom as lim advances.
function drawWaveOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  const ss = sessionSeed | 0;
  const cn = chords.length;
  let _forcedWaveVariant = 0; // set by phase dispatcher: 0 = stripes, 1 = ripple
  const rnd = _seedRnd(103, ss, 0, 0);

  function chordCol(i, mul){
    const idx = Math.min(cn-1, Math.max(0, i % cn));
    const chord = chords[idx];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes);
    if(!notes || !notes.length) return [30,30,30];
    let R=0,G=0,B=0,c=0;
    for(const note of notes){
      const m = note.m!==undefined?note.m:note;
      const v = note.v!==undefined?note.v:80;
      const [r,g,b] = gc(m, v); R+=r; G+=g; B+=b; c++;
    }
    const k = mul===undefined?1:mul;
    return [Math.min(255,R/c*k), Math.min(255,G/c*k), Math.min(255,B/c*k)];
  }
  const css = (c)=>`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
  // ── 6-VARIANT CHOOSER (stable per painting, re-rolls on Vary) ──
  //  0 = Classic Riley (Wavy stripes / Concentric ripple, seed-driven internal
  //      pick — the two layouts read as one "wave Riley" identity so they
  //      share a single Vary slot).
  //  1 = Movement in Squares (1961, Riley's breakthrough optical bend).
  //  2 = Late Morning vertical stripes (1967, pure colour signature).
  //  3 = Cataract (1967, radiating petal wobble).
  //  4 = Crest (1964, single S-curve gesture).
  //  5 = Triangle tessellation.
  //  Free (cap=2) sees Wavy/Ripple + Movement in Squares — wave Riley vs
  //  square Riley is the strongest visual contrast in her catalogue.
  {
    const _pn=_capN(8); const _rpick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_rpick===1){ rileyPhaseWarp(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_rpick===2){ rileyPhaseBlaze(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_rpick===3){ rileyPhaseCataract(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_rpick===4){ rileyPhaseCrest(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_rpick===5){ rileyPhaseTriangle(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_rpick===6){ rileyPhaseFall(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // Slots 0 and 7 share the body below; the slot picks the composition (0 =
    // wavy vertical stripes, 7 = concentric ripple rings) instead of a hidden
    // seed bit — both reachable via Vary.
    _forcedWaveVariant = (_rpick===7) ? 1 : 0;
  }
  const darkC = chordCol(0, 0.5);
  const liteC = chordCol(Math.floor(cn/2), 1.25);

  // Light ground.
  ctx.fillStyle = css([Math.min(255,liteC[0]+60),Math.min(255,liteC[1]+60),Math.min(255,liteC[2]+60)]);
  ctx.fillRect(0, 0, CW, CH);

  // ── Composition: two variants by seed ─────────────────────────────────────
  const waveVariant = _forcedWaveVariant;   // phase-driven (slot 0 vs 7), not seed

  if(waveVariant === 1){
    // Variant B — concentric ripple rings (Riley "Blaze"): nested wavy circles
    // radiating from a centre, alternating two tones, with rotational wobble.
    const cx = CW*0.5, cy = CH*0.5;
    const maxR = Math.hypot(CW, CH)*0.55;
    const RINGS = cn<=8?14:cn<=24?22:cn<=60?34:cn<=120?48:cn<=240?68:cn<=400?92:120;
    const visRings = Math.max(1, Math.ceil((lim/cn)*RINGS));
    const ringStep = maxR / RINGS;
    // Draw outer→inner so inner rings sit on top.
    for(let r=visRings; r>=1; r--){
      const rad = r*ringStep;
      const ch2 = chords[Math.min(cn-1, Math.floor((r/RINGS)*cn))];
      const notes = ch2 && (ch2.n||ch2.notes);
      const topNote = notes&&notes.length?(notes[0].m!==undefined?notes[0].m:notes[0]):60;
      const wobN = 5 + (topNote%7);      // petals of wobble
      const wobAmp = ringStep * (0.4 + ((r%5)/5)*0.9);
      const col = (r&1) ? chordCol(r, 0.55) : chordCol(r+3, 1.2);
      ctx.fillStyle = css(col);
      ctx.beginPath();
      const segs = 80;
      for(let s=0;s<=segs;s++){
        const a = (s/segs)*Math.PI*2;
        const rr = rad + Math.sin(a*wobN + r*0.5)*wobAmp;
        const x = cx + Math.cos(a)*rr, y = cy + Math.sin(a)*rr;
        if(s===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  // ── Variant A — Riley "Fall" ribbons: full-width horizontal wavy stripes ──
  // (W1) Chromatic discipline: the WHOLE painting uses one deep stripe tone
  // derived from the root chord (ground stays cream) plus ONE saturated accent
  // ribbon at the piece's climax (loudest chord). The music lives in the
  // geometry (amplitude / frequency / phase), not in a per-band rainbow.
  // (W2) Systematic progression: amplitude & frequency grow top→bottom —
  // calm opening, dense crescendo — the logic of Riley's "Fall" (1963).
  // (W3) 48 segments per edge + constant-thickness ribbons (both edges share
  // one phase) so curves print smooth and precise at HQ.
  const _chWa = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const _waEnergy = _chWa ? _chWa.energy : 0.5;
  const _waAmpMul = 0.8 + 0.5*_waEnergy;   // 0.8..1.3
  const BANDS = cn<=8?10:cn<=24?16:cn<=60?24:cn<=120?32:cn<=240?42:cn<=400?52:64;
  const visBands = Math.max(1, Math.ceil((lim/cn)*BANDS));
  const bandH = CH / BANDS;
  // (W1) Whole-painting palette: deep tone from the root chord.
  const waveDark = [darkC[0]*0.55, darkC[1]*0.55, darkC[2]*0.55];
  // Climax = chord with the highest average velocity → its band gets the accent.
  let _cxIdx = 0, _cxVel = -1;
  for(let i=0;i<cn;i++){
    const nn = chords[i] && (chords[i].n || chords[i].notes);
    if(!nn || !nn.length) continue;
    let v=0; for(const note of nn) v += (note.v!==undefined?note.v:80);
    v/=nn.length;
    if(v>_cxVel){ _cxVel=v; _cxIdx=i; }
  }
  const accentBand = Math.min(BANDS-1, Math.floor((_cxIdx/cn)*BANDS));
  const accentCol = chordCol(_cxIdx, 1.1);

  for(let b=0; b<visBands; b++){
    const t = BANDS<=1 ? 0 : b/(BANDS-1);
    const yC = (b+0.5)*bandH;
    const chord = chords[Math.min(cn-1, Math.floor((b/BANDS)*cn))];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes);
    const topNote = notes && notes.length ? (notes[0].m!==undefined?notes[0].m:notes[0]) : 60;
    const vel = notes && notes.length && notes[0].v!==undefined ? notes[0].v : 80;
    // (W2) Progression: calm top → crescendo bottom; chord velocity is a
    // gentle voice on top, capped so ribbons stay legible.
    const amp = Math.min(bandH*0.95, bandH * (0.10 + 0.95*Math.pow(t,1.6)) * _waAmpMul * (0.85 + 0.3*(vel/127)));
    const freq = (0.9 + ((topNote%12)/12)*1.1) * (0.75 + 0.85*t);
    const phase = b*0.32 + ((topNote%7)/7)*0.5;   // deterministic — no random jitter
    const h = bandH*0.52;                          // ribbon thickness; cream ground shows between
    ctx.fillStyle = (b===accentBand) ? css(accentCol) : css(waveDark);
    ctx.beginPath();
    const segs = 48;
    for(let s=0;s<=segs;s++){
      const x = (s/segs)*CW;
      const yy = yC - h*0.5 + Math.sin((x/CW)*Math.PI*2*freq + phase)*amp;
      if(s===0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    for(let s=segs;s>=0;s--){
      const x = (s/segs)*CW;
      const yy = yC + h*0.5 + Math.sin((x/CW)*Math.PI*2*freq + phase)*amp;
      ctx.lineTo(x, yy);
    }
    ctx.closePath();
    ctx.fill();
  }
}

// ── Riley C: B/W waves recoloured — vermilion/turquoise undulating bands. ──
// ── Riley C: Wavy stripes v2. Random orientation (h/v/diag/anti-diag), random
// count 12-40, wavelength, amplitude. Both colours chord-derived per painting. ──

// ── Riley D: Concentric ripple v2. Off-centre, random count + petals. ──
function rileyPhaseCataract(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const sR=_seedRnd(31001,ss,0,0); sR(); sR();
  ctx.fillStyle=isBW?'#ecece6':'#f0ece2'; ctx.fillRect(0,0,CW,CH);
  const cx=CW*(0.20+sR()*0.60), cy=CH*(0.20+sR()*0.60);
  const nRings=12+((sR()*29)|0);
  const maxR=Math.hypot(CW,CH)*0.7, step=maxR/nRings;
  const petals=4+((sR()*9)|0);
  const wobPh=sR()*Math.PI*2;
  const vis=Math.max(1,Math.min(nRings,Math.ceil(N/cn*nRings)));
  for(let r=Math.min(nRings,vis);r>=1;r--){
    const rad=r*step;
    const {rgb}=_picChord(chords,r%cn,gc,isBW);
    let col=rgb;
    if(r%2===1) col=[Math.min(255,Math.round(rgb[0]*0.35+30)),Math.min(255,Math.round(rgb[1]*0.35+30)),Math.min(255,Math.round(rgb[2]*0.35+30))];
    ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.beginPath();
    for(let ti=0;ti<60;ti++){
      const t=ti/60*Math.PI*2;
      const wob=step*0.4*Math.sin(t*petals+wobPh);
      const rr=rad+wob;
      const px=cx+Math.cos(t)*rr, py=cy+Math.sin(t)*rr;
      if(ti===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath(); ctx.fill();
  }
}

// ── Riley E: Lozenge grid v2 — random cols/rows + skew. ──

// ── Riley F: Triangle tessellation v2 — random density. ──
function rileyPhaseTriangle(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const sR=_seedRnd(33001,ss,0,0); sR(); sR();
  ctx.fillStyle=isBW?'#f0f0ec':'#f4f4ee'; ctx.fillRect(0,0,CW,CH);
  // Clip everything to canvas — guarantees no triangle bleeds past edges.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0,0,CW,CH);
  ctx.clip();
  const nCols=5+((sR()*10)|0);
  const tw=CW/nCols;
  // Compute row count from ideal equilateral height, then adjust th so the
  // rows fit canvas EXACTLY — otherwise the bottom row gets clipped in half.
  const idealTh=tw*Math.sqrt(3)/2;
  const nRows=Math.max(1, Math.floor(CH/idealTh));
  const th=CH/nRows;  // adjusted so nRows*th == CH (triangles slightly non-equilateral)
  // total = the ACTUAL number of triangles the loop can draw. Each row has nCols
  // up-triangles but only (nCols-1) down-triangles — the last column's down would
  // spill past CW (guarded by x0+tw*1.5<=CW below), so it's never drawn. Using the
  // naive nCols*nRows*2 made `vis` aim higher than reachable, so the canvas filled
  // ~13% (≈45s) before the end. (2*nCols-1) per row matches reality exactly.
  const total=nRows*(2*nCols-1);
  // Reveal scales 1:1 with progress so the last triangle lands on the last note.
  const vis=Math.max(1,Math.min(total,Math.ceil(N/cn*total)));

  // ── BW mode keeps the original sequential pattern (k%cn) ─────────────────
  // The high-contrast monochrome looked best with simple top-to-bottom fill.
  // Colour mode uses the diagonal chord-index pattern (each triangle = own
  // chord) so adjacent triangles never share colour, producing Riley
  // Bagatelle-style alternating interlock.
  const altRowMul = 1 + Math.floor(sR()*5);                              // 1..5 diagonal slope per song
  const upDownOffset = Math.max(1, Math.floor(cn * (0.20 + sR()*0.30))); // 20-50% palette shift

  function triColour(col, row, isUp, k){
    if(isBW){
      return _picChord(chords, k%cn, gc, isBW).rgb;
    }
    const pos = col + row * altRowMul + (isUp ? 0 : upDownOffset);
    return _picChord(chords, ((pos % cn) + cn) % cn, gc, isBW).rgb;
  }

  let k=0;
  for(let ry=0;ry<nRows;ry++)for(let cx=0;cx<nCols;cx++){
    if(k>=vis) break;
    const x0=cx*tw, y0=ry*th;
    // up triangle
    if(k<vis){
      const [r,g,b]=triColour(cx, ry, true, k);
      ctx.fillStyle=`rgb(${r},${g},${b})`;
      ctx.beginPath(); ctx.moveTo(x0,y0+th); ctx.lineTo(x0+tw,y0+th);
      ctx.lineTo(x0+tw/2,y0); ctx.closePath(); ctx.fill();
      k++;
    }
    // down triangle
    if(k<vis && x0+tw*1.5<=CW){
      const [r,g,b]=triColour(cx, ry, false, k);
      ctx.fillStyle=`rgb(${r},${g},${b})`;
      ctx.beginPath(); ctx.moveTo(x0+tw/2,y0+th); ctx.lineTo(x0+tw*1.5,y0+th);
      ctx.lineTo(x0+tw,y0); ctx.closePath(); ctx.fill();
      k++;
    }
  }
  ctx.restore();
}

// ── Riley G: Movement in Squares (1961) — Riley's breakthrough painting.
// Black + cream grid of squares that compress horizontally toward a vertical
// band — creates an optical bend illusion. Subtle chord-coloured tint overlay
// per row preserves the optical effect while staying palette-driven.
function rileyPhaseMovement(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));
  const sR = _seedRnd(34001, ss, 0, 0); sR(); sR();

  // Cream ground.
  ctx.fillStyle = isBW ? '#e8e8e4' : '#f0ece2';
  ctx.fillRect(0,0,CW,CH);

  // Grid dimensions — scale with chord count.
  const rows = cn<=8?8:cn<=24?10:cn<=60?12:14;
  const cols = cn<=8?14:cn<=24?18:cn<=60?22:24;
  const cellH = CH/rows;
  // Compression centre — varies per painting via seed.
  const centerX = CW * (0.45 + sR()*0.30);

  // Compute column widths — symmetric compression toward centerX.
  const widths = [];
  let totalW = 0;
  for(let c=0;c<cols;c++){
    const t = c/cols;
    const x = t*CW;
    const dist = Math.abs(x - centerX) / CW;
    const w = (CW/cols) * (0.25 + Math.pow(dist, 0.7) * 1.0);
    widths.push(w);
    totalW += w;
  }
  const scale = CW/totalW;
  for(let i=0;i<widths.length;i++) widths[i] *= scale;

  // Reveal-based: rows appear top-to-bottom.
  const visRows = Math.max(1, Math.ceil(rows*reveal));
  const dark = isBW ? '#1a1a1a' : '#1a1a1a';
  const light = isBW ? '#e8e8e4' : '#f0ece2';

  // Draw checkerboard.
  let x = 0;
  for(let c=0;c<cols;c++){
    const w = widths[c];
    for(let r=0;r<visRows;r++){
      const y = r*cellH;
      const k = (r+c) % 2;
      ctx.fillStyle = k ? dark : light;
      ctx.fillRect(x, y, w, cellH);
    }
    x += w;
  }

  // Subtle chord-coloured tint overlay per row — preserves optical effect.
  for(let r=0;r<visRows;r++){
    const {rgb} = _picChord(chords, Math.floor(r/rows * cn)%cn, gc, isBW);
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.04)`;
    ctx.fillRect(0, r*cellH, CW, cellH);
  }
}

// ── Riley: Warp Field — colour columns warping toward a vertical axis ──
// Replaces the old B/W "Movement in Squares": vertical bands whose WIDTH narrows
// toward a seed-placed axis and widens at the edges, giving Riley's optical pull
// — but the bands are coloured from the chords (gc), so it belongs to Paintiano's
// music→colour concept instead of being a mechanical monochrome op-art grid.
// Reveal grows outward from the axis with playback progress (lim/cn).
function rileyPhaseWarp(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal=Math.max(0,Math.min(1,N/cn));
  const sR=_seedRnd(71,ss, 0, 0);
  // ground
  ctx.fillStyle=isBW?'#101014':'#0c0a14';
  ctx.fillRect(0,0,CW,CH);
  // axis position (seed-varied, kept off dead-centre for tension)
  const axisF=0.40+sR()*0.20;          // 0.40–0.60
  const nCols=cn<=8?28:cn<=24?40:cn<=60?56:cn<=120?72:cn<=240?92:120;
  // build column edges: width depends on distance from axis (narrow at axis).
  // We precompute fractional widths then normalise to span the canvas.
  const widths=[];
  for(let i=0;i<nCols;i++){
    const f=(i+0.5)/nCols;
    const d=Math.abs(f-axisF);
    widths.push(0.18+d*1.9);            // narrow near axis, wide at edges
  }
  const sum=widths.reduce((a,b)=>a+b,0);
  // reveal: columns nearest the axis appear first, spreading outward.
  const order=[...Array(nCols).keys()].sort((a,b)=>Math.abs((a+0.5)/nCols-axisF)-Math.abs((b+0.5)/nCols-axisF));
  const visN=Math.max(1,Math.ceil(nCols*reveal));
  const visible=new Set(order.slice(0,visN));
  let x=0;
  for(let i=0;i<nCols;i++){
    const w=widths[i]/sum*CW;
    if(visible.has(i)){
      const t=(i+0.5)/nCols;
      const {rgb}=_picChord(chords, Math.floor(t*cn)%cn, gc, isBW);
      const r=Math.min(255,rgb[0]*1.05), g=Math.min(255,rgb[1]*1.05), b=Math.min(255,rgb[2]*1.05);
      ctx.fillStyle=`rgb(${r|0},${g|0},${b|0})`;
      ctx.fillRect(x,0,w+1,CH);
    }
    x+=w;
  }
}

// ── Riley: Blaze (1962) — concentric bands twisted into a spinning vortex. ──
// Colours from the chords; the twist (a per-ring angular shear) creates Riley's
// dizzying rotational op-art. Bands reveal outward with progress (lim/cn).
function rileyPhaseBlaze(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal=Math.max(0,Math.min(1,N/cn));
  const sR=_seedRnd(73,ss, 0, 0);
  ctx.fillStyle=isBW?'#101014':'#0c0a14'; ctx.fillRect(0,0,CW,CH);
  const cx=CW*(0.42+sR()*0.16), cy=CH*(0.42+sR()*0.16);
  const maxR=Math.hypot(CW,CH)*0.62;
  const nBands=cn<=8?16:cn<=24?26:cn<=60?38:cn<=120?52:cn<=240?68:88;
  const visBands=Math.max(1,Math.ceil(nBands*reveal));
  const twist=2.0+sR()*1.6;
  for(let i=visBands;i>=1;i--){
    const R=i/nBands*maxR;
    const {rgb}=_picChord(chords, Math.floor(i/nBands*cn)%cn, gc, isBW);
    ctx.strokeStyle=`rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`;
    ctx.lineWidth=Math.max(3, maxR/nBands*1.25);
    ctx.globalAlpha=0.96;
    ctx.beginPath();
    for(let a=0;a<=Math.PI*2+0.12;a+=0.1){
      const tw=a*twist + i*0.5;
      const rr=R*(1+Math.sin(tw)*0.12);
      const x=cx+Math.cos(a)*rr, y=cy+Math.sin(a)*rr;
      a?ctx.lineTo(x,y):ctx.moveTo(x,y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha=1;
}

// ── Riley: Fall (1963) — dense HORIZONTAL wavy bands cascading top→bottom, the
// wave sharpening toward the bottom. Chord colours; bands reveal top→bottom with
// progress. Horizontal motion deliberately contrasts the vertical stripe look.
function rileyPhaseFall(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal=Math.max(0,Math.min(1,N/cn));
  const sR=_seedRnd(74,ss, 0, 0);
  ctx.fillStyle=isBW?'#101014':'#0c0a14'; ctx.fillRect(0,0,CW,CH);
  const nBands=cn<=8?18:cn<=24?28:cn<=60?40:cn<=120?56:cn<=240?74:96;
  const visBands=Math.max(1,Math.ceil(nBands*reveal));
  const bh=CH/nBands;
  const wl=22+sR()*22;
  const phase=sR()*Math.PI*2;
  for(let i=0;i<visBands;i++){
    const baseY=i*bh;
    const amp=3+(i/nBands)*30;
    const {rgb}=_picChord(chords, Math.floor(i/nBands*cn)%cn, gc, isBW);
    ctx.fillStyle=`rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`;
    ctx.beginPath();
    for(let x=0;x<=CW;x+=5){const y=baseY+Math.sin(x/wl+i*0.5+phase)*amp*(0.3+x/CW*0.7); x?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    for(let x=CW;x>=0;x-=5){const y=baseY+bh+Math.sin(x/wl+i*0.5+phase)*amp*(0.3+x/CW*0.7); ctx.lineTo(x,y);}
    ctx.closePath(); ctx.fill();
  }
}

// ── Riley H: Late Morning / Vertical stripes (1967, Achaean 1981) — Riley's
// post-1967 colour signature. Pure vertical stripes of chord colours, no
// waves, no patterns. Stripe count scales with song length; reveal sweeps
// left-to-right.
function rileyPhaseStripes(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));

  // Stripe count grows with chord density.
  const stripes = cn<=8?16:cn<=24?28:cn<=60?42:cn<=120?56:cn<=240?72:cn<=400?96:120;
  const stripeW = CW/stripes;
  // Reveal-based: stripes appear left-to-right.
  const visStripes = Math.max(1, Math.ceil(stripes*reveal));

  // Light ground for un-revealed area.
  ctx.fillStyle = isBW ? '#e8e8e4' : '#f0ece2';
  ctx.fillRect(0,0,CW,CH);

  // Slight saturation boost so colours pop as pure bands.
  // Pastel tone: skip the boost.
  for(let i=0;i<visStripes;i++){
    const t = i/stripes;
    const {rgb} = _picChord(chords, Math.floor(t * cn)%cn, gc, isBW);
    const _k = _pastelOn ? 1 : 1.05;
    const r = Math.min(255, rgb[0]*_k);
    const g = Math.min(255, rgb[1]*_k);
    const b = Math.min(255, rgb[2]*_k);
    ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
    ctx.fillRect(i*stripeW, 0, stripeW+1, CH);
  }
}

// ── Riley I: Crest (1964) — single-gesture Riley. 24 parallel S-curve
// bands sweeping horizontally — all share the same sinusoid so the painting
// reads as one curved form rather than many. Black + cream alternating
// stripes with chord-coloured overlay tints. Reveal scales band visibility.
function rileyPhaseCrest(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));
  const sR = _seedRnd(35001, ss, 0, 0); sR(); sR();

  // White ground.
  ctx.fillStyle = isBW ? '#ececea' : '#f8f6f0';
  ctx.fillRect(0,0,CW,CH);

  // Curve parameters — slight variation per painting.
  const phase = sR()*Math.PI*2;
  const freq = 1.2 + sR()*0.6; // gentle S-curve, 1-2 wavelengths
  const ampScale = 0.08 + sR()*0.06;

  // Band count.
  const bands = cn<=8?12:cn<=24?18:cn<=60?22:cn<=120?26:30;
  const visBands = Math.max(2, Math.ceil(bands*reveal));
  const bandH = (CH*0.70)/bands;
  const yStart = CH*0.15;

  // First pass: B/W alternating bands following the shared curve.
  for(let i=0;i<visBands;i++){
    const yBase = yStart + i*bandH;
    const col = (i%2) ? (isBW ? '#1a1a1a' : '#1a1a1a') : (isBW ? '#e8e8e4' : '#f0ece2');
    ctx.fillStyle = col;
    ctx.beginPath();
    const segs = 50;
    for(let s=0;s<=segs;s++){
      const x = (s/segs)*CW;
      const w = Math.sin(x/CW*Math.PI*freq + phase) * CH*ampScale;
      const y = yBase + w;
      if(s===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for(let s=segs;s>=0;s--){
      const x = (s/segs)*CW;
      const w = Math.sin(x/CW*Math.PI*freq + phase) * CH*ampScale;
      const y = yBase + w + bandH;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Second pass: chord-coloured overlay tints (one per ~4 bands).
  const tintCount = Math.max(2, Math.ceil(visBands/4));
  for(let i=0;i<tintCount;i++){
    const t = i/Math.max(1, tintCount-1);
    const yBase = yStart + t*(visBands*bandH - bandH*4);
    const {rgb} = _picChord(chords, Math.floor(t*cn)%cn, gc, isBW);
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.25)`;
    ctx.beginPath();
    const segs = 50;
    for(let s=0;s<=segs;s++){
      const x = (s/segs)*CW;
      const w = Math.sin(x/CW*Math.PI*freq + phase) * CH*ampScale;
      const y = yBase + w;
      if(s===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for(let s=segs;s>=0;s--){
      const x = (s/segs)*CW;
      const w = Math.sin(x/CW*Math.PI*freq + phase) * CH*ampScale;
      const y = yBase + w + bandH*4;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
}

// ── Joan Mitchell (abstract expressionism) ─────────────────────────────────
// ── Joan Mitchell Overlay — abstract expressionism, no figures, all gesture ──
// 6 phases honouring Mitchell's career: gestural garden, color bursts, diptych
// field, dark central mass (early "violent" 60s), sunflower (Van Gogh hommage
// 1990-91), late sparse white (1992 final paintings).
// All colours driven by _picChord (song palette), densities by chord count and
// computeSongCharacter, deterministic from sessionSeed + phaseIndex so the
// same song + style + variant always recalls the identical painting.
function drawMitchellOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  const ss = sessionSeed | 0;
  // 6-PHASE CHOOSER (Free cap=2 sees Gestural Garden + Color Bursts).
  //  A = Gestural Garden (all-over impasto, 70-110 strokes).
  //  B = Color Bursts (4-7 radial explosions).
  //  C = Diptych Field (2 panels with vertical seam + bridging strokes).
  //  D = Dark Central Mass (60s "violent" period — dense central blob).
  //  E = Sunflower (Van Gogh hommage 1990-91, vertical stems + flower heads).
  //  F = Late Sparse White (1992 — white ground, 2-3 concentrated zones).
  const _pn=_capN(6); const pick=((phaseIndex|0)%_pn+_pn)%_pn;
  if(pick===1){ mitchellPhaseBursts(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===2){ mitchellPhaseDiptych(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===3){ mitchellPhaseDarkMass(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===4){ mitchellPhaseSunflower(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===5){ mitchellPhaseLateWhite(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  mitchellPhaseGarden(ctx,CW,CH,chords,lim,gc,ss,mode);
}

// ── Impasto multi-layer brush stroke. Three offset layers with slight colour
// drift give the chunky oil-paint feel without requiring per-pixel work. All
// random offsets are seeded from (idx, ss) so two paintings of the same song
// + variant always produce identical strokes. ──
function _mitchImpasto(ctx, x0, y0, x1, y1, rgb, baseW, ss, idx){
  for(let layer=0; layer<3; layer++){
    const lr=_seedRnd(idx*7+layer+9050, ss, 0, 0); lr();
    const offsetX=(lr()-0.5)*baseW*0.4;
    const offsetY=(lr()-0.5)*baseW*0.4;
    const dr=lr()-0.5, dg=lr()-0.5, db=lr()-0.5;
    const r=Math.max(0,Math.min(255, rgb[0]+dr*40))|0;
    const g=Math.max(0,Math.min(255, rgb[1]+dg*40))|0;
    const b=Math.max(0,Math.min(255, rgb[2]+db*40))|0;
    ctx.strokeStyle=`rgba(${r},${g},${b},${0.45+layer*0.20})`;
    ctx.lineWidth=baseW*(1-layer*0.15);
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(x0+offsetX, y0+offsetY);
    const cpx=(x0+x1)/2+offsetX+(lr()-0.5)*baseW;
    const cpy=(y0+y1)/2+offsetY+(lr()-0.5)*baseW;
    ctx.quadraticCurveTo(cpx, cpy, x1+offsetX, y1+offsetY);
    ctx.stroke();
  }
}

// ── Mitchell A: Gestural Garden — all-over impasto in song palette. ──
function mitchellPhaseGarden(ctx, CW, CH, chords, lim, gc, sessionSeed, mode){
  const ss=sessionSeed|0, isBW=mode==='bw', cn=chords.length;
  const N=Math.max(1, Math.min(cn, lim));
  const reveal=Math.max(0, Math.min(1, N/cn));
  const D=Math.min(CW, CH);
  // Cream ground (palette-independent for stable identity; tone-adjusted).
  const _adjHex=(hex)=>{
    let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    if(typeof _energyTint==='function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint==='function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return `rgb(${r},${g},${b})`;
  };
  if(chords && chords.length){ const _c0=chords[0]; _setCurE(_c0 && _c0._E); }
  ctx.fillStyle=isBW ? _adjHex('#e8e2d4') : _adjHex('#f4eee0');
  ctx.fillRect(0,0,CW,CH);
  // Stroke count scales with chord count + song character.
  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const drive=_ch ? (0.55*_ch.energy + 0.45*_ch.density) : 0.5;
  const strokeCountFull=Math.max(60, Math.round(70 + drive*40));
  const visStrokes=Math.max(8, Math.ceil(strokeCountFull*reveal));
  for(let i=0; i<visStrokes; i++){
    const r=_seedRnd(i+9100, ss, 0, 0); r(); r();
    const cx=CW*r();
    const cy=CH*r();
    const len=D*(0.06 + r()*0.14);
    const ang=r()*Math.PI*2;
    const w=D*(0.012 + r()*0.020);
    // Colour from song palette via chord index (cycled).
    const {rgb}=_picChord(chords, i%cn, gc, isBW);
    const x0=cx - Math.cos(ang)*len*0.5;
    const y0=cy - Math.sin(ang)*len*0.5;
    const x1=cx + Math.cos(ang)*len*0.5;
    const y1=cy + Math.sin(ang)*len*0.5;
    _mitchImpasto(ctx, x0, y0, x1, y1, rgb, w, ss, i);
  }
  // Drip accents — scale with reveal.
  const drips=Math.ceil(20*reveal);
  for(let i=0; i<drips; i++){
    const pr=_seedRnd(i+9150, ss, 0, 0); pr();
    const {rgb}=_picChord(chords, (i*3)%cn, gc, isBW);
    ctx.strokeStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.40+pr()*0.30})`;
    ctx.lineWidth=Math.max(1, D*0.0025);
    ctx.beginPath();
    ctx.moveTo(pr()*CW, pr()*CH);
    ctx.lineTo(pr()*CW+(pr()-0.5)*20, pr()*CH+D*(0.04+pr()*0.08));
    ctx.stroke();
  }
}

// ── Mitchell B: Color Bursts — radial explosions, each tied to a chord. ──
function mitchellPhaseBursts(ctx, CW, CH, chords, lim, gc, sessionSeed, mode){
  const ss=sessionSeed|0, isBW=mode==='bw', cn=chords.length;
  const N=Math.max(1, Math.min(cn, lim));
  const reveal=Math.max(0, Math.min(1, N/cn));
  const D=Math.min(CW, CH);
  const _adjHex=(hex)=>{
    let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    if(typeof _energyTint==='function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint==='function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return `rgb(${r},${g},${b})`;
  };
  if(chords && chords.length){ const _c0=chords[0]; _setCurE(_c0 && _c0._E); }
  ctx.fillStyle=isBW ? _adjHex('#dcd6c8') : _adjHex('#e8e2d0');
  ctx.fillRect(0,0,CW,CH);
  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const drive=_ch ? (0.55*_ch.energy + 0.45*_ch.density) : 0.5;
  const burstCountFull=Math.max(3, Math.min(7, Math.round(4 + drive*3)));
  const visBursts=Math.max(1, Math.ceil(burstCountFull*reveal));
  for(let i=0; i<visBursts; i++){
    const br=_seedRnd(i+9200, ss, 0, 0); br(); br();
    const cx=CW*(0.15 + br()*0.70);
    const cy=CH*(0.15 + br()*0.70);
    const R=D*(0.16 + br()*0.10);
    // Each burst takes its palette from one chord (cycled).
    const {rgb}=_picChord(chords, i%cn, gc, isBW);
    const strokes=18 + Math.floor(br()*12);
    for(let s=0; s<strokes; s++){
      const sr=_seedRnd(i*40+s+9250, ss, 0, 0); sr();
      const ang=sr()*Math.PI*2;
      const dist=R*(0.2 + sr()*0.9);
      const x1=cx + Math.cos(ang)*dist*0.3;
      const y1=cy + Math.sin(ang)*dist*0.3;
      const x2=cx + Math.cos(ang)*dist;
      const y2=cy + Math.sin(ang)*dist;
      const w=Math.max(1.5, D*(0.008 + sr()*0.014));
      _mitchImpasto(ctx, x1, y1, x2, y2, rgb, w, ss, i*200+s);
    }
  }
}

// ── Mitchell C: Diptych Field — two panels, each its own chord sub-range. ──
function mitchellPhaseDiptych(ctx, CW, CH, chords, lim, gc, sessionSeed, mode){
  const ss=sessionSeed|0, isBW=mode==='bw', cn=chords.length;
  const N=Math.max(1, Math.min(cn, lim));
  const reveal=Math.max(0, Math.min(1, N/cn));
  const D=Math.min(CW, CH);
  const _adjHex=(hex)=>{
    let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    if(typeof _energyTint==='function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint==='function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return `rgb(${r},${g},${b})`;
  };
  if(chords && chords.length){ const _c0=chords[0]; _setCurE(_c0 && _c0._E); }
  ctx.fillStyle=isBW ? _adjHex('#e4ddc6') : _adjHex('#efeadc');
  ctx.fillRect(0,0,CW,CH);
  // Vertical seam.
  ctx.strokeStyle=isBW ? 'rgba(180,175,160,0.55)' : 'rgba(200,195,180,0.55)';
  ctx.lineWidth=1.5;
  ctx.beginPath();
  ctx.moveTo(CW/2, 0); ctx.lineTo(CW/2, CH);
  ctx.stroke();
  // Left panel uses first half of chords; right panel uses second half.
  const halfCn=Math.max(1, Math.floor(cn/2));
  const panels=[
    {x0:0, x1:CW/2, chordStart:0, chordEnd:halfCn},
    {x0:CW/2, x1:CW, chordStart:halfCn, chordEnd:cn}
  ];
  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const drive=_ch ? (0.55*_ch.energy + 0.45*_ch.density) : 0.5;
  const strokesPerPanel=Math.max(20, Math.round(40 + drive*20));
  const visStrokesPerPanel=Math.max(4, Math.ceil(strokesPerPanel*reveal));
  for(let p=0; p<panels.length; p++){
    const pan=panels[p];
    const panW=pan.x1-pan.x0;
    const panChords=Math.max(1, pan.chordEnd - pan.chordStart);
    for(let i=0; i<visStrokesPerPanel; i++){
      const br=_seedRnd(i+p*500+9300, ss, 0, 0); br(); br();
      const cx=pan.x0 + panW*br();
      const cy=CH*br();
      const len=D*(0.05 + br()*0.12);
      const ang=br()*Math.PI*2;
      const w=D*(0.010 + br()*0.018);
      const chordIdx=pan.chordStart + (i % panChords);
      const {rgb}=_picChord(chords, chordIdx, gc, isBW);
      const x0=cx - Math.cos(ang)*len*0.5;
      const y0=cy - Math.sin(ang)*len*0.5;
      const x1=cx + Math.cos(ang)*len*0.5;
      const y1=cy + Math.sin(ang)*len*0.5;
      _mitchImpasto(ctx, x0, y0, x1, y1, rgb, w, ss, i+p*500);
    }
  }
  // Bridging strokes across the seam (use transitional chords near midpoint).
  const bridgesFull=Math.max(3, Math.min(6, Math.round(3+drive*3)));
  const visBridges=Math.max(1, Math.ceil(bridgesFull*reveal));
  for(let i=0; i<visBridges; i++){
    const br=_seedRnd(i+9380, ss, 0, 0); br(); br();
    const y=CH*(0.20 + br()*0.60);
    const transitionIdx=Math.max(0, Math.min(cn-1, halfCn-1 + (i%3)-1));
    const {rgb}=_picChord(chords, transitionIdx, gc, isBW);
    const x0=CW*0.35 + br()*CW*0.10;
    const x1=CW*0.55 + br()*CW*0.10;
    const w=D*(0.014 + br()*0.014);
    _mitchImpasto(ctx, x0, y, x1, y+(br()-0.5)*D*0.08, rgb, w, ss, i+9390);
  }
}

// ── Mitchell D: Dark Central Mass — 60s "violent" period. Song palette tone-
// downed (multiplied) so the painting still reflects the song's colours but
// in a darker, denser register. ──
function mitchellPhaseDarkMass(ctx, CW, CH, chords, lim, gc, sessionSeed, mode){
  const ss=sessionSeed|0, isBW=mode==='bw', cn=chords.length;
  const N=Math.max(1, Math.min(cn, lim));
  const reveal=Math.max(0, Math.min(1, N/cn));
  const D=Math.min(CW, CH);
  const _adjHex=(hex)=>{
    let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    if(typeof _energyTint==='function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint==='function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return `rgb(${r},${g},${b})`;
  };
  if(chords && chords.length){ const _c0=chords[0]; _setCurE(_c0 && _c0._E); }
  ctx.fillStyle=isBW ? _adjHex('#d4ccb4') : _adjHex('#e0d8c0');
  ctx.fillRect(0,0,CW,CH);
  const r0=_seedRnd(9400, ss, 0, 0); r0(); r0();
  const massX=CW*0.5 + (r0()-0.5)*CW*0.10;
  const massY=CH*0.5 + (r0()-0.5)*CH*0.10;
  const massR=D*0.28;
  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const drive=_ch ? (0.55*_ch.energy + 0.45*_ch.density) : 0.5;
  const strokesFull=Math.max(60, Math.round(80 + drive*40));
  const visStrokes=Math.max(8, Math.ceil(strokesFull*reveal));
  // Darkening factor — multiplies song palette to give the "violent" mood.
  const DARK_MUL=0.40;
  for(let i=0; i<visStrokes; i++){
    const br=_seedRnd(i+9420, ss, 0, 0); br(); br();
    // Gaussian-ish cluster around mass center (sqrt skews toward middle).
    const angR=br()*Math.PI*2;
    const distR=Math.sqrt(br())*massR;
    const cx=massX + Math.cos(angR)*distR;
    const cy=massY + Math.sin(angR)*distR;
    const len=D*(0.04 + br()*0.10);
    const ang=br()*Math.PI*2;
    const w=D*(0.010 + br()*0.020);
    // Song palette tone-downed.
    const {rgb}=_picChord(chords, i%cn, gc, isBW);
    const darkR=[Math.round(rgb[0]*DARK_MUL), Math.round(rgb[1]*DARK_MUL), Math.round(rgb[2]*DARK_MUL)];
    const x0=cx - Math.cos(ang)*len*0.5;
    const y0=cy - Math.sin(ang)*len*0.5;
    const x1=cx + Math.cos(ang)*len*0.5;
    const y1=cy + Math.sin(ang)*len*0.5;
    _mitchImpasto(ctx, x0, y0, x1, y1, darkR, w, ss, i+9420);
  }
  // Outward angry drips.
  const dripsFull=15;
  const visDrips=Math.max(2, Math.ceil(dripsFull*reveal));
  for(let i=0; i<visDrips; i++){
    const pr=_seedRnd(i+9490, ss, 0, 0); pr();
    const ang=pr()*Math.PI*2;
    const start=massR*(0.7 + pr()*0.3);
    const end=massR*(1.1 + pr()*0.8);
    const x0=massX + Math.cos(ang)*start;
    const y0=massY + Math.sin(ang)*start;
    const x1=massX + Math.cos(ang)*end;
    const y1=massY + Math.sin(ang)*end;
    const {rgb}=_picChord(chords, (i*3)%cn, gc, isBW);
    const darkR=[Math.round(rgb[0]*DARK_MUL), Math.round(rgb[1]*DARK_MUL), Math.round(rgb[2]*DARK_MUL)];
    ctx.strokeStyle=`rgba(${darkR[0]},${darkR[1]},${darkR[2]},${0.55+pr()*0.30})`;
    ctx.lineWidth=Math.max(1.5, D*0.005);
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.stroke();
  }
}

// ── Mitchell E: Sunflower — vertical stems + flower heads (Van Gogh hommage). ──
function mitchellPhaseSunflower(ctx, CW, CH, chords, lim, gc, sessionSeed, mode){
  const ss=sessionSeed|0, isBW=mode==='bw', cn=chords.length;
  const N=Math.max(1, Math.min(cn, lim));
  const reveal=Math.max(0, Math.min(1, N/cn));
  const D=Math.min(CW, CH);
  // Song-aware baseline tint (35% lerp toward the piece's top-pitch colour).
  // Keeps Mitchell's sunflowers as sunflowers (yellow/orange petals, green
  // stems, cream ground) but each song blooms in its own light: a synth-pop
  // piece shifts the field to rose-mauve, a late Romantic one to bronze.
  // Same seed → same composition; only the colour temperature changes.
  const _tint = (!isBW && typeof _songTint === 'function') ? _songTint(chords, gc) : null;
  const _T = (b)=> (typeof _tintBaseline === 'function') ? _tintBaseline(b, _tint, 0.35) : b.slice();
  const _bPetalY = _T([200, 160, 30]);
  const _bPetalO = _T([200, 100, 30]);
  const _bStem   = _T([40, 110, 50]);
  const _bGndTop = _T([224, 212, 184]);   // #e0d4b8
  const _bGndBot = _T([200, 168, 144]);   // #c8a890
  const _adjHex=(hex)=>{
    let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    if(typeof _energyTint==='function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint==='function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return `rgb(${r},${g},${b})`;
  };
  const _adjRGB=(arr)=>{
    let r=arr[0]|0, g=arr[1]|0, b=arr[2]|0;
    if(typeof _energyTint==='function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint==='function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return `rgb(${r|0},${g|0},${b|0})`;
  };
  if(chords && chords.length){ const _c0=chords[0]; _setCurE(_c0 && _c0._E); }
  // Warm cream-pink ground gradient — song-tinted in colour mode.
  const grad=ctx.createLinearGradient(0,0,0,CH);
  if(isBW){
    grad.addColorStop(0, _adjHex('#d8d0bc'));
    grad.addColorStop(1, _adjHex('#bcb098'));
  } else {
    grad.addColorStop(0, _adjRGB(_bGndTop));
    grad.addColorStop(1, _adjRGB(_bGndBot));
  }
  ctx.fillStyle=grad;
  ctx.fillRect(0,0,CW,CH);
  // Stem count scales with chord count.
  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const drive=_ch ? (0.55*_ch.energy + 0.45*_ch.density) : 0.5;
  const stemsFull=Math.max(6, Math.min(13, Math.round(8 + drive*5)));
  const visStems=Math.max(2, Math.ceil(stemsFull*reveal));
  // Stems — green/blue range derived from song palette (chord-based but biased green).
  for(let i=0; i<visStems; i++){
    const sr=_seedRnd(i+9500, ss, 0, 0); sr();
    const baseX=CW*(0.30 + i*0.40/stemsFull + (sr()-0.5)*0.05);
    const startY=CH*(0.95 + sr()*0.05);
    const endY=CH*(0.35 + sr()*0.20);
    // Stem colour: take chord but bias green/blue.
    const {rgb}=_picChord(chords, i%cn, gc, isBW);
    const stemCol=isBW
      ? [60+rgb[0]*0.2, 90+rgb[1]*0.2, 50+rgb[2]*0.2]
      : [_bStem[0]+rgb[0]*0.2, _bStem[1]+rgb[1]*0.3, _bStem[2]+rgb[2]*0.2];
    // Multi-layer stem.
    for(let layer=0; layer<3; layer++){
      const lr=_seedRnd(i*30+layer+9510, ss, 0, 0); lr();
      const offset=(lr()-0.5)*D*0.01;
      const drR=Math.max(0,Math.min(255, stemCol[0]+(lr()-0.5)*30))|0;
      const drG=Math.max(0,Math.min(255, stemCol[1]+(lr()-0.5)*30))|0;
      const drB=Math.max(0,Math.min(255, stemCol[2]+(lr()-0.5)*30))|0;
      ctx.strokeStyle=`rgba(${drR},${drG},${drB},${0.5+layer*0.20})`;
      ctx.lineWidth=D*(0.008 - layer*0.002);
      ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(baseX+offset, startY);
      const cpx=baseX + (lr()-0.5)*D*0.04;
      const cpy=(startY+endY)/2;
      ctx.quadraticCurveTo(cpx, cpy, baseX+(lr()-0.5)*D*0.03, endY);
      ctx.stroke();
    }
  }
  // Flower heads — Mitchell's ACTUAL Sunflower language: each head is an
  // explosive gestural tangle of short impasto strokes (yellow/orange/umbra/
  // olive) at chaotic angles around a dark tangled core, plus gravity
  // drips. Sunflower as ENERGY, not illustration.
  for(let i=0; i<visStems; i++){
    const fr=_seedRnd(i+9550, ss, 0, 0); fr(); fr();
    const fx=CW*(0.30 + i*0.40/stemsFull + (fr()-0.5)*0.05);
    const fy=CH*(0.35 + fr()*0.20);
    const {rgb}=_picChord(chords, (i*2+1)%cn, gc, isBW);
    const palY=isBW?[190,182,150]:[_bPetalY[0]+rgb[0]*0.15,_bPetalY[1]+rgb[1]*0.20,_bPetalY[2]+rgb[2]*0.1];
    const palO=isBW?[160,148,120]:[_bPetalO[0]+rgb[0]*0.10,_bPetalO[1]+rgb[1]*0.15,_bPetalO[2]+rgb[2]*0.1];
    const palU=isBW?[110,100, 84]:[138+rgb[0]*0.10, 90+rgb[1]*0.10, 36+rgb[2]*0.05];   // umbra
    const palG=isBW?[120,124,100]:[_bStem[0]+30, _bStem[1]+20, _bStem[2]];             // olive
    const heads=[palY,palY,palO,palO,palU,palG];
    const fsize=D*(0.07 + fr()*0.055);
    // Outer burst — chaotic short strokes, varied radius/length/width.
    const burst=44 + Math.floor(fr()*26);
    for(let p=0; p<burst; p++){
      const br=_seedRnd(i*200+p+9560, ss, 0, 0);
      const a0=br()*Math.PI*2;
      const r0=br()*fsize*0.35;
      const r1=r0+fsize*(0.30+br()*0.75);
      const a1=a0+(br()-0.5)*1.2;
      const x1=fx+Math.cos(a0)*r0, y1=fy+Math.sin(a0)*r0;
      const x2=fx+Math.cos(a1)*r1, y2=fy+Math.sin(a1)*r1;
      const col=heads[Math.floor(br()*heads.length)];
      const w=D*(0.006+br()*0.012);
      _mitchImpasto(ctx, x1, y1, x2, y2, col, w, ss, i*300+p+9560);
    }
    // Dark tangled core — short crossing strokes, no clean disc.
    const coreCol=isBW?[52,47,42]:[74,50,24];
    const coreN=14+Math.floor(fr()*8);
    for(let p=0; p<coreN; p++){
      const cr=_seedRnd(i*200+p+9880, ss, 0, 0);
      const a=cr()*Math.PI*2, r0=cr()*fsize*0.30;
      const x1=fx+Math.cos(a)*r0*0.2, y1=fy+Math.sin(a)*r0*0.2;
      const x2=fx+Math.cos(a+(cr()-0.5)*2)*fsize*0.32, y2=fy+Math.sin(a+(cr()-0.5)*2)*fsize*0.32;
      _mitchImpasto(ctx, x1, y1, x2, y2, coreCol, D*0.007, ss, i*300+p+9880);
    }
    // Gravity drips off the head — Mitchell lets the paint run.
    const drips=2+Math.floor(fr()*2);
    for(let p=0; p<drips; p++){
      const dr=_seedRnd(i*40+p+9950, ss, 0, 0);
      const dx=fx+(dr()-0.5)*fsize*1.3;
      const dy=fy+fsize*(0.2+dr()*0.4);
      const len=D*(0.05+dr()*0.09);
      const col=heads[Math.floor(dr()*heads.length)];
      ctx.strokeStyle=`rgba(${col[0]|0},${col[1]|0},${col[2]|0},0.5)`;
      ctx.lineWidth=1.6+dr()*1.4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(dx, dy);
      ctx.quadraticCurveTo(dx+(dr()-0.5)*8, dy+len*0.55, dx+(dr()-0.5)*5, dy+len);
      ctx.stroke();
    }
  }
}

// ── Mitchell F: Late Sparse White — 1992 final paintings. White ground with
// 2-3 concentrated zones tied to chord positions in the song (start/middle/end). ──
function mitchellPhaseLateWhite(ctx, CW, CH, chords, lim, gc, sessionSeed, mode){
  const ss=sessionSeed|0, isBW=mode==='bw', cn=chords.length;
  const N=Math.max(1, Math.min(cn, lim));
  const reveal=Math.max(0, Math.min(1, N/cn));
  const D=Math.min(CW, CH);
  const _adjHex=(hex)=>{
    let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    if(typeof _energyTint==='function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint==='function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return `rgb(${r},${g},${b})`;
  };
  if(chords && chords.length){ const _c0=chords[0]; _setCurE(_c0 && _c0._E); }
  // White unprimed canvas.
  ctx.fillStyle=isBW ? _adjHex('#f0eee4') : _adjHex('#fafaf2');
  ctx.fillRect(0,0,CW,CH);
  // Subtle canvas weave texture (seeded).
  for(let i=0; i<150; i++){
    const pr=_seedRnd(i+9610, ss, 0, 0); pr();
    ctx.fillStyle=`rgba(220,215,200,${0.04+pr()*0.06})`;
    ctx.beginPath();
    ctx.arc(pr()*CW, pr()*CH, 0.4+pr()*1.0, 0, Math.PI*2);
    ctx.fill();
  }
  // 2-3 zones. Each maps to a key chord position in the song.
  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const drive=_ch ? (0.55*_ch.energy + 0.45*_ch.density) : 0.5;
  const zonesFull=Math.max(2, Math.min(3, Math.round(2 + drive*1)));
  const visZones=Math.max(1, Math.ceil(zonesFull*reveal));
  // Zone chord positions: start, middle, end (interpolated to zone count).
  for(let z=0; z<visZones; z++){
    const zr=_seedRnd(z+9650, ss, 0, 0); zr(); zr();
    const zx=CW*(0.20 + z*0.30 + (zr()-0.5)*0.08);
    const zy=CH*(0.30 + zr()*0.30);
    const zR=D*(0.15 + zr()*0.10);
    // Chord index for this zone: 0 / cn/2 / cn-1 (interpolated).
    const chordIdx=Math.floor((z/(zonesFull-1 || 1))*(cn-1));
    const {rgb}=_picChord(chords, chordIdx, gc, isBW);
    // Concentrated impasto strokes within zone.
    const strokeCount=20 + Math.floor(zr()*15);
    for(let i=0; i<strokeCount; i++){
      const sr=_seedRnd(z*200+i+9660, ss, 0, 0); sr();
      const ang=sr()*Math.PI*2;
      const dist=Math.sqrt(sr())*zR;
      const cx=zx + Math.cos(ang)*dist;
      const cy=zy + Math.sin(ang)*dist;
      const slen=D*(0.04 + sr()*0.08);
      const sang=sr()*Math.PI*2;
      const w=D*(0.012 + sr()*0.014);
      const x0=cx - Math.cos(sang)*slen*0.5;
      const y0=cy - Math.sin(sang)*slen*0.5;
      const x1=cx + Math.cos(sang)*slen*0.5;
      const y1=cy + Math.sin(sang)*slen*0.5;
      _mitchImpasto(ctx, x0, y0, x1, y1, rgb, w, ss, z*200+i+9670);
    }
    // Down-thrusting trail (Mitchell's late signature drip).
    const trailX=zx + (zr()-0.5)*D*0.04;
    const trailY=zy + zR*0.7;
    const trailEnd=trailY + D*(0.12 + zr()*0.10);
    ctx.strokeStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.50+zr()*0.30})`;
    ctx.lineWidth=Math.max(2, D*0.006);
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(trailX, trailY);
    ctx.quadraticCurveTo(trailX+(zr()-0.5)*D*0.02, (trailY+trailEnd)/2, trailX+(zr()-0.5)*D*0.04, trailEnd);
    ctx.stroke();
  }
}


// ─── Monet (Light) — 6 variants ─────────────────────────────────────────────
// All explore light, atmosphere, plein-air painting. Outlines forbidden.
//  0/Garden: edge-to-edge comma-stroke carpet (Givernyho záhrada)
//  1/Pond:   horizontal water bands + lily pads (lekná na hladine)
//  2/Cathedral: vertical haze, dawn-to-dusk light wash (Rouenská katedrála)
//  3/Haystack: single mass against open sky (Kopa sena)
//  4/Snow:    cool whites + pale strokes (Zasnežená krajina)
//  5/Mist:    near-monochrome, very soft (Hmla nad riekou)
function drawMonetOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  const ss = sessionSeed | 0;
  const _pn = _capN(6);
  const _fpick = ((phaseIndex|0) % _pn + _pn) % _pn;
  // 6-variant abstract ladder — atmosphere + suggestion only, no literal shapes.
  //  0 = Tulip Fields — Holland (1886), horizontal chord-coloured bands.
  //  1 = Reflections — water surface, vertical chord streaks + ripple highlights.
  //  2 = Cathedral — Rouen series (1892-94), chord gradient + faint silhouette.
  //  3 = Bridge in Mist — Charing Cross (1899-1904), long horizontal silhouette.
  //  4 = Wisteria Cascade — Wisteria (1917-19), abstract vertical chord drips.
  //  5 = Mist — Morning on Seine, pastel horizontal atmosphere.
  // Free preview (cap=2): Tulip Fields + Reflections — horizontal bands vs water.
  // Every phase is atmospheric and chord-driven; subjects are suggested only
  // through dabs, strokes, and faint silhouettes — never literal geometry.
  if(_fpick === 1){ monetPhaseReflections(ctx, CW, CH, chords, lim, gc, ss, mode); return; }
  if(_fpick === 2){ monetPhaseCathedral(ctx, CW, CH, chords, lim, gc, ss, mode); return; }
  if(_fpick === 3){ monetPhaseBridgeMist(ctx, CW, CH, chords, lim, gc, ss, mode); return; }
  if(_fpick === 4){ monetPhaseWisteria(ctx, CW, CH, chords, lim, gc, ss, mode); return; }
  if(_fpick === 5){ monetPhaseMist(ctx, CW, CH, chords, lim, gc, ss, mode); return; }
  monetPhaseTulipFields(ctx, CW, CH, chords, lim, gc, ss, mode);
}

// Variant 0 — Garden: perspective path receding to vanishing point with
// flanking flower beds. Composition (path + horizon + canopy) is variant
// scaffolding; every coloured stroke comes from gc() so the painting still
// follows the user's palette and the chord at that depth.

// Variant 1 — Pond: vertical sky-reflection bands + lily clusters + willow
// trails. Sky reflections, willows, pads, and blossoms all draw from gc().
// Substrate is a dark teal "deep water" so the palette colours read as
// reflections on a pond rather than as a coloured floor.

// Variant 2 — Cathedral: vertical light wash. The wash itself is built from
// the chord sequence (top chord → top colour, mid → mid, bottom → bottom),
// so the gradient is the palette translated to a vertical scan. Strokes
// layer the same chord colours back on top with mild lightness modulation.
function monetPhaseCathedral(ctx, CW, CH, chords, lim, gc, ss, mode){
  const cn = chords.length;
  const rnd = _seedRnd(91, ss, lim, 2);

  // Sample three depth-points from the piece for a chord-driven gradient.
  // The lift makes the gradient feel like daylight playing on stone, but
  // the hues come straight from gc(), not from a hardcoded gold→violet.
  function sampleChordColor(t, lightLift){
    const ci = Math.min(cn - 1, Math.max(0, Math.floor(t * cn)));
    const chord = chords[ci];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [{ m: 60, v: 90 }];
    const note = notes[0];
    const m = note.m !== undefined ? note.m : note;
    const [r, g, b] = gc(m, 100);
    const lr = Math.max(0, Math.min(255, r + lightLift));
    const lg = Math.max(0, Math.min(255, g + lightLift));
    const lb = Math.max(0, Math.min(255, b + lightLift));
    return `rgb(${lr|0},${lg|0},${lb|0})`;
  }

  const grad = ctx.createLinearGradient(0, 0, 0, CH);
  grad.addColorStop(0,    sampleChordColor(0.05, 70));   // top — bright daylight tint
  grad.addColorStop(0.45, sampleChordColor(0.40, 25));   // upper mid
  grad.addColorStop(0.85, sampleChordColor(0.80, -30));  // lower mid — shadow
  grad.addColorStop(1,    sampleChordColor(0.95, -60));  // bottom — deep shadow
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CW, CH);

  // Cathedral silhouette — dark transparent shadow, palette-independent
  // physical element. Position (left/centre/right) and width vary per song.
  const cathedralPos = Math.floor(rnd()*3);      // 0=left, 1=centre, 2=right
  const towerXFrac = cathedralPos===0 ? 0.32 : cathedralPos===1 ? 0.50 : 0.68;
  const towerCX = CW * towerXFrac;
  const towerWFrac = 0.34 + rnd()*0.14;          // 0.34-0.48 width
  const towerW = CW * towerWFrac;
  const towerLeft = towerCX - towerW / 2;
  const towerRight = towerCX + towerW / 2;
  const towerBase = CH * 0.95;
  const towerTopFlat = CH * (0.16 + rnd()*0.06); // 0.16-0.22 top
  const spireTop = CH * 0.04;

  ctx.fillStyle = 'rgba(30, 22, 38, 0.35)';
  ctx.beginPath();
  ctx.moveTo(towerLeft, towerBase);
  ctx.lineTo(towerLeft, towerTopFlat);
  ctx.lineTo(towerCX - CW * 0.04, towerTopFlat - CH * 0.04);
  ctx.lineTo(towerCX, spireTop);
  ctx.lineTo(towerCX + CW * 0.04, towerTopFlat - CH * 0.04);
  ctx.lineTo(towerRight, towerTopFlat);
  ctx.lineTo(towerRight, towerBase);
  ctx.closePath();
  ctx.fill();

  // Painterly vertical strokes — each stroke uses the chord assigned to its
  // x-position, with lightness modulated by its y (bright at top, shadowed
  // toward bottom). No blend toward a hardcoded gradient — the chord IS
  // the colour.
  // Strokes scaled by playback PROGRESS (lim/cn) instead of a hard cap, so the
  // cathedral keeps gaining impasto right to the last note (was saturating ~60).
  const _ccn = cn > 0 ? cn : Math.max(1, lim);
  const _revF = Math.max(0, Math.min(1, lim / _ccn));
  const STROKES = Math.round(220 + _revF * (2400 - 220));
  ctx.globalAlpha = 0.65;
  for(let k = 0; k < STROKES; k++){
    const x = rnd() * CW;
    const y = rnd() * CH;
    const lenY = 30 + rnd() * 120;
    const w = 1 + rnd() * 3;
    const ci = Math.floor((x / CW) * Math.min(lim, cn)) % Math.max(1, cn);
    const chord = chords[ci];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes);
    if(!notes || !notes.length) continue;
    const note = notes[Math.floor(rnd() * notes.length)];
    const m = note.m !== undefined ? note.m : note;
    const v = note.v !== undefined ? note.v : 100;
    const [r, g, b] = gc(m, v);

    // Lightness modulation by y: +50 at top, -50 at bottom.
    const t = y / CH;
    const yLift = Math.round((1 - t * 1.4) * 50);
    const jr = Math.max(0, Math.min(255, r + yLift + (rnd() - 0.5) * 25));
    const jg = Math.max(0, Math.min(255, g + yLift + (rnd() - 0.5) * 25));
    const jb = Math.max(0, Math.min(255, b + yLift + (rnd() - 0.5) * 25));
    ctx.fillStyle = `rgb(${jr|0},${jg|0},${jb|0})`;
    ctx.fillRect(x, y, w, lenY);
  }
  ctx.globalAlpha = 1;
}

// Variant 3 — Haystack: dome silhouette + sky/field bands. Sky uses bright
// lifted chord colour (sunset wash from early chords), field uses darkened
// chord colour (cool ground from mid chords), dome uses mid-chord colour.
// Strokes follow chord directly with a per-side lightness modulation
// (lit / shadow), no hardcoded warm/cool anchor.

// Variant 4 — Snow: chord-driven cool sky + tinted snow + dark conifers.
// The sky and snow both carry a subtle chord tint so the palette is visible
// even in a "white" scene; drift shadows and tree flickers use chord colour
// directly.

// Variant 5 — Mist: pastel horizontal bands. Sky and water both carry a
// strong chord tint; tree-line silhouette and veils all chord-driven.
// Wash toward white was reduced — mist still feels diffuse but the palette
// stays present.
function monetPhaseMist(ctx, CW, CH, chords, lim, gc, ss, mode){
  const cn = chords.length;
  const rnd = _seedRnd(91, ss, lim, 5);

  function chordColor(t){
    const ci = Math.min(cn - 1, Math.max(0, Math.floor(t * cn)));
    const chord = chords[ci];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [{ m: 60, v: 90 }];
    const note = notes[0];
    const m = note.m !== undefined ? note.m : note;
    return gc(m, 100);
  }

  // ── Per-song layout: sky/water ratio varies (40-60%) ──
  const horizon = CH * (0.40 + rnd()*0.20);

  // Sky — lifted version of first-third chord. Wash is 50/50 (chord + light
  // pastel) rather than 80/20 toward white, so the palette is clearly
  // present.
  const [skyR, skyG, skyB] = chordColor(0.12);
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0,
    `rgb(${Math.round(skyR * 0.5 + 130)},${Math.round(skyG * 0.5 + 130)},${Math.round(skyB * 0.5 + 140)})`);
  sky.addColorStop(1,
    `rgb(${Math.round(skyR * 0.55 + 100)},${Math.round(skyG * 0.55 + 105)},${Math.round(skyB * 0.55 + 120)})`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CW, horizon);

  // Water — mirror of sky, mid-chord based, slightly darker.
  const [watR, watG, watB] = chordColor(0.55);
  const water = ctx.createLinearGradient(0, horizon, 0, CH);
  water.addColorStop(0,
    `rgb(${Math.round(watR * 0.55 + 90)},${Math.round(watG * 0.55 + 95)},${Math.round(watB * 0.55 + 110)})`);
  water.addColorStop(1,
    `rgb(${Math.round(watR * 0.6 + 60)},${Math.round(watG * 0.6 + 65)},${Math.round(watB * 0.6 + 85)})`);
  ctx.fillStyle = water;
  ctx.fillRect(0, horizon, CW, CH - horizon);

  // Faint tree-line at horizon — mid-chord darkened.
  ctx.globalAlpha = 0.35;
  const [hrR, hrG, hrB] = chordColor(0.45);
  ctx.fillStyle =
    `rgb(${Math.round(hrR * 0.5 + 40)},${Math.round(hrG * 0.5 + 45)},${Math.round(hrB * 0.55 + 55)})`;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for(let x = 0; x <= CW; x += CW / 40){
    ctx.lineTo(x, horizon + (rnd() - 0.5) * CH * 0.04 - CH * 0.015);
  }
  ctx.lineTo(CW, horizon);
  ctx.closePath();
  ctx.fill();

  // Mirrored into water (paler).
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for(let x = 0; x <= CW; x += CW / 40){
    ctx.lineTo(x, horizon + (rnd() - 0.5) * CH * 0.04 + CH * 0.015);
  }
  ctx.lineTo(CW, horizon);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Soft horizontal painterly veils — chord colour, lifted modestly.
  ctx.globalAlpha = 0.28;
  for(let i = 0; i < Math.min(80, Math.max(40, lim)); i++){
    const y = rnd() * CH;
    const w = CW * (0.3 + rnd() * 0.5);
    const x = (rnd() - 0.3) * CW;
    const h = CH * (0.015 + rnd() * 0.04);
    const chord = chords[i % Math.max(1, cn)];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes);
    if(!notes || !notes.length) continue;
    const note = notes[i % notes.length];
    const m = note.m !== undefined ? note.m : note;
    const v = note.v !== undefined ? note.v : 100;
    const [r, g, b] = gc(m, v);
    // Lift by ~50 — pastel without washing out the chord.
    const fr = Math.min(255, r + 50);
    const fg = Math.min(255, g + 50);
    const fb = Math.min(255, b + 60);
    ctx.fillStyle = `rgb(${fr|0},${fg|0},${fb|0})`;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y, w / 2, h / 2, 0, 0, 6.2832);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Water ripple short strokes — water chord colour with a slight lift.
  ctx.globalAlpha = 0.55;
  for(let k = 0; k < 200; k++){
    const y = horizon + rnd() * (CH - horizon);
    const x = rnd() * CW;
    const len = 6 + rnd() * 16;
    const rr = Math.min(255, Math.round(watR * 0.5 + 110));
    const gg = Math.min(255, Math.round(watG * 0.5 + 115));
    const bb = Math.min(255, Math.round(watB * 0.5 + 130));
    const a = 0.4 + rnd() * 0.4;
    ctx.strokeStyle = `rgba(${rr},${gg},${bb},${a.toFixed(2)})`;
    ctx.lineWidth = 0.8 + rnd() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Soft sun glow near horizon centre — physical highlight (warm regardless
  // of palette, like a real sun). Kept low so the chord palette still reads.
  const glowGrad = ctx.createRadialGradient(CW * 0.5, horizon, 4, CW * 0.5, horizon, CW * 0.16);
  glowGrad.addColorStop(0, 'rgba(255,230,200,0.45)');
  glowGrad.addColorStop(1, 'rgba(255,230,200,0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, horizon - CH * 0.15, CW, CH * 0.3);
}

// Variant 6 — Poppy Field (Coquelicots, 1873): horizontal landscape with sky,
// clouds, optional tree-line, and chord-coloured poppy dabs scattered over
// green meadow. Layout VERSATILITY: horizon height, cloud count, tree-line
// presence, poppy distribution (uniform vs clustered), cluster centres all
// re-rolled per session seed — different songs produce different compositions,
// not just different colours.

// Variant 7 — Poplars (1891): vertical row of poplars + mirrored reflection.
// Layout VERSATILITY: poplar count (5-12), spacing (uniform vs irregular),
// water line height (42-70%), foliage density per tree, tilt active/inactive,
// reflection depth — all re-rolled per session seed.


// ── Variant abstract 0 — Tulip Fields (Holland 1886): horizontal chord-coloured
// bands suggesting tulip plantings. Sky gradient + soft veils + 5-9 horizontal
// bands of pure chord colour, each band with internal painterly stroke
// texture. NO individual flowers — colour is the subject. Reveal scales band
// count and stroke density.
function monetPhaseTulipFields(ctx, CW, CH, chords, lim, gc, ss, mode){
  const cn = chords.length;
  const isBW = mode === 'bw';
  const rnd = _seedRnd(91, ss, 0, 8);
  const reveal = Math.max(0, Math.min(1, lim / Math.max(1, cn)));

  // Per-song layout decisions.
  const bandCountFull = 5 + Math.floor(rnd()*5);          // 5-9 bands at full
  const skyHeight = CH * (0.30 + rnd()*0.20);              // 30-50%
  const treeLineActive = rnd() < 0.7;
  const veilCount = 15 + Math.floor(rnd()*20);
  // Impressionist stroke density from song character (energy-led): 0.78..1.34×.
  const _chMo = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const _monetStrokeMul = _chMo ? (0.60 + 1.01*(0.6*_chMo.energy + 0.4*_chMo.density)) : 1;

  function chordCol(t){
    const ci = Math.min(cn-1, Math.max(0, Math.floor(t*cn)));
    const chord = chords[ci];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [{m:60,v:90}];
    const note = notes[0];
    const m = note.m !== undefined ? note.m : note;
    const [r,g,b] = gc(m, 100);
    if(isBW){ const v = Math.round(r*0.299+g*0.587+b*0.114); return [v,v,v]; }
    return [r,g,b];
  }
  function chordColIdx(i){
    const ci = Math.min(cn-1, Math.max(0, i%cn));
    const chord = chords[ci];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [{m:60,v:90}];
    const note = notes[i % notes.length];
    const m = note.m !== undefined ? note.m : note;
    const v = note.v !== undefined ? note.v : 100;
    const [r,g,b] = gc(m, v);
    if(isBW){ const vv = Math.round(r*0.299+g*0.587+b*0.114); return [vv,vv,vv]; }
    return [r,g,b];
  }

  // Sky gradient
  const [skyR,skyG,skyB] = chordCol(0.05);
  const sky = ctx.createLinearGradient(0,0,0,skyHeight);
  sky.addColorStop(0, `rgb(${Math.min(255,skyR+95)},${Math.min(255,skyG+100)},${Math.min(255,skyB+110)})`);
  sky.addColorStop(1, `rgb(${Math.min(255,skyR+60)},${Math.min(255,skyG+65)},${Math.min(255,skyB+80)})`);
  ctx.fillStyle = sky;
  ctx.fillRect(0,0,CW,skyHeight);

  // Sky veils (soft chord clouds) — scale with reveal.
  const visVeils = Math.ceil(veilCount * Math.min(1, reveal*1.5));
  ctx.globalAlpha = 0.25;
  for(let i=0;i<visVeils;i++){
    const y = rnd()*skyHeight;
    const w = CW*(0.4+rnd()*0.5);
    const x = (rnd()-0.3)*CW;
    const [r,g,b] = chordColIdx(i);
    ctx.fillStyle = `rgb(${Math.min(255,r+60)|0},${Math.min(255,g+60)|0},${Math.min(255,b+70)|0})`;
    ctx.beginPath();
    ctx.ellipse(x+w/2, y, w/2, CH*0.018, 0, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Tree-line at horizon (optional, appears after 15% reveal).
  if(treeLineActive && reveal > 0.15){
    ctx.globalAlpha = 0.30;
    const [hrR,hrG,hrB] = chordCol(0.25);
    ctx.fillStyle = `rgb(${Math.round(hrR*0.35+15)},${Math.round(hrG*0.4+30)},${Math.round(hrB*0.30+10)})`;
    ctx.beginPath();
    ctx.moveTo(0, skyHeight);
    for(let x=0;x<=CW;x+=CW/30) ctx.lineTo(x, skyHeight + (rnd()-0.5)*CH*0.022 - CH*0.008);
    ctx.lineTo(CW, skyHeight);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Horizontal tulip bands — count grows with reveal.
  // (M1) Bands are CONTIGUOUS: boundaries are precomputed with gentle jitter
  // and each band fills exactly to the next — no black seams.
  // (M4) Perspective: bands near the horizon are thinner (field recedes).
  // (M2) Each band fills with a vertical gradient of its own colour, mixed
  // toward the sky tone near the horizon (atmospheric perspective) — no
  // flat max-saturation bars.
  // (M3) Dabs inside a band stay in the band's hue family (light/dark
  // variations), horizontally elongated like tulip rows; ~10% accents
  // from other chords keep the music audible.
  const fieldStart = skyHeight;
  const fieldH = CH - fieldStart;
  const visBands = Math.max(1, Math.ceil(bandCountFull * reveal));
  // Perspective weights (thin at horizon → broad at foreground), contiguous bounds.
  const _bw=[]; let _bwSum=0;
  for(let b=0;b<bandCountFull;b++){ const w=0.55+1.0*Math.pow(b/Math.max(1,bandCountFull-1),1.2); _bw.push(w); _bwSum+=w; }
  const _bounds=[fieldStart];
  for(let b=0;b<bandCountFull;b++){ _bounds.push(_bounds[b]+fieldH*_bw[b]/_bwSum); }
  for(let b=1;b<bandCountFull;b++){ _bounds[b]+= (rnd()-0.5)*fieldH*0.012; }   // gentle boundary jitter
  // Sky tone for atmospheric mixing — lightened first-chord colour.
  const [_skR,_skG,_skB] = chordCol(0.05);
  const skyMix=[Math.min(255,_skR*0.4+165),Math.min(255,_skG*0.4+150),Math.min(255,_skB*0.4+150)];
  for(let b=0;b<visBands;b++){
    const t = bandCountFull<=1 ? 1 : b/(bandCountFull-1);
    const yStart = _bounds[b];
    const yEnd = _bounds[b+1];
    const yH = yEnd - yStart;
    const [r0,g0,b0] = chordCol(0.3 + t*0.65);
    // Atmospheric desaturation toward the horizon.
    const mixT = 0.45*(1-t);
    const base=[r0*(1-mixT)+skyMix[0]*mixT, g0*(1-mixT)+skyMix[1]*mixT, b0*(1-mixT)+skyMix[2]*mixT];
    const dark=[base[0]*0.75+8, base[1]*0.75+8, base[2]*0.75+14];
    const lite=[Math.min(255,base[0]+42), Math.min(255,base[1]+42), Math.min(255,base[2]+42)];
    const grad = ctx.createLinearGradient(0, yStart, 0, yEnd);
    grad.addColorStop(0, `rgb(${dark[0]|0},${dark[1]|0},${dark[2]|0})`);
    grad.addColorStop(0.55, `rgb(${base[0]|0},${base[1]|0},${base[2]|0})`);
    grad.addColorStop(1, `rgb(${lite[0]|0},${lite[1]|0},${lite[2]|0})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, yStart, CW, yH+1);
    // Dabs — density tracks song character; foreground bands get more/larger.
    const strokesFull = Math.round((140 + Math.floor(rnd()*110)) * _monetStrokeMul * (0.5+t*0.8));
    const visStrokes = Math.ceil(strokesFull * reveal);
    for(let k=0;k<visStrokes;k++){
      const sx = rnd()*CW;
      const sy = yStart + rnd()*yH;
      let dr,dg,db;
      if(rnd() < 0.10){
        const [ar,ag,ab] = chordColIdx(b*30 + k);   // accent from another chord
        dr=ar; dg=ag; db=ab;
      } else {
        const f = (rnd()-0.42)*1.0;                 // -0.42..0.58 → dark..light in-family
        if(f>=0){ dr=Math.min(255,base[0]+f*120); dg=Math.min(255,base[1]+f*120); db=Math.min(255,base[2]+f*120); }
        else    { dr=base[0]*(1+f*0.9); dg=base[1]*(1+f*0.9); db=base[2]*(1+f*0.9); }
      }
      const len = (5 + rnd()*13) * (0.5 + t*0.9);   // tulip-row dabs grow toward foreground
      ctx.strokeStyle = `rgba(${dr|0},${dg|0},${db|0},0.85)`;
      ctx.lineWidth = (1.4+rnd()*2.2) * (0.5 + t*0.7);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx+len, sy+(rnd()-0.5)*1.5);
      ctx.stroke();
    }
  }
}

// ── Variant abstract 1 — Reflections: pond surface with chord streaks and
// ripple highlights. Dark teal water base + vertical sky-reflection streaks
// + dark reflective patches + horizontal ripple highlights + small floating
// chord spots. No lily pads, no willow. Pure abstract surface.
function monetPhaseReflections(ctx, CW, CH, chords, lim, gc, ss, mode){
  const cn = chords.length;
  const isBW = mode === 'bw';
  const rnd = _seedRnd(91, ss, 0, 9);
  const reveal = Math.max(0, Math.min(1, lim / Math.max(1, cn)));

  // Per-song layout decisions.
  const streakCountFull = 50 + Math.floor(rnd()*25);       // 50-75 streaks
  const patchCount = 25 + Math.floor(rnd()*20);            // 25-45 dark patches
  const rippleCountFull = 150 + Math.floor(rnd()*120);     // 150-270 ripples
  const spotCount = 30 + Math.floor(rnd()*25);             // 30-55 highlights

  function chordCol(t){
    const ci = Math.min(cn-1, Math.max(0, Math.floor(t*cn)));
    const chord = chords[ci];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [{m:60,v:90}];
    const note = notes[0];
    const m = note.m !== undefined ? note.m : note;
    const [r,g,b] = gc(m, 100);
    if(isBW){ const v = Math.round(r*0.299+g*0.587+b*0.114); return [v,v,v]; }
    return [r,g,b];
  }
  function chordColIdx(i){
    const ci = Math.min(cn-1, Math.max(0, i%cn));
    const chord = chords[ci];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [{m:60,v:90}];
    const note = notes[i % notes.length];
    const m = note.m !== undefined ? note.m : note;
    const v = note.v !== undefined ? note.v : 100;
    const [r,g,b] = gc(m, v);
    if(isBW){ const vv = Math.round(r*0.299+g*0.587+b*0.114); return [vv,vv,vv]; }
    return [r,g,b];
  }

  // Deep teal-ish water base (palette-independent).
  ctx.fillStyle = isBW ? '#1c1c20' : '#1a2d35';
  ctx.fillRect(0,0,CW,CH);

  // Vertical sky reflection streaks — scale with reveal.
  const visStreaks = Math.ceil(streakCountFull * reveal);
  ctx.globalAlpha = 0.72;
  for(let i=0;i<visStreaks;i++){
    const x = (i/streakCountFull)*CW + (rnd()-0.5)*CW*0.02;
    const sw = CW/streakCountFull*(1.5+rnd()*1.0);
    const yStart = rnd()*CH*0.4;
    const len = CH*(0.45+rnd()*0.50);
    const [r,g,b] = chordCol(i/streakCountFull);
    ctx.fillStyle = `rgb(${Math.min(255,r+70)|0},${Math.min(255,g+70)|0},${Math.min(255,b+85)|0})`;
    ctx.fillRect(x, yStart, sw, len);
  }
  ctx.globalAlpha = 1;

  // Dark reflective patches (chord darkened) — appear with reveal.
  const visPatches = Math.ceil(patchCount * reveal);
  ctx.globalAlpha = 0.55;
  for(let i=0;i<visPatches;i++){
    const x = rnd()*CW;
    const w = CW*(0.05+rnd()*0.10);
    const y = rnd()*CH;
    const h = CH*(0.15+rnd()*0.35);
    const [r,g,b] = chordColIdx(i);
    ctx.fillStyle = `rgb(${Math.round(r*0.25)},${Math.round(g*0.30+15)},${Math.round(b*0.30+10)})`;
    ctx.fillRect(x, y, w, h);
  }
  ctx.globalAlpha = 1;

  // Horizontal ripple highlights — scale with reveal.
  const visRipples = Math.ceil(rippleCountFull * reveal);
  ctx.globalAlpha = 0.65;
  for(let k=0;k<visRipples;k++){
    const y = rnd()*CH;
    const x = rnd()*CW;
    const len = 8+rnd()*22;
    const [r,g,b] = chordColIdx(k+300);
    const lift = 50 + rnd()*30;
    ctx.strokeStyle = `rgba(${Math.min(255,r+lift)|0},${Math.min(255,g+lift)|0},${Math.min(255,b+lift)|0},0.6)`;
    ctx.lineWidth = 0.8+rnd()*1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x+len, y+(rnd()-0.5)*1.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Floating chord-colour highlights — small dabs scattered.
  const visSpots = Math.ceil(spotCount * reveal);
  for(let i=0;i<visSpots;i++){
    const x = rnd()*CW;
    const y = rnd()*CH;
    const [r,g,b] = chordColIdx(i+500);
    const lift = 60;
    ctx.fillStyle = `rgba(${Math.min(255,r+lift)|0},${Math.min(255,g+lift)|0},${Math.min(255,b+lift)|0},0.75)`;
    ctx.beginPath();
    ctx.ellipse(x, y, 3+rnd()*5, 2+rnd()*3, rnd()*Math.PI, 0, Math.PI*2);
    ctx.fill();
  }
}

// ── Variant abstract 3 — Bridge in Mist (Charing Cross 1899-1904): atmospheric
// chord wash + long horizontal bridge silhouette with multiple soft arches +
// vertical water reflection streaks below + horizontal mist veils. Bridge is
// the only literal element — and it's a soft dark mass spanning the canvas.
function monetPhaseBridgeMist(ctx, CW, CH, chords, lim, gc, ss, mode){
  const cn = chords.length;
  const isBW = mode === 'bw';
  const rnd = _seedRnd(91, ss, 0, 10);
  const reveal = Math.max(0, Math.min(1, lim / Math.max(1, cn)));

  // Per-song layout decisions.
  const bridgeY = CH * (0.42 + rnd()*0.14);                // 42-56% bridge height
  const archCount = 4 + Math.floor(rnd()*3);               // 4-6 arches
  const streakCountFull = 40 + Math.floor(rnd()*20);
  const veilCountFull = 50 + Math.floor(rnd()*20);

  function chordCol(t){
    const ci = Math.min(cn-1, Math.max(0, Math.floor(t*cn)));
    const chord = chords[ci];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [{m:60,v:90}];
    const note = notes[0];
    const m = note.m !== undefined ? note.m : note;
    const [r,g,b] = gc(m, 100);
    if(isBW){ const v = Math.round(r*0.299+g*0.587+b*0.114); return [v,v,v]; }
    return [r,g,b];
  }
  function chordColIdx(i){
    const ci = Math.min(cn-1, Math.max(0, i%cn));
    const chord = chords[ci];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [{m:60,v:90}];
    const note = notes[i % notes.length];
    const m = note.m !== undefined ? note.m : note;
    const v = note.v !== undefined ? note.v : 100;
    const [r,g,b] = gc(m, v);
    if(isBW){ const vv = Math.round(r*0.299+g*0.587+b*0.114); return [vv,vv,vv]; }
    return [r,g,b];
  }

  // Sky gradient — atmospheric chord wash.
  const [skyR,skyG,skyB] = chordCol(0.08);
  const sky = ctx.createLinearGradient(0,0,0,bridgeY);
  sky.addColorStop(0, `rgb(${Math.min(255,skyR+95)},${Math.min(255,skyG+95)},${Math.min(255,skyB+110)})`);
  sky.addColorStop(1, `rgb(${Math.min(255,skyR+65)},${Math.min(255,skyG+70)},${Math.min(255,skyB+90)})`);
  ctx.fillStyle = sky;
  ctx.fillRect(0,0,CW,bridgeY);

  // Water below bridge — mid-chord based.
  const [watR,watG,watB] = chordCol(0.55);
  const water = ctx.createLinearGradient(0,bridgeY,0,CH);
  water.addColorStop(0, `rgb(${Math.round(watR*0.50+85)},${Math.round(watG*0.50+90)},${Math.round(watB*0.55+105)})`);
  water.addColorStop(1, `rgb(${Math.round(watR*0.55+55)},${Math.round(watG*0.55+60)},${Math.round(watB*0.60+80)})`);
  ctx.fillStyle = water;
  ctx.fillRect(0, bridgeY, CW, CH-bridgeY);

  // Vertical reflection streaks in water — scale with reveal.
  const visStreaks = Math.ceil(streakCountFull * reveal);
  ctx.globalAlpha = 0.45;
  for(let i=0;i<visStreaks;i++){
    const x = (i/streakCountFull)*CW + (rnd()-0.5)*CW*0.02;
    const sw = CW/streakCountFull*(0.8+rnd()*0.8);
    const len = (CH-bridgeY)*(0.50+rnd()*0.45);
    const [r,g,b] = chordCol(i/streakCountFull);
    ctx.fillStyle = `rgb(${Math.min(255,r+80)|0},${Math.min(255,g+80)|0},${Math.min(255,b+95)|0})`;
    ctx.fillRect(x, bridgeY, sw, len);
  }
  ctx.globalAlpha = 1;

  // Horizontal mist veils across entire canvas — scale with reveal.
  const visVeils = Math.ceil(veilCountFull * Math.min(1, reveal*1.3));
  ctx.globalAlpha = 0.30;
  for(let i=0;i<visVeils;i++){
    const y = rnd()*CH;
    const w = CW*(0.4+rnd()*0.5);
    const x = (rnd()-0.3)*CW;
    const [r,g,b] = chordColIdx(i);
    ctx.fillStyle = `rgb(${Math.min(255,r+50)|0},${Math.min(255,g+50)|0},${Math.min(255,b+60)|0})`;
    ctx.beginPath();
    ctx.ellipse(x+w/2, y, w/2, CH*0.02, 0, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Bridge silhouette — appears after 20% reveal, builds opacity.
  if(reveal > 0.2){
    const bridgeAlpha = Math.min(1, (reveal - 0.2) / 0.5);
    const bridgeH = CH*0.07;
    ctx.fillStyle = `rgba(35,30,45,${(0.55*bridgeAlpha).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(0, bridgeY+bridgeH*0.4);
    for(let a=0;a<archCount;a++){
      const x0 = (a/archCount)*CW;
      const x1 = ((a+1)/archCount)*CW;
      const cxA = (x0+x1)/2;
      ctx.lineTo(x0+CW*0.02, bridgeY+bridgeH*0.4);
      ctx.quadraticCurveTo(cxA, bridgeY+bridgeH*1.4, x1-CW*0.02, bridgeY+bridgeH*0.4);
    }
    ctx.lineTo(CW, bridgeY);
    ctx.lineTo(0, bridgeY);
    ctx.closePath();
    ctx.fill();
    // Bridge reflection thin line in water
    ctx.globalAlpha = 0.30 * bridgeAlpha;
    ctx.fillStyle = 'rgba(35,30,45,0.45)';
    ctx.fillRect(0, bridgeY+(CH-bridgeY)*0.02, CW, CH*0.02);
    ctx.globalAlpha = 1;
  }
}

// ── Variant abstract 4 — Wisteria Cascade (Wisteria 1917-19): vertical
// streams of small chord-coloured dabs cascading from top, with bright
// highlight specks. NO trunks, NO branches — pure abstract drip. The most
// abstract late-period Monet.
function monetPhaseWisteria(ctx, CW, CH, chords, lim, gc, ss, mode){
  const cn = chords.length;
  const isBW = mode === 'bw';
  const rnd = _seedRnd(91, ss, 0, 11);
  const reveal = Math.max(0, Math.min(1, lim / Math.max(1, cn)));

  // Per-song layout decisions.
  const cascadeCountFull = 60 + Math.floor(rnd()*40);      // 60-100 cascades
  const highlightCountFull = 80 + Math.floor(rnd()*60);    // 80-140 highlights

  function chordCol(t){
    const ci = Math.min(cn-1, Math.max(0, Math.floor(t*cn)));
    const chord = chords[ci];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [{m:60,v:90}];
    const note = notes[0];
    const m = note.m !== undefined ? note.m : note;
    const [r,g,b] = gc(m, 100);
    if(isBW){ const v = Math.round(r*0.299+g*0.587+b*0.114); return [v,v,v]; }
    return [r,g,b];
  }
  function chordColIdx(i){
    const ci = Math.min(cn-1, Math.max(0, i%cn));
    const chord = chords[ci];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [{m:60,v:90}];
    const note = notes[i % notes.length];
    const m = note.m !== undefined ? note.m : note;
    const v = note.v !== undefined ? note.v : 100;
    const [r,g,b] = gc(m, v);
    if(isBW){ const vv = Math.round(r*0.299+g*0.587+b*0.114); return [vv,vv,vv]; }
    return [r,g,b];
  }

  // Sky band (upper 18%).
  const [skyR,skyG,skyB] = chordCol(0.08);
  ctx.fillStyle = `rgb(${Math.min(255,skyR+90)},${Math.min(255,skyG+95)},${Math.min(255,skyB+105)})`;
  ctx.fillRect(0,0,CW,CH*0.18);

  // Main wisteria chord band (middle 67%).
  const [mainR,mainG,mainB] = chordCol(0.40);
  const mid = ctx.createLinearGradient(0,CH*0.18,0,CH*0.85);
  mid.addColorStop(0, `rgb(${Math.round(mainR*0.55+70)},${Math.round(mainG*0.55+70)},${Math.round(mainB*0.65+85)})`);
  mid.addColorStop(1, `rgb(${Math.round(mainR*0.55+45)},${Math.round(mainG*0.55+45)},${Math.round(mainB*0.65+55)})`);
  ctx.fillStyle = mid;
  ctx.fillRect(0,CH*0.18,CW,CH*0.67);

  // Bottom darker band (15%).
  const [botR,botG,botB] = chordCol(0.75);
  ctx.fillStyle = `rgb(${Math.round(botR*0.45+30)},${Math.round(botG*0.50+40)},${Math.round(botB*0.55+50)})`;
  ctx.fillRect(0, CH*0.85, CW, CH*0.15);

  // Cascading dabs — count grows with reveal.
  const visCascades = Math.ceil(cascadeCountFull * reveal);
  for(let c=0;c<visCascades;c++){
    const x = (c/cascadeCountFull)*CW + (rnd()-0.5)*CW*0.025;
    const startY = CH*0.06 + rnd()*CH*0.10;
    const length = CH*(0.55 + rnd()*0.35);
    const dabsFull = 18 + Math.floor(rnd()*15);
    // Per-cascade dabs also scale slightly with reveal (denser as more chords arrive).
    const dabs = Math.max(6, Math.ceil(dabsFull * (0.4 + reveal*0.6)));
    for(let d=0;d<dabs;d++){
      const t = d/dabs;
      const y = startY + t*length;
      const dx = (rnd()-0.5)*7;
      const [r,g,b] = chordColIdx(c*3 + d);
      // Shift toward violet without flattening palette.
      const jr = Math.round(r*0.65 + 30);
      const jg = Math.round(g*0.45 + 20);
      const jb = Math.round(b*0.85 + 60);
      const a = 0.65 + rnd()*0.25;
      ctx.fillStyle = `rgba(${Math.max(0,Math.min(255,jr))},${Math.max(0,Math.min(255,jg))},${Math.max(0,Math.min(255,jb))},${a.toFixed(2)})`;
      const sz = 2 + rnd()*3;
      ctx.beginPath();
      ctx.ellipse(x+dx, y, sz, sz*0.85, rnd()*Math.PI, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // Bright highlight specks scattered — scale with reveal.
  const visHighlights = Math.ceil(highlightCountFull * reveal);
  for(let i=0;i<visHighlights;i++){
    const x = rnd()*CW;
    const y = CH*0.20 + rnd()*CH*0.60;
    const [r,g,b] = chordColIdx(i+200);
    const lift = 80;
    ctx.fillStyle = `rgba(${Math.min(255,r+lift)|0},${Math.min(255,g+lift)|0},${Math.min(255,b+lift)|0},0.70)`;
    ctx.beginPath();
    ctx.arc(x, y, 1.2+rnd()*1.4, 0, Math.PI*2);
    ctx.fill();
  }
}

// ─── Hokusai (Woodblock) — 6 variants ───────────────────────────────────────
// All flat colour fields + Prussian-blue contours, no gradients. Beige paper
// ground throughout. Woodblock rules: every region is one solid colour, hard
// edges, dark contour line.
//  0/Wave:    Great Wave at Kanagawa — layered sea + foam claws
//  1/Fuji:    Red/grey Mt Fuji silhouette + sky bands
//  2/Blossom: Plum/cherry branch with circular flowers
//  3/Storm:   Lightning zigzag through dark sky
//  4/Rain:    Diagonal rain lines + muted village band
//  5/Bridge:  Drum bridge arch over water + reeds
function drawHokusaiOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  const ss = sessionSeed | 0;
  const _pn = _capN(6);
  const _fpick = ((phaseIndex|0) % _pn + _pn) % _pn;
  if(_fpick === 1){ hokusaiPhaseFuji(ctx, CW, CH, chords, lim, gc, ss, mode); return; }
  if(_fpick === 2){ hokusaiPhaseBlossom(ctx, CW, CH, chords, lim, gc, ss, mode); return; }
  if(_fpick === 3){ hokusaiPhaseStorm(ctx, CW, CH, chords, lim, gc, ss, mode); return; }
  if(_fpick === 4){ hokusaiPhaseRain(ctx, CW, CH, chords, lim, gc, ss, mode); return; }
  if(_fpick === 5){ hokusaiPhaseBridge(ctx, CW, CH, chords, lim, gc, ss, mode); return; }
  hokusaiPhaseWave(ctx, CW, CH, chords, lim, gc, ss, mode);
}

// ── Shared palette + helpers ──
const HOKUSAI_PRUSSIAN = '#1B3A5B';
const HOKUSAI_FOAM = '#F7F4EA';
const HOKUSAI_PAPER = '#EAE3CE';
// Convert any [r,g,b] toward the woodblock palette: drop saturation, blend
// with Prussian to keep all panels visually unified.
function _hokusaiMute(r, g, b, blendAmt, dim){
  const ba = blendAmt == null ? 0.4 : blendAmt;
  const dm = dim == null ? 1 : dim;
  const mr = Math.round((r * (1 - ba) + 27 * ba) * dm);
  const mg = Math.round((g * (1 - ba) + 58 * ba) * dm);
  const mb = Math.round((b * (1 - ba) + 91 * ba) * dm);
  return `rgb(${Math.max(0,Math.min(255,mr))},${Math.max(0,Math.min(255,mg))},${Math.max(0,Math.min(255,mb))})`;
}
// ── HK v2: note-driven woodblock ink-set. The song's tonal centre becomes
// the print's ink (Paintiano law: notes ARE colours), pushed into ukiyo-e
// pigment range: saturation clamped ~40-55%, lightness at woodblock levels,
// hue tilted ±12° by the secondary pitch class, depth by energy. Everything
// routes through gc() so palette modes and BW keep working.
function _hokusaiInk(chords, lim, gc){
  const cn = Math.max(1, Math.min(chords.length, lim || chords.length));
  const hist = new Array(12).fill(0);
  let velSum=0, velN=0, cxIdx=0, cxVel=-1;
  for(let i=0;i<cn;i++){
    const ch=chords[i]; if(!ch) continue;
    const nn=ch.n||ch.notes; if(!nn||!nn.length) continue;
    let topM=-1, v=0;
    for(const note of nn){ const m=note.m!==undefined?note.m:note; if(m>topM) topM=m; v+=(note.v!==undefined?note.v:80); }
    v/=nn.length;
    hist[((topM%12)+12)%12]++;
    velSum+=v; velN++;
    if(v>cxVel){ cxVel=v; cxIdx=i; }
  }
  let root=0,best=-1, sec=0, secBest=-1;
  for(let p=0;p<12;p++){ if(hist[p]>best){best=hist[p]; root=p;} }
  for(let p=0;p<12;p++){ if(p!==root && hist[p]>secBest){secBest=hist[p]; sec=p;} }
  const energy = Math.max(0, Math.min(1, ((velSum/Math.max(1,velN))-40)/70));
  const r2h=(r,g,b)=>{ r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b); let h=0,s=0; const l=(mx+mn)/2; if(mx!==mn){ const d=mx-mn; s=l>0.5?d/(2-mx-mn):d/(mx+mn); h=mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4); h*=60; } return [h,s,l]; };
  const h2r=(h,s,l)=>{ h=((h%360)+360)%360; const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m0=l-c/2; let rr=0,gg=0,bb=0; if(h<60){rr=c;gg=x;} else if(h<120){rr=x;gg=c;} else if(h<180){gg=c;bb=x;} else if(h<240){gg=x;bb=c;} else if(h<300){rr=x;bb=c;} else {rr=c;bb=x;} return [Math.round((rr+m0)*255),Math.round((gg+m0)*255),Math.round((bb+m0)*255)]; };
  const rootRGB = gc(60+root, 100);
  const [rh, rs] = r2h(rootRGB[0], rootRGB[1], rootRGB[2]);
  let d12=((sec-root+18)%12)-6;              // -6..5
  const tilt=d12*2;                           // ~±12°
  const S=0.40+energy*0.15, LD=0.32-energy*0.10;
  const mk=(lig,sMul)=>h2r(rh+tilt, Math.min(rs, S*sMul), lig);   // Math.min keeps BW gray
  const inkFrom=(m, sat, lig)=>{ const [r,g,b]=gc(m,100); const [h,s]=r2h(r,g,b); return h2r(h, Math.min(s,sat), lig); };
  const cxN=chords[cxIdx]&&(chords[cxIdx].n||chords[cxIdx].notes)||[{m:60}];
  const cm=cxN[0].m!==undefined?cxN[0].m:cxN[0];
  return {
    D: mk(LD,1), M: mk(LD+0.19,0.96), L: mk(LD+0.40,0.85),
    A: inkFrom(cm, 0.56, 0.48),
    energy: energy,
    voice: (i)=>{ const ch=chords[Math.min(cn-1,Math.max(0,i%cn))]; const nn=ch&&(ch.n||ch.notes)||[{m:60}]; const m=nn[0].m!==undefined?nn[0].m:nn[0]; return inkFrom(m, 0.50, 0.52); },
    paper: [234,227,206], sumi: [24,26,32],
  };
}

// Variant 0 — Wave (Great Wave at Kanagawa).
function hokusaiPhaseWave(ctx, CW, CH, chords, lim, gc, ss, mode){
  // HK v2 — The Great Wave rebuilt: a low-frequency melody envelope forms
  // 1-3 great swells (not a per-chord waveform); the front swell carries the
  // Kanagawa claw curl + foam-finger dots tinted by chord voices; boats
  // (oshiokuri-bune, sumi hull + climax gunwale) appear when energy is high.
  const rnd = _seedRnd(92, ss, 0, 0);
  const K = _hokusaiInk(chords, lim, gc);
  const P = `rgb(${K.paper[0]},${K.paper[1]},${K.paper[2]})`;
  const SM = `rgba(${K.sumi[0]},${K.sumi[1]},${K.sumi[2]},0.55)`;
  ctx.fillStyle = P; ctx.fillRect(0,0,CW,CH);
  // Bokashi sky.
  const skg = ctx.createLinearGradient(0,0,0,CH*0.22);
  skg.addColorStop(0, `rgba(${K.M[0]},${K.M[1]},${K.M[2]},0.40)`);
  skg.addColorStop(1, `rgba(${K.M[0]},${K.M[1]},${K.M[2]},0)`);
  ctx.fillStyle = skg; ctx.fillRect(0,0,CW,CH*0.22);
  // Distant Fuji.
  const fx = CW*0.62, fy = CH*0.40, fw = CW*0.12;
  ctx.fillStyle = `rgba(${K.M[0]},${K.M[1]},${K.M[2]},0.55)`;
  ctx.strokeStyle = SM; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(fx-fw, fy); ctx.lineTo(fx, fy-fw*0.82); ctx.lineTo(fx+fw, fy); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P;
  ctx.beginPath(); ctx.moveTo(fx-fw*0.30, fy-fw*0.56); ctx.lineTo(fx, fy-fw*0.82); ctx.lineTo(fx+fw*0.30, fy-fw*0.56);
  ctx.lineTo(fx+fw*0.15, fy-fw*0.63); ctx.lineTo(fx+fw*0.02, fy-fw*0.53); ctx.lineTo(fx-fw*0.15, fy-fw*0.64); ctx.closePath(); ctx.fill();
  // Melody envelope → swells. Moving average of top pitches over the piece.
  const N = Math.max(1, Math.min(chords.length, lim));
  const pit = [];
  for(let i=0;i<N;i++){
    const ch=chords[i]; if(!ch){ pit.push(60); continue; }
    const nn=ch.n||ch.notes; if(!nn||!nn.length){ pit.push(60); continue; }
    let m0=0; for(const nt of nn){ const m=nt.m!==undefined?nt.m:nt; if(m>m0) m0=m; }
    _setCurE(ch._E);
    pit.push(m0);
  }
  const win = Math.max(2, Math.floor(pit.length/6));
  const env = [];
  let mnP=1e9, mxP=-1e9;
  for(let i=0;i<pit.length;i++){
    let s=0,c=0;
    for(let k=Math.max(0,i-win); k<=Math.min(pit.length-1,i+win); k++){ s+=pit[k]; c++; }
    const v=s/c; env.push(v); if(v<mnP)mnP=v; if(v>mxP)mxP=v;
  }
  const span = Math.max(1, mxP-mnP);
  const swellN = 1 + Math.round(K.energy*2);      // 1..3
  // Pick swellN evenly spaced envelope samples as swell centres; height from env.
  const swells = [];
  for(let s=0;s<swellN;s++){
    const t = swellN===1 ? 0.5 : 0.22 + s*(0.56/(swellN-1));
    const ei = Math.min(env.length-1, Math.floor(t*env.length));
    const hf = 0.22 + 0.42*((env[ei]-mnP)/span) * (0.6+0.4*K.energy);
    swells.push({ px: 0.24 + t*0.55 + (rnd()-0.5)*0.06, hf: hf });
  }
  swells.sort((a,b)=>a.hf-b.hf);   // back (small) → front (tall)
  const cols=[K.L, K.M, K.D];
  const geo=[];
  for(let j=0;j<swells.length;j++){
    const col = cols[Math.min(2, j + (3-swells.length))];
    const cx = CW*swells[j].px, h = CH*swells[j].hf;
    const base = CH*(0.93 + j*0.03), w = CW*(0.95 + j*0.30);
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.strokeStyle = SM; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx-w*0.55, base);
    ctx.bezierCurveTo(cx-w*0.30, base-h*0.25, cx-w*0.22, base-h*0.9, cx, base-h);
    ctx.bezierCurveTo(cx+w*0.16, base-h*1.06, cx+w*0.30, base-h*0.75, cx+w*0.55, base-h*0.18);
    ctx.lineTo(cx+w*0.55, base); ctx.closePath(); ctx.fill(); ctx.stroke();
    geo.push({cx, base, w, h});
  }
  // Claw curl(s) + foam fingers on the front-most 1-2 swells (by energy).
  const curls = K.energy > 0.45 ? (K.energy > 0.85 ? 2 : 1) : 1;
  for(let q=0;q<Math.min(curls, geo.length); q++){
    const G = geo[geo.length-1-q];
    const hx=G.cx, hy=G.base-G.h;
    ctx.strokeStyle = P; ctx.lineWidth = Math.max(3.5, G.w*0.010); ctx.lineCap='round';
    ctx.beginPath();
    for(let s=0;s<28;s++){
      const aa=-0.4+s*0.29, r2=G.w*0.14*(1-s/32);
      const x=hx+G.w*0.09+Math.cos(aa)*r2, y=hy+G.h*0.06+Math.sin(aa)*r2;
      if(s===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
    for(let k=0;k<18;k++){
      const t=k/17;
      const fxp=hx-G.w*0.31+t*G.w*0.57, fyp=hy-5+Math.sin(t*Math.PI)*(-G.h*0.10);
      const vc = (k%3===0) ? K.voice(k) : K.paper;
      const mixv=[Math.round(K.paper[0]*0.65+vc[0]*0.35),Math.round(K.paper[1]*0.65+vc[1]*0.35),Math.round(K.paper[2]*0.65+vc[2]*0.35)];
      ctx.fillStyle = `rgb(${mixv[0]},${mixv[1]},${mixv[2]})`;
      ctx.strokeStyle = `rgba(${K.sumi[0]},${K.sumi[1]},${K.sumi[2]},0.40)`; ctx.lineWidth=0.7;
      ctx.beginPath(); ctx.arc(fxp, fyp, 1.6+2.9*Math.sin(t*Math.PI)+rnd(), 0, Math.PI*2); ctx.fill(); ctx.stroke();
    }
  }
  // Water base + voice wavelets.
  ctx.fillStyle = `rgb(${K.D[0]},${K.D[1]},${K.D[2]})`;
  ctx.fillRect(0, CH*0.92, CW, CH*0.10);
  for(let k=0;k<5;k++){
    const vc=K.voice(k*3);
    const wl=[Math.round(vc[0]*0.7+K.paper[0]*0.3),Math.round(vc[1]*0.7+K.paper[1]*0.3),Math.round(vc[2]*0.7+K.paper[2]*0.3)];
    ctx.strokeStyle = `rgba(${wl[0]},${wl[1]},${wl[2]},0.55)`; ctx.lineWidth=1.3;
    const yy=CH*(0.93+k*0.013);
    ctx.beginPath(); ctx.moveTo(0,yy);
    ctx.quadraticCurveTo(CW*0.25, yy+5+rnd()*5, CW*0.5, yy);
    ctx.quadraticCurveTo(CW*0.75, yy-5-rnd()*5, CW, yy);
    ctx.stroke();
  }
  // Boats — proportional oshiokuri-bune riding the front slope.
  const boats = K.energy > 0.85 ? 2 : (K.energy > 0.60 ? 1 : 0);
  const bezAt=(G,t)=>{
    const p0x=G.cx-G.w*0.55, p0y=G.base, p1x=G.cx-G.w*0.30, p1y=G.base-G.h*0.25;
    const p2x=G.cx-G.w*0.22, p2y=G.base-G.h*0.9, p3x=G.cx, p3y=G.base-G.h;
    const mt=1-t;
    const x=mt*mt*mt*p0x+3*mt*mt*t*p1x+3*mt*t*t*p2x+t*t*t*p3x;
    const y=mt*mt*mt*p0y+3*mt*mt*t*p1y+3*mt*t*t*p2y+t*t*t*p3y;
    const dx=3*mt*mt*(p1x-p0x)+6*mt*t*(p2x-p1x)+3*t*t*(p3x-p2x);
    const dy=3*mt*mt*(p1y-p0y)+6*mt*t*(p2y-p1y)+3*t*t*(p3y-p2y);
    return {x, y, ang: Math.atan2(dy,dx)*0.7};
  };
  for(let b=0;b<Math.min(boats, geo.length); b++){
    const G = geo[Math.max(0, geo.length-1-b)];
    const Lb = Math.max(24, geo[geo.length-1].h*0.34) * (b?0.8:1);
    const hb = Lb*0.16;
    const pos = bezAt(G, 0.45+b*0.12);
    ctx.save(); ctx.translate(pos.x, pos.y-Lb*0.10); ctx.rotate(pos.ang);
    ctx.fillStyle = `rgb(${K.sumi[0]},${K.sumi[1]},${K.sumi[2]})`;
    ctx.strokeStyle = `rgba(${K.paper[0]},${K.paper[1]},${K.paper[2]},0.5)`; ctx.lineWidth=0.8;
    ctx.beginPath();
    ctx.moveTo(-Lb/2, -hb*0.55);
    ctx.quadraticCurveTo(-Lb*0.42, hb*0.5, -Lb*0.18, hb*0.62);
    ctx.lineTo(Lb*0.22, hb*0.62);
    ctx.quadraticCurveTo(Lb*0.44, hb*0.45, Lb/2, -hb*0.75);
    ctx.lineTo(Lb*0.42, -hb*0.30); ctx.lineTo(-Lb*0.42, -hb*0.30); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = `rgb(${K.A[0]},${K.A[1]},${K.A[2]})`; ctx.lineWidth=hb*0.28;
    ctx.beginPath(); ctx.moveTo(-Lb*0.40, -hb*0.30); ctx.lineTo(Lb*0.40, -hb*0.30); ctx.stroke();
    ctx.strokeStyle = `rgb(${K.sumi[0]},${K.sumi[1]},${K.sumi[2]})`; ctx.lineWidth=2; ctx.lineCap='round';
    for(let i=0;i<5;i++){
      const cxx=-Lb*0.30+i*Lb*0.14;
      ctx.beginPath(); ctx.moveTo(cxx, -hb*0.35); ctx.lineTo(cxx+3, -hb*1.12); ctx.stroke();
    }
    ctx.restore();
  }
}

// Variant 1 — Mt Fuji silhouette + sky bands.
function hokusaiPhaseFuji(ctx, CW, CH, chords, lim, gc, ss, mode){
  // HK v2 — bokashi sky gradations, Fuji body in the CLIMAX accent
  // (Red-Fuji hommage: shadow → accent → light), dappled snow cap,
  // sumi keyline, mist band; birds carry chord voices through the ink.
  const rnd = _seedRnd(92, ss, 0, 1);
  const K = _hokusaiInk(chords, lim, gc);
  const P = `rgb(${K.paper[0]},${K.paper[1]},${K.paper[2]})`;
  ctx.fillStyle = P; ctx.fillRect(0,0,CW,CH);
  const g1 = ctx.createLinearGradient(0,0,0,CH*0.30);
  g1.addColorStop(0, `rgba(${K.D[0]},${K.D[1]},${K.D[2]},0.80)`);
  g1.addColorStop(1, `rgba(${K.M[0]},${K.M[1]},${K.M[2]},0)`);
  ctx.fillStyle=g1; ctx.fillRect(0,0,CW,CH*0.30);
  const g2 = ctx.createLinearGradient(0,CH*0.55,0,CH*0.72);
  g2.addColorStop(0, `rgba(${K.L[0]},${K.L[1]},${K.L[2]},0.40)`);
  g2.addColorStop(1, `rgba(${K.L[0]},${K.L[1]},${K.L[2]},0)`);
  ctx.fillStyle=g2; ctx.fillRect(0,CH*0.55,CW,CH*0.17);
  // Fuji body — horizontal gradient in the climax accent.
  const fpx=CW*0.52, fpy=CH*0.22, fby=CH*0.80;
  const gf = ctx.createLinearGradient(CW*0.10,0,CW*0.92,0);
  const shd=[Math.round(K.A[0]*0.65+K.sumi[0]*0.35),Math.round(K.A[1]*0.65+K.sumi[1]*0.35),Math.round(K.A[2]*0.65+K.sumi[2]*0.35)];
  const lit=[Math.round(K.A[0]*0.75+K.paper[0]*0.25),Math.round(K.A[1]*0.75+K.paper[1]*0.25),Math.round(K.A[2]*0.75+K.paper[2]*0.25)];
  gf.addColorStop(0, `rgb(${shd[0]},${shd[1]},${shd[2]})`);
  gf.addColorStop(0.55, `rgb(${K.A[0]},${K.A[1]},${K.A[2]})`);
  gf.addColorStop(1, `rgb(${lit[0]},${lit[1]},${lit[2]})`);
  ctx.fillStyle=gf;
  ctx.strokeStyle=`rgba(${K.sumi[0]},${K.sumi[1]},${K.sumi[2]},0.6)`; ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(CW*0.10, fby);
  ctx.bezierCurveTo(CW*0.30, CH*0.62, CW*0.42, CH*0.34, fpx, fpy);
  ctx.bezierCurveTo(CW*0.62, CH*0.36, CW*0.76, CH*0.64, CW*0.92, fby);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Dappled snow cap.
  ctx.fillStyle=P; ctx.strokeStyle=`rgba(${K.sumi[0]},${K.sumi[1]},${K.sumi[2]},0.35)`; ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(fpx-CW*0.085, fpy+CH*0.068);
  const nz=9;
  for(let i=1;i<=nz;i++){
    const t=i/nz;
    const px=fpx-CW*0.085+t*CW*0.17;
    const py=fpy+CH*(0.068-0.016*Math.sin(t*Math.PI))+(i%2?CH*0.024:0);
    ctx.lineTo(px,py);
  }
  ctx.lineTo(fpx+CW*0.085, fpy+CH*0.068); ctx.lineTo(fpx, fpy); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Mist foreground + ground keyline.
  ctx.fillStyle=`rgba(${K.M[0]},${K.M[1]},${K.M[2]},0.12)`;
  ctx.fillRect(0, fby, CW, CH-fby);
  ctx.strokeStyle=`rgba(${K.sumi[0]},${K.sumi[1]},${K.sumi[2]},0.5)`; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(0,fby); ctx.lineTo(CW,fby); ctx.stroke();
  // Birds — chord voices through the ink filter; count grows with reveal.
  const reveal=Math.max(0,Math.min(1, lim/Math.max(1,chords.length)));
  const nb=Math.max(2, Math.ceil(6*reveal));
  for(let i=0;i<nb;i++){
    const bx=CW*(0.12+rnd()*0.55), by=CH*(0.08+rnd()*0.13);
    const vc=K.voice(i*2);
    const bc=[Math.round(vc[0]*0.65+K.sumi[0]*0.35),Math.round(vc[1]*0.65+K.sumi[1]*0.35),Math.round(vc[2]*0.65+K.sumi[2]*0.35)];
    ctx.strokeStyle=`rgba(${bc[0]},${bc[1]},${bc[2]},0.8)`; ctx.lineWidth=1.4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(bx-6,by); ctx.quadraticCurveTo(bx,by-8,bx+6,by);
    ctx.quadraticCurveTo(bx,by-3,bx-6,by); ctx.stroke();
  }
}

// Variant 2 — Plum/Cherry blossom branch.
function hokusaiPhaseBlossom(ctx, CW, CH, chords, lim, gc, ss, mode){
  const rnd = _seedRnd(92, ss, lim, 2);
  ctx.fillStyle = HOKUSAI_PAPER;
  ctx.fillRect(0, 0, CW, CH);

  // Branch — thick curved line entering from bottom-left or right.
  const fromLeft = (ss & 1) === 0;
  const startX = fromLeft ? 0 : CW;
  const startY = CH * (0.7 + rnd() * 0.2);
  const endX = fromLeft ? CW * (0.6 + rnd() * 0.3) : CW * (0.1 + rnd() * 0.3);
  const endY = CH * (0.15 + rnd() * 0.2);

  // Bezier control points.
  const c1x = (startX + endX) * 0.5 + (fromLeft ? CW * 0.1 : -CW * 0.1);
  const c1y = startY - (startY - endY) * 0.3;
  const c2x = endX + (fromLeft ? -CW * 0.05 : CW * 0.05);
  const c2y = endY + (startY - endY) * 0.2;

  // Branch trunk — flat dark.
  ctx.strokeStyle = '#3D2412';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.bezierCurveTo(c1x, c1y, c2x, c2y, endX, endY);
  ctx.stroke();
  ctx.strokeStyle = HOKUSAI_PRUSSIAN;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Sub-branches — short forks at jittered points along the main branch.
  const forks = 4 + Math.floor(rnd() * 4);
  for(let f = 0; f < forks; f++){
    const t = 0.2 + rnd() * 0.7;
    // Approximate point on bezier curve.
    const ot = 1 - t;
    const bx = ot*ot*ot*startX + 3*ot*ot*t*c1x + 3*ot*t*t*c2x + t*t*t*endX;
    const by = ot*ot*ot*startY + 3*ot*ot*t*c1y + 3*ot*t*t*c2y + t*t*t*endY;
    const ang = (rnd() - 0.5) * 1.6 + (fromLeft ? -1 : -2);
    const flen = 30 + rnd() * 60;
    const fx = bx + Math.cos(ang) * flen;
    const fy = by + Math.sin(ang) * flen;
    ctx.strokeStyle = '#3D2412';
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = HOKUSAI_PRUSSIAN;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Blossoms — circular flowers along branch using chord colours.
  const blossomCount = Math.min(60, Math.max(12, lim));
  for(let i = 0; i < blossomCount; i++){
    const ci = i % lim;
    const chord = chords[ci] || chords[0];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [];
    const note = notes[i % Math.max(1, notes.length)] || {m:60,v:80};
    const m = note.m!==undefined?note.m:note;
    const v = note.v!==undefined?note.v:100;
    const [r, g, b] = gc(m, v);
    // Paintiano DNA: chord-driven petal palette (sakura family preserved but
    // chord identity dominates — white/pink/coral/peach varies by chord).
    // Sakura family anchor: the chord voice tints WITHIN the family (30%
    // mix into a warm blossom base), so a blue chord gives a cool-leaning
    // pink — never a blue flower. Chord identity stays audible, family holds.
    const br = Math.round(238*0.70 + r*0.30);
    const bg = Math.round(172*0.70 + g*0.30);
    const bbv = Math.round(178*0.70 + b*0.30);
    // Chord-derived warm centre (gold/coral/peach varies per chord) — replaces
    // the hardcoded yellow #E8C24A so each flower's heart carries the chord too.
    const cR = Math.min(255, Math.round(r * 0.55 + 130));
    const cG = Math.min(255, Math.round(g * 0.50 + 100));
    const cB = Math.min(255, Math.round(b * 0.30 + 40));
    // Per-blossom RNG for petal-level micro-jitter (±12 from base).
    const petalRnd = _seedRnd(i + 95300, ss, 0, 0); petalRnd(); petalRnd();

    // Position roughly along branch.
    const t = 0.1 + rnd() * 0.9;
    const ot = 1 - t;
    const bx = ot*ot*ot*startX + 3*ot*ot*t*c1x + 3*ot*t*t*c2x + t*t*t*endX;
    const by = ot*ot*ot*startY + 3*ot*ot*t*c1y + 3*ot*t*t*c2y + t*t*t*endY;
    // Cluster around branch.
    const cx = bx + (rnd() - 0.5) * 70;
    const cy = by + (rnd() - 0.5) * 70 - 10;
    const rad = 5 + rnd() * 8;

    // 5-petal flower: 5 overlapping circles around a centre. Each petal gets
    // a small ±12 jitter from the blossom's base colour for realistic floral
    // variation (no two petals exactly the same shade).
    const jit = 12;
    for(let p = 0; p < 5; p++){
      const pang = (p / 5) * Math.PI * 2;
      const px = cx + Math.cos(pang) * rad * 0.55;
      const py = cy + Math.sin(pang) * rad * 0.55;
      const pR  = Math.max(0, Math.min(255, br  + (petalRnd() - 0.5) * jit));
      const pG  = Math.max(0, Math.min(255, bg  + (petalRnd() - 0.5) * jit));
      const pBb = Math.max(0, Math.min(255, bbv + (petalRnd() - 0.5) * jit));
      ctx.fillStyle = `rgb(${pR|0},${pG|0},${pBb|0})`;
      ctx.beginPath();
      ctx.arc(px, py, rad * 0.6, 0, 6.2832);
      ctx.fill();
      ctx.strokeStyle = HOKUSAI_PRUSSIAN;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    // Chord-derived centre — no longer hardcoded yellow.
    ctx.fillStyle = `rgb(${cR},${cG},${cB})`;
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 0.25, 0, 6.2832);
    ctx.fill();
  }
}

// Variant 3 — Storm: lightning zigzag through dark sky.
function hokusaiPhaseStorm(ctx, CW, CH, chords, lim, gc, ss, mode){
  // HK v2.1 — Sanka Haku'u (Rainstorm Beneath the Summit): the pair print
  // to Red Fuji. A GIANT off-centre black Fuji (peak ~0.38, near the top
  // edge, base beyond the canvas) rises above a cloud bank at ~60% that
  // swallows its lower slope; lightning with a climax-tinted glow strikes
  // BELOW the cloud line. Rain in two ink tones, denser under the clouds.
  // Differs from the Fuji phase by SILHOUETTE and composition, not just tone.
  const rnd = _seedRnd(92, ss, 0, 3);
  const K = _hokusaiInk(chords, lim, gc);
  const dk=[Math.round(K.D[0]*0.65+K.sumi[0]*0.35),Math.round(K.D[1]*0.65+K.sumi[1]*0.35),Math.round(K.D[2]*0.65+K.sumi[2]*0.35)];
  ctx.fillStyle = `rgb(${dk[0]},${dk[1]},${dk[2]})`;
  ctx.fillRect(0,0,CW,CH);
  // Bokashi storm sky — one family, layered gradations with wavy bottoms.
  for(let i=0;i<3;i++){
    const y0=i*CH*0.12;
    const g=ctx.createLinearGradient(0,y0,0,y0+CH*0.14);
    const t0=[Math.round(K.D[0]*(0.9-i*0.08)),Math.round(K.D[1]*(0.9-i*0.08)),Math.round(K.D[2]*(0.9-i*0.08))];
    g.addColorStop(0, `rgba(${t0[0]},${t0[1]},${t0[2]},0.80)`);
    g.addColorStop(1, `rgba(${K.M[0]},${K.M[1]},${K.M[2]},0)`);
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.moveTo(0,y0); ctx.lineTo(CW,y0);
    for(let x=CW;x>=0;x-=CW/24) ctx.lineTo(x, y0+CH*0.14 + Math.sin(x*0.02+i)*CH*0.010);
    ctx.closePath(); ctx.fill();
  }
  // Giant off-centre black Fuji — sumi+ink silhouette, base beyond edges.
  const fpx=CW*(0.38+(rnd()-0.5)*0.04), fpy=CH*0.06;
  const fuji=[Math.round(K.sumi[0]*0.78+K.D[0]*0.22),Math.round(K.sumi[1]*0.78+K.D[1]*0.22),Math.round(K.sumi[2]*0.78+K.D[2]*0.22)];
  const fujiTop=[Math.round(fuji[0]*0.7+K.D[0]*0.3),Math.round(fuji[1]*0.7+K.D[1]*0.3),Math.round(fuji[2]*0.7+K.D[2]*0.3)];
  const gm=ctx.createLinearGradient(0,fpy,0,CH);
  gm.addColorStop(0, `rgb(${fujiTop[0]},${fujiTop[1]},${fujiTop[2]})`);
  gm.addColorStop(1, `rgb(${fuji[0]},${fuji[1]},${fuji[2]})`);
  ctx.fillStyle=gm;
  ctx.strokeStyle=`rgba(${K.paper[0]},${K.paper[1]},${K.paper[2]},0.35)`; ctx.lineWidth=1.6;
  const baseY=CH*1.05;
  ctx.beginPath();
  ctx.moveTo(-CW*0.35, baseY);
  ctx.bezierCurveTo(CW*0.02, CH*0.62, CW*0.22, CH*0.20, fpx, fpy);
  ctx.bezierCurveTo(CW*0.55, CH*0.22, CW*0.80, CH*0.68, CW*1.30, baseY);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Tiny snow remnant (Hokusai keeps it even on the black Fuji).
  ctx.fillStyle=`rgba(${K.paper[0]},${K.paper[1]},${K.paper[2]},0.85)`;
  ctx.beginPath();
  ctx.moveTo(fpx-CW*0.045, fpy+CH*0.035);
  const nz=7;
  for(let i=1;i<=nz;i++){
    const t=i/nz;
    const px=fpx-CW*0.045+t*CW*0.09;
    const py=fpy+CH*(0.035-0.009*Math.sin(t*Math.PI))+(i%2?CH*0.013:0);
    ctx.lineTo(px,py);
  }
  ctx.lineTo(fpx+CW*0.045, fpy+CH*0.035); ctx.lineTo(fpx, fpy); ctx.closePath(); ctx.fill();
  // Cloud bank at ~60% — swallows the lower slope; billows along the top.
  const cloudY=CH*0.60;
  const gcb=ctx.createLinearGradient(0,cloudY,0,CH);
  const cbTop=[Math.round(K.M[0]*0.75+K.paper[0]*0.25),Math.round(K.M[1]*0.75+K.paper[1]*0.25),Math.round(K.M[2]*0.75+K.paper[2]*0.25)];
  gcb.addColorStop(0, `rgba(${cbTop[0]},${cbTop[1]},${cbTop[2]},0.92)`);
  gcb.addColorStop(1, `rgba(${Math.round(K.D[0]*0.8+K.sumi[0]*0.2)},${Math.round(K.D[1]*0.8+K.sumi[1]*0.2)},${Math.round(K.D[2]*0.8+K.sumi[2]*0.2)},0.85)`);
  ctx.fillStyle=gcb;
  ctx.beginPath();
  ctx.moveTo(0, cloudY);
  for(let k=0;k<=22;k++){
    const x=k*CW/22;
    ctx.lineTo(x, cloudY + Math.sin(k*0.9)*CH*0.020 - (k%2?CH*0.015:0));
  }
  ctx.lineTo(CW, CH); ctx.lineTo(0, CH); ctx.closePath(); ctx.fill();
  const cbBill=[Math.round(K.M[0]*0.70+K.paper[0]*0.30),Math.round(K.M[1]*0.70+K.paper[1]*0.30),Math.round(K.M[2]*0.70+K.paper[2]*0.30)];
  for(let i=0;i<9;i++){
    const cx=CW*(0.04+i*0.115), cy=cloudY+Math.sin(i*0.9)*CH*0.015;
    ctx.fillStyle=`rgba(${cbBill[0]},${cbBill[1]},${cbBill[2]},0.85)`;
    ctx.beginPath(); ctx.arc(cx, cy, CW*(0.045+rnd()*0.03), 0, Math.PI*2); ctx.fill();
  }
  // Lightning BELOW the cloud line — climax glow + main bolt + branches.
  const strikeX=CW*(0.55+rnd()*0.14);
  const glow=[Math.round(K.A[0]*0.55+K.paper[0]*0.45),Math.round(K.A[1]*0.55+K.paper[1]*0.45),Math.round(K.A[2]*0.55+K.paper[2]*0.45)];
  const rg=ctx.createRadialGradient(strikeX, CH*0.82, 0, strikeX, CH*0.82, CW*0.26);
  rg.addColorStop(0, `rgba(${glow[0]},${glow[1]},${glow[2]},0.55)`);
  rg.addColorStop(0.55, `rgba(${glow[0]},${glow[1]},${glow[2]},0.16)`);
  rg.addColorStop(1, `rgba(${glow[0]},${glow[1]},${glow[2]},0)`);
  ctx.fillStyle=rg;
  ctx.beginPath(); ctx.arc(strikeX, CH*0.82, CW*0.26, 0, Math.PI*2); ctx.fill();
  let px=CW*0.55, py=cloudY+CH*0.02;
  const boltPts=[[px,py]];
  for(let s=0;s<6;s++){
    px+=(rnd()-0.5)*CW*0.09 + (strikeX-px)*0.15;
    py+=CH*0.058;
    boltPts.push([px,py]);
  }
  ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.strokeStyle=`rgba(${glow[0]},${glow[1]},${glow[2]},0.5)`; ctx.lineWidth=9;
  ctx.beginPath();
  for(let s=0;s<boltPts.length;s++){ if(s===0)ctx.moveTo(boltPts[s][0],boltPts[s][1]); else ctx.lineTo(boltPts[s][0],boltPts[s][1]); }
  ctx.stroke();
  ctx.strokeStyle=`rgb(${K.paper[0]},${K.paper[1]},${K.paper[2]})`; ctx.lineWidth=3.4;
  ctx.stroke();
  // Branches — more for energetic pieces.
  const brN = K.energy>0.55 ? 3 : 2;
  const brAt=[2,4,3];
  for(let bq=0;bq<brN;bq++){
    const bi=brAt[bq];
    let qx=boltPts[bi][0], qy=boltPts[bi][1];
    const side=(bq%2===0)?-1:1;
    ctx.beginPath(); ctx.moveTo(qx,qy);
    for(let s=0;s<3;s++){ qx+=side*(12+rnd()*24); qy+=CH*0.040; ctx.lineTo(qx,qy); }
    ctx.strokeStyle=`rgba(${glow[0]},${glow[1]},${glow[2]},0.45)`; ctx.lineWidth=5; ctx.stroke();
    ctx.strokeStyle=`rgba(${K.paper[0]},${K.paper[1]},${K.paper[2]},0.9)`; ctx.lineWidth=1.7; ctx.stroke();
  }
  // Rain — TWO tones, denser below the cloud line; count scales with lim.
  const vc=K.voice(1);
  const pale=[Math.round(vc[0]*0.55+K.paper[0]*0.45),Math.round(vc[1]*0.55+K.paper[1]*0.45),Math.round(vc[2]*0.55+K.paper[2]*0.45)];
  const rainCount=Math.min(320, Math.max(140, lim*4));
  for(let i=0;i<rainCount;i++){
    const ry=rnd()*CH;
    if(ry<cloudY && rnd()<0.5) continue;   // sparser above the clouds
    const rx=rnd()*CW*1.1-CW*0.05, ln=10+rnd()*20;
    const col=(i%3===0)?pale:K.paper;
    ctx.strokeStyle=`rgba(${col[0]},${col[1]},${col[2]},${(0.22+rnd()*0.26).toFixed(2)})`;
    ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(rx,ry); ctx.lineTo(rx-ln*0.45, ry+ln); ctx.stroke();
  }
}

// Variant 4 — Rain: diagonal lines + muted village band.
function hokusaiPhaseRain(ctx, CW, CH, chords, lim, gc, ss, mode){
  const rnd = _seedRnd(92, ss, lim, 4);
  const K = _hokusaiInk(chords, lim, gc);   // HK v2 note-driven ink-set
  // Soft grey paper.
  ctx.fillStyle = '#D8D4C2';
  ctx.fillRect(0, 0, CW, CH);

  // Distant mountain silhouette band.
  const midChord = chords[Math.floor(lim / 2)] || chords[0];
  const midNotes = midChord && (midChord.n || midChord.notes) || [{m:60,v:80}];
  const midNote = midNotes[0];
  const [mr, mg, mb] = gc(midNote.m!==undefined?midNote.m:midNote, 100);
  ctx.fillStyle = _hokusaiMute(mr, mg, mb, 0.55, 0.7);
  ctx.beginPath();
  ctx.moveTo(0, CH * 0.5);
  for(let x = 0; x <= CW; x += CW / 16){
    ctx.lineTo(x, CH * 0.5 + (rnd() - 0.5) * 30 - 10);
  }
  ctx.lineTo(CW, CH * 0.7);
  ctx.lineTo(0, CH * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = HOKUSAI_PRUSSIAN;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Village strip — flat brown/grey houses.
  const houseRow = CH * 0.72;
  const houseH = CH * 0.1;
  const houseCount = 5 + Math.floor(rnd() * 4);
  // HK v2: organic spacing — variable widths and gaps, no comb grid.
  let _hxWalk = CW * (0.02 + rnd() * 0.05);
  for(let i = 0; i < houseCount; i++){
    const ci = Math.floor((i / houseCount) * lim);
    const chord = chords[ci] || chords[0];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [];
    const note = notes[0] || {m:60,v:80};
    const m = note.m!==undefined?note.m:note;
    const [r, g, b] = gc(m, 90);
    if(_hxWalk > CW * 0.90) break;
    const hwInner = CW * (0.075 + rnd() * 0.055);
    const hx = _hxWalk;
    const hyTop = houseRow + (rnd() - 0.5) * houseH * 0.10;
    _hxWalk += hwInner + CW * (0.015 + rnd() * 0.05);
    // House body.
    ctx.fillStyle = _hokusaiMute(r, g, b, 0.45, 0.7);
    ctx.fillRect(hx, hyTop, hwInner, houseH);
    ctx.strokeStyle = HOKUSAI_PRUSSIAN;
    ctx.lineWidth = 1.3;
    ctx.strokeRect(hx, hyTop, hwInner, houseH);
    // Roof — triangle.
    ctx.fillStyle = '#3D2412';
    ctx.beginPath();
    ctx.moveTo(hx - 4, hyTop);
    ctx.lineTo(hx + hwInner / 2, hyTop - houseH * 0.55);
    ctx.lineTo(hx + hwInner + 4, hyTop);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Water at bottom.
  ctx.fillStyle = _hokusaiMute(mr, mg, mb, 0.6, 0.55);
  ctx.fillRect(0, houseRow + houseH, CW, CH - houseRow - houseH);
  ctx.strokeStyle = HOKUSAI_PRUSSIAN;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, houseRow + houseH);
  ctx.lineTo(CW, houseRow + houseH);
  ctx.stroke();

  // Rain — diagonal lines across entire canvas. Density follows lim.
  const rainCount = Math.min(380, Math.max(120, lim * 6));
  ctx.strokeStyle = `rgba(${K.D[0]},${K.D[1]},${K.D[2]},0.55)`;   // HK v2: single ink-family tone
  ctx.lineWidth = 0.9;
  for(let i = 0; i < rainCount; i++){
    const x = rnd() * CW * 1.2 - CW * 0.1;
    const y = rnd() * CH;
    const len = 12 + rnd() * 18;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.4, y + len);  // diagonal fall to bottom-left
    ctx.stroke();
  }
}

// Variant 5 — Bridge: drum bridge arch over water + reeds.
function hokusaiPhaseBridge(ctx, CW, CH, chords, lim, gc, ss, mode){
  const rnd = _seedRnd(92, ss, lim, 5);
  const K = _hokusaiInk(chords, lim, gc);   // HK v2 note-driven ink-set
  ctx.fillStyle = HOKUSAI_PAPER;
  ctx.fillRect(0, 0, CW, CH);

  // Sky band at top — gradient-free, just 2 bands.
  const skyChord = chords[0];
  const skyNotes = skyChord && (skyChord.n || skyChord.notes) || [{m:72,v:80}];
  const skyNote = skyNotes[0];
  const [sr, sg, sb] = gc(skyNote.m!==undefined?skyNote.m:skyNote, 80);
  // HK v2: bokashi sky — ink gradation instead of a flat band.
  const skg = ctx.createLinearGradient(0, 0, 0, CH*0.40);
  skg.addColorStop(0, `rgba(${K.M[0]},${K.M[1]},${K.M[2]},0.65)`);
  skg.addColorStop(1, `rgba(${K.M[0]},${K.M[1]},${K.M[2]},0)`);
  ctx.fillStyle = skg;
  ctx.fillRect(0, 0, CW, CH * 0.4);

  // Water — bottom 50%, flat colour from middle chord.
  const midChord = chords[Math.floor(lim / 2)] || chords[0];
  const midNotes = midChord && (midChord.n || midChord.notes) || [{m:60,v:80}];
  const midNote = midNotes[0];
  const [wr, wg, wb] = gc(midNote.m!==undefined?midNote.m:midNote, 100);
  ctx.fillStyle = _hokusaiMute(wr, wg, wb, 0.5, 0.7);
  ctx.fillRect(0, CH * 0.55, CW, CH * 0.45);
  ctx.strokeStyle = HOKUSAI_PRUSSIAN;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, CH * 0.55);
  ctx.lineTo(CW, CH * 0.55);
  ctx.stroke();

  // Drum bridge — semi-circular arch spanning canvas, water below.
  const bridgeCY = CH * 0.55;
  const bridgeRadius = CW * 0.5;
  const bridgeCX = CW * 0.5;
  // Bridge bottom curve (visible part above water = top half of circle).
  ctx.beginPath();
  ctx.arc(bridgeCX, bridgeCY, bridgeRadius, Math.PI, 0, false);
  // Top: thicker bridge surface (offset arc above).
  const topRad = bridgeRadius + CH * 0.06;
  ctx.lineTo(bridgeCX + topRad, bridgeCY);
  ctx.arc(bridgeCX, bridgeCY, topRad, 0, Math.PI, true);
  ctx.closePath();
  // Bridge colour — chord-derived earthy brown.
  const lastChord = chords[lim - 1] || chords[0];
  const lastNotes = lastChord && (lastChord.n || lastChord.notes) || [{m:60,v:80}];
  const lastNote = lastNotes[0];
  const [br, bg, bb] = gc(lastNote.m!==undefined?lastNote.m:lastNote, 100);
  ctx.fillStyle = _hokusaiMute(br, bg, bb, 0.4, 0.7);
  ctx.fill();
  ctx.strokeStyle = HOKUSAI_PRUSSIAN;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Bridge ribbing — radial spokes from centre to inner arc.
  const ribCount = Math.min(16, Math.max(6, Math.floor(lim / 5)));
  ctx.strokeStyle = HOKUSAI_PRUSSIAN;
  ctx.lineWidth = 0.9;
  for(let i = 1; i < ribCount; i++){
    const ang = Math.PI + (i / ribCount) * Math.PI;
    const x1 = bridgeCX + Math.cos(ang) * bridgeRadius;
    const y1 = bridgeCY + Math.sin(ang) * bridgeRadius;
    const x2 = bridgeCX + Math.cos(ang) * topRad;
    const y2 = bridgeCY + Math.sin(ang) * topRad;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Reeds at water edges + middle scatter — chord-driven height, thickness,
  // bend direction, and seedheads. Concept is realised here: every chord
  // contributes one visible reed with a chord-coloured tip.
  const reedCount = Math.min(180, Math.max(30, lim * 3));
  for(let i = 0; i < reedCount; i++){
    const ci = i % lim;
    const chord = chords[ci] || chords[0];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [];
    const note = notes[0] || {m:60,v:80};
    const m = note.m !== undefined ? note.m : note;
    const v = note.v !== undefined ? note.v : 80;
    const [r, g, b] = gc(m, v);
    // Position: 60% in side clusters, 40% scattered along full water edge.
    const zoneRoll = rnd();
    let rx;
    if(zoneRoll < 0.40){
      // Left cluster — denser near bank, falls off with quadratic bias.
      rx = Math.pow(rnd(), 1.5) * CW * 0.30;
    } else if(zoneRoll < 0.80){
      // Right cluster.
      rx = CW - Math.pow(rnd(), 1.5) * CW * 0.30;
    } else {
      // Sparse middle scatter along full water edge.
      rx = CW * 0.10 + rnd() * CW * 0.80;
    }
    const ry = CH * 0.55 + rnd() * CH * 0.08;
    // Chord-driven height — pitch + velocity each contribute.
    const pitchNorm = Math.max(0, Math.min(1, (m - 40) / 40));
    const velNorm   = Math.max(0, Math.min(1, v / 110));
    const rh = 40 + pitchNorm * 80 + velNorm * 30;
    // Chord-driven thickness — more notes in chord = thicker reed.
    const lw = 2.0 + Math.min(notes.length, 4) / 4 * 1.5;
    // HK v2: stems in TWO ink tones only — chord identity lives in the tips.
    const _rt = (i % 2 === 0) ? K.D : K.M;
    const reedColor = `rgb(${_rt[0]},${_rt[1]},${_rt[2]})`;
    // Bend direction from pitch parity, amount from velocity.
    const bendDir = (m % 2 === 0 ? 1 : -1);
    const bendAmt = 5 + velNorm * 10;
    ctx.strokeStyle = reedColor;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    const tipX = rx + bendDir * bendAmt * 1.5;
    const tipY = ry - rh;
    ctx.quadraticCurveTo(
      rx + bendDir * bendAmt,
      ry - rh * 0.5,
      tipX, tipY
    );
    ctx.stroke();
    // Seedhead — chord-coloured dab at top, brighter than the stem.
    const seedSz = 1.5 + Math.min(notes.length, 4) / 4 * 1.5;
    ctx.fillStyle = `rgb(${Math.round(r*0.60+K.paper[0]*0.40)},${Math.round(g*0.60+K.paper[1]*0.40)},${Math.round(b*0.60+K.paper[2]*0.40)})`;
    ctx.beginPath();
    ctx.ellipse(tipX, tipY, seedSz, seedSz * 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Secondary seedhead for multi-note chords — uses the second note's colour.
    if(notes.length > 1){
      const n2 = notes[1];
      const m2 = n2.m !== undefined ? n2.m : n2;
      const v2 = n2.v !== undefined ? n2.v : 80;
      const [r2, g2, b2] = gc(m2, v2);
      ctx.fillStyle = `rgb(${Math.round(r2*0.55+K.paper[0]*0.45)},${Math.round(g2*0.55+K.paper[1]*0.45)},${Math.round(b2*0.55+K.paper[2]*0.45)})`;
      ctx.beginPath();
      ctx.ellipse(tipX + bendDir * 3, tipY - 3, seedSz * 0.7, seedSz * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Water ripples — horizontal short strokes (ink family).
  ctx.strokeStyle = `rgba(${K.D[0]},${K.D[1]},${K.D[2]},0.85)`;
  ctx.lineWidth = 1;
  const ripples = Math.min(60, Math.max(20, lim));
  for(let i = 0; i < ripples; i++){
    const y = CH * (0.58 + rnd() * 0.4);
    const x = rnd() * CW;
    const len = 16 + rnd() * 30;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len/2, y - 2, x + len, y);
    ctx.stroke();
  }
  // HK v2: climax lantern — one accent dot at the crest of the arch.
  const _lanY = bridgeCY - topRad - 7;
  if(_lanY > CH*0.03){
    ctx.fillStyle = `rgb(${K.A[0]},${K.A[1]},${K.A[2]})`;
    ctx.strokeStyle = `rgba(${K.sumi[0]},${K.sumi[1]},${K.sumi[2]},0.6)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(bridgeCX, _lanY, Math.max(4, CW*0.008), 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
  }
}

function drawKusamaOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, phaseIndex){
  if(!lim||!chords||!chords.length) return;
  const ss=sessionSeed|0;
  // ── PHASE CHOOSER: commit to ONE of Kusama's signature modes per painting ──
  // Determined by phaseIndex (modulo phase count). The Next button cycles it.
  //  A = Polka dots on color blocks — original.  B = Dot field — original.
  //  C = Infinity Nets (interlocking crescent mesh — true Kusama).
  //  D = Dotted Spheres (floating dot orbs).
  //  E = Iconic Infinity Dots (saturated ground + black dots + chord accents).
  //  F = Tendril nets (light on colour).
  const _pn=_capN(6); const pick=((phaseIndex|0)%_pn+_pn)%_pn;
  if(pick===1){ kusamaPhaseB(ctx,CW,CH,chords,lim,gc,ss); return; }
  if(pick===2){ kusamaPhaseNets(ctx,CW,CH,chords,lim,gc,ss); return; }
  if(pick===3){ kusamaPhaseSpheres(ctx,CW,CH,chords,lim,gc,ss); return; }
  if(pick===4){ kusamaPhaseAccum(ctx,CW,CH,chords,lim,gc,ss); return; }
  if(pick===5){ kusamaPhaseTendril(ctx,CW,CH,chords,lim,gc,ss); return; }
  kusamaPhaseA(ctx,CW,CH,chords,lim,gc,ss);
}

// ── Kusama phase A: polka dots on partitioned color blocks — the original. ──
function kusamaPhaseA(ctx, CW, CH, chords, lim, gc, sessionSeed){
  const ss=sessionSeed|0;
  const chordColor=(chord)=>{
    const notes=chord.n||chord.notes||(Array.isArray(chord)?chord:null);
    if(!notes||!notes.length) return[120,140,200,0.9,80];
    let aR=0,aG=0,aB=0,aA=0,aV=0,c=0;
    for(const note of notes){const m=note.m!==undefined?note.m:note;const v=note.v!==undefined?note.v:80;const[r,g,b,a]=gc(m,v);aR+=r;aG+=g;aB+=b;aA+=(a||0.9);aV+=v;c++;}
    return[aR/c,aG/c,aB/c,Math.min(1,aA/c),aV/c];
  };
  const _chKu = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const _kuMul = _chKu ? (0.53 + 0.94*(0.55*_chKu.energy + 0.45*_chKu.density)) : 1;
  const MAX_RECTS=Math.max(2,Math.round(Math.min(chords.length,
    chords.length<=40  ? chords.length
    :chords.length<=120 ? 40+Math.floor((chords.length-40)*0.45)
    :chords.length<=300 ? 76+Math.floor((chords.length-120)*0.20)
    :chords.length<=600 ? 112+Math.floor((chords.length-300)*0.12)
    :chords.length<=1000? 148+Math.floor((chords.length-600)*0.08)
    :180
  )*_kuMul));
  const paintCount=Math.min(MAX_RECTS,Math.max(1,Math.round(lim*(MAX_RECTS/chords.length))));
  let rects=[{x:0,y:0,w:1,h:1}];
  for(let cut=0;cut<MAX_RECTS-1;cut++){
    const cr=_seedRnd(cut+200,ss,0,0);
    let bigIdx=0,bigArea=0;
    for(let i=0;i<rects.length;i++){const a=rects[i].w*rects[i].h;if(a>bigArea){bigArea=a;bigIdx=i;}}
    const r=rects[bigIdx];
    const splitPos=0.30+cr()*0.40;
    let r1,r2;
    if(r.w>=r.h){const sw=r.w*splitPos;r1={x:r.x,y:r.y,w:sw,h:r.h};r2={x:r.x+sw,y:r.y,w:r.w-sw,h:r.h};}
    else{const sh=r.h*splitPos;r1={x:r.x,y:r.y,w:r.w,h:sh};r2={x:r.x,y:r.y+sh,w:r.w,h:r.h-sh};}
    rects.splice(bigIdx,1,r1,r2);
  }
  rects.forEach((rect,pIdx)=>{
    const bx=rect.x*CW,by=rect.y*CH,BW=rect.w*CW,BH=rect.h*CH;
    if(pIdx>=paintCount){ctx.fillStyle='#04040a';ctx.fillRect(bx,by,BW,BH);return;}
    const chord=chords[Math.min(chords.length-1,Math.floor(pIdx*(chords.length/MAX_RECTS)))];
    _setCurE(chord && chord._E);
    const[cR,cG,cB,cA,cV]=chordColor(chord);
    const energy=Math.max(0,Math.min(1,(cV-30)/90));
    const rnd=_seedRnd(pIdx+800,ss,0,0);
    const r=Math.round(cR),g=Math.round(cG),b=Math.round(cB);
    ctx.fillStyle=`rgba(${r},${g},${b},${(0.88+energy*0.10).toFixed(2)})`;ctx.fillRect(bx,by,BW,BH);
    const sR=Math.round(cR*0.65),sG=Math.round(cG*0.65),sB=Math.round(cB*0.65);
    const sg=ctx.createLinearGradient(bx,by,bx+BW*0.55,by);sg.addColorStop(0,`rgba(${sR},${sG},${sB},0.55)`);sg.addColorStop(0.6,`rgba(${sR},${sG},${sB},0.15)`);sg.addColorStop(1,`rgba(${sR},${sG},${sB},0)`);ctx.fillStyle=sg;ctx.fillRect(bx,by,BW,BH);
    const hR=Math.min(255,Math.round(cR*1.2+12)),hG=Math.min(255,Math.round(cG*1.2+12)),hB=Math.min(255,Math.round(cB*1.2+12));
    const tg=ctx.createLinearGradient(bx,by,bx,by+BH*0.45);tg.addColorStop(0,`rgba(${hR},${hG},${hB},0.38)`);tg.addColorStop(1,`rgba(${hR},${hG},${hB},0)`);ctx.fillStyle=tg;ctx.fillRect(bx,by,BW,BH);
    const ribCount=2+Math.floor(rnd()*2);
    const rR2=Math.round(cR*0.45),rG2=Math.round(cG*0.45),rB2=Math.round(cB*0.45);
    ctx.strokeStyle=`rgba(${rR2},${rG2},${rB2},0.48)`;ctx.lineWidth=Math.max(0.8,Math.min(BW,BH)*0.012);ctx.lineCap='round';
    for(let ri=1;ri<=ribCount;ri++){const rx=bx+BW*(ri/(ribCount+1)),pinch=BW*0.04;ctx.beginPath();ctx.moveTo(rx,by+BH*0.10);ctx.bezierCurveTo(rx-pinch,by+BH*0.35,rx-pinch,by+BH*0.65,rx,by+BH*0.90);ctx.stroke();}
    const dcr=rnd();let dotR,dotG,dotB;
    if(dcr<0.45){dotR=12;dotG=8;dotB=18;}else if(dcr<0.80){dotR=245;dotG=240;dotB=228;}else{dotR=Math.max(0,Math.min(255,255-r));dotG=Math.max(0,Math.min(255,255-g));dotB=Math.max(0,Math.min(255,255-b));}
    const dotCount=Math.max(3,Math.round(10+energy*15+Math.min(BW*BH/600,25)));
    const baseRadius=Math.min(BW,BH)*0.055;
    ctx.fillStyle=`rgba(${dotR},${dotG},${dotB},0.88)`;
    for(let k=0;k<dotCount;k++){const sr=rnd();const dr=sr<0.05?baseRadius*(2.2+rnd()*1.2):sr<0.40?baseRadius*(1.1+rnd()*0.5):baseRadius*(0.35+rnd()*0.45);ctx.beginPath();ctx.arc(bx+(rnd()*1.05-0.025)*BW,by+(rnd()*1.05-0.025)*BH,dr,0,Math.PI*2);ctx.fill();}
    if(rnd()<0.15&&Math.min(BW,BH)>15){const luma=0.299*cR+0.587*cG+0.114*cB;ctx.strokeStyle=luma>128?'rgba(12,8,18,0.62)':'rgba(245,240,228,0.62)';ctx.lineWidth=Math.max(0.8,Math.min(BW,BH)*0.007);ctx.lineCap='round';ctx.lineJoin='round';const ptCount=4+Math.floor(rnd()*3);ctx.beginPath();ctx.moveTo(bx+rnd()*BW*0.3,by+rnd()*BH);for(let pi=0;pi<ptCount;pi++){const t1=(pi+0.5)/ptCount,t2=(pi+1)/ptCount;ctx.quadraticCurveTo(bx+t1*BW,by+rnd()*BH,bx+t2*BW,by+rnd()*BH);}ctx.stroke();}
    ctx.strokeStyle='rgba(4,4,10,0.60)';ctx.lineWidth=Math.max(0.5,Math.min(CW,CH)*0.002);ctx.lineJoin='round';ctx.strokeRect(bx+0.5,by+0.5,BW-1,BH-1);
  });
  _setCurE(0.5);
}

// ── Kusama phase B: "Dot field" — the iconic look. Thousands of discrete
// filled circles of varied size scattered across the whole canvas on a ground
// whose lightness follows the music (bright music → pale/cream ground, dark
// music → deep ground). Dots are tinted across a RANGE of shades within the
// dominant color family (pale → mid → deep), and a smooth spatial DENSITY
// GRADIENT around a luminous focus makes the field shimmer with depth — the
// quality of her infinity-dot paintings. Distinct from phase A (dots sit on a
// continuous ground here, not on partitioned color blocks).
function kusamaPhaseB(ctx, CW, CH, chords, lim, gc, sessionSeed){
  const ss=sessionSeed|0;
  const cn=chords.length;
  // Dominant (most-saturated) chord color = the family hue; track average
  // luminance (for the light/dark ground decision) and velocity (for energy).
  let domR=110,domG=120,domB=160,domSat=-1,aLum=0,aV=0,c=0;
  const upto=Math.min(cn,Math.max(1,lim));
  for(let i=0;i<upto;i++){
    const chord=chords[i];
    const notes=chord&&(chord.n||chord.notes||(Array.isArray(chord)?chord:null));
    if(!notes||!notes.length) continue;
    for(const note of notes){
      const m=note.m!==undefined?note.m:note;const v=note.v!==undefined?note.v:80;
      const[r,g,b]=gc(m,v);
      const sat=Math.max(r,g,b)-Math.min(r,g,b);
      if(sat>domSat){domSat=sat;domR=r;domG=g;domB=b;}
      aLum+=0.299*r+0.587*g+0.114*b; aV+=v; c++;
    }
  }
  if(!c){c=1;aV=80;aLum=150;}
  const energy=Math.max(0,Math.min(1,(aV/c-30)/90));
  const avgLum=aLum/c; // 0..255 — drives light vs dark ground

  // Force the family color to full saturation, preserving hue.
  // Pastel tone: skip the push so the Kusama field stays soft.
  let fR=domR,fG=domG,fB=domB;
  if(domSat>10 && !_pastelOn){
    const mx=Math.max(domR,domG,domB,1),k=255/mx;
    let R=domR*k,G=domG*k,B=domB*k,m2=Math.max(R,G,B);
    const pull=ch=>ch===m2?ch:ch*0.55;
    fR=pull(R);fG=pull(G);fB=pull(B);
  }

  // Ground: music decides light or dark. Bright piece → pale tinted cream;
  // dark piece → deep tinted ground. Either way faintly carries the family hue.
  const lightGround = avgLum >= 120;
  let bg;
  if(lightGround){
    // pale cream with a whisper of the family hue
    bg=[Math.round(238+(fR-238)*0.06), Math.round(236+(fG-236)*0.06), Math.round(230+(fB-230)*0.06)];
  } else {
    bg=[Math.round(fR*0.16+8), Math.round(fG*0.16+8), Math.round(fB*0.16+12)];
  }
  ctx.fillStyle=`rgb(${bg[0]},${bg[1]},${bg[2]})`;
  ctx.fillRect(0,0,CW,CH);

  // Shade ramp within the family: from a pale tint to a deep shade. Each dot
  // picks a point on this ramp, so the field is "a bit colory" (many shades of
  // one family) rather than one flat tone.
  const shade=(t)=>{
    // t in [0,1]: 0 = pale tint, 0.5 = full family, 1 = deep shade
    if(t<0.5){const u=t/0.5;return [Math.round(fR+(255-fR)*(1-u)*0.85), Math.round(fG+(255-fG)*(1-u)*0.85), Math.round(fB+(255-fB)*(1-u)*0.85)];}
    const u=(t-0.5)/0.5; return [Math.round(fR*(1-u*0.62)), Math.round(fG*(1-u*0.62)), Math.round(fB*(1-u*0.62))];
  };

  // Density gradient: a luminous focus where dots thin out, packing denser away
  // from it (the glowing center in the reference). Focus position from the seed.
  const fr=_seedRnd(1300,ss, 0, 0);
  fr();fr();
  const focusX=CW*(0.3+fr()*0.4), focusY=CH*(0.25+fr()*0.5);
  const maxD=Math.hypot(CW,CH)*0.6;

  // Candidate dots on a jittered fine grid; keep each with probability driven by
  // distance from the focus (denser far from focus). Total scales with canvas.
  const D=Math.min(CW,CH);
  const baseStep=Math.max(5, D*(cn<30?0.045:cn<100?0.034:cn<250?0.026:cn<500?0.020:0.016)); // finer with more music
  const cols=Math.ceil(CW/baseStep)+1, rows=Math.ceil(CH/baseStep)+1;
  // Reveal proportionally to lim, so the field fills in as the piece plays.
  const revealFrac=Math.min(1, lim/Math.max(1,cn));

  let idx=0;
  for(let gy=0; gy<rows; gy++){
    for(let gx=0; gx<cols; gx++){
      idx++;
      const rnd=_seedRnd(idx*3+1700, ss, 0, 0);
      // progressive reveal: skip dots beyond the revealed fraction (stable order)
      if(rnd() > revealFrac + 0.0001) { /* still advance rng below for stability */ }
      const px=gx*baseStep + (rnd()-0.5)*baseStep*0.9;
      const py=gy*baseStep + (rnd()-0.5)*baseStep*0.9;
      // density: probability of a dot existing here grows with distance from focus
      const dist=Math.hypot(px-focusX, py-focusY)/maxD; // ~0 near focus, →1 far
      const keepP=0.18 + Math.min(0.82, dist*1.05);
      if(rnd() > keepP) continue;
      if(rnd() > revealFrac) continue; // progressive reveal gate
      // size: mostly small, occasionally large; denser regions trend a touch bigger
      const sr=rnd();
      const baseR=baseStep*0.5;
      const dr = sr<0.04 ? baseR*(1.7+rnd()*0.9)
               : sr<0.30 ? baseR*(0.95+rnd()*0.5)
               :           baseR*(0.35+rnd()*0.45);
      // shade: bias deeper away from the focus so the focus glows lighter
      const t=Math.max(0, Math.min(1, dist*0.7 + rnd()*0.5));
      const [cr,cg,cb]=shade(t);
      const a=0.82+energy*0.15;
      ctx.fillStyle=`rgba(${cr},${cg},${cb},${a.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(px, py, dr, 0, Math.PI*2);
      ctx.fill();
    }
  }
}

// Shared chord-colour sampler for new Kusama phases.
function _kusChord(chords,idx,gc){
  const chord=chords[Math.min(chords.length-1,Math.max(0,idx))];
  _setCurE(chord && chord._E);
  const notes=chord&&(chord.n||chord.notes||[]);
  let aR=0,aG=0,aB=0,aV=0,c=0;
  if(notes&&notes.length)for(const note of notes){const m=note.m!==undefined?note.m:note;const v=note.v!==undefined?note.v:80;const[r,g,b]=gc(m,v);aR+=r;aG+=g;aB+=b;aV+=v;c++;}
  if(!c)return{rgb:[200,60,80],energy:0.5};
  return{rgb:[Math.round(aR/c),Math.round(aG/c),Math.round(aB/c)],energy:Math.max(0,Math.min(1,(aV/c-30)/90))};
}

// ── Kusama C: Infinity Nets — looping mesh of arcs over a chord-lit ground. ──
function kusamaPhaseNets(ctx,CW,CH,chords,lim,gc,sessionSeed){
  // Kusama Infinity Nets — interlocking crescent mesh on saturated ground.
  // Rewritten from the original horizontal undulating rows (which read as
  // waves rather than nets). Hex-offset grid of crescent arcs, each cell
  // chord-tinted, with subtle inner shadows for depth.
  const ss=sessionSeed|0,cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));
  const dom = _kusChord(chords, 0, gc).rgb;
  // Saturated chord ground — slightly desaturated so cream arcs pop.
  ctx.fillStyle = `rgb(${Math.round(dom[0]*0.55)},${Math.round(dom[1]*0.45)},${Math.round(dom[2]*0.55)})`;
  ctx.fillRect(0, 0, CW, CH);
  // Honeycomb-offset crescent mesh.
  const cellSize = Math.max(18, Math.min(CW, CH) / 26);
  const cols = Math.ceil(CW/cellSize) + 2;
  const rows = Math.ceil(CH/cellSize) + 2;
  const visRows = Math.max(1, Math.ceil(rows * reveal));
  for(let r=0;r<visRows;r++){
    const offset = (r % 2) ? cellSize*0.5 : 0;
    for(let c=0;c<cols;c++){
      const cx = c*cellSize - cellSize*0.5 + offset;
      const cy = r*cellSize - cellSize*0.5;
      const cellRnd = _seedRnd(r*cols+c+5000, ss, 0, 0);
      const sk = cellRnd();
      // Skip ~8% cells for organic feel.
      if(sk < 0.08) continue;
      // Inner shadow crescent (~50% of cells) — gives depth.
      if(cellRnd() < 0.50){
        ctx.strokeStyle = `rgba(${Math.round(dom[0]*0.30)},${Math.round(dom[1]*0.25)},${Math.round(dom[2]*0.30)},0.40)`;
        ctx.lineWidth = Math.max(1, cellSize*0.08);
        ctx.beginPath();
        ctx.arc(cx + cellSize*0.05, cy + cellSize*0.05, cellSize*0.30, Math.PI*0.10, Math.PI*1.00);
        ctx.stroke();
      }
      // Bright crescent arc — chord-tinted cream/white.
      const ci = (r*cols + c) % cn;
      const {rgb} = _kusChord(chords, ci, gc);
      const tintR = Math.min(255, Math.round(rgb[0]*0.20 + 220));
      const tintG = Math.min(255, Math.round(rgb[1]*0.20 + 215));
      const tintB = Math.min(255, Math.round(rgb[2]*0.20 + 200));
      const alpha = 0.85 + cellRnd()*0.15;
      ctx.strokeStyle = `rgba(${tintR},${tintG},${tintB},${alpha.toFixed(2)})`;
      ctx.lineWidth = Math.max(1.5, cellSize*0.18);
      ctx.lineCap = 'round';
      ctx.beginPath();
      const radius = cellSize * (0.42 + cellRnd()*0.08);
      const startA = -Math.PI*0.25 + (cellRnd()-0.5)*0.40;
      const endA = Math.PI*1.25 + (cellRnd()-0.5)*0.40;
      ctx.arc(cx, cy, radius, startA, endA);
      ctx.stroke();
    }
  }
}

// ── Kusama D: Dotted Spheres — floating polka-dot orbs (Dots Obsession). ──
// Kusama's mirror-room spheres: saturated balls scattered in deep space, each
// with a soft radial shade and a skin of contrasting dots. Spheres reveal
// progressively with the music; each takes its colour from a chord.
function kusamaPhaseSpheres(ctx,CW,CH,chords,lim,gc,sessionSeed){
  const ss=sessionSeed|0,cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const base=_kusChord(chords,0,gc).rgb;
  // deep, slightly tinted void
  ctx.fillStyle=`rgb(${Math.round(base[0]*0.16)},${Math.round(base[1]*0.16)},${Math.round(base[2]*0.2)})`;
  ctx.fillRect(0,0,CW,CH);
  const orbs=Math.max(5,Math.min(48,Math.round(cn/3)));
  const vis=Math.max(1,Math.ceil(N/cn*orbs));
  const minD=Math.min(CW,CH);
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+401,ss,0,0);
    const {rgb,energy}=_kusChord(chords,Math.floor(i*(cn/orbs)),gc);
    const cx=rnd()*CW, cy=rnd()*CH;
    const R=minD*(0.07+energy*0.14+rnd()*0.05);
    // sphere body with radial shade for volume
    const lx=cx-R*0.3, ly=cy-R*0.3;
    const g=ctx.createRadialGradient(lx,ly,R*0.1,cx,cy,R);
    g.addColorStop(0,`rgb(${Math.min(255,rgb[0]+70)},${Math.min(255,rgb[1]+70)},${Math.min(255,rgb[2]+70)})`);
    g.addColorStop(1,`rgb(${Math.round(rgb[0]*0.45)},${Math.round(rgb[1]*0.45)},${Math.round(rgb[2]*0.45)})`);
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fill();
    // contrasting polka-dot skin, clipped to the sphere
    ctx.save();ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.clip();
    const lum=(rgb[0]+rgb[1]+rgb[2])/3;
    const dot=lum>128?'rgba(20,16,30,0.92)':'rgba(245,245,250,0.92)';
    const dn=Math.max(10,Math.floor(R*0.9));
    for(let d=0;d<dn;d++){
      const a=rnd()*Math.PI*2, rr=Math.sqrt(rnd())*0.95;
      const dx=cx+Math.cos(a)*R*rr, dy=cy+Math.sin(a)*R*rr;
      const dr=Math.max(1.2,R*(0.04+rnd()*0.04));
      ctx.fillStyle=dot;ctx.beginPath();ctx.arc(dx,dy,dr,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
}

// ── Kusama E: Iconic Infinity Dots — saturated ground, obsessive dots. ──
// Rewritten from the original "Accumulation" (which read too similar to
// X-3 Dotted Spheres). Classic Kusama Infinity Dot painting: dominant
// chord = saturated ground, 700 black/cream dots in size gradient,
// 15 large chord-coloured accent dots with black inner ring.
// Function name preserved to avoid touching the phase dispatcher.
function kusamaPhaseAccum(ctx,CW,CH,chords,lim,gc,sessionSeed){
  const ss=sessionSeed|0,cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));
  // Dominant (most-saturated) chord = ground colour.
  let domR=80,domG=80,domB=110,domSat=-1;
  const upto = Math.min(cn, Math.max(1, lim));
  for(let i=0;i<upto;i++){
    const {rgb} = _kusChord(chords, i, gc);
    const sat = Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
    if(sat > domSat){ domSat = sat; domR = rgb[0]; domG = rgb[1]; domB = rgb[2]; }
  }
  ctx.fillStyle = `rgb(${domR|0},${domG|0},${domB|0})`;
  ctx.fillRect(0, 0, CW, CH);
  // Black/cream dot field — scales with reveal.
  const totalDots = 700;
  const visDots = Math.max(50, Math.ceil(totalDots * reveal));
  for(let i=0;i<visDots;i++){
    const rnd = _seedRnd(i+6000, ss, 0, 0);
    const x = rnd() * CW;
    const y = rnd() * CH;
    // Size gradient — Math.pow(rnd, 3) gives obsessive small-dominant feel.
    const R = 2 + Math.pow(rnd(), 3) * 16;
    // 85% black (signature), 15% cream highlight.
    ctx.fillStyle = (rnd() < 0.85) ? '#080808' : '#f8c8b0';
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI*2);
    ctx.fill();
  }
  // 15 large chord-coloured accent dots — each with black inner ring.
  const accents = 15;
  const visAccents = Math.max(2, Math.ceil(accents * reveal));
  for(let i=0;i<visAccents;i++){
    const rnd = _seedRnd(i+7000, ss, 0, 0);
    const {rgb} = _kusChord(chords, (i*5)%cn, gc);
    const x = rnd() * CW;
    const y = rnd() * CH;
    const R = 18 + rnd() * 22;
    ctx.fillStyle = `rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI*2);
    ctx.fill();
    // Black inner ring — signature Kusama accent.
    ctx.fillStyle = '#080808';
    ctx.beginPath();
    ctx.arc(x, y, R*0.3, 0, Math.PI*2);
    ctx.fill();
  }
}

// ── Kusama F: Tendril nets — light organic tendrils on a saturated ground. ──
function kusamaPhaseTendril(ctx,CW,CH,chords,lim,gc,sessionSeed){
  const ss=sessionSeed|0,cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const base=_kusChord(chords,0,gc).rgb;
  ctx.fillStyle=`rgb(${Math.max(120,base[0])},${Math.round(base[1]*0.4)},${Math.round(base[2]*0.5)})`;ctx.fillRect(0,0,CW,CH);
  // (K1) Smooth vines growing from the bottom — small angular drift per step,
  // no teleporting segments. (K2) Polka-dot chains along every tendril plus a
  // terminal dot — the Kusama signature. (K3) Palette discipline: cream is
  // dominant, joined by just two chord colours per painting.
  const tendrils=Math.max(6,Math.min(26,Math.round(cn/4)+5));
  const vis=Math.max(1,Math.ceil(N/cn*tendrils));
  const groundCol=[Math.max(120,base[0]),Math.round(base[1]*0.4),Math.round(base[2]*0.5)];
  const colA=_kusChord(chords,0,gc).rgb;
  const colB=_kusChord(chords,Math.floor(cn/2),gc).rgb;
  const cream=[246,240,228];
  ctx.lineCap='round';
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+303,ss,0,0);
    const pick=rnd();
    const col = pick<0.55 ? cream : (pick<0.78 ? colA : colB);
    // Grow upward from below the canvas with a gentle personal curl.
    let x=CW*(0.06+rnd()*0.88), y=CH*1.02;
    let ang=-Math.PI/2+(rnd()-0.5)*0.5;
    const Ln=CH*(0.5+rnd()*0.55);
    const steps=34;
    const curl=(rnd()-0.5)*0.16;
    const pts=[[x,y]];
    for(let s=0;s<steps;s++){
      ang+=curl+(rnd()-0.5)*0.10;
      x+=Math.cos(ang)*Ln/steps; y+=Math.sin(ang)*Ln/steps;
      pts.push([x,y]);
    }
    ctx.strokeStyle=`rgba(${col[0]},${col[1]},${col[2]},0.9)`;
    ctx.lineWidth=Math.max(2,Math.min(CW,CH)*0.008);
    ctx.beginPath();
    for(let s=0;s<pts.length;s++){ if(s===0)ctx.moveTo(pts[s][0],pts[s][1]); else ctx.lineTo(pts[s][0],pts[s][1]); }
    ctx.stroke();
    // Dot chain along the vine.
    ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
    for(let j=2;j<pts.length;j+=3){
      const r=1.8+2.6*Math.abs(Math.sin(j*0.7))+rnd();
      ctx.beginPath();ctx.arc(pts[j][0],pts[j][1],r,0,Math.PI*2);ctx.fill();
    }
    // Terminal dot with a ground-colour core (Kusama donut).
    const tp=pts[pts.length-1];
    ctx.beginPath();ctx.arc(tp[0],tp[1],5+rnd()*4,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgb(${groundCol[0]},${groundCol[1]},${groundCol[2]})`;
    ctx.beginPath();ctx.arc(tp[0],tp[1],2+rnd()*1.5,0,Math.PI*2);ctx.fill();
  }
}


function drawMiroOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim||!chords||!chords.length) return;
  const ss=sessionSeed|0;
  // ── PHASE CHOOSER: commit to ONE of Miró's modes per painting ──
  // Determined by phaseIndex (modulo phase count). The Next button cycles it.
  //  A = Constellations — original.  B = Bright sparse — original.
  //  C = Blue triptych (deep blue field, few floating marks).
  //  D = Biomorphic creatures (curvy organic figures).
  //  E = Harlequin Carnival (busy confetti of small shapes).
  //  F = Primary signs on white (clean white ground, bold red/blue/black signs).
  //  Free (cap=2) sees Constellations + Blue — those two are visually farthest
  //  apart so the two-variant preview actually shows different paintings
  //  (A vs B alone read as the same dense composition).
  {
    const _pn=_capN(6); const pick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_variantCap === 2){
      // Free: 0 = Constellations (fall through), 1 = Blue triptych.
      if(pick===1){ miroPhaseBlue(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    } else {
      // Pro+: full ladder.
      if(pick===1){ miroPhaseB(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
      if(pick===2){ miroPhaseBlue(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
      if(pick===3){ miroPhaseBio(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
      if(pick===4){ miroPhaseCarnival(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
      if(pick===5){ miroPhaseSigns(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    }
    miroPhaseA(ctx,CW,CH,chords,lim,gc,ss,mode);
  }
}

// ── Miró phase A: the dense dark "Constellations" composition — the original. ──
function miroPhaseA(ctx, CW, CH, chords, lim, gc, sessionSeed, mode){
  const ss=sessionSeed|0;
  const N=Math.min(lim,chords.length);
  const isBW=mode==='bw';
  const D=Math.min(CW,CH);

  // Miró palette — derived from active colour scheme (Harmony/Spectral/φ/Custom)
  // for non-BW, or muted greys for BW. Black + white anchor in every variant.
  // ORA + SKIN remain fixed accents typical of Miró's broader palette (orange
  // and warm tan/skin tones) — they're stylistic constants, not pitch slots.
  const _P = _miroPal(isBW, gc, chords);
  const BLK  = _P.BLK;
  const RED  = _P.RED;
  const GRN  = _P.GRN;
  const BLU  = _P.BLU;
  const YEL  = _P.YEL;
  const ORA  = isBW?[130,120,100]:[220,105,20];
  const SKIN = isBW?[180,170,155]:[205,165,120]; // warm tan/skin
  const rgba=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // Tone-adjust helper for Miró fixed palette (RED/GRN/BLU/YEL/ORA/SKIN).
  // Without this the snap-to-accent step bypasses _energyTint and the painting
  // ignores per-chord dynamic in Real mode.
  const _tonedRGB = (c)=>{
    let r=c[0], g=c[1], b=c[2];
    if(typeof _energyTint === 'function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint === 'function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return [r,g,b];
  };
  // Pick accent from chord identity (pitch class) — NOT from the tone-shifted
  // RGB, so Pure/Real/Pastel all assign the SAME accent slot to the same chord.
  // Previously the snap decision branched on (r,g,b) of the chord-colour: in
  // Pastel the colour was a soft rose/sage/cream which didn't trip any of the
  // r>180&&g<100 etc. snap conditions, so the function fell to the default
  // branch — which called rr() and consumed a seed step. Every downstream
  // rnd() call then drew a different value, shifting positions and shape
  // identities across the painting. Snap by pitch class instead: tone-stable.
  // chord param: setting _curE right before sampling lets Real mode route to
  // the right palette band (pastel for piano, dark for forte).
  const accent=(r,g,b,rnd,chord)=>{
    const pick = (slot)=> chord ? _miroAccentRGB(slot, chord, gc, isBW, chords) : _tonedRGB({RED,GRN,BLU,YEL,ORA,SKIN}[slot] || RED);
    // First-note pitch class drives the accent slot deterministically.
    const notes = chord && (chord.n || chord.notes);
    const firstM = (notes && notes.length) ? (notes[0].m!=null?notes[0].m:notes[0]) : 60;
    const pc = ((firstM|0) % 12 + 12) % 12;
    if(isBW){
      // BW: 4 slots cycling on pitch class (no RGB branching, no RNG).
      const p = ['RED','BLU','YEL','ORA'];
      return pick(p[pc % p.length]);
    }
    // Map 12 pitch classes to the 5 Miró slots — keeps the per-chord identity
    // stable and gives a roughly even distribution across the canvas.
    //  C, G       -> RED       (warm anchor of harmony)
    //  E, A       -> GRN       (cool anchor)
    //  D, B       -> BLU
    //  F, F#      -> YEL
    //  D#, G#, A# -> ORA
    //  C#         -> RED again (12 → 5 fold, doesn't matter visually)
    const SLOT = ['RED','RED','BLU','ORA','GRN','YEL','YEL','RED','ORA','GRN','ORA','BLU'];
    return pick(SLOT[pc]);
  };

  // Chord color helper
  const chordRGB=(chord)=>{
    _setCurE(chord && chord._E);
    const notes=chord.n||chord.notes||[];
    if(!notes.length) return[120,100,180];
    let aR=0,aG=0,aB=0,c=0;
    for(const n of notes){
      const m=n.m!==undefined?n.m:n,v=n.v!==undefined?n.v:80;
      const[r,g,b]=gc(m,v);aR+=r;aG+=g;aB+=b;c++;
    }
    return[aR/c,aG/c,aB/c];
  };

  // 1. DARK TEXTURED GROUND -- speckled brown/black field
  ctx.fillStyle=rgba([28,18,12],1);
  ctx.fillRect(0,0,CW,CH);
  const speckRnd=_seedRnd(9999,ss,0,0);
  const speckCount=Math.round(CW*CH*0.0011);
  for(let i=0;i<speckCount;i++){
    const sx=speckRnd()*CW,sy=speckRnd()*CH;
    const sc=speckRnd();
    const col=sc<0.5?rgba([185,155,110],0.10+speckRnd()*0.12)
              :sc<0.8?rgba([210,175,130],0.07+speckRnd()*0.08)
              :rgba([120,90,60],0.15+speckRnd()*0.10);
    const r=speckRnd()*2.5+0.5;
    ctx.fillStyle=col;
    ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);ctx.fill();
  }

  // Object count is FIXED for the whole song (does not grow with the playhead),
  // so each element keeps a stable identity — same position, same chord, same
  // colour — for the entire piece. We only REVEAL the first `vis` as playback
  // advances, so the painting fills in calmly instead of re-rolling every note.
  // Density is deliberately modest (a sqrt curve, hard cap 200) — the old
  // per-note growth made long pieces like Liszt an overcrowded flickering field.
  const _cnA = Math.max(1, chords.length);
  const _chMi = (typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const _miMul = _chMi ? (0.53 + 0.94*(0.55*_chMi.energy + 0.45*_chMi.density)) : 1;
  const TOTAL = Math.max(8, Math.min(240, Math.round((20 + Math.sqrt(_cnA) * 5) * _miMul)));
  const vis = Math.max(1, Math.ceil((N/_cnA) * TOTAL));

  // 2. SHAPES -- one constellation unit per pass (stable identity, revealed over time)
  for(let p=0;p<vis;p++){
    const rnd=_seedRnd(p+900,ss,0,0);
    // Chord tied to the element's FIXED slot (p/TOTAL), NOT the moving playhead,
    // so each object keeps its colour for the whole song (no per-note recolour).
    const chord=chords[Math.floor((p/TOTAL)*_cnA)%_cnA];
    _setCurE(chord && chord._E);
    const[cR,cG,cB]=chordRGB(chord);
    const ac=accent(cR,cG,cB,rnd,chord);
    const ax=CW*(0.03+rnd()*0.94);
    const ay=CH*(0.03+rnd()*0.94);
    const roll=rnd();

    if(roll<0.14){
      // -- CONNECTOR LINE + BEAD NODES --
      const segs=2+Math.floor(rnd()*5);
      const pts=[{x:ax,y:ay}];
      for(let s=0;s<segs;s++)
        pts.push({x:pts[s].x+(rnd()-0.5)*CW*0.14,y:pts[s].y+(rnd()-0.5)*CH*0.14});
      ctx.strokeStyle=rgba(BLK,0.85);
      ctx.lineWidth=Math.max(0.8,D*0.004);ctx.lineCap='round';ctx.lineJoin='round';
      ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
      for(let s=1;s<pts.length;s++) ctx.lineTo(pts[s].x,pts[s].y);
      ctx.stroke();
      for(let s=0;s<pts.length;s++){
        const big=rnd()<0.30,col=rnd()<0.22?ac:BLK;
        const r=big?D*(0.016+rnd()*0.014):D*(0.005+rnd()*0.007);
        ctx.fillStyle=rgba(col,0.95);
        ctx.beginPath();ctx.arc(pts[s].x,pts[s].y,r,0,Math.PI*2);ctx.fill();
      }

    }else if(roll<0.38){
      // -- CONCENTRIC RINGS (target / bull's-eye) -- Constellations signature
      const rings=2+Math.floor(rnd()*3);
      const outerR=D*(0.022+rnd()*0.040);
      const cols=[ac,BLK,YEL,ac,BLK];
      for(let k=rings;k>=0;k--){
        const r=outerR*(k/rings);
        ctx.fillStyle=rgba(cols[k%cols.length],0.92);
        ctx.beginPath();ctx.arc(ax,ay,r,0,Math.PI*2);ctx.fill();
      }
      // Pupil
      ctx.fillStyle=rgba(BLK,0.95);
      ctx.beginPath();ctx.arc(ax,ay,outerR*0.15,0,Math.PI*2);ctx.fill();

    }else if(roll<0.52){
      // -- SPIKY STAR / CROSS --
      const arms=4+Math.floor(rnd()*5);
      const outerR=D*(0.016+rnd()*0.028);
      const innerR=outerR*(0.18+rnd()*0.20);
      const col=rnd()<0.55?BLK:ac;
      ctx.strokeStyle=rgba(col,0.90);
      ctx.lineWidth=Math.max(0.8,D*0.004);ctx.lineCap='round';
      for(let k=0;k<arms;k++){
        const a=k*(Math.PI*2/arms)+(rnd()-0.5)*0.25;
        ctx.beginPath();
        ctx.moveTo(ax+Math.cos(a)*innerR,ay+Math.sin(a)*innerR);
        ctx.lineTo(ax+Math.cos(a)*outerR,ay+Math.sin(a)*outerR);
        ctx.stroke();
      }
      ctx.fillStyle=rgba(rnd()<0.5?ac:BLK,0.92);
      ctx.beginPath();ctx.arc(ax,ay,D*0.007,0,Math.PI*2);ctx.fill();

    }else if(roll<0.64){
      // -- BIOMORPHIC BLOB --
      const bR=D*(0.022+rnd()*0.055);
      const nPts=5+Math.floor(rnd()*5);
      const pts2=[];
      for(let k=0;k<nPts;k++){
        const a=k*(Math.PI*2/nPts)+(rnd()-0.5)*0.7;
        pts2.push({x:ax+Math.cos(a)*bR*(0.45+rnd()*0.85),y:ay+Math.sin(a)*bR*(0.45+rnd()*0.85)});
      }
      ctx.beginPath();ctx.moveTo(pts2[0].x,pts2[0].y);
      for(let k=0;k<pts2.length;k++){
        const cur=pts2[k],next=pts2[(k+1)%pts2.length];
        ctx.quadraticCurveTo(cur.x,cur.y,(cur.x+next.x)/2,(cur.y+next.y)/2);
      }
      ctx.closePath();
      ctx.fillStyle=rgba(rnd()<0.55?ac:SKIN,0.88);ctx.fill();
      ctx.strokeStyle=rgba(BLK,0.75);ctx.lineWidth=Math.max(0.5,D*0.003);ctx.stroke();

    }else if(roll<0.74){
      // -- EYE (almond) --
      const ew=D*(0.030+rnd()*0.038),eh=ew*(0.35+rnd()*0.28);
      ctx.save();ctx.translate(ax,ay);ctx.rotate(rnd()*Math.PI);
      ctx.beginPath();ctx.ellipse(0,0,ew,eh,0,0,Math.PI*2);
      ctx.fillStyle=rgba(SKIN,0.90);ctx.fill();
      ctx.strokeStyle=rgba(BLK,0.90);ctx.lineWidth=Math.max(0.8,D*0.004);ctx.stroke();
      const ir=eh*(0.52+rnd()*0.15);
      ctx.beginPath();ctx.arc(0,0,ir,0,Math.PI*2);
      ctx.fillStyle=rgba(ac,0.90);ctx.fill();
      ctx.strokeStyle=rgba(BLK,0.75);ctx.lineWidth=Math.max(0.5,D*0.002);ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,ir*0.40,0,Math.PI*2);
      ctx.fillStyle=rgba(BLK,0.95);ctx.fill();
      ctx.restore();

    }else if(roll<0.83){
      // -- CRESCENT --
      const cr=D*(0.018+rnd()*0.030);
      const col=rnd()<0.50?ac:BLK;
      const sa=rnd()*Math.PI*2;
      ctx.fillStyle=rgba(col,0.88);
      ctx.beginPath();
      ctx.arc(ax,ay,cr,sa,sa+Math.PI*1.55);
      ctx.arc(ax+Math.cos(sa+Math.PI*0.78)*cr*0.55,ay+Math.sin(sa+Math.PI*0.78)*cr*0.55,cr*0.72,sa+Math.PI*1.55,sa,true);
      ctx.closePath();ctx.fill();

    }else{
      // -- TRIANGLE --
      const ts=D*(0.018+rnd()*0.030);
      const rot=rnd()*Math.PI*2;
      ctx.fillStyle=rgba(rnd()<0.60?ac:BLK,0.90);
      ctx.beginPath();
      for(let k=0;k<3;k++){
        const a=rot+k*(Math.PI*2/3);
        k===0?ctx.moveTo(ax+Math.cos(a)*ts,ay+Math.sin(a)*ts):ctx.lineTo(ax+Math.cos(a)*ts,ay+Math.sin(a)*ts);
      }
      ctx.closePath();ctx.fill();
      ctx.strokeStyle=rgba(BLK,0.65);ctx.lineWidth=Math.max(0.5,D*0.002);ctx.stroke();
    }
  }
}

// ── Miró phase B: "bright sparse" — his airy 1920s–30s manner. A flat luminous
// colored ground (lightened from the music's dominant chord) holds just a FEW
// large, bold, well-spaced shapes — a big biomorphic blob, a bull's-eye, a
// star, and one or two thick black gestural lines — with lots of breathing
// space. The opposite of the dense dark Constellations of phase A, but the same
// shape vocabulary and palette, so it reads as the same hand.
function miroPhaseB(ctx, CW, CH, chords, lim, gc, sessionSeed, mode){
  const ss=sessionSeed|0;
  const N=Math.min(lim,chords.length);
  const isBW=mode==='bw';
  const D=Math.min(CW,CH);

  // Miró palette (same as phase A).
  // Miró palette — see _miroPal (BW = greys; non-BW = active colour scheme).
  const _P = _miroPal(isBW, gc, chords);
  const BLK = _P.BLK;
  const RED = _P.RED;
  const GRN = _P.GRN;
  const BLU = _P.BLU;
  const YEL = _P.YEL;
  const ORA = isBW?[130,120,100]:[220,105,20];
  const SKIN= isBW?[180,170,155]:[205,165,120];
  const ACC = [RED,GRN,BLU,YEL,ORA];
  const rgba=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // Dominant (most-saturated) chord color → the family for the ground tint.
  let domR=120,domG=110,domB=170,domSat=-1,c=0;
  const upto=Math.min(N,Math.max(1,lim));
  for(let i=0;i<upto;i++){
    const chord=chords[i];const notes=chord&&(chord.n||chord.notes||[]);
    if(!notes||!notes.length) continue;
    for(const note of notes){const m=note.m!==undefined?note.m:note;const v=note.v!==undefined?note.v:80;const[r,g,b]=gc(m,v);const sat=Math.max(r,g,b)-Math.min(r,g,b);if(sat>domSat){domSat=sat;domR=r;domG=g;domB=b;}c++;}
  }

  // Flat luminous ground: a pale wash of the dominant family (Miró grounds are
  // bright and slightly tinted — cream, pale blue, soft ochre). In B/W, cream.
  let bg;
  if(isBW){ bg=[226,222,214]; }
  else {
    bg=[Math.round(domR+(255-domR)*0.78), Math.round(domG+(255-domG)*0.78), Math.round(domB+(255-domB)*0.80)];
  }
  ctx.fillStyle=rgba(bg,1); ctx.fillRect(0,0,CW,CH);

  // A FEW large shapes — count grows slowly and stays sparse.
  const cn=chords.length;
  const shapeCount=Math.max(3, Math.min(12, 3+Math.floor(cn/22)));
  const paintCount=Math.max(1, Math.min(shapeCount, Math.round(lim*(shapeCount/Math.max(1,cn)))));

  // Place shapes on a loose scatter, biased to keep them apart (sample a few
  // candidate positions per shape and take the one farthest from prior centers).
  const placed=[];
  const pickPos=(rnd)=>{
    let best=null,bestD=-1;
    for(let t=0;t<6;t++){
      const x=CW*(0.14+rnd()*0.72), y=CH*(0.14+rnd()*0.72);
      let md=1e9; for(const p of placed){const d=Math.hypot(x-p.x,y-p.y); if(d<md)md=d;}
      if(placed.length===0)md=1e9;
      if(md>bestD){bestD=md;best={x,y};}
    }
    return best;
  };

  // Tone-adjust helper: Real -> energy modulates, Pastel -> soft filter.
  const _tonedRGB = (c)=>{
    let r=c[0], g=c[1], b=c[2];
    if(typeof _energyTint === 'function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint === 'function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return [r,g,b];
  };
  const chordRGB=(idx)=>{
    const chord=chords[Math.min(cn-1,Math.floor((idx/Math.max(1,paintCount))*cn))];
    _setCurE(chord && chord._E);
    const notes=chord&&(chord.n||chord.notes||[]);
    const pick = (slot)=> chord ? _miroAccentRGB(slot, chord, gc, isBW, chords) : _tonedRGB({RED,GRN,BLU,YEL,ORA,SKIN}[slot] || RED);
    // Snap by pitch class (tone-stable) instead of by RGB (tone-shifts).
    // See phaseA accent() for the same fix. SLOT keeps the per-chord identity
    // stable across Pure/Real/Pastel so structural decisions downstream don't
    // shift between tones.
    const firstM = (notes && notes.length) ? (notes[0].m!=null?notes[0].m:notes[0]) : 60;
    const pc = ((firstM|0) % 12 + 12) % 12;
    if(isBW) return _tonedRGB(ACC[pc % ACC.length]);
    const SLOT = ['RED','RED','BLU','ORA','GRN','YEL','YEL','RED','ORA','GRN','ORA','BLU'];
    return pick(SLOT[pc]);
  };

  for(let p=0;p<paintCount;p++){
    const rnd=_seedRnd(p+2100,ss, 0, 0);
    const pos=pickPos(rnd); placed.push(pos);
    const ax=pos.x, ay=pos.y;
    const ac=chordRGB(p);
    const kind=rnd();

    if(kind<0.34){
      // Large biomorphic blob with a bold black outline (his signature amoeba).
      const bR=D*(0.10+rnd()*0.10);
      const nPts=6+Math.floor(rnd()*5);
      const pts=[];
      for(let k=0;k<nPts;k++){const a=k*(Math.PI*2/nPts)+(rnd()-0.5)*0.6;pts.push({x:ax+Math.cos(a)*bR*(0.55+rnd()*0.7),y:ay+Math.sin(a)*bR*(0.55+rnd()*0.7)});}
      ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
      for(let k=0;k<pts.length;k++){const cur=pts[k],next=pts[(k+1)%pts.length];ctx.quadraticCurveTo(cur.x,cur.y,(cur.x+next.x)/2,(cur.y+next.y)/2);}
      ctx.closePath();
      ctx.fillStyle=rgba(rnd()<0.7?ac:SKIN,0.95);ctx.fill();
      ctx.strokeStyle=rgba(BLK,0.92);ctx.lineWidth=Math.max(1.5,D*0.007);ctx.lineJoin='round';ctx.stroke();
    } else if(kind<0.58){
      // Big bull's-eye / target.
      const rings=2+Math.floor(rnd()*3);
      const outerR=D*(0.05+rnd()*0.05);
      const cols=[ac,BLK,YEL,ac,BLK];
      for(let k=rings;k>=0;k--){ctx.fillStyle=rgba(cols[k%cols.length],0.95);ctx.beginPath();ctx.arc(ax,ay,outerR*(k/rings),0,Math.PI*2);ctx.fill();}
      ctx.fillStyle=rgba(BLK,0.95);ctx.beginPath();ctx.arc(ax,ay,outerR*0.16,0,Math.PI*2);ctx.fill();
    } else if(kind<0.78){
      // Bold spiky star.
      const arms=5+Math.floor(rnd()*5);
      const outerR=D*(0.045+rnd()*0.05),innerR=outerR*(0.3+rnd()*0.2);
      ctx.strokeStyle=rgba(BLK,0.92);ctx.lineWidth=Math.max(1.5,D*0.006);ctx.lineCap='round';
      for(let k=0;k<arms;k++){const a=k*(Math.PI*2/arms)+(rnd()-0.5)*0.2;ctx.beginPath();ctx.moveTo(ax+Math.cos(a)*innerR,ay+Math.sin(a)*innerR);ctx.lineTo(ax+Math.cos(a)*outerR,ay+Math.sin(a)*outerR);ctx.stroke();}
      ctx.fillStyle=rgba(ac,0.95);ctx.beginPath();ctx.arc(ax,ay,D*0.012,0,Math.PI*2);ctx.fill();
    } else {
      // A bold solid disc + a small accent satellite.
      const r=D*(0.04+rnd()*0.05);
      ctx.fillStyle=rgba(ac,0.95);ctx.beginPath();ctx.arc(ax,ay,r,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=rgba(BLK,0.9);ctx.lineWidth=Math.max(1.2,D*0.005);ctx.stroke();
      const sa=rnd()*Math.PI*2,sd=r*(1.6+rnd()*0.8);
      ctx.fillStyle=rgba(BLK,0.95);ctx.beginPath();ctx.arc(ax+Math.cos(sa)*sd,ay+Math.sin(sa)*sd,D*0.012,0,Math.PI*2);ctx.fill();
    }
  }

  // One or two thick black gestural lines sweeping across the field — the
  // connective "wire" that ties a Miró composition together. Only once enough
  // of the piece has played, so it doesn't appear before the shapes.
  if(paintCount>=2){
    const lineN=1+(_seedRnd(2050,ss, 0, 0)()<0.5?1:0);
    for(let i=0;i<lineN;i++){
      const rnd=_seedRnd(2060+i,ss, 0, 0);
      const x0=CW*(0.08+rnd()*0.2), y0=CH*(0.1+rnd()*0.8);
      const x1=CW*(0.7+rnd()*0.22), y1=CH*(0.1+rnd()*0.8);
      const mx=(x0+x1)/2+(rnd()-0.5)*CW*0.3, my=(y0+y1)/2+(rnd()-0.5)*CH*0.3;
      ctx.strokeStyle=rgba(BLK,0.9);ctx.lineWidth=Math.max(2,D*0.008);ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(x0,y0);ctx.quadraticCurveTo(mx,my,x1,y1);ctx.stroke();
      // a bead node at one end
      ctx.fillStyle=rgba(BLK,0.95);ctx.beginPath();ctx.arc(x1,y1,D*0.013,0,Math.PI*2);ctx.fill();
    }
  }
}

// Miró palette helper used by the new phases.
// ── Song-aware palette helper (shared by Miró / Kandinsky / Bauhaus) ─────────
// Returns the top N pitch classes of the piece as mid-octave MIDI anchors
// (so gc() can sample them like a real note). Frequency is velocity-weighted
// so the LOUD notes drive the palette identity, not silent passing tones.
// Deterministic: same chords → same ranking → same anchors → same painting.
// Returns null if no usable pitch data — callers must keep a static fallback.
function _songTopPitches(chords, N){
  if(!chords || !chords.length) return null;
  const hist = new Array(12).fill(0);
  let total = 0;
  for(const ch of chords){
    const notes = ch && (ch.n || ch.notes);
    if(!notes || !notes.length) continue;
    for(const note of notes){
      const m = note.m !== undefined ? note.m : note;
      const v = note.v !== undefined ? note.v : 80;
      if(typeof m !== 'number') continue;
      const pc = ((m|0) % 12 + 12) % 12;
      const w = (typeof v === 'number' ? v : 80);
      hist[pc] += w;
      total += w;
    }
  }
  if(total === 0) return null;
  // Sort PCs by weight desc, tie-break by PC index asc (stable, deterministic).
  const order = hist.map((c,i)=>({c,i}))
                    .sort((a,b)=> (b.c - a.c) || (a.i - b.i))
                    .map(x => x.i);
  // Return mid-octave MIDI anchors (C4-based) so gc() routes through the
  // active mode the same way the original fixed-pitch sampling did.
  return order.slice(0, Math.max(1, N|0)).map(pc => 60 + pc);
}

// ── Song tint for hardcoded baseline palettes ────────────────────────────────
// Returns [r,g,b] = gc() sampled at the song's TOP pitch class, or null.
// Used by signature artist phases (Mitchell Sunflower, Sam Francis Blue Balls,
// Rothko Incandescent, etc.) where the hardcoded baseline colour IS the
// painting's identity — but the identity should bend to the piece, not stay
// frozen across every song. The tint moves the baseline part-way (15..40%)
// toward the song's loudest pitch colour so a synth-pop sunflower blooms in
// rose-mauve while a late Romantic one bronzes — same flowers, different light.
function _songTint(chords, gc){
  if(!chords || !chords.length || typeof gc !== 'function') return null;
  const tops = _songTopPitches(chords, 1);
  if(!tops || !tops.length) return null;
  const c = gc(tops[0], 100);
  if(!Array.isArray(c)) return null;
  return [c[0]|0, c[1]|0, c[2]|0];
}

// Lerp a hardcoded [r,g,b] baseline toward the song tint by `strength` (0..1).
// Strength tunes per-phase: identity-strong phases (Blue Balls must stay blue)
// use 0.20..0.25; open phases (Sunflower can bend more) use 0.30..0.40.
// Returns [r,g,b] (clamped 0..255). Falls back to the baseline when no tint.
function _tintBaseline(baseline, tint, strength){
  if(!tint || !baseline) return baseline ? baseline.slice() : baseline;
  const k = Math.max(0, Math.min(1, strength));
  const mk = 1 - k;
  return [
    Math.max(0, Math.min(255, baseline[0]*mk + tint[0]*k))|0,
    Math.max(0, Math.min(255, baseline[1]*mk + tint[1]*k))|0,
    Math.max(0, Math.min(255, baseline[2]*mk + tint[2]*k))|0,
  ];
}

function _miroPal(isBW, gc, chords){
  // BW mode keeps the original muted greys — Miró without colour is texture,
  // not a palette to shift. Black + white always remain ink and canvas
  // (universal anchors), they don't change with the colour scheme.
  if(isBW || typeof gc!=='function'){
    return {
      BLK:[14,12,16],
      RED: isBW?[90,85,82]  :[215,38,30],
      GRN: isBW?[80,85,80]  :[40,150,55],
      BLU: isBW?[75,80,110] :[28,65,200],
      YEL: isBW?[170,165,140]:[225,195,25],
      WHT:[245,242,235]
    };
  }
  // Song-aware accent slots: derive RED/GRN/BLU/YEL from gc() at the song's
  // TOP FOUR pitch classes (loud notes dominate). Active palette ripples
  // through Miró: Harmony → COF colours; Spectral → chromatic; φ Phi →
  // golden-angle spread; Custom → user picks. Two pieces in the same mode
  // now read DIFFERENTLY — a Liszt sonata in Spectral picks one set of four
  // anchors, a synth-pop song in Spectral picks another. Fallback to the
  // canonical I-iii-V-vi (C,E,G,A) when chord data is unavailable.
  const tops = _songTopPitches(chords, 4);
  const A = (tops && tops.length) ? tops : [60, 64, 67, 69];
  const samp = m => { const c = gc(m, 100); return [c[0]|0, c[1]|0, c[2]|0]; };
  return {
    BLK:[14,12,16],
    RED: samp(A[0]),
    GRN: samp(A[1] != null ? A[1] : A[0]),
    BLU: samp(A[2] != null ? A[2] : A[0]),
    YEL: samp(A[3] != null ? A[3] : A[0]),
    WHT:[245,242,235]
  };
}

// Per-element Miró accent picker — REPLACES the snap-to-fixed-palette flow.
// For accent slot `slot` ("RED"/"GRN"/"BLU"/"YEL"/"ORA"/"SKIN") and chord
// energy band, it:
//   1) sets _curE for the chord
//   2) samples gc at the pitch class anchoring that slot (C/E/G/A/Bb/F#)
//   3) returns the resulting [r,g,b]
// Real-mode palette switching (pastel/pure/dark) thus applies PER ACCENT —
// piano-chord elements get pastel reds, forte-chord elements get dark reds,
// instead of every accent being one fixed flat colour.
// Falls back to the static _miroPal slot when gc/chord unavailable.
function _miroAccentRGB(slot, chord, gc, isBW, chords){
  const fallback = _miroPal(isBW, gc, chords);
  if(!chord || typeof gc !== 'function' || isBW) return fallback[slot] || fallback.RED;
  _setCurE(chord._E);
  // Song-aware: the 6 Miró slots (RED/GRN/BLU/YEL/ORA/SKIN) map to the top 6
  // pitch classes of the piece. A song with only 3 distinct PCs still works
  // (fewer slots populate via fallback). Two-piece A/B test in Spectral mode
  // now reads as two clearly different paintings instead of identical sets.
  // Fallback to the canonical I-iii-V-vi+ when chord data is unavailable.
  const tops = _songTopPitches(chords, 6);
  const slotIdx = { RED:0, GRN:1, BLU:2, YEL:3, ORA:4, SKIN:5 };
  const fixedFallback = { RED:60, GRN:64, BLU:67, YEL:69, ORA:70, SKIN:65 };
  const idx = slotIdx[slot] != null ? slotIdx[slot] : 0;
  const m = (tops && tops[idx] != null) ? tops[idx]
          : (tops && tops[0] != null)   ? tops[0]
          : (fixedFallback[slot] != null ? fixedFallback[slot] : 60);
  const c = gc(m, 100);
  if(!Array.isArray(c)) return fallback[slot] || fallback.RED;
  return [c[0]|0, c[1]|0, c[2]|0];
}

// ── Miró C: Blue triptych — a deep blue field with a few floating marks. ──
function miroPhaseBlue(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const P=_miroPal(isBW, gc, chords);
  ctx.fillStyle=isBW?'rgb(70,72,90)':'rgb(20,55,150)';ctx.fillRect(0,0,CW,CH);
  const marks=Math.max(3,Math.min(24,Math.round(cn/8)));
  const vis=Math.max(1,Math.ceil(N/cn*marks));
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+501,ss,0,0);
    const ci = Math.min(cn-1, Math.floor(i*(cn/marks)));
    const chord = chords[ci];
    const {rgb,energy}=_picChord(chords,ci,gc,isBW);
    const x=0.1*CW+rnd()*0.8*CW, y=0.1*CH+rnd()*0.8*CH;
    const kind=(rnd()*3)|0;
    if(kind===0){ // black gesture line
      ctx.strokeStyle=`rgba(${P.BLK[0]},${P.BLK[1]},${P.BLK[2]},0.92)`;ctx.lineWidth=Math.max(2,CW*0.006);ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+(rnd()-0.5)*CW*0.3,y+(rnd()-0.5)*CH*0.3,x+(rnd()-0.5)*CW*0.25,y+(rnd()-0.5)*CH*0.25);ctx.stroke();
    } else if(kind===1){ // red/yellow disc (band-aware via _miroAccentRGB)
      const col = _miroAccentRGB(rnd()<0.5?'RED':'YEL', chord, gc, isBW, chords);
      ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
      ctx.beginPath();ctx.arc(x,y,Math.min(CW,CH)*(0.02+energy*0.04),0,Math.PI*2);ctx.fill();
    } else { // star
      ctx.fillStyle=`rgb(${P.WHT[0]},${P.WHT[1]},${P.WHT[2]})`;const R=Math.min(CW,CH)*0.025;
      ctx.beginPath();for(let s=0;s<10;s++){const a=s*Math.PI/5,rr=s%2?R*0.4:R;ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}ctx.closePath();ctx.fill();
    }
  }
}

// ── Miró D: Biomorphic creatures — curvy organic blobs with eye-dots. ──
// ── Miró D: "Web" — thin black curving network with palette-coloured nodes.
// Algorithmically a graph (nodes + edges), not biomorphic blobs. Markedly
// distinct from Picasso Surreal (which is a few large polygons with eye).
function miroPhaseBio(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const reveal=Math.max(0,Math.min(1,N/cn));
  const D=Math.min(CW,CH);
  const P=_miroPal(isBW, gc, chords);
  // Cream paper ground.
  const _adjHex=(hex)=>{
    let r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
    if(typeof _energyTint==='function'){const t=_energyTint(r,g,b);r=t[0];g=t[1];b=t[2];}
    if(typeof _pastelTint==='function'){const p=_pastelTint(r,g,b);r=p[0];g=p[1];b=p[2];}
    return `rgb(${r},${g},${b})`;
  };
  if(chords && chords.length){ const _c0=chords[0]; _setCurE(_c0 && _c0._E); }
  const grad=ctx.createLinearGradient(0,0,0,CH);
  if(isBW){
    grad.addColorStop(0,_adjHex('#e0dcd4'));
    grad.addColorStop(1,_adjHex('#d4cfc4'));
  } else {
    grad.addColorStop(0,_adjHex('#f0e7d2'));
    grad.addColorStop(1,_adjHex('#e8dcc0'));
  }
  ctx.fillStyle=grad; ctx.fillRect(0,0,CW,CH);

  // Node count drives with chord count and song character (calm/sparse = fewer
  // nodes, energetic/dense = more, busier web).
  const _ch=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const drive=_ch?(0.55*_ch.energy+0.45*_ch.density):0.5;
  const nodeCountFull=Math.max(6,Math.min(14,Math.round(9+drive*5)));
  const visN=Math.max(2,Math.ceil(nodeCountFull*reveal));

  // Place nodes on a loose poisson-ish grid (even spread but not regular).
  const margin=D*0.10;
  const cols=Math.max(2,Math.ceil(Math.sqrt(nodeCountFull*CW/CH)));
  const rows=Math.max(2,Math.ceil(nodeCountFull/cols));
  const cw=(CW-margin*2)/cols, ch=(CH-margin*2)/rows;
  const nodes=[];
  let placed=0;
  for(let row=0;row<rows && placed<nodeCountFull;row++){
    for(let col=0;col<cols && placed<nodeCountFull;col++){
      const jr=_seedRnd(placed*23+601,ss,0,0); jr();
      const cx=margin+cw*(col+0.5)+(jr()-0.5)*cw*0.7;
      const cy=margin+ch*(row+0.5)+(jr()-0.5)*ch*0.7;
      nodes.push({x:cx,y:cy,idx:placed});
      placed++;
    }
  }

  // Build edges: each visible node connects to 1-2 nearest visible neighbours.
  const edges=[]; const seen=new Set();
  for(let i=0;i<visN;i++){
    const pr=_seedRnd(i*31+777,ss,0,0); pr();
    const partnerCount=1+Math.floor(pr()*2);
    const candidates=[];
    for(let j=0;j<visN;j++){
      if(j===i) continue;
      const dx=nodes[i].x-nodes[j].x, dy=nodes[i].y-nodes[j].y;
      candidates.push({j, d2:dx*dx+dy*dy});
    }
    candidates.sort((a,b)=>a.d2-b.d2);
    for(let p=0;p<partnerCount && p<candidates.length;p++){
      const j=candidates[p].j;
      const key=i<j?(i+'-'+j):(j+'-'+i);
      if(!seen.has(key)){ seen.add(key); edges.push({a:i,b:j,key}); }
    }
  }

  // Draw thin black curving edges (quadratic with perpendicular control offset).
  ctx.strokeStyle=`rgba(${P.BLK[0]},${P.BLK[1]},${P.BLK[2]},0.88)`;
  ctx.lineWidth=Math.max(1.0, D*0.0028);
  ctx.lineCap='round';
  for(const e of edges){
    const A=nodes[e.a], B=nodes[e.b];
    const er=_seedRnd(e.a*101+e.b+1234,ss,0,0); er();
    const mx=(A.x+B.x)/2, my=(A.y+B.y)/2;
    const dx=B.x-A.x, dy=B.y-A.y;
    const len=Math.sqrt(dx*dx+dy*dy);
    const nxp=-dy/(len||1), nyp=dx/(len||1);
    const off=(er()-0.5)*len*0.35;
    const cpx=mx+nxp*off, cpy=my+nyp*off;
    ctx.beginPath();
    ctx.moveTo(A.x,A.y);
    ctx.quadraticCurveTo(cpx,cpy,B.x,B.y);
    ctx.stroke();
  }

  // At each visible node, draw a flat palette-coloured shape.
  for(let i=0;i<visN;i++){
    const n=nodes[i];
    const nr=_seedRnd(i*47+333,ss,0,0); nr();
    const {rgb}=_picChord(chords, i%cn, gc, isBW);
    const kind=Math.floor(nr()*4); // 0=disc, 1=diamond, 2=oval, 3=half-circle
    const size=D*(0.04+nr()*0.06);
    ctx.save();
    ctx.translate(n.x,n.y);
    ctx.rotate((nr()-0.5)*Math.PI);
    ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.strokeStyle=`rgba(${P.BLK[0]},${P.BLK[1]},${P.BLK[2]},0.9)`;
    ctx.lineWidth=Math.max(1.0, D*0.0028);
    if(kind===0){
      ctx.beginPath(); ctx.arc(0,0,size,0,Math.PI*2); ctx.fill(); ctx.stroke();
    } else if(kind===1){
      ctx.beginPath();
      ctx.moveTo(0,-size); ctx.lineTo(size*0.8,0); ctx.lineTo(0,size); ctx.lineTo(-size*0.8,0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if(kind===2){
      ctx.beginPath(); ctx.ellipse(0,0,size*1.1,size*0.65,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0,0,size,0,Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // Miró signature: scatter dots and 4-point stars across the canvas.
  const marks=Math.ceil(28*reveal);
  for(let k=0;k<marks;k++){
    const mr=_seedRnd(k*7+9999,ss,0,0); mr();
    const x=margin+mr()*(CW-margin*2);
    const y=margin+mr()*(CH-margin*2);
    if(mr()<0.55){
      ctx.beginPath(); ctx.arc(x,y, D*0.005+mr()*D*0.006, 0, Math.PI*2);
      ctx.fillStyle=`rgba(${P.BLK[0]},${P.BLK[1]},${P.BLK[2]},0.85)`; ctx.fill();
    } else {
      const s=D*(0.010+mr()*0.010);
      ctx.beginPath();
      ctx.moveTo(x-s,y); ctx.lineTo(x+s,y); ctx.moveTo(x,y-s); ctx.lineTo(x,y+s);
      ctx.lineWidth=D*0.0025; ctx.strokeStyle=`rgba(${P.BLK[0]},${P.BLK[1]},${P.BLK[2]},0.78)`;
      ctx.stroke();
    }
  }
}

// ── Miró E: Harlequin Carnival — busy confetti of many small bright shapes. ──
function miroPhaseCarnival(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const P=_miroPal(isBW, gc, chords);
  ctx.fillStyle=isBW?'rgb(120,118,124)':'rgb(150,120,90)';ctx.fillRect(0,0,CW,CH);
  const units=Math.max(10,Math.min(220,cn*2));
  const vis=Math.max(1,Math.ceil(N/cn*units));
  // Accent slot ring — RED/GRN/BLU/YEL come from band-aware _miroAccentRGB
  // (rebuilt per element). BLK/WHT stay fixed (universal anchors).
  const slots = ['RED','GRN','BLU','YEL','BLK','WHT'];
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+701,ss,0,0);
    const ci = Math.min(cn-1, Math.floor((i/vis)*cn));
    const chord = chords[ci];
    const x=rnd()*CW,y=rnd()*CH,s=Math.min(CW,CH)*(0.012+rnd()*0.03);
    const slot = slots[(rnd()*slots.length)|0];
    const col = (slot==='BLK') ? P.BLK : (slot==='WHT') ? P.WHT : _miroAccentRGB(slot, chord, gc, isBW, chords);
    ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
    const kind=(rnd()*4)|0;
    if(kind===0){ctx.beginPath();ctx.arc(x,y,s,0,Math.PI*2);ctx.fill();}
    else if(kind===1){ctx.fillRect(x-s,y-s*0.4,s*2,s*0.8);}
    else if(kind===2){ctx.beginPath();ctx.moveTo(x,y-s);ctx.lineTo(x+s,y+s);ctx.lineTo(x-s,y+s);ctx.closePath();ctx.fill();}
    else{ctx.strokeStyle=`rgb(${col[0]},${col[1]},${col[2]})`;ctx.lineWidth=Math.max(1,s*0.3);ctx.beginPath();ctx.moveTo(x-s,y);ctx.quadraticCurveTo(x,y-s*1.5,x+s,y);ctx.stroke();}
  }
}

// ── Miró F: Primary signs on white — clean white ground, bold red/blue/black. ──
function miroPhaseSigns(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const P=_miroPal(isBW, gc, chords);
  ctx.fillStyle=isBW?'rgb(240,238,232)':'rgb(248,246,240)';ctx.fillRect(0,0,CW,CH);
  const signs=Math.max(3,Math.min(28,Math.round(cn/7)));
  const vis=Math.max(1,Math.ceil(N/cn*signs));
  const slots=['RED','BLU','BLK','YEL'];
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+801,ss,0,0);
    const ci = Math.min(cn-1, Math.floor(i*(cn/signs)));
    const chord = chords[ci];
    const {energy}=_picChord(chords,ci,gc,isBW);
    const x=0.1*CW+rnd()*0.8*CW,y=0.1*CH+rnd()*0.8*CH;
    const slot=slots[(rnd()*slots.length)|0];
    const col = (slot==='BLK') ? P.BLK : _miroAccentRGB(slot, chord, gc, isBW, chords);
    const R=Math.min(CW,CH)*(0.02+energy*0.05);
    const kind=(rnd()*3)|0;
    if(kind===0){ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;ctx.beginPath();ctx.arc(x,y,R,0,Math.PI*2);ctx.fill();}
    else if(kind===1){ctx.strokeStyle=`rgb(${P.BLK[0]},${P.BLK[1]},${P.BLK[2]})`;ctx.lineWidth=Math.max(2,R*0.4);ctx.beginPath();ctx.moveTo(x,y-R*1.5);ctx.lineTo(x,y+R*1.5);ctx.moveTo(x-R,y);ctx.lineTo(x+R,y);ctx.stroke();}
    else{ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;ctx.beginPath();for(let s=0;s<10;s++){const a=s*Math.PI/5,rr=s%2?R*0.4:R*1.2;ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}ctx.closePath();ctx.fill();}
  }
}

// ── $oneM$ — Million-Dollar-Homepage variant ──────────────────────────────
// Third tap on the Mosaic chip enters this mode. Two layers:
//   1. Background = chord-coloured rectangle tiles covering the canvas 100%
//      (guillotine partition: recursively split the largest rect by a random
//      ratio until we have ~60% of the chords as tiles). No gaps, no overlaps.
//      Tiles get light decorations (borders ~30%, mini note labels ~12%).
//   2. Foreground = chaos shapes from the remaining ~40% of chords, placed on
//      a Vogel spiral (golden-angle fan-out from the centre) with jitter.
//      Ten shape types — rectangle is just 8%, the rest are curves and points:
//        circle, arc (Miró sweep), triangle, star, squiggle, rings, halfmoon,
//        diamond, cross.
//   Random sizes (medium 55% / large 30% / small 10% / hero 5%) regardless of
//   shape. Saturated chord colours, hard black borders, mini note labels —
//   everything stacks on top of the tile fill so the canvas is never empty.
function drawOneMOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!chords || chords.length === 0 || lim === 0) return;
  const isBW = mode === 'bw';
  const ss = (sessionSeed|0) ^ ((phaseIndex|0) * 0x9E3779B1) ^ 0x4D6F0001;
  const R = (()=>{ let s = ss>>>0; return ()=>{ s = (s*1664525 + 1013904223)>>>0; return s/4294967296; }; })();
  // Song character: a dense piece tips the split toward the chaos layer
  // (more foreground shapes), a sparse one stays architectural; an energetic
  // piece grows the chaos shapes. 0.5/0.5 = the untuned 0.60 split, size ×1.
  const _chO=(typeof computeSongCharacter==='function')?computeSongCharacter(chords):null;
  const _bgShare = 0.60 - (((_chO?_chO.density:0.5))-0.5)*0.54;
  const bgCount = Math.max(4, Math.floor(lim * _bgShare));
  const fgCount = Math.max(0, lim - bgCount);
  // ── LAYER 1: tile fill via guillotine partition ─────────────────────────
  const rects = [{x:0, y:0, w:CW, h:CH}];
  while(rects.length < bgCount){
    let maxIdx = 0, maxArea = 0;
    for(let i=0; i<rects.length; i++){
      const a = rects[i].w * rects[i].h;
      if(a > maxArea){ maxArea = a; maxIdx = i; }
    }
    let target = rects[maxIdx];
    if(R() < 0.10 && rects.length > 4) target = rects[(R()*rects.length)|0];
    const cutVertical = target.w > target.h ? (R() < 0.85) : (R() < 0.15);
    const ratio = 0.25 + R() * 0.5;
    const idx = rects.indexOf(target);
    rects.splice(idx, 1);
    if(cutVertical){
      const splitW = target.w * ratio;
      rects.push({x: target.x,           y: target.y, w: splitW,            h: target.h});
      rects.push({x: target.x + splitW,  y: target.y, w: target.w - splitW, h: target.h});
    } else {
      const splitH = target.h * ratio;
      rects.push({x: target.x, y: target.y,          w: target.w, h: splitH});
      rects.push({x: target.x, y: target.y + splitH, w: target.w, h: target.h - splitH});
    }
  }
  for(let i = rects.length-1; i > 0; i--){
    const j = (R()*(i+1))|0;
    [rects[i], rects[j]] = [rects[j], rects[i]];
  }
  const topNote = (ch)=>{
    const notes = ch.n || ch.notes || (Array.isArray(ch) ? ch : null);
    if(!notes || !notes.length) return null;
    if(notes.length === 1) return notes[0];
    let best = notes[0];
    for(let i=1; i<notes.length; i++){ if((notes[i].m||0) > (best.m||0)) best = notes[i]; }
    return best;
  };
  for(let i=0; i<bgCount && i<lim; i++){
    const chord = chords[i];
    // Set per-tile chord energy so gc() picks up Real-mode modulation here.
    // Without this every tile reads default mid-energy and the OneM grid
    // ignores dynamic changes in the piece.
    _setCurE(chord && chord._E);
    const note = topNote(chord); if(!note) continue;
    const m = note.m, v = note.v != null ? note.v : 100;
    const [r,g,b,a] = gc(m, v);
    const rect = rects[i]; if(!rect) continue;
    const {x, y, w, h} = rect;
    ctx.fillStyle = _rgbaStr(r, g, b, Math.max(0.92, a));
    ctx.fillRect(x, y, w, h);
    if(R() < 0.20){
      const acc = gc((m + 7) % 128, 110);
      ctx.fillStyle = _rgbaStr(acc[0], acc[1], acc[2], 0.95);
      ctx.fillRect(x, y, w, Math.max(2, h * 0.15));
    } else if(R() < 0.15){
      const acc = gc((m + 9) % 128, 110);
      const bh = Math.max(2, h * 0.15);
      ctx.fillStyle = _rgbaStr(acc[0], acc[1], acc[2], 0.95);
      ctx.fillRect(x, y + h - bh, w, bh);
    }
    if(R() < 0.30){
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.04);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    if(R() < 0.12 && w > 16 && h > 14){
      const name = _midiToName[m] || '';
      const fs = Math.max(8, Math.min(h*0.45, w*0.36));
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 ${fs}px Georgia, serif`;
      const lum = (r*0.299 + g*0.587 + b*0.114);
      ctx.fillStyle = lum > 150 ? 'rgba(0,0,0,0.90)' : 'rgba(255,255,255,0.96)';
      ctx.fillText(name, x + w/2, y + h/2);
      ctx.restore();
    }
  }
  // ── LAYER 2: chaos shapes via Vogel-spiral placement ────────────────────
  if(fgCount === 0) return;
  const fgSize = Math.sqrt((CW*CH) / Math.max(8, fgCount)) * 0.60 * (0.73+0.54*(_chO?_chO.energy:0.5));
  const PHI_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const ccx = CW/2, ccy = CH/2;
  const maxR = Math.min(CW, CH) * 0.46;
  for(let i=0; i<fgCount; i++){
    const chord = chords[bgCount + i];
    _setCurE(chord && chord._E);
    const note = topNote(chord); if(!note) continue;
    const m = note.m, v = note.v != null ? note.v : 100;
    const [r,g,b,a] = gc(m, v);
    const baseColor = _rgbaStr(r, g, b, Math.max(0.92, a));
    const rad = Math.sqrt(i / fgCount) * maxR;
    const ang = i * PHI_ANGLE + R()*0.4;
    const cx = ccx + Math.cos(ang)*rad + (R()-0.5) * Math.min(CW,CH) * 0.10;
    const cy = ccy + Math.sin(ang)*rad + (R()-0.5) * Math.min(CW,CH) * 0.10;
    const sRoll = R();
    let size;
    if(sRoll < 0.55)      size = fgSize * (0.5 + R()*0.6);
    else if(sRoll < 0.85) size = fgSize * (1.0 + R()*0.8);
    else if(sRoll < 0.95) size = fgSize * (0.25 + R()*0.30);
    else                  size = fgSize * (1.8 + R()*1.5);
    const shapeRoll = R();
    let shape;
    if      (shapeRoll < 0.08) shape = 'rect';
    else if (shapeRoll < 0.26) shape = 'circle';
    else if (shapeRoll < 0.41) shape = 'arc';
    else if (shapeRoll < 0.53) shape = 'triangle';
    else if (shapeRoll < 0.65) shape = 'star';
    else if (shapeRoll < 0.75) shape = 'squiggle';
    else if (shapeRoll < 0.83) shape = 'rings';
    else if (shapeRoll < 0.91) shape = 'halfmoon';
    else if (shapeRoll < 0.97) shape = 'diamond';
    else                       shape = 'cross';
    if(shape === 'rect'){
      const aspect = 0.4 + R()*1.8;
      const w = size, h = size / aspect;
      const x = cx - w/2, y = cy - h/2;
      ctx.fillStyle = baseColor;
      ctx.fillRect(x, y, w, h);
      if(R() < 0.55){
        ctx.strokeStyle = 'rgba(0,0,0,0.88)';
        ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.05);
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    } else if(shape === 'circle'){
      const radC = size / 2;
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(cx, cy, radC, 0, Math.PI*2);
      ctx.fill();
      if(R() < 0.55){
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = Math.max(1, radC * 0.10);
        ctx.stroke();
      }
      if(R() < 0.30){
        const acc = gc((m + 5) % 128, 110);
        ctx.fillStyle = _rgbaStr(acc[0], acc[1], acc[2], 0.95);
        ctx.beginPath();
        ctx.arc(cx, cy, radC * (0.30 + R()*0.15), 0, Math.PI*2);
        ctx.fill();
      }
    } else if(shape === 'arc'){
      const radA = size * 0.6;
      const startA = R() * Math.PI * 2;
      const sweep = (0.35 + R()*0.80) * Math.PI;
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = Math.max(3, size * (0.05 + R()*0.07));
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, radA, startA, startA + sweep);
      ctx.stroke();
    } else if(shape === 'triangle'){
      const radT = size * 0.55;
      const rot = R() * Math.PI * 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.beginPath();
      for(let k=0; k<3; k++){
        const a2 = (k * 2 * Math.PI / 3) - Math.PI/2;
        const px = Math.cos(a2) * radT, py = Math.sin(a2) * radT;
        if(k===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = baseColor;
      ctx.fill();
      if(R() < 0.55){
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = Math.max(1, radT * 0.08);
        ctx.stroke();
      }
      ctx.restore();
    } else if(shape === 'star'){
      const outerR = size * 0.55;
      const innerR = outerR * 0.4;
      const points = 5;
      const rot = -Math.PI/2 + R() * Math.PI * 2;
      ctx.beginPath();
      for(let k=0; k<points*2; k++){
        const rr = (k % 2 === 0) ? outerR : innerR;
        const a2 = rot + (k * Math.PI / points);
        const px = cx + Math.cos(a2) * rr, py = cy + Math.sin(a2) * rr;
        if(k===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = baseColor;
      ctx.fill();
      if(R() < 0.40){
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = Math.max(1, outerR * 0.06);
        ctx.stroke();
      }
    } else if(shape === 'squiggle'){
      const len = size * 1.2;
      const steps = 3 + ((R()*3)|0);
      const amp = size * 0.25;
      const baseAngle = R() * Math.PI * 2;
      const dx = Math.cos(baseAngle), dy = Math.sin(baseAngle);
      const nx = -dy, ny = dx;
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = Math.max(3, size * (0.06 + R()*0.06));
      ctx.lineCap = 'round';
      ctx.beginPath();
      const segs = steps * 4;
      for(let k=0; k<=segs; k++){
        const t = k / segs;
        const xx = cx + (t - 0.5) * len * dx + Math.sin(t * Math.PI * steps) * amp * nx;
        const yy = cy + (t - 0.5) * len * dy + Math.sin(t * Math.PI * steps) * amp * ny;
        if(k===0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    } else if(shape === 'rings'){
      const maxRR = size * 0.5;
      for(let k=3; k>=1; k--){
        const ringR = maxRR * (k / 3);
        const ringCol = (k % 2 === 0) ? gc((m + 5) % 128, 110) : [r,g,b,a];
        ctx.fillStyle = _rgbaStr(ringCol[0], ringCol[1], ringCol[2], 0.95);
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI*2);
        ctx.fill();
      }
      if(R() < 0.30){
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = Math.max(1, maxRR * 0.04);
        ctx.beginPath();
        ctx.arc(cx, cy, maxRR, 0, Math.PI*2);
        ctx.stroke();
      }
    } else if(shape === 'halfmoon'){
      const radH = size * 0.55;
      const startA = R() * Math.PI * 2;
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radH, startA, startA + Math.PI);
      ctx.closePath();
      ctx.fill();
      if(R() < 0.45){
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = Math.max(1, radH * 0.07);
        ctx.stroke();
      }
    } else if(shape === 'diamond'){
      const half = size * 0.5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI/4 + (R()-0.5)*0.4);
      ctx.fillStyle = baseColor;
      ctx.fillRect(-half, -half, half*2, half*2);
      if(R() < 0.55){
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = Math.max(1, half * 0.08);
        ctx.strokeRect(-half, -half, half*2, half*2);
      }
      ctx.restore();
    } else { // cross
      const half = size * 0.45;
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = Math.max(3, size * 0.15);
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(cx - half, cy); ctx.lineTo(cx + half, cy);
      ctx.moveTo(cx, cy - half); ctx.lineTo(cx, cy + half);
      ctx.stroke();
    }
  }
}

function drawKandinskyOverlay(ctx, CW, CH, chordCount, sessionSeed, mode, gc, phaseIndex, cn, chords){
  if(chordCount === 0) return;
  const ss = sessionSeed|0;
  // ── Progress-stretch (per phase) ──
  // Kandinsky's phases pick element counts from ABSOLUTE thresholds (countFor)
  // and grid breakpoints. A single fixed REF finished phases whose top threshold
  // was below REF *before* the song ended (e.g. Circles maxes at 230, so REF 300
  // saturated it at 77% of the track). Instead each phase gets an effCount scaled
  // to ITS OWN top threshold, so the final element lands exactly on the last note.
  const _cn = (cn && cn > 0) ? cn : chordCount;       // fallback if cn not passed
  const prog = Math.max(0, Math.min(1, chordCount / _cn));
  // Song character (A2): a loud/dense piece fills the composition with more
  // elements (livelier Bauhaus chatter); a calm/sparse one stays open and quiet.
  // Multiplier 0.72..1.28, applied to every phase's element budget via eff().
  const _ch = (chords && typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
  const _charDrive = _ch ? (0.55*_ch.energy + 0.45*_ch.density) : 0.5;
  const _elMul = 0.50 + 1.01*_charDrive;   // amplified ×1.8 (was 0.72+0.56)
  const eff = (ref) => Math.max(1, Math.round(prog * ref * _elMul));
  // Song-aware palette: sample gc() at the song's TOP 8 pitch classes so the
  // Kandinsky canvas inherits the piece's actual colour DNA. Harmony yields
  // a circle-of-fifths family rooted in the song's harmonic centre, Spectral
  // a chromatic spread of the song's loud pitches, B/W a grey scale, Custom
  // the user's palette mapped to those anchors. Two different pieces in the
  // same mode now render to different Kandinsky palettes. Static mid-register
  // fallback when chord data is unavailable.
  const palette = (()=>{
    if(typeof gc !== 'function') return null;
    const tops = (typeof _songTopPitches === 'function') ? _songTopPitches(chords, 8) : null;
    const pitches = (tops && tops.length) ? tops : [60,64,67,71,74,77,55,48];   // fallback: mid/low spread
    return pitches.map(m=>{ const c=gc(m,100); return Array.isArray(c)?`rgb(${c[0]},${c[1]},${c[2]})`:c; });
  })();
  // ── PHASE CHOOSER: commit to ONE of Kandinsky's compositional modes ──
  // Determined by phaseIndex (modulo phase count). The Next button cycles it.
  //  A = Cosmic scatter (free composition).  B = Bauhaus grid.
  //  C = Circles (concentric).  D = Composition 8.  E = Improvisation.  F = Paris.
  // REF per phase = that phase's highest threshold (A's RING 280 is the max).
  // 7 phases: A Cosmic · B Bauhaus · Circles · Comp8 · Paris · Geom · Dense.
  // (Improvisation was retired; Geom + Dense added.)
  const _pn=_capN(8); const pick=((phaseIndex|0)%_pn+_pn)%_pn;
  if(_variantCap === 2){
    // Free: 0 = Cosmic scatter (fall through), 1 = Dense circles+radials —
    // the phase closest in spirit to Cosmic scatter (energetic cosmic density),
    // so both free looks share the scattered vocabulary instead of pairing
    // scatter with the Bauhaus grid.
    if(pick===1){ kandinskyPhaseDense(ctx, CW, CH, eff(260), ss, mode, palette, chords, gc); return; }
  } else {
    if(pick===1){ kandinskyPhaseB(ctx, CW, CH, eff(60), ss, mode, palette, chords, gc); return; }
    if(pick===2){ kandinskyPhaseCircles(ctx, CW, CH, eff(230), ss, mode, palette, chords, gc); return; }
    if(pick===3){ kandinskyPhaseComp8(ctx, CW, CH, eff(255), ss, mode, palette, chords, gc); return; }
    if(pick===4){ kandinskyPhaseParis(ctx, CW, CH, eff(180), ss, mode, palette, chords, gc); return; }
    if(pick===5){ kandinskyPhaseGeom(ctx, CW, CH, eff(240), ss, mode, palette, chords, gc); return; }
    if(pick===6){ kandinskyPhaseDense(ctx, CW, CH, eff(260), ss, mode, palette, chords, gc); return; }
    if(pick===7){ kandinskyPhaseFloat(ctx, CW, CH, eff(200), ss, mode, palette, chords, gc); return; }
  }
  kandinskyPhaseA(ctx, CW, CH, eff(280), ss, mode, palette, chords);
}

// ── Kandinsky phase A: the original free "cosmic scatter" composition. ──
function kandinskyPhaseA(ctx, CW, CH, chordCount, sessionSeed, mode, palette, chords){
  const ss = sessionSeed|0;
  const isBW = mode==='bw';

  const TH_TRI    = [2, 6, 12, 20, 32, 48, 75, 120, 180, 260];
  const TH_RING   = [4, 11, 22, 38, 60, 95, 140, 200, 280];
  const TH_LINE   = [1, 4, 8, 13, 19, 27, 38, 52, 70, 100, 140, 190, 250];
  const TH_ARC    = [7, 18, 32, 50, 80, 125, 180, 250];
  const TH_ZIG    = [10, 24, 42, 70, 110, 160, 220];

  // chordCount here is the per-phase effCount (REF 280 for this phase). The old
  // countFor() used sparse thresholds whose top entries were far apart, so the
  // back half of a long song added almost nothing (looked frozen). Instead scale
  // each element type LINEARLY with progress: count = round(p · maxForType),
  // where maxForType = how many that type has at full build (= thresholds.length).
  const _prog = Math.max(0, Math.min(1, chordCount / 280));
  const countFor = (thresholds) => Math.round(_prog * thresholds.length);

  // Kandinsky palette -- tuned to the active scheme when a palette is supplied
  // (Harmony/Spectral/B-W/Custom); otherwise falls back to the classic fixed set.
  const lineColors = palette || [
    'rgba(225, 60, 50, 0.92)',     // saturated red
    'rgba(240, 180, 30, 0.92)',    // golden yellow
    'rgba(40, 70, 200, 0.92)',     // saturated blue
    'rgba(180, 60, 200, 0.90)',    // purple
    'rgba(245, 238, 220, 0.90)',   // cream white
    'rgba(8, 4, 12, 0.92)',        // near-black
    'rgba(50, 160, 80, 0.90)',     // forest green
    'rgba(240, 130, 40, 0.92)',    // orange
  ];
  // Parse a palette string into [r,g,b,a]. Accepts rgb(...) and rgba(...).
  const _parseCol = (s)=>{
    const m=String(s).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s]+([\d.]+))?\)/);
    if(!m) return [128,128,128,1];
    return [+m[1], +m[2], +m[3], m[4]!=null?+m[4]:1];
  };
  // Pick a palette colour AND set per-element chord energy so Real tone
  // modulates each line/triangle/ring with the corresponding chord's dynamic.
  // i = element index (maps onto the chords array uniformly).
  const _cn = chords && chords.length ? chords.length : 1;
  const pickPalette = (i)=>{
    if(chords && chords.length){
      const ch = chords[i % _cn];
      _setCurE(ch && ch._E);
    }
    const colStr = lineColors[i % lineColors.length];
    const [pr,pg,pb,pa] = _parseCol(colStr);
    let r=pr,g=pg,b=pb;
    if(typeof _energyTint === 'function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint === 'function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return `rgba(${r|0},${g|0},${b|0},${pa})`;
  };

  // === 1. LARGE OUTLINED TRIANGLES ===
  const triCount = countFor(TH_TRI);
  for(let i=0; i<triCount; i++){
    const rnd = _seedRnd(1000+i, ss, 0, 0);
    const sizeScale = 0.28 + rnd()*0.45;
    const baseSize = Math.min(CW, CH) * sizeScale;
    const cx = rnd()*CW;
    const cy = rnd()*CH;
    const rot = rnd()*Math.PI*2;
    const elongate = 0.6 + rnd()*0.8;
    const v = [];
    for(let k=0; k<3; k++){
      const a = rot + k*(Math.PI*2/3) + (rnd()-0.5)*0.4;
      v.push({ x: cx + Math.cos(a)*baseSize*elongate, y: cy + Math.sin(a)*baseSize });
    }
    ctx.strokeStyle = pickPalette(i);
    ctx.lineWidth = Math.max(1.5, Math.min(CW,CH)*(0.004 + rnd()*0.004));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(v[0].x, v[0].y);
    ctx.lineTo(v[1].x, v[1].y);
    ctx.lineTo(v[2].x, v[2].y);
    ctx.closePath();
    ctx.stroke();
  }

  // === 2. LARGE CONCENTRIC CIRCLE RINGS (no fill) ===
  const ringCount = countFor(TH_RING);
  for(let i=0; i<ringCount; i++){
    const rnd = _seedRnd(2000+i, ss, 0, 0);
    const cx = CW*0.10 + rnd()*CW*0.80;
    const cy = CH*0.10 + rnd()*CH*0.80;
    const outerR = Math.min(CW, CH) * (0.10 + rnd()*0.12);
    const nestedRings = 2 + Math.floor(rnd()*3); // 2-4 nested
    // Pick 2 colors and alternate
    const c1 = pickPalette(i);
    const c2 = pickPalette(i);
    for(let k=0; k<nestedRings; k++){
      const ringR = outerR * (1 - k * 0.65/nestedRings);
      ctx.strokeStyle = k % 2 === 0 ? c1 : c2;
      ctx.lineWidth = Math.max(1.5, Math.min(CW,CH)*(0.003 + rnd()*0.003));
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI*2);
      ctx.stroke();
    }
  }

  // === 3. LONG DIAGONAL LINES ===
  const lineCount = countFor(TH_LINE);
  ctx.lineCap = 'round';
  for(let i=0; i<lineCount; i++){
    const rnd = _seedRnd(3000+i, ss, 0, 0);
    const angle = rnd() * Math.PI;
    const cx = rnd()*CW;
    const cy = rnd()*CH;
    const length = Math.max(CW, CH) * (0.5 + rnd()*0.7);
    ctx.strokeStyle = pickPalette(i);
    ctx.lineWidth = Math.max(1, Math.min(CW,CH)*(0.0025 + rnd()*0.003));
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(angle)*length/2, cy - Math.sin(angle)*length/2);
    ctx.lineTo(cx + Math.cos(angle)*length/2, cy + Math.sin(angle)*length/2);
    ctx.stroke();
  }

  // === 4. ARC / CRESCENT FRAGMENTS ===
  const arcCount = countFor(TH_ARC);
  ctx.lineCap = 'round';
  for(let i=0; i<arcCount; i++){
    const rnd = _seedRnd(4000+i, ss, 0, 0);
    const cx = CW*0.15 + rnd()*CW*0.70;
    const cy = CH*0.15 + rnd()*CH*0.70;
    const arcR = Math.min(CW, CH) * (0.12 + rnd()*0.15);
    const startA = rnd() * Math.PI * 2;
    const sweep = (0.4 + rnd()*0.8) * Math.PI;
    ctx.strokeStyle = pickPalette(i);
    ctx.lineWidth = Math.max(2, Math.min(CW,CH)*(0.005 + rnd()*0.005));
    ctx.beginPath();
    ctx.arc(cx, cy, arcR, startA, startA + sweep);
    ctx.stroke();
  }

  // === 5. BIG ZIGZAG LIGHTNING ===
  const zigCount = countFor(TH_ZIG);
  for(let i=0; i<zigCount; i++){
    const rnd = _seedRnd(5000+i, ss, 0, 0);
    const segCount = 4 + Math.floor(rnd()*4);
    const segLen = Math.min(CW, CH) * (0.08 + rnd()*0.06);
    const baseAng = rnd() * Math.PI * 2;
    const cosA = Math.cos(baseAng), sinA = Math.sin(baseAng);
    const perpX = -sinA, perpY = cosA;
    const amp = segLen * 0.9;
    let zx = rnd()*CW;
    let zy = rnd()*CH;
    ctx.strokeStyle = pickPalette(i);
    ctx.lineWidth = Math.max(1.8, Math.min(CW,CH)*(0.004 + rnd()*0.003));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(zx, zy);
    for(let k=0; k<segCount; k++){
      const dir = k % 2 === 0 ? 1 : -1;
      zx += cosA * segLen + perpX * amp * dir;
      zy += sinA * segLen + perpY * amp * dir;
      ctx.lineTo(zx, zy);
    }
    ctx.stroke();
  }
}

// ── Kandinsky phase B: "Bauhaus grid" — his orderly teaching-era side. A loose
// grid of cells, each holding concentric circles or a target; a few bold
// diagonals cross the whole canvas; one corner gets a small checkerboard. Same
// palette and seeded-rng discipline as phase A, but a structured composition
// instead of a free scatter, so Vary/Random produces a genuinely different
// Kandinsky rather than just reshuffled positions.
function kandinskyPhaseB(ctx, CW, CH, chordCount, sessionSeed, mode, palette, chords, gc){
  const ss = sessionSeed|0;
  // Palette tuned to the active scheme when supplied (see drawKandinskyOverlay);
  // otherwise the classic fixed Bauhaus set.
  const lineColors = palette || [
    'rgba(225, 60, 50, 0.92)', 'rgba(240, 180, 30, 0.92)', 'rgba(40, 70, 200, 0.92)',
    'rgba(180, 60, 200, 0.90)', 'rgba(245, 238, 220, 0.90)', 'rgba(8, 4, 12, 0.92)',
    'rgba(50, 160, 80, 0.90)', 'rgba(240, 130, 40, 0.92)',
  ];
  const fillColors = palette || [
    'rgba(225, 60, 50, 0.85)', 'rgba(240, 180, 30, 0.85)', 'rgba(40, 70, 200, 0.82)',
    'rgba(180, 60, 200, 0.80)', 'rgba(50, 160, 80, 0.80)', 'rgba(240, 130, 40, 0.85)',
  ];
  const _parseCol = (s)=>{
    const m=String(s).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s]+([\d.]+))?\)/);
    if(!m) return [128,128,128,1];
    return [+m[1], +m[2], +m[3], m[4]!=null?+m[4]:1];
  };
  const _cn = chords && chords.length ? chords.length : 1;
  // Per-cell colour: setCurE on the cell's chord BEFORE calling gc, so Real
  // mode routes to the right palette band (pastel/pure/dark). Uses the
  // shared _kandPickCol helper which samples gc at 8 fixed pitches.
  const _alphaOf = (s)=>{ const m=String(s).match(/rgba\([^)]+,\s*([\d.]+)\)/); return m?+m[1]:0.9; };
  const pickLine = (ci)=>{
    if(typeof gc === 'function' && chords && chords.length){
      const col = _kandPickCol(ci, Math.max(1, chordCount), chords, gc, palette);
      // _kandPickCol returns "rgb(r,g,b)"; preserve the lineColors alpha.
      const a = _alphaOf(lineColors[ci % lineColors.length]);
      const m=String(col).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
      if(m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
      return col;
    }
    return lineColors[ci % lineColors.length];
  };
  const pickFill = (ci)=>{
    if(typeof gc === 'function' && chords && chords.length){
      const col = _kandPickCol(ci, Math.max(1, chordCount), chords, gc, palette);
      const a = _alphaOf(fillColors[ci % fillColors.length]);
      const m=String(col).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
      if(m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
      return col;
    }
    return fillColors[ci % fillColors.length];
  };

  // Grid dimensions scale with how much music there is: more chords → finer grid.
  const cols = chordCount < 8 ? 2 : chordCount < 24 ? 3 : chordCount < 60 ? 4 : 5;
  const rows = chordCount < 12 ? 2 : chordCount < 40 ? 3 : 4;
  const cellW = CW / cols, cellH = CH / rows;
  const minCell = Math.min(cellW, cellH);

  // === 1. GRID CELLS — each holds concentric circles, a target, or a dot ===
  for(let r=0; r<rows; r++){
    for(let c=0; c<cols; c++){
      const cellIdx = r*cols + c;
      const rnd = _seedRnd(7000 + cellIdx, ss, 0, 0);
      const cx = c*cellW + cellW*0.5;
      const cy = r*cellH + cellH*0.5;
      // A little jitter so the grid feels hand-placed, not mechanical.
      const jx = (rnd()-0.5)*cellW*0.18;
      const jy = (rnd()-0.5)*cellH*0.18;
      const baseR = minCell * (0.26 + rnd()*0.16);
      const kind = rnd();
      if(kind < 0.50){
        // Concentric rings (2–4), alternating two colors.
        const nested = 2 + Math.floor(rnd()*3);
        const c1 = pickLine(cellIdx);
        const c2 = pickLine(cellIdx);
        for(let k=0; k<nested; k++){
          ctx.strokeStyle = k % 2 === 0 ? c1 : c2;
          ctx.lineWidth = Math.max(1.5, minCell*(0.018 + rnd()*0.01));
          ctx.beginPath();
          ctx.arc(cx+jx, cy+jy, baseR*(1 - k*(0.7/nested)), 0, Math.PI*2);
          ctx.stroke();
        }
      } else if(kind < 0.80){
        // Filled target: solid disc with a contrasting ring + center dot.
        ctx.fillStyle = pickFill(cellIdx);
        ctx.beginPath(); ctx.arc(cx+jx, cy+jy, baseR, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = pickLine(cellIdx);
        ctx.lineWidth = Math.max(1.5, minCell*0.02);
        ctx.beginPath(); ctx.arc(cx+jx, cy+jy, baseR, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = pickLine(cellIdx);
        ctx.beginPath(); ctx.arc(cx+jx, cy+jy, baseR*0.28, 0, Math.PI*2); ctx.fill();
      } else {
        // A small triangle seated in the cell (Kandinsky's recurring triangle motif).
        const rot = rnd()*Math.PI*2;
        ctx.strokeStyle = pickLine(cellIdx);
        ctx.lineWidth = Math.max(1.5, minCell*0.02);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for(let k=0; k<3; k++){
          const a = rot + k*(Math.PI*2/3);
          const x = cx+jx + Math.cos(a)*baseR, y = cy+jy + Math.sin(a)*baseR;
          if(k===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.closePath(); ctx.stroke();
      }
    }
  }

  // === 2. A FEW BOLD DIAGONALS crossing the whole canvas ===
  const diagCount = chordCount < 6 ? 1 : chordCount < 30 ? 2 : 3;
  for(let i=0; i<diagCount; i++){
    const rnd = _seedRnd(7700+i, ss, 0, 0);
    const angle = rnd() * Math.PI;
    const cx = rnd()*CW, cy = rnd()*CH;
    const length = Math.max(CW, CH) * 1.4;
    ctx.strokeStyle = pickLine(i);
    ctx.lineWidth = Math.max(1.5, Math.min(CW,CH)*(0.004 + rnd()*0.004));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(angle)*length/2, cy - Math.sin(angle)*length/2);
    ctx.lineTo(cx + Math.cos(angle)*length/2, cy + Math.sin(angle)*length/2);
    ctx.stroke();
  }

  // === 3. CHECKERBOARD CORNER (only when there's enough music) ===
  if(chordCount >= 10){
    const rnd = _seedRnd(7800, ss, 0, 0);
    const n = 3 + Math.floor(rnd()*2);            // 3–4 squares per side
    const sq = minCell * 0.22;
    const corner = Math.floor(rnd()*4);            // which corner
    const ox = (corner % 2 === 0) ? CW*0.04 : CW - CW*0.04 - n*sq;
    const oy = (corner < 2)        ? CH*0.04 : CH - CH*0.04 - n*sq;
    const cA = pickFill(0);
    const cB = lineColors[5]; // near-black
    for(let yy=0; yy<n; yy++) for(let xx=0; xx<n; xx++){
      ctx.fillStyle = (xx+yy) % 2 === 0 ? cA : cB;
      ctx.fillRect(ox + xx*sq, oy + yy*sq, sq+0.5, sq+0.5);
    }
  }
}

// Default Kandinsky palette (used when no palette supplied OR when gc/chords
// missing — fallback static palette).
function _kandPal(palette){
  return palette || [
    'rgba(225,60,50,0.92)','rgba(240,180,30,0.92)','rgba(40,70,200,0.92)',
    'rgba(180,60,200,0.90)','rgba(245,238,220,0.90)','rgba(8,4,12,0.92)',
    'rgba(50,160,80,0.90)','rgba(240,130,40,0.92)'
  ];
}
// Per-element Kandinsky colour picker — REPLACES static palette indexing in
// phase loops. For element i of total n, it:
//   1) maps i to a chord (i/n × chords.length)
//   2) sets _curE so gc() can route to the band-correct palette variant
//      (Real mode: pastel for piano chords, dark for forte chords)
//   3) samples gc() at one of 8 fixed pitches (chosen by element index, so
//      element identity is stable across re-renders and Vary)
//   4) returns the colour as an "rgb(r,g,b)" string for direct fillStyle use
// Falls back to _kandPal indexing when gc or chords are unavailable.
function _kandPickCol(i, n, chords, gc, fallbackPalette){
  if(typeof gc !== 'function' || !chords || !chords.length){
    const pal = _kandPal(fallbackPalette);
    return pal[Math.abs(i) % pal.length];
  }
  const cn = chords.length;
  const chordIdx = Math.min(cn-1, Math.max(0, Math.floor((i/Math.max(1,n)) * cn)));
  const chord = chords[chordIdx];
  _setCurE(chord && chord._E);
  // Song-aware anchors: 8 most prominent pitch classes of the piece.
  // Matches the song-aware palette build in drawKandinskyOverlay so per-
  // element colours track the song's actual harmonic DNA. Falls back to a
  // mid/low fixed spread when chord data isn't usable here.
  const tops = (typeof _songTopPitches === 'function') ? _songTopPitches(chords, 8) : null;
  const pitches = (tops && tops.length) ? tops : [60,64,67,71,74,77,55,48];
  const m = pitches[Math.abs(i) % pitches.length];
  const c = gc(m, 100);
  if(!Array.isArray(c)) return c;
  return `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
}
// Robustly set the alpha of any colour string (rgb/rgba/hex) without throwing.
function _kandAlpha(col,a){
  if(typeof col!=='string') return `rgba(120,120,120,${a})`;
  const m=col.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if(m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
  return col; // hex or unknown — leave as-is (still a valid fillStyle)
}

// ── Kandinsky C: Several Circles — concentric translucent discs on dark. ──
function kandinskyPhaseCircles(ctx,CW,CH,chordCount,sessionSeed,mode,palette, chords, gc){
  const ss=sessionSeed|0,isBW=mode==='bw';
  ctx.fillStyle=isBW?'#1a1a1a':'#0c0a14';ctx.fillRect(0,0,CW,CH);
  const TH=[2,5,9,14,20,28,38,50,65,82,100,125,155,190,230];
  let n=Math.max(1,Math.round(Math.max(0,Math.min(1,chordCount/230))*TH.length));
  n=Math.max(1,n);
  for(let i=0;i<n;i++){
    const rnd=_seedRnd(2200+i,ss, 0, 0);
    const cx=rnd()*CW,cy=rnd()*CH,R=Math.min(CW,CH)*(0.05+rnd()*0.13);
    const rings=2+((rnd()*4)|0);
    // One chord per concentric stack — every ring of this circle inherits
    // the same chord's energy band, so Real mode reads as a coherent unit.
    const baseCol = _kandPickCol(i, n, chords, gc, palette);
    for(let r=rings;r>=1;r--){
      ctx.fillStyle=_kandAlpha(baseCol,(0.45+rnd()*0.4).toFixed(2));
      ctx.beginPath();ctx.arc(cx,cy,R*(r/rings),0,Math.PI*2);ctx.fill();
    }
  }
}

// ── Kandinsky D: Composition VIII — geometric circles, lines, triangles cool. ──
function kandinskyPhaseComp8(ctx,CW,CH,chordCount,sessionSeed,mode,palette, chords, gc){
  const ss=sessionSeed|0,isBW=mode==='bw';
  ctx.fillStyle=isBW?'#cac6be':'#e8e4d8';ctx.fillRect(0,0,CW,CH);
  const TH=[1,4,8,13,19,27,38,52,70,95,125,160,205,255];
  let n=Math.max(1,Math.round(Math.max(0,Math.min(1,chordCount/255))*TH.length));
  // long lines
  for(let i=0;i<n;i++){
    const rnd=_seedRnd(2300+i,ss, 0, 0);
    const k=(rnd()*3)|0;
    ctx.strokeStyle=_kandPickCol(i, n, chords, gc, palette);
    ctx.lineWidth=Math.max(1,Math.min(CW,CH)*0.004);
    if(k===0){ // line
      ctx.beginPath();ctx.moveTo(rnd()*CW,rnd()*CH);ctx.lineTo(rnd()*CW,rnd()*CH);ctx.stroke();
    } else if(k===1){ // circle (sometimes haloed)
      const cx=rnd()*CW,cy=rnd()*CH,R=Math.min(CW,CH)*(0.02+rnd()*0.06);
      ctx.fillStyle=_kandPickCol(i, n, chords, gc, palette);ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fill();
      if(rnd()<0.5){ctx.beginPath();ctx.arc(cx,cy,R*1.6,0,Math.PI*2);ctx.stroke();}
    } else { // small triangle
      const cx=rnd()*CW,cy=rnd()*CH,s=Math.min(CW,CH)*(0.02+rnd()*0.05);
      ctx.fillStyle=_kandPickCol(i, n, chords, gc, palette);ctx.beginPath();ctx.moveTo(cx,cy-s);ctx.lineTo(cx+s,cy+s);ctx.lineTo(cx-s,cy+s);ctx.closePath();ctx.fill();
    }
  }
}

// ── Kandinsky E: Improvisation — loose colourful washes + black gesture lines. ──
function kandinskyPhaseImprov(ctx,CW,CH,chordCount,sessionSeed,mode,palette, chords, gc){
  const ss=sessionSeed|0,isBW=mode==='bw';
  ctx.fillStyle=isBW?'#d8d4cc':'#f0ead8';ctx.fillRect(0,0,CW,CH);
  const TH=[2,6,11,18,27,40,56,76,100,130,170,215];
  let n=Math.max(1,Math.round(Math.max(0,Math.min(1,chordCount/215))*TH.length));
  // soft washes
  for(let i=0;i<n;i++){
    const rnd=_seedRnd(2400+i,ss, 0, 0);
    const cx=rnd()*CW,cy=rnd()*CH,R=Math.min(CW,CH)*(0.08+rnd()*0.18);
    ctx.fillStyle=_kandAlpha(_kandPickCol(i, n, chords, gc, palette),'0.35');
    ctx.beginPath();
    const pts=7;for(let p=0;p<=pts;p++){const a=p/pts*Math.PI*2,rr=R*(0.6+rnd()*0.6);const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr;p?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.closePath();ctx.fill();
  }
  // black gesture lines
  const gn=Math.max(1,(n*0.6)|0);
  for(let i=0;i<gn;i++){
    const rnd=_seedRnd(2450+i,ss, 0, 0);
    ctx.strokeStyle='rgba(10,8,14,0.9)';ctx.lineWidth=Math.max(1.5,Math.min(CW,CH)*0.004);ctx.lineCap='round';
    let x=rnd()*CW,y=rnd()*CH;ctx.beginPath();ctx.moveTo(x,y);
    const segs=3+((rnd()*4)|0);for(let s=0;s<segs;s++){const nx=x+(rnd()-0.5)*CW*0.4,ny=y+(rnd()-0.5)*CH*0.4;ctx.quadraticCurveTo((x+nx)/2+(rnd()-0.5)*30,(y+ny)/2+(rnd()-0.5)*30,nx,ny);x=nx;y=ny;}ctx.stroke();
  }
}

// ── Kandinsky F: Paris biomorphic — soft organic shapes, late lighter palette. ──
function kandinskyPhaseParis(ctx,CW,CH,chordCount,sessionSeed,mode,palette, chords, gc){
  const ss=sessionSeed|0,isBW=mode==='bw';
  ctx.fillStyle=isBW?'#9a96a0':'#5a6a8a';ctx.fillRect(0,0,CW,CH);
  const TH=[2,5,9,15,23,33,46,62,82,108,140,180];
  let n=Math.max(1,Math.round(Math.max(0,Math.min(1,chordCount/180))*TH.length));
  for(let i=0;i<n;i++){
    const rnd=_seedRnd(2500+i,ss, 0, 0);
    const cx=rnd()*CW,cy=rnd()*CH,R=Math.min(CW,CH)*(0.04+rnd()*0.10);
    ctx.fillStyle=_kandPickCol(i, n, chords, gc, palette);
    const k=(rnd()*3)|0;
    if(k===0){ // amoeba
      ctx.beginPath();const pts=8;for(let p=0;p<=pts;p++){const a=p/pts*Math.PI*2,rr=R*(0.6+rnd()*0.7);const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr*0.7;p?ctx.quadraticCurveTo(cx+Math.cos(a-0.3)*rr*1.1,cy+Math.sin(a-0.3)*rr*0.8,x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();
    } else if(k===1){ // wavy ribbon
      ctx.strokeStyle=_kandPickCol(i, n, chords, gc, palette);ctx.lineWidth=Math.max(2,R*0.3);ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(cx-R,cy);ctx.quadraticCurveTo(cx,cy-R,cx+R,cy);ctx.quadraticCurveTo(cx+R*2,cy+R,cx+R*3,cy);ctx.stroke();
    } else { // ladder / comb sign
      ctx.strokeStyle=_kandPickCol(i, n, chords, gc, palette);ctx.lineWidth=Math.max(1.5,R*0.16);
      ctx.beginPath();ctx.moveTo(cx,cy-R);ctx.lineTo(cx,cy+R);for(let b=-2;b<=2;b++){ctx.moveTo(cx,cy+b*R*0.4);ctx.lineTo(cx+R*0.7,cy+b*R*0.4);}ctx.stroke();
    }
  }
}

// ── Kandinsky phase: Geometric "Komposition" ──
// Sharp shapes (triangles, outlined circles, a checkerboard), clean saturated
// colours, bold black lines. Cleaner than Cosmic scatter, fuller plane. Element
// counts scale LINEARLY with progress (chordCount is the eff(240) for this phase).
function kandinskyPhaseGeom(ctx, CW, CH, chordCount, sessionSeed, mode, palette, chords, gc){
  const ss = sessionSeed|0, isBW = mode==='bw';
  const ink = isBW ? '#1a1a1a' : '#0a060c';
  ctx.fillStyle = isBW ? '#e8e4dc' : '#f4f0e6';
  ctx.fillRect(0,0,CW,CH);
  const p = Math.max(0, Math.min(1, chordCount / 240));
  const minD = Math.min(CW,CH);
  // big translucent ground triangles (1–4)
  const grounds = Math.max(1, Math.round(p*4));
  for(let i=0;i<grounds;i++){
    const r=_seedRnd(2100+i, ss, 0, 0);
    ctx.globalAlpha=.42; ctx.fillStyle=_kandPickCol(i, grounds, chords, gc, palette);
    ctx.beginPath();
    const cx=r()*CW, cy=r()*CH, s=minD*(0.28+r()*0.30), rot=r()*Math.PI*2;
    for(let k=0;k<3;k++){const a=rot+k*2.094+(r()-0.5)*0.5; ctx[k?'lineTo':'moveTo'](cx+Math.cos(a)*s, cy+Math.sin(a)*s);}
    ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha=1;
  // outlined filled circles (0–9)
  const circs = Math.round(p*9);
  for(let i=0;i<circs;i++){
    const r=_seedRnd(2200+i, ss, 0, 0);
    const cx=r()*CW, cy=r()*CH, R=minD*(0.05+r()*0.10);
    ctx.fillStyle=_kandPickCol(i+grounds, grounds+circs, chords, gc, palette);
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=ink; ctx.lineWidth=Math.max(1.5,minD*0.006); ctx.stroke();
  }
  // a checkerboard block appears past mid-song
  if(p>0.45){
    const r=_seedRnd(2300, ss, 0, 0);
    const cell=minD*0.035, gx=r()*CW*0.6, gy=r()*CH*0.6, rot=(r()-0.5)*0.6;
    ctx.save(); ctx.translate(gx,gy); ctx.rotate(rot);
    ctx.fillStyle=ink;
    for(let a=0;a<4;a++)for(let b=0;b<3;b++) if((a+b)%2) ctx.fillRect(a*cell,b*cell,cell,cell);
    ctx.restore();
  }
  // bold black lines (0–5)
  const lines = Math.round(p*5);
  ctx.strokeStyle=ink; ctx.lineWidth=Math.max(2,minD*0.008);
  for(let i=0;i<lines;i++){
    const r=_seedRnd(2400+i, ss, 0, 0);
    ctx.beginPath(); ctx.moveTo(r()*CW, r()*CH); ctx.lineTo(r()*CW, r()*CH); ctx.stroke();
  }
  // small accent triangles (0–6)
  const tris = Math.round(p*6);
  for(let i=0;i<tris;i++){
    const r=_seedRnd(2500+i, ss, 0, 0);
    const cx=r()*CW, cy=r()*CH, s=minD*(0.03+r()*0.04);
    ctx.fillStyle=_kandPickCol(i+grounds+circs, grounds+circs+tris, chords, gc, palette);
    ctx.beginPath(); ctx.moveTo(cx,cy-s); ctx.lineTo(cx+s,cy+s); ctx.lineTo(cx-s,cy+s); ctx.closePath(); ctx.fill();
  }
}

// ── Kandinsky phase: Dense "Circles + radials" ──
// A big concentric-circle nucleus, radial spokes, plus many small circles/dots
// filling the whole plane — energetic cosmic density, no empty space. Progressive.
function kandinskyPhaseDense(ctx, CW, CH, chordCount, sessionSeed, mode, palette, chords, gc){
  const ss = sessionSeed|0, isBW = mode==='bw';
  ctx.fillStyle = isBW ? '#ececec' : '#f4f0e6';
  ctx.fillRect(0,0,CW,CH);
  const p = Math.max(0, Math.min(1, chordCount / 260));
  const ink = isBW ? '#1a1a1a' : '#0a060c';
  const minD = Math.min(CW,CH);
  const r0 = _seedRnd(2600, ss, 0, 0);
  const cx = CW*(0.35+r0()*0.30), cy = CH*(0.30+r0()*0.25);
  // central concentric nucleus — ring count grows with progress
  const rings = Math.max(2, Math.round(p*7));
  const Rmax = minD*0.34;
  for(let i=rings;i>=0;i--){
    ctx.globalAlpha=.88; ctx.fillStyle=_kandPickCol(i, rings+1, chords, gc, palette);
    ctx.beginPath(); ctx.arc(cx,cy,Rmax*(i+1)/(rings+1),0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;
  // radial spokes (grow with progress)
  const spokes = Math.max(3, Math.round(p*12));
  ctx.strokeStyle=ink; ctx.lineWidth=Math.max(1,minD*0.004);
  for(let a=0;a<spokes;a++){
    const an=a/spokes*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(an)*minD*0.9, cy+Math.sin(an)*minD*0.9); ctx.stroke();
  }
  // scattered small circles + dots across the whole plane (0–44)
  const dots = Math.round(p*44);
  for(let i=0;i<dots;i++){
    const r=_seedRnd(2700+i, ss, 0, 0);
    ctx.globalAlpha=0.5+r()*0.5; ctx.fillStyle=_kandPickCol(i+rings+1, rings+1+dots, chords, gc, palette);
    ctx.beginPath(); ctx.arc(r()*CW, r()*CH, minD*(0.01+r()*0.035), 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;
  // a couple of small concentric satellites past mid-song
  if(p>0.5){
    [[0.82,0.80],[0.18,0.86]].forEach((f,si)=>{
      const sx=CW*f[0], sy=CH*f[1];
      for(let i=3;i>=0;i--){ ctx.fillStyle=_kandPickCol(i+si*10+rings+1+dots, rings+1+dots+20, chords, gc, palette); ctx.beginPath(); ctx.arc(sx,sy,minD*0.02*(i+1)/4*2,0,Math.PI*2); ctx.fill(); }
    });
  }
}


// ── Kandinsky phase H: Floating composition — shapes drift freely on a single
// colour field, threaded by a few thin construction lines. Sparse, airy, the
// Bauhaus-era "free abstract" Kandinsky. Progressive reveal via chordCount. ──
function kandinskyPhaseFloat(ctx, CW, CH, chordCount, sessionSeed, mode, palette, chords, gc){
  const ss = sessionSeed|0, isBW = mode==='bw';
  const cn = chords ? chords.length : 0;
  // Local colour helper that ALWAYS returns an [r,g,b] array for chord i.
  const colAt = (i)=>{
    if(typeof gc!=='function' || !cn){ return [180,180,190]; }
    const idx = Math.min(cn-1, Math.max(0, ((i%cn)+cn)%cn));
    const ch = chords[idx];
    _setCurE(ch && ch._E);
    const notes = ch && (ch.n || ch.notes);
    if(!notes || !notes.length) return [180,180,190];
    let R=0,G=0,B=0,c=0;
    for(const note of notes){ const m=note.m!==undefined?note.m:note; const v=note.v!==undefined?note.v:90; const cc=gc(m,v); R+=cc[0]; G+=cc[1]; B+=cc[2]; c++; }
    return [R/c, G/c, B/c];
  };
  // ── Dark (not black) ground, tinted by the piece. Take the average chord
  //    colour and pull it down into a deep — but coloured — backdrop so the
  //    field reads as "in tune" with the music, distinct from the cream and
  //    pure-black grounds other phases use. ──
  let gr=[40,38,52];
  if(!isBW && cn){
    let R=0,G=0,B=0; const steps=Math.min(cn,8);
    for(let i=0;i<steps;i++){ const c=colAt(Math.floor(i*cn/steps)); R+=c[0]; G+=c[1]; B+=c[2]; }
    R/=steps; G/=steps; B/=steps;
    // deepen: scale toward dark, keep hue, floor so it's never pure black
    gr = [Math.max(18, R*0.32), Math.max(16, G*0.32), Math.max(24, B*0.34)];
  } else if(isBW){ gr=[34,34,34]; }
  ctx.fillStyle = `rgb(${gr[0]|0},${gr[1]|0},${gr[2]|0})`;
  ctx.fillRect(0,0,CW,CH);

  const minD = Math.min(CW,CH);
  const p = Math.max(0.25, Math.min(1, chordCount / 200));
  const N = Math.max(8, Math.round(p * 30));
  // brighten a chord colour so shapes pop on the dark ground
  const lift = (c, amt)=> `rgb(${Math.min(255,c[0]+amt)|0},${Math.min(255,c[1]+amt)|0},${Math.min(255,c[2]+amt)|0})`;
  for(let i=0;i<N;i++){
    const r = _seedRnd(3300+i, ss, 0, 0);
    const x = r()*CW, y = r()*CH, s = minD*(0.05 + r()*0.17);
    const base = colAt(i);
    const col = isBW ? 'rgb(230,230,230)' : lift(base, 70);
    const k = Math.floor(r()*5);
    ctx.save();
    ctx.fillStyle = col; ctx.strokeStyle = col;
    if(k===0){ ctx.beginPath(); ctx.arc(x,y,s/2,0,Math.PI*2); ctx.fill(); }
    else if(k===1){ ctx.fillRect(x-s/2,y-s/2,s,s); }
    else if(k===2){ const rot=r()*Math.PI*2; ctx.beginPath(); for(let t=0;t<3;t++){ const a=rot+t*2.094; ctx[t?'lineTo':'moveTo'](x+Math.cos(a)*s*0.6, y+Math.sin(a)*s*0.6); } ctx.closePath(); ctx.fill(); }
    else if(k===3){ ctx.lineWidth=Math.max(2.5,s*0.18); ctx.beginPath(); ctx.arc(x,y,s/2,0,Math.PI*2); ctx.stroke(); }
    else { const rot=r()*Math.PI*2; ctx.beginPath(); ctx.arc(x,y,s/2,rot,rot+Math.PI); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  // a few thin construction lines crossing the field (light, low opacity)
  ctx.strokeStyle = isBW ? 'rgba(220,220,220,0.5)' : 'rgba(235,230,210,0.45)';
  const NL = Math.max(2, Math.round(p*5));
  for(let i=0;i<NL;i++){
    const r = _seedRnd(3400+i, ss, 0, 0);
    ctx.lineWidth = 1 + r()*2.2;
    ctx.beginPath();
    ctx.moveTo(r()*CW, r()*CH);
    ctx.lineTo(r()*CW, r()*CH);
    ctx.stroke();
  }
}

// Convert a downsampled-image pixel array into musical events using a given hue→pitch table
// (COF for harmony mode, SPEC_HUE for spectral mode). Pure: same input + same table → same output.

// Build the order in which image cells (band × column-group) are visited, which
// determines both the musical event sequence AND the painting build-up. One
// shared helper keeps audio and canvas perfectly in sync for every direction.
//   'lr'        rows top→bottom, each row left→right   (default, classic)
//   'vert'      columns left→right, each column top→bottom
//   'spiralIn'  rectangular spiral from outer edge inward
//   'spiralOut' rectangular spiral from centre outward
function buildTraversal(nrBands, effCols, dir){
  const order=[];
  if(dir==='vert'){
    for(let cg=0;cg<effCols;cg++) for(let band=0;band<nrBands;band++) order.push({band,cg});
    return order;
  }
  if(dir==='spiralIn' || dir==='spiralOut'){
    let top=0,bottom=nrBands-1,left=0,right=effCols-1;
    while(top<=bottom && left<=right){
      for(let cg=left;cg<=right;cg++) order.push({band:top,cg});        // top row →
      top++;
      for(let band=top;band<=bottom;band++) order.push({band,cg:right}); // right col ↓
      right--;
      if(top<=bottom){                                                   // bottom row ←
        for(let cg=right;cg>=left;cg--) order.push({band:bottom,cg});
        bottom--;
      }
      if(left<=right){                                                   // left col ↑
        for(let band=bottom;band>=top;band--) order.push({band,cg:left});
        left++;
      }
    }
    if(dir==='spiralOut') order.reverse();
    return order;
  }
  // 'lr' (default): rows top→bottom, each row left→right
  for(let band=0;band<nrBands;band++) for(let cg=0;cg<effCols;cg++) order.push({band,cg});
  return order;
}

// Mosaic hear-image: when set (>0), the transcription slices the image into
// exactly this many horizontal bands (one per mosaic row) instead of the
// fixed 4-pixel-row bands — the DISPLAY raster stays untouched. One-shot,
// reset by the caller right after each transcription.
let _imgForcedBands = 0;
function _setImgForcedBands(n){ _imgForcedBands = (n|0) > 0 ? (n|0) : 0; }
function pixelsToImageEvents(px,nc,nr,table,colorMode,dir,atmoBias){
  // atmoBias (optional): {v,e} from AI ATM. When present, the painting's own
  // energy is BLENDED with the atmo mood's energy, and the mood's valence biases
  // the rhythmic character (bright/playful vs heavy/legato). This is what makes
  // turning AI ATM on actually reshape the tempo & rhythm, not just the colour.
  const atmoV = atmoBias && typeof atmoBias.v==='number' ? Math.max(-1,Math.min(1,atmoBias.v)) : null;
  const atmoE = atmoBias && typeof atmoBias.e==='number' ? Math.max(0,Math.min(1,atmoBias.e)) : null;
  const CHORD_SIZE=4;
  const COL_STEP=4;                              // merge 4 adjacent columns per time-event
  const _fb = (_imgForcedBands>0) ? Math.min(_imgForcedBands, nr) : 0;
  const _nrBands = _fb ? _fb : Math.floor(nr/CHORD_SIZE);
  // Band → pixel-row range. Default: fixed CHORD_SIZE stride. Forced: rows
  // sliced proportionally so band i covers exactly mosaic row i.
  const _bandRow0 = (b)=> _fb ? Math.floor(b*nr/_fb)     : b*CHORD_SIZE;
  const _bandRow1 = (b)=> _fb ? Math.floor((b+1)*nr/_fb) : Math.min(nr, b*CHORD_SIZE+CHORD_SIZE);
  const effCols=Math.ceil(nc/COL_STEP);          // 192/4 = 48 events per band → 960 total
  // ─── Color statistics pass ──
  // Find the dominant background hue and the average chroma so we can suppress
  // monochrome fields (e.g. Chagall's cobalt sky, Rothko-like color blocks) and
  // let figurative / colourful elements actually surface musically rather than
  // being buried in a single-note drone from 60-70% of the canvas.
  const hueHist=new Float32Array(36); // 10° bins, weighted by saturation
  let chSum=0,chN=0;
  let lSum=0,lN=0;                       // overall image lightness (all pixels)
  let lSqSum=0;                          // for lightness variance → contrast
  let edgeSum=0,edgeN=0;                 // local pixel-to-pixel change → "busyness"
  let prevL=null;
  for(let pi=0;pi<px.length;pi++){
    const p=px[pi];
    const[hh,ss,ll]=toHsl(p.r,p.g,p.b);
    lSum+=ll; lSqSum+=ll*ll; lN++;
    // Local contrast / busyness: how much lightness jumps from the previous
    // pixel in the scan. A calm, flat field barely changes; a busy, detailed,
    // high-contrast painting changes a lot. Reset at row starts to avoid the
    // wrap-around jump skewing it.
    if(prevL!=null && (pi%nc)!==0){ edgeSum+=Math.abs(ll-prevL); edgeN++; }
    prevL=ll;
    if(ll<6||ll>94||ss<10)continue;
    hueHist[Math.floor(hh/10)%36]+=ss;
    chSum+=ss*Math.min(ll,100-ll)/50; chN++;
  }
  let bgBin=0,bgMax=0;
  for(let i=0;i<36;i++)if(hueHist[i]>bgMax){bgMax=hueHist[i];bgBin=i;}
  const bgHue=bgBin*10+5;
  const avgChroma=chN?chSum/chN:25;
  const avgLight=lN?lSum/lN:50;          // mean lightness
  // Global contrast = standard deviation of lightness (how much dark↔light range
  // the painting spans). Busyness = mean local lightness change (how detailed /
  // restless the surface is). Both feed the tempo + energy of the piece.
  const lightVar=lN?Math.max(0,lSqSum/lN - avgLight*avgLight):0;
  const contrast=Math.sqrt(lightVar);    // 0 (flat) … ~50 (extreme black↔white)
  const busyness=edgeN?edgeSum/edgeN:0;  // 0 (smooth) … ~30+ (very detailed)
  // ─── PHOTO vs PAINTING DETECTOR ─────────────────────────────────
  // Real-world photographs have very different colour DNA from paintings:
  //   • hue entropy: photos spread across many bins (skin gradients, sky
  //     gradients, foliage), paintings cluster in a handful of dominant
  //     hues (intentional palette).
  //   • chroma: photos sit in a medium band (12–30%), paintings are
  //     either high (>35%) or explicitly low (monochrome).
  //   • busyness with low chroma: photos carry detail without meaningful
  //     colour (skin, cloth, foliage noise) — paintings carry meaningful
  //     colour at every detail level.
  // If all three photo signals trigger, we treat the input as a photograph
  // and switch to a quantised-palette chord model: cluster the image into
  // ~7 dominant hue peaks, snap every pixel to its closest cluster before
  // building the chord. This tames photo mush into musical chords while
  // leaving painterly images untouched.
  // Photo detector v3: HUE CONCENTRATION as the primary signal.
  // Paintings have a discrete palette — a few dominant colours occupy
  // most of the hue histogram (top-3 bins hold >50% of the weight).
  // Photographs have a diffuse palette — skin, sky, foliage, shadows
  // spread across many bins with no single dominant peak (top-3 bins
  // hold only ~25-40% of the weight).
  // Whole block wrapped in try/catch: if ANY unexpected error fires here
  // we quietly fall back to PAINTING behaviour so the scan never breaks.
  let isPhoto = false;
  let _photoPeaks = [];
  try {
    // Total hue weight + top-3 bin concentration
    let _hueTotal = 0;
    for(let i=0; i<36; i++) _hueTotal += hueHist[i];
    let _top3Sum = 0;
    if(_hueTotal > 0){
      // Copy hueHist into a plain array, sort desc, take top-3.
      const _sorted = [];
      for(let i=0; i<36; i++) _sorted.push(hueHist[i]);
      _sorted.sort(function(a,b){ return b - a; });
      _top3Sum = _sorted[0] + _sorted[1] + _sorted[2];
    }
    const _top3Frac = _hueTotal > 0 ? (_top3Sum / _hueTotal) : 1;
    // Photo detector v4: calibrated against 5 real-world samples.
    //   Rasto's data (photo → PHOTO expected):
    //     couple in nature:     t3:63% c:21 b:8
    //     football match:       t3:60% c:21 b:8
    //     concert scene:        t3:64% c:13 b:9
    //   Rasto's data (painting → PAINTING expected):
    //     Picasso portrait:     t3:45% c:16 b:6
    //     Van Gogh Starry Night t3:71% c:27 b:8
    //   Discriminators that separate them:
    //     • chroma 12–40 (photos land in mid-chroma band)
    //     • busyness ≥8  (photos have real-world texture; Picasso's flat
    //                    paint areas score 6, distinguishing him)
    //     • top-3 fraction ≤68% (Van Gogh's 71% concentration = paint veto)
    const _photoChroma = avgChroma >= 12 && avgChroma <= 40;
    const _photoBusy = busyness >= 8;
    const _photoNotConcentrated = _top3Frac <= 0.68;
    // Anti-photo veto: extreme values are painting signatures.
    //   chroma >42 = intentional saturated art (Van Gogh, Kandinsky)
    //   chroma <6  = deliberate monochrome (ink, sepia, Guernica)
    //   top-3 >75% = extremely concentrated palette (Mondrian, Rothko)
    const _paintingSignal = avgChroma > 42 || avgChroma < 6 || _top3Frac > 0.75;
    // All three photo signals must be true AND no painting veto fires.
    isPhoto = !_paintingSignal && _photoChroma && _photoBusy && _photoNotConcentrated;
    if(isPhoto){
      // Build ~7 dominant hue peaks with min 20° separation.
      const _indices = [];
      for(let i=0; i<36; i++) _indices.push(i);
      _indices.sort(function(a,b){ return hueHist[b] - hueHist[a]; });
      for(let k=0; k<_indices.length; k++){
        if(_photoPeaks.length >= 7) break;
        const bi = _indices[k];
        if(hueHist[bi] <= 0) continue;
        const h = bi*10 + 5;
        let tooClose = false;
        for(let pi=0; pi<_photoPeaks.length; pi++){
          const p = _photoPeaks[pi];
          const d = Math.min(Math.abs(h-p), 360-Math.abs(h-p));
          if(d < 20){ tooClose = true; break; }
        }
        if(!tooClose) _photoPeaks.push(h);
      }
    }
  } catch(_photoErr){
    isPhoto = false;
    _photoPeaks = [];
  }
  _setLastImageIsPhoto(isPhoto);
  // ─── Tempo from image character ────────────────────────────────────────────
  // The piece used to be a fixed 2:00 for EVERY image, so two utterly different
  // paintings shared the same pulse and length and ended up sounding alike. Now
  // the canvas's own ENERGY sets the pace: a vivid, high-contrast, busy painting
  // (a wild Picasso) plays faster and a touch longer; a calm, muted, flat one
  // (a quiet monochrome field) plays slower and more spacious. We map a 0..1
  // "energy" score (saturation + contrast + busyness) to a total duration, kept
  // within sane bounds so a piece is never tiny or endless.
  const eChroma=Math.max(0,Math.min(1, avgChroma/55));
  const eContrast=Math.max(0,Math.min(1, contrast/42));
  const eBusy=Math.max(0,Math.min(1, busyness/22));
  let energy=Math.max(0,Math.min(1, 0.45*eChroma + 0.35*eContrast + 0.20*eBusy));
  // ─── ATMO BLEND (first — mood is a peer input, not a cosmetic dochutź) ───────
  // "A pokojny letny sen" should actually slow / soften / quieten the piece, not
  // just nudge it. Mood gets equal weight (50:50), and when it's far from neutral
  // it overrides the image's reading: a strong serene tag on a busy canvas still
  // calms it (and a frantic tag on a calm one wakes it up). All downstream
  // levers (dynE, rhythmDrive, MEL_MAX, maxRestRun, dynCentre) are then computed
  // from the blended energy so the mood ripples through tempo, loudness, register,
  // density, and breathing — not just colour tint.
  const valenceBias = atmoV!=null ? atmoV : 0;
  if(atmoE!=null){
    // Equal blend, then a small extra pull toward mood when it's far from neutral.
    const extreme = Math.abs(atmoE-0.5)*2;                  // 0 mid … 1 far
    const moodW = 0.5 + 0.35*extreme;                        // 0.50 … 0.85 — strong mood prevails
    energy = Math.max(0,Math.min(1, (1-moodW)*energy + moodW*atmoE));
  }
  // ─── DYNAMICS RESTLESSNESS — image-driven loudness centre ─────────────────
  // dynE captures how "restless" the painting is (contrast + busyness). It
  // feeds the centre-of-gravity calculation in Final dynamics downstream
  // (busy paintings shift velocity centre up, calm paintings shift it down).
  // The old global dynScale multiplier that lived here was retired in the
  // Phase 2 audit — the centre+compress model in Final dynamics replaces
  // it without the slow-motion-film side effect of flat scaling.
  let dynE = Math.max(0, Math.min(1, 0.55*eContrast + 0.45*eBusy));
  // ── RHYTHM DRIVE ──
  // A single 0..1 knob that turns "calm/legato/sparse" into "lively/articulated/
  // dense" as it rises. Driven by energy, nudged up by positive valence (bright
  // moods feel more rhythmically alive) and down by very negative valence (heavy,
  // grief-like moods stay broad and slow even if the canvas is busy).
  // PHOTO OVERRIDE: dampen energy and rhythm drive. Photos have naturally
  // high busyness (JPEG noise, gradient sky, foliage) which the painterly
  // energy model reads as "vivid & fast" — but the CONTENT is usually
  // contemplative. Compress energy toward 0.35–0.55 so tempo lands calm.
  if(isPhoto){
    energy = 0.35 + energy * 0.20;         // 0.35 … 0.55 regardless of raw score
    dynE   = Math.max(0, Math.min(1, dynE * 0.65)); // softer dynamic centre too
  }
  const rhythmDrive = Math.max(0, Math.min(1, energy + 0.15*valenceBias));
  // Duration: calm → longer & slower planes, energetic → tighter & quicker.
  // Centre ceiling at 4:00 (240s) at neutral mood (was 3:00 — default was a guluomet);
  // serene atmo stretches up to 5:00 (300s), agitato compresses down to 1:30 (90s).
  const DUR_MIN=75000;
  const _durAtmoShift = (atmoE!=null)
    ? (atmoE<0.5 ? +60000*(0.5-atmoE)/0.5 : -150000*(atmoE-0.5)/0.5)
    : 0;
  const DUR_MAX = 240000 + _durAtmoShift;     // 4:00 base; 5:00 serene; 1:30 frantic
  // Inverse: more energy = shorter (faster feel). Calm spreads out.
  const targetMs=Math.round(DUR_MAX - (DUR_MAX-DUR_MIN)*energy);
  const msPerBlock=targetMs/(_nrBands*effCols);  // per-chord step now scales with energy
  // Sustain: calm pieces ring long & legato; lively ones articulate shorter.
  // Centre 11× at neutral mood (was 9× — default scan was too clipped); calm atmo
  // adds up to +2 (legato dream), agitato atmo subtracts up to −3 (crisp staccato).
  // rhythmDrive (image-driven) still spreads the per-piece dynamic.
  const _sustainAtmoShift = (atmoE!=null)
    ? (atmoE<0.5 ? +2*(0.5-atmoE)/0.5 : -3*(atmoE-0.5)/0.5)
    : 0;
  const sustainMul = (11 + _sustainAtmoShift) - 5*rhythmDrive;
  const noteDur=Math.round(msPerBlock*sustainMul);
  // octaveShift in semitones: light image → shift down, dark → shift up. 70% of
  // the deviation from 50% lightness is compensated; 30% of the brightness
  // character is preserved. ~±0.7 octave max at the extremes.
  // SPECTRAL also lifts the whole register up an octave: paired with the whole-
  // tone scale this gives a bright, glassy, weightless voice clearly distinct
  // from Harmony's warm middle register.
  const octaveShift = Math.round(-((avgLight-50)/50) * 0.7 * 8) + (colorMode==='spectral'?12:0); // semitones
  // Saliency floor scales with the image's overall chroma so a vivid painting
  // doesn't get over-suppressed, but a monochrome one does.
  const salFloor=Math.max(28,avgChroma*0.85);
  // Convert a pixel to a note, with optional "soft" mode that bypasses the
  // saliency filter (used as a safety fallback so each chord always has at
  // least one voice instead of dropping out to silence).
  function pxToNote(idx, soft){
    const{r,g,b}=px[idx],[h,s,l]=toHsl(r,g,b);
    // ── CUSTOM PALETTE GATE ──
    // In Custom mode the palette is a FILTER, not just a remap: only colours the
    // user actually put in the palette should sound — everything else is silence.
    // So an all-pink palette over an image with no pink plays (almost) nothing,
    // giving direct, tangible control ("I chose pink → I hear only the pink").
    // We compare each pixel to the palette: a chromatic pixel must sit within a
    // moderate hue window (~25°) of some palette swatch; an achromatic pixel
    // (grey/white/black) only sounds if the palette itself contains a grey/near-
    // neutral swatch. table[] here is the palette's hues (built in loadImage).
    if (colorMode==='custom') {
      const CUSTOM_HUE_TOL=25;                       // "medium" strictness
      const sats=table.__sats;
      if (s < 12) {
        // Achromatic pixel: only sounds if the palette has a neutral swatch.
        if (!(table.__hasNeutral)) return null;
      } else {
        // Colour pixel: match only against COLOURED palette swatches — a grey
        // swatch has a meaningless hue (toHsl returns 0), so without this an
        // all-grey palette would accidentally pass red-ish pixels. With it, an
        // all-grey palette plays only the image's greys, never its colours.
        let md=Infinity;
        for (let ti=0; ti<table.length; ti++){
          if (sats && sats[ti] < 12) continue;        // skip neutral swatches
          const th=table[ti], d=Math.min(Math.abs(h-th),360-Math.abs(h-th));
          if(d<md) md=d;
        }
        if (md > CUSTOM_HUE_TOL) return null;          // colour not in palette → silent
      }
    }
    // ── B/W INVERSE MAPPING ──
    // In music→painting, B/W maps each note to a GREY whose lightness rises with
    // pitch (bwCol: low notes dark, high notes light). Image mode is the inverse
    // translation, so here we read the painting the same way backwards: a pixel's
    // LIGHTNESS drives the pitch directly — dark areas → low notes, light areas →
    // high notes — ignoring hue entirely (B/W is about value, not colour). This
    // makes a black-and-white reading a true mirror of the note→grey mapping
    // rather than secretly using the colour wheel under a monochrome canvas.
    if (colorMode==='bw') {
      // Map lightness 0..100 → MIDI ~36..84 (4 octaves, C2-ish to C6-ish), the
      // same span bwCol spreads pitch across. Pure black stays a protected deep
      // bass note (like the chromatic dark path) so shadows anchor the low end.
      const midiBW=Math.round(36 + (Math.max(0,Math.min(100,l))/100)*48);
      const vBW=Math.round(45 + Math.abs(l-50)/50*45);   // extremes (black/white) louder than mid-grey
      if (l < 12) return { m:Math.max(24,midiBW+octaveShift), v:vBW, durMs:noteDur, bass:true };
      return { m:Math.max(24,Math.min(96,midiBW+octaveShift)), v:vBW, durMs:noteDur };
    }
    // ── GRAYSCALE PATH ──
    // they DO carry value information. Map them to pitch class C with octave
    // driven by lightness: black ≈ C2 (deep bass), mid-grey ≈ C5 (middle),
    // white ≈ C7 (high treble). This forms a structural backbone under the
    // colour melody and keeps monochrome regions audible instead of silent.
    if (s < 10) {
      const oct = Math.max(2, Math.min(7, Math.round(2 + (l/100) * 5)));
      const midi = (oct + 1) * 12; // pitch class 0 = C
      // Contrast-driven velocity: pure black and pure white speak louder than
      // muddy mid-grey, so the visual extremes are also the sonic extremes.
      const contrast = Math.abs(l - 50) * 2; // 0 (mid-grey) … 100 (black/white)
      const v = Math.round(45 + (contrast/100) * 50); // 45 … 95
      // Strong black dots become protected deep-bass notes: bass:true keeps them
      // out of the melody and stops tightenChord from pulling them up, so they
      // sound as occasional deep low tones under the chord (sparse, deliberate).
      if (l < 12) return { m: midi, v, durMs: noteDur, bass:true };
      return { m: Math.max(24,Math.min(96, midi+octaveShift)), v, durMs: noteDur };
    }
    // ── BRIGHT NEAR-WHITE PATH ──
    // Painted whites (Chagall's luminous figures against a cobalt field, a moon,
    // snow, highlights) are rarely pure neutral — they carry a faint warm/cool
    // tint, so s sits around 10–22 instead of under 10. The old code therefore
    // sent them down the chromatic path, where their tiny chroma (l is high, so
    // chroma = s·min(l,100-l)/50 is near zero) failed the saliency floor OR the
    // l>94 cutoff dropped them entirely → a visually MARKANT white shape went
    // silent or whisper-quiet. Treat a bright, lightly-tinted pixel as essentially
    // white: a clear high note, voiced LOUD in proportion to its brightness, with
    // pitch class still taken from its faint hue so it stays in key. This makes
    // luminous whites read sonically as the bright accents they are.
    if (l > 78 && s < 25) {
      let pcw=0,mdw=Infinity;
      table.forEach((th,ti)=>{const dd=Math.min(Math.abs(h-th),360-Math.abs(h-th));if(dd<mdw){mdw=dd;pcw=ti;}});
      // High register: brighter → higher (C6 region), clearly above the mid chord.
      const octw=Math.max(5,Math.min(7,5+Math.round((l-78)/22*2)));
      const midiw=Math.max(24,Math.min(96,(octw+1)*12+pcw));
      // Loud in proportion to brightness — a markant white speaks out. l 78→100
      // maps to velocity ~72→104, so the brightest whites are among the strongest
      // voices in the piece (matching their visual prominence).
      const vw=Math.round(72 + (Math.min(100,l)-78)/22 * 32);
      return { m:midiw, v:Math.max(60,Math.min(110,vw)), durMs:noteDur, white:true };
    }
    // ── CHROMATIC PATH ──
    // Saturated pixels at near-black or near-white extremes contain little
    // visible colour information, so we drop them; the grayscale branch above
    // already covers achromatic value extremes.
    // DARK COLORED PIXELS (the blended black dots): after downscaling, a black
    // dot mixes with its bright surround into a dark *colored* pixel, so it
    // never hits the grayscale branch. Catch it here: a genuinely dark pixel
    // becomes a protected deep-bass note (kept in key via its hue's pitch
    // class), so black dots are heard as low tones instead of being lifted up.
    if (l < 22) {
      let pcd=0,mind=Infinity;
      table.forEach((th,ti)=>{const dd=Math.min(Math.abs(h-th),360-Math.abs(h-th));if(dd<mind){mind=dd;pcd=ti;}});
      const oct = l < 10 ? 1 : 2;                    // very dark → C1 region, dark → C2
      const midi=Math.max(24,(oct+1)*12+pcd);        // deep but musical; keep off the rumble floor
      const dv = Math.round(50 + (22-l)/22*40);      // darker → louder (50..90)
      return { m:midi, v:dv, durMs:noteDur, bass:true };
    }
    if (l < 6 || l > 94) return null;
    // PHOTO PATH: quantise hue to nearest palette peak so a plausible
    // chord emerges (not a 5-semitone mush from gradient noise).
    let _hueUse = h;
    if(isPhoto && _photoPeaks.length){
      let _best=_photoPeaks[0], _bd=361;
      for(const _pk of _photoPeaks){
        const _d = Math.min(Math.abs(h-_pk), 360-Math.abs(h-_pk));
        if(_d < _bd){ _bd=_d; _best=_pk; }
      }
      _hueUse = _best;
    }
    const dh=Math.min(Math.abs(_hueUse-bgHue),360-Math.abs(_hueUse-bgHue));
    const chroma=s*Math.min(l,100-l)/50; // 0..100
    const isBackgroundHue = dh < 30;
    const isNearBackground = dh < 50;
    if (!soft) {
      // Tiered threshold: background hue must be more vivid to pass; off-
      // background hues get a low bar so colourful accents play prominently.
      const requiredChroma = isBackgroundHue
        ? salFloor * 1.15
        : isNearBackground
          ? salFloor * 0.65
          : salFloor * 0.40;
      if (chroma < requiredChroma) return null;
    }
    // Pitch: hue → COF/SPEC_HUE table (photo path uses quantised hue)
    let pc=0,minD=Infinity;
    table.forEach((th,ti)=>{const d=Math.min(Math.abs(_hueUse-th),360-Math.abs(_hueUse-th));if(d<minD){minD=d;pc=ti;}});
    // Octave: lightness → register, compressed to 3..6
    const oct=Math.max(3,Math.min(6,3+Math.round((l-20)/72*3)));
    const midi=Math.max(24,Math.min(96,(oct+1)*12+pc+octaveShift)); // gentle whole-image normalization
    // Velocity: chroma drives dynamics. Background-hue cells are attenuated
    // so the non-background palette stays in foreground.
    let v = Math.round(38 + (chroma/100) * 68);
    if (isBackgroundHue) v = Math.round(v * 0.6);
    else if (isNearBackground) v = Math.round(v * 0.82);
    // _paintPc = original pixel-derived pitch class (= midi%12 BEFORE snap +
    // bar progression overwrite it). Travels alongside the note as a second
    // channel: the audio engine ignores it, but the Music-mode painter (after
    // a See music transfer) can use it to render the source-faithful colour
    // while the audio still plays the harmonically-shaped pcs. Image canvas
    // paints from pixelRef directly, so this field has no effect there.
    return{m:midi,v,durMs:noteDur,_paintPc:midi%12};
  }
  // Pick the most vivid of three row-pixels at (band, col) — used when the
  // strict filter would have left this chord empty. Guarantees audible music.
  function pickMostVivid(band, col){
    let best=null, bestCh=-1;
    for(let row=_bandRow0(band); row<_bandRow1(band) && row<nr; row++){
      const idx=row*nc+col;
      const{r,g,b}=px[idx],[ , s, l]=toHsl(r,g,b);
      const ch = s * Math.min(l, 100-l) / 50;
      if (ch > bestCh) { bestCh = ch; best = idx; }
    }
    return best != null ? pxToNote(best, true) : null;
  }
  const evts=[];
  const nrBands=_nrBands;
  let evIdx=0;
  const traversal=buildTraversal(nrBands,effCols,dir);
  for(const{band,cg} of traversal){
    {
      // Collect notes from all COL_STEP columns in this group for a richer chord
      const notes=[];
      const seenM=new Set();
      // Accumulate colour chroma (saturation × value spread) across this cell's
      // pixels — a proxy for how emotionally "charged" / vivid this patch of the
      // painting is. Used later to decide chord fullness (vivid → full triad with
      // its mood-defining third; muted → open, airy voicing).
      let cellChroma=0, cellChN=0;
      // FLATNESS metric: how monotonous is this cell's pixel area?
      // Rothko-style colour fields (huge same-colour planes) generate
      // mechanically identical chords across many cells → repetitive output.
      // We compute per-cell lightness variance + hue spread; the post-loop
      // variation pass uses this (plus neighbours) to decide which cells
      // get rubato, jitter, voicing shift, or rests. Cheap to do here since
      // we're already iterating these pixels.
      let lSumC=0, lSqSumC=0, lNC=0;
      let hueMinC=361, hueMaxC=-1;
      // Dominant-hue accumulator for the cell's CARRYING colour tone. Saturated
      // pixels vote into 36 hue bins weighted by chroma; the winning bin becomes
      // the cell's representative pitch class (_domPc) via the same hue->pc
      // table pxToNote uses. This is RENDER-ONLY metadata for the Music canvas
      // (paint a faithful carrying tone instead of the harmony-shuffled pc);
      // the audio notes built below are never touched by it, so pure Image and
      // pure Music playback are byte-for-byte unchanged.
      const _domHueHist=new Float32Array(36);
      for(let sk=0;sk<COL_STEP;sk++){
        const col=cg*COL_STEP+sk; if(col>=nc) break;
        for(let row=_bandRow0(band); row<_bandRow1(band) && row<nr; row++){
          const idx=row*nc+col;
          const{r,g,b}=px[idx],[hh,ss,ll]=toHsl(r,g,b);
          cellChroma += ss*Math.min(ll,100-ll)/50; cellChN++;
          lSumC += ll; lSqSumC += ll*ll; lNC++;
          if(ss > 8){ // ignore near-grey pixels for hue spread (their hue is noise)
            if(hh < hueMinC) hueMinC = hh;
            if(hh > hueMaxC) hueMaxC = hh;
            _domHueHist[Math.floor(hh/10)%36] += ss*Math.min(ll,100-ll)/50; // chroma-weighted vote
          }
          const n=pxToNote(idx);
          if(n&&!seenM.has(n.m)){seenM.add(n.m);notes.push(n);}
        }
      }
      // 0 = totally flat (one uniform colour), 1 = highly varied texture.
      // varL ranges roughly 0..400 in practice; we normalise by 100 to land
      // most cells in 0..2 then clamp. Hue spread (degrees) caps at ~60° for
      // a noticeable rainbow gradient within a single cell.
      let _flat = 0;
      let _lum = null;                       // 0..1 mean lightness of the cell
      if(lNC>0){
        const lMean = lSumC/lNC;
        const lVar  = Math.max(0, lSqSumC/lNC - lMean*lMean);
        const hueSpread = hueMaxC>=0 ? (hueMaxC-hueMinC) : 0;
        const varScore = Math.min(1, lVar/100) * 0.65 + Math.min(1, hueSpread/60) * 0.35;
        _flat = 1 - varScore;
        _lum = Math.max(0, Math.min(1, lMean/100));   // render-only: cell brightness
      }
      // PHOTO: cap voicing at 3 notes so gradient-heavy cells (skin/sky/
      // foliage that generate 4–5 close pitches) read as chord triads, not
      // clusters. Keep the 3 with highest velocity (loudest = most vivid).
      if(isPhoto && notes.length > 3){
        // Build a new sorted, truncated array \u2014 don't mutate .length on the
        // original, iOS/Safari treats Array.length as writable-only under
        // strict conditions and can throw "readonly property" here.
        const _sorted = notes.slice().sort((a,b)=>b.v-a.v).slice(0,3);
        notes.length = 0;
        for(const _n of _sorted) notes.push(_n);
      }
      // Fallback: grab the most vivid pixel anywhere in the column group
      if(notes.length===0){
        for(let sk=0;sk<COL_STEP&&notes.length===0;sk++){
          const col=cg*COL_STEP+sk; if(col>=nc) break;
          const fallback=pickMostVivid(band,col);
          if(fallback&&!seenM.has(fallback.m)){seenM.add(fallback.m);notes.push(fallback);}
        }
      }
      // Dominant carrying pitch class for the cell (render-only). Pick the
      // winning chroma-weighted hue bin and map it through the active hue->pc
      // table (same table pxToNote uses), so the painted tone matches what the
      // palette would show for that hue. null when the cell is essentially grey
      // (no saturated vote) — then the Music canvas just keeps the harmonic pc.
      let _domPc=null;
      {
        let bb=-1,bm=0;
        for(let b2=0;b2<36;b2++){ if(_domHueHist[b2]>bm){ bm=_domHueHist[b2]; bb=b2; } }
        if(bb>=0){
          const domHue=bb*10+5;
          let pc=0,minD=Infinity;
          table.forEach((th,ti)=>{const d=Math.min(Math.abs(domHue-th),360-Math.abs(domHue-th));if(d<minD){minD=d;pc=ti;}});
          _domPc=pc;
        }
      }
      // Store band+cg so the canvas mosaic can paint each event's exact cell in
      // traversal order (needed for non-row-major directions like vert/spiral).
      evts.push({n:notes,startMs:evIdx*msPerBlock,idx:evIdx,cg,band,colStep:COL_STEP,_chroma:cellChN?cellChroma/cellChN:0,_flat,_domPc,_lum});
      evIdx++;
    }
  }
  // ─── ROTHKO PASS — flat-region variation injection ──
  // Large monochrome color fields (Rothko, Reinhardt, Ad Reinhardt black-on-
  // black, Yves Klein blue) generate mechanically identical chords across
  // 60-80% of the canvas — same hue → same pitch class, same chroma → same
  // velocity, same lightness → same voicing. Result: repetitive. This pass
  // identifies cells in flat regions (high flatness + low chroma + flat
  // neighbours) and injects deterministic micro-variation: velocity jitter,
  // timing rubato, vertical voicing shift, and occasional rests. Cells that
  // already have variance (Van Gogh brush-strokes, Picasso fragmentation,
  // Kandinsky scatter) score low on _flat and stay completely untouched.
  if(evts.length > 0){
    // Build a band/cg lookup so we can sample neighbours regardless of
    // traversal direction. Map from "band*effCols+cg" → evts index.
    const cellMap = new Map();
    for(let i=0;i<evts.length;i++){
      const e = evts[i];
      cellMap.set(e.band*effCols + e.cg, i);
    }
    // Image-wide chroma median — used as the "vivid threshold". A cell is
    // a candidate for the Rothko pass ONLY if its chroma is below median;
    // otherwise the variation would chew up texture in already-busy parts.
    const chromaSorted = evts.map(e=>e._chroma||0).slice().sort((a,b)=>a-b);
    const chromaMed = chromaSorted[Math.floor(chromaSorted.length*0.5)] || 0;
    // Pass A: per-cell region detection. A cell is "in flat region" if its
    // 5×3 neighbourhood (±2 horizontal, ±1 vertical) has mean flatness
    // ≥ 0.55 and the cell itself has chroma below the image median.
    for(let i=0;i<evts.length;i++){
      const e = evts[i];
      if((e._chroma||0) >= chromaMed){ e._inFlatRegion = false; continue; }
      let sum=0, n=0;
      for(let db=-1; db<=1; db++){
        for(let dc=-2; dc<=2; dc++){
          const key = (e.band+db)*effCols + (e.cg+dc);
          const ni = cellMap.get(key);
          if(ni!=null){ sum += (evts[ni]._flat||0); n++; }
        }
      }
      const meanFlat = n>0 ? sum/n : 0;
      e._inFlatRegion = meanFlat >= 0.55;
    }
    // Pass B: variation injection on flat-region cells. Determinism is
    // critical (same painting must produce same output) — we hash (band, cg)
    // into a pseudo-random 0..1 instead of Math.random.
    const detRnd = (band, cg, salt)=>{
      // Numerical Recipes LCG seeded with band/cg/salt.
      let h = ((band*48271 + cg*16807 + salt*2654435761) >>> 0);
      h = ((h*1103515245 + 12345) >>> 0);
      return (h % 233280) / 233280;
    };
    // Track band extents per flat region so the voicing shift knows which
    // cells are "top of region" vs "bottom of region". Simple per-band-column
    // chain detection: if cell at (band, cg) is flat AND cells above
    // (band-1, cg) and (band-2, cg) are also flat, this cell is "lower";
    // mirror for upper.
    const isFlat = (band, cg)=>{
      const ni = cellMap.get(band*effCols + cg);
      return ni!=null && evts[ni]._inFlatRegion === true;
    };
    let rotIdx = 0; // monotonic counter for rest pattern (every 6th flat cell)
    for(let i=0;i<evts.length;i++){
      const e = evts[i];
      if(!e._inFlatRegion) continue;
      const notes = e.n;
      if(!notes || notes.length === 0) continue;
      // (D) REST: every 6th flat cell becomes silent. Creates phrasing the
      // chord stream wouldn't otherwise have. Skip the first/last cells in
      // a row so the painting doesn't start or end on silence.
      rotIdx++;
      if(rotIdx % 6 === 0 && i > 4 && i < evts.length - 4){
        e.n = []; // empty notes array = rest
        continue; // skip further mods for this cell
      }
      // (B) Velocity jitter ±12% — same multiplier applied to all notes in
      // this chord so internal balance is preserved.
      const velMul = 0.88 + detRnd(e.band, e.cg, 1) * 0.24; // 0.88..1.12
      // (B) Timing rubato ±20ms — small enough to feel like breath, not
      // arrhythmia. Pure cosmetic offset on startMs.
      const tJit = (detRnd(e.band, e.cg, 2) - 0.5) * 40; // -20..+20 ms
      e.startMs = Math.max(0, e.startMs + tJit);
      // (C) Voicing shift: vertical position within the region drives octave
      // bias on the chord extremes. "Top of region" = highest band in this
      // column's flat chain → push the top note up; "bottom of region" =
      // lowest band → push the bass note down. Result: the colour field
      // splits into upper/lower harmonic regions instead of one flat plane.
      let topShift = 0, bassShift = 0;
      const aboveFlat  = isFlat(e.band - 1, e.cg);
      const above2Flat = isFlat(e.band - 2, e.cg);
      const belowFlat  = isFlat(e.band + 1, e.cg);
      const below2Flat = isFlat(e.band + 2, e.cg);
      if(!aboveFlat && belowFlat){
        // This cell is at the TOP of a multi-row flat region → lift top voice
        topShift = below2Flat ? 7 : 5;
      } else if(!belowFlat && aboveFlat){
        // This cell is at the BOTTOM of a multi-row flat region → drop bass
        bassShift = above2Flat ? -7 : -5;
      }
      // Apply velocity multiplier to ALL notes; apply pitch shifts to the
      // extreme voices only (top → highest m, bass → lowest m).
      let topI=0, bassI=0;
      for(let k=1;k<notes.length;k++){
        if(notes[k].m > notes[topI].m) topI=k;
        if(notes[k].m < notes[bassI].m) bassI=k;
      }
      for(let k=0;k<notes.length;k++){
        const baseV = notes[k].v != null ? notes[k].v : 80;
        notes[k] = {...notes[k], v: Math.max(20, Math.min(127, Math.round(baseV * velMul)))};
      }
      if(topShift !== 0 && notes[topI]){
        notes[topI] = {...notes[topI], m: Math.max(0, Math.min(127, notes[topI].m + topShift))};
      }
      if(bassShift !== 0 && notes[bassI] && bassI !== topI){
        notes[bassI] = {...notes[bassI], m: Math.max(0, Math.min(127, notes[bassI].m + bassShift))};
      }
    }
  }
  // ─── Music theory pass ──
  // 1) Krumhansl-Schmuckler key detection
  const pcCounts=new Array(12).fill(0);
  evts.forEach(ev=>ev.n.forEach(n=>pcCounts[n.m%12]++));
  const MAJOR_P=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
  const MINOR_P=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
  // Colour temperature → mood bias. Warm hues (reds/oranges/yellows, ~0–60° &
  // ~330–360°) lean MAJOR/bright; cool hues (greens/cyans/blues/violets,
  // ~120–270°) lean MINOR/darker. Computed from the saturation-weighted hue
  // histogram built in the stats pass. We turn it into a gentle multiplier on
  // the major-vs-minor correlation so the pitch evidence still leads and colour
  // only tips genuinely ambiguous cases (keeps harmony sound, adds mood).
  let warmW=0,coolW=0;
  for(let b=0;b<36;b++){
    const hue=b*10+5, w=hueHist[b];
    if(hue<60||hue>=330) warmW+=w;            // red→yellow + magenta/pink
    else if(hue>=120&&hue<270) coolW+=w;      // green→blue→violet
  }
  const tempTotal=warmW+coolW;
  const warmth=tempTotal>0 ? (warmW-coolW)/tempTotal : 0; // -1 cool … +1 warm
  // Major/minor bias: warmth (image colour temperature) gives a tiny ±6% nudge —
  // a tiebreaker, not an override. Mood valence (atmoV) adds a stronger ±20% lean
  // so a sad/heavy tag can actually pull an ambiguous canvas into minor (and a
  // playful/bright tag into major). Clear-cut tonal images still win on Krumhansl.
  const majBias=1+0.06*warmth+0.20*valenceBias;
  const minBias=1-0.06*warmth-0.20*valenceBias;
  let bestKey=0,bestModeIsMajor=true,bestCorr=-Infinity;
  for(let key=0;key<12;key++){
    for(const isMaj of[true,false]){
      const prof=isMaj?MAJOR_P:MINOR_P;
      let corr=0;
      for(let i=0;i<12;i++)corr+=pcCounts[(i+key)%12]*prof[i];
      corr*=isMaj?majBias:minBias;             // colour-temperature mood tiebreaker
      if(corr>bestCorr){bestCorr=corr;bestKey=key;bestModeIsMajor=isMaj;}
    }
  }
  // Scale choice depends on the COLOUR MODE. HARMONY/BW/CUSTOM keep the familiar
  // major/minor diatonic — warm, resolved, song-like. SPECTRAL adapts to the
  // painting's character so it's never harsh:
  //   • a SOFT / PALE image (low saturation or high lightness) gets the MAJOR
  //     PENTATONIC — five notes, no semitones and no tritones, so every
  //     combination is gentle and consonant. No edge, no sourness on delicate
  //     pastel washes where the whole-tone scale sounded unpleasant.
  //   • a VIVID / DRAMATIC image keeps the WHOLE-TONE scale — dreamy, weightless,
  //     unmistakably "spectral", which suits bold saturated paintings.
  // Both still read clearly different from Harmony, but the soft case is now
  // pretty instead of jarring.
  const MAJ_OFFSETS=[0,2,4,5,7,9,11];
  const MIN_OFFSETS=[0,2,3,5,7,8,10];
  const WHOLE_OFFSETS=[0,2,4,6,8,10];            // whole-tone — dreamy, tonic-less (vivid images)
  const PENTA_OFFSETS=[0,2,4,7,9];               // major pentatonic — always sweet (soft images)
  const isSpectral = colorMode==='spectral';
  // "Soft/pale" = muted colour OR bright, delicate wash. Tuned so a saturated,
  // mid-to-dark painting stays whole-tone while pastels switch to pentatonic.
  // Mood override on Spectral scale: serene/dreamy/mysterious moods always pick
  // pentatonic (sweet, no dissonance); frantic/harsh moods always pick whole-tone
  // (weightless, untethered). Mid-mood (or no atmo) defers to the image's read.
  const spectralSoft = isSpectral && (avgChroma < 32 || avgLight > 66);
  const _atmoSpectralPenta = isSpectral && atmoE!=null && atmoE<0.30;
  const _atmoSpectralWhole = isSpectral && atmoE!=null && atmoE>0.70;
  const baseOffsets = isSpectral
    ? (_atmoSpectralPenta ? PENTA_OFFSETS
       : _atmoSpectralWhole ? WHOLE_OFFSETS
       : (spectralSoft ? PENTA_OFFSETS : WHOLE_OFFSETS))
    : (bestModeIsMajor ? MAJ_OFFSETS : MIN_OFFSETS);
  const scalePCs=baseOffsets.map(o=>(o+bestKey)%12);
  const SCALE_LEN=scalePCs.length;               // 7 diatonic / 6 whole-tone / 5 pentatonic
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
    // Harmony/BW/Custom pull voices into a close ±17-semitone cluster (warm,
    // blended). Spectral keeps a much wider ±29 spread so chords stay open and
    // airy — voices ring across two octaves like spaced bells, reinforcing the
    // weightless whole-tone colour. Only the fold-distance changes; bass stays put.
    const span = isSpectral ? 29 : 17;
    return notes.map(n=>{if(n.bass)return n;let m=n.m;while(m>anchor+span)m-=12;while(m<anchor-span)m+=12;return{...n,m};});
  }
  function removeM2(notes){
    if(notes.length<=1)return notes;
    const byVel=[...notes].sort((a,b)=>(b.v||0)-(a.v||0));
    const kept=[];
    for(const n of byVel){if(kept.some(k=>Math.abs(k.m-n.m)===1))continue;kept.push(n);}
    return kept;
  }
  // Harmonize: when a cell's 3 row-pixels all snap to the same MIDI (e.g. a
  // uniform-color cell), the dedup pass collapses it to a single tone. Build
  // a proper triad on that note's scale degree (root + third + fifth from the
  // detected key) so each cell always sounds with full polyphony. Only adds
  // notes that aren't already present — pre-existing chord tones are kept.
  function harmonizeToTriad(notes){
    if(notes.length===0||notes.length>=3)return notes;
    // Use highest-velocity note as the root for harmonization
    const sorted=[...notes].sort((a,b)=>(b.v||64)-(a.v||64));
    const root=sorted[0];
    const rootPc=((root.m%12)+12)%12;
    const scaleIdx=scalePCs.indexOf(rootPc);
    if(scaleIdx<0)return notes;
    // Triad: scale degrees 1, 3, 5 (i.e. indices 0, 2, 4 in the 7-note scale)
    const thirdPc=scalePCs[(scaleIdx+2)%SCALE_LEN];
    const fifthPc=scalePCs[(scaleIdx+4)%SCALE_LEN];
    // Place third and fifth in the closest octave above the root
    const baseOct=Math.floor(root.m/12);
    let thirdM=baseOct*12+thirdPc; if(thirdM<=root.m)thirdM+=12;
    let fifthM=baseOct*12+fifthPc; if(fifthM<=thirdM)fifthM+=12;
    // Cap at sensible piano range
    if(thirdM>96||fifthM>96)return notes;
    const existing=new Set(notes.map(n=>n.m));
    const result=[...notes];
    if(!existing.has(thirdM))result.push({...root,m:thirdM,v:Math.round((root.v||64)*0.72)});
    if(!existing.has(fifthM))result.push({...root,m:fifthM,v:Math.round((root.v||64)*0.68)});
    return result;
  }
  // ─── Harmonic progression (deterministic, per-bar) ─────────────────────────
  // Static per-cell triads gave harmony no direction. Instead we lay a diatonic
  // chord progression over the piece: the canvas is divided into BARS (a fixed
  // run of events), and each bar is assigned a scale degree from a progression
  // that fits the detected mode. Accompaniment in each event is then voiced
  // toward THAT bar's chord, so the harmony actually moves (tension → release)
  // across the painting instead of sitting in one place.
  // Harmonic rhythm: how many scan-cells share one chord. Larger = the harmony
  // changes more slowly, so it floats in long planes rather than re-picking a
  // chord every little strip of the canvas. 32 cells ≈ a slow ~4s harmonic pace
  // at the fixed image tempo — the unhurried, drifting feel of ambient/post-rock
  // (Sigur Rós etc.) where one chord is allowed to hang and resonate.
  const BAR_EVENTS=32;                             // slow harmonic pace (was 16 — too restless)
  // Degree progressions (0-indexed scale degrees). Major: I–V–vi–IV (pop-classic,
  // always lands well). Minor: i–VI–III–VII (natural-minor staple).
  const PROG=bestModeIsMajor ? [0,4,5,3] : [0,5,2,6];
  // Brightness-mapped chord palettes. A bar's chord is chosen from one of these
  // by how light/dark that strip of the painting is, so the HARMONY MOVES WITH
  // THE IMAGE instead of cycling one fixed loop. Light strips get bright, open
  // chords (I/IV/V); shadowed strips get the darker, more introspective diatonic
  // chords (vi/ii/iii). The base progression still seeds the choice (so motion
  // stays directional and musical), then brightness shifts it toward bright or
  // dark — a blend of "follows the painting" and "sounds like a real progression".
  const BRIGHT_DEGREES = bestModeIsMajor ? [0,3,4] : [0,5,6];   // I, IV, V  /  i, VI, VII
  const DARK_DEGREES   = bestModeIsMajor ? [5,1,2] : [2,3,1];   // vi, ii, iii / III, iv, ii°
  // Cadence: give the piece a sense of arrival. The LAST bar resolves to the
  // tonic (I/i) and the bar before it sits on the dominant (V) — a V→I (or V→i)
  // authentic cadence — so the music lands instead of just stopping mid-phrase.
  const totalBars=Math.max(1, Math.ceil(evts.length / BAR_EVENTS));
  // Smooth voice-leading helper: given a candidate set of scale degrees and the
  // PREVIOUS bar's chosen degree, pick the candidate whose triad shares the most
  // pitch classes with (and moves the least from) the previous chord. This is
  // what stops the harmony jumping (G→D→A felt "chopped up"); instead it drifts
  // by common tones and small steps — the connected, hovering quality of
  // ambient/post-rock where each chord melts into the next.
  function triadPCsOf(deg){ return [scalePCs[deg%SCALE_LEN], scalePCs[(deg+2)%SCALE_LEN], scalePCs[(deg+4)%SCALE_LEN]]; }
  function pickSmooth(cands, prevDeg){
    if(prevDeg==null) return cands[0];
    const prev=triadPCsOf(prevDeg);
    let best=cands[0], bestScore=-Infinity;
    for(const d of cands){
      const t=triadPCsOf(d);
      // shared pitch classes (common tones) — more shared = smoother
      let shared=0; for(const p of t) if(prev.includes(p)) shared++;
      // root motion by circle-of-fifths closeness (small = smoother)
      const rootMove=Math.min(((d-prevDeg)%SCALE_LEN+SCALE_LEN)%SCALE_LEN,((prevDeg-d)%SCALE_LEN+SCALE_LEN)%SCALE_LEN);
      const score=shared*2 - rootMove*0.5;
      if(score>bestScore){ bestScore=score; best=d; }
    }
    return best;
  }
  let _prevDeg=null;                                // running previous chord degree
  const _barDegCache=new Map();                     // barIdx → chosen degree (compute once per bar)
  function barChordPCs(barIdx){
    if(_barDegCache.has(barIdx)){
      const d=_barDegCache.get(barIdx);
      return [scalePCs[d%SCALE_LEN], scalePCs[(d+2)%SCALE_LEN], scalePCs[(d+4)%SCALE_LEN]];
    }
    let deg;
    if(barIdx>=totalBars-1)      deg=0;             // final bar → tonic (resolve)
    else if(barIdx===totalBars-2) deg=4;            // penultimate bar → dominant (V)
    else {
      // Brightness picks the chord PALETTE (bright vs dark vs grounded); within
      // that palette, voice-leading picks the SPECIFIC chord that connects most
      // smoothly to the previous one — so the harmony still follows the painting
      // but transitions glide instead of jumping.
      const light=barLight[barIdx]!=null?barLight[barIdx]:0.5;  // 0 dark … 1 light
      const baseDeg=PROG[barIdx % PROG.length];
      if(light>0.62){
        deg=pickSmooth(BRIGHT_DEGREES, _prevDeg);   // luminous strip → bright palette
      } else if(light<0.38){
        deg=pickSmooth(DARK_DEGREES, _prevDeg);     // shadowed strip → darker palette
      } else {
        // mid brightness → prefer the progression's chord, but if it lurches, let
        // voice-leading nudge it toward something connected (kept grounded).
        deg=pickSmooth([baseDeg, ...BRIGHT_DEGREES, ...DARK_DEGREES], _prevDeg);
      }
    }
    _prevDeg=deg;
    _barDegCache.set(barIdx, deg);
    // Triad = scale degrees deg, deg+2, deg+4 (root/third/fifth within the scale)
    return [scalePCs[deg%SCALE_LEN], scalePCs[(deg+2)%SCALE_LEN], scalePCs[(deg+4)%SCALE_LEN]];
  }
  // Nearest MIDI of a given pitch-class to a reference note.
  function nearestPc(pc, ref){
    const base=Math.floor(ref/12)*12+pc;
    const cands=[base-12,base,base+12];
    return cands.reduce((a,b)=>Math.abs(b-ref)<Math.abs(a-ref)?b:a);
  }
  // Voice an event's accompaniment to the bar chord: keep up to 3 chord tones
  // near the mid register, dropping non-chord tones to the nearest chord tone.
  function voiceToBarChord(notes, barPCs){
    if(notes.length===0) return notes;
    const set=new Set(barPCs);
    return notes.map(n=>{
      const pc=((n.m%12)+12)%12;
      if(set.has(pc)) return n;                      // already a chord tone
      // snap to nearest chord-tone pitch class
      let best=barPCs[0],bd=99;
      for(const c of barPCs){const d=Math.min(Math.abs(pc-c),12-Math.abs(pc-c));if(d<bd){bd=d;best=c;}}
      return {...n, m:nearestPc(best, n.m)};
    });
  }
  for(const ev of evts){
    // Capture brightness BEFORE tighten/snap collapse the octave spread: the
    // most-salient note's raw MIDI still reflects the source pixel's lightness.
    if(ev.n.length){ ev._bright=[...ev.n].sort((a,b)=>(b.v||0)-(a.v||0))[0].m; }
    ev.n=ev.n.map(n=>({...n,m:snapToScale(n.m)}));
    ev.n=tightenChord(ev.n);
    ev.n=removeM2(ev.n);
    const seen=new Set();
    ev.n=ev.n.filter(n=>seen.has(n.m)?false:(seen.add(n.m),true));
  }
  // ─── Per-bar brightness profile (harmony follows the painting) ──────────────
  // The old progression cycled a fixed 4-chord loop (I–V–vi–IV) regardless of
  // what the canvas was doing, so the harmony sounded the same start to finish.
  // Instead, measure each bar's average brightness (from the _bright proxy) and
  // its position in the overall light/dark range, so the chord chosen per bar can
  // track whether THIS strip of the painting is luminous or shadowed.
  const _barCount=Math.max(1, Math.ceil(evts.length / 16));
  const barBright=new Array(_barCount).fill(0);
  const barBN=new Array(_barCount).fill(0);
  const barChroma=new Array(_barCount).fill(0);
  const barCN=new Array(_barCount).fill(0);
  for(let i=0;i<evts.length;i++){
    const b=Math.floor(i/16);
    if(evts[i]._bright!=null){ barBright[b]+=evts[i]._bright; barBN[b]++; }
    if(evts[i]._chroma!=null){ barChroma[b]+=evts[i]._chroma; barCN[b]++; }
  }
  for(let b=0;b<_barCount;b++){
    barBright[b]= barBN[b]? barBright[b]/barBN[b] : null;
    barChroma[b]= barCN[b]? barChroma[b]/barCN[b] : 0;
  }
  // Normalize bar brightness to 0..1 across the bars that actually sounded, so
  // "dark" and "light" are relative to THIS painting rather than absolute MIDI.
  let _bbMin=Infinity,_bbMax=-Infinity;
  for(const v of barBright){ if(v==null)continue; if(v<_bbMin)_bbMin=v; if(v>_bbMax)_bbMax=v; }
  const _bbRange=(isFinite(_bbMin)&&_bbMax>_bbMin)?(_bbMax-_bbMin):1;
  const barLight=barBright.map(v=> v==null?0.5 : Math.max(0,Math.min(1,(v-_bbMin)/_bbRange)));
  // Normalize bar chroma the same way → 0 (muted/greyish strip) … 1 (most vivid
  // strip in this painting). This is the "emotional charge" axis: vivid strips
  // get full, mood-bearing chords; washed-out strips stay open and airy.
  let _bcMax=-Infinity;
  for(const v of barChroma){ if(v>_bcMax)_bcMax=v; }
  const _bcRange=_bcMax>0?_bcMax:1;
  const barVivid=barChroma.map(v=> Math.max(0,Math.min(1, v/_bcRange)));
  // ─── Melody extraction + progression voicing ───────────────────────────────
  // For each event: the single most-salient (highest-velocity) note becomes the
  // MELODY — lifted into a clear upper register, played at full strength, and
  // kept diatonic. The remaining notes become quieter ACCOMPANIMENT voiced to
  // the current bar's chord. This gives a foreground line the ear can follow,
  // over moving harmony — the two biggest things plain scanning lacked.
  // Spectral lifts the melody register up too (~a fifth) so the soaring top line
  // — the most audible voice — clearly sings higher than Harmony's. Combined with
  // the octave-shifted accompaniment, whole-tone scale and wide voicing, the two
  // colour modes now occupy distinctly different sonic worlds on the same image.
  const MEL_LIFT = isSpectral ? 7 : 0;
  // Mood reshapes the melody ceiling. Serene atmo pulls it down (G5→C5) so the line
  // doesn't pierce; agitato atmo lifts it up (G5→C6) so the line can soar. Neutral
  // mood (or no atmo) keeps the G5 default.
  const MEL_CEIL_BASE = 79;
  const _melAtmoShift = (atmoE!=null)
    ? (atmoE<0.5 ? -7*(0.5-atmoE)/0.5 : +5*(atmoE-0.5)/0.5)
    : 0;
  // Valence shifts the melody floor: positive valence (bright/playful) lifts
  // the floor up to +3 semitones so the melody sits brighter; negative
  // valence (heavy/grief) drops the floor up to −3 semitones so the line
  // feels grounded. ATMO energy already moves the ceiling; valence moves
  // the floor independently, so mood shapes both ends of the register.
  const _melValShift = Math.round(valenceBias * 3);                 // -3..+3
  const MEL_MIN=60+MEL_LIFT+_melValShift;           // C4 (G4 in spectral) — melody floor, valence-shifted
  const MEL_MAX=Math.round(MEL_CEIL_BASE+_melAtmoShift)+MEL_LIFT;  // 79 default; 72 serene; 84 frantic
  const MEL_SPAN=MEL_MAX-MEL_MIN;
  // Brightness range across the image's melody-source notes — used to map each
  // cell's brightness onto the melody register so the LINE TRACES THE IMAGE:
  // bright regions push the tune up, dark regions pull it down. (A note's
  // original octave was derived from pixel lightness upstream, so its raw MIDI
  // is a faithful brightness proxy.)
  let bMin=Infinity,bMax=-Infinity;
  for(const ev of evts){ if(ev._bright==null) continue; if(ev._bright<bMin)bMin=ev._bright; if(ev._bright>bMax)bMax=ev._bright; }
  if(!isFinite(bMin)){ bMin=0; bMax=1; }
  const bRange=(bMax-bMin)||1;
  let lastMel=null;                                 // mild smoothing of the contour
  let lastLastMel=null;                             // for binary-chatter detection (A-B-A-B)
  let altRun=0;                                     // consecutive A-B-A-B alternations
  let repeatRun=0;                                  // consecutive same-pitch counter (anti-telegraph)
  let darkRepeatLast=null;                          // dark-band lift: own anti-telegraph state
  let darkRepeatRun=0;                              // (kept separate so octave-wide global jumps don't apply)
  // Intensity reference: how "loud/dense" each event's source is, relative to the
  // whole piece. Intense events (vivid, busy cells) will swell into FULL chords —
  // root+third+fifth plus a doubled bass octave — for a strong, powerful sound;
  // calm events stay sparse. Measured from summed source velocity.
  const rawInt=evts.map(ev=>ev.n.reduce((a,n)=>a+(n.v||0),0));
  const intSorted=rawInt.filter((_,i)=>evts[i].n.length).slice().sort((a,b)=>a-b);
  const intLo=intSorted.length?intSorted[Math.floor(intSorted.length*0.3)]:0;
  const intHi=intSorted.length?intSorted[Math.floor(intSorted.length*0.85)]:1;
  const intRange=(intHi-intLo)||1;
  for(let i=0;i<evts.length;i++){
    const ev=evts[i];
    if(!ev.n.length) continue;
    const barPCs=barChordPCs(Math.floor(i/BAR_EVENTS));
    // Pick melody = loudest note that ISN'T a protected bass note, so black-dot
    // deep notes stay low. Fall back to loudest only if the cell is all-bass.
    const sorted=[...ev.n].sort((a,b)=>(b.v||0)-(a.v||0));
    const nonBass=sorted.filter(n=>!n.bass);
    let melSrc=(nonBass.length?nonBass:sorted)[0];
    let melPc=((melSrc.m%12)+12)%12;
    // Target height from brightness: map this cell's brightness proxy into the
    // melody band, so the melodic contour mirrors the painting's light/dark.
    const bright=(((ev._bright!=null?ev._bright:melSrc.m))-bMin)/bRange; // 0 dark … 1 bright
    const targetM=MEL_MIN + bright*MEL_SPAN;        // desired pitch height
    // Place melPc at the octave whose pitch is nearest the brightness target,
    // then blend toward the previous note so the line is smooth but still
    // follows the image. The contour/smoothing balance is ATMO-aware: calm
    // pieces (atmoE→0) breathe at 50/50 — gentle line that doesn't jump on
    // every brightness change; frantic pieces (atmoE→1) at 85/15 — sharp
    // line that tracks the image's jolts; mid mood keeps the 70/30 default.
    let melM=melPc; while(melM<MEL_MIN) melM+=12; while(melM>MEL_MAX) melM-=12;
    const _contourW = atmoE!=null ? (0.50 + 0.35*atmoE) : 0.70;       // 0.50…0.85
    const aim = lastMel!=null ? (_contourW*targetM + (1-_contourW)*lastMel) : targetM;
    const cands=[melM-12,melM,melM+12].filter(m=>m>=MEL_MIN-12&&m<=MEL_MAX+12);
    // Pick candidate by aim distance + a continuity penalty against lastMel.
    // The penalty discourages random octave jumps when neighbouring cells
    // share the same pitch class but lastMel sits in a particular octave.
    // Penalty weight is ATMO-aware: calm pieces weight continuity HEAVIER
    // (0.5 — almost matching the aim weight, so the line stays in register),
    // frantic pieces lighter (0.15 — image jolts can still leap an octave).
    const _smoothPenalty = lastMel!=null
      ? (atmoE!=null ? (0.50 - 0.35*atmoE) : 0.30)                    // 0.50…0.15
      : 0;
    melM=cands.reduce((a,b)=>{
      const ascore = Math.abs(a-aim) + (lastMel!=null ? _smoothPenalty*Math.abs(a-lastMel) : 0);
      const bscore = Math.abs(b-aim) + (lastMel!=null ? _smoothPenalty*Math.abs(b-lastMel) : 0);
      return bscore < ascore ? b : a;
    });
    melM=Math.max(MEL_MIN-12,Math.min(MEL_MAX+12,melM));
    // Anti-repeat: a flat, uniform region maps every cell to the same pitch,
    // which re-strikes one note rapidly (a "telegraph beep"). When the melody
    // would repeat, walk to an adjacent SCALE tone instead, alternating up/down,
    // so uniform areas become gentle stepwise motion rather than a stutter.
    if(lastMel!=null && melM===lastMel){
      repeatRun++;
      // find scale-tone neighbours above and below within the melody band
      const stepTone=(from,dir)=>{
        let m=from+dir;
        for(let g=0;g<12;g++,m+=dir){
          const pc=((m%12)+12)%12;
          if(scalePCs.includes(pc) && m>=MEL_MIN-12 && m<=MEL_MAX+12) return m;
        }
        return null;
      };
      const dir=(repeatRun%2===1)?1:-1;            // alternate direction each repeat
      const alt=stepTone(melM,dir) ?? stepTone(melM,-dir);
      if(alt!=null) melM=alt;
      // Long fast repeats in the high register read as telegraph chatter. Every
      // 3rd repeat, drop the melody onset entirely (a rest) so the line breathes.
      if(repeatRun>=2 && (repeatRun%3===0)) ev._melRest=true;
    } else {
      repeatRun=0;
    }
    // Binary-chatter detector: A-B-A-B-A. The previous anti-repeat catches
    // A-A but a stripe pattern toggling two pitches passes through. If melM
    // matches the cell TWO back (i.e. we're alternating with lastMel), count
    // it as binary chatter. After 2+ alternations, nudge the current note by
    // a scale step so the line breaks the binary, and drop every 3rd to a
    // rest the way the repeat handler does. lastLastMel and altRun reset
    // whenever the pattern breaks naturally.
    if(lastLastMel!=null && lastMel!=null && melM===lastLastMel && melM!==lastMel){
      altRun++;
      if(altRun>=2){
        const stepToneCh=(from,dir)=>{
          let m=from+dir;
          for(let g=0;g<12;g++,m+=dir){
            const pc=((m%12)+12)%12;
            if(scalePCs.includes(pc) && m>=MEL_MIN-12 && m<=MEL_MAX+12) return m;
          }
          return null;
        };
        const dir2=(altRun%2===1)?1:-1;
        const alt2=stepToneCh(melM,dir2) ?? stepToneCh(melM,-dir2);
        if(alt2!=null) melM=alt2;
        if(altRun>=3 && altRun%3===0) ev._melRest=true;
      }
    } else {
      altRun=0;
    }
    lastLastMel=lastMel;
    lastMel=melM;
    const intensity=Math.max(0,Math.min(1,(rawInt[i]-intLo)/intRange)); // 0 calm … 1 intense
    // DARK-PASSAGE HANDLING. Two distinct situations where melSrc.bass is true:
    //
    //  (a) a SPARSE black dot inside an otherwise colourful cell — here we DO
    //      want it to stay deep (the original behaviour: a black dot that plays
    //      "high" sounds wrong). Detected by: the cell also has non-bass voices,
    //      OR this is an isolated dark event surrounded by bright ones.
    //
    //  (b) a WHOLE dark band (tmavá pasáž — black cat, shadow, dark chair) where
    //      EVERY voice is bass. The old code left the melody deep too, so the
    //      entire band collapsed into a low rumble with no audible line. Instead
    //      we keep ONE deep pedal tone (handled later via bassNotes) but LIFT a
    //      real melody up into the mid register so the passage actually sings.
    //
    // We treat it as a dark band only when EVERY voice is a deep/dark bass voice
    // — a genuinely dark passage (black cat, shadow, dark chair) with no colour
    // highlight at all. When a cell DOES carry a brighter (non-bass) voice — a
    // highlight or contour inside the shadow — that voice is left on the normal
    // path, where its own lightness already lifts it into a clear register
    // (this is how the reference build already handled speckled shadows well).
    // The dark-band lift below exists purely to rescue the all-dark cells, which
    // are the ones that used to collapse into a low rumble.
    const allBass = ev.n.length>0 && ev.n.every(n=>n.bass);
    const melIsBass = !!melSrc.bass && !allBass;
    // For a dark-band cell, derive the melody pitch-class from the loudest
    // (darkest, most present) bass voice so the line still reflects the shadow's
    // residual hue, then voice it UP into a clear singing register. The brightness
    // target sits mid-high so the melody floats over the harmony with real air.
    if(allBass){
      // re-pick melody pc: prefer the highest-velocity bass voice (darkest dots
      // are loudest, but a near-l22 coloured-dark pixel carries a real hue)
      melPc=((melSrc.m%12)+12)%12;
      melPc=snapToScale(60+melPc)%12;                 // keep it diatonic
      // Lift the dark-band melody into a CLEAR singing register — well above the
      // deep pedal root that anchors the passage. The old target (0.18·span ≈ C4)
      // sat almost on top of the mid-register chord, so melody, chord and bass
      // all piled into one narrow muddy band → the "rumble". Aim high in the
      // melody band and weight the brightness target strongly over the smoothing
      // term so a uniform shadow holds a clear, steady high line instead of
      // sagging back down toward the chord.
      const darkTarget=MEL_MIN + 0.78*MEL_SPAN;       // ~C5 — clearly sings over the chord
      let dm=melPc; while(dm<MEL_MIN) dm+=12; while(dm>MEL_MAX) dm-=12;
      const dcands=[dm-12,dm,dm+12,dm+24].filter(m=>m>=MEL_MIN&&m<=MEL_MAX);
      const aimD=lastMel!=null?(0.82*darkTarget+0.18*lastMel):darkTarget;
      melM=(dcands.length?dcands:[dm]).reduce((a,b)=>Math.abs(b-aimD)<Math.abs(a-aimD)?b:a);
      melM=Math.max(MEL_MIN,Math.min(MEL_MAX,melM));
      // Anti-telegraph for uniform shadows: a flat dark field maps every cell to
      // the SAME high pitch, which would re-strike one note (a beep). Instead of
      // the global anti-repeat's octave-wide jumps (which here dropped the line
      // BELOW the chord), nudge by a single scale STEP up/down around the target,
      // so the shadow holds a gentle stepwise high line that never collapses into
      // the harmony. Every 3rd repeat rests so the line breathes.
      if(darkRepeatLast!=null && melM===darkRepeatLast){
        darkRepeatRun++;
        const stepUp=(from)=>{let m=from+1;for(let g=0;g<7&&m<=MEL_MAX;g++,m++){if(scalePCs.includes(((m%12)+12)%12))return m;}return null;};
        const stepDn=(from)=>{let m=from-1;for(let g=0;g<7&&m>=MEL_MIN;g++,m--){if(scalePCs.includes(((m%12)+12)%12))return m;}return null;};
        const dir=(darkRepeatRun%2===1);
        const alt=(dir?stepUp(melM):stepDn(melM)) ?? (dir?stepDn(melM):stepUp(melM));
        if(alt!=null) melM=alt;
        if(darkRepeatRun>=2 && darkRepeatRun%3===0) ev._melRest=true;
      } else {
        darkRepeatRun=0;
      }
      darkRepeatLast=melM;
      lastLastMel=lastMel;
      lastMel=melM;
    }
    // Melody velocity: softer overall, and higher notes are softened MORE so the
    // raised top register soars and shimmers rather than turning shrill. The
    // stronger high-end roll-off (0.34) keeps the bright soaring notes airy and
    // weightless — the floating top voice of ambient/post-rock. EXCEPTION: a white
    // source (a markant luminous shape) keeps most of its strength and gets a
    // higher floor, so a bright white reads as the prominent accent it is on the
    // canvas rather than being rolled off into the haze.
    // White is made MARKANT through CLARITY and SPACE, not loudness — a loud high
    // note would be shrill (ucho-nelahodiaca). So a white melody keeps the same
    // soft dynamic as any other note; what makes it stand out is the thinning of
    // the chord beneath it and a longer ring (handled below). Velocity stays gentle.
    const heightFrac = Math.max(0, Math.min(1, (melM - MEL_MIN) / (MEL_SPAN||1)));
    const isWhiteMel = !!melSrc.white;
    // ATMO-aware roll-off: calm pieces soften the high register MORE (0.42)
    // so soaring notes float airy; frantic pieces soften LESS (0.22) so the
    // top register can ring bright and bold. Mid mood keeps 0.34.
    const rollOff = atmoE!=null ? (0.42 - 0.20*atmoE) : 0.34;
    const melVel = Math.round((melSrc.v||80) * (0.90 - rollOff*heightFrac));
    // ATMO-aware floor: calm lets the melody go down to a near-whisper (40);
    // frantic keeps a higher presence floor (54) so even softest notes are
    // heard against the busy texture. Mid mood keeps the original 48.
    const melFloor = atmoE!=null ? Math.round(40 + 14*atmoE) : 48;
    const melody = melIsBass
      ? {...melSrc, _melody:true}                                          // keep its low pitch + velocity, mark as melody
      : {...melSrc, m:melM, v:Math.max(melFloor,Math.min(96,melVel)), bass:false, white:isWhiteMel, _melody:true};
    if(melIsBass){ lastMel=null; lastLastMel=null; altRun=0; }     // don't let it anchor the contour
    // Accompaniment = the rest (minus the chosen melody note). Protected bass
    // notes (black dots) are pulled OUT here so the chord voicing can't lift
    // them up; they're re-added low at the end, fitting under the chord.
    const rest=ev.n.filter(n=>n!==melSrc);
    const bassNotes=rest.filter(n=>n.bass);
    let accomp=voiceToBarChord(rest.filter(n=>!n.bass), barPCs);
    // Seed the bar chord so harmony is always heard. Whether the mood-defining
    // THIRD is included is what makes a patch sound bright/dark and full/airy —
    // so we gate it on the painting's emotional charge HERE, not just loudness.
    // A patch that is vivid (saturated colour), luminous, OR energetic earns the
    // full triad (root+third+fifth) → a clear, emotionally-coloured chord. A
    // muted, dim, washed-out patch keeps an open root+fifth → airy, neutral,
    // suspended — the sonic equivalent of a faded or shadowed area. This ties
    // chord colour directly to the aura of each strip of the image.
    const haveP=new Set(accomp.map(n=>((n.m%12)+12)%12));
    const barIdxNow=Math.floor(i/BAR_EVENTS);
    const vivid=barVivid[barIdxNow]!=null?barVivid[barIdxNow]:0.5;   // colour saturation of this strip
    const light=barLight[barIdxNow]!=null?barLight[barIdxNow]:0.5;   // luminosity of this strip
    // "Charged" = the strip carries real emotional colour: saturated, or bright,
    // or busy. Any one of these brings the third in; only genuinely muted+dim+
    // calm patches stay open. Dark bands always get the third (the lifted melody
    // needs real harmony under it, not a hollow fifth).
    const charged = allBass || vivid>0.42 || light>0.6 || intensity>0.5;
    // Reference register for seeded chord tones. In a dark band, anchor the
    // chord low-mid (~G3–C4) — a clear octave or more below the lifted high
    // melody — so three distinct layers emerge with air between them: deep pedal
    // (~C1–C2), mid chord (~G3–C4), singing melody (~C5). This vertical spread is
    // exactly what replaces the old single-octave mush with an open, resonant
    // sound. Elsewhere keep the original behaviour.
    const refLow = allBass ? Math.max(48, Math.min(55, melM-13)) : Math.min(melM-7, 64);
    const seedPCs = charged ? [barPCs[0],barPCs[1],barPCs[2]] : [barPCs[0],barPCs[2]];
    for(const pc of seedPCs){
      if(!haveP.has(pc)){
        accomp.push({...melSrc, m:nearestPc(pc, refLow), v:Math.max(30,Math.round((melSrc.v||64)*0.5)), bass:false});
        haveP.add(pc);
      }
    }
    // Intense events get a DOUBLED BASS octave (root an octave down) for weight,
    // and a wider voice cap so the chord fills out; calm events stay thin.
    if(intensity>0.6){
      const bassM=nearestPc(barPCs[0], 40);          // low root (~E2 region)
      if(!accomp.some(n=>n.m===bassM)) accomp.push({...melSrc, m:bassM, v:Math.max(34,Math.round((melSrc.v||64)*0.55))});
    }
    // Voice density. Fewer simultaneous voices = more air and space; image
    // 'intensity' (per-cell vividness) picks the base. Mood reshapes the texture:
    // serene atmo thins by 1 (open, breathy), frantic atmo thickens by 1 (denser
    // chord). Clamped 2..5 so a calm cell never falls below a usable duo and a
    // frantic cell can reach a full triad + doubled bass.
    const _voiceAtmoShift = (atmoE!=null)
      ? (atmoE<0.5 ? -1*(0.5-atmoE)/0.5 : +1*(atmoE-0.5)/0.5)
      : 0;
    const _voiceBase = intensity>0.6 ? 4 : intensity>0.3 ? 3 : 2;
    const voiceCap = Math.max(2, Math.min(5, Math.round(_voiceBase + _voiceAtmoShift)));
    // Velocity swell: intense chords play louder overall (up to +22%).
    const intGain = 1 + 0.12*intensity;              // gentler swell (was 0.22) — softer, rounder
    // Keep accompaniment below the melody and dedup.
    const seen=new Set();
    const melActual=melody.m;
    accomp=accomp
      .map(n=>({...n, m:n.m>=melActual ? n.m-12 : n.m, v:Math.max(26,Math.min(100,Math.round((n.v||56)*0.78*intGain)))}))
      .filter(n=>{const k=n.m; if(seen.has(k)||k<28)return false; seen.add(k); return true;})
      .sort((a,b)=>b.m-a.m)                           // keep the fullest upper voices first
      .slice(0,voiceCap);
    // Re-add the protected black-dot bass: deep (C1–C2) on the bar root, at a
    // velocity that sits UNDER the chord so it supports rather than dominates —
    // sparse, deliberate low tones that fit the composition. In a dark band
    // (allBass) we deliberately add ONLY this single pedal root: the many low
    // source voices that used to pile up here (the "rumble") are dropped in
    // favour of one clean pedal under the lifted melody + mid-register chord.
    // Strong-calm atmo ("pomaly letny sen") skips the deep pedal entirely — a calm
    // mood is vertical air & singing melody, not a low rumble. Even on a dark image,
    // the dream's mood overrides the painting's literal black-dot bass. Mid/agitato
    // moods keep the pedal as before.
    const _suppressBass = (atmoE!=null && atmoE<0.30);
    if(bassNotes.length && !_suppressBass){
      const darkBassM = Math.max(24, 24 + ((barPCs[0]-0+12)%12)); // C1 octave (deep but clear)
      const bv = Math.round(Math.min(...bassNotes.map(n=>n.v||70)) * 0.7); // softer than source
      if(!accomp.some(n=>n.m===darkBassM) && melActual!==darkBassM){
        accomp.push({ m:darkBassM, v:Math.max(28,Math.min(80,bv)), durMs:noteDur, bass:true });
      }
    }
    // ── WHITE = CLARITY + SPACE ──────────────────────────────────────────────
    // A markant white shape (Chagall's luminous figure on cobalt) should read as
    // a clear, open, ringing tone that stands out by being UNCLUTTERED — not by
    // being loud. So when the melody is white: thin the accompaniment hard (keep
    // at most the single most-supportive low voice), drop any doubled/dense mid
    // voices, and add ONE open perfect fifth below the melody for a bell-like,
    // resonant halo. Pull accompaniment velocity down so the white note floats
    // clearly above a quiet, open backing rather than inside a full chord.
    if(isWhiteMel && !ev._melRest){
      // keep only the lowest existing voice as a soft anchor, soften it
      accomp.sort((a,b)=>a.m-b.m);
      const anchor = accomp.length ? [{...accomp[0], v:Math.max(22,Math.round((accomp[0].v||50)*0.6))}] : [];
      // open perfect fifth below the white melody → bell/halo, no dense thirds
      const fifthM = melActual-7;
      const halo = (fifthM>=40) ? [{ m:fifthM, v:Math.max(20,Math.round(melody.v*0.45)), durMs:noteDur, bass:false }] : [];
      accomp = [...anchor, ...halo].filter(n=>n.m!==melActual);
    }
    ev.n = ev._melRest ? [...accomp] : [melody, ...accomp];
    if(ev._melRest && ev.n.length===0) ev.n=[melody]; // never fully silent
  }
  // Final melodic resolution: land the last sounding note on the tonic so the
  // V→I cadence completes melodically too (the ear hears "home"). We move the
  // top voice of the last non-empty event to the nearest tonic pitch within the
  // melody band, keeping its velocity.
  for(let i=evts.length-1;i>=0;i--){
    if(evts[i].n.length){
      const tonicPc=scalePCs[0];
      // Find the melody voice explicitly (not just n[0] which may be a
      // top-voice accompaniment note after MERGE re-sorts by MIDI).
      let melIdx = evts[i].n.findIndex(n=>n._melody);
      if(melIdx < 0) melIdx = 0;                    // fallback: first note
      const mel = evts[i].n[melIdx];
      let tm=tonicPc; while(tm<MEL_MIN) tm+=12; while(tm>MEL_MAX) tm-=12;
      // nearest tonic octave to where the melody currently is
      const cands=[tm-12,tm,tm+12].filter(m=>m>=MEL_MIN-12&&m<=MEL_MAX+12);
      tm=cands.reduce((a,b)=>Math.abs(b-mel.m)<Math.abs(a-mel.m)?b:a);
      evts[i].n[melIdx]={...mel, m:tm};
      break;
    }
  }

  // ─── PIANO TECHNIQUE: TIED NOTES ───────────────────────────────────
  // A real pianist does NOT re-strike a key that's already ringing. If a chord's
  // note matches a previous chord's note (same MIDI, just struck), keep it tied:
  // drop the new onset's velocity hard so it sounds like the previous note simply
  // sustained through, instead of trieskanie (block-strike every chord). Signal:
  // exact MIDI match against the most recent playable event.
  for(let i=1;i<evts.length;i++){
    const ev=evts[i]; if(!ev.n || !ev.n.length || ev._playable===false) continue;
    // Find previous playable event
    let prev=null; for(let k=i-1;k>=0;k--){ if(evts[k] && evts[k].n && evts[k].n.length && evts[k]._playable!==false){ prev=evts[k]; break; } }
    if(!prev) continue;
    const prevMidis=new Set(prev.n.map(n=>n.m));
    ev.n=ev.n.map(n=>{
      if(prevMidis.has(n.m)){
        // Tied: barely audible re-attack (the previous note still rings). Keep
        // duration so harmonic content remains in the cell.
        return {...n, v:Math.max(6, Math.round((n.v||64)*0.10)), _tied:true};
      }
      return n;
    });
  }

  // ─── PIANO TECHNIQUE: ARPEGGIO (per-note offsetMs) ─────────────────────
  // Vivid / charged chords are rolled bottom-up (low note first, top last), the
  // classic pianistic gesture. Speed scales with the cell's emotional charge:
  // very vivid → fast roll (25ms gap, Lisztian), moderately vivid → slow roll
  // (60ms, Chopin balada). Calm cells stay block-chord (no offset). Signal:
  // chord size ≥ 3 AND _chroma above per-piece median. Bass+melody anchor (0ms).
  {
    // Per-piece chroma threshold: rolled chords are the upper half of charge.
    const chromaVals=evts.map(e=>e._chroma||0).filter(c=>c>0).sort((a,b)=>a-b);
    const chromaMed=chromaVals.length?chromaVals[Math.floor(chromaVals.length*0.55)]:0;
    for(const ev of evts){
      if(!ev.n || ev.n.length<3 || ev._playable===false) continue;
      if((ev._chroma||0) < chromaMed) continue;
      // Roll speed: fast on very vivid, slow on moderate.
      const charge=Math.min(1, (ev._chroma||0)/(chromaMed*2));
      const gap = Math.round(25 + (1-charge)*35);   // 25ms (vivid) … 60ms (moderate)
      // Sort low→high. Melody (top voice) lands LAST so the line still sings on top.
      const sorted=[...ev.n].sort((a,b)=>a.m-b.m);
      const offsetByM=new Map();
      sorted.forEach((n,idx)=>{ offsetByM.set(n.m, idx*gap); });
      ev.n=ev.n.map(n=>({...n, offsetMs:offsetByM.get(n.m)||0}));
    }
  }

  // ─── PIANO TECHNIQUE: MELODY REPETITION ───────────────────────────────────
  // Tied notes (above) make a repeated MELODY pitch sound like one sustained
  // note. That is right for lyrical / calm passages — but in a VIVID passage a
  // pianist instead RE-STRIKES the repeated melody note crisply (a deliberate
  // repeated-note figure, think Liszt's repeated octaves). Signal: the top voice
  // (highest non-bass = the melody) carries the SAME MIDI across two or more
  // adjacent playable chords AND the cell is vivid (_chroma ≥ per-piece median).
  // We OVERRIDE the tie on that top note only (restore a clear attack), leaving
  // calm repeats tied. Runs AFTER tied notes (so it can override) and BEFORE the
  // merge — and only where the chords are NOT identical PC-sets (identical sets
  // are handled by merge/tremolo, not re-struck here). Inner/bass ties untouched.
  {
    const chromaVals2=evts.map(e=>e._chroma||0).filter(c=>c>0).sort((a,b)=>a-b);
    const chromaMed2=chromaVals2.length?chromaVals2[Math.floor(chromaVals2.length*0.55)]:0;
    // Identify melody by explicit flag first; fall back to highest non-bass.
    const _melMidi=ns=>{
      const flagged=ns.find(n=>n._melody);
      if(flagged) return flagged.m;
      const nb=ns.filter(n=>!n.bass);
      if(!nb.length) return null;
      return nb.reduce((a,b)=>b.m>a.m?b:a).m;
    };
    const _pcKey=ns=>{ const s=new Set(); for(const n of ns) s.add(((n.m%12)+12)%12); return [...s].sort((a,b)=>a-b).join(','); };
    // Walk playable events in order, tracking the previous playable event.
    let prevEv=null;
    for(let i=0;i<evts.length;i++){
      const ev=evts[i];
      if(!ev.n || !ev.n.length || ev._playable===false) continue;
      if(prevEv){
        const tm=_melMidi(ev.n), pm=_melMidi(prevEv.n);
        const vivid=(ev._chroma||0)>=chromaMed2;
        const sameChord=_pcKey(ev.n)===_pcKey(prevEv.n);   // identical → leave to merge
        if(tm!=null && tm===pm && vivid && !sameChord){
          // Re-strike the melody: restore a clear attack on the tied melody note.
          ev.n=ev.n.map(n=>{
            if(n.m===tm && n._tied){
              const {_tied,...rest}=n;
              // crisp repeated note — slightly under a fresh strike so it reads
              // as a repeat, not a new phrase. Recover a real velocity from the
              // 10% tie (×8 ≈ back to ~0.8 of original), clamped.
              return {...rest, v:Math.max(40,Math.min(118,Math.round((n.v||8)*8))), _melRepeat:true};
            }
            return n;
          });
        }
      }
      prevEv=ev;
    }
  }

  // Merge consecutive chords with the SAME pitch-class set (strict). After merging,
  // velocity = mean of the group, voicing = clean PC set (one voice per PC at the
  // nearest octave to the group mean), so a long held plane isn't denser than any
  // one of its sources. Soft (2/3) merge was tried and lost Liszt's harmonic motion.
  const chordKey=ns=>{
    if(!ns.length) return '';
    const pcs=new Set();
    for(const n of ns) pcs.add(((n.m%12)+12)%12);
    return [...pcs].sort((a,b)=>a-b).join(',');
  };
  const MAX_RUN=32;                                // up to ~6s held — real legato planes
  let mi=0;
  while(mi<evts.length){
    const key=chordKey(evts[mi].n);
    if(!key){mi++;continue;}
    let mj=mi+1;
    while(mj<evts.length&&chordKey(evts[mj].n)===key)mj++;
    let k=mi;
    let _prevBlockBright=null;                      // for block-to-block micro-drift within this plane
    let _planeBlockIdx=0;                            // ordinal of this merged block inside the plane
    while(k<mj){
      const groupLen=Math.min(MAX_RUN,mj-k);
      if(groupLen>1){
        // Mean velocity across the group, mean MIDI of each PC across the group
        // (placed at the nearest octave to the group's anchor) — the held chord
        // reflects the WHOLE plane, not just its first onset.
        const meanVel=(()=>{ let s=0,c=0; for(let x=k;x<k+groupLen;x++) for(const n of evts[x].n){ s+=(n.v||64); c++; } return c?Math.round(s/c):64; })();
        const pcMids=new Map(); // pc -> [midis...]
        const pcIsMel=new Set();  // PCs that carried the _melody flag in any source event
        for(let x=k;x<k+groupLen;x++) for(const n of evts[x].n){
          const pc=((n.m%12)+12)%12;
          if(!pcMids.has(pc)) pcMids.set(pc,[]);
          pcMids.get(pc).push(n.m);
          if(n._melody) pcIsMel.add(pc);
        }
        const template=evts[k].n[0]||{durMs:300};
        const cleanN=[];
        for(const [pc,mids] of pcMids){
          const avgM=mids.reduce((a,b)=>a+b,0)/mids.length;
          let m=Math.round(avgM); while(((m%12)+12)%12!==pc) m+=(((m%12)+12)%12<pc?1:-1);
          const isBass=evts[k].n.some(n=>((n.m%12)+12)%12===pc && n.bass);
          const out={...template, m, v:meanVel, bass:isBass};
          if(pcIsMel.has(pc)) out._melody = true;
          cleanN.push(out);
        }
        cleanN.sort((a,b)=>b.m-a.m);
        evts[k].n=cleanN;
        evts[k]._runLen=groupLen;
        // ─── PLANE TEXTURE (drives technique variation downstream) ────────────
        // A big "same" plane (Chagall's blue field) is never perfectly uniform —
        // its cells drift in brightness/chroma. Capture each merged BLOCK's own
        // average brightness + chroma + saliency, and how much it DRIFTED from
        // the previous block of this plane. Downstream the tremolo/roll pass uses
        // these so consecutive blocks of one field don't all play the identical
        // gesture — the technique morphs as the plane's own micro-variation does
        // (fully deterministic: same image → same drift → same morph).
        {
          let bs=0,bc=0,cs=0,ss=0;
          for(let x=k;x<k+groupLen;x++){
            const e=evts[x];
            if(e._bright!=null){ bs+=e._bright; bc++; }
            cs+=(e._chroma||0);
            ss+=(rawInt[x]||0);
          }
          const blockBright=bc?bs/bc:0;
          evts[k]._planeBright=blockBright;
          evts[k]._planeChroma=cs/groupLen;
          evts[k]._planeSal=ss/groupLen;
          evts[k]._planeBlockIdx=_planeBlockIdx;
          evts[k]._planeDrift=(_prevBlockBright==null)?0:(blockBright-_prevBlockBright);
          _prevBlockBright=blockBright;
          _planeBlockIdx++;
        }
        for(let x=k+1;x<k+groupLen;x++)evts[x]._playable=false;
      }
      k+=groupLen;
    }
    mi=mj;
  }
  // ─── PIANO TECHNIQUE: SUSTAINED-PLANE VARIATION ───────────────────────────
  // A long held plane (Chagall's blue field) sounds dead — and a per-block
  // gesture that stays CONSTANT for ~6s still reads as "the same thing", because
  // a monochrome field gives almost no internal brightness/chroma contrast to
  // vary against. So we don't rely on image contrast here. Instead every long
  // block gets an INTERNAL ARC the player unfolds OVER the hold: the re-strike
  // tempo glides (accel or rit), the chord periodically lifts its top voice by an
  // octave / fifth and falls back (a slow inner shimmer of register), and the
  // loudness breathes. Adjacent blocks get DIFFERENT arcs (derived from the
  // block's ordinal + its position in the piece), so one big blue field keeps
  // moving and never repeats. Fully deterministic (same image → same arcs).
  const TREMOLO_RUN=16;       // ≥ this run length → a sustained, evolving plane
  {
    // Collect the long blocks in order so each gets a distinct, evolving arc.
    const longIdx=[];
    for(let i=0;i<evts.length;i++){
      const ev=evts[i];
      if(ev._playable===false) continue;
      if((ev._runLen||0)>=TREMOLO_RUN) longIdx.push(i);
    }
    const total=longIdx.length||1;
    longIdx.forEach((i,ord)=>{
      const ev=evts[i];
      ev._tremolo=true;
      // Deterministic per-block seed from the block's CONTENT (its pitches +
      // index + length). Same image → same seed → same "random" feel, but every
      // block's seed differs, so the player's jitter never repeats a pattern.
      let seed=(i*2654435761)>>>0;
      seed=(seed^(ev._runLen||0)*40503)>>>0;
      for(const n of ev.n){ seed=(seed^(((n.m|0)+131)*2246822519))>>>0; seed=(seed<<13|seed>>>19)>>>0; }
      ev._tremSeed=seed>>>0;
      // A small deterministic 0..1 from the seed, to de-pattern the arc params
      // (so it's NOT just ord%2 alternation — that itself reads as a cycle).
      const sr=((seed>>>8)&0xffff)/0xffff;          // 0..1
      const sr2=((seed>>>20)&0xfff)/0xfff;          // 0..1 decorrelated
      // Position of this block within the whole piece (0..1) and within its run.
      const piecePos=longIdx.length>1?ord/(longIdx.length-1):0;
      // Walk values blend a smooth contour with the content seed so neighbours
      // differ AND the field has a slow overall drift (not a fixed 4-theme loop).
      const w =0.5*((Math.sin(ord*1.7)+1)/2) + 0.5*sr;
      const w2=0.5*((Math.sin(ord*0.9+1.3)+1)/2) + 0.5*sr2;
      // Base re-strike tempo glides across the piece, plus seed jitter so no two
      // blocks share a nominal tempo.
      // ATMO-aware: calm pieces breathe slower (re-strikes spaced 1.4× wider —
      // a serene plane sounds like a held bell, not a rapid tremolo). Frantic
      // pieces compress to 0.80× (more urgent shimmer). Mid mood keeps the
      // original nominal.
      const _atmoTremScale = atmoE!=null
        ? (atmoE<0.5 ? (1.0 + 0.4*(0.5-atmoE)/0.5)        // 1.0 → 1.4 toward serene
                     : (1.0 - 0.2*(atmoE-0.5)/0.5))       // 1.0 → 0.8 toward frantic
        : 1.0;
      const baseMs = (230 - 70*piecePos - 50*w) * _atmoTremScale;
      ev._tremoloMs = Math.round(Math.max(95, baseMs));
      // ACCEL or RIT — direction chosen by the seed (not ord parity), magnitude
      // varies, so the push/relax pattern is irregular across the field.
      const accel = sr<0.5;
      ev._tremEndRatio = accel ? (0.58 + 0.22*w) : (1.22 + 0.40*w2); // ~0.58..0.8 | 1.22..1.62
      // Register shimmer: octave / fifth / none, chosen by seed.
      // Calm ATMO biases away from aggressive octave jumps — a serene plane
      // shimmers within a small interval, not by leaping a whole octave.
      let liftPick = (sr2>0.62) ? 12 : (sr2>0.30) ? 7 : 0;
      if(atmoE!=null && atmoE<0.30 && liftPick===12) liftPick = 7;    // octave → fifth in serene
      if(atmoE!=null && atmoE<0.15 && liftPick===7)  liftPick = 0;    // fifth → none in very serene
      ev._tremLift = liftPick;
      ev._tremLiftCycles = 1 + Math.round(2*w2);              // 1..3 lifts across the hold
      // Loudness breathing depth. ATMO-aware: calm planes breathe gently
      // (depth ×0.6), frantic planes pulse harder (×1.2). Mid mood neutral.
      const _atmoSwellScale = atmoE!=null
        ? (atmoE<0.5 ? (1.0 - 0.4*(0.5-atmoE)/0.5)        // 1.0 → 0.6 toward serene
                     : (1.0 + 0.2*(atmoE-0.5)/0.5))       // 1.0 → 1.2 toward frantic
        : 1.0;
      ev._tremSwell = (0.16 + 0.24*w) * _atmoSwellScale;
      // Rolled (arpeggiated) re-strikes on a seeded subset of blocks for texture.
      ev._planeGesture = (sr>0.68) ? 'roll' : 'arc';
    });
  }
  // ─── Rhythmic phrasing pass (deterministic — driven by image content only) ──
  // The raw scan emits a uniform 8th-note grid, which sounds mechanical. Without
  // touching timing/index-stepping (the painting reveal depends on it), we shape
  // DYNAMICS and ONSET DENSITY using each cell's saliency so a pulse and some
  // breathing emerge:
  //   • downbeats (every BEAT cells) are accented,
  //   • weak off-beat onsets are softened,
  //   • genuinely dull, non-downbeat onsets occasionally become short rests,
  //     capped so the music never drops into silence.
  // All choices come from pixel-derived saliency + position, so the result is
  // fully deterministic (re-rendering the same image gives the same phrasing).
  const BEAT=4;                                  // 4 cells per "beat" → downbeat feel
  const sal=evts.map(ev=>ev.n.reduce((a,n)=>a+(n.v||0),0)); // saliency = summed velocity
  const onsetSal=sal.filter((_,i)=>evts[i].n.length && evts[i]._playable!==false).slice().sort((a,b)=>a-b);
  // Rest density now spans a WIDE range so calm and lively paintings differ a
  // lot: a serene canvas breathes heavily (rests ~0.50 — long open spaces), a
  // driving one fills in (~0.14 — busy, propulsive) but still keeps a floor of
  // space so it never becomes a machine-gun/morse patter. Driven by rhythmDrive
  // (energy + valence) rather than raw energy alone.
  const restPct = 0.50 - 0.36*rhythmDrive;       // calm→0.50, wild→0.14
  const lowSal=onsetSal.length?onsetSal[Math.floor(onsetSal.length*Math.max(0.18,restPct))]:0;
  const medSal=onsetSal.length?onsetSal[Math.floor(onsetSal.length/2)]:0;
  // Calm paintings may hold up to THREE consecutive rests; lively ones cap at one
  // so the line keeps moving. (Atmo influence flows through rhythmDrive, not here.)
  const maxRestRun = rhythmDrive>0.6 ? 1 : rhythmDrive>0.35 ? 2 : 3;
  let sinceSound=0;                              // consecutive-rest guard
  let lastSoundIdx=-99;                          // anti-telegraph: spacing of onsets
  for(let i=0;i<evts.length;i++){
    const ev=evts[i];
    if(!ev.n.length){ sinceSound++; continue; }
    if(ev._playable===false){ continue; }        // merge-continuation: leave as held
    const isDownbeat=(i%BEAT)===0;
    const isBarStart=(i%BAR_EVENTS)===0;          // first beat of a bar = chord change
    const s=sal[i];
    // Breath-rest: a quiet, off-beat onset over a calm stretch becomes a rest.
    // Never on a downbeat (keeps the pulse); consecutive rests capped.
    if(!isDownbeat && s<=lowSal && sinceSound<maxRestRun){
      ev._playable=false; ev._rest=true; sinceSound++; continue;
    }
    // Anti-telegraph spacing: if the last several onsets were all immediately
    // adjacent (no gaps), a quiet off-beat note is dropped to open space — this
    // breaks up any run of identical-rhythm hits before it reads as a tick/morse.
    if(!isDownbeat && (i-lastSoundIdx)===1 && s<=medSal && sinceSound<maxRestRun){
      // only if the few preceding cells were also a solid run
      let run=0; for(let b=i-1;b>=0&&b>i-5;b--){ if(evts[b].n.length&&evts[b]._playable!==false){run++;}else break; }
      if(run>=4){ ev._playable=false; ev._rest=true; sinceSound++; continue; }
    }
    sinceSound=0; lastSoundIdx=i;
    // ── DYNAMICS / GROOVE ──────────────────────────────────────────────────
    // Calm pieces keep the old wave-like, barely-there shaping (pulse implied).
    // As rhythmDrive rises the metric grid becomes AUDIBLE: bar-starts and
    // downbeats are accented hard, weak beats duck, and — at high drive — an
    // OFF-BEAT SYNCOPATION accent lands on the cell just before a downbeat (the
    // "and" of the beat), giving propulsion/groove. The accent depth scales with
    // drive so a serene canvas stays smooth and a fierce one really moves.
    const beatPos = i % BEAT;                     // 0 = downbeat … BEAT-1 = last weak cell
    const isSyncope = beatPos === (BEAT-1);       // the "and" right before next downbeat
    // Accent depth: 0.2 (calm) … 0.9 (driving). Far stronger than the old ≤0.2.
    const accentDepth = 0.2 + 0.7*rhythmDrive;
    let mul=1;
    if(isBarStart)      mul *= 1 + 0.18*accentDepth;   // chord turn — strongest
    else if(isDownbeat) mul *= 1 + 0.12*accentDepth;   // on-beat pulse
    else if(isSyncope && rhythmDrive>0.5) mul *= 1 + 0.14*accentDepth; // groove push (lively only)
    else                mul *= 1 - 0.10*accentDepth;   // weak cells duck (deeper at high drive)
    if(s>medSal) mul *= 1+0.06*rhythmDrive; else mul *= 1-0.05*rhythmDrive; // salient cells lift more when lively
    if(mul!==1){
      ev.n=ev.n.map(n=>({...n,v:Math.max(22,Math.min(120,Math.round((n.v||64)*mul)))}));
    }
  }
  // ─── Per-voice articulation (deterministic) ────────────────────────────────
  // A real pianist does not give every voice the same length. The MELODY (top
  // voice) sings — held long, legato — while the BASS is plucked short and
  // detached (staccato) so it punctuates without muddying the texture; inner
  // (mid) voices stay neutral. Signal: a note's role within its own chord —
  // the highest non-bass pitch is the melody, `n.bass` is the bass, the rest
  // are mid.
  //
  // The texture-driven artMul (smooth=legato, busy=staccato) that used to
  // live here has been removed — the downstream Articulation pass detects
  // edges with a music-theory signal (chord-sig change + chroma jump for
  // staccato, same chord + low chroma delta for legato) which is more
  // accurate than raw saliency delta. Stacking both was producing dur ×
  // 0.45 × 0.45 = ×0.20 (inaudible) on busy edges and ×1.30 × 1.6 × 1.4 =
  // ×2.91 (overlapping) on smooth top voices.
  const durFloor = Math.round(140 - 70*rhythmDrive);  // 140ms calm … 70ms driving
  for(let i=0;i<evts.length;i++){
    const ev=evts[i];
    if(!ev.n.length||ev._playable===false) continue;
    // Find the melody voice: prefer the explicit _melody marker, fall back
    // to highest non-bass MIDI when none is flagged (Alberti expansion etc.).
    const _melIdx = ev.n.findIndex(n=>n._melody);
    let _melM = -Infinity;
    if(_melIdx >= 0){
      _melM = ev.n[_melIdx].m;
    } else {
      const _nb = ev.n.filter(n=>!n.bass);
      _melM = _nb.length ? Math.max(..._nb.map(n=>n.m)) : -Infinity;
    }
    ev.n=ev.n.map(n=>{
      let voiceMul=1;
      if(n.bass)              voiceMul=0.55;   // bass: short, detached
      else if(n.m===_melM)    voiceMul=1.4;    // melody: long, singing
      // mid voices → 1 (neutral)
      const durMs=Math.max(durFloor, Math.round((n.durMs||250)*voiceMul));
      return {...n, durMs};
    });
  }
  // ─── COMPOSITION PASS (form & dramaturgy) ──────────────────────────────────
  // Everything above shapes the piece LOCALLY (per cell / per bar). This final
  // pass gives it a SHAPE AS A WHOLE — the things that separate a "composed"
  // piece from a faithful scan: a recurring motif, a dynamic arc, a register
  // that opens and closes, breathing phrases, and an intro/outro frame. All
  // deterministic (same image → same form). Calmer pieces get a more pronounced
  // arc/phrasing (ambient dramaturgy); driving pieces keep their momentum.
  {
    // Indices of events that actually sound (have a melody onset we can read).
    const soundIdx=[];
    for(let i=0;i<evts.length;i++){ if(evts[i].n.length && evts[i]._playable!==false && !evts[i]._melRest) soundIdx.push(i); }
    if(soundIdx.length>=8){
      const calm = 1 - rhythmDrive;             // 1 serene … 0 driving — depth of dramaturgy
      // ── (1) MOTIF — theme & return ───────────────────────────────────────
      // Capture the interval shape of the first phrase's top voice (a short 4-note
      // melodic cell), then RE-STATE it — transposed into the current bar's chord
      // — at the start of selected later bars. The line still follows the image,
      // but a familiar shape returns, giving the piece a theme rather than a drift.
      const MOTIF_LEN=4;
      // Helper: find the melody note index in an event (by flag, fallback to first)
      const _melI = ns => {
        const i = ns.findIndex(n=>n._melody);
        return i >= 0 ? i : 0;
      };
      const motifSrc=soundIdx.slice(0,MOTIF_LEN).map(i=>{
        const ns=evts[i].n;
        return ns[_melI(ns)].m;
      });
      // intervals between consecutive motif notes (semitones), snapped to scale later
      const motifIv=[]; for(let k=1;k<motifSrc.length;k++) motifIv.push(motifSrc[k]-motifSrc[k-1]);
      const totalBarsC=Math.max(1,Math.ceil(evts.length/BAR_EVENTS));
      // Re-state the motif at the head of bars 2,4,6… (every 2nd bar), but not the
      // first bar (that's where it's born) nor the last two (cadence is protected).
      // Strength of the restatement fades with drive so a busy piece only hints it.
      const restate=0.55 + 0.35*calm;           // how strongly we pull toward the motif shape
      for(let bar=1; bar<totalBarsC-2; bar+=2){
        const barHeadEvents=[];
        for(const i of soundIdx){ if(Math.floor(i/BAR_EVENTS)===bar) barHeadEvents.push(i); if(barHeadEvents.length>=MOTIF_LEN) break; }
        if(barHeadEvents.length<2) continue;
        // anchor = the bar's first melody note (keeps it in the image's register)
        const _ai = _melI(evts[barHeadEvents[0]].n);
        let anchor=evts[barHeadEvents[0]].n[_ai].m, acc=anchor;
        for(let k=0;k<barHeadEvents.length;k++){
          const ei=barHeadEvents[k];
          const mi = _melI(evts[ei].n);
          const mel=evts[ei].n[mi];
          // target pitch = motif shape applied from the anchor, snapped to scale
          if(k>0 && motifIv[k-1]!=null){ acc=acc+motifIv[k-1]; }
          let target=snapToScale(acc);
          // blend image-following pitch with the motif target (restate weight)
          const blended=Math.round(mel.m*(1-restate) + target*restate);
          const snapped=snapToScale(blended);
          // keep within the melody band
          let mm=snapped; while(mm<MEL_MIN-12) mm+=12; while(mm>MEL_MAX+12) mm-=12;
          evts[ei].n[mi]={...mel, m:mm};
          acc=mm;
        }
      }
      // ── (2) DYNAMIC ARC — whole-piece swell ──────────────────────────────
      // A gentle rise to a peak around 65% then a release, laid over the entire
      // piece so it has a beginning, a climax and a wind-down instead of a flat
      // loudness. Depth scales with calm (ambient pieces breathe more; driving
      // pieces stay punchy with a shallower arc). cos-shaped, peak at 0.65.
      const PEAK=0.65;
      const arcDepth=0.18 + 0.22*calm;          // ±18%…40% of velocity
      const arcAt=(p)=>{
        // 0 at the very start, 1 at PEAK, easing back to ~0.35 at the end
        const x = p<=PEAK ? p/PEAK : 1-(p-PEAK)/(1-PEAK)*0.65;
        return 1 + arcDepth*(x-0.5)*2*0.5;      // centred so mid≈1, peak≈1+arcDepth/2
      };
      // ── (4)→ phrasing prep: 4-bar phrase, soft decрescendo + slight lengthen on
      // each phrase's LAST bar (a musical "comma"). ──
      const PHRASE_BARS=4;
      const phraseEndDepth=0.10 + 0.14*calm;    // how much the phrase tail eases back
      // ── (3) REGISTER / DENSITY as shape ──────────────────────────────────
      // Near the arc edges (intro & outro thirds) thin the texture; near the peak
      // allow the existing fuller voicing to stand. We only TRIM toward the edges
      // (never add) so this never fights voiceCap: drop the quietest accompaniment
      // voice when we're in the opening or closing 25% of the piece.
      const N=evts.length;
      for(let i=0;i<N;i++){
        const ev=evts[i];
        if(!ev.n.length||ev._playable===false) continue;
        const p=i/Math.max(1,N-1);              // 0..1 position in piece
        // arc gain
        let g=arcAt(p);
        // phrase comma: last bar of each 4-bar phrase eases back & rings a touch
        const barNo=Math.floor(i/BAR_EVENTS);
        const isPhraseTail=(barNo%PHRASE_BARS)===(PHRASE_BARS-1);
        if(isPhraseTail) g*=1-phraseEndDepth;
        // apply velocity arc
        if(g!==1){ ev.n=ev.n.map(n=>({...n, v:Math.max(20,Math.min(120,Math.round((n.v||64)*g)))})); }
        // phrase tail also lengthens slightly (the comma's little ritardando feel)
        if(isPhraseTail){ ev.n=ev.n.map(n=>({...n, durMs:Math.round((n.durMs||250)*(1+0.18*calm))})); }
        // register thinning toward the edges (intro/outro): drop quietest non-bass
        // accompaniment voice so the frame is sparse and the middle is full.
        const edge = p<0.25 ? (0.25-p)/0.25 : p>0.78 ? (p-0.78)/0.22 : 0; // 0 middle … 1 extreme edge
        if(edge>0.5 && ev.n.length>2){
          const nonBass=ev.n.filter(n=>!n.bass);
          if(nonBass.length>2){
            const quietest=nonBass.reduce((a,b)=>((b.v||0)<(a.v||0)?b:a));
            ev.n=ev.n.filter(n=>n!==quietest);
          }
        }
      }
      // ── (5) INTRO / OUTRO FRAME ───────────────────────────────────────────
      // INTRO: the first 1–2 sounding events become a soft chord/pedal WITHOUT the
      // melody (a breath before the tune enters). Keep the lowest 2 voices, drop
      // the melody so the theme arrives a beat later. OUTRO: extend the final
      // sounding chord into a long ring (a decaying resolution, not a hard stop).
      const introCount = calm>0.5 ? 2 : 1;
      for(let c=0;c<introCount && c<soundIdx.length-4;c++){
        const ei=soundIdx[c];
        const ev=evts[ei];
        if(ev.n.length>=2){
          const low=[...ev.n].sort((a,b)=>a.m-b.m).slice(0,2)
            .map(n=>({...n, v:Math.max(20,Math.round((n.v||50)*0.7)), durMs:Math.round((n.durMs||300)*1.4)}));
          ev.n=low;
        }
      }
      // OUTRO ring on the last sounding event.
      for(let i=evts.length-1;i>=0;i--){
        if(evts[i].n.length && evts[i]._playable!==false){
          evts[i].n=evts[i].n.map(n=>({...n, durMs:Math.round((n.durMs||400)*(1.6+0.8*calm))}));
          break;
        }
      }
    }
  }
  // ─── Articulation — staccato on edges, legato on smooth passages ─────────
  // Image edges (where a chord-signature changes AND the chroma jumps) are
  // perceptually the "consonants" of the painting — sharp transitions that
  // should sound like detached, articulated keystrokes (staccato). Smooth
  // monochrome passages (same chord, low chroma delta) are the "vowels" —
  // long sustained legato. Mid-edges read as natural portato (untouched).
  // This shape gives the scan the breathing micro-articulation of a real
  // pianist instead of every note being held for the same fixed sustain.
  {
    function chordSigArt(ev){
      if(!ev || !ev.n || !ev.n.length) return '';
      const pcs = ev.n.map(n => n.m%12);
      pcs.sort((a,b)=>a-b);
      const out=[]; for(const p of pcs) if(out[out.length-1]!==p) out.push(p);
      return out.join(',');
    }
    const sigs = evts.map(chordSigArt);
    const STAC_MUL = 0.45;          // hard edge → short, detached
    const LEG_MUL  = 1.30;          // smooth gradient → long, connected
    for(let i=0; i<evts.length; i++){
      const ev = evts[i];
      if(!ev.n || !ev.n.length) continue;
      const c0 = i>0 ? (evts[i-1]._chroma || 0) : (ev._chroma || 0);
      const c1 = ev._chroma || 0;
      const c2 = i<evts.length-1 ? (evts[i+1]._chroma || 0) : c1;
      const dChromaPrev = Math.abs(c1 - c0);
      const dChromaNext = Math.abs(c2 - c1);
      const maxDChroma = Math.max(dChromaPrev, dChromaNext);
      const sigChangePrev = i>0 && sigs[i] && sigs[i] !== sigs[i-1];
      const sigChangeNext = i<evts.length-1 && sigs[i] && sigs[i+1] && sigs[i] !== sigs[i+1];
      let mul = 1.0;
      // Staccato: real edge — both the harmony AND the chroma jump
      if((sigChangePrev || sigChangeNext) && maxDChroma > 15){
        mul = STAC_MUL;
      }
      // Legato: smooth — same chord on both sides AND low chroma delta
      else if(!sigChangePrev && !sigChangeNext && maxDChroma < 8){
        mul = LEG_MUL;
      }
      // else portato/normal — keep dur as-is
      if(mul !== 1.0){
        ev.n = ev.n.map(n => ({...n, durMs: Math.round((n.durMs || 600) * mul)}));
        ev._articulation = (mul < 1) ? 'stac' : 'leg';   // marker for debug / future use
      }
    }
  }
  // ─── Bass-treble vertical character — left hand vs right hand feel ───────
  // The image has a top-to-bottom axis the way a keyboard has bass-to-treble.
  // Real piano writing exploits this: left hand grounds the harmony with full
  // chords in the bass register, right hand sings the melody with a single
  // line over light accompaniment in the treble. Our scan already maps the
  // pixel's LIGHTNESS to an octave (dark→low, light→high), but every event
  // gets voiced the same way regardless of WHERE on the canvas it sits.
  //
  // Fix: shape the voicing by vertical band position, leaving MIDI pitches
  // alone (so harmony, scale snap and existing octave logic are not
  // disturbed). Bottom third → bass character (full chord, +3 velocity for
  // weight). Top third → treble character (only top voice + 1 below dominates;
  // lower notes pulled −5 so the melody floats above thinner support). Middle
  // third → untouched, keeps the natural blend. Applied BEFORE voicing so the
  // top-voice +15 lift compounds on the treble band (melody really stands
  // forward) and is balanced by the bass band's full chord (grounded harmony).
  if(_nrBands >= 3){
    const trebleCut = Math.floor(_nrBands * 0.33);
    const bassCut   = Math.floor(_nrBands * 0.67);
    for(const ev of evts){
      if(!ev.n || ev.n.length < 2) continue;
      if(typeof ev.band !== 'number') continue;
      if(ev.band < trebleCut){
        // Treble: thin out lower voices so the melody sings above
        let melIdx = ev.n.findIndex(n => n._melody);
        if(melIdx < 0){
          melIdx = 0;
          for(let k=1; k<ev.n.length; k++) if(ev.n[k].m > ev.n[melIdx].m) melIdx = k;
        }
        ev.n = ev.n.map((n,k) => ({
          ...n,
          v: Math.max(20, Math.min(120, (n.v||64) + (k===melIdx ? 0 : -3)))
        }));
      } else if(ev.band >= bassCut){
        // Bass: full chord, slightly heavier overall (grounding weight)
        ev.n = ev.n.map(n => ({
          ...n,
          v: Math.max(20, Math.min(120, (n.v||64) + 2))
        }));
      }
      // middle band: untouched
    }
  }
  // ─── Voicing — bring the top voice forward as melody ─────────────────────
  // Keyboard music is heard "top-voice-as-melody" by default: the brain
  // picks the highest pitch in a chord and reads it as the tune, with the
  // lower notes as accompaniment. Here we lift the melody by +10 velocity
  // and pull the rest down by -3 to widen the contrast.
  //
  // Melody picking: prefer the explicit _melody flag set by MELODY
  // EXTRACTION upstream. Fall back to highest-MIDI only when no marker
  // exists (e.g. Alberti/shimmer expanded events that don't carry the
  // flag). The flag-first approach ensures voicing always boosts the
  // actual melodic line, never an accompaniment voice that happens to
  // sit higher than the melody.
  // Applied BEFORE dynamics so the voicing differential survives compression.
  for(const ev of evts){
    if(!ev.n || ev.n.length < 2) continue;
    let melIdx = ev.n.findIndex(n => n._melody);
    if(melIdx < 0){
      // Fallback: highest-MIDI voice
      melIdx = 0;
      for(let k=1; k<ev.n.length; k++) if(ev.n[k].m > ev.n[melIdx].m) melIdx = k;
    }
    ev.n = ev.n.map((n,k) => ({
      ...n,
      v: Math.max(20, Math.min(120, (n.v||64) + (k===melIdx ? 10 : -3)))
    }));
  }
  // ─── Octave doubling — forte bass gets a left-hand octave ────────────────
  // In dramatic piano writing the left hand often doubles the bass at the
  // octave below — Liszt, Rachmaninoff, the loud climaxes of Chopin — to
  // give weight to forte moments. We replicate that here: when an event in
  // the lower half of the image plays strong (vel ≥ 85), find its lowest
  // MIDI note and add its octave-down sibling (m−12) at slightly softer
  // velocity. Only fires below the band midpoint (bass register where
  // doubling is musically meaningful — high treble doubling would crowd
  // the melody) and only when the octave still sits in the audible piano
  // range (≥ MIDI 24).
  //
  // Calm ATMO override: strong-calm moods ("pomaly letny sen") already
  // suppress the deep bass pedal upstream — adding octave doubling there
  // would contradict the mood. Skip octave doubling when atmoE < 0.30 so
  // the calm character stays vertical and airy, not grounded with weight.
  if(_nrBands >= 2 && !(atmoE!=null && atmoE<0.30)){
    const bassThreshold = Math.floor(_nrBands * 0.5);   // bottom half of image
    for(const ev of evts){
      if(!ev.n || !ev.n.length) continue;
      if(typeof ev.band !== 'number' || ev.band < bassThreshold) continue;
      // Find loudest note in the chord to test forte trigger
      let maxV = 0;
      for(const n of ev.n) if((n.v || 0) > maxV) maxV = n.v || 0;
      if(maxV < 85) continue;
      // Find lowest MIDI note (the bass line)
      let lowIdx = 0;
      for(let k=1; k<ev.n.length; k++) if(ev.n[k].m < ev.n[lowIdx].m) lowIdx = k;
      const low = ev.n[lowIdx];
      const octM = low.m - 12;
      if(octM < 24) continue;
      // Avoid duplicates (chord already contains the octave below)
      if(ev.n.some(n => n.m === octM)) continue;
      ev.n = [...ev.n, {
        m: octM,
        v: Math.max(20, Math.min(120, (low.v || 64) - 8)),
        durMs: low.durMs
      }];
      ev._octaveDoubled = true;
    }
  }
  // ─── Final dynamics: ATMO as centre + range, not flat multiplier ────────
  // Older model: dynScale (~0.55 for serene) collapsed ALL velocities toward
  // zero in calm pieces — that's what made everything sound like a stuck
  // slow-motion film. Forte accents got smashed down to the same range as
  // piano background, so the piece lost its musical contour entirely.
  //
  // New model treats ATMO as a CENTRE-OF-GRAVITY for the dynamic range,
  // plus a compression ratio that's gentler than the old flat scale:
  //
  //   calm   → centre = 50  (mp),  compress = 0.75  → forte still reaches ~85
  //   neutral → centre = 70 (mf),  compress = 1.00  → full range untouched
  //   intense → centre = 82 (f),   compress = 1.15  → expanded, dramatic
  //
  // The musical hierarchy survives because peaks stay relatively above the
  // background — they just sit at a different absolute level. A calm Monet
  // still has its visual climax painted as a clear musical climax, only
  // mezzo-forte instead of fortissimo. An intense Picasso has its quiet
  // moments still quieter than its loud ones, dramatically so.
  // dynE (image's own restlessness from contrast+busyness) shifts the
  // centre on top of ATMO so a calm-tagged BUSY painting lands slightly
  // brighter than a calm-tagged FLAT painting (image still has a voice).
  const _atmoCentre  = atmoE!=null ? (40 + atmoE*48) : 70;     // 40..88 by atmo
  const _imgCentreAdj = (dynE - 0.5) * 12;                       // image busyness ±6
  const dynCentre = Math.max(34, Math.min(92, Math.round(_atmoCentre + _imgCentreAdj)));
  const dynCompress = atmoE!=null
    ? (atmoE<0.5 ? (0.75 + 0.50*atmoE)            // 0.75 (serene) → 1.00 (neutral)
                 : (1.00 + 0.30*(atmoE-0.5)/0.5)) // 1.00 (neutral) → 1.30 (frantic)
    : 1.0;
  // Reference centre = "what the per-event computation assumed before scaling".
  // Without ATMO the per-pixel pipeline produces v ≈ 38..106 with avg ~70, so
  // 70 is the natural pre-shift centre. We compress around that, then shift
  // the result onto dynCentre.
  const PRE_CENTRE = 70;
  for(const ev of evts){
    if(!ev.n || !ev.n.length) continue;
    ev.n = ev.n.map(n => {
      const raw = n.v || 64;
      const compressed = PRE_CENTRE + (raw - PRE_CENTRE) * dynCompress;
      const shifted = compressed + (dynCentre - PRE_CENTRE);
      return {...n, v: Math.max(20, Math.min(120, Math.round(shifted)))};
    });
  }
  // ─── Image-chroma accents — sharp colour peaks become musical accents ────
  // The upstream COMPOSITION PASS already provides a whole-piece dynamic
  // arc (cos curve, peak around 65 %) and the Rhythmic phrasing pass adds
  // metric accents on downbeats/bar-starts. Both of those are RHYTHMIC /
  // STRUCTURAL. What was still missing is IMAGE-DRIVEN accents — when a
  // pixel cluster's saturation/chroma jumps far above its neighbours, that
  // mountain in the painting should be heard as a musical stress, not
  // smoothed out by the metric grid.
  //
  // Three tiers (kept gentle so they STACK safely with metric accents +
  // voicing without clipping velocity to 120 in dense passages). Top voice
  // bonus removed in Phase 4 — Voicing already lifts the top voice by +10
  // and per-voice articulation gives it ×1.4 duration, so further marcato
  // bonus on top was redundant emphasis.
  //   • delta > 30 vs lower neighbour → MARCATO  +6 velocity
  //   • delta 18..30                  → ACCENT   +3 velocity
  //   • delta 8..18                   → touch    +1 velocity
  //
  // Valence scales accent intensity (0.7..1.3): positive valence makes
  // peaks pop (bright/playful moods amplify dynamic variation), negative
  // valence smooths them (heavy/grief stays even, no jolts).
  const _accentValScale = 1 + 0.3 * valenceBias;
  for(let i=1; i<evts.length-1; i++){
    const c0 = evts[i-1]._chroma || 0;
    const c1 = evts[i]._chroma   || 0;
    const c2 = evts[i+1]._chroma || 0;
    const delta = Math.min(c1 - c0, c1 - c2);
    if(delta < 8) continue;
    const ev = evts[i];
    if(!ev.n || !ev.n.length) continue;
    let boost, marker;
    if(delta > 30){       boost = 6; marker = 'marc'; }
    else if(delta > 18){  boost = 3; marker = 'acc';  }
    else {                boost = 1; marker = '';     }
    boost = boost * _accentValScale;
    ev.n = ev.n.map(n => ({
      ...n,
      v: Math.max(20, Math.min(120, Math.round(n.v + boost)))
    }));
    if(marker) ev._accent = marker;
  }
  // ─── Tremolo — rapid 2-chord alternations on striped patterns ────────────
  // Op-art, Picasso stripes, Vasarely kinetic grids: paintings with rapid
  // alternation between two distinct colour regions. The literal scan plays
  // that as A B A B A — five attacks all at the same length, which sounds
  // like a marching beat. Real keyboard music renders this as TREMOLO: two
  // notes alternating with sub-beat speed, the ear hearing them as ONE
  // shimmering sound rather than five separate strokes.
  //
  // We detect runs of 4+ strict A-B-A-B alternations where the two
  // signatures differ in at least 2 pitch classes (so we don't trip on a
  // melody that happens to oscillate by a step). Anchors of the run (the
  // first and last A/B events) keep their full attack so the harmonic
  // motion reads cleanly; the events between get durMs ×0.5 and are
  // reduced to the TOP voice only — that gives the shimmer character of
  // a real piano tremolo (hands flickering between two notes), not the
  // marching equal-attack pattern of the literal scan.
  {
    function sigOf(ev){
      if(!ev || !ev.n || !ev.n.length) return '';
      const pcs = ev.n.map(n => n.m%12);
      pcs.sort((a,b)=>a-b);
      const out=[]; for(const p of pcs) if(out[out.length-1]!==p) out.push(p);
      return out.join(',');
    }
    function pcSetDiff(sigA, sigB){
      if(!sigA || !sigB) return 0;
      const a = new Set(sigA.split(',').map(Number));
      const b = new Set(sigB.split(',').map(Number));
      let diff = 0;
      a.forEach(p => { if(!b.has(p)) diff++; });
      b.forEach(p => { if(!a.has(p)) diff++; });
      return diff;
    }
    const TREM_MIN_ALT = 4;            // need ABABA (at least 4 transitions = 5 events) to call it tremolo
    const TREM_MIN_PC_DIFF = 2;        // signatures must differ in 2+ pitch classes
    let i = 0;
    while(i < evts.length - TREM_MIN_ALT){
      const sigA = sigOf(evts[i]);
      const sigB = sigOf(evts[i+1]);
      if(!sigA || !sigB || sigA === sigB || pcSetDiff(sigA, sigB) < TREM_MIN_PC_DIFF){
        i++; continue;
      }
      // Walk while strict ABAB alternation continues
      let j = i + 2;
      while(j < evts.length){
        const expected = (j % 2 === i % 2) ? sigA : sigB;
        if(sigOf(evts[j]) !== expected) break;
        j++;
      }
      const runLen = j - i;
      if(runLen >= TREM_MIN_ALT + 1){    // 5+ events of strict ABABA
        // Reshape inner events (skip first and last anchors) to tremolo shimmer
        for(let k = i+1; k < j-1; k++){
          const ev = evts[k];
          if(!ev.n || !ev.n.length) continue;
          // The shimmering note = melody if flagged, otherwise highest MIDI
          let melIdx = ev.n.findIndex(n=>n._melody);
          if(melIdx < 0){
            melIdx = 0;
            for(let m=1; m<ev.n.length; m++) if(ev.n[m].m > ev.n[melIdx].m) melIdx = m;
          }
          const top = ev.n[melIdx];
          const note = {
            m: top.m,
            v: Math.max(20, Math.min(120, Math.round((top.v || 64) - 4))),
            durMs: Math.round((top.durMs || 600) * 0.5)
          };
          if(top._melody) note._melody = true;
          ev.n = [note];
          ev._alternation = true;
        }
        i = j;
      } else {
        i++;
      }
    }
  }
  // ─── Alberti bass — classical accompaniment in calm passages ─────────────
  // Mozart, Haydn and early Beethoven render gentle harmonic sections with
  // an "Alberti bass" — instead of hammering the chord straight, the left
  // hand rotates through its notes in a fixed bass→top→middle→top cycle.
  // The harmony hangs (because all notes belong to the same chord) but the
  // music constantly moves, the classic ambient sparkle of the classical
  // sonata slow movement.
  //
  // Reads MERGED plane blocks (events carrying _runLen from the upstream
  // Merge pass): when a merged plane is 4–12 events long, has 3+ notes
  // and a soft top velocity (< 55), we EXPAND it back into a flowing
  // Alberti rotation. The remaining (still-merged) events keep their
  // _playable=false flag flipped back on with their assigned cycle note
  // so the player actually hears the rotation instead of one held chord.
  //
  // Longer or louder merged planes (12+, or louder than mp) keep their
  // sustained-plane gesture from the existing pipeline — the SUSTAINED-
  // PLANE VARIATION pass already shapes those tastefully.
  {
    const ALB_MIN_RUN = 4;
    const ALB_MAX_RUN = 12;
    const ALB_VEL_MAX = 55;
    for(let i=0; i<evts.length; i++){
      const ev = evts[i];
      const rl = ev._runLen || 0;
      if(rl < ALB_MIN_RUN || rl > ALB_MAX_RUN) continue;
      if(!ev.n || ev.n.length < 3) continue;
      // Softness gate: loudest note in the merged chord
      let maxV = 0;
      for(const n of ev.n) if((n.v||0) > maxV) maxV = n.v||0;
      if(maxV >= ALB_VEL_MAX) continue;
      // Sort chord notes low→high
      const sortedNotes = [...ev.n].sort((a,b) => a.m - b.m);
      // Pick the melody note: prefer _melody flag from merged chord, else
      // highest MIDI. This keeps Alberti's "top" cycle position aligned with
      // the actual melodic line, not just whatever happens to be highest.
      const melI = ev.n.findIndex(n=>n._melody);
      const melNote = melI >= 0 ? ev.n[melI] : sortedNotes[sortedNotes.length - 1];
      const bass = sortedNotes[0];
      const top  = melNote;
      const mid  = sortedNotes[Math.floor(sortedNotes.length / 2)];
      // Classic Alberti rotation: bass → top → mid → top (top = melody)
      const cycle = [bass, top, mid, top];
      // Expand: turn the merged plane back into runLen single-note events
      const baseTemplate = {
        v: Math.min(120, Math.max(20, Math.round((bass.v || 50)))),
        durMs: bass.durMs || 250
      };
      for(let k=0; k<rl; k++){
        const src = cycle[k % cycle.length];
        const target = evts[i+k];
        if(!target) break;
        const isMel = (src === top);
        const note = {
          ...baseTemplate,
          m: src.m,
          v: Math.min(120, Math.max(20, Math.round(src.v || baseTemplate.v))),
          durMs: src.durMs || baseTemplate.durMs
        };
        if(isMel) note._melody = true;
        target.n = [note];
        target._playable = true;          // restore playable (was false on merge continuations)
        target._alberti = true;
        if(k > 0) delete target._runLen;  // only first event keeps the plane marker
      }
      // First event no longer represents the whole plane — clear its plane flags
      // so downstream sustained-plane gesture doesn't double-handle it
      delete ev._runLen;
      delete ev._planeBright;
      delete ev._planeChroma;
      delete ev._planeSal;
      delete ev._planeBlockIdx;
      delete ev._planeDrift;
      i += rl - 1;                        // skip past the expanded plane
    }
  }
  // ─── Run-length collapsing — kill the "plem plem" on flat surfaces ──────
  // Reads MERGED plane blocks (events carrying _runLen from the upstream
  // Merge pass). For long flat planes that Alberti didn't claim (length
  // 13+ OR loud enough that Alberti rejected them), we EXPAND the plane
  // back into per-event quiet shimmer notes, rotating through the chord
  // pitches so the surface gets motion + sparkle instead of one held
  // note for the whole field. The merged event itself keeps its full
  // attack as the harmonic "arrival"; expansion shimmer fills the rest.
  //
  // Very long planes (≥ 24 events) are LEFT to the existing SUSTAINED-
  // PLANE VARIATION gesture — that one already shapes them with built-in
  // breath / register lift / rolled gestures, more nuanced than shimmer.
  {
    const RUN_MIN_COLLAPSE = 13;             // pick up where Alberti leaves off
    const RUN_MAX_COLLAPSE = 23;             // beyond this, leave to sustained-plane
    const SHIMMER_VEL = 26;
    for(let i = 0; i < evts.length; i++){
      const ev = evts[i];
      const rl = ev._runLen || 0;
      if(rl < RUN_MIN_COLLAPSE || rl > RUN_MAX_COLLAPSE) continue;
      if(!ev.n || !ev.n.length) continue;
      const chordNotes = ev.n.slice();        // snapshot of the merged chord
      for(let k = 1; k < rl; k++){
        const target = evts[i+k];
        if(!target) break;
        const rotIdx = k % chordNotes.length;
        const src = chordNotes[rotIdx];
        const note = {
          m: src.m,
          v: SHIMMER_VEL,
          durMs: src.durMs
        };
        if(src._melody) note._melody = true;
        target.n = [note];
        target._playable = true;              // restore playable
        target._collapsedShimmer = true;
        if(k > 0) delete target._runLen;      // only the anchor event keeps the plane marker
      }
      // Clear plane flags on the anchor — collapsing handled this plane
      delete ev._runLen;
      delete ev._planeBright;
      delete ev._planeChroma;
      delete ev._planeSal;
      delete ev._planeBlockIdx;
      delete ev._planeDrift;
      i += rl - 1;                            // skip past the expanded plane
    }
  }
  // ─── TEMPO MODULATION (agogics) — per-event step time ───────────────────────
  // The scan playback used to advance one cell every fixed 150 ms, so every
  // painting played at one flat, mechanical pulse ("like a saw"). Real music
  // breathes: it slows for weight, leans into accents, and eases at phrase ends.
  // Here we give each event its OWN step interval (_stepMs) as a function of the
  // IMAGE itself, so tempo becomes expressive while staying fully deterministic
  // (same image → same rubato). The player reads _stepMs instead of the constant.
  // Three layers, all multiplied onto a base step:
  //   (1) DARK→SLOW: this strip's brightness (barLight). Dark/heavy strips stretch
  //       out (broader, weightier), luminous strips move a touch quicker.
  //   (2) VIVID ACCENT: a saturated, charged strip (barVivid) earns a small
  //       agogic lean — the note is given a bit more time, like a played stress.
  //   (3) PHRASE BREATH: the last cell of each bar is lengthened (a tiny caesura,
  //       a breath between phrases); plus a closing RITARDANDO over the final bars
  //       so the piece arrives instead of being cut off mid-stream.
  // Rests advance a little quicker so silence doesn't drag.
  // Run LAST so the final event structure (after Alberti / Run-length / Tremolo
  // expansions reflipping _playable) is what's reflected in _stepMs.
  {
    // Per-cell interval. Centre at 200ms (was 150 — default was a machine gun).
    // Serene atmo widens up to 260ms (real breathing room); frantic atmo compresses
    // down to 100ms (driving pulse). Neutral mood (or no atmo) stays at 200.
    const _stepAtmoShift = (atmoE!=null)
      ? (atmoE<0.5 ? +60*(0.5-atmoE)/0.5 : -100*(atmoE-0.5)/0.5)
      : 0;
    const BASE_STEP = 200 + _stepAtmoShift;
    const _nBars = Math.max(1, Math.ceil(evts.length / BAR_EVENTS));
    const _ritStart = Math.max(0, evts.length - Math.min(48, BAR_EVENTS*1.5)); // last ~1.5 bars
    for(let i=0;i<evts.length;i++){
      const ev=evts[i];
      const _bi = Math.floor(i / BAR_EVENTS);
      // barLight/barVivid are 0..1 across THIS painting (computed above).
      const _light = (typeof barLight!=='undefined' && barLight[_bi]!=null) ? barLight[_bi] : 0.5;
      const _vivid = (typeof barVivid!=='undefined' && barVivid[_bi]!=null) ? barVivid[_bi] : 0.5;
      // (1) Dark→slow: centre on 1.0 so mid-brightness is neutral. Dark strip
      //     (light→0) up to +30% time; bright strip (light→1) down to ~-12%.
      const darkFactor = 1 + 0.30*(1-_light) - 0.12*_light;
      // (2) Vivid accent: a charged strip leans ~ up to +14% (agogic stress).
      const accentFactor = 1 + 0.14*_vivid;
      // (3a) Phrase breath: the LAST cell of a bar gets a caesura; the cell right
      //      after (a downbeat / chord turn) also broadens slightly to settle.
      const isBarEnd   = ((i+1)%BAR_EVENTS)===0;
      const isBarStart = (i%BAR_EVENTS)===0;
      let breathFactor = 1;
      if(isBarEnd)        breathFactor = 1.35;   // breath between phrases
      else if(isBarStart) breathFactor = 1.10;   // settle onto the new phrase
      // (3b) Closing ritardando: ease the final ~1.5 bars from 1.0 → ~1.6.
      let ritardFactor = 1;
      if(i>=_ritStart && evts.length>BAR_EVENTS){
        const t=(i-_ritStart)/Math.max(1,(evts.length-1-_ritStart)); // 0..1
        ritardFactor = 1 + 0.6*t;
      }
      // Rests don't need the agogic weight — keep silence moving (but still let
      // the bar-end breath and the closing ritard apply, so phrasing holds).
      const isRest = (ev._rest || ev._melRest || ev._playable===false || !ev.n.length);
      const restFactor = isRest ? 0.82 : 1;
      let stepMs = BASE_STEP * darkFactor * accentFactor * breathFactor * ritardFactor * restFactor;
      // Safety clamp: never absurdly fast or slow per cell.
      ev._stepMs = Math.round(Math.max(70, Math.min(520, stepMs)));
    }
    // startMs was initially laid out as evIdx*msPerBlock (a FLAT grid pace). But
    // the image scan actually PLAYS at the agogic _stepMs above (dark→slow,
    // bar-breath, ritardando — 70..520ms, mean ~200). When those two disagree
    // (e.g. many cells make msPerBlock ~100ms while mean _stepMs ~200ms), a See
    // music MIDI bake — which encodes startMs — plays ~2× too fast vs the image.
    // Re-lay startMs as the CUMULATIVE SUM of _stepMs so the exported timeline
    // matches the heard tempo exactly. Image-mode playback reads _stepMs directly
    // and is unaffected; only the startMs field (used by the MIDI round-trip and
    // the See-music gap derivation) is corrected.
    {
      // Inline the same deterministic LCG used in Pass B (detRnd is block-scoped
      // there) so the ±20ms rubato is identical and reproducible.
      const _detRnd = (band, cg, salt)=>{
        let h = ((band*48271 + cg*16807 + salt*2654435761) >>> 0);
        h = ((h*1103515245 + 12345) >>> 0);
        return (h % 233280) / 233280;
      };
      let _acc = 0;
      for(const ev of evts){
        const _jit = (typeof ev.band==='number' && typeof ev.cg==='number')
          ? (_detRnd(ev.band, ev.cg, 2) - 0.5) * 40 : 0;
        ev.startMs = Math.max(0, Math.round(_acc + _jit));
        _acc += (ev._stepMs || 200);
      }
    }
  }
  // ─── durMs ceiling vs step overlap — keep calm pieces from smearing ──────
  // After all the durMs multipliers (per-voice articulation, edge-based
  // staccato/legato, sustainMul from ATMO), a single note in a calm piece
  // can ring 2-3 seconds while the next event starts in 260 ms. That stacks
  // 5-10 notes simultaneously into a smeared pad instead of a sequence of
  // distinct attacks. Cap each note's durMs at a multiple of its event's
  // _stepMs so the legato is still rich (calm 4× 260ms = ~1s ring) but
  // articulate (no infinite tails). Bass voices get a longer cap so they
  // ground the harmony for the full beat.
  for(const ev of evts){
    if(!ev.n || !ev.n.length) continue;
    const stepMs = ev._stepMs || 200;
    ev.n = ev.n.map(n => {
      const cap = (n.bass ? 6 : 4) * stepMs;
      return n.durMs > cap ? {...n, durMs: cap} : n;
    });
  }
  return evts;
}

const BKS=new Set([1,3,6,8,10]);
const{w:WKEYS,b:BKEYS}=(()=>{const w=[],b=[];let wi=0;for(let m=21;m<=108;m++){const pc=m%12;if(!BKS.has(pc))w.push({midi:m,wi:wi++});else b.push({midi:m,lw:wi-1});}return{w,b};})();
// Keyboard dimensions, used by both the parent layout and the memo'd key
// components. Constants — hoisted out of the render body so the key components
// can read them without props.
const WKW=26, WKH=88, BKW=16, BKH=54;
const PW=WKEYS.length*WKW;
// Pixel x-position of a MIDI key on the keyboard strip. WKW px per white key.
// Black keys sit between whites at offset +0.65 — same constant the JSX uses below.
const midiToKeyX = (midi) => {
  const w = WKEYS.find(k => k.midi === midi);
  if (w) return w.wi * WKW;
  const b = BKEYS.find(k => k.midi === midi);
  if (b) return (b.lw + 0.65) * WKW;
  return null;
};
// Scientific pitch notation for a MIDI number. Middle C (MIDI 60) → "C4".
// Uses sharps for the black keys (the most common piano notation).
const NOTE_PCS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const noteName = (m) => NOTE_PCS[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
// Pre-built lookup tables: O(1) for both directions across the full MIDI range.
const _midiToName = Array.from({length:128},(_,i)=>noteName(i));
const _nameToMidi = Object.fromEntries(_midiToName.map((n,i)=>[n,i]));

// ─────────────────────────────────────────────────────────────────────────────
// bakeImageChords — flatten an image-scan chord array into a fully-cooked
// chord stream suitable for MIDI export / music-mode playback.
//
// PROBLEM: image-mode playback applies a lot of piano-technique transforms
// AT PLAYBACK TIME (not in the chord array): it skips _playable:false
// merged-plane members, unfolds arpeggio offsets, re-strikes long _tremolo
// planes, extends sustained-plane durations by _runLen, and so on. The raw
// chords[] array carries flags but not the unfolded notes. So encodeMidi
// on the raw array produces a MIDI that's:
//   • 2-3× denser than what was heard (all chords play, no _playable skip)
//   • missing arpeggio (notes play simultaneously instead of offset)
//   • missing tremolo re-strikes (one attack instead of many)
//   • missing sustained-plane holds (default short durMs)
// Music-mode playback of that MIDI feels rushed and texture-less.
//
// SOLUTION: bake the runtime expansion into the chord array before encoding,
// so the resulting MIDI carries actual MIDI events for every audible note.
// Deterministic — same image scan always produces the same bake (seeds come
// from per-chord _tremSeed already in the array, or fall back to position).
// ═══════════════════════════════════════════════════════════════════════════
// COMPOSER LAYER — painting → music in a composer's STYLE.
// Two-phase design: Phase 1 ANALYSES the whole picture first (the plain scan,
// row-major, is the material map: per-cell notes + colour statistics), then
// Phase 2 COMPOSES over the complete map — so form, climax and ending are
// planned from the whole image, never guessed locally. Deterministic:
// (pixels, composer) → identical piece, always. Mirrors mosaic vs artists.
// ═══════════════════════════════════════════════════════════════════════════
function composeImageGlass(px,nc,nr,table,colorMode,dir){
  // ── PHASE 1 · analyse ────────────────────────────────────────────────────
  const base = pixelsToImageEvents(px,nc,nr,table,colorMode,'lr',0);
  if(!base || !base.length) return base||[];
  // seed from the pixels themselves (FNV over a sparse sample)
  let ss=0x811c9dc5;
  for(let i=0;i<px.length;i+=97){ const q=px[i]; ss=((ss^(q.r+q.g*7+q.b*13))*0x01000193)>>>0; }
  const R=(salt)=>{ const f=_seedRnd(9700+salt,ss,0,0); f(); return f; };
  // group scan cells into row-bands, then merge bands into 12-28 SECTIONS
  const bandsMap=new Map();
  for(const e of base){ if(!bandsMap.has(e.band)) bandsMap.set(e.band,[]); bandsMap.get(e.band).push(e); }
  const bandKeys=[...bandsMap.keys()].sort((a,b)=>a-b);
  const S=Math.max(12,Math.min(28,bandKeys.length));
  const secs=[];
  for(let si=0;si<S;si++){
    const b0=Math.floor(si*bandKeys.length/S), b1=Math.floor((si+1)*bandKeys.length/S);
    const cells=[]; for(let b=b0;b<Math.max(b0+1,b1);b++){ const bk=bandKeys[b]; if(bk!=null) cells.push(...bandsMap.get(bk)); }
    if(!cells.length) continue;
    const hist=new Float32Array(12); const src={}; let lum=0,chr=0;
    for(const c of cells){
      lum+=(c._lum||50); chr+=(c._chroma||0);
      for(const n0 of (c.n||[])){ if(!n0||n0.bass) continue; const pc=((n0.m%12)+12)%12; const w=(n0.v||60);
        hist[pc]+=w; if(!src[pc]||w>src[pc].w){ src[pc]={w,cg:c.cg,band:c.band,_lum:c._lum,_chroma:c._chroma}; } }
    }
    lum/=cells.length; chr/=cells.length;
    let uniq=0; for(let p2=0;p2<12;p2++) if(hist[p2]>0) uniq++;
    secs.push({hist,src,lum,chr,homog:1-Math.min(1,uniq/9),cells});
  }
  if(!secs.length) return base;
  // ── globals: tonic, mode, tempo, dynamic arc ──
  const g=new Float32Array(12); let gl=0,gc2=0;
  for(const sec of secs){ for(let p2=0;p2<12;p2++) g[p2]+=sec.hist[p2]; gl+=sec.lum; gc2+=sec.chr; }
  gl/=secs.length; gc2/=secs.length;
  let tonic=0,tb=-1; for(let p2=0;p2<12;p2++) if(g[p2]>tb){tb=g[p2];tonic=p2;}
  const major = gl>50;
  const scale = major?[0,2,4,5,7,9,11]:[0,2,3,5,7,8,10];
  const inScale=(pc)=>{ let best=pc,bd=99; for(const d of scale){ const a=(tonic+d)%12; const dd=Math.min((a-pc+12)%12,(pc-a+12)%12); if(dd<bd){bd=dd;best=a;} } return best; };
  const c01=Math.min(1,gc2/45);
  const bpm=94+Math.round(c01*40);
  const eighth=Math.round(60000/bpm/2);
  const arc=(pos)=>0.72+0.44*Math.exp(-((pos-0.618)*(pos-0.618))/(2*0.22*0.22));
  // bar budget so the piece lands ~1.5-3 min regardless of image size
  let bars=secs.map(sec=>2+Math.round(sec.homog*2));
  const maxBars=Math.floor(170000/(8*eighth));
  const tot=bars.reduce((a,b)=>a+b,0);
  if(tot>maxBars){ bars=bars.map(b=>Math.max(1,Math.round(b*maxBars/tot))); }
  // ── PHASE 2 · compose (additive cells, pendulum arpeggio, pedal bass) ──
  const evts=[]; let t=0, evIdx=0, prevPcs=[];
  const jit=R(1);
  // ── EPISODIC FORM ── the piece is not one texture varied but SIX moods:
  // intro (bare cell) → flow (cell+pedal) → CHORALE (block chords — a whole
  // different fabric, the Metamorphosis contrast) → flow' (octave up, terrace)
  // → climax (doubled, loud) → outro (stripped, slowing). Material still
  // comes from the picture's rows; only the clothing changes per episode.
  const NS=secs.length;
  const phaseOf=(si)=>{ const f=NS<=1?0:si/(NS-1);
    if(f<0.12) return 'intro';
    if(f<0.40) return 'flow';
    if(f<0.55) return 'chorale';
    if(f<0.74) return 'flow2';
    if(f<0.90) return 'climax';
    return 'outro'; };
  for(let si=0;si<NS;si++){
    const sec=secs[si], last=si===NS-1;
    const ph=phaseOf(si);
    const shift=(ph==='flow2' && si%2===1)?5:0;
    const ranked=[...Array(12).keys()].filter(p2=>sec.hist[p2]>0).sort((a,b)=>sec.hist[b]-sec.hist[a]).map(p2=>inScale((p2+shift)%12));
    const uniqR=[...new Set(ranked)];
    let K=(ph==='intro'||ph==='outro')?2:3+(sec.chr>28?1:0)+(sec.homog<0.4?1:0);
    const cellPcs=[];
    for(const p2 of prevPcs){ if(cellPcs.length<2 && uniqR.includes(p2)) cellPcs.push(p2); }
    for(const p2 of uniqR){ if(cellPcs.length>=K) break; if(!cellPcs.includes(p2)) cellPcs.push(p2); }
    while(cellPcs.length<Math.min(K,3)) cellPcs.push((tonic+scale[(cellPcs.length*2)%scale.length])%12);
    prevPcs=cellPcs.slice();
    let octBase=sec.lum<40?3:(sec.lum<62?4:5);
    if(ph==='flow2') octBase=Math.min(5,octBase+1);
    if(ph==='climax') octBase=Math.min(5,octBase+1);
    const mids=[]; let lastM=-1;
    for(const p2 of cellPcs.slice().sort((a,b)=>a-b)){ let m=12*(octBase+1)+p2; while(m<=lastM) m+=12; lastM=m; mids.push({m,pc:p2}); }
    const seq=mids.concat(mids.slice(1,Math.max(1,mids.length-1)).reverse());
    const trip=(ph==='flow'||ph==='flow2') && sec.chr>32;
    const perBar=trip?12:8;
    const pulse=trip?Math.round(eighth*2/3):eighth;
    const bassPc=(si%2===0)?((tonic+shift)%12):((tonic+shift+7)%12);
    const bsrc=sec.cells[0];
    const vPh=(ph==='intro'?0.72:ph==='chorale'?0.9:ph==='climax'?1.12:ph==='outro'?0.7:1);
    if(ph!=='intro' && ph!=='chorale'){
      const secMs=bars[si]*perBar*pulse;
      evts.push({n:[{m:36+bassPc,v:Math.round(54*vPh*arc(si/NS)),durMs:Math.min(secMs,6000),bass:true}],startMs:t,idx:evIdx++,cg:bsrc.cg,band:bsrc.band,colStep:bsrc.colStep||4,_chroma:sec.chr,_flat:0,_domPc:bassPc,_lum:sec.lum});
    }
    if(ph==='chorale'){
      // BLOCK CHORDS — the whole cell rings together in slow quarters; the
      // total textural opposite of the arpeggio, and the piece breathes.
      const nCh=bars[si]*4;
      for(let q=0;q<nCh;q++){
        const pos=t/Math.max(1,(maxBars*8*eighth));
        const v=Math.round((46+Math.min(30,sec.chr))*arc(Math.min(1,pos))*vPh + (q%4===0?6:0));
        const ns=mids.map((o,oi)=>({m:o.m-12,v:Math.max(26,v-oi*5),durMs:Math.round(eighth*2*1.8)}));
        ns.push({m:36+bassPc,v:Math.round(v*0.85),durMs:Math.round(eighth*2*1.8),bass:true});
        const srcC=sec.src[mids[0].pc]||{cg:bsrc.cg,band:bsrc.band,_lum:sec.lum,_chroma:sec.chr};
        evts.push({n:ns,startMs:t,idx:evIdx++,cg:srcC.cg,band:srcC.band,colStep:4,_chroma:sec.chr,_flat:0,_domPc:mids[0].pc,_lum:sec.lum});
        t+=eighth*2;
      }
      continue;
    }
    let pulseMs=pulse;
    for(let b2=0;b2<bars[si];b2++){
      for(let k=0;k<perBar;k++){
        const note=seq[k%seq.length];
        const srcC=sec.src[note.pc]||sec.src[cellPcs[0]]||{cg:bsrc.cg,band:bsrc.band,_lum:sec.lum,_chroma:sec.chr};
        const pos=t/Math.max(1,(maxBars*8*eighth));
        const v=Math.max(26,Math.min(112,Math.round((50+Math.min(40,sec.chr))*arc(Math.min(1,pos))*vPh + (jit()-0.5)*10)));
        const ns=[{m:note.m,v,durMs:Math.round(pulseMs*1.9)}];
        if(ph==='climax'){ ns.push({m:note.m+12,v:Math.max(24,v-16),durMs:Math.round(pulseMs*1.9)}); }
        evts.push({n:ns,startMs:t,idx:evIdx++,cg:srcC.cg,band:srcC.band,colStep:4,_chroma:srcC._chroma||sec.chr,_flat:0,_domPc:note.pc,_lum:srcC._lum||sec.lum});
        t+=pulseMs;
        if(last) pulseMs=Math.round(pulseMs*1.02);
      }
    }
  }
  // final tonic chord, long and soft — the picture closes on its key
  const third=(tonic+(major?4:3))%12, fifth=(tonic+7)%12;
  evts.push({n:[{m:48+tonic,v:46,durMs:2600},{m:60+third,v:42,durMs:2600},{m:60+fifth,v:40,durMs:2600}],startMs:t+eighth,idx:evIdx++,cg:base[0].cg,band:base[0].band,colStep:4,_chroma:gc2,_flat:0,_domPc:tonic,_lum:gl});
  return evts;
}

// ── SATIE — Gymnopédie: slow 3/4, bass-chord sway, a sparse floating melody. ──
// Same two-phase design as Glass: the whole picture is analysed first, then
// the piece is composed over the complete map. Sections become harmonic
// regions (one chord colour each); homogeneous regions breathe with rests.
function composeImageSatie(px,nc,nr,table,colorMode,dir){
  const base = pixelsToImageEvents(px,nc,nr,table,colorMode,'lr',0);
  if(!base || !base.length) return base||[];
  let ss=0x811c9dc5;
  for(let i=0;i<px.length;i+=97){ const q=px[i]; ss=((ss^(q.r+q.g*7+q.b*13))*0x01000193)>>>0; }
  const R=(salt)=>{ const f=_seedRnd(9800+salt,ss,0,0); f(); return f; };
  const bandsMap=new Map();
  for(const e of base){ if(!bandsMap.has(e.band)) bandsMap.set(e.band,[]); bandsMap.get(e.band).push(e); }
  const bandKeys=[...bandsMap.keys()].sort((a,b)=>a-b);
  const S=Math.max(10,Math.min(22,bandKeys.length));
  const secs=[];
  for(let si=0;si<S;si++){
    const b0=Math.floor(si*bandKeys.length/S), b1=Math.floor((si+1)*bandKeys.length/S);
    const cells=[]; for(let b=b0;b<Math.max(b0+1,b1);b++){ const bk=bandKeys[b]; if(bk!=null) cells.push(...bandsMap.get(bk)); }
    if(!cells.length) continue;
    const hist=new Float32Array(12); const src={}; let lum=0,chr=0;
    for(const c of cells){
      lum+=(c._lum||50); chr+=(c._chroma||0);
      for(const n0 of (c.n||[])){ if(!n0||n0.bass) continue; const pc=((n0.m%12)+12)%12; const w=(n0.v||60);
        hist[pc]+=w; if(!src[pc]||w>src[pc].w){ src[pc]={w,cg:c.cg,band:c.band,_lum:c._lum,_chroma:c._chroma}; } }
    }
    lum/=cells.length; chr/=cells.length;
    let uniq=0; for(let p2=0;p2<12;p2++) if(hist[p2]>0) uniq++;
    secs.push({hist,src,lum,chr,homog:1-Math.min(1,uniq/9),cells});
  }
  if(!secs.length) return base;
  const g=new Float32Array(12); let gl=0;
  for(const sec of secs){ for(let p2=0;p2<12;p2++) g[p2]+=sec.hist[p2]; gl+=sec.lum; }
  gl/=secs.length;
  let tonic=0,tb=-1; for(let p2=0;p2<12;p2++) if(g[p2]>tb){tb=g[p2];tonic=p2;}
  const bright = gl>50;
  // bright → major with a lydian shimmer; dark → dorian. Chords are 7ths —
  // the gymnopédie sonority — never plain triads.
  const scale = bright?[0,2,4,6,7,9,11]:[0,2,3,5,7,9,10];
  const inScale=(pc)=>{ let best=pc,bd=99; for(const d of scale){ const a=(tonic+d)%12; const dd=Math.min((a-pc+12)%12,(pc-a+12)%12); if(dd<bd){bd=dd;best=a;} } return best; };
  const beat=Math.round(60000/66);              // lent — quarter ≈ 909ms
  const barMs=beat*3;
  const arc=(pos)=>0.88+0.14*Math.exp(-((pos-0.618)*(pos-0.618))/(2*0.24*0.24));
  let bars=secs.map(sec=>2+Math.round((1-sec.homog)*2));   // busy regions get more bars
  const maxBars=Math.floor(160000/barMs);
  const tot=bars.reduce((a,b)=>a+b,0);
  if(tot>maxBars){ bars=bars.map(b=>Math.max(1,Math.round(b*maxBars/tot))); }
  const totalMs=bars.reduce((a,b)=>a+b,0)*barMs;
  const evts=[]; let t=0, evIdx=0, prevMel=null, barNo=0, lastGest=-1, melSkip=0;
  const jr=R(1);
  const seventh = bright?11:10;
  const totBars=bars.reduce((a,b)=>a+b,0);
  // the single form gesture: a short "trio" near phi drifting to the RELATIVE
  // key and back — everything else keeps the clean original sway
  const trioStart=Math.floor(totBars*0.58), trioEnd=Math.min(totBars-2,trioStart+4);
  const rel=bright?(tonic+9)%12:(tonic+3)%12;
  for(let si=0;si<secs.length;si++){
    const sec=secs[si], last=si===secs.length-1;
    const ranked=[...Array(12).keys()].filter(p2=>sec.hist[p2]>0).sort((a,b)=>sec.hist[b]-sec.hist[a]).map(inScale);
    const uniqR=[...new Set(ranked)];
    const rootA=uniqR[0]!=null?uniqR[0]:tonic;
    const rootB=uniqR[1]!=null?uniqR[1]:(tonic+7)%12;      // sway between two colours
    const srcOf=(pc)=>sec.src[pc]||sec.src[rootA]||{cg:sec.cells[0].cg,band:sec.cells[0].band,_lum:sec.lum,_chroma:sec.chr};
    for(let b2=0;b2<bars[si];b2++,barNo++){
      const inTrio=barNo>=trioStart&&barNo<trioEnd;
      const fPos=barNo/Math.max(1,totBars-1);
      // EPISODES: naked opening (no chord) → sway → ROLLED mid-episode (the
      // chord arpeggiated, melody an octave up) → trio → sway home.
      const phS = fPos<0.14 ? 'naked' : (fPos>=0.56&&fPos<0.74&&!inTrio) ? 'rolled' : 'sway';
      let root=(b2%2===0)?rootA:rootB;
      if(inTrio) root=(barNo%2===0)?rel:(rel+7)%12;
      const pos=t/Math.max(1,totalMs);
      const env=arc(Math.min(1,pos));
      const sc=srcOf(root);
      // beat 1 — low bass (always the anchor)
      evts.push({n:[{m:36+root,v:Math.round(50*env),durMs:Math.round(beat*2.7),bass:true}],startMs:t,idx:evIdx++,cg:sc.cg,band:sc.band,colStep:4,_chroma:sec.chr,_flat:0,_domPc:root,_lum:sec.lum});
      const third=(root+(bright?4:3))%12;
      if(phS!=='naked'){
        const chTones=[{m:48+root,vv:42},{m:48+third+(third<root?12:0),vv:38},{m:48+((root+seventh)%12)+(((root+seventh)%12)<root?12:0),vv:36}];
        if(phS==='rolled'){
          // arpeggiated roll — three quick soft tones instead of the block
          for(let q=0;q<chTones.length;q++){
            evts.push({n:[{m:chTones[q].m,v:Math.round(chTones[q].vv*env),durMs:Math.round(beat*1.7)}],startMs:t+beat+q*Math.round(beat*0.34),idx:evIdx++,cg:sc.cg,band:sc.band,colStep:4,_chroma:sec.chr,_flat:0,_domPc:root,_lum:sec.lum});
          }
        } else {
          evts.push({n:chTones.map(o=>({m:o.m,v:Math.round(o.vv*env),durMs:Math.round(beat*1.9)})),startMs:t+beat,idx:evIdx++,cg:sc.cg,band:sc.band,colStep:4,_chroma:sec.chr,_flat:0,_domPc:root,_lum:sec.lum});
        }
      }
      const cadence=(barNo%4===3);   // every 4th bar the song rests — a breath
      // melody speaks in GESTURES with memory — never the same shape twice in
      // a row: 0 whole-bar tone · 1 "da-taaa" · 2 "da-da·" · 3 tie over the
      // barline (the Satie suspension; the next bar's melody then rests).
      const restP=0.18+sec.homog*0.4;
      if(melSkip>0){ melSkip--; }
      else if(!cadence && jr()>restP && !last){
        let cands=uniqR.slice(0,5); if(!cands.length) cands=[tonic];
        let melPc=cands[0];
        if(prevMel!=null){ let bd=99; for(const p2 of cands){ const dd=Math.min((p2-prevMel%12+12)%12,(prevMel%12-p2+12)%12); if(dd<bd){bd=dd;melPc=p2;} } }
        let mm=60+melPc; if(prevMel!=null){ while(mm-prevMel>7) mm-=12; while(prevMel-mm>7) mm+=12; }
        if(phS==='rolled'){ mm=Math.min(89,mm+12); }
        mm=Math.max(55,Math.min(84,mm));
        const msc=srcOf(melPc);
        const vB=(58+Math.min(18,sec.chr*0.5))*env;
        const P=(m2,vv,startB,durB2)=>{ evts.push({n:[{m:m2,v:Math.round(vv),durMs:Math.round(beat*durB2*0.96)}],startMs:t+Math.round(startB*beat),idx:evIdx++,cg:msc.cg,band:msc.band,colStep:4,_chroma:msc._chroma||sec.chr,_flat:0,_domPc:melPc,_lum:msc._lum||sec.lum}); };
        let gi; do{ gi=Math.floor(jr()*4); }while(gi===lastGest);
        lastGest=gi;
        if(gi===0){ P(mm,vB,0,2.9); prevMel=mm; }
        else if(gi===1){ const nb=Math.max(55,Math.min(84,mm+(jr()<0.5?-2:2))); P(nb,vB*0.86,0,0.95); P(mm,vB,1,1.9); prevMel=mm; }
        else if(gi===2){ const nb=Math.max(55,Math.min(84,mm+(jr()<0.5?-1:2))); P(mm,vB*0.95,0,0.95); P(nb,vB*0.85,1,0.95); prevMel=nb; }
        else { P(mm,vB*0.96,(jr()<0.5?1:2),4.6); prevMel=mm; melSkip=1; }
      }
      t+=barMs;
    }
  }
  // final bar — bass + 7th chord, long and very soft
  evts.push({n:[{m:36+tonic,v:44,durMs:3200,bass:true},{m:48+tonic,v:40,durMs:3200},{m:48+((tonic+(bright?4:3))%12),v:36,durMs:3200},{m:48+((tonic+seventh)%12),v:34,durMs:3200}],startMs:t+beat,idx:evIdx++,cg:base[0].cg,band:base[0].band,colStep:4,_chroma:0,_flat:0,_domPc:tonic,_lum:gl});
  return evts;
}

// ── CHOPIN — nocturne: arpeggiated left hand, cantabile melody, rubato. ──
// Two-phase like the others. The harmonic floor is FUNCTIONAL (i-VI-iv-V
// cycling), coloured by each section's pitch material; the right hand sings
// two-bar phrases with grace-note ornaments and a phi-placed climax.
function composeImageChopin(px,nc,nr,table,colorMode,dir){
  const base = pixelsToImageEvents(px,nc,nr,table,colorMode,'lr',0);
  if(!base || !base.length) return base||[];
  let ss=0x811c9dc5;
  for(let i=0;i<px.length;i+=97){ const q=px[i]; ss=((ss^(q.r+q.g*7+q.b*13))*0x01000193)>>>0; }
  const R=(salt)=>{ const f=_seedRnd(9900+salt,ss,0,0); f(); return f; };
  // Diatonic walking — EVERY melodic step moves along the key's scale, never
  // by raw semitone arithmetic (that's what made runs sound false).
  let _scAbs=null;
  const _snap=(m)=>{ let best=m,bd=99; for(let o=-1;o<=1;o++){ for(const pc of _scAbs){ const c2=12*Math.floor(m/12)+pc+12*o; const dd=Math.abs(c2-m); if(dd<bd){bd=dd;best=c2;} } } return best; };
  const _stepSc=(m,nSteps)=>{ let cur=_snap(m); const dir=nSteps>0?1:-1; for(let q=0;q<Math.abs(nSteps);q++){ let nxt=cur+dir; while(_scAbs.indexOf(((nxt%12)+12)%12)<0) nxt+=dir; cur=nxt; } return cur; };
  const bandsMap=new Map();
  for(const e of base){ if(!bandsMap.has(e.band)) bandsMap.set(e.band,[]); bandsMap.get(e.band).push(e); }
  const bandKeys=[...bandsMap.keys()].sort((a,b)=>a-b);
  const S=Math.max(10,Math.min(20,bandKeys.length));
  const secs=[];
  for(let si=0;si<S;si++){
    const b0=Math.floor(si*bandKeys.length/S), b1=Math.floor((si+1)*bandKeys.length/S);
    const cells=[]; for(let b=b0;b<Math.max(b0+1,b1);b++){ const bk=bandKeys[b]; if(bk!=null) cells.push(...bandsMap.get(bk)); }
    if(!cells.length) continue;
    const hist=new Float32Array(12); const src={}; let lum=0,chr=0;
    for(const c of cells){
      lum+=(c._lum||50); chr+=(c._chroma||0);
      for(const n0 of (c.n||[])){ if(!n0||n0.bass) continue; const pc=((n0.m%12)+12)%12; const w=(n0.v||60);
        hist[pc]+=w; if(!src[pc]||w>src[pc].w){ src[pc]={w,cg:c.cg,band:c.band,_lum:c._lum,_chroma:c._chroma}; } }
    }
    lum/=cells.length; chr/=cells.length;
    let uniq=0; for(let p2=0;p2<12;p2++) if(hist[p2]>0) uniq++;
    secs.push({hist,src,lum,chr,homog:1-Math.min(1,uniq/9),cells});
  }
  if(!secs.length) return base;
  const g=new Float32Array(12); let gl=0,gc2=0;
  for(const sec of secs){ for(let p2=0;p2<12;p2++) g[p2]+=sec.hist[p2]; gl+=sec.lum; gc2+=sec.chr; }
  gl/=secs.length; gc2/=secs.length;
  let tonic=0,tb=-1; for(let p2=0;p2<12;p2++) if(g[p2]>tb){tb=g[p2];tonic=p2;}
  const minor = gl<=55;                              // nocturnes lean minor
  const scale = minor?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
  const inScale=(pc)=>{ let best=pc,bd=99; for(const d of scale){ const a=(tonic+d)%12; const dd=Math.min((a-pc+12)%12,(pc-a+12)%12); if(dd<bd){bd=dd;best=a;} } return best; };
  // 6/8 nocturne pulse — dotted-quarter ~ 50, so an eighth ≈ 400ms; brighter
  // pictures flow a touch quicker
  const eighth=Math.round(400-Math.min(1,gc2/45)*70);
  const barMs=eighth*6;
  const arc=(pos)=>0.78+0.36*Math.exp(-((pos-0.618)*(pos-0.618))/(2*0.2*0.2));
  let bars=secs.map(sec=>2+Math.round((1-sec.homog)*2));
  const maxBars=Math.floor(155000/barMs);
  const tot=bars.reduce((a,b)=>a+b,0);
  if(tot>maxBars){ bars=bars.map(b=>Math.max(1,Math.round(b*maxBars/tot))); }
  const totBars=bars.reduce((a,b)=>a+b,0);
  const totalMs=totBars*barMs;
  // functional floor: i - VI - iv - V (minor) / I - vi - IV - V (major)
  const prog=minor?[0,8,5,7]:[0,9,5,7];
  _scAbs=scale.map(d=>(tonic+d)%12);
  const evts=[]; let t=0, evIdx=0, prevMel=null, barNo=0, lastGestC=-1;
  const jr=R(1), rb=R(2);
  const climBar=Math.floor(totBars*0.618);
  for(let si=0;si<secs.length;si++){
    const sec=secs[si], last=si===secs.length-1;
    const ranked=[...Array(12).keys()].filter(p2=>sec.hist[p2]>0).sort((a,b)=>sec.hist[b]-sec.hist[a]).map(inScale);
    const uniqR=[...new Set(ranked)];
    const srcOf=(pc)=>sec.src[pc]||sec.src[uniqR[0]]||{cg:sec.cells[0].cg,band:sec.cells[0].band,_lum:sec.lum,_chroma:sec.chr};
    for(let b2=0;b2<bars[si];b2++,barNo++){
      const deg=prog[barNo%4];
      const fPos=barNo/Math.max(1,totBars-1);
      // EPISODES: recitative opening (bare octaves under free song) →
      // nocturne → AGITATO middle (flowing arpeggio LH, melody in octaves,
      // relative key) → nocturne home. One piece, four different rooms.
      const phC = fPos<0.10 ? 'recit' : (fPos>=0.48&&fPos<0.68) ? 'agitato' : 'nocturne';
      const relC = minor?(tonic+3)%12:(tonic+9)%12;
      let root=(tonic+deg)%12;
      if(phC==='agitato'){ root=(barNo%2===0)?relC:(relC+7)%12; }
      const isV=deg===7 && phC!=='agitato';
      const third=(root+((minor&&!isV)?3:4))%12;
      const fifth=(root+7)%12;
      const pos=t/Math.max(1,totalMs);
      const env=arc(Math.min(1,pos));
      const nearClim=Math.abs(barNo-climBar)<=1;
      const sc=srcOf(root);
      if(phC==='recit'){
        // bare low octaves — the song floats free above them
        evts.push({n:[{m:36+root,v:Math.round(46*env),durMs:Math.round(barMs*0.95),bass:true},{m:48+root,v:Math.round(38*env),durMs:Math.round(barMs*0.95)}],startMs:t,idx:evIdx++,cg:sc.cg,band:sc.band,colStep:4,_chroma:sec.chr,_flat:0,_domPc:root,_lum:sec.lum});
      } else if(phC==='agitato'){
        // flowing continuous arpeggio — six eighths R-5-10-12-10-5, urgent
        const t3=52+third+(third<root?12:0)-4, t5=48+fifth+(fifth<root?12:0)-12;
        const flow=[36+root,t5,t3,t3+12,t3,t5];
        for(let q=0;q<6;q++){
          evts.push({n:[{m:flow[q],v:Math.round((44+q*1.5)*env),durMs:Math.round(eighth*1.7),bass:q===0}],startMs:t+q*eighth,idx:evIdx++,cg:sc.cg,band:sc.band,colStep:4,_chroma:sec.chr,_flat:0,_domPc:root,_lum:sec.lum});
        }
      } else {
        const lh=[ {m:36+root,off:0,v:50,dur:2.2,bass:true},
                   {m:48+fifth+(fifth<root?12:0)-12,off:1,v:40,dur:1.6},
                   {m:52+third+(third<root?12:0)-4,off:2,v:42,dur:1.6},
                   {m:48+fifth+(fifth<root?12:0)-12,off:3,v:38,dur:1.6},
                   {m:48+root,off:4,v:41,dur:1.6},
                   {m:48+fifth+(fifth<root?12:0)-12,off:5,v:37,dur:1.6} ];
        for(const L of lh){
          evts.push({n:[{m:L.m,v:Math.round(L.v*env),durMs:Math.round(eighth*L.dur),bass:!!L.bass}],startMs:t+L.off*eighth,idx:evIdx++,cg:sc.cg,band:sc.band,colStep:4,_chroma:sec.chr,_flat:0,_domPc:root,_lum:sec.lum});
        }
      }
      const cadence=(barNo%8===7);   // phrase-end bar: the voice breathes
      // RIGHT HAND — cantabile in GESTURES with memory (no "ta-da" grind):
      //   0 dotted-half across the bar (with the grace-note sigh)
      //   1 nocturne lilt (the old ta-da — now just one voice among four)
      //   2 three sinking quarters
      //   3 an eighth-note run rising into a held tone (the ornamental scale)
      const restP=0.10+sec.homog*0.28;
      if(!cadence && jr()>restP){
        let cands=uniqR.slice(0,6).filter(p2=>p2===root||p2===third||p2===fifth||jr()<0.5);
        if(!cands.length) cands=[third];
        let melPc=cands[Math.floor(jr()*cands.length)]||third;
        let mm=64+melPc; if(prevMel!=null){ while(mm-prevMel>9) mm-=12; while(prevMel-mm>9) mm+=12; }
        mm=Math.max(58,Math.min(88,mm));
        if(nearClim) mm=Math.min(93,mm+12);        // climax sings an octave up
        const msc=srcOf(melPc);
        const rubato=Math.round((rb()-0.5)*(phC==='recit'?220:120));   // breathes around the beat
        const vMel=Math.round((66+Math.min(20,sec.chr*0.6))*env*(nearClim?1.12:1));
        const PE=(m2,vv,offE,durE)=>{ const _ns=[{m:m2,v:Math.round(vv),durMs:Math.round(eighth*durE)}]; if(phC==='agitato'){ _ns.push({m:Math.min(96,m2+12),v:Math.round(vv*0.8),durMs:Math.round(eighth*durE)}); } evts.push({n:_ns,startMs:Math.max(0,t+Math.round(offE*eighth)+rubato),idx:evIdx++,cg:msc.cg,band:msc.band,colStep:4,_chroma:msc._chroma||sec.chr,_flat:0,_domPc:melPc,_lum:msc._lum||sec.lum}); };
        let gi; do{ gi=Math.floor(jr()*4); }while(gi===lastGestC);
        lastGestC=gi;
        if(gi===0){
          if(jr()<0.6){ PE(Math.min(94,_stepSc(mm,1)),Math.max(30,vMel-22),-0.3,0.28); }
          PE(mm,vMel,0,5.2); prevMel=mm;
        } else if(gi===1){
          PE(mm,vMel,0,1.9);
          const st=Math.max(56,Math.min(90,_stepSc(mm,jr()<0.5?-1:1)));
          PE(st,vMel-8,2,0.95);
          // finish on the NEAREST chord tone to where the line is
          let ct=st,cbd=99;
          for(const pc of [root,third,fifth]){ for(let o=4;o<=6;o++){ const c2=12*o+pc; const dd=Math.abs(c2-st); if(dd>0&&dd<cbd){cbd=dd;ct=c2;} } }
          ct=Math.max(56,Math.min(90,ct));
          PE(ct,vMel-4,3,1.9); prevMel=ct;
        } else if(gi===2){
          const d1=Math.max(55,_stepSc(mm,-1)), d2=Math.max(54,_stepSc(mm,-2));
          PE(mm,vMel,0,1.8); PE(d1,vMel-6,2,1.8); PE(d2,vMel-10,4,1.8);
          prevMel=d2;
        } else {
          for(let q=4;q>=1;q--){ PE(Math.max(55,_stepSc(mm,-q)),Math.max(28,vMel-16),(4-q)*1,0.9); }
          PE(mm,vMel,4,3.4); prevMel=mm;
        }
      }
      t+=barMs;
      if(last && b2>=bars[si]-2){ t+=Math.round(barMs*0.12); }   // ritardando
    }
  }
  // final: dominant sigh, then rolled tonic chord — long, fading
  const fifthT=(tonic+7)%12, thirdT=(tonic+(minor?3:4))%12;
  const roll=[{m:36+tonic,v:52,d:0},{m:48+tonic,v:46,d:80},{m:48+thirdT+(thirdT<tonic?12:0),v:42,d:160},{m:48+fifthT+(fifthT<tonic?12:0),v:40,d:240},{m:60+tonic,v:44,d:320}];
  for(const r2 of roll){
    evts.push({n:[{m:r2.m,v:r2.v,durMs:3600,bass:r2.m<45}],startMs:t+eighth+r2.d,idx:evIdx++,cg:base[0].cg,band:base[0].band,colStep:4,_chroma:gc2,_flat:0,_domPc:tonic,_lum:gl});
  }
  return evts;
}

// ── CARL VINE — driving toccata: shifting accents, added-note brightness. ──
// The modern engine none of the others have: a relentless sixteenth pulse
// whose accents keep migrating (3+3+2 / 2+3+3), punchy bass octaves ONLY on
// the accents, luminous add2 harmonies from the picture's colours, a floating
// lyrical breather mid-piece, and a rising coda. Energy is the picture's.
function composeImageVine(px,nc,nr,table,colorMode,dir){
  const base = pixelsToImageEvents(px,nc,nr,table,colorMode,'lr',0);
  if(!base || !base.length) return base||[];
  let ss=0x811c9dc5;
  for(let i=0;i<px.length;i+=97){ const q=px[i]; ss=((ss^(q.r+q.g*7+q.b*13))*0x01000193)>>>0; }
  const R=(salt)=>{ const f=_seedRnd(10200+salt,ss,0,0); f(); return f; };
  const bandsMap=new Map();
  for(const e of base){ if(!bandsMap.has(e.band)) bandsMap.set(e.band,[]); bandsMap.get(e.band).push(e); }
  const bandKeys=[...bandsMap.keys()].sort((a,b)=>a-b);
  const S=Math.max(8,Math.min(16,bandKeys.length));
  const secs=[];
  for(let si=0;si<S;si++){
    const b0=Math.floor(si*bandKeys.length/S), b1=Math.floor((si+1)*bandKeys.length/S);
    const cells=[]; for(let b=b0;b<Math.max(b0+1,b1);b++){ const bk=bandKeys[b]; if(bk!=null) cells.push(...bandsMap.get(bk)); }
    if(!cells.length) continue;
    const hist=new Float32Array(12); const src={}; let lum=0,chr=0;
    for(const c of cells){
      lum+=(c._lum||50); chr+=(c._chroma||0);
      for(const n0 of (c.n||[])){ if(!n0||n0.bass) continue; const pc=((n0.m%12)+12)%12; const w=(n0.v||60);
        hist[pc]+=w; if(!src[pc]||w>src[pc].w){ src[pc]={w,cg:c.cg,band:c.band,_lum:c._lum,_chroma:c._chroma}; } }
    }
    lum/=cells.length; chr/=cells.length;
    let uniq=0; for(let p2=0;p2<12;p2++) if(hist[p2]>0) uniq++;
    secs.push({hist,src,lum,chr,homog:1-Math.min(1,uniq/9),cells});
  }
  if(!secs.length) return base;
  const g=new Float32Array(12); let gl=0,gc2=0;
  for(const sec of secs){ for(let p2=0;p2<12;p2++) g[p2]+=sec.hist[p2]; gl+=sec.lum; gc2+=sec.chr; }
  gl/=secs.length; gc2/=secs.length;
  let tonic=0,tb=-1; for(let p2=0;p2<12;p2++) if(g[p2]>tb){tb=g[p2];tonic=p2;}
  const minor = gl<=42;                                    // Vine leans bright
  const scale = minor?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
  const scAbs=scale.map(d=>(tonic+d)%12);
  const snap=(m)=>{ let best=m,bd=99; for(let o=-1;o<=1;o++){ for(const pc of scAbs){ const c2=12*Math.floor(m/12)+pc+12*o; const dd=Math.abs(c2-m); if(dd<bd){bd=dd;best=c2;} } } return best; };
  const stepSc=(m,nSteps)=>{ let cur=snap(m); const dir2=nSteps>0?1:-1; for(let q=0;q<Math.abs(nSteps);q++){ let nxt=cur+dir2; while(scAbs.indexOf(((nxt%12)+12)%12)<0) nxt+=dir2; cur=nxt; } return cur; };
  const inScale=(pc)=>{ let best=pc,bd=99; for(const a of scAbs){ const dd=Math.min((a-pc+12)%12,(pc-a+12)%12); if(dd<bd){bd=dd;best=a;} } return best; };
  // sixteenth motor — vivid pictures push harder
  const six=Math.round(165-Math.min(1,gc2/45)*35);         // ~130-165ms
  const barMs=six*8;                                       // 8 sixteenths per bar
  let bars=secs.map(sec=>3+Math.round((1-sec.homog)*2));   // 3-5 bars each
  const maxBars=Math.floor(140000/barMs);
  const tot=bars.reduce((a,b)=>a+b,0);
  if(tot>maxBars){ bars=bars.map(b=>Math.max(2,Math.round(b*maxBars/tot))); }
  const totBars=bars.reduce((a,b)=>a+b,0);
  const totalMs=totBars*barMs;
  const evts=[]; let t=0, evIdx=0, barNo=0;
  const rv=R(1);
  // breather: 3 bars around phi — the pulse stops and add9 clouds float
  const brStart=Math.floor(totBars*0.60), brEnd=Math.min(totBars-4,brStart+3);
  const srcOf=(sec,pc)=>sec.src[pc]||{cg:sec.cells[0].cg,band:sec.cells[0].band,_lum:sec.lum,_chroma:sec.chr};
  for(let si=0;si<secs.length;si++){
    const sec=secs[si], last=si===secs.length-1;
    const ranked=[...Array(12).keys()].filter(p2=>sec.hist[p2]>0).sort((a,b)=>sec.hist[b]-sec.hist[a]).map(inScale);
    const uniqR=[...new Set(ranked)];
    const rootX=uniqR[0]!=null?uniqR[0]:tonic;
    const rootY=uniqR[1]!=null?uniqR[1]:((tonic+5)%12);
    for(let b2=0;b2<bars[si];b2++,barNo++){
      const pos=t/Math.max(1,totalMs);
      const swell=0.8+0.3*Math.exp(-((pos-0.85)*(pos-0.85))/(2*0.12*0.12)); // coda grows
      if(barNo>=brStart && barNo<brEnd){
        // BREATHER — floating added-note cloud, very soft, no pulse
        const r0=snap(52+rootX);
        const cl=[r0, stepSc(r0,2), stepSc(r0,4), stepSc(r0,1)+12];
        const scB=srcOf(sec,rootX);
        for(let q=0;q<cl.length;q++){
          evts.push({n:[{m:cl[q],v:Math.round(34-q*2),durMs:Math.round(barMs*1.15),bass:q===0}],startMs:t+q*Math.round(six*0.9),idx:evIdx++,cg:scB.cg,band:scB.band,colStep:4,_chroma:sec.chr,_flat:0,_domPc:((cl[q]%12)+12)%12,_lum:sec.lum});
        }
        t+=barMs;
        continue;
      }
      const root=(b2%2===0)?rootX:rootY;
      const fPos=barNo/Math.max(1,totBars-1);
      // EPISODES: 4-bar BUILD (bass+stabs only) → motor → periodic HALF-TIME
      // groove breaks (2 bars of accented stabs with air) → motor → coda.
      const phV = barNo<4 ? 'build' : ((barNo%12>=10 && fPos<0.8 && !(barNo>=brStart&&barNo<brEnd)) ? 'half' : 'motor');
      const b0=snap(60+root);
      const tones=[b0, stepSc(b0,1), stepSc(b0,2), stepSc(b0,4)];
      const acc=(barNo%4===3)?[0,2,5]:[0,3,6];
      const isCoda=last;
      const lift=isCoda?Math.min(12,(b2)*2):0;
      const scS=srcOf(sec,root);
      for(let k=0;k<8;k++){
        const isAcc=acc.indexOf(k)>=0;
        if(phV!=='motor' && !isAcc && !(phV==='build'&&k%2===0&&barNo>=2)) continue;
        const tone=tones[(k*2+((barNo>>1)&1))%4]+ (isCoda?lift:0);
        const vv0=(44+Math.min(22,sec.chr*0.6))*(isAcc?1.35:1)*swell*(phV==='build'?0.8:1);
        const v=Math.round(vv0);
        const ns=[{m:tone,v:Math.min(112,v),durMs:Math.round(six*(phV==='half'?2.6:1.5))}];
        if(isAcc && phV!=='build'){ ns.push({m:tone+12,v:Math.max(26,v-18),durMs:Math.round(six*1.5)}); }
        const pcT=((tone%12)+12)%12; const scT=srcOf(sec,pcT);
        evts.push({n:ns,startMs:t+k*six,idx:evIdx++,cg:scT.cg,band:scT.band,colStep:4,_chroma:scT._chroma||sec.chr,_flat:0,_domPc:pcT,_lum:scT._lum||sec.lum});
        if(isAcc){
          const bm=snap(36+root)+(isCoda?Math.min(7,lift):0);
          evts.push({n:[{m:bm,v:Math.min(110,Math.round(80*swell*(phV==='build'?0.9:1))),durMs:Math.round(six*(phV==='half'?2.2:1.1)),bass:true}],startMs:t+k*six,idx:evIdx++,cg:scS.cg,band:scS.band,colStep:4,_chroma:sec.chr,_flat:0,_domPc:root,_lum:sec.lum});
        }
      }
      t+=barMs;
    }
  }
  // final stab: tonic add2, accented, then a ringing hold
  const f0=snap(48+tonic);
  evts.push({n:[{m:f0-12,v:104,durMs:260,bass:true},{m:f0,v:100,durMs:260},{m:stepSc(f0,1),v:92,durMs:260},{m:stepSc(f0,4),v:94,durMs:260}],startMs:t+six,idx:evIdx++,cg:base[0].cg,band:base[0].band,colStep:4,_chroma:gc2,_flat:0,_domPc:tonic,_lum:gl});
  evts.push({n:[{m:f0-12,v:56,durMs:3400,bass:true},{m:f0,v:52,durMs:3400},{m:stepSc(f0,2),v:48,durMs:3400},{m:stepSc(f0,4),v:46,durMs:3400}],startMs:t+six+320,idx:evIdx++,cg:base[0].cg,band:base[0].band,colStep:4,_chroma:gc2,_flat:0,_domPc:tonic,_lum:gl});
  return evts;
}

// ── DEBUSSY — impressionist planing: chords glide, pedal blurs, light ripples. ──
// Pastel-bright pictures breathe in PENTATONIC, dark-mysterious ones in
// WHOLE-TONE. Whole chords slide stepwise along the scale (planing), heavy
// overlap acts as the pedal, busy rows shimmer with quick ripples. Dynamics
// move in soft waves with one larger swell mid-piece — water, not drama.
function composeImageDebussy(px,nc,nr,table,colorMode,dir){
  const base = pixelsToImageEvents(px,nc,nr,table,colorMode,'lr',0);
  if(!base || !base.length) return base||[];
  let ss=0x811c9dc5;
  for(let i=0;i<px.length;i+=97){ const q=px[i]; ss=((ss^(q.r+q.g*7+q.b*13))*0x01000193)>>>0; }
  const R=(salt)=>{ const f=_seedRnd(10100+salt,ss,0,0); f(); return f; };
  const bandsMap=new Map();
  for(const e of base){ if(!bandsMap.has(e.band)) bandsMap.set(e.band,[]); bandsMap.get(e.band).push(e); }
  const bandKeys=[...bandsMap.keys()].sort((a,b)=>a-b);
  const S=Math.max(10,Math.min(20,bandKeys.length));
  const secs=[];
  for(let si=0;si<S;si++){
    const b0=Math.floor(si*bandKeys.length/S), b1=Math.floor((si+1)*bandKeys.length/S);
    const cells=[]; for(let b=b0;b<Math.max(b0+1,b1);b++){ const bk=bandKeys[b]; if(bk!=null) cells.push(...bandsMap.get(bk)); }
    if(!cells.length) continue;
    const hist=new Float32Array(12); const src={}; let lum=0,chr=0;
    for(const c of cells){
      lum+=(c._lum||50); chr+=(c._chroma||0);
      for(const n0 of (c.n||[])){ if(!n0||n0.bass) continue; const pc=((n0.m%12)+12)%12; const w=(n0.v||60);
        hist[pc]+=w; if(!src[pc]||w>src[pc].w){ src[pc]={w,cg:c.cg,band:c.band,_lum:c._lum,_chroma:c._chroma}; } }
    }
    lum/=cells.length; chr/=cells.length;
    let uniq=0; for(let p2=0;p2<12;p2++) if(hist[p2]>0) uniq++;
    secs.push({hist,src,lum,chr,homog:1-Math.min(1,uniq/9),cells});
  }
  if(!secs.length) return base;
  const g=new Float32Array(12); let gl=0,gc2=0;
  for(const sec of secs){ for(let p2=0;p2<12;p2++) g[p2]+=sec.hist[p2]; gl+=sec.lum; gc2+=sec.chr; }
  gl/=secs.length; gc2/=secs.length;
  let tonic=0,tb=-1; for(let p2=0;p2<12;p2++) if(g[p2]>tb){tb=g[p2];tonic=p2;}
  // ── Rêverie model: flowing arpeggios on a warm functional floor, and a
  // SINGING PHRASE that literally returns (A A' B A). The old sliding
  // planing-wash had no anchor — this one you can hum along to.
  const dark = gl<=44;
  const scale = dark?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
  const scAbs=scale.map(d=>(tonic+d)%12);
  const snap=(m)=>{ let best=m,bd=99; for(let o=-1;o<=1;o++){ for(const pc of scAbs){ const c2=12*Math.floor(m/12)+pc+12*o; const dd=Math.abs(c2-m); if(dd<bd){bd=dd;best=c2;} } } return best; };
  const stepSc=(m,nSteps)=>{ let cur=snap(m); const dir2=nSteps>0?1:-1; for(let q=0;q<Math.abs(nSteps);q++){ let nxt=cur+dir2; while(scAbs.indexOf(((nxt%12)+12)%12)<0) nxt+=dir2; cur=nxt; } return cur; };
  const degPc=(d)=>scAbs[((d%scAbs.length)+scAbs.length)%scAbs.length];
  const eighth=Math.round(300-Math.min(1,gc2/45)*40);      // gentle compound lilt
  const barMs=eighth*6;
  const maxBars=Math.max(24,Math.floor(150000/barMs));
  const totBars=maxBars - (maxBars%4);
  const totalMs=totBars*barMs+4000;
  const prog=[0,5,3,4];                                    // I vi IV V
  const rp=R(1);
  const evts=[]; let evIdx=0;
  const secAt=(bar)=>secs[Math.min(secs.length-1,Math.floor(bar/totBars*secs.length))];
  const srcOf=(sec,pc)=>sec.src[pc]||{cg:sec.cells[0].cg,band:sec.cells[0].band,_lum:sec.lum,_chroma:sec.chr};
  const wave=(pos)=>0.84+0.08*Math.sin(pos*11)+0.18*Math.exp(-((pos-0.55)*(pos-0.55))/(2*0.18*0.18));
  // one melodic PHRASE per role, built from the picture's two strongest colours
  const mkPhrase=(startM,shape)=>shape.map(o=>({offE:o[0],durE:o[1],step:o[2]}));
  const shapeA=[[0,3,0],[3,3,1],[6,2,2],[8,4,1]];          // rise and settle
  const shapeB=[[0,3,4],[3,2,3],[6,2,2],[8,4,3]];          // higher answer
  for(let bar=0;bar<totBars;bar++){
    const sec=secAt(bar), pos=(bar*barMs)/totalMs, env=wave(pos);
    const deg=prog[bar%4];
    const rootPc=degPc(deg);
    const thirdPc=degPc(deg+2), fifthPc=degPc(deg+4), ninthPc=degPc(deg+1);
    const t0=bar*barMs;
    // ARPEGGIO — six soft eighths, two octaves of the bar's chord; the I and
    // IV bars glow with an added ninth (the Debussy colour)
    let b0=48+rootPc; b0=snap(b0);
    let t3=b0+1; while(((t3%12)+12)%12!==thirdPc) t3++;
    let t5=t3+1; while(((t5%12)+12)%12!==fifthPc) t5++;
    let n9=b0+13; while(((n9%12)+12)%12!==ninthPc) n9++;
    const color=(deg===0||deg===3);
    const fPos=bar/Math.max(1,totBars-1);
    const slotB=((bar>>1)%4===2);
    const arp=[b0, t5, color?n9:(t3+12), t5, b0+12, t5];
    if(slotB && fPos>0.2){
      // B phrase wears different clothing: two soft ROLLED chords per bar
      // instead of the running arpeggio — the fabric itself changes.
      for(const off of [0,3]){
        const chd=[b0,t3,t5,(color?n9:b0+12)];
        for(let q=0;q<chd.length;q++){
          const pcA=((chd[q]%12)+12)%12; const scA=srcOf(sec,pcA);
          evts.push({n:[{m:chd[q],v:Math.round((38-q*2)*env),durMs:Math.round(eighth*3*1.9),bass:q===0&&off===0}],startMs:t0+off*eighth+q*70,idx:evIdx++,cg:scA.cg,band:scA.band,colStep:4,_chroma:scA._chroma||sec.chr,_flat:0,_domPc:pcA,_lum:scA._lum||sec.lum});
        }
      }
    } else
    for(let k=0;k<6;k++){
      const pcA=((arp[k]%12)+12)%12; const scA=srcOf(sec,pcA);
      evts.push({n:[{m:arp[k],v:Math.round((36+Math.min(10,sec.chr*0.3))*env),durMs:Math.round(eighth*2.1),bass:k===0}],startMs:t0+k*eighth,idx:evIdx++,cg:scA.cg,band:scA.band,colStep:4,_chroma:scA._chroma||sec.chr,_flat:0,_domPc:pcA,_lum:scA._lum||sec.lum});
    }
    // MELODY — 2-bar phrases cycling A A' B A; each note anchors on a chord
    // tone of ITS bar (steps land on 3rd/5th/root), so it always belongs.
    if(bar%2===0 && bar>=4){
      const slot=(bar>>1)%4;                               // A A' B A
      const isB=(slot===2), isA2=(slot===1);
      const base=snap((isB?79:74)+thirdPc);
      const shape=isB?shapeB:shapeA;
      let prevM=null;
      for(let ni=0;ni<shape.length;ni++){
        const o=shape[ni];
        const inBar2=o.offE>=6;
        const dg=inBar2?prog[(bar+1)%4]:deg;
        const anchors=[degPc(dg),degPc(dg+2),degPc(dg+4)];
        let mm=stepSc(base,o.step + (isA2&&ni===shape.length-1?1:0));
        // pull the tone onto the nearest chord anchor of its bar
        let best=mm,bd=99;
        for(const pcT of anchors){ for(let o2=5;o2<=7;o2++){ const c2=12*o2+pcT; const dd=Math.abs(c2-mm); if(dd<bd){bd=dd;best=c2;} } }
        mm=Math.max(67,Math.min(91,best));
        if(prevM!=null && Math.abs(mm-prevM)>9){ mm=prevM+(mm>prevM?7:-7); mm=snap(mm); }
        prevM=mm;
        const pcM=((mm%12)+12)%12; const scM=srcOf(sec,pcM);
        evts.push({n:[{m:mm,v:Math.round(60*env*(isB?1.08:1)),durMs:Math.round(o.durE*eighth*1.35)}],startMs:t0+o.offE*eighth+Math.round((rp()-0.5)*50),idx:evIdx++,cg:scM.cg,band:scM.band,colStep:4,_chroma:scM._chroma||sec.chr,_flat:0,_domPc:pcM,_lum:scM._lum||sec.lum});
      }
    }
  }
  // plagal close: IV(add9) → I add9, rolled and very soft — the water settles
  let tEnd=totBars*barMs;
  const ivPc=degPc(3), iv3=degPc(5), r9=degPc(1), r3=degPc(2), r5=degPc(4);
  evts.push({n:[{m:snap(41+ivPc),v:40,durMs:Math.round(barMs*1.1),bass:true},{m:snap(53+ivPc),v:34,durMs:Math.round(barMs*1.1)},{m:snap(57+iv3),v:32,durMs:Math.round(barMs*1.1)}],startMs:tEnd,idx:evIdx++,cg:base[0].cg,band:base[0].band,colStep:4,_chroma:gc2,_flat:0,_domPc:ivPc,_lum:gl});
  tEnd+=Math.round(barMs*1.1);
  const roll=[[36+tonic,42,0,1],[48+tonic,38,90,0],[48+r3,34,180,0],[48+r5,32,270,0],[60+r9,30,360,0],[60+tonic,33,450,0]];
  for(const r2 of roll){
    evts.push({n:[{m:snap(r2[0]),v:r2[1],durMs:4400,bass:!!r2[3]}],startMs:tEnd+r2[2],idx:evIdx++,cg:base[0].cg,band:base[0].band,colStep:4,_chroma:gc2,_flat:0,_domPc:tonic,_lum:gl});
  }
  return evts;
}

function bakeImageChords(src){
  if(!src || !src.length) return [];
  const out = [];
  for(let i=0;i<src.length;i++){
    const c = src[i];
    if(!c || !c.n || !c.n.length) continue;
    // Skip merged-plane members — they are sustained by the run's lead chord
    // already (see _runLen handling below). Image playback also skips these.
    if(c._playable === false) continue;
    const durMul = c._runLen || 3;
    const velScale = c._runLen ? 1 : 0.75;
    // TREMOLO planes — expand into a re-strike series matching image playback
    // (which gates _trem only on _runLen>=16). Re-strikes are deterministic;
    // we use the chord's _tremSeed (set by image scan) for the PRNG so the
    // same image bakes the same MIDI.
    if(c._tremolo === true){
      const gap0 = Math.max(85, (c._tremoloMs || 180));
      const fullSpan = Math.round((c.n[0]?.durMs || 300) * durMul);
      const endRatio = Math.max(0.5, Math.min(1.8, c._tremEndRatio || 1));
      const lift = c._tremLift || 0;
      const liftCycles = Math.max(1, c._tremLiftCycles || 1);
      const swell = Math.max(0, Math.min(0.5, c._tremSwell != null ? c._tremSwell : 0.25));
      const lifts = [0,0,0,lift||7,7,12,5,-5,3];
      // mulberry32 PRNG, same as runtime playback uses for tremolo.
      let _seed = (c._tremSeed >>> 0) || 0x9e3779b9;
      const rnd = () => { _seed |= 0; _seed = _seed + 0x6D2B79F5 | 0; let tt = Math.imul(_seed ^ _seed >>> 15, 1 | _seed); tt = tt + Math.imul(tt ^ tt >>> 7, 61 | tt) ^ tt; return ((tt ^ tt >>> 14) >>> 0) / 4294967296; };
      let topM = -Infinity;
      for(const n of c.n){ if(n.m > topM) topM = n.m; }
      let t = 0, r = 0;
      const maxReps = 120;
      while(t < fullSpan - 20 && r < maxReps){
        const prog = fullSpan > 0 ? t / fullSpan : 0;
        const gGlide = gap0 * (1 + (endRatio - 1) * prog);
        const jitT = 0.72 + 0.56 * rnd();
        const gNow = Math.max(70, Math.round(gGlide * jitT));
        const segDur = Math.max(95, Math.round(gNow * 1.35));
        const skip = (r > 0 && rnd() < 0.12);
        if(!skip){
          const env = (1 - swell * 0.5 + swell * Math.sin(Math.PI * prog)) * (0.82 + 0.36 * rnd());
          const cyclePhase = lift > 0 ? (Math.sin(Math.PI * liftCycles * prog) > 0.55) : false;
          const randLift = (rnd() < 0.22) ? lifts[(rnd() * lifts.length) | 0] : 0;
          const topShift = cyclePhase ? lift : randLift;
          const baseVel = r === 0 ? 1 : 0.78;
          const tail = r === 0 ? 0.4 : 0.14;
          // Each re-strike is a chord event. Notes are the original notes,
          // velocity scaled by env*baseVel, top voice optionally lifted.
          const strikeNotes = c.n.map(n => {
            const isTop = (n.m === topM);
            const v = Math.max(20, Math.min(127, Math.round((n.v || 80) * env * baseVel * velScale)));
            const m = isTop && topShift !== 0 ? Math.max(0, Math.min(127, n.m + topShift)) : n.m;
            return { m, v, durMs: Math.max(80, Math.round((n.durMs || 300) * tail)), _paintPc: n._paintPc };
          });
          out.push({ n: strikeNotes, startMs: (c.startMs || 0) + t, durQ: c.durQ, _domPc: c._domPc, _lum: c._lum });
        }
        t += gNow;
        r++;
      }
      continue; // tremolo done
    }
    // ARPEGGIO — notes have per-note offsetMs; unfold each into its own
    // single-note chord event so the MIDI carries the offset timing.
    const hasArp = c.n.some(n => typeof n.offsetMs === 'number' && n.offsetMs > 0);
    if(hasArp){
      for(const n of c.n){
        const off = (typeof n.offsetMs === 'number' && n.offsetMs > 0) ? n.offsetMs : 0;
        out.push({
          n: [{ m: n.m, v: Math.max(20, Math.min(127, Math.round((n.v || 80) * velScale))), durMs: Math.max(80, n.durMs || 300), _paintPc: n._paintPc }],
          startMs: (c.startMs || 0) + off,
          durQ: c.durQ,
          _domPc: c._domPc,
          _lum: c._lum
        });
      }
      continue;
    }
    // Default: a normal (possibly sustained) chord. Extend durMs by durMul
    // so the chord rings into following steps the way image-mode playback
    // does. velScale applied to soften piling-up overlapping unmerged chords.
    const baseNotes = c.n.map(n => ({
      m: n.m,
      v: Math.max(20, Math.min(127, Math.round((n.v || 80) * velScale))),
      durMs: Math.max(80, Math.round((n.durMs || 300) * durMul)),
      _paintPc: n._paintPc
    }));
    out.push({ n: baseNotes, startMs: c.startMs || 0, durQ: c.durQ, _domPc: c._domPc, _lum: c._lum });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Bauhaus (geometric school, 1919) ──────────────────────────────────────
// Geometric vocabulary: circle, square, triangle, half/quarter-circle, lens,
// targets, arches. Flat primary colours (blue/red/yellow + black/cream/maroon)
// drawn from the chords. Hard edges, modular grid. 7 deterministic phases via
// phaseIndex (the Next/Vary button cycles them). Same overlay architecture as
// Stella/af Klint: signature (ctx,CW,CH,chords,lim,gc,sessionSeed,mode,phaseIndex),
// progressive reveal through `lim`, colour from chords through `gc`.
//   0 = Modular grid      (airy poster: shapes across cells, target/petal/star)
//   1 = Dense circles     (tight half-circle grid, rich palette)
//   2 = Abstract face     (cubist face: black bars, target eyes, drips)
//   3 = Ausstellung       (translucent overlapping circles + black line grid)
//   4 = Stacked arches    (nested rainbow half-rings)
//   5 = Offset circles    (grid + big circles straddling cell lines)
//   6 = Line construction (thick black bars dividing fields + basic shapes)
// ───────────────────────────────────────────────────────────────────────────
function drawBauhausOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  const ss = sessionSeed | 0;
  const cn = chords.length;

  // Colour for chord i (averaged note colours), optional brightness multiplier.
  function chordCol(i, mul){
    const idx = Math.min(cn-1, Math.max(0, ((i % cn)+cn)%cn));
    const chord = chords[idx];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes);
    if(!notes || !notes.length) return [120,100,140];
    let R=0,G=0,B=0,c=0;
    for(const note of notes){
      const m = note.m!==undefined?note.m:note;
      const v = note.v!==undefined?note.v:80;
      const [r,g,b] = gc(m, v); R+=r; G+=g; B+=b; c++;
    }
    const k = mul===undefined?1:mul;
    return [Math.min(255,R/c*k), Math.min(255,G/c*k), Math.min(255,B/c*k)];
  }
  const css = (c)=>`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
  const cssa = (c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;

  // Reveal fraction so the painting builds up with playback.
  const revealFrac = Math.max(0, Math.min(1, lim / cn));

  const _pn=_capN(7); const pick=((phaseIndex|0)%_pn+_pn)%_pn;
  if(pick===1){ bauhausPhaseDense(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===2){ bauhausPhaseFace(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===3){ bauhausPhaseAusst(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===4){ bauhausPhaseArches(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===5){ bauhausPhaseOffset(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===6){ bauhausPhaseLines(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  bauhausPhaseGrid(ctx,CW,CH,chords,lim,gc,ss,mode);  // pick 0
}

// ── Shared Bauhaus helpers (each phase re-derives chordCol locally for purity)─
function _bhChordCol(chords, cn, gc, i, mul){
  const idx = Math.min(cn-1, Math.max(0, ((i % cn)+cn)%cn));
  const chord = chords[idx];
  _setCurE(chord && chord._E);
  const notes = chord && (chord.n || chord.notes);
  if(!notes || !notes.length) return [120,100,140];
  let R=0,G=0,B=0,c=0;
  for(const note of notes){
    const m = note.m!==undefined?note.m:note;
    const v = note.v!==undefined?note.v:80;
    const [r,g,b] = gc(m, v); R+=r; G+=g; B+=b; c++;
  }
  const k = mul===undefined?1:mul;
  return [Math.min(255,R/c*k), Math.min(255,G/c*k), Math.min(255,B/c*k)];
}
function _bhCss(c){ return `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`; }
function _bhCssA(c,a){ return `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`; }
// Bauhaus accent palette — fully song-aware. 6 chord-derived colours sampled
// across the timeline + 6 anchor colours from the song's top pitch classes
// (replaces the old canonical Bauhaus hardcoded hues so the painting reflects
// the actual piece — synth-pop = neon, late Romantic = muted — instead of
// every song being forced through the same blue/red/ochre signature).
function _bhPalette(chords, cn, gc, rnd){
  const pal = [];
  // 6 chord-derived colours spread across the song timeline.
  const k = Math.min(cn, 6);
  for(let i=0;i<k;i++) pal.push(_bhChordCol(chords, cn, gc, Math.floor(i*cn/Math.max(1,k))));
  // 6 song-aware anchors from the top pitch classes (gc() routes them through
  // the active mode the same way the canonical loop fed canonical RGBs).
  const tops = (typeof _songTopPitches === 'function') ? _songTopPitches(chords, 6) : null;
  if(tops && tops.length && typeof gc === 'function'){
    for(const m of tops){
      const c = gc(m, 100);
      if(Array.isArray(c)) pal.push([c[0]|0, c[1]|0, c[2]|0]);
    }
  } else {
    // Hard fallback (no chord data): keep the canonical poster hues so the
    // painting still has 12 entries to draw from. Should not happen at runtime.
    const canon = [[43,95,165],[192,57,43],[232,163,61],[79,158,128],[212,104,63],[26,26,24]];
    for(const c of canon) pal.push(c);
  }
  return pal;
}
function _bhPick(pal, rnd, exclude){
  let c, tries=0;
  do{ c = pal[Math.floor(rnd()*pal.length)]; tries++; }
  while(exclude && c===exclude && tries<8);
  return c;
}
// flat shape primitives (hard-edge), clipped to a cell where relevant
function _bhClipCell(ctx,x,y,w,h,fn){ ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip(); fn(); ctx.restore(); }
function _bhCircle(ctx,cx,cy,r,col,a){ ctx.save(); if(a!=null)ctx.globalAlpha=a; ctx.fillStyle=_bhCss(col); ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill(); ctx.restore(); }
function _bhRing(ctx,cx,cy,r,lw,col){ ctx.strokeStyle=_bhCss(col); ctx.lineWidth=lw; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke(); }
function _bhSq(ctx,x,y,w,h,col){ ctx.fillStyle=_bhCss(col); ctx.fillRect(x,y,w,h); }
function _bhHalf(ctx,x,y,w,h,col,rot){ _bhClipCell(ctx,x,y,w,h,()=>{ ctx.fillStyle=_bhCss(col); ctx.beginPath(); const s=Math.max(w,h);
  if(rot===0)ctx.arc(x+w/2,y+h,s,Math.PI,0); else if(rot===1)ctx.arc(x,y+h/2,s,-Math.PI/2,Math.PI/2);
  else if(rot===2)ctx.arc(x+w/2,y,s,0,Math.PI); else ctx.arc(x+w,y+h/2,s,Math.PI/2,Math.PI*1.5); ctx.closePath(); ctx.fill(); }); }
function _bhQuarter(ctx,x,y,w,h,col,cn4){ _bhClipCell(ctx,x,y,w,h,()=>{ ctx.fillStyle=_bhCss(col); const s=Math.max(w,h);
  const cx=(cn4===0||cn4===3)?x:x+w, cy=(cn4===0||cn4===1)?y:y+h; ctx.beginPath(); ctx.moveTo(cx,cy);
  ctx.arc(cx,cy,s,cn4*Math.PI/2,(cn4+1)*Math.PI/2); ctx.closePath(); ctx.fill(); }); }
function _bhTri(ctx,x,y,w,h,col,d){ ctx.fillStyle=_bhCss(col); ctx.beginPath();
  if(d===0){ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.lineTo(x,y+h);} else if(d===1){ctx.moveTo(x+w,y);ctx.lineTo(x+w,y+h);ctx.lineTo(x,y);}
  else if(d===2){ctx.moveTo(x+w,y+h);ctx.lineTo(x,y+h);ctx.lineTo(x+w,y);} else {ctx.moveTo(x,y+h);ctx.lineTo(x,y);ctx.lineTo(x+w,y+h);} ctx.closePath(); ctx.fill(); }
function _bhTarget(ctx,cx,cy,r,pal,rnd){ const a=_bhPick(pal,rnd); _bhRing(ctx,cx,cy,r,r*0.28,a); _bhCircle(ctx,cx,cy,r*0.5,_bhPick(pal,rnd,a)); }
function _bhPetals(ctx,cx,cy,R,pal,rnd){ for(let p=0;p<4;p++){ ctx.save(); ctx.translate(cx,cy); ctx.rotate(p*Math.PI/2); ctx.fillStyle=_bhCss(_bhPick(pal,rnd));
  ctx.beginPath(); ctx.arc(-R*0.5,0,R*0.5,-Math.PI/2,Math.PI/2); ctx.arc(R*0.5,0,R*0.5,Math.PI/2,Math.PI*1.5); ctx.closePath(); ctx.fill(); ctx.restore(); } }
function _bhStar4(ctx,cx,cy,r,col){ ctx.fillStyle=_bhCss(col); ctx.beginPath(); for(let i=0;i<4;i++){ const a=i*Math.PI/2,a2=a+Math.PI/4;
  ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r); ctx.lineTo(cx+Math.cos(a2)*r*0.34,cy+Math.sin(a2)*r*0.34); } ctx.closePath(); ctx.fill(); }
function _bhDrips(ctx,x,yt,yb,colCss,n,rnd){ ctx.strokeStyle=colCss; for(let i=0;i<n;i++){ const dx=x+(rnd()-0.5)*20; ctx.lineWidth=1+rnd()*2.5; ctx.beginPath(); ctx.moveTo(dx,yt); ctx.lineTo(dx,yt+(yb-yt)*(0.3+rnd()*0.7)); ctx.stroke(); } }
function _bhCreamFill(ctx,CW,CH){ ctx.fillStyle='rgb(239,233,221)'; ctx.fillRect(0,0,CW,CH); }

// ── Phase 0: Modular grid (airy poster) ───────────────────────────────────
function bauhausPhaseGrid(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0, cn=chords.length, rnd=_seedRnd(401,ss,0,0);
  const pal=_bhPalette(chords,cn,gc,rnd);
  _bhCreamFill(ctx,CW,CH);
  const cols=4, rows=6, cw=CW/cols, ch=CH/rows;
  const reveal=Math.max(0,Math.min(1,lim/cn));
  const shown=Math.ceil(cols*rows*reveal);
  let idx=0;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    if(idx++>shown) { continue; }
    if(rnd()<0.30) continue;
    const x=c*cw,y=r*ch;
    if(rnd()<0.45) _bhSq(ctx,x,y,cw,ch,_bhPick(pal,rnd));
    const s=rnd();
    if(s<0.22) _bhHalf(ctx,x,y,cw,ch,_bhPick(pal,rnd),Math.floor(rnd()*4));
    else if(s<0.42) _bhQuarter(ctx,x,y,cw,ch,_bhPick(pal,rnd),Math.floor(rnd()*4));
    else if(s<0.55) _bhTri(ctx,x,y,cw,ch,_bhPick(pal,rnd),Math.floor(rnd()*4));
    else if(s<0.65) _bhCircle(ctx,x+cw/2,y+ch/2,Math.min(cw,ch)*0.42,_bhPick(pal,rnd));
  }
  if(reveal>0.4) _bhTarget(ctx,cw*1.4,ch*2.3,Math.min(cw,ch)*0.7,pal,rnd);
  if(reveal>0.6) _bhPetals(ctx,cw*2.5,ch*4.3,Math.min(cw,ch)*0.95,pal,rnd);
  if(reveal>0.5){ const sx=cw*2.7,sy=ch*0.7,sr=Math.min(cw,ch)*0.7; _bhCircle(ctx,sx,sy,sr,[43,95,165]); _bhStar4(ctx,sx,sy,sr*0.7,[232,163,61]); }
}

// ── Phase 1: Dense half-circle grid (rich palette) ────────────────────────
function bauhausPhaseDense(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0, cn=chords.length, rnd=_seedRnd(402,ss,0,0);
  // richer palette: chord colours + dark accents
  const pal=_bhPalette(chords,cn,gc,rnd);
  pal.push([58,20,32],[255,255,255],[217,140,140],[122,35,53]);
  // maroon ground
  _bhSq(ctx,0,0,CW,CH,[122,35,53]);
  const cols=6, rows=9, cw=CW/cols, ch=CH/rows;
  const reveal=Math.max(0,Math.min(1,lim/cn));
  const shown=Math.ceil(cols*rows*reveal);
  let idx=0;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    if(idx++>shown) continue;
    const x=c*cw,y=r*ch, bg=_bhPick(pal,rnd); _bhSq(ctx,x,y,cw,ch,bg);
    const k=rnd(), fg=_bhPick(pal,rnd,bg);
    if(k<0.42) _bhHalf(ctx,x,y,cw,ch,fg,Math.floor(rnd()*4));
    else if(k<0.66) _bhQuarter(ctx,x,y,cw,ch,fg,Math.floor(rnd()*4));
    else if(k<0.86) _bhCircle(ctx,x+cw/2,y+ch/2,Math.min(cw,ch)*0.46,fg);
  }
}

// ── Phase 2: Abstract cubist face ─────────────────────────────────────────
function bauhausPhaseFace(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0, cn=chords.length, rnd=_seedRnd(403,ss,0,0);
  const pal=_bhPalette(chords,cn,gc,rnd);
  pal.push([109,138,120],[125,138,153],[232,221,200]);
  // muted block field
  ctx.fillStyle='rgb(205,184,154)'; ctx.fillRect(0,0,CW,CH);
  const cols=4, rows=5, cw=CW/cols, ch=CH/rows;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const x=c*cw,y=r*ch; _bhSq(ctx,x,y,cw,ch,_bhPick(pal,rnd));
    if(rnd()<0.25) _bhDrips(ctx,x+cw*rnd(),y+ch,CH,'rgba(20,20,18,.5)',2,rnd);
  }
  const reveal=Math.max(0,Math.min(1,lim/cn));
  const W=CW,H=CH, ink=[26,26,24];
  // brow bar
  _bhSq(ctx,W*0.13,H*0.17,W*0.74,H*0.035,ink); _bhDrips(ctx,W*0.2,H*0.205,H*0.45,'rgb(26,26,24)',8,rnd);
  _bhSq(ctx,W*0.38,H*0.10,W*0.22,H*0.07,ink);                     // hat
  _bhSq(ctx,W*0.47,H*0.17,W*0.06,H*0.46,ink); _bhSq(ctx,W*0.44,H*0.60,W*0.12,H*0.02,ink); // nose
  if(reveal>0.25){ _bhRing(ctx,W*0.36,H*0.34,W*0.07,W*0.05,ink); _bhCircle(ctx,W*0.36,H*0.34,W*0.03,[232,163,61]); } // left eye
  if(reveal>0.4){ _bhCircle(ctx,W*0.70,H*0.30,W*0.12,[232,221,200]); _bhCircle(ctx,W*0.70,H*0.30,W*0.085,ink); _bhCircle(ctx,W*0.70,H*0.30,W*0.04,[43,95,165]); } // right eye
  if(reveal>0.6){ _bhSq(ctx,W*0.40,H*0.70,W*0.22,H*0.02,ink); _bhSq(ctx,W*0.42,H*0.83,W*0.30,H*0.16,ink); _bhDrips(ctx,W*0.45,H*0.99,H*1.05,'rgb(26,26,24)',10,rnd); } // mouth+chin
  _bhCircle(ctx,W*0.80,H*0.12,W*0.045,ink); _bhCircle(ctx,W*0.90,H*0.10,W*0.03,[192,57,43]); _bhCircle(ctx,W*0.13,H*0.72,W*0.07,[43,51,64]);
}

// ── Phase 3: Ausstellung — translucent circles + black line grid ──────────
function bauhausPhaseAusst(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0, cn=chords.length, rnd=_seedRnd(404,ss,0,0);
  const pal=_bhPalette(chords,cn,gc,rnd);
  pal.push([26,26,24],[212,84,31],[154,53,32],[138,125,74]);
  ctx.fillStyle='rgb(243,234,208)'; ctx.fillRect(0,0,CW,CH);
  // pale column blocks
  for(let i=0;i<5;i++){ if(rnd()<0.5){ const x=rnd()*CW,w=CW*(0.08+rnd()*0.12); ctx.save(); ctx.globalAlpha=0.5; ctx.fillStyle=_bhCss(_bhPick(pal,rnd)); ctx.fillRect(x,0,w,CH); ctx.restore(); } }
  const reveal=Math.max(0,Math.min(1,lim/cn));
  // Strict reveal — was Math.max(0.3, reveal) on every layer, so the phase
  // jumped to ~30 % full on the very first chord. Now each layer grows from 0.
  const N=Math.ceil((10+rnd()*6)*reveal);
  for(let i=0;i<N;i++) _bhCircle(ctx,rnd()*CW,rnd()*CH,CW*(0.08+rnd()*0.22),_bhPick(pal,rnd),0.55+rnd()*0.25);
  const NA=Math.ceil(5*reveal);
  for(let i=0;i<NA;i++) _bhCircle(ctx,rnd()*CW,rnd()*CH,CW*(0.02+rnd()*0.03),_bhPick(pal,rnd));
  // thin black orthogonal construction lines
  ctx.strokeStyle='rgb(26,26,24)';
  const NL=Math.ceil(14*reveal);
  for(let i=0;i<NL;i++){ ctx.lineWidth=1+rnd()*2; ctx.beginPath();
    if(rnd()<0.5){ const x=rnd()*CW; ctx.moveTo(x,rnd()*CH*0.3); ctx.lineTo(x,CH*(0.5+rnd()*0.5)); }
    else { const y=rnd()*CH; ctx.moveTo(rnd()*CW*0.3,y); ctx.lineTo(CW*(0.5+rnd()*0.5),y); } ctx.stroke(); }
}

// ── Phase 4: Stacked arches (rainbow nested half-rings) ───────────────────
function bauhausPhaseArches(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0, cn=chords.length, rnd=_seedRnd(405,ss,0,0);
  const pal=_bhPalette(chords,cn,gc,rnd);
  _bhCreamFill(ctx,CW,CH);
  const cols=2, rows=3, cw=CW/cols, ch=CH/rows;
  const reveal=Math.max(0,Math.min(1,lim/cn));
  const shown=Math.ceil(cols*rows*reveal);
  let idx=0;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    if(idx++>shown) continue;
    const x=c*cw,y=r*ch; _bhSq(ctx,x,y,cw,ch,_bhPick(pal,rnd));
    const n=3+Math.floor(rnd()*3), maxR=Math.min(cw,ch)*0.85;
    for(let i=n;i>=1;i--){ const col=_bhPick(pal,rnd); _bhClipCell(ctx,x,y,cw,ch,()=>{ ctx.fillStyle=_bhCss(col); ctx.beginPath(); ctx.arc(x+cw/2,y+ch*0.95,maxR*(i/n),Math.PI,0); ctx.closePath(); ctx.fill(); }); }
  }
}

// ── Phase 5: Offset circles (grid + big circles straddling cell lines) ────
function bauhausPhaseOffset(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0, cn=chords.length, rnd=_seedRnd(406,ss,0,0);
  const pal=_bhPalette(chords,cn,gc,rnd);
  pal.push([122,35,53],[255,255,255]);
  _bhSq(ctx,0,0,CW,CH,[122,35,53]);
  const cols=4, rows=6, cw=CW/cols, ch=CH/rows;
  const reveal=Math.max(0,Math.min(1,lim/cn));
  // Reveal the grid cells progressively (was: all 24 cells drawn at once,
  // making the phase look like it appeared instantly on the first chord).
  const cellsShown=Math.ceil(cols*rows*reveal);
  let idx=0;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    if(idx++>cellsShown) continue;
    _bhSq(ctx,c*cw,r*ch,cw,ch,_bhPick(pal,rnd));
  }
  // Big circles + accent halves driven strictly by reveal (no 30 % floor).
  const N=Math.ceil((7+rnd()*4)*reveal);
  for(let i=0;i<N;i++){ const ccx=cw*(0.5+Math.floor(rnd()*cols)), ccy=ch*(0.5+Math.floor(rnd()*rows)); _bhCircle(ctx,ccx,ccy,Math.min(cw,ch)*(0.7+rnd()*0.5),_bhPick(pal,rnd)); }
  const halfN=Math.ceil(5*reveal);
  for(let i=0;i<halfN;i++) _bhHalf(ctx,cw*Math.floor(rnd()*cols),ch*Math.floor(rnd()*rows),cw,ch,_bhPick(pal,rnd),Math.floor(rnd()*4));
}

// ── Phase 6: Line construction (thick black bars + basic shapes) ──────────
function bauhausPhaseLines(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0, cn=chords.length, rnd=_seedRnd(407,ss,0,0);
  const pal=_bhPalette(chords,cn,gc,rnd);
  _bhCreamFill(ctx,CW,CH);
  const reveal=Math.max(0,Math.min(1,lim/cn));
  // Strict reveal everywhere — was Math.max(0.3, reveal) on each layer, which
  // made every layer pop in at 30 % on the very first chord (the phase looked
  // mostly done after one chord). Now each layer scales with reveal from 0.
  const NF=Math.ceil(6*reveal);
  for(let i=0;i<NF;i++){ ctx.save(); ctx.globalAlpha=0.9; ctx.fillStyle=_bhCss(_bhPick(pal,rnd)); ctx.fillRect(rnd()*CW*0.6,rnd()*CH*0.6,CW*(0.2+rnd()*0.3),CH*(0.15+rnd()*0.3)); ctx.restore(); }
  const NS=Math.ceil(6*reveal);
  for(let i=0;i<NS;i++){ const x=rnd()*CW,y=rnd()*CH,s=CW*(0.08+rnd()*0.12),k=Math.floor(rnd()*3);
    if(k===0) _bhCircle(ctx,x,y,s/2,_bhPick(pal,rnd));
    else if(k===1) _bhHalf(ctx,x-s/2,y-s/2,s,s,_bhPick(pal,rnd),Math.floor(rnd()*4));
    else _bhSq(ctx,x-s/2,y-s/2,s,s,_bhPick(pal,rnd)); }
  // Thick black construction bars also reveal progressively (was: all 5 drawn
  // immediately, giving the phase a finished "framed" look from chord 1).
  ctx.fillStyle='rgb(26,26,24)';
  const NB=Math.ceil(5*reveal);
  for(let i=0;i<NB;i++){ if(rnd()<0.5) ctx.fillRect(0,rnd()*CH,CW,CW*0.02); else ctx.fillRect(rnd()*CW,0,CW*0.02,CH); }
}
