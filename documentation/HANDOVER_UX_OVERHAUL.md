# HANDOVER — Paintiano UX Overhaul (First-time Gen Z UX)

**Created:** 2026-06-28
**Status:** Mitchell deployed, backup tag pushed, UX overhaul NOT YET STARTED
**Next session:** Implement Fáza 1 (auto-play demo + hidden cockpit)

---

## 1. WHO / WHAT / WHY

**App:** Paintiano PWA — deterministically translates music into golden-ratio color paintings.
**Owner:** Rasto (Mgr. Rastislav Ďurica), sole developer, conceptual artist as Raf Fel.
**Repo:** `C:\Users\RastoDurica\Desktop\paintiano-pwa` → GitHub RastoDee/paintiano → Vercel.
**Tagline:** "Hudba vžda mala farbu, len sme to zabudli."
**Product Hunt launch:** Wed 8 Jul 2026 09:00 CET. Video: `https://youtu.be/UuupsSWRXNY`.

### The problem we are solving

Rasto's diagnosis: **"Prvý dojem nového mladého usera — too complicated."**

When a new young user opens Paintiano they see the full cockpit immediately:
1. Palette row (Harmony / Spectral / φ Phi / Kontra / Custom — 5 modes)
2. "Inspired by" label + Vary dice
3. 8-10 artist chips grid (pairs + Mosaic)
4. "Tap to add or remove" info row
5. Tone row (Pure / Real / Pastel — 3 modes)
6. Edit mode dial toggle

= **~17 visible elements** on a small screen, expert-language vocabulary, no clear primary action, no guided default. Classic feature-creep symptom from long development.

### Gen Z research (already done, cited in chat)

Key findings from web search "Gen Z first 30 seconds app experience expectations creative apps onboarding 2026":

- **3 seconds** — time to form first impression; 94% comes from visual design (Grauberg 2026)
- **60 seconds** — time-to-value ceiling for mobile onboarding (Appcues 2026)
- **77% of DAUs abandon within 3 days** (VWO 2026, AppIt)
- **Inverted onboarding** — Duolingo pattern: USE first, then SIGN UP. Dramatically lifts engagement when category is naturally curiosity-driven (UXCam 2026).
- **Cognitive load > click count** — "A six-screen flow with zero ambiguous choices outperforms a two-screen flow with three unclear decisions" (Userpilot 2026).
- **Replace static welcome with live demo** (Vocal 2026 — Gen Z preference explicit).
- **3-5 sec value delivery** — Gen Z decides within first 3-5 seconds (Egnoto 2026).

Rasto's target audience: **mix of three personas** — musically educated, visually oriented, social. Not specialized. App must work for all three simultaneously.

---

## 2. THE PROPOSED UX (already approved in chat by Rasto)

**Approved mockup:** `/mnt/user-data/outputs/first_time_ux_mockup.html` — visual reference, 4 phones showing the flow.

### Phase 0–3 sec: App opens → auto-plays demo
- NO welcome screen, NO modal, NO tutorial.
- App opens, automatically calls `play()` on the first demo song (e.g. `SONGS[0]` — Liszt Hungarian Rhapsody is a good candidate).
- Canvas renders the painting in real time.
- Only UI on screen: small top-bar pill showing song title, pause button (44×44 floating).
- Cockpit fully hidden via `cockpitHidden=true` (display: none).
- Volume should NOT be muted — full play.

### Phase 5–15 sec: Subtle bottom sheet rises
- After ~5 sec elapsed playback time, a small bottom sheet rises with 2 options:
  - **↻ Surprise me** (primary, gold) — randomizes style + palette + tone, picks new song.
  - **🎵 Use my song** (secondary) — file picker for MP3 upload.
- No palette pickers, no artist chips, no tone pickers in this sheet.

### Phase 15–60 sec: Painting completes
- When the song finishes (or user pauses):
- Bottom sheet morphs to: **💾 Save** (primary) + **↻ Try another** + **📤 Share**.
- Top-bar pill changes from "🎵 Song name" to "✨ Painting complete".
- A discreet ⚙ gear button appears bottom-right (36×36 floating), 80px above the play button.

