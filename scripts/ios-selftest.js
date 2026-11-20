// Simulator self-test (only in a [simtest] diagnostics build, never in TestFlight or the App Store):
// walks the reviewer's path through the real app in the iOS Simulator — the Guide's "Show me everything now",
// Battle, Look and the free try, the paywall, a built-in picture, Compose, Settings — and writes each step
// and every error on the debug overlay, so the simulator's screenshots show what happened.
(function () {
  var log = function (s) { try { (window.__pfdbg || console.log)(s); } catch (e) {} };
  var step = function (s) { log('▶ ' + s); try { var d = document.getElementById('pfstep'); if (!d) { d = document.createElement('div'); d.id = 'pfstep'; d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(120,0,90,.85);color:#fff;font:bold 12px Menlo,monospace;padding:4px 8px;pointer-events:none'; document.body.appendChild(d); } d.textContent = 'SELFTEST ' + s; } catch (e) {} };
  var vis = function (e) { if (!e) return false; var r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) return false; var h = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))); return !!h && (h === e || e.contains(h) || h.contains(e)); };
  var all = function (sel) { return [].slice.call(document.querySelectorAll(sel)); };
  var byText = function (re, sel) { return all(sel || 'button,[role=button]').filter(function (e) { return re.test((e.innerText || e.getAttribute('aria-label') || '').trim()) && vis(e); }).sort(function (a, b) { return (a.innerText || '').length - (b.innerText || '').length; })[0]; };
  var click = function (e, name) { if (!e) { log('MISSING ' + name); return false; } try { e.scrollIntoView({ block: 'center', inline: 'center' }); } catch (x) {} e.click(); log('ok ' + name); return true; };
  var esc = function () { try { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } catch (e) {} };
  var closeX = function () { var x = all('button').filter(function (b) { var r = b.getBoundingClientRect(); return vis(b) && r.top < 110 && r.width < 60 && (/close|✕|×/i.test(b.getAttribute('aria-label') || b.innerText || '') || b.querySelector('path[d="M6 6l12 12M18 6L6 18"]')); })[0]; if (x) { x.click(); return true; } esc(); return false; };
  var tiles = function () { return all('button').filter(function (b) { var r = b.getBoundingClientRect(); return vis(b) && r.width > 95 && r.width < 135 && r.height > 90 && r.height < 135; }).sort(function (a, b) { return a.getBoundingClientRect().left - b.getBoundingClientRect().left; }); };
  var rows = function () { var t = tiles(), tb = Math.max.apply(null, t.map(function (b) { return b.getBoundingClientRect().bottom; }).concat([0])); return all('button').filter(function (b) { var r = b.getBoundingClientRect(); return vis(b) && r.width > 300 && r.top > tb; }).sort(function (a, b) { return a.getBoundingClientRect().top - b.getBoundingClientRect().top; }); };
  var tapAt = function (x, y) { var e = document.elementFromPoint(x, y); if (!e) return; var o = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true }; try { e.dispatchEvent(new PointerEvent('pointerdown', o)); setTimeout(function () { e.dispatchEvent(new PointerEvent('pointerup', o)); }, 90); } catch (x) {} };
  var S = [
    [12000, 'start', function () { step('1 app open'); }],
    [1500, 'skip intro', function () { click(byText(/^(Skip)$/i), 'Skip'); }],
    [10000, 'menu', function () { step('2 menu'); click(document.querySelector('.pf-st-word'), 'menu'); }],
    [2500, 'guide', function () { click(byText(/Guide/), 'Guide tile'); }],
    [3000, 'show all', function () { step('3 Guide: Show me everything now'); var e = all('button,[role=button],div').filter(function (e) { return /Show me everything now/.test(e.innerText || '') && vis(e); }).sort(function (a, b) { return a.innerText.length - b.innerText.length; })[0]; click(e, 'Show me everything now'); }],
    [3000, 'close guide', function () { closeX(); }],
    [1200, 'close menu', function () { closeX(); esc(); }],
    [2500, 'battle', function () { step('4 Battle tab'); click(byText(/^Battle$/), 'Battle tab'); }],
    [12000, 'studio', function () { step('5 back to Studio'); click(byText(/^Studio$/), 'Studio tab'); }],
    [3000, 'change', function () { step('6 Look + free try'); click(all('.pf-st-chg').filter(vis)[0], '✦ Change'); }],
    [2200, 'painter', function () { click(tiles()[2], 'Painter tile'); }],
    [2200, 'look', function () { click(rows()[0], 'Look'); }],
    [3000, 'try', function () { var m = document.querySelector('.pf-try-mk'); log('try marker ' + !!m); var s = m && m.nextElementSibling; while (s && s.tagName !== 'BUTTON') s = s.nextElementSibling; click(s, 'locked painter (try)'); }],
    [6000, 'paywall', function () { step('7 next locked → paywall'); var b = all('button[data-k]').filter(function (b) { return vis(b) && /🔒/.test(b.innerText || ''); })[0]; click(b, 'next locked painter'); }],
    [6000, 'close paywall', function () { log('restore on paywall: ' + /Restore/i.test(document.body.innerText)); closeX(); }],
    [2000, 'image', function () { step('8 Image → built-in sample'); esc(); click(all('.pf-st-chg').filter(vis)[0], '✦ Change'); }],
    [2200, 'image tile', function () { click(tiles()[1], 'Image tile'); }],
    [2200, 'your picture', function () { click(rows()[0], 'Your picture'); }],
    [2500, 'sample', function () { click(rows()[0], 'Built-in sample'); }],
    [14000, 'compose', function () { step('9 Compose'); esc(); click(all('.pf-st-chg').filter(vis)[0], '✦ Change'); }],
    [2200, 'music tile', function () { click(tiles()[0], 'Music tile'); }],
    [2200, 'compose row', function () { click(byText(/^Compose/), 'Compose'); }],
    [3000, 'keys', function () { [40, 95, 150, 205, 260, 315].forEach(function (x, i) { setTimeout(function () { tapAt(x, innerHeight - 40); }, i * 450); }); }],
    [5000, 'home', function () { step('10 Settings'); var h = all('button').filter(function (b) { var r = b.getBoundingClientRect(); return vis(b) && r.left < 60 && r.top < 70 && r.width < 56; })[0]; click(h, 'home ⌄'); }],
    [3000, 'menu2', function () { click(document.querySelector('.pf-st-word'), 'menu'); }],
    [2500, 'settings', function () { click(byText(/^Settings/), 'Settings'); }],
    [4000, 'done', function () { step('DONE'); log('SELFTEST DONE'); }]
  ];
  var i = 0;
  var K = 2.5;   // the simulator on a CI Mac takes a screenshot only every ~15 s: each step is held long enough to be caught
  var next = function () { if (i >= S.length) return; var s = S[i++]; setTimeout(function () { try { s[2](); } catch (e) { log('STEP ERR ' + s[1] + ' ' + (e && e.message)); } next(); }, s[0] * K); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', next); else next();
})();
