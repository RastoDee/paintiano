// Vercel serverless function: /api/compose
// Named GET/POST exports (Web API style) — this is the form Vercel routes
// correctly here. Proxies a Claude request server-side so the API key never
// reaches the browser. Requires Vercel env var: ANTHROPIC_API_KEY.

export function GET() {
  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured on the server' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { model, max_tokens, messages } = body || {};
  if (!messages) {
    return Response.json({ error: 'Missing messages' }, { status: 400 });
  }

  try {
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
    // Pass Anthropic's status + body straight through to the browser.
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return Response.json({ error: String((err && err.message) || err) }, { status: 500 });
  }
}
