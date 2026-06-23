# PAINTIANO LAUNCH HAND-OVER
*Pripravené 23. júna 2026 pre launch v stredu 8. júla 2026, 09:00 CET*

> **Ako to použiť:** vlož celý tento súbor na začiatok novej Claude konverzácie. Pomôže novej session okamžite pochopiť kontext a pokračovať bez vysvetľovania.

---

## 1 · KTO SOM A ČO ROBÍM

**Rasto Ďurica** (Mgr. Rastislav Ďurica) — sólo developer Paintiano PWA.
- Konceptuálny umelec pod menom **Raf Fel**
- CEO digitWin s.r.o. (Bratislava) — paralelný biznis, NIE súvisí s Paintiano
- Komunikujem **terse, po slovensky**, pracujem mobile-first na Windowse
- Skratky: „go/urob/ok go" = vykonať, „vráť/daj naspäť" = revert, „robíš?" = áno, vykonaj teraz

## 2 · ČO JE PAINTIANO

PWA, ktorá deterministicky premieňa hudbu na maľbu na gride zlatého rezu. Tá istá pieseň = tá istá maľba, zakaždým. Nie náhodný vizualizér.

**URL:** paintiano.app (landing), paintiano.app/play (appka)
**Stack:** Vite + React 18, vite-plugin-pwa, Paddle Billing (live), PostHog EU (live), deploy na Vercel
**Repo:** `C:\Users\RastoDurica\Desktop\paintiano-pwa`, vetva `dev` → `main` (Vercel auto-deploy z main)

**Monetizácia (jednorazové platby, žiadne predplatné):**
- Free €0 — 9 umelcov, core farby, 3 AI trial kompozície
- Pro €9.99 (early-bird, neskôr €14.99) — všetkých 18 umelcov + 3 mozaiky, full-res export
- Pro AI €19.99 (early-bird, neskôr €24.99) — Pro + neobmedzené AI kompozície

## 3 · ČO JE HOTOVÉ A NASADENÉ

### Landing (paintiano.app)
- Hero: „Your favorite song, **made to keep.**"
- Sekcie v poradí: Hero → How it works (Three steps. One painting.) → What people make (4 use cases: walls/gift/musicians/feeling) → From the gallery (3 reálne diela: Pollock×Debussy, Riley×hummed melody, Kusama×warm dusk) → **Off the screen** (mockupy: gallery-wall, framed-wall, album cover, edition poster) → Pricing (3-tier, pay-once) → Reason-to-believe (Newton/Scriabin/φ) → Made with Paintiano proof → Final CTA
- **Lokalizovaný na 9 jazykov:** EN, SK, DE, FR, ES, PT, ZH (simplified), ZHTW (traditional), JA. Prepínač vpravo hore + auto-detekcia z `navigator.language`. EN je inline (SEO), ostatné cez data-i18n + JS slovník v `index.html`. „Early bird" badge vo všetkých jazykoch po anglicky (brandový termín).
- Footer **v2.2**

### Appka (paintiano.app/play)
- 18 umelcov + 3 mosaic families
- Chipy na zdrojovom screen (mood/compose/mic/mood-from-image/music/image) — **väčšie** na desktope + tablete (oba režimy), mobil nedotknutý
- Cookieless PostHog wired: `landing_cta_click`, `first_creation`, `paywall_shown`, `checkout_opened`, `purchase_return`
- Paddle Billing live (production token `live_3ab34fef52eea1baa3656517dec`, paddleEnv 'production'). Pro `pri_01kt6s053namfk25tvvdw2eaey`, Pro AI `pri_01ktkmf6ghq0kk3vkg2dtnjd7q`. `checkoutDisabled: false`.
- AI trial: `trialMax: 3` (Free + Pro zdieľajú 3 AI kompozície, Pro AI = unlimited)
- SW: `registerType: 'autoUpdate' + skipWaiting + clientsClaim` — background refresh pri ďalších deployoch funguje

### Marketing assets (lokálne na disku, NIE deploynuté)
- **5 PH gallery cards** (PNG, 2540×1520): `ph_card1_hero`, `ph_card2_how`, `ph_card3_why`, `ph_card4_pricing` (Pro AI = Unlimited AI), `ph_card5_styles` (Pick your painter)
- **Video** `paintiano-demo2-muted.mp4` — 20s, landscape, čistá appka maľujúca Liszt v Kandinsky štýle. Nahrané na YouTube **unlisted**: `https://youtu.be/UuupsSWRXNY`
- **GIF** `paintiano-demo2-end.gif` — 8s loop, končí oranžovým objektom
- **Mockupy:** `mock-gallery-wall.jpg`, `mock-framed-wall.jpg`, `mock-album.jpg`, `mock-poster.jpg` (Riley edition print)

