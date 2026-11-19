#!/usr/bin/env python3
"""Read only: prints what Apple accepts for the search results asset (and the header) — specs, placement groups, limits — and what is
placed on version PF_VER now. Changes nothing."""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
WANT = ('APP_STORE_SEARCH_RESULTS_ASSET', 'PRODUCT_PAGE_HEADER_ASSET')
step('refdata'); s, j = call('GET', '/v1/appAssetLibraryRefData'); print('refdata', s, '' if s == 200 else errs(j))
def walk(o, path=''):
    if isinstance(o, dict):
        if 'specId' in o and any(w in (o.get('compatiblePlacementTypes') or []) for w in WANT): print('SPEC', json.dumps(o))
        if o.get('placementType') in WANT: print('POLICY', path[-60:], json.dumps(o))
        for k, x in o.items(): walk(x, path + '/' + (o.get('featureId') or k))
    elif isinstance(o, list):
        for x in o: walk(x, path)
if s == 200: walk(j)
step('placements now')
s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']
VER = os.environ.get('PF_VER', '1.2')
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&filter[versionString]={VER}&limit=3'); vid = j['data'][0]['id']
s, j = call('GET', f'/v1/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=50')
for l in j.get('data', []):
    s, r = call('GET', f"/v1/appStoreVersionLocalizations/{l['id']}/placements?limit=50")
    kinds = {}
    for p in r.get('data', []): k = (p['attributes'].get('placementType'), p['attributes'].get('mediaType')); kinds[k] = kinds.get(k, 0) + 1
    print('  ', l['attributes'].get('locale'), s, {f'{a}/{b}': n for (a, b), n in kinds.items()})
