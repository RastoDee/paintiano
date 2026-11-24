#!/usr/bin/env python3
"""The App Preview (the video among the screenshots; 886 x 1920, 30 fps, 22 s, with sound), one per language: uploads
ios/asc/preview/<LANG>.mp4 to the 6.9-inch iPhone preview set of each language of the version being prepared (PF_VER, 1.3 by default;
a commit also marked [only:<locale>,<locale>] uploads just those languages),
replacing a preview uploaded there before, waits until Apple has processed it and sets the frame shown before it plays (PF_POSTER).
es-MX has texts of its own but no screenshots yet: it gets the Spanish screenshots (ios/fastlane/screenshots/es-ES) so that the page is
in one language. en-GB gets nothing of its own (it shows the en-US pictures). Touches nothing else; submits nothing. Prints what Apple answers."""
import os, sys, json, time, glob, hashlib, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
FILES = {'en-US': 'EN', 'sk': 'SK', 'de-DE': 'DE', 'fr-FR': 'FR', 'es-ES': 'ES', 'es-MX': 'ES', 'pt-PT': 'PT', 'zh-Hans': 'zh', 'zh-Hant': 'zhTW', 'ja': 'ja'}
SHOTS_FROM = {'es-MX': 'es-ES'}                                   # a language that borrows another language's screenshots when it has none
import re
_only = re.search(r'\[only:([^\]]+)\]', os.environ.get('MSG', ''))          # a commit marked [only:zh-Hans,ja] uploads just those languages
if _only: FILES = {k: v for k, v in FILES.items() if k in [x.strip() for x in _only.group(1).split(',')]}; SHOTS_FROM = {}
POSTER = os.environ.get('PF_POSTER', '00:00:03:18')               # 3.6 s: the finished Hokusai painting with the headline over it
VER = os.environ.get('PF_VER', '1.3')
def put_parts(data, ops):
    def put(op):
        part = data[op['offset']:op['offset'] + op['length']]; err = ''
        for attempt in range(3):
            try:
                req = urllib.request.Request(op['url'], data=part, method=op['method'], headers={h['name']: h['value'] for h in op.get('requestHeaders', [])})
                with urllib.request.urlopen(req, timeout=300) as r: return r.status
            except Exception as e:
                err = str(e); time.sleep(3)
        return 'failed ' + err
    with ThreadPoolExecutor(6) as ex: res = list(ex.map(put, ops))
    return [r for r in res if r not in (200, 201, 204)]
def rel(kind, i): return {'data': {'type': kind, 'id': i}}

step('app'); s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']
s, j = call('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=6')
for d in (j.get('data') or []): print('  version', d['attributes'].get('versionString'), d['attributes'].get('appStoreState'))
v = [d for d in (j.get('data') or []) if d['attributes'].get('versionString') == VER]
if not v: print(f'\nThere is no version {VER} in App Store Connect yet. Nothing was changed.'); sys.exit(2)
vid = v[0]['id']; state = v[0]['attributes'].get('appStoreState'); print('working on', VER, state)
s, j = call('GET', f'/v1/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=50'); locs = {l['attributes'].get('locale'): l['id'] for l in (j.get('data') or [])}
print('languages:', ' '.join(sorted(locs)))

step('which sets the screenshots are in')
s, j = call('GET', f"/v1/appStoreVersionLocalizations/{locs.get('en-US')}/appScreenshotSets?limit=50"); shot_types = [d['attributes'].get('screenshotDisplayType') for d in (j.get('data') or [])]
print('en-US screenshot sets:', shot_types)
SHOT_TYPE = next((t for t in shot_types if t in ('APP_IPHONE_69', 'APP_IPHONE_67')), shot_types[0] if shot_types else 'APP_IPHONE_67')
PREV_TYPES = [SHOT_TYPE.replace('APP_', '', 1)] + [t for t in ('IPHONE_67', 'IPHONE_65') if t != SHOT_TYPE.replace('APP_', '', 1)]

