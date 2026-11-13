#!/usr/bin/env python3
"""Google Play Console through its API (the service account in GOOGLE_PLAY_SA_JSON).
  play.py check     what Google has for the app: the tracks, the listings, the products
  play.py listing   the texts, the screenshots, the feature graphic and the icon from android/play → the store listing (all languages)
  play.py upload F  a release bundle (.aab) → the internal testing track
Every change goes through one "edit", committed at the end; a failure leaves the console as it was."""
import os, sys, json, time, glob, urllib.request, urllib.error
import jwt   # pyjwt + cryptography

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.environ.get('GOOGLE_PLAY_PACKAGE', 'app.paintiano')
API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PKG
UP = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/' + PKG

def token():
    sa = json.loads(os.environ['GOOGLE_PLAY_SA_JSON']); now = int(time.time())
    a = jwt.encode({'iss': sa['client_email'], 'scope': 'https://www.googleapis.com/auth/androidpublisher', 'aud': 'https://oauth2.googleapis.com/token', 'iat': now, 'exp': now + 3000}, sa['private_key'], algorithm='RS256')
    body = ('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + a).encode()
    with urllib.request.urlopen(urllib.request.Request('https://oauth2.googleapis.com/token', data=body, headers={'Content-Type': 'application/x-www-form-urlencoded'})) as r:
        print('service account:', sa['client_email']); return json.load(r)['access_token']
TOK = None
def call(method, url, body=None, raw=None, ctype='application/json', ok=(200, 201, 204)):
    global TOK
    if TOK is None: TOK = token()
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method, headers={'Authorization': 'Bearer ' + TOK, 'Content-Type': ctype})
    try:
        with urllib.request.urlopen(req, timeout=300) as r: t = r.read().decode() or '{}'; return r.status, json.loads(t)
    except urllib.error.HTTPError as e:
        t = e.read().decode()[:600]
        try: j = json.loads(t)
        except Exception: j = {'raw': t}
        return e.code, j
def must(s, j, what):
    if s not in (200, 201, 204): print('FAILED', what, s, json.dumps(j)[:500]); sys.exit(2)
    return j
def step(t): print('\n==', t)

def check():
    step('edit'); s, j = call('POST', API + '/edits', {}); must(s, j, 'edit'); eid = j['id']
    step('tracks'); s, j = call('GET', f'{API}/edits/{eid}/tracks'); must(s, j, 'tracks')
    for t in j.get('tracks', []): print(t['track'], [(r.get('name'), r.get('status'), r.get('versionCodes')) for r in t.get('releases', [])])
    step('listings'); s, j = call('GET', f'{API}/edits/{eid}/listings'); must(s, j, 'listings')
    for l in j.get('listings', []): print(l['language'], '|', l.get('title'), '|', len(l.get('fullDescription', '')))
    call('DELETE', f'{API}/edits/{eid}')
    step('one-time products'); s, j = call('GET', f'{API}/oneTimeProducts'); print(s, [(p.get('productId'), [o.get('state') for o in p.get('purchaseOptions', [])]) for p in j.get('oneTimeProducts', [])] if s == 200 else json.dumps(j)[:300])
    step('voided purchases'); s, j = call('GET', f'{API}/purchases/voidedpurchases?type=0'); print(s, json.dumps(j)[:200])

def listing():
    step('edit'); s, j = call('POST', API + '/edits', {}); must(s, j, 'edit'); eid = j['id']
    langs = sorted(os.listdir(os.path.join(HERE, 'listing')))
    for lang in langs:
        r = lambda f: open(os.path.join(HERE, 'listing', lang, f + '.txt'), encoding='utf-8').read().strip()
        s, j = call('PUT', f'{API}/edits/{eid}/listings/{lang}', {'language': lang, 'title': r('title'), 'shortDescription': r('short'), 'fullDescription': r('full')}); must(s, j, 'listing ' + lang)
        def images(kind, files, ctype):
            call('DELETE', f'{API}/edits/{eid}/listings/{lang}/{kind}')
            for f in files:
                s, j = call('POST', f'{UP}/edits/{eid}/listings/{lang}/{kind}?uploadType=media', raw=open(f, 'rb').read(), ctype=ctype); must(s, j, f'{kind} {lang} {os.path.basename(f)}')
        images('phoneScreenshots', sorted(glob.glob(os.path.join(HERE, 'screenshots', lang, '*.jpg'))), 'image/jpeg')
        images('featureGraphic', [os.path.join(HERE, 'feature-graphic.png')], 'image/png')
        images('icon', [os.path.join(HERE, 'icon.png')], 'image/png')
        print('listing', lang, 'ok')
    step('details'); s, j = call('PUT', f'{API}/edits/{eid}/details', {'defaultLanguage': 'en-US', 'contactEmail': 'hello@paintiano.app', 'contactWebsite': 'https://paintiano.app'}); print('details', s, '' if s == 200 else json.dumps(j)[:300])
    step('commit'); s, j = call('POST', f'{API}/edits/{eid}:commit'); must(s, j, 'commit'); print('committed')

def upload(path):
    step('edit'); s, j = call('POST', API + '/edits', {}); must(s, j, 'edit'); eid = j['id']
    step('bundle'); s, j = call('POST', f'{UP}/edits/{eid}/bundles?uploadType=media', raw=open(path, 'rb').read(), ctype='application/octet-stream'); must(s, j, 'bundle'); vc = j['versionCode']; print('versionCode', vc)
    step('internal track'); s, j = call('PUT', f'{API}/edits/{eid}/tracks/internal', {'track': 'internal', 'releases': [{'name': f"1.0 ({vc})", 'versionCodes': [str(vc)], 'status': os.environ.get('PF_RELEASE_STATUS', 'draft')}]}); must(s, j, 'track')
    step('commit'); s, j = call('POST', f'{API}/edits/{eid}:commit'); must(s, j, 'commit'); print('committed: internal testing has', vc)

if __name__ == '__main__':
    m = sys.argv[1] if len(sys.argv) > 1 else 'check'
    if m == 'check': check()
    elif m == 'listing': listing()
    elif m == 'upload': upload(sys.argv[2])
    else: print(__doc__); sys.exit(1)