### Phase: User taps ⚙ → Customize sheet
- A larger bottom sheet opens, covering up to 70% of screen height.
- Order top-to-bottom:
  1. Header: "Customize" + ✕ close button
  2. **↻ Surprise me** (large primary gold button, full width)
  3. **Style** section — 4×2 grid of artist chips (8 visible, "more…" expands rest). **No pairs**, no edit mode. Each chip = one style. Pair-mechanic stays under the hood (Vary still cycles through paired phases).
  4. **Color** section — 3 chips: Auto / Bright / Warm
  5. **Vibe** section — 3 chips: True / Soft / Pastel

### Vocabulary changes (plain language for Gen Z)

| Expert term (current) | Plain language (new) |
|---|---|
| Harmony | Auto |
| Spectral | Bright |
| φ Phi | Bold |
| Kontra | Contrast |
| Custom | (kept as Custom or hidden) |
| Pure | True |
| Real | Soft |
| Pastel | Pastel (unchanged) |

Internal keys stay the same (`harmony`, `spectral`, etc.) — only display labels change. All 9 languages in 03-i18n.jsx must be updated.

---

## 3. CURRENT STATE OF FILES

**Where the work is:**
- `/home/claude/work/02-draw.jsx` — has Mitchell (deployed)
- `/home/claude/work/05-main.jsx` — has Mitchell + `mitchell` key (deployed)
- `/mnt/user-data/uploads/` — read-only originals (PRE-Mitchell state)
- `/mnt/user-data/outputs/` — deliverables for Rasto

**Mitchell deploy status:** ✅ DEPLOYED to dev branch. `comic` → `mitchell` rename complete, 6 phases coded (Gestural Garden, Color Bursts, Diptych Field, Dark Central Mass, Sunflower, Late Sparse White). All seed-driven for determinism. Pair is now `['pop','mitchell']`.

**Backup:** Tag `backup-pre-ux-overhaul-2026-06-28` and branch `backup/pre-ux-2026-06-28` pushed to GitHub (Rasto confirmed: "Delpoyed zalohuj" = backup the deployed state).

---

## 4. BUILD SYSTEM (CRITICAL — DO NOT FORGET)

**Source fragments** in `src/paintiano/`:
- `01-core-head.jsx` (94KB, ~2300 lines)
- `02-draw.jsx` (~13145 lines after Mitchell, ~658KB)
- `03-i18n.jsx` (253KB, 226 keys × 9 langs)
- `04-songs.jsx` (661KB, mostly base64 audio samples)
- `05-main.jsx` (~12840 lines after Mitchell, ~889KB)
- `06-demo-reel.jsx` (10KB)
- `07-pro.jsx` (50KB)

**Build:** `node build-paintiano.js` concatenates fragments → `src/paintiano.jsx` (single mega-file) → Vite → Vercel.

**Workflow:** dev branch only. Never use vim/merge tools. `git reset --hard dev` to revert.

**Per-edit validation MANDATORY before delivery:**
```bash
# 1. esbuild JSX parse — must say "esbuild OK" for every changed fragment
node -e "const e=require('esbuild'),fs=require('fs');try{e.transformSync(fs.readFileSync('05-main.jsx','utf8'),{loader:'jsx'});console.log('esbuild OK');}catch(x){console.log('FAIL line',x.errors&&x.errors[0].location.line, x.errors&&x.errors[0].text);}"

# 2. Bracket-balance check — must match baselines:
#    05-main:    (-8, 0, 0)   ← (paren, brace, bracket) delta vs zero
#    02-draw:    (-7, 0, 0)
#    01-core-head: (-3, -2, -3)
python3 -c "
def bal(p): s=open(p,encoding='utf-8').read(); return s.count('(')-s.count(')'),s.count('{')-s.count('}'),s.count('[')-s.count(']')
print('cur:',bal('05-main.jsx'))
"

# 3. CRLF enforcement before delivery
python3 -c "
d=open('05-main.jsx','rb').read().replace(b'\\r\\n',b'\\n').replace(b'\\n',b'\\r\\n')
open('05-main.jsx','wb').write(d)
"
```

