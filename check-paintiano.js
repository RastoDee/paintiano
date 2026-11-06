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
const shape = shapeIssues();
if (shape.length) { failed++; shape.forEach((x) => console.error('✖ shape           ' + x)); }
else console.log('✓ shape           bracket balance and line endings as known');

console.log('');
if (failed) { console.error(`✖ ${failed} check(s) FAILED — do not deploy.`); process.exit(1); }
console.log('✓ All checks passed — safe to build & deploy.');
