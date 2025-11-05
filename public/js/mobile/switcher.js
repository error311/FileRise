(function(){
  const isCap = !!window.Capacitor || /Capacitor/i.test(navigator.userAgent);
  if (!isCap) return;
  // NOTE: allow running inside Capacitor (origin "capacitor://localhost")

  const Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
  const Pref = Plugins.Preferences ? {
    get:   ({key}) => Plugins.Preferences.get({key}),
    set:   ({key,value}) => Plugins.Preferences.set({key,value}),
    remove:({key}) => Plugins.Preferences.remove({key})
  } : {
    get:    async ({key}) => ({ value: localStorage.getItem(key) || null }),
    set:    async ({key,value}) => localStorage.setItem(key, value),
    remove: async ({key}) => localStorage.removeItem(key)
  };
  const Http = (Plugins.Http || Plugins.CapacitorHttp) || null;

  const K_INST='fr_instances_v1', K_ACTIVE='fr_active_v1', K_STATUS='fr_status_v1';

  const $ = s => document.querySelector(s);

  // Safe element builder: attributes only, children as nodes/strings (no innerHTML)
  const el = (tag, attrs = {}, children = []) => {
    const n = document.createElement(tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  };

  // Normalize to http(s), strip creds, collapse trailing slashes
  const normalize = (u) => {
    if (!u) return '';
    let v = u.trim();
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try {
      const url = new URL(v);
      if (!/^https?:$/.test(url.protocol)) return '';
      url.username = '';
      url.password = '';
      url.pathname = url.pathname.replace(/\/+$/,'');
      return url.toString();
    } catch { return ''; }
  };

  // Append/overwrite a query param safely on a normalized URL
  const withParam = (base, k, v) => {
    try {
      const u = new URL(normalize(base));
      u.searchParams.set(k, v);
      return u.toString();
    } catch { return ''; }
  };

  const host = u => {
    try { return new URL(normalize(u)).hostname; } catch { return ''; }
  };
  const originOf = u => {
    try { return new URL(normalize(u)).origin; } catch { return ''; }
  };
  const faviconUrl = u => {
    try { const x = new URL(normalize(u)); return x.origin + '/favicon.ico'; } catch { return ''; }
  };
  const initialsIcon = (hn='FR') => {
    const t=(hn||'FR').replace(/^www\./,'').slice(0,2).toUpperCase();
    const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>
      <rect width='100%' height='100%' rx='12' ry='12' fill='#2196F3'/>
      <text x='50%' y='54%' text-anchor='middle' font-family='system-ui,-apple-system,Segoe UI,Roboto,sans-serif'
            font-size='28' font-weight='700' fill='#fff'>${t}</text></svg>`;
    return 'data:image/svg+xml;utf8,'+encodeURIComponent(svg);
  };

  async function getStatusCache(){
    const raw=(await Pref.get({key:K_STATUS})).value;
    try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }
  async function writeStatus(origin, ok){
    const cache=await getStatusCache();
    cache[origin]={ ok, ts: Date.now() };
    await Pref.set({key:K_STATUS, value:JSON.stringify(cache)});
  }

  async function verifyFileRise(u, timeout=5000){
    if (!u || !Http) return {ok:false};
    const base = normalize(u), org = originOf(base);
    const tryJson = async (url, validate) => {
      try{
        const r = await Http.get({ url, connectTimeout:timeout, readTimeout:timeout, headers:{'Accept':'application/json','Cache-Control':'no-cache'} });
        if (r && r.data) {
          const j = (typeof r.data === 'string') ? JSON.parse(r.data) : r.data;
          return !!validate(j);
        }
      }catch(_){}
      return false;
    };
    if (await tryJson(org + '/siteConfig.json', j => j && (j.appTitle || j.headerTitle || j.auth || j.oidc || j.basicAuth))) return {ok:true, origin:org};
    if (await tryJson(org + '/api/ping.php',    j => j && (j.ok===true || j.status==='ok' || j.pong || j.app==='FileRise'))) return {ok:true, origin:org};
    if (await tryJson(org + '/api/version.php', j => j && (j.version || j.app==='FileRise'))) return {ok:true, origin:org};
    try{
      const r = await Http.get({ url: org+'/', connectTimeout:timeout, readTimeout:timeout, headers:{'Cache-Control':'no-cache'} });
      if (typeof r.data === 'string' && /FileRise/i.test(r.data)) return {ok:true, origin:org};
    }catch(_){}
    return {ok:false, origin:org};
  }

  async function probeReachable(u, timeout=3000){
    try{
      const base = new URL(normalize(u)).origin, ico=base+'/favicon.ico';
      if (Http){
        try{ const r=await Http.get({ url: ico, connectTimeout:timeout, readTimeout:timeout, headers:{'Cache-Control':'no-cache'} });
             if (r && typeof r.status==='number' && r.status<500) return true; }catch(e){}
        try{ const r2=await Http.get({ url: base+'/', connectTimeout:timeout, readTimeout:timeout, headers:{'Cache-Control':'no-cache'} });
             if (r2 && typeof r2.status==='number' && r2.status<500) return true; }catch(e){}
        return false;
      }
      return await new Promise(res=>{
        const img=new Image(), t=setTimeout(()=>done(false), timeout);
        function done(ok){ clearTimeout(t); img.onload=img.onerror=null; res(ok); }
        img.onload=()=>done(true); img.onerror=()=>done(false);
        img.src = ico + (ico.includes('?')?'&':'?') + '__fr=' + Date.now();
      });
    }catch{ return false; }
  }

  async function loadInstances(){
    const raw=(await Pref.get({key:K_INST})).value;
    try { return raw ? JSON.parse(raw) : []; } catch { return []; }
  }
  async function saveInstances(list){
    await Pref.set({key:K_INST, value:JSON.stringify(list)});
  }
  async function getActive(){ return (await Pref.get({key:K_ACTIVE})).value }
  async function setActive(id){ await Pref.set({key:K_ACTIVE, value:id||''}) }

  // ---- Styles (slide-up sheet + disabled buttons + safe-area) ----
  if (!$('#frx-mobile-style')) {
    const css = `
      .frx-fab { position:fixed; right:16px; bottom:calc(env(safe-area-inset-bottom,0px) + 18px); width:52px; height:52px; border-radius:26px;
        background: linear-gradient(180deg,#64B5F6,#2196F3 65%,#1976D2); color:#fff; display:grid; place-items:center;
        box-shadow:0 10px 22px rgba(33,150,243,.38); z-index:2147483647; cursor:pointer; user-select:none; }
      .frx-fab:active { transform: translateY(1px) scale(.98); }
      .frx-fab svg { width:26px; height:26px; fill:white }
      .frx-scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483645;opacity:0;visibility:hidden;transition:opacity .24s ease}
      .frx-scrim.show{opacity:1;visibility:visible}
      .frx-sheet{position:fixed;left:0;right:0;bottom:0;background:#0f172a;color:#e5e7eb;
        border-top-left-radius:16px;border-top-right-radius:16px;box-shadow:0 -10px 30px rgba(0,0,0,.3);
        z-index:2147483646;transform:translateY(100%);opacity:0;visibility:hidden;
        transition:transform .28s cubic-bezier(.2,.8,.2,1), opacity .28s ease; will-change:transform}
      .frx-sheet.show{transform:translateY(0);opacity:1;visibility:visible}
      .frx-sheet .hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)}
      .frx-title{display:flex;align-items:center;gap:10px;font-weight:800}
      .frx-title img{width:22px;height:22px}
      .frx-list{max-height:60vh;overflow:auto;padding:8px 12px}
      .frx-chip{border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px;margin:8px 4px;background:rgba(255,255,255,.04)}
      .frx-chip.active{outline:3px solid rgba(33,150,243,.35); border-color:#2196F3}
      .frx-top{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:10px}
      .frx-left{display:flex;gap:10px;align-items:center}
      .frx-ico{width:20px;height:20px;border-radius:6px;overflow:hidden;background:#fff;display:grid;place-items:center}
      .frx-ico img{width:100%;height:100%;object-fit:cover;display:block}
      .frx-name{font-weight:800}
      .frx-host{font-size:12px;opacity:.8;margin-top:2px}
      .frx-status{display:flex;align-items:center;gap:6px;font-size:12px;opacity:.9}
      .frx-dot{width:10px;height:10px;border-radius:50%;}
      .frx-dot.on{background:#10B981;box-shadow:0 0 0 3px rgba(16,185,129,.18)}
      .frx-dot.off{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.18)}
      .frx-actions{display:flex;gap:8px;flex-wrap:wrap}
      .frx-btn{appearance:none;border:0;border-radius:10px;padding:10px 12px;font-weight:700;cursor:pointer;transition:.15s ease opacity, .15s ease filter}
      .frx-btn[disabled]{opacity:.5;cursor:not-allowed;filter:grayscale(20%)}
      .frx-primary{background:linear-gradient(180deg,#64B5F6,#2196F3);color:#fff}
      .frx-ghost{background:transparent;color:#cbd5e1;border:1px solid rgba(255,255,255,.12)}
      .frx-danger{background:transparent;color:#f44336;border:1px solid rgba(244,67,54,.45)}
      .frx-row{display:flex;gap:8px;align-items:center}
      .frx-field{display:grid;gap:6px;margin:8px 4px}
      .frx-input{width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:transparent;color:inherit}
      .frx-footer{display:flex;justify-content:flex-end;gap:8px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.08)}
      @media (pointer:coarse) { .frx-fab { width:58px; height:58px; border-radius:29px; } }
    `;
    document.head.appendChild(el('style',{id:'frx-mobile-style'}, css));
  }

  // ---- DOM skeleton (no innerHTML) ----
  const scrim = el('div',{class:'frx-scrim', id:'frx-scrim'});
  const sheet = el('div',{class:'frx-sheet', id:'frx-sheet'});
  const hdr = el('div',{class:'hdr'});
  const title = el('div',{class:'frx-title'});
  const logo = el('img',{src:'/assets/logo.svg', alt:'FileRise'});
  // inline handler via property, not attribute
  logo.onerror = function(){ this.style.display='none'; };
  title.append(logo, el('span',{},'FileRise Switcher'));
  const hdrBtns = el('div',{class:'frx-row'},[
    el('button',{class:'frx-btn frx-ghost', id:'frx-home'},'Home'),
    el('button',{class:'frx-btn frx-ghost', id:'frx-close'},'Close')
  ]);
  hdr.append(title, hdrBtns);

  const list = el('div',{class:'frx-list', id:'frx-list'});
  const formWrap = el('div',{style:'padding:10px 12px'},[
    el('div',{class:'frx-field'},[
      el('input',{class:'frx-input', id:'frx-name', placeholder:'Display name (optional)'}),
      el('input',{class:'frx-input', id:'frx-url',  placeholder:'https://files.example.com'})
    ])
  ]);
  const footer = el('div',{class:'frx-footer'},[
    el('button',{class:'frx-btn frx-ghost', id:'frx-add-cancel'},'Close'),
    el('button',{class:'frx-btn frx-primary', id:'frx-add-save'},'+ Add server')
  ]);
  sheet.append(hdr, list, formWrap, footer);

  const fab = el('div',{class:'frx-fab', id:'frx-fab', title:'Switch server'},[
    el('svg',{viewBox:'0 0 24 24'},[ el('path',{d:'M7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h10v2H7v-2z'}) ])
  ]);

  document.body.appendChild(scrim);
  document.body.appendChild(sheet);
  document.body.appendChild(fab);

  function show(){ scrim.classList.add('show'); sheet.classList.add('show'); fab.style.display='none'; }
  function hide(){ scrim.classList.remove('show'); sheet.classList.remove('show'); fab.style.display='grid'; }
  $('#frx-close').addEventListener('click', hide);
  $('#frx-add-cancel').addEventListener('click', hide);
  $('#frx-home').addEventListener('click', ()=>{ try{ location.href='capacitor://localhost/index.html'; }catch{} });
  scrim.addEventListener('click', hide);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') hide(); });

  function chipNode(item, isActive){
    const hv = host(item.url);
    const node = el('div',{class:'frx-chip'+(isActive?' active':''), 'data-id':item.id});

    const top  = el('div',{class:'frx-top'});
    const left = el('div',{class:'frx-left'});

    const ico  = el('div',{class:'frx-ico'});
    const img  = new Image();
    img.alt=''; img.src=item.favicon||faviconUrl(item.url)||initialsIcon(hv);
    img.onerror=()=>{ img.onerror=null; img.src=initialsIcon(hv); };
    ico.appendChild(img);

    const txt  = el('div',{},[
      el('div',{class:'frx-name'}, (item.name || hv)),
      el('div',{class:'frx-host'}, hv)
    ]);

    left.appendChild(ico);
    left.appendChild(txt);

    const dot = el('span',{class:'frx-dot', id:`frx-dot-${item.id}`});
    const lbl = el('span',{id:`frx-lbl-${item.id}`}, 'Checking…');
    const status = el('div',{class:'frx-status'}, [dot, lbl]);

    top.appendChild(left);
    top.appendChild(status);

    const actions = el('div',{class:'frx-actions'});
    const bOpen = el('button',{class:'frx-btn frx-primary', 'data-act':'open', disabled:true}, 'Open');
    const bRen  = el('button',{class:'frx-btn frx-ghost',   'data-act':'rename'}, 'Rename');
    const bDel  = el('button',{class:'frx-btn frx-danger',  'data-act':'remove'}, 'Remove');
    actions.appendChild(bOpen); actions.appendChild(bRen); actions.appendChild(bDel);

    node.appendChild(top);
    node.appendChild(actions);
    return node;
  }

  async function renderList(){
    const listEl=$('#frx-list'); listEl.textContent='';
    const list=await loadInstances(); const active=await getActive();
    const cache=await getStatusCache();

    list.sort((a,b)=>(b.lastUsed||0)-(a.lastUsed||0)).forEach(item=>{
      const chip = chipNode(item, item.id===active);
      const o = originOf(item.url), cached = cache[o];
      const dot = chip.querySelector(`#frx-dot-${item.id}`);
      const lbl = chip.querySelector(`#frx-lbl-${item.id}`);
      const openBtn = chip.querySelector('[data-act="open"]');

      if (cached){
        dot.classList.add(cached.ok ? 'on':'off');
        lbl.textContent = cached.ok ? 'Online' : 'Offline';
        openBtn.disabled = !cached.ok;
      } else {
        lbl.textContent = 'Unknown';
        openBtn.disabled = true;
      }

      chip.addEventListener('click', async (e)=>{
        const act = e.target?.dataset?.act;
        if (!act) return;

        if (act==='open'){
          if (openBtn.disabled) return;
          await setActive(item.id);
          const dest = withParam(item.url, 'frapp', '1');
          if (dest) window.location.replace(dest);
        } else if (act==='rename'){
          const nn=prompt('New display name:', item.name || host(item.url));
          if (nn!=null){
            const L=await loadInstances(); const it=L.find(x=>x.id===item.id);
            if (it){ it.name=nn.trim().slice(0,120); it.lastUsed=Date.now(); await saveInstances(L); renderList(); }
          }
        } else if (act==='remove'){
          if (!confirm('Remove this server?')) return;
          let L=await loadInstances(); L=L.filter(x=>x.id!==item.id); await saveInstances(L);
          const a=await getActive(); if (a===item.id) await setActive(L[0]?.id||''); renderList();
        }
      });

      listEl.appendChild(chip);

      // Live refresh (best effort)
      (async ()=>{
        const ok = await probeReachable(item.url, 2500);
        const d = document.getElementById(`frx-dot-${item.id}`);
        const l = document.getElementById(`frx-lbl-${item.id}`);
        const b = chip.querySelector('[data-act="open"]');
        if (d && l && b){
          d.classList.remove('on','off');
          d.classList.add(ok?'on':'off');
          l.textContent = ok ? 'Online' : 'Offline';
          b.disabled = !ok;
        }
        const o2 = originOf(item.url); if (o2) writeStatus(o2, ok);
      })();
    });
  }

  $('#frx-add-save').addEventListener('click', async ()=>{
    const name = $('#frx-name').value.trim();
    const url  = $('#frx-url').value.trim();
    if (!url) { alert('Enter a valid URL'); return; }

    // Verify: must be FileRise
    const vf = await verifyFileRise(url);
    if (!vf.ok) { alert('That address does not look like a FileRise server.'); return; }

    let L = await loadInstances();
    const h  = host(url);
    const dupe = L.find(i => host(i.url)===h);
    const inst = dupe || { id:'i'+Math.random().toString(36).slice(2)+Date.now().toString(36) };
    inst.name = name || inst.name || h;
    inst.url  = normalize(url);
    inst.favicon = faviconUrl(url);
    inst.lastUsed = Date.now();
    if (!dupe) L.push(inst);
    await saveInstances(L);
    await setActive(inst.id);

    if (vf.origin) await writeStatus(vf.origin, true);

    const dest = withParam(inst.url, 'frapp', '1');
    if (dest) window.location.replace(dest);
  });

  fab.addEventListener('click', async ()=>{ await renderList(); show(); });

  // Ensure zoom gestures work if the host page tried to disable them
  (function ensureZoomable(){
    let m = document.querySelector('meta[name=viewport]');
    const desired = 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=yes, minimum-scale=1, maximum-scale=5';
    if (!m){ m = document.createElement('meta'); m.setAttribute('name','viewport'); document.head.appendChild(m); }
    const c = m.getAttribute('content') || '';
    if (/user-scalable=no|maximum-scale=1/.test(c)) m.setAttribute('content', desired);
  })();
})();