#!/usr/bin/env python3
"""App price (free), availability (all territories), in-app purchase names in 9 languages. Idempotent."""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = j['data'][0]['id']

step('app price: free')
s, j = call('GET', f'/v1/apps/{app}/appPriceSchedule')
if s == 200 and j.get('data'): print('already set')
else:
    s, j = call('GET', f'/v1/apps/{app}/appPricePoints?filter[territory]=SVK&limit=50')
    pts = j.get('data', []) if s == 200 else []
    pp = next((d for d in pts if float(d['attributes'].get('customerPrice') or 1) == 0.0), None)
    print('points', s, len(pts), 'free:', pp and pp['attributes'])
    if pp:
        s, j = call('POST', '/v1/appPriceSchedules', {'data': {'type': 'appPriceSchedules', 'relationships': {
            'app': {'data': {'type': 'apps', 'id': app}}, 'baseTerritory': {'data': {'type': 'territories', 'id': 'SVK'}},
            'manualPrices': {'data': [{'type': 'appPrices', 'id': '${p1}'}]}}},
            'included': [{'type': 'appPrices', 'id': '${p1}', 'attributes': {'startDate': None}, 'relationships': {'appPricePoint': {'data': {'type': 'appPricePoints', 'id': pp['id']}}}}]})
        print('schedule', s, '' if s == 201 else errs(j))

step('availability: all territories')
s, j = call('GET', f'/v2/appAvailabilities/{app}')
if s == 200 and j.get('data'): print('already set', j['data'].get('attributes'))
else:
    terr = []; url = '/v1/territories?limit=200'
    while url:
        s, j = call('GET', url); terr += [d['id'] for d in j.get('data', [])]; url = (j.get('links') or {}).get('next')
    s, j = call('POST', '/v2/appAvailabilities', {'data': {'type': 'appAvailabilities', 'attributes': {'availableInNewTerritories': True},
        'relationships': {'app': {'data': {'type': 'apps', 'id': app}}, 'territoryAvailabilities': {'data': [{'type': 'territoryAvailabilities', 'id': '${t-%s}' % t} for t in terr]}}},
        'included': [{'type': 'territoryAvailabilities', 'id': '${t-%s}' % t, 'attributes': {'available': True}, 'relationships': {'territory': {'data': {'type': 'territories', 'id': t}}}} for t in terr]})
    print('availability', len(terr), s, '' if s == 201 else errs(j))

L = {
 'app.paintiano.pro': {
  'en-US': ('Paintiano Pro', 'Every painter and composer, for life.'), 'sk': ('Paintiano Pro', 'Všetci maliari a skladatelia, navždy.'),
  'de-DE': ('Paintiano Pro', 'Alle Maler und Komponisten, für immer.'), 'fr-FR': ('Paintiano Pro', 'Tous les peintres et compositeurs, à vie.'),
  'es-ES': ('Paintiano Pro', 'Todos los pintores y compositores, siempre.'), 'pt-PT': ('Paintiano Pro', 'Todos os pintores e compositores, sempre.'),
  'zh-Hans': ('Paintiano Pro', '所有画家与作曲家，终身拥有。'), 'zh-Hant': ('Paintiano Pro', '所有畫家與作曲家，終身擁有。'), 'ja': ('Paintiano Pro', 'すべての画家と作曲家を、ずっと。')},
 'app.paintiano.aipass12m': {
  'en-US': ('AI pass · 12 months', 'AI composing for 12 months. No renewal.'), 'sk': ('AI pas · 12 mesiacov', 'AI skladanie na 12 mesiacov. Bez obnovy.'),
  'de-DE': ('KI-Pass · 12 Monate', 'KI-Komposition für 12 Monate. Ohne Abo.'), 'fr-FR': ('Pass IA · 12 mois', 'Composition IA pendant 12 mois. Sans abo.'),
  'es-ES': ('Pase IA · 12 meses', 'Composición con IA 12 meses. No se renueva.'), 'pt-PT': ('Passe IA · 12 meses', 'Composição com IA por 12 meses. Não renova.'),
  'zh-Hans': ('AI 通行证 · 12 个月', '12 个月 AI 作曲，不自动续订。'), 'zh-Hant': ('AI 通行證 · 12 個月', '12 個月 AI 作曲，不自動續訂。'), 'ja': ('AI パス · 12 か月', '12 か月間の AI 作曲。自動更新なし。')}}
for pid in L:
    for loc, (n, d) in L[pid].items(): assert len(n) <= 30 and len(d) <= 45, (pid, loc, len(n), len(d))
step('in-app purchase names')
s, j = call('GET', f'/v1/apps/{app}/inAppPurchasesV2?limit=50')
for d in j.get('data', []):
    pid = d['attributes']['productId']
    if pid not in L: continue
    s2, jl = call('GET', f"/v2/inAppPurchases/{d['id']}/inAppPurchaseLocalizations?limit=50"); have = {x['attributes']['locale']: x for x in jl.get('data', [])}
    for loc, (n, de) in L[pid].items():
        if loc in have:
            x = have[loc]
            if x['attributes'].get('name') == n and x['attributes'].get('description') == de: continue
            s3, j3 = call('PATCH', '/v1/inAppPurchaseLocalizations/' + x['id'], {'data': {'type': 'inAppPurchaseLocalizations', 'id': x['id'], 'attributes': {'name': n, 'description': de}}})
            print(pid, loc, 'updated', s3, '' if s3 == 200 else errs(j3))
        else:
            s3, j3 = call('POST', '/v1/inAppPurchaseLocalizations', {'data': {'type': 'inAppPurchaseLocalizations', 'attributes': {'locale': loc, 'name': n, 'description': de},
                'relationships': {'inAppPurchaseV2': {'data': {'type': 'inAppPurchases', 'id': d['id']}}}}})
            print(pid, loc, 'created', s3, '' if s3 == 201 else errs(j3))
step('after'); s, j = call('GET', f'/v1/apps/{app}/inAppPurchasesV2?limit=50')
for d in j.get('data', []): print(d['attributes']['productId'], '|', d['attributes'].get('state'))
s, j = call('GET', f'/v1/apps/{app}/appPriceSchedule'); print('price schedule', s)
s, j = call('GET', f'/v2/appAvailabilities/{app}'); print('availability', s, (j.get('data') or {}).get('attributes'))
