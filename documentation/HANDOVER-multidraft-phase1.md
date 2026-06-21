# HANDOVER — Phase 1 multi-draft (Mood / MFI / Music / Image)

**Session date:** 2026-06-21
**Status:** Phase 1 multi-draft attempt REVERTED (black screen). All other fixes from this session deployed and live on dev.

---

## 1. Úspechy tejto session (deployed na dev)

Všetko prešlo esbuild + bracket validation a testom v prehliadači. Footer ostal v2.0. Brackets Ref===Main na každom deploy.

| # | Feature | Súbor(y) |
|---|---|---|
| 1 | Setup chip active states pre všetkých 6 chips (Mood / Compose / Mic / MFI / Music / Image) — cream text + farebný dot + tinted bg | 05-main |
| 2 | Compose picker (`showComposeRecent` + `showMicRecent`) modernizácia — variant A overlay + blur + radius 24 | 05-main |
| 3 | Save picker + Morph menu modernizácia | 05-main |
| 4 | Mood title repositioning — 5-col layout (`is5Col`) renderuje track-head row nad seek block | 01-core-head + 05-main |
| 5 | Mood thumb 44×44 inside track-head v 5-col | 05-main |
| 6 | MFI flow cleanup — 3-step (load = fill canvas / play = mosaic begin / done = stay) | 05-main |
| 7 | Morph picker fix — 0 selected = remove morph (recompose base mood) | 05-main |
| 8 | Per-mode picker frame colors (music blue / image orange / mfi purple / mic pink / mood gold) | 01-core-head + 05-main |
| 9 | Auto-close pickers on mode change useEffect (riadok 4669) | 05-main |
| 10 | ← CANVAS / ← BACK / chip toggles / mic chip svieti aj pri `hasMicDraft` | 05-main |
| 11 | ← BACK consistency — `moodContext` perzistuje regardless of pause state | 05-main |

---

## 2. Neúspech — Phase 1 multi-draft (REVERTED)

### Cieľ

Pridať stash mechanism pre 4 source modes (Mood / MFI / Music / Image), parallelný s existujúcou `composeStashRef` / `singStashRef` / `listenStashRef` infraštruktúrou pre Compose / Mic. Užívateľ má mať možnosť mať rozrobených viac modes naraz — chip v Setup svieti pre každý ktorý má draft, klik na chip resume-uje draft.

**Užívateľské pravidlá schválené pred implementáciou:**
- 1 draft per mode
- Klik na svieťiaci chip → resume (restoreMode)
- + NEW `<X>` = replace (nový file nahradí starý draft v rámci mode)
- Stash trigger: iba pri opustení mode (← BACK alebo prepnutie mode)

### Súbor v ktorom som pracoval

**Iba `05-main.jsx`.** 01-core-head a iné fragmenty som sa nedotkol pri multi-draft pokuse.

### Backup pred zmenou

`/home/claude/backup_multidraft_193953/` — obsahuje `01-core-head.jsx` + `05-main.jsx` v stave **post-fix-#11, pre-multidraft**. Po reverte je `/home/claude/work/` v identickom stave.

### Symptóm

Po validnom esbuild (⚡ Done) a bracket Ref===Main (`05-main: +0/-8`) bola aplikácia v testovaní **black screen** (app crash / freeze, blank canvas). Rasto reportoval "STOP - black screen" → okamžitý revert.

### Chronológia implementácie

#### Phase 1 — Infrastructure (riadky ~1884–1907 v 05-main.jsx)

```jsx
const moodStashRef    = useRef(null);
const mfiStashRef     = useRef(null);
const musicStashRef   = useRef(null);
const imageStashRef   = useRef(null);

const [hasMoodDraft,  setHasMoodDraft]  = useState(false);
const [hasMfiDraft,   setHasMfiDraft]   = useState(false);
const [hasMusicDraft, setHasMusicDraft] = useState(false);
const [hasImageDraft, setHasImageDraft] = useState(false);
```

#### Phase 1.2 — utility funkcie (vložené za `restoreStash`, cca riadok 2632)

**`stashMode(mode)`** — capture mode-specific state slice → ref + `setHasXxxDraft(true)`. Deps: 14 state premenných.

**`restoreMode(mode)`** — restore snapshot, set všetky state vrstvy, return true/false. Deps: 11 vrátane `stashMode`.

**`clearModeStash(mode)`** — discard stash + hasDraft flag. Deps: `[]`.

