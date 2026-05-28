// ─── Demo Reel ──────────────────────────────────────────────────────────────
// Auto-playing 60-second showcase. Walks through mood typing, colour mode
// switching, artist styles, Vary, image-as-music, Custom palette, and Print
// preview. Hints float over the canvas (1-2 words each), Skip is always
// available, and a user tap on the canvas takes over immediately.
//
// Design: smooth and unstressful. The reel makes its own choices — the user
// just watches. After ~60s the outro card invites them to try it themselves.

// Each scene: { duration in ms, action key, payload, hintKey }
// The runner reads scenes in order and runs the matching action on the host
// app (provided via callbacks). Actions are intentionally high-level so the
// demo doesn't need to know about React internals.
const DEMO_SCENES = [
  { id:'s1',  dur:6000, action:'mood',        payload:'melancholy',          hint:'demoHintMood' },
  { id:'s2',  dur:5000, action:'mode',        payload:'spectral',            hint:'demoHintSpectral' },
  { id:'s3',  dur:6000, action:'style',       payload:'pollock',             hint:'demoHintArtist' },
  { id:'s4',  dur:5000, action:'vary',        payload:null,                  hint:'demoHintVary' },
  { id:'s5',  dur:5000, action:'style',       payload:'rothko',              hint:'demoHintFields' },
  { id:'s6',  dur:6000, action:'mood',        payload:'joyful storm',        hint:'demoHintAnyMood' },
  { id:'s7',  dur:7000, action:'image',       payload:'procedural-starry',   hint:'demoHintImage' },
  { id:'s8',  dur:5000, action:'mode',        payload:'custom',              hint:'demoHintCustom' },
  { id:'s9',  dur:5000, action:'print-flash', payload:null,                  hint:'demoHintPrint' },
  { id:'s10', dur:5000, action:'outro',       payload:null,                  hint:'demoHintOutro' },
];

const DEMO_TOTAL_MS = DEMO_SCENES.reduce((a,s)=>a+s.dur,0);

// Procedural "starry night-ish" image — drawn onto a small canvas and exported
// as a data URL. Public-domain-safe (not a reproduction of any specific work);
// just blue/yellow swirls and dots evoking a nocturne. Deterministic from seed.
function makeProceduralStarryImage(W, H, seed){
  const c = document.createElement('canvas');
  c.width = W || 512; c.height = H || 320;
  const ctx = c.getContext('2d');
  // Mulberry32 PRNG seeded
  let t = (seed >>> 0) || 1;
  const rng = ()=>{
    t |= 0; t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  // Dark blue base
  const baseGrad = ctx.createLinearGradient(0, 0, 0, c.height);
  baseGrad.addColorStop(0, '#0a1530');
  baseGrad.addColorStop(0.55, '#1c2a55');
  baseGrad.addColorStop(1, '#0c1a3a');
  ctx.fillStyle = baseGrad; ctx.fillRect(0, 0, c.width, c.height);
  // Swirling blue/teal currents
  for(let i=0; i<14; i++){
    const cx = rng() * c.width;
    const cy = rng() * c.height * 0.85;
    const r  = 30 + rng() * 90;
    const g  = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(80,140,220,0.55)');
    g.addColorStop(0.6, 'rgba(40,80,160,0.22)');
    g.addColorStop(1, 'rgba(20,40,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  }
  // Yellow stars & moon glow
  for(let i=0; i<22; i++){
    const x = rng() * c.width;
    const y = rng() * c.height * 0.7;
    const r = 2 + rng() * 8;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, 'rgba(255,230,140,0.95)');
    g.addColorStop(0.3, 'rgba(255,200,90,0.5)');
    g.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI*2); ctx.fill();
  }
  // Moon
  {
    const mx = c.width * 0.82, my = c.height * 0.22, mr = c.width * 0.08;
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 2.5);
    g.addColorStop(0, 'rgba(255,240,180,1)');
    g.addColorStop(0.4, 'rgba(255,210,130,0.6)');
    g.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(mx, my, mr * 2.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,248,200,1)';
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI*2); ctx.fill();
  }
  // Village silhouettes at bottom
  ctx.fillStyle = '#080d20';
  ctx.beginPath();
  ctx.moveTo(0, c.height);
  ctx.lineTo(0, c.height * 0.82);
  for(let i=0; i<8; i++){
    const x = (i / 8) * c.width;
    const h = c.height * (0.74 + rng() * 0.10);
    ctx.lineTo(x, h);
    ctx.lineTo(x + c.width / 16, h - rng() * c.height * 0.05);
  }
  ctx.lineTo(c.width, c.height * 0.82);
  ctx.lineTo(c.width, c.height);
  ctx.closePath();
  ctx.fill();
  // Cypress-ish vertical brushstroke
  {
    const cx = c.width * 0.12;
    ctx.fillStyle = '#06081a';
    ctx.beginPath();
    ctx.moveTo(cx - 15, c.height);
    ctx.quadraticCurveTo(cx - 25, c.height * 0.5, cx, c.height * 0.18);
    ctx.quadraticCurveTo(cx + 25, c.height * 0.5, cx + 15, c.height);
    ctx.closePath();
    ctx.fill();
  }
  return c.toDataURL('image/png');
}

