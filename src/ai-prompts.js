// src/ai-prompts.js — Paintiano's AI prompts, in ONE place.
// Used by the app (it sends only the kind + the inputs to /api/compose; in the
// claude.ai preview it still calls the API directly with the full prompt) and by
// /api/compose, which builds the prompt itself — so the endpoint can only ever
// compose music, never answer an arbitrary message (Nov 2026: it was an open
// proxy to Claude). The prompt texts are moved here verbatim from 05-main.jsx.

export const AI_MODEL = 'claude-sonnet-4-6';
export const AI_HAIKU = 'claude-haiku-4-5';
const LANG_NAMES = {EN:'English',DE:'German',FR:'French',ES:'Spanish',PT:'Portuguese',SK:'Slovak',zh:'Simplified Chinese',zhTW:'Traditional Chinese',ja:'Japanese'};
const langName = (l) => LANG_NAMES[l] || 'English';

// "piece" kinds write notes (they count toward the daily / yearly AI pieces); the rest are small helpers.
export const PF_PIECE_KINDS = ['mood','mfi','cfi','melody'];
export const PF_KINDS = ['probe','morph','title','atmo'].concat(PF_PIECE_KINDS);

const _img = (b64) => ({type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}});

const BUILD = {
  probe(){ return { model:AI_MODEL, max_tokens:8, messages:[{role:'user',content:'ping'}] }; },

  morph(a){ const base=a.base, need=a.need, list=a.list;
    const prompt = `Current mood: "${String(base).slice(0,80)}". From the list below, pick exactly ${need} moods that make good morph / blend targets for it — MOSTLY emotionally related or escalating variations (same emotional family, rising or falling intensity), plus a few contrasting ones for variety. The phrase may be in ANY language; interpret its real emotion, do NOT read it word-by-word.
List: ${list.join(', ')}
Return ONLY a JSON array of exactly ${need} strings copied verbatim from the list. No prose, no markdown. Example: ["furious","tense","melancholic"]`;
    return { model:AI_HAIKU, max_tokens:300, messages:[{role:'user',content:prompt}] }; },

  title(a){ const text=a.text, _ln=langName(a.lang);
    return { model:AI_MODEL, max_tokens:40, messages:[{role:'user',content:[{type:'text',text:'Translate this short art-piece title into '+_ln+'. Keep it Title Case, max 5 words. Output ONLY the translated phrase \u2014 no quotes, no extra text:\n'+text}]}] }; },

  mfi(a){ const _langName=langName(a.lang);
        const prompt='Look at this image. First, in one word, decide its dominant EMOTION (e.g. joyful, calm, dramatic, melancholic, tense, eerie, tender, triumphant). Then compose a short solo piano piece whose MUSICAL CHOICES are DRIVEN BY that emotion — do NOT use neutral defaults.\nMap the emotion to the music (choose to fit the SPECIFIC emotion, never fall back to a neutral middle):\n- KEY: bright/happy/triumphant/playful → a MAJOR key; sad/melancholic/eerie/tense/yearning → a MINOR key. Pick a SPECIFIC key and vary it across pieces (do not default to C).\n- TEMPO: calm/tender/melancholic → slow (50-75); joyful/playful → medium-fast (95-130); dramatic/tense/triumphant → driving (110-150); eerie → free and slow (55-80).\n- REGISTER & DENSITY: intimate/calm → sparse, mid-low register, lots of space; energetic/triumphant → fuller chords, wider range, more notes.\n- DYNAMICS: tender → soft (velocity 35-65); triumphant/dramatic → loud (75-115); tense → uneven and accented.\n- ARTICULATION/RHYTHM: playful → staccato and syncopated; melancholic → legato and long notes; tense → repeated ostinato figures.\nTwo DIFFERENT emotions MUST yield audibly DIFFERENT pieces — different key colour, tempo, density and dynamics.\nOutput ONLY a single valid JSON object - no markdown, no prose.\nSet "title" to a short phrase in '+_langName+' describing the image mood (Title Case, max 5 words).\nSchema: {"title":"...","tempo":<derived from emotion>,"key":"<derived from emotion>","notes":[[pitch,durationInBeats,startBeat,velocity], ...]}\nRules: LENGTH — keep it SHORT, 20-35 seconds total at the chosen tempo (the LAST note\'s startBeat+duration MUST stay under tempo/2 beats); 52-80 notes; include a bass line (octaves 2-3, at least 12 notes) and a melody (octaves 4-6) with a recurring motif; vary durations (mix 0.25/0.5/1/2); velocity per the dynamics above; pitches sharps only (C#4 not Db4).';
    return { model:AI_MODEL, max_tokens:2000, messages:[{role:'user',content:[_img(a.b64),{type:'text',text:prompt}]}] }; },

  cfi(a){ const _langName=langName(a.lang), mat=a.mat;
      const prompt=`Look at this image. Identify WHAT is in it (a person, a landscape, a building, an abstract painting, a child, an animal, etc.) and its dominant EMOTION (e.g. joyful, calm, dramatic, melancholic, tense, eerie, tender, triumphant). Then compose a free-standing solo piano piece whose musical choices are DRIVEN by what you see and feel.
The scanned musical material (a secondary hint — the image itself is the primary signal):
- Pitch palette (most present pitch classes): ${mat.palette}
- Range of the scan: ${mat.noteRange}${mat.mood?`\n- Detected mood: ${mat.mood}`:''}
Map what you see to the music — two DIFFERENT images MUST yield audibly DIFFERENT pieces (different key, tempo, density, dynamics):
- KEY: bright/happy/triumphant/playful subjects → MAJOR; sad/melancholic/eerie/tense/yearning subjects → MINOR. Pick a SPECIFIC key, vary across pieces (do not default to C).
- TEMPO: calm/tender/melancholic → slow (55-80); joyful/playful → medium (90-120); dramatic/tense/triumphant → driving (110-145); eerie → free and slow.
- REGISTER & DENSITY: intimate/calm → sparse, mid-low register, lots of space; energetic/triumphant → fuller chords, wider range, more notes.
- DYNAMICS: tender → soft (vel 40-65); triumphant/dramatic → loud (80-115); tense → uneven and accented.
- ARTICULATION: playful → staccato and syncopated; melancholic → legato; tense → repeated ostinato.
Output ONLY a single valid JSON object — no markdown, no prose.
Schema: {"title":"...","tempo":<derived>,"key":"<derived>","notes":[[pitch,durationInBeats,startBeat,velocity],...]}
Set "title" to a short evocative phrase in ${_langName} (Title Case, max 5 words) describing THIS SPECIFIC image — must be distinctive, never a generic "quiet light" type phrase.
Composition rules:
- LENGTH: 60-90 seconds of music — the LAST note's (startBeat + duration) MUST reach at least tempo beats (= 60 seconds).
- 90-150 notes total.
- STYLE: Western tonal piano in the spirit of Einaudi, Yiruma, Max Richter, Chopin's Nocturnes, or Debussy. Lyrical melodies over flowing accompaniment. Avoid East-Asian-traditional evocations unless the image is unmistakably East Asian.
- HARMONY: familiar functional progressions (I-V-vi-IV, ii-V-I; minor: i-VI-III-VII, i-iv-V-i). Diatonic with tasteful chromatic colour.
- Structure: intro (motif, sparse) → development (richer) → contrasting middle → return of motif → close (quieter).
- Bass (octaves 2-3): ≥20 notes. Melody (octaves 4-6): singable, recurring motif.
- Vary durations (mix 0.25/0.5/1/2). Pitches with octave, sharps only (C#4 not Db4).`;
    return { model:AI_MODEL, max_tokens:4000, messages:[{role:'user',content:[_img(a.b64),{type:'text',text:prompt}]}] }; },

  melody(a){ const mat=a.mat; const _atmoMood=a.atmo||null; const _atmoTitleL=(t)=>t;   // the app sends the title already in English
      let atmoBlock='';
      if(_atmoMood){
        const _av=_atmoMood.v, _ae=_atmoMood.e;
        const lines=[];
        if(_ae<=0.20){
          lines.push('Energy is VERY LOW (calm/dreamy). MUST: slow tempo 50-70 BPM, legato long notes (mostly half/whole), soft dynamics (melody 60-85, chords 45-65), MID-LOW register (melody octaves 4-5, NOT 6), sparse texture, no leaps larger than a fifth, no syncopation, intro-able ambient feel.');
        } else if(_ae>=0.80){
          lines.push('Energy is VERY HIGH (intense/dramatic). MUST: tempo 115-150 BPM, articulated rhythms with staccato + syncopation, loud dynamics (melody 105-125, chords 88-108), full upper register (melody octave 5-6), denser chords, allow octave leaps and dramatic accents.');
        } else if(_ae<=0.35){
          lines.push('Energy is low. Prefer slow tempo 65-85 BPM, mostly legato, softer dynamics, mid register.');
        } else if(_ae>=0.65){
          lines.push('Energy is high. Prefer faster tempo 100-130 BPM, more articulation, brighter dynamics.');
        }
        if(_av<=-0.50){
          lines.push('Valence is strongly negative (sad/heavy/melancholic). MUST: minor key, descending phrase shapes, dissonant suspensions resolved downward.');
        } else if(_av>=0.50){
          lines.push('Valence is strongly positive (joyful/bright). MUST: major key, ascending phrase shapes, plagal/authentic cadences that feel resolved and lifting.');
        } else if(_av<=-0.20){
          lines.push('Valence is slightly negative. Lean minor key.');
        } else if(_av>=0.20){
          lines.push('Valence is slightly positive. Lean major key.');
        }
        if(_atmoMood.title){ lines.push('Title hint: "'+_atmoTitleL(_atmoMood.title, 'EN')+'".'); }
        if(lines.length){
          atmoBlock = '\nMOOD DIRECTIVE (this overrides defaults; commit to these choices, do not regress to the safe middle):\n- '+lines.join('\n- ')+'\n';
        }
      }
      const prompt=`A painting has been scanned into a musical TEXTURE (its colours played as notes). Compose a SECOND PIANO PART that a concert pianist would play over that texture — a full, two-handed, CHORDAL piece with a clear singing MELODY on top and real harmony underneath. NOT a thin one-finger line: this is a complete, rich piano voice that stands beside the texture as an equal. It must mirror and crown the scan, echoing the image's mood, colour and radiance.
The image's musical material:
- Pitch palette (colours → notes): ${mat.palette}
- Range of the texture: ${mat.noteRange}
- Energy: ${mat.energy}    Texture: ${mat.tex}    Arc: ${mat.arc}${mat.mood?`\n- Mood / atmosphere: ${mat.mood}`:''}${atmoBlock}
Compose with real musical craft, following classical harmonization method:
- KEY: let the pitch palette define the tonal centre; choose major or natural minor to fit the mood. Stay diatonic (tasteful passing/leading tones fine; no random chromaticism).
- LENGTH: write ONE short, COMPLETE melodic phrase of about 8–16 bars (a self-contained tune that could loop seamlessly back to its start). Keep total length under ~24 beats. This cell will be REPEATED across the painting, so it must sound whole on its own and join cleanly to its own beginning.
- MELODY (top voice): clear, singable, memorable, in the upper register (octaves 5–6). A 2–4 note MOTIF stated and answered. CONTINUOUS within the phrase — flowing eighth/quarter motion, mostly stepwise, no gaps longer than a beat. 16–28 notes in the cell (dense enough to sing, not a busy run).
- HARMONY (underneath): under the melody supply CHORDS — diatonic triads/sevenths chosen by FUNCTION (I ii iii IV V vi V7) so the phrase moves tonic → subdominant → dominant → tonic and CADENCES at the end so the loop closes. Melody note = top of its chord. Mid-register voices (oct 3–4) + a bass root (oct 2–3). Move inner voices by the smallest steps (voice leading).
- DYNAMICS: melody louder than accompaniment (vel 96–118 melody, 70–92 chords) so the lead sings on top.
Output ONLY valid JSON, no prose, no markdown:
{"title":"...","tempo":90,"notes":[[pitch,durationInBeats,startBeat,velocity],...],"chords":[[[pitch,pitch,...],durationInBeats,startBeat,velocity],...]}
"notes" = the melody (top voice), one pitch each. "chords" = the harmony underneath, each a LIST of pitches (the accompanying chord voices + bass) sounding together. Pitches as names with octave, sharps only, e.g. "C5","F#4" ("Bb5"→"A#5"). Align each chord's startBeat to the melodic note it harmonizes. Title: a short evocative phrase (Title Case, max 5 words).`;
    return { model:AI_MODEL, max_tokens:4000, messages:[{role:'user',content:prompt}] }; },

  mood(a){ const title=a.title, _langName=langName(a.lang);
      const prompt=`Compose a short expressive solo piano piece inspired by this mood phrase: "${title.slice(0,80)}".
The phrase may be written in ANY language and may be colloquial, slang or idiomatic. FIRST translate it and work out the genuine emotion it expresses (e.g. anger, irritation, joy, calm, sadness, longing, hope, restlessness) — do NOT read it word-by-word and do NOT assume it is English.

Before writing ANY notes, derive these mood-driven parameters — they MUST translate into audible differences in the output. A piece for "calm sea" must sound nothing like a piece for "rage":

- TEMPO (BPM): sad/melancholy 50-65 · calm/serene 65-85 · wistful/longing 70-90 · tender/hopeful 80-100 · playful 95-120 · joyful 110-135 · angry/intense 100-140 (sharp accents) · ecstatic/triumphant 125-155 · anxious/restless 95-130 (uneven)
- MODE: MAJOR keys for joyful, triumphant, tender, hopeful, playful · MINOR keys for sad, longing, melancholy, anxious, angry · MODAL or AMBIGUOUS (Lydian, Dorian, Phrygian, whole-tone) for dreamy, mysterious, contemplative, unsettled
- DYNAMIC RANGE: calm/sad pieces stay narrow and quiet (velocity 30-65 throughout) · angry/joyful pieces are loud and wide (velocity 70-127 with strong accents at 110-127) · mixed/contemplative moods use the full 35-105 range
- DENSITY: sparse 25-45 notes (calm, sad, contemplative, lonely) · medium 45-65 notes (most moods) · dense 65-95 notes (joyful, agitated, dramatic, frenetic)
- REGISTER BIAS: dark/heavy/grounded moods bias LOW (bass octaves 2-3, melody 3-4) · bright/uplifted/light moods bias HIGH (bass 3-4, melody 5-6) · balanced/conversational moods spread across the full range
- ARTICULATION & DURATIONS: legato long (1, 2, 4 beats) for sad/calm/dreamy/longing · staccato short (0.25, 0.5 beats) for playful/anxious/angry · mixed for most moods
- INTERVALLIC CHARACTER: stepwise 2nds and 3rds for sad/calm/tender · wide 5ths/6ths/octaves for joyful/triumphant/dramatic · dissonant 2nds, 7ths, tritones for angry/anxious/unsettled
- STRUCTURE: opening (establish key + motif) → development (build harmonically/dynamically) → close (resolve OR fade). Adapt the intensity curve to the mood — sad pieces stay subdued, joyful pieces climax higher, angry pieces stay agitated.

Set the "title" field to a short, natural translation of the phrase into ${_langName} that captures its meaning (Title Case, max 5 words).
Output ONLY a single valid JSON object — no markdown, no prose, no explanation.
Schema: {"title":"...","tempo":<your derived BPM>,"key":"<your derived key>","notes":[[pitch,durationInBeats,startBeat,velocity],...]}
Each note: [pitch, durationInBeats, startBeat, velocity]. Same startBeat = chord. velocity 1-127.

Hard requirements:
- Apply ALL derived parameters — tempo, mode, dynamics, density, register, articulation, intervals — so the piece is audibly mood-specific
- Bass register notes for harmonic grounding (count scales with density: sparse pieces need at least 8 bass notes, dense pieces 15+)
- Melody in the mood-driven register with a recognisable motif that recurs
- Pitches: use C4/F#3/Bb5 style with octave number, sharps only (no flats — use C#4 not Db4)`;
    return { model:AI_MODEL, max_tokens:2000, messages:[{role:'user',content:prompt}] }; },

  atmo(a){ const _langName=langName(a.lang);
      const prompt=
'You are judging the EMOTION / atmosphere of a single image. Output ONLY one JSON object, no prose: {"valence":NUMBER,"energy":NUMBER,"title":"..."}.\n'+
'valence: -1 (sad/dark/heavy) ... 0 (neutral) ... +1 (happy/bright/playful).\n'+
'energy:   0 (calm/still/dreamy) ... 0.5 (moderate) ... 1 (intense/dramatic/turbulent).\n'+
'CRITICAL: COMMIT to a strong reading. The MIDDLE band (0.40-0.60) is reserved for genuinely ambiguous scenes only. If the scene is clearly calm, output energy <= 0.20; if clearly serene/dreamy/quiet, energy <= 0.15. If clearly intense/dramatic/stormy, energy >= 0.80; if frantic/violent, energy >= 0.90. Same for valence: clearly sad/heavy <= -0.50; clearly joyful/bright >= +0.50.\n'+
'Anchored examples (use as a guide for the strength of your numbers):\n'+
'  A serene Monet pond at dawn          -> {"valence": 0.40, "energy": 0.10}\n'+
'  A melancholic rainy street           -> {"valence": -0.55, "energy": 0.20}\n'+
'  A bright sunny field, kids playing   -> {"valence": 0.85, "energy": 0.65}\n'+
'  A stormy Turner seascape             -> {"valence": -0.20, "energy": 0.90}\n'+
'  A neutral architectural drawing      -> {"valence": 0.05, "energy": 0.30}\n'+
'Avoid the safe centre. Two different paintings MUST yield audibly different numbers.\n'+
'title: short mood phrase in '+_langName+' (max 4 words, Title Case).';
    return { model:AI_MODEL, max_tokens:200, messages:[{role:'user',content:[_img(a.b64),{type:'text',text:prompt}]}] }; },
};

