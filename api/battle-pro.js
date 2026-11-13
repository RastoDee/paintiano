// api/battle-pro.js
// Pro travels with the Paintiano Battle account.
//
// On an iPhone every web app on the home screen keeps its own storage: Paintiano opened from the Battle app
// is another Paintiano, without the licence key of the one on the home screen. Both know the Battle account
// (the link Battle gives a Paintiano when it signs in: L.<account>.<n>.<signature>), so the account carries Pro:
//
//   POST /api/battle-pro { link, key }  — a Paintiano with Pro, linked to Battle: the licence notes the account
//        → { ok:true, noted:true }
//   POST /api/battle-pro { link }       — a Paintiano without a key, linked to Battle: the account's licence key
//        → { ok:true, key:"PAINT-…" } | { ok:true, key:null }
//   errors: { ok:false, reason:'bad_request' | 'link' (Battle does not know the link) | 'key' (not an active licence)
//             | 'not_ready' (supabase/battle_pro.sql not run yet) | 'rate_limited' | 'server_error' }
//
// The link is checked at Battle itself (the same call Paintiano makes for its count): a made-up link gets nothing.

import { getLicenseByKey, patchLicense } from './_lib/supabase.js';

export const config = { runtime: 'edge' };

const BATTLE = 'https://battle.paintiano.app';
const LINK_RE = /^L\.([0-9a-f-]{36})\.\d+\.[A-Za-z0-9_-]+$/;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const HITS = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < 60 * 1000);
  arr.push(now); HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear();
  return arr.length > 12;
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
// Battle answers the link's owner (200) or does not know it (401).
async function linkOk(link) {
  const r = await fetch(BATTLE + '/api/submit', { headers: { Authorization: 'Bearer ' + link, Origin: 'https://paintiano.app' } });
  if (r.status === 401 || r.status === 403) return false;
  if (!r.ok) { const e = new Error('battle ' + r.status); e.detail = 'battle_' + r.status; throw e; }
  return true;
}
const paid = (row) => row && row.status === 'active' && !String(row.key).startsWith('UPGRADE-') && (row.tier === 'pro' || row.tier === 'pro_ai');

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  if (rateLimited(ip)) return json({ ok: false, reason: 'rate_limited' }, 429);
  let body; try { body = await req.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }
  const link = String(body?.link || '').trim(), key = String(body?.key || '').trim().slice(0, 200);
  const m = LINK_RE.exec(link);
  if (!m) return json({ ok: false, reason: 'bad_request' }, 400);
  const uid = m[1];
  try {
    if (key) {   // note the account on this licence
      const row = await getLicenseByKey(key);
      if (!paid(row)) return json({ ok: false, reason: 'key' });
      if (!(await linkOk(link))) return json({ ok: false, reason: 'link' });
      try { await patchLicense(key, { battle_uid: uid }); }
      catch (e) { if (/battle_uid/.test(String(e))) { console.warn('battle-pro: run supabase/battle_pro.sql'); return json({ ok: false, reason: 'not_ready' }, 503); } throw e; }
      return json({ ok: true, noted: true });
    }
    if (!(await linkOk(link))) return json({ ok: false, reason: 'link' });
    const r = await fetch(`${SB_URL}/rest/v1/licenses?battle_uid=eq.${encodeURIComponent(uid)}&status=eq.active&select=key,status,tier,created_at&order=created_at.desc&limit=10`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    if (!r.ok) { const t = await r.text(); if (/battle_uid/.test(t)) return json({ ok: false, reason: 'not_ready' }, 503); throw new Error('select ' + r.status); }
    const rows = (await r.json()).filter(paid);
    const best = rows.find((x) => x.tier === 'pro_ai') || rows[0] || null;   // Pro AI first, then the newest Pro
    return json({ ok: true, key: best ? best.key : null });
  } catch (e) {
    console.error('battle-pro: failed', String(e));
    return json({ ok: false, reason: 'server_error', detail: (e && typeof e.detail === 'string') ? e.detail : undefined }, 503);
  }
}