#### Phase 2 — Integration points

- **← BACK button** (riadok 8267): detect current mode podľa state slice (moodFromImg / moodContext+currentMood / loadedSource=='image' / loadedSource in midi/audio/score), stashMode pred wipe canvas
- **4 setup chip onClick handlers** (Mood / MFI / Music / Image): ak `hasXxxDraft` → `restoreMode(mode)` + `setForceSetup(false) + return`, inak existing picker logic
- **4 chip active states** (bg / border / color / dot) rozšírené `|| hasXxxDraft`
- **`restoreMode` auto-stash**: pred prepisom canvas auto-stash-ne current mode ak je iný než restorovaný
- **`clear()` button** (riadok 3787): wipne všetky 4 source mode stash-e (full reset)

### Snapshot payload (čo `stashMode` ukladal pre každý mode)

| Mode | Payload fields |
|---|---|
| **mood**  | `chords`, `info`, `viewMode`, `currentMood`, `composeSource`, `varySource`, `midiBlob`, `midiName`, `morphTargets` |
| **mfi**   | `chords`, `info`, `viewMode`, `originalImgUrl`, `imgMoodThumb`, `mfiImgAspect`, `composeSource`, `varySource`, `midiBlob`, `midiName` |
| **music** | `chords`, `info`, `viewMode`, `loadedSource`, `midiBlob`, `midiName`, `audioBlob`, `audioName` |
| **image** | `chords`, `info`, `viewMode`, `originalImgUrl`, `mfiImgAspect`, `loadedSource` |

---

## 3. Root-cause analýza (post-mortem)

V poradí pravdepodobnosti:

### A. Render-loop cez auto-close useEffect ⭐ najpravdepodobnejšie

`restoreMode` setuje `setLoadedSource`, `setMoodContext`, `setMoodFromImg`. Existujúci useEffect (riadok 4669) sleduje **práve tieto** premenné:

```jsx
useEffect(()=>{
  if(micActive||micArmed||composeMode||loadedSource||moodFromImg){
    setShowMoodMenu(false); setShowMorphMenu(false);
    setShowComposeRecent(false); setShowMicRecent(false);
    setPickMode(null);
  }
},[micActive,micArmed,composeMode,loadedSource,moodFromImg]);
```

V tom istom frame ako mode-specific state mutácie sa spustí `setPickMode(null)` + iné setters → race / loop možný.

### B. useCallback deps explosion

`stashMode` deps zahŕňali 14 state premenných. `restoreMode` deps 11 vrátane `stashMode`. Rekreuje sa pri každej zmene → useEffect-y ktoré ho používajú sa retriggerujú → potenciálne lavína re-renderov.

### C. MFI / Image incomplete snapshot

MFI má `pixelRef.current` pre image scan + `substrateRef.current` pre cached canvas. Tieto som **neuložil**. Pri `restoreMode('mfi')` by sa `originalImgUrl` nastavil ale `pixelRef` zostal null → image-related kód pravdepodobne havaruje na deref.

### D. Async loaders neviditeľné v snapshot

MFI loader robí AI vision call → varySource → chords. Multi-step async pipeline ktorú treba reconstruct pri restore, ja som ukladal len výsledný state. Najmä ak medzitým zmena `composeSource` / `varySource` invalidovala referenciu.

### E. Side-effect setters

`setMidiBlob` / `setAudioBlob` / `setMorphTargets` v restoreMode môžu triggernúť ďalšie useEffect-y ktoré som nemapoval.

---

## 4. Stratégia pre next session — ako urobiť Phase 1 úspešne

### Krok 1 — MAPPING AUDIT pred kódom

Pre každý mode otrace-ovať:
- Aké state premenné definujú mode (zoznam)
- Ako sa loaduje (ktorá funkcia, čo robí, čo nastavuje, refs, async?)
- Ako sa unloaduje / replace-uje
- Aké refs sú involved (pixelRef, substrateRef, varySource...)
- Či má async dependencies (AI calls)
- Ktoré useEffect-y reagujú na zmenu týchto state

**Poslať mapping na schválenie pred ďalším krokom.**

### Krok 2 — Inkrementálne — iba Mood first

Najjednoduchší mode (text mood → AI/offline → `applyEvents` → chords). Žiadne pixelRef, žiadne async medzistavy. Otestovať, deploy, test, **potom** MFI / Music / Image jeden po druhom.

