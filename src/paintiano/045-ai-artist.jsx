// ─── AI Artist (skeleton MVP) ───────────────────────────────────────────────
// "In the spirit of" — picks a real artist and renders the current piece as
// they might have painted it. Skeleton version: 5 artists, simplified drawing.
// Used to verify the TDZ-safe integration before scaling to the full 100+ pool.
//
// Two AI calls (with offline fallback):
//   1. Artist pick — given mood/song context, AI picks one from the pool.
//   2. Palette + recipe — AI returns 12 colours + drawing recipe.
//
// Module-scope functions and constants. Called by 05-main.jsx via refs (see
// the TDZ-safe pattern there) so React's render order can't trip the
// initialization timing.

const AI_ARTIST_POOL = [
  { name:'Vincent van Gogh', period:'1889 Saint-Rémy',
    geometry:'gestural', edges:'soft', density:.85, accent:'strokes',
    palette:['#0c1424','#1c2840','#2a3a60','#3a5078','#4a6890','#688098','#88a8b0','#d0c060','#e8a830','#f0d050','#a8c098','#1c4028'] },
  { name:'Frida Kahlo', period:'1940s self-portraits',
    geometry:'organic', edges:'hard', density:.7, accent:'shapes',
    palette:['#0a0808','#181410','#2c2018','#3a2418','#a02820','#c83830','#e0683c','#88a060','#386040','#48a868','#c84860','#e0c878'] },
  { name:'Katsushika Hokusai', period:'1830s ukiyo-e',
    geometry:'flowing', edges:'hard', density:.65, accent:'shapes',
    palette:['#0a0a18','#1a2848','#2a4880','#3868a8','#4a80c0','#7098c0','#a0b8d0','#88684c','#a0886c','#c8b890','#e0d8c0','#f4ecd8'] },
  { name:'Mark Rothko', period:'1950s multiforms',
    geometry:'geometric', edges:'feathered', density:.5, accent:'fields',
    palette:['#0a0606','#1a1010','#2a1818','#3a2018','#702820','#a82a18','#c84020','#e06030','#684020','#88684c','#c8a878','#e8d4a8'] },
  { name:'Hilma af Klint', period:'1907 esoteric abstraction',
    geometry:'geometric', edges:'soft', density:.65, accent:'shapes',
    palette:['#0a0a14','#1a1828','#2a2c48','#404068','#586088','#7878a0','#a0a878','#c8c068','#c87060','#e09080','#a8c0c0','#f0e0c8'] },
];

// ─── Cache ──────────────────────────────────────────────────────────────────
const _aiArtistCache = (typeof Map !== 'undefined') ? new Map() : null;
const AI_ARTIST_LRU = 16;

function _aiArtistCacheKey(context, seed){
  return String(context||'').toLowerCase().slice(0,80) + '|' + (seed>>>0);
}
function _aiArtistCacheGet(key){
  if(!_aiArtistCache || !_aiArtistCache.has(key)) return null;
  const v = _aiArtistCache.get(key);
  _aiArtistCache.delete(key); _aiArtistCache.set(key, v);
  return v;
}
function _aiArtistCacheSet(key, value){
  if(!_aiArtistCache) return;
  if(_aiArtistCache.has(key)) _aiArtistCache.delete(key);
  _aiArtistCache.set(key, value);
  while(_aiArtistCache.size > AI_ARTIST_LRU){
    const firstKey = _aiArtistCache.keys().next().value;
    _aiArtistCache.delete(firstKey);
  }
}

// Hash → 32-bit, for deterministic offline pick.
function _aiArtistHash(s){
  let h = 0x811c9dc5;
  for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return h >>> 0;
}

// Offline pick: deterministic from context + seed, avoids names already used.
function _aiArtistOfflinePick(context, seed, usedNames){
  const used = new Set(Array.isArray(usedNames) ? usedNames : []);
  const h = _aiArtistHash(String(context||'') + '|' + (seed>>>0));
  for(let i=0; i<AI_ARTIST_POOL.length; i++){
    const a = AI_ARTIST_POOL[(h + i) % AI_ARTIST_POOL.length];
    if(!used.has(a.name)) return a;
  }
  return AI_ARTIST_POOL[h % AI_ARTIST_POOL.length];
}

