// Supabase keep-alive: pinged by Vercel cron every 6h to prevent free-tier pause.
export default async function handler(req, res) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return res.status(500).json({ ok: false, error: "Missing SUPABASE env vars" });
    }
    const r = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    // AI fair use: the daily counters are only needed for today — drop rows
    // older than 3 days (no-op until supabase/ai_usage.sql has been run).
    let purged = null;
    try {
      const cut = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
      const d = await fetch(`${url}/rest/v1/ai_usage?day=lt.${cut}`, {
        method: "DELETE",
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      });
      purged = d.status;
    } catch (_) {}
    return res.status(200).json({ ok: r.ok, status: r.status, purged, ts: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
