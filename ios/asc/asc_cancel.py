#!/usr/bin/env python3
"""Take the version that is waiting for (or in) App Review back out of review — nothing else is touched. Stops if there is not exactly one such submission."""
import os, sys, json, time
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=3')
for d in j.get('data', []): print('version', d['attributes'].get('versionString'), d['attributes'].get('appStoreState'))
step('submission')
s, j = call('GET', f'/v1/reviewSubmissions?filter[app]={app}&filter[platform]=IOS&limit=10')
subs = j.get('data', []) if s == 200 else []
for d in subs: print(d['id'][:8], d['attributes'].get('state'), d['attributes'].get('submittedDate'))
live = [d for d in subs if d['attributes'].get('state') in ('WAITING_FOR_REVIEW', 'IN_REVIEW')]
if len(live) != 1: print('expected one submission in review, found', len(live), '- nothing was changed'); sys.exit(2)
sid = live[0]['id']
step('cancel')
s, r = call('PATCH', '/v1/reviewSubmissions/' + sid, {'data': {'type': 'reviewSubmissions', 'id': sid, 'attributes': {'canceled': True}}})
print('cancel', s, (r.get('data') or {}).get('attributes', {}).get('state') if s == 200 else errs(r))
step('after'); time.sleep(10)
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=3')
for d in j.get('data', []): print('version', d['attributes'].get('versionString'), d['attributes'].get('appStoreState'))
s, j = call('GET', f'/v1/reviewSubmissions?filter[app]={app}&filter[platform]=IOS&limit=5')
for d in j.get('data', []): print('submission', d['id'][:8], d['attributes'].get('state'))
