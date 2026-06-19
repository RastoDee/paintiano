# HANDOVER — MELODY chip (image scan "obraz spieva")

## Cieľ (Rasto, SK)
V **image scan** režime pridať chip **MELODY** vedľa existujúceho **ATM (atmosphere)** chipu.
Keď je MELODY ON, AI vygeneruje **nosnú melódiu z obrazu** (farby, nálada, motív, energia)
a navrství ju **NAD scan textúru** — textúra hrá ďalej, ale obraz "spieva" rozpoznateľnú melodickú linku.

## Tvrdé pravidlá správania (dohodnuté)
1. MELODY je **samostatný chip** (on/off), nezávislý od ATM.
2. Zapnuteľný **IBA pred Play** (`disp===0 && !playing && !anim`). Počas playbacku **disabled**.
3. Po skončení skladby: ak bol ON → **automaticky OFF** (jednorazový efekt; nezostane zapnutý).
4. Je to **AI call** (Pro AI = unlimited; Free/Pro = trial→paywall, cez `gateAI`).
5. **Cache**: rovnaký obraz + rovnaká nálada → replay bez ďalšieho creditu (vzor: `_imgComposeCacheGet/Set`).
6. Melódia **navrstvená** nad scan eventy (NIE nahradenie). Mix: melódia = vrchný hlas,
   zvýraznená velocity, dlhšie noty, v scale nálady.

## Vedľajšia úloha
**Skrátiť ATM label** — momentálne `atmosphere · ON/OFF` je dlhé.
i18n kľúč `atmoLabel` (03-i18n.jsx, 9 jazykov, EN riadok 7: `atmoLabel:'atmosphere'`).
Skrátiť hodnoty: EN `atmo`, SK `atmo`, DE `Atmo`, FR `amb.`, ES `amb.`, PT `atm`, zh `氛围`, zhTW `氛圍`, ja `雰囲気`.
POZOR: `atmoLabel` over kde všade sa používa (chip + title), nech skrátenie nerozbije iné miesta.
Alternatíva: skrátiť len zobrazenie v chipe (05-main ~9757), nechať i18n.

## Kde sú veci (build = src/paintiano/, edituje sa cez outputs → Rasto kopíruje)
- **ATM chip render**: 05-main.jsx ~9756 (button), label ~9757.
  ```
  <button onClick={()=>{ if(atmoBusy) return; ... if(atmoOn){setAtmoOn(false);} else if(atmoMood){setAtmoOn(true);} else {if(aiUsable) detectAtmosphere();} }} ...>
    <TxIcon n="sparkle"/><span>{(t('atmoLabel')||'atmosphere')+' · '+(atmoOn?'ON':'OFF')}</span>
  ```
  → MELODY chip ide HNEĎ vedľa, rovnaký vizuál (`txStyle('ai',...)`, sparkle ikona).
- **ATM/melody chip blok podmienka**: `{viewMode==='image'&&originalImgUrl&&!moodFromImg&&(` (~9755) — len scan, nie MFI.

## Dáta k dispozícii (žiadny extra AI na materiál)
- **`extractImageMaterial()`** (05-main ~4875) už vracia z scan eventov:
  `{ palette, noteRange, energy, tex, arc, mood, count }`
  - palette = top 7 pitch-class (farby→tóny), noteRange, energy, tex(ura), arc, mood (ak ATM on).
- **`atmoMood`** = `{v,e,root,title}` (valencia/energia/root/titul) — ak ATM detegovaný.
- Scan eventy: `chordsRef.current`, formát `{startMs, n:[{m:midi, v:vel, durMs}]}`.

## AI call vzor (skopíruj z aiComposeFromImage, 05-main ~4911)
- Endpoint: `fetch(_ep, {method:'POST', body:JSON.stringify({model:CLAUDE_MODEL, max_tokens:..., messages:[{role:'user',content:prompt}]})})`
  (zoznam `_eps`/`_ep` ako v aiComposeFromImage; CLAUDE_MODEL je def. hore.)
