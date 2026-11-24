// Text layers of the App Preview as transparent PNGs, 886 px wide (the App Store screenshots' own type: Outfit + Cormorant italic gold;
// Chinese and Japanese in Noto Sans / Noto Serif CJK, as on the screenshots).   node layers.js OUTDIR LANG
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const [OUT, LANG = 'EN'] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const F = path.resolve(__dirname, '../fonts/node_modules/@fontsource');
const face = (fam, dir, w, st) => ['latin', 'latin-ext'].map(sub => `@font-face{font-family:'${fam}';font-weight:${w};font-style:${st};src:url('file://${F}/${dir}/files/${dir}-${sub}-${w}-${st}.woff2') format('woff2');${sub === 'latin-ext' ? 'unicode-range:U+0100-024F,U+1E00-1EFF;' : ''}}`).join('\n');
const FONTS = [500, 600, 700, 800, 900].map(w => face('Outfit', 'outfit', w, 'normal')).join('\n') + [500, 600, 700].map(w => face('Cormorant Garamond', 'cormorant-garamond', w, 'italic')).join('\n') + [500, 600, 700].map(w => face('Cormorant Garamond', 'cormorant-garamond', w, 'normal')).join('\n');
const T = require('./texts.js')[LANG]; const CJK = { zh: 'SC', zhTW: 'TC', ja: 'JP' }[LANG];
const sans = CJK ? `'Noto Sans CJK ${CJK}',Outfit,sans-serif` : `Outfit,'Noto Sans CJK SC',sans-serif`;
const H1 = CJK ? 89 : 101, KS = CJK ? 1.045 : 1.24;     // headline size, and how much larger its gold word stands
const CSS = `*{box-sizing:border-box;margin:0;padding:0} html,body{background:transparent}
body{font-family:${sans};color:#fff;-webkit-font-smoothing:antialiased;width:886px}
.w{width:886px;text-align:center;padding:40px 30px 60px}
.gold{background:linear-gradient(100deg,#fff0c4 0%,#f6c75e 42%,#e0a03a 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.serif{${CJK ? `font-family:'Noto Serif CJK ${CJK}',serif;font-style:normal;font-weight:900` : `font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:700`}}
h1{font-weight:900;font-size:${H1}px;line-height:${CJK ? 1.12 : .98};letter-spacing:${CJK ? '0' : '-.035em'};text-shadow:0 12px 60px rgba(0,0,0,.5),0 2px 10px rgba(0,0,0,.28)}
h1 .serif{font-size:${H1 * KS}px;${CJK ? '' : 'letter-spacing:-.01em;padding:0 .04em;line-height:.86'}}
.sub{font-size:${CJK ? 33 : 35}px;font-weight:${CJK ? 500 : 600};color:rgba(255,255,255,.9);text-shadow:0 4px 24px rgba(0,0,0,.7),0 1px 4px rgba(0,0,0,.5);letter-spacing:-.005em;white-space:nowrap}
.logo{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:150px;line-height:1;letter-spacing:.005em;color:#f7f1e4;text-shadow:0 10px 50px rgba(0,0,0,.7)}
.rule{width:150px;height:3px;margin:34px auto 34px;border-radius:2px;background:linear-gradient(90deg,rgba(246,199,94,0),#f6c75e,rgba(246,199,94,0))}
.tag{font-size:${CJK ? 40 : 43}px;font-weight:700;letter-spacing:${CJK ? '0' : '-.015em'};color:#fff;text-shadow:0 4px 26px rgba(0,0,0,.75);white-space:nowrap} .tag .serif{font-size:${CJK ? 42 : 54}px;${CJK ? '' : 'line-height:.8'}}
.ico{width:236px;height:236px;border-radius:54px;display:block;margin:0 auto;box-shadow:0 30px 80px rgba(0,0,0,.7),0 0 0 2px rgba(255,225,160,.34)}`;
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 886, height: 900 }, deviceScaleFactor: 1 });
  const load = async (name, html) => { const hp = `${OUT}/_${name}.html`; fs.writeFileSync(hp, `<!doctype html><html lang="${{ zh: 'zh-CN', zhTW: 'zh-TW', ja: 'ja' }[LANG] || LANG.toLowerCase()}"><head><meta charset="utf-8"><style>${FONTS}${CSS}</style></head><body><div class="w" id="w">${html}</div></body></html>`); await pg.goto('file://' + hp); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(150); };
  // the largest headline size at which every line of this layer fits (each <br> line kept on one line, at most 810 px wide)
  const sizeFor = () => pg.evaluate(([H1, KS]) => { const h = document.querySelector('h1'); if (!h) return H1; let fs = H1; const set = () => { h.style.fontSize = fs + 'px'; h.querySelectorAll('.serif').forEach(s => s.style.fontSize = (fs * KS) + 'px'); };
    const want = (h.innerHTML.match(/<br>/g) || []).length + 1; const lh = parseFloat(getComputedStyle(h).lineHeight) / parseFloat(getComputedStyle(h).fontSize);
    const bad = () => { const r = document.createRange(); r.selectNodeContents(h); const w = Math.max(...[...r.getClientRects()].map(x => x.width), 0); const lines = Math.round(h.getBoundingClientRect().height / (fs * lh)); return lines > want || w > 810 || [...h.querySelectorAll('span')].some(s => s.getBoundingClientRect().width > 810); };
    set(); while (bad() && fs > 50) { fs -= 1; set(); } return fs; }, [H1, KS]);
  const setSize = (fs) => pg.evaluate(([fs, KS]) => { const h = document.querySelector('h1'); if (!h) return; h.style.fontSize = fs + 'px'; h.querySelectorAll('.serif').forEach(s => s.style.fontSize = (fs * KS) + 'px'); }, [fs, KS]);
  const fitSub = () => pg.evaluate(() => { for (const e of document.querySelectorAll('.sub,.tag')) { let fs = parseFloat(getComputedStyle(e).fontSize), k = 0; while (e.scrollWidth > 826 && fs > 20) { fs -= 0.5; e.style.fontSize = fs + 'px'; const s = e.querySelector('.serif'); if (s) s.style.fontSize = (fs * 1.25) + 'px'; k++; } } });
  const snap = async (name) => { const el = await pg.$('#w'); await el.screenshot({ path: `${OUT}/${name}.png`, omitBackground: true }); };
  const g = s => s.replace(/<g>/g, '<span class="serif gold">').replace(/<\/g>/g, '</span>');
  // a set of layers that must share one headline size (so that their lines stand in the same place)
  const set = async (items) => { let fs = H1; for (const [, html] of items) { await load('_m', html); fs = Math.min(fs, await sizeFor()); } for (const [name, html] of items) { await load(name, html); await setSize(fs); await fitSub(); await snap(name); } return fs; };
  const sizes = {};
  for (const k of ['c1', 'c3']) { sizes[k] = await set([[k, `<h1>${g(T[k][0])}</h1>`]]); await set([[k + 's', `<div class="sub">${g(T[k][1])}</div>`]]); }
  // the second headline: its first line stays, its gold line changes with every painter — each as its own layer in the same place
  const two = (a, bb, hideA) => `<h1><span style="white-space:nowrap;${hideA ? 'visibility:hidden' : ''}">${a}</span><br><span class="serif gold" style="white-space:nowrap;${hideA ? '' : 'visibility:hidden'}">${bb}</span></h1>`;
  const variants = [['c2_all', T.c2all]].concat(Object.entries(T.names).map(([k, nm]) => ['c2_' + k, T.like.replace('{n}', nm)]));
  sizes.c2 = await set([['c2', two(T.c2[0], T.c2all, false)]].concat(variants.map(([n, txt]) => [n, two(T.c2[0], txt, true)])));
  await set([['c2s', `<div class="sub">${g(T.c2[1])}</div>`]]);
  const ico = 'data:image/png;base64,' + fs.readFileSync('/home/claude/paintiano/public/icon-512.png').toString('base64');
  await set([['end', `<img class="ico" src="${ico}"><div style="height:44px"></div><div class="logo">Paintiano</div><div class="rule"></div><div class="tag">${g(T.end)}</div>`]]);
  await b.close(); console.log(LANG, 'layers ok, headline sizes', JSON.stringify(sizes));
})();
