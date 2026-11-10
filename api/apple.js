// api/apple.js
// The iOS app reports its Apple purchases (after a purchase, on "Restore purchases", on a new device).
// Each transaction is checked at Apple; the answer is the licence key the app should use.
//
// Request:  POST /api/apple   { "transactions": ["2000000123…", …], "key": "PAINT-…" | "" }
// Response: { ok:true, key: "PAINT-…" | null, granted:[…], skipped:[…] }
//           ok:false, reason: 'not_configured' | 'bad_request' | 'rate_limited' | 'server_error'

import { applyAppleTransactions, appleConfigured } from './_lib/apple.js';

export const config = { runtime: 'edge' };

const HITS = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < 60 * 1000);
  arr.push(now); HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear();
  return arr.length > 20;
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  if (rateLimited(ip)) return json({ ok: false, reason: 'rate_limited' }, 429);
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }
  const ids = Array.isArray(body?.transactions) ? [...new Set(body.transactions.map((x) => String(x || '').trim()).filter((x) => /^[0-9]{6,40}$/.test(x)))].slice(0, 30) : [];
  const key = String(body?.key || '').trim().slice(0, 200);
  if (!ids.length) return json({ ok: false, reason: 'bad_request' }, 400);
  if (!appleConfigured()) { console.warn('apple: the In-App Purchase key is not set (APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_KEY_P8)'); return json({ ok: false, reason: 'not_configured' }, 503); }
  try {
    const r = await applyAppleTransactions(ids, key);
    return json({ ok: true, key: r.key, granted: r.granted, skipped: r.skipped });
  } catch (e) {
    console.error('apple: failed', String(e));
    return json({ ok: false, reason: 'server_error' }, 503);
  }
}
