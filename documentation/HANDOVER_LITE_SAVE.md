# PAINTIANO HANDOVER — Lite Save / Play chip / Header center
*Session end: 29 Jun 2026. Continue from clean conversation.*

---

## 1. WHO / WHERE

**Rasto** (Mgr. Rastislav Ďurica), sole dev, terse Slovak. Repo:
- Local: `C:\Users\RastoDurica\Desktop\paintiano-pwa`
- GitHub: `RastoDee/paintiano` → Vercel
- Dev preview: `paintiano-git-dev-rasto-dee-s-projects.vercel.app`
- Production: `paintiano.app`
- **Product Hunt launch: Wed 8 Jul 2026 09:00 CET** (10 days)
- Launch video: `https://youtu.be/UuupsSWRXNY`

**Source fragments** (in this Claude environment at `/home/claude/work/`, copied from read-only `/mnt/user-data/uploads/`):
`01-core-head.jsx` · `02-draw.jsx` (~13400 lines) · `03-i18n.jsx` (9 langs) · `04-songs.jsx` · `05-main.jsx` (~13500 lines) · `06-demo-reel.jsx` · `07-pro.jsx`

Build: `node build-paintiano.js` concatenates these → `src/paintiano.jsx` → Vite.

---

## 2. MANDATORY VALIDATION (every edit, no exceptions)

```bash
# 1. esbuild JSX parse PER changed file
node -e "const e=require('esbuild'),fs=require('fs');try{e.transformSync(fs.readFileSync('FILE.jsx','utf8'),{loader:'jsx'});console.log('OK');}catch(x){console.log('FAIL',x.errors&&x.errors[0].location.line,x.errors&&x.errors[0].text);}"

# 2. Bracket-balance baselines (paren, brace, bracket delta)
#    05-main:     (-8,  0,  0)
#    02-draw:     (-7,  0,  0)
#    01-core-head:(-3, -2, -3)
#    03-i18n:     ( 0,  0,  0)
#    04-songs:    (-4,  0,  0)
python3 -c "
def bal(p):
    s=open(p,encoding='utf-8').read()
    return s.count('(')-s.count(')'),s.count('{')-s.count('}'),s.count('[')-s.count(']')
print(bal('FILE.jsx'))
"

# 3. CRLF enforce
python3 -c "d=open('FILE.jsx','rb').read().replace(b'\r\n',b'\n').replace(b'\n',b'\r\n');open('FILE.jsx','wb').write(d)"

# 4. FULL CONCAT esbuild check
cat 01-core-head.jsx 02-draw.jsx 03-i18n.jsx 04-songs.jsx 05-main.jsx 06-demo-reel.jsx 07-pro.jsx > /tmp/_full.jsx
node -e "const e=require('esbuild'),fs=require('fs');try{e.transformSync(fs.readFileSync('/tmp/_full.jsx','utf8'),{loader:'jsx'});console.log('FULL CONCAT OK');}catch(x){console.log('FAIL',x.errors&&x.errors[0].location.line);}"

# 5. cp to outputs + present_files
cp FILE.jsx /mnt/user-data/outputs/FILE.jsx
```

**NEVER auto-bump footer (v2.2) — always ask y/n.**

---

## 3. DEPLOY PROCEDURE (Rasto runs locally)

**Dev only** (testing):
```cmd
del src\paintiano.jsx
node check-paintiano.js
node build-paintiano.js
git add -A
git commit -m "..."
git push origin dev
```

**Promote to main** (only after Rasto confirms dev OK):
```cmd
git checkout main
git reset --hard dev
git push origin main
git checkout dev
```

**Never combine dev+main pushes. Never use cp commands locally.**

---

## 4. CRITICAL ARCHITECTURE FACTS (learned this session)

### 4.1 Lite root is FLEX, not grid
```css
.pf-app-root.pf-mode-lite {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
}
```
**`grid-area: header` etc. are NO-OP in Lite.** Don't waste time on grid-based fixes for Lite layout.

