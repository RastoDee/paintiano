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
  // Lemon Squeezy hosted checkout for "Paintiano Pro" (store slug: paintiano)
  checkoutUrl: 'https://paintiano.lemonsqueezy.com/checkout/buy/8d42493f-bca9-44b2-a057-8d730a8b2616',
  // Our own Vercel Edge validation endpoint (same origin as the app)
  validateEndpoint: '/api/validate',
  // localStorage keys
  licenseStoreKey: 'paintiano_license_v1',
  trialStoreKey: 'paintiano_ai_trial_v1',
  // Trust a cached "valid" verdict this long before re-validating online
  revalidateAfterMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  // Free-tier heavy-AI allowance before the paywall
  trialMax: 5,
  // Display price (informational; real price + VAT come from Lemon Squeezy)
  displayPrice: '€9.99',
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
  const [proStatus, setProStatus] = useState('loading'); // 'loading'|'free'|'pro'
  const [licenseKey, setLicenseKey] = useState(null);
  const [maskedEmail, setMaskedEmail] = useState(null);

  useEffect(() => {
    const cached = _proReadCache();
    if (!cached) { setProStatus('free'); return; }
    const stale = Date.now() - (cached.validatedAt || 0) > PRO_CFG.revalidateAfterMs;
    if (!stale) {
      setProStatus('pro'); setLicenseKey(cached.key); setMaskedEmail(cached.email || null);
      return;
    }
    _proValidate(cached.key).then((res) => {
      if (res.valid) {
        _proWriteCache(cached.key, { email: res.email });
        setProStatus('pro'); setLicenseKey(cached.key); setMaskedEmail(res.email || null);
      } else if (res.offline) {
        // Network down during re-check → trust the cache (stay Pro) until online.
        setProStatus('pro'); setLicenseKey(cached.key); setMaskedEmail(cached.email || null);
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
      _proWriteCache(key, { email: res.email });
      setProStatus('pro'); setLicenseKey(key); setMaskedEmail(res.email || null);
      return { ok: true };
    }
    return { ok: false, reason: res.reason || 'unknown' };
  }, []);

  const deactivateLicense = useCallback(() => {
    _proClearCache(); setProStatus('free'); setLicenseKey(null); setMaskedEmail(null);
  }, []);

  const openCheckout = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && window.LemonSqueezy && window.LemonSqueezy.Url && window.LemonSqueezy.Url.Open) {
        window.LemonSqueezy.Url.Open(PRO_CFG.checkoutUrl);
      } else {
        window.open(PRO_CFG.checkoutUrl, '_blank', 'noopener');
      }
    } catch (_) {
      window.open(PRO_CFG.checkoutUrl, '_blank', 'noopener');
    }
  }, []);

  return { proStatus, isPro: proStatus === 'pro', licenseKey, maskedEmail,
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

// ─── watermark for free exports (no-op for Pro) ───────────────────────────────
function applyWatermark(canvas, isPro) {
  if (isPro || !canvas) return canvas;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const w = canvas.width, h = canvas.height;
    const fontPx = Math.max(12, Math.round(h * 0.018));
    const pad = Math.round(h * 0.025);
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#ffffff';
    ctx.font = '500 ' + fontPx + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 2;
    ctx.fillText('paintiano.app', w - pad, h - pad);
    ctx.restore();
  } catch (_) {}
  return canvas;
}

// ─── ProBadge — small gold PRO pill for the header ─────────────────────────────
function ProBadge({ t }) {
  const label = (t && t('proBadge')) || 'PRO';
  return (
    <span style={{
      display: 'inline-block', marginLeft: 8, padding: '2px 7px',
      fontSize: (.5*readScale)+'rem', fontWeight: 600, letterSpacing: '.14em',
      color: GOLD, background: 'rgba(201,168,76,.15)',
      border: '1px solid rgba(201,168,76,.45)', borderRadius: 999,
      textTransform: 'uppercase', verticalAlign: 'middle',
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
  const btnGhost = {
    width: '100%', background: 'transparent', color: '#999',
    border: '1px solid rgba(255,255,255,.18)', padding: '9px 12px',
    borderRadius: 5, fontSize: (.62*readScale)+'rem', letterSpacing: '.06em',
    cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase',
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
                : tr('proPaywallTitle', 'This is part of Paintiano Pro')}
            </p>
            <p style={{ fontSize: (.66*readScale)+'rem', color: GOLD, textAlign: 'center', margin: '0 0 16px', letterSpacing: '.04em', fontStyle: 'italic', opacity: .9 }}>
              {tr('proPaywallSubtitle', 'Unlock everything. Pay once. Keep forever.')}
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px' }}>
              {[
                ['proValue1', 'Unlimited AI compositions', 'proValue1Sub', 'Generate as many paintings as you wish'],
                ['proValue2', 'Export without watermark', 'proValue2Sub', 'Clean images, ready to share or print'],
                ['proValue3', 'Lifetime access', 'proValue3Sub', 'One payment, yours forever'],
                ['proValue4', 'Support a solo art project', 'proValue4Sub', 'Keep Paintiano independent'],
              ].map(([k1, fb1, k2, fb2], i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, margin: '0 0 9px', fontSize: (.7*readScale)+'rem', lineHeight: 1.4 }}>
                  <span style={{ color: GOLD, fontSize: (.75*readScale)+'rem', flexShrink: 0, marginTop: 1 }}>✓</span>
                  <span>
                    <span style={{ color: '#f5f5f5', fontWeight: 500 }}>{tr(k1, fb1)}</span>
                    <span style={{ color: '#8a8a8a', display: 'block', fontSize: (.62*readScale)+'rem', marginTop: 1 }}>{tr(k2, fb2)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <button style={btnGold} onClick={openCheckout}>
              {tr('proPaywallCta', 'Get Paintiano Pro — €9.99 lifetime')}
            </button>
            <p style={{ color: GOLD, fontSize: (.58*readScale)+'rem', textAlign: 'center', margin: '0 0 10px', letterSpacing: '.04em', opacity: .85 }}>
              {tr('proEarlyBird', 'Early-bird price · first 50 supporters · then €14.99')}
            </p>
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

            <button style={btnGold} onClick={openCheckout}>
              {tr('proAboutFinalCta', 'Get Paintiano Pro — €9.99 lifetime')}
            </button>
            <p style={{ color: GOLD, fontSize: (.58*readScale)+'rem', textAlign: 'center', margin: '0 0 10px', letterSpacing: '.04em', opacity: .85 }}>
              {tr('proEarlyBird', 'Early-bird price · first 50 supporters · then €14.99')}
            </p>
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
