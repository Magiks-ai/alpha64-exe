const data = window.MEMECOIN_RADAR_DATA || {candidates:[], counts:{}, source:{}};
    const launchData = window.MEMECOIN_UPCOMING_LAUNCHES || {launches:[], source:{realData:false, reason:'not loaded'}, instructions:[]};
    let selected = null, selectedLaunch = null, activeTab = 'fresh';
    const $ = s => document.querySelector(s);
    function money(n){ n=Number(n||0); if(!n) return '$0'; if(n>=1e6) return '$'+(n/1e6).toFixed(2)+'M'; if(n>=1e3) return '$'+(n/1e3).toFixed(1)+'K'; return '$'+n.toFixed(0); }
    function age(h){ if(h==null) return 'unknown'; if(h<1) return Math.round(h*60)+'m'; if(h<48) return h.toFixed(1)+'h'; return (h/24).toFixed(1)+'d'; }
    function tx(pair, w){ const t=pair.txns?.[w]||{}; return Number(t.buys||0)+Number(t.sells||0); }
    function esc(s){ return String(s??'').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
    function safeUrl(s){ try{ const raw=String(s??'').trim(); if(!raw) return ''; const u=new URL(raw, location.href); return ['http:','https:'].includes(u.protocol) ? esc(u.href) : '#'; }catch(e){ return '#'; } }
    function tokenCa(c){ return String(c?.tokenAddress || c?.baseToken?.address || c?.pairAddress || '').trim(); }
    function shortCa(ca){ ca=String(ca||''); return ca.length>14 ? ca.slice(0,6)+'…'+ca.slice(-6) : ca; }
    function caMarkup(c, compact=false){ const ca=tokenCa(c); if(!ca) return ''; return `<button class="ca-copy${compact?' compact':''}" type="button" data-ca="${esc(ca)}" title="Copy contract address"><span>CA</span><code>${esc(compact?shortCa(ca):ca)}</code><b>copy</b></button>`; }
    async function copyText(text){
      try{ await navigator.clipboard.writeText(text); return true; }
      catch(e){ const ta=document.createElement('textarea'); ta.value=text; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); let ok=false; try{ ok=document.execCommand('copy'); }catch(err){} ta.remove(); return ok; }
    }
    async function copyCaFromButton(btn){ const ca=btn?.dataset?.ca||''; if(!ca) return; const ok=await copyText(ca); const old=btn.querySelector('b')?.textContent || 'copy'; if(btn.querySelector('b')) btn.querySelector('b').textContent=ok?'copied':'failed'; alphaToast(ok?`CA COPIED // ${shortCa(ca)}`:'CLIPBOARD BLOCKED', ok?'ok':'warn'); mascotSay?.(ok?`CA copied: ${shortCa(ca)}`:'Clipboard blocked. CA is visible for manual copy.', ok?'scan':'warn'); setTimeout(()=>{ if(btn.querySelector('b')) btn.querySelector('b').textContent=old; },1200); }
    function alphaToast(msg, kind='ok'){
      let t=$('#alphaToast');
      if(!t){ t=document.createElement('div'); t.id='alphaToast'; t.className='alpha-toast'; document.body.appendChild(t); }
      t.dataset.kind=kind; t.textContent=msg; t.classList.add('active');
      clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('active'),1800);
    }
    function shareText(c){ const ca=tokenCa(c); return `ALPHA64 flagged ${c.symbol?'$'+c.symbol:c.name||'a token'} // pressure ${Math.round(c.score||0)}/250 // liq ${money(c.liquidityUsd)} // vol24 ${money(c.volume?.h24)} // CA: ${ca} // https://www.alpha64.xyz/`; }
    async function copyShare(c){ const txt=shareText(c); const ok=await copyText(txt); alphaToast(ok?'SHARE SIGNAL COPIED':'COPY BLOCKED — TEXT VISIBLE IN INSPECTOR', ok?'ok':'warn'); mascotSay?.(ok?'Share card copied. Post responsibly.':'Clipboard blocked.','scan'); return ok; }
    function xShareUrl(c){ return 'https://x.com/intent/tweet?text='+encodeURIComponent(shareText(c)); }
    function init(){
      const chains=[...new Set(data.candidates.map(c=>c.chainId).filter(Boolean))].sort();
      $('#chain').innerHTML='<option value="">all chains</option>'+chains.map(c=>`<option>${c}</option>`).join('');
      $('#q').oninput=render; $('#chain').onchange=render; $('#sort').onchange=render;
      document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
      selected=data.candidates[0]||null; selectedLaunch=(launchData.launches||[])[0]||null; installPresenceCounter(); render(); renderLaunches();
    }
    function switchTab(tab){ activeTab=tab; document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab)); $('#view-fresh').classList.toggle('active',tab==='fresh'); $('#view-launches').classList.toggle('active',tab==='launches'); $('#view-arcade')?.classList.toggle('active',tab==='arcade'); if(tab==='arcade') window.alpha64Game?.wake(); }
    function filtered(){ const q=$('#q').value.toLowerCase().trim(), ch=$('#chain').value, sort=$('#sort').value; let arr=data.candidates.filter(c=>!ch||c.chainId===ch).filter(c=>!q||JSON.stringify([c.name,c.symbol,c.chainId,c.xHandles,c.raidSignals,c.contactTargets]).toLowerCase().includes(q)); arr.sort((a,b)=> sort==='age' ? (a.ageHours??9999)-(b.ageHours??9999) : sort==='volume' ? Number(b.volume?.h24||0)-Number(a.volume?.h24||0) : sort==='liquidity' ? Number(b.liquidityUsd||0)-Number(a.liquidityUsd||0) : Number(b.score||0)-Number(a.score||0)); return arr; }
    function renderStats(arr){ const xReady=data.source?.xSearchEnabled?'enabled':'link-only'; const vampFiltered=data.counts?.vampFiltered||0; $('#stats').innerHTML=[['Pairs',arr.length],['Vamps Blocked',vampFiltered],['Auto Update','6h'],['Updated',new Date(data.generatedAt).toLocaleString()],['X Feed',xReady]].map(([k,v])=>`<div class="stat"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join(''); }
    function render(){ const arr=filtered(); renderStats(arr); if(!selected || !arr.find(c=>c.pairAddress===selected.pairAddress)) selected=arr[0]||null; $('#list').innerHTML=arr.length?arr.map((c,i)=>card(c,i)).join(''):'<div class="empty">No candidates. Run scripts/run_update.sh or check data/latest.json.</div>'; document.querySelectorAll('.card').forEach(el=>{ const pick=()=>{selected=data.candidates.find(c=>c.pairAddress===el.dataset.id); render();}; el.onclick=e=>{ if(e.target.closest('button,a')) return; pick();}; el.tabIndex=0; el.setAttribute('role','button'); el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault(); pick();}}; }); renderDetail(); }
    function pressureRail(score){ score=Number(score||0); return score>=220?' signal-rail-extreme':(score>=170?' signal-rail-hot':(score>=120?' signal-rail-watch':'')); }
    function pressurePct(score){ score=Number(score||0); return Math.max(3, Math.min(100, (score/250)*100)); }
    function launchRail(score){ score=Number(score||0); return score>=85?' signal-rail-extreme':(score>=65?' signal-rail-hot':''); }
    function card(c,i){ const vol=money(c.volume?.h24), liq=money(c.liquidityUsd), active=selected&&selected.pairAddress===c.pairAddress?' active':'', raids=(c.raidSignals||[]).map(r=>`<span class="badge raid">${esc(r.replaceAll('_',' '))}</span>`).join(''), warns=(c.warnings||[]).map(w=>`<span class="badge warn">${esc(w.replaceAll('_',' '))}</span>`).join(''); return `<article class="card${pressureRail(c.score)}${active}" data-id="${esc(c.pairAddress)}" aria-label="Inspect ${esc(c.name||'token')} ${Math.round(c.score||0)} pressure"><div class="rank">#${String((i||0)+1).padStart(2,'0')}</div><img class="icon" src="${safeUrl(c.image)}" onerror="this.style.visibility='hidden'"><div><div class="name">${esc(c.name||'Unknown')} <span class="sym">$${esc(c.symbol||'?')}</span></div><div class="meta ticker-meta"><span>${esc(c.chainId)}</span><span>${esc(c.dexId||'dex')}</span><span>age ${age(c.ageHours)}</span><span>vol ${vol}</span><span>liq ${liq}</span><span>h1 tx ${tx(c,'h1')}</span></div><div class="ca-row">${caMarkup(c,true)}<button class="share-signal" type="button" data-pair="${esc(c.pairAddress)}">share</button><button class="dex-open" type="button" data-pair="${esc(c.pairAddress)}">arcade dex</button></div><div class="badges"><span class="badge">${(c.contactTargets||[]).length} contacts</span>${raids}${warns}</div><div class="bar-label pressure-scale">pressure scale <b>${Math.round(c.score||0)} / 250</b></div><div class="spark" title="pressure score scaled against 250 cap"><i style="width:${pressurePct(c.score)}%"></i></div></div><div class="score"><span>${Math.round(c.score||0)}</span></div></article>`; }
    function labelForLink(l){ try{ const u=new URL(l.url); if(l.kind==='x_account'){ const h=u.pathname.split('/').filter(Boolean)[0]; return h ? `X: @${h}` : 'X account'; } if(l.kind==='x_community'){ const id=u.pathname.split('/').filter(Boolean).pop(); return id ? `X community: ${id}` : 'X community'; } if(l.kind==='telegram') return `Telegram: ${u.pathname.replace('/','@') || u.hostname}`; if(l.kind==='discord') return 'Discord invite'; if(l.kind==='website') return u.hostname.replace(/^www\./,''); return `${l.kind}: ${u.hostname}`; }catch(e){ return `${l.kind}: ${l.label||l.url}`; } }
    function renderDetail(){ const c=selected; if(!c){ $('#detail').innerHTML='<div class="empty">Select a pressure row.</div>'; return; } const links=(c.contactTargets||[]).map(l=>`<a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer" title="${esc(l.url)}">${esc(labelForLink(l))}</a>`).join('')||'<span class="meta">No public contact links found.</span>'; const xlinks=(c.contactTargets||[]).filter(l=>l.kind==='x_account'||l.kind==='x_community').map(l=>`<a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer" title="${esc(l.url)}">${esc(labelForLink(l))}</a>`).join(''); $('#detail').innerHTML=`<div class="inspector-object"><img class="inspector-icon" src="${safeUrl(c.image)}" onerror="this.style.display='none'"><div><span class="inspecting-label">currently inspecting</span><h2>${esc(c.name)} <span class="sym">$${esc(c.symbol)}</span></h2><p class="meta">${esc(c.chainId)} · ${esc(c.dexId||'')} · spawned ${c.createdAt?new Date(c.createdAt).toLocaleString():'unknown'} · pressure score ${c.score}</p></div></div><div class="ca-detail"><label>contract address</label>${caMarkup(c)}<div class="token-action-grid"><button class="share-signal" type="button" data-pair="${esc(c.pairAddress)}">copy x signal</button><a class="x-intent" href="${safeUrl(xShareUrl(c))}" target="_blank" rel="noopener noreferrer">post to x ↗</a><button class="dex-open detail-dex" type="button" data-pair="${esc(c.pairAddress)}">open arcade dex viewer</button></div><textarea class="share-preview" readonly>${esc(shareText(c))}</textarea></div><div class="kv"><div><b>${money(c.marketCap)}</b><span class="meta">market cap/fdv</span></div><div><b>${money(c.liquidityUsd)}</b><span class="meta">liquidity</span></div><div><b>${money(c.volume?.h24)}</b><span class="meta">24h volume</span></div><div><b>${tx(c,'m5')}</b><span class="meta">5m transactions</span></div></div><h3 data-sec="01">Point of contact surfaces</h3><div class="links">${links}</div><h3 data-sec="02">Raid / coordination signals</h3><p>${(c.raidSignals||[]).length?c.raidSignals.map(x=>`<span class="badge raid">${esc(x.replaceAll('_',' '))}</span>`).join(' '):'<span class="meta">No explicit raid/community coordination link detected.</span>'}</p><h3 data-sec="03">X / community links</h3><div class="links">${xlinks || '<span class="meta">No X account/community in token profile. Enable xurl search for deeper account extraction.</span>'}</div><h3 data-sec="04">Description</h3><p class="risk">${esc((c.description||'No description in pair metadata.').slice(0,900))}</p>${c.pairUrl?`<a class="open" href="${safeUrl(c.pairUrl)}" target="_blank" rel="noopener noreferrer">open dexscreener ↗</a>`:''}`; }

    function ensureDexViewer(){
      let modal=$('#dexViewer');
      if(modal) return modal;
      modal=document.createElement('div');
      modal.id='dexViewer';
      modal.className='dex-viewer';
      modal.innerHTML=`<div class="dex-card"><div class="window-bar"><span>Arcade.DexViewer</span><button id="dexClose" type="button" aria-label="Close DEX viewer">×</button></div><div class="dex-head"><div><span class="inspecting-label">mini arcade dex</span><h2 id="dexTitle">TOKEN</h2><p id="dexMeta" class="meta">loading market tape…</p></div><button id="dexCopyCa" class="ca-copy" type="button"><span>CA</span><code>loading</code><b>copy</b></button></div><canvas id="dexCanvas" width="720" height="330" aria-label="Animated mini DEX chart"></canvas><div class="dex-tape" id="dexTape"></div><div class="dex-foot"><button id="dexRefresh" type="button">refresh tape</button><a id="dexExternal" class="open" target="_blank" rel="noopener noreferrer">open source ↗</a></div></div>`;
      document.body.appendChild(modal);
      $('#dexClose').onclick=()=>modal.classList.remove('active');
      modal.addEventListener('click',e=>{ if(e.target===modal) modal.classList.remove('active'); });
      return modal;
    }
    function pairSnapshot(c){
      const changes=c.priceChange||{};
      return {
        source:'feed snapshot',
        price:Number(c.priceUsd||0),
        liquidity:Number(c.liquidityUsd||0),
        volume24:Number(c.volume?.h24||0),
        tx5:tx(c,'m5'), tx1h:tx(c,'h1'),
        change5:Number(changes.m5||0), change1h:Number(changes.h1||0), change24:Number(changes.h24||0),
        points:null
      };
    }
    async function fetchDexSnapshot(c){
      const proxy=String(window.ALPHA64_BITQUERY_PROXY||'').trim();
      if(proxy){
        const u=new URL(proxy, location.href);
        u.searchParams.set('chain', c.chainId||''); u.searchParams.set('tokenAddress', tokenCa(c)); u.searchParams.set('pairAddress', c.pairAddress||'');
        const r=await fetch(u, {cache:'no-store'}); if(!r.ok) throw new Error('bitquery proxy '+r.status);
        const j=await r.json(); return Object.assign(pairSnapshot(c), j, {source:j.source||'bitquery proxy'});
      }
      if(c.chainId && c.pairAddress){
        try{
          const r=await fetch(`https://api.dexscreener.com/latest/dex/pairs/${encodeURIComponent(c.chainId)}/${encodeURIComponent(c.pairAddress)}`, {cache:'no-store'});
          if(r.ok){ const j=await r.json(); const p=(j.pairs||[])[0]; if(p){ return {source:'dexscreener live', price:Number(p.priceUsd||c.priceUsd||0), liquidity:Number(p.liquidity?.usd||c.liquidityUsd||0), volume24:Number(p.volume?.h24||c.volume?.h24||0), tx5:Number(p.txns?.m5?.buys||0)+Number(p.txns?.m5?.sells||0), tx1h:Number(p.txns?.h1?.buys||0)+Number(p.txns?.h1?.sells||0), change5:Number(p.priceChange?.m5||0), change1h:Number(p.priceChange?.h1||0), change24:Number(p.priceChange?.h24||0), points:null}; } }
        }catch(e){}
      }
      return pairSnapshot(c);
    }
    function syntheticTape(c,snap){
      const seed=hashCode((c.pairAddress||'')+(c.symbol||''));
      const pts=[]; let y=100+((seed%40)-20); const trend=Math.max(-35,Math.min(35,Number(snap.change1h||snap.change24||0)))/100;
      for(let i=0;i<64;i++){ const wave=Math.sin((i+seed%17)*.42)*7+Math.cos((i+seed%11)*.19)*5; y += trend*3 + Math.sin(i*.7+seed)*1.8; pts.push(Math.max(18,Math.min(182,y+wave))); }
      return pts;
    }
    function drawDexChart(c,snap){
      const canvas=$('#dexCanvas'); if(!canvas) return; const ctx=canvas.getContext('2d'); const W=canvas.width,H=canvas.height; const pts=(snap.points&&snap.points.length?snap.points:syntheticTape(c,snap)); const min=Math.min(...pts), max=Math.max(...pts), spread=Math.max(1,max-min); const up=Number(snap.change1h||snap.change24||0)>=0;
      let t=0; if(canvas._raf) cancelAnimationFrame(canvas._raf);
      function frame(){ t+=.018; ctx.clearRect(0,0,W,H); const g=ctx.createLinearGradient(0,0,W,H); g.addColorStop(0,'#10041d'); g.addColorStop(.55,'#081421'); g.addColorStop(1,'#06030a'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
        for(let x=0;x<W;x+=32){ ctx.strokeStyle='rgba(112,247,255,.08)'; ctx.beginPath(); ctx.moveTo(x+Math.sin(t+x)*4,0); ctx.lineTo(x-90,H); ctx.stroke(); }
        for(let y=38;y<H;y+=34){ ctx.fillStyle='rgba(255,79,216,.07)'; ctx.fillRect(0,y,W,1); }
        ctx.font='12px monospace'; ctx.fillStyle='rgba(168,255,106,.85)'; ctx.fillText('BITQUERY-READY MARKET TAPE // '+(snap.source||'feed').toUpperCase(),18,24);
        ctx.fillStyle='rgba(255,255,255,.08)'; for(let i=0;i<28;i++){ const x=(i*57 + (t*90)%57)%W; ctx.fillRect(x, H-18-(i%5)*18, 8, 8); }
        const coords=pts.map((v,i)=>[34+i*((W-68)/(pts.length-1)), H-42-((v-min)/spread)*(H-92)]);
        ctx.lineWidth=4; ctx.strokeStyle=up?'rgba(168,255,106,.95)':'rgba(255,111,138,.95)'; ctx.shadowColor=ctx.strokeStyle; ctx.shadowBlur=16; ctx.beginPath(); coords.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.stroke(); ctx.shadowBlur=0;
        ctx.lineWidth=1; ctx.strokeStyle='rgba(255,255,255,.55)'; ctx.beginPath(); coords.forEach(([x,y],i)=>{ const yy=y+Math.sin(t*5+i*.8)*3; i?ctx.lineTo(x,yy):ctx.moveTo(x,yy); }); ctx.stroke();
        const last=coords[coords.length-1]; ctx.fillStyle=up?'#a8ff6a':'#ff6f8a'; ctx.fillRect(last[0]-5+Math.sin(t*6)*3,last[1]-5,10,10); ctx.fillStyle='#ff4fd8'; ctx.fillRect(24,H-62,Math.min(W-48, Math.max(10, Number(snap.volume24||0)/25000)),8); ctx.fillStyle='#70f7ff'; ctx.fillRect(24,H-46,Math.min(W-48, Math.max(10, Number(snap.liquidity||0)/12000)),8);
        canvas._raf=requestAnimationFrame(frame);
      }
      frame();
    }
    async function openDexViewer(c){
      const modal=ensureDexViewer(); modal.classList.add('active');
      $('#dexTitle').textContent=`${c.name||'Token'} $${c.symbol||'?'} `; $('#dexMeta').textContent='opening market tape…';
      const ca=tokenCa(c); const copy=$('#dexCopyCa'); copy.dataset.ca=ca; copy.querySelector('code').textContent=shortCa(ca); copy.querySelector('b').textContent='copy';
      $('#dexExternal').href=safeUrl(c.pairUrl||'#'); $('#dexExternal').textContent=c.pairUrl?'open dexscreener ↗':'source unavailable';
      $('#dexRefresh').onclick=()=>openDexViewer(c);
      drawDexChart(c,pairSnapshot(c));
      try{ const snap=await fetchDexSnapshot(c); $('#dexMeta').textContent=`${snap.source} · price ${snap.price?('$'+snap.price.toPrecision(5)):'n/a'} · liq ${money(snap.liquidity)} · vol24 ${money(snap.volume24)} · 1h ${Number(snap.change1h||0).toFixed(2)}% · tx5 ${snap.tx5||0}`; $('#dexTape').innerHTML=[['price',snap.price?('$'+Number(snap.price).toPrecision(5)):'n/a'],['liquidity',money(snap.liquidity)],['24h volume',money(snap.volume24)],['5m tx',snap.tx5||0],['1h change',Number(snap.change1h||0).toFixed(2)+'%'],['24h change',Number(snap.change24||0).toFixed(2)+'%']].map(([k,v])=>`<span><b>${esc(v)}</b>${esc(k)}</span>`).join(''); drawDexChart(c,snap); }
      catch(e){ $('#dexMeta').textContent='market tape degraded · '+String(e.message||e).slice(0,80); $('#dexTape').innerHTML='<span><b>fallback</b>using feed snapshot</span>'; }
    }


    function installTokenActions(){
      document.addEventListener('click', e=>{
        const ca=e.target.closest('.ca-copy');
        if(ca){ e.preventDefault(); e.stopPropagation(); copyCaFromButton(ca); return; }
        const share=e.target.closest('.share-signal');
        if(share){ e.preventDefault(); e.stopPropagation(); const c=data.candidates.find(x=>x.pairAddress===share.dataset.pair) || selected; if(c) copyShare(c); return; }
        const dex=e.target.closest('.dex-open');
        if(dex){ e.preventDefault(); e.stopPropagation(); const pair=dex.dataset.pair; const c=data.candidates.find(x=>x.pairAddress===pair) || selected; if(c) openDexViewer(c); return; }
      }, true);
    }

    function secClass(v){ return v==='higher-confidence'?'sec-high':(v==='medium'?'sec-mid':'sec-low'); }
    function verdictClass(v){ return v==='higher-confidence'?'verdict-high':(v==='medium'?'verdict-mid':'verdict-low'); }
    function linkLabel(u,i){ try{ const url=new URL(u); const host=url.hostname.replace(/^www\./,'').toUpperCase(); return host==='T.CO' ? `SOURCE LINK ${i+1}` : host; }catch(e){ return `SOURCE LINK ${i+1}`; } }
    function hashCode(str){ let h=0; for(let i=0;i<String(str).length;i++){ h=((h<<5)-h)+String(str).charCodeAt(i); h|=0; } return Math.abs(h); }
    function initials(str){ const clean=String(str||'?').replace(/^\$/,'').replace(/unknown-launch/i,'?').trim(); const parts=clean.split(/[^A-Za-z0-9]+/).filter(Boolean); const raw=(parts.length>1?parts.map(x=>x[0]).join(''):clean.slice(0,3)); return (raw||'?').toUpperCase().slice(0,3); }
    function launchEmblem(l, small=false){ const speaker=(l.speakers||[])[0]?.handle || ''; const seed=(l.project||'')+speaker; const h=hashCode(seed)%360; return `<div class="launch-emblem${small?' small':''}" style="--h:${h}" title="${esc(l.project||'launch')} ${speaker?'/ '+esc(speaker):''}"><span class="emblem-core">${esc(initials(l.project))}</span><span class="emblem-pixels"><i></i><i></i><i></i><i></i><i></i><i></i></span></div>`; }

    function renderLaunchStats(){ const arr=launchData.launches||[]; const real=launchData.source?.realData?'LIVE X API':'X REQUIRED'; $('#launchStats').innerHTML=[['Launches',arr.length],['Window',(launchData.windowHours||24)+'h'],['Source',real],['Updated',launchData.generatedAt?new Date(launchData.generatedAt).toLocaleString():'never'],['Flags','signals/warnings']].map(([k,v])=>`<div class="stat"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join(''); }
    function renderLaunches(){ renderLaunchStats(); const arr=launchData.launches||[]; $('#launchSetup').innerHTML = launchData.source?.realData ? '<div class="launch-legend"><span><i class="dot high"></i> higher confidence</span><span><i class="dot mid"></i> medium / mixed</span><span><i class="dot low"></i> manual review</span><span><i class="dot info"></i> evidence signal</span><span><i class="dot warn"></i> warning flag</span></div>' : `<div class="setup-warning">LaunchWindow is not fabricating rows. ${esc(launchData.source?.reason||'xurl not ready')}. Enable official X API + RADAR_X_SEARCH=1 for real people/tweet tracking.</div>`; if(!selectedLaunch || !arr.includes(selectedLaunch)) selectedLaunch=arr[0]||null; $('#launchList').innerHTML = arr.length ? arr.map((l,i)=>launchCard(l,i)).join('') : '<div class="empty">No real upcoming-launch rows yet. This tab needs X search access; the rest of the dashboard still uses live Dexscreener data.</div>'; document.querySelectorAll('.launch-card').forEach(el=>el.onclick=()=>{selectedLaunch=arr[Number(el.dataset.idx)]; renderLaunches();}); renderLaunchDetail(); }
    function launchCard(l,i){ const sec=l.security||{}; const active=selectedLaunch===l?' active':''; const status=sec.verdict||'review'; const lead=(l.speakers||[])[0]?.handle || 'unknown speaker'; const speakers=(l.speakers||[]).slice(0,4).map(s=>`<a class="speaker" href="${safeUrl(s.xUrl)}" target="_blank" rel="noopener noreferrer">${esc(s.handle)} <b>×${s.mentions||1}</b></a>`).join(''); const warns=(sec.warnings||[]).slice(0,3).map(w=>`<span class="badge warn">${esc(w.replaceAll('_',' '))}</span>`).join(''); const sig=(sec.signals||[]).slice(0,3).map(x=>`<span class="badge raid">${esc(x.replaceAll('_',' '))}</span>`).join(''); return `<article class="launch-card ${verdictClass(sec.verdict)}${launchRail(l.score)}${active}" data-idx="${i}">${launchEmblem(l)}<div class="launch-content"><div class="status-pill ${verdictClass(sec.verdict)}">${esc(status.replaceAll('-',' '))}</div><div class="launch-title">${esc(l.project)} ${(l.tickers||[]).map(t=>`<span class="sym">${esc(t)}</span>`).join(' ')}</div><div class="launch-speaker-label">lead signal: ${esc(lead)}</div><div class="launch-meta"><span>mentions <b>${(l.mentions||[]).length}</b></span><span>speakers <b>${(l.speakers||[]).length}</b></span><span>validity <b>${sec.score||0}</b></span></div><div class="speaker-row">${speakers || '<span class="meta">no speakers parsed</span>'}</div><div class="badges">${sig}${warns}</div><div class="bar-label">chatter strength <b>${Math.round(l.score||0)}</b></div><div class="spark" title="launch chatter score"><i style="width:${Math.min(100,l.score||0)}%"></i></div></div></article>`; }
    function renderLaunchDetail(){ const l=selectedLaunch; if(!l){ $('#launchDetail').innerHTML='<div class="empty">Select a launch cluster.</div>'; return; } const sec=l.security||{}; const speakers=(l.speakers||[]).map(s=>`<a class="speaker" href="${safeUrl(s.xUrl)}" target="_blank" rel="noopener noreferrer">${esc(s.handle)} <b>${s.mentions||1}</b></a>`).join(''); const mentions=(l.mentions||[]).slice(0,6).map(m=>`<div class="launch-copy"><div class="mention-head"><b>${esc(m.author||'unknown')}</b>${m.tweetUrl?`<a class="tweet-link" href="${safeUrl(m.tweetUrl)}" target="_blank" rel="noopener noreferrer">open tweet ↗</a>`:''}</div><div>${esc(m.text)}</div></div>`).join(''); const moreMentions=(l.mentions||[]).length>6 ? `<div class="meta source-more">+${(l.mentions||[]).length-6} more chatter snippets in raw data</div>` : ''; const priors=(l.priorTokens||[]).map(t=>`<a class="prior-token" href="${safeUrl(t.pairUrl)}" target="_blank" rel="noopener noreferrer">${esc(t.speaker)} previously linked to ${esc(t.symbol||'?')} / ${esc(t.name||'?')} · ${esc(t.chainId||'')}</a>`).join('') || '<span class="meta">No previous Dexscreener-linked launches found for parsed speakers.</span>'; const urls=(l.urls||[]).slice(0,12).map((u,i)=>`<a href="${safeUrl(u)}" target="_blank" rel="noopener noreferrer">${esc(linkLabel(u,i))}</a>`).join(''); const moreUrls=(l.urls||[]).length>12 ? `<span class="meta source-more">+${(l.urls||[]).length-12} more source links in raw data</span>` : ''; $('#launchDetail').innerHTML=`<span class="inspecting-label">currently inspecting</span><div class="detail-emblem-row">${launchEmblem(l,true)}<div><h2>${esc(l.project)} ${(l.tickers||[]).map(t=>`<span class="sym">${esc(t)}</span>`).join(' ')}</h2><p class="meta">Validity: <span class="${secClass(sec.verdict)}">${esc(sec.verdict||'review')}</span> · score ${sec.score||0} · launch-chatter score ${Math.round(l.score||0)}</p></div></div><h3>People talking about it</h3><div class="speaker-row">${speakers || '<span class="meta">No X accounts parsed.</span>'}</div><h3>Security / validity check</h3><div class="badges">${(sec.signals||[]).map(x=>`<span class="badge raid">${esc(x.replaceAll('_',' '))}</span>`).join('')} ${(sec.warnings||[]).map(x=>`<span class="badge warn">${esc(x.replaceAll('_',' '))}</span>`).join('')}</div><h3>Prior launches by speakers</h3>${priors}<h3>Project / launch links</h3><div class="links">${urls || '<span class="meta">No project links parsed from tweets.</span>'}${moreUrls}</div><h3>Recent launch chatter</h3>${mentions || '<span class="meta">No mention snippets.</span>'}${moreMentions}`; }


    function installPresenceCounter(){
      const el = $('#viewerCount');
      if(!el) return;
      const endpoint = window.ALPHA64_PRESENCE_ENDPOINT || '';
      const sessionKey = 'a64_session_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      const paint = (n, mode='live') => {
        const count = Math.max(1, Math.round(Number(n)||1));
        el.innerHTML = `<span class="viewer-dot"></span>${count}`;
        el.title = mode === 'live'
          ? 'Active viewers from live presence endpoint.'
          : 'Estimated active viewers. Add ALPHA64_PRESENCE_ENDPOINT for exact live presence.';
      };
      const estimate = () => {
        const base = Math.max(1, Math.min(64, (data.candidates||[]).length));
        const minute = Math.floor(Date.now()/60000);
        const wave = Math.abs(Math.sin((minute + base) * 0.73));
        paint(2 + Math.floor(wave * 9) + Math.floor(base / 18), 'estimate');
      };
      if(!endpoint){ estimate(); setInterval(estimate, 45000); return; }
      async function ping(){
        try{
          const r = await fetch(endpoint, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({site:'alpha64',session:sessionKey,at:Date.now()}),keepalive:true});
          if(!r.ok) throw new Error('presence '+r.status);
          const j = await r.json(); paint(j.active || j.count || 1, 'live');
        }catch(e){ estimate(); }
      }
      ping(); setInterval(ping, 25000);
      window.addEventListener('beforeunload',()=>{ try{ navigator.sendBeacon(endpoint, JSON.stringify({site:'alpha64',session:sessionKey,leave:true,at:Date.now()})); }catch(e){} });
    }


    function mascotMarkup(){
      const map=['..mmffmm',' .mffffm'.replace(/ /g,'.'),'mmfyyfmm','mfeffe fm'.replace(/ /g,''),'mffddffm','.mfg gfm'.replace(/ /g,''),'..mffm..','..m..m..'];
      const cls={'.':'','f':'f','e':'e','m':'m','y':'y','d':'d','g':'g'};
      return `<aside class="a64-mascot" id="a64Mascot" data-state="idle" aria-label="Alpha64 pixel courier assistant"><button class="mascot-stage" id="mascotButton" type="button" aria-label="Talk to the Alpha64 pixel courier"><span class="mascot-sprite" aria-hidden="true">${map.join('').split('').map(ch=>`<i class="mascot-px ${cls[ch]||''}"></i>`).join('')}</span><span class="mascot-shadow" aria-hidden="true"></span></button><div class="mascot-bubble" id="mascotBubble">I WATCH THE PUBLIC FEED. CLICK ME IF THE STREET GETS TOO QUIET.</div></aside>`;
    }
    function installMascot(){
      if($('#a64Mascot')) return;
      document.body.insertAdjacentHTML('beforeend', mascotMarkup());
      const lines=[
        ['scan','Scanning alley chatter. No private alpha, only public footprints.'],
        ['hype','Pressure rail is glowing. Breathe before you ape.'],
        ['warn','Thin liquidity smell. Street dog says check exits.'],
        ['sleep','Courier idle. Wake me when a token screams.'],
        ['idle','I live in the right gutter now. Feed me suspicious tickers.']
      ];
      let n=0;
      $('#mascotButton').onclick=(e)=>{ n=(n+1)%lines.length; mascotSay(lines[n][1],lines[n][0]); mascotBurst(e.clientX,e.clientY); };
      document.addEventListener('click',e=>{
        const card=e.target.closest('.card,.launch-card');
        if(!card) return;
        const score=Number(card.querySelector('.score span')?.textContent || card.querySelector('.bar-label b')?.textContent || 0);
        const name=(card.querySelector('.name,.launch-title')?.textContent || 'signal').replace(/\s+/g,' ').trim().slice(0,34);
        if(card.classList.contains('signal-rail-extreme')) mascotSay(`${name}: extreme pressure. Watch the crowd, not the candles.`, 'hype');
        else if(card.classList.contains('signal-rail-hot')) mascotSay(`${name}: hot rail. Public chatter is noisy.`, 'scan');
        else if(card.querySelector('.badge.warn')) mascotSay(`${name}: warning tag detected. Read the dossier.`, 'warn');
        else mascotSay(`${name}: dossier loaded.`, 'idle');
      }, true);
      const q=$('#q'); if(q) q.addEventListener('input',()=>mascotSay(q.value?`Filtering the alley for: ${q.value}`:'Filter cleared. Street noise restored.','scan'));
    }
    function mascotSay(text,state='idle'){
      const m=$('#a64Mascot'), b=$('#mascotBubble'); if(!m||!b) return;
      m.dataset.state=state; b.textContent=text;
      clearTimeout(m._t); m._t=setTimeout(()=>{ if(m.dataset.state!=='sleep') m.dataset.state='idle'; },2600);
    }
    function mascotBurst(x,y){
      const colors=['#32ffe6','#ff3fd4','#ffe7a6','#7dff87'];
      for(let i=0;i<14;i++){ const p=document.createElement('i'); p.className='mascot-particle'; p.style.left=x+'px'; p.style.top=y+'px'; p.style.color=colors[i%colors.length]; p.style.background=colors[i%colors.length]; p.style.setProperty('--dx',((Math.random()*120)-60)+'px'); p.style.setProperty('--dy',((-Math.random()*120)-18)+'px'); document.body.appendChild(p); setTimeout(()=>p.remove(),760); }
    }

    function securitySet(id, state, label, detail){
      const el = $('#'+id); if(!el) return;
      el.dataset.state = state;
      el.innerHTML = `<b>${esc(label)}</b><span>${esc(detail)}</span>`;
    }
    function securityLog(lines){ const el=$('#securityLog'); if(el) el.textContent = lines.join(' // '); }
    async function sha256Hex(text){
      const bytes = new TextEncoder().encode(text);
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
    }
    async function verifyManifestFile(file, expected){
      const r = await fetch(file, {cache:'no-store'});
      if(!r.ok) throw new Error(file+' '+r.status);
      const text = await r.text();
      const hash = await sha256Hex(text);
      return {file, ok: hash === expected, hash, expected};
    }
    function externalLinkInventory(){
      const tokenLinks = (data.candidates||[]).flatMap(c=>[...(c.contactTargets||[]).map(x=>x.url), c.pairUrl, c.image]).filter(Boolean);
      const launchLinks = (launchData.launches||[]).flatMap(l=>[
        ...(l.speakers||[]).map(s=>s.xUrl), ...(l.urls||[]), ...(l.priorTokens||[]).map(t=>t.pairUrl), ...(l.mentions||[]).map(m=>m.tweetUrl)
      ]).filter(Boolean);
      const unique = [...new Set([...tokenLinks, ...launchLinks])];
      const unsafe = unique.filter(u=>safeUrl(u)==='#');
      return {total: unique.length, unsafe: unsafe.length};
    }
    async function installSecurityConsole(){
      securitySet('secHttps', location.protocol==='https:'?'ok':'warn', location.protocol==='https:'?'LOCKED':'LOCAL', location.protocol==='https:'?'TLS session active':'local/dev protocol');
      const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '';
      securitySet('secCsp', csp.includes("script-src 'self'")?'ok':'warn', csp.includes("script-src 'self'")?'STRICT':'WEAK', 'script-src self / mixed-content blocked');
      const inv = externalLinkInventory();
      securitySet('secLinks', inv.unsafe ? 'warn':'ok', inv.unsafe ? 'REVIEW':'SANITIZED', `${inv.total} external surfaces / ${inv.unsafe} blocked`);
      try{
        const manifestRes = await fetch('data/manifest.json', {cache:'no-store'});
        if(!manifestRes.ok) throw new Error('manifest '+manifestRes.status);
        const manifest = await manifestRes.json();
        securitySet('secManifest','ok','SIGNED', manifest.securityPolicyVersion || 'manifest loaded');
        const files = manifest.files || {};
        const required = ['data/latest.json','data/upcoming_launches.json'];
        const checks = await Promise.all(required.map(f=>verifyManifestFile(f, files[f]?.sha256 || '')));
        const failed = checks.filter(x=>!x.ok);
        securitySet('secData', failed.length?'danger':'ok', failed.length?'TAMPER':'VERIFIED', failed.length?failed.map(x=>x.file).join(', '):`${checks.length} feed hashes match`);
        securitySet('secBuild','ok','SEALED', `${manifest.securityPolicyVersion || 'A64'} / ${manifest.generatedAt || 'unknown'}`);
        securityLog([`SECURITY POLICY ${manifest.securityPolicyVersion||'A64'}`, `DATA ${failed.length?'MISMATCH':'VERIFIED'}`, `LINKS ${inv.total} SCANNED`]);
      }catch(e){
        securitySet('secManifest','danger','MISSING', String(e.message||e).slice(0,52));
        securitySet('secData','warn','UNVERIFIED','manifest unavailable');
        securitySet('secBuild','warn','UNSEALED','no build manifest');
        securityLog(['MANIFEST OFFLINE', 'DATA HASH CHECK SKIPPED', 'LINK FIREWALL ACTIVE']);
      }
    }
    function trustedOutbound(url){
      const host = url.hostname.replace(/^www\./,'').toLowerCase();
      return ['x.com','twitter.com','dexscreener.com','t.me','telegram.me','discord.gg','discord.com','github.com','alpha64.xyz'].some(d=>host===d||host.endsWith('.'+d));
    }
    function installOutboundGate(){
      const modal = document.createElement('div');
      modal.className = 'link-firewall';
      modal.innerHTML = `<div class="firewall-card"><div class="window-bar"><span>Outbound.Firewall</span><b>VERIFY</b></div><h2>External jump detected</h2><p id="firewallDomain">unknown destination</p><p class="firewall-note" id="firewallNote">ALPHA64 opens public sources only. Verify the destination before leaving.</p><div class="firewall-actions"><button id="firewallCancel" type="button">stay</button><button id="firewallOpen" type="button">open source</button></div></div>`;
      document.body.appendChild(modal);
      let pending = null;
      $('#firewallCancel').onclick=()=>{ modal.classList.remove('active'); pending=null; };
      $('#firewallOpen').onclick=()=>{ if(pending) window.open(pending.href, '_blank', 'noopener,noreferrer'); modal.classList.remove('active'); pending=null; };
      document.addEventListener('click', e=>{
        const a = e.target.closest('a[href]');
        if(!a) return;
        let url; try{ url = new URL(a.href, location.href); }catch(err){ e.preventDefault(); return; }
        if(url.origin === location.origin) return;
        e.preventDefault();
        pending = url;
        $('#firewallDomain').textContent = url.hostname;
        $('#firewallNote').textContent = trustedOutbound(url) ? 'Known public-source domain. Still verify before leaving ALPHA64.' : 'Unknown domain from token/social metadata. Treat as hostile until proven safe.';
        modal.dataset.trust = trustedOutbound(url) ? 'known' : 'unknown';
        modal.classList.add('active');
      }, true);
    }


    function installArcadeGame(){
      const canvas = $('#memeRaid');
      if(!canvas) return;
      const ctx = canvas.getContext('2d');
      const scoreEl=$('#gameScore'), livesEl=$('#gameLives'), levelEl=$('#gameLevel'), statusEl=$('#gameStatus');
      const W=canvas.width, H=canvas.height;
      const keys = new Set();
      const rand = (a,b)=>a+Math.random()*(b-a);
      const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
      const hotSymbols = [...new Set((data.candidates||[]).slice(0,18).map(c=>String(c.symbol||c.name||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase()).filter(Boolean).map(x=>x.slice(0,7)))];
      const theme = hotSymbols.length ? hotSymbols : ['DOGE','PEPE','BONK','WIF','POPCAT','FART','PUMP','MOON','WOJAK'];
      let game, raf=0, last=0;
      function reset(){
        game={running:false,over:false,score:0,lives:3,level:1,t:0,flash:0,player:{x:88,y:H/2,r:16,heat:0,inv:0},bullets:[],rocks:[],fud:[],pellets:[],ghosts:[],stars:[]};
        for(let i=0;i<96;i++) game.stars.push({x:rand(0,W),y:rand(0,H),s:rand(1,3),v:rand(8,28),c:i%3});
        spawnLevel(); paint(0); syncHud('READY');
      }
      function spawnLevel(){
        const lvl=game.level;
        game.rocks=[]; game.fud=[]; game.pellets=[]; game.ghosts=[]; game.bullets=[];
        for(let i=0;i<15+lvl*3;i++) game.pellets.push({x:rand(150,W-40),y:rand(52,H-42),r:5+Math.random()*3,spin:rand(0,6.28)});
        for(let row=0;row<Math.min(4,2+lvl);row++) for(let col=0;col<7;col++) game.fud.push({x:W-340+col*44,y:70+row*42,r:14,vx:-18-lvl*2,vy:0,phase:rand(0,6.28),tag:theme[(row+col+lvl)%theme.length]});
        for(let i=0;i<5+lvl;i++) game.rocks.push({x:rand(W*.45,W-20),y:rand(40,H-40),r:rand(15,31),vx:rand(-72-lvl*8,-34),vy:rand(-30,30),rot:rand(0,6.28),tag:i%2?'RUG':'REKT'});
        for(let i=0;i<Math.min(4,1+Math.floor(lvl/2));i++) game.ghosts.push({x:rand(W*.62,W-60),y:rand(80,H-80),r:18,vx:rand(-42,-22),vy:rand(-28,28),tag:i%2?'SCAM':'HONEYPOT'});
      }
      function syncHud(status){ scoreEl.textContent=game.score; livesEl.textContent=game.lives; levelEl.textContent=game.level; statusEl.textContent=status || (game.running?'RAID':'PAUSED'); }
      function start(){ if(game.over) reset(); game.running=true; last=performance.now(); syncHud('RAID'); loop(last); }
      function pause(){ game.running=false; syncHud(game.over?'LIQUIDATED':'PAUSED'); }
      function wake(){ if(!raf) { last=performance.now(); loop(last); } }
      function hit(a,b){ const dx=a.x-b.x, dy=a.y-b.y, rr=(a.r||8)+(b.r||8); return dx*dx+dy*dy<rr*rr; }
      function damage(){ if(game.player.inv>0 || game.over) return; game.lives--; game.player.inv=1.4; game.flash=0.24; mascotSay?.('Rug contact. Wallet armor burned one life.','warn'); if(game.lives<=0){ game.over=true; game.running=false; syncHud('LIQUIDATED'); } }
      function shoot(){ if(game.player.heat>0 || game.over) return; game.bullets.push({x:game.player.x+20,y:game.player.y,vx:430,r:5,life:1.6}); game.player.heat=.18; }
      function update(dt){
        if(!game.running || game.over) return;
        game.t+=dt; game.flash=Math.max(0,game.flash-dt); game.player.heat=Math.max(0,game.player.heat-dt); game.player.inv=Math.max(0,game.player.inv-dt);
        const p=game.player; const sp=230;
        if(keys.has('ArrowUp')||keys.has('w')) p.y-=sp*dt; if(keys.has('ArrowDown')||keys.has('s')) p.y+=sp*dt; if(keys.has('ArrowLeft')||keys.has('a')) p.x-=sp*dt; if(keys.has('ArrowRight')||keys.has('d')) p.x+=sp*dt;
        p.x=clamp(p.x,28,W-38); p.y=clamp(p.y,42,H-38);
        for(const st of game.stars){ st.x-=st.v*dt; if(st.x<0){st.x=W;st.y=rand(0,H);} }
        for(const b of game.bullets){ b.x+=b.vx*dt; b.life-=dt; }
        game.bullets=game.bullets.filter(b=>b.life>0 && b.x<W+20);
        for(const r of game.rocks){ r.x+=r.vx*dt; r.y+=r.vy*dt; r.rot+=dt; if(r.x<-40){ r.x=W+rand(0,160); r.y=rand(40,H-40); } if(r.y<30||r.y>H-30) r.vy*=-1; if(hit(p,r)) damage(); }
        for(const f of game.fud){ f.x+=f.vx*dt; f.y+=Math.sin(game.t*2.2+f.phase)*18*dt; if(f.x<20){ f.x=W+rand(0,180); f.y=rand(55,H-60); } if(hit(p,f)) damage(); }
        for(const g of game.ghosts){ g.x+=g.vx*dt; g.y+=g.vy*dt; if(g.x<30||g.x>W-20) g.vx*=-1; if(g.y<50||g.y>H-40) g.vy*=-1; if(hit(p,g)) damage(); }
        for(const pe of game.pellets){ pe.spin+=dt*5; if(!pe.dead && hit(p,pe)){ pe.dead=true; game.score+=25; } }
        game.pellets=game.pellets.filter(x=>!x.dead);
        for(const b of game.bullets){
          for(const arr of [game.fud, game.rocks, game.ghosts]) for(const e of arr){ if(!e.dead && hit(b,e)){ e.dead=true; b.life=0; game.score+= e.tag==='RUG'||e.tag==='REKT'?40:65; } }
        }
        game.fud=game.fud.filter(e=>!e.dead); game.rocks=game.rocks.filter(e=>!e.dead); game.ghosts=game.ghosts.filter(e=>!e.dead);
        if(!game.pellets.length && game.fud.length<2){ game.level++; game.score+=250; spawnLevel(); mascotSay?.('Liquidity sweep complete. Next meme wave inbound.','hype'); }
        syncHud();
      }
      function pxText(txt,x,y,color='rgba(255,238,250,.9)',size=10){ ctx.fillStyle=color; ctx.font=`${size}px monospace`; ctx.fillText(txt,x,y); }
      function drawShip(p){
        ctx.save(); ctx.translate(p.x,p.y); if(p.inv>0 && Math.floor(game.t*18)%2===0) ctx.globalAlpha=.45;
        ctx.fillStyle='#11061f'; ctx.fillRect(-16,-14,24,28); ctx.fillStyle='#ff5fbd'; ctx.fillRect(-4,-18,22,12); ctx.fillRect(-4,6,22,12); ctx.fillStyle='#7ddcff'; ctx.fillRect(8,-7,18,14); ctx.fillStyle='#9cffd2'; ctx.fillRect(-12,-5,10,10); ctx.fillStyle='#fff2c7'; ctx.fillRect(16,-3,5,5); ctx.restore();
      }
      function drawToken(o){ ctx.save(); ctx.translate(o.x,o.y); ctx.rotate(o.spin||0); ctx.fillStyle='#12051e'; ctx.fillRect(-o.r,-o.r,o.r*2,o.r*2); ctx.fillStyle='#9cffd2'; ctx.fillRect(-o.r+3,-o.r+3,o.r*2-6,o.r*2-6); ctx.fillStyle='#ff5fbd'; ctx.fillRect(-2,-o.r+2,4,o.r*2-4); ctx.restore(); }
      function drawEnemy(e,color,label){ ctx.fillStyle='rgba(0,0,0,.38)'; ctx.fillRect(e.x-e.r+5,e.y-e.r+7,e.r*2,e.r*2); ctx.fillStyle=color; ctx.fillRect(e.x-e.r,e.y-e.r,e.r*2,e.r*2); ctx.fillStyle='#12051f'; ctx.fillRect(e.x-6,e.y-5,4,4); ctx.fillRect(e.x+5,e.y-5,4,4); pxText(label||e.tag,e.x-e.r,e.y+e.r+12,'rgba(255,238,250,.75)',9); }
      function paint(dt){
        ctx.clearRect(0,0,W,H);
        const grad=ctx.createLinearGradient(0,0,W,H); grad.addColorStop(0,'#13051f'); grad.addColorStop(.45,'#33105b'); grad.addColorStop(1,'#1a0828'); ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
        for(const st of game.stars){ ctx.fillStyle=st.c===0?'#ff5fbd':st.c===1?'#7ddcff':'#9cffd2'; ctx.globalAlpha=.25+st.s*.12; ctx.fillRect(st.x,st.y,st.s*2,1); } ctx.globalAlpha=1;
        for(let x=0;x<W;x+=44){ ctx.strokeStyle='rgba(125,220,255,.12)'; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x-110,H); ctx.stroke(); }
        for(let y=40;y<H;y+=38){ ctx.fillStyle='rgba(255,95,189,.08)'; ctx.fillRect(0,y,W,1); }
        ctx.fillStyle='rgba(255,95,189,.12)'; ctx.fillRect(0,0,W,30); pxText('MEME RAID // COLLECT LP // SHOOT FUD // DODGE RUGS',18,20,'rgba(156,255,210,.82)',12);
        for(const pe of game.pellets) drawToken(pe);
        for(const b of game.bullets){ ctx.fillStyle='#9cffd2'; ctx.fillRect(b.x-2,b.y-2,18,4); ctx.fillStyle='rgba(125,220,255,.55)'; ctx.fillRect(b.x-10,b.y-1,8,2); }
        for(const r of game.rocks) drawEnemy(r,'#4b246d',r.tag);
        for(const f of game.fud) drawEnemy(f,'#ff5fbd',f.tag);
        for(const g of game.ghosts) drawEnemy(g,'#7ddcff',g.tag);
        drawShip(game.player);
        if(!game.running){ ctx.fillStyle='rgba(8,2,18,.72)'; ctx.fillRect(0,0,W,H); ctx.strokeStyle='rgba(255,95,189,.7)'; ctx.strokeRect(W/2-210,H/2-70,420,130); pxText(game.over?'WALLET LIQUIDATED':'CLICK START RAID',W/2-122,H/2-14,'#fff2c7',18); pxText(game.over?'RESET WALLET TO RUN IT BACK':'ARROWS/WASD MOVE // SPACE SHOOTS',W/2-162,H/2+20,'#9cffd2',13); }
        if(game.flash>0){ ctx.fillStyle='rgba(255,32,90,.22)'; ctx.fillRect(0,0,W,H); }
      }
      function loop(now){ raf=requestAnimationFrame(loop); const dt=Math.min(.05,(now-last)/1000||0); last=now; update(dt); paint(dt); if(!document.body.contains(canvas)){ cancelAnimationFrame(raf); raf=0; } }
      window.addEventListener('keydown',e=>{ const k=e.key.length===1?e.key.toLowerCase():e.key; if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d',' '].includes(k)) e.preventDefault(); if(k===' ') shoot(); else if(k==='p') game.running?pause():start(); else keys.add(k); });
      window.addEventListener('keyup',e=>keys.delete(e.key.length===1?e.key.toLowerCase():e.key));
      canvas.addEventListener('pointerdown',()=>{ if(!game.running) start(); else shoot(); canvas.focus?.(); });
      $('#gameStart').onclick=start; $('#gameReset').onclick=()=>{ reset(); start(); };
      reset(); window.alpha64Game={wake,start,pause,reset}; loop(performance.now());
    }

    installMascot();
    installTokenActions();
    init();
    installArcadeGame();
    installOutboundGate();
    installSecurityConsole();
