#!/usr/bin/env python3
"""The App Store search results asset as a VIDEO (3:2, 2400 x 1600, 30 fps, 17 s), one per language: uploads
ios/asc/searchvideo/<LANG>.mp4 to the app's asset library, waits until Apple has processed it, and only then swaps it in for the
search results picture on that language of the version being prepared (PF_VER, 1.3 by default): the old placement is removed and the
video placed instead; if placing the video fails, the old picture goes back. es-MX gets the Spanish video. A language whose video did
not pass Apple's processing keeps its picture. Touches nothing else; submits nothing. Prints what Apple answers."""
import os, sys, json, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
TYPE = 'APP_STORE_SEARCH_RESULTS_ASSET'
FILES = {'en-US': 'EN', 'sk': 'SK', 'de-DE': 'DE', 'fr-FR': 'FR', 'es-ES': 'ES', 'es-MX': 'ES', 'pt-PT': 'PT', 'zh-Hans': 'zh', 'zh-Hant': 'zhTW', 'ja': 'ja'}
POSTER = os.environ.get('PF_POSTER', '00:00:03:12')      # 3.4 s: the finished painting beside the headline, the staff of notes flowing in
VER = os.environ.get('PF_VER', '1.3')
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&filter[versionString]={VER}&limit=3')
if not j.get('data'): print('There is no version', VER, 'in App Store Connect. Nothing was changed.'); sys.exit(2)
vid = j['data'][0]['id']; print('version', VER, j['data'][0]['attributes'].get('appStoreState'))
step('asset library'); s, j = call('GET', f'/v1/apps/{app}/assetLibrary'); lib = (j.get('data') or {}).get('id') if s == 200 else None; print('library', s, lib or errs(j))
if not lib: lib = app
def upload(code):
    data = open(os.path.join(HERE, 'searchvideo', code + '.mp4'), 'rb').read()
    s, j = call('POST', '/v1/appAssetLibraryVideos', {'data': {'type': 'appAssetLibraryVideos', 'attributes': {'category': 'CREATIVE_ASSETS', 'fileName': f'paintiano-search-{code}.mp4', 'fileSize': len(data), 'previewFrameTimeCode': POSTER, 'referenceName': f'Paintiano search video {code}'}, 'relationships': {'assetLibrary': {'data': {'type': 'appAssetLibraries', 'id': lib}}}}})
    if s != 201: print('   reserve', s, errs(j)); return None
    v = j['data']['id']; ops = j['data']['attributes'].get('uploadOperations') or []
    def put(op):
        part = data[op['offset']:op['offset'] + op['length']]; err = ''
        for attempt in range(3):
            try:
                req = urllib.request.Request(op['url'], data=part, method=op['method'], headers={h['name']: h['value'] for h in op.get('requestHeaders', [])})
                with urllib.request.urlopen(req, timeout=300) as r: return r.status
            except Exception as e:
                err = str(e); time.sleep(3)
        return 'failed ' + err
    with ThreadPoolExecutor(6) as ex: res = list(ex.map(put, ops))
    bad = [r for r in res if r not in (200, 201, 204)]
    if bad: print('   parts failed', bad[:2]); return None
    s, j = call('PATCH', '/v1/appAssetLibraryVideos/' + v, {'data': {'type': 'appAssetLibraryVideos', 'id': v, 'attributes': {'uploaded': True}}})
    if s != 200: print('   commit', s, errs(j)); return None
    print('  ', code, v, 'parts', len(ops), 'bytes', len(data), flush=True); return v
step('upload')
vids = {code: upload(code) for code in sorted(set(FILES.values()))}
step('processing')
ready = {}; t0 = time.time(); pend = {c: v for c, v in vids.items() if v}
while pend and time.time() - t0 < 900:
    for code, v in list(pend.items()):
        s, j = call('GET', '/v1/appAssetLibraryVideos/' + v); a = (j.get('data') or {}).get('attributes', {}); st = a.get('state')
        if st in ('AWAITING_UPLOAD', 'UPLOAD_COMPLETE', 'PROCESSING'): continue
        print('  ', code, st, 'spec', a.get('specId'), json.dumps(a.get('stateDetails'))[:300], flush=True); pend.pop(code)
        if st == 'PREPARE_FOR_SUBMISSION': ready[code] = v
    if pend: print('   waiting for', len(pend), '…', int(time.time() - t0), 's', flush=True); time.sleep(10)
for code in pend: print('  ', code, 'still not processed after 15 minutes; its picture stays')
step('swap the search results asset on every language')
s, j = call('GET', f'/v1/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=50'); locs = j.get('data', []) if s == 200 else []
done = 0
for l in locs:
    loc = l['attributes'].get('locale'); code = FILES.get(loc); v = ready.get(code)
    if not code: print('  ', loc, 'has no video of its own (it shows the default one)'); continue
    if not v: print('  ', loc, 'no processed video, left as it is'); continue
    s, r = call('GET', f"/v1/appStoreVersionLocalizations/{l['id']}/placements?filter[placementType]={TYPE}&include=image,video&limit=10"); old = r.get('data', []) if s == 200 else []
    keep = []
    for p in old:
        rel = p.get('relationships') or {}; img = ((rel.get('image') or {}).get('data') or {}).get('id'); ov = ((rel.get('video') or {}).get('data') or {}).get('id')
        keep.append((p['attributes'].get('placementGroup'), img, ov))
        ds, dr = call('DELETE', '/v1/appAssetLibraryPlacements/' + p['id']); print('  ', loc, 'removed the old', 'video' if ov else 'picture', ds, '' if ds == 204 else errs(dr))
    group = keep[0][0] if keep else 'DEFAULT_PROFILE'
    def place(attrs, kind, i): return call('POST', '/v1/appAssetLibraryPlacements', {'data': {'type': 'appAssetLibraryPlacements', 'attributes': attrs, 'relationships': {'appStoreVersionLocalization': {'data': {'type': 'appStoreVersionLocalizations', 'id': l['id']}}, kind: {'data': {'type': 'appAssetLibraryVideos' if kind == 'video' else 'appAssetLibraryImages', 'id': i}}}}})
    s, r = place({'placementType': TYPE, 'placementGroup': group}, 'video', v)
    if s != 201:
        print('  ', loc, 'with group', s, errs(r)); s, r = place({'placementType': TYPE}, 'video', v)
    print('  ', loc, code, 'video', s, (r.get('data') or {}).get('attributes', {}).get('state', '') if s == 201 else errs(r), flush=True); done += s == 201
    if s != 201:
        for g, img, ov in keep:
            a2 = {'placementType': TYPE}
            if g: a2['placementGroup'] = g
            rs, rr = place(a2, 'video' if ov else 'image', ov or img) if (ov or img) else (0, {})
            print('  ', loc, 'the old one put back', rs, '' if rs == 201 else errs(rr))
step('the frame shown before it plays')
time.sleep(20)
for code, v in ready.items():
    s, j = call('GET', '/v1/appAssetLibraryVideos/' + v); a = (j.get('data') or {}).get('attributes', {}); pf = a.get('previewFrameImage') or {}
    print('  ', code, a.get('previewFrameTimeCode'), json.dumps(pf.get('state'))[:200])
want = len([l for l in locs if FILES.get(l['attributes'].get('locale'))])
print(f'\nsearch results video placed on {done} of {want} languages. Nothing was submitted for review.')
sys.exit(0 if done == want and done else 5)
