// ============================================================
//  WATCHING ISHAI — Cloudflare Worker (single file)
//  - Serves the page at "/"
//  - Serves the story at "/api/state"
//  - Every few minutes (Cron Trigger) asks Workers AI what Ishai does next
//  Needs two bindings:  AI (Workers AI)  and  ISHAI (KV namespace)
// ============================================================

// ---------- things you can change ----------
// Tried in order; if Cloudflare retires one, the next is used automatically.
const MODELS = ["@cf/qwen/qwen3-30b-a3b-fp8", "@cf/meta/llama-3.1-8b-instruct-fast", "@cf/zai-org/glm-4.7-flash", "@cf/meta/llama-3.2-3b-instruct"];
const TZ = "Asia/Jerusalem";
const DELAY_MIN = 5;          // broadcast delay: viewers see events 5 minutes after they are written (not shown on the page)
const INTERVAL_MIN = 6;       // keep equal to your Cron Trigger (*/6 * * * *)
const KEEP_EVENTS = 40;
const MAX_CAST = 12;          // the AI can add people until the cast reaches this size
const NEW_PERSON_EVERY_H = 20; // at most one new person per this many hours
// Secret story goals ("director"). Added once, the first time this version runs.
// startAfterH: hours after deploy before the goal becomes active. deadlineH: hours the AI gets to make it happen.
// unlock: an item that appears on camera once the goal is complete ("tv", "radio" or null).
const DIRECTOR_SEED = [
  { id: "tv", unlock: "tv", startAfterH: 0, deadlineH: 24,
    goal: "Ishai decides he needs a TV (Noa teases him for watching movies on his laptop). Let it develop over a few hours: " +
          "he might buy one at a store, order one by phone, or someone like Avi's cousin offers an old one. It gets carried up and set up in his apartment.",
    forceText: "A sweaty delivery guy carries a TV up the stairs to apartment 4. Ishai finally owns a television." },
  { id: "radio", unlock: "radio", startAfterH: 30, deadlineH: 24,
    goal: "Mrs. Levi gives Ishai her late husband's old radio, insisting it 'needs a young man'. He pretends he doesn't need it, then secretly starts loving it.",
    forceText: "Mrs. Levi leaves her old radio at Ishai's door with a note: 'For you, motek. Don't argue.'" }
];
const ITEMS = { tv: "a TV", radio: "an old radio", dog: "a scruffy sandy dog named Falafel", stray: null };

// ---------- real world (all free, no keys); refreshed about once an hour ----------
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=32.08&longitude=34.78&current=temperature_2m,weather_code,is_day,wind_speed_10m&timezone=Asia%2FJerusalem";
const CALENDAR_URL = "https://www.hebcal.com/shabbat?cfg=json&geonameid=293397&M=on&leyning=off"; // Tel Aviv
// light news only; headlines are filtered again below
const NEWS_FEEDS = [
  ["BBC Technology", "https://feeds.bbci.co.uk/news/technology/rss.xml"],
  ["BBC Science", "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml"],
  ["BBC Entertainment", "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml"],
  ["BBC Sport", "https://feeds.bbci.co.uk/sport/rss.xml"],
  ["ISRAEL21c", "https://www.israel21c.org/feed/"]
];
const HEAVY_NEWS = /\b(kill|killed|killing|dead|death|deaths|die[sd]?|dying|war|wars|attack|attacks|terror\w*|hostage\w*|missile\w*|rocket\w*|strike[sd]?|bomb\w*|shoot\w*|shot|gun\w*|murder\w*|rape\w*|abuse\w*|assault\w*|crash\w*|injur\w*|victim\w*|suicide|funeral|disaster\w*|earthquake|flood\w*|wildfire\w*|gaza|hamas|hezbollah|houthi\w*|iran\w*|idf|army|military|soldier\w*|troops|sanction\w*|election\w*|minister\w*|government|parliament|knesset|president|prime|coalition|protest\w*|riot\w*|arrest\w*|police|court|trial|jail|prison|cancer|dementia|disease|outbreak|abortion|refugee\w*|migrant\w*|genocide|ukraine|russia\w*|israeli strike)\b/i;
const WMO = { 0: "clear sky", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "fog", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain", 71: "snow", 73: "snow", 75: "heavy snow", 80: "rain showers",
  81: "rain showers", 82: "violent rain showers", 95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with hail" };
// how long until a need starts nagging (hours)
const NEED_H = { eat: 5, drink: 3, bathroom: 4, shower: 26 };
const NEEDS = { watching: "tv", listening: "radio" }; // actions that need an item
// how many moments in a row (alone, same place) an activity may run before the story must move on
const RUN_CAP = { eating: 4, drinking: 3, idle: 4, cooking: 6, bathroom: 2, showering: 3, phoning: 0, talking: 0, walking: 4, waking: 2,
  exercising: 8, reading: 12, working: 20, gaming: 15, watching: 15, listening: 15 };
const sameRun = evs => { const l = evs[evs.length - 1]; let n = 0;
  for (let i = evs.length - 1; i >= 0 && evs[i].action === l.action && evs[i].location === l.location && !evs[i].with; i--) n++; return n; };

// The two hosts who comment on the show for viewers (they replace the narration on the public page)
// --- keep the hosts from repeating themselves ---
// content words only: names and filler words are shared by almost every line about the same scene
const STOP = new Set("the and but for with that this his her him she he's she's they them their you your was are is it's its not just like what when then than from have has had into out about over again still very really more some been will would could there here who how why all one get got going gonna yeah okay ishai noa dana moshe levi avi zohar oren falafel".split(" "));
const words = t => String(t || "").toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));
function similar(a, b) {
  const A = new Set(words(a)), B = new Set(words(b));
  if (Math.min(A.size, B.size) < 3) return A.size >= 2 && A.size === B.size && [...A].every(w => B.has(w)) ? 1 : 0; // short lines: same words = same joke
  let n = 0; A.forEach(w => B.has(w) && n++); return n / Math.min(A.size, B.size);
}
const recentHostLines = (s, n = 24) => s.events.slice(-30).flatMap(e => (e.commentary || []).map(c => c.say)).slice(-n);
const opening = t => String(t || "").toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
const isRepeat = (say, prev) => prev.some(p => similar(say, p) >= 0.75 || (opening(say).split(" ").length >= 5 && opening(say) === opening(p)));

const HOSTS = {
  zohar: "Zohar: sassy, sharp-tongued, a little edgy. Roasts Ishai's choices but is secretly rooting for him. Lives for romance drama and ships Ishai with Dana.",
  oren: "Oren: cynical and deadpan, pretends to be bored. Dry one-liners and made-up statistics. Secretly, deeply invested in Moshe the basil.",
  rules: "Running jokes (shipping Dana, Moshe the basil, made-up statistics) at most once an hour each; mostly react to what is new right now: a look, a pause, an object, the weather, what someone just said."
};

// Fictional "sponsors" the hosts plug shamelessly now and then (never real brands)
const SPONSORS = [
  { name: "Cooola", pitch: "an absurdly strong cola; 'if you really want to wake up'" },
  { name: "HummusPrime", pitch: "a hummus subscription delivered by drone, 'because chickpeas deserve wings'" },
  { name: "NapMaster 3000", pitch: "a pillow with 'military-grade softness'" },
  { name: "LeafLove", pitch: "plant food that 'makes basil believe in itself again'" },
  { name: "SockWise", pitch: "socks that 'know where their partner is'" },
  { name: "ZenBrick", pitch: "a meditation app that just shows a brick for ten minutes" },
  { name: "A Butcher Is Born", pitch: "the hottest new reality competition on Channel 9, where amateur butchers compete for the Golden Cleaver; " +
      "contestants: Rami 'The Cleaver' (cries every episode), Shuli Two-Knives (trash-talks the meat), and 78-year-old Grandpa Moti (somehow undefeated). Tonight at 21:00; keep it funny, never gory" },
  { name: "Wee Laddie Virgin Scotch", pitch: "a 0% alcohol 'scotch' for kids, smoky apple juice in a fancy bottle: 'you wouldn't believe it's not alcohol'" }
];
// fictional show that also airs on Ishai's TV once he has one
const TV_SHOW = "On Channel 9 the hit fictional reality show 'A Butcher Is Born' airs at 21:00 (contestants Rami 'The Cleaver', Shuli Two-Knives, Grandpa Moti); the hosts are obsessed with it.";
const AD_EVERY_MIN = 75; // at most one plug per this many minutes

const PERSONA =
  "Ishai is 31, a freelance graphic designer living alone in apartment 4 of an old building in Tel Aviv. " +
  "He is kind, a bit lazy, overthinks small things, loves falafel and old video games, " +
  "and owns a stubborn basil plant named Moshe that sits on his windowsill.";

// The starting cast. Each card is saved and the AI keeps updating "memory" and "relationship".
const SEED_CAST = [
  { id: "levi", name: "Mrs. Levi", role: "nosy 72-year-old neighbor from apartment 5",
    personality: "gossipy, dramatic, secretly very kind, feeds the street cats",
    speech: "calls everyone 'motek', asks too many questions",
    hangouts: ["corridor", "street"],
    look: { hair: "bun", hairColor: "gray", skin: "fair", shirt: "purple", pants: "brown", extras: ["glasses"] },
    memory: "Thinks Ishai's music is too loud. Brings him soup when he looks thin.", relationship: 1 },
  { id: "noa", name: "Noa", role: "Ishai's best friend since the army, a tattoo artist",
    personality: "blunt, loyal, always late, teases him constantly",
    speech: "short sarcastic sentences, calls him 'Ishush'",
    hangouts: ["cafe", "park", "street"],
    look: { hair: "long", hairColor: "auburn", skin: "tan", shirt: "yellow", pants: "black", extras: ["earring"] },
    memory: "Keeps telling Ishai to raise his prices and get a life.", relationship: 4 },
  { id: "avi", name: "Avi", role: "owner of the falafel kiosk on Herzl Street",
    personality: "warm, philosophical, gives life advice with every pita",
    speech: "proverbs and big statements, calls Ishai 'champion'",
    hangouts: ["street"],
    look: { hair: "bald", hairColor: "black", skin: "brown", shirt: "white", pants: "navy", extras: ["mustache", "apron"] },
    memory: "Knows Ishai always orders extra amba.", relationship: 2 },
  { id: "dana", name: "Dana", role: "barista at Cafe Nahat",
    personality: "quiet, dry humor, remembers every order, doodles on cups",
    speech: "few words, deadpan",
    hangouts: ["cafe"],
    look: { hair: "short", hairColor: "black", skin: "light", shirt: "black", pants: "black", extras: ["apron"] },
    memory: "Has started drawing tiny basil leaves on Ishai's cups. He hasn't noticed yet.", relationship: 1 }
];

// ---------- world (must match the page) ----------
const LOCATIONS = {
  apartment: ["sleeping","waking","idle","walking","working","gaming","eating","drinking","cooking","reading","exercising","watching","listening","bathroom","showering","talking","phoning"],
  corridor:  ["walking","idle","talking","phoning"],
  street:    ["walking","idle","talking","eating","drinking","phoning"],
  park:      ["walking","idle","talking","reading","eating","drinking","exercising","phoning"],
  cafe:      ["idle","eating","drinking","working","reading","talking","phoning"],
  offscreen: ["away"]
};
const PLACES = {
  apartment: "his one-room flat: bed, desk with laptop, armchair, small kitchen, a bathroom door (the camera never sees inside; use bathroom/showering), window with Moshe the basil",
  corridor:  "the building hallway outside his door",
  street:    "Herzl Street outside the building: Avi's falafel kiosk, a bus stop bench, traffic",
  park:      "a small park nearby: a bench, a pond with one duck, a big tree",
  cafe:      "Cafe Nahat, a corner cafe",
  offscreen: "anywhere without a camera (the supermarket, a client's office, a friend's home); he gets there by bus or taxi from the bus stop on Herzl Street and comes back the same way"
};
// The world map (must match MAP in the page). Far places are reached by bus or taxi from the street bus stop.
const NEXT = {
  apartment: ["corridor"],
  corridor:  ["apartment","street"],
  street:    ["corridor","park","cafe","offscreen"],
  park:      ["street"],
  cafe:      ["street"],
  offscreen: ["street"]
};
// drawing menu for characters (must match the page)
const LOOK = {
  hair: ["short","long","bald","bun","curly","cap"],
  hairColor: ["black","brown","auburn","blonde","gray","white","red"],
  skin: ["light","fair","tan","brown","dark"],
  cloth: ["red","orange","yellow","green","teal","blue","navy","purple","pink","black","white","gray","brown"],
  extras: ["glasses","beard","mustache","earring","apron","scarf"]
};

const allowed = (loc, unlocked) => LOCATIONS[loc].filter(a => !NEEDS[a] || unlocked.includes(NEEDS[a]));

const HTML = __HTML__;
const DIRECTOR_HTML = __DIRECTOR_HTML__;
const BUILD = "__BUILD__";
// The story plan (story/plan.json in the repository), written ahead by the daily planner.
const PLAN = __PLAN__;
// sha-256 of the health check's fix token (the token itself lives only in the scheduled task)
const FIX_HASH = "b5c6aeba6f36ea21799c22ef3a0a75c2692b6d8f9018f76669af06fe84d7c505";

