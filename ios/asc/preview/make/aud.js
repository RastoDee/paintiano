// The piece as the app plays it, recorded from the app's own audio output. node aud.js OUT.webm artist piece SECS
const L=require('./lib.js'); const fs=require('fs');
const [OUT,A,PC,SECS]=process.argv.slice(2);
(async()=>{ const {W,H}=L; const T=await L.open({dsf:1,ss:2}); const p=T.p; await T.go(PC,A,0);
 await T.tap(W/2,H*0.5); const t0=Date.now(); await T.wait((+SECS)*1000); console.log('playing',await T.isPlaying());
 const a=await T.audio(); if(!a){ console.log('no audio'); process.exit(1); } fs.writeFileSync(OUT, Buffer.from(a.b64,'base64')); console.log('audio bytes', fs.statSync(OUT).size, 'recs', a.n, 'tap→rec', (a.t0-t0/1000).toFixed(2));
 await T.close(); process.exit(0); })().catch(e=>{ console.log('FAIL',e.message); process.exit(1); });
