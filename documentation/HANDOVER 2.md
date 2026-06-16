# Paintiano — Handover na nový chat

**Dátum:** 15. jún 2026
**Session:** Riley Triangle / Hokusai Storm / Kusama / Email BCC deploy

---

## Identity & základné rules

- **Rasto** Mgr. Rastislav Ďurica — CEO digitWin, artist Raf Fel
- **Paintiano PWA** — paintiano.app, artist project pretvárajúci hudbu na obrazy
- **Komunikácia** terse Slovak, mobile-first
- **Footer** v2.0 (nezmenené pri poslednom deploy)

---

## Build & deploy workflow (kritické)

**Repo:** `C:\Users\RastoDurica\Desktop\paintiano-pwa\`

**Stack:** 7 modulárnych fragments `src/paintiano/` (01–07) → `node build-paintiano.js` → `src/paintiano.jsx` → `npm run build`

**Branches:**
- `dev` — testing
- `main` — production (Vercel auto-deploys paintiano.app)

**Validation pred delivery:** `@babel/parser` JSX parse + bracket balance check

**Delivery:** len zmenené fragmenty ako hyphenated `.jsx` do `/mnt/user-data/outputs/`, NIKDY echo celé moduly.

**Shorthand commands:**
- "robíš?" = execute immediately
- "vráť" = precise revert exactly what was changed
- "y/n" footer version bump pred build (nikdy auto-increment)

**Error workflow:** Rasto pošle error + screenshot → Claude identifikuje 1-3 súbory → Rasto pošle → Claude audituje proti manifest.txt → fix.

---

## Stav posledného deploy (15. jún 2026 večer)

Na main + paintiano.app live tieto patches:

| Patch | Súbor | Popis |
|---|---|---|
| Kusama Infinity Nets rewrite | `02-draw.jsx` | Interlocking crescent mesh (saturated chord ground + hex-offset grid) — replace pôvodné horizontal undulating rows |
| Kusama Iconic Infinity Dots | `02-draw.jsx` | Function `kusamaPhaseAccum` (názov zachovaný pre dispatcher) — saturated chord ground + 700 black/cream dots + 15 chord accent dots s black inner ring |
| Hokusai Bridge reeds | `02-draw.jsx` | 60→180 reeds, chord-driven height/thickness/bend, seedheads, full water edge |
| Hokusai Storm chord rain | `02-draw.jsx` | 120-300 chord-coloured diagonal rain streaks medzi cloud bands a lightning |
| Riley Triangle diagonal pattern | `02-draw.jsx` | `pos = col + row × altRowMul + (isUp ? 0 : upDownOffset)` · altRowMul 1-5 per song · upDownOffset 20-50% palette · clip + nRows fit canvas exactly · BW fallback na original sequential |
| Riley Movement | `02-draw.jsx` | Reverted na original B/W + 4% subtle chord tint per row (Option A bola tried a reverted) |
| Vasarely versatility | `02-draw.jsx` | 1→7 _seedRnd, všetkých 6 phases per-song variance |
| Spiral/af Klint Swan | `02-draw.jsx` | Abstract rewrite + versatility patch cez Ten/Altar/Botanical/Mandala |
| Email BCC | `api/paddle-webhook.js` | `EMAIL_BCC = (process.env.EMAIL_BCC \|\| 'drasto69@gmail.com')` + `bcc: EMAIL_BCC` v Resend API call |

**Footer ostáva v2.0, žiadny tag release.**

---

## 🔴 Aktívny bug na riešenie v novom chate

### AI music generation — nediferenciácia podľa mood

**Symptóm:** 3 rôzne foto (rodina pri stole / žena v záhrade / pláž) → mood detection generuje 3 rôzne mood labels v UI:
- "Warm Family Gathering Outdoors"
- "Lazy Summer Court Rest"
- "Sunny Seaside Joy"

= ✅ detection labels správne. Ale generovaná **hudba je takmer rovnaká** pre všetky 3 = ❌ AI ignoruje mood pri music generation.

**Pravdepodobná hypotéza:** mood label je v UI ale **neprepošle sa do AI music generation prompt** (frontend pošle len image, AI generuje generic music) — alebo response je cached / hardcoded mapping.

**Čo treba v novom chate:**

1. Rasto pošle ako **prvý attachment** súbor s AI music generation endpoint:
   - Pravdepodobne `api/ai-compose.js` alebo `api/compose-from-image.js` alebo `api/generate-music.js`
   - Hľadať cez: `findstr /s /n /i "anthropic\|openai\|compose" api\*.js`

2. Plus pošle (ak má):
   - Posledný známy "good" commit hash kedy AI generovala rôzne hudby
   - Console error pri AI Compose
   - Frontend fragment ktorý volá AI endpoint (pravdepodobne `01-core-head.jsx` alebo `03-engine.jsx`)

3. Audit pipeline:
   - Či `mood` label sa prepošle do AI prompt (frontend → backend)
   - Či AI response sa správne mapuje na MIDI / chord progression output
   - Či nie je response cached / hardcoded

**Resend retroactive endpoint** je tiež open option ak Rasto by chcel poslať si BCC kópie starých objednávok (alternatívne stačí Resend dashboard).

---

## Open items (queue do budúcich sessions)

| Item | Status | Priority |
|---|---|---|
| 🐛 AI music gen bug (vyššie) | Critical | high |
| Klimt Danaë literal refactor | Posledná literal female silhouette v Klimt phases | mid |
| Hokusai Wave do portfolio (swap za Storm) | Wave skutočný output = abstract pillar composition (NIE cartoon Great Wave). Pre portfolio názov decision pending: "Wave" / "The Great Wave" / "Crest" | mid |
| Spiral/Klint Forms variant v portfolio | Tvoj print Liszt Liebestraum z Forms vetvy (psychedelic flowers + rings + spirals). Name decision: "Spiritual Forms" / "Sacred Geometry" / "Mystic Bloom" | mid |
| Portfolio v3 (12 pieces) finalize | Mockup hotový (`portfolio-v3-mockup.html`). Treba decision pre marketing usage | low |
| Concept text refresh `04-songs.jsx` | Custom palette "inverse-Harmony" v 9 jazykoch | low |
| Resend retroactive endpoint | Optional — pre staré objednávky kde BCC nebol nastavený | low |

---

## Portfolio v3 — best of best (12 pieces, 3×4 gallery wall)

Pre marketing / Product Hunt / Instagram reference set:

| # | Artist | Style | Score |
|---|---|---|---|
| I | Klimt | Spiral Field | 25 |
| II | Vasarely | Vonal | 25 |
| III | Monet | Wisteria Cascade | 24 |
| IV | Kusama | Iconic Infinity Dots | 25 |
| V | Hokusai | Storm (alebo Wave po swap decision) | 23-25 |
| VI | **Kandinsky** | **Cosmic Scatter** ★ must per Rasto | - |
| VII | Rothko | Color Field | 23 |
| VIII | Af Klint | Ten Largest (alebo Forms vetva po name decision) | 21 |
| IX | Pollock | Drip | 22 |
| X | Mondrian | Grid | 22 |
| XI | Matisse | Cut-outs | 22 |
| XII | Picasso | Analytic Cubism | 21 |

---

## Standing rules (vždy applicable)

- Bump footer version ONLY na 'y' (nikdy auto)
- i18n auto-update Concept + Guide v 9 jazykoch (EN/DE/FR/ES/SK/ZH/ZHTW/PT/JA) keď sa UI/behavior mení
- iOS audio RESOLVED: `wakeAudio()` suspend→resume v Resume/Play tap
- esbuild/JSX parse + bracket balance Ref===Main pred každou delivery
- Iba zmenené fragment(y) ako hyphenated .jsx do outputs/
- Pri "vráť" — precise revert exactly, nič viac

---

## Inštrukcie pre nový chat

Rasto v novom chate začne:

1. **Pošle AI music generation súbor** (`api/ai-compose.js` alebo podobný)
2. Možno pošle aj `01-core-head.jsx` alebo `03-engine.jsx` kde sa volá AI endpoint z frontendu (aby sa overilo či mood sa prepošle)
3. Claude:
   - Audit pipeline: mood detection → AI request → music response
   - Identifikuje kde sa mood stráca
   - Patch + validate
4. Po fix: deploy cez dev → main štandardný flow

---

**End of handover.** Tento dokument zachytáva všetko potrebné pre continuation v novom session.
