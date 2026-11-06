// api/compose.js
// Vercel serverless function: the app's only way to Claude. The API key stays
// on the server (Vercel env ANTHROPIC_API_KEY).
//
// FAIR USE (Nov 2026) — AI is counted per day, on the server:
//  • Pro AI key (header X-Paintiano-Key)  → 30 AI pieces & melodies a day
//    (+ 100 small calls: atmosphere, title translation, morph picks).
//  • Pro AI bought before the limit (licenses.ai_unlimited = true) → no daily
//    limit in practice (500 / 1000 — only a guard against a leaked key).
//  • Everyone else (Free, Pro, no key) → counted per network (an HMAC hash of
//    the IP, never the IP itself; rows are deleted after 3 days by the cron):
//    8 pieces & melodies + 30 small calls a day. The app's own trial
//    (1 try per AI mode) is far below this — the cap only stops abuse.
//  • "Piece" = a call that writes notes (max_tokens > 400). "Small" = the rest.
//    A tiny reachability probe (≤ 16 tokens, ≤ 16 chars) is not counted.
// Counting lives in Supabase (table ai_usage + function ai_hit, see
// supabase/ai_usage.sql). If that is not reachable, a per-instance memory
// counter with the same caps takes over, so AI never silently breaks.
//
// OTHER GUARDS
//  • Origin/Referer must be one of our domains (requests without both are refused).
//  • Per-IP burst limit: RATE_MAX calls per RATE_WINDOW_MS (per warm instance).
//  • Model from an allow-list, max_tokens capped, input size capped.

import crypto from 'node:crypto';

const API_MODEL = 'claude-sonnet-4-6';
// Models the app may ask for (anything else → API_MODEL).
// Haiku = cheap helper calls (morph pool), Sonnet = composition.
const ALLOWED_MODELS = new Set(['claude-sonnet-4-6','claude-sonnet-4-6-20260218','claude-haiku-4-5','claude-haiku-4-5-20251001']);
const MAX_TOKENS = 2000;                  // output cap
const BIG_FROM = 400;                     // max_tokens above this = a piece / melody
const MAX_TEXT_CHARS = 24000;             // all text blocks together
const MAX_IMAGES = 2;
const MAX_IMAGE_B64 = 3500000;            // all image data together (base64 chars)
const RATE_MAX = 30;                      // burst: max requests…
const RATE_WINDOW_MS = 60 * 1000;         // …per 60 s per IP

// Daily caps: [pieces & melodies, small calls]
const CAP = {
  pro_ai:    [30, 100],
  unlimited: [500, 1000],
  free:      [8, 30],
};

// Allowed sources: our domains, Vercel previews of this project, local dev. Exact origins only —
// a prefix test would let paintiano.app.evil.com or localhost.evil.com drive the key.
const ALLOWED = new Set([
  'https://paintiano.app',
  'https://www.paintiano.app',
  'https://paintiano.vercel.app'
]);
const ALLOWED_RE = [
  /^https:\/\/paintiano-[a-z0-9-]+\.vercel\.app$/,   // paintiano-git-dev-…, paintiano-<hash>-… previews
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/
];
function originAllowed(o) { return !!o && (ALLOWED.has(o) || ALLOWED_RE.some(re => re.test(o))); }
function originOf(url) { try { return new URL(url).origin; } catch (_) { return ''; } }

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── burst limit (memory, per warm instance) ────────────────────────────────
const _hits = new Map(); // ip -> [timestamps]
function rateLimited(ip) {
  const now = Date.now();
  const arr = (_hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  arr.push(now);
  _hits.set(ip, arr);
  if (_hits.size > 5000) {
    for (const [k, v] of _hits) { if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) _hits.delete(k); }
  }
  return arr.length > RATE_MAX;
}

function sourceAllowed(req) {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  if (origin) return originAllowed(origin);
  if (referer) return originAllowed(originOf(referer));
  return false; // browsers always send Origin on POST — no Origin = not our app
}