### PostHog meranie (live, EU)
- Project API key: `phc_opy7KxSYp4vXsGGJBaGo4zzeCUn6hcmdWGUTxxEr2jXD`
- Host: `https://eu.i.posthog.com`
- Cookieless (`persistence: 'memory'`) — žiadny banner
- 2 lieviky uložené:
  - **„Landing → app"**: $pageview (Path name = /) → landing_cta_click
  - **„App → checkout"**: $pageview (Path name = /play) → first_creation → paywall_shown → checkout_opened
- Session Replay = Enabled

## 4 · PRODUCT HUNT — STAV DRAFTU

**Status:** Draft uložený, **scheduled na Wed Jul 8 2026, 09:00 CET** (= 00:01 PT, Required = 100% complete)

### Listing
- **Name:** Paintiano
- **Tagline:** `Turn any song into a one-of-a-kind painting`
- **Description (≤260):** `Drop in a song, MIDI or audio — Paintiano paints it note for note on a golden-ratio grid, the same painting every time. Not a random visualizer: a real translation of music into colour. Watch it paint as it plays, then keep the artwork. Free to try.`
- **Website:** `https://paintiano.app` (smeruje na landing, NIE /play)
- **Topics:** Design Tools · Music · Art
- **Pricing label:** Freemium
- **Connect with Investors:** preskočené (nie cieľ launchu)

