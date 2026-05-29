// ─────────────────────────────────────────────────────────────────────────────
// §6b  DEMO REEL  — a ~58s self-playing cinematic trailer.
//
// Pure data + helpers (no React). The orchestration (timer chain that drives
// React state) lives in the main component because it needs the live setters.
// Here we only declare WHAT happens and WHEN, plus the 8-language overlay copy,
// so the sequence is easy to tweak in one place.
//
// Reuses the real engine end-to-end (paints, swaps styles, runs Vary, MFI,
// frame/print beat) — a working demo, not a canned video. Tap to skip (handled
// in the component).
//
// Phases are time-anchored in ms from reel start. Each phase has:
//   at      — when it fires (ms from start)
//   kind    — what the orchestrator should do
//   style   — optional artist style key to switch to
//   textKey — optional overlay copy key (looked up per-language)
// ─────────────────────────────────────────────────────────────────────────────

// Best-mix 7 styles for the parade beat — chosen for MAXIMUM visual contrast
// between consecutive beats so the reel reads as "many different art worlds":
//   pollock (chaos/drip) → mondrian (geometric grid, total contrast)
//   → rothko (color-field calm, meditative pause)
//   → gold (luxe metallic, retina grab)
//   → kandinsky (Bauhaus circles+geom, detail-rich)
//   → wave (op-art fluid motion)
//   → pop (Lichtenstein dots+blocks, crescendo)
// No Mosaic here — it's the default everywhere else; the parade should feel
// fresh, like a curated gallery flash, not a repeat of the start state.
const DEMO_REEL_STYLE_PARADE = [
  'pollock','mondrian','rothko','gold','kandinsky','wave','pop',
];

// The mood phrase the "AI" beat types out, then plays (offline moodToSong, so
// it's instant + reliable — no network in the reel).
const DEMO_REEL_MOOD = 'longing';

// Overlay copy, per language. Trailer-style title cards — short, punchy. Key
// order mirrors the phase timeline below.
const DEMO_REEL_I18N = {
  EN: {
    becomes:    'Music becomes painting',
    artists:    'Many artists. One song.',
    aiType:     'Type a feeling…',
    aiResult:   '…and it paints itself',
    image:      'Or paint from a picture',
    variations: 'Endless variations',
    print:      'Take it home',
    outro:      'Paintiano',
  },
  SK: {
    becomes:    'Hudba sa mení na maľbu',
    artists:    'Mnoho umelcov. Jedna pieseň.',
    aiType:     'Napíš pocit…',
    aiResult:  '…a namaľuje sa sám',
    image:      'Alebo maľuj z obrázka',
    variations: 'Nekonečné variácie',
    print:      'Vezmi si ho domov',
    outro:      'Paintiano',
  },
  DE: {
    becomes:    'Musik wird zu Malerei',
    artists:    'Viele Künstler. Ein Lied.',
    aiType:     'Tippe ein Gefühl…',
    aiResult:   '…und es malt sich selbst',
    image:      'Oder male aus einem Bild',
    variations: 'Endlose Variationen',
    print:      'Nimm es mit nach Hause',
    outro:      'Paintiano',
  },
  FR: {
    becomes:    'La musique devient peinture',
    artists:    'Beaucoup d\'artistes. Une chanson.',
    aiType:     'Écris une émotion…',
    aiResult:   '…et ça se peint tout seul',
    image:      'Ou peins depuis une image',
    variations: 'Variations infinies',
    print:      'Emporte-le chez toi',
    outro:      'Paintiano',
  },
  ES: {
    becomes:    'La música se vuelve pintura',
    artists:    'Muchos artistas. Una canción.',
    aiType:     'Escribe un sentimiento…',
    aiResult:   '…y se pinta solo',
    image:      'O pinta desde una imagen',
    variations: 'Variaciones infinitas',
    print:      'Llévalo a casa',
    outro:      'Paintiano',
  },
  PT: {
    becomes:    'A música torna-se pintura',
    artists:    'Muitos artistas. Uma canção.',
    aiType:     'Escreve um sentimento…',
    aiResult:   '…e pinta-se sozinho',
    image:      'Ou pinta a partir de uma imagem',
    variations: 'Variações infinitas',
    print:      'Leva-o para casa',
    outro:      'Paintiano',
  },
  zh: {
    becomes:    '音乐化作画作',
    artists:    '众多艺术家。一首乐曲。',
    aiType:     '输入一种感觉…',
    aiResult:   '…它自己作画',
    image:      '或从图像作画',
    variations: '无尽变奏',
    print:      '带回家收藏',
    outro:      'Paintiano',
  },
  zhTW: {
    becomes:    '音樂化作畫作',
    artists:    '眾多藝術家。一首樂曲。',
    aiType:     '輸入一種感覺…',
    aiResult:   '…它自己作畫',
    image:      '或從圖像作畫',
    variations: '無盡變奏',
    print:      '帶回家收藏',
    outro:      'Paintiano',
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
//   'mfi'         — load built-in sample image + AI mood → paint
//   'vary'        — trigger advanceVariation a few times
//   'print-beat'  — show the framed/print take-out flourish
//   'outro'       — final logo card
//   'end'         — tear down, restore UI
//
// Total ~58s. Tunable here without touching the orchestrator.
//
// Timeline rationale (cinematic, not tutorial):
//   0-5s   Music begins, canvas paints (single style, no parade yet)
//          → "Music becomes painting" reads short, leaves screen by 5s
//   5-13s  7-style parade (1.1s each) → "Many artists. One song."
//   13-21s AI compose: type mood + auto-play offline song
//   21-29s MFI: built-in sample image → mood → paint
//   29-39s Variations beat (Vary 4x) with fresh styles
//   39-46s Print/frame flourish
//   46-52s Outro logo
//   52s    End
const DEMO_REEL_PHASES = [
  { at: 0,     kind: 'play-song' },
  { at: 300,   kind: 'show-text',    textKey: 'becomes' },
  { at: 5000,  kind: 'show-text',    textKey: 'artists' },
  { at: 5200,  kind: 'style-parade' },                              // cycles 7 styles ~1.1s each
  { at: 13000, kind: 'ai-type',      textKey: 'aiType' },
  { at: 17000, kind: 'ai-play',      textKey: 'aiResult' },
  { at: 21000, kind: 'mfi',          textKey: 'image' },
  { at: 29000, kind: 'show-text',    textKey: 'variations' },
  { at: 29200, kind: 'vary' },
  { at: 39000, kind: 'print-beat',   textKey: 'print' },
  { at: 46000, kind: 'outro',        textKey: 'outro' },
  { at: 52000, kind: 'end' },
];

// Sub-interval (ms) for the style parade beat. 7 styles × 1100ms = 7.7s, fits
// snugly inside the 5.2s → 13s window (slight overshoot OK; the parade clears
// when the next phase starts).
const DEMO_REEL_PARADE_STEP = 1100;
// How many Vary triggers during the variations beat, and their spacing.
const DEMO_REEL_VARY_COUNT = 4;
const DEMO_REEL_VARY_STEP = 2200;
// MFI sub-timing: when (from start of mfi beat) to auto-press Play so the
// sample image transitions into a painting. composeFromImage is async; for
// the built-in sample it's a cache hit so well under 1s, but we wait a bit
// for visual "thinking" presence + state to settle before triggering Play.
const DEMO_REEL_MFI_PLAY_DELAY = 1800;
