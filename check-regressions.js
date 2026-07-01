// ─────────────────────────────────────────────────────────────────────────────
// check-regressions.js — pre-build regression guards
// ─────────────────────────────────────────────────────────────────────────────
//
// Purpose: every time we fix a bug that "keeps coming back", add a guard here.
// The script scans source fragments for required patterns and fails the build
// with exit code 1 if any guard is missing. This catches the scenario where
// a later edit accidentally removes a fix without anyone noticing.
//
// Usage in deploy sequence (Windows cmd, before build):
//   del src\paintiano.jsx
//   node check-paintiano.js
//   node check-regressions.js       ← this file
//   node build-paintiano.js
//
// Adding a new guard:
//   1. Fix the bug (edit fragment).
//   2. Add an entry to GUARDS below with { name, file, pattern, symptom }.
//   3. Test that the guard fails when the fix is removed (sanity check).
//   4. Never remove a guard; only rewrite it if the underlying code changes.
//
// Guard entry fields:
//   name    — short human label shown on pass/fail
//   file    — relative path from repo root (e.g. 'src/fragments/05-main.jsx')
//   pattern — RegExp that MUST match at least once in the file
//   symptom — what breaks in the app when this guard fails (shown on failure)
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const GUARDS = [
  {
    name: 'clear() resets image draft state',
    file: 'src/fragments/05-main.jsx',
    pattern: /imageStashRef\.current\s*=\s*null;\s*setHasImageDraft\(false\)/,
    symptom:
      'After Clear, the Setup screen Image tile still glows with the gold ' +
      '"active/draft" dot even though there is no content to return to. ' +
      'Test: load Image → Clear → Back to Setup → Image tile must NOT glow.',
  },
  {
    name: 'See Music: _paintPc side-channel ref declared',
    file: 'src/fragments/05-main.jsx',
    pattern: /const _imagePaintPcsRef\s*=\s*useRef\(null\)/,
    symptom:
      'See Music bridge encodes chords via MIDI which strips the custom ' +
      '_paintPc field. Without this side-channel, the pixel-derived colour ' +
      'is lost during Image → Music transfer, and the Music-mode painting ' +
      'no longer resembles the source image (e.g. green image gives a ' +
      'harmonic-coloured painting instead of a green one).',
  },
  {
    name: 'See Music: _paintPc captured in bridge before MIDI encode',
    file: 'src/fragments/05-main.jsx',
    pattern: /_imagePaintPcsRef\.current\s*=\s*baked\.map\(c\s*=>\s*\(c\.n\s*\|\|\s*\[\]\)\.map/,
    symptom:
      'Side-channel ref exists but nothing writes to it before the MIDI ' +
      'encode step. See Music transfer produces empty side-channel and ' +
      'source colours are still lost.',
  },
  {
    name: 'See Music: _paintPc hydration effect after loadMidi',
    file: 'src/fragments/05-main.jsx',
    pattern: /_paintPc hydration.+See Music round-trip/,
    symptom:
      'Side-channel captures _paintPc but nothing re-injects it into chord ' +
      'notes after loadMidi. drawBlock dual-layer branch (02-draw.jsx:1244) ' +
      'never activates because _hasPaintPc stays false; painting reads only ' +
      'the harmonically-shaped m instead of the source pixel PC.',
  },
  {
    name: 'See Music: dual-layer render in drawBlock',
    file: 'src/fragments/02-draw.jsx',
    pattern: /const _hasPaintPc\s*=\s*notes\.some\(n\s*=>\s*typeof n\._paintPc\s*===\s*['"]number['"]\)/,
    symptom:
      'drawBlock no longer transforms m to _paintPc for painting. Even with ' +
      'side-channel + hydration working, the painter ignores _paintPc and ' +
      'paints from raw m — same regression as if the whole feature was gone.',
  },
  {
    name: 'See Music: chord constructor writes _paintPc',
    file: 'src/fragments/02-draw.jsx',
    pattern: /_paintPc\s*:\s*midi\s*%\s*12/,
    symptom:
      'Image scan constructor no longer records _paintPc per note. The ' +
      'entire dual-layer chain has no source data to work with; hydration ' +
      'has nothing to preserve.',
  },
  // Add new guards here as bugs recur. Format:
  // {
  //   name: '...',
  //   file: 'src/fragments/XX-name.jsx',
  //   pattern: /.../,
  //   symptom: '...',
  // },
];

// ─────────────────────────────────────────────────────────────────────────────
// Runner — do not edit below this line
// ─────────────────────────────────────────────────────────────────────────────

let failed = 0;
let passed = 0;
const failures = [];

for (const guard of GUARDS) {
  const full = path.resolve(process.cwd(), guard.file);
  if (!fs.existsSync(full)) {
    failed++;
    failures.push({ guard, reason: 'file not found: ' + guard.file });
    continue;
  }
  const src = fs.readFileSync(full, 'utf8');
  if (guard.pattern.test(src)) {
    passed++;
  } else {
    failed++;
    failures.push({ guard, reason: 'pattern not found in ' + guard.file });
  }
}

if (failed === 0) {
  console.log('✓ regression guards: ' + passed + '/' + GUARDS.length + ' passed');
  process.exit(0);
}

console.error('');
console.error('✗ REGRESSION GUARD FAILURE — build blocked');
console.error('  ' + failed + ' of ' + GUARDS.length + ' guards failed');
console.error('');
for (const f of failures) {
  console.error('  · ' + f.guard.name);
  console.error('    reason:  ' + f.reason);
  console.error('    symptom: ' + f.guard.symptom);
  console.error('');
}
console.error('A previously fixed bug has come back. Restore the fix in the');
console.error('affected file(s) before deploying, or the same bug will hit users again.');
console.error('');
process.exit(1);
