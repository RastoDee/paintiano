# HANDOVER: See music color fidelity

**Date:** Jun 26, 2026
**Status:** Active diagnosis — debug logs deployed, awaiting console output from user
**Branch:** dev (deployed, awaiting test)
**Files in flight:** `02-draw.jsx`, `05-main.jsx`

---

## THE PROBLEM

User has a See music feature (Image → Music bridge). After See music transfer:
- **Music canvas in Kontra palette** (the palette the piece was scanned in) shows colours **NOT matching Van Gogh** ❌
- **Music canvas in Harmony palette** shows colours **matching Van Gogh** ✓

This is **opposite** of what paintiano DNA demands: the palette in which the piece was scanned should give the source-faithful colours; other palettes give "dialect" interpretations.

User's exact statement: *"obraz v Music musí byť farebne podobný s predlohou v Image v tej palete v ktorej bol prenesený"*

## NON-NEGOTIABLE CONSTRAINTS (set by user, VERY firm — "uz ziadne hadanie"):

> **"cisty Music ani cisty Image nemozu byt ovplyvnene NIJAKO - musia ostat ako su!!!!!!!"**

1. **Pure Image scan** (image + Play in Image canvas) → MUST be untouched
2. **Pure Music load** (any MIDI/audio/score file) → MUST be untouched
3. Only **See music transfer path** may have new logic

Plus user added: **"hudobnost by sa mala zachovat - Image vytvoril skladbu a ta by mala zniet"** — music in Music after See music must sound the same as in Image.

---

## WHY HARMONY "WORKS" AND KONTRA DOESN'T

Mathematically verified via console simulation:

