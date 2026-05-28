// api/validate.js
// Public endpoint called by the Paintiano app when a user enters or re-validates a license key.
//
// Request:  POST /api/validate   { "key": "PAINT-XXXX-XXXX-XXXX" }
// Response: { "valid": true,  "status": "active",  "email": "u@example.com" }
//        or { "valid": false, "reason": "not_found" | "refunded" | "disabled" | "rate_limited" }

import { getLicenseByKey, incrementActivations } from './_lib/supabase.js';

export const config = { runtime: 'edge' };

// Naive in-memory rate limit per IP. Edge functions are stateless across regions,
// but this still helps against a single attacker hitting one region repeatedly.
// For production-grade rate limiting use Upstash Redis or Vercel KV.
const HITS = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 20;

function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  return arr.length > MAX_PER_WINDOW;
}

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}

function json(body, status = 200) {
  return cors(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
  if (req.method !== 'POST') return json({ valid: false, reason: 'method' }, 405);

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  if (rateLimited(ip)) {
    return json({ valid: false, reason: 'rate_limited' }, 429);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ valid: false, reason: 'bad_request' }, 400);
  }

  const key = (body?.key || '').trim();
  if (!key || key.length < 6 || key.length > 200) {
    return json({ valid: false, reason: 'bad_request' }, 400);
  }

  try {
    const row = await getLicenseByKey(key);
    if (!row) return json({ valid: false, reason: 'not_found' });
    if (row.status === 'refunded') return json({ valid: false, reason: 'refunded' });
    if (row.status === 'disabled') return json({ valid: false, reason: 'disabled' });

    // Fire-and-forget activation counter; don't block on it.
    incrementActivations(key).catch(() => {});

    // Mask the email for privacy (return only domain part)
    const masked = row.email ? maskEmail(row.email) : null;

    return json({ valid: true, status: 'active', email: masked });
  } catch (err) {
    console.error('validate error', err);
    return json({ valid: false, reason: 'server_error' }, 500);
  }
}

function maskEmail(email) {
  const at = email.indexOf('@');
  if (at < 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}
