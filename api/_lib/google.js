// api/_lib/google.js
// Purchases made in the Android app (Google Play Billing).
//
//   app.paintiano.pro       one-time product, bought once   → a Pro licence key (as a Paddle sale would give)
//   app.paintiano.aipass12m one-time product, used up here  → the AI pass: 12 months of AI on a key
//
// The app sends the purchase tokens it got from Google Play; each is looked up at Google itself
// (Google Play Developer API, with our service account), so what comes back is Google's own
// word — nothing the app says about a purchase is believed. A purchase that was given is then
// confirmed at Google: Pro is acknowledged (Google returns the money of a purchase that is not
// acknowledged within three days), the pass is consumed (so a further year can be bought).
//
// Env (Vercel): GOOGLE_PLAY_SA_JSON (the service account's key file, whole) — or
//               GOOGLE_PLAY_SA_EMAIL + GOOGLE_PLAY_SA_KEY (its private key); optional GOOGLE_PLAY_PACKAGE.

import { insertLicense, getLicenseByKey, patchLicense } from './supabase.js';
import { passState, extendedUntil, minusYear } from './pass.js';
import { aiCountOf } from './refund.js';

export const GOOGLE_PACKAGE = (process.env.GOOGLE_PLAY_PACKAGE || 'app.paintiano').trim();
export const GOOGLE_PRODUCT_PRO = 'app.paintiano.pro';
export const GOOGLE_PRODUCT_PASS = 'app.paintiano.aipass12m';
const PRODUCTS = [GOOGLE_PRODUCT_PRO, GOOGLE_PRODUCT_PASS];

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function account() {
  let email = (process.env.GOOGLE_PLAY_SA_EMAIL || '').trim(), key = process.env.GOOGLE_PLAY_SA_KEY || '';
  const raw = process.env.GOOGLE_PLAY_SA_JSON;
  if (raw) { try { const j = JSON.parse(raw); email = String(j.client_email || email).trim(); key = j.private_key || key; } catch (_) {} }
  return { email, key };
}
export function googleConfigured() { const a = account(); return !!(a.email && a.key); }

const b64u = (bytes) => { let s = ''; const a = new Uint8Array(bytes); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64uText = (t) => b64u(new TextEncoder().encode(t));

let _key = null, _tok = null, _tokUntil = 0;
async function signingKey() {
  if (_key) return _key;
  const pem = String(account().key).replace(/\\n/g, '\n');
  const body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  try {
    const bin = atob(body); const der = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
    _key = await crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch (e) { const err = new Error('google: the service account key cannot be read: ' + String(e).slice(0, 80)); err.detail = 'key_unreadable'; throw err; }
  return _key;
}
// The access token of the Google Play Developer API (a signed request exchanged at Google; kept for its lifetime).
async function googleToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_tok && now < _tokUntil - 60) return _tok;
  const head = b64uText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const pay = b64uText(JSON.stringify({ iss: account().email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 }));
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, await signingKey(), new TextEncoder().encode(head + '.' + pay));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + pay + '.' + b64u(sig) });
  if (!r.ok) { const err = new Error('google: no access token ' + r.status + ' ' + (await r.text()).slice(0, 160)); err.detail = 'google_token_' + r.status; throw err; }
  const j = await r.json();
  _tok = j.access_token; _tokUntil = now + (Number(j.expires_in) || 3000);
  return _tok;
}
const API = () => `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(GOOGLE_PACKAGE)}`;
const okToken = (t) => /^[A-Za-z0-9._\-]{20,2000}$/.test(String(t));

