// api/battle-login.js
// The Battle switch in Paintiano's hidden tools, without a trip to Battle.
//
// Battle's admin signs in once, right in the hidden tools (Battle nickname + password). Battle's own sign-in does not answer
// other origins, so this asks it server to server, then asks Battle for the Paintiano link of that account (the same
// long-lived link Battle gives a Paintiano when it signs in under the Battle tab) and checks that the account is Battle's
// admin. Only an admin gets the link here — every other player links Paintiano under the Battle tab, as before.
//
//   POST /api/battle-login { nickname, password }
//     → { ok:true, link, mode:'off'|'test'|'on' }
//     → { ok:false, reason:'wrong' | 'wait' | 'admin' | 'bad_request' | 'rate_limited' | 'server_error' }
//
// Nothing is kept here: the password goes to Battle and is forgotten; the link lives on the device, like the one from the tab.

export const config = { runtime: 'edge' };

const BATTLE = 'https://battle.paintiano.app';
const ORIGIN = 'https://paintiano.app';

const HITS = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < 60 * 1000);
  arr.push(now); HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear();
  return arr.length > 8;
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  if (rateLimited(ip)) return json({ ok: false, reason: 'rate_limited' }, 429);
  let body; try { body = await req.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }
  const nickname = String(body?.nickname || '').trim().replace(/^@/, '').slice(0, 40);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!nickname || !password || password.length > 72) return json({ ok: false, reason: 'bad_request' }, 400);
  try {
    // 1. Battle's own sign-in by nickname and password (never creates an account here)
    const r1 = await fetch(BATTLE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'User-Agent': 'Paintiano hidden tools' }, body: JSON.stringify({ nickname, password }) });
    if (r1.status === 429) return json({ ok: false, reason: 'wait' });
    if (r1.status === 400 || r1.status === 401 || r1.status === 404) return json({ ok: false, reason: 'wrong' });
    if (!r1.ok) return json({ ok: false, reason: 'server_error', detail: 'login_' + r1.status }, 502);
    const d1 = await r1.json().catch(() => null);
    const token = d1 && typeof d1.token === 'string' ? d1.token : '';
    if (!token) return json({ ok: false, reason: 'wrong' });
    // 2. admin? (Battle answers the mode only to its admin)
    const r2 = await fetch(BATTLE + '/api/round', { headers: { Authorization: 'Bearer ' + token, Origin: ORIGIN } });
    const d2 = r2.ok ? await r2.json().catch(() => null) : null;
    if (!d2 || !d2.admin) return json({ ok: false, reason: 'admin' });
    // 3. the Paintiano link of that account
    const r3 = await fetch(BATTLE + '/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, Origin: ORIGIN }, body: JSON.stringify({ link: true }) });
    const d3 = r3.ok ? await r3.json().catch(() => null) : null;
    if (!d3 || typeof d3.link !== 'string') return json({ ok: false, reason: 'server_error', detail: 'link_' + r3.status }, 502);
    const mode = d2.mode === 'on' || d2.mode === 'test' || d2.mode === 'off' ? d2.mode : null;
    return json({ ok: true, link: d3.link, mode });
  } catch (e) {
    return json({ ok: false, reason: 'server_error' }, 502);
  }
}
