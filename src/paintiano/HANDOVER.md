# Paintiano — handover pre novú session

**Pôšli toto + 5 súborov + manifest.txt v PRVEJ správe novej session.**

---

## Kto / čo

- **Rasto** = Mgr. Rastislav Ďurica, CEO digitWin s.r.o.
- **Paintiano** (paintiano.app) — PWA, hudba → maľby. Artist meno **Raf Fel**.
- Komunikácia **slovensky**, terse, mobile-friendly.

## Tiery
- **Free** — 8 artists unlocked, ladder cap = 2 variants per artist
- **Pro €9.99** — všetkých 16 artists, full variant ladder, custom palette editable
- **Pro AI €19.99** — Pro + AI Compose, mood-from-image, mood AI

## Build / štruktúra

Modulárny build, 5 fragmentov v `src/paintiano/`:
- `01-core-head.jsx` — imports, color tables, helpers
- `02-draw.jsx` — všetky artist styles + drawBlock dispatchers
- `03-i18n.jsx` — i18n 8 jazykov (EN/DE/FR/ES/SK/zh/zhTW/PT)
- `04-songs.jsx` — Concept/Demo/Guide text
- `05-main.jsx` — React komponent, state, UI, dispatch

Stitched cez `node build-paintiano.js` → `src/paintiano.jsx`. Deploy: dev → main merge na Windows v `cmd` (nie PowerShell).

## Standing rules

1. **Vždy attach všetkých 5 súborov + manifest.txt** v prvej správe novej session — bez tohto pracuje Claude so starou kópiou a robí regresie.
2. **Ask y/n pred bumpom footer verzie.** Nikdy auto-increment. Footer aktuálne **v2.0**.
3. **Validate pred deliverom**: `@babel/parser` JSX check.
4. **Delivery len menených fragmentov** do `/mnt/user-data/outputs/`. Nie celé moduly v reply.
5. **UI alebo behavior change** → automaticky update **Concept** + **Guide** text vo všetkých 8 jazykoch (04-songs).
6. **`ask_user_input_v0` picker** + prose vysvetlenie pri clarifying questions.
7. **"robíš?"** = execute hneď. **"vráť"** = presný revert toho čo sa zmenilo, nič viac.
8. **Po každom delivery**: Rasto stiahne 5 súborov + manifest, deploy-ne, otestuje. Po deploy môže overiť grep-counts proti manifestu — instantná detekcia regresie.

## Aktuálny stav features (vyžaduje manifest.txt verifikáciu)

### Color modes
- **Harmony** (COF), **Spectral** (chromatic), **φ Phi** (golden angle), **Custom** (inverse-Harmony default, editable v Pro)
- **B/W** len v Image mode (BW image detected)
- Non-image picker = 4 tabs s phi
- Image picker conditional: Color image → 4 tabs s phi, BW image → 2 tabs (B/W + Custom) equal width
- Auto-switch bw → harmony pri leaving image mode

### Custom palette
- `PALETTE_VERSION='5'` force-seed s **CUSTOM_DEFAULT_HUE** (inverse-Harmony: consonant intervals far, dissonant close)
- Default button v editori používa tú istú tabuľku
- Force-overwrite na všetkých tieroch (Free dostane default ako preview, Pro+ editable)

### Artist styles — variants
- **Pollock Free** — variant 1 = Blue Poles (visually distinct)
- **Miró Free** — variant 1 = Blue triptych (NOT Bright sparse)
- **Miró palette** responds to active color mode (`_miroPal(isBW, gc)`) — Harmony/Spectral/φ/Custom všetky vidno
- **phaseIndex re-rand** len keď Dice je ON (žiadny flicker počas Mic capture)

### Mosaic chip — 3-tap cyklus
- **Mosaic** (default φ-rectangles) → **Notes** (note labels) → **$oneM$** (MDH chaos: tiles 60% + chaos shapes 40%, 10 tvarov: circle/arc/triangle/star/squiggle/rings/halfmoon/diamond/cross/rect) → **Mosaic**

