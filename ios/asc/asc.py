#!/usr/bin/env python3
"""App Store Connect housekeeping for Paintiano (run by the `asc` job).
Idempotent: every step looks at what is there first. Prints what it did; never prints secrets."""
import os, sys, time, json, hashlib, urllib.request, urllib.error
import jwt

BASE = 'https://api.appstoreconnect.apple.com'
BUNDLE = 'app.paintiano'
HERE = os.path.dirname(os.path.abspath(__file__))

def token():
    now = int(time.time())
    return jwt.encode({'iss': os.environ['ASC_ISSUER_ID'], 'iat': now, 'exp': now + 900, 'aud': 'appstoreconnect-v1'},
                      os.environ['ASC_KEY_P8'], algorithm='ES256', headers={'kid': os.environ['ASC_KEY_ID'], 'typ': 'JWT'})

def call(method, path, body=None, ok=(200, 201, 204)):
    url = path if path.startswith('http') else BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read(); return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', 'replace')
        try: j = json.loads(raw)
        except Exception: j = {'raw': raw[:400]}
        return e.code, j

def errs(j):
    return '; '.join((e.get('code', '') + ': ' + (e.get('detail') or e.get('title') or '')) for e in j.get('errors', []))[:500] or json.dumps(j)[:300]

def step(name):
    print('\n== ' + name, flush=True)

NOTES = {
 'app.paintiano.pro': 'One-time purchase that unlocks all painter styles, composers, the custom palette and watermark-free export. Open it by tapping any locked painter, then "Get Pro".',
 'app.paintiano.aipass12': 'Non-renewing 12-month pass for AI composition from a mood or a photo. It does not renew automatically. Open it from the purchase screen: "Get Pro AI", or "Get the AI pass" for a Pro owner.',
}
SHOTS = {'app.paintiano.pro': 'iap-pro.png', 'app.paintiano.aipass12': 'iap-ai-pass.png'}
REVIEW_NOTES = open(os.path.join(HERE, 'review-notes.txt'), encoding='utf-8').read().strip()

step('app')
s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE)
if s != 200 or not j.get('data'): print('FAIL', s, errs(j)); sys.exit(1)
app = j['data'][0]['id']; print('app id', app, '|', j['data'][0]['attributes'].get('name'))

step('in-app purchases')
s, j = call('GET', f'/v1/apps/{app}/inAppPurchasesV2?limit=50')
if s != 200: print('FAIL', s, errs(j)); sys.exit(1)
iaps = {d['attributes']['productId']: d for d in j['data']}
for pid, d in iaps.items(): print(pid, '|', d['attributes'].get('inAppPurchaseType'), '|', d['attributes'].get('state'), '| note:', bool(d['attributes'].get('reviewNote')))

for pid, d in iaps.items():
    if pid not in NOTES: continue
    iid = d['id']
    step('review note + screenshot: ' + pid)
    if d['attributes'].get('reviewNote') != NOTES[pid]:
        s, j = call('PATCH', f'/v2/inAppPurchases/{iid}', {'data': {'type': 'inAppPurchases', 'id': iid, 'attributes': {'reviewNote': NOTES[pid]}}})
        print('note', s, '' if s == 200 else errs(j))
    else: print('note already set')
    s, j = call('GET', f'/v2/inAppPurchases/{iid}/appStoreReviewScreenshot')
    have = (j.get('data') or None) if s == 200 else None
    if have:
        st = (have['attributes'].get('assetDeliveryState') or {}).get('state')
        print('screenshot already there:', have['attributes'].get('fileName'), st)
        if st in ('COMPLETE', 'UPLOAD_COMPLETE'): continue
        s2, j2 = call('DELETE', '/v1/inAppPurchaseAppStoreReviewScreenshots/' + have['id']); print('removed the unfinished one', s2)
    path = os.path.join(HERE, SHOTS[pid]); blob = open(path, 'rb').read()
    s, j = call('POST', '/v1/inAppPurchaseAppStoreReviewScreenshots', {'data': {'type': 'inAppPurchaseAppStoreReviewScreenshots',
        'attributes': {'fileName': SHOTS[pid], 'fileSize': len(blob)},
        'relationships': {'inAppPurchaseV2': {'data': {'type': 'inAppPurchases', 'id': iid}}}}})
    if s != 201: print('reserve FAIL', s, errs(j)); continue
    sid = j['data']['id']
    for op in j['data']['attributes']['uploadOperations']:
        req = urllib.request.Request(op['url'], data=blob[op['offset']:op['offset'] + op['length']], method=op['method'],
                                     headers={h['name']: h['value'] for h in op.get('requestHeaders', [])})
        with urllib.request.urlopen(req, timeout=120) as r: print('part', op['offset'], r.status)
    s, j = call('PATCH', '/v1/inAppPurchaseAppStoreReviewScreenshots/' + sid, {'data': {'type': 'inAppPurchaseAppStoreReviewScreenshots', 'id': sid,
        'attributes': {'uploaded': True, 'sourceFileChecksum': hashlib.md5(blob).hexdigest()}}})
    print('commit', s, '' if s == 200 else errs(j))

