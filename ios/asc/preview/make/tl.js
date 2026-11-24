// Time-lapse of a painting, chord by chord: node tl.js OUT artist piece [schedule|step] [v] [ss]   schedule e.g. 0-60:1,60-200:2,200-9999:5
const L=require('./lib.js'); const fs=require('fs');
const [OUT,A,PC,ST,V,SS]=process.argv.slice(2); fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});
(async()=>{ const {W,H}=L; const T=await L.open({dsf:2,ss:+(SS||3)}); const p=T.p; await T.go(PC,A,V||0);
 T.save(await p.evaluate(()=>{ const i=[...document.querySelectorAll('img')].sort((a,b)=>b.naturalWidth-a.naturalWidth)[0]; return i?i.src:'data:,x'; }), OUT+'/poster.jpg');
 await T.tap(W/2,H*0.5); await T.wait(2500); await T.tap(W/2,H*0.42); await T.wait(900); console.log(A,'paused', !(await T.isPlaying()));
 const Ln=await L.line(T); const st=String(ST||'').includes(':')?1:+(ST||1); console.log(A,'chords',Ln.n); const idxs=[]; let i=0, bad=0; const want=[]; if(String(ST||'').includes(':')){ for(const part of ST.split(',')){ const [r,s]=part.split(':'); const [a,b]=r.split('-').map(Number); for(let x=a;x<Math.min(b,Ln.n);x+=+s) if(!want.length||x>want[want.length-1]) want.push(x); } } else { for(let x=0;x<Ln.n;x+=st) want.push(x); }
 for(const idx of want){ const du=await Ln.at(idx); if(du.length<30000) bad++; T.save(du, `${OUT}/f${String(i).padStart(4,'0')}.jpg`); idxs.push(idx); i++; if(i%60===0) console.log(A,'frame',i); }
 if(idxs[idxs.length-1]!==Ln.n-1){ T.save(await Ln.at(Ln.n-1), `${OUT}/f${String(i).padStart(4,'0')}.jpg`); idxs.push(Ln.n-1); i++; }
 fs.writeFileSync(OUT+'/meta.json',JSON.stringify({n:Ln.n,idxs})); console.log(A,'done',i,'small',bad); await Ln.up(); await T.close(); process.exit(0); })().catch(e=>{ console.log('FAIL',e.message); process.exit(1); });
