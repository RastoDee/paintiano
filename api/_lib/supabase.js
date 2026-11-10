// api/_lib/supabase.js
// Minimal Supabase REST client for Vercel Edge runtime.
// We avoid the official SDK because it pulls in Node-only dependencies that
// don't run cleanly on the Edge runtime. Plain fetch is enough for our needs.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // Don't throw at import time — Vercel may import this during build with no env.
  // We throw inside the helpers if called without env present.
}

function headers() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase env vars missing');
  }
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

export async function insertLicense(row) {
  const post = (r) => fetch(`${SUPABASE_URL}/rest/v1/licenses`, { method: 'POST', headers: headers(), body: JSON.stringify(r) });
  let res = await post(row);
  if (!res.ok) {
    const text = await res.text();
    // No ai_until column yet (supabase/ai_usage.sql part 6 not run): the licence is
    // still issued — a sale never fails over it — and the missing date is logged.
    if ('ai_until' in row && /ai_until/.test(text)) {
      const { ai_until, ...rest } = row;
      console.warn('supabase: licenses.ai_until is missing — run supabase/ai_usage.sql part 6');
      res = await post(rest);
      if (res.ok) return res.json();
      throw new Error(`Supabase insert failed: ${res.status} ${await res.text()}`);
    }
    throw new Error(`Supabase insert failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function upsertLicense(row) {
  // on_conflict=key tells PostgREST to upsert on the primary key
  const res = await fetch(`${SUPABASE_URL}/rest/v1/licenses?on_conflict=key`, {
    method: 'POST',
    headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upsert failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function getLicenseByKey(key) {
  const base = `${SUPABASE_URL}/rest/v1/licenses?key=eq.${encodeURIComponent(key)}&select=key,email,status,tier,activations,created_at,order_id`;
  // ai_until (the AI pass, supabase/ai_usage.sql part 6): asked for first; a database
  // without the column yet answers the plain select, so nothing breaks before the SQL is run.
  let res = await fetch(base + ',ai_until', { headers: headers() });
  if (!res.ok) res = await fetch(base, { headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase select failed: ${res.status} ${text}`);
  }
  const rows = await res.json();
  return rows[0] || null;
}

// One row by Paddle transaction id (order_id). raw_event comes back whole and
// is parsed by the caller, so this works whether the column is json or text.
export async function getLicenseByOrderId(orderId) {
  const url = `${SUPABASE_URL}/rest/v1/licenses?order_id=eq.${encodeURIComponent(orderId)}&select=key,status,tier,raw_event&limit=1`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase select failed: ${res.status} ${text}`);
  }
  const rows = await res.json();
  return rows[0] || null;
}

// Change the tier of one licence key ('pro' | 'pro_ai'). Used by the
// Pro → Pro AI upgrade (and to step back to 'pro' if the upgrade is refunded).
export async function setLicenseTier(key, tier) {
  const url = `${SUPABASE_URL}/rest/v1/licenses?key=eq.${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ tier }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase tier update failed: ${res.status} ${text}`);
  }
  return res.json();
}

// Change fields of one licence key (tier, ai_until). If the database has no
// ai_until column yet, the write is repeated without it — the tier still lands.
export async function patchLicense(key, fields) {
  const url = `${SUPABASE_URL}/rest/v1/licenses?key=eq.${encodeURIComponent(key)}`;
  let res = await fetch(url, { method: 'PATCH', headers: headers(), body: JSON.stringify(fields) });
  if (!res.ok && 'ai_until' in fields) {
    const text = await res.text();
    if (/ai_until/.test(text)) {
      const { ai_until, ...rest } = fields;
      console.warn('supabase: licenses.ai_until is missing — run supabase/ai_usage.sql part 6');
      if (!Object.keys(rest).length) return [];
      res = await fetch(url, { method: 'PATCH', headers: headers(), body: JSON.stringify(rest) });
    } else {
      throw new Error(`Supabase licence update failed: ${res.status} ${text}`);
    }
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase licence update failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function setLicenseStatus(orderId, status, extra = {}) {
  const url = `${SUPABASE_URL}/rest/v1/licenses?order_id=eq.${encodeURIComponent(orderId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ status, ...extra }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase update failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function incrementActivations(key) {
  // PostgREST cannot increment in-place via REST, so we read-then-write.
  const current = await getLicenseByKey(key);
  if (!current) return null;
  const url = `${SUPABASE_URL}/rest/v1/licenses?key=eq.${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ activations: (current.activations || 0) + 1 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase increment failed: ${res.status} ${text}`);
  }
  return res.json();
}
