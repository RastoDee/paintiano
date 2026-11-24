// Text layers of the 3:2 search results video (2880 x 1920) as transparent PNGs: left-aligned headlines in the type of the screenshots.
// node layers32.js OUTDIR LANG
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const [OUT, LANG = 'EN'] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const F = path.resolve(__dirname, '../fonts/node_modules/@fontsource');
const face = (fam, dir, w, st) => ['latin', 'latin-ext'].map(sub => `@font-face{font-family:'${fam}';font-weight:${w};font-style:${st};src:url('file://${F}/${dir}/files/${dir}-${sub}-${w}-${st}.woff2') format('woff2');${sub === 'latin-ext' ? 'unicode-range:U+0100-024F,U+1E00-1EFF;' : ''}}`).join('\n');
const FONTS = [500, 600, 700, 800, 900].map(w => face('Outfit', 'outfit', w, 'normal')).join('\n') + [500, 600, 700].map(w => face('Cormorant Garamond', 'cormorant-garamond', w, 'italic')).join('\n') + [500, 600, 700].map(w => face('Cormorant Garamond', 'cormorant-garamond', w, 'normal')).join('\n');
const T = require('./texts.js')[LANG]; const C = require('../asc/captions.js')[LANG]; const CJK = { zh: 'SC', zhTW: 'TC', ja: 'JP' }[LANG];
const sans = CJK ? `'Noto Sans CJK ${CJK}',Outfit,sans-serif` : `Outfit,'Noto Sans CJK SC',sans-serif`;
const WCOL = 1370, H1 = CJK ? 168 : 196, KS = CJK ? 1.045 : 1.24;
const CSS = `*{box-sizing:border-box;margin:0;padding:0} html,body{background:transparent}
body{font-family:${sans};color:#fff;-webkit-font-smoothing:antialiased;width:${WCOL + 120}px}
.w{width:${WCOL + 120}px;text-align:left;padding:60px 60px 90px}
.w.mid{text-align:center}
.gold{background:linear-gradient(100deg,#fff0c4 0%,#f6c75e 42%,#e0a03a 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.serif{${CJK ? `font-family:'Noto Serif CJK ${CJK}',serif;font-style:normal;font-weight:900` : `font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:700`}}
h1{font-weight:900;font-size:${H1}px;line-height:${CJK ? 1.12 : .98};letter-spacing:${CJK ? '0' : '-.035em'};text-shadow:0 16px 80px rgba(0,0,0,.55),0 3px 14px rgba(0,0,0,.3);white-space:nowrap}
h1 .serif{font-size:${H1 * KS}px;${CJK ? '' : 'letter-spacing:-.01em;padding:0 .04em 0 0;line-height:.86'}}
.sub{font-size:${CJK ? 64 : 68}px;font-weight:${CJK ? 500 : 600};color:rgba(255,255,255,.9);text-shadow:0 5px 30px rgba(0,0,0,.7),0 2px 6px rgba(0,0,0,.5);letter-spacing:-.005em;white-space:nowrap}
.logo{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:250px;line-height:1;letter-spacing:.005em;color:#f7f1e4;text-shadow:0 14px 70px rgba(0,0,0,.75)}
.rule{width:230px;height:4px;margin:50px auto 50px;border-radius:2px;background:linear-gradient(90deg,rgba(246,199,94,0),#f6c75e,rgba(246,199,94,0))}
.tag{font-size:${CJK ? 66 : 72}px;font-weight:700;letter-spacing:${CJK ? '0' : '-.015em'};color:#fff;text-shadow:0 5px 34px rgba(0,0,0,.8);white-space:nowrap} .tag .serif{font-size:${CJK ? 69 : 90}px;${CJK ? '' : 'line-height:.8'}}
.ico{width:330px;height:330px;border-radius:76px;display:block;margin:0 auto;box-shadow:0 40px 110px rgba(0,0,0,.75),0 0 0 3px rgba(255,225,160,.34)}`;
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: WCOL + 120, height: 1200 }, deviceScaleFactor: 1 });
  const load = async (name, html, cls = '') => { const hp = `${OUT}/_${name}.html`; fs.writeFileSync(hp, `<!doctype html><html lang="${{ zh: 'zh-CN', zhTW: 'zh-TW', ja: 'ja' }[LANG] || LANG.toLowerCase()}"><head><meta charset="utf-8"><style>${FONTS}${CSS}</style></head><body><div class="w ${cls}" id="w">${html}</div></body></html>`); await pg.goto('file://' + hp); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(150); };
  const sizeFor = () => pg.evaluate(([H1, KS, WCOL]) => { const h = document.querySelector('h1'); if (!h) return H1; let fs = H1; const set = () => { h.style.fontSize = fs + 'px'; h.querySelectorAll('.serif').forEach(s => s.style.fontSize = (fs * KS) + 'px'); };
    const bad = () => { const r = document.createRange(); r.selectNodeContents(h); return Math.max(...[...r.getClientRects()].map(x => x.width), 0) > WCOL || h.scrollWidth > WCOL + 2; };
    set(); while (bad() && fs > 70) { fs -= 1; set(); } return fs; }, [H1, KS, WCOL]);
  const setSize = (fs) => pg.evaluate(([fs, KS]) => { const h = document.querySelector('h1'); if (!h) return; h.style.fontSize = fs + 'px'; h.querySelectorAll('.serif').forEach(s => s.style.fontSize = (fs * KS) + 'px'); }, [fs, KS]);
  const fitSub = () => pg.evaluate((WCOL) => { for (const e of document.querySelectorAll('.sub,.tag')) { let fs = parseFloat(getComputedStyle(e).fontSize); const r = () => { const g = document.createRange(); g.selectNodeContents(e); return g.getBoundingClientRect().width; }; while (r() > WCOL && fs > 30) { fs -= 1; e.style.fontSize = fs + 'px'; const s = e.querySelector('.serif'); if (s) s.style.fontSize = (fs * 1.25) + 'px'; } } }, WCOL);
  const snap = async (name) => { const el = await pg.$('#w'); await el.screenshot({ path: `${OUT}/${name}.png`, omitBackground: true }); };
  const g = s => s.replace(/<g>/g, '<span class="serif gold">').replace(/<\/g>/g, '</span>');
  const heights = {}; const set = async (items, cls) => { let fs = H1; for (const [, html] of items) { await load('_m', html, cls); fs = Math.min(fs, await sizeFor()); } for (const [name, html] of items) { await load(name, html, cls); await setSize(fs); await fitSub(); heights[name] = await pg.evaluate(() => { const h = document.querySelector('h1'); return h ? Math.round(h.getBoundingClientRect().height) : 0; }); await snap(name); } return fs; };
  const sizes = {};
  // the first headline: where the screenshot's line break would leave one long line and a short one, the wide frame breaks it evenly
  const A32 = { DE: 'Mach aus jedem<br>Song ein <g>Gemälde</g>', FR: 'Fais de chaque<br>chanson un <g>tableau</g>', ES: 'Convierte cada<br>canción en un <g>cuadro</g>', PT: 'Transforma cada<br>música numa <g>pintura</g>' };
  sizes.a = await set([['a', `<h1>${g(A32[LANG] || C.s[0][0])}</h1>`]]); await set([['as', `<div class="sub">${g(C.s[0][1])}</div>`]]);
  sizes.c = await set([['c', `<h1>${g(C.s[2][0])}</h1>`]]); await set([['cs', `<div class="sub">${g(C.s[2][1])}</div>`]]);
  const two = (a, bb, hideA) => `<h1><span style="${hideA ? 'visibility:hidden' : ''}">${a}</span><br><span class="serif gold" style="${hideA ? '' : 'visibility:hidden'}">${bb}</span></h1>`;
  const variants = [['b_all', T.c2all]].concat(Object.entries(T.names).map(([k, nm]) => ['b_' + k, T.like.replace('{n}', nm)]));
  sizes.b = await set([['b', two(T.c2[0], T.c2all, false)]].concat(variants.map(([n, txt]) => [n, two(T.c2[0], txt, true)])));
  await set([['bs', `<div class="sub">${g(T.c2[1])}</div>`]]);
  const ico = 'data:image/png;base64,' + fs.readFileSync('/home/claude/paintiano/public/icon-512.png').toString('base64');
  await set([['end', `<img class="ico" src="${ico}"><div style="height:60px"></div><div class="logo">Paintiano</div><div class="rule"></div><div class="tag">${g(T.end)}</div>`]], 'mid');
  fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify({ sizes, heights })); await b.close(); console.log(LANG, 'layers32 ok, headline sizes', JSON.stringify(sizes));
})();
