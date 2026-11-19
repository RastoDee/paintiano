#!/usr/bin/env python3
"""Version 1.2 in App Store Connect (the next one after 1.1): makes it if it is not there (manual release), puts in "What's New" in every language,
the review notes, and attaches the newest valid 1.1 build if one is there. Submits nothing. Idempotent."""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
VER = os.environ.get('PF_VER', '1.2'); META = os.path.join(HERE, '..', 'fastlane', 'metadata')
NOTES_TXT = open(os.path.join(HERE, 'review-notes.txt'), encoding='utf-8').read().strip()
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']; print('app', app)
step('version ' + VER)
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=10'); vs = j.get('data', []) if s == 200 else []
for w in vs: print('  ', w['attributes'].get('versionString'), w['attributes'].get('appStoreState'))
v = next((w for w in vs if w['attributes'].get('versionString') == VER), None)
if not v:
    s, j = call('POST', '/v1/appStoreVersions', {'data': {'type': 'appStoreVersions', 'attributes': {'platform': 'IOS', 'versionString': VER, 'releaseType': 'MANUAL'}, 'relationships': {'app': {'data': {'type': 'apps', 'id': app}}}}})
    print('create', s, '' if s in (200, 201) else errs(j))
    if s not in (200, 201): sys.exit(1)
    v = j['data']
vid = v['id']; st = v['attributes'].get('appStoreState'); print('version id', vid, st, v['attributes'].get('releaseType'))
if st not in ('PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'): print('the version is not open for changes; nothing more is done'); sys.exit(0)
if v['attributes'].get('releaseType') != 'MANUAL':
    s, j = call('PATCH', '/v1/appStoreVersions/' + vid, {'data': {'type': 'appStoreVersions', 'id': vid, 'attributes': {'releaseType': 'MANUAL'}}}); print('release type MANUAL', s, '' if s == 200 else errs(j))
step("what's new")
s, j = call('GET', f'/v1/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=50')
for l in (j.get('data', []) if s == 200 else []):
    loc = l['attributes'].get('locale'); f = os.path.join(META, loc, 'release_notes.txt')
    if not os.path.exists(f): print('  ', loc, 'no text here'); continue
    t = open(f, encoding='utf-8').read().strip()
    if (l['attributes'].get('whatsNew') or '').strip() == t: print('  ', loc, 'as it should be'); continue
    s2, r = call('PATCH', '/v1/appStoreVersionLocalizations/' + l['id'], {'data': {'type': 'appStoreVersionLocalizations', 'id': l['id'], 'attributes': {'whatsNew': t}}})
    print('  ', loc, s2, len(t), 'chars' if s2 == 200 else errs(r))
step('review notes')
s, j = call('GET', f'/v1/appStoreVersions/{vid}/appStoreReviewDetail'); det = j.get('data') if s == 200 else None
if det:
    if (det['attributes'].get('notes') or '').strip() == NOTES_TXT: print('as they should be')
    else:
        s, r = call('PATCH', '/v1/appStoreReviewDetails/' + det['id'], {'data': {'type': 'appStoreReviewDetails', 'id': det['id'], 'attributes': {'notes': NOTES_TXT}}}); print('notes', s, len(NOTES_TXT), 'chars' if s == 200 else errs(r))
    a = det['attributes']; print('contact set:', bool(a.get('contactFirstName')), bool(a.get('contactEmail')), '| demo account required:', a.get('demoAccountRequired'), '| demo name set:', bool(a.get('demoAccountName')))
else:
    old = next((w for w in vs if w['attributes'].get('versionString') in ('1.1', '1.0')), None); attrs = {'notes': NOTES_TXT}
    if old:
        s, jo = call('GET', f"/v1/appStoreVersions/{old['id']}/appStoreReviewDetail"); oa = (jo.get('data') or {}).get('attributes', {}) if s == 200 else {}
        for k in ('contactFirstName', 'contactLastName', 'contactPhone', 'contactEmail'):
            if oa.get(k): attrs[k] = oa[k]
    s, r = call('POST', '/v1/appStoreReviewDetails', {'data': {'type': 'appStoreReviewDetails', 'attributes': attrs, 'relationships': {'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': vid}}}}})
    print('review detail made', s, '' if s in (200, 201) else errs(r))
step('build')
s, j = call('GET', f'/v1/builds?filter[app]={app}&filter[preReleaseVersion.version]={VER}&sort=-uploadedDate&limit=5')
bs = j.get('data', []) if s == 200 else []
for b in bs: print('  build', b['attributes'].get('version'), b['attributes'].get('processingState'), b['attributes'].get('uploadedDate'), 'expired' if b['attributes'].get('expired') else '')
import time
MIN = int(os.environ.get('PF_MIN_BUILD', '1'))   # the build made for this version (an upload shows up at Apple a few minutes late)
if os.environ.get('PF_ATTACH') == '1':   # the newest upload may still be processing at Apple: wait for it (up to 20 minutes) instead of taking an older build
    for _ in range(60):
        if bs and int(bs[0]['attributes'].get('version') or 0) >= MIN and bs[0]['attributes'].get('processingState') == 'VALID': break
        print('  waiting for the newest build:', bs and (bs[0]['attributes'].get('version'), bs[0]['attributes'].get('processingState')), flush=True); time.sleep(20)
        s, j = call('GET', f'/v1/builds?filter[app]={app}&filter[preReleaseVersion.version]={VER}&sort=-uploadedDate&limit=5'); bs = j.get('data', []) if s == 200 else bs
good = bs[0] if (bs and int(bs[0]['attributes'].get('version') or 0) >= MIN and bs[0]['attributes'].get('processingState') == 'VALID' and not bs[0]['attributes'].get('expired')) else None   # never an older build than the one meant
s, j = call('GET', f'/v1/appStoreVersions/{vid}/build'); cur = (j.get('data') or {}) if s == 200 else {}
print('attached now:', cur.get('attributes', {}).get('version'))
want = os.environ.get('PF_BUILD')
if want: good = next((b for b in bs if b['attributes'].get('version') == want and b['attributes'].get('processingState') == 'VALID'), None)
if os.environ.get('PF_ATTACH') == '1' and good and good['id'] != cur.get('id'):
    s, r = call('PATCH', f'/v1/appStoreVersions/{vid}/relationships/build', {'data': {'type': 'builds', 'id': good['id']}}); print('attach build', good['attributes'].get('version'), s, '' if s in (200, 204) else errs(r))
print('\nNothing was submitted for review.')
