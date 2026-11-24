# How much each chord changes the visible picture (below the headline's shade, above the chrome): the cumulative curve per painter → pace.json
import json, glob, os, numpy as np
from PIL import Image
P = os.path.dirname(os.path.abspath(__file__)) + '/'
out = {}
for d in sorted(glob.glob(P + 'tl_*/')):
    name = d.rstrip('/').split('tl_')[-1]; m = json.load(open(d + 'meta.json')); idxs = m['idxs']; prev = None; cum = [0.0]
    for i in range(len(idxs)):
        im = Image.open(f'{d}f{i:04d}.jpg').convert('RGB'); w, h = im.size
        a = np.asarray(im.crop((int(w * .135), int(h * .22), int(w * .865), int(h * .86))).resize((110, 190), Image.BILINEAR), dtype=np.float32)
        if prev is not None: cum.append(cum[-1] + float(np.abs(a - prev).mean()))
        prev = a
    out[name] = {'idxs': idxs, 'cum': cum}; tot = cum[-1]
    q = [idxs[next(i for i, c in enumerate(cum) if c >= tot * f)] for f in (.1, .25, .5, .75, .9)]
    print(name, 'first chord share %.2f' % (cum[1] / tot), 'idx at 10/25/50/75/90 % of the change:', q)
json.dump(out, open(P + 'pace.json', 'w'))