step('screenshots for a language that has none')
for loc, src in SHOTS_FROM.items():
    lid = locs.get(loc)
    if not lid: print('  ', loc, 'is not a language of this version'); continue
    s, j = call('GET', f'/v1/appStoreVersionLocalizations/{lid}/appScreenshotSets?include=appScreenshots&limit=50'); sets = j.get('data') or []
    have = sum(len(((d.get('relationships') or {}).get('appScreenshots') or {}).get('data') or []) for d in sets)
    if have: print('  ', loc, 'has', have, 'screenshots already, left as they are'); continue
    st = next((d for d in sets if d['attributes'].get('screenshotDisplayType') == SHOT_TYPE), None)
    if not st:
        s, j = call('POST', '/v1/appScreenshotSets', {'data': {'type': 'appScreenshotSets', 'attributes': {'screenshotDisplayType': SHOT_TYPE}, 'relationships': {'appStoreVersionLocalization': rel('appStoreVersionLocalizations', lid)}}})
        if s != 201: print('  ', loc, 'screenshot set', s, errs(j)); continue
        st = j['data']
    files = sorted(glob.glob(os.path.join(HERE, '..', 'fastlane', 'screenshots', src, '*.jpg')), key=lambda f: int(os.path.basename(f).split('.')[0])); ok = 0
    for f in files:
        data = open(f, 'rb').read()
        s, j = call('POST', '/v1/appScreenshots', {'data': {'type': 'appScreenshots', 'attributes': {'fileName': f'{loc}-{os.path.basename(f)}', 'fileSize': len(data)}, 'relationships': {'appScreenshotSet': rel('appScreenshotSets', st['id'])}}})
        if s != 201: print('  ', loc, os.path.basename(f), 'reserve', s, errs(j)); continue
        sid = j['data']['id']; bad = put_parts(data, j['data']['attributes'].get('uploadOperations') or [])
        s, j = call('PATCH', '/v1/appScreenshots/' + sid, {'data': {'type': 'appScreenshots', 'id': sid, 'attributes': {'uploaded': True, 'sourceFileChecksum': hashlib.md5(data).hexdigest()}}})
        ok += (s == 200 and not bad)
        if s != 200 or bad: print('  ', loc, os.path.basename(f), 'commit', s, errs(j) if s != 200 else bad[:2])
    print('  ', loc, 'screenshots from', src, ':', ok, 'of', len(files), flush=True)

step('upload the previews')
made = {}
for loc, code in FILES.items():
    lid = locs.get(loc); path = os.path.join(HERE, 'preview', code + '.mp4')
    if not lid: print('  ', loc, 'is not a language of this version, skipped'); continue
    data = open(path, 'rb').read()
    s, j = call('GET', f'/v1/appStoreVersionLocalizations/{lid}/appPreviewSets?include=appPreviews&limit=50'); sets = j.get('data') or []
    if s != 200: print('  ', loc, 'preview sets', s, errs(j)); continue
    st = next((d for d in sets if d['attributes'].get('previewType') in PREV_TYPES), None)
    if not st:
        for pt in PREV_TYPES:
            s, j = call('POST', '/v1/appPreviewSets', {'data': {'type': 'appPreviewSets', 'attributes': {'previewType': pt}, 'relationships': {'appStoreVersionLocalization': rel('appStoreVersionLocalizations', lid)}}})
            if s == 201: st = j['data']; break
            print('  ', loc, 'preview set', pt, s, errs(j))
    if not st: continue
    for old in (((st.get('relationships') or {}).get('appPreviews') or {}).get('data') or []):
        ds, dr = call('DELETE', '/v1/appPreviews/' + old['id']); print('  ', loc, 'removed the old preview', ds, '' if ds == 204 else errs(dr))
    s, j = call('POST', '/v1/appPreviews', {'data': {'type': 'appPreviews', 'attributes': {'fileName': f'paintiano-preview-{loc}.mp4', 'fileSize': len(data), 'mimeType': 'video/mp4', 'previewFrameTimeCode': POSTER}, 'relationships': {'appPreviewSet': rel('appPreviewSets', st['id'])}}})
    if s != 201: print('  ', loc, 'reserve', s, errs(j)); continue
    pid = j['data']['id']; ops = j['data']['attributes'].get('uploadOperations') or []; bad = put_parts(data, ops)
    if bad: print('  ', loc, 'upload failed', bad[:2]); continue
    s, j = call('PATCH', '/v1/appPreviews/' + pid, {'data': {'type': 'appPreviews', 'id': pid, 'attributes': {'uploaded': True, 'sourceFileChecksum': hashlib.md5(data).hexdigest()}}})
    print('  ', loc, code, st['attributes'].get('previewType'), 'parts', len(ops), 'bytes', len(data), 'commit', s, '' if s == 200 else errs(j), flush=True)
    if s == 200: made[loc] = pid

