#!/usr/bin/env python3
"""Read-only: where the App Store versions and their review submissions stand. Changes nothing.
The line starting with STATUS is for a quick look: the version PF_VER (default 1.3), its state and release type."""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
VER = os.environ.get('PF_VER', '1.3')
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=4')
want = None
for d in j.get('data', []):
    a = d['attributes']; print('version', a.get('versionString'), a.get('appStoreState'), '| release', a.get('releaseType'), '| created', (a.get('createdDate') or '')[:16])
    if a.get('versionString') == VER: want = d
s, j = call('GET', f'/v1/reviewSubmissions?filter[app]={app}&filter[platform]=IOS&limit=4')
for d in j.get('data', []): a = d['attributes']; print('submission', d['id'][:8], a.get('state'), a.get('submittedDate'))
if want:
    a = want['attributes']; s, b = call('GET', f"/v1/appStoreVersions/{want['id']}/build"); bld = (b.get('data') or {}).get('attributes', {}).get('version')
    print(f"STATUS {VER} {a.get('appStoreState')} build={bld} release={a.get('releaseType')}")
else: print('STATUS', VER, 'NOT_FOUND')
