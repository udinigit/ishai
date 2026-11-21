// The world map in one place: story/world.json -> MAP (page) and NEXT, PLACES, LOCATIONS, WALK (worker and page).
// Used by build.mjs; fails loudly when the map doesn't hold together. See docs/WORLD_PLAN.md (phase 1).
import fs from 'fs';


import { computeWorld } from './worldcore.mjs';
export { computeWorld };

export function loadWorld(root = '..'){
  const world = JSON.parse(fs.readFileSync(root + '/story/world.json', 'utf8'));
  const rules = JSON.parse(fs.readFileSync(root + '/story/places.json', 'utf8')).places || {};
  return computeWorld(world, rules);
}

// put the world into the page and the worker at their markers (each must be there exactly once)
export function withWorld(src, name, w, kind){
  const marks = kind === 'page'
    ? { '/*__WORLD_MAP__*/{}': w.mapJs, '/*__WORLD_WALK__*/{}': JSON.stringify(w.WALK), '/*__WORLD_ACTIONS__*/{}': JSON.stringify(w.pageActions), '/*__WORLD_SCREENS__*/{}': JSON.stringify(w.SCREENS) }
    : { '__WORLD_JSON__': fs.readFileSync('../story/world.json', 'utf8').trim(), '/*__WORLD_CORE__*/null': computeWorld.toString(), '__WORLD_NEXT__': JSON.stringify(w.NEXT, null, 1), '__WORLD_PLACES__': JSON.stringify(w.PLACES, null, 1), '__WORLD_LOCATIONS__': JSON.stringify(w.LOCATIONS, null, 1), '__WORLD_WALK__': JSON.stringify(w.WALK), '__WORLD_FOOT__': JSON.stringify(w.FOOT) };
  for (const [m, v] of Object.entries(marks)){
    if (src.split(m).length !== 2) throw new Error(`${name} needs ${m} exactly once`);
    src = src.replace(m, () => v);
  }
  return src;
}

// ---- the city from above (story/city.json, docs/GROWTH_PLAN.md): districts on a coarse grid, so growth knows WHERE a new place belongs ----
// Checked here: the grid, one district per square, every story place in exactly one district, known kinds in fits, grow edges on real places.
export const CITY_KINDS = ['arcade', 'bar', 'beach', 'cafe', 'class', 'culture', 'entertainment', 'family', 'garden', 'gallery', 'home', 'kiosk', 'library', 'lookout', 'market', 'music', 'nightlife', 'outdoor', 'restaurant', 'service', 'shop', 'sport', 'study'];
export const CITY_DIRS = ['north', 'south', 'east', 'west'];
export function loadCity(root = '..', world){
  const city = JSON.parse(fs.readFileSync(root + '/story/city.json', 'utf8'));
  const P = (world || JSON.parse(fs.readFileSync(root + '/story/world.json', 'utf8'))).places, errs = [], err = m => errs.push(m);
  const D = city.districts || {}, [GW, GH] = city.grid || [];
  if (!Number.isInteger(GW) || !Number.isInteger(GH) || GW < 1 || GH < 1) err('grid must be [columns, rows]');
  const at = {}, home = {};
  for (const [id, d] of Object.entries(D)){
    if (!/^[a-z][a-z0-9]*$/.test(id)) err(`${id}: a district id is lower-case letters and digits`);
    if (!d.name || !d.feel || !d.from) err(`${id}: needs name, feel and from`);
    const g = d.grid;
    if (!Array.isArray(g) || g.length !== 2 || !g.every(Number.isInteger) || g[0] < 0 || g[1] < 0 || g[0] >= GW || g[1] >= GH) err(`${id}: grid must be [column, row] inside ${GW}x${GH}`);
    else { const k = g.join(','); if (at[k]) err(`${id}: grid ${k} is taken by ${at[k]}`); at[k] = id; }
    if (!Array.isArray(d.fits) || !d.fits.length) err(`${id}: needs fits`);
    for (const f of d.fits || []) if (!CITY_KINDS.includes(f)) err(`${id}: fits "${f}" is not a known kind (${CITY_KINDS.join(', ')})`);
    if (!Number.isInteger(d.room) || d.room < 0) err(`${id}: room must be a whole number, 0 or more`);
    for (const p of d.places || []){
      if (!P[p]) err(`${id}: place ${p} is not on the map`);
      else if (P[p].kind !== 'story') err(`${id}: ${p} is not a story place`);
      else if (home[p]) err(`${p} is in both ${home[p]} and ${id}`);
      home[p] = id;
    }
    for (const gr of d.grow || []){
      if (!gr || !P[gr.at]) err(`${id}: grow at ${gr && gr.at}: not on the map`);
      if (!gr || !CITY_DIRS.includes(gr.dir)) err(`${id}: grow dir must be ${CITY_DIRS.join('/')}`);
    }
  }
  for (const [p, v] of Object.entries(P)) if (v.kind === 'story' && !v.rideOnly && !home[p]) err(`${p}: a story place in no district (add it to a district's places)`);
  if (errs.length) throw new Error('story/city.json:\n  ' + errs.join('\n  '));
  return { city, home };
}
