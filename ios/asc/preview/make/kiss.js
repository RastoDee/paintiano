// The Kiss played as music, the whole pass in real time: the picture's rectangle saved about eight times a second.
// node kiss.js OUT [maxSecs]
const L=require('./lib.js'); const fs=require('fs');
const [OUT,MAX]=process.argv.slice(2); fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});
(async()=>{ const {W,H}=L; const T=await L.open({dsf:2,ss:2,dayShift:1}); const p=T.p; await T.go('clairdelune','hokusai',0);
 const find=async(re)=>p.evaluate((src)=>{ const re=new RegExp(src); const e=[...document.querySelectorAll('button')].find(b=>re.test((b.textContent||'').trim()) && b.getBoundingClientRect().width>0); if(!e) return null; const r=e.getBoundingClientRect(); return [Math.round(r.x+r.width/2),Math.round(r.y+r.height/2)]; }, re);
 const tap=async(re,w=2200)=>{ const xy=await find(re); if(xy){ await T.tap(xy[0],xy[1]); await T.wait(w); } else console.log('missing',re); return !!xy; };
 await tap('Change$'); await tap('^Image'); await tap('^Your picture'); await tap('^Built-in'); await tap('The Kiss',600); const t0=Date.now();
 const rect=await p.evaluate(()=>{ const i=[...document.querySelectorAll('img')].sort((a,b)=>b.naturalWidth-a.naturalWidth)[0]; const r=i.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}; }); console.log('rect',JSON.stringify(rect));
 await p.screenshot({path:OUT+'/plate.png'}); const ts=[]; let i=0, idle=0; const maxS=+(MAX||170);
 while((Date.now()-t0)/1000<maxS){ await p.screenshot({path:`${OUT}/f${String(i++).padStart(4,'0')}.jpg`, type:'jpeg', quality:92, clip:rect}); ts.push((Date.now()-t0)/1000); await T.wait(35);
   if(i%40===0){ if(!(await T.isPlaying())){ if(++idle>=1) break; } else idle=0; } if(i%200===0) console.log('frame',i,Math.round((Date.now()-t0)/1000)); }
 await p.screenshot({path:OUT+'/plate_end.png'});
 fs.writeFileSync(OUT+'/meta.json',JSON.stringify({rect,ts})); console.log('frames',i,'secs',Math.round((Date.now()-t0)/1000));
 const a=await T.audio(); if(a){ fs.writeFileSync(OUT+'/kiss.webm', Buffer.from(a.b64,'base64')); }
 await T.close(); process.exit(0); })().catch(e=>{ console.log('FAIL',e.message); process.exit(1); });
