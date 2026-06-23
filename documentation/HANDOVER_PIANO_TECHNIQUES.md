# Paintiano scan — handover (Phase 3 to do)

## Stav

**Hotové dnes:** scan dynScale, ATMO upgrade (5 dim — tempo, dyn, register, density, harmony), bipolar páky okolo posunutého stredu (B), pedal suppress na calm, Melody↔ATMO (root bug fix, leadVel/lift/entries/octave, cellFrac stretch, generateMelody prompt directive), per-note `offsetMs` infra v playeri, **Fáza 2 piano techník: Tied notes + Arpeggio**.

**Otestované a OK:** všetko po Fázu 2 vrátane. Esbuild ⚡, brackets sedia.

## Súbory v /mnt/user-data/outputs (nasadiť ako jeden balík ak ešte nie)

- `02-draw.jsx` — bracket `-2 0 0`
- `04-songs.jsx` — bracket `-4 0 0`
- `05-main.jsx` — bracket `-8 0 0`

## Čo zostáva — Fáza 3

Tri techniky, jeden balík, **každá so svojím signálom** (izolovateľné):

1. **Per-voice artikulácia** — melódia legato (durMs ×1.4), bas staccato (×0.55), mid neutrálne. Signál: rola tónu (`n.bass`, je to top voice = melódia, inak mid). Injekcia: za articulation pass (~r.11320 pôvodne, posunulo sa po Fáze 2 — najprv `grep -n "PIANO TECHNIQUE: ARPEGGIO"` a hľadať article pass nižšie).

2. **Tremolo na dlho držanom akorde** — po merge, ak `_runLen ≥ 16` (cca 3+ sek držania), namiesto jednej dlhej noty rozdeliť na opakované attacky (každých ~180 ms). Signál: `_runLen` po merge. **Pozor:** treba pridať novú vlastnosť (napr. `_tremoloAt: [ms,ms,...]`) alebo nové ev udalosti — radšej nový pomocný array, nech sa nepoškodí `_playable=false` mechanizmus.

3. **Repetícia melódie** — ak top voice (melódia) má rovnaké MIDI v 2+ susedných akordoch, namiesto tied (čo to už robí) opakuj rýchlo. Signál: detekcia melodického repeatu, pre vivid pasáže. *Opatrne:* koliduje s tied notes — treba rozhodnúť poradí (tied prvý, repetícia override pri vivid).

## Kritické pravidlá (neporušiť!)

- **Footer v2.2** — NIKDY auto-bumpovať, vždy y/n
- **CRLF**, len zmenené fragmenty, žiadne kopírovanie modulov
- **Validácia povinná**: esbuild + bracket balance (`02-draw -2 0 0`, `05-main -8 0 0`, `04-songs -4 0 0`)
- **Mondrian, Gold/Klimt, Rothko, Monet** zostávajú VYNECHANÉ z Mix (každý z dobrého dôvodu)
- **Kusama A + Matisse A** majú Mix (per-block energy)
- **Melody pre ATMO**: cache key obsahuje `atmoSig` (predtým + atmoMood.v.toFixed(2)+'_'+atmoMood.e.toFixed(2)) — pri zmene ATMO si vygeneruje novú

## Anchor riadky (posunuli sa po Fáze 2, treba grep)

- Tied notes pass: `PIANO TECHNIQUE: TIED NOTES`
- Arpeggio pass: `PIANO TECHNIQUE: ARPEGGIO`
- Articulation pass: `Articulation from texture`
- Composition pass: `COMPOSITION PASS (form & dramaturgy)`
- Player loop offset: `Per-note onset offset (offsetMs) supports piano techniques`

## Deploy cmd

```
del src\paintiano.jsx
node check-paintiano.js
node build-paintiano.js
git add -A
git commit -m "..."
git push origin dev
```
Promo: `git checkout main && git reset --hard dev && git push origin main && git checkout dev`

## Parkované (z dnešného dňa, mimo scan)

- **OG/WhatsApp deploy** — `git add public\ph_card1_hero.png index.html` (aj obrázok!), push, FB Debugger → Scrape Again
- Mix promo na main, ak je len na dev

## Otvorené po Fáze 3 (nice-to-have, neriešiť teraz)

- Pollock dripy, Kandinsky overlay tvary, Picasso (Mix v overlay tvaroch)
- Rubato detail, pedal logic (zmena pedalu pri zmene harmónie)
- Vrátiť sa k voicing density bipolar — ak Fáza 3 ovplyvní vnímanie hustoty
