import * as Tone from "tone";
import { useState, useRef, useEffect, useCallback, useMemo, memo, Fragment } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// §1  CONSTANTS & MATH UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
const PHI = 1.6180339887;
const IMG_TARGET_MS = 120000; // fallback duration only; real length now scales with image energy (~1:30–2:40)
const CWIN = 55;
const KB_WIN = 65;
const DN = 25, DB = 16, DH = 26;
const GOLD = '#c9a84c';
// ── Feature flag: first-visit onboarding (v3 "show, don't tell") ─────────────
// When true, first-time visitors see a hero canvas preview ("Liebestraum × Miró")
// with a big play button instead of the standard setup tile grid. After the
// sample plays — or the user taps "skip" — we set localStorage so they never
// see it again. Setting this to `false` disables the entire onboarding flow
// instantly: the app falls back to the current setup screen for everyone. No
// other code paths change.
const ONBOARDING_V3 = true;
// ── Playful design tokens (added v2.6.0) ────────────────────────────────────
// Layered dark surfaces + bright cream text + saturated accents. Used across
// the redesigned control panel. Buttons lift + glow on interaction.
//
// GOLD ROLES (two intentional golds — keep them distinct, don't blend):
//   • goldQuiet  #c9a84c (= GOLD, = rgba(201,168,76,a)) — the calm ochre used
//     for borders, hairlines, muted labels, resting UI. The workhorse gold.
//   • gold       #f0c040 — the BRIGHT gold reserved for emphasis: the wordmark,
//     active/primary accents, focus glow. Use sparingly so it stays special.
//   • gold2      #ffd96e — the lightest gold, for glow/hover highlights only.
// Helper goldA(a) builds the quiet-gold rgba so call sites stop hand-writing
// rgba(201,168,76,a) (351 of them) and can't drift.
const PF = {
  bg:'#0e0c14', card:'#161320', card2:'#1d1929', card3:'#231f31',
  gold:'#f0c040', gold2:'#ffd96e', goldQuiet:'#c9a84c', goldQuietRGB:'201,168,76',
  cream:'#f2eee8', muted:'rgba(242,238,232,0.42)', faint:'rgba(242,238,232,0.1)',
  blue:'#5b9cf6', purple:'#a97ff5', green:'#4ecb8d', orange:'#f47c3c', pink:'#f06292',
};
const goldA = (a)=>`rgba(${PF.goldQuietRGB},${a})`;
// Built once at module load — referenced by the render so the style string
// isn't re-interpolated on every React render (which thrashes during playback
// when setDisp fires many times per second).
const PF_STYLE = `
        /* Stop iOS Safari from auto-inflating rem-based text in landscape
           orientation (which blew up the version footer on mobile-landscape).
           100% = no change to desktop; just disables automatic text scaling. */
        html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
        @keyframes pf-fadeUp { from { opacity:0; transform:translateY(14px);} to { opacity:1; transform:translateY(0);} }
        @keyframes pf-flip-nudge {
          0%,100% { opacity:.55; transform:translateX(0) scale(1); }
          50% { opacity:1; transform:translateX(3px) scale(1.18); }
        }
        @keyframes pf-artist-glow {
          0%   { opacity:.4; text-shadow:0 0 0 rgba(240,192,64,0); }
          35%  { opacity:1;  text-shadow:0 0 12px rgba(240,192,64,.6); }
          100% { opacity:1;  text-shadow:0 0 0 rgba(240,192,64,0); }
        }
        .pf-artist-glow { animation: pf-artist-glow .55s ease both; }
        @keyframes pf-breathe {
          0%,100% { transform:scale(1);    box-shadow:0 0 0 0 rgba(220,180,90,.30); }
          50%     { transform:scale(1.06); box-shadow:0 0 0 12px rgba(220,180,90,0); }
        }
        .pf-breathe { animation: pf-breathe 2.4s ease-in-out infinite; }
        .pf-fade { animation: pf-fadeUp .5s ease both; }
        .pf-setup-stage { display: none; }
        .pf-tool { transition: all .18s; }
        .pf-tool, .pf-morph, .pf-vary, .pf-lift { -webkit-tap-highlight-color:transparent; }
        .pf-tool:focus, .pf-tool:focus-visible { outline:none!important; }
        .pf-tool .pf-glyph { transition: transform .18s; display:inline-block; }
        .pf-lift { transition: all .18s; }
        .pf-midi, .pf-audio, .pf-score, .pf-image, .pf-compose, .pf-mic, .pf-moodtile, .pf-mfitile { transition: all .18s; }
        .pf-chip { transition: all .18s; }

        /* ─── SETUP SCREEN · VARIANT A · UNIVERSAL VISUAL ───────────────────
           These rules apply across ALL layouts (mobile portrait, mobile
           landscape, tablet portrait, tablet landscape, desktop). Layout-
           specific bits (flex direction, height, grid columns) live in the
           per-breakpoint @media blocks below. The premise is that the chip's
           VISUAL identity — subtle white border, subtle tint background,
           sentence case, no caps, 16px radius — should be consistent
           regardless of orientation. Color stays only in the icon + text. */
        .pf-setup-create-import-wrap {
          background: rgba(20,18,30,.55) !important;
          border-color: rgba(255,255,255,.04) !important;
          border-radius: 24px !important;
        }
        .pf-setup-create-import-wrap .pf-moodtile,
        .pf-setup-create-import-wrap .pf-mfitile,
        .pf-setup-create-import-wrap .pf-compose,
        .pf-setup-create-import-wrap .pf-mic,
        .pf-setup-create-import-wrap .pf-tool {
          border-radius: 16px !important;
          text-transform: none !important;
          letter-spacing: 0 !important;
          font-weight: 500 !important;
          background-color: rgba(255,255,255,.015) !important;
          background-image: none !important;
          border: 1px solid rgba(255,255,255,.06) !important;
          box-shadow: none !important;
        }
        /* Section labels (TVORBA / IMPORT): subtle uppercase across layouts. */
        .pf-setup-create-import-wrap .pf-setup-col > div > div:first-child {
          text-transform: uppercase !important;
          letter-spacing: .14em !important;
          font-weight: 500 !important;
          color: rgba(242,238,232,.45) !important;
        }
        /* Uniform icon size across all layouts. */
        .pf-setup-create-import-wrap .pf-chip-icon {
          font-size: 1.2rem !important;
          line-height: 1 !important;
          flex-shrink: 0 !important;
        }
        .pf-setup-create-import-wrap .pf-chip-icon > svg {
          width: 1.2rem !important;
          height: 1.2rem !important;
        }
        .pf-setup-create-import-wrap .pf-chip-icon:has(> svg) {
          width: 1.2rem !important;
          height: 1.2rem !important;
        }
        /* ── Picker frame tint — GLOBAL (applies on the centered MOBILE modal
           too, not only the desktop pinned column). Each source keeps its colour
           identity. border-color only; positioning is layout-specific elsewhere. */
        .pf-app-root .pf-picker-overlay.pf-picker-music .pf-picker-dialog { border-color: rgba(91,156,246,.5) !important; }
        .pf-app-root .pf-picker-overlay.pf-picker-image .pf-picker-dialog { border-color: rgba(244,124,60,.5) !important; }
        .pf-app-root .pf-picker-overlay.pf-picker-mfi   .pf-picker-dialog { border-color: rgba(220,150,255,.5) !important; }
        .pf-app-root .pf-picker-overlay.pf-picker-mic   .pf-picker-dialog { border-color: rgba(240,106,166,.5) !important; }
        .pf-app-root .pf-recent-overlay.pf-picker-mood    .pf-mood-dialog,
        .pf-app-root .pf-recent-overlay.pf-picker-mood    .pf-recent-dialog { border-color: rgba(201,168,76,.5) !important; }
        .pf-app-root .pf-recent-overlay.pf-picker-compose .pf-recent-dialog { border-color: rgba(78,203,141,.5) !important; }
        .pf-app-root .pf-recent-overlay.pf-picker-mic     .pf-recent-dialog { border-color: rgba(240,106,166,.5) !important; }
        /* All hover affordances gated to real pointers. On touch screens :hover
           "sticks" after a tap — which made SOURCE tiles (Score/Image) keep their
           coloured glow as if active. (hover:hover) keeps lifts/glows for mouse
           users only; touch taps no longer leave a tile stuck highlighted. */
        @media (hover:hover) and (pointer:fine) {
        /* wrap tile hover (gated: was sticking on touch as a faint grey frame) */
        .pf-setup-create-import-wrap .pf-moodtile:hover,
        .pf-setup-create-import-wrap .pf-mfitile:hover,
        .pf-setup-create-import-wrap .pf-compose:hover,
        .pf-setup-create-import-wrap .pf-mic:hover,
        .pf-setup-create-import-wrap .pf-tool:hover {
          background-color: rgba(255,255,255,.045) !important;
          border-color: rgba(255,255,255,.12) !important;
          transition: background-color .18s ease, border-color .18s ease;
        }
        .pf-tool:hover { transform: translateY(-2px); }
        .pf-tool:hover .pf-glyph { transform: scale(1.2); }
        .pf-lift:hover { transform: translateY(-1px); }
        .pf-chip:hover { transform: translateY(-1px); }
        .pf-dice:hover { transform: translateY(-50%) rotate(20deg) !important; border-color: rgba(255,200,120,.4) !important; }
        .pf-midi:hover  { transform: translateY(-2px); box-shadow:0 5px 18px rgba(91,156,246,.22) !important; }
        .pf-audio:hover { background:rgba(244,124,60,.12)!important; border-color:${PF.orange}!important; box-shadow:0 4px 16px rgba(244,124,60,.22); }
        .pf-score:hover { background:rgba(169,127,245,.12)!important; border-color:${PF.purple}!important; box-shadow:0 4px 16px rgba(169,127,245,.22); }
        .pf-image:hover { transform: translateY(-2px); box-shadow:0 5px 18px rgba(244,124,60,.22) !important; }
        .pf-compose:hover { transform: translateY(-2px); box-shadow:0 5px 18px rgba(78,203,141,.25) !important; }
        .pf-moodtile:hover { transform: translateY(-2px); box-shadow:0 5px 18px rgba(201,168,76,.22) !important; }
        .pf-mfitile:hover { transform: translateY(-2px); box-shadow:0 5px 18px rgba(220,150,255,.22) !important; }
        .pf-mic:hover { transform: translateY(-2px); box-shadow:0 5px 18px rgba(240,106,166,.22) !important; }
        .pf-morph:hover { transform: translateY(-1px); box-shadow:0 4px 16px rgba(169,127,245,.4); }
        .pf-vary:hover { transform: translateY(-1px); box-shadow:0 4px 16px rgba(244,124,60,.4); }
        .pf-moodcta:hover { border-color:${PF.gold2}!important; transform: translateY(-1px); box-shadow:0 6px 24px rgba(240,192,64,.18); }
        .pf-tab:hover:not(.pf-tab-on) { background:${PF.card3}!important; color:${PF.cream}!important; }
        .pf-artist:hover:not(.pf-artist-on) { color:${PF.cream}!important; border-color:rgba(242,238,232,.25)!important; transform:translateY(-1px); }
        /* Guide modal up/down nav arrows — DESKTOP ONLY (mouse pointer).
           Tight vertical rail on the left, just above + below the progress
           dots stack with ~14px breathing room. Touch devices (mobile/tablet
           in any orientation) get no arrows — they use swipe gesture. */
        .pf-guide-panel .pf-guide-nav {
          display: block !important;
          position: absolute !important;
          left: 24px !important;
          right: auto !important;
          top: 0 !important;
          bottom: 0 !important;
          width: 28px !important;
          pointer-events: none !important;
          z-index: 5 !important;
        }
        .pf-guide-panel .pf-guide-nav > button {
          pointer-events: auto !important;
          position: absolute !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          width: 24px !important;
          height: 24px !important;
          border-radius: 50% !important;
          background: transparent !important;
          border: 1px solid rgba(255,255,255,.1) !important;
          color: rgba(230,222,196,.55) !important;
          font-size: .75rem !important;
          transition: border-color .18s, color .18s !important;
        }
        .pf-guide-panel .pf-guide-nav > button:hover:not(:disabled) {
          border-color: rgba(220,180,90,.6) !important;
          color: rgba(220,180,90,.95) !important;
        }
        .pf-guide-panel .pf-guide-nav > .pf-guide-nav-prev { top: calc(50% - 140px) !important; }
        .pf-guide-panel .pf-guide-nav > .pf-guide-nav-next { top: calc(50% + 140px) !important; }
        .pf-guide-panel .pf-guide-nav > .pf-guide-nav-pos { display: none !important; }
        }
        /* Mosaic while Shuffle is drawing an artist: stays muted/grey, no hover
           lift — it is NOT the active choice (the drawn style's outline is). */
        .pf-art-shuf, .pf-art-shuf:hover { color:${PF.muted}!important; border-color:rgba(242,238,232,.08)!important; transform:none!important; box-shadow:none!important; }
        .pf-artist, .pf-dice { outline:none!important; -webkit-tap-highlight-color:transparent; }
        .pf-artist:focus, .pf-artist:focus-visible, .pf-dice:focus, .pf-dice:focus-visible { outline:none!important; box-shadow:none; }
        .pf-artist-on:focus, .pf-artist-on:focus-visible { box-shadow:0 3px 10px rgba(240,192,64,.3)!important; }
        /* Fullscreen exit button: on MOBILE only, hang above the canvas when
           immersive (in the surrounding dark area). On desktop the shell media
           query below keeps the button inside the canvas (default top:8). */
        .pf-fs-btn-immersive { top: -44px !important; }
        /* ── Desktop landscape shell — STAGE 1A (widened column) ──────────────
           Paintiano is designed mobile-first. On wider screens we previously
           framed the whole app inside a narrow 480px phone column. Stage 1A
           widens that column to a comfortable landscape width so the canvas and
           controls can breathe on a PC, while keeping the app's single-column
           JSX layout untouched. (A later stage splits this into a true two-pane
           tools-left / stage-right grid.)
           Mobile (<769px): no changes, app fills the viewport edge-to-edge. */
        /* Mobile: hide the desktop left-edge transport wrapper entirely. It only
           materialises inside the @media block below (desktop play screen). */
        .pf-tx-edge-l { display: none; }
        /* INSPIRED BY row (artist palette header) — on DESKTOP only, restack
           from "label-centered + dice-absolute-right" to "label on top, dice
           below, centered". Avoids the dice button overlapping or hugging the
           label in narrow palette columns. Mobile keeps the absolute layout. */
        /* SETUP modal — 2-col layout applied UNIVERSALLY (mobile portrait,
           mobile landscape, tablet portrait, tablet landscape, desktop). The
           layout splits PALETTES left, ARTISTS right. Checkboxes sit on outer
           edges (2-thumb ergonomics: left thumb hits palette checks at left
           edge, right thumb hits artist checks at right edge). Locks (🔒) ride
           with artist names inside the label span, so they stay next to names
           regardless of row direction. */
        .pf-setup-body {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          grid-template-areas: "pal art" "tone art" "done art" !important;
          gap: 0 16px !important;
          align-items: start !important;
        }
        .pf-setup-palettes { grid-area: pal; display: flex; flex-direction: column; }
        .pf-setup-tones    { grid-area: tone; display: flex; flex-direction: column; }
        .pf-setup-artists  { grid-area: art; }
        .pf-setup-palettes .pf-setup-grid,
        .pf-setup-tones .pf-setup-grid,
        .pf-setup-artists .pf-setup-grid { grid-template-columns: 1fr !important; }
        /* PALETTES + TONES col: text right-aligned (toward center), checkbox at left edge */
        .pf-setup-palettes .pf-setup-grid > button > :last-child,
        .pf-setup-tones    .pf-setup-grid > button > :last-child { text-align: right !important; flex: 1; }
        /* ARTISTS col: row reversed → checkbox at right edge, text+lock left-aligned (toward center) */
        .pf-setup-artists  .pf-setup-grid > button { flex-direction: row-reverse !important; }
        .pf-setup-artists  .pf-setup-grid > button > span:last-child { text-align: left !important; }
        /* Section head (Artists / All / None): nudge slightly inward from the
           right edge so "None" stays visible on narrow mobile widths. */
        .pf-setup-artists > div:first-child { padding-right: 8px !important; }
        /* Section heads: keep the title + All/None group together on the left
           instead of justify-content: space-between (which pushed "None" off
           the right edge on narrow mobile portrait modals). */
        .pf-setup-palettes > div:first-child,
        .pf-setup-tones    > div:first-child,
        .pf-setup-artists  > div:first-child {
          justify-content: flex-start !important;
          gap: 16px !important;
        }
        @media (min-width: 769px) and (min-height: 501px),
               (max-height: 500px) and (orientation: landscape) {
          html, body {
            background: #050507 !important;
            min-height: 100vh;
            height: 100vh;
            overflow: hidden;
          }
          body {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 0;
          }
          #root {
            width: min(1600px, calc(100vw - 48px));
            height: 100vh;
            max-height: 100vh;
            background: radial-gradient(ellipse at 50% -10%, #0e0b16, #06060c 55%);
            box-shadow: 0 18px 60px rgba(0,0,0,.6), 0 0 0 1px rgba(242,238,232,.06);
            overflow-y: auto;
            overflow-x: hidden;
            position: relative;
            scrollbar-width: thin;
            scrollbar-color: rgba(201,168,76,.35) transparent;
          }
          #root::-webkit-scrollbar { width: 6px; }
          #root::-webkit-scrollbar-track { background: transparent; }
          #root::-webkit-scrollbar-thumb { background: rgba(201,168,76,.3); border-radius: 3px; }
          #root::-webkit-scrollbar-thumb:hover { background: rgba(201,168,76,.5); }
          /* The Paintiano root div has min-height:100vh which would overflow
             the shell on desktop. Override to fit the shell instead. */
          #root > div[style*="minHeight:100vh"],
          #root > div:first-child {
            min-height: auto !important;
          }
          /* On desktop, keep the fullscreen exit button inside the canvas —
             the mobile "hang above" position would land outside the shell. */
          .pf-fs-btn-immersive { top: 8px !important; }
          /* ── STAGE 3.4: two-pane landscape layout (tools-left / stage-right) ──
             The app root is normally a centered flex-column. On desktop we turn
             it into a CSS grid: a full-width top bar + header, then a 380px tools
             column on the left and the canvas stage on the right. Only the 5
             normal-flow blocks below get a grid-area; the ~43 position:fixed/
             absolute siblings (modals, overlays, hidden file inputs, the fixed
             transport dock, the immersive canvas) are taken out of grid flow by
             the spec, so they keep their own positioning untouched. Mobile
             (<769px) never sees this — the app stays a single column. */
          .pf-app-root {
            position: relative;
            display: grid !important;
            grid-template-columns: 180px minmax(0, 1fr) 180px;
            grid-template-rows: auto auto auto auto auto 1fr auto auto;
            grid-template-areas:
              "topbar   topbar topbar"
              "header   header header"
              "controls stage  rtop"
              "colors   stage  styles"
              "ltrans   stage  styles"
              ".        stage  rfab"
              "vfooter  vfooter vfooter"
              "legal    legal  legal";
            align-content: start !important;
            align-items: start !important;
            justify-items: stretch !important;
            column-gap: 24px;
            max-width: 100% !important;
            width: 100% !important;
            padding: 14px 24px 28px !important;
          }
          /* PLAY SCREEN — 3-column grid for LANDSCAPE viewports ≥769px
             AND height ≥501px (tablet landscape, desktop). Mobile landscape
             height ≤500px stays on the 3-col tablet-portrait grid inherited
             from the parent block. */
          @media (orientation: landscape) and (min-height: 501px) {
            .pf-app-root:not(.pf-mode-setup) {
              grid-template-columns: 180px minmax(0, 1fr) 180px !important;
              grid-template-rows: auto auto auto auto auto auto 1fr auto auto !important;
              grid-template-areas:
                "topbar   topbar  topbar"
                "header   header  header"
                "controls trkhd   rtop"
                "colors   stage   styles"
                "ltrans   stage   styles"
                ".        stage   rfab"
                ".        stage   ."
                "vfooter  vfooter vfooter"
                "legal    legal   legal" !important;
              column-gap: 24px !important;
            }
          }
          /* TABLET PORTRAIT (≥769px portrait): keep the original 3-column grid
             — canvas needs the full middle. The L/R transport split happens via
             a DIFFERENT mechanism (controls inside the side columns), not via
             new grid columns. So no override here; the default 3-col rule above
             already applies. */
          .pf-app-root > .pf-topbar {
            grid-area: topbar;
            max-width: 100% !important;
            position: relative;
            z-index: 2;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
          }
          /* Wordmark + PRO AI badge sit centered on the top bar's level (between
             the hamburger menu and the AA/lang control) instead of as a large
             standalone header below. Sits ABOVE the topbar's blur layer (z-index
             4 > 2) so the gold text stays crisp, not frosted; pointer-events:none
             lets clicks pass through to the hamburger / lang controls beneath. */
          .pf-app-root > header {
            grid-area: topbar;
            align-self: center;
            justify-self: center;
            margin: 0 !important;
            z-index: 4;
            pointer-events: none;
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 10px !important;
          }
          .pf-app-root > header h1 { font-size: 1.6rem !important; margin: 0 !important; line-height: 1 !important; }
          .pf-app-root > header > div { margin: 0 !important; display: inline-flex !important; align-items: center; transform: scale(.82); transform-origin: left center; }
          /* Help (?) button moves from the bottom-right FAB up next to the
             hamburger menu in the top-left, where help conventionally lives. */
          /* Help (?) sits next to the hamburger. position:absolute (NOT fixed) so
             it scrolls away with the top bar — fixed kept it pinned to the
             viewport, overlapping the left buttons when the page scrolled on
             short (phone-landscape) viewports. */
          .pf-app-root .pf-help-fab {
            position: static !important;
            grid-area: rfab !important;
            justify-self: end !important;
            align-self: start !important;
            margin: 18px 0 0 0 !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;
            bottom: auto !important;
            width: 34px !important;
            height: 34px !important;
            font-size: 17px !important;
            z-index: 100001 !important;
            pointer-events: auto !important;
          }
          /* SPÄŤ + NOVÁ HUDBA sit together in a row, top-left above the palettes. */
          .pf-app-root .pf-controls-inner { grid-area: controls; align-self: start; gap: 8px; margin-bottom: 10px; }
          /* Track head — mood title + library/AI badge — sits in its own row
             above the stage in the 5-col layout. Spans the stage column width
             so long morph chains ("yearning → calm → joy") read in full
             without truncation. Aligned to the bottom of its row so it nests
             snugly against the canvas. */
          .pf-app-root > .pf-track-head { grid-area: trkhd; align-self: end; justify-self: center; max-width: 100% !important; margin: 0 0 6px !important; }
          /* Progress/seek bar sits above the artists in the right column. */
          .pf-app-root > .pf-seek-block { grid-area: rtop; align-self: start; max-width: 100% !important; margin: 0 0 10px !important; }
          /* The active-view strip (pf-panel-part) and its inner grid wrapper are
             flattened with display:contents so their two inner columns —
             pf-colors-inner (left) and pf-styles-inner (right) — become direct
             grid items of the root, landing in the colors/styles areas with the
             canvas stage between them. Mobile (<769px) never hits this block, so
             the strip stays a normal stacked column there. */
          .pf-app-root > .pf-panel-part { display: contents !important; }
          .pf-app-root .pf-strip-grid { display: contents !important; }
          .pf-app-root .pf-colors-inner {
            grid-area: colors;
            align-self: start;
            background: var(--pf-card, #161320);
            border: 1px solid rgba(242,238,232,.08);
            border-radius: 18px;
            padding: 12px;
            gap: 14px !important;
          }
          /* Palettes stack vertically in the narrow left column, comfortably
             tall so each reads as a full-width choice (not a cramped chip). */
          .pf-app-root .pf-color-tabs {
            grid-template-columns: 1fr !important;
            gap: 7px !important;
          }
          .pf-app-root .pf-color-tabs > button { padding: 7px 6px !important; letter-spacing: .08em !important; font-size: calc(.56rem * var(--pf-read-scale, 1)) !important; }
          .pf-app-root .pf-styles-inner {
            grid-area: styles;
            align-self: start;
            background: var(--pf-card, #161320);
            border: 1px solid rgba(242,238,232,.08);
            border-radius: 18px;
            padding: 12px;
            gap: 14px !important;
          }
          /* Image-scan mode: the artist picker is hidden (the picture dictates
             colour), so the right column would be empty. Hide the empty styles
             box; the colour/scan panel stays in the left column, image centre. */
          /* Image-scan mode keeps the standard three columns: colours left (same
             as every mode), scan/AI + scan-direction right (where artists sit in
             other modes). Both panels are populated, so no special hiding needed. */
          /* Artists stack in a single column on the right, mirroring the
             palettes on the left — 9 pair chips + mosaic fit comfortably
             vertically and read cleaner than a squeezed multi-column grid. */
          .pf-app-root .pf-styles-inner [title^="painting style"] {
            grid-template-columns: 1fr !important;
            gap: 7px !important;
            row-gap: 7px !important;
          }
          .pf-app-root .pf-styles-inner .pf-artist { padding: 7px 6px !important; letter-spacing: .06em !important; font-size: calc(.56rem * var(--pf-read-scale, 1)) !important; }
          /* Setup view (pre-load) has no colors/styles split — its single panel
             part spans the left+stage area so the setup tiles + hero read well. */
          /* Setup view (pre-load): a single narrow left-column panel (mirrors the
             canvas-view tools column) so every control is one thumb-reach wide.
             Import + Create tiles stack vertically instead of 2-up. The PRIDAŤ
             HUDBU / mood dialogs are fixed-position modals, unaffected. */
          .pf-app-root > .pf-panel-part.pf-fade {
            display: contents !important;
          }
          /* The setup card wrapper is flattened so its two columns become direct
             grid items; each column then carries its own card chrome and lands in
             the colors (left) / styles (right) areas, with the stage between. */
          .pf-app-root > .pf-panel-part.pf-fade > div:not(.pf-setup-col-left):not(.pf-setup-col-right) { display: contents !important; }
          .pf-app-root > .pf-panel-part.pf-fade > button.pf-lift { grid-area: controls; align-self: start; justify-self: start; }
          .pf-app-root .pf-setup-col-left {
            grid-area: colors;
            align-self: start;
            background: var(--pf-card, #161320);
            border: 1px solid rgba(242,238,232,.08);
            border-radius: 18px;
            padding: 14px;
          }
          .pf-app-root .pf-setup-col-right {
            grid-area: styles;
            align-self: start;
            background: var(--pf-card, #161320);
            border: 1px solid rgba(242,238,232,.08);
            border-radius: 18px;
            padding: 14px;
          }
          .pf-app-root .pf-setup-import,
          .pf-app-root .pf-setup-create { grid-template-columns: 1fr !important; }
          /* All 6 setup source chips (mood · compose · mic · mood-from-image ·
             music · image) the SAME height in desktop/landscape — matched to the
             IMAGE chip (48px). Without this the two-line chips (How do you feel? /
             Mood from image) and the single-line ones came out different heights. */
          .pf-app-root .pf-moodtile,
          .pf-app-root .pf-mfitile,
          .pf-app-root .pf-compose,
          .pf-app-root .pf-mic,
          .pf-app-root .pf-setup-import .pf-tool {
            min-height: 48px !important;
            height: 48px !important;
            box-sizing: border-box !important;
          }
          .pf-app-root > .pf-stage-part {
            grid-area: stage;
            max-width: 100% !important;
            margin-left: 0; margin-right: 0;
            align-self: center;
            justify-self: center;
          }
          /* Image-scan mode: the <img> overlay (position:absolute, inset:0) fills
             the stage wrap, but the scan <canvas> is capped at 560px inline. On a
             wide landscape column the wrap stretched well past 560px, so the
             painting and the scan canvas no longer lined up. Pin BOTH wrap and
             canvas to the same width so they always overlap. */
          .pf-mode-imagescan > .pf-stage-part {
            max-width: min(100%, 560px) !important;
            width: 100% !important;
          }
          .pf-mode-imagescan > .pf-stage-part > canvas {
            max-width: 100% !important;
          }
          /* Setup-view centre placeholder (desktop): a quiet golden-ratio frame
             that fills the stage column before any source is loaded. */
          .pf-app-root > .pf-setup-stage {
            grid-area: stage;
            align-self: center;
            justify-self: stretch;
            width: 100%;
            max-width: 720px;
            margin: 0 auto;
          }
          /* SETUP mode: the placeholder stays in the centre column. The right
             column now holds the IMPORT panel (mood-from-image / music / image),
             so the placeholder must NOT span into it (that caused an overlap). */
          .pf-mode-setup > .pf-setup-stage {
            grid-column: 2 / 3;
            max-width: 720px;
            height: min(calc(100vh - 170px), 82vh);
            border: 1px solid rgba(201,168,76,.10);
            border-radius: 10px;
            background:
              linear-gradient(rgba(201,168,76,.012), rgba(201,168,76,.012)),
              repeating-linear-gradient(0deg, transparent, transparent 38px, rgba(201,168,76,.03) 38px, rgba(201,168,76,.03) 39px),
              repeating-linear-gradient(90deg, transparent, transparent 38px, rgba(201,168,76,.03) 38px, rgba(201,168,76,.03) 39px);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .pf-setup-stage-inner { text-align: center; padding: 24px; }
          .pf-setup-stage-mark {
            font-family: 'Cormorant Garamond', serif;
            font-size: 2.4rem;
            font-weight: 600;
            letter-spacing: .04em;
            background: linear-gradient(135deg, rgba(255,217,110,.28), rgba(201,168,76,.18));
            -webkit-background-clip: text; background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 12px;
          }
          .pf-setup-stage-hint {
            font-size: .8rem;
            letter-spacing: .04em;
            color: rgba(242,238,232,.32);
            font-style: italic;
            max-width: 280px;
            margin: 0 auto;
            line-height: 1.5;
          }
          /* SETUP-VIEW PICKER: when a source mode is chosen in setup, the
             sample/file picker appears in the RIGHT column (where artists sit in
             active view) instead of as a full-screen modal — contextual, keeps
             the two-thumb layout. The dim full-screen backdrop is dropped; the
             dialog flows into the styles area. Mobile keeps the modal. */
          .pf-app-root .pf-picker-overlay {
            position: absolute !important;
            inset: 0 !important;
            background: transparent !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            display: block !important;
            padding: 0 !important;
            pointer-events: none !important;
            z-index: 100002 !important;
          }
          .pf-app-root .pf-picker-overlay .pf-picker-dialog {
            position: absolute !important;
            top: 150px !important;
            right: 24px !important;
            left: auto !important;
            width: 180px !important;
            max-width: 180px !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
            background: linear-gradient(180deg, rgba(24,21,34,.92), rgba(14,12,20,.92)) !important;
            border: 1px solid rgba(201,168,76,.28) !important;
            border-radius: 18px !important;
            padding: 16px 12px !important;
            box-shadow: 0 12px 40px rgba(0,0,0,.4) !important;
            pointer-events: auto !important;
          }
          /* Per-mode picker frame tint — matches the source colour identity
             so the picker visually reads as "this is the music / image / etc.
             input". Default (mood) keeps gold; the four import / mic sources
             get their own colour. */
          .pf-app-root .pf-picker-overlay.pf-picker-music .pf-picker-dialog {
            border-color: rgba(91,156,246,.45) !important;
            box-shadow: 0 12px 40px rgba(0,0,0,.4), 0 0 0 1px rgba(91,156,246,.08) !important;
          }
          .pf-app-root .pf-picker-overlay.pf-picker-image .pf-picker-dialog {
            border-color: rgba(244,124,60,.45) !important;
            box-shadow: 0 12px 40px rgba(0,0,0,.4), 0 0 0 1px rgba(244,124,60,.08) !important;
          }
          .pf-app-root .pf-picker-overlay.pf-picker-mfi .pf-picker-dialog {
            border-color: rgba(220,150,255,.45) !important;
            box-shadow: 0 12px 40px rgba(0,0,0,.4), 0 0 0 1px rgba(220,150,255,.08) !important;
          }
          .pf-app-root .pf-picker-overlay.pf-picker-mic .pf-picker-dialog {
            border-color: rgba(240,106,166,.45) !important;
            box-shadow: 0 12px 40px rgba(0,0,0,.4), 0 0 0 1px rgba(240,106,166,.08) !important;
          }
          /* Recent / mood pickers share the same per-mode tinting scheme via
             a .pf-picker-{mood,compose,mic} class on the overlay. The dialog
             child gets the colored border + a subtle outer 1px glow. */
          .pf-app-root .pf-recent-overlay.pf-picker-mood .pf-recent-dialog,
          .pf-app-root .pf-recent-overlay.pf-picker-mood .pf-mood-dialog {
            border-color: rgba(201,168,76,.45) !important;
            box-shadow: 0 12px 40px rgba(0,0,0,.4), 0 0 0 1px rgba(201,168,76,.08) !important;
          }
          .pf-app-root .pf-recent-overlay.pf-picker-compose .pf-recent-dialog {
            border-color: rgba(78,203,141,.45) !important;
            box-shadow: 0 12px 40px rgba(0,0,0,.4), 0 0 0 1px rgba(78,203,141,.08) !important;
          }
          .pf-app-root .pf-recent-overlay.pf-picker-mic .pf-recent-dialog {
            border-color: rgba(240,106,166,.45) !important;
            box-shadow: 0 12px 40px rgba(0,0,0,.4), 0 0 0 1px rgba(240,106,166,.08) !important;
          }
          /* IMPORT-source pickers (mood-from-image / music / image) sit in the
             RIGHT column, so their picker opens on the LEFT to avoid covering the
             panel it came from. Mood (left column) keeps its right-side picker. */
          .pf-app-root .pf-picker-overlay.pf-picker-left .pf-picker-dialog {
            left: 24px !important;
            right: auto !important;
          }
          /* Picker buttons wrap their label instead of overflowing the 180px column. */
          .pf-app-root .pf-picker-overlay .pf-picker-dialog button {
            white-space: normal !important;
            word-break: break-word !important;
            padding-left: 8px !important;
            padding-right: 8px !important;
          }
          /* Compose / Mic are live play — no import picker belongs there. If one is
             somehow open, hide it (it shouldn't overlay the canvas). */
          .pf-mode-live .pf-picker-overlay { display: none !important; }
          /* Recent + mood pickers (compose-recent, mic-recent, new-mood) — unify
             with the source picker: on desktop the dialog is pinned into the
             RIGHT column (same 180px / right:24px slot as the artists), instead of
             a centered fullscreen modal. The overlay backdrop is made transparent
             and click-through; only the dialog itself catches clicks. */
          .pf-app-root .pf-recent-overlay {
            position: absolute !important;
            inset: 0 !important;
            background: transparent !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            display: block !important;
            padding: 0 !important;
            pointer-events: none !important;
            z-index: 100002 !important;
          }
          .pf-app-root .pf-recent-overlay .pf-recent-dialog {
            position: absolute !important;
            top: 150px !important;
            right: 24px !important;
            left: auto !important;
            width: 180px !important;
            max-width: 180px !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
            pointer-events: auto !important;
          }
          /* The mood menu is taller (input + preset list) — a touch wider + capped
             height so it stays usable pinned in the right column. */
          .pf-app-root .pf-mood-overlay .pf-mood-dialog {
            width: 220px !important;
            max-width: 220px !important;
            max-height: calc(100vh - 175px) !important;
            overflow-y: auto !important;
          }
          /* Fullscreen (immersive) control bar — HARMONY / NEXT / SHOW / SAVE.
             Position is set inline in JSX (it needs the live canvas width CW/CH to
             land in the black space just right of the centered portrait canvas).
             Here we only size the buttons compactly. */
          .pf-immersive .pf-fs-controls > button {
            width: 100% !important;
            padding: 10px 12px !important;
            font-size: .58rem !important;
          }
          /* SETUP modal — three-column override for desktop: insert empty
             middle column between PALETTES and ARTISTS so they breathe on
             wider screens. The base 2-col layout + 2-thumb rules apply
             globally; here we just swap to 3-col grid and pin DONE. */
          .pf-setup-dialog { max-width: 860px !important; }
          /* Desktop + tablet portrait/landscape: 2-col layout. Palettes on
             the left, Artists on the right. HOTOVO chip stays in the modal
             footer (the in-Tone variant was used when Tone lived in Setup
             — that's now on the main canvas screen). */
          .pf-setup-body {
            grid-template-columns: 1fr 1fr !important;
            grid-template-areas: "pal art" "tone art" !important;
            gap: 0 28px !important;
          }
          .pf-setup-palettes { grid-area: pal; height: auto; }
          .pf-setup-tones    { grid-area: tone; height: auto; }
          .pf-setup-artists  { grid-area: art; }
          /* Palette-column DONE stays hidden in 2-col (footer DONE is used). */
          .pf-setup-done-pal { display: none !important; }
          /* Version footer + legal links span all three columns at the very
             bottom of the grid (it's a version/legal footer, so it belongs at the
             page foot — not floating in the middle of the layout). */
          .pf-app-root > .pf-version-footer { grid-area: vfooter; width: 100%; }
          .pf-app-root > .pf-legal-links { grid-area: legal; width: 100%; }
          /* ── Guide / Concept / Book modal — two-thumb desktop layout.
             Panel widens to a comfortable reading width; categories move to a
             vertical list on the RIGHT (right thumb), progress bars sit on the
             LEFT (mirror of Concept), and up/down nav buttons appear bottom
             left+right so both thumbs can page through cards. Mobile keeps the
             narrow swipe deck untouched. */
          .pf-guide-panel {
            max-width: 920px !important;
            border-left: 1px solid rgba(201,168,76,.12) !important;
            border-right: 1px solid rgba(201,168,76,.12) !important;
          }
          /* Categories → vertical column pinned to the right, vertically centered */
          .pf-guide-panel .pf-guide-cats {
            position: absolute !important;
            right: 24px !important;
            top: 50% !important;
            transform: translateY(-50%) !important;
            flex-direction: column !important;
            width: 132px !important;
            max-height: 70vh !important;
            overflow-y: auto !important;
            padding: 0 !important;
            gap: 7px !important;
            z-index: 4 !important;
          }
          .pf-guide-panel .pf-guide-cats > button { width: 100% !important; text-align: center !important; }
          /* Progress dots → vertical bars on the LEFT (like Concept's rhythm) */
          .pf-guide-panel .pf-guide-progress {
            left: 24px !important;
            right: auto !important;
          }
          .pf-guide-panel .pf-guide-progress > button {
            width: 6px !important;
            border-radius: 3px !important;
          }
          /* Give the swipe deck breathing room either side so the card sits
             centered between the progress bars (left) and categories (right). */
          .pf-guide-panel .pf-guide-deck:not(.pf-guide-cats) > .pf-guide-card {
            padding-left: 80px !important;
            padding-right: 170px !important;
          }
          /* Hide the old bottom-left position indicator (nav has its own) */
          .pf-guide-panel > div[style*="bottom: 18px"] { display: none !important; }
          /* Mood-from-image source thumbnail: centered at the TOP of the stage
             column, above the big canvas (same as mobile) — not floating in the
             left tools column where grid auto-placement would otherwise drop it. */
          /* Mood-from-image source thumbnail: it sits deep in the tree (not a
             direct grid child), so grid-area won't move it. Instead pin it
             centered horizontally over the stage column, just below the header,
             like mobile shows it above the canvas. */
          .pf-app-root .pf-mood-thumb {
            position: absolute;
            left: 50%;
            top: 132px;
            transform: translateX(-50%);
            z-index: 6;
            margin: 0 !important;
            pointer-events: none;
          }
          /* ── Two-thumb ergonomics: transport flows in the LEFT column directly
             under the palettes (one continuous tools column), so it sits where
             the left thumb rests. Not fixed — it's a grid item, no overlap. Its
             control row stacks vertically. Mobile keeps the bottom dock. ── */
          .pf-app-root > .pf-transport-dock {
            position: static !important;
            grid-area: ltrans;
            align-self: start;
            margin-top: 12px;
            left: auto !important; right: auto !important; bottom: auto !important; top: auto !important;
            width: auto !important;
            background: var(--pf-card, #161320) !important;
            border-top: none !important;
            border: 1px solid rgba(242,238,232,.08) !important;
            border-radius: 18px !important;
            padding: 12px !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
          }
          /* Play screen LANDSCAPE: now uses the SAME 3-column grid as tablet
             portrait. The transport dock stays at ltrans (the left column, under the palettes)
             in the left column (see the .pf-transport-dock rule above), so no
             right-edge (txR) relocation is needed. The left-edge wrapper
             (.pf-tx-edge-l) stays hidden; the dock shows all controls. */
          .pf-transport-dock .pf-transport-row {
            flex-direction: column !important;
            flex-wrap: nowrap !important;
            gap: 7px !important;
            align-items: stretch !important;
            margin-bottom: 0 !important;
          }
          .pf-transport-dock .pf-transport-row > button { width: 100% !important; justify-content: center !important; }
          /* Recording save row inside the dock: on desktop ≥769px (both
             orientations) the dock is a narrow vertical column, so the inner
             horizontal flex row (name + size + share + ×) squeezes into a
             garbled red blob. Stack everything vertically so the input,
             share button, and × button each get a full row. Mobile (<769px,
             dock fixed at the bottom across the full viewport) keeps the
             horizontal layout — that's where it reads correctly. */
          .pf-rec-save-row > div:first-child {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 6px !important;
          }
          .pf-rec-save-row > div:first-child > span { width: 100% !important; }
          .pf-rec-save-row > div:first-child > button { width: 100% !important; }
          /* Compose / Mic: the transport stays in the LEFT column under the
             palettes (same as every mode). Only the piano keyboard docks at the
             bottom as a clean full-width strip. The grid content (panels + canvas)
             gets bottom room equal to the keyboard height so everything can be
             reached "above" the keyboard without scrolling inside panels. */
          .pf-mode-live .pf-piano-dock {
            position: fixed !important;
            left: 0 !important; right: 0 !important; bottom: 0 !important;
            z-index: 50;
            background: rgba(4,3,8,0.97);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border-top: 1px solid rgba(201,168,76,.15);
            padding: 8px;
            margin: 0 !important;
          }
          /* The fixed keyboard at the bottom covers ~190px. Pad the whole grid so
             the left column's lowest buttons (Save / Clear) sit ABOVE it and stay
             reachable — the grid's own desktop padding would otherwise be only
             28px and leave them hidden behind the keys. */
          .pf-mode-live.pf-app-root { padding-bottom: 210px !important; }
          /* Compose/Mic canvas: the stage is normally align-self:center, which in a
             short (mobile-landscape) viewport drops the canvas into the lower half —
             right under the fixed piano keyboard, so you can't see what you paint
             while playing. Pin it to the TOP of the stage column and cap its height
             to the room above the keyboard, so the live painting always sits in
             clear view above the keys. */
          .pf-mode-live > .pf-stage-part {
            align-self: start !important;
            margin-top: 0 !important;
            max-height: calc(100vh - 230px) !important;
            width: fit-content !important;
            max-width: 100% !important;
            justify-self: center !important;
          }
          /* Lite live mic/compose keeps the portrait canvas (Advanced uses the
             wide landscape layout above; Lite must not). Higher specificity +
             these caps hold the canvas tall and centred on desktop/tablet. */
          .pf-app-root.pf-mode-lite.pf-mode-live > .pf-stage-part {
            align-self: center !important;
            justify-self: center !important;
            width: auto !important;
            max-width: 100% !important;
            max-height: calc(100vh - 200px) !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }
          .pf-app-root.pf-mode-lite.pf-mode-live > .pf-stage-part > canvas {
            width: auto !important;
            height: auto !important;
            max-width: 100% !important;
            max-height: calc(100vh - 200px) !important;
          }
          .pf-mode-live > .pf-stage-part > canvas {
            max-height: calc(100vh - 230px) !important;
            max-width: 100% !important;
            display: block !important;
          }
          /* Compose transport button order (vertical, left column):
             undo · play · mute · save · clear · scale. */
          .pf-mode-live .pf-transport-row { display: flex !important; flex-direction: column !important; }
          .pf-mode-live .pf-transport-row .pf-tx-undo  { order: 1 !important; }
          .pf-mode-live .pf-transport-row .pf-tx-play  { order: 2 !important; }
          .pf-mode-live .pf-transport-row .pf-tx-mute  { order: 3 !important; }
          .pf-mode-live .pf-transport-row .pf-tx-save  { order: 4 !important; }
          .pf-mode-live .pf-transport-row .pf-tx-clear { order: 5 !important; }
          .pf-mode-live .pf-transport-row .pf-tx-scale { order: 6 !important; }
          /* ── LITE MODE on desktop/tablet-landscape ──────────────────────────
             Lite has no left/right tool columns (no palettes, no artist picker,
             no transport dock) — only the canvas + an "inspired by" caption +
             three CTAs. The 3-col grid would leave two empty side columns and
             centre the canvas vertically. Override back to a simple centered
             flex column so the canvas sits high, just under the header, with the
             inspired-by caption above it. CTAs + picker are fixed-positioned
             (top-right / top-left) in JSX, so they sit clear of this flow. */
          .pf-app-root.pf-mode-lite {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
            padding: 14px 24px 28px !important;
            gap: 0 !important;
          }
          .pf-app-root.pf-mode-lite:not(.pf-immersive) > .pf-stage-part {
            margin-top: 4px !important;
            align-self: center !important;
            max-width: calc(100vw - 420px) !important;
            width: 100% !important;
          }
          .pf-app-root.pf-mode-lite:not(.pf-immersive) > .pf-stage-part > canvas {
            max-width: 100% !important;
            width: 100% !important;
            height: auto !important;
          }
          /* Seek/title row spans the same width as the canvas. */
          .pf-app-root.pf-mode-lite:not(.pf-immersive) > .pf-seek-block {
            max-width: calc(100vw - 420px) !important;
            margin: 0 auto 8px !important;
          }
          /* Hide the #root scrollbar in Lite — the canvas can be tall and
             scrollable, but the visible scrollbar track is distracting. */
          #root:has(.pf-mode-lite) { scrollbar-width: none !important; }
          #root:has(.pf-mode-lite)::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
        }
        /* MOBILE LANDSCAPE (phone on its side). Detect via low viewport HEIGHT
           (≤500px) instead of width, because modern iPhones in landscape are
           700–932px wide and so a max-width:768px never matched them — they
           fell through to the desktop 5-col rule and rendered as tablet/desktop.
           A landscape phone is ALWAYS short (≤430px tall typically), so
           max-height:500px catches every phone-in-landscape and excludes
           tablets (which are ≥768px tall in landscape too). */
        /* DESKTOP/TABLET LANDSCAPE chip styling (≥769px landscape only — the
           5-col grid is only active there). Taller chips so long labels (MELODY,
           VARIATION, ATM/MELODY combos) wrap to two lines instead of being cut.
           MORF + VARIÁCIA buttons stack vertically instead of side-by-side
           (uniform with the edge columns). Tablet PORTRAIT (3-col) and
           MOBILE LANDSCAPE (also 3-col now) are untouched. */
        @media (min-width: 769px) and (min-height: 501px) and (orientation: landscape) {
          .pf-app-root:not(.pf-mode-setup) > .pf-tx-edge-l > button,
          .pf-app-root:not(.pf-mode-setup) .pf-transport-dock .pf-transport-row > button {
            min-height: 56px;
            padding: 8px 5px !important;
            white-space: normal !important;
            line-height: 1.15 !important;
            word-break: keep-all;
          }
          /* MORF + VARIÁCIA: their parent is an inline-styled 2-col grid (set in
             JSX at the MORF button site). :has() lets us target that parent
             without touching JSX. In landscape, collapse to a single column so
             the two action buttons stack — consistent with the vertical edge
             stacks left and right. */
          .pf-app-root:not(.pf-mode-setup) .pf-controls-inner ~ * div:has(> .pf-morph),
          .pf-app-root:not(.pf-mode-setup) div:has(> .pf-morph),
          .pf-app-root:not(.pf-mode-setup) div:has(> .pf-vary) {
            grid-template-columns: 1fr !important;
          }
          /* INSPIRED BY label: left-align on 5-col desktop only, so the dice
             button (absolute right) has clear space and doesn't crowd the
             text in the narrow palette column. Mobile/tablet-portrait keep
             centered. */
          .pf-inspired-label { text-align: left !important; padding-right: 32px !important; }
        }
        /* Save picker on landscape (all widths): shift the modal toward the
           right edge so a thumb holding the tablet can reach it (centered
           modals on wide screens sit dead-center and are unreachable). Portrait
           keeps the centered default. */
        @media (orientation: landscape) {
          .pf-save-overlay {
            justify-content: flex-end !important;
            padding-right: clamp(40px, 12vw, 160px) !important;
          }
        }
        /* MOBILE PORTRAIT setup screen: re-flow the CREATE / IMPORT panels
           from vertically-stacked (default) into a side-by-side 2-column
           layout, where each panel holds 3 SQUARE chips stacked vertically
           (icon on top, text below). Tablet portrait (≥769px) untouched.
           — Wrap: row, gap tightened.
           — Inner chip grids: 1 column instead of 2.
           — All 6 chips: square aspect-ratio, vertical flex, icon scaled up. */
        @media (max-width: 768px) and (orientation: portrait) {
          .pf-setup-create-import-wrap {
            flex-direction: row !important;
            gap: 10px !important;
            padding: 14px !important;
          }
          .pf-setup-create-import-wrap .pf-setup-col {
            flex: 1 1 0 !important;
            min-width: 0 !important;
            gap: 8px !important;
          }
          /* Inner chip grids (compose+mic, music+image) — stack vertically
             instead of side-by-side, so each chip gets the full column width. */
          .pf-setup-create-import-wrap .pf-setup-create,
          .pf-setup-create-import-wrap .pf-setup-import {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
          }
          /* Chip layout for mobile portrait: square 96px tile, icon over text. */
          .pf-setup-create-import-wrap .pf-moodtile,
          .pf-setup-create-import-wrap .pf-mfitile,
          .pf-setup-create-import-wrap .pf-compose,
          .pf-setup-create-import-wrap .pf-mic,
          .pf-setup-create-import-wrap .pf-tool {
            aspect-ratio: auto !important;
            height: 96px !important;
            min-height: 0 !important;
            flex-direction: column !important;
            gap: 8px !important;
            padding: 12px 8px !important;
            overflow: hidden !important;
            text-align: center !important;
            line-height: 1.2 !important;
            white-space: normal !important;
            word-break: keep-all !important;
          }
        }
`;
// Anthropic model used by aiCompose. Pinned to the version prescribed by the
// "API in artifacts" feature; bump here when Anthropic publishes a newer one.
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
// ── Defensive JSON extraction for AI responses ──────────────────────────────
// Model output can be wrapped in ```json fences, prefixed with prose, or — most
// commonly — TRUNCATED when the response hits max_tokens (a long 8-language
// title pushes the notes array past the cap, cutting it mid-object). A naive
// /\{[\s\S]*\}/ + JSON.parse then throws and the user sees a false "not found".
// This tries, in order: (1) direct parse, (2) fenced/first-object slice,
// (3) repair a truncated tail by trimming to the last complete array element
// and closing any open brackets. Returns the parsed object or null.
function extractAiJson(raw){
  if(!raw || typeof raw!=='string') return null;
  let s = raw.trim();
  // Strip ```json … ``` or ``` … ``` fences if present.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if(fence) s = fence[1].trim();
  // Narrow to the first {...} span if there's surrounding prose.
  const open = s.indexOf('{');
  if(open>0) s = s.slice(open);
  // 1) straight parse
  try{ return JSON.parse(s); }catch(_){}
  // 2) greedy first-object slice
  const m = s.match(/\{[\s\S]*\}/);
  if(m){ try{ return JSON.parse(m[0]); }catch(_){} }
  // 3) repair a truncated tail: cut back to the last complete array element
  //    (a `]` or a `}` or a number/quote close) and re-balance brackets.
  let t = s;
  // drop a dangling partial token after the last comma/closer
  const lastClose = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
  if(lastClose>0) t = t.slice(0, lastClose+1);
  // count unclosed brackets and append the right closers
  let curly=0, square=0, inStr=false, esc=false;
  for(const ch of t){
    if(esc){ esc=false; continue; }
    if(ch==='\\'){ esc=true; continue; }
    if(ch==='"'){ inStr=!inStr; continue; }
    if(inStr) continue;
    if(ch==='{') curly++; else if(ch==='}') curly--;
    else if(ch==='[') square++; else if(ch===']') square--;
  }
  if(inStr) t+='"';
  while(square-->0) t+=']';
  while(curly-->0) t+='}';
  try{ return JSON.parse(t); }catch(_){}
  return null;
}
// Body 5: baked AI result for the built-in "mood from image" sample. Generated
// once on the deployed app and frozen here 1:1 so the sample plays offline and
// always free — _imgMoodCacheGet returns this whenever the hash matches. The
// hash is the _imgMoodHash of the downsampled sample image.
const SAMPLE_IMGMOOD = { hash: 0, result: {"title":"A Dream In Crimson","tempo":72,"key":"A minor","notes":[["A2",2,0,52],["E2",2,2,48],["A2",2,4,54],["F2",2,6,50],["C3",2,8,52],["G2",2,10,48],["A2",2,12,55],["E3",2,14,50],["F2",2,16,52],["C3",2,18,49],["D3",2,20,53],["A2",2,22,50],["E2",2,24,48],["A2",2,26,56],["A2",2,28,54],["E2",2,30,50],["C4",1,0,44],["E4",1,2,42],["C4",1,4,46],["A3",1,6,43],["E4",1,8,44],["D4",1,10,42],["C4",1,12,46],["G3",1,14,43],["A3",1,16,44],["E4",1,18,42],["F4",1,20,45],["E4",1,22,43],["C4",1,24,42],["E4",1,26,46],["A3",2,28,44],["C4",2,30,42],["A5",0.5,0,84],["C6",0.5,0.5,90],["B5",1,1,86],["E5",1,2,80],["D5",0.5,3,70],["E5",0.5,3.5,74],["A5",0.5,4,80],["C6",0.5,4.5,86],["B5",1,5,82],["E5",1,6,76],["F5",1,7,72],["E5",1,8,68],["C5",0.5,9,66],["D5",0.5,9.5,70],["E5",1,10,74],["A4",1,11,64],["A5",0.5,12,86],["C6",0.5,12.5,92],["B5",1,13,88],["E5",1,14,82],["G5",0.5,15,72],["A5",0.5,15.5,78],["E5",1,16,70],["C5",1,17,66],["E5",0.5,18,72],["F5",0.5,18.5,76],["E5",1,19,70],["D5",1,20,68],["C5",1,21,64],["A5",0.5,22,82],["C6",0.5,22.5,88],["B5",1,23,84],["E5",1,24,78],["E5",1,25,72],["D5",0.5,26,68],["C5",0.5,26.5,66],["A4",1,27,60],["E5",1,28,58],["C5",1,29,54],["A4",2,30,50]]} };
const S_BASE = "https://cdn.jsdelivr.net/gh/Tonejs/audio@master/salamander/";
const S_URLS = {"A0":"A0.mp3","C1":"C1.mp3","D#1":"Ds1.mp3","F#1":"Fs1.mp3","A1":"A1.mp3","C2":"C2.mp3","D#2":"Ds2.mp3","F#2":"Fs2.mp3","A2":"A2.mp3","C3":"C3.mp3","D#3":"Ds3.mp3","F#3":"Fs3.mp3","A3":"A3.mp3","C4":"C4.mp3","D#4":"Ds4.mp3","F#4":"Fs4.mp3","A4":"A4.mp3","C5":"C5.mp3","D#5":"Ds5.mp3","F#5":"Fs5.mp3","A5":"A5.mp3","C6":"C6.mp3","D#6":"Ds6.mp3","F#6":"Fs6.mp3","A6":"A6.mp3","C7":"C7.mp3","D#7":"Ds7.mp3","F#7":"Fs7.mp3","A7":"A7.mp3","C8":"C8.mp3"};


