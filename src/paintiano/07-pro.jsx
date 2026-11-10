// ═════════════════════════════════════════════════════════════════════════════
// §7  PAINTIANO PRO  —  monetization (license keys, paywall, AI trial, watermark)
// ─────────────────────────────────────────────────────────────────────────────
// Concatenated module (no imports/exports — same style as 01-core-head.jsx).
// React hooks (useState/useEffect/useCallback) are already imported at the top
// of the bundle by 01-core-head.jsx, so they're in scope here.
//
// What this module provides to 05-main.jsx:
//   • useProStatus()        → { proStatus, isPro, licenseKey, maskedEmail,
//                               activateLicense, deactivateLicense, openCheckout }
//   • useAiTrial()          → { trialUsed, trialLeft, trialExhausted,
//                               consumeTrial, resetTrial } (free-tier AI counter)
//   • applyWatermark(canvas, isPro)  → stamps "paintiano.app" on free exports
//   • <ProPaywall .../>      → the modal (gold-themed, matches app aesthetic)
//   • <ProBadge t={t}/>      → small gold "PRO" pill for the header
//   • PRO_CFG               → endpoints, checkout URL, price, trial size
//
// Networking goes ONLY through our own /api/validate (same origin). The Supabase
// service-role key never touches the browser. AI cost coverage: free users get
// PRO_CFG.trialMax (5) heavy AI compositions (aiCompose + composeFromImage),
// counted in localStorage; helper calls (morph pool, ping) are never counted.
// ═════════════════════════════════════════════════════════════════════════════

const PRO_CFG = {
  // ── Checkout provider: Paddle Billing (Merchant of Record) ────────────────
  // We migrated from Lemon Squeezy → Paddle in early 2026 after LS declined
  // the store application. Paddle is approved as of the verification email
  // referenced in chat history. The flow is similar to LS: client-side token
  // opens the overlay, our /api/paddle-webhook receives transaction.completed,
  // we generate a license key into Supabase, the existing /api/validate
  // endpoint then verifies activation requests from the app.
  //
  // Set checkoutDisabled=true to force "Coming soon" tile (kill switch).
  // Flipped to FALSE on 4 Jun 2026 after Paddle "you're live" email — they
  // resolved the earlier 400 "Something went wrong" on transaction-checkout.
  // Account is now activated and ready to take payments.
  checkoutDisabled: false,
  // Paddle's client-side token. PUBLIC — safe to ship in the bundle.
  // Used by Paddle.js to open the overlay checkout. Production token.
  paddleClientToken: 'live_3ab34fef52eea1baa3656517dec',
  // Paddle environment: 'production' (live) or 'sandbox' (test).
  paddleEnv: 'production',
  // Price IDs — TWO paid tiers since the 3-tier model (Jun 2026):
  //   Pro    = full deterministic tool, NO AI (lifetime). €9.99.
  //   Pro AI = Pro for life + the AI pass: AI composition for 12 months (30 pieces &
  //            melodies a day, 500 over the 12 months). €19.99. A further year of AI
  //            is the upgrade price (€10); nothing renews by itself.
  // The legacy single price ID below is the original "Paintiano Pro Lifetime"
  // (€9.99). It is REUSED as the Pro tier price for now; the Pro AI price must
  // be created in the Paddle catalog and its ID pasted into paddlePriceIdProAI.
  // NOTE: until the Pro AI price exists in Paddle (step C), paddlePriceIdProAI
  // is null and openCheckout('pro_ai') will fall back to the Pro price.
  paddlePriceIdPro:   'pri_01kt6s053namfk25tvvdw2eaey',
  paddlePriceIdProAI: 'pri_01ktkmf6ghq0kk3vkg2dtnjd7q',
  // Pro → Pro AI upgrade (€10, so Pro €9.99 + upgrade = the Pro AI €19.99).
  // Opened with customData.upgrade_from = the buyer's Pro key; the webhook then
  // turns that same key into Pro AI. Until the ID is set, a Pro user's upgrade
  // falls back to the full Pro AI price.
  paddlePriceIdUpgrade: 'pri_01m5zep41d8kv3m6tcxbbnxsb2',
  // Our own Vercel Edge validation endpoint (same origin as the app).
  // Provider-agnostic — reads licenses table that Paddle webhook writes into.
  validateEndpoint: '/api/validate',
  // localStorage keys
  licenseStoreKey: 'paintiano_license_v1',
  trialStoreKey: 'paintiano_ai_trial_v1',
  // Trust a cached "valid" verdict this long before re-validating online
  revalidateAfterMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  // Free-tier heavy-AI allowance before the paywall. Small + non-renewing:
  // the trial exists to let Free AND Pro users taste AI a few times, then
  // funnels them to Pro AI. Lowered 5→3 with the 3-tier model (Jun 2026).
  trialMax: 3,
  // Display prices (informational; real price + VAT come from Paddle checkout).
  // No early-bird window any more (Oct 2026): these are the prices, plain.
  displayPricePro:   '€9.99',
  displayPriceProAI: '€19.99',
};

// Accent colour used to brand AI features across the paywall (Pro AI tier card,
// PRO AI badge, ✓ checks, price line, CTA). Same hex as the in-app AI accent
// (AI Compose chip, MFI button, mood-AI text) so the paywall reads as a clear
// continuation of those features — gold = Pro tier, purple = Pro AI tier.
const AI_PURPLE = '#dcb4ff';
const AI_PURPLE_DEEP = 'rgba(220,150,255,1)';
const AI_PURPLE_BORDER = 'rgba(220,150,255,.5)';
const AI_PURPLE_GLOW = 'rgba(220,150,255,.25)';
const AI_PURPLE_BG = 'rgba(220,150,255,.06)';

// ─── license storage helpers ────────────────────────────────────────────────
function _proReadCache() {
  try {
    const raw = localStorage.getItem(PRO_CFG.licenseStoreKey);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return (p && typeof p.key === 'string') ? p : null;
  } catch (_) { return null; }
}
function _proWriteCache(key, extra) {
  try {
    localStorage.setItem(PRO_CFG.licenseStoreKey,
      JSON.stringify(Object.assign({ key, validatedAt: Date.now() }, extra || {})));
  } catch (_) {}
}
function _proClearCache() {
  try { localStorage.removeItem(PRO_CFG.licenseStoreKey); } catch (_) {}
}

// The current anonymous PostHog visit id as '&pv=…' (funnel across a page change;
// PostHog runs cookieless, so a new page would otherwise start a new visit).
function _pfVisitParam() {
  try {
    const d = window.posthog && window.posthog.get_distinct_id && window.posthog.get_distinct_id();
    return (typeof d === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(d)) ? '&pv=' + d : '';
  } catch (_) { return ''; }
}

// ─── AI fair use (Nov 2026) ─────────────────────────────────────────────────
// /api/compose counts AI on the server: a Pro AI key gets 30 pieces & melodies
// a day, everyone else a small allowance per network. Every AI call in the app
// goes through pfAiFetch, which sends the licence key to OUR endpoint only
// (never to a third party) and turns the server's 429 "pf_daily_limit" into
// one recognisable error + a 'pf-ai-limit' window event (the app shows a note
// and does NOT latch "AI is down"). Other endpoints in the same try-loop are
// skipped for a moment so the limit error is the one that surfaces.
const PF_AI_LIMIT = { at: 0, info: null };
function pfAiLimitRecent() { return Date.now() - PF_AI_LIMIT.at < 15000; }
async function pfAiFetch(ep, init) {
  const own = typeof ep === 'string' && ep.charAt(0) === '/';
  if (!own && pfAiLimitRecent()) { const e = new Error('pf_daily_limit'); e._aiLimit = true; throw e; }
  const opt = Object.assign({}, init || {});
  // A body from pfPromptBody carries pf = { kind, args }: our endpoint gets ONLY that (it builds the
  // prompt itself — it composes music and nothing else); a direct call (claude.ai preview) gets the full body.
  if (typeof opt.body === 'string' && opt.body.indexOf('"pf"') >= 0) {
    try { const b = JSON.parse(opt.body); if (b && b.pf) { const pf = b.pf; delete b.pf; opt.body = JSON.stringify(own ? { kind: pf.kind, args: pf.args } : b); } } catch (_) {}
  }
  if (own) {
    const h = Object.assign({}, opt.headers || {});
    try { const c = _proReadCache(); if (c && c.key) h['X-Paintiano-Key'] = c.key; } catch (_) {}
    opt.headers = h;
  }
  const r = await fetch(ep, opt);
  if (own && r.status === 429) {
    let d = null; try { d = await r.clone().json(); } catch (_) {}
    if (d && d.error && (d.error.type === 'pf_daily_limit' || d.error.type === 'pf_year_limit')) {
      PF_AI_LIMIT.at = Date.now(); PF_AI_LIMIT.info = d.pf || null;
      try { window.dispatchEvent(new CustomEvent('pf-ai-limit', { detail: d.pf || {} })); } catch (_) {}
      const e = new Error('pf_daily_limit'); e._aiLimit = true; throw e;
    }
  }
  return r;
}

// ─── refund fair use (Nov 2026) ──────────────────────────────────────────────
// A full refund is given while the key has made few watermark-free exports, so the
// app tells our server "one more" per Web / Print export made with a licence — the
// key and a number, never the picture. Offline it waits in a small local queue.
const PF_EXP_Q = 'paintiano_exp_q';
let _pfExpBusy = false;
async function pfExportFlush() {
  if (_pfExpBusy) return;
  let q = 0, key = null;
  try { q = parseInt(localStorage.getItem(PF_EXP_Q) || '0', 10) || 0; const c = _proReadCache(); key = c && c.key; } catch (_) {}
  if (!q || !key) return;
  _pfExpBusy = true;
  try {
    const n = Math.min(q, 50);
    const r = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, n }) });
    if (r.ok) { try { const now = parseInt(localStorage.getItem(PF_EXP_Q) || '0', 10) || 0; localStorage.setItem(PF_EXP_Q, String(Math.max(0, now - n))); } catch (_) {} }
  } catch (_) {} finally { _pfExpBusy = false; }
}
function pfExportHit() {
  try { const c = _proReadCache(); if (!c || !c.key) return; localStorage.setItem(PF_EXP_Q, String((parseInt(localStorage.getItem(PF_EXP_Q) || '0', 10) || 0) + 1)); } catch (_) { return; }
  pfExportFlush();
}
try { if (typeof window !== 'undefined') { window.addEventListener('online', () => { pfExportFlush(); }); setTimeout(pfExportFlush, 9000); } } catch (_) {}

// ─── local prices (Nov 2026) ─────────────────────────────────────────────────
// Paddle can carry a price per country (Catalog › price › Country specific
// prices). The app's texts say the base price (€9.99 / €19.99 / €10); when the
// paywall opens, Paddle is asked once what THIS visitor will pay (it places the
// visitor by network, as its checkout does) and the price in every paywall text
// is swapped for it — so the label and the checkout never disagree. No answer
// (offline, blocked) → the base prices stay.
const PF_PX = { map: null, busy: null };

