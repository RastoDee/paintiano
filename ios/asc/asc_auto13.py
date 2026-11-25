#!/usr/bin/env python3
"""Version PF_VER (default 1.3): release it automatically as soon as Apple approves it (release type AFTER_APPROVAL), on the owner's word.
Changes nothing else; prints the state and the release type before and after."""
import os, sys, json, time
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
VER = os.environ.get('PF_VER', '1.3')
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&filter[versionString]=' + VER + '&limit=3')
vs = j.get('data', []) if s == 200 else []
if len(vs) != 1: print('version', VER, 'not found exactly once - nothing was changed'); sys.exit(2)
v = vs[0]; vid = v['id']; print('version', VER, v['attributes'].get('appStoreState'), '| release type', v['attributes'].get('releaseType'))
if v['attributes'].get('releaseType') == 'AFTER_APPROVAL': print('already released automatically after approval - nothing to change'); sys.exit(0)
step('release type')
s, r = call('PATCH', '/v1/appStoreVersions/' + vid, {'data': {'type': 'appStoreVersions', 'id': vid, 'attributes': {'releaseType': 'AFTER_APPROVAL'}}})
print('patch', s, 'ok' if s == 200 else errs(r))
step('after'); time.sleep(3)
s, j = call('GET', f'/v1/appStoreVersions/{vid}'); a = (j.get('data') or {}).get('attributes', {})
print('version', VER, a.get('appStoreState'), '| release type', a.get('releaseType'))
if a.get('releaseType') != 'AFTER_APPROVAL': sys.exit(4)
