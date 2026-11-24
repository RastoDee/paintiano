// The finished painting of every painter given (the last chord), at SS×: node fin.js OUTDIR piece ss artist1 artist2 …
const L=require('./lib.js'); const fs=require('fs');
const [OUT,PC,SS,...AS]=process.argv.slice(2); fs.mkdirSync(OUT,{recursive:true});
(async()=>{ const {W,H}=L; const T=await L.open({dsf:2,ss:+SS}); const p=T.p;
 for(const A of AS){ try{ await T.go(PC,A,0);
   T.save(await p.evaluate(()=>{ const i=[...document.querySelectorAll('img')].sort((a,b)=>b.naturalWidth-a.naturalWidth)[0]; return i?i.src:'data:,x'; }), `${OUT}/${A}_poster.jpg`);
   await T.tap(W/2,H*0.5); await T.wait(2500); await T.tap(W/2,H*0.42); await T.wait(900);
   const Ln=await L.line(T); const du=await Ln.at(Ln.n-1); T.save(du, `${OUT}/${A}.jpg`); await Ln.up(); console.log(A,'ok',Ln.n,du.length); }catch(e){ console.log(A,'FAIL',e.message); } }
 await T.close(); process.exit(0); })().catch(e=>{ console.log('FAIL',e.message); process.exit(1); });
