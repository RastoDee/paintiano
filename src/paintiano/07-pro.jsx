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
  //   Pro    = full deterministic tool, NO AI (lifetime). Early-bird €9.99 → €14.99.
  //   Pro AI = Pro + unlimited AI composition (lifetime). Early-bird €19.99 → €24.99.
  // The legacy single price ID below is the original "Paintiano Pro Lifetime"
  // (€9.99). It is REUSED as the Pro tier price for now; the Pro AI price must
  // be created in the Paddle catalog and its ID pasted into paddlePriceIdProAI.
  // NOTE: until the Pro AI price exists in Paddle (step C), paddlePriceIdProAI
  // is null and openCheckout('pro_ai') will fall back to the Pro price.
  paddlePriceIdPro:   'pri_01kt6s053namfk25tvvdw2eaey',
  paddlePriceIdProAI: 'pri_01ktkmf6ghq0kk3vkg2dtnjd7q',
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
  // Early-bird values shown until the first-50 window closes (then 14.99/24.99).
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

// ─── server validation (through our own endpoint) ────────────────────────────
async function _proValidate(key) {
  try {
    const r = await fetch(PRO_CFG.validateEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (!r.ok) return { valid: false, reason: 'http_' + r.status };
    return await r.json();
  } catch (_) {
    return { valid: false, reason: 'network', offline: true };
  }
}

// ─── Pro status hook ──────────────────────────────────────────────────────────
function useProStatus() {
  // proStatus: 'loading' | 'free' | 'pro' | 'pro_ai'
  //   'pro'    = paid, full tool, NO unlimited AI (AI runs on trial like free)
  //   'pro_ai' = paid, full tool + unlimited AI
  // isPro stays true for BOTH paid tiers (watermark/DPI300 gating unchanged);
  // isProAI is the new flag that unlocks unlimited AI.
  const [proStatus, setProStatus] = useState('loading');
  const [licenseKey, setLicenseKey] = useState(null);
  const [maskedEmail, setMaskedEmail] = useState(null);

  // Map a validated tier string to a proStatus value. Defaults to 'pro' for
  // any unknown/missing tier so a valid-but-untagged key still unlocks the
  // paid tool (safe: AI stays gated behind pro_ai).
  const _tierToStatus = (tier) => (tier === 'pro_ai' ? 'pro_ai' : 'pro');

  useEffect(() => {
    const cached = _proReadCache();
    if (!cached) { setProStatus('free'); return; }
    const stale = Date.now() - (cached.validatedAt || 0) > PRO_CFG.revalidateAfterMs;
    if (!stale) {
      setProStatus(_tierToStatus(cached.tier)); setLicenseKey(cached.key); setMaskedEmail(cached.email || null);
      return;
    }
    _proValidate(cached.key).then((res) => {
      if (res.valid) {
        _proWriteCache(cached.key, { email: res.email, tier: res.tier });
        setProStatus(_tierToStatus(res.tier)); setLicenseKey(cached.key); setMaskedEmail(res.email || null);
      } else if (res.offline) {
        // Network down during re-check → trust the cache (stay paid) until online.
        setProStatus(_tierToStatus(cached.tier)); setLicenseKey(cached.key); setMaskedEmail(cached.email || null);
      } else {
        // Authoritative revoke (refunded/disabled/not_found)
        _proClearCache(); setProStatus('free'); setLicenseKey(null); setMaskedEmail(null);
      }
    });
  }, []);

  const activateLicense = useCallback(async (raw) => {
    const key = (raw || '').trim();
    if (!key) return { ok: false, reason: 'empty' };
    const res = await _proValidate(key);
    if (res.valid) {
      _proWriteCache(key, { email: res.email, tier: res.tier });
      setProStatus(_tierToStatus(res.tier)); setLicenseKey(key); setMaskedEmail(res.email || null);
      return { ok: true, tier: _tierToStatus(res.tier) };
    }
    return { ok: false, reason: res.reason || 'unknown' };
  }, []);

  const deactivateLicense = useCallback(() => {
    _proClearCache(); setProStatus('free'); setLicenseKey(null); setMaskedEmail(null);
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
    try {
      try { window.posthog && window.posthog.capture('checkout_opened', { tier }); } catch (_) {}
      const Paddle = await loadPaddleScript();
      if (!Paddle) throw new Error('Paddle not available');
      // Pick the price for the requested tier. Pro AI falls back to the Pro
      // price until its Paddle price ID exists (step C) — so the button never
      // dead-ends; worst case it sells Pro instead of Pro AI.
      const priceId = (tier === 'pro_ai' && PRO_CFG.paddlePriceIdProAI)
        ? PRO_CFG.paddlePriceIdProAI
        : PRO_CFG.paddlePriceIdPro;
      // Initialize is idempotent — calling twice is safe.
      Paddle.Environment.set(PRO_CFG.paddleEnv); // 'production' or 'sandbox'
      Paddle.Initialize({ token: PRO_CFG.paddleClientToken });
      Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        settings: {
          displayMode: 'overlay',
          theme: 'dark',
          locale: (typeof navigator !== 'undefined' && navigator.language) ? navigator.language.slice(0, 2) : 'en',
          successUrl: typeof window !== 'undefined' ? window.location.origin + '/?paid=1' : undefined,
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
  }, [loadPaddleScript]);

  return { proStatus,
           isPro: proStatus === 'pro' || proStatus === 'pro_ai',
           isProAI: proStatus === 'pro_ai',
           licenseKey, maskedEmail,
           activateLicense, deactivateLicense, openCheckout };
}

// ─── AI trial counter hook (free tier: PRO_CFG.trialMax heavy AI calls) ────────
// trialUsed is a FLOAT — full AI calls (composeFromImage, aiCompose) consume
// 1.0, while lighter calls (atmosphere detect) consume 0.5. trialLeft is
// rounded UP for user-facing display via Math.ceil at the callsite.
function useAiTrial() {
  const [trialUsed, setTrialUsed] = useState(() => {
    try { return Math.max(0, parseFloat(localStorage.getItem(PRO_CFG.trialStoreKey) || '0')) || 0; }
    catch (_) { return 0; }
  });

  // Optional amount (default 1 = full AI call). Pass 0.5 for atmo/lighter calls.
  const consumeTrial = useCallback((amount = 1) => {
    setTrialUsed((n) => {
      const next = n + amount;
      try { localStorage.setItem(PRO_CFG.trialStoreKey, String(next)); } catch (_) {}
      return next;
    });
  }, []);

  const resetTrial = useCallback(() => {
    try { localStorage.removeItem(PRO_CFG.trialStoreKey); } catch (_) {}
    setTrialUsed(0);
  }, []);

  return {
    trialUsed,
    trialLeft: Math.max(0, PRO_CFG.trialMax - trialUsed),
    trialExhausted: trialUsed >= PRO_CFG.trialMax,
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
  const gateAI = useCallback((amount = 1, consume = true) => {
    if (pro.proStatus === 'loading') return { allow: false, reason: 'loading' };
    // Unlimited AI is a Pro AI privilege only. Plain Pro is the full
    // deterministic tool but NOT unlimited AI — so Pro falls through to the
    // same trial path as Free, which funnels it toward a Pro AI upgrade.
    if (pro.proStatus === 'pro_ai')  return { allow: true };
    // free OR pro tier → trial credits
    if (trial.trialExhausted)        return { allow: false, reason: 'ai_trial' };
    if (consume) trial.consumeTrial(amount);
    return { allow: true };
  }, [pro.proStatus, trial.trialExhausted, trial.consumeTrial]);
  return {
    ...pro,            // proStatus, isPro, licenseKey, maskedEmail, activate/deactivate/openCheckout
    ...trial,          // trialUsed, trialLeft, trialExhausted, consumeTrial, resetTrial
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
    if (!ctx) { try { console.warn('[phi] no ctx'); } catch(_) {} return; }
    const w = canvas.width, h = canvas.height;
    const minEdge = Math.min(w, h);
    // DEBUG: 8% shortEdge = huge, undeniable. Roll back once we confirm.
    const fontPx = Math.max(48, Math.round(minEdge * 0.08));
    const margin = Math.round(minEdge * 0.030);
    const cx = w - margin;
    const cy = h - margin;
    try { console.log('[phi] draw', {w, h, fontPx, cx, cy}); } catch(_) {}
    ctx.save();
    // DEBUG frame around signature area — proves the function ran even if
    // the font renders empty for whatever reason.
    ctx.strokeStyle = 'rgba(255,0,0,0.9)';
    ctx.lineWidth = Math.max(3, Math.round(fontPx * 0.08));
    ctx.strokeRect(cx - fontPx * 1.0, cy - fontPx * 1.1, fontPx * 1.1, fontPx * 1.3);
    ctx.font = 'italic 700 ' + fontPx + 'px Georgia, "Times New Roman", Times, serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    // DEBUG: fully opaque white + black stroke — unmissable on any ground.
    ctx.lineWidth = Math.max(4, Math.round(fontPx * 0.08));
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.strokeText('φ', cx, cy);
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fillText('φ', cx, cy);
    ctx.restore();
  } catch (e) { try { console.error('[phi] err', e); } catch(_) {} }
}

// ─── watermark: diagonal tile on Free, discreet φ signature on Pro/Pro AI ────
function applyWatermark(canvas, isPro) {
  try { console.log('[phi] applyWatermark called', { isPro, hasCanvas: !!canvas, w: canvas && canvas.width, h: canvas && canvas.height }); } catch(_) {}
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
function ProPaywall({ t, reason, onClose, onActivated, openCheckout, activateLicense, trialLeft, readScale = 1, isDesktop = false }) {
  const [view, setView] = useState('intro'); // 'intro'|'key'|'success'
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const tr = (k, fb) => (t && t(k)) || fb;

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
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    fontFamily: 'inherit',
  };
  const card = {
    position: 'relative', width: '100%', maxWidth: 360,
    background: '#0a0a12', border: '1px solid rgba(201,168,76,.25)',
    borderRadius: 8, padding: 26, color: '#f5f5f5',
    boxShadow: '0 20px 60px rgba(0,0,0,.6)',
    maxHeight: '90vh', overflowY: 'auto',
  };
  const cardWide = Object.assign({}, card, { maxWidth: 460 });
  const btnGold = {
    width: '100%', background: GOLD, color: '#0a0a12', border: 'none',
    padding: '11px 12px', borderRadius: 5, fontSize: (.7*readScale)+'rem', fontWeight: 600,
    letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer',
    fontFamily: 'inherit', marginBottom: 8,
  };
  // Secondary CTA — same shape as btnGold but outlined (gold border, transparent
  // bg). Used to offer the OTHER tier alongside the primary CTA.
  const btnGoldOutline = {
    width: '100%', background: 'transparent', color: GOLD,
    border: `1px solid ${GOLD}`, padding: '10px 12px', borderRadius: 5,
    fontSize: (.66*readScale)+'rem', fontWeight: 600, letterSpacing: '.08em',
    textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
    marginBottom: 8,
  };
  const btnGhost = {
    width: '100%', background: 'transparent', color: '#999',
    border: '1px solid rgba(255,255,255,.18)', padding: '9px 12px',
    borderRadius: 5, fontSize: (.62*readScale)+'rem', letterSpacing: '.06em',
    cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase',
  };

  // ─── Tier card styles (paywall two-tier layout) ──────────────────────────
  // Each tier renders as a card with title + price + value bullets + CTA.
  // The "recommended" variant has a brighter gold border + RECOMMENDED ribbon,
  // used for Pro AI when reason === 'ai_trial' (user just hit the AI wall).
  const tierCard = {
    position: 'relative',
    border: '1px solid rgba(201,168,76,.25)',
    borderRadius: 8, padding: '18px 16px 14px',
    background: 'rgba(255,255,255,.02)',
    marginBottom: 12,
  };
  const tierCardHighlight = Object.assign({}, tierCard, {
    border: `1px solid ${GOLD}`,
    background: 'rgba(201,168,76,.05)',
    boxShadow: `0 0 0 1px rgba(201,168,76,.25), 0 6px 22px rgba(201,168,76,.10)`,
  });
  const tierTitle = {
    fontSize: (.85*readScale)+'rem', fontWeight: 600, color: '#f5f5f5',
    margin: '0 0 2px', letterSpacing: '.02em',
  };
  const tierPrice = {
    fontSize: (.7*readScale)+'rem', color: GOLD, margin: '0 0 12px',
    letterSpacing: '.04em', fontWeight: 500,
  };
  const tierValueRow = {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    margin: '0 0 6px', fontSize: (.66*readScale)+'rem', lineHeight: 1.4,
    color: '#e0e0e0',
  };
  const tierCheck = {
    color: GOLD, fontSize: (.72*readScale)+'rem', flexShrink: 0, marginTop: 1,
  };
  const recommendedBadge = {
    position: 'absolute', top: -10, right: 12,
    background: GOLD, color: '#0a0a12',
    fontSize: (.52*readScale)+'rem', fontWeight: 700,
    letterSpacing: '.12em', padding: '3px 9px',
    borderRadius: 3, textTransform: 'uppercase',
  };

  // Inline tier card renderer — used twice (intro view + about view).
  // `tierKey` ∈ 'pro' | 'pro_ai'. `recommended` adds the highlight ribbon +
  // bright border. Pro AI tier uses the purple AI accent throughout (matches
  // the in-app AI feature colour); Pro stays in the gold brand colour.
  const renderTierCard = (tierKey, recommended) => {
    const isAI = tierKey === 'pro_ai';
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
    const priceLine = isAI
      ? tr('proAiTierPrice', '€19.99 · early-bird (then €24.99)')
      : tr('proTierPrice',   '€9.99 · early-bird (then €14.99)');
    const values = isAI ? [
      ['proAiValueAll',   'Everything in Pro, plus:'],
      ['proAiValueText',  'AI composition from text moods'],
      ['proAiValueImage', 'AI composition from your images'],
      ['proAiValueAtmo',  'AI atmospheric tinting'],
    ] : [
      ['proValueArtists', '19 artists (free has 9)'],
      ['proValueTypes',   '6 paint types per artist (free has 2)'],
      ['proValuePalette', 'Custom palette — set your own 12 colours'],
      ['proValueDpi',     '300 DPI exports, no watermark'],
      ['proValueLife',    'Lifetime access'],
    ];
    // Tier-coloured button styles. Recommended = filled (primary CTA);
    // non-recommended = outline (secondary).
    const ctaBtn = recommended
      ? { width: '100%', background: accent, color: '#0a0a12', border: 'none',
          padding: '11px 12px', borderRadius: 5, fontSize: (.7*readScale)+'rem',
          fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase',
          cursor: 'pointer', fontFamily: 'inherit', marginBottom: 0 }
      : { width: '100%', background: 'transparent', color: accent,
          border: `1px solid ${accent}`, padding: '10px 12px', borderRadius: 5,
          fontSize: (.66*readScale)+'rem', fontWeight: 600, letterSpacing: '.08em',
          textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
          marginBottom: 0 };
    return (
      <div style={cardStyle}>
        {recommended && (
          <span style={Object.assign({}, recommendedBadge, { background: accent })}>{tr('proRecommended', 'Recommended')}</span>
        )}
        <p style={tierTitle}>{title}</p>
        <p style={Object.assign({}, tierPrice, { color: accent })}>{priceLine}</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
          {values.map(([k, fb], i) => (
            <li key={i} style={tierValueRow}>
              <span style={Object.assign({}, tierCheck, { color: accent })}>✓</span>
              <span>{tr(k, fb)}</span>
            </li>
          ))}
        </ul>
        <button style={ctaBtn} onClick={() => openCheckout(tierKey)}>
          {isAI
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
          position: 'fixed', top: 16, right: 16, zIndex: 100001,
          width: 38, height: 38, borderRadius: '50%',
          background: 'rgba(10,10,18,.85)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(201,168,76,.35)',
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
                display: 'inline-flex', width: 46, height: 46, borderRadius: '50%',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(201,168,76,.12)', color: GOLD, fontSize: 22,
              }}>✦</div>
            </div>
            <p style={{ fontSize: (.95*readScale)+'rem', fontWeight: 600, textAlign: 'center', margin: '0 0 6px' }}>
              {reason === 'ai_trial'
                ? tr('proPaywallTitleAi', 'You’ve used your free AI compositions')
                : tr('proPaywallTitle', 'Unlock the full Paintiano')}
            </p>
            <p style={{ fontSize: (.66*readScale)+'rem', color: GOLD, textAlign: 'center', margin: '0 0 16px', letterSpacing: '.04em', fontStyle: 'italic', opacity: .9 }}>
              {tr('proPaywallSubtitle', 'Pay once. Keep forever.')}
            </p>
            {isDesktop && (
              <button
                onClick={() => setView('key')}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 8, background: 'rgba(201,168,76,.10)', color: GOLD,
                  border: `1px solid ${GOLD}`, borderRadius: 6, padding: '11px 14px',
                  margin: '0 0 18px', fontSize: (.7*readScale)+'rem', fontWeight: 600,
                  letterSpacing: '.04em', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                <span aria-hidden="true" style={{ fontSize: (.82*readScale)+'rem', lineHeight: 1 }}>🔑</span>
                {tr('proHaveKey', 'I already have a key')}
              </button>
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
                  {tr('proBackOnlineSoon', 'your early-bird price is held · first 50 supporters')}
                </p>
              </>
            ) : (
              <>
                {/* Two tier cards, ordered by what brought the user here.
                    ai_trial → Pro AI on top with "Recommended" ribbon, Pro below.
                    settings → Pro on top (cheaper, sufficient for most non-AI needs), Pro AI below. */}
                {reason === 'ai_trial' ? (
                  <>
                    {renderTierCard('pro_ai', true)}
                    {renderTierCard('pro', false)}
                  </>
                ) : (
                  <>
                    {renderTierCard('pro', false)}
                    {renderTierCard('pro_ai', false)}
                  </>
                )}
                <p style={{ color: GOLD, fontSize: (.56*readScale)+'rem', textAlign: 'center', margin: '4px 0 12px', letterSpacing: '.04em', opacity: .75 }}>
                  {tr('proEarlyBird', 'Early-bird prices · first 50 supporters')}
                </p>
                <p style={{ color: '#8a8a8a', fontSize: (.58*readScale)+'rem', textAlign: 'center', margin: '0 0 14px', fontStyle: 'italic', opacity: .85 }}>
                  {tr('proSupportLine', 'You\u2019re also keeping a solo art project independent.')}
                </p>
              </>
            )}
            {!isDesktop && (
              <button style={btnGhost} onClick={() => setView('key')}>
                {tr('proHaveKey', 'I already have a key')}
              </button>
            )}
            <p style={{ textAlign: 'center', margin: '10px 0 0' }}>
              <span onClick={() => setView('about')} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView('about'); } }}
                style={{ color: GOLD, fontSize: (.6*readScale)+'rem', letterSpacing: '.04em', cursor: 'pointer', opacity: .8, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                {tr('proLearnMore', 'Learn more about Pro')} →
              </span>
            </p>
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
              const inf = tr('tierUnlimited', '∞');
              const ronly = tr('tierReadOnly', 'preview only');
              const credits3 = tr('tier3Credits', '3 credits');
              const rows = [
                [tr('tierRowArtists', 'Artists'),       '8',     '16',     '16',  null],
                [tr('tierRowTypes', 'Paint types'),     '2',     allWord,  allWord, null],
                [tr('tierRowPalette', 'Custom palette'),ronly,   yes,      yes,   null],
                [tr('tierRowDpi', '300 DPI export'),    no,      yes,      yes,   null],
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
                      <th style={Object.assign({}, cellSty, { color: FREE_FG, fontWeight: 500 })}>€0</th>
                      <th style={Object.assign({}, cellSty, { color: GOLD, fontWeight: 600, background: GOLD_BG })}>€9.99</th>
                      <th style={Object.assign({}, cellSty, { color: AI_PURPLE, fontWeight: 600, background: PURPLE_BG })}>€19.99</th>
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
              {tr('tierAiCreditsNote', 'AI text & image compose = 1 credit · Atmosphere = 0.5 credit')}
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
                ['proAboutHowFree3', 'AI features (✦) work for 3 trial credits, then ask you to upgrade to Pro AI for unlimited use. Exports always carry a watermark on Free.'],
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
                ['proAboutHonest3_2', 'Plain Pro removes the watermark and unlocks all artists, paint types and the custom palette — but AI calls still come from the same 3-credit trial pool as Free.'],
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
                {/* Get Pro — gold outline (secondary in the about view) */}
                <button style={Object.assign({}, btnGoldOutline, { marginBottom: 10 })}
                        onClick={() => openCheckout('pro')}>
                  {tr('proGetCta', 'Get Pro')} — {tr('proTierPriceShort', '€9.99')}
                </button>
                {/* Get Pro AI — purple filled (primary, recommended upgrade) */}
                <button onClick={() => openCheckout('pro_ai')}
                  style={{
                    width: '100%', background: AI_PURPLE, color: '#0a0a12', border: 'none',
                    padding: '14px 18px', borderRadius: 5, fontSize: (.78*readScale)+'rem',
                    fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase',
                    cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10,
                  }}>
                  {tr('proAiGetCta', 'Get Pro AI')} — {tr('proAiTierPriceShort', '€19.99')}
                </button>
                <p style={{ color: GOLD, fontSize: (.58*readScale)+'rem', textAlign: 'center', margin: '0 0 10px', letterSpacing: '.04em', opacity: .85 }}>
                  {tr('proEarlyBird', 'Early-bird prices · first 50 supporters')}
                </p>
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

        {view === 'success' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{
              display: 'inline-flex', width: 46, height: 46, borderRadius: '50%',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(201,168,76,.15)', color: GOLD, fontSize: 22, marginBottom: 12,
            }}>✓</div>
            <p style={{ fontSize: (.9*readScale)+'rem', fontWeight: 600, margin: '0 0 6px' }}>
              {tr('proWelcomeTitle', 'Welcome to Pro')}
            </p>
            <p style={{ fontSize: (.7*readScale)+'rem', color: '#9a9a9a', margin: 0, lineHeight: 1.5 }}>
              {tr('proWelcomeBody', 'All features unlocked on this device.')}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
