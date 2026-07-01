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

// ─── Paintiano BOOK ──────────────────────────────────────────────────────
// "Paintiano — The Book of Golden Music" — a static PDF per language at
// /public/book/paintiano-<LANG>.pdf (LANG = app code: EN DE FR ES PT SK zh
// zhTW ja). The localized display title lives in i18n as t('bookTitle').
// bookUrl() falls back to EN for any unknown language.
const BOOK_LANGS = ['EN','DE','FR','ES','PT','SK','zh','zhTW','ja'];
function bookUrl(lang){
  const code = BOOK_LANGS.indexOf(lang) >= 0 ? lang : 'EN';
  return '/book/paintiano-' + code + '.pdf';
}

// Self-contained concept-text modal. Lifted out of the main JSX so the modal
// only reconciles when (lang, t, onClose) actually change — previously it
// re-rendered on every Paintiano render including the 5-15Hz `disp` tick
// during playback even when not visible. `React.memo` plus stable t/onClose
// references from the parent skip reconciliation entirely.
const AboutModal = memo(function AboutModal({onClose, t, ts, lang, readScale, setReadScale}){
  const panelRef = useRef(null);
  useModalFocusTrap(panelRef);
  const cards = getConceptCards(lang);
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.92)',zIndex:100000,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'4vh 16px',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',overflowY:'auto'}}>
      <div ref={panelRef} onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="paintiano-about-title" style={{maxWidth:560,width:'100%',background:'rgba(16,12,24,0.97)',border:'1px solid rgba(201,168,76,.3)',borderRadius:8,padding:'26px 22px 30px',color:'rgba(207,197,168,.88)',fontFamily:'inherit',position:'relative'}}>
        <button onClick={onClose} aria-label="close" style={{position:'absolute',top:12,right:14,background:'transparent',border:'none',color:'rgba(207,197,168,.5)',fontSize:'1.1rem',cursor:'pointer',lineHeight:1,padding:4}} title="close">×</button>
        <div id="paintiano-about-title" style={{textAlign:'center',marginBottom:14,letterSpacing:'.24em',color:'rgba(201,168,76,.85)',fontSize:(.7*readScale)+'rem',textTransform:'uppercase'}}>{t('conceptTitle')}</div>
        <div style={{display:'flex',justifyContent:'center',marginBottom:20}}><button onClick={()=>setReadScale(rs=> rs>=1.5?1 : rs>=1.25?1.5 : 1.25)} aria-label={t('fsLabel')} title={t('fsLabel')} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'5px 16px',borderRadius:16,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',textTransform:'uppercase',color:'rgba(201,168,76,.85)',background:readScale>1?'rgba(255,255,255,.04)':'transparent',border:'1px solid rgba(201,168,76,.85)'}}><span style={{fontSize:'.6rem',fontWeight:600}}>{t('fsLabel')}</span><span style={{fontSize:(0.6*readScale)+'rem',fontWeight:700}}>A</span><span style={{fontSize:'.55rem',opacity:.7}}>{readScale===1?'1×':readScale===1.25?'1.25×':'1.5×'}</span></button></div>
        <div style={{display:'flex',flexDirection:'column',gap:18}}>
          {cards.map((card, i) => (
            <div key={card.id} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,textAlign:'center',padding:'24px 20px',borderRadius:18,background:'rgba(255,255,255,.018)',border:'1px solid rgba(201,168,76,.14)'}}>
              <div style={{fontSize:(3.4*readScale)+'rem',lineHeight:1,color:PF.gold2,filter:'drop-shadow(0 2px 16px rgba(201,168,76,.25))'}}>{card.glyph}</div>
              <div style={{fontSize:(1.5*readScale)+'rem',fontWeight:500,fontFamily:'"Cormorant Garamond", Georgia, serif',fontStyle:'italic',letterSpacing:'.01em',color:PF.gold2,lineHeight:1.2}}>{card.title}</div>
              <div style={{fontSize:(.9*readScale)+'rem',lineHeight:1.6,color:'rgba(230,222,196,.85)',fontFamily:'inherit',letterSpacing:'.01em'}}>{card.body}</div>
              {card.book && (
                <a href={bookUrl(lang)} target="_blank" rel="noopener noreferrer" style={{marginTop:6,padding:'10px 22px',background:'rgba(201,168,76,.16)',color:PF.gold2,border:'1px solid rgba(201,168,76,.55)',borderRadius:22,cursor:'pointer',fontFamily:'inherit',fontSize:(.62*readScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase',textDecoration:'none',display:'inline-block'}}>{ts('bookCta','Read the book')} →</a>
              )}
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{display:'block',margin:'24px auto 0',padding:'8px 24px',background:'transparent',color:'rgba(207,197,168,.7)',border:'1px solid rgba(207,197,168,.25)',borderRadius:3,cursor:'pointer',fontSize:(.6*readScale)+'rem',fontFamily:'inherit',letterSpacing:'.16em',textTransform:'uppercase'}}>{t('close')||'close'}</button>
      </div>
    </div>
  );
});

// Self-contained book modal — opened from the top nav "Book" item. Mirrors the
// look of the Guide book card (glyph + localized title + description + CTA) but
// stands alone, like AboutModal. The CTA opens /book/paintiano-<lang>.pdf.
const BookModal = memo(function BookModal({onClose, t, lang, ts, readScale}){
  const panelRef = useRef(null);
  useModalFocusTrap(panelRef);
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.92)',zIndex:100000,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'4vh 16px',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',overflowY:'auto'}}>
      <div ref={panelRef} onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="paintiano-book-title" style={{maxWidth:480,width:'100%',background:'rgba(16,12,24,0.97)',border:'1px solid rgba(201,168,76,.3)',borderRadius:8,padding:'30px 26px 34px',color:'rgba(207,197,168,.88)',fontFamily:'inherit',position:'relative'}}>
        <button onClick={onClose} aria-label="close" style={{position:'absolute',top:12,right:14,background:'transparent',border:'none',color:'rgba(207,197,168,.5)',fontSize:'1.1rem',cursor:'pointer',lineHeight:1,padding:4}} title="close">×</button>
        <div id="paintiano-book-title" style={{textAlign:'center',marginBottom:18,letterSpacing:'.24em',color:'rgba(201,168,76,.85)',fontSize:(.7*readScale)+'rem',textTransform:'uppercase'}}>{ts('gcat_book','Book')}</div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:18,textAlign:'center'}}>
          <div style={{fontSize:(4*readScale)+'rem',lineHeight:1,color:PF.gold2,filter:'drop-shadow(0 2px 16px rgba(201,168,76,.25))'}}>📖</div>
          <div style={{fontSize:(1.5*readScale)+'rem',fontWeight:500,fontFamily:'"Cormorant Garamond", Georgia, serif',fontStyle:'italic',letterSpacing:'.01em',color:PF.gold2,lineHeight:1.2}}>{t('bookTitle')}</div>
          <div style={{fontSize:(.9*readScale)+'rem',lineHeight:1.55,color:'rgba(230,222,196,.85)',fontFamily:'inherit',letterSpacing:'.01em'}}>{ts('bookDesc','')}</div>
          <a href={bookUrl(lang)} target="_blank" rel="noopener noreferrer" style={{marginTop:6,padding:'10px 22px',background:'rgba(201,168,76,.16)',color:PF.gold2,border:'1px solid rgba(201,168,76,.55)',borderRadius:22,cursor:'pointer',fontFamily:'inherit',fontSize:(.62*readScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase',textDecoration:'none',display:'inline-block'}}>{ts('bookCta','Open the book')} →</a>
        </div>
      </div>
    </div>
  );
});

// Self-contained searchable guide modal. Same memoization rationale as
// AboutModal — without this lift, opening the guide and then leaving it open
// during playback would reconcile its full subtree (input + filtered details
// list) on every 5-15Hz `disp` tick. Now it only reconciles when one of its
// actual props changes (query, focus, lang, t, onClose).
const GuideModal = memo(function GuideModal({onClose, onOpenSetup, initialCardId, t, ts, lang, guideQuery, setGuideQuery, focusedInput, setFocusedInput, inputFocus, readScale, setReadScale, mode='guide'}){
  const panelRef = useRef(null);
  const deckRef = useRef(null);
  useModalFocusTrap(panelRef);
  const isConcept = mode==='concept';
  const isBook = mode==='book';
  const [searchOpen, setSearchOpen] = useState(false);
  const [category, setCategory] = useState('all');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const cards = useMemo(()=>{
    if(isBook) return [{id:'book', glyph:'📖', book:true, title:t('bookTitle')||'The Book', cta:ts('bookCta','Open the book'), body:ts('bookDesc','')}];
    if(isConcept) return getConceptCards(lang);
    const all = getGuideCards(lang);
    return all.filter(c => (category==='all' || c.cat===category) && guideCardMatch(c, guideQuery));
  }, [lang, category, guideQuery, isConcept, isBook, t, ts]);
  // Reset scroll to top when filter changes
  useEffect(()=>{
    if(deckRef.current) deckRef.current.scrollTop = 0;
    setCurrentIdx(0);
    setExpandedId(null);
  }, [category, guideQuery]);
  // Track current card via IntersectionObserver on the deck cards
  useEffect(()=>{
    if(!deckRef.current) return;
    const root = deckRef.current;
    const cardEls = root.querySelectorAll('[data-card-idx]');
    if(!cardEls.length) return;
    const io = new IntersectionObserver((entries)=>{
      const visible = entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
      if(visible){
        const idx = parseInt(visible.target.getAttribute('data-card-idx'),10);
        if(!isNaN(idx)) setCurrentIdx(idx);
      }
    }, {root, threshold:[0.5, 0.75]});
    cardEls.forEach(el=>io.observe(el));
    return ()=>io.disconnect();
  }, [cards.length]);
  // Keyboard arrows for desktop accessibility
  useEffect(()=>{
    const onKey = (e)=>{
      if(e.key==='ArrowDown' || e.key==='ArrowUp'){
        if(!deckRef.current) return;
        if(focusedInput==='guide') return; // typing in search
        e.preventDefault();
        const dir = e.key==='ArrowDown' ? 1 : -1;
        const next = Math.max(0, Math.min(cards.length-1, currentIdx + dir));
        const target = deckRef.current.querySelector(`[data-card-idx="${next}"]`);
        if(target) target.scrollIntoView({behavior:'smooth', block:'start'});
      }
    };
    window.addEventListener('keydown', onKey);
    return ()=>window.removeEventListener('keydown', onKey);
  }, [currentIdx, cards.length, focusedInput]);
  const jumpTo = (idx)=>{
    if(!deckRef.current) return;
    const target = deckRef.current.querySelector(`[data-card-idx="${idx}"]`);
    if(target) target.scrollIntoView({behavior:'smooth', block:'start'});
  };
  // On open, if a starting card id was passed (e.g. returning from Setup),
  // jump straight to that card instead of the first one. Runs once on mount.
  useEffect(()=>{
    if(!initialCardId || !deckRef.current) return;
    const idx = cards.findIndex(c=>c.id===initialCardId);
    if(idx<0) return;
    const go = ()=>{
      const target = deckRef.current && deckRef.current.querySelector(`[data-card-idx="${idx}"]`);
      if(target){ target.scrollIntoView({block:'start'}); setCurrentIdx(idx); }
    };
    const r = requestAnimationFrame(go);
    return ()=>cancelAnimationFrame(r);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const CATS = [
    {key:'all',     label:t('gcat_all')!=='gcat_all'?t('gcat_all'):'All'},
    {key:'start',   label:t('gcat_start')!=='gcat_start'?t('gcat_start'):'Start'},
    {key:'colors',  label:t('gcat_colors')!=='gcat_colors'?t('gcat_colors'):'Colors'},
    {key:'style',   label:t('gcat_style')!=='gcat_style'?t('gcat_style'):'Style'},
    {key:'music',   label:t('gcat_music')!=='gcat_music'?t('gcat_music'):'Music'},
    {key:'tools',   label:t('gcat_tools')!=='gcat_tools'?t('gcat_tools'):'Tools'},
    {key:'save',    label:t('gcat_save')!=='gcat_save'?t('gcat_save'):'Save'},
    {key:'pro',     label:t('gcat_pro')!=='gcat_pro'?t('gcat_pro'):'Pro'},
  ];
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.96)',zIndex:100000,backdropFilter:'blur(14px)',WebkitBackdropFilter:'blur(14px)',display:'flex',justifyContent:'center'}}>
      <style>{`
        .pf-guide-deck::-webkit-scrollbar{display:none;}
        .pf-guide-deck{scrollbar-width:none;}
        .pf-guide-card{scroll-snap-align:start;scroll-snap-stop:always;}
        @keyframes pf-guide-card-in{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
        .pf-guide-card-inner{animation:pf-guide-card-in .4s cubic-bezier(.2,.8,.2,1) both;}
      `}</style>
      <div ref={panelRef} onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="paintiano-guide-title" className="pf-guide-panel" style={{position:'relative',width:'100%',maxWidth:480,height:'100%',display:'flex',flexDirection:'column',color:'rgba(247,243,236,.92)',fontFamily:'inherit',borderLeft:'1px solid rgba(201,168,76,.08)',borderRight:'1px solid rgba(201,168,76,.08)',background:'rgba(8,6,14,0.35)'}}>
        {/* Top bar */}
        <div className="pf-guide-topbar" style={{flexShrink:0,padding:'14px 16px 8px',display:'flex',alignItems:'center',gap:10,position:'relative',zIndex:2}}>
          {!isConcept && !isBook ? <button onClick={()=>{ setSearchOpen(v=>{ const n=!v; if(!n) setGuideQuery(''); return n; }); }} aria-label="search" title="search" style={{background:searchOpen?'rgba(201,168,76,.18)':'rgba(28,24,40,.6)',border:'1px solid '+(searchOpen?'rgba(201,168,76,.55)':'rgba(242,238,232,.15)'),color:searchOpen?PF.gold2:'rgba(247,243,236,.85)',width:34,height:34,borderRadius:'50%',cursor:'pointer',fontSize:'.95rem',display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,fontFamily:'inherit'}}>⌕</button> : <div style={{width:34,height:34}} aria-hidden="true" />}
          <div id="paintiano-guide-title" style={{flex:1,textAlign:'center',letterSpacing:'.22em',color:'rgba(201,168,76,.85)',fontSize:(.65*readScale)+'rem',textTransform:'uppercase',fontWeight:600}}>{isBook ? ts('gcat_book','Book') : isConcept ? (t('conceptTitle')||'Concept') : (t('guideTitle')||'Guide')}</div>
          <button onClick={onClose} aria-label="close" title="close" style={{background:'rgba(28,24,40,.6)',border:'1px solid rgba(242,238,232,.15)',color:'rgba(247,243,236,.85)',width:34,height:34,borderRadius:'50%',cursor:'pointer',fontSize:'1.1rem',display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,fontFamily:'inherit'}}>×</button>
        </div>
        {/* Search (expandable) */}
        {searchOpen && (
          <div style={{flexShrink:0,padding:'4px 16px 8px',position:'relative',zIndex:2}}>
            <input
              type="search"
              autoFocus
              value={guideQuery}
              onChange={e=>setGuideQuery(e.target.value)}
              onFocus={()=>{inputFocus.current=true;setFocusedInput('guide');}}
              onBlur={()=>{inputFocus.current=false;setFocusedInput(null);}}
              placeholder={t('searchGuide')||'search'}
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              inputMode="search"
              enterKeyHint="search"
              aria-label={t('searchGuide')||'search'}
              style={{width:'100%',boxSizing:'border-box',background:'rgba(8,6,14,0.7)',border:'1px solid '+(focusedInput==='guide'?'rgba(201,168,76,.7)':'rgba(242,238,232,.15)'),borderRadius:22,padding:'10px 16px',color:'rgba(247,243,236,.95)',fontSize:(.78*readScale)+'rem',fontFamily:'inherit',outline:'none',letterSpacing:'.03em',WebkitAppearance:'none',transition:'border-color .15s ease'}}
            />
          </div>
        )}
        {/* Category chips */}
        {!isConcept && !isBook && <div style={{flexShrink:0,padding:'2px 8px 10px',display:'flex',gap:6,overflowX:'auto',scrollbarWidth:'none',position:'relative',zIndex:2}} className="pf-guide-deck pf-guide-cats">
          {CATS.map(c=>{
            const on = category===c.key;
            return (
              <button key={c.key} onClick={()=>setCategory(c.key)} style={{flexShrink:0,padding:'7px 14px',borderRadius:18,background:on?'rgba(201,168,76,.18)':'rgba(28,24,40,.55)',color:on?PF.gold2:'rgba(230,222,196,.75)',border:'1px solid '+(on?'rgba(201,168,76,.55)':'rgba(242,238,232,.1)'),cursor:'pointer',fontFamily:'inherit',fontSize:(.62*readScale)+'rem',fontWeight:600,letterSpacing:'.08em',textTransform:'uppercase',whiteSpace:'nowrap',transition:'all .15s'}}>{c.label}</button>
            );
          })}
        </div>}
        {/* Swipe deck */}
        <div ref={deckRef} className="pf-guide-deck" style={{flex:1,overflowY:'auto',overflowX:'hidden',scrollSnapType:'y mandatory',scrollBehavior:'smooth',WebkitOverflowScrolling:'touch',position:'relative'}}>
          {cards.length===0 ? (
            <div style={{minHeight:'100%',display:'flex',alignItems:'center',justifyContent:'center',padding:'40px 24px',color:'rgba(230,222,196,.5)',fontStyle:'italic',fontSize:(.78*readScale)+'rem',textAlign:'center'}}>{t('noMatches')||'no matches'} {guideQuery && `"${guideQuery}"`}</div>
          ) : (
            cards.map((card, idx)=>(
              <div key={card.id} data-card-idx={idx} className="pf-guide-card" style={{minHeight:'100%',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px 28px 60px',boxSizing:'border-box'}}>
                <div key={card.id+'-'+idx} className="pf-guide-card-inner" style={{maxWidth:520,width:'100%',display:'flex',flexDirection:'column',alignItems:'center',gap:18,textAlign:'center'}}>
                  <div style={{fontSize:'5rem',lineHeight:1,color:PF.gold2,marginBottom:6,filter:'drop-shadow(0 2px 16px rgba(201,168,76,.25))'}}>{card.glyph}</div>
                  <div style={{fontSize:(1.6*readScale)+'rem',fontWeight:500,fontFamily:'"Cormorant Garamond", Georgia, serif',fontStyle:'italic',letterSpacing:'.01em',color:PF.gold2,lineHeight:1.2}}>{card.title}</div>
                  <div style={{fontSize:(.92*readScale)+'rem',lineHeight:1.55,color:'rgba(230,222,196,.85)',fontFamily:'inherit',letterSpacing:'.01em'}}>{card.body}</div>
                  {card.more && expandedId!==card.id && (
                    <button onClick={()=>setExpandedId(card.id)} style={{marginTop:2,padding:'7px 18px',background:'transparent',color:'rgba(201,168,76,.8)',border:'1px solid rgba(201,168,76,.4)',borderRadius:22,cursor:'pointer',fontFamily:'inherit',fontSize:(.58*readScale)+'rem',fontWeight:600,letterSpacing:'.12em',textTransform:'uppercase'}}>{(t('guideMore')&&t('guideMore')!=='guideMore')?t('guideMore'):'More'} ↓</button>
                  )}
                  {card.more && expandedId===card.id && (
                    <>
                      <div className="pf-guide-card-inner" style={{fontSize:(.82*readScale)+'rem',lineHeight:1.6,color:'rgba(230,222,196,.78)',fontFamily:'inherit',letterSpacing:'.01em',textAlign:'left',maxWidth:480}}>{card.more}</div>
                      <button onClick={()=>setExpandedId(null)} style={{marginTop:2,padding:'7px 18px',background:'transparent',color:'rgba(201,168,76,.6)',border:'1px solid rgba(201,168,76,.3)',borderRadius:22,cursor:'pointer',fontFamily:'inherit',fontSize:(.58*readScale)+'rem',fontWeight:600,letterSpacing:'.12em',textTransform:'uppercase'}}>{(t('guideLess')&&t('guideLess')!=='guideLess')?t('guideLess'):'Less'} ↑</button>
                    </>
                  )}
                  {card.book ? (
                    <a href={bookUrl(lang)} target="_blank" rel="noopener noreferrer" style={{marginTop:6,padding:'10px 22px',background:'rgba(201,168,76,.16)',color:PF.gold2,border:'1px solid rgba(201,168,76,.55)',borderRadius:22,cursor:'pointer',fontFamily:'inherit',fontSize:(.62*readScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase',textDecoration:'none',display:'inline-block'}}>{card.cta} →</a>
                  ) : card.cta && (
                    <button onClick={()=>{ if(onOpenSetup) onOpenSetup(card.id); else onClose(); }} style={{marginTop:6,padding:'10px 22px',background:'rgba(201,168,76,.16)',color:PF.gold2,border:'1px solid rgba(201,168,76,.55)',borderRadius:22,cursor:'pointer',fontFamily:'inherit',fontSize:(.62*readScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>{card.cta} →</button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        {/* Progress dots (right side, vertical) */}
        {cards.length > 1 && (
          <div className="pf-guide-progress" style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',display:'flex',flexDirection:'column',gap:6,zIndex:3,pointerEvents:'none'}}>
            {cards.map((_,i)=>(
              <button key={i} onClick={()=>jumpTo(i)} aria-label={`card ${i+1}`} style={{pointerEvents:'auto',width:i===currentIdx?10:6,height:i===currentIdx?10:6,borderRadius:'50%',background:i===currentIdx?'rgba(201,168,76,.85)':'rgba(242,238,232,.3)',border:'none',cursor:'pointer',padding:0,transition:'all .2s'}} />
            ))}
          </div>
        )}
        {/* Position indicator (bottom left) */}
        {cards.length > 0 && (
          <div style={{position:'absolute',left:18,bottom:18,fontSize:(.6*readScale)+'rem',color:'rgba(201,168,76,.55)',letterSpacing:'.12em',pointerEvents:'none',fontVariantNumeric:'tabular-nums'}}>{currentIdx+1} / {cards.length}</div>
        )}
        {/* Two-thumb nav — prev (bottom-left) / next (bottom-right). Desktop only
            via CSS; mobile keeps pure swipe. */}
        {cards.length > 1 && (
          <div className="pf-guide-nav" style={{display:'none'}}>
            <button onClick={()=>jumpTo(Math.max(0,currentIdx-1))} disabled={currentIdx<=0} aria-label="previous" className="pf-guide-nav-prev" style={{width:60,height:60,borderRadius:'50%',background:'rgba(28,24,40,.72)',border:'1px solid rgba(201,168,76,.3)',color:currentIdx<=0?'rgba(201,168,76,.3)':'rgba(201,168,76,.82)',fontSize:'1.6rem',cursor:currentIdx<=0?'default':'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,fontFamily:'inherit'}}>˄</button>
            <span className="pf-guide-nav-pos" style={{fontSize:(.6*readScale)+'rem',letterSpacing:'.16em',color:'rgba(230,222,196,.45)',textTransform:'uppercase',fontVariantNumeric:'tabular-nums'}}>{currentIdx+1} / {cards.length}</span>
            <button onClick={()=>jumpTo(Math.min(cards.length-1,currentIdx+1))} disabled={currentIdx>=cards.length-1} aria-label="next" className="pf-guide-nav-next" style={{width:60,height:60,borderRadius:'50%',background:currentIdx>=cards.length-1?'rgba(28,24,40,.72)':'rgba(201,168,76,.85)',border:'1px solid rgba(201,168,76,.6)',color:currentIdx>=cards.length-1?'rgba(201,168,76,.3)':'#1a1400',fontSize:'1.6rem',cursor:currentIdx>=cards.length-1?'default':'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,fontFamily:'inherit'}}>˅</button>
          </div>
        )}
        {/* Text size toggle (bottom right) */}
        <button onClick={()=>setReadScale(rs=> rs>=1.5?1 : rs>=1.25?1.5 : 1.25)} aria-label={t('fsLabel')} title={t('fsLabel')} style={{position:'absolute',right:14,bottom:12,display:'inline-flex',alignItems:'center',gap:4,padding:'5px 12px',borderRadius:16,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',textTransform:'uppercase',color:'rgba(201,168,76,.7)',background:'rgba(28,24,40,.55)',border:'1px solid rgba(201,168,76,.3)',fontSize:'.55rem',fontWeight:600}}>A<span style={{fontSize:(.6*readScale)+'rem',fontWeight:700}}>A</span><span style={{fontSize:'.5rem',opacity:.6}}>{readScale===1?'1×':readScale===1.25?'1¼':'1½'}</span></button>
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
            // Reset to Scriabin's Prometheus default — the same table the app
            // seeds Custom with at first launch. Scriabin marked D♯ and A♯ as
            // "metallic steel" and E, B as "pearly" — CUSTOM_DEFAULT_SAT
            // desaturates those four so they read as their respective shades,
            // not pure hue.
            setCustomPalette(Array.from({length:12},(_,pc)=>{
              const [r,g,b]=fromHsl(CUSTOM_DEFAULT_HUE[pc],CUSTOM_DEFAULT_SAT[pc],55);
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
// §6c  SVG CONTEXT SHIM — vector export for gallery prints
// ─────────────────────────────────────────────────────────────────────────────
//   A minimal CanvasRenderingContext2D-compatible shim that records every draw
//   call as an SVG element instead of rasterising it. The painting renderer
//   (drawBlock, draw*Overlay) is fully canvas-API based with no getImageData /
//   filter / drawImage — so substituting a real ctx for this shim produces a
//   resolution-independent SVG of the exact same painting. Used for the
//   "gallery" sizeMode export (Pro / Pro AI only). The print shop's RIP then
//   rasterises at whatever DPI the printer supports — 600, 720, even 1200 DPI
//   for fine-art giclée — without us ever having to rasterise in-browser.
//
//   Implements: fill/stroke for paths, rects, arcs, ellipses, bezier/quadratic
//   curves; gradients (linear & radial); text; shadows (as feGaussianBlur);
//   transform stack (save/restore/scale/rotate/translate); globalAlpha and
//   globalCompositeOperation (the latter maps to blend-mode where it can).
function createSvgCtx(width, height){
  const out = [];
  const defs = [];
  let gradId = 0, clipId = 0;
  // Style state — exactly the CRC2D defaults we care about.
  let state = {
    fillStyle:'#000', strokeStyle:'#000', lineWidth:1,
    lineCap:'butt', lineJoin:'miter',
    globalAlpha:1, globalCompositeOperation:'source-over',
    shadowColor:'rgba(0,0,0,0)', shadowBlur:0, shadowOffsetX:0, shadowOffsetY:0,
    font:'10px sans-serif',
    transform:[1,0,0,1,0,0],   // a,b,c,d,e,f (identity)
    clipPath:null
  };
  const stack = [];
  const path = [];    // current path as SVG path-data string segments
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  // Resolve fill/stroke style — if it's a gradient object created by us, emit
  // it into <defs> and return url(#id); otherwise pass the colour string.
  const resolve = v => {
    if(!v || typeof v === 'string') return v||'none';
    if(v.__svgGrad){
      const id='g'+(++gradId);
      if(v.kind==='linear'){
        defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${v.x0}" y1="${v.y0}" x2="${v.x1}" y2="${v.y1}">${v.stops.map(s=>`<stop offset="${s.off}" stop-color="${s.col}"/>`).join('')}</linearGradient>`);
      } else {
        defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${v.x1}" cy="${v.y1}" r="${v.r1}" fx="${v.x0}" fy="${v.y0}">${v.stops.map(s=>`<stop offset="${s.off}" stop-color="${s.col}"/>`).join('')}</radialGradient>`);
      }
      return 'url(#'+id+')';
    }
    return 'none';
  };
  // Build the attributes block all draw calls share (transform/opacity/clip/blend).
  const commonAttrs = () => {
    const a = [];
    const [m0,m1,m2,m3,m4,m5] = state.transform;
    if(!(m0===1&&m1===0&&m2===0&&m3===1&&m4===0&&m5===0))
      a.push(`transform="matrix(${m0} ${m1} ${m2} ${m3} ${m4} ${m5})"`);
    if(state.globalAlpha!==1) a.push(`opacity="${state.globalAlpha}"`);
    if(state.clipPath) a.push(`clip-path="url(#${state.clipPath})"`);
    if(state.globalCompositeOperation && state.globalCompositeOperation!=='source-over'){
      // best-effort mapping; unsupported ops just fall back to normal blend.
      const mode = ({'multiply':'multiply','screen':'screen','overlay':'overlay','darken':'darken','lighten':'lighten','color-dodge':'color-dodge','color-burn':'color-burn','soft-light':'soft-light','hard-light':'hard-light','difference':'difference','exclusion':'exclusion'})[state.globalCompositeOperation];
      if(mode) a.push(`style="mix-blend-mode:${mode}"`);
    }
    return a.length?(' '+a.join(' ')):'';
  };
  // Stroke attrs (only when stroking).
  const strokeAttrs = () => {
    const s = resolve(state.strokeStyle);
    return ` stroke="${esc(s)}" stroke-width="${state.lineWidth}" stroke-linecap="${state.lineCap}" stroke-linejoin="${state.lineJoin}" fill="none"`;
  };
  const fillAttrs = () => ` fill="${esc(resolve(state.fillStyle))}"`;
  // The shim object — same shape as CanvasRenderingContext2D for the methods
  // and properties the painting renderer touches.
  const ctx = {
    // ── style properties (getters/setters via defineProperty so x.fillStyle='...' works) ──
    get fillStyle(){return state.fillStyle;}, set fillStyle(v){state.fillStyle=v;},
    get strokeStyle(){return state.strokeStyle;}, set strokeStyle(v){state.strokeStyle=v;},
    get lineWidth(){return state.lineWidth;}, set lineWidth(v){state.lineWidth=v;},
    get lineCap(){return state.lineCap;}, set lineCap(v){state.lineCap=v;},
    get lineJoin(){return state.lineJoin;}, set lineJoin(v){state.lineJoin=v;},
    get globalAlpha(){return state.globalAlpha;}, set globalAlpha(v){state.globalAlpha=v;},
    get globalCompositeOperation(){return state.globalCompositeOperation;}, set globalCompositeOperation(v){state.globalCompositeOperation=v;},
    get shadowColor(){return state.shadowColor;}, set shadowColor(v){state.shadowColor=v;},
    get shadowBlur(){return state.shadowBlur;}, set shadowBlur(v){state.shadowBlur=v;},
    get shadowOffsetX(){return state.shadowOffsetX;}, set shadowOffsetX(v){state.shadowOffsetX=v;},
    get shadowOffsetY(){return state.shadowOffsetY;}, set shadowOffsetY(v){state.shadowOffsetY=v;},
    get font(){return state.font;}, set font(v){state.font=v;},
    imageSmoothingEnabled:true,  // no-op for vector
    // ── state stack ──
    save(){ stack.push(JSON.parse(JSON.stringify(state))); },
    restore(){ if(stack.length) state=stack.pop(); },
    // ── transforms (compose into the current matrix) ──
    translate(x,y){
      const t=state.transform;
      state.transform=[t[0],t[1],t[2],t[3], t[0]*x+t[2]*y+t[4], t[1]*x+t[3]*y+t[5]];
    },
    scale(sx,sy){
      const t=state.transform;
      state.transform=[t[0]*sx,t[1]*sx,t[2]*sy,t[3]*sy,t[4],t[5]];
    },
    rotate(a){
      const t=state.transform, c=Math.cos(a), s=Math.sin(a);
      state.transform=[t[0]*c+t[2]*s, t[1]*c+t[3]*s, t[0]*-s+t[2]*c, t[1]*-s+t[3]*c, t[4], t[5]];
    },
    // ── path API ──
    beginPath(){ path.length=0; },
    closePath(){ path.push('Z'); },
    moveTo(x,y){ path.push(`M${x} ${y}`); },
    lineTo(x,y){ path.push(`L${x} ${y}`); },
    bezierCurveTo(x1,y1,x2,y2,x,y){ path.push(`C${x1} ${y1} ${x2} ${y2} ${x} ${y}`); },
    quadraticCurveTo(x1,y1,x,y){ path.push(`Q${x1} ${y1} ${x} ${y}`); },
    arc(cx,cy,r,a0,a1,ccw){
      // arc segment as elliptical path
      let d=a1-a0;
      if(ccw){ if(d>0) d-=2*Math.PI; } else { if(d<0) d+=2*Math.PI; }
      // Full circle: split into two semicircles (SVG can't do full circle in one A).
      if(Math.abs(d)>=2*Math.PI-1e-9){
        const x0=cx+r*Math.cos(a0), y0=cy+r*Math.sin(a0);
        const x1=cx-r*Math.cos(a0), y1=cy-r*Math.sin(a0);
        path.push(`M${x0} ${y0}A${r} ${r} 0 1 1 ${x1} ${y1}A${r} ${r} 0 1 1 ${x0} ${y0}`);
        return;
      }
      const x0=cx+r*Math.cos(a0), y0=cy+r*Math.sin(a0);
      const x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1);
      const large=Math.abs(d)>Math.PI?1:0, sweep=ccw?0:1;
      // If no current subpath, move first; otherwise line to the start.
      if(!path.length) path.push(`M${x0} ${y0}`); else path.push(`L${x0} ${y0}`);
      path.push(`A${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`);
    },
    arcTo(x1,y1,x2,y2,r){
      // Approximate with a line + arc (full algo is complex; this matches the
      // visual the renderer expects for rounded corners).
      path.push(`L${x1} ${y1}`);
      path.push(`A${r} ${r} 0 0 1 ${x2} ${y2}`);
    },
    ellipse(cx,cy,rx,ry,rot,a0,a1,ccw){
      // Translate/rotate via matrix; for simplicity emit two semi-arcs.
      let d=a1-a0;
      if(ccw){ if(d>0) d-=2*Math.PI; } else { if(d<0) d+=2*Math.PI; }
      const cos=Math.cos(rot), sin=Math.sin(rot);
      const pt=(a)=>{
        const x=rx*Math.cos(a), y=ry*Math.sin(a);
        return [cx + x*cos - y*sin, cy + x*sin + y*cos];
      };
      const [x0,y0]=pt(a0), [x1,y1]=pt(a1);
      if(Math.abs(d)>=2*Math.PI-1e-9){
        const [xm,ym]=pt(a0+Math.PI);
        path.push(`M${x0} ${y0}A${rx} ${ry} ${rot*180/Math.PI} 1 1 ${xm} ${ym}A${rx} ${ry} ${rot*180/Math.PI} 1 1 ${x0} ${y0}`);
        return;
      }
      const large=Math.abs(d)>Math.PI?1:0, sweep=ccw?0:1;
      if(!path.length) path.push(`M${x0} ${y0}`); else path.push(`L${x0} ${y0}`);
      path.push(`A${rx} ${ry} ${rot*180/Math.PI} ${large} ${sweep} ${x1} ${y1}`);
    },
    rect(x,y,w,h){
      path.push(`M${x} ${y}h${w}v${h}h${-w}Z`);
    },
    // ── paint ──
    fill(){
      const d = path.join(' ');
      if(!d) return;
      out.push(`<path d="${d}"${fillAttrs()}${commonAttrs()}/>`);
    },
    stroke(){
      const d = path.join(' ');
      if(!d) return;
      out.push(`<path d="${d}"${strokeAttrs()}${commonAttrs()}/>`);
    },
    fillRect(x,y,w,h){
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}"${fillAttrs()}${commonAttrs()}/>`);
    },
    strokeRect(x,y,w,h){
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}"${strokeAttrs()}${commonAttrs()}/>`);
    },
    clearRect(x,y,w,h){
      // SVG has no clear; emit a white rect (the background is set up that way).
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#04040a"${commonAttrs()}/>`);
    },
    fillText(text,x,y){
      // Best-effort font parsing.
      const f = String(state.font||'10px sans-serif');
      const sizeM = f.match(/([\d.]+)px/), fam = f.replace(/^.*px\s*/,'')||'sans-serif';
      const size = sizeM?sizeM[1]:'10';
      out.push(`<text x="${x}" y="${y}" font-size="${size}" font-family="${esc(fam)}"${fillAttrs()}${commonAttrs()}>${esc(text)}</text>`);
    },
    // ── clip (used by Klimt etc.) ──
    clip(){
      const id='c'+(++clipId);
      const d=path.join(' ');
      defs.push(`<clipPath id="${id}">${d?`<path d="${d}"/>`:''}</clipPath>`);
      state.clipPath=id;
    },
    // ── gradients ──
    createLinearGradient(x0,y0,x1,y1){
      const g={__svgGrad:true,kind:'linear',x0,y0,x1,y1,stops:[],addColorStop(o,c){this.stops.push({off:o,col:c});}};
      return g;
    },
    createRadialGradient(x0,y0,r0,x1,y1,r1){
      const g={__svgGrad:true,kind:'radial',x0,y0,r0,x1,y1,r1,stops:[],addColorStop(o,c){this.stops.push({off:o,col:c});}};
      return g;
    },
    // ── finalize ──
    toSvg(){
      const defsStr = defs.length?`<defs>${defs.join('')}</defs>`:'';
      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defsStr}${out.join('')}</svg>`;
    }
  };
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// §7  MAIN COMPONENT — Paintiano
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// §6b  TRANSPORT CONTROL SYSTEM — token styles + lucide-style icons
//   One source of truth for every button in the bottom transport/tool row. The
//   row differs per mode, but each button maps to a TOKEN whose colour carries
//   meaning (see TRANSPORT-SYSTEM.md). txStyle(token, {effScale,on,disabled})
//   returns the inline style; uniform geometry (h40 / r20, primary h44).
//   TOKENS: primary green · neutral gold-glass · active gold-filled ·
//   pink (navigation) · blue (audio source) · ai violet (Atmosphere) ·
//   save gold · danger red · ghost (Clear idle).
// ─────────────────────────────────────────────────────────────────────────────
function txStyle(token, opts={}){
  const { effScale=1, on=false, disabled=false, icon=false, primary=false } = opts;
  const base = {
    display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6,
    height: primary?44:40, padding: icon?0 : (primary?'0 22px':'0 15px'), width: icon?40:undefined,
    borderRadius:20, fontFamily:'inherit', fontSize:(( primary?.62:.56)*effScale)+'rem',
    fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', whiteSpace:'nowrap',
    cursor: disabled?'default':'pointer', transition:'all .16s',
    WebkitBackdropFilter:'blur(10px)', backdropFilter:'blur(10px)', WebkitTapHighlightColor:'transparent',
  };
  const T = {
    primary:{ border:'none', color:'#08120c', fontWeight:700,
      background:'linear-gradient(135deg,#5fd99a,#37a96b)', boxShadow:'0 5px 18px rgba(78,203,141,.4)' },
    neutral:{ border:'1px solid rgba(201,168,76,.28)', background:'rgba(255,255,255,.04)', color:'rgba(201,168,76,.85)' },
    active:{ border:'1px solid #e8c766', background:'rgba(201,168,76,.18)', color:'#e8c766', boxShadow:'0 3px 10px rgba(201,168,76,.22)' },
    pink:{ border:'1px solid rgba(232,85,122,.5)', background:'rgba(232,85,122,.14)', color:'#ff7a9c', fontWeight:700 },
    blue:{ border:'1px solid rgba(120,160,255,.45)', background:'rgba(120,160,255,.12)', color:'#9bc0ff' },
    ai:   on ? { border:'1px solid rgba(220,150,255,.55)', background:'rgba(220,150,255,.2)', color:'rgba(228,178,255,.98)', boxShadow:'0 3px 12px rgba(220,150,255,.25)' }
             : { border:'1px solid rgba(220,150,255,.3)', background:'rgba(220,150,255,.08)', color:'rgba(225,175,255,.78)' },
    save:{ border:'1px solid rgba(255,200,120,.55)', background:'rgba(255,200,120,.16)', color:'#ffd07a', fontWeight:700 },
    danger: on ? { border:'1px solid rgba(255,90,90,.65)', background:'rgba(255,90,90,.16)', color:'#ff8a8a' }
               : { border:'1px solid rgba(232,90,90,.45)', background:'rgba(232,90,90,.10)', color:'#e8857a' },
    ghost:{ border:'1px solid rgba(201,168,76,.2)', background:'transparent', color:'rgba(201,168,76,.55)' },
  };
  const style = { ...base, ...(T[token]||T.neutral) };
  if(disabled){ style.opacity = .42; }
  return style;
}
// Lucide-style inline icons (stroked, no emoji). Keyed by name.
const TxIcon = ({n, s=15}) => {
  const P = { width:s, height:s, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.8, strokeLinecap:'round', strokeLinejoin:'round' };
  switch(n){
    case 'pause':   return <svg {...P}><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>;
    case 'play':    return <svg {...P}><path d="M8 5v14l11-7z"/></svg>;
    case 'mute':    return <svg {...P}><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m17 9 5 6M22 9l-5 6"/></svg>;
    case 'sound':   return <svg {...P}><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>;
    case 'rec':     return <svg {...P}><circle cx="12" cy="12" r="6"/></svg>;
    case 'stop':    return <svg {...P}><rect x="6" y="6" width="12" height="12" rx="2"/></svg>;
    case 'next':    return <svg {...P}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case 'restart': return <svg {...P}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>;
    case 'save':    return <svg {...P}><path d="M12 15V3M7 8l5-5 5 5M5 21h14"/></svg>;
    case 'loop':    return <svg {...P}><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>;
    case 'show':    return <svg {...P}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>;
    case 'sparkle': return <svg {...P}><path d="M12 3l1.6 4.8L18 9l-4.4 1.2L12 15l-1.6-4.8L6 9z"/></svg>;
    case 'notes':   return <svg {...P}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
    case 'undo':    return <svg {...P}><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/></svg>;
    case 'web':     return <svg {...P}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>;
    case 'print':   return <svg {...P}><path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="9" rx="2"/><rect x="7" y="15" width="10" height="6" rx="1"/><circle cx="17.5" cy="12.5" r=".6" fill="currentColor"/></svg>;
    case 'gallery': return <svg {...P}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/></svg>;
    case 'score':   return <svg {...P}><path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="15" r="2"/><path d="M10 15V7l6-2v9"/><circle cx="14" cy="13" r="2"/></svg>;
    case 'upload':  return <svg {...P}><path d="M12 3v13M6 9l6-6 6 6"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>;
    case 'sample':  return <svg {...P}><path d="M3 12h2l2-7 4 14 3-10 2 5 2-2h3"/></svg>;
    default:        return null;
  }
};

export default function Paintiano() {
  const canvasRef    = useRef(null);
  const canvasWrapRef = useRef(null); // wrapper around the canvas — scrolled into view when the strip closes
  const stripWrapRef = useRef(null); // wrapper around the Color·Style strip — scroll target on Play in mood-from-image so the strip + source thumbnail stay framed
  // Set true when the Hear image chip transfers a Music-mode painting into
  // Image mode. The ← Back handler reads this and routes back to Music
  // (restoreMode('music')) instead of the default Setup screen. Single-use:
  // cleared as soon as Back consumes it.
  const _imageFromMusicRef = useRef(false);
  // Mirror flag for the REVERSE bridge: set true when See music transfers
  // an Image-scan chord array into Music mode. The ← Back handler routes
  // back to Image (restoreMode('image')) instead of Setup. Single-use.
  const _musicFromImageRef = useRef(false);
  // See music second channel: per-event dominant carrying tone (_domPc), one
  // pitch class per image-scan cell, captured in song order before encodeMidi
  // strips it. After loadMidi parses the MIDI back into chord events, a
  // post-load effect re-attaches a _domPc onto each Music chord by proportional
  // song position (the round-trip merges/re-quantizes chords, but left-to-right
  // order is invariant). Audio never reads _domPc; only the painter does, so the
  // Music canvas can show each cell's source carrying colour while the audio
  // plays the full, unchanged harmony. Pure Image / pure Music never set this.
  const _imageDomPcsRef = useRef(null);
  // Bridge draft signatures (point 4). When See music / Hear image creates a
  // target-mode draft and the user works on it then taps Back, the in-progress
  // target draft is stashed (musicStashRef / imageStashRef) tagged with the
  // SOURCE scan's signature here. On the NEXT bridge tap we compare the current
  // source signature: if it matches, restore the in-progress target draft
  // (resume where they left off); if the source changed (new direction/palette/
  // length), the stale target draft is discarded and the bridge regenerates a
  // fresh piece. Null = no reusable bridge draft.
  const _seeMusicSrcSigRef = useRef(null);  // Image signature when the Music draft was made
  const _hearImageSrcSigRef = useRef(null); // Music signature when the Image draft was made
  const audioElRef   = useRef(null); // real audio playback in audio mode
  const audioSourceRef = useRef(null); // Web Audio source node for audio mode
  const samplerRef   = useRef(null);
  const samplerOk    = useRef(false);
  // True once we've attached the AudioContext 'statechange' listener so we
  // don't register multiple handlers across repeated unlockAudio calls. The
  // listener detects iOS audio-session steals (another tab grabbed output,
  // typically a second Paintiano instance) and pre-emptively kills stuck
  // oscillators so they don't burst out as a monotone piano blast when the
  // session returns. See unlockAudio.
  const audioStateListenerRef = useRef(false);
  // Set true when the page goes to background while audio is live. On iOS the
  // context often comes back as state==='running' yet produces NO sound (the
  // audio device was torn down) — a plain silent-kick won't revive it, only a
  // suspend()->resume() cycle does. This flag tells unlockAudio/wakeAudio that
  // the next revive must force that cycle even though the context reads
  // 'running'. Cleared once a successful re-acquire has run.
  const audioWasHiddenRef = useRef(false);
  // Re-armed by the audio statechange listener when the context dies mid-session
  // so the next Lite tap re-runs hard-recovery. Declared here (before unlockAudio
  // attaches the statechange listener) to avoid a temporal-dead-zone reference.
  const basicTapUnlockedRef = useRef(false);
  // Permanent "first tap has unlocked audio" flag — set once, never reset by
  // statechange, so unlockAudio (and its silent kick) runs exactly once.
  const liteEverUnlockedRef = useRef(false);
  const pendingRef   = useRef([]);
  const kbTimer      = useRef(null);
  const timers       = useRef([]);
  const idxRef       = useRef(0);
  const pixelRef     = useRef(null);
  // Backup of the scan pixel data ({nc,nr,px,...}). aiComposeFromImage nulls
  // pixelRef (so re-transcribe/Vary don't run over a composed piece), which
  // would otherwise leave Clear unable to rebuild the scan. Kept here so Clear
  // can restore scan from the same picture.
  const scanPixelBackupRef = useRef(null);
  const genRef       = useRef(0);
  const inputFocus   = useRef(false);
  const refMidi      = useRef(null);
  const refAudio     = useRef(null);
  const refImage     = useRef(null);
  const refImgMood   = useRef(null);
  const refScore     = useRef(null);
  const refSound     = useRef(null); // unified MIDI/audio/score picker
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
  // Raw audio capture during Mic/Music: MediaRecorder + collected chunks +
  // finalised Blob. When present at playback, the user can choose to play
  // back the original source audio instead of the synthesised piano cover.
  const listenRecorderRef = useRef(null);
  const listenChunksRef   = useRef([]);
  const listenBlobRef     = useRef(null); // {blob, url, durationMs} once finalised
  const listenPCMRef      = useRef(null); // decoded AudioBuffer of the blob
  const originalSourceRef = useRef(null); // active BufferSourceNode during playback
  const originalRafRef    = useRef(null); // RAF id for paint-time-sync loop
  const originalPlaybackRef = useRef(false); // true while audio buffer drives playback (no sampler)
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

  // ── PWA AUTO-UPDATE ────────────────────────────────────────────────────────
  // The PWA manifest registers a service worker with autoUpdate strategy. That
  // downloads the new build in the background, but a tab that's been sitting
  // in the user's mobile tab switcher for days will keep showing the OLD JS
  // in memory until it's reloaded. This effect closes that gap:
  //  1. On mount we ask the active SW registration to check the network for
  //     a fresh build (cheap, just compares hashes).
  //  2. We watch the SW "controllerchange" event — that fires the moment a
  //     new worker takes over (skipWaiting + clientsClaim trigger it). When
  //     it fires we reload, but only if the tab is in the background (so we
  //     don't yank the page out from under someone actively painting).
  //  3. We also watch visibilitychange — every time the tab comes back to
  //     the foreground we ask the SW to re-check for updates; if one has
  //     already downloaded silently, the controllerchange handler above
  //     will fire and the tab gets reloaded next time it's backgrounded.
  // Net effect: tabs left open between mobile cards refresh into the latest
  // build the next time the user briefly leaves Paintiano and comes back.
  useEffect(()=>{
    if(typeof navigator==='undefined' || !('serviceWorker' in navigator)) return;
    let reloadArmed = false;
    const tryReload = ()=>{
      if(!reloadArmed) return;
      // Only reload when the tab is hidden — avoids interrupting active painting.
      if(document.visibilityState !== 'visible'){
        try{ window.location.reload(); }catch(_){}
      }
    };
    const onControllerChange = ()=>{
      // A new SW just took control. Arm reload for the next background moment.
      reloadArmed = true;
      tryReload();
    };
    const onVisibility = ()=>{
      if(document.visibilityState === 'visible'){
        // Foreground: ask the SW to check the network for a new build.
        navigator.serviceWorker.getRegistration()
          .then(reg => { if(reg) reg.update().catch(()=>{}); })
          .catch(()=>{});
      } else {
        // Background: if an update has already downloaded, take it now.
        tryReload();
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisibility);
    // Kick an initial update check on mount.
    navigator.serviceWorker.getRegistration()
      .then(reg => { if(reg) reg.update().catch(()=>{}); })
      .catch(()=>{});
    return ()=>{
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  },[]);
  // ────────────────────────────────────────────────────────────────────────────
  // Tone — global colour modifier toggled in Setup. Three modes:
  //   'pure'   = raw palette, no modulation of any kind (Paintiano "concept" tone)
  //   'real'   = energy modulates saturation/lightness per chord (dynamic)
  //   'pastel' = pastel filter only — soft lighter spectrum, no dynamic modulation
  // Each tone is "clean" in its own way: Pure stays exactly on the palette, Real
  // breathes with the music, Pastel paints a uniformly soft picture. Declared
  // near the top so the gc() useCallback (defined later) can list it as a
  // dependency. Persisted via localStorage; the two booleans pushed into
  // 02-draw module flags through a useEffect.
  const [tone,setTone]=useState(()=>{
    try{
      const v=localStorage.getItem('paintiano_tone');
      if(v==='pure'||v==='real'||v==='pastel') return v;
      // Legacy migration: previous name set { normal, mix, pastel }.
      if(v==='normal') return 'pure';
      if(v==='mix')    return 'real';
      // Even older legacy: boolean paintiano_pastel '0'/'1' from the original
      // 2-state implementation.
      if(localStorage.getItem('paintiano_pastel')==='1') return 'pastel';
    }catch(_){}
    return 'pure';   // default — raw palette colours, no modulation
  });
  useEffect(()=>{
    // Real tone uses a continuous Pure↔Pastel mix per chord energy (handled
    // in gc()). _mixOn enables the per-voice velocity modulation inside
    // drawBlockMosaic / drawBlockNotes — so within a single chord, louder
    // notes lean a touch more pure and softer notes lean a touch more
    // pastel, matching musical intuition for inner voicing. _energyTint
    // and _pastelTint stay disabled — the mix is fully resolved in gc().
    try{_setMixOn(tone==='real');}catch(_){}
    try{_setPastelOn(false);}catch(_){}
    try{localStorage.setItem('paintiano_tone',tone);}catch(_){}
  },[tone]);
  // The colour reading the app chose for the current image (harmony or bw), so
  // leaving Custom returns to it rather than always to harmony.
  const appModeRef = useRef('harmony');
  // True when KONTRA is the colourful-image AUTO default (not a manual pick), so the
  // leave-image cleanup can reset it to harmony without clobbering a hand-chosen kontra.
  const kontraAutoRef = useRef(false);
  // ─── Paintiano Pro state (from 07-pro.jsx) ───
  // Hoisted up here so `proStatus` is in scope for activePalette / shuffle pool /
  // effectivePairs / etc. below. The hook has no parameter dependencies — order
  // among hooks doesn't matter for correctness as long as it stays consistent.
  const { proStatus, isPro, isProAI, maskedEmail, activateLicense, deactivateLicense, openCheckout,
          trialUsed, trialLeft, trialExhausted, consumeTrial, gateAI } = useEntitlements();
  const [paywallReason, setPaywallReason] = useState(null); // null | 'ai_trial' | 'settings'
  // Custom palette = 12 hex colors, one per pitch class (index 0 = C, 11 = B).
  // null = uninitialized. Seeded on first switch to 'custom' mode from whichever
  // mode was active. Persisted across sessions in localStorage.
  const [customPalette, setCustomPalette] = useState(()=>{
    try{
      const PALETTE_VERSION='7';
      const savedVersion=localStorage.getItem('paintiano_palette_version');
      if(savedVersion!==PALETTE_VERSION){
        // Force-seed Scriabin's Prometheus default (CUSTOM_DEFAULT_HUE +
        // CUSTOM_DEFAULT_SAT) into localStorage, overwriting any prior saved
        // palette — including the old inverse-Harmony default (now promoted
        // to the Kontra chip) AND any user-customised palette from a previous
        // version. On this rollout every user (Free + Pro + Pro AI) lands on
        // the new Scriabin default. Pre-existing customisations are discarded.
        // Scriabin marked D♯ and A♯ as "metallic steel" (sat 25) and E, B
        // as "pearly" (sat 60) — CUSTOM_DEFAULT_SAT honours both so the
        // seed reads as the painter's intended shades, not pure hue.
        const seed = CUSTOM_DEFAULT_HUE.map((h,pc)=>{
          const [r,g,b]=fromHsl(h,CUSTOM_DEFAULT_SAT[pc],55);
          return '#'+[r,g,b].map(x=>Math.max(0,Math.min(255,x)).toString(16).padStart(2,'0')).join('');
        });
        try{
          localStorage.setItem('paintiano_custom_palette', JSON.stringify(seed));
          localStorage.setItem('paintiano_palette_version', PALETTE_VERSION);
        }catch(_){}
        return seed;
      }
      const raw=localStorage.getItem('paintiano_custom_palette');
      if(!raw)return null;
      const arr=JSON.parse(raw);
      if(!Array.isArray(arr)||arr.length!==12)return null;
      if(arr.every(h=>h==='#888888'))return null;
      return arr;
    }catch(_){}
    return null;
  });
  // Default Custom palette — Scriabin's Prometheus colour-tone mapping (1910).
  // The most famous synaesthete in history actually saw these colours for
  // these pitches; the table follows the circle of fifths through a rainbow,
  // with D♯/A♯ (steel) at 25% and E/B (pearly) at 60% to honour Scriabin's
  // own descriptive marks for those four tones.
  // The user can recolour any swatch in the editor (Pro).
  const defaultCustomPalette=useMemo(()=>Array.from({length:12},(_,pc)=>{
    const [r,g,b]=fromHsl(CUSTOM_DEFAULT_HUE[pc],CUSTOM_DEFAULT_SAT[pc],55);
    return '#'+[r,g,b].map(x=>Math.max(0,Math.min(255,x)).toString(16).padStart(2,'0')).join('');
  }),[]);
  // Pro tier uses the user's saved palette (or default if empty). Free tier
  // is locked to the default palette — their saved colours from a previous
  // Pro period (or before downgrade) remain in localStorage untouched, but
  // are not applied at runtime. Upgrading restores their saved choices.
  const activePalette=(proStatus==='free')
    ? defaultCustomPalette
    : (customPalette||defaultCustomPalette);
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
  // ─── User picker preferences (Setup modal) ────────────────────────────────
  // Lets the user narrow what shows up in the canvas-view pickers. Two arrays
  // of opt-in keys, persisted in localStorage. Default = everything (current
  // behavior preserved on first launch). Mosaic family is one item that
  // covers all three states (Mosaic / Notes / oneM); the chip still cycles
  // internally on tap, but the family is shown/hidden as a unit.
  const ALL_PALETTE_KEYS = ['harmony','spectral','phi','kontra','custom'];
  const ALL_ARTIST_KEYS  = ['mosaicFamily','picasso','matisse','pollock','bloom','kusama','miro','mondrian','bauhaus','kandinsky','gold','rothko','bulge','wave','spiral','arcs','pop','mitchell','monet','hokusai'];
  // Tones available in the active canvas Tone selector. Users can pre-filter
  // which tones appear in the main panel via Setup (same chip-list UI as
  // palettes/artists). Default: all three on.
  const ALL_TONE_KEYS    = ['pure','real','pastel'];
  const [setupPalettes, setSetupPalettes] = useState(() => {
    try {
      const raw = localStorage.getItem('paintiano_setup_palettes');
      if(!raw) return ALL_PALETTE_KEYS.slice();
      const arr = JSON.parse(raw);
      if(!Array.isArray(arr)) return ALL_PALETTE_KEYS.slice();
      const valid = arr.filter(k => ALL_PALETTE_KEYS.includes(k));
      return valid.length ? valid : ALL_PALETTE_KEYS.slice();
    } catch(_) { return ALL_PALETTE_KEYS.slice(); }
  });
  const [setupArtists, setSetupArtists] = useState(() => {
    try {
      const raw = localStorage.getItem('paintiano_setup_artists');
      if(!raw) return ALL_ARTIST_KEYS.slice();
      const arr = JSON.parse(raw);
      if(!Array.isArray(arr)) return ALL_ARTIST_KEYS.slice();
      const valid = arr.filter(k => ALL_ARTIST_KEYS.includes(k));
      if(!valid.length) return ALL_ARTIST_KEYS.slice();
      // One-time auto-add of newly introduced artists (e.g. a new pair like
      // monet/hokusai) so existing users see them enabled by default on the
      // first launch after the update. CRITICAL: this must run ONCE PER ARTIST,
      // not on every launch — otherwise a user who deliberately turns Monet off
      // in Setup gets it forced back on at the next restart (the bug we're
      // fixing). We remember which artists have already been seeded in a
      // separate localStorage flag and never re-seed those again.
      const NEW_ARTISTS = ['monet','hokusai','mondrian','bauhaus'];
      let seeded = [];
      try { const s = JSON.parse(localStorage.getItem('paintiano_setup_artists_seeded')||'[]'); if(Array.isArray(s)) seeded = s; } catch(_){}
      let seededChanged = false;
      for(const k of NEW_ARTISTS){
        if(!ALL_ARTIST_KEYS.includes(k)) continue;
        if(seeded.includes(k)) continue;          // already seeded once → respect user's choice
        if(!valid.includes(k)) valid.push(k);     // first time this artist ships → enable by default
        seeded.push(k); seededChanged = true;     // and mark as seeded so we never force it again
      }
      if(seededChanged){
        try { localStorage.setItem('paintiano_setup_artists_seeded', JSON.stringify(seeded)); } catch(_){}
      }
      // (Artists are now independent chips — no pair-healing needed.)
      return valid;
    } catch(_) { return ALL_ARTIST_KEYS.slice(); }
  });
  useEffect(() => {
    try { localStorage.setItem('paintiano_setup_palettes', JSON.stringify(setupPalettes)); } catch(_) {}
  }, [setupPalettes]);
  useEffect(() => {
    try { localStorage.setItem('paintiano_setup_artists', JSON.stringify(setupArtists)); } catch(_) {}
  }, [setupArtists]);
  const [setupTones, setSetupTones] = useState(() => {
    // Default = Pure only (a single tone). With one tone enabled the canvas
    // hides the tone picker and paints in Pure silently; a user who wants Real
    // or Pastel switching enables them in Setup. A previously saved selection in
    // localStorage is respected.
    const DEFAULT_TONES = ['pure'];
    try {
      const raw = localStorage.getItem('paintiano_setup_tones');
      if(!raw) return DEFAULT_TONES.slice();
      const arr = JSON.parse(raw);
      if(!Array.isArray(arr)) return DEFAULT_TONES.slice();
      const valid = arr.filter(k => ALL_TONE_KEYS.includes(k));
      return valid.length ? valid : DEFAULT_TONES.slice();
    } catch(_) { return DEFAULT_TONES.slice(); }
  });
  useEffect(() => {
    try { localStorage.setItem('paintiano_setup_tones', JSON.stringify(setupTones)); } catch(_) {}
  }, [setupTones]);
  // If the current tone is no longer in setupTones (user disabled it), fall
  // back to the first enabled tone — keeps the active selection valid without
  // forcing the user to manually re-pick after editing Setup.
  useEffect(() => {
    if(!setupTones.includes(tone)){
      const fb = setupTones[0] || 'pure';
      setTone(fb);
    }
  }, [setupTones, tone]);
  // Landing-page deep link: /play?upgrade=pro|proai opens the paywall straight
  // away on the matching tier. 'pro' → reason 'settings' (Pro card on top);
  // 'proai' → reason 'ai_trial' (Pro AI card on top, recommended). Runs once on
  // mount, then strips the param so a refresh doesn't reopen it.
  useEffect(() => {
    try {
      const u = new URLSearchParams(window.location.search);
      const up = u.get('upgrade');
      if (up === 'pro') setPaywallReason('settings');
      else if (up === 'proai') setPaywallReason('ai_trial');
      if (up) { u.delete('upgrade'); const qs = u.toString(); window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash); }
    } catch(_) {}
  }, []);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupReturnTo, setSetupReturnTo] = useState(null);
  const [guideReturnCardId, setGuideReturnCardId] = useState(null);
  // Setup-picker fallback effects live further down, AFTER `style`/`setStyle`
  // are declared (around line 930) — referencing them here would hit a
  // temporal dead zone on first render.
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
  // ── PostHog funnel events ──
  const firedCreateRef = useRef(false);
  useEffect(() => {
    if (!firedCreateRef.current && chords.length > 0) {
      firedCreateRef.current = true;
      try { window.posthog && window.posthog.capture('first_creation'); } catch (_) {}
    }
  }, [chords.length]);
  useEffect(() => {
    if (paywallReason) { try { window.posthog && window.posthog.capture('paywall_shown', { reason: paywallReason }); } catch (_) {} }
  }, [paywallReason]);
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get('paid') === '1') window.posthog && window.posthog.capture('purchase_return'); } catch (_) {}
  }, []);
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
  const [playing,   setPlaying]   = useState(false);const mutedRef=useRef(false);
  const [muted,setMuted]=useState(()=>{try{const v=localStorage.getItem('paintiano_muted')==='1';mutedRef.current=v;return v;}catch(_){return false;}});useEffect(()=>{mutedRef.current=muted;try{Tone.getDestination().mute=muted;localStorage.setItem('paintiano_muted',muted?'1':'0');if(audioSourceRef.current&&audioSourceRef.current._muteGain)audioSourceRef.current._muteGain.gain.value=muted?0:1;}catch(_){}},[muted]);const randomModeRef=useRef(false);const [randomMode,setRandomMode]=useState(false);const [rndSalt,setRndSalt]=useState(0);const [shuffleArtistIndex,setShuffleArtistIndex]=useState(0);const [mosaicShuffleLock,setMosaicShuffleLock]=useState(false);const [phaseIndex,setPhaseIndex]=useState(0);const [shufVariant,setShufVariant]=useState(0);
  // ── Lite "Surprise me" shuffle-bags (better perceived randomness) ──────────
  // surpriseArtistBag: a shuffled queue of artist keys; we pop one per tap and
  // only reshuffle once every artist has appeared — so none repeats until all
  // others have shown, and none goes missing for long. surpriseVariantBags:
  // per-artist shuffled queues of variant indices, same idea at the variant
  // level. Refs so they survive across taps without triggering re-renders.
  const surpriseArtistBagRef = useRef([]);
  const surpriseVariantBagsRef = useRef({});
  useEffect(()=>{randomModeRef.current=randomMode;try{localStorage.setItem('paintiano_random',randomMode?'1':'0');}catch(_){}},[randomMode]);
  // SHOW MODE (auto-shuffle slideshow): while a piece is playing AND dice is on
  // (full shuffle, or dice + a selected artist), the Save chip is replaced by a
  // "↻ Show" chip. Tapping it auto-advances the painting every SHOW_INTERVAL ms
  // (as if Next were pressed on a timer); Next is disabled while Show runs. A
  // second tap toggles it off; the timer is also torn down when playback stops.
  const SHOW_INTERVAL_MS = 8000;
  const [showMode,setShowMode]=useState(false);
  const showTimerRef=useRef(null);
  const showDiceRef=useRef(null); // holds the latest _diceRoll so the interval calls a fresh closure
  // ── DICE "BAG" (shuffle without replacement) ──
  // Within one song, Dice should not repeat an already-shown combination until
  // every combination has been shown; then the bag refills and reshuffles.
  //  • selected artist → bag = that artist's variants [0..N-1]
  //  • full shuffle    → bag = every (artistIndex × variant) combination
  // diceBagKeyRef identifies the current bag's context (song + artist + mode +
  // pool size + tier); when it changes the bag is rebuilt from scratch.
  const diceBagRef=useRef([]);
  const diceBagKeyRef=useRef('');
  // Variation history for Random mode prev/next navigation. saltHistory holds
  // the sequence of random salts that have been shown; saltIdxRef points at the
  // current one. Play-from-start and Loop append+advance (fresh variation);
  // Prev/Next step the index so you can browse back to a variation you liked.
  const saltHistoryRef = useRef([0]);
  const saltIdxRef = useRef(0);
  const [variationPos, setVariationPos] = useState(0); // for UI: re-render on nav
  const [lang, setLang] = useState(()=>{try{const s=localStorage.getItem('paintiano_lang');if(s)return s;const ls=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'en']);for(const r of ls){if(!r)continue;const lo=r.toLowerCase();if(lo.startsWith('zh')&&(lo.includes('tw')||lo.includes('hk')||lo.includes('hant')||lo.includes('mo')))return 'zhTW';if(lo.startsWith('zh'))return 'zh';const two=lo.slice(0,2);const m={en:'EN',de:'DE',fr:'FR',es:'ES',sk:'SK',pt:'PT',ja:'ja'};if(m[two])return m[two];}return 'EN';}catch(_){return 'EN';}});
  // isDesktop — tightens vertical rhythm on notebook viewports so the phone-shape
  // column fits 100vh without a scrollbar. Mobile keeps the original spacing.
  const [isDesktop, setIsDesktop] = useState(()=>{try{return typeof window!=='undefined' && window.matchMedia && window.matchMedia('(min-width: 769px)').matches;}catch(_){return false;}});
  // 5-col layout breakpoint (desktop landscape + tablet landscape). Matches
  // the CSS @media (min-width: 769px) and (min-height: 501px) and (orientation: landscape).
  // Used to opt-in to layout changes that only make sense at this width.
  const [is5Col, setIs5Col] = useState(()=>{try{return typeof window!=='undefined' && window.matchMedia && window.matchMedia('(min-width: 769px) and (min-height: 501px) and (orientation: landscape)').matches;}catch(_){return false;}});
  // isNotPhone \u2014 desktop + tablet portrait + tablet landscape (phones excluded in both orientations).
  const [isNotPhone, setIsNotPhone] = useState(()=>{try{return typeof window!=='undefined' && window.matchMedia && window.matchMedia('(min-width: 769px) and (min-height: 501px)').matches;}catch(_){return false;}});
  // isMobilePortrait — phone held upright. Used by Setup to render the Tone
  // selector as a full-width horizontal row of 3 buttons below the two
  // columns, instead of the default vertical stack in the left column.
  const [isMobilePortrait, setIsMobilePortrait] = useState(()=>{try{return typeof window!=='undefined' && window.matchMedia && window.matchMedia('(max-width: 768px) and (orientation: portrait)').matches;}catch(_){return false;}});
  useEffect(()=>{
    if(typeof window==='undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(min-width: 769px) and (min-height: 501px) and (orientation: landscape)');
    const onChange = (e)=>setIs5Col(e.matches);
    try{ mql.addEventListener('change', onChange); }catch(_){ try{ mql.addListener(onChange); }catch(__){} }
    return ()=>{ try{ mql.removeEventListener('change', onChange); }catch(_){ try{ mql.removeListener(onChange); }catch(__){} } };
  },[]);
  useEffect(()=>{
    if(typeof window==='undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(min-width: 769px) and (min-height: 501px)');
    const onChange = (e)=>setIsNotPhone(e.matches);
    try{ mql.addEventListener('change', onChange); }catch(_){ try{ mql.addListener(onChange); }catch(__){} }
    return ()=>{ try{ mql.removeEventListener('change', onChange); }catch(_){ try{ mql.removeListener(onChange); }catch(__){} } };
  },[]);
  useEffect(()=>{
    if(typeof window==='undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(min-width: 769px)');
    const onChange = (e)=>setIsDesktop(e.matches);
    try{ mql.addEventListener('change', onChange); }catch(_){ try{ mql.addListener(onChange); }catch(__){} }
    return ()=>{ try{ mql.removeEventListener('change', onChange); }catch(_){ try{ mql.removeListener(onChange); }catch(__){} } };
  },[]);
  useEffect(()=>{
    if(typeof window==='undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(max-width: 768px) and (orientation: portrait)');
    const onChange = (e)=>setIsMobilePortrait(e.matches);
    try{ mql.addEventListener('change', onChange); }catch(_){ try{ mql.addListener(onChange); }catch(__){} }
    return ()=>{ try{ mql.removeEventListener('change', onChange); }catch(_){ try{ mql.removeListener(onChange); }catch(__){} } };
  },[]);
  // Mirror lang into a ref so the demo reel orchestrator (whose timers were
  // scheduled with closure over the old lang) can resolve text at fire time
  // against the current language. Otherwise switching language mid-reel
  // updates the navigation but the title cards keep the original lang.
  const langRef = useRef(lang);
  useEffect(()=>{ langRef.current = lang; }, [lang]);
  const [langOpen, setLangOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const t = useCallback((key) => I18N[lang]?.[key] ?? I18N.EN[key] ?? key, [lang]);
  // Bulletproof fallback wrapper: t() returns the key string itself when no
  // translation exists in either the active language or EN, which means
  // `t('foo')||'bar'` keeps `'foo'` (truthy) instead of falling through to
  // 'bar'. ts() compares against the key so the fallback actually fires.
  const ts = useCallback((key, fallback) => { const v = t(key); return (v && v !== key) ? v : fallback; }, [t]);

  // ─── (Pro state hoisted earlier in the component — see useEntitlements above) ───
  // Convenience flag: Free tier user who has used all their AI trial credits.
  // Drives the "disabled + PRO badge" visual state on AI buttons (How do you
  // feel? · Mood from image · AI Compose · Atmosphere) and the locked mood
  // input. Clicks on any of these still surface the paywall once, not on every
  // tap — the visual state already communicates the gating.
  const aiLocked = (proStatus === 'free') && trialExhausted;
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
    EN:{picasso:'Cubist',kusama:'Dots',pollock:'Drip',kandinsky:'Abstract',miro:'Constellation',mondrian:'Grid',bauhaus:'Bauhaus',rothko:'Fields',matisse:'Cut-out',bulge:'Bulge',arcs:'Arcs',bloom:'Bloom',spiral:'Spiral',gold:'Gold',pop:'Pop',wave:'Wave',comic:'Comic',monet:'Light',hokusai:'Woodblock'},
    SK:{picasso:'Kubizmus',kusama:'Bodky',pollock:'Kvapky',kandinsky:'Abstraktné',miro:'Konštelácia',mondrian:'Mriežka',bauhaus:'Bauhaus',rothko:'Polia',matisse:'Výstrižky',bulge:'Vyklenutie',arcs:'Oblúky',bloom:'Kvet',spiral:'Špirála',gold:'Zlato',pop:'Pop',wave:'Vlna',comic:'Komiks',monet:'Svetlo',hokusai:'Drevoryt'},
    DE:{picasso:'Kubismus',kusama:'Punkte',pollock:'Tropfen',kandinsky:'Abstrakt',miro:'Konstellation',mondrian:'Raster',bauhaus:'Bauhaus',rothko:'Felder',matisse:'Scherenschnitt',bulge:'Wölbung',arcs:'Bögen',bloom:'Blüte',spiral:'Spirale',gold:'Gold',pop:'Pop',wave:'Welle',comic:'Comic',monet:'Licht',hokusai:'Holzschnitt'},
    FR:{picasso:'Cubiste',kusama:'Pois',pollock:'Gouttes',kandinsky:'Abstrait',miro:'Constellation',mondrian:'Grille',bauhaus:'Bauhaus',rothko:'Champs',matisse:'Découpage',bulge:'Bombé',arcs:'Arcs',bloom:'Floraison',spiral:'Spirale',gold:'Or',pop:'Pop',wave:'Vague',comic:'BD',monet:'Lumière',hokusai:'Estampe'},
    ES:{picasso:'Cubista',kusama:'Puntos',pollock:'Goteo',kandinsky:'Abstracto',miro:'Constelación',mondrian:'Cuadrícula',bauhaus:'Bauhaus',rothko:'Campos',matisse:'Recortes',bulge:'Abultado',arcs:'Arcos',bloom:'Floración',spiral:'Espiral',gold:'Oro',pop:'Pop',wave:'Onda',comic:'Cómic',monet:'Luz',hokusai:'Xilografía'},
    PT:{picasso:'Cubista',kusama:'Pontos',pollock:'Gotas',kandinsky:'Abstrato',miro:'Constelação',mondrian:'Grade',bauhaus:'Bauhaus',rothko:'Campos',matisse:'Recortes',bulge:'Saliência',arcs:'Arcos',bloom:'Florescer',spiral:'Espiral',gold:'Ouro',pop:'Pop',wave:'Onda',comic:'HQ',monet:'Luz',hokusai:'Xilogravura'},
    zh:{picasso:'立体派',kusama:'圆点',pollock:'滴洒',kandinsky:'抽象',miro:'星座',mondrian:'网格',bauhaus:'包豪斯',rothko:'色域',matisse:'剪纸',bulge:'凸起',arcs:'弧线',bloom:'绽放',spiral:'螺旋',gold:'金色',pop:'波普',wave:'波浪',comic:'漫画',monet:'光',hokusai:'浮世绘'},
    zhTW:{picasso:'立體派',kusama:'圓點',pollock:'滴灑',kandinsky:'抽象',miro:'星座',mondrian:'網格',bauhaus:'包豪斯',rothko:'色域',matisse:'剪紙',bulge:'凸起',arcs:'弧線',bloom:'綻放',spiral:'螺旋',gold:'金色',pop:'普普',wave:'波浪',comic:'漫畫',monet:'光',hokusai:'浮世繪'},
    ja:{picasso:'キュビズム',kusama:'ドット',pollock:'ドリップ',kandinsky:'抽象',miro:'星座',mondrian:'グリッド',bauhaus:'バウハウス',rothko:'色面',matisse:'切り絵',bulge:'凸面',arcs:'弧',bloom:'開花',spiral:'螺旋',gold:'金',pop:'ポップ',wave:'波',comic:'コミック',monet:'光',hokusai:'浮世絵'},
  };
  const STYLE_LABELS = STYLE_LABELS_I18N[lang] || STYLE_LABELS_I18N.EN;
  const STYLE_INSPIRED = {picasso:'Picasso',kusama:'Kusama',pollock:'Pollock',kandinsky:'Kandinsky',miro:'Miró',mondrian:'Mondrian',bauhaus:'Bauhaus',rothko:'Rothko',matisse:'Matisse',bulge:'Vasarely',arcs:'Stella',bloom:'Sam Francis',spiral:'Hilma af Klint',gold:'Gustav Klimt',pop:'Keith Haring',wave:'Bridget Riley',mitchell:'Joan Mitchell',monet:'Claude Monet',hokusai:'Katsushika Hokusai',mosaic:'Mosaic',notes:'Notes',oneM:'One Million Dollar Page'};
  // Style pairs — each picker button cycles through two related styles, the way
  // Mosaic cycles to Notes. Tap an inactive button → first style; tap the active
  // button → flip to its partner; tap again → back to Mosaic. Pairing is by
  // visual/medium kinship: cubist↔cut-out, drip↔bloom, dots↔constellation,
  // grid↔bauhaus, gold↔fields, bulge↔wave, spiral↔arcs, pop↔comic.
  const BASE_STYLE_PAIRS = [
    ['picasso','matisse'],
    ['pollock','bloom'],
    ['kusama','miro'],
    ['kandinsky','bauhaus'],
    ['gold','rothko'],
    ['bulge','wave'],
    ['spiral','arcs'],
    ['pop','mitchell'],
    ['monet','hokusai'],
  ];
  // Which of each pair sits in the "A" (default-face) slot is randomised once
  // per app open, then frozen for the session (until reload). This rotates the
  // partner styles onto the visible face over time so the "B" styles aren't
  // forgotten. The order is held in state so it survives re-renders but re-rolls
  // on every fresh open.
  const [STYLE_PAIRS] = useState(() =>
    BASE_STYLE_PAIRS.map(([a,b]) => (Math.random() < 0.5 ? [a,b] : [b,a]))
  );
  // ─── Tier-aware artist pairs (D2, Jun 2026) ───────────────────────────────
  // Free tier sees a FIXED set of 8 artists (the 'a' side of every BASE pair),
  // identical for every Free user — so the "unlock 8 more" sales pitch is
  // predictable and consistent. Paid tiers (Pro / Pro AI) get the session-
  // shuffled STYLE_PAIRS where face position rotates randomly per app open.
  // We also derive the locked set so the gate logic below knows which keys are
  // behind the paywall.
  const FREE_PAIRS = BASE_STYLE_PAIRS; // [a,b] kept in BASE order; only 'a' is reachable for free
  const FREE_UNLOCKED_KEYS = useMemo(
    () => new Set(BASE_STYLE_PAIRS.map(([a]) => a)),
    []
  );
  const effectivePairs = (proStatus === 'free') ? FREE_PAIRS : STYLE_PAIRS;
  // For Free: tapping a pair must NEVER select the b side. styleIsLocked tells
  // the gate to open the paywall instead of swapping styles.
  const styleIsLocked = useCallback((key) => {
    if (proStatus !== 'free') return false;
    return !FREE_UNLOCKED_KEYS.has(key);
  }, [proStatus, FREE_UNLOCKED_KEYS]);
  // Remembers, per pair, which member the user last selected. So when a pair's
  // button is not currently active (you picked a DIFFERENT artist), tapping it
  // returns to YOUR last choice from that pair — not always the default 'a'.
  // Key = "a|b"; value = the style key last chosen from that pair.
  const [pairLastPick, setPairLastPick] = useState({});
  // D2 refactor (Free tier only): which pair is currently showing its "locked
  // partner" info row beneath the artist palette. Holds the pair key "a|b" of
  // the most recently tapped pair, or null. Tapping the same pair again toggles
  // it off; tapping a different pair replaces it (only one info row at a time).
  const [expandedPair, setExpandedPair] = useState(null);
  const [anim,      setAnim]      = useState(false);
  const [grid,      setGrid]      = useState({N:DN,BW:DB,BH:DH,CW:DN*DB,CH:DN*DH});
  const [info,      setInfo]      = useState(null);
  const [viewMode,  setViewMode]  = useState('paint');
  const [immersive, setImmersive] = useState(false); // CSS fullscreen-ish painting view (works on iOS too); declared here (early) so the paint effect can read it without a TDZ crash
  const [stamp,     setStamp]     = useState(0);
  const [piano,     setPiano]     = useState('loading');
  const [songQ,     setSongQ]     = useState('');
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
  // paywall handles that case explicitly). Tracks whether WE set the current
  // banner via a ref so that flipping to Pro can clear it immediately, not
  // wait for the 6 s auto-dismiss (which leaves a "1 trial left" message
  // visible on the freshly-Pro setup screen — confusing).
  const trialBannerActiveRef = useRef(false);
  useEffect(()=>{
    if(isPro||trialExhausted) {
      if(trialBannerActiveRef.current){
        setErr(''); setErrInfo(false);
        trialBannerActiveRef.current = false;
      }
      return;
    }
    const left=Math.ceil(trialLeft);
    if(left>2||left<=0) return;
    const msg = left===1
      ? (t('trialBanner1')||'Only 1 AI trial left · Get Pro AI for unlimited')
      : (t('trialBanner2')||'Only '+left+' AI trials left · Get Pro AI for unlimited');
    setErr(msg); setErrInfo(true);
    trialBannerActiveRef.current = true;
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
  // Non-image sources have no B/W tab in the colour picker — only image mode
  // exposes B/W. If the user lands on a non-image source while mode is still
  // 'bw' (left over from a previously loaded BW image), force back to harmony
  // so the canvas doesn't render grey with no visibly-active tab.
  //
  // KONTRA gets the same treatment, but conditionally: a colourful image AUTO-sets
  // kontra as its default reading. That auto-pick must NOT leak into Music/MFI/
  // Mood/Compose — those default to Harmony. So when we leave the image source with
  // kontra still active AND it was the image's auto-pick (not a manual choice),
  // fall back to harmony. A kontra the user picked by hand is preserved (the
  // auto-flag is cleared the moment they touch the palette tabs).
  useEffect(()=>{
    if(mode==='bw' && viewMode!=='image' && loadedSource!=='image'){
      setMode('harmony');
    }
    if(mode==='kontra' && kontraAutoRef.current && viewMode!=='image' && loadedSource!=='image'){
      // EXCEPTION: after a See music transfer the music chord array still
      // carries the palette in which the image was scanned. Kontra was
      // chosen as the auto-mode for the source image and remains the
      // palette in which the piece was born — don't force Harmony.
      if(_musicFromImageRef.current) return;
      kontraAutoRef.current=false;
      setMode('harmony');
    }
  },[viewMode, loadedSource, mode]);
  const [recording, setRecording] = useState(false);
  const [micPainting, setMicPainting] = useState(false);
  const [micListening, setMicListening] = useState(false);
  // Refs mirroring the mic state, so deferred callbacks (e.g. setTimeout inside
  // _startMicLite) read the LATEST value, not a stale closure snapshot.
  // Without these, a fast Mikro→Mikro tap captured micListening=true at the
  // time setTimeout was scheduled, and 60ms later startMicListening's
  // toggle-guard read that stale true and immediately stopped the mic.
  const micListeningRef = useRef(false);
  const micPaintingRef = useRef(false);
  useEffect(()=>{ micListeningRef.current = micListening; },[micListening]);
  useEffect(()=>{ micPaintingRef.current = micPainting; },[micPainting]);
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
  // Playback source for Mic/Music drafts: 'original' = play the recorded raw
  // audio blob; 'piano' = synthesised cover from painted chords. Default
  // 'original' when a blob is available — the cleanest sound the user could
  // get. Falls back to piano automatically if no blob.
  const [playSourceMic, setPlaySourceMic] = useState('original');
  const playSourceMicRef = useRef('original');
  useEffect(()=>{ playSourceMicRef.current = playSourceMic; },[playSourceMic]);
  // Reactive flag — true once listenBlobRef has a finalised recording. Refs
  // alone don't trigger re-renders, so the toggle UI needs this companion.
  const [hasMicBlob, setHasMicBlob] = useState(false);
  // Fullscreen palette cycle — tapping the blue chip in the FS control row
  // cycles through the active mode-set (image mode uses bw, non-image uses
  // phi instead, since the picker tabs match). Uses refs so setMode is the
  // only side effect and Strict Mode double-invoke is safe.
  const cycleColorFs = useCallback(()=>{
    // Mirror the canvas Color tabs exactly. In image mode the tab set depends
    // on how the app READ the picture: a colourful image exposes the 5 colour
    // palettes (no bw); a near-monochrome image exposes only bw + custom. Using
    // appModeRef (the app's auto-pick) keeps the fullscreen chip identical to
    // the canvas tabs — never offering bw on a colour image, or colours on a
    // grayscale one.
    const allCycle = viewModeRef.current==='image'
      ? (appModeRef.current!=='bw'
          ? ['harmony','spectral','phi','kontra','custom']
          : ['bw','custom'])
      : ['harmony','spectral','phi','kontra','custom'];
    // Filter to user-selected palettes (Setup picker). 'bw' is image-only and
    // always allowed (not in setupPalettes — it's not a user-toggleable mode).
    const cycle = allCycle.filter(m => m==='bw' || setupPalettes.includes(m));
    if(cycle.length===0){ return; }                  // user disabled all — guard against empty
    const cur = modeRef.current;
    const idx = cycle.indexOf(cur);
    const next = cycle[((idx<0?0:idx)+1) % cycle.length];
    setMode(next);
  },[setupPalettes]);
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
  // ── My Music archive state (shared Lite + Advanced) ──────────────────────
  // showMyMusicSaveModal: Save-flow modal (♡ tap on canvas when file audio is
  // loaded) that lets the user confirm/edit the name before writing to IDB.
  // myMusicSaveTargetSlot: pre-computed first-empty slot (1..5) shown to the
  // user so they know where it'll land. Null if archive is full.
  // myMusicSavedFlash: transient "Saved" flash after a successful save.
  // showMyMusicDrawer: the 5-slot drawer (Fáza 2 — read+delete+load UI).
  const [showMyMusicSaveModal, setShowMyMusicSaveModal] = useState(false);
  const [myMusicSaveName, setMyMusicSaveName] = useState('');
  const [myMusicSaveTargetSlot, setMyMusicSaveTargetSlot] = useState(null);
  const [myMusicSaving, setMyMusicSaving] = useState(false);
  const [myMusicSavedFlash, setMyMusicSavedFlash] = useState(false);
  const [showMyMusicDrawer, setShowMyMusicDrawer] = useState(false);
  const [myMusicSlots, setMyMusicSlots] = useState([]); // refreshed on drawer open + after save/delete
  // Refresh slot list whenever the drawer opens so it always shows current
  // state (a save while drawer was closed, another tab's write, etc.).
  useEffect(()=>{
    if(!showMyMusicDrawer) return;
    let cancelled = false;
    myMusicList().then(l => { if(!cancelled) setMyMusicSlots(l); });
    return ()=>{ cancelled = true; };
  }, [showMyMusicDrawer]);
  const [recBlob, setRecBlob] = useState(null);   // recording output blob (share row)
  const [recName, setRecName] = useState('');      // recording output name
  const [audioSideImage, setAudioSideImage] = useState(null); // optional original image to share alongside audio
  const [audioRowOpen, setAudioRowOpen] = useState(false); // explicitly show the audio share row (image mode: only after Audio pick, not after REC)
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
  const [playedOnce, setPlayedOnce] = useState(false); // image actually played (gates EXPORT like Print's disp)
  const playedOnceRef = useRef(false);
  useEffect(()=>{ playedOnceRef.current=playedOnce; },[playedOnce]);
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
  // BRUTE FIX (Jun 2026): force compose mode off whenever an AI operation is in
  // progress. Earlier, surgical setComposeMode(false) calls in each AI handler
  // did not reliably suppress the Compose source UI during the "composing…"
  // phase — the keyboard, the compose-only "Recently played" pill, and the
  // strip layout all kept rendering as if the user were still in Compose.
  // Adding this effect makes "working" the single source of truth: while any
  // AI task is running, composeMode is guaranteed false so the canvas reads
  // as a Mood-in-progress, not a Compose surface.
  useEffect(()=>{ if(working && composeMode) setComposeMode(false); },[working, composeMode]);
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
  // ─── Setup-picker safety: deselect anything the user removed ──────────────
  // If the active palette or artist gets disabled in Setup, recover gracefully
  // so the canvas doesn't render a hidden mode/artist. Lives here (not next
  // to the setupPalettes/setupArtists state) so the `style`/`setStyle` refs
  // are already in scope — putting it earlier hit a TDZ on first render.
  useEffect(()=>{
    if(mode==='bw') return;                       // bw is image-only, never in setupPalettes
    if(!setupPalettes.includes(mode)){
      const fb = setupPalettes.includes('harmony') ? 'harmony' : (setupPalettes[0] || 'harmony');
      setMode(fb);
    }
  }, [setupPalettes, mode]);
  useEffect(()=>{
    if(style && !setupArtists.includes(style)){
      setStyle(null);                             // disabled artist → release to Mosaic
    }
  }, [setupArtists, style]);
  // Ref for cockpitEdit so the fallback effect below can skip when the user
  // is configuring their set (edit mode). cockpitEdit itself is declared much
  // further down — using it directly here would TDZ. The actual ref value is
  // synced from cockpitEdit via a useEffect placed after the useState.
  const cockpitEditRef = useRef(false);
  useEffect(()=>{
    // When Mosaic family is OFF in Setup, the canvas must always have an
    // active artist — there's no Mosaic chip to fall back to. Auto-select
    // the first playable artist whenever style becomes null (initial mount,
    // user deselect, setup change). Dice mode picks via shuffleStyle, so we
    // skip when randomMode is on. Edit mode also skips (via ref) — toggling
    // chips in edit configures the future set, must not redraw the current
    // canvas (otherwise removing mosaicFamily would instantly pick a fallback
    // artist and the Mosaic deselect would look broken).
    if(randomMode) return;
    if(cockpitEditRef.current) return;
    if(style) return;
    if(setupArtists.includes('mosaicFamily')) return;
    let target = null;
    for(const k of setupArtists){
      if(k === 'mosaicFamily') continue;
      if(proStatus === 'free'){
        // Free tier: pick the 'a' side of the pair containing k — always
        // unlocked even if user ticked the locked 'b' side in Setup.
        const pair = BASE_STYLE_PAIRS.find(([a,b]) => a===k || b===k);
        if(pair){ target = pair[0]; break; }
      } else {
        target = k;
        break;
      }
    }
    if(target) setStyle(target);
  }, [setupArtists, style, randomMode, proStatus]);
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
  // $oneM$ — third tap on the Mosaic chip enters this mode: chord tiles fill
  // the canvas 100% (guillotine partition) with chaos shapes (circles, arcs,
  // triangles, stars, squiggles, rings, half-moons, diamonds, crosses, rects)
  // scattered on top via a Vogel spiral from the centre. Mutually exclusive
  // with notesMode; the chip cycles Mosaic → Notes → $oneM$ → Mosaic.
  const [oneMMode, setOneMMode] = useState(false);
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
    // Seed is derived ONLY from chord content — same song = same painting
    // for any given artist style. VARY changes tones → chord hash changes →
    // painting changes (legitimately, because the song itself is different).
    // SHUFFLE changes only the artist → chord hash stays → painting stays
    // identical for that song in the new artist's style.
    return (h >>> 0);
  }, [chords, structureSeedLock]);
  // ── SHUFFLE MODE ──────────────────────────────────────────────────────────
  // When NO artist is selected but Random is ON, the painting shuffles across
  // all artist styles: each variation (Play / Next / Vary → new seed) picks a
  // different artist from the pool below. Plain mosaic is intentionally NOT in
  // the pool — shuffle means "surprise me with an artist". The pick is derived
  // from the session seed so it stays deterministic (Random-off, history/Next
  // all behave normally) and re-rolls whenever the seed changes.
  const SHUFFLE_POOL_ALL = ['picasso','kusama','pollock','kandinsky','miro','bauhaus','mondrian','rothko','matisse','bulge','arcs','bloom','spiral','gold','pop','wave','mitchell','monet','hokusai'];
  // Free tier: shuffle dice (🎲) only lands on the 8 unlocked artists. Paid tiers
  // shuffle across all 16. Keeps the random feature usable for Free without ever
  // accidentally landing on a locked artist (which would just paint a Pro-only
  // style without a clear way to dismiss it).
  const SHUFFLE_POOL = (proStatus === 'free')
    ? SHUFFLE_POOL_ALL.filter(k => FREE_UNLOCKED_KEYS.has(k))
    : SHUFFLE_POOL_ALL;
  const shuffleStyle = useMemo(() => {
    if(style || !randomMode) return null;       // only active in mosaic + random
    const MOSAIC_FAMILY = ['mosaic','notes','oneM'];
    const familyOn = setupArtists.includes('mosaicFamily');
    // ── LOCK MODE ──
    // User tapped Mosaic chip with dice on. Pool is the 3 family stops in a
    // FIXED order (Mosaic → Notes → oneM → Mosaic), starting at Mosaic.
    // shuffleArtistIndex is reset to 0 when the lock is entered, so the first
    // render is Mosaic and Next advances sequentially. If user disabled the
    // mosaic family in Setup, lock mode is a no-op (returns null → falls back
    // to nothing, and the chip itself is hidden anyway).
    if(mosaicShuffleLock){
      if(!familyOn) return null;
      return MOSAIC_FAMILY[((shuffleArtistIndex|0) % 3 + 3) % 3];
    }
    // ── FULL SHUFFLE MODE ──
    // Pool = (selected artists) + (mosaic family, only if selected in Setup).
    // Pseudo-randomly reordered per song via Fisher-Yates seeded with
    // pollockSessionSeed → same song gives the same order every time
    // (deterministic), but Mosaic / Notes / oneM can land anywhere in the
    // sequence (not bunched at the end).
    const filteredArtists = SHUFFLE_POOL.filter(k => setupArtists.includes(k));
    const base = familyOn ? [...filteredArtists, ...MOSAIC_FAMILY] : filteredArtists;
    if(base.length === 0) return null;          // user disabled everything — guard
    let s = ((pollockSessionSeed >>> 0) ^ 0x9E3779B1) >>> 0;
    if(s === 0) s = 1;
    const _rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const pool = base.slice();
    for(let i = pool.length - 1; i > 0; i--){
      const j = Math.floor(_rnd() * (i + 1));
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    let h = (pollockSessionSeed>>>0);
    h ^= h>>>15; h = Math.imul(h, 0x2c1b3c6d>>>0); h ^= h>>>12;
    const basePick = (h>>>0) % pool.length;
    return pool[(basePick + shuffleArtistIndex) % pool.length];
  }, [style, randomMode, pollockSessionSeed, SHUFFLE_POOL, shuffleArtistIndex, mosaicShuffleLock, setupArtists]);
  // The style actually rendered: the user's pick, or the shuffle draw, or none.
  // shuffleStyle==='mosaic' is the plain-mosaic stop in the shuffle pool — it
  // maps to effectiveStyle=null so the default Mosaic renderer takes over.
  // Notes mode wins in plain Mosaic (no artist, no shuffle) for ANY source —
  // it only needs note MIDI + the colour fn, which every source provides.
  const effectiveStyle = style || (shuffleStyle==='mosaic' ? null : shuffleStyle) || (oneMMode ? 'oneM' : notesMode ? 'notes' : null);
  // DETERMINISTIC PAINT PHASE — the variant index that goes INTO drawing.
  // A painting's "address" is (song, artist, style). Same address → same
  // painting, ALWAYS. The dice only chooses WHICH address to jump to next; it
  // must never change how a given address looks.
  //  • Explicit artist (no shuffle): Next cycles that artist's styles via
  //    phaseIndex — honour it.
  //  • Shuffle (Dice on, no manual artist): the artist comes from
  //    shuffleArtistIndex (see shuffleStyle), the style/variant comes from
  //    shufVariant. Both are set by the dice roll on Next/Play, but here we
  //    only READ them — drawing is a pure function of (seed, artist, variant),
  //    so re-landing on the same address repaints identically.
  const paintPhase = (style ? phaseIndex : shufVariant) | 0;
  // Effective number of style-variants per artist for the current tier
  // (free users only see 2 of 6). The dice picks a variant in this range.
  const _effVariants = () => (proStatus==='free' ? 2 : ((style==='kandinsky') ? 8 : (style==='wave' ? 7 : (style==='matisse' ? 8 : (style==='rothko' ? 8 : 6)))));
  // Dice roll for Next/Play. The roll only CHOOSES the next address — the
  // painting at that address is still a pure function of (seed, artist,
  // variant), so re-landing on the same address looks identical.
  //  • shuffle (no manual artist): jump to a random artist AND a random style.
  //  • manual artist + dice: jump to a random style of that one artist.
  const _diceRoll = () => {
    const N = _effVariants();
    if(style){
      // ── SELECTED ARTIST ── bag = this artist's variants [0..N-1], no repeat.
      const key = 'sel|'+style+'|'+N+'|'+(pollockSessionSeed>>>0);
      if(diceBagKeyRef.current!==key || diceBagRef.current.length===0){
        diceBagKeyRef.current = key;
        const arr = Array.from({length:N},(_,i)=>i);
        for(let i=arr.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; const t=arr[i];arr[i]=arr[j];arr[j]=t; }
        // Avoid immediately repeating the currently-shown variant on refill.
        if(arr.length>1 && arr[0]===(phaseIndex|0)){ const t=arr[0];arr[0]=arr[1];arr[1]=t; }
        diceBagRef.current = arr;
      }
      const next = diceBagRef.current.shift();
      setPhaseIndex(()=> next|0);
    } else {
      // ── FULL SHUFFLE ── bag = every (artistIndex × variant) combination.
      // Pool size mirrors shuffleStyle: selected artists (+ mosaic family if on).
      const familyOn = setupArtists.includes('mosaicFamily');
      const filteredArtists = SHUFFLE_POOL.filter(k => setupArtists.includes(k));
      const poolLen = (filteredArtists.length + (familyOn?3:0)) || 1;
      const key = 'full|'+poolLen+'|'+N+'|'+(familyOn?1:0)+'|'+(pollockSessionSeed>>>0);
      if(diceBagKeyRef.current!==key || diceBagRef.current.length===0){
        diceBagKeyRef.current = key;
        const combos=[];
        for(let a=0;a<poolLen;a++) for(let v=0;v<N;v++) combos.push({a,v});
        for(let i=combos.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; const t=combos[i];combos[i]=combos[j];combos[j]=t; }
        diceBagRef.current = combos;
      }
      const next = diceBagRef.current.shift() || {a:0,v:0};
      // shuffleStyle reads ((basePick + shuffleArtistIndex) % poolLen). Set the
      // index so the artist lands exactly on combo.a (cancel basePick offset).
      setShuffleArtistIndex(next.a|0);
      setShufVariant(()=> next.v|0);
    }
  };
  // Keep the interval's reference to _diceRoll fresh (it's redefined each render).
  useEffect(()=>{ showDiceRef.current=_diceRoll; });
  // Tear down the Show timer.
  const _stopShow = useCallback(()=>{
    if(showTimerRef.current){ clearInterval(showTimerRef.current); showTimerRef.current=null; }
  },[]);
  // Toggle the auto-shuffle slideshow. ON → roll immediately, then every
  // SHOW_INTERVAL_MS. OFF → clear the timer. Next is disabled while ON.
  const toggleShow = useCallback(()=>{
    setShowMode(prev=>{
      const next=!prev;
      _stopShow();
      if(next){
        try{ nextRollInProgressRef.current=true; showDiceRef.current && showDiceRef.current(); }catch(_){}
        showTimerRef.current=setInterval(()=>{
          try{ nextRollInProgressRef.current=true; showDiceRef.current && showDiceRef.current(); }catch(_){}
        }, SHOW_INTERVAL_MS);
      }
      return next;
    });
  },[_stopShow]);
  // Show only runs while playing — when the music stops (end, Stop, or the dice
  // is turned off), turn Show off and the Save chip returns in its place.
  useEffect(()=>{
    if(showMode && (!playing || !randomMode)){ _stopShow(); setShowMode(false); }
  },[playing, randomMode, showMode, _stopShow]);
  useEffect(()=>()=>{ if(showTimerRef.current) clearInterval(showTimerRef.current); },[]);
  // Pick a fresh random phaseIndex whenever the song OR the active artist
  // changes — that triggers a new "style" for that (song, artist) pair on the
  // first Play. Stays stable across repeated Plays of the same (song, artist).
  // VARY keeps phaseIndex (Vary changes tones, but the artist's style should
  // persist). Next button increments phaseIndex to cycle styles manually.
  const prevSongArtistRef = useRef({seed:0, art:null});
  const varyInProgressRef = useRef(false);
  // nextRollInProgressRef: set true by Next/Play when they already explicitly
  // rolled phaseIndex themselves. Stops useEffect from double-rolling and
  // causing a flicker (paint shows random_A then immediately swaps to random_B).
  const nextRollInProgressRef = useRef(false);
  useEffect(()=>{
    const seed = pollockSessionSeed>>>0;
    const art = effectiveStyle || '';
    const prev = prevSongArtistRef.current;
    if(prev.seed !== seed || prev.art !== art){
      prevSongArtistRef.current = {seed, art};
      // Vary just changed the tones — same song, same artist, only tonality.
      // Don't re-randomize the style; consume the flag and skip.
      if(varyInProgressRef.current){
        varyInProgressRef.current = false;
        return;
      }
      // Next/Play already set the new phaseIndex itself — consume the flag
      // and don't re-roll (would cause a visible flicker between two styles).
      if(nextRollInProgressRef.current){
        nextRollInProgressRef.current = false;
        return;
      }
      // Skip the initial mount when there are no chords yet — avoids a stray
      // randomization before the user has loaded any song.
      // Re-randomize ONLY when Dice (randomMode) is on. With Dice off the
      // user has picked a specific variant (or the deterministic default) and
      // expects ONE painting for the whole song — Mic capture in particular
      // would otherwise flicker through variants on every recorded chord.
      // Use the same dice helper as Next/Play so shuffle picks via shufVariant
      // (the painted variant index) rather than a raw phaseIndex that the
      // shuffle path no longer reads.
      if((seed !== 0 || art) && randomMode){
        _diceRoll();
      }
    }
  }, [pollockSessionSeed, effectiveStyle, randomMode]);
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
        else {
          setNotesMode(false); setOneMMode(false); setMosaicShuffleLock(false); // choosing an artist exits Notes/$oneM$ mode + clears shuffle lock
          // Compose/Mic mode + dice off: re-establish the seed lock when an
          // artist is re-selected. The lock may have been cleared by a prior
          // deselect (e.g. user toggled Pollock → Mosaic, which clears it).
          // Without re-locking, pollockSessionSeed tracks the live chord hash
          // — which grows with every new note in Compose/Mic — and the
          // painting flickers through variants on every keystroke.
          if(!randomModeRef.current && (composeMode||micPainting)){
            setStructureSeedLock(prevLock=> prevLock!=null ? prevLock : ((pollockSessionSeed>>>0)||1));
          }
        }
        return next;
      });
      if(canvasRef.current)canvasRef.current.style.opacity='1';
    },200);
  },[composeMode, micPainting, pollockSessionSeed]);

  // Set the style to a specific value (no toggle). Used by paired style buttons
  // that cycle A→B→A within a pair instead of toggling a single key on/off.
  const setStyleTo = useCallback((k)=>{
    if(canvasRef.current){canvasRef.current.style.opacity='0';}
    setTimeout(()=>{
      setStyle(()=>{
        if(k===null){ setStructureSeedLock(null); }
        else {
          setNotesMode(false); setOneMMode(false);
          // Compose/Mic + dice off: re-establish the seed lock when an artist
          // is re-selected through the paired-button cycle. Same rationale as
          // selectStyle — without this the painting flickers per note after a
          // prior Mosaic deselect cleared the lock.
          if(!randomModeRef.current && (composeMode||micPainting)){
            setStructureSeedLock(prevLock=> prevLock!=null ? prevLock : ((pollockSessionSeed>>>0)||1));
          }
        }
        return k;
      });
      if(canvasRef.current)canvasRef.current.style.opacity='1';
    },200);
  },[composeMode, micPainting, pollockSessionSeed]);
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
  const [showBook, setShowBook] = useState(false);
  const closeBook = useCallback(()=>setShowBook(false),[]);
  const [showSizePicker, setShowSizePicker] = useState(false);
  // Paint-mode Web/Print export toggle: when ON and a source image is on
  // hand (originalImgUrl for regular image, imgMoodThumb for MFI), overlay
  // a small thumbnail in the corner of the saved PNG so the viewer sees
  // what the chord painting was generated from. Resets to off when the
  // picker re-opens so the user explicitly opts in each time.
  const [includeSourceThumb, setIncludeSourceThumb] = useState(false);
  const includeSourceThumbRef = useRef(false);
  useEffect(()=>{ includeSourceThumbRef.current=includeSourceThumb; },[includeSourceThumb]);
  const pendingWithSourceRef = useRef(false);
  const keepSetupDuringRecRef = useRef(false);
  useEffect(()=>{ if(!showSizePicker) setIncludeSourceThumb(false); },[showSizePicker]);
  // Inline "guide" modal: searchable how-to entries covering every feature.
  const [showGuide, setShowGuide] = useState(false);
  // Reading-text size for the Concept & Guide panels (accessibility — larger
  // type for older readers). 1 = Normal, 1.25 = Large. Applied via CSS zoom on
  // the content wrapper so text AND spacing scale proportionally with one prop.
  const [readScale, setReadScale] = useState(1);
  // Jazyk-závislý zoom: čínske znaky majú vyššiu optickú hustotu detailov,
  // preto pre zh/zhTW pridávame 15% k readScale aby boli rovnako čitateľné ako latinka.
  const effScale = readScale * ((lang === 'zh' || lang === 'zhTW' || lang === 'ja') ? 1.15 : 1);
  // Sentence-case helper. Modern setup screen calls _sent(t('compose')) etc.
  // so existing CAPS i18n keys (COMPOSE, MUSIC, MIC) render as "Compose",
  // "Music", "Mic" without any i18n changes (keeps transport dock CAPS intact
  // since it uses t('compose') directly). Handles any language; idempotent
  // on already-lowercased strings (only capitalizes first character).
  const _sent = (s) => {
    if (!s || typeof s !== 'string') return s;
    const lower = s.toLocaleLowerCase(lang === 'sk' ? 'sk' : lang === 'zh' || lang === 'zhTW' ? 'zh' : 'en');
    return lower.charAt(0).toLocaleUpperCase(lang === 'sk' ? 'sk' : lang === 'zh' || lang === 'zhTW' ? 'zh' : 'en') + lower.slice(1);
  };
  // Strip leading icon glyphs/emoji from i18n strings before rendering as
  // picker/mood titles. Several translations have icons baked in (e.g.
  // musicInput: '♪ ADD MUSIC', selectMood: '✦ select a mood…',
  // imageInput: '🖼 IMAGE INPUT'). We can't change all 9 i18n languages,
  // so we strip them defensively here. Matches: ✦ ♪ ♬ ♫ 𝄞 🖼 🎙 and any
  // generic emoji at the start, plus the trailing ellipsis.
  const _stripIcon = (s) => {
    if (!s || typeof s !== 'string') return s;
    return s
      .replace(/^[✦♪♬♫𝄞🖼🎙♥◫✧✩✰🎵🎶🎨🎬🎤🖌📷📸🌈⭐▶▷►◉🎼📁📂📀💿🖨🖥⏺⏯⏵♫⏏↑⬆🗀]+\s*/u, '')
      .replace(/…\s*$/, '')
      .trim();
  };
  // Unified active/idle chip styling for the Color·Style strip (color modes,
  // scan direction, artist styles). Premium look: the ACTIVE chip is no longer a
  // heavy solid-gold fill with dark text — instead a soft gold-tinted fill, a
  // clear gold border and gold text. Lighter, more expensive-looking, and the
  // selected state still reads instantly. Idle chips stay on the dark card.
  const chipStyle = useCallback((on)=>({
    color: on ? 'rgba(220,180,90,.98)' : PF.cream,
    background: PF.card2,
    border: '1px solid '+(on ? 'rgba(201,168,76,.4)' : 'rgba(242,238,232,.08)'),
    boxShadow: 'none',
  }),[]);
  // (since v2.6.0) in active view, Color/Style live in a strip that's collapsed by
  // default (canvas gets the room) and expands on tap.
  const [stripOpen, setStripOpen] = useState(false);
  // ── BASIC vs ADVANCED app mode ────────────────────────────────────────────
  // basicMode = the simplified experience: a big live canvas painting the Liszt
  // sample, with just three CTAs (Surprise me · contextual Save/Pause · My
  // song). No setup tiles, no cockpit, no transport dock. A brand-new visitor
  // starts in Basic; the B/A chip in the topbar flips to the full Advanced app
  // (the original setup + cockpit, untouched). Persisted so the choice survives
  // reloads — applies to every user, new or returning.
  const [basicMode, setBasicMode] = useState(()=>{
    try{
      if(!localStorage.getItem('paintiano_onboarded')) return true; // first visit → Basic
      return localStorage.getItem('paintiano_basic_mode')!=='0';
    }catch(_){ return true; }
  });
  const basicModeRef = useRef(false);
  // Lite has two flavours, flipped by tapping the header subtitle:
  //   liteImageMode=false → "music → painting" (the original: auto-plays Liszt)
  //   liteImageMode=true  → "painting → music" (auto-loads the Van Gogh sample
  //                          image and paints/plays it; CTAs become Pause/Save/
  //                          Use my picture). Not persisted — Lite always opens
  //                          on the music flavour.
  const [liteImageMode, setLiteImageMode] = useState(false);
  const liteImageModeRef = useRef(false);
  const liteAwaitTapRef = useRef(false);
  // Set true right when a Lite flavour flip starts; lets the auto-start wait
  // longer (flip animation + audio-context settle) so the first note after a
  // flip doesn't crackle. Cleared once the post-flip playback has started.
  const liteFlipJustRef = useRef(false);
  // Guards against re-entrant saveAudio() calls (heavy Tone.Offline render).
  const savingRef = useRef(false);
  const [liteFlip, setLiteFlip] = useState(false); // header 3D flip animation
  // First-run nudge so users discover the two Lite flavours. Three soft cues:
  // a one-time peek-flip teaser, a pulsing ⇋ glyph, and a "tap to flip" hint —
  // all retire forever once the user flips (persisted in localStorage).
  const [liteFlipSeen, setLiteFlipSeen] = useState(()=>{ try{ return localStorage.getItem('paintiano_lite_flip_seen')==='1'; }catch(_){ return false; } });
  const [liteFlipTeaser, setLiteFlipTeaser] = useState(false);
  useEffect(()=>{ liteImageModeRef.current = liteImageMode; },[liteImageMode]);
  // One-time teaser: a couple of seconds after Lite opens, the subtitle gives a
  // small peek-flip to draw the eye to it. Only if the user hasn't flipped yet,
  // AND only after the user has played at least once — in the Play-chip state
  // the flip is disabled, so a teaser would point at a dead element.
  useEffect(()=>{
    if(!basicMode || liteFlipSeen || liteImageMode) return;
    if(!liteEverUnlockedRef.current && chords.length===0) return;
    const t1=setTimeout(()=>{ setLiteFlipTeaser(true); }, 2200);
    const t2=setTimeout(()=>{ setLiteFlipTeaser(false); }, 2200+620);
    return ()=>{ clearTimeout(t1); clearTimeout(t2); };
  },[basicMode,liteFlipSeen,liteImageMode,chords.length]);
  useEffect(()=>{
    basicModeRef.current = basicMode;
    try{ localStorage.setItem('paintiano_basic_mode', basicMode?'1':'0'); }catch(_){}
  },[basicMode]);
  // Pro / Pro AI users land in Advanced by default — they bought the controls.
  // Free (and first-time) visitors still start in Lite. We only auto-switch on
  // the first load of a visitor who hasn't been onboarded yet (paintiano_basic_mode
  // is written on mount, so we key off paintiano_onboarded which is only set once
  // the user has actually engaged). A Pro user who later picks Lite keeps it.
  // proStatus starts as 'loading' (the licence resolves async); this fires once.
  const proDefaultAppliedRef = useRef(false);
  useEffect(()=>{
    if(proDefaultAppliedRef.current) return;
    if(proStatus==='loading') return;            // licence not resolved yet
    proDefaultAppliedRef.current = true;
    let onboarded=false;
    try{ onboarded = localStorage.getItem('paintiano_onboarded')==='1'; }catch(_){}
    if(!onboarded && (proStatus==='pro' || proStatus==='pro_ai')){
      setBasicMode(false);                       // Pro → Advanced on first visit
    }
  },[proStatus]);
  // Inline "edit your set" mode for the Pick-a-look cockpit. When on, disabled
  // palettes/artists show as ghost chips you can tap to add to your set (and
  // enabled ones to remove) — live, without leaving the canvas. The heavy
  // Styles & palettes modal stays in the menu for full management.
  const [cockpitEdit, setCockpitEdit] = useState(false);
  // Keep cockpitEditRef (declared earlier, near the style-fallback effect) in
  // sync. The earlier effect needs to read cockpitEdit but is positioned
  // before this useState — the ref bridges them without TDZ. On exit (true→
  // false), if the set state requires a style fallback (no Mosaic and style
  // is null), apply it now since the earlier effect was skipped during edit.
  useEffect(()=>{
    cockpitEditRef.current = cockpitEdit;
    if(!cockpitEdit && !randomMode && style===null && !setupArtists.includes('mosaicFamily')){
      // Pick the first playable artist as fallback (same logic as the earlier effect).
      let target = null;
      for(const k of setupArtists){
        if(k === 'mosaicFamily') continue;
        if(proStatus === 'free'){
          const pair = BASE_STYLE_PAIRS.find(([a,b]) => a===k || b===k);
          if(pair){ target = pair[0]; break; }
        } else { target = k; break; }
      }
      if(target) setStyle(target);
    }
  }, [cockpitEdit]);
  // Edit mode is a transient tuning state — any real action exits it: pressing
  // Play, collapsing the Pick-a-look strip, loading New music / changing source,
  // or changing view (Back). The strip is always expanded on desktop/landscape
  // (stripOpen||isDesktop), so we close on the panel ACTUALLY collapsing, not on
  // raw !stripOpen — otherwise desktop would slam edit shut the instant it opens.
  // Works across mobile portrait, mobile/tablet landscape, tablet, and desktop.
  useEffect(()=>{ if(cockpitEdit && (playing || !(stripOpen || isDesktop))) setCockpitEdit(false); },[playing, stripOpen, isDesktop]);
  useEffect(()=>{ setCockpitEdit(false); },[loadedSource, viewMode]);
  // Orientation / breakpoint flip relayouts the whole cockpit — close edit so it
  // never sticks in a stale layout (tablet & desktop landscape↔portrait via is5Col,
  // phone portrait via isMobilePortrait).
  useEffect(()=>{ setCockpitEdit(false); },[is5Col, isMobilePortrait]);
  const [guideQuery, setGuideQuery] = useState('');
  // Stable composite-close callback for GuideModal (same memo rationale as
  // closeAbout). Closes the modal and clears the search query in one action.
  const closeGuide = useCallback(()=>{setShowGuide(false);setGuideQuery('');setGuideReturnCardId(null);},[]);
  // Setup can be opened from the top menu or from the Guide's "Open Setup" card.
  // Remember the origin so Setup's Done/✕ returns the user where they came from.
  const openSetupFromGuide = useCallback((cardId)=>{ setShowGuide(false); setGuideQuery(''); setSetupReturnTo('guide'); setGuideReturnCardId(cardId||null); setShowSetupModal(true); },[]);
  const closeSetup = useCallback(()=>{ setShowSetupModal(false); if(setupReturnTo==='guide'){ setShowGuide(true); } setSetupReturnTo(null); },[setupReturnTo]);
  // Shared set-toggles with last-item protection — the canvas must always have
  // at least one palette and one artist to paint with, so the final enabled
  // chip can't be turned off. Used by the inline cockpit edit mode and the
  // full Setup modal alike.
  const togglePalSafe = useCallback((k)=> setSetupPalettes(prev => prev.includes(k) ? (prev.length>1 ? prev.filter(x=>x!==k) : prev) : [...prev, k]),[]);
  const toggleArtSafe = useCallback((k)=> setSetupArtists(prev => prev.includes(k) ? (prev.length>1 ? prev.filter(x=>x!==k) : prev) : [...prev, k]),[]);
  const toggleToneSafe = useCallback((k)=> setSetupTones(prev => prev.includes(k) ? (prev.length>1 ? prev.filter(x=>x!==k) : prev) : [...prev, k]),[]);
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
  // True only while restoreMode (multi-draft) is committing a stashed Mood back
  // onto the canvas. Lets the currentMood effect below skip its morphTargets
  // wipe so a restored morph chain survives the restore.
  const restoringRef = useRef(false);
  useEffect(()=>{ if(currentMood) setStripOpen(true); if(!restoringRef.current) setMorphTargets([]); },[currentMood]);
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
  // When VARY restarts playback it wants the Color·Style strip to STAY open. But
  // startPlay (async) closes the strip on a fresh (non-resume) start, and that
  // close lands AFTER VARY's setStripOpen(true) because startPlay awaits unlock.
  // This ref lets VARY tell startPlay "don't close the strip this once".
  const keepStripOpenRef = useRef(false);
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
  // Data-URL of the lazily-fetched built-in MFI sample image, remembered so
  // _mfiCustomActive can distinguish the sample from a user-picked image.
  const mfiSampleUrlRef = useRef(null);
  // Image reading direction: 'lr' (default), 'vert', 'spiralIn', 'spiralOut'.
  // Mirrored to a ref so transcription loops read the current value live.
  const [imgDir, setImgDir] = useState('lr');
  const imgDirRef = useRef('lr');
  useEffect(()=>{ imgDirRef.current=imgDir; },[imgDir]);
  // Image playback mode: 'scan' = read the picture left→right as a score (paints
  // a mosaic/style); 'compose' = AI writes a free-standing piece from the image
  // material (Pro; canvas stays the original image). The transport Play/Pause/REC
  // all follow this selection. Resets to 'scan' on every new image load.
  const [imgPlayMode, setImgPlayMode] = useState('scan');
  const imgPlayModeRef = useRef('scan');
  useEffect(()=>{ imgPlayModeRef.current=imgPlayMode; },[imgPlayMode]);
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
  // True while an image-Composition piece is playing: the canvas must stay blank
  // (the original <img> shows through) — NOT painted with the active artist style.
  const imgComposeRef = useRef(false);
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

  // iOS 17+: pin the audio session category to 'playback' on app mount.
  // This makes audio output IGNORE the hardware silent switch (side mute
  // toggle on iPhone). Without this, if the user had used MediaRecorder
  // earlier (which switches the category to 'play-and-record' that DOES
  // respect the silent switch) and refreshes/reopens with silent switch on,
  // they hear nothing even though the in-app speaker shows 🔊 unmuted.
  // Setting this on every mount keeps the category sticky to 'playback'.
  useEffect(()=>{
    try{
      if(typeof navigator!=='undefined' && navigator.audioSession){
        navigator.audioSession.type = 'playback';
      }
    }catch(_){}
  },[]);

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
    // Tone routing:
    //   Pure   → pure palette variant (no modulation)
    //   Pastel → pastel palette variant (uniform, no modulation)
    //   Real   → CONTINUOUS Pure↔Pastel mix per chord energy:
    //     t = 0.15 + 0.75 * _curE      (range 0.15..0.90)
    //     out = pastel*(1-t) + pure*t  (linear RGB interp)
    //
    //   At e=0 (piano) the colour is 85% pastel + 15% pure → soft but the
    //   hue identity stays readable (pure C bumps red into the lavender
    //   blur). At e=1 (forte) it's 90% pure + 10% pastel → vivid but never
    //   crushing. At mezzo it's a 50/50 mix — visibly its own thing,
    //   neither Pure nor Pastel. This is the defining character of Real:
    //   it never reduces to either neighbour mode. Same hue across the
    //   entire range (pastel C and pure C both have hue 0°), so no mud
    //   from HSL rotation in the middle.
    //
    //   Note: Dark variant is no longer used by Real — it stays in the
    //   code for possible future use but Real never routes to it.
    const isReal = (tone === 'real');
    const useBandPastel = (tone === 'pastel');
    let _c;
    if(mode==='custom'){
      _c = useBandPastel ? customColPastel(m,v,activePalette)
                         : customCol(m,v,activePalette);
    } else if(mode==='spectral'){
      _c = useBandPastel ? specColPastel(m,v) : specCol(m,v);
    } else if(mode==='phi'){
      _c = useBandPastel ? phiColPastel(m,v)  : phiCol(m,v);
    } else if(mode==='kontra'){
      _c = useBandPastel ? kontraColPastel(m,v) : kontraCol(m,v);
    } else {
      _c = useBandPastel ? harmColPastel(m,v) : harmCol(m,v);
    }
    // Real: mix the pure colour above with its pastel sibling, weighted by
    // the current chord energy. We compute the pastel variant on the fly so
    // both hues stay identical (no HSL rotation = no mud).
    if(isReal){
      let _p;
      if(mode==='custom')        _p = customColPastel(m,v,activePalette);
      else if(mode==='spectral') _p = specColPastel(m,v);
      else if(mode==='phi')      _p = phiColPastel(m,v);
      else if(mode==='kontra')   _p = kontraColPastel(m,v);
      else                       _p = harmColPastel(m,v);
      const e = (typeof _getCurE === 'function') ? _getCurE() : 0.5;
      const t = 0.15 + 0.75 * Math.max(0, Math.min(1, e));
      const mt = 1 - t;
      _c = [
        Math.round(_p[0]*mt + _c[0]*t),
        Math.round(_p[1]*mt + _c[1]*t),
        Math.round(_p[2]*mt + _c[2]*t),
        _c[3],
      ];
    }
    // Song-energy colour tilt (B1): shift the whole piece's saturation/lightness
    // by its overall energy so a heavy song reads deeper+more saturated and a
    // soft one lighter+airier. Hue is preserved (blue stays blue). Neutral at
    // 0.5 (no change), so pure modes / character-less pieces are untouched.
    // Gentle: ±~14% saturation, ±~10% lightness at the extremes.
    if(typeof _getSongEnergy === 'function'){
      const _se = _getSongEnergy();
      const _d = _se - 0.5;                 // -0.5..+0.5
      if(_d > 0.001 || _d < -0.001){
        const r=_c[0], g=_c[1], b=_c[2];
        const[hh,ss2,ll]=toHsl(r,g,b);
        const ss3 = Math.max(0, Math.min(100, ss2 * (1 + 0.28*_d)));   // louder → more saturated
        const ll2 = Math.max(0, Math.min(100, ll  * (1 - 0.20*_d)));   // louder → slightly darker
        const[r2,g2,b2]=fromHsl(hh, ss3, ll2);
        _c = [r2, g2, b2, _c[3]];
      }
    }
    return _c;
  },[mode,activePalette,tone]);

  // Colour for a pitch class (0..11) in a given mode — used by the read-only
  // colour previews under the Color tabs. B/W spreads the 12 classes across its
  // value ramp (a grey scale) using octave-spaced MIDI so the shades differ.
  const colorPreview = useCallback((md,pc)=>{
    if(md==='bw') return bwCol(36+pc*4, 100);     // 12 steps up the value ramp → grey scale
    if(md==='spectral') return specCol(60+pc, 100);
    if(md==='phi') return phiCol(60+pc, 100);
    if(md==='kontra') return kontraCol(60+pc, 100);
    return harmCol(60+pc, 100);
  },[]);

  const _songEnergyCacheRef = useRef({ src: null, e: 0.5 });
  useEffect(()=>{
    const cv=canvasRef.current;if(!cv)return;
    // B1: push the piece's overall energy to the draw module so gc() tilts the
    // palette's saturation/lightness by character. Cached by chords identity so
    // it costs one pass per piece, not per frame. Hue is never affected.
    try{
      if(typeof _setSongEnergy==='function'){
        if(_songEnergyCacheRef.current.src !== chords){
          const _sc = (chords && chords.length && typeof computeSongCharacter==='function') ? computeSongCharacter(chords) : null;
          _songEnergyCacheRef.current = { src: chords, e: _sc ? _sc.energy : 0.5 };
        }
        _setSongEnergy(_songEnergyCacheRef.current.e);
      }
    }catch(_){}
    const{N,BW,BH,CW,CH}=grid;
    // SUPERSAMPLING (immersive fullscreen, painted modes only). Renders the painting
    // at SS× internal resolution + pre-scales the context, exactly like the export
    // path, so fullscreen on a big/tablet screen is crisp instead of a stretched
    // ~900px buffer. SS=1 everywhere else → normal & mobile rendering byte-for-byte
    // unchanged. (immersive is declared early, near viewMode, so reading it here is
    // safe — reading it before its declaration was a TDZ crash = black screen.)
    const SS=(immersive && viewMode==='paint')?2:1;
    const _bw=Math.max(1,Math.round(CW*SS)), _bh=Math.max(1,Math.round(CH*SS));
    if(cv.width!==_bw) cv.width=_bw;
    if(cv.height!==_bh) cv.height=_bh;
    const ctx=cv.getContext('2d');
    ctx.setTransform(SS,0,0,SS,0,0);
    // The style actually rendered: the user's pick, or — in shuffle mode (no
    // artist + Random on) — the seed-derived shuffle draw. Shadowing `style`
    // here means every downstream render decision (overlay dispatch, cache key,
    // canAppend) transparently uses the rendered style.
    const style = effectiveStyle;
    // Image Composition playback: the canvas must stay fully transparent so the
    // original <img> (behind it) shows through. Without this guard, when pixelRef
    // is null (composition mode) the image branch below is skipped and execution
    // falls through to the artist-style paint renderer — which would draw the
    // composed notes in whatever style was last active (e.g. Kandinsky circles)
    // ON TOP of the artwork. Clear and bail.
    if(imgComposeRef.current){
      try{ const _ctx=cv.getContext('2d'); _ctx.clearRect(0,0,CW,CH); }catch(_){}
      return;
    }
    // Image mode: keep the canvas transparent so the original painting shows through
    // unobstructed. The 96×60 pixel mosaic that used to render here was useful as
    // a "what the algorithm sees" preview, but it obscured the artwork on a phone-sized
    // canvas. During playback we paint a subtle scanning highlight at the currently
    // playing cell so the user still gets visual feedback without losing the image.
    if(viewMode==='image'&&pixelRef.current){
      // Animation loop owns the canvas during play/animate — don't interfere
      if(playing||anim) return;
      // Paused (incl. returning from Setup while paused): the canvas may have
      // been blanked by the element remount, so REPAINT the played-so-far mosaic
      // 0..disp from pixel data to restore the held position's blocks. Detect
      // pause via holdPaused state, the synchronous holdPausedRef (set the
      // instant Pause is tapped, before the state flush), OR resumeFromRef being
      // set (the saved resume position — also set during the Resume race render,
      // which must keep the blocks too).
      // Keep the mosaic blocks on screen whenever there's a scanned trace to
      // show: while PAUSED (hold the position) AND after the scan has FINISHED
      // (blocks stay until the user taps Clear or re-scans by changing
      // direction/palette). The canvas may have been blanked by a Setup remount,
      // so repaint 0..disp from pixel data. Detect "has a trace" via pause flags
      // OR playedOnce with a non-zero disp. Only a truly blank state (disp 0 —
      // before the first Play, or right after Clear) falls through to the clear.
      const _hasTrace = holdPaused || holdPausedRef.current || resumeFromRef.current!=null || (playedOnce && disp>0);
      if(_hasTrace){
        try{
          const cv=canvasRef.current, ctx=cv&&cv.getContext('2d');
          const px=pixelRef.current;
          if(ctx && px && disp>0){
            const{nc,nr}=px, pdata=px.px;
            const{BW,BH,CW,CH}=grid;
            const colStep=px.colStep||1;
            const effCols=Math.ceil(nc/colStep);
            const CHORD_SIZE=4;
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
                  ctx.fillStyle=`rgba(${p.r},${p.g},${p.b},0.42)`;ctx.fillRect(col*BW-1,row*BH-1,BW+2,BH+2);
                  ctx.fillStyle=`rgb(${p.r},${p.g},${p.b})`;ctx.fillRect(col*BW+.5,row*BH+.5,BW-1,BH-1);
                }
              }
            }
          }
        }catch(_){}
        return;
      }
      // Truly idle: not playing, not paused, not mid-resume. The mosaic blocks
      // belong ONLY to the live scan (during playback) and the paused state.
      // Once playback ends, the user returns to a finished piece via "← Canvas",
      // or a palette change re-transcribes, the canvas must show the clean
      // original <img> with NO blocks over it. Clear and bail. (Previously this
      // repainted the played-so-far mosaic whenever playedOnce was true, which
      // made blocks reappear over the artwork after a palette change.)
      try{
        const cv2=canvasRef.current, ctx2=cv2&&cv2.getContext('2d');
        if(ctx2){ const{CW,CH}=grid; ctx2.clearRect(0,0,CW,CH); }
      }catch(_){}
      return;
    }
    // Defensive grid guard. The mosaic draws from grid.cells[idx]; the note
    // overlay (bubbles) draws independently from chords/disp. A source switch
    // (e.g. Image/Mood → Music) can momentarily leave a stale/default grid
    // (cells absent or shorter than chords) while playback already runs — the
    // result is a black canvas with only bubbles and no mosaic. If we have a
    // real (non-image) piece whose grid clearly doesn't match the chords,
    // recompute it from the current chords and bail; the effect re-runs with
    // the correct grid and the mosaic paints normally.
    if(!imgComposeRef.current && viewMode!=='image' && chords.length>0){
      const cells = grid.cells;
      if(!cells || cells.length < chords.length){
        try{
          const evs = chords.map((c,i)=>({...c, idx:i, durQ: c.durQ!=null ? c.durQ : snapDurQ(Math.max(...c.n.map(n=>n.durMs||250),250)/500)}));
          const fixed = computeGrid(evs, {liveMode: basicModeRef.current ? false : (draftOwnerRef.current!=='listen'), liteWide: basicModeRef.current, portraitGrow: basicModeRef.current && !liteImageModeRef.current});
          gridRef.current = fixed;
          setGrid(fixed);
        }catch(_){}
        return;
      }
    }
    // Per-painting seed for renderers needing a stable whole-painting choice.
    _setArtistSeed(pollockSessionSeed);
    // Variant cap (free tier: 2 of N per artist; paid: full N). Updated every
    // paint so a tier change while the app is open takes effect immediately.
    _setVariantCap(proStatus==='free' ? 2 : null);
    // See music carrying-tone paint: when a Music chord carries _domPc (set by
    // the post-load effect from the source image's per-cell dominant hue), build
    // a paint-side copy where every note's m is rewritten to (oct*12 + _domPc) —
    // same register, the cell's carrying colour. This makes the Music mosaic
    // hold the source painting's dominant tone (blue stays blue) instead of the
    // harmony-shuffled palette. The audio engine never reads _chordsPaint — it
    // plays the original, fully-harmonic chords, so musicality is unchanged.
    // Plain MIDI/audio sources carry no _domPc, so _chordsPaint stays === chords
    // and nothing changes for them.
    const _hasDomPc = chords && chords.length>0 && chords.some && chords.some(c=>c&&typeof c._domPc==='number');
    const _chordsPaint = _hasDomPc
      ? chords.map(c => (c && typeof c._domPc==='number' && c.n)
          ? { ...c, n: c.n.map(n => ({ ...n, m: Math.floor(n.m/12)*12 + c._domPc })) }
          : c)
      : chords;
    // Helper: draw a single chord at its grid cell. Pulled out for the
    // incremental-append fast path below.
    const drawOne = (chord) => {
      if(!chord) return; // stale disp can index past chords → undefined chord
      _setCurE(chord._E);
      const{idx}=chord;
      // Per-cell artists colour from the notes passed here. On the See music
      // path the carrying-tone notes live on _chordsPaint (chord-level _domPc
      // rewritten onto every note); pull those when present, else the chord's
      // own notes. Same index/length as chords.
      const _pc = (_chordsPaint && _chordsPaint!==chords) ? _chordsPaint[idx] : null;
      const notes = (_pc && _pc.n) ? _pc.n : chord.n;
      // Carrying-tone lightness: when this See-music chord knows the source
      // cell's mean lightness (_lum, 0..1), nudge the palette colour toward that
      // lightness so a pale cream cell paints pale, not full saturated orange.
      // We blend the gc() RGB toward white (lum>0.5) or black (lum<0.5) by how
      // far the cell's lightness sits from the palette colour's own lightness —
      // only a partial pull (max ~0.55) so the palette hue/identity survives.
      // Audio is untouched; this only rewrites the paint colour. Plain MIDI
      // chords have no _lum, so gcUse stays === gc and nothing changes there.
      let gcUse = gc;
      const _cellLum = (_pc && typeof _pc._lum==='number') ? _pc._lum
                     : (typeof chord._lum==='number' ? chord._lum : null);
      if(_cellLum!=null){
        gcUse = (m,v)=>{
          const c = gc(m,v); if(!c) return c;
          const r=c[0],g=c[1],b=c[2];
          const srcL=(0.299*r+0.587*g+0.114*b)/255;      // palette colour's lightness
          const d=_cellLum-srcL;                          // how much lighter/darker the cell is
          const pull=Math.max(-0.55, Math.min(0.55, d));  // partial, keep hue identity
          const tgt = pull>=0 ? 255 : 0;                  // toward white or black
          const k=Math.abs(pull);
          return [
            Math.round(r+(tgt-r)*k),
            Math.round(g+(tgt-g)*k),
            Math.round(b+(tgt-b)*k),
            c[3]
          ];
        };
      }
      const cell=grid.cells&&grid.cells[idx];
      if(cell){
        if(cell.segments) cell.segments.forEach(s=>drawBlock(ctx,s.x,s.y,notes,gcUse,s.w,s.h,style));
        else drawBlock(ctx,cell.x,cell.y,notes,gcUse,cell.w,cell.h,style);
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
      if(style!=='pollock'&&style!=='picasso'&&style!=='kusama'&&style!=='miro'&&style!=='kandinsky'&&style!=='rothko'&&style!=='matisse'&&style!=='mondrian'&&style!=='bauhaus'&&style!=='bulge'&&style!=='arcs'&&style!=='bloom'&&style!=='spiral'&&style!=='gold'&&style!=='pop'&&style!=='wave'&&style!=='mitchell'&&style!=='monet'&&style!=='hokusai'&&style!=='oneM'){
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
      style!=='pollock' && style!=='kandinsky' && style!=='picasso' && style!=='kusama' && style!=='miro' && style!=='rothko' && style!=='matisse' && style!=='mondrian' && style!=='bauhaus' && style!=='bulge' && style!=='arcs' && style!=='bloom' && style!=='spiral' && style!=='gold' && style!=='pop' && style!=='wave' && style!=='mitchell' && style!=='monet' && style!=='hokusai' && style!=='oneM'; // Overlay styles need full repaint — overlay shapes are canvas-wide, not per-cell
    if(canAppend && lim>prev.disp){
      _ensureEnergies(chords);
      for(let i=prev.disp;i<lim;i++) drawOne(chords[i]);
    }else{
      // Overlay styles repaint the whole canvas every frame. During active
      // playback that's too costly ~7×/sec on long tracks, so throttle it to
      // ~9fps. Always allow the paint when paused/stopped or on the final
      // frame so the finished painting is fully rendered.
      const isOverlayStyle = style==='pollock'||style==='kandinsky'||style==='picasso'||style==='kusama'||style==='miro'||style==='rothko'||style==='matisse'||style==='mondrian'||style==='bauhaus'||style==='bulge'||style==='arcs'||style==='bloom'||style==='spiral'||style==='gold'||style==='pop'||style==='wave'||style==='mitchell'||style==='monet'||style==='hokusai'||style==='oneM';
      const nowMs = (typeof performance!=='undefined'?performance.now():Date.now());
      // A change in the session seed means the user pressed Next/Vary (or the
      // seed otherwise re-rolled): the WHOLE painting must change now, not on the
      // next throttled tick. Detect it so we can bypass the playback throttle —
      // otherwise the new variation gets swallowed by the ~9fps skip and "Next"
      // appears to do nothing during playback.
      const seedChanged = prev.pollockSessionSeed !== pollockSessionSeed
        || prev.phaseIndex !== paintPhase
        || prev.shuffleArtistIndex !== shuffleArtistIndex;
      if(isOverlayStyle && playing && !seedChanged && lim<chords.length && (nowMs-lastOverlayPaintRef.current)<110){
        // Skip this overlay repaint — keep last frame on canvas. Record disp so
        // the next allowed repaint covers the gap.
        prev.disp = lim; prev.pending = pending;
        lastPaintRef.current={disp:lim,chords,grid,gc,style,viewMode,pending,info,anim,playing,stamp,mode,holdPaused,pollockSessionSeed,phaseIndex:paintPhase,shuffleArtistIndex};
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
        const subKey=`${CW}x${CH}|${style}|${mode}|${tone}|${stamp}|${pollockSessionSeed}`;
        let sctx=sub.ctx;
        if(sub.key!==subKey||sub.CW!==CW||sub.CH!==CH||sub.SS!==SS||!sub.canvas){
          if(!sub.canvas||sub.CW!==CW||sub.CH!==CH||sub.SS!==SS){
            const oc=(typeof OffscreenCanvas!=='undefined')
              ? new OffscreenCanvas(Math.max(1,Math.round(CW*SS)),Math.max(1,Math.round(CH*SS)))
              : Object.assign(document.createElement('canvas'),{width:Math.max(1,Math.round(CW*SS)),height:Math.max(1,Math.round(CH*SS))});
            sub.canvas=oc; sctx=oc.getContext('2d');
            sub.ctx=sctx; sub.CW=CW; sub.CH=CH; sub.SS=SS;
          }
          sctx.setTransform(SS,0,0,SS,0,0);
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
        const fullCanvasOverlay = style==='mondrian'||style==='bauhaus'||style==='rothko'||style==='matisse'||style==='kusama'||style==='bulge'||style==='arcs'||style==='bloom'||style==='spiral'||style==='gold'||style==='pop'||style==='wave'||style==='mitchell'||style==='monet'||style==='hokusai'||style==='oneM';
        _setArtistSeed(pollockSessionSeed);
        _setVariantCap(proStatus==='free' ? 2 : null);
        _ensureEnergies(chords);
        if(!fullCanvasOverlay){
          for(let i=sub.builtTo;i<lim;i++){
            const chord=chords[i];if(!chord)break; _setCurE(chord._E); // stale disp / lim past chords → bail, don't destructure undefined
            const{n:notes,idx}=chord;
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
        _setCurE(0.5);
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
        } else if(!fullCanvasOverlay) ctx.drawImage(sub.canvas,0,0,CW,CH);
        // Run the canvas-wide overlay on top (this is the only per-frame cost
        // that legitimately scales with lim).
        if(style==='pollock')   drawPollockOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='picasso')  drawPicassoOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='kusama')   drawKusamaOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, paintPhase);
        else if(style==='miro')     drawMiroOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='kandinsky')drawKandinskyOverlay(ctx, CW, CH, lim, pollockSessionSeed, mode, gc, paintPhase, _chordsPaint.length, _chordsPaint);
        else if(style==='rothko')   drawRothkoOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='matisse')  drawMatisseOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='mondrian') drawMondrianOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='bauhaus') drawBauhausOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='bulge') drawBulgeOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='arcs') drawArcsOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='bloom') drawBloomOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='spiral') drawSpiralOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='gold') drawGoldOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='pop') drawPopOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='wave') drawWaveOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='mitchell') drawMitchellOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='monet') drawMonetOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='hokusai') drawHokusaiOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
        else if(style==='oneM') drawOneMOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, 0);
        lastPaintRef.current={disp:lim,chords,grid,gc,style,viewMode,pending,info,anim,playing,stamp,mode,holdPaused,pollockSessionSeed};
        return;
      }
      ctx.fillStyle='#04040a';ctx.fillRect(0,0,CW,CH);
      ctx.strokeStyle='rgba(255,255,255,0.025)';ctx.lineWidth=.5;
      for(let i=0;i<=N;i++){ctx.beginPath();ctx.moveTo(i*BW,0);ctx.lineTo(i*BW,CH);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*BH);ctx.lineTo(CW,i*BH);ctx.stroke();}
      _ensureEnergies(chords);
      for(let i=0;i<lim;i++) drawOne(chords[i]);
      _setCurE(0.5);
      // Pollock global drip overlay — runs AFTER all cells have rendered.
      // Drips ignore cell boundaries and unify the painting under the splatter.
      if(style==='pollock' && lim>0){
        drawPollockOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='picasso' && lim>0){
        drawPicassoOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='kusama' && lim>0){
        drawKusamaOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, paintPhase);
      }
      if(style==='miro' && lim>0){
        drawMiroOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      // Kandinsky canvas-wide contour overlay — large outlined shapes in
      // varied colors layered over the per-cell Kandinsky composition.
      if(style==='kandinsky' && lim>0){
        drawKandinskyOverlay(ctx, CW, CH, lim, pollockSessionSeed, mode, gc, paintPhase, _chordsPaint.length, _chordsPaint);
      }
      if(style==='rothko' && lim>0){
        drawRothkoOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='matisse' && lim>0){
        drawMatisseOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='mondrian' && lim>0){
        drawMondrianOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='bauhaus' && lim>0){
        drawBauhausOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='bulge' && lim>0){
        drawBulgeOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='arcs' && lim>0){
        drawArcsOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='bloom' && lim>0){
        drawBloomOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='spiral' && lim>0){
        drawSpiralOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='gold' && lim>0){
        drawGoldOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='pop' && lim>0){
        drawPopOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='wave' && lim>0){
        drawWaveOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='mitchell' && lim>0){
        drawMitchellOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='monet' && lim>0){
        drawMonetOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='hokusai' && lim>0){
        drawHokusaiOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, paintPhase);
      }
      if(style==='oneM' && lim>0){
        drawOneMOverlay(ctx, CW, CH, _chordsPaint, lim, gc, pollockSessionSeed, mode, 0);
      }
      if(!info&&!playing&&style!=='pollock'&&style!=='picasso'&&style!=='kusama'&&style!=='miro'&&style!=='kandinsky'&&style!=='rothko'&&style!=='matisse'&&style!=='mondrian'&&style!=='bauhaus'&&style!=='bulge'&&style!=='arcs'&&style!=='bloom'&&style!=='spiral'&&style!=='gold'&&style!=='pop'&&style!=='wave'&&style!=='mitchell'&&style!=='monet'&&style!=='hokusai'){
        const pi=idxRef.current,cell=grid.cells&&grid.cells[pi%(grid.cells.length||1)];
        const cx=cell?cell.x:((pi%(N*N))%N)*BW,cy=cell?cell.y:Math.floor((pi%(N*N))/N)*BH,cw=cell?cell.w:BW,ch=cell?cell.h:BH;
        ctx.strokeStyle='rgba(201,168,76,0.25)';ctx.lineWidth=.8;
        ctx.strokeRect(cx+.5,cy+.5,cw-1,ch-1);
        if(pending.length>0) drawBlock(ctx,cx,cy,pending.map(m=>({m,v:65,durMs:0})),gc,cw,ch,style);
      }
    }
    lastPaintRef.current={disp:lim,chords,grid,gc,style,viewMode,pending,info,anim,playing,stamp,mode,holdPaused,pollockSessionSeed,phaseIndex:paintPhase,shuffleArtistIndex};
  },[chords,disp,pending,mode,grid,info,gc,viewMode,playing,stamp,anim,style,effectiveStyle,holdPaused,pollockSessionSeed,composeMode,paintPhase,shuffleArtistIndex,immersive]);

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
    // In Lite, both voice and music capture use the grow-canvas (portrait) shape
    // — never the landscape fixed frame — so the live mic painting matches the
    // rest of Lite's portrait canvas.
    const newGrid=computeGrid(evs,{liveMode: basicModeRef.current ? false : !isMusicListen, liteWide: basicModeRef.current, portraitGrow: basicModeRef.current && !liteImageModeRef.current});
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

  // Loaded-source grid follows orientation. A loaded piece's grid (score / midi
  // / audio / MFI mosaic) is computed once at the window width it was loaded at.
  // If the device rotates landscape↔portrait, computeGrid would pick a different
  // width — but nothing recomputed it, so the canvas kept a stale (narrow) frame
  // and pause/resume didn't fix it. Recompute the grid on resize for those
  // sources. Image scan (own CSS pin) and live compose / sing (own recompute)
  // are skipped — see _skip below.
  useEffect(()=>{
    if(typeof window==='undefined') return;
    let t=null;
    const _skip=()=>{
      // Skip image scan (its own CSS width pin handles sizing) and live
      // authoring compose / sing (their own chord-driven recompute, which uses
      // liveMode — recomputing here without it would give the wrong frame).
      const vm = viewModeRef.current;
      const isScan = vm==='image' && !moodFromImgRef.current;
      const isLiveAuthoring = draftOwnerRef.current && draftOwnerRef.current!=='listen';
      return isScan || isLiveAuthoring;
    };
    const onResize=()=>{
      if(_skip()) return;
      const evs=chordsRef.current;
      if(!evs || !evs.length) return;
      if(t) clearTimeout(t);
      t=setTimeout(()=>{
        if(_skip()) return;
        const ng=computeGrid(chordsRef.current);
        gridRef.current=ng;
        // Apply immediately — even during playback. The paint loop reads gridRef
        // (already updated above), so this only syncs the visual canvas size.
        // (Deferring left the frame narrow until the user hit pause; for Music
        // mode pause/resume didn't widen it at all.)
        setGrid(ng);
      },180);
    };
    window.addEventListener('resize',onResize);
    return ()=>{ if(t)clearTimeout(t); window.removeEventListener('resize',onResize); };
  },[]);
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

  const playNote = useCallback((midi,vel=88,durMs=500,tailScale=1)=>{
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
      // tailScale (<1) shortens this on purpose for fast REPEATED strikes — a
      // sustained-plane tremolo needs each re-attack to be a distinct attack, not
      // a 1.5 s bloom that smears every re-strike into one held cloud. The floor
      // and cap scale together so e.g. tailScale 0.12 → ~180 ms..360 ms tail.
      const _ts=Math.max(0.05,Math.min(1,tailScale));
      const tailS=Math.min(Math.max(dur*0.4,1.5*_ts),3.0*_ts);
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
  const startRecordRef = useRef(null);
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
      // IMAGE finish: the scan loop paints blocks straight onto the main canvas
      // during playback, and on the very last step the canvas gets cleared once
      // (the bare photo shows through). We want the finished mosaic to STAY until
      // Clear or a re-scan. The main paint effect doesn't reliably re-run on the
      // finish render, so repaint the full 0..disp mosaic here, directly, on the
      // next frame (after the finish clear has landed). Guarded to image mode with
      // an actual scanned trace; pure Music is untouched (different viewMode).
      if(viewModeRef.current==='image' && pixelRef.current && playedOnceRef.current){
        requestAnimationFrame(()=>{
          try{
            if(playingRef.current) return;           // a new Play already started
            const cv=canvasRef.current, ctx=cv&&cv.getContext('2d');
            const px=pixelRef.current, gr=gridRef.current, ch=chordsRef.current;
            const dsp=dispRef.current;
            if(!ctx||!px||!gr||!ch||!(dsp>0)) return;
            const{nc,nr}=px, pdata=px.px;
            const{BW,BH,CW,CH}=gr;
            const colStep=px.colStep||1;
            const effCols=Math.ceil(nc/colStep);
            const CHORD_SIZE=4;
            ctx.clearRect(0,0,CW,CH);
            for(let i=0;i<dsp && i<ch.length;i++){
              const _ev=ch[i]||{};
              const band=_ev.band!=null?_ev.band:Math.floor(i/effCols);
              const cg=_ev.cg!=null?_ev.cg:i%effCols;
              const colStart=cg*colStep;
              for(let sk=0;sk<colStep;sk++){
                const col=colStart+sk; if(col>=nc) break;
                for(let j=0;j<CHORD_SIZE;j++){
                  const row=band*CHORD_SIZE+j; if(row>=nr) break;
                  const p=pdata[row*nc+col];
                  if(!p) continue;
                  ctx.fillStyle=`rgba(${p.r},${p.g},${p.b},0.42)`;ctx.fillRect(col*BW-1,row*BH-1,BW+2,BH+2);
                  ctx.fillStyle=`rgb(${p.r},${p.g},${p.b})`;ctx.fillRect(col*BW+.5,row*BH+.5,BW-1,BH-1);
                }
              }
            }
          }catch(_){}
        });
      }
    }
  },[playing]);
  useEffect(()=>{ dispRef.current=disp; },[disp]);
  useEffect(()=>{ chordsRef.current=chords; },[chords]);
  // See music post-load: re-attach the per-event dominant carrying tone onto the
  // freshly parsed Music chords. The capture stashed one _domPc per baked event
  // (song order) before encodeMidi stripped it. The round-trip merges/re-quant-
  // izes chords (e.g. ~1216 -> ~674), but left-to-right song order is invariant,
  // so each Music chord i borrows the _domPc from the source event at the same
  // RELATIVE position. Chord-level (one tone per chord) is exactly the carrying
  // tone we want — the cell's dominant colour. Audio is untouched: this only
  // sets a paint field the renderer reads; the engine plays the chords as-is.
  useEffect(()=>{
    if(!_imageDomPcsRef.current) return;
    if(loadedSource!=='midi') return;
    if(!chords || chords.length===0) return;
    const src = _imageDomPcsRef.current;          // per-event _domPc, song order
    const cur = chordsRef.current;
    if(!cur || cur.length===0){ return; }
    const srcLen = src.length;
    if(srcLen===0){ _imageDomPcsRef.current=null; return; }
    for(let i=0;i<cur.length;i++){
      const srcIdx = Math.min(srcLen-1, Math.floor(i * srcLen / cur.length));
      const ent = src[srcIdx];
      if(ent && typeof ent.pc === 'number') cur[i]._domPc = ent.pc;
      if(ent && typeof ent.lum === 'number') cur[i]._lum = ent.lum;
    }
    // New array reference so the paint effect re-runs against the chords now
    // carrying _domPc; in-place mutation alone wouldn't re-render.
    setChords(prev => (prev && prev.length ? prev.slice() : prev));
    setStamp(s=>s+1);
    _imageDomPcsRef.current = null; // single-use
  },[chords, loadedSource]);
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
    enterContext(owner==='compose'?'compose':'mic');
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
    enterContext(owner==='compose'?'compose':'mic');
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
        const isOverlay = style==='pollock'||style==='picasso'||style==='kusama'||style==='miro'||style==='kandinsky'||style==='rothko'||style==='matisse'||style==='mondrian'||style==='bauhaus'||style==='bulge'||style==='arcs'||style==='bloom'||style==='spiral'||style==='gold'||style==='pop'||style==='wave'||style==='mitchell'||style==='monet'||style==='hokusai'||style==='oneM';
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

  const unlockAudio = useCallback(async ()=>{
    try{ Tone.start(); }catch(_){}
    // Shorten Tone's scheduler look-ahead from its default 100ms to 30ms.
    // Default 100ms means triggerAttackRelease(..., Tone.now(), ...) schedules
    // audio 100ms ahead of the real context clock, while canvas paints happen
    // synchronously on the same animation frame — yielding a perceptible
    // ~100ms audio-trails-canvas desync. 30ms is the sweet spot on iOS: tight
    // enough to feel synchronised, far enough above zero to avoid scheduler
    // underruns on slow devices. Idempotent — setter is cheap and safe to
    // re-apply on every unlock.
    try{ Tone.getContext().lookAhead = 0.03; }catch(_){}
    // iOS 17+ audio session API. After MediaRecorder runs, iOS WebKit
    // pushes the audio session into the 'play-and-record' category which
    // makes output respect the hardware silent switch — so even with
    // 'unmuted' state inside the app, the iPhone produces no sound if the
    // side mute switch is on. Pinning to 'playback' tells iOS to ignore
    // the silent switch and always route audio to the speaker. Safe no-op
    // on browsers that don't expose this API (older iOS, desktop).
    try{ if(typeof navigator!=='undefined' && navigator.audioSession){ navigator.audioSession.type = 'playback'; } }catch(_){}
    // Defensive: force Tone destination unmute to match the React mute
    // state. Without this, a stale Tone.Destination.mute=true (left over
    // from some path that set it but didn't restore) would silently
    // suppress all output even though the React UI thinks audio is on.
    try{ Tone.getDestination().mute = !!mutedRef.current; }catch(_){}
    try{
      const ac=Tone.getContext().rawContext;
      if(!ac) return;
      // Attach a one-time 'statechange' listener so we detect mid-session
      // audio steals: on iOS, opening a second Paintiano tab/PWA grabs the
      // global audio session and our AudioContext transitions to
      // 'interrupted' WITHOUT firing visibilitychange (the tab stays visible,
      // just silent). When that happens, any oscillators/buffers scheduled
      // mid-flight get frozen — releasing them via sampler.releaseAll() now
      // prevents the "monotone piano blast" that otherwise erupts when the
      // session is returned to us. Idempotent: attached only on first
      // unlockAudio call against a live context.
      if(!audioStateListenerRef.current){
        try{
          ac.addEventListener('statechange', ()=>{
            const s = ac.state;
            if(s==='interrupted' || s==='suspended'){
              try{ if(samplerOk.current && samplerRef.current) samplerRef.current.releaseAll(); }catch(_){}
              try{ if(audioElRef.current) audioElRef.current.pause(); }catch(_){}
              // The context went dead mid-session (iOS audio-session steal, etc).
              // Re-arm the Lite first-tap recovery AND flag a forced hard-recover
              // so the very next user tap rebuilds the audio device in-place,
              // instead of the user needing to reload the page.
              try{ basicTapUnlockedRef.current = false; }catch(_){}
              try{ audioWasHiddenRef.current = true; }catch(_){}
            }
          });
          audioStateListenerRef.current = true;
        }catch(_){}
      }
      if(ac.state==='running'){
        // Normally a running context just needs a 1-sample silent buffer to
        // nudge iOS's output active. BUT after returning from background the
        // context frequently reads 'running' while the audio device is dead —
        // a kick alone stays silent. If we know we were just hidden, attempt
        // the suspend()->resume() re-acquire cycle. We do NOT clear the flag
        // here: this path runs from visibilitychange/focus (NOT a user gesture),
        // where iOS usually ignores the re-acquire. The flag stays set so the
        // stronger wakeAudio re-acquire fires inside the real Resume/Play tap,
        // which is the gesture iOS actually honours.
        if(audioWasHiddenRef.current){
          try{
            await ac.suspend();
            await ac.resume();
          }catch(_){
            try{ await ac.resume(); }catch(__){}
          }
        }
        // Silent kick (also re-routes output to the speaker post-resume).
        try{
          const buf = ac.createBuffer(1, 1, 22050);
          const src = ac.createBufferSource();
          src.buffer = buf;
          src.connect(ac.destination);
          src.start(0);
          src.stop(ac.currentTime + 0.005);
        }catch(_){}
        return;
      }
      // Non-running: state is 'suspended' (we went to background) OR
      // 'interrupted' (iOS-only — another tab stole the audio session, most
      // commonly a second Paintiano instance). Both paths share the same
      // recovery: cancel any sampler events that got frozen mid-flight, then
      // resume the context. Resume on 'interrupted' isn't always honoured by
      // iOS without a fresh user gesture, but it's a no-op safe to attempt.
      try{if(samplerOk.current&&samplerRef.current)samplerRef.current.releaseAll();}catch(_){}
      try { ac.resume(); } catch(_){}
      // Poll briefly for the context to actually transition to 'running' before
      // returning. Without this, startPlay would schedule notes against a still-
      // suspended Tone.now() and the first chord could land silent. Hard cap at
      // 500ms so a misbehaving context never hangs Play.
      const start = Date.now();
      while(ac.state !== 'running' && Date.now() - start < 500){
        await new Promise(r=>setTimeout(r, 20));
      }
      // Reaching state==='running' is not enough on iOS: right after a resume /
      // re-acquire the context clock (ac.currentTime / Tone.now()) can stay
      // frozen for a few hundred ms while the device spins back up. The visual
      // scan loop runs on setTimeout (real wall-clock), but notes are scheduled
      // against Tone.now(); if the clock hasn't started ticking yet, the audio
      // lands in the future and trails the painting by seconds (the "shifted"
      // playback after Resume). Wait until the clock is observably advancing —
      // capped so a stuck context never hangs Play.
      if(ac.state==='running'){
        const t0 = ac.currentTime;
        const cs = Date.now();
        while(Date.now() - cs < 350){
          await new Promise(r=>setTimeout(r, 20));
          if(ac.currentTime > t0) break;   // clock is ticking → audio & scan will start together
        }
      }
      // After resume succeeded, fire the silent-kick buffer so iOS routes
      // audio to the speaker.
      if(ac.state==='running'){
        try{
          const buf = ac.createBuffer(1, 1, 22050);
          const src = ac.createBufferSource();
          src.buffer = buf;
          src.connect(ac.destination);
          src.start(0);
          src.stop(ac.currentTime + 0.005);
        }catch(_){}
      }
    }catch(_){}
  },[]);

  // iOS "running but silent after idle" recovery — the core of the lost-sound bug.
  //
  // Verified behaviour (WebKit + Tone.js + howler.js community, 2024-2026):
  //   • When the page is backgrounded / the device sleeps, iOS parks the
  //     AudioContext. Often it comes back as state==='running' yet produces NO
  //     output — the underlying audio device was torn down. A plain resume() is a
  //     no-op here (the context already thinks it's running), which is exactly why
  //     every resume-only attempt failed and only a full page reload helped.
  //   • The fix that DOES work without a reload is an explicit suspend()->resume()
  //     cycle: forcing the context back to 'suspended' and then resuming makes iOS
  //     re-acquire the audio device. (howler.js #1106/#928, PlayCanvas 2026.)
  //   • This MUST run inside a user gesture — iOS only honours the re-acquire then.
  //
  // Called synchronously from the Resume/Play tap. No-op-cheap on desktop and when
  // audio is healthy (the round-trip is a couple of ms and inaudible since we're
  // not sounding anything at tap time).
  const wakeAudioRef = useRef(0);
  const wakeAudio = useCallback(async ()=>{
    try{ Tone.start(); }catch(_){}
    try{ Tone.getContext().lookAhead = 0.03; }catch(_){}
    try{ if(typeof navigator!=='undefined' && navigator.audioSession){ navigator.audioSession.type = 'playback'; } }catch(_){}
    try{ Tone.getDestination().mute = !!mutedRef.current; }catch(_){}
    let ac=null;
    try{ ac = Tone.getContext().rawContext; }catch(_){}
    if(!ac) return;
    // Silent hard-recover when returning from background. A single suspend->
    // resume (the throttled path below) was not enough on iOS — the user had to
    // long-press the speaker (which works partly because its alert() blocks JS
    // and its dismissal is a SECOND gesture that lets iOS finish re-acquiring).
    // Here we replicate what actually fixes it, automatically and silently:
    //   1) releaseAll FIRST so frozen notes don't burst out as the "first tresk"
    //   2) a DOUBLE suspend->resume cycle (iOS often needs more than one to
    //      re-acquire a torn-down audio device)
    //   3) rebuild the sampler if it died while we were away
    const forcedHidden = audioWasHiddenRef.current;
    if(forcedHidden){
      audioWasHiddenRef.current = false;
      try{ if(samplerOk.current && samplerRef.current) samplerRef.current.releaseAll(); }catch(_){}
      try{
        await ac.suspend(); await ac.resume();
        await ac.suspend(); await ac.resume();   // second pass — iOS re-acquire
      }catch(_){
        try{ await ac.resume(); }catch(__){}
      }
      // Sampler rebuild if it was lost while backgrounded.
      try{
        if(!samplerOk.current){
          try{ samplerRef.current && samplerRef.current.dispose(); }catch(_){}
          const s2 = new Tone.Sampler({urls:S_URLS, baseUrl:S_BASE,
            onload:()=>{ samplerOk.current=true; setPiano('ready'); },
            onerror:()=>{ samplerOk.current=false; setPiano('error'); },
          }).toDestination();
          samplerRef.current = s2;
        }
      }catch(_){}
    } else {
      try{
        if(ac.state === 'suspended' || ac.state === 'interrupted'){
          try{ await ac.resume(); }catch(_){}
        } else if(ac.state === 'running'){
          const nowT=Date.now();
          if(nowT - wakeAudioRef.current > 400){
            wakeAudioRef.current=nowT;
            try{
              await ac.suspend();
              await ac.resume();
            }catch(_){
              try{ await ac.resume(); }catch(__){}
            }
          }
        }
      }catch(_){}
    }
    try{
      if(ac.state==='running'){
        const buf=ac.createBuffer(1,1,22050);
        const src=ac.createBufferSource();
        src.buffer=buf; src.connect(ac.destination); src.start(0); src.stop(ac.currentTime+0.005);
      }
    }catch(_){}
  },[]);

  // Hard audio recovery + diagnosis — bound to a LONG-PRESS on the speaker
  // button. For the rare case where sound dies and a page reload doesn't bring
  // it back (iOS audio session stuck after an interruption). Reports the live
  // state, force-resumes the context, and rebuilds the sampler if it's gone.
  const audioHardRecover = useCallback(async ()=>{
    let report = [];
    let ac=null;
    try{ ac = Tone.getContext().rawContext; }catch(_){}
    report.push('ctx: ' + (ac ? ac.state : 'none'));
    report.push('sampler: ' + (samplerOk.current ? 'ready' : (samplerRef.current ? 'building' : 'none')));
    report.push('muted: ' + (mutedRef.current ? 'yes' : 'no'));
    // Force-resume the context (covers suspended / interrupted).
    try{ await Tone.start(); }catch(_){}
    try{ if(ac && ac.state!=='running'){ await ac.resume(); } }catch(_){}
    // If sampler died or never loaded, rebuild it.
    try{
      if(!samplerOk.current){
        try{ samplerRef.current && samplerRef.current.dispose(); }catch(_){}
        const s2 = new Tone.Sampler({urls:S_URLS, baseUrl:S_BASE,
          onload:()=>{ samplerOk.current=true; setPiano('ready'); },
          onerror:()=>{ samplerOk.current=false; setPiano('error'); },
        }).toDestination();
        samplerRef.current = s2;
        report.push('→ rebuilding sampler');
      }
    }catch(e){ report.push('rebuild failed: '+(e&&e.message||e)); }
    // Unmute defensively and give a silent kick.
    try{ Tone.getDestination().mute = !!mutedRef.current; }catch(_){}
    try{ const ac2=Tone.getContext().rawContext; if(ac2 && ac2.state==='running'){ const b=ac2.createBuffer(1,1,22050); const s=ac2.createBufferSource(); s.buffer=b; s.connect(ac2.destination); s.start(0); s.stop(ac2.currentTime+0.005); } }catch(_){}
    try{ alert('Audio status\n' + report.join('\n') + '\n\nTried to recover. If still silent: fully close the browser app (swipe it away) and reopen.'); }catch(_){}
  },[]);
  const speakerHoldRef = useRef(null);
  // Audio-Score action that opened share sheet), give the AudioContext a kick
  // so playback works again. iOS Safari can suspend the context while a share
  // sheet is on screen, and Tone.Offline (used by saveAudio / Audio export) is
  // known to leave the live context in an inconsistent state on some
  // browsers. unlockAudio is cheap when the context is already 'running'.
  const prevShowSizePickerRef = useRef(false);
  const compInputRef = useRef(null);
  useEffect(()=>{
    if(prevShowSizePickerRef.current && !showSizePicker){
      // small delay so any in-flight share sheet / file picker finishes
      // dismissing before we resume; iOS audio is reliably unsuspendable
      // only after the modal stack is fully gone.
      setTimeout(()=>{ unlockAudio(); }, 300);
    }
    // On OPEN (false→true): pre-fill the name field with the piece's default
    // title when the user hasn't named it yet, and select the text so a single
    // tap + type replaces it (or one delete clears it). Keeps any name the user
    // already typed. The default mirrors the export fallback (info.title).
    if(!prevShowSizePickerRef.current && showSizePicker){
      const _def=(compositionName||recordingName||(info&&info.title)||'').trim();
      if(!compositionName.trim() && _def){ setCompositionName(_def); }
      // focus + select after the dialog has mounted
      setTimeout(()=>{ const el=compInputRef.current; if(el){ try{ el.focus(); el.select(); }catch(_){ } } }, 60);
    }
    prevShowSizePickerRef.current = showSizePicker;
  },[showSizePicker, unlockAudio, compositionName, recordingName, info]);

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
    try{if(originalSourceRef.current){originalSourceRef.current.stop();originalSourceRef.current.disconnect();originalSourceRef.current=null;}}catch(_){}
    if(originalRafRef.current){cancelAnimationFrame(originalRafRef.current);originalRafRef.current=null;}
    // Release any keys highlighted by the just-cancelled release timers.
    // Without this they linger gold even though no note is sounding.
    setActive(new Set());
    setPlaying(false);setAnim(false);
    setHoldPaused(false);holdPausedRef.current=false;resumeFromRef.current=null;
  },[]);

  // Pause playback when the tab goes to background. The audio context suspends
  // automatically, but timers keep firing — leaving the UI stuck in playing state.
  // Store the chord position so resume picks up from where it stopped.
  useEffect(()=>{
    const onHide=()=>{
      if(document.hidden){
        // Mark that we backgrounded — the next revive must force a full
        // suspend->resume re-acquire (iOS returns a running-but-dead device).
        audioWasHiddenRef.current = true;
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
        // Visibility returned. While we were hidden — OR while another tab
        // was foregrounded — the audio session may have been:
        //   (a) suspended by iOS (normal background behaviour), OR
        //   (b) stolen by another tab/PWA instance (most commonly a second
        //       Paintiano tab) which puts our AudioContext into 'interrupted'
        // Either way: oscillators/buffers that were sounding when the steal
        // happened can stick around and burst out as a monotone piano blast
        // the instant the context resumes. Kill them FIRST with releaseAll,
        // then run the full unlock cycle (statechange listener, audioSession
        // pin, ctx.resume, silent kick). Plain Tone.start() isn't enough on
        // iOS — it doesn't clear stuck oscillators and may no-op without a
        // user gesture, leaving the tab still silent until the next tap.
        try{if(samplerOk.current&&samplerRef.current)samplerRef.current.releaseAll();}catch(_){}
        try{if(audioElRef.current && !audioElRef.current.paused) audioElRef.current.pause();}catch(_){}
        unlockAudio();
        // STOLEN-SESSION re-acquire (two Paintiano tabs competing for the one
        // iOS audio session). When the OTHER tab held the session, this tab's
        // context is left 'interrupted' and a single resume() no-ops — which is
        // why a reload didn't help but navigating away+back did (navigation
        // forces iOS to release+reissue the session). Emulate that here: retry
        // suspend->resume a few times with growing delays until the device is
        // actually re-acquired, then rebuild the sampler if it died.
        try{
          const _ac = Tone.getContext().rawContext;
          if(_ac){
            let _tries = 0;
            const _reacquire = ()=>{
              _tries++;
              const st = _ac.state;
              if(st === 'running'){
                // Confirm the device truly produces sound: silent kick.
                try{ const b=_ac.createBuffer(1,1,22050); const s=_ac.createBufferSource(); s.buffer=b; s.connect(_ac.destination); s.start(0); s.stop(_ac.currentTime+0.004); }catch(_){}
                // Rebuild sampler if it was torn down while the session was gone.
                try{
                  if(!samplerOk.current){
                    try{ samplerRef.current && samplerRef.current.dispose(); }catch(_){}
                    const s2 = new Tone.Sampler({urls:S_URLS, baseUrl:S_BASE,
                      onload:()=>{ samplerOk.current=true; setPiano('ready'); },
                      onerror:()=>{ samplerOk.current=false; setPiano('error'); },
                    }).toDestination();
                    samplerRef.current = s2;
                  }
                }catch(_){}
                return;
              }
              if(_tries > 6) return; // give up — user can tap to retry
              // suspend->resume cycle nudges iOS to re-issue the session once
              // the other tab has yielded it.
              Promise.resolve()
                .then(()=>_ac.suspend()).catch(()=>{})
                .then(()=>_ac.resume()).catch(()=>{})
                .finally(()=>{ setTimeout(_reacquire, 120 * _tries); });
            };
            setTimeout(_reacquire, 80);
          }
        }catch(_){}
      }
    };
    document.addEventListener('visibilitychange',onHide);
    // pageshow fires on bfcache restores (iOS swipe-back from another page,
    // tab switcher restoration) where visibilitychange may NOT fire. Same
    // recovery path: kill anything stuck and re-unlock.
    const onPageShow = (e)=>{
      // persisted=true => restored from bfcache; persisted=false => normal
      // load. We want recovery on both, since persisted bfcache returns are
      // the exact case where Tone.context might still think it's running but
      // the underlying iOS session has been re-routed away.
      try{if(samplerOk.current&&samplerRef.current)samplerRef.current.releaseAll();}catch(_){}
      unlockAudio();
    };
    window.addEventListener('pageshow', onPageShow);
    // window focus is a third belt-and-braces signal: on iOS WKWebView
    // (Chrome / standalone PWAs), switching between two Paintiano tabs can
    // trigger focus/blur without a visibilitychange on the inactive tab.
    const onFocus = ()=>{
      try{if(samplerOk.current&&samplerRef.current)samplerRef.current.releaseAll();}catch(_){}
      unlockAudio();
    };
    window.addEventListener('focus', onFocus);
    return ()=>{
      document.removeEventListener('visibilitychange',onHide);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
    };
  },[unlockAudio]);

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
      const newGrid=computeGrid(evs,{liveMode: basicModeRef.current ? false : true, liteWide: basicModeRef.current, portraitGrow: basicModeRef.current && !liteImageModeRef.current});
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
      if(navMenuOpen){e.preventDefault();setNavMenuOpen(false);return;}
      if(showGuide){e.preventDefault();setShowGuide(false);setGuideQuery('');return;}
      if(showAbout){e.preventDefault();setShowAbout(false);return;}
      if(showBook){e.preventDefault();setShowBook(false);return;}
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
    pixelRef.current=null;imgComposeRef.current=false;setViewMode('paint');setOriginalImgUrl(null);setInfo(null);
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

  // ── Phase-1 multi-draft: MOOD source stash ─────────────────────────────────
  // Parallel to the compose/sing/listen draft stashes, but for the Mood SOURCE
  // mode (text mood → music → painting; moodContext && !moodFromImg). When the
  // user leaves Mood for ANOTHER source (loads music/MFI, enters compose/mic)
  // the live mood piece is snapshotted here, the gold Mood tile glows, and one
  // tap on it restores the piece. Image-mood (MFI) is a SEPARATE mode and is
  // NOT captured by this slot.
  const moodStashRef = useRef(null);
  const [hasMoodDraft, setHasMoodDraft] = useState(false);
  // Mirror of moodContext for use inside stable ([]) callbacks and at the
  // synchronous call sites (loaders/mic/compose) where the live setMoodContext
  // for the NEW mode hasn't committed yet — so the ref still reads the mood
  // that is being left, which is exactly what we want to stash.
  const moodContextRef = useRef(false);
  useEffect(()=>{ moodContextRef.current = moodContext; },[moodContext]);
  // Mirror of loadedSource so stashOutgoing can detect the live source mode
  // inside a stable ([]) callback / at synchronous call sites.
  const loadedSourceRef = useRef(null);
  useEffect(()=>{ loadedSourceRef.current = loadedSource; },[loadedSource]);
  // Music source stash (midi / audio / score) — parallel to the Mood stash.
  // Lights the Music tile when a draft exists; tapping it restoreMode()s.
  const musicStashRef = useRef(null);
  const [hasMusicDraft, setHasMusicDraft] = useState(false);
  // Image source stash (classic pixel-scan image). Lights the Image tile; tap
  // restoreMode()s. The AI image-compose sub-mode is NOT captured here.
  const imageStashRef = useRef(null);
  const [hasImageDraft, setHasImageDraft] = useState(false);
  // MFI (mood-from-image) source stash — moodFromImg pieces. Like the Mood
  // stash plus the image-display fields.
  const mfiStashRef = useRef(null);
  const [hasMfiDraft, setHasMfiDraft] = useState(false);
  // Live mirror of the Mood piece's metadata (everything not already on a ref).
  // Written on change; read by stashMode so the snapshot is built with [] deps
  // (no useCallback deps explosion, no stale closures).
  const moodMetaRef = useRef(null);
  useEffect(()=>{
    moodMetaRef.current = { info, viewMode, currentMood, composeSource, varySource, morphTargets, songQ, structureSeedLock, midiBlob, midiName, compositionName, audioName, scoreName, audioSideImage, audioRowOpen, originalImgUrl, mode, imgDir, setupNoSel, playedOnce, imgMoodThumb, mfiImgAspect, imgReturnUrl };
  },[info, viewMode, currentMood, composeSource, varySource, morphTargets, songQ, structureSeedLock, midiBlob, midiName, compositionName, audioName, scoreName, audioSideImage, audioRowOpen, originalImgUrl, mode, imgDir, setupNoSel, playedOnce, imgMoodThumb, mfiImgAspect, imgReturnUrl]);

  // stashMode: capture the current SOURCE-mode draft (Mood only for now).
  const stashMode = useCallback((mode)=>{
    if(mode==='mood'){
      // Only a real text-mood with content. MFI (moodFromImg) is its own mode,
      // so a stash call while already in MFI is a no-op (self-guard).
      if(!moodContextRef.current || moodFromImgRef.current) return;
      const cur = chordsRef.current;
      if(!cur || !cur.length) return;
      const meta = moodMetaRef.current || {};
      moodStashRef.current = {
        chords: cur.slice(),
        grid: gridRef.current,
        idxCounter: idxRef.current,
        sessionStart: sessionStart.current,
        disp: dispRef.current,
        info: meta.info||null, viewMode: meta.viewMode||'paint',
        currentMood: meta.currentMood||null, composeSource: meta.composeSource||null,
        varySource: meta.varySource||null, morphTargets: meta.morphTargets||[],
        songQ: meta.songQ||'', structureSeedLock: (meta.structureSeedLock==null?null:meta.structureSeedLock),
        midiBlob: meta.midiBlob||null, midiName: meta.midiName||'',
      };
      setHasMoodDraft(true);
    }
    if(mode==='music'){
      const ls = loadedSourceRef.current;
      if(ls!=='midi' && ls!=='audio' && ls!=='score') return;
      const cur = chordsRef.current;
      if(!cur || !cur.length) return;
      const meta = moodMetaRef.current || {};
      musicStashRef.current = {
        sub: ls,
        chords: cur.slice(),
        grid: gridRef.current,
        idxCounter: idxRef.current,
        sessionStart: sessionStart.current,
        disp: dispRef.current,
        info: meta.info||null, viewMode: meta.viewMode||'paint',
        compositionName: meta.compositionName||'',
        scoreName: meta.scoreName||'',
        // audio sub-type: hold the decoded buffer + blob so playback replays
        audioPCM: ls==='audio' ? audioPCMRef.current : null,
        audioBlob: ls==='audio' ? audioBlobRef.current : null,
        audioName: ls==='audio' ? (meta.audioName||'') : '',
        audioSideImage: ls==='audio' ? (meta.audioSideImage||null) : null,
        audioRowOpen: ls==='audio' ? !!meta.audioRowOpen : false,
      };
      setHasMusicDraft(true);
    }
    if(mode==='image'){
      // Classic pixel-scan AND AI-compose sub-modes (imgPlayMode 'scan'|'compose').
      // Restore only sets state — the AI re-runs solely on a later Play, which is
      // the user's own action, so capturing the compose sub-mode is safe.
      if(loadedSourceRef.current!=='image') return;
      // Only stash an image the user actually worked on (played the scan, or
      // composed). A freshly loaded or just-CLEARED image (playedOnce reset to
      // false) is not a draft — otherwise ← Back after Clear would resurrect it.
      if(!playedOnceRef.current && !imgComposeRef.current) return;
      // Scan needs pixelRef (for re-transcribe); AI-compose nulls it, so a
      // composed draft is valid without pixel data.
      if(!pixelRef.current && !imgComposeRef.current) return;
      const cur = chordsRef.current;
      if(!cur || !cur.length) return;
      const meta = moodMetaRef.current || {};
      imageStashRef.current = {
        chords: cur.slice(),
        grid: gridRef.current,
        idxCounter: idxRef.current,
        sessionStart: sessionStart.current,
        disp: dispRef.current,
        info: meta.info||null,
        compositionName: meta.compositionName||'',
        originalImgUrl: meta.originalImgUrl||null,
        pixel: pixelRef.current,               // {nc,nr,px,lastMode,lastSig,colStep}
        mode: meta.mode||'harmony',
        imgDir: imgDirRef.current||'lr',
        imgPlayMode: imgPlayModeRef.current||'scan',
        imgCompose: !!imgComposeRef.current,
        atmoOn: !!atmoOnRef.current,
        atmoMood: atmoMoodRef.current||null,
        appMode: appModeRef.current,
        kontraAuto: kontraAutoRef.current,
        setupNoSel: !!meta.setupNoSel,
        playedOnce: !!meta.playedOnce,
      };
      setHasImageDraft(true);
    }
    if(mode==='mfi'){
      if(!moodFromImgRef.current) return;
      const cur = chordsRef.current;
      if(!cur || !cur.length) return;
      const meta = moodMetaRef.current || {};
      mfiStashRef.current = {
        chords: cur.slice(),
        grid: gridRef.current,
        idxCounter: idxRef.current,
        sessionStart: sessionStart.current,
        disp: dispRef.current,
        info: meta.info||null, viewMode: meta.viewMode||'image',
        currentMood: meta.currentMood||null, composeSource: meta.composeSource||null,
        varySource: meta.varySource||null,
        midiBlob: meta.midiBlob||null, midiName: meta.midiName||'',
        originalImgUrl: meta.originalImgUrl||null, imgMoodThumb: meta.imgMoodThumb||null,
        mfiImgAspect: meta.mfiImgAspect||null, imgReturnUrl: meta.imgReturnUrl||null,
      };
      setHasMfiDraft(true);
    }
  },[]);

  // stashOutgoing: stash whatever SOURCE mode is currently live, unless it's the
  // same as the mode we're entering (so "+ NEW <same source>" replaces in place
  // rather than self-stashing). Called at every mode-transition chokepoint.
  const stashOutgoing = useCallback((target)=>{
    let cur=null;
    if(moodContextRef.current && !moodFromImgRef.current) cur='mood';
    else if(moodFromImgRef.current) cur='mfi';
    else if(loadedSourceRef.current==='image') cur='image';
    else if(loadedSourceRef.current==='midi'||loadedSourceRef.current==='audio'||loadedSourceRef.current==='score') cur='music';
    if(cur && cur!==target) stashMode(cur);
  },[]);

  // restoreMode: put a stashed SOURCE-mode draft back on the canvas. Returns
  // true if a draft existed and was restored. Mood does not touch pixelRef /
  // substrateRef and does not set loadedSource / moodFromImg, so the auto-close
  // picker effect (deps: …,loadedSource,moodFromImg) is not retriggered.
  const restoreMode = useCallback((mode)=>{
    // Restoring INTO `mode` means leaving whatever source is currently live →
    // stash it first (stashOutgoing self-skips if the live mode == `mode`, e.g.
    // a wiped same-mode canvas) so switching between drafts never loses one.
    stashOutgoing(mode);
    // A restore from a playing source can leave the play debounce primed and the
    // playing ref momentarily stale — both can swallow the FIRST Play tap after
    // restore (most visible in AI-compose, which has no canvas animation). Reset
    // them so the next genuine tap starts cleanly.
    lastStartPlayRef.current = 0;
    playingRef.current = false;
    if(mode==='mood'){
      const s = moodStashRef.current;
      if(!s || !s.chords || !s.chords.length) return false;
      restoringRef.current = true;
      stopAll();
      enterContext('mood');
      // canvas + refs
      setChords(s.chords); chordsRef.current = s.chords;
      if(s.grid){ setGrid(s.grid); gridRef.current = s.grid; }
      idxRef.current = s.idxCounter;
      sessionStart.current = s.sessionStart;
      // Restore the playback position EXACTLY as left: leaving while playing (or
      // a mid-piece pause) returns to that spot, partial painting shown, paused
      // so Play resumes from there. A fully-played piece restores full; a
      // never-started one restores blank — both as the user left them.
      {
        const _len = s.chords.length;
        const _pos = (typeof s.disp==='number') ? Math.max(0, Math.min(s.disp, _len)) : _len;
        setDisp(_pos); dispRef.current = _pos;
        if(_pos>0 && _pos<_len){
          setHoldPaused(true); holdPausedRef.current = true; resumeFromRef.current = _pos;
        } else {
          setHoldPaused(false); holdPausedRef.current = false; resumeFromRef.current = null;
        }
      }
      // Invalidate cached substrate / last-paint from the previous (possibly
      // different) source so the mood repaints cleanly at the restored disp.
      substrateRef.current={canvas:null,ctx:null,builtTo:0,key:'',CW:0,CH:0};
      lastPaintRef.current={disp:0,chords:null,grid:null,gc:null,style:null,viewMode:null,pending:null,info:null,anim:false,playing:false,stamp:0,mode:null,holdPaused:false};
      gridSigRef.current = '';
      composedModeRef.current = false;
      draftOwnerRef.current = null;
      pixelRef.current = null; imgComposeRef.current = false;
      // mood is not a file/image source
      setLoadedSource(null); setOriginalImgUrl(null); setImgMoodThumb(null);
      setViewMode(s.viewMode || 'paint');
      setInfo(s.info || null);
      setComposeSource(s.composeSource || null);
      setVarySource(s.varySource || null);
      setSongQ(s.songQ || '');
      setStructureSeedLock(s.structureSeedLock==null?null:s.structureSeedLock);
      setMidiBlob(s.midiBlob || null); setMidiName(s.midiName || '');
      setMoodFromImg(false);
      setMoodContext(true);
      setCurrentMood(s.currentMood || null);
      // Set morph LAST; the currentMood effect is guarded by restoringRef so it
      // won't wipe this on the post-commit pass.
      setMorphTargets(s.morphTargets || []);
      setStamp(prev=>prev+1);
      // Release the guard after the current commit + its passive effects.
      setTimeout(()=>{ restoringRef.current = false; }, 0);
      return true;
    }
    if(mode==='music'){
      const s = musicStashRef.current;
      if(!s || !s.chords || !s.chords.length) return false;
      restoringRef.current = true;
      stopAll();
      enterContext('music');
      setChords(s.chords); chordsRef.current = s.chords;
      if(s.grid){ setGrid(s.grid); gridRef.current = s.grid; }
      idxRef.current = s.idxCounter;
      sessionStart.current = s.sessionStart;
      // Restore the playback position exactly as left (same logic as mood).
      {
        const _len = s.chords.length;
        const _pos = (typeof s.disp==='number') ? Math.max(0, Math.min(s.disp, _len)) : _len;
        setDisp(_pos); dispRef.current = _pos;
        if(_pos>0 && _pos<_len){
          setHoldPaused(true); holdPausedRef.current = true; resumeFromRef.current = _pos;
        } else {
          setHoldPaused(false); holdPausedRef.current = false; resumeFromRef.current = null;
        }
      }
      substrateRef.current={canvas:null,ctx:null,builtTo:0,key:'',CW:0,CH:0};
      lastPaintRef.current={disp:0,chords:null,grid:null,gc:null,style:null,viewMode:null,pending:null,info:null,anim:false,playing:false,stamp:0,mode:null,holdPaused:false};
      gridSigRef.current = '';
      composedModeRef.current = false;
      draftOwnerRef.current = null;
      pixelRef.current = null; imgComposeRef.current = false;
      // music is not a mood / image source
      setMoodContext(false); setMoodFromImg(false); setCurrentMood(null); setVarySource(null);
      setOriginalImgUrl(null); setImgMoodThumb(null);
      setInfo(s.info || null);
      setCompositionName(s.compositionName || '');
      setMidiBlob(null); setMidiName('');
      const _sub = s.sub;
      if(_sub==='audio'){
        audioPCMRef.current = s.audioPCM || null;
        setAudioBlobAndRef(s.audioBlob || null);
        setAudioName(s.audioName || '');
        setAudioSideImage(s.audioSideImage || null);
        setAudioRowOpen(!!s.audioRowOpen);
        setViewMode('audio'); viewModeRef.current = 'audio';
      } else {
        // midi / score: synthesis playback from chords; clear audio state
        audioPCMRef.current = null; setAudioBlobAndRef(null); setAudioName('');
        setAudioSideImage(null); setAudioRowOpen(false);
        setViewMode(s.viewMode || 'paint'); viewModeRef.current = s.viewMode || 'paint';
        if(_sub==='score') setScoreName(s.scoreName || '');
      }
      setLoadedSource(_sub);
      setStamp(prev=>prev+1);
      setTimeout(()=>{ restoringRef.current = false; }, 0);
      return true;
    }
    if(mode==='image'){
      const s = imageStashRef.current;
      if(!s || !s.chords || !s.chords.length) return false;
      if(!s.pixel && !s.imgCompose) return false; // scan draft needs pixel; compose draft doesn't
      restoringRef.current = true;
      stopAll();
      enterContext('image');
      setChords(s.chords); chordsRef.current = s.chords;
      if(s.grid){ setGrid(s.grid); gridRef.current = s.grid; }
      idxRef.current = s.idxCounter;
      sessionStart.current = s.sessionStart;
      // position / pause (same as mood/music)
      {
        const _len = s.chords.length;
        const _pos = (typeof s.disp==='number') ? Math.max(0, Math.min(s.disp, _len)) : _len;
        setDisp(_pos); dispRef.current = _pos;
        if(_pos>0 && _pos<_len){
          setHoldPaused(true); holdPausedRef.current = true; resumeFromRef.current = _pos;
        } else {
          setHoldPaused(false); holdPausedRef.current = false; resumeFromRef.current = null;
        }
      }
      substrateRef.current={canvas:null,ctx:null,builtTo:0,key:'',CW:0,CH:0};
      lastPaintRef.current={disp:0,chords:null,grid:null,gc:null,style:null,viewMode:null,pending:null,info:null,anim:false,playing:false,stamp:0,mode:null,holdPaused:false};
      gridSigRef.current = '';
      composedModeRef.current = false;
      draftOwnerRef.current = null;
      // image is not mood / mfi / music
      setMoodContext(false); setMoodFromImg(false); setCurrentMood(null); setVarySource(null);
      setImgMoodThumb(null); setMidiBlob(null); setMidiName('');
      setAudioBlobAndRef(null); setAudioName(''); audioPCMRef.current=null;
      setInfo(s.info || null);
      setCompositionName(s.compositionName || '');
      // image-specific
      pixelRef.current = s.pixel;
      imgComposeRef.current = !!s.imgCompose;
      setImgPlayMode(s.imgPlayMode||'scan'); imgPlayModeRef.current=s.imgPlayMode||'scan';
      if(s.mode){ setMode(s.mode); }
      setImgDir(s.imgDir||'lr'); imgDirRef.current = s.imgDir||'lr';
      if(typeof s.appMode!=='undefined') appModeRef.current = s.appMode;
      if(typeof s.kontraAuto!=='undefined') kontraAutoRef.current = s.kontraAuto;
      setAtmoOn(!!s.atmoOn); atmoOnRef.current=!!s.atmoOn;
      setAtmoMood(s.atmoMood||null); atmoMoodRef.current=s.atmoMood||null;
      setSetupNoSel(!!s.setupNoSel);
      setPlayedOnce(!!s.playedOnce);
      setOriginalImgUrl(s.originalImgUrl||null);
      setViewMode('image'); viewModeRef.current='image';
      setLoadedSource('image');
      setStamp(prev=>prev+1);
      setTimeout(()=>{ restoringRef.current = false; }, 0);
      return true;
    }
    if(mode==='mfi'){
      const s = mfiStashRef.current;
      if(!s || !s.chords || !s.chords.length) return false;
      restoringRef.current = true;
      stopAll();
      enterContext('mfi');
      setChords(s.chords); chordsRef.current = s.chords;
      if(s.grid){ setGrid(s.grid); gridRef.current = s.grid; }
      idxRef.current = s.idxCounter;
      sessionStart.current = s.sessionStart;
      {
        const _len = s.chords.length;
        const _pos = (typeof s.disp==='number') ? Math.max(0, Math.min(s.disp, _len)) : _len;
        setDisp(_pos); dispRef.current = _pos;
        if(_pos>0 && _pos<_len){
          setHoldPaused(true); holdPausedRef.current = true; resumeFromRef.current = _pos;
        } else {
          setHoldPaused(false); holdPausedRef.current = false; resumeFromRef.current = null;
        }
      }
      substrateRef.current={canvas:null,ctx:null,builtTo:0,key:'',CW:0,CH:0};
      lastPaintRef.current={disp:0,chords:null,grid:null,gc:null,style:null,viewMode:null,pending:null,info:null,anim:false,playing:false,stamp:0,mode:null,holdPaused:false};
      gridSigRef.current = '';
      composedModeRef.current = false;
      draftOwnerRef.current = null;
      pixelRef.current = null; imgComposeRef.current = false;
      setLoadedSource(null);
      setInfo(s.info || null);
      setComposeSource(s.composeSource || null);
      setVarySource(s.varySource || null);
      setSongQ('');
      setMidiBlob(s.midiBlob || null); setMidiName(s.midiName || '');
      setOriginalImgUrl(s.originalImgUrl || null);
      setImgMoodThumb(s.imgMoodThumb || null);
      setMfiImgAspect(s.mfiImgAspect || null);
      setImgReturnUrl(s.imgReturnUrl || null);
      setViewMode(s.viewMode || 'image'); viewModeRef.current = s.viewMode || 'image';
      setMoodContext(true);
      setMoodFromImg(true);
      setCurrentMood(s.currentMood || null);
      setMorphTargets([]); // MFI has no morph chain
      setStamp(prev=>prev+1);
      setTimeout(()=>{ restoringRef.current = false; }, 0);
      return true;
    }
    return false;
  },[stopAll,stashOutgoing]);

  // clearModeStash: drop a source-mode draft (used by full clear).
  const clearModeStash = useCallback((mode)=>{
    if(mode==='mood'){ moodStashRef.current = null; setHasMoodDraft(false); }
    if(mode==='music'){ musicStashRef.current = null; setHasMusicDraft(false); }
    if(mode==='image'){ imageStashRef.current = null; setHasImageDraft(false); }
    if(mode==='mfi'){ mfiStashRef.current = null; setHasMfiDraft(false); }
  },[]);
  // Notes mode is a per-painting choice — reset it to plain colour Mosaic
  // whenever the source changes (new loaded file, new mood, image↔mood switch),
  // so each fresh source starts in the normal reading rather than inheriting
  // note-names from the previous one.
  useEffect(()=>{ setNotesMode(false); setOneMMode(false); },[loadedSource,currentMood,moodFromImg]);
  // micArmed is reset explicitly at every site that leaves the MIC context
  // (start mic, ← Setup, Clear branches, source-picker handlers). A blanket
  // reset effect made micArmed flicker on/off whenever an unrelated source
  // state ticked, even when nothing about the MIC context changed. Without
  // the effect, micArmed remains stable across re-renders.
  const [atmoOn,setAtmoOn]=useState(false);       // image atmosphere effect on/off
  const [atmoMood,setAtmoMood]=useState(null);    // {v,e,root,title} detected from the image
  // Mirror atmo into refs so the melody voice (scheduled from the stable startPlay
  // callback) can snap the sung line to the SAME mood scale the texture was
  // transformed into — otherwise turning ATM on retunes the texture but leaves the
  // melody in its original key, and the two clash.
  const atmoOnRef=useRef(false);   useEffect(()=>{atmoOnRef.current=atmoOn;},[atmoOn]);
  const atmoMoodRef=useRef(null);  useEffect(()=>{atmoMoodRef.current=atmoMood;},[atmoMood]);

  // ───────── enterContext: one switch for all mode transitions ─────────
  // Two draft systems coexist: the 4-mode multi-draft (mood / mfi / image /
  // music) and the creative-draft system (compose / sing / listen). Each used
  // to manage only its OWN family's latches, so crossing between them left the
  // other family's context bleeding through — a "+ NEW MOOD" header over a MIC
  // canvas, MORPH/VARY/LOOP lit over a Compose canvas, a stray MIC "Recently
  // played" on a Mood screen, etc. enterContext is called at the TOP of every
  // restore / reset path and neutralises every FOREIGN family's latches +
  // canvas-context, leaving only the family we're entering for the caller to
  // populate. `keep` ∈ 'mood' | 'mfi' | 'image' | 'music' | 'mic' | 'compose'.
  const enterContext = useCallback((keep)=>{
    const moodFam = (keep==='mood' || keep==='mfi');
    // Mood / MFI latches: MORPH(currentMood)+VARY(varySource) lit, "+ NEW MOOD",
    // compose-source badge, morph chain, free-text query, structure seed.
    if(!moodFam){
      setMoodContext(false); setCurrentMood(null); setVarySource(null);
      setComposeSource(null); composeSourceRef.current=null;
      setMorphTargets([]); setSongQ(''); setStructureSeedLock(null);
    }
    // MFI-only image trim (source thumb / aspect / return-url) + moodFromImg.
    if(keep!=='mfi'){ setMoodFromImg(false); setImgMoodThumb(null); setMfiImgAspect(null); setImgReturnUrl(null); }
    // Image latches: pixel-scan buffer, AI-compose sub-mode, atmosphere.
    if(keep!=='image'){
      pixelRef.current=null; imgComposeRef.current=false;
      setImgPlayMode('scan'); imgPlayModeRef.current='scan';
      setAtmoOn(false); atmoOnRef.current=false; setAtmoMood(null); atmoMoodRef.current=null;
    }
    if(keep!=='image' && keep!=='mfi'){ setOriginalImgUrl(null); }
    // File-source latch (image/music share loadedSource + sourceContext).
    if(keep!=='image' && keep!=='music'){ setLoadedSource(null); setSourceContext(null); }
    // MIC / Compose latches: on-canvas voice⇄music chip (micActive||micArmed),
    // Original⇄Piano toggle, MIC "Recently played" (micContext), composedMode.
    if(keep!=='mic'){ setMicArmed(false); setMicContext(false); }
    if(keep!=='compose'){ setComposeMode(false); }
    if(keep!=='mic' && keep!=='compose'){ composedModeRef.current=false; draftOwnerRef.current=null; }
    // LOOP is a transient playback toggle — always reset when changing context.
    setLoopMode(false); loopModeRef.current=false;
    // This burst of state changes can make React skip the canvas paint effect
    // (it's keyed on `stamp`), leaving stale imperative pixels — a BLACK canvas
    // on entry (esp. via restoreStash, which doesn't bump stamp itself). Force a
    // repaint so the restored / cleared canvas always renders.
    setStamp(s=>s+1);
  },[]);
  const [atmoBusy,setAtmoBusy]=useState(false);   // AI detection in progress
  // MELODY chip ("obraz spieva"): when ON, an AI-composed SINGING melodic line is
  // layered ON TOP of the scan texture (see _melodyVoice in 04-songs). It does NOT
  // replace the scan piece — the same image-as-music plays, now beautified with a
  // lead voice that mirrors the picture's mood/colour/radiance. One-shot: auto-OFF
  // after a playthrough. melodyData holds the AI line {notes,tempo,title} so the
  // rebuild pipeline can re-apply the layer without another AI call.
  const [melodyOn,setMelodyOn]=useState(false);
  const [melodyBusy,setMelodyBusy]=useState(false);
  const [melodyData,setMelodyData]=useState(null); // {notes,tempo,title} | null
  const melodyOnRef=useRef(false);  useEffect(()=>{melodyOnRef.current=melodyOn;},[melodyOn]);
  const melodyDataRef=useRef(null); useEffect(()=>{melodyDataRef.current=melodyData;},[melodyData]);
  // Set true by the MELODY chip when it flips melody on/off DURING playback, so the
  // mode-toggle effect knows to restart-from-position (to re-arm the parallel voice)
  // instead of doing a seamless live swap (which is right for colour changes).
  const _melodyTogglePlayingRef=useRef(false);
  // Bumped to instantly silence the parallel sung voice: every scheduled voice
  // note captures the current value and bails if it changed by the time it fires.
  // The chip handler bumps this the moment MELODY is switched OFF mid-playback, so
  // the line stops on the spot without waiting on the rebuild-effect restart.
  const melodyVoiceGenRef=useRef(0);
  // Melody cache keyed by image hash + atmo signature (same image + same mood →
  // replay the layered line free, no extra AI call). Parallels _imgComposeCache.
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
    pixelRef.current=null;imgComposeRef.current=false;setViewMode('paint');
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
    // ⚠ REGRESSION-PRONE — DO NOT REMOVE
    // Symptom when missing: after Clear, the Setup screen's Image tile still
    // shows the gold "active/draft" dot even though there is no content to
    // return to. Image content may stay on the canvas for that session —
    // that's separate — but the source-tile indicator must reset.
    // Test path: load Image → Clear → Back to Setup → the Image tile must NOT glow.
    imageStashRef.current = null; setHasImageDraft(false);
    setDisp(0);setErr('');setStamp(s=>s+1);
    setCompositionName('');setPaintScale('off');setRecordingName('');setRecBlob(null);setRecName('');setAudioSideImage(null);setAudioRowOpen(false);
    // After clear in a creative mode, mark the canvas as draft-owned by that
    // mode again so subsequent presses commit to the right stash.
    if(composeMode) { composedModeRef.current=true; draftOwnerRef.current='compose'; }
    else if(micPainting) { composedModeRef.current=true; draftOwnerRef.current='sing'; }
    else if(micListening) { composedModeRef.current=true; draftOwnerRef.current='listen'; }
    // Canvas is now empty — return the page to its default (top) position so the
    // header and controls are back in their resting place.
    requestAnimationFrame(()=>{try{window.scrollTo({top:0,behavior:'smooth'});}catch(_){}});
  },[stopAll,micPainting,micListening,composeMode]);

  // ── resetAll — full app reset without page reload ──────────────────────────
  // For users with several active modes stacked up (Music + Image + Compose
  // draft + mic draft, etc.) who don't want to Clear each one individually.
  // Behaves like a page reload from the user's perspective — every draft, every
  // stash, every loaded source is dropped — but no actual reload happens, so
  // the Advanced/Lite choice, language, and other prefs are preserved.
  const resetAll = useCallback(()=>{
    // Stop anything running first (playback, mic streams, recorders).
    try{ if(micPainting) stopMicPaintingRef.current?.(); }catch(_){}
    try{ if(micListening) stopMicListeningRef.current?.(); }catch(_){}
    try{ stopAll(); }catch(_){}
    // Drop every stash + draft indicator, unconditionally — regardless of what
    // the "current" mode is. This is the difference vs clear(): clear only
    // touches the draft owned by the active mode; resetAll wipes them all.
    composeStashRef.current = null; setHasComposeDraft(false);
    composeActiveRecallIdRef.current = null;
    singStashRef.current    = null;
    listenStashRef.current  = null;
    setHasMicDraft(false);
    micActiveRecallIdRef.current = null;
    micActiveRecallPresetRef.current = null;
    moodStashRef.current    = null; setHasMoodDraft(false);
    musicStashRef.current   = null; setHasMusicDraft(false);
    imageStashRef.current   = null; setHasImageDraft(false);
    mfiStashRef.current     = null; setHasMfiDraft(false);
    draftOwnerRef.current   = null;
    // Now run the standard content wipe (chords, loaded blob/url, canvas).
    try{ clear(); }catch(_){}
    // Force back to Setup screen even if the caller was mid-flow.
    setForceSetup(false);
    setPickMode(null);
    setComposeMode(false);
    composedModeRef.current = false;
    // stayActive is a sticky flag that latches true whenever the user enters
    // the canvas view. clear() doesn't touch it, so without this line resetAll
    // called from the Setup screen could still land the user in canvas view
    // (isActiveView reads stayActive OR chords.length, etc.). Reset drops the
    // latch so the view falls back to whatever the state deserves — which,
    // after everything above, is the empty Setup screen.
    setStayActive(false);
  },[clear,stopAll,micPainting,micListening]);

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
    // IMAGE source: Clear wipes only the SCAN TRACE (painted blocks + chord
    // array + playback position) and KEEPS the loaded picture, so the canvas
    // returns to the clean photo and the user can change direction/palette and
    // Play again from the top. The picture (pixel scan data, photo URL, backup)
    // is preserved; only the mosaic the scan painted is cleared. Because the
    // image canvas is transparent with the <img> beneath, clearing the canvas
    // reveals the photo again — and the stronger block outline (0.42) makes the
    // before/after difference obvious so Clear visibly did something.
    if(loadedSource==='image' && !composeMode && !micPainting && !micListening && !draftOwnerRef.current){
      stopAll();
      setImgPlayMode('scan'); imgPlayModeRef.current='scan';
      // KEEP: pixelRef, scanPixelBackupRef, originalImgUrl (the picture stays) AND
      // the chord array (the current scan). We only reset the PLAYBACK POSITION
      // and wipe the painted blocks from the canvas, so Play re-scans from the
      // top. Changing direction/palette afterwards re-transcribes as usual.
      idxRef.current=0; setDisp(0);
      setPending([]); pendingRef.current=[];
      // Invalidate cached substrate + last-paint so nothing re-blits the blocks.
      substrateRef.current={canvas:null,ctx:null,builtTo:0,key:'',CW:0,CH:0};
      lastPaintRef.current={disp:0,chords:null,grid:null,gc:null,style:null,viewMode:null,pending:null,info:null,anim:false,playing:false,stamp:0,mode:null,holdPaused:false};
      // Clear all three canvas layers — the transparent main canvas then shows
      // the photo (<img>) underneath, blocks gone.
      try{
        const cv=canvasRef.current; if(cv){ const cx=cv.getContext('2d'); cx&&cx.clearRect(0,0,cv.width,cv.height); }
        const vc=visualizerRef.current; if(vc){ const vx=vc.getContext('2d'); vx&&vx.clearRect(0,0,vc.width,vc.height); }
        const hc=highlightCanvasRef.current; if(hc){ const hx=hc.getContext('2d'); hx&&hx.clearRect(0,0,hc.width,hc.height); }
      }catch(_){}
      ripplesRef.current=[];
      setStamp(s=>s+1); setPlayedOnce(false);
      resumeFromRef.current=null; setHoldPaused(false);
      setClearArmed(false);
      // Drop any recording captured this session — without this the REC button
      // stays morphed into SAVE ("Uložiť") after Clear, leaving the dock in the
      // post-recording state instead of returning to the default REC dock.
      try{ setRecBlob(null); setRecName(''); setRecordIntent(null); setAudioRowOpen(false); setAudioSideImage(null); }catch(_){}
      // Clear also drops the See music bridge: the Music draft built from THIS
      // scan no longer corresponds to anything painted, so discard it and its
      // signature. Otherwise Back → Setup → Image chip restores the pre-Clear
      // Image draft (playedOnce=true, full disp) and SEE MUSIC lights up again as
      // if the scan were still finished. Refresh the image stash to the CLEARED
      // state so returning to Image shows the bare photo with SEE MUSIC off.
      musicStashRef.current=null; setHasMusicDraft(false);
      _seeMusicSrcSigRef.current=null;
      _musicFromImageRef.current=false;
      // Clear = no draft. Drop the image stash entirely so the Image chip in
      // Setup goes off — the user starts fresh. The picture / pixel / chords
      // still live in the current app state (canvas keeps the photo), but
      // there's no STASHED draft for ← Back → chip to resurrect.
      dispRef.current=0; playedOnceRef.current=false;
      if(moodMetaRef.current) moodMetaRef.current.playedOnce=false;
      imageStashRef.current=null; setHasImageDraft(false);
      // loadedSource stays 'image' → image view persists with the photo on canvas,
      // direction/palette controls live, Play ready to re-scan from the top.
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
      setRndSalt(0); setStructureSeedLock(null); setShuffleArtistIndex(0); setPhaseIndex(0);
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
      // This IS the MFI branch (moodFromImg && moodContext). Clear inside MFI
      // means the painting is gone → drop the MFI multi-draft stash + tile glow.
      // (The image-SCAN branch above — loadedSource==='image' — is separate and
      // drops imageStash, never this; the two modes' drafts stay independent.)
      mfiStashRef.current=null; setHasMfiDraft(false);
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
    // Loaded MUSIC source (MIDI / Score / Audio): Clear wipes the painted piece
    // but STAYS on the canvas — same idea as the image / MFI branches above — so
    // the "+ new music" affordance and the empty frame remain instead of
    // dropping back to setup. loadedSource + stayActive are kept; only the
    // chords / canvas are wiped. (Previously this fell through to the generic
    // clear() which nulls loadedSource and, depending on the stayActive latch,
    // sometimes collapsed the active view and made the "+ new music" chip vanish
    // unpredictably.)
    if((loadedSource==='midi'||loadedSource==='audio'||loadedSource==='score')
       && !composeMode && !micPainting && !micListening && !draftOwnerRef.current){
      stopAll();
      setChords([]); chordsRef.current=[]; idxRef.current=0;
      setPending([]); pendingRef.current=[];
      pressInfo.current={}; sessionStart.current=0; gridSigRef.current='';
      composedModeRef.current=false;
      setDisp(0); setInfo(null);
      setGrid({N:DN,BW:DB,BH:DH,CW:DN*DB,CH:DN*DH});
      substrateRef.current={canvas:null,ctx:null,builtTo:0,key:'',CW:0,CH:0};
      lastPaintRef.current={disp:0,chords:null,grid:null,gc:null,style:null,viewMode:null,pending:null,info:null,anim:false,playing:false,stamp:0,mode:null,holdPaused:false};
      try{ const cv=canvasRef.current; if(cv){ const cx=cv.getContext('2d'); cx&&cx.clearRect(0,0,cv.width,cv.height); } }catch(_){}
      try{ const vc=visualizerRef.current; if(vc){ const vx=vc.getContext('2d'); vx&&vx.clearRect(0,0,vc.width,vc.height); } }catch(_){}
      try{ const hc=highlightCanvasRef.current; if(hc){ const hx=hc.getContext('2d'); hx&&hx.clearRect(0,0,hc.width,hc.height); } }catch(_){}
      setStamp(s=>s+1); setPlayedOnce(false);
      resumeFromRef.current=null; setHoldPaused(false);
      setShowColorPalette(false); setCustomArmed(false);
      setRecBlob(null); setRecName(''); setAudioShareMsg(null); setAudioSideImage(null); setAudioRowOpen(false);
      setScoreBlob(null); setScoreFileName(''); setScoreMsg(null);
      setClearArmed(false);
      // loadedSource + stayActive STAY → active view persists with "+ new music".
      setStayActive(true);
      musicStashRef.current=null; setHasMusicDraft(false);
      requestAnimationFrame(()=>{try{window.scrollTo({top:0,behavior:'smooth'});}catch(_){}});
      return;
    }
    // For everything else (loaded MIDI/Score/Audio/mood OR empty), do a
    // full clear(): it drops the loaded source and chords so the source tile
    // no longer shows as active when returning to setup.
    // Capture the mode being cleared BEFORE clear() resets moodFromImg/moodContext.
    const _wasMfi  = moodFromImg;
    const _wasMood = moodContext && !moodFromImg;
    clear();
    // Drop ONLY the draft of the mode actually being cleared on this path
    // (mood / MFI / empty / a stopped creative session). clear() already
    // discarded the active creative owner's stash via draftOwnerRef. Every
    // OTHER mode's draft is INDEPENDENT and must survive — clearing a Mood must
    // not wipe a stashed MIC / Compose / Music / Image / MFI draft (and vice-versa).
    if(_wasMfi){ mfiStashRef.current=null; setHasMfiDraft(false); }
    else if(_wasMood){ moodStashRef.current=null; setHasMoodDraft(false); }
    draftOwnerRef.current=null;
    // Reset Colour + Style to defaults so returning to Setup is a clean slate.
    setMode('harmony'); setStyle(null); setSetupNoSel(false); setShowColorPalette(false); setCustomArmed(false);
  },[stopAll,clear,composeMode,micPainting,micListening,micArmed,micPreset,loadedSource,mode,activePalette,atmoOn,atmoMood,moodFromImg,moodContext,varySource,melodyOn,melodyData]);

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
    pixelRef.current=null;imgComposeRef.current=false;setViewMode('paint');setStamp(s=>s+1);
    setImgPlayMode('scan'); imgPlayModeRef.current='scan';
    moodStashRef.current=null;setHasMoodDraft(false);
    musicStashRef.current=null;setHasMusicDraft(false);
    imageStashRef.current=null;setHasImageDraft(false);
    mfiStashRef.current=null;setHasMfiDraft(false);
    setGrid({N:DN,BW:DB,BH:DH,CW:DN*DB,CH:DN*DH});
    setOriginalImgUrl(null);
    setCurrentMood(null);setVarySource(null);setSongQ('');setPickMode(null);setStructureSeedLock(null);setForceSetup(false);
    setComposeMode(false);setDemoMode(false);setLoopMode(false);loopModeRef.current=false;
    setCompositionName('');setPaintScale('off');setRecordingName('');setRecBlob(null);setRecName('');setAudioSideImage(null);setAudioRowOpen(false);
  },[stopAll]);

  const applyEvents = useCallback((events,title)=>{
    if(!events.length)return;
    setImgReturnUrl(null); setImgMoodThumb(null);
    // Clear MFI flags — applyEvents is the chord-loader for ALL non-MFI
    // sources (MIDI/audio/score files, song search, AI compose, recall,
    // sample, morph, vary). Without this, moodFromImg can linger from a
    // previous MFI piece and leave the MFI source tile glowing even
    // though the new piece has nothing to do with image-mood composition.
    // (Genuine MFI recall paths re-set moodContext/moodFromImg AFTER
    // applyEvents, so this doesn't break the recall flow.)
    setMoodFromImg(false); setMoodContext(false);
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
    pixelRef.current=null;imgComposeRef.current=false;setViewMode('paint');setOriginalImgUrl(null);
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
    const file=e.target.files[0];if(!file)return;e.target.value='';stashOutgoing('music');if(micPainting)stopMicPainting();if(micListening)stopMicListening();setComposeMode(false);if(draftOwnerRef.current){stashDraft(draftOwnerRef.current);draftOwnerRef.current=null;}setPickMode(null);setMicArmed(false);setForceSetup(false);setCurrentMood(null);setVarySource(null);setSongQ('');setMidiBlob(null);setMidiName('');setAudioBlob(null);setAudioName('');audioBlobRef.current=null;setLoadedSource(null);setMoodFromImg(false);setImgMoodThumb(null);setMoodContext(false);
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
    const file=e.target.files[0];if(!file)return;e.target.value='';stashOutgoing('music');if(micPainting)stopMicPainting();if(micListening)stopMicListening();setComposeMode(false);if(draftOwnerRef.current){stashDraft(draftOwnerRef.current);draftOwnerRef.current=null;}setPickMode(null);setMicArmed(false);setForceSetup(false);setCurrentMood(null);setVarySource(null);setSongQ('');setMidiBlob(null);setMidiName('');setAudioBlob(null);setAudioName('');audioBlobRef.current=null;setLoadedSource(null);setMoodFromImg(false);setImgMoodThumb(null);setMoodContext(false);
    // The flow:
    //   1. reading file → arrayBuffer
    //   2. decoding audio → decodeAudioData via OfflineAudioContext (iOS-safe)
    //   3. transcribing audio → FFT loop with 0–100% progress
    //   4. applying notes → applyEvents
    // OfflineAudioContext bypasses an iOS Chrome/Safari bug where `new
    // AudioContext()` or `resume()` hangs forever when the existing live
    // context is in `interrupted` state (e.g. after Tone.js piano sampler
    // use). OfflineAudioContext has no lifecycle — it's pure arithmetic on
    // the PCM bytes — so it's immune to that bug.
    setWorking(true);setWLabel(t('transcribingAudio')||'transcribing audio');setWPct(0);setErr('');setErrInfo(false);stopAll();wipeCanvasNow();
    const myToken=loadTokenRef.current;
    try{
      const rawBuf=await file.arrayBuffer();
      // ── MP3 sanitizer ──────────────────────────────────────────────────────
      // Some MP3s (often from converters like Freemake) declare their ID3v2
      // tag size correctly but leave hundreds of bytes of 0x00 padding/junk
      // between the tag end and the first real MP3 frame sync. Desktop Chrome
      // tolerates the junk and finds the sync; iOS Safari is strict and throws
      // EncodingError from decodeAudioData. We do what a strict parser would
      // expect: locate the first valid MP3 sync and, if it isn't immediately
      // after the ID3 tag, strip the junk and hand decodeAudioData a clean
      // buffer. Untagged or correctly-padded files pass through unchanged.
      const buf=(()=>{
        try{
          const u8=new Uint8Array(rawBuf);
          if(u8.length<10 || u8[0]!==0x49 || u8[1]!==0x44 || u8[2]!==0x33) return rawBuf; // no ID3v2
          const tagEnd=10+((u8[6]<<21)|(u8[7]<<14)|(u8[8]<<7)|u8[9]);
          if(tagEnd>=u8.length) return rawBuf;
          // Already sync at tag end? Nothing to fix.
          const validSync=(b1,b2,b3)=>{
            if(b1!==0xFF) return false;
            if((b2&0xE0)!==0xE0) return false;
            const mpeg=(b2>>3)&3; if(mpeg===1) return false;
            const layer=(b2>>1)&3; if(layer===0) return false;
            const br=(b3>>4)&0x0F; if(br===0||br===0x0F) return false;
            const sr=(b3>>2)&3; if(sr===3) return false;
            return true;
          };
          if(validSync(u8[tagEnd],u8[tagEnd+1],u8[tagEnd+2])) return rawBuf;
          // Find first real sync within a reasonable window after the tag.
          const limit=Math.min(u8.length-3, tagEnd+65536);
          for(let i=tagEnd;i<limit;i++){
            if(validSync(u8[i],u8[i+1],u8[i+2])){
              // Strip everything before sync (incl. ID3 + junk). The frame
              // data is identical bit-for-bit; we just lose metadata Paintiano
              // doesn't use anyway.
              return u8.buffer.slice(i, u8.length);
            }
          }
          return rawBuf;
        }catch(_){ return rawBuf; }
      })();
      const blob=new Blob([buf],{type:file.type||'audio/mpeg'});
      const OfflineAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const AC = window.AudioContext || window.webkitAudioContext;
      let audioBuf = null;
      // Try OfflineAudioContext first (interruption-immune on iOS).
      try {
        const offline = new OfflineAC(1, 1, 44100);
        const decodeOff = (arrBuf, ctx) => new Promise((resolve, reject) => {
          let settled = false;
          const finish = (fn, val) => { if(!settled){ settled=true; fn(val); } };
          const timer = setTimeout(() => finish(reject, new Error('offline decode timeout (15s)')), 15000);
          try {
            ctx.decodeAudioData(arrBuf,
              (ab) => { clearTimeout(timer); finish(resolve, ab); },
              (err) => { clearTimeout(timer); finish(reject, err || new Error('offline decode failed')); }
            );
          } catch(e) {
            ctx.decodeAudioData(arrBuf).then(
              (ab) => { clearTimeout(timer); finish(resolve, ab); },
              (err) => { clearTimeout(timer); finish(reject, err || new Error('offline decode failed')); }
            );
          }
        });
        audioBuf = await decodeOff(buf.slice(0), offline);
      } catch (offErr) {
        // Fallback: live AudioContext with timeout-safe resume + decode.
        try {
          const ac = new AC();
          try{ if(ac.state!=='running') await Promise.race([ac.resume(), new Promise((_,rj)=>setTimeout(()=>rj(new Error('resume timeout')),3000))]); }catch(_){}
          const decodeLive = (arrBuf, ctx) => new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, val) => { if(!settled){ settled=true; fn(val); } };
            const timer = setTimeout(() => finish(reject, new Error('live decode timeout (15s)')), 15000);
            try {
              ctx.decodeAudioData(arrBuf,
                (ab) => { clearTimeout(timer); finish(resolve, ab); },
                (err) => { clearTimeout(timer); finish(reject, err || new Error('live decode failed')); }
              );
            } catch(e) {
              ctx.decodeAudioData(arrBuf).then(
                (ab) => { clearTimeout(timer); finish(resolve, ab); },
                (err) => { clearTimeout(timer); finish(reject, err || new Error('live decode failed')); }
              );
            }
          });
          audioBuf = await decodeLive(buf.slice(0), ac);
          try{ ac.close(); }catch(_){}
        } catch (liveErr) {
          throw new Error('decode failed (offline+live): ' + (offErr?.message||offErr) + ' / ' + (liveErr?.message||liveErr));
        }
      }
      if(loadTokenRef.current!==myToken)return;
      audioPCMRef.current=audioBuf;
      // For long files the FFT pass can take a meaningful chunk of time. Let
      // the user know so the progress bar doesn't look like a stuck app.
      if(audioBuf.duration>90){
        setWLabel(t('transcribingAudioLong')||'transcribing audio · this may take a minute');
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
    }catch(e){
      if(loadTokenRef.current===myToken){
        // Decode failures on iOS most often come from MP3 files with broken
        // headers (junk between ID3 tag and first frame sync) or unusual
        // formats (VBR with bad Xing, exotic sample rates, M4A pretending to
        // be MP3). The sanitizer above catches the common case; if we still
        // failed, give the user something actionable instead of a stack trace.
        const m=String(e&&e.message||e);
        const isDecode=/decode|EncodingError|Unable to decode/i.test(m);
        if(isDecode){
          const ext=(file.name.match(/\.([^.]+)$/)||[])[1]||'';
          const tip = lang==='SK'
            ? `Súbor sa nedá dekódovať. Pravdepodobne má poškodenú hlavičku alebo neštandardný formát. Skús ho prekonvertovať (napr. v Audacity: File → Export → MP3, alebo online cez online-audio-converter.com).`
            : lang==='DE'
            ? `Datei kann nicht dekodiert werden. Vermutlich beschädigter Header oder ungewöhnliches Format. Konvertiere die Datei neu (z. B. in Audacity: File → Export → MP3, oder online via online-audio-converter.com).`
            : lang==='FR'
            ? `Impossible de décoder ce fichier. En-tête probablement corrompu ou format inhabituel. Reconvertis-le (par ex. dans Audacity : Fichier → Exporter → MP3, ou en ligne via online-audio-converter.com).`
            : lang==='ES'
            ? `No se puede decodificar el archivo. Cabecera dañada o formato inusual. Convierte el archivo (p. ej. en Audacity: Archivo → Exportar → MP3, o en línea via online-audio-converter.com).`
            : `This file can't be decoded. Likely a broken header or unusual format. Try re-converting it (e.g. in Audacity: File → Export → MP3, or online via online-audio-converter.com).`;
          setErr('Audio · '+(ext?ext.toUpperCase()+' · ':'')+tip);
        } else {
          setErr('Audio: '+m);
        }
        setErrInfo(false);
      }
    }
    finally{if(loadTokenRef.current===myToken){setWorking(false);setWLabel('');setWPct(0);}}
  },[stopAll,applyEvents,t,wipeCanvasNow]);

  // ── loadFromMyMusic — replay a saved slot ──────────────────────────────────
  // Reconstitutes a File from the IDB blob (name + mime intact) then routes it
  // through the same handler that a fresh upload would use: loadAudio for audio
  // formats, loadMidi for MIDI. This means saved pieces get the same transcribe
  // pipeline, so the resulting painting matches what the user originally saw.
  // The drawer closes before dispatch so the working overlay is unobstructed.
  const loadFromMyMusic = useCallback(async(rec)=>{
    if(!rec || !rec.blob) return;
    setShowMyMusicDrawer(false);
    const _extByMime = {
      'audio/mpeg':'.mp3','audio/mp3':'.mp3',
      'audio/wav':'.wav','audio/wave':'.wav','audio/x-wav':'.wav',
      'audio/mp4':'.m4a','audio/x-m4a':'.m4a','audio/aac':'.m4a',
      'audio/ogg':'.ogg','audio/webm':'.webm',
      'audio/midi':'.mid','audio/x-midi':'.mid',
      'application/vnd.recordare.musicxml+xml':'.mxl',
      'application/vnd.recordare.musicxml':'.xml',
    };
    const _ext = _extByMime[rec.mime] || (rec.kind==='midi' ? '.mid' : (rec.kind==='score' ? '.xml' : '.mp3'));
    const _fileName = /\.[a-z0-9]+$/i.test(rec.name) ? rec.name : (rec.name + _ext);
    const _file = new File([rec.blob], _fileName, { type: rec.mime || 'application/octet-stream' });
    const _fakeEvent = { target: { files: [_file], value: '' } };
    try{
      if(rec.kind === 'midi')      loadMidi(_fakeEvent);
      else                          await loadAudio(_fakeEvent);
    }catch(err){ /* silent — user can retry from the drawer */ }
  }, [loadAudio, loadMidi]);

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
  const IMGMOOD_CACHE_KEY='paintiano_imgmood_cache_v2';
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

  // ── Image → Composition cache ──────────────────────────────────────────────
  // Parallel to the mood cache above, keyed by the SAME image hash. Once an image
  // has been "composed from", we keep the resulting piece so re-composing the
  // same picture (a known/recognised image) replays instantly — no AI call, no
  // credit spent. A small baked set (SAMPLE_IMGCOMPOSE) can ship known artworks.
  const IMGCOMPOSE_CACHE_KEY='paintiano_imgcompose_cache_v1';
  const _imgComposeCacheGet=useCallback((hash)=>{
    try{
      if(typeof SAMPLE_IMGCOMPOSE!=='undefined' && SAMPLE_IMGCOMPOSE && SAMPLE_IMGCOMPOSE.hash===hash) return SAMPLE_IMGCOMPOSE.result;
    }catch(_){}
    try{
      const raw=localStorage.getItem(IMGCOMPOSE_CACHE_KEY); if(!raw) return null;
      const map=JSON.parse(raw)||{}; return map[hash]||null;
    }catch(_){ return null; }
  },[]);
  const _imgComposeCacheSet=useCallback((hash,result)=>{
    try{
      const raw=localStorage.getItem(IMGCOMPOSE_CACHE_KEY);
      const map=raw?(JSON.parse(raw)||{}):{};
      map[hash]=result;
      const keys=Object.keys(map);
      if(keys.length>20){ for(const k of keys.slice(0,keys.length-20)) delete map[k]; }
      localStorage.setItem(IMGCOMPOSE_CACHE_KEY, JSON.stringify(map));
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
    stashOutgoing('mfi');
    if(micPainting)stopMicPainting();if(micListening)stopMicListening();setComposeMode(false);
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
  },[stopAll,applyEvents,composeMode,micPainting,micListening]);

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
    stashOutgoing('mood');
    if(micPainting)stopMicPainting();if(micListening)stopMicListening();setComposeMode(false);
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
  },[stopAll,applyEvents,composeMode,micPainting,micListening]);

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
      if(sameDay) return (t('today')||'Today')+' '+tm;
      const mons=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return d.getDate()+' '+mons[d.getMonth()]+' '+tm;
    }catch(_){ return (t('recentPlayed')||'recent'); }
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

  // Picker mutual-exclusivity: only one source/recent/mood chooser open at a
  // time. On desktop these now sit in the right column with a transparent
  // backdrop, so two open at once would visibly overlap. Opening any one closes
  // the others. (Harmless on mobile too — they were always one-at-a-time there.)
  useEffect(()=>{ if(pickMode){ setShowMoodMenu(false); setShowComposeRecent(false); setShowMicRecent(false); } },[pickMode]);
  useEffect(()=>{ if(showMoodMenu){ setPickMode(null); setShowComposeRecent(false); setShowMicRecent(false); } },[showMoodMenu]);
  useEffect(()=>{ if(showComposeRecent){ setPickMode(null); setShowMoodMenu(false); setShowMicRecent(false); } },[showComposeRecent]);
  useEffect(()=>{ if(showMicRecent){ setPickMode(null); setShowMoodMenu(false); setShowComposeRecent(false); } },[showMicRecent]);
  // When the active mode flips on — mic armed/active, compose started, a
  // source loaded (image/midi/audio/score), or MFI engaged — close every
  // open picker. Otherwise a half-finished interaction (e.g. user opens the
  // Mood picker, then taps the Mic chip) leaves the previous picker hanging
  // over the new mode's UI.
  useEffect(()=>{
    if(micActive||micArmed||composeMode||loadedSource||moodFromImg){
      setShowMoodMenu(false);
      setShowMorphMenu(false);
      setShowComposeRecent(false);
      setShowMicRecent(false);
      setPickMode(null);
    }
  },[micActive,micArmed,composeMode,loadedSource,moodFromImg]);

  // "Mood from image": send the loaded image to Claude (vision) → emotion → piece.
  // isSample=true means it's the built-in sample (loadSampleImgMood), which we
  // don't add to "Recently AI generated" — sample stays accessible via its own
  // "Built-in sample" button in the picker, no need to clutter recent slots.
  const composeFromImage=useCallback(async(srcUrl,isSample)=>{
    const _src=srcUrl||originalImgUrl;
    if(imgAiBusy||!_src) return;
    stashOutgoing('mfi'); // entering MFI → stash whatever source was live (self-guards if already MFI)
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
    // Reset Image-AI-Compose state on MFI entry. Without this, a prior
    // aiComposeFromImage run leaves imgComposeRef.current=true (so the draw
    // useEffect bails on line ~1653 and the MFI canvas stays black), and
    // imgPlayModeRef.current='compose' (so startPlay redirects MFI Play to
    // aiComposeFromImage on line ~4986 — MFI never actually plays its own
    // piece). MFI is its own context — clear the Image-mode refs explicitly.
    imgComposeRef.current=false;
    pixelRef.current=null;
    setImgPlayMode('scan'); imgPlayModeRef.current='scan';
    setOriginalImgUrl(_src); setImgMoodThumb(null);
    // Clear the previous piece title so it doesn't linger over the new image while AI composes.
    setCurrentMood(null); setInfo(null);
    setMoodContext(true); setMoodFromImg(true); setViewMode('image'); setLoadedSource(null);
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
        const _langName=({EN:'English',DE:'German',FR:'French',ES:'Spanish',PT:'Portuguese',SK:'Slovak',zh:'Simplified Chinese',zhTW:'Traditional Chinese',ja:'Japanese'}[lang])||'English';
        const prompt='Look at this image. First, in one word, decide its dominant EMOTION (e.g. joyful, calm, dramatic, melancholic, tense, eerie, tender, triumphant). Then compose a short solo piano piece whose MUSICAL CHOICES are DRIVEN BY that emotion — do NOT use neutral defaults.\nMap the emotion to the music (choose to fit the SPECIFIC emotion, never fall back to a neutral middle):\n- KEY: bright/happy/triumphant/playful → a MAJOR key; sad/melancholic/eerie/tense/yearning → a MINOR key. Pick a SPECIFIC key and vary it across pieces (do not default to C).\n- TEMPO: calm/tender/melancholic → slow (50-75); joyful/playful → medium-fast (95-130); dramatic/tense/triumphant → driving (110-150); eerie → free and slow (55-80).\n- REGISTER & DENSITY: intimate/calm → sparse, mid-low register, lots of space; energetic/triumphant → fuller chords, wider range, more notes.\n- DYNAMICS: tender → soft (velocity 35-65); triumphant/dramatic → loud (75-115); tense → uneven and accented.\n- ARTICULATION/RHYTHM: playful → staccato and syncopated; melancholic → legato and long notes; tense → repeated ostinato figures.\nTwo DIFFERENT emotions MUST yield audibly DIFFERENT pieces — different key colour, tempo, density and dynamics.\nOutput ONLY a single valid JSON object - no markdown, no prose.\nSet "title" to a short phrase in '+_langName+' describing the image mood (Title Case, max 5 words).\nSchema: {"title":"...","tempo":<derived from emotion>,"key":"<derived from emotion>","notes":[[pitch,durationInBeats,startBeat,velocity], ...]}\nRules: LENGTH — keep it SHORT, 20-35 seconds total at the chosen tempo (the LAST note\'s startBeat+duration MUST stay under tempo/2 beats); 52-80 notes; include a bass line (octaves 2-3, at least 12 notes) and a melody (octaves 4-6) with a recurring motif; vary durations (mix 0.25/0.5/1/2); velocity per the dynamics above; pitches sharps only (C#4 not Db4).';
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
  const _mfiCustomActive = () => moodFromImg && originalImgUrl && originalImgUrl!==mfiSampleUrlRef.current;
  const _mfiTitleBusyRef = useRef(false);
  const _mfiTranslateTitle = useCallback(async (text, targetAppLang)=>{
    const _ln=({EN:'English',DE:'German',FR:'French',ES:'Spanish',PT:'Portuguese',SK:'Slovak',zh:'Simplified Chinese',zhTW:'Traditional Chinese',ja:'Japanese'}[targetAppLang])||'English';
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
  const loadSampleImgMood=useCallback(async()=>{
    if(draftOwnerRef.current){ stashDraft(draftOwnerRef.current); draftOwnerRef.current=null; }
    try{
      const dataUrl=await _fetchSampleDataUrl(SAMPLE_IMAGE_MFI_B64_URL);
      mfiSampleUrlRef.current=dataUrl;                 // remember so _mfiCustomActive can tell sample vs user image
      composeFromImage(dataUrl, true);                 // isSample=true → skip recent
    }catch(e){ setErr('Sample image: '+(e&&e.message||'load failed')); setErrInfo(false); }
  },[composeFromImage,stashDraft]);

  // MusicXML upload — exact, structured score data from MuseScore / Finale / Dorico.
  // Far more accurate than PDF OMR because every note's pitch, octave, accidental, and rhythm is encoded.
  // Accepts both uncompressed .musicxml/.xml AND compressed .mxl (zip-deflated).
  // accept="*/*" used because iOS file picker doesn't recognize .mxl UTI and would dim it.
  const loadMusicXml=useCallback(async e=>{
    const file=e.target.files[0];if(!file)return;e.target.value='';stashOutgoing('music');if(micPainting)stopMicPainting();if(micListening)stopMicListening();setComposeMode(false);if(draftOwnerRef.current){stashDraft(draftOwnerRef.current);draftOwnerRef.current=null;}setPickMode(null);setMicArmed(false);setForceSetup(false);setCurrentMood(null);setVarySource(null);setSongQ('');setMidiBlob(null);setMidiName('');setAudioBlob(null);setAudioName('');audioBlobRef.current=null;setLoadedSource(null);setMoodFromImg(false);setImgMoodThumb(null);setMoodContext(false);
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

  // Unified "Sound" input router. One file picker accepts MIDI, audio and score
  // files; we detect which kind it is by extension and hand the SAME change-event
  // to the existing loader (each loader reads e.target.files[0] itself, so we
  // don't synthesise anything). The three internal modes are unchanged — this only
  // merges the entry point so the user taps one SOUND button instead of three.
  const loadSound=useCallback(e=>{
    const file=e.target.files&&e.target.files[0];
    if(!file){ return; }
    const name=(file.name||'').toLowerCase();
    const ext=name.slice(name.lastIndexOf('.')+1);
    const isMidi  = /^(mid|midi)$/.test(ext) || file.type==='audio/midi' || file.type==='audio/x-midi';
    const isScore = /^(xml|musicxml|mxl)$/.test(ext);
    // Everything else that got through the audio picker (mp3/wav/m4a/ogg/aac…) is
    // treated as audio — that's also the safest fallback for unknown types.
    if(isMidi)       return loadMidi(e);
    if(isScore)      return loadMusicXml(e);
    return loadAudio(e);
  },[loadMidi,loadMusicXml,loadAudio]);
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
    setWorking(true);setWLabel(t('transcribingSample')||'transcribing sample');setWPct(0);setErr('');setErrInfo(false);stopAll();wipeCanvasNow();
    const myToken=loadTokenRef.current;
    try{
      const arrayBuffer=await _fetchSampleArrayBuffer(SAMPLE_AUDIO_B64_URL);
      const blob=new Blob([arrayBuffer],{type:'audio/mpeg'});
      // OfflineAudioContext-first decode (see loadAudio for the iOS bug).
      const OfflineAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const AC = window.AudioContext || window.webkitAudioContext;
      let audioBuf = null;
      try {
        const offline = new OfflineAC(1, 1, 44100);
        const decodeOff = (arrBuf, ctx) => new Promise((resolve, reject) => {
          let settled = false;
          const finish = (fn, val) => { if(!settled){ settled=true; fn(val); } };
          const timer = setTimeout(() => finish(reject, new Error('offline decode timeout (15s)')), 15000);
          try {
            ctx.decodeAudioData(arrBuf,
              (ab) => { clearTimeout(timer); finish(resolve, ab); },
              (err) => { clearTimeout(timer); finish(reject, err || new Error('offline decode failed')); }
            );
          } catch(e) {
            ctx.decodeAudioData(arrBuf).then(
              (ab) => { clearTimeout(timer); finish(resolve, ab); },
              (err) => { clearTimeout(timer); finish(reject, err || new Error('offline decode failed')); }
            );
          }
        });
        audioBuf = await decodeOff(arrayBuffer.slice(0), offline);
      } catch (offErr) {
        try {
          const ac = new AC();
          try{ if(ac.state!=='running') await Promise.race([ac.resume(), new Promise((_,rj)=>setTimeout(()=>rj(new Error('resume timeout')),3000))]); }catch(_){}
          const decodeLive = (arrBuf, ctx) => new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, val) => { if(!settled){ settled=true; fn(val); } };
            const timer = setTimeout(() => finish(reject, new Error('live decode timeout (15s)')), 15000);
            try {
              ctx.decodeAudioData(arrBuf,
                (ab) => { clearTimeout(timer); finish(resolve, ab); },
                (err) => { clearTimeout(timer); finish(reject, err || new Error('live decode failed')); }
              );
            } catch(e) {
              ctx.decodeAudioData(arrBuf).then(
                (ab) => { clearTimeout(timer); finish(resolve, ab); },
                (err) => { clearTimeout(timer); finish(reject, err || new Error('live decode failed')); }
              );
            }
          });
          audioBuf = await decodeLive(arrayBuffer.slice(0), ac);
          try{ ac.close(); }catch(_){}
        } catch (liveErr) {
          throw new Error('decode failed (offline+live): ' + (offErr?.message||offErr) + ' / ' + (liveErr?.message||liveErr));
        }
      }
      if(loadTokenRef.current!==myToken)return;
      audioPCMRef.current=audioBuf;
      if(audioBuf.duration>90){
        setWLabel(t('transcribingSampleLong')||'transcribing sample · this may take a minute');
      }
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
    stashOutgoing('mood');
    if(micPainting)stopMicPainting();if(micListening)stopMicListening();setComposeMode(false);
    setSongQ(title);setErr('');setErrInfo(false);setMidiBlob(null);setAudioBlob(null);setAudioName('');audioBlobRef.current=null;stopAll();
    const song=findSong(title);
    if(!song){setErr(t('errs').songNotFound);return;}
    const evts=noteArr2events(song.notes,song.tempo);
    if(!evts.length){setErr(t('errs').noNotesGeneric);return;}
    const dispTitle=((t('moodNames')||{})[song.mood])||((t('moodNames')||{})[title])||song.title;
    applyEvents(evts,dispTitle); setComposeSource('crafted'); setMoodContext(true);
    // Set varySource so Vary works on crafted (library) moods too — without
    // this, the Vary button stays disabled because !varySource. AI and offline
    // mood paths already set this; the crafted-library branch was the gap.
    setVarySource(song);
    const bytes=encodeMidi(evts,song.tempo||120);
    setMidiBlob(new Blob([bytes],{type:'audio/midi'}));
    setMidiName(song.title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim()+'.mid');
  },[working,stopAll,applyEvents,t,composeMode,micPainting,micListening]);

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
    stashOutgoing('mood');
    if(micPainting)stopMicPainting();if(micListening)stopMicListening();setComposeMode(false);
    const song=moodToSong(text);
    if(!song){ setErr(t('errs').songNotFound); return; }
    setSongQ(text);setErr('');setErrInfo(false);setMidiBlob(null);setAudioBlob(null);setAudioName('');audioBlobRef.current=null;stopAll();
    setVarySource(song);
    const evts=noteArr2events(song.notes,song.tempo);
    if(!evts.length){ setErr(t('errs').noNotesGeneric); return; }
    applyEvents(evts,song.title); setComposeSource('offline'); setMoodContext(true);
    const bytes=encodeMidi(evts,song.tempo||100);
    setMidiBlob(new Blob([bytes],{type:'audio/midi'}));
    setMidiName(song.title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim()+'.mid');
  },[working,stopAll,applyEvents,aiMidi,t,composeMode,micPainting,micListening]);

  // ── Image → Composition ────────────────────────────────────────────────
  // Extract a compact "musical material" summary from the notes the current
  // image produced (chordsRef): which pitches appear and how often, the range,
  // density, the energy arc left→right, and (if AI atmosphere is on) the mood.
  // This is handed to Claude so it can compose a NEW free-standing piece FROM
  // that material — melody, rhythm, metre, emotion — related to the image's
  // character, rather than the literal left-to-right pixel readout.
  const extractImageMaterial = useCallback(()=>{
    const src = (chordsRef.current && chordsRef.current.length) ? chordsRef.current : chords;
    if(!src || !src.length) return null;
    const pcCount = new Array(12).fill(0); // pitch-class histogram
    let lo=128, hi=0, noteN=0, velSum=0;
    const half = Math.floor(src.length/2) || 1;
    let eEarly=0, nEarly=0, eLate=0, nLate=0; // energy arc (velocity) first vs second half
    src.forEach((ev,i)=>{
      (ev.n||[]).forEach(n=>{
        const m=n.m; if(typeof m!=='number') return;
        pcCount[((m%12)+12)%12]++; noteN++;
        if(m<lo)lo=m; if(m>hi)hi=m;
        const v=n.v||60; velSum+=v;
        if(i<half){ eEarly+=v; nEarly++; } else { eLate+=v; nLate++; }
      });
    });
    if(!noteN) return null;
    const NOTE=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    // Top pitch classes by frequency → the image's "palette"
    const ranked=pcCount.map((c,i)=>({pc:NOTE[i],c})).filter(x=>x.c>0).sort((a,b)=>b.c-a.c);
    const palette=ranked.slice(0,7).map(x=>x.pc).join(' ');
    const noteRange=`${NOTE[((lo%12)+12)%12]}${Math.floor(lo/12)-1}–${NOTE[((hi%12)+12)%12]}${Math.floor(hi/12)-1}`;
    const avgVel=Math.round(velSum/noteN);
    const density=(noteN/src.length); // avg notes per event ≈ chord thickness
    const earlyV=nEarly?eEarly/nEarly:avgVel, lateV=nLate?eLate/nLate:avgVel;
    const arc = lateV>earlyV+8 ? 'builds / brightens toward the end'
              : earlyV>lateV+8 ? 'opens strong then settles' : 'fairly even throughout';
    const energy = avgVel>=95?'high, forceful':avgVel>=70?'moderate':'soft, gentle';
    const tex = density>=3.2?'dense, chordal':density>=1.8?'mixed chords and lines':'sparse, melodic';
    const mood = (atmoOn && atmoMood) ? (currentMood||(atmoMood.v>0.2?'bright':atmoMood.v<-0.2?'dark':'neutral')) : null;
    return { palette, noteRange, energy, tex, arc, mood, count:noteN };
  },[chords,atmoOn,atmoMood,currentMood]);

  // Compose a real piece FROM the image's note material (no painting — keeps the
  // original image on the canvas while it plays). Reuses the same Claude endpoint
  // + parse + apply path as aiCompose.
  const aiComposeFromImage=useCallback(async(afterReady)=>{
    if(busy) return;
    const mat=extractImageMaterial();
    if(!mat){ setErr(t('noNotesGeneric')||'Load an image first'); setErrInfo(false); return; }
    if(micPainting)stopMicPainting();if(micListening)stopMicListening();setComposeMode(false);
    // AI composition flows through gateAI below (Pro AI = unlimited, Free/Pro
    // = trial then paywall). No tier check here — the gate decides.
    // Shared apply for both a cache hit and a fresh AI result. Keeps the ORIGINAL
    // image on the canvas and stays in IMAGE context (no MORPH/VARY) — see the
    // long note further down for why pixelRef is nulled. When afterReady is given
    // (REC path) we hand off to it instead of plain Play, so the recorder and the
    // composed playback start together — no silent lead-in while AI was thinking.
    const _applyComposition=(parsed)=>{
      const evts=noteArr2events(parsed.notes,parsed.tempo,{keepLong:true});
      if(!evts.length) throw new Error('Could not parse composition');
      const _dispT=(parsed.title&&String(parsed.title).trim())||(t('imgComposition')!=='imgComposition'?t('imgComposition'):'Composition');
      pixelRef.current=null;
      imgComposeRef.current=true;
      setChords(evts); chordsRef.current=evts; idxRef.current=0; setDisp(0);
      setInfo({title:_dispT,count:evts.length,dur:Math.round((evts[evts.length-1]?.startMs||0)/1000)+2});
      try{ const bytes=encodeMidi(evts,parsed.tempo||120); setMidiBlob(new Blob([bytes],{type:'audio/midi'})); setMidiName(_dispT.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim()+'.mid'); }catch(_){}
      setWorking(false); setWLabel(''); setWPct(0);
      // The Play tap that triggered this compose already stamped the startPlay
      // debounce. On a cache hit _applyComposition runs <300ms later, so the
      // auto-play below would be swallowed (→ "first tap does nothing, second
      // plays"). Clear the stamp so the post-compose play always fires.
      lastStartPlayRef.current=0;
      if(typeof afterReady==='function'){ setTimeout(()=>{ try{ afterReady(); }catch(_){} }, 80); }
      else { setTimeout(()=>{ try{ startPlayRef.current?.(); }catch(_){} }, 60); }
    };
    // Known/recognised image: if we've composed from this exact picture before,
    // replay the cached piece instantly — no AI call, no credit spent.
    const _imgHash = originalImgUrl ? _imgMoodHash(originalImgUrl) : null;
    if(_imgHash!=null){
      const _cached=_imgComposeCacheGet(_imgHash);
      if(_cached&&_cached.notes&&_cached.notes.length){
        setErr(''); setErrInfo(false); stopAll();
        try{ _applyComposition(_cached); return; }catch(_){ /* fall through to AI */ }
      }
    }
    { const g=gateAI(1,false); if(!g.allow){ if(g.reason==='ai_trial') setPaywallReason('ai_trial'); return; } }
    setWorking(true); setWLabel('composing…'); setWPct(20); setErr(''); setErrInfo(false); setMidiBlob(null); stopAll();
    try{
      const _langName={EN:'English',DE:'German',FR:'French',ES:'Spanish',PT:'Portuguese',SK:'Slovak',zh:'Simplified Chinese',zhTW:'Traditional Chinese',ja:'Japanese'}[lang]||'English';
      // VISION INPUT — send the actual image to Claude so the composition is
      // driven by what's IN the picture (a child holding a painting, a sunlit
      // street, a stormy sea) — not by abstract scan statistics that compress
      // every image into the same few buckets. The scan-derived material is
      // kept as a SECONDARY hint (palette/range), but the image itself is the
      // primary signal. This is the same pattern MFI uses (mood-from-image).
      const _src = originalImgUrl;
      // Resize to ~384px (matches MFI) to keep base64 small and the request fast.
      const dataUrl = await new Promise((res,rej)=>{
        const im=new Image();
        im.onload=()=>{
          try{
            const max=384;
            let w=im.naturalWidth||384, h=im.naturalHeight||384;
            const sc=Math.min(1, max/Math.max(w,h));
            w=Math.max(1,Math.round(w*sc)); h=Math.max(1,Math.round(h*sc));
            const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
            cv.getContext('2d').drawImage(im,0,0,w,h);
            res(cv.toDataURL('image/jpeg',0.82));
          }catch(e){ rej(e); }
        };
        im.onerror=()=>rej(new Error('img'));
        im.src=_src;
      });
      const b64 = dataUrl.split(',')[1];
      const prompt=`Look at this image. Identify WHAT is in it (a person, a landscape, a building, an abstract painting, a child, an animal, etc.) and its dominant EMOTION (e.g. joyful, calm, dramatic, melancholic, tense, eerie, tender, triumphant). Then compose a free-standing solo piano piece whose musical choices are DRIVEN by what you see and feel.
The scanned musical material (a secondary hint — the image itself is the primary signal):
- Pitch palette (most present pitch classes): ${mat.palette}
- Range of the scan: ${mat.noteRange}${mat.mood?`\n- Detected mood: ${mat.mood}`:''}
Map what you see to the music — two DIFFERENT images MUST yield audibly DIFFERENT pieces (different key, tempo, density, dynamics):
- KEY: bright/happy/triumphant/playful subjects → MAJOR; sad/melancholic/eerie/tense/yearning subjects → MINOR. Pick a SPECIFIC key, vary across pieces (do not default to C).
- TEMPO: calm/tender/melancholic → slow (55-80); joyful/playful → medium (90-120); dramatic/tense/triumphant → driving (110-145); eerie → free and slow.
- REGISTER & DENSITY: intimate/calm → sparse, mid-low register, lots of space; energetic/triumphant → fuller chords, wider range, more notes.
- DYNAMICS: tender → soft (vel 40-65); triumphant/dramatic → loud (80-115); tense → uneven and accented.
- ARTICULATION: playful → staccato and syncopated; melancholic → legato; tense → repeated ostinato.
Output ONLY a single valid JSON object — no markdown, no prose.
Schema: {"title":"...","tempo":<derived>,"key":"<derived>","notes":[[pitch,durationInBeats,startBeat,velocity],...]}
Set "title" to a short evocative phrase in ${_langName} (Title Case, max 5 words) describing THIS SPECIFIC image — must be distinctive, never a generic "quiet light" type phrase.
Composition rules:
- LENGTH: 60-90 seconds of music — the LAST note's (startBeat + duration) MUST reach at least tempo beats (= 60 seconds).
- 90-150 notes total.
- STYLE: Western tonal piano in the spirit of Einaudi, Yiruma, Max Richter, Chopin's Nocturnes, or Debussy. Lyrical melodies over flowing accompaniment. Avoid East-Asian-traditional evocations unless the image is unmistakably East Asian.
- HARMONY: familiar functional progressions (I-V-vi-IV, ii-V-I; minor: i-VI-III-VII, i-iv-V-i). Diatonic with tasteful chromatic colour.
- Structure: intro (motif, sparse) → development (richer) → contrasting middle → return of motif → close (quieter).
- Bass (octaves 2-3): ≥20 notes. Melody (octaves 4-6): singable, recurring motif.
- Vary durations (mix 0.25/0.5/1/2). Pitches with octave, sharps only (C#4 not Db4).`;
      setWPct(40);
      const _host=(typeof window!=='undefined'&&window.location&&window.location.hostname)||'';
      const _isArtifactPreview=/claude\.ai$|claudeusercontent\.com$|\.claude\.com$/.test(_host);
      const _endpoints=_isArtifactPreview?['https://api.anthropic.com/v1/messages','/api/compose']:['/api/compose','https://api.anthropic.com/v1/messages'];
      const messages=[{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}},{type:'text',text:prompt}]}];
      let resp=null,respText='',lastErr=null;
      for(const _ep of _endpoints){
        try{
          const r=await fetch(_ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:CLAUDE_MODEL,max_tokens:4000,messages})});
          const txt=await r.text();
          if(r.ok&&txt){ resp=r; respText=txt; break; }
          lastErr=new Error(`API ${r.status}: ${txt.slice(0,160)}`);
        }catch(err){ lastErr=err; }
      }
      setWPct(75);
      if(!resp){ const _netErr=lastErr||new Error('compose endpoints unavailable'); _netErr._aiNet=true; throw _netErr; }
      setAiDown(false);
      let data; try{data=JSON.parse(respText);}catch(_){throw new Error('Response not JSON');}
      const raw=(data.content||[]).map(b=>b.type==='text'?b.text:'').join('');
      if(!raw)throw new Error('Empty content');
      const parsed=extractAiJson(raw);
      if(!parsed?.notes?.length)throw new Error('No notes');
      gateAI(1,true);
      // Cache the composition keyed by image hash so re-composing the same
      // picture later is instant + free (see _imgComposeCacheGet).
      if(_imgHash!=null){ try{ _imgComposeCacheSet(_imgHash,{notes:parsed.notes,tempo:parsed.tempo||90,title:parsed.title||''}); }catch(_){} }
      _applyComposition(parsed);
      return;
    }catch(e){
      if(e&&e._aiNet) setAiDown(true);
      setErr(e.message||'Compose failed'); setErrInfo(false);
    }
    finally{ setWorking(false); setWLabel(''); setWPct(0); }
  },[busy,extractImageMaterial,stopAll,lang,gateAI,t,isPro,originalImgUrl,_imgMoodHash,_imgComposeCacheGet,_imgComposeCacheSet,composeMode,micPainting,micListening]);

  // ── MELODY cache ────────────────────────────────────────────────────────────
  // Keyed by image hash + atmosphere signature so the same picture in the same
  // mood replays its sung line free. Distinct from the compose cache (that's a
  // whole separate piece); this is the lead line we layer over the scan texture.
  const MELODY_CACHE_KEY='paintiano_melody_cache_v5';
  const _melodyCacheKey=useCallback((hash)=>{
    const atmoSig=(atmoOn&&atmoMood)?('a'+atmoMood.v.toFixed(2)+'_'+atmoMood.e.toFixed(2)+'_'+(atmoMood.root||0)):'plain';
    return hash+'|'+atmoSig;
  },[atmoOn,atmoMood]);
  const _melodyCacheGet=useCallback((key)=>{
    try{ const raw=localStorage.getItem(MELODY_CACHE_KEY); if(!raw) return null;
      const map=JSON.parse(raw)||{}; return map[key]||null;
    }catch(_){ return null; }
  },[]);
  const _melodyCacheSet=useCallback((key,result)=>{
    try{ const raw=localStorage.getItem(MELODY_CACHE_KEY);
      const map=raw?(JSON.parse(raw)||{}):{};
      map[key]=result;
      const keys=Object.keys(map);
      if(keys.length>24){ for(const k of keys.slice(0,keys.length-24)) delete map[k]; }
      localStorage.setItem(MELODY_CACHE_KEY, JSON.stringify(map));
    }catch(_){ /* quota — skip */ }
  },[]);

  // Generate the SINGING lead line from the image. Mirrors the image's mood,
  // colour and radiance, but — unlike aiComposeFromImage — it is meant to ride
  // ON TOP of the scan texture, not replace it. Returns {notes,tempo,title} or
  // null. Handles gateAI (Pro AI unlimited; Free/Pro trial→paywall) + cache.
  const generateMelody=useCallback(async()=>{
    if(melodyBusy) return null;
    const mat=extractImageMaterial();
    if(!mat){ setErr(t('noNotesGeneric')||'Load an image first'); setErrInfo(false); return null; }
    const _imgHash = originalImgUrl ? _imgMoodHash(originalImgUrl) : null;
    const _key = _imgHash!=null ? _melodyCacheKey(_imgHash) : null;
    // Cache hit → free replay.
    if(_key!=null){
      const _cached=_melodyCacheGet(_key);
      if(_cached&&_cached.notes&&_cached.notes.length){ return _cached; }
    }
    { const g=gateAI(1,false); if(!g.allow){ if(g.reason==='ai_trial') setPaywallReason('ai_trial'); return null; } }
    setMelodyBusy(true); setErr(''); setErrInfo(false);
    try{
      // ATMO directive: when an atmosphere has been detected, project (v,e) into
      // explicit musical instructions so Claude composes a mood-coherent line from
      // the start — not just a generic melody that we later scale. (v,e) extremes
      // trigger hard rules; mid values give a gentle suggestion.
      const _atmoMood = (atmoOn && atmoMood) ? atmoMood : null;
      let atmoBlock='';
      if(_atmoMood){
        const _av=_atmoMood.v, _ae=_atmoMood.e;
        const lines=[];
        if(_ae<=0.20){
          lines.push('Energy is VERY LOW (calm/dreamy). MUST: slow tempo 50-70 BPM, legato long notes (mostly half/whole), soft dynamics (melody 60-85, chords 45-65), MID-LOW register (melody octaves 4-5, NOT 6), sparse texture, no leaps larger than a fifth, no syncopation, intro-able ambient feel.');
        } else if(_ae>=0.80){
          lines.push('Energy is VERY HIGH (intense/dramatic). MUST: tempo 115-150 BPM, articulated rhythms with staccato + syncopation, loud dynamics (melody 105-125, chords 88-108), full upper register (melody octave 5-6), denser chords, allow octave leaps and dramatic accents.');
        } else if(_ae<=0.35){
          lines.push('Energy is low. Prefer slow tempo 65-85 BPM, mostly legato, softer dynamics, mid register.');
        } else if(_ae>=0.65){
          lines.push('Energy is high. Prefer faster tempo 100-130 BPM, more articulation, brighter dynamics.');
        }
        if(_av<=-0.50){
          lines.push('Valence is strongly negative (sad/heavy/melancholic). MUST: minor key, descending phrase shapes, dissonant suspensions resolved downward.');
        } else if(_av>=0.50){
          lines.push('Valence is strongly positive (joyful/bright). MUST: major key, ascending phrase shapes, plagal/authentic cadences that feel resolved and lifting.');
        } else if(_av<=-0.20){
          lines.push('Valence is slightly negative. Lean minor key.');
        } else if(_av>=0.20){
          lines.push('Valence is slightly positive. Lean major key.');
        }
        if(_atmoMood.title){ lines.push('Title hint: "'+_atmoMood.title+'".'); }
        if(lines.length){
          atmoBlock = '\nMOOD DIRECTIVE (this overrides defaults; commit to these choices, do not regress to the safe middle):\n- '+lines.join('\n- ')+'\n';
        }
      }
      const prompt=`A painting has been scanned into a musical TEXTURE (its colours played as notes). Compose a SECOND PIANO PART that a concert pianist would play over that texture — a full, two-handed, CHORDAL piece with a clear singing MELODY on top and real harmony underneath. NOT a thin one-finger line: this is a complete, rich piano voice that stands beside the texture as an equal. It must mirror and crown the scan, echoing the image's mood, colour and radiance.
The image's musical material:
- Pitch palette (colours → notes): ${mat.palette}
- Range of the texture: ${mat.noteRange}
- Energy: ${mat.energy}    Texture: ${mat.tex}    Arc: ${mat.arc}${mat.mood?`\n- Mood / atmosphere: ${mat.mood}`:''}${atmoBlock}
Compose with real musical craft, following classical harmonization method:
- KEY: let the pitch palette define the tonal centre; choose major or natural minor to fit the mood. Stay diatonic (tasteful passing/leading tones fine; no random chromaticism).
- LENGTH: write ONE short, COMPLETE melodic phrase of about 8–16 bars (a self-contained tune that could loop seamlessly back to its start). Keep total length under ~24 beats. This cell will be REPEATED across the painting, so it must sound whole on its own and join cleanly to its own beginning.
- MELODY (top voice): clear, singable, memorable, in the upper register (octaves 5–6). A 2–4 note MOTIF stated and answered. CONTINUOUS within the phrase — flowing eighth/quarter motion, mostly stepwise, no gaps longer than a beat. 16–28 notes in the cell (dense enough to sing, not a busy run).
- HARMONY (underneath): under the melody supply CHORDS — diatonic triads/sevenths chosen by FUNCTION (I ii iii IV V vi V7) so the phrase moves tonic → subdominant → dominant → tonic and CADENCES at the end so the loop closes. Melody note = top of its chord. Mid-register voices (oct 3–4) + a bass root (oct 2–3). Move inner voices by the smallest steps (voice leading).
- DYNAMICS: melody louder than accompaniment (vel 96–118 melody, 70–92 chords) so the lead sings on top.
Output ONLY valid JSON, no prose, no markdown:
{"title":"...","tempo":90,"notes":[[pitch,durationInBeats,startBeat,velocity],...],"chords":[[[pitch,pitch,...],durationInBeats,startBeat,velocity],...]}
"notes" = the melody (top voice), one pitch each. "chords" = the harmony underneath, each a LIST of pitches (the accompanying chord voices + bass) sounding together. Pitches as names with octave, sharps only, e.g. "C5","F#4" ("Bb5"→"A#5"). Align each chord's startBeat to the melodic note it harmonizes. Title: a short evocative phrase (Title Case, max 5 words).`;
      const _host=(typeof window!=='undefined'&&window.location&&window.location.hostname)||'';
      const _isArtifactPreview=/claude\.ai$|claudeusercontent\.com$|\.claude\.com$/.test(_host);
      const _endpoints=_isArtifactPreview?['https://api.anthropic.com/v1/messages','/api/compose']:['/api/compose','https://api.anthropic.com/v1/messages'];
      let resp=null,respText='',lastErr=null;
      for(const _ep of _endpoints){
        try{
          const r=await fetch(_ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:CLAUDE_MODEL,max_tokens:4000,messages:[{role:'user',content:prompt}]})});
          const txt=await r.text();
          if(r.ok&&txt){ resp=r; respText=txt; break; }
          lastErr=new Error(`API ${r.status}: ${txt.slice(0,160)}`);
        }catch(err){ lastErr=err; }
      }
      if(!resp){ const _netErr=lastErr||new Error('melody endpoints unavailable'); _netErr._aiNet=true; throw _netErr; }
      setAiDown(false);
      let data; try{data=JSON.parse(respText);}catch(_){throw new Error('Response not JSON');}
      const raw=(data.content||[]).map(b=>b.type==='text'?b.text:'').join('');
      if(!raw)throw new Error('Empty content');
      const parsed=extractAiJson(raw);
      if(!parsed?.notes?.length)throw new Error('No notes');
      gateAI(1,true);
      const result={notes:parsed.notes,chords:Array.isArray(parsed.chords)?parsed.chords:[],tempo:parsed.tempo||90,title:parsed.title||''};
      if(_key!=null){ try{ _melodyCacheSet(_key,result); }catch(_){} }
      return result;
    }catch(e){
      if(e&&e._aiNet) setAiDown(true);
      setErr(e.message||'Melody failed'); setErrInfo(false);
      return null;
    }
    finally{ setMelodyBusy(false); }
  },[melodyBusy,extractImageMaterial,lang,gateAI,t,originalImgUrl,_imgMoodHash,_melodyCacheKey,_melodyCacheGet,_melodyCacheSet]);

  // MELODY chip tap. Only meaningful before Play (the chip is disabled during
  // playback/anim). ON → fetch (or cache-replay) the sung line, store it, enable
  // the layer (the rebuild effect re-transcribes with the melody on top). OFF →
  // just disable; the rebuild effect strips the layer back to bare texture.
  const toggleMelody=useCallback(async()=>{
    if(melodyBusy) return;
    if(melodyOn){ setMelodyOn(false); return; }
    const mel=await generateMelody();
    if(mel&&mel.notes&&mel.notes.length){
      // If playback (or a hold-pause) is live at the moment the freshly generated
      // melody comes back, arm the from-position re-join so the rebuild effect
      // restarts the voice locked to the CURRENT spot — generation took a few
      // seconds, so the playhead has moved; we want the line to come in there,
      // in time, not from the top. Set the flag here (on the live transport
      // state) rather than at chip-tap time, so it's fresh when the data lands.
      if(playingRef.current||holdPausedRef.current) _melodyTogglePlayingRef.current=true;
      melodyDataRef.current=mel; melodyOnRef.current=true; melodyVoiceGenRef.current++;
      setMelodyData(mel); setMelodyOn(true);
    }
  },[melodyBusy,melodyOn,generateMelody]);

  const aiCompose=useCallback(async(overrideMood)=>{
    const title=((typeof overrideMood==='string'&&overrideMood)?overrideMood:songQ).trim();
    if(!title||busy||composedModeRef.current)return;
    stashOutgoing('mood');
    if(micPainting)stopMicPainting();if(micListening)stopMicListening();setComposeMode(false);
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
          applyEvents(evts,_dispT); setComposeSource('ai'); setMoodContext(true); setErr(''); setErrInfo(false);
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
      const _langName={EN:'English',DE:'German',FR:'French',ES:'Spanish',PT:'Portuguese',SK:'Slovak',zh:'Simplified Chinese',zhTW:'Traditional Chinese',ja:'Japanese'}[lang]||'English';
      const prompt=`Compose a short expressive solo piano piece inspired by this mood phrase: "${title.slice(0,80)}".
The phrase may be written in ANY language and may be colloquial, slang or idiomatic. FIRST translate it and work out the genuine emotion it expresses (e.g. anger, irritation, joy, calm, sadness, longing, hope, restlessness) — do NOT read it word-by-word and do NOT assume it is English.

Before writing ANY notes, derive these mood-driven parameters — they MUST translate into audible differences in the output. A piece for "calm sea" must sound nothing like a piece for "rage":

- TEMPO (BPM): sad/melancholy 50-65 · calm/serene 65-85 · wistful/longing 70-90 · tender/hopeful 80-100 · playful 95-120 · joyful 110-135 · angry/intense 100-140 (sharp accents) · ecstatic/triumphant 125-155 · anxious/restless 95-130 (uneven)
- MODE: MAJOR keys for joyful, triumphant, tender, hopeful, playful · MINOR keys for sad, longing, melancholy, anxious, angry · MODAL or AMBIGUOUS (Lydian, Dorian, Phrygian, whole-tone) for dreamy, mysterious, contemplative, unsettled
- DYNAMIC RANGE: calm/sad pieces stay narrow and quiet (velocity 30-65 throughout) · angry/joyful pieces are loud and wide (velocity 70-127 with strong accents at 110-127) · mixed/contemplative moods use the full 35-105 range
- DENSITY: sparse 25-45 notes (calm, sad, contemplative, lonely) · medium 45-65 notes (most moods) · dense 65-95 notes (joyful, agitated, dramatic, frenetic)
- REGISTER BIAS: dark/heavy/grounded moods bias LOW (bass octaves 2-3, melody 3-4) · bright/uplifted/light moods bias HIGH (bass 3-4, melody 5-6) · balanced/conversational moods spread across the full range
- ARTICULATION & DURATIONS: legato long (1, 2, 4 beats) for sad/calm/dreamy/longing · staccato short (0.25, 0.5 beats) for playful/anxious/angry · mixed for most moods
- INTERVALLIC CHARACTER: stepwise 2nds and 3rds for sad/calm/tender · wide 5ths/6ths/octaves for joyful/triumphant/dramatic · dissonant 2nds, 7ths, tritones for angry/anxious/unsettled
- STRUCTURE: opening (establish key + motif) → development (build harmonically/dynamically) → close (resolve OR fade). Adapt the intensity curve to the mood — sad pieces stay subdued, joyful pieces climax higher, angry pieces stay agitated.

Set the "title" field to a short, natural translation of the phrase into ${_langName} that captures its meaning (Title Case, max 5 words).
Output ONLY a single valid JSON object — no markdown, no prose, no explanation.
Schema: {"title":"...","tempo":<your derived BPM>,"key":"<your derived key>","notes":[[pitch,durationInBeats,startBeat,velocity],...]}
Each note: [pitch, durationInBeats, startBeat, velocity]. Same startBeat = chord. velocity 1-127.

Hard requirements:
- Apply ALL derived parameters — tempo, mode, dynamics, density, register, articulation, intervals — so the piece is audibly mood-specific
- Bass register notes for harmonic grounding (count scales with density: sparse pieces need at least 8 bass notes, dense pieces 15+)
- Melody in the mood-driven register with a recognisable motif that recurs
- Pitches: use C4/F#3/Bb5 style with octave number, sharps only (no flats — use C#4 not Db4)`;
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
      const _typed=(title||'').trim(); const _dispT=(parsed.title&&String(parsed.title).trim())||(_typed?_typed.charAt(0).toUpperCase()+_typed.slice(1):_typed); applyEvents(evts,_dispT); setComposeSource('ai'); setMoodContext(true);
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
          applyEvents(fevts,fb.title); setComposeSource('offline'); setMoodContext(true);
          const fbytes=encodeMidi(fevts,fb.tempo||100);
          setMidiBlob(new Blob([fbytes],{type:'audio/midi'}));
          setMidiName(fb.title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim()+'.mid');
          setErr('');setErrInfo(false);
        } else { setErr(e.message||'Compose failed');setErrInfo(false); }
      } else { setErr(e.message||'Compose failed');setErrInfo(false); }
    }
    finally{setWorking(false);setWLabel('');setWPct(0);}
  },[songQ,busy,stopAll,applyEvents,wipeCanvasNow,lang,gateAI,composeMode,micPainting,micListening]);

  // Bridge ref so aiMoodFromText (declared earlier) can invoke aiCompose.
  useEffect(()=>{ aiComposeRef.current=aiCompose; },[aiCompose]);



  const loadImage=useCallback(e=>{
    const file=e.target.files[0];if(!file)return;e.target.value='';setPickMode(null);
    stashOutgoing('image');
    if(micPainting)stopMicPainting();if(micListening)stopMicListening();setComposeMode(false);
    if(draftOwnerRef.current) stashDraft(draftOwnerRef.current);
    draftOwnerRef.current=null;
    setMicArmed(false);setForceSetup(false);setCurrentMood(null);setVarySource(null);setSongQ('');setMidiBlob(null);setMidiName('');setAudioBlob(null);setAudioName('');audioBlobRef.current=null;setLoadedSource(null);setMoodFromImg(false);setImgMoodThumb(null);setMoodContext(false);
    // Clear MFI state too — without this, switching from MFI to a regular
    // image keeps moodFromImg=true, which hides the atmosphere button
    // (condition: viewMode==='image' && originalImgUrl && !moodFromImg) and
    // makes the image canvas look broken until the user reloads the app.
    setMoodFromImg(false); setImgMoodThumb(null); setMoodContext(false);
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
          // AUTO-DETECT scan direction from image characteristics.
          // Layer 1 (aspect ratio) — landscape → 'lr', portrait → 'vert'.
          // Layer 2 (radial luminance, square-ish images only) — center brighter
          // than edges → 'spiralIn' (climax at center: Kandinsky, Klimt, mandala);
          // edges brighter → 'spiralOut' (radiation: Kusama, Pollock); ~equal → 'lr'.
          // Uses Rec.709 luminance and 15% relative threshold. Fresh detect on
          // every new image; a manual chip tap after load overrides just for that
          // image (the next load auto-detects again).
          (()=>{
            try{
              const _iw = img.naturalWidth || 1;
              const _ih = img.naturalHeight || 1;
              const _r = _iw / _ih;
              let _dir = 'lr';
              if(_r >= 1.3)       _dir = 'lr';
              else if(_r <= 0.77) _dir = 'vert';
              else {
                const _cx = nc/2, _cy = nr/2;
                const _maxR = Math.min(nc, nr) / 2;
                const _inR2  = (_maxR * 0.30) * (_maxR * 0.30);
                const _outR2 = (_maxR * 0.60) * (_maxR * 0.60);
                let _cSum=0, _cN=0, _eSum=0, _eN=0;
                for(let y=0; y<nr; y++){
                  const _dy = y - _cy;
                  for(let x=0; x<nc; x++){
                    const _dx = x - _cx;
                    const _d2 = _dx*_dx + _dy*_dy;
                    const _i = (y*nc + x) * 4;
                    const _l = 0.2126*raw[_i] + 0.7152*raw[_i+1] + 0.0722*raw[_i+2];
                    if(_d2 <= _inR2){ _cSum += _l; _cN++; }
                    else if(_d2 >= _outR2){ _eSum += _l; _eN++; }
                  }
                }
                const _cAvg = _cN ? _cSum/_cN : 0;
                const _eAvg = _eN ? _eSum/_eN : 0;
                if(_cAvg > _eAvg * 1.15)      _dir = 'spiralIn';
                else if(_eAvg > _cAvg * 1.15) _dir = 'spiralOut';
                else                          _dir = 'lr';
              }
              setImgDir(_dir);
            }catch(_){/* fall back to whatever imgDir already is */}
          })();
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
          const autoMode = vividPct < 5 ? 'bw' : 'kontra';   // <5% colour ⇒ monochrome reading; colourful ⇒ Kontra (painter's reading) as the image default
          // Hear image (Music → Image bridge): the user already has a palette
          // chosen in Music; carry it across instead of overriding with the
          // image auto-pick (which would snap Harmony → Kontra on every cross).
          // A genuinely fresh image (not from Music) still gets the auto read.
          const _fromMusic = _imageFromMusicRef.current === true;
          appModeRef.current = _fromMusic ? mode : autoMode; // remember the app's pick for Custom→back
          setSetupNoSel(false);                      // a fresh image re-enables the app's colour pick
          // Keep a manual Custom choice if the user already had it; otherwise apply
          // the app's pick. (spectral/other non-image modes fall back to autoMode.)
          // When arriving from Music, keep the current palette verbatim.
          const startMode = _fromMusic ? mode : (mode==='custom' ? 'custom' : autoMode);
          kontraAutoRef.current = (!_fromMusic && startMode==='kontra'); // auto-kontra only on a fresh image, never when palette carried from Music
          if(startMode!==mode) setMode(startMode);
          pixelRef.current={nc,nr,px,lastMode:startMode,colStep:4};
          scanPixelBackupRef.current=pixelRef.current; // keep scan data for Clear after a compose nulls pixelRef
          imgComposeRef.current=false;
          setImgPlayMode('scan'); imgPlayModeRef.current='scan'; // a fresh image always starts in scan
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
            : startMode==='spectral' ? SPEC_HUE
            : startMode==='phi' ? PHI_HUE
            : startMode==='kontra' ? KONTRA_HUE
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
          setImgPlayMode('scan'); imgPlayModeRef.current='scan';
          setOriginalImgUrl(evt.target.result);
          setGrid({N:nc,BW,BH,CW:nc*BW,CH:nr*BH});setViewMode('image');
          setChords(evts);setDisp(evts.length);setPlayedOnce(false);
          // Real duration now varies per image (tempo scales with the painting's
          // energy), so derive it from the last event's timing rather than the
          // old fixed 2:00 constant.
          const lastEv=evts[evts.length-1];
          const realDurMs=lastEv ? (lastEv.startMs + (lastEv.n?.[0]?.durMs||0)) : IMG_TARGET_MS;
          // Filename as title — but skip auto-generated junk names (GUIDs like
          // 964FA674-3FA9-40D8-..., long hex blobs, camera codes like IMG_2317,
          // pure numbers) which look ugly in the transport. For those, show no
          // title; the AI compose path will set its own evocative title anyway.
          const _rawName=file.name.replace(/\.[^.]+$/,'');
          const _isJunkName = !_rawName
            || /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(_rawName) // GUID
            || /^[0-9a-fA-F]{16,}$/.test(_rawName.replace(/[-_]/g,''))                                        // long hex blob
            || /^(IMG|DSC|PXL|Screenshot|image|photo)[-_ ]?\d+$/i.test(_rawName)                              // camera/auto codes
            || /^\d{6,}$/.test(_rawName);                                                                      // pure long number
          const _imgTitle = _isJunkName ? '' : _rawName;
          setInfo({title:_imgTitle,count:evts.length,dur:Math.round(realDurMs/1000)});
          // New piece → reset the save name to THIS image's filename so the SAVE
          // picker doesn't carry a stale name from a previous mood/piece.
          setCompositionName(_imgTitle); setRecordingName('');
          // New image is a fresh piece → drop any prior recording so the
          // transport shows REC (record this one), not a stale SAVE button.
          setRecBlob(null); setRecName(''); setAudioShareMsg(null); setAudioSideImage(null); setAudioRowOpen(false);
          idxRef.current=evts.length;setStamp(s=>s+1);
          setPlaybackSpeed(1);playbackSpeedRef.current=1;
          setAtmoOn(false);setAtmoMood(null);
          setMelodyOn(false);setMelodyData(null);
          setLoadedSource('image');
          setPickMode(null);
          // Lite image mode (painting → music): start playing immediately so it
          // behaves like the music flavour's Liszt auto-play — no manual Play tap.
          if(basicModeRef.current && liteImageModeRef.current){
            try{ setMuted(false); }catch(_){}
            try{ setRecBlob(null); setRecName(''); setRecordIntent('picker'); }catch(_){}
            setTimeout(()=>{ try{ wakeAudio().then(()=>{ try{ startRecordRef.current?.(); }catch(_){} }).catch(()=>{ try{ startRecordRef.current?.(); }catch(_){} }); }catch(_){ try{ startRecordRef.current?.(); }catch(__){} } }, 160);
          }
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
    if(restoringRef.current)return; // multi-draft restore in progress — keep the stashed chords/disp
    // Use mode+palette+direction signature so swapping individual swatches in
    // custom mode, OR changing the reading direction, forces a re-transcribe.
    const sig = mode + '|' + imgDir + ((atmoOn&&atmoMood) ? '|atmo'+atmoMood.v.toFixed(2)+'_'+atmoMood.e.toFixed(2) : '') + (mode==='custom' ? '|' + activePalette.join(',') : '') + ((melodyOn&&melodyData) ? '|mel'+(melodyData.notes?melodyData.notes.length:0)+'_'+(melodyData.tempo||0) : '|nomel');
    if(pixelRef.current.lastSig===sig)return;
    // Did the READING DIRECTION change (vs just palette/mode/atmo)? A direction
    // change re-orders the scan, so playback must restart from the top rather
    // than resume mid-stream (resuming would jump to an unrelated cell). A
    // palette/mode change keeps the same order and resumes seamlessly.
    const _dirChanged = pixelRef.current.lastDir !== undefined && pixelRef.current.lastDir !== imgDir;
    pixelRef.current.lastDir=imgDir;
    pixelRef.current.lastSig=sig;
    pixelRef.current.lastMode=mode;
    const{nc,nr,px}=pixelRef.current;
    const hueTable = mode==='custom'
      ? Object.assign(activePalette.map(hex => { const [r,g,b]=hexToRgb(hex); return toHsl(r,g,b)[0]; }),
                      { __sats: activePalette.map(hex=>{ const [r,g,b]=hexToRgb(hex); return toHsl(r,g,b)[1]; }),
                        __hasNeutral: activePalette.some(hex=>{ const [r,g,b]=hexToRgb(hex); return toHsl(r,g,b)[1] < 12; }) })
      : mode==='spectral' ? SPEC_HUE
      : mode==='phi' ? PHI_HUE
      : mode==='kontra' ? KONTRA_HUE
      : COF;
    const _atmoBias=(atmoOn&&atmoMood)?{v:atmoMood.v,e:atmoMood.e}:null;
    const _evtsLit=pixelsToImageEvents(px,nc,nr,hueTable,mode,imgDirRef.current,_atmoBias);
    const _evtsAtmo=(atmoOn&&atmoMood)?_atmoTransform(_evtsLit,atmoMood,true):_evtsLit;
    // MELODY stays a separate voice: the texture in chordsRef is never altered by it
    // (the sung line is computed and scheduled in parallel by startPlay), so the
    // events here are always just the texture.
    const evts=_evtsAtmo;
    // Changing the colour mode re-transcribes the SAME painting through a new
    // hue→pitch table, so the notes change but the structure/length do not. If a
    // playback is in progress we must NOT stop it — like MIDI and live drawing,
    // the colour change should flow on seamlessly from the current position, just
    // in different tones. We capture where we are, swap in the new chords, and
    // resume playback from that same index. Only when stopped do we reset to the
    // top (ready to play from the start in the new colour).
    if(playingRef.current){
      // Direction change → re-ordered scan → restart from the top so the mosaic
      // and audio build cleanly in the new order (resuming mid-stream would land
      // on an unrelated cell).
      if(_dirChanged){
        setChords(evts);chordsRef.current=evts;
        setDisp(0);
        resumeFromRef.current=0;
        setStamp(s=>s+1);
        try{ startPlayRef.current?.({dirRestart:true}); }catch(_){}
      }
      // Texture swaps live as before. But the MELODY voice is scheduled once at
      // startPlay (parallel timers), so a melody on/off toggle MID-PLAYBACK must
      // re-arm it: restart from the current position. _melodyTogglePlayingRef is
      // set true by the chip handler only when it flips melody during playback, so
      // a plain colour change still swaps seamlessly without a restart.
      else if(_melodyTogglePlayingRef.current){
        _melodyTogglePlayingRef.current=false;
        const keep=Math.min(dispRef.current||0, evts.length);
        setChords(evts);chordsRef.current=evts;
        resumeFromRef.current=keep;
        setStamp(s=>s+1);
        try{ startPlayRef.current?.({melodyRearm:true}); }catch(_){}
      } else {
        // Playback loop reads chords live from chordsRef each step, so swapping in
        // the re-transcribed notes is enough — next step plays the new colour's
        // tones from the same position. No restart, no stutter.
        setChords(evts);chordsRef.current=evts;
        setStamp(s=>s+1);
      }
    }else if(holdPausedRef.current){
      // Paused mid-piece: swap in the new colour's notes but KEEP the position so
      // pressing Resume continues from where it was, now in the new tones. Don't
      // restart playback (still paused) and don't reset disp to the end.
      // EXCEPT a direction change re-orders the scan — keeping the old position
      // would resume on an unrelated cell, so reset to the top.
      const keep=_dirChanged ? 0 : Math.min(dispRef.current||0, evts.length);
      setChords(evts);chordsRef.current=evts;
      setDisp(keep);setStamp(s=>s+1);
      resumeFromRef.current=keep;
    }else{
      // Stopped / finished: a palette OR direction change re-transcribes and the
      // blocks should clear back to the bare photo, ready to Play (re-scan) from
      // the top — rather than instantly repainting the whole mosaic in the new
      // palette. Reset disp to 0 and playedOnce to false so the gate above falls
      // through to the clean-photo state until the next Play.
      stopAll();
      setChords(evts);chordsRef.current=evts;
      setDisp(0);
      idxRef.current=0;
      resumeFromRef.current=null;
      setPlayedOnce(false);
      setStamp(s=>s+1);
    }
  },[mode,viewMode,stopAll,activePalette,imgDir,atmoOn,atmoMood,melodyOn,melodyData]);

  const loadSampleImage=useCallback(async()=>{
    try{
      // Lazy-fetch the built-in sample image from /public, build a File, feed it
      // through the normal image pipeline. (Was ~678KB of inlined base64.)
      const blob=await (await fetch(SAMPLE_IMAGE_B64_URL)).blob();
      const file=new File([blob],'The Starry Night — Van Gogh.jpg',{type:'image/jpeg'});
      const fakeEvent={target:{files:[file],value:''}};
      loadImage(fakeEvent);
    }catch(e){setErr('Sample image: '+(e&&e.message||'load failed'));setErrInfo(false);}
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
      const _langName=({EN:'English',DE:'German',FR:'French',ES:'Spanish',PT:'Portuguese',SK:'Slovak',zh:'Simplified Chinese',zhTW:'Traditional Chinese',ja:'Japanese'}[lang])||'English';
      const prompt=
'You are judging the EMOTION / atmosphere of a single image. Output ONLY one JSON object, no prose: {"valence":NUMBER,"energy":NUMBER,"title":"..."}.\n'+
'valence: -1 (sad/dark/heavy) ... 0 (neutral) ... +1 (happy/bright/playful).\n'+
'energy:   0 (calm/still/dreamy) ... 0.5 (moderate) ... 1 (intense/dramatic/turbulent).\n'+
'CRITICAL: COMMIT to a strong reading. The MIDDLE band (0.40-0.60) is reserved for genuinely ambiguous scenes only. If the scene is clearly calm, output energy <= 0.20; if clearly serene/dreamy/quiet, energy <= 0.15. If clearly intense/dramatic/stormy, energy >= 0.80; if frantic/violent, energy >= 0.90. Same for valence: clearly sad/heavy <= -0.50; clearly joyful/bright >= +0.50.\n'+
'Anchored examples (use as a guide for the strength of your numbers):\n'+
'  A serene Monet pond at dawn          -> {"valence": 0.40, "energy": 0.10}\n'+
'  A melancholic rainy street           -> {"valence": -0.55, "energy": 0.20}\n'+
'  A bright sunny field, kids playing   -> {"valence": 0.85, "energy": 0.65}\n'+
'  A stormy Turner seascape             -> {"valence": -0.20, "energy": 0.90}\n'+
'  A neutral architectural drawing      -> {"valence": 0.05, "energy": 0.30}\n'+
'Avoid the safe centre. Two different paintings MUST yield audibly different numbers.\n'+
'title: short mood phrase in '+_langName+' (max 4 words, Title Case).';
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



  const lastStartPlayRef = useRef(0);
  const startPlay=useCallback(async (opts)=>{
    const _melodyRearm = !!(opts && opts.melodyRearm);
    const _dirRestart = !!(opts && opts.dirRestart);
    const now=Date.now();
    // Skip the double-fire debounce when this call is a melody re-arm (the rebuild
    // effect restarting the voice from the current position) — that legitimately
    // fires right after the original Play, and must not be swallowed, or turning
    // MELODY on mid-playback would silently do nothing. Same for a direction
    // restart: changing the scan direction during playback re-fires startPlay
    // immediately to relaunch from the top, and the debounce would swallow it.
    if(!_melodyRearm && !_dirRestart && now-lastStartPlayRef.current<300){return;} // debounce double-fire (iOS touch+click)
    lastStartPlayRef.current=now;
    // Gentle in-gesture audio wake: just make sure the context is running. The
    // heavier disconnect/rebuild/restart recovery was destabilising audio across
    // all modes, so it's been removed from here.
    try{ const ac=Tone.getContext().rawContext; if(ac && ac.state!=='running') ac.resume(); }catch(_){}
    // Image AI-Compose mode: a FRESH Play (not a resume) that hasn't composed yet
    // hands off to aiComposeFromImage — it composes (or replays the cached piece)
    // and starts playback itself, with the original image kept on the canvas.
    // Once a composition is loaded (imgComposeRef true) we fall through to normal
    // playback so Pause/Resume/replay just play the composed piece.
    if(viewModeRef.current==='image' && imgPlayModeRef.current==='compose'
       && !imgComposeRef.current
       && (resumeFromRef.current==null || resumeFromRef.current===0)){
      try{ aiComposeFromImage(); }catch(_){}
      return;
    }
    const chords=chordsRef.current;
    const grid=gridRef.current;
    const info=infoRef.current;
    const viewMode=viewModeRef.current;
    if((busy && !_melodyRearm && !_dirRestart)||!chords.length)return;
    // Await unlock so the AudioContext is guaranteed 'running' before we
    // schedule anything against Tone.now(). Without this, the first chord can
    // land silent — Tone.now() is frozen while the context is suspended, so
    // triggerAttackRelease() queues at a stale time and the event is lost when
    // the context catches up. The 500ms safety cap in unlockAudio means this
    // can never deadlock Play even if the context never resumes.
    await unlockAudio();
    // Silent sampler warm-up: an idle Tone.Sampler on iOS exhibits ~30ms
    // cold-start latency on the first triggerAttackRelease — the sample buffer
    // gets touched and the gain envelope spun up before the note actually
    // sounds. We fire one inaudible trigger (gain≈0, duration 1ms) right after
    // unlock so the audio pipeline is hot by the time the first real note
    // arrives ~tens of ms later in step(). Combined with the shorter lookAhead
    // in unlockAudio, this brings audio onset within ~10ms of canvas paint —
    // imperceptible to the ear.
    try{
      if(samplerOk.current && samplerRef.current){
        samplerRef.current.triggerAttackRelease('C4', 0.001, Tone.now(), 0.0001);
      }
    }catch(_){}
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
      if(randomModeRef.current){
        setStructureSeedLock(null);
        nextRollInProgressRef.current = true;
        // Manual artist → rotate style. Shuffle (no manual artist) → rotate
        // artist + roll a fresh random style for that new artist.
        if(style){ _diceRoll(); }
        else { _diceRoll(); }
        // (both branches roll the dice; _diceRoll handles manual-artist vs shuffle)
      }
      else { saltHistoryRef.current=[0]; saltIdxRef.current=0; setRndSalt(0); setVariationPos(0); }
    }
    stopAll();if(!isResume)setDisp(0);setPlaying(true);
    // Collapse the Color·Style strip when a FRESH Play starts, so the canvas gets
    // full focus. Only on fresh Play (not resume): the user can re-open the strip
    // during playback to change colour/style, and we must NOT yank it shut again —
    // nothing here closes it mid-play, so it stays open until the next fresh Play.
    if(!isResume && !keepStripOpenRef.current) setStripOpen(false);
    keepStripOpenRef.current=false;
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

    // Mic with Original source selected: route the recorded blob to the
    // speakers, mute the sampler for this playthrough, paint visually as
    // usual. Falls back to piano if anything in the decode/source path failed.
    // Both `listen` (Music) and `sing` (Voice) record an original audio buffer.
    const useOriginalListen = (draftOwnerRef.current==='listen' || draftOwnerRef.current==='sing') && playSourceMicRef.current==='original' && listenPCMRef.current;
    if(useOriginalListen){
      try{
        const ac=Tone.getContext().rawContext;
        // Belt and braces — kill any orphan source (with its onended detached
        // so it can't reset our flag asynchronously).
        if(originalSourceRef.current){
          const prev=originalSourceRef.current;
          try{prev.onended=null;}catch(_){}
          try{prev.stop();}catch(_){}
          try{prev.disconnect();}catch(_){}
          originalSourceRef.current=null;
        }
        const src=ac.createBufferSource();
        src.buffer=listenPCMRef.current;
        src.playbackRate.value=playbackSpeedRef.current;
        const g=ac.createGain();g.gain.value=mutedRef.current?0:1;src.connect(g);g.connect(ac.destination);src._muteGain=g;
        const offsetSec=fromIdx>0&&chords[fromIdx]?(chords[fromIdx].startMs||0)/1000:0;
        src.start(0,offsetSec);
        originalSourceRef.current=src;
        originalPlaybackRef.current=true;
        // Guarded onended: only reset if THIS source is still the current one.
        // Prevents an old stop event from clearing the flag set by a new source.
        src.onended=()=>{
          if(originalSourceRef.current===src){
            originalSourceRef.current=null;
            originalPlaybackRef.current=false;
          }
        };
      }catch(_){ originalPlaybackRef.current=false; }
    } else {
      // Ensure no stale audio is left from a previous play; cancel any flag.
      if(originalSourceRef.current){
        const prev=originalSourceRef.current;
        try{prev.onended=null;}catch(_){}
        try{prev.stop();}catch(_){}
        try{prev.disconnect();}catch(_){}
        originalSourceRef.current=null;
      }
      originalPlaybackRef.current=false;
    }

    if(viewMode==='image'&&pixelRef.current){
      const{nc,nr,px}=pixelRef.current,{BW,BH,CW,CH}=grid,cv=canvasRef.current,ctx=cv?.getContext('2d'),gen=genRef.current;
      if(ctx&&fromIdx===0){ctx.fillStyle='#04040a';ctx.fillRect(0,0,CW,CH);}
      let i=fromIdx;
      const CHORD_SIZE=4;
      const colStep=pixelRef.current.colStep||1;
      const effCols=Math.ceil(nc/colStep);
      // MELODY dynamic tempo — DRIVEN BY THE IMAGE. With MELODY on we leave the
      // rigid grid and let each part of the painting set its own pace: vivid,
      // saturated, energetic regions push FORWARD (shorter steps); dark, calm,
      // sparse regions BREATHE (longer steps). So the music speeds up and slows
      // down with the picture — real dynamics, not a flat pulse. The whole curve
      // is normalized so the AVERAGE step stays ≈150ms (the familiar feel), the
      // variation just rides on top. Lead (melody) events inherit the local pace.
      // Precompute a per-event step (ms) array aligned to chordsRef indices.
      const _computeMelSteps=(src)=>{
        const raw=new Array(src.length).fill(150);
        if(!melodyOnRef.current) return raw;
        // "Liveliness" per event from real image data the scan already carries:
        //   _chroma (0..1) colour saturation/vibrancy of the cell,
        //   note velocity (chroma-derived energy), and note count (motif density).
        const live=new Array(src.length).fill(0.5);
        for(let k=0;k<src.length;k++){
          const e=src[k]; if(!e) continue;
          const ch=typeof e._chroma==='number'?Math.max(0,Math.min(1,e._chroma)):0.4;
          const ns=e.n||[];
          let vAvg=0; for(const nn of ns) vAvg+=(nn.v||60); vAvg=ns.length?vAvg/ns.length:60;
          const vNorm=Math.max(0,Math.min(1,(vAvg-38)/68));   // back out the 38+68·chroma mapping
          const dens=Math.max(0,Math.min(1,(ns.length-1)/4)); // 1 note→0, 5+→1
          // Weighted vibrancy. Chroma leads (colour), energy and density support.
          live[k]=Math.max(0,Math.min(1, 0.55*ch + 0.30*vNorm + 0.15*dens));
        }
        // Map liveliness → step. Calmer, more musical range: vivid (1) → 150ms,
        // calm (0) → 300ms. The old 85ms floor turned saturated full-colour images
        // into a machine-gun; a 150ms floor keeps even vibrant scans listenable,
        // and dynamics still read because the smoothstep preserves contrast.
        const FAST=150, SLOW=300;
        for(let k=0;k<src.length;k++){
          const L=live[k];
          const e2=L*L*(3-2*L);                       // smoothstep — read dynamics clearly
          raw[k]=SLOW-(SLOW-FAST)*e2;
        }
        // Normalize so the MEAN step ≈195ms — a calmer overall pace than the old
        // 150ms, so the painting breathes as a piece of music rather than a salvo;
        // dynamics ride on top regardless of how vivid/dark the image is.
        let sum=0,cnt=0; for(let k=0;k<raw.length;k++){ if(src[k]){ sum+=raw[k]; cnt++; } }
        const mean=cnt?sum/cnt:195;
        const norm=mean>0?195/mean:1;
        for(let k=0;k<raw.length;k++){ raw[k]=Math.max(120,Math.min(520,raw[k]*norm)); }
        return raw;
      };
      let _melSteps=_computeMelSteps(chordsRef.current||[]);
      let _melStepsLen=(chordsRef.current||[]).length;
      let _melStepsOn=melodyOnRef.current;
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
              ctx.fillStyle=`rgba(${p.r},${p.g},${p.b},0.42)`;ctx.fillRect(col*BW-1,row*BH-1,BW+2,BH+2);
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
            // PIANO TECHNIQUE: TREMOLO. A chord flagged _tremolo (a long merged
            // plane, _runLen ≥ 16) is kept alive by RE-STRIKING it across its
            // held span instead of letting one attack decay into silence. We
            // split the real (speed-scaled) held duration into segments of
            // ~_tremoloMs and re-attack every note at each segment boundary, each
            // re-strike lasting one segment. Velocity dips slightly on the
            // re-strikes so the first attack still leads. Honours playbackSpeed
            // and the global pushTimer cleanup (so stopping playback cancels it).
            const _trem=liveChords[i]._tremolo===true;
            if(_trem){
              const lc=liveChords[i];
              const gesture=lc._planeGesture||'arc';
              const gap0=Math.max(85, Math.round((lc._tremoloMs||180)/playbackSpeedRef.current));
              const fullSpan=Math.round((notes[0]?.durMs||300)*durMul/playbackSpeedRef.current);
              // The hold UNFOLDS an internal arc rather than repeating one gesture:
              //   • tempo glides from gap0 → gap0*endRatio (accel if <1, rit if >1)
              //   • the top voice periodically lifts by _tremLift semitones and falls
              //     back — a slow shimmer of register across the held plane
              //   • loudness breathes (swell) so the field never sits flat
              //   • a DETERMINISTIC pseudo-random jitter (seeded from the block, so
              //     identical for the same image) nudges every re-strike's timing,
              //     loudness and register, and occasionally drops or doubles a hit,
              //     so a big plane never settles into an audible repeating pattern.
              // CRITICAL: each re-strike uses a SHORT tail (tailScale) so the
              // attacks stay distinct — the full 1.5 s resonance would smear every
              // re-strike into one held cloud (which is why a plain tremolo sounded
              // like nothing changed).
              const endRatio=Math.max(0.5, Math.min(1.8, lc._tremEndRatio||1));
              const lift=lc._tremLift||0;             // semitone lift of top voice (0/7/12)
              const liftCycles=Math.max(1, lc._tremLiftCycles||1);
              const swell=Math.max(0, Math.min(0.5, lc._tremSwell!=null?lc._tremSwell:0.25));
              const rolled=(gesture==='roll');
              const rollStep=Math.max(12, Math.round(26/playbackSpeedRef.current));
              // Deterministic PRNG (mulberry32) seeded from the block — same image →
              // same "random" field, but no audible repeating cycle.
              let _seed=(lc._tremSeed>>>0)||0x9e3779b9;
              const rnd=()=>{ _seed|=0; _seed=_seed+0x6D2B79F5|0; let tt=Math.imul(_seed^_seed>>>15,1|_seed); tt=tt+Math.imul(tt^tt>>>7,61|tt)^tt; return ((tt^tt>>>14)>>>0)/4294967296; };
              let topM=-Infinity; for(const n of notes){ if(n.m>topM) topM=n.m; }
              // Scale-ish neighbour lifts the jitter can pick for the top voice so
              // an occasional re-strike "colours" to an adjacent tone, not just the
              // fixed octave/fifth — adds melodic life over a flat field.
              const lifts=[0,0,0,lift||7,7,12,5,-5,3];
              let t=0, r=0;
              const maxReps=120;
              while(t < fullSpan-20 && r < maxReps){
                const prog = fullSpan>0 ? t/fullSpan : 0;         // 0..1 across the hold
                // Gliding base tempo + per-strike timing jitter (±28%).
                const gGlide = gap0*(1 + (endRatio-1)*prog);
                const jitT = 0.72 + 0.56*rnd();                   // 0.72..1.28
                const gNow = Math.max(70, Math.round(gGlide*jitT));
                const segDur = Math.max(95, Math.round(gNow*1.35));
                // Occasionally skip a strike (a breath) — more likely mid-hold,
                // never the very first strike. ~12% chance.
                const skip = (r>0 && rnd()<0.12);
                if(!skip){
                  // Swell envelope + loudness jitter (±18%).
                  const env = (1 - swell*0.5 + swell*Math.sin(Math.PI*prog)) * (0.82+0.36*rnd());
                  // Register shimmer: smooth cycle OR an occasional random lift pick.
                  const cyclePhase = lift>0 ? (Math.sin(Math.PI*liftCycles*prog) > 0.55) : false;
                  const randLift = (rnd()<0.22) ? lifts[(rnd()*lifts.length)|0] : 0;
                  const topShift = cyclePhase ? lift : randLift;
                  const baseVel = r===0?1:(rolled?0.7:0.78);
                  const tAt=t;
                  // tail short for re-strikes so attacks read; first hit a touch longer.
                  const tail = r===0?0.4:0.14;
                  const order = rolled ? [...notes].sort((a,b)=>a.m-b.m) : notes;
                  // rolled step itself jitters slightly so the arpeggio isn't a metronome.
                  const rs = rolled ? Math.max(8, Math.round(rollStep*(0.7+0.6*rnd()))) : 0;
                  order.forEach((n,vi)=>{
                    const isTop = n.m===topM;
                    const mPlay = (isTop && topShift) ? n.m+topShift : n.m;
                    const vv = Math.max(12, Math.round((n.v||64)*velScale*baseVel*env));
                    const at = Math.round(tAt + (rolled?vi*rs:0));
                    if(at<=0){ try{ playNote(mPlay,vv,segDur,tail); }catch(_){} }
                    else { pushTimer(()=>{ try{ playNote(mPlay,vv,segDur,tail); }catch(_){}}, at); }
                  });
                  // Occasional grace double-strike on the top voice (a flutter) — rare.
                  if(rnd()<0.08 && topM>-Infinity){
                    const gAt=Math.round(t+gNow*0.45);
                    const gv=Math.max(12,Math.round((notes.find(n=>n.m===topM)?.v||64)*velScale*0.5));
                    pushTimer(()=>{ try{ playNote(topM,gv,Math.round(segDur*0.6),0.1); }catch(_){}}, gAt);
                  }
                }
                t += gNow;
                r++;
              }
              const tmid=notes.map(({m})=>({m,scaledDur:fullSpan}));
              setActive(p=>{const s=new Set(p);for(const x of tmid)s.add(x.m);return s;});
              pushTimer(()=>setActive(p=>{const s=new Set(p);tmid.forEach(x=>s.delete(x.m));return s;}),fullSpan);
              const wrap=kbScrollRef.current;
              if(wrap){
                const xs=notes.map(({m})=>midiToKeyX(m)).filter(x=>x!=null);
                if(xs.length){
                  const cx=xs.reduce((a,b)=>a+b,0)/xs.length;
                  const target=Math.max(0,cx - wrap.clientWidth/2 + 13);
                  wrap.scrollTo({left:target,behavior:Math.abs(target-wrap.scrollLeft)>200?'instant':'smooth'});
                }
              }
              setDisp(i+1); i++;
              {
                let _gapMs2;
                if(melodyOnRef.current !== _melStepsOn || liveChords.length !== _melStepsLen){
                  _melSteps=_computeMelSteps(liveChords);
                  _melStepsLen=liveChords.length;
                  _melStepsOn=melodyOnRef.current;
                }
                if(melodyOnRef.current && _melSteps && _melSteps.length){
                  _gapMs2 = Math.max(8, Math.min(1400, _melSteps[i-1] || 150));
                } else {
                  const _prev2 = liveChords[i-1];
                  const _cur2  = liveChords[i];
                  if(_prev2 && _prev2._stepMs){
                    _gapMs2 = _prev2._stepMs;
                  } else if(_prev2 && _cur2 && typeof _prev2.startMs==='number' && typeof _cur2.startMs==='number' && _cur2.startMs>_prev2.startMs){
                    _gapMs2 = Math.max(40, Math.min(2000, _cur2.startMs - _prev2.startMs));
                  } else {
                    _gapMs2 = 150;
                  }
                }
                pushTimer(step, Math.round(_gapMs2/playbackSpeedRef.current));
              }
              return;
            }
            // Per-note onset offset (offsetMs) supports piano techniques: arpeggio,
            // tied notes, voice-specific timing. If absent or 0, fires immediately
            // (identical to previous block-chord behaviour). When >0, schedules the
            // playNote via setTimeout so the player honours the per-note timing.
            const midis=notes.map(({m,v,durMs,offsetMs})=>{
              const scaledDur=Math.round(durMs*durMul/playbackSpeedRef.current);
              const _off=(typeof offsetMs==='number' && offsetMs>0)
                ? Math.max(0, Math.round(offsetMs/playbackSpeedRef.current))
                : 0;
              if(_off>0){
                pushTimer(()=>{ try{ playNote(m,Math.round(v*velScale),scaledDur); }catch(_){}}, _off);
              } else {
                playNote(m,Math.round(v*velScale),scaledDur);
              }
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
        // Step interval. Two modes:
        //  • Normal scan: the fixed per-event agogic step (or 150ms fallback) —
        //    the familiar scan pulse.
        //  • MELODY on: BREAK the scan grid. Schedule each event by its REAL
        //    startMs gap (event[i].startMs − event[i-1].startMs), so texture +
        //    the sung lead both play on the true timeline. This stops the texture
        //    from marching in a rigid 150ms grid and lets the melody's own-clock
        //    notes land where they belong — a flowing line instead of ticks
        //    sprinkled between grid steps. Gap clamped to keep it sane.
        let _gapMs;
        // Recompute the per-event tempo curve if the live chords changed length or
        // MELODY was toggled mid-playback (colour swap / melody on/off). Cheap: only
        // on actual change, not every step.
        if(melodyOnRef.current !== _melStepsOn || liveChords.length !== _melStepsLen){
          _melSteps=_computeMelSteps(liveChords);
          _melStepsLen=liveChords.length;
          _melStepsOn=melodyOnRef.current;
        }
        if(melodyOnRef.current && _melSteps && _melSteps.length){
          // Image-driven dynamic pace: the step that just elapsed (event i-1)
          // determines the wait to the next. Vivid passages rush, calm ones
          // breathe — the painting conducts the tempo. Mean stays ≈150ms.
          _gapMs = Math.max(8, Math.min(1400, _melSteps[i-1] || 150));
        } else {
          // Prefer the chord's own _stepMs (image-scan native pace). When absent
          // — e.g. a parsed MIDI, including a See music bake whose chords carry
          // real startMs from groupToEvents — derive the gap from the actual
          // timeline: the delta between this chord's startMs and the previous
          // one. Without this the loop falls back to a flat 150ms tick, which
          // crushes a piece whose chords are spread over tens of seconds into a
          // 2-5× too-fast playback. Clamp to a sane range. Only the 150ms literal
          // remains as a last resort when neither field exists.
          const _prev = liveChords[i-1];
          const _cur  = liveChords[i];
          if(_prev && _prev._stepMs){
            _gapMs = _prev._stepMs;
          } else if(_prev && _cur && typeof _prev.startMs==='number' && typeof _cur.startMs==='number' && _cur.startMs>_prev.startMs){
            _gapMs = Math.max(40, Math.min(2000, _cur.startMs - _prev.startMs));
          } else {
            _gapMs = 150;
          }
        }
        timers.current.push(setTimeout(step,Math.round(_gapMs/playbackSpeedRef.current)));
      };
      // ── Parallel MELODY voice ────────────────────────────────────────────────
      // The sung line is NOT in chordsRef (texture stays clean). Schedule it on its
      // own timers, in parallel with the texture step-loop above, so it flows as a
      // second voice over the (dynamically-paced) painting. Each voice note's `pos`
      // (0..1) maps onto the texture's REAL total duration — computed from the same
      // _melSteps tempo curve — so the melody lands correctly however the dynamic
      // tempo stretches the timeline. Timers go into timers.current, so Stop/Pause/
      // Clear (which clear that array + bump genRef) tear the voice down cleanly.
      // Compute the voice DIRECTLY from the live texture + melody data here. This
      // guarantees: MELODY on → the line plays; MELODY off → nothing is scheduled.
      // No race with the rebuild effect.
      if(melodyOnRef.current && melodyDataRef.current){
        let voice=[];
        try{ const _atmoForMel=(atmoOnRef.current&&atmoMoodRef.current)?atmoMoodRef.current:null; const _mv=_melodyVoice(chordsRef.current||[], melodyDataRef.current, _atmoForMel); voice=(_mv&&_mv.voice)||[]; }catch(_){ voice=[]; }
        if(voice.length){
          // Real total duration of the texture at the current dynamic tempo, from
          // the not-yet-elapsed portion (so a resume mid-piece still lines up).
          let totalMs=0;
          for(let k=Math.max(1,fromIdx);k<(_melSteps?_melSteps.length:0);k++){ totalMs += (_melSteps[k]||150); }
          if(totalMs<=0){ totalMs = (chordsRef.current.length||1)*150; }
          const startedAtFrac = (_melSteps&&_melSteps.length)
            ? (fromIdx>0 ? Math.min(1, fromIdx/_melSteps.length) : 0) : 0;
          const voiceGen = genRef.current;
          const voiceGen2 = melodyVoiceGenRef.current;
          for(const mn of voice){
            // Skip notes already passed when resuming from the middle.
            if(mn.pos < startedAtFrac) continue;
            const relPos = (mn.pos - startedAtFrac) / Math.max(1e-6, (1 - startedAtFrac));
            const atMs = Math.round((relPos * totalMs) / playbackSpeedRef.current);
            const durMs = Math.max(300, Math.round((mn.durFrac||0.01) * totalMs));
            const id = setTimeout(()=>{
              if(genRef.current!==voiceGen) return;          // stopped → don't sound
              if(melodyVoiceGenRef.current!==voiceGen2) return; // melody switched off → silence
              if(!melodyOnRef.current) return;                // belt-and-braces: off → silent
              try{
                playNote(mn.m, mn.v, Math.round(durMs/playbackSpeedRef.current));
                setActive(p=>{const s=new Set(p); s.add(mn.m); return s;});
                pushTimer(()=>setActive(p=>{const s=new Set(p); s.delete(mn.m); return s;}), Math.min(900, Math.round(durMs/playbackSpeedRef.current)));
              }catch(_){}
            }, atMs);
            timers.current.push(id);
          }
        }
      }
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
            if(viewMode!=='audio' && !originalPlaybackRef.current) playNote(m,v,scaledDur);
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
  },[busy,playNote,stopAll,advanceVariation,aiComposeFromImage]);


  // Load the demo song (Für Elise) and start painting it live. Shared by the
  // reel's opening beat. Does NOT schedule the rest of the tour.
  // ── BASIC mode helpers ────────────────────────────────────────────────────
  // Expressive, painterly styles for the Surprise feature. On the free tier we
  // narrow to the ones that are actually unlocked.
  const EXPRESSIVE_POOL = useMemo(()=>{
    const base = ['picasso','pollock','kandinsky','mitchell','gold','kusama','bloom','miro','monet','matisse'];
    const pool = (proStatus === 'free') ? base.filter(k => FREE_UNLOCKED_KEYS.has(k)) : base;
    return pool.length ? pool : ['picasso'];
  }, [proStatus, FREE_UNLOCKED_KEYS]);

  // Pick a random expressive style, make sure it's in the active set, select it.
  const pickExpressiveStyle = useCallback(()=>{
    const pool = EXPRESSIVE_POOL;
    const k = pool[Math.floor(Math.random()*pool.length)] || 'picasso';
    setSetupArtists(prev => prev.includes(k) ? prev : [...prev, k]);
    setRandomMode(false); randomModeRef.current=false;
    setStyle(k);
    return k;
  },[EXPRESSIVE_POOL]);

  // "Surprise me" (full) — random expressive style + harmony palette, then load
  // the full Liszt sample and play, so the canvas shows a fresh painting.
  const surpriseMe = useCallback(()=>{
    pickExpressiveStyle();
    setMode('harmony');
    loadSampleMidi();
    setTimeout(()=>{ try{ startPlay && startPlay(); }catch(_){} }, 280);
  },[pickExpressiveStyle, loadSampleMidi, startPlay]);

  // Lite Play chip — the canvas starts empty (no autoplay). The first tap on the
  // big gold Play chip loads the Liszt sample and starts playback within the
  // user gesture (so iOS lets the audio through), opening on Mosaic (the bare
  // reading, no artist) just like the old auto-open did.
  const litePlayStart = useCallback(()=>{
    try{ if(micListening) stopMicListening(); else if(micPainting) stopMicPainting(); }catch(_){}
    try{ setMuted(false); }catch(_){}
    try{ setRandomMode(false); randomModeRef.current=false; }catch(_){}
    try{
      // Prefer Pollock 'a' — painterly first impression. If the user removed
      // Pollock from their Set via Preset (⚙), fall back to the first playable
      // artist in their set (skip mosaicFamily and Pro-locked artists on Free).
      const _target = setupArtists.includes('pollock')
        ? 'pollock'
        : (setupArtists.find(k=> k!=='mosaicFamily' && !styleIsLocked(k)) || 'pollock');
      setStyle(_target); setPhaseIndex(0); setNotesMode(false); setOneMMode(false);
    }catch(_){}
    // Inherit the user's active palette and tone (set in Advanced or stored
    // from a previous session). Lite no longer force-resets to Harmony so
    // a Spectral / Phi / Custom user keeps their colour DNA in Lite too.
    try{ liteEverUnlockedRef.current = true; basicTapUnlockedRef.current = true; }catch(_){}
    loadSampleMidi();
    setTimeout(()=>{ try{ wakeAudio().then(()=>{ try{ startPlayRef.current && startPlayRef.current(); }catch(_){} }).catch(()=>{}); }catch(_){} }, 120);
  },[loadSampleMidi]);

  // BASIC-mode "Surprise me" — swap to a DIFFERENT random expressive style
  // WITHOUT restarting the song. The paint effect re-renders live on a style
  // change, so the whole painting repaints in the new artist's language at the
  // current position while the music keeps playing. Avoids repeating the
  // current style so each tap is visibly different.
  const basicSurprise = useCallback(()=>{
    // Surprise rotates through every (artist × variant) address available on the
    // current tier — for Free that's the 9 unlocked artists, each with 2 style
    // variants (phaseIndex 0/1) = 18 looks, plus mosaic. For Pro, all artists ×
    // their full variant count. Each tap lands on a DIFFERENT address than the
    // current one so the painting always visibly changes.
    const artists = (proStatus === 'free')
      ? Array.from(FREE_UNLOCKED_KEYS)
      : ALL_ARTIST_KEYS.filter(k=>k!=='mosaicFamily');
    const variantsFor = (k)=> (proStatus==='free' ? 2 : ((k==='kandinsky') ? 8 : (k==='wave' ? 7 : 6)));
    // The shuffle pool of "artists" includes the three Mosaic-family stops
    // (Mosaic / Notes / $1M$) as their own entries, so each bare-grid look
    // shows about as often as any single painter.
    const _isFamilyKey = (k)=> (k==='mosaicFamily'||k==='mosaicNotes'||k==='mosaicOneM');
    const bagKeys = [...artists, 'mosaicFamily', 'mosaicNotes', 'mosaicOneM'];
    // Fisher–Yates shuffle.
    const shuffle = (arr)=>{ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
    const curK = style ? style
               : oneMMode ? 'mosaicOneM'
               : notesMode ? 'mosaicNotes'
               : 'mosaicFamily';
    const curV = (phaseIndex|0);
    // ── pick next ARTIST from the shuffle-bag ──────────────────────────────
    // Refill when empty. On refill, if the freshly shuffled bag would hand back
    // the artist we're already on (bag boundary), rotate it so we still change.
    let bag = surpriseArtistBagRef.current;
    // Drop stale keys if the tier/pool changed (e.g. Pro↔free) so the bag never
    // serves a now-unavailable artist.
    bag = bag.filter(k => bagKeys.includes(k));
    if(bag.length===0){
      bag = shuffle(bagKeys);
      if(bag.length>1 && bag[0]===curK){ bag.push(bag.shift()); }
    }
    let nk = bag.shift();
    // Guard: never hand back the current artist twice in a row (covers the rare
    // case where the leftover bag's head equals curK after filtering).
    if(nk===curK && bag.length){ bag.push(nk); nk = bag.shift(); }
    surpriseArtistBagRef.current = bag;
    // ── pick next VARIANT for that artist from its own bag ─────────────────
    const vCount = _isFamilyKey(nk) ? 1 : variantsFor(nk);
    let nv = 0;
    if(vCount>1){
      const vbags = surpriseVariantBagsRef.current;
      let vbag = (vbags[nk]||[]).filter(v => v<vCount);
      if(vbag.length===0){
        vbag = shuffle(Array.from({length:vCount},(_,i)=>i));
        // Avoid repeating the same variant across a bag boundary when we stay
        // on the same artist (only relevant if the artist guard above failed).
        if(nk===curK && vbag.length>1 && vbag[0]===curV){ vbag.push(vbag.shift()); }
      }
      nv = vbag.shift();
      vbags[nk] = vbag;
    }
    setRandomMode(false); randomModeRef.current=false;
    if(_isFamilyKey(nk)){
      // Mosaic family stop. style stays null; the sub-mode flags pick which
      // bare-grid look renders via effectiveStyle (Mosaic / Notes / $1M$).
      setSetupArtists(prev => prev.includes('mosaicFamily') ? prev : [...prev,'mosaicFamily']);
      setStyle(null);                 // null style → mosaic family
      setShufVariant(0);
      setNotesMode(nk==='mosaicNotes');
      setOneMMode(nk==='mosaicOneM');
    } else {
      setSetupArtists(prev => prev.includes(nk) ? prev : [...prev, nk]);
      setStyle(nk);
      setPhaseIndex(nv|0);            // pick that artist's variant
      setNotesMode(false); setOneMMode(false);  // artist exits any family sub-mode
    }
  },[proStatus, FREE_UNLOCKED_KEYS, style, phaseIndex, notesMode, oneMMode]);

  // BASIC mode: auto-load and play the Liszt sample once, when Basic is active
  // and the canvas is empty (e.g. after the intro splash, or on entering Basic
  // with nothing loaded). Waits for the loading intro to clear so Liebestraum
  // doesn't start underneath the splash. Fires once per empty-canvas entry.
  const basicAutoPlayedRef = useRef(false);
  // Lite flavour switch (music ⇄ painting). Flipping into image mode auto-loads
  // the Van Gogh sample so it reads + plays immediately (mirrors music mode's
  // Liszt auto-play). Flipping back clears it and re-arms the music sample. Lite
  // only — never touches Advanced. Guarded to fire once per flip.
  const _liteImgAppliedRef = useRef(false);
  // Signal: did basicAutoPlay get triggered by a painting→music flip?
  // Set true in the liteImageMode useEffect's else-branch (flip from image to
  // music), consumed in basicAutoPlay to pick a richer default (Kusama) vs
  // a plain re-entry (Mosaic).
  const _fromImageFlipRef = useRef(false);
  useEffect(()=>{
    if(!basicMode){ _liteImgAppliedRef.current=false; return; }
    if(liteImageMode){
      if(_liteImgAppliedRef.current) return;
      _liteImgAppliedRef.current = true;
      // Stop the music flavour's audio completely before the image starts, so
      // the two never overlap during the flip.
      try{ stopAll(); }catch(_){}
      try{ basicAutoPlayedRef.current=true; }catch(_){}   // suppress Liszt auto-play
      try{ setLiteAwaitTap(false); }catch(_){}            // image plays now — no splash
      try{ liteEverUnlockedRef.current = true; basicTapUnlockedRef.current = true; }catch(_){}
      try{ loadSampleImage(); }catch(_){}
      // The flip hard-muted the master to kill the piano tail. Image flavour
      // paints from a photo (no music auto-plays), so restore the master mute
      // to the user's setting once the tail has died, otherwise it stays muted.
      try{ const _wasFlip = liteFlipJustRef.current; liteFlipJustRef.current=false; if(_wasFlip){ setTimeout(()=>{ try{ Tone.getDestination().mute = !!mutedRef.current; }catch(_){} }, 650); } }catch(_){}
    } else {
      if(!_liteImgAppliedRef.current) return;
      _liteImgAppliedRef.current = false;
      try{ stopAll(); }catch(_){}
      try{ fullClear && fullClear(); }catch(_){}
      // Coming back to music from image: audio has already played, so the
      // "Tap to begin" splash must never reappear. Mark the audio as permanently
      // unlocked (these refs gate the splash in basicAutoPlay) and clear any
      // pending splash, then let basicAutoPlay reload + auto-play Liszt.
      try{ liteEverUnlockedRef.current = true; }catch(_){}
      try{ basicTapUnlockedRef.current = true; }catch(_){}
      try{ setLiteAwaitTap(false); }catch(_){}
      try{ _fromImageFlipRef.current = true; }catch(_){}  // signal to basicAutoPlay: this is a flip, not a re-entry
      try{ basicAutoPlayedRef.current=false; }catch(_){}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[liteImageMode,basicMode]);
  // Lite "Use my song" opens a tiny File / Mic chooser instead of going straight
  // to the file dialog. Mic arms the listen mode and auto-starts recording.
  const [liteSrcPicker, setLiteSrcPicker] = useState(false);
  const [liteImgPicker, setLiteImgPicker] = useState(false); // Lite mode 2: Sample(Van Gogh)/File
  // iOS blocks audio started off a timer (no user gesture), so the auto-played
  // Liszt can paint but stay silent. The first tap anywhere in Lite unlocks the
  // audio context and, if a song is loaded but not audibly playing, (re)starts
  // it with sound. Runs once.
  // Lite shows a "Tap to begin" splash on entry. Until the user taps, we hold
  // playback (iOS needs a gesture for sound anyway) so audio + paint start
  // together on the tap instead of the canvas playing silently underneath.
  const [liteAwaitTap, setLiteAwaitTap] = useState(false);
  useEffect(()=>{ liteAwaitTapRef.current = liteAwaitTap; },[liteAwaitTap]);
  const basicTapUnlock = useCallback(()=>{
    if(!basicMode) return;
    // Play chip is showing (first entry, empty canvas, music→painting mode):
    // a stray tap anywhere (opening the menu, switching language, etc.) must NOT
    // consume the first-gesture unlock — only the explicit tap on the Play chip
    // (litePlayStart) starts audio. Otherwise the chip would vanish after any
    // incidental tap without anything playing.
    if(!liteImageModeRef.current && !liteEverUnlockedRef.current && !playingRef.current
       && (!chordsRef.current || chordsRef.current.length===0)){
      return;
    }
    // If the "Tap to begin" splash is showing for ANY reason (first entry, or a
    // re-armed context after a Lite flavour flip), this tap must dismiss it and
    // start playback. Without this, the 2nd-visit splash (liteEverUnlocked
    // already true) fell through to the recovery branch and did nothing.
    if(liteAwaitTapRef.current){
      liteEverUnlockedRef.current = true;
      basicTapUnlockedRef.current = true;
      setLiteAwaitTap(false);
      try{ unlockAudio(); }catch(_){}
      try{ setMuted(false); }catch(_){}
      setTimeout(()=>{
        try{
          if(chordsRef.current && chordsRef.current.length>0 && !playingRef.current){
            wakeAudio().then(()=>{ startPlayRef.current && startPlayRef.current(); }).catch(()=>{ startPlayRef.current && startPlayRef.current(); });
          }
        }catch(_){}
      }, 30);
      return;
    }
    // Two separate concerns:
    //  • liteEverUnlockedRef — set ONCE on the very first tap; never reset. Its
    //    job is only to run unlockAudio()+start the splashed song a single time.
    //    Without this, statechange resetting basicTapUnlockedRef made every tap
    //    re-run unlockAudio (its silent-kick/suspend cycle) → audible crackle.
    //  • basicTapUnlockedRef — re-armed by statechange when the device dies, so
    //    a later tap can trigger recovery. Checked only for the recovery branch.
    const firstEver = !liteEverUnlockedRef.current;
    if(firstEver){
      liteEverUnlockedRef.current = true;
      basicTapUnlockedRef.current = true;
      setLiteAwaitTap(false);
      try{ unlockAudio(); }catch(_){}
      try{ setMuted(false); }catch(_){}
      setTimeout(()=>{
        try{
          if(chordsRef.current && chordsRef.current.length>0 && !playingRef.current){
            wakeAudio().then(()=>{ startPlayRef.current && startPlayRef.current(); }).catch(()=>{ startPlayRef.current && startPlayRef.current(); });
          }
        }catch(_){}
      }, 30);
      return;
    }
    // Already unlocked once. Do NOTHING unless the context actually died — in
    // which case statechange re-armed basicTapUnlockedRef AND audioWasHiddenRef,
    // so a single recovery pass is warranted. A healthy running context is left
    // completely untouched → no crackle on ordinary canvas taps / Surprise.
    if(basicTapUnlockedRef.current) return;
    let _dead=false;
    try{ const _ac=Tone.getContext().rawContext; _dead = !!_ac && _ac.state!=='running'; }catch(_){}
    if(!_dead) return;
    basicTapUnlockedRef.current = true;
    setTimeout(()=>{
      try{
        wakeAudio().then(()=>{ if(chordsRef.current && chordsRef.current.length>0 && !playingRef.current){ startPlayRef.current && startPlayRef.current(); } }).catch(()=>{});
      }catch(_){}
    }, 30);
  },[basicMode, unlockAudio]);
  useEffect(()=>{
    if(showIntro) return;
    if(!basicMode){ basicAutoPlayedRef.current=false; return; }
    // Already have content / playing / another source active → nothing to do,
    // and mark as done so we don't auto-load over a user's piece. micArmed is
    // included because _startMicLite calls fullClear (chords=0, loadedSource=null)
    // and THEN setMicArmed(true) — without this guard, basicAutoPlay races in
    // between and auto-loads Liszt over the user's pending mic capture.
    if(chords.length>0 || playing || composeMode || micActive || micArmed || loadedSource){ basicAutoPlayedRef.current=true; return; }
    // Still warming up (piano sampler loading → busy) — wait; the effect re-runs
    // when busy clears because busy is in the deps. Do NOT lock here.
    if(busy) return;
    if(basicAutoPlayedRef.current) return;
    // Mark the visitor as onboarded as soon as Lite is shown (independent of the
    // audio gesture). This is what the Lite/Advanced persistence + Pro-default
    // logic keys off — gating it behind the Play-chip unlock below meant the
    // chosen mode wasn't remembered until the user tapped Play.
    try{ localStorage.setItem('paintiano_onboarded','1'); }catch(_){}
    // First entry (audio not yet unlocked by a user gesture): do NOT autoplay —
    // the big Play chip on the empty canvas handles the first start (iOS needs
    // the gesture). Once audio has been unlocked once (the user tapped Play, or
    // played anything), autoplay is allowed again — so flipping the Lite flavour
    // (music↔painting) and back auto-plays without re-tapping.
    if(!liteEverUnlockedRef.current) return;
    basicAutoPlayedRef.current = true;
    const id=setTimeout(()=>{
      try{
        try{ setMuted(false); }catch(_){}
        // Lite auto-load on flip/re-entry: branch on the flip-flag.
        //  • Painting→music flip → Kandinsky 'a' (a composed, lyrical
        //    re-introduction so the user doesn't crash from image-driven art
        //    into a bare grid).
        //  • Plain re-entry (reload, fresh tab) → Kusama 'a' — bold, vibrant
        //    "welcome back" painting (no longer the bare Mosaic grid).
        // The first-ever Play chip (litePlayStart) is where Pollock 'a' kicks
        // in as the very first painterly impression. Palette and tone inherit
        // from the user's Advanced settings — no force.
        try{ setRandomMode(false); randomModeRef.current=false; }catch(_){}
        if(_fromImageFlipRef.current){
          _fromImageFlipRef.current = false;            // consume the flag
          // Prefer Kandinsky (flip default). Fall back to first playable artist
          // in the user's Set if Kandinsky was removed via Preset.
          const _t = setupArtists.includes('kandinsky')
            ? 'kandinsky'
            : (setupArtists.find(k=> k!=='mosaicFamily' && !styleIsLocked(k)) || 'kandinsky');
          setStyle(_t);
        } else {
          // Re-entry / reload — prefer Kusama, same fallback logic.
          const _t = setupArtists.includes('kusama')
            ? 'kusama'
            : (setupArtists.find(k=> k!=='mosaicFamily' && !styleIsLocked(k)) || 'kusama');
          setStyle(_t);
        }
        setPhaseIndex(0);
        setNotesMode(false); setOneMMode(false);
        loadSampleMidi();
        // Load the sample but hold playback behind a "Tap to begin" splash. iOS
        // needs a user gesture for sound, so we wait for the tap and then start
        // audio + paint together (basicTapUnlock), instead of painting silently.
        // Desktop browsers don't gate audio the same way (and the splash there
        // just covers a canvas that's already painting), so skip it on desktop.
        // (tap-to-begin splash removed — no auto-gated splash anymore)
      }catch(_){}
    }, 300);
    return ()=>clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[showIntro, basicMode, busy, chords.length, loadedSource, playing, micArmed, micActive]);

  // BASIC mode: auto-start playback whenever a song is loaded but not yet
  // playing (chords present, nothing drawn yet). Covers "My song" uploads
  // (loadSound/applyEvents don't auto-play) so the canvas always comes alive
  // without hunting for a play button. Ref-guarded to fire once per piece.
  const basicAutoStartedRef = useRef(false);
  useEffect(()=>{
    if(!basicMode){ basicAutoStartedRef.current=false; return; }
    if(chords.length===0){ basicAutoStartedRef.current=false; return; }
    // Hold the Liszt auto-start behind the Tap-to-begin splash. User-loaded
    // songs (loadedSource set) bypass this — they were chosen by a tap already.
    if(liteAwaitTap && !loadedSource) return;
    if(playing || holdPaused || busy || disp>0){ basicAutoStartedRef.current=true; return; }
    if(basicAutoStartedRef.current) return;
    basicAutoStartedRef.current = true;
    const _flipDelay = liteFlipJustRef.current ? 650 : 120;
    const id=setTimeout(()=>{ if(liteFlipJustRef.current){ try{ Tone.getDestination().mute = !!mutedRef.current; }catch(_){} } liteFlipJustRef.current=false; try{ setMuted(false); }catch(_){} try{ wakeAudio().then(()=>{ startPlayRef.current?.(); }).catch(()=>{ startPlayRef.current?.(); }); }catch(_){ try{ startPlay && startPlay(); }catch(__){} } }, _flipDelay);
    return ()=>clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[basicMode, chords.length, loadedSource, playing, holdPaused, busy]);

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
    setViewMode('paint');viewModeRef.current='paint';setOriginalImgUrl(null);pixelRef.current=null;imgComposeRef.current=false;setStamp(s=>s+1);
    setErr('');setMidiBlob(null);setMidiName('');setAudioBlob(null);setAudioName('');audioBlobRef.current=null;setLoadedSource(null);setMoodFromImg(false);setImgMoodThumb(null);setMoodContext(false);
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
      holdPausedRef.current=true; // sync — render effect reads this before the state flush
      setHoldPaused(true);
      genRef.current++;timers.current.forEach(t=>clearTimeout(t));timers.current=[];
      try{if(samplerOk.current&&samplerRef.current)samplerRef.current.releaseAll();}catch(_){}
      try{if(audioElRef.current)audioElRef.current.pause();}catch(_){}
      try{if(audioSourceRef.current){audioSourceRef.current.stop();audioSourceRef.current=null;}}catch(_){}
      // Pause the Original-source buffer too. Web Audio BufferSources can't be
      // paused — stop and let startPlay's Resume branch recreate at offset.
      try{if(originalSourceRef.current){originalSourceRef.current.stop();originalSourceRef.current.disconnect();originalSourceRef.current=null;}}catch(_){}
      originalPlaybackRef.current=false;
      setActive(new Set());
      setPlaying(false);setAnim(false);
      // User-initiated pause/stop = close recording window without sealing.
      // Next fresh Play will re-open it (same semantics as Add).
      if(aiRecordingRef.current){ setAiRecording(false); }
    }else if(holdPaused){
      // In-gesture iOS audio revive: wakeAudio() runs the verified suspend->resume
      // cycle that re-acquires a running-but-dead audio device (see its definition).
      // It must happen in this tap. We await it so the device is live before
      // startPlay schedules the first note.
      holdPausedRef.current=false; // sync — clear before the scan loop repaints
      setHoldPaused(false);
      wakeAudio().then(()=>{ startPlayRef.current?.(); }).catch(()=>{ startPlayRef.current?.(); });
    }else if(!busy){
      resumeFromRef.current=null;
      wakeAudio().then(()=>{ startPlayRef.current?.(); }).catch(()=>{ startPlayRef.current?.(); });
    }
  },[playing,holdPaused,busy,disp,demoMode,startPlay,micPainting,micListening,wakeAudio]);
  useEffect(()=>{handlePauseClickRef.current=handlePauseClick;},[handlePauseClick]);
  useEffect(()=>{startPlayRef.current=startPlay;},[startPlay]);

  // Seamless Original ⇄ Piano swap while playing.
  // Robust pattern: derive want from state, derive have from ref, exit if
  // same. Stop the OUTGOING source first (always sync), update the flag, then
  // start the INCOMING source. ORIG → PIANO additionally triggers the current
  // chord immediately so there's no silent gap before the next step() tick.
  useEffect(()=>{
    if(!playing) return;
    if(draftOwnerRef.current!=='listen' && draftOwnerRef.current!=='sing') return;
    const want = (playSourceMic==='original' && !!listenPCMRef.current) ? 'original' : 'piano';
    const have = originalPlaybackRef.current ? 'original' : 'piano';
    if(want===have) return;

    const stopSampler = ()=>{
      try{ if(samplerOk.current && samplerRef.current) samplerRef.current.releaseAll(); }catch(_){}
      setActive(new Set());
      // Note: do NOT clear timers.current — that holds the paint animation
      // schedule (step() chain). Only the sampler audio is being hushed.
    };
    const stopOriginal = ()=>{
      const src = originalSourceRef.current;
      if(!src) return;
      try{ src.onended = null; }catch(_){}
      try{ src.stop(); }catch(_){}
      try{ src.disconnect(); }catch(_){}
      originalSourceRef.current = null;
    };

    const chordsArr = chordsRef.current || [];
    const idx = Math.max(0, Math.min(chordsArr.length-1, dispRef.current|0));
    const startMs = chordsArr[idx]?.startMs || 0;
    const offsetSec = startMs/1000;

    if(want==='original'){
      // PIANO → ORIG. Hush sampler completely, then start the buffer at offset.
      stopSampler();
      stopOriginal(); // belt and braces — no orphan source
      try{
        const ac = Tone.getContext().rawContext;
        const src = ac.createBufferSource();
        src.buffer = listenPCMRef.current;
        src.playbackRate.value = playbackSpeedRef.current;
        const g = ac.createGain(); g.gain.value = mutedRef.current?0:1;
        src.connect(g); g.connect(ac.destination); src._muteGain = g;
        src.start(0, offsetSec);
        originalSourceRef.current = src;
        originalPlaybackRef.current = true;
        // onended guards against stale resets — only reset if WE are still current.
        src.onended = ()=>{
          if(originalSourceRef.current === src){
            originalSourceRef.current = null;
            originalPlaybackRef.current = false;
          }
        };
      }catch(_){ originalPlaybackRef.current = false; }
    } else {
      // ORIG → PIANO. Stop the buffer, then immediately trigger the current
      // chord so there's no audible gap until step() reaches the next one.
      stopOriginal();
      originalPlaybackRef.current = false;
      const c = chordsArr[idx];
      if(c && c.n && c.n.length){
        try{
          for(const note of c.n){
            if(typeof note.m === 'number') playNote(note.m, note.v||88, note.durMs||400);
          }
          // Light-up keys to match the audible chord.
          setActive(p=>{ const s=new Set(p); for(const n of c.n){ if(typeof n.m==='number') s.add(n.m); } return s; });
        }catch(_){}
      }
    }
    // Intentionally NOT including `playing` or `disp` — toggle is the only
    // trigger; including them would re-fire on every chord/state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[playSourceMic]);

  // Auto-stop the recorder once playback finishes (playing → false).
  // A 700 ms tail lets the last notes ring out before capture closes.
  //
  // Guards: (1) only fire AFTER playback actually started during this
  // recording session — without this, setRecording(true) re-renders BEFORE
  // the async startPlay() flips setPlaying(true), so for one render cycle we
  // have (playing=false, recording=true) which would trip this and stop the
  // recorder ~700ms after REC was tapped, popping the SAVE picker open
  // mid-recording. (2) only fire if the recorder is actually still in
  // 'recording' state — if the user already tapped STOP, the recorder is
  // already inactive and we'd schedule a redundant stop on a dead recorder.
  const playStartedDuringRecRef = useRef(false);
  useEffect(()=>{
    if(playing && recording){
      playStartedDuringRecRef.current = true;
      return;
    }
    if(!playing && recording && recorderRef.current && playStartedDuringRecRef.current){
      playStartedDuringRecRef.current = false;
      const r=recorderRef.current;
      setTimeout(()=>{
        try{ if(r && r.state==='recording') r.stop(); }catch(_){}
      },700);
    }
    if(!recording) playStartedDuringRecRef.current = false;
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
      // Defensive: on iOS Safari, disconnect() on a node that branches into
      // a MediaStreamAudioDestinationNode has been observed to occasionally
      // wedge the AudioContext into a silent state. Resume the context to
      // ensure subsequent playback (after picker close / share cancel) still
      // produces audio. Cheap no-op if context is already 'running'.
      unlockAudio();
      const mt=recorder.mimeType||'audio/mp4';
      const blob=new Blob(recChunksRef.current,{type:mt});
      const ext=mt.includes('ogg')?'ogg':mt.includes('mp4')?'m4a':'webm';
      const name=(info?.title||'paintiano').replace(/[^\w\s-]/g,'').replace(/\s+/g,'_').slice(0,50)+'.'+ext;
      if(blob.size<2000){setErr(t('recTooShort'));setErrInfo(false);}
      else{setRecBlob(blob);setRecName(name);}
      setRecording(false);recorderRef.current=null;
      keepSetupDuringRecRef.current=false;
      // Image-mode picker intents: react to what the user picked from SAVE,
      // or from the REC button. 'audio'/'story' come from inside the SAVE picker
      // and still fire their action. 'picker' is the plain REC button: instead of
      // auto-opening the SAVE picker (which felt like a jarring jump), we now do
      // NOTHING here — the recorded blob stays on hand (recBlob, set above) and
      // the REC button morphs into a SAVE button, so the user opens the picker
      // themselves on tap, exactly like every other mode.
      const intent = recordIntentRef.current;
      if(intent && blob.size>=2000){
        setRecordIntent(null);
        recordIntentRef.current=null;
        // Defer so the recBlob/recName state writes settle before downstream
        // helpers (saveAudio reads them via closure).
        setTimeout(()=>{
          if(intent==='audio') saveAudio(true, pendingWithSourceRef.current);
          else if(intent==='story') exportImage('story', true, blob, name, pendingWithSourceRef.current);
          // 'picker' intentionally does nothing — REC→SAVE button handles it.
        }, 60);
      }
    };
    recorderRef.current=recorder;
    recorder.start(200);
    setRecording(true);
    setRecBlob(null);setRecName('');
    startPlay();
  };

  useEffect(()=>{ startRecordRef.current=startRecord; });
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
      // NOTE: ac is the shared Tone context now — must NOT close it (that would
      // tear down all app audio). Stopping the mic stream tracks is enough; the
      // MediaStreamSource is GC'd once the stream ends.
      micVolRef.current=null;
    }
    setMicVolActive(false);
    setMicVolLevel(0);
  },[]);

  // iOS allows essentially one live AudioContext. The mic code used to spin up a
  // SECOND `new AudioContext()` next to Tone's, and calling createMediaStreamSource
  // on it threw InvalidStateError (the "Could not start the microphone" failure).
  // Reuse Tone's existing, already-running context instead — one context, no clash.
  const getSharedAC=useCallback(async()=>{
    // CRITICAL: the audio session must allow INPUT for the mic. Elsewhere we set
    // navigator.audioSession.type='playback' (output-only) for clean playback —
    // but 'playback' DISABLES the microphone, which is why createMediaStreamSource
    // started throwing InvalidStateError after the playback-session changes landed.
    // Switch to 'play-and-record' here so capture is permitted.
    try{ if(typeof navigator!=='undefined' && navigator.audioSession){ navigator.audioSession.type='play-and-record'; } }catch(_){}
    let ac=null;
    try{ ac=Tone.getContext().rawContext; }catch(_){}
    if(!ac){ const AC=window.AudioContext||window.webkitAudioContext; ac=new AC(); }
    try{ if(ac.state!=='running' && ac.resume) await ac.resume(); }catch(_){}
    return ac;
  },[]);

  // Map a getUserMedia failure to the right message. Previously every failure was
  // reported as "access denied", which sent users to permission settings even when
  // permission was already granted and the real cause was different (mic busy in
  // another tab/app, no device, hardware error). Distinguish by error name.
  const micErrMsg=useCallback((e)=>{
    const n=(e&&e.name)||'';
    if(n==='NotAllowedError'||n==='SecurityError') return t('micDenied');
    if(n==='NotReadableError'||n==='AbortError') return (t('micBusy')!=='micBusy'?t('micBusy'):'Microphone is busy — another app or browser tab may be using it. Close it (and any other tab using the mic), then reload.');
    if(n==='NotFoundError'||n==='OverconstrainedError') return (t('micNotFound')!=='micNotFound'?t('micNotFound'):'No microphone found on this device.');
    // Unknown failure — show the actual error so it's debuggable, not a misleading "denied".
    return (t('micFail')!=='micFail'?t('micFail'):'Could not start the microphone')+(n?(' ('+n+')'):'');
  },[t]);

  const startMicVol=useCallback(async()=>{
    if(micVolActive){stopMicVol();return;}
    if(!navigator.mediaDevices?.getUserMedia){setErr(t('micUnavailable'));setErrInfo(false);return;}
    try{ if(navigator.audioSession){ navigator.audioSession.type='play-and-record'; } }catch(_){} // allow mic input (playback type blocks it)
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      const ac=await getSharedAC();
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
      setErr(micErrMsg(e));setErrInfo(false);
    }
  },[micVolActive,stopMicVol,micErrMsg,getSharedAC]);

  const stopMicPainting=useCallback(()=>{
    // Stash the captured draft so the MIC button shows a "draft saved" glow and
    // the work is recoverable (mirrors Compose). stashDraft no-ops if the canvas
    // isn't a recorded creation or is empty, so this is safe on every stop path.
    if(draftOwnerRef.current==='sing'||draftOwnerRef.current==='listen') stashDraft(draftOwnerRef.current);
    if(micRafRef.current){cancelAnimationFrame(micRafRef.current);micRafRef.current=null;}
    // Finalise the parallel raw-audio recorder (same handler used by Music
    // mode). Voice mode also captures original audio for the Original ⇄ Piano
    // toggle, so this stop applies here too.
    if(listenRecorderRef.current){
      try{ if(listenRecorderRef.current.state!=='inactive') listenRecorderRef.current.stop(); }catch(_){}
      listenRecorderRef.current = null;
    }
    if(micStreamRef.current){micStreamRef.current.getTracks().forEach(t=>t.stop());micStreamRef.current=null;}
    if(micAcRef.current){micAcRef.current=null;} // shared Tone context — release ref only, never close
    setMicPainting(false);
    stopMicVol();
  },[stopMicVol,stashDraft,micErrMsg,getSharedAC]);

  const stopMicListening=useCallback(()=>{
    if(draftOwnerRef.current==='sing'||draftOwnerRef.current==='listen') stashDraft(draftOwnerRef.current);
    if(listenRafRef.current){cancelAnimationFrame(listenRafRef.current);listenRafRef.current=null;}
    // Finalise the parallel raw-audio recorder. It owns its own onstop handler
    // that builds the Blob; we just request stop. Tracks are closed below.
    if(listenRecorderRef.current){
      try{ if(listenRecorderRef.current.state!=='inactive') listenRecorderRef.current.stop(); }catch(_){}
      listenRecorderRef.current = null;
    }
    if(listenStreamRef.current){listenStreamRef.current.getTracks().forEach(t=>t.stop());listenStreamRef.current=null;}
    if(listenAcRef.current){listenAcRef.current=null;} // shared Tone context — release ref only, never close
    setMicListening(false);
    stopMicVol();
  },[stopMicVol,stashDraft,micErrMsg,getSharedAC]);

  // Refs so handlePauseClick (defined earlier in the file) can stop a live mic
  // mode before starting playback. The Play button now does mic-stop + play in
  // one tap instead of being disabled while the mic is capturing.
  const stopMicPaintingRef = useRef(null);
  const stopMicListeningRef = useRef(null);
  useEffect(()=>{stopMicPaintingRef.current=stopMicPainting;},[stopMicPainting]);
  useEffect(()=>{stopMicListeningRef.current=stopMicListening;},[stopMicListening]);

  const startMicListening=useCallback(async()=>{
    if(micListeningRef.current){stopMicListening();return;}
    if(!navigator.mediaDevices?.getUserMedia){setErr(t('micUnavailable'));setErrInfo(false);return;}
    try{ if(navigator.audioSession){ navigator.audioSession.type='play-and-record'; } }catch(_){} // allow mic input (playback type blocks it)
    const prevOwner = draftOwnerRef.current;
    // Continuation: re-entering listen, OR switching from sing (sibling preset
    // within the unified MIC mode). In both cases we preserve the canvas.
    const continuation = (prevOwner==='listen' || prevOwner==='sing');
    if(prevOwner && !continuation) stashDraft(prevOwner);
    // Only one mode at a time
    setComposeMode(false);
    if(micPaintingRef.current){stopMicPainting();}
    try{
      // Some iOS builds reject specific audio constraints (autoGainControl:false
      // etc.) with OverconstrainedError/NotReadableError even though the mic is
      // available and permitted. Try the detailed request first, then fall back to
      // a plain {audio:true} request which iOS always accepts.
      let stream;
      try{
        // iOS Safari's noiseSuppression is voice-tuned — it crushes musical
        // spectrum and pushes vocals forward. Disable on iOS, let our own
        // Web Audio chain (HP + compressor below) do the cleaning. Desktop
        // browsers ship gentler NS, so we keep it on there.
        const isiOS = typeof navigator!=='undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent||'');
        stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:!isiOS,autoGainControl:false,voiceIsolation:false},video:false});
      }catch(ce){
        if(ce&&(ce.name==='OverconstrainedError'||ce.name==='NotReadableError'||ce.name==='TypeError')){
          stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
        } else { throw ce; }
      }
      listenStreamRef.current=stream;
      const ac=await getSharedAC();
      listenAcRef.current=ac;
      const src=ac.createMediaStreamSource(stream);
      const analyser=ac.createAnalyser();
      analyser.fftSize=4096; // higher resolution for better pitch detection on complex music
      // Analyser stays on the raw source — no compressor / HP — so the FFT
      // sees a true magnitude spectrum without DSP-induced peaks.
      src.connect(analyser);
      const buf=new Float32Array(analyser.fftSize);
      const sr=ac.sampleRate;
      // Filtered branch for the *recording* stream — what the user will hear
      // on Play. High-pass 80 Hz kills AC hum and rumble; a mild compressor
      // brings quiet musical detail up without flattening the dynamics.
      // MediaStreamDestination feeds MediaRecorder so the file on disk is
      // the post-DSP signal, not the raw mic.
      let recordStream = stream; // fallback if Web Audio routing fails
      try{
        // iOS Safari pushes mic through Voice Isolation by default, which
        // crushes music behind any vocal. A compressor on top would amplify
        // that vocal pump further — so on iOS we skip the compressor and
        // route only through a gentle HP filter (kills rumble, leaves the
        // musical spectrum intact). Desktop browsers ship a flatter mic
        // signal, so the compressor still helps there.
        const isiOSrec = typeof navigator!=='undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent||'');
        const hp = ac.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 80; hp.Q.value = 0.7;
        const dst = ac.createMediaStreamDestination();
        if(isiOSrec){
          src.connect(hp); hp.connect(dst);
        } else {
          const comp = ac.createDynamicsCompressor();
          comp.threshold.value = -32; comp.knee.value = 12; comp.ratio.value = 2.5;
          comp.attack.value = 0.005; comp.release.value = 0.15;
          src.connect(hp); hp.connect(comp); comp.connect(dst);
        }
        if(dst.stream && dst.stream.getAudioTracks().length>0) recordStream = dst.stream;
      }catch(_){ /* fallback to raw stream — recording still works */ }
      // Start raw audio capture in parallel — keeps the user's exact source
      // recording so they can play it back instead of the synthesised cover.
      // Pick the best supported mime in order of preference. Some browsers
      // (Safari) accept only audio/mp4; Chrome/Firefox prefer webm/opus.
      try{
        const MR = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null;
        if(MR){
          const cands = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus','audio/ogg',''];
          let mime = '';
          for(const c of cands){ if(c==='' || (MR.isTypeSupported && MR.isTypeSupported(c))){ mime=c; break; } }
          const opts = mime ? { mimeType: mime } : undefined;
          const rec = new MR(recordStream, opts);
          listenChunksRef.current = [];
          // Clear any previous draft's blob — fresh listen session.
          if(listenBlobRef.current?.url){ try{ URL.revokeObjectURL(listenBlobRef.current.url); }catch(_){} }
          listenBlobRef.current = null;
          rec.ondataavailable = (e)=>{ if(e.data && e.data.size>0) listenChunksRef.current.push(e.data); };
          rec.onstop = ()=>{
            const chunks = listenChunksRef.current;
            if(!chunks || chunks.length===0){ listenChunksRef.current=[]; return; }
            const type = rec.mimeType || mime || 'audio/webm';
            const blob = new Blob(chunks, { type });
            const url = URL.createObjectURL(blob);
            listenBlobRef.current = { blob, url, type };
            listenChunksRef.current = [];
            setHasMicBlob(true);
            // Decode blob → AudioBuffer in background so Play can start the
            // original recording instantly. Tone shares its rawContext so the
            // decoded buffer is compatible with our playback path.
            (async()=>{
              try{
                const arrBuf = await blob.arrayBuffer();
                const ac = Tone.getContext().rawContext;
                const decode = (ab,ctx)=>new Promise((res,rej)=>{
                  let done=false; const t=setTimeout(()=>{ if(!done){done=true;rej(new Error('decode timeout'));} },10000);
                  try{
                    ctx.decodeAudioData(ab, b=>{ if(!done){done=true;clearTimeout(t);res(b);} }, e=>{ if(!done){done=true;clearTimeout(t);rej(e||new Error('decode failed'));} });
                  }catch(_){
                    ctx.decodeAudioData(ab).then(b=>{ if(!done){done=true;clearTimeout(t);res(b);} }, e=>{ if(!done){done=true;clearTimeout(t);rej(e||new Error('decode failed'));} });
                  }
                });
                const buf = await decode(arrBuf, ac);
                listenPCMRef.current = buf;
              }catch(_){
                // Decode failed (unsupported codec etc.) — silently fall back to
                // piano playback; the toggle will still be there but Original
                // tap won't have a buffer to play. Set buffer null.
                listenPCMRef.current = null;
              }
            })();
          };
          rec.start(1000); // emit chunks every 1s for incremental delivery
          listenRecorderRef.current = rec;
          setHasMicBlob(false); // fresh session — old blob is gone, new one not ready yet
        }
      }catch(_){ /* recording optional — pitch-track still works without it */ }
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
      let pendingSig='';
      let pendingNotes=null;
      let prevChordStart=performance.now();
      const emitChord=(notes,heldMs)=>{
        // Silent painting — highlight + record, but NO playback during the
        // capture session (the user is already hearing the source audio).
        const sustainMs=Math.round(Math.min(2400,Math.max(300,heldMs)));
        notes.forEach(({m})=>{
          setActive(p=>{const s=new Set(p);s.add(m);return s;});
          pushTimer(()=>setActive(p=>{const s=new Set(p);s.delete(m);return s;}),Math.min(sustainMs,1000));
        });
        const idx=idxRef.current++;
        const now2=performance.now();
        if(!sessionStart.current)sessionStart.current=now2;
        const startMs=now2-sessionStart.current;
        const durQ=Math.max(0.25,Math.min(4,heldMs/500));
        const paintedNotes=notes.map(n=>({...n,durMs:Math.round(heldMs)}));
        setChords(p=>{const next=[...p,{n:paintedNotes,idx,startMs,recorded:true,durQ}];return next;});
        setDisp(p=>p+1);
      };
      // Hybrid event builder:
      //  • Strong chord-template match → triadic voicing (root + 3 + 5 + bass)
      //  • Otherwise, if a dominant pitch is clearly above the rest → single note
      //  • Otherwise, if multiple comparable peaks → 2–3 raw pitches as-is
      // Returns {sig, notes} or null.
      const buildEvent=(mag,liveSr)=>{
        const chroma=computeChroma(mag,liveSr);
        const det=detectChord(chroma); // null below 0.60 conf
        const peaks=pickPitches(mag,liveSr,0.02); // original sensitivity
        if(det){
          const notes=generateVoicing(det.root,det.quality);
          return { sig:'C:'+det.root+':'+det.quality, notes };
        }
        if(peaks.length===0) return null;
        // Single dominant pitch: top peak ≥ 2.0× the next one → treat as melody.
        if(peaks.length===1 || peaks[0].mag >= peaks[1].mag*2.0){
          const m=peaks[0].midi;
          return { sig:'N:'+m, notes:[{m,v:Math.max(70,Math.min(110,Math.round(peaks[0].mag*110)))}] };
        }
        // Raw multi-pitch: take top 2–3, sorted ascending (low → high).
        const taken=peaks.slice(0,3).map(p=>({m:p.midi,v:Math.max(60,Math.min(108,Math.round(p.mag*100)))})).sort((a,b)=>a.m-b.m);
        const sig='P:'+taken.map(n=>n.m).join(',');
        return { sig, notes:taken };
      };
      const tick=()=>{
        if(!listenStreamRef.current){stopMicListening();return;}
        analyser.getFloatTimeDomainData(buf);
        let rms=0;for(let i=0;i<buf.length;i++)rms+=buf[i]*buf[i];rms=Math.sqrt(rms/buf.length);
        const now=performance.now();
        if(rms < noiseFloor*1.5) noiseFloor = noiseFloor*0.95 + rms*0.05;
        const gate = Math.max(RMS_FLOOR_MIN, noiseFloor*NOISE_GATE_MULT);
        if(rms<gate){
          if(pendingNotes){
            const heldMs=now-prevChordStart;
            if(heldMs>=MIN_HOLD_MS) emitChord(pendingNotes,heldMs);
            pendingNotes=null;pendingSig='';
          }
          listenRafRef.current=requestAnimationFrame(tick);return;
        }
        if(now-lastCommit>COMMIT_INTERVAL){
          lastCommit=now;
          const mag=fftMag(buf);
          const liveSr = (ac.sampleRate && ac.sampleRate>1000) ? ac.sampleRate : (sr && sr>1000 ? sr : 44100);
          const ev=buildEvent(mag,liveSr);
          if(ev && ev.sig!==pendingSig){
            // Event changed. Flush previous, arm new — no stability gate.
            if(pendingNotes){
              const heldMs=now-prevChordStart;
              if(heldMs>=MIN_HOLD_MS) emitChord(pendingNotes,heldMs);
            }
            pendingSig=ev.sig;
            pendingNotes=ev.notes;
            prevChordStart=now;
          }
        }
        listenRafRef.current=requestAnimationFrame(tick);
      };
      listenRafRef.current=requestAnimationFrame(tick);
    }catch(e){
      setErr(micErrMsg(e));setErrInfo(false);
      setMicListening(false);
    }
  },[stopMicListening,stopAll]);

  const startMicPainting=useCallback(async()=>{
    if(micPaintingRef.current)return stopMicPainting();
    if(!navigator.mediaDevices?.getUserMedia){setErr(t('micUnavailable'));setErrInfo(false);return;}
    try{ if(navigator.audioSession){ navigator.audioSession.type='play-and-record'; } }catch(_){} // allow mic input (playback type blocks it)
    const prevOwner = draftOwnerRef.current;
    // Continuation: re-entering sing, OR switching from listen (sibling preset
    // within the unified MIC mode). Preserve the canvas in both cases.
    const continuation = (prevOwner==='sing' || prevOwner==='listen');
    if(prevOwner && !continuation) stashDraft(prevOwner);
    // Only one mode at a time
    setComposeMode(false);
    if(micListening){stopMicListening();}
    try{
      // Mirror startMicListening's iOS-aware constraint negotiation so the
      // Voice recording survives Safari's stricter audio policy. Falling back
      // to {audio:true} on OverconstrainedError keeps the older path working.
      let stream;
      try{
        const isiOS = typeof navigator!=='undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent||'');
        stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:!isiOS,autoGainControl:false,voiceIsolation:false},video:false});
      }catch(ce){
        if(ce&&(ce.name==='OverconstrainedError'||ce.name==='NotReadableError'||ce.name==='TypeError')){
          stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
        } else { throw ce; }
      }
      micStreamRef.current=stream;
      const ac=await getSharedAC();
      micAcRef.current=ac;
      const src=ac.createMediaStreamSource(stream);
      const analyser=ac.createAnalyser();
      analyser.fftSize=2048;
      src.connect(analyser);
      const buf=new Float32Array(analyser.fftSize);
      const sr=ac.sampleRate;
      // Parallel raw-audio capture so Voice gets the Original ⇄ Piano toggle
      // just like Music. We share the existing listen* refs because the toggle
      // UI and playback paths already read those — sing simply writes into
      // them, prevailing over any earlier listen blob (last recording wins).
      let recordStream = stream;
      try{
        const isiOSrec = typeof navigator!=='undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent||'');
        const hp = ac.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 80; hp.Q.value = 0.7;
        const dst = ac.createMediaStreamDestination();
        if(isiOSrec){
          src.connect(hp); hp.connect(dst);
        } else {
          const comp = ac.createDynamicsCompressor();
          comp.threshold.value = -32; comp.knee.value = 12; comp.ratio.value = 2.5;
          comp.attack.value = 0.005; comp.release.value = 0.15;
          src.connect(hp); hp.connect(comp); comp.connect(dst);
        }
        if(dst.stream && dst.stream.getAudioTracks().length>0) recordStream = dst.stream;
      }catch(_){ /* fallback to raw stream — recording still works */ }
      try{
        const MR = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null;
        if(MR){
          const cands = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus','audio/ogg',''];
          let mime = '';
          for(const c of cands){ if(c==='' || (MR.isTypeSupported && MR.isTypeSupported(c))){ mime=c; break; } }
          const opts = mime ? { mimeType: mime } : undefined;
          const rec = new MR(recordStream, opts);
          listenChunksRef.current = [];
          // Clear any previous draft's blob — fresh sing session.
          if(listenBlobRef.current?.url){ try{ URL.revokeObjectURL(listenBlobRef.current.url); }catch(_){} }
          listenBlobRef.current = null;
          listenPCMRef.current = null;
          rec.ondataavailable = (e)=>{ if(e.data && e.data.size>0) listenChunksRef.current.push(e.data); };
          rec.onstop = ()=>{
            const chunks = listenChunksRef.current;
            if(!chunks || chunks.length===0){ listenChunksRef.current=[]; return; }
            const type = rec.mimeType || mime || 'audio/webm';
            const blob = new Blob(chunks, { type });
            const url = URL.createObjectURL(blob);
            listenBlobRef.current = { blob, url, type };
            listenChunksRef.current = [];
            setHasMicBlob(true);
            (async()=>{
              try{
                const arrBuf = await blob.arrayBuffer();
                const ac2 = Tone.getContext().rawContext;
                const decode = (ab,ctx)=>new Promise((res,rej)=>{
                  let done=false; const tm=setTimeout(()=>{ if(!done){done=true;rej(new Error('decode timeout'));} },10000);
                  try{
                    ctx.decodeAudioData(ab, b=>{ if(!done){done=true;clearTimeout(tm);res(b);} }, e=>{ if(!done){done=true;clearTimeout(tm);rej(e||new Error('decode failed'));} });
                  }catch(_){
                    ctx.decodeAudioData(ab).then(b=>{ if(!done){done=true;clearTimeout(tm);res(b);} }, e=>{ if(!done){done=true;clearTimeout(tm);rej(e||new Error('decode failed'));} });
                  }
                });
                const buf2 = await decode(arrBuf, ac2);
                listenPCMRef.current = buf2;
              }catch(_){
                listenPCMRef.current = null;
              }
            })();
          };
          rec.start(1000);
          listenRecorderRef.current = rec;
          setHasMicBlob(false);
        }
      }catch(_){ /* recording optional — pitch-track still works without it */ }
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
      setErr(micErrMsg(e));setErrInfo(false);
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
  const saveAudio=useCallback(async(prepareOnly,withImage)=>{
    // Re-entry guard: rendering audio uses Tone.Offline, which is heavy. Without
    // this, repeated Save taps each kick off a parallel offline render — they
    // pile up, exhaust memory and crash/reload the app. Ignore taps while a
    // render is already in flight.
    if(savingRef.current) return;
    savingRef.current = true;
    try{
    const src=chordsRef.current&&chordsRef.current.length?chordsRef.current:chords;
    if(!src||!src.length){setScoreMsg({tone:'err',text:t('noNotesGeneric')});return;}
    const title=(compositionName||recordingName||'Paintiano').trim()||'Paintiano';
    const finalName=title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim().slice(0,40)+'.wav';
    setScoreMsg({tone:'wait',text:t('rendering')});
    let blob;
    try{ blob=await renderAudioOffline(src,{speed:1}); }
    catch(e){ blob=null; }
    // Tone.Offline temporarily replaces the global Tone context. Restore the
    // live audio path so the next playback isn't silent.
    try{ await unlockAudio(); }catch(_){}
    if(!blob){ setScoreMsg({tone:'err',text:t('renderFail')}); return; }
    // prepareOnly: don't fire the share sheet immediately. Instead hand the WAV
    // to the in-app audio row (recBlob/recName) — same pattern as Score — so the
    // user gets a named row with an explicit Share button and an ✕ to dismiss,
    // rather than being thrown straight into the iOS share sheet.
    // withImage: also stash the ORIGINAL source image so the Share button on the
    // row sends two files (picture + audio).
    if(prepareOnly){
      setScoreMsg(null);
      setRecName(finalName);
      setRecBlob(blob);
      setAudioSideImage(withImage ? (originalImgUrl||null) : null);
      setAudioRowOpen(true);
      return;
    }
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
    } finally { savingRef.current = false; }
  },[chords,loadedSource,compositionName,recordingName,t,unlockAudio]);
  const shareRecording=async()=>{
    if(!recBlob)return;
    const ext=recName.split('.').pop()||'m4a';
    const baseName=recName.replace(/\.[^.]+$/,'');
    const finalName=baseName+'.'+ext;
    setAudioShareMsg({tone:'wait',text:t('saving')});
    const file=new File([recBlob],finalName,{type:recBlob.type||'audio/mp4'});
    // When an original source image is stashed (image-mode Audio with the
    // "include source original image" box ticked), share BOTH the picture and
    // the audio so the user can save/post them together.
    let shareFiles=[file];
    if(audioSideImage){
      try{
        const resp=await fetch(audioSideImage); const imgBlob=await resp.blob();
        const imgExt=(imgBlob.type&&imgBlob.type.includes('png'))?'png':(imgBlob.type&&imgBlob.type.includes('webp'))?'webp':'jpg';
        const imgFile=new File([imgBlob],baseName+'.'+imgExt,{type:imgBlob.type||'image/jpeg'});
        shareFiles=[imgFile,file];
      }catch(_){ /* if the image can't be fetched, just share the audio */ }
    }
    // 1. Share sheet — phones + macOS
    if(navigator.share){
      try{
        const canTry=!navigator.canShare||navigator.canShare({files:shareFiles});
        if(canTry){
          await navigator.share({files:shareFiles,title:'Paintiano recording'});
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
  // Supersampling factor for the canvas backing — must match the paint effect so
  // the JSX-set backing and the effect's transform agree (keeping the backing in
  // JSX, consistent every render, avoids the black-screen window from setting it
  // only inside the effect).
  const _ssF=(immersive && viewMode==='paint')?2:1;
  const pct=(info||chords.length)?Math.round(disp/Math.max(1,chords.length)*100):null;
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
  const exportImage=async(sizeMode='web', directShare=false, audioBlob=null, audioName=null, withSource=false)=>{
    try{
      if(!chords.length){setErr(t('errs').nothingToPrint);setErrInfo(false);return;}
      // Export the style actually on screen — in shuffle mode that's the
      // seed-derived draw, not the (null) user selection.
      const style = effectiveStyle;
      const{N,BW,BH,CW,CH}=grid;
      // sizeMode: 'web' = 4× (good for screens/social), 'print' = A1 print
      let SCALE, label, dpi;
      if(sizeMode==='print'){
        // A1 = 594 × 841 mm = 23.39" × 33.11". At 300 DPI the long side is
        // 9933 px, short side 7016 px. We target the SHORTER A1 dimension as the
        // floor on the longer canvas side (≥ 7016 px) so any orientation reaches
        // A1 quality. CAP by absolute output pixels so small sources scale up to
        // the A1 floor while huge sources don't render a needlessly big bitmap.
        const A1_MIN=7016;
        let MAX_OUT=9933;             // A1 long side @ 300 DPI; desktop/Android can do this
        const maxSide=Math.max(CW,CH);
        // iOS / iPadOS Safari caps a single canvas at ~16.7M PIXELS TOTAL (not per
        // side): above that, toBlob() returns null → "could not encode image".
        // A 9933-px-long A1 canvas is ~7000×9933 ≈ 70M px² — over the iOS ceiling.
        // So on iOS, derive the long-side cap from the area budget for THIS aspect
        // ratio and clamp MAX_OUT to it; the reported DPI follows the real pixels.
        const _isIOS = (()=>{ try{
          return /iPad|iPhone|iPod/.test(navigator.userAgent)
            || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1); // iPadOS reports as Mac
        }catch(_){ return false; } })();
        if(_isIOS){
          const AREA_CAP=16000000;                 // ~16.0M px², safe under iOS 16.7M
          const aspect=maxSide/Math.min(CW,CH);    // long/short
          const iosLong=Math.floor(Math.sqrt(AREA_CAP*aspect));
          MAX_OUT=Math.min(MAX_OUT, iosLong);
        }
        const minScaleForA1=Math.ceil(A1_MIN/maxSide);
        const capScale=Math.floor(MAX_OUT/maxSide);
        // capScale wins over the A1 floor when they conflict (iOS can't reach full
        // A1 @ 300 in one canvas — better a lower DPI that actually encodes than a
        // null blob). Never below 1.
        SCALE=Math.max(1, Math.min(capScale||1, minScaleForA1));
        // Honest DPI: actual long-side pixels / A1 long side in inches (33.11").
        dpi=Math.round((maxSide*SCALE)/33.11);
        label='A1-print';
      } else if(sizeMode==='gallery'){
        // Vector SVG export — resolution-independent for fine-art / gallery prints.
        // The print shop's RIP rasterises at whatever DPI it supports (giclée
        // printers do 600-1200 DPI). The SVG file itself stays small (KB-MB),
        // opens in Illustrator/Inkscape, and can be tiled to any size without
        // pixelation. SCALE=1 means the SVG uses canvas-space coordinates.
        SCALE=1;
        dpi=null;
        label='gallery-vector';
      } else if(sizeMode==='story'){
        SCALE=4;          // crisp source; composited onto the 1080×1920 story canvas below
        dpi=null;
        label='story';
      } else {
        SCALE=4;
        dpi=null;
        label='web';
      }
      const _isGallery = sizeMode==='gallery';
      const hi = _isGallery ? null : document.createElement('canvas');
      if(hi){ hi.width=Math.round(CW*SCALE); hi.height=Math.round(CH*SCALE); }
      const hctx = _isGallery ? createSvgCtx(CW, CH) : hi.getContext('2d');
      if(!_isGallery){
        hctx.imageSmoothingEnabled=false;
        hctx.scale(SCALE,SCALE);
      }
      hctx.fillStyle='#04040a';hctx.fillRect(0,0,CW,CH);
      if(viewMode==='image'&&pixelRef.current){
        const{nc,nr,px}=pixelRef.current;
        for(let i=0;i<nc*nr;i++){
          const row=Math.floor(i/nc),col=i%nc,p=px[i];
          hctx.fillStyle=`rgba(${p.r},${p.g},${p.b},0.42)`;hctx.fillRect(col*BW-1,row*BH-1,BW+2,BH+2);
          hctx.fillStyle=`rgb(${p.r},${p.g},${p.b})`;hctx.fillRect(col*BW+.5,row*BH+.5,BW-1,BH-1);
        }
      }else{
        _setArtistSeed(pollockSessionSeed);
        _setVariantCap(proStatus==='free' ? 2 : null);
        _ensureEnergies(chords);
        chords.forEach((chord)=>{
          const {n:notes,idx}=chord; _setCurE(chord._E);
          const cell=grid.cells&&grid.cells[idx];
          if(cell&&cell.segments)cell.segments.forEach(s=>drawBlock(hctx,s.x,s.y,notes,gc,s.w,s.h,style));
          else if(cell)drawBlock(hctx,cell.x,cell.y,notes,gc,cell.w,cell.h,style);
          else{const si=idx%(N*N),col=si%N,row=Math.floor(si/N);drawBlock(hctx,col*BW,row*BH,notes,gc,BW,BH,style);}
        });
        _setCurE(0.5);
        // Pollock global drip overlay — drawn over all rendered cells.
        // hctx is already scaled; pass canvas-space CW/CH so the splatters
        // span the painting at export resolution.
        if(style==='pollock' && chords.length>0){
          drawPollockOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='picasso' && chords.length>0){
          drawPicassoOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='kusama' && chords.length>0){
          drawKusamaOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, paintPhase);
        }
        if(style==='miro' && chords.length>0){
          drawMiroOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        // Kandinsky canvas-wide contour overlay.
        if(style==='kandinsky' && chords.length>0){
          drawKandinskyOverlay(hctx, CW, CH, chords.length, pollockSessionSeed, mode, gc, paintPhase, chords.length, chords);
        }
        if(style==='rothko' && chords.length>0){
          drawRothkoOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='matisse' && chords.length>0){
          drawMatisseOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='mondrian' && chords.length>0){
          drawMondrianOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='bauhaus' && chords.length>0){
          drawBauhausOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='bulge' && chords.length>0){
          drawBulgeOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='arcs' && chords.length>0){
          drawArcsOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='bloom' && chords.length>0){
          drawBloomOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='spiral' && chords.length>0){
          drawSpiralOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='gold' && chords.length>0){
          drawGoldOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='pop' && chords.length>0){
          drawPopOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='wave' && chords.length>0){
          drawWaveOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='mitchell' && chords.length>0){
          drawMitchellOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='monet' && chords.length>0){
          drawMonetOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='hokusai' && chords.length>0){
          drawHokusaiOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, paintPhase);
        }
        if(style==='oneM' && chords.length>0){
          drawOneMOverlay(hctx, CW, CH, chords, chords.length, gc, pollockSessionSeed, mode, 0);
        }
      }
      // ── GALLERY (vector SVG) export: branch out here, before all the
      // canvas-only postprocessing (watermark, source thumb overlay, story
      // compositing). The SVG carries everything the renderer drew; print
      // shops rasterise at whatever DPI they need. Watermark is skipped for
      // Pro/Pro AI users (and gallery is Pro-only anyway).
      if(_isGallery){
        const svgStr = hctx.toSvg();
        const blob = new Blob([svgStr], {type:'image/svg+xml'});
        const url = URL.createObjectURL(blob);
        const baseName = (info && info.title ? String(info.title).replace(/[^\w\u00C0-\u024F\u1E00-\u1EFF -]+/g,'').trim() : 'paintiano') || 'paintiano';
        const filename = `${baseName}-gallery.svg`;
        const file = new File([blob], filename, {type:'image/svg+xml'});
        setPreview({url, filename, w:CW, h:CH, size:blob.size, file, dpi:null, label});
        return;
      }
      // Watermark policy: stamp "paintiano.app" unless we KNOW the user is
      // Pro (or Pro AI). `isPro` here is `pro || pro_ai` and is `false` while
      // proStatus is still 'loading' — so a fast Free export at app open won't
      // accidentally slip through unwatermarked.
      applyWatermark(hi, isPro);
      // Optional source-image thumbnail overlay (web/print only). Drawn AFTER
      // watermark so it sits on top of the painting. Source picked from
      // originalImgUrl (regular image mode) or imgMoodThumb (MFI hand-off).
      // For Story, the source thumb is rendered SEPARATELY on the Story
      // canvas above the painting (see Story compose block below) — corner
      // overlay would look glued/cluttered against the social-format frame.
      const srcThumbUrl = withSource ? (originalImgUrl || imgMoodThumb) : null;
      if(srcThumbUrl && sizeMode!=='story'){
        try{
          const srcImg = await new Promise((res,rej)=>{
            const im = new Image();
            im.onload = ()=>res(im);
            im.onerror = ()=>rej(new Error('thumb load'));
            im.src = srcThumbUrl;
          });
          const iw=srcImg.naturalWidth||srcImg.width;
          const ih=srcImg.naturalHeight||srcImg.height;
          if(iw>0 && ih>0){
            // Thumb sized to ~18% of the painting's shorter side. Mounted
            // bottom-right with a small margin, framed with a thin gold
            // border that matches the app's chrome.
            const targetShort = Math.round(Math.min(hi.width, hi.height) * 0.18);
            const aspect = iw/ih;
            let tw, th;
            if(aspect>=1){ th = targetShort; tw = Math.round(th*aspect); }
            else        { tw = targetShort; th = Math.round(tw/aspect); }
            const margin = Math.round(targetShort * 0.18);
            const tx = hi.width - tw - margin;
            const ty = hi.height - th - margin;
            // Draw without the scale transform (which was set for chord-grid
            // coords) — save/reset/restore.
            const tctx = hi.getContext('2d');
            tctx.save();
            tctx.setTransform(1,0,0,1,0,0);
            // subtle drop shadow behind the thumb
            tctx.shadowColor = 'rgba(0,0,0,.55)';
            tctx.shadowBlur = Math.round(targetShort*0.08);
            tctx.shadowOffsetY = Math.round(targetShort*0.03);
            tctx.drawImage(srcImg, tx, ty, tw, th);
            tctx.restore();
            // gold frame on top, no shadow
            tctx.save();
            tctx.setTransform(1,0,0,1,0,0);
            tctx.strokeStyle = 'rgba(201,168,76,.85)';
            tctx.lineWidth = Math.max(2, Math.round(targetShort*0.012));
            tctx.strokeRect(tx, ty, tw, th);
            tctx.restore();
          }
        }catch(_){/* thumb overlay best-effort — never block export */}
      }
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
        // In IMAGE mode the artwork to show IS the original picture, not the
        // mosaic painting. Load the original and use it as the main image; skip
        // the separate thumbnail (the original already fills the main slot).
        const imageModeStory = (viewMode==='image' && originalImgUrl);
        let mainImg = null;
        if(imageModeStory){
          try{
            mainImg = await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=()=>rej(new Error('orig load')); im.src=originalImgUrl; });
          }catch(_){ mainImg=null; }
        }
        // Source thumbnail (when withSource) — drawn ABOVE the painting as a
        // small framed image. Suppressed in image-mode story (the original is
        // already the main artwork there).
        let storyThumbImg = null;
        const storySrcThumbUrl = (!imageModeStory && withSource) ? (originalImgUrl || imgMoodThumb) : null;
        if(storySrcThumbUrl){
          try{
            storyThumbImg = await new Promise((res,rej)=>{
              const im=new Image();
              im.onload=()=>res(im);
              im.onerror=()=>rej(new Error('story thumb load'));
              im.src=storySrcThumbUrl;
            });
          }catch(_){ storyThumbImg=null; }
        }
        // Story vertical layout: optional thumb at top, painting in the
        // middle band, mood + wordmark below. Calculate Y positions so
        // everything stays inside the 1920-tall safe area.
        const margin=90;
        const availW=SW-margin*2;
        const _artImg = (imageModeStory && mainImg) ? mainImg : hi;
        const _artW = _artImg.width || _artImg.naturalWidth;
        const _artH = _artImg.height || _artImg.naturalHeight;
        let thumbY = 0, thumbH = 0;
        const THUMB_SHORT = 220;       // shorter-side target for the thumb
        const THUMB_TOP_MARGIN = 130;  // breathing room from the top edge
        const THUMB_BOTTOM_GAP = 60;   // gap between thumb and painting
        if(storyThumbImg){
          const iw=storyThumbImg.naturalWidth||storyThumbImg.width;
          const ih=storyThumbImg.naturalHeight||storyThumbImg.height;
          const aspect = iw && ih ? iw/ih : 1;
          let tw, th;
          if(aspect>=1){ th = THUMB_SHORT; tw = Math.round(th*aspect); }
          else        { tw = THUMB_SHORT; th = Math.round(tw/aspect); }
          // Cap width so wide thumbs don't bleed off the canvas
          const maxTw = SW - margin*2;
          if(tw > maxTw){ const k = maxTw/tw; tw = maxTw; th = Math.round(th*k); }
          const tx = Math.round((SW - tw)/2);
          thumbY = THUMB_TOP_MARGIN;
          thumbH = th;
          // drop shadow under thumb
          sctx.save();
          sctx.shadowColor='rgba(0,0,0,.55)'; sctx.shadowBlur=20; sctx.shadowOffsetY=6;
          sctx.drawImage(storyThumbImg, tx, thumbY, tw, th);
          sctx.restore();
          // gold frame
          sctx.strokeStyle='rgba(201,168,76,.55)'; sctx.lineWidth=2;
          sctx.strokeRect(tx, thumbY, tw, th);
        }
        // Painting placement: below the thumb (if any), centered in the
        // remaining vertical space. The wordmark + mood need ~260px below
        // the painting; bias the painting upward toward the thumb so the
        // composition reads top→down.
        // ── "inspired by" / bare-label header above the painting ──
        // Mirrors the fullscreen header logic so the story shows what style
        // is on the canvas. Suppressed in image-mode story (the original
        // photo IS the canvas there) and when the canvas is empty.
        const _inspKey = (!imageModeStory && chords.length>0)
          ? (effectiveStyle || (shuffleStyle && shuffleStyle!=='mosaic' ? shuffleStyle : 'mosaic'))
          : null;
        const _inspBare = (_inspKey==='mosaic' || _inspKey==='notes');
        const _inspLabel = _inspKey
          ? (_inspBare ? STYLE_INSPIRED[_inspKey] : `inspired by ${STYLE_INSPIRED[_inspKey]}`)
          : null;
        const INSPIRED_BAR_H = _inspLabel ? 90 : 0;
        const paintingTopMin = (thumbH ? (thumbY + thumbH + THUMB_BOTTOM_GAP) : 160) + INSPIRED_BAR_H;
        const paintingBottomReserve = 290; // mood + wordmark + tagline
        const paintingAvailH = SH - paintingTopMin - paintingBottomReserve;
        // Scale painting to fit BOTH dimensions. Width-only scaling overflowed
        // the canvas footer on tall sources (mood-from-image with a portrait
        // photo cropped off the mood/wordmark/tagline). Take the limiting
        // axis so the painting always lands inside the safe area, and center
        // it horizontally when scale-down narrows it.
        const _scaleW = availW / _artW;
        const _scaleH = paintingAvailH / _artH;
        const scale = Math.min(_scaleW, _scaleH);
        const dw = Math.round(_artW * scale);
        const dh = Math.round(_artH * scale);
        const dy = paintingTopMin + Math.max(0, Math.round((paintingAvailH - dh)/2));
        const dx = Math.round((SW - dw) / 2);
        if(_inspLabel){
          sctx.save();
          sctx.textAlign='center';
          sctx.fillStyle='rgba(201,168,76,.78)';
          // Italic serif matches the FS header; size scales to fit oneM's long label.
          const _fontSize = _inspLabel.length > 28 ? 36 : 44;
          sctx.font=`italic 500 ${_fontSize}px "Cormorant Garamond", Georgia, serif`;
          sctx.fillText(_inspLabel, SW/2, dy - 30);
          sctx.restore();
        }
        sctx.save();
        sctx.shadowColor='rgba(0,0,0,.55)'; sctx.shadowBlur=40; sctx.shadowOffsetY=12;
        sctx.drawImage(_artImg, dx, dy, dw, dh);
        sctx.restore();
        sctx.strokeStyle='rgba(201,168,76,.35)'; sctx.lineWidth=2;
        sctx.strokeRect(dx, dy, dw, dh);
        // mood label + wordmark + tagline below the art. Mood comes from
        // currentMood when set (mood pick, MFI auto-detected mood, etc.);
        // skipped when the composition has no mood association (pure MIDI /
        // score / audio import). Italic serif to feel like a caption.
        sctx.textAlign='center';
        const moodLabel = (currentMood||'').trim();
        let cursorY = dy + dh + 110;
        if(moodLabel){
          sctx.fillStyle='rgba(255,220,140,.95)';
          sctx.font='italic 500 44px "Cormorant Garamond", Georgia, serif';
          sctx.fillText(moodLabel, SW/2, cursorY);
          cursorY += 80;
        }
        sctx.fillStyle='#f0c040';
        sctx.font='600 64px "Cormorant Garamond", Georgia, serif';
        sctx.fillText('Paintiano', SW/2, cursorY);
        cursorY += 48;
        sctx.fillStyle='rgba(201,168,76,.7)';
        sctx.font='500 28px "Outfit", Arial, sans-serif';
        sctx.fillText('music → φ painting', SW/2, cursorY);
        outCanvas=st;
        // Watermark on the Story composite — the one we applied to `hi` above
        // got shrunk along with the painting when drawImage'd onto this 1080×
        // 1920 canvas (text 12–30px at hi resolution becomes a smear here).
        // Re-stamp on the final canvas so Free Story exports still carry the
        // mark. Pro skips this (applyWatermark is a no-op when isPro=true).
        applyWatermark(st, isPro);
      }
      let blob=await new Promise(res=>outCanvas.toBlob(res,'image/png'));
      let _mime='image/png', _ext='png';
      if(!blob){
        // PNG encode of a very large canvas can fail on iOS even when the canvas
        // itself is valid. JPEG uses far less memory to encode — try it before
        // giving up, so Print still produces a (slightly lossy) high-res file.
        blob=await new Promise(res=>outCanvas.toBlob(res,'image/jpeg',0.92));
        if(blob){ _mime='image/jpeg'; _ext='jpg'; }
      }
      if(!blob){setErr(t('errs').printEncode);setErrInfo(false);return;}
      const title=compositionName.trim()||info?.title||'painting';
      const filename=`paintiano-${title.replace(/[^\w-]+/g,'_').slice(0,60)}-${outCanvas.width}x${outCanvas.height}-${label}.${_ext}`;
      const file=new File([blob],filename,{type:_mime});
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
          // iOS suspends the AudioContext while the share sheet is on screen.
          // After it dismisses, resume so subsequent Play / REC still has audio.
          try{ await unlockAudio(); }catch(_){}
          URL.revokeObjectURL(url);
          return;
        }catch(e){
          // Resume even on cancel/error — the share sheet was shown and the
          // context may already be suspended.
          try{ await unlockAudio(); }catch(_){}
          if(e&&e.name==='AbortError'){ URL.revokeObjectURL(url); return; }
          // fall through to preview so the user still gets the image
        }
      }
      setPreview({url,filename,w:outCanvas.width,h:outCanvas.height,size:blob.size,file,dpi,label});
    }catch(e){setErr('Print: '+e.message);setErrInfo(false);}
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
  // First-visit onboarding (v3). Reads the localStorage flag synchronously
  // during initial state setup so we don't briefly flash the setup screen.
  // Feature-flagged via ONBOARDING_V3 — set it false in 01-core-head to disable
  // the feature entirely for everyone.
  const [showOnboarding, setShowOnboarding] = useState(()=>{
    if(!ONBOARDING_V3) return false;
    try { return typeof localStorage!=='undefined' && localStorage.getItem('paintiano_onboarded') !== '1'; }
    catch(_) { return false; }
  });
  // Help cheat-sheet popup — gold "?" FAB bottom-right opens this. Volatile
  // boolean (no persistence) — every fresh visit defaults to closed.
  const [showHelp, setShowHelp] = useState(false);
  // ── Legal modal: which legal doc is shown inside the in-app modal
  // ('pricing' | 'terms' | 'privacy' | 'refunds' | null). null = closed.
  // We fetch the matching public/*.html on demand and inline-render it so the
  // user never leaves the Paintiano context (no new tab, no full-page nav).
  const [legalDoc, setLegalDoc] = useState(null);
  const [legalHtml, setLegalHtml] = useState('');
  const [legalLoading, setLegalLoading] = useState(false);
  useEffect(()=>{
    if(!legalDoc){ setLegalHtml(''); return; }
    let cancelled=false;
    setLegalLoading(true);
    fetch('/'+legalDoc+'.html').then(r=>r.text()).then(t=>{
      if(cancelled) return;
      // Strip everything before <body> and after </body> so we render
      // only the page's content — outer <html>/<head> would clash with
      // the app's own document and break styles.
      const m = t.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      let body = m ? m[1] : t;
      // The HTML file contains all 8 language sections side-by-side plus a
      // small standalone-mode <script> with localStorage-based language
      // detection. Inside the modal we don't want either of those: the
      // <script> would not execute through dangerouslySetInnerHTML anyway,
      // and the default `wrap active` on the EN section would lock us to
      // English. Strip the script and clear the default active so the
      // memoized renderer below can activate the section matching `lang`.
      body = body.replace(/<script[\s\S]*?<\/script>/gi, '');
      // Some older privacy.html / pricing.html builds still ship the
      // <div class="langpick"><select id="lang">...</select></div> picker
      // used in standalone-tab mode. Inside the modal it would render an
      // unstyled, non-functional dropdown (the JS never executes through
      // dangerouslySetInnerHTML), so strip it unconditionally.
      body = body.replace(/<div class="langpick"[\s\S]*?<\/div>\s*/gi, '');
      body = body.replace(/class="wrap active"/g, 'class="wrap"');
      setLegalHtml(body);
      setLegalLoading(false);
    }).catch(()=>{ if(!cancelled){ setLegalHtml('<p style="color:#c9a84c;text-align:center;padding:40px">Could not load. Please try again.</p>'); setLegalLoading(false); } });
    return ()=>{ cancelled=true; };
  },[legalDoc]);
  // Switch the fetched HTML to the current app language. The standalone HTML
  // file relies on a <style>[data-lang]:not(.active){display:none}</style>
  // rule in its <head> to show only the active section — but stripping
  // <body> drops that rule, so we re-inject it inline. We then promote the
  // section whose data-lang matches the app's `lang` to `wrap active`.
  // App codes are uppercase (EN/DE/FR/ES/SK/PT) plus the camelCase zh/zhTW;
  // HTML attrs are lowercase except zhTW. Re-runs whenever lang changes
  // mid-modal so switching language in the app live-updates the open doc.
  const legalHtmlForLang = useMemo(()=>{
    if(!legalHtml) return '';
    const map = {EN:'en', DE:'de', FR:'fr', ES:'es', SK:'sk', PT:'pt', zh:'zh', zhTW:'zhTW', ja:'ja'};
    const code = map[lang] || 'en';
    const target = 'class="wrap" data-lang="'+code+'"';
    let h = legalHtml;
    if (h.indexOf(target) >= 0) {
      h = h.replace(target, 'class="wrap active" data-lang="'+code+'"');
    } else {
      // Fall back to EN if the requested language is missing in this doc.
      h = h.replace('class="wrap" data-lang="en"', 'class="wrap active" data-lang="en"');
    }
    return '<style>[data-lang]:not(.active){display:none}</style>'+h;
  },[legalHtml, lang]);
  // Intercept clicks on cross-doc anchors inside the modal — instead of
  // following the href (which would navigate the whole page), open the
  // matching doc inside the modal.
  const onLegalClick = useCallback((e)=>{
    const a = e.target.closest('a');
    if(!a) return;
    const href = a.getAttribute('href') || '';
    const m = href.match(/^\/?(pricing|terms|privacy|refunds)\.html$/i);
    if(m){ e.preventDefault(); setLegalDoc(m[1].toLowerCase()); }
  },[]);
  // Onboarding phase: 'preview' (idle hero with ▶), 'playing' (real-time mirror
  // of the main canvas drawing the sample), 'done' (sample finished, CTA bar
  // appears with "Try your own" + replay).
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
  // Lite: when the canvas first appears (active view), snap the page to the top
  // so the header sits up top and the canvas fills the screen — the intended
  // opening pose. Without this the page can stay scrolled mid-way after the
  // auto-loaded sample kicks in.
  const _liteScrolledRef = useRef(false);
  useEffect(()=>{
    if(!basicMode){ _liteScrolledRef.current=false; return; }
    if(isActiveView && !_liteScrolledRef.current){
      _liteScrolledRef.current = true;
      requestAnimationFrame(()=>{ try{ window.scrollTo({top:0,behavior:'smooth'}); }catch(_){} });
    } else if(!isActiveView){
      _liteScrolledRef.current = false;
    }
  },[basicMode,isActiveView]);
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
  // ── Onboarding: mirror the main canvas into a mini canvas inside the
  // onboarding box during the 'playing' phase. We just drawImage from the
  // main <canvas> (which is doing the real painting) onto our mini one each
  // animation frame. No drawing logic is duplicated — the demo is literally
  // a real-time copy of the main canvas, scaled down.
  const onboardingCanvasRef = useRef(null);
  useEffect(()=>{
    if(!showOnboarding || onboardingPhase==='preview') return;
    const mini = onboardingCanvasRef.current;
    const main = canvasRef.current;
    if(!mini || !main) return;
    const mctx = mini.getContext('2d');
    if(!mctx) return;
    let raf = 0;
    const tick = ()=>{
      try {
        // Clear then draw scaled. Mini canvas is sized to its display size in
        // its useEffect setup below; drawImage scales the main into the mini.
        mctx.clearRect(0,0,mini.width,mini.height);
        mctx.drawImage(main, 0, 0, mini.width, mini.height);
      } catch(_){}
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return ()=> cancelAnimationFrame(raf);
  },[showOnboarding, onboardingPhase]);
  // Detect when the onboarding sample finishes — flip to 'done' phase.
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
    // Hide the floating controls after a short idle so the painting reads clean.
    // ◆ Lite on desktop/tablet — the CTAs float over the canvas, so they fade
    //   after 2s of no pointer activity (snappy clean plate), revealed again on
    //   any move/tap. ◆ During playback / fullscreen everywhere else: 4s.
    // Auto-hide the floating CTAs only in Lite fullscreen on a tablet held in
    // PORTRAIT (isNotPhone = tablet/desktop sized, !is5Col = not landscape).
    // There the CTAs overlay the tall canvas, so they fade after 2s of no
    // pointer activity (snappy clean plate) and reveal on any move/tap.
    const liteFloat = basicMode && immersive && isNotPhone && !is5Col;
    if(liteFloat){ controlsIdleRef.current = setTimeout(()=>setControlsAwake(false), 2000); }
    else if(playing || immersive){ controlsIdleRef.current = setTimeout(()=>setControlsAwake(false), 4000); }
  },[playing,immersive,basicMode,isNotPhone,is5Col]);
  // When playback stops, reveal controls. Outside fullscreen they then stay put;
  // in fullscreen we re-arm the idle countdown so a finished, still piece also
  // fades its controls. Entering/leaving fullscreen re-evaluates this. Lite
  // desktop/tablet also re-arms so its floating CTAs fade when idle.
  useEffect(()=>{
    if(controlsIdleRef.current) clearTimeout(controlsIdleRef.current);
    setControlsAwake(true);
    if(playing || immersive || (basicMode && immersive && isNotPhone && !is5Col)){ wakeControls(); }
    return ()=>{ if(controlsIdleRef.current) clearTimeout(controlsIdleRef.current); };
  },[playing,immersive,basicMode,isNotPhone,is5Col,wakeControls]);
  // Lite fullscreen on a tablet in portrait: any pointer move / tap reveals the
  // floating CTAs and re-arms their 2s idle fade. Other layouts keep CTAs put.
  useEffect(()=>{
    if(!(basicMode && immersive && isNotPhone && !is5Col)) return;
    const wake=()=>wakeControls();
    window.addEventListener('pointermove',wake,{passive:true});
    window.addEventListener('pointerdown',wake,{passive:true});
    return ()=>{ window.removeEventListener('pointermove',wake); window.removeEventListener('pointerdown',wake); };
  },[basicMode,immersive,isNotPhone,is5Col,wakeControls]);
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
    // Newly-started activity normally returns us to the canvas. EXCEPTION: an
    // image-mode REC (started from the setup panel) should stay put — the user
    // is recording in place and expects REC→SAVE without the view jumping to the
    // default play screen. keepSetupDuringRecRef guards that case.
    if((working||composeMode||micActive||playing) && !keepSetupDuringRecRef.current){ setForceSetup(false); }
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
    <div onPointerDown={basicTapUnlock} className={"pf-app-root"+(basicMode?' pf-mode-lite':'')+((composeMode||micActive)?' pf-mode-live':'')+((loadedSource==='image'&&!moodFromImg)?' pf-mode-imagescan':'')+(moodFromImg?' pf-mode-mfi':'')+(isSetupView?' pf-mode-setup':'')+(immersive?' pf-immersive':'')} style={{'--pf-read-scale':effScale,background:'radial-gradient(ellipse at 50% -10%,#0e0b16,#06060c 55%)',minHeight:'100vh',width:'100%',maxWidth:'100vw',overflowX:'hidden',boxSizing:'border-box',display:'flex',flexDirection:'column',alignItems:'center',padding:showOnboarding?'48px 16px':(!isActiveView?(isDesktop?'28px 16px':'48px 16px'):((composeMode||micActive)?'4px 16px 200px':(basicMode?'4px 16px 160px':'12px 16px 220px'))),fontFamily:"'Outfit','Helvetica Neue','PingFang SC','PingFang TC','Hiragino Sans GB','Microsoft YaHei','Microsoft JhengHei',Arial,sans-serif",color:PF.cream,touchAction:'manipulation'}}>
      <style dangerouslySetInnerHTML={{__html:`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,600;1,400&family=Outfit:wght@300;400;500;600;700&display=swap');`+PF_STYLE+`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pfDemoFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes pfPulse{0%,100%{transform:scale(1);box-shadow:0 6px 22px rgba(240,192,64,.45)}50%{transform:scale(1.04);box-shadow:0 8px 28px rgba(240,192,64,.65)}}@keyframes pfFloat{0%,100%{transform:translate(0,0)}50%{transform:translate(0,-6px)}}@keyframes pfMarquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}}/>
      {showIntro && <IntroSplash onDone={()=>setShowIntro(false)} tagline={'paintings, played'} skipLabel={'tap to skip'} />}
      {showOnboarding && !showIntro && !basicMode && (()=>{
        // First-visit hero. Shows a Miró-style preview of what Paintiano produces,
        // a big play CTA that loads the trimmed Liszt sample (30 s) and starts
        // playback, and a quiet "skip" link for users who'd rather explore on
        // their own. Both paths mark the localStorage flag and unmount this
        // overlay; the standard setup screen mounted underneath then takes over.
        const playSample = async ()=>{
          // Set visual prefs that pair with Liebestraum.
          setStyle('pollock');
          setMode('spectral');
          // Load events (fills chord state — viewMode becomes 'paint').
          loadSampleMidiTrimmed(30000);
          // Stay in the onboarding overlay — flip phase so the mini canvas
          // starts mirroring. Auto-play after a short delay so React commits
          // the chord state first.
          setOnboardingPhase('playing');
          setTimeout(()=>{ try { startPlay && startPlay(); } catch(_){} }, 280);
        };
        const replaySample = ()=>{
          // Stop current playback, then re-run playSample from scratch.
          try { stopAll(); } catch(_){}
          setOnboardingPhase('preview');
          setTimeout(()=> playSample(), 100);
        };
        const commitAndExit = ()=>{
          // User chose "Try your own" — stop playback, wipe canvas, clear all
          // latches (style, stayActive, loadedSource) so the app cleanly returns
          // to the setup screen.
          try { stopAll(); wipeCanvasNow(); setStyle(null); setStayActive(false); setLoadedSource(null); } catch(_){}
          dismissOnboarding();
        };
        const skipOnboarding = ()=>{
          // Skip from any phase — same teardown as commit. The stayActive latch
          // gets set whenever a sample is loaded; without clearing it here, the
          // app would stay in the empty canvas view instead of jumping back to
          // the setup screen.
          try { stopAll(); wipeCanvasNow(); setStyle(null); setStayActive(false); setLoadedSource(null); } catch(_){}
          dismissOnboarding();
        };
        // Unified onboarding layout: dark full-screen background, title at
        // top, demo box in the middle (fake painting in 'preview', live mirror
        // of the main canvas in 'playing', last-frame snapshot in 'done'),
        // caption beneath, phase-specific CTA, skip link at the very bottom.
        const isPlaying = onboardingPhase === 'playing';
        const isDone    = onboardingPhase === 'done';
        return (
          <div style={{position:'fixed',inset:0,zIndex:99998,background:'radial-gradient(ellipse at 50% -10%,#0e0b16,#06060c 55%)',display:'flex',flexDirection:'column',alignItems:'center',padding:'90px 16px 22px',overflowY:'auto',animation:'pfDemoFade .5s ease-out'}}>
            <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:600,fontSize:'2.2rem',color:PF.gold,letterSpacing:'-.01em',marginBottom:4,textAlign:'center'}}>{t('onbTitle')||'Paintiano'}</h1>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:'.95rem',color:'rgba(242,238,232,.7)',marginBottom:22,textAlign:'center'}}>{t('onbSubtitle')||'music turns into paintings'}</div>

            {/* Demo box — same shape in all 3 phases */}
            <div style={{position:'relative',width:'min(440px, 92vw)',aspectRatio:'1.4 / 1',borderRadius:18,border:'1px solid rgba(201,168,76,.3)',overflow:'hidden',background:'radial-gradient(ellipse at 30% 20%, #2a1545 0%, #100620 30%, #06060c 70%)',boxShadow:'0 18px 60px rgba(0,0,0,.5)'}}>
              {/* Fake painting layer — visible in 'preview' only */}
              {!isPlaying && !isDone && (
                <>
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
                  <button onClick={playSample} aria-label="play sample" style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',display:'inline-flex',alignItems:'center',gap:10,padding:'15px 28px',borderRadius:30,cursor:'pointer',fontFamily:'inherit',fontSize:'.95rem',fontWeight:700,letterSpacing:'.15em',textTransform:'uppercase',color:'#0a0a12',background:'linear-gradient(135deg,'+PF.gold+','+PF.gold2+')',border:'1px solid '+PF.gold2,boxShadow:'0 6px 22px rgba(240,192,64,.45)',animation:'pfPulse 2.2s ease-in-out infinite',WebkitTapHighlightColor:'transparent'}}>
                    <span style={{fontSize:'1.1rem',lineHeight:1}}>▶</span> {t('onbPlayLabel')||'Play sample'}
                  </button>
                </>
              )}
              {/* Mirror canvas — visible in 'playing' AND 'done' (keeps last
                  frame after playback stops). It's drawn each frame from the
                  real main canvas via the useEffect above. */}
              {(isPlaying || isDone) && (
                <canvas ref={onboardingCanvasRef} width={616} height={440} style={{width:'100%',height:'100%',display:'block'}}/>
              )}
            </div>

            <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:'.9rem',color:'rgba(242,238,232,.7)',marginTop:18,textAlign:'center'}}>
              {t('onbCaption')||'Liebestraum — Liszt · painted by Pollock'}
            </div>

            {/* Phase-specific bottom area */}
            {!isPlaying && !isDone && (
              <div style={{marginTop:24,maxWidth:'min(420px, 90vw)',fontSize:'.78rem',lineHeight:1.6,color:'rgba(242,238,232,.5)',textAlign:'center'}}>
                {t('onbDescription')||'Paintiano listens to music and turns each chord into a brushstroke. Every painting is unique.'}
              </div>
            )}
            {isPlaying && (
              <div style={{marginTop:22,fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:'.8rem',color:'rgba(242,238,232,.5)',letterSpacing:'.04em',textAlign:'center'}}>
                {t('onbHint')||'each chord becomes a brushstroke…'}
              </div>
            )}
            {isDone && (
              <div style={{marginTop:22,display:'flex',gap:10,alignItems:'center'}}>
                <button onClick={replaySample} style={{padding:'11px 18px',background:'rgba(28,24,40,.6)',color:'rgba(207,197,168,.9)',border:'1px solid rgba(207,197,168,.3)',borderRadius:24,cursor:'pointer',fontFamily:'inherit',fontSize:'.7rem',fontWeight:600,letterSpacing:'.12em',textTransform:'uppercase',WebkitTapHighlightColor:'transparent'}}>↻ {t('onbReplay')||'Replay'}</button>
                <button onClick={commitAndExit} style={{padding:'13px 28px',display:'inline-flex',alignItems:'center',gap:6,color:'#0a0a12',background:'linear-gradient(135deg,'+PF.gold+','+PF.gold2+')',border:'1px solid '+PF.gold2,borderRadius:26,cursor:'pointer',fontFamily:'inherit',fontSize:'.8rem',fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',boxShadow:'0 6px 22px rgba(240,192,64,.35)',WebkitTapHighlightColor:'transparent'}}>{t('onbTryYourOwn')||'Try your own'} ›</button>
              </div>
            )}

            {/* Skip — always visible at the bottom */}
            <button onClick={skipOnboarding} style={{marginTop:'auto',marginBottom:8,padding:'10px 24px',background:'transparent',border:'none',color:'rgba(242,238,232,.4)',fontFamily:'inherit',fontSize:'.7rem',fontWeight:500,letterSpacing:'.2em',textTransform:'uppercase',cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
              {t('onbSkip')||'skip'}
            </button>
          </div>
        );
      })()}
      {/* My Music — Save modal + Saved flash (rendered at top
          level so it works in both Lite and Advanced). */}
      {/* My Music — Save modal (♡ tap on canvas). Prefilled name, target
          slot info, Save/Cancel. If archive is full, shows warning instead
          of the input. Fáza 2 will add the drawer for view/delete/load. */}
      {showMyMusicSaveModal && (
        <div onClick={()=>{ if(!myMusicSaving) setShowMyMusicSaveModal(false); }} style={{position:'fixed',inset:0,zIndex:20000,background:'rgba(4,3,8,0.7)',backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:400,background:'#0e0b16',border:'1px solid rgba(201,168,76,.35)',borderRadius:16,padding:'20px 22px 22px',display:'flex',flexDirection:'column',gap:16}}>
            <div style={{fontSize:(.7*effScale)+'rem',fontWeight:500,letterSpacing:'.16em',textTransform:'uppercase',color:'rgba(220,180,90,.9)',textAlign:'center'}}>{ts('mymusicSaveTitle',({EN:'Save to My Music',SK:'Uložiť do Moja hudba',DE:'In Meine Musik speichern',FR:'Enregistrer dans Ma musique',ES:'Guardar en Mi música',PT:'Guardar em Minha música',zh:'保存到我的音乐',zhTW:'儲存到我的音樂',ja:'マイミュージックに保存'})[lang]||'Save to My Music')}</div>
            {myMusicSaveTargetSlot === null ? (
              <div style={{padding:'12px 14px',borderRadius:8,background:'rgba(232,85,122,.12)',border:'1px solid rgba(232,85,122,.4)',color:'#ff9ab4',fontSize:(.62*effScale)+'rem',lineHeight:1.4,textAlign:'center'}}>{ts('mymusicFull',({EN:'Archive is full (5/5). Open the archive and delete a slot first.',SK:'Archív je plný (5/5). Otvor archív a najprv odstráň slot.',DE:'Archiv voll (5/5). Öffne das Archiv und lösche zuerst einen Slot.',FR:'Archive pleine (5/5). Ouvrez l\'archive et supprimez d\'abord un slot.',ES:'Archivo lleno (5/5). Abre el archivo y elimina un slot primero.',PT:'Arquivo cheio (5/5). Abra o arquivo e apague um slot primeiro.',zh:'档案已满(5/5)。请先打开档案并删除一个位置。',zhTW:'檔案已滿(5/5)。請先開啟檔案並刪除一個位置。',ja:'アーカイブが満杯(5/5)。アーカイブを開いてスロットを削除してください。'})[lang]||'Archive is full (5/5). Delete a slot first.')}</div>
            ) : (
              <>
                <input type="text" value={myMusicSaveName} onChange={e=>setMyMusicSaveName(e.target.value)} placeholder={ts('mymusicNamePlaceholder',({EN:'Song name',SK:'Názov skladby',DE:'Songname',FR:'Nom de la chanson',ES:'Nombre de canción',PT:'Nome da música',zh:'歌曲名称',zhTW:'歌曲名稱',ja:'曲名'})[lang]||'Song name')} maxLength={120} autoFocus style={{padding:'12px 14px',background:'transparent',border:'1px solid rgba(230,222,196,.22)',borderRadius:10,color:PF.cream,fontSize:(.72*effScale)+'rem',fontFamily:'inherit',outline:'none'}} />
                <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(230,222,196,.5)',textAlign:'center',fontStyle:'italic'}}>{ts('mymusicSlotHint',({EN:'Slot',SK:'Slot',DE:'Slot',FR:'Emplacement',ES:'Espacio',PT:'Espaço',zh:'插槽',zhTW:'插槽',ja:'スロット'})[lang]||'Slot')} {myMusicSaveTargetSlot} / 5</div>
              </>
            )}
            <div style={{display:'flex',gap:8,marginTop:4}}>
              <button onClick={()=>{ if(!myMusicSaving) setShowMyMusicSaveModal(false); }} disabled={myMusicSaving} style={{flex:1,padding:'10px 14px',background:'transparent',border:'1px solid rgba(230,222,196,.2)',borderRadius:10,color:'rgba(230,222,196,.75)',cursor:myMusicSaving?'default':'pointer',fontFamily:'inherit',fontSize:(.65*effScale)+'rem',letterSpacing:'.08em',textTransform:'uppercase',fontWeight:500}}>{_sent(ts('cancelLabel','Cancel'))}</button>
              <button disabled={myMusicSaving || myMusicSaveTargetSlot === null || !myMusicSaveName.trim()} onClick={async()=>{
                // Pick the right blob for the current loaded source. All 3
                // formats (audio, midi, MusicXML) go into the same archive.
                const _blob = loadedSource==='audio' ? audioBlobRef.current
                            : loadedSource==='midi'  ? midiBlob
                            : loadedSource==='score' ? scoreBlob
                            : null;
                if(!_blob) return;
                const _kind = loadedSource==='audio' ? 'audio'
                            : loadedSource==='midi'  ? 'midi'
                            : loadedSource==='score' ? 'score'
                            : 'audio';
                setMyMusicSaving(true);
                const _r = await myMusicSaveToSlot(myMusicSaveTargetSlot, { name: myMusicSaveName.trim(), blob: _blob, mime: _blob.type || (_kind==='midi'?'audio/midi':(_kind==='score'?'application/vnd.recordare.musicxml+xml':'audio/mpeg')), kind: _kind });
                setMyMusicSaving(false);
                if(_r){
                  setShowMyMusicSaveModal(false);
                  setMyMusicSavedFlash(true);
                  setTimeout(()=>setMyMusicSavedFlash(false), 1800);
                }
              }} style={{flex:1,padding:'10px 14px',background:(myMusicSaving || myMusicSaveTargetSlot === null || !myMusicSaveName.trim())?'rgba(201,168,76,.15)':'rgba(201,168,76,.85)',border:'none',borderRadius:10,color:(myMusicSaving || myMusicSaveTargetSlot === null || !myMusicSaveName.trim())?'rgba(220,180,90,.4)':'#0e0b16',cursor:(myMusicSaving || myMusicSaveTargetSlot === null || !myMusicSaveName.trim())?'default':'pointer',fontFamily:'inherit',fontSize:(.65*effScale)+'rem',letterSpacing:'.08em',textTransform:'uppercase',fontWeight:600}}>{myMusicSaving?'…':_sent(ts('saveLabel','Save'))}</button>
            </div>
          </div>
        </div>
      )}
      {/* Saved flash — brief confirmation after successful save. */}
      {myMusicSavedFlash && (
        <div style={{position:'fixed',top:'max(20px, env(safe-area-inset-top))',left:'50%',transform:'translateX(-50%)',zIndex:20001,padding:'10px 20px',background:'rgba(90,170,90,0.95)',color:'#fff',borderRadius:20,fontSize:(.68*effScale)+'rem',fontWeight:600,letterSpacing:'.08em',textTransform:'uppercase',boxShadow:'0 4px 16px rgba(0,0,0,.3)',pointerEvents:'none',animation:'pf-flash-in .18s ease-out'}}>✓ {ts('mymusicSaved',({EN:'Saved',SK:'Uložené',DE:'Gespeichert',FR:'Enregistré',ES:'Guardado',PT:'Guardado',zh:'已保存',zhTW:'已儲存',ja:'保存済み'})[lang]||'Saved')}</div>
      )}
      {/* My Music — Drawer (5 slots with meta + delete + tap-to-load). Opens
          via the "Moja hudba" tile in the Lite source picker or a similar
          entry in Advanced. Shared UI: identical in both modes. */}
      {showMyMusicDrawer && (
        <div onClick={()=>setShowMyMusicDrawer(false)} style={{position:'fixed',inset:0,zIndex:20000,background:'rgba(4,3,8,0.7)',backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:460,background:'#0e0b16',border:'1px solid rgba(201,168,76,.35)',borderRadius:16,padding:'20px 22px 22px',display:'flex',flexDirection:'column',gap:14,maxHeight:'85dvh',overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
              <div style={{fontSize:(.7*effScale)+'rem',fontWeight:500,letterSpacing:'.16em',textTransform:'uppercase',color:'rgba(220,180,90,.9)'}}>{ts('mymusicTitle',({EN:'My Music',SK:'Moja hudba',DE:'Meine Musik',FR:'Ma musique',ES:'Mi música',PT:'Minha música',zh:'我的音乐',zhTW:'我的音樂',ja:'マイミュージック'})[lang]||'My Music')}</div>
              <button onClick={()=>setShowMyMusicDrawer(false)} aria-label="close" style={{background:'transparent',border:'none',color:'rgba(230,222,196,.55)',fontSize:'1.2rem',cursor:'pointer',padding:'4px 8px',lineHeight:1}}>×</button>
            </div>
            <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(230,222,196,.55)',fontStyle:'italic'}}>{myMusicSlots.filter(s=>!s.empty).length} / 5 · {ts('mymusicSlotsUsed',({EN:'slots used',SK:'obsadených slotov',DE:'Slots belegt',FR:'emplacements utilisés',ES:'espacios usados',PT:'espaços usados',zh:'已用插槽',zhTW:'已用插槽',ja:'使用中スロット'})[lang]||'slots used')}</div>
            <div style={{display:'flex',flexDirection:'column',gap:8,overflowY:'auto',maxHeight:'60dvh',paddingRight:2}}>
              {myMusicSlots.map(rec => {
                if(rec.empty){
                  return (
                    <div key={rec.id} style={{padding:'14px 16px',borderRadius:12,border:'1px dashed rgba(230,222,196,.15)',background:'transparent',color:'rgba(230,222,196,.35)',fontSize:(.62*effScale)+'rem',fontStyle:'italic',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                      <span style={{fontSize:(.5*effScale)+'rem',color:'rgba(230,222,196,.3)',letterSpacing:'.14em'}}>{rec.id}</span>
                      <span>—</span>
                      <span style={{width:14}}/>
                    </div>
                  );
                }
                const _dt = new Date(rec.addedAt);
                const _pad=n=>String(n).padStart(2,'0');
                const _dtStr = _dt.getFullYear()+'-'+_pad(_dt.getMonth()+1)+'-'+_pad(_dt.getDate())+' '+_pad(_dt.getHours())+':'+_pad(_dt.getMinutes());
                const _kb = rec.sizeBytes>=1024*1024 ? (rec.sizeBytes/1024/1024).toFixed(1)+' MB' : Math.round(rec.sizeBytes/1024)+' kB';
                const _kindLabel = rec.kind==='midi' ? 'MIDI' : rec.kind==='score' ? 'MusicXML' : '';
                return (
                  <div key={rec.id} style={{padding:'12px 14px',borderRadius:12,border:'1px solid rgba(201,168,76,.25)',background:'rgba(201,168,76,.05)',display:'flex',alignItems:'center',gap:10}}>
                    <div onClick={()=>loadFromMyMusic(rec)} style={{flex:1,cursor:'pointer',minWidth:0}}>
                      <div style={{fontSize:(.68*effScale)+'rem',fontWeight:600,color:'rgba(220,180,90,.95)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:'.02em'}}>{rec.name}{_kindLabel && <span style={{marginLeft:6,fontSize:(.5*effScale)+'rem',color:'rgba(220,180,90,.5)',fontWeight:500,letterSpacing:'.08em'}}>{_kindLabel}</span>}</div>
                      <div style={{fontSize:(.5*effScale)+'rem',color:'rgba(230,222,196,.45)',marginTop:2,letterSpacing:'.02em'}}>{_dtStr} · {_kb}</div>
                    </div>
                    <button onClick={async()=>{ await myMusicDelete(rec.id); await myMusicCompact(); const l=await myMusicList(); setMyMusicSlots(l); }} aria-label="delete" title={ts('deleteLabel',({EN:'Delete',SK:'Odstrániť',DE:'Löschen',FR:'Supprimer',ES:'Eliminar',PT:'Excluir',zh:'删除',zhTW:'刪除',ja:'削除'})[lang]||'Delete')} style={{background:'transparent',border:'none',color:'rgba(230,80,80,.55)',cursor:'pointer',padding:'4px 8px',fontSize:'1rem',flexShrink:0,lineHeight:1}}>×</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <div className="pf-topbar" style={{width:'100%',maxWidth:560,display:immersive?'none':'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:(composeMode||micActive)?8:20,position:'relative',zIndex:99999,visibility:showIntro?'hidden':'visible',padding:'9px 6px',borderBottom:'1px solid rgba(201,168,76,.14)',WebkitBackdropFilter:'blur(10px)',backdropFilter:'blur(10px)'}}>
        {/* ── V2 nav: hamburger (left) opens a glass menu panel; zoom + language
            sit together in a segmented control (right). The five destinations
            (Concept · Book · Guide · Setup · Pro) moved out of the always-on
            text row into the dropdown — same handlers, just relocated. ── */}
        <div style={{display:'inline-flex',alignItems:'center',gap:6}}>
        <div style={{position:'relative'}}>
          <button onClick={()=>setNavMenuOpen(v=>!v)} aria-label="menu" aria-expanded={navMenuOpen} title="menu" style={{width:38,height:38,display:'inline-flex',alignItems:'center',justifyContent:'center',background:navMenuOpen?'rgba(201,168,76,.12)':'rgba(255,255,255,.03)',border:'1px solid '+(navMenuOpen?'rgba(201,168,76,.45)':'rgba(201,168,76,.26)'),borderRadius:19,cursor:'pointer',WebkitBackdropFilter:'blur(12px)',backdropFilter:'blur(12px)',WebkitTapHighlightColor:'transparent',transition:'background .18s,border-color .18s'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(201,168,76,.92)" strokeWidth="1.7" strokeLinecap="round">
              {navMenuOpen
                ? (<><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></>)
                : (<><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></>)}
            </svg>
          </button>
          {navMenuOpen && (
            <>
              <div onClick={()=>setNavMenuOpen(false)} style={{position:'fixed',inset:0,zIndex:50}}/>
              <div role="menu" style={{position:'absolute',top:'calc(100% + 8px)',left:0,minWidth:210,zIndex:51,border:'1px solid rgba(201,168,76,.26)',borderRadius:18,overflow:'hidden',background:'linear-gradient(180deg,rgba(22,16,32,.9),rgba(16,12,24,.95))',WebkitBackdropFilter:'blur(18px)',backdropFilter:'blur(18px)',boxShadow:'0 14px 44px rgba(0,0,0,.5)'}}>
                {[
                  {key:'concept', label:t('concept'),                          onClick:()=>{setNavMenuOpen(false);setShowAbout(true);}},
                  {key:'book',    label:ts('gcat_book','Book'),                onClick:()=>{setNavMenuOpen(false);setShowBook(true);}},
                  {key:'guide',   label:t('guide'),                           onClick:()=>{setNavMenuOpen(false);setGuideReturnCardId(null);setShowGuide(true);}},
                  // Setup temporarily removed from the menu — testing the inline
                  // "Pick a look" edit mode as the single mechanism. Restore by
                  // un-commenting (the modal code itself is untouched).
                  // Setup entry removed from the menu — the ⚙ icon in the
                  // top-bar pill (right of A A / lang) is the single entry.
                  // {key:'setup',   label:ts('setupPickerLabel','Setup'),        onClick:()=>{setNavMenuOpen(false);setSetupReturnTo(null);setShowSetupModal(true);}},
                  (!isPro)            ? {key:'pro',  label:t('proBadge'),                   pro:'gold',   onClick:()=>{setNavMenuOpen(false);setPaywallReason('settings');}}
                  : (!isProAI)        ? {key:'proai',label:t('proAiBadge')||'PRO AI',       pro:'purple', onClick:()=>{setNavMenuOpen(false);setPaywallReason('settings');}}
                  : null,
                  // Reset — full-app reset without page reload. Drops every
                  // draft, every stash, every loaded source across all modes;
                  // returns the user to a clean Setup screen. For users who
                  // have several modes stacked and don't want to Clear each
                  // one individually. Preferences (Lite/Advanced, language)
                  // are preserved since there's no actual reload.
                  {key:'reset', label:ts('resetLabel',({EN:'Reset',SK:'Reset',DE:'Zurücksetzen',FR:'Réinitialiser',ES:'Restablecer',PT:'Redefinir',zh:'重置',zhTW:'重置',ja:'リセット'})[lang]||'Reset'), onClick:()=>{setNavMenuOpen(false);resetAll();}},
                ].filter(Boolean).map((it,i,arr)=>(
                  <div key={it.key} role="menuitem" tabIndex={0}
                    onClick={it.onClick}
                    onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();it.onClick();}}}
                    style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',cursor:'pointer',color:it.pro==='purple'?'#dcb4ff':it.pro==='gold'?'#f0d98a':'rgba(201,168,76,.9)',fontWeight:it.pro?700:500,fontSize:(.72*effScale)+'rem',letterSpacing:'.14em',textTransform:'uppercase',fontFamily:'inherit',borderBottom:i<arr.length-1?'1px solid rgba(201,168,76,.09)':'none',WebkitTapHighlightColor:'transparent'}}>
                    <span>{it.label}</span>
                    <span style={{opacity:it.pro?.6:.35,fontSize:(.8*effScale)+'rem'}}>→</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── LITE / ADVANCED mode chip — same height as the Aa/Lang chip,
            width auto-fits the active mode's label. Tapping toggles the mode.
            Lite = white chip + white text; Advanced = gold chip + gold text. */}
        {(()=>{
          const adv = !basicMode;
          const accent = adv ? '220,180,90' : '230,205,140';   // full gold | lite gold
          const label = adv ? ts('advancedMode','Advanced') : ts('basicMode','Lite');
          return (
            <button onClick={()=>{ const goingAdvanced = basicMode; try{ if(micListening) stopMicListening(); }catch(_){} try{ if(micPainting) stopMicPainting(); }catch(_){} try{ if(recording) stopRecord(); }catch(_){} try{ setMicArmed(false); }catch(_){} try{ setHasMicDraft(false); listenStashRef.current=null; singStashRef.current=null; }catch(_){} try{ fullClear(); }catch(_){} try{ setStayActive(false); }catch(_){} try{ setStyle(null); }catch(_){} try{ setForceSetup(goingAdvanced); }catch(_){} basicAutoPlayedRef.current=false; basicTapUnlockedRef.current=false; liteEverUnlockedRef.current=false; setLiteAwaitTap(false); try{ setLiteImageMode(false); liteImageModeRef.current=false; _liteImgAppliedRef.current=false; }catch(_){} setBasicMode(b=>!b); }} aria-label={label} aria-pressed={adv} title={label}
              style={{height:38,padding:'0 16px',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:7,borderRadius:19,cursor:'pointer',fontFamily:'inherit',fontSize:(.66*effScale)+'rem',fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',whiteSpace:'nowrap',background:'transparent',color:'rgba('+accent+',.98)',border:'1px solid rgba('+accent+',.45)',WebkitBackdropFilter:'blur(12px)',backdropFilter:'blur(12px)',WebkitTapHighlightColor:'transparent',transition:'color .2s, border-color .2s'}}>
              <span aria-hidden="true" style={{width:7,height:7,borderRadius:'50%',background:'rgba('+accent+',.95)',boxShadow:'0 0 7px rgba('+accent+',.6)',flexShrink:0}}/>
              {label}
            </button>
          );
        })()}
        </div>{/* ── end left group (hamburger + mode chip) ── */}

        {/* segmented control — text size + language */}
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
            ja:{code:'JA',name:'日本語'},
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
            <div style={{position:'relative'}}>
              <div style={{display:'inline-flex',alignItems:'stretch',border:'1px solid rgba(201,168,76,.26)',borderRadius:20,overflow:'hidden',background:'rgba(255,255,255,.03)',WebkitBackdropFilter:'blur(12px)',backdropFilter:'blur(12px)'}}>
                <button onClick={()=>setReadScale(rs=> rs>=1.5?1 : rs>=1.25?1.5 : 1.25)} aria-label={t('fsLabel')} title={t('fsLabel')+' · '+(readScale===1?'1×':readScale===1.25?'1.25×':'1.5×')} style={{height:38,padding:'0 12px',background:readScale>1?'rgba(201,168,76,.12)':'transparent',color:readScale>1?'rgba(220,180,90,.95)':PF.muted,border:'none',borderRight:'1px solid rgba(201,168,76,.16)',cursor:'pointer',fontSize:'.62rem',fontFamily:'inherit',letterSpacing:'.06em',display:'inline-flex',alignItems:'center',gap:4,fontWeight:600,WebkitTapHighlightColor:'transparent'}}><span style={{fontSize:'.62rem'}}>A</span><span style={{fontSize:'.78rem',lineHeight:.9}}>A</span>{readScale>1&&<span style={{fontSize:'.5rem',opacity:.85,marginLeft:1}}>{readScale===1.25?'1.25×':'1.5×'}</span>}</button>
                <button onClick={()=>setLangOpen(v=>!v)} aria-label={`switch language (currently ${meta.name})`} aria-expanded={langOpen} title={`switch language (currently ${meta.name})`} style={{height:38,padding:'0 12px',background:'transparent',color:PF.muted,border:'none',borderRight:basicMode?'none':'1px solid rgba(201,168,76,.16)',cursor:'pointer',fontSize:(.62*effScale)+'rem',fontFamily:'inherit',letterSpacing:'.04em',display:'inline-flex',alignItems:'center',gap:5,WebkitTapHighlightColor:'transparent'}}><span style={{color:'rgba(220,180,90,.95)',fontWeight:600,letterSpacing:'.08em'}}>{meta.code}</span><span style={{fontSize:(.55*effScale)+'rem',opacity:.6}}>▾</span></button>
                {!basicMode && (
                <button onClick={()=>{ setSetupReturnTo(null); setShowSetupModal(true); }} aria-label={ts('setupPickerLabel','Setup')} title={ts('setupPickerLabel','Setup')} style={{height:38,padding:'0 12px',background:'transparent',color:'rgba(220,180,90,.85)',border:'none',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',WebkitTapHighlightColor:'transparent'}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
                )}
              </div>
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
            </div>
          );
        })()}
      </div>
      <header style={{textAlign:'center',marginBottom:(basicMode&&isActiveView)?2:(isActiveView?8:(isDesktop?8:18))}}>
        <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:(basicMode&&isActiveView)?(isDesktop?'clamp(1.8rem,4vw,2.5rem)':'clamp(2.2rem,9vw,3rem)'):(isDesktop?'clamp(1.8rem,4vw,2.6rem)':'clamp(2.4rem,10vw,3.2rem)'),fontWeight:600,letterSpacing:'.03em',margin:(basicMode&&isActiveView)?'0 0 0':'0 0 6px',lineHeight:1,background:`linear-gradient(135deg,${PF.gold2} 0%,${PF.gold} 50%,#c88a18 100%)`,WebkitBackgroundClip:'text',backgroundClip:'text',WebkitTextFillColor:'transparent'}}>Paintiano</h1>
        {basicMode && (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
          {(()=>{
            // The header flip ("music → painting" ↔ "painting → music") is
            // inert until the user has played at least once. In the Play-chip
            // state the only meaningful action is to tap the big gold Play
            // disc — flipping into image-mode out of an empty start screen
            // would dump the user into a half-loaded blank canvas.
            const _liteFlipDisabled = chords.length===0 && !playing && !busy && !composeMode && !micActive && !loadedSource && !liteEverUnlockedRef.current;
            return (
          <div
            onClick={()=>{
              if(_liteFlipDisabled) return;
              // Flip the header around its vertical axis, switch Lite flavour at
              // the half-way point so the back face shows the new subtitle.
              if(liteFlip) return;
              // Stop audio IMMEDIATELY (internal pause) before the flip animation,
              // so the outgoing flavour's sound is silenced cleanly instead of
              // crackling through the 260 ms flip. The liteImageMode effect on the
              // other side then loads + plays from the start.
              try{ if(recording){ stopRecord(); } }catch(_){}
              try{ setRecBlob(null); setRecName(''); setRecordIntent(null); }catch(_){}
              try{ stopAll(); }catch(_){}
              // Hard-mute the master output the instant the flip starts, so the
              // piano's RELEASE TAIL (notes still ringing out after releaseAll)
              // is silenced immediately instead of bleeding through the flip and
              // crackling against the new flavour's first note. Unmuted again by
              // the post-flip auto-start once the context has settled.
              try{ Tone.getDestination().mute = true; }catch(_){}
              liteFlipJustRef.current = true;
              if(!liteFlipSeen){ setLiteFlipSeen(true); try{ localStorage.setItem('paintiano_lite_flip_seen','1'); }catch(_){} }
              setLiteFlipTeaser(false);
              setLiteFlip(true);
              setTimeout(()=>{ setLiteImageMode(v=>!v); }, 260);
              setTimeout(()=>{ setLiteFlip(false); }, 540);
            }}
            role="button"
            aria-disabled={_liteFlipDisabled || undefined}
            title={_liteFlipDisabled ? '' : (liteImageMode ? 'painting → music' : 'music → painting')}
            style={{display:'inline-flex',alignItems:'center',gap:8,margin:'0 auto 0',cursor:_liteFlipDisabled?'default':'pointer',padding:'4px 12px',borderRadius:999,
              transform:(liteFlip||liteFlipTeaser)?'rotateY(90deg)':'rotateY(0deg)',
              transformOrigin:'center center',WebkitTapHighlightColor:'transparent',userSelect:'none',
              opacity:_liteFlipDisabled?.35:1,
              pointerEvents:_liteFlipDisabled?'none':'auto',
              transition:'transform .26s ease, opacity .25s ease'}}>
            <span style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:isDesktop?'1rem':'1.05rem',color:'rgba(220,180,90,.9)',letterSpacing:'.02em',display:'inline-block',transformOrigin:'center center',animation:(!liteFlipSeen && !_liteFlipDisabled)?'pf-flip-nudge 2.6s ease-in-out infinite':'none'}}>
              {liteImageMode ? 'painting → music' : 'music → painting'}
            </span>
          </div>
            );
          })()}
          </div>
        )}
        {isPro && !basicMode && <div style={{textAlign:'center',marginBottom:6}}><ProBadge t={t} readScale={readScale} tier={isProAI ? 'ai' : 'pro'} /></div>}
        {!isActiveView && !isDesktop && !basicMode && <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:'italic',fontSize:'.85rem',letterSpacing:'.06em',color:pianoColor[piano]}}>{pianoLabel[piano]}</div>}
      </header>

      {/* ─────────────────────────────────────────────────────────────
          Control panel (introduced v2.6.0). Grouped into four labelled sections:
          Source → Color → Style → Mood. Layout/skin only — every button
          handler is identical to the prior version. Sections separated by spacing +
          hairline dividers; labels are tiny and faded (recede for return
          users, orient first-timers). lbl() / divider markup inline.
          ───────────────────────────────────────────────────────────── */}
      {isSetupView && !basicMode && (
      <div className="pf-fade pf-panel-part" style={{width:'100%',maxWidth:560,display:'flex',flexDirection:'column',gap:14,marginBottom:18}}>

        {/* Resume — when you parked the current painting via "← Setup", this
            returns to the canvas without changing anything. Only shown when
            there's still content to go back to. */}
        {forceSetup && hasContent && (
          <button className="pf-lift" onClick={()=>{ if(chordsRef.current.length===0){ const o=draftOwnerRef.current||(hasComposeDraft?'compose':hasMicDraft?(micPreset==='music'?'listen':'sing'):null); if(o) restoreStash(o); } setForceSetup(false); setShowMoodMenu(false); setShowMorphMenu(false); setShowComposeRecent(false); setShowMicRecent(false); setPickMode(null); }} style={{display:'inline-flex',alignSelf:'flex-start',alignItems:'center',gap:6,padding:'7px 14px',background:'rgba(201,168,76,.12)',color:PF.gold2,border:'1px solid rgba(201,168,76,.4)',borderRadius:22,cursor:'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>← {t('backToCanvas')}</button>
        )}

        {/* ── MAIN PANEL ── mood · source (color/style/scan live in the canvas
            attributes strip, shown contextually after a source is picked) ── */}
        <div className="pf-setup-create-import-wrap" style={{background:PF.card,border:'1px solid rgba(242,238,232,.07)',borderRadius:20,padding:isDesktop?14:20,display:'flex',flexDirection:'column',gap:isDesktop?12:18}}>

          {/* ── LEFT column (desktop): CREATE from scratch — mood · compose · mic.
              On mobile this is just the first stacked group. ── */}
          <div className="pf-setup-col pf-setup-col-left" style={{display:'flex',flexDirection:'column',gap:isDesktop?12:18}}>

          {/* CREATE — create-from-scratch sources under one header:
              mood (how do you feel?) · compose · mic. */}
          <div>
            <div style={{fontSize:(.58*effScale)+'rem',fontWeight:500,letterSpacing:'.04em',color:'rgba(242,238,232,0.45)',marginBottom:10}}>{_sent(t('createLabel'))}</div>
            <button onClick={()=>{ if(sourcePickerLocked)return; if(showMoodMenu){ setShowMoodMenu(false); return; } if(moodContext&&!moodFromImg&&chords.length>0){ setForceSetup(false); return; } if(hasMoodDraft){ restoreMode('mood'); setForceSetup(false); return; } setMoodEdit(''); setShowMoodMenu(true); }} disabled={sourcePickerLocked} className="pf-lift pf-moodtile" title={(t('moodDesc')!=='moodDesc' ? t('moodDesc') : 'describe a feeling — AI composes & paints')} style={{width:'100%',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,padding:isNotPhone?'40px 24px':'13px',borderRadius:14,marginBottom:8,cursor:sourcePickerLocked?'default':'pointer',background:(moodContext&&!moodFromImg&&chords.length>0||hasMoodDraft)?'rgba(201,168,76,.20)':'transparent',border:'1px solid '+((moodContext&&!moodFromImg&&chords.length>0||hasMoodDraft)?'rgba(201,168,76,.75)':'rgba(201,168,76,.35)'),color:(moodContext&&!moodFromImg&&chords.length>0||hasMoodDraft)?'#eafff4':'rgba(220,180,90,.95)',fontFamily:'inherit',fontSize:(.78*effScale)+'rem',fontWeight:500,letterSpacing:0,opacity:sourcePickerLocked?0.4:1,position:'relative'}}>
              {(moodContext&&!moodFromImg&&chords.length>0||hasMoodDraft)&&<span style={{width:7,height:7,borderRadius:'50%',background:'#dcb45a',boxShadow:'0 0 6px #dcb45a',flexShrink:0}}/>}
              <span className="pf-chip-icon" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'1.2rem',height:'1.2rem'}}><svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-4.5-7-10a4.5 4.5 0 0 1 8.5-1.5A4.5 4.5 0 0 1 19 11c0 5.5-7 10-7 10z"/></svg></span>
              {_sent(t('moodHowFeel'))}
            </button>
            <div className="pf-setup-create" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
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
                  stashOutgoing('compose');
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
              }} disabled={!composeMode && (busy || micPainting || micListening)} title={composeMode?t('composing'):busy?t('stopRecFirst'):micPainting?t('stopSingFirst'):micListening?t('stopListenFirst'):hasComposeDraft?t('compose')+' · draft saved':t('compose')} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:9,padding:isNotPhone?'40px 24px':14,height:isNotPhone?110:64,borderRadius:14,cursor:'pointer',fontFamily:'inherit',fontSize:(.78*effScale)+'rem',fontWeight:500,letterSpacing:0,color:composeMode||hasComposeDraft?'#eafff4':'rgba(120,200,160,.85)',background:(composeMode||hasComposeDraft)?'linear-gradient(135deg,#236b4f,#3a9b73)':'transparent',border:'1px solid '+((composeMode||hasComposeDraft)?'rgba(78,203,141,.65)':'rgba(78,203,141,.22)'),boxShadow:(composeMode||hasComposeDraft)?'0 0 0 1px rgba(78,203,141,.25), 0 4px 14px rgba(58,155,115,.25)':'none',opacity:(!composeMode&&(busy||micPainting||micListening))?.4:1,transition:'all .18s'}}>{(composeMode||hasComposeDraft)&&<span style={{width:7,height:7,borderRadius:'50%',background:'#4ecb8d',boxShadow:'0 0 6px #4ecb8d',flexShrink:0}}/>}<span className="pf-chip-icon" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'1.2rem',height:'1.2rem'}}><svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="1.5"/><line x1="9" y1="6" x2="9" y2="14"/><line x1="15" y1="6" x2="15" y2="14"/><line x1="6.5" y1="6" x2="6.5" y2="12"/><line x1="11.5" y1="6" x2="11.5" y2="12"/><line x1="17.5" y1="6" x2="17.5" y2="12"/></svg></span> {_sent(composeMode?t('composing'):t('compose'))}</button>
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
                stashOutgoing('mic');
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
                  // No stash for this preset — clean armed canvas. Reset the
                  // playback position too: carrying a stale disp from the
                  // outgoing (e.g. mood-in-progress) draft over an EMPTY chord
                  // list makes the paint loop read chords[disp-1] === undefined.
                  setChords([]); chordsRef.current=[]; idxRef.current=0;
                  composedModeRef.current=false; draftOwnerRef.current=null;
                  gridSigRef.current='';
                  setDisp(0); dispRef.current=0;
                  setHoldPaused(false); holdPausedRef.current=false; resumeFromRef.current=null;
                }
                setMicArmed(true);
                setStayActive(true);
              }} disabled={!micActive && (busy || composeMode)} title={micActive?t('micActive'):busy?t('stopRecFirst'):hasMicDraft?t('mic')+' · draft saved':t('mic')} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:9,padding:isNotPhone?'40px 24px':14,height:isNotPhone?110:64,borderRadius:14,cursor:'pointer',fontFamily:'inherit',fontSize:(.78*effScale)+'rem',fontWeight:500,letterSpacing:0,color:(micActive||hasMicDraft)?'#eafff4':'#f06aa6',background:micActive?(micPreset==='voice'?'rgba(255,80,80,.14)':'rgba(60,160,255,.14)'):hasMicDraft?'rgba(240,106,166,.14)':'transparent',border:'1px solid '+(micActive?(micPreset==='voice'?'rgba(255,120,120,.6)':'rgba(100,180,255,.6)'):'rgba(240,106,166,.4)'),opacity:(!micActive&&(busy||composeMode))?.4:1,transition:'all .18s'}}>{(micActive||hasMicDraft)&&<span style={{width:7,height:7,borderRadius:'50%',background:'#f06aa6',boxShadow:'0 0 6px #f06aa6',flexShrink:0}}/>}<span className="pf-chip-icon" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'1.2rem',height:'1.2rem'}}><svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg></span> {_sent(micActive?t('micActive'):t('mic'))}</button>
            </div>
          </div>

          </div>{/* ── end LEFT column ── */}

          {/* ── RIGHT column (desktop): IMPORT — bring your own — mood-from-image
              · music · image. On mobile this is the second stacked group. ── */}
          <div className="pf-setup-col pf-setup-col-right" style={{display:'flex',flexDirection:'column',gap:isDesktop?12:18}}>

          {/* IMPORT — bring-your-own sources under one header:
              mood-from-image · music · image. */}
          <div>
            <div style={{fontSize:(.58*effScale)+'rem',fontWeight:500,letterSpacing:'.04em',color:'rgba(242,238,232,0.45)',marginBottom:10}}>{_sent(t('importLabel'))}</div>
            <button onClick={()=>{ if(aiLocked){ setPaywallReason('ai_trial'); return; } if(!imgAiBusy&&!sourcePickerLocked&&aiUsable){ if(moodFromImg&&chords.length>0){ setForceSetup(false); return; } if(hasMfiDraft){ restoreMode('mfi'); setForceSetup(false); return; } setPickMode(pickMode==='imgmood'?null:'imgmood'); } }} disabled={imgAiBusy||(!aiLocked&&!aiUsable)} className="pf-lift pf-mfitile" title={aiLocked?(t('aiLockedHint')||'AI is part of Paintiano Pro AI'):(!aiUsable?(t('aiOfflineHint')||'AI features need a connection'):(t('mfiDesc')!=='mfiDesc' ? t('mfiDesc') : 'pick a picture — AI captures its mood, then paints'))} style={{width:'100%',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,padding:isNotPhone?'40px 24px':'13px',borderRadius:14,marginBottom:8,cursor:(imgAiBusy||(!aiLocked&&!aiUsable))?'default':'pointer',background:(moodFromImg&&chords.length>0||hasMfiDraft)?'rgba(220,150,255,.20)':'transparent',border:'1px solid '+((moodFromImg&&chords.length>0||hasMfiDraft)?'rgba(220,150,255,.75)':'rgba(220,150,255,.35)'),color:aiLocked?'rgba(225,175,255,.75)':((imgAiBusy||!aiUsable)?'rgba(225,175,255,.5)':((moodFromImg&&chords.length>0||hasMfiDraft)?'#eafff4':'rgba(228,178,255,.95)')),fontFamily:'inherit',fontSize:(.78*effScale)+'rem',fontWeight:500,letterSpacing:0,opacity:aiLocked?.85:(!aiUsable?.5:1),position:'relative'}}>
              {(moodFromImg&&chords.length>0||hasMfiDraft)&&<span style={{width:7,height:7,borderRadius:'50%',background:'#dc96ff',boxShadow:'0 0 6px #dc96ff',flexShrink:0}}/>}
              <span className="pf-chip-icon" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'1.2rem',height:'1.2rem'}}>{imgAiBusy?<span>⏳</span>:<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 1.5L21 19l-1.3.5L19 21l-.7-1.5L17 19l1.3-.5z"/><path d="M5 4l.6 1.2L7 6l-1.4.4L5 8l-.6-1.6L3 6l1.4-.4z"/></svg>}</span>
              {imgAiBusy?'…':_sent(t('imgMood')||'mood from image').replace(/^(\S+)\s+/, '$1\u00A0')}
              {!aiLocked && !aiUsable && <span style={{fontSize:(.5*effScale)+'rem',opacity:.8,fontWeight:500,letterSpacing:0}}>· {t('aiOffline')||'offline'}</span>}
              {aiLocked && <ProBadge t={t} readScale={effScale} size="sm" tier="ai" />}
            </button>
            <div className="pf-setup-import" style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8}}>
              {/* Unified MUSIC tile — opens one picker for MIDI / audio / score;
                  loadSound routes by file type. Active when any of the three
                  music sources is loaded. */}
              <button className="pf-tool pf-midi" onClick={()=>{if(importTileLocked)return;if(activeSource==='midi'||activeSource==='audio'||activeSource==='score'){setForceSetup(false);return;}if(hasMusicDraft){restoreMode('music');setForceSetup(false);return;}setPickMode(pickMode==='sound'?null:'sound');}} disabled={importTileLocked} title={(switchArmed==='midi'||switchArmed==='audio'||switchArmed==='score')?t('switchConfirm'):recording?t('stopRecFirst'):t('music')} style={{display:'flex',flexDirection:isDesktop?'row':'column',alignItems:'center',justifyContent:'center',gap:isDesktop?8:7,height:isNotPhone?110:undefined,padding:isNotPhone?'40px 24px':'14px 8px',borderRadius:14,cursor:'pointer',background:(switchArmed==='midi'||switchArmed==='audio'||switchArmed==='score')?'rgba(220,90,90,.18)':(activeSource==='midi'||activeSource==='audio'||activeSource==='score'||hasMusicDraft)?'rgba(91,156,246,.12)':'transparent',border:'1px solid '+((switchArmed==='midi'||switchArmed==='audio'||switchArmed==='score')?'rgba(255,90,90,.6)':(activeSource==='midi'||activeSource==='audio'||activeSource==='score'||hasMusicDraft)?PF.blue:'rgba(91,156,246,.25)'),color:(switchArmed==='midi'||switchArmed==='audio'||switchArmed==='score')?'rgba(255,140,120,.95)':working&&(wLabel.includes('audio')||wLabel.includes('score'))?PF.blue:importTileLocked?'rgba(91,156,246,.3)':((activeSource==='midi'||activeSource==='audio'||activeSource==='score'||hasMusicDraft)?'#eafff4':PF.blue),fontFamily:'inherit'}}>{(activeSource==='midi'||activeSource==='audio'||activeSource==='score'||hasMusicDraft)&&<span style={{width:7,height:7,borderRadius:'50%',background:'#5b9cf6',boxShadow:'0 0 6px #5b9cf6',flexShrink:0,marginRight:4}}/>}<span className="pf-glyph pf-chip-icon" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'1.2rem',height:'1.2rem'}}><svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span><span style={{fontSize:(.78*effScale)+'rem',fontWeight:500,letterSpacing:0}}>{(switchArmed==='midi'||switchArmed==='audio'||switchArmed==='score')?t('switchConfirm'):working&&(wLabel.includes('audio')||wLabel.includes('score'))?wPct+'%':_sent(t('music')!=='music'?t('music'):'music')}</span></button>
              <button className="pf-tool pf-image" onClick={()=>{if(importTileLocked)return;if(activeSource==='image'&&!moodFromImg){setForceSetup(false);return;}if(hasImageDraft){restoreMode('image');setForceSetup(false);return;}setPickMode(pickMode==='image'?null:'image');}} disabled={importTileLocked} title={switchArmed==='image'?t('switchConfirm'):recording?t('stopRecFirst'):t('image')} style={{display:'flex',flexDirection:isDesktop?'row':'column',alignItems:'center',justifyContent:'center',gap:isDesktop?8:7,height:isNotPhone?110:undefined,padding:isNotPhone?'40px 24px':'14px 8px',borderRadius:14,cursor:'pointer',background:switchArmed==='image'?'rgba(220,90,90,.18)':(activeSource==='image'&&!moodFromImg||hasImageDraft)?'rgba(244,124,60,.12)':'transparent',border:'1px solid '+(switchArmed==='image'?'rgba(255,90,90,.6)':(activeSource==='image'&&!moodFromImg||hasImageDraft)?PF.orange:'rgba(244,124,60,.25)'),color:switchArmed==='image'?'rgba(255,140,120,.95)':importTileLocked?'rgba(244,124,60,.3)':((activeSource==='image'&&!moodFromImg||hasImageDraft)?'#eafff4':PF.orange),fontFamily:'inherit'}}>{(activeSource==='image'&&!moodFromImg||hasImageDraft)&&<span style={{width:7,height:7,borderRadius:'50%',background:'#f47c3c',boxShadow:'0 0 6px #f47c3c',flexShrink:0,marginRight:4}}/>}<span className="pf-glyph pf-chip-icon" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'1.2rem',height:'1.2rem'}}><svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></span><span style={{fontSize:(.78*effScale)+'rem',fontWeight:500,letterSpacing:0}}>{switchArmed==='image'?t('switchConfirm'):_sent(t('image').replace(/[^\p{L}]/gu,''))}</span></button>
            </div>
          </div>

          </div>{/* ── end RIGHT column ── */}

        </div>
      </div>
      )}

      {/* Setup-view centre stage (desktop two-thumb layout): the canvas only
          exists in active view, so before a source is loaded the centre column
          would be empty. This quiet placeholder fills it — a golden-ratio frame
          hint with a soft prompt — so the screen never reads as broken. Mobile
          (<769px) hides it via CSS; the mobile flow stacks panel-only as before. */}
      {isSetupView && !showOnboarding && !basicMode && (
      <div className="pf-setup-stage" aria-hidden="true">
        <div className="pf-setup-stage-inner">
          <div className="pf-setup-stage-mark">Paintiano</div>
          <div className="pf-setup-stage-hint">{t('pickSourceHint')!=='pickSourceHint'?t('pickSourceHint'):(lang==='SK'?'vyber zdroj — importuj hudbu alebo obraz, opíš náladu, skladaj na klávesoch alebo spievaj do mikrofónu':'choose a source — import music or an image, describe a mood, compose on the keys, or sing into the mic')}</div>
        </div>
      </div>
      )}

      {/* ── Active-view strip ── Color + Style stay reachable while a painting
          is on the canvas, without the full setup panel. Collapsed by default
          so the canvas keeps the room; tap the header to expand. ── */}
      {isActiveView && !basicMode && (
      <div ref={stripWrapRef} className="pf-panel-part" style={{width:'100%',maxWidth:480,marginBottom:(composeMode||micActive)?4:12}}>
        {/* Back to setup — abandons the current mood/source and returns to the
            clean setup screen. clear() resets chords + mood + source, which
            flips isActiveView back to false. */}
        <div className="pf-controls-inner" style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:(composeMode||micActive)?4:8,position:'relative'}}>
          <button onClick={()=>{if(demoReelOn){demoReelStop();return;}if(recording)return;if(clearArmRef.current){clearTimeout(clearArmRef.current);clearArmRef.current=null;}setClearArmed(false);
            // Special return path: if we entered Image mode via the Hear image
            // chip (canvas-from-music bridge), Back should restore the original
            // Music piece instead of going to Setup. Single-use: consume the
            // flag, then restoreMode('music') loads the stashed music draft.
            if(_imageFromMusicRef.current && (loadedSource==='image' || viewMode==='image')){
              _imageFromMusicRef.current = false;
              // Preserve the in-progress Image piece (position/pause) the user
              // built here before jumping back to the Music source, so returning
              // to Image later resumes where they left off instead of losing it.
              // stashMode reads dispRef, so capture BEFORE stopAll resets it.
              try{ stashMode('image'); }catch(_){}
              try{ stopAll(); }catch(_){}
              try{ wipeCanvasNow(); }catch(_){}
              setShowMoodMenu(false);setShowMorphMenu(false);setShowComposeRecent(false);setShowMicRecent(false);setPickMode(null);
              const ok = restoreMode('music');
              if(ok){ return; }
              // If for any reason the music draft is gone, fall through to the
              // normal Back-to-Setup path so the user isn't stranded.
            }
            // MIRROR return path: if we entered Music via See music (chord-array
            // from image bridge), Back should restore the original Image piece.
            if(_musicFromImageRef.current && (loadedSource==='midi' || loadedSource==='audio' || loadedSource==='score')){
              _musicFromImageRef.current = false;
              // Preserve the in-progress Music piece (position/pause) the user
              // built here before jumping back to the Image source, so returning
              // to Music later resumes where they left off. Capture BEFORE stopAll.
              try{ stashMode('music'); }catch(_){}
              try{ stopAll(); }catch(_){}
              try{ wipeCanvasNow(); }catch(_){}
              setShowMoodMenu(false);setShowMorphMenu(false);setShowComposeRecent(false);setShowMicRecent(false);setPickMode(null);
              const ok = restoreMode('image');
              if(ok){ return; }
              // restoreMode failed — DON'T fall through to Setup. Reset cleanly
              // and stay on the canvas; a second Back tap will go to Setup as
              // normal. This prevents the surprising "Back lands in Setup
              // instead of Image" regression even if the image stash is gone.
              return;
            }
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
            // Multi-draft: stash the live Mood piece BEFORE we touch the canvas.
            // The non-keepResume path (mood was still PLAYING, or idle) runs
            // wipeCanvasNow() below which empties chordsRef — so if we don't
            // capture here, switching to another source afterwards finds no
            // chords and the draft is silently lost. No-op for non-mood sources
            // (stashOutgoing self-guards: no-op if nothing source-mode is live).
            stashOutgoing(null);
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
            setWorking(false);setWLabel('');setWPct(0);if(draftOwnerRef.current) stashDraft(draftOwnerRef.current);if(composeMode){setComposeMode(false);}if(micPainting||micListening){}if(micPainting)stopMicPainting();if(micListening)stopMicListening();setMicArmed(false);setStripOpen(false);setShowColorPalette(false);setCustomArmed(false);setSourceContext(null);if(loadedSource==='image'){setSetupNoSel(true);}setForceSetup(true);
            // Close any open picker on the way back to setup — otherwise a
            // mood/morph/recent/source picker opened on the canvas lingers
            // over the setup screen.
            setShowMoodMenu(false);setShowMorphMenu(false);setShowComposeRecent(false);setShowMicRecent(false);setPickMode(null);
            // Back to setup = close any active AI recording window (no seal —
            // next Play after another Add/Recall reopens recording normally).
            if(aiRecordingRef.current){ setAiRecording(false); }}} disabled={recording} className="pf-lift" title={recording?t('stopRecFirst'):t('backToSetup')} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:'transparent',color:recording?'rgba(230,222,196,.2)':'rgba(230,222,196,.55)',border:'1px solid rgba(242,238,232,.1)',borderRadius:22,cursor:recording?'default':'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>← {t('backToSetup')}</button>
          {/* Hear image — bridge to Image scan: transfer the painted
              canvas into Image mode and let the user replay it through the
              image-scan pipeline (same painting, different voice). Visible
              only in music sources where there's actually a painting to
              hear. ACTIVE only after the song has reached its end (chords
              loaded, not playing, disp at the last chord) — half-finished
              paintings are not yet ready to scan. Pushed rightward via
              marginLeft:'auto' so it sits near + NEW MUSIC (modality pair). */}
          {(loadedSource || sourceContext) && !composeMode && !micActive && !moodContext && (()=>{ const srcBtn = loadedSource || sourceContext; const _isMusic=(srcBtn==='midi'||srcBtn==='audio'||srcBtn==='score'); if(!_isMusic) return null; const _paintingDone = chords.length>0 && !playing && disp>=chords.length; const _dis = recording || !_paintingDone; return (
            <button onClick={()=>{
              if(_dis) return;
              // Point 4 — reuse an in-progress Image draft from a PRIOR Hear image
              // on this same Music piece. If the current Music signature matches
              // the one captured when that Image draft was stashed, restore it
              // (resume the partly-scanned Image canvas) instead of re-scanning.
              // If the Music changed since, fall through to a fresh scan.
              try{
                const _curSig = (loadedSource||'') + '|' + (chordsRef.current ? chordsRef.current.length : 0) + '|' + ((info&&info.title)||'');
                if(imageStashRef.current && _hearImageSrcSigRef.current === _curSig){
                  try{ stashMode('music'); }catch(_){}   // keep the Music draft for Back
                  _imageFromMusicRef.current = true;
                  const ok = restoreMode('image');
                  if(ok) return;
                }
              }catch(_){}
              // Capture the current canvas as a PNG, wrap as a synthetic File,
              // then feed it into the existing image-upload handler. That
              // handler already does the heavy lifting: stops playback, wipes
              // music state, pixelifies the image, switches viewMode to 'image'
              // and sets loadedSource='image' — exactly the bridge we need.
              try{
                // Fresh scan → supersede any stale Image draft from a previous
                // Hear image; record the source signature so a later Back tags
                // the new draft for reuse.
                _hearImageSrcSigRef.current = (loadedSource||'') + '|' + (chordsRef.current ? chordsRef.current.length : 0) + '|' + ((info&&info.title)||'');
                imageStashRef.current = null; setHasImageDraft(false);
                const cv = canvasRef.current;
                if(!cv) return;
                cv.toBlob((blob)=>{
                  if(!blob) return;
                  try{
                    const file = new File([blob], 'painting.png', { type:'image/png', lastModified: Date.now() });
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    // Mark this transition so the next ← Back from image mode
                    // returns to the original Music piece, not the Setup screen.
                    _imageFromMusicRef.current = true;
                    loadImage({ target: { files: dt.files, value: '' } });
                  }catch(_){ /* DataTransfer not supported — fall back below */
                    try{
                      const fakeFiles = { 0: file, length: 1, item: (i)=>i===0?file:null };
                      _imageFromMusicRef.current = true;
                      loadImage({ target: { files: fakeFiles, value: '' } });
                    }catch(__){}
                  }
                }, 'image/png');
              }catch(_){}
            }} disabled={_dis} className="pf-lift" title={_paintingDone?(t('hearImage')||'Hear image'):(t('hearImageDis')||'Finish the painting first')} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',marginLeft:'auto',marginRight:isMobilePortrait?6:0,background:'rgba(28,24,40,.5)',color:_dis?'rgba(230,222,196,.25)':'rgba(248,170,120,.9)',border:'1px solid '+(_dis?'rgba(242,238,232,.15)':'rgba(244,124,60,.3)'),borderRadius:22,cursor:_dis?'default':'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>{t('hearImage')||'Hear image'}</button>
          ); })()}
          {/* See music — REVERSE bridge: take the chord array generated by
              the image scan and feed it back through the MIDI loader so the
              same song plays in Music mode with the harmonic-flow canvas
              painter. Visible only in image mode where the scan has produced
              a playable chord array. ACTIVE only after the song has reached
              its natural end (same _paintingDone gate as Hear image). Blue
              accent (music modality) mirrors Hear image's orange. */}
          {(loadedSource || sourceContext) && !composeMode && !micActive && !moodContext && (()=>{ const srcBtn = loadedSource || sourceContext; const _isImage=(srcBtn==='image'); if(!_isImage) return null; const _paintingDone = chords.length>0 && playedOnce && !playing && disp>=chords.length; const _dis = recording || !_paintingDone; return (
            <button onClick={()=>{
              if(_dis) return;
              // Point 4 — reuse an in-progress Music draft from a PRIOR See music
              // on this same Image. If the current Image scan signature matches
              // the one captured when that Music draft was stashed, restore it
              // (resume the rebuilt-but-not-finished Music canvas) instead of
              // regenerating from scratch. If the Image changed since (new scan/
              // direction/palette → different signature), fall through to a fresh
              // bake so the new scan is heard.
              try{
                const _curSig = (mode||'') + '|' + (imgDirRef.current||'lr') + '|' + (chordsRef.current ? chordsRef.current.length : 0);
                if(musicStashRef.current && _seeMusicSrcSigRef.current === _curSig){
                  try{ stashMode('image'); }catch(_){}   // keep the Image draft for Back
                  _musicFromImageRef.current = true;
                  const ok = restoreMode('music');
                  if(ok) return;
                }
              }catch(_){}
              // Take the chord array the image scan already generated, encode
              // it as a MIDI file, wrap as a synthetic File, and feed loadMidi()
              // the same shape it gets from a real upload. loadMidi() then
              // does stopAll(), wipeCanvasNow(), parses the MIDI back into
              // chord events, switches loadedSource to 'midi', and the music
              // canvas paints fresh from the same chords.
              try{
                if(!chords || chords.length===0) return;
                // Fresh bake → any stale Music draft from a previous See music is
                // now superseded; clear it and record the source signature so a
                // later Back can tag the new draft for reuse.
                _seeMusicSrcSigRef.current = (mode||'') + '|' + (imgDirRef.current||'lr') + '|' + chords.length;
                musicStashRef.current = null; setHasMusicDraft(false);
                // Bake image-mode runtime expansion (tremolo re-strikes,
                // arpeggio per-note offsets, sustained-plane durations,
                // _playable:false skips) into the chord array so the MIDI
                // that gets exported carries actual events for everything
                // the user actually heard. Without baking, music-mode
                // playback of the raw chords sounds 2-3× faster and
                // texture-less.
                const baked = bakeImageChords(chords);
                if(baked.length===0) return;
                // Capture the per-event carrying tone (_domPc) AND mean cell
                // lightness (_lum) in song order, so the Music canvas can paint
                // each cell in the source painting's carrying colour AND keep its
                // brightness — without this, a pale cream cell (light, low-chroma
                // orange) repaints as full saturated orange and the whole piece
                // darkens, losing the airiness of light originals. The MIDI
                // round-trip strips both (they aren't MIDI fields), so we stash
                // them on a side channel and re-attach proportionally after load.
                // AUDIO IS UNTOUCHED — encodeMidi reads only m/v/timing.
                _imageDomPcsRef.current = baked.map(c => ({
                  pc:  (typeof c._domPc==='number' ? c._domPc : null),
                  lum: (typeof c._lum==='number'   ? c._lum   : null)
                }));
                const bytes = encodeMidi(baked, 120); // 120 BPM neutral default — image scan has no native tempo
                const blob = new Blob([bytes], {type:'audio/midi'});
                const fname = ((info && info.title) ? info.title : 'painting').replace(/[^\w\s-]/g,'').replace(/\s+/g,'_').trim() || 'painting';
                const file = new File([blob], fname+'.mid', { type:'audio/midi', lastModified: Date.now() });
                const dt = new DataTransfer();
                dt.items.add(file);
                // Stash the image draft MANUALLY (in addition to loadMidi's
                // internal stashOutgoing) so restoreMode('image') is
                // guaranteed to find a populated imageStashRef on the way
                // back.
                try{ stashMode('image'); }catch(_){}
                // Mark this transition so the next ← Back from music mode
                // returns to the original Image piece, not the Setup screen.
                _musicFromImageRef.current = true;
                loadMidi({ target: { files: dt.files, value: '' } });
              }catch(_){
                try{
                  if(!chords || chords.length===0) return;
                  const baked = bakeImageChords(chords);
                  if(baked.length===0) return;
                  _imageDomPcsRef.current = baked.map(c => ({
                    pc:  (typeof c._domPc==='number' ? c._domPc : null),
                    lum: (typeof c._lum==='number'   ? c._lum   : null)
                  }));
                  const bytes = encodeMidi(baked, 120);
                  const blob = new Blob([bytes], {type:'audio/midi'});
                  const fname = ((info && info.title) ? info.title : 'painting').replace(/[^\w\s-]/g,'').replace(/\s+/g,'_').trim() || 'painting';
                  const file = new File([blob], fname+'.mid', { type:'audio/midi', lastModified: Date.now() });
                  const fakeFiles = { 0: file, length: 1, item: (i)=>i===0?file:null };
                  try{ stashMode('image'); }catch(_){}
                  _musicFromImageRef.current = true;
                  loadMidi({ target: { files: fakeFiles, value: '' } });
                }catch(__){}
              }
            }} disabled={_dis} className="pf-lift" title={_paintingDone?(t('seeMusic')||'See music'):(t('seeMusicDis')||'Finish the painting first')} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',marginLeft:'auto',marginRight:isMobilePortrait?6:0,background:'rgba(28,24,40,.5)',color:_dis?'rgba(230,222,196,.25)':'rgba(150,185,255,.9)',border:'1px solid '+(_dis?'rgba(242,238,232,.15)':'rgba(91,156,246,.3)'),borderRadius:22,cursor:_dis?'default':'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>{t('seeMusic')||'See music'}</button>
          ); })()}
          {/* New file of the SAME source type — load another file without
              leaving the canvas. Shows the current mode (e.g. "+ NEW IMAGE").
              Only for file sources; to switch TYPE, use ← Setup. */}
          {(loadedSource || sourceContext) && !composeMode && !micActive && !moodContext && (()=>{ const srcBtn = loadedSource || sourceContext; const _isMusic=(srcBtn==='midi'||srcBtn==='audio'||srcBtn==='score'); const _mc = _isMusic?'rgba(150,185,255,.85)':(srcBtn==='image'?'rgba(248,170,120,.9)':'rgba(230,222,196,.7)'); const _mbd = _isMusic?'rgba(91,156,246,.3)':(srcBtn==='image'?'rgba(244,124,60,.3)':'rgba(242,238,232,.15)'); return (
            <button onClick={()=>{if(recording||sourcePickerLocked)return;const _target=(srcBtn==='midi'||srcBtn==='audio'||srcBtn==='score')?'sound':srcBtn;if(pickMode===_target){setPickMode(null);return;}if(draftOwnerRef.current){stashDraft(draftOwnerRef.current);draftOwnerRef.current=null;}setPickMode(_target);}} disabled={recording||sourcePickerLocked} className="pf-lift" title={(()=>{ const isMusic=(srcBtn==='midi'||srcBtn==='audio'||srcBtn==='score'); const noun=isMusic?(t('music')!=='music'?t('music'):'music'):t(srcBtn).replace(/[^\p{L}]/gu,''); /* SK grammar: 'hudba' is feminine -> 'Nová hudba', not 'Nový hudba' */ const prefix=(lang==='SK'&&isMusic)?'Nová':((t('newBy')||{})[srcBtn]||t('newSource')); return prefix+' '+noun; })()} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:'rgba(28,24,40,.5)',color:recording||sourcePickerLocked?'rgba(230,222,196,.25)':_mc,border:'1px solid '+(recording||sourcePickerLocked?'rgba(242,238,232,.15)':_mbd),borderRadius:22,cursor:recording||sourcePickerLocked?'default':'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>+ {(()=>{ const isMusic=(srcBtn==='midi'||srcBtn==='audio'||srcBtn==='score'); const noun=isMusic?(t('music')!=='music'?t('music'):'music'):t(srcBtn).replace(/[^\p{L}]/gu,''); const prefix=(lang==='SK'&&isMusic)?'Nová':((t('newBy')||{})[srcBtn]||t('newSource')); return prefix+' '+noun; })()}</button>
          ); })()}
          {/* New MOOD — opens an inline mood picker right over the canvas (no
              jump back to setup); picking one loads it immediately. Shown for the
              mood context (not a file source, not a live mode) — including AFTER
              Clear, when currentMood is null but we're still on the mood canvas. */}
          {!loadedSource && !composeMode && !micActive && moodContext && (
            moodFromImg ? (
            <button onClick={()=>{if(recording||sourcePickerLocked||!aiUsable)return;if(pickMode==='imgmood'){setPickMode(null);return;}if(draftOwnerRef.current){stashDraft(draftOwnerRef.current);draftOwnerRef.current=null;}setPickMode('imgmood');}} disabled={recording||sourcePickerLocked||!aiUsable} className="pf-lift" title={!aiUsable?(t('aiOfflineHint')||'AI features need a connection'):(((t('newBy')||{}).image||t('newSource'))+' '+(t('backToImage')||'image'))} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:'rgba(28,24,40,.5)',color:(recording||sourcePickerLocked||!aiUsable)?'rgba(230,222,196,.25)':'rgba(225,175,255,.85)',border:'1px solid rgba(220,150,255,.3)',borderRadius:22,cursor:(recording||sourcePickerLocked||!aiUsable)?'default':'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase',opacity:!aiUsable?.5:1}}>+ {((t('newBy')||{}).image||t('newSource'))} {t('backToImage')||'image'}{!aiUsable&&<span style={{fontSize:(.5*effScale)+'rem',opacity:.8}}>· {t('aiOffline')||'offline'}</span>}</button>
            ) : (
            <button onClick={()=>{if(recording)return;if(showMoodMenu){setShowMoodMenu(false);return;}setMoodEdit('');setShowMoodMenu(true);}} disabled={recording} className="pf-lift" title={((t('newBy')||{}).mood||t('newSource'))+' '+t('moodLabel')} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:'rgba(28,24,40,.5)',color:recording?'rgba(230,222,196,.25)':'rgba(220,180,90,.92)',border:'1px solid '+(recording?'rgba(242,238,232,.15)':'rgba(201,168,76,.3)'),borderRadius:22,cursor:recording?'default':'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>+ {((t('newBy')||{}).mood||t('newSource'))} {t('moodLabel')}</button>
            )
          )}
          {/* ← back to image — shown after an image→atmosphere jump, restores the photo */}
          {imgReturnUrl && !composeMode && !micActive && moodContext && (
            <button onClick={()=>{if(recording)return;returnToImage();}} disabled={recording} className="pf-lift" title={t('backToImage')||'back to image'} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:'rgba(28,24,40,.5)',color:recording?'rgba(230,222,196,.25)':'rgba(225,175,255,.85)',border:'1px solid rgba(220,150,255,.3)',borderRadius:22,cursor:recording?'default':'pointer',fontFamily:'inherit',fontSize:(.55*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}>← {t('backToImage')||'image'}</button>
          )}
          {/* ♪ Recently played — opens a picker of saved compose performances.
              Only visible in compose mode and only if any saved entries exist. */}
          {composeMode && composeRecent.length>0 && (
            <button onClick={()=>{if(recording)return;setShowComposeRecent(v=>!v);}} disabled={recording} className="pf-lift" title={t('recentPlayed')||'recently played'} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:'rgba(28,24,40,.5)',color:recording?'rgba(230,222,196,.25)':'rgba(230,222,196,.7)',border:'1px solid rgba(242,238,232,.15)',borderRadius:22,cursor:recording?'default':'pointer',fontFamily:'inherit',fontSize:(.65*effScale)+'rem',fontWeight:500,letterSpacing:0}}>{_sent(t('recentPlayed')||'recent')}</button>
          )}
          {/* ♪ Recently played for Mic — preset-aware: voice store in voice mode,
              music store in music. Visible across the entire mic context window:
              from picking the mic source (armed) through active streaming and
              even after STOP REC (where micPainting/micListening flip false but
              the user is still on the mic canvas). micContext stays true until
              Back/Clear, so the button does too. */}
          {(micActive || micArmed || micContext) && ((micPreset==='voice' && micVoiceRecent.length>0) || (micPreset==='music' && micMusicRecent.length>0)) && (
            <button onClick={()=>{if(recording)return;setShowMicRecent(v=>!v);}} disabled={recording} className="pf-lift" title={t('recentPlayed')||'recently played'} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',background:'rgba(28,24,40,.5)',color:recording?'rgba(230,222,196,.25)':'rgba(230,222,196,.7)',border:'1px solid rgba(242,238,232,.15)',borderRadius:22,cursor:recording?'default':'pointer',fontFamily:'inherit',fontSize:(.65*effScale)+'rem',fontWeight:500,letterSpacing:0}}>{_sent(t('recentPlayed')||'recent')}</button>
          )}
        </div>
        {!isDesktop && !basicMode && (<>
        <div style={{display:'flex',alignItems:'center',width:'100%',gap:6}}>
          <span style={{width:26,flexShrink:0}} aria-hidden="true" />
          <button onClick={()=>{if(demoReelOn)return;setStripOpen(o=>!o);}} disabled={demoReelOn} aria-expanded={stripOpen} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:(composeMode||micActive)?'2px 0':'6px 0',background:'transparent',border:'none',cursor:demoReelOn?'default':'pointer',color:stripOpen?'rgba(201,168,76,.9)':'rgba(201,168,76,.7)',fontFamily:'inherit',fontSize:(.5*effScale)+'rem',letterSpacing:'.26em',textTransform:'uppercase',opacity:demoReelOn?.5:1,transition:'color .15s ease'}}>
            <span>{(loadedSource==='image' && !moodFromImg) ? (t('colorLabel') + ' · ' + t('dirLabel') + ' · ' + (t('imgCompose')!=='imgCompose'?t('imgCompose'):'AI compose')) : ts('pickLook','Pick a look')}</span>
            <span style={{fontSize:(.7*effScale)+'rem',transform:stripOpen?'rotate(180deg)':'none',transition:'transform .2s ease'}}>▾</span>
          </button>
          {/* Edit toggle removed — Preset editing is now done via ⚙ in the
              top-bar (opens Setup modal). The cockpit is selection-only. */}
          <span style={{width:26,flexShrink:0}} aria-hidden="true" />
        </div>
        {!stripOpen && (loadedSource!=='image' || moodFromImg) && effectiveStyle && effectiveStyle!=='notes' && effectiveStyle!=='mosaic' && STYLE_INSPIRED[effectiveStyle] && (
          <div style={{textAlign:'center',marginTop:-2,marginBottom:2,fontSize:(.52*effScale)+'rem',letterSpacing:'.12em',color:'rgba(201,168,76,.6)',fontStyle:'italic',textTransform:'none',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:5,width:'100%'}}><span style={{textTransform:'capitalize',fontStyle:'normal'}}>{t(mode)}</span> • {!style&&(<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{verticalAlign:'middle',opacity:.8}}><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>)}{t('inspiredBy').replace('{artist}', STYLE_INSPIRED[effectiveStyle])}</div>
        )}
        {/* Styles without an artist attribution — mosaic (no style selected) and
            notes (bare grid with note labels) — get no "inspired by". One Million
            Dollar Page goes through the artist branch above (it references a real
            iconic web-art piece). Show the active colour mode • the style name so
            the collapsed caption isn't blank. */}
        {!stripOpen && (loadedSource!=='image' || moodFromImg) && (!effectiveStyle || effectiveStyle==='notes' || effectiveStyle==='mosaic') && (
          <div style={{textAlign:'center',marginTop:-2,marginBottom:2,fontSize:(.52*effScale)+'rem',letterSpacing:'.12em',color:'rgba(201,168,76,.6)',fontStyle:'normal',textTransform:'capitalize'}}>{t(mode)} • {effectiveStyle==='notes'?t('notesStyle'):t('mosaicStyle')}</div>
        )}
        {!stripOpen && loadedSource==='image' && !moodFromImg && (
          <div style={{textAlign:'center',marginTop:-2,marginBottom:2,fontSize:(.52*effScale)+'rem',letterSpacing:'.12em',color:imgPlayMode==='compose'?'rgba(228,178,255,.7)':'rgba(201,168,76,.6)',fontStyle:'normal',textTransform:'capitalize'}}>{t(mode)} · {imgPlayMode==='compose'?(t('imgCompose')!=='imgCompose'?t('imgCompose'):'AI compose'):t('dir_'+imgDir)}</div>
        )}
        </>)}
        {(stripOpen || isDesktop) && (
        <div className={"pf-strip-grid"+((loadedSource==='image'&&!moodFromImg)?' pf-strip-imagescan':'')+(composeMode?' pf-strip-compose':'')} style={{display:'flex',flexDirection:'column',gap:12,paddingTop:8,background:PF.card,border:'1px solid rgba(242,238,232,.07)',borderRadius:16,padding:14}}>
          <div className="pf-colors-inner" style={{display:'flex',flexDirection:'column',gap:12}}>
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
              // Mark Vary in progress — the phaseIndex useEffect will see this
              // flag and skip re-rolling the style. Vary changes tones only;
              // the (umelec, štýl) pair must persist for 4-tuple identity.
              varyInProgressRef.current = true;
              const wasPlaying=playing||holdPausedRef.current; // active = playing OR paused → auto-restart, don't wait for Play
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
              const _wasMfi = moodFromImg;
              const _keepThumb = moodFromImg ? imgMoodThumb : null;
              applyEvents(evts,varied.title+' ·');
              // applyEvents now clears moodContext AND moodFromImg; restore both
              // because a Vary of a mood piece is still a mood piece — and an MFI
              // Vary is still MFI. Without restoring moodFromImg the header reverts
              // to mood mode (NEW MOOD + MORPH) instead of staying MFI (NEW IMAGE,
              // no MORPH). Vary/Morph row is wrapped in moodContext && so that's
              // restored too.
              setMoodContext(true);
              if(_wasMfi){ setMoodFromImg(true); }
              if(_keepThumb){ setImgMoodThumb(_keepThumb); }
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
              if(wasPlaying){ resumeFromRef.current=0; keepStripOpenRef.current=true; setTimeout(()=>{ startPlayRef.current?.(); setStripOpen(true); }, 60); }
            }} disabled={composeMode||micPainting||micListening||recording||working||!chords.length} title={recording?t('stopRecFirst'):!varySource?t('pickMoodFirst'):t('reroll')} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:7,padding:'9px 16px',borderRadius:12,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:(.64*effScale)+'rem',fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase',color:'#fff',background:varySource&&chords.length&&!(composeMode||micPainting||micListening||recording||working)?'linear-gradient(135deg,#d4622a,#f47c3c)':'rgba(212,98,42,.3)',opacity:varySource&&chords.length&&!(composeMode||micPainting||micListening||recording||working)?1:.55,transition:'all .18s'}}>{t('vary')}</button>
          </div>
          )}
          {/* Color */}
          {loadedSource==='image' && !moodFromImg ? (() => {
            // IMAGE mode: same four chips as every other mode (Harmony · Spectral ·
            // B/W · Custom), but GATED by the app's auto-reading of the painting's
            // colourfulness:
            //   • colourful (vivid ≥5%) ⇒ Harmony + Spectral enabled, B/W disabled
            //   • near-monochrome (<5%) ⇒ B/W enabled, Harmony + Spectral disabled
            // Custom is always enabled. Default selection follows the app's pick
            // (harmony for colour, bw for mono). Tapping the active chip toggles the
            // read-only palette preview, exactly like the non-image modes.
            const appColour = appModeRef.current!=='bw';   // app read the image as colourful
            const isDisabled = (m)=> false;  // tab arrays are now appColour-aware; nothing left to disable
            return (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {/* COLOUR chips — shown in BOTH modes: in Scan they map colour→pitch
                  for the readout; in AI Compose they still set the palette the AI
                  draws the piece's harmony from. Only the SCAN DIRECTION below is
                  scan-specific (compose ignores reading order), so that's gated. */}
              {(()=>{ const _allTabs = appColour?['harmony','spectral','phi','kontra','custom']:['bw','custom']; const _enabled = _allTabs.filter(m => m==='bw' || setupPalettes.includes(m)); const _baseShown = _enabled.length?_enabled:_allTabs;
              // Cockpit is selection-only: show only palettes in the user's set.
              // Editing the set is done via ⚙ (Setup modal), not inline here.
              const _shown = _baseShown;
              // Single palette shown → render the name as plain text (same font,
              // cream), not a chip — nothing to switch between.
              if(_shown.length===1){
                return (
                  <div style={{textAlign:'center',padding:'8px 0',fontSize:(.6*effScale)+'rem',fontWeight:600,letterSpacing:'.08em',fontFamily:'inherit',textTransform:'uppercase',color:'rgba(220,180,90,.95)',userSelect:'none'}}>{t(_shown[0])}</div>
                );
              }
              return (
              <div className="pf-color-tabs" style={{display:'grid',gridTemplateColumns: `repeat(${_shown.length},1fr)`,gap:6}}>
                {_shown.map(m=>{
                  const isCustomTab = m==='custom';
                  const armed = isCustomTab && mode==='custom' && customArmed;
                  const dis = isDisabled(m);
                  // Free tier: Custom uses the same cycle as Pro (Custom →
                  // Edit → action), but the third tap opens a read-only
                  // palette PREVIEW instead of the editor modal. The palette
                  // applied is always the default (defaultCustomPalette) —
                  // the user's saved palette stays locked until they upgrade.
                  const isFree = proStatus==='free';
                  const _inSet = setupPalettes.includes(m);
                  const _ghost = false;
                  return (
                  <button key={m} disabled={dis&&!cockpitEdit} className={mode===m&&!cockpitEdit?'pf-tab pf-tab-on':'pf-tab'} onClick={()=>{
                    if(cockpitEdit && m!=='bw'){ togglePalSafe(m); return; }
                    if(dis) return;
                    if(isCustomTab && mode==='custom'){
                      if(!customArmed){
                        // tap 1: arm → label "✎ EDIT" + PRO badge (Free)
                        setCustomArmed(true);
                      } else if(isFree && !showColorPalette){
                        // tap 2 (Free): open read-only preview, keep "✎ EDIT" label
                        setShowColorPalette(true);
                      } else if(isFree && showColorPalette){
                        // tap 3 (Free): close preview AND disarm → label back to "Custom"
                        setShowColorPalette(false);
                        setCustomArmed(false);
                      } else {
                        // Pro armed: open the editor modal
                        setShowPaletteEditor(true);
                      }
                      return;
                    }
                    if(m==='custom'){ setCustomArmed(false); setShowColorPalette(false); }
                    else if(mode===m){ setShowColorPalette(v=>!v); return; }   // tap active chip → toggle preview
                    else setShowColorPalette(false);
                    if(canvasRef.current){canvasRef.current.style.opacity='0';}
                    kontraAutoRef.current=false;   // manual palette tap → kontra (if chosen) is now deliberate
                    setTimeout(()=>{setMode(m);if(canvasRef.current)canvasRef.current.style.opacity='1';},200);
                  }} style={{padding:'8px 0',textAlign:'center',fontSize:(.6*effScale)+'rem',fontWeight:600,letterSpacing:'.06em',fontFamily:'inherit',textTransform:'uppercase',cursor:'pointer',borderRadius:10,transition:'color .18s, background .18s, box-shadow .18s, border-color .18s',opacity:(dis&&!cockpitEdit)?0.32:1,whiteSpace:'nowrap',overflow:'visible',...(_ghost?{background:'transparent',border:'1px dashed rgba(242,238,232,.22)',color:'rgba(230,222,196,.4)'}:((!cockpitEdit && mode===m) ? {background:PF.card2,border:'1px solid rgba(201,168,76,.4)',color:'rgba(220,180,90,.98)',boxShadow:'none'} : chipStyle(cockpitEdit ? _inSet : false)))}}>
                    <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:0}}>
                      <span>{armed?('✎ '+t('editShort')):t(m)}</span>
                      {armed && isFree && <ProBadge t={t} readScale={effScale} size="sm" />}
                    </span>
                  </button>
                  );
                })}
              </div>
              ); })()}
              {/* READ-ONLY palette preview of the active mode (harmony/spectral/bw) —
                  shown when the user taps the active chip. Reflects the current mode
                  so it doubles as visual feedback for the colour reading.
                  Free + custom + armed: shows the default custom palette swatches
                  (since Free can't edit; the swatches are the "preview" the user
                  gets on the third Custom tap). */}
              {showColorPalette && (mode!=='custom' || (proStatus==='free' && customArmed)) && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:5,padding:'8px',borderRadius:10,background:'rgba(20,18,30,.4)',border:'1px solid rgba(242,238,232,.06)'}}>
                  {['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'].map((nm,pc)=>{
                    let r,g,b;
                    if(mode==='custom'){
                      // Free preview swatches read straight from defaultCustomPalette
                      // (Pro never reaches this branch — it gets the editor modal).
                      const hex = defaultCustomPalette[pc];
                      const n = parseInt(hex.slice(1),16);
                      r=(n>>16)&255; g=(n>>8)&255; b=n&255;
                    } else {
                      [r,g,b]=colorPreview(mode,pc);
                    }
                    return (
                      <div key={pc} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                        <div style={{width:'100%',aspectRatio:'1',borderRadius:6,background:`rgb(${r},${g},${b})`,border:'1px solid rgba(0,0,0,.25)'}} />
                        <span style={{fontSize:(.42*effScale)+'rem',letterSpacing:'.04em',color:PF.muted,opacity:.7}}>{nm}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })() : (<>
            {cockpitEdit && (
              <div className="pf-inspired-row" style={{position:'relative',marginTop:2,marginBottom:2,display:'flex',alignItems:'center',justifyContent:'flex-start'}}>
                <div className="pf-inspired-label" style={{textAlign:'center',fontSize:(.46*effScale)+'rem',letterSpacing:'.22em',textTransform:'uppercase',fontStyle:'italic',color:'rgba(201,168,76,.6)',userSelect:'none'}}>{ts('palettesTitle','palettes')}</div>
                <div style={{position:'absolute',right:0,top:'50%',transform:'translateY(-50%)',display:'flex',gap:6}}>
                  <button onClick={()=>setSetupPalettes([...ALL_PALETTE_KEYS])} style={{padding:'2px 9px',borderRadius:11,fontSize:(.42*effScale)+'rem',fontFamily:'inherit',letterSpacing:'.04em',textTransform:'uppercase',cursor:'pointer',background:'transparent',border:'1px solid rgba(201,168,76,.4)',color:'rgba(201,168,76,.8)'}}>{ts('selAll','all')}</button>
                  <button onClick={()=>setSetupPalettes(['harmony'])} style={{padding:'2px 9px',borderRadius:11,fontSize:(.42*effScale)+'rem',fontFamily:'inherit',letterSpacing:'.04em',textTransform:'uppercase',cursor:'pointer',background:'transparent',border:'1px solid rgba(242,238,232,.2)',color:'rgba(230,222,196,.5)'}}>{ts('selNone','none')}</button>
                </div>
              </div>
            )}
            {!cockpitEdit && !isMobilePortrait && (
              <div className="pf-inspired-label" style={{textAlign:'center',fontSize:(.46*effScale)+'rem',letterSpacing:'.22em',textTransform:'uppercase',fontStyle:'italic',color:'rgba(201,168,76,.6)',marginTop:2,marginBottom:2}}>{ts('palettesTitle','palety')}</div>
            )}
            {(()=>{ const _allTabs = ['harmony','spectral','phi','kontra','custom']; const _enabled = _allTabs.filter(m => setupPalettes.includes(m)); const _baseShown = _enabled.length?_enabled:_allTabs;
            // Edit mode: show all palettes, off ones as ghosts to tap-add.
            const _shown = cockpitEdit ? _allTabs : _baseShown;
            // Single palette enabled in Setup → nothing to switch between, so show
            // the palette NAME as plain text (same font, cream) instead of a chip.
            if(_shown.length===1 && !cockpitEdit){
              return (
                <div style={{textAlign:'center',padding:'8px 0',fontSize:(.6*effScale)+'rem',fontWeight:600,letterSpacing:'.08em',fontFamily:'inherit',textTransform:'uppercase',color:'rgba(220,180,90,.95)',userSelect:'none'}}>{t(_shown[0])}</div>
              );
            }
            return (
            <div className="pf-color-tabs" style={{display:'grid',gridTemplateColumns:`repeat(${_shown.length},1fr)`,gap:6}}>
              {_shown.map(m=>{
              const isCustomTab = m==='custom';
              const armed = isCustomTab && mode==='custom' && customArmed;
              // Free tier: Custom uses the same cycle as Pro (Custom → Edit → action),
              // but the third tap opens a read-only palette PREVIEW instead of the
              // editor modal. The palette applied is always the default — the user's
              // saved palette stays locked until they upgrade.
              const isFree = proStatus==='free';
              const _inSet = setupPalettes.includes(m);
              const _ghost = cockpitEdit && !_inSet;
              return (
              <button key={m} className={mode===m&&!cockpitEdit?'pf-tab pf-tab-on':'pf-tab'} onClick={()=>{
                if(cockpitEdit){ togglePalSafe(m); return; }
                if(isCustomTab && mode==='custom'){
                  if(!customArmed){
                    // tap 1: arm → label "✎ EDIT" + PRO badge (Free)
                    setCustomArmed(true);
                  } else if(isFree && !showColorPalette){
                    // tap 2 (Free): open read-only preview, keep "✎ EDIT" label
                    setShowColorPalette(true);
                  } else if(isFree && showColorPalette){
                    // tap 3 (Free): close preview AND disarm → label back to "Custom"
                    setShowColorPalette(false);
                    setCustomArmed(false);
                  } else {
                    // Pro armed: open the editor modal
                    setShowPaletteEditor(true);
                  }
                  return;
                }
                if(m==='custom'){ setCustomArmed(false); setShowColorPalette(false); }
                else if(mode===m){ setShowColorPalette(v=>!v); return; }   // tap active H/S/BW tab → toggle preview
                else setShowColorPalette(false);
                if(canvasRef.current){canvasRef.current.style.opacity='0';}
                kontraAutoRef.current=false;   // manual palette choice → deliberate
                setTimeout(()=>{setMode(m);if(canvasRef.current)canvasRef.current.style.opacity='1';},200);
              }} style={{padding:'8px 0',textAlign:'center',fontSize:(.6*effScale)+'rem',fontWeight:600,letterSpacing:'.06em',fontFamily:'inherit',textTransform:'uppercase',cursor:'pointer',borderRadius:10,transition:'color .18s, background .18s, box-shadow .18s, border-color .18s',whiteSpace:'nowrap',overflow:'visible',...(_ghost?{background:'transparent',border:'1px dashed rgba(242,238,232,.22)',color:'rgba(230,222,196,.4)'}:((!cockpitEdit && mode===m) ? {background:PF.card2,border:'1px solid rgba(201,168,76,.4)',color:'rgba(220,180,90,.98)',boxShadow:'none'} : chipStyle(cockpitEdit ? _inSet : false)))}}>
                <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:0}}>
                  <span>{armed?('✎ '+t('editShort')):t(m)}</span>
                  {armed && isFree && <ProBadge t={t} readScale={effScale} size="sm" />}
                </span>
              </button>
              );})}
            </div>
            ); })()}
            {showColorPalette && (mode!=='custom' || (proStatus==='free' && customArmed)) && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:5,padding:'8px',borderRadius:10,background:'rgba(20,18,30,.4)',border:'1px solid rgba(242,238,232,.06)',marginTop:8}}>
                {['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'].map((nm,pc)=>{
                  let r,g,b;
                  if(mode==='custom'){
                    const hex = defaultCustomPalette[pc];
                    const n = parseInt(hex.slice(1),16);
                    r=(n>>16)&255; g=(n>>8)&255; b=n&255;
                  } else {
                    [r,g,b]=colorPreview(mode,pc);
                  }
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
          {!isMobilePortrait && (setupTones.length>=2 || cockpitEdit) && (
          <div style={{marginTop:10,marginBottom:2}}>
            <div className="pf-inspired-label" style={{textAlign:'center',fontSize:(.46*effScale)+'rem',letterSpacing:'.22em',textTransform:'uppercase',fontStyle:'italic',color:'rgba(201,168,76,.6)',userSelect:'none',marginBottom:6}}>{({EN:'tone',SK:'tón',DE:'ton',FR:'tonalité',ES:'tono',PT:'tom',zh:'色调',zhTW:'色調',ja:'トーン'})[lang]||'tone'}</div>
            {(()=>{
              const allTones = [
                {k:'pure',   label:({EN:'Pure',SK:'Čistý',DE:'Pur',FR:'Pur',ES:'Puro',PT:'Puro',zh:'纯净',zhTW:'純淨',ja:'ピュア'})[lang]||'Pure'},
                {k:'real',   label:({EN:'Real',SK:'Skutočný',DE:'Real',FR:'Réel',ES:'Real',PT:'Real',zh:'真实',zhTW:'真實',ja:'リアル'})[lang]||'Real'},
                {k:'pastel', label:({EN:'Pastel',SK:'Pastelový',DE:'Pastell',FR:'Pastel',ES:'Pastel',PT:'Pastel',zh:'柔和',zhTW:'柔和',ja:'パステル'})[lang]||'Pastel'}
              ];
              // Edit mode shows all three (off ones as ghosts to tap-add); normal
              // mode shows only the enabled tones and a tap selects the tone.
              const visTones = cockpitEdit ? allTones : allTones.filter(o => setupTones.includes(o.k));
              if(!visTones.length) return null;
              const cols = visTones.length;
              return (
              <div style={{display:'grid',gridTemplateColumns:`repeat(${cols}, 1fr)`,gap:6}}>
                {visTones.map(o=>{
                  const sel = tone===o.k;
                  const _inSet = setupTones.includes(o.k);
                  const _ghost = cockpitEdit && !_inSet;
                  return (
                  <button key={o.k} onClick={()=>{ if(cockpitEdit){ toggleToneSafe(o.k); return; } setTone(o.k); }} style={{padding:'8px 0',textAlign:'center',borderRadius:10,cursor:'pointer',fontFamily:'inherit',fontSize:(.56*effScale)+'rem',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',transition:'all .18s',...(_ghost?{background:'transparent',border:'1px dashed rgba(242,238,232,.22)',color:'rgba(230,222,196,.4)'}:((!cockpitEdit && sel) ? {background:PF.card2,border:'1px solid rgba(201,168,76,.4)',color:'rgba(220,180,90,.98)',boxShadow:'none'} : chipStyle(cockpitEdit ? _inSet : false)))}}>{o.label}</button>
                  );
                })}
              </div>
              );
            })()}
          </div>
          )}
          </div>
          <div className="pf-styles-inner" style={{display:'flex',flexDirection:'column',gap:12}}>
          {/* IMAGE mode: the right column (where artists sit in other modes) holds
              the read-mode toggle (Scan / AI Compose) and — in Scan — the scan
              direction. Colours stay in the left column, mirroring every mode. */}
          {loadedSource==='image' && !moodFromImg && (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {working && isDesktop && (
              <div style={{marginBottom:2}}>
                <div style={{fontSize:(0.58*effScale)+'rem',letterSpacing:'.06em',marginBottom:5,textAlign:'center',color:'rgba(220,180,255,.95)',fontWeight:500}}>⟳ {wLabel}… {wPct}%</div>
                <div style={{height:3,background:'rgba(255,255,255,0.12)',borderRadius:2}}>
                  <div style={{height:'100%',width:wPct+'%',background:'rgba(210,140,255,.85)',borderRadius:2,transition:'width .3s'}}/>
                </div>
              </div>
            )}
            {isDesktop && <div style={{textAlign:'center',fontSize:(.46*effScale)+'rem',letterSpacing:'.22em',textTransform:'uppercase',fontStyle:'italic',color:'rgba(201,168,76,.6)',userSelect:'none'}}>{t('imgReadLabel')!=='imgReadLabel'?t('imgReadLabel'):(lang==='SK'?'čítanie':'reading')}</div>}
            <div style={{display:'flex',flexDirection:isDesktop?'column':'row',gap:6}}>
              <button onClick={()=>{ if(busy||working) return; if(imgPlayMode!=='scan'){ stopAll(); imgComposeRef.current=false; setImgPlayMode('scan'); } }} disabled={busy||working} title={t('imgScanHint')!=='imgScanHint'?t('imgScanHint'):'read the picture as a score'} style={{flex:isDesktop?undefined:1,width:isDesktop?'100%':undefined,padding:'9px 0',textAlign:'center',borderRadius:10,border:'none',cursor:(busy||working)?'default':'pointer',fontFamily:'inherit',fontSize:(.56*effScale)+'rem',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',transition:'all .18s',background:imgPlayMode==='scan'?'rgba(201,168,76,.18)':'rgba(20,18,30,.5)',color:imgPlayMode==='scan'?'rgba(220,180,90,.98)':'rgba(201,168,76,.5)',boxShadow:imgPlayMode==='scan'?'0 0 0 1px rgba(201,168,76,.45)':'0 0 0 1px rgba(201,168,76,.22)'}}>{'◫ '+(t('imgScan')!=='imgScan'?t('imgScan'):'scan')}</button>
              <button onClick={()=>{ if(busy||working) return; if(aiLocked){ setPaywallReason('ai_trial'); return; } if(imgPlayMode!=='compose'){ stopAll(); imgComposeRef.current=false; setAtmoOn(false); setMelodyOn(false); setImgPlayMode('compose'); } }} disabled={busy||working} title={aiLocked?(t('aiLockedHint')||'AI is part of Paintiano Pro AI'):(t('imgCompositionHint')!=='imgCompositionHint'?t('imgCompositionHint'):'AI writes a piece from this image')} style={{flex:isDesktop?undefined:1,width:isDesktop?'100%':undefined,padding:'9px 0',textAlign:'center',borderRadius:10,border:'none',cursor:(busy||working)?'default':'pointer',fontFamily:'inherit',fontSize:(.56*effScale)+'rem',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',transition:'all .18s',background:imgPlayMode==='compose'?'rgba(220,150,255,.2)':'rgba(20,18,30,.5)',color:aiLocked?'rgba(225,175,255,.7)':(imgPlayMode==='compose'?'rgba(228,178,255,.98)':'rgba(225,175,255,.5)'),boxShadow:imgPlayMode==='compose'?'0 0 0 1px rgba(220,150,255,.5)':'0 0 0 1px rgba(220,150,255,.24)',opacity:aiLocked?.85:1,display:'inline-flex',alignItems:'center',justifyContent:'center',gap:4}}>
                <span>{'✦ '+(t('imgCompose')!=='imgCompose'?t('imgCompose'):'AI compose')}</span>
                {aiLocked && <ProBadge t={t} readScale={effScale} size="sm" tier="ai" />}
              </button>
            </div>
            {imgPlayMode==='scan' ? (<>
              <div style={{fontSize:(.46*effScale)+'rem',fontWeight:600,letterSpacing:'.2em',color:PF.muted,marginTop:4,textTransform:'uppercase'}}>{t('dirLabel')}</div>
              <div style={isDesktop?{display:'flex',flexDirection:'column',gap:6}:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
                {['lr','vert','spiralIn','spiralOut'].map(d=>{
                  const sel = imgDir===d;
                  // Direction may be changed during playback now: unlike a palette
                  // swap (same scan order, just different tones → seamless), a
                  // direction change re-orders the scan, so the re-transcribe
                  // effect restarts it from the top. Only a load/export (working)
                  // blocks it — note `busy` includes `playing`, so we must NOT use
                  // it here or the button would stay locked during scan.
                  const locked = working;
                  const glyph = d==='lr'?'☰':d==='vert'?'III':d==='spiralIn'?'⟳':'⟲';
                  return (
                    <button key={d} disabled={locked} onClick={()=>{ if(locked)return; setImgDir(d); }} style={{width:isDesktop?'100%':undefined,padding:'7px 0',textAlign:'center',fontSize:(.5*effScale)+'rem',fontWeight:600,letterSpacing:'.04em',fontFamily:'inherit',textTransform:'uppercase',cursor:locked?'default':'pointer',borderRadius:10,transition:'color .18s, background .18s, box-shadow .18s, opacity .18s',opacity:locked&&!sel?0.4:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',...chipStyle(sel)}}>{glyph} {t('dir_'+d)}</button>
                  );
                })}
              </div>
            </>) : (
              <div style={{padding:'10px 12px',marginTop:2,borderRadius:10,background:'rgba(220,150,255,.06)',border:'1px solid rgba(220,150,255,.18)',fontSize:(.54*effScale)+'rem',lineHeight:1.5,color:'rgba(228,200,255,.8)',fontStyle:'italic'}}>{t('imgComposeBlurb')!=='imgComposeBlurb'?t('imgComposeBlurb'):'AI composes a full piece from this image — its colours, energy and mood. Press Play.'}</div>
            )}
          </div>
          )}
          {/* Style — hidden in pure Image source modes (Scan + AI Compose).
              MFI looks similar on screen (image is shown as backdrop) but is
              flagged moodFromImg=true — there we DO compose a piece, so the
              artist picker belongs there. */}
          {(loadedSource!=='image' || moodFromImg) && (
          <div className="pf-inspired-row" style={{position:'relative',marginTop:6,marginBottom:2}}>
            <div className="pf-inspired-label" style={{textAlign:'center',fontSize:(.46*effScale)+'rem',letterSpacing:'.22em',textTransform:'uppercase',fontStyle:'italic',color:'rgba(201,168,76,.6)',userSelect:'none'}}>{t('inspiredByTitle')!=='inspiredByTitle'?t('inspiredByTitle'):'inspired by'}</div>
            {cockpitEdit && (
              <div style={{position:'absolute',right:0,top:'50%',transform:'translateY(-50%)',display:'flex',gap:6}}>
                <button onClick={()=>setSetupArtists([...ALL_ARTIST_KEYS])} style={{padding:'2px 9px',borderRadius:11,fontSize:(.42*effScale)+'rem',fontFamily:'inherit',letterSpacing:'.04em',textTransform:'uppercase',cursor:'pointer',background:'transparent',border:'1px solid rgba(201,168,76,.4)',color:'rgba(201,168,76,.8)'}}>{ts('selAll','all')}</button>
                <button onClick={()=>setSetupArtists(['mosaicFamily'])} style={{padding:'2px 9px',borderRadius:11,fontSize:(.42*effScale)+'rem',fontFamily:'inherit',letterSpacing:'.04em',textTransform:'uppercase',cursor:'pointer',background:'transparent',border:'1px solid rgba(242,238,232,.2)',color:'rgba(230,222,196,.5)'}}>{ts('selNone','none')}</button>
              </div>
            )}
            {!cockpitEdit && (<button onClick={()=>{ setRandomMode(v=>{ const next=!v; setShuffleArtistIndex(0); diceBagRef.current=[]; diceBagKeyRef.current=''; if(!next) setMosaicShuffleLock(false); if(next) setStructureSeedLock(null); else if(composeMode||micPainting) setStructureSeedLock((pollockSessionSeed>>>0)||1); return next; }); }} className="pf-dice" title={randomMode?(style?'random ON · tap to turn off':'shuffle ON · each Play/Next paints a different artist style'):(style?'random OFF · tap to enable':'shuffle OFF · tap to shuffle across all artist styles')} aria-label={randomMode?t('randomOn'):t('randomOff')} style={{position:'absolute',right:0,top:'50%',transform:'translateY(-50%)',width:28,height:28,padding:0,display:'inline-flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',cursor:'pointer',transition:'color .18s, border-color .18s, background .18s',color:randomMode?'rgba(255,200,120,.95)':'rgba(207,197,168,.55)',background:randomMode?'rgba(255,200,120,.1)':'rgba(255,255,255,.02)',border:'1px solid '+(randomMode?'rgba(255,200,120,.4)':'rgba(255,255,255,.08)'),boxShadow:'none'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
            </button>)}
          </div>
          )}
          {(loadedSource!=='image' || moodFromImg) && (
          <>
          {(()=>{
            // ── Adaptive chip grid (max 2 rows) ────────────────────────────
            // Chip count = Mosaic (if family selected) + visible pairs in
            // current setup. Dice sits ABOVE the grid (in the inspired-by
            // header row), so it never affects the row count. Column mapping
            // per spec:
            //   1→1h0d  2→2h0d  3→3h0d  4→2h2d  5→3h2d  6→3h3d
            //   7→4h3d  8→4h4d  9→5h4d  10→5h5d
            const _familyOn = setupArtists.includes('mosaicFamily');
            // Un-paired: count individual artist chips actually shown.
            const _visibleArtists = ALL_ARTIST_KEYS.filter(k=>k!=='mosaicFamily').filter(k=> cockpitEdit ? true : setupArtists.includes(k));
            const _chipCount = ((_familyOn || cockpitEdit)?1:0) + _visibleArtists.length;
            // Column count: keep tiles readable. Up to 5 across (so the full
            // 20-chip edit grid lays out as a tidy 5×4). Fewer chips → fewer cols.
            const _baseCols = (()=>{
              switch(_chipCount){
                case 0: case 1: return 1;
                case 2: return 2;
                case 3: return 3;
                case 4: return 2;
                case 5: case 6: return 3;
                case 7: case 8: case 9: return 4;
                default: return 5;
              }
            })();
            const _cols = _baseCols;
            // Single chip in non-edit → show the name as plain text (no chip),
            // exactly like a single palette. Nothing to switch between.
            if(_chipCount===1 && !cockpitEdit){
              const _soloKey = _visibleArtists.length===1 ? _visibleArtists[0] : 'mosaicFamily';
              const _soloName = _soloKey==='mosaicFamily'
                ? t('mosaicStyle')
                : (()=>{ const _as={'Sam Francis':'Francis','Hilma af Klint':'af Klint','Keith Haring':'Haring','Bridget Riley':'Riley','Joan Mitchell':'Mitchell','Katsushika Hokusai':'Hokusai','Gustav Klimt':'Klimt','Claude Monet':'Monet'}; const _f=STYLE_INSPIRED[_soloKey]||_soloKey; return _as[_f]||_f; })();
              return (
                <div style={{textAlign:'center',padding:'8px 0',fontSize:(.6*effScale)+'rem',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',color:'rgba(220,180,90,.98)'}}>{_soloName}</div>
              );
            }
            return (
          <div style={{display:'grid',gridTemplateColumns:`repeat(${_cols},1fr)`,gap:6,rowGap:8,alignItems:'center'}} title="painting style — mosaic is the plain reading with no artist overlay">
            {/* Mosaic = default; not glowing while Shuffle is drawing an artist.
                Shown when in set, or in edit mode (as a ghost when out of set). */}
            {(setupArtists.includes('mosaicFamily') || cockpitEdit) && (()=>{
              const inFamilyShuffle = !!shuffleStyle && (shuffleStyle==='mosaic' || shuffleStyle==='notes' || shuffleStyle==='oneM');
              // Manual mosaic = selected and NOT being driven by the dice. Like
              // the artist pairs, a shuffle-hit shows the white frame (no gold
              // glow); a manual pick shows the gold glow. Splitting these keeps
              // the Mosaic family visually consistent with the other chips.
              const mosaicManual = style===null && !shuffleStyle;
              // Sub-label reflects the current rendered family member.
              const subKind = (shuffleStyle==='notes') ? 'notes'
                            : (shuffleStyle==='oneM') ? 'oneM'
                            : (shuffleStyle==='mosaic') ? 'mosaic'
                            : (!shuffleStyle && oneMMode) ? 'oneM'
                            : (!shuffleStyle && notesMode) ? 'notes'
                            : 'mosaic';
              const subLabel = subKind==='notes' ? t('notesStyle') : subKind==='oneM' ? t('oneMStyle') : t('mosaicStyle');
              const lockTip = randomMode
                ? (mosaicShuffleLock ? 'mosaic family locked — tap to release back to full shuffle' : 'tap to lock shuffle to mosaic / notes / $1M$')
                : (subKind==='oneM' ? 'tap to clear back to mosaic' : (subKind==='notes' ? 'notes — tap for $1M$' : 'mosaic — tap for note names'));
              return (
            <button onClick={()=>{
              // In edit mode the Mosaic chip behaves like every other chip:
              // tap toggles its membership in the set (mosaicFamily key in
              // setupArtists). This makes the edit grid uniform — every chip
              // is a toggle, none has a hidden second behaviour.
              if(cockpitEdit){
                setSetupArtists(prev => {
                  if(prev.includes('mosaicFamily')){
                    return prev.length>1 ? prev.filter(x=>x!=='mosaicFamily') : prev;
                  }
                  return [...prev, 'mosaicFamily'];
                });
                return;
              }
              if(style!==null){ selectStyle(style); return; }
              if(randomMode){
                // Dice on → toggle "mosaic family" lock. Entering the lock
                // restarts the cycle at 'mosaic' and clears the dice-off
                // notes/oneM flags so the locked shuffle is the sole driver.
                setMosaicShuffleLock(v=>{
                  const nx = !v;
                  if(nx){ setShuffleArtistIndex(0); setNotesMode(false); setOneMMode(false); }
                  return nx;
                });
              } else {
                // Dice off → original 3-tap cycle Mosaic → Notes → $1M$ → Mosaic.
                if(!notesMode && !oneMMode){ setNotesMode(true); }
                else if(notesMode && !oneMMode){ setNotesMode(false); setOneMMode(true); }
                else { setOneMMode(false); setNotesMode(false); }
              }
            }} className={(((cockpitEdit ? setupArtists.includes('mosaicFamily') : mosaicManual))?'pf-artist pf-artist-on':'pf-artist')+(randomMode && mosaicShuffleLock?' pf-art-lock':'')} title={cockpitEdit ? (setupArtists.includes('mosaicFamily')?'in your set — tap to remove':'tap to add to your set') : lockTip} style={{width:'100%',padding:'8px 4px',borderRadius:20,fontSize:(.54*effScale)+'rem',fontWeight:600,letterSpacing:'.04em',fontFamily:'inherit',textTransform:'uppercase',cursor:'pointer',whiteSpace:'nowrap',transition:'all .18s',...(cockpitEdit&&!setupArtists.includes('mosaicFamily')?{background:'transparent',border:'1px dashed rgba(242,238,232,.22)',color:'rgba(230,222,196,.4)'}:chipStyle(cockpitEdit ? setupArtists.includes('mosaicFamily') : mosaicManual)),...(!cockpitEdit&&!mosaicManual&&inFamilyShuffle?{border:'1px solid rgba(242,238,232,.7)',boxShadow:'0 0 0 1px rgba(242,238,232,.25)'}:{})}}>{subLabel}</button>
            ); })()}
            {/* ── Per-artist chips (un-paired). Every artist is its own toggle.
                Free tier: Pro-only artists show a small lock + are dimmed; tapping
                them opens the paywall instead of selecting. Edit mode: tap toggles
                membership in setupArtists. ── */}
            {ALL_ARTIST_KEYS.filter(k=>k!=='mosaicFamily').filter(k=> cockpitEdit ? true : setupArtists.includes(k)).map((k)=>{
              const _artistShort={'Sam Francis':'Francis','Hilma af Klint':'af Klint','Keith Haring':'Haring','Bridget Riley':'Riley','Joan Mitchell':'Mitchell','Katsushika Hokusai':'Hokusai','Gustav Klimt':'Klimt','Claude Monet':'Monet'};
              const _full = STYLE_INSPIRED[k] || k;
              const label = _artistShort[_full] || _full;
              const locked = styleIsLocked(k);            // Pro-only & user is Free
              const isOn = (!cockpitEdit) && (style===k);
              const inSet = setupArtists.includes(k);
              const shufHit = (!cockpitEdit) && (shuffleStyle===k);
              const _ghost = cockpitEdit && !inSet;
              const onClick = ()=>{
                if(cockpitEdit){
                  toggleArtSafe(k);
                  return;
                }
                selectStyle(k);
              };
              return (
                <button key={k}
                  className={isOn?'pf-artist pf-artist-on':'pf-artist'}
                  onClick={onClick}
                  title={cockpitEdit ? (inSet?ts('inYourSet','in your set — tap to remove'):ts('tapToAdd','tap to add to your set')) : (locked? (ts('proArtist','{artist} is Pro').replace('{artist}',_full)) : (isOn?ts('tapToDeselect','tap to deselect'):_full))}
                  style={{position:'relative',width:'100%',padding:'8px 4px',borderRadius:20,fontSize:(.54*effScale)+'rem',fontWeight:600,letterSpacing:'.04em',fontFamily:'inherit',textTransform:'uppercase',cursor:'pointer',whiteSpace:'nowrap',transition:'all .18s',lineHeight:1.2,opacity:(locked&&cockpitEdit)?0.5:1,...(_ghost?{background:'transparent',border:'1px dashed rgba(242,238,232,.22)',color:'rgba(230,222,196,.4)'}:(isOn?{background:PF.card2,border:'1px solid rgba(201,168,76,.4)',color:'rgba(220,180,90,.98)',boxShadow:'none'}:chipStyle(cockpitEdit ? inSet : false))),...(!cockpitEdit&&!isOn&&shufHit?{border:'1px solid rgba(242,238,232,.7)',boxShadow:'0 0 0 1px rgba(242,238,232,.25)'}:{})}}>
                  {label}
                  {locked && cockpitEdit && (
                    <span style={{position:'absolute',top:3,right:5,fontSize:(.34*effScale)+'rem',opacity:.7,letterSpacing:'.02em'}}>🔒</span>
                  )}
                </button>
              );
            })}
          </div>
          ); })()}
          {cockpitEdit && (
            <div style={{textAlign:'center',marginTop:6,fontSize:(.55*effScale)+'rem',letterSpacing:'.02em',color:'rgba(230,222,196,.55)',lineHeight:1.5}}>
              <span>{ts('editHint','Tap to add or remove from your set.')}</span>
            </div>
          )}
          {/* Locked-partner info row — Free tier only. Shows the 'b' (Pro)
              member of the most recently tapped pair with a PRO badge.
              Clickable: opens the paywall with reason 'settings'. */}
          {proStatus==='free' && expandedPair && (()=>{
            const [a,b] = expandedPair.split('|');
            const _artistShort={'Sam Francis':'Francis','Hilma af Klint':'af Klint','Keith Haring':'Haring','Bridget Riley':'Riley','Joan Mitchell':'Mitchell','Claude Monet':'Monet','Katsushika Hokusai':'Hokusai'};
            const lockedName = (_artistShort[STYLE_INSPIRED[b]] || STYLE_INSPIRED[b]);
            return (
              <div
                onClick={()=>{ setPaywallReason('settings'); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); setPaywallReason('settings'); } }}
                title={`${lockedName} — Paintiano Pro`}
                style={{textAlign:'center',marginTop:8,marginBottom:2,padding:'4px 8px',fontSize:(.58*effScale)+'rem',letterSpacing:'.06em',color:'rgba(201,168,76,.7)',fontStyle:'italic',cursor:'pointer',userSelect:'none',borderRadius:6,transition:'color .15s'}}
              >
                {lockedName}<ProBadge t={t} readScale={effScale} size="sm" />
              </div>
            );
          })()}
          {/* ── TONE picker ────────────────────────────────────────────
              Lives right under the artist grid. Three pills matching the
              palette/artist chip styling. Active tone = gold glow. Setting
              applies live; useEffect in tone state pushes _setMixOn /
              _setPastelOn so any visible chord re-renders immediately.
              Shown ONLY when the user enabled 2+ tones in Setup — with a single
              tone there's nothing to switch between, so the picker (and its
              "tone" label) is hidden on the active canvas; the lone tone is
              applied silently. */}
          {isMobilePortrait && (setupTones.length>=2 || cockpitEdit) && (
          <div style={{marginTop:10,marginBottom:2}}>
            <div style={{textAlign:'center',fontSize:(.46*effScale)+'rem',letterSpacing:'.22em',textTransform:'uppercase',fontStyle:'italic',color:'rgba(201,168,76,.6)',userSelect:'none',marginBottom:6}}>{({EN:'tone',SK:'tón',DE:'ton',FR:'tonalité',ES:'tono',PT:'tom',zh:'色调',zhTW:'色調',ja:'トーン'})[lang]||'tone'}</div>
            {(()=>{
              const allTones = [
                {k:'pure',   label:({EN:'Pure',SK:'Čistý',DE:'Pur',FR:'Pur',ES:'Puro',PT:'Puro',zh:'纯净',zhTW:'純淨',ja:'ピュア'})[lang]||'Pure'},
                {k:'real',   label:({EN:'Real',SK:'Skutočný',DE:'Real',FR:'Réel',ES:'Real',PT:'Real',zh:'真实',zhTW:'真實',ja:'リアル'})[lang]||'Real'},
                {k:'pastel', label:({EN:'Pastel',SK:'Pastelový',DE:'Pastell',FR:'Pastel',ES:'Pastel',PT:'Pastel',zh:'柔和',zhTW:'柔和',ja:'パステル'})[lang]||'Pastel'}
              ];
              // Edit mode shows all three (off ones as ghosts to tap-add); normal
              // mode shows only the enabled tones and a tap selects the tone.
              const visTones = cockpitEdit ? allTones : allTones.filter(o => setupTones.includes(o.k));
              if(!visTones.length) return null;
              const cols = visTones.length;
              return (
              <div style={{display:'grid',gridTemplateColumns:`repeat(${cols}, 1fr)`,gap:6}}>
                {visTones.map(o=>{
                  const sel = tone===o.k;
                  const _inSet = setupTones.includes(o.k);
                  const _ghost = cockpitEdit && !_inSet;
                  return (
                  <button key={o.k} onClick={()=>{ if(cockpitEdit){ toggleToneSafe(o.k); return; } setTone(o.k); }} style={{padding:'8px 0',textAlign:'center',borderRadius:10,cursor:'pointer',fontFamily:'inherit',fontSize:(.56*effScale)+'rem',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',transition:'all .18s',...(_ghost?{background:'transparent',border:'1px dashed rgba(242,238,232,.22)',color:'rgba(230,222,196,.4)'}:((!cockpitEdit && sel) ? {background:PF.card2,border:'1px solid rgba(201,168,76,.4)',color:'rgba(220,180,90,.98)',boxShadow:'none'} : chipStyle(cockpitEdit ? _inSet : false)))}}>{o.label}</button>
                  );
                })}
              </div>
              );
            })()}
          </div>
          )}
          </>
          )}
          </div>
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
                const hasFinePointer = typeof window!=='undefined' && window.matchMedia
                  && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
                const doDownload=()=>{
                  const a=document.createElement('a');
                  a.href=preview.url;a.download=preview.filename;
                  a.style.display='none';document.body.appendChild(a);a.click();document.body.removeChild(a);
                };
                if(!hasFinePointer && navigator.share){
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
      {/* Unified SOUND picker: accepts MIDI, audio and score files; loadSound routes
          by extension. accept is broad (iOS dims unknown UTIs like .mxl otherwise). */}
      <input ref={refSound} type="file" accept="audio/midi,audio/x-midi,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,application/octet-stream,.mid,.midi,.mp3,.wav,.ogg,.m4a,.aac,.xml,.musicxml,.mxl" onChange={loadSound} style={{display:'none'}}/>
      <input ref={refImage} type="file" accept="image/*" onChange={loadImage} style={{display:'none'}}/>
      <input ref={refImgMood} type="file" accept="image/*" onChange={loadImgMood} style={{display:'none'}}/>

      {pickMode && (
        <div onClick={()=>setPickMode(null)} className={"pf-picker-overlay"+(['imgmood','sound','midi','audio','score','image'].includes(pickMode)?' pf-picker-left':'')+' pf-picker-'+((pickMode==='sound'||pickMode==='midi'||pickMode==='audio'||pickMode==='score')?'music':(pickMode==='image')?'image':(pickMode==='imgmood')?'mfi':(pickMode==='mic')?'mic':'mood')} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20,backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)'}}>
          <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="choose input" className="pf-picker-dialog" style={{background:'rgba(20,18,30,.92)',border:'1px solid rgba(255,255,255,.06)',borderRadius:24,padding:'22px 18px 16px',minWidth:260,maxWidth:340}}>
            <div style={{textAlign:'center',marginBottom:18,letterSpacing:0,color:PF.cream,fontSize:(.78*effScale)+'rem',fontWeight:500}}>
              {_sent(_stripIcon(pickMode==='sound'?(t('musicInput')||'add music'):pickMode==='midi'?t('midiInput'):pickMode==='audio'?t('audioInput'):pickMode==='score'?t('scoreInput'):pickMode==='mic'?t('micInput'):pickMode==='imgmood'?(t('imgMood')||'mood from image'):t('imageInput')))}
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
              {/* SAMPLE TILE — icon matches the mode (gramophone for music,
                  image-frame for image, sparkles for MFI), label sentence-case,
                  hint shows the actual sample name underneath. */}
              <button onClick={()=>{
                if(micPainting)stopMicPainting();if(micListening)stopMicListening();setComposeMode(false);
                if(draftOwnerRef.current){stashDraft(draftOwnerRef.current);draftOwnerRef.current=null;}
                if(pickMode==='sound') loadSampleScore();
                else if(pickMode==='midi') loadSampleMidi();
                else if(pickMode==='audio') loadSampleAudio();
                else if(pickMode==='score') loadSampleScore();
                else if(pickMode==='imgmood') loadSampleImgMood();
                else loadSampleImage();
                setForceSetup(false);
                setPickMode(null);
              }} className="pf-picker-tile" style={{width:'100%',padding:'14px',background:'rgba(255,255,255,.015)',border:'1px solid rgba(255,255,255,.06)',borderRadius:16,cursor:'pointer',fontFamily:'inherit',textAlign:'center',display:'block',transition:'background-color .18s, border-color .18s'}}>
                <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:(.78*effScale)+'rem',fontWeight:500,letterSpacing:0,lineHeight:1.2,color:PF.cream,marginBottom:3}}><TxIcon n="play" s={14}/>{_sent(_stripIcon(t('builtInSample')))}</span>
                <span style={{display:'block',fontSize:(.6*effScale)+'rem',color:'rgba(230,222,196,.45)',letterSpacing:0,lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{pickMode==='sound'?SAMPLE_SCORE_NAME:pickMode==='midi'?SAMPLE_MIDI_NAME:pickMode==='audio'?SAMPLE_AUDIO_NAME:pickMode==='score'?SAMPLE_SCORE_NAME:pickMode==='imgmood'?SAMPLE_IMAGE_MFI_NAME:'The Starry Night — Vincent van Gogh'}</span>
              </button>

              {/* FILE TILE — universal upload icon, gold accent, hint shows accepted formats. */}
              <button onClick={()=>{
                if(pickMode==='sound') refSound.current?.click();
                else if(pickMode==='midi') refMidi.current?.click();
                else if(pickMode==='audio') refAudio.current?.click();
                else if(pickMode==='score') refScore.current?.click();
                else if(pickMode==='imgmood') refImgMood.current?.click();
                else refImage.current?.click();
                // NOTE: do NOT setPickMode(null) here — doing so in the same tick
                // unmounts the hidden <input> before the browser's file dialog
                // opens, cancelling it (Choose File appeared to do nothing). The
                // loaders (loadMidi/loadAudio/loadScore/loadImage) close the modal
                // via setPickMode(null) once a file is actually selected.
              }} className="pf-picker-tile" style={{width:'100%',padding:'14px',background:'rgba(255,255,255,.015)',border:'1px solid rgba(255,255,255,.06)',borderRadius:16,cursor:'pointer',fontFamily:'inherit',textAlign:'center',display:'block',transition:'background-color .18s, border-color .18s'}}>
                <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:(.78*effScale)+'rem',fontWeight:500,letterSpacing:0,lineHeight:1.2,color:PF.cream,marginBottom:3}}><TxIcon n="upload" s={14}/>{_sent(_stripIcon(t('chooseFile')))}</span>
                <span style={{display:'block',fontSize:(.6*effScale)+'rem',color:'rgba(230,222,196,.45)',letterSpacing:0,lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{pickMode==='sound'?'MIDI · audio · MusicXML':pickMode==='midi'?'MIDI · .mid .midi':pickMode==='audio'?'Audio · .mp3 .wav .m4a .ogg .aac':pickMode==='score'?'MusicXML · .musicxml .xml .mxl':'JPG · PNG · GIF · WEBP · HEIC'}</span>
              </button>
              {/* MY MUSIC TILE — replay a saved slot. Same drawer as the Lite
                  tile so the whole archive is in one place. Shown in every
                  music picker mode (sound/midi/audio/score); drawer itself
                  filters nothing — the user picks by name. */}
              {(pickMode==='sound' || pickMode==='midi' || pickMode==='audio' || pickMode==='score') && (
              <button onClick={()=>{ setPickMode(null); setShowMyMusicDrawer(true); }} className="pf-picker-tile" style={{width:'100%',padding:'14px',background:'rgba(255,255,255,.015)',border:'1px solid rgba(255,255,255,.06)',borderRadius:16,cursor:'pointer',fontFamily:'inherit',textAlign:'center',display:'block',transition:'background-color .18s, border-color .18s'}}>
                <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:(.78*effScale)+'rem',fontWeight:500,letterSpacing:0,lineHeight:1.2,color:PF.cream,marginBottom:3}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>{ts('mymusicTitle',({EN:'My Music',SK:'Moja hudba',DE:'Meine Musik',FR:'Ma musique',ES:'Mi música',PT:'Minha música',zh:'我的音乐',zhTW:'我的音樂',ja:'マイミュージック'})[lang]||'My Music')}</span>
                <span style={{display:'block',fontSize:(.6*effScale)+'rem',color:'rgba(230,222,196,.45)',letterSpacing:0,lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ts('mymusicHint',({EN:'Saved slots · up to 5',SK:'Uložené sloty · max 5',DE:'Gespeicherte Slots · max 5',FR:'Emplacements enregistrés · max 5',ES:'Espacios guardados · máx 5',PT:'Espaços guardados · máx 5',zh:'已保存插槽 · 最多5个',zhTW:'已儲存插槽 · 最多5個',ja:'保存済みスロット · 最大5個'})[lang]||'Saved slots · up to 5')}</span>
              </button>
              )}
              {pickMode==='imgmood' && mfiRecent.length>0 && (
                <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:6}}>
                  <div style={{fontSize:(.58*effScale)+'rem',letterSpacing:'.12em',textTransform:'uppercase',color:'rgba(242,238,232,.4)',textAlign:'center',marginTop:4,marginBottom:2,fontWeight:500}}>
                    {t('recentAiGenerated')||'Recently AI generated'}
                  </div>
                  {mfiRecent.map((entry)=>(
                    <button key={entry.id} onClick={()=>{ _mfiRecall(entry); setPickMode(null); }} style={{padding:'10px 14px',background:'rgba(255,255,255,.012)',color:'rgba(228,178,255,.85)',border:'1px solid rgba(220,150,255,.18)',borderRadius:12,cursor:'pointer',fontFamily:'inherit',letterSpacing:0,fontSize:(.72*effScale)+'rem',textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {entry.title}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={()=>setPickMode(null)} style={{padding:'8px',background:'transparent',color:'rgba(180,170,150,.45)',border:'none',cursor:'pointer',fontFamily:'inherit',letterSpacing:0,fontSize:(.72*effScale)+'rem',marginTop:6,width:'100%'}}>
                {_sent(t('cancel'))}
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

      {working && !(isDesktop && loadedSource==='image' && !moodFromImg) && (
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
        const seekTitle = _atmoTitle || (info ? info.title : (composeMode ? t('compose').replace(/[^\p{L} ]/gu,'') : (micPainting||micListening||micActive) ? t('mic').replace(/[^\p{L} ]/gu,'') : '')); const seekDur = info ? info.dur : Math.round((chords[chords.length-1]?.startMs||0)/1000)||0; const showTransport = !!info || (chords.length>0 && (playing||holdPaused) && !micPainting && !micListening);
        // Title group (mood/morph title + library/AI badge). Rendered either
        // inline in the seek row (default) or as a separate block above the
        // seek bar on the 5-col layout (desktop/tablet landscape) — there the
        // narrow tools column would otherwise truncate long morph chains.
        const _titleSpan = basicMode
          ? (<span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:(.52*effScale)+'rem',letterSpacing:'.06em',fontStyle:'italic',color:'rgba(201,168,76,.7)'}}>{seekTitle}</span>)
          : (<span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',opacity:seekTitle.includes('→')?0.85:0.5,color:seekTitle.includes('→')?'rgba(220,170,255,.9)':'inherit',fontSize:seekTitle.includes('→')?'.62rem':'.57rem',fontStyle:seekTitle.includes('→')?'italic':'normal'}}>{seekTitle}</span>);
        const _showAiBadge = (moodContext && composeSource==='ai') || _imgAtmo;
        const _badgeSpan = _showAiBadge ? (<span style={{flexShrink:0,fontSize:(.46*effScale)+'rem',letterSpacing:'.08em',textTransform:'uppercase',padding:'1px 5px',borderRadius:6,whiteSpace:'nowrap',color:'rgba(220,170,255,.95)',border:'1px solid rgba(220,170,255,.4)'}}>✦ AI</span>) : null;
        return (<>
        {showTransport && (<>
        {is5Col && (imgMoodThumb || (moodFromImg && originalImgUrl)) && moodContext && !(disp===0 && !playing && !anim) && (
          <div className="pf-track-head" style={{width:'100%',maxWidth:(viewMode==='image'&&originalImgUrl)?`min(100%, 560px)`:`min(100%, ${CW}px)`,marginLeft:'auto',marginRight:'auto',boxSizing:'border-box',marginBottom:6,display:'flex',alignItems:'center',justifyContent:'center',gap:8,flexWrap:'wrap'}}>
            <img src={imgMoodThumb || originalImgUrl} alt="source" style={{width:44,height:44,objectFit:'cover',borderRadius:8,border:'1px solid rgba(220,150,255,.45)',boxShadow:'0 2px 8px rgba(0,0,0,.4)',opacity:.88,flexShrink:0}}/>
          </div>
        )}
        <div className="pf-seek-block" style={{width:'100%',maxWidth:(viewMode==='image'&&originalImgUrl)?`min(100%, 560px)`:`min(100%, ${CW}px)`,marginLeft:'auto',marginRight:'auto',boxSizing:'border-box',marginBottom:basicMode?7:8}}>
          <div style={{display:'flex',alignItems:'center',fontSize:(.57*effScale)+'rem',marginBottom:4}}>
            <span style={{display:'inline-flex',alignItems:'center',gap:6,flex:1,minWidth:0,overflow:'hidden'}}>{_titleSpan}{_badgeSpan}</span>
            {basicMode && !liteImageMode && effectiveStyle && effectiveStyle!=='notes' && effectiveStyle!=='mosaic' && STYLE_INSPIRED[effectiveStyle] && (
              <span key={'insp-'+effectiveStyle} className="pf-artist-glow" style={{flexShrink:0,marginLeft:8,fontSize:(.52*effScale)+'rem',letterSpacing:'.1em',textTransform:'uppercase',fontStyle:'italic',color:'rgba(201,168,76,.7)',whiteSpace:'nowrap'}}>
                <span style={{fontStyle:'normal',opacity:.65}}>{t('inspiredByTitle')!=='inspiredByTitle'?t('inspiredByTitle'):'inspired by'}</span> {STYLE_INSPIRED[effectiveStyle]}
              </span>
            )}
            {basicMode && !liteImageMode && (!effectiveStyle || effectiveStyle==='notes' || effectiveStyle==='mosaic' || !STYLE_INSPIRED[effectiveStyle]) && (
              <span key={`insp-${effectiveStyle==='notes'?'notes':'mosaic'}`} className="pf-artist-glow" style={{flexShrink:0,marginLeft:8,fontSize:(.52*effScale)+'rem',letterSpacing:'.14em',textTransform:'uppercase',fontStyle:'italic',color:'rgba(201,168,76,.7)',whiteSpace:'nowrap'}}>{effectiveStyle==='notes'?t('notesStyle'):t('mosaicStyle')}</span>
            )}
          </div>
          {(viewMode!=='image' || !(recording||!!recBlob)) && (
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
              // Lock seeking while recording — a tap/scrub would stopAll() (and
              // thus the recorder), prematurely ending the take and surfacing
              // Save mid-record. The bar is read-only during REC.
              if(recording)return;
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
              if(recording)return;
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
              if(recording)return;
              try{e.currentTarget.releasePointerCapture(e.pointerId);}catch(_){}
              const idx=resumeFromRef.current;
              startPlay();
              if(resumeFromRef.current===null&&idx!==null)resumeFromRef.current=idx;
            }}
            onKeyDown={e=>{
              if(!chords.length)return;
              if(recording)return;
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
            <div style={{height:'100%',width:pct+'%',background:basicMode?'rgba(242,238,232,.7)':(playing?'rgba(90,190,110,.65)':'rgba(201,168,76,.45)'),borderRadius:3,transition:'none',pointerEvents:'none'}}/>
          </div>
          )}
          {/* "Pick a look" + edit dial — desktop/tablet only, in the gap between the
              seek bar and the styles box (this block sits in grid-area rtop, the box
              in styles below it). Mobile has its own header up top. Music modes only. */}
          {isDesktop && !basicMode && (loadedSource!=='image' || moodFromImg) && !composeMode && !micActive && (
          <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4,marginBottom:0,padding:'0 2px'}}>
            <span style={{flex:1,fontSize:(.5*effScale)+'rem',letterSpacing:'.26em',textTransform:'uppercase',color:'rgba(201,168,76,.7)'}}>{ts('pickLook','Pick a look')}</span>
          </div>
          )}
        </div>
        </>)}
        </>);
      })()}

        {basicMode && !liteImageMode && chords.length===0 && !playing && !busy && !composeMode && !micActive && !loadedSource && !liteEverUnlockedRef.current && (
          <div style={{minHeight:'46dvh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:18}}>
            <div onClick={(e)=>{ e.stopPropagation(); if(!liteEverUnlockedRef.current) litePlayStart(); }} onPointerDown={(e)=>{ e.stopPropagation(); if(!liteEverUnlockedRef.current) litePlayStart(); }} role="button" aria-label={t('play')||'Play'}
              style={{position:'relative',width:130,height:130,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
              <span className="pf-breathe" style={{position:'absolute',width:130,height:130,borderRadius:'50%',background:'radial-gradient(circle,rgba(240,192,64,.42),transparent 65%)'}}/>
              <span style={{position:'relative',zIndex:2,width:90,height:90,borderRadius:'50%',background:'linear-gradient(145deg,rgba(255,225,140,.96),rgba(220,170,70,.93))',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 30px rgba(240,192,64,.42),inset 0 2px 11px rgba(255,250,220,.7),inset 0 -4px 13px rgba(150,105,20,.55)'}}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="#1a1206" style={{marginLeft:6}} aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
              </span>
            </div>
          </div>
        )}
      {isActiveView && (<>
      {(imgMoodThumb || (moodFromImg && originalImgUrl)) && moodContext && !is5Col && !(disp===0 && !playing && !anim) && (()=>{
        // Body 11: once playback begins / the mood pic has been drawn (disp>0),
        // the picture appears as a small thumbnail above the canvas, acting as
        // a reminder of the source. Before that (step 1), the picture lives
        // INSIDE the canvas (handled by the image-scan render path above),
        // not as a separate above-canvas card. After playback finishes or
        // pauses, the thumb stays (no return to the full-canvas picture).
        const _thumbSrc = imgMoodThumb || originalImgUrl;
        return (
          <div className="pf-mood-thumb" style={{display:'flex',justifyContent:'center',marginBottom:10,transition:'margin .25s ease'}}>
            <img src={_thumbSrc} alt="source" style={{width:74,height:74,objectFit:'cover',borderRadius:10,border:'1px solid rgba(220,150,255,.45)',boxShadow:'0 2px 10px rgba(0,0,0,.4)',opacity:.88,transition:'all .3s ease'}}/>
          </div>
        );
      })()}
      {/* MFI Recent strip removed from here — now rendered inside the MFI picker
          as 'Recently AI generated' button + text labels (no thumbnails). */}
      {immersive && <div onClick={wakeControls} onPointerMove={wakeControls} style={{position:'fixed',inset:0,zIndex:9998,background:'#06060c'}}/>}
      {/* Exit-fullscreen button — rendered OUTSIDE the canvas wrap. The wrap uses
          transform:translate(-50%,-50%) in immersive, and a position:fixed child
          of a transformed element anchors to that element, not the viewport — so
          an exit button placed inside the wrap flew off-screen with tall images.
          Here it's a sibling of the wrap, truly fixed to the viewport corner,
          always reachable regardless of the painting's size or aspect ratio. */}
      {immersive && (
        <button onClick={(e)=>{e.stopPropagation(); setImmersive(false);}} aria-label="exit fullscreen" title="Exit fullscreen" style={{position:'fixed',top:'max(12px, env(safe-area-inset-top))',right:'max(12px, env(safe-area-inset-right))',zIndex:10002,width:38,height:38,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:10,cursor:'pointer',background:'rgba(6,6,12,.6)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',border:'1px solid rgba(201,168,76,.35)',color:'rgba(201,168,76,.9)',padding:0,WebkitTapHighlightColor:'transparent',transition:'opacity .4s ease'}}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
        </button>
      )}
      {/* Fullscreen artist attribution — fixed near the viewport top so it sits
          in the black letterbox ABOVE the canvas. The user prefers it high (even
          close to the URL bar) over ever landing on the painting. Shows the
          inspiring artist (fixed pick OR shuffle draw); also shown for the
          Mosaic family. "inspired by" prefix is added for artists and for
          oneM ("One Million Dollar Page"); plain Mosaic and Notes show the
          bare label without the prefix. */}
      {immersive && STYLE_INSPIRED[effectiveStyle || 'mosaic'] && (()=>{
        const _key = effectiveStyle || 'mosaic';
        const _bare = (_key === 'mosaic' || _key === 'notes');
        const _label = _key === 'notes' ? t('notesStyle')
                     : _key === 'mosaic' ? t('mosaicStyle')
                     : STYLE_INSPIRED[_key];
        return (
        <div style={{position:'fixed',top:'max(8px, env(safe-area-inset-top))',left:'50%',transform:'translateX(-50%)',zIndex:10000,textAlign:'center',fontSize:(.6*effScale)+'rem',letterSpacing:'.16em',textTransform:'uppercase',color:'rgba(201,168,76,.95)',fontStyle:'italic',textShadow:'0 2px 10px rgba(0,0,0,.95)',pointerEvents:'none',whiteSpace:'nowrap',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
          {!style&&(<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{opacity:.85}}><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>)}
          {!_bare && (<span style={{fontStyle:'normal',opacity:.7}}>{t('inspiredByTitle')||'inspired by'}</span>)} {_label}
        </div>
        );
      })()}
      <div ref={canvasWrapRef} className="pf-stage-part" style={{position:'relative',maxWidth:'100%',boxSizing:'border-box',border:basicMode?'none':(varyFlash?'1px solid rgba(201,168,76,.8)':'1px solid rgba(201,168,76,.12)'),boxShadow:basicMode?'none':(varyFlash?'0 0 40px rgba(201,168,76,.25), 0 0 40px rgba(0,0,0,.6)':'0 0 40px rgba(0,0,0,.6)'),marginBottom:basicMode?4:8,transition:'border-color .15s ease, box-shadow .15s ease',transform:micVolActive?`scale(${1+micVolLevel*0.04})`:'none',transformOrigin:'center center',WebkitTouchCallout:'none',WebkitUserSelect:'none',userSelect:'none',...((basicMode&&isDesktop&&(composeMode||micActive))?{width:'auto',minWidth:0,maxWidth:'100%',maxHeight:'calc(100dvh - 210px)',marginLeft:'auto',marginRight:'auto'}:(composeMode||micActive)?{width:'100%',minWidth:0,maxWidth:`min(100%, ${CW}px)`,maxHeight:'calc(100dvh - 210px)',marginLeft:'auto',marginRight:'auto'}:(viewMode==='image'&&originalImgUrl)?{width:'100%',minWidth:0,maxWidth:`min(100%, 560px)`,marginLeft:'auto',marginRight:'auto'}:(basicMode&&!isDesktop)?{width:'auto',minWidth:0,maxWidth:`min(100%, ${CW}px)`,maxHeight:'calc(100dvh - 250px)',marginLeft:'auto',marginRight:'auto'}:{width:'100%',minWidth:0,maxWidth:`min(100%, ${CW}px)`}),...(immersive?{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:`min(98vw, calc(98dvh * ${CW} / ${CH}))`,maxWidth:'none',maxHeight:'none',height:'auto',margin:0,zIndex:9999,border:'1px solid rgba(201,168,76,.25)'}:{})}}
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
            const artistStyle = effectiveStyle && effectiveStyle!=='notes' && effectiveStyle!=='oneM';
            if(artistStyle){
              const artist=STYLE_INSPIRED[effectiveStyle]||effectiveStyle;
              setErr(t('selectNeedsMosaic').replace('{artist}',artist));
              setErrInfo(true);
              return;
            }
            setSelectedChordIdx(prev=>{const v=prev===hit.idx?null:hit.idx;selectedChordIdxRef.current=v;return v;});  // tap again to deselect
          }
          unlockAudio();
          // Note playback on canvas tap is only for the plain Mosaic and the
          // Notes overlay (both are literal note grids you can "play"). For any
          // artist style the cells are painted abstractly — tapping (or hitting
          // the Next button that sits over the canvas) should NOT trigger the
          // underlying notes, which was distracting in canvas / fullscreen mode.
          const _artistStyleNow = effectiveStyle && effectiveStyle!=='notes' && effectiveStyle!=='oneM';
          if(_artistStyleNow) return;
          const midis=hit.n.map(({m,v,durMs})=>{playNote(m,v,durMs||300);return{m,dur:durMs||300};});
          setActive(p=>{const s=new Set(p);for(const x of midis)s.add(x.m);return s;});
          const byDur={};
          for(const{m,dur}of midis){const t=Math.min(dur,800);(byDur[t]||(byDur[t]=[])).push(m);}
          for(const[t,ms]of Object.entries(byDur)){
            pushTimer(()=>setActive(p=>{const s=new Set(p);ms.forEach(m=>s.delete(m));return s;}),+t);
          }
        }}
      >
        {/* My Music ♡ Save button — top-LEFT mirror of the fullscreen ⛶ button
            on top-right. Appears whenever any imported piece is loaded (audio
            mp3/wav/m4a, midi, or MusicXML — all get saved to the same shared
            archive). Tap opens the save modal which prefills the name from
            the file (if any) or an auto-timestamped fallback, and shows the
            target slot. */}
        {!immersive && !(basicMode && chords.length===0 && (working||micArmed||micActive)) && (
          (loadedSource==='audio' && !!audioBlob)
          || (loadedSource==='midi'  && !!midiBlob)
          || (loadedSource==='score' && !!scoreBlob)
        ) && (
        <button onClick={(e)=>{
          e.stopPropagation();
          const _pad=n=>String(n).padStart(2,'0');
          const _now=new Date();
          const _autoWord=({EN:'Song',SK:'Skladba',DE:'Lied',FR:'Chanson',ES:'Canción',PT:'Música',zh:'歌曲',zhTW:'歌曲',ja:'曲'})[lang]||'Song';
          const _rawName = loadedSource==='audio' ? audioName
                         : loadedSource==='midi'  ? midiName
                         : loadedSource==='score' ? scoreName
                         : '';
          const _stem=(_rawName||'').replace(/\.[^.]+$/,'').trim();
          const _autoName=_autoWord+' '+_now.getFullYear()+'-'+_pad(_now.getMonth()+1)+'-'+_pad(_now.getDate())+' '+_pad(_now.getHours())+':'+_pad(_now.getMinutes());
          setMyMusicSaveName(_stem || _autoName);
          setMyMusicSaveTargetSlot(null);
          myMusicFirstEmpty().then(slot=>setMyMusicSaveTargetSlot(slot));
          setShowMyMusicSaveModal(true);
        }} aria-label={ts('mymusicSaveAria','Save to My Music')} title={ts('mymusicSaveAria','Save to My Music')} className="pf-mymusic-btn" style={{position:'absolute',top:8,left:8,zIndex:12,width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:9,cursor:'pointer',background:'rgba(6,6,12,.45)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',border:'1px solid rgba(201,168,76,.2)',color:'rgba(201,168,76,.7)',padding:0,WebkitTapHighlightColor:'transparent',opacity:controlsAwake?1:0,pointerEvents:controlsAwake?'auto':'none',transition:'opacity .4s ease'}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>)}
        {!immersive && !(basicMode && chords.length===0 && (working||micArmed||micActive)) && <button onClick={(e)=>{e.stopPropagation(); setImmersive(v=>!v);}} aria-label="fullscreen" title="Fullscreen" className="pf-fs-btn" style={{position:'absolute',top:8,right:8,zIndex:12,width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:9,cursor:'pointer',background:'rgba(6,6,12,.45)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',border:'1px solid rgba(201,168,76,.2)',color:'rgba(201,168,76,.7)',padding:0,WebkitTapHighlightColor:'transparent',opacity:controlsAwake?1:0,pointerEvents:controlsAwake?'auto':'none',transition:'opacity .4s ease, top .25s ease'}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
        </button>}
        {/* Fullscreen CTA row — Next (shuffle: jump to a new variation, works
            while playing too) and Save (when the piece is complete & still). Each
            appears by its own condition; they can show together. Fades with the
            other controls on idle. */}
        {immersive && !basicMode && (()=>{
          const exportReadyFs =
            (chords.length>0 && !playing && !anim && !holdPaused && disp>=chords.length &&
             !demoReelOn && !composeMode && !micActive && !micArmed && !busy && !recording && viewMode!=='image')
            || ((composeMode||micActive||micArmed) && chords.length>0 && !demoReelOn && !busy && !recording && viewMode!=='image');
          const canRollNextFs = (disp>0||playing||holdPaused) && !anim && !working && !demoReelOn && !recording && !micActive && !showMode;
          const showNextFs = randomMode && (effectiveStyle||shuffleStyle) && chords.length>0 && viewMode!=='image' && canRollNextFs;
          const showSlideFs = playing && randomMode && (effectiveStyle||shuffleStyle) && chords.length>0 && viewMode!=='image';
          const showPaletteFs = chords.length>0 && (disp>0 || playing || holdPaused);
          if(!exportReadyFs && !showNextFs && !showPaletteFs && !showSlideFs) return null;
          return (
            <div className="pf-fs-controls" style={{position:'fixed',zIndex:10000,display:'flex',opacity:controlsAwake?1:0,pointerEvents:controlsAwake?'auto':'none',transition:'opacity .4s ease',...(immersive?{
                top:'50%',
                left:`min(calc(50% + min(49vw, 49dvh * ${CW} / ${CH}) + 14px), calc(100vw - 164px))`,
                transform:'translateY(-50%)',
                flexDirection:'column',
                alignItems:'stretch',
                gap:8,
                width:150
              }:{
                bottom:'max(20px, env(safe-area-inset-bottom))',
                left:'50%',
                transform:'translateX(-50%)',
                alignItems:'center',
                gap:10
              })}}>
              {showPaletteFs && (
                <button onClick={(e)=>{ e.stopPropagation(); cycleColorFs(); wakeControls(); }} className="pf-lift" aria-label="cycle palette"
                  style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:5,padding:'12px 24px',borderRadius:26,cursor:'pointer',fontFamily:'inherit',fontSize:(.62*effScale)+'rem',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',whiteSpace:'nowrap',color:'#fff',background:'linear-gradient(135deg,#5b8bf0,#3361d9)',border:'1px solid #5b8bf0',boxShadow:'0 6px 22px rgba(91,139,240,.45)',WebkitTapHighlightColor:'transparent'}}>
                  {t(mode)||mode} ›
                </button>
              )}
              {showNextFs && (
                <button onClick={(e)=>{ e.stopPropagation(); nextRollInProgressRef.current=true; if(style){ _diceRoll(); } else if(randomMode){ _diceRoll(); } wakeControls(); }} className="pf-lift" aria-label="next painting"
                  style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:5,padding:'12px 24px',borderRadius:26,cursor:'pointer',fontFamily:'inherit',fontSize:(.62*effScale)+'rem',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',whiteSpace:'nowrap',color:'#fff',background:'linear-gradient(135deg,#e8557a,#d13b66)',border:'1px solid #e8557a',boxShadow:'0 6px 22px rgba(209,59,102,.45)',WebkitTapHighlightColor:'transparent'}}>
                  next ›
                </button>
              )}
              {exportReadyFs && typeof navigator!=='undefined' && navigator.share && (
                <button onClick={(e)=>{ e.stopPropagation(); exportImage('story', true, null, null, true); }} className="pf-lift" aria-label="share to story"
                  style={{display:'inline-flex',alignItems:'center',gap:8,padding:'11px 24px',borderRadius:26,cursor:'pointer',fontFamily:'inherit',fontSize:(.62*effScale)+'rem',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'#0a0a12',background:'linear-gradient(135deg,'+PF.gold+','+PF.gold2+')',border:'1px solid '+PF.gold2,boxShadow:'0 6px 22px rgba(240,192,64,.35)',WebkitTapHighlightColor:'transparent'}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/></svg>
                  {t('shareStory')||'Story'}
                </button>
              )}
              {showSlideFs && (
                <button onClick={(e)=>{ e.stopPropagation(); toggleShow(); wakeControls(); }} className="pf-lift" aria-label="auto-shuffle paintings" aria-pressed={showMode}
                  style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,padding:'11px 18px',borderRadius:26,cursor:'pointer',fontFamily:'inherit',fontSize:(.6*effScale)+'rem',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',whiteSpace:'nowrap',color:showMode?'#0a0a12':'#ffd07a',background:showMode?'linear-gradient(135deg,'+PF.gold+','+PF.gold2+')':'rgba(255,200,120,.20)',border:'1px solid '+(showMode?PF.gold2:'rgba(255,200,120,.6)'),boxShadow:showMode?'0 6px 22px rgba(240,192,64,.4)':'0 4px 14px rgba(255,200,120,.2)',WebkitTapHighlightColor:'transparent'}}>
                  ↻ {t('showLabel')!=='showLabel'?t('showLabel'):'Show'}
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
        {viewMode==='image'&&originalImgUrl&&(!moodFromImg || (!playing&&!anim&&disp===0))&&(
          <img src={originalImgUrl} alt="original" onLoad={e=>{const w=e.target.naturalWidth,h=e.target.naturalHeight; if(w&&h) setMfiImgAspect(w+' / '+h);}} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'fill',objectPosition:'0 0',display:'block',zIndex:0,pointerEvents:'none',transition:'opacity .25s ease'}}/>
        )}
        <audio ref={audioElRef} style={{display:'none'}} preload="auto"/>
        <canvas ref={canvasRef} width={CW*_ssF} height={CH*_ssF} role="img" aria-label={chords.length?`music painting, ${chords.length} ${chords.length===1?'chord':'chords'}`:'music painting'} style={{display:'block',position:'relative',zIndex:1,opacity:(viewMode==='image'&&originalImgUrl)?((playing||anim||holdPaused)?0.70:0):1,mixBlendMode:viewMode==='image'&&originalImgUrl?'screen':'normal',transition:'opacity 0.25s ease',...((composeMode||micPainting)?{width:'auto',height:'auto',aspectRatio:CW+' / '+CH,maxWidth:`min(100%, ${CW}px)`,maxHeight:'calc(100dvh - 210px)'}:(viewMode==='image'&&originalImgUrl)?{width:'100%',height:'auto',maxWidth:`min(100%, 560px)`,aspectRatio:(moodFromImg&&mfiImgAspect)?mfiImgAspect:undefined}:(basicMode&&!isDesktop)?{width:'auto',height:'auto',aspectRatio:CW+' / '+CH,maxWidth:`min(100%, ${CW}px)`,maxHeight:'calc(100dvh - 250px)',marginLeft:'auto',marginRight:'auto'}:{width:'100%',height:'auto',maxWidth:`min(100%, ${CW}px)`}),...(immersive?{width:'100%',height:'auto',maxWidth:'none',maxHeight:'none',aspectRatio:undefined,borderRadius:0,outline:'none',boxShadow:'none'}:{})}}/>
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
        {(micActive || micArmed) && !basicMode && (
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
        {!basicMode && chords.length===0 && micArmed && !micActive && (
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
        // Tint the export picker to match the active source/mode so the dialog
        // visually reads as "this is the MIDI save / image save / etc". The
        // colour family mirrors the source tile on the setup screen.
        //   compose      → green
        //   mic          → pink
        //   loaded MIDI  → blue
        //   loaded Audio → orange
        //   loaded Score → purple
        //   loaded Image → green (classic image source, not MFI)
        //   MFI          → magenta
        //   text Mood    → gold
        //   fallback     → violet (covers compose-finished pieces with no
        //                  loadedSource flag yet, etc.)
        const pk = composeMode
          ? { line:'rgba(78,203,141,.9)', dim:'rgba(120,200,160,.5)', border:'rgba(78,203,141,.45)', edge:'rgba(78,203,141,.35)' }
          : (micActive||micArmed)
          ? { line:'rgba(240,106,166,.9)', dim:'rgba(240,150,190,.5)', border:'rgba(240,106,166,.45)', edge:'rgba(240,106,166,.35)' }
          : loadedSource==='midi'
          ? { line:'rgba(91,156,246,.95)', dim:'rgba(140,180,255,.5)', border:'rgba(91,156,246,.5)', edge:'rgba(91,156,246,.4)' }
          : loadedSource==='audio'
          ? { line:'rgba(244,124,60,.95)', dim:'rgba(255,160,100,.5)', border:'rgba(244,124,60,.5)', edge:'rgba(244,124,60,.4)' }
          : loadedSource==='score'
          ? { line:'rgba(169,127,245,.95)', dim:'rgba(200,170,255,.5)', border:'rgba(169,127,245,.5)', edge:'rgba(169,127,245,.4)' }
          : (loadedSource==='image' && !moodFromImg)
          ? { line:'rgba(244,124,60,.95)', dim:'rgba(255,160,100,.5)', border:'rgba(244,124,60,.5)', edge:'rgba(244,124,60,.4)' }
          : moodFromImg
          ? { line:'rgba(228,178,255,.95)', dim:'rgba(225,175,255,.55)', border:'rgba(220,150,255,.55)', edge:'rgba(220,150,255,.4)' }
          : currentMood
          ? { line:'rgba(220,180,90,.95)', dim:'rgba(220,180,90,.55)', border:'rgba(201,168,76,.55)', edge:'rgba(201,168,76,.4)' }
          : { line:'rgba(200,160,255,.85)', dim:'rgba(180,160,255,.45)', border:'rgba(180,140,255,.4)', edge:'rgba(200,160,255,.35)' };
        // Imported-media sources (MIDI / Audio / Score files) are themselves
        // the canonical audio/score — exporting them back into the same format
        // is redundant. For these, the picker shows ONLY visual exports
        // (Story / Web / Print). Image/Mood/MFI/compose/mic keep the full
        // option set because their pieces are newly composed.
        const isImportedMedia = loadedSource==='midi' || loadedSource==='audio' || loadedSource==='score';
        return (
        <div onClick={()=>setShowSizePicker(false)} className="pf-save-overlay" style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.92)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10010,padding:'4vh 16px'}}>
          <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="export" style={{background:'rgba(20,18,30,0.92)',border:'1px solid rgba(255,255,255,.06)',borderRadius:24,padding:'22px 18px 16px',minWidth:260,maxWidth:340,backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)'}}>
            <div style={{textAlign:'center',marginBottom:14,letterSpacing:0,color:PF.cream,fontSize:(.78*effScale)+'rem',fontWeight:500}}>{_sent(t('save'))}</div>
            <input
              ref={compInputRef}
              type="text"
              value={compositionName}
              onChange={e=>setCompositionName(e.target.value)}
              onFocus={()=>{inputFocus.current=true;setFocusedInput('comp');}}
              onBlur={()=>{inputFocus.current=false;setFocusedInput(null);}}
              placeholder={t('nameThisPiece')}
              maxLength={80}
              aria-label={t('nameThisPiece')}
              style={{width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,.018)',border:'1px solid '+(focusedInput==='comp'?'rgba(255,255,255,.25)':'rgba(255,255,255,.08)'),borderRadius:12,padding:'10px 14px',color:'rgba(247,243,236,.95)',fontSize:(.72*effScale)+'rem',fontFamily:'inherit',outline:'none',letterSpacing:0,textAlign:'center',marginBottom:14,transition:'border-color .15s ease'}}
            />
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {viewMode==='image' ? (
                <>
                  {/* Image mode export set:
                      • Story — 9:16 PNG (the ORIGINAL image, not the mosaic) + audio, for IG/TikTok
                      • checkbox "include source original image" — gates whether the
                        ORIGINAL picture rides along with Story and Audio
                      • Audio — opens the in-app share row (like mood/score). With the
                        checkbox on it offers the original image + the WAV (two files);
                        off, just the WAV.
                      • Score — MusicXML in-app row
                      Web/Print removed: in image mode the source already IS a picture. */}
                  {originalImgUrl && (
                    <button onClick={()=>setIncludeSourceThumb(v=>!v)} aria-pressed={includeSourceThumb} style={{padding:'10px 12px',background:'transparent',color:includeSourceThumb?'rgba(247,243,236,.85)':'rgba(247,243,236,.5)',border:'none',borderBottom:'1px solid rgba(255,255,255,.05)',borderRadius:0,cursor:'pointer',fontFamily:'inherit',letterSpacing:0,fontSize:(.66*effScale)+'rem',display:'flex',alignItems:'center',gap:10,marginBottom:8,fontWeight:500}}>
                      <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,borderRadius:5,border:'1px solid '+(includeSourceThumb?'rgba(255,255,255,.18)':'rgba(255,255,255,.12)'),background:'transparent',color:'rgba(220,180,90,.95)',fontSize:'.8rem',lineHeight:1,fontWeight:600,flexShrink:0}}>{includeSourceThumb?'✓':''}</span>
                      <span style={{flex:1,textAlign:'left'}}>{t('includeSourceImage')!=='includeSourceImage' ? t('includeSourceImage') : 'include source original image'}</span>
                    </button>
                  )}
                  <button onClick={()=>{
                    pendingWithSourceRef.current=includeSourceThumb;
                    setShowSizePicker(false);
                    if(recBlob && recName) exportImage('story', true, recBlob, recName, includeSourceThumb);
                    else { setRecordIntent('story'); startRecord(); }
                  }} style={{padding:'14px',background:'linear-gradient(135deg,rgba(255,215,120,.16),rgba(220,170,70,.08))',color:'rgba(255,220,140,.95)',border:'1px solid rgba(255,210,120,.4)',borderRadius:12,cursor:'pointer',fontFamily:'inherit',letterSpacing:0,fontSize:(.72*effScale)+'rem',fontWeight:500}}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:6,justifyContent:'center'}}><TxIcon n="sparkle" s={14}/>{t('sizeStory')||'Story'}</span>
                    <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(255,210,140,.55)',marginTop:4,letterSpacing:0,fontWeight:400}}>{t('storyImageHint')||'painting + audio · for IG / TikTok'}</div>
                  </button>
                  <button onClick={()=>{
                    pendingWithSourceRef.current=includeSourceThumb;
                    setShowSizePicker(false);
                    if(recBlob && recName){
                      // The live recording from Play/REC is already on hand — just
                      // open the in-app audio row with it (optionally carrying the
                      // original image). No offline re-render (that could hang or
                      // fail silently in image mode).
                      setAudioSideImage(includeSourceThumb ? (originalImgUrl||null) : null);
                      setAudioRowOpen(true);
                      setAudioShareMsg(null);
                    }
                    else { setRecordIntent('audio'); startRecord(); }
                  }} style={{padding:'14px',background:'rgba(255,255,255,.02)',color:'rgba(247,243,236,.85)',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,cursor:'pointer',fontFamily:'inherit',letterSpacing:0,fontSize:(.72*effScale)+'rem',fontWeight:500}}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:6,justifyContent:'center'}}><TxIcon n="rec" s={14}/>{t('saveAudioLabel')||'Audio'}</span>
                    <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(230,222,196,.4)',marginTop:4,letterSpacing:0}}>{includeSourceThumb ? (t('saveAudioHintImg')!=='saveAudioHintImg'?t('saveAudioHintImg'):'image + audio · save to files') : (t('saveAudioHint')||'audio · save to files')}</div>
                  </button>
                  <button onClick={()=>{ setShowSizePicker(false); saveScore(); }} style={{padding:'14px',background:'rgba(255,255,255,.02)',color:'rgba(247,243,236,.85)',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,cursor:'pointer',fontFamily:'inherit',letterSpacing:0,fontSize:(.72*effScale)+'rem',fontWeight:500}}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:6,justifyContent:'center'}}><TxIcon n="notes" s={14}/>{t('scoreExport')}</span>
                    <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(230,222,196,.4)',marginTop:4,letterSpacing:0}}>{t('scoreExportHint')||'MusicXML · for MuseScore'}</div>
                  </button>
                </>
              ) : (
                <>
                  {(originalImgUrl || imgMoodThumb) && (
                    <button onClick={()=>setIncludeSourceThumb(v=>!v)} aria-pressed={includeSourceThumb} style={{padding:'10px 12px',background:'transparent',color:includeSourceThumb?'rgba(247,243,236,.85)':'rgba(247,243,236,.5)',border:'none',borderBottom:'1px solid rgba(255,255,255,.05)',borderRadius:0,cursor:'pointer',fontFamily:'inherit',letterSpacing:0,fontSize:(.66*effScale)+'rem',display:'flex',alignItems:'center',gap:10,marginBottom:8,fontWeight:500}}>
                      <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,borderRadius:5,border:'1px solid '+(includeSourceThumb?'rgba(255,255,255,.18)':'rgba(255,255,255,.12)'),background:'transparent',color:'rgba(220,180,90,.95)',fontSize:'.8rem',lineHeight:1,fontWeight:600,flexShrink:0}}>{includeSourceThumb?'✓':''}</span>
                      <span style={{flex:1,textAlign:'left'}}>{t('includeSourceThumb')!=='includeSourceThumb' ? t('includeSourceThumb') : 'include source thumbnail'}</span>
                    </button>
                  )}
                  {!immersive && (imgMoodThumb || originalImgUrl || loadedSource==='image' || moodFromImg || varySource || isImportedMedia) && (
                    <button onClick={async ()=>{
                      setShowSizePicker(false);
                      // For MIDI/Audio/Score the user already has the original
                      // audio file — re-bundling a fresh offline render with
                      // the painting would just duplicate what they imported.
                      // Story for these is painting-only (Web/Print quality
                      // social asset). For Image/MFI/Mood/Compose/Mic we still
                      // render audio offline and bundle both files into one
                      // share-sheet drop.
                      if(isImportedMedia){
                        await exportImage('story', true, null, null, true);
                        return;
                      }
                      // Paint mode: render audio offline and bundle with image.
                      // The user has already heard the piece via PLAY — we just
                      // need the audio FILE for the Story share, not a re-play.
                      // Offline render is silent (no UI lockup, no disabled
                      // controls) and faster than real-time recording.
                      // Story always overlays source thumb + mood name when
                      // available — no toggle (it's part of the "ready to
                      // share" social aesthetic, not user choice).
                      const src = chordsRef.current && chordsRef.current.length ? chordsRef.current : chords;
                      if(!src || !src.length){ exportImage('story', true, null, null, true); return; }
                      const title = (compositionName||recordingName||'Paintiano').trim()||'Paintiano';
                      // Mic/Music with Original selected: use the recorded blob
                      // directly — no re-render needed, original quality kept.
                      const useOriginalBlob = (draftOwnerRef.current==='listen'||draftOwnerRef.current==='sing') && playSourceMic==='original' && listenBlobRef.current?.blob;
                      let audioBlob = null;
                      let audioName;
                      if(useOriginalBlob){
                        audioBlob = listenBlobRef.current.blob;
                        const ext = (listenBlobRef.current.type||'').includes('mp4') ? '.m4a' : (listenBlobRef.current.type||'').includes('ogg') ? '.ogg' : '.webm';
                        audioName = title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim().slice(0,40)+ext;
                      } else {
                        audioName = title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim().slice(0,40)+'.wav';
                        setScoreMsg({tone:'wait',text:t('rendering')||'rendering audio…'});
                        try{ audioBlob = await renderAudioOffline(src,{speed:1}); }catch(_){}
                        setScoreMsg(null);
                      }
                      try{ await unlockAudio(); }catch(_){}
                      await exportImage('story', true, audioBlob, audioName, true);
                    }} style={{padding:'14px',background:'linear-gradient(135deg,rgba(255,215,120,.16),rgba(220,170,70,.08))',color:'rgba(255,220,140,.95)',border:'1px solid rgba(255,210,120,.4)',borderRadius:12,cursor:'pointer',fontFamily:'inherit',letterSpacing:0,fontSize:(.72*effScale)+'rem',fontWeight:500}}>
                      <span style={{display:'inline-flex',alignItems:'center',gap:6,justifyContent:'center'}}><TxIcon n="sparkle" s={14}/>{t('sizeStory')||'Story'}</span>
                      <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(255,210,140,.55)',marginTop:4,letterSpacing:0,fontWeight:400}}>{isImportedMedia ? (t('storyImageHintNoAudio')||'painting · for IG / TikTok') : (t('storyImageHint')||'painting + audio · for IG / TikTok')}</div>
                    </button>
                  )}
                  <button onClick={()=>exportImage('web', false, null, null, includeSourceThumb)} style={{padding:'14px',background:'rgba(255,255,255,.02)',color:'rgba(247,243,236,.85)',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,cursor:'pointer',fontFamily:'inherit',letterSpacing:0,fontSize:(.72*effScale)+'rem',fontWeight:500}}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:6,justifyContent:'center'}}><TxIcon n="web" s={14}/>{t('sizeWeb')}</span>
                    <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(230,222,196,.4)',marginTop:4,letterSpacing:0}}>{t('sizeWebHint')}</div>
                  </button>
                  <button onClick={()=>{ if(!isPro){ setPaywallReason('settings'); return; } exportImage('print', false, null, null, includeSourceThumb); }} style={{padding:'12px',background:'transparent',color:isPro?pk.line:pk.dim,border:'1px solid '+pk.border,borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.06em',fontSize:(.72*effScale)+'rem',opacity:isPro?1:.75,position:'relative'}}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
                      <TxIcon n="print" s={14}/>
                      {({EN:'Print A1',SK:'Tlač A1',DE:'Druck A1',FR:'Impression A1',ES:'Impresión A1',PT:'Impressão A1',zh:'打印 A1',zhTW:'列印 A1',ja:'印刷 A1'})[lang]||'Print A1'}
                      {!isPro && <ProBadge t={t} readScale={effScale} size="sm" />}
                    </span>
                    <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(230,222,196,.4)',marginTop:4,letterSpacing:0}}>{({EN:'high-res · large file · print-ready',SK:'vysoké rozlíšenie · veľký súbor · na tlač',DE:'hochauflösend · große Datei · druckfertig',FR:'haute résolution · gros fichier · prêt à imprimer',ES:'alta resolución · archivo grande · listo para imprimir',PT:'alta resolução · ficheiro grande · pronto a imprimir',zh:'高分辨率 · 大文件 · 可印刷',zhTW:'高解析度 · 大檔案 · 可列印',ja:'高解像度 · 大きいファイル · 印刷可能'})[lang]||'high-res · large file · print-ready'}</div>
                  </button>
                  <button onClick={()=>{ if(!isPro){ setPaywallReason('settings'); return; } exportImage('gallery', false, null, null, false); }} style={{padding:'12px',background:'transparent',color:isPro?pk.line:pk.dim,border:'1px solid '+pk.border,borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.06em',fontSize:(.72*effScale)+'rem',opacity:isPro?1:.75,position:'relative'}}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
                      <TxIcon n="gallery" s={14}/>
                      {({EN:'Gallery · vector',SK:'Galéria · vektor',DE:'Galerie · Vektor',FR:'Galerie · vectoriel',ES:'Galería · vector',PT:'Galeria · vetor',zh:'画廊 · 矢量',zhTW:'畫廊 · 向量',ja:'ギャラリー · ベクター'})[lang]||'Gallery · vector'}
                      {!isPro && <ProBadge t={t} readScale={effScale} size="sm" />}
                    </span>
                    <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(230,222,196,.4)',marginTop:4,letterSpacing:0}}>{({EN:'SVG · fine-art print · any DPI',SK:'SVG · fine-art tlač · ľubovoľné DPI',DE:'SVG · Fine-Art-Druck · beliebige DPI',FR:'SVG · impression fine-art · DPI au choix',ES:'SVG · impresión fine-art · cualquier DPI',PT:'SVG · impressão fine-art · qualquer DPI',zh:'SVG · 美术级打印 · 任意 DPI',zhTW:'SVG · 美術級列印 · 任意 DPI',ja:'SVG · ファインアート印刷 · 任意の DPI'})[lang]||'SVG · fine-art print · any DPI'}</div>
                  </button>
                  {/* Audio + Score export hidden for MIDI/Audio/Score sources
                      (isImportedMedia) — exporting them back to the same file
                      format the user just imported is redundant. */}
                  {!isImportedMedia && (
                    <button onClick={()=>{ setShowSizePicker(false); saveAudio(true); }} style={{padding:'14px',background:'rgba(255,255,255,.02)',color:'rgba(247,243,236,.85)',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,cursor:'pointer',fontFamily:'inherit',letterSpacing:0,fontSize:(.72*effScale)+'rem',fontWeight:500}}>
                      <span style={{display:'inline-flex',alignItems:'center',gap:6,justifyContent:'center'}}><TxIcon n="rec" s={14}/>{t('saveAudioLabel')||'Audio'}</span>
                      <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(230,222,196,.4)',marginTop:4,letterSpacing:0}}>{t('saveAudioHint')||'mp3 · save to files'}</div>
                    </button>
                  )}
                  {!isImportedMedia && (
                    <button onClick={()=>{ setShowSizePicker(false); saveScore(); }} style={{padding:'14px',background:'rgba(255,255,255,.02)',color:'rgba(247,243,236,.85)',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,cursor:'pointer',fontFamily:'inherit',letterSpacing:0,fontSize:(.72*effScale)+'rem',fontWeight:500}}>
                      <span style={{display:'inline-flex',alignItems:'center',gap:6,justifyContent:'center'}}><TxIcon n="notes" s={14}/>{t('scoreExport')}</span>
                      <div style={{fontSize:(.55*effScale)+'rem',color:'rgba(230,222,196,.4)',marginTop:4,letterSpacing:0}}>{t('scoreExportHint')||'MusicXML · for MuseScore'}</div>
                    </button>
                  )}
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

      {showAbout && (
        <GuideModal
          mode="concept"
          onClose={closeAbout}
          t={t}
          ts={ts}
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
      {showBook && (
        <GuideModal
          mode="book"
          onClose={closeBook}
          t={t}
          ts={ts}
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

      {showGuide && (
        <GuideModal
          onClose={closeGuide}
          onOpenSetup={openSetupFromGuide}
          initialCardId={guideReturnCardId}
          t={t}
          ts={ts}
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
        <div onClick={()=>setShowComposeRecent(false)} className="pf-recent-overlay pf-picker-compose" style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.92)',zIndex:100000,display:'flex',alignItems:'center',justifyContent:'center',padding:'4vh 16px',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)'}}>
          <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="recently played" className="pf-recent-dialog" style={{maxWidth:340,width:'100%',background:'rgba(20,18,30,0.92)',border:'1px solid rgba(255,255,255,.06)',borderRadius:24,padding:'22px 18px 16px',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)'}}>
            <div style={{textAlign:'center',marginBottom:14,letterSpacing:0,color:PF.cream,fontSize:(.78*effScale)+'rem',fontWeight:500,flexShrink:0}}>{_sent(t('recentPlayed')||'recently played')}</div>
            <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
              {composeRecent.map(entry=>(
                <button key={entry.id} onClick={()=>{ _composeRecall(entry); setShowComposeRecent(false); }} style={{padding:'12px 14px',background:'rgba(255,255,255,.02)',color:'rgba(247,243,236,.85)',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,cursor:'pointer',fontFamily:'inherit',letterSpacing:0,fontSize:(.7*effScale)+'rem',fontWeight:500,textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {_composeRecentLabel(entry.ts)}
                </button>
              ))}
            </div>
            <button onClick={()=>setShowComposeRecent(false)} style={{display:'block',margin:'0 auto',padding:'8px 16px',background:'transparent',color:'rgba(230,222,196,.5)',border:'none',cursor:'pointer',fontSize:(.65*effScale)+'rem',fontFamily:'inherit',letterSpacing:0,fontWeight:500}}>{_sent('cancel')}</button>
          </div>
        </div>
      )}

      {showMicRecent && (
        <div onClick={()=>setShowMicRecent(false)} className="pf-recent-overlay pf-picker-mic" style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.92)',zIndex:100000,display:'flex',alignItems:'center',justifyContent:'center',padding:'4vh 16px',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)'}}>
          <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="recently played" className="pf-recent-dialog" style={{maxWidth:340,width:'100%',background:'rgba(20,18,30,0.92)',border:'1px solid rgba(255,255,255,.06)',borderRadius:24,padding:'22px 18px 16px',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)'}}>
            <div style={{textAlign:'center',marginBottom:14,letterSpacing:0,color:PF.cream,fontSize:(.78*effScale)+'rem',fontWeight:500,flexShrink:0}}>{_sent(t('recentPlayed')||'recently played')}</div>
            <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
              {(()=>{ const preset = micPreset==='music' ? 'music' : 'voice'; const list = preset==='voice' ? micVoiceRecent : micMusicRecent; return list.map(entry=>(
                <button key={entry.id} onClick={()=>{ _micRecall(preset,entry); setShowMicRecent(false); }} style={{padding:'12px 14px',background:'rgba(255,255,255,.02)',color:'rgba(247,243,236,.85)',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,cursor:'pointer',fontFamily:'inherit',letterSpacing:0,fontSize:(.7*effScale)+'rem',fontWeight:500,textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {_composeRecentLabel(entry.ts)}
                </button>
              )); })()}
            </div>
            <button onClick={()=>setShowMicRecent(false)} style={{display:'block',margin:'0 auto',padding:'8px 16px',background:'transparent',color:'rgba(230,222,196,.5)',border:'none',cursor:'pointer',fontSize:(.65*effScale)+'rem',fontFamily:'inherit',letterSpacing:0,fontWeight:500}}>{_sent('cancel')}</button>
          </div>
        </div>
      )}

      {showMoodMenu && (
        <div onClick={()=>setShowMoodMenu(false)} className="pf-recent-overlay pf-mood-overlay pf-picker-mood" style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.92)',zIndex:100000,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'4vh 16px',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',overflowY:'auto'}}>
          <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="select mood" className="pf-recent-dialog pf-mood-dialog" style={{maxWidth:340,width:'100%',background:'rgba(20,18,30,0.92)',border:'1px solid rgba(255,255,255,.06)',borderRadius:24,padding:'22px 18px 16px',display:'flex',flexDirection:'column',maxHeight:'92vh',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)'}}>
            <div style={{textAlign:'center',marginBottom:14,letterSpacing:0,color:PF.cream,fontSize:(.78*effScale)+'rem',fontWeight:500,flexShrink:0}}>{_sent(_stripIcon(t('selectMood')))}</div>
            {(()=>{
              // For Free + aiLocked the input stays fully editable (so the
              // autocomplete is useful) but the submit path is restricted to
              // EXACT preset matches — the AI fallback (aiMoodFromText) is
              // gated. If what the user typed doesn't resolve to a preset
              // mood, the → button is disabled and Enter is a no-op.
              const _normMood=(s)=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
              const _resolveMood=(txt)=>{
                const q=_normMood(txt); if(!q) return null;
                // Match either the internal key or the localized display name.
                const names=t('moodNames')||{};
                for(const m of MOODS){
                  if(_normMood(m)===q) return m;
                  if(_normMood(names[m]||'')===q) return m;
                }
                return null;
              };
              const submitFree=(txt)=>{
                const m=_resolveMood(txt); if(!m) return;
                setShowMoodMenu(false);
                const s=findSong(m);
                setStructureSeedLock(null); setForceSetup(false); setCurrentMood(m);
                setVarySource(s); setImgMoodThumb(null); setMoodFromImg(false);
                setLoadedSource(null); setMoodContext(true); setSongQ(m);
                stopAll(); aiMidi(m);
                if(moodHintRef.current){clearTimeout(moodHintRef.current);moodHintRef.current=null;}
                setMoodHint(false); setMoodEdit('');
              };
              const submit=(txt)=>{
                if(aiLocked){ submitFree(txt); return; }
                const v=(txt||'').trim(); if(!v)return;
                if(micPainting)stopMicPainting();if(micListening)stopMicListening();setComposeMode(false);
                setShowMoodMenu(false); setMoodEdit(''); setStructureSeedLock(null);
                setForceSetup(false); setCurrentMood(v); setImgMoodThumb(null);
                setMoodFromImg(false); setVarySource(null); setLoadedSource(null);
                setMoodContext(true); setSongQ(v); setCompositionName('');
                setRecordingName(''); stopAll(); aiMoodFromText(v);
                if(moodHintRef.current){clearTimeout(moodHintRef.current);moodHintRef.current=null;}
                setMoodHint(false);
              };
              // Submit-eligible? For Pro/Pro AI: any non-empty text. For Free
              // aiLocked: only if the text resolves to a preset mood.
              const canSubmit = aiLocked
                ? (_resolveMood(moodEdit) !== null)
                : !!moodEdit.trim();
              return (
              <div style={{display:'flex',gap:6,marginBottom:12,flexShrink:0}}>
                <div style={{flex:1,minWidth:0,position:'relative'}}>
                  <input value={moodEdit} onChange={e=>setMoodEdit(e.target.value)} placeholder="" autoFocus onFocus={()=>{inputFocus.current=true;}} onBlur={()=>{inputFocus.current=false;}} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); e.stopPropagation(); try{e.nativeEvent.stopImmediatePropagation();}catch(_){} if(canSubmit) submit(moodEdit); } }} style={{width:'100%',boxSizing:'border-box',background:'rgba(255,255,255,.018)',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,padding:'12px 14px',color:PF.cream,fontSize:'16px',fontFamily:'inherit',outline:'none'}} />
                  {/* Empty-state placeholder: for trial-active users a marquee
                      of examples; for aiLocked an instruction + PRO AI badge
                      since free-typing won't reach the AI. */}
                  {!moodEdit && !aiLocked && (()=>{
                    const ex=t('moodExamples');
                    const items=Array.isArray(ex)&&ex.length?ex:[t('moodPlaceholder')];
                    const ribbon=items.join('     ·     ');
                    return (
                      <div aria-hidden="true" style={{position:'absolute',inset:0,borderRadius:8,overflow:'hidden',pointerEvents:'none',display:'flex',alignItems:'center'}}>
                        <div style={{display:'flex',whiteSpace:'nowrap',willChange:'transform',animation:'pfMarquee 22s linear infinite',paddingLeft:12}}>
                          <span style={{color:'rgba(242,238,232,.4)',fontSize:(.62*effScale)+'rem',fontStyle:'italic'}}>{ribbon}</span>
                          <span style={{color:'rgba(242,238,232,.4)',fontSize:(.62*effScale)+'rem',fontStyle:'italic',paddingLeft:'2.5em'}}>{ribbon}</span>
                        </div>
                      </div>
                    );
                  })()}
                  {aiLocked && !moodEdit && (
                    <div aria-hidden="true" style={{position:'absolute',inset:0,borderRadius:8,overflow:'hidden',pointerEvents:'none',display:'inline-flex',alignItems:'center',paddingLeft:12,gap:6}}>
                      <span style={{color:'rgba(242,238,232,.45)',fontSize:(.62*effScale)+'rem',fontStyle:'italic'}}>{t('moodChooseBelow')||'Choose a mood from the list below'}</span>
                      <ProBadge t={t} readScale={effScale} size="sm" tier="ai" />
                    </div>
                  )}
                </div>
                <button onClick={()=>{ if(canSubmit) submit(moodEdit); }} disabled={!canSubmit} aria-label={t('moodGo')} title={aiLocked&&!canSubmit?(t('moodPickFromList')||'Pick a mood from the list — custom moods are Pro AI'):t('moodGo')} style={{flexShrink:0,width:46,borderRadius:12,border:'none',cursor:canSubmit?'pointer':'default',background:canSubmit?PF.gold:'rgba(201,168,76,.2)',color:canSubmit?PF.bg:'rgba(201,168,76,.5)',fontSize:'1rem',fontWeight:700}}>→</button>
              </div>
            ); })()}
            {/* Suggestions grid — autocomplete-filtered moods while typing.
                For Free+aiLocked, when the input is empty we show the full
                MOODS list alphabetically (so the user has something to pick
                without typing); once they start typing, normal autocomplete
                behaviour applies. Clicking any preset is free (no AI). */}
            <div style={{flex:'1 1 auto',minHeight:'72px',overflowY:'auto',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,paddingRight:4,alignContent:'start',marginBottom:moodEdit.trim()?12:0}}>
              {(()=>{
                const _n=s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
                const q=_n(moodEdit.trim());
                if(!q){
                  // Empty input: Free+aiLocked sees a short SAMPLE of moods
                  // (6 popular ones) so the cancel button stays in the viewport
                  // on small screens. Typing reveals normal autocomplete over
                  // the full MOODS list. Others see nothing (their marquee
                  // placeholder cues "type").
                  if(aiLocked){
                    const SAMPLE=['joyful','calm','melancholic','mysterious','romantic','epic'];
                    return SAMPLE.filter(m=>MOODS.includes(m));
                  }
                  return [];
                }
                // Non-empty: autocomplete across the LOCALIZED display name only
                // (not the internal English key). The user types in their UI
                // language; matching the key would surface wrong results — typing
                // Slovak "L" would otherwise return POKOJNÁ (key 'calm'), HRAVÁ
                // (key 'playful'), MYSTICKÁ (key 'mystical'), etc. — because the
                // English keys contain 'l', even though the Slovak names don't.
                // In EN the localized name equals the key, so EN behavior is
                // identical. Starts-with ranked above contains.
                const _names=(t('moodNames')||{});
                const _match=(m)=>{ const nm=_n(_names[m]||m); return {starts:nm.startsWith(q), has:nm.includes(q)}; };
                const _starts=[], _has=[];
                for(const m of MOODS){ const r=_match(m); if(r.starts) _starts.push(m); else if(r.has) _has.push(m); }
                return _starts.concat(_has);
              })().map(m=>(
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
                }} style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,padding:'12px 4px',borderRadius:14,background: (m===currentMood&&!imgMoodThumb)?'rgba(201,168,76,.18)':'rgba(255,255,255,.015)',color: (m===currentMood&&!imgMoodThumb)?PF.gold2:PF.cream,border:'1px solid '+((m===currentMood&&!imgMoodThumb)?'rgba(201,168,76,.5)':'rgba(255,255,255,.06)'),cursor:'pointer',fontFamily:'inherit',transition:'all .18s'}}>
                  <span style={{fontSize:'1.15rem',lineHeight:1}}>{MOOD_EMOJI[m]||'✦'}</span>
                  <span style={{fontSize:(.56*effScale)+'rem',fontWeight:500,letterSpacing:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%'}}>{_sent((t('moodNames')||{})[m]||m)}</span>
                </button>
              ))}
            </div>
            {aiLocked && !moodEdit.trim() && (
              <div style={{textAlign:'center',marginTop:6,marginBottom:8,fontSize:(.5*effScale)+'rem',letterSpacing:'.06em',color:'rgba(207,197,168,.45)',fontStyle:'italic',flexShrink:0}}>
                {t('moodTypeToSearch')||'Type to search any of 95 moods…'}
              </div>
            )}
            {/* Recently AI generated — separate "what you made before" section,
                always at the bottom regardless of typing state. Click replays the
                piece for free, no AI call. */}
            {aiComposeRecent.length>0 && (
              <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0,marginTop:10}}>
                <div style={{fontSize:(.58*effScale)+'rem',letterSpacing:'.12em',textTransform:'uppercase',color:'rgba(242,238,232,.4)',textAlign:'center',marginBottom:4,fontWeight:500}}>
                  {t('recentAiGenerated')||'Recently AI generated'}
                </div>
                {aiComposeRecent.map((entry)=>(
                  <button key={entry.id} onClick={()=>{ _aiComposeRecall(entry); setShowMoodMenu(false); }} style={{padding:'10px 14px',background:'rgba(255,255,255,.012)',color:'rgba(228,178,255,.85)',border:'1px solid rgba(220,150,255,.18)',borderRadius:12,cursor:'pointer',fontFamily:'inherit',letterSpacing:0,fontSize:(.72*effScale)+'rem',textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {entry.title}
                  </button>
                ))}
              </div>
            )}
            <button onClick={()=>setShowMoodMenu(false)} style={{display:'block',margin:'14px auto 0',padding:'8px 16px',background:'transparent',color:'rgba(207,197,168,.45)',border:'none',cursor:'pointer',fontSize:(.72*effScale)+'rem',fontFamily:'inherit',letterSpacing:0,flexShrink:0,width:'100%',textAlign:'center'}}>{_sent(t('cancel'))}</button>
          </div>
        </div>
      )}
      {showMorphMenu && (
        <div onClick={()=>{setShowMorphMenu(false);setMorphSel([]);}} style={{position:'fixed',inset:0,background:'rgba(8,6,14,0.92)',zIndex:100000,display:'flex',alignItems:'center',justifyContent:'center',padding:'4vh 16px',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)'}}>
          <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="morph mood" style={{maxWidth:340,width:'100%',background:'rgba(20,18,30,0.92)',border:'1px solid rgba(255,255,255,.06)',borderRadius:24,padding:'22px 18px 16px',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)'}}>
            <div style={{textAlign:'center',marginBottom:4,letterSpacing:0,color:PF.cream,fontSize:(.78*effScale)+'rem',fontWeight:500}}>{_sent(t('morphTitle').replace('{mood}',(t('moodNames')||{})[currentMood]||currentMood||''))}</div>
            <div style={{textAlign:'center',marginBottom:12,fontSize:(.58*effScale)+'rem',letterSpacing:0,color:'rgba(230,222,196,.45)'}}>{t('morphHint')} · <span role="button" tabIndex={0} onClick={()=>{setMorphPool([...morphSel, ...makeMorphPool(currentMood, morphSel)]);setMorphPoolSource('offline');setMorphPoolLoading(false);}} title="shuffle / iné" style={{cursor:'pointer',color:'rgba(220,180,255,.85)',userSelect:'none'}}>↻</span> · <span style={{fontSize:(.5*effScale)+'rem',letterSpacing:'.06em',textTransform:'uppercase',color:morphPoolLoading?'rgba(220,180,255,.7)':morphPoolSource==='ai'?'rgba(220,170,255,.95)':'rgba(207,197,168,.5)'}}>{morphPoolLoading?'✦ …':morphPoolSource==='ai'?'✦ AI':'offline'}</span></div>
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
              <button onClick={()=>{setShowMorphMenu(false);setMorphSel([]);}} style={{flex:1,padding:'10px 16px',background:'transparent',color:'rgba(230,222,196,.5)',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,cursor:'pointer',fontSize:(.66*effScale)+'rem',fontFamily:'inherit',letterSpacing:0,fontWeight:500}}>{_sent('cancel')}</button>
              <button onClick={()=>{
                // Capture whether playback was active (playing OR paused) BEFORE
                // stopAll below — if so, the morph result auto-plays from the top.
                const _morphWasActive = playingRef.current || holdPausedRef.current;
                // 0 selected → "remove morph": recompose the base mood without
                // a chain, clear the persistent morph targets, reset the title
                // to the plain mood name. Same path the user takes when first
                // picking a mood from the Mood menu.
                if(morphSel.length===0){
                  const song=findSong(currentMood);
                  setShowMorphMenu(false); setMorphSel([]);
                  setMorphTargets([]);
                  if(!song){ setErr(t('errs').songNotFound); return; }
                  const evts=noteArr2events(song.notes,song.tempo);
                  if(!evts.length){ setErr(t('errs').noNotesGeneric); return; }
                  stopAll();
                  const dispTitle=((t('moodNames')||{})[song.mood])||((t('moodNames')||{})[currentMood])||song.title;
                  applyEvents(evts,dispTitle);
                  setComposeSource('crafted');
                  setMoodContext(true);
                  setVarySource(song);
                  setStructureSeedLock(null);
                  const bytes=encodeMidi(evts,song.tempo||120);
                  setMidiBlob(new Blob([bytes],{type:'audio/midi'}));
                  setMidiName(song.title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').trim()+'.mid');
                  if(_morphWasActive){ resumeFromRef.current=0; keepStripOpenRef.current=true; setTimeout(()=>{ startPlayRef.current?.(); setStripOpen(true); }, 60); }
                  return;
                }
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
                // applyEvents now clears moodContext; restore it — morph blends
                // mood pieces, so the result is still mood-sourced.
                setMoodContext(true);
                setMorphTargets(sel);
                const bytes=encodeMidi(evts,morphed.tempo||100);
                setMidiBlob(new Blob([bytes],{type:'audio/midi'}));
                setMidiName(morphed.title.replace(/[^\w\s]/g,'').replace(/\s+/g,'_')+'.mid');
                if(_morphWasActive){ resumeFromRef.current=0; keepStripOpenRef.current=true; setTimeout(()=>{ startPlayRef.current?.(); setStripOpen(true); }, 60); }
              }} style={{flex:1,padding:'10px 16px',background:'linear-gradient(135deg,#7c4df5,#a97ff5)',color:'#fff',border:'none',borderRadius:12,cursor:'pointer',fontSize:(.66*effScale)+'rem',fontFamily:'inherit',letterSpacing:0,fontWeight:500}}>{_sent(t('morphGo'))}</button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom dock: only docks to the viewport during playback (so you can
          watch the canvas animate while the piano stays visible). When not
          playing, it flows in normal document order. */}
      {isActiveView && !basicMode && (
      <div className="pf-tx-edge-l" aria-hidden="true">
        <button
          className="pf-lift pf-tx-play"
          onClick={handlePauseClick}
          disabled={demoReelOn||recording||((micPainting||micListening)?!chords.length:((!chords.length&&!playing&&!holdPaused)||(demoMode&&!playing&&!holdPaused)))}
          title={demoReelOn?(t('demoMode')||'demo mode'):recording?t('stopRecFirst'):(micPainting||micListening)?(chords.length?t('play'):micListening?t('stopListenFirst'):t('stopSingFirst')):demoMode&&!playing?t('demoMode'):holdPaused?t('resume'):playing?t('pause'):t('play')}
          style={{...txStyle('primary',{effScale,primary:true,disabled:(recording||((micPainting||micListening)?!chords.length:(!chords.length||(demoMode&&!playing&&!holdPaused))))}),display:(viewMode==='image'&&(recording||!!recBlob))?'none':'inline-flex',cursor:(recording||((micPainting||micListening)&&!chords.length))?'not-allowed':'pointer'}}>
          <TxIcon n={playing&&!holdPaused?'pause':'play'} s={15*effScale}/>{holdPaused?t('resume'):playing?t('pause'):t('play')}
        </button>
        <button className="pf-lift pf-tx-mute" onClick={()=>setMuted(m=>!m)} title={muted?t('unmute'):t('mute')} aria-label={muted?t('unmute'):t('mute')} style={txStyle(muted?'danger':'neutral',{effScale,on:muted,icon:true})}><TxIcon n={muted?'mute':'sound'} s={15*effScale}/></button>
        <button
          onClick={()=>{
            if(demoReelOn){ demoReelStop(); return; }
            if(recording)return;
            if(clearArmed){
              if(clearArmRef.current){clearTimeout(clearArmRef.current);clearArmRef.current=null;}
              setClearArmed(false);
              clearCanvas();
            }else{
              const hasPainting = disp>0 || (composedModeRef.current && chords.length>0);
              if(!hasPainting&&!pending.length){clearCanvas();return;}
              setClearArmed(true);
              clearArmRef.current=setTimeout(()=>{setClearArmed(false);clearArmRef.current=null;},3000);
            }
          }}
          className="pf-lift pf-tx-clear"
          disabled={recording}
          title={recording?t('stopRecFirst'):undefined}
          style={txStyle(clearArmed?'danger':'ghost',{effScale,on:clearArmed,disabled:recording})}>{clearArmed?t('clearConfirm'):t('clear')}</button>
      </div>
      )}
      {isActiveView && !basicMode && (
      <div role="region" aria-label="playback controls" className="pf-transport-dock" style={isActiveView?{position:'fixed',bottom:0,left:0,right:0,zIndex:50,background:'rgba(4,3,8,0.97)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',borderTop:'1px solid rgba(201,168,76,.15)',padding:'8px 8px calc(10px + env(safe-area-inset-bottom))'}:{}}>
      {/* Recording save row — appears in dock when a recording is ready */}
      {micListening&&(
        <div style={{fontSize:(.48*effScale)+'rem',letterSpacing:'.08em',color:'rgba(100,200,255,.35)',textAlign:'center',marginBottom:4,lineHeight:1.5}}>
          🔊 {t('listenHint')}
        </div>
      )}
      {recBlob&&(viewMode!=='image'||audioRowOpen)&&(
        <div className="pf-rec-save-row" style={{display:'flex',flexDirection:'column',gap:4,marginBottom:6,padding:'8px 10px',background:'rgba(220,90,90,.08)',border:'1px solid rgba(220,90,90,.25)',borderRadius:6}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {(()=>{ const m=recName.match(/^(.*?)(\.[^.]+)$/); const base=m?m[1]:recName; const ext=m?m[2]:''; return (
              <span style={{flex:1,display:'flex',alignItems:'center',gap:2,minWidth:0}}>
                <input value={base} onFocus={()=>{inputFocus.current=true;}} onBlur={()=>{inputFocus.current=false;}} onChange={e=>setRecName(e.target.value.replace(/[\/\\:*?"<>|]/g,'')+ext)} aria-label="file name" style={{flex:1,minWidth:0,fontSize:(.6*effScale)+'rem',color:'rgba(255,170,150,1)',background:'rgba(255,255,255,.06)',border:'1px solid rgba(220,90,90,.3)',borderRadius:4,padding:'4px 6px',fontFamily:'inherit',outline:'none'}}/>
                <span style={{fontSize:(.55*effScale)+'rem',color:'rgba(255,140,120,.6)',flexShrink:0}}>{ext} · {(recBlob.size/1024).toFixed(0)}KB</span>
              </span>
            ); })()}
            {audioShareMsg&&<span style={{fontSize:(.5*effScale)+'rem',color:audioShareMsg.tone==='ok'?'rgba(140,255,180,.9)':'rgba(255,140,120,.9)',flexShrink:0,marginRight:4}}>{audioShareMsg.text}</span>}
            <button onClick={shareRecording} style={{padding:'6px 14px',background:'rgba(220,90,90,.2)',color:'rgba(255,140,120,1)',border:'1px solid rgba(220,90,90,.5)',borderRadius:4,cursor:'pointer',fontSize:(.6*effScale)+'rem',fontFamily:'inherit',letterSpacing:'.06em',flexShrink:0,minWidth:60}}>{t('share')}</button>
            <button onClick={()=>{setRecBlob(null);setRecName('');setAudioShareMsg(null);setAudioSideImage(null);setAudioRowOpen(false);}} style={{padding:'6px 10px',background:'transparent',color:'rgba(207,197,168,.5)',border:'1px solid rgba(207,197,168,.2)',borderRadius:4,cursor:'pointer',fontSize:(.6*effScale)+'rem',fontFamily:'inherit',flexShrink:0}}>✕</button>
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
      <div style={{textAlign:'center',marginBottom:2,fontSize:(.7*effScale)+'rem',letterSpacing:'.1em',color:active.size>0?GOLD:composeMode&&chords.length>0?'rgba(201,168,76,.78)':'rgba(201,168,76,.55)',fontVariantNumeric:'tabular-nums',height:'1.5em',lineHeight:'1.5em',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',fontFamily:'inherit',transition:'color .15s ease'}}>
        {active.size>0?(()=>{
          const sorted=[...active].sort((a,b)=>a-b);
          const chord=recognizeChord(sorted);
          return chord
            ? <span>{[...active].sort((a,b)=>a-b).map(noteName).join(' · ')} <span style={{color:'rgba(201,168,76,.55)',fontSize:(.6*effScale)+'rem',letterSpacing:'.08em'}}>· {chord}</span></span>
            : sorted.map(noteName).join(' · ');
        })():composeMode&&chords.length>0?(effectiveStyle&&effectiveStyle!=='notes'&&effectiveStyle!=='oneM'?`${chords.length} ${t('chordsOnly')}`:`${chords.length} ${t('chordsPlay')}`):'—'}
      </div>
      {showAdvanced && composeMode && (
        <div style={{display:'flex',gap:8,justifyContent:'center',alignItems:'center',marginBottom:6,padding:'8px 12px',borderRadius:14,background:'rgba(140,255,180,.06)',border:'1px solid rgba(140,255,180,.25)',maxWidth:'fit-content',marginLeft:'auto',marginRight:'auto',flexWrap:'wrap'}}>
          <span style={{fontSize:(.5*effScale)+'rem',letterSpacing:'.1em',textTransform:'uppercase',color:'rgba(140,255,180,.6)'}}>{t('scaleSnapLabel')!=='scaleSnapLabel'?t('scaleSnapLabel'):'snap to key'}</span>
          <button onClick={()=>{
            const cur=PAINT_SCALE_KEYS.indexOf(paintScale);
            setPaintScale(PAINT_SCALE_KEYS[(cur+1)%PAINT_SCALE_KEYS.length]);
          }} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 16px',background:paintScale==='off'?'transparent':'rgba(140,255,180,.16)',color:paintScale==='off'?'rgba(200,200,200,.7)':'rgba(160,255,195,.98)',border:'1px solid '+(paintScale==='off'?'rgba(180,180,180,.3)':'rgba(140,255,180,.5)'),borderRadius:18,cursor:'pointer',letterSpacing:'.06em',fontFamily:'inherit',fontSize:(.6*effScale)+'rem',fontWeight:600,minWidth:78,justifyContent:'center'}} title="tap to change key (free = no snap)">
            ♫ {PAINT_SCALES[paintScale].label}
          </button>
          {paintScale!=='off' && (
            <button onClick={()=>setPaintScale('off')} aria-label="back to free" title="back to free (no snap)" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:30,height:30,padding:0,borderRadius:15,background:'transparent',border:'1px solid rgba(180,180,180,.3)',color:'rgba(200,200,200,.7)',cursor:'pointer',fontFamily:'inherit'}}>✕</button>
          )}
        </div>
      )}
      <div className="pf-transport-row" style={{display:'flex',gap:6,justifyContent:'center',marginBottom:6,fontSize:(.55*effScale)+'rem',letterSpacing:'.08em',flexWrap:'wrap',alignItems:'center'}}>
        <button className="pf-tx-scale" onClick={()=>{ setShowAdvanced(v=>!v); }} title="scale snap — tap notes to a musical key" style={{...txStyle((paintScale!=='off'||showAdvanced)?'active':'ghost',{effScale}),display:composeMode?'inline-flex':'none',minWidth:96,justifyContent:'center'}}>
          <TxIcon n="notes" s={13*effScale}/>{paintScale!=='off'?PAINT_SCALES[paintScale].label:t('scaleBtn')}
        </button>
        <button
          className="pf-lift pf-tx-play"
          onClick={handlePauseClick}
          disabled={demoReelOn||recording||((micPainting||micListening)?!chords.length:((!chords.length&&!playing&&!holdPaused)||(demoMode&&!playing&&!holdPaused)))}
          title={demoReelOn?(t('demoMode')||'demo mode'):recording?t('stopRecFirst'):(micPainting||micListening)?(chords.length?t('play'):micListening?t('stopListenFirst'):t('stopSingFirst')):demoMode&&!playing?t('demoMode'):holdPaused?t('resume'):playing?t('pause'):t('play')}
          style={{...txStyle('primary',{effScale,primary:true,disabled:(recording||((micPainting||micListening)?!chords.length:(!chords.length||(demoMode&&!playing&&!holdPaused))))}),display:(viewMode==='image'&&(recording||!!recBlob))?'none':'inline-flex',cursor:(recording||((micPainting||micListening)&&!chords.length))?'not-allowed':'pointer'}}>
          <TxIcon n={playing&&!holdPaused?'pause':'play'} s={15*effScale}/>{holdPaused?t('resume'):playing?t('pause'):t('play')}
        </button>{/* MIC STOP / REC — in the transport row UNDER the canvas (not in
            the strip above it). Replaces the on-canvas STOP/REC buttons; the
            on-canvas voice/music toggle remains for live preset switching. */}
        {micActive && (
          <button onClick={()=>{ if(micPainting) stopMicPainting(); if(micListening) stopMicListening(); setMicArmed(true); }} className="pf-lift" title={t('micActive')} style={txStyle('danger',{effScale,on:true})}>
            <span style={{width:8,height:8,borderRadius:2,background:'#ff5a5a',boxShadow:'0 0 6px #ff5a5a',display:'inline-block'}}/><TxIcon n="stop" s={14*effScale}/>{t('micActive').replace(/[^\p{L} ]/gu,'')}
          </button>
        )}{/* After stop, the transport pill disappears entirely — Clear is the
            way to start a fresh song. The old "tap REC again" pill caused
            confusion and let the user accidentally extend a finished take. */}<button className="pf-lift pf-tx-mute" onClick={()=>setMuted(m=>!m)} onPointerDown={()=>{ if(speakerHoldRef.current)clearTimeout(speakerHoldRef.current); speakerHoldRef.current=setTimeout(()=>{ speakerHoldRef.current='fired'; audioHardRecover(); },600); }} onPointerUp={()=>{ if(speakerHoldRef.current&&speakerHoldRef.current!=='fired'){clearTimeout(speakerHoldRef.current);} speakerHoldRef.current=null; }} onPointerLeave={()=>{ if(speakerHoldRef.current&&speakerHoldRef.current!=='fired'){clearTimeout(speakerHoldRef.current);speakerHoldRef.current=null;} }} title={muted?t('unmute'):t('mute')} aria-label={muted?t('unmute'):t('mute')} style={txStyle(muted?'danger':'neutral',{effScale,on:muted,icon:true})}><TxIcon n={muted?'mute':'sound'} s={15*effScale}/></button>
        {currentMood && (moodFromImg || (!loadedSource && viewMode!=='image' && !composeMode && !micActive)) && (
          <button className="pf-lift" onClick={()=>{const v=!loopMode;setLoopMode(v);loopModeRef.current=v;}} disabled={recording} title={recording?t('stopRecFirst'):undefined} style={txStyle(loopMode?'active':'neutral',{effScale,disabled:recording})}><TxIcon n="loop" s={14*effScale}/>{t('loop')}</button>
        )}
        {/* Original ⇄ Piano source toggle — appears once the mic session
            (Voice or Music) has a finalised audio blob and the mic is no
            longer live. One tap flips between playing back the original
            recording and the synthesised piano cover. Hidden during active
            capture and during recording. */}
        {hasMicBlob && !micActive && !recording && (draftOwnerRef.current==='listen'||draftOwnerRef.current==='sing') && (
          <button className="pf-lift" onClick={()=>setPlaySourceMic(p=>p==='original'?'piano':'original')}
            title={playSourceMic==='original'?'playback: original recording — tap to switch to piano cover':'playback: piano cover — tap to switch to original recording'}
            style={txStyle(playSourceMic==='original'?'blue':'active',{effScale})}>
            <TxIcon n="notes" s={14*effScale}/>{playSourceMic==='original'?'orig':'piano'}
          </button>
        )}
        {/* Restart playback from chord 0 using the current source. Pairs with
            the source toggle: toggle swaps Original ⇄ Piano in place (seamless);
            ↺ jumps back to the beginning. Visible whenever there's a Mic draft
            (Voice or Music) with a finalised recording. */}
        {hasMicBlob && !micActive && !recording && (draftOwnerRef.current==='listen'||draftOwnerRef.current==='sing') && (
          <button className="pf-lift"
            onClick={()=>{
              // Stop everything cleanly, reset position, then start fresh from idx 0.
              stopAll();
              setDisp(0); dispRef.current = 0;
              resumeFromRef.current = null;
              setHoldPaused(false); holdPausedRef.current = false;
              // Defer one tick so the stopAll state flush settles before startPlay.
              setTimeout(()=>{ startPlayRef.current?.(); }, 0);
            }}
            title="restart from start"
            aria-label="restart from start"
            style={txStyle('pink',{effScale,icon:true})}>
            <TxIcon n="restart" s={15*effScale}/>
          </button>
        )}
        {(effectiveStyle||shuffleStyle)&&chords.length>0&&!recording&&!micActive&&viewMode!=='image'&&(()=>{
          // Next is available whenever there's a painting on the canvas — during
          // Play, during Pause, AND after the track ends. Manual artist → cycle
          // styles via phaseIndex. Shuffle (no manual artist + randomMode) →
          // cycle artists via shuffleArtistIndex. Hidden if neither (plain Mosaic
          // with no randomMode).
          const canRoll = (disp>0||playing||holdPaused) && !anim && !working && !demoReelOn && !recording && !micActive && !showMode;
          if(!randomMode) return null;
          return (
            <button className="pf-lift" onClick={()=>{ if(!canRoll) return; nextRollInProgressRef.current=true; _diceRoll(); }} disabled={!canRoll} title={showMode?'Show is auto-shuffling — tap Show to stop':(canRoll?'next painting — jump to a new variation':'wait for the current action to finish')} aria-label="next painting" style={txStyle('pink',{effScale,disabled:!canRoll})}><TxIcon n="next" s={14*effScale}/>{t('next')!=='next'?t('next'):'Next'}</button>
          );
        })()}
        {/* SAVE — opens the export flow (size picker → preview: save / share /
            print). Replaces the old always-on PRINT. ENABLED only once a piece
            is finished & still (playedComplete) or there's live compose/mic
            content to export — mirrors the post-completion gate so you don't
            export a half-animated piece. Hidden in the image source view (its
            own controls live elsewhere). */}
        {viewMode!=='image' && (()=>{
          // While a piece PLAYS and dice is on (full shuffle or dice+artist),
          // the Save slot becomes a "↻ Show" auto-shuffle toggle. Tap → advance
          // every 4s like Next on a timer; tap again to stop. When playback ends
          // this condition drops and the normal Save chip returns.
          const showAvail = playing && randomMode && (effectiveStyle||shuffleStyle) && chords.length>0;
          if(showAvail){
            return (
              <button className="pf-lift" onClick={()=>toggleShow()} aria-label="auto-shuffle paintings" aria-pressed={showMode}
                title={showMode?'auto-shuffle ON — tap to stop':'auto-shuffle — a new painting every few seconds'}
                style={txStyle(showMode?'active':'neutral',{effScale,on:showMode})}>
                <TxIcon n="show" s={14*effScale}/>{t('showLabel')!=='showLabel'?t('showLabel'):'Show'}
              </button>
            );
          }
          // Save enables once there's something to save and nothing is
          // actively running. After Stop Live the LIVE pill is gone, micArmed
          // may be true with chords waiting — Save is fine in that state. Play
          // (current), recording, busy or demo reel still block.
          const exportReady =
            chords.length>0 && disp>0 && !playing && !anim && !holdPaused &&
            !demoReelOn && !micActive && !busy && !recording;
          return (
            <button className="pf-lift pf-tx-save" onClick={()=>{ if(exportReady) setShowSizePicker(true); }} disabled={!exportReady}
              title={exportReady?t('save'):t('exportNeedsPlay')}
              style={txStyle('save',{effScale,disabled:!exportReady})}>
              <TxIcon n="save" s={14*effScale}/>{t('save')}
            </button>
          );
        })()}
        {viewMode==='image'&&originalImgUrl&&!moodFromImg&&imgPlayMode!=='compose'&&(<>
          <button onClick={()=>{ if(atmoBusy) return; if(aiLocked && !atmoMood){ setPaywallReason('ai_trial'); return; } if((playingRef.current||holdPausedRef.current)&&melodyOnRef.current) _melodyTogglePlayingRef.current=true; if(atmoOn){ setAtmoOn(false); } else if(atmoMood){ setAtmoOn(true); } else { if(aiUsable) detectAtmosphere(); } }} disabled={atmoBusy||(!atmoMood&&!aiUsable&&!aiLocked)} className="pf-lift" title={(aiLocked&&!atmoMood)?(t('aiLockedHint')||'AI is part of Paintiano Pro AI'):((!atmoMood&&!aiUsable)?(t('aiOfflineHint')||'AI features need a connection'):(t('atmoLabel')||'atmosphere'))} style={txStyle('ai',{effScale,on:atmoOn,disabled:(atmoBusy||(!atmoMood&&!aiUsable&&!aiLocked))})}>
            <TxIcon n="sparkle" s={14*effScale}/><span>{(t('atmoLabel')||'atmosphere')+(atmoBusy?' · …':(aiLocked&&!atmoMood)?' · —':(!atmoMood&&!aiUsable)?' · '+(t('aiOffline')||'offline'):'')}</span>
            {aiLocked && !atmoMood && <ProBadge t={t} readScale={effScale} size="sm" tier="ai" />}
          </button>
          <button onClick={()=>{ if(melodyBusy) return; if(aiLocked && !melodyData){ setPaywallReason('ai_trial'); return; } if(playingRef.current||holdPausedRef.current) _melodyTogglePlayingRef.current=true; if(melodyOn){ melodyOnRef.current=false; melodyVoiceGenRef.current++; setMelodyOn(false); } else if(melodyData){ melodyOnRef.current=true; melodyVoiceGenRef.current++; setMelodyOn(true); } else { if(aiUsable) toggleMelody(); } }} disabled={melodyBusy||(!melodyData&&!aiUsable&&!aiLocked)} className="pf-lift" title={(aiLocked&&!melodyData)?(t('aiLockedHint')||'AI is part of Paintiano Pro AI'):((!melodyData&&!aiUsable)?(t('aiOfflineHint')||'AI features need a connection'):(t('melodyHint')||'AI sings a melody from the picture, over the scan'))} style={txStyle('ai',{effScale,on:melodyOn,disabled:(melodyBusy||(!melodyData&&!aiUsable&&!aiLocked))})}>
            <TxIcon n="sparkle" s={14*effScale}/><span>{(t('melodyLabel')||'melody')+(melodyBusy?' · …':(aiLocked&&!melodyData)?' · —':(!melodyData&&!aiUsable)?' · '+(t('aiOffline')||'offline'):'')}</span>
            {aiLocked && !melodyData && <ProBadge t={t} readScale={effScale} size="sm" tier="ai" />}
          </button>
        </>)}
        {viewMode==='image'&&chords.length>0&&!moodFromImg&&(()=>{
          // REC button — single source of truth for image-mode recording:
          //   tap once → starts a fresh recording AND playback from index 0
          //              (clears any stale recBlob save bar, clears resume
          //              cursor, hides PLAY/PAUSE so the user can't pause a
          //              recording into a corrupted file)
          //   tap again → stopRecord() → recording finishes, blob is kept
          //   playback finishes naturally → auto-stops the recorder, blob kept
          //
          // Once a recording exists (recBlob) and we're idle, the button morphs
          // into a SAVE button: tapping it opens the SAVE picker — the same
          // explicit flow as every other mode (no auto-jump into the picker).
          const canStart = !recording && !playing && !anim && !working && chords.length>0;
          const showSave = !recording && !!recBlob;
          if(showSave){
            return (
              <button onClick={()=>{ if(recBlob) setShowSizePicker(true); }} className="pf-lift" title={t('save')} style={txStyle('save',{effScale})}>
                <TxIcon n="save" s={14*effScale}/>{t('save')}
              </button>
            );
          }
          return (
            <button onClick={()=>{
              if(recording){ stopRecord(); return; }
              if(!canStart) return;
              // Fresh start: nuke stale recording artefacts so the UI is clean
              // and the recorder definitely captures from chord index 0, not
              // from wherever the previous playback paused.
              setRecBlob(null); setRecName(''); setAudioShareMsg(null); setAudioSideImage(null); setAudioRowOpen(false);
              resumeFromRef.current = null;
              setHoldPaused(false);
              setDisp(0);
              // Stay in the current view (e.g. the setup panel) while recording —
              // don't let the "playback started → leave setup" effect yank us to
              // the default play screen. Cleared when recording finishes.
              keepSetupDuringRecRef.current = forceSetup;
              setRecordIntent('picker');
              // AI Compose mode, nothing composed yet: compose first, then start
              // the recorder + playback together (no silent lead-in). Once composed
              // (imgComposeRef true), REC records the existing piece directly.
              if(imgPlayModeRef.current==='compose' && !imgComposeRef.current){
                aiComposeFromImage(()=>{ try{ startRecord(); }catch(_){} });
              } else {
                startRecord();
              }
            }} disabled={!canStart && !recording} title={recording?'stop recording':(canStart?t('recArm'):t('exportNeedsPlay'))} style={txStyle('danger',{effScale,on:recording,disabled:(!canStart && !recording)})}>
              <TxIcon n={recording?'stop':'rec'} s={14*effScale}/>{recording?t('recStop'):t('recArm')}
            </button>
          );
        })()}
        {/* SAVE button removed from image mode — REC auto-opens the picker on
            completion, so a separate SAVE was duplicate UI. */}
        {/* Score button removed from image-mode toolbar — it now lives inside
            the SAVE picker as one of three choices (Story / Audio / Score). */}
        {/* TEMP DISABLED (Jun 2026): playback speed button hidden on PC + mobile
            until users request it. Re-enable by changing `false &&` back to
            `chords.length>0&&!composeMode&&!micPainting&&!micListening&&`. */}
        {false && chords.length>0&&!composeMode&&!micPainting&&!micListening&&(()=>{
          const spd=playbackSpeed;
          const setSpd=setPlaybackSpeed;
          // Discrete rate ladder: half-speed, normal, double-speed.
          const STEPS=[0.5,1,2];
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
                style={{...txStyle(spd===1?'neutral':'active',{effScale,icon:true,disabled:lockSpeed}),width:undefined,minWidth:42,padding:'0 11px',fontSize:(.52*effScale)+'rem',textTransform:'none',userSelect:'none',WebkitUserSelect:'none',touchAction:'none'}}>{label}</button>
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
          className="pf-lift pf-tx-clear"
          disabled={recording}
          title={recording?t('stopRecFirst'):undefined}
          style={txStyle(clearArmed?'danger':'ghost',{effScale,on:clearArmed,disabled:recording})}>{clearArmed?t('clearConfirm'):t('clear')}</button>
        
        {composeMode&&(
          <button className="pf-lift pf-tx-undo" onClick={undoLast} disabled={!chords.length||busy||recording} aria-label="remove last chord" title="remove last chord (Backspace)" style={{...txStyle('neutral',{effScale,icon:true,disabled:(!chords.length||busy||recording)})}}><TxIcon n="undo" s={14*effScale}/></button>
        )}
      </div>
      {composeMode && !working && (
      <div ref={kbScrollRef} className="pf-piano-dock" style={{overflowX:'auto',maxWidth:'100%',marginTop:12,paddingBottom:4,touchAction:'pan-x',WebkitOverflowScrolling:'touch'}}>
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
      {!basicMode && <footer className="pf-version-footer" style={{textAlign:'center',padding:'18px 0 10px',opacity:.4,fontSize:Math.round(8*effScale)+'px',letterSpacing:'.22em',textTransform:'uppercase',color:'rgba(201,168,76,.9)'}}>Paintiano · v2.3{__BUILD_ENV__!=='production' ? ' · build '+__BUILD_SHA__ : ''}</footer>}
      {!basicMode && (
      <div className="pf-legal-links" style={{textAlign:'center',padding:'0 0 24px',opacity:.55,fontSize:Math.round(9*effScale)+'px',letterSpacing:'.08em',color:'rgba(201,168,76,.75)'}}>
        <button onClick={()=>setLegalDoc('pricing')} style={{background:'transparent',border:0,color:'inherit',fontFamily:'inherit',fontSize:'inherit',letterSpacing:'inherit',padding:0,cursor:'pointer',textDecoration:'none',borderBottom:'1px solid rgba(201,168,76,.25)',paddingBottom:1}}>{t('legalPricing')}</button>
        <span style={{margin:'0 10px',opacity:.5}}>·</span>
        <button onClick={()=>setLegalDoc('terms')} style={{background:'transparent',border:0,color:'inherit',fontFamily:'inherit',fontSize:'inherit',letterSpacing:'inherit',padding:0,cursor:'pointer',textDecoration:'none',borderBottom:'1px solid rgba(201,168,76,.25)',paddingBottom:1}}>{t('legalTerms')}</button>
        <span style={{margin:'0 10px',opacity:.5}}>·</span>
        <button onClick={()=>setLegalDoc('privacy')} style={{background:'transparent',border:0,color:'inherit',fontFamily:'inherit',fontSize:'inherit',letterSpacing:'inherit',padding:0,cursor:'pointer',textDecoration:'none',borderBottom:'1px solid rgba(201,168,76,.25)',paddingBottom:1}}>{t('legalPrivacy')}</button>
        <span style={{margin:'0 10px',opacity:.5}}>·</span>
        <button onClick={()=>setLegalDoc('refunds')} style={{background:'transparent',border:0,color:'inherit',fontFamily:'inherit',fontSize:'inherit',letterSpacing:'inherit',padding:0,cursor:'pointer',textDecoration:'none',borderBottom:'1px solid rgba(201,168,76,.25)',paddingBottom:1}}>{t('legalRefunds')}</button>
      </div>
      )}

      {/* ── HELP FAB (Variant A — floating "?" bottom-right) ───────────────
          Affordance for the SETUP SCREEN only. Hidden as soon as the user
          progresses to the pro/canvas view (any loaded source, picked mood,
          compose mode, or mic mode — they all surface the bottom controls
          bar with PLAY/LOOP/SAVE/CLEAR that the FAB would otherwise overlap).
          Also hidden during onboarding (tutorial already explains everything).
          Uses isActiveView (the same flag the app uses elsewhere to switch
          between setup and canvas views), so the FAB correctly comes back
          when the user clicks ← BACK to return to setup, even though source
          state is still loaded under the hood.
          The FAB is fixed-position so it follows the viewport regardless of
          scroll; the popup it opens is also fixed and covers the full
          viewport. zIndex high enough to sit above app chrome but below
          the paywall modal. ── */}
      {!showOnboarding && !showIntro && !isActiveView && !basicMode && !showGuide && !showAbout && !showBook && !showSetupModal && !showHelp && !legalDoc && !paywallReason && (
        <button
          className="pf-help-fab"
          onClick={()=>setShowHelp(true)}
          aria-label={t('helpFab')||'help'}
          title={t('helpFab')||'help'}
          style={{
            position:'fixed',
            bottom:'max(18px, env(safe-area-inset-bottom) + 12px)',
            right:'max(16px, calc(50vw - 240px + 16px))',
            width:44, height:44, borderRadius:'50%',
            background:'linear-gradient(135deg,#c9a84c,#ffd07a)',
            color:'#0a0a12',
            fontSize:'22px', fontWeight:700,
            fontFamily:"'Cormorant Garamond',serif", fontStyle:'italic',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 4px 16px rgba(201,168,76,.45), 0 0 0 1px rgba(255,208,122,.25)',
            cursor:'pointer', border:'none',
            zIndex:90,
            lineHeight:1,
            pointerEvents:'auto',
          }}
        >?</button>
      )}

      {showHelp && (
        <div
          onClick={(e)=>{ if(e.target===e.currentTarget) setShowHelp(false); }}
          style={{
            position:'fixed', inset:0,
            background:'rgba(6,6,12,.94)',
            backdropFilter:'blur(10px)', WebkitBackdropFilter:'blur(10px)',
            // Must sit ABOVE the app header (zIndex 99999) — without this the
            // CONCEPT / DEMO / GUIDE / PRO row and language picker bleed
            // through the blur overlay at the top of the popup.
            zIndex:100000,
            display:'flex', flexDirection:'column',
            // Respect iOS notch / Android status bar via env() safe areas.
            // 56px minimum to leave clearance for the close button.
            paddingTop:'max(56px, calc(env(safe-area-inset-top) + 24px))',
            paddingLeft:16, paddingRight:16,
            paddingBottom:'max(32px, calc(env(safe-area-inset-bottom) + 16px))',
            overflowY:'auto',
          }}
        >
          <button
            onClick={()=>setShowHelp(false)}
            aria-label={t('helpClose')||'close'}
            style={{
              position:'absolute',
              // Match the safe-area padding so the close button sits inside
              // the notch-respecting safe zone on iPhone.
              top:'max(14px, calc(env(safe-area-inset-top) + 8px))',
              left: 'auto',
              right: 'max(16px, env(safe-area-inset-right))',
              width:32, height:32, borderRadius:'50%',
              background:'rgba(255,255,255,.08)',
              color:'rgba(255,255,255,.7)',
              fontSize:'16px', fontWeight:400,
              border:'none', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}
          >✕</button>
          <div style={{maxWidth:480, margin:'0 auto', width:'100%'}}>
            <h2 style={{
              fontFamily:"'Cormorant Garamond',serif", fontWeight:600,
              fontSize:(1.45*effScale)+'rem', color:'#c9a84c',
              textAlign:'center', margin:'0 0 4px',
            }}>{t('helpTitle')!=='helpTitle' ? t('helpTitle') : 'What does what'}</h2>
            <p style={{
              textAlign:'center',
              color:'rgba(242,238,232,.65)',
              fontFamily:'inherit',
              fontSize:(.78*effScale)+'rem', margin:'0 0 14px',
              letterSpacing:'.02em', lineHeight:1.35,
            }}>{t('helpSub')!=='helpSub' ? t('helpSub') : 'tap any source on the setup screen to begin'}</p>

            {[
              { key:'mood',    icon:<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-4.5-7-10a4.5 4.5 0 0 1 8.5-1.5A4.5 4.5 0 0 1 19 11c0 5.5-7 10-7 10z"/></svg>, color:'#ffd07a', bg:'rgba(201,168,76,.12)',  name:t('moodHowFeel')||'How do you feel?' },
              { key:'mfi',     icon:<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 1.5L21 19l-1.3.5L19 21l-.7-1.5L17 19l1.3-.5z"/><path d="M5 4l.6 1.2L7 6l-1.4.4L5 8l-.6-1.6L3 6l1.4-.4z"/></svg>, color:'#e4b2ff', bg:'rgba(220,150,255,.12)', name:t('imgMood')||'Mood from image' },
              { key:'music',   icon:'♪', color:'#5b9cf6', bg:'rgba(91,156,246,.12)',  name:(t('music')||'Music').replace(/[^\p{L} ]/gu,'').trim() },
              { key:'image',   icon:'◫', color:'#f47c3c', bg:'rgba(244,124,60,.12)',  name:(t('image')||'Image').replace(/[^\p{L} ]/gu,'').trim() },
              { key:'compose', icon:'𝄞', color:'#4ecb8d', bg:'rgba(78,203,141,.12)',  name:(t('compose')||'Compose').replace(/[^\p{L} ]/gu,'').trim() },
              { key:'mic',     icon:<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>, color:'#ff6b9d', bg:'rgba(255,107,157,.12)', name:(t('mic')||'Mic').replace(/[^\p{L} ]/gu,'').trim() },
            ].map(it => {
              const descKey='helpDesc_'+it.key;
              const desc = t(descKey)!==descKey ? t(descKey) : '';
              return (
                <div key={it.key} style={{
                  display:'flex', alignItems:'flex-start', gap:10,
                  padding:'6px 2px',
                  borderBottom:'1px solid rgba(255,255,255,.06)',
                }}>
                  <div style={{
                    width:28, height:28, borderRadius:7,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'15px', color:it.color, background:it.bg,
                    flexShrink:0,
                  }}>{it.icon}</div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{
                      fontFamily:'inherit',
                      fontSize:(.7*effScale)+'rem', fontWeight:700,
                      letterSpacing:'.12em', textTransform:'uppercase',
                      color:'#f2eee8', marginBottom:2, lineHeight:1.2,
                    }}>{it.name}</div>
                    <div style={{
                      fontFamily:'inherit',
                      fontSize:(.82*effScale)+'rem',
                      color:'rgba(242,238,232,.78)',
                      lineHeight:1.35,
                      letterSpacing:'.005em',
                    }}>{desc}</div>
                  </div>
                </div>
              );
            })}
            {/* ─── Tier comparison table ────────────────────────────────────
                Compact 3-column overview (Free / Pro / Pro AI) so the user
                sees the tier hierarchy at a glance, without opening the
                paywall. Pro column tinted gold, Pro AI column tinted purple
                — same accents as the in-app feature badges and paywall, so
                it reads as the same family. */}
            <div style={{marginTop:22,paddingTop:18,borderTop:'1px solid rgba(255,255,255,.08)'}}>
              <div style={{
                fontFamily:"'Cormorant Garamond',serif",fontWeight:600,
                fontSize:(1.05*effScale)+'rem',color:'#c9a84c',
                textAlign:'center',marginBottom:8,letterSpacing:'.02em',
              }}>{t('tierOverviewTitle')||'Free · Pro · Pro AI'}</div>
              {/* Intro line ties the abstract "AI features" row in the table
                  to the concrete help items above (How do you feel?, Mood from
                  image, AI Compose inside Image, Atmosphere) so the user
                  understands what "credits" apply to. */}
              <div style={{
                textAlign:'center',marginBottom:14,
                fontSize:(.66*effScale)+'rem',color:'rgba(242,238,232,.6)',
                lineHeight:1.45,letterSpacing:'.01em',
                padding:'0 4px',
              }}>
                <span style={{color:'#dcb4ff',fontSize:(.72*effScale)+'rem',marginRight:4}}>✦</span>
                {t('tierIntro')||'AI features (the ✦ items above + AI Compose & Atmosphere inside Image) use credits on Free.'}
              </div>
              {(()=>{
                const GOLD_BG='rgba(201,168,76,.08)';
                const GOLD_BG_HDR='rgba(201,168,76,.16)';
                const GOLD_FG='#c9a84c';
                const PURPLE_BG='rgba(220,150,255,.07)';
                const PURPLE_BG_HDR='rgba(220,150,255,.14)';
                const PURPLE_FG='#dcb4ff';
                const FREE_FG='rgba(242,238,232,.55)';
                const CELL_TXT='rgba(242,238,232,.85)';
                const cellSty={
                  padding:'7px 6px',textAlign:'center',
                  fontSize:(.7*effScale)+'rem',
                  borderBottom:'1px solid rgba(255,255,255,.06)',
                  lineHeight:1.25,
                };
                const labelSty=Object.assign({},cellSty,{
                  textAlign:'left',color:'rgba(242,238,232,.7)',
                  fontSize:(.68*effScale)+'rem',paddingLeft:2,
                });
                const hdrBase={
                  padding:'8px 4px',textAlign:'center',
                  fontSize:(.62*effScale)+'rem',fontWeight:700,
                  letterSpacing:'.1em',textTransform:'uppercase',
                  borderBottom:'1px solid rgba(255,255,255,.12)',
                  lineHeight:1.2,
                };
                const free=t('tierFreeName')||'Free';
                const pro=t('tierProName')||'Pro';
                const proAi=t('tierProAiName')||'Pro AI';
                const yes=t('tierYes')||'✓';
                const no=t('tierNo')||'—';
                const allWord=t('tierAll')||'all';
                const trial3=t('tier3Trial')||'3× trial';
                const inf=t('tierUnlimited')||'∞';
                const ronly=t('tierReadOnly')||'preview only';
                const rows=[
                  [t('tierRowArtists')||'Artists',         '9',     '18',       '18',  null],
                  [t('tierRowTypes')  ||'Paint types',     '2',     allWord,    allWord, null],
                  [t('tierRowPalette')||'Custom palette',  ronly,   yes,        yes,   null],
                  [t('tierRowDpi')    ||'300 DPI export',  no,      yes,        yes,   null],
                  [t('tierRowWmark')  ||'Watermark',       yes,     no,         no,    null],
                  [t('tierRowAi')     ||'AI features',     (t('tier3Credits')||'3 credits'),  (t('tier3Credits')||'3 credits'),  inf, '✦'],
                ];
                return (
                  <table style={{width:'100%',borderCollapse:'collapse',fontFamily:'inherit'}}>
                    <thead>
                      <tr>
                        <th style={Object.assign({},hdrBase,{textAlign:'left',color:'rgba(242,238,232,.6)',paddingLeft:2})}></th>
                        <th style={Object.assign({},hdrBase,{color:FREE_FG})}>{free}</th>
                        <th style={Object.assign({},hdrBase,{color:GOLD_FG,background:GOLD_BG_HDR})}>{pro}</th>
                        <th style={Object.assign({},hdrBase,{color:PURPLE_FG,background:PURPLE_BG_HDR})}>{proAi}</th>
                      </tr>
                      <tr>
                        <th style={Object.assign({},cellSty,{textAlign:'left',color:'rgba(242,238,232,.4)',fontSize:(.6*effScale)+'rem',paddingLeft:2,fontWeight:400,letterSpacing:'.04em'})}></th>
                        <th style={Object.assign({},cellSty,{color:FREE_FG,fontSize:(.62*effScale)+'rem',fontWeight:500})}>€0</th>
                        <th style={Object.assign({},cellSty,{color:GOLD_FG,fontSize:(.62*effScale)+'rem',fontWeight:600,background:GOLD_BG})}>€9.99</th>
                        <th style={Object.assign({},cellSty,{color:PURPLE_FG,fontSize:(.62*effScale)+'rem',fontWeight:600,background:PURPLE_BG})}>€19.99</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(([label,f,p,a,icon],i)=>(
                        <tr key={i}>
                          <td style={labelSty}>
                            {icon && <span style={{color:'#dcb4ff',marginRight:5}}>{icon}</span>}
                            {label}
                          </td>
                          <td style={Object.assign({},cellSty,{color:FREE_FG})}>{f}</td>
                          <td style={Object.assign({},cellSty,{color:CELL_TXT,background:GOLD_BG})}>{p}</td>
                          <td style={Object.assign({},cellSty,{color:CELL_TXT,background:PURPLE_BG})}>{a}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
              <div style={{textAlign:'center',marginTop:10,fontSize:(.58*effScale)+'rem',color:'rgba(242,238,232,.4)',fontStyle:'italic',letterSpacing:'.04em',lineHeight:1.45}}>
                {t('tierAiCreditsNote')||'AI text & image compose = 1 credit · Atmosphere = 0.5 credit'}
                <br/>
                {t('tierFootnote')||'One-time payment · Lifetime access'}
              </div>
            </div>
          </div>
        </div>
      )}

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
          isDesktop={isDesktop}
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

      {/* ── LEGAL MODAL (Pricing / Terms / Privacy / Refunds) ─────────────
          Replaces opening these as separate browser tabs. Keeps the user
          inside the Paintiano context: ✕ closes back into the app, taps
          outside the panel also close, and links between docs are
          intercepted (onLegalClick) so they re-route into the modal
          rather than navigate the whole page. The HTML for each doc is
          fetched on demand from /public and stripped down to <body>'s
          contents to avoid clashing <html>/<head> styles. ── */}
      {legalDoc && (
        <div
          onClick={(e)=>{ if(e.target===e.currentTarget) setLegalDoc(null); }}
          style={{position:'fixed',inset:0,zIndex:100001,background:'rgba(6,6,12,.94)',backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)',paddingTop:`calc(env(safe-area-inset-top,0px) + 12px)`,paddingBottom:`calc(env(safe-area-inset-bottom,0px) + 12px)`,paddingLeft:12,paddingRight:12,overflow:'hidden',display:'flex',justifyContent:'center'}}
        >
          <div style={{position:'relative',width:'100%',maxWidth:720,height:'100%',background:'rgba(14,11,22,.92)',border:'1px solid rgba(201,168,76,.18)',borderRadius:14,boxShadow:'0 18px 60px rgba(0,0,0,.55)',display:'flex',flexDirection:'column'}}>
            <button
              onClick={()=>setLegalDoc(null)}
              aria-label="close"
              style={{position:'absolute',top:10,right:10,width:36,height:36,borderRadius:18,background:'rgba(247,243,236,.08)',color:'rgba(247,243,236,.85)',border:'1px solid rgba(247,243,236,.18)',cursor:'pointer',fontSize:'1.15rem',lineHeight:'1',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2}}
            >✕</button>
            <div
              onClick={onLegalClick}
              style={{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch',padding:'24px 22px 28px',color:'rgba(247,243,236,.92)',fontFamily:'Arial, sans-serif',fontSize:(.85*effScale)+'rem',lineHeight:1.55}}
              className="paintiano-legal-content"
              dangerouslySetInnerHTML={{__html: legalLoading ? '<p style="opacity:.6;text-align:center;padding:40px;">Loading…</p>' : legalHtmlForLang}}
            />
          </div>
        </div>
      )}

      {/* ── SETUP PICKER MODAL ──────────────────────────────────────────────
          Two sections: which colour palettes and which artists/Mosaic family
          should appear in the canvas pickers. Persisted in localStorage. Min
          1 + 1 required (close + Done disabled otherwise). Free tier sees Pro
          artists in the list with a 🔒 indicator — checking them saves the
          preference, but tapping the tile in canvas still hits the paywall. */}
      {showSetupModal && (()=>{
        const _palLabels = {harmony:t('harmony'), spectral:t('spectral'), phi:t('phi'), kontra:t('kontra'), custom:t('custom')};
        const _artistLabels = (()=>{ const m={mosaicFamily:(ts('setupMosaicFamily','Mosaic family'))}; ALL_ARTIST_KEYS.forEach(k=>{ if(k!=='mosaicFamily') m[k]=STYLE_INSPIRED[k]||k; }); return m; })();
        const _toneLabels = {
          pure:   ({EN:'Pure',SK:'Čistý',DE:'Pur',FR:'Pur',ES:'Puro',PT:'Puro',zh:'纯净',zhTW:'純淨',ja:'ピュア'})[lang]||'Pure',
          real:   ({EN:'Real',SK:'Skutočný',DE:'Real',FR:'Réel',ES:'Real',PT:'Real',zh:'真实',zhTW:'真實',ja:'リアル'})[lang]||'Real',
          pastel: ({EN:'Pastel',SK:'Pastelový',DE:'Pastell',FR:'Pastel',ES:'Pastel',PT:'Pastel',zh:'柔和',zhTW:'柔和',ja:'パステル'})[lang]||'Pastel'
        };
        const togglePal = (k)=> setSetupPalettes(prev => prev.includes(k) ? prev.filter(x=>x!==k) : [...prev, k]);
        const toggleArt = (k)=> setSetupArtists(prev => prev.includes(k) ? prev.filter(x=>x!==k) : [...prev, k]);
        const toggleTone = (k)=> setSetupTones(prev => prev.includes(k) ? prev.filter(x=>x!==k) : [...prev, k]);
        const okMin = setupPalettes.length>=1 && setupArtists.length>=1 && setupTones.length>=1;
        const isFree = proStatus==='free';
        return (
        <div onClick={(e)=>{ if(e.target===e.currentTarget && okMin) closeSetup(); }} style={{position:'fixed',inset:0,zIndex:100000,background:'rgba(8,6,14,0.96)',backdropFilter:'blur(14px)',WebkitBackdropFilter:'blur(14px)',display:'flex',justifyContent:'center'}}>
          <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="setup" className="pf-setup-dialog" style={{position:'relative',width:'100%',maxWidth:980,height:'100%',display:'flex',flexDirection:'column',color:'rgba(247,243,236,.92)',fontFamily:'inherit',borderLeft:'1px solid rgba(201,168,76,.08)',borderRight:'1px solid rgba(201,168,76,.08)',background:'rgba(8,6,14,0.35)'}}>
            <div style={{flexShrink:0,padding:'14px 16px 8px',display:'flex',alignItems:'center',gap:10,position:'relative',zIndex:2}}>
              <div style={{width:34,height:34}} aria-hidden="true" />
              <div style={{flex:1,textAlign:'center',letterSpacing:'.22em',color:'rgba(201,168,76,.85)',fontSize:(.65*effScale)+'rem',textTransform:'uppercase',fontWeight:600}}>{ts('setupPickerLabel','Setup')}</div>
              <button onClick={()=>{ if(okMin) closeSetup(); }} disabled={!okMin} aria-label="close" title="close" style={{background:'rgba(28,24,40,.6)',border:'1px solid rgba(242,238,232,.15)',color:okMin?'rgba(247,243,236,.85)':'rgba(247,243,236,.25)',width:34,height:34,borderRadius:'50%',cursor:okMin?'pointer':'default',fontSize:'1.1rem',display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,fontFamily:'inherit'}}>×</button>
            </div>
            <div className="pf-setup-body" style={{flex:1,overflowY:'auto',padding:'18px 20px',display:'flex',flexDirection:'column',gap:22}}>
              {/* Palettes — chip grid matching cockpit look; solid = in Set,
                  dashed = ghost (not in Set). ALL/NONE inline shortcuts. */}
              <div className="pf-setup-palettes">
                <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10,gap:8}}>
                  <span style={{fontSize:(.55*effScale)+'rem',fontWeight:500,letterSpacing:'.22em',color:'rgba(201,168,76,.65)',textTransform:'uppercase',fontStyle:'italic'}}>{ts('setupPalettesTitle','Palettes')}</span>
                  <span style={{display:'inline-flex',gap:6,fontSize:(.5*effScale)+'rem',letterSpacing:'.04em'}}>
                    <span onClick={()=>setSetupPalettes(ALL_PALETTE_KEYS.slice())} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSetupPalettes(ALL_PALETTE_KEYS.slice());}}} style={{cursor:'pointer',padding:'2px 9px',borderRadius:11,border:'1px solid rgba(201,168,76,.35)',color:'rgba(220,180,90,.85)',textTransform:'uppercase',fontStyle:'italic'}}>{_sent(ts('setupAll','All'))}</span>
                    <span onClick={()=>setSetupPalettes([])} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSetupPalettes([]);}}} style={{cursor:'pointer',padding:'2px 9px',borderRadius:11,border:'1px solid rgba(230,222,196,.2)',color:'rgba(230,222,196,.55)',textTransform:'uppercase',fontStyle:'italic'}}>{_sent(ts('setupNone','None'))}</span>
                  </span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:6,rowGap:8}}>
                  {ALL_PALETTE_KEYS.map(k=>{
                    const on = setupPalettes.includes(k);
                    return (
                    <button key={k} onClick={()=>togglePal(k)} style={{width:'100%',padding:'8px 4px',textAlign:'center',fontSize:(.54*effScale)+'rem',fontWeight:600,letterSpacing:'.04em',fontFamily:'inherit',textTransform:'uppercase',cursor:'pointer',borderRadius:20,whiteSpace:'nowrap',lineHeight:1.2,transition:'color .18s, border-color .18s',...(on?{background:PF.card2,border:'1px solid rgba(201,168,76,.4)',color:'rgba(220,180,90,.98)'}:{background:'transparent',border:'1px dashed rgba(242,238,232,.22)',color:'rgba(230,222,196,.4)'})}}>{_sent(_palLabels[k])}</button>
                    );
                  })}
                </div>
              </div>
              {/* Inspired by — 5-column chip grid of individual artists (not
                  paired). "Mosaic family" is one tile that covers all three
                  mosaic variants; the other 19 keys are individual artists. */}
              <div className="pf-setup-artists">
                <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10,gap:8}}>
                  <span style={{fontSize:(.55*effScale)+'rem',fontWeight:500,letterSpacing:'.22em',color:'rgba(201,168,76,.65)',textTransform:'uppercase',fontStyle:'italic'}}>{ts('setupArtistsTitle',({EN:'Inspired by',SK:'Inšpirované',DE:'Inspiriert von',FR:'Inspiré par',ES:'Inspirado por',PT:'Inspirado por',zh:'灵感来源',zhTW:'靈感來源',ja:'インスパイア'})[lang]||'Inspired by')}</span>
                  <span style={{display:'inline-flex',gap:6,fontSize:(.5*effScale)+'rem',letterSpacing:'.04em'}}>
                    <span onClick={()=>setSetupArtists(ALL_ARTIST_KEYS.slice())} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSetupArtists(ALL_ARTIST_KEYS.slice());}}} style={{cursor:'pointer',padding:'2px 9px',borderRadius:11,border:'1px solid rgba(201,168,76,.35)',color:'rgba(220,180,90,.85)',textTransform:'uppercase',fontStyle:'italic'}}>{_sent(ts('setupAll','All'))}</span>
                    <span onClick={()=>setSetupArtists([])} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSetupArtists([]);}}} style={{cursor:'pointer',padding:'2px 9px',borderRadius:11,border:'1px solid rgba(230,222,196,.2)',color:'rgba(230,222,196,.55)',textTransform:'uppercase',fontStyle:'italic'}}>{_sent(ts('setupNone','None'))}</span>
                  </span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:6,rowGap:8}}>
                  {ALL_ARTIST_KEYS.map(k=>{
                    const on = setupArtists.includes(k);
                    // Compact single-word label to fit narrow 5-col chip
                    const _label = k==='mosaicFamily' ? t('mosaicStyle') : (()=>{ const _as={'Sam Francis':'Francis','Hilma af Klint':'af Klint','Keith Haring':'Haring','Bridget Riley':'Riley','Joan Mitchell':'Mitchell','Katsushika Hokusai':'Hokusai','Gustav Klimt':'Klimt','Claude Monet':'Monet'}; const _f=STYLE_INSPIRED[k]||k; return _as[_f]||_f; })();
                    return (
                    <button key={k} onClick={()=>toggleArt(k)} style={{width:'100%',padding:'8px 4px',textAlign:'center',fontSize:(.54*effScale)+'rem',fontWeight:600,letterSpacing:'.04em',fontFamily:'inherit',textTransform:'uppercase',cursor:'pointer',borderRadius:20,whiteSpace:'nowrap',lineHeight:1.2,transition:'color .18s, border-color .18s',...(on?{background:PF.card2,border:'1px solid rgba(201,168,76,.4)',color:'rgba(220,180,90,.98)'}:{background:'transparent',border:'1px dashed rgba(242,238,232,.22)',color:'rgba(230,222,196,.4)'})}}>{_label}</button>
                    );
                  })}
                </div>
                <div style={{textAlign:'center',marginTop:12,fontSize:(.55*effScale)+'rem',color:'rgba(230,222,196,.55)',fontStyle:'italic'}}>{ts('setupTapHint',({EN:'Tap to add or remove from your set.',SK:'Klepni pre pridanie alebo odstránenie zo setu.',DE:'Tippen, um zum Set hinzuzufügen oder zu entfernen.',FR:'Touchez pour ajouter ou retirer de votre set.',ES:'Toca para añadir o quitar de tu set.',PT:'Toque para adicionar ou remover do seu conjunto.',zh:'点击以从您的集合中添加或移除。',zhTW:'點擊以從您的集合中添加或移除。',ja:'タップしてセットに追加または削除します。'})[lang]||'Tap to add or remove from your set.')}</div>
              </div>
              {/* Tones — 3-chip row (chosen tones become available in the
                  cockpit; if only 1 is enabled, the cockpit hides the tone
                  section entirely). */}
              <div className="pf-setup-tones">
                <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10,gap:8}}>
                  <span style={{fontSize:(.55*effScale)+'rem',fontWeight:500,letterSpacing:'.22em',color:'rgba(201,168,76,.65)',textTransform:'uppercase',fontStyle:'italic'}}>{ts('setupTonesTitle',({EN:'Tone',SK:'Tón',DE:'Ton',FR:'Tonalité',ES:'Tono',PT:'Tom',zh:'色调',zhTW:'色調',ja:'トーン'})[lang]||'Tone')}</span>
                  <span style={{display:'inline-flex',gap:6,fontSize:(.5*effScale)+'rem',letterSpacing:'.04em'}}>
                    <span onClick={()=>setSetupTones(ALL_TONE_KEYS.slice())} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSetupTones(ALL_TONE_KEYS.slice());}}} style={{cursor:'pointer',padding:'2px 9px',borderRadius:11,border:'1px solid rgba(201,168,76,.35)',color:'rgba(220,180,90,.85)',textTransform:'uppercase',fontStyle:'italic'}}>{_sent(ts('setupAll','All'))}</span>
                    <span onClick={()=>setSetupTones([])} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSetupTones([]);}}} style={{cursor:'pointer',padding:'2px 9px',borderRadius:11,border:'1px solid rgba(230,222,196,.2)',color:'rgba(230,222,196,.55)',textTransform:'uppercase',fontStyle:'italic'}}>{_sent(ts('setupNone','None'))}</span>
                  </span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
                  {ALL_TONE_KEYS.map(k=>{
                    const on = setupTones.includes(k);
                    return (
                    <button key={k} onClick={()=>toggleTone(k)} style={{width:'100%',padding:'8px 4px',textAlign:'center',fontSize:(.54*effScale)+'rem',fontWeight:600,letterSpacing:'.04em',fontFamily:'inherit',textTransform:'uppercase',cursor:'pointer',borderRadius:20,whiteSpace:'nowrap',lineHeight:1.2,transition:'color .18s, border-color .18s',...(on?{background:PF.card2,border:'1px solid rgba(201,168,76,.4)',color:'rgba(220,180,90,.98)'}:{background:'transparent',border:'1px dashed rgba(242,238,232,.22)',color:'rgba(230,222,196,.4)'})}}>{_sent(_toneLabels[k])}</button>
                    );
                  })}
                </div>
              </div>
              {!okMin && (
                <div style={{padding:'10px 12px',borderRadius:8,background:'rgba(232,85,122,.12)',border:'1px solid rgba(232,85,122,.4)',color:'#ff9ab4',fontSize:(.6*effScale)+'rem',lineHeight:1.4}}>{ts('setupMinError','Choose at least 1 palette and 1 artist.')}</div>
              )}
            </div>
            <div className="pf-setup-footer" style={{padding:'18px 20px 22px',borderTop:'1px solid rgba(255,255,255,.05)',display:'flex',justifyContent:'center',gap:8}}>
              <button onClick={()=>{ if(okMin) closeSetup(); }} disabled={!okMin} style={{padding:'12px 32px',background:'transparent',color:okMin?'rgba(220,180,90,.95)':'rgba(201,168,76,.3)',border:'1px solid '+(okMin?'rgba(201,168,76,.45)':'rgba(201,168,76,.15)'),borderRadius:22,cursor:okMin?'pointer':'default',fontFamily:'inherit',fontSize:(.68*effScale)+'rem',fontWeight:500,letterSpacing:'.14em',textTransform:'uppercase',transition:'background .18s, border-color .18s'}}>{_sent(ts('setupSave','Done'))} <span>→</span></button>
            </div>
            <button onClick={()=>setReadScale(rs=> rs>=1.5?1 : rs>=1.25?1.5 : 1.25)} aria-label={t('fsLabel')} title={t('fsLabel')} style={{position:'absolute',right:14,bottom:12,display:'inline-flex',alignItems:'center',gap:4,padding:'5px 12px',borderRadius:16,cursor:'pointer',fontFamily:'inherit',letterSpacing:'.08em',textTransform:'uppercase',color:'rgba(201,168,76,.7)',background:'rgba(28,24,40,.55)',border:'1px solid rgba(201,168,76,.3)',fontSize:'.55rem',fontWeight:600}}>A<span style={{fontSize:(.6*readScale)+'rem',fontWeight:700}}>A</span><span style={{fontSize:'.5rem',opacity:.6}}>{readScale===1?'1×':readScale===1.25?'1¼':'1½'}</span></button>
          </div>
        </div>
        );
      })()}
      {/* ── BASIC mode CTA bar ──────────────────────────────────────────────
          Three primary actions docked at the bottom. Surprise me swaps the
          artist style live (song keeps playing); the middle button is
          contextual — Pause/Resume while playing, Save once the song finishes;
          My song opens the file picker straight away (no intermediate tile).
          Shown whenever Basic is active and the intro has cleared. */}
      {basicMode && !showIntro && (()=>{
        const btn = {flex:1,display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,padding:'13px 8px',borderRadius:14,cursor:'pointer',fontFamily:'inherit',fontSize:(.72*effScale)+'rem',fontWeight:600,letterSpacing:'.02em',border:'1px solid rgba(242,238,232,.16)',background:'rgba(37,32,48,.92)',color:'rgba(232,228,220,.95)',whiteSpace:'nowrap',WebkitTapHighlightColor:'transparent'};
        const primary = {...btn,background:'rgba(220,180,90,.95)',color:'#0b0b0f',border:'1px solid rgba(220,180,90,.95)'};
        // Secondary accent — "Use my song" is the main next-step once a painting
        // is done, so it reads louder than the quiet Save/Pause btn but quieter
        // than the gold primary: a gold-tinted outline, not a filled gold.
        const secondary = {...btn,background:'rgba(220,180,90,.10)',color:'rgba(232,216,170,.95)',border:'1px solid rgba(220,180,90,.45)'};
        // Hyper-modern CTA glyphs (thin stroke / solid, inherit button colour).
        const _icoSize = Math.round(17*Math.max(.85,Math.min(1.15,effScale)));
        const _icoShuffle = (<svg width={_icoSize} height={_icoSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}} aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>);
        const _icoPlay = (<svg width={_icoSize} height={_icoSize} viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}} aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5z"/></svg>);
        const _icoPause = (<svg width={_icoSize} height={_icoSize} viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}} aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.4"/><rect x="14" y="5" width="4" height="14" rx="1.4"/></svg>);
        const _icoSave = (<svg width={_icoSize} height={_icoSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}} aria-hidden="true"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>);
        const _icoWave = (<svg width={Math.round(_icoSize*1.1)} height={_icoSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{flexShrink:0}} aria-hidden="true"><line x1="4" y1="10" x2="4" y2="14"/><line x1="8" y1="6" x2="8" y2="18"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="16" y1="4" x2="16" y2="20"/><line x1="20" y1="10" x2="20" y2="14"/></svg>);
        const _icoPic = (<svg width={_icoSize} height={_icoSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}} aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.4"/><path d="M3 16.5l5-4 4 3 3-2.5 6 5"/></svg>);
        const _icoFile = (<svg width={_icoSize} height={_icoSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}} aria-hidden="true"><path d="M14 3v5h5"/><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>);
        const _icoMic = (<svg width={_icoSize} height={_icoSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}} aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="21"/></svg>);
        const _icoSample = (<svg width={_icoSize} height={_icoSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}} aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="5" x2="7" y2="14"/><line x1="11" y1="5" x2="11" y2="14"/><line x1="15" y1="5" x2="15" y2="14"/></svg>);
        const _haveArt = chords.length>0;
        const _done = _haveArt && !playing && disp>=chords.length;
        // Lite IMAGE flavour (painting→music) records live while it plays (like
        // Advanced REC). There is no Play/Pause here — only Stop (while playing/
        // recording) → Save (once a recording exists). Save shares the captured
        // WAV directly. Music flavour keeps its normal Save/Pause/Resume/Play.
        const _liteImg = basicMode && liteImageMode;
        // Big Play chip is on screen (first entry, audio not yet unlocked): the
        // bottom CTAs are disabled until the user taps Play, so nothing fires
        // before the audio gesture.
        const _litePlayChipShown = basicMode && !liteImageMode && chords.length===0 && !playing && !busy && !composeMode && !micActive && !loadedSource && !liteEverUnlockedRef.current;
        const _liteImgRecording = _liteImg && recording;
        const _liteImgHasRec = _liteImg && !recording && !!recBlob;
        const _icoStop = (<svg width={_icoSize} height={_icoSize} viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}} aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>);
        const _midLabel = _liteImgRecording ? (<>{_icoStop}<span>{ts('stopLabel','Stop')}</span></>)
                          : _liteImgHasRec ? (<>{_icoSave}<span>{ts('saveLabel','Save')}</span></>)
                          : _done ? (<>{_icoSave}<span>{ts('saveLabel','Save')}</span></>)
                                : (holdPaused ? (<>{_icoPlay}<span>{t('resume')!=='resume'?t('resume'):'Resume'}</span></>)
                                              : (playing ? (<>{_icoPause}<span>{t('pause')!=='pause'?t('pause'):'Pause'}</span></>)
                                                         : (<>{_icoPlay}<span>{t('play')!=='play'?t('play'):'Play'}</span></>)));
        const _midClick = ()=>{
          if(_liteImgRecording){ try{ stopRecord(); }catch(_){} return; }
          if(_liteImgHasRec){ try{ if(recBlob){ const f=new File([recBlob],recName||'paintiano.m4a',{type:recBlob.type||'audio/mp4'}); const _dl=()=>{ try{ const u=URL.createObjectURL(recBlob); const a=document.createElement('a'); a.href=u; a.download=recName||'paintiano.m4a'; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(()=>{try{URL.revokeObjectURL(u);}catch(_){}} ,10000); }catch(_){} }; if(navigator.share && navigator.canShare && navigator.canShare({files:[f]})){ navigator.share({files:[f],title:'Paintiano audio'}).catch(()=>{ _dl(); }); } else { _dl(); } } }catch(_){} return; }
          if(_done){ if(liteImageMode){ /* handled above */ } else { try{ exportImage('web'); }catch(_){} } return; }
          try{ handlePauseClick(); }catch(_){}
        };
        const _capturing = micActive || recording;   // mic is actively listening/painting
        const _startMicLite = ()=>{
          setLiteSrcPicker(false);
          // A new capture wipes whatever was there before — stop any live mic first.
          try{ if(micListening) stopMicListening(); else if(micPainting) stopMicPainting(); }catch(_){}
          try{ if(draftOwnerRef.current){ draftOwnerRef.current=null; } }catch(_){}
          // New mic = fresh start: drop the previous painting/chords entirely so
          // the user gets a clean canvas, not continuation of the last recording.
          // The previous session's Save dialog has already committed (or
          // discarded) the user's intent before this point.
          try{ stopAll && stopAll(); }catch(_){}
          try{ fullClear && fullClear(); }catch(_){}
          // Belt-and-braces: clear mic preset stashes + audio refs so neither
          // the HUDBA⇄voice switcher nor any restoreStash effect can revive
          // the previous song's audio header / seek bar / chords on top of
          // the new mic painting (the "mixed mode" bug — Metamorphosis playing
          // in seek while mic painted green Rothko on canvas).
          try{ listenStashRef.current=null; singStashRef.current=null; }catch(_){}
          try{ listenPCMRef.current=null; listenBlobRef.current=null; }catch(_){}
          try{ setAudioName(''); setMidiName(''); setLoadedSource(null); }catch(_){}
          try{ setMuted(false); }catch(_){}
          setMicPreset('music');               // listen to the room (no singing required)
          setMicArmed(true); setStayActive(true);
          // Auto-start the capture in the same gesture — no separate REC tap.
          setTimeout(()=>{ try{ wakeAudio().then(()=>{ try{ startMicListening(); }catch(_){} }).catch(()=>{ try{ startMicListening(); }catch(_){} }); }catch(_){ try{ startMicListening(); }catch(__){} } }, 60);
        };
        const _stopMicLite = ()=>{ try{ if(micListening) stopMicListening(); else if(micPainting) stopMicPainting(); }catch(_){} try{ if(recording) stopRecord(); }catch(_){} setMicArmed(false);
          // Lite mic only PAINTS what it hears — it must not play back a recording.
          // Clearing the captured-audio refs + listen ownership makes Surprise/Play
          // replay the painted notes as piano. We do NOT touch the global
          // playSourceMic state, so Advanced mic behaviour is left completely intact.
          try{ listenPCMRef.current=null; }catch(_){}
          try{ if(listenBlobRef.current) listenBlobRef.current=null; }catch(_){}
          try{ if(draftOwnerRef.current==='listen'||draftOwnerRef.current==='sing') draftOwnerRef.current=null; }catch(_){}
          // Lite mic only listens + paints — after Stop there is NOTHING to play:
          // no recording, no piano re-play. Finalise the canvas as a finished
          // artwork (full paint, not paused) so the middle CTA reads Save, never
          // Resume/Play, and a stray tap can't start playback.
          try{ stopAll && stopAll(); }catch(_){}
          try{ setHoldPaused(false); holdPausedRef.current=false; }catch(_){}
          try{ resumeFromRef.current=null; }catch(_){}
          try{ const _n=(chordsRef.current?chordsRef.current.length:chords.length)||0; setDisp(_n); dispRef.current=_n; }catch(_){}
          basicTapUnlockedRef.current=false; try{ audioWasHiddenRef.current=true; }catch(_){} setTimeout(()=>{ try{ wakeAudio(); }catch(_){} }, 80); };
        const _openFileLite = ()=>{
          setLiteSrcPicker(false);
          // Picking a file REPLACES the source. Stop any live mic + clear armed
          // state first — otherwise we end up with file playing in the seek bar
          // AND mic painting on the canvas at the same time (the "mixed mode"
          // bug — Metamorphosis One in seek, Rothko green from mic painting).
          try{ if(micListening) stopMicListening(); else if(micPainting) stopMicPainting(); }catch(_){}
          try{ setMicArmed(false); }catch(_){}
          if(draftOwnerRef.current){ try{ stashDraft(draftOwnerRef.current); }catch(_){} draftOwnerRef.current=null; }
          try{ refSound.current && refSound.current.click(); }catch(_){}
        };
        // Lite Image: pick a photo → Paintiano reads it as a score and paints.
        // loadImage handles the whole pipeline (decode, scan, paint), so we just
        // open the image file picker — same as Advanced, no Setup screen.
        const _loadSampleLite = ()=>{
          setLiteSrcPicker(false);
          // Load the built-in Liszt sample and play it — same source the Lite
          // entry auto-loads. This is a real tap, so audio is allowed.
          try{ if(micListening) stopMicListening(); else if(micPainting) stopMicPainting(); }catch(_){}
          try{ if(draftOwnerRef.current){ stashDraft(draftOwnerRef.current); draftOwnerRef.current=null; } }catch(_){}
          try{ setMuted(false); }catch(_){}
          try{ pickExpressiveStyle(); }catch(_){}
          // Palette + tone inherited from current state (Advanced or session).
          loadSampleMidi();
          setTimeout(()=>{ try{ wakeAudio().then(()=>{ startPlayRef.current && startPlayRef.current(); }).catch(()=>{ startPlayRef.current && startPlayRef.current(); }); }catch(_){} }, 120);
        };
        // Middle button: Stop while capturing, else Save (done) / Pause·Play.
        const _midMicAware = _liteImg ? _midLabel : (_capturing ? (<>{_icoPause}<span>{ts('stopLabel','Stop')}</span></>) : _midLabel);
        const _midClickAware = ()=>{ if(_liteImg){ _midClick(); return; } if(_capturing){ _stopMicLite(); return; } _midClick(); };
        return (
        <>
        {liteSrcPicker && (
          <div onClick={()=>setLiteSrcPicker(false)} style={{position:'fixed',inset:0,zIndex:70,background:(basicMode&&isDesktop)?'transparent':'rgba(4,3,8,0.6)',backdropFilter:(basicMode&&isDesktop)?'none':'blur(4px)',WebkitBackdropFilter:(basicMode&&isDesktop)?'none':'blur(4px)',display:'flex',alignItems:(basicMode&&isDesktop)?'flex-start':'flex-end',justifyContent:(basicMode&&isDesktop)?'flex-start':'flex-end'}}>
            <div onClick={e=>e.stopPropagation()} style={(basicMode&&isDesktop)?{display:'flex',flexDirection:'column',alignItems:'stretch',gap:12,padding:'96px 0 0 24px',width:150}:{display:'flex',flexDirection:'column',alignItems:'stretch',gap:10,padding:'14px 12px calc(80px + env(safe-area-inset-bottom,0px))',minWidth:200}}>
              <button onClick={_loadSampleLite} style={{...btn,...((basicMode&&isDesktop)?{flexDirection:'column',gap:8,height:110,padding:'20px 12px',borderRadius:14,fontSize:(.66*effScale)+'rem'}:{justifyContent:'flex-start',gap:10,padding:'15px 18px',fontSize:(.74*effScale)+'rem'})}}>{_icoSample}<span style={{marginLeft:7}}>{ts('useMySongSample','Sample')}</span></button>
              <button onClick={_openFileLite} style={{...btn,...((basicMode&&isDesktop)?{flexDirection:'column',gap:8,height:110,padding:'20px 12px',borderRadius:14,fontSize:(.66*effScale)+'rem'}:{justifyContent:'flex-start',gap:10,padding:'15px 18px',fontSize:(.74*effScale)+'rem'})}}>{_icoFile}<span style={{marginLeft:7}}>{ts('useMySongFile','File')}</span></button>
              <button onClick={()=>{ setLiteSrcPicker(false); setShowMyMusicDrawer(true); }} style={{...btn,...((basicMode&&isDesktop)?{flexDirection:'column',gap:8,height:110,padding:'20px 12px',borderRadius:14,fontSize:(.66*effScale)+'rem'}:{justifyContent:'flex-start',gap:10,padding:'15px 18px',fontSize:(.74*effScale)+'rem'})}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span style={{marginLeft:7}}>{ts('mymusicTitle',({EN:'My Music',SK:'Moja hudba',DE:'Meine Musik',FR:'Ma musique',ES:'Mi música',PT:'Minha música',zh:'我的音乐',zhTW:'我的音樂',ja:'マイミュージック'})[lang]||'My Music')}</span></button>
              <button onClick={_startMicLite} style={{...btn,...((basicMode&&isDesktop)?{flexDirection:'column',gap:8,height:110,padding:'20px 12px',borderRadius:14,fontSize:(.66*effScale)+'rem'}:{justifyContent:'flex-start',gap:10,padding:'15px 18px',fontSize:(.74*effScale)+'rem'})}}>{_icoMic}<span style={{marginLeft:7}}>{ts('useMySongMic','Mic')}</span></button>
            </div>
          </div>
        )}
        {/* Lite mode 2 (painting → music) image picker: Sample (Van Gogh) / File */}
        {liteImgPicker && (
          <div onClick={()=>setLiteImgPicker(false)} style={{position:'fixed',inset:0,zIndex:70,background:(basicMode&&isDesktop)?'transparent':'rgba(4,3,8,0.6)',display:'flex',alignItems:(basicMode&&isDesktop)?'flex-start':'flex-end',justifyContent:'center',backdropFilter:(basicMode&&isDesktop)?'none':'blur(2px)'}}>
            <div onClick={e=>e.stopPropagation()} style={(basicMode&&isDesktop)?{display:'flex',flexDirection:'row',alignItems:'stretch',gap:12,padding:'96px 16px 0'}:{display:'flex',flexDirection:'column',alignItems:'stretch',gap:10,width:'100%',maxWidth:480,padding:'16px 16px 28px',background:'linear-gradient(180deg,rgba(20,17,28,.0),rgba(20,17,28,.96) 18%)',borderTopLeftRadius:22,borderTopRightRadius:22}}>
              <button onClick={()=>{ setLiteImgPicker(false); try{ setRecBlob(null); setRecName(''); }catch(_){} try{ if(draftOwnerRef.current){ stashDraft(draftOwnerRef.current); draftOwnerRef.current=null; } }catch(_){} try{ loadSampleImage(); }catch(_){} }} style={{...btn,...((basicMode&&isDesktop)?{flexDirection:'column',gap:8,height:110,padding:'20px 12px',borderRadius:14,fontSize:(.66*effScale)+'rem'}:{justifyContent:'flex-start',gap:10,padding:'15px 18px',fontSize:(.74*effScale)+'rem'})}}>{_icoPic}<span style={{marginLeft:7}}>{ts('useMySongSample','Sample')}</span></button>
              <button onClick={()=>{ setLiteImgPicker(false); try{ setRecBlob(null); setRecName(''); }catch(_){} try{ if(draftOwnerRef.current){ stashDraft(draftOwnerRef.current); draftOwnerRef.current=null; } }catch(_){} try{ refImage.current && refImage.current.click(); }catch(_){} }} style={{...btn,...((basicMode&&isDesktop)?{flexDirection:'column',gap:8,height:110,padding:'20px 12px',borderRadius:14,fontSize:(.66*effScale)+'rem'}:{justifyContent:'flex-start',gap:10,padding:'15px 18px',fontSize:(.74*effScale)+'rem'})}}>{_icoFile}<span style={{marginLeft:7}}>{ts('useMySongFile','File')}</span></button>
            </div>
          </div>
        )}
        {!_litePlayChipShown && <div role="region" aria-label="basic actions" style={(basicMode&&isDesktop)?{position:'fixed',...((isNotPhone&&!is5Col)?{top:'52%',transform:'translateY(-50%)'}:{top:96}),right:24,zIndex:immersive?10001:60,display:'flex',flexDirection:'column',gap:12,width:150,alignItems:'stretch',opacity:(immersive&&isNotPhone&&!is5Col&&!controlsAwake)?0:1,pointerEvents:(immersive&&isNotPhone&&!is5Col&&!controlsAwake)?'none':'auto',transition:'opacity .4s ease'}:{position:'fixed',left:0,right:0,bottom:0,zIndex:60,display:immersive?'none':'flex',gap:8,padding:'10px 12px calc(12px + env(safe-area-inset-bottom,0px))',background:'rgba(4,3,8,0.97)',backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)',borderTop:'1px solid rgba(201,168,76,.15)'}}>
          {!liteImageMode && <button onClick={()=>{ if(demoReelOn) return; basicSurprise(); }} disabled={demoReelOn||!_haveArt||_litePlayChipShown} title={ts('surpriseMe','Surprise me')} style={{...(_litePlayChipShown?btn:primary),...((basicMode&&isDesktop)?{flexDirection:'column',gap:8,height:110,padding:'20px 12px',borderRadius:14,fontSize:(.66*effScale)+'rem'}:{}),opacity:(demoReelOn||!_haveArt||_litePlayChipShown)?.5:1}}>{_icoShuffle}<span>{ts('surpriseMe','Surprise me')}</span></button>}
          <button onClick={_midClickAware} disabled={_litePlayChipShown || (!_liteImg && !_capturing && !_haveArt)} title={_liteImgRecording?ts('stopLabel','Stop'):((_liteImgHasRec||_done)?ts('saveLabel','Save'):(_capturing?ts('stopLabel','Stop'):(playing?t('pause'):t('play'))))} style={{...btn,...((basicMode&&isDesktop)?{flexDirection:'column',gap:8,height:110,padding:'20px 12px',borderRadius:14,fontSize:(.66*effScale)+'rem'}:{}),...((_capturing && !basicMode)?{background:'rgba(220,70,70,.95)',border:'1px solid rgba(220,70,70,.95)',color:'#fff'}:{}),opacity:_litePlayChipShown?.5:((_capturing||_haveArt||_liteImg)?1:.5)}}>{_midMicAware}</button>
          {!immersive && (liteImageMode
            ? <button onClick={()=>setLiteImgPicker(true)} disabled={_litePlayChipShown} title={ts('useMyPicture','Use my picture')} style={{...btn,...((basicMode&&isDesktop)?{flexDirection:'column',gap:8,height:110,padding:'20px 12px',borderRadius:14,fontSize:(.66*effScale)+'rem'}:{}),opacity:_litePlayChipShown?.5:1}}>{_icoPic}<span>{ts('useMyPicture','Use my picture')}</span></button>
            : <button onClick={()=>setLiteSrcPicker(true)} disabled={_litePlayChipShown} title={ts('useMySong','Use my song')} style={{...btn,...((basicMode&&isDesktop)?{flexDirection:'column',gap:8,height:110,padding:'20px 12px',borderRadius:14,fontSize:(.66*effScale)+'rem'}:{}),opacity:_litePlayChipShown?.5:1}}>{_icoWave}<span>{ts('useMySong','Use my song')}</span></button>)}
        </div>}
        </>
        );
      })()}
    </div>
  );
}
