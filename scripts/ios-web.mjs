// scripts/ios-web.mjs
// Makes the web bundle the iOS app ships with: the built site (dist/) with the app
// itself (play.html) as the start page — the landing page and the service worker stay on the web.
// Run after `npm run build`:   node scripts/ios-web.mjs   →  ios-web/   (then `npx cap sync ios`)
import { cpSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const src = resolve(root, 'dist'), out = resolve(root, 'ios-web');
if (!existsSync(resolve(src, 'play.html'))) { console.error('ios-web: dist/play.html is missing — run `npm run build` first'); process.exit(1); }

rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });

// web-only files: the service worker (the app is already on the device), the landing page, crawler files
for (const f of readdirSync(out)) {
  if (/^(sw\.js|workbox-.*\.js|registerSW\.js|manifest\.webmanifest|robots\.txt|sitemap\.xml|concept\.html)$/.test(f)) rmSync(resolve(out, f), { force: true });
}

// Web-only weight the app never opens: the landing page's media, the link-preview cards, the book PDFs (the app opens the
// summary from the website), the landing's showcase / mockups / demo, the Pricing page (not shown in the iOS app) and the
// site's own share images. Kept: the app's code, fonts, the piano, sample pictures, the tour videos, the Studio and gallery art.
for (const d of ['landing', 'og', 'book', 'showcase', 'mockups', 'demo']) rmSync(resolve(out, d), { recursive: true, force: true });
for (const f of ['pricing.html', 'og-cover.png', 'ph_card1_hero.png', 'author.jpg']) rmSync(resolve(out, f), { force: true });