const octL = m => 12 + Math.max(0,Math.min(8,Math.floor(m/12)-1))/8*76;
const toHsl = (r,g,b) => {
  r/=255;g/=255;b/=255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,l=(mx+mn)/2;
  if(!d)return[0,0,l*100];
  const s=d/(1-Math.abs(2*l-1));
  let h=mx===r?(g-b)/d:mx===g?(b-r)/d+2:(r-g)/d+4;
  return[(((h%6)+6)%6)/6*360,s*100,l*100];
};
const COF=[0,210,60,270,120,330,180,30,240,90,300,150];
const fromHsl=(h,s,l)=>{s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>Math.round((l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1))))*255);return[f(0),f(8),f(4)];};
const harmCol=(m,v=100)=>{const[r,g,b]=fromHsl(COF[m%12],75+(v/127)*15,octL(m));return[r,g,b,0.72+(v/127)*0.28];};
// Spectral mode = chromatic rainbow. Each pitch class gets an evenly-spaced
// hue (30° steps) so the 12 PCs span the entire color wheel without gaps or
// duplicates. Replaces the previous wavelength-folding approach which
// clustered D#/E/F at violet and F#/G/G# at red with a discontinuous jump.
const SPEC_HUE=Array.from({length:12},(_,pc)=>pc*30);
const specCol=(m,v=100)=>{const h=SPEC_HUE[m%12];const s=75+(v/127)*15;const[r,g,b]=fromHsl(h,s,octL(m));return[r,g,b,0.65+(v/127)*0.35];};
// Golden-angle hue map (φ). Each pitch class advances by 360°/φ² ≈ 137.5°
// — the same maths sunflowers use for seed spacing. Twelve points land
// maximally scattered around the wheel: no two PCs near each other.
const PHI_HUE=Array.from({length:12},(_,pc)=>(pc*137.50776)%360);
const phiCol=(m,v=100)=>{const h=PHI_HUE[m%12];const s=75+(v/127)*15;const[r,g,b]=fromHsl(h,s,octL(m));return[r,g,b,0.65+(v/127)*0.35];};
// Kontra mode — the "inverse-Harmony" aesthetic that was originally the
// Custom palette default. Promoted to its own chip so users can pick it
// without losing their custom edits. Consonant intervals get FAR hues,
// dissonant ones get CLOSE hues (the inverse of harmCol's circle-of-fifths).
const KONTRA_HUE=[0, 30, 60, 240, 270, 210, 330, 180, 90, 120, 300, 150];
const kontraCol=(m,v=100)=>{const h=KONTRA_HUE[m%12];const s=75+(v/127)*15;const[r,g,b]=fromHsl(h,s,octL(m));return[r,g,b,0.65+(v/127)*0.35];};
// ── PASTEL palette variants ────────────────────────────────────────────────
// For each palette mode (Harmony/Spectral/Phi/Kontra), a pastel variant uses
// the SAME hue identity per pitch class but locks saturation + lightness into
// a fixed pastel range. The result is a genuine pastel palette, not an HSL
// post-filter: every pitch class keeps its harmonic relationship to the
// others, but every colour reads as a true pastel — calibrated against the
// user-supplied 20-colour pastel reference card.
//   • Lightness:   range 65-78 % (lifted band sitting comfortably above the
//                  dark canvas, no near-black pastels)
//   • Saturation:  HUE-AWARE — base 45-75 % (modulated by velocity), plus
//                  +15 boost for warm hues (red/orange/yellow). This mirrors
//                  the reference card where the warm top row reads as
//                  vivid-but-pastel coral/peach while the cool rows
//                  (blues/greens) sit softer.
//   • Lightness:   HUE-AWARE — warm hues anchor lower (~60 %), greens mid
//                  (~65 %), cool hues higher (~74 %). Without this every
//                  pastel pitch class read at the same lightness (~70 %)
//                  and visually merged into a lavender-cream blur — warm
//                  reds lost their identity. Octave + velocity still
//                  modulate ±5 % around each hue's anchor.
//   • Alpha unchanged from Pure (consistent block density across tones)
const _pastelHueL = h => {
  // Warm zone (red/orange/yellow ~ h<60 or h>320) → 60 % anchor
  // Green zone (h 60..180) → 65 % anchor
  // Cool zone (h 180..320) → 74 % anchor
  if(h < 60 || h > 320) return 60;
  if(h < 180) return 65;
  return 74;
};
const _octLPastel = (m, h) => {
  const anchor = _pastelHueL(h);
  return anchor + Math.max(0,Math.min(8,Math.floor(m/12)-1))/8*8;   // anchor..anchor+8
};
// Hue-aware saturation: warm side of the wheel (red→yellow, h<60 or h>320)
// gets +15 boost; the rest follow the base curve. Velocity still modulates
// inside each band so soft notes sit a little less saturated.
const _pastelSat  = (h, v) => {
  let base = 45 + (v/127)*30;                        // 45..75
  const warm = (h < 60) || (h > 320);
  if(warm) base += 15;                                // warm bump → up to ~90 at vel=127
  return Math.min(95, base);
};
const harmColPastel  =(m,v=100)=>{const h=COF[m%12];        const[r,g,b]=fromHsl(h, _pastelSat(h,v), _octLPastel(m,h));return[r,g,b,0.72+(v/127)*0.28];};
const specColPastel  =(m,v=100)=>{const h=SPEC_HUE[m%12];   const[r,g,b]=fromHsl(h, _pastelSat(h,v), _octLPastel(m,h));return[r,g,b,0.65+(v/127)*0.35];};
const phiColPastel   =(m,v=100)=>{const h=PHI_HUE[m%12];    const[r,g,b]=fromHsl(h, _pastelSat(h,v), _octLPastel(m,h));return[r,g,b,0.65+(v/127)*0.35];};
const kontraColPastel=(m,v=100)=>{const h=KONTRA_HUE[m%12]; const[r,g,b]=fromHsl(h, _pastelSat(h,v), _octLPastel(m,h));return[r,g,b,0.65+(v/127)*0.35];};
// Custom pastel: respects the user's hue choices (their picked hex per pitch
// class is the artistic intent), but moves saturation + lightness into the
// pastel band. Grey swatches stay grey (hue-less, same as Pure customCol).
const customColPastel=(m,v=100,palette)=>{
  const pc=m%12;
  const hex=(palette&&palette[pc])||'#888888';
  const[r0,g0,b0]=hexToRgb(hex);
  const[h0,s0]=toHsl(r0,g0,b0);
  // Grey hex (s≈0) → keep neutral, pastel lightness around mid range
  const isGrey = s0<=0.5;
  const sat = isGrey ? 0 : _pastelSat(h0, v);
  // Lightness anchored on the pastel octave curve (hue-aware anchor), with
  // velocity nudge so softer notes sit slightly lighter (matches Real piano
  // direction).
  const l = _octLPastel(m, h0) + (v/127-0.5)*4;     // ±2 around hue-aware anchor
  const[rr,gg,bb]=fromHsl(h0,sat,Math.max(54,Math.min(82,l)));
  return[rr,gg,bb,0.7+(v/127)*0.3];
};
// ── DARK palette variants ──────────────────────────────────────────────────
// Mirror to Pastel: same hue identity per pitch class, but locked into a
// deep/forte band. Used by Real mode for the extreme forte chord band
// (only the loudest ~20 % of chords route here). Mezzo chords stay in the
// Pure variant and get continuous _energyTint modulation; this dark
// variant gives the visual punctuation Mosaic Real needs.
//   • Saturation:  55-75 %  (slightly less than Pure so darks read as
//                  "deep" rather than "vivid + dark")
//   • Lightness:   35-55 %  (rich shadow band, not crushed — chocolate /
//                  burgundy / forest range, hue stays clearly identifiable)
//   • Octave + velocity still modulate within the dark window
const _octLDark = m => 35 + Math.max(0,Math.min(8,Math.floor(m/12)-1))/8*20;     // 35..55
const _darkSat  = v => 50 + (v/127)*15;                                            // 50..65
const harmColDark  =(m,v=100)=>{const[r,g,b]=fromHsl(COF[m%12],         _darkSat(v), _octLDark(m));return[r,g,b,0.72+(v/127)*0.28];};
const specColDark  =(m,v=100)=>{const[r,g,b]=fromHsl(SPEC_HUE[m%12],    _darkSat(v), _octLDark(m));return[r,g,b,0.65+(v/127)*0.35];};
const phiColDark   =(m,v=100)=>{const[r,g,b]=fromHsl(PHI_HUE[m%12],     _darkSat(v), _octLDark(m));return[r,g,b,0.65+(v/127)*0.35];};
const kontraColDark=(m,v=100)=>{const[r,g,b]=fromHsl(KONTRA_HUE[m%12],  _darkSat(v), _octLDark(m));return[r,g,b,0.65+(v/127)*0.35];};
const customColDark=(m,v=100,palette)=>{
  const pc=m%12;
  const hex=(palette&&palette[pc])||'#888888';
  const[r0,g0,b0]=hexToRgb(hex);
  const[h0,s0]=toHsl(r0,g0,b0);
  const isGrey = s0<=0.5;
  const sat = isGrey ? 0 : _darkSat(v);
  const l = _octLDark(m) + (v/127-0.5)*4;
  const[rr,gg,bb]=fromHsl(h0,sat,Math.max(28,Math.min(58,l)));
  return[rr,gg,bb,0.7+(v/127)*0.3];
};
// most famous synaesthete in music history actually saw each pitch class
// as a specific colour. Follows the circle of fifths around a rainbow:
//   C  → red                G → rose/orange       D  → yellow
//   A  → green               E → pearly blue       B  → pearly blue (shift)
//   F# → bright blue        Db → violet            Ab → purple
//   Eb → steel (metallic)   Bb → steel (metallic)  F  → deep red
// "Pearly" (E, B) and "metallic steel" (Eb, Bb) are Scriabin's own marks —
// honoured here through lower saturation in CUSTOM_DEFAULT_SAT below.
const CUSTOM_DEFAULT_HUE=[
  // C    C#   D    D#   E    F    F#   G    G#   A    A#   B
       0, 280,  60, 210, 200, 350, 230,  30, 290, 120, 210, 215
];
// Per-pitch-class saturation for the Scriabin Prometheus default palette.
// Eb (pc=3) and Bb (pc=10) are Scriabin's "metallic steel" tones — 25%.
// E (pc=4) and B (pc=11) are his "pearly" tones — 60% (medium-low).
// Other pitch classes get bold rainbow saturation (85-95%).
const CUSTOM_DEFAULT_SAT=[
  // C   C#  D   D#  E   F   F#  G   G#  A   A#  B
     95, 80, 90, 25, 60, 85, 95, 90, 80, 85, 25, 60
];