// ─── the iOS app: purchases go through Apple (In-App Purchase) ────────────────
// Inside the iOS app (window.__PF_NATIVE === 'ios', set by the app's own start page) nothing is sold
// through Paddle. Two Apple products exist: Pro (bought once) and the AI pass (12 months, bought again
// for each further year); "Pro AI" is the two bought one after the other. Apple's transaction ids go to
// /api/apple, which checks them at Apple and answers with the licence key — from there on the app works
// with the key exactly as on the web. A key bought on the web can still be entered.
const PF_IOS = (typeof window !== 'undefined' && window.__PF_NATIVE === 'ios');
const PF_IAP = { pro: 'app.paintiano.pro', pass: 'app.paintiano.aipass12' };
function _pfNP() { try { const C = window.Capacitor; return (C && C.Plugins && C.Plugins.NativePurchases) || null; } catch (_) { return null; } }
async function _pfIosReport(ids, key) {
  try {
    const r = await fetch('/api/apple', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactions: ids, key: key || '' }) });
    const j = await r.json().catch(() => null);
    return (j && typeof j === 'object') ? j : { ok: false, reason: 'server_error' };
  } catch (_) { return { ok: false, reason: 'network' }; }
}
// The prices as the App Store shows them to this buyer (Apple requires its own prices on screen).
function _pfIosPrices() {
  const NP = _pfNP(); if (!NP) return Promise.reject(new Error('no store'));
  return NP.getProducts({ productIdentifiers: [PF_IAP.pro, PF_IAP.pass], productType: 'inapp' }).then((r) => {
    const by = {}; ((r && r.products) || []).forEach((p) => { if (p) by[p.identifier || p.productIdentifier] = p; });
    const a = by[PF_IAP.pro], b = by[PF_IAP.pass], m = {};
    if (a && a.priceString) m.pro = a.priceString;
    if (b && b.priceString) m.up = b.priceString;
    if (a && b && typeof a.price === 'number' && typeof b.price === 'number' && a.currencyCode && a.currencyCode === b.currencyCode) {
      // the sum written the way Apple wrote the single price ("$8.99" → "$17.98", "9,99 €" → "19,98 €")
      try {
        const mm = String(a.priceString || '').match(/\d[\d\s.,\u00a0\u202f]*\d|\d/);
        if (mm) { const sep = (mm[0].match(/[.,](?=\d{1,2}$)/) || [''])[0]; const sum = a.price + b.price;
          m.pro_ai = a.priceString.replace(mm[0], sep ? sum.toFixed(2).replace('.', sep) : String(Math.round(sum))); }
        else m.pro_ai = new Intl.NumberFormat(undefined, { style: 'currency', currency: a.currencyCode }).format(a.price + b.price);
      } catch (_) {}
    }
    if (!m.pro && !m.up) throw new Error('no prices');
    return m;
  });
}
// Buy. tier 'pro' | 'pro_ai' (Pro, then the pass) | 'upgrade' (the pass on the key in use).
// → { ok:true, key } | { ok:false, cancelled:true } | { ok:false, reason }
async function pfIosBuy(tier, key) {
  const NP = _pfNP(); if (!NP) return { ok: false, reason: 'no_store' };
  const ids = []; let cancelled = false, failed = null;
  const one = async (pid) => {
    try { const t = await NP.purchaseProduct({ productIdentifier: pid, productType: 'inapp', quantity: 1 }); if (t && t.transactionId) ids.push(String(t.transactionId)); return true; }
    catch (e) { const m = String((e && (e.message || e.errorMessage)) || e || ''); if (/cancel/i.test(m)) cancelled = true; else failed = m || 'failed'; return false; }
  };
  let go = true;
  if (tier === 'pro' || tier === 'pro_ai') go = await one(PF_IAP.pro);
  if (go && (tier === 'pro_ai' || tier === 'upgrade')) await one(PF_IAP.pass);
  if (!ids.length) return cancelled ? { ok: false, cancelled: true } : { ok: false, reason: failed || 'failed' };
  const r = await _pfIosReport(ids, key);
  if (r && r.ok && r.key) return { ok: true, key: r.key };
  return { ok: false, reason: (r && r.reason) || 'not_granted', detail: r && r.detail };
}
// "Restore purchases": everything this Apple ID has bought → the licence key.
async function pfIosRestore(key) {
  const NP = _pfNP(); if (!NP) return { ok: false, reason: 'no_store' };
  try { await NP.restorePurchases(); } catch (_) {}
  let list = [];
  try { const r = await NP.getPurchases({}); list = (r && r.purchases) || []; } catch (_) {}
  const ids = [...new Set(list.filter((t) => t && (t.productIdentifier === PF_IAP.pro || t.productIdentifier === PF_IAP.pass) && t.transactionId).map((t) => String(t.transactionId)))];
  if (!ids.length) return { ok: false, reason: 'none' };
  const r = await _pfIosReport(ids, key);
  if (r && r.ok && r.key) return { ok: true, key: r.key };
  return { ok: false, reason: (r && r.ok) ? 'none' : ((r && r.reason) || 'server_error'), detail: r && r.detail };
}
// A short code after a failed-purchase message, e.g. " (server_error · apple_401)".
function _pfIosWhy(r) { const a = r && r.reason ? String(r.reason).slice(0, 60) : '', b = r && r.detail ? String(r.detail).slice(0, 40) : ''; return a ? ' (' + a + (b ? ' \u00b7 ' + b : '') + ')' : ''; }
// The Apple purchases this Apple ID holds: [{ product:'pro'|'pass', id }].
async function pfIosPurchases() {
  const NP = _pfNP(); if (!NP) return [];
  try { const r = await NP.getPurchases({}); const seen = {};
    return ((r && r.purchases) || []).filter((t) => t && t.transactionId && (t.productIdentifier === PF_IAP.pro || t.productIdentifier === PF_IAP.pass))
      .map((t) => ({ product: t.productIdentifier === PF_IAP.pro ? 'pro' : 'pass', id: String(t.transactionId) }))
      .filter((t) => (seen[t.id] ? false : (seen[t.id] = true)));
  } catch (_) { return []; }
}
// Apple's own refund request sheet for one purchase (Apple decides; our server hears of a refund from Apple).
// → { ok:true } (sent) | { ok:false, cancelled:true } | { ok:false, reason }
async function pfIosRefund(transactionId) {
  try {
    const C = window.Capacitor; const P = C && C.Plugins && C.Plugins.PfRefund; const o = { transactionId: String(transactionId) };
    const r = P && P.request ? await P.request(o) : await C.nativePromise('PfRefund', 'request', o);
    if (r && r.status === 'requested') return { ok: true };
    if (r && r.status === 'cancelled') return { ok: false, cancelled: true };
    return { ok: false, reason: 'unknown' };
  } catch (e) { return { ok: false, reason: String((e && e.message) || e || 'failed').slice(0, 80) }; }
}
function _pfPxTidy(v) { return typeof v === 'string' ? v.replace(/[.,]00(?=\D*$)/, '').trim() : null; }
function pfPxLoad() {
  if (PF_PX.map) return Promise.resolve(PF_PX.map);
  if (PF_PX.busy) return PF_PX.busy;
  if (PF_IOS) {   // in the iOS app the prices are Apple's
    PF_PX.busy = _pfIosPrices().then((m) => { PF_PX.map = m; return m; });
    PF_PX.busy.catch(() => { PF_PX.busy = null; });
    return PF_PX.busy;
  }
  PF_PX.busy = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'));
    const go = () => {
      try {
        const P = window.Paddle; if (!P || !P.PricePreview) return reject(new Error('no paddle'));
        P.Environment.set(PRO_CFG.paddleEnv); P.Initialize({ token: PRO_CFG.paddleClientToken });
        const ids = { pro: PRO_CFG.paddlePriceIdPro, pro_ai: PRO_CFG.paddlePriceIdProAI, up: PRO_CFG.paddlePriceIdUpgrade };
        const items = Object.keys(ids).filter(k => ids[k]).map(k => ({ priceId: ids[k], quantity: 1 }));
        P.PricePreview({ items }).then(r => {
          const m = {};
          ((r && r.data && r.data.details && r.data.details.lineItems) || []).forEach(li => {
            const id = li && li.price && li.price.id; const k = Object.keys(ids).find(x => ids[x] === id);
            const v = li && li.formattedTotals && _pfPxTidy(li.formattedTotals.total || li.formattedTotals.subtotal);
            if (k && v) m[k] = v;
          });
          if (!m.pro && !m.pro_ai) return reject(new Error('no prices'));
          PF_PX.map = m; resolve(m);
        }).catch(reject);
      } catch (e) { reject(e); }
    };
    if (window.Paddle) return go();
    let sc = document.querySelector('script[data-paintiano-paddle]');
    if (!sc) { sc = document.createElement('script'); sc.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'; sc.async = true; sc.setAttribute('data-paintiano-paddle', '1'); document.head.appendChild(sc); }
    sc.addEventListener('load', go); sc.addEventListener('error', () => reject(new Error('paddle script load failed')));
  });
  PF_PX.busy.catch(() => { PF_PX.busy = null; });
  return PF_PX.busy;
}
// A text with the base price in it → the same text with the visitor's price.
function pfPx(s) {
  const m = PF_PX.map; if (!m || typeof s !== 'string' || s.indexOf('€') < 0) return s;
  let o = s;
  if (m.pro_ai) o = o.replace(/€\s?19[.,]99|19[.,]99\s?€/g, () => m.pro_ai);
  if (m.pro)    o = o.replace(/€\s?0(?![\d.,])/g, () => m.pro.replace(/\d[\d.,\s]*\d|\d/, '0'));   // Free: zero in the same currency
  if (m.pro)    o = o.replace(/€\s?9[.,]99|9[.,]99\s?€/g, () => m.pro);
  if (m.up)     o = o.replace(/€\s?10(?![\d.,])/g, () => m.up).replace(/(^|[^\d.,])10\s?€/g, (x, pre) => pre + m.up);   // (no lookbehind: old Safari cannot parse it)
  return o;
}

// ─── server validation (through our own endpoint) ────────────────────────────
async function _proValidate(key, check = false) {
  const ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const tm = ac ? setTimeout(() => { try { ac.abort(); } catch (_) {} }, 15000) : null;
  try {
    const r = await fetch(PRO_CFG.validateEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(check ? { key, check: true } : { key }),
      signal: ac ? ac.signal : undefined,
    });
    // A backend outage (5xx / 429) is not a verdict on the key — treat it like
    // being offline so a cached paid tier is kept, never demoted.
    if (!r.ok) return { valid: false, reason: 'http_' + r.status, offline: (r.status >= 500 || r.status === 429) };
    return await r.json();
  } catch (_) {
    return { valid: false, reason: 'network', offline: true };
  } finally {
    if (tm) clearTimeout(tm);
  }
}