// Public entry — async, resolves to {name, period, palette[12], geometry, edges, density, accent}.
// Skeleton version: offline-only (no AI calls yet — confirm UI/TDZ first, then add API).
async function generateAiArtist(opts){
  const o = opts || {};
  const context = String(o.context || '');
  const seed = (o.seed >>> 0) || 0;
  const usedNames = Array.isArray(o.usedNames) ? o.usedNames : [];
  const cacheKey = _aiArtistCacheKey(context, seed);
  const cached = _aiArtistCacheGet(cacheKey);
  if(cached) return cached;
  // For the skeleton, pick offline. (Full version: 2 AI calls + this as fallback.)
  const picked = _aiArtistOfflinePick(context, seed, usedNames);
  const out = {
    name: picked.name,
    period: picked.period,
    palette: picked.palette.slice(0, 12),
    geometry: picked.geometry,
    edges: picked.edges,
    density: picked.density,
    accent: picked.accent,
  };
  _aiArtistCacheSet(cacheKey, out);
  return out;
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

// Mulberry32 PRNG.
function _aiRng(seed){
  let t = (seed >>> 0) || 1;
  return function(){
    t |= 0; t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Map chord → palette colour by pitch class.
function _aiColorForChord(palette, chord){
  if(!chord || !chord.n || !chord.n.length) return palette[0];
  const m = chord.n[0].m | 0;
  const pc = ((m % 12) + 12) % 12;
  return palette[pc % 12];
}

// Hex → rgba string.
function _aiHexA(hex, alpha){
  const h = (hex && hex[0] === '#') ? hex.slice(1) : (hex || '000000');
  const r = parseInt(h.slice(0,2), 16) | 0;
  const g = parseInt(h.slice(2,4), 16) | 0;
  const b = parseInt(h.slice(4,6), 16) | 0;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + (Math.max(0, Math.min(1, alpha))).toFixed(3) + ')';
}

// Skeleton overlay drawing — fills cells with palette colours, adds one accent layer.
function drawAiArtistOverlay(ctx, CW, CH, chords, lim, gc, sessionSeed, mode, recipe){
  if(!recipe || !chords || lim <= 0) return;
  const rng = _aiRng(sessionSeed || 1);
  const palette = recipe.palette || AI_ARTIST_POOL[0].palette;
  const density = Math.max(0.2, Math.min(1, recipe.density || 0.6));
  // Background — palette darkest → mid gradient.
  const dark = palette[0] || '#04040a';
  const mid  = palette[Math.floor(palette.length / 2)] || dark;
  const grad = ctx.createLinearGradient(0, 0, 0, CH);
  grad.addColorStop(0, _aiHexA(dark, 1));
  grad.addColorStop(1, _aiHexA(mid, 0.65));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CW, CH);
  // Cell layer.
  const cells = (gc && Array.isArray(gc.cells)) ? gc.cells : [];
  const limCells = Math.min(lim, cells.length);
  for(let i = 0; i < limCells; i++){
    const cell = cells[i]; if(!cell) continue;
    const chord = chords[i]; if(!chord) continue;
    const col = _aiColorForChord(palette, chord);
    const vel = (chord.n && chord.n[0] && chord.n[0].v) || 80;
    const a = 0.4 + (vel / 127) * 0.55;
    ctx.fillStyle = _aiHexA(col, a);
    if(recipe.geometry === 'flowing' || recipe.geometry === 'organic'){
      ctx.beginPath();
      ctx.ellipse(cell.x + cell.w/2, cell.y + cell.h/2, cell.w * 0.5, cell.h * 0.5, 0, 0, Math.PI*2);
      ctx.fill();
    } else {
      ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
    }
  }
  // Accent layer — sparse strokes/dots/shapes over the cells.
  const accentBudget = Math.floor(density * limCells * 0.5);
  for(let k = 0; k < accentBudget; k++){
    const ci = Math.floor(rng() * limCells);
    const cell = cells[ci]; if(!cell) continue;
    const chord = chords[ci];
    const col = _aiColorForChord(palette, chord);
    const cx = cell.x + cell.w * (0.3 + rng() * 0.4);
    const cy = cell.y + cell.h * (0.3 + rng() * 0.4);
    if(recipe.accent === 'strokes'){
      ctx.strokeStyle = _aiHexA(col, 0.7);
      ctx.lineWidth = Math.max(1, rng() * 3);
      const ang = rng() * Math.PI * 2;
      const len = Math.min(cell.w, cell.h) * (0.4 + rng() * 0.6);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      ctx.stroke();
    } else if(recipe.accent === 'fields'){
      const r = Math.min(CW, CH) * (0.06 + rng() * 0.10);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, _aiHexA(col, 0.35));
      g.addColorStop(1, _aiHexA(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
    } else {
      // shapes / default
      const r = Math.min(cell.w, cell.h) * (0.2 + rng() * 0.3);
      ctx.fillStyle = _aiHexA(col, 0.7);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
    }
  }
}