// Fast RGBA string helper — avoids repeated template-string + toFixed allocations
// in the hot inner draw loops. Rounds alpha to 3 decimal places inline.
// Guards against non-finite alpha (undefined/NaN) which would produce an invalid
// CSS color string and silently blank the fill — clamps to a valid 0..1 range.
const _rgbaStr=(r,g,b,a)=>{
  let A=Math.round((a*1000))/1000;
  if(!Number.isFinite(A)) A=1;
  else if(A<0) A=0; else if(A>1) A=1;
  return `rgba(${r|0},${g|0},${b|0},${A})`;
};
const hexToRgb=(hex)=>{
  if(typeof hex!=='string')return[128,128,128];
  let h=hex.replace('#','');
  if(h.length===3)h=h.split('').map(c=>c+c).join('');
  if(!/^[0-9a-f]{6}$/i.test(h))return[128,128,128];
  return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
};

// Custom mode color: anchor on user's picked color per pitch class, then apply
// subtle octave modulation (±15% lightness vs the default ±36% of Harmony/
// Spectral) and gentle velocity modulation (saturation -10..+5%). The user's
// chosen colour is faithfully represented at the mid-octave/mezzo-velocity
// anchor point; surrounding notes shift slightly so octave and velocity remain
// visually meaningful without overwhelming the user's palette intent.
const customCol=(m,v=100,palette)=>{
  const pc=m%12;
  const hex=(palette&&palette[pc])||'#888888';
  const[r,g,b]=hexToRgb(hex);
  const[h0,s0,l0]=toHsl(r,g,b);
  // Octave: shift lightness toward 50% as anchor, then offset by octave delta.
  // Anchor lightness on user pick at MIDI 60 (middle C); ±15% across 8 octaves.
  const octDelta=(Math.max(0,Math.min(8,Math.floor(m/12)-1))-5)*3;  // -15..+9
  const l=Math.max(8,Math.min(92,l0+octDelta));
  // Velocity: gentle saturation modulation around user's chosen saturation.
  // BUT if the swatch is greyscale (s0===0, e.g. the unset #888888 default or a
  // deliberately grey pick), keep it grey — adding saturation to a hue-less
  // color resurrects hue 0 (red) and renders as stray pink. Grey stays grey.
  const velMod=(v/127-0.5)*15;  // -7.5..+7.5
  const s=s0<=0.5 ? 0 : Math.max(0,Math.min(100,s0+velMod));
  const[rr,gg,bb]=fromHsl(h0,s,l);
  return[rr,gg,bb,0.7+(v/127)*0.3];
};

