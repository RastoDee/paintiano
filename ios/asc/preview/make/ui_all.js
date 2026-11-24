// The Studio's chrome in one language for the five painters (black + white for the matte), and the screen of The Kiss playing.
// node ui_all.js LANG
const L=require('./lib.js'); const fs=require('fs');
const LANG=process.argv[2]; const OUT=__dirname+'/ui_'+LANG; fs.mkdirSync(OUT,{recursive:true});
(async()=>{ const {W,H}=L; let T=await L.open({dsf:2,ss:2,lang:LANG,locale:L.LOC[LANG]}); let p=T.p;
 const set=(inv)=>p.evaluate((inv)=>{ let s=document.getElementById('__mat'); if(!s){ s=document.createElement('style'); s.id='__mat'; document.head.appendChild(s); }
   s.textContent=`canvas{filter:brightness(0)${inv?' invert(1)':''} !important} canvas[aria-hidden="true"]{display:none !important} *{transition:none !important;animation:none !important;caret-color:transparent}`; }, inv);
 for(const A of ['hokusai','gold','monet','mondrian','kandinsky']){ await T.go('clairdelune',A,0); await T.tap(W/2,H*0.5); await T.wait(3500); const pl=await T.isPlaying();
   await p.screenshot({path:`${OUT}/${A}_real.png`}); await set(false); await T.wait(350); await p.screenshot({path:`${OUT}/${A}_k.png`}); await set(true); await T.wait(350); await p.screenshot({path:`${OUT}/${A}_w.png`}); console.log(LANG,A,'ok'); }
 await T.close();
 // The Kiss: the day when it is one of the three samples; the way there by shape, not by words
 T=await L.open({dsf:2,ss:2,lang:LANG,locale:L.LOC[LANG],dayShift:L.kissDay()}); p=T.p; const Sh=L.shape(T); await T.go('clairdelune','hokusai',0);
 await Sh.tapB(await Sh.chg(),2200); let tl=await Sh.tiles(); await Sh.tapB(tl[1],2200); tl=await Sh.tiles(); const tb=Math.max(...tl.map(b=>b.y+b.h)); await Sh.tapB((await Sh.rows(tb))[0],2200); await Sh.tapB((await Sh.rows(200))[0],2200);
 const k=(await Sh.btns()).find(b=>/Klimt/.test(b.t)); if(!k){ console.log(LANG,'KISS MISSING', JSON.stringify((await Sh.btns()).map(b=>b.t))); await T.close(); process.exit(1); }
 await T.tap(k.x+k.w/2,k.y+k.h/2); await T.wait(700); await p.screenshot({path:`${OUT}/kiss_plate.png`}); const r=await p.evaluate(()=>{ const i=[...document.querySelectorAll('img')].sort((a,b)=>b.naturalWidth-a.naturalWidth)[0]; const r=i.getBoundingClientRect(); return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]; });
 await T.wait(600); const playing=!!(await p.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.getBoundingClientRect().width>0 && /pause|stop/i.test(b.getAttribute('aria-label')||''))));
 console.log(LANG,'kiss ok','rect',JSON.stringify(r)); await T.close(); process.exit(0); })().catch(e=>{ console.log(LANG,'FAIL',e.message); process.exit(1); });