### Krok 3 — Refactor restoreMode bez deps explosion

`restoreMode` má mať deps `[]`. Volania state setters sú stable z React-u. Mutácie cez `Ref.current` accessory. Žiadne state premenné v deps.

### Krok 4 — Decouple od auto-close useEffect

`restoringRef.current = true` pred `restoreMode`, `false` po. Auto-close useEffect skontroluje a skipne. Alebo manuálne `setPickMode(null)` atď pred mode-specific state mutáciami.

### Krok 5 — Test po každom kroku v reálnom browseri

Esbuild + brackets sú **nutné ale nedostatočné** — chytajú syntax, nie runtime. Po každej zmene Rasto test v prehliadači.

### Krok 6 — Rollback safety

Po každom úspešnom mode-pridaní urobiť backup priečinok a notovať si v handover hlavičke kde končí poslednú funkčnú verziu.

---

## 5. Aktuálny stav súborov

Match s `/home/claude/backup_multidraft_193953/`. Obsahuje fix-y #1–#11 z tabuľky vyššie, **bez** Phase 1 multi-draft.

| Súbor | Lines | Brackets new / orig | Stav |
|---|---|---|---|
| `01-core-head.jsx` | 1578 | −2/−3 ≡ orig | Post-fix-#11 |
| `05-main.jsx` | 10869 | +0/−8 ≡ orig | Post-fix-#11, pre-multidraft |
| `03-i18n.jsx` | 1336 | — | Nedotknutý |
| 02-draw, 04-songs, 06-demo-reel, 07-pro | — | — | Nedotknuté |

---

## 6. Kľúčové infraštruktúrne miesta (mapa pre next session)

### Existujúca stash infraštruktúra (Compose / Mic — vzor pre Phase 1)

| Element | Lokácia |
|---|---|
| `composeStashRef`, `singStashRef`, `listenStashRef` | 05-main:1884–1886 |
| `[hasComposeDraft, setHasComposeDraft]` | 05-main:1890 |
| `[hasMicDraft, setHasMicDraft]` | 05-main:1893 |
| `stashDraft(owner)` | 05-main:2575 |
| `restoreStash(owner)` | 05-main:2597 |
| `resetCanvasForDraft(owner)` | 05-main:2617 |

**`stashDraft` strict check:** `composedModeRef.current === true` && `chords.length > 0`.
**`restoreStash` payload:** `{chords, idxCounter, sessionStart}` + setuje `composedModeRef`, `draftOwnerRef`, `viewMode='paint'`.

### Callsites `stashDraft` / `restoreStash` (skontrolovať každý pri Phase 1)

Riadky: **3918, 3942, 3964, 4722, 4734, 4747, 5356, 6014, 6542, 6558, 6710, 6923, 8042, 8082, 8086, 8218, 8219**

### Auto-close picker useEffect — **hlavný kandidát pre interference**

```jsx
// 05-main:4669
useEffect(()=>{
  if(micActive||micArmed||composeMode||loadedSource||moodFromImg){
    setShowMoodMenu(false); setShowMorphMenu(false);
    setShowComposeRecent(false); setShowMicRecent(false);
    setPickMode(null);
  }
},[micActive,micArmed,composeMode,loadedSource,moodFromImg]);
```

`setLoadedSource` / `setMoodContext` / `setMoodFromImg` v `restoreMode` ho retriggerujú.

### State slices pre 4 source modes

| State | Lokácia | Mode |
|---|---|---|
| `viewMode` | 1008 | všetky |
| `composeSource` | 1013 | Mood, MFI |
| `midiBlob`, `midiName` | 1060–1061 | Music, Mood, MFI |
| `loadedSource` | 1069 | Music, Image |
| `audioBlob`, `audioName` | 1145, 1164 | Music |
| `moodContext` | 1306 | Mood, MFI |
| `morphTargets` | 1699 | Mood |
| `currentMood` | 1706 | Mood |
| `varySource` | 1808 | Mood, MFI |
| `originalImgUrl` | 1810 | MFI, Image |
| `imgMoodThumb` | 3477 | MFI |
| `mfiImgAspect` | 3479 | MFI, Image |
| `moodFromImg` | 3483 | MFI |

### Refs

