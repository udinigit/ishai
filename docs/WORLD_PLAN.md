# A bigger world: plan

Draft, 2026-11-11, updated 2026-11-12: the places table (v214-v217) and the director's build order. Nothing built yet. Read `CLAUDE.md` and `docs/SCENE_GUIDELINES.md` first.

## The idea
More of the show should be Ishai going somewhere: walking, riding a bike, the city going past. Today most screens are places where he stands still.

The plan is to make the world much larger without much more AI. It has three parts:
- a single world file;
- a kit that draws street blocks from a short description;
- a map editor where the director adds screens and writes what should be on them. Claude then builds them in a chat and pushes.

No AI runs on the live show to make scenery.

## What already works for us
Herzl St. west (`west1`-`west3`, CAM-14 to 16) is the model:
- **Page only.** The story still says street > park, and `route()` walks him through the three blocks (about 9 s each).
- **No cost.** They need no AI call, no prompt space and no KV write.
- **Built from a description.** `westBlock()` takes a seed, building heights and colours, shopfronts and props. It already handles the sky, night, crowd, traffic, depth (`zAdd`) and `liveLayer`.

## Two kinds of place
| Kind | Story knows it? | Cost | Examples |
|---|---|---|---|
| **Pass-through** | No. The page routes through it | None | Street blocks, the promenade, a bike path, a bridge |
| **Story place** | Yes: in `PLACES`, `NEXT` and the prompt | Prompt tokens on every story call | The café, the bar, the market, a new restaurant |

