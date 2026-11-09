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
const BLOCK_N = 3;            // ordinary moments are written 3 at a time (one AI call per ~18 minutes; fewer thrown away when plans change); radio/TV, weather changes and anything unplanned stay live
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
  { id: "hagit", name: "Hagit", role: "runs the Pump House, the old pump hall by the park she is turning into a small venue; sits in its ticket window most afternoons", regular: "plaza",
    personality: "a former sound engineer, dry and passionate, explains everything with her hands, stubborn about doing things properly", speech: "short, practical, then one sudden sentence about why art matters",
    hangouts: ["plaza"], look: { hair: "bun", hairColor: "red", skin: "fair", shirt: "black", pants: "black", extras: ["glasses", "scarf"] }, memory: "", relationship: 0 },
  { id: "boaz", name: "Boaz", role: "Ishai's downstairs neighbour in apartment 2 (first floor), 47, drives the line 88 bus; hosts poker every second Monday; 'Apt 2' in the building chat",
    personality: "dry, orderly, keeps the bank and counts the chips twice; kind under the deadpan; divorced, his teenagers stay some weekends", speech: "few words and bus lines ('Last stop.', 'Exact change.'), calls Ishai 'Upstairs'",
    hangouts: ["street"], look: { hair: "short", hairColor: "gray", skin: "tan", shirt: "navy", pants: "gray", extras: ["mustache"] }, memory: "Invited Ishai from upstairs to fill the empty seat at poker. Knows him from the stairs and the bus.", relationship: 0 },
  { id: "ronit", name: "Ronit", role: "Boaz's friend since high school, 47, teaches maths at a high school; plays at Boaz's poker nights",
    personality: "sharp, warm, teasing, reads everyone, a teacher who can't stop marking", speech: "uses full names and a classroom voice ('Wrong answer. Sit down.'), says out loud what she notices",
    hangouts: [], look: { hair: "long", hairColor: "black", skin: "brown", shirt: "red", pants: "black", extras: ["glasses", "earring"] }, memory: "Boaz says the new one is quiet. Quiet ones bluff or apologise.", relationship: 0 },
  { id: "moti", name: "Moti", role: "68, retired surveyor in apartment 1, head of the building committee ('Committee' in the building chat); plays at Boaz's poker nights",
    personality: "chatty, generous, a little deaf, runs committee business everywhere", speech: "long sentences that start in 1987 and end at the elevator vote, calls everyone 'neighbour'",
    hangouts: ["street"], look: { hair: "bald", hairColor: "white", skin: "fair", shirt: "white", pants: "brown", extras: ["glasses", "scarf"] }, memory: "Ishai still owes the committee for the stair light. Seems a good boy.", relationship: 0 },
  { id: "yossi", name: "Yossi", role: "31, a mechanic at the bus depot, Boaz's colleague; plays at Boaz's poker nights in his lucky cap",
    personality: "loud, superstitious, fast, big-hearted, terrible with money", speech: "numbers and omens ('I feel it', 'suited means it's meant'), calls Ishai 'professor'",
    hangouts: [], look: { hair: "cap", hairColor: "black", skin: "dark", shirt: "orange", pants: "black", extras: ["beard"] }, memory: "Never met Ishai. Lucky cap is washed and ready.", relationship: 0 },
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
  plaza:     ["walking","idle","talking","eating","drinking","phoning"],
  arena:     ["idle","walking","talking","drinking","phoning","gallery","concert"],
  apt2:      ["idle","talking","eating","drinking","phoning","poker"],
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
  park:      "a small park at the west end of Herzl Street, a few blocks' walk from his building: a bench, a pond with one duck, a big tree. On its far (west) side stands the Pump House",
  plaza:     "the plaza in front of the Pump House, an old red-brick water-pump hall on the far side of the park, now a small venue for concerts and art (walk through the park; no bus): its iron sign, double doors, a ticket window where Hagit sits, a poster board, rope lanes for queues, the park's trees at the edge. The board says it opens soon, with events on Wednesdays",
  apt2:      "Boaz's flat, apartment 2 on the first floor of Ishai's building (down one flight): old patterned floor tiles, a china cabinet, a fish tank, an old TV, a long dining table. Ishai only goes in when he is invited, on poker nights",
  arena:     "inside the Pump House hall: a stage under old pipes, a pixel screen, speaker stacks, a merch table, a concrete floor. Only open for its events; Ishai only goes in on an event night",
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
  corridor:  ["apartment","street","apt2"],
  apt2:      ["corridor","street"],
  street:    ["corridor","park","shops","gym","bar","market","campus","bus","taxi","offscreen","apt2"],
  market:    ["street","store","bus","taxi"],
  campus:    ["street","classroom","bus","taxi"],
  classroom: ["campus"],
  store:     ["market"],
  shops:     ["street","cafe"],
  park:      ["street","plaza"],
  plaza:     ["park","arena"],
  arena:     ["plaza"],
  cafe:      ["shops"],
  gym:       ["street"],
  bar:       ["street"],
  bus:       ["street","market","campus","offscreen"],
  taxi:      ["street","market","campus","offscreen"],
  offscreen: ["street","market","campus","bus","taxi"]
};
// drawing menu for characters (must match the page)
const LOOK = {
  hair: ["short","long","bald","bun","curly","buzz","side","spiky","bob","ponytail","pigtails","braids","dreads","afro","mohawk","cap"],   // "cap" as hair is the old way; use hat now
  hat: ["none","cap","beanie","fedora","bucket","sunhat","kippah","headband","bandana","headscarf"],
  top: ["tshirt","shirt","polo","hoodie","sweater","stripes","jacket","tank","dress"],
  bottom: ["trousers","shorts","skirt"],
  hairColor: ["black","brown","auburn","blonde","gray","white","red"],
  skin: ["light","fair","tan","brown","dark"],
  cloth: ["red","orange","yellow","green","teal","blue","navy","purple","pink","black","white","gray","brown"],
  extras: ["glasses","sunglasses","beard","stubble","mustache","freckles","earring","headphones","necklace","tie","scarf","apron","watch","bag","backpack"]
};   // must match LOOK_OPTS in the page

const allowed = (loc, unlocked) => LOCATIONS[loc].filter(a => a !== "improv" && a !== "lecture" && a !== "gallery" && a !== "concert" && a !== "poker" && (!NEEDS[a] || unlocked.includes(NEEDS[a])));   // "improv" and "lecture" are only for planned classes

const HTML = __HTML__;
const DIRECTOR_HTML = __DIRECTOR_HTML__;
const SANDBOX_HTML = __SANDBOX_HTML__;
const INTRO_HTML = __INTRO_HTML__;   // the trailer: /intro, public; first-time visitors land here once
const BUILDER_HTML = __BUILDER_HTML__;
const EVENTS_HTML = __EVENTS_HTML__;
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
        recent: s.events.slice(-10).map(e => `${storyClock(e.t).label.slice(-5)} ${e.location}/${e.action}${e.with ? " +" + nm(e.with) : ""} (${(e.lines || []).length} lines, ${(e.commentary || []).length} host): ${e.text.slice(0, 110)}${e.then ? ` → then ${e.then.action}` : ""}`),
        lastMomentAgoMin: Math.round((now - (s.events[s.events.length - 1].created || 0)) / 60000),
        retryRate: moments ? +(retried / moments).toFixed(2) : null, problems: d.filter(x => x.problem).slice(-6).map(x => x.problem.slice(0, 120)),
        stuck: s.stuck || 0, scene: s.scene ? { with: nm(s.scene.w), lines: s.scene.lines, target: s.scene.target, leaving: !!s.scene.leaving } : null,
        bugs: JSON.parse(await env.ISHAI.get("bugs") || "[]").filter(x => x.status === "new").slice(-5).map(x => ({ at: x.at, text: x.text.slice(0, 200), screen: x.screen })),
        studio: { lastShowAt: s.show ? s.show.t : null, lastSummaryAt: s.daySum ? s.daySum.at : null, err: s.studioErr || null },
        fixLog: (s.fixLog || []).slice(-3), lastError: s.lastError || null, aiOut: now < (s.aiOutUntil || 0) ? { until: s.aiOutUntil, backup: !!env.BACKUP_AI_KEY, sickMoments: s.sickN || 0 } : null, wishlist: Object.entries(s.wishlist || {}).filter(([, v]) => v.reachedAt).map(([k, v]) => ({ item: k, reachedAt: v.reachedAt })),
        artNeeded: (s.director || []).filter(g => g.status === "needs-art").map(g => ({ id: g.id, art: g.art, createdAt: g.createdAt })),
        homeLife: s.homeLife || null, homeErr: s.homeErr || null,
        usage: s.usage ? { ...s.usage, neuronsEst: neuronsOf(s.usage) } : null, comingUp: comingUpText(s, Date.now(), 8) || null, talk: s.talkBrake ? "short (brake: " + s.talkBrake + ")" : "full (10-16 lines)",
        block: s.queue ? { left: s.queue.items.length, writer: s.queue.writer } : null, course: courseHealth(s), arena: arenaHealth(s), poker: pokerHealth(s), life: (s.life || []).slice(-6),
        writersSetup: env.GEMINI_API_KEY ? { story: "gemini (" + (s.geminiModel || geminiModel || env.GEMINI_MODEL || "not picked yet") + "), backup Cloudflare", hosts: "Cloudflare, backup gemini", geminiPausedUntil: Date.now() < (s.geminiOutUntil || 0) ? s.geminiOutUntil : null, geminiLastError: (s.geminiErrs || []).slice(-1)[0] || null, geminiErrors: s.geminiErrs || [], hostsLastError: s.hostsErr || null, hostsBy: s.hostsBy || null } : { story: "Cloudflare", hosts: "Cloudflare (in the same reply)" }, lastBlockDrop: s.queueDrop || null,
        writers: s.events.slice(-10).map(e => e.src || "?"),
        polls: { db: !!env.DB, google: !!env.GOOGLE_CLIENT_ID, off: !!s.pollsOff, next: s.poll ? { id: s.poll.id, q: s.poll.question, by: s.poll.bank ? "stock" : "ai", done: !!s.poll.done } : null, err: s.pollErr || null, last: (s.pollLog || []).slice(-3), pushes: (s.pollPushes || []).map(j => ({ kind: j.kind, poll: j.poll, at: j.at, sent: j.sent, done: j.done })) },
        surveys: { off: !!s.surveysOff, err: s.surveyErr || null, list: (s.surveys || []).map(x => ({ id: x.id, kind: x.kind, options: x.options.length, closesAt: x.closesAt, result: x.result ? { total: x.result.total, winner: x.result.winner } : null, linked: x.linked, goal: x.goal })), say: (s.surveySay || []).length } }, { "cache-control": "no-store" });
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
    if (url.pathname === "/api/alert") return alertFor(env, url.searchParams.get("ep") || "");
    if (url.pathname === "/api/remind" && req.method === "POST") return pollRemind(req, env);
    if (url.pathname === "/api/surveys") return surveysApi(req, env);
    if (url.pathname === "/api/survey/vote" && req.method === "POST") return surveyVote(req, env);
    if (url.pathname === "/api/survey/suggest" && req.method === "POST") return surveySuggest(req, env);
    if (url.pathname === "/api/push" && (req.method === "POST" || req.method === "DELETE")) {
      const b = await req.json().catch(() => ({})), ep = String(b.endpoint || ""), key = ep.length < 700 && pushAllowed(ep) ? await pushKey(ep) : null;
      if (!key) return json({ error: "not a push address" }, {}, 400);
      const num = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
      const dev = JSON.stringify({ ep, from: num(b.from, 0, 23, 8), to: num(b.to, 0, 24, 23), max: num(b.max, 1, ALERTS_A_DAY, ALERTS_A_DAY), alerts: b.alerts !== false, picks: b.picks !== false });
      if (req.method === "DELETE") await env.ISHAI.delete(key); else if ((await env.ISHAI.get(key)) !== dev) await env.ISHAI.put(key, dev);
      return json({ ok: true }, { "cache-control": "no-store" });
    }
    if (url.pathname === "/events") {   // the director's bands, concerts and promotions
      if (!await isDev(req, env)) return Response.redirect(url.origin + "/director", 302);
      return new Response(EVENTS_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    if (url.pathname === "/api/events") {
      if (!await isDirector(req, env)) return json({ error: "director only" }, {}, 403);
      const s = await loadState(env), now = Date.now();
      if (req.method === "POST") { const b = await req.json().catch(() => ({})), r = await eventsAction(env, s, b, now); if (r.error) return json(r, {}, 400); await saveState(env, s); return json({ ...r, view: eventsView(s, now) }); }
      return json(eventsView(s, now), { "cache-control": "no-store" });
    }
    if (url.pathname === "/api/upload" && req.method === "PUT") {   // a song (mp3) or a picture, from /events
      if (!await isDirector(req, env)) return json({ error: "director only" }, {}, 403);
      const kind = url.searchParams.get("kind") === "song" ? "song" : "image", type = String(req.headers.get("content-type") || "").slice(0, 60);
      if (kind === "song" ? !/^audio\/(mpeg|mp3|ogg|wav|x-wav|mp4|aac|x-m4a)/.test(type) : !/^image\/(png|jpeg|gif|webp)$/.test(type)) return json({ error: `that is not ${kind === "song" ? "an audio" : "an image"} file (${type || "unknown type"})` }, {}, 400);
      const body = await req.arrayBuffer(); if (!body.byteLength || body.byteLength > ASSET_MAX[kind]) return json({ error: `too big: at most ${ASSET_MAX[kind] / 1048576} MB` }, {}, 400);
      const id = (kind === "song" ? "s" : "i") + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      await env.ISHAI.put("asset:" + id, body, { metadata: { type, size: body.byteLength, name: String(url.searchParams.get("name") || "").slice(0, 80) } });
      return json({ id, url: "/asset/" + id, size: body.byteLength });
    }
    if (url.pathname.startsWith("/asset/")) {   // uploaded songs and pictures: never change, cached at the edge (which also answers range requests)
      const cache = caches.default, hit = await cache.match(req); if (hit) return hit;
      const id = cleanId(url.pathname.slice(7)), v = id && await env.ISHAI.getWithMetadata("asset:" + id, { type: "arrayBuffer" });
      if (!v || !v.value) return new Response("not found", { status: 404 });
      const res = new Response(v.value, { headers: { "content-type": v.metadata?.type || "application/octet-stream", "cache-control": "public, max-age=31536000, immutable", "accept-ranges": "bytes", "access-control-allow-origin": "*" } });
      const range = req.headers.get("range"); await cache.put(new Request(url.toString()), res.clone());
      if (range) { const m = range.match(/bytes=(\d*)-(\d*)/), size = v.value.byteLength, a = m && m[1] ? +m[1] : 0, b = m && m[2] ? Math.min(+m[2], size - 1) : size - 1;
        return new Response(v.value.slice(a, b + 1), { status: 206, headers: { "content-type": v.metadata?.type || "application/octet-stream", "content-range": `bytes ${a}-${b}/${size}`, "accept-ranges": "bytes", "cache-control": "public, max-age=31536000, immutable" } }); }
      return res;
    }
    if (url.pathname === "/api/beats") {   // a song's beat map: the page animates the stage from it (worked out in the director's browser at upload)
      const id = cleanId(url.searchParams.get("id"));
      if (req.method === "PUT") { if (!await isDirector(req, env)) return json({ error: "director only" }, {}, 403);
        const t = await req.text(); if (t.length > 400000) return json({ error: "too big" }, {}, 400); try { JSON.parse(t); } catch (e) { return json({ error: "not JSON" }, {}, 400); }
        await env.ISHAI.put("beats:" + id, t); return json({ ok: true }); }
      const v = id && await env.ISHAI.get("beats:" + id); return v ? new Response(v, { headers: { "content-type": "application/json", "cache-control": "public, max-age=86400" } }) : json({ error: "no beat map" }, {}, 404);
    }
    if (url.pathname === "/api/poker") {   // a poker night as the page plays it; ?sample=1 (director) simulates a short one for the sandbox
      if (url.searchParams.get("sample")) {
        if (!await isDev(req, env)) return json({ error: "director only" }, {}, 403);
        const s = await loadState(env), G = pokerNew(s, "sample-" + (url.searchParams.get("seed") || "1"), Date.now()); G.endAt = 20 * 60000; G.pizzaAt = 8 * 60000; G.breakAt = 14 * 60000;
        pokerSimStep(G, 30); return json({ id: G.id, date: G.date, at: G.at, seats: G.seats, hands: G.hands, talk: G.talk.sort((a, b) => a.t - b.t), pizzaAt: G.pizzaAt, breakAt: G.breakAt, endT: G.endT || G.t, results: G.results, buyin: POKER_BUYIN, moments: pokerMoments({ ...G, endT: G.endT || G.t }) }, { "cache-control": "no-store" });
      }
      const date = String(url.searchParams.get("date") || "").replace(/[^0-9-]/g, "").slice(0, 10), v = date && await env.ISHAI.get("poker:" + date);
      return v ? new Response(v, { headers: { "content-type": "application/json", "cache-control": "public, max-age=600" } }) : json({ error: "no poker night on that date" }, {}, 404);
    }
    if (url.pathname === "/api/arena") {   // the next Pump House night; the director also gets its moments as they will air (the sandbox plays them)
      const s = await loadState(env), now = Date.now(), dev = await isDev(req, env), t = nextArenaAt(s, now) || now, date = dayOfTZ(t);
      const bandId = dev && cleanId(url.searchParams.get("band"));
      if (bandId && s.bands && s.bands[bandId]) {   // the sandbox tries a band: every song, starting in a minute
        const b = s.bands[bandId], ev = concertNight(s, "sample", now + 60000, { band: b.id, title: b.name, setlist: b.songs.map(x => x.id), banter: {}, opening: "", closing: "" });
        if (!ev) return json({ error: "no such band" }, {}, 404);
        return json({ next: { id: ev.id, date: ev.date, kind: ev.kind, at: ev.at, title: ev.title, artist: ev.artist, band: ev.band, songs: ev.songs, talk: ev.talk, endT: ev.endT }, moments: concertMoments(ev, s) }, { "cache-control": "no-store" });
      }
      const real = (s.arena && s.arena.events[date]) || ((s.arena?.custom || {})[date] && concertNight(s, date, t, s.arena.custom[date]));
      const wantGallery = dev && url.searchParams.get("gallery");   // the sandbox's gallery night: a gallery even when a concert is booked that week
      const ev = wantGallery ? (real && real.kind !== "concert" ? real : galleryNight(s, date, t)) : real || galleryNight(s, date, t);
      return json({ ...(arenaPublic(s, now) || {}), next: ev.kind === "concert" ? { id: ev.id, date: ev.date, kind: ev.kind, at: ev.at, title: ev.title, artist: ev.artist, band: ev.band, songs: ev.songs, talk: ev.talk, endT: ev.endT }
        : { id: ev.id, date: ev.date, kind: ev.kind, at: ev.at, title: ev.title, artist: ev.artist, sets: ev.sets },
        moments: dev ? (ev.kind === "concert" ? concertMoments(ev, s) : galleryMoments(ev, s)) : undefined }, { "cache-control": "no-store" });
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
    events: s.events.slice(-25).map(e => ({ id: e.id, t: e.t, location: e.location, action: e.action, media: mediaOf(e), ride: e.location === "bus" || e.location === "taxi" ? e.location : /\btaxi\b/i.test(e.text || "") ? "taxi" : /\bbus\b/i.test(e.text || "") ? "bus" : undefined, text: dev ? e.text : "", src: dev ? e.src || null : null, with: e.with || null, lines: e.lines || [], commentary: e.commentary || [], unlocks: e.unlocks || null, delivery: e.delivery || undefined, art: e.art || undefined, then: e.then ? { action: e.then.action, text: dev ? e.then.text : "" } : undefined })),
    talk: (s.talk || []).slice(-80), dev: !!dev,
    studio: s.studio || null, show: s.show || null, call: s.call || null, poll: s.poll && Date.now() < s.poll.closesAt + POLL_SHOW_MIN * 60000 ? pollPublic(s.poll) : null,
    summary: { today: s.daySum || null, yesterday: s.yesterdaySum || null },
    dream: (s.hl || []).filter(h => h.t > Date.now() - 20 * 3600000).slice(-10),
    unlocked: s.unlocked, course: coursePublic(s), arena: arenaPublic(s, Date.now()), poker: pokerPublic(s, Date.now()), promos: promosPublic(s, Date.now()), guide: guideToday(s, Date.now()),
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
STRICT: use only facts from the logs below (and, for teasers only, the COMING UP list). Never invent events, people, objects or plans.
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
 3b) if COMING UP lists anything, one line just before the outro teases the next thing in it: its time and its hook, telling viewers to stay tuned or be back then. Never say how it turns out;
 4) the LAST line is a sponsor outro: once more ${sp.name}, with a DIFFERENT joke than the intro (the other host may groan at it), then back to the cameras.
"pip" is a 4-5 line quick version about the last hour only (first line greets: "Live from the studio..."; if COMING UP lists anything, its last line teases the next one with its time).` },
  { role: "user", content: `YESTERDAY (${s.yesterdaySum ? s.yesterdaySum.date : "none"}): ${s.yesterdaySum ? s.yesterdaySum.text : "(no summary)"}\n\nTODAY so far:\n${earlier.join("\n") || "(little)"}\n\nLAST HOUR:\n${lastHour.join("\n") || "(quiet)"}\n\nCOMING UP (the producers' plan; Ishai has no idea): ${comingUpText(s, storyMs, 8) || "(nothing planned)"}\n\nJSON only.` }];
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
  if (!force) try { await pokerTick(env, s, now); } catch (e) { pokerOf(s).err = { at: now, msg: String(e && e.message || e).slice(0, 200) }; }
  if (!force) try { arenaTick(s, now); } catch (e) { arenaOf(s).err = { at: now, msg: String(e && e.message || e).slice(0, 200) }; }
  geminiOutUntil = Math.max(geminiOutUntil, s.geminiOutUntil || 0);   // a pause set by another isolate still counts
  TALK = talkLevel(s, env, now);
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
  if (!force) try { await surveyTick(env, s, ev, now); } catch (e) { s.surveyErr = { at: now, msg: String(e && e.message || e).slice(0, 160) }; }
  try { surveyHosts(s, ev, now); } catch (e) {}
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
    text: ev.text, with: ev.with || null, lines: ev.lines || [], commentary: ev.commentary || [], unlocks: ev.unlocks || null, src: ev.src || null, art: ev.art || undefined, then: ev.then || undefined });
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
  let pushed = 0;   // vote pushes first (the vote is only 10 minutes long), then the key-moment alert, within one batch of requests
  try { if (!force) { remindTick(s, now); pickTick(s, ev, now); } pushed = await sendPollPushes(env, s); } catch (e) { console.log("vote push", e && e.message); }
  try { maybeAlert(s, ev, last, clock.hour, now); await sendAlerts(env, s, PUSH_BATCH - pushed); } catch (e) { console.log("alert", e && e.message); }   // never let an alert stop the show
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
    `[${storyClock(e.t).label}] (${e.location}/${e.action}${e.with ? " with " + name(e.with) : ""}) ${e.text}${e.then ? ` Then (${e.then.action}): ${e.then.text}` : ""}` +
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
${block ? `- Write the NEXT ${block} MOMENTS, in order, about ${INTERVAL_MIN} minutes apart (story times ${Array.from({ length: block }, (_, k) => storyClock(now + DELAY_MIN * 60000 + k * INTERVAL_MIN * 60000).label.slice(-5)).join(", ")}). Each moment is 1-2 short sentences, max 35 words, present tense, third person, and follows on from the one before (one neighboring place at a time; a conversation may run across several moments, then ends naturally). The radio and TV are written live: if he turns one on, that is the LAST moment you write. EVERY moment where he is with someone or on the phone carries its OWN full conversation of ${TALK.min}-${TALK.max} NEW spoken lines in "lines" (never 1-3 lines spread thin; a short moment of talk is still ${TALK.min}+ lines); use only the listed actions.` : "- Write the NEXT moment only: 1-2 short sentences, max 35 words, present tense, third person."}
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
- Things he owns at home: laptop, books, game console${owned.length ? ", " + owned.join(", ") : ""}.${dogLine}${s.unlocked.includes("radio") ? " At home the radio is often on in the background (mornings, while he cooks or eats, evenings): now and then he hums along, turns it up for a song, or answers the DJ out loud, without stopping what he is doing." : ""} Do not invent other big objects. When he watches TV or listens to the radio, mention what is on (make up shows and stations). ${TV_SHOW}
- "with" is the id of ONE person with him in this moment (a visitor at home counts), or the person on the other end when the action is "phoning"; otherwise null.
- He is social: at least one moment in two involves another person: in person, a phone call, or a text or email. Friends visit and call, strangers start conversations, regulars say something. ${(() => { let n = 0; for (let i = s.events.length - 1; i >= 0 && n < 8; i--) { const e = s.events[i]; if (e.with || (e.lines || []).length > 1 || e.action === "sleeping") break; n++; } return n >= 3 ? `He has been alone for ${n} moments: in THIS moment someone calls, texts or talks to him.` : ""; })()}
- GADI, his boss in all but name, is NEVER seen in person. He only phones (action "phoning", "with": "gadi") or sends a text or email: add "message":{"from":"gadi","kind":"text"|"email","say":"max 25 words"} and Ishai reacts out loud in "lines", alone or with whoever is there. Friends can text the same way. A message needs no "with".
- REGULARS are people he doesn't know well yet, usually found in one place: ${SEED_CAST.filter(c => c.regular).map(c => `${c.name} ("${c.id}", ${c.regular})`).join(", ")}. If he is there at their hours, they can start a short exchange (use "with"), and he gets to know them over time. Kobi at the bar gets drunker with the hour; Mr. Zelig also talks to himself.
- "lines": REQUIRED when the action is "talking" or "phoning" (that IS the conversation). The spoken dialogue of this moment, in order, by "ishai" or the "with" person. When he is with someone or on the phone, write a real, life-like conversation of ${TALK.min} to ${TALK.max} lines (each max 25 words) that fills these 4 minutes: small talk, questions and follow-up questions, stories, teasing, short answers ("yeah", "wait, what?"), interruptions, a topic that drifts to another, a pause filled by someone. Each person in their own voice, with their own opinions and agenda. A conversation usually continues over several moments; pick up exactly where it left off. When he is alone, at most 1 line (muttering to himself or to Moshe), or []. Never put narration inside lines.
- "then" (optional, use it in most moments that stay in one place): what visibly changes about 3 minutes into this moment, in the SAME place with the SAME people: {"action": another action allowed in this place, "text": one short sentence}. E.g. he works at the desk, then gets up and waters Moshe; Noa sits talking, then they both start cooking. Never sleeping, bathroom, showering, the radio or the TV, and leave it out when the moment ends with him leaving. The next moment follows on from the "then".
- EVERY CONVERSATION IS A SCENE WITH A PURPOSE. When a conversation with someone STARTS (their "with" differs from the last moment), fill "scene":
  {"type":"small talk"|"practical"|"plot","why":"the real reason they are talking now (who started it and why)","ishaiWants":"...","theyWant":"...","beats":"3-5 short steps the conversation goes through","ending":"how it ends","lines":12-60 total lines across moments}
  Ground it in the place, the time of day, both characters' personalities, memories and relationship, and ongoing plot threads. Small talk is fine but still has a reason (bored, lonely, being polite, avoiding work). Plot scenes move an arc forward. Otherwise "scene": null.
  While a scene runs, every line serves it: people pursue what they want, dodge, change the subject, give in or push back, like real people.
