#!/usr/bin/env python3
"""Send version PF_VER (default 1.3, with build PF_BUILD, default 398) to App Review. Checks first: the exact app, the version in PREPARE_FOR_SUBMISSION (or DEVELOPER_REJECTED after a withdrawal),
the expected build on it. Uses an empty open draft if one exists, otherwise opens one. Anything unexpected = stop, nothing sent."""
import os, sys, json, time
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
WANT = os.environ.get('PF_BUILD', '398'); VER = os.environ.get('PF_VER', '1.3')
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&filter[versionString]=' + VER + '&limit=3')
vs = j.get('data', []) if s == 200 else []
if len(vs) != 1: print('version', VER, 'not found exactly once - nothing was submitted'); sys.exit(2)
v = vs[0]; vid = v['id']; st = v['attributes'].get('appStoreState'); print('version', v['attributes'].get('versionString'), st, '| release', v['attributes'].get('releaseType'))
s, j = call('GET', f'/v1/appStoreVersions/{vid}/build'); bld = (j.get('data') or {}).get('attributes', {}).get('version'); print('build on the version:', bld)
if st not in ('PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED') or str(bld) != WANT: print('not the expected state/build - nothing was submitted'); sys.exit(3)

step('draft')
s, j = call('GET', f'/v1/reviewSubmissions?filter[app]={app}&filter[platform]=IOS&limit=20')
subs = j.get('data', []) if s == 200 else []
for d in subs: print(d['id'][:8], d['attributes'].get('state'))
busy = [d for d in subs if d['attributes'].get('state') in ('WAITING_FOR_REVIEW', 'IN_REVIEW', 'UNRESOLVED_ISSUES', 'CANCELING')]
if busy: print('another submission is in progress - nothing was submitted'); sys.exit(4)
drafts = [d for d in subs if d['attributes'].get('state') == 'READY_FOR_REVIEW']
if len(drafts) > 1: print('more than one draft - nothing was submitted'); sys.exit(5)
if drafts: sid = drafts[0]['id']
else:
    s, r = call('POST', '/v1/reviewSubmissions', {'data': {'type': 'reviewSubmissions', 'attributes': {'platform': 'IOS'}, 'relationships': {'app': {'data': {'type': 'apps', 'id': app}}}}})
    print('new draft', s, '' if s == 201 else errs(r))
    if s != 201: sys.exit(6)
    sid = r['data']['id']
s, j = call('GET', f'/v1/reviewSubmissions/{sid}/items?limit=20'); items = j.get('data', []) if s == 200 else []
print('items in the draft:', len(items))
if items: print('the draft already holds items - check it by hand; nothing was submitted'); sys.exit(7)
s, r = call('POST', '/v1/reviewSubmissionItems', {'data': {'type': 'reviewSubmissionItems', 'relationships': {'reviewSubmission': {'data': {'type': 'reviewSubmissions', 'id': sid}}, 'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': vid}}}}})
print('item', s, '' if s == 201 else errs(r))
if s != 201: print('the version could not be added - nothing was submitted'); sys.exit(8)

step('submit')
s, r = call('PATCH', '/v1/reviewSubmissions/' + sid, {'data': {'type': 'reviewSubmissions', 'id': sid, 'attributes': {'submitted': True}}})
print('submit', s, (r.get('data') or {}).get('attributes', {}).get('state') if s == 200 else errs(r))

step('after'); time.sleep(8)
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=3')
for d in j.get('data', []): print('version', d['attributes'].get('versionString'), d['attributes'].get('appStoreState'))
s, j = call('GET', f'/v1/reviewSubmissions?filter[app]={app}&filter[platform]=IOS&limit=5')
for d in j.get('data', []): print('submission', d['id'][:8], d['attributes'].get('state'), d['attributes'].get('submittedDate'))
