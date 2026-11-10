// api/_lib/apple.js
// Purchases made in the iOS app (Apple In-App Purchase).
//
//   app.paintiano.pro       non-consumable             → a Pro licence key (as a Paddle sale would give)
//   app.paintiano.aipass12  non-renewing subscription  → the AI pass: 12 months of AI on a key
//
// The app sends the transaction ids it got from StoreKit; each is looked up at Apple itself
// (App Store Server API, signed with our In-App Purchase key), so what comes back is Apple's
// own word — nothing the app says about a purchase is believed.
//
// Env (Vercel): APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_KEY_P8, optional APPLE_BUNDLE_ID.

import { insertLicense, getLicenseByKey, patchLicense } from './supabase.js';
import { passState, extendedUntil, minusYear } from './pass.js';
import { aiCountOf } from './refund.js';

export const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'app.paintiano';
export const APPLE_PRODUCT_PRO = 'app.paintiano.pro';
export const APPLE_PRODUCT_PASS = 'app.paintiano.aipass12';

// trimmed: a space or a line break pasted along with the value makes Apple refuse the token
const KEY_ID = (process.env.APPLE_IAP_KEY_ID || '').trim();
const ISSUER_ID = (process.env.APPLE_IAP_ISSUER_ID || '').trim();
const KEY_P8 = process.env.APPLE_IAP_KEY_P8;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function appleConfigured() { return !!(KEY_ID && ISSUER_ID && KEY_P8); }

