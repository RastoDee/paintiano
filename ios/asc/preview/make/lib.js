// Shared set-up for the App Preview captures: the real app at 443×960, Pro, every hint seen, paint canvas at SS× (default 3).
const {rig}=require('../tour/rig.js'); const fs=require('fs');
const KEYS={paintiano_lang:'EN',paintiano_tour_seen:'1',paintiano_view_asked:'1',paintiano_st_guide:'1',paintiano_st_fill:'1',paintiano_onboarded:'1',paintiano_welcomed:'pro_ai',paintiano_step:'3',paintiano_step_pick:'1',paintiano_st_menu_seen:'1',paintiano_feed_hint_n:'9',paintiano_swiped_up:'1',paintiano_swiped_side:'1',paintiano_tip_up:'1',paintiano_tip_chg:'1',paintiano_tip_fav:'1',paintiano_tip_studio:'1',paintiano_isig_intro_n:'9',paintiano_sig_intro_n:'9',paintiano_painter_intro_n:'9'};
exports.W=443; exports.H=960;
exports.open=async({dsf=2,ss=3,lang='EN',locale='en-US',dayShift=0}={})=>{ const T=await rig({out:__dirname+'/x', seed:5, locale, width:443, height:960, dsf, hints:false}); const p=T.p;
  await p.route('https://battle.paintiano.app/**', r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"on":true}'}));
  await p.route('**/assets/play-*.js', async r=>{ const resp=await r.fetch(); let t=await resp.text(); const n=t.split('==="audio")?2:1').length-1; if(n!==2) console.log('WARN ss patch count',n); t=t.split('==="audio")?2:1').join('==="audio")?(window.__SS||2):1'); const k='b=24,v=.03,J=ce=>(ce.clientX-b)'; if(t.split(k).length!==2) console.log('WARN sn patch'); t=t.split(k).join('b=24,v=(window.__SN??.03),J=ce=>(ce.clientX-b)'); await r.fulfill({response:resp, body:t}); });
  await p.addInitScript(([K,ss,lang,ds])=>{ if(ds){ const D=Date, off=ds*86400000; const N=function(...a){ return a.length ? new D(...a) : new D(D.now()+off); }; N.now=()=>D.now()+off; N.parse=D.parse; N.UTC=D.UTC; N.prototype=D.prototype; window.Date=N; } window.__SS=ss; window.__SN=-1; try{ for(const [k,v] of Object.entries(K)) localStorage.setItem(k,v); localStorage.setItem('paintiano_lang',lang); }catch(e){} }, [KEYS,ss,lang,dayShift]);
  T.go=async(piece,artist,v=0)=>{ await p.goto(`http://127.0.0.1:4179/play.html?piece=${piece}&artist=${artist}&v=${v}&p=harmony`,{waitUntil:'domcontentloaded'}); await T.wait(6000); };
  T.playBtn=()=>p.evaluate(()=>{ const b=[...document.querySelectorAll('button')].find(b=>/^PLAY$/.test((b.getAttribute('aria-label')||b.innerText||'').trim())); if(b){ b.click(); return true; } return false; });
  T.isPlaying=()=>p.evaluate(()=>!![...document.querySelectorAll('button')].find(b=>/^(pause|stop)/i.test(b.getAttribute('aria-label')||'') || /^(PAUSE|STOP)$/.test((b.innerText||'').trim())));
  T.btnNames=()=>p.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0).map(b=>(b.getAttribute('aria-label')||b.innerText||'').trim().slice(0,22)));
  T.cv=(q=0.93,type='image/jpeg')=>p.evaluate(([q,type])=>{ const c=[...document.querySelectorAll('canvas')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>200&&r.height>200;}).sort((a,b)=>b.width*b.height-a.width*a.height)[0]; return c.toDataURL(type,q); },[q,type]);
  T.save=(du,fn)=>fs.writeFileSync(fn, Buffer.from(du.split(',')[1],'base64'));
  return T; };

