// api/_lib/refund.js
// The in-app refund (Nov 2026): which purchase a refund of this key would be about,
// and whether it can be given by itself.
//
//   • within 14 days of the purchase
//   • Pro / Pro AI: at most 5 watermark-free exports and 30 AI pieces & melodies on the key
//   • AI pass (12 months bought on a key): at most 30 AI pieces & melodies since it was bought;
//     only the pass goes back, Pro stays
//   • one refund per buyer is given this way — a further one is decided by a person
//
// Everything else is not refused for good: the app then points the buyer to e-mail.
// Used by /api/refund (the decision) and /api/validate (only the end of the window,
// so the app knows whether to show the link at all).

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const REFUND_DAYS = 14;
export const REFUND_MAX_EXPORTS = 5;
export const REFUND_MAX_AI = 30;
const DAY = 864e5;

function h() { return { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }; }
async function sel(query) {
  const res = await fetch(`${SB_URL}/rest/v1/licenses?${query}`, { headers: h() });
  if (!res.ok) throw new Error(`refund: select failed ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json();
}
const ms = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? t : null; };
const num = (v) => Math.max(0, parseInt(v, 10) || 0);

// AI passes bought on this key in the last 14 days and not refunded, newest first.
// A pass is kept as a record row (key UPGRADE-…, status 'disabled') that carries the transaction.
async function recentPasses(row, now) {
  if (!row.email) return [];
  const since = new Date(now - REFUND_DAYS * DAY).toISOString();
  const rows = await sel(`email=eq.${encodeURIComponent(row.email)}&key=like.UPGRADE-*&status=eq.disabled&created_at=gte.${encodeURIComponent(since)}&select=key,order_id,created_at,amount_cents,currency,ai_pieces,raw_event&order=created_at.desc`);
  return rows.filter((r) => {
    if (String(r.order_id || '').startsWith('apple:')) return false;   // bought in the iOS app: Apple refunds those
    let ev = r.raw_event;
    if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch { ev = null; } }
    const from = ev && ev.data && ev.data.custom_data && ev.data.custom_data.upgrade_from;
    return typeof from === 'string' && from.trim() === row.key;
  });
}

// When the refund window of this key closes (ms), or null when it is closed.
// `row` needs key, email, created_at, ai_until, order_id.
export async function refundWindowEnd(row, now = Date.now()) {
  const c = ms(row && row.created_at);
  const apple = String((row && row.order_id) || '').startsWith('apple:');   // an Apple purchase is refunded by Apple, never here
  if (!apple && c != null && c + REFUND_DAYS * DAY > now) return c + REFUND_DAYS * DAY;
  if (!row || !row.ai_until) return null;          // no pass → nothing newer than the licence itself
  const p = await recentPasses(row, now);
  const pc = p.length ? ms(p[0].created_at) : null;
  return pc != null ? pc + REFUND_DAYS * DAY : null;
}

// The whole case. → null when the key does not exist, otherwise
//   { status, kind: 'pro'|'pro_ai'|'pass'|null, order_id, bought, until, amount_cents, currency,
//     exports, ai, eligible, reason: null|'late'|'exports'|'ai'|'repeat'|'inactive' }
export async function refundCase(key, now = Date.now()) {
  const rows = await sel(`key=eq.${encodeURIComponent(key)}&select=key,email,status,tier,created_at,order_id,amount_cents,currency,exports,ai_pieces,ai_until&limit=1`);
  const row = rows[0];
  if (!row || String(row.key).startsWith('UPGRADE-')) return null;
  const out = { status: row.status, kind: null, order_id: null, bought: null, until: null, amount_cents: null, currency: null,
                exports: num(row.exports), ai: num(row.ai_pieces), eligible: false, reason: null };
  if (row.status !== 'active') { out.reason = 'inactive'; return out; }

  const passes = row.ai_until ? await recentPasses(row, now) : [];
  if (passes.length) {
    const p = passes[0];
    out.kind = 'pass'; out.order_id = p.order_id; out.bought = p.created_at;
    out.amount_cents = p.amount_cents; out.currency = p.currency;
    out.ai = Math.max(0, num(row.ai_pieces) - num(p.ai_pieces));   // the record keeps the key's count at the moment the pass was bought
    out.exports = null;                                            // Pro stays, so exports do not count
  } else {
    out.kind = row.tier === 'pro_ai' ? 'pro_ai' : 'pro'; out.order_id = row.order_id; out.bought = row.created_at;
    out.amount_cents = row.amount_cents; out.currency = row.currency;
  }
  const b = ms(out.bought);
  out.until = b != null ? new Date(b + REFUND_DAYS * DAY).toISOString() : null;

  if (b == null || b + REFUND_DAYS * DAY <= now || !out.order_id) { out.reason = 'late'; return out; }
  if (String(out.order_id).startsWith('apple:')) { out.reason = 'apple'; return out; }
  if (out.exports != null && out.exports > REFUND_MAX_EXPORTS) { out.reason = 'exports'; return out; }
  if (out.ai > REFUND_MAX_AI) { out.reason = 'ai'; return out; }
  if (row.email) {
    const before = await sel(`email=eq.${encodeURIComponent(row.email)}&status=eq.refunded&select=key&limit=1`);
    if (before.length) { out.reason = 'repeat'; return out; }
  }
  out.eligible = true;
  return out;
}

// The key's AI count right now — written into a pass record when the pass is bought.
export async function aiCountOf(key) {
  try { const r = await sel(`key=eq.${encodeURIComponent(key)}&select=ai_pieces&limit=1`); return r[0] ? num(r[0].ai_pieces) : 0; }
  catch (_) { return 0; }
}