- **Pass-through places** can grow almost without limit. This is where the movement lives.
- **Story places** should stay few. `PLACES` is about 5,000 characters today (about 1,200 tokens, plus each place's allowed actions), and all of it goes into every story prompt (`world` in the prompt builder).

## Phase 1: one world file
The map is written twice today: `MAP` in the page and `NEXT` (plus `PLACES`) in the worker. They must match by hand.

- **`story/world.json`** becomes the one source. For each place it holds:
  - `id`, `cam` and `label`;
  - `kind`: `story` or `pass`;
  - `links`: for each link, `to`, `exit` x, `entry` x and `mode` (`walk`, `ride` or `bike`);
  - for story places only: the description the story prompt reads;
  - `walkMin`: minutes to walk through it, for travel and whereabouts (see below);
  - `layout` x/y, used only by the editor.
- **Times and visits stay in `story/places.json`** (v214-v217: `open`, `rate`, `byDay`, `weather`, `with`, `meet`, `people`, `stay`, `event`). It is already one table read by the worker, so it is not merged into `world.json`. The two files are joined by place id.
- **`build.mjs`** writes `MAP` into the page and `NEXT`/`PLACES` into the worker. It fails the build when:
  - a link is not the same door both ways;
  - a place cannot be reached;
  - a `story` place has no description;
  - a `story` place has no entry in `places.json`, or `places.json` names a place that is not on the map;
  - a `pass` place has rules in `places.json` (pass-through places never close, are never an outing and have no stay);
  - `people` names someone who is not in `SEED_CAST`, or `open`/`rate` hours are out of range (from < to, 0-30).
- **Walking times in one place.** Whereabouts count walking time per hop today: the page by `HOP_MS` over its map, which includes the west blocks, and the worker by `WALK_HOP_MIN` (4) over `NEXT`, which does not. With more pass-through blocks these would drift apart. Both should add up `walkMin` along the route from `world.json`, so a friend who left Ishai at the café takes the same time to reach the Pump House on the page and in the worker.
- **The page** keeps a check in the sandbox: every place in the file has a `SCENES` entry.
- **Unchanged:** behaviour does not change. The new map must equal today's map.

## Phase 2: the block kit
`westBlock()` becomes a general `block(spec)` that draws a pass-through scene from a description. The description has these parts:

- **`ground`:** `sidewalk+road` (like Herzl St.), `promenade` (sand, sea, railing), `path` (park), and indoors `mallFloor` (tiles, columns, the railing over the floor below).
- **`ceiling`:** for indoor scenes: `lit` (mall floors 1-2) or `glass` (the food court: the real sky, night and rain drawn through the panes).
- **`buildings`:** for each building, x, width, height, colour and roof.
- **`fronts`:** each takes a front type from a library (`shop`, `cafe`, `entrance`, `kiosk`, `billboard`, `wall`, `hedge`, `trees`) with its sign text, palette and window goods.
- **`props`:** each takes a prop type from a library (`lamp`, `ficus`, `bin`, `bench`, `bikeRack`, `crates`, `scooter`, `palm`, `lifeguardTower`, `escalator`, `foodTable`, `planter`).
- **`fronts`** also take mall types: `store` (sign and window only), `openStore`, `bigStore` (two storeys), `boarded` (under renovation) and `foodStall` (food court counter and menu board).
- **`traffic`:** `road`, `bikes` (the v215 cyclists) or `none`.
- **`crowd`:** how busy it is.
- **`seed`:** fixes everything random, so every viewer sees the same picture. Never `Math.random()`.
- **`custom`:** an optional hook for hand-drawn landmarks, so the special places don't all look alike.

Rules:
- Front and prop types are code: one drawing function each, written once and following the guidelines (`R()` only, outlines, night, rain).
- New types are added by hand. A spec only combines them.
- `west1`-`west3` are rewritten as specs and must look the same, pixel for pixel, as a test of the kit.
- Every kit scene draws correctly with `DREAMING = true` and in the builder (`window.__builder`).

## Phase 3: new ground (decided 2026-11-12)
No bike for now: he walks, and far trips stay by bus or taxi. The bike notes are kept at the end ("Later") for when it comes back.

Build order: phases 1 and 2 first (the world file and the block kit), because about 17 new screens follow and the mall floors are almost the same picture. Then, in this order:

**3a. The promenade.** West of the Pump House: the plaza's left edge (free today) leads to it.
- Three pass-through blocks (`prom1`-`prom3`): the sea, sand, the railing, palms, benches, a lifeguard tower, joggers, dog walkers, a kiosk cart. The sea moves on the clock; sunset over the water by the real Tel Aviv time.
- The mall's doors stand on `prom3` (3d).
- Its own bus stop on `prom1`, so a trip home doesn't have to be a long walk back through the park.
- One `story` place, `promenade` (the story says "the promenade"; the page walks him to a spot in one of the three blocks).
- `places.json` (decided 2026-11-12: any hour, every day, so no `open`; the rest filled by Claude):
  `"promenade": { "stay": [20, 120], "rate": { "week": [[7, 9, 3], [17, 21, 6]], "fri": [[8, 18, 8]], "sat": [[8, 20, 10]] }, "weather": { "rain": 0.1, "hot": 1.2, "cold": 0.5 }, "with": 35, "meet": 25, "people": { "noa": 3, "tomer": 2, "dana": 1 } }`.
  Open at night like the park, but the outing rate is 0 then, so he only goes when the story or a goal takes him.

**3b. Three more Herzl screens (`east1`-`east3`), past the café.** The shops block's right edge leads on to `east1` (it leads to the café today). The café is entered by its corner door on the shops block instead, so the café keeps its place.
- Built with the kit, each with one thing that is only there:
  - `east1`: a **statue** on a small square (decided): a figure built of bricks with a cube for a head, on a stone plinth, and a plaque that reads **"Stanley Cubrick"** (spelled exactly so). Pigeons sit on the cube. The hosts can have fun with it; Ishai has opinions about it.
  - `east2`: a **mural** on a blank side wall (subject to choose), and the **kiosk** (3c);
  - `east3`: a small **fountain** with a ring of benches, the water switched off at night.
- Pass-through, like the west blocks: no prompt cost. Each needs a `FILL` and an `OVERHEARD` entry.

**3c. The kiosk on Herzl east (`kiosk`, a story place).** A Tel Aviv street kiosk with its own camera: a counter open to the sidewalk, fridges of drinks, sweets and newspapers, sunflower seeds in bins, a lottery stand, two plastic chairs and a table outside, a radio on the counter.
- **Open 24/7** (decided), Shabbat too: no `open` in `places.json`.
- **The owner, Shmulik** (new character, by Claude): late fifties, once a cook on cargo ships, now behind the counter from 06:00 to 18:00 every day. Gruff, says little, knows everything about everyone on the street. Keeps a notebook of tabs for regulars, is sure this week's lottery ticket is the one, plays backgammon with anyone who sits down, has the football on the radio, and slips Falafel a biscuit while pretending he doesn't like dogs. A regular (`SEED_CAST` with `regular: "kiosk"`, `POST`, `MUTTER`, a new `INK` colour no one uses). Look: grey buzz cut, a thick moustache, glasses, a faded polo, an apron.
- **Nights:** a nameless night clerk (muted, like the cover barista) from 18:00 to 06:00, so the 24/7 kiosk is never staffed by a man who never sleeps. Whereabouts already send a cover when Shmulik is elsewhere.
- Actions: `idle`, `eating`, `drinking`, `talking`, `phoning`; he sits on the plastic chair with a drink, or plays backgammon with Shmulik (a new seated pose, `backgammon`, kiosk only).
- `places.json` (filled by Claude): `"kiosk": { "stay": [5, 30], "rate": { "week": [[7, 10, 4], [20, 23, 4]], "fri": [[8, 14, 5]], "sat": [[9, 22, 4]] }, "weather": { "rain": 0.7, "hot": 1.3 }, "with": 10, "meet": 50, "people": { "boaz": 2, "moti": 2, "avi": 1, "levi": 1 } }`. A late-night snack run after 23:00 comes from the story, not the outing roll (outings stop at 23:00).

**3d. The Big S, the mall on the promenade.** Three floors, eight screens:
- Floor 1 (`mall1a`-`mall1c`) and floor 2 (`mall2a`-`mall2c`): three screens each. Floor 3 (`mall3a`, `mall3b`): two screens, the **food court** under a **glass ceiling** (the real sky through it, day, night and rain on the glass).
- **Built from one kit:** the same floor, columns, railings, tiles and lights on every screen. The stores change: most only by the sign and the window, some by their whole front (a store with an open front, a big two-storey shop, a store under renovation behind boards). Shops use the show's fictional brands (Everything Else, PicSell, Yalla Yoga, FluffNap, Kfar Kofi, Herzl Hardware...) and new ones.
- **Escalators on every floor,** on the middle screen (`mall1b`, `mall2b`, `mall3a`): up and down side by side. Going up a floor he walks to the foot of the escalator and rides it out of the top of the picture; the next floor's screen finds him stepping off it. This is a camera switch at a door like any other (`MAP`), so companions and whereabouts work unchanged. The steps move on the clock.
- **Story places:** two, to keep the prompt short: `mall` (floors 1 and 2: browsing, buying, meeting someone) and `foodcourt` (floor 3: eating, drinking, sitting at a table). The page picks the screen within the floor from the text (the store named, or by the clock like the errands), so the AI never has to choose between eight screens.
- **Hours (decided):** stores and the food court 09:00-22:00 Sunday to Thursday, Friday until 16:00, closed on Saturday (all shops closed on Shabbat). The building's doors follow the same hours for now.
- `places.json` (the rest filled by Claude):
  `"mall": { "stay": [30, 120], "open": { "week": [9, 22], "fri": [9, 16] }, "rate": { "week": [[10, 13, 3], [17, 21, 4]], "fri": [[9, 14, 5]] }, "weather": { "rain": 1.5, "hot": 1.4 }, "with": 35, "meet": 15, "people": { "noa": 3, "tomer": 2, "dana": 1 } }`
  `"foodcourt": { "stay": [20, 60], "open": { "week": [9, 22], "fri": [9, 16] }, "rate": { "week": [[12, 14, 3], [19, 21, 3]], "fri": [[11, 14, 3]] }, "weather": { "rain": 1.4, "hot": 1.3 }, "with": 40, "meet": 15, "people": { "tomer": 3, "noa": 2, "boaz": 1 } }`
- **Saturday later:** the director is thinking of a cinema open on Saturday, and maybe arcades and bowling. When one is built, The Big S's doors open on Saturday for it alone, with its own hours, while every store stays shuttered (shutters drawn on the store fronts, lights low). The kit's `boarded` front gets a `shuttered` brother for this. See "Later".
- The mall's entrance on `prom3` is a door (like the café's); a mall bus stop is not needed while the promenade has one.

