// api/book.js
// The whole book for the reader in the app. Only for those who have it:
//   • a licence key (Pro or Pro AI — bought on the web, in the iOS app or in the Android app), or
//   • a book code (the book bought on its own; see _lib/book.js).
// Request:  POST /api/book  { lang: 'EN'|'SK'|…, key?: 'PAINT-…', code?: 'BOOK-…', check?: true }
// Response: { ok: true, book: {…} }   (check:true → { ok: true } only: is this key / code good?)
//        or { ok: false, reason: 'no_access' | 'bad_request' | 'rate_limited' | 'server_error' }
import { getLicenseByKey } from './_lib/supabase.js';
import { bookCodeValid } from './_lib/book.js';
import EN from './_book/EN.js';
import SK from './_book/SK.js';
import DE from './_book/DE.js';
import FR from './_book/FR.js';
import ES from './_book/ES.js';
import PT from './_book/PT.js';
import zh from './_book/zh.js';
import zhTW from './_book/zhTW.js';
import ja from './_book/ja.js';

export const config = { runtime: 'edge' };
const BOOKS = { EN, SK, DE, FR, ES, PT, zh, zhTW, ja };

const HITS = new Map();
function rateLimited(ip) { const now = Date.now(); const a = (HITS.get(ip) || []).filter((t) => now - t < 60000); a.push(now); HITS.set(ip, a); return a.length > 30; }
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return json({});
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  if (rateLimited(ip)) return json({ ok: false, reason: 'rate_limited' }, 429);
  let body; try { body = await req.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }
  const key = String(body?.key || '').trim(), code = String(body?.code || '').trim();
  if ((!key && !code) || key.length > 200 || code.length > 60) return json({ ok: false, reason: 'bad_request' }, 400);
  try {
    let ok = false;
    if (code) ok = await bookCodeValid(code);
    if (!ok && key) { const row = await getLicenseByKey(key); ok = !!row && row.status !== 'refunded' && row.status !== 'disabled'; }
    if (!ok) return json({ ok: false, reason: 'no_access' });
    if (body?.check === true) return json({ ok: true });
    const book = BOOKS[String(body?.lang || 'EN')] || BOOKS.EN;
    return json({ ok: true, book });
  } catch (err) {
    console.error('book error', err);
    return json({ ok: false, reason: 'server_error' }, 500);
  }
}