// B/W mode: pitch class drives lightness chromatically — C is darkest, B is
// lightest, 12 evenly-spaced shades from black to white. Octave provides a
// subtle additional ±10% lightness offset so the same pitch class at different
// octaves is visually distinguishable. Velocity controls alpha (existing
// pattern). Saturation = 0 → pure grayscale, no colour.
const BW_LIGHT=Array.from({length:12},(_,pc)=>12+(pc/11)*76);
const bwCol=(m,v=100)=>{
  const pc=m%12;
  const octDelta=(Math.max(0,Math.min(8,Math.floor(m/12)-1))-5)*2;  // -10..+6
  const l=Math.max(6,Math.min(94,BW_LIGHT[pc]+octDelta));
  const[r,g,b]=fromHsl(0,0,l);
  return[r,g,b,0.7+(v/127)*0.3];
};

// ─────────────────────────────────────────────────────────────────────────────
// §2  MIDI / MUSIC-XML / AUDIO PARSERS
// ─────────────────────────────────────────────────────────────────────────────
function parseMidi(buf){
  const d=new Uint8Array(buf);let p=0;
  const u8=()=>d[p++];
  const u16=()=>{const v=(d[p]<<8)|d[p+1];p+=2;return v;};
  const u32=()=>{const v=(d[p]<<24)|(d[p+1]<<16)|(d[p+2]<<8)|d[p+3];p+=4;return v;};
  const vl=()=>{let v=0,b;do{b=u8();v=(v<<7)|(b&0x7f);}while(b&0x80);return v;};
  // Validate "MThd" header before parsing — otherwise a non-MIDI file produces
  // garbage track counts and divisions, then loops billions of times reading
  // junk bytes. Fail cleanly with a useful message instead.
  if(d.length<14||d[0]!==0x4d||d[1]!==0x54||d[2]!==0x68||d[3]!==0x64){
    throw new Error('Not a MIDI file (missing MThd header).');
  }
  p+=4;u32();u16();
  const nT=u16(),div=u16();
  const temps=[{tick:0,uspb:500000}],raw=[],skipped=[];
  for(let t=0;t<nT;t++){
    // Scan forward to next MTrk header
    while(p+4<d.length&&!(d[p]===0x4d&&d[p+1]===0x54&&d[p+2]===0x72&&d[p+3]===0x6b))p++;
    if(p+8>d.length)break;
    p+=4;
    const tLen=u32(),tEnd=Math.min(p+tLen,d.length);
    const trackStart=p;
    try{
      let tick=0,st=0,held={};
      while(p<tEnd){
        tick+=vl();
        let s=d[p];if(s>=0x80){st=s;p++;}
        const tp=st&0xf0;
        if(tp===0x90){const pitch=u8(),vel=u8();if(vel>0)held[pitch]=[tick,vel];else if(held[pitch]){raw.push([pitch,held[pitch][0],held[pitch][1],tick]);delete held[pitch];}}
        else if(tp===0x80){const pitch=u8();u8();if(held[pitch]){raw.push([pitch,held[pitch][0],held[pitch][1],tick]);delete held[pitch];}}
        else if(st===0xff){const mt=u8(),ml=vl();if(mt===0x51&&ml===3){const uspb=(u8()<<16)|(u8()<<8)|u8();temps.push({tick,uspb});}else p+=ml;}
        else if(st===0xf0||st===0xf7){p+=vl();}
        else if(tp===0xb0||tp===0xe0||tp===0xa0){u8();u8();}
        else if(tp===0xc0||tp===0xd0){u8();}
      }
      // Flush any held notes at track end
      for(const pi in held)raw.push([parseInt(pi),held[pi][0],held[pi][1],tEnd]);
    }catch(err){
      skipped.push(t+1); // 1-based track number for the user
    }
    p=tEnd; // always advance past the track regardless
  }
  raw.sort((a,b)=>a[1]-b[1]);
  temps.sort((a,b)=>a.tick-b.tick);
  return{raw,div,temps,skipped};
}
function t2ms(ticks,div,temps){let ms=0,prev=0,uspb=500000;for(const{tick:tc,uspb:u}of temps){if(tc>=ticks)break;ms+=(tc-prev)*uspb/div/1000;prev=tc;uspb=u;}return ms+(ticks-prev)*uspb/div/1000;}