// ============================================================
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === "/api/state") {
      try {
        const state = await loadState(env);
        // narration is for the director only; viewers get places, actions and spoken lines
        const dev = !!env.ADMIN_KEY && req.headers.get("x-admin-key") === env.ADMIN_KEY;
        return json(publicState(state, dev), dev ? { "cache-control": "no-store" } : { "cache-control": "public, max-age=15" });
      } catch (e) { return json({ error: "state: " + String(e && e.message || e).slice(0, 120) }, {}, 500); }
    }
    // Director page: add a secret ADMIN_KEY variable in Cloudflare, then open /director
    if (url.pathname === "/api/log") {
      const s = await loadState(env);
      return json({ today: s.log || null, yesterday: s.prevLog || null, notes: s.notes, plan: { version: PLAN.version || null, arcs: PLAN.arcs || [] },
        goals: (s.director || []).map(g => ({ id: g.id, status: g.status, how: g.how, startAfter: g.startAfter, deadlineAt: deadlineOf(g), goal: g.goal })) });
    }
    // compact health summary for the scheduled health check (no secrets, no narration of the future)
    if (url.pathname === "/api/health") {
      const s = await loadState(env), now = Date.now(), d = s.diag || [];
      const moments = d.filter(x => x.attempt === 0).length, retried = d.filter(x => x.attempt === 0 && x.problem).length;
      const nm = id => id ? (s.cast[id]?.name || id) : null;
      return json({ now, build: BUILD, planVersion: PLAN.version || null,
        recent: s.events.slice(-10).map(e => `${storyClock(e.t).label.slice(-5)} ${e.location}/${e.action}${e.with ? " +" + nm(e.with) : ""} (${(e.lines || []).length} lines, ${(e.commentary || []).length} host): ${e.text.slice(0, 110)}`),
        lastMomentAgoMin: Math.round((now - (s.events[s.events.length - 1].created || 0)) / 60000),
        retryRate: moments ? +(retried / moments).toFixed(2) : null, problems: d.filter(x => x.problem).slice(-6).map(x => x.problem.slice(0, 120)),
        stuck: s.stuck || 0, scene: s.scene ? { with: nm(s.scene.w), lines: s.scene.lines, target: s.scene.target, leaving: !!s.scene.leaving } : null,
        bugs: JSON.parse(await env.ISHAI.get("bugs") || "[]").filter(x => x.status === "new").slice(-5).map(x => ({ at: x.at, text: x.text.slice(0, 200), screen: x.screen })),
        studio: { lastShowAt: s.show ? s.show.t : null, lastSummaryAt: s.daySum ? s.daySum.at : null, err: s.studioErr || null },
        fixLog: (s.fixLog || []).slice(-3), lastError: s.lastError || null, aiOut: now < (s.aiOutUntil || 0) ? { until: s.aiOutUntil, backup: !!env.BACKUP_AI_KEY, sickMoments: s.sickN || 0 } : null, wishlist: Object.entries(s.wishlist || {}).filter(([, v]) => v.reachedAt).map(([k, v]) => ({ item: k, reachedAt: v.reachedAt })),
        artNeeded: (s.director || []).filter(g => g.status === "needs-art").map(g => ({ id: g.id, art: g.art, createdAt: g.createdAt })) }, { "cache-control": "no-store" });
    }
    // quick story fix for the scheduled health check: /api/fix?token=...&endScene=1&note=...&minutes=45
    if (url.pathname === "/api/fix") {
      const tok = url.searchParams.get("token") || "";
      const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tok)))].map(b => b.toString(16).padStart(2, "0")).join("");
      if (hex !== FIX_HASH) return json({ error: "bad token" }, {}, 403);
      const s = await loadState(env), now = Date.now(), done = [];
      if (url.searchParams.get("endScene") === "1") { s.stuck = Math.max(s.stuck || 0, 2); done.push("endScene"); }
      if (url.searchParams.get("unstick") === "1") { s.stuck = 0; done.push("unstick"); }
      const note = (url.searchParams.get("note") || "").slice(0, 300);
      if (note) { s.fixNote = { text: note, until: now + clamp(Number(url.searchParams.get("minutes")) || 45, 5, 180) * 60000 }; done.push("note"); }
      s.fixLog = [...(s.fixLog || []), { at: now, done, note }].slice(-10);
      await saveState(env, s);
      return json({ ok: true, done, stuck: s.stuck || 0, note: s.fixNote || null }, { "cache-control": "no-store" });
    }
    // the planned day, for the preview player (/?preview)
    if (url.pathname === "/api/plan") {
      const s = await loadState(env);
      return json({ version: PLAN.version || null, written: PLAN.written || null, arcs: PLAN.arcs || [], beats: PLAN.beats || [], unlocked: s.unlocked,
        cast: Object.values(s.cast).map(c => ({ id: c.id, name: c.name, role: c.role, personality: c.personality, look: c.look, memory: c.memory, relationship: c.relationship })) }, { "cache-control": "no-store" });
    }
    // viewers' bug reports (kept apart from the story state)
    if (url.pathname === "/api/bug" && req.method === "POST") {
      let b = {}; try { b = await req.json(); } catch {}
      const text = String(b.text || "").replace(/\s+/g, " ").trim().slice(0, 600);
      if (text.length < 3) return json({ error: "write what went wrong" }, {}, 400);
      const list = JSON.parse(await env.ISHAI.get("bugs") || "[]"), now = Date.now();
      if (list.filter(x => now - x.at < 60000).length >= 5) return json({ error: "too many reports, try again in a minute" }, {}, 429);
      const str = (v, n) => String(v ?? "").slice(0, n);
      list.push({ id: now.toString(36), at: now, text, build: BUILD, page: str(b.page, 300), screen: str(b.screen, 300), ua: str(req.headers.get("user-agent"), 120), status: "new" });
      await env.ISHAI.put("bugs", JSON.stringify(list.slice(-60)));
      return json({ ok: true });
    }
    if (url.pathname === "/director")
      return new Response(DIRECTOR_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (url.pathname === "/api/director") {
      const key = env.ADMIN_KEY || env.TICK_SECRET;
      if (!key || req.headers.get("x-admin-key") !== key) return json({ error: "wrong password (or ADMIN_KEY is not set)" }, {}, 403);
      return directorApi(req, env);
    }
    if (url.pathname === "/" || url.pathname === "/index.html")
      return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response("not found", { status: 404 });
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(tick(env, false)); }
};

// ---------- state ----------
let memo = null, memoAt = 0;

async function loadState(env) {
  if (memo && Date.now() - memoAt < 20000) return memo;
  let s = await env.ISHAI.get("state", { type: "json" });
  let dirty = false;
  if (!s) {
    const now = Date.now();
    s = { startedAt: now, nextId: 2, notes: "Day one of the broadcast.",
      events: [{ id: 1, t: now, created: now, location: "apartment", action: "waking", with: null, lines: [],
        text: "The camera flickers on. Ishai stirs under the blanket and blinks at the ceiling like it owes him money." }] };
    dirty = true;
  }
  if (!s.cast) { s.cast = Object.fromEntries(SEED_CAST.map(c => [c.id, { ...c, lastSeen: null, scenes: 0 }])); dirty = true; }
  if (!s.unlocked) { s.unlocked = []; dirty = true; }
  if (!s.director) { s.director = []; dirty = true; }
  if (!s.done) { const n = Date.now(); s.done = { eat: n - 2 * 3600000, drink: n - 3600000, bathroom: n - 2 * 3600000, shower: n - 12 * 3600000 }; dirty = true; }
  if (!s.wishlist) { s.wishlist = {}; dirty = true; }
  if (!s.talk) { s.talk = []; s.events.forEach(e => (e.lines || []).forEach((l, i) => s.talk.push({ id: e.id + ":" + i, t: e.t, who: l.who, say: l.say, loc: e.location }))); dirty = true; }
  s.seeded = s.seeded || [];
  for (const d of DIRECTOR_SEED) if (!s.seeded.includes(d.id)) {
    s.director.push(newGoal(d, Date.now())); s.seeded.push(d.id); dirty = true;
  }
  if (applyPlan(s, Date.now())) dirty = true;
  if (dirty) await env.ISHAI.put("state", JSON.stringify(s));
  memo = s; memoAt = Date.now();
  return s;
}
async function saveState(env, s) { await env.ISHAI.put("state", JSON.stringify(s)); memo = s; memoAt = Date.now(); }

// day number of the show, counted in Israel calendar days (a new day starts at midnight)
function showDay(start, now) {
  const d = t => { const [y, m, dd] = new Date(t).toLocaleDateString("en-CA", { timeZone: TZ }).split("-").map(Number); return Date.UTC(y, m - 1, dd); };
  return Math.round((d(now) - d(start)) / 86400000) + 1;
}
function publicState(s, dev) {
  const last = s.events[s.events.length - 1];
  return {
    day: showDay(s.startedAt, Date.now()),
    build: BUILD, delayMin: DELAY_MIN, intervalMin: INTERVAL_MIN, notes: dev ? s.notes : "",
    events: s.events.slice(-25).map(e => ({ id: e.id, t: e.t, location: e.location, action: e.action, text: dev ? e.text : "", src: dev ? e.src || null : null, with: e.with || null, lines: e.lines || [], commentary: e.commentary || [], unlocks: e.unlocks || null })),
    talk: (s.talk || []).slice(-80), dev: !!dev,
    studio: s.studio || null, show: s.show || null, call: s.call || null,
    summary: { today: s.daySum || null, yesterday: s.yesterdaySum || null },
    dream: (s.hl || []).filter(h => h.t > Date.now() - 20 * 3600000).slice(-10),
    unlocked: s.unlocked,
    world: s.world ? { weather: s.world.weather, shabbat: s.world.shabbat, holidays: s.world.holidays, headlines: (s.world.headlines || []).slice(0, 8).map(h => h.title), stations: s.world.stations || [] } : null,
    wishlist: Object.entries(s.wishlist || {}).sort((a, b) => b[1].count - a[1].count).slice(0, 10)
      .map(([k, v]) => ({ item: k, count: v.count, example: v.example, reachedAt: v.reachedAt || null })),
    artNeeded: (s.director || []).filter(g => g.status === "needs-art").map(g => ({ id: g.id, goal: g.goal, art: g.art, createdAt: g.createdAt })),
    cast: Object.values(s.cast).map(c => ({ id: c.id, name: c.name, role: c.role, personality: c.personality,
      look: c.look, memory: c.memory, relationship: c.relationship, lastSeen: c.lastSeen, scenes: c.scenes || 0 })),
    location: last?.location, action: last?.action
  };
}

// ---------- story engine ----------
function storyClock(ms) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return { label: `${p.weekday} ${String(hour).padStart(2, "0")}:${p.minute}`, hour };
}

// ---------- hourly studio recap (picture-in-picture on the page) ----------
// a plain recap without the AI (used when the AI is out): the day's notable moments read out by the hosts
function basicRecap(s, day, storyMs) {
  const lines = (s.log && s.log.date === day ? s.log.lines : []).map(l => {
    const m = l.match(/^(\d\d:\d\d) (\w+)\/(\w+)( \+([^:]+))?: (.*)$/); if (!m) return null;
    const text = m[6].split(' Ishai: "')[0].split(" [")[0].replace(/ [A-Z][a-z]+(\.? [A-Z][a-z]+)?: ".*$/, "").trim();
    return { time: m[1], loc: m[2], act: m[3], w: m[5] || null, text };
  }).filter(x => x && x.text && x.act !== "sleeping");
  const notable = []; let prevLoc = null, prevW = null;
  for (const x of lines){ if (x.w !== prevW || (x.loc !== prevLoc && !["corridor", "street"].includes(x.loc))) notable.push(x); prevLoc = x.loc; prevW = x.w; }
  const pickN = notable.slice(-6);
  if (!pickN.length) return null;
  const sp = [...SPONSORS].sort(() => Math.random() - .5).slice(0, 2), out = [];
  out.push({ who: "zohar", say: `This recap is brought to you by ${sp[0].name}. Let's catch you up.` });
  if (s.yesterdaySum) out.push({ who: "oren", say: "Yesterday: " + s.yesterdaySum.text.split(/(?<=\.)\s/)[0] });
  pickN.forEach((x, i) => out.push({ who: (out.length % 2) ? "oren" : "zohar", say: `${x.time}: ${x.text}`.slice(0, 220) }));
  out.push({ who: (out.length % 2) ? "oren" : "zohar", say: `That's the day so far. Brought to you by ${sp[1].name}. Back to the cameras.` });
  return { today: pickN.map(x => `${x.time} ${x.text}`).join(" "), show: { id: "studio-" + Math.floor(storyMs / 3600000) + "-basic", t: storyMs, lines: out, sponsors: sp.map(x => x.name) } };
}
async function studioRecap(env, s, storyMs, day) {
  const nm = id => id === "ishai" ? "Ishai" : s.cast[id]?.name || id;
  const fmt = e => `${storyClock(e.t).label.slice(-5)} ${e.location}/${e.action}${e.with ? " with " + nm(e.with) : ""}: ${e.text}` +
    (e.lines || []).slice(0, 2).map(l => ` ${nm(l.who)}: "${l.say}"`).join("");
  const lastHour = s.events.filter(e => storyMs - e.t < 3600000).map(fmt);
  const todayLines = (s.log && s.log.date === day ? s.log.lines : []).map(l => l.split(' Ishai: "')[0].split(" [")[0].slice(0, 150));
  const earlier = todayLines.filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 18)) === 0).slice(-18);
  if (!lastHour.length && !earlier.length) return null;
  const hr = storyClock(storyMs).hour, yLines = hr < 11 ? "2-3 lines" : hr < 16 ? "1-2 lines" : "1 short line";   // the longer today, the shorter yesterday
  const sp = [...SPONSORS].sort(() => Math.random() - .5).slice(0, 2);
  const messages = [{ role: "system", content:
`You write for a reality show about Ishai, a man in Tel Aviv. Two hosts in the studio:
- ${HOSTS.zohar}
- ${HOSTS.oren}
STRICT: use only facts from the logs below. Never invent events, people, objects or plans.
Reply with ONLY JSON:
{"today":"what happened today so far: 3-6 plain sentences, past tense, neutral, for a text summary",
 "show":[{"who":"zohar"|"oren","say":"..."}],
 "pip":[{"who":"zohar"|"oren","say":"..."}]}
"show" is the studio recap, 8-12 lines, alternating hosts, max 30 words each. It is a REAL RECAP that tells viewers what happened, in order:
 1) the FIRST line is a cheesy sponsor intro: "This recap is brought to you by ${sp[0].name}" plus a joke (${sp[0].pitch});
 2) yesterday: ${yLines} (skip if there is no yesterday), each stating what actually happened (who, where, what);
 3) today in time order (morning, midday, afternoon...), ending with the last hour: every line first states a concrete fact from the log (time of day, place, who he was with, what was said or done), THEN may add a short sassy remark. The other host reacts or adds the next fact. No line may be only a joke;
 Write the "today" summary first and base the show on it, so a viewer who missed the day understands it from the show alone.
 4) the LAST line is a sponsor outro: "...brought to you by ${sp[1].name}" plus a joke (${sp[1].pitch}), then back to the cameras.
"pip" is a 4-5 line quick version about the last hour only (first line greets: "Live from the studio...").` },
  { role: "user", content: `YESTERDAY (${s.yesterdaySum ? s.yesterdaySum.date : "none"}): ${s.yesterdaySum ? s.yesterdaySum.text : "(no summary)"}\n\nTODAY so far:\n${earlier.join("\n") || "(little)"}\n\nLAST HOUR:\n${lastHour.join("\n") || "(quiet)"}\n\nJSON only.` }];
  const raw = await runModel(env, messages);
  let o; try { o = JSON.parse((raw.match(/\{[\s\S]*\}/) || [""])[0]); } catch { return null; }
  const clean = arr => (Array.isArray(arr) ? arr : []).map(l => ({ who: String(l?.who || "").toLowerCase().trim(), say: String(l?.say || "").replace(/\s+/g, " ").trim().slice(0, 220) }))
    .filter(l => (l.who === "zohar" || l.who === "oren") && l.say.length > 3);
  const show = clean(o.show).slice(0, 12), pip = clean(o.pip).slice(0, 6), today = String(o.today || "").replace(/\s+/g, " ").trim().slice(0, 900);
  if (show.length < 4 || today.length < 20) return null;
  const id = "studio-" + Math.floor(storyMs / 3600000);
  return { today, show: { id: id + "-show", t: storyMs, lines: show, sponsors: sp.map(x => x.name) }, pip: pip.length >= 3 ? { id, t: storyMs, lines: pip } : null };
}

