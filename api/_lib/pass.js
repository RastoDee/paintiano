// api/_lib/pass.js
// The AI pass (Nov 2026): Pro is for life; AI runs for 12 months from each purchase.
//
//   licenses.tier      'pro' | 'pro_ai'
//   licenses.ai_until  timestamptz | null
//
//   tier 'pro_ai', ai_until NULL    → AI with no end date (licences sold before the pass)
//   tier 'pro_ai', ai_until future  → the pass is running
//   tier 'pro_ai', ai_until past    → the pass has ended: the key is plain Pro until it is extended
//
// Pure functions only — used by the Edge functions (validate, paddle-webhook) and the Node one (compose).

export const PASS_MONTHS = 12;

export function plusYear(ms) { const d = new Date(ms); d.setUTCFullYear(d.getUTCFullYear() + 1); return d; }
export function minusYear(ms) { const d = new Date(ms); d.setUTCFullYear(d.getUTCFullYear() - 1); return d; }

function untilMs(row) {
  if (!row || !row.ai_until) return null;
  const t = Date.parse(row.ai_until);
  return Number.isFinite(t) ? t : null;
}

// { ai: does AI work now, lifetime: no end date, until: ms|null, expired: a pass that has ended }
export function passState(row, now = Date.now()) {
  if (!row || row.tier !== 'pro_ai') return { ai: false, lifetime: false, until: null, expired: false };
  const u = untilMs(row);
  if (u == null) return { ai: true, lifetime: true, until: null, expired: false };
  if (u > now) return { ai: true, lifetime: false, until: u, expired: false };
  return { ai: false, lifetime: false, until: u, expired: true };
}

// Where a purchased year starts: at the end of a running pass (nothing is lost), otherwise now.
export function extendedUntil(row, now = Date.now()) {
  const u = untilMs(row);
  return plusYear(u != null && u > now ? u : now).toISOString();
}

// The 12-month period of the pass that contains `now` — its end date (YYYY-MM-DD) names the counter,
// so a year bought ahead does not reset the count of the year still running.
export function passPeriodEnd(until, now = Date.now()) {
  let end = new Date(until);
  for (let i = 0; i < 20; i++) { const prev = minusYear(end.getTime()); if (prev.getTime() > now) end = prev; else break; }
  return end.toISOString().slice(0, 10);
}
