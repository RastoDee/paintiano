# Paintiano — PWA

Music → φ painting. A Progressive Web App that turns songs, MIDI, audio, PDFs, and images into a colored chord painting laid out on the golden-ratio grid.

## What this is

A standalone, installable web app. Same code that ran as a Claude artifact, but unwrapped from the sandbox — so file downloads, the iOS share sheet, the clipboard, and `Add to Home Screen` all work natively.

Built with **Vite + React + Tone.js + vite-plugin-pwa**. No backend. Everything runs in the browser.

## Quick start (local dev)

You'll need **Node.js 18+** installed.

```bash
npm install
npm run dev
```

Open http://localhost:5173. Hot-reload on edits.

## Building for production

```bash
npm run build
```

Output lands in `dist/`. That folder is a complete static site — drop it on any static host.

To preview the production build locally:

```bash
npm run preview
```

It serves on http://localhost:4173.

## Installing on your iPhone (PWA)

Once deployed (see below), open the deployed URL in **Safari** on your iPhone, then:

1. Tap the **Share** icon (square with up arrow) at the bottom
2. Scroll down → **Add to Home Screen**
3. Name it "Paintiano" → **Add**

A Paintiano icon appears on your home screen. Tap it — it opens full-screen, no Safari chrome, behaves like a native app. Works offline once cached.

The 🖨 PRINT button will use **real iOS share sheet** and **real file system access** — no clipboard workarounds needed.

## Deployment — pick one

### Option 1: Vercel (easiest, zero config)

1. Push this folder to a GitHub repo
2. Go to [vercel.com/new](https://vercel.com/new), import the repo
3. Vercel auto-detects Vite, builds, and deploys. Done in ~30 seconds
4. Custom domain: optional, free

### Option 2: Netlify (also one-click)

1. Push to GitHub
2. Go to [app.netlify.com/start](https://app.netlify.com/start), connect the repo
3. Build command: `npm run build`. Publish directory: `dist`
4. Deploy

### Option 3: GitHub Pages (free forever)

```bash
# Build
npm run build

# Push dist/ to a gh-pages branch (one-time install)
npm install -g gh-pages
npx gh-pages -d dist
```

Then on GitHub repo Settings → Pages → source: `gh-pages` branch.

### Option 4: Any static host

Cloudflare Pages, Firebase Hosting, S3, your own server with nginx — anything that serves static files works. Just upload the contents of `dist/`.

**Important:** the host must serve over **HTTPS** for the PWA to install and for the clipboard / share APIs to work. All four options above provide HTTPS automatically.

## Project layout

```
paintiano-pwa/
├── package.json          # deps + scripts
├── vite.config.js        # Vite + PWA plugin config
├── index.html            # entry HTML
├── public/
│   ├── favicon.svg       # SVG favicon
│   ├── icon-192.png      # PWA icon
│   ├── icon-512.png      # PWA icon
│   └── icon-maskable.png # Android adaptive icon
└── src/
    ├── main.jsx          # React entry
    └── Paintiano.jsx     # the whole app (BUILD #70)
```

Everything is in `src/Paintiano.jsx` — about 560 KB of code + embedded Liebestraum MIDI/MP3 samples + Scream image sample. That's the entire app.

## Customizing icons / name

- `public/icon-*.png`, `public/favicon.svg` — replace with your own
- `vite.config.js` → `manifest` section — name, short_name, theme color, etc.
- `index.html` → `<title>` and `<meta>` tags

## Tech notes

- **Tone.js** loads Salamander Grand piano samples from a CDN. Plays fine on the first interaction; falls back to oscillator synth if blocked.
- **Service worker** precaches everything for offline use. Bumped cache size limit to 10 MB because the JSX has embedded base64 sample files.
- **PWA manifest** generated automatically by vite-plugin-pwa at `/manifest.webmanifest`.

## License

Whatever you want. This is your app now.
