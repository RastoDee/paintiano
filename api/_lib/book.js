// api/_lib/book.js
// The book sold on its own (Nov 2026): a buyer gets a BOOK CODE, not a licence. The code is stateless —
// BOOK-<8 id>-<12 signature> — so nothing is written to the licences table and a book purchase can never
// be mistaken for Pro by /api/validate or by an older app. The id comes from the Paddle transaction (the same
// code every time that transaction is delivered); the signature is an HMAC of the id with a server secret.
const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L

async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}
const enc = (bytes, n) => { let s = ''; for (let i = 0; i < n; i++) s += A[bytes[i] % A.length]; return s; };

export function bookSecret() { return process.env.BOOK_CODE_SECRET || process.env.PADDLE_WEBHOOK_SECRET || ''; }

export async function bookCodeFor(orderId, secret = bookSecret()) {
  if (!secret || !orderId) return null;
  const id = enc(await hmac(secret, 'book-id:' + orderId), 8);
  const sig = enc(await hmac(secret, 'book-sig:' + id), 12);
  return 'BOOK-' + id + '-' + sig;
}

export async function bookCodeValid(code, secret = bookSecret()) {
  if (!secret) return false;
  const m = /^BOOK-([A-Z2-9]{8})-([A-Z2-9]{12})$/.exec(String(code || '').trim().toUpperCase());
  if (!m) return false;
  const want = enc(await hmac(secret, 'book-sig:' + m[1]), 12);
  let d = 0; for (let i = 0; i < 12; i++) d |= want.charCodeAt(i) ^ m[2].charCodeAt(i);
  return d === 0;
}
