import { jsonrepair } from "./vendor/jsonrepair/regular/jsonrepair.js"; // copied from josdejong/jsonrepair 3.15.0 (ISC), repo has no npm step
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
const BLOCK_N = 5;            // ordinary moments are written 5 at a time (one AI call per ~30 minutes); radio/TV, weather changes and anything unplanned stay live
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
  { name: "NESflicks", pitch: "a streaming service where you spend the whole evening choosing; 'Still there?'" },
  { name: "8bitTV", pitch: "Channel 8, a TV channel where everything is in sixteen colours, even the weather" },
  { name: "RGBeat", pitch: "Channel 6, a TV channel of music clips all day, every clip lit only in red, green or blue: 'red, green, blue, repeat'" },
  { name: "PicSell", pitch: "the shop on Herzl Street, on the way to the park, for pictures, posters and printed shirts: 'if it holds still, we print it'" },
  { name: "Boolify", pitch: "a music station that only answers true or false; the free tier lets you skip a song in 2031" },
  { name: "Cooola", pitch: "an absurdly strong cola; 'if you really want to wake up'" },
  { name: "HummusPrime", pitch: "a hummus subscription delivered by drone, 'because chickpeas deserve wings'" },
  { name: "FluffNap", pitch: "pillows with 'military-grade softness'; sleep so deep the neighbors check on you" },
  { name: "LeafLove", pitch: "plant food that 'makes basil believe in itself again'" },
  { name: "SockWise", pitch: "socks that 'know where their partner is'" },
  { name: "ZenBrick", pitch: "a meditation app that just shows a brick for ten minutes" },
  { name: "A Butcher Is Born", pitch: "the hottest new reality competition on Channel 9, where amateur butchers compete for the Golden Cleaver; " +
      "contestants: Rami 'The Cleaver' (cries every episode), Shuli Two-Knives (trash-talks the meat), and 78-year-old Grandpa Moti (somehow undefeated). Tonight at 21:00; keep it funny, never gory" },
  { name: "Wee Laddie Virgin Scotch", pitch: "a 0% alcohol 'scotch' for kids, smoky apple juice in a fancy bottle: 'you wouldn't believe it's not alcohol'" },
  { name: "ateBite", pitch: "the food delivery app: Shuk Shalom's stalls at your door in 30 minutes" },
  { name: "Kfar Kofi", pitch: "instant coffee, 'ninety seconds from kettle to personality'" },
  { name: "Tahini Tower Savings Bank", pitch: "a bank that keeps your money 'smooth, nutty and slightly bitter'" },
  { name: "Herzl Hardware", pitch: "the hardware shop on Herzl Street: 'if it squeaks, leaks or creaks, we have the thing. Probably'" },
  { name: "Yalla Yoga", pitch: "a yoga studio on Dizengoff: 'stretch like nobody is watching (somebody is watching)'" }
];
// the studio recap has ONE sponsor each time, taking turns: the one used longest ago (never the same twice in a row)
function nextSponsor(s) {
  const used = s.spUsed || {};
  return [...SPONSORS].sort((a, b) => (used[a.name] || 0) - (used[b.name] || 0) || Math.random() - .5)[0];
}
function sponsorUsed(s, sp, lines, storyMs) {
  s.spUsed = { ...(s.spUsed || {}), [sp.name]: storyMs };
  const said = (lines || []).filter(l => l.say.includes(sp.name) || /brought to you/i.test(l.say)).map(l => l.say.slice(0, 160));
  s.spJokes = [...(s.spJokes || []), ...said].slice(-12);
}
// fictional show that also airs on Ishai's TV once he has one
const TV_SHOW = "Besides Channel 9, there is 8bitTV on Channel 8 (blocky pixel shows, a little hero jumping over blocks), RGBeat on Channel 6 (music clips all day, lit in red, green and blue) and NESflicks, a streaming service with endless menus that keeps asking 'Still there?'. At home the viewers cannot see the TV screen, so when he watches, say which channel and let him comment out loud on what he sees. The gym has two wall screens side by side: Channel 9, and 8bitTV, NESflicks or RGBeat on the other. The radio has Radio Herzl 88.2 and Boolify, a music station that only says true or false. " + "On Channel 9 the hit fictional reality show 'A Butcher Is Born' airs at 21:00 (contestants Rami 'The Cleaver', Shuli Two-Knives, Grandpa Moti); the hosts are obsessed with it.";
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
    memory: "Has started drawing tiny basil leaves on Ishai's cups. He hasn't noticed yet.", relationship: 1 },
  { id: "tomer", name: "Tomer", role: "Ishai's friend since school, an electrician",
    personality: "loud, loyal, always has a plan that goes wrong, competitive about old video games",
    speech: "fast and excited, calls him 'Ishai habibi', turns everything into a bet",
    hangouts: ["bar", "gym", "street"],
    look: { hair: "short", hairColor: "brown", skin: "tan", shirt: "green", pants: "navy", extras: ["beard"] },
    memory: "Owes Ishai a rematch and forty shekels.", relationship: 4 },
  { id: "gadi", name: "Gadi", role: "runs Sababa Creative, the small ad agency that gives Ishai most of his work; Ishai's boss in all but name",
    personality: "cheerful, always in a hurry, says 'small change' about big changes",
    speech: "'just one small thing', 'by tomorrow', never says thank you first",
    hangouts: [], phoneOnly: true,
    look: { hair: "bald", hairColor: "gray", skin: "fair", shirt: "gray", pants: "black", extras: ["glasses"] },
    memory: "Thinks Ishai is talented and always available.", relationship: 1 },
  { id: "michal", name: "Michal", role: "a regular at Herzl Gym, usually by the mirror (mornings and evenings)", regular: "gym",
    personality: "friendly, disciplined about everything except her promises", speech: "short, out of breath, encouraging",
    hangouts: ["gym"], look: { hair: "long", hairColor: "blonde", skin: "tan", shirt: "pink", pants: "black", extras: [] }, memory: "", relationship: 0 },
  { id: "sivan", name: "Sivan", role: "a regular at Herzl Gym, on the treadmill next to his (early mornings and evenings)", regular: "gym",
    personality: "dry, competitive, watches the second screen", speech: "deadpan, one-liners",
    hangouts: ["gym"], look: { hair: "bun", hairColor: "black", skin: "fair", shirt: "teal", pants: "gray", extras: [] }, memory: "", relationship: 0 },
  { id: "zelig", name: "Mr. Zelig", role: "a strange old man who walks the park by day and talks to himself and the pigeons", regular: "park",
    personality: "harmless, convinced small things are changing when nobody looks", speech: "riddles, counts things, addresses pigeons and trees",
    hangouts: ["park"], look: { hair: "curly", hairColor: "white", skin: "fair", shirt: "orange", pants: "brown", extras: ["beard", "scarf"] }, memory: "", relationship: 0 },
  { id: "kobi", name: "Kobi", role: "a regular at The Black Candle: sober at 19:00, tipsy by 21:00, properly drunk by midnight", regular: "bar",
    personality: "a former bass player, sentimental, repeats himself the later it gets", speech: "the later the hour, the more slurred and the less finished his sentences",
    hangouts: ["bar"], look: { hair: "short", hairColor: "gray", skin: "tan", shirt: "red", pants: "navy", extras: ["mustache"] }, memory: "", relationship: 0 },
  { id: "lior", name: "Lior", role: "a regular at Cafe Nahat who has been writing the same novel for years (daytime)", regular: "cafe",
    personality: "anxious, kind, looks for any excuse to stop writing", speech: "apologizes, then asks for an opinion",
    hangouts: ["cafe"], look: { hair: "curly", hairColor: "brown", skin: "light", shirt: "blue", pants: "gray", extras: ["glasses"] }, memory: "", relationship: 0 },
  { id: "yael", name: "Yael", role: "teaches a beginners' improv class on Thursdays at 17:00 in the back of The Black Candle, before the evening crowd",
    personality: "warm, sharp, patient, notices when people hide behind jokes", speech: "short encouraging notes, 'yes, and', stops a scene with one clap",
    hangouts: ["bar"], look: { hair: "curly", hairColor: "black", skin: "tan", shirt: "yellow", pants: "black", extras: ["earring"] },
    memory: "Noa paid for four lessons for Ishai and warned her he would try to get a refund.", relationship: 0 },
  { id: "sasson", name: "Dr. Sasson", role: "lectures on Strange But True, a history course at Tel Herzl University, on Sundays, Tuesdays and Wednesdays at 11:00",
    personality: "dry, exact, loves a good footnote, stops joking when the subject deserves it", speech: "calm and precise, ends a point with a quiet joke",
    hangouts: ["classroom"], look: { hair: "short", hairColor: "gray", skin: "light", shirt: "purple", pants: "black", extras: ["glasses", "scarf"] }, memory: "", relationship: 0 }
];

// ---------- world (must match the page) ----------
const LOCATIONS = {
  apartment: ["sleeping","waking","idle","walking","working","gaming","eating","drinking","cooking","reading","exercising","watching","listening","bathroom","showering","talking","phoning"],
  corridor:  ["walking","idle","talking","phoning"],
  street:    ["walking","idle","talking","eating","drinking","phoning"],
  shops:     ["walking","idle","talking","eating","drinking","phoning"],
  park:      ["walking","idle","talking","reading","eating","drinking","exercising","phoning"],
  cafe:      ["idle","eating","drinking","working","reading","talking","phoning"],
  gym:       ["exercising","idle","talking","drinking","phoning"],
  market:    ["walking","idle","talking","eating","drinking","phoning"],
  store:     ["idle","talking","phoning"],
  bar:       ["idle","drinking","eating","talking","phoning","improv"],
  campus:    ["walking","idle","talking","eating","drinking","phoning"],
  classroom: ["idle","talking","phoning","lecture"],
  bus:       ["idle","talking","phoning","reading"],
  taxi:      ["idle","talking","phoning","reading"],
  offscreen: ["away"]
};
const PLACES = {
  apartment: "his one-room flat: bed, desk with laptop and a small 49-key keyboard he plays badly, armchair, small kitchen with a sink, a broom, a closet, a bathroom door (the camera never sees inside; use bathroom/showering), window with Moshe the basil. When he is home alone with nothing on (action idle) the camera shows him doing ordinary things: sweeping, washing up, wiping the counter, folding laundry, playing the keyboard, lying on the bed or in the armchair with his phone, making a snack, coffee by the window, watering Moshe, a little dance. Say which in what happens",
  corridor:  "the building hallway outside his door",
  street:    "Herzl Street outside his building (west end): Avi's falafel kiosk, a bus stop bench, the doors of Herzl Gym and The Black Candle bar, traffic. Going west, three more blocks of Herzl Street lead to the park: PicSell (pictures, posters, printed shirts), a pharmacy, the Soap Opera launderette, a barber, a makolet, a bakery, a second-hand bookshop and a bicycle shop. He only walks past those on his way to the park; he never stops in them",
  shops:     "the SIDEWALK of Herzl Street east, the next block toward the cafe (the camera only sees the sidewalk and the shop windows; he cannot be inside a shop here - shopping for electronics, clothes or home stuff happens at the Everything Else store - bus from the street to the market, then walk in): Herzl Hardware, the Tahini Tower Savings Bank with an ATM, a flower shop with buckets of flowers on the sidewalk, a pedestrian crossing with traffic lights, ficus trees; Cafe Nahat is on the corner at the end",
  park:      "a small park at the west end of Herzl Street, a few blocks' walk from his building: a bench, a pond with one duck, a big tree",
  cafe:      "Cafe Nahat, a corner cafe (soft pop and soft rock on the radio, quietly)",
  market:    "Shuk Shalom, an open-air food market a short bus ride away (bus or taxi from the stop on Herzl Street; it has its own bus stop): stalls of tomatoes, cucumbers, oranges, bananas, spices, fresh pita, olives and fresh juice, vendors calling out prices, crowds. Food only. He can eat a snack or drink a fresh juice there. Open 07:00-19:00 (Friday until 14:00, closed on Shabbat). Its vendors also deliver through ateBite",
  store:     "Everything Else, the big store next to Shuk Shalom (walk in from the market): everything except food - a wall of TVs and electronics, phones, clothes, kitchenware, lamps, cleaning stuff; a cashier at the checkout. He browses (\"idle\") or talks to a salesperson. Open 09:00-21:00 (Friday until 14:00, closed on Shabbat)",
  gym:       "Herzl Gym, a small neighborhood gym on Herzl Street, two doors from his building: treadmills facing two wall screens, Channel 9 with the sound on and 8bitTV, NESflicks or RGBeat next to it, a mirror wall with dumbbells, a water cooler. Here \"exercising\" means he walks or jogs on the treadmill watching the TV. Open 06:00-23:00",
  bar:       "The Black Candle, a small dark rock bar on Herzl Street next to his building: black brick, red neon, candles on the tables, band posters, a bearded bartender, rock and alternative music on the radio all night. He sits at a candle-lit table (drinking a beer, eating bar snacks). Opens 17:00, closes 02:00",
  bus:       "inside the city bus, line 88 (camera on board): he sits by the window with the city going past, a few other passengers around him",
  taxi:      "the back seat of a taxi (camera on board): the driver in front, the meter running, the city going past the window",
  campus:    "Tel Herzl University, a bus ride away from Herzl Street (bus or taxi; it has its own stop): the courtyard, a vending machine, students. Open Sunday to Thursday 08:00-20:00. Ishai goes there for his history lectures",
  classroom: "a lecture room at the university, only used during a lecture",
  offscreen: "anywhere without a camera (the supermarket, a client's office, a friend's home); he gets there by bus or taxi from the bus stop on Herzl Street and comes back the same way"
};
// The world map (must match MAP in the page). Far places are reached by bus or taxi from the street bus stop.
const NEXT = {
  apartment: ["corridor"],
  corridor:  ["apartment","street"],
  street:    ["corridor","park","shops","gym","bar","market","campus","bus","taxi","offscreen"],
  market:    ["street","store","bus","taxi"],
  campus:    ["street","classroom","bus","taxi"],
  classroom: ["campus"],
  store:     ["market"],
  shops:     ["street","cafe"],
  park:      ["street"],
  cafe:      ["shops"],
  gym:       ["street"],
  bar:       ["street"],
  bus:       ["street","market","campus","offscreen"],
  taxi:      ["street","market","campus","offscreen"],
  offscreen: ["street","market","campus","bus","taxi"]
};
// drawing menu for characters (must match the page)
const LOOK = {
  hair: ["short","long","bald","bun","curly","cap"],
  hairColor: ["black","brown","auburn","blonde","gray","white","red"],
  skin: ["light","fair","tan","brown","dark"],
  cloth: ["red","orange","yellow","green","teal","blue","navy","purple","pink","black","white","gray","brown"],
  extras: ["glasses","beard","mustache","earring","apron","scarf"]
};

const allowed = (loc, unlocked) => LOCATIONS[loc].filter(a => a !== "improv" && a !== "lecture" && (!NEEDS[a] || unlocked.includes(NEEDS[a])));   // "improv" and "lecture" are only for planned classes

const HTML = __HTML__;
const DIRECTOR_HTML = __DIRECTOR_HTML__;
const SANDBOX_HTML = __SANDBOX_HTML__;
const INTRO_HTML = __INTRO_HTML__;   // the trailer: /intro, public; first-time visitors land here once
const BUILDER_HTML = __BUILDER_HTML__;
const SW_JS = __SW_JS__;
const ICONS = __ICONS__;   // /favicon.ico, /favicon.svg, /apple-touch-icon.png, /icon-192.png, /icon-512.png, /og.png (source/public/icons)
const iconBytes = {};
const iconOf = p => ICONS[p] && (iconBytes[p] ||= Uint8Array.from(atob(ICONS[p].b64), c => c.charCodeAt(0)));
const VAPID_PUBLIC = "BEV_aboiLYMr5triqg4ChAMbFrvzhgtWhtfyI5Fd7WKSvnlF8ylKyYXryfo2rpII3Gn6t96AcwWizQxaHvLsAuI";
const BUILD = "__BUILD__";
// The story plan (story/plan.json in the repository), written ahead by the daily planner.
const PLAN = __PLAN__;
const COURSE = __COURSE__;
// sha-256 of the health check's fix token (the token itself lives only in the scheduled task)
const FIX_HASH = "b5c6aeba6f36ea21799c22ef3a0a75c2692b6d8f9018f76669af06fe84d7c505";

