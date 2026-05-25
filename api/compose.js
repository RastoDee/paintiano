// Vercel serverless function: /api/compose
// Proxies a Claude request server-side so the API key never reaches the browser
// and CORS is not an issue. Place this file at: <project root>/api/compose.js
//
// Required: add an Environment Variable in Vercel named ANTHROPIC_API_KEY
// (Project → Settings → Environment Variables), value = your Anthropic key.

export default async function handler(req, res) {
  // Only POST is allowed
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on the server' });
    return;
  }

  try {
    // The frontend sends { model, max_tokens, messages }
    const { model, max_tokens, messages } = req.body || {};
    if (!messages) {
      res.status(400).json({ error: 'Missing messages' });
      return;
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 2000,
        messages,
      }),
    });

    const text = await upstream.text();
    // Pass through Anthropic's status + body verbatim so the client can read it
    res.status(upstream.status).setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message || err) });
  }
}