// A day in the app's language (the AI pass: "until 10 November 2027").
const PF_DATE_LOC = { EN:'en-GB', DE:'de-DE', FR:'fr-FR', ES:'es-ES', SK:'sk-SK', PT:'pt-PT', zh:'zh-CN', zhTW:'zh-TW', ja:'ja-JP' };
// Money as the buyer paid it (Paddle amounts are in the currency's smallest unit).
const PF_ZERO_DEC = { JPY:1, KRW:1, VND:1, CLP:1, ISK:1, UGX:1, PYG:1, XAF:1, XOF:1 };
function pfMoney(minor, cur, lang) {
  if (minor == null || !cur) return '';
  const v = PF_ZERO_DEC[cur] ? Number(minor) : Number(minor) / 100;
  if (!Number.isFinite(v)) return '';
  try { return new Intl.NumberFormat(PF_DATE_LOC[lang] || 'en-GB', { style: 'currency', currency: cur, minimumFractionDigits: Number.isInteger(v) ? 0 : 2 }).format(v); }
  catch (_) { return v + ' ' + cur; }
}
// The in-app refund (api/refund.js): a preview, and — with confirm — the request itself.
async function pfRefundCall(key, confirm) {
  try {
    const r = await fetch('/api/refund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(confirm ? { key, confirm: true } : { key }) });
    const j = await r.json().catch(() => null);
    return j && typeof j === 'object' ? j : { ok: false, reason: 'server_error' };
  } catch (_) { return { ok: false, reason: 'network' }; }
}
function pfFmtDay(ms, lang) {
  try { return new Date(ms).toLocaleDateString(PF_DATE_LOC[lang] || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch (_) { try { return new Date(ms).toISOString().slice(0, 10); } catch (__) { return ''; } }
}

// ─── Pro status hook ──────────────────────────────────────────────────────────
function useProStatus() {
  // proStatus: 'loading' | 'free' | 'pro' | 'pro_ai'
  //   'pro'    = paid, full tool, NO AI beyond the trial (AI runs on trial like free)
  //   'pro_ai' = paid, full tool + AI (server fair use: 30 pieces & melodies a day)
  // isPro stays true for BOTH paid tiers (watermark/DPI300 gating unchanged);
  // isProAI is the new flag that unlocks AI beyond the trial.
  const [proStatus, setProStatus] = useState('loading');
  const [licenseKey, setLicenseKey] = useState(null);
  const [maskedEmail, setMaskedEmail] = useState(null);
  // true once a just-paid upgrade (/play?upgraded=1) is confirmed as Pro AI.
  const [justUpgraded, setJustUpgraded] = useState(false);

  // Map a validated tier string to a proStatus value. Defaults to 'pro' for
  // any unknown/missing tier so a valid-but-untagged key still unlocks the
  // paid tool (safe: AI stays gated behind pro_ai).
  const _tierToStatus = (tier) => (tier === 'pro_ai' ? 'pro_ai' : 'pro');
  // THE AI PASS (Nov 2026): Pro is for life, AI runs for 12 months from each purchase.
  //   aiUntil   ms | null — when this key's AI ends (null: no pass, or AI with no end date)
  //   aiExpired a pass that has ended: the key is plain Pro until another year is added
  // The server decides (validate: ai_until, ai_expired); the device's own clock also
  // ends a pass, so it does not outlive its date while offline.
  const [aiUntil, setAiUntil] = useState(null);
  const [aiExpired, setAiExpired] = useState(false);
  // In-app refund: when its 14-day window closes (ms | null). From validate (refund_until).
  const [refundUntil, setRefundUntil] = useState(null);
  const _refOf = (r) => { const u = r && r.refund_until ? Date.parse(r.refund_until) : NaN; return Number.isFinite(u) ? u : null; };
  const _passOf = (r) => { const u = r && r.ai_until ? Date.parse(r.ai_until) : NaN; return Number.isFinite(u) ? u : null; };
  const _apply = (tier, until, expired, refund) => {
    let st = _tierToStatus(tier), ex = !!expired;
    if (st === 'pro_ai' && until && Date.now() > until) { st = 'pro'; ex = true; }
    setProStatus(st); setAiUntil(until || null); setAiExpired(ex); setRefundUntil(refund || null);
    return st;
  };
  const _cacheOf = (res) => ({ email: res.email, tier: res.tier, aiUntil: _passOf(res), aiExpired: !!res.ai_expired, refundUntil: _refOf(res) });

  useEffect(() => {
    // Back from the upgrade checkout? Strip the flag so a reload doesn't repeat it.
    let upgraded = false;
    try {
      const u = new URLSearchParams(window.location.search);
      upgraded = u.get('upgraded') === '1';
      if (upgraded) {
        u.delete('upgraded'); const qs = u.toString();
        window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
        try { window.posthog && window.posthog.capture('upgrade_return'); } catch (_) {}
      }
    } catch (_) {}
    const cached = _proReadCache();
    if (!cached) { setProStatus('free'); return; }
    let alive = true;
    const stale = Date.now() - (cached.validatedAt || 0) > PRO_CFG.revalidateAfterMs;
    // A paid year has landed when the key has AI and its end date moved on (a first pass has no earlier date).
    const _upOk = (res) => res.tier === 'pro_ai' && !(cached.aiUntil && _passOf(res) && _passOf(res) <= cached.aiUntil);
    if (!stale) {
      _apply(cached.tier, cached.aiUntil || null, cached.aiExpired, cached.refundUntil || null); setLicenseKey(cached.key); setMaskedEmail(cached.email || null);
      // Every paid key is re-checked quietly on each start (the cache only
      // decides what shows first), so a tier change on the server reaches every
      // device: an upgrade to Pro AI, a refunded upgrade back to Pro, or a
      // refunded licence. Offline or a server hiccup keeps the cached tier.
      // Right after paying for an upgrade the webhook can lag, so retry ~20 s.
      (async () => {
        const tries = upgraded ? 8 : 1;
        for (let i = 0; i < tries && alive; i++) {
          if (i) await new Promise((r) => setTimeout(r, 2500));
          const res = await _proValidate(cached.key, true);
          if (!alive) return;
          if (res.valid) {
            _proWriteCache(cached.key, _cacheOf(res));
            _apply(res.tier, _passOf(res), res.ai_expired, _refOf(res)); setMaskedEmail(res.email || null);
            if (_upOk(res) || !upgraded) {
              if (upgraded) { setJustUpgraded(true); try { window.posthog && window.posthog.capture('upgrade_confirmed'); } catch (_) {} }
              return;
            }
          } else if (!res.offline && (res.reason === 'refunded' || res.reason === 'disabled' || res.reason === 'not_found')) {
            _proClearCache(); setProStatus('free'); setLicenseKey(null); setMaskedEmail(null); setAiUntil(null); setAiExpired(false); setRefundUntil(null);
            return;
          } else if (res.offline) {
            return;
          }
        }
      })();
      return () => { alive = false; };
    }
    _proValidate(cached.key, true).then((res) => {
      if (!alive) return;
      if (res.valid) {
        _proWriteCache(cached.key, _cacheOf(res));
        _apply(res.tier, _passOf(res), res.ai_expired, _refOf(res)); setLicenseKey(cached.key); setMaskedEmail(res.email || null);
        if (upgraded && _upOk(res)) setJustUpgraded(true);
      } else if (res.offline) {
        // Network down during re-check → trust the cache (stay paid) until online.
        _apply(cached.tier, cached.aiUntil || null, cached.aiExpired, cached.refundUntil || null); setLicenseKey(cached.key); setMaskedEmail(cached.email || null);
      } else {
        // Authoritative revoke (refunded/disabled/not_found)
        _proClearCache(); setProStatus('free'); setLicenseKey(null); setMaskedEmail(null); setAiUntil(null); setAiExpired(false); setRefundUntil(null);
      }
    });
    return () => { alive = false; };
  }, []);

  const activateLicense = useCallback(async (raw) => {
    const key = (raw || '').trim();
    if (!key) return { ok: false, reason: 'empty' };
    const res = await _proValidate(key);
    if (res.valid) {
      _proWriteCache(key, _cacheOf(res));
      const st = _apply(res.tier, _passOf(res), res.ai_expired, _refOf(res)); setLicenseKey(key); setMaskedEmail(res.email || null);
      return { ok: true, tier: st };
    }
    return { ok: false, reason: res.reason || 'unknown' };
  }, []);

  // Ask the server again about the key in use (after an in-app refund: the licence is
  // switched off by Paddle's webhook a moment later, so this is tried a few times).
  const recheckLicense = useCallback(async (tries = 1) => {
    const cached = _proReadCache();
    if (!cached) return;
    for (let i = 0; i < tries; i++) {
      if (i) await new Promise((r) => setTimeout(r, 3000));
      const res = await _proValidate(cached.key, true);
      if (res.valid) {
        _proWriteCache(cached.key, _cacheOf(res));
        _apply(res.tier, _passOf(res), res.ai_expired, _refOf(res)); setMaskedEmail(res.email || null);
        if (!_refOf(res)) return;                    // the window is gone → the refund has landed (a pass)
      } else if (!res.offline && (res.reason === 'refunded' || res.reason === 'disabled' || res.reason === 'not_found')) {
        _proClearCache(); setProStatus('free'); setLicenseKey(null); setMaskedEmail(null); setAiUntil(null); setAiExpired(false); setRefundUntil(null);
        return;
      } else if (res.offline) return;
    }
  }, []);

  const deactivateLicense = useCallback(() => {
    _proClearCache(); setProStatus('free'); setLicenseKey(null); setMaskedEmail(null); setAiUntil(null); setAiExpired(false); setRefundUntil(null);
  }, []);

  // ── Paddle checkout ────────────────────────────────────────────────────────
  // Lazy-loads Paddle.js once, initializes it with our public client-side
  // token, then opens the Paddle overlay for the configured price ID. The
  // overlay handles the entire payment UX (card, PayPal, local methods,
  // tax/VAT, billing address). On success Paddle sends transaction.completed
  // to our /api/paddle-webhook, which provisions the license. The buyer
  // receives an email from Paddle with their license key.
  const loadPaddleScript = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') return reject(new Error('no window'));
      if (window.Paddle) return resolve(window.Paddle);
      const existing = document.querySelector('script[data-paintiano-paddle]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.Paddle));
        existing.addEventListener('error', () => reject(new Error('paddle script load failed')));
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      s.async = true;
      s.setAttribute('data-paintiano-paddle', '1');
      s.onload = () => resolve(window.Paddle);
      s.onerror = () => reject(new Error('paddle script load failed'));
      document.head.appendChild(s);
    });
  }, []);

  const openCheckout = useCallback(async (tier = 'pro') => {
    if (PF_IOS) {   // the iOS app: Apple's purchase sheet; the answer is the licence key
      try { window.posthog && window.posthog.capture('checkout_opened', { tier, store: 'apple' }); } catch (_) {}
      const r = await pfIosBuy(tier, licenseKey);
      if (r.ok && r.key) { const a = await activateLicense(r.key); return { ok: !!a.ok, reason: a.ok ? null : 'key' }; }
      return r;
    }
    try {
      try { window.posthog && window.posthog.capture('checkout_opened', { tier }); } catch (_) {}
      const Paddle = await loadPaddleScript();
      if (!Paddle) throw new Error('Paddle not available');
      // Pick the price for the requested tier. Pro AI falls back to the Pro
      // price until its Paddle price ID exists (step C) — so the button never
      // dead-ends; worst case it sells Pro instead of Pro AI.
      // 'upgrade' = a key holder buying AI for 12 months at the upgrade price (a first
      // pass on a Pro key, or a further year on a pass). It needs both the upgrade
      // price and the key; otherwise it is a plain Pro AI sale.
      const isUpgrade = tier === 'upgrade' && !!PRO_CFG.paddlePriceIdUpgrade && !!licenseKey;
      const wantsAI = tier === 'pro_ai' || tier === 'upgrade';
      const priceId = isUpgrade
        ? PRO_CFG.paddlePriceIdUpgrade
        : (wantsAI && PRO_CFG.paddlePriceIdProAI)
          ? PRO_CFG.paddlePriceIdProAI
          : PRO_CFG.paddlePriceIdPro;
      // Initialize is idempotent — calling twice is safe.
      Paddle.Environment.set(PRO_CFG.paddleEnv); // 'production' or 'sandbox'
      Paddle.Initialize({ token: PRO_CFG.paddleClientToken });
      Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        ...(isUpgrade ? { customData: { upgrade_from: licenseKey } } : {}),
        settings: {
          displayMode: 'overlay',
          theme: 'dark',
          locale: (typeof navigator !== 'undefined' && navigator.language) ? navigator.language.slice(0, 2) : 'en',
          // ?pv= keeps the same anonymous visit across the return page (funnel; nothing stored)
          successUrl: typeof window !== 'undefined'
            ? window.location.origin + (isUpgrade ? '/play?upgraded=1' : '/?paid=1') + _pfVisitParam()
            : undefined,
        },
      });
    } catch (err) {
      console.error('Paddle checkout failed', err);
      // Soft fallback: open a mailto so users can still reach us if checkout breaks.
      try {
        if (typeof window !== 'undefined') {
          window.location.href = 'mailto:hello@paintiano.app?subject=Paintiano Pro - checkout issue';
        }
      } catch (_) {}
    }
  }, [loadPaddleScript, licenseKey, activateLicense]);

  const clearJustUpgraded = useCallback(() => setJustUpgraded(false), []);

  return { proStatus,
           isPro: proStatus === 'pro' || proStatus === 'pro_ai',
           isProAI: proStatus === 'pro_ai',
           licenseKey, maskedEmail, justUpgraded, clearJustUpgraded,
           aiUntil, aiExpired, refundUntil, recheckLicense,
           activateLicense, deactivateLicense, openCheckout };
}

