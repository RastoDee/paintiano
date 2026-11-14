#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────
   check-paintiano.js — the pre-build guard (runs in `npm run build`, so Vercel
   refuses a deploy that fails it).

   1. Fixes that must not come back (a stale fragment silently reverts them):
      every guard is a pattern that must (or must not) be in a fragment.
   2. i18n: every language object with EN/SK/… holds the same keys as EN —
      a missing key would show English (or nothing) in that language.
   3. Shape: the fragments' bracket balance stays what it was (a half-pasted
      edit shows up here before vite does).

   Exit 0 = safe to build. Exit 1 = do not deploy; the output says why.
   Usage: node check-paintiano.js      (from the repo root)
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SRC = path.join('src', 'paintiano');
const LANGS = ['EN', 'SK', 'DE', 'FR', 'ES', 'PT', 'zh', 'zhTW', 'ja'];
const cache = {};
const read = (frag) => {
  if (cache[frag]) return cache[frag];
  const p = path.join(SRC, frag);
  if (!fs.existsSync(p)) { console.error(`✖ MISSING FILE: ${p}`); process.exit(1); }
  return (cache[frag] = fs.readFileSync(p, 'utf8'));
};

// ── 1. fixes that must stay ────────────────────────────────────────────────
// { file, label, must:[string|RegExp], mustNot:[string|RegExp], symptom }
const GUARDS = [
  { file: '03-i18n.jsx', label: 'showLabel = Show (no old words)',
    must: ["showLabel:'Show'"], mustNot: ["showLabel:'pásmo'", "showLabel:'diapo'", "showLabel:'pase'", "showLabel:'slideshow'"],
    symptom: 'the Show button is called by its old name in some languages' },
  { file: '05-main.jsx', label: 'iOS audio recovery after the app was hidden',
    must: ['audioWasHiddenRef'], symptom: 'after switching apps on iOS the sound does not come back' },
  { file: '05-main.jsx', label: 'playback waits for the clock',
    must: ['clock is ticking'], symptom: 'the first notes come out shifted against the painting' },
  { file: '05-main.jsx', label: 'a greyscale picture opens in B/W',
    must: [/vividPct\s*<\s*5\s*\?\s*'bw'/], symptom: 'a black-and-white photo is painted in colour' },
  { file: '05-main.jsx', label: 'the full-screen colour chip mirrors the canvas',
    must: ["appModeRef.current!=='bw'"], symptom: 'the chip shows colours while the painting is B/W' },
  { file: '02-draw.jsx', label: 'Riley / Kandinsky phase functions',
    must: ['rileyPhaseBlaze', 'rileyPhaseFall', 'kandinskyPhaseA', '_capN(7)'], symptom: 'some painter variants are missing' },
  { file: '05-main.jsx', label: 'Clear resets the image draft',
    must: [/imageStashRef\.current\s*=\s*null;\s*setHasImageDraft\(false\)/], symptom: 'after Clear the Image tile still glows as if a draft waited' },
  { file: '05-main.jsx', label: 'a locked painter: taste first, then the paywall',
    must: ['const _lockTap = (k)=>', /if\(locked\)\{ _lockTap\(k\); return; \}/], symptom: 'a Free user can pick a Pro painter without the lock' },
  { file: '05-main.jsx', label: 'the Studio rail shows every painter to Free',
    must: [/if\(studioFs && !cockpitEdit && proStatus==='free'\) for\(const _k of ALL_ARTIST_KEYS\)/], symptom: 'Free sees only its own painters in the Studio' },
  { file: '05-main.jsx', label: 'the painting of the day and its link',
    must: ['const pieceOfDay = ', "_qp==='today'", 'const _paintAddr = ()=>'], symptom: 'For You has no painting of the day; shares carry no link' },
  { file: '05-main.jsx', label: 'the first screen keeps its picture as a ghost',
    must: ['pf-sh-poster'], symptom: 'the first screen goes black when the piece starts' },
  { file: '05-main.jsx', label: 'the read-scale reaches the Studio text',
    must: [/\.pf-st-tip\{[^}]*var\(--pf-read-scale/], symptom: 'A/A/A does not change the Studio tips' },
  { file: '02-draw.jsx', label: 'a mixed stretch never goes grey (Rothko, Bauhaus)',
    must: ['function _mixIdx(', 'return _mixIdx(chords,I,gc,isBW,mode)', 'return S.mix(I)', "mode==='harmony'"], symptom: 'Rothko and the Bauhaus Homage come out grey in Spectral / Kontra / Phi' },
  { file: '02-draw.jsx', label: 'a fusion palette: shades of one hue count once, one hue alone is widened',
    must: ['_new(c2)', 'function _fuSpread(', '_fuSpread(P)<=110'], symptom: 'a fusion is painted in one hue (all brown, all green)' },
  { file: '02-draw.jsx', label: 'the fusion sample is keyed by the whole palette',
    must: ['for(let q=60;q<72;q++) _pk+=', '_variantCap==null'], symptom: 'a fusion keeps the old colours after a Custom colour changes' },
];

// ── 2. i18n completeness ──────────────────────────────────────────────────
// finds every `const NAME = { EN: …` object literal, evaluates it in a sandbox and compares keys
function i18nIssues() {
  const issues = [];
  for (const f of ['01-core-head.jsx', '03-i18n.jsx', '04-songs.jsx', '05-main.jsx', '07-pro.jsx']) {
    const src = read(f);
    const re = /const ([A-Za-z_0-9]+)\s*=\s*\{\s*(?:\r?\n\s*)?EN\s*:/g; let m;
    while ((m = re.exec(src))) {
      const i = src.indexOf('{', m.index); let d = 0, j = i, inS = null;
      for (; j < src.length; j++) {
        const c = src[j];
        if (inS) { if (c === '\\') { j++; continue; } if (c === inS) inS = null; continue; }
        if (c === "'" || c === '"' || c === '`') { inS = c; continue; }
        if (c === '{') d++; else if (c === '}') { d--; if (d === 0) break; }
      }
      let obj; try { obj = vm.runInNewContext('(' + src.slice(i, j + 1) + ')', {}); } catch (_) { continue; }
      if (!obj || !obj.EN || !obj.SK) continue;
      const walk = (en, o, p, L) => {
        if (typeof en === 'string') { if (o === undefined) issues.push(`${f} ${m[1]}.${L}.${p} missing`); return; }
        if (en && typeof en === 'object' && o && typeof o === 'object') for (const k of Object.keys(en)) walk(en[k], o[k], p ? p + '.' + k : k, L);
      };
      for (const L of LANGS) { if (L === 'EN') continue; if (!obj[L]) { issues.push(`${f} ${m[1]} has no ${L}`); continue; } walk(obj.EN, obj[L], '', L); }
    }
  }
  return issues;
}

// ── 3. shape ──────────────────────────────────────────────────────────────
// the bracket balance of each fragment as it is known to be (the fragments are raw slices; what matters is that it does not drift)
const SHAPE = { '05-main.jsx': { curly: 2, round: -8 } };
function shapeIssues() {
  const out = [];
  for (const [f, exp] of Object.entries(SHAPE)) {
    const s = read(f);
    const curly = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
    const round = (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length;
    if (curly !== exp.curly || round !== exp.round) out.push(`${f}: brackets {${curly} (${round} — expected {${exp.curly} (${exp.round}`);
    if (/\r\n/.test(s) && /[^\r]\n/.test(s)) out.push(`${f}: mixed line endings (CRLF and LF)`);
  }
  return out;
}

// ── 2b. the rosters agree ─────────────────────────────────────────────────
// One list of painters (ALL_ARTIST_KEYS) and one of composers (ALL_COMPOSER_KEYS) are the truth; every other
// place that names them must match — so adding a painter means: this guard tells you every place to touch.
function rosterIssues() {
  const out = [];
  const m5 = read('05-main.jsx'), m2 = read('02-draw.jsx'), m4 = read('04-songs.jsx');
  const arr = (src, name) => { const m = src.match(new RegExp('const ' + name + '\\s*=\\s*(?:useMemo\\(\\(\\)=>\\s*)?(\\[[^\\]]*\\])')); return m ? vm.runInNewContext('(' + m[1] + ')', {}) : null; };
  const objKeys = (src, name) => { const m = src.match(new RegExp('const ' + name + '\\s*=\\s*(\\{)')); if (!m) return null; let i = m.index + m[0].length - 1, d = 0, j = i, inS = null; for (; j < src.length; j++) { const c = src[j]; if (inS) { if (c === '\\\\') { j++; continue; } if (c === inS) inS = null; continue; } if (c === "'" || c === '"' || c === '`') { inS = c; continue; } if (c === '{') d++; else if (c === '}') { d--; if (d === 0) break; } } try { return Object.keys(vm.runInNewContext('(' + src.slice(i, j + 1) + ')', {})); } catch (_) { return null; } };
  const artists = (arr(m5, 'ALL_ARTIST_KEYS') || []).filter((k) => k !== 'mosaicFamily');
  const composers = arr(m5, 'ALL_COMPOSER_KEYS') || [];
  if (!artists.length || !composers.length) return ['could not read ALL_ARTIST_KEYS / ALL_COMPOSER_KEYS'];
  const need = (label, keys, list) => { if (!list) { out.push(`${label}: not found`); return; } const miss = keys.filter((k) => !list.includes(k)); if (miss.length) out.push(`${label} lacks: ${miss.join(', ')}`); };
  const within = (label, list, keys) => { if (!list) { out.push(`${label}: not found`); return; } const extra = list.filter((k) => !keys.includes(k)); if (extra.length) out.push(`${label} has unknown: ${extra.join(', ')}`); };
  need('STYLE_INSPIRED (05)', artists, objKeys(m5, 'STYLE_INSPIRED'));
  need('ARTIST_VARIANT_N (02)', artists, objKeys(m2, 'ARTIST_VARIANT_N'));
  within('DAILY_ARTIST_POOL (05)', arr(m5, 'DAILY_ARTIST_POOL'), artists);
  need('COMPOSER_INSPIRED (05)', composers, objKeys(m5, 'COMPOSER_INSPIRED'));
  need('_COMP_SHORT (05)', composers, objKeys(m5, '_COMP_SHORT'));
  need('STUDIO_COMP_MONO (05)', composers, objKeys(m5, 'STUDIO_COMP_MONO'));
  within('DAILY_COMPOSER_POOL (05)', arr(m5, 'DAILY_COMPOSER_POOL'), composers);
  within('FREE_COMPOSER_KEYS (05)', arr(m5, 'FREE_COMPOSER_KEYS'), composers);
  // api/og.js names every painter; public/og holds a card for every built-in piece × painter
  const og = fs.existsSync('api/og.js') ? fs.readFileSync('api/og.js', 'utf8') : '';
  const ogArtists = objKeys(og, 'ARTISTS'); need('api/og.js ARTISTS', artists, ogArtists); within('api/og.js ARTISTS', ogArtists, artists);
  const pieces = (read('03-i18n.jsx').match(/key:"([a-z]+)"/g) || []).map((x) => x.slice(5, -1));
  const ogPieces = objKeys(og, 'PIECES') || []; need('api/og.js PIECES', pieces, ogPieces); within('api/og.js PIECES', ogPieces, pieces);
  for (const pc of pieces) { const miss = artists.filter((a) => !fs.existsSync(path.join('public', 'og', `${pc}-${a}.jpg`))); if (miss.length) out.push(`public/og: no card for ${pc} × ${miss.join(', ')}`); }
  // the Guide's counts
  const nA = artists.length, nC = composers.length;
  for (const [re, label] of [[/(\d+) painters/g, 'painters'], [/(\d+) composers/g, 'composers'], [/(\d+) maliarov/g, 'maliarov'], [/(\d+) skladateľov/g, 'skladateľov']]) {
    let m; const want = /paint|mal/.test(label) ? nA : nC; while ((m = re.exec(m4))) { if (+m[1] !== want && +m[1] >= 10) { out.push(`04-songs.jsx says "${m[0]}" but there are ${want}`); break; } }
  }
  return out;
}

// ── 4. colour: a stretch mixed into one colour ───────────────────────────
// _mixIdx (02-draw) is run here on a C-minor passage in the four palettes. In Harmony it must hand back the plain
// mean (Harmony is the yardstick and is never touched); in the others the mix must keep at least 0.8 of the colour
// the same notes keep in Harmony — a palette that spreads a key round the wheel used to mix it to grey.
function mixIssues() {
  const h = read('01-core-head.jsx'), d = read('02-draw.jsx');
  const line = (src, start) => { const i = src.indexOf(start); return i < 0 ? null : src.slice(i, src.indexOf('\n', i)); };
  const parts = ['const octL =', 'const COF=', 'const fromHsl=', 'const harmCol=', 'const SPEC_HUE=', 'const specCol=', 'const PHI_HUE=', 'const phiCol=', 'const KONTRA_HUE=', 'const kontraCol='].map((n) => line(h, n));
  const t0 = h.indexOf('const toHsl = (r,g,b) => {'), t1 = h.indexOf('};', t0), m0 = d.indexOf('function _mixIdx('), m1 = d.indexOf('return at(hi); }', m0);
  if (parts.includes(null) || t0 < 0 || t1 < 0 || m0 < 0 || m1 < 0) return ['could not read _mixIdx or the palette functions'];
  const code = parts.join('\n') + '\n' + h.slice(t0, t1 + 2) + '\n' + d.slice(m0, m1 + 16) + `
    function _picChord(chords,i,gc){ const ns=chords[i].n; const a=[0,0,0]; for(const q of ns){ const c=gc(q.m,q.v); a[0]+=c[0]; a[1]+=c[1]; a[2]+=c[2]; } return {rgb:a.map(v=>Math.round(v/ns.length))}; }
    const P=[[48,60,63,67],[53,60,65,68],[55,59,62,67],[48,60,63,67],[51,55,58,63],[56,60,63,68],[55,59,62,65],[48,55,60,63]].map(ns=>({n:ns.map(m=>({m,v:80}))}));
    const I=P.map((_,i)=>i), cr=(c)=>Math.max(c[0],c[1],c[2])-Math.min(c[0],c[1],c[2]);
    const plain=(gc)=>{ const m=[0,0,0]; for(const i of I){ const q=_picChord(P,i,gc).rgb; m[0]+=q[0]/I.length; m[1]+=q[1]/I.length; m[2]+=q[2]/I.length; } return m; };
    ({ harm: cr(_mixIdx(P,I,harmCol,false,'harmony')), plain: cr(plain(harmCol)), Spectral: cr(_mixIdx(P,I,specCol,false,'spectral')), Phi: cr(_mixIdx(P,I,phiCol,false,'phi')), Kontra: cr(_mixIdx(P,I,kontraCol,false,'kontra')) })`;
  let r; try { r = vm.runInNewContext(code, {}); } catch (e) { return ['_mixIdx did not run: ' + e.message]; }
  const out = [];
  if (!(r.harm > 40) || Math.abs(r.harm - r.plain) > 0.5) out.push('Harmony: a mixed stretch is no longer the plain mean of its chords');
  for (const k of ['Spectral', 'Phi', 'Kontra']) if (!(r[k] >= 0.8 * r.harm)) out.push(`${k}: a C-minor passage mixes to grey (colour ${Math.round(r[k])}, Harmony keeps ${Math.round(r.harm)})`);
  return out;
}

// ── run ───────────────────────────────────────────────────────────────────
let failed = 0;
const has = (src, p) => (p instanceof RegExp ? p.test(src) : src.includes(p));
for (const g of GUARDS) {
  const src = read(g.file);
  const missing = (g.must || []).filter((p) => !has(src, p));
  const present = (g.mustNot || []).filter((p) => has(src, p));
  if (!missing.length && !present.length) { console.log(`✓ ${g.file.padEnd(16)} ${g.label}`); continue; }
  failed++;
  console.error(`✖ ${g.file.padEnd(16)} ${g.label}`);
  missing.forEach((p) => console.error(`     MISSING:   ${p}`));
  present.forEach((p) => console.error(`     SHOULD NOT BE THERE: ${p}`));
  console.error(`     symptom:   ${g.symptom}`);
}
const i18n = i18nIssues();
if (i18n.length) { failed++; console.error(`✖ i18n: ${i18n.length} key(s) missing`); i18n.slice(0, 40).forEach((x) => console.error('     ' + x)); }
else console.log('✓ i18n            every language holds every key');
const roster = rosterIssues();
if (roster.length) { failed++; console.error('✖ rosters'); roster.forEach((x) => console.error('     ' + x)); }
else console.log('✓ rosters         painters and composers agree everywhere (05, 02, api/og.js, public/og, the Guide)');
const mix = mixIssues();
if (mix.length) { failed++; console.error('✖ colour'); mix.forEach((x) => console.error('     ' + x)); }
else console.log('✓ colour          a mixed stretch keeps its colour in every palette (Rothko, Bauhaus)');
const shape = shapeIssues();
if (shape.length) { failed++; shape.forEach((x) => console.error('✖ shape           ' + x)); }
else console.log('✓ shape           bracket balance and line endings as known');

console.log('');
if (failed) { console.error(`✖ ${failed} check(s) FAILED — do not deploy.`); process.exit(1); }
console.log('✓ All checks passed — safe to build & deploy.');
