#!/usr/bin/env python3
"""Read-only: in which territories the app is available, and why not where it is not. Changes nothing."""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = j['data'][0]['id']; print('app', app)
step('availability')
s, j = call('GET', f'/v2/appAvailabilities/{app}'); print('appAvailability', s, json.dumps(j.get('data', {}).get('attributes'))[:200] if s == 200 else errs(j)[:300])
rows = []; url = f'/v2/appAvailabilities/{app}/territoryAvailabilities?include=territory&limit=200'
while url:
    s, j = call('GET', url)
    if s != 200: print('territories', s, errs(j)[:300]); break
    rows += j.get('data', [])
    nxt = (j.get('links') or {}).get('next'); url = nxt.replace('https://api.appstoreconnect.apple.com', '') if nxt else None
print('territory rows:', len(rows))
on = [r for r in rows if r['attributes'].get('available')]
print('available:', len(on), '| not available:', len(rows) - len(on))
for r in rows:
    t = ((r.get('relationships') or {}).get('territory') or {}).get('data', {}).get('id')
    a = r['attributes']
    if t in ('SVK', 'CZE', 'USA', 'DEU') or not a.get('available'):
        print(' ', t or r['id'][:20], '| available', a.get('available'), '| release', a.get('releaseDate'), '| preOrder', a.get('preOrderEnabled'), '| status', a.get('contentStatuses'))