- Parse: očakávaj JSON `{title, tempo, notes:[[pitch,durBeats,startBeat,velocity],...]}`.
- `noteArr2events(parsed.notes, parsed.tempo, {keepLong:true})` → eventy `{startMs,n:[...]}`.

## Navrhovaný MELODY AI prompt (uprav podľa vkusu)
```
A painting was scanned into a musical TEXTURE. Compose a single SINGING melodic LINE
that floats ON TOP of that texture — a clear, memorable lead melody the painting itself
would "sing". One voice (monophonic), singable phrases, breathing space, a recurring motif.
Let the image guide it:
- Pitch palette (colours → notes): ${mat.palette}
- Range: ${mat.noteRange}
- Energy: ${mat.energy}   Texture: ${mat.tex}   Arc: ${mat.arc}
${mat.mood?`- Mood/atmosphere: ${mat.mood}`:''}
${atmoMood?`- Key centre (root pc): ${atmoMood.root}, valence ${atmoMood.v}, energy ${atmoMood.e}`:''}
The melody must sit in a register ABOVE the texture (lead voice), with longer, lyrical notes,
phrased like a human voice — not a stream of equal notes.
Output ONLY JSON: {"title":"...","tempo":90,"notes":[[pitch,durationInBeats,startBeat,velocity],...]}
velocity 1–127 (melody = prominent, 90–120). Title: short evocative phrase (Title Case, max 5 words).
```

## Navrstvenie (mix) — kde a ako
- Po parse melódie → eventy `melEvts`. Treba ich **zmiešať** so scan eventmi tak,
  aby hrali súčasne. Dve cesty:
  - **(odporúčané) Časové zlúčenie**: pre každý melódiový event nájdi/vlož do timeline scan eventov
    podľa startMs (preškáluj melódiu na dĺžku scan skladby), pridaj ako extra noty s `_lead:true`
    (vyššia velocity, +1 oktáva ak treba aby sedela nad textúrou).
  - Alternatíva: prehrávať melódiu ako druhý hlas (samostatný scheduler) — väčší zásah do audio enginu.
- Drž scan eventy nezmenené (toggling MELODY off → čistá textúra). Melódiu pridávaj k **kópii**,
  nie do `chordsRef` natrvalo (ako _atmoTransform: vždy z literal eventov).

## State + lifecycle (nový)
- `const [melodyOn,setMelodyOn]=useState(false);`
- `const [melodyBusy,setMelodyBusy]=useState(false);`
- Cache ref pre melódiu (key = imgHash + atmoMood signatúra).
- Toggle ON pred Play: gateAI(1) → AI call → parse → cache → setMelodyOn(true).
  Pri Play sa do prehrávaných eventov vmieša melódia (ak melodyOn).
- Disabled keď `playing || anim || disp>0 || melodyBusy`.
- Po skončení skladby (kde sa playback ukončí — nájdi onEnd / dispatch po poslednom evente):
  `if(melodyOn) setMelodyOn(false);`
- Clear / nový obraz → setMelodyOn(false), zruš cache key.

## Validácia (povinné po každom edite)
```
cd outputs
npx --yes esbuild@0.21.5 05-main.jsx --bundle=false --loader:.jsx=jsx --outfile=/dev/null   # ⚡ Done
# bracket balance: orig 05-main = 0 / -8 (curly/paren)
```
03-i18n.jsx ak meníš labely — tiež esbuild parse.

## Deploy
```
node check-paintiano.js
node build-paintiano.js
git checkout dev && git add -A && git commit -m "feat: MELODY chip — AI lead melody from the image, layered over scan texture (pre-Play only, auto-off after playback)" && git push origin dev
```

## Poznámky / riziká
- MFI už robí podobný AI compose (aiComposeFromImage) — môžeš z neho zdediť endpoint/parse/cache vzory.
- Footer verzia: NEMENIŤ bez y/n potvrdenia.
- Mobile <769px: chip layout nech sa nerozbije (ATM+MELODY vedľa seba — over wrap na úzkom).
- Immersive: chip sa v image scan ukazuje len v setup/active pred Play — over že v immersive nezavadzia.
