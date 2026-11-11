#!/usr/bin/env python3
"""One-off: the AI pass was created as a Non-Consumable; a pass that ends after 12 months and can be bought again
must be a Non-Renewing Subscription. Creates app.paintiano.aipass12m mirroring the old product. Idempotent. Deletes nothing."""
import os, sys, json, hashlib, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('PF_ASC_LIB', '1')
import importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0]
exec(compile(src, 'asc_head', 'exec'))

OLD, NEW = 'app.paintiano.aipass12', 'app.paintiano.aipass12m'
NOTE = 'Non-renewing 12-month pass for AI composition from a mood or a photo. It does not renew automatically; after 12 months it can be bought again. Open it from the purchase screen: "Get Pro AI", or "Get the AI pass" for a Pro owner.'

step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = j['data'][0]['id']
s, j = call('GET', f'/v1/apps/{app}/inAppPurchasesV2?limit=50'); iaps = {d['attributes']['productId']: d for d in j['data']}
for pid, d in iaps.items(): print(pid, '|', d['attributes'].get('name'), '|', d['attributes'].get('inAppPurchaseType'), '|', d['attributes'].get('state'))
old = iaps.get(OLD)

step('old product: localizations and price')
locs = []
if old:
    s, j = call('GET', f"/v2/inAppPurchases/{old['id']}/inAppPurchaseLocalizations?limit=50")
    locs = [d['attributes'] for d in j.get('data', [])] if s == 200 else []
    for a in locs: print(a.get('locale'), '|', a.get('name'), '|', a.get('description'))
    s, j = call('GET', f"/v2/inAppPurchases/{old['id']}/iapPriceSchedule?include=baseTerritory,manualPrices")
    print('schedule', s, json.dumps([(i['type'], i['id'][:40], i.get('attributes')) for i in j.get('included', [])])[:600] if s == 200 else errs(j))
    base = next((i['id'] for i in j.get('included', []) if i['type'] == 'territories'), 'SVK') if s == 200 else 'SVK'
else: base = 'SVK'
print('base territory', base)

step('new product')
new = iaps.get(NEW)
if not new:
    s, j = call('POST', '/v2/inAppPurchases', {'data': {'type': 'inAppPurchases', 'attributes': {'name': 'AI pass 12 months (non-renewing)', 'productId': NEW,
        'inAppPurchaseType': 'NON_RENEWING_SUBSCRIPTION', 'reviewNote': NOTE}, 'relationships': {'app': {'data': {'type': 'apps', 'id': app}}}}})
    print('create', s, '' if s == 201 else errs(j))
    if s != 201: sys.exit(1)
    new = j['data']
nid = new['id']; print('id', nid, new['attributes'].get('inAppPurchaseType'), new['attributes'].get('state'))

step('localizations')
s, j = call('GET', f'/v2/inAppPurchases/{nid}/inAppPurchaseLocalizations?limit=50'); have = {d['attributes']['locale'] for d in j.get('data', [])} if s == 200 else set()
for a in (locs or [{'locale': 'en-US', 'name': 'AI pass 12 months', 'description': 'AI composition for 12 months'}]):
    if a['locale'] in have: print(a['locale'], 'already'); continue
    s, j = call('POST', '/v1/inAppPurchaseLocalizations', {'data': {'type': 'inAppPurchaseLocalizations', 'attributes': {'locale': a['locale'], 'name': a.get('name'), 'description': a.get('description')},
        'relationships': {'inAppPurchaseV2': {'data': {'type': 'inAppPurchases', 'id': nid}}}}})
    print(a['locale'], s, '' if s == 201 else errs(j))

