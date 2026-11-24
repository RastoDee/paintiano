#!/usr/bin/env python3
"""A language added later (es-MX) has no product page header and no search results asset of its own: this places the ones its sister
language already has (es-ES) on it, on the version being prepared (PF_VER, 1.3 by default). Nothing is uploaded — the same assets of
the library are placed once more. A language that already has such a placement is left as it is. Submits nothing."""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
FROM = {'es-MX': 'es-ES'}
TYPES = ['PRODUCT_PAGE_HEADER_ASSET', 'APP_STORE_SEARCH_RESULTS_ASSET']
VER = os.environ.get('PF_VER', '1.3')
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&filter[versionString]={VER}&limit=3')
if not j.get('data'): print('no version', VER, '- nothing changed'); sys.exit(2)
vid = j['data'][0]['id']; print('version', VER, j['data'][0]['attributes'].get('appStoreState'))
s, j = call('GET', f'/v1/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=50'); locs = {l['attributes'].get('locale'): l['id'] for l in (j.get('data') or [])}
def placements(lid, t):
    s, r = call('GET', f'/v1/appStoreVersionLocalizations/{lid}/placements?filter[placementType]={t}&include=image,video&limit=10'); return r.get('data', []) if s == 200 else []
done = 0
for dst, src in FROM.items():
    step(f'{dst} ← {src}')
    if dst not in locs or src not in locs: print('   language missing in this version'); continue
    for t in TYPES:
        if placements(locs[dst], t): print('  ', t, 'already there, left as it is'); continue
        for p in placements(locs[src], t):
            rel = p.get('relationships') or {}; img = ((rel.get('image') or {}).get('data') or {}).get('id'); vdo = ((rel.get('video') or {}).get('data') or {}).get('id')
            attrs = {'placementType': t}
            if p['attributes'].get('placementGroup'): attrs['placementGroup'] = p['attributes']['placementGroup']
            rels = {'appStoreVersionLocalization': {'data': {'type': 'appStoreVersionLocalizations', 'id': locs[dst]}}}
            if vdo: rels['video'] = {'data': {'type': 'appAssetLibraryVideos', 'id': vdo}}
            elif img: rels['image'] = {'data': {'type': 'appAssetLibraryImages', 'id': img}}
            else: print('  ', t, 'the source placement has no asset'); continue
            s, r = call('POST', '/v1/appAssetLibraryPlacements', {'data': {'type': 'appAssetLibraryPlacements', 'attributes': attrs, 'relationships': rels}})
            print('  ', t, 'video' if vdo else 'image', s, (r.get('data') or {}).get('attributes', {}).get('state', '') if s == 201 else errs(r)); done += s == 201
print('\nplaced', done, '· nothing was submitted for review.')
