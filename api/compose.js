// Vercel serverless function: /api/compose
// Classic Node.js handler (req, res) — the form Vercel's default Node runtime
// always recognizes. Proxies a Claude request server-side so the API key never
// reaches the browser. Requires Vercel env var: ANTHROPIC_API_KEY.

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on the server' });
    return;
  }

  // Vercel's Node runtime already parses JSON bodies into req.body.
  // Fall back to manual parsing just in case it arrives as a string.
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
  }
  if (!body || !body.messages) {
    res.status(400).json({ error: 'Missing messages in request body' });
    return;
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: body.model || 'claude-sonnet-4-20250514',
        max_tokens: body.max_tokens || 2000,
        messages: body.messages
      })
    });

    const data = await anthropicRes.json();
    res.status(anthropicRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Upstream request failed', detail: String(err) });
  }
}
