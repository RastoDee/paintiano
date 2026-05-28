// ─────────────────────────────────────────────────────────────────────────────
// §6b  DEMO REEL  — a ~45s self-playing promo / feature tour.
//
// This module is pure data + helpers (no React). The orchestration (a chain of
// timers that drives React state) lives in the main component, because it needs
// the live setters. Here we only declare WHAT happens and WHEN, plus the 5-lang
// overlay copy, so the sequence is easy to read and tweak in one place.
//
// The reel reuses the real engine end-to-end (it actually paints, swaps styles,
// runs Vary, shows a frame/print beat) so it doubles as a working demo, not a
// canned video. Tapping anywhere skips it (handled in the component).
//
// Phases are time-anchored in ms from reel start. Each phase has:
//   at      — when it fires (ms from start)
//   kind    — what the orchestrator should do (interpreted in the component)
//   style   — optional artist style key to switch to
//   textKey — optional overlay copy key (looked up per-language)
// The orchestrator walks the list, scheduling each action with setTimeout.
// ─────────────────────────────────────────────────────────────────────────────

// Artist styles paraded in the "sixteen artists" beat, in a visually punchy
// order (loud/gestural → geometric → ornamental → op/pop) so the swap reel
// reads as variety at a glance.
const DEMO_REEL_STYLE_PARADE = [
  'pollock','bloom','picasso','mondrian','kandinsky',
  'rothko','gold','bulge','wave','spiral','arcs','pop','comic',
];

// The mood phrase the "AI" beat types out, then plays (offline moodToSong, so
// it's instant + reliable — no network in the reel).
const DEMO_REEL_MOOD = 'dreamy';

// Overlay copy, per language. Kept short — these flash on screen like trailer
// title cards. Key order mirrors the phase timeline below.
const DEMO_REEL_I18N = {
  EN: {
    becomes:   'Music becomes painting',
    artists:   'Sixteen artists. One song.',
    aiType:    'Type a feeling…',
    aiResult:  '…and it paints itself',
    variations:'Endless variations',
    print:     'Print it. Frame it. Keep it.',
    outro:     'Paintiano',
  },
  SK: {
    becomes:   'Hudba sa mení na maľbu',
    artists:   'Šestnásť umelcov. Jedna pieseň.',
    aiType:    'Napíš pocit…',
    aiResult:  '…a namaľuje sa sám',
    variations:'Nekonečné variácie',
    print:     'Vytlač. Zarámuj. Nechaj si.',
    outro:     'Paintiano',
  },
  DE: {
    becomes:   'Musik wird zu Malerei',
    artists:   'Sechzehn Künstler. Ein Lied.',
    aiType:    'Tippe ein Gefühl…',
    aiResult:  '…und es malt sich selbst',
    variations:'Endlose Variationen',
    print:     'Drucken. Rahmen. Behalten.',
    outro:     'Paintiano',
  },
  FR: {
    becomes:   'La musique devient peinture',
    artists:   'Seize artistes. Une chanson.',
    aiType:    'Écris une émotion…',
    aiResult:  '…et ça se peint tout seul',
    variations:'Variations infinies',
    print:     'Imprime. Encadre. Garde.',
    outro:     'Paintiano',
  },
  ES: {
    becomes:   'La música se vuelve pintura',
    artists:   'Dieciséis artistas. Una canción.',
    aiType:    'Escribe un sentimiento…',
    aiResult:  '…y se pinta solo',
    variations:'Variaciones infinitas',
    print:     'Imprime. Enmarca. Consérvalo.',
    outro:     'Paintiano',
  },
};

// Resolve overlay copy for a language with EN fallback.
function demoReelText(lang, key){
  const tbl = DEMO_REEL_I18N[lang] || DEMO_REEL_I18N.EN;
  return tbl[key] || DEMO_REEL_I18N.EN[key] || '';
}

// The phase timeline. Times are ms from reel start. The orchestrator in the
// component reads `kind` and acts:
//   'play-song'   — load the demo song (Für Elise) + start playback, paint live
//   'show-text'   — flash overlay copy (textKey)
//   'set-style'   — switch artist style (style)
//   'style-parade'— cycle DEMO_REEL_STYLE_PARADE on a sub-interval
//   'ai-type'     — animate the mood phrase typing into the box
//   'ai-play'     — load the offline mood song + paint
//   'vary'        — trigger advanceVariation a few times
//   'print-beat'  — show the framed/print take-out flourish
//   'outro'       — final logo card
//   'end'         — tear down, restore UI
//
// Total ~46s. Tunable here without touching the orchestrator.
const DEMO_REEL_PHASES = [
  { at: 0,     kind: 'play-song' },
  { at: 400,   kind: 'show-text', textKey: 'becomes' },
  { at: 12000, kind: 'show-text', textKey: 'artists' },
  { at: 12300, kind: 'style-parade' },        // cycles styles ~every 1.8s
  { at: 35000, kind: 'ai-type',   textKey: 'aiType' },
  { at: 39000, kind: 'ai-play',   textKey: 'aiResult' },
  { at: 52000, kind: 'show-text', textKey: 'variations' },
  { at: 52300, kind: 'vary' },
  { at: 64000, kind: 'print-beat',textKey: 'print' },
  { at: 71000, kind: 'outro',     textKey: 'outro' },
  { at: 75000, kind: 'end' },
];

// Sub-interval (ms) for the style parade beat.
const DEMO_REEL_PARADE_STEP = 1800;
// How many Vary triggers during the variations beat, and their spacing.
const DEMO_REEL_VARY_COUNT = 5;
const DEMO_REEL_VARY_STEP = 2100;