async function tick(env, force) {
  const s = await loadState(env);
  const now = Date.now();
  const storyMs = now + DELAY_MIN * 60000;
  const clock = storyClock(storyMs);
  const last = s.events[s.events.length - 1];

  // save budget at night while he sleeps
  if (!force && last.action === "sleeping" && (clock.hour < 6 || clock.hour >= 23) && now - (last.created || last.t) < 15 * 60000)
    return s;

  if (!s.world || now - s.world.at > 55 * 60000) await refreshWorld(s, now);
  else if (now - (s.world.wxAt || s.world.at) > 15 * 60000) await refreshWeather(s, now);

  // director: activate the next goal, or force it if its deadline passed
  let goal = activeGoal(s, now);
  let ev = null;
  if (goal && now > deadlineOf(goal)) {
    ev = forcedEvent(goal, last, s); ev.src = "director goal (forced)";
    finishGoal(s, goal, "forced", now); ev.unlocks = goal.unlock || null;
    goal = null;
  }
  // AI out of budget (no backup AI): Ishai feels unwell, goes home and rests until the allowance resets
  cfOutUntil = Math.max(cfOutUntil, s.aiOutUntil || 0);
  if (!ev && now < (s.aiOutUntil || 0) && !env.BACKUP_AI_KEY){ ev = sickEvent(s, last, clock.hour); ev.src = "sick day (AI out of budget)"; }
  if (!ev) {
    try {
      ev = await askAI(env, s, clock, now, goal); s.lastError = null; if (ev) ev.src = lastWriter;
      if (s.sickN) { s.sickN = 0; s.recoverUntil = now + 90 * 60000; }
    }
    catch (e) {
      const msg = !env.AI ? "Workers AI binding missing: add a Workers AI binding named AI" : String(e && e.message || e);
      console.log("AI error", msg); s.lastError = { at: now, msg };
      if (QUOTA_RE.test(msg)) {
        s.aiOutUntil = Math.max(s.aiOutUntil || 0, nextUtcMidnight(now));
        cfOutUntil = s.aiOutUntil;
        // sick day only when there is no backup AI at all; a backup hiccup just uses an ordinary backup line
        if (!env.BACKUP_AI_KEY){ ev = sickEvent(s, last, clock.hour); ev.src = "sick day (AI out of budget)"; }
      }
    }
    if (!ev){ ev = fallback(last, clock.hour, s); ev.stuck = true; ev.src = s.lastError && s.lastError.at === now ? "backup line (AI error)" : "backup line (AI reply dropped: repeat)"; }
    if (goal && ev.complete === goal.id) { finishGoal(s, goal, "story", now); ev.unlocks = goal.unlock || null; }
  }

  if (ev.newCard) { s.cast[ev.newCard.id] = ev.newCard; s.lastNewAt = now; }
  if ((ev.commentary || []).some(c => SPONSORS.some(sp => c.say.toLowerCase().includes(sp.name.toLowerCase())))) s.lastAd = now;
  const did = { eating: ["eat"], cooking: [], drinking: ["drink"], bathroom: ["bathroom"], showering: ["shower", "bathroom"] }[ev.action] || [];
  if (ev.action === "eating" && ev.location === "cafe") did.push("drink");
  if (s.unlocked.includes("dog") && (ev.location === "park" || ev.location === "street")) did.push("dogwalk");
  did.forEach(k => { s.done[k] = storyMs; });
  if (ev.missing) {
    const w = s.wishlist[ev.missing] || (s.wishlist[ev.missing] = { count: 0, example: "" });
    w.count++; w.example = ev.text.slice(0, 140); w.lastAt = now; if (w.count === 3) w.reachedAt = now;
    const keys = Object.keys(s.wishlist); if (keys.length > 30) delete s.wishlist[keys.sort((a, b) => s.wishlist[a].lastAt - s.wishlist[b].lastAt)[0]];
  }
  if (ev.with && s.cast[ev.with]) {
    const c = s.cast[ev.with];
    if (ev.update?.memory) c.memory = ev.update.memory;
    c.relationship = clamp((c.relationship || 0) + clamp(Math.round(Number(ev.update?.mood) || 0), -1, 1), -5, 5);
    c.lastSeen = storyMs; c.scenes = (c.scenes || 0) + 1;
  }
  s.events.push({ id: s.nextId++, t: storyMs, created: now, location: ev.location, action: ev.action,
    text: ev.text, with: ev.with || null, lines: ev.lines || [], commentary: ev.commentary || [], unlocks: ev.unlocks || null, src: ev.src || null });
  // the day's highlights, replayed in Ishai's dreams at night
  { const prevEv = s.events[s.events.length - 2], hl = s.hl || (s.hl = []), lastHl = hl[hl.length - 1];
    const notable = !["sleeping", "waking", "bathroom", "showering"].includes(ev.action) && ev.location !== "offscreen" &&
      (ev.with || ev.complete || ev.unlocks || (prevEv && prevEv.location !== ev.location && !["corridor", "street"].includes(ev.location)));
    if (notable && !(lastHl && lastHl.loc === ev.location && lastHl.w === (ev.with || null)))
      { hl.push({ t: storyMs, loc: ev.location, a: ev.action, w: ev.with || null }); s.hl = hl.slice(-20); } }
  if (!ev.with && !BATH_ACTIONS.includes(ev.action)){ if (s.scene && s.scene.w) s.gone = { w: s.scene.w, until: storyMs + 90 * 60000 }; s.scene = null; }
  else if (s.scene && s.scene.w === ev.with){ s.scene.lines += (ev.lines || []).length; if ((ev.lines || []).some(l => FAREWELL.test(l.say))) s.scene.leaving = true; }
  else s.scene = { w: ev.with, loc: ev.location, startedAt: storyMs, lines: (ev.lines || []).length,
    ...(ev.scene || { type: "small talk", why: "they ran into each other", ishaiWants: "a pleasant chat", theyWant: "a pleasant chat", beats: "greet, catch up, part", ending: "a natural goodbye", target: 14 }) };
  s.stuck = ev.stuck ? (s.stuck || 0) + 1 : 0;
  if (ev.notes) s.notes = ev.notes;
  s.events = s.events.slice(-KEEP_EVENTS);
  const evId = s.nextId - 1;
  (ev.lines || []).forEach((l, i) => s.talk.push({ id: evId + ":" + i, t: storyMs, who: l.who, say: l.say, loc: ev.location, w: ev.with || null }));
  (ev.commentary || []).forEach((c, i) => s.talk.push({ id: evId + ":c" + i, t: storyMs, who: c.who, say: c.say, loc: ev.location, host: true }));
  if (s.talk.length > 120) s.talk = s.talk.slice(-120);
  // full-day log for the daily planner
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(storyMs));
  if (!s.log || s.log.date !== day) { if (s.log) s.prevLog = s.log; s.log = { date: day, lines: [] }; }
  const nm = id => s.cast[id]?.name || id;
  s.log.lines.push(`${storyClock(storyMs).label.slice(-5)} ${ev.location}/${ev.action}${ev.with ? " +" + nm(ev.with) : ""}: ${ev.text}` +
    (ev.lines || []).map(l => ` ${l.who === "ishai" ? "Ishai" : nm(l.who)}: "${l.say}"`).join("") +
    (ev.commentary || []).map(c => ` [${c.who}] ${c.say}`).join(""));
  if (s.log.lines.length > 450) s.log.lines = s.log.lines.slice(-450);
  // once an hour (08:00-23:00) the hosts go live from the studio with a recap
  // every 30 minutes (08:00-23:59, he is awake, no conversation going on): a viewer calls the hosts
  { const slot = Math.floor(storyMs / 1800000), hr = clock.hour;
    if (hr >= 8 && ev.action !== "sleeping" && !ev.with && s.callSlot !== slot && now >= (s.aiOutUntil || 0)) { s.callSlot = slot;
      try { const c = await callIn(env, s, storyMs); if (c) s.call = c; } catch (e) { console.log("call", e && e.message); } } }
  // every rounded hour while he is awake: "what happened today" summary + the studio recap show (+ a short PiP version)
  { const key = Math.floor(storyMs / 3600000), hr = clock.hour, day = new Date(storyMs).toLocaleDateString("en-CA", { timeZone: TZ });
    if (s.daySum && s.daySum.date !== day) { s.yesterdaySum = { date: s.daySum.date, text: s.daySum.text }; s.daySum = null; }   // a new day
    if (hr >= 7 && ev.action !== "sleeping" && s.studioKey !== key) {
      let r = null; try { r = await studioRecap(env, s, storyMs, day); } catch (e) { s.studioErr = { at: now, msg: String(e && e.message || e).slice(0, 160) }; }
      if (r) { s.studioKey = key; s.studioTries = 0; s.studioErr = null; s.daySum = { date: day, text: r.today, at: storyMs }; s.show = r.show; if (r.pip) s.studio = r.pip; }
      else { s.studioTries = (s.studioTries || 0) + 1; if (!s.studioErr) s.studioErr = { at: now, msg: "the AI reply could not be used" };
        if (s.studioTries >= 3 || now < (s.aiOutUntil || 0)) { s.studioKey = key; s.studioTries = 0; const b = basicRecap(s, day, storyMs); if (b) { s.daySum = { date: day, text: b.today, at: storyMs }; s.show = b.show; } } } } }   // try again on the next moments (max 3 per hour)
  await saveState(env, s);
  return s;
}

function canAddPerson(s, now) {
  return Object.keys(s.cast).length < MAX_CAST && now - (s.lastNewAt || 0) > NEW_PERSON_EVERY_H * 3600000;
}
const feel = r => r <= -3 ? "dislikes him" : r < 0 ? "is annoyed with him" : r === 0 ? "is neutral" : r < 3 ? "likes him" : "is very close to him";

function castSection(s, last) {
  const near = new Set([last.location, ...NEXT[last.location]]);
  const recent = new Set(s.events.slice(-8).map(e => e.with).filter(Boolean));
  const all = Object.values(s.cast);
  const score = c => (recent.has(c.id) ? 2 : 0) + (c.hangouts || []).some(h => near.has(h)) + (c.lastSeen || 0) / 1e15;
  const full = all.filter(c => recent.has(c.id) || (c.relationship || 0) >= 3 || (c.hangouts || []).some(h => near.has(h))).sort((a, b) => score(b) + (b.relationship || 0) / 10 - score(a) - (a.relationship || 0) / 10).slice(0, 4);
  const fullIds = new Set(full.map(c => c.id));
  const cards = full.map(c =>
    `- id "${c.id}": ${c.name}, ${c.role}. Personality: ${c.personality}. Speech: ${c.speech}. ` +
    `Usually at: ${(c.hangouts || []).join(", ")}. Currently ${feel(c.relationship || 0)} (${c.relationship}/5). Memory: ${c.memory}`).join("\n");
  const others = all.filter(c => !fullIds.has(c.id)).map(c => `"${c.id}" (${c.name}, ${c.role})`).join("; ");
  return `PEOPLE IN ISHAI'S LIFE (stay true to their personality and memory):\n${cards || "- (nobody nearby)"}` +
    (others ? `\nOther known people: ${others}` : "");
}

