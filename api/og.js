// /api/og — the link preview for a shared painting (/play?piece=…&artist=…).
// Only crawlers land here (vercel.json routes them by User-Agent); people get play.html straight away.
// Returns a small HTML head with Open Graph tags: the title of the song, who paints it, and a picture of
// that very painting (public/og/<piece>-<artist>.jpg, rendered in the app) — the cover when there is none.

const PIECES = {
  liebestraum: 'Liebestraum No.3 — Liszt',
  bumblebee: 'Flight of the Bumble-Bee — Rimsky-Korsakov',
  mountainking: 'In the Hall of the Mountain King — Grieg',
  clairdelune: 'Clair de lune — Debussy',
  gymnopedie: 'Gymnopédie No.1 — Satie',
  furelise: 'Für Elise — Beethoven',
  entertainer: 'The Entertainer — Joplin',
  toccata: 'Toccata in D minor — Bach',
  fantaisie: 'Fantaisie-Impromptu — Chopin',
  promenade: 'Promenade — Mussorgsky',
  fifth: 'Symphony No.5 — Beethoven',
};
const ARTISTS = {
  raffel: 'RafFel', lichtenstein: 'Roy Lichtenstein', klee: 'Paul Klee', delaunay: 'Robert Delaunay', picasso: 'Picasso',
  kusama: 'Kusama', pollock: 'Pollock', kandinsky: 'Kandinsky', miro: 'Miró', mondrian: 'Mondrian', bauhaus: 'Bauhaus',
  rothko: 'Rothko', matisse: 'Matisse', bulge: 'Vasarely', arcs: 'Stella', bloom: 'Sam Francis', spiral: 'Hilma af Klint',
  gold: 'Gustav Klimt', pop: 'Keith Haring', wave: 'Bridget Riley', mitchell: 'Joan Mitchell', monet: 'Claude Monet',
  hokusai: 'Katsushika Hokusai', thomas: 'Alma Thomas',
};
const SITE = 'https://paintiano.app';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default function handler(req, res) {
  const q = req.query || {};
  if (q.piece === 'metamorphosis') q.piece = 'mountainking';   // older links open the piece that took its place
  const piece = PIECES[q.piece] ? q.piece : (q.piece === 'today' ? 'today' : null);
  const artist = ARTISTS[q.artist] ? q.artist : null;
  const song = piece === 'today' ? 'Song of the day' : (piece ? PIECES[piece] : 'Paintiano');
  const title = piece
    ? (artist ? `${song} · inspired by ${ARTISTS[artist]}` : song) + ' · Paintiano'
    : 'Paintiano — music → φ painting';
  const desc = piece
    ? 'Every song has its own painting. Open the link and watch this one paint itself — the same for everyone.'
    : 'Turn any song, MIDI, audio, or image into a golden-ratio colour painting.';
  const img = (piece && piece !== 'today' && artist) ? `${SITE}/og/${piece}-${artist}.jpg` : `${SITE}/og-cover.png`;
  // the address itself, cleaned to what we know
  const qs = new URLSearchParams();
  for (const k of ['piece', 'artist', 'v', 'with', 'fs', 'r', 'p', 't']) if (q[k] != null && String(q[k]).length < 80) qs.set(k, String(q[k]));
  const url = `${SITE}/play?${qs.toString()}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Paintiano">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(img)}">
<meta http-equiv="refresh" content="0;url=${esc('/play.html?' + qs.toString())}">
</head><body><a href="${esc(url)}">${esc(title)}</a></body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.status(200).send(html);
}