### 4.2 Header element structure
- `<header>` (05-main.jsx ~10092) is **direct child** of `.pf-app-root`
- Selector `.pf-app-root > header` works
- Children: `<h1>` (Paintiano) + conditional `<div>` (subtitle wrapper)

### 4.3 Header > div has Advanced-only transform
```css
/* Base CSS, line ~388: */
.pf-app-root > header > div {
  display: inline-flex !important;
  transform: scale(.82);
  transform-origin: left center;   /* ← drags content LEFT */
}
```
This is intentional for Advanced (compact header overlaying topbar). In Lite **must be reset**:
```css
.pf-app-root.pf-mode-lite > header > div {
  transform: none !important;
  transform-origin: center center !important;
  display: flex !important;
  pointer-events: auto !important;
}
```
**This was THE root cause of "Paintiano not centered" on desktop/landscape.** Fixed now.

### 4.4 Lite image playback trigger
**`loadImage` (05-main.jsx ~6909)** is the real trigger that starts Lite image playback — NOT `basicAutoStart` (which is blocked by `disp>0` guard once image renders).

```javascript
// In loadImage, Lite image branch:
if(basicModeRef.current && liteImageModeRef.current){
  try{ setMuted(false); }catch(_){}
  try{ setRecBlob(null); setRecName(''); setRecordIntent('picker'); }catch(_){}
  setTimeout(()=>{
    wakeAudio().then(()=>{ startRecordRef.current?.(); })
              .catch(()=>{ startRecordRef.current?.(); });
  }, 160);
}
```

### 4.5 startRecordRef pattern (avoids stale closure)
- `startRecord` is **plain function** (~8334), not useCallback
- Guard: `if(!chords.length||recording||playing) return;`
- `loadImage` (~6778) is `useCallback` defined BEFORE startRecord → direct call captures **stale closure** where `chords.length===0` → guard always returns
- Fix: `startRecordRef = useRef(null)` (~3246) + `useEffect(()=>{startRecordRef.current=startRecord;})` (~8393)
- loadImage calls `startRecordRef.current?.()` — always current closure

### 4.6 Mid button state machine (Lite image)
```javascript
const _liteImg = basicMode && liteImageMode;
const _liteImgRecording = _liteImg && recording;       // → Stop icon
const _liteImgHasRec = _liteImg && !recording && !!recBlob;  // → Save icon
```
- Auto-stop effect (~8283) handles natural end: `playing→false` during recording + `playStartedDuringRecRef` → 700ms tail → `r.stop()` → recBlob ready → Save state.

### 4.7 Lite image Save share/download (final robust version)
Mobile = share sheet, Desktop = download fallback:
```javascript
if(_liteImgHasRec){
  const f = new File([recBlob], recName||'paintiano.m4a', {type:recBlob.type||'audio/mp4'});
  const _dl = ()=>{ /* blob URL + anchor click download */ };
  if(navigator.share && navigator.canShare && navigator.canShare({files:[f]})){
    navigator.share({files:[f],title:'Paintiano audio'}).catch(()=>{ _dl(); });
  } else {
    _dl();
  }
  return;
}
```
Desktop Chrome: `canShare({files})===false` → download. Mobile: share sheet.

### 4.8 Lite refs cheat sheet
- `basicModeRef`, `liteImageModeRef` — current mode
- `liteEverUnlockedRef` — **permanent** unlock (never reset by statechange)
- `basicTapUnlockedRef` — re-armed by statechange (for context recovery)
- `liteFlipJustRef` — flip-just-happened guard (650ms settle vs 120ms normal)
- `liteAwaitTapRef` — always false (splash removed)
- `playStartedDuringRecRef` — guards auto-stop spurious early-trigger
- `startRecordRef`, `startPlayRef` — current-render function references

---

## 5. DONE THIS SESSION (deployed)

