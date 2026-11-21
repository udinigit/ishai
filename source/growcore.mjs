// The grown places' kit (docs/GROWTH_PLAN.md step 4): what a grown place may be made of, a seeded maker and the checker.
// One self-contained function, no imports or outside names: the build writes its source into the worker AND the page
// (growKit.toString() at /*__GROW_KIT__*/null), so both read the same lists, make the same spec from the same seed and check it the same way.
// The page draws every name listed here (growScene() and its parts in index.html); /sandbox → Grown places shows each one.
export function growKit(){
  // ---- what there is ----
  const GROUNDS = {   // outdoor grounds and 'indoor'; fronts: building fronts along the back; road: cars, buses, bikes
    street:     {fronts: true,  road: true,  about: 'a city street: buildings with shops, a sidewalk, a road'},
    alley:      {fronts: true,  road: false, about: 'a narrow old stone alley: tall walls, shutters, washing lines, cobbles, no cars'},
    square:     {fronts: true,  road: false, about: 'a paved square with buildings round it'},
    industrial: {fronts: true,  road: true,  about: 'old warehouses and garages, a yard, a road'},
    park:       {fronts: false, road: false, about: 'grass, a sand path, trees'},
    garden:     {fronts: false, road: false, about: 'a tended garden: hedges, an arch, flowerbeds, a greenhouse'},
    beach:      {fronts: false, road: false, about: 'the sea, sand, a boardwalk'},
    hill:       {fronts: false, road: false, about: 'a lookout terrace high over the city, the sea far away'},
    indoor:     {fronts: false, road: false, about: 'inside a room (see rooms)'}
  };
  const FRONTS = {   // drawn along the back of street, alley, square, industrial; door = they have a way in
    shop: {door: true, sign: true}, cafe: {door: true, sign: true}, restaurant: {door: true, sign: true}, bar: {door: true, sign: true},
    kiosk: {door: true, sign: true}, entrance: {door: true}, garage: {door: true, sign: true}, gallery: {door: true, sign: true},
    mural: {}, blank: {}, arch: {door: true}
  };
  const PROPS = ['tree', 'palm', 'bush', 'flowers', 'bench', 'lamp', 'bins', 'bikes', 'planter', 'hydrant', 'umbrella', 'cart', 'fountain', 'boat', 'rock', 'stall', 'cat', 'pigeons', 'statue', 'sign'];
  const ROOMS = {   // inside: seats = Ishai sits at a table to eat, drink, read or talk; wc = it has a toilet (the action "bathroom" may be used)
    cafe:       {seats: true,  wc: true,  floor: 'wood',   about: 'a café: counter, espresso machine, pastries, small tables'},
    bar:        {seats: true,  wc: true,  floor: 'dark',   about: 'a bar: bottles behind the counter, neon, stools'},
    restaurant: {seats: true,  wc: true,  floor: 'tiles',  about: 'a restaurant: tablecloths, candles, the kitchen hatch'},
    shop:       {seats: false, wc: false, floor: 'tiles',  about: 'a shop: shelves of goods, a till by the door'},
    books:      {seats: true,  wc: false, floor: 'wood',   about: 'a bookshop or library: walls of books, a ladder, an armchair'},
    studio:     {seats: false, wc: true,  floor: 'wood',   about: 'a studio for a class (yoga, dance, pottery): mirrors, mats'},
    arcade:     {seats: false, wc: true,  floor: 'carpet', about: 'an arcade: game cabinets, neon, a change machine'},
    laundry:    {seats: true,  wc: false, floor: 'tiles',  about: 'a laundromat: washers, dryers, a folding table, a bench'},
    gallery:    {seats: false, wc: true,  floor: 'concrete', about: 'a gallery or small museum: white walls, framed pieces, a bench'},
    home:       {seats: true,  wc: true,  floor: 'wood',   about: "someone's living room: a sofa, a rug, shelves, a window"}
  };
  // a city kind (story/city.json fits) → what kind of scene it becomes
  const KIND = { cafe: {room: 'cafe'}, bar: {room: 'bar'}, nightlife: {room: 'bar'}, music: {room: 'bar'}, restaurant: {room: 'restaurant'}, shop: {room: 'shop'},
    service: {room: 'laundry'}, kiosk: {room: 'shop'}, market: {ground: 'square'}, library: {room: 'books'}, study: {room: 'books'}, class: {room: 'studio'},
    sport: {room: 'studio'}, arcade: {room: 'arcade'}, entertainment: {room: 'arcade'}, gallery: {room: 'gallery'}, culture: {room: 'gallery'},
    home: {room: 'home'}, garden: {ground: 'garden'}, outdoor: {ground: 'park'}, family: {ground: 'park'}, beach: {ground: 'beach'}, lookout: {ground: 'hill'} };
  // a district's look for its street blocks
  const STYLE = { city: 'street', old: 'alley', square: 'square', works: 'industrial', green: 'park', sea: 'beach', high: 'hill' };
  const HEX = /^#[0-9a-f]{6}$/i, SIGN = /^[A-Z0-9 .'!]{1,12}$/;
  const WALLS = ['#a08e7c', '#8a7f94', '#7f8a78', '#b5a58a', '#9a8a7a', '#7a8a9a', '#c2b8a2', '#a07a6a', '#8f9c8a', '#b09a8a'];
  const OLD = ['#d8c8a8', '#cdbb98', '#e0d2b4', '#c8b48e', '#d4c4a0'];
  const WORKS = ['#7a7f86', '#8a6f5a', '#6f7a72', '#8a8a7a', '#5f6a74'];
  const AWN = ['#c23b3b', '#2f7d3a', '#2f6fb5', '#e0b04a', '#7a3f8a', '#d0603a', '#3a8a8a', '#2b2b33'];
  const ROOMWALL = { cafe: ['#e8d8c0', '#d8e4d0', '#f0e0c8'], bar: ['#2a1e22', '#1e2430', '#2e2418'], restaurant: ['#e8c8a8', '#d8b890', '#e4d0b0'],
    shop: ['#eaeae2', '#e2e8ee', '#f0ece0'], books: ['#c8b090', '#b8a080'], studio: ['#f0ece4', '#e8eef0'], arcade: ['#1a1428', '#14202a'],
    laundry: ['#d8eaf0', '#e8f0e0'], gallery: ['#f4f4f0', '#ecece8'], home: ['#e0d4c0', '#d4dcc8', '#e8d0c0'] };

  function rng(seed){ let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
  const int = (v, lo, hi, d) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const col = (c, d) => HEX.test(String(c || '')) ? String(c).toLowerCase() : d;
  const sign = s => { const t = String(s || '').toUpperCase().replace(/[^A-Z0-9 .'!]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12); return SIGN.test(t) ? t : ''; };

  // ---- the checker: only known parts, numbers inside the picture, colours as #rrggbb. Returns a clean copy (never throws) ----
  function clean(sp){
    sp = sp && typeof sp === 'object' ? sp : {};
    const ground = GROUNDS[sp.ground] ? sp.ground : 'street', out = {ground, seed: int(sp.seed, 0, 99999, 1)};
    if (Array.isArray(sp.bld)) out.bld = sp.bld.slice(0, 6).map(b => [int(b[0], 0, 191, 0), int(b[1], 4, 60, 16), int(b[2], 4, 192, 40), col(b[3], '#8a8a8a')]);
    if (GROUNDS[ground].fronts && Array.isArray(sp.fronts)) out.fronts = sp.fronts.slice(0, 6).filter(f => f && FRONTS[f.k]).map(f => {
      const o = {k: f.k, x: int(f.x, 0, 180, 0), w: int(f.w, 14, 96, 40)};
      if (FRONTS[f.k].sign){ const s = sign(f.name); if (s) o.name = s; }
      if (f.c) o.c = col(f.c); if (f.c2) o.c2 = col(f.c2);
      return o; });
    if (Array.isArray(sp.props)) out.props = sp.props.slice(0, 12).filter(p => p && PROPS.includes(p.k)).map(p => {
      const o = {k: p.k, x: int(p.x, -10, 200, 96)}; if (p.c) o.c = col(p.c); if (p.n != null) o.n = int(p.n, 0, 9, 0); return o; });
    if (ground === 'indoor'){
      const r = sp.room || {}, k = ROOMS[r.k] ? r.k : 'cafe';
      out.room = {k, wall: col(r.wall, ROOMWALL[k][0]), c: col(r.c, '#c23b3b'), wc: !!(r.wc && ROOMS[k].wc)};
      const s = sign(r.name); if (s) out.room.name = s;
      out.room.door = r.door === 'R' ? 'R' : 'L';
    }
    if (sp.stop && GROUNDS[ground].road) out.stop = true;
    out.crowd = int(sp.crowd, 0, 3, ground === 'indoor' ? 0 : 2);
    return out;
  }

  // ---- the maker: want = {room} | {ground} | {kind: a city kind} | {style: a district style}; name = the sign; seed = a number ----
  // A street-type block gets a row of fronts; want.door asks for one front with a door for a place behind it (its door x comes back as spec.doorX).
  function spec(want, seed){
    want = want || {}; const r = rng(seed), K = want.kind && KIND[want.kind] || {};
    const room = want.room || K.room, ground = room ? 'indoor' : (want.ground || K.ground || STYLE[want.style] || 'street');
    if (ground === 'indoor'){
      const k = ROOMS[room] ? room : 'cafe';
      return clean({ground, seed, room: {k, wall: pick(r, ROOMWALL[k]), c: pick(r, AWN), wc: ROOMS[k].wc && r() < 0.85, name: want.name, door: 'L'}, crowd: 0});
    }
    const sp = {ground, seed, crowd: 1 + Math.floor(r() * 2)};
    if (GROUNDS[ground].fronts){
      const pal = ground === 'alley' ? OLD : ground === 'industrial' ? WORKS : WALLS;
      sp.bld = []; let x = 0;
      while (x < 192){ const w = Math.min(192 - x, 44 + Math.floor(r() * 30)); sp.bld.push([x, (ground === 'alley' ? 2 : 6) + Math.floor(r() * 14), w, pick(r, pal)]); x += w; }
      const kinds = ground === 'alley' ? ['shop', 'cafe', 'entrance', 'arch', 'kiosk', 'gallery', 'blank', 'restaurant']
        : ground === 'industrial' ? ['garage', 'garage', 'blank', 'mural', 'bar', 'entrance', 'shop']
        : ground === 'square' ? ['cafe', 'restaurant', 'shop', 'gallery', 'entrance', 'kiosk']
        : ['shop', 'shop', 'cafe', 'restaurant', 'bar', 'entrance', 'kiosk', 'mural', 'blank', 'gallery', 'garage'];
      sp.fronts = []; x = 2 + Math.floor(r() * 4);
      const doorSlot = want.door ? Math.floor(r() * 3) : -1;
      for (let i = 0; x < 176 && i < 4; i++){
        const w = Math.min(186 - x, 40 + Math.floor(r() * 20));
        if (w < 30) break;
        let k = pick(r, kinds); if (i === doorSlot) k = want.doorKind && FRONTS[want.doorKind] ? want.doorKind : 'shop';
        const f = {k, x, w, c: pick(r, AWN), c2: pick(r, AWN)};
        if (i === doorSlot){ f.name = want.name; sp.doorX = x + w - 13; }
        else if (FRONTS[k].sign) f.name = pick(r, NAMES[k] || ['OPEN']);
        sp.fronts.push(f); x += w + 4 + Math.floor(r() * 6);
      }
      if (doorSlot >= 0 && sp.doorX == null && sp.fronts.length){ const f = sp.fronts[sp.fronts.length - 1]; f.k = 'shop'; f.name = want.name; sp.doorX = f.x + f.w - 13; }
    }
    const P = { street: ['lamp', 'tree', 'bins', 'bikes', 'hydrant', 'planter', 'bench', 'sign', 'cat'], alley: ['planter', 'cat', 'bikes', 'lamp', 'flowers', 'bins', 'pigeons'],
      square: ['fountain', 'statue', 'bench', 'tree', 'pigeons', 'lamp', 'stall', 'cart', 'planter'], industrial: ['bins', 'bikes', 'lamp', 'rock', 'cat', 'sign'],
      park: ['tree', 'tree', 'tree', 'bench', 'bush', 'flowers', 'lamp', 'pigeons', 'cat', 'rock', 'palm', 'statue'], garden: ['flowers', 'flowers', 'bush', 'tree', 'bench', 'planter', 'fountain', 'cat'],
      beach: ['umbrella', 'umbrella', 'palm', 'boat', 'rock', 'cart', 'bench', 'pigeons'], hill: ['bench', 'tree', 'lamp', 'bush', 'palm', 'flowers', 'sign'] }[ground] || [];
    sp.props = []; const n = 3 + Math.floor(r() * 4), big = ['fountain', 'statue', 'stall', 'boat'];
    let bigs = 0;
    for (let i = 0; i < n; i++){ let k = pick(r, P); if (big.includes(k) && bigs++) k = 'bench'; sp.props.push({k, x: 12 + Math.floor((i + r() * 0.8) * (168 / n)), c: pick(r, AWN), n: Math.floor(r() * 10)}); }
    if (ground === 'street' && want.stop){ sp.stop = true; sp.props = sp.props.filter(p => Math.abs(p.x - 140) > 22); }
    const out = clean(sp); if (sp.doorX != null) out.doorX = sp.doorX; return out;
  }
  const NAMES = { shop: ['GROCERY', 'SHOES', 'HARDWARE', 'TOYS', 'PHONES', 'FLOWERS', 'BAKERY', 'SPICES', 'OPTICIAN', 'TAILOR', 'RECORDS', 'PLANTS'],
    cafe: ['KAFE', 'ESPRESSO', 'CAFE BOKER', 'BOREKAS'], restaurant: ['GRILL', 'SHAKSHUKA', 'FISH', 'PASTA', 'SABICH', 'MANGAL'],
    bar: ['PUB', 'TAVERN', 'BAR 7', 'THE OWL'], kiosk: ['KIOSK', 'JUICE', 'NUTS', 'SEEDS'], garage: ['GARAGE', 'TIRES', 'WORKSHOP', 'BIKES'],
    gallery: ['GALLERY', 'ART', 'PRINTS'] };
  return { GROUNDS, FRONTS, PROPS, ROOMS, KIND, STYLE, clean, spec, rng };
}