// One purchase as Google has it → { productId, token, orderId, state:'bought'|'pending'|'cancelled', … }, or null when Google does not know it.
export async function googlePurchase(productId, token) {
  if (!PRODUCTS.includes(productId) || !okToken(token)) return null;
  const tok = await googleToken();
  const r = await fetch(`${API()}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`, { headers: { Authorization: `Bearer ${tok}` } });
  if (r.status === 404 || r.status === 400 || r.status === 410) return null;   // not a purchase of this product / of this app
  if (!r.ok) { const err = new Error('google: purchase lookup refused ' + r.status + ' ' + (await r.text()).slice(0, 160)); err.detail = 'google_' + r.status; throw err; }
  const j = await r.json();
  const st = Number(j.purchaseState);
  return { productId, token, orderId: j.orderId || null, state: st === 0 ? 'bought' : (st === 2 ? 'pending' : 'cancelled'),
    acknowledged: Number(j.acknowledgementState) === 1, consumed: Number(j.consumptionState) === 1,
    test: j.purchaseType === 0, time: Number(j.purchaseTimeMillis) || null, region: j.regionCode || null };
}
// Confirm at Google that the purchase was given. A failure is only logged: the app does the same on its side.
async function settle(p) {
  try {
    if (p.productId === GOOGLE_PRODUCT_PASS ? p.consumed : p.acknowledged) return;
    const r = await fetch(`${API()}/purchases/products/${encodeURIComponent(p.productId)}/tokens/${encodeURIComponent(p.token)}:${p.productId === GOOGLE_PRODUCT_PASS ? 'consume' : 'acknowledge'}`,
      { method: 'POST', headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json' }, body: '{}' });
    if (!r.ok) console.warn('google: settle', p.productId, r.status, (await r.text()).slice(0, 160));
  } catch (e) { console.warn('google: settle failed', String(e).slice(0, 160)); }
}

function sbHeaders() { return { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }; }
async function rowByOrder(orderId) {
  const r = await fetch(`${SB_URL}/rest/v1/licenses?order_id=eq.${encodeURIComponent(orderId)}&select=key,status,tier,product_id,raw_event&limit=1`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`google: select failed ${r.status}`);
  return (await r.json())[0] || null;
}
async function setStatusByOrder(orderId, status, extra = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/licenses?order_id=eq.${encodeURIComponent(orderId)}`, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ status, ...extra }) });
  if (!r.ok) throw new Error(`google: update failed ${r.status}`);
}
function newKey(prefix = 'PAINT') {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12); crypto.getRandomValues(bytes);
  const c = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${prefix}-${c.slice(0, 4).join('')}-${c.slice(4, 8).join('')}-${c.slice(8, 12).join('')}`;
}
async function tokenTag(token) { const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token)))); return Array.from(h.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join(''); }
// Google's order number; a purchase without one (a promo code) is known by its token instead.
const orderOf = async (p) => 'google:' + (p.orderId || ('t:' + await tokenTag(p.token)));
const passFrom = (rec) => { let ev = rec && rec.raw_event; if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch { ev = null; } } const f = ev && ev.data && ev.data.custom_data && ev.data.custom_data.upgrade_from; return typeof f === 'string' ? f.trim() : null; };
const kept = (p) => ({ productId: p.productId, orderId: p.orderId, token: p.token, time: p.time, region: p.region, test: p.test });