// ─── AI trial counter hook (free tier: PRO_CFG.trialMax heavy AI calls) ────────
// trialUsed is a FLOAT — full AI calls (composeFromImage, aiCompose) consume
// 1.0, while lighter calls (atmosphere detect) consume 0.5. trialLeft is
// rounded UP for user-facing display via Math.ceil at the callsite.
// ─── AI trial hook — PER-MODE credits (no shared pool) ───────────────────────
// Each heavy AI mode gets its own single free try: 'mood', 'mfi', 'compose'.
// 'atmomelody' is ONE shared credit for the atmo + melody pair together
// (2×atmo, 2×melody, or 1+1 all exhaust the same single credit). We persist a
// small map of how many times each key was used.
const AI_TRIAL_LIMITS = { mood:1, mfi:1, compose:1, atmomelody:1 };
function useAiTrial() {
  const [used, setUsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PRO_CFG.trialStoreKey) || '{}') || {}; }
    catch (_) { return {}; }
  });
  // Consume one unit of a specific mode's credit. amount kept for atmo/melody
  // (0.5 each → two uses exhaust the shared 1.0).
  const consumeTrial = useCallback((key, amount = 1) => {
    setUsed((m) => {
      const next = { ...m, [key]: (m[key] || 0) + amount };
      try { localStorage.setItem(PRO_CFG.trialStoreKey, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, []);
  const resetTrial = useCallback(() => {
    try { localStorage.removeItem(PRO_CFG.trialStoreKey); } catch (_) {}
    setUsed({});
  }, []);
  // Has this specific mode's credit run out?
  const modeExhausted = useCallback((key) => {
    const lim = AI_TRIAL_LIMITS[key] || 1;
    return (used[key] || 0) >= lim;
  }, [used]);
  return {
    trialUsedMap: used,
    modeExhausted,
    consumeTrial,
    resetTrial,
  };
}

// ─── Unified entitlements (single source of truth for gating) ─────────────────
// Combines useProStatus + useAiTrial so every caller asks ONE thing instead of
// re-deriving "free && exhausted → paywall; else consume" at each site (which
// is where races and inconsistencies creep in). Exposes everything the two
// hooks did, plus:
//   ready        — true once Pro status is resolved (not 'loading')
//   gateAI(amt)  — the single decision for a heavy AI action. Returns
//                  { allow, reason }:
//                    • while loading  → { allow:false, reason:'loading' }   (caller waits/no-ops; never silently pays or charges a trial)
//                    • pro            → { allow:true }                       (no trial spend)
//                    • free, credits  → { allow:true } and consumes `amt`
//                    • free, no credit→ { allow:false, reason:'ai_trial' }   (caller opens paywall)
// Centralizing the loading check fixes the race where a callsite tested
// proStatus==='free' (false during 'loading') and let an action slip through.
function useEntitlements() {
  const pro = useProStatus();
  const trial = useAiTrial();
  // gateAI(key, amount, consume) — key is the AI mode: 'mood'|'mfi'|'compose'|
  // 'atmomelody'. Each mode has its own credit (atmomelody shared for the pair).
  const gateAI = useCallback((key, amount = 1, consume = true) => {
    if (pro.proStatus === 'loading') return { allow: false, reason: 'loading' };
    if (pro.proStatus === 'pro_ai')  return { allow: true };
    // free OR pro tier → per-mode trial credit
    if (trial.modeExhausted(key))    return { allow: false, reason: 'ai_trial' };
    if (consume) trial.consumeTrial(key, amount);
    return { allow: true };
  }, [pro.proStatus, trial.modeExhausted, trial.consumeTrial]);
  return {
    ...pro,            // proStatus, isPro, licenseKey, maskedEmail, activate/deactivate/openCheckout
    ...trial,          // trialUsedMap, modeExhausted, consumeTrial, resetTrial
    ready: pro.proStatus !== 'loading',
    gateAI,
  };
}

// ─── φ signature for Pro exports (bottom-right of the canvas) ──────────────
// Small italic φ in the paintiano gold, drawn in 3 layers so it reads on both
// dark and light grounds without probing the pixels underneath: a hairline dark
// ductus for legibility on gold/paper areas, the main gold glyph (#c9a84c) and
// a warm highlight so the mark feels engraved rather than painted on top. Size
// is 2.6% of the shorter edge and the margin 2.8%, so vertical Story exports
// (1596×2604) and square feed exports get an identically proportioned mark.
function _drawPhiSignature(canvas) {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    const minEdge = Math.min(w, h);
    // 3.2% of the shorter edge — comfortably visible on 5544×7420 A1 exports
    // while staying discreet on square feed exports.
    const fontPx = Math.max(18, Math.round(minEdge * 0.032));
    const margin = Math.round(minEdge * 0.030);
    ctx.save();
    // Reset any active transform (scale/rotate) left by the chord-grid
    // renderer — without this our draw lands in scaled coords and misses the
    // export canvas entirely. This was the root cause of ‘no φ in PNG’.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cx = w - margin;
    const cy = h - margin;
    // Canvas 2D does NOT honour the CSS font fallback chain like HTML does:
    // if the first family isn't loaded yet, the whole rule may be ignored.
    // Use system serifs (Georgia + Times) that are guaranteed to be present
    // and render φ beautifully in italic. No webfont dependency.
    ctx.font = 'italic 600 ' + fontPx + 'px Georgia, "Times New Roman", Times, serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    const OP = 0.72;
    // Dark outline stroke — keeps the glyph legible on gold/paper grounds
    // without needing to sample the pixels underneath.
    ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.06));
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,' + (OP * 0.55).toFixed(2) + ')';
    ctx.strokeText('φ', cx, cy);
    // Main gold glyph — paintiano brand colour.
    ctx.globalAlpha = OP;
    ctx.fillStyle = '#c9a84c';
    ctx.fillText('φ', cx, cy);
    // Warm highlight above-left — engraved feel on dark grounds.
    ctx.globalAlpha = OP * 0.35;
    ctx.fillStyle = '#ffdc8c';
    ctx.fillText('φ', cx - Math.max(1, fontPx * 0.02), cy - Math.max(1, fontPx * 0.03));
    ctx.restore();
  } catch (_) {}
}

// ─── watermark: diagonal tile on Free, discreet φ signature on Pro/Pro AI ────
function applyWatermark(canvas, isPro) {
  if (!canvas) return canvas;
  if (isPro) { _drawPhiSignature(canvas); return canvas; }
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const w = canvas.width, h = canvas.height;
    // Diagonal repeating watermark — like stock-photo previews. The mark sits
    // on top of the painting at moderate opacity and at a -30° angle, tiled
    // densely so cropping any region still carries the brand and the pattern
    // reads as a watermark (not a single label). Font scales with the
    // SHORTER edge so vertical-format Story exports don't get an oversized
    // font; values are tuned so a typical 1596×2604 export shows ~4 rows ×
    // ~3 cols of marks across the painting.
    const text = 'paintiano.app';
    const minEdge = Math.min(w, h);
    const fontPx = Math.max(20, Math.round(minEdge * 0.04));
    const stepX = Math.round(fontPx * 7);    // ~3 columns per typical export
    const stepY = Math.round(fontPx * 3.2);  // ~4 rows per typical export
    const angle = -Math.PI / 6;              // -30°
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);     // the export context carries a scale() — tile in pixel space
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.font = '700 ' + fontPx + 'px "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    // Diagonal of rotated canvas needs to cover the original — use the
    // diagonal length so the grid extends past every corner of the rotated
    // viewport. A small safety margin (+3) keeps the corners filled.
    const diag = Math.ceil(Math.sqrt(w * w + h * h));
    const cols = Math.ceil(diag / stepX) + 3;
    const rows = Math.ceil(diag / stepY) + 3;
    for (let r = -Math.floor(rows / 2); r <= Math.ceil(rows / 2); r++) {
      // Offset every other row by half a step so the grid feels organic
      // (avoids a regimented "matrix" look while still being clearly tiled).
      const offset = (r % 2 === 0) ? 0 : stepX / 2;
      for (let c = -Math.floor(cols / 2); c <= Math.ceil(cols / 2); c++) {
        const x = c * stepX + offset;
        const y = r * stepY;
        // Dark stroke first → readable on bright areas. Subtle: visible if
        // you look for it, but doesn't dominate the artwork.
        ctx.globalAlpha = 0.14;
        ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.07));
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.strokeText(text, x, y);
        // Light fill on top → readable on dark areas
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, x, y);
      }
    }
    ctx.restore();
  } catch (_) {}
  return canvas;
}

