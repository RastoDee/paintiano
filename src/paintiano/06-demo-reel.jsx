// ─────────────────────────────────────────────────────────────────────────────
// §6b  DEMO REEL  — a ~60s self-playing cinematic trailer.
//
// Pure data + helpers (no React). The orchestration (timer chain that drives
// React state) lives in the main component because it needs the live setters.
// Here we only declare WHAT happens and WHEN, plus the 8-language overlay copy.
//
// Reuses the real engine end-to-end (paints, swaps styles, runs Vary, MFI,
// frame/print beat) — a working demo, not a canned video. Tap to skip (handled
// in the component via a fullscreen overlay).
//
// VISUAL RULES (from the pre-code spec):
//   1. Fullscreen overlay covers the WHOLE viewport (not just canvas).
//      All user interactions blocked beneath. Tap anywhere = skip.
//   2. Title text is centred in the viewport, not in the canvas box.
//      Large cinematic typography, gold-gradient, drop shadow. No frames.
//   3. NO Mosaic fallback. Every beat sets an explicit style. The
//      orchestrator re-asserts style after any load that resets it.
//   4. Cinematic flow — fade between cards, no hard cuts.
//   5. Short punchy text (≤4 words per card, ~3-4s on screen).
//   6. Stable canvas size — no resizes during the reel.
//   7. Subtle "Tap to skip" in the corner.
//
// Phases are time-anchored in ms from reel start. Each phase has:
//   at      — when it fires (ms from start)
//   kind    — what the orchestrator should do
//   style   — optional artist style key to switch to
//   textKey — optional overlay copy key (looked up per-language)
// ─────────────────────────────────────────────────────────────────────────────

// Best-mix 7 styles for the parade beat — chosen for MAXIMUM visual contrast
// between consecutive beats so the reel reads as "many different art worlds".
// No Mosaic here — it's the engine's implicit default and would feel like a
// repeat of states between beats. The parade is a curated gallery flash.
const DEMO_REEL_STYLE_PARADE = [
  'pollock',    // chaos / drip — gestural, kinetic
  'mondrian',   // geometric grid — total contrast to Pollock
  'rothko',     // color-field — meditative pause
  'gold',       // luxe metallic — retina grab
  'kandinsky',  // Bauhaus circles+geom — detail-rich
  'wave',       // op-art fluid motion
  'pop',        // Lichtenstein dots+blocks — crescendo
];

// The mood phrase the "AI" beat types out, then plays (offline moodToSong,
// instant + reliable — no network in the reel).
const DEMO_REEL_MOOD = 'longing';

// Overlay copy, per language. Trailer-style title cards — ≤4 words, punchy.
// Key order mirrors the phase timeline below.
//
// MFI uses TWO cards back-to-back: `image` reads while the picture is on
// screen alone (5s), then `imageBecomes` swaps in when the painting takes
// over — so the viewer literally reads the transformation.
const DEMO_REEL_I18N = {
  EN: {
    becomes:      'Music. Painting.',
    artists:      'Many artists.',
    aiType:       'Type a feeling.',
    aiResult:     'It paints itself.',
    image:        'From a picture.',
    imageBecomes: 'Becomes painting.',
    variations:   'Endless variations.',
    print:        'Take it home.',
    outro:        'Paintiano',
  },
  SK: {
    becomes:      'Hudba. Maľba.',
    artists:      'Mnoho umelcov.',
    aiType:       'Napíš pocit.',
    aiResult:     'Maľuje sa sám.',
    image:        'Z obrázka.',
    imageBecomes: 'Stáva sa maľbou.',
    variations:   'Nekonečné variácie.',
    print:        'Vezmi si ho.',
    outro:        'Paintiano',
  },
  DE: {
    becomes:      'Musik. Malerei.',
    artists:      'Viele Künstler.',
    aiType:       'Tippe ein Gefühl.',
    aiResult:     'Es malt sich selbst.',
    image:        'Aus einem Bild.',
    imageBecomes: 'Wird zu Malerei.',
    variations:   'Endlose Variationen.',
    print:        'Nimm es mit.',
    outro:        'Paintiano',
  },
  FR: {
    becomes:      'Musique. Peinture.',
    artists:      'Beaucoup d\'artistes.',
    aiType:       'Écris une émotion.',
    aiResult:     'Ça se peint seul.',
    image:        'D\'une image.',
    imageBecomes: 'Devient peinture.',
    variations:   'Variations infinies.',
    print:        'Emporte-le.',
    outro:        'Paintiano',
  },
  ES: {
    becomes:      'Música. Pintura.',
    artists:      'Muchos artistas.',
    aiType:       'Escribe un sentimiento.',
    aiResult:     'Se pinta solo.',
    image:        'De una imagen.',
    imageBecomes: 'Se vuelve pintura.',
    variations:   'Variaciones infinitas.',
    print:        'Llévatelo.',
    outro:        'Paintiano',
  },
  PT: {
    becomes:      'Música. Pintura.',
    artists:      'Muitos artistas.',
    aiType:       'Escreve um sentimento.',
    aiResult:     'Pinta-se sozinho.',
    image:        'De uma imagem.',
    imageBecomes: 'Torna-se pintura.',
    variations:   'Variações infinitas.',
    print:        'Leva-o contigo.',
    outro:        'Paintiano',
  },
  zh: {
    becomes:      '音乐。绘画。',
    artists:      '众多艺术家。',
    aiType:       '输入感觉。',
    aiResult:     '自己作画。',
    image:        '从图像。',
    imageBecomes: '化作画作。',
    variations:   '无尽变奏。',
    print:        '带回家。',
    outro:        'Paintiano',
  },
  zhTW: {
    becomes:      '音樂。繪畫。',
    artists:      '眾多藝術家。',
    aiType:       '輸入感覺。',
    aiResult:     '自己作畫。',
    image:        '從圖像。',
    imageBecomes: '化作畫作。',
    variations:   '無盡變奏。',
    print:        '帶回家。',
    outro:        'Paintiano',
  },
};

