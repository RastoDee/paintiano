# Paintiano — handover pre novú session

**Pošli toto + 7 súborov (01–07) + manifest.txt v PRVEJ správe novej session.**

---

## Kto / čo

- **Rasto** = Mgr. Rastislav Ďurica, CEO digitWin s.r.o.
- **Paintiano** (paintiano.app) — PWA, hudba → maľby. Artist meno **Raf Fel**.
- Komunikácia **slovensky**, terse, mobile-friendly.

## Tiery
- **Free** — 8 artists unlocked, ladder cap = 2 variants per artist, Custom palette read-only preview (Scriabin default), watermark na exporte
- **Pro €9.99** — všetkých 16 artists, full variant ladder, Custom palette editable, no watermark
- **Pro AI €19.99** — Pro + AI Compose, mood-from-image, mood AI

## Build / štruktúra

Modulárny build, 7 fragmentov v `src/paintiano/`:
- `01-core-head.jsx` — imports, color tables, helpers (KONTRA_HUE, CUSTOM_DEFAULT_HUE = Scriabin, CUSTOM_DEFAULT_SAT)
- `02-draw.jsx` — všetky artist styles + drawBlock dispatchers + drawOneMOverlay
- `03-i18n.jsx` — i18n 8 jazykov (EN/DE/FR/ES/SK/zh/zhTW/PT)
- `04-songs.jsx` — Concept/Demo/Guide text (8 langs)
- `05-main.jsx` — React komponent, state, UI, dispatch
- `06-demo-reel.jsx` — demo trailer orchestration
- `07-pro.jsx` — Pro tier (Paddle checkout, license validation, AI trial)

Stitched cez `node build-paintiano.js` → `src/paintiano.jsx`. Deploy: dev → main merge na Windows v `cmd` (nie PowerShell).

## Standing rules

1. **Vždy attach všetkých 7 súborov + manifest.txt** v prvej správe novej session — bez tohto pracuje Claude so starou kópiou a robí regresie.
2. **Ask y/n pred bumpom footer verzie.** Nikdy auto-increment. Footer aktuálne **v2.0**.
3. **Validate pred deliverom**: `@babel/parser` JSX check všetkých zmenených fragmentov.
4. **Delivery len menených fragmentov** do `/mnt/user-data/outputs/`. Nie celé moduly v reply.
5. **UI alebo behavior change** → automaticky update **Concept** + **Guide** text vo všetkých 8 jazykoch (04-songs).
6. **`ask_user_input_v0` picker** + prose vysvetlenie pri clarifying questions.
7. **"robíš?"** = execute hneď. **"vráť"** = presný revert toho čo sa zmenilo, nič viac.
8. **Po každom delivery**: Rasto stiahne fragmenty + manifest, deploy-ne, otestuje. Po deploy môže overiť grep-counts proti manifestu — instantná detekcia regresie.
9. **Pri PALETTE_VERSION bumpe**: každý user dostane fresh default seed → uložené Custom palety sa prepíšu. Akceptovaná stratégia (rollout policy z v4→v5 → v6).

## Aktuálny stav features (vyžaduje manifest.txt verifikáciu)