// ─── ProBadge — small gold PRO pill ────────────────────────────────────────────
// `size`: 'md' (default — header beside Paintiano title), 'sm' (inline beside
// labels like the locked-partner name or inside small chip/tab buttons).
// `tier`: 'pro' (default — gold, used for non-AI Pro features like 19 artists,
// 300 DPI, Custom palette) or 'ai' (purple, "PRO AI" label — used for AI
// features locked to the Pro AI tier: How do you feel? mood input, MFI,
// AI Compose, Atmosphere).
function ProBadge({ t, readScale = 1, size = 'md', tier = 'pro' }) {
  const isAI = tier === 'ai';
  const label = isAI
    ? ((t && t('proAiBadge')) || 'PRO AI')
    : ((t && t('proBadge')) || 'PRO');
  const isSm = size === 'sm';
  // a small badge marks something locked: everywhere the same 🔒 (the paywall says which tier)
  if (isSm) return (<span role="img" aria-label={label} title={label} style={{ display: 'inline-block', marginLeft: 5, fontSize: '.85em', lineHeight: 1, verticalAlign: 'middle', opacity: .85 }}>🔒</span>);
  const fg = isAI ? '#dcb4ff' : GOLD;
  const bgCol = isAI ? 'rgba(220,150,255,.16)' : 'rgba(201,168,76,.15)';
  const borderCol = isAI ? 'rgba(220,150,255,.5)' : 'rgba(201,168,76,.45)';
  return (
    <span style={{
      display: 'inline-block',
      marginLeft: isSm ? 5 : 8,
      padding: isSm ? '1px 5px' : '2px 7px',
      fontSize: (isSm ? .42 : .5) * readScale + 'rem',
      fontWeight: 600, letterSpacing: '.14em',
      color: fg, background: bgCol,
      border: '1px solid ' + borderCol, borderRadius: 999,
      textTransform: 'uppercase', verticalAlign: 'middle',
      lineHeight: 1.2,
    }}>{label}</span>
  );
}

