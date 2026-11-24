# Paintiano App Preview (886×1920, 30 fps): the real app's paintings painting themselves, the app's own chrome, the screenshots' type.
# python3 mk.py OUT.mp4            → the video (with sound)
# python3 mk.py stills t1,t2,...   → PNG stills at those seconds (pv_<t>.png)
import sys, math, subprocess, os, json, glob, functools
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageChops
P = os.path.dirname(os.path.abspath(__file__)) + '/'
LANG = os.environ.get('PV_LANG', 'EN'); LY = P + 'ly_' + LANG + '/'; UI = P + ('ui/' if LANG == 'EN' else 'ui_' + LANG + '/'); PLATE = P + 'kiss/plate.png' if LANG == 'EN' else UI + 'kiss_plate.png'
W, H, FPS = 886, 1920, 30
# ── the timeline (seconds); the music's first note falls on T_NOTE, its pulse is 0.5 s ──
T_NOTE = 0.25
HOOK_END = 4.00
FOUR = ['gold', 'monet', 'mondrian', 'kandinsky']
SW = 0.40                                   # a swipe
T_SW = [4.00, 5.55, 7.05, 8.55]             # the four swipes begin
T_REEL0, T_REEL1 = 10.05, 12.55             # the fling through seven more painters, landing on The Kiss
REEL = ['delaunay', 'matisse', 'wave', 'miro', 'pop', 'raffel', 'mitchell']
T_KISS0, T_KISS1 = 12.55, 17.60
T_END0 = 17.60; XF = 0.45
D = 22.0
clamp = lambda u: max(0.0, min(1.0, u))
ease = lambda u: 0.5 - 0.5 * math.cos(math.pi * clamp(u))
eout = lambda u, p=3.0: 1 - (1 - clamp(u)) ** p
ein = lambda u, p=2.0: clamp(u) ** p
def ramp(t, a, b): return clamp((t - a) / (b - a)) if b > a else float(t >= b)

@functools.lru_cache(maxsize=24)
def _open(path): return Image.open(path).convert('RGB')
def cover(img, z=1.0, cx=0.5, cy=0.5, res=Image.LANCZOS):
    w, h = img.size; s = max(W / w, H / h) * z; bw, bh = W / s, H / s; x0, y0 = (w - bw) * cx, (h - bh) * cy
    return img.resize((W, H), res, box=(x0, y0, x0 + bw, y0 + bh))

class Seq:
    """a painting, chord by chord (tl.js): the picture at a fractional chord index, neighbours blended"""
    def __init__(s, name):
        s.dir = P + 'tl_' + name + '/'; m = json.load(open(s.dir + 'meta.json')); s.n = m['n']; s.idxs = m['idxs']; s.last = s.idxs[-1]
    def raw(s, fi):
        fi = max(0.0, min(float(s.last), fi)); I = s.idxs
        lo, hi = 0, len(I) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if I[mid] <= fi: lo = mid
            else: hi = mid
        a = _open(f'{s.dir}f{lo:04d}.jpg')
        if I[lo] >= fi or hi == lo: return a
        fr = (fi - I[lo]) / (I[hi] - I[lo])
        if fr < 0.02: return a
        b = _open(f'{s.dir}f{hi:04d}.jpg')
        return b if fr > 0.98 else Image.blend(a, b, fr)
    def at(s, fi, z=1.0): return cover(s.raw(fi), z)

SEQ = {}
def seq(n):
    if n not in SEQ: SEQ[n] = Seq(n)
    return SEQ[n]
@functools.lru_cache(maxsize=40)
def final(name, z=1.0):
    p = P + 'fin/' + name + '.jpg'
    if os.path.exists(p): return cover(_open(p), z)
    s = seq(name); return s.at(s.last, z)

