// api/compose.js
// Vercel serverless funkcia — bezpečne posiela požiadavku Claudovi.
// Kľúč NIKDY nie je v prehliadači, drží sa na serveri (Vercel env var).
//
// NASADENIE:
//  1) Ulož do projektu ako:  api/compose.js   (prepíš existujúci)
//  2) Vercel → Project → Settings → Environment Variables:
//        Name:  ANTHROPIC_API_KEY     Value: sk-ant-...   (zaškrtni Production!)
//     Save → Deployments → Redeploy.
//  3) Test: otvor https://paintiano.vercel.app/api/compose
//        {"ok":true,"hasKey":true}  → funkcia žije a kľúč je načítaný
//        {"ok":true,"hasKey":false} → kľúč nie je v Production prostredí

// DÔLEŽITÉ: appka posiela model 'claude-sonnet-4-20250514' (to je model pre
// artifact preview/sandbox). Skutočné Anthropic API tento názov nemusí prijať,
// preto tu na serveri VŽDY vynútime aktuálny platný model.
const API_MODEL = 'claude-sonnet-4-6';

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
        model: API_MODEL,                       // vždy aktuálny model (ignoruje sa body.model)
        max_tokens: body.max_tokens || 2000,
        messages: body.messages
      })
    });
    const text = await upstream.text();         // prepustíme presný status + telo (aj prípadnú chybu)
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (err) {
    res.status(500).json({ error: 'Upstream request failed', detail: String(err) });
  }
}
