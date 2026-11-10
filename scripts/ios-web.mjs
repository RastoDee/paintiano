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
let html = readFileSync(resolve(out, 'play.html'), 'utf8');
if (!/<head[^>]*>/i.test(html)) { console.error('ios-web: play.html has no <head>'); process.exit(1); }
html = html.replace(/<head[^>]*>/i, (m) => m + shim);
writeFileSync(resolve(out, 'index.html'), html);
rmSync(resolve(out, 'play.html'), { force: true });
console.log('ios-web: ready');
