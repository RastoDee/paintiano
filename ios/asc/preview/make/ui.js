// The Studio's own chrome over a painting, with its transparency: the canvas made black, then white (difference matting).
// node ui.js OUTDIR artist piece [lang]
const L=require('./lib.js'); const fs=require('fs');
const [OUT,A,PC,LANG]=process.argv.slice(2); fs.mkdirSync(OUT,{recursive:true});
(async()=>{ const {W,H}=L; const T=await L.open({dsf:2,ss:2,lang:LANG||'EN'}); const p=T.p; await T.go(PC,A,0);
 await T.tap(W/2,H*0.5); await T.wait(3500); console.log(A,'playing',await T.isPlaying());
 await p.screenshot({path:`${OUT}/${A}_real.png`});
 const set=(inv)=>p.evaluate((inv)=>{ let s=document.getElementById('__mat'); if(!s){ s=document.createElement('style'); s.id='__mat'; document.head.appendChild(s); }
   s.textContent=`canvas{filter:brightness(0)${inv?' invert(1)':''} !important} canvas[aria-hidden="true"]{display:none !important} *{transition:none !important;animation:none !important;caret-color:transparent}`; }, inv);
 await set(false); await T.wait(350); await p.screenshot({path:`${OUT}/${A}_k.png`});
 await set(true); await T.wait(350); await p.screenshot({path:`${OUT}/${A}_w.png`});
 await T.close(); process.exit(0); })().catch(e=>{ console.log('FAIL',e.message); process.exit(1); });
