// api/refund.js
// The in-app refund. The app asks what a refund of this key would be (preview), and —
// after the buyer confirms — asks for it. A clear case is refunded through Paddle by
// itself; everything else is answered "not by itself" and the app points to e-mail,
// so a person decides it. Rules: api/_lib/refund.js.
//
// Request:  POST /api/refund   { "key": "PAINT-…", "confirm": true? }
// Response: { ok:true, eligible, reason, kind, amount_cents, currency, bought, until,
//             exports, ai, max_exports, max_ai, done? }
//           done:true  → the refund was asked for in Paddle (the licence is switched off
//                        by Paddle's webhook, as for any refund)
//           reason 'manual' → could not be done by itself (Paddle refused / not set up)

import { refundCase, REFUND_MAX_EXPORTS, REFUND_MAX_AI } from './_lib/refund.js';

export const config = { runtime: 'edge' };

const PADDLE_API_KEY = process.env.PADDLE_API_KEY;
const PADDLE_API_BASE = process.env.PADDLE_API_BASE || 'https://api.paddle.com';

const HITS = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < 60 * 1000);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear();
  return arr.length > 10;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
const tail = (k) => String(k || '').slice(-4);

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  if (rateLimited(ip)) return json({ ok: false, reason: 'rate_limited' }, 429);
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }
  const key = String(body?.key || '').trim();
  if (!key || key.length < 6 || key.length > 200) return json({ ok: false, reason: 'bad_request' }, 400);

  let c;
  try { c = await refundCase(key); }
  catch (e) { console.error('refund: lookup failed', String(e)); return json({ ok: false, reason: 'server_error' }, 503); }
  if (!c) return json({ ok: false, reason: 'not_found' }, 404);

  const view = {
    ok: true, eligible: c.eligible, reason: c.reason, kind: c.kind,
    amount_cents: c.amount_cents, currency: c.currency, bought: c.bought, until: c.until,
    exports: c.exports, ai: c.ai, max_exports: REFUND_MAX_EXPORTS, max_ai: REFUND_MAX_AI,
  };
  if (body?.confirm !== true || !c.eligible) return json(view);

  if (!PADDLE_API_KEY) {
    console.warn('refund: PADDLE_API_KEY not set — sent to e-mail', { tail: tail(key) });
    return json({ ...view, eligible: false, reason: 'manual' });
  }
  try {
    const res = await fetch(`${PADDLE_API_BASE}/adjustments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${PADDLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refund', type: 'full', transaction_id: c.order_id, reason: 'Requested in the app (within 14 days, fair use)' }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn('refund: Paddle refused — sent to e-mail', { tail: tail(key), status: res.status, body: text.slice(0, 300) });
      return json({ ...view, eligible: false, reason: 'manual' });
    }
    let st = null; try { st = JSON.parse(text)?.data?.status || null; } catch (_) {}
    console.info('refund: asked for in Paddle', { tail: tail(key), kind: c.kind, order: c.order_id, status: st });
    return json({ ...view, done: true, paddle_status: st });
  } catch (e) {
    console.warn('refund: Paddle call failed', { tail: tail(key), err: String(e) });
    return json({ ok: false, reason: 'server_error' }, 503);
  }
}
