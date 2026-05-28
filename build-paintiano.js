#!/usr/bin/env node
/* ───────────────────────────────────────────────────────────────────────────
   Paintiano build — stitches src/paintiano/*.jsx fragments into src/paintiano.jsx
   ───────────────────────────────────────────────────────────────────────────
   • The fragments are raw text slices (NO import/export between them), so the
     concatenation is byte-identical to a hand-maintained single file.
   • Output is written with CRLF line endings to match this Windows repo, so git
     shows only the lines you actually changed (no LF→CRLF whole-file churn).
   • Validation: the merged output must fully parse as JSX via @babel/parser.

   Source of truth = the modules in src/paintiano/.
   Do NOT edit src/paintiano.jsx by hand — it is generated and will be overwritten.

   Usage:   node build-paintiano.js
   Needs:   npm i -D @babel/parser   (one time)

   NOTE: written as an ES module (import syntax) because package.json has
         "type": "module". That is why this is import, not require.
   ─────────────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let parser;
try {
  parser = (await import('@babel/parser')).default ?? (await import('@babel/parser'));
} catch (e) {
  console.error('Missing dependency. Run once:  npm i -D @babel/parser');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SRC  = path.join(ROOT, 'src', 'paintiano');
const OUT  = path.join(ROOT, 'src', 'paintiano.jsx');
const REF  = path.join(ROOT, 'src', 'paintianoRef.jsx');

// Fragment order — must stay in this sequence to reproduce the single file.
// Adding a new module: insert it here at the right spot (alphabetic-ish, by
// dependency order). Files NOT listed are ignored even if present in SRC.
const ORDER = [
  '01-core-head.jsx',    // imports + §1 constants/math + §2 parsers
  '02-draw.jsx',         // §3 canvas draw functions
  '03-i18n.jsx',         // §4 i18n / concept / guide
  '04-songs.jsx',        // §5 song data / library / moods
  '045-ai-artist.jsx',   // §5b AI Artist pool + generate + drawing (alpha)
  '05-main.jsx',         // §6 sub-components + §7 main component
];

// Read each fragment, normalising any CRLF back to LF so the stitch is clean.
const readLF = f => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n/g, '\n');

for (const f of ORDER) {
  if (!fs.existsSync(path.join(SRC, f))) {
    console.error(`BUILD FAILED — missing module: src/paintiano/${f}`);
    process.exit(1);
  }
}

const mergedLF = ORDER.map(readLF).join('');

// ── Validation: real JSX parse ──────────────────────────────────────────────
function parse(code, label) {
  try {
    parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  } catch (e) {
    console.error(`BUILD FAILED — ${label} JSX parse error:`);
    console.error('  ' + e.message);
    process.exit(1);
  }
}
parse(mergedLF, 'src/paintiano.jsx');

// ── Rotate Ref: current paintiano.jsx becomes "one version behind" ──────────
let prevCRLF = null;
if (fs.existsSync(OUT)) prevCRLF = fs.readFileSync(OUT, 'utf8');

// ── Write output with CRLF to match the Windows repo ────────────────────────
const mergedCRLF = mergedLF.replace(/\n/g, '\r\n');
fs.writeFileSync(OUT, mergedCRLF);
if (prevCRLF !== null) fs.writeFileSync(REF, prevCRLF);

const lines = mergedLF.split('\n').length - 1;
console.log(`OK  src/paintiano.jsx written — ${lines} lines, JSX parse OK, CRLF endings`);
if (prevCRLF !== null) console.log('OK  src/paintianoRef.jsx rotated (previous build)');
console.log('Now:  git add . && git commit -m "..." && git push');
