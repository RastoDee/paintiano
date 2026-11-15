# -*- coding: utf-8 -*-
import sys, html, math, os
from playwright.sync_api import sync_playwright
from texts import T
OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
os.makedirs(OUT, exist_ok=True)
CJKF = {'zh': 'Noto Serif CJK SC', 'zhTW': 'Noto Serif CJK TC', 'ja': 'Noto Serif CJK JP'}
def spiral():
    # golden spiral from quarter arcs, faint, lower right (as on the first edition's page)
    phi = (1 + 5 ** .5) / 2; pts = []; n = 220
    for i in range(n + 1):
        th = i / n * 5.2 * math.pi; r = 2.2 * phi ** (th / (math.pi / 2)) * 0.62
        pts.append((r * math.cos(th), r * math.sin(th)))
    d = 'M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in pts)
    return f'<svg class="sp" viewBox="-130 -130 260 260"><path d="{d}" fill="none" stroke="#e9dfc0" stroke-width="1.1"/></svg>'
def page(l):
    t = T[l]; cjk = l in CJKF; e = html.escape
    fam = f"'{CJKF[l]}','DejaVu Serif',serif" if cjk else "'DejaVu Serif',serif"
    secs = ''.join(f'<h3>{e(h)}</h3><p>{e(b)}</p>' for h, b in t['secs'])
    fs, lh = (9.4, 16.4) if cjk else (8.3, 13.9)
    return f'''<!doctype html><html lang="{l}"><head><meta charset="utf-8"><style>
@page {{ size: 595.276pt 841.89pt; margin: 0 }}
* {{ box-sizing: border-box; margin: 0; padding: 0 }}
html, body {{ width: 595.276pt; height: 841.89pt; background: #f9f4e1; -webkit-print-color-adjust: exact; print-color-adjust: exact }}
body {{ position: relative; font-family: {fam}; color: #3d3626; overflow: hidden }}
.b1 {{ position: absolute; inset: 29.5pt; border: .5pt solid #b89645 }}
.b2 {{ position: absolute; inset: 36pt; border: .5pt solid #b89645 }}
.sp {{ position: absolute; right: 14pt; bottom: 70pt; width: 270pt; height: 270pt; transform: rotate(180deg) scaleX(-1) }}
.in {{ position: absolute; left: 66pt; right: 66pt; top: 53pt; bottom: 46pt; display: flex; flex-direction: column }}
h1 {{ font-family: 'DejaVu Serif',serif; font-size: 22.4pt; font-weight: 700; color: #b89645; text-align: center; letter-spacing: .3pt; line-height: 26pt }}
.sub {{ font-size: 12pt; font-style: italic; text-align: center; margin-top: 9pt; line-height: 14pt }}
.sub2 {{ font-size: 7.75pt; font-style: italic; text-align: center; color: #73664c; margin-top: 5.5pt; line-height: 9pt }}
.dv {{ display: flex; align-items: center; justify-content: center; gap: 8pt; margin-top: 8pt; color: #b89645; font-size: 5pt }}
.dv i {{ display: block; width: 50pt; height: .4pt; background: #b89645 }}
p {{ font-size: {fs}pt; line-height: {lh}pt; text-align: justify; {'' if cjk else 'word-spacing: .4pt;'} }}
.intro {{ margin-top: 20pt }}
h3 {{ font-size: {9 if cjk else 8.6}pt; font-weight: 700; color: #997c36; margin: 11.5pt 0 3pt; line-height: 12pt }}
.q {{ margin-top: 15pt; text-align: center; font-style: italic; color: #997c36; font-size: 11pt; line-height: 17pt }}
.ft {{ margin-top: auto; text-align: center }}
.ft .a {{ font-size: 7.4pt; font-style: italic; color: #73664c }}
.ft .b {{ font-size: 8.6pt; color: #b89645; margin-top: 6pt; font-family: 'DejaVu Serif',serif }}
</style></head><body><div class="b1"></div><div class="b2"></div>{spiral()}
<div class="in"><h1>PAINTIANO</h1><div class="sub">{e(t['sub'])}</div><div class="sub2">{e(t['sub2'])}</div><div class="dv"><i></i>✦<i></i></div>
<p class="intro">{e(t['intro'])}</p>{secs}
<div class="q">{e(t['quote'][0])}<br>{e(t['quote'][1])}</div>
<div class="ft"><div class="a">{e(t['foot'])}</div><div class="b">paintiano.app</div></div></div></body></html>'''
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    for l in T:
        pg.set_content(page(l)); pg.wait_for_timeout(150)
        gap = pg.evaluate("(()=>{const q=document.querySelector('.q').getBoundingClientRect(), f=document.querySelector('.ft').getBoundingClientRect(); return Math.round(f.top-q.bottom)})()")
        pg.pdf(path=f'{OUT}/paintiano-{l}-excerpt.pdf', print_background=True, prefer_css_page_size=True)
        print(l, 'gap quote→footer px:', gap)
    b.close()
