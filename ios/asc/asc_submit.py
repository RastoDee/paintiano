#!/usr/bin/env python3
"""Submit the draft review submission that App Store Connect already holds (the version and the items added there by the owner).
Stops without submitting unless there is exactly one draft, with the version and two more items in it."""
import os, sys, json, time
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = j['data'][0]['id']
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=3'); v = j['data'][0]; vid = v['id']
print('version', v['attributes'].get('versionString'), v['attributes'].get('appStoreState'))
s, j = call('GET', f'/v1/appStoreVersions/{vid}/build'); bld = (j.get('data') or {}).get('attributes', {}).get('version'); print('build on the version:', bld)

step('draft')
s, j = call('GET', f'/v1/reviewSubmissions?filter[app]={app}&filter[platform]=IOS&limit=10')
subs = j.get('data', []) if s == 200 else []
for d in subs: print(d['id'][:8], d['attributes'].get('state'))
drafts = [d for d in subs if d['attributes'].get('state') == 'READY_FOR_REVIEW']
if len(drafts) != 1: print('expected one draft, found', len(drafts), '- nothing was submitted'); sys.exit(2)
sid = drafts[0]['id']
s, j = call('GET', f'/v1/reviewSubmissions/{sid}/items?limit=20')
items = j.get('data', []) if s == 200 else []
kinds = []
for it in items:
    rel = it.get('relationships', {}); k = [n for n, r in rel.items() if isinstance(r, dict) and r.get('data')]
    kinds.append(','.join(k) or '?'); print('item', it['id'][:8], it['attributes'].get('state'), k)
print('items:', len(items), '| raw', s)
if len(items) != 3 or str(bld) != os.environ.get('PF_BUILD', '43'):
    print('the draft is not the expected one (3 items, build', os.environ.get('PF_BUILD', '43'), ') - nothing was submitted'); sys.exit(3)

step('submit')
s, r = call('PATCH', '/v1/reviewSubmissions/' + sid, {'data': {'type': 'reviewSubmissions', 'id': sid, 'attributes': {'submitted': True}}})
print('submit', s, (r.get('data') or {}).get('attributes', {}).get('state') if s == 200 else errs(r))

step('after'); time.sleep(8)
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=3'); print('version state:', j['data'][0]['attributes'].get('appStoreState'))
s, j = call('GET', f'/v1/apps/{app}/inAppPurchasesV2?limit=50')
for d in j.get('data', []): print(d['attributes']['productId'], '|', d['attributes'].get('state'))
s, j = call('GET', f'/v1/reviewSubmissions?filter[app]={app}&filter[platform]=IOS&limit=10')
for d in j.get('data', []): print('submission', d['id'][:8], d['attributes'].get('state'), d['attributes'].get('submittedDate'))