// Shared normalizer: takes a flat array of {m, startMs, durMs, v}, groups
// simultaneous notes (within CWIN ms) into chord events, and computes durQ.
// Both toChords (MIDI ticks) and noteArr2events (beat/BPM) resolve their
// format first, then delegate here.
function groupToEvents(flat,quarterMs){
  if(!flat.length)return[];
  flat.sort((a,b)=>a.startMs-b.startMs);
  const out=[];let i=0;
  while(i<flat.length){
    const bt=flat[i].startMs,g=[];
    while(i<flat.length&&flat[i].startMs-bt<=CWIN){g.push(flat[i]);i++;}
    const maxDur=Math.max(...g.map(n=>n.durMs));
    out.push({n:g.map(({m,v,durMs})=>({m,v,durMs})),startMs:bt,durQ:snapDurQ(maxDur/(quarterMs||500))});
  }
  return out;
}

function toChords(raw,div,temps){
  if(!raw.length)return[];
  const uspb=temps[temps.length-1]?.uspb||500000,quarterMs=uspb/1000;
  const flat=raw.map(([m,st,v,et])=>({m,v,startMs:t2ms(st,div,temps),durMs:Math.max(80,t2ms(et,div,temps)-t2ms(st,div,temps))}));
  return groupToEvents(flat,quarterMs);
}

