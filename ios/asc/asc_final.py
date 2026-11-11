#!/usr/bin/env python3
"""Before submission: content rights, the app's price (free), the newest build. Idempotent. Submits nothing."""
import os, sys, json, time
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); a = j['data'][0]; app = a['id']
print('content rights now:', a['attributes'].get('contentRightsDeclaration'))
if a['attributes'].get('contentRightsDeclaration') != 'USES_THIRD_PARTY_CONTENT':
    s, j = call('PATCH', '/v1/apps/' + app, {'data': {'type': 'apps', 'id': app, 'attributes': {'contentRightsDeclaration': 'USES_THIRD_PARTY_CONTENT'}}})
    print('content rights -> USES_THIRD_PARTY_CONTENT', s, '' if s == 200 else errs(j))

step('app price: free')
s, j = call('GET', f'/v1/appPriceSchedules/{app}/manualPrices?include=appPricePoint&limit=10')
have = [(i.get('attributes') or {}).get('customerPrice') for i in j.get('included', []) if i['type'] == 'appPricePoints'] if s == 200 else []
print('manual prices now:', have, '| rows', len(j.get('data', [])) if s == 200 else s)
if not (s == 200 and j.get('data')):
    for terr in ('USA', 'SVK'):
        s, j = call('GET', f'/v1/apps/{app}/appPricePoints?filter[territory]={terr}&limit=200')
        pts = j.get('data', []) if s == 200 else []
        pp = next((d for d in pts if float(d['attributes'].get('customerPrice') or 1) == 0.0), None)
        print(terr, 'points', s, len(pts), 'free:', pp and pp['attributes'])
        if not pp: continue
        s, j = call('POST', '/v1/appPriceSchedules', {'data': {'type': 'appPriceSchedules', 'relationships': {
            'app': {'data': {'type': 'apps', 'id': app}}, 'baseTerritory': {'data': {'type': 'territories', 'id': terr}},
            'manualPrices': {'data': [{'type': 'appPrices', 'id': '${p1}'}]}}},
            'included': [{'type': 'appPrices', 'id': '${p1}', 'attributes': {'startDate': None}, 'relationships': {'appPricePoint': {'data': {'type': 'appPricePoints', 'id': pp['id']}}}}]})
        print('schedule', s, '' if s == 201 else errs(j))
        if s == 201: break
    s, j = call('GET', f'/v1/appPriceSchedules/{app}/manualPrices?include=appPricePoint&limit=10')
    print('manual prices after:', [(i.get('attributes') or {}).get('customerPrice') for i in j.get('included', []) if i['type'] == 'appPricePoints'] if s == 200 else s)

step('build')
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=3'); vid = j['data'][0]['id']; print('version', j['data'][0]['attributes'].get('versionString'), j['data'][0]['attributes'].get('appStoreState'))
s, j = call('GET', f'/v1/builds?filter[app]={app}&sort=-uploadedDate&limit=4')
for _ in range(45):
    if not j['data'] or j['data'][0]['attributes'].get('processingState') != 'PROCESSING': break
    time.sleep(20); s, j = call('GET', f'/v1/builds?filter[app]={app}&sort=-uploadedDate&limit=4')
for d in j['data']: print(d['attributes'].get('version'), d['attributes'].get('processingState'), d['attributes'].get('uploadedDate'))
good = next((d for d in j['data'] if d['attributes'].get('processingState') == 'VALID' and not d['attributes'].get('expired')), None)
if good:
    s, j = call('PATCH', f'/v1/appStoreVersions/{vid}/relationships/build', {'data': {'type': 'builds', 'id': good['id']}})
    print('attached build', good['attributes'].get('version'), s, '' if s in (200, 204) else errs(j))

step('summary')
s, j = call('GET', '/v1/apps/' + app); print('content rights:', j['data']['attributes'].get('contentRightsDeclaration'))
s, j = call('GET', f'/v1/appStoreVersions/{vid}/build'); print('build on the version:', (j.get('data') or {}).get('attributes', {}).get('version'))
s, j = call('GET', f'/v1/apps/{app}/inAppPurchasesV2?limit=50')
for d in j.get('data', []): print(d['attributes']['productId'], '|', d['attributes'].get('inAppPurchaseType'), '|', d['attributes'].get('state'))
