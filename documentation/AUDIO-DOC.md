# Paintiano — Strata zvuku (iOS) — doku pre nový chat

**Pre Rasta · Paintiano PWA · problém sa vracia, tu je celá história riešenia**

---

## 1. SYMPTÓM
iPhone (Chrome aj Safari, aj inkognito): hudba hrá → odídeš do inej appky (napr. Claude) alebo telefón na ~5 s standby → vrátiš sa → ťukneš **Resume/Play** → **ticho**. Predtým pomohol len reload stránky.

---

## 2. OVERENÁ PRÍČINA (nehádaj, toto je potvrdené)
**Známy iOS 18 bug.** Po backgroundingu (~5 s+) iOS zaparkuje AudioContext. Pri návrate sa kontext často vráti ako `state === 'running'`, **ale audio zariadenie je mŕtve**. Preto:
- samotný `resume()` je **no-op** (kontext si myslí že beží → nič nespraví),
- a preto kedysi pomohol len reload.

Zdroje (naštudované, nie odhad): WebKit Bugzilla, Tone.js issues, howler.js #1106, PlayCanvas vlákno (jan 2026).

---

## 3. OVERENÉ RIEŠENIE — `wakeAudio()`
V tape na **Resume/Play** (musí byť **v geste** — iOS honoruje re-acquire len v user geste):

1. Ak `ac.state === 'running'` → urob **explicitný `suspend()` → `resume()` cyklus** (to prinúti iOS znovu získať audio zariadenie).
2. Ak `suspended`/`interrupted` → priamy `resume()`.
3. Potom **silent kick** (1-sample) aby sa device naozaj rozbehol.
4. Pred tým `releaseAll()` — zabráni „tresku" (burst zamrznutých nôt pri prebudení).
5. Ošetrené `InvalidStateError`, throttlované (~400 ms).

**Playback-shift fix:** po re-acquire `unlockAudio` polluje kým `ac.currentTime` reálne nepokročí (cap 350 ms), aby audio a vizuálny scan štartli súčasne (inak sa rozišli).

### DÔLEŽITÉ — čo NEROBIŤ (toto všetko sme skúšali a ZHORŠILO to / destabilizovalo audio, všetko ODSTRÁNENÉ):
- ❌ watchdog (periodická kontrola stavu)
- ❌ analyser node na detekciu ticha
- ❌ rebuild sampler / restart celého kontextu pri každom probléme
- ❌ diagnostický badge
- ❌ akékoľvek agresívne automatické „opravy" mimo gesta

**Lekcia:** najprv naštuduj overené zdroje, potom JEDEN cielený fix v geste. Žiadne brute-force.

---

## 4. KDE TO JE V KÓDE (orientačne — over v aktuálnom dev súbore)
- Funkcia `wakeAudio()` definovaná v `05-main.jsx` (kedysi ~2072-2091, ale riadky sa posunuli — hľadaj `grep -n "wakeAudio" 05-main.jsx`).
- Volá sa pri Play/Resume tape (kedysi ~4887/4890; a v `holdPaused` vetve cez `wakeAudio().then(startPlay)`).
- `unlockAudio` (beží mimo gesta) sa pokúša re-acquire ale flag NEČISTÍ; `wakeAudio` (v geste) robí ten skutočný suspend→resume.
- `audioWasHiddenRef` flag sa nastaví pri backgroundingu (visibilitychange / onHide).

Pri diagnostike vždy najprv:
```
grep -n "wakeAudio" 05-main.jsx
grep -n "wakeAudio()" 05-main.jsx        # call sites
grep -n "visibilitychange\|audioWasHidden\|holdPaused\|releaseAll" 05-main.jsx
```

---

## 5. PREČO SA TO VRACIA — najpravdepodobnejšia príčina (POZOR!)
**Fix sa opakovane „strácal" pretože sa nasadil starý build / staré fragmenty.** Niekoľkokrát sa stalo:
- lokálne kópie fragmentov na disku zaostávali za opravenou verziou,
- batch upload ticho prepísal opravený kód starým,
- alebo sa nezbuildovalo (`node build-paintiano.js`) po zmene fragmentu → nasadil sa starý `paintiano.jsx`.

**Preto keď zvuk znova padá, NAJPRV over že wakeAudio fix je naozaj v nasadenom kóde:**
1. Otvor aktuálny dev `05-main.jsx`, `grep -n "wakeAudio" 05-main.jsx` — musí existovať definícia + volania.
2. Over že na dev/produkcii beží build ktorý ten kód obsahuje (footer build hash).
3. Ak fix v kóde JE a aj tak padá → môže byť nová iOS verzia / nový scenár → diagnostikovať nanovo (ale stále: jeden cielený in-gesture fix, žiadny watchdog).

---

## 6. ČO POTREBUJEM V NOVOM CHATE NA RIEŠENIE
- **Aktuálny dev `05-main.jsx`** (kvôli wakeAudio + tap handlerom).
- Presný scenár kedy padá: hrá → odídem / standby koľko s → vrátim sa → Resume → ticho? (potvrdiť či presne ten istý scenár, alebo nový — napr. padá aj bez backgroundingu, alebo hneď pri prvom Play).
- Či Resume/Play zvuk vráti, alebo pomôže až reload.
- Dev preview alebo ostrá paintiano.app?

---

## 7. DEV WORKFLOW PRIPOMIENKA
Fragmenty `src/paintiano/` → `node check-paintiano.js` → `node build-paintiano.js` → deploy dev→main cez `git reset --hard dev`. Validácia: esbuild JSX parse OK + bracket balance vs upload. Footer v2.0 kým nepotvrdíš bump. **Vždy pracovať z čerstvo nahraných dev súborov — toto je presne ten dôvod prečo sa audio fix „stratil".**
