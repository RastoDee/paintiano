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

// Inside the app the page is served from the device (capacitor://localhost), so the server
// calls go to the site by its full address. window.__PF_NATIVE tells the app where it runs.
const shim = `<script>(function(){try{var B='https://paintiano.app',f=window.fetch;window.__PF_NATIVE='ios';`
  + `window.fetch=function(u,o){try{if(typeof u==='string'&&u.indexOf('/api/')===0)u=B+u;}catch(e){}return f.call(this,u,o);};}catch(e){}})();</script>`;
// PF_IOS_DEBUG=1 (simulator diagnostics only, never in a TestFlight build): errors, failed loads and the
// piano samples' progress are written on top of the page, so a screenshot of the simulator shows them.
const dbg = process.env.PF_IOS_DEBUG === '1' ? `<script>(function(){var L=[],S={ok:0,bad:0,dec:0,decbad:0};function put(){try{var d=document.getElementById('pfdbg');if(!d){d=document.createElement('div');d.id='pfdbg';d.style.cssText='position:fixed;left:0;right:0;top:44px;z-index:2147483647;background:rgba(0,0,0,.82);color:#7CFC9A;font:11px/1.35 Menlo,monospace;padding:6px 8px;white-space:pre-wrap;word-break:break-all;pointer-events:none';(document.body||document.documentElement).appendChild(d);}d.textContent='samples ok '+S.ok+' bad '+S.bad+' | decode ok '+S.dec+' bad '+S.decbad+' | ctx '+(window.Tone&&Tone.context?Tone.context.state:'?')+' | sw '+('serviceWorker' in navigator)+' | '+location.href+'\\n'+L.slice(-14).join('\\n');}catch(e){}}function log(x){L.push(String(x).slice(0,220));put();}window.addEventListener('error',function(e){log('ERR '+(e.message||'')+' @'+(e.filename||'').split('/').pop()+':'+e.lineno);});window.addEventListener('unhandledrejection',function(e){log('REJ '+(e.reason&&(e.reason.message||e.reason)));});var ce=console.error;console.error=function(){log('CE '+[].slice.call(arguments).join(' '));return ce.apply(console,arguments);};var f=window.fetch;window.fetch=function(u,o){var s=String(u&&u.url||u);return f.apply(this,arguments).then(function(r){if(s.indexOf('salamander')>=0){if(r.ok)S.ok++;else{S.bad++;log('SAMPLE '+r.status+' '+s);}put();}else if(!r.ok)log('HTTP '+r.status+' '+s.slice(0,120));return r;},function(e){if(s.indexOf('salamander')>=0)S.bad++;log('FETCHFAIL '+s.slice(0,120)+' '+(e&&e.message));throw e;});};var AC=window.AudioContext||window.webkitAudioContext;if(AC){var d0=AC.prototype.decodeAudioData;AC.prototype.decodeAudioData=function(){var p=d0.apply(this,arguments);if(p&&p.then)p.then(function(){S.dec++;put();},function(e){S.decbad++;log('DECODE '+(e&&e.message));});return p;};}setInterval(put,1000);})();</script>` : '';
let html = readFileSync(resolve(out, 'play.html'), 'utf8');
if (!/<head[^>]*>/i.test(html)) { console.error('ios-web: play.html has no <head>'); process.exit(1); }
html = html.replace(/<head[^>]*>/i, (m) => m + shim + dbg);
writeFileSync(resolve(out, 'index.html'), html);
rmSync(resolve(out, 'play.html'), { force: true });
console.log('ios-web: ready');
