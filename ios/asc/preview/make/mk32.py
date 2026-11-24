# Paintiano — the App Store search results video (3:2, 2880 x 1920, 30 fps, 17 s): the static search picture come alive.
# A gold staff of notes flows into a painting that paints itself; one song in four painters by swipe; a picture played as music; the name.
# python3 mk32.py OUT.mp4 | python3 mk32.py stills t1,t2,...     (PV_LANG=EN by default; layers from layers32.js, material from the App Preview)
import sys, math, subprocess, os, json, functools, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance, ImageChops
import mk as M                                    # the App Preview's material: paintings chord by chord, The Kiss, easing
P = M.P; LANG = M.LANG; LY = P + 'ly32_' + LANG + '/'
W, H, FPS = 2880, 1920, 30
D = 17.0
T_NOTE = 0.25; HOOK_END = 4.0
FOUR = ['gold', 'monet', 'mondrian', 'kandinsky']; T_SW = [4.0, 5.25, 6.5, 7.75]; SW = 0.38
T_REEL0, T_REEL1 = 9.0, 10.5; REEL = ['delaunay', 'matisse', 'wave', 'miro', 'pop']
T_MORPH0, T_K0 = 10.62, 11.0                     # the tall painting becomes the square picture
T_END0 = 14.75; XF = 0.40
CH = 1640; CW = round(CH * 1233 / 1950); CX0 = 1653; CY0 = 120; CYC = CY0 + CH // 2
KW = CW; KH = round(KW * 888 / 882)
ease, eout, ramp, clamp = M.ease, M.eout, M.ramp, M.clamp
BG = (7, 6, 11)
seq = M.seq
@functools.lru_cache(maxsize=24)
def fin(name):
    p = P + 'fin/' + name + '.jpg'; src = M._open(p) if os.path.exists(p) else seq(name).raw(seq(name).last)
    return src.resize((CW, CH), Image.LANCZOS)
def R(img): return img.resize((CW, CH), Image.LANCZOS)
def slide(a, b, off, blur):
    st = np.concatenate([np.asarray(a, dtype=np.float32), np.asarray(b, dtype=np.float32)], axis=0)
    if blur < 1.5:
        o = int(round(off)); return Image.fromarray(st[o:o + CH].astype(np.uint8), 'RGB')
    cs = np.concatenate([np.zeros((1, CW, 3)), np.cumsum(st, axis=0, dtype=np.float64)], axis=0)
    y = np.arange(CH) + off; lo = np.clip(np.round(y - blur / 2).astype(int), 0, 2 * CH); hi = np.clip(np.round(y + blur / 2).astype(int) + 1, 0, 2 * CH); hi = np.maximum(hi, lo + 1)
    return Image.fromarray(np.clip((cs[hi] - cs[lo]) / (hi - lo)[:, None, None], 0, 255).astype(np.uint8), 'RGB')
def four_idx(k, t):
    n = seq(FOUR[k]).last; t0 = T_SW[k] + 0.16; t1 = (T_SW[k + 1] if k < 3 else T_REEL0) - 0.10
    return 34 + (n - 34) * ease(ramp(t, t0, t1)) ** 1.25
def _pair(t):
    """→ ('one', img) or ('two', a, b, offset px, key): what stands in the tall frame at t"""
    if t < HOOK_END: return ('one', R(seq('hokusai').raw(M.hook_idx(t))))
    for k in range(4):
        t0 = T_SW[k]; t1 = T_SW[k + 1] if k < 3 else T_REEL0
        if t0 <= t < t1:
            cur = R(seq(FOUR[k]).raw(four_idx(k, t)))
            if t < t0 + SW:
                prev = fin('hokusai') if k == 0 else fin(FOUR[k - 1]); return ('two', prev, cur, eout((t - t0) / SW, 3.2) * CH, ('sw', k))
            return ('one', cur)
    items = [fin('kandinsky')] + [fin(a) for a in REEL]; nmv = len(REEL); step = (T_REEL1 - T_REEL0) / nmv; mv = step * 0.80
    if t < T_REEL1:
        k = min(nmv - 1, int((t - T_REEL0) / step)); s = min(nmv - 1e-6, k + ease(ramp(t, T_REEL0 + k * step, T_REEL0 + k * step + mv)) ** 0.9); i = min(nmv - 1, int(s))
        return ('two', items[i], items[i + 1], (s - i) * CH, ('reel', i))
    return ('one', items[-1])
