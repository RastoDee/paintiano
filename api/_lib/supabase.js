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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/licenses`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
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
  const url = `${SUPABASE_URL}/rest/v1/licenses?key=eq.${encodeURIComponent(key)}&select=key,email,status,activations,created_at`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase select failed: ${res.status} ${text}`);
  }
  const rows = await res.json();
  return rows[0] || null;
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
