#!/usr/bin/env python3
"""Read only: what the App Store Connect notices touch — the age rating declaration (any unanswered fields) and whether the app is
offered in mainland China. Changes nothing."""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']
step('age rating')
s, j = call('GET', f'/v1/apps/{app}/appInfos?limit=5')
for ai in j.get('data', []):
    print('appInfo', ai['id'], ai['attributes'].get('state') or ai['attributes'].get('appStoreState'))
    s2, r = call('GET', f"/v1/appInfos/{ai['id']}/ageRatingDeclaration"); a = (r.get('data') or {}).get('attributes', {})
    print('  ', s2, json.dumps(a)[:1500])
    print('   unanswered:', [k for k, v in a.items() if v is None])
step('mainland China')
s, j = call('GET', f'/v1/apps/{app}/appAvailabilityV2'); print('availability', s, '' if s == 200 else errs(j))
av = (j.get('data') or {}).get('id')
if av:
    nxt = f'/v2/appAvailabilities/{av}/territoryAvailabilities?limit=200&include=territory'
    while nxt:
        s, r = call('GET', nxt)
        for t in r.get('data', []):
            tid = ((t.get('relationships') or {}).get('territory') or {}).get('data', {}).get('id')
            if tid in ('CHN', 'HKG', 'TWN', 'USA', 'SVK'): print('  ', tid, json.dumps(t['attributes'])[:300])
        nxt = (r.get('links') or {}).get('next')
