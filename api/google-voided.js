// api/google-voided.js
// Purchases Google Play took back (a refund, a chargeback, a revoke) → the licence is switched off,
// the same as a refunded Paddle order.
//
// Called once a day by the Vercel cron (vercel.json). It may also be given to Google as the address of
// its real-time notices (Play Console → Monetisation setup → a Pub/Sub push subscription), so a refund
// is seen at once. Whoever calls it, nothing in the call is believed: the list of taken-back purchases
// is asked from Google itself — a forged call can do nothing but cause that look-up.

import { sweepGoogleVoided, googleConfigured } from './_lib/google.js';

export const config = { runtime: 'edge' };

function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
let last = 0;

export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);
  if (!googleConfigured()) return json({ ok: true, skipped: 'not_configured' });
  const now = Date.now();
  if (now - last < 20 * 1000) return json({ ok: true, skipped: 'just_done' });
  last = now;
  try {
    const r = await sweepGoogleVoided(req.method === 'GET' ? 7 : 3);
    return json({ ok: true, seen: r.seen, changed: Object.keys(r.results).length });
  } catch (e) {
    console.error('google-voided: failed', String(e));
    return json({ ok: false, reason: 'server_error', detail: (e && typeof e.detail === 'string') ? e.detail : undefined }, 503);   // Google retries
  }
}