**Standing rules:**
- Never auto-bump footer version — always ask y/n first.
- READ code, don't guess.
- Deliver only changed fragments.
- User is terse Slovak ("go"/"urob" = execute, "vráť" = revert).

**Deploy recipe (Rasto runs locally):**
```cmd
del src\paintiano.jsx
node build-paintiano.js
git add -A
git commit -m "..."
git push origin dev
```

---

## 5. IMPLEMENTATION PLAN — broken into PHASES

The user explicitly said "BIG TASK" and asked for handover. The work is sized for multiple sessions. Each phase is independently deployable so we never have a broken intermediate state.

### Phase 1: Auto-play demo + hidden cockpit (FIRST, SMALLEST, BIGGEST IMPACT)

**Goal:** App opens → automatically plays demo song → cockpit hidden behind ⚙ button.

**Changes needed in `05-main.jsx`:**

1. **First-visit detection:** Add `localStorage` flag `paintiano_visited`. If absent on mount → first-time flow.

2. **`useState` for cockpit visibility:** Add `cockpitVisible` state. Default `false` if first visit, `true` if returning user (their existing behavior preserved). Persisted in `localStorage` so returning user keeps their pref.

3. **Auto-play on mount:** In a `useEffect` running on mount, if first visit:
   - Pick default song (probably `SONGS[0]` or a curated demo song — Rasto to confirm if there's a designated "demo" song).
   - Set default style (Mitchell? Picasso? — Rasto to confirm).
   - Set default palette mode = harmony, tone = real.
   - Call existing `play()` function after a 300ms delay (let canvas init).
   - Set `paintiano_visited=true` in localStorage so this doesn't trigger again.

4. **Floating ⚙ button:** Bottom-right, 36×36, gold icon on translucent dark backdrop. Tap toggles `cockpitVisible`. Visible only when `cockpitVisible=false`.

5. **Bottom sheet (NEW component):** When `cockpitVisible=false`, show a minimal bottom sheet with:
   - During playback (lim > 0 && lim < cn): `[↻ Surprise me]` + `[🎵 Use my song]`
   - After completion (lim === cn): `[💾 Save] [↻ Try another] [📤 Share]`
   - The Save/Share buttons should call existing save/share handlers (find them in 05-main).

6. **"Surprise me" function:** Random pick from `ALL_ARTIST_KEYS` (excluding `mosaicFamily`), random palette mode, random tone, random song from `SONGS`. Call `play()`.

7. **Pause button repositioning:** When cockpit hidden, move pause button to bottom-center floating (44×44). When cockpit visible, restore to current position.

8. **Cockpit slide-up animation:** When user taps ⚙, animate cockpit sliding up from bottom (CSS `transform: translateY()` + transition).

### Phase 2: Cockpit content cleanup (when in customize mode)

- Add "↻ Surprise me" as primary button at top of cockpit.
- Remove edit-mode toggle (dial icon). All chips always tappable.
- Remove pair-coupling at UI level: each chip = one style. Update setupArtists logic so adding one side of a pair doesn't auto-add the other.
- The pair-mechanic in `Vary` (cycling through paired phases) stays under the hood — it's invisible to the user, just affects which painting variant they see when they tap Vary.

### Phase 3: Vocabulary changes (i18n update)

- Update `03-i18n.jsx` for all 9 languages:
  - `harmonyLabel` → "Auto" / "Auto" / "Auto" / etc.
  - `spectralLabel` → "Bright" / "Jasné" / etc.
  - `phiLabel` → "Bold" / "Výrazné" / etc.
  - `kontraLabel` → "Contrast" / "Kontrast" / etc.
  - `pureLabel` → "True" / "Pravé" / etc.
  - `realLabel` → "Soft" / "Jemné" / etc.
  - Pastel unchanged.
- 226 keys × 9 langs is the existing structure. Don't break it.

### Phase 4: First-painting "wow" polish

- During first auto-play, optional: dim ground gradient slightly more dramatic, slow strokes to reveal slower for visual impact.
- Top-bar pill animation: subtle pulse when painting completes.
- "✨ Painting complete" celebration: gentle particle burst when last chord plays.

---

## 6. PENDING / OPEN QUESTIONS for Rasto in next session

Before starting Phase 1, ask Rasto:

1. **Demo song for first visit:** Which song should auto-play? `SONGS[0]` is current default. Is there a curated "first impression" song Rasto wants? Liszt Hungarian Rhapsody was used in the mockup as placeholder.

2. **Default style for first visit:** Picasso? Mitchell? Random? Rasto's choice should optimize for "wow" factor — probably a colorful, expressive style.

3. **"Returning user" definition:** If user has been here but cleared localStorage → treated as first visit again. OK?

4. **Pause-during-playback CTA:** When user pauses mid-playback, what shows? Same Surprise/Upload sheet? Or different?

5. **Cockpit re-hide:** Once user opens cockpit and customizes, should it stay open on next visit? Or hide again after song completes? Default suggestion: stays open after first customize action.

6. **Pair-mechanic for Mitchell specifically:** Mitchell is paired with Haring (`pop`/`mitchell`). When user picks just Mitchell, Vary cycles through 6 Mitchell phases. When user picks both via "more…" → Vary cycles through Mitchell+Haring combined? Need to confirm pair behavior matches current implementation.

---

## 7. DEFERRED ITEMS (unchanged from prior handovers, still pending)

These are not blocked by the UX work and can be done in parallel sessions:

- **App paywall tier text stale:** `proValueArtists` says "16 artists (free has 8)" — reality is 18/9. Fix 16→18 and 8→9 across all 9 langs in 05-main.jsx.
- **Legal/pricing HTML rebuild:** `pricing.html` needs 3-card layout (Free €0 / Pro €9.99→€14.99 / Pro AI €19.99→€24.99). All 4 legal pages (pricing/refunds/terms/privacy) missing Japanese (ja). Ground truth in transcript.
- **Product Hunt launch:** Wed 8 Jul 2026 09:00 CET.
- **"See music" Image→Music bridge:** Local commit, not pushed (git push failed earlier — trailing backslash issue).
- **Book PDFs integration:** Add to `/public/book/` with nav/footer link to right-language PDF.

---

## 8. ARTIST INVENTORY (current state, post-Mitchell)

The app currently has **19 styles** (18 + mosaic):

| Key | Display name | Pair |
|---|---|---|
| `mosaicFamily` | Mosaic | (standalone) |
| `picasso` | Picasso | matisse |
| `matisse` | Matisse | picasso |
| `pollock` | Pollock | bloom |
| `bloom` | Sam Francis | pollock |
| `kusama` | Kusama | miro |
| `miro` | Miró | kusama |
| `mondrian` | Mondrian | kandinsky |
| `kandinsky` | Kandinsky | mondrian |
| `gold` | Klimt | rothko |
| `rothko` | Rothko | gold |
| `bulge` | Vasarely | wave |
| `wave` | Riley | bulge |
| `spiral` | af Klint | arcs |
| `arcs` | Stella | spiral |
| `pop` | Haring | mitchell |
| `mitchell` | Joan Mitchell | pop |
| `monet` | Monet | hokusai |
| `hokusai` | Hokusai | monet |

Pair behavior: when user enables `picasso`, `matisse` is auto-enabled (migration in setupArtists initializer fills missing partner).

When user picks ONE chip (e.g. just Picasso) → Vary cycles through Picasso's 6 phases only.
When user picks the PAIR (Picasso + Matisse) → Vary cycles through both artists' phases combined (12 total).

**For Phase 2 UX change:** Pair coupling should be REMOVED at UI level. User sees 18 individual chips (not 9 pairs). Pair mechanic in `Vary` stays under the hood — but how? Decision needed: either Vary always cycles all selected styles' phases regardless of pairs, OR pair-detection is automatic when both halves are picked. Recommend: cycle all selected styles' phases regardless of pairs (simpler mental model).

---

## 9. KEY FUNCTION REFERENCES IN 05-main.jsx

For Phase 1 implementation, the new session will need to locate:

- `play()` function — line ~? (search "function play(" or "const play =")
- `pause()` function — similar pattern
- `setupArtists` useState — line 1117 area (search "setupArtists, setSetupArtists")
- `cockpitEdit` useState — line 2124 area (search "cockpitEdit, setCockpitEdit")
- `cockpitEditRef` — line ~1687
- `paintPhase` (Vary phaseIndex) — search "paintPhase"
- `pollockSessionSeed` — the seed used by all overlay drawers
- `gc` (note→color mapper) — defined in main render
- Save/Share/Download handlers — search "handleSave" / "saveCanvas" / "downloadPainting"
- `cockpitEdit` toggle button — search the JSX

For new state additions:
- `cockpitVisible` useState (default depends on localStorage)
- `firstVisit` boolean (computed from localStorage)
- Animation state for slide-up

---

## 10. PAINTIANO CONCEPT COMPATIBILITY (must preserve)

When implementing UX changes, the determinism must NOT break:

- Same song + same style + same variant = identical painting (recall guarantee)
- All randomness via `_seedRnd(slot, ss, ...)` — never `Math.random()`
- Colors via `_picChord(chords, idx, gc, isBW)` — always song palette
- Densities via `computeSongCharacter(chords)` — energy + density derived from chords
- `_setCurE(chord._E)` for Real mode breathing
- `_energyTint` + `_pastelTint` for tone modulation
- Reveal via `lim/cn` ratio

UX changes should be PURE rendering/state changes — must not touch the determinism layer.

---

## 11. WHAT TO ASK RASTO FIRST IN NEW SESSION

```
Začínam UX overhaul — Fáza 1 (auto-play demo + skrytý cockpit).

Pred kódovaním potrebujem 2 odpovede:

1. Demo song pre prvý dojem nového usera:
   a) SONGS[0] (čokoľvek je prvé)
   b) Konkrétna skladba (Liszt? Beethoven? povedz ktorá)
   c) Random z prvých 3-5 skladieb

2. Default style pre prvý painting:
   a) Picasso (klasický wow)
   b) Mitchell (najnovší, color punch)
   c) Random expressive style
   d) Iný (Pollock? Kandinsky?)

Potom idem kódovať.
```

---

## 12. FILES TO RESTORE IN NEW SESSION

When the new Claude session opens, it should immediately:

1. Read this handover document
2. Check `/home/claude/work/` for fragments — should have:
   - `02-draw.jsx` (with Mitchell)
   - `05-main.jsx` (with Mitchell + `mitchell` key)
3. If fragments are missing, copy from `/mnt/user-data/uploads/` BUT REMEMBER those are PRE-Mitchell state. Rasto's local repo has the deployed Mitchell version.
4. Read 01-core-head.jsx, 03-i18n.jsx, 04-songs.jsx, 06-demo-reel.jsx, 07-pro.jsx from uploads (read-only, no Mitchell changes there).

**Critical:** the working fragments in `/home/claude/work/` are the deployed-Mitchell versions. They are the source of truth. Do not overwrite with `/mnt/user-data/uploads/` versions (those lack Mitchell).

---

## 13. EXAMPLE MOCKUP FILE

The approved 4-phase UX mockup HTML is at:
`/mnt/user-data/outputs/first_time_ux_mockup.html`

It shows:
- Phone 1: Auto-play landing (0-3s)
- Phone 2: Subtle bottom sheet rises (5-15s)
- Phone 3: Painting completes (15-60s)
- Phone 4: User taps ⚙ → Customize sheet

Use it as visual reference when coding the actual implementation.

---

## END OF HANDOVER

**Next action in new session:**
1. Confirm Rasto has deployed Mitchell + tagged backup.
2. Ask Rasto: demo song? default style?
3. Start Phase 1 implementation in 05-main.jsx.
4. Validate (esbuild + bracket-balance + CRLF) every edit.
5. Deliver 05-main.jsx to `/mnt/user-data/outputs/`.
6. Rasto runs build + deploy locally.
7. Test on iPhone, iterate.

Good luck. Treat the cockpit as a luxury feature — most users never need it. The default experience should feel like magic.
