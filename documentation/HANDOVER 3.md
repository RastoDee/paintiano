# Paintiano — Handover (pokračovanie v novom chate)

**Dátum:** 2026-06-19 · pre Rasta (RafFel), Paintiano PWA

---

## 1. ČO TREBA UROBIŤ HNEĎ NA ZAČIATKU NOVÉHO CHATU

### A) Nahraj aktuálne dev fragmenty (DÔLEŽITÉ)
Môj pracovný `05-main.jsx` z minulého chatu obsahoval **scan-panel redesign z ešte staršej session**, ktorý NEBOL v nahraných súboroch. Preto sa nedalo presne overiť čo beží na dev. **Na začiatku nahraj aktuálne deployed dev súbory** — ideálne všetkých 7 fragmentov z `src/paintiano/`, minimálne ale:
- **`03-i18n.jsx`** ← najnutnejší (kvôli REC emoji, viď bod 2)
- `05-main.jsx` (aktuálny dev)
- `01-core-head.jsx` (aktuálny dev)

Pravidlo (pripomenutie): **vždy pracovať z čerstvo nahraných deployed súborov, nikdy zo stale outputs.**

### B) Otvorená úloha #1 — ⏺️ emoji v REC tlačidle
- **Problém:** v image-scan transporte je pri "REC" navyše ⏺️ emoji (vidno aj keď sa NEnahráva → nie je to iOS indikátor, je to v kóde).
- **Zdroj:** text `t('recArm')` (a možno `t('recStop')`) v `03-i18n.jsx` zrejme obsahuje ⏺️ priamo v stringu. TxIcon už dáva vlastný glyph (kruh), takže emoji v texte je duplicita.
- **Dočasné riešenie (už v outputs):** v `05-main.jsx` riadok ~9731 som pridal `.replace(/[^\p{L} ]/gu,'')` na `t('recStop')` aj `t('recArm')` — emoji to odstráni.
- **Čistá oprava (na zajtra):** keď príde `03-i18n.jsx`, odstrániť ⏺️ priamo z `recArm`/`recStop` vo VŠETKÝCH 9 jazykoch (EN DE FR ES PT SK zh zhTW ja). Potom sa `.replace()` v JSX môže nechať (neškodí) alebo vrátiť.

---

## 2. STAV SÚBOROV
- Deliverables sú v `/mnt/user-data/outputs/`: **`05-main.jsx`** (712 KB) + **`01-core-head.jsx`** (64 KB).
- Oba validné (esbuild JSX parse OK, bracket balance OK voči pôvodnému uploadu).
- **POZOR:** tieto outputs sú postavené na STARŠOM upload základe + môj scan redesign. Po nahraní čerstvých dev súborov treba zmeny z minulého chatu (nižšie) buď znova aplikovať na čistý dev základ, alebo overiť že dev už tieto zmeny obsahuje. Najbezpečnejšie: nahrať dev, diffnúť, doplniť chýbajúce.

---

## 3. DEV WORKFLOW (nemení sa)
Fragmenty v `src/paintiano/` (7): 01-core-head, 02-draw, 03-i18n, 04-songs, 05-main, 06-demo-reel, 07-pro.
Build: `node check-paintiano.js` → `node build-paintiano.js` → deploy dev→main cez `git reset --hard dev` (NIKDY merge). Footer zostáva v2.0 kým Rasto nepotvrdí bump.

**Validácia každý krok (povinné):**
- esbuild: `npx --yes esbuild@0.21.5 X.jsx --bundle=false --loader:.jsx=jsx --outfile=/dev/null` → hľadaj „⚡ Done" („npm error config prefix" warning je neškodný)
- bracket self-balance vs upload: delty `{`−`}` a `(`−`)` sa musia zhodovať s pôvodným súborom

Nasadenie:
```
node check-paintiano.js
node build-paintiano.js
git checkout dev && git add -A && git commit -m "..." && git push origin dev
```
Test na dev: `paintiano-git-dev-rasto-dee-s-projects.vercel.app/play` (build hash vo footeri + `?v=` v URL — over že sa zmenil, občas stale build).

---

