// The world map's maths in one self-contained function (no imports, no outside names), so the build can also put its
// source into the worker (computeWorld.toString()): the worker re-runs it when places grow (docs/GROWTH_PLAN.md step 3).
// world = {places}, rules = places.json's places. Throws with every problem found; else returns the tables.
export function computeWorld(world, rules){
  const WALK_STORY = 4, WALK_PASS = 1, AWAY_MIN = 8;   // minutes into a story place / through a pass-through block; nobody is anywhere sooner than AWAY_MIN
  rules = rules || {};
  const P = world.places, ids = Object.keys(P), errs = [];
  const err = m => errs.push(m);

  // ---- checks ----
  for (const id of ids){
    const p = P[id];
    if (!['story', 'pass', 'vehicle'].includes(p.kind)) err(`${id}: kind must be story, pass or vehicle`);
    if (p.kind !== 'pass'){
      if (!p.desc) err(`${id}: a ${p.kind} place needs desc`);
      if (!Array.isArray(p.actions) || !p.actions.length) err(`${id}: a ${p.kind} place needs actions`);
    } else if (p.desc) err(`${id}: a pass-through place has no desc (the story never names it)`);
    for (const [to, l] of Object.entries(p.links || {})){
      if (!P[to]){ err(`${id} -> ${to}: no such place`); continue; }
      const veh = p.kind === 'vehicle' || P[to].kind === 'vehicle' || p.rideOnly || P[to].rideOnly;   // on board, or off camera: he gets off at a stop (the stops don't link back)
      const back = (P[to].links || {})[id];
      if (!veh){
        if (!back){ err(`${id} -> ${to}: no way back (${to} has no link to ${id})`); continue; }
        if (!!l.ride !== !!back.ride) err(`${id} <-> ${to}: a ride one way and not the other`);
      }
      if (!veh && !l.ride){
        for (const k of ['exit', 'entry']) if (!(typeof l[k] === 'number' || l[k] === 'R')) err(`${id} -> ${to}: ${k} must be a number or "R"`);
      }
    }
    for (const n of p.next || []) if (!P[n] || P[n].kind === 'pass') err(`${id}: next ${n} is not a story place`);
  }
  // a story place made of several screens (The Big S: 'mall' is six page screens): screens: [...] on the place, of: '<place>' on each screen
  for (const id of ids){
    const p = P[id];
    if (p.screens){ if (p.kind !== 'story') err(`${id}: only a story place has screens`);
      if (p.links && Object.keys(p.links).length) err(`${id}: a place made of screens has no links of its own (its screens do)`);
      for (const sc of p.screens) if (!P[sc] || P[sc].kind !== 'pass' || P[sc].of !== id) err(`${id}: screen ${sc} must be a pass place with of: "${id}"`); }
    if (p.of && !(P[p.of] && (P[p.of].screens || []).includes(id))) err(`${id}: of ${p.of}, but ${p.of} doesn't list it in screens`);
  }
  { const at = {};   // the director's map: one place per square
    for (const id of ids){ const m = P[id].map; if (!m) continue;
      if (!Array.isArray(m) || m.length !== 2 || !m.every(Number.isInteger)) err(`${id}: map must be [column, row]`);
      else { const k = m.join(','); if (at[k]) err(`${id}: map ${k} is taken by ${at[k]}`); at[k] = id; } } }
  for (const id of Object.keys(rules)){
    if (!P[id]) err(`places.json: ${id} is not on the map`);
    else if (P[id].kind === 'pass') err(`places.json: ${id} is a pass-through place (it never closes, is never an outing and has no stay)`);
  }
  // everything reachable from the apartment
  { const seen = new Set(['apartment']), q = ['apartment'];
    while (q.length){ const n = q.shift(); for (const m of Object.keys(P[n].links || {})) if (P[m] && !seen.has(m)){ seen.add(m); q.push(m); } }
    for (const id of ids) if (!seen.has(id) && !(P[id].screens || []).some(sc => seen.has(sc))) err(`${id}: can't be reached from the apartment`); }
  if (errs.length) throw new Error('story/world.json:\n  ' + errs.join('\n  '));

  // ---- NEXT: from a story place, the story places reachable through pass-through blocks only; a ride adds the bus and the taxi ----
  const story = ids.filter(id => P[id].kind !== 'pass');
  const NEXT = {}, startOf = id => P[id].screens || [id], storyOf = id => P[id].of || (P[id].kind === 'pass' ? null : id);
  for (const id of story){
    const out = [], add = x => { if (x !== id && !out.includes(x)) out.push(x); };
    const seen = new Set(startOf(id)), q = [...startOf(id)];
    while (q.length){
      const n = q.shift();
      for (const [m, l] of Object.entries(P[n].links || {})){
        if (seen.has(m)) continue; seen.add(m);
        const so = storyOf(m);
        if (so === id || !so) q.push(m); else add(so);   // its own screens and pass-through blocks are walked through
        if (l.ride && P[n].kind !== 'vehicle' && P[m].kind !== 'vehicle') ['bus', 'taxi'].filter(v => P[v]).forEach(add);
      }
    }
    (P[id].next || []).forEach(add);
    NEXT[id] = out;
  }

  // ---- WALK: minutes before someone who left one place can be at another (the same table for the page and the worker) ----
  const cost = id => P[id].kind === 'vehicle' ? 0 : (P[id].walkMin ?? (P[id].kind === 'pass' ? WALK_PASS : WALK_STORY));
  const WALK = {};
  for (const a of story){
    const d = Object.fromEntries(startOf(a).map(x => [x, 0])), done = new Set();
    for (;;){
      let n = null; for (const k in d) if (!done.has(k) && (n === null || d[k] < d[n])) n = k;
      if (n === null) break; done.add(n);
      for (const m of Object.keys(P[n].links || {})){ const c = d[n] + cost(m); if (!(m in d) || c < d[m]) d[m] = c; }
    }
    WALK[a] = {};
    for (const b of story) if (b !== a && P[b].kind !== 'vehicle'){ const m = Math.min(...startOf(b).map(x => x in d ? d[x] : Infinity)); WALK[a][b] = Math.max(AWAY_MIN, isFinite(m) ? m : 20); }
  }
  // ---- FOOT: minutes between story places on foot only (no bus or taxi; places only a ride away are left out). The worker's toilet trips (nearestWC()) ----
  const FOOT = {};
  for (const a of story){ if (P[a].kind === 'vehicle') continue;
    const d = Object.fromEntries(startOf(a).map(x => [x, 0])), done = new Set();
    for (;;){
      let n = null; for (const k in d) if (!done.has(k) && (n === null || d[k] < d[n])) n = k;
      if (n === null) break; done.add(n);
      for (const [m, l] of Object.entries(P[n].links || {})){ if (l.ride || P[m].kind === 'vehicle' || P[m].rideOnly) continue; const c = d[n] + cost(m); if (!(m in d) || c < d[m]) d[m] = c; }
    }
    FOOT[a] = {};
    for (const b of story) if (b !== a && P[b].kind !== 'vehicle'){ const m = Math.min(...startOf(b).map(x => x in d ? d[x] : Infinity)); if (isFinite(m)) FOOT[a][b] = m; }
  }

  // ---- the page's MAP, as JS (W+8 for "R") ----
  const xs = v => v === 'R' ? 'W+8' : String(v);
  const mapJs = '{\n' + ids.filter(id => !P[id].screens).map(id => '    ' + id + ': { ' + Object.entries(P[id].links || {}).map(([to, l]) => {
    const f = []; if ('exit' in l) f.push('exit:' + xs(l.exit)); if ('entry' in l) f.push('entry:' + xs(l.entry)); if (l.ride) f.push('ride:true');
    return to + ': {' + f.join(', ') + '}';
  }).join(', ') + ' }').join(',\n') + '\n  }';

  const pick = k => Object.fromEntries(story.map(id => [id, P[id][k]]));
  // the page's actions: every place, pass-through ones too (page only; default walking and idle)
  const pageActions = Object.fromEntries(ids.map(id => [id, P[id].actions || (P[id].of && P[P[id].of].actions) || ['walking', 'idle']]));
  const SCREENS = Object.fromEntries(ids.filter(id => P[id].screens).map(id => [id, P[id].screens]));
  return { mapJs, NEXT, PLACES: pick('desc'), LOCATIONS: pick('actions'), pageActions, SCREENS, WALK, FOOT, AWAY_MIN };
}

