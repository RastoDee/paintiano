#!/usr/bin/env python3
"""The header video: what state Apple has it in (processing, preview frame, placements). If its preview frame failed, asks Apple to
make it again from another moment (PF_POSTER, 00:00:01:00 by default). Touches nothing else; submits nothing."""
import os, sys, json, time
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'asc.py'), encoding='utf-8').read().split("\nNOTES = {")[0], 'asc_head', 'exec'))
s, j = call('GET', '/v1/apps?filter[bundleId]=' + BUNDLE); app = [d for d in j['data'] if d['attributes'].get('bundleId') == BUNDLE][0]['id']
s, j = call('GET', f'/v1/apps/{app}/assetLibrary'); lib = (j.get('data') or {}).get('id')
step('videos'); s, j = call('GET', f'/v1/appAssetLibraries/{lib}/videos?limit=20'); print('list', s, '' if s == 200 else errs(j))
for v in j.get('data', []):
    a = v['attributes']; print(v['id'], a.get('referenceName'), a.get('state'), a.get('specId'), 'details', json.dumps(a.get('stateDetails'))[:300])
    print('   videoAsset', json.dumps(a.get('videoAsset'))[:400])
    print('   preview', json.dumps(a.get('previewFrameImage'))[:500], a.get('previewFrameTimeCode'))
    ps, pj = call('GET', f"/v1/appAssetLibraryVideos/{v['id']}/placements?limit=20")
    for p in pj.get('data', []): print('   placement', p['attributes'].get('placementType'), p['attributes'].get('state'), json.dumps(p['attributes'].get('stateDetails'))[:200])
    pst = ((a.get('previewFrameImage') or {}).get('state') or {}).get('state')
    if pst == 'FAILED':
        tc = os.environ.get('PF_POSTER', '00:00:01:00')
        s2, r2 = call('PATCH', '/v1/appAssetLibraryVideos/' + v['id'], {'data': {'type': 'appAssetLibraryVideos', 'id': v['id'], 'attributes': {'previewFrameTimeCode': tc}}})
        print('   preview failed: asked again at', tc, s2, '' if s2 == 200 else errs(r2))
        for _ in range(12):
            time.sleep(10); s3, r3 = call('GET', '/v1/appAssetLibraryVideos/' + v['id']); pf = (r3.get('data') or {}).get('attributes', {}).get('previewFrameImage'); print('   preview now', json.dumps(pf)[:300])
            if ((pf or {}).get('state') or {}).get('state') != 'PROCESSING': break
