# A growing world: more people and places, made when the story asks

Draft 2026-11-21. **Status: steps 1-5 built (v280-v284).** Builds on `docs/WORLD_PLAN.md` (the block kit, the map) and `docs/CAST_PLAN.md` (cards, the review). Read `CLAUDE.md` and `docs/SCENE_GUIDELINES.md` first.

## Decided (2026-11-21)
- **Approval setting**, one per kind of change: `auto`, `claude` or `director`. Every kind starts on `auto`. This includes the cast cards' growth, which today always waits for a review.
- **Made when the story asks**, for both people and places. Nothing grows by itself on a timer.
- **The city can grow almost anywhere.** A rough aerial map of the city (`story/city.json`) decides where a new place goes, so the city keeps its logic.

## The idea in one line
The live show makes data, never drawing code. A new person is a look, a name and a role from fixed menus. A new place is a JSON description that the block kit draws from a library of parts. Both come from a seed (the same for every viewer), are saved in D1 and are put on the map. Nothing a writer can produce can break the page.

## The city map: `story/city.json`
Districts on a coarse grid (6 × 3), not screens. Sea to the west, Herzl Street across the middle.

```
            N
  SEA | OLD PORT  . . .  LAKE PARK  . . . . . . . . THE HILLS
  SEA |     |               |                           |
  SEA | PROMENADE - PUMP HOUSE - HERZL ST (home) - MARKET QUARTER - UNIVERSITY HILL - WORKSHOPS
  SEA | The Big S   Gan Ha-Ir     cafe, kiosk      Shuk Shalom      Tel Herzl
  SEA |     |                       |                    |
  SEA | SOUTH BEACH  . . . . . . OLD CITY  . . . . . . ZOO ROAD
```

