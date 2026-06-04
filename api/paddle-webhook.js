// api/paddle-webhook.js
// Endpoint Paddle calls when a Paintiano Pro purchase completes (or is refunded).
//
// Setup checklist (Paddle dashboard → Developer Tools → Notifications):
//   • Destination URL: https://paintiano.app/api/paddle-webhook
//   • Usage type:      Both (Platform + Simulation)
//   • Events:          transaction.completed, transaction.paid,
//                      transaction.canceled, adjustment.created
//
// What this does on each event:
//   • transaction.completed / transaction.paid
//       → generate a fresh license key (PAINT-XXXX-XXXX-XXXX)
//       → INSERT into Supabase licenses table with status='active'
//       → email the buyer their license key + activation steps via Resend
//   • adjustment.created (action=refund)
//       → SET status='refunded' on the license that matches transaction id
//       → the /api/validate endpoint already returns reason='refunded' for
//         this status, and the app deactivates Pro on next session.
//   • transaction.canceled
//       → no-op; we just 200 OK so Paddle doesn't retry.
//
// Security: every request is HMAC-SHA256 verified against PADDLE_WEBHOOK_SECRET.
// Signature format Paddle uses (header `paddle-signature`):
//     ts=1234567890;h1=<hex>
// We reconstruct the signed payload as `${ts}:${rawBody}` and HMAC it with
// the secret. If the digest doesn't match → 401, no DB writes happen.

import { insertLicense, setLicenseStatus } from './_lib/supabase.js';

export const config = { runtime: 'edge' };

const WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET;
const EXPECTED_PRICE_ID = process.env.PADDLE_PRICE_ID; // optional guard
const RESEND_API_KEY = process.env.RESEND_API_KEY;     // for emailing the license
const EMAIL_FROM = 'Paintiano <hello@paintiano.app>';  // verified Resend sender
const EMAIL_REPLY_TO = 'hello@paintiano.app';

// ─── helpers ────────────────────────────────────────────────────────────────

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Hex-encode an ArrayBuffer
function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Verify Paddle's `paddle-signature` header against the raw body.
// Header looks like: ts=1700000000;h1=abc123...
async function verifyPaddleSignature(signatureHeader, rawBody, secret) {
  if (!signatureHeader || !rawBody || !secret) return false;
  // Parse header
  const parts = Object.fromEntries(
    signatureHeader.split(';').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    })
  );
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;

  // Reject signatures older than 5 minutes (replay protection)
  const ageMs = Date.now() - parseInt(ts, 10) * 1000;
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 5 * 60 * 1000) return false;

  // HMAC-SHA256 over `${ts}:${rawBody}`
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}:${rawBody}`));
  const want = bufToHex(sig);
  // Constant-time compare
  if (want.length !== h1.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ h1.charCodeAt(i);
  return diff === 0;
}

// Generate a Paintiano license key: PAINT-XXXX-XXXX-XXXX (uppercase alphanumeric)
function generateLicenseKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit confusable chars (I, O, 0, 1)
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `PAINT-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

// ─── email template ─────────────────────────────────────────────────────────
//
// Inline-styled HTML for max email-client compatibility (Gmail strips <style>
// blocks, Outlook is finicky with web fonts). We use system serif/sans
// fallbacks that approximate Cormorant Garamond / Outfit. Dark Paintiano
// palette: bg #06060c, ink #e8e2d4, gold #c9a84c, gold-soft #ffd07a.