| Ref | Lokácia | Účel |
|---|---|---|
| `pixelRef` | 619 | Image scan pixel data |
| `substrateRef` | 679 | Cached canvas |
| `audioBlobRef` | — | Audio playback |
| `chordsRef`, `idxRef`, `sessionStart` | — | Canvas chord state |
| `draftOwnerRef`, `composedModeRef` | — | Creative mode ownership |
| `gridSigRef` | — | Grid signature cache |

### ← BACK button (najkomplexnejšia integration point)

**05-main:8267** — aktuálne stash-uje len Compose / Mic. Bezpečnostná sieť: `if(draftOwnerRef.current) stashDraft(draftOwnerRef.current)`.

Pre Phase 1 sem treba detect current source mode + `stashMode(mode)` **pred** wipe canvas. Pozor — auto-close useEffect (riadok 4669) následne fired, takže poradie matter.

---

## 7. Project context

### Repo / build

- Repo: `C:\Users\RastoDurica\Desktop\paintiano-pwa`
- 7 JSX fragments v `src/paintiano/` → `node build-paintiano.js` → `src/paintiano.jsx`
- Pre-deploy guard: `node check-paintiano.js` (blokuje build ak chýbajú kritické fixy)

### Sources v context-e (pre upload)

- `/mnt/user-data/uploads/1781967645416_01-core-head.jsx`
- `/mnt/user-data/uploads/1781967645415_05-main.jsx`
- `/mnt/user-data/uploads/1781967645416_03-i18n.jsx`

### Brackets reference (post-fix-#11)

- `01-core-head` : `−2/−3`
- `05-main`      : `+0/−8`

### Pracovné adresáre

- Working: `/home/claude/work/`
- Deliverables: `/mnt/user-data/outputs/`
- Backup pre revert: `/home/claude/backup_multidraft_193953/`

### Validation pipeline

```bash
npx esbuild@0.21.5 FILE.jsx --bundle=false --loader:.jsx=jsx --outfile=/dev/null
# + bracket balance check vs original (Ref===Main)
```

### Deploy

```bash
# Phase 1 — dev
node check-paintiano.js
node build-paintiano.js
git add -A
git commit -m "..."
git push origin dev

# Phase 2 — main (po test OK)
git checkout main
git reset --hard dev
git push origin main
git checkout dev
```

### Pravidlá

- Footer v2.0 — **vždy spýtať pred bump**
- Mobile <769px byte-for-byte untouched
- Všetky desktop changes vo `@media (min-width:769px)` alebo za `isDesktop` / `immersive` guards
- Deliver iba changed fragments ako hyphenated `.jsx` files do `/mnt/user-data/outputs/`

---

## 8. Komunikačné pravidlá s Rastom

- Komunikuje terse v slovenčine
- Mobile-first na Windows + tablet + desktop testing
- Skratky: **"robíš?" / "go"** = execute; **"vráť" / "daj naspäť"** = precise revert; **"STOP - black screen"** = okamžitý revert z backup
- Picker tool zriedka renderuje — list options ako numbered text v prose
- Demands precision, calls out missed requirements
- Pri komplexných veciach preferuje vidieť **plán pred kódom**
- Workflow: analýza → mockup (HTML) → confirm → implement → validate → present_files → deploy

---

## 9. Otvorené tasky (mimo multi-draft)

- **Pricing.html** full 3-card rebuild (Free / Pro / Pro AI, 3-col CSS grid, purple proai accent) — odporúčam fresh session
- **Refunds.html** Pro AI line addition
- **Terms.html** §3.2 two-tier mention
- 4× legal HTML chýba `ja` (pricing/privacy/refunds/terms)
- Book PDF integrácia do appky (`/public/book/` + nav/footer link)
- Tier text fix: `proValueArtists` 16→18 artists, 8→9 free artists across all 9 langs
- PT / ZH / ZHTW / JA book rebuild z `sk_content.json` (241 units) — proces FR/ES
- Mobile app publish (Bundle `app.paintiano.mobile`, Codemagic plánovaný)
- Bizzdesign MPA negotiation (Track A re-acquisition / Track B strengthen / Track C Ardoq backstop)

---

## 10. Pre next session — odporúčaný kickoff

**Otvor s:**

> "Pokračuj v Phase 1 multi-draft. Najprv mapping audit Mood mode — žiadny kód kým nepošleš mapping na schválenie."

Backup `/home/claude/backup_multidraft_193953/` zostáva ako referenčný správny stav (= post-fix-#11).

---

**END HANDOVER**