### Color modes — **5 chipov** (non-image / color image) | 2 (BW image)
- **Harmony** (COF) — circle-of-fifths order
- **Spectral** — even 30° steps, chromatic
- **φ Phi** — golden-angle hues (137.5°)
- **Kontra** — inverse-Harmony (consonant FAR, dissonant CLOSE) — pohľad maliara
- **Custom** — default = **Skriabinova Prometheus mapa** (1910), per-tón saturation (D♯/A♯ at 25 % = „kovové")
- **B/W** — image mode only (replaces algorithmic modes for grayscale images)

Auto-switch bw → harmony pri leaving image mode. cycleColorFs (FS palette button):
- Non-image cycle: harmony → spectral → phi → kontra → custom
- Image cycle: harmony → spectral → bw → custom (phi/kontra not in FS cycle — pickers only)

### Custom palette
- `PALETTE_VERSION='6'` — force-seed Scriabin (CUSTOM_DEFAULT_HUE + CUSTOM_DEFAULT_SAT)
- Force-overwrite na všetkých tieroch (Free dostane Scriabin ako read-only preview, Pro+ editable)
- Reset button v editori → Skriabinov default (s per-tón saturáciou)
- KONTRA_HUE žije samostatne ako tabuľka pre kontra chip — nezávislé od Custom palety

### Artist styles — 16 v 8 pároch
Picasso↔Matisse, Pollock↔Sam Francis, Kusama↔Miró, Mondrian↔Kandinsky, Klimt↔Rothko, Vasarely↔Riley, af Klint↔Stella, Haring↔Lichtenstein. Pair face position rotates per session (Pro+); Free vidí fixne 'a' stranu.

### Variants
- **Pollock 6** (Dense, Sparse, Black pourings, Totem, Hands, Blue Poles); Free cap=2 → Dense + Blue Poles
- **Mondrian 8** (Classic, Sparse, Boogie-Woogie, NYC, Broadway, Lozenge, Tree, Pier & Ocean); Free cap=2 → Classic + Sparse
- Most artists 6 phaseIndex variants; Free cap=2
- **Miró Free** — variant 1 = Blue triptych (NOT Bright sparse)
- **Miró palette** responds to active color mode (`_miroPal(isBW, gc)`) — funguje vo všetkých 5 colour modes
- **phaseIndex re-rand** len keď Dice je ON (žiadny flicker počas Mic capture)

### Mosaic chip — 3-stavový cyklus + Shuffle integration
- **Pri dice OFF**: tap chipu cyklí Mosaic (default φ-rectangles) → Notes (note labels overlay) → $oneM$ (MDH chaos: tiles 60% + 10 shape types 40%) → Mosaic.
- **Pri dice ON**: Mosaic/Notes/oneM sú v shuffle poole spolu s 16 artistmi (19 entries, Fisher-Yates seeded `pollockSessionSeed` → deterministic per song, M/N/oneM interleaved randomly).
- **Mosaic chip tap pri dice ON**:
  - neaktívny → zapne `mosaicShuffleLock` (zameria iba na Mosaic family, fixné poradie M→N→oneM→M cez Next)
  - aktívny (lock on) → vypne lock, vráti do full 19-pool shuffle
- **canAppend** zoznam obsahuje `style!=='oneM'` aby nevybacovalo Mosaic substrate pod oneM overlay.

### Fullscreen header
- Pre **umelca** alebo **oneM**: zobrazí "inspired by Picasso" / "inspired by One Million Dollar Page" (zlatý taliansky kurzív)
- Pre **Mosaic**, **Notes**: zobrazí len plain "Mosaic" / "Notes" bez "inspired by" prefixu
- Pre prázdny canvas: nezobrazí nič

### Mic / Music
- Raw audio recording via `MediaRecorder` (paralelne s analyser)
- iOS-aware: `noiseSuppression:!isiOS`, HP 80Hz, DynamicsCompressor
- **🎵 ORIG ⇄ 🎹 PIANO** source toggle (po recording done)
- **↺ Restart** button vedľa toggle
- **`wakeAudio()`** iOS suspend→resume fix (in-gesture na Play/Resume tap)
- Save export source-aware (Original = `listenBlobRef.current.blob` direct, Piano = synth render)

### UI gates
- **Save**: `chords.length>0 && disp>0 && !playing && !anim && !holdPaused && !demoReelOn && !micActive && !busy && !recording`
- **Next** (strip + FS): `(disp>0||playing||holdPaused) && !anim && !working && !demoReelOn && !recording && !micActive`; gate včíta aj shuffleStyle (`effectiveStyle||shuffleStyle`) aby Next ostal viditeľný keď shuffle pristane na Mosaic family stop
- **REC pill** odstránený (Clear je single way to start new song po Stop Live)

### Fullscreen extras
- Modrý **palette cycle button** (`cycleColorFs`) vedľa Next/Story/Save
- Visible: `chords.length>0 && (disp>0 || playing || holdPaused)`

## Iné kontext

### Bizzdesign MPA negotiation (paralelný projekt, nie technický)
- digitWin = Bizzdesign authorized partner CEE, ~€600K annual revenue
- 3-track stratégia: A=re-acquisition €1.2-2M, B=MPA s 50/35/20% protection, C=Ardoq backstop
- Key contacts: Marjolein Hoddenbagh, Peter Mattijsen, Harmen van den Berg
- HungaroControl RFP €51K submitted Máj 2026

### iOS app store
- Capacitor wrap (NIE React Native — Paintiano spolieha na browser API)
- Codemagic CI/CD cloud build (Rasto nemá Mac)

### Kniha o Paintiane (Kapitola II)
- Custom = Skriabinova Prometheus mapa odkazuje na narratívnu slučku knihy: „Skriabin by mal radosť — nie preto, že by mal pravdu, ale preto, že každý smie mať svoju vlastnú."
- Pekná veta do knihy: **Harmónia je Skriabin zobjektívnený; Custom je Skriabin pôvodný.**

## Komunikačné pravidlá Claude

- Slovensky, terse, mobile-friendly
- Nikdy auto-bump footer verziu
- Pred každým buildom y/n o footer bump
- Validate pred delivery, validate **počas** delivery (po každej edit)
- Pri pochybnostiach **`ask_user_input_v0`** picker, neimprovizovať
- Deliver len menené fragmenty
- Nepoužívať mockup ako justification — vždy preferovať real implementation
- Pri rozsiahlej zmene: **manifest** generovaný ako súčasť delivery + HANDOVER aktualizovaný

## Workflow pri error report

**Default (úsporný — väčšina prípadov):**

1. Rasto pošle **len text + screenshot** chyby
2. Claude analyzuje, identifikuje 1–3 súbory ktoré potrebuje — **vypýta si len tie**
3. Rasto pošle menované súbory
4. Claude audit + fix + deliver zmenené fragmenty + updated manifest

**Výnimka — pošli všetkých 7 hneď + manifest + HANDOVER:**
- Veľká nová feature
- Po pauze >týždeň
- Keď nevieš ktorý súbor obsahuje bug ("celkovo rozbité")
- Začiatok novej chat session

**Pri error reporte vždy pripoj:**
1. Screenshot/video
2. 1–3 vety: čo robil / čo čakal / čo sa stalo

## Pending / open

- **04-songs.jsx Guide text "modes" card** — možno tiež update na include 5 modes (Concept už update-nutý).
- **Footer bump** — Claude pýta y/n pred bumpom. Po Scriabinovej zmene by mohol byť v2.1 alebo v3.0 ak chceš signal pre release notes (PALETTE_VERSION='6' rollout user-visible).

---

**OK ready. Začni novú session s týmto handover-om + manifest.txt + 7 súbormi.**
