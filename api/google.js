// api/google.js
// The Android app reports its Google Play purchases (after a purchase, on "Restore purchases", on a new device).
// Each purchase is checked at Google; the answer is the licence key the app should use.
//
// Request:  POST /api/google   { "purchases": [{ "productId": "app.paintiano.pro", "token": "…" }, …], "key": "PAINT-…" | "" }
// Response: { ok:true, key: "PAINT-…" | null, granted:[…], skipped:[…] }
//           ok:false, reason: 'not_configured' | 'bad_request' | 'rate_limited' | 'server_error'

import { applyGooglePurchases, googleConfigured } from './_lib/google.js';

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
  const seen = new Set(); const list = [];
  for (const x of (Array.isArray(body?.purchases) ? body.purchases : [])) {
    const productId = String((x && x.productId) || '').trim(), token = String((x && x.token) || '').trim();
    if (!/^app\.paintiano\.[a-z0-9]{2,20}$/.test(productId) || !/^[A-Za-z0-9._\-]{20,2000}$/.test(token) || seen.has(token)) continue;
    seen.add(token); list.push({ productId, token });
    if (list.length >= 30) break;
  }
  const key = String(body?.key || '').trim().slice(0, 200);
  if (!list.length) return json({ ok: false, reason: 'bad_request' }, 400);
  if (!googleConfigured()) { console.warn('google: the service account is not set (GOOGLE_PLAY_SA_JSON)'); return json({ ok: false, reason: 'not_configured' }, 503); }
  try {
    const r = await applyGooglePurchases(list, key);
    return json({ ok: true, key: r.key, granted: r.granted, skipped: r.skipped });
  } catch (e) {
    console.error('google: failed', String(e));
    return json({ ok: false, reason: 'server_error', detail: (e && typeof e.detail === 'string') ? e.detail : undefined }, 503);
  }
}
