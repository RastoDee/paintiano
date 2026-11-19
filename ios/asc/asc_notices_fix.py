#!/usr/bin/env python3
"""Two answers to the App Store Connect notices (his "Y a", 19 Nov 2026):
1. the age rating's two new questions on the app info being prepared: shared location — no, dating and relationships — no;
2. Paintiano taken out of the mainland China storefront (AI composition would need a Chinese AI filing and a security assessment).
Hong Kong and Taiwan stay. Touches nothing else; submits nothing. Prints what Apple answers."""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']
step('age rating')
s, j = call('GET', f'/v1/apps/{app}/appInfos?limit=5')
for ai in j.get('data', []):
    st = ai['attributes'].get('state') or ai['attributes'].get('appStoreState')
    s2, r = call('GET', f"/v1/appInfos/{ai['id']}/ageRatingDeclaration"); d = r.get('data') or {}; a = d.get('attributes', {})
    if a.get('sharedLocation') is not None and a.get('datingAndRelationships') is not None: print('  ', st, 'already answered'); continue
    if st not in ('PREPARE_FOR_SUBMISSION',): print('  ', st, 'not editable, skipped'); continue
    for val in (False, 'NONE'):
        body = {'data': {'type': 'ageRatingDeclarations', 'id': d['id'], 'attributes': {'sharedLocation': val, 'datingAndRelationships': val}}}
        s3, r3 = call('PATCH', '/v1/ageRatingDeclarations/' + d['id'], body); print('  ', st, 'set', json.dumps(val), s3, '' if s3 == 200 else errs(r3))
        if s3 == 200: break
    s4, r4 = call('GET', f"/v1/appInfos/{ai['id']}/ageRatingDeclaration"); b = (r4.get('data') or {}).get('attributes', {})
    print('   now: sharedLocation', b.get('sharedLocation'), 'datingAndRelationships', b.get('datingAndRelationships'))
step('mainland China')
s, j = call('GET', f'/v1/apps/{app}/appAvailabilityV2'); av = (j.get('data') or {}).get('id'); print('availability', s, av)
nxt = f'/v2/appAvailabilities/{av}/territoryAvailabilities?limit=200&include=territory'; chn = None
while nxt and not chn:
    s, r = call('GET', nxt)
    for t in r.get('data', []):
        if ((t.get('relationships') or {}).get('territory') or {}).get('data', {}).get('id') == 'CHN': chn = t
    nxt = (r.get('links') or {}).get('next')
if not chn: print('CHN not found'); sys.exit(2)
print('CHN before', json.dumps(chn['attributes']))
if chn['attributes'].get('available'):
    s, r = call('PATCH', '/v1/territoryAvailabilities/' + chn['id'], {'data': {'type': 'territoryAvailabilities', 'id': chn['id'], 'attributes': {'available': False}}})
    print('CHN off', s, '' if s == 200 else errs(r))
s, r = call('GET', f'/v2/appAvailabilities/{av}/territoryAvailabilities?limit=200&include=territory')
nxt = f'/v2/appAvailabilities/{av}/territoryAvailabilities?limit=200&include=territory'
while nxt:
    s, r = call('GET', nxt)
    for t in r.get('data', []):
        tid = ((t.get('relationships') or {}).get('territory') or {}).get('data', {}).get('id')
        if tid in ('CHN', 'HKG', 'TWN', 'MAC'): print('  ', tid, json.dumps(t['attributes'])[:200])
    nxt = (r.get('links') or {}).get('next')
print('\nDone. Nothing was submitted for review.')