### Mic / Music
- Raw audio recording via `MediaRecorder` (paralelne s analyser)
- iOS-aware: `noiseSuppression:!isiOS`, HP 80Hz, DynamicsCompressor
- **🎵 ORIG ⇄ 🎹 PIANO** source toggle (po recording done)
- **↺ Restart** button vedľa toggle
- **`wakeAudio()`** iOS suspend→resume fix (in-gesture na Play/Resume tap)
- Save export source-aware (Original = `listenBlobRef.current.blob` direct, Piano = synth render)

### UI gates
- **Save**: `chords.length>0 && disp>0 && !playing && !anim && !holdPaused && !demoReelOn && !micActive && !busy && !recording`
- **Next** (strip + FS): `(disp>0||playing||holdPaused) && !anim && !working && !demoReelOn && !recording && !micActive`
- **REC pill** odstránený (Clear je single way to start new song po Stop Live)

### Fullscreen
- Modrý **palette cycle button** (`cycleColorFs`) vedľa Next/Story/Save
- Visible: `chords.length>0 && (disp>0 || playing || holdPaused)`
- Cycle podľa view mode (image cycle includes bw, non-image includes phi)

## Iné kontext

### Bizzdesign MPA negotiation (paralelný projekt, nie technický)
- digitWin = Bizzdesign authorized partner CEE, ~€600K annual revenue
- 3-track stratégia: A=re-acquisition €1.2-2M, B=MPA s 50/35/20% protection, C=Ardoq backstop
- Key contacts: Marjolein Hoddenbagh, Peter Mattijsen, Harmen van den Berg
- HungaroControl RFP €51K submitted Máj 2026

### iOS app store
- Capacitor wrap (NIE React Native — Paintiano spolieha na browser API)
- Codemagic CI/CD cloud build (Rasto nemá Mac)

## Komunikačné pravidlá Claude

- Slovensky, terse, mobile-friendly
- Nikdy auto-bump footer verziu
- Pred každým buildom y/n o footer bump
- Validate pred delivery, validate **počas** delivery (po každej edit)
- Pri pochybnostiach **`ask_user_input_v0`** picker, neimprovizovať
- Deliver len menené fragmenty
- Nepoužívať mockup ako justification — vždy preferovať real implementation
- Pri rozsiahlej zmene: **manifest** generovaný ako súčasť delivery

## Workflow pri error report

**Default (úsporný — väčšina prípadov):**

1. Rasto pošle **len text + screenshot** chyby
2. Claude analyzuje, identifikuje 1–3 súbory ktoré potrebuje — **vypýta si len tie**
3. Rasto pošle menované súbory
4. Claude audit + fix + deliver zmenené fragmenty + updated manifest

**Výnimka — pošli všetkých 5 hneď + manifest:**
- Veľká nová feature
- Po pauze >týždeň
- Keď nevieš ktorý súbor obsahuje bug ("celkovo rozbité")
- Začiatok novej chat session

**Pri error reporte vždy pripoj:**
1. Screenshot/video
2. 1–3 vety: čo robil / čo čakal / čo sa stalo

Claude potom:
1. Lokalizuje bug v code-base z popisu (bez čítania source-u)
2. Vypýta si konkrétne súbory
3. Audit aktuálneho stavu proti manifestu — nájde missing features
4. Cielený fix, validate, deliver s updated manifest

## Pending / open

- **04-songs.jsx Concept text** — refresh Custom palette popis na "inverse-Harmony" tone (8 jazykov). Nikdy nebol completed v poslednom batch-u.
- **Guide text "modes" card** — možno tiež update na include φ Phi (Concept už update-nutý).

---

**OK ready. Začni novú session s týmto handover-om + manifest.txt + 5 súbormi.**