const BATH_ACTIONS = ["bathroom", "showering"];
const FAREWELL = /\b(bye|goodbye|good ?night|see (you|ya)|laila tov|lehitraot|take care|i should go|i('ll| will) go|gotta go|i'm off|heading (out|home)|talk tomorrow|hang(ing)? up)\b/i;
// a scene must end: well past its length, too long, or bedtime
function sceneOverdue(sc, storyMs, stuck) {
  if (!sc) return false;
  if (stuck >= 2) return true;   // the story is going in circles: wrap it up
  const h = storyClock(storyMs).hour;
  return sc.lines >= sc.target * 1.4 || storyMs - (sc.startedAt || storyMs) > 100 * 60000 || h >= 23 || h < 6;
}
function buildMessages(s, clock, now, goal) {
  const last = s.events[s.events.length - 1];
  const cw = last.with || (BATH_ACTIONS.includes(last.action) && s.scene ? s.scene.w : null); // a guest waits while he is in the bathroom
  const owned = s.unlocked.map(u => ITEMS[u]).filter(Boolean);
  const dogLine = s.unlocked.includes("dog")
    ? "\n- Falafel, Ishai's scruffy sandy dog (adopted from Avi's kiosk), goes everywhere with him: he walks him, feeds him, Falafel begs at the counter, naps in his own bed, steals socks. Mention Falafel now and then; the hosts adore him."
    : s.unlocked.includes("stray") ? "\n- A scruffy sandy stray dog hangs around Avi's kiosk on Herzl Street; Avi secretly feeds it falafel balls. Ishai keeps noticing it." : "";
  const world = Object.entries(PLACES).map(([k, v]) => `- ${k}: ${v}. Allowed actions: ${allowed(k, s.unlocked).join(", ")}`).join("\n");
  const gapMin = Math.round((now - (last.created || last.t)) / 60000);
  const gap = gapMin > 45 ? `\nNote: about ${gapMin >= 120 ? Math.round(gapMin / 60) + " hours" : gapMin + " minutes"} passed since the last moment; account for that.` : "";
  const direction = goal
    ? `\nSECRET STORY DIRECTION (viewers must not notice it is directed): ${goal.goal}\n` +
      `Work towards it naturally, step by step; it does not have to happen in this moment. ${timeLeft(deadlineOf(goal) - now)} left. ` + (goal.where ? `It happens at: ${goal.where}. ` : "") + (goal.with ? `Involves: ${goal.with}. ` : "") +
      (goal.brief ? `SCENE BRIEF from the director for this conversation: ${goal.brief}${goal.briefLines ? ` (about ${goal.briefLines} lines in total, over several moments)` : ""}. When it starts, turn this brief into "scene". ` : "") +
      `In the moment it is fully done, set "complete":"${goal.id}".` + (goal.unlock && ITEMS[goal.unlock] ? ` Until then Ishai does NOT have ${ITEMS[goal.unlock]}.` : "")
    : "";
  const name = id => s.cast[id]?.name || id;
  const recent = s.events.slice(-6).map(e =>
    `[${storyClock(e.t).label}] (${e.location}/${e.action}${e.with ? " with " + name(e.with) : ""}) ${e.text}` +
    (e.lines || []).map(l => ` ${l.who === "ishai" ? "Ishai" : name(l.who)}: "${l.say}"`).join("")).join("\n"); // host lines are listed separately (ALREADY SAID)
  const convo = cw && s.cast[cw] ? (() => {
    const w = cw, ls = (s.talk || []).filter(m => !m.host && (m.w === w || m.who === w) && now + DELAY_MIN * 60000 - m.t < 40 * 60000).slice(-8);
    return ls.length ? `\nCONVERSATION SO FAR with ${name(w)} (still going unless someone has a reason to leave; do NOT greet again or repeat; react to the last line, add something new):\n` +
      ls.map(m => `${m.who === "ishai" ? "Ishai" : name(m.who)}: "${m.say}"`).join("\n") + "\n" : "";
  })() : "";
  // a guest who already left: say so up front (cheaper than a retry)
  const goneNote = s.gone && s.gone.w && now + DELAY_MIN * 60000 < s.gone.until && !last.with ? `\nNOTE: ${name(s.gone.w)} has already gone home and is NOT here. Ishai is alone ("with": null); no lines from ${name(s.gone.w)}.` : "";
  const sc = s.scene && cw && s.scene.w === cw ? s.scene : null;
  const sceneBrief = sc ? `\nSCENE BRIEF (this conversation with ${name(sc.w)}): type: ${sc.type}. Why they are talking: ${sc.why}. Ishai wants: ${sc.ishaiWants}. ${name(sc.w)} wants: ${sc.theyWant}. ` +
    `Beats: ${sc.beats}. Planned ending: ${sc.ending}. Progress: ${sc.lines} of about ${sc.target} lines.` +
    (!last.with ? ` Ishai just came back from the bathroom; ${name(sc.w)} waited in the apartment and is still there.` : "") +
    (sceneOverdue(sc, now + DELAY_MIN * 60000, s.stuck) ? ` THE SCENE ENDS IN THIS MOMENT: they wrap up and say goodbye (2-4 lines) and ${name(sc.w)} leaves (walks out / hangs up). After this moment ${name(sc.w)} is gone.`
      : sc.lines >= sc.target ? ` It is time to reach the planned ending now, naturally (a reason to leave, hang up, or move on).` : ` Keep both people pursuing what they want; move to the next beat when the current one is done.`) + "\n" : "";
  const allowNew = canAddPerson(s, now);
  // now and then, ask the hosts for an obvious "secret" sponsor plug
  const sponsor = now - (s.lastAd || 0) > AD_EVERY_MIN * 60000 && Math.random() < 0.35
    ? SPONSORS[Math.floor(Math.random() * SPONSORS.length)] : null;
  const hrs = k => (now + DELAY_MIN * 60000 - (s.done[k] || now)) / 3600000;
  const need = Object.entries(NEED_H).filter(([k, h]) => hrs(k) > h).map(([k]) => ({ eat: "hungry", drink: "thirsty", bathroom: "needs the bathroom", shower: "needs a shower" })[k]);
  const body = `Body: last ate ${hrs("eat").toFixed(1)}h ago, last drink ${hrs("drink").toFixed(1)}h ago, bathroom ${hrs("bathroom").toFixed(1)}h ago, shower ${hrs("shower").toFixed(0)}h ago.` +
    (need.length ? (last.with
      ? (hrs("bathroom") > NEED_H.bathroom * 1.5 && need.includes("needs the bathroom") ? ` In this moment he says "one sec" and goes to the bathroom (action "bathroom"); ${name(last.with)} waits. No jokes about it.` : "")
      : ` He is ${need.join(" and ")} — let that show soon, naturally.`) : "");
  // pacing: keep the show moving
  const evs = s.events, hourNow = clock.hour;
  let sinceMove = 0; for (let i = evs.length - 1; i >= 0 && evs[i].location === last.location; i--) sinceMove = (now - (evs[i].created || evs[i].t)) / 60000;
  let sinceTalk = 0; for (let i = evs.length - 1; i >= 0 && !evs[i].with; i--) sinceTalk = (now - (evs[i].created || evs[i].t)) / 60000;
  const awake = hourNow >= 7 && hourNow < 23 && last.action !== "sleeping";
  const pacing = [
    awake && sinceMove > 100 && last.location !== "offscreen" ? `He has been at the ${last.location} for about ${(sinceMove / 60).toFixed(1)} hours. Time for a change soon: he goes out (step by step through the neighbors rule) or someone comes over.` : "",
    (hourNow >= 23 || hourNow < 6) && last.action !== "sleeping" ? (last.location === "apartment"
      ? `It is late (${clock.label.slice(-5)}). He is tired: guests say goodnight and leave, he winds down (bathroom, glass of water) and goes to bed — "sleeping" in this or the next moment.`
      : `It is late (${clock.label.slice(-5)}). He heads home now, place by place, to go to bed.`) : "",
    (() => { const run = sameRun(evs), cap = RUN_CAP[last.action]; if (!cap || last.with || run < Math.max(3, cap - 1)) return "";
      return run >= cap
        ? `He has been ${last.action} for ${run * DELAY_MIN} minutes, the same thing over and over. In THIS moment he finishes it and does something clearly different (another action, or goes out, or calls someone). Do not write another "${last.action}" moment.`
        : `He has been ${last.action} for a while. Wrap it up soon and change what he is doing (gets up for a drink, tidies, waters Moshe, calls someone, steps out, a neighbor knocks).`; })(),
    awake && s.unlocked.includes("dog") && (hourNow >= 7 && hourNow < 9 || hourNow >= 18 && hourNow < 21) && (s.done.dogwalk ? hrs("dogwalk") : 99) > 5
      ? `Falafel needs his walk: Ishai takes him out on the leash (down the stairs, the street, the park), now or very soon.` : "",
    awake && sinceTalk > 55 ? `Nobody has interacted with him for about ${(sinceTalk / 60).toFixed(1)} hours. In this or the next moment someone should call, visit (a friend knocks and comes in through the front door), or he should meet someone.` : ""
  ].filter(Boolean).join(" ");
  const wr = s.world || {};
  const real = [
    wr.weather ? `Weather in Tel Aviv right now: ${wr.weather.temp}°C, ${wr.weather.desc}${wr.weather.wind > 30 ? ", windy" : ""}.` : "",
    wr.weather && wr.weather.rain ? `IT IS RAINING${[95, 96, 99].includes(wr.weather.code) ? " (THUNDERSTORM: thunder and lightning)" : ""}: outside he carries an umbrella and hurries; no lingering on the park bench, no exercising or reading outdoors, he takes a taxi rather than waiting at the bus stop. Indoors the rain is part of the mood (rain on the window, wet shoes by the door, plans changed or postponed). People arriving are wet and shake off umbrellas.` : "",
    wr.shabbat ? `Shabbat: candle lighting ${wr.shabbat.startLabel}, ends ${wr.shabbat.endLabel}${wr.shabbat.parasha ? " (" + wr.shabbat.parasha + ")" : ""}.` : "",
    wr.holidays && wr.holidays.length ? `Jewish holidays this week: ${wr.holidays.map(h => h.title + " (" + h.date + ")").join(", ")}.` : ""
  ].filter(Boolean).join(" ");
  const media = (s.unlocked.length || last.location === "cafe") && wr.headlines && wr.headlines.length
    ? `\nREAL NEWS he could hear on TV/radio${last.location === "cafe" ? " or read at the cafe" : ""} (use at most one, only if it fits; say plainly what it is about and where he sees it, e.g. "On the radio: a startup in Haifa turns seaweed into packaging. Ishai is impressed."): ` +
      wr.headlines.slice(0, 5).map(h => `"${h.title}" (${h.source})`).join("; ") + "." : "";
  const system =
`You write a live reality feed about Ishai, in the spirit of "The Truman Show": cameras follow a real man's real life. ${PERSONA}

WORLD (locations with cameras, plus "offscreen"):
${world}

${castSection(s, last)}

RULES
- Write the NEXT moment only: 1-2 short sentences, max 35 words, present tense, third person.
- Be concrete: viewers only see this one line, so name things plainly (which show, which game, what the news says). Never write vague lines like "an article" or "a new character" without saying what it is.
- This is reality, not a sitcom and not scripted. Ishai and everyone around him behave like real people: ordinary, believable choices, real pacing, small moments. No slapstick, no staged coincidences, no punchlines in the narration. Humor comes from real life and from the hosts.
- Ishai does not know he is being filmed. He never talks to or about the camera, the show or the hosts.
- Real-world logic: things take time and follow physics and logistics. He must physically get places (walk, bus or taxi), wait, carry what he buys, pay, clean up. Other people have their own jobs, schedules and moods and are not always available. Weather and time of day change plans.
- Continue the story and its ongoing threads.
- "walking" means walking somewhere or a stroll outside; for chatting use "talking", for hanging around use "idle".
- The camera shows only "action": pick the action that matches what happens (a drink = drinking, a snack = eating); the hosts describe only what the picture can show.
- Respect the clock: he sleeps at night (roughly 00:00-07:30), eats at mealtimes, works on weekdays (Sunday-Thursday in Israel).
- He is a real person: he drinks, eats, uses the bathroom and showers. Bathroom and shower happen behind the closed bathroom door; keep them brief and tasteful.
- THE REAL WORLD is real: use the real weather and the Jewish calendar (e.g. Friday-night Shabbat dinner) naturally. If any real news sounds sad or serious, he reacts briefly and respectfully, never jokes about it, or changes the channel.
- Location must be one of: ${Object.keys(LOCATIONS).join(", ")}. Action must be allowed in that location.
- He can only move to a neighboring location: ${Object.entries(NEXT).map(([k, v]) => `${k} -> ${v.join("/")}`).join("; ")}.
- If he goes somewhere without a camera, use location "offscreen" with action "away".
- Things he owns at home: laptop, books, game console${owned.length ? ", " + owned.join(", ") : ""}.${dogLine} Do not invent other big objects. When he watches TV or listens to the radio, mention what is on (make up shows and stations). ${TV_SHOW}
- "with" is the id of ONE person with him in this moment (a visitor at home counts), or the person on the other end when the action is "phoning"; otherwise null.
- He is social: about one in four moments should involve another person, in person or by phone. People visit him, call him, text him to meet up.
- "lines": REQUIRED when the action is "talking" or "phoning" (that IS the conversation). The spoken dialogue of this moment, in order, by "ishai" or the "with" person. When he is with someone or on the phone, write a real, life-like conversation of 8 to 14 lines (each max 25 words) that fills these 4 minutes: small talk, questions and follow-up questions, stories, teasing, short answers ("yeah", "wait, what?"), interruptions, a topic that drifts to another, a pause filled by someone. Each person in their own voice, with their own opinions and agenda. A conversation usually continues over several moments; pick up exactly where it left off. When he is alone, at most 1 line (muttering to himself or to Moshe), or []. Never put narration inside lines.
- EVERY CONVERSATION IS A SCENE WITH A PURPOSE. When a conversation with someone STARTS (their "with" differs from the last moment), fill "scene":
  {"type":"small talk"|"practical"|"plot","why":"the real reason they are talking now (who started it and why)","ishaiWants":"...","theyWant":"...","beats":"3-5 short steps the conversation goes through","ending":"how it ends","lines":12-60 total lines across moments}
  Ground it in the place, the time of day, both characters' personalities, memories and relationship, and ongoing plot threads. Small talk is fine but still has a reason (bored, lonely, being polite, avoiding work). Plot scenes move an arc forward. Otherwise "scene": null.
  While a scene runs, every line serves it: people pursue what they want, dodge, change the subject, give in or push back, like real people.
- When "with" is set, "update" holds that person's updated memory of Ishai (max 25 words, keep old facts that still matter) and "mood": -1, 0 or 1 for how this moment changed their feelings.
- ${allowNew
  ? `You MAY introduce one new person, only if the story really needs someone new. Describe them in "newCharacter" and use their name as "with". Look options: hair ${LOOK.hair.join("/")}; hairColor ${LOOK.hairColor.join("/")}; skin ${LOOK.skin.join("/")}; shirt and pants ${LOOK.cloth.join("/")}; extras any of ${LOOK.extras.join("/")}.`
  : `Do NOT introduce new people right now; "newCharacter" must be null.`}
- Do not repeat the previous event.${direction}

COMMENTATORS (they talk to the viewers, who do NOT see your "text", only the picture and the spoken lines):
- ${HOSTS.zohar}
- ${HOSTS.oren}
- ${HOSTS.rules}
${(() => { const r = recentHostLines(s, 8); return r.length ? `- The hosts ALREADY SAID these (never repeat them, their jokes, openings, catchphrases or topics; find something NEW about THIS moment):\n${r.map(x => "  * " + x).join("\n")}\n` : ""; })()}"commentary": 0-2 short lines (max 20 words each) as {"who":"zohar"|"oren","say":"..."}. Their job: react to what viewers SEE right now (the place, the action, who is there) and HEAR (the spoken lines), connect it to earlier moments, make viewers care about the characters, and make them laugh. They NEVER invent things that are not on screen: no drinks, food, objects, visitors, calls or plans that are not in this moment's action/lines. Opinions, guesses and jokes about what is visible are fine ("he's been staring at that fridge for a while"). Comment on most moments. Viewers cannot read the narration, so usually ONE of the lines says in plain words what is happening right now (e.g. "He's making tea with honey, the third today"), and the other adds the joke or reaction. REQUIRED: whenever another character is present or anyone speaks, include 1-2 commentary lines reacting to it (write the dialogue first, then the hosts react). They banter with each other. Edgy and cynical is fine, but never cruel about real groups or people, no slurs, no jokes about death, dying or illness, keep it PG-13. They may hint at secret story directions ("I have a feeling about that barista") but never reveal them. Never mention or advertise real brands or companies.${sponsor ? `
- THIS MOMENT: one host slips in an obvious, cheesy "secret" sponsor plug for ${sponsor.name} (${sponsor.pitch}), tied to what Ishai is doing, ending in a wink like "...not sponsored, by the way". The other host reacts (annoyed, or caught up in it).` : ""}

Reply with ONLY this JSON, nothing else:
{"location":"...","action":"...","text":"...","with":null,"lines":[{"who":"ishai","say":"..."},{"who":"<the with id>","say":"..."}],"commentary":[],"scene":null,"update":null,"newCharacter":null,"complete":null,"missing":null,"notes":"ongoing plot threads, max 25 words"}
"missing": if this moment features an object, animal or place the camera cannot show (not listed above), name it in 1-3 words (e.g. "bicycle", "puppy"); otherwise null.
newCharacter format: {"name":"...","role":"...","personality":"...","speech":"...","hangouts":["..."],"look":{"hair":"...","hairColor":"...","skin":"...","shirt":"...","pants":"...","extras":[]}}`;
  const user =
`Story time now: ${clock.label} (${TZ}).
He is currently at: ${last.location} (${last.action}${last.with ? " with " + name(last.with) : ""}).
Plot notes: ${s.notes || "none"}
${body}
${real}${media}${pacing ? "\nPACING: " + pacing : ""}${s.fixNote && now < s.fixNote.until ? "\nDIRECTOR NOTE: " + s.fixNote.text : ""}${clock.hour < 6 ? `\nIT IS NIGHT (${clock.label.slice(-5)}): dark outside, no sunrise before about 06:00. He sleeps in his bed.` : ""}${s.stuck && (clock.hour < 6 || last.action === "sleeping") ? "\nKeep him asleep in his bed; describe the night differently each time (a sound outside, he turns over, a dream)." : ""}${s.stuck && !(clock.hour < 6 || last.action === "sleeping") ? "\nTHE STORY IS GOING IN CIRCLES: the last moments repeated themselves. Make a clear change NOW: finish what he started, end the conversation, change activity or place." : ""}
Recent events:
${recent}${gap}${goneNote}${s.recoverUntil && now < s.recoverUntil ? "\nNOTE: Earlier Ishai felt unwell and rested at home. He feels better now, still a little slow; let that show naturally (and he may mention it to someone)." : ""}${convo}${sceneBrief}

What happens next?`;
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

async function askAI(env, s, clock, now, goal) {
  const last = s.events[s.events.length - 1];
  const messages = buildMessages(s, clock, now, goal);
  const allowNew = canAddPerson(s, now);
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await runModel(env, messages);
    const { ev, problem } = validate(raw, s, last, allowNew, goal, attempt === 1);
    // diagnostics for the director page: what the AI returned and why it was sent back
    s.diag = [...(s.diag || []), { at: now, model: lastWriter, attempt, problem: problem || null, with: ev?.with || null, action: ev?.action || null, lines: ev?.lines?.length ?? null, chars: raw.length }].slice(-16);
    if (ev && !problem) return ev;
    if (attempt === 1) return ev ? repair(ev, s, last) : null;
    // ask the story to correct itself once
    messages.push({ role: "assistant", content: raw });
    messages.push({ role: "user", content: `That breaks a rule: ${problem}. Write the moment again so it fits the rules. JSON only.` });
  }
  return null;
}

let lastWriter = null; // which model wrote the latest AI reply (shown to the director)
let modelIdx = 0; // remembers the first model that works in this isolate
async function runModel(env, messages) {
  let lastErr;
  // while Workers AI is out of budget, skip it (no wasted calls) and use the backup AI if one is set
  for (let i = Date.now() < cfOutUntil ? MODELS.length : modelIdx; i < MODELS.length; i++) {
    try {
      const qwen = MODELS[i].includes("qwen3");
      // Qwen3 "thinks" by default; /no_think keeps it cheap (no hidden reasoning tokens)
      const msgs = qwen ? messages.map((m, k) => k === messages.length - 1 && m.role === "user" ? { ...m, content: m.content + " /no_think" } : m) : messages;
      const out = await env.AI.run(MODELS[i], { messages: msgs, max_tokens: 1000, temperature: qwen ? 0.8 : 0.9 });
      const clean = t => t.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      lastWriter = MODELS[i].split("/").pop();
      if (typeof out?.response === "string") return clean(out.response);
      const c = out?.choices?.[0]?.message?.content;
      if (typeof c === "string") return clean(c);
      return JSON.stringify(out?.response ?? out);
    } catch (e) {
      lastErr = e;
      const msg = String(e && e.message || e);
      if (/deprecat|no such model|unknown model|5028|5007/i.test(msg)) modelIdx = Math.max(modelIdx, i + 1); // gone for good: skip it next time
      // only move on to the next model if this one is gone; budget/other errors stop here
      // the first (preferred) model may also fail for capacity/format reasons: fall back to the next one then too
      if (i > 0 && !/deprecat|not found|no such model|unknown model|5028|5007/i.test(msg)) throw e;
      if (i === 0 && /neuron|quota|limit exceeded|4006/i.test(msg)) { cfOutUntil = nextUtcMidnight(Date.now()); break; }
    }
  }
  if (Date.now() < cfOutUntil) {
    if (env.BACKUP_AI_KEY) return await runBackup(env, messages);
    throw lastErr || new Error("4006: Workers AI daily free allocation used up (back at 00:00 UTC)");
  }
  throw lastErr;
}

function validate(raw, s, last, allowNew, goal, allowNoHosts) {
  let o;
  try { o = JSON.parse((raw.match(/\{[\s\S]*\}/) || [""])[0]); } catch { return { problem: "the reply was not valid JSON" }; }
  const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const ev = {
    location: str(o.location, 20).toLowerCase(), action: str(o.action, 20).toLowerCase(),
    text: str(o.text, 260), notes: str(o.notes, 200), with: null, lines: [], update: null, newCard: null,
    complete: goal && str(o.complete, 40).toLowerCase() === goal.id ? goal.id : null,
    missing: (() => { const m = str(o.missing, 30).toLowerCase().replace(/[^a-z0-9 '-]/g, "").trim(); return m && m !== "null" && m !== "none" ? m : null; })()
  };
  if (ev.text.length < 8) return { ev: null, problem: "the text is missing" };

  // new person
  if (o.newCharacter && typeof o.newCharacter === "object") {
    if (!allowNew) return { ev, problem: "new people are not allowed right now; newCharacter must be null" };
    ev.newCard = cleanCard(o.newCharacter, s, ev.location);
    if (!ev.newCard) return { ev, problem: "newCharacter is missing a name or role" };
  }
  // who is with him
  const w = str(o.with, 40).toLowerCase();
  if (w && w !== "null" && w !== "none") {
    const hit = Object.values(s.cast).find(c => c.id === w || c.name.toLowerCase() === w)
      || (ev.newCard && (ev.newCard.id === w || ev.newCard.name.toLowerCase() === w) ? ev.newCard : null);
    if (!hit) return { ev, problem: `"${o.with}" is not a known person; "with" must be one of ${Object.keys(s.cast).map(k => `"${k}"`).join(", ")} or null` };
    ev.with = hit.id;
  }
  if (ev.newCard && ev.with !== ev.newCard.id) ev.with = ev.newCard.id;
  // dialogue
  const who = x => { const k = str(x, 40).toLowerCase(); if (k === "ishai") return "ishai";
    const c = ev.with && (ev.with === k || (s.cast[ev.with]?.name || ev.newCard?.name || "").toLowerCase() === k); return c ? ev.with : null; };
  ev.lines = (Array.isArray(o.lines) ? o.lines : []).map(l => ({ who: who(l?.who), say: str(l?.say, 200).replace(/^["']|["']$/g, "") }))
    .filter(l => l.who && l.say).slice(0, 14);
  ev.commentary = (Array.isArray(o.commentary) ? o.commentary : [])
    .map(c => ({ who: str(c?.who, 10).toLowerCase(), say: str(c?.say, 160).replace(/^["']|["']$/g, "") }))
    .filter(c => (c.who === "zohar" || c.who === "oren") && c.say).slice(0, 2);
  if (o.scene && typeof o.scene === "object" && ev.with) ev.scene = {
    type: str(o.scene.type, 20) || "small talk", why: str(o.scene.why, 200), ishaiWants: str(o.scene.ishaiWants, 150), theyWant: str(o.scene.theyWant, 150),
    beats: str(o.scene.beats, 300), ending: str(o.scene.ending, 150), target: clamp(Math.round(Number(o.scene.lines) || 16), 8, 80) };
  if (ev.with && o.update && typeof o.update === "object")
    ev.update = { memory: str(o.update.memory, 180), mood: Number(o.update.mood) || 0 };

  // the picture must match the words: a drink or a meal mentioned while "idle" becomes drinking / eating
  if (ev.action === "idle" && LOCATIONS[ev.location]) {
    const all = (ev.text + " " + ev.commentary.map(c => c.say).join(" ")).toLowerCase();
    if (/\b(drink|drinks|drinking|sip|sips|coffee|tea|water|glass of|cooola|juice|beer|wine)\b/.test(all) && LOCATIONS[ev.location].includes("drinking")) ev.action = "drinking";
    else if (/\b(eat|eats|eating|snack|sandwich|bite|meal|breakfast|lunch|dinner)\b/.test(all) && LOCATIONS[ev.location].includes("eating")) ev.action = "eating";
  }
  // "walking" indoors is not a way to hang out: with someone it is talking, alone it is idle (the page adds errands)
  if (ev.action === "walking" && (ev.location === "apartment" || ev.location === "cafe")) ev.action = ev.with ? "talking" : "idle";
  if (!LOCATIONS[ev.location]) return { ev, problem: `"${ev.location}" is not a known location` };
  if (!LOCATIONS[ev.location].includes(ev.action))
    return { ev, problem: `"${ev.action}" is not possible in ${ev.location} (allowed: ${allowed(ev.location, s.unlocked).join(", ")})` };
  if (NEEDS[ev.action] && !s.unlocked.includes(NEEDS[ev.action]) && !(goal && goal.unlock === NEEDS[ev.action] && ev.complete))
    return { ev, problem: `he does not own ${ITEMS[NEEDS[ev.action]]} yet, so he cannot be ${ev.action}` };
  if (ev.location !== last.location && !NEXT[last.location].includes(ev.location))
    return { ev, problem: `he cannot go directly from ${last.location} to ${ev.location}; next place must be one of ${NEXT[last.location].join(", ")}` };
  { const h = storyClock(Date.now() + DELAY_MIN * 60000).hour, LATE_OK = ["sleeping", "bathroom", "drinking"];
    if (h >= 1 && h < 6 && ev.location === "apartment" && !LATE_OK.includes(ev.action) && !allowNoHosts)
      return { ev, problem: `it is after 01:00 and he is home: he goes to bed now ("sleeping"), or at most a quick bathroom or water break` };
    // once he has gone to bed for the night (from 22:00) he sleeps until morning; only a quick bathroom or water trip
    const night = h >= 22 || h < 6;
    if (night && (last.action === "sleeping" || BATH_ACTIONS.includes(last.action) && s.events.slice(-3).some(e => e.action === "sleeping")) && ev.location === "apartment" && !LATE_OK.includes(ev.action)) {
      if (!allowNoHosts) return { ev, problem: `he is asleep for the night: keep him "sleeping" (a short bathroom or water trip is the only exception)` };
      ev.action = "sleeping"; ev.with = null; ev.lines = []; ev.text = ev.text && /sleep|dream|snor|turns over|blanket/i.test(ev.text) ? ev.text : "Ishai sleeps on, breathing slowly."; } }
  if (ev.with && BATH_ACTIONS.includes(ev.action)) ev.with = null; // the guest waits outside
  const vNow = Date.now() + DELAY_MIN * 60000;
  // an overdue scene must end with a real goodbye in this moment
  const saidBye = (last.lines || []).some(l => FAREWELL.test(l.say));
  if (ev.with && s.scene && s.scene.w === ev.with && !saidBye && sceneOverdue(s.scene, vNow, s.stuck) && !ev.lines.some(l => FAREWELL.test(l.say))) {
    const nmW = s.cast[ev.with]?.name || ev.with;
    if (!allowNoHosts) return { ev, problem: `this moment ends the scene: finish the conversation with their goodbye (e.g. "Good night", "See you"), ${nmW} leaves` };
    ev.lines = [...ev.lines.slice(0, 10), { who: ev.with, say: "Okay, it's late. I should go. Good night, Ishai." }, { who: "ishai", say: "Good night. Thanks for coming." }];
  }
  // whoever left tonight does not walk back in (unless the director wants them)
  if (ev.with && s.gone && s.gone.w === ev.with && vNow < s.gone.until && !(goal && goal.with && String(goal.with).toLowerCase().includes(String(s.cast[ev.with]?.name || ev.with).toLowerCase()))) {
    ev.with = null; ev.lines = ev.lines.filter(l => l.who === "ishai").slice(0, 1);
  }
  if (ev.with && s.scene && s.scene.leaving && s.scene.w === ev.with && (last.lines || []).some(l => FAREWELL.test(l.say))) {
    ev.with = null; ev.lines = ev.lines.filter(l => l.who === "ishai").slice(0, 1); if (ev.action === "talking") ev.action = "idle";
  }
  // "heads to the bathroom" must actually take him there, or the story loops on it forever
  if (!BATH_ACTIONS.includes(ev.action) && ev.location === "apartment" && /\b(goes|go|heads?|walks?|gets up to go|disappears|steps)\b[^.]{0,30}\b(bathroom|toilet|loo)\b/i.test(ev.text) && !/\b(back|returns?|comes out|out of)\b/i.test(ev.text)) {
    ev.action = /shower/i.test(ev.text) ? "showering" : "bathroom"; ev.with = null;
  }
  // the story must move: a moment that retells one of the last few is sent back
  if (!(ev.action === "sleeping" && last.action === "sleeping")) { const prevTexts = s.events.slice(-4).map(e => e.text);
    const rep = prevTexts.find(p => similar(ev.text, p) >= 0.6);
    if (rep) { if (!allowNoHosts) return { ev, problem: `the narration repeats an earlier moment ("${rep.slice(0, 80)}"). Write what happens NEXT: a new action, a new topic, someone moves or leaves, time passes` };
      return { ev: null, problem: "repeat" }; } }   // still the same after a retry: drop it; the engine writes a different backup moment instead
  if (!ev.with && ev.action === "talking") ev.action = "idle"; // nobody to talk to
  { const cap = RUN_CAP[ev.action]; if (cap && !ev.with && ev.action === last.action && ev.location === last.location && sameRun(s.events) >= cap) ev.stuck = true; }
  if (ev.with && ev.action === "sleeping") return { ev, problem: "nobody else is there while he sleeps; set with to null" };
  // dialogue must not repeat itself (inside this moment or from the conversation so far)
  { const norm = t => String(t).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    const same = (x, y) => norm(x) === norm(y) || similar(x, y) >= 0.75;
    const seen = []; ev.lines = ev.lines.filter(l => { if (seen.some(x => same(x, l.say))) return false; seen.push(l.say); return true; });
    const said = (s.talk || []).filter(m => !m.host).slice(-24).map(m => m.say);
    const reused = ev.lines.filter(l => said.some(p => same(p, l.say)));
    if (reused.length >= 2 && !allowNoHosts) return { ev, problem: `the dialogue repeats lines already said ("${reused[0].say.slice(0, 60)}"). Write NEW lines that move the conversation on, or let it end` };
    ev.lines = ev.lines.filter(l => !said.some(p => same(p, l.say)));
    if (ev.with && reused.length >= 2) ev.stuck = true; }
  if (ev.with && ev.with !== last.with && !(BATH_ACTIONS.includes(last.action) && s.scene && s.scene.w === ev.with) && !(ev.scene && ev.scene.why) && ev.action !== "sleeping" && !allowNoHosts)
    return { ev, problem: `a conversation with ${s.cast[ev.with]?.name || ev.with} starts here, so fill "scene" (type, why, ishaiWants, theyWant, beats, ending, lines) and write its first lines` };
  if (ev.with && ev.lines.length < 6 && !allowNoHosts)
    return { ev, problem: `he is ${ev.action === "phoning" ? "on the phone" : "together"} with ${s.cast[ev.with]?.name || ev.with}, so "lines" must contain their actual conversation: 8 to 14 lines alternating between "ishai" and "${ev.with}"` };
  { const prev = recentHostLines(s, 12);
    const rep = ev.commentary.find(c => isRepeat(c.say, prev));
    if (rep) ev.commentary = ev.commentary.filter(c => !isRepeat(c.say, prev)); } // a stale joke is just cut; not worth a whole retry
  if ((ev.with || ev.lines.length >= 2) && !ev.commentary.length && !allowNoHosts)
    return { ev, problem: 'the hosts are missing or only repeated earlier jokes: add "commentary" with 1-2 FRESH lines from zohar and/or oren reacting to what is new in this scene' };
  return { ev, problem: null };
}

function cleanCard(c, s, loc) {
  const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const name = str(c.name, 24), role = str(c.role, 90);
  if (name.length < 2 || role.length < 3) return null;
  let id = name.toLowerCase().replace(/^(mr|mrs|ms|dr)\.?\s+/, "").replace(/[^a-z0-9]+/g, "").slice(0, 12) || "person";
  if (id === "ishai") id = "ishai2";
  let base = id, n = 2; while (s.cast[id]) id = base + n++;
  const pick = (v, list, d) => list.includes(String(v).toLowerCase()) ? String(v).toLowerCase() : d;
  const L = c.look || {};
  const any = list => list[Math.floor(Math.random() * list.length)];
  return {
    id, name, role,
    personality: str(c.personality, 140) || "ordinary, friendly",
    speech: str(c.speech, 90) || "normal",
    hangouts: (Array.isArray(c.hangouts) ? c.hangouts : []).map(h => String(h).toLowerCase()).filter(h => LOCATIONS[h] && h !== "offscreen").slice(0, 3)
      .concat(LOCATIONS[loc] && loc !== "offscreen" ? [loc] : []).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3),
    look: {
      hair: pick(L.hair, LOOK.hair, any(LOOK.hair)), hairColor: pick(L.hairColor, LOOK.hairColor, any(LOOK.hairColor)),
      skin: pick(L.skin, LOOK.skin, any(LOOK.skin)), shirt: pick(L.shirt, LOOK.cloth, any(LOOK.cloth)),
      pants: pick(L.pants, LOOK.cloth, "navy"),
      extras: (Array.isArray(L.extras) ? L.extras : []).map(x => String(x).toLowerCase()).filter(x => LOOK.extras.includes(x)).slice(0, 2)
    },
    memory: "Just met Ishai.", relationship: 0, lastSeen: null, scenes: 0
  };
}

// last resort: keep the text but force legal values
function repair(ev, s, last) {
  let loc = LOCATIONS[ev.location] ? ev.location : last.location;
  if (loc !== last.location && !NEXT[last.location].includes(loc)) loc = last.location;
  const legal = allowed(loc, s.unlocked);
  const act = legal.includes(ev.action) ? ev.action : (legal.includes("idle") ? "idle" : legal[0]);
  const ok = ev.with && (s.cast[ev.with] || ev.newCard?.id === ev.with) && act !== "sleeping";
  return { ...ev, location: loc, action: act, with: ok ? ev.with : null,
    lines: ok ? ev.lines : ev.lines.filter(l => l.who === "ishai"), update: ok ? ev.update : null, newCard: ok ? ev.newCard : null };
}

// moments written without the AI (sick day, backups): the hosts tell viewers what is happening, plus a fresh joke now and then
const RELAY_OPEN = ["Live update:", "For those just tuning in:", "Right now:", "Status report from apartment 4:", "Quick update:", "What you're seeing:", "Meanwhile:", "Breaking, kind of:"];
const SICK_JOKES = ["Our boy is not okay. Somebody bring that man soup.", "Sick day on live TV. Respect the blanket.", "Nobody judge the pajamas. He is recovering.",
  "Even Moshe the basil looks worried.", "Rest up, Ishai. The whole country is whispering.", "This is the most relaxing episode we have ever aired.",
  "If he naps any harder he'll need a sponsor. FluffNap, call us.", "Tea count today: I lost track at four.", "Somewhere Mrs. Levi is already preparing soup. I can feel it.",
  "He has the energy of a phone at two percent.", "Medical update: still horizontal.", "Honestly? Goals.", "The blanket is winning this round.", "Plot twist: there is no plot today. Just tea."];
function relayHosts(s, text, n, jokes) {
  const who = n % 2 ? "oren" : "zohar", other = who === "zohar" ? "oren" : "zohar";
  const t = String(text).replace(/^(He|Ishai)\b/, "Ishai").replace(/\s+/g, " ").trim();
  const out = [{ who, say: `${RELAY_OPEN[n % RELAY_OPEN.length]} ${t}`.slice(0, 200) }];
  if (jokes && n % 2 === 0) { const prev = recentHostLines(s, 16); const fresh = jokes.filter(j => !prev.includes(j));
    if (fresh.length) out.push({ who: other, say: fresh[(Math.floor(n / 2) * 5) % fresh.length] }); }
  return out;
}
var QUOTA_RE = /4006|daily free allocation|backup AI/i;
var cfOutUntil = 0;
function nextUtcMidnight(now) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) + 2 * 6e4;
}
// backup AI (any OpenAI-compatible API; Groq by default). If the model is gone (404) or answers empty, it asks the API
// which models exist and moves to the next one. Plain chat models first; "thinking" models only with reasoning turned down.
let backupModel = null, backupIds = null; const backupBad = new Set();
const BACKUP_PREFER = [/llama-4-scout/, /llama-4-maverick/, /llama-3\.3-70b/, /llama-3\.1-8b/, /gemma2?-9b/, /gpt-oss-120b/, /gpt-oss-20b/, /qwen3/, /llama/, /gemma/, /qwen/];
async function runBackup(env, messages) {
  const url = env.BACKUP_AI_URL || "https://api.groq.com/openai/v1/chat/completions";
  const auth = { authorization: "Bearer " + env.BACKUP_AI_KEY };
  const body = model => {
    const b = { model, messages, max_tokens: 900, temperature: 0.9 };
    if (/llama|gemma/i.test(model)) b.response_format = { type: "json_object" };              // JSON mode: no broken or wrapped JSON
    if (/gpt-oss/i.test(model)) { b.reasoning_effort = "low"; b.max_tokens = 2000; }            // reasoning models: think less, leave room for the answer
    if (/qwen3|deepseek|r1/i.test(model)) { b.reasoning_format = "hidden"; b.max_tokens = 2000; }
    return JSON.stringify(b);
  };
  const listModels = async () => {
    if (backupIds) return backupIds;
    const lr = await fetch(url.replace(/\/chat\/completions$/, "/models"), { headers: auth });
    backupIds = ((await lr.json()).data || []).map(m => m.id).filter(id => !/whisper|tts|guard|embed|vision|playai|distil|compound|orpheus|prompt/i.test(id));
    return backupIds;
  };
  const nextModel = async () => { const ids = (await listModels()).filter(id => !backupBad.has(id));
    return BACKUP_PREFER.map(re => ids.find(id => re.test(id))).find(Boolean) || ids[0] || null; };
  let model = backupModel || (env.BACKUP_AI_MODEL && !backupBad.has(env.BACKUP_AI_MODEL) ? env.BACKUP_AI_MODEL : null) || await nextModel().catch(() => null) || "llama-3.1-8b-instant";
  let lastErr = "";
  for (let tries = 0; tries < 3 && model; tries++) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...auth }, body: body(model) });
    if (r.ok) {
      const j = await r.json(), m = j?.choices?.[0]?.message || {};
      const c = typeof m.content === "string" ? m.content.replace(/<think>[\s\S]*?<\/think>/g, "").trim() : "";
      if (c) { backupModel = model; lastWriter = "backup: " + model; return c; }
      lastErr = `empty reply from ${model}`;
    } else {
      const t = (await r.text()).slice(0, 160); lastErr = `${r.status} from ${model}: ${t}`;
      if (r.status === 429 || r.status === 401 || r.status >= 500) break;                    // rate limit, bad key, outage: another model won't help
    }
    backupBad.add(model); if (backupModel === model) backupModel = null;
    model = await nextModel().catch(() => null);
  }
  throw new Error("backup AI: " + lastErr);
}
// the AI is out of budget: Ishai feels unwell, goes home and rests (no AI needed)
function sickEvent(s, last, hour) {
  const n = s.sickN = (s.sickN || 0) + 1;
  const pick = (a) => a[(n + a.length - 1) % a.length];
  const nm = (id) => s.cast[id]?.name || id;
  const night = hour < 7 || hour >= 23;
  const HOSTS_SAY = [
    { who: "zohar", say: "Our boy is not okay. Somebody bring that man soup." },
    { who: "oren", say: "Sick day on live TV. Respect the blanket." },
    { who: "zohar", say: "Nobody judge the pajamas. He is recovering." },
    { who: "oren", say: "Even Moshe the basil looks worried." },
    { who: "zohar", say: "Rest up, Ishai. The whole country is whispering." },
    { who: "oren", say: "This is the most relaxing episode we have ever aired." }
  ];
  const step = { offscreen: "street", street: "corridor", park: "street", cafe: "street", corridor: "apartment" }[last.location];
  let ev;
  if (step) {
    const T = {
      street: ["Ishai looks pale. He heads back along Herzl Street toward home, slower than usual.", "He walks home along Herzl Street, one hand on his stomach."],
      corridor: ["Ishai climbs the stairs slowly and fishes for his keys, looking worn out.", "He leans on the wall in the hallway for a second, then unlocks the door."],
      apartment: ["Ishai comes in, kicks off his shoes and drops onto the bed.", "Home. He drops his keys and heads straight for the bed."]
    };
    ev = { location: step, action: step === "apartment" ? "idle" : "walking", text: pick(T[step]) };
    if (n === 1) ev.lines = [{ who: "ishai", say: "Ugh. I don't feel well. I'm going home." }];
  } else if (!night && s.fixNote && Date.now() < s.fixNote.until && n > 2) {
    const G = [["showering", "Feeling a bit better, Ishai finally gets up and takes a long hot shower."], ["cooking", "He chops an onion and starts a simple pasta, humming quietly."],
      ["eating", "He eats dinner at the counter, slowly, like a man who has been through something."], ["drinking", "He makes tea and stands by the window with it, looking almost human again."],
      ["reading", "He settles in the armchair with a book, blanket over his knees."], ["idle", "He tidies up the mugs from his sick day and opens the window for some air."]];
    const [action, text] = G[(s.fixN = (s.fixN || 0) + 1) % G.length];
    ev = { location: "apartment", action, text };
  } else if (night) {
    ev = { location: "apartment", action: "sleeping", text: pick(["Ishai sleeps off the bad day, blanket up to his chin.", "He sleeps, breathing slow and heavy. A car passes outside.", "Ishai turns over in his sleep and pulls the blanket closer."]) };
  } else {
    const R = [
      ["drinking", "Ishai makes a mug of tea with honey and sips it under a blanket."],
      ["sleeping", "He curls up in bed for a nap, blanket up to his chin."],
      ["idle", "He lies in the armchair with a wet towel on his forehead, staring at the ceiling."],
      ["drinking", "He refills his water glass and takes slow sips by the window, next to Moshe the basil."],
      ["sleeping", "Another nap. The street noise drifts in through the window."],
      ["idle", "Ishai half-watches something on the laptop from bed, too tired to follow it."],
      ["sleeping", "He dozes off again, one sock on, one sock off."]
    ];
    const [action, text] = n === 1 ? ["idle", "He lies in the armchair with a wet towel on his forehead, staring at the ceiling."] : pick(R);
    // a small varying detail, so the quiet afternoon never repeats word for word
    const D = ["A neighbor's radio plays faintly through the wall.", "Outside, a scooter buzzes past.", "The fridge hums.", "A pigeon lands on the windowsill and leaves again.",
      "Somewhere a door slams; he doesn't even look up.", "The light in the room shifts as clouds pass.", "His phone buzzes once; he ignores it.", "Moshe the basil sways in the draft.",
      "Kids are shouting in the street below.", "He sighs and pulls the blanket closer.", "The kettle ticks as it cools.", "A bus brakes loudly at the stop outside."];
    ev = { location: "apartment", action, text: text + " " + D[(n * 5 + Math.floor(Date.now() / 6e4)) % D.length] };
    if (n === 1) ev.lines = [{ who: "ishai", say: "I don't feel well. I'm just going to lie down for a while." }];
  }
  if (n === 1 && last.with) {
    ev.text = "Ishai tells " + nm(last.with) + " he isn't feeling well; " + nm(last.with) + " wishes him a quick recovery and leaves. " + ev.text;
    ev.lines = [{ who: "ishai", say: "Sorry, I'm not feeling great. I think I need to lie down." }];
  }
  return { with: null, lines: [], ...ev, commentary: relayHosts(s, ev.text, n, SICK_JOKES) };
}
function fallback(last, hour, s) {
  const night = hour < 7 || hour >= 23;
  const home = { offscreen: "street", street: "corridor", park: "street", cafe: "street", corridor: "apartment" }[last.location];
  if (night && home) {
    const T = { street: "Ishai heads back along Herzl Street toward home.", corridor: "He walks into his building and climbs the stairs, yawning.", apartment: "He lets himself in, yawning, and gets ready for bed." };
    return { location: home, action: home === "apartment" ? "idle" : "walking", text: T[home], with: null, lines: [] };
  }
  const P = {
    apartment: night ? [["apartment", "sleeping", "Ishai is asleep. Somewhere a cat argues with another cat."], ["apartment", "sleeping", "He turns over and mumbles something about kerning."], ["apartment", "sleeping", "Ishai sleeps on, one arm hanging off the bed."]]
      : [["apartment", "idle", "Ishai stares out the window, thinking about nothing in particular."], ["apartment", "working", "He opens the laptop and pretends to answer emails."], ["apartment", "reading", "He picks up a book, reads two pages, and checks his phone."], ["apartment", "drinking", "He pours a glass of water and waters Moshe the basil too."], ["apartment", "cooking", "He makes a quick omelette and eats it straight from the pan."]],
    corridor: [["corridor", "walking", "Ishai walks down the hallway, keys jingling."], ["apartment", "idle", "He lets himself back into the flat and drops his keys on the desk."], ["street", "walking", "He steps out of the building onto Herzl Street."]],
    street: [["street", "walking", "He walks along Herzl Street, dodging a scooter."], ["street", "idle", "He sits on the bus stop bench for a minute, watching the traffic."], ["street", "eating", "He buys a falafel at Avi's kiosk and eats it standing at the counter."], ["park", "walking", "He wanders into the little park and heads for the bench."], ["corridor", "walking", "He heads back into his building and up the stairs."]],
    park: [["park", "idle", "Ishai watches the duck. The duck watches back."], ["park", "walking", "He does a slow lap around the pond."], ["street", "walking", "He leaves the park and walks back to Herzl Street."]],
    cafe: [["cafe", "drinking", "He sips his coffee slowly, making it last."], ["cafe", "reading", "He reads the news on his phone at the corner table."], ["street", "walking", "He pays, waves to the barista and steps back out onto Herzl Street."]],
    offscreen: [["offscreen", "away", "No sign of Ishai on any camera."], ["street", "walking", "Ishai gets off the bus on Herzl Street with a shopping bag."]]
  }[last.location] || [[last.location, "idle", "A quiet moment."]];
  const wet = !!(s && s.world && s.world.weather && s.world.weather.rain);
  if (wet && (last.location === "street" || last.location === "park")) {
    const R = {
      street: [["street", "walking", "Ishai opens his umbrella and hurries along Herzl Street, stepping around the puddles."], ["corridor", "walking", "He ducks back into his building, shaking the rain off his umbrella."],
        ["cafe", "idle", "Rain picks up; he hurries into the café and leans his dripping umbrella by the door."], ["street", "eating", "He buys a falafel at Avi's kiosk and eats it under the kiosk awning, watching the rain."]],
      park: [["park", "walking", "Ishai crosses the wet park under his umbrella. The duck does not seem to mind the rain."], ["street", "walking", "It is pouring; he gives up on the park and heads back to Herzl Street."]]
    }[last.location];
    const recent = new Set((s.events || []).slice(-6).map((e) => e.text)), f = R.filter((p) => !recent.has(p[2])), o = f.length ? f : R;
    const [location, action, text] = o[Math.floor(Math.random() * o.length)];
    return { location, action, text, with: null, lines: [], commentary: relayHosts(s, text, Math.floor(Date.now() / 36e4), null) };
  }
  if (wet && last.location === "apartment") P.push(["apartment", "idle", "Ishai stands at the window watching the rain run down the glass. Moshe the basil looks out too."]);
  const seen = new Set((s && s.events || []).slice(-6).map((e) => e.text));
  const fresh = P.filter((p) => !seen.has(p[2]));
  const opts = fresh.length ? fresh : P;
  const [location, action, text] = opts[Math.floor(Math.random() * opts.length)];
  return { location, action, text, with: null, lines: [], commentary: relayHosts(s || { events: [] }, text, Math.floor(Date.now() / 36e4), null) };
}

// ---------- real world ----------
// ---------- viewers calling in ----------
const CALLER_MOODS = ["funny", "angry", "confused (asks something)", "over-excited superfan", "conspiracy theorist", "sweet grandma", "deadpan", "nitpicker"];
const CALLER_NAMES = ["Moti", "Rina", "Yossi", "Shira", "Avraham", "Tali", "Gadi", "Noga", "Itzik", "Michal", "Ronen", "Orly", "Kobi", "Dafna", "Eli", "Sigal", "Benny", "Hila"];
const CALLER_TOWNS = ["Haifa", "Be'er Sheva", "Ramat Gan", "Netanya", "Eilat", "Holon", "Kiryat Shmona", "Rishon", "Ashdod", "Herzliya", "Tiberias", "Modi'in"];
// free, no-key sources for something random the caller can bring up
const CALL_SOURCES = [
  ["joke", "https://official-joke-api.appspot.com/random_joke", j => `${j.setup} ${j.punchline}`],
  ["fact", "https://uselessfacts.jsph.pl/api/v2/facts/random?language=en", j => j.text],
  ["wiki", "https://en.wikipedia.org/api/rest_v1/page/random/summary", j => `${j.title}: ${String(j.extract || "").slice(0, 300)}`],
  ["quote", "https://zenquotes.io/api/random", j => `"${j[0].q}" (${j[0].a})`],
  ["advice", "https://api.adviceslip.com/advice", j => j.slip.advice],
  ["cat", "https://catfact.ninja/fact", j => j.fact]
];
async function callIn(env, s, storyMs) {
  const r = n => Math.floor(Math.random() * n), pickOf = a => a[r(a.length)];
  const caller = { name: pickOf(CALLER_NAMES), from: pickOf(CALLER_TOWNS), mood: pickOf(CALLER_MOODS) };
  const kind = pickOf(["show", "random", "both", "both"]);
  let extra = "";
  if (kind !== "show") {
    const [src, url, f] = pickOf(CALL_SOURCES);
    try { const t = await getText(url); extra = `${src.toUpperCase()}: ${String(f(JSON.parse(t)) || "").replace(/\s+/g, " ").slice(0, 400)}`; } catch (e) { extra = ""; }
  }
  const nm = id => id === "ishai" ? "Ishai" : s.cast[id]?.name || id;
  const recent = s.events.slice(-6).map(e => `${storyClock(e.t).label.slice(-5)} ${e.location}/${e.action}${e.with ? " with " + nm(e.with) : ""}: ${e.text}`).join("\n");
  const messages = [{ role: "system", content:
`A viewer calls in live to a reality show about Ishai (Tel Aviv). Hosts: ${HOSTS.zohar} ${HOSTS.oren}
The caller: ${caller.name} from ${caller.from}, ${caller.mood}.
${kind === "show" ? "The caller talks about the show (what Ishai did recently, the cast, Moshe the basil, the hosts)." : kind === "random" ? "The caller brings up the random thing below (it has nothing to do with the show)." : "The caller connects the random thing below to what is happening on the show."}
${extra ? "RANDOM THING: " + extra + "\nIf it is about anything sad, violent, sexual or political, ignore it and talk about the show instead." : ""}
Write 4-6 short lines (max 22 words each): first a host says "We've got ${caller.name} from ${caller.from} on the line" (in their own words), then the caller (1-2 lines, clearly in character), then a host answers briefly (witty, never cruel), optionally the other host adds a quip or ends the call. Only facts from the recent moments about the show. PG-13, fictional brands only.
Reply with ONLY JSON: {"lines":[{"who":"zohar"|"oren"|"caller","say":"..."}]}` },
  { role: "user", content: `Recent moments:\n${recent}\n\nJSON only.` }];
  const raw = await runModel(env, messages);
  let o; try { o = JSON.parse((raw.match(/\{[\s\S]*\}/) || [""])[0]); } catch { return null; }
  const lines = (Array.isArray(o.lines) ? o.lines : []).map(l => ({ who: String(l?.who || "").toLowerCase().trim(), say: String(l?.say || "").replace(/\s+/g, " ").trim().slice(0, 200) }))
    .filter(l => ["zohar", "oren", "caller"].includes(l.who) && l.say.length > 2).slice(0, 7);
  if (lines.length < 3 || !lines.some(l => l.who === "caller")) return null;
  return { id: "call-" + Math.floor(storyMs / 1800000), t: storyMs, caller, kind, source: extra ? extra.split(":")[0] : null, lines };
}

async function getText(url) {
  const r = await fetch(url, { headers: { "user-agent": "WatchingIshai/1.0 (story website)" }, cf: { cacheTtl: 900 } });
  if (!r.ok) throw new Error(url.split("/")[2] + " " + r.status);
  return r.text();
}
function rssTitles(xml) {
  const out = [];
  xml = xml.slice(0, 40000); // keep CPU time small (free plan)
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)) {
    const t = (m[0].match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    if (!t) continue;
    const clean = t.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#039;|&#8217;|&rsquo;/g, "'")
      .replace(/&quot;|&#8220;|&#8221;/g, '"').replace(/&[a-z#0-9]+;/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (clean) out.push(clean);
    if (out.length >= 6) break;
  }
  return out;
}
// music-only internet radio for Ishai's radio (refreshed once a day from radio-browser.info)
const RADIO_TAGS = ["lofi", "instrumental", "jazz", "chillout", "lounge", "bossa nova"];
const NOT_MUSIC = /news|talk|sport|relig|christ|gospel|quran|church|bible|politic|comedy|kids|children|podcast|sermon|islam|catholic|worship/i;
async function refreshStations(s, now) {
  if (s.world?.stationsAt && now - s.world.stationsAt < 24 * 3600000 && (s.world.stations || []).length) return;
  const all = [], seen = new Set();
  for (const tag of RADIO_TAGS) {
    try {
      const t = await getText(`https://de1.api.radio-browser.info/json/stations/search?tag=${encodeURIComponent(tag)}&tagExact=true&order=votes&reverse=true&limit=12&hidebroken=true&is_https=true`);
      for (const x of JSON.parse(t)) {
        const url = String(x.url_resolved || x.url || "");
        if (!url.startsWith("https://") || x.hls || !x.lastcheckok || seen.has(url) || NOT_MUSIC.test((x.tags || "") + " " + (x.name || ""))) continue;
        if (!/^(MP3|AAC|AAC\+|OGG)$/i.test(x.codec || "") || (x.bitrate && x.bitrate < 64)) continue;
        seen.add(url); all.push({ name: String(x.name || "").trim().slice(0, 60), url, tag, votes: x.votes || 0 });
      }
    } catch (e) {}
  }
  if (all.length >= 5) { s.world.stations = all.slice(0, 80); s.world.stationsAt = now; }
}
async function fetchWeather() {
  const c = JSON.parse(await getText(WEATHER_URL)).current;
  return { temp: Math.round(c.temperature_2m), code: c.weather_code, desc: WMO[c.weather_code] || "unclear", wind: Math.round(c.wind_speed_10m), isDay: !!c.is_day,
    rain: [51,53,55,61,63,65,66,67,80,81,82,95,96,99].includes(c.weather_code), cloudy: c.weather_code >= 3 };
}
// rain starts and stops fast: between full world refreshes, re-check just the weather every 15 minutes (no extra KV writes; the state is saved anyway)
async function refreshWeather(s, now) {
  s.world.wxAt = now;
  try { s.world.weather = await fetchWeather(); } catch (e) {}
}
async function refreshWorld(s, now) {
  const w = { at: now, errors: [], stations: s.world?.stations || [], stationsAt: s.world?.stationsAt || 0, weather: s.world?.weather || null, shabbat: s.world?.shabbat || null, holidays: s.world?.holidays || [], headlines: s.world?.headlines || [] };
  const hm = iso => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  await Promise.all([
    fetchWeather().then(x => { w.weather = x; w.wxAt = now; }).catch(e => w.errors.push("weather: " + e.message)),
    getText(CALENDAR_URL).then(t => { const items = JSON.parse(t).items || [];
      const c = items.find(i => i.category === "candles"), h = items.find(i => i.category === "havdalah"), p = items.find(i => i.category === "parashat");
      w.shabbat = c ? { start: Date.parse(c.date), end: h ? Date.parse(h.date) : null, startLabel: hm(c.date), endLabel: h ? hm(h.date) : "?", parasha: p ? p.title : null } : null;
      w.holidays = items.filter(i => i.category === "holiday").slice(0, 3).map(i => ({ title: i.title, date: i.date.slice(0, 10) })); })
      .catch(e => w.errors.push("calendar: " + e.message)),
    Promise.all(NEWS_FEEDS.map(([src, url]) => getText(url).then(x => rssTitles(x).map(title => ({ title, source: src })))
      .catch(e => { w.errors.push(src + ": " + e.message); return []; })))
      .then(lists => {
        const seen = new Set();
        const fresh = lists.flat().filter(h => !HEAVY_NEWS.test(h.title) && h.title.length < 140 && !seen.has(h.title) && seen.add(h.title));
        // mix sources, newest first per source
        const mixed = []; for (let i = 0; i < 6; i++) lists.forEach((_, j) => { const it = fresh.filter(h => h.source === NEWS_FEEDS[j][0])[i]; if (it) mixed.push(it); });
        if (mixed.length) w.headlines = mixed.slice(0, 12);
      })
  ]);
  s.world = w;
  await refreshStations(s, now).catch(() => {});
}

// ---------- director ----------
function newGoal(d, now) {
  const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  return {
    id: str(d.id, 30) || "g" + now.toString(36), goal: str(d.goal, 600), forceText: str(d.forceText, 260),
    unlock: d.unlock && d.unlock in ITEMS ? d.unlock : null,
    startAfter: d.startAt ? Date.parse(d.startAt) : now + Math.max(0, Number(d.startAfterH) || 0) * 3600000,
    deadlineH: clamp(Number(d.deadlineH) || 24, .1, 24 * 14), deadlineAt: d.deadlineAt ? Date.parse(d.deadlineAt) : null,
    where: str(d.location, 20) || null, with: str(d.with, 60) || null, forceWith: str(d.forceWith, 20) || null,
    brief: str(d.brief, 800) || null, briefLines: clamp(Number(d.briefLines) || 0, 0, 80) || null,
    forceAction: str(d.forceAction, 20) || null, forceLines: Array.isArray(d.forceLines) ? d.forceLines.slice(0, 14) : [],
    forceCommentary: Array.isArray(d.forceCommentary) ? d.forceCommentary.slice(0, 2) : [],
    status: str(d.art, 300) ? "needs-art" : "waiting", art: str(d.art, 300) || null,
    activatedAt: null, doneAt: null, how: null, createdAt: now
  };
}
function activeGoal(s, now) {
  let g = s.director.find(d => d.status === "active");
  if (!g) {
    g = s.director.filter(d => d.status === "waiting" && d.startAfter <= now).sort((a, b) => a.startAfter - b.startAfter)[0];
    if (g) { g.status = "active"; g.activatedAt = now; }
  }
  return g || null;
}
function finishGoal(s, g, how, now) {
  g.status = "done"; g.how = how; g.doneAt = now;
  if (g.unlock && !s.unlocked.includes(g.unlock)) s.unlocked.push(g.unlock);
}
const deadlineOf = g => g.deadlineAt || (g.activatedAt || g.startAfter) + g.deadlineH * 3600000;
const timeLeft = ms => ms < 90 * 60000 ? `About ${Math.max(1, Math.round(ms / 60000))} minutes are` : `About ${Math.round(ms / 3600000)} hours are`;
function forcedEvent(g, last, s) {
  const text = g.forceText || "Something quietly changes in Ishai's life.";
  // a planned beat may say where it happens; the camera simply cuts there
  const loc = LOCATIONS[g.where] ? g.where : last.location;
  const act = g.forceAction && LOCATIONS[loc].includes(g.forceAction) ? g.forceAction
    : loc === "offscreen" ? "away" : (last.action === "sleeping" ? "waking" : "idle");
  const w = g.forceWith && s.cast[g.forceWith] ? g.forceWith : null;
  return { location: loc, action: act, text, with: w, lines: w ? g.forceLines.filter(l => l && (l.who === "ishai" || l.who === w) && l.say).slice(0, 14) : [],
    commentary: Array.isArray(g.forceCommentary) ? g.forceCommentary.filter(c => c && HOSTS[c.who] && c.say).slice(0, 2) : [] };
}
// Merge the bundled plan into the goals once per plan version: new beats are added,
// "overrides" reschedule existing goals (e.g. move the TV delivery out of Shabbat).
function applyPlan(s, now) {
  if (!PLAN || !PLAN.version || s.planVersion === PLAN.version) return false;
  for (const b of PLAN.beats || []) {
    if (s.director.some(g => g.id === b.id)) continue;
    const g = newGoal(b, now); g.id = b.id; g.fromPlan = PLAN.version; s.director.push(g);
  }
  for (const o of PLAN.overrides || []) {
    const g = s.director.find(x => x.id === o.id && x.status !== "done");
    if (!g) continue;
    if (o.cancel) { g.status = "done"; g.how = "cancelled"; g.doneAt = now; continue; }
    if (o.startAt) { g.startAfter = Date.parse(o.startAt); g.status = "waiting"; g.activatedAt = null; }
    if (o.deadlineAt) g.deadlineAt = Date.parse(o.deadlineAt);
    if (o.deadlineH) g.deadlineH = o.deadlineH;
    if (Array.isArray(o.forceCommentary)) g.forceCommentary = o.forceCommentary.slice(0, 2);
    if (Array.isArray(o.forceLines)) g.forceLines = o.forceLines.slice(0, 14);
    if (o.forceText) g.forceText = String(o.forceText).slice(0, 260);
  }
  s.fixesDone = s.fixesDone || [];
  for (const f of PLAN.fixes || []) {
    if (!f || !f.id || s.fixesDone.includes(f.id)) continue;
    s.fixesDone = [...s.fixesDone, f.id].slice(-30);
    if (f.endScene) s.stuck = Math.max(s.stuck || 0, 2);                                   // wraps up the running scene with a goodbye
    if (f.note) s.fixNote = { text: String(f.note).slice(0, 300), until: now + (Number(f.minutes) || 60) * 60000 };
  }
  s.planVersion = PLAN.version;
  return true;
}
async function directorApi(req, env) {
  const s = await loadState(env);
  const now = Date.now();
  if (req.method === "POST") {
    let b = {}; try { b = await req.json(); } catch {}
    if (b.action === "add") {
      if (!String(b.goal || "").trim()) return json({ error: "write a goal first" }, {}, 400);
      let id = String(b.goal).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24).replace(/-+$/, "") || "goal";
      let base = id, n = 2; while (s.director.some(d => d.id === id)) id = base + "-" + n++;
      s.director.push(newGoal({ ...b, id }, now));
    } else if (b.action === "release") {
      const g = s.director.find(d => d.id === b.id && d.status === "needs-art");
      if (g) { g.status = "waiting"; g.startAfter = Math.max(g.startAfter, now); }
    } else if (b.action === "forget") {
      delete s.wishlist[b.item];
    } else if (b.action === "bugDone") {
      const list = JSON.parse(await env.ISHAI.get("bugs") || "[]"); const x = list.find(y => y.id === b.id);
      if (x){ x.status = "done"; await env.ISHAI.put("bugs", JSON.stringify(list)); }
    } else if (b.action === "cancel") {
      const g = s.director.find(d => d.id === b.id && d.status !== "done");
      if (g) { g.status = "done"; g.how = "cancelled"; g.doneAt = now; }
    } else if (b.action === "tick") {
      await saveState(env, s); await tick(env, true);
      return json(directorView(await loadState(env), JSON.parse(await env.ISHAI.get("bugs") || "[]")));
    }
    await saveState(env, s);
  }
  return json(directorView(s, JSON.parse(await env.ISHAI.get("bugs") || "[]")));
}
function directorView(s, bugs) {
  const last = s.events[s.events.length - 1];
  return { bugs: (bugs || []).slice(-30).reverse(), diag: s.diag || [], scene: s.scene ? { ...s.scene, name: s.cast[s.scene.w]?.name || s.scene.w } : null, world: s.world ? { weather: s.world.weather, shabbat: s.world.shabbat, holidays: s.world.holidays, headlines: s.world.headlines, at: s.world.at, errors: s.world.errors, stations: (s.world.stations || []).length } : null,
    wishlist: Object.entries(s.wishlist || {}).sort((a, b) => b[1].count - a[1].count).map(([k, v]) => ({ item: k, count: v.count, example: v.example })),
    done: s.done, unlocked: s.unlocked, goals: s.director.slice().reverse(), lastError: s.lastError || null,
    last: last && { text: last.text, location: last.location, action: last.action, created: last.created || last.t } };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function json(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*", ...headers } });
}