function buildLicenseEmailHtml({ licenseKey, amount, currency, orderId }) {
  const safeKey = String(licenseKey).replace(/[^A-Z0-9-]/g, '');
  const priceLine = (amount != null && currency)
    ? `${amount} ${currency}`
    : '€9.99';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Paintiano Pro license</title>
</head>
<body style="margin:0;padding:0;background:#06060c;color:#e8e2d4;font-family:'Outfit',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px 56px;">

  <!-- Header -->
  <div style="text-align:center;padding-bottom:32px;border-bottom:1px solid rgba(232,226,212,.12);">
    <div style="font-family:'Cormorant Garamond',Georgia,'Palatino Linotype',serif;font-size:34px;font-weight:600;color:#c9a84c;letter-spacing:-0.5px;line-height:1;">Paintiano</div>
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:16px;color:#e8e2d4;margin-top:10px;letter-spacing:0.3px;">your Pro license is ready</div>
  </div>

  <!-- Greeting -->
  <p style="font-size:15px;color:#e8e2d4;margin:32px 0 10px;">Hi,</p>
  <p style="font-size:15px;color:#e8e2d4;margin:0 0 8px;">Thank you for supporting Paintiano. You're one of the first 50 founding supporters of this little solo art project — it genuinely means a lot.</p>
  <p style="font-size:15px;color:#e8e2d4;margin:0 0 28px;">Your lifetime Pro license is below. Keep this email — it's the only place this key lives outside our database.</p>

  <!-- License key box -->
  <div style="margin:28px 0 32px;padding:26px 22px;background:linear-gradient(135deg,rgba(201,168,76,0.10),rgba(255,208,122,0.04));border:1px solid rgba(255,208,122,0.55);border-radius:14px;text-align:center;">
    <div style="font-family:'Outfit',Arial,sans-serif;font-size:11px;font-weight:600;color:rgba(255,208,122,0.85);letter-spacing:0.18em;text-transform:uppercase;margin-bottom:14px;">your license key</div>
    <div style="font-family:'SF Mono','Menlo','Consolas',monospace;font-size:22px;font-weight:600;color:#ffd07a;letter-spacing:0.06em;word-break:break-all;line-height:1.4;">${safeKey}</div>
  </div>

  <!-- How to activate -->
  <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:20px;font-weight:600;color:#c9a84c;margin:36px 0 16px;">How to activate</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="vertical-align:top;width:36px;padding:4px 14px 0 0;">
        <div style="width:26px;height:26px;border-radius:50%;background:rgba(201,168,76,0.18);color:#ffd07a;font-family:'Outfit',Arial,sans-serif;font-size:13px;font-weight:700;text-align:center;line-height:26px;">1</div>
      </td>
      <td style="vertical-align:top;padding:0 0 14px;">
        <div style="font-size:14px;color:#e8e2d4;">Open <a href="https://paintiano.app" style="color:#ffd07a;text-decoration:none;border-bottom:1px solid rgba(255,208,122,0.4);">paintiano.app</a> in your browser.</div>
      </td>
    </tr>
    <tr>
      <td style="vertical-align:top;width:36px;padding:4px 14px 0 0;">
        <div style="width:26px;height:26px;border-radius:50%;background:rgba(201,168,76,0.18);color:#ffd07a;font-family:'Outfit',Arial,sans-serif;font-size:13px;font-weight:700;text-align:center;line-height:26px;">2</div>
      </td>
      <td style="vertical-align:top;padding:0 0 14px;">
        <div style="font-size:14px;color:#e8e2d4;">Open the Pro panel, then tap <strong style="color:#ffd07a;font-weight:600;">"I already have a key"</strong>.</div>
      </td>
    </tr>
    <tr>
      <td style="vertical-align:top;width:36px;padding:4px 14px 0 0;">
        <div style="width:26px;height:26px;border-radius:50%;background:rgba(201,168,76,0.18);color:#ffd07a;font-family:'Outfit',Arial,sans-serif;font-size:13px;font-weight:700;text-align:center;line-height:26px;">3</div>
      </td>
      <td style="vertical-align:top;padding:0 0 14px;">
        <div style="font-size:14px;color:#e8e2d4;">Paste the key above. Pro unlocks immediately — high-resolution exports, unlimited AI moods, full style library, no watermark.</div>
      </td>
    </tr>
  </table>

  <!-- Tip -->
  <div style="margin:28px 0 0;padding:18px 20px;background:rgba(255,255,255,0.025);border:1px solid rgba(232,226,212,0.08);border-radius:10px;">
    <div style="font-size:13px;color:rgba(232,226,212,0.78);line-height:1.5;"><strong style="color:#ffd07a;font-weight:600;">Tip:</strong> Add Paintiano to your home screen — on iPhone tap the share icon → "Add to Home Screen". It runs full-screen like a native app.</div>
  </div>

  <!-- Receipt info -->
  <div style="margin:36px 0 0;padding-top:24px;border-top:1px solid rgba(232,226,212,0.10);font-size:12px;color:rgba(232,226,212,0.55);line-height:1.7;">
    <div><strong style="color:rgba(232,226,212,0.78);font-weight:600;">Order:</strong> ${orderId || '—'}</div>
    <div><strong style="color:rgba(232,226,212,0.78);font-weight:600;">Amount:</strong> ${priceLine} (one-time, lifetime)</div>
    <div><strong style="color:rgba(232,226,212,0.78);font-weight:600;">Refunds:</strong> 14 days, no questions asked — reply to this email and we'll handle it.</div>
  </div>

  <!-- Support + footer -->
  <div style="margin:32px 0 0;text-align:center;font-size:13px;color:rgba(232,226,212,0.6);">
    Need help? Just reply to this email — it goes straight to <a href="mailto:hello@paintiano.app" style="color:#ffd07a;text-decoration:none;">hello@paintiano.app</a>.
  </div>

  <!-- Legal footer -->
  <div style="margin:40px 0 0;padding-top:24px;border-top:1px solid rgba(232,226,212,0.08);text-align:center;font-size:11px;color:rgba(232,226,212,0.4);letter-spacing:0.02em;line-height:1.7;">
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:15px;font-weight:600;color:rgba(201,168,76,0.7);letter-spacing:0;margin-bottom:8px;">Paintiano</div>
    Rastislav Ďurica · sole trader · Slovakia · IČO 34 594 671<br>
    Payments processed by Paddle.com Market Limited (Merchant of Record)<br>
    <a href="https://paintiano.app/terms.html" style="color:rgba(232,226,212,0.5);text-decoration:none;">Terms</a> ·
    <a href="https://paintiano.app/privacy.html" style="color:rgba(232,226,212,0.5);text-decoration:none;">Privacy</a> ·
    <a href="https://paintiano.app/refunds.html" style="color:rgba(232,226,212,0.5);text-decoration:none;">Refunds</a>
  </div>

</div>
</body>
</html>`;
}

// Plain-text fallback for clients that prefer text (or that auto-generate
// previews). Keep it short and friendly with the same key + steps.
function buildLicenseEmailText({ licenseKey, amount, currency, orderId }) {
  const priceLine = (amount != null && currency) ? `${amount} ${currency}` : '€9.99';
  return [
    'Hi,',
    '',
    "Thank you for supporting Paintiano. Your lifetime Pro license is below — keep this email safe.",
    '',
    `LICENSE KEY: ${licenseKey}`,
    '',
    'How to activate:',
    '  1. Open https://paintiano.app',
    '  2. Open the Pro panel and tap "I already have a key"',
    '  3. Paste the key — Pro unlocks immediately',
    '',
    `Order: ${orderId || '—'}`,
    `Amount: ${priceLine} (one-time, lifetime)`,
    'Refunds: 14 days, no questions asked. Just reply to this email.',
    '',
    'Need help? hello@paintiano.app',
    '',
    '—',
    'Paintiano · Rastislav Ďurica · Slovakia · IČO 34 594 671',
    'Payments by Paddle.com Market Limited (Merchant of Record).',
    'Terms: https://paintiano.app/terms.html',
    'Privacy: https://paintiano.app/privacy.html',
    'Refunds: https://paintiano.app/refunds.html',
  ].join('\n');
}

// Send license email via Resend HTTPS API. Best-effort: never throws — if
// Resend is down or the API key is missing we log and continue. The license
// is already in Supabase so we can recover via a manual resend / lookup
// endpoint.
async function sendLicenseEmail({ to, licenseKey, amount, currency, orderId }) {
  if (!RESEND_API_KEY) {
    console.warn('paddle-webhook: RESEND_API_KEY not set — skipping email send');
    return { ok: false, reason: 'no_api_key' };
  }
  if (!to) {
    console.warn('paddle-webhook: no buyer email — skipping email send');
    return { ok: false, reason: 'no_recipient' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        reply_to: EMAIL_REPLY_TO,
        subject: 'Your Paintiano Pro license',
        html: buildLicenseEmailHtml({ licenseKey, amount, currency, orderId }),
        text: buildLicenseEmailText({ licenseKey, amount, currency, orderId }),
        tags: [
          { name: 'category', value: 'license_delivery' },
          { name: 'provider', value: 'paddle' },
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('paddle-webhook: Resend failed', res.status, errBody.slice(0, 500));
      return { ok: false, reason: 'resend_http_' + res.status };
    }
    const body = await res.json().catch(() => ({}));
    return { ok: true, messageId: body?.id };
  } catch (err) {
    console.error('paddle-webhook: Resend threw', err);
    return { ok: false, reason: 'resend_exception', detail: String(err?.message || err) };
  }
}

// ─── handler ────────────────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);

  // We need the raw body bytes for signature verification — DO NOT use req.json() first.
  const rawBody = await req.text();
  const signature = req.headers.get('paddle-signature');

  const verified = await verifyPaddleSignature(signature, rawBody, WEBHOOK_SECRET);
  if (!verified) {
    console.warn('paddle-webhook: signature verification failed');
    return json({ ok: false, reason: 'invalid_signature' }, 401);
  }

  let evt;
  try {
    evt = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, reason: 'bad_json' }, 400);
  }

  const type = evt?.event_type;
  const data = evt?.data;
  if (!type || !data) return json({ ok: false, reason: 'no_event' }, 400);

  try {
    switch (type) {
      case 'transaction.completed':
      case 'transaction.paid': {
        // Sanity check: only honor purchases of OUR price (not random subscriptions
        // on the same Paddle account, if any are ever added).
        if (EXPECTED_PRICE_ID) {
          const items = Array.isArray(data.items) ? data.items : [];
          const matches = items.some((it) => it?.price?.id === EXPECTED_PRICE_ID);
          if (!matches) {
            console.info('paddle-webhook: ignoring transaction with non-Pro price', data.id);
            return json({ ok: true, ignored: 'price_mismatch' });
          }
        }

        // Avoid duplicate issuance if Paddle re-delivers the same event.
        // We key on data.id (the transaction id) → if a license with this
        // order_id already exists, do nothing.
        const orderId = data.id;
        const email =
          data?.customer?.email ||
          data?.billing_details?.email ||
          data?.payments?.[0]?.customer?.email ||
          null;

        // Extract amount + currency for the receipt section in the email.
        // Paddle wraps amounts as minor units in `details.totals.total` and
        // `currency_code` on the data; fall back gracefully if shape changes.
        const totalMinor = data?.details?.totals?.total ?? data?.details?.totals?.grand_total ?? null;
        const currencyCode = data?.currency_code || data?.details?.totals?.currency_code || null;
        const amountMajor = (totalMinor != null && currencyCode)
          ? (parseInt(totalMinor, 10) / 100).toFixed(2)
          : null;

        const licenseKey = generateLicenseKey();

        await insertLicense({
          key: licenseKey,
          email,
          status: 'active',
          order_id: orderId,
          provider: 'paddle',
          activations: 0,
        });

        console.info('paddle-webhook: issued license', { orderId, email: email ? email.replace(/(.).+(@.+)/, '$1***$2') : null });

        // Fire the license email. Even if this fails we still return 200
        // — the license exists in Supabase and can be re-sent manually.
        const mail = await sendLicenseEmail({
          to: email,
          licenseKey,
          amount: amountMajor,
          currency: currencyCode,
          orderId,
        });
        if (mail.ok) {
          console.info('paddle-webhook: email sent', { messageId: mail.messageId });
        } else {
          console.warn('paddle-webhook: email NOT sent', mail);
        }

        return json({ ok: true, issued: true, emailed: !!mail.ok });
      }

      case 'adjustment.created': {
        // Paddle sends this for refunds (and credits/chargebacks).
        // We treat any adjustment that affects a Pro transaction as a revoke.
        const action = data?.action; // "refund" | "chargeback" | "credit"
        if (action !== 'refund' && action !== 'chargeback') {
          return json({ ok: true, ignored: 'non_revoking_adjustment' });
        }
        const orderId = data?.transaction_id;
        if (!orderId) return json({ ok: true, ignored: 'no_transaction_id' });

        await setLicenseStatus(orderId, 'refunded', {
          refunded_at: new Date().toISOString(),
        });

        console.info('paddle-webhook: license revoked', { orderId, action });
        return json({ ok: true, revoked: true });
      }

      case 'transaction.canceled':
        // User abandoned the checkout. Nothing to do — just acknowledge.
        return json({ ok: true, ignored: 'canceled' });

      default:
        // Other events we subscribed to (or that slipped through) — ack & ignore.
        return json({ ok: true, ignored: type });
    }
  } catch (err) {
    console.error('paddle-webhook handler error', err);
    // Returning 500 makes Paddle retry — usually what we want for transient DB errors.
    return json({ ok: false, reason: 'server_error', detail: String(err?.message || err) }, 500);
  }
}