const PAINT_SCALES = {
  off:  {label:'free',  root:0, scale:null},
  cmaj: {label:'C maj', root:0, scale:[0,2,4,5,7,9,11]},
  amin: {label:'A min', root:9, scale:[0,2,3,5,7,8,10]},
  gmaj: {label:'G maj', root:7, scale:[0,2,4,5,7,9,11]},
  emin: {label:'E min', root:4, scale:[0,2,3,5,7,8,10]},
  dmaj: {label:'D maj', root:2, scale:[0,2,4,5,7,9,11]},
  fmaj: {label:'F maj', root:5, scale:[0,2,4,5,7,9,11]},
  dmin: {label:'D min', root:2, scale:[0,2,3,5,7,8,10]},
};
const PAINT_SCALE_KEYS = ['off','cmaj','amin','gmaj','emin','dmaj','fmaj','dmin'];

// Cache of pitch-class arrays per scale key. There are only 8 possible scales
// (PAINT_SCALE_KEYS), each maps to a stable PC array. Pre-computing once at
// module load avoids 88+ per-render `.map()` allocations during keyboard render
// (paintSnapMidi → paintScalePCs runs per-key) and the 5-15Hz playback tick.
const _PAINT_SCALE_PC_CACHE = {};
function paintScalePCs(scaleKey){
  if(scaleKey in _PAINT_SCALE_PC_CACHE) return _PAINT_SCALE_PC_CACHE[scaleKey];
  const s = PAINT_SCALES[scaleKey];
  const pcs = (!s || !s.scale) ? null : s.scale.map(o => (o + s.root) % 12);
  _PAINT_SCALE_PC_CACHE[scaleKey] = pcs;
  return pcs;
}
function paintSnapMidi(midi, scaleKey){
  const pcs = paintScalePCs(scaleKey);
  if(!pcs) return midi;
  const oct = Math.floor(midi/12), pc = midi%12;
  let best=pcs[0], bestD=12;
  for(const sp of pcs){
    const d = Math.min(Math.abs(pc-sp), 12-Math.abs(pc-sp));
    if(d<bestD){bestD=d; best=sp;}
  }
  const cands = [oct*12+best, (oct-1)*12+best, (oct+1)*12+best];
  return cands.reduce((a,b)=>Math.abs(b-midi)<Math.abs(a-midi)?b:a);
}

