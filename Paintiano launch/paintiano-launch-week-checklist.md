# Paintiano — Launch-týždeň checklist (launch: streda 8. júl 2026, 09:00 CET)

PH dátum nastavený na **Wed Jul 8**, čas fixný 09:01 CET, beží 24h.
Dátum sa dá kedykoľvek zmeniť v PH → Main info.

---

## ✅ UŽ HOTOVÉ
- [x] Produkt + checkout funguje (Paddle live)
- [x] Landing live (keepsake hero, use-cases, pay-once pricing)
- [x] PostHog meranie (eventy + 2 lieviky + replay)
- [x] PH draft: name, tagline, description, topics, makers
- [x] PH galéria: hero → GIF → card5 → framed → how → why → pricing
- [x] PH video (YouTube unlisted) v Extras
- [x] PH shoutouts (Vercel, Paddle, React, PostHog)
- [x] First comment napísaný
- [x] SK posty napísané
- [x] Mockupy (framed / gallery-wall / poster / album)

---

## ⏳ TENTO TÝŽDEŇ (do ~1. júla) — dokončiť web

- [ ] **Nasadiť posledné landing zmeny na `main`** (jeden `index.html` + `public/mockups/`):
      - keepsake hero („made to keep") + for-whom lede
      - RTB presun pod pricing
      - AI trial fix (Free = 3 trial, Pro AI = unlimited)
      - visual-proof sekcia „Off the screen" + mockupy
      ```
      git add index.html public/mockups
      git commit -m "landing: keepsake hero, RTB below pricing, AI trial fix, visual proof"
      git push origin dev
      ```
      → over dev preview → promo na main:
      ```
      git checkout main && git reset --hard dev && git push origin main && git checkout dev
      ```
- [ ] **Over PH card4** v galérii = opravená (Unlimited AI, nie „3 trial")
- [ ] **Over PostHog Live** — otvor web, klikni, urob dielo → eventy chodia
- [ ] **Over Session Replay = Enabled** (Settings → Project → Replay)

---

## ⏳ TÝŽDEŇ PRED (2.–6. júl) — rozohriať publikum

- [ ] **PH účet warm-up** — daj 3–5 komentárov k iným produktom (nech nie si „studený" účet)
- [ ] **Priprav rozosielací zoznam** — 10–20 ľudí (priatelia, kolegovia, SK komunity, ktokoľvek s pesničkou), ktorým v deň launchu napíšeš
- [ ] **Priprav SK posty** (`paintiano-social-SK.md`) — X, IG/TikTok, LinkedIn, FB, DM — pripravené, len v deň launchu doplníš PH link
- [ ] **Skopíruj si first comment** (z fill-sheetu) do poznámok — vložíš ho hneď po spustení
- [ ] (voliteľne) prepni YouTube video na **Public** — môže priniesť organický traffic

---

## ⏳ DEŇ PRED (7. júl)

- [ ] Posledná kontrola galérie + že landing na main vyzerá dobre na mobile
- [ ] Napíš/priprav DM správy 10–20 ľuďom: „zajtra 8.7. púšťam Paintiano na PH, keby si mal 2 min skúsiť + dať feedback" (NIE „upvotni")
- [ ] Skontroluj, že máš ráno 9.7. čas byť pri počítači (launch je live event)
- [ ] Dobre sa vyspi 🙂

---

## 🚀 LAUNCH DEŇ (streda 8. júl)

- [ ] **09:00** — over, že je produkt live na producthunt.com
- [ ] **hneď** — vlož **first comment** (z fill-sheetu)
- [ ] **09:05** — hoď **SK posty** (X/IG/LinkedIn/FB) + pošli **DM** pripraveným ľuďom (link + „skús a daj feedback")
- [ ] **celý deň** — odpovedaj na KAŽDÝ komentár do pár minút. Pýtaj sa: „akú pieseň si skúsil a sedela maľba?"
- [ ] **13:00** — druhý social push (zdieľaj pekné dielo, čo niekto spravil)
- [ ] **18:00** — postni v 1–2 komunitách (Reddit/IG)
- [ ] **21:00** — „ďakujem + kde sme" update
- [ ] **nikde nepýtaj upvoty** (PH penalizuje) — vždy len „skús / daj feedback"
- [ ] **sleduj PostHog Live + lieviky** — uvidíš, kde z lievika ľudia odpadávajú

---

## 📊 DEŇ PO (9. júl)

- [ ] Pozri si **funnel v PostHog** — najväčší % prepad = úzke hrdlo na opravu
- [ ] Pozri **Session Replay** na tom kroku — *prečo* tam ľudia odchádzajú
- [ ] Poďakuj ľuďom, čo komentovali / pomohli
- [ ] Prvé reálne diela od používateľov → kandidáti do „Made with Paintiano" galérie

---

## Súbory, ktoré v deň launchu potrebuješ (máš v outputs)
- `paintiano-ph-fillsheet.md` — first comment + polia
- `paintiano-social-SK.md` — SK posty
- `paintiano-funnel-posthog.md` — meranie

---

**Najbližšia akcia:** nasaď posledné landing zmeny na **main** (sekcia „TENTO TÝŽDEŇ"). Zvyšok počká.
