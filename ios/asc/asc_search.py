#!/usr/bin/env python3
"""The App Store search results asset (3:2, 3840 x 2560 JPG), one per language: uploads ios/asc/search/<LANG>.jpg to the app's asset
library, waits until Apple has processed it, and places it on that language of the version being prepared (PF_VER, 1.2 by default),
replacing a search results asset placed there before. Touches nothing else; submits nothing. Prints what Apple answers."""
import os, sys, json, time, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
TYPE = 'APP_STORE_SEARCH_RESULTS_ASSET'
FILES = {'en-US': 'EN', 'sk': 'SK', 'de-DE': 'DE', 'fr-FR': 'FR', 'es-ES': 'ES', 'pt-PT': 'PT', 'zh-Hans': 'zh', 'zh-Hant': 'zhTW', 'ja': 'ja'}
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']
VER = os.environ.get('PF_VER', '1.2')
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&filter[versionString]={VER}&limit=3'); v = j['data'][0]; vid = v['id']; print('version', VER, v['attributes'].get('appStoreState'))
step('asset library'); s, j = call('GET', f'/v1/apps/{app}/assetLibrary'); lib = (j.get('data') or {}).get('id') if s == 200 else None; print('library', s, lib or errs(j))
if not lib: lib = app
def upload(code):
    data = open(os.path.join(HERE, 'search', code + '.jpg'), 'rb').read()
    s, j = call('POST', '/v1/appAssetLibraryImages', {'data': {'type': 'appAssetLibraryImages', 'attributes': {'category': 'CREATIVE_ASSETS', 'fileName': f'paintiano-search-{code}.jpg', 'fileSize': len(data), 'referenceName': f'Paintiano search {code}'}, 'relationships': {'assetLibrary': {'data': {'type': 'appAssetLibraries', 'id': lib}}}}})
    if s != 201: print('   reserve', s, errs(j)); return None
    img = j['data']['id']
    for op in j['data']['attributes'].get('uploadOperations') or []:
        part = data[op['offset']:op['offset'] + op['length']]
        req = urllib.request.Request(op['url'], data=part, method=op['method'], headers={h['name']: h['value'] for h in op.get('requestHeaders', [])})
        with urllib.request.urlopen(req, timeout=300) as r: pass
    s, j = call('PATCH', '/v1/appAssetLibraryImages/' + img, {'data': {'type': 'appAssetLibraryImages', 'id': img, 'attributes': {'uploaded': True}}})
    if s != 200: print('   commit', s, errs(j)); return None
    return img
def wait(img):
    st = None
    for _ in range(60):
        s, j = call('GET', '/v1/appAssetLibraryImages/' + img); a = (j.get('data') or {}).get('attributes', {}); st = a.get('state')
        if st not in ('AWAITING_UPLOAD', 'UPLOAD_COMPLETE', 'PROCESSING'): return st, a
        time.sleep(5)
    return st, a
step('upload')
imgs = {}
for loc, code in FILES.items():
    imgs[loc] = upload(code); print('  ', loc, code, imgs[loc], flush=True)
step('processing')
ready = {}
for loc, img in imgs.items():
    if not img: continue
    st, a = wait(img); print('  ', loc, st, a.get('specId'), json.dumps(a.get('stateDetails'))[:200], flush=True)
    if st == 'PREPARE_FOR_SUBMISSION': ready[loc] = img
step('place')
s, j = call('GET', f'/v1/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=50'); locs = j.get('data', []) if s == 200 else []
done = 0
for l in locs:
    loc = l['attributes'].get('locale'); img = ready.get(loc)
    if not img: print('  ', loc, 'no processed image, left as it is'); continue
    s, r = call('GET', f"/v1/appStoreVersionLocalizations/{l['id']}/placements?filter[placementType]={TYPE}&limit=10")
    for p in (r.get('data', []) if s == 200 else []):
        ds, dr = call('DELETE', '/v1/appAssetLibraryPlacements/' + p['id']); print('  ', loc, 'removed old', ds, '' if ds == 204 else errs(dr))
    body = lambda attrs: {'data': {'type': 'appAssetLibraryPlacements', 'attributes': attrs, 'relationships': {'appStoreVersionLocalization': {'data': {'type': 'appStoreVersionLocalizations', 'id': l['id']}}, 'image': {'data': {'type': 'appAssetLibraryImages', 'id': img}}}}}
    s, r = call('POST', '/v1/appAssetLibraryPlacements', body({'placementType': TYPE, 'placementGroup': 'DEFAULT_PROFILE'}))
    if s != 201:
        print('  ', loc, 'with group', s, errs(r)); s, r = call('POST', '/v1/appAssetLibraryPlacements', body({'placementType': TYPE}))
    print('  ', loc, 'placed', s, (r.get('data') or {}).get('attributes', {}).get('state', '') if s == 201 else errs(r)); done += s == 201
print('\nsearch results asset placed on', done, 'of', len(locs), 'languages. Nothing was submitted for review.')