function snapDurQ(q){const t=[0.25,0.5,0.75,1,1.5,2,3,4];let b=1,bd=Infinity;for(const x of t){const d=Math.abs(q-x);if(d<bd){bd=d;b=x;}}return b;}

// Decompress a .mxl (zipped MusicXML) ArrayBuffer to the inner XML text.
// Uses inline ZIP parsing + browser's built-in DecompressionStream — no library, ~50 LOC.
// Works on iOS Safari 16.4+, Chrome 80+, Firefox 113+.
async function mxlToXml(buf){
  const bytes=new Uint8Array(buf);
  const dv=new DataView(buf);
  // Find End-of-Central-Directory record (EOCD signature 0x06054b50), scanning from file end backwards
  let eocd=-1;
  for(let i=bytes.length-22;i>=0&&i>=bytes.length-65557;i--){
    if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;}
  }
  if(eocd<0) throw new Error('Not a valid .mxl (no EOCD record)');
  const cdEntries=dv.getUint16(eocd+10,true);
  const cdOffset=dv.getUint32(eocd+16,true);
  // Walk the central directory
  const files=[];
  let p=cdOffset;
  for(let i=0;i<cdEntries;i++){
    if(dv.getUint32(p,true)!==0x02014b50) throw new Error('Corrupt .mxl central directory');
    const method=dv.getUint16(p+10,true);
    const compSize=dv.getUint32(p+20,true);
    const fnameLen=dv.getUint16(p+28,true);
    const extraLen=dv.getUint16(p+30,true);
    const commentLen=dv.getUint16(p+32,true);
    const lfh=dv.getUint32(p+42,true);
    const name=new TextDecoder().decode(bytes.slice(p+46,p+46+fnameLen));
    files.push({name,method,compSize,lfh});
    p+=46+fnameLen+extraLen+commentLen;
  }
  // Pick the main score file: prefer .musicxml or .xml not in META-INF.
  // If META-INF/container.xml exists we could parse it for the rootfile path, but the heuristic below works for all musescore.com / MuseScore Studio exports.
  const main=files.find(f=>!f.name.startsWith('META-INF')&&(f.name.endsWith('.musicxml')||f.name.endsWith('.xml')))
           ||files.find(f=>f.name.endsWith('.xml'));
  if(!main) throw new Error('No score file inside .mxl');
  // Local file header → actual data offset
  if(dv.getUint32(main.lfh,true)!==0x04034b50) throw new Error('Corrupt .mxl file header');
  const lfnLen=dv.getUint16(main.lfh+26,true);
  const lexLen=dv.getUint16(main.lfh+28,true);
  const dataAt=main.lfh+30+lfnLen+lexLen;
  const compressed=bytes.slice(dataAt,dataAt+main.compSize);
  let xmlBytes;
  if(main.method===0){
    // Stored, no compression
    xmlBytes=compressed;
  }else if(main.method===8){
    // Deflate (raw, no zlib header)
    if(typeof DecompressionStream==='undefined'){
      throw new Error('This browser is too old to read compressed .mxl. Update Safari/Chrome, or re-export as uncompressed .musicxml.');
    }
    const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    xmlBytes=new Uint8Array(await new Response(stream).arrayBuffer());
  }else{
    throw new Error('Unsupported .mxl compression method: '+main.method);
  }
  return new TextDecoder('utf-8').decode(xmlBytes);
}

