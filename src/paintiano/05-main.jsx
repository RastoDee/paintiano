// §6  MEMOIZED SUB-COMPONENTS (keyboard keys)
// ─────────────────────────────────────────────────────────────────────────────
const WhiteKey = memo(function WhiteKey({midi, wi, snapped, isActive, isHovered, isPending, hoverColor, busy, playing, loadedMode, pressNote, releaseNote, setHoveredKey, pressInfo}){
  const wkBg = isActive
    ? 'linear-gradient(180deg,#c9a84c,#a88830)'
    : isPending
      ? 'rgba(201,168,76,.3)'
      : isHovered && hoverColor
        ? `linear-gradient(180deg,rgba(${hoverColor[0]},${hoverColor[1]},${hoverColor[2]},0.28),rgba(${hoverColor[0]},${hoverColor[1]},${hoverColor[2]},0.18) 60%,rgba(240,235,220,1))`
        : 'rgba(240,235,220,1)';
  const disabled = busy || loadedMode;
  return (
    <div
      onMouseDown={(e)=>{if(!disabled)pressNote(midi,e);}}
      onMouseUp={()=>{if(!disabled)releaseNote(midi);}}
      onMouseEnter={()=>{if(!busy)setHoveredKey(midi);}}
      onMouseLeave={()=>{setHoveredKey(null);if(!disabled&&pressInfo.current[snapped])releaseNote(midi);}}
      onTouchStart={(e)=>{e.preventDefault();if(!disabled)pressNote(midi,e);}}
      onTouchEnd={(e)=>{e.preventDefault();if(!disabled)releaseNote(midi);}}
      onTouchCancel={()=>{if(!disabled)releaseNote(midi);}}
      onContextMenu={(e)=>e.preventDefault()}
      style={{position:'absolute',left:wi*WKW,width:WKW-1,height:WKH,background:wkBg,borderRadius:'0 0 5px 5px',border:'1px solid rgba(0,0,0,.28)',cursor:busy&&!playing?'default':'pointer',boxShadow:isActive?'0 2px 4px rgba(0,0,0,.3)':'0 4px 8px rgba(0,0,0,.4)',zIndex:1,display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:4,fontSize:'.42rem',color:'rgba(0,0,0,.35)',transition:'background .08s ease',WebkitUserSelect:'none',userSelect:'none',WebkitTouchCallout:'none'}}>
      {midi%12===0?'C'+(Math.floor(midi/12)-1):''}
    </div>
  );
});

const BlackKey = memo(function BlackKey({midi, lw, snapped, isActive, isHovered, hoverColor, outOfScale, busy, playing, loadedMode, pressNote, releaseNote, setHoveredKey, pressInfo}){
  const bkBg = isActive
    ? 'linear-gradient(180deg,#7a5a00,#5a4000)'
    : isHovered && hoverColor
      ? `linear-gradient(180deg,rgba(${hoverColor[0]},${hoverColor[1]},${hoverColor[2]},0.7),rgba(${hoverColor[0]},${hoverColor[1]},${hoverColor[2]},0.4) 60%,#0a0a0a)`
      : outOfScale
        ? 'linear-gradient(180deg,#2a2a2a,#1a1a1a)'
        : 'linear-gradient(180deg,#1a1a1a,#0a0a0a)';
  const disabled = busy || loadedMode;
  return (
    <div
      onMouseDown={(e)=>{if(!disabled)pressNote(midi,e);}}
      onMouseUp={()=>{if(!disabled)releaseNote(midi);}}
      onMouseEnter={()=>{if(!busy)setHoveredKey(midi);}}
      onMouseLeave={()=>{setHoveredKey(null);if(!disabled&&pressInfo.current[snapped])releaseNote(midi);}}
      onTouchStart={(e)=>{e.preventDefault();if(!disabled)pressNote(midi,e);}}
      onTouchEnd={(e)=>{e.preventDefault();if(!disabled)releaseNote(midi);}}
      onTouchCancel={()=>{if(!disabled)releaseNote(midi);}}
      onContextMenu={(e)=>e.preventDefault()}
      style={{position:'absolute',left:(lw+0.65)*WKW,top:0,width:BKW,height:BKH,background:bkBg,borderRadius:'0 0 4px 4px',border:'1px solid rgba(0,0,0,.7)',cursor:busy&&!playing?'default':'pointer',zIndex:2,boxShadow:isActive?'none':'2px 5px 10px rgba(0,0,0,.85)',transition:'background .08s ease',WebkitUserSelect:'none',userSelect:'none',WebkitTouchCallout:'none'}}/>
  );
});

// Custom hook: focus-trap + focus-restore for modal dialogs.
// Behaviour:
//   1. On mount, snapshot the currently-focused element. Move focus into the
//      modal panel (first focusable child, falling back to the panel itself).
//   2. While the modal is open, intercept Tab/Shift+Tab on the panel and
//      cycle through its focusable descendants instead of escaping to the
//      background (which is hidden behind the modal but still tabbable).
//   3. On unmount, restore focus to the previously-focused element so keyboard
//      users return to the trigger button after closing.
// The Escape key is already handled by a global keydown listener in Paintiano,
// so this hook deliberately does NOT handle Escape.
function useModalFocusTrap(panelRef){
  useEffect(()=>{
    const panel = panelRef.current;
    if(!panel) return;
    const previousActive = (typeof document!=='undefined') ? document.activeElement : null;
    const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    // Initial focus — first focusable descendant, or the panel itself
    const getFocusables = ()=>Array.from(panel.querySelectorAll(focusableSelector)).filter(el=>el.offsetParent!==null||el===document.activeElement);
    const initial = getFocusables();
    if(initial.length){
      // Use a microtask so React has finished mounting before we focus
      Promise.resolve().then(()=>{try{initial[0].focus();}catch(_){}});
    }else{
      // Make the panel itself focusable as fallback
      if(!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex','-1');
      Promise.resolve().then(()=>{try{panel.focus();}catch(_){}});
    }
    const onKey = (e)=>{
      if(e.key!=='Tab') return;
      const focusables = getFocusables();
      if(!focusables.length){ e.preventDefault(); return; }
      const first = focusables[0], last = focusables[focusables.length-1];
      const active = document.activeElement;
      if(e.shiftKey){
        // Shift+Tab — wrap from first back to last
        if(active===first||!panel.contains(active)){
          e.preventDefault();
          try{last.focus();}catch(_){}
        }
      }else{
        // Tab — wrap from last back to first
        if(active===last||!panel.contains(active)){
          e.preventDefault();
          try{first.focus();}catch(_){}
        }
      }
    };
    panel.addEventListener('keydown', onKey);
    return ()=>{
      panel.removeEventListener('keydown', onKey);
      // Restore focus to the element that had it before the modal opened.
      // Guard against the element having been removed (e.g. the trigger
      // button was inside a conditionally-rendered branch that's now gone).
      if(previousActive && typeof previousActive.focus === 'function' && document.contains(previousActive)){
        try{previousActive.focus();}catch(_){}
      }
    };
  },[panelRef]);
}

// Self-contained concept-text modal. Lifted out of the main JSX so the modal
// only reconciles when (lang, t, onClose) actually change — previously it
// re-rendered on every Paintiano render including the 5-15Hz `disp` tick
// during playback even when not visible. `React.memo` plus stable t/onClose
// references from the parent skip reconciliation entirely.
const AboutModal = memo(function AboutModal({onClose, t, lang, readScale, setReadScale}){
  const panelRef = useRef(null);
  useModalFocusTrap(panelRef);
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.92)',zIndex:100000,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'4vh 16px',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',overflowY:'auto'}}>
      <div ref={panelRef} onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="paintiano-about-title" style={{maxWidth:560,width:'100%',background:'rgba(16,12,24,0.97)',border:'1px solid rgba(201,168,76,.3)',borderRadius:8,padding:'26px 22px',color:'rgba(207,197,168,.88)',fontSize:(.78*readScale)+'rem',lineHeight:1.65,fontFamily:'inherit',position:'relative'}}>
        <button onClick={onClose} aria-label="close" style={{position:'absolute',top:12,right:14,background:'transparent',border:'none',color:'rgba(207,197,168,.5)',fontSize:'1.1rem',cursor:'pointer',lineHeight:1,padding:4}} title="close">×</button>
        <div id="paintiano-about-title" style={{textAlign:'center',marginBottom:14,letterSpacing:'.24em',color:'rgba(201,168,76,.85)',fontSize:(.7*readScale)+'rem',textTransform:'uppercase'}}>{t('conceptTitle')}</div>
        <div style={{display:'flex',justifyContent:'center',marginBottom:14}}><button onClick={()=>setReadScale(rs=> rs>=1.5?1 : rs>=1.25?1.5 : 1.25)} aria-label={t('fsLabel')} title={t('fsLabel')} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'5px 16px',borderRadius:16,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',textTransform:'uppercase',color:'rgba(201,168,76,.85)',background:readScale>1?'rgba(255,255,255,.04)':'transparent',border:'1px solid rgba(201,168,76,.85)'}}><span style={{fontSize:'.6rem',fontWeight:600}}>{t('fsLabel')}</span><span style={{fontSize:(0.6*readScale)+'rem',fontWeight:700}}>A</span><span style={{fontSize:'.55rem',opacity:.7}}>{readScale===1?'1×':readScale===1.25?'1.25×':'1.5×'}</span></button></div>
        <style>{`#pf-concept-body{font-size:${(0.78*readScale).toFixed(3)}rem;}
#pf-concept-body h3{font-size:${(1.02*readScale).toFixed(3)}rem !important;font-weight:600 !important;letter-spacing:.02em !important;border-bottom:none !important;padding:0 0 0 14px !important;margin:26px 0 12px !important;position:relative;line-height:1.25 !important;}
#pf-concept-body h3:first-of-type{margin-top:0 !important;}
#pf-concept-body h3::before{content:"";position:absolute;left:0;top:0.15em;bottom:0.15em;width:3px;border-radius:2px;background:currentColor;opacity:.65;}
#pf-concept-body p,#pf-concept-body li{font-size:${(0.84*readScale).toFixed(3)}rem !important;line-height:1.7 !important;margin:0 0 14px !important;}
#pf-concept-body p+p{margin-top:-2px !important;}
#pf-concept-body strong,#pf-concept-body em{font-size:inherit !important;}
#pf-concept-body p[style*="italic"]{padding:10px 14px !important;margin:4px 0 22px !important;background:rgba(255,255,255,0.025) !important;border-left:2px solid rgba(201,168,76,.45) !important;border-radius:0 8px 8px 0 !important;line-height:1.6 !important;}
#pf-concept-body h3+p,#pf-concept-body h3+p+p{padding:12px 14px !important;margin-bottom:10px !important;background:rgba(255,255,255,0.018) !important;border:1px solid rgba(255,255,255,0.05) !important;border-radius:10px !important;}
#pf-concept-body h3+p+p+p{padding:0 !important;background:transparent !important;border:none !important;margin-top:14px !important;}`}</style>
        <div id="pf-concept-body">{getConcept(lang)}</div>
        <button onClick={onClose} style={{display:'block',margin:'22px auto 0',padding:'8px 24px',background:'transparent',color:'rgba(207,197,168,.7)',border:'1px solid rgba(207,197,168,.25)',borderRadius:3,cursor:'pointer',fontSize:(.6*readScale)+'rem',fontFamily:'inherit',letterSpacing:'.16em',textTransform:'uppercase'}}>{t('close')||'close'}</button>
      </div>
    </div>
  );
});

// Self-contained searchable guide modal. Same memoization rationale as
// AboutModal — without this lift, opening the guide and then leaving it open
// during playback would reconcile its full subtree (input + filtered details
// list) on every 5-15Hz `disp` tick. Now it only reconciles when one of its
// actual props changes (query, focus, lang, t, onClose).
const GuideModal = memo(function GuideModal({onClose, t, lang, guideQuery, setGuideQuery, focusedInput, setFocusedInput, inputFocus, readScale, setReadScale}){
  const panelRef = useRef(null);
  useModalFocusTrap(panelRef);
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.92)',zIndex:100000,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'4vh 16px',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',overflowY:'auto'}}>
      <div ref={panelRef} onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="paintiano-guide-title" style={{maxWidth:560,width:'100%',background:'rgba(16,12,24,0.97)',border:'1px solid rgba(140,200,255,.3)',borderRadius:8,padding:'24px 20px',color:'rgba(207,197,168,.88)',fontSize:(.78*readScale)+'rem',lineHeight:1.6,fontFamily:'inherit',position:'relative'}}>
        <button onClick={onClose} aria-label="close" style={{position:'absolute',top:12,right:14,background:'transparent',border:'none',color:'rgba(207,197,168,.5)',fontSize:'1.1rem',cursor:'pointer',lineHeight:1,padding:4}} title="close">×</button>
        <div id="paintiano-guide-title" style={{textAlign:'center',marginBottom:18,letterSpacing:'.24em',color:'rgba(140,200,255,.85)',fontSize:(.7*readScale)+'rem',textTransform:'uppercase'}}>{t('guideTitle')}</div>
        <style>{`#pf-guide-body{font-size:${(0.78*readScale).toFixed(3)}rem;}
#pf-guide-body .pf-gsec{font-size:${(0.6*readScale).toFixed(3)}rem !important;font-weight:600 !important;letter-spacing:.06em !important;text-transform:uppercase !important;margin:24px 0 10px !important;padding:0 0 0 12px !important;position:relative !important;color:rgba(140,200,255,.85) !important;line-height:1.25 !important;}
#pf-guide-body .pf-gsec:first-of-type{margin-top:6px !important;}
#pf-guide-body .pf-gsec::before{content:"";position:absolute;left:0;top:0.2em;bottom:0.2em;width:2px;border-radius:1px;background:rgba(140,200,255,.6);}
#pf-guide-body details{margin-bottom:8px !important;border:1px solid rgba(140,200,255,.10) !important;border-radius:10px !important;padding:0 !important;background:rgba(255,255,255,0.018) !important;transition:border-color .18s ease, background .18s ease;}
#pf-guide-body details:hover{border-color:rgba(140,200,255,.22) !important;background:rgba(255,255,255,0.028) !important;}
#pf-guide-body details[open]{border-color:rgba(140,200,255,.35) !important;background:rgba(140,200,255,0.04) !important;}
#pf-guide-body summary{cursor:pointer;padding:11px 14px 11px 14px !important;color:rgba(140,200,255,.92) !important;font-weight:500 !important;font-size:${(0.84*readScale).toFixed(3)}rem !important;letter-spacing:.01em !important;list-style:none !important;user-select:none;display:flex;align-items:center;gap:10px;line-height:1.35;}
#pf-guide-body summary::-webkit-details-marker{display:none;}
#pf-guide-body summary::after{content:"›";margin-left:auto;font-size:1.1em;color:rgba(140,200,255,.5);transition:transform .2s ease;display:inline-block;}
#pf-guide-body details[open] summary::after{transform:rotate(90deg);color:rgba(140,200,255,.85);}
#pf-guide-body details p{margin:0 !important;padding:2px 14px 12px !important;color:rgba(207,197,168,.82) !important;font-size:${(0.78*readScale).toFixed(3)}rem !important;line-height:1.7 !important;}
#pf-guide-body details p+p{padding-top:6px !important;}`}</style>
        <div style={{display:'flex',justifyContent:'center',marginBottom:14}}><button onClick={()=>setReadScale(rs=> rs>=1.5?1 : rs>=1.25?1.5 : 1.25)} aria-label={t('fsLabel')} title={t('fsLabel')} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'5px 16px',borderRadius:16,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',textTransform:'uppercase',color:'rgba(140,200,255,.85)',background:readScale>1?'rgba(255,255,255,.04)':'transparent',border:'1px solid rgba(140,200,255,.85)'}}><span style={{fontSize:'.6rem',fontWeight:600}}>{t('fsLabel')}</span><span style={{fontSize:(0.6*readScale)+'rem',fontWeight:700}}>A</span><span style={{fontSize:'.55rem',opacity:.7}}>{readScale===1?'1×':readScale===1.25?'1.25×':'1.5×'}</span></button></div>
        <input
          type="search"
          value={guideQuery}
          onChange={e=>setGuideQuery(e.target.value)}
          onFocus={()=>{inputFocus.current=true;setFocusedInput('guide');}}
          onBlur={()=>{inputFocus.current=false;setFocusedInput(null);}}
          placeholder={t('searchGuide')}
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          inputMode="search"
          enterKeyHint="search"
          aria-label={t('searchGuide')}
          style={{width:'100%',boxSizing:'border-box',background:'rgba(8,6,14,0.6)',border:'1px solid '+(focusedInput==='guide'?'rgba(140,200,255,.85)':'rgba(140,200,255,.3)'),borderRadius:4,padding:'9px 12px',color:'rgba(207,197,168,.95)',fontSize:(.78*readScale)+'rem',fontFamily:'inherit',outline:'none',letterSpacing:'.04em',marginBottom:16,WebkitAppearance:'none',boxShadow:focusedInput==='guide'?'0 0 0 2px rgba(140,200,255,.18)':'none',transition:'border-color .15s ease, box-shadow .15s ease'}}
        />
        <div id="pf-guide-body">
        {(() => {
          const matches = orderedGuide(lang).filter(e => guideMatch(e, guideQuery));
          if (matches.length === 0) {
            return <p style={{textAlign:'center',opacity:.5,fontStyle:'italic',padding:'20px 0'}}>{t('noMatches')} "{guideQuery}".</p>;
          }
          return matches.map(entry => {
            const sec = !guideQuery.trim() ? GUIDE_SEC[entry.id] : null;
            return (
            <Fragment key={entry.id}>
              {sec && (
                <div className="pf-gsec">{t('gsec_'+sec)}</div>
              )}
              <details open={!!guideQuery.trim()} style={{marginBottom:6,border:'1px solid rgba(207,197,168,.08)',borderRadius:4,padding:'2px 0',background:'rgba(255,255,255,0.012)'}}>
                <summary style={{cursor:'pointer',padding:'9px 12px',color:'rgba(140,200,255,.92)',fontWeight:500,fontSize:(0.82*readScale)+'rem',letterSpacing:'.02em',listStyle:'none',userSelect:'none'}}>{entry.title}</summary>
                {entry.body.split('◆').map((para,i)=>(
                  <p key={i} style={{margin:i===0?0:'8px 0 0',padding:'2px 14px 12px',color:'rgba(207,197,168,.82)',fontSize:(0.76*readScale)+'rem',lineHeight:1.65}}>{para.trim()}</p>
                ))}
              </details>
            </Fragment>
            );
          });
        })()}
        </div>
        <button onClick={onClose} style={{display:'block',margin:'20px auto 0',padding:'8px 24px',background:'transparent',color:'rgba(207,197,168,.7)',border:'1px solid rgba(207,197,168,.25)',borderRadius:3,cursor:'pointer',fontSize:(.6*readScale)+'rem',fontFamily:'inherit',letterSpacing:'.16em',textTransform:'uppercase'}}>close</button>
      </div>
    </div>
  );
});

// Self-contained palette editor modal. Same memo rationale as the other two —
// while the editor is open, the parent's 5-15Hz `disp` tick during playback
// would otherwise reconcile the swatch grid every frame. With memo, the modal
// only reconciles when (activePalette, setCustomPalette, t, onClose) change,
// i.e. when the user actually picks a color.
const PaletteEditorModal = memo(function PaletteEditorModal({onClose, t, activePalette, setCustomPalette}){
  const panelRef = useRef(null);
  useModalFocusTrap(panelRef);
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.92)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'4vh 16px',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',overflowY:'auto'}}>
      <div ref={panelRef} onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="paintiano-palette-title" style={{maxWidth:420,width:'100%',background:'rgba(16,12,24,0.97)',border:'1px solid rgba(201,168,76,.3)',borderRadius:8,padding:'24px 22px',color:'rgba(207,197,168,.88)',fontFamily:"'Cormorant Garamond','Palatino Linotype',Georgia,serif",position:'relative'}}>
        <button onClick={onClose} aria-label="close" style={{position:'absolute',top:12,right:14,background:'transparent',border:'none',color:'rgba(207,197,168,.5)',fontSize:'1.1rem',cursor:'pointer',lineHeight:1,padding:4}} title="close">×</button>
        <div id="paintiano-palette-title" style={{textAlign:'center',marginBottom:18,letterSpacing:'.24em',color:'rgba(201,168,76,.85)',fontSize:'.7rem',textTransform:'uppercase'}}>{t('paletteEditorTitle')}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:10,marginBottom:18}}>
          {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map((label,pc)=>(
            <label key={pc} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,cursor:'pointer'}}>
              <div style={{position:'relative',width:60,height:60,borderRadius:6,background:activePalette[pc],border:'2px solid rgba(207,197,168,.25)',boxShadow:'0 2px 6px rgba(0,0,0,.4)'}}>
                <input type="color" value={activePalette[pc]} onChange={e=>{
                  const next=activePalette.slice();
                  next[pc]=e.target.value;
                  setCustomPalette(next);
                }} style={{position:'absolute',inset:0,opacity:0,cursor:'pointer',width:'100%',height:'100%'}} aria-label={label}/>
              </div>
              <span style={{fontSize:'.65rem',letterSpacing:'.06em',color:'rgba(207,197,168,.7)'}}>{label}</span>
            </label>
          ))}
        </div>
        <div style={{display:'flex',gap:10,justifyContent:'center',marginTop:18,flexWrap:'wrap'}}>
          <button onClick={()=>{
            // Default: restore the opposite-of-Harmony palette (each pitch class
            // gets Harmony's complementary hue). This is the same palette the app
            // seeds Custom with, so it always plays and contrasts with Color.
            setCustomPalette(Array.from({length:12},(_,pc)=>{
              const oppHue=(COF[pc]+180)%360;
              const [r,g,b]=fromHsl(oppHue,80,55);
              return '#'+[r,g,b].map(x=>Math.max(0,Math.min(255,x)).toString(16).padStart(2,'0')).join('');
            }));
          }} style={{padding:'8px 16px',background:'rgba(201,168,76,.1)',color:'rgba(201,168,76,.8)',border:'1px solid rgba(201,168,76,.35)',borderRadius:4,cursor:'pointer',fontSize:'.6rem',fontFamily:'inherit',letterSpacing:'.1em',textTransform:'uppercase'}}>{t('defaultPalette')}</button>
          <button onClick={()=>{
            // Clear all: reset every pitch class to neutral light grey.
            // The user starts from a blank slate and picks each color
            // themselves — no implicit harmony or spectral seed.
            setCustomPalette(Array(12).fill('#888888'));
          }} style={{padding:'8px 16px',background:'transparent',color:'rgba(207,197,168,.7)',border:'1px solid rgba(207,197,168,.3)',borderRadius:4,cursor:'pointer',fontSize:'.6rem',fontFamily:'inherit',letterSpacing:'.1em',textTransform:'uppercase'}}>{t('resetPalette')}</button>
          <button onClick={onClose} style={{padding:'8px 22px',background:'rgba(201,168,76,.15)',color:GOLD,border:'1px solid rgba(201,168,76,.45)',borderRadius:4,cursor:'pointer',fontSize:'.6rem',fontFamily:'inherit',letterSpacing:'.12em',textTransform:'uppercase'}}>{t('close')||'close'}</button>
        </div>
      </div>
    </div>
  );
});

// Shown once per session (survives in-app remounts; a real page reload starts a
// fresh session and replays it — the intended "UX standard" behaviour).
let INTRO_SHOWN = false;

// Splash intro: a Pollock-style burst of coloured paint that erupts from centre,
// arcs out with gravity + fading trails, settles, then the title surfaces. Runs
// on a real <canvas> (rAF) so it's smooth. Tap anywhere (or auto-timeout) to skip.
function IntroSplash({ onDone, tagline, skipLabel }){
  const cvRef = useRef(null);
  const rafRef = useRef(0);
  const doneRef = useRef(false);
  const [titleIn, setTitleIn] = useState(false);
  const finish = useCallback(()=>{ if(doneRef.current) return; doneRef.current=true; cancelAnimationFrame(rafRef.current); onDone(); },[onDone]);

  useEffect(()=>{
    const cv = cvRef.current; if(!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio||1);
    let W=cv.clientWidth, H=cv.clientHeight;
    cv.width=W*dpr; cv.height=H*dpr;
    const ctx = cv.getContext('2d'); ctx.scale(dpr,dpr);

    // Circle-of-fifths hues → vivid paint colours.
    const COF_L=[0,210,60,270,120,330,180,30,240,90,300,150];
    const hsl=(h,s,l)=>{s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>Math.round((l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1))))*255);return`rgb(${f(0)},${f(8)},${f(4)})`;};

    // Pollock drip: ribbons of paint are "thrown" across the canvas — each stroke
    // is a moving head that lays down a tapering line, flinging the odd droplet.
    // No radial fireworks; the motion reads as a hand whipping paint across.
    const strokes=[];
    const mkStroke=(t0)=>{
      const edge=Math.random();
      // start somewhere off/near an edge, travel across with a lazy arc
      const x = edge<.5 ? -20+Math.random()*40 : W-20+Math.random()*40;
      const y = H*(0.15+Math.random()*0.7);
      const dir = x<W/2 ? 1 : -1;
      const pc=(Math.random()*12)|0;
      strokes.push({
        t0, x, y,
        vx: dir*(2.2+Math.random()*2.6), vy:(Math.random()-.5)*2.2,
        curl:(Math.random()-.5)*0.06, swing:Math.random()*6.28,
        w: 2.5+Math.random()*4, col:hsl(COF_L[pc],80,50+Math.random()*16),
        life:0, max:42+Math.random()*40, px:x, py:y, drips:[],
      });
    };
    // staggered, overlapping strokes — a calm build, not one big bang
    let nextAt=4; for(let i=0;i<18;i++){ const at=nextAt; mkStroke(at); nextAt+=9+((Math.random()*12)|0); }

    const START=performance.now();
    const DUR=4600;
    let frame=0;
    const tick=(now)=>{
      const el=now-START; frame++;
      // soft fade for layered, painterly build-up (strokes persist, gently settle)
      ctx.fillStyle='rgba(6,6,12,0.05)'; ctx.fillRect(0,0,W,H);
      for(const s of strokes){
        if(frame < s.t0) continue;
        if(s.life<=s.max){
          s.life++;
          s.px=s.x; s.py=s.y;
          // curving, decelerating throw with a little vertical swing
          s.vx*=0.99; s.curl*=0.99;
          s.vy += s.curl*6 + Math.sin(s.life*0.18+s.swing)*0.12;
          s.x+=s.vx; s.y+=s.vy;
          const taper=Math.sin(Math.min(1,s.life/s.max)*Math.PI); // thin→thick→thin
          ctx.strokeStyle=s.col; ctx.lineCap='round';
          ctx.lineWidth=Math.max(0.6, s.w*taper);
          ctx.globalAlpha=0.9;
          ctx.beginPath(); ctx.moveTo(s.px,s.py); ctx.lineTo(s.x,s.y); ctx.stroke();
          // fling a droplet now and then
          if(Math.random()<0.18){ s.drips.push({x:s.x,y:s.y,vx:s.vx*0.3+(Math.random()-.5),vy:s.vy*0.3+Math.random()*1.5,r:1+Math.random()*2.4,life:0,max:30+Math.random()*30,col:s.col}); }
        }
        // droplets fall + fade
        for(const d of s.drips){
          if(d.life>d.max) continue;
          d.life++; d.vy+=0.12; d.x+=d.vx; d.y+=d.vy;
          ctx.globalAlpha=Math.max(0,1-d.life/d.max)*0.85;
          ctx.fillStyle=d.col; ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,6.2832); ctx.fill();
        }
      }
      ctx.globalAlpha=1;
      if(el>1200 && !titleIn) setTitleIn(true);
      if(el<DUR && !doneRef.current){ rafRef.current=requestAnimationFrame(tick); }
      else finish();
    };
    rafRef.current=requestAnimationFrame(tick);

    const onResize=()=>{ W=cv.clientWidth;H=cv.clientHeight;cv.width=W*dpr;cv.height=H*dpr;ctx.scale(dpr,dpr); };
    window.addEventListener('resize',onResize);
    return ()=>{ cancelAnimationFrame(rafRef.current); window.removeEventListener('resize',onResize); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  return (
    <div onClick={finish} role="button" aria-label="skip intro"
      style={{position:'fixed',inset:0,zIndex:9999,background:'#06060c',cursor:'pointer',overflow:'hidden'}}>
      <canvas ref={cvRef} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>
      <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'3rem',fontWeight:600,letterSpacing:'.04em',
          background:`linear-gradient(95deg,${PF.gold2},${PF.cream} 50%,${PF.gold})`,WebkitBackgroundClip:'text',backgroundClip:'text',WebkitTextFillColor:'transparent',
          opacity:titleIn?1:0,transform:titleIn?'translateY(0) scale(1)':'translateY(10px) scale(.96)',transition:'opacity .8s ease, transform .9s cubic-bezier(.2,.8,.2,1)',textShadow:'0 4px 30px rgba(0,0,0,.5)'}}>Paintiano</div>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:'.6rem',letterSpacing:'.34em',textTransform:'uppercase',color:PF.cream,marginTop:12,transformOrigin:'center top',
          opacity:titleIn?0.8:0,transform:titleIn?'scale(1)':'scale(2.4)',transition:'opacity .7s ease .8s, transform 1.0s cubic-bezier(.18,.7,.16,1) .8s'}}>{tagline}</div>
      </div>
      <div style={{position:'absolute',bottom:30,left:0,right:0,textAlign:'center',fontFamily:"'Outfit',sans-serif",fontSize:'.5rem',letterSpacing:'.2em',textTransform:'uppercase',color:'rgba(242,238,232,.28)',pointerEvents:'none'}}>{skipLabel}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// §7  MAIN COMPONENT — Paintiano
// ─────────────────────────────────────────────────────────────────────────────
export default function Paintiano() {
  const canvasRef    = useRef(null);
  const canvasWrapRef = useRef(null); // wrapper around the canvas — scrolled into view when the strip closes
  const stripWrapRef = useRef(null); // wrapper around the Color·Style strip — scroll target on Play in mood-from-image so the strip + source thumbnail stay framed
  const audioElRef   = useRef(null); // real audio playback in audio mode
  const audioSourceRef = useRef(null); // Web Audio source node for audio mode
  const audioStartTimeRef = useRef(0); // AudioContext time when playback started
  const audioOffsetRef = useRef(0);    // offset into the audio buffer
  const samplerRef   = useRef(null);
  const samplerOk    = useRef(false);
  const pendingRef   = useRef([]);
  const kbTimer      = useRef(null);
  const timers       = useRef([]);
  const idxRef       = useRef(0);
  const pixelRef     = useRef(null);
  const genRef       = useRef(0);
  const inputFocus   = useRef(false);
  const refMidi      = useRef(null);
  const refAudio     = useRef(null);
  const refImage     = useRef(null);
  const refImgMood   = useRef(null);
  const refScore     = useRef(null);
  const kbScrollRef  = useRef(null);
  const recorderRef      = useRef(null);
  const recChunksRef     = useRef([]);
  const recStreamDestRef = useRef(null);
  const micStreamRef     = useRef(null);
  const micRafRef        = useRef(null);
  const micVolRef        = useRef(null);
  const micAcRef         = useRef(null); // AudioContext for mic-paint, closed on stop
  const listenStreamRef  = useRef(null);
  const listenRafRef     = useRef(null);
  const listenAcRef      = useRef(null); // AudioContext for mic-listen, closed on stop
  // Press-tracking: per-midi {pressTime,chordIdx}. On release we compute
  // the actual hold duration and patch it into the chord that captured this
  // press, so each block's width reflects how long the key was held.
  const pressInfo    = useRef({});
  const sessionStart = useRef(0);
  const ripplesRef    = useRef([]);
  const visualizerRef = useRef(null);
  const highlightCanvasRef = useRef(null);
  const viewModeRef   = useRef('paint');
  const playbackSpeedRef = useRef(1);
  const resumeFromRef = useRef(null); // null = fresh start, number = resume from this disp index
  // Tracks the last full-paint snapshot so playback can append incrementally
  // instead of re-running every artist-style draw from chord 0 on each `disp` tick.
  const lastPaintRef  = useRef({disp:0,chords:null,grid:null,gc:null,style:null,viewMode:null,pending:null,info:null,anim:false,playing:false,stamp:0,mode:null,holdPaused:false});
  // Throttle the expensive canvas-wide overlay repaint during playback. The
  // overlay (Pollock/Picasso/Kusama/Miró/Kandinsky/Rothko/Matisse) is redrawn
  // from scratch each frame; at ~7 frames/sec on a long track that starves the
  // audio scheduler. We cap overlay repaints to ~9fps while playing — the
  // reveal still looks smooth but the main thread stays free for audio. Audio
  // timing itself is untouched (separate setTimeout chain).
  const lastOverlayPaintRef = useRef(0);
  // ── OFFSCREEN SUBSTRATE CACHE ──────────────────────────────────────────────
  // For overlay styles (pollock/picasso/kusama/miro/kandinsky/rothko/matisse)
  // the per-cell substrate underneath the canvas-wide overlay is IDENTICAL from
  // frame to frame for a given chord set — only the overlay changes as `lim`
  // grows. Previously every throttled overlay repaint re-ran drawOne for ALL
  // revealed cells from chord 0 (O(N) per frame → O(N²) per playback). We cache
  // the substrate into an offscreen canvas and only draw newly-revealed cells
  // into it incrementally, then blit it (one GPU-accelerated drawImage) before
  // running the overlay. Substrate cost per frame drops to O(new cells only).
  const substrateRef = useRef({canvas:null,ctx:null,builtTo:0,key:'',CW:0,CH:0});
  // Intro reveal animation: tracks the RAF id so it can be cancelled by clear()
  // or a subsequent load before the previous animation finishes.
  const introRafRef   = useRef(null);

  const [mode,      setMode]      = useState('harmony');
  const modeRef = useRef('harmony');
  useEffect(()=>{ modeRef.current=mode; },[mode]);
  // The colour reading the app chose for the current image (harmony or bw), so
  // leaving Custom returns to it rather than always to harmony.
  const appModeRef = useRef('harmony');
  // Custom palette = 12 hex colors, one per pitch class (index 0 = C, 11 = B).
  // null = uninitialized. Seeded on first switch to 'custom' mode from whichever
  // mode was active. Persisted across sessions in localStorage.
  const [customPalette, setCustomPalette] = useState(()=>{
    try{
      const PALETTE_VERSION='2';
      const savedVersion=localStorage.getItem('paintiano_palette_version');
      if(savedVersion!==PALETTE_VERSION){localStorage.removeItem('paintiano_custom_palette');localStorage.setItem('paintiano_palette_version',PALETTE_VERSION);return null;}
      const raw=localStorage.getItem('paintiano_custom_palette');
      if(!raw)return null;
      const arr=JSON.parse(raw);
      if(!Array.isArray(arr)||arr.length!==12)return null;
      if(arr.every(h=>h==='#888888'))return null;
      return arr;
    }catch(_){}
    return null;
  });
  // Default Custom palette = the exact OPPOSITE of Harmony: each pitch class gets
  // the complementary hue (Harmony's COF hue + 180°). So the moment you open
  // Custom it already plays AND sounds maximally different from Color/Harmony —
  // no silent grey default, and the contrast is obvious on first listen. The user
  // can still recolour any swatch in the editor.
  const defaultCustomPalette=useMemo(()=>Array.from({length:12},(_,pc)=>{
    const oppHue=(COF[pc]+180)%360;
    const [r,g,b]=fromHsl(oppHue,80,55);
    return '#'+[r,g,b].map(x=>Math.max(0,Math.min(255,x)).toString(16).padStart(2,'0')).join('');
  }),[]);
  const activePalette=customPalette||defaultCustomPalette;
  useEffect(()=>{
    if(!customPalette)return;
    if(customPalette.every(h=>h==='#888888'))return;
    try{localStorage.setItem('paintiano_custom_palette',JSON.stringify(customPalette));}catch(_){}
  },[customPalette]);
  // Modal open state for the palette editor
  const [showPaletteEditor, setShowPaletteEditor] = useState(false);
  // Custom chip (image mode) is a multi-step cycle. After Custom is active, the
  // 2nd tap "arms" it — the chip label switches to "edit palette" but the editor
  // stays closed; the 3rd tap actually opens the editor. Closing the editor
  // disarms it, returning the chip to the plain active "Custom" label.
  const [customArmed, setCustomArmed] = useState(false);
  // Toggles a read-only preview of the 12 Harmony colours under the Color chip
  // (image mode). Tapping the active Color chip shows/hides it; it's purely
  // informational (the swatches can't be edited — that's what Custom is for).
  const [showColorPalette, setShowColorPalette] = useState(false);
  // After returning to SETUP from an image, no colour tab should look selected
  // (the app's image pick shouldn't carry over as a gold SETUP tab). Cleared the
  // moment the user taps any colour tab in SETUP.
  const [setupNoSel, setSetupNoSel] = useState(false);
  // One-shot splash intro (palette→keyboard demo). Skippable by tap; auto-hides.
  const [showIntro, setShowIntro] = useState(()=>!INTRO_SHOWN);
  useEffect(()=>{
    if(INTRO_SHOWN) return;
    INTRO_SHOWN = true;                          // mark immediately so remounts don't replay
    const t=setTimeout(()=>setShowIntro(false), 4800);   // safety net slightly above the canvas DUR
    return ()=>clearTimeout(t);
  },[]);
  // Stable close callback so PaletteEditorModal's React.memo can skip
  // reconciliation when the parent re-renders for unrelated reasons.
  const closePaletteEditor = useCallback(()=>{setShowPaletteEditor(false);setCustomArmed(false);},[]);
  const [chords,    setChords]    = useState([]);
  const [disp,      setDisp]      = useState(0);
  const [active,    setActive]    = useState(new Set());
  const [pickMode,  setPickMode]  = useState(null); // 'midi' | 'audio' | null
  const [preview,   setPreview]   = useState(null); // {url, filename, w, h, size, file}
  const [previewMsg,setPreviewMsg]= useState(null); // in-modal status text
  // paintDur is read by the playback-timing path (below) but never changed at
  // runtime — the UI control that used to set it was removed. Kept as a plain
  // const at its former default so the timing math is unaffected. paintVel was
  // fully dead (never read, never set) and has been removed.
  const paintDur = 500;
  const [paintScale,setPaintScale]= useState('off');
  const [pending,   setPending]   = useState([]);
  const [playing,   setPlaying]   = useState(false);const mutedRef=useRef(false);const [muted,setMuted]=useState(()=>{try{const v=localStorage.getItem('paintiano_muted')==='1';mutedRef.current=v;return v;}catch(_){return false;}});useEffect(()=>{mutedRef.current=muted;try{Tone.getDestination().mute=muted;localStorage.setItem('paintiano_muted',muted?'1':'0');if(audioSourceRef.current&&audioSourceRef.current._muteGain)audioSourceRef.current._muteGain.gain.value=muted?0:1;}catch(_){}},[muted]);const randomModeRef=useRef(false);const [randomMode,setRandomMode]=useState(false);const [rndSalt,setRndSalt]=useState(0);useEffect(()=>{randomModeRef.current=randomMode;try{localStorage.setItem('paintiano_random',randomMode?'1':'0');}catch(_){}},[randomMode]);
  // Variation history for Random mode prev/next navigation. saltHistory holds
  // the sequence of random salts that have been shown; saltIdxRef points at the
  // current one. Play-from-start and Loop append+advance (fresh variation);
  // Prev/Next step the index so you can browse back to a variation you liked.
  const saltHistoryRef = useRef([0]);
  const saltIdxRef = useRef(0);
  const [variationPos, setVariationPos] = useState(0); // for UI: re-render on nav
  const [lang, setLang] = useState(()=>{try{return localStorage.getItem('paintiano_lang')||'EN';}catch(_){return 'EN';}});
  // Mirror lang into a ref so the demo reel orchestrator (whose timers were
  // scheduled with closure over the old lang) can resolve text at fire time
  // against the current language. Otherwise switching language mid-reel
  // updates the navigation but the title cards keep the original lang.
  const langRef = useRef(lang);
  useEffect(()=>{ langRef.current = lang; }, [lang]);
  const [langOpen, setLangOpen] = useState(false);
  const t = useCallback((key) => I18N[lang]?.[key] ?? I18N.EN[key] ?? key, [lang]);

  // ─── Paintiano Pro state (from 07-pro.jsx) ───
  const { proStatus, isPro, maskedEmail, activateLicense, deactivateLicense, openCheckout,
          trialUsed, trialLeft, trialExhausted, consumeTrial, gateAI } = useEntitlements();
  const [paywallReason, setPaywallReason] = useState(null); // null | 'ai_trial' | 'settings'
  // Descriptive style labels shown on the chips (the internal keys —
  // picasso/kusama/… — stay unchanged everywhere in the logic). This keeps the
  // feature branded by what it DOES, while STYLE_INSPIRED supplies a small
  // "inspired by …" caption for context. All eight, including Kusama, are
  // attributed by name in this build (explicit choice).
  // Style button labels, per language. Previously a single English object, so the
  // style row read EN regardless of UI language. Now keyed by lang and selected
  // below, with EN as the fallback. (Artist attribution STYLE_INSPIRED stays as
  // proper names — those are not translated.)
  const STYLE_LABELS_I18N = {
    EN:{picasso:'Cubist',kusama:'Dots',pollock:'Drip',kandinsky:'Bauhaus',miro:'Constellation',mondrian:'Grid',rothko:'Fields',matisse:'Cut-out',bulge:'Bulge',arcs:'Arcs',bloom:'Bloom',spiral:'Spiral',gold:'Gold',pop:'Pop',wave:'Wave',comic:'Comic'},
    SK:{picasso:'Kubizmus',kusama:'Bodky',pollock:'Kvapky',kandinsky:'Bauhaus',miro:'Konštelácia',mondrian:'Mriežka',rothko:'Polia',matisse:'Výstrižky',bulge:'Vyklenutie',arcs:'Oblúky',bloom:'Kvet',spiral:'Špirála',gold:'Zlato',pop:'Pop',wave:'Vlna',comic:'Komiks'},
    DE:{picasso:'Kubismus',kusama:'Punkte',pollock:'Tropfen',kandinsky:'Bauhaus',miro:'Konstellation',mondrian:'Raster',rothko:'Felder',matisse:'Scherenschnitt',bulge:'Wölbung',arcs:'Bögen',bloom:'Blüte',spiral:'Spirale',gold:'Gold',pop:'Pop',wave:'Welle',comic:'Comic'},
    FR:{picasso:'Cubiste',kusama:'Pois',pollock:'Gouttes',kandinsky:'Bauhaus',miro:'Constellation',mondrian:'Grille',rothko:'Champs',matisse:'Découpage',bulge:'Bombé',arcs:'Arcs',bloom:'Floraison',spiral:'Spirale',gold:'Or',pop:'Pop',wave:'Vague',comic:'BD'},
    ES:{picasso:'Cubista',kusama:'Puntos',pollock:'Goteo',kandinsky:'Bauhaus',miro:'Constelación',mondrian:'Cuadrícula',rothko:'Campos',matisse:'Recortes',bulge:'Abultado',arcs:'Arcos',bloom:'Floración',spiral:'Espiral',gold:'Oro',pop:'Pop',wave:'Onda',comic:'Cómic'},
    PT:{picasso:'Cubista',kusama:'Pontos',pollock:'Gotas',kandinsky:'Bauhaus',miro:'Constelação',mondrian:'Grade',rothko:'Campos',matisse:'Recortes',bulge:'Saliência',arcs:'Arcos',bloom:'Florescer',spiral:'Espiral',gold:'Ouro',pop:'Pop',wave:'Onda',comic:'HQ'},
    zh:{picasso:'立体派',kusama:'圆点',pollock:'滴洒',kandinsky:'包豪斯',miro:'星座',mondrian:'网格',rothko:'色域',matisse:'剪纸',bulge:'凸起',arcs:'弧线',bloom:'绽放',spiral:'螺旋',gold:'金色',pop:'波普',wave:'波浪',comic:'漫画'},
    zhTW:{picasso:'立體派',kusama:'圓點',pollock:'滴灑',kandinsky:'包浩斯',miro:'星座',mondrian:'網格',rothko:'色域',matisse:'剪紙',bulge:'凸起',arcs:'弧線',bloom:'綻放',spiral:'螺旋',gold:'金色',pop:'普普',wave:'波浪',comic:'漫畫'},
  };
  const STYLE_LABELS = STYLE_LABELS_I18N[lang] || STYLE_LABELS_I18N.EN;
  const STYLE_INSPIRED = {picasso:'Picasso',kusama:'Kusama',pollock:'Pollock',kandinsky:'Kandinsky',miro:'Miró',mondrian:'Mondrian',rothko:'Rothko',matisse:'Matisse',bulge:'Vasarely',arcs:'Stella',bloom:'Sam Francis',spiral:'Hilma af Klint',gold:'Gustav Klimt',pop:'Keith Haring',wave:'Bridget Riley',comic:'Roy Lichtenstein'};
  // Style pairs — each picker button cycles through two related styles, the way
  // Mosaic cycles to Notes. Tap an inactive button → first style; tap the active
  // button → flip to its partner; tap again → back to Mosaic. Pairing is by
  // visual/medium kinship: cubist↔cut-out, drip↔bloom, dots↔constellation,
  // grid↔bauhaus, gold↔fields, bulge↔wave, spiral↔arcs, pop↔comic.
  const BASE_STYLE_PAIRS = [
    ['picasso','matisse'],
    ['pollock','bloom'],
    ['kusama','miro'],
    ['mondrian','kandinsky'],
    ['gold','rothko'],
    ['bulge','wave'],
    ['spiral','arcs'],
    ['pop','comic'],
  ];
  // Which of each pair sits in the "A" (default-face) slot is randomised once
  // per app open, then frozen for the session (until reload). This rotates the
  // partner styles onto the visible face over time so the "B" styles aren't
  // forgotten. The order is held in state so it survives re-renders but re-rolls
  // on every fresh open.
  const [STYLE_PAIRS] = useState(() =>
    BASE_STYLE_PAIRS.map(([a,b]) => (Math.random() < 0.5 ? [a,b] : [b,a]))
  );
  const [anim,      setAnim]      = useState(false);
  const [grid,      setGrid]      = useState({N:DN,BW:DB,BH:DH,CW:DN*DB,CH:DN*DH});
  const [info,      setInfo]      = useState(null);
  const [viewMode,  setViewMode]  = useState('paint');
  const [stamp,     setStamp]     = useState(0);
  const [piano,     setPiano]     = useState('loading');
  const [songQ,     setSongQ]     = useState('');
  const [moodFocused, setMoodFocused] = useState(false); // mood input focused → show autocomplete suggestions
  const [composeSource, setComposeSource] = useState(null); // 'ai' | 'offline' | 'crafted' — how the current mood piece was made
  // Mirror composeSource into a ref for callbacks (startPlay reads it without
  // becoming dependent on composeSource and re-creating per change).
  const composeSourceRef = useRef(null);
  useEffect(()=>{ composeSourceRef.current = composeSource; }, [composeSource]);
  const [err,       setErr]       = useState('');
  const [errInfo,   setErrInfo]   = useState(false);

  // Auto-dismiss only informational warnings (errInfo=true, gold 𝄞). Serious
  // errors (errInfo=false, red ✕) block work and stay until the user
  // acknowledges them via the × button — they shouldn't vanish unnoticed.
  useEffect(()=>{
    if(!err||!errInfo)return;
    const t=setTimeout(()=>{setErr('');setErrInfo(false);},6000);
    return()=>clearTimeout(t);
  },[err,errInfo]);

  // ── AI trial countdown banner ───────────────────────────────────────────────
  // Show a gold info banner whenever a free user has only 1 or 2 AI trials left
  // (Math.ceil to avoid showing "0.5" or "1.5"). Re-fires on EVERY trialLeft
  // change while in the danger zone — so the user can't miss it after a quick
  // consume. Suppressed for Pro users and when trial is fully exhausted (the
  // paywall handles that case explicitly).
  useEffect(()=>{
    if(isPro||trialExhausted) return;
    const left=Math.ceil(trialLeft);
    if(left>2||left<=0) return;
    const msg = left===1
      ? (t('trialBanner1')||'Only 1 AI trial left · Get Pro for unlimited')
      : (t('trialBanner2')||'Only '+left+' AI trials left · Get Pro for unlimited');
    setErr(msg); setErrInfo(true);
  },[trialLeft,isPro,trialExhausted,t]);

  const [working,   setWorking]   = useState(false);
  const [wLabel,    setWLabel]    = useState('');
  const [wPct,      setWPct]      = useState(0);
  const [midiBlob,  setMidiBlob]  = useState(null);
  const [midiName,  setMidiName]  = useState('');
  // Which source produced the current canvas content?
  // Values: 'midi' | 'audio' | 'score' | 'image' | 'mood' | null
  // Set at the success point of each loader (so a failed parse doesn't leave a
  // false marker). Cleared by clear()/fullClear() and at the start of each
  // load. Used to highlight the matching source picker so users see at a
  // glance which source is currently active. The 'mood' value is implicit
  // via the mood <select> showing its own value, so we use null in that case.
  const [loadedSource, setLoadedSource] = useState(null);
  const [recording, setRecording] = useState(false);
  const [micPainting, setMicPainting] = useState(false);
  const [micListening, setMicListening] = useState(false);
  // Combined mic-mode preset — selects which behavior the single 🎙 MIC button
  // activates. 'voice' = sing-style (monophonic, snap-to-C-major, piano echo),
  // 'music' = listen-style (polyphonic chord detection, silent painting).
  // Persisted across sessions in localStorage.
  const [micPreset, setMicPreset] = useState(()=>{
    // Default is 'music' — most common MIC use is capturing ambient music from
    // a speaker (longer recordings, polyphonic). Voice is the niche use. Users
    // who prefer voice will flip the toggle once; localStorage remembers it.
    try{ const v=localStorage.getItem('paintiano_mic_preset'); return v==='voice'?'voice':'music'; }catch(_){ return 'music'; }
  });
  useEffect(()=>{
    try{ localStorage.setItem('paintiano_mic_preset', micPreset); }catch(_){}
  },[micPreset]);
  // Derived: any mic mode active?
  const micActive = micPainting || micListening;
  const [micVolActive, setMicVolActive] = useState(false);
  const [micVolLevel, setMicVolLevel] = useState(0); // 0–1 smoothed RMS
  const [audioBlob, setAudioBlob] = useState(null);
  const audioBlobRef = useRef(null);
  const audioPCMRef = useRef(null); // decoded AudioBuffer for Web Audio playback
  // Monotonic token: bumped whenever a load should be abandoned (escape to setup,
  // Clear, switching source, or starting a new load). Async loaders capture it at
  // start and bail before mutating state if it changed mid-load — otherwise a slow
  // decode/transcribe/parse kept running after the user left and overwrote the
  // canvas / lit the wrong source tile when it finally finished. Applied uniformly
  // to all source loaders so they behave the same.
  const loadTokenRef = useRef(0);
  const setAudioBlobAndRef = (b) => { audioBlobRef.current=b; setAudioBlob(b); };
  // Set audio element src whenever audioBlob changes
  useEffect(()=>{
    const el=audioElRef.current;
    if(!el)return;
    if(el._blobUrl){try{URL.revokeObjectURL(el._blobUrl);}catch(_){}}
    if(audioBlob){el._blobUrl=URL.createObjectURL(audioBlob);el.src=el._blobUrl;}
    else{el._blobUrl=null;el.src='';}
  },[audioBlob]);
  const [audioName, setAudioName] = useState('');
  const [recBlob, setRecBlob] = useState(null);   // recording output blob (share row)
  const [recName, setRecName] = useState('');      // recording output name
  // After a record finishes, recordIntent tells the onstop handler what the
  // user actually wanted: 'story' = share PNG+audio together, 'audio' = trigger
  // saveAudio() immediately, null = manual record (show share row, default).
  // Set by the image-mode SAVE picker right before startRecord(); cleared by
  // the handler after it runs.
  const [recordIntent, setRecordIntent] = useState(null);
  const recordIntentRef = useRef(null);
  useEffect(()=>{ recordIntentRef.current=recordIntent; },[recordIntent]);
  const [scoreName, setScoreName] = useState('');
  const [recordingName, setRecordingName] = useState('');
  const [audioShareMsg, setAudioShareMsg] = useState(null);
  const [scoreMsg, setScoreMsg] = useState(null);   // MusicXML export status
  const [scoreBlob, setScoreBlob] = useState(null); // MusicXML blob (share row, like rec/print)
  const [scoreFileName, setScoreFileName] = useState('');
  const [exportPick, setExportPick] = useState(false); // EXPORT chooser (audio/score/both)
  const [playedOnce, setPlayedOnce] = useState(false); // image actually played (gates EXPORT like Print's disp)
  // Auto-dismiss share status after a few seconds
  useEffect(()=>{
    if(!audioShareMsg||audioShareMsg.tone==='wait')return;
    const t=setTimeout(()=>setAudioShareMsg(null),5000);
    return()=>clearTimeout(t);
  },[audioShareMsg]);
  // Scale-snap is now hidden behind an advanced toggle. With 88 keys available
  // the user generally wants the real chromatic piano; snap is opt-in.
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Tap-to-arm clear: first tap arms (red + label changes), second tap within
  // 3 seconds actually clears. Auto-disarms if user doesn't follow through.
  const [clearArmed, setClearArmed] = useState(false);
  const clearArmRef = useRef(null);
  const speedHoldRef = useRef(null);
  const speedMovedRef = useRef(false);   // did the current press advance the rate (hold) vs stay still (tap)?
  const [speedSweeping, setSpeedSweeping] = useState(false);   // true while holding — shows a floating rate label above the finger
  // Same pattern for the demo link: if the canvas has content, ask once before
  // replacing it with Für Elise. Empty canvas → demo fires immediately.
  const [demoArmed, setDemoArmed] = useState(false);
  const demoArmRef = useRef(null);
  // Source-switch arm — only guards a CREATION canvas (Compose/MIC), which the
  // user hand-made and can't reload. Loaded sources (MIDI/Audio/Score/Image/mood)
  // switch immediately. First tap on a different tile arms it (shows "clean
  // canvas?"); second tap of the same tile within 3s switches + cleans.
  const [switchArmed, setSwitchArmed] = useState(null); // tile key or null
  const switchArmRef = useRef(null);
  // A12: track which text input has focus so we can show a visible focus ring.
  // Single string ('comp'|'guide'|null) keeps it cheap. The existing
  // inputFocus.current ref is a boolean for piano-shortcut suppression — that
  // stays as-is, this is a separate concern.
  const [focusedInput, setFocusedInput] = useState(null);
  const [hoveredKey,   setHoveredKey]   = useState(null);
  const [playbackSpeed,setPlaybackSpeed]= useState(1);
  const [holdPaused,   setHoldPaused]   = useState(false); // true while button is held during playback
  const holdPausedRef = useRef(false);
  useEffect(()=>{ holdPausedRef.current=holdPaused; },[holdPaused]);
  // Compose mode: explicit toggle that surfaces the piano keyboard. Default OFF
  // so the keyboard doesn't clutter the canvas during normal playback / loaded
  // songs / image transcription. Auto-enabled by Für Elise demo. Auto-cleared
  // by clear() and by loading any external content (applyEvents / loadImage).
  const [composeMode, setComposeMode] = useState(false);
  // Block style: which artist's mark-making language renders each chord.
  // null (default) = implicit mosaic — sharp φ-rectangles. 'picasso' = cubist
  // shards with contour lines, 'kusama' = fields of contrasting polka dots on
  // flat color, 'vangogh' = ribbons of pure pigment, 'kandinsky' = geometric
  // composition with circles/lines/triangles, 'pollock' = mosaic substrate
  // with canvas-wide drip-and-splatter overlay (drips ignore cell boundaries).
  // Clicking the active artist a second time deselects, returning to mosaic.
  // Only affects music-mode rendering; image-mode ignores this.
  const [style, setStyle] = useState(null);
  // Mirror `style` into a ref so callbacks reading the current style at trigger
  // time (e.g. _mfiRecentAdd, _aiComposeRecentAdd) get the freshest value
  // without becoming dependent on `style` (and re-creating on every switch).
  const styleRef = useRef(null);
  useEffect(()=>{ styleRef.current = style; }, [style]);
  // ── AI "recording" lifecycle ────────────────────────────────────────────────
  // After AI generates (or you Recall an existing piece), the recent entry can
  // be RE-RECORDED by playing it once and tweaking. The "recording" window
  // opens on the FIRST Play after Add/Recall, captures every style switch and
  // Vary into the entry while playing, then SEALS when the song finishes a full
  // playthrough (loop ON or OFF). Stop/pause behaves like Add — closes the
  // window but next Play re-opens it. Sealed → no further changes possible
  // until a new Add/Recall opens the window again.
  const [aiRecording, setAiRecording] = useState(false);
  const aiRecordingRef = useRef(false);
  useEffect(()=>{ aiRecordingRef.current = aiRecording; }, [aiRecording]);
  const [aiSealed, setAiSealed] = useState(false);
  const aiSealedRef = useRef(false);
  useEffect(()=>{ aiSealedRef.current = aiSealed; }, [aiSealed]);
  // Notes mode: a Mosaic sub-mode (mood only) that writes note NAMES instead of
  // colour blocks. Toggled by tapping the active Mosaic chip; auto-reset when any
  // artist style is chosen, or when the source is not a mood.
  const [notesMode, setNotesMode] = useState(false);
  // True while the canvas belongs to a MOOD (vs a file source or live mode).
  // Unlike currentMood it survives Clear, so the "+ New mood" button stays after
  // clearing. Set when a mood is picked; cleared when a file/live source takes over.
  const [moodContext, setMoodContext] = useState(false);
  // Mirror of moodContext for FILE sources (midi/audio/score/image). Holds the
  // last loaded source type and — unlike loadedSource — SURVIVES Clear, so the
  // "+ New <source>" button stays after clearing, exactly like "+ New mood".
  // Set when a file source loads; replaced by moodContext when a mood takes over.
  const [sourceContext, setSourceContext] = useState(null);
  // Mirror for MIC sessions — stays true from mic start through STOP REC until
  // Back/Clear/source-switch, so UI bits like "♪ Recently played" keep showing
  // after the user pressed STOP REC (which resets micPainting/micListening to
  // false but leaves chords intact and the user still on the mic canvas).
  const [micContext, setMicContext] = useState(false);
  // Pollock/Kandinsky overlay seed — DERIVED FROM CHORD CONTENT, not random.
  // Same song → same hash → same painting (deterministic). Different chords
  // (load a new song, or Vary) → different hash → different painting.
  // No random state, no reshuffle needed: the painting follows the music.
  // When Random is OFF, VARY should change only colors + sound, NOT the picture
  // structure. Since the structure seed is derived from the chords (which VARY
  // transposes), we freeze it: structureSeedLock holds the seed value to keep.
  // It's set by VARY (Random off), and cleared when Random turns on, on a new
  // mood/source, or on Clear.
  const [structureSeedLock, setStructureSeedLock] = useState(null);
  const pollockSessionSeed = useMemo(() => {
    if(structureSeedLock!=null) return structureSeedLock>>>0;
    if(!chords || !chords.length) return 0;
    // FNV-1a-ish hash over each chord's pitches and velocities.
    let h = 2166136261 >>> 0;
    for(let i=0; i<chords.length; i++){
      const ch = chords[i];
      const notes = ch.n || ch.notes || (Array.isArray(ch) ? ch : null);
      if(!notes) continue;
      h ^= (i+1);
      h = Math.imul(h, 16777619);
      for(const note of notes){
        const m = note.m !== undefined ? note.m : note;
        const v = note.v !== undefined ? note.v : 100;
        h ^= (m & 0xff);
        h = Math.imul(h, 16777619);
        h ^= (v & 0xff);
        h = Math.imul(h, 16777619);
      }
    }
    return (h >>> 0) ^ (rndSalt>>>0);
  }, [chords, rndSalt, structureSeedLock]);
  // ── SHUFFLE MODE ──────────────────────────────────────────────────────────
  // When NO artist is selected but Random is ON, the painting shuffles across
  // all artist styles: each variation (Play / Next / Vary → new seed) picks a
  // different artist from the pool below. Plain mosaic is intentionally NOT in
  // the pool — shuffle means "surprise me with an artist". The pick is derived
  // from the session seed so it stays deterministic (Random-off, history/Next
  // all behave normally) and re-rolls whenever the seed changes.
  const SHUFFLE_POOL = ['picasso','kusama','pollock','kandinsky','miro','mondrian','rothko','matisse','bulge','arcs','bloom','spiral','gold','pop','wave','comic'];
  const shuffleStyle = useMemo(() => {
    if(style || !randomMode) return null;       // only active in mosaic + random
    // Mix the seed a little more so the style pick isn't correlated with the
    // per-artist phase chooser (which also reads the raw seed).
    let h = (pollockSessionSeed>>>0);
    h ^= h>>>15; h = Math.imul(h, 0x2c1b3c6d>>>0); h ^= h>>>12;
    return SHUFFLE_POOL[(h>>>0) % SHUFFLE_POOL.length];
  }, [style, randomMode, pollockSessionSeed]);
  // The style actually rendered: the user's pick, or the shuffle draw, or none.
  // Notes mode wins in plain Mosaic (no artist, no shuffle) for ANY source —
  // it only needs note MIDI + the colour fn, which every source provides.
  const effectiveStyle = style || shuffleStyle || (notesMode ? 'notes' : null);
  // Toggle an artist style with the canvas cross-fade. Shared by the expanded
  // panel and the collapsed strip so the behaviour can't drift between them.
  // Deselecting back to mosaic clears the structure lock; Random STAYS on (with
  // no artist + Random on, the painting shuffles across artist styles).
  const selectStyle = useCallback((k)=>{
    // Just change the style. Do NOT force a view change here: setting
    // forceSetup=false used to yank the user to an EMPTY canvas when they
    // changed style in setup with no source loaded. View transitions are
    // handled by isActiveView (content present) + the activity effects.
    if(canvasRef.current){canvasRef.current.style.opacity='0';}
    setTimeout(()=>{
      setStyle(prev=>{
        const next = prev===k ? null : k;
        if(next===null){ setStructureSeedLock(null); }
        else { setNotesMode(false); } // choosing an artist exits Notes mode
        return next;
      });
      if(canvasRef.current)canvasRef.current.style.opacity='1';
    },200);
  },[]);

  // Set the style to a specific value (no toggle). Used by paired style buttons
  // that cycle A→B→A within a pair instead of toggling a single key on/off.
  const setStyleTo = useCallback((k)=>{
    if(canvasRef.current){canvasRef.current.style.opacity='0';}
    setTimeout(()=>{
      setStyle(()=>{
        if(k===null){ setStructureSeedLock(null); }
        else { setNotesMode(false); }
        return k;
      });
      if(canvasRef.current)canvasRef.current.style.opacity='1';
    },200);
  },[]);
  // Append a fresh random salt and make it current (used by Play-from-start and
  // Loop replays when Random is on). Truncates any "future" entries if the user
  // had stepped Back, so the timeline stays linear.
  const advanceVariation = useCallback(()=>{
    const salt=(Math.random()*0xffffffff)>>>0;
    const hist=saltHistoryRef.current.slice(0, saltIdxRef.current+1);
    hist.push(salt);
    // Cap history so it can't grow unbounded over a long looping session.
    if(hist.length>200) hist.splice(0, hist.length-200);
    saltHistoryRef.current=hist;
    saltIdxRef.current=hist.length-1;
    setRndSalt(salt);
    setVariationPos(saltIdxRef.current);
  },[]);
  // Demo mode: true while a Für Elise demo session is active. Locks the
  // play action (Stop still works because it's the same button in playing state)
  // so the demo can't be re-triggered without an explicit clear.
  const [demoMode, setDemoMode] = useState(false);
  // Demo-reel (promo tour) state: overlay copy currently shown + a ref bag of
  // timers so a skip can tear the whole sequence down cleanly.
  const [demoText, setDemoText] = useState('');     // overlay card text ('' = hidden)
  // Companion to demoText: holds the i18n key for the currently-showing card,
  // so a language switch mid-reel can re-resolve the text against the new
  // lang. setDemoText is still used for ad-hoc strings; setDemoTextKey wins
  // when both are present (key → resolved on every render).
  const [demoTextKey, setDemoTextKey] = useState('');
  const [demoTyping, setDemoTyping] = useState('');  // AI-beat "typed" phrase
  const [demoPrintBeat, setDemoPrintBeat] = useState(false); // frame/print flourish
  const [demoReelOn, setDemoReelOn] = useState(false);       // reel active → render overlay
  const demoReelRef = useRef({timers:[], parade:null, vary:null, type:null, active:false});
  // Inline "concept" modal: explains Harmony/Spectral and image transcription.
  const [showAbout, setShowAbout] = useState(false);
  // Stable callback for AboutModal — without useCallback the modal's React.memo
  // would never hit because every parent render would pass a fresh () => …
  // function. Identity is stable since setShowAbout is a useState setter.
  const closeAbout = useCallback(()=>setShowAbout(false),[]);
  const [showSizePicker, setShowSizePicker] = useState(false);
  // Inline "guide" modal: searchable how-to entries covering every feature.
  const [showGuide, setShowGuide] = useState(false);
  // Reading-text size for the Concept & Guide panels (accessibility — larger
  // type for older readers). 1 = Normal, 1.25 = Large. Applied via CSS zoom on
  // the content wrapper so text AND spacing scale proportionally with one prop.
  const [readScale, setReadScale] = useState(1);
  // Jazyk-závislý zoom: čínske znaky majú vyššiu optickú hustotu detailov,
  // preto pre zh/zhTW pridávame 15% k readScale aby boli rovnako čitateľné ako latinka.
  const effScale = readScale * ((lang === 'zh' || lang === 'zhTW') ? 1.15 : 1);
  // Unified active/idle chip styling for the Color·Style strip (color modes,
  // scan direction, artist styles). Premium look: the ACTIVE chip is no longer a
  // heavy solid-gold fill with dark text — instead a soft gold-tinted fill, a
  // clear gold border and gold text. Lighter, more expensive-looking, and the
  // selected state still reads instantly. Idle chips stay on the dark card.
  const chipStyle = useCallback((on)=>({
    color: on ? PF.gold2 : PF.cream,
    background: on ? 'rgba(240,192,64,.14)' : PF.card2,
    border: '1px solid '+(on ? 'rgba(240,192,64,.6)' : 'rgba(242,238,232,.08)'),
    boxShadow: on ? '0 0 0 1px rgba(240,192,64,.25), 0 4px 14px rgba(240,192,64,.12)' : 'none',
  }),[]);
  // (since v2.6.0) in active view, Color/Style live in a strip that's collapsed by
  // default (canvas gets the room) and expands on tap.
  const [stripOpen, setStripOpen] = useState(false);
  const [guideQuery, setGuideQuery] = useState('');
  // Stable composite-close callback for GuideModal (same memo rationale as
  // closeAbout). Closes the modal and clears the search query in one action.
  const closeGuide = useCallback(()=>{setShowGuide(false);setGuideQuery('');},[]);
  const [showMorphMenu, setShowMorphMenu] = useState(false);
  const [morphSel, setMorphSel] = useState([]); // ordered target moods for chain-morph (max 3)
  const [morphPool, setMorphPool] = useState([]);
  const [morphTargets, setMorphTargets] = useState([]); // perzistentný reťazec aktívneho morphu (na pre-výber pri znovuotvorení)
  const [morphPoolLoading, setMorphPoolLoading] = useState(false);
  const [morphPoolSource, setMorphPoolSource] = useState('offline'); // 'ai' | 'offline' — ako vznikol pool
  const morphPoolCacheRef = useRef({}); // base mood → AI pool (cache, nech sa pri tej istej nálade nevolá AI znova)
  const morphSelRef = useRef([]);
  const [showMoodMenu, setShowMoodMenu] = useState(false);
  const [moodEdit, setMoodEdit] = useState(''); // text v edit políčku mood popupu (vlastná nálada + filter zoznamu)
  const [currentMood, setCurrentMood] = useState(null);
  // Morph picker shows a RANDOM subset of 18 moods (not all ~100), laid out 3 cols
  // × 6 rows. The pool is frozen while the dialog is open so selected chips don't
  // vanish; a fresh 18 is drawn each time the dialog opens (and via the ↻ button).
  // Pool is biased toward the primary mood's emotional neighbourhood: ~2/3 are
  // the closest moods (same family + escalating intensity), ~1/3 random for
  // contrast/variety in the morph. Uses the offline valence/energy model — no
  // AI, no API budget. `base` = primary mood, `exclude` = already-selected
  // targets (so re-opening an active morph only regenerates the remainder).
  const makeMorphPool = useCallback((base, exclude=[])=>{
    const baseMood = base!=null ? base : currentMood;
    const ex = new Set([baseMood, ...exclude]);
    const cands = MOODS.filter(m=>!ex.has(m));
    const need = Math.max(0, 18 - exclude.length);
    if(!need || !cands.length) return [];
    const P0 = _moodParams(String(baseMood||'').toLowerCase());
    const shuf = a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
    const scored = cands.map(m=>{const Pm=_moodParams(m.toLowerCase());return {m,d:Math.hypot(P0.v-Pm.v,P0.e-Pm.e)};}).sort((a,b)=>a.d-b.d);
    const band = Math.min(scored.length, Math.max(need, Math.round(need*1.6)));
    const near = scored.slice(0, band).map(s=>s.m);          // closest family + escalation
    const relN = Math.min(near.length, Math.round(need*0.65));
    const relevant = shuf(near).slice(0, relN);
    const rest = cands.filter(m=>!relevant.includes(m));
    const variety = shuf(rest).slice(0, need - relevant.length);
    return shuf([...relevant, ...variety]);
  },[currentMood]);
  useEffect(()=>{ morphSelRef.current=morphSel; },[morphSel]);
  // AI-picked morph pool via the cheap Haiku model (through our /api/compose).
  // Returns up to (18 - preselected) mood KEYS from the library, emotionally
  // related/escalating to `base`. Returns null on any failure → caller uses the
  // offline pool. The phrase may be in any language (Claude interprets meaning).
  const fetchMorphPoolAI = useCallback(async (base, preselected)=>{
    const need = Math.max(0, 18 - preselected.length);
    if(!need) return [];
    const list = MOODS.filter(m=>m!==base && !preselected.includes(m));
    const prompt = `Current mood: "${String(base).slice(0,80)}". From the list below, pick exactly ${need} moods that make good morph / blend targets for it — MOSTLY emotionally related or escalating variations (same emotional family, rising or falling intensity), plus a few contrasting ones for variety. The phrase may be in ANY language; interpret its real emotion, do NOT read it word-by-word.
List: ${list.join(', ')}
Return ONLY a JSON array of exactly ${need} strings copied verbatim from the list. No prose, no markdown. Example: ["furious","tense","melancholic"]`;
    try{
      const _host=(typeof window!=='undefined'&&window.location&&window.location.hostname)||'';
      const _isPrev=/claude\.ai$|claudeusercontent\.com$|\.claude\.com$/.test(_host);
      const _eps=_isPrev?['https://api.anthropic.com/v1/messages','/api/compose']:['/api/compose','https://api.anthropic.com/v1/messages'];
      let respText='',ok=false;
      for(const ep of _eps){
        try{
          const r=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-haiku-4-5',max_tokens:300,messages:[{role:'user',content:prompt}]})});
          const txt=await r.text(); if(r.ok&&txt){respText=txt;ok=true;break;}
        }catch(_){}
      }
      if(!ok) return null;
      const data=JSON.parse(respText);
      const raw=(data.content||[]).map(b=>b.type==='text'?b.text:'').join('');
      const match=raw.match(/\[[\s\S]*\]/); if(!match) return null;
      const arr=JSON.parse(match[0]);
      const valid=arr.filter(m=>typeof m==='string'&&MOODS.includes(m)&&m!==base&&!preselected.includes(m));
      const uniq=[...new Set(valid)];
      return uniq.length?uniq.slice(0,need):null;
    }catch(_){ return null; }
  },[]);


  // setupNoSel only makes sense right after an image→Setup return. Any other
  // source (midi/audio/score/mood/compose/mic) should restore a normal selected
  // colour tab, so clear it whenever the source becomes something other than image.
  useEffect(()=>{
    // Clear the image-only "nothing selected" state once any other source/mood
    // becomes active, so its colour tab shows as normally selected again.
    if((loadedSource && loadedSource!=='image') || currentMood || composeMode || micActive){ setSetupNoSel(false); }
  },[loadedSource, currentMood, composeMode, micActive]);  // eslint-disable-line react-hooks/exhaustive-deps
  // When a mood is picked the view flips to active and the setup panel (with
  // MORPH/VARY) is replaced by the collapsed strip. Auto-open the strip on
  // mood-select so those mood-refinement controls stay immediately reachable.
  useEffect(()=>{ if(currentMood) setStripOpen(true); setMorphTargets([]); },[currentMood]);
  // Re-translate the built-in MFI sample title when the UI language changes.
  // The sample is a fixed baked piece, so its title would otherwise stay frozen
  // in whatever language it was loaded in. Detect it by matching the current
  // title against every language's mfiSampleTitle, then swap to the active one.
  useEffect(()=>{
    const localized=t('mfiSampleTitle'); if(!localized) return;
    let sampleTitles=[]; try{ sampleTitles=Object.values(I18N).map(x=>x&&x.mfiSampleTitle).filter(Boolean); }catch(_){}
    const isSampleTitle=v=>!!v && sampleTitles.includes(v);
    if(isSampleTitle(currentMood) && currentMood!==localized) setCurrentMood(localized);
    setInfo(prev=> (prev && isSampleTitle(prev.title) && prev.title!==localized) ? {...prev,title:localized} : prev);
  },[lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const [loopMode,    setLoopMode]    = useState(false);
  const [varyFlash,   setVaryFlash]   = useState(false);
  // Mood-hint flash: when the user taps a disabled morph/vary, the mood
  // selector briefly pulses with a label above it pointing them there.
  const [moodHint, setMoodHint] = useState(false);
  const moodHintRef = useRef(null);
  const flashMoodHint = useCallback(()=>{
    setMoodHint(true);
    if(moodHintRef.current) clearTimeout(moodHintRef.current);
    moodHintRef.current = setTimeout(()=>{setMoodHint(false); moodHintRef.current=null;}, 2500);
  },[]);
  const [compositionName, setCompositionName] = useState('');
  const loopModeRef = useRef(false);
  const [varySource, setVarySource] = useState(null);

  const [originalImgUrl, setOriginalImgUrl] = useState(null);
  // Image reading direction: 'lr' (default), 'vert', 'spiralIn', 'spiralOut'.
  // Mirrored to a ref so transcription loops read the current value live.
  const [imgDir, setImgDir] = useState('lr');
  const imgDirRef = useRef('lr');
  useEffect(()=>{ imgDirRef.current=imgDir; },[imgDir]);
  const blobUrl      = useMemo(()=>midiBlob?URL.createObjectURL(midiBlob):null,[midiBlob]);
  const audioBlobUrl = useMemo(()=>audioBlob?URL.createObjectURL(audioBlob):null,[audioBlob]);
  const busy = playing || anim || working;
  // Mode exclusion: once a file/song is loaded OR an image is dropped, the
  // keyboard is locked until clear (no mixing loaded content with new live
  // composition). Conversely, once any keyboard note has been recorded, the
  // file/song loaders are locked until clear (so a load can't clobber work).
  // loadedMode: true when a file/song/image is the source of the current canvas
  // (info is set by applyEvents/loadImage) AND the user isn't actively composing
  // on the keyboard or running a live mic mode. Locks the keyboard so a stray
  // tap can't clobber the loaded composition. Cleared by clear()/fullClear().
  const loadedMode = !!info && !composeMode && !micPainting && !micListening;
  // L5: A composite "input-source pickers are locked" predicate. The four
  // source pickers (MIDI / audio / score / image) all need the same guard:
  // user is already doing something (busy) or already in a creative mode
  // whose draft we shouldn't clobber (composeMode / micPainting / micListening).
  // Also locked during recording (L6/L7): loading a new source calls
  // fullClear()→stopAll(), which would strand the MediaRecorder with no
  // audio input, producing a truncated / silent saved file.
  // Centralizing here both fixes the missing `disabled` attribute and removes
  // four-way repetition in the JSX.
  const sourcePickerLocked = busy || composeMode || micPainting || micListening || recording || playing || demoReelOn;
  // Import tiles (MIDI/Audio/Score/Image) stay usable DURING a Compose/MIC
  // session so the user can switch source at any time — they only lock while a
  // file is transcribing (busy) or a recording is running. The tile's onClick
  // stashes the current draft before switching, so this is safe.
  const importTileLocked = busy || recording;
  // "Which source is the current canvas content from?" — used to highlight the
  // matching picker button so the user can see at a glance whether the loaded
  // composition is from MIDI / audio / score / image / mood. Mood-loaded
  // content is highlighted via the mood <select> dropdown value, not a picker
  // button. Compose / mic-painted content has no picker button to highlight.
  // IMAGE special case: Clear wipes the painted/audio trace (disp→0, playedOnce
  // →false) but deliberately keeps loadedSource='image' so the picture can be
  // replayed. In that cleared state the IMAGE tile should NOT read as the active
  // source — there is nothing painted to return to — so going back to Setup
  // shows a clean, unselected source row. It re-highlights as soon as the image
  // plays again (disp>0 or playedOnce).
  // A source tile lights up as "active" only when it actually has content loaded.
  // After app start or a Clear there are no chords, so nothing should glow — even
  // if loadedSource still names a type (e.g. image keeps 'image' after Clear).
  const activeSource = !chords.length ? null
    : (loadedSource==='image' && (!pixelRef.current || (disp===0 && !playedOnce))) ? null
    : loadedSource;
  const composedModeRef = useRef(false);
  const [selectedChordIdx, setSelectedChordIdx] = useState(null); // chord.idx selected by tapping a block (compose / compose-pause) for targeted Undo
  const selectedChordIdxRef = useRef(null);
  useEffect(()=>{ selectedChordIdxRef.current=selectedChordIdx; },[selectedChordIdx]);

  // === Creative mode draft stashes ===
  // Each creative mode (compose/sing/listen) keeps its own work-in-progress draft.
  // When the user switches to another mode, loads MIDI, picks a mood, etc., the
  // current draft is stashed under its owner key. Re-entering that mode restores
  // the stash so the user can continue from where they left off.
  // Only an explicit CLEAR tap while INSIDE that mode wipes its stash.
  const composeStashRef = useRef(null);
  const singStashRef    = useRef(null);
  const listenStashRef  = useRef(null);
  // State mirror of composeStashRef so the Compose button can show a "draft
  // saved" visual when the user has stepped away from an in-progress canvas.
  // True iff composeStashRef.current holds a non-empty snapshot.
  const [hasComposeDraft, setHasComposeDraft] = useState(false);
  // Sing and Listen are presets of the unified MIC mode and share one draft.
  // True iff either stash slot holds a non-empty snapshot.
  const [hasMicDraft, setHasMicDraft] = useState(false);
  // True when we're in the MIC context with the mic stopped and the canvas
  // cleared — i.e. after Clear in MIC. Keeps the MIC view framed and shows a
  // "tap 🎙 to record" prompt so it's clear you're still in MIC and one tap
  // resumes recording (rather than dumping you into an ambiguous blank state).
  const [micArmed, setMicArmed] = useState(false);
  // Which creative mode (if any) authored the chords currently on canvas.
  // 'compose'|'sing'|'listen'|null. Used to know whose stash to update.
  const draftOwnerRef = useRef(null);


  // Cleanup the compose-commit debounce on unmount so it can't fire commit()
  // against a torn-down state tree.
  useEffect(()=>()=>{clearTimeout(kbTimer.current);if(clearArmRef.current)clearTimeout(clearArmRef.current);if(speedHoldRef.current)clearTimeout(speedHoldRef.current);if(moodHintRef.current)clearTimeout(moodHintRef.current);if(demoArmRef.current)clearTimeout(demoArmRef.current);if(switchArmRef.current)clearTimeout(switchArmRef.current);try{const b=demoReelRef.current;if(b){b.active=false;b.timers.forEach(id=>clearTimeout(id));if(b.parade)clearInterval(b.parade);if(b.vary)clearInterval(b.vary);if(b.type)clearInterval(b.type);}}catch(_){}substrateRef.current={canvas:null,ctx:null,builtTo:0,key:'',CW:0,CH:0};},[]);

  useEffect(()=>{
    let dead=false;
    let s=null;
    // Build the sampler shortly after mount rather than hanging it off the
    // first global pointerdown. The old global-pointerdown approach ran on the
    // user's very first tap and competed with the native <select>, so the mood
    // dropdown needed two taps to open. Audio-context unlocking still happens
    // in-gesture via unlockAudio() inside the action handlers (play/compose/etc),
    // so deferring the sampler load here costs nothing.
    const buildSampler=()=>{
      if(s||dead)return;
      s=new Tone.Sampler({urls:S_URLS,baseUrl:S_BASE,
        onload:()=>{if(!dead){samplerOk.current=true;setPiano('ready');}},
        onerror:()=>{if(!dead){
          samplerOk.current=false;setPiano('error');
          setErr(t('errs').samplesFallback);
          setErrInfo(true);
        }},
      }).toDestination();
      samplerRef.current=s;
    };
    const idleId = (typeof requestIdleCallback!=='undefined')
      ? requestIdleCallback(buildSampler,{timeout:1200})
      : setTimeout(buildSampler,300);
    return()=>{dead=true;try{if(typeof cancelIdleCallback!=='undefined'&&typeof idleId==='number')cancelIdleCallback(idleId);}catch(_){}try{clearTimeout(idleId);}catch(_){}try{s&&s.dispose();}catch(_){}samplerRef.current=null;samplerOk.current=false;};
  },[]);



  const gc = useCallback((m,v)=>{
    if(mode==='bw') return bwCol(m,v);
    if(mode==='custom') return customCol(m,v,activePalette);
    if(mode==='spectral') return specCol(m,v);
    return harmCol(m,v);
  },[mode,activePalette]);

  // Colour for a pitch class (0..11) in a given mode — used by the read-only
  // colour previews under the Color tabs. B/W spreads the 12 classes across its
  // value ramp (a grey scale) using octave-spaced MIDI so the shades differ.
  const colorPreview = useCallback((md,pc)=>{
    if(md==='bw') return bwCol(36+pc*4, 100);     // 12 steps up the value ramp → grey scale
    if(md==='spectral') return specCol(60+pc, 100);
    return harmCol(60+pc, 100);
  },[]);

  useEffect(()=>{
    const cv=canvasRef.current;if(!cv)return;
    const{N,BW,BH,CW,CH}=grid;
    const ctx=cv.getContext('2d');
    // The style actually rendered: the user's pick, or — in shuffle mode (no
    // artist + Random on) — the seed-derived shuffle draw. Shadowing `style`
    // here means every downstream render decision (overlay dispatch, cache key,
    // canAppend) transparently uses the rendered style.
    const style = effectiveStyle;
    // Image mode: keep the canvas transparent so the original painting shows through
    // unobstructed. The 96×60 pixel mosaic that used to render here was useful as
    // a "what the algorithm sees" preview, but it obscured the artwork on a phone-sized
    // canvas. During playback we paint a subtle scanning highlight at the currently
    // playing cell so the user still gets visual feedback without losing the image.
    if(viewMode==='image'&&pixelRef.current){
      // Animation loop owns the canvas during play/animate — don't interfere
      if(playing||anim) return;
      // Stopped/paused: the canvas may have been blanked while we were away in
      // Setup (the element unmounts/clears). Repaint the already-played mosaic
      // 0..disp from pixel data so returning via "← Canvas"/Resume shows the
      // progress that was on screen before, instead of a blank image overlay.
      try{
        const cv=canvasRef.current, ctx=cv&&cv.getContext('2d');
        const px=pixelRef.current;
        if(ctx && px && disp>0){
          const{nc,nr}=px, pdata=px.px;
          const{BW,BH,CW,CH}=grid;
          const colStep=px.colStep||1;
          const effCols=Math.ceil(nc/colStep);
          const CHORD_SIZE=6;
          ctx.fillStyle='#04040a';ctx.fillRect(0,0,CW,CH);
          for(let i=0;i<disp && i<chords.length;i++){
            const _ev=chords[i]||{};
            const band=_ev.band!=null?_ev.band:Math.floor(i/effCols);
            const cg=_ev.cg!=null?_ev.cg:i%effCols;
            const colStart=cg*colStep;
            for(let sk=0;sk<colStep;sk++){
              const col=colStart+sk; if(col>=nc) break;
              for(let j=0;j<CHORD_SIZE;j++){
                const row=band*CHORD_SIZE+j; if(row>=nr) break;
                const p=pdata[row*nc+col];
                if(!p) continue;
                ctx.fillStyle=`rgba(${p.r},${p.g},${p.b},0.18)`;ctx.fillRect(col*BW-1,row*BH-1,BW+2,BH+2);
                ctx.fillStyle=`rgb(${p.r},${p.g},${p.b})`;ctx.fillRect(col*BW+.5,row*BH+.5,BW-1,BH-1);
              }
            }
          }
        }
      }catch(_){}
      return;
    }
    // Per-painting seed for renderers needing a stable whole-painting choice.
    _setArtistSeed(pollockSessionSeed);
    // Helper: draw a single chord at its grid cell. Pulled out for the
    // incremental-append fast path below.
    const drawOne = (chord) => {
      const{n:notes,idx}=chord;
      const cell=grid.cells&&grid.cells[idx];
      if(cell){
        if(cell.segments) cell.segments.forEach(s=>drawBlock(ctx,s.x,s.y,notes,gc,s.w,s.h,style));
        else drawBlock(ctx,cell.x,cell.y,notes,gc,cell.w,cell.h,style);
      }else{
        // No precomputed cell yet (one-render gap between commit's setChords and
        // the grid-recompute effect's setGrid). Instead of the tiny default-grid
        // BW×BH corner block, lay the chord out across the FULL canvas width so
        // the first note fills a sensible slice rather than flashing in the corner.
        const total=Math.max(1,chords.length);
        const fw=Math.max(2,Math.floor(CW/total));
        const fx=idx*fw;
        drawBlock(ctx,fx,0,notes,gc,fw,CH,style);
      }
    };
    // Fast path: if only `disp` advanced during playback and every other input
    // is unchanged, append only the newly-revealed blocks instead of re-running
    // every artist-style draw from chord 0. Cuts an O(N²) playback into O(N).
    const prev = lastPaintRef.current;
    // Paint horizon. During active animation/playback show progressive build
    // (lim=disp). On pause/stop, behaviour depends on source:
    //   - Live-composed (Compose/MIC): canvas is the artifact the user just
    //     made and saw fully — show ALL chords on pause/stop.
    //   - Imported (MIDI/audio/score/image/mood): canvas builds during
    //     playback, hasn't been "seen" yet — show only played-so-far so the
    //     user can still hit Play to watch it build.
    const lim = anim?disp:playing?disp:holdPaused?disp:composedModeRef.current?chords.length:disp<chords.length?disp:chords.length;
    // Fast path: if only `pending` changed (keypress preview in compose mode),
    // skip the full repaint — just redraw the next-block preview.
    const onlyPendingChanged =
      prev.chords===chords &&
      prev.grid===grid &&
      prev.gc===gc &&
      prev.style===style &&
      prev.viewMode===viewMode &&
      prev.mode===mode &&
      prev.stamp===stamp &&
      prev.anim===anim &&
      prev.playing===playing &&
      prev.disp===lim &&
      prev.info===info &&
      prev.holdPaused===holdPaused &&
      prev.pending!==pending;
    if(onlyPendingChanged && composeMode){
      // Clear just the next-block cell and redraw preview. composeMode guard:
      // outside compose, idxRef.current === chords.length, and pi % len wraps
      // to 0 — which would erase the FIRST committed chord. The preview only
      // makes sense while the user is actively composing anyway.
      const pi=idxRef.current,cell=grid.cells&&grid.cells[pi%(grid.cells.length||1)];
      const cx=cell?cell.x:((pi%(N*N))%N)*BW,cy=cell?cell.y:Math.floor((pi%(N*N))/N)*BH,cw=cell?cell.w:BW,ch=cell?cell.h:BH;
      ctx.fillStyle='#04040a';ctx.fillRect(cx,cy,cw,ch);
      if(style!=='pollock'&&style!=='picasso'&&style!=='kusama'&&style!=='miro'&&style!=='kandinsky'&&style!=='rothko'&&style!=='matisse'&&style!=='mondrian'&&style!=='bulge'&&style!=='arcs'&&style!=='bloom'&&style!=='spiral'&&style!=='gold'&&style!=='pop'&&style!=='wave'&&style!=='comic'){
        ctx.strokeStyle='rgba(201,168,76,0.25)';ctx.lineWidth=.8;
        ctx.strokeRect(cx+.5,cy+.5,cw-1,ch-1);
      }
      if(pending.length>0) drawBlock(ctx,cx,cy,pending.map(m=>({m,v:65,durMs:0})),gc,cw,ch,style);
      // Mutate in place — the ref isn't React state, identity doesn't matter,
      // and this skips an object spread on every keystroke during compose.
      prev.pending = pending;
      prev.disp = lim;
      return;
    }
    const canAppend =
      (playing||anim) &&
      prev.chords===chords &&
      prev.grid===grid &&
      prev.gc===gc &&
      prev.style===style &&
      prev.viewMode===viewMode &&
      prev.mode===mode &&
      prev.stamp===stamp &&
      prev.anim===anim &&
      prev.playing===playing &&
      lim>=prev.disp &&
      lim-prev.disp<=Math.max(64,Math.ceil(chords.length/8)) && // sanity bound: skip giant jumps
      style!=='pollock' && style!=='kandinsky' && style!=='picasso' && style!=='kusama' && style!=='miro' && style!=='rothko' && style!=='matisse' && style!=='mondrian' && style!=='bulge' && style!=='arcs' && style!=='bloom' && style!=='spiral' && style!=='gold' && style!=='pop' && style!=='wave' && style!=='comic'; // Overlay styles need full repaint — overlay shapes are canvas-wide, not per-cell
    if(canAppend && lim>prev.disp){
      for(let i=prev.disp;i<lim;i++) drawOne(chords[i]);
    }else{
      // Overlay styles repaint the whole canvas every frame. During active
      // playback that's too costly ~7×/sec on long tracks, so throttle it to
      // ~9fps. Always allow the paint when paused/stopped or on the final
      // frame so the finished painting is fully rendered.
      const isOverlayStyle = style==='pollock'||style==='kandinsky'||style==='picasso'||style==='kusama'||style==='miro'||style==='rothko'||style==='matisse'||style==='mondrian'||style==='bulge'||style==='arcs'||style==='bloom'||style==='spiral'||style==='gold'||style==='pop'||style==='wave'||style==='comic';
      const nowMs = (typeof performance!=='undefined'?performance.now():Date.now());
      // A change in the session seed means the user pressed Next/Vary (or the
      // seed otherwise re-rolled): the WHOLE painting must change now, not on the
      // next throttled tick. Detect it so we can bypass the playback throttle —
      // otherwise the new variation gets swallowed by the ~9fps skip and "Next"
      // appears to do nothing during playback.
      const seedChanged = prev.pollockSessionSeed !== pollockSessionSeed;
      if(isOverlayStyle && playing && !seedChanged && lim<chords.length && (nowMs-lastOverlayPaintRef.current)<110){
        // Skip this overlay repaint — keep last frame on canvas. Record disp so
        // the next allowed repaint covers the gap.
        prev.disp = lim; prev.pending = pending;
        lastPaintRef.current={disp:lim,chords,grid,gc,style,viewMode,pending,info,anim,playing,stamp,mode,holdPaused,pollockSessionSeed};
        return;
      }
      lastOverlayPaintRef.current = nowMs;
      if(isOverlayStyle && lim>0){
        // ── CACHED-SUBSTRATE PATH ──
        // Build (or incrementally extend) the offscreen substrate, then blit it
        // and run only the canvas-wide overlay on top. Substrate cells are
        // identical frame-to-frame; only newly-revealed cells need drawing.
        const sub=substrateRef.current;
        // Cache key: anything that invalidates the whole substrate. Note `lim`
        // is intentionally NOT in the key — growth is handled incrementally.
        const subKey=`${CW}x${CH}|${style}|${mode}|${stamp}|${pollockSessionSeed}`;
        let sctx=sub.ctx;
        if(sub.key!==subKey||sub.CW!==CW||sub.CH!==CH||!sub.canvas){
          // (Re)allocate offscreen canvas. Reuse the existing element when only
          // the key changed but dimensions match, to avoid GC churn.
          if(!sub.canvas||sub.CW!==CW||sub.CH!==CH){
            const oc=(typeof OffscreenCanvas!=='undefined')
              ? new OffscreenCanvas(Math.max(1,CW),Math.max(1,CH))
              : Object.assign(document.createElement('canvas'),{width:Math.max(1,CW),height:Math.max(1,CH)});
            sub.canvas=oc; sctx=oc.getContext('2d');
            sub.ctx=sctx; sub.CW=CW; sub.CH=CH;
          }
          // Fresh substrate: paint background + grid, reset reveal counter.
          sctx.fillStyle='#04040a';sctx.fillRect(0,0,CW,CH);
          sctx.strokeStyle='rgba(255,255,255,0.025)';sctx.lineWidth=.5;
          for(let i=0;i<=N;i++){sctx.beginPath();sctx.moveTo(i*BW,0);sctx.lineTo(i*BW,CH);sctx.stroke();sctx.beginPath();sctx.moveTo(0,i*BH);sctx.lineTo(CW,i*BH);sctx.stroke();}
          sub.key=subKey; sub.builtTo=0;
        }
        // If playback rewound (lim < builtTo), the cached cells past lim are
        // stale-but-harmless — they're hidden under the overlay which only
        // paints up to `lim`. But to be correct on scrub-back we rebuild when
        // lim drops below what we've drawn.
        if(lim<sub.builtTo){
          sctx.fillStyle='#04040a';sctx.fillRect(0,0,CW,CH);
          sctx.strokeStyle='rgba(255,255,255,0.025)';sctx.lineWidth=.5;
          for(let i=0;i<=N;i++){sctx.beginPath();sctx.moveTo(i*BW,0);sctx.lineTo(i*BW,CH);sctx.stroke();sctx.beginPath();sctx.moveTo(0,i*BH);sctx.lineTo(CW,i*BH);sctx.stroke();}
          sub.builtTo=0;
        }
        // Draw only the newly-revealed substrate cells into the offscreen canvas.
        // EXCEPTION: the full-canvas overlays (mondrian/rothko/matisse) paint
        // their own complete ground over everything, so a per-cell substrate is
        // wasted and — on long songs where cells are sub-pixel — bleeds through
        // as a microscopic pixel grid. Skip cell drawing for those; the overlay
        // alone owns the canvas.
        const fullCanvasOverlay = style==='mondrian'||style==='rothko'||style==='matisse'||style==='kusama'||style==='bulge'||style==='arcs'||style==='bloom'||style==='spiral'||style==='gold'||style==='pop'||style==='wave'||style==='comic';
        _setArtistSeed(pollockSessionSeed);
        if(!fullCanvasOverlay){
          for(let i=sub.builtTo;i<lim;i++){
            const chord=chords[i];const{n:notes,idx}=chord;
            const cell=grid.cells&&grid.cells[idx];
            if(cell){
              if(cell.segments) cell.segments.forEach(s=>drawBlock(sctx,s.x,s.y,notes,gc,s.w,s.h,style));
              else drawBlock(sctx,cell.x,cell.y,notes,gc,cell.w,cell.h,style);
            }else{
              const si=idx%(N*N),col=si%N,row=Math.floor(si/N);
              drawBlock(sctx,col*BW,row*BH,notes,gc,BW,BH,style);
            }
          }
        }
        sub.builtTo=Math.max(sub.builtTo,lim);
        // Blit the cached substrate to the visible canvas in one operation.
        ctx.clearRect(0,0,CW,CH);
        if(style==='pollock'){
          // Pollock: paint the full cream substrate in ONE fill — not the cached
          // per-cell build-up. Otherwise you watch the background tile-in chord
          // by chord, which reads as a rendering glitch (the substrate is meant
          // to be a uniform raw canvas, present from frame one).
          ctx.fillStyle = '#f2ede0';
          ctx.fillRect(0,0,CW,CH);
        } else if(!fullCanvasOverlay) ctx.drawImage(sub.canvas,0,0);
        // Run the canvas-wide overlay on top (this is the only per-frame cost
        // that legitimately scales with lim).
        if(style==='pollock')   drawPollockOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
        else if(style==='picasso')  drawPicassoOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
        else if(style==='kusama')   drawKusamaOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed);
        else if(style==='miro')     drawMiroOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
        else if(style==='kandinsky')drawKandinskyOverlay(ctx, CW, CH, lim, pollockSessionSeed, mode, gc);
        else if(style==='rothko')   drawRothkoOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
        else if(style==='matisse')  drawMatisseOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
        else if(style==='mondrian') drawMondrianOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
        else if(style==='bulge') drawBulgeOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
        else if(style==='arcs') drawArcsOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
        else if(style==='bloom') drawBloomOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
        else if(style==='spiral') drawSpiralOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
        else if(style==='gold') drawGoldOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
        else if(style==='pop') drawPopOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
        else if(style==='wave') drawWaveOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
        else if(style==='comic') drawComicOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
        lastPaintRef.current={disp:lim,chords,grid,gc,style,viewMode,pending,info,anim,playing,stamp,mode,holdPaused,pollockSessionSeed};
        return;
      }
      ctx.fillStyle='#04040a';ctx.fillRect(0,0,CW,CH);
      ctx.strokeStyle='rgba(255,255,255,0.025)';ctx.lineWidth=.5;
      for(let i=0;i<=N;i++){ctx.beginPath();ctx.moveTo(i*BW,0);ctx.lineTo(i*BW,CH);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*BH);ctx.lineTo(CW,i*BH);ctx.stroke();}
      for(let i=0;i<lim;i++) drawOne(chords[i]);
      // Pollock global drip overlay — runs AFTER all cells have rendered.
      // Drips ignore cell boundaries and unify the painting under the splatter.
      if(style==='pollock' && lim>0){
        drawPollockOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
      }
      if(style==='picasso' && lim>0){
        drawPicassoOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
      }
      if(style==='kusama' && lim>0){
        drawKusamaOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed);
      }
      if(style==='miro' && lim>0){
        drawMiroOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
      }
      // Kandinsky canvas-wide contour overlay — large outlined shapes in
      // varied colors layered over the per-cell Kandinsky composition.
      if(style==='kandinsky' && lim>0){
        drawKandinskyOverlay(ctx, CW, CH, lim, pollockSessionSeed, mode, gc);
      }
      if(style==='rothko' && lim>0){
        drawRothkoOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
      }
      if(style==='matisse' && lim>0){
        drawMatisseOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
      }
      if(style==='mondrian' && lim>0){
        drawMondrianOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
      }
      if(style==='bulge' && lim>0){
        drawBulgeOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
      }
      if(style==='arcs' && lim>0){
        drawArcsOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
      }
      if(style==='bloom' && lim>0){
        drawBloomOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
      }
      if(style==='spiral' && lim>0){
        drawSpiralOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
      }
      if(style==='gold' && lim>0){
        drawGoldOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
      }
      if(style==='pop' && lim>0){
        drawPopOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
      }
      if(style==='wave' && lim>0){
        drawWaveOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
      }
      if(style==='comic' && lim>0){
        drawComicOverlay(ctx, CW, CH, chords, lim, gc, pollockSessionSeed, mode);
      }
      if(!info&&!playing&&style!=='pollock'&&style!=='picasso'&&style!=='kusama'&&style!=='miro'&&style!=='kandinsky'&&style!=='rothko'&&style!=='matisse'&&style!=='mondrian'&&style!=='bulge'&&style!=='arcs'&&style!=='bloom'&&style!=='spiral'&&style!=='gold'&&style!=='pop'&&style!=='wave'&&style!=='comic'){
        const pi=idxRef.current,cell=grid.cells&&grid.cells[pi%(grid.cells.length||1)];
        const cx=cell?cell.x:((pi%(N*N))%N)*BW,cy=cell?cell.y:Math.floor((pi%(N*N))/N)*BH,cw=cell?cell.w:BW,ch=cell?cell.h:BH;
        ctx.strokeStyle='rgba(201,168,76,0.25)';ctx.lineWidth=.8;
        ctx.strokeRect(cx+.5,cy+.5,cw-1,ch-1);
        if(pending.length>0) drawBlock(ctx,cx,cy,pending.map(m=>({m,v:65,durMs:0})),gc,cw,ch,style);
      }
    }
    lastPaintRef.current={disp:lim,chords,grid,gc,style,viewMode,pending,info,anim,playing,stamp,mode,holdPaused,pollockSessionSeed};
  },[chords,disp,pending,mode,grid,info,gc,viewMode,playing,stamp,anim,style,effectiveStyle,holdPaused,pollockSessionSeed,composeMode]);

  // Whenever keyboard-recorded chords change (new chord committed, or a
  // release updated a chord's durMs/durQ), re-run computeGrid so each
  // block's width reflects its duration. File-loaded sessions already
  // get cells from applyEvents → computeGrid; we skip them via the
  // `recorded` flag to avoid clobbering that layout.
  // Re-run computeGrid only when the set of recorded chord durations actually
  // changes — not on every chords mutation (e.g. disp ticks during playback,
  // or demo chords being appended don't change durQ at all).
  // A cheap string signature of [idx:durQ, ...] is compared against the last
  // run; if identical, computeGrid is skipped entirely.
  const gridSigRef = useRef('');
  const pendingGridRef = useRef(null);
  useEffect(()=>{
    if(!chords.length)return;
    if(!chords.some(c=>c.recorded))return;
    // Fast O(n) hash over (idx, durQ) pairs — avoids string allocation of .join()
    let sig=0;
    for(let i=0;i<chords.length;i++){
      const c=chords[i];
      sig=(Math.imul(sig,31)+c.idx*1000+(c.durQ||0)*100)>>>0;
    }
    const sigStr=sig.toString(36)+'_'+chords.length;
    if(sigStr===gridSigRef.current)return;
    gridSigRef.current=sigStr;
    const evs=chords.map(c=>({durQ:c.durQ!=null?c.durQ:snapDurQ(Math.max(...c.n.map(n=>n.durMs||250),250)/500)}));
    // Fixed-frame live canvas applies to in-the-moment creation only — Compose
    // and Voice (sing): short pieces that should sit in one golden-ratio frame
    // with rows thinning as you add chords. MUSIC (listen) is really a transcript
    // of existing ambient music (like MIDI/audio), so it uses the grow-with-
    // content canvas — otherwise a long capture (e.g. 3 min) overflows the fixed
    // frame: rows hit the 4px floor and later chords wrap over earlier cells,
    // making it look like the painting stopped halfway. draftOwnerRef holds the
    // authoring mode and survives after the mic stops, so the grid stays correct.
    const isMusicListen = draftOwnerRef.current==='listen';
    const newGrid=computeGrid(evs,{liveMode:!isMusicListen});
    // Update the ref immediately so startPlay always sees fresh grid.
    // Defer the state update (which triggers a re-render) until not playing
    // so the grid recompute doesn't stutter compose-mode playback.
    gridRef.current=newGrid;
    if(!playingRef.current){
      setGrid(newGrid);
    }else{
      // Schedule the visual update for after playback stops. Replace any
      // prior pending interval so only the LATEST grid wins — and so we
      // don't leak intervals when chords change rapidly during playback.
      if(pendingGridRef.current){clearInterval(pendingGridRef.current);pendingGridRef.current=null;}
      pendingGridRef.current=setInterval(()=>{
        if(!playingRef.current){
          clearInterval(pendingGridRef.current);
          pendingGridRef.current=null;
          setGrid(newGrid);
        }
      },200);
    }
    return ()=>{
      // Effect re-runs (or unmount): kill any pending interval so it can't
      // resurrect a stale grid after a newer one has been scheduled.
      if(pendingGridRef.current){clearInterval(pendingGridRef.current);pendingGridRef.current=null;}
    };
  },[chords]);

  // Center the keyboard scroll on middle C (MIDI 60) whenever the keyboard
  // becomes visible (compose mode toggles on, or first mount with it already on).
  // Display:none zeroes clientWidth, so the calculation must happen post-paint.
  useEffect(()=>{
    if(!composeMode)return;
    // Frame the collapsed Color·Style strip at the top with the canvas below,
    // the moment compose mode turns on — runs for every entry point (Enter key,
    // COMPOSE buttons), so PC (hardware-keyboard compose) gets the same framing
    // as mobile, which previously only scrolled on the first tapped piano key.
    setStripOpen(false);
    const wrap = kbScrollRef.current;
    if (!wrap) return;
    const c4 = WKEYS.find(k => k.midi === 60);
    if (!c4) return;
    const target = c4.wi * WKW - wrap.clientWidth / 2 + WKW / 2;
    wrap.scrollLeft = Math.max(0, target);
  },[composeMode]);

  const playNote = useCallback((midi,vel=88,durMs=500)=>{
    // Spawn a visualizer ripple (skip in image mode — too busy with the photo)
    if (visualizerRef.current && viewModeRef.current !== 'image') {
      const c = visualizerRef.current;
      const x = ((Math.max(21, Math.min(108, midi)) - 21) / 87) * c.width;
      const y = c.height * (0.35 + Math.random() * 0.55);
      const [r,g,b] = harmCol(midi, vel);
      ripplesRef.current.push({ x, y, r, g, b, born: performance.now() });
      // Cap to last 80 to bound memory if many notes pile up
      if (ripplesRef.current.length > 80) ripplesRef.current.splice(0, ripplesRef.current.length - 80);
      // Wake the visualizer loop — it stops itself when there's nothing to
      // animate, so a fresh ripple needs to kick it back into life.
      wakeVisualizerRef.current?.();
    }
    try{
      const gain=Math.max(0.01,Math.min(1,vel/127)),dur=Math.max(0.05,durMs/1000);
      // Sustain tail: a real piano's body resonance rings 2-3 s after the key
      // releases. A short chord (300 ms) at the old "40% of dur" produced only
      // 120 ms of tail — barely time for the sample to bloom, sounding brittle
      // and morse-like on playback. We floor the tail at 1.5 s and cap at 3 s,
      // so even a flash-tap chord gets full piano-like decay. Live presses are
      // unaffected: releaseNote calls triggerRelease at the user's release
      // moment, cutting the note before this tail finishes.
      const tailS=Math.min(Math.max(dur*0.4,1.5),3.0);
      // Defensive context resume. Even when the sampler is loaded, scheduling
      // a triggerAttackRelease into a suspended context produces silence on
      // iOS — the symptom users see as "sound randomly disappears." Cheap to
      // call and a no-op when already running.
      try{const _ac=Tone.getContext().rawContext;if(_ac&&_ac.state==='suspended')_ac.resume().catch(()=>{});}catch(_){}
      if(samplerOk.current&&samplerRef.current){samplerRef.current.triggerAttackRelease(Tone.Frequency(midi,'midi').toNote(),dur+tailS,Tone.now(),gain);return;}
      const ac=Tone.getContext().rawContext;if(!ac)return;
      if(ac.state==='suspended')ac.resume();
      const freq=440*Math.pow(2,(midi-69)/12),now=ac.currentTime,fade=Math.min(dur+tailS+.35,3.0),amp=gain*.18*(mutedRef.current?0:1),master=ac.createGain();
      master.gain.setValueAtTime(amp,now);master.gain.exponentialRampToValueAtTime(.0001,now+fade);master.connect(ac.destination);
      if(recStreamDestRef.current){try{master.connect(recStreamDestRef.current);}catch(_){}}
      [[1,1],[2,.5],[3,.25],[4,.1]].forEach(([h,w])=>{const osc=ac.createOscillator(),g=ac.createGain();osc.type='sine';osc.frequency.value=freq*h;g.gain.value=w;osc.connect(g);g.connect(master);osc.start(now);osc.stop(now+fade+.05);osc.onended=()=>{try{osc.disconnect();g.disconnect();}catch(_){}};});
      setTimeout(()=>{try{master.disconnect();}catch(_){}},(fade+.15)*1000);
    }catch(_){}
  },[]);


  // Mirror viewMode into a ref so playNote (stable callback) can read it
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  // Mirror playbackSpeed into a ref so step loops read the live value mid-playback
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
    try{if(audioElRef.current)audioElRef.current.playbackRate=playbackSpeed;}catch(_){}
    try{if(audioSourceRef.current)audioSourceRef.current.playbackRate.value=playbackSpeed;}catch(_){}
  }, [playbackSpeed]);
  // Refs mirrored for the highlight RAF loop (which can't close over React state)
  const playingRef  = useRef(false);
  const dispRef     = useRef(0);
  const handlePauseClickRef = useRef(null);
  const startPlayRef = useRef(null);
  const aiComposeRef = useRef(null); // lets aiMoodFromText (declared earlier) call aiCompose for unknown moods
  // Cache of the last successful AI composition, keyed by normalised mood text +
  // language. Lets re-entering the SAME mood (e.g. Setup → Canvas, or retyping the
  // same phrase) replay the already-composed piece instead of paying for a fresh
  // AI call. Only AI results are cached here (crafted/offline moods are cheap).
  const aiComposeCacheRef = useRef({ key:'', parsed:null });
  const chordsRef   = useRef([]);
  const gridRef     = useRef(null);
  const gcRef       = useRef(null);
  useEffect(()=>{
    playingRef.current=playing;
    // Restart the self-terminating animation loops when playback resumes.
    // (They stop themselves when not playing to let the browser idle-throttle.)
    if(playing){
      wakeVisualizerRef.current?.();
      wakeHighlightRef.current?.();
    }else{
      // Playback ended (naturally or via pause). If a recording is in progress,
      // finalize it now — the piece is over, so stop the recorder to flush the
      // blob. Without this, a piece that finishes on its own leaves the recorder
      // running and the eventual blob comes back empty ("recording too short").
      const r=recorderRef.current;
      if(r&&r.state!=='inactive'){
        try{ r.requestData(); }catch(_){}
        try{ r.stop(); }catch(_){}
      }
    }
  },[playing]);
  useEffect(()=>{ dispRef.current=disp; },[disp]);
  useEffect(()=>{ chordsRef.current=chords; },[chords]);
  useEffect(()=>{ gridRef.current=grid; },[grid]);
  useEffect(()=>{ gcRef.current=gc; },[gc]);
  const infoRef = useRef(null);
  useEffect(()=>{ infoRef.current=info; },[info]);
  useEffect(()=>{ loopModeRef.current=loopMode; },[loopMode]);

  // When leaving Compose mode, clear the held-key visualization. The `active`
  // set tracks keys currently pressed; if the user exits Compose mid-press
  // (e.g. taps a Mood, Sing/Listen, or the Compose toggle itself), the gold
  // "held" highlight would otherwise stick to those keys on the next return.
  // Also drop the pending chord buffer for the same reason.
  useEffect(()=>{
    if(!composeMode){
      setActive(new Set());
      setPending([]);
      pendingRef.current=[];
      pressInfo.current={};
      clearTimeout(kbTimer.current);
    }
  },[composeMode]);

  // === Draft stash helpers ===
  // stashDraft: snapshot current chord array under the slot of the mode that
  // authored it. Only stashes recorded content (composedModeRef.current true);
  // imported content (MIDI/audio/score/image/mood) is never stashed since the
  // user can reload it from its source.
  const stashDraft = useCallback((owner)=>{
    if(!owner) return;
    if(!composedModeRef.current) return;
    const cur = chordsRef.current;
    if(!cur || !cur.length) return;
    const snapshot = {chords:cur.slice(), idxCounter:idxRef.current, sessionStart:sessionStart.current};
    if(owner==='compose'){composeStashRef.current = snapshot; setHasComposeDraft(true);}
    else if(owner==='sing'){
      // Voice and Music are independent modes within MIC — each keeps its own
      // stash. Toggling voice⇄music saves the current preset's draft and
      // restores the other preset's draft (or starts blank). Clear in MIC
      // discards only the active preset's stash, leaving the other intact.
      singStashRef.current = snapshot;
      setHasMicDraft(true); // any preset having a draft lights the MIC glow
    }
    else if(owner==='listen'){
      listenStashRef.current = snapshot;
      setHasMicDraft(true);
    }
  },[]);
  // restoreStash: load the saved draft for `owner` onto the canvas. Returns
  // true if a draft existed and was restored.
  const restoreStash = useCallback((owner)=>{
    let stash=null;
    if(owner==='compose') stash=composeStashRef.current;
    else if(owner==='sing') stash=singStashRef.current;
    else if(owner==='listen') stash=listenStashRef.current;
    if(!stash || !stash.chords.length) return false;
    setChords(stash.chords);
    chordsRef.current=stash.chords;
    idxRef.current=stash.idxCounter;
    sessionStart.current=stash.sessionStart;
    composedModeRef.current=true;
    draftOwnerRef.current=owner;
    gridSigRef.current='';
    setDisp(stash.chords.length);
    setViewMode('paint');
    setInfo(null);
    return true;
  },[]);
  // resetCanvasForDraft: start a clean canvas owned by `owner` (called when
  // entering a creative mode with no stash for it).
  const resetCanvasForDraft = useCallback((owner)=>{
    setChords([]); chordsRef.current=[];
    idxRef.current=0; setPending([]); pendingRef.current=[];
    pressInfo.current={}; sessionStart.current=0; gridSigRef.current='';
    composedModeRef.current=true;
    draftOwnerRef.current=owner;
    setDisp(0);
    setGrid({N:DN,BW:DB,BH:DH,CW:DN*DB,CH:DN*DH});
    setViewMode('paint');
    setInfo(null);
    setLoadedSource(null);
    setStamp(s=>s+1);
  },[]);


  // Visualizer animation loop — self-terminating. Previously it ran a 60Hz
  // rAF for the entire page lifetime, just early-exiting on idle ticks. That
  // prevented mobile browsers from idle-throttling and kept the CPU warm even
  // when the user wasn't interacting. Now the loop stops scheduling itself
  // when there's nothing to draw, and producers (playNote → ripple push,
  // play state going true) call `wakeVisualizer()` to restart it.
  const visualizerRunningRef = useRef(false);
  const visualizerRafRef = useRef(0);
  const wakeVisualizerRef = useRef(null);
  useEffect(() => {
    const tick = () => {
      const canvas = visualizerRef.current;
      // If there's nothing to do, stop scheduling. Producers will wake us.
      if (!ripplesRef.current.length && !playingRef.current) {
        visualizerRunningRef.current = false;
        return;
      }
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const now = performance.now();
        const MAX_AGE = 900;
        ripplesRef.current = ripplesRef.current.filter(rp => {
          const age = now - rp.born;
          if (age > MAX_AGE) return false;
          const t = age / MAX_AGE;
          const radius = 4 + t * 38;
          const alpha = (1 - t) * 0.7;
          // Outer ring
          ctx.strokeStyle = `rgba(${rp.r},${rp.g},${rp.b},${alpha.toFixed(3)})`;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, radius, 0, Math.PI * 2);
          ctx.stroke();
          // Soft inner glow
          ctx.fillStyle = `rgba(${rp.r},${rp.g},${rp.b},${(alpha*0.18).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, radius * 0.7, 0, Math.PI * 2);
          ctx.fill();
          return true;
        });
      }
      visualizerRafRef.current = requestAnimationFrame(tick);
    };
    // Wake function: idempotent — if already running, do nothing.
    const wake = () => {
      if (visualizerRunningRef.current) return;
      visualizerRunningRef.current = true;
      visualizerRafRef.current = requestAnimationFrame(tick);
    };
    wakeVisualizerRef.current = wake;
    return () => {
      cancelAnimationFrame(visualizerRafRef.current);
      visualizerRunningRef.current = false;
    };
  }, []);

  // Playback highlight loop — draws an animated pulsing border on the
  // currently-playing block. Runs on its own canvas overlay (zIndex 3)
  // so it never disturbs the main paint or the ripple visualizer.
  // Reads everything through refs so the callback stays stable.
  // Self-terminating (see visualizer loop above): the loop stops scheduling
  // when playback ends so the page doesn't keep a 60Hz wake-up running.
  // The `playing` effect (further below) calls wakeHighlightRef.current()
  // when playback starts.
  const highlightRunningRef = useRef(false);
  const highlightRafRef = useRef(0);
  const wakeHighlightRef = useRef(null);
  useEffect(() => {
    // Cache the highlight color per chord. The reduce-and-slice was running
    // 60×/sec on a value that only changes when the chord changes.
    let cachedIdx = -1, cachedR = 0, cachedG = 0, cachedB = 0;
    const tick = () => {
      const canvas = highlightCanvasRef.current;
      // Stop when not playing — but first clear any lingering highlight from
      // the previous tick so the canvas doesn't freeze on the last-drawn frame.
      if (!playingRef.current) {
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        cachedIdx = -1;
        highlightRunningRef.current = false;
        return;
      }
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const d = dispRef.current;
        const chords = chordsRef.current;
        const grid = gridRef.current;
        const gc = gcRef.current;
        const style = lastPaintRef.current?.style ?? null;
        const isOverlay = style==='pollock'||style==='picasso'||style==='kusama'||style==='miro'||style==='kandinsky'||style==='rothko'||style==='matisse'||style==='mondrian'||style==='bulge'||style==='arcs'||style==='bloom'||style==='spiral'||style==='gold'||style==='pop'||style==='wave'||style==='comic';
        if (d > 0 && chords.length && grid && gc && !isOverlay) {
          const chord = chords[d - 1];
          if (chord) {
            const cell = grid.cells && grid.cells[chord.idx];
            const { BW, BH, N } = grid;
            const si = chord.idx % (N * N);
            const cx = cell ? cell.x : (si % N) * BW;
            const cy = cell ? cell.y : Math.floor(si / N) * BH;
            const cw = cell ? cell.w : BW;
            const ch = cell ? cell.h : BH;
            // Pulse: smooth sine wave 0→1→0 over 600ms
            const pulse = (Math.sin(performance.now() / 600 * Math.PI * 2 - Math.PI / 2) + 1) / 2;
            // Recompute color only when the chord changes.
            if (chord.idx !== cachedIdx) {
              cachedIdx = chord.idx;
              const note = chord.n.reduce((a, b) => b.v > a.v ? b : a, chord.n[0]);
              const c = gc(note.m, note.v);
              cachedR = c[0]; cachedG = c[1]; cachedB = c[2];
            }
            const alpha = 0.35 + pulse * 0.55;
            const lw = 1.5 + pulse * 1.5;
            ctx.strokeStyle = `rgba(${cachedR},${cachedG},${cachedB},${alpha.toFixed(3)})`;
            ctx.lineWidth = lw;
            ctx.strokeRect(cx + lw / 2, cy + lw / 2, cw - lw, ch - lw);
            // Inner glow fill
            ctx.fillStyle = `rgba(${cachedR},${cachedG},${cachedB},${(pulse * 0.07).toFixed(3)})`;
            ctx.fillRect(cx + lw, cy + lw, cw - lw * 2, ch - lw * 2);
          }
        }
      }
      highlightRafRef.current = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (highlightRunningRef.current) return;
      highlightRunningRef.current = true;
      highlightRafRef.current = requestAnimationFrame(tick);
    };
    wakeHighlightRef.current = wake;
    return () => {
      cancelAnimationFrame(highlightRafRef.current);
      highlightRunningRef.current = false;
    };
  }, []);

  // iOS audio unlock. Tone.start() is fire-and-forget and returns a Promise
  // that we never await — on iOS Safari/Chrome (both WebKit) the rawContext
  // can remain in 'suspended' state for a moment after Tone says it's started,
  // and any note scheduled in that window plays into silence even though the
  // app keeps running. Call this from every user-gesture audio entrypoint to
  // (a) kick Tone's promise, and (b) synchronously poke the rawContext awake.
  // Cheap to call repeatedly; no-op when context is already running.
  const unlockAudio = useCallback(()=>{
    try{Tone.start();}catch(_){}
    try{
      const ac=Tone.getContext().rawContext;
      if(ac&&ac.state==='suspended'){
        // The context was suspended. Any triggerAttackRelease() calls made
        // before this moment got queued at Tone.now() (which was frozen),
        // and would all fire at once when resume completes. Cancel those
        // scheduled events on the sampler before resuming — otherwise the
        // user's first audible event is a phantom replay of every silent
        // keypress they made before the context unlocked.
        try{if(samplerOk.current&&samplerRef.current)samplerRef.current.releaseAll();}catch(_){}
        // Fire-and-forget: iOS sometimes resolves the resume promise late
        // (or never) but the side effect of *calling* resume marks the
        // context as user-activated, which is what we need.
        ac.resume().catch(()=>{});
      }
    }catch(_){}
  },[]);

  const stopAll = useCallback(()=>{
    loadTokenRef.current++; // invalidate any in-flight async load
    genRef.current++;timers.current.forEach(t=>clearTimeout(t));timers.current=[];timersSet.current.clear();
    // Cancel any pending keyboard-commit timer + preview. Without this, a key
    // pressed just before Play (within the commit window) would fire its commit
    // mid-playback and append a stray chord to the composition.
    clearTimeout(kbTimer.current);
    if(pendingRef.current.length){pendingRef.current=[];setPending([]);}
    pressInfo.current={};
    try{if(samplerOk.current&&samplerRef.current)samplerRef.current.releaseAll();}catch(_){}
    try{if(audioElRef.current){audioElRef.current.pause();}}catch(_){}
    try{if(audioSourceRef.current){audioSourceRef.current.stop();audioSourceRef.current.disconnect();audioSourceRef.current=null;}}catch(_){}
    // Release any keys highlighted by the just-cancelled release timers.
    // Without this they linger gold even though no note is sounding.
    setActive(new Set());
    setPlaying(false);setAnim(false);
    setHoldPaused(false);resumeFromRef.current=null;
  },[]);

  // Pause playback when the tab goes to background. The audio context suspends
  // automatically, but timers keep firing — leaving the UI stuck in playing state.
  // Store the chord position so resume picks up from where it stopped.
  useEffect(()=>{
    const onHide=()=>{
      if(document.hidden){
        if(playingRef.current){
          resumeFromRef.current=dispRef.current;
          setHoldPaused(true);
          genRef.current++;timers.current.forEach(t=>clearTimeout(t));timers.current=[];
          try{if(samplerOk.current&&samplerRef.current)samplerRef.current.releaseAll();}catch(_){}
          try{if(audioElRef.current)audioElRef.current.pause();}catch(_){}
          try{if(audioSourceRef.current){audioSourceRef.current.stop();audioSourceRef.current=null;}}catch(_){}
          setActive(new Set());
          setPlaying(false);setAnim(false);
        }
      }else{
        try{Tone.start();}catch(_){}
      }
    };
    document.addEventListener('visibilitychange',onHide);
    return()=>document.removeEventListener('visibilitychange',onHide);
  },[]);

  // Schedule a timeout and remember its id so stopAll can cancel it.
  // Uses a Set internally for O(1) delete on fire instead of O(n) filter.
  // genRef.current is captured so the callback can self-cancel if
  // playback has been stopped + restarted.
  const timersSet = useRef(new Set());
  const pushTimer = useCallback((fn,ms)=>{
    const gen=genRef.current;
    const id=setTimeout(()=>{
      timersSet.current.delete(id);
      if(genRef.current!==gen)return;
      fn();
    },ms);
    timersSet.current.add(id);
    // Keep timers.current in sync for stopAll (which iterates it)
    timers.current.push(id);
    return id;
  },[]);

  const commit = useCallback(()=>{
    if(!pendingRef.current.length)return;
    const now=performance.now();
    const notes=pendingRef.current.map(m=>{
      const info=pressInfo.current[m];
      // If the key was already released before commit ran, info.releasedDur
      // holds the real hold time — prefer it over the live elapsed estimate.
      // This is the fix for "every fast tap renders the same width".
      const elapsed = info
        ? (info.releasedDur != null ? info.releasedDur : Math.max(now-info.pressTime, 120))
        : paintDur;
      const v=info && typeof info.vel === 'number' ? info.vel : 88;
      return{m,v,durMs:Math.min(elapsed,4000)};
    });
    pendingRef.current=[];setPending([]);
    const idx=idxRef.current++;
    if(!sessionStart.current)sessionStart.current=now;
    const startMs=now-sessionStart.current;
    for(const {m} of notes){
      const info=pressInfo.current[m];
      if(!info) continue;
      if(info.releasedDur != null){
        // Key was already released — commit consumed it, free the slot.
        delete pressInfo.current[m];
      } else {
        // Still held — attach chordIdx so the future release patches the chord.
        info.chordIdx=idx;
      }
    }
    // Continuous durQ — every press translates to a proportional block width.
    // Clamped 0.2-4.0 so neither flash-taps nor multi-second holds dominate.
    // computeGrid's scale=(N*rows)/totalQ invariant still fills the canvas
    // exactly, regardless of how varied the durQs are across chords.
    const maxMs=Math.max(...notes.map(n=>n.durMs));
    const durQ=Math.max(0.2,Math.min(4,maxMs/500));
    composedModeRef.current=true;
    // commit always runs in a fresh tick (scheduled via setTimeout in pressNote),
    // so chordsRef.current is up to date here. Build the next chord list, compute
    // its live grid synchronously, and set both — closing the one-render gap that
    // otherwise flashed the new note as a tiny default-grid corner block before
    // the reactive [chords] grid effect could land setGrid.
    const selIdxKb=selectedChordIdxRef.current;
    let nextChords, insertedCursor=null;
    if(selIdxKb!=null){
      const base=chordsRef.current;
      const pos=base.findIndex(c=>c.idx===selIdxKb);
      if(pos>=0){
        const insChord={n:notes,idx,startMs,recorded:true,durQ};
        nextChords=base.slice(0,pos+1).concat([insChord],base.slice(pos+1)).map((c,i)=>({...c,idx:i}));
        insertedCursor=pos+1;
        // patch chordIdx on held notes to the inserted chord's NEW index
        for(const{m}of notes){const info=pressInfo.current[m];if(info&&info.releasedDur==null)info.chordIdx=pos+1;}
      }else{
        nextChords=[...base,{n:notes,idx,startMs,recorded:true,durQ}];
      }
    }else{
      nextChords=[...chordsRef.current,{n:notes,idx,startMs,recorded:true,durQ}];
    }
    chordsRef.current=nextChords;
    if(insertedCursor!=null){ selectedChordIdxRef.current=insertedCursor; setSelectedChordIdx(insertedCursor); }
    try{
      const evs=nextChords.map(c=>({durQ:c.durQ!=null?c.durQ:1}));
      const newGrid=computeGrid(evs,{liveMode:true});
      gridRef.current=newGrid;
      if(!playingRef.current) setGrid(newGrid);
      // Pre-set the grid signature so the reactive [chords] effect recognizes
      // this layout as already-computed and skips a redundant recompute.
      let sig=0;
      for(let i=0;i<nextChords.length;i++){const c=nextChords[i];sig=(Math.imul(sig,31)+c.idx*1000+(c.durQ||0)*100)>>>0;}
      gridSigRef.current=sig.toString(36)+'_'+nextChords.length;
    }catch(_){}
    setChords(nextChords);
  },[paintDur]);

  // Derive velocity from a pointer/touch event. Priorities:
  //  1) Real pressure (Force Touch on supported iPhones, stylus on iPad/Surface)
  //  2) Vertical position on the key — striking near the bottom edge = louder,
  //     near the top = softer. Mimics how piano response feels: hitting closer
  //     to the keytop gives more leverage and a stronger tone.
  //  Returns a MIDI velocity 50-118.
  const velocityFromEvent = (e) => {
    if (!e) return 88;
    const touch = e.touches && e.touches[0] ? e.touches[0] : e;
    // 1) Real pressure
    const force = touch.force;
    const pressure = e.pressure;
    if (typeof force === 'number' && force > 0 && force < 1) {
      return Math.round(50 + force * 68);
    }
    if (typeof pressure === 'number' && pressure > 0 && pressure !== 0.5) {
      return Math.round(50 + pressure * 68);
    }
    // 2) Vertical position on the key
    try {
      const rect = e.currentTarget.getBoundingClientRect();
      const y = (touch.clientY ?? 0) - rect.top;
      const yRel = Math.min(1, Math.max(0, y / rect.height));
      return Math.round(58 + yRel * 60);
    } catch (_) { return 88; }
  };

  const pressNote = useCallback((midi, event) => {
    // Don't accept new notes while a composition is playing back or paused
    // (holdPaused = Resume). The keyboard composes only when idle; pressing keys
    // mid-playback would corrupt the recorded sequence and timing.
    if(playing || holdPaused) return;
    // Strip-collapse + scroll framing is handled centrally by the composeMode
    // effect (fires once on entry, for both tap and hardware-keyboard compose),
    // so we don't re-scroll on every keypress here — that would fight the user.
    // Apply scale snap. Velocity comes from the event (touch position / pressure),
    // duration from how long the key is held (see releaseNote).
    midi = paintSnapMidi(midi, paintScale);
    const vel = event && typeof event === 'object' ? velocityFromEvent(event) : 88;
    unlockAudio();playNote(midi,vel,2500);
    pressInfo.current[midi]={pressTime:performance.now(),vel};
    if(!pendingRef.current.includes(midi)){pendingRef.current=[...pendingRef.current,midi];setPending([...pendingRef.current]);}
    clearTimeout(kbTimer.current);kbTimer.current=setTimeout(commit,KB_WIN);
    setActive(p=>{const s=new Set(p);s.add(midi);return s;});
  },[playNote,commit,paintScale,playing,holdPaused,composeMode]);

  // Release: compute actual hold duration, patch the chord's note durMs.
  // Also stop the still-ringing tone so the user hears length match the block.
  const releaseNote = useCallback((midi)=>{
    midi = paintSnapMidi(midi, paintScale);
    const info=pressInfo.current[midi];
    if(!info)return;
    const now=performance.now();
    const actualDur=Math.min(Math.max(now-info.pressTime,120),4000);
    // Stop the held sample at the actual release moment
    if(samplerOk.current&&samplerRef.current){
      try{samplerRef.current.triggerRelease(Tone.Frequency(midi,'midi').toNote(),Tone.now());}catch(_){}
    }
    setActive(p=>{const s=new Set(p);s.delete(midi);return s;});
    if(info.chordIdx!=null){
      // Commit already ran — patch the existing chord with the actual hold dur
      delete pressInfo.current[midi];
      setChords(prev=>{
        const i=prev.findIndex(c=>c.idx===info.chordIdx);
        if(i<0)return prev;
        const c=prev[i];
        const ni=c.n.findIndex(n=>n.m===midi);
        if(ni<0)return prev;
        const newN=c.n.slice();
        newN[ni]={...newN[ni],durMs:actualDur};
        const maxMs=Math.max(...newN.map(n=>n.durMs||0));
        const next=prev.slice();
        // Continuous durQ — preserves expressive press-duration variation.
        // Clamped so very short or very long holds don't blow up layout.
        next[i]={...c,n:newN,durQ:Math.max(0.2,Math.min(4,maxMs/500))};
        return next;
      });
    } else {
      // Released BEFORE commit fired. Don't delete pressInfo yet — commit
      // needs the actual hold duration. Stash it so commit reads it instead
      // of falling back to paintDur (500ms), which was the cause of the
      // "every fast tap is the same width" bug.
      info.releasedDur=actualDur;
    }
  },[paintScale]);

  // Release every key currently held. Called on global pointerup/blur and on
  // mode changes — touchscreens routinely fail to fire touchend when the user
  // drags off a key, leaving stuck-gold "active" keys that never clear.
  const releaseAllHeld = useCallback(()=>{
    const held=Object.keys(pressInfo.current);
    if(!held.length)return;
    const now=performance.now();
    const patches=[]; // {chordIdx, midi, durMs}
    for(const k of held){
      const midi=+k;
      const info=pressInfo.current[midi];
      if(samplerOk.current&&samplerRef.current){
        try{samplerRef.current.triggerRelease(Tone.Frequency(midi,'midi').toNote(),Tone.now());}catch(_){}
      }
      if(info && info.chordIdx==null){
        // Pre-commit release — keep the slot, stash the real hold time so the
        // pending commit picks it up. Don't overwrite if releaseNote already stashed.
        if(info.releasedDur==null){
          info.releasedDur=Math.min(Math.max(now-info.pressTime,120),4000);
        }
      } else if(info && info.chordIdx!=null){
        // Post-commit entry — global pointerup fires alongside per-key
        // touchend, but ordering is non-deterministic. If WE delete first,
        // the per-key releaseNote will see a null info and skip patching
        // the chord with the actual hold dur — every chord ends up at the
        // commit-time minimum (~65-120ms), producing identical widths.
        // Solution: patch ourselves before deleting.
        const actualDur=Math.min(Math.max(now-info.pressTime,120),4000);
        patches.push({chordIdx:info.chordIdx,midi,durMs:actualDur});
        delete pressInfo.current[midi];
      } else {
        delete pressInfo.current[midi];
      }
    }
    setActive(new Set());
    if(patches.length){
      setChords(prev=>{
        let next=prev;
        for(const p of patches){
          const i=next.findIndex(c=>c.idx===p.chordIdx);
          if(i<0)continue;
          const c=next[i];
          const ni=c.n.findIndex(n=>n.m===p.midi);
          if(ni<0)continue;
          const newN=c.n.slice();
          newN[ni]={...newN[ni],durMs:p.durMs};
          const maxMs=Math.max(...newN.map(n=>n.durMs||0));
          if(next===prev) next=prev.slice();
          next[i]={...c,n:newN,durQ:Math.max(0.2,Math.min(4,maxMs/500))};
        }
        return next;
      });
    }
  },[]);

  const undoLast = useCallback(()=>{
    setChords(prev=>{
      if(!prev.length)return prev;
      // If a chord is selected (tapped in compose/compose-pause), delete THAT
      // one; otherwise fall back to removing the last chord.
      let next;
      if(selectedChordIdx!=null){
        const pos=prev.findIndex(c=>c.idx===selectedChordIdx);
        next = pos>=0 ? prev.slice(0,pos).concat(prev.slice(pos+1)) : prev.slice(0,-1);
      }else{
        next=prev.slice(0,-1);
      }
      // Re-index so chord.idx stays contiguous (0,1,2,…). computeGrid lays cells
      // out by array position, so without this a deleted chord leaves a visual
      // gap and idx-based hit-testing/selection drifts.
      next=next.map((c,i)=>({...c,idx:i}));
      if(!next.length){idxRef.current=0;sessionStart.current=0;}
      // Keep the paused resume-position in sync with the shortened piece, so a
      // Resume after Undo doesn't replay (and visually restore) the just-deleted
      // notes. Clamp to the new length.
      if(resumeFromRef.current!=null){ resumeFromRef.current=Math.min(resumeFromRef.current, next.length); }
      idxRef.current=Math.min(idxRef.current, next.length);
      return next;
    });
    setSelectedChordIdx(null);selectedChordIdxRef.current=null;
    setDisp(p=>Math.max(0,p-1));
  },[selectedChordIdx]);

  useEffect(()=>{
    const map={a:60,w:61,s:62,e:63,d:64,f:65,t:66,g:67,y:68,h:69,u:70,j:71,k:72,o:73,l:74,p:75};
    const held=new Set();
    // Skip the global keyboard piano shortcuts when focus is on an interactive
    // element that handles Enter/Space itself (any button, link, role=button).
    // Otherwise Space would both click the focused button AND trigger pause.
    const isInteractive=()=>{
      const a=document.activeElement;
      if(!a||a===document.body)return false;
      const tag=a.tagName;
      if(tag==='BUTTON'||tag==='A')return true;
      if(a.getAttribute&&a.getAttribute('role')==='button')return true;
      return false;
    };
    const dn=e=>{
      if(inputFocus.current)return;
      const _ae=document.activeElement; if(_ae&&(_ae.tagName==='INPUT'||_ae.tagName==='TEXTAREA'||_ae.isContentEditable))return;
      if(e.key==='Backspace'&&composeMode&&!busy&&!recording){e.preventDefault();undoLast();return;}
      if((e.key===' '||e.key==='Enter')&&isInteractive())return;
      if(e.key===' '){e.preventDefault();handlePauseClickRef.current?.();return;}
      if(e.key==='Enter'){e.preventDefault();if(!composeMode){unlockAudio();setComposeMode(true);setMicArmed(false);}else{setComposeMode(false);}return;}
      const m=map[e.key];if(m&&!held.has(e.key)){held.add(e.key);pressNote(m);}
    };
    const up=e=>held.delete(e.key);
    window.addEventListener('keydown',dn);window.addEventListener('keyup',up);
    return()=>{window.removeEventListener('keydown',dn);window.removeEventListener('keyup',up);};
  },[pressNote,composeMode,undoLast,busy,recording]);

  // A1: Escape closes the topmost open modal. Order matches z-index: preview is
  // on top (1100), then morphMenu / sizePicker / guide / about / pickMode.
  useEffect(()=>{
    const onEsc=(e)=>{
      if(e.key!=='Escape')return;
      if(preview){e.preventDefault();if(preview){try{URL.revokeObjectURL(preview.url);}catch(_){}}setPreview(null);return;}
      if(showPaletteEditor){e.preventDefault();closePaletteEditor();return;}
      if(showMorphMenu){e.preventDefault();setShowMorphMenu(false);setMorphSel([]);return;}
      if(showMoodMenu){e.preventDefault();setShowMoodMenu(false);return;}
      if(showSizePicker){e.preventDefault();setShowSizePicker(false);return;}
      if(showGuide){e.preventDefault();setShowGuide(false);setGuideQuery('');return;}
      if(showAbout){e.preventDefault();setShowAbout(false);return;}
      if(pickMode){e.preventDefault();setPickMode(null);return;}
    };
    window.addEventListener('keydown',onEsc);
    return()=>window.removeEventListener('keydown',onEsc);
  },[preview,showMorphMenu,showMoodMenu,showSizePicker,showGuide,showAbout,pickMode,showPaletteEditor]);

  // Release held keys when mode changes — switching out of compose (or into
  // mic painting/listening) should never leave stuck "active" keys behind.
  useEffect(()=>{releaseAllHeld();},[composeMode,micPainting,micListening,releaseAllHeld]);

  // Global release safety net. Touchscreens routinely fail to fire touchend
  // when the finger drags off a key, leaving keys visually "held" forever.
  // Catch pointerup/pointercancel anywhere on the page, plus window blur
  // (tab/app switch), as the universal "let go of everything" signal.
  useEffect(()=>{
    const release=()=>releaseAllHeld();
    window.addEventListener('pointerup',release);
    window.addEventListener('pointercancel',release);
    window.addEventListener('blur',release);
    return()=>{
      window.removeEventListener('pointerup',release);
      window.removeEventListener('pointercancel',release);
      window.removeEventListener('blur',release);
    };
  },[releaseAllHeld]);

  // Immediately blank the canvas + painting state when a NEW source starts
  // loading, so the previous painting's trace doesn't linger on screen during
  // transcription (e.g. switching MIDI→Audio: the old MIDI strip used to stay
  // visible until the audio finished decoding). Does NOT touch loadedSource/blobs
  // — the loaders manage those — it just clears the visible painting + resume.
  const wipeCanvasNow = useCallback(()=>{
    setChords([]);chordsRef.current=[];idxRef.current=0;setPending([]);pendingRef.current=[];
    setDisp(0);setHoldPaused(false);resumeFromRef.current=null;
    pixelRef.current=null;setViewMode('paint');setOriginalImgUrl(null);setInfo(null);
    substrateRef.current={canvas:null,ctx:null,builtTo:0,key:'',CW:0,CH:0};
    lastPaintRef.current={disp:0,chords:null,grid:null,gc:null,style:null,viewMode:null,pending:null,info:null,anim:false,playing:false,stamp:0,mode:null,holdPaused:false};
    try{ const cv=canvasRef.current; if(cv){ const cx=cv.getContext('2d'); cx&&cx.clearRect(0,0,cv.width,cv.height); } }catch(_){}
    setStamp(s=>s+1);
  },[]);

  // ── Date/weather + image → emotion sources ─────────────────────────────
  const [imgAiBusy,setImgAiBusy]=useState(false);
  const [imgReturnUrl,setImgReturnUrl]=useState(null); // original image kept after an image→atmosphere jump, so the user can go back
  const [imgMoodThumb,setImgMoodThumb]=useState(null); // small source-image thumbnail for the "mood from image" mode
  const _mfiTitlesRef=useRef(null); // per-language titles {EN,DE,FR,ES,SK} for the current custom MFI piece — lets a language switch relabel WITHOUT recomposing
  const [mfiImgAspect,setMfiImgAspect]=useState(null); // natural aspect ratio of the loaded MFI image — keeps the box stable (no jump) during compose
  // True when the current mood piece came FROM AN IMAGE (mood-from-image or the
  // AI-composition-from-image button), false for text moods. Morph is offered for
  // text moods only; Vary is offered for both. Cleared by text-mood entry points.
  const [moodFromImg,setMoodFromImg]=useState(false);
  const moodFromImgRef=useRef(false); useEffect(()=>{ moodFromImgRef.current=moodFromImg; },[moodFromImg]);
  // Notes mode is a per-painting choice — reset it to plain colour Mosaic
  // whenever the source changes (new loaded file, new mood, image↔mood switch),
  // so each fresh source starts in the normal reading rather than inheriting
  // note-names from the previous one.
  useEffect(()=>{ setNotesMode(false); },[loadedSource,currentMood,moodFromImg]);
  // micArmed is reset explicitly at every site that leaves the MIC context
  // (start mic, ← Setup, Clear branches, source-picker handlers). A blanket
  // reset effect made micArmed flicker on/off whenever an unrelated source
  // state ticked, even when nothing about the MIC context changed. Without
  // the effect, micArmed remains stable across re-renders.
  const [atmoOn,setAtmoOn]=useState(false);       // image atmosphere effect on/off
  const [atmoMood,setAtmoMood]=useState(null);    // {v,e,root,title} detected from the image
  const [atmoBusy,setAtmoBusy]=useState(false);   // AI detection in progress
  // Body 10: AI-availability tracking. `isOnline` follows the network; `aiDown`
  // latches true when an AI call fails for any reason (budget/429/offline/no
  // endpoint) and clears on the next successful AI call. AI features are
  // considered usable only when online AND not latched-down.
  const [isOnline,setIsOnline]=useState(typeof navigator==='undefined'?true:navigator.onLine!==false);
  const [aiDown,setAiDown]=useState(false);
  // True from mount until the startup probe resolves. While probing we treat AI
  // as not-yet-usable so features don't flash enabled-then-disabled (or accept a
  // click that then fails). Starts true only when plausibly online.
  const [aiProbing,setAiProbing]=useState(typeof navigator==='undefined'?false:navigator.onLine!==false);
  const aiUsable = isOnline && !aiDown && !aiProbing;
  useEffect(()=>{
    if(typeof window==='undefined') return;
    const on=()=>setIsOnline(true), off=()=>setIsOnline(false);
    window.addEventListener('online',on); window.addEventListener('offline',off);
    return ()=>{ window.removeEventListener('online',on); window.removeEventListener('offline',off); };
  },[]);
  // Startup AI probe: check endpoint reachability ONCE at mount so AI features
  // (mood-from-image, text-mood compose, atmosphere) render disabled from the
  // first setup screen when AI is unavailable — instead of only latching after
  // the user clicks and the call fails. A minimal request is sent to the same
  // endpoints aiCompose uses; if none answer OK (and we're online), aiDown latches.
  // A later successful AI call clears aiDown as before. Skipped while offline
  // (navigator.onLine already gates aiUsable) and aborted after a short timeout
  // so a hanging endpoint never blocks the UI.
  useEffect(()=>{
    if(typeof window==='undefined') return;
    if(navigator&&navigator.onLine===false) return; // offline already gates aiUsable
    let cancelled=false;
    const ac=(typeof AbortController!=='undefined')?new AbortController():null;
    const _to=setTimeout(()=>{ try{ac&&ac.abort();}catch(_){} },6000);
    (async()=>{
      const _host=(window.location&&window.location.hostname)||'';
      const _isPrev=/claude\.ai$|claudeusercontent\.com$|\.claude\.com$/.test(_host);
      const _eps=_isPrev?['https://api.anthropic.com/v1/messages','/api/compose']:['/api/compose','https://api.anthropic.com/v1/messages'];
      // Tiny probe payload — a few tokens is enough to confirm the endpoint
      // returns a real AI completion (not just any HTTP response).
      const _body=JSON.stringify({model:CLAUDE_MODEL,max_tokens:8,messages:[{role:'user',content:'ping'}]});
      let ok=false;
      for(const ep of _eps){
        if(cancelled) return;
        try{
          const r=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:_body,signal:ac?ac.signal:undefined});
          // Match aiCompose's own success test: only an HTTP 2xx (r.ok) with a
          // body that parses into a real `content` block means AI is live. A 4xx
          // (e.g. /api/compose deployed without an API key) or an error JSON does
          // NOT count — that's exactly the case the user hit where AI is down but
          // the endpoint still answered.
          if(r && r.ok){
            const txt=await r.text();
            if(txt){
              try{
                const data=JSON.parse(txt);
                const hasContent=Array.isArray(data&&data.content) && data.content.some(b=>b&&(b.type==='text'||typeof b.text==='string'));
                if(hasContent){ ok=true; break; }
              }catch(_){ /* not JSON / error body → not a live AI endpoint */ }
            }
          }
        }catch(_){ /* network/CORS/abort → try next endpoint */ }
      }
      if(cancelled) return;
      clearTimeout(_to);
      // Only latch DOWN on probe; never force-enable here (a real call clears it).
      if(!ok) setAiDown(true);
      setAiProbing(false); // probe resolved → unlock the gate either way
    })();
    return ()=>{ cancelled=true; clearTimeout(_to); try{ac&&ac.abort();}catch(_){}; setAiProbing(false); };
  },[]);

  const clear = useCallback(()=>{
    stopAll();clearTimeout(kbTimer.current);
    if(introRafRef.current){cancelAnimationFrame(introRafRef.current);introRafRef.current=null;}
    // If in a creative mode, wipe ONLY that mode's stash (and the canvas).
    // Other modes' drafts stay safely in their slots. If not in any creative
    // mode, wipe loaded content but never the stashes.
    // Wipe the draft of whatever creation owns this canvas — keyed on
    // draftOwnerRef, which persists after the session STOPS (live flags don't).
    // Without this, clearing a stopped mic/compose session left the MIC/COMPOSE
    // button still glowing "draft saved" even though the draft was gone.
    const _owner = composeMode ? 'compose' : (micPainting||micListening) ? 'sing' : draftOwnerRef.current;
    if(_owner==='compose'){
      composeStashRef.current=null;
      setHasComposeDraft(false);
      // Clear breaks "currently editing recall" identity. The next Back will
      // create a NEW entry instead of overwriting whatever was recalled.
      composeActiveRecallIdRef.current=null;
    } else if(_owner==='sing'){
      // Voice and Music are independent — clear discards only the active
      // preset's stash, leaving the other preset's draft intact.
      singStashRef.current=null;
      if(!listenStashRef.current) setHasMicDraft(false);
      // Clear breaks "currently editing recall" identity for mic too.
      micActiveRecallIdRef.current=null;
      micActiveRecallPresetRef.current=null;
    } else if(_owner==='listen'){
      listenStashRef.current=null;
      if(!singStashRef.current) setHasMicDraft(false);
      micActiveRecallIdRef.current=null;
      micActiveRecallPresetRef.current=null;
    }
    // For sing/listen: keep mic streams running — just wipe canvas
    if(!micPainting&&!micListening){
      if(micRafRef.current){cancelAnimationFrame(micRafRef.current);micRafRef.current=null;}
      if(micStreamRef.current){micStreamRef.current.getTracks().forEach(t=>t.stop());micStreamRef.current=null;}
      if(listenRafRef.current){cancelAnimationFrame(listenRafRef.current);listenRafRef.current=null;}
      if(listenStreamRef.current){listenStreamRef.current.getTracks().forEach(t=>t.stop());listenStreamRef.current=null;}
    }
    // Always wipe canvas content
    setChords([]);chordsRef.current=[];idxRef.current=0;setPending([]);pendingRef.current=[];
    pressInfo.current={};sessionStart.current=0;gridSigRef.current='';composedModeRef.current=false;
    // If in a creative mode, canvas stays in that mode (owner persists).
    if(!composeMode&&!micPainting&&!micListening) draftOwnerRef.current=null;
    setInfo(null);setMidiBlob(null);setMidiName('');setAudioBlob(null);setAudioName('');audioBlobRef.current=null;
    setLoadedSource(null);
    pixelRef.current=null;setViewMode('paint');
    // Invalidate the cached substrate canvas + last-paint signature. Without this,
    // Clear emptied the chords but left the built-up substrate cache intact, so
    // returning to the canvas (← Canvas) re-blitted the OLD painting even though
    // there were no chords. Reset it exactly like the unmount cleanup does.
    substrateRef.current={canvas:null,ctx:null,builtTo:0,key:'',CW:0,CH:0};
    lastPaintRef.current={disp:0,chords:null,grid:null,gc:null,style:null,viewMode:null,pending:null,info:null,anim:false,playing:false,stamp:0,mode:null,holdPaused:false};
    setGrid({N:DN,BW:DB,BH:DH,CW:DN*DB,CH:DN*DH});
    setOriginalImgUrl(null);
    // Clear is a full reset of the loaded content: drop the loaded source AND
    // the mood markers so that returning to setup shows nothing highlighted.
    // (Stashed Compose/MIC drafts live in their own refs and are untouched —
    // their "draft saved" glow is correct because they're recoverable.)
    setCurrentMood(null);setVarySource(null);setSongQ('');
    setImgMoodThumb(null);setMoodFromImg(false);
    setDisp(0);setErr('');setStamp(s=>s+1);
    setCompositionName('');setPaintScale('off');setRecordingName('');setRecBlob(null);setRecName('');
    // After clear in a creative mode, mark the canvas as draft-owned by that
    // mode again so subsequent presses commit to the right stash.
    if(composeMode) { composedModeRef.current=true; draftOwnerRef.current='compose'; }
    else if(micPainting) { composedModeRef.current=true; draftOwnerRef.current='sing'; }
    else if(micListening) { composedModeRef.current=true; draftOwnerRef.current='listen'; }
    // Canvas is now empty — return the page to its default (top) position so the
    // header and controls are back in their resting place.
    requestAnimationFrame(()=>{try{window.scrollTo({top:0,behavior:'smooth'});}catch(_){}});
  },[stopAll,micPainting,micListening,composeMode]);

  // Clear from the painting view. For a loaded source (mood / MIDI / audio /
  // score / image) Clear is a FULL reset — it drops the loaded piece and returns
  // to an empty setup. For compose / mic the "painting" IS the chord draft, so it
  // also falls through to full clear().
  const clearCanvas = useCallback(()=>{
    // Voice/Music mic mode: the mic stream is still live and the capture loop
    // appends new chords continuously. If we only wipe the canvas, the next
    // detected sound instantly repaints — so Clear appears to do nothing. Stop
    // the mic too for a clean, predictable blank slate; re-tap MIC to resume.
    if(micPainting||micListening){
      // Capture which preset was active BEFORE we stop the mic (stopMic* clears
      // draftOwnerRef.current later via clear()'s _owner handling).
      const wasPreset = micListening ? 'listen' : 'sing';
      if(micPainting) stopMicPaintingRef.current?.();
      if(micListening) stopMicListeningRef.current?.();
      clear();
      // Voice/Music are independent: Clear discards ONLY the active preset's
      // stash. The other preset's draft is preserved across the swap. Glow
      // stays on if the other preset still has a draft.
      if(wasPreset==='sing'){
        singStashRef.current=null;
        if(!listenStashRef.current) setHasMicDraft(false);
      } else {
        listenStashRef.current=null;
        if(!singStashRef.current) setHasMicDraft(false);
      }
      draftOwnerRef.current=null;
      // Stay in the MIC context with the mic stopped: arm it so the view stays
      // framed and the canvas shows "tap 🎙 to record" — one tap on MIC (LIVE)
      // resumes recording. Avoids dumping the user into an ambiguous blank state.
      setMicArmed(true);
      return;
    }
    // A creation session may be active even when no mic stream is live: pressing
    // Play stops the mic (micPainting/micListening go false) but the canvas is
    // still a Compose/MIC draft, marked by draftOwnerRef. Treat that as a
    // creation (full clear), NOT a loaded source — otherwise Clear would keep
    // the chords and the painting would reappear on replay.
    // IMAGE source: Clear wipes everything — the painted trace AND the loaded
    // picture — but STAYS in the image view: loadedSource remains 'image' so the
    // image-style Color/Custom strip keeps showing, and we do NOT drop to the full
    // setup. The complete Color+Style panel (with artists) only appears when the
    // user explicitly taps "← Setup". This keeps the cleared view calm.
    if(loadedSource==='image' && !composeMode && !micPainting && !micListening && !draftOwnerRef.current){
      stopAll();
      setPending([]);pendingRef.current=[];
      pressInfo.current={};sessionStart.current=0;gridSigRef.current='';
      // Keep the picture's pixel data AND the displayed photo. Clear in image
      // mode wipes the visible mosaic and rebuilds the (hidden-until-play) notes
      // from the SAME photo, so Play stays active — the played trace just resets.
      setInfo(null);
      substrateRef.current={canvas:null,ctx:null,builtTo:0,key:'',CW:0,CH:0};
      lastPaintRef.current={disp:0,chords:null,grid:null,gc:null,style:null,viewMode:null,pending:null,info:null,anim:false,playing:false,stamp:0,mode:null,holdPaused:false};
      try{ const cv=canvasRef.current; if(cv){ const cx=cv.getContext('2d'); cx&&cx.clearRect(0,0,cv.width,cv.height); } }catch(_){}
      { let _evts=[]; const _pr=pixelRef.current;
        if(_pr){ const _nc=_pr.nc,_nr=_pr.nr,_px=_pr.px;
          const _hue = mode==='custom'
            ? Object.assign(activePalette.map(hex=>{const[r,g,b]=hexToRgb(hex);return toHsl(r,g,b)[0];}),
                {__sats:activePalette.map(hex=>{const[r,g,b]=hexToRgb(hex);return toHsl(r,g,b)[1];}),
                 __hasNeutral:activePalette.some(hex=>{const[r,g,b]=hexToRgb(hex);return toHsl(r,g,b)[1]<12;})})
            : (mode==='spectral'?SPEC_HUE:COF);
          const _lit=pixelsToImageEvents(_px,_nc,_nr,_hue,mode,imgDirRef.current);
          _evts=(atmoOn&&atmoMood)?_atmoTransform(_lit,atmoMood):_lit;
        }
        setChords(_evts);chordsRef.current=_evts;
        idxRef.current=_evts.length;setDisp(_evts.length);
      }
      setStamp(s=>s+1); setPlayedOnce(false);
      resumeFromRef.current=null; setHoldPaused(false);
      setShowColorPalette(false); setCustomArmed(false);
      // loadedSource stays 'image' and forceSetup stays false → image view persists.
      // Return the page to its default (top) position so the header + collapsed
      // strip are back in their resting place — same as the generic clear() path.
      requestAnimationFrame(()=>{try{window.scrollTo({top:0,behavior:'smooth'});}catch(_){}});
      return;
    }
    // MOOD-FROM-IMAGE source: Clear is a FULL RESET of the painted piece —
    // drops the chords, the AI varySource (so Play has nothing to replay),
    // the source thumbnail, and the canvas — but STAYS in MFI canvas view so
    // the user can tap "+ new image" (or "← image" if there's a return URL) to
    // pick a fresh image right where they are, without bouncing through setup.
    // Previously Clear rebuilt the chords from varySource so Play stayed
    // active, but that left full artist-style shapes (pollock drips, picasso
    // shards…) on the canvas as "residual" paint. Now we wipe everything,
    // Play disables because chords are empty, and the canvas reads as blank
    // and ready for a new image / mood. moodFromImg + moodContext stay true
    // so the MFI affordances persist; stayActive stays true so the active
    // view doesn't collapse.
    // Detection: MFI sets moodFromImg=true + moodContext=true and clears
    // loadedSource, so it's distinguishable from both loaded sources and text moods.
    if(moodFromImg && moodContext && !composeMode && !micPainting && !micListening && !draftOwnerRef.current){
      stopAll();
      setChords([]); chordsRef.current=[]; idxRef.current=0;
      setPending([]); pendingRef.current=[];
      pressInfo.current={}; sessionStart.current=0; gridSigRef.current='';
      composedModeRef.current=false;
      setDisp(0); setInfo(null);
      // Reset grid to defaults — without this the old (varied) grid persists
      // and the renderer's "no chords, but lim===0 + paint grid" path keeps
      // drawing the wrong cell layout under any residual overlay.
      setGrid({N:DN,BW:DB,BH:DH,CW:DN*DB,CH:DN*DH});
      // Reset seed + structure lock — multiple Vary taps may have built up
      // a non-zero rndSalt and a structureSeedLock; both must reset so the
      // next painting starts from a clean seed state.
      setRndSalt(0); setStructureSeedLock(null);
      saltHistoryRef.current=[0]; saltIdxRef.current=0; setVariationPos(0);
      // Substrate cache + last-paint signature: invalidate fully so the
      // renderer can't take any fast-path shortcut against stale data.
      substrateRef.current={canvas:null,ctx:null,builtTo:0,key:'',CW:0,CH:0};
      lastPaintRef.current={disp:0,chords:null,grid:null,gc:null,style:null,viewMode:null,pending:null,info:null,anim:false,playing:false,stamp:0,mode:null,holdPaused:false};
      // Clear ALL three canvas layers explicitly: main paint, visualizer
      // (ripples), and highlight (playing-cell pulse). Otherwise lingering
      // pixels from any of the three look like residual paint from the
      // previous variation — especially after rapid Vary taps where the
      // upper layers were actively rendering when Clear hit.
      try{
        const cv=canvasRef.current; if(cv){ const cx=cv.getContext('2d'); cx&&cx.clearRect(0,0,cv.width,cv.height); }
        const vc=visualizerRef.current; if(vc){ const vx=vc.getContext('2d'); vx&&vx.clearRect(0,0,vc.width,vc.height); }
        const hc=highlightCanvasRef.current; if(hc){ const hx=hc.getContext('2d'); hx&&hx.clearRect(0,0,hc.width,hc.height); }
      }catch(_){}
      // Drop any in-flight ripples and pending highlight state.
      ripplesRef.current=[];
      // Drop the piece itself so Play has nothing to replay (Play disables
      // when chords are empty).
      setVarySource(null);
      // Drop the source-image thumbnail.
      setImgMoodThumb(null);
      setStamp(s=>s+1); setPlayedOnce(false);
      resumeFromRef.current=null; setHoldPaused(false);
      setShowColorPalette(false); setCustomArmed(false);
      // moodFromImg / moodContext / stayActive STAY — the canvas view persists
      // with its "+ new image" / "+ new mood" affordances. The user picks
      // their next move from right here.
      requestAnimationFrame(()=>{try{window.scrollTo({top:0,behavior:'smooth'});}catch(_){}});
      return;
    }
    // Active COMPOSE: Clear means just clear — wipe the canvas and stay in
    // compose (clear() already keeps composedModeRef + draftOwner='compose').
    // Do NOT run the stopped-session cleanup below (it nulls the owner, drops
    // the draft, and resets colour/style) — that's for abandoned sessions only.
    if(composeMode){ clear(); return; }
    // Armed MIC: mic stopped but user is still in MIC context. Clear discards
    // only the active preset's stash (the other preset's draft is preserved)
    // and stays in armed so the big REC button stays on the canvas.
    if(micArmed){
      clear();
      if(micPreset==='voice'){
        singStashRef.current=null;
        if(!listenStashRef.current) setHasMicDraft(false);
      } else {
        listenStashRef.current=null;
        if(!singStashRef.current) setHasMicDraft(false);
      }
      draftOwnerRef.current=null;
      setMicArmed(true);
      return;
    }
    // For everything else (loaded MIDI/Score/Audio/mood OR empty), do a
    // full clear(): it drops the loaded source and chords so the source tile
    // no longer shows as active when returning to setup.
    clear();
    // Discard any stopped-session draft + glow too (a Compose/MIC draft whose
    // live mode already ended). Without this the MIC/COMPOSE button kept its
    // "draft saved" glow after clearing a stopped session.
    singStashRef.current=null;listenStashRef.current=null;setHasMicDraft(false);
    composeStashRef.current=null;setHasComposeDraft(false);
    draftOwnerRef.current=null;
    // Reset Colour + Style to defaults so returning to Setup is a clean slate.
    setMode('harmony'); setStyle(null); setSetupNoSel(false); setShowColorPalette(false); setCustomArmed(false);
  },[stopAll,clear,composeMode,micPainting,micListening,micArmed,micPreset,loadedSource,mode,activePalette,atmoOn,atmoMood,moodFromImg,moodContext,varySource]);

  const fullClear = useCallback(()=>{
    stopAll();clearTimeout(kbTimer.current);
    if(introRafRef.current){cancelAnimationFrame(introRafRef.current);introRafRef.current=null;}
    if(micRafRef.current){cancelAnimationFrame(micRafRef.current);micRafRef.current=null;}
    if(micStreamRef.current){micStreamRef.current.getTracks().forEach(t=>t.stop());micStreamRef.current=null;}
    if(micVolRef.current){const{raf,stream}=micVolRef.current;cancelAnimationFrame(raf);stream.getTracks().forEach(t=>t.stop());micVolRef.current=null;}
    if(listenRafRef.current){cancelAnimationFrame(listenRafRef.current);listenRafRef.current=null;}
    if(listenStreamRef.current){listenStreamRef.current.getTracks().forEach(t=>t.stop());listenStreamRef.current=null;}
    setMicPainting(false);setMicVolActive(false);setMicVolLevel(0);setMicListening(false);
    setChords([]);idxRef.current=0;setPending([]);pendingRef.current=[];
    pressInfo.current={};sessionStart.current=0;gridSigRef.current='';composedModeRef.current=false;
    setDisp(0);setInfo(null);setErr('');setMidiBlob(null);setMidiName('');setAudioBlob(null);setAudioName('');audioBlobRef.current=null;
    setLoadedSource(null);
    pixelRef.current=null;setViewMode('paint');setStamp(s=>s+1);
    setGrid({N:DN,BW:DB,BH:DH,CW:DN*DB,CH:DN*DH});
    setOriginalImgUrl(null);
    setCurrentMood(null);setVarySource(null);setSongQ('');setPickMode(null);setStructureSeedLock(null);setForceSetup(false);
    setComposeMode(false);setDemoMode(false);setLoopMode(false);loopModeRef.current=false;
    setCompositionName('');setPaintScale('off');setRecordingName('');setRecBlob(null);setRecName('');
  },[stopAll]);

  // Guard switching away from a CREATION canvas (Compose/MIC) — content the user
  // hand-made and can't reload. A loaded source (MIDI/Audio/Score/Image/mood) is
  // NOT guarded (reloadable) and switches immediately. Detection uses persistent
  // refs (composedModeRef + a creation draftOwner + chords) which survive the
  // "← Setup" transition that turns composeMode/micPainting off. First tap arms
  // the tile ("clean canvas?"), second tap of the same tile within 3s runs it.
  const armSwitch = useCallback((key, run)=>{
    const owner = draftOwnerRef.current;
    const isCreation = owner==='compose' || owner==='sing' || owner==='listen';
    const atRisk = composedModeRef.current && isCreation && chordsRef.current.length>0;
    if(!atRisk){ run(); return; }
    if(switchArmRef.current){ clearTimeout(switchArmRef.current); switchArmRef.current=null; }
    setSwitchArmed(prev=>{
      if(prev===key){ run(); return null; }
      switchArmRef.current=setTimeout(()=>{ setSwitchArmed(null); switchArmRef.current=null; },3000);
      return key;
    });
  },[]);

  const applyEvents = useCallback((events,title)=>{
    if(!events.length)return;
    setImgReturnUrl(null); setImgMoodThumb(null);
    // Stash any active creative draft before replacing the canvas with imported
    // content. The draft lives on in its mode's stash slot until the user
    // explicitly CLEARs it from inside that mode.
    if(draftOwnerRef.current) stashDraft(draftOwnerRef.current);
    draftOwnerRef.current = null;
    events.forEach(ev=>{
      if(ev.durQ==null){const md=Math.max(...ev.n.map(n=>n.durMs||0),0);ev.durQ=md>0?snapDurQ(md/500):1;}
      // Pre-sort notes high→low so draw functions (mosaic, dim, etc.) skip the sort
      if(ev.n.length>1) ev.n=[...ev.n].sort((a,b)=>b.m-a.m);
    });
    const wi=events.map((c,i)=>({...c,idx:i}));
    const g=computeGrid(wi),lastMs=wi[wi.length-1]?.startMs||0;
    pixelRef.current=null;setViewMode('paint');setOriginalImgUrl(null);
    setGrid(g);setChords(wi);setDisp(0);
    setInfo({title,count:wi.length,dur:Math.round(lastMs/1000)});
    idxRef.current=wi.length;
    setComposeMode(false);
    setDemoMode(false);
    setPlaybackSpeed(1);playbackSpeedRef.current=1;
    composedModeRef.current=false;
    // Canvas starts blank — blocks appear chord by chord during playback,
    // so the painting builds itself in sync with the music.
    if(introRafRef.current){cancelAnimationFrame(introRafRef.current);introRafRef.current=null;}
    setDisp(0);
  },[stashDraft]);

  const loadMidi=e=>{
    const file=e.target.files[0];if(!file)return;e.target.value='';if(micPainting)stopMicPainting();if(micListening)stopMicListening();if(composeMode)setComposeMode(false);if(draftOwnerRef.current){stashDraft(draftOwnerRef.current);draftOwnerRef.current=null;}setPickMode(null);setMicArmed(false);setForceSetup(false);setCurrentMood(null);setVarySource(null);setSongQ('');setMidiBlob(null);setMidiName('');setAudioBlob(null);setAudioName('');audioBlobRef.current=null;setLoadedSource(null);
    stopAll();wipeCanvasNow();
    const myToken=loadTokenRef.current;
    const r=new FileReader();
    r.onload=evt=>{
      if(loadTokenRef.current!==myToken)return; // user left mid-read — abandon
      try{
        const{raw,div,temps,skipped}=parseMidi(evt.target.result);
        const evts=toChords(raw,div,temps);
        if(!evts.length){setErr(t('errs').noNotesMidi);setErrInfo(false);return;}
        const mName=file.name.replace(/\.midi?$/i,'').replace(/[_-]/g,' ');
        applyEvents(evts,mName);
        setCompositionName(mName);
        setLoadedSource('midi');
        setPickMode(null);
        if(skipped.length){setErr(`Loaded with warnings: track${skipped.length>1?'s':''} ${skipped.join(', ')} skipped (corrupt data).`);setErrInfo(true);}
      }catch(e){if(loadTokenRef.current===myToken){setErr('MIDI parse error: '+e.message);setErrInfo(false);}}
    };
    r.readAsArrayBuffer(file);
  };

  const loadAudio=useCallback(async e=>{
    const file=e.target.files[0];if(!file)return;e.target.value='';if(micPainting)stopMicPainting();if(micListening)stopMicListening();if(composeMode)setComposeMode(false);if(draftOwnerRef.current){stashDraft(draftOwnerRef.current);draftOwnerRef.current=null;}setPickMode(null);setMicArmed(false);setForceSetup(false);setCurrentMood(null);setVarySource(null);setSongQ('');setMidiBlob(null);setMidiName('');setAudioBlob(null);setAudioName('');audioBlobRef.current=null;setLoadedSource(null);
    setWorking(true);setWLabel('transcribing audio');setWPct(0);setErr('');setErrInfo(false);stopAll();wipeCanvasNow();
    const myToken=loadTokenRef.current;
    try{
      const buf=await file.arrayBuffer();
      const blob=new Blob([buf],{type:file.type||'audio/mpeg'});
      const AC=window.AudioContext||window.webkitAudioContext;
      const ac=new AC();
      const audioBuf=await ac.decodeAudioData(buf.slice(0));
      ac.close();
      if(loadTokenRef.current!==myToken)return;
      audioPCMRef.current=audioBuf;
      // For long files the FFT pass can take a meaningful chunk of time. Let
      // the user know so the progress bar doesn't look like a stuck app.
      if(audioBuf.duration>90){
        setWLabel('transcribing audio · this may take a minute');
      }
      const evts=await transcribeAudio(audioBuf,p=>{setWPct(Math.round(p*100));});
      if(loadTokenRef.current!==myToken)return;
      if(!evts.length){setErr(t('errs').noNotesAudio);setErrInfo(false);return;}
      const aName=file.name.replace(/\.[^.]+$/,'');
      setCompositionName(aName);
      setAudioBlobAndRef(blob);setAudioName(file.name);
      applyEvents(evts,aName);
      setViewMode('audio');viewModeRef.current='audio';
      setLoadedSource('audio');setPickMode(null);
    }catch(e){if(loadTokenRef.current===myToken){setErr('Audio: '+e.message);setErrInfo(false);}}
    finally{if(loadTokenRef.current===myToken){setWorking(false);setWLabel('');setWPct(0);}}
  },[stopAll,applyEvents,t,wipeCanvasNow]);

  // ── Body 4: Mood-from-image cache ──────────────────────────────────────────
  // The expensive step is the AI vision call. We cache its parsed result keyed by
  // a fast content hash of the image data URL, persisted in localStorage so the
  // SAME picture replays for free — across sessions, and regardless of filename.
  // The built-in sample is a special always-present entry (see SAMPLE_IMGMOOD).
  const _imgMoodHash=useCallback((dataUrl)=>{
    // FNV-1a style 32-bit hash over the string; cheap and good enough for keying.
    const s=String(dataUrl||''); let h=0x811c9dc5>>>0;
    for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193)>>>0; }
    // length-salted to further reduce accidental collisions
    return (h^(s.length*2654435761))>>>0;
  },[]);
  const IMGMOOD_CACHE_KEY='paintiano_imgmood_cache_v1';
  const _imgMoodCacheGet=useCallback((hash)=>{
    // Baked sample first (offline, always free — see SAMPLE_IMGMOOD constant).
    try{
      if(typeof SAMPLE_IMGMOOD!=='undefined' && SAMPLE_IMGMOOD && SAMPLE_IMGMOOD.hash===hash) return SAMPLE_IMGMOOD.result;
    }catch(_){}
    try{
      const raw=localStorage.getItem(IMGMOOD_CACHE_KEY); if(!raw) return null;
      const map=JSON.parse(raw)||{}; return map[hash]||null;
    }catch(_){ return null; }
  },[]);
  const _imgMoodCacheSet=useCallback((hash,result)=>{
    try{
      const raw=localStorage.getItem(IMGMOOD_CACHE_KEY);
      const map=raw?(JSON.parse(raw)||{}):{};
      map[hash]=result;
      // Soft cap: keep the most recent ~40 entries to stay well under quota.
      const keys=Object.keys(map);
      if(keys.length>40){ for(const k of keys.slice(0,keys.length-40)) delete map[k]; }
      localStorage.setItem(IMGMOOD_CACHE_KEY, JSON.stringify(map));
    }catch(_){ /* quota or disabled storage — silently skip caching */ }
  },[]);

  // ── MFI "recent 3" list ─────────────────────────────────────────────────────
  // Separate from the cost-cache above: this powers the small thumbnail strip
  // that lets the user return to their last 3 mood-from-image pieces. Each entry
  // stores a tiny (~64px) source thumbnail + the recipe (notes/tempo/title) only
  // — never audio or full images — so it stays well under the localStorage quota.
  // Saved for ALL users (so free users see the locked strip as a Pro nudge);
  // RECALL (clicking an entry) is Pro-gated in the render below.
  const MFI_RECENT_KEY='paintiano_mfi_recent_v1';
  const [mfiRecent,setMfiRecent]=useState(()=>{
    try{ const raw=localStorage.getItem(MFI_RECENT_KEY); return raw?(JSON.parse(raw)||[]):[]; }
    catch(_){ return []; }
  });
  // Make a tiny ~64px thumbnail from a source image URL for the strip. Kept small
  // on purpose: 3 entries × small jpeg stays tiny in storage.
  const _mfiTinyThumb=useCallback((srcUrl)=>new Promise((res)=>{
    try{
      const im=new Image();
      im.onload=()=>{ try{
        const max=64; let w=im.naturalWidth||64,h=im.naturalHeight||64;
        const sc=Math.min(1,max/Math.max(w,h)); w=Math.max(1,Math.round(w*sc)); h=Math.max(1,Math.round(h*sc));
        const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
        cv.getContext('2d').drawImage(im,0,0,w,h);
        res(cv.toDataURL('image/jpeg',0.72));
      }catch(_){ res(null); } };
      im.onerror=()=>res(null); im.src=srcUrl;
    }catch(_){ res(null); }
  }),[]);
  // Push a new piece to the front of the recent list, dedupe by recipe hash,
  // cap at 3. recipe = {notes, tempo, title}; thumb = tiny data URL.
  // `style` is captured as the user's currently picked art style at gen time;
  // null = random (which is the default when no specific style has been picked).
  const _mfiRecentAdd=useCallback(async(srcUrl,recipe)=>{
    try{
      const thumb=await _mfiTinyThumb(srcUrl);
      const entry={ id:Date.now(), thumb, title:recipe.title||'✦',
                    notes:recipe.notes||[], tempo:recipe.tempo||90,
                    style: styleRef.current || null };
      setMfiRecent(prev=>{
        // Dedupe by title only — Vary creates new note arrays with the same
        // title, and we want the latest variation to replace the old entry
        // (preserves user's "last seen" version automatically).
        const next=[entry,...prev.filter(p=>p.title!==entry.title)].slice(0,3);
        try{ localStorage.setItem(MFI_RECENT_KEY, JSON.stringify(next)); }catch(_){}
        return next;
      });
      // Fresh Add → recording lifecycle reset. Recording opens on first Play.
      setAiRecording(false); setAiSealed(false);
    }catch(_){ /* storage disabled — skip silently */ }
  },[_mfiTinyThumb]);

  // Update the most-recent MFI entry with new notes/tempo (called after Vary).
  // Keeps title + thumb, only swaps the recipe. Lets the user return to their
  // last-seen variation rather than the original AI generation.
  const _mfiRecentUpdate=useCallback((title,notes,tempo)=>{
    if(!title||!notes||!notes.length) return;
    setMfiRecent(prev=>{
      const idx=prev.findIndex(p=>p.title===title);
      if(idx<0) return prev;
      const next=prev.slice();
      next[idx]={ ...prev[idx], notes, tempo:tempo||prev[idx].tempo||90,
                  style: styleRef.current || prev[idx].style || null,
                  id:Date.now() };
      // Move updated entry to front so it stays "latest" in the picker.
      const updated=next.splice(idx,1)[0];
      next.unshift(updated);
      try{ localStorage.setItem(MFI_RECENT_KEY, JSON.stringify(next)); }catch(_){}
      return next;
    });
  },[]);

  // Recall a recent MFI piece: rebuild the painting from its stored recipe (no AI
  // call, free for everyone — replay just redraws from localStorage). Free users
  // who exhausted their AI trial can still revisit their past pieces; only NEW
  // generation costs trial (sample/choose file paths go through composeFromImage
  // which has the paywall gate).
  const _mfiRecall=useCallback((entry)=>{
    if(!entry) return;
    try{
      const evts=noteArr2events(entry.notes||[],entry.tempo||90);
      if(!evts.length) return;
      const title=entry.title||'✦';
      const _varyNotes=(entry.notes||[]).map(n=>Array.isArray(n)
        ? {note:n[0],dur:n[1],beat:n[2],vel:n[3]}
        : {note:n.note,dur:n.dur,beat:n.beat,vel:n.vel});
      stopAll();
      setViewMode('paint'); setOriginalImgUrl(null); setLoadedSource(null); setForceSetup(false);
      setStructureSeedLock(null); setVarySource({notes:_varyNotes,tempo:entry.tempo||90,title});
      applyEvents(evts,title); setComposeSource('ai'); setMoodContext(true); setCurrentMood(title);
      setSongQ(''); setImgMoodThumb(entry.thumb||null); setMoodFromImg(true);
      // Restore the style the user had picked when this piece was saved. If the
      // entry pre-dates the style-snapshot feature, entry.style is null and we
      // leave the current style untouched.
      if(entry.style){ setStyle(entry.style); }
      // Recall = open re-record window. Sealed=false, recording=false; first
      // Play after this opens recording so user can tweak style / Vary.
      setAiRecording(false); setAiSealed(false);
      // Recall = full painting visible immediately in current style (no Play needed
      // to reveal it). applyEvents sets disp=0; override so all blocks render now.
      setDisp(evts.length); idxRef.current=evts.length;
      try{ const bytes=encodeMidi(evts,entry.tempo||100); setMidiBlob(new Blob([bytes],{type:'audio/midi'})); setMidiName(title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim()+'.mid'); }catch(_){}
    }catch(_){}
  },[stopAll,applyEvents]);

  // ── AI Compose "recent 3" list ──────────────────────────────────────────────
  // Tracks only AI-generated moods from the free-text path (composeSource='ai',
  // !moodFromImg). Library / offline moods are NOT stored — they're already
  // pickable from the mood grid. Stored: title + recipe (notes/tempo). No thumb.
  // Saved for ALL users; recall is free for everyone (replay = no AI call).
  const AI_COMPOSE_RECENT_KEY='paintiano_aicompose_recent_v1';
  const [aiComposeRecent,setAiComposeRecent]=useState(()=>{
    try{ const raw=localStorage.getItem(AI_COMPOSE_RECENT_KEY); return raw?(JSON.parse(raw)||[]):[]; }
    catch(_){ return []; }
  });
  const _aiComposeRecentAdd=useCallback((title,notes,tempo)=>{
    if(!title||!notes||!notes.length) return;
    try{
      const entry={ id:Date.now(), title, notes, tempo:tempo||90,
                    style: styleRef.current || null };
      setAiComposeRecent(prev=>{
        // Dedupe by title — same title (cache hit OR replayed Vary) replaces.
        const next=[entry,...prev.filter(p=>p.title!==entry.title)].slice(0,3);
        try{ localStorage.setItem(AI_COMPOSE_RECENT_KEY, JSON.stringify(next)); }catch(_){}
        return next;
      });
      // Fresh Add → recording lifecycle reset. Recording opens on first Play.
      setAiRecording(false); setAiSealed(false);
    }catch(_){ /* storage disabled — skip silently */ }
  },[]);
  // Update the latest entry's notes after Vary (keeps title, swaps recipe).
  const _aiComposeRecentUpdate=useCallback((title,notes,tempo)=>{
    if(!title||!notes||!notes.length) return;
    setAiComposeRecent(prev=>{
      const idx=prev.findIndex(p=>p.title===title);
      if(idx<0) return prev;
      const next=prev.slice();
      next[idx]={ ...prev[idx], notes, tempo:tempo||prev[idx].tempo||90,
                  style: styleRef.current || prev[idx].style || null,
                  id:Date.now() };
      const updated=next.splice(idx,1)[0];
      next.unshift(updated);
      try{ localStorage.setItem(AI_COMPOSE_RECENT_KEY, JSON.stringify(next)); }catch(_){}
      return next;
    });
  },[]);
  // Replay a recent AI compose — rebuild the painting, no AI call. Free for all
  // users (exhausted free trial doesn't block replay; only new generation does).
  const _aiComposeRecall=useCallback((entry)=>{
    if(!entry) return;
    try{
      const evts=noteArr2events(entry.notes||[],entry.tempo||90);
      if(!evts.length) return;
      const title=entry.title||'✦';
      const _varyNotes=(entry.notes||[]).map(n=>Array.isArray(n)
        ? {note:n[0],dur:n[1],beat:n[2],vel:n[3]}
        : {note:n.note,dur:n.dur,beat:n.beat,vel:n.vel});
      stopAll();
      setViewMode('paint'); setOriginalImgUrl(null); setLoadedSource(null); setForceSetup(false);
      setStructureSeedLock(null); setVarySource({notes:_varyNotes,tempo:entry.tempo||90,title});
      setImgMoodThumb(null); setMoodFromImg(false);
      applyEvents(evts,title); setComposeSource('ai'); setMoodContext(true); setCurrentMood(title);
      setSongQ(title);
      // Restore the style the user had picked when this piece was saved. Null
      // in legacy entries (pre style-snapshot) → leave current style untouched.
      if(entry.style){ setStyle(entry.style); }
      // Recall = open re-record window. First Play after this opens recording.
      setAiRecording(false); setAiSealed(false);
      // Recall = full painting visible immediately in current style.
      setDisp(evts.length); idxRef.current=evts.length;
      try{ const bytes=encodeMidi(evts,entry.tempo||100); setMidiBlob(new Blob([bytes],{type:'audio/midi'})); setMidiName(title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim()+'.mid'); }catch(_){}
    }catch(_){}
  },[stopAll,applyEvents]);

  // Style sync during recording window: when the user switches style WHILE the
  // re-record window is open (after first Play, before song fully plays once),
  // write it into the active recent entry. Outside the window this is a no-op
  // so just browsing styles after Recall doesn't overwrite saved choices.
  useEffect(()=>{
    if(!aiRecording || !currentMood) return;
    if(moodFromImg){
      setMfiRecent(prev=>{
        const idx=prev.findIndex(p=>p.title===currentMood);
        if(idx<0 || prev[idx].style===style) return prev;
        const next=prev.slice();
        next[idx]={ ...prev[idx], style: style||null };
        try{ localStorage.setItem(MFI_RECENT_KEY, JSON.stringify(next)); }catch(_){}
        return next;
      });
    } else if(composeSource==='ai') {
      setAiComposeRecent(prev=>{
        const idx=prev.findIndex(p=>p.title===currentMood);
        if(idx<0 || prev[idx].style===style) return prev;
        const next=prev.slice();
        next[idx]={ ...prev[idx], style: style||null };
        try{ localStorage.setItem(AI_COMPOSE_RECENT_KEY, JSON.stringify(next)); }catch(_){}
        return next;
      });
    }
  },[style,aiRecording,currentMood,moodFromImg,composeSource]);

  // ── Compose piano "recent 3" list ───────────────────────────────────────────
  // Live keyboard performances are saved on Back (when chords were recorded).
  // No AI was involved — these are pure local creations. Label is "♪ Today HH:MM"
  // or "♪ DD Mon HH:MM" depending on the timestamp. Style picked at save time
  // is restored on recall, matching the MFI / AI compose behaviour.
  const COMPOSE_RECENT_KEY='paintiano_compose_recent_v1';
  const [composeRecent,setComposeRecent]=useState(()=>{
    try{ const raw=localStorage.getItem(COMPOSE_RECENT_KEY); return raw?(JSON.parse(raw)||[]):[]; }
    catch(_){ return []; }
  });
  // Show "♪ Today 17:48" if from today, else "♪ 29 May 17:48".
  const _composeRecentLabel=useCallback((ts)=>{
    try{
      const d=new Date(ts||Date.now());
      const now=new Date();
      const sameDay = d.getFullYear()===now.getFullYear()
                   && d.getMonth()===now.getMonth()
                   && d.getDate()===now.getDate();
      const hh=String(d.getHours()).padStart(2,'0');
      const mm=String(d.getMinutes()).padStart(2,'0');
      const tm=hh+':'+mm;
      if(sameDay) return '♪ '+(t('today')||'Today')+' '+tm;
      const mons=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return '♪ '+d.getDate()+' '+mons[d.getMonth()]+' '+tm;
    }catch(_){ return '♪ '+(t('recentPlayed')||'recent'); }
  },[t]);
  // Tracks which Compose recent entry the user is currently working on. Set
  // when they Recall an entry; cleared on Clear (user starts something new).
  // Back uses it to decide UPDATE (preserve identity) vs ADD NEW.
  const composeActiveRecallIdRef=useRef(null);
  const _composeRecentAdd=useCallback((chordsArr,gridSnap)=>{
    // Strip down chord events to a compact, replayable shape. We only need
    // notes (m/v/durMs), startMs (so timing is preserved), and basic structure
    // info to redraw — same fields applyEvents expects to find.
    if(!chordsArr || !chordsArr.length) return;
    try{
      // Compact chord serialization: drop derived fields, keep essential.
      const compact = chordsArr.map(c=>({
        n: (c.n||[]).map(nn=>({m:nn.m, v:nn.v, durMs:nn.durMs})),
        startMs: c.startMs||0,
        durQ: c.durQ
      }));
      const entry={
        id: Date.now(),
        ts: Date.now(),
        chords: compact,
        grid: gridSnap || null,   // saved grid so we redraw on the same N×rows
        style: styleRef.current || null
      };
      setComposeRecent(prev=>{
        // No dedupe by content — every Back is a separate performance. Just cap 3.
        const next=[entry,...prev].slice(0,3);
        try{ localStorage.setItem(COMPOSE_RECENT_KEY, JSON.stringify(next)); }catch(_){}
        return next;
      });
    }catch(_){ /* storage disabled — skip silently */ }
  },[]);
  // Update an existing compose entry — used when user Recall-ed it, made
  // changes (style, notes), and pressed Back. Preserves identity (same id +
  // position-ish in list) but writes the fresh state on top. Timestamp refreshed
  // so it bubbles to the top of the list as the "latest" performance.
  const _composeRecentUpdate=useCallback((id,chordsArr,gridSnap)=>{
    if(!id || !chordsArr || !chordsArr.length) return;
    try{
      const compact = chordsArr.map(c=>({
        n: (c.n||[]).map(nn=>({m:nn.m, v:nn.v, durMs:nn.durMs})),
        startMs: c.startMs||0,
        durQ: c.durQ
      }));
      setComposeRecent(prev=>{
        const idx = prev.findIndex(p=>p.id===id);
        if(idx<0) return prev;
        const next = prev.slice();
        next[idx] = { ...prev[idx], ts: Date.now(), chords: compact,
                      grid: gridSnap || prev[idx].grid || null,
                      style: styleRef.current || prev[idx].style || null };
        // Bubble updated entry to front so user sees their freshly-edited piece on top.
        const updated = next.splice(idx,1)[0];
        next.unshift(updated);
        try{ localStorage.setItem(COMPOSE_RECENT_KEY, JSON.stringify(next)); }catch(_){}
        return next;
      });
    }catch(_){}
  },[]);
  const _composeRecall=useCallback((entry)=>{
    if(!entry || !entry.chords || !entry.chords.length) return;
    try{
      stopAll();
      setViewMode('paint'); setOriginalImgUrl(null); setLoadedSource(null);
      setImgMoodThumb(null); setMoodFromImg(false); setForceSetup(false);
      setStructureSeedLock(null); setMoodContext(false); setCurrentMood(null);
      setVarySource(null); setComposeSource(null);
      // Rehydrate chords — pre-sort notes high→low like applyEvents does, and
      // re-index idx so draw functions stay happy.
      const evts = entry.chords.map((c,i)=>{
        const n = (c.n||[]).slice().sort((a,b)=>b.m-a.m);
        return { n, startMs:c.startMs||0, durQ:c.durQ, idx:i };
      });
      const lastMs = evts[evts.length-1]?.startMs || 0;
      if(entry.grid) setGrid(entry.grid);
      setChords(evts);
      setInfo({ title: _composeRecentLabel(entry.ts), count: evts.length, dur: Math.round(lastMs/1000) });
      setDisp(evts.length); idxRef.current = evts.length;
      setPlaybackSpeed(1); playbackSpeedRef.current = 1;
      composedModeRef.current = false;
      if(entry.style){ setStyle(entry.style); }
      // Stay in compose mode — recall is meant as a starting point the user can
      // build on (add more notes, Vary, Play, then Clear & start fresh). Without
      // composeMode the keyboard disappears and the canvas drops to a half-state.
      // composeMode was already on (recent button only shows in compose mode), so
      // we keep it that way. draftOwnerRef stays 'compose' so Clear keeps mode.
      draftOwnerRef.current='compose';
      // Mark this entry as "currently being edited". Back will UPDATE this id
      // instead of adding a new entry; Clear will reset it (= start fresh).
      composeActiveRecallIdRef.current = entry.id;
    }catch(_){}
  },[stopAll,_composeRecentLabel]);
  const [showComposeRecent,setShowComposeRecent]=useState(false);

  // ── Mic "recent 3" lists ────────────────────────────────────────────────────
  // Two separate stores — voice (singing detection) and music (listening to
  // external audio). The recently-played button shows whichever matches the
  // current micPreset, so the user sees the right history for what they're doing.
  // Same schema as Compose recent (chords + grid + style + timestamp).
  const MIC_VOICE_RECENT_KEY='paintiano_mic_voice_recent_v1';
  const MIC_MUSIC_RECENT_KEY='paintiano_mic_music_recent_v1';
  const [micVoiceRecent,setMicVoiceRecent]=useState(()=>{
    try{ const raw=localStorage.getItem(MIC_VOICE_RECENT_KEY); return raw?(JSON.parse(raw)||[]):[]; }
    catch(_){ return []; }
  });
  const [micMusicRecent,setMicMusicRecent]=useState(()=>{
    try{ const raw=localStorage.getItem(MIC_MUSIC_RECENT_KEY); return raw?(JSON.parse(raw)||[]):[]; }
    catch(_){ return []; }
  });
  // Active recall id (single — only one mic preset active at a time).
  const micActiveRecallIdRef=useRef(null);
  // Remembers which preset the active recall came from so Back updates the
  // right store even if user toggled the preset after recall.
  const micActiveRecallPresetRef=useRef(null);
  const _micRecentAdd=useCallback((preset,chordsArr,gridSnap)=>{
    if(!chordsArr || !chordsArr.length) return;
    try{
      const compact = chordsArr.map(c=>({
        n: (c.n||[]).map(nn=>({m:nn.m, v:nn.v, durMs:nn.durMs})),
        startMs: c.startMs||0,
        durQ: c.durQ
      }));
      const entry={
        id: Date.now(),
        ts: Date.now(),
        chords: compact,
        grid: gridSnap || null,
        style: styleRef.current || null
      };
      const setter = preset==='voice' ? setMicVoiceRecent : setMicMusicRecent;
      const key    = preset==='voice' ? MIC_VOICE_RECENT_KEY : MIC_MUSIC_RECENT_KEY;
      setter(prev=>{
        const next=[entry,...prev].slice(0,3);
        try{ localStorage.setItem(key, JSON.stringify(next)); }catch(_){}
        return next;
      });
    }catch(_){}
  },[]);
  const _micRecentUpdate=useCallback((preset,id,chordsArr,gridSnap)=>{
    if(!id || !chordsArr || !chordsArr.length) return;
    try{
      const compact = chordsArr.map(c=>({
        n: (c.n||[]).map(nn=>({m:nn.m, v:nn.v, durMs:nn.durMs})),
        startMs: c.startMs||0,
        durQ: c.durQ
      }));
      const setter = preset==='voice' ? setMicVoiceRecent : setMicMusicRecent;
      const key    = preset==='voice' ? MIC_VOICE_RECENT_KEY : MIC_MUSIC_RECENT_KEY;
      setter(prev=>{
        const idx = prev.findIndex(p=>p.id===id);
        if(idx<0) return prev;
        const next = prev.slice();
        next[idx] = { ...prev[idx], ts: Date.now(), chords: compact,
                      grid: gridSnap || prev[idx].grid || null,
                      style: styleRef.current || prev[idx].style || null };
        const updated = next.splice(idx,1)[0];
        next.unshift(updated);
        try{ localStorage.setItem(key, JSON.stringify(next)); }catch(_){}
        return next;
      });
    }catch(_){}
  },[]);
  const _micRecall=useCallback((preset,entry)=>{
    if(!entry || !entry.chords || !entry.chords.length) return;
    try{
      stopAll();
      setViewMode('paint'); setOriginalImgUrl(null); setLoadedSource(null);
      setImgMoodThumb(null); setMoodFromImg(false); setForceSetup(false);
      setStructureSeedLock(null); setMoodContext(false); setCurrentMood(null);
      setVarySource(null); setComposeSource(null);
      const evts = entry.chords.map((c,i)=>{
        const n = (c.n||[]).slice().sort((a,b)=>b.m-a.m);
        return { n, startMs:c.startMs||0, durQ:c.durQ, idx:i };
      });
      const lastMs = evts[evts.length-1]?.startMs || 0;
      if(entry.grid) setGrid(entry.grid);
      setChords(evts);
      setInfo({ title: _composeRecentLabel(entry.ts), count: evts.length, dur: Math.round(lastMs/1000) });
      setDisp(evts.length); idxRef.current = evts.length;
      setPlaybackSpeed(1); playbackSpeedRef.current = 1;
      composedModeRef.current = false;
      if(entry.style){ setStyle(entry.style); }
      // Stay in the same mic preset — keep mic UI visible (like Compose recall
      // keeps the keyboard). draftOwner stays so Clear preserves mode.
      draftOwnerRef.current = preset==='voice' ? 'sing' : 'listen';
      micActiveRecallIdRef.current = entry.id;
      micActiveRecallPresetRef.current = preset;
    }catch(_){}
  },[stopAll,_composeRecentLabel]);
  const [showMicRecent,setShowMicRecent]=useState(false);

  // "Mood from image": send the loaded image to Claude (vision) → emotion → piece.
  // isSample=true means it's the built-in sample (loadSampleImgMood), which we
  // don't add to "Recently AI generated" — sample stays accessible via its own
  // "Built-in sample" button in the picker, no need to clutter recent slots.
  const composeFromImage=useCallback(async(srcUrl,isSample)=>{
    const _src=srcUrl||originalImgUrl;
    if(imgAiBusy||!_src) return;
    // NOTE: trial gate is INSIDE the try-block below, AFTER the cache check.
    // This lets free trial-exhausted users replay the built-in sample image
    // (which is always pre-cached, no AI call needed) and any other image they
    // previously paid for. Only a genuine fresh AI call triggers the paywall.
    // Show the chosen picture immediately as a FULL canvas image (not a thumb)
    // so the user sees what they picked while AI composes. The thumb appears
    // only after Play is pressed (handled at startPlay → setImgMoodThumb).
    // DO NOT setLoadedSource('image') here — that activates classic image UI
    // (Score, Atmosphere · OFF, Rows/Columns/Spiral) which doesn't belong in MFI.
    // viewMode='image' alone is enough to render originalImgUrl as the big picture.
    setOriginalImgUrl(_src); setImgMoodThumb(null);
    // Clear the previous piece title so it doesn't linger over the new image while AI composes.
    setCurrentMood(null); setInfo(null);
    setMoodContext(true); setMoodFromImg(true); setViewMode('image');
    setImgAiBusy(true); setWorking(true); setWLabel('composing…'); setWPct(20); setErr('');
    try{
      const dataUrl=await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>{ try{ if(im.naturalWidth&&im.naturalHeight) setMfiImgAspect(im.naturalWidth+' / '+im.naturalHeight); const max=384; let w=im.naturalWidth||384,h=im.naturalHeight||384; const sc=Math.min(1,max/Math.max(w,h)); w=Math.max(1,Math.round(w*sc)); h=Math.max(1,Math.round(h*sc)); const cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').drawImage(im,0,0,w,h); res(cv.toDataURL('image/jpeg',0.82)); }catch(e){ rej(e); } }; im.onerror=()=>rej(new Error('img')); im.src=_src; });
      setWPct(40);
      const b64=dataUrl.split(',')[1];
      // Body 4: cache lookup on the downsampled image's content hash. A hit means
      // we already paid for this picture (or it's the baked sample) → replay free.
      const _hash=_imgMoodHash(dataUrl);
      // Sample shortcut: the built-in sample always replays its baked mood
      // (offline + free), matched by the isSample flag — NOT by the fragile
      // browser-canvas hash. Any other image still uses the content-hash cache.
      let parsed=(isSample && typeof SAMPLE_IMGMOOD!=='undefined' && SAMPLE_IMGMOOD && SAMPLE_IMGMOOD.result)
        ? SAMPLE_IMGMOOD.result
        : _imgMoodCacheGet(_hash);
      let _fromCache=!!parsed;
      // Pro gate AFTER the cache check: cache hit = free replay even for
      // exhausted free users (sample is always cached, so it always plays).
      // Only a real, paid AI call costs a trial credit. Check WITHOUT consuming
      // (consume:false) — the credit is charged after a successful reply below.
      if(!parsed){
        const g=gateAI(1,false);
        if(!g.allow){
          // Revert the eagerly-set canvas state — no AI call will happen.
          setImgMoodThumb(null); setMoodContext(false); setMoodFromImg(false);
          setOriginalImgUrl(null); setLoadedSource(null); setViewMode('paint');
          if(g.reason==='ai_trial') setPaywallReason('ai_trial');
          return;
        }
      }
      if(!parsed){
        const _langName=({EN:'English',DE:'German',FR:'French',ES:'Spanish',PT:'Portuguese',SK:'Slovak',zh:'Simplified Chinese',zhTW:'Traditional Chinese'}[lang])||'English';
        const prompt='Look at this image and work out the EMOTION / atmosphere of the scene (e.g. joyful, calm, dramatic, melancholic, tense, eerie). Then compose a short solo piano piece that musically expresses that emotion.\nOutput ONLY a single valid JSON object - no markdown, no prose.\nSet "title" to a short phrase in '+_langName+' describing the image mood (Title Case, max 5 words).\nSchema: {"title":"...","tempo":90,"key":"C major","notes":[[pitch,durationInBeats,startBeat,velocity], ...]}\nRules: 52-80 notes; bass octaves 2-3 (at least 12 notes); melody octaves 4-6 with a recurring motif; vary durations (mix 0.25/0.5/1/2); velocity 40-115; pitches sharps only (C#4 not Db4).';
        const _host=(typeof window!=='undefined'&&window.location&&window.location.hostname)||'';
        const _isPrev=/claude\.ai$|claudeusercontent\.com$|\.claude\.com$/.test(_host);
        const _eps=_isPrev?['https://api.anthropic.com/v1/messages','/api/compose']:['/api/compose','https://api.anthropic.com/v1/messages'];
        const messages=[{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}},{type:'text',text:prompt}]}];
        let respText='',ok=false;
        for(const ep of _eps){ try{ const r=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:CLAUDE_MODEL,max_tokens:2000,messages})}); const txt=await r.text(); if(r.ok&&txt){ respText=txt; ok=true; break; } }catch(_){} }
        setWPct(75);
        if(!ok) throw new Error('AI unavailable');
        setAiDown(false); // a live AI call just succeeded
        const data=JSON.parse(respText);
        const rawTxt=(data.content||[]).map(b=>b&&b.type==='text'?b.text:'').join('');
        parsed=extractAiJson(rawTxt); if(!parsed) throw new Error('no json');
        if(!parsed.notes||!parsed.notes.length) throw new Error('no notes');
      }
      setWPct(85);
      const evts=noteArr2events(parsed.notes,parsed.tempo); if(!evts.length) throw new Error('parse');
      const title=(isSample ? (t('mfiSampleTitle')||(parsed.title&&String(parsed.title).trim())) : (parsed.title&&String(parsed.title).trim()))||'✦';
      // Seed the per-language title map with the language this piece was generated in.
      // Other languages are translated lazily on first switch (title-only, cheap).
      _mfiTitlesRef.current = isSample ? null : {[lang]: title};
      // Store fresh AI results so the next run of this image is free.
      if(!_fromCache){ try{ _imgMoodCacheSet(_hash,parsed); }catch(_){} gateAI(1, true); }
      // Body 3: make Vary work in mood-from-image. rerollSong expects notes as
      // {note,dur,beat} objects; the AI returns [pitch,dur,beat,vel] arrays — so
      // normalise here. Vary then re-tunes THIS image's piece locally (transpose
      // + colour/structure reshuffle), no new AI call, no cost.
      const _varyNotes=(parsed.notes||[]).map(n=>Array.isArray(n)
        ? {note:n[0],dur:n[1],beat:n[2],vel:n[3]}
        : {note:n.note,dur:n.dur,beat:n.beat,vel:n.vel});
      const _imgVarySource={notes:_varyNotes,tempo:parsed.tempo||90,title};
      stopAll();
      setForceSetup(false); setStructureSeedLock(null); setVarySource(_imgVarySource);
      // Prepare chords WITHOUT calling applyEvents (which would flip viewMode to
      // 'paint'). Instead set chords/grid/info manually — same shape applyEvents
      // produces — so the canvas is Play-ready while the big image stays visible.
      // startPlay will detect MFI image-view and swap to thumb + paint at Play time.
      const _events = evts.map((c,i)=>{
        if(c.durQ==null){const md=Math.max(...c.n.map(n=>n.durMs||0),0);c.durQ=md>0?snapDurQ(md/500):1;}
        if(c.n.length>1) c.n=[...c.n].sort((a,b)=>b.m-a.m);
        return {...c,idx:i};
      });
      const _grid=computeGrid(_events); const _lastMs=_events[_events.length-1]?.startMs||0;
      pixelRef.current=null;
      setGrid(_grid); setChords(_events); setDisp(0);
      setInfo({title,count:_events.length,dur:Math.round(_lastMs/1000)});
      idxRef.current=_events.length;
      setComposeMode(false); setDemoMode(false);
      setPlaybackSpeed(1); playbackSpeedRef.current=1;
      composedModeRef.current=false;
      if(introRafRef.current){cancelAnimationFrame(introRafRef.current);introRafRef.current=null;}
      setComposeSource('ai'); setCurrentMood(title); setSongQ('');
      // Remember this piece in the recent-3 strip (recipe + tiny thumb only).
      // Skip for the built-in sample: it's always reachable via its own button.
      // A shown result (freshly composed OR replayed from cache) is relevant for the
      // recent list right away — from the user's view it's just 'gave an image, got a result'.
      if(!isSample){ try{ _mfiRecentAdd(_src,{notes:parsed.notes||[],tempo:parsed.tempo||90,title}); }catch(_){} }
      try{ const bytes=encodeMidi(evts,parsed.tempo||100); setMidiBlob(new Blob([bytes],{type:'audio/midi'})); setMidiName(title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim()+'.mid'); }catch(_){}
    }catch(e){
      // Only latch AI-down for genuine availability failures (network/budget),
      // not for parse hiccups on an otherwise-reachable endpoint.
      const _net = e && (e.message==='AI unavailable' || e._aiNet);
      if(_net) setAiDown(true);
      // The preview was shown up-front (so the compose screen isn't blank); on
      // failure there's no piece, so clear it rather than leave a stranded image.
      setImgMoodThumb(null); setMoodContext(false); setMoodFromImg(false);
      // Network down vs the AI replied but the JSON was unusable (truncated /
      // malformed) — different messages so the user knows whether to check their
      // connection or just retry. Falls back to the old string if keys missing.
      const _errs=(t('errs')||{});
      setErr(_net ? (_errs.aiNet||'AI is unreachable right now.') : (_errs.aiBadResp||'The AI reply was incomplete — try again.'));
      setErrInfo(false);
    }finally{ setImgAiBusy(false); setWorking(false); setWLabel(''); setWPct(0); }
  },[imgAiBusy,originalImgUrl,lang,stopAll,applyEvents,t,_imgMoodHash,_imgMoodCacheGet,_imgMoodCacheSet,_mfiRecentAdd,gateAI]);
  // Lazy, title-only translation: when the UI language changes while a CUSTOM
  // mood-from-image piece is shown, just RE-LABEL it. If we already have the title
  // for that language, swap instantly; otherwise translate the title (a tiny,
  // async, title-only AI call — NO new composition, NO audio interruption) and
  // cache it in the map. The built-in sample is localized via its own i18n effect.
  const _mfiCustomActive = () => moodFromImg && originalImgUrl && originalImgUrl!==SAMPLE_IMAGE_MFI_B64;
  const _mfiTitleBusyRef = useRef(false);
  const _mfiTranslateTitle = useCallback(async (text, targetAppLang)=>{
    const _ln=({EN:'English',DE:'German',FR:'French',ES:'Spanish',PT:'Portuguese',SK:'Slovak',zh:'Simplified Chinese',zhTW:'Traditional Chinese'}[targetAppLang])||'English';
    const host=(typeof window!=='undefined'&&window.location&&window.location.hostname)||'';
    const isPrev=/claude\.ai$|claudeusercontent\.com$|\.claude\.com$/.test(host);
    const eps=isPrev?['https://api.anthropic.com/v1/messages','/api/compose']:['/api/compose','https://api.anthropic.com/v1/messages'];
    const messages=[{role:'user',content:[{type:'text',text:'Translate this short art-piece title into '+_ln+'. Keep it Title Case, max 5 words. Output ONLY the translated phrase \u2014 no quotes, no extra text:\n'+text}]}];
    for(const ep of eps){ try{ const r=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:CLAUDE_MODEL,max_tokens:40,messages})}); const txt=await r.text(); if(r.ok&&txt){ const d=JSON.parse(txt); const out=((d.content||[]).map(b=>b&&b.type==='text'?b.text:'').join('')).trim().replace(/^["'\s]+|["'\s]+$/g,''); if(out) return out; } }catch(_){} }
    return null;
  },[]);
  useEffect(()=>{
    if(!_mfiCustomActive()) return;
    const m=_mfiTitlesRef.current; if(!m) return;
    if(m[lang]){ if(m[lang]!==currentMood){ setCurrentMood(m[lang]); setInfo(prev=>prev?{...prev,title:m[lang]}:prev); setVarySource(prev=>prev?{...prev,title:m[lang]}:prev); } return; }
    const base=Object.values(m)[0]; if(!base || _mfiTitleBusyRef.current) return;
    const want=lang; _mfiTitleBusyRef.current=true;
    _mfiTranslateTitle(base, want).then(out=>{
      _mfiTitleBusyRef.current=false; if(!out) return;
      const map=_mfiTitlesRef.current||{}; map[want]=out; _mfiTitlesRef.current=map;
      if(want===lang && _mfiCustomActive()){ setCurrentMood(out); setInfo(prev=>prev?{...prev,title:out}:prev); setVarySource(prev=>prev?{...prev,title:out}:prev); }
    }).catch(()=>{ _mfiTitleBusyRef.current=false; });
  },[lang]); // eslint-disable-line react-hooks/exhaustive-deps
  // Standalone "mood from image" mode: pick a picture, AI reads its emotion and
  // composes a mood on the canvas; a small thumbnail of the source sits on top.
  const loadImgMood=useCallback(e=>{
    const file=e.target.files[0]; if(!file) return; e.target.value='';
    // Close the picker the moment a file is chosen. Other loaders (loadMidi/
    // loadAudio/loadScore/loadImage) already do this; loadImgMood didn't, so the
    // picker modal stayed up over the image while the AI composed — confusing.
    // The hidden <input> has already fired its change event here, so closing the
    // modal no longer risks cancelling the file dialog.
    setPickMode(null);
    if(draftOwnerRef.current){ stashDraft(draftOwnerRef.current); draftOwnerRef.current=null; }
    const r=new FileReader();
    r.onerror=()=>{ setErr(((t('errs')||{}).imgRead)||'Could not read image'); setErrInfo(false); };
    r.onload=evt=>{ composeFromImage(evt.target.result); };
    r.readAsDataURL(file);
  },[composeFromImage,stashDraft,t]);

  // Built-in sample for the "mood from image" mode — mirrors loadSampleImage but
  // routes the embedded picture through composeFromImage (AI mood) instead of the
  // pixel→notes pipeline. The sample's AI result is intended to be baked offline
  // (see composeFromImage sample-cache) so it stays free + works without a network.
  const loadSampleImgMood=useCallback(()=>{
    if(draftOwnerRef.current){ stashDraft(draftOwnerRef.current); draftOwnerRef.current=null; }
    composeFromImage(SAMPLE_IMAGE_MFI_B64, true);  // isSample=true → skip recent
  },[composeFromImage,stashDraft]);

  // MusicXML upload — exact, structured score data from MuseScore / Finale / Dorico.
  // Far more accurate than PDF OMR because every note's pitch, octave, accidental, and rhythm is encoded.
  // Accepts both uncompressed .musicxml/.xml AND compressed .mxl (zip-deflated).
  // accept="*/*" used because iOS file picker doesn't recognize .mxl UTI and would dim it.
  const loadMusicXml=useCallback(async e=>{
    const file=e.target.files[0];if(!file)return;e.target.value='';if(micPainting)stopMicPainting();if(micListening)stopMicListening();if(composeMode)setComposeMode(false);if(draftOwnerRef.current){stashDraft(draftOwnerRef.current);draftOwnerRef.current=null;}setPickMode(null);setMicArmed(false);setForceSetup(false);setCurrentMood(null);setVarySource(null);setSongQ('');setMidiBlob(null);setMidiName('');setAudioBlob(null);setAudioName('');audioBlobRef.current=null;setLoadedSource(null);
    setWorking(true);setWLabel('reading score');setWPct(20);setErr('');setErrInfo(false);stopAll();wipeCanvasNow();
    const myToken=loadTokenRef.current;
    try{
      const buf=await file.arrayBuffer();
      if(loadTokenRef.current!==myToken)return;
      const head=new Uint8Array(buf.slice(0,4));
      const name=(file.name||'').toLowerCase();
      // Quick sniff: ZIP magic 'PK' = .mxl; '<' = plain XML; 'MThd' = MIDI (user error)
      const isZip=head[0]===0x50&&head[1]===0x4b;
      const isXml=head[0]===0x3c||(head[0]===0xef&&head[1]===0xbb&&head[2]===0xbf); // '<' or UTF-8 BOM
      const isMidi=head[0]===0x4d&&head[1]===0x54&&head[2]===0x68&&head[3]===0x64;
      if(isMidi){setErr(t('errs').looksMidi);setErrInfo(true);return;}
      if(!isZip&&!isXml){
        setErr(t('errs').notXml);
        setErrInfo(true);return;
      }
      let xmlText;
      if(isZip){
        setWLabel('decompressing .mxl');setWPct(40);
        xmlText=await mxlToXml(buf);
      }else{
        xmlText=new TextDecoder('utf-8').decode(buf);
      }
      setWLabel('parsing notes');setWPct(70);
      const evts=parseMusicXml(xmlText);
      if(loadTokenRef.current!==myToken)return;
      if(!evts.length){setErr(t('errs').noNotesXml);setErrInfo(false);return;}
      const sName=file.name.replace(/\.[^.]+$/,'');
      setScoreName(sName);
      setCompositionName(sName);
      applyEvents(evts,sName);
      setLoadedSource('score');setPickMode(null);
    }catch(e){if(loadTokenRef.current===myToken){setErr('Score: '+e.message);setErrInfo(false);}}
    finally{if(loadTokenRef.current===myToken){setWorking(false);setWLabel('');setWPct(0);}}
  },[stopAll,applyEvents,t,wipeCanvasNow]);

  // Built-in sample loaders — embedded files, decoded through the real pipelines
  const loadSampleMidi=useCallback(()=>{
    try{
      const arrayBuffer=b64ToArrayBuffer(SAMPLE_MIDI_B64);
      const{raw,div,temps,skipped}=parseMidi(arrayBuffer);
      const evts=toChords(raw,div,temps);
      if(!evts.length){setErr(t('errs').noNotesMidi);setErrInfo(false);return;}
      stopAll();wipeCanvasNow();applyEvents(evts,SAMPLE_MIDI_NAME);
      setLoadedSource('midi');
      if(skipped.length){setErr(`Loaded with warnings: track${skipped.length>1?'s':''} ${skipped.join(', ')} skipped (corrupt data).`);setErrInfo(true);}
    }catch(e){setErr('Sample MIDI: '+e.message);setErrInfo(false);}
  },[stopAll,applyEvents,wipeCanvasNow]);

  // Trimmed sample loader (used by the v3 onboarding). Same pipeline as
  // loadSampleMidi but slices the chord events to the first `maxMs` ms so the
  // first-time user gets a digestible taste (~30 s) instead of the full 3:38
  // piece. Returns nothing — apply Events sets all the relevant state.
  const loadSampleMidiTrimmed=useCallback((maxMs)=>{
    try{
      const arrayBuffer=b64ToArrayBuffer(SAMPLE_MIDI_B64);
      const{raw,div,temps,skipped}=parseMidi(arrayBuffer);
      const allEvts=toChords(raw,div,temps);
      if(!allEvts.length){setErr(t('errs').noNotesMidi);setErrInfo(false);return;}
      const evts = allEvts.filter(e => (e.startMs||0) < maxMs);
      const finalEvts = evts.length > 0 ? evts : allEvts.slice(0, 32);
      stopAll();wipeCanvasNow();applyEvents(finalEvts,SAMPLE_MIDI_NAME);
      setLoadedSource('midi');
      if(skipped.length){setErr(`Loaded with warnings: track${skipped.length>1?'s':''} ${skipped.join(', ')} skipped (corrupt data).`);setErrInfo(true);}
    }catch(e){setErr('Sample MIDI: '+e.message);setErrInfo(false);}
  },[stopAll,applyEvents,wipeCanvasNow]);

  const loadSampleAudio=useCallback(async()=>{
    setWorking(true);setWLabel('decoding sample audio');setWPct(0);setErr('');setErrInfo(false);stopAll();wipeCanvasNow();
    const myToken=loadTokenRef.current;
    try{
      const arrayBuffer=b64ToArrayBuffer(SAMPLE_AUDIO_B64);
      const blob=new Blob([arrayBuffer],{type:'audio/mpeg'});
      const AC=window.AudioContext||window.webkitAudioContext;
      const ac=new AC();
      const audioBuf=await ac.decodeAudioData(arrayBuffer.slice(0));
      ac.close();
      if(loadTokenRef.current!==myToken)return;
      audioPCMRef.current=audioBuf;
      setWLabel(audioBuf.duration>90?'transcribing sample · this may take a minute':'transcribing sample');
      const evts=await transcribeAudio(audioBuf,p=>{setWPct(Math.round(p*100));});
      if(loadTokenRef.current!==myToken)return;
      if(!evts.length){setErr(t('errs').noNotesAudio);setErrInfo(false);return;}
      setAudioBlobAndRef(blob);setAudioName('Liebestraum No.3 — Liszt.mp3');
      applyEvents(evts,SAMPLE_AUDIO_NAME);
      setViewMode('audio');viewModeRef.current='audio';
      setLoadedSource('audio');setPickMode(null);
    }catch(e){if(loadTokenRef.current===myToken){setErr('Sample audio: '+e.message);setErrInfo(false);}}
    finally{if(loadTokenRef.current===myToken){setWorking(false);setWLabel('');setWPct(0);}}
  },[stopAll,applyEvents,t,wipeCanvasNow]);


  const loadSampleScore=useCallback(async()=>{
    setWorking(true);setWLabel('reading sample score');setWPct(20);setErr('');setErrInfo(false);stopAll();wipeCanvasNow();
    const myToken=loadTokenRef.current;
    try{
      const arrayBuffer=b64ToArrayBuffer(SAMPLE_SCORE_B64);
      setWPct(50);
      const xmlText=await mxlToXml(arrayBuffer);
      if(loadTokenRef.current!==myToken)return;
      setWPct(80);
      const evts=parseMusicXml(xmlText);
      if(!evts.length){setErr(t('errs').noNotesXml);setErrInfo(false);return;}
      applyEvents(evts,SAMPLE_SCORE_NAME);
      setLoadedSource('score');setPickMode(null);
    }catch(e){if(loadTokenRef.current===myToken){setErr('Sample score: '+e.message);setErrInfo(false);}}
    finally{if(loadTokenRef.current===myToken){setWorking(false);setWLabel('');setWPct(0);}}
  },[stopAll,applyEvents,t,wipeCanvasNow]);


  const aiMidi=useCallback((title)=>{
    // NOTE: do NOT guard on `playing`/`anim` here. aiMidi calls stopAll() below
    // and is meant to interrupt the current piece (e.g. switching moods while
    // one plays). Guarding on `playing` caused a race: callers stopAll() then
    // call aiMidi() in the same tick, but React hasn't flushed playing=false
    // yet, so aiMidi saw playing===true and bailed — the new mood never loaded,
    // the old title stayed on the canvas, and only a second attempt worked.
    if(!title||working)return;
    setSongQ(title);setErr('');setErrInfo(false);setMidiBlob(null);setAudioBlob(null);setAudioName('');audioBlobRef.current=null;stopAll();
    const song=findSong(title);
    if(!song){setErr(t('errs').songNotFound);return;}
    const evts=noteArr2events(song.notes,song.tempo);
    if(!evts.length){setErr(t('errs').noNotesGeneric);return;}
    const dispTitle=((t('moodNames')||{})[song.mood])||((t('moodNames')||{})[title])||song.title;
    applyEvents(evts,dispTitle); setComposeSource('crafted');
    // Set varySource so Vary works on crafted (library) moods too — without
    // this, the Vary button stays disabled because !varySource. AI and offline
    // mood paths already set this; the crafted-library branch was the gap.
    setVarySource(song);
    const bytes=encodeMidi(evts,song.tempo||120);
    setMidiBlob(new Blob([bytes],{type:'audio/midi'}));
    setMidiName(song.title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim()+'.mid');
  },[working,stopAll,applyEvents,t]);

  // Free-text mood: type anything ("zúrivá", "nostalgic storm") and get a track.
  // Hybrid: an exact match against our crafted mood library plays the hand-crafted piece;
  // anything else is synthesised on the spot by moodToSong (offline, no API).
  const aiMoodFromText=useCallback((raw)=>{
    const text=(raw||'').trim(); if(!text||working) return;
    const known=findSong(text.toLowerCase());
    if(known){ aiMidi(text.toLowerCase()); return; }   // one of the 15 crafted moods
    // Unknown mood → compose it with Claude for the richest result. aiCompose is
    // declared later, so we reach it through a ref. If the API is unavailable
    // (no endpoint / offline / error), aiCompose itself falls back gracefully;
    // but to be safe we also keep the offline generator as a hard fallback.
    if(aiComposeRef.current){
      setSongQ(text);
      aiComposeRef.current(text);
      return;
    }
    // Hard fallback: offline procedural generator (no network).
    const song=moodToSong(text);
    if(!song){ setErr(t('errs').songNotFound); return; }
    setSongQ(text);setErr('');setErrInfo(false);setMidiBlob(null);setAudioBlob(null);setAudioName('');audioBlobRef.current=null;stopAll();
    setVarySource(song);
    const evts=noteArr2events(song.notes,song.tempo);
    if(!evts.length){ setErr(t('errs').noNotesGeneric); return; }
    applyEvents(evts,song.title); setComposeSource('offline');
    const bytes=encodeMidi(evts,song.tempo||100);
    setMidiBlob(new Blob([bytes],{type:'audio/midi'}));
    setMidiName(song.title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim()+'.mid');
  },[working,stopAll,applyEvents,aiMidi,t]);

  const aiCompose=useCallback(async(overrideMood)=>{
    const title=((typeof overrideMood==='string'&&overrideMood)?overrideMood:songQ).trim();
    if(!title||busy||composedModeRef.current)return;
    if(typeof overrideMood==='string'&&overrideMood)setSongQ(overrideMood);
    // Cache hit: same mood phrase + language already composed by AI → replay the
    // stored piece, no new AI call, no "composing…" spinner. This is what makes
    // re-entering an unchanged mood (Setup → Canvas, or retyping it) instant +
    // free, and keeps the exact same notes instead of generating a new variant.
    const _ckey=title.toLowerCase()+'|'+lang;
    { const _c=aiComposeCacheRef.current;
      if(_c && _c.key===_ckey && _c.parsed && _c.parsed.notes && _c.parsed.notes.length){
        const parsed=_c.parsed;
        const evts=noteArr2events(parsed.notes,parsed.tempo);
        if(evts.length){
          stopAll();
          const _varyNotes=(parsed.notes||[]).map(n=>Array.isArray(n)?{note:n[0],dur:n[1],beat:n[2],vel:n[3]}:{note:n.note,dur:n.dur,beat:n.beat,vel:n.vel});
          setVarySource({notes:_varyNotes,tempo:parsed.tempo||90,title:(parsed.title&&String(parsed.title).trim())||title});
          const _typed=(title||'').trim(); const _dispT=(parsed.title&&String(parsed.title).trim())||(_typed?_typed.charAt(0).toUpperCase()+_typed.slice(1):_typed);
          applyEvents(evts,_dispT); setComposeSource('ai'); setErr(''); setErrInfo(false);
          // Remember in recent (cache hit also counts — moves entry to front).
          try{ _aiComposeRecentAdd(_dispT, parsed.notes||[], parsed.tempo||90); }catch(_){}
          try{ const bytes=encodeMidi(evts,parsed.tempo||120); setMidiBlob(new Blob([bytes],{type:'audio/midi'})); setMidiName((parsed.title||title).replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim()+'.mid'); }catch(_){}
          return;
        }
      }
    }
    // Pro gate: free tier gets a limited number of heavy AI compositions.
    // Cache hits above already returned free; this point = a real AI call.
    // Check WITHOUT consuming (consume:false) — we charge the credit only after
    // a successful AI reply below, so a failed call that falls back to the
    // offline generator doesn't burn a trial. Mirrors mood-from-image / atmosphere.
    { const g=gateAI(1,false); if(!g.allow){ if(g.reason==='ai_trial') setPaywallReason('ai_trial'); return; } }
    setWorking(true);setWLabel('composing…');setWPct(20);setErr('');setErrInfo(false);setMidiBlob(null);stopAll();wipeCanvasNow();
    try{
      const _langName={EN:'English',DE:'German',FR:'French',ES:'Spanish',PT:'Portuguese',SK:'Slovak',zh:'Simplified Chinese',zhTW:'Traditional Chinese'}[lang]||'English';
      const prompt=`Compose a short expressive solo piano piece inspired by this mood phrase: "${title.slice(0,80)}".
The phrase may be written in ANY language and may be colloquial, slang or idiomatic. FIRST translate it and work out the genuine emotion it expresses (e.g. anger, irritation, joy, calm, sadness, longing) — do NOT read it word-by-word and do NOT assume it is English. THEN compose music that fits that real emotion.
Set the "title" field to a short, natural translation of the phrase into ${_langName} that captures its meaning (Title Case, max 5 words).
Output ONLY a single valid JSON object — no markdown, no prose, no explanation.
Schema: {"title":"...","tempo":90,"key":"C major","notes":[[pitch,durationInBeats,startBeat,velocity],...]}
Each note: [pitch, durationInBeats, startBeat, velocity]. Same startBeat = chord. velocity 1–127.

Composition rules:
- 52–80 notes total
- Pick a specific key (e.g. "D minor", "F major", "B minor") that fits the mood — stay mostly diatonic, use chromatic passing tones sparingly
- Structure: opening (establish key + motif, sparse), development (harmonically richer, busiest texture), close (return to opening motif, quieter)
- Bass register (octaves 2–3): provide harmonic grounding — roots, fifths, or walking bass. At least 12 bass notes
- Melody (octaves 4–6): singable, with a recognisable motif that recurs
- Dynamics through velocity: opening ~55–70, development ~80–110, close ~45–65
- Vary note durations: mix 0.25, 0.5, 1, 2 beat values — avoid uniform rhythm
- Pitches: use C4/F#3/Bb5 style with octave number, sharps only (no flats in pitch names — use C#4 not Db4)`;
      setWPct(40);
      // Endpoint selection: in the Claude artifact preview, calls go straight to
      // Anthropic (their sandbox proxies it). Anywhere else — e.g. the Vercel
      // deploy — that direct call is blocked by CORS and would leak the key, so
      // we route through our own serverless function at /api/compose, which holds
      // the key server-side (set ANTHROPIC_API_KEY in Vercel env vars).
      // Try BOTH endpoints so AI works everywhere: in the Claude artifact preview
      // the sandbox proxies direct Anthropic calls (no key needed); on the Vercel
      // deploy our /api/compose serverless function holds the key. We attempt them
      // in the most-likely order for the current host, falling through on failure.
      const _host = (typeof window!=='undefined' && window.location && window.location.hostname) || '';
      const _isArtifactPreview = /claude\.ai$|claudeusercontent\.com$|\.claude\.com$/.test(_host);
      const _endpoints = _isArtifactPreview
        ? ['https://api.anthropic.com/v1/messages','/api/compose']
        : ['/api/compose','https://api.anthropic.com/v1/messages'];
      let resp=null, respText='', lastErr=null;
      for(const _ep of _endpoints){
        try{
          const r=await fetch(_ep,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({model:CLAUDE_MODEL,max_tokens:2000,messages:[{role:'user',content:prompt}]})
          });
          const txt=await r.text();
          if(r.ok && txt){ resp=r; respText=txt; break; }
          lastErr=new Error(`API ${r.status}: ${txt.slice(0,160)}`);
        }catch(err){ lastErr=err; }
      }
      setWPct(75);
      if(!resp){ const _netErr=lastErr||new Error('compose endpoints unavailable'); _netErr._aiNet=true; throw _netErr; }
      setAiDown(false); // a live AI call just succeeded
      let data;
      try{data=JSON.parse(respText);}catch(_){throw new Error(`Response not JSON: ${respText.slice(0,200)}`);}
      const raw=(data.content||[]).map(b=>b.type==='text'?b.text:'').join('');
      if(!raw)throw new Error(`Empty content. Full resp: ${respText.slice(0,200)}`);
      let parsed = extractAiJson(raw);
      if(!parsed?.notes?.length)throw new Error(`No notes in: ${raw.slice(0,200)}`);
      // Cache this AI result so re-entering the same mood replays it for free.
      aiComposeCacheRef.current = { key:_ckey, parsed };
      // Successful fresh AI composition — charge the trial now (free tier only;
      // no-op for Pro). Reaching here means a real AI reply parsed OK.
      gateAI(1, true);
      const evts=noteArr2events(parsed.notes,parsed.tempo);
      if(!evts.length)throw new Error('Could not parse composition');
      // Set varySource (normalised note objects) so Vary can re-tune THIS piece
      // locally — matches the mood-from-image path; the AI branch was missing it.
      { const _varyNotes=(parsed.notes||[]).map(n=>Array.isArray(n)?{note:n[0],dur:n[1],beat:n[2],vel:n[3]}:{note:n.note,dur:n.dur,beat:n.beat,vel:n.vel});
        setVarySource({notes:_varyNotes,tempo:parsed.tempo||90,title:(parsed.title&&String(parsed.title).trim())||title}); }
      const _typed=(title||'').trim(); const _dispT=(parsed.title&&String(parsed.title).trim())||(_typed?_typed.charAt(0).toUpperCase()+_typed.slice(1):_typed); applyEvents(evts,_dispT); setComposeSource('ai');
      // Remember this AI-generated mood in the recent-3 list (text path only —
      // moodFromImg goes through composeFromImage which already adds to mfiRecent).
      try{ _aiComposeRecentAdd(_dispT, parsed.notes||[], parsed.tempo||90); }catch(_){}
      const bytes=encodeMidi(evts,parsed.tempo||120);
      setMidiBlob(new Blob([bytes],{type:'audio/midi'}));
      setMidiName((parsed.title||title).replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim()+'.mid');
    }catch(e){
      // API unavailable (no endpoint / offline / error). Fall back to the offline
      // procedural generator so the user still gets a piece for their mood.
      if(e&&e._aiNet) setAiDown(true); // only network/budget failures latch AI down
      const fb=moodToSong(title);
      if(fb){
        const fevts=noteArr2events(fb.notes,fb.tempo);
        if(fevts.length){
          setVarySource(fb);
          applyEvents(fevts,fb.title); setComposeSource('offline');
          const fbytes=encodeMidi(fevts,fb.tempo||100);
          setMidiBlob(new Blob([fbytes],{type:'audio/midi'}));
          setMidiName(fb.title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim()+'.mid');
          setErr('');setErrInfo(false);
        } else { setErr(e.message||'Compose failed');setErrInfo(false); }
      } else { setErr(e.message||'Compose failed');setErrInfo(false); }
    }
    finally{setWorking(false);setWLabel('');setWPct(0);}
  },[songQ,busy,stopAll,applyEvents,wipeCanvasNow,lang,gateAI]);

  // Bridge ref so aiMoodFromText (declared earlier) can invoke aiCompose.
  useEffect(()=>{ aiComposeRef.current=aiCompose; },[aiCompose]);



  const loadImage=useCallback(e=>{
    const file=e.target.files[0];if(!file)return;e.target.value='';setPickMode(null);
    if(micPainting)stopMicPainting();if(micListening)stopMicListening();if(composeMode)setComposeMode(false);
    if(draftOwnerRef.current) stashDraft(draftOwnerRef.current);
    draftOwnerRef.current=null;
    setMicArmed(false);setForceSetup(false);setCurrentMood(null);setVarySource(null);setSongQ('');setMidiBlob(null);setMidiName('');setAudioBlob(null);setAudioName('');audioBlobRef.current=null;setLoadedSource(null);
    stopAll();wipeCanvasNow();
    const myToken=loadTokenRef.current; // captured after stopAll's bump
    const r=new FileReader();
    r.onerror=()=>{if(loadTokenRef.current===myToken){setErr(t('errs').imgRead);setErrInfo(false);}};
    r.onload=evt=>{
      if(loadTokenRef.current!==myToken)return; // user left mid-read — abandon
      const img=new Image();
      img.onerror=()=>{if(loadTokenRef.current===myToken){setErr(t('errs').imgDecode);setErrInfo(false);}};
      img.onload=()=>{
        if(loadTokenRef.current!==myToken)return; // user left mid-decode — abandon
        try{
          const nc=192;
          const availW=window.innerWidth||480;
          const BW=Math.max(1,Math.floor(availW/nc));
          const BH=Math.max(2,Math.round(BW*PHI));
          const imgRatio=img.naturalHeight/Math.max(1,img.naturalWidth);
          const nr=Math.max(60,Math.min(400,Math.round(nc*imgRatio*BW/BH)));
          const ofc=document.createElement('canvas');ofc.width=nc;ofc.height=nr;
          const ctx=ofc.getContext('2d');ctx.drawImage(img,0,0,nc,nr);
          const raw=ctx.getImageData(0,0,nc,nr).data;
          const px=[];
          for(let row=0;row<nr;row++)for(let col=0;col<nc;col++){const i=(row*nc+col)*4;px.push({r:raw[i],g:raw[i+1],b:raw[i+2]});}
          // APP-CHOSEN COLOUR MODE: decide the reading from how much of the image
          // is GENUINELY colourful, not from average saturation. Average is fooled
          // by cream/off-white fields (a Mondrian reads ~33% avg sat because pale
          // warm whites carry a deceptively high HSL saturation), so instead we
          // count the fraction of pixels that are vividly coloured — saturation
          // above ~25% at a non-pale lightness. A near-monochrome image (Guernica,
          // Mondrian's cream+black, ink, sepia) has almost none ⇒ B/W; a colourful
          // painting (Chagall, Monet) has plenty ⇒ Color.
          let vivid=0, considered=0;
          for(const p of px){
            const[,ss,ll]=toHsl(p.r,p.g,p.b);
            considered++;
            if(ss>25 && ll<85 && ll>6) vivid++;        // truly saturated, not pale/near-black
          }
          const vividPct = considered ? (vivid/considered)*100 : 0;
          const autoMode = vividPct < 5 ? 'bw' : 'harmony';   // <5% colour ⇒ monochrome reading
          appModeRef.current = autoMode;             // remember the app's pick for Custom→back
          setSetupNoSel(false);                      // a fresh image re-enables the app's colour pick
          // Keep a manual Custom choice if the user already had it; otherwise apply
          // the app's pick. (spectral/other non-image modes fall back to autoMode.)
          const startMode = mode==='custom' ? 'custom' : autoMode;
          if(startMode!==mode) setMode(startMode);
          pixelRef.current={nc,nr,px,lastMode:startMode,colStep:4};
          // Process pixels into events using the chosen mode's hue→pitch table.
          // B/W uses harmony's hue table — same music as harmony, but the canvas
          // renders monochrome because gc() returns greys in bw mode.
          // In custom mode we attach two extra hints for the Custom gate: the
          // saturation of each swatch (so the gate can ignore the meaningless hue
          // of grey swatches when matching colour pixels), and whether ANY swatch
          // is neutral (so achromatic image pixels are allowed to sound).
          const hueTable = startMode==='custom'
            ? Object.assign(activePalette.map(hex => { const [r,g,b]=hexToRgb(hex); return toHsl(r,g,b)[0]; }),
                            { __sats: activePalette.map(hex=>{ const [r,g,b]=hexToRgb(hex); return toHsl(r,g,b)[1]; }),
                              __hasNeutral: activePalette.some(hex=>{ const [r,g,b]=hexToRgb(hex); return toHsl(r,g,b)[1] < 12; }) })
            : COF;                                     // harmony & bw both read via COF
          const evts=pixelsToImageEvents(px,nc,nr,hueTable,startMode,imgDirRef.current);
          if(loadTokenRef.current!==myToken)return; // user left during processing — abandon
          if(!evts || !evts.length){setErr(t('errs').imgNoNotes);setErrInfo(false);setPickMode(null);return;}
          // Explicit canvas clear — when loading consecutive images, both
          // downsample to 192×120 so canvas.width/height don't change, which
          // means the browser does NOT auto-reset the canvas content. Without
          // this, the previous image's mosaic stays on the canvas and bleeds
          // through the new <img> via mix-blend-mode: screen.
          const cv=canvasRef.current;
          if(cv){try{cv.getContext('2d').clearRect(0,0,cv.width,cv.height);}catch(_){}}
          setComposeMode(false);
          setDemoMode(false);
          setOriginalImgUrl(evt.target.result);
          setGrid({N:nc,BW,BH,CW:nc*BW,CH:nr*BH});setViewMode('image');
          setChords(evts);setDisp(evts.length);setPlayedOnce(false);
          // Real duration now varies per image (tempo scales with the painting's
          // energy), so derive it from the last event's timing rather than the
          // old fixed 2:00 constant.
          const lastEv=evts[evts.length-1];
          const realDurMs=lastEv ? (lastEv.startMs + (lastEv.n?.[0]?.durMs||0)) : IMG_TARGET_MS;
          setInfo({title:file.name.replace(/\.[^.]+$/,''),count:evts.length,dur:Math.round(realDurMs/1000)});
          idxRef.current=evts.length;setStamp(s=>s+1);
          setPlaybackSpeed(1);playbackSpeedRef.current=1;
          setAtmoOn(false);setAtmoMood(null);
          setLoadedSource('image');
          setPickMode(null);
        }catch(e){if(loadTokenRef.current===myToken){setErr('Image: '+e.message);setErrInfo(false);}}
      };
      img.src=evt.target.result;
    };
    r.readAsDataURL(file);
  },[mode,stopAll,stashDraft,t,wipeCanvasNow]);

  // When mode is toggled while an image is loaded, re-process pixels through the new
  // hue→pitch table (HARMONY: COF / SPECTRAL: SPEC_HUE / CUSTOM: user palette).
  useEffect(()=>{
    if(viewMode!=='image'||!pixelRef.current)return;
    // Use mode+palette+direction signature so swapping individual swatches in
    // custom mode, OR changing the reading direction, forces a re-transcribe.
    const sig = mode + '|' + imgDir + ((atmoOn&&atmoMood) ? '|atmo'+atmoMood.v.toFixed(2)+'_'+atmoMood.e.toFixed(2) : '') + (mode==='custom' ? '|' + activePalette.join(',') : '');
    if(pixelRef.current.lastSig===sig)return;
    pixelRef.current.lastSig=sig;
    pixelRef.current.lastMode=mode;
    const{nc,nr,px}=pixelRef.current;
    const hueTable = mode==='custom'
      ? Object.assign(activePalette.map(hex => { const [r,g,b]=hexToRgb(hex); return toHsl(r,g,b)[0]; }),
                      { __sats: activePalette.map(hex=>{ const [r,g,b]=hexToRgb(hex); return toHsl(r,g,b)[1]; }),
                        __hasNeutral: activePalette.some(hex=>{ const [r,g,b]=hexToRgb(hex); return toHsl(r,g,b)[1] < 12; }) })
      : (mode==='spectral'?SPEC_HUE:COF);
    const _evtsLit=pixelsToImageEvents(px,nc,nr,hueTable,mode,imgDirRef.current);
    const evts=(atmoOn&&atmoMood)?_atmoTransform(_evtsLit,atmoMood):_evtsLit;
    // Changing the colour mode re-transcribes the SAME painting through a new
    // hue→pitch table, so the notes change but the structure/length do not. If a
    // playback is in progress we must NOT stop it — like MIDI and live drawing,
    // the colour change should flow on seamlessly from the current position, just
    // in different tones. We capture where we are, swap in the new chords, and
    // resume playback from that same index. Only when stopped do we reset to the
    // top (ready to play from the start in the new colour).
    if(playingRef.current){
      // Playback loop now reads chords live from chordsRef each step, so swapping
      // in the re-transcribed notes is enough — the very next step plays the new
      // colour's tones from the same position. No restart, no stutter.
      setChords(evts);chordsRef.current=evts;
      setStamp(s=>s+1);
    }else if(holdPausedRef.current){
      // Paused mid-piece: swap in the new colour's notes but KEEP the position so
      // pressing Resume continues from where it was, now in the new tones. Don't
      // restart playback (still paused) and don't reset disp to the end.
      const keep=Math.min(dispRef.current||0, evts.length);
      setChords(evts);chordsRef.current=evts;
      setDisp(keep);setStamp(s=>s+1);
      resumeFromRef.current=keep;
    }else{
      stopAll();
      setChords(evts);chordsRef.current=evts;
      setDisp(evts.length);
      idxRef.current=evts.length;setStamp(s=>s+1);
    }
  },[mode,viewMode,stopAll,activePalette,imgDir,atmoOn,atmoMood]);

  const loadSampleImage=useCallback(()=>{
    try{
      // Strip "data:image/jpeg;base64," prefix → decode → Blob → File → synthetic event
      const b64=SAMPLE_IMAGE_B64.split(',')[1];
      const buffer=b64ToArrayBuffer(b64);
      const blob=new Blob([buffer],{type:'image/jpeg'});
      const file=new File([blob],'sample-image.jpg',{type:'image/jpeg'});
      const fakeEvent={target:{files:[file],value:''}};
      loadImage(fakeEvent);
    }catch(e){setErr('Sample image: '+e.message);setErrInfo(false);}
  },[loadImage]);
  // Re-enter image mode from a stashed data-URL (the "← image" button after an
  // image→atmosphere jump). Rebuilds a File and re-runs loadImage.
  const returnToImage=useCallback((url)=>{
    const u=url||imgReturnUrl; if(!u) return;
    try{
      const mime=(u.match(/^data:([^;]+);/)||[])[1]||'image/jpeg';
      const b64=u.split(',')[1]; const buffer=b64ToArrayBuffer(b64);
      const blob=new Blob([buffer],{type:mime}); const ext=(mime.split('/')[1]||'jpg').replace('jpeg','jpg');
      const file=new File([blob],'image.'+ext,{type:mime});
      setImgReturnUrl(null);
      loadImage({target:{files:[file],value:''}});
    }catch(e){ setErr('Image: '+((e&&e.message)||'restore failed')); setErrInfo(false); }
  },[imgReturnUrl,loadImage]);
  // Read the image's mood via AI vision (separate, paid step). Stores {v,e} and
  // turns the atmosphere effect ON; the on/off toggle then re-uses it for free.
  const detectAtmosphere=useCallback(async()=>{
    if(atmoBusy||!originalImgUrl) return;
    // Atmosphere is an Anthropic API call (image → emotion analysis), so it
    // counts toward the free trial pool. Check the gate WITHOUT consuming yet
    // (consume:false) — we only charge the 0.5 credit after a successful reply,
    // so a failed/zero-result call doesn't burn a trial.
    { const g=gateAI(0.5,false); if(!g.allow){ if(g.reason==='ai_trial') setPaywallReason('ai_trial'); return; } }
    setAtmoBusy(true); setErr('');
    try{
      const dataUrl=await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>{ try{ const max=320; let w=im.naturalWidth||320,h=im.naturalHeight||320; const sc=Math.min(1,max/Math.max(w,h)); w=Math.max(1,Math.round(w*sc)); h=Math.max(1,Math.round(h*sc)); const cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').drawImage(im,0,0,w,h); res(cv.toDataURL('image/jpeg',0.8)); }catch(er){ rej(er); } }; im.onerror=()=>rej(new Error('img')); im.src=originalImgUrl; });
      const b64=dataUrl.split(',')[1];
      const _langName=({EN:'English',DE:'German',FR:'French',ES:'Spanish',PT:'Portuguese',SK:'Slovak',zh:'Simplified Chinese',zhTW:'Traditional Chinese'}[lang])||'English';
      const prompt='Look at this image and judge the EMOTION / atmosphere of the scene. Output ONLY a single JSON object, no prose: {"valence":NUMBER,"energy":NUMBER,"title":"..."} where valence is -1 (sad/dark) to 1 (happy/bright), energy is 0 (calm/still) to 1 (intense/dramatic), and title is a short mood phrase in '+_langName+' (max 4 words, Title Case).';
      const _host=(typeof window!=='undefined'&&window.location&&window.location.hostname)||'';
      const _isPrev=/claude\.ai$|claudeusercontent\.com$|\.claude\.com$/.test(_host);
      const _eps=_isPrev?['https://api.anthropic.com/v1/messages','/api/compose']:['/api/compose','https://api.anthropic.com/v1/messages'];
      const messages=[{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}},{type:'text',text:prompt}]}];
      let respText='',ok=false;
      for(const ep of _eps){ try{ const r=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:CLAUDE_MODEL,max_tokens:200,messages})}); const txt=await r.text(); if(r.ok&&txt){ respText=txt; ok=true; break; } }catch(_){} }
      if(!ok) throw new Error('AI unavailable');
      setAiDown(false); // a live AI call just succeeded
      const data=JSON.parse(respText);
      const rawTxt=(data.content||[]).map(b=>b&&b.type==='text'?b.text:'').join('');
      const parsed=extractAiJson(rawTxt); if(!parsed) throw new Error('no json');
      const vv=Math.max(-1,Math.min(1,Number(parsed.valence)));
      const ee=Math.max(0,Math.min(1,Number(parsed.energy)));
      if(isNaN(vv)||isNaN(ee)) throw new Error('bad');
      setAtmoMood({v:vv,e:ee,root:0,title:(parsed.title&&String(parsed.title).trim())||''});
      setAtmoOn(true);
      // Successful fresh AI call — now charge the trial (free tier only).
      // gateAI with consume:true applies the 0.5 credit through the same path;
      // for Pro it's a no-op. Toggling atmo on/off later uses cached atmoMood.
      gateAI(0.5, true);
    }catch(e){ const _net=e&&(e.message==='AI unavailable'||e._aiNet); if(_net) setAiDown(true); const _errs=(t('errs')||{}); setErr(_net?(_errs.aiNet||'AI is unreachable right now.'):(_errs.aiBadResp||'The AI reply was incomplete — try again.')); setErrInfo(false); }
    finally{ setAtmoBusy(false); }
  },[atmoBusy,originalImgUrl,lang,t,isPro,gateAI]);

  const paintSong=()=>{
    const q=songQ.trim().toLowerCase();if(!q||busy)return;
    let best=null,bs=0;
    for(const s of SONGS)for(const k of s.keys){
      const sc=q===k?100:q.includes(k)?90:k.includes(q)?80:k.split(' ').some(w=>w.length>3&&q.includes(w))?50:q.split(' ').some(w=>w.length>3&&k.includes(w))?40:0;
      if(sc>bs){bs=sc;best=s;}
    }
    if(!best||bs<30){setErr(t('errs').notInLibrary);setErrInfo(true);return;}
    setErr('');
    const sorted=[...best.n].sort((a,b)=>a[1]-b[1]);
    const evts=[];let i=0;
    while(i<sorted.length){const bt=sorted[i][1],g=[];while(i<sorted.length&&sorted[i][1]-bt<=CWIN)g.push({m:sorted[i][0],v:sorted[i][3]||80,durMs:sorted[i][2]||300}),i++;if(g.length){const md=Math.max(...g.map(n=>n.durMs));evts.push({n:g,startMs:bt,durQ:snapDurQ(md/500)});}}
    const wi=evts.map((c,j)=>({...c,idx:j})),g=computeGrid(wi),lastMs=wi[wi.length-1]?.startMs||0;
    stopAll();applyEvents(wi.map(c=>({n:c.n,startMs:c.startMs})),best.title+' · '+best.artist);
  };

  const startAnimate=useCallback(()=>{
    if(busy||!chords.length)return;stopAll();setDisp(0);setAnim(true);
    if(viewMode==='image'&&pixelRef.current){
      const{nc,nr,px}=pixelRef.current,{BW,BH,CW,CH}=grid,cv=canvasRef.current,ctx=cv?.getContext('2d'),gen=genRef.current;
      if(ctx){ctx.fillStyle='#04040a';ctx.fillRect(0,0,CW,CH);}
      let i=0;
      const CHORD_SIZE=6;
      const colStep=pixelRef.current.colStep||1;
      const effCols=Math.ceil(nc/colStep);
      const step=()=>{
        if(genRef.current!==gen)return;
        if(i>=chords.length){setAnim(false);setDisp(chords.length);return;}
        const _ev=chords[i]||{};
        const band=_ev.band!=null?_ev.band:Math.floor(i/effCols);
        const cg=_ev.cg!=null?_ev.cg:i%effCols;
        const colStart=cg*colStep;
        if(ctx){
          for(let sk=0;sk<colStep;sk++){
            const col=colStart+sk; if(col>=nc) break;
            for(let j=0;j<CHORD_SIZE;j++){
              const row=band*CHORD_SIZE+j; if(row>=nr) break;
              const pidx=row*nc+col,p=px[pidx];
              ctx.fillStyle=`rgba(${p.r},${p.g},${p.b},0.18)`;ctx.fillRect(col*BW-1,row*BH-1,BW+2,BH+2);
              ctx.fillStyle=`rgb(${p.r},${p.g},${p.b})`;ctx.fillRect(col*BW+.5,row*BH+.5,BW-1,BH-1);
            }
          }
        }
        i++;
        timers.current.push(setTimeout(step,6));
      };
      step();
    }else{let i=0;const step=()=>{if(i>chords.length){setAnim(false);return;}setDisp(i++);timers.current.push(setTimeout(step,i<20?0:18));};step();}
  },[busy,chords,viewMode,grid,stopAll]);

  const lastStartPlayRef = useRef(0);
  const startPlay=useCallback(()=>{
    const now=Date.now();
    if(now-lastStartPlayRef.current<300){return;} // debounce double-fire (iOS touch+click)
    lastStartPlayRef.current=now;
    const chords=chordsRef.current;
    const grid=gridRef.current;
    const info=infoRef.current;
    const viewMode=viewModeRef.current;
    if(busy||!chords.length)return;unlockAudio();
    // MFI hand-off: if we're showing the full picked image (mood-from-image AI
    // ready but Play not pressed yet), swap to thumbnail + paint mode now so the
    // canvas can start drawing. This is what makes Play work for MFI new images.
    if(viewMode==='image' && moodFromImg && originalImgUrl){
      setImgMoodThumb(originalImgUrl);
      setOriginalImgUrl(null);
      setLoadedSource(null);
      setViewMode('paint');
    }
    // AI recording: first Play after Add/Recall opens the re-record window so
    // style switches + Vary during this listen get written into the entry.
    // Sealed (after a full playthrough completed) blocks reopening. Resume from
    // a paused mid-song position doesn't re-open the window either — only the
    // first FRESH Play does. (resumeFromRef !=null means user is resuming.)
    if(currentMood && composeSourceRef.current==='ai'
       && !aiSealedRef.current && !aiRecordingRef.current
       && (resumeFromRef.current==null || resumeFromRef.current===0)){
      setAiRecording(true);
    }
    const fromIdx=resumeFromRef.current??0;resumeFromRef.current=null;
    const isResume=fromIdx>0;
    if(!isResume){
      if(randomModeRef.current){ setStructureSeedLock(null); advanceVariation(); }
      else { saltHistoryRef.current=[0]; saltIdxRef.current=0; setRndSalt(0); setVariationPos(0); }
    }
    stopAll();if(!isResume)setDisp(0);setPlaying(true);
    // Play no longer auto-collapses the Color·Style strip or scrolls the page into a
    // framed position — the fullscreen button gives an immersive view on demand.
    // Score must not stay active during playback — close any open score-export
    // (MusicXML share) panel so it can't be interacted with while playing.
    setScoreBlob(null);setScoreFileName('');setScoreMsg(null);
    if(viewModeRef.current==='image') setPlayedOnce(true);
    setSelectedChordIdx(null);selectedChordIdxRef.current=null;

    // Audio mode: play via Web Audio API BufferSourceNode - supports precise offset natively
    if(viewMode==='audio'&&audioPCMRef.current){
      try{
        const ac=Tone.getContext().rawContext;
        if(audioSourceRef.current){try{audioSourceRef.current.stop();}catch(_){}audioSourceRef.current=null;}
        const src=ac.createBufferSource();
        src.buffer=audioPCMRef.current;
        src.playbackRate.value=playbackSpeedRef.current;
        const audioGain=ac.createGain();audioGain.gain.value=mutedRef.current?0:1;src.connect(audioGain);audioGain.connect(ac.destination);src._muteGain=audioGain;
        const offsetSec=fromIdx>0&&chords[fromIdx]?(chords[fromIdx].startMs||0)/1000:0;
        src.start(0,offsetSec);
        audioSourceRef.current=src;
        src.onended=()=>{audioSourceRef.current=null;};
      }catch(_){}
    }

    if(viewMode==='image'&&pixelRef.current){
      const{nc,nr,px}=pixelRef.current,{BW,BH,CW,CH}=grid,cv=canvasRef.current,ctx=cv?.getContext('2d'),gen=genRef.current;
      if(ctx&&fromIdx===0){ctx.fillStyle='#04040a';ctx.fillRect(0,0,CW,CH);}
      let i=fromIdx;
      const CHORD_SIZE=6;
      const colStep=pixelRef.current.colStep||1;
      const effCols=Math.ceil(nc/colStep);
      const step=()=>{
        if(genRef.current!==gen)return;
        // Read chords LIVE from the ref each step (not the captured local), so a
        // colour change mid-playback that swaps in re-transcribed notes is heard
        // immediately on the very next step — no restart needed, no stale copy.
        const liveChords=chordsRef.current;
        if(i>=liveChords.length){setPlaying(false);setDisp(liveChords.length);return;}
        // For chord i: take its stored cell (band,cg) so non-row-major directions
        // (vert/spiral) paint the correct cell; fall back to row-major for safety.
        const _ev=liveChords[i]||{};
        const band=_ev.band!=null?_ev.band:Math.floor(i/effCols);
        const cg=_ev.cg!=null?_ev.cg:i%effCols;
        const colStart=cg*colStep;
        if(ctx){
          for(let sk=0;sk<colStep;sk++){
            const col=colStart+sk; if(col>=nc) break;
            for(let j=0;j<CHORD_SIZE;j++){
              const row=band*CHORD_SIZE+j; if(row>=nr) break;
              const pidx=row*nc+col,p=px[pidx];
              ctx.fillStyle=`rgba(${p.r},${p.g},${p.b},0.18)`;ctx.fillRect(col*BW-1,row*BH-1,BW+2,BH+2);
              ctx.fillStyle=`rgb(${p.r},${p.g},${p.b})`;ctx.fillRect(col*BW+.5,row*BH+.5,BW-1,BH-1);
            }
          }
        }
        // Skip playback if this chord is a continuation of an identical run
        if(liveChords[i] && liveChords[i]._playable!==false){
          // Unmerged: 3× step interval → notes ring into next 2 chords for legato blend
          // Merged run: exact run length (held note up to whole)
          const durMul=liveChords[i]._runLen||3;
          // Soften velocity for unmerged (overlapping notes can pile up, want gentle blend)
          const velScale=liveChords[i]._runLen?1:0.75;
          try{
            const notes=liveChords[i].n;
            const midis=notes.map(({m,v,durMs})=>{
              const scaledDur=Math.round(durMs*durMul/playbackSpeedRef.current);
              playNote(m,Math.round(v*velScale),scaledDur);
              return{m,scaledDur};
            });
            // Batch add all notes in this chord in one state update
            setActive(p=>{const s=new Set(p);for(const x of midis)s.add(x.m);return s;});
            // Group removes by clamped duration to minimise state updates
            const byDur={};
            for(const{m,scaledDur}of midis){const t=Math.min(scaledDur,800);(byDur[t]||(byDur[t]=[])).push(m);}
            for(const[t,ms]of Object.entries(byDur)){
              pushTimer(()=>setActive(p=>{const s=new Set(p);ms.forEach(m=>s.delete(m));return s;}),+t);
            }
            // Scroll the keyboard to center on this chord's notes (same behavior
            // as the chord-playback loop). Lets you see which keys correspond to
            // the painting's colors as the image plays back.
            const wrap=kbScrollRef.current;
            if(wrap){
              const xs=liveChords[i].n.map(({m})=>midiToKeyX(m)).filter(x=>x!=null);
              if(xs.length){
                const cx=xs.reduce((a,b)=>a+b,0)/xs.length;
                const target=Math.max(0,cx - wrap.clientWidth/2 + 13);
                wrap.scrollTo({left:target,behavior:Math.abs(target-wrap.scrollLeft)>200?'instant':'smooth'});
              }
            }
          }catch(_){}
        }
        setDisp(i+1);
        i++;
        timers.current.push(setTimeout(step,Math.round(150/playbackSpeedRef.current)));
      };
      step();
    }else{
      // Step-loop: schedules one chord at a time so playbackSpeedRef is read
      // live on every step — slider changes take effect immediately.
      const useRecorded=chords.some(c=>c.recorded);
      let i=fromIdx;
      const step=()=>{
        if(i>=chords.length){setPlaying(false);setDisp(chords.length);return;}
        const{n,startMs,recorded}=chords[i];
        setDisp(i+1);
        try{
          const midis=n.map(({m,v,durMs})=>{
            const scaledDur=Math.round((durMs||300)/playbackSpeedRef.current);
            if(viewMode!=='audio') playNote(m,v,scaledDur);
            return{m,scaledDur};
          });
          setActive(p=>{const s=new Set(p);for(const x of midis)s.add(x.m);return s;});
          const byDur={};
          for(const{m,scaledDur}of midis){const t=Math.min(scaledDur,800);(byDur[t]||(byDur[t]=[])).push(m);}
          for(const[t,ms]of Object.entries(byDur)){
            pushTimer(()=>setActive(p=>{const s=new Set(p);ms.forEach(m=>s.delete(m));return s;}),+t);
          }
          const wrap=kbScrollRef.current;
          if(wrap){
            const xs=n.map(({m})=>midiToKeyX(m)).filter(x=>x!=null);
            if(xs.length){const cx=xs.reduce((a,b)=>a+b,0)/xs.length;const target=Math.max(0,cx-wrap.clientWidth/2+13);wrap.scrollTo({left:target,behavior:Math.abs(target-wrap.scrollLeft)>200?'instant':'smooth'});}
          }
        }catch(_){}
        i++;
        if(i>=chords.length){
          const last=chords[chords.length-1];
          const tail=Math.round((last?.n?.reduce((mx,nn)=>Math.max(mx,nn.durMs||0),0)||500)/playbackSpeedRef.current)+300;
          timers.current.push(setTimeout(()=>{
            // Seal AI recording on first full playthrough — applies whether loop
            // is ON or OFF. Style/Vary picks during this listen are now locked
            // into the entry; future Play won't reopen recording until a new
            // Add/Recall resets the lifecycle.
            if(aiRecordingRef.current){ setAiRecording(false); setAiSealed(true); }
            if(loopModeRef.current && !composedModeRef.current){
              resumeFromRef.current=0;
              startPlay();
            }else{
              try{if(audioElRef.current)audioElRef.current.pause();}catch(_){}
              try{if(audioSourceRef.current){audioSourceRef.current.stop();audioSourceRef.current=null;}}catch(_){}
              setPlaying(false);setDisp(chords.length);
            }
          },tail));
        }else{
          // Gap to next chord: diff between adjacent startMs when available, else uniform 350ms.
          // For recorded compositions, cap at 1500ms to trim extreme thinking pauses while
          // preserving the user's natural pacing. The cap used to be 400ms which produced
          // a morse-like sequence — every chord arrived too fast regardless of how slowly
          // the composer actually played.
          const hasTimings=info||recorded||useRecorded;
          const rawGap=hasTimings?Math.max(0,(chords[i].startMs||0)-(startMs||0)):350;
          const gap=useRecorded?Math.min(rawGap,1500):rawGap;
          timers.current.push(setTimeout(step,Math.round(gap/playbackSpeedRef.current)));
        }
      };
      step();
    }
  },[busy,playNote,stopAll,advanceVariation]);


  // Load the demo song (Für Elise) and start painting it live. Shared by the
  // reel's opening beat. Does NOT schedule the rest of the tour.
  const demoLoadAndPlay=useCallback((songSpec)=>{
    if(draftOwnerRef.current) stashDraft(draftOwnerRef.current);
    draftOwnerRef.current=null;
    fullClear();
    stopAll();clearTimeout(kbTimer.current);
    if(introRafRef.current){cancelAnimationFrame(introRafRef.current);introRafRef.current=null;}
    // songSpec: undefined → built-in DEMO (Für Elise). Otherwise a mood song
    // ({notes,tempo,title}) whose events we lay out the same way, so the AI beat
    // uses the exact same state+ref setup that makes the canvas paint reliably.
    let wi, inf;
    if(songSpec && songSpec.notes){
      const evts=noteArr2events(songSpec.notes, songSpec.tempo);
      wi=evts.map((c,i)=>({...c,idx:i}));
      wi.forEach(ev=>{ if(ev.n&&ev.n.length>1) ev.n=[...ev.n].sort((a,b)=>b.m-a.m); });
      const lastMs=wi[wi.length-1]?.startMs||0;
      inf={title:songSpec.title||'', count:wi.length, dur:Math.round(lastMs/1000)};
      setVarySource(songSpec); setCurrentMood(songSpec._mood||null);
    }else{
      let t=0;
      wi=DEMO.map((item,i)=>{const startMs=t;t+=item.d+25;return{n:item.n,startMs,idx:i,durQ:snapDurQ(item.d/500)};});
      inf={title:'Für Elise · Beethoven',count:wi.length,dur:Math.round(t/1000)};
      setCurrentMood(null); setVarySource(null);
    }
    const g=computeGrid(wi);
    pendingRef.current=[];setPending([]);pressInfo.current={};sessionStart.current=0;gridSigRef.current='';
    setChords(wi);chordsRef.current=wi;
    setGrid(g);gridRef.current=g;
    setInfo(inf);infoRef.current=inf;
    setDisp(0);idxRef.current=wi.length;
    setViewMode('paint');viewModeRef.current='paint';setOriginalImgUrl(null);pixelRef.current=null;setStamp(s=>s+1);
    setErr('');setMidiBlob(null);setMidiName('');setAudioBlob(null);setAudioName('');audioBlobRef.current=null;setLoadedSource(null);
    setComposeMode(false);setPickMode(null);setSongQ('');
    setDemoMode(true);
    resumeFromRef.current=0;
    startPlay();
  },[stopAll,startPlay,fullClear,stashDraft]);

  // Tear the reel down completely AND reset to the clean Setup screen.
  // Earlier implementation only paused (stopAll + setStyle(null)), which left
  // the canvas mid-painted in Mosaic — confusing because the user pressed
  // "escape" expecting a fresh start, not a paused state. Now escape = back
  // to the empty Setup just like pressing Back manually.
  const demoReelStop=useCallback(()=>{
    const bag=demoReelRef.current;
    if(!bag) return;
    bag.active=false;
    setDemoReelOn(false);
    try{ bag.timers.forEach(id=>clearTimeout(id)); }catch(_){}
    bag.timers=[];
    if(bag.parade){ try{clearInterval(bag.parade);}catch(_){} bag.parade=null; }
    if(bag.vary){ try{clearInterval(bag.vary);}catch(_){} bag.vary=null; }
    if(bag.type){ try{clearInterval(bag.type);}catch(_){} bag.type=null; }
    setDemoText(''); setDemoTextKey(''); setDemoTyping(''); setDemoPrintBeat(false);
    // Full reset: wipe chords/canvas/source/mood, exit any active modes, and
    // surface the Setup screen so the user lands in the same empty starting
    // state they'd see after pressing Back.
    try{ fullClear(); }catch(_){}
    try{ wipeCanvasNow(); }catch(_){}
    setStripOpen(false);
    setShowColorPalette(false);
    setCustomArmed(false);
    setSourceContext(null);
    setMoodContext(false);
    setStyle(null);
    setForceSetup(true);
  },[stopAll,fullClear,wipeCanvasNow]);

  // The promo tour. Walks DEMO_REEL_PHASES, scheduling each beat with a timer.
  // Reuses the real engine so it doubles as a working demo. Tap anywhere to skip
  // (wired to demoReelStop via the overlay + a global pointer handler).
  const demoPlay=useCallback(()=>{
    if(busy && !demoReelRef.current.active) { /* allow re-entry only when idle */ }
    unlockAudio();
    // Reset any previous run.
    demoReelStop();
    const bag=demoReelRef.current;
    bag.active=true;
    setDemoReelOn(true);
    const T=(key)=>demoReelText(langRef.current, key);
    const sched=(ms,fn)=>{ const id=setTimeout(()=>{ if(bag.active) fn(); }, ms); bag.timers.push(id); };

    DEMO_REEL_PHASES.forEach(ph=>{
      sched(ph.at, ()=>{
        switch(ph.kind){
          case 'play-song':
            demoLoadAndPlay();
            // demoLoadAndPlay → fullClear → stopAll → setStyle(null) under the
            // hood. Re-assert intro style right after so the engine doesn't
            // fall back to its implicit Mosaic default for the first beat.
            setStyle('bloom');
            break;
          case 'show-text':
            setDemoTyping(''); setDemoPrintBeat(false);
            setDemoTextKey(ph.textKey);
            break;
          case 'set-style':
            if(ph.style) setStyle(ph.style);
            break;
          case 'style-parade': {
            setDemoTextKey(ph.textKey||'artists');
            let i=0;
            // immediate first swap
            setStyle(DEMO_REEL_STYLE_PARADE[0]);
            bag.parade=setInterval(()=>{
              if(!bag.active){ clearInterval(bag.parade); bag.parade=null; return; }
              i=(i+1)%DEMO_REEL_STYLE_PARADE.length;
              setStyle(DEMO_REEL_STYLE_PARADE[i]);
            }, DEMO_REEL_PARADE_STEP);
            break;
          }
          case 'ai-type': {
            if(bag.parade){ clearInterval(bag.parade); bag.parade=null; }
            // NOTE: do NOT setStyle(null) here. style=null falls through to
            // the engine's implicit default (Mosaic), which made the AI beat
            // look like every other beat. Each phase explicitly owns a style.
            setStyle('spiral');
            setDemoTextKey('');
            const phrase=T(ph.textKey);
            let k=0; setDemoTyping('');
            bag.type=setInterval(()=>{
              if(!bag.active){ clearInterval(bag.type); bag.type=null; return; }
              k++; setDemoTyping(phrase.slice(0,k));
              if(k>=phrase.length){ clearInterval(bag.type); bag.type=null; }
            }, 90);
            break;
          }
          case 'ai-play': {
            setDemoTyping('');
            setDemoTextKey(ph.textKey);
            // Offline mood song — instant, no network. Use the SAME loader as the
            // Für Elise beat (state + refs set together → canvas paints reliably).
            // demoLoadAndPlay internally calls fullClear → stopAll → setStyle(null),
            // so we re-assert our chosen style RIGHT AFTER, before paint starts.
            try{
              const song=moodToSong(DEMO_REEL_MOOD);
              if(song){ song._mood=DEMO_REEL_MOOD; demoLoadAndPlay(song); }
            }catch(_){}
            setStyle('spiral');
            break;
          }
          case 'mfi': {
            // Stop the parade if still cycling.
            if(bag.parade){ clearInterval(bag.parade); bag.parade=null; }
            setStyle('matisse');
            // 3-stage MFI — Picture → Music → Painting, chronologically. Each
            // card sits on screen long enough to read as a distinct step, so
            // the viewer sees the whole flow: the image triggers AI composition,
            // the music carries the image's mood, Paintiano then visualizes it
            // through the chosen style.
            //
            // Stage 1 (now): big picture alone, "Picture." card. The viewer
            // reads "this is the input".
            setDemoTextKey('mfiPicture');
            try{ loadSampleImgMood(); }catch(_){}
            // Stage 2: music begins playing. startPlay triggers the MFI
            // hand-off (image collapses to a thumb, canvas paints). The
            // "Music." card frames this moment as the composition step —
            // image → AI-composed song.
            const stage2Id = setTimeout(()=>{
              if(!bag.active) return;
              setDemoTextKey('mfiMusic');
              try{ startPlayRef.current?.(); }catch(_){}
              setStyle('matisse');
            }, DEMO_REEL_MFI_STAGE2_AT);
            bag.timers.push(stage2Id);
            // Stage 3: painting takes over. The canvas is already painting
            // (started in stage 2); this is purely the text-swap moment so
            // the third card explicitly labels the final result.
            const stage3Id = setTimeout(()=>{
              if(!bag.active) return;
              setDemoTextKey('mfiPainting');
              setStyle('matisse');
            }, DEMO_REEL_MFI_STAGE3_AT);
            bag.timers.push(stage3Id);
            break;
          }
          case 'vary': {
            setDemoTextKey(ph.textKey||'variations');
            let n=0;
            bag.vary=setInterval(()=>{
              if(!bag.active){ clearInterval(bag.vary); bag.vary=null; return; }
              try{ advanceVariation(); }catch(_){}
              n++;
              if(n>=DEMO_REEL_VARY_COUNT){ clearInterval(bag.vary); bag.vary=null; }
            }, DEMO_REEL_VARY_STEP);
            break;
          }
          case 'print-beat':
            setDemoTextKey(ph.textKey);
            setDemoPrintBeat(true);
            break;
          case 'outro':
            setDemoPrintBeat(false);
            setDemoTextKey(ph.textKey);
            break;
          case 'end':
            demoReelStop();
            break;
          default: break;
        }
      });
    });
  },[busy,demoLoadAndPlay,demoReelStop,advanceVariation,loadSampleImgMood]);

  const handlePauseClick=useCallback(()=>{
    // If a live mic mode is active (Voice=micPainting or Music=micListening),
    // the Play button stops it and plays back the canvas just captured — mic-stop
    // preserves chords. One tap instead of forcing a manual mic-stop before Play.
    if(micPainting||micListening){
      if(micPainting) stopMicPaintingRef.current?.();
      if(micListening) stopMicListeningRef.current?.();
      if(chordsRef.current.length){
        resumeFromRef.current=null;
        // Defer so the mic teardown (setState) settles before playback starts.
        setTimeout(()=>{ startPlayRef.current?.(); },0);
      }
      return;
    }
    if(playing){
      resumeFromRef.current=disp;
      setHoldPaused(true);
      genRef.current++;timers.current.forEach(t=>clearTimeout(t));timers.current=[];
      try{if(samplerOk.current&&samplerRef.current)samplerRef.current.releaseAll();}catch(_){}
      try{if(audioElRef.current)audioElRef.current.pause();}catch(_){}
      try{if(audioSourceRef.current){audioSourceRef.current.stop();audioSourceRef.current=null;}}catch(_){}
      setActive(new Set());
      setPlaying(false);setAnim(false);
      // User-initiated pause/stop = close recording window without sealing.
      // Next fresh Play will re-open it (same semantics as Add).
      if(aiRecordingRef.current){ setAiRecording(false); }
    }else if(holdPaused){
      setHoldPaused(false);
      startPlay(); // startPlay reads and clears resumeFromRef itself
    }else if(!busy){
      resumeFromRef.current=null;
      startPlay();
    }
  },[playing,holdPaused,busy,disp,demoMode,startPlay,micPainting,micListening]);
  useEffect(()=>{handlePauseClickRef.current=handlePauseClick;},[handlePauseClick]);
  useEffect(()=>{startPlayRef.current=startPlay;},[startPlay]);

  // Auto-stop the recorder once playback finishes (playing → false).
  // A 700 ms tail lets the last notes ring out before capture closes.
  useEffect(()=>{
    if(!playing&&recording&&recorderRef.current){
      const r=recorderRef.current;
      setTimeout(()=>{try{r.stop();}catch(_){}},700);
    }
  },[playing,recording]);

  // Image playback scroll: image now behaves like every other mode — no
  // cursor-following during playback (that scrolled the page around mid-play,
  // opposite to the other sources). startPlay already frames the collapsed
  // Color·Style strip at the top; here we only re-frame it when playback
  // ends/pauses, so the resting position matches the other modes on mobile
  // and desktop alike.
  const imgScrollResetRef=useRef(null);
  useEffect(()=>{
    if(viewMode!=='image')return;
    const playingNow=playing||anim;
    if(playingNow){
      // Playing — leave the scroll where startPlay put it (strip framed). Just
      // cancel any pending end-of-play reset so it doesn't fire mid-play.
      if(imgScrollResetRef.current){clearTimeout(imgScrollResetRef.current);imgScrollResetRef.current=null;}
    }else{
      // Playback finished/paused — glide back so the Color·Style strip is framed
      // at the top with the canvas below it, after a beat.
      if(imgScrollResetRef.current)clearTimeout(imgScrollResetRef.current);
      imgScrollResetRef.current=setTimeout(()=>{
        imgScrollResetRef.current=null;
        /* no auto-scroll on pause/end */
      },600);
    }
    return()=>{if(imgScrollResetRef.current){clearTimeout(imgScrollResetRef.current);imgScrollResetRef.current=null;}};
  },[playing,anim,viewMode]);

  // Recording: capture Tone.js master out via MediaRecorder. Output is mp4/m4a
  // on iOS Safari, webm elsewhere. Inline <audio> playback of the result is
  // unreliable on iOS so we skip the inline player and offer only a save
  // button — the file itself is fine for download / share / play in Files /
  // Voice Memos / Music.
  const startRecord=()=>{
    if(!chords.length||recording||playing)return;
    if(!window.MediaRecorder){setErr(t('recUnsupported'));setErrInfo(false);return;}
    unlockAudio();
    const rawCtx=Tone.getContext().rawContext;
    const streamDest=rawCtx.createMediaStreamDestination();
    recStreamDestRef.current=streamDest;
    try{Tone.getDestination().connect(streamDest);}catch(_){}
    const mimeType=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg'].find(t=>{try{return MediaRecorder.isTypeSupported(t);}catch(_){return false;}})||'';
    let recorder;
    try{recorder=new MediaRecorder(streamDest.stream,mimeType?{mimeType}:{});}
    catch(_){recorder=new MediaRecorder(streamDest.stream);}
    recChunksRef.current=[];
    recorder.ondataavailable=e=>{if(e.data?.size>0)recChunksRef.current.push(e.data);};
    recorder.onstop=()=>{
      try{Tone.getDestination().disconnect(streamDest);}catch(_){}
      recStreamDestRef.current=null;
      const mt=recorder.mimeType||'audio/mp4';
      const blob=new Blob(recChunksRef.current,{type:mt});
      const ext=mt.includes('ogg')?'ogg':mt.includes('mp4')?'m4a':'webm';
      const name=(info?.title||'paintiano').replace(/[^\w\s-]/g,'').replace(/\s+/g,'_').slice(0,50)+'.'+ext;
      if(blob.size<2000){setErr(t('recTooShort'));setErrInfo(false);}
      else{setRecBlob(blob);setRecName(name);}
      setRecording(false);recorderRef.current=null;
      // Image-mode picker intents: react to what the user picked from SAVE,
      // or from the REC button (which uses 'picker' = auto-open the SAVE picker
      // after recording so the user can choose Story / Audio / Score next).
      const intent = recordIntentRef.current;
      if(intent && blob.size>=2000){
        setRecordIntent(null);
        recordIntentRef.current=null;
        // Defer so the recBlob/recName state writes settle before downstream
        // helpers (saveAudio reads them via closure).
        setTimeout(()=>{
          if(intent==='audio') saveAudio();
          else if(intent==='story') exportImage('story', true, blob, name);
          else if(intent==='picker') setShowSizePicker(true);
        }, 60);
      }
    };
    recorderRef.current=recorder;
    recorder.start(200);
    setRecording(true);
    setRecBlob(null);setRecName('');
    startPlay();
  };

  // Stop both the MediaRecorder and the playback. They start together via
  // startRecord → startPlay, so the rec button stops them together too.
  // requestData() flushes pending bytes before stop — helps iOS mp4 finalize.
  const stopRecord=useCallback(()=>{
    const r=recorderRef.current;
    if(r){
      try{if(r.state==='recording'){try{r.requestData();}catch(_){}r.stop();}}catch(_){}
    }
    stopAll();
  },[stopAll]);

  const stopMicVol=useCallback(()=>{
    if(micVolRef.current){
      const{raf,stream,ac}=micVolRef.current;
      cancelAnimationFrame(raf);
      stream.getTracks().forEach(t=>t.stop());
      if(ac){try{ac.close();}catch(_){}}
      micVolRef.current=null;
    }
    setMicVolActive(false);
    setMicVolLevel(0);
  },[]);

  const startMicVol=useCallback(async()=>{
    if(micVolActive){stopMicVol();return;}
    if(!navigator.mediaDevices?.getUserMedia){setErr(t('micUnavailable'));setErrInfo(false);return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      const AC=window.AudioContext||window.webkitAudioContext;
      const ac=new AC();
      const src=ac.createMediaStreamSource(stream);
      const analyser=ac.createAnalyser();
      analyser.fftSize=256;
      src.connect(analyser);
      const buf=new Float32Array(analyser.fftSize);
      setMicVolActive(true);
      let smoothed=0;
      const tick=()=>{
        analyser.getFloatTimeDomainData(buf);
        let rms=0;for(let i=0;i<buf.length;i++)rms+=buf[i]*buf[i];rms=Math.sqrt(rms/buf.length);
        smoothed=smoothed*0.75+rms*0.25; // smooth
        setMicVolLevel(Math.min(1,smoothed*6)); // scale to 0–1
        micVolRef.current.raf=requestAnimationFrame(tick);
      };
      micVolRef.current={raf:requestAnimationFrame(tick),stream,ac};
    }catch(e){
      setErr(t('micDenied'));setErrInfo(false);
    }
  },[micVolActive,stopMicVol]);

  const stopMicPainting=useCallback(()=>{
    // Stash the captured draft so the MIC button shows a "draft saved" glow and
    // the work is recoverable (mirrors Compose). stashDraft no-ops if the canvas
    // isn't a recorded creation or is empty, so this is safe on every stop path.
    if(draftOwnerRef.current==='sing'||draftOwnerRef.current==='listen') stashDraft(draftOwnerRef.current);
    if(micRafRef.current){cancelAnimationFrame(micRafRef.current);micRafRef.current=null;}
    if(micStreamRef.current){micStreamRef.current.getTracks().forEach(t=>t.stop());micStreamRef.current=null;}
    if(micAcRef.current){try{micAcRef.current.close();}catch(_){}micAcRef.current=null;}
    setMicPainting(false);
    stopMicVol();
  },[stopMicVol,stashDraft]);

  const stopMicListening=useCallback(()=>{
    if(draftOwnerRef.current==='sing'||draftOwnerRef.current==='listen') stashDraft(draftOwnerRef.current);
    if(listenRafRef.current){cancelAnimationFrame(listenRafRef.current);listenRafRef.current=null;}
    if(listenStreamRef.current){listenStreamRef.current.getTracks().forEach(t=>t.stop());listenStreamRef.current=null;}
    if(listenAcRef.current){try{listenAcRef.current.close();}catch(_){}listenAcRef.current=null;}
    setMicListening(false);
    stopMicVol();
  },[stopMicVol,stashDraft]);

  // Refs so handlePauseClick (defined earlier in the file) can stop a live mic
  // mode before starting playback. The Play button now does mic-stop + play in
  // one tap instead of being disabled while the mic is capturing.
  const stopMicPaintingRef = useRef(null);
  const stopMicListeningRef = useRef(null);
  useEffect(()=>{stopMicPaintingRef.current=stopMicPainting;},[stopMicPainting]);
  useEffect(()=>{stopMicListeningRef.current=stopMicListening;},[stopMicListening]);

  const startMicListening=useCallback(async()=>{
    if(micListening){stopMicListening();return;}
    if(!navigator.mediaDevices?.getUserMedia){setErr(t('micUnavailable'));setErrInfo(false);return;}
    const prevOwner = draftOwnerRef.current;
    // Continuation: re-entering listen, OR switching from sing (sibling preset
    // within the unified MIC mode). In both cases we preserve the canvas.
    const continuation = (prevOwner==='listen' || prevOwner==='sing');
    if(prevOwner && !continuation) stashDraft(prevOwner);
    // Only one mode at a time
    setComposeMode(false);
    if(micPainting){stopMicPainting();}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
      listenStreamRef.current=stream;
      const AC=window.AudioContext||window.webkitAudioContext;
      const ac=new AC();
      listenAcRef.current=ac;
      // iOS: a fresh AudioContext starts suspended; an analyser on a suspended
      // context reads silence — which is why the FIRST entry into Music painted
      // nothing while later re-entries worked. Await the resume (we're already in
      // an async fn, inside the button-tap gesture) so the tick loop below reads
      // real audio from the very first frame.
      try{ if(ac.state!=='running' && ac.resume) await ac.resume(); }catch(_){}
      const src=ac.createMediaStreamSource(stream);
      const analyser=ac.createAnalyser();
      analyser.fftSize=4096; // higher resolution for better pitch detection on complex music
      src.connect(analyser);
      const buf=new Float32Array(analyser.fftSize);
      const sr=ac.sampleRate;
      setMicListening(true);setMicArmed(false);setMicContext(true);
      startMicVol();
      stopAll();
      // Continuation (sibling preset or re-entering): preserve canvas.
      // Fresh entry: restore listen stash or start blank.
      if(!continuation){
        if(!restoreStash('listen')){
          resetCanvasForDraft('listen');
        }
      } else {
        draftOwnerRef.current='listen';
        composedModeRef.current=true;
      }
      let lastCommit=performance.now();
      const COMMIT_INTERVAL=120; // sample chord identity frequently
      const MIN_HOLD_MS=100;     // very short — catch quick changes; only filter very brief flickers
      // Adaptive noise gate is the ONLY filter — distinguishes silence/room
      // noise from any audio. Everything that gets past it gets painted, even
      // distorted or rough detections. The point is "I hear something" → paint,
      // not perfect transcription.
      let noiseFloor=0.002;
      const NOISE_GATE_MULT=1.8;  // signal must be 1.8× the noise floor
      const RMS_FLOOR_MIN=0.003;  // absolute floor — true silence
      let prevChordSig=''; // chord-change detection
      let prevChordStart=performance.now(); // when current chord started
      let pendingNotes=null;     // the currently-sounding chord, awaiting its end to know duration
      let pendingSig='';
      const emitChord=(notes,heldMs)=>{
        // Highlight active keys
        const sustainMs=Math.round(Math.min(2400,Math.max(300,heldMs)));
        notes.forEach(({m})=>{
          setActive(p=>{const s=new Set(p);s.add(m);return s;});
          pushTimer(()=>setActive(p=>{const s=new Set(p);s.delete(m);return s;}),Math.min(sustainMs,1000));
        });
        const idx=idxRef.current++;
        const now2=performance.now();
        if(!sessionStart.current)sessionStart.current=now2;
        const startMs=now2-sessionStart.current;
        // Continuous durQ proportional to TRUE held duration — like Compose.
        const durQ=Math.max(0.25,Math.min(4,heldMs/500));
        const paintedNotes=notes.map(n=>({...n,durMs:Math.round(heldMs)}));
        setChords(p=>{const next=[...p,{n:paintedNotes,idx,startMs,recorded:true,durQ}];return next;});
        setDisp(p=>p+1);
      };
      const tick=()=>{
        if(!listenStreamRef.current){stopMicListening();return;}
        analyser.getFloatTimeDomainData(buf);
        let rms=0;for(let i=0;i<buf.length;i++)rms+=buf[i]*buf[i];rms=Math.sqrt(rms/buf.length);
        const now=performance.now();
        // Update the noise floor with slow decay during quiet moments only —
        // when the level is below 1.5× current floor, treat as background and
        // let it drift toward `rms`. During loud moments the floor stays put.
        if(rms < noiseFloor*1.5) noiseFloor = noiseFloor*0.95 + rms*0.05;
        const gate = Math.max(RMS_FLOOR_MIN, noiseFloor*NOISE_GATE_MULT);
        if(rms<gate){
          // Silence — if a chord was sounding, end it now with its real duration.
          if(pendingNotes){
            const heldMs=now-prevChordStart;
            if(heldMs>=MIN_HOLD_MS) emitChord(pendingNotes,heldMs);
            pendingNotes=null;pendingSig='';prevChordSig='';
          }
          listenRafRef.current=requestAnimationFrame(tick);return;
        }
        // Detect chord identity every ~120ms (cheap, frequent — decoupled from
        // the old 800ms commit gate that quantized all durations equal).
        if(now-lastCommit>COMMIT_INTERVAL){
          lastCommit=now;
          const mag=fftMag(buf);
          // Read sampleRate live: a freshly-created AudioContext can report 0 (or
          // a stale value) on the first entry until it's fully running, which made
          // pickPitches compute garbage frequencies → no pitches → first Music
          // session never painted. Fall back to a sane default if it's not ready.
          const liveSr = (ac.sampleRate && ac.sampleRate>1000) ? ac.sampleRate : (sr && sr>1000 ? sr : 44100);
          const pitches=pickPitches(mag,liveSr,0.02); // very low — catch any peak; noise gate above filters silence
          if(pitches.length>0){
            const notes=pitches.slice(0,6).map(p=>({m:p.midi,v:Math.max(50,Math.min(120,Math.round(p.mag*110))),durMs:0}));
            const sig=notes.map(n=>n.m).sort((a,b)=>a-b).join(',');
            if(sig!==pendingSig){
              // Chord changed. Flush the PREVIOUS chord with its true held time
              // and emit the NEW one immediately — no stability gate, no prominence
              // filter. Every detected change paints.
              if(pendingNotes){
                const heldMs=now-prevChordStart;
                if(heldMs>=MIN_HOLD_MS) emitChord(pendingNotes,heldMs);
              }
              pendingNotes=notes;pendingSig=sig;prevChordStart=now;
            }
          }
        }
        listenRafRef.current=requestAnimationFrame(tick);
      };
      listenRafRef.current=requestAnimationFrame(tick);
    }catch(e){
      setErr(t('micDenied'));setErrInfo(false);
      setMicListening(false);
    }
  },[micListening,stopMicListening,stopAll]);

  const startMicPainting=useCallback(async()=>{
    if(micPainting)return stopMicPainting();
    if(!navigator.mediaDevices?.getUserMedia){setErr(t('micUnavailable'));setErrInfo(false);return;}
    const prevOwner = draftOwnerRef.current;
    // Continuation: re-entering sing, OR switching from listen (sibling preset
    // within the unified MIC mode). Preserve the canvas in both cases.
    const continuation = (prevOwner==='sing' || prevOwner==='listen');
    if(prevOwner && !continuation) stashDraft(prevOwner);
    // Only one mode at a time
    setComposeMode(false);
    if(micListening){stopMicListening();}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      micStreamRef.current=stream;
      const AC=window.AudioContext||window.webkitAudioContext;
      const ac=new AC();
      micAcRef.current=ac;
      try{ if(ac.state!=='running' && ac.resume) await ac.resume(); }catch(_){} // iOS: await resume so the analyser reads real audio on the first frame
      const src=ac.createMediaStreamSource(stream);
      const analyser=ac.createAnalyser();
      analyser.fftSize=2048;
      src.connect(analyser);
      const buf=new Float32Array(analyser.fftSize);
      const sr=ac.sampleRate;
      setMicPainting(true);setMicArmed(false);setMicContext(true);
      // Frame the collapsed Color·Style strip at the top with the canvas below,
      // same as Play and compose — MIC (Voice/Music) is another "performing"
      // entry point, so it gets the same scroll framing on mobile and desktop.
      setStripOpen(false);
      // Same as compose: freeze the artist seed so the overlay (esp. Kusama
      // dots) doesn't re-randomise as sung notes accumulate. Skip on Random.
      if(!continuation && !randomMode){ setStructureSeedLock((pollockSessionSeed>>>0)||1); }
      startMicVol();
      stopAll();
      if(!continuation){
        if(!restoreStash('sing')){
          resetCanvasForDraft('sing');
        }
      } else {
        draftOwnerRef.current='sing';
        composedModeRef.current=true;
      }
      unlockAudio();
      let lastSample=performance.now();
      const SAMPLE_INTERVAL=100; // sample pitch frequently
      const MIN_HOLD_MS=100;     // catch quick changes; only filter very brief flickers
      // Adaptive noise gate is the ONLY filter — distinguishes silence/room
      // noise from any voice / sound. Everything past it gets painted, even
      // imperfect detections. Goal is "I hear a note" → paint.
      let noiseFloor=0.01;       // initial guess
      const NOISE_GATE_MULT=2.0; // signal must be 2× the noise floor
      const RMS_FLOOR_MIN=0.012; // absolute floor for true silence
      let pendingNote=null;      // {m,v} currently being sung
      let noteStart=performance.now();
      const emitNote=(note,heldMs)=>{
        const sustainMs=Math.round(Math.min(2400,Math.max(300,heldMs)));
        playNote(note.m,note.v,sustainMs);
        setActive(p=>{const s=new Set(p);s.add(note.m);return s;});
        pushTimer(()=>setActive(p=>{const s=new Set(p);s.delete(note.m);return s;}),Math.min(sustainMs,1000));
        const idx=idxRef.current++;
        const now2=performance.now();
        if(!sessionStart.current)sessionStart.current=now2;
        const startMs=now2-sessionStart.current;
        const durQ=Math.max(0.25,Math.min(4,heldMs/500));
        setChords(p=>{const next=[...p,{n:[{m:note.m,v:note.v,durMs:Math.round(heldMs)}],idx,startMs,recorded:true,durQ}];return next;});
        setDisp(p=>p+1);
      };
      const tick=()=>{
        if(!micStreamRef.current){stopMicPainting();return;}
        analyser.getFloatTimeDomainData(buf);
        let rms=0;for(let i=0;i<buf.length;i++)rms+=buf[i]*buf[i];rms=Math.sqrt(rms/buf.length);
        const now=performance.now();
        // Update the noise floor with slow decay during quiet moments only —
        // when the level is below 1.5× the current floor, treat as background
        // and let it drift toward `rms`. During loud moments the floor stays put.
        if(rms < noiseFloor*1.5) noiseFloor = noiseFloor*0.95 + rms*0.05;
        const gate = Math.max(RMS_FLOOR_MIN, noiseFloor*NOISE_GATE_MULT);
        if(rms<gate){
          // Silence ends the current note with its real duration.
          if(pendingNote){
            const heldMs=now-noteStart;
            if(heldMs>=MIN_HOLD_MS) emitNote(pendingNote,heldMs);
            pendingNote=null;
          }
          micRafRef.current=requestAnimationFrame(tick);return;
        }
        if(now-lastSample>SAMPLE_INTERVAL){
          lastSample=now;
          const mag=fftMag(buf);
          const liveSr = (ac.sampleRate && ac.sampleRate>1000) ? ac.sampleRate : (sr && sr>1000 ? sr : 44100);
          const pitches=pickPitches(mag,liveSr,0.12); // very low — catch any peak; noise gate above filters silence
          if(pitches.length>0){
            const snapped=paintSnapMidi(pitches[0].midi,'cmaj');
            const v=Math.max(50,Math.min(120,Math.round(pitches[0].mag*110)));
            // Emit on any pitch change — no stability gate, no prominence filter.
            if(!pendingNote || pendingNote.m!==snapped){
              if(pendingNote){
                const heldMs=now-noteStart;
                if(heldMs>=MIN_HOLD_MS) emitNote(pendingNote,heldMs);
              }
              pendingNote={m:snapped,v};noteStart=now;
            }else{
              if(v>pendingNote.v) pendingNote.v=v;
            }
          }
        }
        micRafRef.current=requestAnimationFrame(tick);
      };
      micRafRef.current=requestAnimationFrame(tick);
    }catch(e){
      setErr(t('micDenied'));setErrInfo(false);
      setMicPainting(false);
    }
  },[micPainting,stopMicPainting,playNote,stopAll,randomMode,pollockSessionSeed]);
  //   1. navigator.share({files}) — iOS Safari, Android Chrome (share sheet)
  //   2. showSaveFilePicker — Chrome/Edge desktop (native save dialog)
  //   3. Anchor <a download> click — Firefox / older browsers / fallback
  // Each method handles its own AbortError (user cancellation).
  // Export the current piece as a MusicXML score (.musicxml) — opens in
  // MuseScore/Sibelius/Finale for viewing, editing or printing to PDF. Works for
  // any source (image, compose, MIDI…) since it reads the live `chords`.
  const saveScore=useCallback(async()=>{
    // Score export must not run during playback: the live chord index is moving
    // and exporting mid-play could capture a partial/scrubbing state. The button
    // is already disabled while playing; this guard covers any other entry path.
    if(playingRef.current){ setScoreMsg({tone:'wait',text:t('exportNeedsPlay')}); return; }
    const src=chordsRef.current&&chordsRef.current.length?chordsRef.current:chords;
    if(!src||!src.length){setScoreMsg({tone:'err',text:t('noNotesGeneric')});return;}
    // Derive a tempo: image uses its fixed block timing (~125ms/chord ≈ tidy
    // beat), others fall back to a pleasant default.
    const tempoGuess = loadedSource==='image' ? 110 : 96;
    const title=(compositionName||recordingName||'Paintiano').trim()||'Paintiano';
    let xml;
    try{ xml=encodeMusicXML(src,tempoGuess,title); }
    catch(e){ setScoreMsg({tone:'err',text:'Score export failed'}); return; }
    const finalName=title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim().slice(0,40)+'.xml';
    const blob=new Blob([xml],{type:'application/xml'});
    // Open a share/save panel (same pattern as Print and the recording row) so
    // the user picks share-sheet → Save to Files, rather than a silent download.
    setScoreMsg(null);
    setScoreFileName(finalName);
    setScoreBlob(blob);
  },[chords,loadedSource,compositionName,recordingName,t]);
  // Share/save the generated MusicXML via share-sheet → save-picker → download.
  const shareScore=useCallback(async()=>{
    if(!scoreBlob)return;
    const file=new File([scoreBlob],scoreFileName||'Paintiano.musicxml',{type:scoreBlob.type});
    setScoreMsg({tone:'wait',text:t('saving')});
    if(navigator.share){
      try{
        const canTry=!navigator.canShare||navigator.canShare({files:[file]});
        if(canTry){ await navigator.share({files:[file],title:'Paintiano score'}); setScoreMsg({tone:'ok',text:t('saved')}); return; }
      }catch(e){ if(e?.name==='AbortError'){setScoreMsg({tone:'ok',text:'cancelled'});return;} }
    }
    if(window.showSaveFilePicker){
      try{
        const handle=await window.showSaveFilePicker({suggestedName:scoreFileName,types:[{description:'MusicXML score',accept:{'application/xml':['.xml','.musicxml']}}]});
        const w=await handle.createWritable(); await w.write(scoreBlob); await w.close();
        setScoreMsg({tone:'ok',text:t('saved')}); return;
      }catch(e){ if(e?.name==='AbortError'){setScoreMsg({tone:'ok',text:'cancelled'});return;} }
    }
    try{
      const url=URL.createObjectURL(scoreBlob);
      const a=document.createElement('a'); a.href=url; a.download=scoreFileName; a.rel='noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>{try{URL.revokeObjectURL(url);}catch(_){}},10000);
      setScoreMsg({tone:'ok',text:'download started ✓'});
    }catch(e){ setScoreMsg({tone:'err',text:'Save blocked: '+(e?.message||e?.name||'unknown')}); }
  },[scoreBlob,scoreFileName,t]);
  // Export audio via offline render — fast, silent, independent of playback.
  const saveAudio=useCallback(async()=>{
    const src=chordsRef.current&&chordsRef.current.length?chordsRef.current:chords;
    if(!src||!src.length){setScoreMsg({tone:'err',text:t('noNotesGeneric')});return;}
    const title=(compositionName||recordingName||'Paintiano').trim()||'Paintiano';
    const finalName=title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim().slice(0,40)+'.wav';
    setScoreMsg({tone:'wait',text:t('rendering')});
    let blob;
    try{ blob=await renderAudioOffline(src,{speed:1}); }
    catch(e){ blob=null; }
    if(!blob){ setScoreMsg({tone:'err',text:t('renderFail')}); return; }
    const file=new File([blob],finalName,{type:blob.type});
    setScoreMsg({tone:'wait',text:t('saving')});
    if(navigator.share){
      try{
        const canTry=!navigator.canShare||navigator.canShare({files:[file]});
        if(canTry){ await navigator.share({files:[file],title:'Paintiano audio'}); setScoreMsg({tone:'ok',text:t('saved')}); return; }
      }catch(e){ if(e?.name==='AbortError'){setScoreMsg({tone:'ok',text:'cancelled'});return;} }
    }
    if(window.showSaveFilePicker){
      try{
        const handle=await window.showSaveFilePicker({suggestedName:finalName,types:[{description:'WAV audio',accept:{'audio/wav':['.wav']}}]});
        const w=await handle.createWritable(); await w.write(blob); await w.close();
        setScoreMsg({tone:'ok',text:t('saved')}); return;
      }catch(e){ if(e?.name==='AbortError'){setScoreMsg({tone:'ok',text:'cancelled'});return;} }
    }
    try{
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=finalName; a.rel='noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>{try{URL.revokeObjectURL(url);}catch(_){}},10000);
      setScoreMsg({tone:'ok',text:'download started ✓'});
    }catch(e){ setScoreMsg({tone:'err',text:'Save blocked: '+(e?.message||e?.name||'unknown')}); }
  },[chords,loadedSource,compositionName,recordingName,t]);
  const shareRecording=async()=>{
    if(!recBlob)return;
    const ext=recName.split('.').pop()||'m4a';
    const baseName=recName.replace(/\.[^.]+$/,'');
    const finalName=baseName+'.'+ext;
    setAudioShareMsg({tone:'wait',text:t('saving')});
    const file=new File([recBlob],finalName,{type:recBlob.type||'audio/mp4'});
    // 1. Share sheet — phones + macOS
    if(navigator.share){
      try{
        const canTry=!navigator.canShare||navigator.canShare({files:[file]});
        if(canTry){
          await navigator.share({files:[file],title:'Paintiano recording'});
          setAudioShareMsg({tone:'ok',text:t('saved')});
          return;
        }
      }catch(e){
        if(e?.name==='AbortError'){setAudioShareMsg({tone:'ok',text:'cancelled'});return;}
        // fall through to next method
      }
    }
    // 2. Native save dialog — Chrome / Edge / Opera desktop
    if(window.showSaveFilePicker){
      try{
        const handle=await window.showSaveFilePicker({
          suggestedName:finalName,
          types:[{description:'Audio recording',accept:{[file.type||'audio/mp4']:['.'+ext]}}]
        });
        const w=await handle.createWritable();
        await w.write(recBlob);
        await w.close();
        setAudioShareMsg({tone:'ok',text:t('saved')});
        return;
      }catch(e){
        if(e?.name==='AbortError'){setAudioShareMsg({tone:'ok',text:'cancelled'});return;}
        // fall through
      }
    }
    // 3. Anchor download — Firefox, older browsers, ultimate fallback
    try{
      const url=URL.createObjectURL(recBlob);
      const a=document.createElement('a');
      a.href=url;a.download=finalName;a.rel='noopener';
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      setTimeout(()=>{try{URL.revokeObjectURL(url);}catch(_){}},10000);
      setAudioShareMsg({tone:'ok',text:'download started ✓'});
    }catch(e){
      setAudioShareMsg({tone:'err',text:'Save blocked: '+(e?.message||e?.name||'unknown')});
    }
  };

  const{N,BW,BH,CW,CH}=grid;
  const pct=info?Math.round(disp/Math.max(1,chords.length)*100):null;
  // Pre-build a Set so each of the 88 white keys can do O(1) `.has()`
  // instead of pending.includes() which would be O(88 * len(pending)).
  const pendingSet = useMemo(() => new Set(pending), [pending]);
  // Pre-compute the active scale's pitch-class set (or null when scale is
  // disabled) so the 36 black keys don't each call paintScalePCs() twice.
  // useMemo so this doesn't run on every render (e.g. the 5-15Hz disp tick).
  const paintScaleSet = useMemo(
    () => paintScale!=='off' ? paintScalePCs(paintScale) : null,
    [paintScale]
  );
  const pianoColor={loading:'rgba(242,238,232,.4)',ready:'rgba(242,238,232,.5)',error:'rgba(201,168,76,.7)'};
  const pianoLabel={loading:t('loadingPiano'),ready:t('grandPiano'),error:t('synthPiano')};
  const changeLang=(l)=>{setLang(l);try{localStorage.setItem('paintiano_lang',l);}catch(_){}}
  const btn=(ex={})=>({background:'transparent',border:'1px solid',borderRadius:2,fontSize:(.7*effScale)+'rem',letterSpacing:'.12em',padding:'5px 14px',cursor:'pointer',textTransform:'uppercase',color:'rgba(207,197,168,.7)',borderColor:'rgba(207,197,168,.2)',...ex});

  // Build a poetic, mode-aware caption for the Story share dialog. iOS/Android
  // pass `text` through to IG/TikTok where it pre-fills the post body. Falls
  // back to a default line if no mode-specific match (or i18n entries are
  // missing). Mood name (when applicable) is substituted into {mood}.
  const buildStoryCaption=()=>{
    const tpl = (t('storyCaption')||{});
    const pick = (k)=> tpl[k] || tpl.default || 'music turns into paintings ✦ paintiano.com';
    // Detection order matters — most specific first.
    if(viewMode==='image' && moodFromImg) return pick('moodFromImg');
    if(viewMode==='image') return pick('image');
    if(composeMode || composedModeRef.current) return pick('compose');
    if(micActive || micArmed){
      return pick(micPreset==='voice' ? 'micVoice' : 'micMusic');
    }
    if(currentMood){
      const moodName = ((t('moodNames')||{})[currentMood]) || currentMood;
      return pick('mood').replace('{mood}', moodName);
    }
    if(loadedSource==='midi')  return pick('midi');
    if(loadedSource==='audio') return pick('audio');
    if(loadedSource==='score') return pick('score');
    return pick('default');
  };

  // Export the painting as a high-resolution PNG.
  // Artifact iframes block <a download>, window.open, and rewrite blob: URLs to a
  // sandbox-internal scheme — the only thing that reliably works is rendering the PNG
  // inside the iframe as <img> and letting iOS native long-press → Save to Photos do the job.
  const exportImage=async(sizeMode='web', directShare=false, audioBlob=null, audioName=null)=>{
    try{
      if(!chords.length){setErr(t('errs').nothingToPrint);setErrInfo(false);return;}
      // Export the style actually on screen — in shuffle mode that's the
      // seed-derived draw, not the (null) user selection.
      const style = effectiveStyle;
      const{N,BW,BH,CW,CH}=grid;
      // sizeMode: 'web' = 4× (good for screens/social), 'print' = A1 300dpi
      let SCALE, label, dpi;
      if(sizeMode==='print'){
        const A1_MIN=7000;
        const rawScale=Math.ceil(A1_MIN/Math.max(CW,CH));
        SCALE=Math.max(rawScale,8);
        dpi=Math.round((CW*SCALE)/23.39); // A1 width=23.39in
        label='A1-print';
      } else if(sizeMode==='story'){
        SCALE=4;          // crisp source; composited onto the 1080×1920 story canvas below
        dpi=null;
        label='story';
      } else {
        SCALE=4;
        dpi=null;
        label='web';
      }
      const hi=document.createElement('canvas');
      hi.width=Math.round(CW*SCALE);hi.height=Math.round(CH*SCALE);
      const hctx=hi.getContext('2d');
      hctx.imageSmoothingEnabled=false;
      hctx.scale(SCALE,SCALE);
      hctx.fillStyle='#04040a';hctx.fillRect(0,0,CW,CH);
      if(viewMode==='image'&&pixelRef.current){
        const{nc,nr,px}=pixelRef.current;
        for(let i=0;i<nc*nr;i++){
          const row=Math.floor(i/nc),col=i%nc,p=px[i];
          hctx.fillStyle=`rgba(${p.r},${p.g},${p.b},0.18)`;hctx.fillRect(col*BW-1,row*BH-1,BW+2,BH+2);
          hctx.fillStyle=`rgb(${p.r},${p.g},${p.b})`;hctx.fillRect(col*BW+.5,row*BH+.5,BW-1,BH-1);
        }
      }else{
        _setArtistSeed(pollockSessionSeed);
        chords.forEach(({n:notes,idx})=>{
          const cell=grid.cells&&grid.cells[idx];
          if(cell&&cell.segments)cell.segments.forEach(s=>drawBlock(hctx,s.x,s.y,notes,gc,s.w,s.h,style));
          else if(cell)drawBlock(hctx,cell.x,cell.y,notes,gc,cell.w,cell.h,style);
          else{const si=idx%(N*N),col=si%N,row=Math.floor(si/N);drawBlock(hctx,col*BW,row*BH,notes,gc,BW,BH,style);}
        });
        // Pollock global drip overlay — drawn over all rendered cells.
        // hctx is already scaled; pass canvas-space CW/CH so the splatters
        // span the painting at export resolution.
        if(style==='pollock' && chords.length>0){
          drawPollockOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode);
        }
        if(style==='picasso' && chords.length>0){
          drawPicassoOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode);
        }
        if(style==='kusama' && chords.length>0){
          drawKusamaOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed);
        }
        if(style==='miro' && chords.length>0){
          drawMiroOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode);
        }
        // Kandinsky canvas-wide contour overlay.
        if(style==='kandinsky' && chords.length>0){
          drawKandinskyOverlay(hctx, CW, CH, chords.length, pollockSessionSeed, mode, gc);
        }
        if(style==='rothko' && chords.length>0){
          drawRothkoOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode);
        }
        if(style==='matisse' && chords.length>0){
          drawMatisseOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode);
        }
        if(style==='mondrian' && chords.length>0){
          drawMondrianOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode);
        }
        if(style==='bulge' && chords.length>0){
          drawBulgeOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode);
        }
        if(style==='arcs' && chords.length>0){
          drawArcsOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode);
        }
        if(style==='bloom' && chords.length>0){
          drawBloomOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode);
        }
        if(style==='spiral' && chords.length>0){
          drawSpiralOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode);
        }
        if(style==='gold' && chords.length>0){
          drawGoldOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode);
        }
        if(style==='pop' && chords.length>0){
          drawPopOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode);
        }
        if(style==='wave' && chords.length>0){
          drawWaveOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode);
        }
        if(style==='comic' && chords.length>0){
          drawComicOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode);
        }
      }
      applyWatermark(hi, proStatus!=='free');   // free tier → "paintiano.app" stamp; Pro → no-op
      // STORY (9:16) — compose the rendered painting onto a tall 1080×1920 dark
      // canvas, centered, with a small Paintiano wordmark below. Built for IG/
      // TikTok stories. Everything else ('web'/'print') downloads `hi` as-is.
      let outCanvas = hi;
      if(sizeMode==='story'){
        const SW=1080, SH=1920;
        const st=document.createElement('canvas'); st.width=SW; st.height=SH;
        const sctx=st.getContext('2d');
        // deep radial background (matches the app's stage)
        const g=sctx.createRadialGradient(SW*0.5,SH*0.34,0,SW*0.5,SH*0.34,SH*0.7);
        g.addColorStop(0,'#0e0b16'); g.addColorStop(1,'#06060c');
        sctx.fillStyle=g; sctx.fillRect(0,0,SW,SH);
        // fit the painting into the width with margins, centered vertically-ish
        const margin=90;
        const availW=SW-margin*2;
        const scale=availW/hi.width;
        const dw=availW, dh=Math.round(hi.height*scale);
        const dx=margin, dy=Math.round((SH-dh)/2 - 40);
        // subtle frame
        sctx.save();
        sctx.shadowColor='rgba(0,0,0,.55)'; sctx.shadowBlur=40; sctx.shadowOffsetY=12;
        sctx.drawImage(hi, dx, dy, dw, dh);
        sctx.restore();
        sctx.strokeStyle='rgba(201,168,76,.35)'; sctx.lineWidth=2;
        sctx.strokeRect(dx, dy, dw, dh);
        // wordmark + tagline below the art
        sctx.textAlign='center';
        sctx.fillStyle='#f0c040';
        sctx.font='600 64px "Cormorant Garamond", Georgia, serif';
        sctx.fillText('Paintiano', SW/2, dy+dh+120);
        sctx.fillStyle='rgba(201,168,76,.7)';
        sctx.font='500 28px "Outfit", Arial, sans-serif';
        sctx.fillText('music → φ painting', SW/2, dy+dh+168);
        outCanvas=st;
      }
      const blob=await new Promise(res=>outCanvas.toBlob(res,'image/png'));
      if(!blob){setErr(t('errs').printEncode);setErrInfo(false);return;}
      const title=compositionName.trim()||info?.title||'painting';
      const filename=`paintiano-${title.replace(/[^\w-]+/g,'_').slice(0,60)}-${outCanvas.width}x${outCanvas.height}-${label}.png`;
      const file=new File([blob],filename,{type:'image/png'});
      const url=URL.createObjectURL(blob);
      setPreviewMsg(null);
      setShowSizePicker(false);
      // One-tap share: skip the preview step and hand the file straight to the
      // OS share sheet (best path to IG/TikTok stories). Falls back to the normal
      // preview if Web Share isn't available (e.g. sandboxed iframe / desktop).
      // Image-mode Story passes an audioBlob too — share BOTH files together so
      // the user can pick image + sound for a Story / Reel in one tap.
      const shareFiles = [file];
      if(audioBlob && audioName){
        const audioFile = new File([audioBlob], audioName, {type:audioBlob.type||'audio/mp4'});
        shareFiles.push(audioFile);
      }
      if(directShare && navigator.share && (!navigator.canShare || navigator.canShare({files:shareFiles}))){
        try{
          // Story exports get a poetic, mode-aware caption that the share sheet
          // pre-fills into the IG/TikTok post body. Web/Print exports don't (they
          // go to Photos/Files where caption is irrelevant).
          const sharePayload = {files:shareFiles, title:'Paintiano'};
          if(sizeMode==='story') sharePayload.text = buildStoryCaption();
          await navigator.share(sharePayload);
          URL.revokeObjectURL(url);
          return;
        }catch(e){
          if(e&&e.name==='AbortError'){ URL.revokeObjectURL(url); return; }
          // fall through to preview so the user still gets the image
        }
      }
      setPreview({url,filename,w:outCanvas.width,h:outCanvas.height,size:blob.size,file,dpi,label});
    }catch(e){setErr('Print: '+e.message);setErrInfo(false);}
  };

  const sharePreview=async()=>{
    if(!preview)return;
    setPreviewMsg({tone:'wait',text:'opening iOS share sheet…'});
    try{
      if(!navigator.share){throw new Error('navigator.share unavailable in this iframe');}
      if(navigator.canShare&&!navigator.canShare({files:[preview.file]})){
        throw new Error('canShare returned false (sandbox blocks file share)');
      }
      await navigator.share({files:[preview.file],title:'Paintiano painting'});
      setPreviewMsg({tone:'ok',text:'shared — saved if you tapped Save Image'});
    }catch(e){
      if(e&&e.name==='AbortError'){setPreviewMsg({tone:'ok',text:'share cancelled'});return;}
      setPreviewMsg({tone:'err',text:'Share blocked by sandbox: '+(e.message||e.name||'unknown')+'. Long-press the image below instead.'});
    }
  };

  const copyPreview=async()=>{
    if(!preview)return;
    setPreviewMsg({tone:'wait',text:'copying to clipboard…'});
    try{
      if(!navigator.clipboard||!window.ClipboardItem)throw new Error('Clipboard API not available');
      await navigator.clipboard.write([new ClipboardItem({'image/png':preview.file})]);
      setPreviewMsg({tone:'ok',text:'copied PNG to clipboard — paste it into Notes / Mail / Files'});
    }catch(e){
      setPreviewMsg({tone:'err',text:'Copy blocked by sandbox: '+(e.message||e.name||'unknown')+'. Long-press the image below.'});
    }
  };

  const closePreview=()=>{
    if(preview){try{URL.revokeObjectURL(preview.url);}catch(_){}}
    setPreview(null);
  };

  // ── View state (introduced v2.6.0) ───────────────────────────────────────
  // Setup view: idle, nothing on canvas, no live mode — show the full bright
  // control panel (Source / Mood / Color / Style). This is where exploration
  // and onboarding happen.
  // Active view: a painting exists, playback is running, a creation mode is
  // live, OR a source file is being processed (working) — collapse the setup
  // panel and give the screen to the canvas + transport. Including `working`
  // means picking Audio/Score/Image jumps straight to the canvas and shows the
  // transcription progress above it, instead of appearing to hang on setup.
  const [stayActive, setStayActive] = useState(false);
  // forceSetup lets "← Setup" show the setup panel WITHOUT destroying the
  // current painting — so you can change a setting or return to the canvas. It
  // overrides isActiveView; the "→ Canvas" resume button and picking a new
  // mood/source clear it.
  const [forceSetup, setForceSetup] = useState(false);
  const [immersive, setImmersive] = useState(false); // CSS fullscreen-ish painting view (works on iOS too)
  // First-visit onboarding (v3). Reads the localStorage flag synchronously
  // during initial state setup so we don't briefly flash the setup screen.
  // Feature-flagged via ONBOARDING_V3 — set it false in 01-core-head to disable
  // the feature entirely for everyone.
  const [showOnboarding, setShowOnboarding] = useState(()=>{
    if(!ONBOARDING_V3) return false;
    try { return typeof localStorage!=='undefined' && localStorage.getItem('paintiano_onboarded') !== '1'; }
    catch(_) { return false; } // localStorage unavailable (private mode etc.) → skip onboarding
  });
  // Onboarding phases:
  //   'preview' = the hero overlay is visible (fake painting + ▶ Play sample)
  //   'playing' = the user tapped ▶; overlay fades to reveal the real Paintiano
  //               canvas underneath while the sample plays
  //   'done'    = sample finished; small CTA bar appears over the canvas with
  //               "Try your own" (commit) and "Replay" (rewind) options
  const [onboardingPhase, setOnboardingPhase] = useState('preview');
  const dismissOnboarding = useCallback(()=>{
    setShowOnboarding(false);
    setOnboardingPhase('preview');
    try { localStorage.setItem('paintiano_onboarded', '1'); } catch(_){}
  },[]);
  // Anything the user can return to: a painting on the canvas, a live mode, or a
  // parked compose/mic draft. This drives the shared '← Canvas' (Resume) button so
  // the Setup⇄Canvas navigation is consistent across ALL modes.
  const hasContent = chords.length>0 || composeMode || micActive || micArmed || hasComposeDraft || hasMicDraft;
  const isActiveView = !forceSetup && (playing || chords.length>0 || composeMode || micActive || micArmed || working || stayActive);
  // Immersive painting view is CSS-based (native Fullscreen API doesn't cover
  // non-video elements on iOS). Lock page scroll + ESC to exit; auto-exit when
  // we leave the canvas (Clear / back to Setup).
  useEffect(()=>{
    if(!immersive) return;
    const prevOverflow=document.body.style.overflow; document.body.style.overflow='hidden';
    const onKey=e=>{ if(e.key==='Escape') setImmersive(false); };
    window.addEventListener('keydown',onKey);
    return ()=>{ document.body.style.overflow=prevOverflow; window.removeEventListener('keydown',onKey); };
  },[immersive]);
  useEffect(()=>{ if(!isActiveView && immersive) setImmersive(false); },[isActiveView,immersive]);
  // Watch for the onboarding sample finishing — once the user is in 'playing'
  // phase and playback has stopped at the end, flip to 'done' so the CTA bar
  // appears. Guarded by showOnboarding so it doesn't fire on normal use.
  useEffect(()=>{
    if(!showOnboarding) return;
    if(onboardingPhase !== 'playing') return;
    if(chords.length === 0) return;
    if(!playing && disp >= chords.length) setOnboardingPhase('done');
  },[showOnboarding, onboardingPhase, playing, disp, chords.length]);
  // ── Auto-hide the fullscreen control during playback (video-player pattern) ──
  // While a painting is actively playing, the corner fullscreen button fades out
  // after a short idle period so it stops covering the artwork. Any pointer move
  // or tap on the canvas wakes it again, then it re-arms the idle timer. When not
  // playing it stays visible (it's the way INTO immersive view). Driven by a ref
  // timer so per-pixel pointer moves don't thrash React state.
  const [controlsAwake, setControlsAwake] = useState(true);
  const controlsIdleRef = useRef(null);
  const wakeControls = useCallback(()=>{
    setControlsAwake(true);
    if(controlsIdleRef.current) clearTimeout(controlsIdleRef.current);
    // Hide the floating exit button after a short idle. During playback this
    // applies everywhere; in fullscreen (immersive) it also applies once the
    // piece has FINISHED and is sitting still — so the canvas can be admired as
    // a clean artwork. A tap / pointer move calls wakeControls again to reveal.
    if(playing || immersive){ controlsIdleRef.current = setTimeout(()=>setControlsAwake(false), 2500); }
  },[playing,immersive]);
  // When playback stops, reveal controls. Outside fullscreen they then stay put;
  // in fullscreen we re-arm the idle countdown so a finished, still piece also
  // fades its controls. Entering/leaving fullscreen re-evaluates this.
  useEffect(()=>{
    if(controlsIdleRef.current) clearTimeout(controlsIdleRef.current);
    setControlsAwake(true);
    if(playing || immersive){ wakeControls(); }
    return ()=>{ if(controlsIdleRef.current) clearTimeout(controlsIdleRef.current); };
  },[playing,immersive,wakeControls]);
  // Latch stayActive whenever we're genuinely active (content on canvas, a live
  // mode, or processing). Once latched, Clear can empty the canvas without
  // bouncing back to setup; only "← Setup" un-latches it.
  useEffect(()=>{
    if(playing||chords.length>0||composeMode||micActive||working){ setStayActive(true); }
  },[playing,chords.length,composeMode,micActive,working]);
  // A file source or a live mode taking over the canvas ends the mood context,
  // so the "+ New mood" button gives way to the right "+ New <source>" affordance.
  // We also LATCH the file source type into sourceContext, which survives Clear,
  // so the "+ New <source>" button persists after clearing just like "+ New mood".
  useEffect(()=>{
    if(loadedSource||composeMode||micActive){ setMoodContext(false); }
    if(loadedSource){ setSourceContext(loadedSource); }
  },[loadedSource,composeMode,micActive]);
  // Mood and file source are mutually exclusive contexts: entering the mood
  // context drops the file-source latch so only one "+ New …" button shows.
  useEffect(()=>{ if(moodContext) setSourceContext(null); },[moodContext]);
  // Any newly-started activity (processing a file, entering compose/mic, or
  // playback beginning) returns us to the canvas even if we were parked on the
  // setup panel via "← Setup".
  useEffect(()=>{
    if(working||composeMode||micActive||playing){ setForceSetup(false); }
  },[working,composeMode,micActive,playing]);
  // When we (re)enter the canvas view, the <canvas> element may have just
  // remounted blank (it's gated by isActiveView). Bump stamp so the paint
  // effect re-runs and repaints the existing painting onto the fresh canvas.
  useEffect(()=>{
    if(isActiveView){ requestAnimationFrame(()=>setStamp(s=>s+1)); }
    // Attributes (color/style/scan) now live in the canvas strip, not the setup
    // screen. Auto-open the strip on entering the canvas so the user sees them
    // straight away; it auto-closes on Play (see startPlay) to free the canvas.
    // EXCEPTION: in Compose / Mic modes the canvas IS the workspace — keep the
    // strip collapsed so the full plate is visible while composing/singing.
    // (Play/Resume close the strip explicitly in their handlers; we don't gate on
    // `playing` here so the strip doesn't pop back open when playback ends.)
    if(isActiveView && !composeMode && !micActive){ setStripOpen(true); }
    else { setStripOpen(false); }
  },[isActiveView,composeMode,micActive]);
  const isSetupView = !isActiveView;

  return (
    <div style={{background:'radial-gradient(ellipse at 50% -10%,#0e0b16,#06060c 55%)',minHeight:'100vh',width:'100%',maxWidth:'100vw',overflowX:'hidden',boxSizing:'border-box',display:'flex',flexDirection:'column',alignItems:'center',padding:isActiveView?((composeMode||micActive)?'4px 16px 200px':'12px 16px 220px'):'48px 16px',fontFamily:"'Outfit','Helvetica Neue','PingFang SC','PingFang TC','Hiragino Sans GB','Microsoft YaHei','Microsoft JhengHei',Arial,sans-serif",color:PF.cream,touchAction:'manipulation'}}>
      <style dangerouslySetInnerHTML={{__html:`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,600;1,400&family=Outfit:wght@300;400;500;600;700&display=swap');`+PF_STYLE+`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pfDemoFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes pfPulse{0%,100%{transform:scale(1);box-shadow:0 6px 22px rgba(240,192,64,.45)}50%{transform:scale(1.04);box-shadow:0 8px 28px rgba(240,192,64,.65)}}@keyframes pfFloat{0%,100%{transform:translate(0,0)}50%{transform:translate(0,-6px)}}`}}/>
      {showIntro && <IntroSplash onDone={()=>setShowIntro(false)} tagline={'paintings, played'} skipLabel={'tap to skip'} />}
      {showOnboarding && !showIntro && (()=>{
        // First-visit hero. Shows a Miró-style preview of what Paintiano produces,
        // a big play CTA that loads the trimmed Liszt sample (30 s) and starts
        // playback, and a quiet "skip" link for users who'd rather explore on
        // their own. Both paths mark the localStorage flag and unmount this
        // overlay; the standard setup screen mounted underneath then takes over.
        const playSample = async ()=>{
          // Visual prefs that pair well with the sample piece.
          setStyle('miro');
          setMode('spectral');
          // Load events (fills chord state + grid + viewMode='paint').
          loadSampleMidiTrimmed(30000);
          // Switch to 'playing' phase — overlay fades to reveal the real
          // Paintiano canvas underneath. We do NOT dismiss the onboarding yet:
          // the user sees the painting build chord-by-chord on the actual
          // canvas (not a fake mockup), and when playback ends our completion
          // useEffect flips the phase to 'done' for the CTA bar.
          setOnboardingPhase('playing');
          // Auto-play kicks in after a short delay so React commits the chord
          // state first.
          setTimeout(()=>{ try { startPlay && startPlay(); } catch(_){} }, 280);
        };
        const replaySample = ()=>{
          setOnboardingPhase('preview');
          // Slight delay so the overlay re-opens cleanly before we start over.
          setTimeout(()=> playSample(), 80);
        };
        const commitAndExit = ()=>{
          // User chose "Try your own" — clear the sample painting so they land
          // on a clean setup screen, then dismiss the onboarding.
          try { stopAll(); wipeCanvasNow(); } catch(_){}
          dismissOnboarding();
        };
        // ── PHASE: 'playing' — the user tapped ▶. We render a full-bleed dark
        //    overlay with the title + "Liszt × Miró" caption at the top and a
        //    transparent "window" in the middle that reveals the real Paintiano
        //    canvas drawing underneath. The rest of the app chrome (setup tiles,
        //    header nav) is hidden behind the overlay, so visually the painting
        //    appears to happen INSIDE the onboarding box — no jump-to-canvas
        //    surprise. The window's position roughly matches where canvas sits
        //    in the app layout; CSS-only solution, no DOM moves.
        if(onboardingPhase === 'playing'){
          return (
            <div style={{position:'fixed',inset:0,zIndex:99998,display:'flex',flexDirection:'column',pointerEvents:'auto',animation:'pfDemoFade .4s ease-out'}}>
              {/* Top dark band — title + caption */}
              <div style={{background:'radial-gradient(ellipse at 50% 120%, #0e0b16, #06060c 70%)',padding:'36px 16px 18px',textAlign:'center',flexShrink:0}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:600,fontSize:'1.8rem',color:PF.gold,letterSpacing:'-.01em'}}>Paintiano</div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:'.85rem',color:'rgba(242,238,232,.65)',marginTop:4}}>
                  <span style={{color:PF.gold2}}>Liebestraum — Liszt</span> &nbsp;·&nbsp; painted by Miró
                </div>
              </div>
              {/* Transparent middle — canvas underneath shows through. We give
                  it min-height to ensure the canvas region (under the overlay
                  in the normal layout) is fully framed. */}
              <div style={{flex:'1 1 auto',background:'transparent',minHeight:'min(70vh, 480px)'}}/>
              {/* Bottom dark band — masks setup chrome below the canvas */}
              <div style={{background:'radial-gradient(ellipse at 50% -20%, #0e0b16, #06060c 70%)',padding:'18px 16px 28px',textAlign:'center',flexShrink:0,minHeight:80}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:'.75rem',color:'rgba(242,238,232,.45)',letterSpacing:'.04em'}}>
                  watch as each chord becomes a brushstroke…
                </div>
              </div>
            </div>
          );
        }
        // ── PHASE: 'done' — sample finished. Render only a CTA bar pinned to
        //    the bottom of the viewport, over the finished painting which sits
        //    on the real canvas underneath. The painting is the hero now.
        if(onboardingPhase === 'done'){
          return (
            <div style={{position:'fixed',inset:0,zIndex:99998,pointerEvents:'none',display:'flex',flexDirection:'column',justifyContent:'flex-end',padding:'0 16px 32px',animation:'pfDemoFade .6s ease-out'}}>
              <div style={{pointerEvents:'auto',display:'flex',flexDirection:'column',alignItems:'center',gap:14,padding:'18px 16px 14px',background:'linear-gradient(to top, rgba(6,6,12,.95), rgba(6,6,12,.85) 65%, rgba(6,6,12,0))',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',borderRadius:'18px 18px 0 0',maxWidth:560,margin:'0 auto',width:'100%'}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:'.95rem',color:'rgba(242,238,232,.85)',textAlign:'center'}}>
                  Your painting will be uniquely yours
                </div>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <button onClick={replaySample} style={{padding:'11px 18px',background:'rgba(28,24,40,.6)',color:'rgba(207,197,168,.9)',border:'1px solid rgba(207,197,168,.3)',borderRadius:24,cursor:'pointer',fontFamily:'inherit',fontSize:'.7rem',fontWeight:600,letterSpacing:'.12em',textTransform:'uppercase',WebkitTapHighlightColor:'transparent'}}>↻ Replay</button>
                  <button onClick={commitAndExit} style={{padding:'13px 28px',display:'inline-flex',alignItems:'center',gap:6,color:'#0a0a12',background:'linear-gradient(135deg,'+PF.gold+','+PF.gold2+')',border:'1px solid '+PF.gold2,borderRadius:26,cursor:'pointer',fontFamily:'inherit',fontSize:'.8rem',fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',boxShadow:'0 6px 22px rgba(240,192,64,.35)',WebkitTapHighlightColor:'transparent'}}>Try your own ›</button>
                </div>
              </div>
            </div>
          );
        }
        // ── PHASE: 'preview' — hero overlay (default)
        return (
          <div style={{position:'fixed',inset:0,zIndex:99998,background:'radial-gradient(ellipse at 50% -10%,#0e0b16,#06060c 55%)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start',padding:'48px 16px 24px',overflowY:'auto',animation:'pfDemoFade .5s ease-out'}}>
            <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:600,fontSize:'2.4rem',color:PF.gold,letterSpacing:'-.01em',marginBottom:6,textAlign:'center'}}>Paintiano</h1>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:'1rem',color:'rgba(242,238,232,.7)',marginBottom:28,textAlign:'center'}}>music turns into paintings</div>
            <div onClick={playSample} role="button" aria-label="play sample" style={{position:'relative',width:'min(440px, 92vw)',aspectRatio:'1.4 / 1',borderRadius:18,border:'1px solid rgba(201,168,76,.3)',overflow:'hidden',background:'radial-gradient(ellipse at 30% 20%, #2a1545 0%, #100620 30%, #06060c 70%)',cursor:'pointer',boxShadow:'0 18px 60px rgba(0,0,0,.5)',animation:'pfFloat 4s ease-in-out infinite'}}>
              <div style={{position:'absolute',inset:0,backgroundImage:`
                radial-gradient(circle 7px at 18% 24%, #ffd07a 0%, transparent 100%),
                radial-gradient(circle 5px at 26% 32%, #5cc7ff 0%, transparent 100%),
                radial-gradient(circle 6px at 64% 18%, #ff6b9d 0%, transparent 100%),
                radial-gradient(circle 9px at 75% 38%, #ffd07a 0%, transparent 100%),
                radial-gradient(circle 4px at 42% 52%, #b4f0c8 0%, transparent 100%),
                radial-gradient(circle 8px at 32% 68%, #ff6b9d 0%, transparent 100%),
                radial-gradient(circle 6px at 56% 74%, #5cc7ff 0%, transparent 100%),
                radial-gradient(circle 5px at 78% 64%, #c9a84c 0%, transparent 100%),
                radial-gradient(circle 7px at 22% 80%, #ffd07a 0%, transparent 100%),
                radial-gradient(circle 4px at 88% 88%, #b4f0c8 0%, transparent 100%)
              `,opacity:.85}}/>
              <div style={{position:'absolute',inset:0,background:`
                linear-gradient(45deg, transparent 49%, rgba(255,200,120,.45) 49%, rgba(255,200,120,.45) 51%, transparent 51%) 30% 40% / 36px 2px no-repeat,
                linear-gradient(-45deg, transparent 49%, rgba(180,240,200,.55) 49%, rgba(180,240,200,.55) 51%, transparent 51%) 70% 50% / 28px 2px no-repeat
              `,opacity:.6}}/>
              <button onClick={(e)=>{e.stopPropagation(); playSample();}} style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',display:'inline-flex',alignItems:'center',gap:10,padding:'15px 28px',borderRadius:30,cursor:'pointer',fontFamily:'inherit',fontSize:'.95rem',fontWeight:700,letterSpacing:'.15em',textTransform:'uppercase',color:'#0a0a12',background:'linear-gradient(135deg,'+PF.gold+','+PF.gold2+')',border:'1px solid '+PF.gold2,boxShadow:'0 6px 22px rgba(240,192,64,.45)',animation:'pfPulse 2.2s ease-in-out infinite',WebkitTapHighlightColor:'transparent'}}>
                <span style={{fontSize:'1.1rem',lineHeight:1}}>▶</span>
                Play sample
              </button>
            </div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:'.95rem',color:'rgba(242,238,232,.65)',marginTop:18,textAlign:'center'}}>
              <span style={{color:PF.gold2}}>Liebestraum — Liszt</span> &nbsp;·&nbsp; painted in the style of Miró
            </div>
            <div style={{marginTop:30,maxWidth:'min(420px, 90vw)',fontSize:'.78rem',lineHeight:1.6,color:'rgba(242,238,232,.5)',textAlign:'center'}}>
              Paintiano listens to music — MIDI, your voice, audio, even an AI-composed mood — and turns each chord into a brushstroke. Every painting is unique.
            </div>
            <button onClick={dismissOnboarding} style={{marginTop:'auto',marginBottom:8,padding:'10px 24px',background:'transparent',border:'none',color:'rgba(242,238,232,.45)',fontFamily:'inherit',fontSize:'.7rem',fontWeight:500,letterSpacing:'.2em',textTransform:'uppercase',cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
              skip — let me explore
            </button>
          </div>
        );
      })()}
      <div style={{width:'100%',maxWidth:560,display:immersive?'none':'flex',justifyContent:'space-between',alignItems:'center',marginBottom:(composeMode||micActive)?8:20,position:'relative',zIndex:99999,visibility:showIntro?'hidden':'visible'}}>
        <nav style={{display:'flex',gap:18,fontSize:(0.6*effScale)+'rem',letterSpacing:'.16em',textTransform:'uppercase'}}>
          <span onClick={()=>setShowAbout(true)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();setShowAbout(true);}}} role="button" tabIndex={0} style={{cursor:'pointer',paddingBottom:2,borderBottom:'1px solid rgba(201,168,76,.3)',color:'rgba(201,168,76,.8)'}}>{t('concept')}</span>
          <span onClick={()=>{
            if(demoReelOn){ demoReelStop(); return; }
            if(busy)return;
            if(demoArmed){
              if(demoArmRef.current){clearTimeout(demoArmRef.current);demoArmRef.current=null;}
              setDemoArmed(false);
              demoPlay();
            }else if(!chords.length){
              demoPlay();
            }else{
              setDemoArmed(true);
              demoArmRef.current=setTimeout(()=>{setDemoArmed(false);demoArmRef.current=null;},3000);
            }
          }} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&!busy){e.preventDefault();e.stopPropagation();e.currentTarget.click();}}} role="button" tabIndex={busy?-1:0} aria-disabled={busy} style={{cursor:busy?'default':'pointer',paddingBottom:2,borderBottom:'1px solid '+(demoArmed?'rgba(255,140,120,.9)':'rgba(201,168,76,.3)'),color:busy?'rgba(201,168,76,.25)':demoArmed?'rgba(255,140,120,.95)':'rgba(201,168,76,.8)',transition:'color .15s ease, border-color .15s ease'}}>{demoArmed?t('demoConfirm'):t('demo')}</span>
          <span onClick={()=>setShowGuide(true)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();setShowGuide(true);}}} role="button" tabIndex={0} style={{cursor:'pointer',paddingBottom:2,borderBottom:'1px solid rgba(201,168,76,.3)',color:'rgba(201,168,76,.8)'}}>{t('guide')}</span>
          {!isPro && <span onClick={()=>setPaywallReason('settings')} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();setPaywallReason('settings');}}} role="button" tabIndex={0} style={{cursor:'pointer',paddingBottom:2,borderBottom:'1px solid rgba(201,168,76,.5)',color:'rgba(201,168,76,.9)',fontWeight:600}}>{t('proBadge')}</span>}
          {isPro && <span title={maskedEmail||''} style={{paddingBottom:2,color:'rgba(201,168,76,.7)',whiteSpace:'nowrap'}}>✓ {t('proManageActive')}</span>}
        </nav>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <button onClick={()=>setReadScale(rs=> rs>=1.5?1 : rs>=1.25?1.5 : 1.25)} aria-label={t('fsLabel')} title={t('fsLabel')+' · '+(readScale===1?'1×':readScale===1.25?'1.25×':'1.5×')} style={{padding:'4px 10px',background:readScale>1?'rgba(201,168,76,.12)':PF.faint,color:readScale>1?'rgba(220,180,90,.95)':PF.muted,border:'1px solid '+(readScale>1?'rgba(201,168,76,.4)':'rgba(242,238,232,.15)'),borderRadius:20,cursor:'pointer',fontSize:'.62rem',fontFamily:'inherit',letterSpacing:'.06em',display:'inline-flex',alignItems:'center',gap:5,fontWeight:600}}><span style={{fontSize:'.62rem'}}>A</span><span style={{fontSize:'.78rem',lineHeight:.9}}>A</span>{readScale>1&&<span style={{fontSize:'.5rem',opacity:.85,marginLeft:1}}>{readScale===1.25?'1.25×':'1.5×'}</span>}</button>
        <div style={{position:'relative'}}>
          {(() => {
            const LANG_META = {
              EN:{code:'EN',name:'English'},
              DE:{code:'DE',name:'Deutsch'},
              FR:{code:'FR',name:'Français'},
              ES:{code:'ES',name:'Español'},
              PT:{code:'PT',name:'Português'},
              SK:{code:'SK',name:'Slovenčina'},
              zh:{code:'ZH',name:'中文'},
              zhTW:{code:'ZH-TW',name:'繁體中文'},
            };
            const meta = LANG_META[lang] || {code:lang,name:lang};
            const pill = (code, active=false) => ({
              display:'inline-flex',alignItems:'center',justifyContent:'center',
              minWidth: code.length>2 ? 38 : 26, height:20,
              padding:'0 6px', borderRadius:4,
              background: active ? 'rgba(201,168,76,.18)' : 'rgba(242,238,232,.08)',
              border: active ? '1px solid rgba(201,168,76,.45)' : '1px solid rgba(242,238,232,.12)',
              color: active ? 'rgba(220,180,90,.95)' : 'rgba(207,197,168,.78)',
              fontSize:(.58*effScale)+'rem', fontWeight:600, letterSpacing:'.08em', fontFamily:'inherit',
            });
            return (
              <>
                <button onClick={()=>setLangOpen(v=>!v)} aria-label={`switch language (currently ${meta.name})`} aria-expanded={langOpen} title={`switch language (currently ${meta.name})`} style={{padding:'4px 8px 4px 4px',background:PF.faint,color:PF.muted,border:'1px solid rgba(242,238,232,.15)',borderRadius:20,cursor:'pointer',fontSize:(.62*effScale)+'rem',fontFamily:'inherit',letterSpacing:'.04em',display:'inline-flex',alignItems:'center',gap:5}}><span style={pill(meta.code,true)}>{meta.code}</span><span style={{fontSize:(.55*effScale)+'rem',opacity:.6}}>▾</span></button>
                {langOpen && (
                  <>
                    <div onClick={()=>setLangOpen(false)} style={{position:'fixed',inset:0,zIndex:50}}/>
                    <div style={{position:'absolute',top:'calc(100% + 6px)',right:0,minWidth:200,background:'rgba(16,12,24,0.97)',border:'1px solid rgba(201,168,76,.3)',borderRadius:8,padding:'6px 0',boxShadow:'0 12px 30px rgba(0,0,0,.6)',zIndex:51,backdropFilter:'blur(8px)'}}>
                      {LANGS.map(l => {
                        const m = LANG_META[l] || {code:l,name:l};
                        const active = l === lang;
                        return (
                          <div key={l} role="button" tabIndex={0}
                            onClick={()=>{changeLang(l);setLangOpen(false);}}
                            onKeyDown={(e)=>{if(e.key==='Enter'||e.key==='\u0020'){e.preventDefault();changeLang(l);setLangOpen(false);}}}
                            style={{padding:'8px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:11,fontSize:(.72*effScale)+'rem',color:active?'rgba(220,180,90,.95)':'rgba(242,238,232,.85)',background:active?'rgba(201,168,76,.06)':'transparent',fontWeight:active?500:400,letterSpacing:'.02em'}}>
                            <span style={pill(m.code,active)}>{m.code}</span>
                            <span style={{flex:1}}>{m.name}</span>
                            {active && <span style={{color:'rgba(201,168,76,.9)',fontSize:(.7*effScale)+'rem'}}>✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </div>
        </div>
      </div>
      <header style={{textAlign:'center',marginBottom:isActiveView?8:18}}>
        <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isActiveView?'clamp(1.6rem,7vw,2.2rem)':'clamp(3rem,15vw,4.5rem)',fontWeight:600,letterSpacing:'.03em',margin:'0 0 6px',lineHeight:1,background:`linear-gradient(135deg,${PF.gold2} 0%,${PF.gold} 50%,#c88a18 100%)`,WebkitBackgroundClip:'text',backgroundClip:'text',WebkitTextFillColor:'transparent'}}>Paintiano</h1>
        {isPro && <div style={{textAlign:'center',marginBottom:6}}><ProBadge t={t} readScale={readScale} /></div>}
        {!isActiveView && <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:'.85rem',letterSpacing:'.06em',color:pianoColor[piano]}}>{pianoLabel[piano]}</div>}
      </header>

      {/* ─────────────────────────────────────────────────────────────
          Control panel (introduced v2.6.0). Grouped into four labelled sections:
          Source → Color → Style → Mood. Layout/skin only — every button
          handler is identical to the prior version. Sections separated by spacing +
          hairline dividers; labels are tiny and faded (recede for return
          users, orient first-timers). lbl() / divider markup inline.
          ───────────────────────────────────────────────────────────── */}
      {isSetupView && (
      <div className="pf-fade" style={{width:'100%',maxWidth:560,display:'flex',flexDirection:'column',gap:14,marginBottom:18}}>

        {/* Resume — when you parked the current painting via "← Setup", this
            returns to the canvas without changing anything. Only shown when
            there's still content to go back to. */}
        {forceSetup && hasContent && (
          <button className="pf-lift" onClick={()=>{ if(chordsRef.current.length===0){ const o=draftOwnerRef.current||(hasComposeDraft?'compose':hasMicDraft?(micPreset==='music'?'listen':'sing'):null); if(o) restoreStash(o); } setForceSetup(false); }} style={{display:'inline-flex',alignSelf:'flex-start',alignItems:'center',gap:6,padding:'7px 14px',background:'rgba(201,168,76,.12)',color:PF.gold2,border:'1px solid rgba(201,168,76,.4)',borderRadius:22,cursor:'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>← {t('backToCanvas')}</button>
        )}

        {/* ── MAIN PANEL ── mood · source (color/style/scan live in the canvas
            attributes strip, shown contextually after a source is picked) ── */}
        <div style={{background:PF.card,border:'1px solid rgba(242,238,232,.07)',borderRadius:20,padding:20,display:'flex',flexDirection:'column',gap:18}}>

          {/* MOOD — single entry point. Opens the same showMoodMenu modal as
              "+ NEW MOOD" on the canvas screen, where input, suggestions, recents
              and the mood grid live together. Keeps setup minimal and means there
              is one canonical mood UX shared across the app. */}
          <div>
            <div style={{fontSize:(.5*effScale)+'rem',fontWeight:600,letterSpacing:'.2em',color:'rgba(242,238,232,0.6)',marginBottom:10,textTransform:'uppercase'}}>{t('moodLabel')}</div>
            <button onClick={()=>{ if(sourcePickerLocked)return; setMoodEdit(''); setShowMoodMenu(true); }} disabled={sourcePickerLocked} className="pf-lift" title={t('moodHowFeel')} style={{width:'100%',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,padding:'13px',borderRadius:14,cursor:sourcePickerLocked?'default':'pointer',background:'transparent',border:'1px solid rgba(201,168,76,.35)',color:'rgba(220,180,90,.95)',fontFamily:'inherit',fontSize:(.62*effScale)+'rem',fontWeight:600,letterSpacing:'.12em',textTransform:'uppercase',opacity:sourcePickerLocked?0.4:1}}>
              <span style={{fontSize:'1.05rem'}}>✦</span>
              {t('moodHowFeel')}
            </button>
          </div>

          {/* Mood from image — standalone AI source: pick a picture → AI composes its mood */}
          <div style={{marginBottom:14}}>
            <button onClick={()=>{ if(!imgAiBusy&&!sourcePickerLocked&&aiUsable){ if(moodFromImg&&chords.length>0){ setForceSetup(false); return; } setPickMode('imgmood'); } }} disabled={imgAiBusy||!aiUsable} className="pf-lift" title={!aiUsable?(t('aiOfflineHint')||'AI features need a connection'):(t('imgMood')||'mood from image')} style={{width:'100%',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,padding:'13px',borderRadius:14,cursor:(imgAiBusy||!aiUsable)?'default':'pointer',background:(moodFromImg&&chords.length>0)?'rgba(220,150,255,.20)':'transparent',border:'1px solid '+((moodFromImg&&chords.length>0)?'rgba(220,150,255,.75)':'rgba(220,150,255,.35)'),color:(imgAiBusy||!aiUsable)?'rgba(225,175,255,.5)':'rgba(228,178,255,.95)',fontFamily:'inherit',fontSize:(.62*effScale)+'rem',fontWeight:600,letterSpacing:'.12em',textTransform:'uppercase',opacity:!aiUsable?.5:1}}><span style={{fontSize:'1.05rem'}}>{imgAiBusy?'⏳':'✦'}</span>{imgAiBusy?'…':(t('imgMood')||'mood from image')}{!aiUsable&&<span style={{fontSize:(.5*effScale)+'rem',opacity:.8,fontWeight:600,letterSpacing:'.08em'}}>· {t('aiOffline')||'offline'}</span>}</button>
          </div>
          <div style={{height:1,background:'rgba(242,238,232,.06)'}}/>

          {/* SOURCE — input tiles, split into IMPORT (files) and CREATE (live) */}
          <div>
            <div style={{fontSize:(.5*effScale)+'rem',fontWeight:600,letterSpacing:'.2em',color:'rgba(242,238,232,0.6)',marginBottom:10,textTransform:'uppercase'}}>{t('importLabel')}</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
              <button className="pf-tool pf-midi" onClick={()=>{if(importTileLocked)return;if(activeSource==='midi'){setForceSetup(false);return;}setPickMode('midi');}} disabled={importTileLocked} title={switchArmed==='midi'?t('switchConfirm'):recording?t('stopRecFirst'):t('midi')} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:7,padding:'14px 8px',borderRadius:14,cursor:'pointer',background:switchArmed==='midi'?'rgba(220,90,90,.18)':activeSource==='midi'?'rgba(91,156,246,.12)':'transparent',border:'1px solid '+(switchArmed==='midi'?'rgba(255,90,90,.6)':activeSource==='midi'?PF.blue:'rgba(91,156,246,.25)'),color:switchArmed==='midi'?'rgba(255,140,120,.95)':importTileLocked?'rgba(91,156,246,.3)':PF.blue,fontFamily:'inherit'}}><span className="pf-glyph" style={{fontSize:'1.35rem',lineHeight:1}}>♩</span><span style={{fontSize:(.56*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>{switchArmed==='midi'?t('switchConfirm'):t('midi').replace(/[^\p{L}]/gu,'')}</span></button>
              <button className="pf-tool pf-audio" onClick={()=>{if(importTileLocked)return;if(activeSource==='audio'){setForceSetup(false);return;}setPickMode('audio');}} disabled={importTileLocked} title={switchArmed==='audio'?t('switchConfirm'):recording?t('stopRecFirst'):t('audio')} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:7,padding:'14px 8px',borderRadius:14,cursor:'pointer',background:switchArmed==='audio'?'rgba(220,90,90,.18)':activeSource==='audio'?'rgba(244,124,60,.12)':'transparent',border:'1px solid '+(switchArmed==='audio'?'rgba(255,90,90,.6)':activeSource==='audio'?PF.orange:'rgba(244,124,60,.25)'),color:switchArmed==='audio'?'rgba(255,140,120,.95)':working&&wLabel.includes('audio')?PF.gold:importTileLocked?'rgba(244,124,60,.3)':PF.orange,fontFamily:'inherit'}}><span className="pf-glyph" style={{fontSize:'1.35rem',lineHeight:1}}>♪</span><span style={{fontSize:(.56*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>{switchArmed==='audio'?t('switchConfirm'):working&&wLabel.includes('audio')?wPct+'%':t('audio').replace(/[^\p{L}]/gu,'')}</span></button>
              <button className="pf-tool pf-score" onClick={()=>{if(importTileLocked)return;if(activeSource==='score'){setForceSetup(false);return;}setPickMode('score');}} disabled={importTileLocked} title={switchArmed==='score'?t('switchConfirm'):recording?t('stopRecFirst'):t('score')} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:7,padding:'14px 8px',borderRadius:14,cursor:'pointer',background:switchArmed==='score'?'rgba(220,90,90,.18)':activeSource==='score'?'rgba(169,127,245,.12)':'transparent',border:'1px solid '+(switchArmed==='score'?'rgba(255,90,90,.6)':activeSource==='score'?PF.purple:'rgba(169,127,245,.25)'),color:switchArmed==='score'?'rgba(255,140,120,.95)':working&&wLabel.includes('score')?PF.purple:importTileLocked?'rgba(169,127,245,.3)':PF.purple,fontFamily:'inherit'}}><span className="pf-glyph" style={{fontSize:'1.35rem',lineHeight:1}}>𝄞</span><span style={{fontSize:(.56*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>{switchArmed==='score'?t('switchConfirm'):working&&wLabel.includes('score')?wPct+'%':t('score').replace(/[^\p{L}]/gu,'')}</span></button>
              <button className="pf-tool pf-image" onClick={()=>{if(importTileLocked)return;if(activeSource==='image'){setForceSetup(false);return;}setPickMode('image');}} disabled={importTileLocked} title={switchArmed==='image'?t('switchConfirm'):recording?t('stopRecFirst'):t('image')} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:7,padding:'14px 8px',borderRadius:14,cursor:'pointer',background:switchArmed==='image'?'rgba(220,90,90,.18)':activeSource==='image'?'rgba(78,203,141,.12)':'transparent',border:'1px solid '+(switchArmed==='image'?'rgba(255,90,90,.6)':activeSource==='image'?PF.green:'rgba(78,203,141,.25)'),color:switchArmed==='image'?'rgba(255,140,120,.95)':importTileLocked?'rgba(78,203,141,.3)':PF.green,fontFamily:'inherit'}}><span className="pf-glyph" style={{fontSize:'1.35rem',lineHeight:1}}>◫</span><span style={{fontSize:(.56*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>{switchArmed==='image'?t('switchConfirm'):t('image').replace(/[^\p{L}]/gu,'')}</span></button>
            </div>
            <div style={{fontSize:(.5*effScale)+'rem',fontWeight:600,letterSpacing:'.2em',color:'rgba(242,238,232,0.6)',margin:'16px 0 10px',textTransform:'uppercase'}}>{t('createLabel')}</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <button className="pf-compose" onClick={()=>{
                if(busy)return;
                if(!composeMode&&(micPainting||micListening))return;
                if(!composeMode){
                  unlockAudio();
                  stopAll();
                  // Live composing grows `chords` note-by-note. The artist seed is
                  // a hash of all notes, so without locking it the overlay (esp.
                  // Kusama's all-over dot-field) re-randomises on every keystroke.
                  // Freeze the seed for the session (unless Random is on, which is
                  // meant to re-roll) so existing marks stay put and new notes just
                  // extend the painting.
                  if(!randomMode){ setStructureSeedLock((pollockSessionSeed>>>0)||1); }
                  const owner = draftOwnerRef.current;
                  if(owner==='compose'){
                    // Re-entering compose. If the canvas was wiped on the way to
                    // Setup (chords empty) but a stash exists, restore it so the
                    // un-played composition reappears. If the canvas still holds
                    // the draft (resume path), leave it as-is.
                    if((!chordsRef.current||!chordsRef.current.length)) restoreStash('compose');
                    setComposeMode(true); return;
                  }
                  if(owner) stashDraft(owner);
                  if(!restoreStash('compose')){
                    resetCanvasForDraft('compose');
                    setMidiBlob(null);setMidiName('');setAudioBlob(null);setAudioName('');
                    audioBlobRef.current=null;setCurrentMood(null);setVarySource(null);setSongQ('');setLoadedSource(null);
                  }
                  setComposeMode(true);
                  setMicArmed(false);
                } else setComposeMode(false);
              }} disabled={!composeMode && (busy || micPainting || micListening)} title={composeMode?t('composing'):busy?t('stopRecFirst'):micPainting?t('stopSingFirst'):micListening?t('stopListenFirst'):hasComposeDraft?t('compose')+' · draft saved':t('compose')} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:9,padding:14,borderRadius:14,cursor:'pointer',fontFamily:'inherit',fontSize:(.66*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase',color:composeMode||hasComposeDraft?'#eafff4':'rgba(120,200,160,.85)',background:(composeMode||hasComposeDraft)?'linear-gradient(135deg,#236b4f,#3a9b73)':'transparent',border:'1px solid '+((composeMode||hasComposeDraft)?'rgba(78,203,141,.65)':'rgba(78,203,141,.22)'),boxShadow:(composeMode||hasComposeDraft)?'0 0 0 1px rgba(78,203,141,.25), 0 4px 14px rgba(58,155,115,.25)':'none',opacity:(!composeMode&&(busy||micPainting||micListening))?.4:1,transition:'all .18s'}}>{(composeMode||hasComposeDraft)&&<span style={{width:7,height:7,borderRadius:'50%',background:'#4ecb8d',boxShadow:'0 0 6px #4ecb8d',flexShrink:0}}/>}♪ {composeMode?t('composing').replace(/[^\p{L} ]/gu,''):t('compose').replace(/[^\p{L} ]/gu,'')}</button>
              <button className="pf-mic" onClick={()=>{
                if(busy && !micActive) return;
                if(!micActive && composeMode) return;
                if(micActive){ if(micPainting) stopMicPainting(); if(micListening) stopMicListening(); setMicArmed(true); return; }
                // Open the MIC canvas in ARMED state — don't auto-start recording.
                // The user taps the big 🎙 REC in the centre of the canvas (or the
                // REC pill below it once any chords exist) to actually begin.
                // Clear all OTHER source contexts so the micArmed-reset effect
                // (which clears micArmed if any other source is active) doesn't
                // immediately undo our setMicArmed(true) below.
                if(draftOwnerRef.current && draftOwnerRef.current!=='sing' && draftOwnerRef.current!=='listen'){
                  stashDraft(draftOwnerRef.current); draftOwnerRef.current=null;
                }
                setComposeMode(false);
                setCurrentMood(null); setVarySource(null); setSongQ('');
                setMidiBlob(null); setMidiName(''); setAudioBlob(null); setAudioName(''); audioBlobRef.current=null;
                setLoadedSource(null);
                setMoodFromImg(false); setImgMoodThumb(null);
                setForceSetup(false);
                // Which preset's canvas to open. Rule:
                //   • draft in exactly ONE preset → open that one (don't strand it)
                //   • drafts in BOTH (or NEITHER) → last-active preset (micPreset)
                // This keeps the common cases (none / both) on the standard
                // last-active behaviour, and only redirects when a single
                // unfinished draft lives in the OTHER preset.
                const hasSing   = !!singStashRef.current;
                const hasListen = !!listenStashRef.current;
                const lastActiveOwner = micPreset==='music' ? 'listen' : 'sing';
                let presetOwner;
                if(hasSing && !hasListen)      presetOwner = 'sing';
                else if(hasListen && !hasSing) presetOwner = 'listen';
                else                           presetOwner = lastActiveOwner;  // both or none
                // Keep the visible preset toggle in sync with where we're routing,
                // so the canvas chrome (voice/music) matches the restored draft.
                const targetPreset = presetOwner==='listen' ? 'music' : 'voice';
                if(targetPreset!==micPreset) setMicPreset(targetPreset);
                if(!restoreStash(presetOwner)){
                  // No stash for this preset — clean armed canvas.
                  setChords([]); chordsRef.current=[]; idxRef.current=0;
                  composedModeRef.current=false; draftOwnerRef.current=null;
                  gridSigRef.current='';
                }
                setMicArmed(true);
                setStayActive(true);
              }} disabled={!micActive && (busy || composeMode)} title={micActive?t('micActive'):busy?t('stopRecFirst'):hasMicDraft?t('mic')+' · draft saved':t('mic')} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:9,padding:14,borderRadius:14,cursor:'pointer',fontFamily:'inherit',fontSize:(.66*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase',color:micActive?(micPreset==='voice'?'#ff8a8a':'#8accff'):'#f06aa6',background:micActive?(micPreset==='voice'?'rgba(255,80,80,.14)':'rgba(60,160,255,.14)'):hasMicDraft?'rgba(240,106,166,.14)':'transparent',border:'1px solid '+(micActive?(micPreset==='voice'?'rgba(255,120,120,.6)':'rgba(100,180,255,.6)'):'rgba(240,106,166,.4)'),opacity:(!micActive&&(busy||composeMode))?.4:1,transition:'all .18s'}}>🎙 {micActive?t('micActive').replace(/[^\p{L} ]/gu,''):t('mic').replace(/[^\p{L} ]/gu,'')}</button>
            </div>
          </div>

        </div>
      </div>
      )}

      {/* ── Active-view strip ── Color + Style stay reachable while a painting
          is on the canvas, without the full setup panel. Collapsed by default
          so the canvas keeps the room; tap the header to expand. ── */}
      {isActiveView && (
      <div ref={stripWrapRef} style={{width:'100%',maxWidth:480,marginBottom:(composeMode||micActive)?4:12}}>
        {/* Back to setup — abandons the current mood/source and returns to the
            clean setup screen. clear() resets chords + mood + source, which
            flips isActiveView back to false. */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:(composeMode||micActive)?4:8,position:'relative'}}>
          <button onClick={()=>{if(demoReelOn){demoReelStop();return;}if(recording)return;if(clearArmRef.current){clearTimeout(clearArmRef.current);clearArmRef.current=null;}setClearArmed(false);
            // Leaving to Setup while a painting is playing/paused should PRESERVE
            // the position so "← Canvas" (Resume) picks up exactly where it left
            // off — capture disp into resumeFromRef and pause, instead of the full
            // stopAll() reset. If nothing is playing, fall back to stopAll (fresh).
            // Going to Setup PRESERVES the position only when the user has
            // consciously PAUSED (holdPaused) — then "← Canvas"/Resume continues
            // where they stopped. If it was still actively PLAYING (or nothing was
            // going on), treat leaving as abandoning → full stopAll() reset.
            // Active playback (Score/MIDI/audio via startPlay sets playing; image
            // mosaic uses anim). Use the live refs so a fast Pause→leave or
            // Resume→leave reads the real state, not a one-render-stale snapshot.
            // Also treat running playback timers as "still live" — the surest sign.
            const isLive = playingRef.current || playing || anim || timers.current.length>0;
            const keepResume = holdPausedRef.current && !isLive && chords.length>0;
            // Stash any live creative draft (compose / mic) BEFORE we touch the
            // canvas. wipeCanvasNow() below empties chordsRef, and stashDraft only
            // saves a non-empty canvas — so stashing AFTER the wipe silently lost
            // an un-played composition. Stash first; setComposeMode/stopMic below
            // then just flip the mode off, draft safely preserved for ← Canvas.
            if(composeMode && draftOwnerRef.current==='compose') stashDraft('compose');
            if((micPainting||micListening) && (draftOwnerRef.current==='sing'||draftOwnerRef.current==='listen')) stashDraft(draftOwnerRef.current);
            // Save the compose performance to "Recently played" before tearing
            // down. Min 3 chords so accidental opens aren't saved. Captured here
            // (before wipeCanvasNow / clear) while chords still hold the user's notes.
            // If user Recall-ed an entry first (activeRecallId set), UPDATE that
            // entry to preserve identity; otherwise ADD a new entry. Either way
            // the recall id is reset after so the next session starts fresh.
            if(composeMode && chordsRef.current && chordsRef.current.length>=3){
              try{
                if(composeActiveRecallIdRef.current){
                  _composeRecentUpdate(composeActiveRecallIdRef.current, chordsRef.current, gridRef.current);
                } else {
                  _composeRecentAdd(chordsRef.current, gridRef.current);
                }
              }catch(_){}
            }
            composeActiveRecallIdRef.current=null;
            // Same save logic for Mic — voice and music share the helpers but
            // use separate stores. The preset at save time decides which store
            // gets the new entry. For updates we use the preset captured at
            // recall time so toggling preset after recall doesn't misroute.
            // NOTE: we check draftOwnerRef instead of live micPainting/micListening
            // because stopRecord → stopAll resets those flags to false BEFORE the
            // user gets to press Back. draftOwnerRef stays 'sing'/'listen' until
            // the mode actually ends, which is exactly when we need to save.
            const _micOwner = draftOwnerRef.current;
            if((_micOwner==='sing' || _micOwner==='listen') && chordsRef.current && chordsRef.current.length>=3){
              try{
                const updatePreset = micActiveRecallPresetRef.current;
                const addPreset    = _micOwner==='listen' ? 'music' : 'voice';
                if(micActiveRecallIdRef.current && updatePreset){
                  _micRecentUpdate(updatePreset, micActiveRecallIdRef.current, chordsRef.current, gridRef.current);
                } else {
                  _micRecentAdd(addPreset, chordsRef.current, gridRef.current);
                }
              }catch(_){}
            }
            micActiveRecallIdRef.current=null;
            micActiveRecallPresetRef.current=null;
            setMicContext(false);
            if(keepResume){
              resumeFromRef.current=dispRef.current; setHoldPaused(true);
              genRef.current++;timers.current.forEach(t=>clearTimeout(t));timers.current=[];timersSet.current.clear();
              try{if(samplerOk.current&&samplerRef.current)samplerRef.current.releaseAll();}catch(_){}
              try{if(audioElRef.current)audioElRef.current.pause();}catch(_){}
              try{if(audioSourceRef.current){audioSourceRef.current.stop();audioSourceRef.current.disconnect();audioSourceRef.current=null;}}catch(_){}
              setActive(new Set());setPlaying(false);setAnim(false);
            } else { stopAll(); wipeCanvasNow(); }
            setWorking(false);setWLabel('');setWPct(0);if(composeMode){setComposeMode(false);}if(micPainting||micListening){}if(micPainting)stopMicPainting();if(micListening)stopMicListening();setMicArmed(false);setStripOpen(false);setShowColorPalette(false);setCustomArmed(false);setSourceContext(null);if(!keepResume)setMoodContext(false);if(loadedSource==='image'){setSetupNoSel(true);}setForceSetup(true);
            // Back to setup = close any active AI recording window (no seal —
            // next Play after another Add/Recall reopens recording normally).
            if(aiRecordingRef.current){ setAiRecording(false); }}} disabled={recording} className="pf-lift" title={recording?t('stopRecFirst'):t('backToSetup')} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:'transparent',color:recording?'rgba(230,222,196,.2)':'rgba(230,222,196,.55)',border:'1px solid rgba(242,238,232,.1)',borderRadius:22,cursor:recording?'default':'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>← {t('backToSetup')}</button>
          {/* New file of the SAME source type — load another file without
              leaving the canvas. Shows the current mode (e.g. "+ NEW IMAGE").
              Only for file sources; to switch TYPE, use ← Setup. */}
          {(loadedSource || sourceContext) && !composeMode && !micActive && !moodContext && (()=>{ const srcBtn = loadedSource || sourceContext; return (
            <button onClick={()=>{if(recording||sourcePickerLocked)return;if(draftOwnerRef.current){stashDraft(draftOwnerRef.current);draftOwnerRef.current=null;}setPickMode(srcBtn);}} disabled={recording||sourcePickerLocked} className="pf-lift" title={((t('newBy')||{})[srcBtn]||t('newSource'))+' '+t(srcBtn).replace(/[^\p{L}]/gu,'')} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:'rgba(28,24,40,.5)',color:recording||sourcePickerLocked?'rgba(230,222,196,.25)':'rgba(230,222,196,.7)',border:'1px solid rgba(242,238,232,.15)',borderRadius:22,cursor:recording||sourcePickerLocked?'default':'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>+ {((t('newBy')||{})[srcBtn]||t('newSource'))} {t(srcBtn).replace(/[^\p{L}]/gu,'')}</button>
          ); })()}
          {/* New MOOD — opens an inline mood picker right over the canvas (no
              jump back to setup); picking one loads it immediately. Shown for the
              mood context (not a file source, not a live mode) — including AFTER
              Clear, when currentMood is null but we're still on the mood canvas. */}
          {!loadedSource && !composeMode && !micActive && moodContext && (
            moodFromImg ? (
            <button onClick={()=>{if(recording||sourcePickerLocked||!aiUsable)return;if(draftOwnerRef.current){stashDraft(draftOwnerRef.current);draftOwnerRef.current=null;}setPickMode('imgmood');}} disabled={recording||sourcePickerLocked||!aiUsable} className="pf-lift" title={!aiUsable?(t('aiOfflineHint')||'AI features need a connection'):(((t('newBy')||{}).image||t('newSource'))+' '+(t('backToImage')||'image'))} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:'rgba(28,24,40,.5)',color:(recording||sourcePickerLocked||!aiUsable)?'rgba(230,222,196,.25)':'rgba(225,175,255,.85)',border:'1px solid rgba(220,150,255,.3)',borderRadius:22,cursor:(recording||sourcePickerLocked||!aiUsable)?'default':'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase',opacity:!aiUsable?.5:1}}>+ {((t('newBy')||{}).image||t('newSource'))} {t('backToImage')||'image'}{!aiUsable&&<span style={{fontSize:(.5*effScale)+'rem',opacity:.8}}>· {t('aiOffline')||'offline'}</span>}</button>
            ) : (
            <button onClick={()=>{if(recording)return;setMoodEdit('');setShowMoodMenu(true);}} disabled={recording} className="pf-lift" title={((t('newBy')||{}).mood||t('newSource'))+' '+t('moodLabel')} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:'rgba(28,24,40,.5)',color:recording?'rgba(230,222,196,.25)':'rgba(230,222,196,.7)',border:'1px solid rgba(242,238,232,.15)',borderRadius:22,cursor:recording?'default':'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>+ {((t('newBy')||{}).mood||t('newSource'))} {t('moodLabel')}</button>
            )
          )}
          {/* ← back to image — shown after an image→atmosphere jump, restores the photo */}
          {imgReturnUrl && !composeMode && !micActive && moodContext && (
            <button onClick={()=>{if(recording)return;returnToImage();}} disabled={recording} className="pf-lift" title={t('backToImage')||'back to image'} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:'rgba(28,24,40,.5)',color:recording?'rgba(230,222,196,.25)':'rgba(225,175,255,.85)',border:'1px solid rgba(220,150,255,.3)',borderRadius:22,cursor:recording?'default':'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>← {t('backToImage')||'image'}</button>
          )}
          {/* ♪ Recently played — opens a picker of saved compose performances.
              Only visible in compose mode and only if any saved entries exist. */}
          {composeMode && composeRecent.length>0 && (
            <button onClick={()=>{if(recording)return;setShowComposeRecent(true);}} disabled={recording} className="pf-lift" title={t('recentPlayed')||'recently played'} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:'rgba(28,24,40,.5)',color:recording?'rgba(230,222,196,.25)':'rgba(230,222,196,.7)',border:'1px solid rgba(242,238,232,.15)',borderRadius:22,cursor:recording?'default':'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>♪ {t('recentPlayed')||'recent'}</button>
          )}
          {/* ♪ Recently played for Mic — preset-aware: voice store in voice mode,
              music store in music. Visible across the entire mic context window:
              from picking the mic source (armed) through active streaming and
              even after STOP REC (where micPainting/micListening flip false but
              the user is still on the mic canvas). micContext stays true until
              Back/Clear, so the button does too. */}
          {(micActive || micArmed || micContext) && ((micPreset==='voice' && micVoiceRecent.length>0) || (micPreset==='music' && micMusicRecent.length>0)) && (
            <button onClick={()=>{if(recording)return;setShowMicRecent(true);}} disabled={recording} className="pf-lift" title={t('recentPlayed')||'recently played'} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:'rgba(28,24,40,.5)',color:recording?'rgba(230,222,196,.25)':'rgba(230,222,196,.7)',border:'1px solid rgba(242,238,232,.15)',borderRadius:22,cursor:recording?'default':'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>♪ {t('recentPlayed')||'recent'}</button>
          )}
        </div>
        <button onClick={()=>{if(demoReelOn)return;setStripOpen(o=>!o);}} disabled={demoReelOn} aria-expanded={stripOpen} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:(composeMode||micActive)?'2px 0':'6px 0',background:'transparent',border:'none',cursor:demoReelOn?'default':'pointer',color:stripOpen?'rgba(201,168,76,.9)':'rgba(201,168,76,.7)',fontFamily:'inherit',fontSize:(.5*effScale)+'rem',letterSpacing:'.26em',textTransform:'uppercase',opacity:demoReelOn?.5:1,transition:'color .15s ease'}}>
          <span>{loadedSource==='image' ? (t('colorLabel') + ' · ' + t('dirLabel')) : (t('colorLabel') + ' · ' + t('styleLabel'))}</span>
          <span style={{fontSize:(.7*effScale)+'rem',transform:stripOpen?'rotate(180deg)':'none',transition:'transform .2s ease'}}>▾</span>
        </button>
        {loadedSource!=='image' && style && STYLE_INSPIRED[style] && (
          <div style={{textAlign:'center',marginTop:-2,marginBottom:2,fontSize:(.52*effScale)+'rem',letterSpacing:'.12em',color:'rgba(201,168,76,.6)',fontStyle:'italic',textTransform:'none'}}>{t('inspiredBy').replace('{artist}', STYLE_INSPIRED[style])}</div>
        )}
        {stripOpen && (
        <div style={{display:'flex',flexDirection:'column',gap:12,paddingTop:8,background:PF.card,border:'1px solid rgba(242,238,232,.07)',borderRadius:16,padding:14}}>
          {/* Morph / Vary — only for mood-based pieces (mood + mood-from-image),
              never for loaded MIDI/audio/score. Morph: text moods only. Vary: both. */}
          {moodContext && (
          <div style={{display:'grid',gridTemplateColumns:(!moodFromImg)?'1fr 1fr':'1fr',gap:8}}>
            {(!moodFromImg) && (
            <button className="pf-morph" onClick={()=>{
              if(sourcePickerLocked)return;
              // Morph cannot remix AI-generated moods (it only works against the
              // library/offline mood pool with known recipes). Show a clear gold
              // hint instead of opening a picker that would fail at commit time.
              if(composeSource==='ai'){
                setErr(t('morphAiUnavailable')||'Morph for AI generated mood unavailable');
                setErrInfo(true);
                return;
              }
              if(!currentMood){flashMoodHint();return;}
              if(!chords.length)return;
              const pre=morphTargets.filter(m=>MOODS.includes(m));
              setMorphSel(pre);
              setShowMorphMenu(true);
              const cached=morphPoolCacheRef.current[currentMood];
              if(cached){
                setMorphPool([...pre, ...cached.filter(m=>!pre.includes(m)).slice(0,18-pre.length)]);
                setMorphPoolSource('ai'); setMorphPoolLoading(false);
              } else {
                // okamžitý offline pool, kým AI dobehne
                setMorphPool([...pre, ...makeMorphPool(currentMood, pre)]);
                setMorphPoolSource('offline'); setMorphPoolLoading(true);
                const base=currentMood;
                fetchMorphPoolAI(base, pre).then(ai=>{
                  setMorphPoolLoading(false);
                  if(ai&&ai.length){
                    morphPoolCacheRef.current[base]=ai;
                    const cur=morphSelRef.current||pre;
                    setMorphPool([...cur, ...ai.filter(m=>!cur.includes(m)).slice(0,18-cur.length)]);
                    setMorphPoolSource('ai');
                  }
                });
              }
            }} disabled={sourcePickerLocked} title={recording?t('stopRecFirst'):composeSource==='ai'?(t('morphAiUnavailable')||'Morph for AI generated mood unavailable'):!currentMood?t('pickMoodFirst'):t('morphInto')} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:7,padding:'9px 16px',borderRadius:12,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:(.64*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase',color:'#fff',background:chords.length&&currentMood&&!sourcePickerLocked&&composeSource!=='ai'?'linear-gradient(135deg,#7c4df5,#a97ff5)':'rgba(124,77,245,.3)',opacity:chords.length&&currentMood&&!sourcePickerLocked&&composeSource!=='ai'?1:.55,transition:'all .18s'}}>{t('morph')}</button>
            )}
            <button className="pf-vary" onClick={()=>{
              // VARY is allowed while PLAYING (no need to pause first), but not
              // during compose/mic/recording/processing, and not on an empty
              // canvas. If it was playing, restart from the beginning with the
              // new variation; if NOT playing, just load it (don't auto-play).
              const varyBlocked = composeMode||micPainting||micListening||recording||working;
              if(varyBlocked) return;
              if(!varySource||!chords.length){flashMoodHint();return;}
              const varied=rerollSong(varySource, !randomMode);
              if(!varied)return;
              const wasPlaying=playing;
              // Random OFF → keep the picture STRUCTURE, change only colors+sound:
              // freeze the seed too (belt-and-braces with the pitch-only reroll).
              // Random ON → fresh structure: clear the lock.
              if(randomMode){ setStructureSeedLock(null); }
              else { setStructureSeedLock(pollockSessionSeed>>>0); }
              setVarySource(varied);
              stopAll();
              const evts=noteArr2events(varied.notes,varied.tempo);
              if(!evts.length){setErr(t('errs').varyFail);return;}
              // applyEvents clears imgMoodThumb; in mood-from-image mode we want the
              // small source picture to stay over the canvas, so capture + restore it.
              const _keepThumb = moodFromImg ? imgMoodThumb : null;
              applyEvents(evts,varied.title+' ·');
              if(_keepThumb){ setImgMoodThumb(_keepThumb); setMoodContext(true); }
              const bytes=encodeMidi(evts,varied.tempo||100);
              setMidiBlob(new Blob([bytes],{type:'audio/midi'}));
              setMidiName(varied.title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_')+'_var.mid');
              // If we're varying an MFI piece, keep the recent entry in sync with
              // the latest variation (replaces notes, keeps thumbnail + title).
              // So when user revisits via Recently AI generated, they get THIS
              // version — not the original AI generation.
              if(moodFromImg && currentMood){
                try{ _mfiRecentUpdate(currentMood, varied.notes, varied.tempo); }catch(_){}
              } else if(composeSource==='ai' && currentMood){
                // Same idea for AI Compose (text-mood path) — update its recent.
                try{ _aiComposeRecentUpdate(currentMood, varied.notes, varied.tempo); }catch(_){}
              }
              setVaryFlash(true);setTimeout(()=>setVaryFlash(false),350);
              // Keep the Color·Style strip OPEN after Vary so the user can keep
              // varying without re-expanding it each time. It stays open until the
              // user closes it themselves.
              setStripOpen(true);
              // Only restart playback if it was already playing. When stopped,
              // VARY just loads the new variation (canvas blank, ready to Play).
              // startPlay collapses the strip — re-open it just after so Vary's
              // "stay open" wins even when Vary restarts playback.
              if(wasPlaying){ resumeFromRef.current=0; setTimeout(()=>{ startPlayRef.current?.(); setStripOpen(true); }, 60); }
            }} disabled={composeMode||micPainting||micListening||recording||working||!chords.length} title={recording?t('stopRecFirst'):!varySource?t('pickMoodFirst'):t('reroll')} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:7,padding:'9px 16px',borderRadius:12,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:(.64*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase',color:'#fff',background:varySource&&chords.length&&!(composeMode||micPainting||micListening||recording||working)?'linear-gradient(135deg,#d4622a,#f47c3c)':'rgba(212,98,42,.3)',opacity:varySource&&chords.length&&!(composeMode||micPainting||micListening||recording||working)?1:.55,transition:'all .18s'}}>{t('vary')}</button>
          </div>
          )}
          {/* Color */}
          {loadedSource==='image' ? (() => {
            // IMAGE mode: the APP picks the reading from the painting's colourfulness
            // — colourful ⇒ Color (Harmony), near-monochrome ⇒ B/W. Only the chosen
            // one is shown (not both), next to Custom. Tapping the app chip activates
            // it and toggles a READ-ONLY preview of the 12 Harmony colours below
            // (looks like the Custom palette but can't be edited). Custom enters the
            // editable palette; tapping the app chip again returns to that reading.
            const appKey = appModeRef.current==='bw' ? 'bw' : 'color';
            const appLabel = appKey==='bw' ? t('bw') : t('colorLabel');
            const appActive = mode!=='custom';
            const customActive = mode==='custom';
            return (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:6}}>
                <button onClick={()=>{
                    if(mode==='custom'){
                      // leave Custom → back to the app's reading (no preview)
                      setCustomArmed(false); setShowColorPalette(false);
                      if(canvasRef.current){canvasRef.current.style.opacity='0';}
                      setTimeout(()=>{setMode(appModeRef.current||'harmony');if(canvasRef.current)canvasRef.current.style.opacity='1';},200);
                    } else {
                      // already on the app reading (Color or B/W) → toggle the read-only preview
                      setShowColorPalette(v=>!v);
                    }
                  }}
                  title={t('appChoseColour')}
                  style={{padding:'8px 0',textAlign:'center',fontSize:(.6*effScale)+'rem',fontWeight:600,letterSpacing:'.08em',fontFamily:'inherit',textTransform:'uppercase',cursor:'pointer',borderRadius:10,transition:'color .18s, background .18s, box-shadow .18s, border-color .18s',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',...chipStyle(appActive)}}>{appLabel}</button>
                <button onClick={()=>{
                    // Custom chip cycle:
                    //  1st tap (not custom yet) → activate Custom (label "Custom")
                    //  2nd tap (custom, not armed) → arm it; label becomes "edit palette",
                    //                                 editor stays CLOSED
                    //  3rd tap (custom, armed) → open the palette editor
                    // Closing the editor disarms (handled where the modal closes).
                    // Leaving Custom entirely is done via the Color/B-W chip.
                    if(!customActive){
                      if(canvasRef.current){canvasRef.current.style.opacity='0';}
                      setTimeout(()=>{setMode('custom');if(canvasRef.current)canvasRef.current.style.opacity='1';},200);
                      setCustomArmed(false);
                    } else if(!customArmed){
                      setCustomArmed(true);
                    } else {
                      setShowPaletteEditor(true);
                    }
                  }}
                  style={{padding:'8px 0',textAlign:'center',fontSize:(.6*effScale)+'rem',fontWeight:600,letterSpacing:'.06em',fontFamily:'inherit',textTransform:'uppercase',cursor:'pointer',borderRadius:10,transition:'color .18s, background .18s, box-shadow .18s, border-color .18s',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',...chipStyle(customActive)}}>{customActive&&customArmed?('✎ '+t('editShort')):t('custom')}</button>
              </div>
              {/* READ-ONLY preview of the 12 Harmony colours — shown when the Color
                  reading is active and the user tapped to reveal it. Purely
                  informational: the swatches can't be edited (Custom is for that). */}
              {appActive && showColorPalette && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:5,padding:'8px',borderRadius:10,background:'rgba(20,18,30,.4)',border:'1px solid rgba(242,238,232,.06)'}}>
                  {['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'].map((nm,pc)=>{
                    const [r,g,b]=colorPreview(appKey==='bw'?'bw':'harmony',pc);
                    return (
                      <div key={pc} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                        <div style={{width:'100%',aspectRatio:'1',borderRadius:6,background:`rgb(${r},${g},${b})`,border:'1px solid rgba(0,0,0,.25)'}} />
                        <span style={{fontSize:(.42*effScale)+'rem',letterSpacing:'.04em',color:PF.muted,opacity:.7}}>{nm}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* SCAN direction — the order pixels are read into music (image only) */}
              <div style={{fontSize:(.46*effScale)+'rem',fontWeight:600,letterSpacing:'.2em',color:PF.muted,marginTop:4,textTransform:'uppercase'}}>{t('dirLabel')}</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
                {['lr','vert','spiralIn','spiralOut'].map(d=>{
                  const sel = imgDir===d;
                  const locked = playing||holdPaused;
                  const glyph = d==='lr'?'☰':d==='vert'?'III':d==='spiralIn'?'⟳':'⟲';
                  return (
                    <button key={d} disabled={locked} onClick={()=>{ if(locked)return; setImgDir(d); }} style={{padding:'7px 0',textAlign:'center',fontSize:(.5*effScale)+'rem',fontWeight:600,letterSpacing:'.04em',fontFamily:'inherit',textTransform:'uppercase',cursor:locked?'default':'pointer',borderRadius:10,transition:'color .18s, background .18s, box-shadow .18s, opacity .18s',opacity:locked&&!sel?0.4:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',...chipStyle(sel)}}>{glyph} {t('dir_'+d)}</button>
                  );
                })}
              </div>
            </div>
            );
          })() : (<>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
              {['harmony','spectral','bw','custom'].map(m=>{
              const isCustomTab = m==='custom';
              const armed = isCustomTab && mode==='custom' && customArmed;
              return (
              <button key={m} className={mode===m?'pf-tab pf-tab-on':'pf-tab'} onClick={()=>{
                if(isCustomTab && mode==='custom'){
                  if(!customArmed) setCustomArmed(true); else setShowPaletteEditor(true);
                  return;
                }
                if(m==='custom') setCustomArmed(false);
                else if(mode===m){ setShowColorPalette(v=>!v); return; }   // tap active H/S/BW tab → toggle preview
                else setShowColorPalette(false);
                if(canvasRef.current){canvasRef.current.style.opacity='0';}
                setTimeout(()=>{setMode(m);if(canvasRef.current)canvasRef.current.style.opacity='1';},200);
              }} style={{padding:'8px 0',textAlign:'center',fontSize:(.6*effScale)+'rem',fontWeight:600,letterSpacing:'.06em',fontFamily:'inherit',textTransform:'uppercase',cursor:'pointer',borderRadius:10,transition:'color .18s, background .18s, box-shadow .18s, border-color .18s',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',...chipStyle(mode===m)}}>{armed?('✎ '+t('editShort')):t(m)}</button>
              );})}
            </div>
            {showColorPalette && mode!=='custom' && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:5,padding:'8px',borderRadius:10,background:'rgba(20,18,30,.4)',border:'1px solid rgba(242,238,232,.06)',marginTop:8}}>
                {['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'].map((nm,pc)=>{
                  const [r,g,b]=colorPreview(mode,pc);
                  return (
                    <div key={pc} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                      <div style={{width:'100%',aspectRatio:'1',borderRadius:6,background:`rgb(${r},${g},${b})`,border:'1px solid rgba(0,0,0,.25)'}} />
                      <span style={{fontSize:(.42*effScale)+'rem',letterSpacing:'.04em',color:PF.muted,opacity:.7}}>{nm}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>)}
          {/* Style — hidden in image mode: an artist re-paint makes no sense when
              the source already IS a painting; only the colour reading matters there. */}
          {loadedSource!=='image' && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:6,rowGap:8,alignItems:'center'}} title="painting style — mosaic is the plain reading with no artist overlay">
            {/* Mosaic = default; not glowing while Shuffle is drawing an artist. */}
            {(()=>{ const mosaicOn = style===null && !shuffleStyle; const mosaicInert = !mosaicOn && !!shuffleStyle; const canNotes = mosaicOn; const showNotes = canNotes && notesMode; return (
            <button onClick={()=>{ if(mosaicInert) return; if(style!==null){ selectStyle(style); return; } if(canNotes){ setNotesMode(v=>!v); } }} className={(mosaicOn?'pf-artist pf-artist-on':'pf-artist')+(mosaicInert?' pf-art-shuf':'')} title={mosaicInert?'shuffle is on — turn off 🎲 to use Mosaic':(canNotes?(showNotes?'notes — tap for colour mosaic':'mosaic — tap for note names'):'mosaic — the plain reading with no artist overlay')} style={{width:'100%',padding:'8px 4px',borderRadius:20,fontSize:(.54*effScale)+'rem',fontWeight:600,letterSpacing:'.04em',fontFamily:'inherit',textTransform:'uppercase',cursor:mosaicInert?'default':'pointer',whiteSpace:'nowrap',transition:'all .18s',...chipStyle(mosaicOn),...(mosaicInert?{color:PF.muted}:{})}}>{showNotes?t('notesStyle'):t('mosaicStyle')}</button>
            ); })()}
            {STYLE_PAIRS.map(([a,b])=>{
              // Which of the pair is active? Determines label + next target.
              const activeKey = style===a ? a : (style===b ? b : null);
              const isOn = activeKey!==null;
              // Shuffle (Random + no manual pick): highlight whichever button
              // holds the style the shuffle landed on, and show THAT style's
              // label so the cycling reads on the buttons themselves.
              const shufKey = (shuffleStyle===a || shuffleStyle===b) ? shuffleStyle : null;
              const shufHit = shufKey!==null;
              const label = STYLE_LABELS[activeKey || shufKey || a];
              // Cycle: nothing→A, A→B, B→mosaic (deselect), then A again.
              // The deselect step lets the user click back out to plain Mosaic
              // (and so re-enable 🎲 shuffle) without reaching for the Mosaic button.
              const onClick = ()=>{
                if(demoReelOn) return;
                if(style===a) setStyleTo(b);
                else if(style===b) setStyleTo(null);
                else setStyleTo(a);
              };
              const nextHint = style===a ? `tap for ${STYLE_LABELS[b]}` : (style===b ? 'tap for Mosaic' : '');
              return (
                <button key={a+'_'+b} className={isOn?'pf-artist pf-artist-on':'pf-artist'} onClick={onClick}
                  title={isOn ? `${STYLE_INSPIRED[activeKey]} — ${nextHint}` : (shufHit ? `🎲 ${STYLE_INSPIRED[shufKey]} — shuffle is painting this` : `${STYLE_LABELS[a]} / ${STYLE_LABELS[b]} — tap to paint, tap again to flip, again for Mosaic`)}
                  style={{width:'100%',padding:'8px 4px',borderRadius:20,fontSize:(.54*effScale)+'rem',fontWeight:600,letterSpacing:'.04em',fontFamily:'inherit',textTransform:'uppercase',cursor:'pointer',whiteSpace:'nowrap',transition:'all .18s',...chipStyle(isOn),...(!isOn&&shufHit?{border:'1px solid rgba(242,238,232,.7)',boxShadow:'0 0 0 1px rgba(242,238,232,.25)'}:{})}}>{label}</button>
              );
            })}
            {/* Random 🎲 + AI Artist ✦ — paired in the last grid cell. */}
            <div style={{justifySelf:'center',display:'flex',gap:6,alignItems:'center'}}>
              <button onClick={()=>{ setRandomMode(v=>{ const next=!v; if(next) setStructureSeedLock(null); else if(composeMode||micPainting) setStructureSeedLock((pollockSessionSeed>>>0)||1); return next; }); }} className="pf-artist pf-dice" title={randomMode?(style?'random ON · tap to turn off':'shuffle ON · each Play/Next paints a different artist style'):(style?'random OFF · tap to enable':'shuffle OFF · tap to shuffle across all artist styles')} aria-label={randomMode?t('randomOn'):t('randomOff')} style={{flexShrink:0,width:36,height:36,padding:0,display:'inline-flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',cursor:'pointer',transition:'all .18s',color:randomMode?'#ffd07a':PF.muted,background:randomMode?'rgba(255,200,120,.16)':PF.card2,border:'1px solid '+(randomMode?'rgba(255,200,120,.6)':'rgba(242,238,232,.08)'),boxShadow:randomMode?'0 0 0 1px rgba(255,200,120,.25)':'none'}}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>
              </button>
            </div>
          </div>
          )}
        </div>
        )}
      </div>
      )}

      {preview && (
        <div onClick={closePreview} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.94)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10011,padding:10,overflow:'auto'}}>
          <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="image preview" style={{maxWidth:'100%',display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
            <div style={{letterSpacing:'.12em',color:'rgba(201,168,76,.85)',fontSize:(.65*effScale)+'rem',textAlign:'center'}}>🖨 {preview.w}×{preview.h}{preview.dpi?` · ${preview.dpi}dpi`:''}{preview.label?' · '+preview.label:''} · {(preview.size/1024/1024).toFixed(1)} MB</div>
            {compositionName.trim()&&(<div style={{fontSize:(.6*effScale)+'rem',color:'rgba(201,168,76,.6)',textAlign:'center',letterSpacing:'.08em'}}>{compositionName}</div>)}
            <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center'}}>
              <button onClick={()=>{
                // Desktop (mouse + hover) always downloads straight to disk — on
                // Windows/desktop navigator.share exists but opens a Share panel
                // that usually can't save a file, so we bypass it there. Touch /
                // mobile devices use the share sheet (→ Save to Photos/Files),
                // falling back to <a download> if share is unavailable or fails.
                const isDesktop = typeof window!=='undefined' && window.matchMedia
                  && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
                const doDownload=()=>{
                  const a=document.createElement('a');
                  a.href=preview.url;a.download=preview.filename;
                  a.style.display='none';document.body.appendChild(a);a.click();document.body.removeChild(a);
                };
                if(!isDesktop && navigator.share){
                  navigator.share({files:[preview.file],title:preview.filename}).catch(()=>doDownload());
                } else {
                  doDownload();
                }
              }} style={{padding:'12px 20px',background:'rgba(140,180,255,.15)',color:'rgba(160,200,255,1)',border:'1px solid rgba(140,180,255,.6)',borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.12em',fontSize:(.75*effScale)+'rem',textTransform:'uppercase',fontWeight:'bold'}}>↓ {t('save')}</button>
              <button onClick={copyPreview} style={{padding:'12px 20px',background:'rgba(140,180,255,.06)',color:'rgba(160,200,255,.75)',border:'1px solid rgba(140,180,255,.3)',borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.12em',fontSize:(.75*effScale)+'rem',textTransform:'uppercase'}}>⎘ copy</button>
            </div>
            {previewMsg && (
              <div style={{fontSize:(.6*effScale)+'rem',padding:'8px 12px',borderRadius:4,maxWidth:340,textAlign:'center',lineHeight:1.4,wordBreak:'break-word',color:previewMsg.tone==='ok'?'rgba(140,255,180,.95)':previewMsg.tone==='wait'?'rgba(201,168,76,.85)':'rgba(255,140,120,.95)',border:'1px solid '+(previewMsg.tone==='ok'?'rgba(140,255,180,.4)':previewMsg.tone==='wait'?'rgba(201,168,76,.25)':'rgba(255,140,120,.3)'),background:previewMsg.tone==='ok'?'rgba(140,255,180,.08)':'transparent'}}>
                {previewMsg.text}
              </div>
            )}
            <img src={preview.url} alt={preview.filename} style={{maxWidth:'100%',maxHeight:'50vh',border:'1px solid rgba(201,168,76,.25)',borderRadius:4,display:'block',WebkitTouchCallout:'default'}}/>
            <div style={{fontSize:(.5*effScale)+'rem',color:'rgba(180,170,150,.4)',textAlign:'center',wordBreak:'break-all',padding:'0 8px',maxWidth:340}}>{preview.filename}</div>
            <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(180,170,150,.5)',textAlign:'center',padding:'0 14px',maxWidth:340,lineHeight:1.5}}>
              {(typeof window!=='undefined' && window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches)
                ? <>{t('saveAlternative')} <b>{t('saveRightClickHint')}</b> {t('saveRightClickTail')}</>
                : <>{t('saveAlternatives')} <b>{t('saveLongPressHint')}</b> {t('saveLongPressTail')}</>}
            </div>
            <button onClick={closePreview} style={{padding:'8px 22px',background:'transparent',color:'rgba(207,197,168,.6)',border:'1px solid rgba(207,197,168,.2)',borderRadius:4,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.12em',fontSize:(.55*effScale)+'rem',textTransform:'uppercase',marginTop:4}}>close</button>
          </div>
        </div>
      )}

      {/* Hidden file inputs — mounted ALWAYS (not inside the setup-view gate) so
          their refs are live whenever "Choose file" calls .click(), even on a
          fresh start. Previously they lived inside {isSetupView && …}; on a fresh
          load before any content, view timing could leave the ref stale so the
          file dialog never opened (it only worked after a sample had mounted them). */}
      <input ref={refMidi} type="file" accept="audio/midi,audio/x-midi,application/octet-stream,.mid,.midi" onChange={loadMidi} style={{display:'none'}}/>
      <input ref={refAudio} type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,.mp3,.wav,.ogg,.m4a,.aac" onChange={loadAudio} style={{display:'none'}}/>
      <input ref={refScore} type="file" accept="application/octet-stream" onChange={loadMusicXml} style={{display:'none'}}/>
      <input ref={refImage} type="file" accept="image/*" onChange={loadImage} style={{display:'none'}}/>
      <input ref={refImgMood} type="file" accept="image/*" onChange={loadImgMood} style={{display:'none'}}/>

      {pickMode && (
        <div onClick={()=>setPickMode(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}}>
          <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="choose input" style={{background:'#0a0a14',border:'1px solid rgba(201,168,76,.35)',borderRadius:10,padding:'22px 18px',minWidth:260,maxWidth:340}}>
            <div style={{textAlign:'center',marginBottom:18,letterSpacing:'.12em',color:'rgba(201,168,76,.75)',fontSize:(.65*effScale)+'rem'}}>
              {pickMode==='midi'?t('midiInput'):pickMode==='audio'?t('audioInput'):pickMode==='score'?t('scoreInput'):pickMode==='mic'?t('micInput'):pickMode==='imgmood'?(t('imgMood')||'mood from image'):t('imageInput')}
            </div>
            {pickMode==='mic' ? (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <button onClick={()=>{
                setMicPreset('voice');
                if(micListening) stopMicListening();
                startMicPainting();
                setPickMode(null);
              }} style={{padding:'12px',background:((micActive||hasMicDraft)&&micPreset==='voice')?'rgba(255,140,140,.16)':'transparent',color:'rgba(255,140,140,.9)',border:'1px solid '+(((micActive||hasMicDraft)&&micPreset==='voice')?'rgba(255,140,140,.85)':'rgba(255,140,140,.4)'),borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',fontSize:(.75*effScale)+'rem',boxShadow:((micActive||hasMicDraft)&&micPreset==='voice')?'0 0 0 2px rgba(255,140,140,.18)':'none'}}>
                {((micActive||hasMicDraft)&&micPreset==='voice')?'● ':''}{t('voicePreset')}
              </button>
              <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(180,170,150,.5)',textAlign:'center',padding:'0 8px',lineHeight:1.4}}>
                {t('micVoiceHint')}
              </div>
              <button onClick={()=>{
                setMicPreset('music');
                if(micPainting) stopMicPainting();
                startMicListening();
                setPickMode(null);
              }} style={{padding:'12px',background:((micActive||hasMicDraft)&&micPreset==='music')?'rgba(140,200,255,.16)':'transparent',color:'rgba(140,200,255,.9)',border:'1px solid '+(((micActive||hasMicDraft)&&micPreset==='music')?'rgba(100,180,255,.85)':'rgba(100,180,255,.4)'),borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',fontSize:(.75*effScale)+'rem',boxShadow:((micActive||hasMicDraft)&&micPreset==='music')?'0 0 0 2px rgba(100,180,255,.18)':'none'}}>
                {((micActive||hasMicDraft)&&micPreset==='music')?'● ':''}{t('musicPreset')}
              </button>
              <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(180,170,150,.5)',textAlign:'center',padding:'0 8px',lineHeight:1.4}}>
                {t('micMusicHint')}
              </div>
              <button onClick={()=>setPickMode(null)} style={{padding:'8px',background:'transparent',color:'rgba(180,170,150,.5)',border:'none',cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',fontSize:(.6*effScale)+'rem',marginTop:4}}>
                {t('cancel')}
              </button>
            </div>
            ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <button onClick={()=>{
                if(micPainting)stopMicPainting();if(micListening)stopMicListening();if(composeMode)setComposeMode(false);
                if(draftOwnerRef.current){stashDraft(draftOwnerRef.current);draftOwnerRef.current=null;}
                if(pickMode==='midi') loadSampleMidi();
                else if(pickMode==='audio') loadSampleAudio();
                else if(pickMode==='score') loadSampleScore();
                else if(pickMode==='imgmood') loadSampleImgMood();
                else loadSampleImage();
                setForceSetup(false);
                setPickMode(null);
              }} style={{padding:'12px',background:'transparent',color:pickMode==='midi'?'rgba(140,180,255,.85)':pickMode==='audio'?'rgba(255,180,100,.85)':pickMode==='score'?'rgba(210,150,255,.85)':pickMode==='imgmood'?'rgba(228,178,255,.95)':'rgba(120,220,170,.9)',border:'1px solid '+(pickMode==='midi'?'rgba(120,160,255,.4)':pickMode==='audio'?'rgba(255,160,80,.4)':pickMode==='score'?'rgba(200,120,255,.4)':pickMode==='imgmood'?'rgba(220,150,255,.45)':'rgba(78,203,141,.45)'),borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',fontSize:(.75*effScale)+'rem'}}>
                {t('builtInSample')}
              </button>
              <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(180,170,150,.5)',textAlign:'center',padding:'0 8px',lineHeight:1.4}}>
                {pickMode==='midi'?SAMPLE_MIDI_NAME:pickMode==='audio'?SAMPLE_AUDIO_NAME:pickMode==='score'?SAMPLE_SCORE_NAME:pickMode==='imgmood'?SAMPLE_IMAGE_MFI_NAME:SAMPLE_IMAGE_NAME}
              </div>
              <button onClick={()=>{
                if(pickMode==='midi') refMidi.current?.click();
                else if(pickMode==='audio') refAudio.current?.click();
                else if(pickMode==='score') refScore.current?.click();
                else if(pickMode==='imgmood') refImgMood.current?.click();
                else refImage.current?.click();
                // NOTE: do NOT setPickMode(null) here — doing so in the same tick
                // unmounts the hidden <input> before the browser's file dialog
                // opens, cancelling it (Choose File appeared to do nothing). The
                // loaders (loadMidi/loadAudio/loadScore/loadImage) close the modal
                // via setPickMode(null) once a file is actually selected.
              }} style={{padding:'12px',background:'transparent',color:'rgba(201,168,76,.85)',border:'1px solid rgba(201,168,76,.4)',borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',fontSize:(.75*effScale)+'rem'}}>
                {t('chooseFile')}
              </button>
              <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(180,170,150,.5)',textAlign:'center',padding:'0 8px',lineHeight:1.4}}>
                {pickMode==='midi'?'MIDI · .mid .midi':pickMode==='audio'?'.mp3 .wav .m4a .ogg .aac':pickMode==='score'?'MusicXML · .musicxml .xml .mxl':'.jpg .png .gif .webp .heic'}
              </div>
              {/* Recently AI generated — Pro feature. Free users see locked items;
                  tapping any opens the paywall via _mfiRecall. Only in MFI picker. */}
              {pickMode==='imgmood' && mfiRecent.length>0 && (
                <div style={{marginTop:6,display:'flex',flexDirection:'column',gap:6}}>
                  <div style={{fontSize:(.55*effScale)+'rem',letterSpacing:'.18em',textTransform:'uppercase',color:'rgba(242,238,232,.45)',textAlign:'center',marginTop:4,marginBottom:2}}>
                    {t('recentAiGenerated')||'Recently AI generated'}
                  </div>
                  {mfiRecent.map((entry)=>(
                    <button key={entry.id} onClick={()=>{ _mfiRecall(entry); setPickMode(null); }} style={{padding:'10px 12px',background:'transparent',color:'rgba(228,178,255,.85)',border:'1px solid rgba(220,150,255,.35)',borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',fontSize:(.7*effScale)+'rem',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                      <span style={{flex:1,textAlign:'left',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>✦ {entry.title}</span>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={()=>setPickMode(null)} style={{padding:'8px',background:'transparent',color:'rgba(180,170,150,.5)',border:'none',cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',fontSize:(.6*effScale)+'rem',marginTop:4}}>
                {t('cancel')}
              </button>
            </div>
            )}
          </div>
        </div>
      )}

      {err && (
        <div role={errInfo?'status':'alert'} aria-live={errInfo?'polite':'assertive'} style={{width:'100%',maxWidth:480,marginBottom:10,fontSize:(.6*effScale)+'rem',lineHeight:1.5,textAlign:'left',padding:'8px 12px',borderRadius:2,maxHeight:240,overflow:'auto',wordBreak:'break-word',fontFamily:'monospace',color:errInfo?'rgba(201,168,76,.85)':'rgba(255,100,80,.85)',border:errInfo?'1px solid rgba(201,168,76,.25)':'1px solid rgba(255,100,80,.2)',display:'flex',alignItems:'flex-start',gap:8}}>
          <span style={{flex:1}}>{errInfo?'𝄞 ':'✕ '}{err}</span>
          <button onClick={()=>{setErr('');setErrInfo(false);}} aria-label="dismiss" style={{flexShrink:0,background:'transparent',border:'none',color:'inherit',opacity:.5,cursor:'pointer',fontSize:(.85*effScale)+'rem',lineHeight:1,padding:'0 4px',fontFamily:'inherit'}}>×</button>
        </div>
      )}

      {working && (
        <div style={{width:'100%',maxWidth:480,marginBottom:10}}>
          <div style={{fontSize:(0.7*effScale)+'rem',letterSpacing:'.06em',marginBottom:6,textAlign:'center',color:'rgba(220,180,255,.95)',fontWeight:500}}>⟳ {wLabel}… {wPct}%</div>
          <div style={{height:3,background:'rgba(255,255,255,0.12)',borderRadius:2}}>
            <div style={{height:'100%',width:wPct+'%',background:'rgba(210,140,255,.85)',borderRadius:2,transition:'width .3s'}}/>
          </div>
        </div>
      )}

      {(() => {
        // Body 8: in image mode with AI atmosphere ON, the seek row shows the
        // AI-detected title + atmosphere word (same form as Mood from Image),
        // flagged with the ✦ AI badge — replacing the separate blue pill above.
        const _atmoWordSeek=(v,e)=>{
          if(e>=0.62) return v>=0.15?'dramatic':v<=-0.2?'tense':'intense';
          if(e<=0.32) return v>=0.2?'serene':v<=-0.2?'melancholic':'calm';
          return v>=0.3?'joyful':v<=-0.3?'sombre':'reflective';
        };
        const _imgAtmo = (viewMode==='image' && originalImgUrl && atmoOn && atmoMood);
        const _atmoTitle = _imgAtmo ? (()=>{ const w=_atmoWordSeek(atmoMood.v,atmoMood.e); const ti=(atmoMood.title&&String(atmoMood.title).trim())||''; return ti?(ti+' · '+w):w; })() : null;
        const seekTitle = _atmoTitle || (info ? info.title : (composeMode ? t('compose').replace(/[^\p{L} ]/gu,'') : t('mic').replace(/[^\p{L} ]/gu,''))); const seekDur = info ? info.dur : Math.round((chords[chords.length-1]?.startMs||0)/1000)||0; const showTransport = !!info || (chords.length>0 && (playing||holdPaused) && !micPainting && !micListening); return showTransport && (
        <div style={{width:'100%',maxWidth:(viewMode==='image'&&originalImgUrl)?`min(100%, 560px)`:`min(100%, ${CW}px)`,marginLeft:'auto',marginRight:'auto',boxSizing:'border-box',marginBottom:8}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:(.57*effScale)+'rem',marginBottom:4}}>
            <span style={{display:'inline-flex',alignItems:'center',gap:6,maxWidth:'72%',overflow:'hidden'}}><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',opacity:seekTitle.includes('→')?0.85:0.5,color:seekTitle.includes('→')?'rgba(220,170,255,.9)':'inherit',fontSize:seekTitle.includes('→')?'.62rem':'.57rem',fontStyle:seekTitle.includes('→')?'italic':'normal'}}>{seekTitle}</span>{(moodContext&&composeSource)?(<span style={{flexShrink:0,fontSize:(.46*effScale)+'rem',letterSpacing:'.08em',textTransform:'uppercase',padding:'1px 5px',borderRadius:6,whiteSpace:'nowrap',color:composeSource==='ai'?'rgba(220,170,255,.95)':composeSource==='crafted'?'rgba(201,168,76,.95)':'rgba(207,197,168,.7)',border:'1px solid '+(composeSource==='ai'?'rgba(220,170,255,.4)':composeSource==='crafted'?'rgba(201,168,76,.4)':'rgba(207,197,168,.25)')}}>{composeSource==='ai'?'✦ AI':composeSource==='crafted'?'♪ library':'offline'}</span>):(_imgAtmo&&(<span style={{flexShrink:0,fontSize:(.46*effScale)+'rem',letterSpacing:'.08em',textTransform:'uppercase',padding:'1px 5px',borderRadius:6,whiteSpace:'nowrap',color:'rgba(220,170,255,.95)',border:'1px solid rgba(220,170,255,.4)'}}>✦ AI</span>))}</span>
            <span style={{opacity:.75}}>
              {disp}/{chords.length} · {playing&&disp>0&&disp<=chords.length?(()=>{const elapsedS=(chords[disp-1]?.startMs||0)/1000/playbackSpeed;const remS=Math.max(0,Math.round(seekDur/playbackSpeed-elapsedS));return remS+t('sLeft');})():seekDur+'s'}
            </span>
          </div>
          <div
            role="slider"
            aria-label="playback position"
            aria-valuemin={0}
            aria-valuemax={Math.max(0,chords.length-1)}
            aria-valuenow={Math.min(disp,Math.max(0,chords.length-1))}
            aria-valuetext={`chord ${Math.min(disp,chords.length)} of ${chords.length}`}
            tabIndex={chords.length?0:-1}
            onPointerDown={e=>{
              if(!chords.length)return;
              e.preventDefault();
              // Capture so subsequent moves/up fire even if the pointer leaves
              // the track — matches native <input type=range> drag behaviour.
              try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}
              const rect=e.currentTarget.getBoundingClientRect();
              const frac=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
              const idx=Math.min(Math.floor(frac*chords.length),chords.length-1);
              stopAll();
              resumeFromRef.current=idx;
              setDisp(idx);
            }}
            onPointerMove={e=>{
              // Only drag-scrub while pointer is captured (i.e. button held).
              // Pointer-capture is the cross-browser way to detect "is this a
              // drag" without tracking mousedown state manually.
              if(!chords.length)return;
              if(!e.currentTarget.hasPointerCapture||!e.currentTarget.hasPointerCapture(e.pointerId))return;
              e.preventDefault();
              const rect=e.currentTarget.getBoundingClientRect();
              const frac=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
              const idx=Math.min(Math.floor(frac*chords.length),chords.length-1);
              setDisp(idx);
              resumeFromRef.current=idx;
            }}
            onPointerUp={e=>{
              if(!chords.length)return;
              try{e.currentTarget.releasePointerCapture(e.pointerId);}catch(_){}
              const idx=resumeFromRef.current;
              startPlay();
              if(resumeFromRef.current===null&&idx!==null)resumeFromRef.current=idx;
            }}
            onKeyDown={e=>{
              if(!chords.length)return;
              const cur=Math.min(disp,chords.length-1);
              const step=Math.max(1,Math.floor(chords.length/20)); // ~5% jumps for PgUp/PgDn
              let next=cur;
              switch(e.key){
                case 'ArrowLeft':  case 'ArrowDown':  next=cur-1;          break;
                case 'ArrowRight': case 'ArrowUp':    next=cur+1;          break;
                case 'PageDown':                      next=cur-step;       break;
                case 'PageUp':                        next=cur+step;       break;
                case 'Home':                          next=0;              break;
                case 'End':                           next=chords.length-1;break;
                case 'Enter': case ' ':
                  // Enter/Space toggles play/pause from the slider — mirrors
                  // native <input type=range> behaviour where space activates.
                  e.preventDefault();
                  if(playing){stopAll();}else{startPlay();}
                  return;
                default: return;
              }
              e.preventDefault();
              next=Math.max(0,Math.min(chords.length-1,next));
              if(next!==cur){
                stopAll();
                resumeFromRef.current=next;
                setDisp(next);
              }
            }}
            style={{position:'relative',height:6,background:'rgba(255,255,255,0.06)',borderRadius:3,cursor:chords.length?'pointer':'default',marginTop:2,touchAction:'none',outline:focusedInput==='seek'?'2px solid rgba(201,168,76,.55)':'none',outlineOffset:3}}
            onFocus={()=>setFocusedInput('seek')}
            onBlur={()=>setFocusedInput(null)}>
            <div style={{height:'100%',width:pct+'%',background:playing?'rgba(90,190,110,.65)':'rgba(201,168,76,.45)',borderRadius:3,transition:'none',pointerEvents:'none'}}/>
          </div>
        </div>
      ); })()}

      {isActiveView && (<>
      {imgMoodThumb && moodContext && viewMode!=='image' && (()=>{
        // Body 11: before the mood plays, show the chosen picture large (like the
        // Image mode preview). Once playback begins / the mood pic has been drawn
        // (disp>0), it shrinks to the small thumbnail that sits over the canvas.
        const big = disp===0 && !playing && !anim;
        return (
          <div style={{display:'flex',justifyContent:'center',marginBottom:big?14:10,transition:'margin .25s ease'}}>
            <img src={imgMoodThumb} alt="source" style={{width:big?'100%':74,height:big?'auto':74,maxWidth:big?`min(100%, 360px)`:74,objectFit:'cover',borderRadius:big?14:10,border:'1px solid rgba(220,150,255,.45)',boxShadow:big?'0 4px 24px rgba(0,0,0,.55)':'0 2px 10px rgba(0,0,0,.4)',opacity:big?1:.88,transition:'all .3s ease'}}/>
          </div>
        );
      })()}
      {/* MFI Recent strip removed from here — now rendered inside the MFI picker
          as 'Recently AI generated' button + text labels (no thumbnails). */}
      {immersive && <div onClick={wakeControls} onPointerMove={wakeControls} style={{position:'fixed',inset:0,zIndex:9998,background:'#06060c'}}/>}
      <div ref={canvasWrapRef} style={{position:'relative',maxWidth:'100%',boxSizing:'border-box',border:varyFlash?'1px solid rgba(201,168,76,.8)':'1px solid rgba(201,168,76,.12)',boxShadow:varyFlash?'0 0 40px rgba(201,168,76,.25), 0 0 40px rgba(0,0,0,.6)':'0 0 40px rgba(0,0,0,.6)',marginBottom:8,transition:'border-color .15s ease, box-shadow .15s ease',transform:micVolActive?`scale(${1+micVolLevel*0.04})`:'none',transformOrigin:'center center',WebkitTouchCallout:'none',WebkitUserSelect:'none',userSelect:'none',...((composeMode||micActive)?{width:'100%',minWidth:0,maxWidth:`min(100%, ${CW}px)`,maxHeight:'calc(100dvh - 210px)',marginLeft:'auto',marginRight:'auto'}:(viewMode==='image'&&originalImgUrl)?{width:'100%',minWidth:0,maxWidth:`min(100%, 560px)`,marginLeft:'auto',marginRight:'auto'}:{width:'100%',minWidth:0,maxWidth:`min(100%, ${CW}px)`}),...(immersive?{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:`min(98vw, calc(98dvh * ${CW} / ${CH}))`,maxWidth:'none',maxHeight:'none',height:'auto',margin:0,zIndex:9999,border:'1px solid rgba(201,168,76,.25)'}:{})}}
        onContextMenu={e=>e.preventDefault()}
        onPointerMove={()=>{ if(playing||immersive) wakeControls(); }}
        onClick={e=>{
          // Any tap on the canvas reveals the fullscreen control and re-arms its
          // idle countdown (video-player pattern). Done before the demo-reel /
          // chord-select branches so it fires regardless of what the tap does.
          if(playing||immersive) wakeControls();
          // During the demo reel a canvas tap is the "escape" gesture — kill
          // the reel and stop processing the click (so we don't also try to
          // select a chord on the painting that's mid-render).
          if(demoReelOn){ demoReelStop(); return; }
          if(playing||!chords.length)return;
          const cv=canvasRef.current;if(!cv)return;
          const rect=cv.getBoundingClientRect();
          const scaleX=CW/rect.width, scaleY=CH/rect.height;
          const tx=(e.clientX-rect.left)*scaleX, ty=(e.clientY-rect.top)*scaleY;
          const hit=chords.find(c=>{
            const cell=grid.cells&&grid.cells[c.idx];
            if(!cell)return false;
            const segs=cell.segments||[cell];
            return segs.some(s=>tx>=s.x&&tx<=s.x+s.w&&ty>=s.y&&ty<=s.y+s.h);
          });
          if(!hit)return;
          // Selection + targeted delete only works in the mosaic reading. The
          // 'notes' overlay is still a mosaic (just labelled with note names), so
          // it counts as mosaic here — only true artist styles block selection,
          // because their cells are painted abstractly.
          if(composeMode || (holdPaused && composedModeRef.current)){
            const artistStyle = effectiveStyle && effectiveStyle!=='notes';
            if(artistStyle){
              const artist=STYLE_INSPIRED[effectiveStyle]||effectiveStyle;
              setErr(t('selectNeedsMosaic').replace('{artist}',artist));
              setErrInfo(true);
              return;
            }
            setSelectedChordIdx(prev=>{const v=prev===hit.idx?null:hit.idx;selectedChordIdxRef.current=v;return v;});  // tap again to deselect
          }
          unlockAudio();
          const midis=hit.n.map(({m,v,durMs})=>{playNote(m,v,durMs||300);return{m,dur:durMs||300};});
          setActive(p=>{const s=new Set(p);for(const x of midis)s.add(x.m);return s;});
          const byDur={};
          for(const{m,dur}of midis){const t=Math.min(dur,800);(byDur[t]||(byDur[t]=[])).push(m);}
          for(const[t,ms]of Object.entries(byDur)){
            pushTimer(()=>setActive(p=>{const s=new Set(p);ms.forEach(m=>s.delete(m));return s;}),+t);
          }
        }}
      >
        <button onClick={(e)=>{e.stopPropagation(); setImmersive(v=>!v);}} aria-label={immersive?'exit fullscreen':'fullscreen'} title={immersive?'Exit fullscreen':'Fullscreen'} className={'pf-fs-btn'+(immersive?' pf-fs-btn-immersive':'')} style={{position:'absolute',top:8,right:8,zIndex:12,width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:9,cursor:'pointer',background:'rgba(6,6,12,.45)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',border:'1px solid rgba(201,168,76,.2)',color:'rgba(201,168,76,.7)',padding:0,WebkitTapHighlightColor:'transparent',opacity:immersive||controlsAwake?1:0,pointerEvents:immersive||controlsAwake?'auto':'none',transition:'opacity .4s ease, top .25s ease'}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{immersive?<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>:<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>}</svg>
        </button>
        {/* Fullscreen CTA row — Next (shuffle: jump to a new variation, works
            while playing too) and Save (when the piece is complete & still). Each
            appears by its own condition; they can show together. Fades with the
            other controls on idle. */}
        {immersive && (()=>{
          const exportReadyFs =
            (chords.length>0 && !playing && !anim && !holdPaused && disp>=chords.length &&
             !demoReelOn && !composeMode && !micActive && !micArmed && !busy && !recording && viewMode!=='image')
            || ((composeMode||micActive||micArmed) && chords.length>0 && !demoReelOn && !busy && !recording && viewMode!=='image');
          const canRollNextFs = !anim && !working && !demoReelOn && !recording;
          const showNextFs = randomMode && effectiveStyle && chords.length>0 && viewMode!=='image' && canRollNextFs;
          if(!exportReadyFs && !showNextFs) return null;
          return (
            <div style={{position:'absolute',bottom:'max(20px, env(safe-area-inset-bottom))',left:'50%',transform:'translateX(-50%)',zIndex:13,display:'flex',alignItems:'center',gap:10,opacity:controlsAwake?1:0,pointerEvents:controlsAwake?'auto':'none',transition:'opacity .4s ease'}}>
              {showNextFs && (
                <button onClick={(e)=>{ e.stopPropagation(); advanceVariation(); }} className="pf-lift" aria-label="next painting"
                  style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:5,padding:'11px 22px',borderRadius:26,cursor:'pointer',fontFamily:'inherit',fontSize:(.62*effScale)+'rem',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'#ffd07a',background:'rgba(255,200,120,.16)',border:'1px solid rgba(255,200,120,.55)',boxShadow:'0 0 0 1px rgba(255,200,120,.2)',WebkitTapHighlightColor:'transparent'}}>
                  {t('nextPainting')||'next'} ›
                </button>
              )}
              {exportReadyFs && typeof navigator!=='undefined' && navigator.share && (
                <button onClick={(e)=>{ e.stopPropagation(); exportImage('story', true); }} className="pf-lift" aria-label="share to story"
                  style={{display:'inline-flex',alignItems:'center',gap:8,padding:'11px 24px',borderRadius:26,cursor:'pointer',fontFamily:'inherit',fontSize:(.62*effScale)+'rem',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'#0a0a12',background:'linear-gradient(135deg,'+PF.gold+','+PF.gold2+')',border:'1px solid '+PF.gold2,boxShadow:'0 6px 22px rgba(240,192,64,.35)',WebkitTapHighlightColor:'transparent'}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/></svg>
                  {t('shareStory')||'Story'}
                </button>
              )}
              {exportReadyFs && (
                <button onClick={(e)=>{ e.stopPropagation(); setShowSizePicker(true); }} className="pf-lift" aria-label={t('save')}
                  style={{display:'inline-flex',alignItems:'center',gap:6,padding:'11px 18px',borderRadius:26,cursor:'pointer',fontFamily:'inherit',fontSize:(.6*effScale)+'rem',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'rgba(201,168,76,.9)',background:'rgba(6,6,12,.5)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',border:'1px solid rgba(201,168,76,.4)',WebkitTapHighlightColor:'transparent'}}>
                  ↓ {t('save')}
                </button>
              )}
            </div>
          );
        })()}
        {viewMode==='image'&&originalImgUrl&&(
          <img src={originalImgUrl} alt="original" onLoad={e=>{const w=e.target.naturalWidth,h=e.target.naturalHeight; if(w&&h) setMfiImgAspect(w+' / '+h);}} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:moodFromImg?'contain':'fill',objectPosition:moodFromImg?'center':'0 0',display:'block',zIndex:0,pointerEvents:'none'}}/>
        )}
        <audio ref={audioElRef} style={{display:'none'}} preload="auto"/>
        <canvas ref={canvasRef} width={CW} height={CH} role="img" aria-label={chords.length?`music painting, ${chords.length} ${chords.length===1?'chord':'chords'}`:'music painting'} style={{display:'block',position:'relative',zIndex:1,opacity:(viewMode==='image'&&originalImgUrl)?((playing||anim)?0.70:0):1,mixBlendMode:viewMode==='image'&&originalImgUrl?'screen':'normal',transition:'opacity 0.25s ease',...((composeMode||micPainting)?{width:'auto',height:'auto',aspectRatio:CW+' / '+CH,maxWidth:`min(100%, ${CW}px)`,maxHeight:'calc(100dvh - 210px)'}:(viewMode==='image'&&originalImgUrl)?{width:'100%',height:'auto',maxWidth:`min(100%, 560px)`,aspectRatio:(moodFromImg&&mfiImgAspect)?mfiImgAspect:undefined}:{width:'100%',height:'auto',maxWidth:`min(100%, ${CW}px)`}),...(immersive?{width:'100%',height:'auto',maxWidth:'none',maxHeight:'none',aspectRatio:undefined}:{})}}/>
        <canvas ref={visualizerRef} width={CW} height={CH} aria-hidden="true" style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:2,mixBlendMode:'screen'}}/>
        <canvas ref={highlightCanvasRef} width={CW} height={CH} aria-hidden="true" style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:3,mixBlendMode:'screen'}}/>
        {demoReelOn && demoPrintBeat && (
          /* Golden frame around the canvas — print-beat flourish. Stays here
             (not in the fullscreen overlay) because it visually wraps the
             canvas itself, not the whole screen. No pointer events. */
          <div style={{position:'absolute',inset:0,border:'min(5vw,28px) solid #f6f3ec',boxShadow:'inset 0 0 0 2px rgba(180,140,40,.6), 0 24px 60px rgba(0,0,0,.5)',pointerEvents:'none',transition:'all .5s ease',zIndex:5}}/>
        )}
        {selectedChordIdx!=null&&grid.cells&&grid.cells[selectedChordIdx]&&(!effectiveStyle||effectiveStyle==='notes')&&(()=>{
          const cell=grid.cells[selectedChordIdx];
          const segs=cell.segments||[cell];
          // Outline EACH segment separately. A long chord wraps across rows, so a
          // single bounding box would span almost the whole canvas — instead we
          // draw a thin highlight per segment that hugs the actual painted shape.
          return segs.map((s,si)=>(
            <div key={si} aria-hidden="true" style={{position:'absolute',left:`${s.x/CW*100}%`,top:`${s.y/CH*100}%`,width:`${s.w/CW*100}%`,height:`${s.h/CH*100}%`,boxSizing:'border-box',border:'2px solid rgba(255,220,90,.95)',boxShadow:'0 0 10px rgba(255,210,70,.6)',zIndex:4,pointerEvents:'none'}}/>
          ));
        })()}
        {(micActive || micArmed) && (
          <div style={{position:'absolute',top:10,left:10,zIndex:4,display:'flex',flexDirection:'column',alignItems:'flex-start',gap:4}}>
            <button onClick={()=>{
              // Voice ⇄ Music are INDEPENDENT modes within MIC. Toggle saves the
              // current preset's draft, switches the preset state, and restores
              // the other preset's draft (or starts blank). They do NOT share a
              // canvas — mixing voice and music in one painting doesn't make sense.
              const curOwner = micPreset==='voice' ? 'sing' : 'listen';
              const nextOwner = micPreset==='voice' ? 'listen' : 'sing';
              const nextPreset = micPreset==='voice' ? 'music' : 'voice';
              // Save current preset draft if there's any chord work to preserve.
              if(composedModeRef.current && chordsRef.current.length>0){
                stashDraft(curOwner);
              }
              // Clear the active draftOwner so the new start treats this as a
              // fresh entry into the other preset (NOT a sibling-preset
              // continuation that would carry chords across).
              draftOwnerRef.current=null;
              composedModeRef.current=false;
              // Stop the currently running stream (if any) and clear the canvas
              // for the new preset.
              if(micPainting) stopMicPainting();
              if(micListening) stopMicListening();
              setChords([]); chordsRef.current=[]; idxRef.current=0;
              sessionStart.current=0; gridSigRef.current='';
              setDisp(0); setPending([]); pendingRef.current=[]; pressInfo.current={};
              substrateRef.current={canvas:null,ctx:null,builtTo:0,key:'',CW:0,CH:0};
              lastPaintRef.current={disp:0,chords:null,grid:null,gc:null,style:null,viewMode:null,pending:null,info:null,anim:false,playing:false,stamp:0,mode:null,holdPaused:false};
              setMicPreset(nextPreset);
              // Restore the OTHER preset's stash (if any) onto the now-clean canvas.
              const hadOtherDraft = restoreStash(nextOwner);
              if(micActive){
                // Was recording — start recording in the new preset. If a draft
                // was restored, the new session continues from it (composedMode
                // is set by restoreStash). Otherwise fresh start.
                if(nextPreset==='music') startMicListening(); else startMicPainting();
              } else {
                // Was armed — stay armed in the new preset. Big REC will start it.
                setMicArmed(true);
                if(!hadOtherDraft){
                  composedModeRef.current=false; draftOwnerRef.current=null;
                }
              }
            }} title={micPreset==='voice'?t('micMusicHint'):t('micVoiceHint')} style={{display:'inline-flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:20,cursor:'pointer',fontSize:(.55*effScale)+'rem',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',fontFamily:"'Outfit',sans-serif",color:micPreset==='voice'?'#ff8a8a':'#8accff',background:'transparent',border:'1px solid '+(micPreset==='voice'?'rgba(255,120,120,.7)':'rgba(100,180,255,.7)'),textShadow:'0 1px 3px rgba(0,0,0,.85), 0 0 6px rgba(0,0,0,.7)',backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)'}}>
              {micPreset==='voice'?t('voicePreset').replace(/[^\p{L}]/gu,''):t('musicPreset').replace(/[^\p{L}]/gu,'')} ⇄{(micPreset==='voice'?listenStashRef.current:singStashRef.current)?' ●':''}
            </button>
            <div style={{fontSize:(.5*effScale)+'rem',fontWeight:600,letterSpacing:'.06em',color:'rgba(230,222,196,.7)',background:'rgba(8,6,14,.6)',borderRadius:10,padding:'2px 8px',backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)',maxWidth:220}}>{t('micTapToSwitch')}</div>
          </div>
        )}
        {/* Hidden state-tracker — DO NOT REMOVE.
            Without this element, React's render reconciliation can skip
            re-running the canvas paint effect after rapid state changes
            (e.g. Vary mid-play → Clear in MFI mode with an artist style).
            The canvas keeps stale imperative pixel state and shows residual
            shapes. Reading the relevant state values in JSX forces React to
            keep the canvas-wrapper subtree in its dependency graph, so the
            paint effect runs every time these values change. Width/height
            0 + overflow:hidden makes it invisible and zero-cost. */}
        <div data-mfi-state aria-hidden="true" style={{position:'absolute',width:0,height:0,overflow:'hidden',pointerEvents:'none'}}>{chords.length}|{chordsRef.current?.length ?? 0}|{disp}|{varySource?1:0}|{String(moodFromImg)}|{String(moodContext)}|{currentMood||''}|{String(style||'')}|{String(effectiveStyle||'')}|{rndSalt}|{String(playing)}</div>
        {chords.length===0 && micArmed && !micActive && (
          <div style={{position:'absolute',top:0,left:0,right:0,zIndex:4,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start',paddingTop:'12%',gap:12,pointerEvents:'none'}}>
            <button onClick={()=>{
              setMicArmed(false);
              if(micPreset==='music') startMicListening(); else startMicPainting();
            }} title={t('micTapToRecord')} style={{pointerEvents:'auto',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:10,width:108,height:108,borderRadius:'50%',cursor:'pointer',fontFamily:"'Outfit',sans-serif",fontSize:(.78*effScale)+'rem',fontWeight:700,letterSpacing:'.16em',textTransform:'uppercase',color:micPreset==='voice'?'#ff8a8a':'#8accff',background:micPreset==='voice'?'rgba(255,40,40,.16)':'rgba(40,140,255,.16)',border:'2px solid '+(micPreset==='voice'?'rgba(255,120,120,.7)':'rgba(100,180,255,.7)'),boxShadow:'0 6px 24px '+(micPreset==='voice'?'rgba(255,80,80,.25)':'rgba(80,160,255,.25)')+', inset 0 0 0 1px rgba(255,255,255,.04)',transition:'transform .14s, box-shadow .14s'}} onMouseDown={e=>e.currentTarget.style.transform='scale(.96)'} onMouseUp={e=>e.currentTarget.style.transform='scale(1)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
              <span style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,lineHeight:1}}>
                <span style={{width:18,height:18,borderRadius:'50%',background:micPreset==='voice'?'#ff5a5a':'#5aacff',boxShadow:'0 0 12px '+(micPreset==='voice'?'#ff5a5a':'#5aacff')}}/>
                <span style={{fontSize:(.62*effScale)+'rem',marginTop:2}}>REC</span>
              </span>
            </button>
            <div style={{fontSize:(.55*effScale)+'rem',letterSpacing:'.18em',textTransform:'uppercase',color:micPreset==='voice'?'rgba(255,138,138,.85)':'rgba(140,200,255,.85)',textShadow:'0 1px 3px rgba(0,0,0,.6)'}}>{t('micTapToRecord')}</div>
          </div>
        )}
        {chords.length===0 && !(micArmed && !micActive) && (
          <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
            <div style={{opacity:composeMode?.22:.12,fontSize:(.6*effScale)+'rem',letterSpacing:'.22em',textTransform:'uppercase',color:composeMode?'rgba(201,168,76,1)':'inherit'}}>
              {composeMode?'play the keys to paint':'play · paint · upload'}
            </div>
            <div style={{opacity:composeMode?.08:.05,fontSize:'2.8rem'}}>♩</div>
          </div>
        )}
      </div>

      </>)}


      {showSizePicker && (()=>{
        // Tint the export picker to match the active mode: compose = green,
        // mic = pink, everything else (played pieces) keeps the default violet.
        const pk = composeMode
          ? { line:'rgba(78,203,141,.9)', dim:'rgba(120,200,160,.5)', border:'rgba(78,203,141,.45)', edge:'rgba(78,203,141,.35)' }
          : (micActive||micArmed)
          ? { line:'rgba(240,106,166,.9)', dim:'rgba(240,150,190,.5)', border:'rgba(240,106,166,.45)', edge:'rgba(240,106,166,.35)' }
          : { line:'rgba(200,160,255,.85)', dim:'rgba(180,160,255,.45)', border:'rgba(180,140,255,.4)', edge:'rgba(200,160,255,.35)' };
        return (
        <div onClick={()=>setShowSizePicker(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10010,padding:20}}>
          <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="export" style={{background:'#0a0a14',border:'1px solid '+pk.edge,borderRadius:10,padding:'22px 18px',minWidth:260,maxWidth:320}}>
            <div style={{textAlign:'center',marginBottom:14,letterSpacing:'.12em',color:pk.line,fontSize:(.65*effScale)+'rem'}}>
              ↓ {t('save')}</div>
            <input
              type="text"
              value={compositionName}
              onChange={e=>setCompositionName(e.target.value)}
              onFocus={()=>{inputFocus.current=true;setFocusedInput('comp');}}
              onBlur={()=>{inputFocus.current=false;setFocusedInput(null);}}
              placeholder={t('nameThisPiece')}
              maxLength={80}
              aria-label={t('nameThisPiece')}
              style={{width:'100%',boxSizing:'border-box',background:'rgba(8,6,14,0.8)',border:'1px solid '+(focusedInput==='comp'?'rgba(201,168,76,.85)':'rgba(201,168,76,.35)'),borderRadius:4,padding:'8px 12px',color:'rgba(207,197,168,.95)',fontSize:(.72*effScale)+'rem',fontFamily:'inherit',outline:'none',letterSpacing:'.04em',textAlign:'center',marginBottom:14,boxShadow:focusedInput==='comp'?'0 0 0 2px rgba(201,168,76,.18)':'none',transition:'border-color .15s ease, box-shadow .15s ease'}}
            />
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {viewMode==='image' ? (
                <>
                  {/* Image mode: Story (PNG 9:16 + audio) / Audio (mp3 only) /
                      Score (MusicXML). Audio + Story prefer the auto-recorded
                      blob captured silently during the most recent Play — that
                      makes them instant, no re-play needed. If for some reason
                      no blob is on hand (e.g. recording stream failed in the
                      background), fall back to the legacy picker-intent flow
                      that records on demand. */}
                  <button onClick={()=>{
                    setShowSizePicker(false);
                    if(recBlob && recName) exportImage('story', true, recBlob, recName);
                    else { setRecordIntent('story'); startRecord(); }
                  }} style={{padding:'12px',background:'linear-gradient(135deg,rgba(255,215,120,.18),rgba(220,170,70,.10))',color:'rgba(255,220,140,.95)',border:'1px solid rgba(255,210,120,.55)',borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.06em',fontSize:(.72*effScale)+'rem',fontWeight:600}}>
                    ✦ {t('sizeStory')||'Story'}
                    <div style={{fontSize:(.52*effScale)+'rem',color:'rgba(255,210,140,.6)',marginTop:4,letterSpacing:'.04em',fontWeight:400}}>{t('storyImageHint')||'painting + audio · for IG / TikTok'}</div>
                  </button>
                  <button onClick={()=>{
                    setShowSizePicker(false);
                    if(recBlob && recName) saveAudio();
                    else { setRecordIntent('audio'); startRecord(); }
                  }} style={{padding:'12px',background:'transparent',color:pk.line,border:'1px solid '+pk.border,borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.06em',fontSize:(.72*effScale)+'rem'}}>
                    ⏺ {t('saveAudioLabel')||'Audio'}
                    <div style={{fontSize:(.52*effScale)+'rem',color:pk.dim,marginTop:4,letterSpacing:'.04em'}}>{t('saveAudioHint')||'mp3 · save to files'}</div>
                  </button>
                  <button onClick={()=>{ setShowSizePicker(false); saveScore(); }} style={{padding:'12px',background:'transparent',color:pk.line,border:'1px solid '+pk.border,borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.06em',fontSize:(.72*effScale)+'rem'}}>
                    ♫ {t('scoreExport')}
                    <div style={{fontSize:(.52*effScale)+'rem',color:pk.dim,marginTop:4,letterSpacing:'.04em'}}>{t('scoreExportHint')||'MusicXML · for MuseScore'}</div>
                  </button>
                </>
              ) : (
                <>
                  {!immersive && (
                    <button onClick={()=>exportImage('story')} style={{padding:'12px',background:'linear-gradient(135deg,rgba(255,215,120,.18),rgba(220,170,70,.10))',color:'rgba(255,220,140,.95)',border:'1px solid rgba(255,210,120,.55)',borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.06em',fontSize:(.72*effScale)+'rem',fontWeight:600}}>
                      ✦ {t('sizeStory')||'Story'}
                      <div style={{fontSize:(.52*effScale)+'rem',color:'rgba(255,210,140,.6)',marginTop:4,letterSpacing:'.04em',fontWeight:400}}>{t('sizeStoryHint')||'9:16 · for IG / TikTok'}</div>
                    </button>
                  )}
                  <button onClick={()=>exportImage('web')} style={{padding:'12px',background:'transparent',color:pk.line,border:'1px solid '+pk.border,borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.06em',fontSize:(.72*effScale)+'rem'}}>
                    🖥 {t('sizeWeb')}
                    <div style={{fontSize:(.52*effScale)+'rem',color:pk.dim,marginTop:4,letterSpacing:'.04em'}}>{t('sizeWebHint')}</div>
                  </button>
                  <button onClick={()=>exportImage('print')} style={{padding:'12px',background:'transparent',color:pk.line,border:'1px solid '+pk.border,borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.06em',fontSize:(.72*effScale)+'rem'}}>
                    🖨 {t('sizePrint')}
                    <div style={{fontSize:(.52*effScale)+'rem',color:pk.dim,marginTop:4,letterSpacing:'.04em'}}>{t('sizePrintHint')}</div>
                  </button>
                </>
              )}
              <button onClick={()=>setShowSizePicker(false)} style={{padding:'8px',background:'transparent',color:'rgba(180,170,150,.5)',border:'none',cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',fontSize:(.6*effScale)+'rem',marginTop:4}}>
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {showPaletteEditor && (
        <PaletteEditorModal
          onClose={closePaletteEditor}
          t={t}
          activePalette={activePalette}
          setCustomPalette={setCustomPalette}
        />
      )}

      {showAbout && <AboutModal onClose={closeAbout} t={t} lang={lang} readScale={effScale} setReadScale={setReadScale} />}

      {showGuide && (
        <GuideModal
          onClose={closeGuide}
          t={t}
          lang={lang}
          guideQuery={guideQuery}
          setGuideQuery={setGuideQuery}
          focusedInput={focusedInput}
          setFocusedInput={setFocusedInput}
          inputFocus={inputFocus}
          readScale={effScale}
          setReadScale={setReadScale}
        />
      )}

      {showComposeRecent && (
        <div onClick={()=>setShowComposeRecent(false)} style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.85)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:24,backdropFilter:'blur(6px)'}}>
          <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="recently played" style={{maxWidth:320,width:'100%',background:'rgba(16,12,24,0.95)',border:'1px solid rgba(201,168,76,.4)',borderRadius:8,padding:'22px 18px'}}>
            <div style={{textAlign:'center',marginBottom:14,letterSpacing:'.18em',color:PF.gold2,fontSize:(.7*effScale)+'rem',textTransform:'uppercase'}}>♪ {t('recentPlayed')||'recently played'}</div>
            <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
              {composeRecent.map(entry=>(
                <button key={entry.id} onClick={()=>{ _composeRecall(entry); setShowComposeRecent(false); }} style={{padding:'10px 12px',background:'transparent',color:'rgba(228,178,255,.85)',border:'1px solid rgba(220,150,255,.35)',borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.06em',fontSize:(.66*effScale)+'rem',textAlign:'left',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {_composeRecentLabel(entry.ts)}
                </button>
              ))}
            </div>
            <button onClick={()=>setShowComposeRecent(false)} style={{display:'block',margin:'0 auto',padding:'6px 16px',background:'transparent',color:'rgba(207,197,168,.5)',border:'1px solid rgba(207,197,168,.15)',borderRadius:3,cursor:'pointer',fontSize:(.6*effScale)+'rem',fontFamily:'inherit',letterSpacing:'.1em'}}>cancel</button>
          </div>
        </div>
      )}

      {showMicRecent && (
        <div onClick={()=>setShowMicRecent(false)} style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.85)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:24,backdropFilter:'blur(6px)'}}>
          <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="recently played" style={{maxWidth:320,width:'100%',background:'rgba(16,12,24,0.95)',border:'1px solid rgba(201,168,76,.4)',borderRadius:8,padding:'22px 18px'}}>
            <div style={{textAlign:'center',marginBottom:14,letterSpacing:'.18em',color:PF.gold2,fontSize:(.7*effScale)+'rem',textTransform:'uppercase'}}>♪ {t('recentPlayed')||'recently played'}</div>
            <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
              {(()=>{ const preset = micPreset==='music' ? 'music' : 'voice'; const list = preset==='voice' ? micVoiceRecent : micMusicRecent; return list.map(entry=>(
                <button key={entry.id} onClick={()=>{ _micRecall(preset,entry); setShowMicRecent(false); }} style={{padding:'10px 12px',background:'transparent',color:'rgba(228,178,255,.85)',border:'1px solid rgba(220,150,255,.35)',borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.06em',fontSize:(.66*effScale)+'rem',textAlign:'left',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {_composeRecentLabel(entry.ts)}
                </button>
              )); })()}
            </div>
            <button onClick={()=>setShowMicRecent(false)} style={{display:'block',margin:'0 auto',padding:'6px 16px',background:'transparent',color:'rgba(207,197,168,.5)',border:'1px solid rgba(207,197,168,.15)',borderRadius:3,cursor:'pointer',fontSize:(.6*effScale)+'rem',fontFamily:'inherit',letterSpacing:'.1em'}}>cancel</button>
          </div>
        </div>
      )}

      {showMoodMenu && (
        <div onClick={()=>setShowMoodMenu(false)} style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.92)',zIndex:100000,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'4vh 16px',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',overflowY:'auto'}}>
          <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="select mood" style={{maxWidth:340,width:'100%',background:'rgba(16,12,24,0.97)',border:'1px solid rgba(201,168,76,.4)',borderRadius:8,padding:'20px 18px 16px',display:'flex',flexDirection:'column',maxHeight:'92vh'}}>
            <div style={{textAlign:'center',marginBottom:14,letterSpacing:'.18em',color:PF.gold2,fontSize:(.7*effScale)+'rem',textTransform:'uppercase',flexShrink:0}}>✦ {t('selectMood').replace('✦ ','').replace('…','')}</div>
            {(()=>{ const submit=(txt)=>{ const v=(txt||'').trim(); if(!v)return; setShowMoodMenu(false); setMoodEdit(''); setStructureSeedLock(null); setForceSetup(false); setCurrentMood(v); setImgMoodThumb(null); setMoodFromImg(false); setVarySource(null); setLoadedSource(null); setMoodContext(true); setSongQ(v); stopAll(); aiMoodFromText(v); if(moodHintRef.current){clearTimeout(moodHintRef.current);moodHintRef.current=null;} setMoodHint(false); }; return (
              <div style={{display:'flex',gap:6,marginBottom:12,flexShrink:0}}>
                <input value={moodEdit} onChange={e=>setMoodEdit(e.target.value)} placeholder={t('moodPlaceholder')} autoFocus onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); submit(moodEdit); } }} style={{flex:1,minWidth:0,background:'rgba(0,0,0,.25)',border:'1px solid rgba(201,168,76,.3)',borderRadius:8,padding:'11px 12px',color:PF.cream,fontSize:'16px',fontFamily:'inherit',outline:'none'}} />
                <button onClick={()=>submit(moodEdit)} disabled={!moodEdit.trim()} aria-label={t('moodGo')} title={t('moodGo')} style={{flexShrink:0,width:42,borderRadius:8,border:'none',cursor:moodEdit.trim()?'pointer':'default',background:moodEdit.trim()?PF.gold:'rgba(201,168,76,.2)',color:moodEdit.trim()?PF.bg:'rgba(201,168,76,.5)',fontSize:'1rem',fontWeight:700}}>→</button>
              </div>
            ); })()}
            {/* Suggestions grid — filtered moods that match what you're typing.
                Sits directly under the input so the autocomplete relationship is
                obvious. Hidden when empty (no input or no matches). starts-with
                matches rank above contains-only matches. */}
            <div style={{flex:'0 1 auto',minHeight:0,overflowY:'auto',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,paddingRight:4,alignContent:'start',marginBottom:moodEdit.trim()?12:0}}>
              {(()=>{ const _n=s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); const q=_n(moodEdit.trim()); if(!q)return []; return MOODS.filter(m=>_n((t('moodNames')||{})[m]||m).startsWith(q)); })().map(m=>(
                <button key={m} onClick={()=>{
                  setShowMoodMenu(false);
                  const s=findSong(m);
                  setStructureSeedLock(null);
                  setForceSetup(false);
                  setCurrentMood(m);
                  setVarySource(s);
                  setImgMoodThumb(null);
                  setMoodFromImg(false);
                  setLoadedSource(null);
                  setMoodContext(true);
                  setSongQ(m);
                  stopAll();
                  aiMidi(m);
                  if(moodHintRef.current){clearTimeout(moodHintRef.current);moodHintRef.current=null;}
                  setMoodHint(false);
                }} style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,padding:'10px 4px',borderRadius:12,background: (m===currentMood&&!imgMoodThumb)?PF.gold:PF.card2,color: (m===currentMood&&!imgMoodThumb)?PF.bg:PF.cream,border:'1px solid '+((m===currentMood&&!imgMoodThumb)?PF.gold:'rgba(242,238,232,.08)'),cursor:'pointer',fontFamily:'inherit',transition:'all .18s'}}>
                  <span style={{fontSize:'1.1rem',lineHeight:1}}>{MOOD_EMOJI[m]||'✦'}</span>
                  <span style={{fontSize:(.5*effScale)+'rem',fontWeight:600,letterSpacing:'.04em',textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%'}}>{(t('moodNames')||{})[m]||m}</span>
                </button>
              ))}
            </div>
            {/* Recently AI generated — separate "what you made before" section,
                always at the bottom regardless of typing state. Click replays the
                piece for free, no AI call. */}
            {aiComposeRecent.length>0 && (
              <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0}}>
                <div style={{fontSize:(.5*effScale)+'rem',letterSpacing:'.18em',textTransform:'uppercase',color:'rgba(242,238,232,.45)',textAlign:'center',marginBottom:2}}>
                  {t('recentAiGenerated')||'Recently AI generated'}
                </div>
                {aiComposeRecent.map((entry)=>(
                  <button key={entry.id} onClick={()=>{ _aiComposeRecall(entry); setShowMoodMenu(false); }} style={{padding:'9px 12px',background:'transparent',color:'rgba(228,178,255,.85)',border:'1px solid rgba(220,150,255,.35)',borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.06em',fontSize:(.66*effScale)+'rem',textAlign:'left',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    ✦ {entry.title}
                  </button>
                ))}
              </div>
            )}
            <button onClick={()=>setShowMoodMenu(false)} style={{display:'block',margin:'14px auto 0',padding:'6px 16px',background:'transparent',color:'rgba(207,197,168,.5)',border:'1px solid rgba(207,197,168,.15)',borderRadius:3,cursor:'pointer',fontSize:(.6*effScale)+'rem',fontFamily:'inherit',letterSpacing:'.1em',flexShrink:0}}>cancel</button>
          </div>
        </div>
      )}
      {showMorphMenu && (
        <div onClick={()=>{setShowMorphMenu(false);setMorphSel([]);}} style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.85)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:24,backdropFilter:'blur(6px)'}}>
          <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="morph mood" style={{maxWidth:340,width:'100%',background:'rgba(16,12,24,0.95)',border:'1px solid rgba(220,150,255,.35)',borderRadius:8,padding:'22px 18px'}}>
            <div style={{textAlign:'center',marginBottom:4,letterSpacing:'.18em',color:'rgba(220,170,255,.85)',fontSize:(.7*effScale)+'rem',textTransform:'uppercase'}}>✦ {t('morphTitle').replace('{mood}',(t('moodNames')||{})[currentMood]||currentMood||'')}</div>
            <div style={{textAlign:'center',marginBottom:12,fontSize:(.55*effScale)+'rem',letterSpacing:'.04em',color:'rgba(207,197,168,.45)'}}>{t('morphHint')} · <span role="button" tabIndex={0} onClick={()=>{setMorphPool([...morphSel, ...makeMorphPool(currentMood, morphSel)]);setMorphPoolSource('offline');setMorphPoolLoading(false);}} title="shuffle / iné" style={{cursor:'pointer',color:'rgba(220,180,255,.85)',userSelect:'none'}}>↻</span> · <span style={{fontSize:(.5*effScale)+'rem',letterSpacing:'.06em',textTransform:'uppercase',color:morphPoolLoading?'rgba(220,180,255,.7)':morphPoolSource==='ai'?'rgba(220,170,255,.95)':'rgba(207,197,168,.5)'}}>{morphPoolLoading?'✦ …':morphPoolSource==='ai'?'✦ AI':'offline'}</span></div>
            {/* Live chain preview: current → sel1 → sel2 → sel3 */}
            <div style={{textAlign:'center',marginBottom:12,fontSize:(.62*effScale)+'rem',letterSpacing:'.04em',color:'rgba(220,180,255,.9)',textTransform:'capitalize',minHeight:'1.2em'}}>
              {[(t('moodNames')||{})[currentMood]||currentMood, ...morphSel.map(m=>(t('moodNames')||{})[m]||m)].join(' → ')}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,maxHeight:'46vh',overflowY:'auto',paddingRight:2}}>
              {morphPool.map(m=>{
                const selIdx = morphSel.indexOf(m);
                const isSel = selIdx>=0;
                const full = morphSel.length>=3 && !isSel;
                return (
                <button key={m} disabled={full} onClick={()=>{
                  setMorphSel(prev=>{
                    const i=prev.indexOf(m);
                    if(i>=0) return prev.filter(x=>x!==m);   // tap again → remove
                    if(prev.length>=3) return prev;          // cap at 3
                    return [...prev, m];                     // add to end of chain
                  });
                }} style={{position:'relative',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,padding:'10px 4px',background:isSel?'rgba(220,150,255,.22)':'rgba(220,150,255,.06)',color:isSel?'#fff':(full?'rgba(220,180,255,.3)':PF.cream),border:'1px solid '+(isSel?'rgba(220,150,255,.8)':'rgba(220,150,255,.25)'),borderRadius:12,cursor:full?'default':'pointer',fontFamily:'inherit',opacity:full?.5:1,transition:'all .18s'}}>
                  {isSel && <span style={{position:'absolute',top:3,right:4,fontSize:(.5*effScale)+'rem',fontWeight:700,color:'#e9c8ff'}}>{selIdx+1}</span>}
                  <span style={{fontSize:'1.1rem',lineHeight:1}}>{MOOD_EMOJI[m]||'✦'}</span>
                  <span style={{fontSize:(.5*effScale)+'rem',fontWeight:600,letterSpacing:'.04em',textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%'}}>{(t('moodNames')||{})[m]||m}</span>
                </button>
                );
              })}
            </div>
            <div style={{display:'flex',gap:8,marginTop:16}}>
              <button onClick={()=>{setShowMorphMenu(false);setMorphSel([]);}} style={{flex:1,padding:'9px 16px',background:'transparent',color:'rgba(207,197,168,.5)',border:'1px solid rgba(207,197,168,.15)',borderRadius:4,cursor:'pointer',fontSize:(.6*effScale)+'rem',fontFamily:'inherit',letterSpacing:'.1em',textTransform:'uppercase'}}>cancel</button>
              <button disabled={morphSel.length===0} onClick={()=>{
                const chain=[findSong(currentMood), ...morphSel.map(findSong)];
                const morphed = morphSel.length===1 ? morphSongs(chain[0],chain[1]) : morphChain(chain);
                if(!morphed){setErr(t('errs').morphFail);return;}
                setVarySource(morphed);
                setStructureSeedLock(null);
                const sel=[...morphSel];
                setShowMorphMenu(false); setMorphSel([]);
                stopAll();
                const evts=noteArr2events(morphed.notes,morphed.tempo);
                if(!evts.length){setErr(t('errs').varyFail);return;}
                const mn=t('moodNames')||{};
                const morphTitleDisp=[(mn[currentMood]||currentMood), ...sel.map(m=>mn[m]||m)].join(' → ');
                applyEvents(evts,morphTitleDisp);
                setMorphTargets(sel);
                const bytes=encodeMidi(evts,morphed.tempo||100);
                setMidiBlob(new Blob([bytes],{type:'audio/midi'}));
                setMidiName(morphed.title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_')+'.mid');
              }} style={{flex:1,padding:'9px 16px',background:morphSel.length?'linear-gradient(135deg,#7c4df5,#a97ff5)':'rgba(124,77,245,.25)',color:'#fff',border:'none',borderRadius:4,cursor:morphSel.length?'pointer':'default',fontSize:(.6*effScale)+'rem',fontFamily:'inherit',letterSpacing:'.1em',textTransform:'uppercase',opacity:morphSel.length?1:.5}}>✦ {t('morphGo')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom dock: only docks to the viewport during playback (so you can
          watch the canvas animate while the piano stays visible). When not
          playing, it flows in normal document order. */}
      {isActiveView && (
      <div role="region" aria-label="playback controls" style={isActiveView?{position:'fixed',bottom:0,left:0,right:0,zIndex:50,background:'rgba(4,3,8,0.97)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',borderTop:'1px solid rgba(201,168,76,.15)',padding:'8px 8px calc(10px + env(safe-area-inset-bottom))'}:{}}>
      {/* Recording save row — appears in dock when a recording is ready */}
      {micListening&&(
        <div style={{fontSize:(.48*effScale)+'rem',letterSpacing:'.08em',color:'rgba(100,200,255,.35)',textAlign:'center',marginBottom:4,lineHeight:1.5}}>
          🔊 {t('listenHint')}
        </div>
      )}
      {recBlob&&(
        <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:6,padding:'8px 10px',background:'rgba(220,90,90,.08)',border:'1px solid rgba(220,90,90,.25)',borderRadius:6}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {(()=>{ const m=recName.match(/^(.*?)(\.[^.]+)$/); const base=m?m[1]:recName; const ext=m?m[2]:''; return (
              <span style={{flex:1,display:'flex',alignItems:'center',gap:2,minWidth:0}}>
                <input value={base} onFocus={()=>{inputFocus.current=true;}} onBlur={()=>{inputFocus.current=false;}} onChange={e=>setRecName(e.target.value.replace(/[\/\\:*?"<>|]/g,'')+ext)} aria-label="file name" style={{flex:1,minWidth:0,fontSize:(.6*effScale)+'rem',color:'rgba(255,170,150,1)',background:'rgba(255,255,255,.06)',border:'1px solid rgba(220,90,90,.3)',borderRadius:4,padding:'4px 6px',fontFamily:'inherit',outline:'none'}}/>
                <span style={{fontSize:(.55*effScale)+'rem',color:'rgba(255,140,120,.6)',flexShrink:0}}>{ext} · {(recBlob.size/1024).toFixed(0)}KB</span>
              </span>
            ); })()}
            {audioShareMsg&&<span style={{fontSize:(.5*effScale)+'rem',color:audioShareMsg.tone==='ok'?'rgba(140,255,180,.9)':'rgba(255,140,120,.9)',flexShrink:0,marginRight:4}}>{audioShareMsg.text}</span>}
            <button onClick={shareRecording} style={{padding:'6px 14px',background:'rgba(220,90,90,.2)',color:'rgba(255,140,120,1)',border:'1px solid rgba(220,90,90,.5)',borderRadius:4,cursor:'pointer',fontSize:(.6*effScale)+'rem',fontFamily:'inherit',letterSpacing:'.06em',flexShrink:0,minWidth:60}}>{t('share')}</button>
            <button onClick={()=>{setRecBlob(null);setRecName('');setAudioShareMsg(null);}} style={{padding:'6px 10px',background:'transparent',color:'rgba(207,197,168,.5)',border:'1px solid rgba(207,197,168,.2)',borderRadius:4,cursor:'pointer',fontSize:(.6*effScale)+'rem',fontFamily:'inherit',flexShrink:0}}>✕</button>
          </div>
          {recBlob.type&&recBlob.type.includes('webm')&&(
            <div style={{fontSize:(.48*effScale)+'rem',color:'rgba(255,180,120,.55)',letterSpacing:'.04em'}}>webm/opus format · plays in most apps and browsers; some older Windows players may not open it</div>
          )}
        </div>
      )}
      {scoreBlob&&(
        <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:6,padding:'8px 10px',background:'rgba(120,200,160,.08)',border:'1px solid rgba(120,200,160,.25)',borderRadius:6}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {(()=>{ const m=scoreFileName.match(/^(.*?)(\.[^.]+)$/); const base=m?m[1]:scoreFileName; const ext=m?m[2]:''; return (
              <span style={{flex:1,display:'flex',alignItems:'center',gap:2,minWidth:0}}>
                <input value={base} onFocus={()=>{inputFocus.current=true;}} onBlur={()=>{inputFocus.current=false;}} onChange={e=>setScoreFileName(e.target.value.replace(/[\/\\:*?"<>|]/g,'')+ext)} aria-label="file name" style={{flex:1,minWidth:0,fontSize:(.6*effScale)+'rem',color:'rgba(160,230,195,1)',background:'rgba(255,255,255,.06)',border:'1px solid rgba(120,200,160,.3)',borderRadius:4,padding:'4px 6px',fontFamily:'inherit',outline:'none'}}/>
                <span style={{fontSize:(.55*effScale)+'rem',color:'rgba(150,225,185,.6)',flexShrink:0}}>{ext} · {(scoreBlob.size/1024).toFixed(0)}KB</span>
              </span>
            ); })()}
            {scoreMsg&&<span style={{fontSize:(.5*effScale)+'rem',color:scoreMsg.tone==='ok'?'rgba(140,255,180,.9)':scoreMsg.tone==='wait'?'rgba(201,168,76,.85)':'rgba(255,140,120,.9)',flexShrink:0,marginRight:4}}>{scoreMsg.text}</span>}
            <button onClick={shareScore} style={{padding:'6px 14px',background:'rgba(120,200,160,.2)',color:'rgba(150,225,185,1)',border:'1px solid rgba(120,200,160,.5)',borderRadius:4,cursor:'pointer',fontSize:(.6*effScale)+'rem',fontFamily:'inherit',letterSpacing:'.06em',flexShrink:0,minWidth:60}}>{t('share')}</button>
            <button onClick={()=>{setScoreBlob(null);setScoreFileName('');setScoreMsg(null);}} style={{padding:'6px 10px',background:'transparent',color:'rgba(207,197,168,.5)',border:'1px solid rgba(207,197,168,.2)',borderRadius:4,cursor:'pointer',fontSize:(.6*effScale)+'rem',fontFamily:'inherit',flexShrink:0}}>✕</button>
          </div>
          <div style={{fontSize:(.48*effScale)+'rem',color:'rgba(150,225,185,.55)',letterSpacing:'.04em'}}>{t('scoreXmlHint')}</div>
        </div>
      )}
      {/* Note-name readout */}
      <div style={{textAlign:'center',marginBottom:4,fontSize:(.7*effScale)+'rem',letterSpacing:'.1em',color:active.size>0?GOLD:composeMode&&chords.length>0?'rgba(201,168,76,.78)':'rgba(201,168,76,.55)',fontVariantNumeric:'tabular-nums',minHeight:'1em',fontFamily:'inherit',transition:'color .15s ease'}}>
        {active.size>0?(()=>{
          const sorted=[...active].sort((a,b)=>a-b);
          const chord=recognizeChord(sorted);
          return chord
            ? <span>{[...active].sort((a,b)=>a-b).map(noteName).join(' · ')} <span style={{color:'rgba(201,168,76,.55)',fontSize:(.6*effScale)+'rem',letterSpacing:'.08em'}}>· {chord}</span></span>
            : sorted.map(noteName).join(' · ');
        })():composeMode&&chords.length>0?(effectiveStyle&&effectiveStyle!=='notes'?`${chords.length} ${t('chordsOnly')}`:`${chords.length} ${t('chordsPlay')}`):'—'}
      </div>
      {showAdvanced && composeMode && (
        <div style={{display:'flex',gap:6,justifyContent:'center',marginBottom:6,fontSize:(.55*effScale)+'rem',letterSpacing:'.08em',flexWrap:'wrap'}}>
          <button onClick={()=>{
            const cur=PAINT_SCALE_KEYS.indexOf(paintScale);
            setPaintScale(PAINT_SCALE_KEYS[(cur+1)%PAINT_SCALE_KEYS.length]);
          }} style={{padding:'7px 10px',background:'transparent',color:paintScale==='off'?'rgba(180,180,180,.55)':'rgba(140,255,180,.85)',border:'1px solid '+(paintScale==='off'?'rgba(180,180,180,.25)':'rgba(140,255,180,.35)'),borderRadius:5,cursor:'pointer',letterSpacing:'.06em',fontFamily:'inherit'}} title="snap every tap to the chosen key (chromatic = off)">
            ♫ {PAINT_SCALES[paintScale].label}
          </button>
        </div>
      )}
      <div style={{display:'flex',gap:6,justifyContent:'center',marginBottom:6,fontSize:(.55*effScale)+'rem',letterSpacing:'.08em',flexWrap:'wrap',alignItems:'center'}}>
        <button onClick={()=>{if(paintScale!=='off'){setPaintScale('off');setShowAdvanced(false);}else setShowAdvanced(v=>!v);}} title="advanced: scale snap" style={{display:composeMode?'inline-block':'none',padding:'7px 10px',background:paintScale!=='off'?'rgba(140,255,180,.08)':'transparent',color:paintScale!=='off'?'rgba(140,255,180,.85)':showAdvanced?'rgba(201,168,76,.85)':'rgba(180,180,180,.5)',border:'1px solid '+(paintScale!=='off'?'rgba(140,255,180,.45)':showAdvanced?'rgba(201,168,76,.45)':'rgba(180,180,180,.25)'),borderRadius:5,cursor:'pointer',letterSpacing:'.06em',fontFamily:'inherit'}}>
          {t('scaleBtn')}
        </button>
        <button
          className="pf-lift"
          onClick={handlePauseClick}
          disabled={demoReelOn||recording||((micPainting||micListening)?!chords.length:((!chords.length&&!playing&&!holdPaused)||(demoMode&&!playing&&!holdPaused)))}
          title={demoReelOn?(t('demoMode')||'demo mode'):recording?t('stopRecFirst'):(micPainting||micListening)?(chords.length?t('play'):micListening?t('stopListenFirst'):t('stopSingFirst')):demoMode&&!playing?t('demoMode'):holdPaused?t('resume'):playing?t('pause'):t('play')}
          style={{padding:'9px 22px',borderRadius:22,fontFamily:'inherit',fontSize:(.62*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase',cursor:(recording||((micPainting||micListening)&&!chords.length))?'default':'pointer',border:'none',color:'#0e120e',background:(recording||((micPainting||micListening)?!chords.length:(!chords.length||(demoMode&&!playing&&!holdPaused))))?'rgba(78,203,141,.25)':'linear-gradient(135deg,#5fd99a,#3aa86e)',boxShadow:(recording||((micPainting||micListening)?!chords.length:(!chords.length||(demoMode&&!playing&&!holdPaused))))?'none':'0 4px 16px rgba(78,203,141,.35)',opacity:(recording||((micPainting||micListening)?!chords.length:(!chords.length||(demoMode&&!playing&&!holdPaused))))?.6:1,transition:'all .18s'}}>
          {holdPaused?t('resume'):playing?t('pause'):t('play')}
        </button>{/* MIC STOP / REC — in the transport row UNDER the canvas (not in
            the strip above it). Replaces the on-canvas STOP/REC buttons; the
            on-canvas voice/music toggle remains for live preset switching. */}
        {micActive && (
          <button onClick={()=>{ if(micPainting) stopMicPainting(); if(micListening) stopMicListening(); setMicArmed(true); }} className="pf-lift" title={t('micActive')} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 14px',background:'rgba(255,40,40,.16)',color:'rgba(255,140,140,.95)',border:'1px solid rgba(255,120,120,.6)',borderRadius:22,cursor:'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>
            <span style={{width:8,height:8,borderRadius:2,background:'#ff5a5a',boxShadow:'0 0 6px #ff5a5a',display:'inline-block'}}/>⏹ {t('micActive').replace(/[^\p{L} ]/gu,'')}
          </button>
        )}
        {micArmed && !micActive && chords.length>0 && (
          <button onClick={()=>{ setMicArmed(false); if(micPreset==='music') startMicListening(); else startMicPainting(); }} className="pf-lift" title={t('micTapToRecord')} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 14px',background:'rgba(255,40,40,.14)',color:'rgba(255,140,140,.95)',border:'1px solid rgba(255,120,120,.6)',borderRadius:22,cursor:'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>
            <span style={{width:9,height:9,borderRadius:'50%',background:'#ff5a5a',boxShadow:'0 0 8px #ff5a5a',display:'inline-block'}}/>🎙 REC
          </button>
        )}<button className="pf-lift" onClick={()=>setMuted(m=>!m)} title={muted?t('unmute'):t('mute')} aria-label={muted?t('unmute'):t('mute')} style={{padding:'8px 11px',background:muted?'rgba(220,90,90,.14)':'rgba(28,24,40,.5)',color:muted?'rgba(255,120,120,.95)':'rgba(201,168,76,.8)',border:'1px solid '+(muted?'rgba(220,90,90,.5)':'rgba(201,168,76,.25)'),borderRadius:22,cursor:'pointer',letterSpacing:'.06em',fontFamily:'inherit'}}>{muted?'🔇':'🔊'}</button>
        {currentMood&&(
          <button className="pf-lift" onClick={()=>{const v=!loopMode;setLoopMode(v);loopModeRef.current=v;}} disabled={recording} title={recording?t('stopRecFirst'):undefined} style={{padding:'8px 14px',background:loopMode?'rgba(201,168,76,.16)':'rgba(28,24,40,.5)',color:recording?'rgba(201,168,76,.2)':loopMode?GOLD:'rgba(201,168,76,.65)',border:'1px solid '+(recording?'rgba(201,168,76,.1)':loopMode?'rgba(201,168,76,.55)':'rgba(201,168,76,.25)'),borderRadius:22,cursor:recording?'default':'pointer',letterSpacing:'.08em',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,textTransform:'uppercase',boxShadow:loopMode?'0 3px 10px rgba(201,168,76,.25)':'none'}}>{t('loop')}</button>
        )}
        {randomMode&&effectiveStyle&&chords.length>0&&!recording&&viewMode!=='image'&&(()=>{
          // Next is available whenever there's a painting on the canvas — during
          // Play, during Pause, AND after the track ends. Re-roll just changes
          // the seed; a follow-up useEffect repaints the canvas with the new
          // variation. We deliberately do NOT gate on `busy` because `busy`
          // includes `playing`, which would wrongly disable Next during Play.
          const canRoll = !anim && !working && !demoReelOn && !recording;
          return (
            <button className="pf-lift" onClick={()=>{ if(canRoll) advanceVariation(); }} disabled={!canRoll} title={canRoll?'next painting — jump to a new variation':'wait for the current action to finish'} aria-label="next painting" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:5,padding:'8px 14px',background:canRoll?'rgba(255,200,120,.18)':'rgba(255,200,120,.08)',color:canRoll?'#ffd07a':'rgba(255,200,120,.3)',border:'1px solid '+(canRoll?'rgba(255,200,120,.55)':'rgba(255,200,120,.15)'),borderRadius:22,cursor:canRoll?'pointer':'default',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase'}}>next ›</button>
          );
        })()}
        {/* SAVE — opens the export flow (size picker → preview: save / share /
            print). Replaces the old always-on PRINT. ENABLED only once a piece
            is finished & still (playedComplete) or there's live compose/mic
            content to export — mirrors the post-completion gate so you don't
            export a half-animated piece. Hidden in the image source view (its
            own controls live elsewhere). */}
        {viewMode!=='image' && (()=>{
          const exportReady =
            (chords.length>0 && !playing && !anim && !holdPaused && disp>=chords.length &&
             !demoReelOn && !composeMode && !micActive && !micArmed && !busy && !recording)
            || ((composeMode||micActive||micArmed) && chords.length>0 && !demoReelOn && !busy && !recording);
          return (
            <button className="pf-lift" onClick={()=>{ if(exportReady) setShowSizePicker(true); }} disabled={!exportReady}
              title={exportReady?t('save'):t('exportNeedsPlay')}
              style={{padding:'8px 14px',background:'transparent',color:exportReady?'rgba(201,168,76,.85)':'rgba(201,168,76,.28)',border:'1px solid '+(exportReady?'rgba(201,168,76,.4)':'rgba(201,168,76,.15)'),borderRadius:22,cursor:exportReady?'pointer':'default',letterSpacing:'.08em',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,textTransform:'uppercase',transition:'all .18s'}}>
              ↓ {t('save')}
            </button>
          );
        })()}
        {viewMode==='image'&&originalImgUrl&&!moodFromImg&&(
          <button onClick={()=>{ if(atmoBusy) return; if(atmoOn){ setAtmoOn(false); } else if(atmoMood){ setAtmoOn(true); } else { if(aiUsable) detectAtmosphere(); } }} disabled={atmoBusy||(!atmoMood&&!aiUsable)} className="pf-lift" title={(!atmoMood&&!aiUsable)?(t('aiOfflineHint')||'AI features need a connection'):(t('atmoLabel')||'atmosphere')} style={{padding:'8px 14px',background:atmoOn?'rgba(120,180,255,.16)':'transparent',color:atmoBusy?'rgba(150,195,255,.6)':atmoOn?'rgba(185,218,255,.98)':'rgba(150,190,240,.75)',border:'1px solid rgba(120,180,255,'+(atmoOn?'.55':'.3')+')',borderRadius:22,cursor:(atmoBusy||(!atmoMood&&!aiUsable))?'default':'pointer',letterSpacing:'.08em',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,textTransform:'uppercase',opacity:(!atmoMood&&!aiUsable)?.5:1,transition:'all .18s'}}>{'✦ '+(t('atmoLabel')||'atmosphere')+' · '+(atmoBusy?'…':(!atmoMood&&!aiUsable)?(t('aiOffline')||'offline'):atmoOn?'ON':'OFF')}</button>
        )}
        {viewMode==='image'&&chords.length>0&&!moodFromImg&&(()=>{
          // REC button — runs play+record together; on completion the SAVE
          // picker auto-opens so the user can immediately pick Story / Audio /
          // Score for the fresh recording. No separate SAVE button needed: the
          // picker IS the save flow, and it appears automatically after REC.
          const canStart = !recording && !playing && !anim && !working && chords.length>0;
          return (
            <button onClick={()=>{ if(recording){ stopRecord(); return; } if(!canStart) return; setRecordIntent('picker'); startRecord(); }} disabled={!canStart && !recording} title={recording?'stop recording':(canStart?t('recArm'):t('exportNeedsPlay'))} style={{padding:'8px 14px',background:recording?'rgba(220,60,60,.16)':'transparent',color:recording?'rgba(255,90,90,.95)':canStart?'rgba(220,90,90,.7)':'rgba(220,90,90,.25)',border:'1px solid '+(recording?'rgba(255,90,90,.6)':canStart?'rgba(220,90,90,.35)':'rgba(220,90,90,.18)'),borderRadius:22,cursor:(recording||canStart)?'pointer':'default',letterSpacing:'.08em',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,textTransform:'uppercase',transition:'all .18s'}}>
              {recording?t('recStop'):t('recArm')}
            </button>
          );
        })()}
        {/* SAVE button removed from image mode — REC auto-opens the picker on
            completion, so a separate SAVE was duplicate UI. */}
        {/* Score button removed from image-mode toolbar — it now lives inside
            the SAVE picker as one of three choices (Story / Audio / Score). */}
        {chords.length>0&&!composeMode&&!micPainting&&!micListening&&(()=>{
          const spd=playbackSpeed;
          const setSpd=setPlaybackSpeed;
          // Discrete rate ladder: 0.25 steps below 1× (0.25–1), whole steps above (1–4).
          const STEPS=[0.25,0.5,0.75,1,2,3,4];
          const label=spd===0.5?'½×':spd===1?'1×':`${(Math.round(spd*100)/100)}×`;
          // Lock speed during recording — changing rate mid-record desyncs the
          // recorded audio from the visual painting timing in the saved file.
          const lockSpeed = recording;
          const nearestIdx=(v)=>{ let bi=0,bd=Infinity; STEPS.forEach((s,i)=>{const d=Math.abs(s-v);if(d<bd){bd=d;bi=i;}}); return bi; };
          // Long-press sweeps up the ladder, wrapping back to the start at the top,
          // so one continuous hold cycles through every rate. Release to keep it.
          // speedMovedRef survives re-renders (a plain const would reset each render
          // when setSpd triggers one, breaking the tap-vs-hold distinction).
          const startHold=()=>{
            if(lockSpeed)return;
            speedMovedRef.current=false;
            const advance=()=>{ if(!speedSweeping) setSpeedSweeping(true); speedMovedRef.current=true; setSpd(v=>{ const i=nearestIdx(v); return STEPS[(i+1)%STEPS.length]; }); };
            // First advance only after the hold threshold, so a quick tap stays a tap.
            speedHoldRef.current=setTimeout(function tick(){ advance(); speedHoldRef.current=setTimeout(tick,420); },420);
          };
          const endHold=()=>{
            const wasHold=speedMovedRef.current;
            if(speedHoldRef.current){clearTimeout(speedHoldRef.current);speedHoldRef.current=null;}
            setSpeedSweeping(false);
            // No movement during the press = treat as a short tap → reset to 1×.
            if(!wasHold && !lockSpeed){ setSpd(1); }
          };
          const cancelHold=()=>{ if(speedHoldRef.current){clearTimeout(speedHoldRef.current);speedHoldRef.current=null;} setSpeedSweeping(false); };
          return(
            <span style={{position:'relative',display:'inline-flex'}}>
              {speedSweeping && (
                <span style={{position:'absolute',bottom:'calc(100% + 8px)',left:'50%',transform:'translateX(-50%)',padding:'6px 14px',borderRadius:14,background:'rgba(20,18,30,.96)',border:'1px solid rgba(201,168,76,.5)',color:GOLD,fontSize:'1.1rem',fontWeight:700,letterSpacing:'.04em',fontFamily:'inherit',whiteSpace:'nowrap',pointerEvents:'none',boxShadow:'0 6px 20px rgba(0,0,0,.5)',zIndex:50}}>{label}</span>
              )}
              <button
                onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);startHold();}}
                onPointerUp={endHold} onPointerCancel={cancelHold}
                disabled={lockSpeed}
                title={lockSpeed?t('stopRecFirst'):'playback speed — tap to reset to 1×, hold to change'}
                aria-label="playback speed — tap to reset, hold to change"
                style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:4,padding:'5px 11px',minWidth:42,border:'1px solid '+(spd===1?'rgba(201,168,76,.2)':'rgba(201,168,76,.45)'),borderRadius:22,background:spd===1?'rgba(28,24,40,.4)':'rgba(201,168,76,.12)',color:spd===1?'rgba(201,168,76,.6)':GOLD,cursor:lockSpeed?'default':'pointer',fontSize:(.5*effScale)+'rem',letterSpacing:'.06em',fontFamily:'inherit',fontWeight:600,opacity:lockSpeed?0.4:1,userSelect:'none',WebkitUserSelect:'none',touchAction:'none'}}>{label}</button>
            </span>
          );
        })()}
        <button
          onClick={()=>{
            // During the demo reel, Clear is an escape gesture: stop the reel
            // and DO NOT actually clear the canvas — leaving the painting
            // intact so the viewer can keep it or interact further.
            if(demoReelOn){ demoReelStop(); return; }
            // L3: clear() doesn't gracefully handle being called while recording —
            // it stops playback (the recorder's audio source) but leaves the
            // recorder running with no input, producing a silent / truncated
            // file. Block clear during recording; the user must stop the
            // recording explicitly first.
            if(recording)return;
            if(clearArmed){
              // Second tap — actually clear
              if(clearArmRef.current){clearTimeout(clearArmRef.current);clearArmRef.current=null;}
              setClearArmed(false);
              clearCanvas();
            }else{
              // First tap — arm only if there's something worth protecting.
              // Visually empty canvas (no painted blocks AND no held keys) = nothing
              // to protect, clear immediately. Loaded but not-yet-played sources
              // (e.g. just picked a Mood) count as empty: chords is populated but
              // disp is 0 since playback hasn't rendered any blocks yet.
              // In compose mode disp stays 0 but chords IS the painting — count it.
              const hasPainting = disp>0 || (composedModeRef.current && chords.length>0);
              if(!hasPainting&&!pending.length){clearCanvas();return;}
              setClearArmed(true);
              clearArmRef.current=setTimeout(()=>{setClearArmed(false);clearArmRef.current=null;},3000);
            }
          }}
          className="pf-lift"
          disabled={recording}
          title={recording?t('stopRecFirst'):undefined}
          style={{padding:'8px 14px',background:clearArmed?'rgba(220,90,90,.18)':'rgba(28,24,40,.5)',color:recording?'rgba(207,197,168,.2)':clearArmed?'rgba(255,140,120,.95)':'rgba(207,197,168,.7)',border:'1px solid '+(recording?'rgba(207,197,168,.12)':clearArmed?'rgba(255,90,90,.55)':'rgba(207,197,168,.3)'),borderRadius:22,cursor:recording?'default':'pointer',letterSpacing:'.08em',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,textTransform:'uppercase',transition:'background .15s ease, color .15s ease, border-color .15s ease'}}>{clearArmed?t('clearConfirm'):t('clear')}</button>
        
        {composeMode&&(
          <button className="pf-lift" onClick={undoLast} disabled={!chords.length||busy||recording} aria-label="remove last chord" title="remove last chord (Backspace)" style={{padding:'8px 13px',background:'rgba(28,24,40,.5)',color:chords.length&&!busy&&!recording?'rgba(207,197,168,.7)':'rgba(207,197,168,.2)',border:'1px solid '+(chords.length&&!busy&&!recording?'rgba(207,197,168,.3)':'rgba(207,197,168,.1)'),borderRadius:22,cursor:chords.length&&!busy&&!recording?'pointer':'default',letterSpacing:'.06em',fontFamily:'inherit',fontSize:(.6*effScale)+'rem'}}>↩</button>
        )}
      </div>
      {composeMode && (
      <div ref={kbScrollRef} style={{overflowX:'auto',maxWidth:'100%',paddingBottom:4,touchAction:'pan-x',WebkitOverflowScrolling:'touch'}}>
        <div style={{position:'relative',width:PW,height:WKH,userSelect:'none',opacity:loadedMode?0.25:(busy&&!playing?0.4:1),filter:loadedMode?'grayscale(0.6)':'none',pointerEvents:loadedMode?'none':'auto'}}>
          {WKEYS.map(({midi,wi})=>{
            const isActive=active.has(midi);
            const isHovered=hoveredKey===midi&&!busy&&!isActive;
            const snapped=paintSnapMidi(midi,paintScale);
            // hoverColor is only computed when hovered, so most renders skip gc()
            const hoverColor=isHovered?gc(snapped,88).slice(0,3):null;
            return(
              <WhiteKey
                key={midi}
                midi={midi}
                wi={wi}
                snapped={snapped}
                isActive={isActive}
                isHovered={isHovered}
                isPending={pendingSet.has(midi)}
                hoverColor={hoverColor}
                busy={busy}
                playing={playing}
                loadedMode={loadedMode}
                pressNote={pressNote}
                releaseNote={releaseNote}
                setHoveredKey={setHoveredKey}
                pressInfo={pressInfo}
              />
            );
          })}
          {BKEYS.map(({midi,lw})=>{
            const isActive=active.has(midi);
            const isHovered=hoveredKey===midi&&!busy&&!isActive;
            const snapped=paintSnapMidi(midi,paintScale);
            const hoverColor=isHovered?gc(snapped,88).slice(0,3):null;
            const outOfScale=paintScaleSet!==null&&!paintScaleSet.includes(midi%12);
            return(
              <BlackKey
                key={midi}
                midi={midi}
                lw={lw}
                snapped={snapped}
                isActive={isActive}
                isHovered={isHovered}
                hoverColor={hoverColor}
                outOfScale={outOfScale}
                busy={busy}
                playing={playing}
                loadedMode={loadedMode}
                pressNote={pressNote}
                releaseNote={releaseNote}
                setHoveredKey={setHoveredKey}
                pressInfo={pressInfo}
              />
            );
          })}
        </div>
      </div>
      )}
      </div>
      )}
      <footer style={{textAlign:'center',padding:'18px 0 10px',opacity:.4,fontSize:(.5*effScale)+'rem',letterSpacing:'.22em',textTransform:'uppercase',color:'rgba(201,168,76,.9)'}}>Paintiano · v2.0{__BUILD_ENV__!=='production' ? ' · build '+__BUILD_SHA__ : ''}</footer>
      {paywallReason && (
        <ProPaywall
          t={t}
          reason={paywallReason}
          trialLeft={trialLeft}
          onClose={()=>setPaywallReason(null)}
          onActivated={()=>setPaywallReason(null)}
          openCheckout={openCheckout}
          activateLicense={activateLicense}
          readScale={effScale}
        />
      )}
      {/* ── FULLSCREEN DEMO REEL OVERLAY ───────────────────────────────────
          Renders OUTSIDE canvasWrap so it covers the ENTIRE viewport, not
          just the canvas box. On PC the canvas is centred in a wide layout,
          so an overlay scoped to the canvas leaves titles cramped and lets
          buttons (Clear, Play, language, etc.) stay clickable underneath.
          This fixed overlay:
            • covers 100dvw × 100dvh
            • centres text in the actual viewport
            • blocks ALL user interactions (pointer-events: auto, no children
              are clickable except the skip layer itself)
            • tap anywhere = skip
          Print-beat (golden frame around the canvas) stays inside canvasWrap
          because it visually wraps the canvas, not the screen. ── */}
      {demoReelOn && (
        <div
          onClick={demoReelStop}
          role="button" aria-label={t('demoSkip')||'skip demo'}
          /* The overlay shows text and listens for tap-to-skip, but it does
             NOT block buttons underneath. Mute / Speed / Back / nav links
             still work normally — they each have their own demo-aware
             handlers (escape or pass-through). Buttons that WOULD break the
             paint flow (Play, Print, Color/Style, source tiles) are
             individually `disabled={demoReelOn}` at their own callsites.
             This way the demo feels alive (you can mute or speed up) rather
             than a frozen modal, while the destructive interactions are
             gated cleanly. */
          style={{position:'fixed',top:0,left:0,width:'100vw',height:'100dvh',zIndex:99998,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none',background:'transparent'}}>
          {/* Title sits dead-centre. The text-box has its own dark scrim so
              the gold gradient stays readable against ANY canvas style behind
              it (Pollock chaos, Mondrian blocks, Rothko fields, etc.). */}
          {demoTyping && (
            <div style={{padding:'14px 26px',pointerEvents:'none',maxWidth:'90vw',textAlign:'center',background:'rgba(8,6,14,.55)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',borderRadius:12,border:'1px solid rgba(240,192,64,.18)'}}>
              <span style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:`clamp(${1.4*effScale}rem,${4.2*effScale}vw,${2.4*effScale}rem)`,color:'#fff',letterSpacing:'.02em'}}>{demoTyping}<span style={{opacity:.6}}>▎</span></span>
            </div>
          )}
          {/* Resolved title text: prefer the live-resolved key (so a language
              switch mid-reel re-translates without restarting), fall back to
              demoText for any ad-hoc string we still set directly. */}
          {(() => {
            const resolved = demoTextKey ? demoReelText(lang, demoTextKey) : demoText;
            if(!resolved || demoTyping) return null;
            return (
              <div style={{padding:'16px 34px',pointerEvents:'none',maxWidth:'90vw',textAlign:'center',background:'rgba(8,6,14,.55)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',borderRadius:14,border:'1px solid rgba(240,192,64,.28)',animation:'pfDemoFade .55s ease'}}>
                <span style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:`clamp(${1.5*effScale}rem,${4.6*effScale}vw,${2.6*effScale}rem)`,letterSpacing:'.025em',background:`linear-gradient(135deg,${PF.gold2},${PF.gold},#c88a18)`,WebkitBackgroundClip:'text',backgroundClip:'text',WebkitTextFillColor:'transparent'}}>{resolved}</span>
              </div>
            );
          })()}
          {/* Skip hint — sits in the bottom-centre of the viewport so it's
              visible the whole reel but never collides with the title cards
              (which centre in the middle). Visual only — actual skip is the
              canvas tap (canvasWrap onClick → demoReelStop). */}
          <div style={{position:'fixed',bottom:'7vh',left:'50%',transform:'translateX(-50%)',display:'inline-flex',alignItems:'center',gap:8,padding:'8px 18px',fontSize:`clamp(${.65*effScale}rem,${1.7*effScale}vw,${.95*effScale}rem)`,letterSpacing:'.12em',textTransform:'uppercase',color:'rgba(247,243,236,.78)',background:'rgba(16,12,24,.55)',borderRadius:20,pointerEvents:'none',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',border:'1px solid rgba(247,243,236,.18)',whiteSpace:'nowrap'}}>
            <span style={{fontSize:'.9em',opacity:.7}}>✕</span>
            {t('demoSkip')||'tap canvas to skip'}
          </div>
        </div>
      )}
    </div>
  );
}