# ── the app's chrome over a painting (ui.js: the same screen on black and on white → colour + alpha) ──
@functools.lru_cache(maxsize=8)
def chrome(name):
    K = np.asarray(Image.open(UI + f'{name}_k.png').convert('RGB'), dtype=np.float32); Wt = np.asarray(Image.open(UI + f'{name}_w.png').convert('RGB'), dtype=np.float32)
    a = np.clip(1 - (Wt - K).mean(2) / 255.0, 0, 1); rgb = np.clip(K / np.maximum(a, 1e-3)[..., None], 0, 255)
    y = np.arange(H, dtype=np.float32); cut = np.clip((y - 1180) / 120.0, 0, 1); cut[H - 16:] = 0        # nothing above the lower part; the progress line is drawn here
    a = a * cut[:, None]
    return Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), 'RGBA')
def _split(name):
    """the chrome → (the same without the words that name the painter, those words alone); the shade under them stays in the first"""
    A = np.asarray(chrome(name)).astype(np.float32) / 255.0; y0, y1 = TAGS; band = A[y0:y1]; s = band[:, 12:13, :]                  # the shade: what stands at the left edge of each row
    a, a_s = band[..., 3], s[..., 3]; a_t = np.clip((a - a_s) / np.maximum(1e-3, 1 - a_s), 0, 1)
    rgb_t = (band[..., :3] * a[..., None] - s[..., :3] * (a_s * (1 - a_t))[..., None]) / np.maximum(a_t, 1e-3)[..., None]
    a_t[a_t < 0.03] = 0; tags = np.dstack([np.clip(rgb_t, 0, 1), a_t])
    plain = A.copy(); plain[y0:y1] = np.repeat(s, W, axis=1)
    return Image.fromarray((plain * 255).astype(np.uint8), 'RGBA'), Image.fromarray((tags * 255).astype(np.uint8), 'RGBA')
@functools.lru_cache(maxsize=8)
def _split_c(name): return _split(name)
def chrome_plain(name='hokusai'): return _split_c(name)[0]
def chrome_tags(name): return _split_c(name)[1]
TAGS = (1699, 1757)

def with_alpha(im, k):
    if k >= 0.999: return im
    r = im.copy(); r.putalpha(im.split()[3].point(lambda v: int(v * k))); return r
def put(frame, layer, xy, k=1.0):
    if k <= 0.003: return
    frame.alpha_composite(with_alpha(layer, k), (int(round(xy[0])), int(round(xy[1]))))

L = lambda n: Image.open(LY + n + '.png').convert('RGBA')
CAP = {k: L(k) for k in ['c1', 'c1s', 'c2', 'c2s', 'c3', 'c3s', 'end', 'c2_all'] + ['c2_' + k for k in FOUR]}
def _topfade():
    hgt = 800; g = Image.new('L', (1, hgt))
    for y in range(hgt):
        u = y / hgt; a = 1.0 if u <= .12 else (1.0 + (0.74 - 1.0) * (u - .12) / (.46 - .12) if u <= .46 else (0.74 * (1 - ease((u - .46) / (.92 - .46))) if u <= .92 else 0))
        g.putpixel((0, y), int(255 * a))
    im = Image.new('RGBA', (W, hgt), (8, 7, 12, 255)); im.putalpha(g.resize((W, hgt))); return im