### Galéria (poradie médií)
1. ph_card1_hero (thumbnail vo feede)
2. GIF (paintiano-demo2-end.gif, animovaný náhľad)
3. ph_card5_styles (Pick your painter)
4. ph_card2_how (How it works)
5. ph_card3_why (Why it's different)
6. ph_card4_pricing
- **Plus video v Extras → Video / Loom:** `https://youtu.be/UuupsSWRXNY` (unlisted YouTube)

> Pozn: `mock-gallery-wall.jpg` zámerne NIE je v PH galérii — opakoval by trojicu z card5. Je len na landingu.

### Shoutouts (s notes)
- **Vercel** — „Zero-config deploys, instant preview URLs, and painless rewrites for a multi-entry Vite app."
- **Paddle** — „Merchant of record — handles EU VAT, checkout and licence keys so a solo maker doesn't have to."
- **React** — „Fast, component-driven UI for a complex canvas app — the whole interactive front end runs on it."
- **PostHog** — „Cookieless, EU-hosted, with funnels and session replay on the free tier — perfect for an indie launch."

### First comment (paste hneď po spustení, NIE do draftu)
```
Hi Product Hunt 👋 I'm Raf — I make conceptual art, and for years I wanted to actually see music, not just hear it.

Paintiano is my answer. Drop in a song (or MIDI, audio, even a typed song name) and it paints — every note, key and chord mapped to a colour on a golden-ratio grid. The key thing: it's deterministic. The same song always makes the same painting. It's not a random audio visualizer — it's a fixed translation system, built on old ideas about colour and music (Newton's colour wheel, Scriabin's clavier à lumières) and the golden ratio φ.

You watch it paint in real time as the music plays, then keep the artwork — print it, gift it, hang it on a wall. There's a free tier to just play, and a Pro AI layer that adds atmosphere from a mood or a photo.

I built and shipped the whole thing solo. Would genuinely love your feedback — especially: what song did you try first, and did the painting feel like it?
```

## 5 · LAUNCH-DEŇ RUNBOOK (streda 8. júla 2026, CET)

### Deň pred (utorok 7.7.)
- [ ] Posledná kontrola: dev = main, landing na paintiano.app reflektuje všetky zmeny
- [ ] Pripraviť **rozosielací zoznam 10–20 ľudí**, ktorým v deň D pošleš osobné DM
- [ ] Otvoriť PostHog na druhej obrazovke (sleduješ Live + lievik počas dňa)
- [ ] **Zmeniť YouTube video z Unlisted na Public** (pomôže organickému traffiku, voliteľné)
- [ ] Skopírovať first comment do clipboard / poznámok
- [ ] Pripraviť SK posty zo súboru `paintiano-social-SK.md` (X, IG/TikTok, LinkedIn, FB, DM šablóny — len doplniť PH link v deň D)
- [ ] Spať pred 23:00 — dlhý deň

### Launch deň — hodinu po hodine
- **09:00 CET** — PH listing pôjde live automaticky (scheduled). Otvor producthunt.com/posts/paintiano. Over, že je verejný.
- **09:01** — Vlož **first comment** (vyššie ↑). Vlož ho z účtu makera (ty).
- **09:05** — Hoď SK posty: X / Threads, Instagram, LinkedIn, FB. Personalizované DM 10–20 ľuďom (link + „skús a daj feedback, nepýtam upvote").
- **09:30 a celý doobeda** — **Buď v komentoch.** Odpoveď na **každý** komentár do 5 minút. Pýtaj sa každého: *„Akú pieseň si skúsil a sedela maľba?"*
- **13:00 CET** — Druhý social push. Zdieľaj najlepší user output dňa (ak nejaký prišiel) alebo screenshot tvojho funnelu v PostHog s „launching now — here's how it's going".
- **18:00 CET** — Post v 1–2 komunitách (Reddit r/SideProject, IG story, kde si aktívny).
- **21:00 CET** — „Ďakujem + kde sme" update post. Zdieľaj číslo (pageviews, počet diel z PostHog).
- **CELÝ DEŇ:** NIKDE nepýtaj upvoty. Vždy „skús + feedback". PH penalizuje upvote-brigading.

### Deň po (9.7.)
- [ ] Pozri **funnel v PostHog** — najväčší % prepad = úzke hrdlo na opravu
- [ ] **Session Replay** na drop-off kroku — uvidíš *prečo* ľudia odchádzajú
- [ ] Poďakuj všetkým komentárom a tým čo zdieľali
- [ ] Najlepšie reálne diela od users → kandidáti do „Made with Paintiano" sekcie na landing

## 6 · KRITICKÉ TECHNICKÉ DETAILY

### Build pipeline (kľúčové!)
- Source: 7 JSX fragments v `src/paintiano/` (`01-core-head.jsx`, `02-draw.jsx`, `03-i18n.jsx`, `04-songs.jsx`, `05-main.jsx`, `06-demo-reel.jsx`, `07-pro.jsx`)
- Build: `node build-paintiano.js` → spojí fragmenty do `src/paintiano.jsx` (CRLF)
- Pre-deploy check: `node check-paintiano.js`
- **POZOR:** Po zmene fragmentu **VŽDY** `del src\paintiano.jsx` PRED buildom (jeden bug v build pipeline ináč držal cached výstup — strávili sme tým hodinu)

### Footer verzia
- **v2.2** — NEZVYŠOVAŤ bez y/n potvrdenia. Pravidlo: nikdy auto-bump.

### Validácia po každom edite
- `npx esbuild@0.21.5 <fragment>.jsx --bundle=false --loader:.jsx=jsx --outfile=/dev/null` → musí byť „⚡ Done"
- 05-main bracket balance: musí byť `-8 0 0` (open-close `( {` `[` zostatky)
- 01-core-head: `-3 -2 -3`
- 02-draw: `-2 0 0`

### Deploy postup (Windows cmd)
```
del src\paintiano.jsx
node check-paintiano.js
node build-paintiano.js
git add -A
git commit -m "..."
git push origin dev
```

Otestuj na dev preview (auto-deployed by Vercel), potom promo na main:
```
git checkout main && git reset --hard dev && git push origin main && git checkout dev
```

⚠️ `reset --hard dev` pošle **celý stav dev** na main. Skontroluj, že na dev je iba to, čo má ísť live.

### vite.config.js dôležité veci
- Multi-entry: `index.html` = landing (no React, no SW), `play.html` = PWA (React + SW)
- SW config: `registerType: 'autoUpdate'`, `skipWaiting: true`, `clientsClaim: true`
- SW globIgnores: `['index.html']` — landing sa NIKDY nepecaheuje SW
- navigateFallbackDenylist: `[/^\/$/, /^\/index\.html/]` — SW nikdy nezachytí navigáciu na root

### vercel.json rewrites
- `/play` → `/play.html`
- `/play/:path*` → `/play.html`
- `/?paid=1` → `/play.html` (Paddle úspešný checkout redirectne sem)

### Pre Rasta — ako landing vidí
Rasto sám landing v normálnom prehliadači **nevidí**, lebo má registrovaný starý SW so scope `/` z čias keď appka bežala na roote. Pre TESTOVANIE landingu Rasto musí použiť **inkognito** alebo cez DevTools → Application → Service Workers → Unregister + Clear site data. Pre nových návštevníkov sa landing zobrazuje normálne.

## 7 · ČO NIE JE HOTOVÉ (post-launch backlog)

- **Webhook purchase event** (server-side v `/api/paddle-webhook` cez `posthog-node`) — tvoje skutočné „paid" číslo, imúnne voči ad-blockerom. Rasto má zatiaľ len `purchase_return` (klientsky signal po Paddle redirect).
- **CJK native spot-check** (ZH/ZHTW/JA na landing) — preklady sú solídne ale rodený hovoriaci by ich doladil pred väčším launchom v Ázii.
- **Pricing/refunds.html/terms.html review** — Pricing 3-card layout, ja-jazyk chýba v 4 legal HTML súboroch v `public/`.
- **Paintiano book PDF integration** do appky (zložka `/public/book/` existuje).
- **PT/ZH/ZHTW/JA book editions** — len SK/EN/DE/FR/ES sú hotové (z `sk_content.json`, 241 jednotiek).
- **Mobile app publish** (bundle `app.paintiano.mobile`, Codemagic, Apple Developer enrollment).
- **B3 — Content/Reddit plán** (po launchi) — komunity, posty, rytmus Reels pre kompoundovaný traffic.

## 8 · DÔLEŽITÉ PRAVIDLÁ KOMUNIKÁCIE PRE NOVÚ SESSION

1. **NIKDY auto-bump footer verziu** bez y/n
2. **VŽDY validuj** (esbuild + bracket balance) po každom JSX edite
3. **Dodávaj len zmenené súbory** do `/mnt/user-data/outputs/`, neutekaj cele moduly
4. **Mobil < 769px byte-for-byte unchanged** pokial Rasto explicitne nepovie inak
5. **Pri CSS zmenách: pozor na inline `style={}` v JSX** — má vyššiu prioritu ako CSS triedy, hodnoty treba meniť tam (lekcia z dňa 23.6.)
6. Pred build/deploy debug — **VŽDY `del src\paintiano.jsx`** pre čistý build
7. Rasto je terse — nesnaž sa o dlhé vysvetlenia. Ak potrebuje detail, opýta sa.
8. Pri pádoch („nemá zmysel", „zase nič") — neopravuj naslepo, pýtaj **konkrétne DevTools dáta** alebo `findstr` výstup.

## 9 · OUTPUTS — FAJLY, KTORÉ RASTO MÁ STIAHNUTÉ

V `/mnt/user-data/outputs/` (a teda lokálne v jeho Downloads):
- **`index.html`** (aktuálna lokalizovaná verzia, nasadená)
- **`05-main.jsx`** (s veľkými chipmi, isNotPhone gate)
- **`01-core-head.jsx`**, **`07-pro.jsx`** — predošlé verzie s PostHog wiring
- **`vite.config.js`** (autoUpdate + skipWaiting + clientsClaim)
- **`play.html`** (PostHog init)
- **PH cards** (`ph_card1_hero.png` … `ph_card5_styles.png`)
- **Mockupy** (`mock-gallery-wall.jpg`, `mock-framed-wall.jpg`, `mock-album.jpg`, `mock-poster.jpg`)
- **Video** (`paintiano-demo2-muted.mp4`, `paintiano-demo2-end.gif`)
- **Showcase obrázky** (`debussy-arabesque.{jpg,webp}`, `hummed-riley.{jpg,webp}`, `warm-dusk.{jpg,webp}`)
- **`paintiano-ph-fillsheet.md`** — paste-ready PH polia
- **`paintiano-social-SK.md`** — SK social posty
- **`paintiano-funnel-posthog.md`** — meranie návod
- **`paintiano-launch-week-checklist.md`** — denný checklist do 8.7.

## 10 · NÁLADA / TÓN

Tento launch je tvoja prvá veľká verejná prezentácia Paintiano. Rasto pracoval na produkte vyše roka, sólo. Posledných pár dní bolo náročných (chipy nás zatlačili k stene, dlhá lokalizácia, debugging). **Ide o emocionálne tweetnutý moment** — nielen technicky launch. Pomáhaj mu zachovať pokoj, sústrediť sa na to čo má pod kontrolou (komentáre, prítomnosť, prvá hodina), a nezachvátiť sa, ak nedosiahne Product of the Day. Goal je **prvá vlna používateľov + úprimný feedback + prví platiaci**, nie PR. Drž ho v tomto rámci.

---

**Veľa šťastia, Rasto. Si na to pripravený. 🎨**
