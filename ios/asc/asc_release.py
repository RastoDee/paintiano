#!/usr/bin/env python3
"""Release the approved version to the App Store (manual release).
Stops without releasing unless the version waits for the developer's release, carries the expected build and both purchases are approved."""
import os, sys, json, time
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = j['data'][0]['id']
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=3'); v = j['data'][0]; vid = v['id']
state = v['attributes'].get('appStoreState')
print('version', v['attributes'].get('versionString'), state, '| release type', v['attributes'].get('releaseType'))
s, j = call('GET', f'/v1/appStoreVersions/{vid}/build'); bld = (j.get('data') or {}).get('attributes', {}).get('version'); print('build on the version:', bld)

step('purchases')
s, j = call('GET', f'/v1/apps/{app}/inAppPurchasesV2?limit=50')
iaps = {d['attributes']['productId']: d['attributes'].get('state') for d in j.get('data', [])}
for k, st in iaps.items(): print(k, '|', st)
want = ['app.paintiano.pro', 'app.paintiano.aipass12m']
if state != 'PENDING_DEVELOPER_RELEASE' or str(bld) != os.environ.get('PF_BUILD', '43') or any(iaps.get(k) != 'APPROVED' for k in want):
    print('not as expected (version waiting for release, build', os.environ.get('PF_BUILD', '43'), ', both purchases APPROVED) - nothing was released'); sys.exit(3)

step('release')
s, r = call('POST', '/v1/appStoreVersionReleaseRequests', {'data': {'type': 'appStoreVersionReleaseRequests', 'relationships': {'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': vid}}}}})
print('release', s, 'ok' if s in (200, 201) else errs(r))
if s not in (200, 201): sys.exit(4)

step('after'); time.sleep(10)
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=3'); print('version state:', j['data'][0]['attributes'].get('appStoreState'))
s, j = call('GET', f'/v1/apps/{app}/inAppPurchasesV2?limit=50')
for d in j.get('data', []): print(d['attributes']['productId'], '|', d['attributes'].get('state'))