// ============================================================
// The director's browser gets a private cookie at login; test pages (sandbox, preview, demo, forced scenes) need it.
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const devToken = async key => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ishai-dev:" + key)));
async function isDev(req, env) {
  const key = env.ADMIN_KEY || env.TICK_SECRET; if (!key) return false;
  const c = (req.headers.get("cookie") || "").match(/(?:^|;\s*)ishai_dev=([0-9a-f]{64})/);
  return !!c && c[1] === await devToken(key);
}
// the director: the ADMIN_KEY password in the x-admin-key header, or the ishai_dev cookie (set by the password login or by a Google sign-in on DIRECTOR_EMAILS)
async function isDirector(req, env) {
  const key = env.ADMIN_KEY || env.TICK_SECRET;
  return !!key && (req.headers.get("x-admin-key") === key || await isDev(req, env));
}
const directorEmail = (env, c) => !!(c && c.email && c.email_verified !== false && String(env.DIRECTOR_EMAILS || "").toLowerCase().split(/[\s,;]+/).filter(Boolean).includes(String(c.email).toLowerCase()));
const TEST_PARAMS = ["sandbox", "builder", "preview", "demo", "loc"];

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === "/api/time") return json({ now: Date.now() }, { "cache-control": "no-store" });   // the one clock every page runs on
    if (url.pathname === "/api/state") {
      try {
        const state = await loadState(env);
        // narration is for the director only; viewers get places, actions and spoken lines
        const dev = await isDirector(req, env);
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
        artNeeded: (s.director || []).filter(g => g.status === "needs-art").map(g => ({ id: g.id, art: g.art, createdAt: g.createdAt })),
        homeLife: s.homeLife || null, homeErr: s.homeErr || null,
        usage: s.usage ? { ...s.usage, neuronsEst: Math.round(s.usage.inTok * 4625 / 1e6 + s.usage.outTok * 30475 / 1e6) } : null,
        block: s.queue ? { left: s.queue.items.length, writer: s.queue.writer } : null, course: courseHealth(s),
        writersSetup: env.GEMINI_API_KEY ? { story: "gemini (" + (s.geminiModel || geminiModel || env.GEMINI_MODEL || "not picked yet") + "), backup Cloudflare", hosts: "Cloudflare, backup gemini", geminiPausedUntil: Date.now() < (s.geminiOutUntil || 0) ? s.geminiOutUntil : null, geminiLastError: (s.geminiErrs || []).slice(-1)[0] || null, geminiErrors: s.geminiErrs || [], hostsLastError: s.hostsErr || null, hostsBy: s.hostsBy || null } : { story: "Cloudflare", hosts: "Cloudflare (in the same reply)" }, lastBlockDrop: s.queueDrop || null,
        writers: s.events.slice(-10).map(e => e.src || "?"),
        polls: { db: !!env.DB, google: !!env.GOOGLE_CLIENT_ID, off: !!s.pollsOff, next: s.poll ? { id: s.poll.id, q: s.poll.question, by: s.poll.bank ? "stock" : "ai", done: !!s.poll.done } : null, err: s.pollErr || null, last: (s.pollLog || []).slice(-3) } }, { "cache-control": "no-store" });
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
    if (url.pathname === "/api/vote" && req.method === "POST") return pollVote(req, env);
    if (url.pathname === "/api/signin" && req.method === "POST") return googleSignIn(req, env);
    if (url.pathname === "/api/signout" && req.method === "POST") {   // signing out also ends director mode in this browser
      const r = json({ ok: true }, { "set-cookie": "ishai_voter=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax", "cache-control": "no-store" });
      r.headers.append("set-cookie", "ishai_dev=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"); return r;
    }
    if (url.pathname === "/api/me") return json({ google: env.GOOGLE_CLIENT_ID || null, signedIn: !!(env.GOOGLE_CLIENT_ID && await voterOf(req, env)), director: await isDev(req, env) }, { "cache-control": "no-store" });
    if (url.pathname === "/privacy") return new Response(PRIVACY_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (url.pathname === "/api/poll") {   // the current poll and, once it has closed, its result
      const s = await loadState(env), p = s.poll, id = url.searchParams.get("id");
      if (!p || (id && id !== p.id)) { const old = (s.pollLog || []).find(x => x.id === id); return json({ poll: null, old: old || null }, { "cache-control": "no-store" }); }
      let result = p.result || null;
      if (!result && Date.now() > p.closesAt + 5000 && env.DB) try { result = await pollResult(env, p); } catch (e) { return json({ error: "counting failed, try again" }, {}, 503); }
      return json({ poll: { ...pollPublic(p), result } }, { "cache-control": "no-store" });
    }
    if (url.pathname === "/api/ambient") return json({ city: CITY, texture: PLAN.texture || null });
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
    if (url.pathname === "/sw.js") return new Response(SW_JS, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" } });
    if (url.pathname === "/manifest.json") return json({ name: "Watching Ishai", short_name: "Ishai", start_url: "/", display: "standalone", background_color: "#050705", theme_color: "#050705",
      icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }] });
    if (ICONS[url.pathname]) return new Response(iconOf(url.pathname), { headers: { "content-type": ICONS[url.pathname].type, "cache-control": "public, max-age=86400" } });
    if (url.pathname === "/api/alert") { const s = await loadState(env); return json(s.alert ? { title: s.alert.title, body: s.alert.body } : {}, { "cache-control": "no-store" }); }
    if (url.pathname === "/api/push" && (req.method === "POST" || req.method === "DELETE")) {
      const b = await req.json().catch(() => ({})), ep = String(b.endpoint || ""), key = ep.length < 700 && pushAllowed(ep) ? await pushKey(ep) : null;
      if (!key) return json({ error: "not a push address" }, {}, 400);
      const num = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
      const dev = JSON.stringify({ ep, from: num(b.from, 0, 23, 8), to: num(b.to, 0, 24, 23), max: num(b.max, 1, ALERTS_A_DAY, ALERTS_A_DAY) });
      if (req.method === "DELETE") await env.ISHAI.delete(key); else if ((await env.ISHAI.get(key)) !== dev) await env.ISHAI.put(key, dev);
      return json({ ok: true }, { "cache-control": "no-store" });
    }
    if (url.pathname === "/api/lecture") {
      if (!await isDev(req, env)) return json({ error: "director only" }, {}, 403);
      const c = courseOf(await loadState(env)), cur = c.queue[0];
      return json({ title: cur.title, moments: lectureMoments(cur, c.queue[1]) || lectureMoments(firstLecture(), c.queue[1]) }, { "cache-control": "no-store" });
    }
    if (url.pathname === "/intro") {
      return new Response(INTRO_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    if (url.pathname === "/sandbox") {
      if (!await isDev(req, env)) return Response.redirect(url.origin + "/director", 302);
      return new Response(SANDBOX_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    if (url.pathname === "/builder") {
      if (!await isDev(req, env)) return Response.redirect(url.origin + "/director", 302);
      return new Response(BUILDER_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    if (url.pathname === "/director")
      return new Response(DIRECTOR_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (url.pathname === "/api/director") {
      const key = env.ADMIN_KEY || env.TICK_SECRET;
      if (!await isDirector(req, env)) return json({ error: key ? "wrong password, or this account is not a director" : "ADMIN_KEY is not set", google: env.GOOGLE_CLIENT_ID || null }, {}, 403);
      const r = await directorApi(req, env);
      if (r.ok) r.headers.append("set-cookie", `ishai_dev=${await devToken(key)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`);
      return r;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const test = TEST_PARAMS.some(p => url.searchParams.has(p));
      if (test && !await isDev(req, env)) return Response.redirect(url.origin + "/", 302);
      return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8", ...(test ? { "cache-control": "no-store" } : {}) } });
    }
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
  SEED_CAST.forEach(c => { if (!s.cast[c.id]) { s.cast[c.id] = { ...c, lastSeen: null, scenes: 0 }; dirty = true; } });   // new people join a running show
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
  // goals loaded before scripts existed: pick up their planned moments from the plan
  for (const b of (PLAN && PLAN.beats) || []) { const g = s.director.find(x => x.id === b.id);
    if (g && g.status === "waiting" && !g.script && !g.scriptDone) { const sc = cleanScript(b.script || (b.preview && b.preview.moments)); if (sc) { g.script = sc; dirty = true; } } }
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
// which channel a moment talks about, so the page can show or name it
function mediaOf(e) {
  const t = (e.text || "") + " " + (e.lines || []).map(l => l.say).join(" ");
  return /\bnesflicks\b/i.test(t) ? "nesflicks" : /\brgbeat\b|\bchannel 6\b/i.test(t) ? "rgbeat" : /\b8bittv\b|\bchannel 8\b/i.test(t) ? "8bittv" : /\bboolify\b/i.test(t) ? "boolify" : /\bchannel 9\b/i.test(t) ? "ch9" : /\bradio herzl\b/i.test(t) ? "herzl" : undefined;
}
function publicState(s, dev) {
  const last = s.events[s.events.length - 1];
  return {
    day: showDay(s.startedAt, Date.now()),
    build: BUILD, delayMin: DELAY_MIN, intervalMin: INTERVAL_MIN, notes: dev ? s.notes : "",
    events: s.events.slice(-25).map(e => ({ id: e.id, t: e.t, location: e.location, action: e.action, media: mediaOf(e), ride: e.location === "bus" || e.location === "taxi" ? e.location : /\btaxi\b/i.test(e.text || "") ? "taxi" : /\bbus\b/i.test(e.text || "") ? "bus" : undefined, text: dev ? e.text : "", src: dev ? e.src || null : null, with: e.with || null, lines: e.lines || [], commentary: e.commentary || [], unlocks: e.unlocks || null, delivery: e.delivery || undefined })),
    talk: (s.talk || []).slice(-80), dev: !!dev,
    studio: s.studio || null, show: s.show || null, call: s.call || null, poll: s.poll && Date.now() < s.poll.closesAt + POLL_SHOW_MIN * 60000 ? pollPublic(s.poll) : null,
    summary: { today: s.daySum || null, yesterday: s.yesterdaySum || null },
    dream: (s.hl || []).filter(h => h.t > Date.now() - 20 * 3600000).slice(-10),
    unlocked: s.unlocked, course: coursePublic(s),
    world: s.world ? { weather: s.world.weather, shabbat: s.world.shabbat, holidays: s.world.holidays, headlines: (s.world.headlines || []).slice(0, 8).map(h => h.title), stations: s.world.stations || [], barStations: s.world.barStations || [], cafeStations: s.world.cafeStations || [] } : null,
    wishlist: Object.entries(s.wishlist || {}).sort((a, b) => b[1].count - a[1].count).slice(0, 10)
      .map(([k, v]) => ({ item: k, count: v.count, example: v.example, reachedAt: v.reachedAt || null })),
    artNeeded: (s.director || []).filter(g => g.status === "needs-art").map(g => ({ id: g.id, goal: g.goal, art: g.art, createdAt: g.createdAt })),
    cast: Object.values(s.cast).map(c => ({ id: c.id, name: c.name, role: c.role, personality: c.personality,
      look: c.look, memory: c.memory, relationship: c.relationship, lastSeen: c.lastSeen, scenes: c.scenes || 0, remote: c.phoneOnly || undefined })),
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
  for (const x of lines){ if (x.w !== prevW || (x.loc !== prevLoc && !["corridor", "street", "shops"].includes(x.loc))) notable.push(x); prevLoc = x.loc; prevW = x.w; }
  const pickN = notable.slice(-6);
  if (!pickN.length) return null;
  const sp = nextSponsor(s), out = [];
  out.push({ who: "zohar", say: `This recap is brought to you by ${sp.name}. Let's catch you up.` });
  if (s.yesterdaySum) out.push({ who: "oren", say: "Yesterday: " + s.yesterdaySum.text.split(/(?<=\.)\s/)[0] });
  pickN.forEach((x, i) => out.push({ who: (out.length % 2) ? "oren" : "zohar", say: `${x.time}: ${x.text}`.slice(0, 220) }));
  out.push({ who: (out.length % 2) ? "oren" : "zohar", say: `That's the day so far. Once again, ${sp.name}. Back to the cameras.` });
  sponsorUsed(s, sp, [], storyMs);
  return { today: pickN.map(x => `${x.time} ${x.text}`).join(" "), show: { id: "studio-" + Math.floor(storyMs / 3600000) + "-basic", t: storyMs, lines: out, sponsors: [sp.name] } };
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
  const sp = nextSponsor(s), oldJokes = (s.spJokes || []).slice(-8);
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
 THIS RECAP HAS ONE SPONSOR: ${sp.name} (${sp.pitch}). Make up NEW jokes about it: do not just repeat its slogan${oldJokes.length ? `, and do not reuse any of these earlier sponsor lines or their jokes: ${oldJokes.map(j => `"${j}"`).join("; ")}` : ""}.
 1) the FIRST line is a cheesy sponsor intro: "This recap is brought to you by ${sp.name}" plus a fresh joke;
 2) yesterday: ${yLines} (skip if there is no yesterday), each stating what actually happened (who, where, what);
 3) today in time order (morning, midday, afternoon...), ending with the last hour: every line first states a concrete fact from the log (time of day, place, who he was with, what was said or done), THEN may add a short sassy remark. The other host reacts or adds the next fact. No line may be only a joke;
 Write the "today" summary first and base the show on it, so a viewer who missed the day understands it from the show alone.
 4) the LAST line is a sponsor outro: once more ${sp.name}, with a DIFFERENT joke than the intro (the other host may groan at it), then back to the cameras.
"pip" is a 4-5 line quick version about the last hour only (first line greets: "Live from the studio...").` },
  { role: "user", content: `YESTERDAY (${s.yesterdaySum ? s.yesterdaySum.date : "none"}): ${s.yesterdaySum ? s.yesterdaySum.text : "(no summary)"}\n\nTODAY so far:\n${earlier.join("\n") || "(little)"}\n\nLAST HOUR:\n${lastHour.join("\n") || "(quiet)"}\n\nJSON only.` }];
  const raw = await runModel(env, messages, 1400, "hosts");
  const o = parseAI(raw); if (!o) return null;
  const clean = arr => (Array.isArray(arr) ? arr : []).map(l => ({ who: String(l?.who || "").toLowerCase().trim(), say: String(l?.say || "").replace(/\s+/g, " ").trim().slice(0, 220) }))
    .filter(l => (l.who === "zohar" || l.who === "oren") && l.say.length > 3);
  const show = clean(o.show).slice(0, 12), pip = clean(o.pip).slice(0, 6), today = String(o.today || "").replace(/\s+/g, " ").trim().slice(0, 900);
  if (show.length < 4 || today.length < 20) return null;
  const id = "studio-" + Math.floor(storyMs / 3600000);
  sponsorUsed(s, sp, show, storyMs);
  return { today, show: { id: id + "-show", t: storyMs, lines: show, sponsors: [sp.name] }, pip: pip.length >= 3 ? { id, t: storyMs, lines: pip } : null };
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

  HOSTS_APART = !!env.GEMINI_API_KEY;
  if (!force) try { await courseTick(env, s, now); } catch (e) { courseOf(s).err = { at: now, msg: String(e && e.message || e).slice(0, 200) }; }
  geminiOutUntil = Math.max(geminiOutUntil, s.geminiOutUntil || 0);   // a pause set by another isolate still counts
  // director: activate the next goal, or force it if its deadline passed
  let goal = activeGoal(s, now);
  let ev = null;
  if (goal && goal.course && now > deadlineOf(goal) && !(goal.step > 0)) { finishGoal(s, goal, "missed", now); goal = null; }   // a lecture he never reached moves to the next slot
  if (goal && now > deadlineOf(goal) && !(goal.step > 0)) {   // a planned scene already playing is not cut off
    ev = forcedEvent(goal, last, s); ev.src = "director goal (forced)";
    finishGoal(s, goal, "forced", now); ev.unlocks = goal.unlock || null;
    goal = null;
  }
  // AI out of budget (no backup AI): Ishai feels unwell, goes home and rests until the allowance resets
  cfOutUntil = Math.max(cfOutUntil, s.aiOutUntil || 0);
  if (!ev) ev = nightEvent(s, last, clock);                                   // asleep at night: no AI
  if (!ev && now < (s.aiOutUntil || 0) && !env.BACKUP_AI_KEY && !(env.GEMINI_API_KEY && now >= geminiOutUntil)){ ev = sickEvent(s, last, clock.hour); ev.src = "sick day (AI out of budget)"; }
  if (!ev && goal && goal.script) ev = scriptEvent(s, last, goal, now);       // the daily plan's scene, as written (no AI)
  if (!ev) ev = quietMedia(s, last);                                          // between live radio/TV reactions he just listens (no AI)
  let live = ev ? null : liveCue(s, last, clock, storyMs);                    // radio / TV / weather change: written live
  if (!ev && !live) { ev = queuedEvent(s, last, goal, now);                   // the next pre-written moment of the current block (no AI)
    if (!ev && s.plannedLive) live = liveCue(s, last, clock, storyMs); }      // the block reached "he turns on the radio/TV": that moment is live
  if (!ev) {
    try {
      if (live) { ev = await askAI(env, s, clock, now, goal, live); if (ev) { ev.src = lastWriter + " (live: " + live.why + ")"; attachAir(ev, live, s); } }
      else ev = await askBlock(env, s, clock, now, goal);
      if (ev && !ev.src) ev.src = (lastWriter || "AI") + " (one moment)";
      s.lastError = null;
      if (s.sickN) { s.sickN = 0; s.recoverUntil = now + 90 * 60000; }
    }
    catch (e) {
      const msg = !env.AI ? "Workers AI binding missing: add a Workers AI binding named AI" : String(e && e.message || e);
      console.log("AI error", msg); s.lastError = { at: now, msg };
      if (QUOTA_RE.test(msg)) {
        s.aiOutUntil = Math.max(s.aiOutUntil || 0, nextUtcMidnight(now));
        cfOutUntil = s.aiOutUntil;
        // sick day only when there is no backup AI at all; a backup hiccup just uses an ordinary backup line
        if (!env.BACKUP_AI_KEY && !(env.GEMINI_API_KEY && now >= geminiOutUntil)){ ev = sickEvent(s, last, clock.hour); ev.src = "sick day (AI out of budget)"; }
      }
    }
    if (!ev){ ev = fallback(last, clock.hour, s); ev.stuck = true; ev.src = s.lastError && s.lastError.at === now ? "backup line (AI error)" : "backup line (AI reply dropped: repeat)"; }
  }
  { const q = quietHosts(s, ev, s.nextId); if (q.length) ev.commentary = q; }   // nobody speaks: the hosts fill the silence
  { const u = unseenHosts(s, ev, s.nextId); if (u) ev.commentary = [...(ev.commentary || []), u]; }   // something only the narration says: a host names it
  if (!force) try { await pollTick(env, s, ev, now, last); } catch (e) { s.pollErr = { at: now, why: [String(e && e.message || e).slice(0, 160)] }; }
  if (!force) try { homeLifeTick(s, now, ev); } catch (e) { s.homeErr = String(e && e.message || e).slice(0, 160); }   // visits and dog walks   // viewers' poll: count the last one, write the next
  if (goal && goal.status !== "done" && ev.complete === goal.id) { finishGoal(s, goal, "story", now); ev.unlocks = goal.unlock || null; }

  if (ev.newCard) { s.cast[ev.newCard.id] = ev.newCard; s.lastNewAt = now; }
  if ((ev.commentary || []).some(c => SPONSORS.some(sp => c.say.toLowerCase().includes(sp.name.toLowerCase())))) s.lastAd = now;
  const did = { eating: ["eat"], cooking: [], drinking: ["drink"], bathroom: ["bathroom"], showering: ["shower", "bathroom"] }[ev.action] || [];
  if (ev.action === "eating" && (ev.location === "cafe" || ev.location === "bar")) did.push("drink");
  if (s.unlocked.includes("dog") && ["park", "street", "shops", "market"].includes(ev.location)) did.push("dogwalk");
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
  s.events.push({ id: s.nextId++, t: storyMs, created: now, location: ev.location, action: ev.action, delivery: ev.delivery || undefined,
    text: ev.text, with: ev.with || null, lines: ev.lines || [], commentary: ev.commentary || [], unlocks: ev.unlocks || null, src: ev.src || null });
  // the day's highlights, replayed in Ishai's dreams at night
  { const prevEv = s.events[s.events.length - 2], hl = s.hl || (s.hl = []), lastHl = hl[hl.length - 1];
    const notable = !["sleeping", "waking", "bathroom", "showering"].includes(ev.action) && ev.location !== "offscreen" &&
      (ev.with || ev.complete || ev.unlocks || (prevEv && prevEv.location !== ev.location && !["corridor", "street", "shops"].includes(ev.location)));
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
  if (s.queue) { if (ev.fromBlock) s.queue.afterId = evId; else dropQueue(s, "something else happened: " + (ev.src || "")); }   // any other moment ends the pre-written block
  s.lastRain = !!(s.world && s.world.weather && s.world.weather.rain);
  { const d = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(now)); const u = s.usage && s.usage.date === d ? s.usage : (s.usage = { date: d, calls: 0, inTok: 0, outTok: 0, moments: 0, noAI: 0 });
    u.moments++; if (/^(night|daily plan|on the way|on air|backup|sick|director)/.test(ev.src || "") || / \(block [2-9]/.test(ev.src || "")) u.noAI++; }
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
  { const d = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(now)); const u = s.usage && s.usage.date === d ? s.usage : (s.usage = { date: d, calls: 0, inTok: 0, outTok: 0, moments: 0, noAI: 0 });
    u.calls += USE.calls; u.inTok += USE.inTok; u.outTok += USE.outTok; USE.calls = USE.inTok = USE.outTok = 0;
    u.jsonFixed = (u.jsonFixed || 0) + JSON_USE.fixed; u.jsonBad = (u.jsonBad || 0) + JSON_USE.bad; JSON_USE.fixed = JSON_USE.bad = 0;
    u.gemini = { calls: (u.gemini?.calls || 0) + USE_G.calls, inTok: (u.gemini?.inTok || 0) + USE_G.inTok, outTok: (u.gemini?.outTok || 0) + USE_G.outTok }; USE_G.calls = USE_G.inTok = USE_G.outTok = 0;
    if (GEMINI_FAILS.length) { u.gemini.failed = (u.gemini.failed || 0) + GEMINI_FAILS.length; u.gemini.failedBy = u.gemini.failedBy || {};
      GEMINI_FAILS.forEach(f => { const k = f.status || "other"; u.gemini.failedBy[k] = (u.gemini.failedBy[k] || 0) + 1; });
      s.geminiErrs = [...(s.geminiErrs || []), ...GEMINI_FAILS].slice(-8); GEMINI_FAILS.length = 0; }
    s.geminiOutUntil = geminiOutUntil; }
  if (GEMINI_SEEN) s.geminiModel = GEMINI_SEEN;
  try { maybeAlert(s, ev, last, clock.hour, now); await sendAlerts(env, s); } catch (e) { console.log("alert", e && e.message); }   // never let an alert stop the show
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
// the city's own timetable, in Israel time. days: 0 = Sunday. from: minutes after midnight. The page plays it (sound, caption, hosts) with no AI; the story prompt names what is on.
const hm = (h, m = 0) => h * 60 + m;
const CITY = [
  { id: "garbage", days: [0, 3], from: hm(7, 10), min: 12, places: ["apartment", "corridor", "street", "shops"], sfx: "truck", label: "outside", note: "the garbage truck is grinding along Herzl Street",
    cap: ["...hold it, hold it, HOLD IT, okay.", "...who puts a sofa out on a Wednesday?", "...BEEP. BEEP. BEEP."], host: ["There's the garbage truck. The one alarm clock nobody can snooze.", "Herzl Street gets its weekly wake-up call. Apologies to apartment 4.", "That truck is the most reliable thing on this show."] },
  { id: "gas", days: [2], from: hm(10), min: 10, places: ["street", "shops", "corridor"], sfx: "gas", label: "outside", note: "the gas delivery man is clanking cylinders up the street",
    cap: ["...gas! Who ordered gas?", "...third floor, and no, there is no elevator."], host: ["The gas man's cylinders. You can hear him before you can see him.", "Clank, clank. The sound of someone else's Tuesday."] },
  { id: "alte", days: [1, 4], from: hm(11, 10), min: 14, places: ["apartment", "corridor", "street", "shops", "west1"], sfx: "megaphone", label: "outside", note: "the alte-zachen cart is rolling down the street, the old man shouting through his megaphone for old things to buy",
    cap: ["ALTE ZACHEN! ALTE ZACHEN!", "Fridges, fans, old radios, ALTE ZACHEN!", "I buy, I buy, everything old, I buy!"], host: ["The alte-zachen man. Eighty years old, one megaphone, zero competition.", "Quick, hide the old radio. He will make an offer.", "He has been shouting that since before this street had names."] },
  { id: "flowers", days: [5], from: hm(11), min: 45, places: ["shops", "street"], sfx: "steps", label: "overheard", note: "the Friday rush is on, people queue for flowers and challah before Shabbat",
    cap: ["...the white ones, for my mother, she will still complain.", "...one bouquet, one challah, and I am a good son."], host: ["The Friday flower queue. Every guilty son on Herzl Street, in one line.", "Friday rush. The whole street is buying its way out of something."] },
  { id: "market-close", days: [5], from: hm(13, 20), min: 40, places: ["market"], sfx: "kids", label: "overheard", note: "the market is closing for Shabbat and the vendors shout their last prices",
    cap: ["...everything five! Everything five! Going home!", "...take it, take it, I am not carrying it back!"], host: ["Last call at the shuk. This is when the real bargains come out.", "Prices drop by the minute now. It's basically a stock exchange with parsley."] },
  { id: "school", days: [0, 1, 2, 3, 4], from: hm(13, 30), min: 16, places: ["apartment", "corridor", "street", "shops", "west1", "west2", "west3", "park"], sfx: "kids", label: "outside", note: "school is out and kids are running down the street with their bags",
    cap: ["...it's not fair, you said no ball!", "...my mother said you can't!", "...last one to the kiosk pays!"], host: ["School's out. Herzl Street belongs to the under-tens now.", "Hear that? Thirty children and one ball.", "Avi's kiosk is about to do its best business of the day."] },
  { id: "piano", days: [0, 2, 4], from: hm(16, 5), min: 30, places: ["apartment", "corridor"], sfx: "piano", label: "through the wall", note: "a neighbour's child is practising the piano through the wall, the same few notes, one always wrong",
    cap: ["...again, from the beginning.", "...the second note, Noga. The SECOND note."], host: ["The piano from upstairs. Week six of the same four notes.", "That wrong note is the only surprise in the building.", "Someone in this building is getting very slightly better."] },
  { id: "kiosk", days: [0, 1, 2, 3, 4, 6], from: hm(18, 30), min: 30, places: ["street"], sfx: "steps", label: "overheard", note: "there is an evening queue at Avi's kiosk",
    cap: ["...with everything, and no tahini, I know, I know.", "...Avi, you said five minutes an hour ago."], host: ["Evening queue at Avi's. The neighbourhood parliament is in session.", "Everyone in that line has a theory about something."] },
  { id: "gameshow", days: [0, 1, 2, 3, 4, 6], from: hm(19, 30), min: 30, places: ["apartment", "corridor"], sfx: "gameshow", label: "through the wall", note: "Mrs. Levi's game show is loud through the wall of apartment 5",
    cap: ["...for five thousand shekels!", "...wrong! Wrong, you donkey, it's Haifa!"], host: ["Mrs. Levi's game show. She has never missed one, or stayed quiet through one.", "That's her TV. The shouting is also her.", "Apartment 5 is winning tonight, according to the wall."] }
];
function cityNote(now, sh) {
  if (sh && now >= sh.start && now <= sh.end) return "";   // the street rests on Shabbat
  const f = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(now)).map(p => [p.type, p.value]));
  const d = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(f.weekday), m = (+f.hour % 24) * 60 + +f.minute;
  const on = CITY.filter(e => e.days.includes(d) && m >= e.from && m < e.from + e.min);
  return on.length ? `\nAround the neighbourhood right now (only where he could see or hear it; he may react, it need not matter): ${on.map(e => `${e.note} (${e.places.join(", ")})`).join("; ")}.` : "";
}
// ---------- home life: friends and neighbours drop in, and Falafel gets his walks ----------
// No AI here: each one becomes a director goal like a poll result, so the story writes it when it starts. pollFree() keeps it clear of planned beats.
const VISITS_A_DAY = 3, VISIT_GAP_MIN = 150, VISIT_ALONE_MIN = 30;
const VISITS = {   // [why they come, what happens if the story never gets to it, weekdays only]
  levi: [["brings a pot of soup, sure he looks thin, and stays to ask nosy questions", "Mrs. Levi knocks with a pot of soup: 'You look thin, motek. Eat.'"],
    ["has a parcel the courier left with her, and wants to know what is in it", "Mrs. Levi brings up a parcel the courier left with her and waits to see him open it."],
    ["wants to borrow two eggs, and returns his last plate with a review of the food", "Mrs. Levi knocks to borrow two eggs and hands back his plate, with notes."],
    ["has the building's latest gossip and cannot wait until the stairs", "Mrs. Levi knocks with fresh building gossip and tells it all at the door."]],
  noa: [["drops by unannounced with a bag of snacks after a long session at the tattoo studio", "Noa turns up unannounced with snacks: 'I was in the area. I wasn't.'"],
    ["needs to borrow his phone charger, and stays to complain about a client", "Noa comes over to borrow a charger and stays to vent about a client."],
    ["wants his honest opinion on a tattoo design, and does not want his honest opinion", "Noa drops by with a tattoo sketch and asks what he really thinks."]],
  tomer: [["comes to borrow the drill and stays for coffee and football talk", "Tomer drops in to borrow the drill and stays for a coffee.", true],
    ["was working on the building's fuse box downstairs and pops up to say hi", "Tomer, in his work clothes, pops up after fixing the fuse box downstairs.", true],
    ["returns a ladder he borrowed months ago, as if it was yesterday", "Tomer brings back the ladder he borrowed in the summer."]],
  avi: [["brings a bag of leftover falafel at the end of his shift, and a bone for Falafel", "Avi knocks with a bag of leftover falafel and something for the dog."]]
};
const VISIT_WEIGHT = { levi: 3, noa: 3, tomer: 2, avi: 1 };
const WALKS = [["m", 7, 9.5, "park", "the morning walk: quick and sleepy, round to the park and back"],
  ["n", 12.5, 14.5, "street", "the midday walk: a short one along Herzl Street, past Avi's kiosk, and back up"],
  ["e", 18, 21, "park", "the evening walk: a longer one to the park, sniffing everything; they may run into someone"]];
function homeLifeTick(s, now, last) {
  const h = storyClock(now).hour, day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(now));
  const hl = s.homeLife && s.homeLife.date === day ? s.homeLife : (s.homeLife = { date: day, visits: 0, lastVisit: (s.homeLife || {}).lastVisit || 0, walks: [], log: [] });
  if (last.action === "sleeping" || h < 7 || h >= 22) return;
  const busy = from => !pollFree(s, from, from + 50 * 60000);
  const at = (ms, len) => ({ startAt: new Date(ms).toISOString(), deadlineAt: new Date(ms + len * 60000).toISOString() });
  // Falafel's walks
  if (s.unlocked.includes("dog")) {
    const w = WALKS.find(x => h >= x[1] && h < x[2]);
    const since = (now + DELAY_MIN * 60000 - (s.done.dogwalk || 0)) / 3600000;
    if (w && !hl.walks.includes(w[0]) && since > 3.5 && ["apartment", "corridor"].includes(last.location) && !busy(now)) {
      const start = now + 3 * 60000, id = `walk-${day.slice(5)}-${w[0]}`;
      s.director.push(newGoal({ id, ...at(start, 55), location: w[3], forceAction: "walking",
        goal: `Falafel needs ${w[4]}. Ishai clips on the leash and takes him out (out the front door, down the stairs, along Herzl Street${w[3] === "park" ? " to the park" : ""}), then home again. Falafel pulls, sniffs, greets everyone. If anyone is with Ishai they can come along.`,
        forceText: "Ishai clips on Falafel's leash and takes him out for his walk." }, now));
      hl.walks.push(w[0]); hl.log.push({ at: now, walk: w[0] }); return;
    }
  }
  // a friend or neighbour knocks
  if (hl.visits >= VISITS_A_DAY || h < 9 || h >= 21 || last.location !== "apartment" || last.with || now - hl.lastVisit < VISIT_GAP_MIN * 60000 || busy(now)) return;
  let alone = 0; for (let i = s.events.length - 1; i >= 0 && !s.events[i].with; i--) alone = (now - (s.events[i].created || s.events[i].t)) / 60000;
  if (alone < VISIT_ALONE_MIN || Math.random() > .4) return;
  const recent = new Set(s.events.filter(e => e.with && now - (e.created || e.t) < 4 * 3600000).map(e => e.with));
  const sh = s.world && s.world.shabbat, shabbat = !!sh && now >= sh.start && now <= (sh.end || sh.start + 26 * 3600000);
  const who = Object.keys(VISITS).filter(id => s.cast[id] && !recent.has(id) && !(hl.log || []).some(l => l.who === id));
  if (!who.length) return;
  let r = Math.random() * who.reduce((n, id) => n + VISIT_WEIGHT[id], 0), id = who[who.length - 1];
  for (const k of who) { r -= VISIT_WEIGHT[k]; if (r < 0) { id = k; break; } }
  const why = VISITS[id].filter(v => !(shabbat && v[2])), v = why[Math.floor(Math.random() * why.length)], c = s.cast[id];
  if (!v) return;
  s.director.push(newGoal({ id: `visit-${day.slice(5)}-${hl.visits + 1}`, ...at(now + 3 * 60000, 45), location: "apartment", with: c.name, forceWith: id, forceAction: "talking",
    goal: `${c.name} knocks on Ishai's front door: ${c.name} ${v[0]}. Ishai lets them in; they talk in the apartment for two to four moments, true to who ${c.name} is and what they both remember, then ${c.name} leaves by the front door. Small and real, nobody planned it.`,
    forceText: v[1] }, now));
  hl.visits++; hl.lastVisit = now; hl.log.push({ at: now, who: id });
  hl.log = hl.log.slice(-12);
}
// the longer memory of the show: what happened yesterday and today, and where each arc stands. Background for the writers, never to be rushed.
const clip = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); if (t.length <= n) return t; const c = t.slice(0, n), i = Math.max(c.lastIndexOf(". "), c.lastIndexOf("! "), c.lastIndexOf("? ")); return i > n / 2 ? c.slice(0, i + 1) : c.slice(0, c.lastIndexOf(" ")) + "..."; };
function storySoFar(s) {
  const out = [];
  if (s.yesterdaySum) out.push(`Yesterday: ${clip(s.yesterdaySum.text, 450)}`);
  if (s.daySum) out.push(`Today so far: ${clip(s.daySum.text, 650)}`);
  const arcs = (PLAN.arcs || []).filter(a => a && a.title).map(a => `- ${a.title}: ${clip(a.stage, 170)}`);
  if (arcs.length) out.push(`Ongoing arcs (where they stand; let people remember and mention them, never rush them or play a future step early):\n${arcs.join("\n")}`);
  return out.length ? `\nTHE STORY SO FAR (stay consistent with it):\n${out.join("\n")}` : "";
}
function buildMessages(s, clock, now, goal, opt = {}) {
  const block = opt.block || 0, cue = opt.live || null;
  const last = s.events[s.events.length - 1];
  const cw = last.with || (BATH_ACTIONS.includes(last.action) && s.scene ? s.scene.w : null); // a guest waits while he is in the bathroom
  const owned = s.unlocked.map(u => ITEMS[u]).filter(Boolean);
  const dogLine = s.unlocked.includes("dog")
    ? "\n- Falafel, Ishai's scruffy sandy dog (adopted from Avi's kiosk), goes everywhere with him: he walks him, feeds him, Falafel begs at the counter, naps in his own bed, steals socks. Mention Falafel now and then; the hosts adore him."
    : s.unlocked.includes("stray") ? "\n- A scruffy sandy stray dog hangs around Avi's kiosk on Herzl Street; Avi secretly feeds it falafel balls. Ishai keeps noticing it." : "";
  const world = Object.entries(PLACES).map(([k, v]) => `- ${k}: ${v}. Allowed actions: ${allowed(k, s.unlocked).join(", ")}`).join("\n");
  const gapMin = Math.round((now - (last.created || last.t)) / 60000);
  const gap = gapMin > 45 ? `\nNote: about ${gapMin >= 120 ? Math.round(gapMin / 60) + " hours" : gapMin + " minutes"} passed since the last moment; account for that.` : "";
  const direction = goal && goal.script && !(goal.step > 0)
    ? `\nSECRET STORY DIRECTION: soon a planned scene happens at ${goal.where || goal.script[0].location}${goal.with ? " with " + goal.with : ""}. Do NOT write that scene or bring them in yourself; just let Ishai wrap up what he is doing (end a conversation, finish a task), ready to go.`
    : goal
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
${block ? `- Write the NEXT ${block} MOMENTS, in order, about ${INTERVAL_MIN} minutes apart (story times ${Array.from({ length: block }, (_, k) => storyClock(now + DELAY_MIN * 60000 + k * INTERVAL_MIN * 60000).label.slice(-5)).join(", ")}). Each moment is 1-2 short sentences, max 35 words, present tense, third person, and follows on from the one before (one neighboring place at a time; a conversation may run across several moments with 8-14 NEW lines each, then ends naturally). The radio and TV are written live: if he turns one on, that is the LAST moment you write. Every moment where he is with someone or on the phone has 8-14 spoken lines; use only the listed actions.` : "- Write the NEXT moment only: 1-2 short sentences, max 35 words, present tense, third person."}
- Be concrete: viewers only see this one line, so name things plainly (which show, which game, what the news says). Never write vague lines like "an article" or "a new character" without saying what it is.
- This is reality, not a sitcom and not scripted. Ishai and everyone around him behave like real people: ordinary, believable choices, real pacing, small moments. No slapstick, no staged coincidences, no punchlines in the narration. Humor comes from real life and from the hosts.
- Ishai does not know he is being filmed. He never talks to or about the camera, the show or the hosts.
- Real-world logic: things take time and follow physics and logistics. He must physically get places (walk, bus or taxi), wait, carry what he buys, pay, clean up. Other people have their own jobs, schedules and moods and are not always available. Weather and time of day change plans.
- Continue the story and its ongoing threads.
- Clothes are automatic (the picture shows them): pajamas in bed at night, sportswear at the gym, a jacket outside in rain or cold, a white shirt at home for Shabbat; mention them naturally if at all.
- FOOD DELIVERY: he can order food from the Shuk Shalom vendors with the ateBite app (on his phone or laptop). Ordering is one moment; 30-45 minutes later an ateBite courier rings at his door with the bag: in THAT moment (location apartment) set "delivery": true. Then he eats.
- SHOPPING: food at Shuk Shalom market, everything else (electronics, clothes, home stuff) at the Everything Else store next to it; both are a bus ride from Herzl Street.
- Buses come every few minutes and taxis are quick: waiting at the bus stop takes at most ONE moment; in the next moment he is already on the way. Going to the market or off camera directly is fine: the viewers see the ride from inside by themselves. Use location "bus" or "taxi" only when something happens on the ride itself (a talk with a friend, a passenger, the driver, a phone call). A ride lasts one moment, at most two; then he gets off at "street" or "market", or goes "offscreen". Night, rain and Shabbat: taxi (no buses).
- "exercising" is a real workout (20+ minutes). A quick stretch or a short break at the desk keeps the current action (working, reading...).
- "walking" means walking somewhere or a stroll outside; for chatting use "talking", for hanging around use "idle".
- The camera shows only "action": pick the action that matches what happens (a drink = drinking, a snack = eating); the hosts describe only what the picture can show.
- Respect the clock: he sleeps at night (roughly 00:00-07:30), eats at mealtimes, works on weekdays (Sunday-Thursday in Israel).
- He is a real person: he drinks, eats, uses the bathroom and showers. Bathroom and shower happen behind the closed bathroom door; keep them brief and tasteful.
- THE REAL WORLD is real: use the real weather and the Jewish calendar (e.g. Friday-night Shabbat dinner) naturally. If any real news sounds sad or serious, he reacts briefly and respectfully, never jokes about it, or changes the channel.
- Location must be one of: ${Object.keys(LOCATIONS).join(", ")}. Action must be allowed in that location.
- He can only move to a neighboring location: ${Object.entries(NEXT).map(([k, v]) => `${k} -> ${v.join("/")}`).join("; ")}.
- If he is AT a place without a camera, use location "offscreen" with action "away". Never use "offscreen" for being on the way or for arriving somewhere that has a camera.
- Things he owns at home: laptop, books, game console${owned.length ? ", " + owned.join(", ") : ""}.${dogLine} Do not invent other big objects. When he watches TV or listens to the radio, mention what is on (make up shows and stations). ${TV_SHOW}
- "with" is the id of ONE person with him in this moment (a visitor at home counts), or the person on the other end when the action is "phoning"; otherwise null.
- He is social: at least one moment in two involves another person: in person, a phone call, or a text or email. Friends visit and call, strangers start conversations, regulars say something. ${(() => { let n = 0; for (let i = s.events.length - 1; i >= 0 && n < 8; i--) { const e = s.events[i]; if (e.with || (e.lines || []).length > 1 || e.action === "sleeping") break; n++; } return n >= 3 ? `He has been alone for ${n} moments: in THIS moment someone calls, texts or talks to him.` : ""; })()}
- GADI, his boss in all but name, is NEVER seen in person. He only phones (action "phoning", "with": "gadi") or sends a text or email: add "message":{"from":"gadi","kind":"text"|"email","say":"max 25 words"} and Ishai reacts out loud in "lines", alone or with whoever is there. Friends can text the same way. A message needs no "with".
- REGULARS are people he doesn't know well yet, usually found in one place: ${SEED_CAST.filter(c => c.regular).map(c => `${c.name} ("${c.id}", ${c.regular})`).join(", ")}. If he is there at their hours, they can start a short exchange (use "with"), and he gets to know them over time. Kobi at the bar gets drunker with the hour; Mr. Zelig also talks to himself.
- "lines": REQUIRED when the action is "talking" or "phoning" (that IS the conversation). The spoken dialogue of this moment, in order, by "ishai" or the "with" person. When he is with someone or on the phone, write a real, life-like conversation of 8 to 14 lines (each max 25 words) that fills these 4 minutes: small talk, questions and follow-up questions, stories, teasing, short answers ("yeah", "wait, what?"), interruptions, a topic that drifts to another, a pause filled by someone. Each person in their own voice, with their own opinions and agenda. A conversation usually continues over several moments; pick up exactly where it left off. When he is alone, at most 1 line (muttering to himself or to Moshe), or []. Never put narration inside lines.
- EVERY CONVERSATION IS A SCENE WITH A PURPOSE. When a conversation with someone STARTS (their "with" differs from the last moment), fill "scene":
  {"type":"small talk"|"practical"|"plot","why":"the real reason they are talking now (who started it and why)","ishaiWants":"...","theyWant":"...","beats":"3-5 short steps the conversation goes through","ending":"how it ends","lines":12-60 total lines across moments}
  Ground it in the place, the time of day, both characters' personalities, memories and relationship, and ongoing plot threads. Small talk is fine but still has a reason (bored, lonely, being polite, avoiding work). Plot scenes move an arc forward. Otherwise "scene": null.
  While a scene runs, every line serves it: people pursue what they want, dodge, change the subject, give in or push back, like real people.
- When "with" is set, "update" holds that person's updated memory of Ishai (max 25 words, keep old facts that still matter) and "mood": -1, 0 or 1 for how this moment changed their feelings.
- ${allowNew
  ? `You MAY introduce one new person, only if the story really needs someone new. Describe them in "newCharacter" and use their name as "with". Look options: hair ${LOOK.hair.join("/")}; hairColor ${LOOK.hairColor.join("/")}; skin ${LOOK.skin.join("/")}; shirt and pants ${LOOK.cloth.join("/")}; extras any of ${LOOK.extras.join("/")}.`
  : `Do NOT introduce new people right now; "newCharacter" must be null.`}
- VIEWERS NEVER READ "text". They see small pixel people and hear the lines. Anything in "text" the picture cannot show (something brought, held, handed over or given; what is in a bag or a pot; wet clothes, a cut, a new haircut; a smell; a sound off camera; a message he reads) must reach them in "lines": someone names it naturally ("You brought Moshe a little brother?", "Why are you soaked?"), never as a stage direction. In a moment with no talking, keep "text" to what the picture shows.
- Do not repeat the previous event.${direction}

COMMENTATORS (they talk to the viewers, who do NOT see your "text", only the picture and the spoken lines):
- ${HOSTS.zohar}
- ${HOSTS.oren}
- ${HOSTS.rules}
${(() => { const r = recentHostLines(s, 8); return r.length ? `- The hosts ALREADY SAID these (never repeat them, their jokes, openings, catchphrases or topics; find something NEW about THIS moment):\n${r.map(x => "  * " + x).join("\n")}\n` : ""; })()}"commentary": 0-2 short lines (max 20 words each) as {"who":"zohar"|"oren","say":"..."}. Their job: react to what viewers SEE right now (the place, the action, who is there) and HEAR (the spoken lines), connect it to earlier moments, make viewers care about the characters, and make them laugh. They NEVER invent things that are not on screen: no drinks, food, objects, visitors, calls or plans that are not in this moment's action/lines. Opinions, guesses and jokes about what is visible are fine ("he's been staring at that fridge for a while"). If the moment is "offscreen", viewers see only static ("subject out of camera coverage"): the hosts do NOT describe what he is doing there as if they could see it; they wonder where he is, guess, joke about losing him, or look back at earlier moments. Comment on most moments. Viewers cannot read the narration, so usually ONE of the lines says in plain words what is happening right now (e.g. "He's making tea with honey, the third today"), and the other adds the joke or reaction. REQUIRED: whenever another character is present or anyone speaks, include 1-2 commentary lines reacting to it (write the dialogue first, then the hosts react). They banter with each other. Edgy and cynical is fine, but never cruel about real groups or people, no slurs, no jokes about death, dying or illness, keep it PG-13. They may hint at secret story directions ("I have a feeling about that barista") but never reveal them. Never mention or advertise real brands or companies.${sponsor ? `
- ${block ? "IN ONE OF THESE MOMENTS" : "THIS MOMENT"}: one host slips in an obvious, cheesy "secret" sponsor plug for ${sponsor.name} (${sponsor.pitch}), tied to what Ishai is doing, ending in a wink like "...not sponsored, by the way". The other host reacts (annoyed, or caught up in it).` : ""}

${block ? `Reply with ONLY this JSON, nothing else: {"moments":[ ...exactly ${block} moments in order... ]}, where EACH moment looks like this:` : "Reply with ONLY this JSON, nothing else:"}
{${cue && cue.onAir && !cue.onAir.say ? '"onAir":"...",' : ""}"location":"...","action":"...","text":"...","with":null,"delivery":false,"lines":[{"who":"ishai","say":"..."},{"who":"<the with id>","say":"..."}],"commentary":[],"scene":null,"update":null,"newCharacter":null,"complete":null,"missing":null,"notes":"ongoing plot threads, max 25 words"}
"missing": if this moment features an object, animal or place the camera cannot show (not listed above), name it in 1-3 words (e.g. "bicycle", "puppy"); otherwise null.
newCharacter format: {"name":"...","role":"...","personality":"...","speech":"...","hangouts":["..."],"look":{"hair":"...","hairColor":"...","skin":"...","shirt":"...","pants":"...","extras":[]}}`;
  const user =
`Story time now: ${clock.label} (${TZ}).
He is currently at: ${last.location} (${last.action}${last.with ? " with " + name(last.with) : ""}).
Plot notes: ${s.notes || "none"}${storySoFar(s)}${cityNote(now, s.world && s.world.shabbat)}${courseNote(s, now, cw)}
${body}
${real}${media}${pacing ? "\nPACING: " + pacing : ""}${s.fixNote && now < s.fixNote.until ? "\nDIRECTOR NOTE: " + s.fixNote.text : ""}${clock.hour < 6 ? `\nIT IS NIGHT (${clock.label.slice(-5)}): dark outside, no sunrise before about 06:00. He sleeps in his bed.` : ""}${s.stuck && (clock.hour < 6 || last.action === "sleeping") ? "\nKeep him asleep in his bed; describe the night differently each time (a sound outside, he turns over, a dream)." : ""}${s.stuck && !(clock.hour < 6 || last.action === "sleeping") ? "\nTHE STORY IS GOING IN CIRCLES: the last moments repeated themselves. Make a clear change NOW: finish what he started, end the conversation, change activity or place." : ""}
Recent events:
${recent}${gap}${goneNote}${s.recoverUntil && now < s.recoverUntil ? "\nNOTE: Earlier Ishai felt unwell and rested at home. He feels better now, still a little slow; let that show naturally (and he may mention it to someone)." : ""}${convo}${sceneBrief}
${cue ? "\n" + liveText(cue, s, last) : ""}

${block ? `What happens in the next ${block} moments?` : "What happens next?"}`;
  const sys = HOSTS_APART ? system.replace(/\nCOMMENTATORS \(they talk[\s\S]*?\n(?=\nReply with ONLY)/, "\n").replace('"commentary":[],', "") : system;
  return [{ role: "system", content: sys }, { role: "user", content: user }];
}

// the hosts react to the moments the story just wrote (one call for a whole block)
const CAMERA = { apartment: "his apartment", bathroom: "closed bathroom door", corridor: "the building hallway", street: "Herzl Street outside his building", shops: "the shops block of Herzl Street (sidewalk)",
  park: "the park", cafe: "Cafe Nahat", gym: "Herzl Gym", bar: "The Black Candle bar", market: "Shuk Shalom market", store: "the Everything Else store", campus: "the courtyard of Tel Herzl University", classroom: "a lecture room at the university", bus: "inside the bus, the city going past the windows", taxi: "the back seat of a taxi, the city going past the window", offscreen: "STATIC - no camera, he is out of coverage" };
async function addHosts(env, s, moments, clock, now) {
  try {
    const nm = id => id === "ishai" ? "Ishai" : id === "radio" ? "the radio" : id === "tv" ? "the TV" : s.cast[id]?.name || id;
    const said = recentHostLines(s, 10);
    const sponsor = now - (s.lastAd || 0) > AD_EVERY_MIN * 60000 && Math.random() < 0.35 ? SPONSORS[Math.floor(Math.random() * SPONSORS.length)] : null;
    const list = moments.map((m, i) => { const loc = String(m.location || "").toLowerCase(), act = String(m.action || "").toLowerCase(), w = m.with ? String(m.with).toLowerCase() : null;
      return `#${i + 1} ${storyClock(now + DELAY_MIN * 60000 + i * INTERVAL_MIN * 60000).label.slice(-5)} CAMERA: ${CAMERA[loc] || loc} | picture: Ishai ${act}${w ? " with " + nm(w) : ""}${m.delivery ? " | an ateBite courier at the door" : ""}\n   what happens: ${String(m.text || "").slice(0, 220)}` +
        (Array.isArray(m.lines) && m.lines.length ? "\n   they say: " + m.lines.slice(0, 14).map(l => `${nm(String(l.who || "").toLowerCase())}: "${String(l.say || "").slice(0, 120)}"`).join(" / ") : ""); }).join("\n");
    const msgs = [{ role: "system", content:
`You write the two hosts of a live reality show that secretly films Ishai, a man in Tel Aviv.
- ${HOSTS.zohar}
- ${HOSTS.oren}
- ${HOSTS.rules}
For EACH moment below write 0-2 short lines (max 20 words each). The viewers see only the picture (the camera and what Ishai is doing) and hear the spoken lines; they cannot read "what happens", so usually one line says plainly what is going on, then a joke, an opinion or a guess. React only to what is visible or said: never invent drinks, food, objects, visitors, calls or plans. When "what happens" has a detail the picture can't show and nobody says it (an object someone brings, holds or hands over, wet clothes, a smell, a sound), one line names it plainly, for example: Dana's at the door with a wet coat and a little pot of basil. If the CAMERA is STATIC, they cannot see him: they wonder where he is, guess, or joke about losing him. Fresh every time: never repeat the lines below, their jokes, openings or catchphrases.${sponsor ? `\nIN ONE OF THESE MOMENTS one host slips in an obvious, cheesy "secret" plug for ${sponsor.name} (${sponsor.pitch}), tied to what Ishai is doing, ending with a wink like "...not sponsored, by the way"; the other host reacts.` : ""}
Reply with ONLY JSON: {"moments":[{"commentary":[{"who":"zohar"|"oren","say":"..."}]}]} with exactly ${moments.length} entries, in order.` },
      { role: "user", content: `${s.daySum ? `TODAY SO FAR (to connect with earlier moments): ${clip(s.daySum.text, 300)}\n\n` : ""}ALREADY SAID (do not repeat): ${said.length ? said.map(x => `"${x}"`).join(" ") : "nothing yet"}\n\nMOMENTS:\n${list}` }];
    // read whatever came back, even a cut-off or slightly broken reply: every {"commentary":[...]} found, in order
    const readHosts = raw => { const o = parseAI(raw); if (o && Array.isArray(o.moments)) return o.moments;
      const out = []; const re = /"commentary"\s*:\s*\[([\s\S]*?)\]/g; let m;
      while ((m = re.exec(raw))) { const items = []; const ri = /\{\s*"who"\s*:\s*"(zohar|oren)"\s*,\s*"say"\s*:\s*"((?:[^"\\]|\\.)*)"/gi; let k;
        while ((k = ri.exec(m[1]))) items.push({ who: k[1], say: k[2].replace(/\\"/g, '"') }); out.push({ commentary: items }); }
      return out; };
    let arr = readHosts(await runModel(env, msgs, 300 + moments.length * 200, "hosts"));
    if (arr.filter(x => (x.commentary || []).length).length < Math.ceil(moments.length / 2) && env.GEMINI_API_KEY && Date.now() >= geminiOutUntil) {
      try { const g = readHosts(await runGemini(env, msgs, 300 + moments.length * 200)); if (g.length > arr.length) arr = g; } catch (e) { noteGemini(e, "hosts"); }
    }
    const used = [...said];
    moments.forEach((m, i) => {
      const c = (Array.isArray(arr[i]?.commentary) ? arr[i].commentary : []).map(x => ({ who: String(x?.who || "").toLowerCase().trim(), say: String(x?.say || "").replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "").slice(0, 160) }))
        .filter(x => (x.who === "zohar" || x.who === "oren") && x.say.length > 3 && !isRepeat(x.say, used)).slice(0, 2);
      c.forEach(x => used.push(x.say));
      if (c.length) m.commentary = c;
    });
    s.hostsBy = lastWriter; if (arr.some(x => (x.commentary || []).length)) s.hostsErr = null;   // the error shown is a current one
  } catch (e) { s.hostsErr = { at: now, msg: String(e && e.message || e).slice(0, 200) }; }
  // nobody wrote anything for a moment with something going on: the hosts at least say what is happening (no AI)
  moments.forEach((m, i) => { if (!(m.commentary || []).length && (m.with || (m.lines || []).length || i === 0))
    m.commentary = relayHosts(s, String(m.text || ""), Math.floor(now / 36e4) + i, null); });
}
async function askAI(env, s, clock, now, goal, live) {
  const ev = await askStory(env, s, clock, now, goal, live);
  if (ev && HOSTS_APART && !(ev.commentary || []).length) await addHosts(env, s, [ev], clock, now);
  return ev;
}
async function askStory(env, s, clock, now, goal, live) {
  const last = s.events[s.events.length - 1];
  const messages = buildMessages(s, clock, now, goal, { live });
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

// read an AI reply: strict first, then repaired (usage.jsonFixed / jsonBad count both).
// Cutting at the last "}" means a reply stopped by max_tokens loses its unfinished item, so no half sentence goes on air.
const JSON_USE = { fixed: 0, bad: 0 };
function parseAI(raw) {
  const t = String(raw || "").replace(/```(?:json)?/gi, "").trim(), arr = t.startsWith("[");
  const i = arr ? 0 : t.indexOf("{"), j = arr ? Math.max(t.lastIndexOf("}"), t.lastIndexOf("]")) : t.lastIndexOf("}");
  if (i < 0 || j <= i) { JSON_USE.bad++; return null; }
  const body = t.slice(i, j + 1);
  try { return JSON.parse(body); } catch (e) {}
  try { const o = JSON.parse(jsonrepair(body)); if (o && typeof o === "object") { JSON_USE.fixed++; return o; } } catch (e) {}
  JSON_USE.bad++; return null;
}
// why a written moment was thrown away, per day: usage.drops
const dropKind = p => /valid JSON/.test(p) ? "json" : /is not possible in/.test(p) ? "action" : /known person|new people|newCharacter/.test(p) ? "person" : "other";
function countDrop(s, problem, n = 0) { const u = s.usage; if (!u) return; u.drops = u.drops || {}; const k = dropKind(String(problem || "")); u.drops[k] = (u.drops[k] || 0) + 1; u.wasted = (u.wasted || 0) + n; }
let lastWriter = null; // which model wrote the latest AI reply (shown to the director)
let modelIdx = 0; // remembers the first model that works in this isolate
// what the AI used this run (merged into s.usage in tick, shown in /api/health)
const USE = { calls: 0, inTok: 0, outTok: 0 };
// who writes what: with a Google key, Gemini writes the story and Cloudflare Workers AI writes the hosts (comments, recaps, callers);
// each one is the other's backup. Without the key everything runs on Cloudflare as before.
let HOSTS_APART = false;
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const USE_G = { calls: 0, inTok: 0, outTok: 0 };
let geminiModel = null, geminiOutUntil = 0, GEMINI_SEEN = null;
// failures of this run: memory is per isolate and /api/health may be another one, so tick() saves these in the state (s.geminiErrs, s.geminiOutUntil)
const GEMINI_FAILS = [];
const noteGemini = (e, role) => { const msg = String(e && e.message || e).slice(0, 500), m = msg.match(/^gemini (\d{3})/); GEMINI_FAILS.push({ at: Date.now(), role, status: m ? +m[1] : null, msg }); };
async function pickGemini(env) {
  if (env.GEMINI_MODEL) return env.GEMINI_MODEL;
  if (geminiModel) return geminiModel;
  try {
    const r = await fetch(GEMINI_URL + "/models", { headers: { authorization: "Bearer " + env.GEMINI_API_KEY } });
    const ids = ((await r.json()).data || []).map(m => String(m.id || "").replace(/^models\//, ""));
    const ver = id => parseFloat((id.match(/gemini-([\d.]+)/) || [0, 0])[1]);
    const lite = ids.filter(id => /^gemini-[\d.]+-flash-lite$/.test(id)).sort((a, b) => ver(b) - ver(a));
    geminiModel = lite[0] || ids.filter(id => /flash-lite/.test(id) && !/preview|exp|tts|image|live|audio/.test(id)).sort((a, b) => ver(b) - ver(a))[0] || "gemini-2.5-flash-lite";
  } catch (e) { geminiModel = "gemini-2.5-flash-lite"; }
  return geminiModel;
}
const nextPacificMidnight = now => { const d = new Date(now); const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8, 5); return t > now ? t : t + 86400000; };
async function runGemini(env, messages, maxTokens) {
  const model = await pickGemini(env);
  const body = { model, messages, max_tokens: maxTokens, temperature: 0.9, response_format: { type: "json_object" } };
  const call = () => fetch(GEMINI_URL + "/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.GEMINI_API_KEY }, body: JSON.stringify(body) });
  let r = await call();
  if (r.status === 400) { delete body.response_format; r = await call(); }            // an older model without JSON mode
  if (!r.ok) {
    const full = await r.text(), t = full.slice(0, 220);
    if (r.status === 429) geminiOutUntil = /per ?day|daily|PerDay/i.test(t) ? nextPacificMidnight(Date.now()) : Date.now() + 90000;   // the free daily quota resets at midnight Pacific
    if (r.status === 404 && !env.GEMINI_MODEL) geminiModel = null;                    // that model is gone: pick again next time
    if (r.status === 401 || r.status === 403) geminiOutUntil = Date.now() + 3600000;  // bad key: try again in an hour
    throw new Error(`gemini ${r.status} (${model}): ${full.slice(0, 460)}`);
  }
  const j = await r.json(), c = String(j?.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  USE_G.calls++; USE_G.inTok += j?.usage?.prompt_tokens || 0; USE_G.outTok += j?.usage?.completion_tokens || 0;
  if (!c) throw new Error(`gemini (${model}): empty reply`);
  lastWriter = "gemini: " + model; GEMINI_SEEN = model;
  return c;
}
async function runModel(env, messages, maxTokens = 1000, role = "story") {
  const g = !!env.GEMINI_API_KEY && Date.now() >= geminiOutUntil;
  if (g && role === "story") { try { return await runGemini(env, messages, maxTokens); } catch (e) { noteGemini(e, "story"); } }
  try { return await runCloudflare(env, messages, maxTokens); }
  catch (e) {
    if (g && role !== "story") { try { return await runGemini(env, messages, maxTokens); } catch (e2) { noteGemini(e2, role); } }
    throw e;
  }
}
async function runCloudflare(env, messages, maxTokens = 1000) {
  let lastErr;
  // while Workers AI is out of budget, skip it (no wasted calls) and use the backup AI if one is set
  for (let i = Date.now() < cfOutUntil ? MODELS.length : modelIdx; i < MODELS.length; i++) {
    try {
      const qwen = MODELS[i].includes("qwen3");
      // Qwen3 "thinks" by default; /no_think keeps it cheap (no hidden reasoning tokens)
      const msgs = qwen ? messages.map((m, k) => k === messages.length - 1 && m.role === "user" ? { ...m, content: m.content + " /no_think" } : m) : messages;
      const out = await env.AI.run(MODELS[i], { messages: msgs, max_tokens: maxTokens, temperature: qwen ? 0.8 : 0.9 });
      USE.calls++; USE.inTok += out?.usage?.prompt_tokens || Math.round(JSON.stringify(msgs).length / 3.8); USE.outTok += out?.usage?.completion_tokens || 0;
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
    if (env.BACKUP_AI_KEY) return await runBackup(env, messages, maxTokens);
    throw lastErr || new Error("4006: Workers AI daily free allocation used up (back at 00:00 UTC)");
  }
  throw lastErr;
}

// a ride is never "offscreen": on the way he is on board, and getting off at the market puts him at the market
function fixRideLocation(ev, last) {
  if (ev.location !== "offscreen" || !["street", "market", "bus", "taxi", "offscreen"].includes(last.location)) return;
  const off = /\b(gets? off|got off|getting off|steps? off|stepped off|gets? out|got out|arrives?|arrived|drops?|dropped|reaches|reached)\b/i.test(ev.text);
  if (off && /\b(market|shuk|everything else)\b/i.test(ev.text + " " + last.text)) { ev.location = "market"; ev.action = "walking"; }
  else if (off && /\b(herzl|home|his building|his street)\b/i.test(ev.text)) { ev.location = "street"; ev.action = "walking"; }
  else if (!off && /\b(bus|taxi|cab|ride|driver)\b/i.test(ev.text)) { ev.location = /\b(taxi|cab|driver)\b/i.test(ev.text) ? "taxi" : "bus"; ev.action = "idle"; }
}
function validate(raw, s, last, allowNew, goal, allowNoHosts) {
  const o = parseAI(raw); if (!o) return { problem: "the reply was not valid JSON" };
  const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  // "walking with noa" put in the action: the action is "walking", and Noa goes in "with" if she is a known person
  { const wa = str(o.action, 60).toLowerCase().match(/^(\S+)\s+with\s+(.+)$/);
    if (wa) { o.action = wa[1]; const p = /^(null|none)?$/i.test(str(o.with, 40)) && Object.values(s.cast).find(c => c.id === wa[2] || c.name.toLowerCase() === wa[2] || c.name.toLowerCase().split(" ")[0] === wa[2]); if (p) o.with = p.id; } }
  const ev = {
    location: str(o.location, 20).toLowerCase(), action: str(o.action, 20).toLowerCase(),
    text: str(o.text, 260), notes: str(o.notes, 200), with: null, lines: [], update: null, newCard: null,
    complete: goal && str(o.complete, 40).toLowerCase() === goal.id ? goal.id : null,
    missing: (() => { const m = str(o.missing, 30).toLowerCase().replace(/[^a-z0-9 '-]/g, "").trim(); return m && m !== "null" && m !== "none" ? m : null; })()
  };
  if (ev.text.length < 8) return { ev: null, problem: "the text is missing" };
  fixRideLocation(ev, last);
  if (o.delivery === true || o.delivery === "true") ev.delivery = true;
  { const a = str(o.onAir && typeof o.onAir === "object" ? o.onAir.say : o.onAir, 220).replace(/^["']|["']$/g, ""); if (a.length > 5 && !/^(null|none)$/i.test(a)) ev.onAir = a; }

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
  // some people are only ever on the phone
  if (ev.with && s.cast[ev.with]?.phoneOnly) { if (LOCATIONS[ev.location]?.includes("phoning")) ev.action = "phoning"; else ev.with = null; }
  // dialogue
  const who = x => { const k = str(x, 40).toLowerCase(); if (k === "ishai") return "ishai";
    if (allowNoHosts && ev.action === "lecture" && STUDENT.test(k)) return k;  // the class speaks up, nameless, from their seats
    const c = ev.with && (ev.with === k || (s.cast[ev.with]?.name || ev.newCard?.name || "").toLowerCase() === k); return c ? ev.with : null; };
  ev.lines = (Array.isArray(o.lines) ? o.lines : []).map(l => ({ who: who(l?.who), say: str(l?.say, 200).replace(/^["']|["']$/g, "") }))
    .filter(l => l.who && l.say).slice(0, 14);
  // a text or an email: read out first, then he reacts in "lines"
  if (o.message && typeof o.message === "object") { const id = str(o.message.from, 20).toLowerCase(), say = str(o.message.say, 160), via = str(o.message.kind, 10).toLowerCase() === "email" ? "email" : "text";
    if (s.cast[id] && say) ev.lines.unshift({ who: id, say, via }); }
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
  // a ride ends: no third moment on the same bus or taxi
  if ((ev.location === "bus" || ev.location === "taxi") && last.location === ev.location && s.events[s.events.length - 2]?.location === ev.location)
    return { ev, problem: `this ride has gone on long enough: he gets off now, at "street" or "market", or goes "offscreen"` };
  // the shops block is only the sidewalk: nobody is inside a store on camera there
  if (ev.location === "shops" && /\b(inside the (store|shop)|in the (store|shop)|salesperson|sales ?(clerk|man|woman|guy)|shop assistant|aisle|checkout|cashier|browses|tries on|display (tv|screen)s?|tv section|electronics)\b/i.test(ev.text) && !allowNoHosts)
    return { ev, problem: 'the "shops" camera only sees the sidewalk and the shop windows; he cannot be inside a store there. He looks in a window, uses the ATM or walks on; shopping happens at the Everything Else store next to Shuk Shalom market (bus from the street)' };
  // buses come every few minutes: waiting at the stop is at most one moment, then he is on the bus (the page shows it pull in)
  if (last.location === "street" && ev.location === "street" && !ev.with && /\b(bus|taxi)\b/i.test(last.text) && /\b(wait|waits|waiting|bus stop|stop)\b/i.test(last.text)
    && /\b(bus|taxi|wait|waits|waiting|stop)\b/i.test(ev.text) && !/\b(gets off|got off|steps off|back from)\b/i.test(ev.text)) {
    const taxi = /taxi/i.test(last.text + " " + ev.text);
    const toMarket = /\b(market|shuk|everything else)\b/i.test(last.text + " " + ev.text);
    ev.location = toMarket ? "market" : "offscreen"; ev.action = toMarket ? "walking" : "away"; ev.lines = []; ev.text = toMarket ? "The bus drops Ishai at Shuk Shalom; the market is loud and smells of spices." : taxi ? "A taxi pulls up at the stop and Ishai gets in." : "The bus pulls in; Ishai gets on and it drives off.";
    if (s.queue) s.queue.items = [];   // the rest of a pre-written block assumed he was still waiting
  }
  // a quick stretch / break at the desk or in the armchair is not a workout: he stays put (the page shows a stretch in the seat)
  if (ev.action === "exercising" && ev.location === last.location && ["working", "gaming", "reading", "watching"].includes(last.action) && !ev.with
    && /\b(stretch|stretches|break|stands? up|gets up|legs|back|neck|shoulders?|yawn)/i.test(ev.text) && !/\b(workout|push-?ups|sit-?ups|jog|run|yoga|weights|treadmill)\b/i.test(ev.text)) ev.action = last.action;
  // "walking" indoors is not a way to hang out: with someone it is talking, alone it is idle (the page adds errands)
  if (ev.action === "walking" && ["apartment", "cafe", "gym", "bar", "store"].includes(ev.location)) ev.action = ev.with ? "talking" : ev.location === "gym" ? "exercising" : "idle";
  { const h = storyClock(Date.now() + DELAY_MIN * 60000).hour;
    if (ev.location === "bar" && last.location !== "bar" && h >= 2 && h < 17) return { ev, problem: "The Black Candle bar is closed now (it opens at 17:00 and closes at 02:00); he cannot go in" };
    if (ev.location === "gym" && last.location !== "gym" && (h >= 23 || h < 6)) return { ev, problem: "Herzl Gym is closed now (open 06:00-23:00)" };
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date(Date.now() + DELAY_MIN * 60000));
    const shut = (open, close) => wd === "Sat" || h < open || h >= (wd === "Fri" ? 14 : close);
    if (ev.location === "campus" && last.location !== "campus" && last.location !== "classroom" && !allowNoHosts && (shut(8, 20) || wd === "Fri")) return { ev, problem: "the university is closed now (Sunday to Thursday, 08:00-20:00)" };
    if (ev.location === "classroom" && !allowNoHosts) return { ev, problem: "the lecture room is only used during a lecture; he stays in the courtyard" };
    if (ev.location === "market" && last.location !== "market" && shut(7, 19)) return { ev, problem: "Shuk Shalom market is closed now (07:00-19:00, Friday until 14:00, closed on Shabbat)" };
    if (ev.location === "store" && last.location !== "store" && shut(9, 21)) return { ev, problem: "Everything Else is closed now (09:00-21:00, Friday until 14:00, closed on Shabbat)" }; }
  if (!LOCATIONS[ev.location]) return { ev, problem: `"${ev.location}" is not a known location` };
  if ((ev.action === "improv" || ev.action === "lecture") && !allowNoHosts) ev.action = "talking";     // the class layouts come from the plan only
  if (!LOCATIONS[ev.location].includes(ev.action)) {
    const A = { waiting: "idle", sitting: "idle", standing: "idle", relaxing: "idle", resting: "idle", thinking: "idle", cleaning: "idle", tidying: "idle", washing: "idle", shopping: "idle", browsing: "idle", looking: "idle", lounging: "idle", stretching: "idle",
      typing: "working", coding: "working", designing: "working", emailing: "working", texting: "phoning", calling: "phoning", chatting: "talking", speaking: "talking", greeting: "talking",
      napping: "sleeping", playing: "gaming", microwaving: "cooking", baking: "cooking", dining: "eating", snacking: "eating", sipping: "drinking", jogging: "exercising", running: "exercising", working_out: "exercising",
      strolling: "walking", leaving: "walking", arriving: "walking", entering: "walking", heading: "walking", tv: "watching", watching_tv: "watching", radio: "listening" };
    const a2 = A[ev.action.replace(/\s+/g, "_")];
    if (a2) ev.action = LOCATIONS[ev.location].includes(a2) ? a2 : (ev.with && LOCATIONS[ev.location].includes("talking") ? "talking" : LOCATIONS[ev.location].includes("idle") ? "idle" : ev.action);
  }
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
  if (ev.delivery && ev.location !== "apartment") ev.delivery = false;   // the courier comes to his door
  if (!ev.delivery && ev.location === "apartment" && /\bate ?bite\b/i.test(ev.text) && /\b(courier|rings|knock|at the door|arrives|delivered|hands (him|over))\b/i.test(ev.text)) ev.delivery = true;
  const vNow = Date.now() + DELAY_MIN * 60000;
  // an overdue scene must end with a real goodbye in this moment
  const saidBye = (last.lines || []).some(l => FAREWELL.test(l.say));
  const inClass = !!(goal && goal.course);   // a lecture runs to its end: nobody says good night halfway
  if (ev.with && !inClass && s.scene && s.scene.w === ev.with && !saidBye && sceneOverdue(s.scene, vNow, s.stuck) && !ev.lines.some(l => FAREWELL.test(l.say))) {
    const nmW = s.cast[ev.with]?.name || ev.with;
    if (!allowNoHosts) return { ev, problem: `this moment ends the scene: finish the conversation with their goodbye (e.g. "Good night", "See you"), ${nmW} leaves` };
    ev.lines = [...ev.lines.slice(0, 10), { who: ev.with, say: "Okay, it's late. I should go. Good night, Ishai." }, { who: "ishai", say: "Good night. Thanks for coming." }];
  }
  // whoever left tonight does not walk back in (unless the director wants them)
  if (ev.with && s.gone && s.gone.w === ev.with && vNow < s.gone.until && !(goal && goal.with && String(goal.with).toLowerCase().includes(String(s.cast[ev.with]?.name || ev.with).toLowerCase()))) {
    ev.with = null; ev.lines = ev.lines.filter(l => l.who === "ishai").slice(0, 1);
  }
  if (ev.with && !inClass && s.scene && s.scene.leaving && s.scene.w === ev.with && (last.lines || []).some(l => FAREWELL.test(l.say))) {
    ev.with = null; ev.lines = ev.lines.filter(l => l.who === "ishai").slice(0, 1); if (ev.action === "talking") ev.action = "idle";
  }
  // "heads to the bathroom" must actually take him there, or the story loops on it forever
  if (!BATH_ACTIONS.includes(ev.action) && ev.location === "apartment" && /\b(goes|go|heads?|walks?|gets up to go|disappears|steps)\b[^.]{0,30}\b(bathroom|toilet|loo)\b/i.test(ev.text) && !/\b(back|returns?|comes out|out of)\b/i.test(ev.text)) {
    ev.action = /shower/i.test(ev.text) ? "showering" : "bathroom"; ev.with = null;
  }
  // the story must move: a moment that retells one of the last few is sent back
  if (!inClass && !(ev.action === "sleeping" && last.action === "sleeping")) { const prevTexts = s.events.slice(-4).map(e => e.text);
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
    const said = inClass ? [] : (s.talk || []).filter(m => !m.host).slice(-24).map(m => m.say);
    const reused = ev.lines.filter(l => said.some(p => same(p, l.say)));
    if (reused.length >= 2 && !allowNoHosts) return { ev, problem: `the dialogue repeats lines already said ("${reused[0].say.slice(0, 60)}"). Write NEW lines that move the conversation on, or let it end` };
    ev.lines = ev.lines.filter(l => !said.some(p => same(p, l.say)));
    if (ev.with && reused.length >= 2) ev.stuck = true; }
  if (ev.with && ev.with !== last.with && !(BATH_ACTIONS.includes(last.action) && s.scene && s.scene.w === ev.with) && !(ev.scene && ev.scene.why) && ev.action !== "sleeping" && !allowNoHosts)
    return { ev, problem: `a conversation with ${s.cast[ev.with]?.name || ev.with} starts here, so fill "scene" (type, why, ishaiWants, theyWant, beats, ending, lines) and write its first lines` };
  if (ev.with && ev.lines.length < 4 && !allowNoHosts)
    return { ev, problem: `he is ${ev.action === "phoning" ? "on the phone" : "together"} with ${s.cast[ev.with]?.name || ev.with}, so "lines" must contain their actual conversation: 8 to 14 lines alternating between "ishai" and "${ev.with}"` };
  { const prev = recentHostLines(s, 12);
    const rep = ev.commentary.find(c => isRepeat(c.say, prev));
    if (rep) ev.commentary = ev.commentary.filter(c => !isRepeat(c.say, prev)); } // a stale joke is just cut; not worth a whole retry
  if ((ev.with || ev.lines.length >= 2) && !ev.commentary.length && !allowNoHosts && !HOSTS_APART)
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
  const legal = ev.action === "improv" && loc === "bar" ? ["improv"] : ev.action === "lecture" && loc === "classroom" ? ["lecture"] : allowed(loc, s.unlocked);
  const act = legal.includes(ev.action) ? ev.action : (legal.includes("idle") ? "idle" : legal[0]);
  const ok = ev.with && (s.cast[ev.with] || ev.newCard?.id === ev.with) && act !== "sleeping";
  return { ...ev, location: loc, action: act, with: ok ? ev.with : null,
    lines: ok ? ev.lines : ev.lines.filter(l => l.who === "ishai" || STUDENT.test(l.who)), update: ok ? ev.update : null, newCard: ok ? ev.newCard : null };
}

// moments written without the AI (sick day, backups): the hosts tell viewers what is happening, plus a fresh joke now and then
const RELAY_OPEN = ["Live update:", "For those just tuning in:", "Right now:", "Status report:", "Quick update:", "What you're seeing:", "Meanwhile:", "Breaking, kind of:"];
const SICK_JOKES = ["Our boy is not okay. Somebody bring that man soup.", "Sick day on live TV. Respect the blanket.", "Nobody judge the pajamas. He is recovering.",
  "Even Moshe the basil looks worried.", "Rest up, Ishai. The whole country is whispering.", "This is the most relaxing episode we have ever aired.",
  "If he naps any harder he'll need a sponsor. FluffNap, call us.", "Tea count today: I lost track at four.", "Somewhere Mrs. Levi is already preparing soup. I can feel it.",
  "He has the energy of a phone at two percent.", "Medical update: still horizontal.", "Honestly? Goals.", "The blanket is winning this round.", "Plot twist: there is no plot today. Just tea."];
function relayHosts(s, text, n, jokes) {
  const who = n % 2 ? "oren" : "zohar", other = who === "zohar" ? "oren" : "zohar";
  const t = String(text).replace(/^(He|Ishai)\b/, "Ishai").replace(/\s+/g, " ").trim();
  const out = [{ who, say: clip(`${RELAY_OPEN[n % RELAY_OPEN.length]} ${t}`, 158) }];
  if (jokes && n % 2 === 0) { const prev = recentHostLines(s, 16); const fresh = jokes.filter(j => !prev.includes(j));
    if (fresh.length) out.push({ who: other, say: fresh[(Math.floor(n / 2) * 5) % fresh.length] }); }
  return out;
}
// Something in the narration the picture can't show (a pot Dana brings, a wet coat) that nobody says out loud: a host names it. No AI.
const UNSEEN_CUE = /\b(holding|holds|carrying|carries|clutching|with|brings|brought|bringing|hands(?: (?:him|ishai|over))?|handing|gives(?: (?:him|ishai))?|gave(?: (?:him|ishai))?|wearing|drenched|soaked|dripping)\s+(?:(?:him|ishai|over)\s+)?((?:a|an|some|two|three|his|her|their|the)\s+[^.;!?]{3,110})/i;
const UNSEEN_STOP = new Set("with that this from into onto over under about after before their there them they then than have just very some what when where which while your little small big large really and the his her for him are was one two old new hot".split(" "));
function unseenHosts(s, ev, n) {
  if (!ev.text || !(ev.lines || []).length || ev.action === "sleeping" || ev.location === "offscreen" || (ev.commentary || []).length >= 3) return null;   // no talking: quietHosts() already reads it out
  const said = [...(ev.lines || []), ...(ev.commentary || [])].map(l => String(l.say || "")).join(" ").toLowerCase();
  const whoIn = sent => ev.with && s.cast[ev.with] && sent.toLowerCase().includes(s.cast[ev.with].name.toLowerCase().replace(/^mrs?\. /, "")) ? s.cast[ev.with].name : (/^(he|ishai)\b/i.test(sent) ? "Ishai" : null);
  const wet = String(ev.text).split(/(?<=[.!?])\s+/).find(x => /\b(soaked|drenched|dripping wet)\b/i.test(x));
  if (wet && !/\b(soak|drench|wet|rain|umbrella|dripping)/.test(said)) { const w = whoIn(wet); if (w) return { who: n % 2 ? "zohar" : "oren", say: `${w}'s ${wet.match(/\b(soaked|drenched|dripping wet)\b/i)[1].toLowerCase()}, if you can't tell from here.` }; }
  const sent = String(ev.text).split(/(?<=[.!?])\s+/).find(x => UNSEEN_CUE.test(x)); if (!sent) return null;
  const m = sent.match(UNSEEN_CUE), verb = m[1].toLowerCase();
  let obj = m[2].replace(/\s*,\s*(?:and\s+)?(?:who|which|as|while|then|before|after|smiling|looking|saying|asking|grinning)\b.*$/i, "").replace(/[,\s]+$/, "");
  if (/^(?:the|his|her|their)\s+(?:door|hallway|phone|dog|leash|hand|hands|head|eyes|face|friend|shoulder)\b/i.test(obj) && !/\band\b/i.test(obj)) return null;   // ordinary, or something the picture shows
  const words = obj.toLowerCase().match(/[a-z]{3,}/g)?.filter(w => !UNSEEN_STOP.has(w)) || []; if (!words.length) return null;
  if (words.some(w => w.length < 5 ? new RegExp(`\\b${w}`).test(said) : said.includes(w.slice(0, 5)))) return null;          // somebody already said it
  const who = whoIn(sent);
  if (!who) return null;
  obj = obj.replace(/^(?:his|her|their)\s+/i, who === "Ishai" ? "his " : "their ");
  if (obj.length > 95) { obj = obj.slice(0, 95); obj = obj.slice(0, obj.lastIndexOf(" ")); }
  const say = /^(brings|brought|bringing|hands|handing|gives|gave)/.test(verb) ? `${who} brought ${obj}. Look closely.`
    : /^(wearing|drenched|soaked|dripping)/.test(verb) ? `${who}'s ${verb === "wearing" ? "wearing" : verb} ${obj}, in case your screen is small.`
    : `${who}'s got ${obj}, in case you missed it.`;
  return { who: n % 2 ? "zohar" : "oren", say: say.replace(/\s+/g, " ") };
}
// a moment nobody speaks in (travel, waiting, listening, working alone): viewers can't read the narration, so the hosts say what is going on. No AI.
const QUIET_QUIPS = ["Riveting television, ladies and gentlemen.", "I've seen less walking in a marathon.", "Nobody say anything. It's going so well.", "Our sound guy thinks his headphones broke.",
  "Every great story has a middle part. This is it.", "My aunt pays for this channel. For this.", "Look at him go. Somewhere, a director is crying.", "Nothing is happening, and I can't look away.",
  "This is the part they cut from the documentary.", "I'm told this is what people do when no one's watching.", "He has no idea how much we care about this.", "Stay with us. It might get slightly more interesting."];
const OFF_LINES = ["We've lost him. Static on every camera.", "Out of coverage. He could be anywhere, doing anything, most likely queueing.", "No signal. Our best people are looking at a grey screen.",
  "He's off the grid. Moshe is unsupervised.", "Enjoy the static. It's the most colourful thing he's worn all week.", "Wherever he is, it has no camera, and that upsets me."];
function quietHosts(s, ev, n) {
  if (ev.action === "sleeping" || BATH_ACTIONS.includes(ev.action) || (ev.lines || []).length || (ev.commentary || []).length) return [];
  if (ev.location === "offscreen") return [{ who: n % 2 ? "oren" : "zohar", say: OFF_LINES[n % OFF_LINES.length] }];
  return relayHosts(s, ev.text, n, n % 4 === 0 ? QUIET_QUIPS : null);
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
async function runBackup(env, messages, maxTokens = 1000) {
  const url = env.BACKUP_AI_URL || "https://api.groq.com/openai/v1/chat/completions";
  const auth = { authorization: "Bearer " + env.BACKUP_AI_KEY };
  const body = model => {
    const b = { model, messages, max_tokens: Math.max(900, maxTokens), temperature: 0.9 };
    if (/llama|gemma/i.test(model)) b.response_format = { type: "json_object" };              // JSON mode: no broken or wrapped JSON
    if (/gpt-oss/i.test(model)) { b.reasoning_effort = "low"; b.max_tokens = Math.max(2000, maxTokens + 1000); }            // reasoning models: think less, leave room for the answer
    if (/qwen3|deepseek|r1/i.test(model)) { b.reasoning_format = "hidden"; b.max_tokens = Math.max(2000, maxTokens + 1000); }
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
  const step = { bus: "street", taxi: "street", offscreen: "street", street: "corridor", shops: "street", market: "street", store: "market", campus: "street", classroom: "campus", park: "street", cafe: "shops", gym: "street", bar: "street", corridor: "apartment" }[last.location];
  let ev;
  if (step) {
    const T = {
      street: ["Ishai looks pale. He heads back along Herzl Street toward home, slower than usual.", "He walks home along Herzl Street, one hand on his stomach."],
      market: ["Ishai looks pale among the market stalls. He gives up on the shopping and takes the bus home.", "He sits on the bus back from the market, eyes closed."],
      campus: ["Ishai looks pale. He leaves the lecture room and goes out to the courtyard.", "He steps out into the courtyard for air, one hand on his stomach."],
      store: ["Ishai puts the basket down and walks out of the store, looking pale.", "He leaves Everything Else empty-handed, one hand on his stomach."],
      shops: ["Ishai leaves the café looking pale and walks slowly back along Herzl Street, past the flower shop.", "He heads home past the shops, one hand on his stomach."],
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
  const home = { bus: "street", taxi: "street", offscreen: "street", street: "corridor", shops: "street", market: "street", store: "market", campus: "street", classroom: "campus", park: "street", cafe: "shops", gym: "street", bar: "street", corridor: "apartment" }[last.location];
  if (night && home) {
    const T = { campus: "He walks out into the dark courtyard.", market: "He walks out of the store into the dark, empty market.", street: "Ishai heads back along Herzl Street toward home.", shops: "He walks back past the dark shop windows toward his building.", corridor: "He walks into his building and climbs the stairs, yawning.", apartment: "He lets himself in, yawning, and gets ready for bed." };
    return { location: home, action: home === "apartment" ? "idle" : "walking", text: T[home], with: null, lines: [] };
  }
  const P = {
    apartment: night ? [["apartment", "sleeping", "Ishai is asleep. Somewhere a cat argues with another cat."], ["apartment", "sleeping", "He turns over and mumbles something about kerning."], ["apartment", "sleeping", "Ishai sleeps on, one arm hanging off the bed."]]
      : [["apartment", "idle", "Ishai stares out the window, thinking about nothing in particular."], ["apartment", "working", "He opens the laptop and pretends to answer emails."], ["apartment", "reading", "He picks up a book, reads two pages, and checks his phone."], ["apartment", "drinking", "He pours a glass of water and waters Moshe the basil too."], ["apartment", "cooking", "He makes a quick omelette and eats it straight from the pan."]],
    corridor: [["corridor", "walking", "Ishai walks down the hallway, keys jingling."], ["apartment", "idle", "He lets himself back into the flat and drops his keys on the desk."], ["street", "walking", "He steps out of the building onto Herzl Street."]],
    street: [["street", "walking", "He walks along Herzl Street, dodging a scooter."], ["street", "idle", "He sits on the bus stop bench for a minute, watching the traffic."], ["street", "eating", "He buys a falafel at Avi's kiosk and eats it standing at the counter."], ["park", "walking", "He wanders into the little park and heads for the bench."], ["corridor", "walking", "He heads back into his building and up the stairs."]],
    campus: [["campus", "idle", "Ishai reads the notices on the university board."], ["campus", "walking", "He crosses the courtyard, past students on the benches."], ["street", "walking", "He takes the bus back to Herzl Street."]],
    classroom: [["campus", "walking", "He walks out of the lecture room into the courtyard."]],
    park: [["park", "idle", "Ishai watches the duck. The duck watches back."], ["park", "walking", "He does a slow lap around the pond."], ["street", "walking", "He leaves the park and walks back to Herzl Street."]],
    market: [["market", "walking", "Ishai weaves between the stalls, comparing tomato prices."], ["market", "drinking", "He buys a fresh orange juice at a stall and drinks it on the spot."],
      ["market", "eating", "He tears into a warm pita the baker hands him."], ["street", "walking", "He takes the bus back to Herzl Street, bags in both hands."]],
    store: [["store", "idle", "Ishai wanders the aisles of Everything Else, picking things up and putting them back."], ["store", "idle", "He stands in front of the wall of TVs, comparing price tags."], ["market", "walking", "He leaves the store and walks back out into the market."]],
    shops: [["shops", "walking", "Ishai walks past the hardware shop, slowing to look at a drill in the window."], ["shops", "idle", "He waits at the crossing for the light to turn green."],
      ["shops", "idle", "He takes cash out at the Tahini Tower ATM and squints at the receipt."], ["street", "walking", "He walks back west along Herzl Street toward his building."]],
    gym: [["gym", "exercising", "Ishai keeps a steady pace on the treadmill, eyes on the Channel 9 screen."], ["gym", "drinking", "He steps off the treadmill and refills his bottle at the water cooler."], ["street", "walking", "He wipes his face with a towel and heads back out to Herzl Street."]],
    bar: [["bar", "drinking", "He nurses his beer at the candle-lit table, nodding along to the guitar riff."], ["bar", "eating", "He picks at a bowl of salted peanuts while the bar's speaker rumbles."], ["street", "walking", "He pays at the bar, nods to the bartender and steps out onto Herzl Street."]],
    cafe: [["cafe", "drinking", "He sips his coffee slowly, making it last."], ["cafe", "reading", "He reads the news on his phone at the corner table."], ["shops", "walking", "He pays, waves to the barista and steps back out onto Herzl Street by the flower shop."]],
    bus: [["street", "walking", "He gets off the bus on Herzl Street."], ["market", "walking", "The bus drops him at Shuk Shalom."]],
    taxi: [["street", "walking", "He pays the driver and gets out on Herzl Street."], ["market", "walking", "The taxi drops him at Shuk Shalom."]],
    offscreen: [["offscreen", "away", "No sign of Ishai on any camera."], ["market", "walking", "Ishai gets off the bus at Shuk Shalom."], ["street", "walking", "Ishai gets off the bus on Herzl Street with a shopping bag."]]
  }[last.location] || [[last.location, "idle", "A quiet moment."]];
  const wet = !!(s && s.world && s.world.weather && s.world.weather.rain);
  if (wet && ["street", "park", "shops"].includes(last.location)) {
    const R = {
      street: [["street", "walking", "Ishai opens his umbrella and hurries along Herzl Street, stepping around the puddles."], ["corridor", "walking", "He ducks back into his building, shaking the rain off his umbrella."],
        ["shops", "walking", "Rain picks up; he hurries east along Herzl Street toward the café, umbrella up."], ["street", "eating", "He buys a falafel at Avi's kiosk and eats it under the kiosk awning, watching the rain."]],
      shops: [["cafe", "idle", "Rain picks up; he hurries into the café and leans his dripping umbrella by the door."], ["street", "walking", "He hurries back west along Herzl Street under his umbrella."],
        ["shops", "idle", "He waits under the flower shop's awning for the worst of the rain to pass."]],
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

// ---------- moments without the AI, blocks and live moments ----------
const NIGHT_TEXTS = ["Ishai sleeps, one arm hanging off the bed.", "He turns over and pulls the blanket up to his ears.", "A scooter buzzes past outside; Ishai doesn't stir.",
  "He mumbles something about kerning in his sleep.", "The fridge hums. Ishai snores, softly.", "Moshe the basil stands guard on the dark windowsill.",
  "He kicks the blanket off, then drags it back without waking.", "A neighbor's door clicks shut down the hall. Ishai sleeps on.", "He sleeps on his stomach, face squashed into the pillow.",
  "Somewhere a cat argues with another cat. Ishai sleeps through it.", "His phone lights up once on the desk. He doesn't notice.", "Ishai smiles in his sleep at something only he can see.",
  "Rain taps on the window; Ishai sleeps through it.", "The street is quiet. Ishai breathes slow and heavy."];
const NIGHT_JOKES = ["Night shift report: still horizontal.", "Ratings are low, but so is he. Goodnight, Ishai.", "Moshe has the night watch. Respect.", "Peak content. Truly.", "Sleep tracker says: eight out of ten.", "If anyone needs us, we're also asleep."];
function nightEvent(s, last, clock) {
  const h = clock.hour;
  if (last.action !== "sleeping" || !(h >= 22 || h < 6)) return null;
  const wet = !!(s.world && s.world.weather && s.world.weather.rain), dog = s.unlocked.includes("dog");
  const pool = NIGHT_TEXTS.filter(t => wet || !/^Rain/.test(t)).concat(dog ? ["Falafel snores in his little bed by the window.", "Falafel twitches, chasing something in a dream."] : []);
  const recent = new Set(s.events.slice(-8).map(e => e.text)), fresh = pool.filter(t => !recent.has(t));
  const text = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
  const n = s.nightN = (s.nightN || 0) + 1, prev = recentHostLines(s, 12), jokes = NIGHT_JOKES.filter(j => !prev.includes(j));
  return { location: "apartment", action: "sleeping", text, with: null, lines: [], src: "night (no AI)",
    commentary: n % 3 === 0 && jokes.length ? [{ who: n % 2 ? "oren" : "zohar", say: jokes[n % jokes.length] }] : [] };
}
const pathStep = (from, to) => { const prev = { [from]: null }, q = [from];
  while (q.length) { const x = q.shift(); if (x === to) break; for (const y of NEXT[x] || []) if (!(y in prev)) { prev[y] = x; q.push(y); } }
  if (!(to in prev)) return null; let x = to; while (prev[x] !== from && prev[x] !== null) x = prev[x]; return x; };
function travelEvent(s, last, hop, dest) {
  const wet = !!(s.world && s.world.weather && s.world.weather.rain), dog = s.unlocked.includes("dog"), umb = wet ? " under his umbrella" : "";
  const T = { "apartment>corridor": `Ishai grabs his keys${dog ? ", clips on Falafel's leash" : ""} and heads out the door.`, "corridor>street": `He goes down the stairs and out onto Herzl Street${umb}.`,
    "street>shops": `He walks east along Herzl Street${umb}, past the hardware shop and the bank.`, "shops>cafe": `He crosses at the lights${umb} and goes into Cafe Nahat.`,
    "shops>street": `He walks back west along Herzl Street${umb} toward his building.`, "street>park": `He walks west along Herzl Street${umb}, past PicSell and the bakery, toward the park.`, "street>corridor": "He heads back into his building and up the stairs.",
    "corridor>apartment": "He unlocks apartment 4 and goes in.", "park>street": `He walks back along Herzl Street${umb}, past the barber and PicSell, toward his building.`, "cafe>shops": `He steps out of the café onto Herzl Street${umb}, by the flower shop.`,
    "street>gym": `He pushes open the glass door of Herzl Gym${dog ? ", Falafel trotting behind" : ""}.`, "gym>street": `He leaves the gym, towel round his neck, and steps out onto Herzl Street${umb}.`,
    "street>bar": "He pushes open the heavy door of The Black Candle; red light and a guitar riff spill out.", "bar>street": `He steps out of The Black Candle onto Herzl Street${umb}.`,
    "street>market": `He takes the bus to Shuk Shalom market${umb}.`, "market>street": "He takes the bus back to Herzl Street, shopping bags on his knees.",
    "market>store": "He walks into Everything Else, the big store next to the market.", "store>market": "He walks out of Everything Else back into the market.",
    "street>offscreen": "He gets on the bus at the stop.", "offscreen>street": "He gets off the bus on Herzl Street.",
    "street>campus": `He takes the bus to the university${umb}.`, "campus>street": "He takes the bus back to Herzl Street, his notebook on his knees.",
    "offscreen>campus": "He gets off the bus at the university.", "bus>campus": "The bus drops him at the university.", "taxi>campus": "The taxi drops him at the university.",
    "campus>classroom": "He walks into the lecture building.", "classroom>campus": "He walks out into the courtyard.",
    "offscreen>market": "He gets off the bus at Shuk Shalom.", "bus>market": "The bus drops him at Shuk Shalom.", "bus>street": "He gets off the bus on Herzl Street.", "taxi>market": "The taxi drops him at Shuk Shalom.", "taxi>street": "He pays the driver and gets out on Herzl Street." };
  const text = T[last.location + ">" + hop] || `Ishai heads toward the ${dest}.`;
  return { location: hop, action: hop === "offscreen" ? "away" : ["apartment", "cafe", "gym", "bar", "store", "bus", "taxi"].includes(hop) ? "idle" : "walking", text, with: null, lines: [], commentary: [], src: "on the way to the planned scene (no AI)" };
}
function scriptEvent(s, last, g, now) {
  const sc = g.script, i = g.step || 0; if (!sc || i >= sc.length) return null;
  const m = sc[i], to = LOCATIONS[m.location] ? m.location : (LOCATIONS[g.where] ? g.where : last.location);
  const busy = ["sleeping", "waking"].includes(last.action) || BATH_ACTIONS.includes(last.action) || (last.with && last.with !== String(m.with || "").toLowerCase());
  if (i === 0 && busy && g.sceneAt && last.with && !BATH_ACTIONS.includes(last.action) && !["sleeping", "waking"].includes(last.action))   // a class has a fixed time: he excuses himself and goes
    return { location: last.location, action: LOCATIONS[last.location].includes("idle") ? "idle" : last.action, text: "Ishai looks at the time and says he has to go.", with: null, lines: [{ who: "ishai", say: "Sorry, I have to run. I've got a class." }], commentary: [], src: "leaving for the planned scene (no AI)" };
  if (i === 0 && busy) return null;                                       // he finishes what he is doing first (the story wraps it up)
  if (to !== last.location && !NEXT[last.location].includes(to)) { const hop = pathStep(last.location, to); return hop ? travelEvent(s, last, hop, to) : null; }
  // a scene with a fixed start (a class): he gets close, then waits for the story clock (no AI)
  if (i === 0 && g.sceneAt && now + DELAY_MIN * 60000 < g.sceneAt) { g.held = (g.held || 0) + 1;
    return { location: last.location, action: LOCATIONS[last.location].includes("idle") ? "idle" : last.action, text: g.held % 2 ? "Ishai checks the time; he has a few minutes yet." : "Ishai looks at his phone and waits a little longer.", with: null, lines: [], commentary: [], src: "on the way to the planned scene, waiting (no AI)" }; }
  const end = i === sc.length - 1;
  const r = validate(JSON.stringify({ ...m, location: to, scene: null, newCharacter: null, missing: null, complete: end ? g.id : null }), s, last, false, g, true);
  g.step = i + 1;
  if (!r.ev) { if (end) { finishGoal(s, g, "script", now); g.scriptDone = true; } return null; }
  const ev = repair(r.ev, s, last);
  if (ev.with && ev.with !== last.with) {
    const total = sc.reduce((n, x) => n + (x.lines || []).length, 0);
    ev.scene = { type: "plot", why: g.goal.slice(0, 200), ishaiWants: "what the daily plan says", theyWant: "what the daily plan says", beats: "as planned, then it winds down naturally", ending: "a natural goodbye", target: total + 4 };
  }
  ev.src = `daily plan (scene ${i + 1}/${sc.length})`;
  if (end) { finishGoal(s, g, "script", now); g.scriptDone = true; ev.complete = g.id; ev.unlocks = g.unlock || null; }
  return ev;
}
function dropQueue(s, why) {
  if (s.queue && s.usage) s.usage.wasted = (s.usage.wasted || 0) + s.queue.items.length;
  s.queueDrop = why; s.queue = null;
}
function queuedEvent(s, last, goal, now) {
  const q = s.queue; if (!q || !q.items.length) { s.queue = null; return null; }
  const w = s.world && s.world.weather, fix = s.fixNote && now < s.fixNote.until ? s.fixNote.text : null;
  const why = q.afterId !== last.id ? "something else happened" : (goal ? goal.id : null) !== q.goal ? "a planned beat began"
    : !!(w && w.rain) !== q.rain ? "the weather changed" : fix !== q.fix ? "a director note" : s.stuck ? "the story was stuck" : now - q.at > 45 * 60000 ? "too old" : "";
  if (why) { dropQueue(s, why); return null; }
  const m = q.items[0];
  if (["listening", "watching"].includes(String(m.action || "").toLowerCase())) { dropQueue(s, "radio/TV: written live"); s.plannedLive = String(m.text || "").slice(0, 200); return null; }  // radio / TV: live
  const r = validate(JSON.stringify(m), s, last, canAddPerson(s, now), goal, false);
  const minor = p => /"lines" must contain|fill "scene"|hosts are missing/.test(p || "");
  if (r.ev && r.problem && minor(r.problem)) { r.ev = repair(r.ev, s, last); r.problem = null; }
  if (!r.ev || r.problem) { countDrop(s, r.problem); dropQueue(s, r.problem || "dropped"); return null; }
  q.items.shift();
  const ev = r.ev; ev.fromBlock = true; ev.src = `${q.writer} (block ${q.n - q.items.length}/${q.n}, written ahead)`;
  return ev;
}
async function askBlock(env, s, clock, now, goal) {
  const last = s.events[s.events.length - 1];
  // don't write past the start of the next planned beat (those moments would be thrown away)
  const nextG = s.director.filter(d => d.status === "waiting" && d.startAfter > now).sort((a, b) => a.startAfter - b.startAfter)[0];
  const n = clamp(nextG ? Math.floor((nextG.startAfter - now) / (INTERVAL_MIN * 60000)) + 1 : BLOCK_N, 1, BLOCK_N);
  if (n === 1) return askAI(env, s, clock, now, goal);
  const raw = await runModel(env, buildMessages(s, clock, now, goal, { block: n }), 800 + n * 650);
  const o = parseAI(raw), parsed = Array.isArray(o) ? o : Array.isArray(o?.moments) ? o.moments : o?.location ? [o] : null;
  let arr = (parsed || []).filter(x => x && typeof x === "object").slice(0, n);
  const allowNew = canAddPerson(s, now), written = arr.length;
  // a moment that breaks a rule costs only itself: the next one takes over, as validate checks it against where he is now
  let r = { problem: "the block was not valid JSON" }, skip = 0;
  for (let i = 0; i < arr.length; i++) {
    r = validate(JSON.stringify(arr[i]), s, last, allowNew, goal, false);
    if (r.ev && r.problem && /"lines" must contain|fill "scene"|hosts are missing/.test(r.problem)) { r.ev = repair(r.ev, s, last); r.problem = null; }
    if (r.ev && !r.problem) { skip = i; break; }
    countDrop(s, r.problem);
    s.queueDrop = "block: moment " + (i + 1) + "/" + arr.length + " skipped: " + (r.problem || "unusable");
  }
  s.diag = [...(s.diag || []), { at: now, model: lastWriter, attempt: "block", problem: r.problem || null, moments: arr.length, skipped: skip, chars: raw.length }].slice(-16);
  if (!r.ev || r.problem) { if (!written) countDrop(s, r.problem); if (s.usage) s.usage.wasted = (s.usage.wasted || 0) + written; s.queueDrop = "block: " + (r.problem || "unusable"); s.queue = null; return askAI(env, s, clock, now, goal); }   // one moment the usual way
  if (skip) { arr = arr.slice(skip); if (s.usage) { s.usage.blockSaved = (s.usage.blockSaved || 0) + 1; s.usage.wasted = (s.usage.wasted || 0) + skip; } }
  const w = s.world && s.world.weather;
  s.queue = { items: arr.slice(1), n: arr.length, at: now, goal: goal ? goal.id : null, rain: !!(w && w.rain), fix: s.fixNote && now < s.fixNote.until ? s.fixNote.text : null, writer: lastWriter, afterId: null };
  r.ev.fromBlock = true; r.ev.src = `${lastWriter} (block 1/${arr.length}, written ahead)`;
  if (HOSTS_APART) await addHosts(env, s, [r.ev, ...s.queue.items], clock, now);
  return r.ev;
}
// what is on the radio / TV right now: real headlines, real weather, the real station's music; otherwise the AI makes it up
const DJ_NAME = h => h >= 6 && h < 12 ? "Benny Boom" : h >= 12 && h < 19 ? "Shira Gold" : "Night Owl Yoni";
const pageHash = n => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
function onAirFor(s, kind, storyMs, hour) {
  const w = s.world || {}, aired = s.aired || [], heads = (w.headlines || []).filter(h => !aired.includes(h.title)), r = Math.random(), radio = kind === "radio";
  const pickHead = () => heads[Math.floor(Math.random() * Math.min(5, heads.length))];
  if (!radio && Math.random() < .3) { const shows = ["8bitTV, Channel 8: tonight's hero has jumped over the same block for the ninth time.", "8bitTV, Channel 8: the weather, in sixteen colours. Tomorrow: blue.", "NESflicks: Still there?", "NESflicks: because you watched four seconds of this, here are forty more like it.", "RGBeat, Channel 6: next up, the same song, but in blue.", "RGBeat, Channel 6: non-stop music clips. Red, green, blue, repeat."];
    return { kind: "show", who: "tv", say: shows[Math.floor(Math.random() * shows.length)] }; }
  if (heads.length && r < .5) { const h = pickHead(); return { kind: "news", who: kind, title: h.title,
    say: radio ? `${DJ_NAME(hour)} on Radio Herzl, the news: ${h.title}.` : `Channel 9 News: ${h.title}.` }; }
  if (w.weather && r < .68) return { kind: "weather", who: kind, say: radio
    ? `${DJ_NAME(hour)} here. ${w.weather.temp} degrees and ${w.weather.desc} in Tel Aviv.${w.weather.rain ? " Umbrellas out, people." : ""}`
    : `Channel 9 weather: ${w.weather.temp} degrees and ${w.weather.desc} in Tel Aviv${w.weather.wind > 30 ? ", strong wind" : ""}.` };
  const st = w.stations || [];
  if (radio && st.length && r < .82) { const x = st[Math.floor(pageHash(Math.floor(storyMs / 1200000) * 3 + 7) * st.length)];
    return { kind: "music", who: "radio", say: `${DJ_NAME(hour)}: more ${x.tag} on Radio Herzl 88.2. Stay with us.` }; }
  return { kind: radio ? "a made-up radio bit" : hour === 21 ? "A Butcher Is Born" : "a made-up TV show", who: kind };   // the AI writes what is on
}
function quietMedia(s, last) {
  const gymTv = last.location === "gym" && last.action === "exercising";
  if (!(last.location === "apartment" || gymTv) || last.with || !(["listening", "watching"].includes(last.action) || gymTv) || !/live: (radio|tv)/.test(last.src || "")) return null;
  if (typeof s.lastRain === "boolean" && !!(s.world && s.world.weather && s.world.weather.rain) !== s.lastRain) return null;   // the weather changed: live
  const R = ["Ishai listens to Radio Herzl, drumming his fingers on the desk.", "He hums along to the radio, badly.", "The radio plays on; Ishai stretches out in the armchair and listens.",
    "He turns the radio up a notch and leans back.", "Ishai half-listens to the radio, scrolling his phone."];
  const T = ["Ishai watches Channel 9 from the armchair, remote in hand.", "He stays on the couch, eyes on the TV.", "Ishai flicks through the channels and settles back on Channel 9.",
    "He watches, chin in hand, the TV glow on his face."];
  const G = ["Ishai keeps a steady pace on the treadmill, eyes on the TV.", "He bumps the treadmill speed up a notch and keeps watching Channel 9.", "Ishai wipes his forehead and keeps walking, half-watching the screen."];
  const pool = (gymTv ? G : last.action === "listening" ? R : T).filter(t => !s.events.slice(-6).some(e => e.text === t));
  return { location: last.location, action: last.action, text: pool[Math.floor(Math.random() * pool.length)] || "He keeps listening.", with: null, lines: [], commentary: [], src: "on air, he just listens (no AI)" };
}
function liveCue(s, last, clock, storyMs) {
  if (last.action === "sleeping" || BATH_ACTIONS.includes(last.action) || last.location === "offscreen") { s.plannedLive = null; return null; }
  const planned = s.plannedLive; s.plannedLive = null;
  const gymTv = last.location === "gym" && last.action === "exercising";
  const media = gymTv ? "watching" : last.location === "apartment" && ["listening", "watching"].includes(last.action) ? last.action
    : planned ? (/\b(tv|television|channel|watch)/i.test(planned) ? "watching" : /radio/i.test(planned) ? "listening" : null) : null;
  const rain = !!(s.world && s.world.weather && s.world.weather.rain);
  const flip = typeof s.lastRain === "boolean" && rain !== s.lastRain ? (rain ? "it has just started to rain" : "the rain has just stopped") : null;
  if (!media && !flip) return null;
  const kind = media === "watching" ? "tv" : "radio";
  return { why: [media ? kind : null, flip ? "weather" : null].filter(Boolean).join(" + "), planned, flip,
    onAir: media && (gymTv || s.unlocked.includes(kind)) ? onAirFor(s, kind, storyMs, clock.hour) : null };
}
function liveText(cue, s, last) {
  const w = last.with ? (s.cast[last.with]?.name || last.with) : null, out = [];
  if (cue.flip) out.push(`LIVE: ${cue.flip}. Ishai notices it right now and reacts spontaneously (a line or two${w ? " with " + w : " to himself"}); plans may change.`);
  if (cue.planned) out.push(`PLANNED NEXT: ${cue.planned}`);
  const a = cue.onAir; if (!a) return out.join("\n");
  const src = a.who === "tv" ? (last.location === "gym" ? "the gym TV above the treadmill" : "the TV") : "the radio", react = w ? `he and ${w} react to it in their conversation`
    : `a short spontaneous monologue in "lines" (1-3 lines by "ishai": he mutters to himself${s.unlocked.includes("dog") ? ", to Falafel" : ""} or to Moshe the basil)`;
  out.push(a.say
    ? `ON AIR RIGHT NOW (viewers hear this from ${src} first): "${a.say}"\nTHIS MOMENT IS LIVE: Ishai reacts to exactly this, in character: ${react}. He may agree, argue with ${src}, joke, get an idea, look something up, or switch it off. Serious news: brief and respectful. The hosts may react too. Do not repeat the on-air line itself.`
    : `THIS MOMENT IS LIVE: in "onAir" write ONE line (max 25 words) that comes out of ${src} right now: ${a.kind}${a.kind === "A Butcher Is Born" ? " (the 21:00 reality show)" : ""}, fictional brands only. Ishai reacts to exactly that line: ${react}.`);
  return out.join("\n");
}
function attachAir(ev, cue, s) {
  const a = cue && cue.onAir; if (!a || !(ev.location === "apartment" || ev.location === "gym")) return;
  const say = a.say || ev.onAir; if (!say) return;
  if (!["listening", "watching"].includes(ev.action) && !(ev.location === "gym" && ev.action === "exercising") && !/\b(radio|tv|television|news|channel)\b/i.test(ev.text)) return;
  ev.lines = [{ who: a.who, say: say.slice(0, 220) }, ...(ev.lines || [])];
  if (a.title) s.aired = [...(s.aired || []), a.title].slice(-30);
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
  const raw = await runModel(env, messages, 900, "hosts");
  const o = parseAI(raw); if (!o) return null;
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
  if (s.world?.stationsAt && now - s.world.stationsAt < 24 * 3600000 && (s.world.stations || []).length && (s.world.barStations || []).length) return;
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
  // backups for the bar (rock / alternative / light metal) and the café (pop / soft rock); the page tries its fixed stations first
  for (const [key, tags] of [["barStations", ["alternative rock", "hard rock", "classic rock"]], ["cafeStations", ["soft rock", "pop"]]]) {
    const list = [];
    for (const tag of tags) {
      try { const t = await getText(`https://de1.api.radio-browser.info/json/stations/search?tag=${encodeURIComponent(tag)}&tagExact=true&order=votes&reverse=true&limit=8&hidebroken=true&is_https=true`);
        for (const x of JSON.parse(t)) { const url = String(x.url_resolved || x.url || "");
          if (!url.startsWith("https://") || x.hls || !x.lastcheckok || list.some(y => y.url === url) || /news|talk|sport|relig|christ|gospel|politic|comedy|kids|podcast/i.test((x.tags || "") + " " + (x.name || ""))) continue;
          if (!/^(MP3|AAC|AAC\+|OGG)$/i.test(x.codec || "")) continue;
          list.push({ name: String(x.name || "").trim().slice(0, 60), url, tag }); } } catch (e) {}
    }
    if (list.length) s.world[key] = list.slice(0, 12);
  }
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
  const w = { at: now, errors: [], stations: s.world?.stations || [], stationsAt: s.world?.stationsAt || 0, barStations: s.world?.barStations || [], cafeStations: s.world?.cafeStations || [], weather: s.world?.weather || null, shabbat: s.world?.shabbat || null, holidays: s.world?.holidays || [], headlines: s.world?.headlines || [] };
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

// ---------- key-moment alerts (web push) ----------
// A push carries no data: the device's background script asks /api/alert what to show. The story is written 5 minutes
// ahead, so the alert goes out as the moment is written. Alerts are few on purpose.
const ALERTS_A_DAY = 4, ALERT_GAP_MIN = 90, PUSH_BATCH = 30;
function pushAllowed(ep) { try { const u = new URL(ep); return u.protocol === "https:" && /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/.test(u.hostname); } catch { return false; } }
async function pushKey(ep) { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ep)); return "push:" + [...new Uint8Array(h)].slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join(""); }
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function vapidHeader(env, origin) {
  const key = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]), te = new TextEncoder();
  const part = o => b64u(te.encode(JSON.stringify(o))), head = part({ typ: "JWT", alg: "ES256" }) + "." + part({ aud: origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "https://ishai.udiabunil.workers.dev/" });
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(head));
  return `vapid t=${head}.${b64u(sig)}, k=${VAPID_PUBLIC}`;
}
// what makes a moment key; a short teaser that gives nothing away
function alertText(s, ev, last) {
  const c = ev.with && s.cast[ev.with], fresh = ev.with && ev.with !== last.with;
  if (ev.unlocks) return "Something new is about to come into Ishai's life.";
  if (ev.newCard) return "Someone new is about to walk into Ishai's life.";
  if (fresh && c && !c.regular && !c.phoneOnly && (c.scenes || 0) <= 1) return `${c.name} is about to appear for the first time.`;
  if (fresh && c && ev.scene && ev.scene.type === "plot") return ev.action === "phoning" ? `${c.name} is about to call. It matters.` : `${c.name} and Ishai are about to talk. It matters.`;
  return null;
}
function maybeAlert(s, ev, last, hour, now) {
  const text = alertText(s, ev, last); if (!text) return;
  const day = new Date(now + 7200000).toISOString().slice(0, 10), log = s.alertLog && s.alertLog.day === day ? s.alertLog : { day, n: 0, at: 0 };
  if (log.n >= ALERTS_A_DAY || now - log.at < ALERT_GAP_MIN * 60000) return;
  s.alertLog = { day, n: log.n + 1, at: now }; s.alert = { title: "Watching Ishai", body: text + " In 5 minutes.", at: now, hour, n: log.n + 1 }; s.alertSend = { cursor: null, sent: 0 };
}
// each device has its own hours (Israel time; "from" later than "to" runs past midnight) and its own limit: it gets the day's first "max" alerts
function deviceWants(d, a) {
  if (a.test) return true;
  if (a.n > d.max) return false;
  if (d.from === d.to) return true;
  return d.from < d.to ? a.hour >= d.from && a.hour < d.to : a.hour >= d.from || a.hour < d.to;
}
// a batch at each run: the free plan allows only so many requests at a time
async function sendAlerts(env, s) {
  const job = s.alertSend; if (!job || !env.VAPID_JWK) return 0;
  if (Date.now() - s.alert.at > 20 * 60000) { s.alertSend = null; return 0; }
  const page = await env.ISHAI.list({ prefix: "push:", limit: PUSH_BATCH, cursor: job.cursor || undefined }), auth = {};
  const rs = await Promise.allSettled(page.keys.map(async k => {
    const raw = await env.ISHAI.get(k.name); if (!raw) return 0;
    const dev = JSON.parse(raw), ep = dev.ep; if (!deviceWants(dev, s.alert)) return 0;
    const origin = new URL(ep).origin; auth[origin] = auth[origin] || await vapidHeader(env, origin);
    const r = await fetch(ep, { method: "POST", headers: { authorization: auth[origin], ttl: "300", urgency: "high", "content-length": "0" } });
    if (r.status === 404 || r.status === 410) await env.ISHAI.delete(k.name);     // that device has gone
    return r.ok ? 1 : 0;
  }));
  const n = rs.reduce((a, r) => a + (r.status === "fulfilled" ? r.value : 0), 0);
  job.sent += n; if (page.list_complete) s.alertSend = null; else job.cursor = page.cursor;
  return n;
}

// ---------- Strange But True: the history course (story/course.json holds the topics and the first lecture) ----------
// Sunday, Tuesday and Wednesday at 11:00. Each lecture is written once by the AI, a day ahead, from the Wikipedia article(s), and then plays as a planned beat.
const STUDENT = /^student[1-8]$/;
const LECTURE_DAYS = [0, 2, 3], LECTURE_H = 11, PREP_MS = 30 * 3600000, LECTURE_MOMENTS = 7, MAX_SOURCE = 30000;
const SHORT_WORDS = 1400, LONG_WORDS = 7000;   // under: two topics share a lecture; over: it is split in two
const tzOffset = ms => { const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(new Date(ms)),
  n = t => +p.find(x => x.type === t).value; return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute")) - Math.floor(ms / 60000) * 60000; };
function nextLectureAt(s, now) {
  for (let k = 0; k < 14; k++) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(now + k * 86400000)), [y, m, d] = day.split("-").map(Number);
    if (!LECTURE_DAYS.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay()) || (s.world?.holidays || []).some(h => h.date === day)) continue;
    const u = Date.UTC(y, m - 1, d, LECTURE_H), t = u - tzOffset(u);
    if (t - 50 * 60000 > now) return t;
  }
  return now + 2 * 86400000;
}
const topicId = t => "t-" + String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
const allTopics = () => Object.entries(COURSE.strands).flatMap(([strand, list]) => list.map(wiki => ({ id: topicId(wiki), title: wiki.replace(/ \(.*\)$/, ""), wiki: [wiki], strand })));
function firstLecture() { return { id: "t-first", title: COURSE.first.title, wiki: COURSE.first.wiki, strand: "Disasters", note: COURSE.first.note, script: COURSE.first.moments }; }
function courseOf(s) {
  if (!s.course) s.course = { queue: [firstLecture(), { id: topicId(COURSE.second.wiki[0]), ...COURSE.second }], used: [], memory: [], at: null, goalId: null, err: null, tries: 0, retryAt: 0, triviaAt: 0, strandAt: 0 };
  const c = s.course; while (c.queue.length < 2) { const t = pickTopic(c); if (!t) break; c.queue.push(t); }
  return c;
}
// the strands take turns, so a run of disasters never happens
function pickTopic(c, sameStrand) {
  const names = Object.keys(COURSE.strands), taken = new Set([...c.used, ...c.queue.map(q => q.id)]);
  let pool = allTopics().filter(t => !taken.has(t.id)); if (!pool.length) { c.used = []; pool = allTopics().filter(t => !c.queue.some(q => q.id === t.id)); }
  for (let i = 0; i < names.length; i++) {
    const strand = sameStrand || names[(c.strandAt + i) % names.length], l = pool.filter(t => t.strand === strand);
    if (l.length) { if (!sameStrand) c.strandAt = (names.indexOf(strand) + 1) % names.length; return l[Math.floor(Math.random() * l.length)]; }
    if (sameStrand) sameStrand = null;
  }
  return pool[0] || null;
}
async function wikiText(title) {
  const u = "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=" + encodeURIComponent(title);
  const r = await fetch(u, { headers: { "user-agent": "WatchingIshai/1.0 (story website)" } });
  if (!r.ok) throw new Error(`Wikipedia ${r.status} for ${title}`);
  const page = Object.values((await r.json())?.query?.pages || {})[0], t = String(page?.extract || "");
  if (t.length < 400) throw new Error(`no article for "${title}"`);
  const end = t.search(/\n==+ *(See also|References|Notes|Footnotes|External links|Further reading|Bibliography|Sources|Citations) *==+/);
  return end > 0 ? t.slice(0, end) : t;
}
const wordsOf = t => (String(t).match(/\S+/g) || []).length;
const LECTURE_SYS = `You write one lecture of "Strange But True", a university history course in the TV story of Ishai, an ordinary man in Tel Aviv who attends it. Reply with ONLY JSON:
{"note":"one surprising fact from the lecture that a person would repeat to a friend, one plain sentence, at most 140 characters","moments":[{"text":"one sentence saying what happens in this part","lines":[{"who":"dr","say":"..."}],"commentary":[{"who":"zohar","say":"..."}]}]}
RULES
- Exactly ${LECTURE_MOMENTS} moments, a break falls after the 3rd. Each moment has 11 to 13 lines. Each "say" is at most 130 characters. About 1500 spoken words in all.
- "who" is "dr" (Dr. Sasson, the lecturer: dry, exact, ends a point with a quiet joke), "student" (someone in the class, no name) or "ishai" (a shy man, a little behind, honest).
- About three lines in four are Dr. Sasson's. In each moment 1 or 2 lines are students' comments or questions, and Ishai speaks at most once. Vary who interrupts; Dr. Sasson never calls a student by name.
- Moment 1 starts with Dr. Sasson naming today's title and one question the lecture will answer. Moment ${LECTURE_MOMENTS} answers it and ends with one question for the class. Do NOT announce the next lecture; that is added later.
- Use ONLY facts from the SOURCE. Keep real names, dates and numbers, use metric units, say so when sources disagree, and mark a popular legend as a legend.
- Stop joking when people died; speak of deaths with respect, and never joke about a victim, a child or a tragedy.
- "commentary": the TV hosts zohar or oren, at most one short line, in at most 3 of the moments, about Ishai or the class, never about deaths. Empty list otherwise.
- Plain speech only: no markdown, no stage directions, nothing about cameras or being filmed.`;
const BREAKS = [
  [["ishai", "Excuse me, did this machine just take my coin? It took my coin."], ["sasson", "It does that. I've been in a dispute with it since March."]],
  [["ishai", "Is there anywhere to get a coffee here?"], ["sasson", "There is a machine. I wouldn't call what it makes a coffee."]],
  [["ishai", "Are you allowed to eat in the lecture room?"], ["sasson", "No. Everyone does. I teach history, not law."]],
  [["ishai", "Is it always this full?"], ["sasson", "No. Word gets around when somebody dies in an interesting way."]],
  [["ishai", "Do you ever run out of these stories?"], ["sasson", "Not yet. People keep doing things."]]
];
// the moments as they will air: the lecture, the break in the courtyard, the announcement of the next one, and out to the bus stop
function lectureMoments(cur, next) {
  if (!cur || !cur.script) return null;
  const parts = cur.script.map(m => ({ location: "classroom", action: "lecture", with: "sasson", text: m.text, lines: (m.lines || []).map(l => ({ ...l })), commentary: m.commentary || [] }));
  const k = Math.min(parts.length, cur.id === "t-first" ? 4 : 3);   // the first lecture's two halves are its two floods
  const seed = [...cur.id].reduce((a, c) => a + c.charCodeAt(0), 0), b = BREAKS[seed % BREAKS.length];
  const brk = { location: "campus", action: "talking", with: "sasson", text: "The class takes a short break; Ishai goes out to the courtyard and Dr. Sasson stands by the vending machine.", lines: b.map(([who, say]) => ({ who, say })), commentary: [] };
  const lastM = parts[parts.length - 1], nextT = next ? next.title : "to be announced";
  if (cur.id !== "t-first") parts[k - 1].lines = [...parts[k - 1].lines.slice(0, 13), { who: "sasson", say: "That's enough for now. Take a short break." }];
  lastM.lines = [...lastM.lines.slice(0, 13), { who: "sasson", say: `Next lecture is on the board: ${nextT}. Good afternoon, everyone.`.slice(0, 200) }];
  return [...parts.slice(0, k), brk, ...parts.slice(k), { location: "campus", action: "walking", with: null, text: "The lecture is over. Ishai walks out into the courtyard with his notebook.", lines: [], commentary: [] }];
}
function cleanLecture(o) {
  const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const seat = i => "student" + (1 + (i * 5 + 2) % 8); let n = 0;
  const who = w => { const k = str(w, 12).toLowerCase(); return k === "ishai" ? "ishai" : k === "student" || STUDENT.test(k) ? seat(n++) : /^(dr|sasson|dr\.? sasson)$/.test(k) ? "sasson" : null; };
  const moments = (Array.isArray(o?.moments) ? o.moments : []).filter(m => m && typeof m === "object").slice(0, LECTURE_MOMENTS).map(m => ({
    text: str(m.text, 240).length > 8 ? str(m.text, 240) : "Dr. Sasson goes on with the lecture.",
    lines: (Array.isArray(m.lines) ? m.lines : []).map(l => ({ who: who(l?.who), say: str(l?.say, 200) })).filter(l => l.who && l.say).slice(0, 14),
    commentary: (Array.isArray(m.commentary) ? m.commentary : []).map(c => ({ who: str(c?.who, 8).toLowerCase(), say: str(c?.say, 160) })).filter(c => HOSTS[c.who] && c.say).slice(0, 1) })).filter(m => m.lines.length >= 4);
  return moments.length >= 4 ? { note: str(o.note, 160), moments } : null;
}
async function generateLecture(env, s, cur) {
  const c = courseOf(s); let source = (await Promise.all(cur.wiki.map(wikiText))).join("\n\n");
  if (cur.part) source = source.slice(Math.floor(source.length * (cur.part - 1) / cur.of));
  else if (wordsOf(source) > LONG_WORDS) {          // too much for one lecture: two parts, and the second one comes next
    const base = cur.title; cur.of = 2; cur.part = 1; cur.title = base + ", Part 1";
    c.queue.splice(1, 0, { id: cur.id + "-2", title: base + ", Part 2", wiki: cur.wiki, strand: cur.strand, part: 2, of: 2 });
    source = source.slice(0, Math.floor(source.length / 2));
  } else if (wordsOf(source) < SHORT_WORDS) {                        // too little: two topics of the same kind share the lecture
    const t = pickTopic(c, cur.strand);
    if (t) try { const more = await wikiText(t.wiki[0]);
      if (wordsOf(more) < LONG_WORDS) { source += "\n\n" + more; cur.wiki = [...cur.wiki, t.wiki[0]]; cur.title = `${cur.title} and ${t.title}`; c.used = [...c.used, t.id]; } } catch (e) {}
  }
  source = source.slice(0, MAX_SOURCE);
  const raw = await runModel(env, [{ role: "system", content: LECTURE_SYS }, { role: "user", content: `Today's title: ${cur.title}${cur.part ? ` (part ${cur.part} of ${cur.of})` : ""}\n\nSOURCE (Wikipedia):\n${source}` }], 6500);
  const l = cleanLecture(parseAI(raw)); if (!l) throw new Error("the AI's lecture could not be used");
  cur.script = l.moments; cur.note = l.note || null; cur.words = l.moments.reduce((n, m) => n + m.lines.reduce((k, x) => k + wordsOf(x.say), 0), 0); cur.at = Date.now();
}
function unscheduleLecture(s) {
  const c = courseOf(s), g = s.director.find(d => d.id === c.goalId && d.status === "waiting");
  if (g) { g.status = "done"; g.how = "rescheduled"; g.doneAt = Date.now(); delete g.script; c.goalId = null; }
}
function scheduleLecture(s, now) {
  const c = courseOf(s), cur = c.queue[0], t = c.at, moments = lectureMoments(cur, c.queue[1]); if (!moments) return;
  const id = "lecture-" + t.toString(36);
  const g = newGoal({ id, goal: `Ishai goes to his history lecture: ${cur.title}.`, startAt: new Date(t - 32 * 60000).toISOString(), sceneAt: new Date(t - 2 * 60000).toISOString(), deadlineAt: new Date(t + 15 * 60000).toISOString(), location: "classroom", with: "Dr. Sasson", forceWith: "sasson" }, now);
  g.id = id; g.course = true; g.script = cleanScript(moments, 9); s.director = s.director.filter(d => d.id !== id || d.status !== "done"); s.director.push(g); c.goalId = id;
}
function courseFinished(s, now) {
  const c = courseOf(s), cur = c.queue.shift();
  c.used = [...c.used, cur.id].slice(-90);
  if (cur.note) c.memory = [...(c.memory || []), { title: cur.title, note: cur.note, at: now, offered: 0 }].slice(-10);   // he remembers one thing from each of the last 10 topics
  c.goalId = null; c.at = null; c.err = null; c.tries = 0; courseOf(s);
}
async function courseTick(env, s, now) {
  const c = courseOf(s), g = c.goalId ? s.director.find(d => d.id === c.goalId) : null;
  if (g && g.status === "done") {
    if (g.how === "script" || g.how === "story") courseFinished(s, now);
    else { c.goalId = null; c.at = null; }                      // missed or moved: the same lecture takes the next slot
  }
  if (!c.at || (!c.goalId && c.at - 50 * 60000 <= now)) c.at = nextLectureAt(s, now);
  const cur = c.queue[0];
  if (!cur.script && c.at - now < PREP_MS && now >= (c.retryAt || 0) && now >= (s.aiOutUntil || 0)) {
    try { await generateLecture(env, s, cur); c.err = null; c.tries = 0; }
    catch (e) { c.tries = (c.tries || 0) + 1; c.retryAt = now + 3600000; c.err = { at: now, msg: String(e && e.message || e).slice(0, 200) };
      if (/no article/.test(c.err.msg) && !cur.part) { c.used = [...c.used, cur.id]; c.queue.shift(); courseOf(s); } }   // a topic Wikipedia doesn't have: the next one takes its place
  }
  if (c.queue[0].script && !c.goalId) scheduleLecture(s, now);
}
async function courseAction(env, s, b, now) {
  const c = courseOf(s), slot = b.slot === 1 ? 1 : 0, live = s.director.find(d => d.id === c.goalId && d.status === "active" && d.step > 0);
  if (slot === 0 && live) return "that lecture has already started";
  if (b.action === "courseSet" || b.action === "courseNew") {
    let t;
    if (b.action === "courseNew") t = pickTopic(c);
    else { const title = String(b.title || "").replace(/\s+/g, " ").trim().slice(0, 90); if (title.length < 3) return "write a topic first";
      try { await wikiText(title); } catch (e) { return `Wikipedia has no article called "${title}" (use its exact title)`; }
      t = { id: topicId(title) + "-" + now.toString(36), title: title.replace(/ \(.*\)$/, ""), wiki: [title], strand: "Director's choice" }; }
    if (!t) return "no topics left";
    unscheduleLecture(s); if (c.queue[slot] && c.queue[slot].part === 1) c.queue.splice(slot + 1, 1); c.queue[slot] = t; c.retryAt = 0; c.tries = 0; c.err = null; courseOf(s);
  } else if (b.action === "courseGen") {
    const cur = c.queue[slot]; delete cur.script; delete cur.note; unscheduleLecture(s); c.err = null;
    try { await generateLecture(env, s, cur); } catch (e) { c.err = { at: now, msg: String(e && e.message || e).slice(0, 200) }; return "the lecture could not be written: " + c.err.msg; }
  } else return "unknown course action";
  if (!c.at) c.at = nextLectureAt(s, now);
  if (c.queue[0].script && !c.goalId) scheduleLecture(s, now);
  return null;
}
const coursePublic = s => { const c = s.course; return c && c.queue[0] ? { name: COURSE.name, title: c.queue[0].title, next: c.queue[1]?.title || null, at: c.at || null } : { name: COURSE.name, title: COURSE.first.title, next: COURSE.second.title, at: null }; };
const courseHealth = s => { const c = s.course; return c ? { at: c.at, title: c.queue[0]?.title, ready: !!c.queue[0]?.script, next: c.queue[1]?.title || null, memory: (c.memory || []).length, err: c.err || null } : null; };
const courseDirector = s => { const c = courseOf(s); return { name: COURSE.name, at: c.at, err: c.err || null, goal: c.goalId, topics: allTopics().map(t => t.wiki[0]),
  queue: c.queue.slice(0, 2).map(q => ({ title: q.title, strand: q.strand, wiki: q.wiki, note: q.note || null, words: q.words || null, ready: !!q.script, moments: q.script ? lectureMoments(q, c.queue[c.queue.indexOf(q) + 1]) : null })),
  memory: (c.memory || []).map(m => ({ title: m.title, note: m.note })) }; };
// what Ishai knows: the next lecture, and now and then one thing he learned. At most one offer a day, only with company, each fact at most twice.
function courseNote(s, now, company) {
  const c = s.course; if (!c || !c.queue[0]) return "";
  const when = c.at ? new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(c.at)) : "";
  let out = `\nIshai studies history part time (Strange But True, Tel Herzl University).${when ? ` Next lecture: ${when}, "${c.queue[0].title}".` : ""} He rarely talks about it.`;
  const fresh = (c.memory || []).filter(m => (m.offered || 0) < 2);
  if (company && fresh.length && now - (c.triviaAt || 0) > 20 * 3600000 && Math.random() < .2) {
    const m = fresh[Math.floor(Math.random() * fresh.length)]; m.offered = (m.offered || 0) + 1; c.triviaAt = now;
    out += ` If, and only if, it fits this conversation naturally, he may share this once, in his own words, as something from class: "${m.note}". Otherwise ignore it.`;
  }
  return out;
}


// ---------- viewers' polls (D1 database "ishai-polls", binding DB) ----------
// Once an hour a question about the people around Ishai: it opens at hh:20 (Israel time) for 60 seconds, anyone can vote once.
// The winner becomes a secret goal that starts at least an hour later, in a free gap, so it never touches the next hour.
const POLL_AT_MIN = 20, POLL_SEC = 60, POLL_SHOW_MIN = 10;       // opens at hh:20, 60 s of voting, the result stays on screen 10 minutes
const POLL_FROM_H = 8, POLL_TO_H = 20;                             // the first poll opens at 08:20, the last at 20:20
const POLL_DELAY_MIN = 60, POLL_LEN_MIN = 90, POLL_LOOK_H = 6;     // the result starts an hour or more after the vote, in a free 90-minute gap within 6 hours
const POLL_AWAKE = [8, 22];                                        // results only play out between 08:00 and 22:00
const POLL_IP_MAX = 5;                                             // votes per internet connection per poll (a family on one Wi-Fi)
const POLL_KINDS = {
  serve: "serves or makes Ishai something at their own place (a dish, a drink, a coffee); Ishai has to go there",
  meet: "runs into Ishai at one of their usual places and does or says something; Ishai has to go there",
  visit: "comes to Ishai's door (corridor) and brings or says something",
  message: "texts, emails or phones Ishai",
  none: "nothing happens: the plain 'no' option (at most one per poll)" };
const POLL_NOT = ["ishai", "sasson", "yael"];                      // Ishai never acts; the lecturer and the improv teacher keep their fixed days
const POLL_BANNED = /\b(die[sd]?|death|dead|dying|kill|hospital|sick|ill|injur\w*|accident|police|arrest\w*|fired|fires|sack(ed)?|divorce|break(s)? up|breakup|kiss\w*|marr\w*|date|dating|pregnan\w*|drunk|fight\w*|punch\w*|steal\w*|stole|rob\w*|moves? away|quits?|vote[sd]?|voting|viewers?|camera|filmed|broadcast|new (tv|radio|dog|cat|pet|car|phone))\b/i;
// stock polls, used when the AI is out or its poll does not pass the checks: [label, who, kind, where, goal, forceText]
const POLL_BANK = [
  { id: "avi-spice", q: "How will Avi make Ishai's next falafel?", o: [
    ["Extremely spicy", "avi", "serve", "street", "Ishai gets hungry and goes down to Avi's falafel kiosk. Avi secretly makes his falafel extremely spicy, 'for his own good'. Ishai suffers bravely, sweats and begs for water while Avi grins.", "Avi hands Ishai a falafel so spicy his eyes water; Avi just grins and pours him water."],
    ["Drowning in tahini", "avi", "serve", "street", "Ishai gets hungry and goes down to Avi's falafel kiosk. Avi, in a generous mood, drowns his falafel in extra tahini and won't take no for an answer. It drips everywhere.", "Avi hands Ishai a falafel dripping with extra tahini; it gets all over his sleeve."],
    ["Just the usual", "avi", "none", null, "", ""]] },
  { id: "levi-door", q: "What will Mrs. Levi bring to Ishai's door?", o: [
    ["A pot of soup", "levi", "visit", "corridor", "Mrs. Levi knocks on Ishai's door with a pot of her soup, insisting he looks thin. She lingers to ask nosy questions.", "Mrs. Levi knocks with a pot of soup: 'You look thin, motek. Eat.'"],
    ["Homemade cookies", "levi", "visit", "corridor", "Mrs. Levi knocks on Ishai's door with a plate of homemade cookies and a story about her late husband.", "Mrs. Levi leaves a plate of homemade cookies at Ishai's door and knocks twice."],
    ["A complaint about noise", "levi", "visit", "corridor", "Mrs. Levi knocks on Ishai's door to complain, very politely and at length, about a noise she is sure came from his flat.", "Mrs. Levi knocks to complain about a noise she is sure came from his flat."]] },
  { id: "gadi-msg", q: "What will Gadi send Ishai next?", o: [
    ["A small bonus for the chickpea", "gadi", "message", null, "Gadi texts Ishai that the client loved the chickpea work and there is a small one-time bonus for him. Ishai doesn't know how to react and reads it three times.", "Gadi texts: the client loved the chickpea, small bonus coming."],
    ["Another round of notes", "gadi", "message", null, "Gadi emails Ishai yet another round of client notes on the logo, all contradicting the last round. Ishai groans and reads them out loud.", "Gadi emails yet another round of contradicting client notes."],
    ["Nothing today", "gadi", "none", null, "", ""]] },
  { id: "dana-cup", q: "What will Dana draw on Ishai's next coffee?", o: [
    ["A basil leaf", "dana", "serve", "cafe", "Ishai goes to Cafe Nahat for a coffee. Dana draws a basil leaf in the foam again, without a word. He notices.", "Dana slides Ishai a coffee with a basil leaf drawn in the foam."],
    ["A little dog", "dana", "serve", "cafe", "Ishai goes to Cafe Nahat for a coffee. Dana draws a tiny dog in the foam, clearly Falafel. Ishai laughs.", "Dana slides Ishai a coffee with a tiny dog drawn in the foam."],
    ["A question mark", "dana", "serve", "cafe", "Ishai goes to Cafe Nahat for a coffee. Dana draws a question mark in the foam and says nothing. Ishai spends the whole coffee wondering what it means.", "Dana slides Ishai a coffee with a question mark in the foam."]] },
  { id: "noa-text", q: "What will Noa text Ishai?", o: [
    ["A meme about Moshe the basil", "noa", "message", null, "Noa texts Ishai a silly meme about Moshe the basil. He laughs out loud and shows it to whoever is around.", "Noa texts a silly meme about Moshe the basil."],
    ["\"RAISE. YOUR. PRICES.\"", "noa", "message", null, "Noa texts Ishai in capital letters to raise his prices, with too many emojis. He mutters that she is right.", "Noa texts: RAISE. YOUR. PRICES."],
    ["Nothing, she's busy", "noa", "none", null, "", ""]] },
  { id: "zelig-park", q: "What will Mr. Zelig tell Ishai in the park?", o: [
    ["A prophecy from the pigeons", "zelig", "meet", "park", "Ishai goes for a walk in the park. Mr. Zelig stops him to share a very serious prophecy he got from the pigeons. Ishai doesn't know what to say.", "Mr. Zelig stops Ishai in the park with a prophecy from the pigeons."],
    ["Surprisingly good work advice", "zelig", "meet", "park", "Ishai goes for a walk in the park. Mr. Zelig, talking half to the pigeons, says something that turns out to be surprisingly good advice about Ishai's work.", "Mr. Zelig mutters some surprisingly good advice at Ishai in the park."],
    ["Nothing, just a nod", "zelig", "none", null, "", ""]] },
  { id: "kobi-bar", q: "What will Kobi insist on at The Black Candle?", o: [
    ["Buying Ishai a drink", "kobi", "meet", "bar", "Ishai drops into The Black Candle for a drink. Kobi insists on buying him one and won't hear a word against it.", "Kobi buys Ishai a drink at The Black Candle and won't hear a word against it."],
    ["Explaining his lottery system", "kobi", "meet", "bar", "Ishai drops into The Black Candle for a drink. Kobi corners him to explain his lottery system in great detail.", "Kobi corners Ishai at the bar to explain his lottery system."],
    ["Nothing, he's busy with the game on TV", "kobi", "none", null, "", ""]] },
  { id: "tomer-help", q: "What will Tomer do for Ishai?", o: [
    ["Fix the flickering lamp", "tomer", "visit", "corridor", "Tomer the electrician drops by Ishai's place, unannounced, to fix the lamp that has been flickering. He fixes it in two minutes and teases Ishai for an hour.", "Tomer drops by and fixes Ishai's flickering lamp in two minutes."],
    ["Drag him to the gym", "tomer", "message", null, "Tomer phones Ishai and pushes him to come to Herzl Gym later. Ishai makes excuses and loses.", "Tomer phones and talks Ishai into the gym."],
    ["Nothing, he's on a job", "tomer", "none", null, "", ""]] }
];
const pollHash = str => { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const weekday = ms => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date(ms));
const pollHM = ms => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
// is this place open at that time (the same hours validate() enforces)
function placeOpen(loc, ms) {
  const h = storyClock(ms).hour, wd = weekday(ms), shut = (o, c) => wd === "Sat" || h < o || h >= (wd === "Fri" ? 14 : c);
  if (!LOCATIONS[loc] || ["classroom", "bus", "taxi", "offscreen"].includes(loc)) return false;
  return loc === "bar" ? !(h >= 2 && h < 17) : loc === "gym" ? !(h >= 23 || h < 6) : loc === "market" ? !shut(7, 19) : loc === "store" ? !shut(9, 21) : loc === "campus" ? !(shut(8, 20) || wd === "Fri") : true;
}
const pollShabbat = (s, ms) => { const sh = s.world && s.world.shabbat; return !!sh && ms >= sh.start - 30 * 60000 && ms <= (sh.end || sh.start + 26 * 3600000); };
const pollAwake = ms => { const h = storyClock(ms).hour; return h >= POLL_AWAKE[0] && h < POLL_AWAKE[1]; };
// nothing else is planned or running then (planned beats, lectures, other poll results)
function pollFree(s, from, to) {
  return !(s.director || []).some(g => g.status !== "done" && g.status !== "needs-art" && !(g.startAfter >= to) &&
    Math.min(deadlineOf(g), (g.status === "active" ? g.activatedAt || g.startAfter : g.startAfter) + 2 * 3600000) > from);
}
// the first moment, an hour or more after the vote, when this option can really happen; null when it can't
function pollStart(s, o, closesAt) {
  if (o.kind === "none") return closesAt + POLL_DELAY_MIN * 60000;
  const len = POLL_LEN_MIN * 60000;
  for (let t = closesAt + POLL_DELAY_MIN * 60000; t <= closesAt + POLL_LOOK_H * 3600000; t += 15 * 60000) {
    if (!pollAwake(t) || !pollAwake(t + len - 60000) || pollShabbat(s, t) || pollShabbat(s, t + len)) continue;
    if (o.where && !(placeOpen(o.where, t) && placeOpen(o.where, t + 60 * 60000))) continue;
    if (pollFree(s, t, t + len)) return t;
  }
  return null;
}
// one option, checked against the rules; returns the clean option or a reason
function pollOption(s, raw, closesAt) {
  const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const o = { label: str(raw.label, 70), who: str(raw.who, 20).toLowerCase(), kind: str(raw.kind, 10).toLowerCase(), where: raw.where ? str(raw.where, 20).toLowerCase() : null, goal: str(raw.goal, 400), forceText: str(raw.forceText, 220) };
  const c = s.cast[o.who];
  if (o.label.length < 3) return "no label";
  if (!POLL_KINDS[o.kind]) return `unknown kind "${o.kind}"`;
  if (POLL_BANNED.test(o.label + " " + o.goal + " " + o.forceText)) return "a word that is not allowed";
  if (/^ishai\b/i.test(o.label)) return "Ishai cannot be the one who acts";
  if (o.kind === "none") return { ...o, where: null, goal: "", forceText: "" };
  if (!c || POLL_NOT.includes(o.who) || /^student/.test(o.who)) return `"${o.who}" cannot act in a poll`;
  if (c.phoneOnly && o.kind !== "message") return `${c.name} is never seen in person: messages only`;
  if (o.kind === "message") o.where = null;
  else if (o.kind === "visit") { if (!["corridor", "apartment"].includes(o.where)) o.where = "corridor"; }
  else if (!(c.hangouts || []).includes(o.where)) return `${c.name} is not usually at "${o.where}"`;
  if (o.goal.length < 20 || !o.goal.toLowerCase().includes(c.name.toLowerCase().replace(/^(mr|mrs|dr)\. /, ""))) return "the goal must say what " + c.name + " does";
  if (!o.forceText) o.forceText = o.goal.split(/(?<=\.)\s/)[0].slice(0, 220);
  if (pollStart(s, o, closesAt) == null) return `no free time for it in the next ${POLL_LOOK_H} hours`;
  return o;
}
function pollCheck(s, raw, closesAt) {
  const q = String(raw && raw.question || "").replace(/\s+/g, " ").trim().slice(0, 120), why = [];
  if (q.length < 8 || POLL_BANNED.test(q)) return { why: ["bad question"] };
  const opts = [];
  for (const r of (Array.isArray(raw.options) ? raw.options : []).slice(0, 4)) {
    const o = pollOption(s, r || {}, closesAt);
    if (typeof o === "string") { why.push(o); continue; }
    if (opts.some(x => x.label.toLowerCase() === o.label.toLowerCase()) || (o.kind === "none" && opts.some(x => x.kind === "none"))) continue;
    opts.push(o);
  }
  if (opts.length < 2 || !opts.some(o => o.kind !== "none")) return { why: why.length ? why : ["needs two real options"] };
  return { poll: { question: q, options: opts }, why: why.length ? why.map(w => "dropped an option: " + w) : null };   // an option that can't happen is left out
}
async function writePoll(env, s, opensAt, closesAt) {
  const from = pollHM(closesAt + POLL_DELAY_MIN * 60000), to = pollHM(closesAt + POLL_LOOK_H * 3600000);
  const cast = Object.values(s.cast).filter(c => !POLL_NOT.includes(c.id))
    .map(c => `- ${c.id}: ${c.name}, ${c.role}. ${c.phoneOnly ? "Never seen in person: kind \"message\" only." : "Usually at: " + (c.hangouts || []).join(", ") + "."} Memory of Ishai: ${String(c.memory || "none").slice(0, 160)}`).join("\n");
  const recent = (s.pollLog || []).slice(-8).map(p => `- ${p.question} -> ${p.winner || "no votes"}`).join("\n") || "- none yet";
  const messages = [{ role: "system", content:
`You write ONE viewers' poll for "Watching Ishai", a Truman-Show-like reality show about Ishai, a freelance designer in Tel Aviv.
Viewers vote on something small that SOMEONE ELSE does to or for Ishai. It plays out between ${from} and ${to} today.
Rules:
- Every option is something one person from the cast does. Ishai NEVER decides or acts in an option; he only reacts. Nobody in the story knows about the poll.
- Small, everyday, realistic, kind or funny: a dish made a certain way, a message, a visit, a gift of food, a remark. Nothing sad, dangerous, romantic or life-changing, no new objects, pets or people, nothing that ends a story arc, no real brands.
- 2-4 options, each a short label (max 6 words). Options of one poll are about the same person or the same situation. At most one option of kind "none" (the "no" / "nothing happens" option).
- kinds: ${Object.entries(POLL_KINDS).map(([k, v]) => `"${k}" = ${v}`).join("; ")}.
- "where": for serve and meet, one of that person's usual places; for visit "corridor"; for message and none null.
- "goal": the secret direction for the story writers, 1-2 sentences, naming the person: what happens and how Ishai reacts. "forceText": one sentence of the same thing, for when it must happen quickly.
- The question names the person and is under 12 words, in English, ending with "?".
Reply with ONLY JSON: {"question":"...","options":[{"label":"...","who":"cast id","kind":"...","where":"..."|null,"goal":"...","forceText":"..."}]}` },
  { role: "user", content: `CAST:\n${cast}\n\nSTORY SO FAR: ${String(s.daySum ? s.daySum.text : "").slice(0, 600) || "(quiet day)"}\nARCS (do not resolve them): ${(PLAN.arcs || []).map(a => typeof a === "string" ? a : a.name || a.title || "").filter(Boolean).join("; ").slice(0, 500) || "-"}\n\nRECENT POLLS (ask something different):\n${recent}\n\nJSON only.` }];
  const o = parseAI(await runModel(env, messages, 700, "story"));
  return o ? pollCheck(s, o, closesAt) : { why: ["the AI reply could not be read"] };
}
function bankPoll(s, key, closesAt) {
  const used = (s.pollLog || []).slice(-6).map(p => p.bank).filter(Boolean);
  const ok = POLL_BANK.map(b => ({ b, r: pollCheck(s, { question: b.q, options: b.o.map(([label, who, kind, where, goal, forceText]) => ({ label, who, kind, where, goal, forceText })) }, closesAt) }))
    .filter(x => x.r.poll);
  const fresh = ok.filter(x => !used.includes(x.b.id)), pool = fresh.length ? fresh : ok;
  if (!pool.length) return null;
  const x = pool[pollHash(key) % pool.length];
  return { ...x.r.poll, bank: x.b.id };
}
const pollPublic = p => p ? { id: p.id, question: p.question, options: p.options.map(o => o.label), opensAt: p.opensAt, closesAt: p.closesAt, result: p.result || null, by: p.bank ? "stock" : "ai" } : null;
// the result is counted once, after the poll closes, and kept in its own row; everyone reads that row
async function pollResult(env, p) {
  const row = await env.DB.prepare("SELECT counts, total, winner FROM results WHERE poll = ?").bind(p.id).first();
  if (row) return { counts: JSON.parse(row.counts), total: row.total, winner: row.winner };
  const { results } = await env.DB.prepare("SELECT opt, COUNT(*) AS n FROM votes WHERE poll = ? GROUP BY opt").bind(p.id).all();
  const counts = p.options.map((_, i) => Number((results || []).find(r => Number(r.opt) === i)?.n || 0)), total = counts.reduce((a, b) => a + b, 0);
  const top = Math.max(...counts), tied = counts.map((n, i) => n === top ? i : -1).filter(i => i >= 0);
  const r = { counts, total, winner: total ? tied[pollHash(p.id) % tied.length] : null, tie: tied.length > 1 && total > 0 };   // a tie is settled the same way for everyone
  if (Date.now() > p.closesAt + 5000) await env.DB.prepare("INSERT OR IGNORE INTO results (poll, counts, total, winner, at) VALUES (?, ?, ?, ?, ?)").bind(p.id, JSON.stringify(counts), total, r.winner, Date.now()).run();
  return r;
}
// ---------- Google sign-in for voting (on when the GOOGLE_CLIENT_ID variable is set; without it voting is anonymous) ----------
// The page gets a signed token from Google; we check it against Google's public keys, then give the browser our own signed cookie.
// Nothing about the person is stored: the vote is kept under a hash of their Google account number.
const VOTER_DAYS = 180, GOOGLE_ISS = ["accounts.google.com", "https://accounts.google.com"];
let googleKeys = null, googleKeysAt = 0;
const jwtBytes = str => Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(str.length / 4) * 4, "=")), c => c.charCodeAt(0));
async function googleKey(kid) {
  if (!googleKeys || Date.now() - googleKeysAt > 6 * 3600000 || !googleKeys.some(k => k.kid === kid)) {
    const r = await fetch("https://www.googleapis.com/oauth2/v3/certs", { cf: { cacheTtl: 3600 } });
    if (!r.ok) throw new Error("Google keys " + r.status);
    googleKeys = (await r.json()).keys || []; googleKeysAt = Date.now();
  }
  const k = googleKeys.find(k => k.kid === kid);
  return k ? crypto.subtle.importKey("jwk", k, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]) : null;
}
async function googleCheck(token, clientId) {   // returns the token's claims, or a reason
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return "not a Google token";
  let head, body;
  try { head = JSON.parse(new TextDecoder().decode(jwtBytes(parts[0]))); body = JSON.parse(new TextDecoder().decode(jwtBytes(parts[1]))); } catch (e) { return "unreadable token"; }
  if (head.alg !== "RS256") return "wrong token type";
  const key = await googleKey(head.kid);
  if (!key || !await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, jwtBytes(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]))) return "the token's signature is wrong";
  if (!GOOGLE_ISS.includes(body.iss) || body.aud !== clientId) return "the token is for another site";
  if (!(body.exp * 1000 > Date.now()) || !body.sub) return "the token has expired";
  return body;
}
const voterKey = async env => crypto.subtle.importKey("raw", new TextEncoder().encode("ishai-voter:" + (env.ADMIN_KEY || env.TICK_SECRET || "ishai")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const voterSig = async (env, data) => hex(await crypto.subtle.sign("HMAC", await voterKey(env), new TextEncoder().encode(data))).slice(0, 32);
async function voterOf(req, env) {   // the signed-in voter from our cookie, or null
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)ishai_voter=(g-[0-9a-f]{32})\.(\d{10,13})\.([0-9a-f]{32})/);
  if (!m || Number(m[2]) < Date.now()) return null;
  return m[3] === await voterSig(env, m[1] + "." + m[2]) ? m[1] : null;
}
async function googleSignIn(req, env) {
  if (!env.GOOGLE_CLIENT_ID) return json({ error: "sign-in is not set up" }, {}, 503);
  const b = await req.json().catch(() => ({}));
  let c; try { c = await googleCheck(b.credential, env.GOOGLE_CLIENT_ID); } catch (e) { return json({ error: "could not reach Google, try again" }, {}, 503); }
  if (typeof c === "string") return json({ error: c }, {}, 401);
  const id = "g-" + hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ishai-google:" + c.sub))).slice(0, 32), exp = Date.now() + VOTER_DAYS * 86400000;
  const cookie = `ishai_voter=${id}.${exp}.${await voterSig(env, id + "." + exp)}; Path=/; Max-Age=${VOTER_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
  const director = directorEmail(env, c) && !!(env.ADMIN_KEY || env.TICK_SECRET);   // a director's account also gets the director cookie
  const r = json({ ok: true, name: String(c.given_name || c.name || "").slice(0, 30), director }, { "set-cookie": cookie, "cache-control": "no-store" });
  if (director) r.headers.append("set-cookie", `ishai_dev=${await devToken(env.ADMIN_KEY || env.TICK_SECRET)}; Path=/; Max-Age=${VOTER_DAYS * 86400}; HttpOnly; Secure; SameSite=Strict`);
  return r;
}
const PRIVACY_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy · Watching Ishai</title>
<style>body{background:#050805;color:#b8f5b8;font:18px/1.5 ui-monospace,monospace;max-width:640px;margin:0 auto;padding:24px 16px}h1{color:#6f6;font-size:24px}a{color:#ffb84d}</style></head><body>
<h1>Privacy</h1>
<p>Watching Ishai is a fictional, AI-written show. You can watch it without an account.</p>
<p><b>Voting.</b> To vote in the hourly viewers' poll you sign in with Google. From Google we use only your account number, and we store only a scrambled (hashed) version of it next to your vote, so each account votes once. We never store your name, email or picture. Your first name is shown back to you in your own browser only.</p>
<p><b>Cookies.</b> Signing in leaves one cookie, <code>ishai_voter</code>, valid for ${VOTER_DAYS} days, which proves you signed in. Signing out removes it. Your browser also keeps a random id and the polls you voted in, on your device only.</p>
<p><b>Votes</b> are counted to show the results and to steer the story. They are never sold or shared.</p>
<p><a href="/">Back to the show</a></p></body></html>`;

async function pollVote(req, env) {
  if (!env.DB) return json({ error: "voting is not set up yet" }, {}, 503);
  const google = !!env.GOOGLE_CLIENT_ID, gVoter = google ? await voterOf(req, env) : null;
  if (google && !gVoter) return json({ error: "please sign in to vote", signIn: true }, {}, 401);
  const b = await req.json().catch(() => ({})), s = await loadState(env), p = s.poll, now = Date.now();
  if (!p || p.id !== b.poll) return json({ error: "this vote is over" }, {}, 409);
  if (now < p.opensAt - 2000) return json({ error: "voting has not opened yet" }, {}, 409);
  if (now > p.closesAt + 3000) return json({ error: "voting has closed" }, {}, 409);
  const opt = Number(b.opt), voter = gVoter || String(b.voter || "");
  if (!Number.isInteger(opt) || opt < 0 || opt >= p.options.length) return json({ error: "no such option" }, {}, 400);
  if (!gVoter && !/^[0-9a-f-]{36}$/i.test(voter)) return json({ error: "bad voter id" }, {}, 400);
  const ip = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(p.id + ":" + (req.headers.get("cf-connecting-ip") || "?")))).slice(0, 24);
  const n = gVoter ? 0 : await env.DB.prepare("SELECT COUNT(*) AS n FROM votes WHERE poll = ? AND ip = ?").bind(p.id, ip).first("n");   // signed-in voters: one per account, no limit per connection
  if (!gVoter && n >= POLL_IP_MAX) return json({ error: "too many votes from this connection" }, {}, 429);
  const r = await env.DB.prepare("INSERT OR IGNORE INTO votes (poll, voter, ip, opt, at) VALUES (?, ?, ?, ?, ?)").bind(p.id, voter.toLowerCase(), ip, opt, now).run();
  return json({ ok: true, counted: r.meta.changes === 1 }, { "cache-control": "no-store" });
}
// in tick(): count a closed poll and hand the winner to the story; write the next poll at the start of each hour
async function pollTick(env, s, ev, now, last) {
  const p = s.poll;
  if (p && !p.done && now > p.closesAt + 5000) {
    p.done = true;
    const r = env.DB ? await pollResult(env, p) : { counts: p.options.map(() => 0), total: 0, winner: null };
    p.result = r;
    const o = r.winner == null ? null : p.options[r.winner], pct = o ? Math.round(100 * r.counts[r.winner] / r.total) : 0;
    let goalId = null, at = null;
    if (o && o.kind !== "none") {
      at = pollStart(s, o, p.closesAt);
      if (at) {
        const c = s.cast[o.who], act = o.kind === "message" ? "phoning" : o.kind === "serve" && LOCATIONS[o.where].includes("eating") ? "eating" : "talking";
        const g = newGoal({ id: "poll-" + p.id.slice(2), goal: o.goal + " Nobody in the story knows about any vote: it simply happens, naturally.", forceText: o.forceText,
          startAt: new Date(at).toISOString(), deadlineAt: new Date(at + POLL_LEN_MIN * 60000).toISOString(), location: o.where || undefined, with: c.name, forceWith: o.who, forceAction: act }, now);
        g.poll = p.id; s.director.push(g); goalId = g.id;
      }
    }
    const say = !r.total ? "Nobody voted this hour, so life goes on exactly as planned. Your loss." : o.kind === "none" ? `The votes are in: ${pct}% said "${o.label}". So, nothing. Democracy!`
      : at ? `The votes are in: ${pct}% chose "${o.label}"${r.tie ? " (a tie, settled by the studio coin)" : ""}. Keep watching, it happens later today.` : `The votes are in: "${o.label}" won, but life got too busy for it today.`;
    ev.commentary = [...(ev.commentary || []), { who: pollHash(p.id) % 2 ? "zohar" : "oren", say }];
    s.pollLog = [...(s.pollLog || []), { id: p.id, question: p.question, bank: p.bank || null, winner: o ? o.label : null, kind: o ? o.kind : null, pct, total: r.total, goal: goalId, at: at }].slice(-20);
  }
  const key = Math.floor(now / 3600000), opensAt = key * 3600000 + POLL_AT_MIN * 60000, closesAt = opensAt + POLL_SEC * 1000, h = storyClock(opensAt).hour;
  if (s.pollKey === key || now > opensAt - 3 * 60000) return;   // one per hour, written before hh:17 so pages see it coming
  s.pollKey = key;
  if (!env.DB || s.pollsOff || h < POLL_FROM_H || h > POLL_TO_H || pollShabbat(s, opensAt) || last.action === "sleeping" || ev.action === "sleeping") return;
  let made = null, why = null;
  if (now >= (s.aiOutUntil || 0)) { try { const r = await writePoll(env, s, opensAt, closesAt); made = r.poll || null; why = r.why || null; } catch (e) { why = [String(e && e.message || e).slice(0, 120)]; } }
  if (!made) made = bankPoll(s, key, closesAt);
  s.pollErr = why ? { at: now, why: why.slice(0, 4) } : null;
  if (made) s.poll = { id: "p-" + new Date(opensAt).toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 13).replace(/\D/g, ""), ...made, opensAt, closesAt };
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
    activatedAt: null, doneAt: null, how: null, createdAt: now, script: cleanScript(d.script || (d.preview && d.preview.moments)),
    sceneAt: d.sceneAt ? Date.parse(d.sceneAt) : null
  };
}
// a planned beat's moments, played as written when the beat starts (the daily planner writes them)
function cleanScript(a, cap = 8) {
  if (!Array.isArray(a)) return null;
  const sc = a.filter(m => m && typeof m === "object" && String(m.text || "").length > 8).slice(0, cap)
    .map(m => ({ location: m.location, action: m.action, with: m.with || null, text: String(m.text).slice(0, 260),
      lines: Array.isArray(m.lines) ? m.lines.slice(0, 14) : [], commentary: Array.isArray(m.commentary) ? m.commentary.slice(0, 2) : [],
      delivery: m.delivery === true || undefined, message: m.message && typeof m.message === "object" ? m.message : undefined,
      update: m.update && typeof m.update === "object" ? m.update : undefined }));   // what the scene changed in that person's memory and mood
  return sc.length ? sc : null;
}
function activeGoal(s, now) {
  let g = s.director.find(d => d.status === "active");
  const lec = s.director.find(d => d.course && d.status === "waiting" && d.startAfter <= now);   // a lecture has a fixed time: a beat that has not begun waits for it
  if (lec && (!g || !(g.step > 0))) { if (g) g.status = "waiting"; lec.status = "active"; lec.activatedAt = now; return lec; }
  if (!g) {
    g = s.director.filter(d => d.status === "waiting" && d.startAfter <= now).sort((a, b) => a.startAfter - b.startAfter)[0];
    if (g) { g.status = "active"; g.activatedAt = now; }
  }
  return g || null;
}
function finishGoal(s, g, how, now) {
  g.status = "done"; g.how = how; g.doneAt = now; delete g.script;
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
    } else if (String(b.action || "").startsWith("course")) {
      const r = await courseAction(env, s, b, now); if (r) return json({ error: r }, {}, 400);
    } else if (b.action === "pollSkip") {   // drop the coming poll (this hour has none)
      if (s.poll && !s.poll.done && now < s.poll.opensAt) s.poll = null;
    } else if (b.action === "pollsOff") {
      s.pollsOff = !!b.off;
    } else if (b.action === "pollBank") {     // replace the coming poll with a stock one
      if (s.poll && !s.poll.done && now < s.poll.opensAt) { const p = bankPoll(s, now, s.poll.closesAt); if (p) s.poll = { id: s.poll.id, ...p, opensAt: s.poll.opensAt, closesAt: s.poll.closesAt }; }
    } else if (b.action === "testAlert") {
      s.alert = { title: "Watching Ishai", body: "This is a test alert from the director.", at: now, test: true }; s.alertSend = { cursor: null, sent: 0 };
      const sent = await sendAlerts(env, s); await saveState(env, s); return json({ ok: true, sent });
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
  return { course: courseDirector(s), bugs: (bugs || []).slice(-30).reverse(), diag: s.diag || [], scene: s.scene ? { ...s.scene, name: s.cast[s.scene.w]?.name || s.scene.w } : null, world: s.world ? { weather: s.world.weather, shabbat: s.world.shabbat, holidays: s.world.holidays, headlines: s.world.headlines, at: s.world.at, errors: s.world.errors, stations: (s.world.stations || []).length } : null,
    wishlist: Object.entries(s.wishlist || {}).sort((a, b) => b[1].count - a[1].count).map(([k, v]) => ({ item: k, count: v.count, example: v.example })),
    done: s.done, unlocked: s.unlocked, goals: s.director.slice().reverse(), lastError: s.lastError || null,
    polls: { now: s.poll || null, off: !!s.pollsOff, err: s.pollErr || null, log: (s.pollLog || []).slice(-8).reverse() },
    last: last && { text: last.text, location: last.location, action: last.action, created: last.created || last.t } };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function json(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*", ...headers } });
}