step('price 9.99 in ' + base)
s, j = call('GET', f'/v2/inAppPurchases/{nid}/iapPriceSchedule?include=manualPrices')
if s == 200 and j.get('included'): print('price schedule already there')
else:
    s, j = call('GET', f'/v2/inAppPurchases/{nid}/pricePoints?filter[territory]={base}&limit=200')
    pts = j.get('data', []) if s == 200 else []
    pp = next((d for d in pts if d['attributes'].get('customerPrice') in ('9.99', '9.990')), None)
    print('price points', s, len(pts), 'picked', pp and pp['attributes'])
    if pp:
        s, j = call('POST', '/v1/inAppPurchasePriceSchedules', {'data': {'type': 'inAppPurchasePriceSchedules', 'relationships': {
            'inAppPurchase': {'data': {'type': 'inAppPurchases', 'id': nid}}, 'baseTerritory': {'data': {'type': 'territories', 'id': base}},
            'manualPrices': {'data': [{'type': 'inAppPurchasePrices', 'id': '${p1}'}]}}},
            'included': [{'type': 'inAppPurchasePrices', 'id': '${p1}', 'attributes': {'startDate': None},
                          'relationships': {'inAppPurchaseV2': {'data': {'type': 'inAppPurchases', 'id': nid}}, 'inAppPurchasePricePoint': {'data': {'type': 'inAppPurchasePricePoints', 'id': pp['id']}}}}]})
        print('schedule', s, '' if s == 201 else errs(j))

step('availability')
s, j = call('GET', f'/v2/inAppPurchases/{nid}/inAppPurchaseAvailability')
if s == 200 and j.get('data'): print('already set', j['data']['attributes'])
else:
    terr = []; url = '/v1/territories?limit=200'
    while url:
        s, j = call('GET', url); terr += [d['id'] for d in j.get('data', [])]; url = (j.get('links') or {}).get('next')
    s, j = call('POST', '/v1/inAppPurchaseAvailabilities', {'data': {'type': 'inAppPurchaseAvailabilities', 'attributes': {'availableInNewTerritories': True},
        'relationships': {'inAppPurchase': {'data': {'type': 'inAppPurchases', 'id': nid}}, 'availableTerritories': {'data': [{'type': 'territories', 'id': t} for t in terr]}}}})
    print('availability', len(terr), s, '' if s == 201 else errs(j))

step('review screenshot')
s, j = call('GET', f'/v2/inAppPurchases/{nid}/appStoreReviewScreenshot')
if s == 200 and j.get('data'): print('already there')
else:
    blob = open(os.path.join(HERE, 'iap-ai-pass.png'), 'rb').read()
    s, j = call('POST', '/v1/inAppPurchaseAppStoreReviewScreenshots', {'data': {'type': 'inAppPurchaseAppStoreReviewScreenshots', 'attributes': {'fileName': 'iap-ai-pass.png', 'fileSize': len(blob)},
        'relationships': {'inAppPurchaseV2': {'data': {'type': 'inAppPurchases', 'id': nid}}}}})
    if s == 201:
        sid = j['data']['id']
        for op in j['data']['attributes']['uploadOperations']:
            req = urllib.request.Request(op['url'], data=blob[op['offset']:op['offset'] + op['length']], method=op['method'], headers={h['name']: h['value'] for h in op.get('requestHeaders', [])})
            with urllib.request.urlopen(req, timeout=120) as r: print('part', r.status)
        s, j = call('PATCH', '/v1/inAppPurchaseAppStoreReviewScreenshots/' + sid, {'data': {'type': 'inAppPurchaseAppStoreReviewScreenshots', 'id': sid, 'attributes': {'uploaded': True, 'sourceFileChecksum': hashlib.md5(blob).hexdigest()}}})
        print('commit', s, '' if s == 200 else errs(j))
    else: print('reserve FAIL', s, errs(j))

step('after')
s, j = call('GET', f'/v1/apps/{app}/inAppPurchasesV2?limit=50')
for d in j.get('data', []): print(d['attributes']['productId'], '|', d['attributes'].get('inAppPurchaseType'), '|', d['attributes'].get('state'))