- When "with" is set, "update" holds that person's updated memory of Ishai (max 25 words, keep old facts that still matter) and "mood": -1, 0 or 1 for how this moment changed their feelings.
- ${allowNew
  ? `You MAY introduce one new person, only if the story really needs someone new. Describe them in "newCharacter" and use their name as "with". Look options: hair ${LOOK.hair.join("/")}; hairColor ${LOOK.hairColor.join("/")}; skin ${LOOK.skin.join("/")}; shirt and pants ${LOOK.cloth.join("/")}; hat ${LOOK.hat.join("/")} with hatColor from the same colours; top ${LOOK.top.join("/")}; bottom ${LOOK.bottom.join("/")}; extras up to 3 of ${LOOK.extras.join("/")}.`
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
Plot notes: ${s.notes || "none"}${storySoFar(s)}${cityNote(now, s.world && s.world.shabbat)}${courseNote(s, now, cw)}${eventNote(s, now, cw)}
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
  park: "the park", cafe: "Cafe Nahat", gym: "Herzl Gym", bar: "The Black Candle bar", market: "Shuk Shalom market", store: "the Everything Else store", plaza: "the plaza in front of the Pump House, by the park", apt2: "Boaz's flat, apartment 2, at the poker table", arena: "inside the Pump House hall", campus: "the courtyard of Tel Herzl University", classroom: "a lecture room at the university", bus: "inside the bus, the city going past the windows", taxi: "the back seat of a taxi, the city going past the window", offscreen: "STATIC - no camera, he is out of coverage" };
// is Falafel the dog in this moment's picture? Only when the moment says so (him, his leash), or at home once adopted
const dogInMoment = (s, m) => /\bFalafel\b|\bthe dog\b|leash/.test(String(m.text || "") + " " + (m.lines || []).map(l => l.say).join(" ")) ||
  (String(m.location || "") === "apartment" && (s.unlocked || []).includes("dog"));
