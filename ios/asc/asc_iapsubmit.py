#!/usr/bin/env python3
"""Queue the two in-app purchases for review (they are reviewed with the app version). Prints Apple's answer verbatim."""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = j['data'][0]['id']
s, j = call('GET', f'/v1/apps/{app}/inAppPurchasesV2?limit=50')
for d in j.get('data', []):
    x = d['attributes']; step(x['productId'] + ' | ' + str(x.get('state')))
    s1, a = call('GET', f"/v2/inAppPurchases/{d['id']}/inAppPurchaseAvailability"); print('availability:', s1, (a.get('data') or {}).get('attributes') if s1 == 200 else errs(a)[:160])
    s1, a = call('GET', f"/v2/inAppPurchases/{d['id']}/iapPriceSchedule?include=manualPrices,baseTerritory"); print('price schedule:', s1, [(i['type'], i['id'][:12]) for i in a.get('included', [])] if s1 == 200 else errs(a)[:160])
    s1, a = call('GET', f"/v2/inAppPurchases/{d['id']}/appStoreReviewScreenshot"); print('review screenshot:', s1, ((a.get('data') or {}).get('attributes') or {}).get('assetDeliveryState'))
    s1, a = call('GET', f"/v2/inAppPurchases/{d['id']}?fields[inAppPurchases]=name,productId,state,reviewNote,contentHosting,familySharable,inAppPurchaseType"); print('attrs:', json.dumps((a.get('data') or {}).get('attributes'))[:300])
    if x.get('state') == 'READY_TO_SUBMIT':
        s2, r = call('POST', '/v1/inAppPurchaseSubmissions', {'data': {'type': 'inAppPurchaseSubmissions', 'relationships': {'inAppPurchaseV2': {'data': {'type': 'inAppPurchases', 'id': d['id']}}}}})
        print('SUBMIT ->', s2, json.dumps(r)[:700])
step('after'); s, j = call('GET', f'/v1/apps/{app}/inAppPurchasesV2?limit=50')
for d in j.get('data', []): print(d['attributes']['productId'], '|', d['attributes'].get('state'))
