#!/usr/bin/env python3
"""Read-only: what App Store Connect holds for the 1.0 submission. Changes nothing."""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
def get(path):
    s, j = call('GET', path)
    if s != 200: print('  !! GET', path.split('?')[0], s, errs(j)[:200])
    return j if s == 200 else {}
step('app'); j = get('/v1/apps?filter[bundleId]=' + BUNDLE); a = j['data'][0]; app = a['id']
print('APPLE ID', app, '| https://apps.apple.com/app/id' + app)
print({k: a['attributes'].get(k) for k in ('name', 'sku', 'primaryLocale', 'contentRightsDeclaration', 'isOrEverWasMadeForKids')})
step('app info')
j = get(f'/v1/apps/{app}/appInfos?include=primaryCategory,secondaryCategory,ageRatingDeclaration')
for d in j.get('data', []):
    print({k: d['attributes'].get(k) for k in ('appStoreState', 'state', 'appStoreAgeRating', 'brazilAgeRatingV2')}, '| primary', (d['relationships'].get('primaryCategory', {}).get('data') or {}).get('id'), '| secondary', (d['relationships'].get('secondaryCategory', {}).get('data') or {}).get('id'))
    jl = get(f"/v1/appInfos/{d['id']}/appInfoLocalizations?limit=50")
    for l in jl.get('data', []): x = l['attributes']; print('  ', x.get('locale'), '| name:', x.get('name'), '| subtitle:', x.get('subtitle'), '| privacy:', x.get('privacyPolicyUrl'))
step('price and availability')
j = get(f'/v1/apps/{app}/appPriceSchedule?include=baseTerritory,manualPrices'); print('  price schedule:', [(i['type'], i.get('attributes')) for i in j.get('included', [])] or 'NOT SET')
jp = get(f'/v1/appPriceSchedules/{app}/manualPrices?include=appPricePoint,territory&limit=10'); print('  manual prices:', [(i['type'], i.get('attributes')) for i in jp.get('included', [])] or jp.get('data'))
s, j = call('GET', f'/v2/appAvailabilities/{app}?include=territoryAvailabilities&limit[territoryAvailabilities]=5'); print('  availability:', s, (j.get('data') or {}).get('attributes') if s == 200 else errs(j)[:160])
step('version')
j = get(f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=3'); v = j['data'][0]; vid = v['id']
print({k: v['attributes'].get(k) for k in ('versionString', 'appStoreState', 'appVersionState', 'releaseType', 'copyright', 'usesIdfa', 'downloadable')})
j = get(f'/v1/appStoreVersions/{vid}/build'); b = (j.get('data') or {}); print('  build:', b.get('attributes', {}).get('version'), b.get('attributes', {}).get('processingState'), '| usesNonExemptEncryption:', b.get('attributes', {}).get('usesNonExemptEncryption'))
j = get(f'/v1/appStoreVersions/{vid}/appStoreReviewDetail'); r = (j.get('data') or {}).get('attributes', {})
print('  review: first', bool(r.get('contactFirstName')), 'last', bool(r.get('contactLastName')), 'phone', bool(r.get('contactPhone')), 'email', bool(r.get('contactEmail')), '| demoAccountRequired', r.get('demoAccountRequired'), '| notes chars', len(r.get('notes') or ''))
step('version texts and screenshots')
j = get(f'/v1/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=50')
for l in j.get('data', []):
    x = l['attributes']; js = get(f"/v1/appStoreVersionLocalizations/{l['id']}/appScreenshotSets?include=appScreenshots&limit=20")
    sets = {d['attributes']['screenshotDisplayType']: len(d['relationships'].get('appScreenshots', {}).get('data') or []) for d in js.get('data', [])}
    print('  ', x.get('locale'), '| desc', len(x.get('description') or ''), '| keywords', len(x.get('keywords') or ''), '| promo', len(x.get('promotionalText') or ''), '| support', bool(x.get('supportUrl')), '| marketing', bool(x.get('marketingUrl')), '| shots', sets)
step('in-app purchases')
j = get(f'/v1/apps/{app}/inAppPurchasesV2?limit=50')
for d in j.get('data', []):
    x = d['attributes']; jl = get(f"/v2/inAppPurchases/{d['id']}/inAppPurchaseLocalizations?limit=50")
    print('  ', x['productId'], '|', x.get('inAppPurchaseType'), '|', x.get('state'), '| name:', x.get('name'), '| familySharable', x.get('familySharable'))
    for l in jl.get('data', []): y = l['attributes']; print('      ', y.get('locale'), '|', y.get('name'), '|', y.get('description'), '|', y.get('state'))