## 4. KRITICKÉ PRAVIDLO — MOBILE
**Mobile <769px MUSÍ zostať nedotknutý.** Všetky desktop zmeny IBA v `@media (min-width: 769px)` (v 01-core-head `PF_STYLE`) alebo za `isDesktop`/`immersive` JS guardmi.
- `isDesktop` je v hlavnom scope (definovaný ~riadok 887 v 05-main), dostupný v render JSX.
- **Lekcia z včera:** scan-panel redesign z minulej session menil JSX na `flexDirection:column`+`width:100%` a spoliehal sa na desktop `display:contents` CSS → na MOBILE sa to roztiahlo (SCAN/AI COMPOSE cez celú šírku pod sebou, scan smery v stĺpci). Opravené cez `isDesktop` ternary priamo v JSX (viď nižšie).

---

## 5. ČO SA SPRAVILO V MINULOM CHATE (všetko v outputs)

### Desktop trojstĺpec (≥769px) — z predošlých sessions, beží:
Grid `.pf-app-root`: stĺpce `180px minmax(0,1fr) 180px`. Ľavý = transport+palety, stred = canvas, pravý = progress+umelci. Topbar z-index 99999 inline. Mode-flag classy na roote: `pf-mode-live`, `pf-mode-imagescan`, `pf-mode-setup`, `pf-immersive`.

### Hotové včera (validované, v outputs):
1. **Picker exkluzivita** — 4 useEffecty (~4357 v 05-main): otvorenie ktoréhokoľvek pickera (pickMode / showMoodMenu / showComposeRecent / showMicRecent) zavrie ostatné. Rieši prekrývanie v pravom stĺpci. Funguje mobile aj desktop.
2. **Hover na zdrojových dlaždiciach** (01-core-head ~63-70): Music/Image/Mood/MFI/Compose/Mic — len lift + jemný farebný glow (žiadne vyfarbenie pozadia). Farby: Music modrá, Image **oranžová** (oprava z chybnej zelenej), Mood zlatá, MFI fialová, Compose zelená, Mic ružová.
   - **Compose fix:** Compose má inline `boxShadow:'none'` → CSS `:hover` box-shadow potreboval `!important` aby ho prebil. Pridané `!important` na hover box-shadow všetkých týchto tried.
   - Pridaná `transition:all .18s` na `.pf-midi,.pf-audio,.pf-score,.pf-image,.pf-compose,.pf-mic,.pf-moodtile,.pf-mfitile`.
   - Mood/MFI dlaždice dostali triedy `pf-moodtile`/`pf-mfitile` (~7622/7630).
3. **+ NEW source tlačidlá vyfarbené podľa módu, jemne** (~7843 music/image, ~7858 mood): DARK pozadie `rgba(28,24,40,.5)` + jemný farebný text + jemný okraj (.3 alpha) — ako MFI štýl (nie agresívne farebné pozadie). Music=modrá, Image=oranžová, Mood=zlatá, MFI=fialová (už bola).
4. **SETUP modál — 3-stĺpec desktop** (showSetupModal ~10233 v 05-main; CSS v 01-core-head media query): PALETTES vľavo (1. stĺpec), prázdny stred, ARTISTS vpravo (3. stĺpec), DONE vľavo dole (spodná hrana zarovnaná s posledným artistom). Triedy: `pf-setup-dialog` (max-width 860px), `pf-setup-body` (grid 1fr 1fr 1fr, areas "pal mid art"), `pf-setup-palettes`, `pf-setup-artists`, `pf-setup-grid` (single col), `pf-setup-done` (duplikát DONE v ľavom stĺpci, `display:none` inline → desktop `display:flex; margin-top:auto`), `pf-setup-footer` (skrytý na desktope). Mobile = pôvodný stacked.
5. **Concept/Book/Guide — dvojpalcový desktop** (zdieľaný `GuideModal` komponent ~183; CSS v media query): progress prúžky VĽAVO (zvislé), karta v strede, kategórie VPRAVO (zvislý zoznam — len Guide; Concept/Book ich nemajú → prázdne), nav ˄ vľavo dole / ˅ vpravo dole + "X / Y" v strede. Triedy: `pf-guide-panel` (max-width 920px), `pf-guide-cats` (kategórie → pravý zvislý stĺpec), `pf-guide-progress` (→ left), `pf-guide-nav` (nový blok, `display:none` inline → desktop flex, ˄/˅ tlačidlá cez `jumpTo(currentIdx±1)`, `pf-guide-nav-prev/-pos/-next`). Karta dostáva `padding-left:80px; padding-right:170px` aby sedela medzi progress a kategóriami. Swipe/scroll/klávesnica fungujú ďalej. Mobile = úzky swipe deck.
6. **MOBILE SCAN PANEL FIX** (najdôležitejšie včera) — image-scan ovládací panel sa na mobile roztiahol kvôli scan redesignu. Opravené cez `isDesktop` ternary v 05-main JSX:
   - Reading toggle (SCAN/AI COMPOSE) ~8171: kontajner `flexDirection:isDesktop?'column':'row'`; tlačidlá `flex:isDesktop?undefined:1, width:isDesktop?'100%':undefined` → mobile vedľa seba, desktop stĺpec.
   - Scan direction (ROWS/COLUMNS/SPIRAL IN/OUT) ~8180: `isDesktop?{flex column}:{grid repeat(4,1fr)}`; tlačidlá `width:isDesktop?'100%':undefined` → mobile mriežka, desktop stĺpec.
   - "READING" label ~8170: `{isDesktop && <div>...}` → skrytý na mobile (pôvodne tam nebol), zobrazený len desktop.

