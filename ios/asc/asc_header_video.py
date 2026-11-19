#!/usr/bin/env python3
"""The product page header as a VIDEO (App Store, iOS 27+): uploads ios/asc/header.mp4 (3840 x 1646, 30 fps, 28 s, loops) to the app's
asset library, waits until Apple has processed it, and only then swaps it in as the header on every language of the version being
prepared (PF_VER, 1.2 by default): the old header placement is removed and the video placed instead; if placing the video fails,
the old image goes back. Touches nothing else; submits nothing. Prints what Apple answers."""
import os, sys, json, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
FILE = os.path.join(HERE, 'header.mp4'); data = open(FILE, 'rb').read(); TYPE = 'PRODUCT_PAGE_HEADER_ASSET'
POSTER = os.environ.get('PF_POSTER', '00:00:00:09')      # the frame shown before it plays: Klimt in the middle, the gallery around it
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']
VER = os.environ.get('PF_VER', '1.2')
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&filter[versionString]={VER}&limit=3'); v = j['data'][0]; vid = v['id']; print('version', VER, v['attributes'].get('appStoreState'))
step('asset library'); s, j = call('GET', f'/v1/apps/{app}/assetLibrary'); lib = (j.get('data') or {}).get('id') if s == 200 else None; print('library', s, lib or errs(j))
if not lib: lib = app
step('what Apple accepts for a header video')
s, j = call('GET', '/v1/appAssetLibraryRefData'); print('refdata', s, '' if s == 200 else errs(j))
def walk(o, out):
    if isinstance(o, dict):
        if TYPE in json.dumps(o)[:4000] and ('videoSpecs' in o or 'frameRates' in o or 'dimensions' in o or 'placementGroups' in o or 'groupLimits' in o):
            out.append(o)
        for x in o.values(): walk(x, out)
    elif isinstance(o, list):
        for x in o: walk(x, out)
seen = set()
if s == 200:
    hits = []; walk(j, hits)
    for h in hits:
        t = json.dumps(h)
        if t[:300] in seen: continue
        seen.add(t[:300]); print('  ', t[:900])
step('reserve'); s, j = call('POST', '/v1/appAssetLibraryVideos', {'data': {'type': 'appAssetLibraryVideos', 'attributes': {'category': 'CREATIVE_ASSETS', 'fileName': 'paintiano-header.mp4', 'fileSize': len(data), 'previewFrameTimeCode': POSTER, 'referenceName': 'Paintiano header video'}, 'relationships': {'assetLibrary': {'data': {'type': 'appAssetLibraries', 'id': lib}}}}})
print('reserve', s, '' if s == 201 else errs(j))
if s != 201: sys.exit(2)
vidid = j['data']['id']; ops = j['data']['attributes'].get('uploadOperations') or []; print('video', vidid, 'parts', len(ops), 'bytes', len(data))
step('upload')
def put(op):
    part = data[op['offset']:op['offset'] + op['length']]
    for attempt in range(3):
        try:
            req = urllib.request.Request(op['url'], data=part, method=op['method'], headers={h['name']: h['value'] for h in op.get('requestHeaders', [])})
            with urllib.request.urlopen(req, timeout=300) as r: return op['offset'], r.status
        except Exception as e:
            err = str(e); time.sleep(3)
    return op['offset'], 'failed ' + err
with ThreadPoolExecutor(8) as ex:
    res = list(ex.map(put, ops))
bad = [r for r in res if r[1] not in (200, 201, 204)]
print('parts ok', len(res) - len(bad), 'of', len(res), bad[:3])
if bad: sys.exit(3)
s, j = call('PATCH', '/v1/appAssetLibraryVideos/' + vidid, {'data': {'type': 'appAssetLibraryVideos', 'id': vidid, 'attributes': {'uploaded': True}}}); print('commit', s, '' if s == 200 else errs(j))
if s != 200: sys.exit(3)
step('processing')
st = None
for _ in range(120):
    s, j = call('GET', '/v1/appAssetLibraryVideos/' + vidid); a = (j.get('data') or {}).get('attributes', {}); st = a.get('state') or a.get('assetDeliveryState')
    print('state', json.dumps(st)[:120], 'spec', a.get('specId'), json.dumps(a.get('stateDetails'))[:300], flush=True)
    if st not in ('AWAITING_UPLOAD', 'UPLOAD_COMPLETE', 'PROCESSING'): break
    time.sleep(10)
if st != 'PREPARE_FOR_SUBMISSION':
    print('\nThe video did not pass Apple processing (state', st, '); the old header stays where it is. Nothing was changed.'); sys.exit(4)
print('poster', json.dumps(a.get('previewFrameImage'))[:300])
step('swap the header on every language')
s, j = call('GET', f'/v1/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=50'); locs = j.get('data', []) if s == 200 else []
done = 0
for l in locs:
    loc = l['attributes'].get('locale')
    s, r = call('GET', f"/v1/appStoreVersionLocalizations/{l['id']}/placements?filter[placementType]={TYPE}&include=image,video&limit=10")
    old = r.get('data', []) if s == 200 else []
    if any(((p.get('relationships') or {}).get('video') or {}).get('data', {}) and p['relationships']['video']['data'].get('id') == vidid for p in old):
        print('  ', loc, 'already has this video'); done += 1; continue
    keep = []
    for p in old:
        img = (((p.get('relationships') or {}).get('image') or {}).get('data') or {}).get('id')
        keep.append((p['attributes'].get('placementGroup'), img))
        ds, dr = call('DELETE', '/v1/appAssetLibraryPlacements/' + p['id']); print('  ', loc, 'removed old header', p['attributes'].get('mediaType'), ds, '' if ds == 204 else errs(dr))
    group = keep[0][0] if keep else None
    attrs = {'placementType': TYPE}
    if group: attrs['placementGroup'] = group
    s, r = call('POST', '/v1/appAssetLibraryPlacements', {'data': {'type': 'appAssetLibraryPlacements', 'attributes': attrs, 'relationships': {'appStoreVersionLocalization': {'data': {'type': 'appStoreVersionLocalizations', 'id': l['id']}}, 'video': {'data': {'type': 'appAssetLibraryVideos', 'id': vidid}}}}})
    print('  ', loc, 'video', s, (r.get('data') or {}).get('attributes', {}).get('state', '') if s == 201 else errs(r)); done += s == 201
    if s != 201:
        for g, img in keep:
            if not img: continue
            a2 = {'placementType': TYPE}
            if g: a2['placementGroup'] = g
            rs, rr = call('POST', '/v1/appAssetLibraryPlacements', {'data': {'type': 'appAssetLibraryPlacements', 'attributes': a2, 'relationships': {'appStoreVersionLocalization': {'data': {'type': 'appStoreVersionLocalizations', 'id': l['id']}}, 'image': {'data': {'type': 'appAssetLibraryImages', 'id': img}}}}})
            print('  ', loc, 'old image put back', rs, '' if rs == 201 else errs(rr))
print('\nheader video placed on', done, 'of', len(locs), 'languages. Nothing was submitted for review.')