1. **Lite Play chip (Variant G)** — big gold play disc on empty Lite Music canvas. `litePlayStart` useCallback (~7676): mic stop, setMuted(false), Mosaic, harmony mode, set both unlock refs, loadSampleMidi, 120ms wakeAudio→startPlay. Chip render moved OUTSIDE `{isActiveView && ...}` block. Hidden Help FAB (`?`) in Lite.
2. **Stray-tap guard** — basicTapUnlock returns early if not in image/active state (menu/lang taps don't consume unlock). Autoplay LOAD effect gated by `liteEverUnlockedRef`.
3. **Persistence bug fixed** — `paintiano_onboarded='1'` localStorage write moved BEFORE the audio-unlock guard.
4. **Lite flip crackle 3-layer fix** — (a) immediate stopAll on flip, (b) liteFlipJustRef → 650ms delayed restart, (c) **`Tone.getDestination().mute = true`** on flip hard-mutes release tail.
5. **Lite desktop flip clickable + header column** — `.pf-app-root.pf-mode-lite > header { flex-direction: column; pointer-events: auto }`.
6. **Pro AI badge hidden in Lite** — `{isPro && !basicMode && ...ProBadge}`.
7. **Hyper-modern SVG icons replacing emoji** — `_icoShuffle, _icoPlay, _icoPause, _icoSave, _icoWave, _icoPic, _icoFile, _icoMic, _icoSample, _icoStop`. Inherit color via `currentColor`. `_midLabel` rewritten as JSX fragments. Mockup at `/mnt/user-data/outputs/cta-icons-mockup.html` (no longer needed).
8. **"Grand piano" subtitle hidden in Lite** — `{!isActiveView && !isDesktop && !basicMode && ...pianoLabel}`.
9. **CTA disabled in Play chip state** — added `_litePlayChipShown` variable (same condition as chip render). Disabled + opacity .5 on Surprise (`Prekvap ma`), mid button (`prehrať`), Use my song, Use my picture.
10. **Red Stop removed from Lite** — `_capturing && !basicMode` for red background. Lite uses decent gold/cream btn style for Stop.
11. **Advanced image Clear bug fixed** — `clearCanvas` image branch now `setRecBlob(null); setRecName(''); setRecordIntent(null); setAudioRowOpen(false); setAudioSideImage(null)` → REC button returns to default dock (was stuck as "Uložiť"). Image stays for re-scan.
12. **Lite image Save LIVE RECORD** — `loadImage` calls `startRecordRef.current()` instead of `startPlayRef.current()` for Lite image. Plays + records simultaneously (like Advanced REC). Stop button (during recording) → recBlob → Save button → share/download.
13. **Use my song/picture opacity fix** — was disabled but visually full color. Added `opacity:_litePlayChipShown?.5:1`.
14. **Desktop Save fallback** — robust share→download fallback so desktop Chrome (canShare files=false) downloads the audio.
15. **Lite header centering — FINAL FIX** — reset Advanced's `transform: scale(.82) transform-origin: left center` on `header > div` in Lite. This was the root cause for desktop/landscape mis-centering. Mobile-portrait was always OK because mobile-portrait grid override hides this rule or doesn't apply the same way.

---

## 6. PENDING / NEXT TASKS

### 6.1 Paywall stale tier text (07-pro / 03-i18n)
"16 artists (free has 8)" → **"19 artists (free has 9)"** across all 9 languages. Look at 07-pro.jsx tier description strings.

### 6.2 Legal/pricing HTML review (4 files in `/public/`)
- **All 4 files missing Japanese (`ja`) localization** — must add to: `pricing.html`, `privacy.html`, `refunds.html`, `terms.html`
- **`pricing.html` needs full rebuild** to three-card Free / Pro / Pro AI layout
- **`refunds.html`**: add Pro AI line
- **`terms.html` §3.2**: mention two paid tiers
- **`privacy.html`**: looks fine, just add ja
- **Recommendation: fresh conversation for `pricing.html` rebuild**

**Paintiano pricing ground truth (from 07-pro.jsx):**
- Free €0
- Pro €9.99 early-bird → €14.99 (Paddle: `pri_01kt6s053namfk25tvvdw2eaey`)
- Pro AI €19.99 early-bird → €24.99 (Paddle: `pri_01ktkmf6ghq0kk3vkg2dtnjd7q`)
- Trial = 3 AI compositions
- Pro CTA stays "Coming soon" (payment-provider migration — intentional)

### 6.3 Paintiano Book PDFs integration
Print-ready PDFs complete in SK/EN/DE/FR/ES (PT/ZH/ZHTW/JA deferred). Plan:
- `/public/book/` directory + lang-named files
- Nav + footer link opening right-language PDF

### 6.4 AI music gen mood bug
Mood labels generate correctly but music is **nearly identical across moods**. Suspect: mood label not passed into AI music gen prompt. Audit `api/ai-compose.js`.

### 6.5 Mobile app publishing prep
- Bundle ID locked: `app.paintiano.mobile`
- Strategy: free-first, no IAP (defer Apple/Google IAP until web funnel confirms paying users)
- Codemagic for cloud builds (needed for iOS from Windows)
- Apple ID complications (old expired team) + Google Play Console complications (prior terminated account) — resolution paths documented

### 6.6 Optional polish
- Could extend Play chip G to Lite **image** mode too (only built for music→painting currently)

---

## 7. KEY TECHNICAL FACTS (carry-over, still true)

- **ALL_ARTIST_KEYS** (05-main ~1124): mosaicFamily + 19 artists
- **FREE artists (9, A-sides of BASE_STYLE_PAIRS)**: picasso, pollock, kusama, kandinsky, gold (Klimt), bulge (Vasarely), spiral (af Klint), pop (Haring), monet
- **PRO (10)**: matisse, bloom, miro, bauhaus, rothko, wave, arcs, mitchell, hokusai, mondrian
- **chipStyle(on)** — subtle gold selected state, no boxShadow
- **Mosaic is an artist style**, not a palette
- **Canvas / paint pipelines (pure Image, pure Music) MUST NEVER BREAK** — never modify them via transfer/Lite changes
- **Languages (9):** EN DE FR ES PT SK (uppercase) + zh zhTW ja (lowercase). Case matters in i18n keys.
- **i18n: when changing UI text/behavior, always update Concept + Guide text across all 9 langs without being asked**
- **Base64 samples in 03-i18n (~2.1MB)**: leave as-is ("funguje, nechaj tak"). Future plan = move to `/public/` + lazy fetch, but must check PWA service-worker / offline precache first.

---

## 8. iOS AUDIO RECOVERY (RESOLVED, don't re-touch)

`wakeAudio()` in Resume/Play tap does **suspend()→resume() cycle when state is 'running'**, else plain resume(), plus silent kick.

All watchdog/analyser/rebuild approaches **removed**. The split between `liteEverUnlockedRef` (permanent) and `basicTapUnlockedRef` (re-armed by statechange) prevents crackle on canvas tap.

---

## 9. TONE / STYLE (Rasto preferences)

- **Terse Slovak.** "go"/"urob" = execute, "vráť" = revert
- **Immediate execution over planning discussions** — don't theorize, read actual code first then fix
- **No emoji unless he uses them**
- **Read real call sites and computed CSS values before proposing fixes** — don't pattern-match to assumptions. Major lesson from this session: I wasted multiple turns hypothesizing about `basicAutoStart` when the real trigger was `loadImage`; wasted multiple turns hacking header CSS naively before finding the `transform: scale(.82) transform-origin: left` cause.
- He gets frustrated with sloppy work ("urobis nieco dobre na prvykrat?????"). Earn trust by being precise.
- **Mobile-first Windows user** using cmd

---

## 10. RECOVERY PROCEDURE (if env reset)

1. View `/mnt/user-data/uploads/` for latest source files Rasto uploaded
2. Copy to `/home/claude/work/`
3. **Read this file** before any code action
4. Verify baselines match (section 2)
5. Ask Rasto y/n before any footer version bump

---

*End of handover. Continue in fresh chat with this file in context.*