// ─── ProPaywall — the modal ────────────────────────────────────────────────────
// Props: { t, reason, onClose, onActivated, openCheckout, activateLicense, trialLeft }
function ProPaywall({ t, reason, proStatus, onClose, onActivated, openCheckout, activateLicense, trialLeft, readScale = 1, isDesktop = false, aiUntil = null, aiExpired = false, lang = 'EN', refundUntil = null, licenseKey = null, onRefunded = null }) {
  // reason 'upgraded' = back from a confirmed Pro → Pro AI upgrade: open straight
  // on the success note and close by itself.
  const [view, setView] = useState(reason === 'upgraded' ? 'success' : reason === 'refund' ? 'refund' : 'intro'); // 'intro'|'key'|'about'|'success'
  // A Pro owner is only ever offered the upgrade to Pro AI, never Pro again.
  // A key on a running AI pass is offered only its further year (added at the end).
  const renew = proStatus === 'pro_ai' && !!aiUntil;
  const upgradeOnly = proStatus === 'pro' || renew;
  // Until the upgrade price exists in Paddle, a Pro owner is shown (and charged)
  // the plain Pro AI price — never a €10 label on a €19.99 checkout.
  const upTier = PRO_CFG.paddlePriceIdUpgrade ? 'upgrade' : 'pro_ai';
  useEffect(() => {
    if (reason !== 'upgraded') return;
    const tm = setTimeout(() => { onClose && onClose(); }, 2800);
    return () => clearTimeout(tm);
  }, [reason]);
  // In-app refund (opened from the Refunds page, reason 'refund'): the server decides everything.
  const [rf, setRf] = useState(null);          // the server's answer
  const [rfBusy, setRfBusy] = useState(false);
  const [rfErr, setRfErr] = useState(false);
  const openRefund = async () => {
    setView('refund'); setRf(null); setRfErr(false); setRfBusy(true);
    const r = await pfRefundCall(licenseKey, false);
    setRfBusy(false);
    if (r && r.ok) setRf(r); else setRfErr(true);
  };
  const doRefund = async () => {
    if (rfBusy) return;
    setRfBusy(true); setRfErr(false);
    const r = await pfRefundCall(licenseKey, true);
    setRfBusy(false);
    if (r && r.ok) { setRf(r); if (r.done && onRefunded) onRefunded(); } else setRfErr(true);
  };
  // Opened from the Refunds page: straight to the refund, and "back" closes the window.
  useEffect(() => { if (reason === 'refund') { if (licenseKey) openRefund(); else setView('intro'); } }, []);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const [, _setPxTick] = useState(0);   // the visitor's own prices arrived → paint the texts again
  useEffect(() => { let on = true; pfPxLoad().then(() => { if (on) _setPxTick(n => n + 1); }).catch(() => {}); return () => { on = false; }; }, []);
  const tr = (k, fb) => { const v = t && t(k); return pfPx((v && v !== k) ? v : fb); };   // t() returns the key when missing; prices in the visitor's own currency

  // The iOS app: a purchase answers here (on the web the checkout leaves the page and comes back).
  const [buyBusy, setBuyBusy] = useState(false);
  const [buyMsg, setBuyMsg] = useState('');
  const done = () => { setView('success'); if (onActivated) onActivated(); setTimeout(() => onClose && onClose(), 1500); };
  const buy = async (tier) => {
    if (!PF_IOS) return openCheckout(tier);
    if (buyBusy) return;
    setBuyBusy(true); setBuyMsg('');
    const r = await openCheckout(tier);
    setBuyBusy(false);
    if (r && r.ok) done();
    else if (!(r && r.cancelled)) setBuyMsg(tr('iosBuyFail', 'The purchase could not be completed. Please try again.') + _pfIosWhy(r));
  };
  const restore = async () => {
    if (buyBusy) return;
    setBuyBusy(true); setBuyMsg('');
    const r = await pfIosRestore(licenseKey);
    let ok = false;
    if (r && r.ok && r.key) { const a = await activateLicense(r.key); ok = !!(a && a.ok); }
    setBuyBusy(false);
    if (ok) done(); else setBuyMsg(r && r.reason === 'none' ? tr('iosRestoreNone', 'No purchases found for this Apple ID.') : tr('iosBuyFail', 'The purchase could not be completed. Please try again.') + _pfIosWhy(r));
  };
  const submit = async () => {
    setBusy(true); setErrMsg('');
    const r = await activateLicense(keyInput);
    setBusy(false);
    if (r.ok) { setView('success'); if (onActivated) onActivated(); setTimeout(() => onClose && onClose(), 1500); }
    else { setErrMsg(tr('proInvalidKey', 'This key is not valid. Check your email for the correct key.')); }
  };

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 100000,
    background: 'rgba(4,4,10,.78)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px)', boxSizing: 'border-box',
    fontFamily: 'inherit',
  };
  const card = {
    position: 'relative', width: '100%', maxWidth: 360,
    background: '#0e0b16', border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 24, padding: '26px 20px 20px', color: '#f5f5f5',
    boxShadow: '0 20px 60px rgba(0,0,0,.6)',
    maxHeight: 'calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 32px)', overflowY: 'auto',
  };
  const cardWide = Object.assign({}, card, { maxWidth: 460 });
  const btnGold = {
    width: '100%', background: 'linear-gradient(135deg,#f0d78a,#c9a84c)', color: '#1a1408', border: 'none',
    padding: '14px 12px', borderRadius: 24, fontSize: (.74*readScale)+'rem', fontWeight: 700,
    letterSpacing: '.01em', cursor: 'pointer',
    fontFamily: 'inherit', marginBottom: 8,
  };
  // Secondary CTA — same shape as btnGold but outlined (gold border, transparent
  // bg). Used to offer the OTHER tier alongside the primary CTA.
  const btnGoldOutline = {
    width: '100%', background: 'transparent', color: '#f0d78a',
    border: '1px solid rgba(240,215,138,.5)', padding: '13px 12px', borderRadius: 24,
    fontSize: (.7*readScale)+'rem', fontWeight: 700, letterSpacing: '.01em',
    cursor: 'pointer', fontFamily: 'inherit',
    marginBottom: 8,
  };
  const btnGhost = {
    width: '100%', background: 'rgba(255,255,255,.06)', color: 'rgba(242,238,232,.75)',
    border: '1px solid rgba(255,255,255,.1)', padding: '12px 12px',
    borderRadius: 24, fontSize: (.66*readScale)+'rem', fontWeight: 600, letterSpacing: '.01em',
    cursor: 'pointer', fontFamily: 'inherit',
  };

  // ─── Tier card styles (paywall two-tier layout) ──────────────────────────
  // Each tier renders as a card with title + price + value bullets + CTA.
  // The "recommended" variant has a brighter gold border + RECOMMENDED ribbon,
  // used for Pro AI when reason === 'ai_trial' (user just hit the AI wall).
  const tierCard = {
    position: 'relative',
    border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 20, padding: '18px 16px 16px',
    background: 'rgba(255,255,255,.04)',
    marginBottom: 12,
  };
  const tierCardHighlight = Object.assign({}, tierCard, {
    border: `1px solid ${GOLD}`,
    background: 'rgba(201,168,76,.05)',
    boxShadow: `0 0 0 1px rgba(201,168,76,.25), 0 6px 22px rgba(201,168,76,.10)`,
  });
  const tierTitle = {
    fontSize: (.8*readScale)+'rem', fontWeight: 700, color: '#f5f5f5',
    margin: '0 0 4px', letterSpacing: '.01em',
  };
  const tierPrice = {
    fontSize: (.7*readScale)+'rem', color: GOLD, margin: '0 0 14px',
    letterSpacing: '.01em', fontWeight: 500, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 8px',
  };
  const tierValueRow = {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    margin: '0 0 8px', fontSize: (.64*readScale)+'rem', lineHeight: 1.4,
    color: 'rgba(242,238,232,.82)',
  };
  const tierCheck = {
    color: GOLD, fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 0, width: 20, height: 20, borderRadius: '50%',
    background: 'rgba(255,255,255,.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
  const recommendedBadge = {
    position: 'absolute', top: -10, right: 12,
    background: GOLD, color: '#0a0a12',
    fontSize: (.52*readScale)+'rem', fontWeight: 700,
    letterSpacing: '.02em', padding: '4px 10px',
    borderRadius: 10,
  };

  // Inline tier card renderer — used twice (intro view + about view).
  // `tierKey` ∈ 'pro' | 'pro_ai'. `recommended` adds the highlight ribbon +
  // bright border. Pro AI tier uses the purple AI accent throughout (matches
  // the in-app AI feature colour); Pro stays in the gold brand colour.
  const renderTierCard = (tierKey, recommended) => {
    const isUp = tierKey === 'upgrade';
    const isAI = tierKey === 'pro_ai' || isUp;
    // Per-tier accent palette — applied to border highlight, glow, check
    // marks, price line, RECOMMENDED ribbon, and the CTA button. Pro = gold;
    // Pro AI = purple (in-app AI accent).
    const accent       = isAI ? AI_PURPLE        : GOLD;
    const accentBorder = isAI ? AI_PURPLE_BORDER : 'rgba(201,168,76,.45)';
    const accentGlow   = isAI ? AI_PURPLE_GLOW   : 'rgba(201,168,76,.25)';
    const accentBg     = isAI ? AI_PURPLE_BG     : 'rgba(201,168,76,.05)';
    const accentDim    = isAI ? 'rgba(220,150,255,.25)' : 'rgba(201,168,76,.25)';
    const cardStyle = recommended
      ? Object.assign({}, tierCard, {
          border: `1px solid ${accent}`,
          background: accentBg,
          boxShadow: `0 0 0 1px ${accentGlow}, 0 6px 22px ${accentGlow}`,
        })
      : Object.assign({}, tierCard, { border: `1px solid ${accentDim}` });
    const title = isAI
      ? tr('proAiTierTitle', 'Paintiano Pro AI')
      : tr('proTierTitle', 'Paintiano Pro');
    const priceLine = isUp
      ? tr('proUpgradePrice', '€10 · AI for 12 months')
      : isAI
        ? tr('proAiTierPrice', '€19.99 · Pro for life + AI for 12 months')
        : tr('proTierPrice',   '€9.99 · once, yours for life');
    const values = isAI ? [
      isUp ? ['proUpgradeValueAll', 'Your Pro stays, plus:'] : ['proAiValueAll', 'Everything in Pro, plus:'],
      ['proAiValueText',  'AI composition from text moods'],
      ['proAiValueImage', 'AI composition from your images'],
      ['proAiValueAtmo',  'AI atmospheric tinting'],
      ['proAiValueCompose','AI compose — a new piece written from your picture'],
      ['proAiValueMelody', 'AI melody — a line sung over your picture'],
      ['proAiValueFair',  'Up to 30 AI pieces & melodies a day, 500 over the 12 months · fair use'],
      ['proAiValuePass',  'After 12 months Pro stays yours. Another year of AI is €10 — nothing renews by itself'],
    ] : [
      ['proValueArtists', '24 artists (free has 9)'],
      ['proValueTypes',   '6–9 paint types per artist (free has 2)'],
      ['proValueComposers','All 15 composers — picture recomposition (free has 3)'],
      ['proValueDaily',    'Free gets one extra artist and composer a day — Pro has them all, always'],
      ['proValuePalette', 'Custom palette — set your own 12 colours'],
      ['proValueDpi',     'A3 print exports, no watermark'],
      ['proValueLife',    'Lifetime access'],
    ];
    // Tier-coloured button styles. Recommended = filled (primary CTA);
    // non-recommended = outline (secondary).
    const ctaBtn = { width: '100%', border: 'none', padding: '14px 12px', borderRadius: 24,
      background: isAI ? 'linear-gradient(135deg,#d8b4ff,#8c5cff)' : 'linear-gradient(135deg,#f0d78a,#c9a84c)',
      color: isAI ? '#fff' : '#1a1408', fontSize: (.74*readScale)+'rem', fontWeight: 700, letterSpacing: '.01em',
      cursor: 'pointer', fontFamily: 'inherit', marginBottom: 0,
      boxShadow: recommended ? ('0 10px 28px ' + (isAI ? 'rgba(140,92,255,.4)' : 'rgba(201,168,76,.35)')) : 'none' };
    return (
      <div style={cardStyle}>
        {recommended && !isUp && (
          <span style={Object.assign({}, recommendedBadge, { background: accent })}>{tr('proRecommended', 'Recommended')}</span>
        )}
        <p style={tierTitle}>{title}</p>
        <p style={Object.assign({}, tierPrice, { color: accent })}>{(() => { const i = priceLine.indexOf(' · '); if (i < 0) return priceLine; return [
          <span key="p" style={{ fontSize: (1.3*readScale)+'rem', fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.1 }}>{priceLine.slice(0, i)}</span>,
          <span key="w" style={{ fontSize: (.6*readScale)+'rem', fontWeight: 600, color: 'rgba(242,238,232,.6)' }}>{priceLine.slice(i + 3)}</span>,
        ]; })()}</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
          {values.map(([k, fb], i) => (
            <li key={i} style={tierValueRow}>
              <span style={Object.assign({}, tierCheck, { color: accent })}>✓</span>
              <span>{tr(k, fb)}</span>
            </li>
          ))}
        </ul>
        <button style={Object.assign({}, ctaBtn, buyBusy ? { opacity: .55 } : null)} disabled={buyBusy} onClick={() => buy(tierKey)}>
          {isUp
            ? ((renew || aiExpired) ? tr('proRenewCta', 'Add 12 months of AI') : tr('proUpgradeCta', 'Get the AI pass'))
            : isAI
              ? tr('proAiGetCta', 'Get Pro AI')
              : tr('proGetCta', 'Get Pro')}
        </button>
      </div>
    );
  };

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      {view !== 'success' && (
        <button onClick={onClose} aria-label="Close" style={{
          position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', right: 16, zIndex: 100001,   // below the status bar: under it the tap never arrives (the iOS app)
          width: 38, height: 38, borderRadius: '50%',
          background: 'rgba(255,255,255,.1)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,.14)',
          color: '#ddd', fontSize: 22, cursor: 'pointer', lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(0,0,0,.5)',
        }}>×</button>
      )}
      <div style={view === 'about' ? cardWide : card}>
        {view === 'intro' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{
                display: 'inline-flex', width: 64, height: 64, borderRadius: '50%',
                alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg,#f0d78a,#8c5cff)', color: '#fff', fontSize: 28,
                boxShadow: '0 10px 30px rgba(140,92,255,.35)',
              }}>✦</div>
            </div>
            <p style={{ fontSize: (1.05*readScale)+'rem', fontWeight: 800, textAlign: 'center', margin: '0 0 6px', lineHeight: 1.2 }}>
              {(renew || (upgradeOnly && aiExpired))
                ? tr('proPaywallTitleRenew', 'Another year of AI')
                : upgradeOnly
                ? tr('proPaywallTitleUpgrade', 'Add AI composition')
                : reason === 'ai_trial'
                  ? tr('proPaywallTitleAi', 'You’ve used your free AI compositions')
                  : tr('proPaywallTitle', 'Unlock the full Paintiano')}
            </p>
            <p style={{ fontSize: (.66*readScale)+'rem', color: 'rgba(242,238,232,.66)', textAlign: 'center', margin: '0 0 18px', lineHeight: 1.45 }}>
              {renew ? tr('proPaywallSubRenew', 'Your AI pass runs until {d}. The new year is added at the end.').replace('{d}', pfFmtDay(aiUntil, lang))
                : (upgradeOnly && aiExpired) ? tr('proPaywallSubExpired', 'Your AI pass has ended. Pro stays yours.')
                : upgradeOnly ? tr('proPaywallSubUpgrade', 'You already have every style.') : tr('proPaywallSubtitle', 'Pay once. Keep forever.')}
            </p>
            {/* a Pro owner already has a key — the key entry stays in "Learn more" */}
            {!upgradeOnly && (
              <button
                onClick={() => setView('key')}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 8, background: 'rgba(255,255,255,.06)', color: '#f2eee8',
                  border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, padding: '11px 14px',
                  margin: '0 0 16px', fontSize: (.66*readScale)+'rem', fontWeight: 600,
                  letterSpacing: '.01em', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                <span aria-hidden="true" style={{ fontSize: (.82*readScale)+'rem', lineHeight: 1 }}>🔑</span>
                {tr('proHaveKey', 'I already have a key')}
              </button>
            )}
            {PF_IOS && buyMsg && (   /* above the cards: under them it was out of sight */
              <p ref={(el) => { if (el) { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {} } }}
                style={{ color: '#f0b48a', fontSize: (.66*readScale)+'rem', textAlign: 'center', margin: '0 0 12px', padding: '10px 12px', lineHeight: 1.4, borderRadius: 12, border: '1px solid rgba(240,180,138,.35)', background: 'rgba(240,180,138,.08)' }}>{buyMsg}</p>
            )}
            {PRO_CFG.checkoutDisabled ? (
              <>
                <div style={{...btnGold, opacity:.45, cursor:'default', pointerEvents:'none', display:'flex', flexDirection:'column', gap:2, padding:'14px 18px'}}>
                  <span>{tr('proComingSoon', 'Checkout returns in a few days')}</span>
                  <span style={{fontSize:(.6*readScale)+'rem', fontWeight:400, opacity:.75, letterSpacing:'.02em'}}>
                    {tr('proCheckoutMoving', 'we\u2019re switching payment providers')}
                  </span>
                </div>
                <p style={{ color: GOLD, fontSize: (.58*readScale)+'rem', textAlign: 'center', margin: '0 0 10px', letterSpacing: '.04em', opacity: .65 }}>
                  {tr('proBackOnlineSoon', 'one payment · yours for life')}
                </p>
              </>
            ) : (
              <>
                {/* Two tier cards, ordered by what brought the user here.
                    ai_trial → Pro AI on top with "Recommended" ribbon, Pro below.
                    settings → Pro on top (cheaper, sufficient for most non-AI needs), Pro AI below. */}
                {upgradeOnly ? (
                  renderTierCard(upTier, true)
                ) : reason === 'ai_trial' ? (
                  renderTierCard('pro_ai', true)   /* AI: Pro does not help — Pro AI only */
                ) : (
                  <>
                    {renderTierCard('pro', false)}
                    {renderTierCard('pro_ai', false)}
                  </>
                )}
                <p style={{ color: 'rgba(242,238,232,.5)', fontSize: (.58*readScale)+'rem', textAlign: 'center', margin: '0 0 14px' }}>
                  {tr('proSupportLine', 'You\u2019re also keeping a solo art project independent.')}
                </p>
              </>
            )}
            <p style={{ textAlign: 'center', margin: '10px 0 0' }}>
              <span onClick={() => setView('about')} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView('about'); } }}
                style={{ color: 'rgba(242,238,232,.75)', fontSize: (.62*readScale)+'rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                {tr('proLearnMore', 'Learn more about Pro')} →
              </span>
            </p>
            {PF_IOS && (
              <p style={{ textAlign: 'center', margin: '10px 0 0' }}>
                <span onClick={restore} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); restore(); } }}
                  style={{ color: 'rgba(242,238,232,.6)', fontSize: (.6*readScale)+'rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, opacity: buyBusy ? .5 : 1 }}>
                  {tr('iosRestore', 'Restore purchases')}
                </span>
              </p>
            )}
            <p style={{ color: '#555', fontSize: (.55*readScale)+'rem', textAlign: 'center', margin: '12px 0 0', letterSpacing: '.04em' }}>
              {tr('proPaywallFooter', 'One-time payment · No subscription · VAT included')}
            </p>
          </>
        )}

        {view === 'key' && (
          <>
            <p style={{ fontSize: (.85*readScale)+'rem', fontWeight: 600, margin: '0 0 14px' }}>
              {tr('proEnterKey', 'Enter your license key')}
            </p>
            <input
              type="text" value={keyInput} autoFocus
              onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              style={{
                width: '100%', boxSizing: 'border-box', background: '#04040a',
                border: '1px solid rgba(255,255,255,.18)', borderRadius: 5,
                padding: '10px 12px', fontSize: (.78*readScale)+'rem', color: '#f5f5f5',
                fontFamily: 'monospace', letterSpacing: '.06em', marginBottom: 10,
              }}
            />
            {errMsg && <p style={{ color: '#e57373', fontSize: (.62*readScale)+'rem', margin: '0 0 10px' }}>{errMsg}</p>}
            <button style={Object.assign({}, btnGold, { opacity: (busy || !keyInput) ? .5 : 1, cursor: busy ? 'wait' : 'pointer' })}
                    disabled={busy || !keyInput} onClick={submit}>
              {busy ? '…' : tr('proActivate', 'Activate')}
            </button>
            <button style={btnGhost} onClick={() => { setView('intro'); setErrMsg(''); }}>
              {tr('proBack', 'Back')}
            </button>
          </>
        )}

        {view === 'about' && (
          <>
            <p style={{ margin: '0 0 4px' }}>
              <span onClick={() => setView('intro')} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView('intro'); } }}
                style={{ color: '#888', fontSize: (.62*readScale)+'rem', letterSpacing: '.04em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 0' }}>
                ← {tr('proBack', 'Back')}
              </span>
            </p>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div style={{
                display: 'inline-flex', width: 46, height: 46, borderRadius: '50%',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(201,168,76,.12)', color: GOLD, fontSize: 22, marginBottom: 10,
              }}>✦</div>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 4px', fontFamily: "'Cormorant Garamond',serif" }}>
                {tr('proAboutTitle3', 'Paintiano Pro · Pro AI')}
              </p>
              <p style={{ fontSize: (.72*readScale)+'rem', color: GOLD, margin: 0, letterSpacing: '.04em', fontStyle: 'italic', opacity: .9 }}>
                {tr('proAboutLead3', 'Two ways to unlock — pick what fits how you create.')}
              </p>
            </div>

            {/* ─── 3-column comparison table (Free · Pro · Pro AI) ─────────
                Mirrors the one in the ? help popup so the user sees the same
                tier hierarchy in both places. Pro column tinted gold, Pro AI
                column tinted purple. AI features collapsed to one row with a
                credits-note footnote. */}
            <p style={{ fontSize: (.66*readScale)+'rem', color: GOLD, letterSpacing: '.18em', textTransform: 'uppercase', margin: '0 0 10px', opacity: .8 }}>
              {tr('proAboutCompareTitle3', 'Free · Pro · Pro AI')}
            </p>
            {(() => {
              const GOLD_BG = 'rgba(201,168,76,.08)';
              const GOLD_BG_HDR = 'rgba(201,168,76,.16)';
              const PURPLE_BG = 'rgba(220,150,255,.07)';
              const PURPLE_BG_HDR = 'rgba(220,150,255,.14)';
              const FREE_FG = 'rgba(242,238,232,.6)';
              const CELL_TXT = 'rgba(242,238,232,.85)';
              const cellSty = {
                padding: '7px 4px', textAlign: 'center',
                fontSize: (.62*readScale)+'rem',
                borderBottom: '1px solid rgba(255,255,255,.06)', lineHeight: 1.25,
              };
              const labelSty = Object.assign({}, cellSty, {
                textAlign: 'left', color: 'rgba(242,238,232,.78)',
                fontSize: (.62*readScale)+'rem', paddingLeft: 2,
              });
              const hdrBase = {
                padding: '8px 4px', textAlign: 'center',
                fontSize: (.58*readScale)+'rem', fontWeight: 700,
                letterSpacing: '.1em', textTransform: 'uppercase',
                borderBottom: '1px solid rgba(255,255,255,.12)', lineHeight: 1.2,
              };
              const yes = '✓';
              const no = '—';
              const allWord = tr('tierAll', 'all');
              const inf = tr('tierUnlimited', '30/day');
              const ronly = tr('tierReadOnly', 'preview only');
              const credits3 = tr('tier3Credits', '1 try per mode');
              const rows = [
                [tr('tierRowArtists', 'Artists'),       '9',     '24',     '24',  null],
                [tr('tierRowComposers', 'Composers'),   '3',     '15',     '15',  null],
                [tr('tierRowDaily', 'Artist & composer of the day'), yes,   no,       no,    '✦'],
                [tr('tierRowTypes', 'Paint types'),     '2',     allWord,  allWord, null],
                [tr('tierRowSig', 'Signature'),         yes,     yes,      yes,   null],
                [tr('tierRowFusion', 'Fusion & Jam session'), no, yes,     yes,   null],
                [tr('tierRowPalette', 'Custom palette'),ronly,   yes,      yes,   null],
                [tr('tierRowMine', 'My Music · My Images'), '1 + 1', '5 + 5', '5 + 5', null],
                [tr('tierRowDpi', 'A3 export'),    no,      yes,      yes,   null],
                [tr('tierRowWmark', 'Watermark'),       yes,     no,       no,    null],
                [tr('tierRowAi', 'AI features'),        credits3, credits3, inf,  '✦'],
                [tr('proValueLife', 'Lifetime access'), no,      yes,      yes,   null],
              ];
              return (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                  <thead>
                    <tr>
                      <th style={Object.assign({}, hdrBase, { textAlign: 'left', color: 'rgba(242,238,232,.6)', paddingLeft: 2 })}></th>
                      <th style={Object.assign({}, hdrBase, { color: FREE_FG })}>{tr('tierFreeName', 'Free')}</th>
                      <th style={Object.assign({}, hdrBase, { color: GOLD, background: GOLD_BG_HDR })}>{tr('tierProName', 'Pro')}</th>
                      <th style={Object.assign({}, hdrBase, { color: AI_PURPLE, background: PURPLE_BG_HDR })}>{tr('tierProAiName', 'Pro AI')}</th>
                    </tr>
                    <tr>
                      <th style={Object.assign({}, cellSty, { textAlign: 'left' })}></th>
                      <th style={Object.assign({}, cellSty, { color: FREE_FG, fontWeight: 500 })}>{pfPx('€0')}</th>
                      <th style={Object.assign({}, cellSty, { color: GOLD, fontWeight: 600, background: GOLD_BG })}>{pfPx('€9.99')}</th>
                      <th style={Object.assign({}, cellSty, { color: AI_PURPLE, fontWeight: 600, background: PURPLE_BG })}>{pfPx('€19.99')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([label, f, p, a, icon], i) => (
                      <tr key={i}>
                        <td style={labelSty}>
                          {icon && <span style={{ color: AI_PURPLE, marginRight: 5 }}>{icon}</span>}
                          {label}
                        </td>
                        <td style={Object.assign({}, cellSty, { color: FREE_FG })}>{f}</td>
                        <td style={Object.assign({}, cellSty, { color: CELL_TXT, background: GOLD_BG })}>{p}</td>
                        <td style={Object.assign({}, cellSty, { color: CELL_TXT, background: PURPLE_BG })}>{a}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
            <p style={{ fontSize: (.58*readScale)+'rem', color: 'rgba(242,238,232,.45)', fontStyle: 'italic', letterSpacing: '.04em', textAlign: 'center', margin: '0 0 22px', lineHeight: 1.45 }}>
              {tr('tierAiCreditsNote', 'One free try per AI mode: text mood · Mood-from-image · AI Compose · Atmosphere + Melody share two.')}
            </p>

            {/* ─── How Free tier actually behaves ─────────────────────────
                Three short explainer paragraphs that map to the things the
                user will hit immediately on the canvas. Helps clarify why
                certain buttons show a PRO badge or a small "preview only"
                state before the upgrade. */}
            <p style={{ fontSize: (.66*readScale)+'rem', color: GOLD, letterSpacing: '.18em', textTransform: 'uppercase', margin: '0 0 10px', opacity: .8 }}>
              {tr('proAboutHowFreeTitle', 'How Free tier behaves')}
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px' }}>
              {[
                ['proAboutHowFree1', 'Eight artists are unlocked from day one. Each unlocked artist has a Pro partner — tap them to see who it is, but only Pro paints with that partner.'],
                ['proAboutHowFree2', 'Custom palette shows the default 12 colours; editing your own colours is Pro.'],
                ['proAboutHowFree3', 'Each AI feature (✦) has 1 free try — text mood, Mood-from-image, AI Compose; Atmosphere + Melody share two — then Pro AI gives you up to 30 pieces & melodies a day. Exports always carry a watermark on Free.'],
              ].map(([k, fb], i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '0 0 11px', fontSize: (.68*readScale)+'rem', lineHeight: 1.5, color: '#cccccc' }}>
                  <span style={{ color: GOLD, flexShrink: 0, marginTop: 1, fontSize: (.7*readScale)+'rem' }}>·</span>
                  <span>{tr(k, fb)}</span>
                </li>
              ))}
            </ul>

            {/* ─── Honest about the tiers ────────────────────────────────
                The original "Honest about what Pro isn't" updated for the
                two-tier upgrade path. Sets expectations: no subscriptions,
                no cloud, license is one-device-at-a-time. */}
            <p style={{ fontSize: (.66*readScale)+'rem', color: GOLD, letterSpacing: '.18em', textTransform: 'uppercase', margin: '0 0 10px', opacity: .8 }}>
              {tr('proAboutHonestTitle3', 'Honest about Pro and Pro AI')}
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px' }}>
              {[
                ['proAboutHonest3_1', 'Both tiers are one-time payments. No subscription, ever. The price you pay today stays valid forever.'],
                ['proAboutHonest3_2', 'Plain Pro removes the watermark and unlocks all artists, paint types and the custom palette — but AI features keep the same one free try per mode as Free.'],
                ['proAboutHonest3_3', 'Pro AI is for people who actually use the ✦ AI features regularly. If you mostly play your own music or load files, plain Pro is the better fit.'],
                ['proAboutHonest3_4', 'No cloud storage. Paintings save to your own device. Your license key works on up to 5 devices, one at a time.'],
              ].map(([k, fb], i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '0 0 9px', fontSize: (.66*readScale)+'rem', lineHeight: 1.5, color: '#a8a8a8' }}>
                  <span style={{ color: '#666', flexShrink: 0, marginTop: 1 }}>·</span>
                  <span>{tr(k, fb)}</span>
                </li>
              ))}
            </ul>

            {/* ─── Dual CTAs (Pro gold, Pro AI purple) ──────────────────── */}
            {PRO_CFG.checkoutDisabled ? (
              <>
                <div style={{...btnGold, opacity:.45, cursor:'default', pointerEvents:'none', display:'flex', flexDirection:'column', gap:2, padding:'14px 18px'}}>
                  <span>{tr('proComingSoon', 'Checkout returns in a few days')}</span>
                  <span style={{fontSize:(.6*readScale)+'rem', fontWeight:400, opacity:.75, letterSpacing:'.02em'}}>
                    {tr('proCheckoutMoving', 'we\u2019re switching payment providers')}
                  </span>
                </div>
                <p style={{ color: GOLD, fontSize: (.58*readScale)+'rem', textAlign: 'center', margin: '0 0 10px', letterSpacing: '.04em', opacity: .65 }}>
                  {tr('proCheckoutETA', 'expected back in a few days')}
                </p>
              </>
            ) : (
              <>
                {/* Get Pro — gold outline (secondary in the about view); a Pro owner never sees it */}
                {!upgradeOnly && (
                <button style={Object.assign({}, btnGoldOutline, { marginBottom: 10 })}
                        onClick={() => buy('pro')}>
                  {tr('proGetCta', 'Get Pro')} — {tr('proTierPriceShort', '€9.99')}
                </button>
                )}
                {/* Get Pro AI — purple filled (primary, recommended upgrade) */}
                <button onClick={() => buy(upgradeOnly ? upTier : 'pro_ai')}
                  style={{
                    width: '100%', background: AI_PURPLE, color: '#0a0a12', border: 'none',
                    padding: '14px 18px', borderRadius: 5, fontSize: (.78*readScale)+'rem',
                    fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase',
                    cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10,
                  }}>
                  {(upgradeOnly && upTier === 'upgrade')
                    ? <>{(renew || aiExpired) ? tr('proRenewCta', 'Add 12 months of AI') : tr('proUpgradeCta', 'Get the AI pass')} — {tr('proUpgradePriceShort', '€10')}</>
                    : <>{tr('proAiGetCta', 'Get Pro AI')} — {tr('proAiTierPriceShort', '€19.99')}</>}
                </button>
              </>
            )}
            <button style={btnGhost} onClick={() => setView('key')}>
              {tr('proHaveKey', 'I already have a key')}
            </button>
            <p style={{ textAlign: 'center', margin: '10px 0 0' }}>
              <span onClick={() => setView('intro')} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView('intro'); } }}
                style={{ color: '#888', fontSize: (.6*readScale)+'rem', letterSpacing: '.04em', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                ← {tr('proBack', 'Back')}
              </span>
            </p>
          </>
        )}

        {view === 'refund' && (() => {
          const MAIL = 'hello@paintiano.app';
          const GREEN = '#9be0b8', AMBER = '#f0b48a';
          const head = (ic, bg, title, sub) => (
            <>
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <div style={{ display: 'inline-flex', width: 64, height: 64, borderRadius: '50%', alignItems: 'center', justifyContent: 'center', background: bg, color: '#fff', fontSize: 28 }}>{ic}</div>
              </div>
              <p style={{ fontSize: (1.05*readScale)+'rem', fontWeight: 800, textAlign: 'center', margin: '0 0 6px', lineHeight: 1.2 }}>{title}</p>
              <p style={{ fontSize: (.66*readScale)+'rem', color: 'rgba(242,238,232,.66)', textAlign: 'center', margin: '0 0 18px', lineHeight: 1.45 }}>{sub}</p>
            </>
          );
          const rows = (list) => (
            <div style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, padding: '6px 16px', background: 'rgba(255,255,255,.03)', marginBottom: 14 }}>
              {list.filter(Boolean).map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', fontSize: (.72*readScale)+'rem', borderTop: i ? '1px solid rgba(255,255,255,.07)' : 0 }}>
                  <span style={{ color: 'rgba(242,238,232,.66)' }}>{r[0]}</span>
                  <span style={{ fontWeight: 700, textAlign: 'right', color: r[2] || '#f5f5f5' }}>{r[1]}</span>
                </div>
              ))}
            </div>
          );
          const pill = (label, onClick, gold) => (
            <button type="button" onClick={onClick} disabled={rfBusy} style={{ display: 'block', width: '100%', border: 0, borderRadius: 999, padding: 14, textAlign: 'center', fontWeight: 800, fontSize: (.8*readScale)+'rem', fontFamily: 'inherit', cursor: 'pointer', opacity: rfBusy ? .55 : 1,
              background: gold ? 'linear-gradient(135deg,#f0d78a,#c9a84c)' : 'rgba(255,255,255,.12)', color: gold ? '#0a0a12' : '#f5f5f5' }}>{label}</button>
          );
          const note = (txt) => (<p style={{ fontSize: (.6*readScale)+'rem', color: 'rgba(242,238,232,.5)', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.5 }}>{txt}</p>);
          const rfBack = () => { if (reason === 'refund') { onClose && onClose(); } else setView('intro'); };
          const of = (n, m) => tr('refundOf', '{n} of {m}').replace('{n}', n).replace('{m}', m);
          const back = (
            <p style={{ textAlign: 'center', margin: '14px 0 0' }}>
              <span onClick={rfBack} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rfBack(); } }}
                style={{ color: 'rgba(242,238,232,.6)', fontSize: (.62*readScale)+'rem', cursor: 'pointer' }}>← {tr('proBack', 'Back')}</span>
            </p>
          );
          if (!rf) return (
            <>
              {head('↩', 'rgba(255,255,255,.1)', tr('refundAskT', 'Get a refund?'), rfErr ? tr('refundErr', 'Could not connect. Try again in a moment.') : '…')}
              {rfErr && pill(tr('refundDoPlain', 'Ask for the refund'), openRefund, false)}
              {back}
            </>
          );
          const name = rf.kind === 'pass' ? tr('refundPassName', 'AI pass') : rf.kind === 'pro_ai' ? 'Paintiano Pro AI' : 'Paintiano Pro';
          const money = pfMoney(rf.amount_cents, rf.currency, lang);
          const bought = rf.bought ? pfFmtDay(Date.parse(rf.bought), lang) : '';
          const exRow = (rf.exports != null) ? [tr('refundRowExports', 'Watermark-free exports'), of(rf.exports, rf.max_exports), rf.exports > rf.max_exports ? AMBER : GREEN] : null;
          const aiRow = (rf.kind !== 'pro' || rf.ai > 0) ? [tr('refundRowAi', 'AI pieces & melodies'), of(rf.ai, rf.max_ai), rf.ai > rf.max_ai ? AMBER : GREEN] : null;
          if (rf.done) return (
            <>
              {head('✓', 'linear-gradient(135deg,#9be0b8,#3fa97a)', tr('refundOkT', 'Request received'), tr('refundOkSub', 'The money goes back to the same payment method, usually within a few days.'))}
              {rows([money ? [tr('refundRowAmount', 'We refund'), money] : null, [tr('refundRowConfirm', 'Confirmation'), tr('refundByPaddle', 'by e-mail from Paddle')]])}
              {pill(tr('refundOkBtn', 'Got it'), () => onClose && onClose(), true)}
              {note(tr('refundOkNote', 'Thank you for trying Paintiano.'))}
            </>
          );
          if (rf.eligible) return (
            <>
              {head('↩', 'rgba(255,255,255,.1)', tr('refundAskT', 'Get a refund?'), tr('refundBought', '{p} · bought {d}').replace('{p}', name).replace('{d}', bought))}
              {rows([money ? [tr('refundRowAmount', 'We refund'), money] : null, exRow, aiRow,
                [tr('refundRowOff', 'Switched off on this key'), rf.kind === 'pass' ? tr('refundOffPass', 'AI · Pro stays') : rf.kind === 'pro_ai' ? tr('refundOffProAi', 'Pro and AI') : tr('refundOffPro', 'Pro')]])}
              {pill(money ? tr('refundDo', 'Refund {a}').replace('{a}', money) : tr('refundDoPlain', 'Ask for the refund'), doRefund, false)}
              {rfErr && note(tr('refundErr', 'Could not connect. Try again in a moment.'))}
              {note(rf.kind === 'pass' ? tr('refundAskNotePass', 'Pro stays yours, and so do the pieces you already have.') : tr('refundAskNote', 'The key stops working on all devices. Paintings and pieces you already have stay yours.'))}
              {back}
            </>
          );
          const byRule = rf.reason === 'late' || rf.reason === 'exports' || rf.reason === 'ai';
          const mailHref = 'mailto:' + MAIL + '?subject=' + encodeURIComponent('Refund') + '&body=' + encodeURIComponent('Licence key: ' + (licenseKey || ''));
          return (
            <>
              {head('!', 'linear-gradient(135deg,#f0b48a,#d9713d)', tr('refundNoT', 'This one needs a person'), byRule ? tr('refundNoSub', 'A refund by itself is for the first 14 days and ordinary trying out.') : tr('refundNoSubOther', 'This refund cannot be done by itself.'))}
              {byRule && rows([exRow, aiRow, bought ? [tr('refundRowBought', 'Bought'), bought, rf.reason === 'late' ? AMBER : GREEN] : null])}
              <a href={mailHref} style={{ display: 'block', borderRadius: 999, padding: 14, textAlign: 'center', fontWeight: 800, fontSize: (.8*readScale)+'rem', background: 'rgba(255,255,255,.12)', color: '#f5f5f5', textDecoration: 'none' }}>{tr('refundWrite', 'Write to us')}</a>
              {note(tr('refundNoNote', 'If you think a refund is due, write to {e} — we will look at it in person.').replace('{e}', MAIL))}
              {back}
            </>
          );
        })()}

        {view === 'success' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{
              display: 'inline-flex', width: 46, height: 46, borderRadius: '50%',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(201,168,76,.15)', color: GOLD, fontSize: 22, marginBottom: 12,
            }}>✓</div>
            <p style={{ fontSize: (.9*readScale)+'rem', fontWeight: 600, margin: '0 0 6px' }}>
              {reason === 'upgraded' ? tr('proAiWelcomeTitle', 'Pro AI is active') : tr('proWelcomeTitle', 'Welcome to Pro')}
            </p>
            <p style={{ fontSize: (.7*readScale)+'rem', color: '#9a9a9a', margin: 0, lineHeight: 1.5 }}>
              {reason === 'upgraded' ? tr('proAiWelcomeBody', 'AI is on: up to 30 pieces & melodies a day.') : tr('proWelcomeBody', 'All features unlocked on this device.')}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