step('processing')
state_of = {}; t0 = time.time()
while made and time.time() - t0 < 1500:
    pend = 0
    for loc, pid in made.items():
        if state_of.get(loc, ('',))[0] in ('COMPLETE', 'FAILED'): continue
        s, j = call('GET', '/v1/appPreviews/' + pid); a = (j.get('data') or {}).get('attributes', {}); d = a.get('assetDeliveryState') or {}; vd = a.get('videoDeliveryState') or {}
        st = vd.get('state') or d.get('state'); state_of[loc] = (st, a)
        if st in ('COMPLETE', 'FAILED'): print('  ', loc, st, json.dumps(d.get('errors') or vd.get('errors') or [])[:300], 'poster', a.get('previewFrameTimeCode'), flush=True)
        else: pend += 1
    if not pend: break
    print('   waiting for', pend, '…', int(time.time() - t0), 's', flush=True); time.sleep(20)

step('the frame shown before it plays')
for loc, pid in made.items():
    st, a = state_of.get(loc, ('', {}))
    if st != 'COMPLETE' or a.get('previewFrameTimeCode') == POSTER: continue
    s, j = call('PATCH', '/v1/appPreviews/' + pid, {'data': {'type': 'appPreviews', 'id': pid, 'attributes': {'previewFrameTimeCode': POSTER}}}); print('  ', loc, 'poster', POSTER, s, '' if s == 200 else errs(j))

step('what each language has now')
for loc in sorted(locs):
    lid = locs[loc]
    s, j = call('GET', f'/v1/appStoreVersionLocalizations/{lid}/appScreenshotSets?include=appScreenshots&limit=50'); shots = sum(len(((d.get('relationships') or {}).get('appScreenshots') or {}).get('data') or []) for d in (j.get('data') or []))
    s, j = call('GET', f'/v1/appStoreVersionLocalizations/{lid}/appPreviewSets?include=appPreviews&limit=50'); prevs = sum(len(((d.get('relationships') or {}).get('appPreviews') or {}).get('data') or []) for d in (j.get('data') or []))
    s, j = call('GET', f'/v1/appStoreVersionLocalizations/{lid}/placements?limit=20'); pl = [p['attributes'].get('placementType', '?').replace('_ASSET', '') + ':' + str(p['attributes'].get('mediaType')) for p in (j.get('data') or [])] if s == 200 else ['?' + str(s)]
    print('  ', loc.ljust(8), 'screenshots', shots, '· previews', prevs, '· placements', ', '.join(pl) or 'none', '· preview', state_of.get(loc, ('-',))[0])
done = sum(1 for loc in made if state_of.get(loc, ('',))[0] == 'COMPLETE')
print(f'\napp preview processed on {done} of {len(FILES)} languages (uploaded {len(made)}). Nothing was submitted for review.')
sys.exit(0 if done == len([l for l in FILES if l in locs]) and done else 5)