## Phase 4: the map editor
A new tab on the director page (dev only, like `/builder`):
- **The map:** places drawn as boxes from `layout`, links as lines, coloured by `mode`. Story places and pass-through places look different.
- **Adding a place:** click a door to add a link, or add a new empty place.
- **Brief:** a new place gets a short text field for what should be on it, e.g. "a Yemenite Quarter alley at dusk, a spice shop and a juice stand".
- **Place settings.** Choosing a place opens its settings, the same fields as `story/places.json`:
  - **Opening hours** (`open`) for Sun-Thu, Friday and Saturday, or "never closes";
  - **Visit hours** (`rate`): when and how likely a random outing there is, per day type, plus `byDay` for one weekday (like the bar on Thursdays);
  - **Weather** multipliers for rain, heat and cold;
  - **Company:** `with` (a friend comes along), `meet` (he meets someone there) and `people` with weights, picked from the cast;
  - **Stay** (`[min, max]` minutes);
  - **Event only**, with a line saying which event.
  Pass-through places have none of these, only `walkMin`; the panel says so.
- **Three ways to fill them,** per place and per group of fields:
  - **By hand.**
  - **Same as another place:** pick a place ("same as the café") and its settings are copied in. They are a copy, not a link, so the director can tweak them after. A small "copied from café" note stays until something is changed.
  - **Ask Claude:** the fields are marked `ask` and left empty. They go with the draft through Send to Claude, and Claude fills them when building (phase 5).