function clientIp(req) {
  const h = req.headers;
  return (h['x-vercel-forwarded-for'] || h['x-real-ip'] || h['x-forwarded-for'] || '')
    .toString().split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

// The IP is never stored: only a keyed hash (the secret never leaves the server).
function ipBucket(ip) {
  const secret = SB_KEY || process.env.ANTHROPIC_API_KEY || 'pf';
  return 'n:' + crypto.createHmac('sha256', secret).update('pf-ip|' + ip).digest('hex').slice(0, 32);
}

// ── licence lookup (cached 10 min per warm instance) ───────────────────────
const _lic = new Map(); // key -> { at, row }
async function licenceOf(key) {
  if (!key || key.length < 6 || key.length > 200 || !SB_URL || !SB_KEY) return null;
  const c = _lic.get(key);
  if (c && Date.now() - c.at < 10 * 60 * 1000) return c.row;
  const hdr = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
  const base = `${SB_URL}/rest/v1/licenses?key=eq.${encodeURIComponent(key)}&limit=1&select=`;
  let res = await fetch(base + 'key,status,tier,ai_unlimited', { headers: hdr });
  if (!res.ok) res = await fetch(base + 'key,status,tier', { headers: hdr }); // column not added yet
  if (!res.ok) throw new Error('licence lookup ' + res.status);
  const row = (await res.json())[0] || null;
  _lic.set(key, { at: Date.now(), row });
  if (_lic.size > 2000) _lic.clear();
  return row;
}

// ── daily counter ───────────────────────────────────────────────────────────
const _mem = new Map(); // bucket|day -> n   (fallback only)
function memHit(id, cap) {
  const k = id + '|' + new Date().toISOString().slice(0, 10);
  const n = _mem.get(k) || 0;
  if (n >= cap) return -1;
  _mem.set(k, n + 1);
  if (_mem.size > 20000) _mem.clear();
  return n + 1;
}
// Returns the new count, or -1 when the cap is already reached.
async function hit(id, cap) {
  if (SB_URL && SB_KEY) {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/rpc/ai_hit`, {
        method: 'POST',
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_bucket: id, p_cap: cap }),
      });
      if (res.ok) { const v = await res.json(); if (typeof v === 'number') return v; }
      else console.warn('compose: ai_hit', res.status, (await res.text()).slice(0, 160));
    } catch (e) { console.warn('compose: ai_hit failed', String(e)); }
  }
  return memHit(id, cap);
}

// ── request shape ───────────────────────────────────────────────────────────
function measure(messages) {
  let text = 0, images = 0, b64 = 0;
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return null;
    const c = m.content;
    if (typeof c === 'string') { text += c.length; continue; }
    if (!Array.isArray(c)) return null;
    for (const b of c) {
      if (b && b.type === 'text' && typeof b.text === 'string') text += b.text.length;
      else if (b && b.type === 'image' && b.source && typeof b.source.data === 'string') { images++; b64 += b.source.data.length; }
      else return null;
    }
  }
  return { text, images, b64 };
}

// Node function: a 2,000-token composition takes 10–25 s; without this Vercel's default (10 s) cuts long pieces.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  // CORS: only an allowed origin may read the answer (never '*').
  const reqOrigin = req.headers.origin || '';
  if (originAllowed(reqOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Paintiano-Key');
  }

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method === 'GET') {
    let usage = 'no-supabase';
    if (SB_URL && SB_KEY) {
      try {
        const r = await fetch(`${SB_URL}/rest/v1/ai_usage?select=day&limit=1`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
        usage = r.ok ? 'ok' : 'missing (run supabase/ai_usage.sql)';
      } catch (_) { usage = 'unreachable'; }
    }
    res.status(200).json({ ok: true, message: 'compose endpoint alive — use POST', hasKey: !!process.env.ANTHROPIC_API_KEY, model: API_MODEL, caps: CAP, usage });
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed — use POST' }); return; }

  if (!sourceAllowed(req)) { res.status(403).json({ error: 'Forbidden origin' }); return; }

  const ip = clientIp(req);
  if (rateLimited(ip)) { res.status(429).json({ error: 'Too many requests — slow down' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in Vercel env vars' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { res.status(400).json({ error: 'Invalid JSON body' }); return; } }
  if (!body || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 8) { res.status(400).json({ error: 'Missing messages in request body' }); return; }

  const size = measure(body.messages);
  if (!size || size.text > MAX_TEXT_CHARS || size.images > MAX_IMAGES || size.b64 > MAX_IMAGE_B64) {
    res.status(413).json({ error: 'Request too large or malformed' }); return;
  }

  const maxTokens = Math.max(1, Math.min(parseInt(body.max_tokens, 10) || MAX_TOKENS, MAX_TOKENS));
  const model = (body.model && ALLOWED_MODELS.has(body.model)) ? body.model : API_MODEL;
  const probe = maxTokens <= 16 && size.text <= 16 && !size.images;

  if (!probe) {
    // Who is asking: a Pro AI key, or anyone else (per network).
    let plan = 'free', bucket = null;
    const key = String(req.headers['x-paintiano-key'] || '').trim();
    if (key) {
      try {
        const row = await licenceOf(key);
        if (row && row.status === 'active' && row.tier === 'pro_ai') {
          plan = row.ai_unlimited ? 'unlimited' : 'pro_ai';
          bucket = 'k:' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
        }
      } catch (e) { console.warn('compose: licence lookup failed', String(e)); }
    }
    if (!bucket) bucket = ipBucket(ip);
    const big = maxTokens > BIG_FROM;
    const cap = CAP[plan][big ? 0 : 1];
    const n = await hit(bucket + (big ? ':p' : ':s'), cap);
    if (n < 0) {
      res.status(429).json({
        type: 'error',
        error: { type: 'pf_daily_limit', message: 'Daily AI limit reached — back tomorrow.' },
        pf: { limit: 'daily', plan, kind: big ? 'piece' : 'small', cap },
      });
      return;
    }
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: body.messages })
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (err) {
    res.status(500).json({ error: 'Upstream request failed', detail: String(err) });
  }
}