### Skôr hotové (staršie sessions, bežia na dev):
fullscreen ovládače (HARMONY/NEXT/SHOW/SAVE) v čiernom vpravo od canvasu (`pf-fs-controls`, inline pozícia podľa canvas CW/CH); všetky pickery v pravom stĺpci (`pf-picker-overlay`/`-dialog`, recent/mood tiež) — `position:absolute` nie fixed (kvôli zarovnaniu k centrovanému roote); footer+legal dole (`pf-version-footer`/`pf-legal-links`); mood thumbnail centrovaný nad canvasom; help (?) FAB z-index fix (100001, absolute); MFI „+ NEW image" sa zobrazí hneď (`setLoadedSource(null)` v composeFromImage).

---

## 6. PENDING / BACKLOG
- **REC ⏺️ emoji** — čistá oprava v 03-i18n (viď bod 1B). [NAJBLIŽŠIE]
- `pickSourceHint` i18n cez 9 jazykov (rozšírený source hint — spomína všetkých 5 zdrojov).
- `proValueArtists` tier text fix (16→18, 8→9) v 07-pro/03-i18n cez 9 jazykov — samostatná úloha.
- pricing.html prestavba na 3 karty Free/Pro/Pro AI + japončina do všetkých 4 legal HTML — dlhodobý backlog.
- Paintiano Book PDF integrácia do appky (/public/book/ + nav link) — budúca úloha.

---

## 7. RECURRING LEKCIE / ENVIRONMENT
- CSS `>` (priamy potomok) ticho zlyhá pri hlboko vnorených elementoch — používaj descendant (medzera). `grid-area` funguje len na PRIAMYCH grid potomkoch — hlboké elementy potrebujú `position:absolute`.
- `position:fixed` sa kotví na OKNO (zle na širokých obrazovkách s centrovaným #root); `position:absolute` na potomkovi positioned `pf-app-root` sa kotví na centrovaný stĺpec — pre pickery/overlays čo musia sedieť k stĺpcom použi absolute.
- Inline `boxShadow:'none'` (a akýkoľvek inline style) PREBÍJA CSS `:hover` — použi `!important` v hover pravidle.
- z-index: topbar=99999 inline, pickery=100002, help modal=100000, help FAB=100001.
- Keď je problém „aj na mobile", je to zdieľaná logika nie desktop CSS.
- Rasto často chce MOCKUP (visualize show_widget) schválený pred kódom — najmä pri layout/vizuálnych zmenách. Pri vertikálnej (tik-tok) navigácii chce nav tlačidlá rozdelené do ľavého+pravého dolného rohu (jedno pre každý palec), progress na jednej strane, kategórie na druhej. Mysli na tablety/touch PC (swipe ostáva, ovládanie dvojpalcové).

---

## 8. KONTEXT O POUŽÍVATEĽOVI
Rasto (RafFel), CEO digitWin, konceptuálny umelec za Paintiano (paintiano.app) — PWA prekladajúca hudbu→zlatý-rez (φ=1.618) farebné maľby deterministicky. Komunikuje stručne po slovensky, mobile-first na Windows, chce okamžitú realizáciu, frustruje ho opakovanie chýb alebo žiadosti o screenshoty namiesto opráv. 9 jazykov (EN DE FR ES PT SK veľké; zh zhTW ja malé), 18 maliarov.