- **Checks while editing:** visit hours outside the opening hours are shown in red; a chart shows the total outing chance per hour of the week with the new place added, since the rates add up (about 32% on a Sunday at 17:00 today), so a new place doesn't quietly make him go out much more.
- **Stubs never go on air.** A stub stays out of the live map until its art exists. This follows "a place without a connection must not ship" and the missing-art rule.
- **Saving (decided 2026-11-11):**
  - **Autosave in the browser:** while the director edits, the draft is saved in `localStorage` on every change. It costs nothing.
  - **Send to Claude:** a button writes the draft to one KV key (`world:draft`), one write per press, never on autosave. A dev-only `/api/world` serves it, so the director only has to say "build the new screens".
  - **Export:** the editor can still download `world.json` with the briefs, as a backup or snapshot.
  - **The repo is the truth.** The draft only holds proposals. When Claude builds them into `story/world.json` and pushes, it clears the built items from the draft. If the draft was made from an older map, the editor says so and offers to rebase it on the live one.
  - **No push from the page:** the page never commits by itself.

## Phase 5: the scenery generator (Claude, not the live AI)
1. **Brief:** the director adds stub places and briefs in the editor.
2. **Ask:** in a chat, the director asks Claude to "build the new screens".
3. **Read:** Claude reads the briefs from the draft sent with Send to Claude (`/api/world`), or from an exported file.
4. **Build:** Claude writes a block spec for each. A landmark gets a `custom` drawing, and new front or prop types are added to the library.
5. **Fill the settings marked `ask`:** Claude writes them into `places.json` from the brief and the closest existing places (a juice stand is open like the market, a beach kiosk sees more visits in the heat and fewer in the rain). It keeps the weekly outing total about where it was, and says in the chat which values it chose and why, so the director can change them.
6. **Check:** Claude checks the work against `SCENE_GUIDELINES.md` and previews it with Playwright: day, night and rain, with a companion, and in a dream.
7. **Ship:** Claude builds, bumps `VERSION`, updates `CLAUDE.md` ("Places: hours and outing rates") and pushes.