const DOG_WORDS = /\bFalafel\b|\bthe dog\b|\bdoggo\b|\bpup(py)?\b/;
async function addHosts(env, s, moments, clock, now) {
  try {
    const nm = id => id === "ishai" ? "Ishai" : id === "radio" ? "the radio" : id === "tv" ? "the TV" : s.cast[id]?.name || id;
    const said = recentHostLines(s, 10);
    const teaseNow = now - (s.lastTease || 0) > 40 * 60000 ? comingUpText(s, now, 5) : "";
    const sponsor = now - (s.lastAd || 0) > AD_EVERY_MIN * 60000 && Math.random() < 0.35 ? SPONSORS[Math.floor(Math.random() * SPONSORS.length)] : null;
    const list = moments.map((m, i) => { const loc = String(m.location || "").toLowerCase(), act = String(m.action || "").toLowerCase(), w = m.with ? String(m.with).toLowerCase() : null;
      return `#${i + 1} ${storyClock(now + DELAY_MIN * 60000 + i * INTERVAL_MIN * 60000).label.slice(-5)} CAMERA: ${CAMERA[loc] || loc} | picture: Ishai ${act}${w ? " with " + nm(w) : ""}${m.delivery ? " | an ateBite courier at the door" : ""}${dogInMoment(s, m) ? " | Falafel the dog is here" : ""}\n   what happens: ${String(m.text || "").slice(0, 220)}${m.then && m.then.action ? ` | about 3 minutes in he switches to ${m.then.action}` : ""}` +
        (Array.isArray(m.lines) && m.lines.length ? "\n   they say: " + m.lines.slice(0, 14).map(l => `${nm(String(l.who || "").toLowerCase())}: "${String(l.say || "").slice(0, 120)}"`).join(" / ") : ""); }).join("\n");
    const msgs = [{ role: "system", content:
`You write the two hosts of a live reality show that secretly films Ishai, a man in Tel Aviv.
- ${HOSTS.zohar}
- ${HOSTS.oren}
- ${HOSTS.rules}
For EACH moment below write 0-2 short lines (max 20 words each). The viewers see only the picture (the camera and what Ishai is doing) and hear the spoken lines; they cannot read "what happens", so usually one line says plainly what is going on, then a joke, an opinion or a guess. React only to what is visible or said: never invent drinks, food, objects, visitors, calls or plans. When "what happens" has a detail the picture can't show and nobody says it (an object someone brings, holds or hands over, wet clothes, a smell, a sound), one line names it plainly, for example: Dana's at the door with a wet coat and a little pot of basil. If the CAMERA is STATIC, they cannot see him: they wonder where he is, guess, or joke about losing him. Fresh every time: never repeat the lines below, their jokes, openings or catchphrases.${sponsor ? `\nIN ONE OF THESE MOMENTS one host slips in an obvious, cheesy "secret" plug for ${sponsor.name} (${sponsor.pitch}), tied to what Ishai is doing, ending with a wink like "...not sponsored, by the way"; the other host reacts.` : ""}
Mention Falafel the dog only in a moment marked "Falafel the dog is here": anywhere else (a concert, a lecture, poker at Boaz's) he is at home and not in the picture.
Reply with ONLY JSON: {"moments":[{"commentary":[{"who":"zohar"|"oren","say":"..."}]}]} with exactly ${moments.length} entries, in order.` },
      { role: "user", content: `${teaseNow ? `COMING UP LATER (the producers' plan for today; Ishai has no idea): ${teaseNow}\nIn ONE moment only (the quietest one), ONE line teases the next of these: name the time and the hook and urge viewers to stay tuned or be back then ("...at 20:00, don't miss it"). Never say how it turns out.\n\n` : ""}${s.daySum ? `TODAY SO FAR (to connect with earlier moments): ${clip(s.daySum.text, 300)}\n\n` : ""}ALREADY SAID (do not repeat): ${said.length ? said.map(x => `"${x}"`).join(" ") : "nothing yet"}\n\nMOMENTS:\n${list}` }];
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
        .filter(x => (x.who === "zohar" || x.who === "oren") && x.say.length > 3 && !isRepeat(x.say, used) && (!DOG_WORDS.test(x.say) || dogInMoment(s, m))).slice(0, 2);
      c.forEach(x => used.push(x.say));
      if (teaseNow && c.some(x => TEASE_RE.test(x.say))) s.lastTease = now;
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
    const raw = await runModel(env, messages, TALK.brake ? 1000 : 1400);
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
// how long conversations are. Full: 10-16 lines in every moment with someone. The brake drops back to 8-14 (and lets thin moments through)
// when the story is not on Gemini or Cloudflare has used 60% of its free daily allowance, so longer talk never pushes a limit.
const TALK_FULL = { min: 10, max: 16, need: 6, brake: false }, TALK_SAFE = { min: 8, max: 14, need: 4, brake: true };
let TALK = TALK_FULL;
const neuronsOf = u => u ? Math.round((u.inTok || 0) * 4625 / 1e6 + (u.outTok || 0) * 30475 / 1e6) : 0;
function talkLevel(s, env, now) {
  const why = !env.GEMINI_API_KEY ? "no Gemini key"
    : now < geminiOutUntil ? "Gemini paused"
    : (s.geminiErrs || []).some(f => f.role === "story" && now - f.at < 30 * 60000) ? "Gemini failed in the last 30 min"
    : neuronsOf(s.usage) + neuronsOf({ inTok: USE.inTok, outTok: USE.outTok }) > 6000 ? "Cloudflare over 60% of the day" : null;
  s.talkBrake = why;
  return why ? TALK_SAFE : TALK_FULL;
}
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
    if (!r.ok) throw new Error("gemini models " + r.status);
    const ids = ((await r.json()).data || []).map(m => String(m.id || "").replace(/^models\//, ""));
    const ver = id => parseFloat((id.match(/gemini-([\d.]+)/) || [0, 0])[1]);
    const lite = ids.filter(id => /^gemini-[\d.]+-flash-lite$/.test(id)).sort((a, b) => ver(b) - ver(a));
    geminiModel = lite[0] || ids.filter(id => /flash-lite/.test(id) && !/preview|exp|tts|image|live|audio/.test(id)).sort((a, b) => ver(b) - ver(a))[0] || "gemini-3.5-flash-lite";
  } catch (e) { return "gemini-3.5-flash-lite"; }   // the list failed: use the fallback this time only, and pick again on the next call
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
    if (allowNoHosts && k === "hagit" && (ev.location === "arena" || ev.location === "plaza")) return k;   // Hagit hosts the Pump House's events
    const c = ev.with && (ev.with === k || (s.cast[ev.with]?.name || ev.newCard?.name || "").toLowerCase() === k); return c ? ev.with : null; };
  ev.lines = (Array.isArray(o.lines) ? o.lines : []).map(l => { const x = { who: who(l?.who), say: str(l?.say, 200).replace(/^["']|["']$/g, "") };
      if (allowNoHosts && Number.isInteger(l?.piece) && l.piece >= 0 && l.piece < 30) x.piece = l.piece; return x; })   // which picture a line is about (Pump House)
    .filter(l => l.who && l.say).slice(0, 14);
  if (allowNoHosts && o.art && typeof o.art === "object") ev.art = { ev: str(o.art.ev, 30), set: Number.isInteger(o.art.set) ? o.art.set : undefined, curtain: o.art.curtain === true || undefined, queue: o.art.queue === true || undefined, after: o.art.after === true || undefined };
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
    if (ev.location === "apt2" && last.location !== "apt2" && !allowNoHosts) return { ev, problem: "apartment 2 is Boaz's flat; Ishai only goes in on poker nights (planned)" };
    if (ev.location === "arena" && last.location !== "arena" && !allowNoHosts) return { ev, problem: "the Pump House hall is only open on its event nights (Ishai can be on the plaza outside)" };
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
  if (ev.with && ev.lines.length < TALK.need && !allowNoHosts)
    return { ev, problem: `he is ${ev.action === "phoning" ? "on the phone" : "together"} with ${s.cast[ev.with]?.name || ev.with}, so "lines" must contain their actual conversation: ${TALK.min} to ${TALK.max} lines alternating between "ishai" and "${ev.with}"` };
  { const prev = recentHostLines(s, 12);
    const rep = ev.commentary.find(c => isRepeat(c.say, prev));
    if (rep) ev.commentary = ev.commentary.filter(c => !isRepeat(c.say, prev)); } // a stale joke is just cut; not worth a whole retry
  if ((ev.with || ev.lines.length >= 2) && !ev.commentary.length && !allowNoHosts && !HOSTS_APART)
    return { ev, problem: 'the hosts are missing or only repeated earlier jokes: add "commentary" with 1-2 FRESH lines from zohar and/or oren reacting to what is new in this scene' };
  ev.then = thenOf(o.then, ev, s);
  return { ev, problem: null };
}
// the second half of a moment: a change of action ~3 minutes in, same place, same people (the page plays it; no extra AI call or save)
const THEN_NOT = ["sleeping", "waking", "bathroom", "showering", "watching", "listening", "away", "walking"];
function thenOf(t, ev, s) {
  if (!t || typeof t !== "object" || THEN_NOT.includes(ev.action) || !LOCATIONS[ev.location]) return null;
  const a = String(t.action || "").toLowerCase().trim(), text = String(t.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!a || a === ev.action || THEN_NOT.includes(a) || !allowed(ev.location, s.unlocked).includes(a)) return null;
  if ((a === "talking") && !ev.with) return null;
  return { action: a, text };
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
      hat: pick(L.hat, LOOK.hat, "none"), hatColor: pick(L.hatColor, LOOK.cloth, "black"), top: pick(L.top, LOOK.top, "tshirt"), bottom: pick(L.bottom, LOOK.bottom, "trousers"),
      extras: (Array.isArray(L.extras) ? L.extras : []).map(x => String(x).toLowerCase()).filter(x => LOOK.extras.includes(x)).slice(0, 3)
    },
    memory: "Just met Ishai.", relationship: 0, lastSeen: null, scenes: 0
  };
}

// last resort: keep the text but force legal values
function repair(ev, s, last) {
  let loc = LOCATIONS[ev.location] ? ev.location : last.location;
  if (loc !== last.location && !NEXT[last.location].includes(loc)) loc = last.location;
  const legal = ev.action === "improv" && loc === "bar" ? ["improv"] : ev.action === "lecture" && loc === "classroom" ? ["lecture"] : ev.action === "gallery" && loc === "arena" ? ["gallery"] : ev.action === "concert" && loc === "arena" ? ["concert"] : ev.action === "poker" && loc === "apt2" ? ["poker"] : allowed(loc, s.unlocked);
  const act = legal.includes(ev.action) ? ev.action : (legal.includes("idle") ? "idle" : legal[0]);
  const ok = ev.with && (s.cast[ev.with] || ev.newCard?.id === ev.with) && act !== "sleeping";
  return { ...ev, location: loc, action: act, with: ok ? ev.with : null,
    lines: ok ? ev.lines : ev.lines.filter(l => l.who === "ishai" || STUDENT.test(l.who) || l.who === "hagit"), update: ok ? ev.update : null, newCard: ok ? ev.newCard : null };
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
  const step = { bus: "street", taxi: "street", offscreen: "street", street: "corridor", shops: "street", market: "street", store: "market", campus: "street", classroom: "campus", park: "street", plaza: "park", arena: "plaza", apt2: "corridor", cafe: "shops", gym: "street", bar: "street", corridor: "apartment" }[last.location];
  let ev;
  if (step) {
    const T = {
      street: ["Ishai looks pale. He heads back along Herzl Street toward home, slower than usual.", "He walks home along Herzl Street, one hand on his stomach."],
      market: ["Ishai looks pale among the market stalls. He gives up on the shopping and takes the bus home.", "He sits on the bus back from the market, eyes closed."],
      park: ["Ishai looks pale. He walks back through the park toward Herzl Street, slower than usual."],
      plaza: ["Ishai looks pale. He leaves the hall and steps out into the fresh air."],
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
  const home = { bus: "street", taxi: "street", offscreen: "street", street: "corridor", shops: "street", market: "street", store: "market", campus: "street", classroom: "campus", park: "street", plaza: "park", arena: "plaza", apt2: "corridor", cafe: "shops", gym: "street", bar: "street", corridor: "apartment" }[last.location];
  if (night && home) {
    const T = { park: "He walks back through the dark park toward Herzl Street.", plaza: "He walks out of the Pump House into the night air.", campus: "He walks out into the dark courtyard.", market: "He walks out of the store into the dark, empty market.", street: "Ishai heads back along Herzl Street toward home.", shops: "He walks back past the dark shop windows toward his building.", corridor: "He walks into his building and climbs the stairs, yawning.", apartment: "He lets himself in, yawning, and gets ready for bed." };
    return { location: home, action: home === "apartment" ? "idle" : "walking", text: T[home], with: null, lines: [] };
  }
  const P = {
    apartment: night ? [["apartment", "sleeping", "Ishai is asleep. Somewhere a cat argues with another cat."], ["apartment", "sleeping", "He turns over and mumbles something about kerning."], ["apartment", "sleeping", "Ishai sleeps on, one arm hanging off the bed."]]
      : [["apartment", "idle", "Ishai stares out the window, thinking about nothing in particular."], ["apartment", "working", "He opens the laptop and pretends to answer emails."], ["apartment", "reading", "He picks up a book, reads two pages, and checks his phone."], ["apartment", "drinking", "He pours a glass of water and waters Moshe the basil too."], ["apartment", "cooking", "He makes a quick omelette and eats it straight from the pan."]],
    corridor: [["corridor", "walking", "Ishai walks down the hallway, keys jingling."], ["apartment", "idle", "He lets himself back into the flat and drops his keys on the desk."], ["street", "walking", "He steps out of the building onto Herzl Street."]],
    street: [["street", "walking", "He walks along Herzl Street, dodging a scooter."], ["street", "idle", "He sits on the bus stop bench for a minute, watching the traffic."], ["street", "eating", "He buys a falafel at Avi's kiosk and eats it standing at the counter."], ["park", "walking", "He wanders into the little park and heads for the bench."], ["corridor", "walking", "He heads back into his building and up the stairs."]],
    campus: [["campus", "idle", "Ishai reads the notices on the university board."], ["campus", "walking", "He crosses the courtyard, past students on the benches."], ["street", "walking", "He takes the bus back to Herzl Street."]],
    classroom: [["campus", "walking", "He walks out of the lecture room into the courtyard."]],
    plaza: [["plaza", "idle", "Ishai reads the Pump House poster board."], ["plaza", "walking", "He walks slowly past the old pump hall, looking up at the chimney."], ["park", "walking", "He walks back into the park."]],
    arena: [["plaza", "walking", "He walks out of the hall onto the plaza."]],
    apt2: [["corridor", "walking", "He says goodnight at Boaz's door and climbs the stairs home."]],
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
    "corridor>apartment": "He unlocks apartment 4 and goes in.", "corridor>apt2": "He goes down one flight and knocks on apartment 2.", "apt2>corridor": "He climbs the stairs back up to his floor.", "street>apt2": "He goes into his building and knocks on apartment 2 on the first floor.", "apt2>street": "He leaves apartment 2 and goes down the stairs to the street.", "park>plaza": `He walks across the park${umb}, past the pond, to the old Pump House on the far side.`, "plaza>park": `He walks back into the park${umb}.`, "plaza>arena": "He goes in through the Pump House's double doors.", "arena>plaza": "He walks out of the hall onto the plaza.", "park>street": `He walks back along Herzl Street${umb}, past the barber and PicSell, toward his building.`, "cafe>shops": `He steps out of the café onto Herzl Street${umb}, by the flower shop.`,
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
// a written-ahead moment with a small fault is patched instead of thrown away; a thin conversation only while the brake is on
const minorProblem = p => /fill "scene"|hosts are missing/.test(p || "") || (TALK.brake && /"lines" must contain/.test(p || ""));
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
  if (r.ev && r.problem && minorProblem(r.problem)) { r.ev = repair(r.ev, s, last); r.problem = null; }
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
  const raw = await runModel(env, buildMessages(s, clock, now, goal, { block: n }), 800 + n * (TALK.brake ? 650 : 1000));
  const o = parseAI(raw), parsed = Array.isArray(o) ? o : Array.isArray(o?.moments) ? o.moments : o?.location ? [o] : null;
  let arr = (parsed || []).filter(x => x && typeof x === "object").slice(0, n);
  const allowNew = canAddPerson(s, now), written = arr.length;
  // a moment that breaks a rule costs only itself: the next one takes over, as validate checks it against where he is now
  let r = { problem: "the block was not valid JSON" }, skip = 0;
  for (let i = 0; i < arr.length; i++) {
    r = validate(JSON.stringify(arr[i]), s, last, allowNew, goal, false);
    if (r.ev && r.problem && minorProblem(r.problem)) { r.ev = repair(r.ev, s, last); r.problem = null; }
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
  if (d.alerts === false || a.n > d.max) return false;   // key moments off: the device only wants vote reminders and its picks
  if (d.from === d.to) return true;
  return d.from < d.to ? a.hour >= d.from && a.hour < d.to : a.hour >= d.from || a.hour < d.to;
}
// a batch at each run: the free plan allows only so many requests at a time
async function sendAlerts(env, s, budget = PUSH_BATCH) {
  const job = s.alertSend; if (!job || !env.VAPID_JWK || budget < 1) return 0;
  if (Date.now() - s.alert.at > 20 * 60000) { s.alertSend = null; return 0; }
  const page = await env.ISHAI.list({ prefix: "push:", limit: Math.min(budget, PUSH_BATCH), cursor: job.cursor || undefined }), auth = {};
  const rs = await Promise.allSettled(page.keys.map(async k => {
    const raw = await env.ISHAI.get(k.name); if (!raw) return 0;
    const dev = JSON.parse(raw); if (!deviceWants(dev, s.alert)) return 0;
    return pushTo(env, k.name, dev.ep, auth);
  }));
  const n = rs.reduce((a, r) => a + (r.status === "fulfilled" ? r.value : 0), 0);
  job.sent += n; if (page.list_complete) s.alertSend = null; else job.cursor = page.cursor;
  return n;
}

async function pushTo(env, key, ep, auth) {   // an empty push; the device then asks /api/alert what to show
  const origin = new URL(ep).origin; auth[origin] = auth[origin] || await vapidHeader(env, origin);
  const r = await fetch(ep, { method: "POST", headers: { authorization: auth[origin], ttl: "300", urgency: "high", "content-length": "0" } });
  if (r.status === 404 || r.status === 410) await env.ISHAI.delete(key);     // that device has gone
  return r.ok ? 1 : 0;
}
// ---------- vote pushes: a reminder when a poll opens, and "your pick is happening" ----------
// Both go only to the devices that asked: the vote card's bell (D1 push_remind) and the device that voted for the winner
// (D1 push_votes, sent with the vote) when its settings keep "picks" on (the default). Not counted in the daily key-moment limit.
// The job list s.pollPushes says what each one reads; /api/alert?ep= checks the device is on that job's list.
let pushTablesOk = false;
async function pushTables(env) {
  if (pushTablesOk || !env.DB) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS push_remind (poll TEXT NOT NULL, dev TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (poll, dev))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS push_votes (poll TEXT NOT NULL, dev TEXT NOT NULL, opt INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (poll, dev))")]);
  pushTablesOk = true;
}
const REMIND_AHEAD = 6.5 * 60000;   // ticks come every 6 minutes: the one just before hh:20 sends it (hh:18), or the first one inside the 10 minutes
async function pollRemind(req, env) {   // the vote card's bell: remind this device when the coming poll opens
  if (!env.DB) return json({ error: "voting is not set up yet" }, {}, 503);
  const b = await req.json().catch(() => ({})), ep = String(b.endpoint || ""), key = ep.length < 700 && pushAllowed(ep) ? await pushKey(ep) : null;
  if (!key) return json({ error: "not a push address" }, {}, 400);
  const s = await loadState(env), p = s.poll, now = Date.now();
  if (!p || p.id !== b.poll || now >= p.opensAt) return json({ error: "this vote has already opened" }, {}, 409);
  if (!await env.ISHAI.get(key)) return json({ error: "turn notifications on first" }, {}, 409);
  await pushTables(env);
  if (b.on === false) await env.DB.prepare("DELETE FROM push_remind WHERE poll = ? AND dev = ?").bind(p.id, key).run();
  else await env.DB.prepare("INSERT OR IGNORE INTO push_remind (poll, dev, at) VALUES (?, ?, ?)").bind(p.id, key, now).run();
  return json({ ok: true, on: b.on !== false }, { "cache-control": "no-store" });
}
function pollPushJob(s, job, now) { s.pollPushes = [...(s.pollPushes || []).filter(j => now - j.at < 60 * 60000), { ...job, at: now, offset: 0, done: false, sent: 0 }].slice(-6); }
// in tick(): start the reminder for the coming poll
function remindTick(s, now) {
  const p = s.poll; if (!p || p.done || p.reminded || now < p.opensAt - REMIND_AHEAD || now > p.closesAt - 45000) return;
  p.reminded = true;
  const m = Math.round((p.opensAt - now) / 60000), left = Math.max(1, Math.round((p.closesAt - now) / 60000));
  pollPushJob(s, { kind: "remind", poll: p.id, title: "Viewers' vote", body: (m > 0 ? `The vote opens in ${m} minute${m === 1 ? "" : "s"}` : `The vote is open now, ${left} minute${left === 1 ? "" : "s"} left`) + ": " + p.question }, now);
}
// in tick(): the poll's goal reaches the moment it was voted for (written 5 minutes ahead, like the key-moment alerts)
function pickTick(s, ev, now) {
  const g = (s.director || []).find(d => d.poll && d.pollOpt != null && !d.pickAt && (d.status === "active" || d.doneAt === now)); if (!g) return;
  const w = g.forceWith; if (!w || !(ev.with === w || (ev.lines || []).some(l => l && l.who === w))) return;
  g.pickAt = now;
  pollPushJob(s, { kind: "pick", poll: g.poll, opt: g.pollOpt, title: "Your vote won", body: `It's about to happen: "${g.pollLabel || "your pick"}". In 5 minutes.` }, now);
}
async function sendPollPushes(env, s, budget = PUSH_BATCH) {
  const job = (s.pollPushes || []).find(j => !j.done); if (!job || !env.VAPID_JWK || !env.DB) return 0;
  if (Date.now() - job.at > 15 * 60000) { job.done = true; return 0; }
  await pushTables(env);
  const q = job.kind === "pick" ? env.DB.prepare("SELECT dev FROM push_votes WHERE poll = ? AND opt = ? ORDER BY dev LIMIT ? OFFSET ?").bind(job.poll, job.opt, budget, job.offset)
    : env.DB.prepare("SELECT dev FROM push_remind WHERE poll = ? ORDER BY dev LIMIT ? OFFSET ?").bind(job.poll, budget, job.offset);
  const rows = (await q.all()).results || [], auth = {};
  const rs = await Promise.allSettled(rows.map(async row => {
    const raw = await env.ISHAI.get(row.dev); if (!raw) return 0;          // notifications turned off since
    const dev = JSON.parse(raw); if (job.kind === "pick" && dev.picks === false) return 0;
    return pushTo(env, row.dev, dev.ep, auth);
  }));
  job.sent += rs.reduce((a, r) => a + (r.status === "fulfilled" ? r.value : 0), 0); job.offset += rows.length;
  if (rows.length < budget) job.done = true;
  return rows.length;
}
// what a device shows for a push: the key-moment alert (when it wants it) and its own vote pushes, each once (the device remembers the tags it showed)
async function alertFor(env, ep) {
  const s = await loadState(env), now = Date.now(), items = [], a = s.alert, fresh = a && now - a.at < 20 * 60000;
  if (!ep) return json(a ? { title: a.title, body: a.body, items: fresh ? [{ title: a.title, body: a.body, tag: "alert-" + a.at }] : [] } : {}, { "cache-control": "no-store" });   // an old background script
  const key = ep.length < 700 && pushAllowed(ep) ? await pushKey(ep) : null, raw = key ? await env.ISHAI.get(key) : null, dev = raw ? JSON.parse(raw) : null;
  if (fresh && (!dev || deviceWants(dev, a))) items.push({ title: a.title, body: a.body, tag: "alert-" + a.at });
  if (key && env.DB) for (const j of (s.pollPushes || []).filter(j => now - j.at < 20 * 60000)) try {
    const row = j.kind === "pick" ? (dev && dev.picks !== false ? await env.DB.prepare("SELECT 1 AS y FROM push_votes WHERE poll = ? AND dev = ? AND opt = ?").bind(j.poll, key, j.opt).first() : null)
      : await env.DB.prepare("SELECT 1 AS y FROM push_remind WHERE poll = ? AND dev = ?").bind(j.poll, key).first();
    if (row) items.push({ title: j.title, body: j.body, tag: j.kind + "-" + j.poll });
  } catch (e) {}
  return json({ items }, { "cache-control": "no-store" });
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
  const names = Object.keys(COURSE.strands), taken = new Set([...c.used, ...c.queue.map(q => q.id), ...(c.reserved || [])]);   // reserved: choices in the week's lecture survey
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
// Once an hour a question about the people around Ishai: it opens at hh:20 (Israel time) for 10 minutes, anyone can vote once.
// The winner becomes a secret goal that starts at least an hour later, in a free gap, so it never touches the next hour.
const POLL_AT_MIN = 20, POLL_SEC = 600, POLL_SHOW_MIN = 10;      // opens at hh:20, 10 minutes of voting, the result stays on screen 10 minutes
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
  if (!LOCATIONS[loc] || ["classroom", "arena", "apt2", "bus", "taxi", "offscreen"].includes(loc)) return false;
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
<p><b>Surveys of the week.</b> Survey votes and the suggestions you send (a character or a place) are kept with the same scrambled id. Suggestions are read only by the director; the public sees only the shortlist the director picks.</p>
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
  const ep = String(b.endpoint || "");   // this device gets a push when its pick wins and plays out (if its settings allow)
  if (r.meta.changes === 1 && ep && ep.length < 700 && pushAllowed(ep)) try { await pushTables(env);
    await env.DB.prepare("INSERT OR REPLACE INTO push_votes (poll, dev, opt, at) VALUES (?, ?, ?, ?)").bind(p.id, await pushKey(ep), opt, now).run(); } catch (e) {}
  return json({ ok: true, counted: r.meta.changes === 1 }, { "cache-control": "no-store" });
}
// in tick(): count a closed poll and hand the winner to the story; write the next poll at the start of each hour
async function pollTick(env, s, ev, now, last) {
  const p = s.poll;
  if (p && !p.done && now < p.opensAt && p.closesAt !== p.opensAt + POLL_SEC * 1000) p.closesAt = p.opensAt + POLL_SEC * 1000;   // a poll written before POLL_SEC changed gets the new length
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
        g.poll = p.id; g.pollOpt = r.winner; g.pollLabel = o.label; s.director.push(g); goalId = g.id;
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
  if (env.DB) try { await pushTables(env); await env.DB.batch(["push_remind", "push_votes"].map(t => env.DB.prepare(`DELETE FROM ${t} WHERE at < ?`).bind(now - 2 * 86400000))); } catch (e) {}   // old reminders and picks
  if (!env.DB || s.pollsOff || h < POLL_FROM_H || h > POLL_TO_H || pollShabbat(s, opensAt) || last.action === "sleeping" || ev.action === "sleeping") return;
  let made = null, why = null;
  if (now >= (s.aiOutUntil || 0)) { try { const r = await writePoll(env, s, opensAt, closesAt); made = r.poll || null; why = r.why || null; } catch (e) { why = [String(e && e.message || e).slice(0, 120)]; } }
  if (!made) made = bankPoll(s, key, closesAt);
  s.pollErr = why ? { at: now, why: why.slice(0, 4) } : null;
  if (made) s.poll = { id: "p-" + new Date(opensAt).toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 13).replace(/\D/g, ""), ...made, opensAt, closesAt };
}


// ---------- surveys of the week (docs/SURVEY_PLAN.md) ----------
// Sunday 06:00 to Saturday 21:00 (Israel time), Google sign-in only, one final vote per account. No AI, no KV writes:
// the surveys live in the state (s.surveys), votes and suggestions in D1. Nobody in the story knows; only the hosts talk about them.
// Story effects only for the "who would you like" kinds (join, place), once the director has built the winner and linked it.
const SURVEY_FROM_H = 6, SURVEY_CLOSE_H = 21, SUGGEST_MAX = 2, SURVEY_KEEP_D = 7;
const SURVEY_Q = {
  fav: "Who is your favourite character this week?",
  poker: "Who wins poker night at Boaz's?",
  lecture: "What would you like to hear in the history course next?",
  join: "Who would you like to join the show?",
  place: about => `Where would you like ${about} to take Ishai?` };
const SURVEY_ORDER = ["poker", "fav", "lecture", "join", "place"];
let surveyTablesOk = false;
async function surveyTables(env) {
  if (surveyTablesOk || !env.DB) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS survey_votes (survey TEXT NOT NULL, voter TEXT NOT NULL, opt INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (survey, voter))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, survey TEXT NOT NULL, voter TEXT NOT NULL, a TEXT NOT NULL, b TEXT, c TEXT, at INTEGER NOT NULL)")]);
  surveyTablesOk = true;
}
// the week "now" is in: its Sunday, when it opens (Sun 06:00), when suggestions end (Thu 00:00) and when it closes (Sat 21:00)
function surveyWeek(now) {
  const day = dayOfTZ(now), [y, m, d] = day.split("-").map(Number), wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const at = (dd, h) => { const u = Date.UTC(y, m - 1, d - wd + dd, h); return u - tzOffset(u); };
  return { key: new Date(Date.UTC(y, m - 1, d - wd)).toISOString().slice(0, 10), start: at(0, SURVEY_FROM_H), suggestUntil: at(4, 0), close: at(6, SURVEY_CLOSE_H) };
}
const surveyName = (s, id) => id === "ishai" ? "Ishai" : id === "falafel" ? "Falafel" : s.cast[id] ? s.cast[id].name : P_NAME[id] || id;
// Ishai's friends, for "where would you like … to take Ishai": the friends in their role, or anyone close to him now
function surveyFriends(s) {
  return Object.values(s.cast).filter(c => !c.phoneOnly && !POLL_NOT.includes(c.id) && (/\bIshai's (best )?friend\b/i.test(c.role || "") || (c.relationship || 0) >= 3)).map(c => c.id).sort();
}
function surveysOf(s) { return s.surveys || (s.surveys = []); }
function surveyMake(s, W, now) {
  const list = [], mk = (kind, x) => ({ id: W.key.replace(/-/g, "") + "-" + kind, week: W.key, kind, question: SURVEY_Q[kind], about: null, options: [], opensAt: W.start, closesAt: W.close,
    suggestUntil: null, result: null, said: false, linked: null, goal: null, ...x });
  list.push(mk("fav", { options: [{ label: "Ishai", ref: "ishai" }] }));
  const pt = !(s.poker && s.poker.off) && nextPokerAt(s, W.start);
  if (pt && pt > W.start && pt < W.close) list.push(mk("poker", { closesAt: pt, options: ["ishai", "boaz", "ronit", "moti", "yossi"].map(p => ({ label: P_NAME[p], ref: p })) }));
  const lec = surveyTopics(s);   // no lecture survey while a two-part lecture is lined up
  if (lec) list.push(mk("lecture", { topics: lec, options: lec.map(t => ({ label: t.title, ref: t.id })) }));
  list.push(mk("join", { suggestUntil: W.suggestUntil }));
  const fr = surveyFriends(s), who = fr.length ? fr[pollHash(W.key) % fr.length] : "noa";
  list.push(mk("place", { about: who, question: SURVEY_Q.place(surveyName(s, who)), suggestUntil: W.suggestUntil }));
  s.surveys = [...surveysOf(s).filter(x => x.closesAt > now - (SURVEY_KEEP_D + 7) * 86400000), ...list];
}
// the lecture survey's choices: the topic the course would pick next by itself (the strands take turns), and three random
// topics from other strands. They are held back (c.reserved) until the survey closes, so no lecture uses one up during the week.
function surveyTopics(s) {
  const c = s.course; if (!c || !c.queue || c.queue.slice(0, 2).some(q => q.part)) return null;
  const at = c.strandAt, planned = pickTopic(c); c.strandAt = at; if (!planned) return null;
  const taken = new Set([...c.used, ...c.queue.map(q => q.id), ...(c.reserved || []), planned.id]);
  const rest = allTopics().filter(t => !taken.has(t.id) && t.strand !== planned.strand), out = [planned];
  while (out.length < 4 && rest.length) { const t = rest.splice(Math.floor(Math.random() * rest.length), 1)[0]; if (!out.some(o => o.strand === t.strand)) out.push(t); else if (rest.every(r => out.some(o => o.strand === r.strand))) out.push(t); }
  c.reserved = [...(c.reserved || []), ...out.map(t => t.id)];
  return out.map(t => ({ id: t.id, title: t.title, wiki: t.wiki, strand: t.strand }));
}
// the vote is in: the winner becomes the lecture after next (the next one is already set and announced). Never between the two
// parts of a lecture, never over a topic the director chose; if the next lecture is already written, its closing announcement is redone.
function surveyLectureApply(s, sv, now) {
  const c = courseOf(s), ids = new Set((sv.topics || []).map(t => t.id)); c.reserved = (c.reserved || []).filter(id => !ids.has(id));
  const r = sv.result, t = r && r.winner != null && sv.topics ? sv.topics[r.winner] : null; if (!t) return null;
  if (c.queue.some(q => q.id === t.id)) return 1;
  let i = 1; while (c.queue[i] && (c.queue[i].part === 2 || c.queue[i].strand === "Director's choice")) i++;
  if (c.queue[i] && c.queue[i].part === 1) c.queue.splice(i, 0, { ...t }); else c.queue[i] = { ...t };
  if (i === 1) { const live = s.director.find(d => d.id === c.goalId && d.status === "active"); if (!live) unscheduleLecture(s); }   // courseTick() schedules it again with the new announcement
  return i;
}
// after poker night: who won, for the hosts' line once the votes are counted
function surveyPoker(s, R, date) {
  const sv = surveysOf(s).find(x => x.kind === "poker" && dayOfTZ(x.closesAt) === date); if (!sv || sv.pokerWinner) return;
  const res = R.results || {}, top = Object.keys(res).sort((a, b) => res[b] - res[a])[0]; if (top) sv.pokerWinner = top;
}
const svPhase = (sv, now) => now < sv.opensAt ? "soon" : sv.suggestUntil && now < sv.suggestUntil && !sv.shortlisted ? "suggest"
  : now >= sv.closesAt ? "closed" : !sv.options.length ? (sv.kind === "lecture" ? "waiting" : "shortlist") : "open";
const svPct = (r, i) => r && r.total ? Math.round(100 * r.counts[i] / r.total) : 0;
function surveySay(s, say) { (s.surveySay = s.surveySay || []).push({ who: pollHash(say) % 2 ? "zohar" : "oren", say, at: Date.now() }); }
// in tick(): make the week's surveys, grow the favourite list, count closed ones, line up the hosts and the story
async function surveyTick(env, s, ev, now, force) {
  if (s.course && (s.course.reserved || []).length) {   // topics are held back only for a lecture survey still open
    const keep = new Set(surveysOf(s).filter(x => x.kind === "lecture" && !x.result && !s.surveysOff).flatMap(x => (x.topics || []).map(t => t.id)));
    s.course.reserved = s.course.reserved.filter(id => keep.has(id));
  }
  if (!env.DB || !env.GOOGLE_CLIENT_ID || s.surveysOff) return;
  await surveyTables(env);
  const W = surveyWeek(now);
  if (now >= W.start && !surveysOf(s).some(x => x.week === W.key)) surveyMake(s, W, now);
  for (const sv of surveysOf(s)) if (sv.kind === "lecture" && !sv.topics && !sv.options.length && now < sv.closesAt) {   // a lecture survey from before v201 becomes a next-topic vote
    const t = surveyTopics(s); sv.question = SURVEY_Q.lecture;
    if (t) { sv.topics = t; sv.options = t.map(x => ({ label: x.title, ref: x.id })); } else sv.closesAt = now;
  }
  for (const sv of surveysOf(s)) {
    if (sv.kind === "fav" && now < sv.closesAt) {   // everyone seen on camera this week can be picked (the list only grows: votes keep their numbers)
      const seen = Object.values(s.cast).filter(c => !c.phoneOnly && !/^student/.test(c.id) && (c.lastSeen || 0) >= sv.opensAt).map(c => c.id);
      if ((s.unlocked || []).includes("dog")) seen.push("falafel");
      for (const id of seen) if (!sv.options.some(o => o.ref === id)) sv.options.push({ label: surveyName(s, id), ref: id });
    }
    if (!sv.result && now > sv.closesAt + 5000 && sv.options.length) {
      sv.result = await surveyCount(env, sv);
      const r = sv.result, w = r.winner, o = w == null ? null : sv.options[w];
      if (sv.kind === "fav" && o) surveySay(s, `The week's survey is in: your favourite character this week is ${o.label}, with ${svPct(r, w)}% of the votes.`);
      if (sv.kind === "lecture") { const at = surveyLectureApply(s, sv, now);
        if (o && at) surveySay(s, `You picked the history course's next topic: "${o.label}", ${svPct(r, w)}% of you. ${at === 1 ? "It comes right after the next lecture" : "It comes after the lectures already lined up"}. Dr. Sasson will never know why.`); }
      if (sv.kind === "join" && o) surveySay(s, `You voted, ${svPct(r, w)}% of you: ${o.label} should join the show. The director is on it. Watch this space.`);
      if (sv.kind === "place" && o) surveySay(s, `${svPct(r, w)}% of you want ${surveyName(s, sv.about)} to take Ishai to ${o.label}. Noted. Someday.`);
    }
    if (sv.kind === "poker" && sv.pokerWinner && sv.result && !sv.said) {
      sv.said = true; const r = sv.result, i = sv.options.findIndex(o => o.ref === sv.pokerWinner), name = surveyName(s, sv.pokerWinner), best = r.winner == null ? null : sv.options[r.winner];
      surveySay(s, !r.total ? `${name} won poker night. Nobody guessed it, because nobody guessed at all.`
        : r.winner === i ? `${svPct(r, i)}% of you picked ${name} to win poker night, and ${name} took it. Well read, everyone.`
        : `${svPct(r, r.winner)}% of you picked ${best.label}, but ${name} took poker night. Only ${svPct(r, i)}% saw that coming.`);
    }
    if (sv.linked && !sv.goal) surveyGoal(s, sv, now);   // the director built and linked the winner: it happens in the story
  }
  s.surveys = surveysOf(s).filter(x => x.closesAt > now - (SURVEY_KEEP_D + 7) * 86400000);
}
async function surveyCount(env, sv) {
  const { results } = await env.DB.prepare("SELECT opt, COUNT(*) AS n FROM survey_votes WHERE survey = ? GROUP BY opt").bind(sv.id).all();
  const counts = sv.options.map((_, i) => Number((results || []).find(r => Number(r.opt) === i)?.n || 0)), total = counts.reduce((a, b) => a + b, 0);
  const top = Math.max(0, ...counts), tied = counts.map((n, i) => n === top ? i : -1).filter(i => i >= 0);
  return { counts, total, winner: total ? tied[pollHash(sv.id) % tied.length] : null, tie: total > 0 && tied.length > 1 };
}
// a linked wish becomes a goal in a free gap (like a poll's winner); nobody in the story knows about any vote
function surveyGoal(s, sv, now) {
  const r = sv.result, w = r && r.winner, o = w == null ? null : sv.options[w]; if (!o) return;
  const who = sv.kind === "join" ? sv.linked : sv.about, c = s.cast[who]; if (!c) return;
  const where = sv.kind === "join" ? (c.hangouts || [])[0] || "street" : sv.linked;
  if (!LOCATIONS[where]) return;
  const at = pollStart(s, { who, kind: "meet", where }, now - (POLL_DELAY_MIN - 15) * 60000); if (!at) return;   // try again next tick
  const goal = sv.kind === "join" ? `Ishai meets ${c.name} (${c.role}) for the first time, at the ${where}. They get talking naturally.`
    : `${c.name} takes Ishai to ${o.label} (${where}). It is ${c.name}'s idea; they go there together, the real way, and spend some time there.`;
  const g = newGoal({ id: "survey-" + sv.id, goal: goal + " Nobody in the story knows about any vote: it simply happens, naturally.", forceText: goal.split(". ")[0] + ".",
    startAt: new Date(at).toISOString(), deadlineAt: new Date(at + POLL_LEN_MIN * 60000).toISOString(), location: where, with: c.name, forceWith: who, forceAction: "talking" }, now);
  g.survey = sv.id; s.director.push(g); sv.goal = g.id;
}
// in tick(): a linked wish reaching its moment gets its host line; then one queued survey line a moment (not while he sleeps)
function surveyHosts(s, ev, now) {
  for (const g of (s.director || []).filter(d => d.survey && !d.saidAt && (d.status === "active" || d.doneAt === now))) {
    if (!(ev.with === g.forceWith || (ev.lines || []).some(l => l && l.who === g.forceWith))) continue;
    const sv = surveysOf(s).find(x => x.id === g.survey); if (!sv || !sv.result) { g.saidAt = now; continue; }
    g.saidAt = now; const r = sv.result, o = sv.options[r.winner];
    ev.commentary = [...(ev.commentary || []), { who: "zohar", say: sv.kind === "join" ? `Say hello to ${o.label}. ${svPct(r, r.winner)}% of you voted for them to join the show, and here they are.`
      : `Remember the survey? ${svPct(r, r.winner)}% of you wanted ${surveyName(s, sv.about)} to take Ishai to ${o.label}. Here we go.` }];
  }
  s.surveySay = (s.surveySay || []).filter(x => now - x.at < 18 * 3600000);
  if (s.surveySay.length && ev.action !== "sleeping" && (ev.commentary || []).length < 2) { const x = s.surveySay.shift(); ev.commentary = [...(ev.commentary || []), { who: x.who, say: x.say }]; }
}
// live results for everyone, counted at most once a minute per isolate
let surveyLive = { at: 0, by: {} };
async function surveyCounts(env, list) {
  if (Date.now() - surveyLive.at > 60000 && list.length) {
    const { results } = await env.DB.prepare(`SELECT survey, opt, COUNT(*) AS n FROM survey_votes WHERE survey IN (${list.map(() => "?").join(",")}) GROUP BY survey, opt`).bind(...list.map(x => x.id)).all();
    const by = {}; (results || []).forEach(r => { (by[r.survey] = by[r.survey] || {})[r.opt] = Number(r.n); }); surveyLive = { at: Date.now(), by };
  }
  return surveyLive.by;
}
const surveyShown = (s, now) => surveysOf(s).filter(x => now >= x.opensAt && x.closesAt > now - SURVEY_KEEP_D * 86400000 && (x.options.length || x.suggestUntil))
  .sort((a, b) => (b.week > a.week) - (b.week < a.week) || SURVEY_ORDER.indexOf(a.kind) - SURVEY_ORDER.indexOf(b.kind));
async function surveysApi(req, env) {
  if (!env.DB || !env.GOOGLE_CLIENT_ID) return json({ surveys: [], off: true }, { "cache-control": "no-store" });
  await surveyTables(env);
  const s = await loadState(env), now = Date.now(), list = surveyShown(s, now), voter = await voterOf(req, env), live = await surveyCounts(env, list.filter(x => !x.result));
  const mine = {}, sent = {};
  if (voter && list.length) {
    const ids = list.map(x => x.id), q = ids.map(() => "?").join(",");
    ((await env.DB.prepare(`SELECT survey, opt FROM survey_votes WHERE voter = ? AND survey IN (${q})`).bind(voter, ...ids).all()).results || []).forEach(r => mine[r.survey] = Number(r.opt));
    ((await env.DB.prepare(`SELECT survey, COUNT(*) AS n FROM suggestions WHERE voter = ? AND survey IN (${q}) GROUP BY survey`).bind(voter, ...ids).all()).results || []).forEach(r => sent[r.survey] = Number(r.n));
  }
  return json({ signedIn: !!voter, surveys: list.map(sv => {
    const phase = svPhase(sv, now), r = sv.result || (() => { const c = live[sv.id] || {}, counts = sv.options.map((_, i) => c[i] || 0); return { counts, total: counts.reduce((a, b) => a + b, 0), winner: null }; })();
    return { id: sv.id, kind: sv.kind, question: sv.question, options: sv.options.map(o => o.label), phase, opensAt: sv.opensAt, closesAt: sv.closesAt, suggestUntil: sv.suggestUntil,
      counts: r.counts, total: r.total, winner: sv.result ? r.winner : null, linked: !!sv.linked, mine: mine[sv.id] ?? null, sent: sent[sv.id] || 0, maxSent: SUGGEST_MAX };
  }) }, { "cache-control": "no-store" });
}
async function surveyVote(req, env) {
  if (!env.DB || !env.GOOGLE_CLIENT_ID) return json({ error: "surveys are not set up" }, {}, 503);
  const voter = await voterOf(req, env); if (!voter) return json({ error: "please sign in to vote", signIn: true }, {}, 401);
  await surveyTables(env);
  const b = await req.json().catch(() => ({})), s = await loadState(env), now = Date.now(), sv = surveysOf(s).find(x => x.id === b.id);
  if (!sv || svPhase(sv, now) !== "open") return json({ error: "this survey is not open" }, {}, 409);
  const opt = Number(b.opt); if (!Number.isInteger(opt) || opt < 0 || opt >= sv.options.length) return json({ error: "no such option" }, {}, 400);
  const r = await env.DB.prepare("INSERT OR IGNORE INTO survey_votes (survey, voter, opt, at) VALUES (?, ?, ?, ?)").bind(sv.id, voter, opt, now).run();
  surveyLive.at = 0;
  const mine = r.meta.changes === 1 ? opt : await env.DB.prepare("SELECT opt FROM survey_votes WHERE survey = ? AND voter = ?").bind(sv.id, voter).first("opt");
  return json({ ok: true, counted: r.meta.changes === 1, mine }, { "cache-control": "no-store" });
}
const SUGGEST_BAD = /https?:|www\.|@|\.(com|net|org|io|co|il|ly|me|app)\b|\d{5,}|<|>/i;
async function surveySuggest(req, env) {
  if (!env.DB || !env.GOOGLE_CLIENT_ID) return json({ error: "surveys are not set up" }, {}, 503);
  const voter = await voterOf(req, env); if (!voter) return json({ error: "please sign in to suggest", signIn: true }, {}, 401);
  await surveyTables(env);
  const b = await req.json().catch(() => ({})), s = await loadState(env), now = Date.now(), sv = surveysOf(s).find(x => x.id === b.id);
  if (!sv || svPhase(sv, now) !== "suggest") return json({ error: "suggestions for this survey are closed" }, {}, 409);
  const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n), a = str(b.a, 40), bb = str(b.b, 140), c = str(b.c, 60);
  if (a.length < 2) return json({ error: sv.kind === "join" ? "give them a name" : "name the place" }, {}, 400);
  if (SUGGEST_BAD.test(a + " " + bb + " " + c)) return json({ error: "no links, emails or numbers, please" }, {}, 400);
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE survey = ? AND voter = ?").bind(sv.id, voter).first("n");
  if (n >= SUGGEST_MAX) return json({ error: `you have sent your ${SUGGEST_MAX} suggestions for this one` }, {}, 429);
  await env.DB.prepare("INSERT INTO suggestions (survey, voter, a, b, c, at) VALUES (?, ?, ?, ?, ?, ?)").bind(sv.id, voter, a, bb || null, c || null, now).run();
  return json({ ok: true, sent: n + 1 }, { "cache-control": "no-store" });
}
// the director page: the surveys with live counts and, for join/place, the suggestions grouped by name
async function surveyDirector(env, s) {
  if (!env.DB) return { off: true, list: [] };
  try { await surveyTables(env); } catch (e) { return { err: String(e.message || e), list: [] }; }
  const now = Date.now(), list = surveysOf(s).filter(x => x.closesAt > now - SURVEY_KEEP_D * 86400000), live = await surveyCounts(env, list.filter(x => !x.result)).catch(() => ({}));
  const out = [];
  for (const sv of list) {
    let sug = null;
    if (sv.suggestUntil) sug = ((await env.DB.prepare("SELECT a, MIN(b) AS b, MIN(c) AS c, COUNT(*) AS n FROM suggestions WHERE survey = ? GROUP BY lower(a) ORDER BY n DESC, MIN(at) LIMIT 80").bind(sv.id).all()).results || []);
    const counts = sv.result ? sv.result.counts : sv.options.map((_, i) => (live[sv.id] || {})[i] || 0);
    out.push({ ...sv, phase: svPhase(sv, now), counts, total: counts.reduce((a, b) => a + b, 0), suggestions: sug, aboutName: sv.about ? surveyName(s, sv.about) : null });
  }
  return { off: !env.GOOGLE_CLIENT_ID || !!s.surveysOff, list: out, cast: Object.values(s.cast).map(c => ({ id: c.id, name: c.name })), places: Object.keys(LOCATIONS).filter(k => !["offscreen", "bus", "taxi", "apartment", "corridor"].includes(k)) };
}
async function surveyAction(env, s, b, now) {
  const sv = surveysOf(s).find(x => x.id === b.id);
  if (b.action === "surveysOff") { s.surveysOff = !!b.off; return null; }
  if (!sv) return "no such survey";
  if (b.action === "surveyShortlist") {
    if (!sv.suggestUntil) return "this survey has no shortlist";
    if (sv.shortlisted) return "the shortlist is already published (votes are final)";
    const opts = (Array.isArray(b.options) ? b.options : []).map(x => String(x || "").replace(/\s+/g, " ").trim().slice(0, 60)).filter(Boolean).slice(0, 6);
    if (opts.length < 2) return "a shortlist needs 2 to 6 options";
    sv.options = opts.map(label => ({ label, ref: null })); sv.shortlisted = true; sv.suggestUntil = Math.min(sv.suggestUntil, now);
    return null;
  }
  if (b.action === "surveyLink") {
    if (!sv.result || sv.result.winner == null) return "link the winner after the survey closes";
    const ref = String(b.ref || "").toLowerCase();
    if (sv.kind === "join" && !s.cast[ref]) return "that character is not in the cast yet (add it to SEED_CAST first)";
    if (sv.kind === "place" && !LOCATIONS[ref]) return "that place is not on the map yet";
    if (!["join", "place"].includes(sv.kind)) return "only the join and place surveys are linked";
    sv.linked = ref; sv.goal = null; return null;
  }
  return "unknown survey action";
}

// ---------- director ----------
// ---------- The Pump House: one event a week (docs/ARENA_PLAN.md) ----------
// Wednesdays at 20:00. Until the director adds events, every week is a gallery night: pictures from picsum.photos (seeded, the same for everyone),
// drawn as 8-bit pixels in the page, hung together in sets on temporary white walls, with a curtain between sets and one big main piece last.
// The whole night is a planned beat played as written (no AI): the plaza at doors, the sets, the curtain, the main piece, the walk out.
const ARENA_DAY = 3, ARENA_H = 20, ARENA_MIN = 45, ARENA_AHEAD = 6 * 86400000;
const PANELS = [{ x: 8, y: 22, w: 52, h: 40 }, { x: 68, y: 22, w: 52, h: 40 }, { x: 128, y: 22, w: 46, h: 40 }];   // the temporary walls in the hall (logical px)
const MAIN_WALL = { x: 14, y: 18, w: 160, h: 46 };
const ART_SIZES = [[16, 12], [12, 16], [20, 14], [14, 20], [24, 18], [18, 24], [28, 20]];
const seedRng = str => { let h = 1779033703 ^ String(str).length; for (const ch of String(str)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; };
const pickR = (r, a) => a[Math.floor(r() * a.length)];
const dayOfTZ = ms => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ms));
function nextArenaAt(s, now) {
  for (let k = 0; k < 15; k++) {
    const day = dayOfTZ(now + k * 86400000), [y, m, d] = day.split("-").map(Number);
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== ARENA_DAY || (s.world?.holidays || []).some(h => h.date === day)) continue;
    const u = Date.UTC(y, m - 1, d, ARENA_H), t = u - tzOffset(u);
    if (t + 120 * 60000 > now) return t;     // tonight's stays "next" until it is over
  }
  return null;
}
// lay pieces out on walls: rows, biggest first, 4 px apart, each row centred, the block centred on the wall. Returns {placed, rest}.
function hangSet(pieces, walls) {
  const left = [...pieces].sort((a, b) => b.w * b.h - a.w * a.h), placed = [];
  for (const wall of walls) {
    const rows = []; let used = 0;
    while (left.length) {
      const row = []; let w = 0, h = 0;
      for (let i = 0; i < left.length; i++) { const p = left[i], nw = w + (row.length ? 4 : 0) + p.w;
        if (nw <= wall.w - 4 && used + Math.max(h, p.h) + (rows.length ? 5 : 0) <= wall.h - 4) { row.push(p); w = nw; h = Math.max(h, p.h); left.splice(i--, 1); } }
      if (!row.length) break;
      rows.push({ row, w, h }); used += h + (rows.length > 1 ? 5 : 0);
    }
    let y = wall.y + Math.floor((wall.h - used) / 2);
    rows.forEach(({ row, w, h }) => { let x = wall.x + Math.floor((wall.w - w) / 2);
      row.forEach(p => { placed.push({ ...p, x, y: y + Math.floor((h - p.h) / 2) }); x += p.w + 4; }); y += h + 5; });
  }
  return { placed, rest: left };
}
const ART_ADJ = ["Small", "Quiet", "Borrowed", "Slow", "Second", "Late", "Paper", "Folded", "Low", "Open", "Distant", "Patient"];
const ART_NOUN = ["Weather", "Rooms", "Machines", "Hours", "Distances", "Windows", "Roads", "Gardens", "Signals", "Tides", "Neighbours", "Afternoons"];
const ART_FIRST = ["Noga", "Itamar", "Shira", "Yoav", "Maya", "Amit", "Tamar", "Eyal", "Liat", "Omer", "Hila", "Gal", "Roni", "Adi"];
const ART_LAST = ["Bar-Lev", "Sagi", "Kaspi", "Navon", "Ezra", "Lavi", "Dagan", "Shefer", "Rimon", "Harel", "Tzur", "Amir"];
const PIECE_TITLES = ["Blue Hour", "Window, Afternoon", "The Long Road", "Somebody's Garden", "Harbour", "Untitled (Green)", "Untitled (Warm)", "Tuesday", "Field Notes",
  "Morning Again", "Low Tide", "The Neighbour's Light", "Static", "Far Away, Close", "Sunday Road", "Grey Study", "Half a Tree", "Return Trip", "Heat", "Still Water",
  "Before the Rain", "A Door Left Open", "Small Mountain", "Leftover Light", "The Crossing", "Noon", "Second Floor", "What the Bus Saw"];
const GALLERY_FRIENDS = ["noa", "tomer"];
// a gallery night for that date: everything comes from the date, so it is the same however often it is built
function galleryNight(s, date, at) {
  const r = seedRng("gallery-" + date), title = `${pickR(r, ART_ADJ)} ${pickR(r, ART_NOUN)}`, artist = `${pickR(r, ART_FIRST)} ${pickR(r, ART_LAST)}`;
  const friends = GALLERY_FRIENDS.filter(id => s.cast[id]), companion = r() < .75 && friends.length ? pickR(r, friends) : null;
  const moments = Math.max(3, Math.min(15, Math.round(ARENA_MIN / INTERVAL_MIN)));   // inside the hall, one per tick
  const nSets = Math.max(1, Math.floor((moments - 1) / 3)), titles = [...PIECE_TITLES]; let n = 0;
  const piece = (w, h) => { const i = Math.floor(r() * titles.length), t = titles.splice(i, 1)[0] || `Study #${n + 1}`; n++; return { seed: `pump-${date}-${n}`, w, h, title: t }; };
  const sets = [];
  for (let k = 0; k < nSets; k++) {
    const cand = []; for (let i = 0; i < 9; i++) { const [w, h] = pickR(r, ART_SIZES); cand.push(piece(w, h)); }
    const { placed } = hangSet(cand, PANELS); sets.push({ pieces: placed.slice(0, 8) });
  }
  sets.push({ main: true, pieces: hangSet([{ ...piece(80, 40), title }], [MAIN_WALL]).placed });
  return { id: "pump-" + date, date, kind: "gallery", at, minutes: ARENA_MIN, title, artist, companion, sets, source: "picsum.photos (open photographs, seeded), pixelated in the page" };
}
// ---- what is said: written pools, picked by the night's seed (no AI) ----
const G_DOORS = ["Doors are open. Tickets on your phone, or tell me your name and I'll pretend to find it.", "Welcome, welcome. Mind the step, it's older than both of us.",
  "Come in, it's warmer inside. The pipes still remember how to hold heat.", "Evening. First time at the Pump House? Then it's a first time for both of us."];
const G_WELCOME = ["Welcome to the Pump House. Tonight: {artist}, \"{title}\".", "Good evening, and thank you for coming. {artist}. \"{title}\". Take your time.",
  "Welcome. This building moved the neighbourhood's water for ninety years. Tonight it moves pictures: {artist}, \"{title}\"."];
const G_ABOUT = ["{artist} takes photographs from an open collection and translates them into pixels. One decision per square.", "Nothing here is bigger than it needs to be. That was the rule {artist} gave me.",
  "Look first, read the little cards after. {artist} insisted on that order.", "Every picture here started as somebody else's photograph. Now it's a few hundred coloured squares and a lot of patience."];
const G_PIECE = ["This one is \"{p}\".", "\"{p}\". Stand back a step. It works better from here.", "Here, \"{p}\". {artist} redid the edges of this one four times.",
  "\"{p}\". People always stop at this one. I don't know why, and I've stopped asking.", "This is \"{p}\". Count the colours. Fewer than you think.",
  "\"{p}\". It was almost left out. I'm glad it wasn't.", "\"{p}\". Tell me what you see first. There are no wrong answers, only slow ones."];
const ISHAI_ART = ["I don't know what it is, but I don't want to stop looking at it.", "I think it's a road. Or a river. Something that goes somewhere.", "It's so few squares. How is it this calm?",
  "I keep seeing a window in it. Is that just me?", "It looks like the end of a long day.", "From over here it changes. Come stand here.", "I'd hang that one over my desk. Moshe would approve.",
  "I like that it doesn't explain itself.", "It feels like a place I've been, but I can't say where.", "The colours are arguing a little. In a good way.",
  "It's simple. I mean that as a compliment. I think.", "I could stand here a while.", "That one looks like how Sunday mornings feel.", "If I squint, it's a whole city.",
  "Is it bad that I want to touch it?", "It's quiet. The whole picture is quiet.", "It's smaller than I expected. And bigger.", "I'm going to pretend I understand it, and nod."];
const FRIEND_ART = {
  noa: ["Ishush, you're nodding like you understand it.", "I'd tattoo that. Small. On an ankle.", "Okay, that one's good. Don't tell anyone I said so.", "You're standing too close. You always stand too close.",
    "This is what you should be charging for, by the way. Not chickpeas.", "It looks like the view from your window. Minus the laundry.", "Fine. I like it. Happy?"],
  tomer: ["Habibi, I bet you twenty it's the sea.", "My cousin could do this. On a calculator.", "Wait, I take it back, that one's nice.", "How many squares is that? I'm counting. Don't talk to me.",
    "If this is a road, the electrics on that lamp are wrong.", "I'd put that in a bar. A good bar.", "Okay, I'm not going to lie. I like this place."],
  any: ["I see a garden. You?", "That one's my favourite so far.", "It's like a memory with the details missing.", "I didn't expect to like this so much.",
    "Look at the blue in that one.", "Do you think they sell postcards?", "I could look at this for an hour."] };
const G_CURTAIN = ["We'll close the curtain for a few minutes while the walls change. Drinks are by the door.", "Second room, same artist, different mood. Give us five minutes.",
  "Curtain, please. Nobody peek. I can hear you peeking.", "A short break while we hang the next set. The pipes will entertain you."];
// small talk while the walls change: Ishai says something, the friend answers that (alone, he talks to Hagit or to himself)
const CURTAIN_TALK = [
  ["What do you think they're doing back there?", { noa: "Hanging things crooked so we argue about it.", tomer: "Moving walls. I could do it in half the time.", any: "Probably the next set. I'm excited." }],
  ["I'm getting one of those drinks. You want one?", { noa: "Whatever's cold. And don't apologise to the bartender.", tomer: "Two. One for me, one also for me.", any: "Sure, thanks." }],
  ["I've been here twenty minutes and I already want to come back.", { noa: "Admit it, you're having a good time.", tomer: "Next week I'm bringing my cousin. The calculator one.", any: "Me too." }],
  ["This used to pump water. Now it pumps... this. It's a good upgrade.", { noa: "Write that down. Sell it to Gadi.", tomer: "The pipes are original, you know. Look at those joints.", any: "Ha. It really is." }],
  ["Do you think the artist is here? Somewhere, watching people squint?", { noa: "That's the guy by the door pretending to read his phone. Definitely.", tomer: "If they are, I want to shake their hand. Then ask about the lamp.", any: "I hope so. I'd say thank you." }]];
const ALONE_CURTAIN = ["Do you get many people on a Wednesday?", "Is it always this quiet before the curtain goes up?", "Can I ask how you find the artists?"];
const HAGIT_ALONE = ["Tonight, you're one of the many. Enjoy it.", "Never quiet for long. Drink some water, it's free.", "They find me. Usually they knock on the chimney."];
const G_MAIN = ["And the last one gets the whole wall. \"{p}\".", "Last piece. {artist} asked for one wall, one picture, and nothing next to it. \"{p}\".",
  "\"{p}\". This is the one the whole night was built around."];
const G_BYE = ["That's the night. Thank you for coming. Next Wednesday, same time, the doors will open again.", "Thank you, everyone. Tell one person about this place. Just one. That's how it grows.",
  "Thank you. The Pump House is open again next Wednesday. Bring someone who says they don't like art."];
const G_HOSTS = ["A gallery night at the Pump House. Our man, in culture, voluntarily.", "Look at him looking at art. Thoughtful. Possibly hungry.", "Hagit runs this place on stubbornness and good lighting.",
  "Every picture here started as somebody's photo, and became a few hundred squares. Like our show.", "He's standing very close to that one. Hagit has noticed.",
  "The curtain is down, the walls are changing. Theatre for art people.", "One wall, one picture. Very dramatic. We approve.", "He's nodding. He's definitely nodding.",
  "Water used to run through these pipes. Now it's just opinions.", "The art is quiet. The audience is quieter."];
function galleryMoments(ev, s) {
  const r = seedRng("talk-" + ev.date), f = ev.companion && s.cast[ev.companion] ? ev.companion : null, fw = FRIEND_ART[f] || FRIEND_ART.any;
  const fill = t => t.replace(/\{artist\}/g, ev.artist).replace(/\{title\}/g, ev.title);
  const bag = a => { const pool = [...a]; return () => { if (!pool.length) pool.push(...a); return pool.splice(Math.floor(r() * pool.length), 1)[0]; }; };
  const ishaiL = bag(ISHAI_ART), friendL = bag(fw), pieceL = bag(G_PIECE), hostL = bag(G_HOSTS);
  const L = (who, say, piece) => piece == null ? { who, say: fill(say).slice(0, 200) } : { who, say: fill(say).slice(0, 200), piece };
  const talk = bag(CURTAIN_TALK), alone = bag([0, 1, 2]);
  const curtainLines = (first) => { const a = [L("hagit", first || pickR(r, G_CURTAIN))];
    if (f) { const [say, rep] = talk(); a.push(L("ishai", say), L(f, rep[f] || rep.any)); } else { const k = alone(); a.push(L("ishai", ALONE_CURTAIN[k]), L("hagit", HAGIT_ALONE[k])); } return a; };
  const host = (i) => i % 2 === 0 ? [{ who: i % 4 ? "oren" : "zohar", say: hostL() }] : [];
  const out = [], art = (o) => ({ ev: ev.id, ...o }), sets = ev.sets.filter(x => !x.main), main = ev.sets.find(x => x.main);
  out.push({ location: "plaza", action: "idle", with: f, text: `Doors at the Pump House: a short queue on the plaza; Hagit checks names at the door.${f ? ` ${s.cast[f].name} meets Ishai there.` : ""}`,
    art: art({ queue: true }), lines: [L("hagit", pickR(r, G_DOORS)), ...(f ? [L("ishai", "You came! I thought you'd say art isn't your thing."), L(f, f === "noa" ? "It isn't. You are. Move, the line's going." : "I'm here for the free drinks, habibi. Go, go.")] : [L("ishai", "Thanks. Is it... am I early?")]),
      ...(f ? [] : [L("hagit", "You're exactly on time. That makes you rare.")])], commentary: [{ who: "zohar", say: "The Pump House opens its doors, and he's in the queue. Nobody made him." }] });
  sets.forEach((set, k) => {
    if (k) out.push({ location: "arena", action: "gallery", with: f, text: "The curtain comes down while the walls are changed; people get drinks and talk.", art: art({ set: k, curtain: true }),
      lines: curtainLines(), commentary: host(out.length) });
    const ps = set.pieces.map((_, i) => i), half = Math.ceil(ps.length / 2);
    [ps.slice(0, half), ps.slice(half)].forEach((part, j) => {
      if (!part.length) return;
      const lines = [];
      if (k === 0 && j === 0) { lines.push(L("hagit", pickR(r, G_WELCOME)), L("hagit", pickR(r, G_ABOUT))); }
      part.forEach((p, i) => { const pt = set.pieces[p].title;
        if (i % 2 === 0) lines.push(L("hagit", pieceL().replace(/\{p\}/g, pt), p));
        lines.push(L("ishai", ishaiL(), p)); if (f && r() < .8) lines.push(L(f, friendL(), p)); });
      out.push({ location: "arena", action: "gallery", with: f, text: `Gallery night: Ishai${f ? " and " + s.cast[f].name : ""} browse the ${k ? "next" : "first"} set of ${ev.artist}'s pixel pictures.`,
        art: art({ set: k }), lines: lines.slice(0, 14), commentary: host(out.length) });
    });
  });
  const mk = ev.sets.indexOf(main), mt = main.pieces[0].title;
  out.push({ location: "arena", action: "gallery", with: f, text: "The curtain comes down one last time.", art: art({ set: mk, curtain: true }),
    lines: curtainLines("One more change, the last one. This one takes the whole wall."), commentary: [] });
  out.push({ location: "arena", action: "gallery", with: f, text: `The last piece fills the whole wall, under a spotlight: "${mt}". Hagit thanks everyone.`, art: art({ set: mk }),
    lines: [L("hagit", pickR(r, G_MAIN).replace(/\{p\}/g, mt), 0), L("ishai", ishaiL(), 0), ...(f ? [L(f, friendL(), 0)] : []), L("ishai", ishaiL(), 0), L("hagit", pickR(r, G_BYE))],
    commentary: [{ who: "oren", say: hostL() }] });
  out.push({ location: "plaza", action: "walking", with: f, text: `Ishai${f ? " and " + s.cast[f].name : ""} step out of the Pump House into the night, talking about the pictures.`, art: art({ after: true }),
    lines: [L("ishai", "I didn't think I'd like that so much."), ...(f ? [L(f, f === "noa" ? "You stood in front of the big one for five minutes, Ishush." : "Same time next week, habibi? I'm serious.")] : [])],
    commentary: [], update: f ? { memory: `Went with Ishai to a gallery night at the Pump House (${ev.artist}, "${ev.title}"); he loved it.`, mood: 1 } : undefined });
  return out;
}
function arenaOf(s) { return s.arena || (s.arena = { events: {}, err: null }); }
function scheduleArena(s, ev, now) {
  const moments = ev.kind === "gallery" ? galleryMoments(ev, s) : ev.kind === "concert" ? concertMoments(ev, s) : null; if (!moments) return;
  if (ev.kind === "concert") ev.fav = moments[moments.length - 1].fav;
  const id = ev.id, t = ev.at, f = ev.companion && s.cast[ev.companion] ? s.cast[ev.companion] : null;
  const g = newGoal({ id, goal: ev.kind === "concert" ? `Ishai goes to see ${ev.artist} play at the Pump House.` : `Ishai goes to the Pump House for its gallery night: ${ev.artist}, "${ev.title}".`, startAt: new Date(t - 55 * 60000).toISOString(),
    sceneAt: new Date(t - 9 * 60000).toISOString(), deadlineAt: new Date(t + 10 * 60000).toISOString(), location: "plaza", with: f ? f.name : null, forceWith: f ? f.id : null }, now);
  g.id = id; g.fixed = true; g.script = cleanScript(moments, 40); s.director = s.director.filter(d => d.id !== id || d.status !== "done"); s.director.push(g); ev.goalId = id;
}
function arenaTick(s, now) {
  const a = arenaOf(s), t = nextArenaAt(s, now); if (!t) return;
  for (const d of Object.keys(a.events)) if (Date.parse(d) < now - 8 * 86400000) delete a.events[d];
  const date = dayOfTZ(t);
  const custom = (a.custom || {})[date];
  if (!a.events[date] && t - now < ARENA_AHEAD && !a.off) a.events[date] = (custom && concertNight(s, date, t, custom)) || galleryNight(s, date, t);
  for (const e of Object.values(a.events)) { const g = e.goalId && !e.remembered && s.director.find(d => d.id === e.goalId);
    if (g && g.status === "done") { e.remembered = true; const f = e.companion && s.cast[e.companion];
      addLife(s, now, e.kind, e.kind === "gallery" ? `Went to the gallery night at the Pump House${f ? " with " + f.name : ""}: ${e.artist}, "${e.title}". The big picture at the end stayed with him; it was great.` : `Saw ${e.artist} play at the Pump House${f ? " with " + f.name : ""}. "${e.fav || e.title}" was great; he still has it in his head.`); } }
  const ev = a.events[date]; if (ev && !ev.goalId && !ev.skip && t - now < 30 * 3600000 && t - 50 * 60000 > now) scheduleArena(s, ev, now);
}
const arenaNext = (s, now) => { const a = s.arena; if (!a) return null; const t = nextArenaAt(s, now); return t ? a.events[dayOfTZ(t)] || null : null; };
function arenaPublic(s, now) {
  const ev = arenaNext(s, now); if (!ev || ev.skip) return null;
  const today = dayOfTZ(now) === ev.date;
  const end = ev.at + (ev.kind === "concert" ? ev.endT + 15 * 60000 : (ev.minutes + 25) * 60000);
  return { board: [today ? "TODAY" : "WED", "20.00", ev.kind === "gallery" ? "ART" : "LIVE"], screen: `${ev.title.toUpperCase()}   ${ev.artist.toUpperCase()}`, live: now >= ev.at - 12 * 60000 && now < end,
    event: ev.kind === "concert" ? { id: ev.id, date: ev.date, kind: ev.kind, at: ev.at, title: ev.title, artist: ev.artist,
      band: ev.band ? { ...ev.band, links: cleanLinks((s.bands && ev.band.id && s.bands[ev.band.id] || {}).links) } : ev.band, songs: ev.songs, talk: ev.talk, endT: ev.endT }
      : { id: ev.id, date: ev.date, kind: ev.kind, at: ev.at, title: ev.title, artist: ev.artist, sets: ev.sets } };
}
const arenaHealth = s => { const a = s.arena; if (!a) return null; return { events: Object.values(a.events).map(e => ({ id: e.id, kind: e.kind, title: e.title, artist: e.artist, companion: e.companion, goal: e.goalId || null, skip: !!e.skip })), off: !!a.off, err: a.err }; };
// ---------- Poker night at Boaz's (apt 2, first floor): every second Monday at 20:00 (docs/POKER_PLAN.md) ----------
// The whole game is simulated ahead from the date's seed, a few hands per tick (the free plan allows ~10 ms of CPU a run), then stored once in KV
// (poker:<date>) and served by /api/poker. The page plays it by the clock: cards, chips, talk, the pizza. No AI.
const POKER_FIRST = "2026-11-23", POKER_H = 20, POKER_LEN_MIN = 150, POKER_HANDS_PER_TICK = 12, POKER_BUYIN = 500, POKER_SB = 5, POKER_BB = 10;
const POKER_SEATS = ["yossi", "ronit", "ishai", "boaz", "moti"];   // left to right at the table; Ishai in the middle, facing the camera
const POKER_STYLE = {   // play: least preflop score to play; raise: to raise first; aggr, bluff, callDown, tilt, skill: 0..1
  boaz:  { play: .55, raise: .70, aggr: .35, bluff: .03, callDown: .30, tilt: 0,   skill: .70, think: 0 },
  ronit: { play: .48, raise: .58, aggr: .70, bluff: .12, callDown: .35, tilt: .10, skill: .90, think: 0, adapt: true },
  moti:  { play: .28, raise: .88, aggr: .12, bluff: .02, callDown: .85, tilt: 0,   skill: .40, think: 1800 },
  yossi: { play: .40, raise: .45, aggr: .85, bluff: .25, callDown: .50, tilt: .60, skill: .45, think: -700, suited: true },
  ishai: { play: .45, raise: .62, aggr: .20, bluff: .04, callDown: .40, tilt: .05, skill: .75, think: 400, timid: true }
};
const P_NAME = { boaz: "Boaz", ronit: "Ronit", moti: "Moti", yossi: "Yossi", ishai: "Ishai" };
const RANKS = "23456789TJQKA", RANK_WORD = ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "jack", "queen", "king", "ace"];
const CAT_NAME = ["high card", "a pair", "two pair", "three of a kind", "a straight", "a flush", "a full house", "four of a kind", "a straight flush"];
// best five of up to seven cards (0..51: rank = c >> 2, suit = c & 3) as one comparable number; Math.floor(v / 13 ** 5) is the category
function handValue(cs) {
  const rc = new Array(13).fill(0), sc = [0, 0, 0, 0], sb = [0, 0, 0, 0]; let m = 0;
  for (const c of cs) { const r = c >> 2, s = c & 3; rc[r]++; sc[s]++; sb[s] |= 1 << r; m |= 1 << r; }
  const top = bits => { const b = (bits << 1) | ((bits >> 12) & 1); for (let h = 13; h >= 4; h--) if (((b >> (h - 4)) & 31) === 31) return h - 1; return -1; };
  const val = (cat, ks) => { let v = cat; for (let i = 0; i < 5; i++) v = v * 13 + (ks[i] || 0); return v; };
  const fs = sc.findIndex(n => n >= 5);
  if (fs >= 0) { const sf = top(sb[fs]); if (sf >= 0) return val(8, [sf]); }
  const by = n => { const a = []; for (let r = 12; r >= 0; r--) if (rc[r] === n) a.push(r); return a; };
  const q = by(4), t = by(3), p = by(2), single = by(1);
  if (q.length) return val(7, [q[0], Math.max(...[...t, ...p, ...single].filter(r => r !== q[0]))]);
  if (t.length && (t.length > 1 || p.length)) return val(6, [t[0], t.length > 1 ? t[1] : p[0]]);
  if (fs >= 0) { const a = []; for (let r = 12; r >= 0 && a.length < 5; r--) if (sb[fs] >> r & 1) a.push(r); return val(5, a); }
  const st = top(m); if (st >= 0) return val(4, [st]);
  if (t.length) return val(3, [t[0], ...single.slice(0, 2)]);
  if (p.length > 1) return val(2, [p[0], p[1], Math.max(...[...p.slice(2), ...single], 0)]);
  if (p.length) return val(1, [p[0], ...single.slice(0, 3)]);
  return val(0, single.slice(0, 5));
}
const catOf = v => Math.floor(v / 371293);
const cardName = c => RANKS[c >> 2] + "shdc"[c & 3];
function holeWords(h) {   // "two kings", "ace-queen suited"
  const [a, b] = [h[0] >> 2, h[1] >> 2].sort((x, y) => y - x), s = (h[0] & 3) === (h[1] & 3);
  return a === b ? `two ${RANK_WORD[a]}${a === 4 ? "es" : "s"}` : `${RANK_WORD[a]}-${RANK_WORD[b]}${s ? " suited" : ""}`;
}
function preScore(h) {
  const a = h[0] >> 2, b = h[1] >> 2, hi = Math.max(a, b), lo = Math.min(a, b), suited = (h[0] & 3) === (h[1] & 3);
  if (a === b) return Math.min(1, .5 + hi / 24);
  return Math.min(1, hi / 12 * .45 + lo / 12 * .2 + (suited ? .08 : 0) + (hi - lo === 1 ? .06 : hi - lo === 2 ? .03 : 0));
}
// how good a hand is after the flop, 0..1, from what it makes and what it could make (cheap: no simulations)
function postScore(h, board) {
  const v = handValue([...h, ...board]), cat = catOf(v), bv = board.length >= 5 ? handValue(board) : null, bcat = board.length ? catOf(handValue(board)) : 0;
  const hi = Math.max(...board.map(c => c >> 2));
  let s;
  if (cat >= 1 && cat === bcat && (bv === null || bv === v || cat <= 2)) s = cat === 1 ? .22 : cat === 2 ? .3 : .45;   // it's all on the board
  else if (cat === 0) s = .06 + ((h[0] >> 2) > hi ? .05 : 0) + ((h[1] >> 2) > hi ? .05 : 0);
  else if (cat === 1) { const pr = Math.floor(v / 28561) % 13, pocket = (h[0] >> 2) === (h[1] >> 2);
    s = pocket && pr > hi ? .62 : pr >= hi ? .52 + Math.max(h[0] >> 2, h[1] >> 2) / 120 : pr >= hi - 3 ? .4 : .3; }
  else s = [0, 0, .7, .8, .86, .88, .95, .99, 1][cat];
  if (board.length < 5) {   // draws
    const all = [...h, ...board], sc = [0, 0, 0, 0]; all.forEach(c => sc[c & 3]++);
    if (cat < 5 && sc.some(n => n === 4)) s += .16;
    let m = 0; all.forEach(c => { m |= 1 << (c >> 2); }); m = (m << 1) | ((m >> 12) & 1);
    if (cat < 4) for (let k = 0; k <= 10; k++) if (((m >> k) & 15) === 15) { s += .1; break; }
  }
  return Math.min(1, s);
}
// ---- talk (written pools; picked by the seed) ----
const POKER_TALK = {
  boaz: { raise: ["Raise. Exact change only.", "I'll make it {amt}.", "Doors closing. Raise."], allin: ["All of it. Last stop.", "Everything. I don't do this often."],
    win: ["The house thanks you.", "Next stop, my stack.", "Slow and steady. Like the 88 at rush hour."], lose: ["Fine. It's only money. Your money, next time.", "I was driving that hand very carefully. Into a wall."],
    fold: ["Not my bus.", "I'll wait for the next one."], bad: ["Unbelievable. On the river. On my own table."], rebuy: ["Bank's open. Again."] },
  ronit: { raise: ["Let's see who did their homework. {amt}.", "Raise. Show your working.", "{amt}. Wrong answers cost extra tonight."], allin: ["All in. Sit down, everyone.", "Everything. Prove me wrong."],
    win: ["Thank you, class.", "Correct answer, full marks.", "I told you. I always tell you."], lose: ["Well played. Don't let it go to your head.", "Lucky. Statistically, lucky."],
    fold: ["Not this one.", "I'll let you have it. This time."], bad: ["That's not maths, that's witchcraft."], rebuy: ["Fine. Again. Nobody say a word."], bluff: ["I had nothing. I had less than nothing."] },
  moti: { raise: ["Raise? Why not. Life is short, the elevator is shorter.", "I'll raise. My wife would call."], allin: ["All in! In 1987 I did this with a bus pass."],
    call: ["I call. I paid for the cards, I want to see them.", "Call. Always call. It's polite.", "I'm in. What is it, ten? I'm in."],
    win: ["Ha! You see? You see!", "The committee wins one!"], lose: ["Easy come. Mostly easy go.", "Ah. Again. Pass me the seeds."], fold: ["Fine, fine. I fold. Under protest."],
    bad: ["The river! The river always takes from Moti."], rebuy: ["Another fifty. Don't tell the committee."] },
  yossi: { raise: ["Raise. I feel it.", "Suited, so it's meant. {amt}.", "Don't touch my chips. Raise."], allin: ["All in! The cap says yes!", "Everything, habibi. Everything."],
    win: ["The cap! I told you about the cap!", "That's how it's done at the depot."], lose: ["Who touched my chips? Somebody touched my chips.", "That's it. Bad seat. This seat is cursed."],
    fold: ["Fold. For now. The cap is resting."], bad: ["No. No no no. On the river? Again?"], rebuy: ["Rebuy. This time for real.", "Another fifty. The cap needed a warm-up."] },
  ishai: { raise: ["Sorry. I'll, um, raise. {amt}.", "Sorry, raise. Is that okay? Raise.", "I'm going to... sorry. {amt}."], allin: ["Sorry. All in. Sorry."],
    call: ["I'll call. I think.", "Call. Yes. Call."], win: ["Oh. Sorry. That's mine? Sorry.", "Sorry. I really didn't mean to win that.", "Oh. Thanks. Sorry."],
    lose: ["Good hand. Really.", "Yeah, that's fair."], fold: ["Fold. Yeah. Fold.", "I'm out. Too rich for me."], bad: ["I had it. I had it, right?"], rebuy: ["I'll, um, buy back in. Fifty."] }
};
const POKER_SMALL = [   // two- or three-line exchanges between hands
  [["moti", "The elevator vote is on Thursday. I want all of you there."], ["boaz", "Moti, I live on the first floor."], ["moti", "It's about principle, Boaz."]],
  [["ronit", "Boaz copied my maths homework for two years."], ["boaz", "And you copied my chemistry. We both passed."]],
  [["yossi", "Who's dealing? Not you, Moti, you deal like a lottery machine."], ["moti", "I deal like a gentleman."]],
  [["ronit", "So, Ishai. What do you do?"], ["ishai", "Logos. Mostly chickpeas, lately."], ["ronit", "Chickpeas need logos?"]],
  [["boaz", "The 88 was late today because of a goat. A real goat."], ["yossi", "I fixed that bus. It's not the bus, it's the goat."]],
  [["moti", "You still owe the committee for the stair light, Ishai."], ["ishai", "I know. Sorry. Tomorrow."]],
  [["yossi", "Nobody touches my chips. It's a whole system."], ["ronit", "Your system has lost twice tonight."]],
  [["ronit", "You go quiet before you bet, Ishai. Very quiet."], ["ishai", "Do I? Sorry."]],
  [["boaz", "Falafel, stop looking at me like that."], ["ishai", "He does that. He wants the crust."]],
  [["moti", "In 1987 we played with matches. Real matches. Somebody lit one."], ["boaz", "Every time, Moti."]],
  [["yossi", "Lucky cap's been washed. That's the problem. Washed the luck out."], ["ronit", "Or it's the cards you play."]],
  [["boaz", "House rule: no phones at the table."], ["ishai", "Sorry. It's my client. He sends... sorry."]]
];
const POKER_PIZZA = { order: [["boaz", "Pizza. I'm ordering from ateBite. Two large."], ["moti", "Olives on one. I insist."], ["yossi", "Anything. Pizza is always lucky."], ["ronit", "Just get it here hot this time, Boaz."]],
  ring: [["boaz", "Pizza's here. Nobody look at my cards."], ["yossi", "Hands off the last slice, it's the lucky slice."]], end: [["moti", "There's one slice left. I'm not saying who it's for. It's for me."]] };
const POKER_HOSTS = {
  big: ["Viewers can see it: {cards}. And he's apologising already.", "He has {cards}. His face says he has a parking ticket.", "{cards} for our man. Somebody tell him that's good."],
  folded: ["He folded {cards}. Ronit had nothing. Oh, Ishai.", "{cards}, folded. He's being polite to the chips."],
  won: ["He won {amt} and said sorry twice.", "A pot for Ishai! He's handling it like a lost wallet he has to return."],
  lost: ["Ouch. He had {cards} and still lost {amt}.", "That one hurt. {amt} gone, and even the fish tank saw it."],
  any: ["Poker night downstairs. Pizza, seeds and a very nervous man.", "Ronit is watching him. Ronit is always watching him.", "Yossi's lucky cap is having an off night.",
    "Moti calls everything. It's a lifestyle.", "Boaz runs this table like a bus timetable."] };
// a new night: seats, styles, the seed. The game itself is simulated a few hands at a time by pokerSimStep().
function pokerNew(s, date, at) {
  const last = s.poker && s.poker.last, nights = (s.poker && s.poker.nights) || 0, style = JSON.parse(JSON.stringify(POKER_STYLE));
  style.ishai.aggr = Math.min(.55, style.ishai.aggr + nights * .04);   // he learns, a little each night
  return { id: "poker-" + date, date, at, nights, style, seats: POKER_SEATS, stacks: Object.fromEntries(POKER_SEATS.map(p => [p, POKER_BUYIN])),
    rebuys: Object.fromEntries(POKER_SEATS.map(p => [p, 0])), out: [], tilt: {}, btn: 0, n: 0, t: 3 * 60000, hands: [], talk: [], lastTalk: -1e9, lastSaid: {}, ishaiTell: 0, said: s.poker && s.poker.told ? { tell: true } : {}, done: false,
    pizzaAt: 40 * 60000, breakAt: 75 * 60000, endAt: POKER_LEN_MIN * 60000, results: null, last: last || null };   // times are from 20:00
}
// one hand of hold'em, with the timeline for the page. Mutates G.
function pokerHand(G) {
  const r = seedRng(`${G.id}-hand-${G.n}`), live = G.seats.filter(p => !G.out.includes(p));
  if (live.length < 2) { G.done = true; return; }
  // the pizza and the break: nobody deals for a few minutes
  if (!G.pizzaDone && G.t >= G.pizzaAt) { G.pizzaDone = true; const t0 = G.t; pokerSay(G, r, t0 + 4000, "ring", null, true); G.t += 4 * 60000; G.pizzaAt = t0; }
  if (!G.breakDone && G.t >= G.breakAt) { G.breakDone = true; G.breakAt = G.t; pokerSmall(G, r, G.t + 20000, true); G.t += 5 * 60000; }
  const deck = [...Array(52).keys()]; for (let i = 51; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  while (G.out.includes(G.seats[G.btn % 5])) G.btn++;
  const order = []; for (let k = 1; k <= 5; k++) { const p = G.seats[(G.btn + k) % 5]; if (!G.out.includes(p)) order.push(p); }   // small blind first
  const H = { n: G.n, t0: G.t, btn: G.seats[G.btn % 5], stacks0: { ...G.stacks }, holes: {}, board: [], acts: [], streets: [], show: null, win: [] };
  order.forEach(p => { H.holes[p] = [deck.pop(), deck.pop()]; });
  const board = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()]; H.board = board;
  const st = Object.fromEntries(order.map(p => [p, { tot: 0, cur: 0, folded: false, allin: false }]));
  let t = G.t + 22000, pot = 0;   // shuffle, deal, a sip, a joke
  const put = (p, amt) => { const a = Math.min(amt, G.stacks[p]); G.stacks[p] -= a; st[p].cur += a; st[p].tot += a; pot += a; if (!G.stacks[p]) st[p].allin = true; return a; };
  const heads = order.length === 2, sbP = heads ? order[order.length - 1] : order[0], bbP = heads ? order[0] : order[1];
  put(sbP, POKER_SB); put(bbP, POKER_BB);
  H.acts.push({ t: G.t + 17000, p: sbP, a: "sb", amt: POKER_SB, paid: POKER_SB, pot: POKER_SB }, { t: G.t + 18000, p: bbP, a: "bb", amt: POKER_BB, paid: POKER_BB, pot });
  if (!G.lastTalkHand || G.n - G.lastTalkHand > 3) if (r() < .45 && t - G.lastTalk > 50000) { pokerSmall(G, r, G.t + 2000); G.lastTalkHand = G.n; }
  const inHand = () => order.filter(p => !st[p].folded), canAct = () => order.filter(p => !st[p].folded && !st[p].allin);
  for (let street = 0; street < 4; street++) {
    const shown = street === 0 ? [] : board.slice(0, street + 2);
    if (street) { if (inHand().length < 2) break; t += 4500; H.streets.push(t); order.forEach(p => { st[p].cur = 0; }); }
    let bet = street === 0 ? POKER_BB : 0, raises = 0;
    const first = street === 0 ? (heads ? 1 : 2 % order.length) : 0, seq = []; for (let k = 0; k < order.length; k++) seq.push(order[(first + k) % order.length]);
    let queue = seq.filter(p => !st[p].folded && !st[p].allin), guard = 0;
    while (queue.length && guard++ < 80) {
      const p = queue.shift(), s0 = st[p]; if (s0.folded || s0.allin) continue;
      if (inHand().length < 2) break;
      if (canAct().length === 1 && bet - s0.cur <= 0) continue;   // everyone else is all in: nothing to decide
      const sty = G.style[p], tl = (G.tilt[p] || 0) > 0, toCall = bet - s0.cur;
      const noise = (r() - .5) * (1 - sty.skill) * .24;
      let str = street === 0 ? preScore(H.holes[p]) : postScore(H.holes[p], shown);
      str = Math.max(0, Math.min(1, str + noise));
      let playT = sty.play - (tl ? .15 : 0), bluff = sty.bluff + (tl ? .15 : 0), aggr = Math.min(1, sty.aggr + (tl ? .2 : 0)), callDown = sty.callDown;
      if (sty.adapt && G.n > 12) { const opp = inHand().filter(q => q !== p); if (opp.includes("yossi")) callDown += .1; if (opp.includes("moti")) bluff = .02; }
      let a = "fold", amt = 0;
      if (street === 0) {
        const suitedPass = sty.suited && (H.holes[p][0] & 3) === (H.holes[p][1] & 3);
        if (toCall <= 0) a = str >= sty.raise && r() < aggr + .3 ? "raise" : "check";
        else if (raises === 0) a = (str >= sty.raise || (suitedPass && r() < .5)) && r() < aggr + .3 ? "raise" : (str >= playT || suitedPass) ? "call" : "fold";
        else a = str >= sty.raise + .15 && r() < aggr && raises < 3 ? "raise" : (str >= playT + .08 || (callDown > .7 && str >= playT) || (suitedPass && toCall <= 40)) ? "call" : "fold";
        if (a === "raise") amt = bet === POKER_BB && raises === 0 ? 30 + Math.floor(r() * 3) * 5 : bet * 3;
      } else {
        const potNow = pot;
        if (toCall <= 0) {
          const value = str > .62 && r() < (sty.timid && str > .7 ? aggr : aggr * 1.2 + .1);
          a = value || (r() < bluff && raises === 0) ? "raise" : "check";
          if (a === "raise") amt = Math.max(POKER_BB, Math.round(potNow * (.5 + r() * .25) / 5) * 5);
        } else {
          const po = toCall / (potNow + toCall), need = po + .12 - callDown * .25 + Math.min(.3, toCall / Math.max(1, G.stacks[p]) * .35);   // a big bet is harder to call
          a = str > .82 && r() < aggr && raises < 3 ? "raise" : str >= need ? "call" : "fold";
          if (a === "raise") amt = bet + Math.max(bet, Math.round(potNow * .6 / 5) * 5);
        }
      }
      if (a === "check" && toCall > 0) a = "call";
      let think = 3000 + r() * 4000 + sty.think * 1.5 + (toCall > 100 || amt > 100 ? 4000 : 0); if (think < 1500) think = 1500;
      t += think;
      if (a === "fold") { s0.folded = true; H.acts.push({ t, p, a, pot }); if (r() < .06) pokerSay(G, r, t + 400, "fold", p); }
      else if (a === "check") H.acts.push({ t, p, a, pot });
      else if (a === "call") { const paid = put(p, toCall); H.acts.push({ t, p, a: s0.allin ? "allin" : "call", amt: paid, paid, pot }); if (p === "moti" && r() < .08) pokerSay(G, r, t + 400, "call", p); }
      else { const want = Math.min(amt - s0.cur, G.stacks[p]); if (p === "ishai" && str > .7 && r() < .7) { pokerSay(G, r, t - 1200, "raise", p, false, amt); G.ishaiTell++; }
        const paid = put(p, want), up = s0.cur > bet; if (up) raises++;
        H.acts.push({ t, p, a: s0.allin ? "allin" : up && bet > 0 ? "raise" : up ? "bet" : "call", amt: s0.cur, paid, pot });
        if (p !== "ishai" && r() < (s0.allin ? .6 : bet >= 80 ? .3 : .08)) pokerSay(G, r, t + 500, s0.allin ? "allin" : "raise", p, false, s0.cur); }
      if (a !== "fold" && s0.cur > bet) { bet = s0.cur; const ix = seq.indexOf(p);
        queue = [...seq.slice(ix + 1), ...seq.slice(0, ix)].filter(q => !st[q].folded && !st[q].allin); }
    }
    if (inHand().length < 2) break;
  }
  // who takes the pot (side pots by what each put in)
  const alive = inHand(), showdown = alive.length > 1;
  const vals = Object.fromEntries(alive.map(p => [p, handValue([...H.holes[p], ...board])]));
  const levels = [...new Set(order.map(p => st[p].tot))].filter(x => x > 0).sort((a, b) => a - b); let prev = 0; const won = {};
  for (const lv of levels) {
    const share = order.reduce((n, p) => n + Math.min(st[p].tot, lv) - Math.min(st[p].tot, prev), 0), elig = alive.filter(p => st[p].tot >= lv); prev = lv;
    if (!share) continue; if (!elig.length) { const back = order.filter(p => st[p].tot >= lv); back.forEach(p => { won[p] = (won[p] || 0) + Math.floor(share / back.length); }); continue; }
    const best = Math.max(...elig.map(p => vals[p])), ws = elig.filter(p => vals[p] === best);
    ws.forEach((p, k) => { won[p] = (won[p] || 0) + Math.floor(share / ws.length) + (k === 0 ? share % ws.length : 0); });
  }
  if (showdown) { t += 3500; H.show = { t, cards: alive, hand: Object.fromEntries(alive.map(p => [p, CAT_NAME[catOf(vals[p])]])) }; t += 8000; }
  else t += 3000;
  Object.entries(won).forEach(([p, a]) => { G.stacks[p] += a; });
  H.win = Object.entries(won).filter(([p, a]) => a > st[p].tot || (!showdown && a > 0)).map(([p, a]) => ({ p, amt: a }));
  H.pot = pot; H.t1 = t + 9000; H.tot = Object.fromEntries(order.map(p => [p, st[p].tot])); H.folded = order.filter(p => st[p].folded);   // t1: the pot is pushed, chips stacked, cards gathered
  H.board = board.slice(0, Math.min(5, H.streets.length ? H.streets.length + 2 : 0));
  // talk after the pot: winners and losers, bad beats, a shown bluff
  const w = H.win[0], big = pot >= 200;
  if (w && showdown && catOf(vals[w.p]) === 0 && r() < .9) pokerSay(G, r, t + 800, "bluff", w.p);
  else if (w && big && r() < .7) pokerSay(G, r, t + 800, "win", w.p);
  const loser = order.filter(p => p !== (w && w.p) && st[p].tot >= 100).sort((a, b) => st[b].tot - st[a].tot)[0];
  if (loser) { const badBeat = showdown && vals[loser] && catOf(vals[loser]) >= 3; pokerSay(G, r, t + 3200, badBeat ? "bad" : "lose", loser, badBeat ? false : r() > .5);
    if (st[loser].tot >= 150 && G.style[loser].tilt) G.tilt[loser] = Math.round(6 * G.style[loser].tilt) + 1; }
  Object.keys(G.tilt).forEach(p => { if (G.tilt[p] > 0) G.tilt[p]--; });
  if (G.ishaiTell >= 3 && !G.said.tell) { G.said.tell = true; G.saidTellNow = true; pokerLines(G, t + 6000, [["ronit", "Ishai. You say sorry right before you bet big. Every single time."], ["ishai", "I do not. Sorry. Do I?"]]); }
  // busted: one rebuy, then out
  G.seats.forEach(p => { if (!G.out.includes(p) && G.stacks[p] <= 0) {
    if (G.rebuys[p] < 1) { G.rebuys[p]++; G.stacks[p] = POKER_BUYIN; H.rebuy = [...(H.rebuy || []), p]; pokerSay(G, r, H.t1 - 1000, "rebuy", p, true); }
    else { G.out.push(p); H.bust = [...(H.bust || []), p]; } }
    if (G.stacks[p] === POKER_BUYIN && H.rebuy && H.rebuy.includes(p) || (H.bust || []).includes(p)) {   // he lost everything this hand: to whom, with what
      const by = (H.win[0] || {}).p, theirs = by && vals[by] != null ? CAT_NAME[catOf(vals[by])] : null;
      (G.busts || (G.busts = [])).push({ p, by, n: H.n, mine: H.holes[p] ? holeWords(H.holes[p]) : null, theirs, allin: true }); } });
  H.stacks1 = { ...G.stacks };
  G.hands.push(H); G.t = H.t1; G.btn++; G.n++;
  if (G.t > G.endAt || G.seats.filter(p => !G.out.includes(p)).length < 2) G.done = true;
}
function pokerLines(G, t, pairs) { let k = t; pairs.forEach(([who, say]) => { G.talk.push({ t: Math.round(k), who, say }); k += 2500 + say.length * 55; }); G.lastTalk = k; }
function pokerSay(G, r, t, kind, p, force, amt) {
  if (!force && (t - G.lastTalk < 22000 || t - (G.lastSaid[p] || -1e9) < 60000)) return;
  const list = p ? (POKER_TALK[p] || {})[kind] : null;
  if (kind === "ring") { pokerLines(G, t, POKER_PIZZA.ring); return; }
  if (!list || !list.length) return;
  const say = list[Math.floor(r() * list.length)].replace("{amt}", amt || "");
  G.talk.push({ t: Math.round(t), who: p, say }); G.lastTalk = t; G.lastSaid[p] = t;
}
function pokerSmall(G, r, t, force) {
  const used = G.smallUsed || (G.smallUsed = []), left = POKER_SMALL.map((_, i) => i).filter(i => !used.includes(i)); if (!left.length) return;
  if (!force && t - G.lastTalk < 30000) return;
  const k = left[Math.floor(r() * left.length)]; used.push(k); pokerLines(G, t, POKER_SMALL[k]);
}
// simulate a few hands; when the night is done, work out who won what
function pokerSimStep(G, k) {
  if (!G.started) { G.started = true; pokerLines(G, 0, POKER_PIZZA.order);
    const L = G.last;   // last time comes up: they remember, and so does he
    if (L) pokerLines(G, 60000, L.bust ? [[L.bust.by, L.bust.by === "yossi" ? `Professor! Remember my ${L.bust.theirs.replace(/^a /, "")}? The cap remembers.` : `Last time I took all your chips, Ishai. ${L.bust.theirs.replace(/^a /, "").replace(/^./, c => c.toUpperCase())}. Don't take it personally.`], ["ishai", `I've been thinking about my ${L.bust.mine} for two weeks. Two weeks.`]]
      : L.place <= 1 ? [["boaz", `Upstairs came ${ORD[L.place]} last time. Keep an eye on him.`], ["ishai", "That was luck. Sorry. Mostly luck."]]
      : [["moti", `Last time you finished ${ORD[L.place]}, neighbour. Tonight is a new night.`], ["ishai", "Tonight I'm not saying sorry. Sorry. Starting now."]]);
    G.lastTalk = -1e9; }
  for (let i = 0; i < k && !G.done; i++) pokerHand(G);
  if (G.done && !G.results) {
    const last = G.hands[G.hands.length - 1], end = (last ? last.t1 : G.t) + 4000;
    G.endT = end; G.results = Object.fromEntries(G.seats.map(p => [p, G.stacks[p] + (G.out.includes(p) ? 0 : 0) - POKER_BUYIN * (1 + G.rebuys[p])]));
    G.story = pokerStory(G);
    pokerLines(G, end + 1000, [["boaz", "Last hand. Cash out, everybody. Pizza money comes off the top."], ["moti", "Same time in two weeks. I'm bringing olives."], ["ishai", "Thanks, Boaz. Sorry about... everything. Thanks."]]);
  }
  return G.done;
}
// how the night went for Ishai, in a sentence he'd remember: his place, an all-in he lost, his best pot
const ORD = ["first", "second", "third", "fourth", "last"];
function pokerStory(G) {
  const res = G.results, order = Object.keys(res).sort((a, b) => res[b] - res[a]), place = order.indexOf("ishai"), sh = Math.round(res.ishai / 10);
  const bust = (G.busts || []).find(b => b.p === "ishai" && b.by && b.theirs), mine = G.hands.filter(h => h.holes.ishai);
  let best = null; mine.forEach(h => { const w = h.win.find(x => x.p === "ishai"); if (!w) return; const net = w.amt - h.tot.ishai;
    if (!best || net > best.net) best = { net, from: Object.keys(h.tot).filter(p => p !== "ishai").sort((a, b) => h.tot[b] - h.tot[a])[0], cards: holeWords(h.holes.ishai) }; });
  const money = sh > 0 ? `${sh} shekels up` : sh < 0 ? `${-sh} shekels down` : "even";
  let text = `Poker night at Boaz's: Ishai finished ${ORD[place]} of five, ${money}.`;
  if (bust) text += ` He lost everything to ${P_NAME[bust.by]} in an all-in, his ${bust.mine} against ${bust.theirs}. What a bummer.`;
  else if (best && best.net >= 100) { const n = Math.round(best.net / 10); text += ` His best moment: ${/^(8|11|18)/.test(String(n)) ? "an" : "a"} ${n}-shekel pot off ${P_NAME[best.from]} with ${best.cards}.`; }
  if (G.saidTellNow) text += " Ronit told him he says sorry right before he bets big.";
  return { place, sh, bust: bust ? { by: bust.by, mine: bust.mine, theirs: bust.theirs } : null, best: best && best.net >= 100 ? { sh: Math.round(best.net / 10), from: best.from, cards: best.cards } : null, text };
}
function lifeOf(s) { return s.life || (s.life = []); }
function addLife(s, at, kind, text) { s.life = [...lifeOf(s), { at, kind, text: String(text).slice(0, 260), offered: 0 }].slice(-12); }
// what the producers have planned in the next hours, for the hosts' teasers ("be back at 20:00, you don't want to miss it")
const PLACE_NAME = { apartment: "his apartment", corridor: "the stairwell", street: "Herzl Street", shops: "Herzl Street east", park: "the park", cafe: "Café Nahat", gym: "Herzl Gym",
  bar: "The Black Candle", market: "Shuk Shalom market", store: "Everything Else", campus: "the university", classroom: "the university", plaza: "the Pump House", arena: "the Pump House", apt2: "Boaz's place downstairs" };
const ceil15 = ms => Math.ceil(ms / 900000) * 900000;
function comingUp(s, now, hours = 6) {
  const nm = id => (s.cast[id] && s.cast[id].name) || null;
  const planTeaser = id => { const b = ((PLAN && PLAN.beats) || []).find(x => x.id === id); return b && b.teaser ? String(b.teaser).replace(/\s+/g, " ").trim().slice(0, 120) : null; };
  return (s.director || []).filter(g => g.status === "waiting" && !g.poll && !/^(walk|visit|poll)-/.test(g.id))
    .map(g => {
      const at = ceil15(g.sceneAt ? g.sceneAt : g.startAfter);
      let what = g.teaser || planTeaser(g.id);
      if (!what && (g.course || g.fixed)) what = String(g.goal || "").replace(/^Ishai goes (to |down to )?/, "").replace(/\.$/, "").slice(0, 110);
      if (!what) { const who = nm(g.forceWith) || (g.with ? String(g.with).replace(/\s*\(.*\)\s*$/, "") : null);
        what = `Ishai${who ? " and " + who : ""}${g.where ? " at " + (PLACE_NAME[g.where] || g.where) : ""}`; if (what === "Ishai") return null; }
      return { at, what };
    }).filter(x => x && x.at > now + 10 * 60000 && x.at - now < hours * 3600000).sort((a, b) => a.at - b.at).slice(0, 3);
}
const comingUpText = (s, now, hours) => comingUp(s, now, hours).map(x => `${storyClock(x.at).label.slice(-5)} ${x.what}`).join("; ");
// today's TV guide for the page's on-screen card: the city timetable plus the planned and fixed events, by hour (Israel time)
const CITY_TITLE = { garbage: "Garbage truck on Herzl St.", gas: "Gas delivery", alte: "Alte-zachen cart", flowers: "Friday flower rush",
  "market-close": "Last calls at the market", school: "School's out", piano: "Piano practice upstairs", kiosk: "Queue at Avi's kiosk", gameshow: "Mrs. Levi's game show" };
// the day's events for a given Israel date (YYYY-MM-DD): the city timetable, the weekly fixed nights from their own rules, and the plan's beats
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const atLocal = (day, h, m = 0) => { const [y, mo, d] = day.split("-").map(Number), u = Date.UTC(y, mo - 1, d, h, m); return u - tzOffset(u); };
function guideDay(s, day, keyOnly) {
  const [y, mo, dd] = day.split("-").map(Number), d = new Date(Date.UTC(y, mo - 1, dd)).getUTCDay();
  const holiday = (s.world?.holidays || []).some(h => h.date === day);
  const sh = s.world && s.world.shabbat, inSh = t => !!sh && t >= sh.start && t <= (sh.end || sh.start + 26 * 3600000);
  const items = [];
  if (!keyOnly) CITY.filter(e => e.days.includes(d)).forEach(e => { const at = atLocal(day, 0) + e.from * 60000; if (!inSh(at)) items.push({ at, what: CITY_TITLE[e.id] || e.id }); });
  if (sh && dayOfTZ(sh.start) === day) items.push({ at: sh.start, what: "Shabbat candles" });
  if (!holiday) {
    if (LECTURE_DAYS.includes(d)) items.push({ at: atLocal(day, LECTURE_H), what: "Strange But True lecture" });
    if (d === 4) items.push({ at: atLocal(day, 17), what: "Improv class at The Black Candle" });
    if (d === ARENA_DAY) { const ev = s.arena && s.arena.events && s.arena.events[day];
      if (!(ev && ev.skip) && !(s.arena && s.arena.off)) items.push({ at: atLocal(day, ARENA_H), what: ev ? (ev.kind === "concert" ? `${ev.artist} LIVE at the Pump House` : `Gallery night: ${ev.title}`) : "Pump House night" }); }
    const pk = s.poker && nextPokerAt(s, atLocal(day, 0)); if (pk && dayOfTZ(pk) === day) items.push({ at: pk, what: "Poker night at Boaz's" });
  }
  if (!keyOnly) for (const g of s.director || []) {
    if (g.poll || g.course || g.fixed || /^(walk|visit|poll|lecture)-/.test(g.id) || g.how === "cancelled") continue;
    const at = ceil15(g.sceneAt || g.startAfter); if (dayOfTZ(at) !== day) continue;
    const c = comingUp(s, at - 11 * 60000, 1).find(x => x.at === at); if (c) items.push({ at, what: c.what.slice(0, 70) });
  }
  const seen = new Set();
  return items.sort((a, b) => a.at - b.at).filter(x => { const k = x.at + x.what; if (seen.has(k)) return false; seen.add(k); return true; });
}
// today, tomorrow, and the key nights of the coming week, for the page's TV guide card
function guideToday(s, now) {
  const day = k => dayOfTZ(atLocal(dayOfTZ(now), 12) + k * 86400000), wd = k => WEEKDAYS[new Date(day(k) + "T12:00:00Z").getUTCDay()];
  const fmt = (x, withDay) => ({ at: x.at, t: (withDay ? wd(x.k).slice(0, 3) + " " : "") + storyClock(x.at).label.slice(-5), what: x.what });
  const week = []; for (let k = 1; k <= 7; k++) guideDay(s, day(k), true).forEach(x => week.push(fmt({ ...x, k }, true)));
  return { day: wd(0), items: guideDay(s, day(0)).map(x => fmt(x)), tomorrow: { day: wd(1), items: guideDay(s, day(1)).map(x => fmt(x)) }, week: week.slice(0, 7) };
}
const TEASE_RE = /stay tuned|don'?t miss|coming up|be back|tune in|later (today|tonight)|\b(at|from) \d{1,2}(:\d\d)?\b/i;
function eventNote(s, now, company) {
  const day = ms => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long" }).format(new Date(ms)); let out = "";
  const a = arenaNext(s, now);
  if (a && !a.skip && a.at > now && a.at - now < 4 * 86400000) out += ` Coming up: ${day(a.at)} at 20:00 at the Pump House, ${a.kind === "gallery" ? `a gallery night, "${a.title}" by ${a.artist}` : `"${a.title}"`}${a.companion && s.cast[a.companion] ? `, and ${s.cast[a.companion].name} is coming too` : ""}. He's looking forward to it.`;
  const pk = s.poker && nextPokerAt(s, now); if (pk && pk > now && pk - now < 4 * 86400000) out += ` Coming up: poker night at Boaz's (apartment 2) on ${day(pk)} at 20:00.`;
  const recent = lifeOf(s).filter(m => now - m.at < 10 * 86400000 && (m.offered || 0) < 3);
  if (recent.length && Math.random() < (company ? .3 : .15)) { const m = recent[recent.length - 1 - Math.floor(Math.random() * Math.min(2, recent.length))]; m.offered = (m.offered || 0) + 1;
    out += ` From the last few days he remembers: ${m.text} If, and only if, it fits naturally, he brings it up${company ? " with the person he is with" : " to himself (a muttered line, or to Falafel)"}, in his own words; otherwise ignore it.`; }
  return out ? `\nIshai's evenings:${out}` : "";
}
// the hosts' line for a window of the night: they can see Ishai's cards
function pokerHostLine(G, from, to, r) {
  const hs = G.hands.filter(h => h.t0 >= from && h.t0 < to && h.holes.ishai);
  const fill = (s, h, amt) => s.replace("{cards}", h ? holeWords(h.holes.ishai) : "").replace("{amt}", amt != null ? `${Math.round(amt / 10)} shekels` : "");
  const won = hs.find(h => h.win.some(w => w.p === "ishai") && h.pot >= 150);
  if (won) return fill(pickR(r, POKER_HOSTS.won), won, won.win.find(w => w.p === "ishai").amt - won.tot.ishai);
  const lost = hs.find(h => h.tot.ishai >= 100 && !h.win.some(w => w.p === "ishai"));
  if (lost) return fill(pickR(r, POKER_HOSTS.lost), lost, lost.tot.ishai);
  const big = hs.find(h => preScore(h.holes.ishai) >= .75);
  if (big) return fill(pickR(r, big.folded.includes("ishai") ? POKER_HOSTS.folded : POKER_HOSTS.big), big);
  return pickR(r, POKER_HOSTS.any);
}
// the planned beat: he goes down to apt 2, plays, and goes home. Talk and cards are the page's (from /api/poker); the moments carry the hosts and the narration.
function pokerMoments(G) {
  const r = seedRng(G.id + "-moments"), n = Math.ceil((G.endT + 120000) / (INTERVAL_MIN * 60000)) + 1, out = [];
  out.push({ location: "apt2", action: "poker", with: null, text: "Ishai goes down to apartment 2 for poker night at Boaz's: Boaz, his old school friend Ronit, Moti from the committee and Yossi from the bus depot. Boaz orders pizza on ateBite.",
    lines: [], commentary: [{ who: "zohar", say: "Poker night downstairs at Boaz's. Five players, fifty shekels each, and viewers get to see Ishai's cards." }], art: { poker: G.id } });
  for (let i = 1; i < n; i++) {
    const from = (i - 1) * INTERVAL_MIN * 60000, to = i * INTERVAL_MIN * 60000, hs = G.hands.filter(h => h.t0 >= from && h.t0 < to);
    const pizza = G.pizzaAt >= from && G.pizzaAt < to;
    const text = pizza ? "The ateBite courier brings two large pizzas to Boaz's door; the game stops for slices."
      : hs.length ? `Poker at Boaz's, hands ${hs[0].n + 1}-${hs[hs.length - 1].n + 1}. Ishai has ${hs.map(h => holeWords(h.holes.ishai || [0, 1])).slice(0, 3).join(", ")}.` : G.breakAt >= from && G.breakAt < to ? "A short break at the poker table: seeds, pizza crusts and committee business." : "Chips are counted out and Boaz reads the house rules off the card taped to the cabinet.";
    out.push({ location: "apt2", action: "poker", with: null, text, lines: [], commentary: i % 2 ? [{ who: i % 4 === 1 ? "oren" : "zohar", say: pokerHostLine(G, from, to, r) }] : [], art: { poker: G.id }, delivery: pizza || undefined });
  }
  const res = G.results ? G.results.ishai : 0, sh = Math.round(Math.abs(res) / 10);
  out.push({ location: "corridor", action: "walking", with: null, text: `Poker night is over. Ishai climbs the stairs home. ${G.story ? G.story.text : ""}`.slice(0, 250),
    lines: [], commentary: [{ who: "oren", say: res > 0 ? `He won ${sh} shekels and he's going to feel bad about it all week.` : res < 0 ? `${sh} shekels lighter. Cheaper than therapy, says Zohar.` : "Even money. The most Ishai result possible." }] });
  return out;
}
// every second Monday, counted from the first night
function nextPokerAt(s, now) {
  const first = Date.parse(POKER_FIRST + "T00:00:00Z");
  for (let k = 0; k < 30; k++) {
    const day = dayOfTZ(now + k * 86400000), d0 = Date.parse(day + "T00:00:00Z");
    if (d0 < first || Math.round((d0 - first) / 86400000) % 14 || (s.world?.holidays || []).some(h => h.date === day)) continue;
    const [y, m, d] = day.split("-").map(Number), u = Date.UTC(y, m - 1, d, POKER_H), t = u - tzOffset(u);
    if (t + (POKER_LEN_MIN + 30) * 60000 > now) return t;
  }
  return null;
}
function pokerOf(s) { return s.poker || (s.poker = { nights: 0, build: null, ready: {}, err: null }); }
async function pokerTick(env, s, now) {
  const P = pokerOf(s), t = nextPokerAt(s, now); if (!t || P.off) return;
  const date = dayOfTZ(t);
  if (P.ready[date]) {   // built: schedule the beat a day ahead; afterwards, the players remember the night
    const R = P.ready[date];
    if (!R.goalId && t - now < 30 * 3600000 && t - 40 * 60000 > now) {
      const g = newGoal({ id: R.id, goal: "Ishai goes down to apartment 2 for poker night at Boaz's.", startAt: new Date(t - 30 * 60000).toISOString(), sceneAt: new Date(t - 6 * 60000).toISOString(), deadlineAt: new Date(t + 10 * 60000).toISOString(), location: "apt2" }, now);
      g.id = R.id; g.fixed = true; g.script = cleanScript(R.moments, 40); s.director = s.director.filter(d => d.id !== R.id || d.status !== "done"); s.director.push(g); R.goalId = R.id;
    }
    const g = R.goalId && s.director.find(d => d.id === R.goalId);
    if (g && g.status === "done" && !R.remembered) { R.remembered = true; P.nights++;
      surveyPoker(s, R, date);
      if (R.story) { addLife(s, now, "poker", R.story.text); P.last = { place: R.story.place, bust: R.story.bust }; if (/Ronit told him/.test(R.story.text)) P.told = true; }
      const res = R.results || {}, sh = p => Math.round((res[p] || 0) / 10), word = p => sh(p) > 0 ? `won ${sh(p)}` : sh(p) < 0 ? `lost ${-sh(p)}` : "broke even";
      const mem = { boaz: `Hosts poker every second Monday. Ishai from upstairs plays now; last time he ${word("ishai")} shekels. Quiet, apologises too much.`,
        ronit: `Plays at Boaz's. Noticed Ishai says sorry right before he bets big. Last time she ${word("ronit")} shekels.`,
        moti: `Plays at Boaz's and calls every bet. Last time he ${word("moti")} shekels. Ishai still owes the committee for the stair light.`,
        yossi: `Plays at Boaz's with his lucky cap. Last time he ${word("yossi")} shekels. Calls Ishai "professor".` };
      if (R.story && R.story.bust && mem[R.story.bust.by]) mem[R.story.bust.by] = `Took all of Ishai's chips at Boaz's poker in an all-in (${R.story.bust.theirs} against his ${R.story.bust.mine}). ` + mem[R.story.bust.by].split(". ").slice(0, 1).join("") + ".";
      Object.entries(mem).forEach(([id, m]) => { const c = s.cast[id]; if (c) { c.memory = m.slice(0, 180); c.relationship = clamp((c.relationship || 0) + 1, -5, 5); } });
    }
    for (const d of Object.keys(P.ready)) if (Date.parse(d) < now - 15 * 86400000) delete P.ready[d];
    return;
  }
  if (t - now > 4 * 86400000) return;
  if (!P.build || P.build.date !== date) P.build = pokerNew(s, date, t);
  const G = P.build;
  if (!pokerSimStep(G, POKER_HANDS_PER_TICK)) return;
  const data = { id: G.id, date: G.date, at: G.at, seats: G.seats, hands: G.hands, talk: G.talk.sort((a, b) => a.t - b.t), pizzaAt: G.pizzaAt, breakAt: G.breakAt, endT: G.endT, results: G.results, buyin: POKER_BUYIN };
  await env.ISHAI.put("poker:" + date, JSON.stringify(data));
  P.ready[date] = { id: G.id, date, at: t, endT: G.endT, results: G.results, story: G.story, moments: pokerMoments(G) }; P.build = null;
}
function pokerPublic(s, now) {
  const P = s.poker, t = P && nextPokerAt(s, now); if (!t) return null; const R = P.ready[dayOfTZ(t)];
  return R ? { id: R.id, date: R.date, at: R.at, end: R.at + R.endT, live: now >= R.at - 20 * 60000 && now < R.at + R.endT + 15 * 60000 } : null;
}
const pokerHealth = s => { const P = s.poker; if (!P) return null; return { nights: P.nights, building: P.build ? { date: P.build.date, hands: P.build.hands.length } : null,
  ready: Object.values(P.ready).map(R => ({ id: R.id, results: R.results, goal: R.goalId || null, remembered: !!R.remembered })), err: P.err }; };
// ---------- the director's bands, concerts and promotions (/events) ----------
// Bands live in s.bands, the director's nights in s.arena.custom[date] (they take the place of that week's gallery night), promotions in s.promos.
// Uploaded files (songs, logos, posters) are KV values "asset:<id>" served from /asset/<id>; each song's beat map is "beats:<id>".
const INSTRUMENTS = ["vocals", "electric", "acoustic", "guitar", "bass", "drums", "keys", "sax", "violin", "dj"];   // "guitar" is the old name, drawn as electric
const VOCALS = ["lead", "backing", "none"];
const ASSET_MAX = { image: 2 * 1024 * 1024, song: 20 * 1024 * 1024 };
const BANTER_GAP = 45000, CONCERT_INTRO = 40000, CONCERT_OUTRO = 40000;
const cleanStr = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const cleanId = v => String(v || "").replace(/[^a-z0-9]/gi, "").slice(0, 24);
function cleanLook(l) {
  const pick = (v, list, d) => list.includes(v) ? v : d;
  return { hair: pick(l?.hair, LOOK.hair, "short"), hairColor: pick(l?.hairColor, LOOK.hairColor, "black"), skin: pick(l?.skin, LOOK.skin, "fair"),
    shirt: pick(l?.shirt, LOOK.cloth, "black"), pants: pick(l?.pants, LOOK.cloth, "black"),
    hat: pick(l?.hat, LOOK.hat, "none"), hatColor: pick(l?.hatColor, LOOK.cloth, "black"), top: pick(l?.top, LOOK.top, "tshirt"), bottom: pick(l?.bottom, LOOK.bottom, "trousers"),
    extras: (Array.isArray(l?.extras) ? l.extras : []).filter(x => LOOK.extras.includes(x)).slice(0, 5) };
}
function cleanBand(b, old) {
  const id = cleanId(b.id) || "b" + Date.now().toString(36);
  const members = (Array.isArray(b.members) ? b.members : []).slice(0, 6).map((m, i) => ({ id: cleanId(m.id) || `${id}m${i}`, name: cleanStr(m.name, 30) || `Member ${i + 1}`,
    instrument: INSTRUMENTS.includes(m.instrument) ? m.instrument : "vocals", vocal: VOCALS.includes(m.vocal) ? m.vocal : "none", look: cleanLook(m.look) }));
  const songs = (Array.isArray(b.songs) ? b.songs : []).slice(0, 30).map(x => ({ id: cleanId(x.id), title: cleanStr(x.title, 60) || "Untitled", dur: clamp(Math.round(Number(x.dur) || 0), 10000, 15 * 60000), beats: !!x.beats }))
    .filter(x => x.id);
  return { id, name: cleanStr(b.name, 40) || "Unnamed band", kind: b.kind === "solo" ? "solo" : "band", bio: cleanStr(b.bio, 300), logo: cleanId(b.logo) || null,
    links: cleanLinks(b.links), members, songs, created: old?.created || Date.now(), updated: Date.now() };
}
function cleanLinks(a) {
  return (Array.isArray(a) ? a : []).slice(0, 3).map(l => ({ label: cleanStr(l?.label, 24) || "Link", url: cleanStr(l?.url, 300) }))
    .filter(l => { try { const u = new URL(l.url); return u.protocol === "https:" && !u.username && !u.password; } catch (e) { return false; } });
}
function cleanPromo(p) {
  const WHERE = ["board", "bar", "street", "radio", "hosts", "card"];
  const d = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null;
  return { id: cleanId(p.id) || "p" + Date.now().toString(36), title: cleanStr(p.title, 60) || "Coming up", text: cleanStr(p.text, 400), image: cleanId(p.image) || null,
    links: cleanLinks(p.links), from: d(p.from) || dayOfTZ(Date.now()), to: d(p.to) || dayOfTZ(Date.now() + 14 * 86400000), event: d(p.event),
    where: (Array.isArray(p.where) ? p.where : WHERE).filter(w => WHERE.includes(w)) };
}
function cleanCustom(s, c) {
  const band = s.bands && s.bands[cleanId(c.band)]; if (!band) return { error: "pick a band first" };
  const setlist = (Array.isArray(c.setlist) ? c.setlist : []).map(cleanId).filter(id => band.songs.some(x => x.id === id)).slice(0, 25);
  if (!setlist.length) return { error: "add at least one song to the setlist" };
  const banter = {}; Object.entries(c.banter || {}).forEach(([k, v]) => { if (setlist.includes(cleanId(k))) banter[cleanId(k)] = (Array.isArray(v) ? v : String(v || "").split("\n")).map(x => cleanStr(x, 160)).filter(Boolean).slice(0, 3); });
  const ms = concertLength(band, setlist, banter);
  if (ms > 90 * 60000) return { error: `that setlist runs ${Math.round(ms / 60000)} minutes; the most is 90` };
  if (ms < 20 * 60000) return { error: `that setlist runs only ${Math.round(ms / 60000)} minutes; a night needs at least 20` };
  return { kind: "concert", band: band.id, title: cleanStr(c.title, 60) || band.name, setlist, banter, opening: cleanStr(c.opening, 200), closing: cleanStr(c.closing, 200),
    small: (Array.isArray(c.small) ? c.small : String(c.small || "").split("\n")).map(x => cleanStr(x, 120)).filter(Boolean).slice(0, 8),
    companion: GALLERY_FRIENDS.includes(c.companion) ? c.companion : c.companion === "none" ? "none" : null, minutes: Math.round(ms / 60000) };
}
function concertLength(band, setlist, banter) {
  const songs = setlist.map(id => band.songs.find(x => x.id === id)).filter(Boolean);
  return CONCERT_INTRO + songs.reduce((n, x) => n + x.dur, 0) + Math.max(0, songs.length - 1) * BANTER_GAP + CONCERT_OUTRO;
}
// a director's concert as the page plays it: who stands where, every song's start, and what is said between songs
function concertNight(s, date, at, c) {
  const band = s.bands[c.band]; if (!band) return null;
  const r = seedRng("concert-" + date), lead = band.members.find(m => m.vocal === "lead") || band.members[0];
  const talk = [], songs = []; let t = 0;
  const say = (who, line) => { talk.push({ t, who, say: line.slice(0, 200) }); t += 2500 + line.length * 55; };
  const mid = id => "bm-" + id;
  say("hagit", c.opening || `Good evening, Pump House! Tonight: ${band.name}. Make some noise.`);
  t = Math.max(t, CONCERT_INTRO);
  c.setlist.forEach((id, i) => {
    const sg = band.songs.find(x => x.id === id); if (!sg) return;
    songs.push({ id: sg.id, title: sg.title, t0: t, dur: sg.dur, beats: sg.beats }); t += sg.dur;
    if (i < c.setlist.length - 1) { const t1 = t, lines = c.banter[id] && c.banter[id].length ? c.banter[id] : [pickR(r, CONCERT_BANTER).replace("{band}", band.name).replace("{next}", (band.songs.find(x => x.id === c.setlist[i + 1]) || {}).title || "the next one")];
      t += 1500; lines.forEach(l => lead && say(mid(lead.id), l)); t = Math.max(t, t1 + BANTER_GAP); }
  });
  t += 2000; if (lead) say(mid(lead.id), c.closing || pickR(r, CONCERT_BYE).replace("{band}", band.name)); say("hagit", "Thank you, everyone. Next Wednesday, same time. Get home safe.");
  const friends = GALLERY_FRIENDS.filter(id => s.cast[id]), companion = c.companion === "none" ? null : c.companion && s.cast[c.companion] ? c.companion : r() < .75 && friends.length ? pickR(r, friends) : null;
  return { id: "pump-" + date, date, kind: "concert", at, minutes: Math.round(t / 60000), title: c.title, artist: band.name, companion, endT: t,
    band: { id: band.id, name: band.name, logo: band.logo, members: band.members.map(m => ({ id: mid(m.id), name: m.name, instrument: m.instrument, vocal: m.vocal, look: m.look })) },
    songs, talk, small: c.small || [] };
}
const CONCERT_BANTER = ["Thank you! This next one is called {next}.", "You're great tonight. Seriously. This one's {next}.", "We wrote this next one in a car with no air conditioning. {next}.",
  "How's everybody doing? Good. Here's {next}.", "This is a very old room and a very new song. {next}."];
const CONCERT_BYE = ["That's us. We're {band}. Thank you, Pump House!", "Thank you so much. Drive safe, buy a shirt, call your mother.", "Goodnight! You've been the best crowd in this pipe museum."];
const CONCERT_HOSTS = ["Live music at the Pump House. Our man is nodding along like he invented it.", "He's doing the small head-nod. The universal sign of a man who likes a song.",
  "That's {band} on stage. Somebody give that drummer water.", "Hagit got a real band in here. The pipes are vibrating.", "He's trying to clap on the beat. Trying.", "\"{song}\". He's going to hum this for a week."];
function concertMoments(ev, s) {
  const r = seedRng("concert-talk-" + ev.date), f = ev.companion && s.cast[ev.companion] ? ev.companion : null, out = [], n = Math.ceil((ev.endT + 60000) / (INTERVAL_MIN * 60000));
  out.push({ location: "plaza", action: "idle", with: f, text: `Doors at the Pump House for ${ev.artist}: a queue on the plaza, music checks through the walls.${f ? " " + s.cast[f].name + " meets Ishai there." : ""}`, art: { ev: ev.id, queue: true },
    lines: [{ who: "hagit", say: pickR(r, G_DOORS) }, ...(f ? [{ who: "ishai", say: "You came!" }, { who: f, say: f === "noa" ? "For the band, Ishush. Not for you." : "Live music, habibi! Move, move." }] : [{ who: "ishai", say: "One, please. Am I early?" }])],
    commentary: [{ who: "zohar", say: `${ev.artist} at the Pump House tonight, and he has a ticket.` }] });
  for (let i = 0; i < n; i++) {
    const from = i * INTERVAL_MIN * 60000, to = from + INTERVAL_MIN * 60000, sg = ev.songs.find(x => x.t0 < to && x.t0 + x.dur > from);
    out.push({ location: "arena", action: "concert", with: f, text: sg ? `${ev.artist} play "${sg.title}" at the Pump House; Ishai${f ? " and " + s.cast[f].name : ""} in the crowd.` : `Between songs at the Pump House; ${ev.artist} talk to the crowd.`,
      art: { ev: ev.id }, lines: [], commentary: i % 2 ? [] : [{ who: i % 4 ? "oren" : "zohar", say: pickR(r, CONCERT_HOSTS).replace("{band}", ev.artist).replace("{song}", sg ? sg.title : ev.title) }] });
  }
  const fav = ev.songs.length ? ev.songs[Math.floor(r() * ev.songs.length)].title : ev.title;
  out.push({ location: "plaza", action: "walking", with: f, text: `Ishai${f ? " and " + s.cast[f].name : ""} come out of the Pump House after ${ev.artist}'s show, ears ringing.`, art: { ev: ev.id, after: true },
    lines: [{ who: "ishai", say: `"${fav}". I'm going to have that in my head all week.` }, ...(f ? [{ who: f, say: f === "noa" ? "You danced, Ishush. I saw it. A little." : "Next week again, habibi. I'm serious." }] : [])],
    commentary: [], update: f ? { memory: `Went with Ishai to see ${ev.artist} at the Pump House; he loved "${fav}".`, mood: 1 } : undefined, fav });
  return out;
}
// active promotions, as the page shows them (in the world and in the COMING UP card)
function promosPublic(s, now) {
  const day = dayOfTZ(now);
  return (s.promos || []).filter(p => p.from <= day && day <= p.to).map(p => ({ id: p.id, title: p.title, text: p.text, image: p.image, links: p.links, event: p.event, where: p.where }));
}
// the director's /events page
function eventsView(s, now) {
  const weds = []; let t = now; for (let k = 0; k < 8; k++) { const a = nextArenaAt(s, t); if (!a) break; weds.push({ date: dayOfTZ(a), at: a }); t = a + 3 * 86400000; }
  const a = arenaOf(s);
  return { bands: Object.values(s.bands || {}).sort((x, y) => y.updated - x.updated), promos: s.promos || [], instruments: INSTRUMENTS, vocals: VOCALS, look: LOOK, friends: GALLERY_FRIENDS,
    nights: weds.map(w => { const c = (a.custom || {})[w.date], e = a.events[w.date]; return { ...w, custom: c || null, built: e ? { kind: e.kind, title: e.title, artist: e.artist, scheduled: !!e.goalId } : null }; }) };
}
async function eventsAction(env, s, b, now) {
  const a = arenaOf(s); a.custom = a.custom || {}; s.bands = s.bands || {}; s.promos = s.promos || [];
  if (b.action === "bandSave") { const old = s.bands[cleanId(b.band?.id)], band = cleanBand(b.band || {}, old); s.bands[band.id] = band; return { band }; }
  if (b.action === "bandDelete") { const id = cleanId(b.id); if (Object.values(a.custom).some(c => c.band === id)) return { error: "that band has a night booked; remove the night first" }; delete s.bands[id]; return {}; }
  if (b.action === "nightSave") {
    const date = String(b.date || ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "pick a Wednesday" };
    const c = cleanCustom(s, b.night || {}); if (c.error) return c;
    const old = a.events[date]; if (old && old.goalId && s.director.some(d => d.id === old.goalId && d.status === "active")) return { error: "that night is already under way" };
    a.custom[date] = c; if (old) { s.director = s.director.filter(d => d.id !== old.goalId); delete a.events[date]; }   // rebuilt on the next tick
    return {};
  }
  if (b.action === "nightDelete") { const date = String(b.date || ""), old = a.events[date]; delete a.custom[date];
    if (old && old.kind !== "gallery") { s.director = s.director.filter(d => d.id !== old.goalId || d.status === "active"); delete a.events[date]; } return {}; }
  if (b.action === "nightSkip") { const date = String(b.date || ""), e = a.events[date]; if (e) { e.skip = !e.skip; if (e.skip) s.director = s.director.filter(d => d.id !== e.goalId || d.status === "active"); e.goalId = e.skip ? null : e.goalId; } return {}; }
  if (b.action === "promoSave") { const p = cleanPromo(b.promo || {}); s.promos = [...s.promos.filter(x => x.id !== p.id), p].slice(-30); return { promo: p }; }
  if (b.action === "promoDelete") { s.promos = s.promos.filter(x => x.id !== cleanId(b.id)); return {}; }
  return { error: "unknown events action" };
}
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
    teaser: str(d.teaser, 120) || null,
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
      update: m.update && typeof m.update === "object" ? m.update : undefined, art: m.art && typeof m.art === "object" ? m.art : undefined }));   // what the scene changed in that person's memory and mood
  return sc.length ? sc : null;
}
function activeGoal(s, now) {
  let g = s.director.find(d => d.status === "active");
  const lec = s.director.find(d => (d.course || d.fixed) && d.status === "waiting" && d.startAfter <= now);   // a lecture or a Pump House night   // a lecture has a fixed time: a beat that has not begun waits for it
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
    } else if (/^surve/.test(String(b.action || ""))) {
      const r = await surveyAction(env, s, b, now); if (r) return json({ error: r }, {}, 400);
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
      const s2 = await loadState(env); return json({ ...directorView(s2, JSON.parse(await env.ISHAI.get("bugs") || "[]")), surveys: await surveyDirector(env, s2).catch(e => ({ err: String(e.message || e), list: [] })) });
    }
    await saveState(env, s);
  }
  return json({ ...directorView(s, JSON.parse(await env.ISHAI.get("bugs") || "[]")), surveys: await surveyDirector(env, s).catch(e => ({ err: String(e.message || e), list: [] })) });
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
