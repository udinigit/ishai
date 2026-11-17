// The shared top bar of the director's pages (docs/DIRECTOR_UI_PLAN.md, step 1): /director, /sandbox, /builder, /events, /map.
// Inlined by the build at each page's /*__DIR_BAR__*/ marker, as the first thing in <body>. No AI, no writes.
// The status line comes from /api/director/status once a minute while the page is visible; on /director the page hands it over
// itself (DirBar.set) from its own once-a-minute refresh. Tabs: on /director they switch the page (DirBar.onTab); elsewhere they open /director#<tab>.
(() => {
  if (window.DirBar) return;
  const TABS = [['now', 'NOW'], ['story', 'STORY'], ['cast', 'CAST'], ['week', 'WEEK'], ['more', 'MORE']];
  const TOOLS = [['/sandbox', 'Sandbox'], ['/builder', 'Builder'], ['/events', 'Events'], ['/map', 'Map']];
  const HERE = location.pathname.replace(/\/+$/, '') || '/', ON_DIR = HERE === '/director';
  const css = document.createElement('style');
  css.textContent = `
  #dirBar{position:fixed;top:0;left:0;right:0;z-index:9000;background:#020502;border-bottom:2px solid #123d20;color:#4dff7a;font-family:'VT323',ui-monospace,monospace;font-size:18px;line-height:1.15}
  #dirBar .db-in{max-width:980px;margin:0 auto;padding:6px 12px 0}
  #dirBar .db-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
  #dirBar .db-name{font-size:22px;text-shadow:0 0 8px rgba(77,255,122,.45);white-space:nowrap}
  #dirBar .db-clock{color:#2a9a4c;white-space:nowrap}
  #dirBar .db-where{color:#cfe;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #dirBar .db-chips{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0}
  #dirBar .db-chip{border:1px solid #2a9a4c;border-radius:5px;padding:0 6px;font-size:16px;color:#4dff7a;background:#071007;text-decoration:none}
  #dirBar .db-chip.amber{border-color:#ffb84d;color:#ffb84d} #dirBar .db-chip.red{border-color:#ff6b6b;color:#ff6b6b} #dirBar .db-chip.grey{border-color:#555;color:#9a9a9a}
  #dirBar .db-tabs{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;margin:0 -12px;padding:0 12px}
  #dirBar .db-tabs::-webkit-scrollbar{display:none}
  #dirBar .db-tabs a{flex:0 0 auto;padding:4px 10px 5px;color:#2a9a4c;text-decoration:none;border-bottom:3px solid transparent;white-space:nowrap}
  #dirBar .db-tabs a.on{color:#4dff7a;border-bottom-color:#4dff7a}
  #dirBar .db-tabs a.tool{font-size:16px}
  #dirBar .db-sep{flex:0 0 auto;color:#123d20;padding:4px 4px}
  #dirBar .db-badge{display:inline-block;min-width:16px;margin-left:3px;padding:0 4px;border-radius:8px;background:#ffb84d;color:#050705;font-size:14px;text-align:center}
  `;
  document.head.appendChild(css);
  const bar = document.createElement('div'); bar.id = 'dirBar';
  bar.innerHTML = `<div class="db-in"><div class="db-top"><span class="db-name">&gt; DIRECTOR // ISHAI</span><span class="db-clock" id="dbClock"></span></div>
    <div class="db-where" id="dbWhere">—</div><div class="db-chips" id="dbChips"></div><nav class="db-tabs" id="dbTabs"></nav></div>`;
  document.body.prepend(bar);
  const tabsEl = bar.querySelector('#dbTabs');
  const link = (href, txt, cls, key) => { const a = document.createElement('a'); a.href = href; a.textContent = txt; if (cls) a.className = cls; if (key) a.dataset.key = key; tabsEl.appendChild(a); return a; };
  TABS.forEach(([k, t]) => { const a = link('/director#' + k, t, '', k);
    if (ON_DIR) a.onclick = e => { e.preventDefault(); DirBar.tab(k); }; });
  const sep = document.createElement('span'); sep.className = 'db-sep'; sep.textContent = '│'; tabsEl.appendChild(sep);
  TOOLS.forEach(([h, t]) => { const a = link(h, t, 'tool' + (HERE === h ? ' on' : '')); });
  // keep the page's own content clear of the fixed bar
  const pad0 = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
  const fit = () => { document.body.style.paddingTop = (pad0 + bar.offsetHeight + 6) + 'px'; };
  new ResizeObserver(fit).observe(bar); fit();
  const hm = ms => new Date(ms).toLocaleTimeString('en-GB', {timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit'});
  const clock = () => { bar.querySelector('#dbClock').textContent = new Date().toLocaleString('en-GB', {timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', minute: '2-digit'}); };
  clock(); setInterval(clock, 15000);
  let cur = null, lastAt = 0;
  function chip(txt, cls, title, href){ const c = document.createElement(href ? 'a' : 'span'); c.className = 'db-chip' + (cls ? ' ' + cls : ''); c.textContent = txt; if (title) c.title = title; if (href) c.href = href;
    if (href && ON_DIR && href.startsWith('/director#')) c.onclick = e => { e.preventDefault(); DirBar.tab(href.split('#')[1]); };
    return c; }
  function set(st){
    if (!st) return; lastAt = Date.now();
    bar.querySelector('#dbWhere').textContent = st.place ? `📍 ${st.place} · ${st.action || '—'}${st.with ? ' · with ' + st.with : ''}${st.clock ? '  (' + st.clock.slice(-5) + ')' : ''}` : '—';
    const ch = bar.querySelector('#dbChips'); ch.textContent = '';
    const g = st.gemini || {};
    ch.appendChild(g.state === 'ok' ? chip('Gemini ✓', '', 'Gemini writes the story') : g.state === 'paused' ? chip('Gemini paused till ' + hm(g.until), 'amber', 'Daily quota used; Cloudflare writes until it resets')
      : g.state === 'failing' ? chip('Gemini failing', 'red', g.fails + ' failures in the last 30 minutes') : chip('Gemini off', 'grey', 'No GEMINI_API_KEY: Cloudflare writes everything'));
    const p = st.neuronPct || 0; ch.appendChild(chip('CF ' + p + '%', p >= 90 ? 'red' : p >= 60 ? 'amber' : '', `Cloudflare Workers AI: about ${st.neurons} of 10,000 neurons today`));
    ch.appendChild(st.talk ? chip('talk short', 'amber', 'Talk brake: ' + st.talk) : chip('talk ok', '', 'Full conversations (10-16 lines)'));
    if (st.stuck) ch.appendChild(chip('stuck ' + st.stuck, st.stuck >= 2 ? 'red' : 'amber', 'The story repeated itself; at 2 the scene is wrapped up'));
    const w = st.waiting || {}, n = st.waitingN || 0;
    if (n) ch.appendChild(chip('⚠ ' + n, 'amber', Object.entries(w).filter(([, v]) => v).map(([k, v]) => k + ' ' + v).join(', '), '/director#now'));
    tabsEl.querySelectorAll('.db-badge').forEach(b => b.remove());
    const badge = (key, v) => { if (!v) return; const a = tabsEl.querySelector(`[data-key="${key}"]`); if (!a) return; const b = document.createElement('span'); b.className = 'db-badge'; b.textContent = v; a.appendChild(b); };
    badge('now', n); badge('cast', (w.cast || 0) + (w.auditions || 0));
  }
  async function load(){
    if (document.hidden) return;
    try { const k = localStorage.getItem('ishaiKey') || '';
      const r = await fetch('/api/director/status', {headers: k ? {'x-admin-key': k} : {}, credentials: 'same-origin'});
      if (r.ok) set(await r.json()); } catch (e) {}
  }
  const DirBar = window.DirBar = {
    set,
    onTab: null,   // set by /director
    tab(k){ if (!ON_DIR) { location.href = '/director#' + k; return; } cur = k; if (location.hash !== '#' + k) history.replaceState(null, '', '#' + k);
      tabsEl.querySelectorAll('[data-key]').forEach(a => a.classList.toggle('on', a.dataset.key === k)); if (DirBar.onTab) DirBar.onTab(k); window.scrollTo(0, 0); },
    current: () => cur
  };
  if (!ON_DIR) { load(); setInterval(load, 60000); document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastAt > 55000) load(); }); }
})();
