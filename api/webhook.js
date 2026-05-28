// api/webhook.js
// Lemon Squeezy webhook receiver.
// Configure in Lemon Squeezy dashboard → Settings → Webhooks:
//   URL:    https://paintiano.app/api/webhook
//   Events: order_created, order_refunded
//   Signing secret: copy to Vercel env var LEMON_WEBHOOK_SECRET

import { upsertLicense, setLicenseStatus } from './_lib/supabase.js';

export const config = { runtime: 'edge' };

const WEBHOOK_SECRET = process.env.LEMON_WEBHOOK_SECRET;

// HMAC-SHA256 verification using Web Crypto (Edge runtime supported)
async function verifySignature(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET || !signatureHeader) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  // Constant-time compare
  if (hex.length !== signatureHeader.length) return false;
  let mismatch = 0;
  for (let i = 0; i < hex.length; i++) {
    mismatch |= hex.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return mismatch === 0;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-signature') || '';

  const ok = await verifySignature(rawBody, signature);
  if (!ok) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return new Response('Invalid JSON', { status: 400 });
  }

  const eventName = payload?.meta?.event_name;
  const data = payload?.data;
  const attr = data?.attributes || {};

  try {
    if (eventName === 'order_created') {
      // License key is on the related license_keys resource for Lemon Squeezy products
      // configured with "License key" enabled. Lemon Squeezy includes first_order_item.license_key
      // in the relationship payload OR exposes it via `attributes.first_order_item`.
      // Safest: read from payload.meta.custom_data if you've configured it, OR fetch from
      // first_order_item.product_options. For most setups, the license key is delivered
      // via a separate license_key_created event — handle both for safety.

      const orderId = String(data.id);
      const email = attr.user_email;
      const productId = String(attr.first_order_item?.product_id || '');
      const variantId = String(attr.first_order_item?.variant_id || '');
      const customerId = String(attr.customer_id || '');
      const amountCents = attr.total || 0;
      const currency = attr.currency || 'EUR';

      // License key is typically in attr.first_order_item.product_options or via
      // a sibling license_key_created event. Store what we can now; the
      // license_key_created handler below will fill in the key.
      const licenseKey = attr.first_order_item?.license_key || null;

      if (licenseKey) {
        await upsertLicense({
          key: licenseKey,
          email,
          order_id: orderId,
          product_id: productId,
          variant_id: variantId,
          customer_id: customerId,
          amount_cents: amountCents,
          currency,
          status: 'active',
          raw_event: payload,
        });
      }
      // If no key yet, license_key_created event will arrive shortly and we'll handle it.
    } else if (eventName === 'license_key_created') {
      // Authoritative event for license key creation.
      const licenseKey = attr.key;
      const orderId = String(attr.order_id);
      const customerId = String(attr.customer_id || '');
      const email = attr.user_email || '';

      await upsertLicense({
        key: licenseKey,
        email,
        order_id: orderId,
        customer_id: customerId,
        status: 'active',
        raw_event: payload,
      });
    } else if (eventName === 'order_refunded') {
      const orderId = String(data.id);
      await setLicenseStatus(orderId, 'refunded', { refunded_at: new Date().toISOString() });
    } else if (eventName === 'license_key_updated') {
      // Lemon Squeezy can disable a key from their UI.
      const licenseKey = attr.key;
      const status = attr.status; // 'active' | 'inactive' | 'expired' | 'disabled'
      const mapped = status === 'active' ? 'active' : 'disabled';
      await upsertLicense({
        key: licenseKey,
        status: mapped,
        order_id: String(attr.order_id),
        email: attr.user_email || '',
        raw_event: payload,
      });
    }
    // Other events ignored.

    return new Response(JSON.stringify({ ok: true, event: eventName }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // Log to Vercel function logs; respond 500 so Lemon Squeezy retries.
    console.error('webhook error', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