// Inside the app the page is served from the device (capacitor://localhost). Everything on the device
// (the piano samples, pictures, the legal pages) is read by the web view itself — CapacitorHttp's global
// fetch patch is OFF (capacitor.config.json): with it on, those local reads came back empty (status 0).
// Only the server calls (/api/…) go out through the native HTTP plugin, to the site by its full address
// and with the app's own origin, so the server can tell the app from a stranger. window.__PF_NATIVE says where it runs.
// PF_NATIVE=android makes the same bundle for the Android app: there the page is served from https://localhost and the web view
// reads sound and video files normally (no byte-range detour). The server calls keep the app's origin header for now.
const NATIVE = process.env.PF_NATIVE === 'android' ? 'android' : 'ios';
const shim = `<script>(function(){try{var B='https://paintiano.app',O='capacitor://localhost',LO='${NATIVE === 'android' ? 'https://localhost' : 'capacitor://localhost'}',f=window.fetch;window.__PF_NATIVE='${NATIVE}';
function nat(u,o){o=o||{};var C=window.Capacitor,P=C&&C.Plugins&&C.Plugins.CapacitorHttp,h={},k,src=o.headers||{};
if(typeof src.forEach==='function'&&!Array.isArray(src)){src.forEach(function(v,n){h[n]=v;});}else{for(k in src)h[k]=src[k];}
h.Origin=O;var d=o.body;if(typeof d==='string'){try{d=JSON.parse(d);}catch(e){}}
var req={url:B+u,method:(o.method||'GET').toUpperCase(),headers:h,data:d,responseType:'text',connectTimeout:30000,readTimeout:120000};
var p=(P&&P.request)?P.request(req):(C&&C.nativePromise?C.nativePromise('CapacitorHttp','request',req):null);
if(!p)return f.call(window,B+u,o);
return p.then(function(r){var t=(typeof r.data==='string')?r.data:JSON.stringify(r.data==null?'':r.data);var st=r.status||0;
return new Response((st===204||st===304)?null:t,{status:(st>=200&&st<600)?st:502,headers:{'Content-Type':'application/json'}});});}
// Sound and video files on the device: the web view answers a plain read of them without an HTTP status
// (status 0, so every loader takes it for a failure). Asked for as a byte range they come back properly;
// the bytes are then handed on as an ordinary 200 answer.
var MT={mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',m4a:'audio/mp4',aac:'audio/aac',flac:'audio/flac',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',mid:'audio/midi',midi:'audio/midi'};
function media(u,o){var m=/\\.([a-z0-9]+)(?:[?#].*)?$/i.exec(u),x=m?m[1].toLowerCase():'';if(!MT[x]||(o&&o.method&&String(o.method).toUpperCase()!=='GET'))return null;
return f.call(window,u,{headers:{Range:'bytes=0-'}}).then(function(r){if(!(r.status===206||r.status===200||r.status===0))return r;return r.arrayBuffer().then(function(b){return new Response(b,{status:200,headers:{'Content-Type':MT[x]}});});});}
window.fetch=function(u,o){try{if(typeof u==='string'){if(u.indexOf('/api/')===0)return nat(u,o);if(${NATIVE === 'ios'}&&(u.charAt(0)==='/'||u.indexOf(LO+'/')===0)){var p=media(u,o);if(p)return p;}}}catch(e){}return f.apply(this,arguments);};}catch(e){}})();</script>`;
// PF_IOS_DEBUG=1 (simulator diagnostics only, never in a TestFlight build): errors, failed loads and the
// piano samples' progress are written on top of the page, so a screenshot of the simulator shows them.
const dbg = process.env.PF_IOS_DEBUG === '1' ? `<script>(function(){var L=[],S={ok:0,bad:0,dec:0,decbad:0};function put(){try{var d=document.getElementById('pfdbg');if(!d){d=document.createElement('div');d.id='pfdbg';d.style.cssText='position:fixed;left:0;right:0;top:44px;z-index:2147483647;background:rgba(0,0,0,.82);color:#7CFC9A;font:11px/1.35 Menlo,monospace;padding:6px 8px;white-space:pre-wrap;word-break:break-all;pointer-events:none';(document.body||document.documentElement).appendChild(d);}d.textContent='samples ok '+S.ok+' bad '+S.bad+' | decode ok '+S.dec+' bad '+S.decbad+' | ctx '+(window.Tone&&Tone.context?Tone.context.state:'?')+' | sw '+('serviceWorker' in navigator)+' | '+location.href+'\\n'+L.slice(-14).join('\\n');}catch(e){}}function log(x){L.push(String(x).slice(0,220));put();}window.addEventListener('error',function(e){log('ERR '+(e.message||'')+' @'+(e.filename||'').split('/').pop()+':'+e.lineno);});window.addEventListener('unhandledrejection',function(e){log('REJ '+(e.reason&&(e.reason.message||e.reason)));});var ce=console.error;console.error=function(){log('CE '+[].slice.call(arguments).join(' '));return ce.apply(console,arguments);};var f=window.fetch;window.fetch=function(u,o){var s=String(u&&u.url||u);return f.apply(this,arguments).then(function(r){if(s.indexOf('salamander')>=0){if(r.ok)S.ok++;else{S.bad++;log('SAMPLE '+r.status+' '+s);}put();}else if(!r.ok)log('HTTP '+r.status+' '+s.slice(0,120));return r;},function(e){if(s.indexOf('salamander')>=0)S.bad++;log('FETCHFAIL '+s.slice(0,120)+' '+(e&&e.message));throw e;});};var AC=window.AudioContext||window.webkitAudioContext;if(AC){var d0=AC.prototype.decodeAudioData;AC.prototype.decodeAudioData=function(){var p=d0.apply(this,arguments);if(p&&p.then)p.then(function(){S.dec++;put();},function(e){S.decbad++;log('DECODE '+(e&&e.message));});return p;};}setInterval(put,1000);})();</script>` : '';
let html = readFileSync(resolve(out, 'play.html'), 'utf8');
if (!/<head[^>]*>/i.test(html)) { console.error('ios-web: play.html has no <head>'); process.exit(1); }
html = html.replace(/<head[^>]*>/i, (m) => m + shim + dbg);
writeFileSync(resolve(out, 'index.html'), html);
rmSync(resolve(out, 'play.html'), { force: true });
console.log('ios-web: ready (' + NATIVE + ')');
