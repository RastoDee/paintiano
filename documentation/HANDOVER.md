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

1. **Vždy attach všetkých 7 súborov + manifest.txt** v prvej správe novej session.
2. **Ask y/n pred bumpom footer verzie.** Nikdy auto-increment. Footer aktuálne **v2.0**.
3. **Validate pred deliverom**: `@babel/parser` JSX check všetkých zmenených fragmentov.
4. **Delivery len menených fragmentov** do `/mnt/user-data/outputs/`.
5. **UI alebo behavior change** → automaticky update **Concept** + **Guide** text vo všetkých 8 jazykoch (04-songs).
6. **`ask_user_input_v0` picker** + prose vysvetlenie pri clarifying questions.
7. **"robíš?"** = execute hneď. **"vráť"** = presný revert toho čo sa zmenilo, nič viac.
8. **Po každom delivery**: Rasto stiahne fragmenty + manifest, deploy, otestuje.
9. **Pri PALETTE_VERSION bumpe**: každý user dostane fresh default seed → uložené Custom palety sa prepíšu.

## Aktuálny stav features

### Top menu (nav)
- **Concept · Guide · Setup · Pro** (Free vidí PRO ako gold tab, Plain Pro vidí PRO AI ako purple, Pro AI nič)
- **Demo** je vykomentované (TEMPORARILY HIDDEN marker v zdroji, JSX comment) — môže sa obnoviť one-paste

### Setup picker (top menu, modal)
- 2 sekcie: Palettes (5 checkboxes), Artists (17: 1 Mosaic family + 16 individual)
- Min 1 paleta + 1 umelec — modal sa pod túto hranicu nezavrie
- Default = všetko vybrané (current behavior)
- Free tier vidí Pro artistov so 🔒 — zakliknutie uloží preferenciu, samotný klik v canvas stále paywall
- Persistencia v localStorage: `paintiano_setup_palettes`, `paintiano_setup_artists`
- Filter propagácia:
  - Palette tabs (image + non-image) → auto-fit grid podľa selected count
  - cycleColorFs (FS palette button) → cycle iba cez selected
  - Artist pair tiles → pair hidden ak ani jedna strana selected; ak len 1 strana, pair = single-toggle (no A↔B flip)
  - Mosaic chip → hidden ak `mosaicFamily` nie je selected
  - SHUFFLE_POOL → filtered to selected; MOSAIC_FAMILY conditional

### Color modes — **5 chipov** | 2 (BW image)
- Harmony (COF), Spectral, φ Phi, **Kontra** (inverse-Harmony, pohľad maliara), Custom (default = Skriabinova Prometheus mapa s per-tón saturáciou)
- B/W len v image mode
- Auto-switch bw → harmony pri leaving image mode

### Custom palette
- `PALETTE_VERSION='6'` — Skriabin force-seed
- Pre Free read-only preview, Pro+ editable
- Reset button → Skriabinov default
- KONTRA_HUE samostatne ako tabuľka pre Kontra chip

### Artist styles — 16 v 8 pároch
Picasso↔Matisse, Pollock↔Sam Francis, Kusama↔Miró, Mondrian↔Kandinsky, Klimt↔Rothko, Vasarely↔Riley, af Klint↔Stella, Haring↔Lichtenstein.

### Mosaic chip — 3-stavový cyklus + Shuffle integration
- Dice OFF: Mosaic → Notes → $oneM$ → Mosaic
- Dice ON: full pool 19 entries (16 artists + 3 Mosaic family) Fisher-Yates seeded, alebo lock mode (M→N→oneM)

### Fullscreen header
- Artist alebo oneM: "inspired by Picasso" / "inspired by One Million Dollar Page"
- Mosaic, Notes: plain label, žiadne "inspired by"

### Mic / Music
- Raw audio + analyser parallel
- iOS-aware noise suppression
- ORIG ⇄ PIANO source toggle + Restart
- `wakeAudio()` iOS suspend→resume fix

### UI gates
- Next gate respektuje shuffleStyle aby ostal viditeľný keď shuffle pristane na Mosaic family stop
- Save gate: chords.length, !playing, !anim, !holdPaused, !demoReelOn, !micActive, !busy, !recording

## Komunikačné pravidlá Claude

- Slovensky, terse, mobile-friendly
- Nikdy auto-bump footer verziu
- Pred každým buildom y/n o footer bump
- Validate pred delivery
- Pri pochybnostiach `ask_user_input_v0` picker
- Deliver len menené fragmenty + manifest + (ak nutné) HANDOVER

## Workflow pri error report

**Default (úsporný):**
1. Rasto pošle text + screenshot
2. Claude analyzuje, vypýta si 1–3 súbory
3. Rasto pošle menované súbory
4. Claude audit + fix + deliver

**Výnimka — pošli všetkých 7 hneď + manifest + HANDOVER:**
- Veľká nová feature
- Po pauze >týždeň
- "Celkovo rozbité"
- Nová chat session

## Pending / open

- **Footer bump** — Claude pýta y/n pred bumpom. Veľa featúr nazbieraných (Kontra, Skriabin, Setup picker, Demo hidden) — vhodný moment pre v2.1 alebo v3.0 ak chceš release-notes signál.
- **Guide text** môže potrebovať update — Concept už pokrytý, ale Guide ešte explicit Setup návod nemá.
- **Demo restore** — keď bude treba, jeden paste z TEMPORARILY HIDDEN bloku v 05-main.jsx (nav row, riadky ~6902–6920).

---

**OK ready. Začni novú session s týmto handover-om + manifest.txt + 7 súbormi.**