Each district has `feel` (what it looks like, for the writer and the parts), `fits` (the kinds of place that belong there), `room` (how many more story places it takes), `places` (what's there today), `from` (how you get there) and `grow` (where new street blocks attach and which way the street goes on).

**Where a new place goes** (`cityPick()`, no AI):
1. Keep the districts whose `fits` include the place's kind and that still have `room`.
2. If the story named a district or a neighbour ("in the old city", "near the market"), use it.
3. Otherwise prefer a district Ishai can reach (on foot or one bus ride), then one that already has places, so the city fills in before it spreads.
4. Inside the district, the place gets the next free square on the screen map (`map` in `world.json` terms), by the district's `grow` edge.
5. A district that doesn't exist yet on the screen map (the Old City, say) is opened with its first street block. It gets a bus stop if `from` says bus, or walking blocks from its `grow` edge if on foot.

The director can edit `city.json` (names, feel, fits, room) like `places.json`; the build checks it (known place ids, every district reachable, `grow` edges on real places). `/map` gets a third view: the districts from above, with what each holds.

## Approval: `auto` / `claude` / `director`
One setting per kind, on the director page (MORE → Growth), kept in its own KV key like the hosts' language (`cfg:approve`):

| Kind | What it covers | Starts on |
|---|---|---|
| `blocks` | new pass-through street blocks | auto |
| `places` | new story places (somewhere to go in, with hours) | auto |
| `people` | new named townsfolk | auto |
| `promote` | a townsperson joining the real cast | auto |
| `cards` | the cast cards' growth and histories (`cast_pending`, today always reviewed) | auto |

- **auto:** the change goes live at once, after the same code checks as always (look and part menus only, fictional brands only, no secrets leaking (`castLeaks()`), nobody dies, the map checks). It is still logged in the review list, marked AUTO, and can be undone there.
- **claude:** it waits for the weekly scheduled review (the cast review's token and `/api/cast/pending`). Unreviewed in 7 days → it expires, as today.
- **director:** it waits in the NOW inbox for the director.
- Auditions keep their own flow (the director's green light); this setting doesn't touch them.
- For `cards` on `auto`, `castWeekTick()` and `castDraftTick()` pass their proposals straight to `castReview()` with `by: "auto"` instead of leaving them pending.

## When the story asks
The story writer's reply may carry `need` on a moment (at most one, checked by `validate()`):
- `{"kind": "person", "role": "a new waiter", "at": "cafe", "why": "..."}`
- `{"kind": "place", "type": "karaoke bar", "near": "market", "why": "Noa wants to sing"}`

The prompt tells the writer it may ask for one when the story really needs someone or somewhere that doesn't exist, never for Ishai's home, and that the new person or place appears from the next moment. Limits (`GROW_MAX`): at most 4 new people and 1 new place a day; more waits for tomorrow. Surveys' `join` and `place` winners and the outings may ask the same way later.

## People: the town registry
D1 table `town` (id, name, look, role, kind, home district, post place, hours, voice gender, seed, state, made, met, scenes).
- **Made from the seed, no AI:** the name from name pools (Israeli first names by gender, a surname when needed), the look from `LOOK` (weighted so it fits the role: an apron for a waiter, a uniform from `roles.json` when the role has one), hours from the role kind's `hours` in `roles.json`, voice gender from the name. One small Gemini call fills a personality line, a way of speaking and one memory, through the same checks as a cast card. Without Gemini they get a stock line from the role.
- **The ladder:**
  1. *Extra*: drawn at their post in their hours, no lines (`memberLayer()` already does this for audition characters).
  2. *Townsperson*: named, can talk (like a local, but they come back by name). The story prompt lists only the ones where Ishai is (`townNote()`, like `localsNote()`), so the prompt stays the same size however many there are.
  3. *Regular*: after 3 scenes with Ishai, they get a cast card and notes through the scene keeper.
  4. *Cast*: they join `s.cast` (`promote` approval). From then on they are like Noa or Dana.
- Whereabouts, voices, `INK` colours (from `INK_MORE` by name), the Cast tab (TOWN tag) and the sandbox's With list all read the registry.

## Places: parts, specs and the runtime map
- **The parts library (built in v283: `source/growcore.mjs` + the page's `growScene()`; 9 grounds, 11 fronts, 20 props, 10 rooms; see CLAUDE.md):** `block()`'s pieces become named parts with a few settings each. Building fronts (`shop` with a sign word and colours, `entrance`, `restaurant`, `bar`, `kiosk`, `mural` from a picture list, `blank`); props (`lamp`, `tree`, `bench`, `bins`, `stall`, `umbrella`, `bikes`, `planter`, `busstop`); grounds (`street`, `alley` (stone, no cars), `promenade`, `park`, `indoor`). Interiors: room templates per kind (`cafe`, `bar`, `shop`, `restaurant`, `hall`, `studio`, `outdoor`), each with tables or counters, a post for staff, seats, a WC door when the kind has one.
- **A place is JSON** (`kind`, `ground`, `fronts`, `props`, `palette`, `words` for the signs, `seed`). `blockFromSpec()` turns it into a scene. Existing hand-made scenes stay as they are; landmarks stay hand-made by Claude.
- **The generator (worker, no AI for the drawing):** from the need and the district, `growPlace()` picks a template and parts by seed. One small Gemini call writes the name (fictional, checked against the brand rules), the story description, the actions and the sign words. It also writes the `places.json` rules from the closest place of the same kind (hours, rate, stay, people), keeping the hourly outing total about where it is. When the place is far from the street, it adds the pass-through blocks on the way.
- **The runtime map:** `world.json` (built) + D1 `world_gen` (generated). The worker merges them in every tick (`worldLoad()`, like `castLoad()`), and recomputes `NEXT`, `WALK`, `FOOT` and `PLACES` with the same code as `source/world.mjs` (moved to a shared file the build includes in both). The page gets `worldV` in `publicState`; when it changes, it fetches `/api/world` and merges `MAP`, `WALK` and the specs (no deploy, no reload). `/map` and the builder show generated places too.
- **Prompt size:** `PLACES` sends the full description only for where he is, its neighbours and places named in the goal or the talk; the rest go as names. This also helps today's prompt.
- **Promoting to the repo:** generated places live in D1. Now and then the director can ask Claude to "fold the grown places in", which moves them into `world.json` and `places.json` and gives the best ones hand-made landmarks.

## Costs
- AI: at most about 5 small Gemini calls a day (4 people, 1 place); none for the drawing.
- D1: a few writes a day (well inside the free 100k). KV: one write when the approval settings change, none on growth.
- Page: the parts library adds code once; each place is a few hundred bytes of JSON.

## Risks
- **Sameness:** generated blocks will look alike until the parts library grows. Claude adds parts and a hand-made landmark per district over time.
- **Every scene must handle everything** (night, rain, depth, crowds, companions, Falafel, dreams, replays, the builder, 8bitTV memories): the parts must, so every generated place does.
- **Sync:** everything from the seed and the clock, never `Math.random()` in the page.
- **Runaway growth:** the daily limits, the districts' `room`, and the director's off switch for each kind.

## Build order
1. **Approval settings** (`cfg:approve`, director page MORE → Growth, the AUTO mark and undo in Reviewed); `cards` on auto through `castReview()`.
2. **The city map:** `story/city.json` (done in this draft), the build check, the districts view on `/map`.
3. **The runtime map:** shared map code, D1 `world_gen`, `worldLoad()`, `/api/world`, the page's merge, `PLACES` trimmed to the neighbours. Tested with one hand-written generated block.
4. **Parts and specs:** the parts library, `blockFromSpec()`, interiors per kind; sandbox controls (a spec editor and Random place).
5. **The town registry:** the `town` table, the seeded maker, the ladder, `townNote()`, drawing at posts.
6. **The story asks:** `need` in the prompt and `validate()`, `growPerson()`, `growPlace()`, `cityPick()`, the limits, the review list.
7. **Health and the director:** `/api/health` → `growth`, a Growth box (what grew, where, by whom, undo / pause per kind).

Each step: serve the page and check it with Playwright (day, night, rain, a companion, a dream, a replay), no console errors, then build, bump `VERSION`, update `CLAUDE.md`, push.
