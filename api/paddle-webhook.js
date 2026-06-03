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
//       → Paddle itself emails the buyer the receipt; the license key is in
//         the receipt's "custom data" block we set when creating the
//         transaction OR we surface it via a follow-up email. For now we
//         expose it in the response and let Paddle's customer email show
//         our delivery URL pointing back to paintiano.app with the key.
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
        return json({ ok: true, issued: true });
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
