# A bigger world: plan

Draft, 2026-11-11, updated 2026-11-12 for the places table (v214-v217). Not approved, nothing built yet. Read `CLAUDE.md` and `docs/SCENE_GUIDELINES.md` first.

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

- **`ground`:** `sidewalk+road` (like Herzl St.), `promenade` (sand, sea, railing), `path` (park), `bikepath`.
- **`buildings`:** for each building, x, width, height, colour and roof.
- **`fronts`:** each takes a front type from a library (`shop`, `cafe`, `entrance`, `kiosk`, `billboard`, `wall`, `hedge`, `trees`) with its sign text, palette and window goods.
- **`props`:** each takes a prop type from a library (`lamp`, `ficus`, `bin`, `bench`, `bikeRack`, `crates`, `scooter`, `palm`, `lifeguardTower`).
- **`traffic`:** `road`, `bikes` or `none`.
- **`crowd`:** how busy it is.
- **`seed`:** fixes everything random, so every viewer sees the same picture. Never `Math.random()`.
- **`custom`:** an optional hook for hand-drawn landmarks, so the special places don't all look alike.

Rules:
- Front and prop types are code: one drawing function each, written once and following the guidelines (`R()` only, outlines, night, rain).
- New types are added by hand. A spec only combines them.
- `west1`-`west3` are rewritten as specs and must look the same, pixel for pixel, as a test of the kit.
- Every kit scene draws correctly with `DREAMING = true` and in the builder (`window.__builder`).

## Phase 3: movement
**Walking further.**
- **Falafel's walks** (`WALKS`) take longer loops through the pass-through blocks.
- **Longer outings:** the story can send him to places that are a real walk away, and the hosts fill the walk (`quietHosts()`, `FILL`).

**The bike.**
- **Bike-share:** a fictional bike-share. The name and colours are the director's pick (never Tel-O-Fun's green). Docks stand by the bus stop on the street, at the park and at the Pump House plaza, which already has a bike rack.
- **His own bike:** optional. It could be an unlock, bought at the bicycle shop in `west3`.
- **New poses:** `cycling` (pedalling, two frames), walking the bike, and docking or undocking.
- **Route choice:** `mode: bike` on links. `route()` takes the bike for long walking routes, about 4+ blocks. Exceptions:
  - in rain, at night and on Shabbat he walks or takes a taxi;
  - with a friend on foot, both walk;
  - with Falafel, he walks (Falafel is on the short leash since v215).
- **Speed:** about 3 times walking. A block takes about 3 s.
- **Story side:** the worker does not need to know. The story still says street > park, and the page picks the bike. One prompt line can say that he sometimes cycles, so he can mention it.
- **In the picture:** done in v215 for Herzl St. (`bikeAt()`, `bikeRideBy()`, `BIKE_SEED` per place). Kit scenes with `traffic: bikes` reuse it, and Falafel's barking at them comes for free.
- **Outings:** a far outing (`outingTick()`) with a route of 4+ blocks is a natural bike ride. The stay rules start counting when he arrives, not when he sets off.

**New ground to cover (ideas, the director picks).**
- **The promenade:** a stretch of the seafront west of the Pump House. It is a few pass-through blocks with the sea, sand, a lifeguard tower, joggers and bikes. It could end at one story place, such as a beach kiosk.
- **More of Herzl St. east,** past the café.
- **A long bike-path stretch along a park.** It can be generated from a seed, since it is mostly trees and benches.

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
- **Walking time.** Realism means far places take long on foot. The bike, rides and the hosts' fill lines carry it.
- **Sameness.** Generated blocks can look alike. Keep hand-made landmarks every few blocks.
- **Sync.** Anything generated must come from its seed and the clock. Never per-browser randomness.
- **Page size.** `index.html` is about 5,900 lines in one file. Splitting scenes into files that `build.mjs` joins would help. The worker bundle is about 4 MB, and Cloudflare now allows 64 MB on every plan (the old 3 MB compressed limit was dropped in September 2026).
- **Every scene must handle everything:** night, rain, depth, crowd, companions, Falafel, dreams, the builder, and `joinMoment()` replays. The kit is what keeps this cheap.
- **Story places cost prompt space.** If many are added, send full descriptions only for the current place and its neighbours, and names for the rest.

## Open questions for the director
1. **Bike:** a bike-share (name and colours?), his own bike, or both?
2. **First new ground:** the promenade, more of Herzl St. east, or something else?
3. **Order:** build phases 1-2 first (no visible change), or start with the bike on today's map?

Decided: the map editor saves drafts in the browser and sends them to KV only with Send to Claude (see phase 4).

## Test before pushing (every phase)
There is no test suite. Serve `source/public` and drive it with Playwright, as in `docs/BUILDER_PHASE2.md`. For each phase:
- **Phase 1:** the generated `MAP` and `NEXT` equal today's, every `places.json` entry still loads the same, and whereabouts give the same minutes as before for today's map.
- **Phase 2:** `west1`-`west3` from specs match the old pictures, pixel for pixel.
- **Every new scene:** check day, night and rain, with and without a companion, and in a dream.
- **Every phase:** there are no console errors, and the main page still runs.

Then run `cd source && node build.mjs`, bump `VERSION`, update `CLAUDE.md` and `docs/SCENE_GUIDELINES.md` (the map table), commit and push to `main`.
