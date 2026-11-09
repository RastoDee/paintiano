// api/export.js
// Counts watermark-free exports per licence key (a number only — never the work).
// The refund policy is fair use: a full refund when the key made few exports and
// few AI pieces; this is where the app reports an export.
//
// Request:  POST /api/export   { "key": "PAINT-XXXX-XXXX-XXXX", "n": 1 }
// Response: { "ok": true }  (also when the counter is not installed yet — the app
//           then simply stops retrying; see supabase/ai_usage.sql part 5)

export const config = { runtime: 'edge' };

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const HITS = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < 60 * 1000);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear();
  return arr.length > 30;
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
  const key = String(body?.key || '').trim();
  const n = Math.max(1, Math.min(50, parseInt(body?.n, 10) || 1));
  if (!key || key.length < 6 || key.length > 200) return json({ ok: false, reason: 'bad_request' }, 400);
  if (!SB_URL || !SB_KEY) return json({ ok: true, counted: false });
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/lic_usage_hit`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: key, p_exports: n, p_ai: 0 }),
    });
    if (!res.ok) { console.warn('export: lic_usage_hit', res.status, (await res.text()).slice(0, 160)); return json({ ok: true, counted: false }); }
    return json({ ok: true, counted: true });
  } catch (e) {
    console.warn('export: failed', String(e));
    return json({ ok: false, reason: 'server_error' }, 503);
  }
}