Image scan in Kontra:
- Pixel hue=210° → `KONTRA_HUE[5]=210` → **pc=5 (F)** (this is what `pxToNote` produces)
- THEN Krumhansl + snap + bar progression run
- Krumhansl uses `MAJOR_P`/`MINOR_P` profiles — these are **COF-aligned** (Western tonal music)
- Even for Kontra-derived pc distribution, Krumhansl gives a result that is "tonal" in COF sense
- Bar progression OVERWRITES pixel-derived pcs with in-key triad tones
- → After all transforms, chord array contains pcs that are **COF-friendly** (e.g. dominant pc=1 (C#), pc=6 (F#), pc=4 (E))

Music render:
- **Harmony**: `harmCol(pc) = COF[pc]` → COF[1]=210 (blue) ✓ matches Van Gogh blue
- **Kontra**: `kontraCol(pc) = KONTRA_HUE[pc]` → KONTRA_HUE[1]=30 (orange) ✗ NOT Van Gogh

**Root cause**: Krumhansl + bar progression produce pcs that are "tuned" for COF rendering, not for the palette in which the image was scanned.

User's screenshots (Van Gogh Starry Night, multiple PNG attachments) confirm this:
- Image 1: Music canvas in **Harmony** = blue/green/yellow (Van Gogh-like) ✓
- Image 2: Music canvas in **Kontra** = purple/orange/random (NOT Van Gogh) ✗
- Image 3-4: Image scan in Kontra = looks like Van Gogh (source-faithful)

Console debug data from PREVIOUS attempt (pixel-injection approach, since reverted):
- Harmony hues from gc(): 200-210 range (blue/green) ✓
- Kontra hues from gc(): 270-290 range (purple) ✗
- Both palettes received identical chord pcs (pc=6, 1, 4 dominant)
- prgb hint was identical for both — palette transform was different

---

## APPROACHES TRIED AND DISCARDED

### Attempt 1: Pixel RGB injection (REVERTED)
- Added `_pixelRGB` per chord in `pixelsToImageEvents`
- gc() mixed final colour 70/30 (pixel/palette) for See music chord arrays
- Worked for Mosaic (looked like Van Gogh) but user said: **"Mosaic nie je paleta"** — palette switch is supposed to give dialects, not all-Mosaic
- Fully reverted

### Attempt 2: Palette-aware Krumhansl permutation in image scan (REVERTED)
- Permuted `pcCounts` into COF space before Krumhansl
- Permuted `scalePCs` back to palette-native space after detection
- **Result**: changed how music SOUNDS in Image (Kontra and Harmony swapped). Violated "pure Image untouched" rule. User: "Image v Kontra znie inak ako Kontra pred deployom, Harmony znie ako Kontra pred deployom"
- Fully reverted

### Attempt 3: Dual-layer chord notes (CURRENT - DEPLOYED, AWAITING TEST)
- Each note carries TWO fields:
  - `n.m` = MIDI note → audio engine reads this → music sounds identical to Image
  - `n._paintPc` = original pixel-derived pitch class (captured BEFORE snap/bar progression overwrite n.m)
- Image canvas paints from `pixelRef.current.px` directly, not from chord notes → no visual change
- Music canvas painter rewrites `m` to `(oct*12 + _paintPc)` for the paint path only → source-faithful colours in any palette

**Status:** deployed with debug logs but user reports STILL doesn't work. Awaiting console output.

---

## CURRENT IMPLEMENTATION DETAILS (Attempt 3)

### File: `02-draw.jsx`

**1. `pxToNote` (~line 11038):**
```js
return{m:midi,v,durMs:noteDur,_paintPc:midi%12};
```
Captures source-pixel pc at pxToNote time (before snap/bar overwrites m).

**2. All note transforms use `{...n, m:newM}` spread** — preserves `_paintPc` automatically through:
- `snapToScale` (line 11466)
- `tightenChord` (line 11322)
- `voiceToBarChord` (line 11459)
- seed bar chord push at line 11773, 11781 (`{...melSrc, m:...}` — _paintPc comes from melSrc)
- bass note at line 11818 has NO `_paintPc` (fresh chord tone, no source pixel) — acceptable trade-off

**3. `bakeImageChords` (lines ~12959-12994):**
Three paths (tremolo, arpeggio, default) all explicitly carry `_paintPc: n._paintPc` to output.

**4. `drawBlock` dispatcher (top of artist branches):**
```js
const _hasPaintPc = notes.some(n => typeof n._paintPc === 'number');
const _notes = _hasPaintPc
  ? notes.map(n => {
      if(typeof n._paintPc !== 'number') return n;
      const oct = Math.floor(n.m / 12);
      return { ...n, m: oct*12 + n._paintPc };
    })
  : notes;
```
All artist branches use `_notes` instead of `notes`. Per-cell artists (Mosaic, Mondrian, Rothko, Matisse, Kusama, Kandinsky cells, Pollock cells) see rewritten m → source-faithful colour through gc().

### File: `05-main.jsx`

**1. Ref declaration:**
```js
const _imagePaintPcsRef = useRef(null);
```
Holds array of per-chord `{m → paintPc}` maps during See music transfer.

**2. See music onClick capture (line ~9670 primary + 9697 fallback):**
```js
_imagePaintPcsRef.current = baked.map(c => {
  const map = {};
  for(const n of c.n){
    if(typeof n._paintPc === 'number') map[n.m] = n._paintPc;
  }
  return map;
});
```
Plus DEBUG log right after (`[seemusic-dbg] CAPTURE:`).

**3. Post-load effect (after `chordsRef.current=chords` effect, ~line 3013+):**
```js
useEffect(()=>{
  if(!_imagePaintPcsRef.current) return;
  if(loadedSource!=='midi') return;
  if(!chords || chords.length===0) return;
  const maps = _imagePaintPcsRef.current;
  const cur = chordsRef.current;
  const lim = Math.min(cur.length, maps.length);
  let matched=0, total=0;
  for(let i=0;i<lim;i++){
    const m2p = maps[i];
    if(!m2p) continue;
    for(const note of cur[i].n){
      total++;
      if(typeof m2p[note.m] === 'number'){
        note._paintPc = m2p[note.m];
        matched++;
      }
    }
  }
  // [DEBUG log here]
  setStamp(s=>s+1);
  _imagePaintPcsRef.current = null;
},[chords, loadedSource]);
```

**4. Paint phase _chordsPaint (in main paint useEffect, ~line 2527):**
```js
const _hasPaintPc = chords && chords.length>0 && chords[0] && chords[0].n && chords[0].n.some && chords[0].n.some(n=>typeof n._paintPc==='number');
// [DEBUG log here]
const _chordsPaint = _hasPaintPc
  ? chords.map(c => ({
      ...c,
      n: c.n.map(n => typeof n._paintPc === 'number'
        ? { ...n, m: Math.floor(n.m/12)*12 + n._paintPc }
        : n
      )
    }))
  : chords;
```
All overlay calls (drawPicassoOverlay, drawPollockOverlay, etc.) substituted from `chords` to `_chordsPaint` in BOTH fast-path and slow-path sections. drawOne stays with original `chords` because drawBlock transforms internally per-cell.

### File: `01-core-head.jsx` — UNTOUCHED

Palette functions (harmCol, kontraCol, specCol, phiCol, customCol + their Pastel variants) unchanged.

### File: `gc()` in 05-main.jsx — UNTOUCHED

Original signature `gc(m, v)`, original logic, no pixel mix. Pure restoration to pre-pixel-injection state.

---

## CURRENT BLOCKER

User deployed Attempt 3 + reports: **"Nic nevyriesene..stale rovnako v kontra zle, v harmony ok"**

Then deployed DEBUG logs (3 points: CAPTURE, RE-ATTACH, PAINT) to identify which retiazka link breaks.

User's last action: trying to `git push origin dev` but typed `dev\` — push failed with `fatal: invalid refspec 'dev\'`. Commit was made locally (`[dev e16c8b3] DEBUG: log _paintPc capture...`) but NEVER PUSHED to remote.

**LAST KNOWN STATE on remote dev branch**: pre-debug-log state. Need user to do clean `git push origin dev` (without backslash) so the debug logs become live, then user must:

1. Open desktop Chrome
2. DevTools → Console (F12)
3. Reload paintiano-git-dev-rasto-dee-s-projects.vercel.app
4. Image Van Gogh + Play (let scan finish)
5. See music
6. Play in Music with Kontra palette
7. Screenshot/copy console showing:
   - `[seemusic-dbg] CAPTURE:` (does _paintPc survive image scan transforms?)
   - `[seemusic-dbg] RE-ATTACH:` (do notes match after MIDI round-trip?)
   - `[seemusic-dbg] PAINT:` (does paint phase see _paintPc?)

---

## NEXT-SESSION DIAGNOSTIC TREE

When console logs arrive, examine in this order:

### If `[seemusic-dbg] CAPTURE:` shows `notesWithPaintPc < totalNotes` significantly:
→ Some transform in pixelsToImageEvents is creating new notes without spread (lost _paintPc)
→ Audit: look for `.push({m:..., v:..., durMs:...})` patterns without spread in `02-draw.jsx` between lines 11000-12000
→ Check ARPEGGIO pass (line ~11904), TREMOLO pass (line ~11942), velocity multipliers (line ~12179, 12211)

### If `CAPTURE` shows healthy but `RE-ATTACH` shows `notesMatched << totalNotesIterated`:
→ MIDI round-trip is changing note m values
→ Possible reasons:
  - `applyEvents` pre-sorts notes high→low (line 4898) but m values themselves stay
  - parseMidi may re-quantize timing → CWIN grouping in `toChords` might shuffle notes between chords
  - encodeMidi velocity clipping
→ FALLBACK STRATEGY: change re-attach from `m → paintPc` map to **per-chord pc-set matching**. Use chord position only, ignore note-level m identity. Each chord at position i gets the FIRST _paintPc from the corresponding baked chord at position i (or use chord-level paintPc representative).

### If `RE-ATTACH` is healthy but `PAINT` doesn't see `_paintPc`:
→ chord array is being replaced after re-attach (without _paintPc being re-attached again)
→ Look at setChords / chordsRef.current relationship — re-attach modifies cur[i].n IN PLACE which is the same ref as chords state, but a re-render could replace it
→ FIX: have post-load effect call `setChords(prev => {...})` to force commit, instead of in-place mutation

### If everything looks fine but COLOURS ARE STILL WRONG:
→ drawBlock _hasPaintPc branch may not be running (Mosaic in Music? Or specific style?)
→ Verify which artist style is active during test — log `style` in PAINT debug
→ Check `_chordsPaint` array is actually being passed to overlay (re-check the substitutions)

---

## ALTERNATIVE STRATEGY (FALLBACK 4)

If dual-layer approach fundamentally cannot work because per-note m-matching is too fragile through MIDI round-trip:

**Approach 4: Per-chord representative paintPc**
- Store ONE `_paintPc` per chord (the dominant/first source pixel pc), not per note
- Capture: `_imagePaintPcsRef.current = baked.map(c => c.n[0]?._paintPc)` (just an array of numbers)
- Re-attach: `cur[i]._paintPc = maps[i]` (set at chord level, not note level)
- Paint: drawBlock transforms ALL notes in chord to same paintPc (loses per-note differentiation but gets dominant source colour right)
- Overlays read `c._paintPc` directly

This is simpler, more robust to MIDI round-trip, less faithful per-note but more reliable. Mention to user as Plan B if Plan A keeps failing.

---

## BARELINES + DEPLOY DISCIPLINE

- `01-core-head -3 -2 -3`
- `02-draw -7 0 0`
- `05-main -8 0 0` (BUT may have shifted +1 after recent changes — re-validate before commit)
- Validation: `esbuild.transformSync({loader:'jsx'})` + bracket delta check
- Build: `del src\paintiano.jsx && node build-paintiano.js && git add -A && git commit -m "..." && git push origin dev`
- **CRITICAL**: NEVER combine dev + main push commands. NEVER add trailing backslash to branch names.
- Mobile-first user; Windows shell; Slovak terse communication: "ok", "go", "urob", "vráť", "robíš?"

---

## TECHNICAL CONSTRAINTS RECAP

- Pure Image: pixelsToImageEvents may add _paintPc (transparent to Image canvas which uses pixelRef directly; audio reads n.m)
- Pure Music: chord array from parseMidi has no _paintPc → no transform path activates
- Bake propagates _paintPc through tremolo, arpeggio, default
- MIDI encode/decode strips _paintPc (it's not a MIDI field) → vedľajší kanál (`_imagePaintPcsRef`) needed
- See music transfer = only context where _paintPc lives in Music chord array
- BACK handler from Music to Image still uses `_musicFromImageRef` (independent of _imagePaintPcsRef)
- kontra-auto fallback effect bypass uses `_musicFromImageRef.current` (palette stays after See music)

---

## USER PERSONA & WORKING STYLE

- Rasto, CEO digitWin + conceptual artist Raf Fel
- Non-technical, terse Slovak, mobile-first Windows
- Standing rules: never bump footer v2.0, always CRLF, esbuild + bracket validation before delivery, never combine dev+main, no emoji (SVG only), hardcode first then localize
- "Pure Image / Pure Music untouched" is INVIOLABLE. Three reverts already done because earlier attempts broke this.

---

## RESUME PROMPT FOR NEW SESSION

```
Pokracujeme so See music color fidelity bug — Image v Kontra → See music → 
Music canvas v Kontra dava nespravne farby, v Harmony dava spravne (opacne 
nez ma byt). Implementacia dvojvrstvovych chord-ov (n.m audio + n._paintPc paint) 
deployed s debug logmi ale stale nefunguje. Cakam na console screenshot z 
[seemusic-dbg] CAPTURE / RE-ATTACH / PAINT logov aby som videl kde sa retiazka lame.

Precitaj HANDOVER_SEE_MUSIC.md a pripoj sa.
```
