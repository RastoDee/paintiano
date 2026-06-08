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

// ─── watermark for free exports (no-op for Pro) ───────────────────────────────
function applyWatermark(canvas, isPro) {
  if (isPro || !canvas) return canvas;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const w = canvas.width, h = canvas.height;
    // Diagonal repeating watermark — like stock-photo previews. The mark sits
    // on top of the painting at low opacity and at a 30° angle, repeated in a
    // grid so cropping any region still carries the brand. Font size scales
    // with canvas height so it stays readable from a small Story (1080×1920)
    // up to a huge A1 print (~7000+ px). Two ink passes: a soft dark stroke
    // for legibility on light areas, then a brighter fill for dark areas.
    const text = 'paintiano.app';
    const fontPx = Math.max(28, Math.round(h * 0.038));
    const stepX = Math.round(fontPx * 12);   // horizontal spacing between marks
    const stepY = Math.round(fontPx * 6);    // vertical spacing between rows
    const angle = -Math.PI / 6;              // -30°
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.font = '600 ' + fontPx + 'px "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    // Diagonal of rotated canvas needs to cover the original — use the
    // diagonal length so the grid extends past every corner.
    const diag = Math.ceil(Math.sqrt(w * w + h * h));
    const cols = Math.ceil(diag / stepX) + 2;
    const rows = Math.ceil(diag / stepY) + 2;
    for (let r = -Math.floor(rows / 2); r <= Math.ceil(rows / 2); r++) {
      // Offset every other row by half a step so the grid feels organic.
      const offset = (r % 2 === 0) ? 0 : stepX / 2;
      for (let c = -Math.floor(cols / 2); c <= Math.ceil(cols / 2); c++) {
        const x = c * stepX + offset;
        const y = r * stepY;
        // Dark stroke first → readable on bright areas
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.08));
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.strokeText(text, x, y);
        // Light fill on top → readable on dark areas
        ctx.globalAlpha = 0.32;
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
// `tier`: 'pro' (default — gold, used for non-AI Pro features like 16 artists,
// 300 DPI, Custom palette) or 'ai' (purple, "PRO AI" label — used for AI
// features locked to the Pro AI tier: How do you feel? mood input, MFI,
// AI Compose, Atmosphere).
function ProBadge({ t, readScale = 1, size = 'md', tier = 'pro' }) {
  const isAI = tier === 'ai';
  const label = isAI
    ? ((t && t('proAiBadge')) || 'PRO AI')
    : ((t && t('proBadge')) || 'PRO');
  const isSm = size === 'sm';
  const color = isAI ? '#dcb4ff' : GOLD;
  const bg = isAI ? 'rgba(220,150,255,.16)' : 'rgba(201,168,76,.15)';
  const border = isAI ? 'rgba(220,150,255,.5)' : 'rgba(201,168,76,.45)';
  return (
    <span style={{
      display: 'inline-block',
      marginLeft: isSm ? 5 : 8,
      padding: isSm ? '1px 5px' : '2px 7px',
      fontSize: (isSm ? .42 : .5) * readScale + 'rem',
      fontWeight: 600, letterSpacing: '.14em',
      color, background: bg,
      border: `1px solid ${border}`, borderRadius: 999,
      textTransform: 'uppercase', verticalAlign: 'middle',
      lineHeight: 1.2,
    }}>{label}</span>
  );
}

// ─── ProPaywall — the modal ────────────────────────────────────────────────────
// Props: { t, reason, onClose, onActivated, openCheckout, activateLicense, trialLeft }
function ProPaywall({ t, reason, onClose, onActivated, openCheckout, activateLicense, trialLeft, readScale = 1 }) {
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
  // `tierKey` ∈ 'pro' | 'pro_ai'. `recommended` adds the gold ribbon + bright
  // border. `cta` toggles between gold-filled and outlined button style so the
  // visual hierarchy reflects which tier the paywall is pushing.
  const renderTierCard = (tierKey, recommended) => {
    const isAI = tierKey === 'pro_ai';
    const cardStyle = recommended ? tierCardHighlight : tierCard;
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
      ['proValueArtists', '16 artists (free has 8)'],
      ['proValueTypes',   '6 paint types per artist (free has 2)'],
      ['proValuePalette', 'Custom palette — set your own 12 colours'],
      ['proValueDpi',     '300 DPI exports, no watermark'],
      ['proValueLife',    'Lifetime access'],
    ];
    const btnStyle = recommended ? btnGold : btnGoldOutline;
    return (
      <div style={cardStyle}>
        {recommended && (
          <span style={recommendedBadge}>{tr('proRecommended', 'Recommended')}</span>
        )}
        <p style={tierTitle}>{title}</p>
        <p style={tierPrice}>{priceLine}</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
          {values.map(([k, fb], i) => (
            <li key={i} style={tierValueRow}>
              <span style={tierCheck}>✓</span>
              <span>{tr(k, fb)}</span>
            </li>
          ))}
        </ul>
        <button style={Object.assign({}, btnStyle, { marginBottom: 0 })}
                onClick={() => openCheckout(tierKey)}>
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
            {PRO_CFG.checkoutDisabled ? (
              <>
                <div style={{...btnGold, opacity:.45, cursor:'default', pointerEvents:'none', display:'flex', flexDirection:'column', gap:2, padding:'14px 18px'}}>
                  <span>{tr('proComingSoon', 'Checkout — coming soon')}</span>
                  <span style={{fontSize:(.6*readScale)+'rem', fontWeight:400, opacity:.75, letterSpacing:'.02em'}}>
                    {tr('proCheckoutMoving', 'we\u2019re moving payment providers')}
                  </span>
                </div>
                <p style={{ color: GOLD, fontSize: (.58*readScale)+'rem', textAlign: 'center', margin: '0 0 10px', letterSpacing: '.04em', opacity: .65 }}>
                  {tr('proBackOnlineSoon', 'back online in a few days · early-bird prices preserved')}
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
            <button style={btnGhost} onClick={() => setView('key')}>
              {tr('proHaveKey', 'I already have a key')}
            </button>
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
                {tr('proAboutTitle', 'Paintiano Pro')}
              </p>
              <p style={{ fontSize: (.72*readScale)+'rem', color: GOLD, margin: 0, letterSpacing: '.04em', fontStyle: 'italic', opacity: .9 }}>
                {tr('proAboutLead', 'Everything in Free, without limits.')}
              </p>
            </div>

            <p style={{ fontSize: (.66*readScale)+'rem', color: GOLD, letterSpacing: '.18em', textTransform: 'uppercase', margin: '0 0 10px', opacity: .8 }}>
              {tr('proAboutWhatYouGet', 'What you get with Pro')}
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px' }}>
              {[
                ['proValue1', 'Unlimited AI compositions', 'proValue1Sub', 'Generate as many paintings as you wish'],
                ['proValue2', 'Export without watermark', 'proValue2Sub', 'Clean images, ready to share or print'],
                ['proValue3', 'Lifetime access', 'proValue3Sub', 'One payment, yours forever'],
                ['proValue4', 'Support a solo art project', 'proValue4Sub', 'Keep Paintiano independent'],
              ].map(([k1, fb1, k2, fb2], i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '0 0 11px', fontSize: (.72*readScale)+'rem', lineHeight: 1.45 }}>
                  <span style={{ color: GOLD, fontSize: (.8*readScale)+'rem', flexShrink: 0, marginTop: 1 }}>✓</span>
                  <span>
                    <span style={{ color: '#f5f5f5', fontWeight: 500 }}>{tr(k1, fb1)}</span>
                    <span style={{ color: '#8a8a8a', display: 'block', fontSize: (.64*readScale)+'rem', marginTop: 1 }}>{tr(k2, fb2)}</span>
                  </span>
                </li>
              ))}
            </ul>

            <p style={{ fontSize: (.66*readScale)+'rem', color: GOLD, letterSpacing: '.18em', textTransform: 'uppercase', margin: '0 0 10px', opacity: .8 }}>
              {tr('proAboutCompareTitle', 'Free vs Pro')}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: (.66*readScale)+'rem', marginBottom: 22 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid rgba(201,168,76,.25)', color: '#9a9a9a', fontWeight: 500 }}>{tr('proAboutCompareFeature', 'Feature')}</th>
                  <th style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid rgba(201,168,76,.25)', color: '#9a9a9a', fontWeight: 500, width: '22%' }}>{tr('proAboutCompareFree', 'Free')}</th>
                  <th style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid rgba(201,168,76,.25)', color: GOLD, fontWeight: 600, width: '22%' }}>{tr('proAboutComparePro', 'Pro')}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['proAboutCmp1', 'All manual modes (keyboard, mic, audio)', '✓', '✓'],
                  ['proAboutCmp2', 'All visual styles & moods', '✓', '✓'],
                  ['proAboutCmp3', 'AI compositions',
                    tr('proAboutCmp3Free', '5 trial'),
                    tr('proAboutCmp3Pro', 'Unlimited')],
                  ['proAboutCmp4', 'Watermark on exports',
                    tr('proAboutCmp4Free', 'Yes'),
                    tr('proAboutCmp4Pro', 'None')],
                  ['proAboutCmp5', 'Lifetime access', '—', '✓'],
                ].map(([k, fb, freeVal, proVal], i) => (
                  <tr key={i}>
                    <td style={{ padding: '7px 4px', borderBottom: '1px solid rgba(255,255,255,.06)', color: '#d8d8d8' }}>{tr(k, fb)}</td>
                    <td style={{ padding: '7px 4px', borderBottom: '1px solid rgba(255,255,255,.06)', textAlign: 'center', color: '#9a9a9a' }}>{freeVal}</td>
                    <td style={{ padding: '7px 4px', borderBottom: '1px solid rgba(255,255,255,.06)', textAlign: 'center', color: GOLD, fontWeight: 500 }}>{proVal}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p style={{ fontSize: (.66*readScale)+'rem', color: GOLD, letterSpacing: '.18em', textTransform: 'uppercase', margin: '0 0 10px', opacity: .8 }}>
              {tr('proAboutHonestTitle', 'Honest about what Pro isn’t')}
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px' }}>
              {[
                ['proAboutHonest1', 'Pro keeps the same Paintiano you already use — it just removes the limits. No hidden new features behind a wall.'],
                ['proAboutHonest2', 'Pro doesn’t sync between devices automatically. Your license key works on up to 5 devices.'],
                ['proAboutHonest3', 'Pro doesn’t include cloud storage. You save your paintings to your own files.'],
              ].map(([k, fb], i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '0 0 9px', fontSize: (.66*readScale)+'rem', lineHeight: 1.5, color: '#a8a8a8' }}>
                  <span style={{ color: '#666', flexShrink: 0, marginTop: 1 }}>·</span>
                  <span>{tr(k, fb)}</span>
                </li>
              ))}
            </ul>

            {PRO_CFG.checkoutDisabled ? (
              <>
                <div style={{...btnGold, opacity:.45, cursor:'default', pointerEvents:'none', display:'flex', flexDirection:'column', gap:2, padding:'14px 18px'}}>
                  <span>{tr('proComingSoon', 'Checkout — coming soon')}</span>
                  <span style={{fontSize:(.6*readScale)+'rem', fontWeight:400, opacity:.75, letterSpacing:'.02em'}}>
                    {tr('proCheckoutMoving', 'we\u2019re moving payment providers')}
                  </span>
                </div>
                <p style={{ color: GOLD, fontSize: (.58*readScale)+'rem', textAlign: 'center', margin: '0 0 10px', letterSpacing: '.04em', opacity: .65 }}>
                  {tr('proBackOnlineSoon', 'back online in a few days · early-bird price (€9.99) preserved')}
                </p>
              </>
            ) : (
              <>
                {reason === 'ai_trial' ? (
                  <>
                    <button style={btnGold} onClick={() => openCheckout('pro_ai')}>
                      {tr('proAiAboutFinalCta', 'Get Paintiano Pro AI — €19.99 lifetime')}
                    </button>
                    <button style={btnGoldOutline} onClick={() => openCheckout('pro')}>
                      {tr('proAboutFinalCta', 'Get Paintiano Pro — €9.99 lifetime')}
                    </button>
                  </>
                ) : (
                  <>
                    <button style={btnGold} onClick={() => openCheckout('pro')}>
                      {tr('proAboutFinalCta', 'Get Paintiano Pro — €9.99 lifetime')}
                    </button>
                    <button style={btnGoldOutline} onClick={() => openCheckout('pro_ai')}>
                      {tr('proAiAboutFinalCta', 'Get Paintiano Pro AI — €19.99 lifetime')}
                    </button>
                  </>
                )}
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