// Resolve overlay copy for a language with EN fallback.
function demoReelText(lang, key){
  const tbl = DEMO_REEL_I18N[lang] || DEMO_REEL_I18N.EN;
  return tbl[key] || DEMO_REEL_I18N.EN[key] || '';
}

// The phase timeline. Times are ms from reel start. The orchestrator reads
// `kind` and acts:
//   'play-song'   — load demo song (Für Elise) + start playback, paint live
//   'show-text'   — flash overlay copy (textKey)
//   'set-style'   — switch artist style (style)
//   'style-parade'— cycle DEMO_REEL_STYLE_PARADE on a sub-interval
//   'ai-type'     — animate the mood phrase typing
//   'ai-play'     — load the offline mood song + paint
//   'mfi'         — load built-in sample image, linger on the picture, then paint
//   'vary'        — trigger advanceVariation a few times
//   'print-beat'  — show the framed/print take-out flourish
//   'outro'       — final logo card
//   'end'         — tear down, restore UI
//
// Total ~64s. Tunable here without touching the orchestrator.
//
// Timeline rationale (cinematic, sustained beats, MFI now lingers on the
// picture so the viewer actually reads "this is an image", not "this is a
// painting with a thumbnail tacked on"):
//   0-5s    Music begins, canvas paints (bloom — lyrical intro)
//           → "Music. Painting." reads short, leaves screen by 5s
//   5-13s   7-style parade (1.1s each) → "Many artists."
//   13-17s  AI type "longing" + "Type a feeling."
//   17-23s  AI plays own composition (spiral) → "It paints itself."
//   23-28s  MFI stage 1: BIG PICTURE alone → "From a picture."
//   28-35s  MFI stage 2: picture transforms → painting → "Becomes painting."
//   35-45s  Variations beat (Vary 4×) → "Endless variations."
//   45-52s  Print/frame flourish (gold) → "Take it home."
//   52-58s  Outro logo
//   58s     End
const DEMO_REEL_PHASES = [
  { at: 0,     kind: 'play-song' },
  { at: 300,   kind: 'show-text',    textKey: 'becomes' },
  { at: 5000,  kind: 'show-text',    textKey: 'artists' },
  { at: 5200,  kind: 'style-parade' },
  { at: 13000, kind: 'ai-type',      textKey: 'aiType' },
  { at: 17000, kind: 'ai-play',      textKey: 'aiResult' },
  { at: 23000, kind: 'mfi',          textKey: 'image' },
  { at: 35000, kind: 'show-text',    textKey: 'variations' },
  { at: 35200, kind: 'vary' },
  { at: 45000, kind: 'set-style',    style: 'gold' },
  { at: 45100, kind: 'print-beat',   textKey: 'print' },
  { at: 52000, kind: 'outro',        textKey: 'outro' },
  { at: 58000, kind: 'end' },
];

// Sub-interval (ms) for the style parade beat. 7 styles × 1100ms = 7.7s, fits
// inside the 5.2s → 13s window. The orchestrator clears the parade when
// ai-type fires, so a slight overshoot is OK.
const DEMO_REEL_PARADE_STEP = 1100;
// How many Vary triggers during the variations beat, and their spacing.
// 4 × 2200ms = 8.8s, fits the 35.2s → 45s window.
const DEMO_REEL_VARY_COUNT = 4;
const DEMO_REEL_VARY_STEP = 2200;
// MFI stage 1 duration: how long the picture sits alone on screen before
// startPlay swaps to paint mode. 5 seconds gives the viewer a clear read
// of "this is the input image" before the transformation begins.
const DEMO_REEL_MFI_PLAY_DELAY = 5000;