def tall(t):
    c = _pair(t)
    if c[0] == 'one': return c[1]
    n = _pair(t + 1.0 / FPS); off2 = n[3] if n[0] == 'two' and n[4] == c[4] else (CH if c[3] > CH / 2 else c[3])
    return slide(c[1], c[2], c[3], 0.5 * abs(off2 - c[3]))
KM = M.KM
def kiss(t, w, h):
    """The Kiss with the scanning light, time-lapsed, covering w x h"""
    ts = KM['ts']; u = ramp(t, T_K0 - 0.15, T_END0 + 0.1); tau = 2.0 + (ts[-1] - 3.0) * u; i = max(0, min(len(ts) - 1, int(np.searchsorted(ts, tau))))
    f = M._open(P + f'kiss/f{i:04d}.jpg')
    if i + 1 < len(ts): f = Image.blend(f, M._open(P + f'kiss/f{i + 1:04d}.jpg'), 0.5)
    fw, fh = f.size; s = max(w / fw, h / fh); bw, bh = w / s, h / s
    return f.resize((w, h), Image.LANCZOS, box=(max(0.0, (fw - bw) / 2), max(0.0, (fh - bh) / 2), min(float(fw), (fw + bw) / 2), min(float(fh), (fh + bh) / 2)))
def card(t):
    """→ (image, x0, y0): the picture on the wall at t"""
    if t < T_MORPH0: return tall(t), CX0, CY0, 0
    if t < T_K0:
        e = ease(ramp(t, T_MORPH0, T_K0)); h = int(round(CH + (KH - CH) * e)); a = tall(T_MORPH0 - 0.01).crop((0, (CH - h) // 2, CW, (CH - h) // 2 + h)); b = kiss(t, CW, h)
        return Image.blend(a, b, ease(ramp(e, 0.15, 0.85))), CX0, CYC - h // 2, 44 * e
    return kiss(t, KW, KH), CX0, CYC - KH // 2, 44

# ── the gold staff with its notes (as on the header and the search picture): a band that repeats every PER px ──
PER, BH = 1920, 640
def _staff(seed):
    random.seed(seed); F = lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', s)
    im = Image.new('RGBA', (PER, BH), (0, 0, 0, 0)); gl = Image.new('RGBA', (PER, BH), (0, 0, 0, 0)); d = ImageDraw.Draw(im); g = ImageDraw.Draw(gl)
    yc = lambda x: BH / 2 + math.sin(x / PER * 2 * math.pi * 2 + seed) * 74
    for k in range(-2, 3):
        pts = [(x, yc(x) + k * 25) for x in range(0, PER + 1, 8)]
        d.line(pts, fill=(250, 214, 130, 215), width=4); g.line(pts, fill=(255, 200, 100, 150), width=13)
    n = 7
    for i in range(n):
        x = (i + 0.3 + random.random() * 0.4) * PER / n; k = random.choice([-2, -1, 0, 1, 2]); y = yc(x) + k * 25; s = random.choice([165, 185, 205]); ch = random.choice('♪♫♪♫')
        g.text((x, y - s * 0.32), ch, font=F(s), fill=(255, 205, 110, 225), anchor='mm'); d.text((x, y - s * 0.32), ch, font=F(s), fill=(255, 238, 180, 255), anchor='mm')
    out = Image.alpha_composite(gl.filter(ImageFilter.GaussianBlur(13)), im); full = Image.new('RGBA', (2 * PER, BH), (0, 0, 0, 0)); full.paste(out, (0, 0)); full.paste(out, (PER, 0)); return full
STAFF = _staff(1.3); STAFF_Y = 1440; STAFF_W = CX0 - 6
def _ramp():
    r = np.ones(STAFF_W, np.float32); x = np.arange(STAFF_W); r *= np.clip(x / 420.0, 0, 1); r *= np.clip((STAFF_W - 30 - x) / 300.0, 0, 1); return r
SRAMP = _ramp()
V = 250.0
def _vel(t): return V * (1 - 2 * ease(ramp(t, T_MORPH0 - 0.1, T_K0 + 0.25)))       # into the painting; out of the picture once it plays as music
POS = np.concatenate([[0.0], np.cumsum([_vel(i / FPS) / FPS for i in range(int(D * FPS) + 2)])])
def staff_layer(t):
    a = ease(ramp(t, T_NOTE, T_NOTE + 0.9)) * (1 - ease(ramp(t, T_END0 - 0.25, T_END0 + 0.1)))
    if a <= 0.003: return None
    off = (-POS[int(round(t * FPS))]) % PER; band = STAFF.crop((int(off), 0, int(off) + STAFF_W, BH)); A = np.asarray(band).astype(np.float32); A[..., 3] *= SRAMP[None, :] * a
    return Image.fromarray(A.astype(np.uint8), 'RGBA')

# ── the wall: glow behind the picture, its shadow, a faint reflection on the floor ──
def _ell(w, h, blur):
    m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).ellipse((w * 0.14, h * 0.12, w * 0.86, h * 0.88), fill=255); return m.filter(ImageFilter.GaussianBlur(blur))
GW, GH = int(CW * 2.5 / 4), int(CH * 1.55 / 4); GMASK = _ell(GW, GH, 34)
VIG = None
def backdrop(img, x0, y0):
    global VIG
    fr = Image.new('RGB', (W, H), BG); w, h = img.size
    glow = ImageEnhance.Brightness(img.resize((5, 8), Image.BILINEAR).resize((GW, GH), Image.BICUBIC)).enhance(0.62)
    g = Image.new('RGB', (GW, GH), BG); g.paste(glow, (0, 0), GMASK.point(lambda v: int(v * 0.78))); g = g.resize((GW * 4, GH * 4), Image.BILINEAR)
    fr.paste(g, (x0 + w // 2 - GW * 2, CYC - GH * 2))
    if VIG is None:
        v = Image.radial_gradient('L').resize((int(W * 1.5), int(H * 1.5))); vx = (v.size[0] - W) // 2; vy = (v.size[1] - H) // 2; VIG = v.crop((vx, vy, vx + W, vy + H)).point(lambda p: int(max(0, (p - 70) * 1.25)))
    fr.paste(Image.new('RGB', (W, H), (3, 3, 6)), (0, 0), VIG)
    return fr
SH = None
def hang(fr, img, x0, y0, rad=0):
    global SH
    w, h = img.size
    sh = Image.new('L', (w + 320, h + 320), 0); ImageDraw.Draw(sh).rectangle((160, 190, 160 + w, 190 + h), fill=150); sh = sh.filter(ImageFilter.GaussianBlur(48))
    fr.paste(Image.new('RGB', sh.size, (0, 0, 0)), (x0 - 160, y0 - 160), sh)
    # the floor: the picture upside down, fading
    rh = min(290, H - (y0 + h + 10))
    if rh > 20:
        rf = ImageEnhance.Brightness(img.transpose(Image.FLIP_TOP_BOTTOM).crop((0, 0, w, rh))).enhance(0.55).filter(ImageFilter.GaussianBlur(3)); m = Image.linear_gradient('L').resize((w, rh)).transpose(Image.FLIP_TOP_BOTTOM).point(lambda v: int(v * 0.30))
        fr.paste(rf, (x0, y0 + h + 10), m)
    d = ImageDraw.Draw(fr, 'RGBA')
    if rad < 1: fr.paste(img, (x0, y0)); d.rectangle((x0 - 1, y0 - 1, x0 + w, y0 + h), outline=(255, 236, 196, 70), width=2)
    else:                                                        # the app shows a picture with rounded corners: the frame follows them
        mk_ = Image.new('L', (w * 2, h * 2), 0); ImageDraw.Draw(mk_).rounded_rectangle((0, 0, w * 2 - 1, h * 2 - 1), radius=rad * 2, fill=255); fr.paste(img, (x0, y0), mk_.resize((w, h), Image.LANCZOS))
        d.rounded_rectangle((x0 - 1, y0 - 1, x0 + w, y0 + h), radius=rad, outline=(255, 236, 196, 70), width=2)

L = lambda n: Image.open(LY + n + '.png').convert('RGBA')
TX = {k: L(k) for k in ['a', 'as', 'b', 'bs', 'c', 'cs', 'end', 'b_all'] + ['b_' + k for k in FOUR]}
TXM = json.load(open(LY + 'meta.json'))['heights']; TXX, TXY = 130, 480
def suby(key): return TXY + 60 + TXM[key] + 30 - 60     # the line under a headline: 30 px below its last line
def put(fr, layer, xy, k=1.0):
    if k <= 0.003: return
    if k < 0.999:
        layer = layer.copy(); layer.putalpha(layer.split()[3].point(lambda v: int(v * k)))
    fr.paste(layer, (int(round(xy[0])), int(round(xy[1]))), layer)

# ── the end: the wall of all the paintings, the name over it ──
WALL = None
def _wall():
    arts = ['hokusai', 'gold', 'delaunay', 'monet', 'matisse', 'mondrian', 'miro', 'kandinsky', 'wave', 'pop', 'bulge', 'kusama', 'klee', 'picasso', 'bloom', 'raffel', 'pollock', 'mitchell', 'bauhaus', 'rothko', 'spiral', 'arcs', 'lichtenstein', 'thomas']
    tw, th, gap, cols = 330, 522, 30, 12; rows = 8; period = rows * (th + gap)
    wall = Image.new('RGB', (cols * (tw + gap) + gap, period * 2), (9, 8, 13)); mask = Image.new('L', (tw * 4, th * 4), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, tw * 4 - 1, th * 4 - 1), radius=28 * 4, fill=255); mask = mask.resize((tw, th), Image.LANCZOS)
    tiles = [fin(a).resize((tw, th), Image.LANCZOS) for a in arts]
    for c in range(cols):
        yoff = -int((th + gap) * (0.5 if c % 2 else 0.0))
        for r in range(-1, rows * 2 + 1): wall.paste(tiles[(r * 5 + c * 7) % len(tiles)], (gap + c * (tw + gap), yoff + r * (th + gap)), mask)
    return wall, period
def _endshade():
    vg = Image.radial_gradient('L').resize((int(W * 1.5), int(H * 1.6))); x0 = (vg.size[0] - W) // 2; y0 = (vg.size[1] - H) // 2
    vg = vg.crop((x0, y0, x0 + W, y0 + H)).point(lambda v: int(min(215, max(0, (v - 40) * 1.5))))
    core = Image.new('L', (W, H), 0); ImageDraw.Draw(core).ellipse((560, 330, W - 560, H - 330), fill=215); core = core.filter(ImageFilter.GaussianBlur(150))
    return ImageChops.lighter(vg, core)
ENDSHADE = None
def end_frame(t):
    global WALL, ENDSHADE
    if WALL is None: WALL = _wall(); ENDSHADE = _endshade()
    wall, period = WALL; u = t - T_END0; off = (150 + 60 * u) % period; vw, vh = int(W * 1.22), int(H * 1.34)
    x0 = (wall.size[0] - vw) // 2; crop = wall.crop((x0, int(off), x0 + vw, int(off) + vh)).rotate(8, resample=Image.BICUBIC)
    cx, cy = crop.size[0] // 2, crop.size[1] // 2; fr = crop.crop((cx - W // 2, cy - H // 2, cx - W // 2 + W, cy - H // 2 + H))
    fr = ImageEnhance.Brightness(fr).enhance(0.82); fr.paste(Image.new('RGB', (W, H), (7, 6, 11)), (0, 0), ENDSHADE)
    a = ease(ramp(t, T_END0 + 0.30, T_END0 + 0.85)); put(fr, TX['end'], ((W - TX['end'].size[0]) / 2, (H - TX['end'].size[1]) / 2 + 20 + 34 * (1 - a)), a)
    return fr

def render(t):
    if t >= T_END0 + XF: return end_frame(t)
    img, x0, y0, rad = card(t); fr = backdrop(img, x0, y0)
    st = staff_layer(t)
    if st is not None: fr.paste(st, (0, STAFF_Y - BH // 2), st)
    hang(fr, img, x0, y0, rad)
    def cap(key, t_in, t_out, sub_in):
        i_ = 1.0 if t_in <= 0 else ease(ramp(t, t_in, t_in + 0.34)); o_ = 1 - ease(ramp(t, t_out, t_out + 0.26))
        put(fr, TX[key], (TXX, TXY + 30 * (1 - i_) - 20 * (1 - o_)), i_ * o_)
        s_ = ease(ramp(t, sub_in, sub_in + 0.34)); put(fr, TX[key + 's'], (TXX, suby(key) + 18 * (1 - s_) - 20 * (1 - o_)), s_ * o_)
        return i_, o_
    cap('a', 0.0, 3.70, 0.90)
    gi, go = cap('b', 4.20, 10.40, 4.80)
    keys = ['b_' + k for k in FOUR] + ['b_all']; cuts = [T_SW[1] + 0.08, T_SW[2] + 0.08, T_SW[3] + 0.08, T_REEL0 + 0.08]
    for j, key in enumerate(keys):
        a_in = 1.0 if j == 0 else ease(ramp(t, cuts[j - 1] + 0.06, cuts[j - 1] + 0.28)); a_out = 1.0 if j == len(keys) - 1 else 1 - ease(ramp(t, cuts[j], cuts[j] + 0.18))
        put(fr, TX[key], (TXX, TXY + 30 * (1 - gi) - 20 * (1 - go) + (0 if j == 0 else 46 * (1 - a_in)) - 46 * (1 - a_out)), a_in * a_out * gi * go)
    cap('c', 11.0, 14.42, 11.5)
    if t >= T_END0: fr = Image.blend(fr, end_frame(t), ease(ramp(t, T_END0, T_END0 + XF)))
    return fr

if __name__ == '__main__':
    if sys.argv[1] == 'stills':
        for s in sys.argv[2].split(','):
            t = float(s); render(t).save(P + f'sv_{LANG}_{t:05.2f}.jpg', quality=92); print('still', t, flush=True)
        sys.exit(0)
    out = sys.argv[1]; N = round(D * FPS); silent = P + '_s_' + LANG + '.mp4'
    OW = int(os.environ.get('PV_OUTW', W))            # the file for the App Store: 2400 x 1600 (PV_OUTW=2400), drawn at 2880 x 1920
    enc = ['-vf', f'scale={OW}:{OW * 2 // 3}:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-level', '5.0'] if OW != W else ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-profile:v', 'high', '-level', '5.1']
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-'] + enc + ['-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', silent], stdin=subprocess.PIPE)
    for i in range(N):
        ff.stdin.write(render(i / FPS).tobytes())
        if i % 60 == 0: print('frame', i, '/', N, flush=True)
    ff.stdin.close(); ff.wait(); print('video done', flush=True)
    aud = P + 'aud/track32.m4a'
    if os.path.exists(aud): subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-i', silent, '-i', aud, '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', out])
    else: os.replace(silent, out)
    print('done', out)