const b64u = (bytes) => { let s = ''; const a = new Uint8Array(bytes); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64uText = (t) => b64u(new TextEncoder().encode(t));
function b64uDecodeText(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new TextDecoder().decode(a); }

let _key = null;
async function signingKey() {
  if (_key) return _key;
  const pem = String(KEY_P8).replace(/\\n/g, '\n');
  const body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(body); const der = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  try { _key = await crypto.subtle.importKey('pkcs8', der.buffer, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']); }
  catch (e) { const err = new Error('apple: the key (APPLE_IAP_KEY_P8) cannot be read: ' + String(e).slice(0, 80)); err.detail = 'key_unreadable'; throw err; }
  return _key;
}
// The bearer token of the App Store Server API (ES256, short-lived).
async function appleToken() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64uText(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
  const pay = b64uText(JSON.stringify({ iss: ISSUER_ID, iat: now, exp: now + 300, aud: 'appstoreconnect-v1', bid: APPLE_BUNDLE_ID }));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(), new TextEncoder().encode(head + '.' + pay));
  return head + '.' + pay + '.' + b64u(sig);
}

// One transaction as Apple has it → its payload (object), or null when Apple does not know it.
// Production first; a TestFlight / sandbox purchase is only known to the sandbox.
export async function appleTransaction(id) {
  if (!/^[0-9]{6,40}$/.test(String(id))) return null;
  const tok = await appleToken();
  // Production answers 401 for an app that is not on the App Store yet, so a refusal there
  // is not final: the sandbox is asked too, and only when neither knows the answer do we fail.
  const bad = [];
  for (const [tag, host] of [['p', 'https://api.storekit.itunes.apple.com'], ['s', 'https://api.storekit-sandbox.itunes.apple.com']]) {
    const r = await fetch(`${host}/inApps/v1/transactions/${id}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (r.status === 404) continue;
    if (!r.ok) { bad.push(tag + r.status); console.warn('apple: transaction lookup', tag, r.status, (await r.text()).slice(0, 160)); continue; }
    const j = await r.json();
    const parts = String(j.signedTransactionInfo || '').split('.');
    if (parts.length !== 3) throw new Error('apple: no transaction in the answer');
    const t = JSON.parse(b64uDecodeText(parts[1]));
    if (t.bundleId !== APPLE_BUNDLE_ID) return null;
    return t;
  }
  if (bad.length === 2 || (bad.length === 1 && bad[0][0] === 's')) {
    const err = new Error('apple: transaction lookup refused ' + bad.join(' '));
    err.detail = 'apple_' + bad.join('_') + (/^[A-Z0-9]{10}$/.test(KEY_ID) ? '' : '_keyid') + (/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ISSUER_ID) ? '' : '_issuer');
    throw err;
  }
  return null;
}

function sbHeaders() { return { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }; }
async function rowByOrder(orderId) {
  const r = await fetch(`${SB_URL}/rest/v1/licenses?order_id=eq.${encodeURIComponent(orderId)}&select=key,status,tier,raw_event&limit=1`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`apple: select failed ${r.status}`);
  return (await r.json())[0] || null;
}
async function setStatusByOrder(orderId, status, extra = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/licenses?order_id=eq.${encodeURIComponent(orderId)}`, { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ status, ...extra }) });
  if (!r.ok) throw new Error(`apple: update failed ${r.status}`);
}
function newKey(prefix = 'PAINT') {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12); crypto.getRandomValues(bytes);
  const c = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${prefix}-${c.slice(0, 4).join('')}-${c.slice(4, 8).join('')}-${c.slice(8, 12).join('')}`;
}
const orderOf = (t) => 'apple:' + (t.productId === APPLE_PRODUCT_PRO ? (t.originalTransactionId || t.transactionId) : t.transactionId);
const passFrom = (rec) => { let ev = rec && rec.raw_event; if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch { ev = null; } } const f = ev && ev.data && ev.data.custom_data && ev.data.custom_data.upgrade_from; return typeof f === 'string' && f.trim() ? f.trim() : null; };
// Apple gives the price in thousandths of the currency unit; the licences table keeps hundredths.
const cents = (t) => (typeof t.price === 'number' ? Math.round(t.price / 10) : null);

// Give what a set of Apple transactions entitles to. `key` = the licence key the app holds now (or '').
// → { key, granted: [...], skipped: [...] }   key = the licence key the app should use from now on
export async function applyAppleTransactions(ids, key) {
  const txs = [];
  for (const id of ids) { const t = await appleTransaction(id); if (t) txs.push(t); }
  const out = { key: null, granted: [], skipped: [] };
  let holder = null;                                   // the key an AI pass goes on
  if (key) { const row = await getLicenseByKey(key); if (row && row.status === 'active' && !String(row.key).startsWith('UPGRADE-')) holder = row.key; }

  // Pro first: it may be the key a pass in the same call goes on.
  for (const t of txs.filter((x) => x.productId === APPLE_PRODUCT_PRO)) {
    if (t.revocationDate) { out.skipped.push({ id: t.transactionId, why: 'revoked' }); continue; }
    const order = orderOf(t);
    let rec = await rowByOrder(order);
    if (!rec) {
      const k = newKey();
      await insertLicense({ key: k, email: order, status: 'active', tier: 'pro', order_id: order, provider: 'apple', activations: 0,
        product_id: t.productId, amount_cents: cents(t), currency: t.currency || null, raw_event: { apple: t } });
      rec = { key: k, status: 'active' };
      console.info('apple: Pro licence issued', { order, env: t.environment });
    }
    if (rec.status === 'active') { out.key = rec.key; if (!holder) holder = rec.key; out.granted.push({ id: t.transactionId, product: 'pro' }); }
    else out.skipped.push({ id: t.transactionId, why: rec.status });
  }

  for (const t of txs.filter((x) => x.productId === APPLE_PRODUCT_PASS)) {
    if (t.revocationDate) { out.skipped.push({ id: t.transactionId, why: 'revoked' }); continue; }
    const order = orderOf(t);
    const rec = await rowByOrder(order);
    if (rec) {                                         // counted before (a restore, a second device)
      const on = passFrom(rec);
      if (rec.status !== 'refunded' && on && !out.key) { const row = await getLicenseByKey(on); if (row && row.status === 'active') out.key = on; }
      out.granted.push({ id: t.transactionId, product: 'pass', again: true });
      continue;
    }
    if (!holder) { out.skipped.push({ id: t.transactionId, why: 'no_key' }); continue; }
    const orig = await getLicenseByKey(holder);
    if (!orig || orig.status !== 'active') { out.skipped.push({ id: t.transactionId, why: 'no_key' }); continue; }
    if (passState(orig).lifetime) { out.skipped.push({ id: t.transactionId, why: 'lifetime' }); continue; }
    const aiUntil = extendedUntil(orig);
    await insertLicense({ key: newKey('UPGRADE'), email: orig.email || order, status: 'disabled', tier: 'pro_ai', ai_pieces: await aiCountOf(orig.key),
      order_id: order, provider: 'apple', activations: 0, product_id: t.productId, amount_cents: cents(t), currency: t.currency || null,
      raw_event: { apple: t, data: { custom_data: { upgrade_from: orig.key } } } });
    await patchLicense(orig.key, { tier: 'pro_ai', ai_until: aiUntil });
    if (!out.key) out.key = orig.key;
    out.granted.push({ id: t.transactionId, product: 'pass', until: aiUntil });
    console.info('apple: AI pass set', { order, tail: String(orig.key).slice(-4), until: aiUntil.slice(0, 10), env: t.environment });
  }
  if (!out.key && holder) out.key = holder;
  return out;
}

// Apple took a purchase back (refund / revoke): the same as a refunded Paddle order.
// → 'revoked' | 'pass_shortened' | 'pass_removed' | 'not_revoked' | 'unknown'
export async function revokeAppleTransaction(id) {
  const t = await appleTransaction(id);
  if (!t) return 'unknown';
  if (!t.revocationDate) return 'not_revoked';        // Apple itself does not say it was taken back
  const order = orderOf(t);
  const rec = await rowByOrder(order);
  if (!rec || rec.status === 'refunded') return rec ? 'revoked' : 'unknown';
  await setStatusByOrder(order, 'refunded', { refunded_at: new Date().toISOString() });
  if (t.productId !== APPLE_PRODUCT_PASS) { console.info('apple: licence revoked', { order }); return 'revoked'; }
  const on = passFrom(rec); if (!on) return 'revoked';
  const orig = await getLicenseByKey(on);
  const u = orig && orig.ai_until ? Date.parse(orig.ai_until) : null;
  const back = (u != null && Number.isFinite(u)) ? minusYear(u) : null;
  if (back && back.getTime() > Date.now()) { await patchLicense(on, { ai_until: back.toISOString() }); console.info('apple: AI pass year taken back', { order }); return 'pass_shortened'; }
  await patchLicense(on, { tier: 'pro', ai_until: null }); console.info('apple: AI pass taken back — key is Pro', { order });
  return 'pass_removed';
}
