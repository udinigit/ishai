// The world map in one place: story/world.json -> MAP (page) and NEXT, PLACES, LOCATIONS, WALK (worker and page).
// Used by build.mjs; fails loudly when the map doesn't hold together. See docs/WORLD_PLAN.md (phase 1).
import fs from 'fs';

const WALK_STORY = 4, WALK_PASS = 1, AWAY_MIN = 8;   // minutes into a story place / through a pass-through block; nobody is anywhere sooner than AWAY_MIN

export function loadWorld(root = '..'){
  const world = JSON.parse(fs.readFileSync(root + '/story/world.json', 'utf8'));
  const rules = JSON.parse(fs.readFileSync(root + '/story/places.json', 'utf8')).places || {};
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
  for (const id of Object.keys(rules)){
    if (!P[id]) err(`places.json: ${id} is not on the map`);
    else if (P[id].kind === 'pass') err(`places.json: ${id} is a pass-through place (it never closes, is never an outing and has no stay)`);
  }
  // everything reachable from the apartment
  { const seen = new Set(['apartment']), q = ['apartment'];
    while (q.length){ const n = q.shift(); for (const m of Object.keys(P[n].links || {})) if (!seen.has(m)){ seen.add(m); q.push(m); } }
    for (const id of ids) if (!seen.has(id)) err(`${id}: can't be reached from the apartment`); }
  if (errs.length) throw new Error('story/world.json:\n  ' + errs.join('\n  '));

  // ---- NEXT: from a story place, the story places reachable through pass-through blocks only; a ride adds the bus and the taxi ----
  const story = ids.filter(id => P[id].kind !== 'pass');
  const NEXT = {};
  for (const id of story){
    const out = [], add = x => { if (x !== id && !out.includes(x)) out.push(x); };
    const seen = new Set([id]), q = [id];
    while (q.length){
      const n = q.shift();
      for (const [m, l] of Object.entries(P[n].links || {})){
        if (seen.has(m)) continue; seen.add(m);
        if (P[m].kind === 'pass') q.push(m); else add(m);
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
    const d = {[a]: 0}, done = new Set();
    for (;;){
      let n = null; for (const k in d) if (!done.has(k) && (n === null || d[k] < d[n])) n = k;
      if (n === null) break; done.add(n);
      for (const m of Object.keys(P[n].links || {})){ const c = d[n] + cost(m); if (!(m in d) || c < d[m]) d[m] = c; }
    }
    WALK[a] = {};
    for (const b of story) if (b !== a && P[b].kind !== 'vehicle') WALK[a][b] = Math.max(AWAY_MIN, b in d ? d[b] : 20);
  }

  // ---- the page's MAP, as JS (W+8 for "R") ----
  const xs = v => v === 'R' ? 'W+8' : String(v);
  const mapJs = '{\n' + ids.map(id => '    ' + id + ': { ' + Object.entries(P[id].links || {}).map(([to, l]) => {
    const f = []; if ('exit' in l) f.push('exit:' + xs(l.exit)); if ('entry' in l) f.push('entry:' + xs(l.entry)); if (l.ride) f.push('ride:true');
    return to + ': {' + f.join(', ') + '}';
  }).join(', ') + ' }').join(',\n') + '\n  }';

  const pick = k => Object.fromEntries(story.map(id => [id, P[id][k]]));
  // the page's actions: every place, pass-through ones too (page only; default walking and idle)
  const pageActions = Object.fromEntries(ids.map(id => [id, P[id].actions || ['walking', 'idle']]));
  return { mapJs, NEXT, PLACES: pick('desc'), LOCATIONS: pick('actions'), pageActions, WALK, AWAY_MIN };
}

// put the world into the page and the worker at their markers (each must be there exactly once)
export function withWorld(src, name, w, kind){
  const marks = kind === 'page'
    ? { '/*__WORLD_MAP__*/{}': w.mapJs, '/*__WORLD_WALK__*/{}': JSON.stringify(w.WALK), '/*__WORLD_ACTIONS__*/{}': JSON.stringify(w.pageActions) }
    : { '__WORLD_NEXT__': JSON.stringify(w.NEXT, null, 1), '__WORLD_PLACES__': JSON.stringify(w.PLACES, null, 1), '__WORLD_LOCATIONS__': JSON.stringify(w.LOCATIONS, null, 1), '__WORLD_WALK__': JSON.stringify(w.WALK) };
  for (const [m, v] of Object.entries(marks)){
    if (src.split(m).length !== 2) throw new Error(`${name} needs ${m} exactly once`);
    src = src.replace(m, () => v);
  }
  return src;
}
