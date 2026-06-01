import React from 'react';
import ReactDOM from 'react-dom/client';
import Paintiano from './paintiano.jsx';
import { registerSW } from 'virtual:pwa-register';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Paintiano />
  </React.StrictMode>
);

// ── PWA update handling ──────────────────────────────────────────────────────
// Offline-first caching means the FIRST paint after a deploy is served from the
// previous precache (by design — that's what makes the app work offline). We do
// NOT force a reload to the new build, because an in-progress painting lives only
// in memory and a reload would wipe it. Instead, in 'prompt' mode we surface a
// small, dismissible toast and let the user reload to the fresh build WHEN THEY
// are ready — one tap, no lost work.
const updateSW = registerSW({
  onNeedRefresh() { showUpdateToast(hardUpdate); },
});

// Hard update: tapping "Refresh" must ALWAYS land on the freshest build, even if
// the service worker is being stubborn. We unregister every SW and wipe all
// caches, then reload straight from the network. (updateSW(true) alone can race
// the SW activation against the reload and leave you one version behind.)
async function hardUpdate() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
    }
  } catch (_) {
    /* best effort */
  }
  // Cache-busting reload from the network.
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('v', Date.now().toString(36));
    window.location.replace(u.toString());
  } catch (_) {
    window.location.reload();
  }
}

// Minimal localized strings (falls back to EN). Reads the language the app saved.
function _updLang() {
  try {
    const l = (localStorage.getItem('paintiano_lang') || navigator.language || 'en')
      .slice(0, 2).toLowerCase();
    return ['en', 'de', 'fr', 'es', 'sk'].includes(l) ? l : 'en';
  } catch (_) { return 'en'; }
}
const _UPD_T = {
  en: { msg: 'New version available', cta: 'Refresh' },
  de: { msg: 'Neue Version verfügbar', cta: 'Aktualisieren' },
  fr: { msg: 'Nouvelle version disponible', cta: 'Actualiser' },
  es: { msg: 'Nueva versión disponible', cta: 'Actualizar' },
  sk: { msg: 'Nová verzia k dispozícii', cta: 'Obnoviť' },
};

function showUpdateToast(onApply) {
  if (document.getElementById('pf-update-toast')) return;
  const t = _UPD_T[_updLang()] || _UPD_T.en;

  const wrap = document.createElement('div');
  wrap.id = 'pf-update-toast';
  wrap.setAttribute('role', 'status');
  wrap.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:22px', 'transform:translateX(-50%)',
    'z-index:100002', 'display:flex', 'align-items:center', 'gap:14px',
    'padding:11px 14px 11px 18px', 'border-radius:999px',
    'background:rgba(10,10,18,.92)', 'backdrop-filter:blur(8px)',
    '-webkit-backdrop-filter:blur(8px)',
    'border:1px solid rgba(201,168,76,.45)', 'box-shadow:0 8px 30px rgba(0,0,0,.5)',
    'color:#f5f5f5',
    'font:500 13px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
    'letter-spacing:.02em', 'max-width:calc(100vw - 32px)',
  ].join(';');

  const msg = document.createElement('span');
  msg.textContent = t.msg;
  msg.style.cssText = 'opacity:.9';

  const btn = document.createElement('button');
  btn.textContent = t.cta;
  btn.style.cssText = [
    'cursor:pointer', 'border:none', 'border-radius:999px', 'padding:7px 16px',
    'background:#c9a84c', 'color:#0a0a12', 'font:600 12px/1 inherit',
    'letter-spacing:.06em', 'text-transform:uppercase', 'white-space:nowrap',
  ].join(';');
  btn.onclick = () => { btn.disabled = true; btn.textContent = '…'; onApply(); };

  const x = document.createElement('button');
  x.setAttribute('aria-label', 'Dismiss');
  x.textContent = '\u00d7';
  x.style.cssText = [
    'cursor:pointer', 'border:none', 'background:transparent', 'color:#999',
    'font-size:20px', 'line-height:1', 'padding:0 2px',
  ].join(';');
  x.onclick = () => wrap.remove();

  wrap.append(msg, btn, x);
  document.body.appendChild(wrap);
}