// Public entry — given a host (the React app), run the reel and resolve when
// done (or rejected when user takes over).
// `host` is an object of callbacks the demo can invoke:
//   {
//     setMood(text),       // type a mood and start AI compose
//     setMode(mode),       // 'harmony' | 'spectral' | 'custom' | 'bw'
//     setStyle(key),       // null (mosaic) | 'pollock' | 'rothko' | etc
//     triggerVary(),       // reroll
//     loadImageFromDataUrl(dataUrl),  // load procedural image
//     flashPrintPreview(),  // open + auto-close print preview
//     setHint(textKey),     // floating chip
//     setSceneProgress(0..1)
//     isStillRunning(),    // returns false if user cancelled
//   }
//
// Returns a Promise that resolves when reel finishes naturally.
function runDemoReel(host){
  return new Promise(async (resolve) => {
    try{
      for(let i = 0; i < DEMO_SCENES.length; i++){
        if(!host.isStillRunning || !host.isStillRunning()) { resolve(false); return; }
        const scene = DEMO_SCENES[i];
        // Trigger the scene's action.
        try{
          switch(scene.action){
            case 'mood':
              host.setMood && host.setMood(scene.payload);
              break;
            case 'mode':
              host.setMode && host.setMode(scene.payload);
              break;
            case 'style':
              host.setStyle && host.setStyle(scene.payload);
              break;
            case 'vary':
              host.triggerVary && host.triggerVary();
              break;
            case 'image':
              if(scene.payload === 'procedural-starry'){
                const dataUrl = makeProceduralStarryImage(512, 320, 17);
                host.loadImageFromDataUrl && host.loadImageFromDataUrl(dataUrl);
              }
              break;
            case 'print-flash':
              host.flashPrintPreview && host.flashPrintPreview();
              break;
            case 'outro':
              host.setStyle && host.setStyle(null);
              break;
          }
        }catch(_e){}
        // Show hint as scene starts.
        host.setHint && host.setHint(scene.hint);
        host.setSceneProgress && host.setSceneProgress(i / DEMO_SCENES.length);
        // Wait scene duration, with 100ms tick to allow early cancel.
        const tick = 80;
        let elapsed = 0;
        while(elapsed < scene.dur){
          if(!host.isStillRunning || !host.isStillRunning()) { resolve(false); return; }
          await new Promise(r => setTimeout(r, tick));
          elapsed += tick;
        }
      }
      host.setSceneProgress && host.setSceneProgress(1);
      host.setHint && host.setHint(null);
      resolve(true);
    }catch(_err){
      resolve(false);
    }
  });
}
