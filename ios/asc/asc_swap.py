#!/usr/bin/env python3
"""Swap the build of the version that waits for review: withdraw the submission, attach the newest build.
The owner re-adds the items and submits in App Store Connect. Stops without touching anything if the review has begun."""
import os, sys, json, time
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
MIN_BUILD = int(os.environ.get('PF_MIN_BUILD', '31'))
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = j['data'][0]['id']

step('newest build')
good = None
for _ in range(60):
    s, j = call('GET', f'/v1/builds?filter[app]={app}&sort=-uploadedDate&limit=3')
    top = j['data'][0] if s == 200 and j.get('data') else None
    if top and int(top['attributes'].get('version') or 0) >= MIN_BUILD and top['attributes'].get('processingState') == 'VALID': good = top; break
    print('waiting:', top and (top['attributes'].get('version'), top['attributes'].get('processingState')), flush=True); time.sleep(20)
if not good: print('the new build is not ready; nothing was changed'); sys.exit(1)
print('build', good['attributes'].get('version'), 'VALID')

step('submission')
s, j = call('GET', f'/v1/reviewSubmissions?filter[app]={app}&filter[platform]=IOS&limit=10')
subs = j.get('data', []) if s == 200 else []
for d in subs: print(d['id'], d['attributes'].get('state'), d['attributes'].get('submittedDate'))
live = [d for d in subs if d['attributes'].get('state') in ('WAITING_FOR_REVIEW', 'IN_REVIEW', 'UNRESOLVED_ISSUES')]
if any(d['attributes'].get('state') != 'WAITING_FOR_REVIEW' for d in live):
    print('the review has already begun; nothing was changed'); sys.exit(2)
for d in live:
    s, r = call('PATCH', '/v1/reviewSubmissions/' + d['id'], {'data': {'type': 'reviewSubmissions', 'id': d['id'], 'attributes': {'canceled': True}}})
    print('withdraw', d['id'], s, (r.get('data') or {}).get('attributes', {}).get('state') if s == 200 else errs(r))

step('version and build')
vid = None
for _ in range(30):
    s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=3'); v = j['data'][0]; vid = v['id']; st = v['attributes'].get('appStoreState')
    print('version state', st, flush=True)
    if st in ('PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'READY_FOR_REVIEW'): break
    time.sleep(10)
for _ in range(6):
    s, r = call('PATCH', f'/v1/appStoreVersions/{vid}/relationships/build', {'data': {'type': 'builds', 'id': good['id']}})
    print('attach build', good['attributes'].get('version'), s, '' if s in (200, 204) else errs(r))
    if s in (200, 204): break
    time.sleep(15)

step('after')
s, j = call('GET', f'/v1/appStoreVersions/{vid}/build'); print('build on the version:', (j.get('data') or {}).get('attributes', {}).get('version'))
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=3'); print('version state:', j['data'][0]['attributes'].get('appStoreState'))
s, j = call('GET', f'/v1/apps/{app}/inAppPurchasesV2?limit=50')
for d in j.get('data', []): print(d['attributes']['productId'], '|', d['attributes'].get('state'))
s, j = call('GET', f'/v1/reviewSubmissions?filter[app]={app}&filter[platform]=IOS&limit=10')
for d in j.get('data', []): print('submission', d['id'][:8], d['attributes'].get('state'))
