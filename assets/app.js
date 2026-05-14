const data = window.MEMECOIN_RADAR_DATA || {candidates:[], counts:{}, source:{}};
    const launchData = window.MEMECOIN_UPCOMING_LAUNCHES || {launches:[], source:{realData:false, reason:'not loaded'}, instructions:[]};
    let selected = null, selectedLaunch = null, activeTab = 'fresh';
    const $ = s => document.querySelector(s);
    function money(n){ n=Number(n||0); if(!n) return '$0'; if(n>=1e6) return '$'+(n/1e6).toFixed(2)+'M'; if(n>=1e3) return '$'+(n/1e3).toFixed(1)+'K'; return '$'+n.toFixed(0); }
    function age(h){ if(h==null) return 'unknown'; if(h<1) return Math.round(h*60)+'m'; if(h<48) return h.toFixed(1)+'h'; return (h/24).toFixed(1)+'d'; }
    function tx(pair, w){ const t=pair.txns?.[w]||{}; return Number(t.buys||0)+Number(t.sells||0); }
    function esc(s){ return String(s??'').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
    function safeUrl(s){ try{ const raw=String(s??'').trim(); if(!raw) return ''; const u=new URL(raw, location.href); return ['http:','https:'].includes(u.protocol) ? esc(u.href) : '#'; }catch(e){ return '#'; } }
    function init(){
      const chains=[...new Set(data.candidates.map(c=>c.chainId).filter(Boolean))].sort();
      $('#chain').innerHTML='<option value="">all chains</option>'+chains.map(c=>`<option>${c}</option>`).join('');
      $('#q').oninput=render; $('#chain').onchange=render; $('#sort').onchange=render; $('#refresh').onclick=()=>location.reload();
      document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
      selected=data.candidates[0]||null; selectedLaunch=(launchData.launches||[])[0]||null; installPresenceCounter(); render(); renderLaunches();
    }
    function switchTab(tab){ activeTab=tab; document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab)); $('#view-fresh').classList.toggle('active',tab==='fresh'); $('#view-launches').classList.toggle('active',tab==='launches'); }
    function filtered(){ const q=$('#q').value.toLowerCase().trim(), ch=$('#chain').value, sort=$('#sort').value; let arr=data.candidates.filter(c=>!ch||c.chainId===ch).filter(c=>!q||JSON.stringify([c.name,c.symbol,c.chainId,c.xHandles,c.raidSignals,c.contactTargets]).toLowerCase().includes(q)); arr.sort((a,b)=> sort==='age' ? (a.ageHours??9999)-(b.ageHours??9999) : sort==='volume' ? Number(b.volume?.h24||0)-Number(a.volume?.h24||0) : sort==='liquidity' ? Number(b.liquidityUsd||0)-Number(a.liquidityUsd||0) : Number(b.score||0)-Number(a.score||0)); return arr; }
    function renderStats(arr){ const xReady=data.source?.xSearchEnabled?'enabled':'link-only'; $('#stats').innerHTML=[['Pairs',arr.length],['Seed Set',data.counts?.seeds||0],['Scan',data.windowDays+'d'],['Updated',new Date(data.generatedAt).toLocaleString()],['X Feed',xReady]].map(([k,v])=>`<div class="stat"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join(''); }
    function render(){ const arr=filtered(); renderStats(arr); if(!selected || !arr.find(c=>c.pairAddress===selected.pairAddress)) selected=arr[0]||null; $('#list').innerHTML=arr.length?arr.map((c,i)=>card(c,i)).join(''):'<div class="empty">No candidates. Run scripts/run_update.sh or check data/latest.json.</div>'; document.querySelectorAll('.card').forEach(el=>{ const pick=()=>{selected=data.candidates.find(c=>c.pairAddress===el.dataset.id); render();}; el.onclick=pick; el.tabIndex=0; el.setAttribute('role','button'); el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault(); pick();}}; }); renderDetail(); }
    function pressureRail(score){ score=Number(score||0); return score>=220?' signal-rail-extreme':(score>=170?' signal-rail-hot':(score>=120?' signal-rail-watch':'')); }
    function pressurePct(score){ score=Number(score||0); return Math.max(3, Math.min(100, (score/250)*100)); }
    function launchRail(score){ score=Number(score||0); return score>=85?' signal-rail-extreme':(score>=65?' signal-rail-hot':''); }
    function card(c,i){ const vol=money(c.volume?.h24), liq=money(c.liquidityUsd), active=selected&&selected.pairAddress===c.pairAddress?' active':'', raids=(c.raidSignals||[]).map(r=>`<span class="badge raid">${esc(r.replaceAll('_',' '))}</span>`).join(''), warns=(c.warnings||[]).map(w=>`<span class="badge warn">${esc(w.replaceAll('_',' '))}</span>`).join(''); return `<article class="card${pressureRail(c.score)}${active}" data-id="${esc(c.pairAddress)}" aria-label="Inspect ${esc(c.name||'token')} ${Math.round(c.score||0)} pressure"><div class="rank">#${String((i||0)+1).padStart(2,'0')}</div><img class="icon" src="${safeUrl(c.image)}" onerror="this.style.visibility='hidden'"><div><div class="name">${esc(c.name||'Unknown')} <span class="sym">$${esc(c.symbol||'?')}</span></div><div class="meta ticker-meta"><span>${esc(c.chainId)}</span><span>${esc(c.dexId||'dex')}</span><span>age ${age(c.ageHours)}</span><span>vol ${vol}</span><span>liq ${liq}</span><span>h1 tx ${tx(c,'h1')}</span></div><div class="badges"><span class="badge">${(c.contactTargets||[]).length} contacts</span>${raids}${warns}</div><div class="bar-label pressure-scale">pressure scale <b>${Math.round(c.score||0)} / 250</b></div><div class="spark" title="pressure score scaled against 250 cap"><i style="width:${pressurePct(c.score)}%"></i></div></div><div class="score"><span>${Math.round(c.score||0)}</span></div></article>`; }
    function labelForLink(l){ try{ const u=new URL(l.url); if(l.kind==='x_account'){ const h=u.pathname.split('/').filter(Boolean)[0]; return h ? `X: @${h}` : 'X account'; } if(l.kind==='x_community'){ const id=u.pathname.split('/').filter(Boolean).pop(); return id ? `X community: ${id}` : 'X community'; } if(l.kind==='telegram') return `Telegram: ${u.pathname.replace('/','@') || u.hostname}`; if(l.kind==='discord') return 'Discord invite'; if(l.kind==='website') return u.hostname.replace(/^www\./,''); return `${l.kind}: ${u.hostname}`; }catch(e){ return `${l.kind}: ${l.label||l.url}`; } }
    function renderDetail(){ const c=selected; if(!c){ $('#detail').innerHTML='<div class="empty">Select a pressure row.</div>'; return; } const links=(c.contactTargets||[]).map(l=>`<a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer" title="${esc(l.url)}">${esc(labelForLink(l))}</a>`).join('')||'<span class="meta">No public contact links found.</span>'; const xlinks=(c.contactTargets||[]).filter(l=>l.kind==='x_account'||l.kind==='x_community').map(l=>`<a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer" title="${esc(l.url)}">${esc(labelForLink(l))}</a>`).join(''); $('#detail').innerHTML=`<div class="inspector-object"><img class="inspector-icon" src="${safeUrl(c.image)}" onerror="this.style.display='none'"><div><span class="inspecting-label">currently inspecting</span><h2>${esc(c.name)} <span class="sym">$${esc(c.symbol)}</span></h2><p class="meta">${esc(c.chainId)} · ${esc(c.dexId||'')} · spawned ${c.createdAt?new Date(c.createdAt).toLocaleString():'unknown'} · pressure score ${c.score}</p></div></div><div class="kv"><div><b>${money(c.marketCap)}</b><span class="meta">market cap/fdv</span></div><div><b>${money(c.liquidityUsd)}</b><span class="meta">liquidity</span></div><div><b>${money(c.volume?.h24)}</b><span class="meta">24h volume</span></div><div><b>${tx(c,'m5')}</b><span class="meta">5m transactions</span></div></div><h3 data-sec="01">Point of contact surfaces</h3><div class="links">${links}</div><h3 data-sec="02">Raid / coordination signals</h3><p>${(c.raidSignals||[]).length?c.raidSignals.map(x=>`<span class="badge raid">${esc(x.replaceAll('_',' '))}</span>`).join(' '):'<span class="meta">No explicit raid/community coordination link detected.</span>'}</p><h3 data-sec="03">X / community links</h3><div class="links">${xlinks || '<span class="meta">No X account/community in token profile. Enable xurl search for deeper account extraction.</span>'}</div><h3 data-sec="04">Description</h3><p class="risk">${esc((c.description||'No description.').slice(0,500))}</p><p><a class="links" href="${safeUrl(c.pairUrl)}" target="_blank" rel="noopener noreferrer">Open Dexscreener pair</a></p>`; }

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

    installMascot();
    init();
    installOutboundGate();
    installSecurityConsole();
