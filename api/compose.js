// api/compose.js
// Vercel serverless funkcia — bezpečne posiela požiadavku Claudovi + ochrana kreditu.
// Kľúč drží na serveri (Vercel env var ANTHROPIC_API_KEY).
//
// NASADENIE:
//  1) Ulož ako:  api/compose.js   (prepíš existujúci) → commit + push
//  2) Vercel → Settings → Environment Variables: ANTHROPIC_API_KEY = sk-ant-...  (Production!)
//  3) Test: otvor https://paintiano.vercel.app/api/compose  → {"ok":true,"hasKey":true,...}
//
// OCHRANY:
//  • Origin check — prijíma len požiadavky z tvojich domén (blokuje cudzie weby).
//  • Rate limit  — max RATE_MAX volaní za RATE_WINDOW_MS na IP (best-effort, per warm instance).
//  • max_tokens  — zastropované na MAX_TOKENS (lacnejší výstup, krátke skladby to bohato pokryjú).

const API_MODEL = 'claude-sonnet-4-6';
// Povolené modely, ktoré smie appka vyžiadať (inak sa použije API_MODEL).
// Haiku = lacný (napr. výber morph poolu), Sonnet = kvalitný (kompozícia).
const ALLOWED_MODELS = new Set(['claude-sonnet-4-6','claude-sonnet-4-6-20260218','claude-haiku-4-5','claude-haiku-4-5-20251001']);   // vždy aktuálny model (ignoruje sa to, čo pošle appka)
const MAX_TOKENS = 1500;                  // strop na výstup (appka pýta 2000 → orežeme)
const RATE_MAX = 30;                      // max požiadaviek
const RATE_WINDOW_MS = 60 * 1000;         // za 60 sekúnd na jednu IP

// Povolené zdroje (tvoje domény + lokálny vývoj). Cudzí web bude odmietnutý.
const ALLOWED = [
  'https://paintiano.vercel.app',
  'https://paintiano.app',
  'https://www.paintiano.app',
<<<<<<< HEAD
=======
  'https://paintiano-git-dev',
  'https://paintiano-',
>>>>>>> dev
  'http://localhost',
  'http://127.0.0.1'
];

// Jednoduchý rate limit v pamäti (drží sa, kým je inštancia „teplá").
const _hits = new Map(); // ip -> [timestamps]
function rateLimited(ip) {
  const now = Date.now();
  const arr = (_hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  arr.push(now);
  _hits.set(ip, arr);
  if (_hits.size > 5000) { // ochrana proti rastu pamäte
    for (const [k, v] of _hits) { if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) _hits.delete(k); }
  }
  return arr.length > RATE_MAX;
}

function sourceAllowed(req) {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  // Ak prehliadač pošle origin/referer a NEsedí s povolenými → blok.
  // Ak ani jeden nie je (curl/server/niektoré webview), pustíme.
  if (origin) return ALLOWED.some(a => origin === a || origin.startsWith(a));
  if (referer) return ALLOWED.some(a => referer.startsWith(a));
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method === 'GET') {
    res.status(200).json({ ok: true, message: 'compose endpoint alive — use POST', hasKey: !!process.env.ANTHROPIC_API_KEY, model: API_MODEL });
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed — use POST' }); return; }

  // 1) Origin check
  if (!sourceAllowed(req)) { res.status(403).json({ error: 'Forbidden origin' }); return; }

  // 2) Rate limit
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (rateLimited(ip)) { res.status(429).json({ error: 'Too many requests — slow down' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in Vercel env vars' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { res.status(400).json({ error: 'Invalid JSON body' }); return; } }
  if (!body || !body.messages) { res.status(400).json({ error: 'Missing messages in request body' }); return; }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: (body.model && ALLOWED_MODELS.has(body.model)) ? body.model : API_MODEL,
        max_tokens: Math.min(body.max_tokens || MAX_TOKENS, MAX_TOKENS),  // 3) strop na výstup
        messages: body.messages
      })
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (err) {
    res.status(500).json({ error: 'Upstream request failed', detail: String(err) });
  }
}
