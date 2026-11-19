#!/usr/bin/env python3
"""The product page header (App Store, iOS 27+): uploads ios/asc/header.png (3840 x 1646, no alpha) to the app's asset library and
places it as the header on every language of the version being prepared (PF_VER, 1.2 by default; 1.1 was locked in review). Touches nothing else; submits nothing. Prints what Apple answers."""
import os, sys, json, time, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
FILE = os.path.join(HERE, 'header.png'); data = open(FILE, 'rb').read(); TYPE = 'PRODUCT_PAGE_HEADER_ASSET'
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']
VER = os.environ.get('PF_VER', '1.2')
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&filter[versionString]={VER}&limit=3'); v = j['data'][0]; vid = v['id']; print('version', VER, v['attributes'].get('appStoreState'))
step('asset library'); s, j = call('GET', f'/v1/apps/{app}/assetLibrary'); lib = (j.get('data') or {}).get('id') if s == 200 else None; print('library', s, lib or errs(j))
if not lib: lib = app
step('reserve'); s, j = call('POST', '/v1/appAssetLibraryImages', {'data': {'type': 'appAssetLibraryImages', 'attributes': {'category': 'CREATIVE_ASSETS', 'fileName': 'paintiano-header.png', 'fileSize': len(data)}, 'relationships': {'assetLibrary': {'data': {'type': 'appAssetLibraries', 'id': lib}}}}})
print('reserve', s, '' if s == 201 else errs(j))
if s != 201: sys.exit(2)
img = j['data']['id']; ops = j['data']['attributes'].get('uploadOperations') or []; print('image', img, 'parts', len(ops))
step('upload')
for op in ops:
    part = data[op['offset']:op['offset'] + op['length']]
    req = urllib.request.Request(op['url'], data=part, method=op['method'], headers={h['name']: h['value'] for h in op.get('requestHeaders', [])})
    with urllib.request.urlopen(req, timeout=300) as r: print('part', op['offset'], r.status)
s, j = call('PATCH', '/v1/appAssetLibraryImages/' + img, {'data': {'type': 'appAssetLibraryImages', 'id': img, 'attributes': {'uploaded': True}}}); print('commit', s, '' if s == 200 else errs(j))
if s != 200: sys.exit(3)
st = None
for _ in range(40):
    s, j = call('GET', '/v1/appAssetLibraryImages/' + img); a = (j.get('data') or {}).get('attributes', {}); st = a.get('state') or a.get('assetDeliveryState'); print('state', json.dumps(st)[:200], flush=True)
    if 'AWAITING_UPLOAD' not in json.dumps(st) and 'UPLOAD_COMPLETE' not in json.dumps(st): break
    time.sleep(6)
step('place')
s, j = call('GET', f'/v1/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=50'); locs = j.get('data', []) if s == 200 else []
done = 0
for l in locs:
    loc = l['attributes'].get('locale')
    s, r = call('POST', '/v1/appAssetLibraryPlacements', {'data': {'type': 'appAssetLibraryPlacements', 'attributes': {'placementType': TYPE}, 'relationships': {'appStoreVersionLocalization': {'data': {'type': 'appStoreVersionLocalizations', 'id': l['id']}}, 'image': {'data': {'type': 'appAssetLibraryImages', 'id': img}}}}})
    print('  ', loc, s, (r.get('data') or {}).get('attributes', {}).get('state', '') if s == 201 else errs(r)); done += s == 201
print('\nheader placed on', done, 'of', len(locs), 'languages. Nothing was submitted for review.')
