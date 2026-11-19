#!/usr/bin/env python3
"""The promotional text of a version already on the App Store (PF_VER, 1.1 by default): Apple lets it change without a review.
Puts in fastlane/metadata/<locale>/promotional_text.txt for every language. Touches nothing else; submits nothing."""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
VER = os.environ.get('PF_VER', '1.1'); META = os.path.join(HERE, '..', 'fastlane', 'metadata')
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&filter[versionString]={VER}&limit=3'); v = j['data'][0]; vid = v['id']; print('version', VER, v['attributes'].get('appStoreState'))
step('promotional text')
s, j = call('GET', f'/v1/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=50')
for l in (j.get('data', []) if s == 200 else []):
    loc = l['attributes'].get('locale'); f = os.path.join(META, loc, 'promotional_text.txt')
    if not os.path.exists(f): print('  ', loc, 'no text here'); continue
    t = open(f, encoding='utf-8').read().strip()
    if (l['attributes'].get('promotionalText') or '').strip() == t: print('  ', loc, 'as it should be'); continue
    s2, r = call('PATCH', '/v1/appStoreVersionLocalizations/' + l['id'], {'data': {'type': 'appStoreVersionLocalizations', 'id': l['id'], 'attributes': {'promotionalText': t}}})
    print('  ', loc, s2, len(t), 'chars' if s2 == 200 else errs(r))
print('\nNothing was submitted for review.')