step('version')
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=5')
if s != 200 or not j.get('data'): print('FAIL', s, errs(j)); sys.exit(1)
for d in j['data']: print(d['attributes'].get('versionString'), d['attributes'].get('appStoreState'), d['attributes'].get('releaseType'))
ver = next((d for d in j['data'] if d['attributes'].get('appStoreState') in ('PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED')), None)
if not ver: print('no editable version'); sys.exit(0)
vid = ver['id']
if ver['attributes'].get('releaseType') != 'MANUAL':
    s, j = call('PATCH', '/v1/appStoreVersions/' + vid, {'data': {'type': 'appStoreVersions', 'id': vid, 'attributes': {'releaseType': 'MANUAL'}}})
    print('release type MANUAL', s, '' if s == 200 else errs(j))
else: print('release type already MANUAL')

step('build')
s, j = call('GET', f'/v1/builds?filter[app]={app}&sort=-uploadedDate&limit=6')
if s == 200:
    for d in j['data']: print(d['attributes'].get('version'), d['attributes'].get('processingState'), d['attributes'].get('uploadedDate'), 'expired' if d['attributes'].get('expired') else '')
    good = next((d for d in j['data'] if d['attributes'].get('processingState') == 'VALID' and not d['attributes'].get('expired')), None)
    newest = j['data'][0] if j['data'] else None
    if good and newest and good['id'] != newest['id']: print('NOTE: the newest build is still', newest['attributes'].get('processingState'), '- attaching the newest VALID one for now')
    if good:
        s, j = call('PATCH', f'/v1/appStoreVersions/{vid}/relationships/build', {'data': {'type': 'builds', 'id': good['id']}})
        print('attached build', good['attributes'].get('version'), s, '' if s in (200, 204) else errs(j))
else: print('FAIL', s, errs(j))

step('review information')
s, j = call('GET', f'/v1/appStoreVersions/{vid}/appStoreReviewDetail')
det = (j.get('data') or None) if s == 200 else None
attrs = {'demoAccountRequired': False, 'notes': REVIEW_NOTES}
if det:
    a = det['attributes']; print('contact present:', bool(a.get('contactFirstName')), bool(a.get('contactPhone')), bool(a.get('contactEmail')))
    s, j = call('PATCH', '/v1/appStoreReviewDetails/' + det['id'], {'data': {'type': 'appStoreReviewDetails', 'id': det['id'], 'attributes': attrs}})
    print('updated', s, '' if s == 200 else errs(j))
else:
    s, j = call('POST', '/v1/appStoreReviewDetails', {'data': {'type': 'appStoreReviewDetails', 'attributes': attrs,
        'relationships': {'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': vid}}}}})
    print('created', s, '' if s == 201 else errs(j))

step('in-app purchases after')
s, j = call('GET', f'/v1/apps/{app}/inAppPurchasesV2?limit=50')
if s == 200:
    for d in j['data']: print(d['attributes']['productId'], '|', d['attributes'].get('state'))