// MusicXML parser — converts MuseScore/Finale/Dorico XML exports into Paintiano events.
// Reads pitches, durations, voices, chords, multi-staff piano directly — no OMR guessing.
// Accepts uncompressed .musicxml / .xml only (compressed .mxl needs unzip and is not supported here).
function parseMusicXml(xmlText){
  const doc=new DOMParser().parseFromString(xmlText,'application/xml');
  const err=doc.querySelector('parsererror');
  if(err) throw new Error('Invalid MusicXML: '+(err.textContent||'').replace(/\s+/g,' ').slice(0,80));
  if(!doc.querySelector('score-partwise, score-timewise')) throw new Error('Not a MusicXML score (no <score-partwise> root). If you exported .mxl, re-export as uncompressed .musicxml.');
  const stepSemi={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  const notes=[]; // [{startQ, durQ, midi, vel}]
  let lastNoteStartQ=0;
  // Dynamic markings live in <direction><direction-type><dynamics><X/></dynamics>
  // and propagate forward until the next dynamic. Legacy exports sometimes put
  // them inside <note><notations><dynamics> — we keep that as a per-note fallback.
  const DYN_MAP={ppp:30,pp:42,p:55,mp:70,mf:85,f:100,ff:115,fff:115,ffff:115,sf:110,sfz:115,sffz:115,fz:108,rfz:108,fp:80,pf:90,n:85};
  const clampVel=v=>Math.max(30,Math.min(115,v));
  const readDynamicsFrom=(parent)=>{
    if(!parent)return null;
    const d=parent.querySelector(':scope > dynamics');
    if(!d)return null;
    const child=d.children[0]?.tagName;
    if(child&&DYN_MAP[child.toLowerCase()]!=null) return DYN_MAP[child.toLowerCase()];
    return null;
  };
  for(const part of doc.querySelectorAll('score-partwise > part')){
    let divisions=4;
    let curTimeQ=0;
    let curVel=85; // neutral mf at the start of each part
    for(const measure of part.querySelectorAll(':scope > measure')){
      for(const elem of measure.children){
        const tag=elem.tagName;
        if(tag==='attributes'){
          const div=elem.querySelector(':scope > divisions');
          if(div) divisions=parseInt(div.textContent)||divisions;
        }else if(tag==='direction'){
          // Dynamic marking — update the running velocity for subsequent notes
          const dt=elem.querySelector(':scope > direction-type');
          const newVel=readDynamicsFrom(dt);
          if(newVel!=null) curVel=clampVel(newVel);
        }else if(tag==='sound'){
          // <sound dynamics="N"> is an explicit playback-velocity override (0–127 in MusicXML;
          // 100 = mf in the spec). MuseScore emits these alongside markings.
          const sdAttr=elem.getAttribute('dynamics');
          if(sdAttr){const n=parseFloat(sdAttr); if(isFinite(n)) curVel=clampVel(Math.round(n*0.85));}
        }else if(tag==='note'){
          if(elem.querySelector(':scope > grace')) continue; // skip grace notes
          const isChord=elem.querySelector(':scope > chord')!==null;
          const isRest=elem.querySelector(':scope > rest')!==null;
          const durEl=elem.querySelector(':scope > duration');
          const duration=durEl?parseFloat(durEl.textContent):0;
          const durQ=duration/divisions;
          if(isRest){
            if(!isChord) curTimeQ+=durQ;
            continue;
          }
          const pitchEl=elem.querySelector(':scope > pitch');
          if(!pitchEl){
            if(!isChord) curTimeQ+=durQ;
            continue;
          }
          const step=pitchEl.querySelector(':scope > step')?.textContent||'C';
          const octave=parseInt(pitchEl.querySelector(':scope > octave')?.textContent||'4');
          const alter=parseFloat(pitchEl.querySelector(':scope > alter')?.textContent||'0');
          const midi=Math.round((octave+1)*12+(stepSemi[step]||0)+alter);
          // Velocity: running dynamic (from <direction>), with a per-note
          // override if the legacy notations/dynamics path carries one.
          let vel=curVel;
          const localDyn=readDynamicsFrom(elem.querySelector(':scope > notations'));
          if(localDyn!=null) vel=clampVel(localDyn);
          // For chord notes: same startQ as the previous note in this voice/part; curTimeQ wasn't advanced
          const noteStartQ=isChord?lastNoteStartQ:curTimeQ;
          if(midi>=0&&midi<128) notes.push({startQ:noteStartQ,durQ,midi,vel});
          if(!isChord){
            lastNoteStartQ=curTimeQ;
            curTimeQ+=durQ;
          }
        }else if(tag==='backup'){
          const dur=parseFloat(elem.querySelector(':scope > duration')?.textContent||'0');
          curTimeQ=Math.max(0,curTimeQ-dur/divisions);
        }else if(tag==='forward'){
          const dur=parseFloat(elem.querySelector(':scope > duration')?.textContent||'0');
          curTimeQ+=dur/divisions;
        }
      }
    }
  }
  if(!notes.length) throw new Error('No playable notes found in MusicXML.');
  // Sort by start time, then pitch (for stable chord rendering low→high)
  notes.sort((a,b)=>a.startQ-b.startQ||a.midi-b.midi);
  // Group simultaneous notes into chord events
  const events=[];
  const EPS=0.005;
  for(const n of notes){
    const last=events[events.length-1];
    if(last&&Math.abs(last.startQ-n.startQ)<EPS){
      last.notes.push({m:n.midi,v:n.vel,durMs:Math.round(n.durQ*500)});
      last.maxDurQ=Math.max(last.maxDurQ,n.durQ);
    }else{
      events.push({startQ:n.startQ,maxDurQ:n.durQ,notes:[{m:n.midi,v:n.vel,durMs:Math.round(n.durQ*500)}]});
    }
  }
  // Deduplicate identical pitches within each chord (multi-voice unisons)
  for(const ev of events){
    const seen=new Set();
    ev.notes=ev.notes.filter(n=>seen.has(n.m)?false:(seen.add(n.m),true));
  }
  // Build Paintiano events. Fixed 100 BPM means 600 ms per quarter; durations scale from durQ.
  const QUARTER_MS=600;
  return events.map((c,idx)=>{
    const dms=Math.max(120,Math.round(c.maxDurQ*QUARTER_MS));
    return{
      n:c.notes.map(n=>({m:n.m,v:n.v,durMs:dms})),
      startMs:Math.round(c.startQ*QUARTER_MS),
      idx,
      durQ:snapDurQ(c.maxDurQ)
    };
  });
}
// ─── computeSongCharacter ────────────────────────────────────────────────────
// A piece's fingerprint, derived ONLY from its chords (velocities + MIDI pitch +
// note counts). Deterministic: same chords → same character, every time. It does
// NOT touch audio — it's pure render metadata, read by computeGrid (Mosaic block
// sizing) and, progressively, by the artist overlays so a Liszt nocturne and a
// Led Zeppelin riff stop looking alike.
//
// Returns:
//   energy   0..1  overall loudness (mean velocity)
//   dynRange 0..1  how much the dynamics swing (loud vs soft contrast)
//   register 0..1  mean pitch height (0 = bass-heavy, 1 = treble-heavy)
//   density  0..1  mean simultaneous notes per chord (sparse → thick)
//   weights  []    per-chord size multiplier (loud/bass → bigger, soft/high →
//                  smaller), MEAN-NORMALISED to ~1 so total canvas fill is
//                  preserved (the grid still fills exactly).
function computeSongCharacter(chords){
  const empty = { energy:0.5, dynRange:0.3, register:0.5, density:0.3, weights:null };
  if(!Array.isArray(chords) || chords.length===0) return empty;
  let vSum=0, vN=0, vMin=127, vMax=0, mSum=0, mN=0, nSum=0, nN=0;
  const perChordV=[], perChordM=[];
  for(const c of chords){
    if(!c || !c.n || !c.n.length){ perChordV.push(null); perChordM.push(null); continue; }
    let cv=0, cvN=0, cm=0, cmN=0;
    for(const n of c.n){
      const v=(typeof n.v==='number')?n.v:80;
      const m=(typeof n.m==='number')?n.m:60;
      vSum+=v; vN++; cv+=v; cvN++;
      if(v<vMin) vMin=v; if(v>vMax) vMax=v;
      mSum+=m; mN++; cm+=m; cmN++;
    }
    nSum+=c.n.length; nN++;
    perChordV.push(cvN?cv/cvN:null);
    perChordM.push(cmN?cm/cmN:null);
  }
  const meanV = vN?vSum/vN:80;
  const meanM = mN?mSum/mN:60;
  const meanN = nN?nSum/nN:1;
  const energy   = Math.max(0, Math.min(1, meanV/127));
  const dynRange = Math.max(0, Math.min(1, (vMax-vMin)/127));
  // MIDI 36 (C2) .. 84 (C6) spans most musical registers; normalise into it.
  const register = Math.max(0, Math.min(1, (meanM-36)/48));
  const density  = Math.max(0, Math.min(1, (meanN-1)/5)); // 1 note → 0, 6+ → 1
  // Per-chord size weight: louder than the mean → bigger; lower (bass) than the
  // mean → bigger; softer/higher → smaller. Kept gentle (±~55%) so phrasing
  // shows without shredding the grid, then mean-normalised to 1.
  const weights = new Array(chords.length).fill(1);
  let wSum=0, wN=0;
  for(let i=0;i<chords.length;i++){
    const v=perChordV[i], m=perChordM[i];
    if(v==null || m==null){ weights[i]=1; wSum+=1; wN++; continue; }
    const vRel=(v-meanV)/127;            // -1..1-ish
    const mRel=(meanM-m)/48;             // bass below mean → positive
    let w = 1 + 0.55*vRel + 0.35*mRel;   // loud & low → larger
    w = Math.max(0.45, Math.min(1.8, w));
    weights[i]=w; wSum+=w; wN++;
  }
  const wMean = wN?wSum/wN:1;
  if(wMean>0){ for(let i=0;i<weights.length;i++) weights[i]/=wMean; } // normalise → mean 1
  return { energy, dynRange, register, density, weights };
}
function computeGrid(arg, opts){
  const evs=Array.isArray(arg)?arg:new Array(arg).fill(null).map(()=>({durQ:1}));
  const liveMode = !!(opts && opts.liveMode);
  // STAGE 2: a loaded piece on a wide desktop screen uses a FIXED landscape
  // golden-ratio frame (see the loaded-mode branch below). `fixedFrame` marks
  // any mode that keeps a declared CH and stretches the last row to fill it —
  // i.e. live-mode OR desktop-landscape. Mobile loaded-mode stays grow-canvas.
  // Desktop loaded-mode now uses the SAME grow-canvas engine as mobile (square
  // blocks, BH=BW*PHI), NOT a fixed frame — so it must NOT be treated as a fixed
  // frame. Only live-mode (compose/sing/listen) keeps the fixed picture frame.
  // (Previously desktop forced a fixed landscape/portrait frame whose row-stretch
  // logic deformed circles into ellipses and made the paint lag the leading note.)
  const desktopLandscape = false;
  const fixedFrame = liveMode || desktopLandscape;
  // Song-character block weighting (Mosaic differentiation): scale each event's
  // durQ by its character weight (loud/bass cells grow, soft/high shrink) so two
  // different pieces lay out differently. Weights are mean-normalised to 1, so
  // the weighted total ≈ the unweighted total and the canvas still fills exactly.
  // Only the live arrays (real chord objects) carry notes; the numeric-arg path
  // (placeholder durQ:1 events) has no character, so weights stay absent there.
  const _char = Array.isArray(arg) ? computeSongCharacter(arg) : null;
  const _wts = (_char && _char.weights && _char.weights.length===evs.length) ? _char.weights : null;
  const _effDurQ = (i)=>{
    const base = (evs[i] && evs[i].durQ!=null) ? evs[i].durQ : 1;
    return _wts ? base * _wts[i] : base;
  };
  const totalQ=evs.reduce((s,e,i)=>s+_effDurQ(i),0);
  // Live mic commits chords with very small durQ, so totalQ stays ~1–2 even
  // after many chords → N=2, rows=1 → a wide 1-row landscape strip. For
  // portraitGrow we size the column/row grid by the CHORD COUNT instead, which
  // grows 1,2,3… so rows climb and the canvas becomes a tall portrait. (totalQ
  // still drives per-cell widths below; only N/rows use the count.)
  const _layoutQ = (opts && opts.portraitGrow) ? Math.max(evs.length, totalQ) : totalQ;
  // Smart N (column count) picker — minimizes wasted space in the last row.
  // Same as before; this just chooses a column count, not the canvas shape.
  const _portrait = !!(opts && opts.portraitGrow);
  const N0 = _portrait
    ? Math.max(2, Math.ceil(Math.sqrt(_layoutQ)/1.15))
    : Math.max(2,Math.ceil(Math.sqrt(_layoutQ)));
  let bestN=N0, bestScore=-1;
  for(let dn=-1; dn<=2; dn++){
    const n=Math.max(2, N0+dn);
    const r=Math.max(1,Math.ceil(_layoutQ/n));
    const fillRatio=_layoutQ/(n*r);
    const score=fillRatio*100 - r*0.5;
    if(score>bestScore){bestScore=score; bestN=n;}
  }
  const N=bestN;
  const rows=Math.max(1,Math.ceil(_layoutQ/N));
  // Uniform global scale so the totals fill exactly N*rows width-units.
  // Every block keeps the SAME unit width across the canvas (no per-row stretching).
  const scale=(N*rows)/_layoutQ;
  let BW, BH, CW, CH;
  if(liveMode){
    // LIVE-MODE FIXED CANVAS FRAME — compose / sing / listen.
    // Width AND height stay constant regardless of chord count. Width chosen
    // by viewport (a bit larger than non-live modes since compose paintings
    // tend to be the focal point), height = width/PHI for golden-ratio frame.
    // BH (row height) = CH/rows, so adding chords makes rows thinner without
    // changing canvas shape — the "fixed picture frame" composition surface.
    const vp=(typeof window!=='undefined'&&window.innerWidth)?window.innerWidth:540;
    const targetCW=Math.min(820,Math.max(360,vp-32));
    BW=Math.max(4,Math.floor(targetCW/N));
    CW=N*BW;
    CH=Math.max(140,Math.round(CW/PHI));
    BH=Math.max(4,Math.floor(CH/rows));
  } else if(typeof window!=='undefined' && window.innerWidth>=769 && !(opts&&opts.portraitGrow)){
    // LOADED-MODE DESKTOP (PC ≥769px) — uses the SAME grow-canvas engine as
    // mobile (square-ish blocks: BH = BW*PHI, CW = N*BW, CH = rows*BH). This is
    // what makes circles render as circles and the paint keep pace with the
    // leading note. The ONLY difference from mobile is the target width: instead
    // of the full viewport, we cap it to the centre column of the three-column
    // grid (tools left ~180px, artists right ~180px, gaps + page padding). The
    // result is the identical painting, just sized to the middle lane.
    // (portraitGrow bypasses this branch — see the mobile grow branch below —
    //  so Lite live mic paints a tall portrait canvas on desktop too, instead of
    //  a wide 900px frame that goes landscape when rows are few.)
    const vpW=(typeof window!=='undefined'&&window.innerWidth)?window.innerWidth:960;
    const SIDE_W=180, GAPS=2*24, PAGE_PAD=56, SLACK=12;
    const paneW=Math.max(320, vpW - 2*SIDE_W - GAPS - PAGE_PAD - SLACK);
    const targetCWL=Math.min(900, paneW);
    BW=Math.max(2,Math.floor(targetCWL/N));
    BH=Math.round(BW*PHI);
    CW=N*BW;
    CH=rows*BH;
  } else {
    // LOADED-MODE GROW CANVAS — MIDI / audio / score / image / mood (MOBILE).
    // Block height = BW * PHI (golden ratio per block), canvas height grows
    // with row count. This is the original behavior pre-treemap experiment;
    // imported content should display naturally per-chord without being
    // squished to fit a fixed frame.
    // Width is bounded to the viewport so the canvas never exceeds the screen,
    // no matter how many columns N a piece has (e.g. a long AI-composed mood).
    // Height still grows with row count (the "grow canvas" behaviour).
    const vpL=(typeof window!=='undefined'&&window.innerWidth)?window.innerWidth:540;
    // portraitGrow (Lite live mic on desktop) caps the width to a portrait lane
    // so the canvas stays tall — a wide viewport would otherwise make it landscape.
    const _capW=(opts&&opts.portraitGrow)?560:820;
    const targetCWL=Math.min(_capW,Math.max(320,vpL-32));
    // Fill the FULL target width: deriving CW = N*floor(targetCWL/N) lost up to
    // N px to rounding, which on long pieces (large N) visibly narrowed the
    // canvas on mobile. Keep BW fractional (segment math below rounds per-cell)
    // and pin CW to the full target so the painting spans the whole column.
    BW=Math.max(2,targetCWL/N);
    BH=Math.round(BW*PHI);
    CW=Math.round(targetCWL);
    CH=rows*BH;
  }
  const cells=[];
  let curX=0,curY=0;
  for(let i=0;i<evs.length;i++){
    const dq=_effDurQ(i)*scale;
    let remaining=dq*BW;
    const segments=[];
    while(remaining>0.5){
      const availableInRow=CW-curX;
      const segW=Math.min(remaining,availableInRow);
      segments.push({x:Math.round(curX),y:curY,w:Math.max(2,Math.round(segW)),h:BH});
      curX+=segW;
      remaining-=segW;
      if(curX>=CW-0.5){curX=0;curY+=BH;}
    }
    if(!segments.length){
      segments.push({x:Math.round(curX),y:curY,w:Math.max(2,Math.round(BW)),h:BH});
    }
    const f=segments[0];
    cells.push({idx:i,x:f.x,y:f.y,w:f.w,h:f.h,segments});
  }
  // Ensure the very last segment reaches the right edge (clean bottom-right corner
  // after rounding). Applies to both modes.
  if(cells.length>0){
    const finalSegs=cells[cells.length-1].segments;
    const finalLast=finalSegs[finalSegs.length-1];
    if(finalLast.x+finalLast.w<CW){finalLast.w=CW-finalLast.x;}
    // Fixed-frame modes (live-mode OR desktop-landscape): stretch the last row
    // vertically to reach the bottom edge. Integer flooring of BH=CH/rows can
    // leave 1-Nrows pixels short; stretch every segment in the last row to cover
    // that gap. In mobile grow-mode the canvas height matches content exactly so
    // no stretch is needed.
    if(fixedFrame){
      const lastY=finalLast.y;
      if(lastY+finalLast.h<CH){
        const extraH=CH-(lastY+finalLast.h);
        for(const c of cells){
          for(const s of c.segments){
            if(s.y===lastY) s.h+=extraH;
          }
        }
      }
    }
  }
  // Mobile grow-mode: recompute CH from actual cell positions in case rounding
  // created a tiny mismatch. Fixed-frame modes (live / desktop-landscape) keep
  // the declared CH.
  if(!fixedFrame && cells.length>0){
    const lastSeg=cells[cells.length-1].segments[cells[cells.length-1].segments.length-1];
    CH=lastSeg.y+BH;
  }
  return{N,BW,BH,CW,CH,cells,rows,totalQ};
}
// ─────────────────────────────────────────────────────────────────────────────
