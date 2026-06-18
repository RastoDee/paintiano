#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────
   check-paintiano.js  —  PRE-DEPLOY GUARD
   Run this BEFORE `node build-paintiano.js`.  It scans the src fragments and
   fails loudly if any known fix is missing — so you never deploy a stale
   fragment that silently reverts a fix (e.g. "Pásmo" coming back).

   Usage (from repo root, where src/paintiano/ lives):
     node check-paintiano.js
   Exit code 0 = all good, safe to build/deploy.
   Exit code 1 = something is missing, DO NOT DEPLOY.
   ───────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');

// Where the fragments live. Adjust if your path differs.
const SRC = path.join('src', 'paintiano');

function read(frag){
  const p = path.join(SRC, frag);
  if(!fs.existsSync(p)){ console.error(`✖ MISSING FILE: ${p}`); process.exit(1); }
  return fs.readFileSync(p, 'utf8');
}

// Each check: { file, label, mustContain:[...], mustNotContain:[...] }
const CHECKS = [
  // ── i18n: showLabel must be "Show" for European langs, never the old words
  { file:'03-i18n.jsx', label:'showLabel = Show (no old words)',
    mustContain:[ "showLabel:'Show'" ],
    mustNotContain:[ "showLabel:'pásmo'", "showLabel:'diapo'", "showLabel:'pase'",
                     "showLabel:'slideshow'", "showLabel:'show'", "showLabel:'スライド'," ] },

  // ── i18n: next key present in all langs (was missing → English fallback)
  { file:'03-i18n.jsx', label:'next translations present',
    mustContain:[ "next:'Ďalší'", "next:'Weiter'", "next:'Suivant'",
                  "next:'Siguiente'", "next:'Próximo'", "next:'次へ'" ] },

  // ── i18n: SK newBy image gender (NOVÝ obraz, not NOVÁ)
  { file:'03-i18n.jsx', label:'SK newBy image = nový (not nová)',
    mustNotContain:[ "image:'nová'" ] },

  // ── 05-main: iOS audio recovery
  { file:'05-main.jsx', label:'iOS audio recovery (audioWasHiddenRef)',
    mustContain:[ 'audioWasHiddenRef' ] },

  // ── 05-main: playback shift fix (wait for clock)
  { file:'05-main.jsx', label:'playback shift fix (clock poll)',
    mustContain:[ 'clock is ticking' ] },

  // ── 05-main: image default palette = Kontra
  { file:'05-main.jsx', label:'image default palette = Kontra',
    mustContain:[ "vividPct < 5 ? 'bw' : 'kontra'" ] },

  // ── 05-main: fullscreen colour chip mirrors canvas
  { file:'05-main.jsx', label:'fullscreen chip mirrors canvas',
    mustContain:[ "appModeRef.current!=='bw'" ] },

  // ── 05-main: kandinsky/wave 7 variants
  { file:'05-main.jsx', label:'kandinsky/wave = 7 phase variants',
    mustContain:[ "style==='kandinsky'||style==='wave'" ] },

  // ── 02-draw: phase functions for Riley/Kandinsky
  { file:'02-draw.jsx', label:'Riley/Kandinsky phase functions',
    mustContain:[ 'rileyPhaseBlaze', 'rileyPhaseFall', 'kandinskyPhaseDense', '_capN(7)' ] },
];

let failed = 0;
const cache = {};
for(const c of CHECKS){
  const src = cache[c.file] || (cache[c.file] = read(c.file));
  const missing = (c.mustContain||[]).filter(s => !src.includes(s));
  const present = (c.mustNotContain||[]).filter(s => src.includes(s));
  if(missing.length===0 && present.length===0){
    console.log(`✓ ${c.file.padEnd(16)} ${c.label}`);
  } else {
    failed++;
    console.error(`✖ ${c.file.padEnd(16)} ${c.label}`);
    missing.forEach(s => console.error(`     MISSING:   ${s}`));
    present.forEach(s => console.error(`     SHOULDN'T BE THERE: ${s}`));
  }
}

console.log('');
if(failed){
  console.error(`✖ ${failed} check(s) FAILED — DO NOT DEPLOY. A fragment is stale.`);
  console.error('  Fix the fragment(s) above, then re-run this script.');
  process.exit(1);
} else {
  console.log('✓ All checks passed — safe to build & deploy.');
  process.exit(0);
}
