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
function _setCurE(e){ _curE = (e==null||isNaN(e)) ? 0.5 : e; }
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
    raw[i]=0.55*velN + 0.25*densN - 0.20*regN;
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
  // Tone switch — when Mix is off (Pure or Pastel tones), the energy modulation
  // is bypassed entirely. In Real tone (_mixOn === true) the function maps the
  // current chord's energy across an asymmetric range:
  //
  //   piano  (_curE = 0)  -> true pastel  (S * 0.30,  L blended to 0.80)
  //   mezzo  (_curE = 0.5) -> raw palette colour, no change
  //   forte  (_curE = 1)   -> deep        (S * 1.55,  L * 0.78)
  //
  // A power-curve sharpens the middle so chords at E ~ 0.3 or 0.7 already show
  // clear pastel/deep shifts. The whole piece therefore travels the full
  // pastel-to-deep gamut on a single canvas — every artist + every variant —
  // because every block goes through gc() and gc() calls _energyTint.
  if(!_mixOn) return [Math.round(r),Math.round(g),Math.round(b)];
  let d=(_curE-0.5)*2;
  if(d>-0.001 && d<0.001) return [Math.round(r),Math.round(g),Math.round(b)];
  // Sharpening — after smoothing + min-max normalization most chords cluster
  // around the middle of -1..+1. Without sharpening a linear mapping leaves
  // the painting almost unchanged. |d|^0.55 pushes d toward the extremes.
  d = Math.sign(d) * Math.pow(Math.abs(d), 0.55);
  let R=r/255, G=g/255, B=b/255;
  const mx=Math.max(R,G,B), mn=Math.min(R,G,B), l=(mx+mn)/2;
  let h=0, sx=0;
  if(mx!==mn){ const dl=mx-mn; sx=l>0.5?dl/(2-mx-mn):dl/(mx+mn);
    if(mx===R)h=(G-B)/dl+(G<B?6:0); else if(mx===G)h=(B-R)/dl+2; else h=(R-G)/dl+4; h/=6; }
  let S, L;
  if(d < 0){
    // Quieter than average -> ease toward pastel. k = |d|.
    const k = -d;
    S = sx * (1 - 0.70 * k);            // 1 -> 0.30
    L = l + (0.80 - l) * 0.55 * k;       // l -> blended toward 0.80
  } else {
    // Louder than average -> ease toward deep.
    S = Math.min(1, sx * (1 + 0.55 * d));
    L = Math.max(0.04, l * (1 - 0.22 * d));
  }
  S = Math.max(0, Math.min(1, S));
  L = Math.max(0.04, Math.min(0.96, L));
  if(S < 0.005){ const g2=Math.round(L*255); return [g2,g2,g2]; }
  const q=L<0.5?L*(1+S):L+S-L*S, pp=2*L-q;
  const h2=(t)=>{ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return pp+(q-pp)*6*t; if(t<1/2)return q; if(t<2/3)return pp+(q-pp)*(2/3-t)*6; return pp; };
  return [Math.round(h2(h+1/3)*255), Math.round(h2(h)*255), Math.round(h2(h-1/3)*255)];
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
  if(style==='mondrian')return drawMondrian(ctx,bx,by,notes,gc,BW,BH);
  if(style==='rothko')return drawRothko(ctx,bx,by,notes,gc,BW,BH);
  if(style==='matisse')return drawMatisse(ctx,bx,by,notes,gc,BW,BH);
  if(style==='picasso'){
    // Picasso has its own canvas-wide cubist plane overlay that supplies all
    // color. The per-block drawer just keeps the dark canvas underneath —
    // previously this used the cream substrate from Pollock, which produced
    // an unwanted white background showing through gaps between planes.
    ctx.fillStyle='#04040a';ctx.fillRect(bx-1,by-1,BW+2,BH+2);
    return;
  }
  if(style==='kusama')return drawKusama(ctx,bx,by,notes,gc,BW,BH);
  if(style==='kandinsky')return drawKandinsky(ctx,bx,by,notes,gc,BW,BH);
  if(style==='pollock')return drawBlockPollockCream(ctx,bx,by,notes,gc,BW,BH);
  if(style==='miro'){ctx.fillStyle='rgba(28,18,12,1)';ctx.fillRect(bx-1,by-1,BW+2,BH+2);return;}
  if(style==='notes')return drawBlockNotes(ctx,bx,by,notes,gc,BW,BH);
  return drawBlockMosaic(ctx,bx,by,notes,gc,BW,BH); // implicit default
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
  const cs = capScale||1;
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
  const key = cn+'|'+(ss|0)+'|'+seedBase+'|'+cs;
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
  // ── 6-VARIANT CHOOSER (stable per painting, re-rolls on Vary) ──
  //  0 = Classic Rothko (Stacked / Row / Grid, seed-driven internal layout
  //      pick — the three layouts read as one "stacked colour-field" identity
  //      so they share a single Vary slot).
  //  1 = Pastel / Light period (cream ground + pale fields, high luminosity).
  //  2 = Multiform (early 1948, free blurred patches).
  //  3 = Seagram (dark portal frames 1958-59).
  //  4 = Chapel (Houston, 1964-67, triptych ultra-dark monochrome).
  //  5 = Incandescent (warm glowing 1955-58).
  //  Free (cap=2) sees Stacked + Pastel — dark saturated vs light luminous
  //  is the strongest art-historical contrast in Rothko's late career.
  {
    const _pn=_capN(6); const _ropick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_ropick===1){ rothkoPhasePastel(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_ropick===2){ rothkoPhaseMultiform(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_ropick===3){ rothkoPhaseSeagram(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_ropick===4){ rothkoPhaseChapel(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_ropick===5){ rothkoPhaseIncandescent(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // else fall through to original stacked/row/grid body (variant 0; the
    // layout sub-pick within is seed-driven, kept as natural micro-variation
    // rather than its own Vary slot).
  }
  // Rothko is intentionally minimal — even 12 fields is at the high end of his
  // late stacked compositions, so we cap there rather than chasing density.
  const FIELDS = cn<=2 ? Math.max(1,cn)
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
  const lume=(r,g,b,boost)=>{if(_pastelOn) return [Math.round(r),Math.round(g),Math.round(b)];const mx=Math.max(r,g,b,1),k=(255*boost)/mx;let R=r*k,G=g*k,B=b*k,m2=Math.max(R,G,B);const pull=(x)=>x===m2?x:x*0.7;return[Math.min(255,pull(R)),Math.min(255,pull(G)),Math.min(255,pull(B))];};

  // Ground: a deep saturated wash sampled from the whole piece, darkened.
  const gBase=_rectChordColor(chords,0,Math.max(1,FIELDS),gc);
  const gnd=lume(gBase[0],gBase[1],gBase[2],0.30);
  ctx.fillStyle=`rgb(${gnd[0]|0},${gnd[1]|0},${gnd[2]|0})`; ctx.fillRect(0,0,CW,CH);

  const marginX=CW*0.08, marginTop=CH*0.06, marginBot=CH*0.06;
  const innerX=marginX, innerW=CW-2*marginX;
  const innerY=marginTop, innerH=CH-marginTop-marginBot;

  // ── Layout chooser (stable per painting, re-rolls on Vary) ──
  // 0 = vertical stack (classic Rothko), 1 = horizontal row, 2 = grid.
  const lr=_seedRnd(99,ss,0,0);
  const layoutRoll=lr();
  // Grid only when there are enough fields to make rows×cols sensible.
  const layout = FIELDS<=2 ? 0
               : layoutRoll<0.62 ? 0
               : layoutRoll<0.82 ? 1
               : 2;
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
  // hot ground
  ctx.fillStyle=isBW?'#8a8580':`rgb(${Math.min(255,200+base[0]*0.2)},${Math.round(70+base[1]*0.2)},${Math.round(16+base[2]*0.1)})`;ctx.fillRect(0,0,CW,CH);
  const fields=Math.max(2,Math.min(4,Math.round(cn/30)));
  const vis=Math.max(1,Math.ceil(N/cn*fields));
  const marginX=CW*0.08,innerW=CW*0.84,innerY=CH*0.06,innerH=CH*0.88,gap=innerH*0.03;
  const availH=innerH-gap*(fields-1),fh=availH/fields;
  for(let i=0;i<vis;i++){
    const {rgb}=_picChord(chords,Math.floor(i*(cn/fields)),gc,isBW);
    // push toward incandescent warm
    const r=isBW?Math.round((rgb[0]+rgb[1]+rgb[2])/3):Math.min(255,Math.round(180+rgb[0]*0.3));
    const g=isBW?r:Math.min(255,Math.round(60+rgb[1]*0.5));
    const b=isBW?r:Math.round(20+rgb[2]*0.3);
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
  //  C = Fauvism (wild non-natural colour patches, loose strokes).
  //  D = Nice interior (window/room bands with patterned panels).
  //  E = The Dance (curved figures on blue/green ground).
  //  F = Jazz organic (bold black-outlined organic cut shapes on white).
  const _pn=_capN(6); const pick=((phaseIndex|0)%_pn+_pn)%_pn;
  if(pick===1){ matissePhaseB(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===2){ matissePhaseFauve(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===3){ matissePhaseNice(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===4){ matissePhaseDance(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===5){ matissePhaseJazz(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  matissePhaseA(ctx,CW,CH,chords,lim,gc,ss,mode);
}

// ── Matisse phase A: the original cell-based panels (nested frames / scattered
// cut-outs, chosen per painting by a seed bit). ──
function matissePhaseA(ctx, CW, CH, chords, lim, gc, sessionSeed, mode){
  const ss=sessionSeed|0;
  const {rects,MAX_RECTS,paintCount}=_partitionCanvas(chords,lim,ss,2400,0.34);
  // whole-painting mode choice (stable per painting, re-rolls on Vary/Random)
  const nestedMode = ((ss>>>5)&1)===1;
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

// ── Matisse C: Fauvism — wild non-natural colour patches, loose strokes. ──
// ── Matisse C: Fauvism v2 — wild patches, random count + saturation boost. ──
function matissePhaseFauve(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const sR=_seedRnd(40001,ss,0,0); sR(); sR();
  ctx.fillStyle=isBW?'#dcd6cc':'#f4eeda'; ctx.fillRect(0,0,CW,CH);
  const nPatches=12+((sR()*20)|0);
  const vis=Math.max(1,Math.ceil(N/cn*nPatches*2.5));
  for(let i=0;i<Math.min(nPatches,vis);i++){
    const rR=_seedRnd(i+40500,ss,0,0);
    const {rgb}=_picChord(chords,Math.floor(i*(cn/nPatches))%cn,gc,isBW);
    // Saturation boost — skipped in Pastel so the cut-outs stay soft.
    const sat=_pastelOn ? 1 : (1.2+rR()*0.3);
    const r=Math.min(255,Math.round(rgb[0]*sat));
    const g=Math.min(255,Math.round(rgb[1]*sat));
    const b=Math.min(255,Math.round(rgb[2]*sat));
    const cx=rR()*CW, cy=rR()*CH;
    const rx=Math.min(CW,CH)*(0.04+rR()*0.10);
    const ry=Math.min(CW,CH)*(0.04+rR()*0.10);
    const ang=rR()*Math.PI*2;
    const pts=[];
    for(let ti=0;ti<12;ti++){
      const t=ti/12*Math.PI*2;
      const rxx=rx*(0.7+rR()*0.6), ryy=ry*(0.7+rR()*0.6);
      const ex=Math.cos(t)*rxx, ey=Math.sin(t)*ryy;
      const px=ex*Math.cos(ang)-ey*Math.sin(ang);
      const py=ex*Math.sin(ang)+ey*Math.cos(ang);
      pts.push([cx+px,cy+py]);
    }
    ctx.fillStyle=`rgba(${r},${g},${b},0.86)`;
    ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
    for(let p=1;p<pts.length;p++) ctx.lineTo(pts[p][0],pts[p][1]);
    ctx.closePath(); ctx.fill();
    if(rR()<0.3){
      ctx.strokeStyle='rgba(15,12,20,0.71)'; ctx.lineWidth=2; ctx.stroke();
    }
  }
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

// ── Matisse E: The Dance v2 — random figure count (3-8), 3 arrangements
// (ring/line/cluster), varied sky/ground split. ──
function matissePhaseDance(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
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

// ── Matisse F: Jazz organic v2 — 5-12 cut shapes in 5 types (icarus/circle-cut/
// half-moon/algae/star). ──
function matissePhaseJazz(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
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
  // ── 6-VARIANT CHOOSER (stable per painting, re-rolls on Vary) ──
  //  0 = Classic drip (Dense/Sparser, seed-driven internal pick — see body).
  //  1 = Stenographic Figure (pre-drip 1942, totemic figures + symbols).
  //  2 = Black pourings / theme colour pour.
  //  3 = Lavender Mist / Totem atmospheric.
  //  4 = White Light (post-drip 1954, INVERTED palette on dark ground).
  //  5 = Blue Poles.
  //  Free (cap=2) sees Dense + Stenographic — drip vs pre-drip is the most
  //  dramatic art-historical contrast Pollock offers, so the two-variant
  //  preview reads as "two different painters".
  {
    const _pn=_capN(6); const _ppick=((phaseIndex|0)%_pn+_pn)%_pn;
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
    // else fall through to original dense/wider body (variant 0; the
    // Dense vs Sparser choice within is seed-driven, kept as natural
    // micro-variation rather than its own Vary slot).
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
  const pollVariant = (ss >>> 6) % 2;
  const passCount = pollVariant === 1 ? Math.max(4, Math.round(passCount0 * 0.55)) : passCount0;
  const _pollWidthMul = pollVariant === 1 ? 1.8 : 1.0;

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
  for(let i=0;i<vis;i++){
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
  for(let i=0;i<visPoles;i++){
    const rnd=_seedRnd(i+3700,ss,0,0);
    const x=CW*(0.08+i/poles*0.84)+(rnd()-0.5)*CW*0.04;
    const lean=(rnd()-0.5)*CW*0.06;
    ctx.strokeStyle=isBW?'rgba(30,30,40,0.9)':'rgba(20,30,120,0.9)';
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
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const progress = N/Math.max(1,cn);

  // Warm cream-yellow ground gradient.
  const grad = ctx.createLinearGradient(0,0,0,CH);
  grad.addColorStop(0, isBW?'#cfc5b2':'#e6d18a');
  grad.addColorStop(1, isBW?'#a89e8a':'#caa55a');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,CW,CH);

  // Horizontal brush-stroked grain — texture, no chord dependence.
  const grainCount = 60;
  for(let i=0;i<grainCount;i++){
    const rnd = _seedRnd(i+7100, ss, 0, 0);
    const r = 200+rnd()*30, g = 160+rnd()*30, b = isBW?180:(80+rnd()*30);
    ctx.strokeStyle = `rgba(${r|0},${g|0},${b|0},${(0.15+rnd()*0.15).toFixed(2)})`;
    ctx.lineWidth = 8+rnd()*20;
    ctx.beginPath();
    const y = rnd()*CH;
    ctx.moveTo(rnd()*CW*0.3, y);
    ctx.lineTo(CW*0.7+rnd()*CW*0.3, y+(rnd()-0.5)*30);
    ctx.stroke();
  }

  // Figure count scales with progress: 1 → 3 over the piece.
  const figureSlots = [
    { x: CW*0.22, y: CH*0.55, scale: 0.85, chordPos: 0.10 },
    { x: CW*0.50, y: CH*0.50, scale: 1.00, chordPos: 0.50 },
    { x: CW*0.78, y: CH*0.60, scale: 0.78, chordPos: 0.90 },
  ];
  const visFigures = Math.max(1, Math.min(3, Math.ceil(progress * 3)));

  for(let fi=0;fi<visFigures;fi++){
    const f = figureSlots[fi];
    const ci = Math.min(cn-1, Math.floor(f.chordPos * cn));
    const chord = chords[ci];
    _setCurE(chord && chord._E);
    const {rgb} = _picChord(chords, ci, gc, isBW);
    const W = CW*0.13*f.scale, H = CH*0.55*f.scale;
    ctx.save();
    ctx.translate(f.x, f.y);

    // Head — elongated oval.
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.85)`;
    ctx.beginPath();
    ctx.ellipse(0, -H*0.32, W*0.45, H*0.18, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = isBW?'#222':'#0e0a08'; ctx.lineWidth = 2.5; ctx.stroke();

    // Body — vertical totem trapezoid.
    ctx.beginPath();
    ctx.moveTo(-W*0.40, -H*0.20);
    ctx.lineTo(+W*0.40, -H*0.20);
    ctx.lineTo(+W*0.48, +H*0.30);
    ctx.lineTo(-W*0.48, +H*0.30);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Body segments (3 horizontal divisions).
    for(let i=1;i<4;i++){
      ctx.beginPath();
      ctx.moveTo(-W*0.45, -H*0.20 + i*(H*0.50/4));
      ctx.lineTo(+W*0.45, -H*0.20 + i*(H*0.50/4));
      ctx.stroke();
    }

    // Eyes — two black-on-cream tribal eyes on the head.
    ctx.fillStyle = isBW?'#1a1a1a':'#0e0a08';
    ctx.beginPath(); ctx.arc(-W*0.15, -H*0.32, W*0.06, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(+W*0.15, -H*0.32, W*0.06, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#f0e8d0';
    ctx.beginPath(); ctx.arc(-W*0.15+W*0.025, -H*0.34, W*0.025, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(+W*0.15+W*0.025, -H*0.34, W*0.025, 0, Math.PI*2); ctx.fill();

    // Mouth — single horizontal line.
    ctx.strokeStyle = isBW?'#1a1a1a':'#0e0a08'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-W*0.08, -H*0.22); ctx.lineTo(+W*0.08, -H*0.22); ctx.stroke();

    // Top horns triangle.
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.85)`;
    ctx.beginPath();
    ctx.moveTo(-W*0.30, -H*0.45);
    ctx.lineTo(0, -H*0.55);
    ctx.lineTo(+W*0.30, -H*0.45);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Base / legs.
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-W*0.25, H*0.30); ctx.lineTo(-W*0.20, H*0.45);
    ctx.moveTo(+W*0.25, H*0.30); ctx.lineTo(+W*0.20, H*0.45);
    ctx.stroke();

    ctx.restore();
  }

  // Floating symbols — chord-coloured, count scales with progress.
  const symbolsMax = Math.max(8, Math.min(28, Math.round(cn*0.5)));
  const visSymbols = Math.max(2, Math.ceil(symbolsMax*progress));
  for(let i=0;i<visSymbols;i++){
    const rnd = _seedRnd(i+7800, ss, 0, 0);
    const ci = Math.floor(i*(cn/Math.max(1,symbolsMax)));
    const {rgb} = _picChord(chords, ci, gc, isBW);
    const x = rnd()*CW, y = rnd()*CH;
    const kind = i%4;
    ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.85)`;
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.7)`;
    ctx.lineWidth = 2.5;
    if(kind===0){
      // floating eye
      ctx.beginPath();
      ctx.ellipse(x, y, Math.min(CW,CH)*0.018, Math.min(CW,CH)*0.009, 0, 0, Math.PI*2);
      ctx.stroke();
      ctx.fillStyle = isBW?'#1a1a1a':'#0e0a08';
      ctx.beginPath(); ctx.arc(x, y, Math.min(CW,CH)*0.005, 0, Math.PI*2); ctx.fill();
    } else if(kind===1){
      // arrow
      const L = Math.min(CW,CH)*0.018;
      ctx.beginPath();
      ctx.moveTo(x-L, y); ctx.lineTo(x+L, y);
      ctx.moveTo(x+L*0.6, y-L*0.4); ctx.lineTo(x+L, y); ctx.lineTo(x+L*0.6, y+L*0.4);
      ctx.stroke();
    } else if(kind===2){
      // triangle
      const L = Math.min(CW,CH)*0.012;
      ctx.beginPath();
      ctx.moveTo(x, y-L); ctx.lineTo(x-L*0.9, y+L*0.6); ctx.lineTo(x+L*0.9, y+L*0.6);
      ctx.closePath(); ctx.fill();
    } else {
      // squiggle
      const L = Math.min(CW,CH)*0.016;
      ctx.beginPath();
      ctx.moveTo(x-L, y);
      ctx.quadraticCurveTo(x-L*0.5, y-L*0.7, x, y);
      ctx.quadraticCurveTo(x+L*0.5, y+L*0.7, x+L, y);
      ctx.stroke();
    }
  }

  // Black scribble connector across the top — appears late in the painting
  // (after 60% progress) as a unifying line linking the figures.
  if(progress > 0.6){
    ctx.strokeStyle = isBW?'rgba(20,20,24,0.8)':'rgba(14,10,8,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CW*0.10, CH*0.20);
    ctx.bezierCurveTo(CW*0.30, CH*0.10, CW*0.45, CH*0.30, CW*0.55, CH*0.15);
    ctx.bezierCurveTo(CW*0.70, CH*0.05, CW*0.85, CH*0.25, CW*0.92, CH*0.20);
    ctx.stroke();
  }
}

// ── Pollock H: White Light — late-period (1954). Dark maroon-brown ground;
// drip field with reversed proportions — 60% white/cream drips, 40% chord-
// driven colour accents, 2% ink. Mirrors classic drip mechanics but inverts
// the figure/ground relationship. Only Pollock variant with a dark canvas.
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
  //  A = Analytic Cubism (angular faceted shards, pencil-grain hatching).
  //  B = Synthetic Cubism collage (large abstract "cut-paper" shapes).
  //  Blue = Blue Atmosphere (cool palette cubist shards, no figures).
  //  Rose = Rose Atmosphere (warm palette cubist shards, no figures).
  //  Mask → FacetedField (full-canvas dense angular shards, no subject).
  //  Glass → StillLife (overlapping geometric shapes, vase/fruit implied only).
  // Free (cap=2) sees Analytic + Faceted Field — subtle vs dense shards contrast.
  const _pn=_capN(6); const pick=((phaseIndex|0)%_pn+_pn)%_pn;
  if(pick===1){ picassoPhaseB(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===2){ picassoPhaseBlueAtmo(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===3){ picassoPhaseRoseAtmo(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===4){ picassoPhaseFacetedField(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  if(pick===5){ picassoPhaseStillLife(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
  picassoPhaseA(ctx,CW,CH,chords,lim,gc,ss,mode);
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
  const MAX_PLANES=Math.min(chords.length,Math.min(500,
    chords.length<=30  ? chords.length
    :chords.length<=80 ? 30+Math.floor((chords.length-30)*0.60)
    :chords.length<=200? 60+Math.floor((chords.length-80)*0.50)
    :chords.length<=400? 120+Math.floor((chords.length-200)*0.60)
    :chords.length<=700? 240+Math.floor((chords.length-400)*0.55)
    :405+Math.floor((chords.length-700)*0.35)
  ));
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

// ── Picasso phase B: Synthetic Cubism / collage. Instead of fracturing the
// canvas into many angular shards, this lays down a SMALL number of LARGE,
// rounded "cut-paper" shapes (rounded rectangles, discs, half-discs, arcs/guitar
// curves) that overlap on flat color fields, each with a bold clean outline and
// an occasional woodgrain or dot fill — the look of his papier-collé period.
// Same palette + chord-color sampling as phase A, so it reads as the same hand.
function picassoPhaseB(ctx, CW, CH, chords, lim, gc, sessionSeed, mode){
  const ss=sessionSeed|0;
  const D=Math.min(CW,CH);
  const isBW=mode==='bw';
  const grey=(r,g,b)=>{const v=Math.round(r*0.299+g*0.587+b*0.114);return[v,v,v];};
  const _pal=[[60,110,70],[200,55,40],[100,55,130],[50,90,150],[210,170,30],[220,200,170],[15,8,18],[180,80,50]];
  const pal=isBW?_pal.map(([r,g,b])=>grey(r,g,b)):_pal;
  const ink=isBW?'rgba(20,20,20,0.92)':'rgba(15,8,18,0.92)';

  // How many collage shapes — far fewer than phase A's planes; grows slowly.
  const cn=chords.length;
  const shapeCount=Math.max(3,Math.min(16, 3+Math.floor(cn/14)));
  const paintCount=Math.max(1,Math.min(shapeCount,Math.round(lim*(shapeCount/cn))));

  // Sample a chord's averaged color (same approach as phase A's fill).
  const chordColor=(pIdx)=>{
    const chord=chords[Math.min(chords.length-1,Math.floor(pIdx*(cn/shapeCount)))];
    const notes=chord&&(chord.n||chord.notes||[]);
    let aR=0,aG=0,aB=0,aV=0,c=0;
    if(notes&&notes.length)for(const note of notes){const m=note.m!==undefined?note.m:note;const v=note.v!==undefined?note.v:80;const[r,g,b]=gc(m,v);aR+=r;aG+=g;aB+=b;aV+=v;c++;}
    if(!c){return{rgb:pal[pIdx%pal.length],energy:0.5};}
    let rgb=[aR/c,aG/c,aB/c];
    if(isBW)rgb=grey(rgb[0],rgb[1],rgb[2]);
    return{rgb:rgb.map(Math.round),energy:Math.max(0,Math.min(1,(aV/c-30)/90))};
  };

  // Lay shapes out on a loose diagonal drift so they overlap like pasted paper.
  for(let p=0;p<paintCount;p++){
    const rnd=_seedRnd(p+900,ss, 0, 0);
    const {rgb,energy}=chordColor(p);
    const [r,g,b]=rgb;
    // Size: large, a meaningful fraction of the canvas, shrinking slightly as count rises.
    const sz=D*(0.30+rnd()*0.30)*(1-Math.min(0.4,paintCount*0.03));
    const cx=CW*(0.12+rnd()*0.76);
    const cy=CH*(0.12+rnd()*0.76);
    const rot=(rnd()-0.5)*0.9; // gentle tilt, not the wild angles of phase A
    const kind=rnd();
    ctx.save();
    ctx.translate(cx,cy);
    ctx.rotate(rot);
    const fill=`rgba(${r},${g},${b},${(0.82+energy*0.15).toFixed(2)})`;

    const tracePath=()=>{
      ctx.beginPath();
      if(kind<0.32){
        // Rounded rectangle ("pasted card").
        const w=sz*(0.9+rnd()*0.7), h=sz*(0.6+rnd()*0.6), rr=Math.min(w,h)*(0.12+rnd()*0.18);
        const x=-w/2,y=-h/2;
        ctx.moveTo(x+rr,y);
        ctx.arcTo(x+w,y,x+w,y+h,rr); ctx.arcTo(x+w,y+h,x,y+h,rr);
        ctx.arcTo(x,y+h,x,y,rr);     ctx.arcTo(x,y,x+w,y,rr);
        ctx.closePath();
      } else if(kind<0.58){
        // Disc.
        ctx.arc(0,0,sz*0.5,0,Math.PI*2);
      } else if(kind<0.78){
        // Half-disc / D-shape.
        const rad=sz*0.5, a0=rnd()*Math.PI*2;
        ctx.arc(0,0,rad,a0,a0+Math.PI);
        ctx.closePath();
      } else {
        // Abstract polygon (5-7 sides) — pure cubist cut-paper shape.
        const sides = 5 + Math.floor(rnd()*3);
        for(let s=0;s<sides;s++){
          const a = (s/sides)*Math.PI*2 + rnd()*0.2;
          const rr = sz*0.45*(0.75+rnd()*0.5);
          const px = Math.cos(a)*rr, py = Math.sin(a)*rr;
          if(s===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        }
        ctx.closePath();
      }
    };

    // Flat fill.
    tracePath();
    ctx.fillStyle=fill;
    ctx.fill();

    // Occasional inner texture: woodgrain stripes or a dot field, clipped to the shape.
    if(rnd()<0.5){
      ctx.save(); tracePath(); ctx.clip();
      const texC=isBW?[40,40,40]:pal[6];
      ctx.globalAlpha=0.5+rnd()*0.25;
      if(rnd()<0.55){
        // Woodgrain — gently wavy horizontal lines.
        ctx.strokeStyle=`rgb(${texC[0]},${texC[1]},${texC[2]})`;
        ctx.lineWidth=Math.max(0.8,sz*0.012);
        const gap=Math.max(3,sz*0.07);
        for(let yy=-sz*0.6;yy<sz*0.6;yy+=gap){
          ctx.beginPath();
          for(let xx=-sz*0.7;xx<=sz*0.7;xx+=sz*0.1){
            const wy=yy+Math.sin((xx/sz)*6+yy)*sz*0.015;
            xx===-sz*0.7?ctx.moveTo(xx,wy):ctx.lineTo(xx,wy);
          }
          ctx.stroke();
        }
      } else {
        // Dot field.
        ctx.fillStyle=`rgb(${texC[0]},${texC[1]},${texC[2]})`;
        const dg=Math.max(4,sz*0.13),dr=dg*0.22;
        for(let yy=-sz*0.6;yy<sz*0.6;yy+=dg){const ro=(Math.round((yy)/dg)%2)*dg*0.5;
          for(let xx=-sz*0.6;xx<sz*0.6;xx+=dg){ctx.beginPath();ctx.arc(xx+ro,yy,dr,0,Math.PI*2);ctx.fill();}}
      }
      ctx.globalAlpha=1; ctx.restore();
    }

    // Bold clean outline (the defining trait vs phase A's jittered sketch line).
    tracePath();
    ctx.strokeStyle=ink;
    ctx.lineWidth=Math.max(1.5,D*(0.006+energy*0.004));
    ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.stroke();
    ctx.restore();
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
  const sR = _seedRnd(8201,ss,0,12); sR(); sR();

  // Per-song layout decisions.
  const shardCountFull = 70 + Math.floor(sR()*40);          // 70-110 shards
  const hatchCountFull = 250 + Math.floor(sR()*120);        // 250-370 hatches
  const hatchAngleBase = -Math.PI/3 + (sR()-0.5)*0.4;       // per-song hatch direction

  // Cool blue ground (palette-independent so the mood reads as Blue Period).
  const grad = ctx.createLinearGradient(0,0,CW,CH);
  if(isBW){
    grad.addColorStop(0, '#28282c');
    grad.addColorStop(0.5, '#3a3a40');
    grad.addColorStop(1, '#22222a');
  } else {
    grad.addColorStop(0, '#1a2438');
    grad.addColorStop(0.5, '#2a3e58');
    grad.addColorStop(1, '#1a2230');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,CW,CH);

  // Cubist shards — count grows with reveal.
  const visShards = Math.max(8, Math.ceil(shardCountFull * reveal));
  for(let i=0;i<visShards;i++){
    const r1 = _seedRnd(i+8300,ss,0,0); r1(); r1();
    const cx = r1()*CW;
    const cy = r1()*CH;
    const sz = 25 + r1()*120;
    const rot = r1()*Math.PI*2;
    const sides = 3 + Math.floor(r1()*3);
    const {rgb} = _picChord(chords, i%cn, gc, isBW);
    // Bias toward blue.
    const cr = isBW ? Math.round(rgb[0]*0.5+40) : Math.round(rgb[0]*0.35 + 25);
    const cg = isBW ? Math.round(rgb[1]*0.5+45) : Math.round(rgb[1]*0.45 + 35);
    const cb = isBW ? Math.round(rgb[2]*0.5+55) : Math.round(rgb[2]*0.75 + 60);
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
    ctx.strokeStyle = isBW ? 'rgba(15,15,18,0.7)' : 'rgba(8,12,22,0.7)';
    ctx.lineWidth = 1 + r1();
    ctx.stroke();
    ctx.restore();
  }

  // Pencil-grain hatching — analytic cubism signature, scale with reveal.
  const visHatches = Math.ceil(hatchCountFull * reveal);
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = isBW ? 'rgba(15,15,18,0.9)' : 'rgba(15,20,30,0.9)';
  ctx.lineWidth = 0.5;
  for(let k=0;k<visHatches;k++){
    const hR = _seedRnd(k+8400,ss,0,0); hR();
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
  const grad = ctx.createLinearGradient(0,0,CW,CH);
  if(isBW){
    grad.addColorStop(0, '#4a4038');
    grad.addColorStop(0.5, '#6a5848');
    grad.addColorStop(1, '#4a4038');
  } else {
    grad.addColorStop(0, '#7a3830');
    grad.addColorStop(0.5, '#a05848');
    grad.addColorStop(1, '#7a4030');
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

// ── Picasso Faceted Field: full-canvas dense angular shards, no subject.
// Maximum-density analytic cubism with strong pencil-grain texture.
function picassoPhaseFacetedField(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const reveal = Math.max(0, Math.min(1, N/cn));
  const sR = _seedRnd(8801,ss,0,14); sR(); sR();

  const facetCountFull = 140 + Math.floor(sR()*80);          // 140-220 facets
  const hatchCountFull = 400 + Math.floor(sR()*200);         // 400-600 hatches

  // Muted analytic ground.
  ctx.fillStyle = isBW ? '#3a3834' : '#4a4438';
  ctx.fillRect(0,0,CW,CH);

  const visFacets = Math.max(12, Math.ceil(facetCountFull * reveal));
  for(let i=0;i<visFacets;i++){
    const r1 = _seedRnd(i+8900,ss,0,0); r1(); r1();
    const cx = r1()*CW, cy = r1()*CH;
    const sz = 30 + r1()*100;
    const rot = r1()*Math.PI*2;
    const sides = 3 + Math.floor(r1()*2);                    // triangles + quads
    const {rgb} = _picChord(chords, i%cn, gc, isBW);
    const cr = isBW ? Math.round(rgb[0]*0.6+30) : Math.round(rgb[0]*0.65 + 25);
    const cg = isBW ? Math.round(rgb[1]*0.6+25) : Math.round(rgb[1]*0.60 + 20);
    const cb = isBW ? Math.round(rgb[2]*0.6+20) : Math.round(rgb[2]*0.55 + 20);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.beginPath();
    for(let s=0;s<sides;s++){
      const a = (s/sides)*Math.PI*2;
      const r = sz * (0.60 + r1()*0.80);
      const px = Math.cos(a)*r, py = Math.sin(a)*r;
      if(s===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${Math.min(255,cr)|0},${Math.min(255,cg)|0},${Math.min(255,cb)|0},${(0.65 + r1()*0.30).toFixed(2)})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,10,8,0.65)';
    ctx.lineWidth = 1 + r1()*1.5;
    ctx.stroke();
    ctx.restore();
  }

  // Strong pencil-grain hatching crossing the canvas, scale with reveal.
  const visHatches = Math.ceil(hatchCountFull * reveal);
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = 'rgba(20,15,10,0.95)';
  ctx.lineWidth = 0.5;
  for(let k=0;k<visHatches;k++){
    const hR = _seedRnd(k+9000,ss,0,0); hR();
    const sx = hR()*CW, sy = hR()*CH;
    const len = 6 + hR()*15;
    const a = (hR()<0.5 ? -Math.PI/4 : Math.PI/4) + (hR()-0.5)*0.3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a)*len, sy + Math.sin(a)*len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
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
    const {rects,MAX_RECTS,paintCount}=_partitionCanvas(chords,lim,ss,2400, sparse?0.30:0.45);
    const order = rects.map((r,i)=>i).sort((a,b)=>{
      const ra=rects[a], rb=rects[b];
      const rowA=Math.round(ra.y*12), rowB=Math.round(rb.y*12);
      if(rowA!==rowB) return rowA-rowB;
      return ra.x-rb.x;
    });
    const revealed=order.slice(0,paintCount);
    const lw=sparse?Math.max(2,Math.round(Math.min(CW,CH)*0.009)):Math.max(3,Math.round(Math.min(CW,CH)*0.012));
    // Fill thresholds: A is color-rich, B is white-dominant with sparse color.
    const colorThresh = sparse?0.30:0.62, blackThresh = sparse?0.38:0.72;
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
  const notes=chord&&(chord.n||chord.notes);
  let best=null,bestSat=-1;
  if(notes&&notes.length)for(const note of notes){const m=note.m!==undefined?note.m:note,v=note.v!==undefined?note.v:80;const[r,g,b]=gc(m,v);const sat=Math.max(r,g,b)-Math.min(r,g,b);if(sat>bestSat){bestSat=sat;best=[r,g,b];}}
  if(!best)best=[150,40,30];
  if(isBW||bestSat<=6)return best.map(Math.round);
  if(_pastelOn) return best.map(Math.round);
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

  // Per-song bulge intensity (0.6-1.0). Re-uses the same _seedRnd that drove
  // sphere positions earlier so the intensity is stable per painting.
  const bulgeIntensity = 0.6 + rnd() * 0.4;

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

  if(concentric){
    // ── Concentric Squares ──────────────────────────────────────────────────
    const RINGS = cn<=6 ? Math.max(2,cn) : cn<=16 ? 6 : cn<=40 ? 9 : cn<=90 ? 12 : 16;
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
    const BANDS = cn<=12 ? 5 : cn<=40 ? 7 : 9;
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
  //  5 = Big Red mural (red field + edge incursions).
  //  Free (cap=2) sees Bloom + Mandala — dense organic vs ordered concentric
  //  is the strongest visual contrast in Sam Francis's catalogue.
  {
    const _pn=_capN(6); const _fpick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_fpick===1){ francisPhaseMandala(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_fpick===2){ francisPhaseCluster(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_fpick===3){ francisPhaseBlueBalls(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_fpick===4){ francisPhaseDisappear(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_fpick===5){ francisPhaseBigRed(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // else fall through to original bloom/edge body (variant 0; the bloom vs
    // edge sub-pick within is seed-driven, kept as natural micro-variation
    // rather than its own Vary slot).
  }

  // Blot count auto-scales: short = airy, long = crowded. Curve grows past
  // the 140-chord mark instead of capping there (was: max 64; now: ~140 at
  // 800 chords).
  const BLOTS = _adaptiveMax(cn, 'bloom');
  const visBlots = Math.max(1, Math.ceil((lim / cn) * BLOTS));

  // Coverage fraction grows with length — controls how much white is left.
  const coverage = cn<=12 ? 0.42 : cn<=40 ? 0.55 : cn<=100 ? 0.68 : cn<=300 ? 0.8 : 0.88;

  // ── Variant chooser (stable per painting, re-rolls on Vary) ──
  //  A = top-weighted field with drips falling down (classic Sam Francis).
  //  B = "edge" composition: blots ring the borders, open white centre.
  const bloomVariant = (ss >>> 7) % 2;

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
  const balls=Math.max(5,Math.min(80,Math.round(cn*0.6)));
  const vis=Math.max(1,Math.ceil(N/cn*balls));
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+3900,ss,0,0);
    const {rgb,energy}=_picChord(chords,Math.floor(i*(cn/balls)),gc,isBW);
    // push blue
    const r=isBW?rgb[0]:Math.round(rgb[0]*0.4),g=isBW?rgb[1]:Math.round(rgb[1]*0.5+30),b=isBW?rgb[2]:Math.min(255,Math.round(rgb[2]*0.6+120));
    const x=rnd()*CW,y=rnd()*CH,R=Math.min(CW,CH)*(0.03+energy*0.07+rnd()*0.02);
    ctx.fillStyle=`rgba(${r},${g},${b},${(0.55+rnd()*0.3).toFixed(2)})`;
    ctx.beginPath();ctx.arc(x,y,R,0,Math.PI*2);ctx.fill();
    // halo ring
    ctx.strokeStyle=`rgba(${r},${g},${b},0.4)`;ctx.lineWidth=Math.max(1,R*0.12);ctx.beginPath();ctx.arc(x,y,R*1.4,0,Math.PI*2);ctx.stroke();
  }
}

// ── Sam Francis E: Grid/lattice — colour blots seated in an open white grid. ──

// ── Sam Francis F: Big Red mural — a dominant red field with edge incursions. ──
function francisPhaseBigRed(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
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

// ── Sam Francis H: Towards Disappearance (1957-58). Ultra-minimal: only
// 8-12 sparse, faint chord-coloured marks scattered across canvas + canvas
// grain. Each mark is a soft low-opacity bloom + occasional tiny dot.
// The "quiet" Sam Francis — opposite of Bloom field's density.
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

  // Sparse marks — count scales gently with chord count but stays minimal.
  const marks = Math.max(4, Math.min(14, Math.round(cn/12) + 6));
  const vis = Math.max(2, Math.ceil(marks*reveal));

  for(let i=0;i<vis;i++){
    const rnd = _seedRnd(i+6100, ss, 0, 0);
    const {rgb} = _picChord(chords, Math.floor(rnd()*cn), gc, isBW);
    const x = CW*0.1 + rnd()*CW*0.8;
    const y = CH*0.1 + rnd()*CH*0.8;
    const r = Math.min(CW,CH) * (0.04+rnd()*0.06);

    // Very faint bloom — low opacity gradient.
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.35)`);
    g.addColorStop(0.6, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.15)`);
    g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fill();

    // Occasional tiny dot/spatter near the bloom.
    if(rnd() > 0.5){
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.5)`;
      ctx.beginPath();
      ctx.arc(x + (rnd()-0.5)*r*1.5, y + (rnd()-0.5)*r*1.5, 1.5+rnd()*2, 0, Math.PI*2);
      ctx.fill();
    }
  }
}

// ── Spiral (Hilma af Klint) ──────────────────────────────────────────────────
// Spiritual / symbolist abstraction: floating flowers, concentric circles and
// snail-spirals on a warm field, OR a radiant mandala with segmented rings and
// rays (Hilma af Klint's "The Ten Largest" and "Altarpieces"). Seed picks the
// composition per painting. Each form is coloured from a chord via gc(); forms
// reveal progressively as lim advances. Soft pastel, organic, mystical.
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
  {
    const _pn=_capN(6); const _kpick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_kpick===2){ klintPhaseTen(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_kpick===3){ klintPhaseSwan(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_kpick===4){ klintPhaseAltar(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_kpick===5){ klintPhaseBotanical(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // else fall through to original spiral/mandala body (variant 0/1)
  }
  const mandala = rnd() < 0.5;

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
    // Ray crown — count grows for very long pieces (was fixed at 36).
    const raysBase = cn<=120 ? 36 : cn<=300 ? 48 : cn<=600 ? 60 : 72;
    const rays = Math.max(24, Math.round(raysBase * (0.85 + rnd()*0.30)));
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

// ── af Klint F: Botanical — symmetric plant/diagram chart on pale ground. ──
function klintPhaseBotanical(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const sRoot = _seedRnd(91, ss, 0, 33); sRoot(); sRoot();
  ctx.fillStyle=isBW?'#e4e0d6':'#f0ead8';ctx.fillRect(0,0,CW,CH);
  // Per-song stem count variance ±25%.
  const stemsBase=Math.max(2,Math.min(12,Math.round(cn/12)));
  const stems = Math.max(2, Math.round(stemsBase * (0.85 + sRoot()*0.30)));
  const vis=Math.max(1,Math.ceil(N/cn*stems));
  const sw=CW/Math.max(1,stems);
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+4600,ss,0,0);
    const {rgb}=_picChord(chords,Math.floor(i*(cn/stems)),gc,isBW);
    // Per-stem horizontal offset.
    const cx=i*sw+sw/2+(rnd()-0.5)*sw*0.25;
    // central stem
    ctx.strokeStyle=isBW?'rgba(80,90,70,0.8)':'rgba(60,110,70,0.8)';ctx.lineWidth=Math.max(1.5,sw*0.03);
    ctx.beginPath();ctx.moveTo(cx,CH*0.9);ctx.lineTo(cx,CH*0.2);ctx.stroke();
    // Per-stem node count + leaf angle.
    const nodes=3+((rnd()*5)|0);
    const leafAngle = 0.30 + rnd()*0.40;
    for(let nd=0;nd<nodes;nd++){
      const y=CH*0.85-nd/(nodes)*CH*0.6;
      const r=sw*0.28*(1-nd/nodes*0.4);
      ctx.fillStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.8)`;
      ctx.beginPath();ctx.ellipse(cx-sw*0.25,y,r,r*0.5,-leafAngle,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(cx+sw*0.25,y,r,r*0.5,leafAngle,0,Math.PI*2);ctx.fill();
    }
    // Top bloom — kind variance (disc / 6-petal / hexagon).
    const bloomKind = Math.floor(rnd()*3);
    const bx = cx, by = CH*0.2, bR = sw*0.16;
    ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    if(bloomKind === 0){
      ctx.beginPath();ctx.arc(bx, by, bR, 0, Math.PI*2);ctx.fill();
    } else if(bloomKind === 1){
      for(let p=0;p<6;p++){
        const pa = (p/6)*Math.PI*2;
        ctx.beginPath();
        ctx.arc(bx+Math.cos(pa)*bR*0.6, by+Math.sin(pa)*bR*0.6, bR*0.5, 0, Math.PI*2);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      for(let h=0;h<6;h++){
        const a = (h/6)*Math.PI*2;
        const hx = bx + Math.cos(a)*bR, hy = by + Math.sin(a)*bR;
        if(h===0) ctx.moveTo(hx,hy); else ctx.lineTo(hx,hy);
      }
      ctx.closePath();ctx.fill();
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
    const _pn=_capN(6); const _gpick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_gpick===1){ klimtPhaseSpiralField(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_gpick===2){ klimtPhaseMosaicField(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_gpick===3){ klimtPhaseDanae(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_gpick===4){ klimtPhaseMeadow(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_gpick===5){ klimtPhaseSerpents(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // Slot 0: seed-driven pick between Ornament tile grid (body below) and
    // Pattern Frieze (vertical columns). Both share gold-ornament identity.
    if(((ss>>>5) & 1) === 1){ klimtPhasePatternFrieze(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // else fall through to original ornament-grid/frieze body.
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
  const goldVariant = (ss >>> 3) % 2;
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
      // stack of motifs down the column
      const motifs = cn<=12 ? 5 : cn<=40 ? 8 : 12;
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
  // Tile the canvas with cells; each cell gets a colour-jewel ornament. Ornament
  // count (grid resolution) scales with track length.
  const COLS = cn<=8 ? 4 : cn<=24 ? 6 : cn<=60 ? 8 : 10;
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

  // Curled female silhouette (right side).
  const cx = CW*0.65, cy = CH*0.55;
  const figureSize = CW*0.30;
  ctx.fillStyle = isBW ? '#b8b6b0' : '#dab098';
  ctx.strokeStyle = isBW ? 'rgba(40,40,40,0.7)' : 'rgba(80,40,20,0.7)';
  ctx.lineWidth = 3;
  // Body curled — fetal-like position.
  ctx.beginPath();
  ctx.ellipse(cx, cy, figureSize, figureSize*0.85, 0.2, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  // Knee.
  ctx.beginPath();
  ctx.ellipse(cx + figureSize*0.3, cy + figureSize*0.3, figureSize*0.45, figureSize*0.30, 0.4, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  // Head.
  ctx.beginPath();
  ctx.ellipse(cx + figureSize*0.5, cy - figureSize*0.5, figureSize*0.18, figureSize*0.20, 0.5, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  // Red hair (or grey).
  ctx.fillStyle = isBW ? '#4a4848' : '#a83020';
  ctx.beginPath();
  ctx.ellipse(cx + figureSize*0.55, cy - figureSize*0.55, figureSize*0.22, figureSize*0.16, 0.3, 0, Math.PI*2);
  ctx.fill();

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

  // Clusters appear progressively.
  const visClusters = Math.max(1, Math.ceil(clusterCountFull * reveal));
  for(let c=0;c<visClusters;c++){
    const cx = rnd()*CW;
    const cy = rnd()*CH;
    const tileSize = 8 + rnd()*16;
    const tilesInCluster = 4 + Math.floor(rnd()*8);
    for(let t=0;t<tilesInCluster;t++){
      const tx = cx + (rnd()-0.5)*tileSize*3;
      const ty = cy + (rnd()-0.5)*tileSize*3;
      const sz = tileSize*(0.7+rnd()*0.6);
      const {rgb} = _picChord(chords, (c*10+t)%cn, gc, isBW);
      // Tile chord colour
      ctx.fillStyle = `rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`;
      ctx.fillRect(tx, ty, sz, sz*(0.7+rnd()*0.5));
      // Dark border
      ctx.strokeStyle = isBW ? 'rgba(40,40,40,0.7)' : 'rgba(60,40,15,0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx, ty, sz, sz*(0.7+rnd()*0.5));
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
    const _pn=_capN(6); const _hpick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_hpick===1){ haringPhaseMural(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_hpick===2){ haringPhaseSubway(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_hpick===3){ haringPhaseBaby(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_hpick===4){ haringPhaseDog(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_hpick===5){ haringPhaseDance(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // else fall through to original glyph-grid body (variant 0)
  }
  const COLS = cn<=6?3:cn<=18?4:cn<=45?5:cn<=100?6:cn<=200?7:cn<=350?9:12;
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
  const popVariant = (ss >>> 4) % 2;

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
    const _pn=_capN(7); const _rpick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_rpick===1){ rileyPhaseWarp(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_rpick===2){ rileyPhaseBlaze(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_rpick===3){ rileyPhaseCataract(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_rpick===4){ rileyPhaseCrest(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_rpick===5){ rileyPhaseTriangle(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_rpick===6){ rileyPhaseFall(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // else fall through to original wavy-stripes/ripple body (variant 0; the
    // stripes vs ripple sub-pick within is seed-driven, kept as natural
    // micro-variation rather than its own Vary slot).
  }
  const darkC = chordCol(0, 0.5);
  const liteC = chordCol(Math.floor(cn/2), 1.25);

  // Light ground.
  ctx.fillStyle = css([Math.min(255,liteC[0]+60),Math.min(255,liteC[1]+60),Math.min(255,liteC[2]+60)]);
  ctx.fillRect(0, 0, CW, CH);

  // ── Composition: two variants by seed ─────────────────────────────────────
  const waveVariant = (ss >>> 5) % 2;

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

  // ── Variant A — horizontal bands of vertical wavy stripes (default) ───────
  // Horizontal bands of vertical wavy stripes; each band reveals as lim grows.
  const BANDS = cn<=8?6:cn<=24?10:cn<=60?16:cn<=120?22:cn<=240?32:cn<=400?44:60;
  const visBands = Math.max(1, Math.ceil((lim/cn)*BANDS));
  const bandH = CH / BANDS;
  const stripeW = CW / (cn<=20?14:cn<=60?22:cn<=200?32:44);

  for(let b=0; b<visBands; b++){
    const y0 = b*bandH, y1 = y0+bandH;
    // Wave params modulated by the chord at this band.
    const chord = chords[Math.min(cn-1, Math.floor((b/BANDS)*cn))];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes);
    const topNote = notes && notes.length ? (notes[0].m!==undefined?notes[0].m:notes[0]) : 60;
    const vel = notes && notes.length && notes[0].v!==undefined ? notes[0].v : 80;
    const amp = bandH * (0.25 + (vel/127)*0.7);
    const freq = 0.6 + ((topNote%12)/12)*2.2;
    const phase = b*0.7 + rnd()*0.5;
    const bandDark = chordCol(b, 0.55);
    const bandLite = chordCol(b+3, 1.2);
    // Draw vertical wavy stripes across the band.
    let toggle = (b&1);
    for(let sx=-stripeW; sx<CW+stripeW; sx+=stripeW){
      toggle = !toggle;
      ctx.fillStyle = toggle ? css(bandDark) : css(bandLite);
      ctx.beginPath();
      const segs = 18;
      // top edge L→R
      for(let s=0;s<=segs;s++){
        const t=s/segs, x = sx + t*stripeW;
        const yy = y0 + Math.sin((x/CW)*Math.PI*2*freq + phase)*amp*0.5 + amp*0.5;
        if(s===0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      // bottom edge R→L (next stripe offset)
      for(let s=segs;s>=0;s--){
        const t=s/segs, x = sx + t*stripeW + stripeW;
        const yy = y1 + Math.sin((x/CW)*Math.PI*2*freq + phase)*amp*0.5 + amp*0.5;
        ctx.lineTo(x, yy);
      }
      ctx.closePath();
      ctx.fill();
    }
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

// ── Comic (Roy Lichtenstein) ─────────────────────────────────────────────────
// Pop / comic-book language: flat primary-colour panels overlaid with Ben-Day
// halftone dots, heavy black outlines, and the occasional starburst. Each panel
// (or tile) takes its colour from a chord via gc(); the halftone density and
// dot colour read the music. Two variants by seed: a panel grid, or a single
// big burst-centred panel. Reveals progressively as lim advances.
function drawComicOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, phaseIndex){
  if(!lim || !chords || !chords.length) return;
  const ss = sessionSeed | 0;
  const cn = chords.length;
  const rnd = _seedRnd(107, ss, 0, 0);

  function chordCol(i, mul){
    const idx = Math.min(cn-1, Math.max(0, i % cn));
    const chord = chords[idx];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes);
    if(!notes || !notes.length) return [240,210,40];
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
  const BLACK = '#0a0a0a';
  // ── 6-VARIANT CHOOSER (stable per painting, re-rolls on Vary) ──
  //  0 = Classic comic frame (Panel grid vs Single big panel, seed-driven
  //      internal pick — see body below). The two sub-modes read as one
  //      "comic" identity, so they share a single Vary slot.
  //  1 = Closeup face (Crying Girl / Drowning Girl figuratíve).
  //  2 = Ben-Day regions.
  //  3 = Whaam! explosion (kinetic 1963 motif).
  //  4 = Pop landscape (Mountain Village / Sunrise).
  //  5 = Speech bubble + bursts (Drowning Girl / M-Maybe).
  //  Free (cap=2) sees Panel/Single + Closeup — comic abstraction vs comic
  //  figuration is Lichtenstein's most dramatic art-historical contrast.
  {
    const _pn=_capN(6); const _cpick=((phaseIndex|0)%_pn+_pn)%_pn;
    if(_cpick===1){ comicPhaseCloseup(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_cpick===2){ comicPhaseBenDay(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_cpick===3){ comicPhaseWhaam(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_cpick===4){ comicPhaseLandscape(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    if(_cpick===5){ comicPhaseBubble(ctx,CW,CH,chords,lim,gc,ss,mode); return; }
    // else fall through to original panel-grid/single-panel body (variant 0;
    // the Panel vs Single sub-pick within is seed-driven, kept as natural
    // micro-variation rather than its own Vary slot).
  }
  function halftone(x0, y0, w, h, dotCol, spacing, rad){
    ctx.fillStyle = css(dotCol);
    for(let y=y0+spacing/2; y<y0+h; y+=spacing){
      const off = (Math.round((y-y0)/spacing)%2) ? spacing/2 : 0;
      for(let x=x0+spacing/2+off; x<x0+w; x+=spacing){
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI*2); ctx.fill();
      }
    }
  }
  // Starburst (comic "POW" shape) outline.
  function burst(cx, cy, r, fillCol){
    const pts = 12;
    ctx.fillStyle = css(fillCol);
    ctx.strokeStyle = BLACK; ctx.lineWidth = Math.max(2, r*0.04); ctx.lineJoin='round';
    ctx.beginPath();
    for(let i=0;i<pts*2;i++){
      const a = (i/(pts*2))*Math.PI*2 - Math.PI/2;
      const rr = (i&1) ? r*0.6 : r;
      const x = cx+Math.cos(a)*rr, y = cy+Math.sin(a)*rr;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  const revealFrac = Math.max(0, Math.min(1, lim/cn));
  const comicVariant = (ss >>> 2) % 2;

  if(comicVariant === 1){
    // Variant B — single big panel: flat ground + halftone + central burst.
    const ground = chordCol(0, 1.0);
    ctx.fillStyle = css([Math.min(255,ground[0]*0.5+120),Math.min(255,ground[1]*0.5+120),Math.min(255,ground[2]*0.5+120)]);
    ctx.fillRect(0,0,CW,CH);
    // halftone wash
    const dotCol = chordCol(2, 0.8);
    const sp = Math.max(8, Math.min(CW,CH)/40);
    ctx.globalAlpha = 0.5;
    halftone(0, 0, CW, CH, dotCol, sp, sp*0.28);
    ctx.globalAlpha = 1;
    // central burst sized by reveal
    const r = Math.min(CW,CH)*0.18*(0.6+revealFrac*0.7);
    burst(CW*0.5, CH*0.42, r, chordCol(4, 1.1));
    // a few satellite bursts revealed over time — count grows with song length.
    const satMax = cn<=30?6:cn<=80?10:cn<=200?16:cn<=400?24:32;
    const sats = Math.ceil(revealFrac * satMax);
    for(let i=0;i<sats;i++){
      const a = rnd()*Math.PI*2, d = Math.min(CW,CH)*(0.3+rnd()*0.25);
      burst(CW*0.5+Math.cos(a)*d, CH*0.42+Math.sin(a)*d, r*(0.3+rnd()*0.3), chordCol(i+5, 1.0));
    }
    // thick frame
    ctx.strokeStyle = BLACK; ctx.lineWidth = Math.max(4, Math.min(CW,CH)*0.02);
    ctx.strokeRect(ctx.lineWidth/2, ctx.lineWidth/2, CW-ctx.lineWidth, CH-ctx.lineWidth);
    return;
  }

  // Variant A — panel grid: each tile flat colour + halftone + black border.
  const COLS = cn<=6?2:cn<=18?3:cn<=45?4:cn<=100?5:cn<=200?6:cn<=350?8:10;
  const ROWS = Math.max(2, Math.round(COLS*(CH/CW)));
  const cw = CW/COLS, ch = CH/ROWS;
  const total = COLS*ROWS;
  const visCells = Math.ceil(revealFrac*total);
  let drawn=0;
  for(let row=0; row<ROWS; row++){
    for(let col=0; col<COLS; col++){
      if(drawn++ >= visCells) break;
      const i = row*COLS+col;
      const x0=col*cw, y0=row*ch;
      const base = chordCol(i, 1.0);
      // light flat fill
      ctx.fillStyle = css([Math.min(255,base[0]*0.55+110),Math.min(255,base[1]*0.55+110),Math.min(255,base[2]*0.55+110)]);
      ctx.fillRect(x0, y0, cw, ch);
      // halftone in saturated dot colour
      const dot = chordCol(i, 0.85);
      const sp = Math.max(6, Math.min(cw,ch)/8);
      ctx.save();
      ctx.beginPath(); ctx.rect(x0,y0,cw,ch); ctx.clip();
      ctx.globalAlpha = 0.6;
      halftone(x0, y0, cw, ch, dot, sp, sp*0.3);
      ctx.globalAlpha = 1;
      ctx.restore();
      // motif: alternate flat shape vs burst
      if((i+ (ss%3)) % 3 === 0){
        burst(x0+cw/2, y0+ch/2, Math.min(cw,ch)*0.3, chordCol(i+3,1.1));
      }
      // heavy black panel border
      ctx.strokeStyle = BLACK; ctx.lineWidth = Math.max(3, Math.min(cw,ch)*0.04);
      ctx.strokeRect(x0, y0, cw, ch);
    }
  }
}

// Ben-Day halftone fill helper for new comic phases.
function _benDay(ctx,x0,y0,w,h,dotCol,spacing,rad){
  ctx.fillStyle=dotCol;
  for(let y=y0+spacing/2;y<y0+h;y+=spacing){const ro=(Math.round((y-y0)/spacing)%2)*spacing*0.5;for(let x=x0+spacing/2;x<x0+w;x+=spacing){ctx.beginPath();ctx.arc(x+ro,y,rad,0,Math.PI*2);ctx.fill();}}
}

// ── Lichtenstein C: Ben-Day full field — whole canvas one halftone field. ──
// ── Lichtenstein C: Ben-Day REGIONS v2. Canvas split into 2-6 regions, each
// with its own dot density / pattern. 4 layouts (h/v/d stripes or wedges). ──
function comicPhaseBenDay(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const sR=_seedRnd(20001,ss,0,0); sR(); sR();
  ctx.fillStyle=isBW?'#ece8d8':'#f6f2e6'; ctx.fillRect(0,0,CW,CH);
  const regCount=2+((sR()*5)|0);
  const layout=(sR()*4)|0;
  const INK='#0a0a0a';
  // Build region polygons
  const regions=[];
  if(layout===0){ // horizontal stripes
    for(let i=0;i<regCount;i++){
      regions.push([[0,i*CH/regCount],[CW,i*CH/regCount],[CW,(i+1)*CH/regCount],[0,(i+1)*CH/regCount]]);
    }
  } else if(layout===1){ // vertical stripes
    for(let i=0;i<regCount;i++){
      regions.push([[i*CW/regCount,0],[(i+1)*CW/regCount,0],[(i+1)*CW/regCount,CH],[i*CW/regCount,CH]]);
    }
  } else if(layout===2){ // diagonal stripes
    for(let i=0;i<regCount;i++){
      const t0=i/regCount, t1=(i+1)/regCount;
      regions.push([[CW*t0-CW*0.3,0],[CW*t1-CW*0.3,0],[CW*t1+CW*0.3,CH],[CW*t0+CW*0.3,CH]]);
    }
  } else { // wedges from center
    const cx=CW/2, cy=CH/2;
    for(let i=0;i<regCount;i++){
      const a0=i/regCount*Math.PI*2, a1=(i+1)/regCount*Math.PI*2;
      const pts=[[cx,cy]];
      for(let st=0;st<8;st++){ const t=st/7, a=a0+(a1-a0)*t; const rr=Math.max(CW,CH); pts.push([cx+Math.cos(a)*rr,cy+Math.sin(a)*rr]); }
      regions.push(pts);
    }
  }
  // Render each region
  regions.forEach((poly,ri)=>{
    const {rgb}=_picChord(chords,ri*Math.floor(cn/regCount)%cn,gc,isBW);
    const pale=[Math.min(255,Math.round(rgb[0]*0.45+130)),Math.min(255,Math.round(rgb[1]*0.45+130)),Math.min(255,Math.round(rgb[2]*0.45+130))];
    // Fill pale base
    ctx.fillStyle=`rgb(${pale[0]},${pale[1]},${pale[2]})`;
    ctx.beginPath(); ctx.moveTo(poly[0][0],poly[0][1]);
    for(let p=1;p<poly.length;p++) ctx.lineTo(poly[p][0],poly[p][1]);
    ctx.closePath(); ctx.fill();
    // Clip + draw pattern
    const pattern=(_seedRnd(ri+21000,ss,0,0)()*4)|0;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(poly[0][0],poly[0][1]);
    for(let p=1;p<poly.length;p++) ctx.lineTo(poly[p][0],poly[p][1]);
    ctx.closePath(); ctx.clip();
    if(pattern===0){ const sp=Math.max(5,Math.min(CW,CH)*0.025); _benDay(ctx,0,0,CW,CH,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.86)`,sp,sp*0.32); }
    else if(pattern===1){ const sp=Math.max(12,Math.min(CW,CH)*0.05); _benDay(ctx,0,0,CW,CH,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.86)`,sp,sp*0.38); }
    else if(pattern===2){ ctx.fillStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.86)`; ctx.fillRect(0,0,CW,CH); }
    else {
      const sw=Math.max(4,Math.min(CW,CH)*0.025);
      ctx.fillStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.86)`;
      for(let y=0;y<CH;y+=sw*2){ ctx.fillRect(0,y,CW,sw*0.5); }
    }
    ctx.restore();
    ctx.strokeStyle=`rgba(10,10,10,0.86)`; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(poly[0][0],poly[0][1]);
    for(let p=1;p<poly.length;p++) ctx.lineTo(poly[p][0],poly[p][1]);
    ctx.closePath(); ctx.stroke();
  });
  // 1-3 burst accents
  const burstN=1+((sR()*3)|0);
  for(let bi=0;bi<burstN;bi++){
    const bx=CW*(0.15+sR()*0.70), by=CH*(0.15+sR()*0.70);
    const br=Math.min(CW,CH)*(0.06+sR()*0.05);
    const {rgb:bc}=_picChord(chords,(10+bi)%cn,gc,isBW);
    const pts=[]; for(let i=0;i<24;i++){ const a=i/24*Math.PI*2; const rr=(i%2)?br*0.55:br; pts.push([bx+Math.cos(a)*rr,by+Math.sin(a)*rr]); }
    ctx.fillStyle=`rgb(${bc[0]},${bc[1]},${bc[2]})`;
    ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
    for(let p=1;p<pts.length;p++) ctx.lineTo(pts[p][0],pts[p][1]);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle=INK; ctx.lineWidth=2; ctx.stroke();
  }
}

// ── Lichtenstein D: Brushstrokes v2 with orientation variation. ──

// ── Lichtenstein E: Pop landscape v2 — varied sun position + 3 sun styles +
// random band count (3-8) and types per band. ──
function comicPhaseLandscape(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const sR=_seedRnd(23001,ss,0,0); sR(); sR();
  ctx.fillStyle=isBW?'#ece8d8':'#f6f2e6'; ctx.fillRect(0,0,CW,CH);
  const INK='#0a0a0a';
  const nBands=3+((sR()*6)|0);
  const bh=CH/nBands;
  const sunX=CW*(0.15+sR()*0.70), sunY=CH*(0.10+sR()*0.40);
  const sunR=Math.min(CW,CH)*(0.06+sR()*0.08);
  const sunVis=sR()<0.7;
  const sunStyle=(sR()*3)|0;
  const vis=Math.max(1,Math.ceil(N/cn*nBands*2.5));
  for(let i=0;i<Math.min(nBands,vis);i++){
    const {rgb}=_picChord(chords,Math.floor(i*(cn/nBands))%cn,gc,isBW);
    const y=i*bh;
    const pattern=(_seedRnd(i+24000,ss,0,0)()*3)|0;
    if(pattern===0){
      ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.fillRect(0,y,CW,bh);
    } else if(pattern===1){
      const pale=[Math.min(255,Math.round(rgb[0]*0.4+140)),Math.min(255,Math.round(rgb[1]*0.4+140)),Math.min(255,Math.round(rgb[2]*0.4+140))];
      ctx.fillStyle=`rgb(${pale[0]},${pale[1]},${pale[2]})`;
      ctx.fillRect(0,y,CW,bh);
      const sp=Math.max(8,bh*0.25);
      _benDay(ctx,0,y,CW,bh,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.86)`,sp,sp*0.35);
    } else {
      const pale=[Math.min(255,Math.round(rgb[0]*0.4+140)),Math.min(255,Math.round(rgb[1]*0.4+140)),Math.min(255,Math.round(rgb[2]*0.4+140))];
      ctx.fillStyle=`rgb(${pale[0]},${pale[1]},${pale[2]})`;
      ctx.fillRect(0,y,CW,bh);
      const sw=Math.max(4,bh*0.18);
      ctx.fillStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.86)`;
      for(let yy=y;yy<y+bh;yy+=sw) ctx.fillRect(0,yy,CW,sw*0.5);
    }
  }
  if(sunVis){
    const {rgb:sc}=_picChord(chords,nBands%cn,gc,isBW);
    ctx.fillStyle=`rgb(${sc[0]},${sc[1]},${sc[2]})`;
    ctx.strokeStyle=INK; ctx.lineWidth=3;
    if(sunStyle===0){
      ctx.beginPath(); ctx.arc(sunX,sunY,sunR,0,Math.PI*2); ctx.fill(); ctx.stroke();
    } else if(sunStyle===1){
      ctx.beginPath(); ctx.arc(sunX,sunY,sunR,0,Math.PI*2); ctx.fill(); ctx.stroke();
      for(let ri=0;ri<12;ri++){
        const a=ri/12*Math.PI*2;
        ctx.beginPath();
        ctx.moveTo(sunX+Math.cos(a)*sunR*1.1,sunY+Math.sin(a)*sunR*1.1);
        ctx.lineTo(sunX+Math.cos(a)*sunR*1.6,sunY+Math.sin(a)*sunR*1.6);
        ctx.stroke();
      }
    } else {
      ctx.beginPath(); ctx.arc(sunX,sunY,sunR,0,Math.PI); ctx.fill(); ctx.stroke();
    }
  }
  ctx.strokeStyle=INK; ctx.lineWidth=2;
  for(let i=1;i<nBands;i++){
    ctx.beginPath(); ctx.moveTo(0,i*bh); ctx.lineTo(CW,i*bh); ctx.stroke();
  }
}

// ── Lichtenstein F: Comic panel v2 — random 1-3 bubbles (3 styles) + 1-4 bursts. ──
function comicPhaseBubble(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const sR=_seedRnd(25001,ss,0,0); sR(); sR();
  const {rgb:bg0}=_picChord(chords,0,gc,isBW);
  // Lichtenstein's signature comic-yellow page background. Tone-adjust so
  // Pastel softens it (and Real picks up the opening chord's energy).
  const _bgYel = (()=>{
    if(isBW) return '#ece8d8';
    let r=244, g=224, b=32;
    if(typeof _energyTint === 'function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint === 'function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return `rgb(${r},${g},${b})`;
  })();
  ctx.fillStyle=_bgYel; ctx.fillRect(0,0,CW,CH);
  const INK='#0a0a0a';
  const sp=Math.max(10,Math.min(CW,CH)*0.04);
  const dotCol=isBW?'rgba(30,30,30,0.86)':`rgba(${Math.round(bg0[0]*0.7)},${Math.round(bg0[1]*0.5)},${Math.round(bg0[2]*0.5)},0.86)`;
  _benDay(ctx,0,0,CW,CH,dotCol,sp,sp*0.25);
  const nBubbles=1+((sR()*3)|0);
  const nBursts=1+((sR()*4)|0);
  const totalEl=nBubbles+nBursts;
  const vis=Math.max(1,Math.ceil(N/cn*totalEl*2.5));
  // Bursts first
  for(let i=0;i<Math.min(nBursts,vis);i++){
    const bx=CW*(0.15+sR()*0.70), by=CH*(0.15+sR()*0.70);
    const br=Math.min(CW,CH)*(0.06+sR()*0.08);
    const {rgb}=_picChord(chords,(i)%cn,gc,isBW);
    const pts=[]; for(let j=0;j<24;j++){ const a=j/24*Math.PI*2; const rr=(j%2)?br*0.55:br; pts.push([bx+Math.cos(a)*rr,by+Math.sin(a)*rr]); }
    ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
    for(let p=1;p<pts.length;p++) ctx.lineTo(pts[p][0],pts[p][1]);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle=INK; ctx.lineWidth=2; ctx.stroke();
  }
  // Bubbles
  for(let i=0;i<Math.min(nBubbles,Math.max(0,vis-nBursts));i++){
    const bw=CW*(0.30+sR()*0.30), bh=CH*(0.20+sR()*0.20);
    const bx=CW*(0.10+sR()*(0.90-bw/CW));
    const by=CH*(0.10+sR()*(0.90-bh/CH));
    const style=(sR()*3)|0;
    ctx.fillStyle=isBW?'#f4f0e8':'#f8f6f0'; ctx.strokeStyle=INK; ctx.lineWidth=3;
    if(style===0){
      ctx.beginPath(); ctx.ellipse(bx+bw/2,by+bh/2,bw/2,bh/2,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    } else if(style===1){
      for(let ci=0;ci<5;ci++){
        const t=ci/4;
        const cx=bx+t*bw;
        const cwSub=bw*0.4, chSub=bh*(0.7+sR()*0.3);
        ctx.beginPath(); ctx.ellipse(cx,by+chSub/2,cwSub/2,chSub/2,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
      }
    } else {
      const r=Math.min(bw,bh)*0.15;
      ctx.beginPath();
      ctx.moveTo(bx+r,by);
      ctx.lineTo(bx+bw-r,by); ctx.quadraticCurveTo(bx+bw,by,bx+bw,by+r);
      ctx.lineTo(bx+bw,by+bh-r); ctx.quadraticCurveTo(bx+bw,by+bh,bx+bw-r,by+bh);
      ctx.lineTo(bx+r,by+bh); ctx.quadraticCurveTo(bx,by+bh,bx,by+bh-r);
      ctx.lineTo(bx,by+r); ctx.quadraticCurveTo(bx,by,bx+r,by);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // Tail
    const td=(sR()*4)|0;
    let tipX,tipY,b1x,b2x,by_;
    if(td===0){ tipX=bx+bw*0.25; tipY=by+bh+bh*0.4; b1x=bx+bw*0.20; b2x=bx+bw*0.40; by_=by+bh-2; }
    else if(td===1){ tipX=bx+bw*0.75; tipY=by+bh+bh*0.4; b1x=bx+bw*0.60; b2x=bx+bw*0.80; by_=by+bh-2; }
    else if(td===2){ tipX=bx-bw*0.3; tipY=by+bh*0.5; b1x=b2x=bx+2; by_=by+bh*0.50; }
    else { tipX=bx+bw+bw*0.3; tipY=by+bh*0.5; b1x=b2x=bx+bw-2; by_=by+bh*0.50; }
    ctx.beginPath();
    if(td<2){ ctx.moveTo(b1x,by_); ctx.lineTo(b2x,by_); }
    else { ctx.moveTo(b1x,by_-bh*0.1); ctx.lineTo(b2x,by_+bh*0.1); }
    ctx.lineTo(tipX,tipY); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Text lines
    ctx.strokeStyle='rgba(20,20,20,0.7)'; ctx.lineWidth=2;
    const lines=2+((sR()*3)|0);
    for(let ln=0;ln<lines;ln++){
      const ly=by+bh*0.30+ln*bh*0.18;
      const lx0=bx+bw*0.12, lx1=bx+bw*(0.55-ln*0.06+sR()*0.20);
      ctx.beginPath(); ctx.moveTo(lx0,ly); ctx.lineTo(lx1,ly); ctx.stroke();
    }
  }
}

// ── Lichtenstein G: Closeup face — the iconic Lichtenstein woman from
// Crying Girl / Drowning Girl. Chord-pink halftone skin + chord-yellow hair
// with black strokes + huge eye with chord-coloured iris + lashes + chord-blue
// tear + chord-red lips + speech bubble at top-right with reveal-based text
// lines. Seven chord-driven elements at different points in the song.
function comicPhaseCloseup(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const progress = N/Math.max(1,cn);
  const INK='#0a0a0a';
  const sR=_seedRnd(26001,ss,0,0); sR(); sR();

  // Skin tone — pink, biased by an early chord.
  const skinChord=_picChord(chords,Math.floor(cn*0.05)%cn,gc,isBW).rgb;
  const skin=isBW
    ? [Math.round(skinChord[0]*0.3+200),Math.round(skinChord[0]*0.3+200),Math.round(skinChord[0]*0.3+200)]
    : [Math.min(255,skinChord[0]*0.3+220),Math.min(255,skinChord[1]*0.3+170),Math.min(255,skinChord[2]*0.3+170)];
  ctx.fillStyle=`rgb(${skin[0]|0},${skin[1]|0},${skin[2]|0})`;
  ctx.fillRect(0,0,CW,CH);

  // Halftone over the face area (below hairline, above lips).
  const sp=Math.max(8,Math.min(CW,CH)*0.025);
  const skinDot=[Math.round(skin[0]*0.6),Math.round(skin[1]*0.5),Math.round(skin[2]*0.5)];
  _benDay(ctx,0,CH*0.15,CW,CH*0.60,`rgba(${skinDot[0]},${skinDot[1]},${skinDot[2]},0.65)`,sp,sp*0.30);

  // Hair — chord-yellow band across the top.
  const hairChord=_picChord(chords,Math.floor(cn*0.15)%cn,gc,isBW).rgb;
  let hair=isBW
    ? [220,220,220]
    : [Math.min(255,hairChord[0]*0.3+230),Math.min(255,hairChord[1]*0.5+180),Math.min(255,hairChord[2]*0.2+60)];
  // The hair formula forces a yellow bias on top of the chord colour
  // (Lichtenstein signature). Tone-adjust the final yellow so Pastel softens
  // it and Real picks up the hair chord's energy.
  if(typeof _energyTint === 'function'){ const t=_energyTint(hair[0],hair[1],hair[2]); hair=[t[0],t[1],t[2]]; }
  if(typeof _pastelTint === 'function'){ const p=_pastelTint(hair[0],hair[1],hair[2]); hair=[p[0],p[1],p[2]]; }
  ctx.fillStyle=`rgb(${hair[0]|0},${hair[1]|0},${hair[2]|0})`;
  ctx.beginPath();
  ctx.moveTo(0,0); ctx.lineTo(CW,0); ctx.lineTo(CW,CH*0.25);
  ctx.bezierCurveTo(CW*0.7,CH*0.15,CW*0.3,CH*0.15,0,CH*0.25);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle=INK; ctx.lineWidth=4; ctx.stroke();
  // Hair strands — count scales with reveal.
  ctx.lineWidth=3;
  const strands=Math.max(3,Math.ceil(10*progress));
  for(let i=0;i<strands;i++){
    const x=CW*(0.05+i*0.10);
    ctx.beginPath();
    ctx.moveTo(x,0);
    ctx.lineTo(x+(sR()-0.5)*30,CH*0.20);
    ctx.stroke();
  }

  // Eye — large, with chord-coloured iris.
  const eyeX=CW*0.42, eyeY=CH*0.40;
  const eyeW=CW*0.16, eyeH=CH*0.10;
  // Eye white
  ctx.fillStyle=isBW?'#e8e8e8':'#fafafa';
  ctx.beginPath();
  ctx.ellipse(eyeX,eyeY,eyeW/2,eyeH/2,0,0,Math.PI*2);
  ctx.fill();
  ctx.strokeStyle=INK; ctx.lineWidth=3.5; ctx.stroke();
  // Iris (chord-coloured)
  const iris=_picChord(chords,Math.floor(cn*0.50)%cn,gc,isBW).rgb;
  ctx.fillStyle=`rgb(${iris[0]|0},${iris[1]|0},${iris[2]|0})`;
  ctx.beginPath();
  ctx.arc(eyeX,eyeY,eyeH/2*0.85,0,Math.PI*2);
  ctx.fill(); ctx.stroke();
  // Pupil
  ctx.fillStyle=INK;
  ctx.beginPath(); ctx.arc(eyeX,eyeY,eyeH/2*0.4,0,Math.PI*2); ctx.fill();
  // Highlight
  ctx.fillStyle='#fff';
  ctx.beginPath();
  ctx.arc(eyeX-eyeW*0.08,eyeY-eyeH*0.15,eyeW*0.04,0,Math.PI*2);
  ctx.fill();
  // Eyelashes
  ctx.strokeStyle=INK; ctx.lineWidth=3;
  for(let i=-3;i<=3;i++){
    const t=i/3;
    const x=eyeX+t*eyeW/2;
    const y=eyeY-eyeH/2;
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(x-t*8,y-18);
    ctx.stroke();
  }
  // Eyebrow
  ctx.lineWidth=5;
  ctx.beginPath();
  ctx.moveTo(eyeX-eyeW*0.6,eyeY-eyeH*1.5);
  ctx.quadraticCurveTo(eyeX,eyeY-eyeH*1.9,eyeX+eyeW*0.6,eyeY-eyeH*1.3);
  ctx.stroke();

  // Tear — chord-blue droplet, only appears after ~40% progress.
  if(progress>0.4){
    const tearChord=_picChord(chords,Math.floor(cn*0.70)%cn,gc,isBW).rgb;
    let tear=isBW
      ? [180,180,180]
      : [Math.round(tearChord[0]*0.3+80),Math.round(tearChord[1]*0.4+140),Math.round(tearChord[2]*0.5+170)];
    // Tone-adjust the forced blue.
    if(typeof _energyTint === 'function'){ const t=_energyTint(tear[0],tear[1],tear[2]); tear=[t[0],t[1],t[2]]; }
    if(typeof _pastelTint === 'function'){ const p=_pastelTint(tear[0],tear[1],tear[2]); tear=[p[0],p[1],p[2]]; }
    ctx.fillStyle=`rgb(${tear[0]},${tear[1]},${tear[2]})`;
    ctx.strokeStyle=INK; ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(eyeX+eyeW*0.45,eyeY+eyeH*0.4);
    ctx.bezierCurveTo(eyeX+eyeW*0.55,eyeY+eyeH*1.0,eyeX+eyeW*0.30,eyeY+eyeH*2.5,eyeX+eyeW*0.40,eyeY+eyeH*3.0);
    ctx.bezierCurveTo(eyeX+eyeW*0.55,eyeY+eyeH*2.8,eyeX+eyeW*0.60,eyeY+eyeH*1.5,eyeX+eyeW*0.50,eyeY+eyeH*0.6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // Lips — chord-red.
  const lipChord=_picChord(chords,Math.floor(cn*0.85)%cn,gc,isBW).rgb;
  let lip=isBW
    ? [110,110,110]
    : [Math.min(255,lipChord[0]*0.7+80),Math.round(lipChord[1]*0.3+30),Math.round(lipChord[2]*0.3+40)];
  // Tone-adjust like the hair — Pastel softens, Real picks up lip chord energy.
  if(typeof _energyTint === 'function'){ const t=_energyTint(lip[0],lip[1],lip[2]); lip=[t[0],t[1],t[2]]; }
  if(typeof _pastelTint === 'function'){ const p=_pastelTint(lip[0],lip[1],lip[2]); lip=[p[0],p[1],p[2]]; }
  ctx.fillStyle=`rgb(${lip[0]|0},${lip[1]|0},${lip[2]|0})`;
  ctx.strokeStyle=INK; ctx.lineWidth=3;
  ctx.beginPath();
  ctx.moveTo(CW*0.38,CH*0.65);
  ctx.quadraticCurveTo(CW*0.50,CH*0.62,CW*0.62,CH*0.65);
  ctx.quadraticCurveTo(CW*0.50,CH*0.72,CW*0.38,CH*0.65);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Lip parting line
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(CW*0.40,CH*0.67); ctx.lineTo(CW*0.60,CH*0.67);
  ctx.stroke();

  // Speech bubble at top-right with text lines (lines count grows with reveal).
  const bx=CW*0.62, by=CH*0.05, bw=CW*0.35, bh=CH*0.20;
  ctx.fillStyle=isBW?'#f0f0f0':'#fafafa';
  ctx.strokeStyle=INK; ctx.lineWidth=3;
  ctx.beginPath();
  ctx.ellipse(bx+bw/2,by+bh/2,bw/2,bh/2,0,0,Math.PI*2);
  ctx.fill(); ctx.stroke();
  // Tail
  ctx.beginPath();
  ctx.moveTo(bx+bw*0.20,by+bh-2);
  ctx.lineTo(bx+bw*0.05,by+bh+bh*0.5);
  ctx.lineTo(bx+bw*0.40,by+bh-2);
  ctx.closePath();
  ctx.fillStyle=isBW?'#f0f0f0':'#fafafa'; ctx.fill(); ctx.stroke();
  // Text lines — reveal-based count
  ctx.strokeStyle='rgba(20,20,20,0.7)'; ctx.lineWidth=2;
  const textLines=Math.max(1,Math.ceil(3*progress));
  for(let i=0;i<textLines;i++){
    const y=by+bh*0.30+i*bh*0.20;
    ctx.beginPath();
    ctx.moveTo(bx+bw*0.12,y);
    ctx.lineTo(bx+bw*(0.55-i*0.05),y);
    ctx.stroke();
  }
}

// ── Lichtenstein H: Whaam! explosion — the iconic 1963 painting. Yellow
// chord-driven sky with halftone wash + 3-layer jagged starburst (chord-red
// outer + white middle + chord-yellow inner core) + 24 black motion lines
// radiating + heavy black panel frame. Most kinetic Lichtenstein motif.
function comicPhaseWhaam(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length;
  const N=Math.max(1,Math.min(cn,lim));
  const progress = N/Math.max(1,cn);
  const INK='#0a0a0a';

  // Yellow sky background — chord-driven hue.
  const skyChord=_picChord(chords,Math.floor(cn*0.10)%cn,gc,isBW).rgb;
  let sky=isBW
    ? [220,220,220]
    : [Math.min(255,skyChord[0]*0.3+220),Math.min(255,skyChord[1]*0.3+200),Math.min(255,skyChord[2]*0.2+50)];
  if(typeof _energyTint === 'function'){ const t=_energyTint(sky[0],sky[1],sky[2]); sky=[t[0],t[1],t[2]]; }
  if(typeof _pastelTint === 'function'){ const p=_pastelTint(sky[0],sky[1],sky[2]); sky=[p[0],p[1],p[2]]; }
  ctx.fillStyle=`rgb(${sky[0]|0},${sky[1]|0},${sky[2]|0})`;
  ctx.fillRect(0,0,CW,CH);
  // Halftone wash over sky.
  const skySp=Math.max(8,Math.min(CW,CH)*0.022);
  _benDay(ctx,0,0,CW,CH,
    isBW?'rgba(120,120,120,0.55)':`rgba(${Math.round(sky[0]*0.6)},${Math.round(sky[1]*0.5)},${Math.round(sky[2]*0.3)},0.55)`,
    skySp,skySp*0.28);

  // Centre point of the explosion.
  const cx=CW*0.52, cy=CH*0.50;

  // OUTER LAYER — chord-red jagged starburst (24-point).
  const explChord=_picChord(chords,Math.floor(cn*0.30)%cn,gc,isBW).rgb;
  let exp=isBW
    ? [180,180,180]
    : [Math.min(255,explChord[0]*0.7+80),Math.round(explChord[1]*0.3+30),Math.round(explChord[2]*0.3+30)];
  if(typeof _energyTint === 'function'){ const t=_energyTint(exp[0],exp[1],exp[2]); exp=[t[0],t[1],t[2]]; }
  if(typeof _pastelTint === 'function'){ const p=_pastelTint(exp[0],exp[1],exp[2]); exp=[p[0],p[1],p[2]]; }
  ctx.fillStyle=`rgb(${exp[0]|0},${exp[1]|0},${exp[2]|0})`;
  ctx.strokeStyle=INK; ctx.lineWidth=4; ctx.lineJoin='round';
  ctx.beginPath();
  const pts1=24;
  for(let i=0;i<pts1;i++){
    const a=(i/pts1)*Math.PI*2-Math.PI/2;
    const r=Math.min(CW,CH)*((i%2===0)?0.42:0.30)*(0.85+0.15*Math.sin(i*0.8));
    const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // MIDDLE LAYER — white starburst (16-point), smaller.
  ctx.fillStyle=isBW?'#f0f0f0':'#fafafa';
  ctx.beginPath();
  const pts2=16;
  for(let i=0;i<pts2;i++){
    const a=(i/pts2)*Math.PI*2-Math.PI/2;
    const r=Math.min(CW,CH)*((i%2===0)?0.25:0.16);
    const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // INNER CORE — chord-yellow small starburst (10-point).
  const innerChord=_picChord(chords,Math.floor(cn*0.60)%cn,gc,isBW).rgb;
  let inner=isBW
    ? [200,200,200]
    : [Math.min(255,innerChord[0]*0.5+170),Math.min(255,innerChord[1]*0.5+160),Math.round(innerChord[2]*0.3+50)];
  if(typeof _energyTint === 'function'){ const t=_energyTint(inner[0],inner[1],inner[2]); inner=[t[0],t[1],t[2]]; }
  if(typeof _pastelTint === 'function'){ const p=_pastelTint(inner[0],inner[1],inner[2]); inner=[p[0],p[1],p[2]]; }
  ctx.fillStyle=`rgb(${inner[0]|0},${inner[1]|0},${inner[2]|0})`;
  ctx.beginPath();
  const pts3=10;
  for(let i=0;i<pts3;i++){
    const a=(i/pts3)*Math.PI*2-Math.PI/2;
    const r=Math.min(CW,CH)*((i%2===0)?0.13:0.08);
    const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // 24 motion lines — count scales with reveal so they appear during the song.
  ctx.strokeStyle=INK; ctx.lineWidth=4;
  const lineCount=Math.max(4,Math.ceil(24*progress));
  for(let i=0;i<lineCount;i++){
    const a=(i/24)*Math.PI*2;
    const r0=Math.min(CW,CH)*0.45;
    const r1=Math.min(CW,CH)*0.55;
    ctx.beginPath();
    ctx.moveTo(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0);
    ctx.lineTo(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1);
    ctx.stroke();
  }

  // Heavy black panel frame around the canvas.
  ctx.lineWidth=Math.max(6,Math.min(CW,CH)*0.02);
  ctx.strokeRect(ctx.lineWidth/2,ctx.lineWidth/2,CW-ctx.lineWidth,CH-ctx.lineWidth);
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
  const fieldStart = skyHeight;
  const fieldH = CH - fieldStart;
  const visBands = Math.max(1, Math.ceil(bandCountFull * reveal));
  for(let b=0;b<visBands;b++){
    const t = b/bandCountFull;
    const yStart = fieldStart + t*fieldH;
    const yH = fieldH/bandCountFull * (0.8 + rnd()*0.4);
    const [r,g,gb] = chordCol(0.3 + t*0.65);
    ctx.fillStyle = `rgb(${r|0},${g|0},${gb|0})`;
    ctx.fillRect(0, yStart, CW, yH);
    // Painterly strokes inside band.
    const strokesFull = 200 + Math.floor(rnd()*150);
    const visStrokes = Math.ceil(strokesFull * reveal);
    for(let k=0;k<visStrokes;k++){
      const sx = rnd()*CW;
      const sy = yStart + rnd()*yH;
      const len = 4 + rnd()*12;
      const [sr,sg,sb] = chordColIdx(b*30 + k);
      const lift = (rnd()-0.5)*60;
      const jr = Math.max(0,Math.min(255, sr + lift));
      const jg = Math.max(0,Math.min(255, sg + lift));
      const jb = Math.max(0,Math.min(255, sb + lift));
      ctx.strokeStyle = `rgba(${jr|0},${jg|0},${jb|0},0.75)`;
      ctx.lineWidth = 1+rnd()*1.5;
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

// Variant 0 — Wave (Great Wave at Kanagawa).
function hokusaiPhaseWave(ctx, CW, CH, chords, lim, gc, ss, mode){
  const rnd = _seedRnd(92, ss, lim, 0);
  // Clear canvas — we'll paint waves first then fill paper UNDER them via
  // destination-over composite, so background layers can slip in behind the
  // foreground wave without being blocked by an already-painted ground.
  ctx.clearRect(0, 0, CW, CH);

  // Build melody points from top notes. To get the dramatic Kanagawa peak,
  // we AMPLIFY pitch variation: average pitch sets the baseline, deviations
  // from it get exaggerated so the highest notes leap up sharply.
  let pitchSum = 0, pitchCount = 0;
  const rawPitches = [];
  let maxChordSize = 1;
  for(let i = 0; i < lim; i++){
    const chord = chords[i];
    _setCurE(chord && chord._E);
    if(!chord) continue;
    const notes = chord.n || chord.notes;
    if(!notes || !notes.length) continue;
    let topM = 0, topNote = notes[0];
    for(const n of notes){
      const m = n.m !== undefined ? n.m : n;
      if(m > topM){ topM = m; topNote = n; }
    }
    if(notes.length > maxChordSize) maxChordSize = notes.length;
    pitchSum += topM;
    pitchCount++;
    rawPitches.push({ topM, topNote, chord, idx: i, origIdx: rawPitches.length });
  }
  if(rawPitches.length < 2) return;
  const avgPitch = pitchSum / pitchCount;

  const points = [];
  for(let i = 0; i < rawPitches.length; i++){
    const r = rawPitches[i];
    const x = (rawPitches.length > 1 ? (i / (rawPitches.length - 1)) : 0.5) * CW;
    // Center deviation from average, amplify 2.5×, then map to canvas range.
    // baseline at 0.62 leaves room for crests to stab into the upper half.
    const dev = (r.topM - avgPitch) / 12;  // semitones above/below mean, scaled to 1 octave units
    const amplified = Math.max(-1.4, Math.min(1.4, dev * 1.6));
    const y = CH * 0.62 - amplified * CH * 0.28;
    points.push({ x, y, topNote: r.topNote, chord: r.chord, idx: r.idx });
  }

  const depthLayers = Math.max(2, Math.min(4, 1 + Math.floor(maxChordSize / 2)));
  const layerStep = CH * 0.10;

  function tracePath(yOff){
    ctx.moveTo(points[0].x, points[0].y + yOff);
    for(let i = 1; i < points.length - 1; i++){
      const xc = (points[i].x + points[i+1].x) / 2;
      const yc = (points[i].y + points[i+1].y) / 2 + yOff;
      ctx.quadraticCurveTo(points[i].x, points[i].y + yOff, xc, yc);
    }
    ctx.lineTo(points[points.length-1].x, points[points.length-1].y + yOff);
  }

  // Composite trick: background layers drawn AFTER foreground using
  // 'destination-over' so they slip in BEHIND the foreground waves rather
  // than getting hidden by them. Without this, the foreground "fill to
  // canvas bottom" prekryje všetky hlbšie vrstvy a vidieť len jednu vlnu.
  // Draw foreground (layer 0) first as normal, then deeper layers behind.
  for(let layer = 0; layer <= depthLayers; layer++){
    const yOff = layer * layerStep;
    const sampleIdx = Math.min(points.length - 1,
      Math.max(0, Math.floor((points.length / (depthLayers + 1)) * (depthLayers - layer))));
    const samplePt = points[sampleIdx];
    const note = samplePt.topNote;
    const m = note.m !== undefined ? note.m : note;
    const v = note.v !== undefined ? note.v : 100;
    const [r, g, b] = gc(m, v);
    const dim = 1 - layer * 0.10;
    const blend = 0.30 + layer * 0.10;

    // Foreground (layer 0) draws normally on top. Deeper layers draw BEHIND
    // already-painted pixels so foreground stays dominant but background
    // remains visible above the foreground's wave line.
    ctx.globalCompositeOperation = layer === 0 ? 'source-over' : 'destination-over';

    ctx.beginPath();
    tracePath(yOff);
    ctx.lineTo(CW, CH);
    ctx.lineTo(0, CH);
    ctx.closePath();
    ctx.fillStyle = _hokusaiMute(r, g, b, blend, dim);
    ctx.fill();

    ctx.beginPath();
    tracePath(yOff);
    ctx.strokeStyle = HOKUSAI_PRUSSIAN;
    ctx.lineWidth = layer === 0 ? 3.8 : (2.6 - layer * 0.3);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  // Reset composite back to default for foam claws (need source-over).
  ctx.globalCompositeOperation = 'source-over';

  // Paper background must be repainted underneath everything (destination-over
  // sees the already-painted paper as opaque, but the wave fills only the area
  // beneath their curve — so above the highest wave the paper is still visible
  // naturally).

  // Foam claws — on local minima (peaks) of the FOREGROUND wave only.
  const crests = [];
  for(let i = 2; i < points.length - 2; i++){
    if(points[i].y < points[i-1].y && points[i].y < points[i+1].y){
      const note = points[i].topNote;
      const v = note.v !== undefined ? note.v : 80;
      // Peak prominence — how much lower y is vs neighbours.
      const prom = Math.max(0, (points[i-1].y + points[i+1].y) / 2 - points[i].y);
      crests.push({ ...points[i], priority: v * 0.4 + prom * 2 });
    }
  }
  crests.sort((a, b) => b.priority - a.priority);
  // Keep more crests — Liszt-scale melodies have rich peak structure.
  const topCrests = crests.slice(0, Math.min(8, crests.length));

  for(const crest of topCrests){
    // Foam fans outward in a Kanagawa-style claw — 8-10 droplets.
    const baseAngle = -1.1 + (rnd() - 0.5) * 0.5;
    const dropCount = 8 + Math.floor(rnd() * 3);
    for(let k = 0; k < dropCount; k++){
      const r = 13 - k * 1.1;
      if(r < 1) break;
      const angle = baseAngle + k * 0.13;
      const dist = k * 6;
      const fx = crest.x + Math.cos(angle) * dist;
      const fy = crest.y - 5 + Math.sin(angle) * dist;
      ctx.fillStyle = HOKUSAI_FOAM;
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, 6.2832);
      ctx.fill();
      ctx.strokeStyle = HOKUSAI_PRUSSIAN;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    // Tiny scatter droplets for spray.
    for(let s = 0; s < 5; s++){
      const sa = baseAngle + (rnd() - 0.5) * 1.5;
      const sd = 30 + rnd() * 50;
      const sx = crest.x + Math.cos(sa) * sd;
      const sy = crest.y - 5 + Math.sin(sa) * sd;
      const sr = 1.5 + rnd() * 2.5;
      ctx.fillStyle = HOKUSAI_FOAM;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, 6.2832);
      ctx.fill();
      ctx.strokeStyle = HOKUSAI_PRUSSIAN;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  // Paper backdrop — painted UNDER everything via destination-over, so it
  // fills only the remaining transparent area (above the highest wave).
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = HOKUSAI_PAPER;
  ctx.fillRect(0, 0, CW, CH);
  ctx.globalCompositeOperation = 'source-over';
}

// Variant 1 — Mt Fuji silhouette + sky bands.
function hokusaiPhaseFuji(ctx, CW, CH, chords, lim, gc, ss, mode){
  const rnd = _seedRnd(92, ss, lim, 1);
  ctx.fillStyle = HOKUSAI_PAPER;
  ctx.fillRect(0, 0, CW, CH);

  // Sky bands — horizontal strips, each band a chord-derived flat colour.
  const bands = Math.min(8, Math.max(3, Math.floor(lim / 8)));
  const bandH = CH * 0.6 / bands;
  for(let i = 0; i < bands; i++){
    const ci = Math.floor((i / bands) * lim);
    const chord = chords[ci] || chords[0];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [];
    const note = notes[0] || {m:60,v:80};
    const m = note.m!==undefined?note.m:note;
    const v = note.v!==undefined?note.v:100;
    const [r, g, b] = gc(m, v);
    const blend = 0.25 + (i / bands) * 0.3;  // darker toward top
    ctx.fillStyle = _hokusaiMute(r, g, b, blend, 1);
    ctx.fillRect(0, i * bandH, CW, bandH + 1);  // +1 to avoid hairlines
  }

  // Fuji silhouette — symmetric trapezoid with concave shoulders.
  const peakX = CW * 0.5 + (rnd() - 0.5) * CW * 0.05;
  const peakY = CH * 0.18;
  const baseY = CH * 0.7;
  const baseHalfW = CW * 0.42;
  // Sample a "mountain colour" from a middle chord.
  const midChord = chords[Math.floor(lim / 2)] || chords[0];
  const midNotes = midChord && (midChord.n || midChord.notes) || [{m:60,v:80}];
  const midNote = midNotes[0];
  const [mr, mg, mb] = gc(midNote.m!==undefined?midNote.m:midNote, 100);

  ctx.beginPath();
  ctx.moveTo(peakX - baseHalfW, baseY);
  // Left flank — slight inward curve near peak.
  ctx.quadraticCurveTo(peakX - baseHalfW * 0.4, baseY * 0.55, peakX - CW * 0.07, peakY + 8);
  ctx.lineTo(peakX + CW * 0.07, peakY + 8);
  // Right flank.
  ctx.quadraticCurveTo(peakX + baseHalfW * 0.4, baseY * 0.55, peakX + baseHalfW, baseY);
  ctx.closePath();
  ctx.fillStyle = _hokusaiMute(mr, mg, mb, 0.55, 0.85);
  ctx.fill();
  ctx.strokeStyle = HOKUSAI_PRUSSIAN;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Snow cap — flat white triangle at peak.
  ctx.beginPath();
  ctx.moveTo(peakX - CW * 0.07, peakY + 8);
  ctx.lineTo(peakX + CW * 0.07, peakY + 8);
  ctx.lineTo(peakX + (rnd()-0.5) * CW * 0.04, peakY + CH * 0.07);
  ctx.lineTo(peakX - CW * 0.04, peakY + CH * 0.05);
  ctx.closePath();
  ctx.fillStyle = HOKUSAI_FOAM;
  ctx.fill();
  ctx.strokeStyle = HOKUSAI_PRUSSIAN;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Foreground field — flat earth band.
  ctx.fillStyle = _hokusaiMute(120, 90, 50, 0.3, 0.8);
  ctx.fillRect(0, baseY, CW, CH - baseY);
  ctx.strokeStyle = HOKUSAI_PRUSSIAN;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, baseY); ctx.lineTo(CW, baseY); ctx.stroke();
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
    // Pink-warm blossom: blend toward soft pink.
    const br = Math.round(r * 0.4 + 230);
    const bg = Math.round(g * 0.3 + 170);
    const bbv = Math.round(b * 0.3 + 180);

    // Position roughly along branch.
    const t = 0.1 + rnd() * 0.9;
    const ot = 1 - t;
    const bx = ot*ot*ot*startX + 3*ot*ot*t*c1x + 3*ot*t*t*c2x + t*t*t*endX;
    const by = ot*ot*ot*startY + 3*ot*ot*t*c1y + 3*ot*t*t*c2y + t*t*t*endY;
    // Cluster around branch.
    const cx = bx + (rnd() - 0.5) * 70;
    const cy = by + (rnd() - 0.5) * 70 - 10;
    const rad = 5 + rnd() * 8;

    // 5-petal flower: 5 overlapping circles around a centre.
    for(let p = 0; p < 5; p++){
      const pang = (p / 5) * Math.PI * 2;
      const px = cx + Math.cos(pang) * rad * 0.55;
      const py = cy + Math.sin(pang) * rad * 0.55;
      ctx.fillStyle = `rgb(${Math.min(255,br)},${Math.min(255,bg)},${Math.min(255,bbv)})`;
      ctx.beginPath();
      ctx.arc(px, py, rad * 0.6, 0, 6.2832);
      ctx.fill();
      ctx.strokeStyle = HOKUSAI_PRUSSIAN;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    // Yellow centre.
    ctx.fillStyle = '#E8C24A';
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 0.25, 0, 6.2832);
    ctx.fill();
  }
}

// Variant 3 — Storm: lightning zigzag through dark sky.
function hokusaiPhaseStorm(ctx, CW, CH, chords, lim, gc, ss, mode){
  const rnd = _seedRnd(92, ss, lim, 3);

  // Dark stormy sky — sample dominant chord, push very dark.
  const midChord = chords[Math.floor(lim / 2)] || chords[0];
  const midNotes = midChord && (midChord.n || midChord.notes) || [{m:60,v:80}];
  const midNote = midNotes[0];
  const [mr, mg, mb] = gc(midNote.m!==undefined?midNote.m:midNote, 100);
  // Very dim sky.
  ctx.fillStyle = _hokusaiMute(mr, mg, mb, 0.7, 0.4);
  ctx.fillRect(0, 0, CW, CH);

  // Horizontal storm cloud bands across top half.
  for(let i = 0; i < 4; i++){
    const ci = Math.floor((i / 4) * lim);
    const chord = chords[ci] || chords[0];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [];
    const note = notes[0] || {m:60,v:80};
    const m = note.m!==undefined?note.m:note;
    const v = note.v!==undefined?note.v:100;
    const [r, g, b] = gc(m, v);
    const y = i * CH * 0.13;
    const h = CH * 0.13;
    ctx.fillStyle = _hokusaiMute(r, g, b, 0.6 + i * 0.05, 0.55 - i * 0.05);
    // Wavy bottom edge.
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CW, y);
    ctx.lineTo(CW, y + h);
    for(let x = CW; x >= 0; x -= CW / 12){
      ctx.lineTo(x, y + h + (rnd() - 0.5) * 14);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = HOKUSAI_PRUSSIAN;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // ── Chord-coloured rain streaks ────────────────────────────────────────
  // Drawn after the clouds and before the lightning so the bolts remain the
  // dominant foreground while the rain carries the song's chord palette
  // across the whole storm. Diagonal -60°, dense, chord-driven colour.
  const rainCount = Math.min(300, Math.max(120, lim * 4));
  for(let i = 0; i < rainCount; i++){
    const ci = i % lim;
    const rChord = chords[ci] || chords[0];
    const rNotes = rChord && (rChord.n || rChord.notes) || [{m:60,v:80}];
    const rNote = rNotes[0];
    const rm = rNote.m !== undefined ? rNote.m : rNote;
    const rv = rNote.v !== undefined ? rNote.v : 80;
    const [rr, rg, rb] = gc(rm, rv);
    // Span x slightly beyond canvas so the diagonal angle doesn't leave
    // an empty band on the right edge.
    const rx = rnd() * CW * 1.3 - CW * 0.15;
    const ry = rnd() * CH * 0.82;        // above the land silhouette
    const rlen = 15 + rnd() * 30;
    const rangle = -Math.PI / 3;
    ctx.strokeStyle = `rgba(${rr},${rg},${rb},${(0.55 + rnd() * 0.20).toFixed(2)})`;
    ctx.lineWidth = 0.8 + rnd() * 0.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + Math.cos(rangle) * rlen, ry + Math.sin(rangle) * rlen);
    ctx.stroke();
  }

  // Lightning bolts — main zigzag from cloud to ground, plus a couple smaller.
  function drawBolt(startX, startY, endY, jaggedness){
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    let cx = startX;
    let cy = startY;
    const segs = 8 + Math.floor(rnd() * 4);
    const dy = (endY - startY) / segs;
    for(let s = 0; s < segs; s++){
      cy += dy;
      cx += (rnd() - 0.5) * jaggedness;
      ctx.lineTo(cx, cy);
    }
    // White core.
    ctx.strokeStyle = HOKUSAI_FOAM;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.strokeStyle = HOKUSAI_PRUSSIAN;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  drawBolt(CW * (0.3 + rnd() * 0.4), CH * 0.4, CH * 0.85, 50);
  if(rnd() < 0.7) drawBolt(CW * (0.1 + rnd() * 0.2), CH * 0.45, CH * 0.7, 30);
  if(rnd() < 0.5) drawBolt(CW * (0.65 + rnd() * 0.2), CH * 0.5, CH * 0.78, 28);

  // Dark land silhouette at bottom.
  ctx.fillStyle = HOKUSAI_PRUSSIAN;
  ctx.beginPath();
  ctx.moveTo(0, CH * 0.85);
  for(let x = 0; x <= CW; x += CW / 18){
    ctx.lineTo(x, CH * 0.85 + (rnd() - 0.5) * 18);
  }
  ctx.lineTo(CW, CH);
  ctx.lineTo(0, CH);
  ctx.closePath();
  ctx.fill();
}

// Variant 4 — Rain: diagonal lines + muted village band.
function hokusaiPhaseRain(ctx, CW, CH, chords, lim, gc, ss, mode){
  const rnd = _seedRnd(92, ss, lim, 4);
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
  const hw = CW / houseCount;
  for(let i = 0; i < houseCount; i++){
    const ci = Math.floor((i / houseCount) * lim);
    const chord = chords[ci] || chords[0];
    _setCurE(chord && chord._E);
    const notes = chord && (chord.n || chord.notes) || [];
    const note = notes[0] || {m:60,v:80};
    const m = note.m!==undefined?note.m:note;
    const [r, g, b] = gc(m, 90);
    const hx = i * hw + hw * 0.1;
    const hyTop = houseRow;
    const hwInner = hw * 0.8;
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
  ctx.strokeStyle = '#3a4a5e';
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
  ctx.fillStyle = HOKUSAI_PAPER;
  ctx.fillRect(0, 0, CW, CH);

  // Sky band at top — gradient-free, just 2 bands.
  const skyChord = chords[0];
  const skyNotes = skyChord && (skyChord.n || skyChord.notes) || [{m:72,v:80}];
  const skyNote = skyNotes[0];
  const [sr, sg, sb] = gc(skyNote.m!==undefined?skyNote.m:skyNote, 80);
  ctx.fillStyle = _hokusaiMute(sr, sg, sb, 0.35, 0.95);
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
    // Less muted (was 0.45/0.7 — barely visible).
    const reedColor = _hokusaiMute(r, g, b, 0.20, 0.92);
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
    ctx.fillStyle = _hokusaiMute(r, g, b, 0.10, 1.0);
    ctx.beginPath();
    ctx.ellipse(tipX, tipY, seedSz, seedSz * 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Secondary seedhead for multi-note chords — uses the second note's colour.
    if(notes.length > 1){
      const n2 = notes[1];
      const m2 = n2.m !== undefined ? n2.m : n2;
      const v2 = n2.v !== undefined ? n2.v : 80;
      const [r2, g2, b2] = gc(m2, v2);
      ctx.fillStyle = _hokusaiMute(r2, g2, b2, 0.15, 0.95);
      ctx.beginPath();
      ctx.ellipse(tipX + bendDir * 3, tipY - 3, seedSz * 0.7, seedSz * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Water ripples — horizontal short strokes.
  ctx.strokeStyle = HOKUSAI_PRUSSIAN;
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
  const MAX_RECTS=Math.min(chords.length,
    chords.length<=40  ? chords.length
    :chords.length<=120 ? 40+Math.floor((chords.length-40)*0.45)
    :chords.length<=300 ? 76+Math.floor((chords.length-120)*0.20)
    :chords.length<=600 ? 112+Math.floor((chords.length-300)*0.12)
    :chords.length<=1000? 148+Math.floor((chords.length-600)*0.08)
    :180
  );
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
  const tendrils=Math.max(6,Math.min(60,Math.round(cn/2)));
  const vis=Math.max(1,Math.ceil(N/cn*tendrils));
  ctx.lineCap='round';
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+303,ss,0,0);
    const {rgb}=_kusChord(chords,Math.floor(i*(cn/tendrils)),gc);
    ctx.strokeStyle=`rgba(${Math.min(255,rgb[0]+120)},${Math.min(255,rgb[1]+120)},${Math.min(255,rgb[2]+120)},0.85)`;
    ctx.lineWidth=Math.max(1.5,Math.min(CW,CH)*0.012);
    let x=rnd()*CW, y=rnd()*CH;
    ctx.beginPath();ctx.moveTo(x,y);
    const segs=5+Math.floor(rnd()*5);
    for(let s=0;s<segs;s++){const nx=x+(rnd()-0.5)*CW*0.3,ny=y+(rnd()-0.5)*CH*0.3;ctx.quadraticCurveTo((x+nx)/2+(rnd()-0.5)*40,(y+ny)/2+(rnd()-0.5)*40,nx,ny);x=nx;y=ny;}
    ctx.stroke();
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
  const _P = _miroPal(isBW, gc);
  const BLK  = _P.BLK;
  const RED  = _P.RED;
  const GRN  = _P.GRN;
  const BLU  = _P.BLU;
  const YEL  = _P.YEL;
  const ORA  = isBW?[130,120,100]:[220,105,20];
  const SKIN = isBW?[180,170,155]:[205,165,120]; // warm tan/skin
  const rgba=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // Pick accent from gc() chord color. `rnd` is the element's seeded RNG so the
  // chosen colour is STABLE across frames — Math.random() here made every repaint
  // re-roll the colour, which read as constant blinking for most of the song.
  const accent=(r,g,b,rnd)=>{
    const rr = (typeof rnd==='function') ? rnd : Math.random;
    if(isBW){const p=[RED,BLU,YEL,ORA];return p[Math.floor(rr()*p.length)];}
    if(r>180&&g<100&&b<100) return RED;
    if(g>r&&g>b) return GRN;
    if(b>r&&b>g) return BLU;
    if(r>160&&g>140&&b<80) return YEL;
    if(r>160&&g>80&&b<80) return ORA;
    return [RED,GRN,BLU,YEL,ORA][Math.floor(rr()*5)];
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
  const TOTAL = Math.max(8, Math.min(200, Math.round(20 + Math.sqrt(_cnA) * 5)));
  const vis = Math.max(1, Math.ceil((N/_cnA) * TOTAL));

  // 2. SHAPES -- one constellation unit per pass (stable identity, revealed over time)
  for(let p=0;p<vis;p++){
    const rnd=_seedRnd(p+900,ss,0,0);
    // Chord tied to the element's FIXED slot (p/TOTAL), NOT the moving playhead,
    // so each object keeps its colour for the whole song (no per-note recolour).
    const chord=chords[Math.floor((p/TOTAL)*_cnA)%_cnA];
    _setCurE(chord && chord._E);
    const[cR,cG,cB]=chordRGB(chord);
    const ac=accent(cR,cG,cB,rnd);
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
  const _P = _miroPal(isBW, gc);
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
    if(!notes||!notes.length) return _tonedRGB(ACC[idx%ACC.length]);
    let aR=0,aG=0,aB=0,k=0; for(const n of notes){const m=n.m!==undefined?n.m:n,v=n.v!==undefined?n.v:80;const[r,g,b]=gc(m,v);aR+=r;aG+=g;aB+=b;k++;}
    // snap to nearest Miró accent for that flat poster character
    const r=aR/k,g=aG/k,b=aB/k;
    if(isBW) return _tonedRGB(ACC[idx%ACC.length]);
    if(r>180&&g<100&&b<100) return _tonedRGB(RED);
    if(g>r&&g>b) return _tonedRGB(GRN);
    if(b>r&&b>g) return _tonedRGB(BLU);
    if(r>160&&g>140&&b<80) return _tonedRGB(YEL);
    if(r>150&&g>80&&b<90) return _tonedRGB(ORA);
    return _tonedRGB(ACC[idx%ACC.length]);
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
function _miroPal(isBW, gc){
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
  // Derive the four accent slots from gc() at four representative pitch
  // classes (C, E, G, A — the I-iii-V-vi anchor set). Active palette ripples
  // through Miró: Harmony → COF colours; Spectral → chromatic; φ Phi →
  // golden-angle spread; Custom → user picks. Whatever the user chose for
  // these four pitches is what they see in every Miró canvas.
  const samp = m => { const c = gc(m, 100); return [c[0]|0, c[1]|0, c[2]|0]; };
  return {
    BLK:[14,12,16],
    RED: samp(60),  // C
    GRN: samp(64),  // E
    BLU: samp(67),  // G
    YEL: samp(69),  // A
    WHT:[245,242,235]
  };
}

// ── Miró C: Blue triptych — a deep blue field with a few floating marks. ──
function miroPhaseBlue(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const P=_miroPal(isBW,gc);
  ctx.fillStyle=isBW?'rgb(70,72,90)':'rgb(20,55,150)';ctx.fillRect(0,0,CW,CH);
  const marks=Math.max(3,Math.min(24,Math.round(cn/8)));
  const vis=Math.max(1,Math.ceil(N/cn*marks));
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+501,ss,0,0);
    const {rgb,energy}=_picChord(chords,Math.floor(i*(cn/marks)),gc,isBW);
    const x=0.1*CW+rnd()*0.8*CW, y=0.1*CH+rnd()*0.8*CH;
    const kind=(rnd()*3)|0;
    if(kind===0){ // black gesture line
      ctx.strokeStyle=`rgba(${P.BLK[0]},${P.BLK[1]},${P.BLK[2]},0.92)`;ctx.lineWidth=Math.max(2,CW*0.006);ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+(rnd()-0.5)*CW*0.3,y+(rnd()-0.5)*CH*0.3,x+(rnd()-0.5)*CW*0.25,y+(rnd()-0.5)*CH*0.25);ctx.stroke();
    } else if(kind===1){ // red/yellow disc
      const col=rnd()<0.5?P.RED:P.YEL; ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
      ctx.beginPath();ctx.arc(x,y,Math.min(CW,CH)*(0.02+energy*0.04),0,Math.PI*2);ctx.fill();
    } else { // star
      ctx.fillStyle=`rgb(${P.WHT[0]},${P.WHT[1]},${P.WHT[2]})`;const R=Math.min(CW,CH)*0.025;
      ctx.beginPath();for(let s=0;s<10;s++){const a=s*Math.PI/5,rr=s%2?R*0.4:R;ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}ctx.closePath();ctx.fill();
    }
  }
}

// ── Miró D: Biomorphic creatures — curvy organic blobs with eye-dots. ──
function miroPhaseBio(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const P=_miroPal(isBW,gc);
  ctx.fillStyle=isBW?'rgb(224,220,212)':'rgb(238,228,206)';ctx.fillRect(0,0,CW,CH);
  const crs=Math.max(2,Math.min(14,Math.round(cn/12)));
  const vis=Math.max(1,Math.ceil(N/cn*crs));
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+601,ss,0,0);
    const {rgb,energy}=_picChord(chords,Math.floor(i*(cn/crs)),gc,isBW);
    const cx=0.15*CW+rnd()*0.7*CW, cy=0.15*CH+rnd()*0.7*CH, R=Math.min(CW,CH)*(0.06+energy*0.10);
    // wobbly blob
    ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;ctx.beginPath();
    const pts=8;for(let p=0;p<=pts;p++){const a=p/pts*Math.PI*2,rr=R*(0.7+rnd()*0.5);const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr*0.8;if(p===0)ctx.moveTo(x,y);else ctx.quadraticCurveTo(cx+Math.cos(a-0.3)*rr*1.1,cy+Math.sin(a-0.3)*rr*0.9,x,y);}
    ctx.closePath();ctx.fill();
    ctx.strokeStyle=`rgba(${P.BLK[0]},${P.BLK[1]},${P.BLK[2]},0.9)`;ctx.lineWidth=Math.max(1.5,CW*0.004);ctx.stroke();
    // eye
    ctx.fillStyle=`rgb(${P.WHT[0]},${P.WHT[1]},${P.WHT[2]})`;ctx.beginPath();ctx.arc(cx,cy-R*0.2,R*0.22,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgb(${P.BLK[0]},${P.BLK[1]},${P.BLK[2]})`;ctx.beginPath();ctx.arc(cx,cy-R*0.2,R*0.10,0,Math.PI*2);ctx.fill();
  }
}

// ── Miró E: Harlequin Carnival — busy confetti of many small bright shapes. ──
function miroPhaseCarnival(ctx,CW,CH,chords,lim,gc,sessionSeed,mode){
  const ss=sessionSeed|0,isBW=mode==='bw',cn=chords.length,N=Math.max(1,Math.min(cn,lim));
  const P=_miroPal(isBW,gc);
  ctx.fillStyle=isBW?'rgb(120,118,124)':'rgb(150,120,90)';ctx.fillRect(0,0,CW,CH);
  const units=Math.max(10,Math.min(220,cn*2));
  const vis=Math.max(1,Math.ceil(N/cn*units));
  const cols=[P.RED,P.GRN,P.BLU,P.YEL,P.BLK,P.WHT];
  // Tone-adjust helper: Real -> energy, Pastel -> soft. No-op in Pure.
  const _tonedRGB = (c)=>{
    let r=c[0], g=c[1], b=c[2];
    if(typeof _energyTint === 'function'){ const t=_energyTint(r,g,b); r=t[0]; g=t[1]; b=t[2]; }
    if(typeof _pastelTint === 'function'){ const p=_pastelTint(r,g,b); r=p[0]; g=p[1]; b=p[2]; }
    return [r,g,b];
  };
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+701,ss,0,0);
    // Set per-chord energy so the carnival's flat poster palette breathes
    // with the music in Real tone (carnival pieces fixed colours otherwise).
    const ci = Math.min(cn-1, Math.floor((i/vis)*cn));
    const chord = chords[ci];
    _setCurE(chord && chord._E);
    const x=rnd()*CW,y=rnd()*CH,s=Math.min(CW,CH)*(0.012+rnd()*0.03);
    const col=_tonedRGB(cols[(rnd()*cols.length)|0]);ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
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
  const P=_miroPal(isBW,gc);
  ctx.fillStyle=isBW?'rgb(240,238,232)':'rgb(248,246,240)';ctx.fillRect(0,0,CW,CH);
  const signs=Math.max(3,Math.min(28,Math.round(cn/7)));
  const vis=Math.max(1,Math.ceil(N/cn*signs));
  const cols=[P.RED,P.BLU,P.BLK,P.YEL];
  for(let i=0;i<vis;i++){
    const rnd=_seedRnd(i+801,ss,0,0);
    const {energy}=_picChord(chords,Math.floor(i*(cn/signs)),gc,isBW);
    const x=0.1*CW+rnd()*0.8*CW,y=0.1*CH+rnd()*0.8*CH;
    const col=cols[(rnd()*cols.length)|0];const R=Math.min(CW,CH)*(0.02+energy*0.05);
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
  const bgCount = Math.max(4, Math.floor(lim * 0.60));
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
    const note = topNote(chords[i]); if(!note) continue;
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
  const fgSize = Math.sqrt((CW*CH) / Math.max(8, fgCount)) * 0.60;
  const PHI_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const ccx = CW/2, ccy = CH/2;
  const maxR = Math.min(CW, CH) * 0.46;
  for(let i=0; i<fgCount; i++){
    const note = topNote(chords[bgCount + i]); if(!note) continue;
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

function drawKandinskyOverlay(ctx, CW, CH, chordCount, sessionSeed, mode, gc, phaseIndex, cn){
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
  const eff = (ref) => Math.max(1, Math.round(prog * ref));
  // Bauhaus palette tuned to the active colour scheme. Instead of one hard-coded
  // set, we sample gc() across 8 pitches spread over the range, so Harmony yields
  // a circle-of-fifths family, Spectral a chromatic rainbow, B/W a grey scale,
  // and Custom the user's palette — "in the spirit of" the scheme, not per-note.
  const palette = (()=>{
    if(typeof gc !== 'function') return null;
    const pitches=[60,64,67,71,74,77,55,48];   // spread across mid/low register
    return pitches.map(m=>{ const c=gc(m,100); return Array.isArray(c)?`rgb(${c[0]},${c[1]},${c[2]})`:c; });
  })();
  // ── PHASE CHOOSER: commit to ONE of Kandinsky's compositional modes ──
  // Determined by phaseIndex (modulo phase count). The Next button cycles it.
  //  A = Cosmic scatter (free composition).  B = Bauhaus grid.
  //  C = Circles (concentric).  D = Composition 8.  E = Improvisation.  F = Paris.
  // REF per phase = that phase's highest threshold (A's RING 280 is the max).
  // 7 phases: A Cosmic · B Bauhaus · Circles · Comp8 · Paris · Geom · Dense.
  // (Improvisation was retired; Geom + Dense added.)
  const _pn=_capN(7); const pick=((phaseIndex|0)%_pn+_pn)%_pn;
  if(pick===1){ kandinskyPhaseB(ctx, CW, CH, eff(60), ss, mode, palette); return; }
  if(pick===2){ kandinskyPhaseCircles(ctx, CW, CH, eff(230), ss, mode, palette); return; }
  if(pick===3){ kandinskyPhaseComp8(ctx, CW, CH, eff(255), ss, mode, palette); return; }
  if(pick===4){ kandinskyPhaseParis(ctx, CW, CH, eff(180), ss, mode, palette); return; }
  if(pick===5){ kandinskyPhaseGeom(ctx, CW, CH, eff(240), ss, mode, palette); return; }
  if(pick===6){ kandinskyPhaseDense(ctx, CW, CH, eff(260), ss, mode, palette); return; }
  kandinskyPhaseA(ctx, CW, CH, eff(280), ss, mode, palette);
}

// ── Kandinsky phase A: the original free "cosmic scatter" composition. ──
function kandinskyPhaseA(ctx, CW, CH, chordCount, sessionSeed, mode, palette){
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
    ctx.strokeStyle = lineColors[Math.floor(rnd()*lineColors.length)];
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
    const c1 = lineColors[Math.floor(rnd()*lineColors.length)];
    const c2 = lineColors[Math.floor(rnd()*lineColors.length)];
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
    ctx.strokeStyle = lineColors[Math.floor(rnd()*lineColors.length)];
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
    ctx.strokeStyle = lineColors[Math.floor(rnd()*lineColors.length)];
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
    ctx.strokeStyle = lineColors[Math.floor(rnd()*lineColors.length)];
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
function kandinskyPhaseB(ctx, CW, CH, chordCount, sessionSeed, mode, palette){
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

  // Grid dimensions scale with how much music there is: more chords → finer grid.
  const cols = chordCount < 8 ? 2 : chordCount < 24 ? 3 : chordCount < 60 ? 4 : 5;
  const rows = chordCount < 12 ? 2 : chordCount < 40 ? 3 : 4;
  const cellW = CW / cols, cellH = CH / rows;
  const minCell = Math.min(cellW, cellH);

  // === 1. GRID CELLS — each holds concentric circles, a target, or a dot ===
  for(let r=0; r<rows; r++){
    for(let c=0; c<cols; c++){
      const rnd = _seedRnd(7000 + r*cols + c, ss, 0, 0);
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
        const c1 = lineColors[Math.floor(rnd()*lineColors.length)];
        const c2 = lineColors[Math.floor(rnd()*lineColors.length)];
        for(let k=0; k<nested; k++){
          ctx.strokeStyle = k % 2 === 0 ? c1 : c2;
          ctx.lineWidth = Math.max(1.5, minCell*(0.018 + rnd()*0.01));
          ctx.beginPath();
          ctx.arc(cx+jx, cy+jy, baseR*(1 - k*(0.7/nested)), 0, Math.PI*2);
          ctx.stroke();
        }
      } else if(kind < 0.80){
        // Filled target: solid disc with a contrasting ring + center dot.
        ctx.fillStyle = fillColors[Math.floor(rnd()*fillColors.length)];
        ctx.beginPath(); ctx.arc(cx+jx, cy+jy, baseR, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = lineColors[Math.floor(rnd()*lineColors.length)];
        ctx.lineWidth = Math.max(1.5, minCell*0.02);
        ctx.beginPath(); ctx.arc(cx+jx, cy+jy, baseR, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = lineColors[Math.floor(rnd()*lineColors.length)];
        ctx.beginPath(); ctx.arc(cx+jx, cy+jy, baseR*0.28, 0, Math.PI*2); ctx.fill();
      } else {
        // A small triangle seated in the cell (Kandinsky's recurring triangle motif).
        const rot = rnd()*Math.PI*2;
        ctx.strokeStyle = lineColors[Math.floor(rnd()*lineColors.length)];
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
    ctx.strokeStyle = lineColors[Math.floor(rnd()*lineColors.length)];
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
    const cA = fillColors[Math.floor(rnd()*fillColors.length)];
    const cB = lineColors[5]; // near-black
    for(let yy=0; yy<n; yy++) for(let xx=0; xx<n; xx++){
      ctx.fillStyle = (xx+yy) % 2 === 0 ? cA : cB;
      ctx.fillRect(ox + xx*sq, oy + yy*sq, sq+0.5, sq+0.5);
    }
  }
}

// Default Kandinsky palette (used when no palette supplied).
function _kandPal(palette){
  return palette || [
    'rgba(225,60,50,0.92)','rgba(240,180,30,0.92)','rgba(40,70,200,0.92)',
    'rgba(180,60,200,0.90)','rgba(245,238,220,0.90)','rgba(8,4,12,0.92)',
    'rgba(50,160,80,0.90)','rgba(240,130,40,0.92)'
  ];
}
// Robustly set the alpha of any colour string (rgb/rgba/hex) without throwing.
function _kandAlpha(col,a){
  if(typeof col!=='string') return `rgba(120,120,120,${a})`;
  const m=col.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if(m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
  return col; // hex or unknown — leave as-is (still a valid fillStyle)
}

// ── Kandinsky C: Several Circles — concentric translucent discs on dark. ──
function kandinskyPhaseCircles(ctx,CW,CH,chordCount,sessionSeed,mode,palette){
  const ss=sessionSeed|0,isBW=mode==='bw',cols=_kandPal(palette);
  ctx.fillStyle=isBW?'#1a1a1a':'#0c0a14';ctx.fillRect(0,0,CW,CH);
  const TH=[2,5,9,14,20,28,38,50,65,82,100,125,155,190,230];
  let n=Math.max(1,Math.round(Math.max(0,Math.min(1,chordCount/230))*TH.length));
  n=Math.max(1,n);
  for(let i=0;i<n;i++){
    const rnd=_seedRnd(2200+i,ss, 0, 0);
    const cx=rnd()*CW,cy=rnd()*CH,R=Math.min(CW,CH)*(0.05+rnd()*0.13);
    const rings=2+((rnd()*4)|0);
    for(let r=rings;r>=1;r--){
      ctx.fillStyle=_kandAlpha(cols[(rnd()*cols.length)|0],(0.45+rnd()*0.4).toFixed(2));
      ctx.beginPath();ctx.arc(cx,cy,R*(r/rings),0,Math.PI*2);ctx.fill();
    }
  }
}

// ── Kandinsky D: Composition VIII — geometric circles, lines, triangles cool. ──
function kandinskyPhaseComp8(ctx,CW,CH,chordCount,sessionSeed,mode,palette){
  const ss=sessionSeed|0,isBW=mode==='bw',cols=_kandPal(palette);
  ctx.fillStyle=isBW?'#cac6be':'#e8e4d8';ctx.fillRect(0,0,CW,CH);
  const TH=[1,4,8,13,19,27,38,52,70,95,125,160,205,255];
  let n=Math.max(1,Math.round(Math.max(0,Math.min(1,chordCount/255))*TH.length));
  // long lines
  for(let i=0;i<n;i++){
    const rnd=_seedRnd(2300+i,ss, 0, 0);
    const k=(rnd()*3)|0;
    ctx.strokeStyle=cols[(rnd()*cols.length)|0];
    ctx.lineWidth=Math.max(1,Math.min(CW,CH)*0.004);
    if(k===0){ // line
      ctx.beginPath();ctx.moveTo(rnd()*CW,rnd()*CH);ctx.lineTo(rnd()*CW,rnd()*CH);ctx.stroke();
    } else if(k===1){ // circle (sometimes haloed)
      const cx=rnd()*CW,cy=rnd()*CH,R=Math.min(CW,CH)*(0.02+rnd()*0.06);
      ctx.fillStyle=cols[(rnd()*cols.length)|0];ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fill();
      if(rnd()<0.5){ctx.beginPath();ctx.arc(cx,cy,R*1.6,0,Math.PI*2);ctx.stroke();}
    } else { // small triangle
      const cx=rnd()*CW,cy=rnd()*CH,s=Math.min(CW,CH)*(0.02+rnd()*0.05);
      ctx.fillStyle=cols[(rnd()*cols.length)|0];ctx.beginPath();ctx.moveTo(cx,cy-s);ctx.lineTo(cx+s,cy+s);ctx.lineTo(cx-s,cy+s);ctx.closePath();ctx.fill();
    }
  }
}

// ── Kandinsky E: Improvisation — loose colourful washes + black gesture lines. ──
function kandinskyPhaseImprov(ctx,CW,CH,chordCount,sessionSeed,mode,palette){
  const ss=sessionSeed|0,isBW=mode==='bw',cols=_kandPal(palette);
  ctx.fillStyle=isBW?'#d8d4cc':'#f0ead8';ctx.fillRect(0,0,CW,CH);
  const TH=[2,6,11,18,27,40,56,76,100,130,170,215];
  let n=Math.max(1,Math.round(Math.max(0,Math.min(1,chordCount/215))*TH.length));
  // soft washes
  for(let i=0;i<n;i++){
    const rnd=_seedRnd(2400+i,ss, 0, 0);
    const cx=rnd()*CW,cy=rnd()*CH,R=Math.min(CW,CH)*(0.08+rnd()*0.18);
    ctx.fillStyle=_kandAlpha(cols[(rnd()*cols.length)|0],'0.35');
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
function kandinskyPhaseParis(ctx,CW,CH,chordCount,sessionSeed,mode,palette){
  const ss=sessionSeed|0,isBW=mode==='bw',cols=_kandPal(palette);
  ctx.fillStyle=isBW?'#9a96a0':'#5a6a8a';ctx.fillRect(0,0,CW,CH);
  const TH=[2,5,9,15,23,33,46,62,82,108,140,180];
  let n=Math.max(1,Math.round(Math.max(0,Math.min(1,chordCount/180))*TH.length));
  for(let i=0;i<n;i++){
    const rnd=_seedRnd(2500+i,ss, 0, 0);
    const cx=rnd()*CW,cy=rnd()*CH,R=Math.min(CW,CH)*(0.04+rnd()*0.10);
    ctx.fillStyle=cols[(rnd()*cols.length)|0];
    const k=(rnd()*3)|0;
    if(k===0){ // amoeba
      ctx.beginPath();const pts=8;for(let p=0;p<=pts;p++){const a=p/pts*Math.PI*2,rr=R*(0.6+rnd()*0.7);const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr*0.7;p?ctx.quadraticCurveTo(cx+Math.cos(a-0.3)*rr*1.1,cy+Math.sin(a-0.3)*rr*0.8,x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();
    } else if(k===1){ // wavy ribbon
      ctx.strokeStyle=cols[(rnd()*cols.length)|0];ctx.lineWidth=Math.max(2,R*0.3);ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(cx-R,cy);ctx.quadraticCurveTo(cx,cy-R,cx+R,cy);ctx.quadraticCurveTo(cx+R*2,cy+R,cx+R*3,cy);ctx.stroke();
    } else { // ladder / comb sign
      ctx.strokeStyle=cols[(rnd()*cols.length)|0];ctx.lineWidth=Math.max(1.5,R*0.16);
      ctx.beginPath();ctx.moveTo(cx,cy-R);ctx.lineTo(cx,cy+R);for(let b=-2;b<=2;b++){ctx.moveTo(cx,cy+b*R*0.4);ctx.lineTo(cx+R*0.7,cy+b*R*0.4);}ctx.stroke();
    }
  }
}

// ── Kandinsky phase: Geometric "Komposition" ──
// Sharp shapes (triangles, outlined circles, a checkerboard), clean saturated
// colours, bold black lines. Cleaner than Cosmic scatter, fuller plane. Element
// counts scale LINEARLY with progress (chordCount is the eff(240) for this phase).
function kandinskyPhaseGeom(ctx, CW, CH, chordCount, sessionSeed, mode, palette){
  const ss = sessionSeed|0, isBW = mode==='bw';
  const cols = _kandPal(palette);
  const ink = isBW ? '#1a1a1a' : '#0a060c';
  ctx.fillStyle = isBW ? '#e8e4dc' : '#f4f0e6';
  ctx.fillRect(0,0,CW,CH);
  const p = Math.max(0, Math.min(1, chordCount / 240));
  const minD = Math.min(CW,CH);
  // big translucent ground triangles (1–4)
  const grounds = Math.max(1, Math.round(p*4));
  for(let i=0;i<grounds;i++){
    const r=_seedRnd(2100+i, ss, 0, 0);
    ctx.globalAlpha=.42; ctx.fillStyle=cols[(r()*cols.length)|0];
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
    ctx.fillStyle=cols[(r()*cols.length)|0];
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
    ctx.fillStyle=cols[(r()*cols.length)|0];
    ctx.beginPath(); ctx.moveTo(cx,cy-s); ctx.lineTo(cx+s,cy+s); ctx.lineTo(cx-s,cy+s); ctx.closePath(); ctx.fill();
  }
}

// ── Kandinsky phase: Dense "Circles + radials" ──
// A big concentric-circle nucleus, radial spokes, plus many small circles/dots
// filling the whole plane — energetic cosmic density, no empty space. Progressive.
function kandinskyPhaseDense(ctx, CW, CH, chordCount, sessionSeed, mode, palette){
  const ss = sessionSeed|0, isBW = mode==='bw';
  const cols = _kandPal(palette);
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
    ctx.globalAlpha=.88; ctx.fillStyle=cols[i%cols.length];
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
    ctx.globalAlpha=0.5+r()*0.5; ctx.fillStyle=cols[(r()*cols.length)|0];
    ctx.beginPath(); ctx.arc(r()*CW, r()*CH, minD*(0.01+r()*0.035), 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;
  // a couple of small concentric satellites past mid-song
  if(p>0.5){
    [[0.82,0.80],[0.18,0.86]].forEach((f,si)=>{
      const sx=CW*f[0], sy=CH*f[1];
      for(let i=3;i>=0;i--){ ctx.fillStyle=cols[(i+si)%cols.length]; ctx.beginPath(); ctx.arc(sx,sy,minD*0.02*(i+1)/4*2,0,Math.PI*2); ctx.fill(); }
    });
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

function pixelsToImageEvents(px,nc,nr,table,colorMode,dir,atmoBias){
  // atmoBias (optional): {v,e} from AI ATM. When present, the painting's own
  // energy is BLENDED with the atmo mood's energy, and the mood's valence biases
  // the rhythmic character (bright/playful vs heavy/legato). This is what makes
  // turning AI ATM on actually reshape the tempo & rhythm, not just the colour.
  const atmoV = atmoBias && typeof atmoBias.v==='number' ? Math.max(-1,Math.min(1,atmoBias.v)) : null;
  const atmoE = atmoBias && typeof atmoBias.e==='number' ? Math.max(0,Math.min(1,atmoBias.e)) : null;
  const CHORD_SIZE=4;
  const COL_STEP=4;                              // merge 4 adjacent columns per time-event
  const _nrBands=Math.floor(nr/CHORD_SIZE);
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
  // levers (dynE, dynScale, rhythmDrive, MEL_MAX, maxRestRun) are then computed
  // from the blended energy so the mood ripples through tempo, loudness, register,
  // density, and breathing — not just colour tint.
  const valenceBias = atmoV!=null ? atmoV : 0;
  if(atmoE!=null){
    // Equal blend, then a small extra pull toward mood when it's far from neutral.
    const extreme = Math.abs(atmoE-0.5)*2;                  // 0 mid … 1 far
    const moodW = 0.5 + 0.35*extreme;                        // 0.50 … 0.85 — strong mood prevails
    energy = Math.max(0,Math.min(1, (1-moodW)*energy + moodW*atmoE));
  }
  // ─── DYNAMICS SCALE (loudness from restlessness + mood) ──────────────────
  // A calm painting must play SOFT even when vivid (Monet pitfall). Restlessness
  // (contrast+busyness) sets the base; mood scales it harder than before so a
  // serene tag really quiets things down (was 0.7+0.6*atmoE → now 0.55+0.9*atmoE).
  const dynE = Math.max(0, Math.min(1, 0.55*eContrast + 0.45*eBusy));
  let dynScale = 0.75 + 0.35*dynE;     // floor 0.75 so plain colour fields still play
  if(atmoE!=null) dynScale *= (0.55 + 0.9*atmoE);
  // ── RHYTHM DRIVE ──
  // A single 0..1 knob that turns "calm/legato/sparse" into "lively/articulated/
  // dense" as it rises. Driven by energy, nudged up by positive valence (bright
  // moods feel more rhythmically alive) and down by very negative valence (heavy,
  // grief-like moods stay broad and slow even if the canvas is busy).
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
    const dh=Math.min(Math.abs(h-bgHue),360-Math.abs(h-bgHue));
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
    // Pitch: hue → COF/SPEC_HUE table
    let pc=0,minD=Infinity;
    table.forEach((th,ti)=>{const d=Math.min(Math.abs(h-th),360-Math.abs(h-th));if(d<minD){minD=d;pc=ti;}});
    // Octave: lightness → register, compressed to 3..6
    const oct=Math.max(3,Math.min(6,3+Math.round((l-20)/72*3)));
    const midi=Math.max(24,Math.min(96,(oct+1)*12+pc+octaveShift)); // gentle whole-image normalization
    // Velocity: chroma drives dynamics. Background-hue cells are attenuated
    // so the non-background palette stays in foreground.
    let v = Math.round(38 + (chroma/100) * 68);
    if (isBackgroundHue) v = Math.round(v * 0.6);
    else if (isNearBackground) v = Math.round(v * 0.82);
    return{m:midi,v,durMs:noteDur};
  }
  // Pick the most vivid of three row-pixels at (band, col) — used when the
  // strict filter would have left this chord empty. Guarantees audible music.
  function pickMostVivid(band, col){
    let best=null, bestCh=-1;
    for(let j=0;j<CHORD_SIZE;j++){
      const row=band*CHORD_SIZE+j; if(row>=nr) break;
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
      for(let sk=0;sk<COL_STEP;sk++){
        const col=cg*COL_STEP+sk; if(col>=nc) break;
        for(let j=0;j<CHORD_SIZE;j++){
          const row=band*CHORD_SIZE+j; if(row>=nr) break;
          const idx=row*nc+col;
          const{r,g,b}=px[idx],[ ,ss,ll]=toHsl(r,g,b);
          cellChroma += ss*Math.min(ll,100-ll)/50; cellChN++;
          const n=pxToNote(idx);
          if(n&&!seenM.has(n.m)){seenM.add(n.m);notes.push(n);}
        }
      }
      // Fallback: grab the most vivid pixel anywhere in the column group
      if(notes.length===0){
        for(let sk=0;sk<COL_STEP&&notes.length===0;sk++){
          const col=cg*COL_STEP+sk; if(col>=nc) break;
          const fallback=pickMostVivid(band,col);
          if(fallback&&!seenM.has(fallback.m)){seenM.add(fallback.m);notes.push(fallback);}
        }
      }
      // Store band+cg so the canvas mosaic can paint each event's exact cell in
      // traversal order (needed for non-row-major directions like vert/spiral).
      evts.push({n:notes,startMs:evIdx*msPerBlock,idx:evIdx,cg,band,colStep:COL_STEP,_chroma:cellChN?cellChroma/cellChN:0});
      evIdx++;
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
  const MEL_MIN=60+MEL_LIFT;                        // C4 (G4 in spectral) — melody floor
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
    // then blend lightly toward the previous note so the line is smooth but
    // still clearly follows the image (70% contour, 30% smoothing).
    let melM=melPc; while(melM<MEL_MIN) melM+=12; while(melM>MEL_MAX) melM-=12;
    const aim = lastMel!=null ? (0.7*targetM + 0.3*lastMel) : targetM;
    const cands=[melM-12,melM,melM+12].filter(m=>m>=MEL_MIN-12&&m<=MEL_MAX+12);
    melM=cands.reduce((a,b)=>Math.abs(b-aim)<Math.abs(a-aim)?b:a);
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
    const rollOff = 0.34;                             // same soft high-end roll-off for all
    const melVel = Math.round((melSrc.v||80) * (0.90 - rollOff*heightFrac));
    const melFloor = 48;
    const melody = melIsBass
      ? {...melSrc}                                   // keep its low pitch + velocity
      : {...melSrc, m:melM, v:Math.max(melFloor,Math.min(96,melVel)), bass:false, white:isWhiteMel};
    if(melIsBass){ lastMel=null; }                    // don't let it anchor the contour
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
      const mel=evts[i].n[0];
      let tm=tonicPc; while(tm<MEL_MIN) tm+=12; while(tm>MEL_MAX) tm-=12;
      // nearest tonic octave to where the melody currently is
      const cands=[tm-12,tm,tm+12].filter(m=>m>=MEL_MIN-12&&m<=MEL_MAX+12);
      tm=cands.reduce((a,b)=>Math.abs(b-mel.m)<Math.abs(a-mel.m)?b:a);
      evts[i].n[0]={...mel, m:tm};
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
    const _topMel=ns=>{ const nb=ns.filter(n=>!n.bass); if(!nb.length) return null; return nb.reduce((a,b)=>b.m>a.m?b:a).m; };
    const _pcKey=ns=>{ const s=new Set(); for(const n of ns) s.add(((n.m%12)+12)%12); return [...s].sort((a,b)=>a-b).join(','); };
    // Walk playable events in order, tracking the previous playable event.
    let prevEv=null;
    for(let i=0;i<evts.length;i++){
      const ev=evts[i];
      if(!ev.n || !ev.n.length || ev._playable===false) continue;
      if(prevEv){
        const tm=_topMel(ev.n), pm=_topMel(prevEv.n);
        const vivid=(ev._chroma||0)>=chromaMed2;
        const sameChord=_pcKey(ev.n)===_pcKey(prevEv.n);   // identical → leave to merge
        if(tm!=null && tm===pm && vivid && !sameChord){
          // Re-strike the melody: restore a clear attack on the tied top note.
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
        for(let x=k;x<k+groupLen;x++) for(const n of evts[x].n){ const pc=((n.m%12)+12)%12; if(!pcMids.has(pc)) pcMids.set(pc,[]); pcMids.get(pc).push(n.m); }
        const template=evts[k].n[0]||{durMs:300};
        const cleanN=[];
        for(const [pc,mids] of pcMids){
          const avgM=mids.reduce((a,b)=>a+b,0)/mids.length;
          let m=Math.round(avgM); while(((m%12)+12)%12!==pc) m+=(((m%12)+12)%12<pc?1:-1);
          const isBass=evts[k].n.some(n=>((n.m%12)+12)%12===pc && n.bass);
          cleanN.push({...template, m, v:meanVel, bass:isBass});
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
      const baseMs = 230 - 70*piecePos - 50*w;        // ~110..230ms nominal
      ev._tremoloMs = Math.round(Math.max(95, baseMs));
      // ACCEL or RIT — direction chosen by the seed (not ord parity), magnitude
      // varies, so the push/relax pattern is irregular across the field.
      const accel = sr<0.5;
      ev._tremEndRatio = accel ? (0.58 + 0.22*w) : (1.22 + 0.40*w2); // ~0.58..0.8 | 1.22..1.62
      // Register shimmer: octave / fifth / none, chosen by seed.
      const liftPick = (sr2>0.62) ? 12 : (sr2>0.30) ? 7 : 0;
      ev._tremLift = liftPick;
      ev._tremLiftCycles = 1 + Math.round(2*w2);              // 1..3 lifts across the hold
      // Loudness breathing depth.
      ev._tremSwell = 0.16 + 0.24*w;                          // 0.16..0.40
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
  // ─── Articulation from texture (deterministic) ─────────────────────────────
  // Smooth, uniform stretches of the image play LEGATO (longer, connected notes);
  // busy, high-contrast stretches play STACCATO (short, detached). We measure
  // local "busyness" as the average absolute change in saliency to neighbouring
  // events, normalise it across the piece, and scale each note's durMs: calm
  // areas breathe, detailed areas feel crisp and energetic.
  const texture=evts.map((ev,i)=>{
    if(!ev.n.length) return 0;
    let d=0,c=0;
    for(let k=Math.max(0,i-2);k<=Math.min(evts.length-1,i+2);k++){
      if(k===i) continue; d+=Math.abs(sal[i]-sal[k]); c++;
    }
    return c?d/c:0;
  });
  const texSorted=texture.filter((_,i)=>evts[i].n.length).slice().sort((a,b)=>a-b);
  const texLo=texSorted.length?texSorted[Math.floor(texSorted.length*0.2)]:0;
  const texHi=texSorted.length?texSorted[Math.floor(texSorted.length*0.8)]:1;
  const texRange=(texHi-texLo)||1;
  for(let i=0;i<evts.length;i++){
    const ev=evts[i];
    if(!ev.n.length||ev._playable===false) continue;
    const t=Math.max(0,Math.min(1,(texture[i]-texLo)/texRange)); // 0 smooth … 1 busy
    // Articulation = a COMPOSER'S mix, not a single global setting. Two axes:
    //   • local texture t  — smooth patches sing long, busy patches clip short
    //   • global rhythmDrive — a serene painting stays legato everywhere; a
    //     driving one lets its busy patches become real STACCATO while its
    //     smooth patches still ring. So one fierce canvas alternates long lyrical
    //     notes and crisp detached ones (musical), instead of everything legato.
    // legatoTop: longest ring on smooth cells (1.6× calm → 1.15× driving).
    // stacMin: shortest on busy cells (1.1× calm = still legato → 0.45× driving = crisp).
    const legatoTop = 1.6 - 0.45*rhythmDrive;
    const stacMin   = 1.1 - 0.65*rhythmDrive;
    const artMul = legatoTop - (legatoTop - stacMin)*t;
    // Floor scales down with drive so staccato is actually short when lively, but
    // never a click. Calm keeps the old generous 140ms minimum.
    const durFloor = Math.round(140 - 70*rhythmDrive);  // 140ms calm … 70ms driving
    // ─── PIANO TECHNIQUE: PER-VOICE ARTICULATION ──────────────────────────────
    // A real pianist does not give every voice the same length. The MELODY (top
    // voice) sings — held long, legato — while the BASS is plucked short and
    // detached (staccato) so it punctuates without muddying the texture; inner
    // (mid) voices stay neutral. Signal: a note's role within its own chord —
    // the highest non-bass pitch is the melody, `n.bass` is the bass, the rest
    // are mid. The per-voice factor multiplies ON TOP of the texture artMul, so
    // a busy staccato patch still has a longer top line and a crisper bass.
    const _nb=ev.n.filter(n=>!n.bass);
    const _topM=_nb.length?Math.max(..._nb.map(n=>n.m)):-Infinity;
    ev.n=ev.n.map(n=>{
      let voiceMul=1;
      if(n.bass)              voiceMul=0.55;   // bass: short, detached
      else if(n.m===_topM)    voiceMul=1.4;    // melody (top voice): long, singing
      // mid voices → 1 (neutral)
      const durMs=Math.max(durFloor, Math.round((n.durMs||250)*artMul*voiceMul));
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
      const motifSrc=soundIdx.slice(0,MOTIF_LEN).map(i=>evts[i].n[0].m);
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
        let anchor=evts[barHeadEvents[0]].n[0].m, acc=anchor;
        for(let k=0;k<barHeadEvents.length;k++){
          const ei=barHeadEvents[k];
          const mel=evts[ei].n[0];
          // target pitch = motif shape applied from the anchor, snapped to scale
          if(k>0 && motifIv[k-1]!=null){ acc=acc+motifIv[k-1]; }
          let target=snapToScale(acc);
          // blend image-following pitch with the motif target (restate weight)
          const blended=Math.round(mel.m*(1-restate) + target*restate);
          const snapped=snapToScale(blended);
          // keep within the melody band
          let mm=snapped; while(mm<MEL_MIN-12) mm+=12; while(mm>MEL_MAX+12) mm-=12;
          evts[ei].n[0]={...mel, m:mm};
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
  }
  // ─── Final dynamics scaling: soften calm paintings, keep wild ones loud ──────
  // Relative shaping above (accents, arc, phrasing) is preserved; only the overall
  // level shifts. A calm Monet plays mp/p, a busy Picasso stays loud.
  if(Math.abs(dynScale-1)>0.001){
    for(const ev of evts){
      if(!ev.n || !ev.n.length) continue;
      ev.n = ev.n.map(n=>({...n, v: Math.max(20, Math.min(120, Math.round((n.v||64)*dynScale)))}));
    }
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
