// Minimal test: named GET/POST exports (Vercel Web API function style).
// If POST works with this, the previous default-export form was the problem.
export function GET() {
  return Response.json({ ok: true, method: "GET" });
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  return Response.json({ ok: true, method: "POST", body });
}