// Give what a set of Google Play purchases entitles to. `key` = the licence key the app holds now (or '').
// purchases: [{ productId, token }] → { key, granted: [...], skipped: [...] }   key = the licence key the app should use from now on
export async function applyGooglePurchases(purchases, key) {
  const got = [];
  for (const q of purchases) { const p = await googlePurchase(q.productId, q.token); if (p) got.push(p); }
  const out = { key: null, granted: [], skipped: [] };
  const tail = (p) => String(p.token).slice(-8);
  let holder = null;                                   // the key an AI pass goes on
  if (key) { const row = await getLicenseByKey(key); if (row && row.status === 'active' && !String(row.key).startsWith('UPGRADE-')) holder = row.key; }

  // Pro first: it may be the key a pass in the same call goes on.
  for (const p of got.filter((x) => x.productId === GOOGLE_PRODUCT_PRO)) {
    if (p.state !== 'bought') { out.skipped.push({ id: tail(p), why: p.state }); continue; }
    const order = await orderOf(p);
    let rec = await rowByOrder(order);
    if (!rec) {
      const k = newKey();
      await insertLicense({ key: k, email: order, status: 'active', tier: 'pro', order_id: order, provider: 'google', activations: 0,
        product_id: p.productId, amount_cents: null, currency: null, raw_event: { google: kept(p) } });
      rec = { key: k, status: 'active' };
      console.info('google: Pro licence issued', { order, test: p.test });
    }
    if (rec.status === 'active') { out.key = rec.key; if (!holder) holder = rec.key; out.granted.push({ id: tail(p), product: 'pro' }); await settle(p); }
    else out.skipped.push({ id: tail(p), why: rec.status });
  }

  for (const p of got.filter((x) => x.productId === GOOGLE_PRODUCT_PASS)) {
    if (p.state !== 'bought') { out.skipped.push({ id: tail(p), why: p.state }); continue; }
    const order = await orderOf(p);
    const rec = await rowByOrder(order);
    if (rec) {                                         // counted before (reported again)
      const on = passFrom(rec);
      if (rec.status !== 'refunded' && on && !out.key) { const row = await getLicenseByKey(on); if (row && row.status === 'active') out.key = on; }
      out.granted.push({ id: tail(p), product: 'pass', again: true });
      if (rec.status !== 'refunded') await settle(p);
      continue;
    }
    if (!holder) { out.skipped.push({ id: tail(p), why: 'no_key' }); continue; }
    const orig = await getLicenseByKey(holder);
    if (!orig || orig.status !== 'active') { out.skipped.push({ id: tail(p), why: 'no_key' }); continue; }
    if (passState(orig).lifetime) { out.skipped.push({ id: tail(p), why: 'lifetime' }); continue; }
    const aiUntil = extendedUntil(orig);
    await insertLicense({ key: newKey('UPGRADE'), email: orig.email || order, status: 'disabled', tier: 'pro_ai', ai_pieces: await aiCountOf(orig.key),
      order_id: order, provider: 'google', activations: 0, product_id: p.productId, amount_cents: null, currency: null,
      raw_event: { google: kept(p), data: { custom_data: { upgrade_from: orig.key } } } });
    await patchLicense(orig.key, { tier: 'pro_ai', ai_until: aiUntil });
    if (!out.key) out.key = orig.key;
    out.granted.push({ id: tail(p), product: 'pass', until: aiUntil });
    console.info('google: AI pass set', { order, tail: String(orig.key).slice(-4), until: aiUntil.slice(0, 10), test: p.test });
    await settle(p);
  }
  if (!out.key && holder) out.key = holder;
  return out;
}

// Google took a purchase back (a refund, a chargeback, a revoke): the same as a refunded Paddle order.
// `order` = 'google:GPA.…' → 'revoked' | 'pass_shortened' | 'pass_removed' | 'unknown'
async function revokeOrder(order) {
  const rec = await rowByOrder(order);
  if (!rec) return 'unknown';
  if (rec.status === 'refunded') return 'revoked';
  await setStatusByOrder(order, 'refunded', { refunded_at: new Date().toISOString() });
  if (rec.product_id !== GOOGLE_PRODUCT_PASS) { console.info('google: licence revoked', { order }); return 'revoked'; }
  const on = passFrom(rec); if (!on) return 'revoked';
  const orig = await getLicenseByKey(on);
  const u = orig && orig.ai_until ? Date.parse(orig.ai_until) : null;
  const back = (u != null && Number.isFinite(u)) ? minusYear(u) : null;
  if (back && back.getTime() > Date.now()) { await patchLicense(on, { ai_until: back.toISOString() }); console.info('google: AI pass year taken back', { order }); return 'pass_shortened'; }
  await patchLicense(on, { tier: 'pro', ai_until: null }); console.info('google: AI pass taken back — key is Pro', { order });
  return 'pass_removed';
}

// The purchases Google lists as taken back in the last `days` days → each is switched off here.
// The list is asked from Google itself, so nothing a caller says is believed. → { seen, results: { order: result } }
export async function sweepGoogleVoided(days = 7) {
  const tok = await googleToken();
  const results = {}; let seen = 0, page = '';
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`${API()}/purchases/voidedpurchases?type=0&maxResults=1000&startTime=${Date.now() - days * 864e5}${page ? '&token=' + encodeURIComponent(page) : ''}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) { const err = new Error('google: voided purchases refused ' + r.status + ' ' + (await r.text()).slice(0, 160)); err.detail = 'google_' + r.status; throw err; }
    const j = await r.json();
    for (const v of (j.voidedPurchases || [])) {
      seen++;
      const order = 'google:' + (v.orderId || ('t:' + await tokenTag(v.purchaseToken)));
      const res = await revokeOrder(order);
      if (res !== 'unknown') results[order] = res;
    }
    page = (j.tokenPagination && j.tokenPagination.nextPageToken) || '';
    if (!page) break;
  }
  return { seen, results };
}