// the Studio's progress line under a held pointer: the painting stands at chord idx, nothing plays
exports.line=async(T)=>{ const p=T.p, H=960; const n=await p.evaluate(()=>{ const s=document.querySelector('[role=slider][aria-label="playback position"]'); return s ? (+s.getAttribute('aria-valuemax')+1) : 0; });
  const X=(idx)=>24+(idx+0.5)/n*(443-48); let down=false;
  const now=()=>p.evaluate(()=>{ const s=document.querySelector('[role=slider][aria-label="playback position"]'); return s ? +s.getAttribute('aria-valuenow') : -1; });
  const at=async(idx)=>{ if(!down){ const xs=X(idx)>221 ? X(idx)-40 : X(idx)+40; await p.mouse.move(xs,H-1.5); await p.mouse.down(); down=true; await p.mouse.move((xs+X(idx))/2,H-1.5); }
    await p.mouse.move(X(idx),H-1.5); for(let k=0;k<40;k++){ if((await now())===Math.min(idx,n-1)) break; await T.wait(25); }
    let a=null; for(let k=0;k<12;k++){ await T.wait(k===0?90:70); const b=await T.cv(0.94); if(a && a.length===b.length && a===b) return b; a=b; } return a; };
  const up=async()=>{ if(down){ await p.mouse.up(); down=false; } };
  return {n,at,up,now}; };
exports.LOC={EN:'en-US',SK:'sk-SK',DE:'de-DE',FR:'fr-FR',ES:'es-ES',PT:'pt-PT',zh:'zh-CN',zhTW:'zh-TW',ja:'ja-JP'};
// the day (from today) whose three sample pictures include The Kiss (index 7 of 11) — the app's own daily draw
exports.kissDay=()=>{ const Hh=(n,salt)=>{ let h=(0x811c9dc5 ^ salt)>>>0; h=Math.imul(h ^ (n>>>0), 0x01000193)>>>0; h^=h>>>13; h=Math.imul(h,0x5bd1e995)>>>0; h^=h>>>15; return h>>>0; };
  const trio=(tick)=>{ const idx=[...Array(11).keys()]; const out=[]; let h=Hh(tick,23); while(out.length<3&&idx.length){ h=Hh(h,24); out.push(idx.splice(h%idx.length,1)[0]); } return out; };
  const d=new Date(); const today=Math.floor((d.getTime()-d.getTimezoneOffset()*60000)/86400000); for(let k=0;k<40;k++) if(trio(today+k).includes(7)) return k; return 1; };
// visible buttons with their boxes, and the Studio's pieces found by shape (works in every language)
exports.shape=(T)=>{ const p=T.p, W=443;
  const btns=()=>p.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect(); if(!(r.width>0&&r.height>0)) return false; const h=document.elementFromPoint(Math.min(442,Math.max(0,r.x+r.width/2)),Math.min(959,Math.max(0,r.y+r.height/2))); return h&&(b===h||b.contains(h));}).map(b=>{const r=b.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,t:(b.innerText||'').replace(/\s+/g,' ').slice(0,60)};}));
  const tapB=async(b,w)=>{ if(!b) throw new Error('missing button'); await T.tap(b.x+b.w/2,b.y+b.h/2); await T.wait(w||1800); };
  return { btns, tapB,
    chg:async()=>(await btns()).filter(b=>b.y>650&&b.w>80&&Math.abs(b.x+b.w/2-W/2)<30).sort((a,b)=>b.w-a.w)[0],
    tiles:async()=>(await btns()).filter(b=>b.w>95&&b.w<230&&b.h>80&&b.h<140&&b.y>300).sort((a,b)=>a.x-b.x),
    rows:async(minY)=>(await btns()).filter(b=>b.w>300&&b.y>(minY||0)).sort((a,b)=>a.y-b.y) }; };