Why not generate scenes with the live AI:
- Drawing code from a model can break the page for every viewer.
- It is hard to keep it in the show's style.
- It would spend the free budget.

Optional and cheap: long filler stretches (a bike path, the promenade) can be made from a seed by the kit, with no AI at all.

## Risks and costs
- **Walking time.** Realism means far places take long on foot: home to the mall is about 10 blocks. The promenade's bus stop, the taxi and the hosts' fill lines carry it.
- **Sameness.** Generated blocks can look alike. Keep hand-made landmarks every few blocks.
- **Sync.** Anything generated must come from its seed and the clock. Never per-browser randomness.
- **Page size.** `index.html` is about 5,900 lines in one file. Splitting scenes into files that `build.mjs` joins would help. The worker bundle is about 4 MB, and Cloudflare now allows 64 MB on every plan (the old 3 MB compressed limit was dropped in September 2026).
- **Every scene must handle everything:** night, rain, depth, crowd, companions, Falafel, dreams, the builder, and `joinMoment()` replays. The kit is what keeps this cheap.
- **Story places cost prompt space.** If many are added, send full descriptions only for the current place and its neighbours, and names for the rest.

## Open questions for the director
1. The mural on Herzl east 2: what does it show?

Decided:
- 2026-11-11: the map editor saves drafts in the browser and sends them to KV only with Send to Claude (see phase 4).
- 2026-11-12: no bike for now. Order: phases 1-2, then the promenade, Herzl east 1-3 with a landmark each, the kiosk, the mall. The map editor (phase 4) and the generator (phase 5) come after these.
- 2026-11-12: the statue is Stanley Cubrick (bricks, a cube head); Claude creates the kiosk owner (Shmulik); the mall is The Big S, shops 09:00-22:00, Friday until 16:00, closed on Saturday; the kiosk is open 24/7; the promenade at any hour. Claude fills the other place settings (above). Together the new places raise the hourly outing chance by a few points at their busiest hours; Claude checks the totals when building.

## Later
- **Saturday at The Big S:** a cinema (open on Saturday), maybe arcades and bowling. Likely on floor 3 next to the food court, or a floor of their own. Each becomes a story place with its own `places.json` hours.
- **The bike** (dropped for now): a fictional bike-share or his own bike from the bicycle shop in `west3`; poses `cycling`, walking the bike, docking; `mode: bike` on links for routes of 4+ blocks, never in rain, at night, on Shabbat, with a friend on foot or with Falafel; about 3 times walking speed. The v215 cyclists stay as background.
- **Falafel's walks** (`WALKS`) on longer loops: the promenade is a good one.

## Test before pushing (every phase)
There is no test suite. Serve `source/public` and drive it with Playwright, as in `docs/BUILDER_PHASE2.md`. For each phase:
- **Phase 1:** the generated `MAP` and `NEXT` equal today's, every `places.json` entry still loads the same, and whereabouts give the same minutes as before for today's map.
- **Phase 2:** `west1`-`west3` from specs match the old pictures, pixel for pixel.
- **Every new scene:** check day, night and rain, with and without a companion, and in a dream.
- **Every phase:** there are no console errors, and the main page still runs.

Then run `cd source && node build.mjs`, bump `VERSION`, update `CLAUDE.md` and `docs/SCENE_GUIDELINES.md` (the map table), commit and push to `main`.
