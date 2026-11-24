# How the App Preview videos were made

`ios/asc/preview/<LANG>.mp4` — 886 × 1920, 30 fps, 22 s, H.264 + AAC, one per language (EN SK DE FR ES PT zh zhTW ja).
Everything on screen comes from the app itself (a local build of `dev`, opened in a headless browser at 443 × 960):

1. `tl.js` — a painting chord by chord: the Studio paused, the progress line held and moved, the paint canvas saved at each chord
   (the canvas is rendered at 3× for this, see `lib.js`). Clair de lune as Hokusai, Klimt, Monet, Mondrian, Kandinsky.
2. `fin.js` — the finished painting of the other painters (the quick swipes and the wall at the end).
3. `ui_all.js` — the Studio's own chrome in each language, taken once over black and once over white, so that it can be laid over
   any painting with its real transparency; and the screen of The Kiss playing as music.
4. `kiss.js` — The Kiss played as music, the whole pass in real time (the scanning light), time-lapsed in the video.
5. `aud.js` — Clair de lune recorded from the app's own audio output.
6. `layers.js` + `texts.js` — the headlines as transparent layers, in the type of the App Store screenshots.
7. `pace.py` — how much each chord changes the picture (used to choose an even pace).
8. `mk.py` — puts it together frame by frame and encodes it (`PV_LANG=SK python3 mk.py out.mp4`).

The scripts expect a small capture rig (a Playwright page with touch input and an audio tap) that is not part of the repo.
Upload: `ios/asc/asc_preview.py`, run by a commit marked `[asc] [asc-preview]`.
