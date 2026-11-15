#!/usr/bin/env python3
"""Paintiano Beta — a second app for test builds (its own identifier), so the App Store version can stay installed beside it.
Registers the identifier app.paintiano.beta if it is not there, and says whether its app record exists in App Store Connect
(the record itself can only be made by hand: Apple's API cannot create apps). Idempotent."""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
BETA = 'app.paintiano.beta'
step('identifier')
s, j = call('GET', '/v1/bundleIds?filter[identifier]=' + BETA + '&limit=5')
have = [d for d in j.get('data', []) if d['attributes'].get('identifier') == BETA] if s == 200 else []
if have: print('already registered:', have[0]['id'], have[0]['attributes'].get('name'))
else:
    s, j = call('POST', '/v1/bundleIds', {'data': {'type': 'bundleIds', 'attributes': {'identifier': BETA, 'name': 'Paintiano Beta', 'platform': 'IOS'}}})
    print('register', s, (j.get('data', {}).get('id') if s in (200, 201) else errs(j)))
step('app record')
s, j = call('GET', '/v1/apps?filter[bundleId]=' + BETA)
apps = j.get('data', []) if s == 200 else []
print('app record:', (apps[0]['id'] + ' ' + str(apps[0]['attributes'].get('name'))) if apps else 'NOT THERE YET (make it in App Store Connect: New App, bundle ID ' + BETA + ')')