// The request body for one AI call: the full Anthropic body (for a direct call) + pf
// (what /api/compose gets instead — the kind and the inputs only).
export function pfPromptBody(kind, args){
  const a = args || {};
  const b = BUILD[kind](a);
  return Object.assign(b, { pf:{ kind, args:a } });
}

// ── server side: inputs are checked and bounded; anything else is refused ──
const _s = (v, max) => typeof v==='string' && v.length<=max ? v : null;
const _lang = (v) => (typeof v==='string' && LANG_NAMES[v]) ? v : 'EN';
const _b64 = (v) => (typeof v==='string' && v.length>100 && v.length<=3500000 && /^[A-Za-z0-9+/=]+$/.test(v)) ? v : null;
const _num = (v, lo, hi) => (typeof v==='number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : null;
const ENERGY = ['high, forceful','moderate','soft, gentle'];
const TEX = ['dense, chordal','mixed chords and lines','sparse, melodic'];
const ARC = ['builds / brightens toward the end','opens strong then settles','fairly even throughout'];
const _line = (v, max) => (typeof v==='string' && v.length<=max) ? v.replace(/[\r\n\t]+/g,' ') : null;   // free text (a mood phrase): one short line
function _mat(m, full){
  if(!m || typeof m!=='object') return null;
  const palette = typeof m.palette==='string' && /^[A-G]#?( [A-G]#?){0,11}$/.test(m.palette) ? m.palette : null;
  const noteRange = typeof m.noteRange==='string' && /^[A-G]#?-?\d–[A-G]#?-?\d$/.test(m.noteRange) ? m.noteRange : null;
  if(!palette || !noteRange) return null;
  const mood = m.mood==null || m.mood==='' ? null : _line(m.mood, 80);
  if(m.mood!=null && m.mood!=='' && mood==null) return null;
  const o = { palette, noteRange, mood };
  if(full){
    if(!ENERGY.includes(m.energy) || !TEX.includes(m.tex) || !ARC.includes(m.arc)) return null;
    o.energy=m.energy; o.tex=m.tex; o.arc=m.arc;
  }
  return o;
}
export function pfArgsCheck(kind, a){
  a = a || {};
  switch(kind){
    case 'probe': return {};
    case 'morph': {
      const base=_line(a.base,80), need=(Number.isInteger(a.need) && a.need>=1 && a.need<=18) ? a.need : null;
      const list=Array.isArray(a.list) && a.list.length>=1 && a.list.length<=160 && a.list.every(x=>typeof x==='string' && /^[a-z][a-z -]{0,23}$/.test(x)) ? a.list : null;
      return (base!=null && need && list) ? { base, need, list } : null; }
    case 'title': { const text=_line(a.text,80); return text ? { text, lang:_lang(a.lang) } : null; }
    case 'mood':  { const title=_line(a.title,80); return title ? { title, lang:_lang(a.lang) } : null; }
    case 'mfi':
    case 'atmo':  { const b64=_b64(a.b64); return b64 ? { b64, lang:_lang(a.lang) } : null; }
    case 'cfi':   { const b64=_b64(a.b64), mat=_mat(a.mat,false); return (b64 && mat) ? { b64, lang:_lang(a.lang), mat } : null; }
    case 'melody':{ const mat=_mat(a.mat,true); if(!mat) return null;
      let atmo=null;
      if(a.atmo!=null){ const v=_num(a.atmo.v,-1,1), e=_num(a.atmo.e,0,1); const title=a.atmo.title==null||a.atmo.title==='' ? '' : _line(a.atmo.title,60);
        if(v==null || e==null || title==null) return null; atmo={ v, e, title }; }
      return { mat, atmo }; }
  }
  return null;
}
// What came back must be what the kind asks for (music JSON, a list, two numbers, a short title).
export function pfOutputOk(kind, text){
  if(typeof text!=='string') return false;
  switch(kind){
    case 'probe': return true;
    case 'morph': return text.indexOf('[')>=0;
    case 'title': return text.length<=120;
    case 'atmo':  return /"valence"/.test(text);
    default:      return /"notes"\s*:/.test(text);   // a piece or a melody
  }
}