TOPFADE = _topfade()
def _dot():
    s = 4; r = 46; im = Image.new('RGBA', (r * 2 * s + 80 * s, r * 2 * s + 80 * s), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = im.size[0] // 2
    d.ellipse((c - r * s, c - r * s, c + r * s, c + r * s), fill=(255, 255, 255, 105), outline=(255, 255, 255, 235), width=5 * s)
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse((c - r * s, c - r * s + 6 * s, c + r * s, c + r * s + 6 * s), fill=(0, 0, 0, 90)); sh = sh.filter(ImageFilter.GaussianBlur(10 * s))
    return Image.alpha_composite(sh, im).resize((im.size[0] // s, im.size[1] // s), Image.LANCZOS)
DOT = _dot()

# ── the content under the chrome and the type ──
HK = None
def hook_idx(t):
    n = seq('hokusai').last
    if t < T_NOTE: return 0.0
    if t < T_NOTE + 0.5: return ramp(t, T_NOTE, T_NOTE + 0.16)                       # the first note: the scene
    if t < T_NOTE + 0.62: return 1 + ramp(t, T_NOTE + 0.5, T_NOTE + 0.62)             # the second
    u = ramp(t, T_NOTE + 0.62, 3.45); return 2 + (n - 2) * u ** 1.35          # an even pace: the picture grows all the way (pace.py)
def four_idx(k, t):
    """painter k of the four: a few chords in as it slides in, then the whole piece in about a second"""
    n = seq(FOUR[k]).last; t0 = T_SW[k] + 0.18; t1 = (T_SW[k + 1] if k < 3 else T_REEL0) - 0.12
    return 34 + (n - 34) * ease(ramp(t, t0, t1)) ** 1.25
def swipe_e(u): return eout(u, 3.2)
KISS_CH = 1600
@functools.lru_cache(maxsize=1)
def _plate():
    im = _open(PLATE).copy(); bg = im.getpixel((W // 2, 300)); d = ImageDraw.Draw(im); d.rectangle((0, 0, W, 150), fill=bg); d.rectangle((0, H - 16, W, H), fill=bg); return im, bg
def kiss_plate(): return _plate()[0].copy()
@functools.lru_cache(maxsize=1)
def kiss_chrome(): return _plate()[0].crop((0, KISS_CH, W, H)).convert('RGBA')
KM = json.load(open(P + 'kiss/meta.json')) if os.path.exists(P + 'kiss/meta.json') else None
def kiss_screen(t):
    """the real screen of The Kiss playing as music; the picture's rectangle follows the pass, time-lapsed"""
    im = kiss_plate(); ts = KM['ts']; r = KM['rect']; u = ramp(t, T_KISS0 + 0.05, T_KISS1 - 0.1); tau = 2.0 + (ts[-1] - 3.0) * u
    i = min(range(len(ts)), key=lambda j: abs(ts[j] - tau)) if False else int(np.searchsorted(ts, tau)); i = max(0, min(len(ts) - 1, i))
    f = _open(P + f'kiss/f{i:04d}.jpg')
    if i + 1 < len(ts): f = Image.blend(f, _open(P + f'kiss/f{i + 1:04d}.jpg'), 0.5)
    im.paste(f, (r['x'] * 2, r['y'] * 2))
    return im, u
@functools.lru_cache(maxsize=8)
def done(name, z):
    s = seq(name); return s.at(s.last, z)
@functools.lru_cache(maxsize=1)
def kiss_first():
    im = kiss_screen(T_KISS0)[0]; ImageDraw.Draw(im).rectangle((0, KISS_CH, W, H), fill=_plate()[1]); return im   # its chrome comes in by itself, standing still
def content(t):
    """→ (RGB frame, chrome key, chrome alpha, progress 0..1 or None)"""
    if t < HOOK_END:
        z = 1.0 + 0.05 * ramp(t, 0, HOOK_END); fi = hook_idx(t); return seq('hokusai').at(fi, z), 'hokusai', 1.0, fi / seq('hokusai').n
    for k in range(4):
        t0 = T_SW[k]; t1 = T_SW[k + 1] if k < 3 else T_REEL0
        if t0 <= t < t1:
            fi = four_idx(k, t); z = 1.0 + 0.03 * ramp(t, t0, t1); cur = seq(FOUR[k]).at(fi, z)
            if t < t0 + SW:
                e = swipe_e((t - t0) / SW); prev = done('hokusai', 1.05) if k == 0 else done(FOUR[k - 1], 1.03)
                return (prev, cur, e * H, ('sw', k)), (FOUR[k] if e > 0.5 else ('hokusai' if k == 0 else FOUR[k - 1])), abs(2 * e - 1) ** 0.6, fi / seq(FOUR[k]).n
            return cur, FOUR[k], 1.0, fi / seq(FOUR[k]).n
    if t < T_REEL1:
        items = [done('kandinsky', 1.03)] + [final(a) for a in REEL] + [kiss_first()]
        nmv = len(items) - 1; step = (T_REEL1 - T_REEL0) / nmv; mv = step * 0.80; k = min(nmv - 1, int((t - T_REEL0) / step)); s = k + ease(ramp(t, T_REEL0 + k * step, T_REEL0 + k * step + mv)) ** 0.9
        s = min(s, nmv - 1e-6); i = min(len(items) - 2, int(s)); f = s - i
        return (items[i], items[i + 1], f * H, ('reel', i)), None, ramp(s, len(items) - 2, len(items) - 1.25), None
    if t < T_END0 + XF:
        im, u = kiss_screen(min(t, T_KISS1)); return im, None, 0.0, u
    return None, None, 0.0, None

# ── the end: a wall of all the paintings, slowly rising, the name over it ──
def _wall():
    arts = ['hokusai', 'gold', 'delaunay', 'monet', 'matisse', 'mondrian', 'miro', 'kandinsky', 'wave', 'pop', 'bulge', 'kusama', 'klee', 'picasso', 'bloom', 'raffel', 'pollock', 'mitchell', 'bauhaus', 'rothko', 'spiral', 'arcs', 'lichtenstein', 'thomas']
    arts = [a for a in arts if os.path.exists(P + 'fin/' + a + '.jpg') or os.path.exists(P + 'tl_' + a + '/meta.json')]
    tw, th, gap, cols = 300, 474, 28, 5; rows = math.ceil(len(arts) * 2 / cols) + 1; period = rows * (th + gap)
    Wd, Hd = cols * (tw + gap) + gap, period * 2
    wall = Image.new('RGB', (Wd, Hd), (9, 8, 13)); mask = Image.new('L', (tw * 4, th * 4), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, tw * 4 - 1, th * 4 - 1), radius=26 * 4, fill=255); mask = mask.resize((tw, th), Image.LANCZOS)
    tiles = []
    for a in arts:
        src = _open(P + 'fin/' + a + '.jpg') if os.path.exists(P + 'fin/' + a + '.jpg') else seq(a).raw(seq(a).last)
        w, h = src.size; bh = w * th / tw; tiles.append(src.resize((tw, th), Image.LANCZOS, box=(0, (h - bh) / 2, w, (h + bh) / 2)))
    order = [0, 5, 2, 8, 1, 6, 11, 3, 9, 4, 7, 10] + list(range(12, len(arts))); order = [o for o in order if o < len(arts)]
    k = 0
    for c in range(cols):
        yoff = -int((th + gap) * (0.5 if c % 2 else 0.0))
        for r in range(-1, rows * 2 + 1):
            t = tiles[order[(k + r * 3 + c * 5) % len(order)]]; y = yoff + r * (th + gap)
            wall.paste(t, (gap + c * (tw + gap), y), mask)
    return wall, period
WALL = None
def end_frame(t):
    global WALL
    if WALL is None: WALL = _wall()
    wall, period = WALL; u = t - T_END0; sc = 0.86
    off = (120 + 46 * u) % period
    vw, vh = int(W / sc * 1.5), int(H / sc * 1.25)
    x0 = (wall.size[0] - vw) // 2; crop = wall.crop((x0, int(off), x0 + vw, int(off) + vh))
    crop = crop.resize((int(vw * sc), int(vh * sc)), Image.BILINEAR).rotate(9, resample=Image.BICUBIC, expand=False)
    cx, cy = crop.size[0] // 2, crop.size[1] // 2; fr = crop.crop((cx - W // 2, cy - H // 2, cx - W // 2 + W, cy - H // 2 + H))
    fr = ImageEnhance.Brightness(fr).enhance(0.80).convert('RGBA')
    fr.alpha_composite(ENDSHADE)
    a = ease(ramp(t, T_END0 + 0.35, T_END0 + 0.95)); put(fr, CAP['end'], (0, 560 + 26 * (1 - a)), a)
    return fr.convert('RGB')
def _endshade():
    vg = Image.radial_gradient('L').resize((int(W * 1.7), int(H * 1.25))); x0 = (vg.size[0] - W) // 2; y0 = (vg.size[1] - H) // 2
    vg = vg.crop((x0, y0, x0 + W, y0 + H)).point(lambda v: int(min(215, max(0, (v - 40) * 1.5))))
    core = Image.new('L', (W, H), 0); ImageDraw.Draw(core).ellipse((-120, 470, W + 120, 1330), fill=205); core = core.filter(ImageFilter.GaussianBlur(110))
    a = ImageChops.lighter(vg, core); im = Image.new('RGBA', (W, H), (7, 6, 11, 255)); im.putalpha(a); return im
ENDSHADE = _endshade()

def slide(a, b, off, blur):
    """a above b, shifted up by off px; blur = the px travelled while the shutter is open (a box blur along the way)"""
    st = np.concatenate([np.asarray(a, dtype=np.float32), np.asarray(b, dtype=np.float32)], axis=0)
    if blur < 1.5:
        o = int(round(off)); return Image.fromarray(st[o:o + H].astype(np.uint8), 'RGB')
    cs = np.concatenate([np.zeros((1, W, 3), np.float32), np.cumsum(st, axis=0, dtype=np.float64).astype(np.float64)], axis=0)
    y = np.arange(H) + off; lo = np.clip(np.round(y - blur / 2).astype(int), 0, 2 * H); hi = np.clip(np.round(y + blur / 2).astype(int) + 1, 0, 2 * H); hi = np.maximum(hi, lo + 1)
    out = (cs[hi] - cs[lo]) / (hi - lo)[:, None, None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB')
def base(t):
    c = content(t)
    if not isinstance(c[0], tuple): return c
    a, b, off, key = c[0]; n = content(t + 1.0 / FPS); off2 = n[0][2] if isinstance(n[0], tuple) and n[0][3] == key else (H if off > H / 2 else off)
    return (slide(a, b, off, 0.5 * abs(off2 - off)),) + c[1:]

def render(t):
    if t >= T_END0 + XF: return end_frame(t)
    im, ck, ca, prog = base(t); fr = im.convert('RGBA')
    # the app's chrome: it stands still; a swipe changes only the line that names the painter, the landing on The Kiss the whole of it
    if t < T_REEL0:
        put(fr, chrome_plain(), (0, 0)); put(fr, chrome_tags(ck), (0, TAGS[0]), ca)
    elif t < T_REEL1:
        put(fr, chrome_plain(), (0, 0), 1 - ca); put(fr, kiss_chrome(), (0, KISS_CH), ca)
    if prog is not None or t < T_REEL1:
        ln = Image.new('RGBA', (W, 16), (0, 0, 0, 0)); d = ImageDraw.Draw(ln); x0, x1 = 48, W - 48
        d.rounded_rectangle((x0, 4, x1, 10), radius=3, fill=(255, 255, 255, 46)); p_ = 1.0 if prog is None else prog
        if T_REEL0 <= t < T_REEL1: p_ = 1.0 - ca                                               # the line empties as the picture arrives
        if p_ > 0.004: d.rounded_rectangle((x0, 4, x0 + (x1 - x0) * min(1, p_), 10), radius=3, fill=(70, 222, 156, 255))
        fr.alpha_composite(ln, (0, H - 16))
    # the swipe's finger
    for t0 in T_SW:
        u = (t - (t0 - 0.10)) / 0.42
        if 0 <= u <= 1: put(fr, DOT, (W * 0.60 - DOT.size[0] / 2, 1330 - 560 * eout(u, 2.2) - DOT.size[1] / 2), min(1, u / 0.18) * (1 - ramp(u, 0.62, 1.0)) * 0.9)
    # the top: shade + headline
    tf = 1.0 if t < T_KISS1 else 1 - ramp(t, T_END0, T_END0 + XF)
    put(fr, TOPFADE, (0, 0), tf)
    def cap(key, t_in, t_out, sub_in):
        a = (1.0 if t_in <= 0 else ease(ramp(t, t_in, t_in + 0.34))) * (1 - ease(ramp(t, t_out, t_out + 0.26)))
        if a > 0: put(fr, CAP[key], (0, 84 + (0 if t_in <= 0 else 20 * (1 - ease(ramp(t, t_in, t_in + 0.34)))) - 14 * ease(ramp(t, t_out, t_out + 0.26))), a)
        b = ease(ramp(t, sub_in, sub_in + 0.34)) * (1 - ease(ramp(t, t_out, t_out + 0.26)))
        if b > 0: put(fr, CAP[key + 's'], (0, 318 + 12 * (1 - ease(ramp(t, sub_in, sub_in + 0.34)))), b)
    cap('c1', 0.0, 3.72, 0.95)
    cap('c2', 4.22, 12.02, 4.85)
    # its gold line: like Klimt. → like Monet. → … → 24 painters.  (each change rolls up with the swipe)
    keys = ['c2_' + k for k in FOUR] + ['c2_all']; cuts = [T_SW[1] + 0.10, T_SW[2] + 0.10, T_SW[3] + 0.10, T_REEL0 + 0.10]
    g_in = ease(ramp(t, 4.22, 4.56)); g_out = 1 - ease(ramp(t, 12.02, 12.28)); y_base = 84 + 20 * (1 - g_in) - 14 * ease(ramp(t, 12.02, 12.28))
    for j, key in enumerate(keys):
        a_in = 1.0 if j == 0 else ease(ramp(t, cuts[j - 1] + 0.06, cuts[j - 1] + 0.30)); a_out = 1.0 if j == len(keys) - 1 else 1 - ease(ramp(t, cuts[j], cuts[j] + 0.20))
        a = a_in * a_out * g_in * g_out
        if a > 0: put(fr, CAP[key], (0, y_base + (0 if j == 0 else 30 * (1 - a_in)) - 30 * (1 - a_out)), a)
    cap('c3', 12.60, 17.36, 13.20)
    out = fr.convert('RGB')
    if t >= T_END0: out = Image.blend(out, end_frame(t), ease(ramp(t, T_END0, T_END0 + XF)))
    return out

if __name__ == '__main__':
    if sys.argv[1] == 'stills':
        for s in sys.argv[2].split(','):
            t = float(s); render(t).save(P + f'pv_{LANG}_{t:05.2f}.png'); print('still', t, flush=True)
        sys.exit(0)
    out = sys.argv[1]; N = round(D * FPS); silent_tag = LANG; t_a = float(os.environ.get('PV_T0', 0)); t_b = float(os.environ.get('PV_T1', D)); silent = P + '_v_' + LANG + '.mp4'
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-level', '4.0', '-maxrate', '12M', '-bufsize', '24M', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', silent], stdin=subprocess.PIPE)
    for i in range(int(t_a * FPS), int(t_b * FPS)):
        ff.stdin.write(render(i / FPS).tobytes())
        if i % 60 == 0: print('frame', i, '/', N, flush=True)
    ff.stdin.close(); ff.wait(); print('video done', flush=True)
    aud = P + 'aud/track.m4a'
    if os.path.exists(aud) and t_a == 0 and t_b == D:
        subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-i', silent, '-i', aud, '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', out])
    else: os.replace(silent, out)
    print('done', out)
