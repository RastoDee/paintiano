// api/apple-webhook.js
// App Store Server Notifications (version 2). Set in App Store Connect → the app → App Information →
// App Store Server Notifications: https://paintiano.app/api/apple-webhook (Production and Sandbox).
//
// Only a taken-back purchase matters here (REFUND, REVOKE). What the notice says is not believed:
// the transaction is looked up at Apple again, and only if Apple itself shows it as revoked is the
// licence switched off — so a forged notice can do nothing but cause that look-up.

import { revokeAppleTransaction, appleConfigured } from './_lib/apple.js';

export const config = { runtime: 'edge' };

function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
function part(jws) { try { let s = String(jws).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return JSON.parse(new TextDecoder().decode(a)); } catch (_) { return null; } }

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }
  const note = part(body?.signedPayload);
  if (!note) return json({ ok: false, reason: 'bad_request' }, 400);
  const type = note.notificationType;
  if (type !== 'REFUND' && type !== 'REVOKE') return json({ ok: true, ignored: type || 'unknown' });
  const tx = part(note.data && note.data.signedTransactionInfo);
  const id = tx && tx.transactionId;
  if (!id) return json({ ok: true, ignored: 'no_transaction' });
  if (!appleConfigured()) return json({ ok: false, reason: 'not_configured' }, 503);
  try {
    const r = await revokeAppleTransaction(String(id));
    return json({ ok: true, result: r });
  } catch (e) {
    console.error('apple-webhook: failed', String(e));
    return json({ ok: false, reason: 'server_error' }, 503);   // Apple retries
  }
}
