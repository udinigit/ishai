# The Wild: the army clears the land, workers bring back the pixels the city grows from

Draft 2026-11-26, the director's answers 2026-11-28. **Status: plan only, nothing built.** Builds on `docs/GROWTH_PLAN.md` (the city map `story/city.json`, `cityPick()`, grown places in D1 `world_gen`) and the town registry (code people). Read `CLAUDE.md` and `docs/SCENE_GUIDELINES.md` first.

## Decided (2026-11-26, answers 2026-11-28)
- **A real Wild.** Past the city limit the land is unfinished. The city grows only into land that has been cleared.
- **Two jobs.** **Army soldiers** clear an area of bugs; then **workers** go in and collect **pixels** of different colours. The pixels are what expands the city limit.
- **Nobody dies.** A soldier hit by a bug is knocked out and carried back to base by the others (or by the medics if the whole squad goes down), and is back on duty the next day. Hurt is allowed, death is not (the season rule).
- **Viewers clear it** by playing the soldiers' part. Workers are not played: they follow a cleared area by themselves, with no AI.
- **Viewers never send Ishai, and Ishai never goes** to the Wild. He only sees the city grow.
- **Viewers pick a commander** from a fixed roster. A commander in use by another viewer is **busy**: that limits how many people play at once.
- **A commander leads a squad of 4 soldiers.** The soldiers follow the commander and protect them.
- **The commander plays by itself** (computer controlled) unless the viewer takes direct control. Viewers give orders: grouping, where to send soldiers on screen, when to advance, when to split.
- **The commander retreats** when the squad is lost. Each commander has a hidden retreat point (around 20%, varies) and a hidden strength. Viewers see only the **rank**, which rises with wins.
- **Skill matters**: about 30% wins for a bad player, 50% normal, 70% advanced, 95% the best. These are the results the levels are tuned to give, not dice the server rolls.
- **2 wins clear an area** to start (there are no active players yet; raise it later).
- **Warning signs at the edges**: where the city meets the Wild, the way out gets a danger sign and a fence ("DANGER · MILITARY ZONE · THE WILD · DO NOT CROSS"); where a street just ends because the city isn't built there yet, a construction barrier ("ROAD WORKS · CITY UNDER CONSTRUCTION"). See "The border" below.
- **Director only** to start.

## The story
- Beyond the city's edge is the Wild: half-drawn trees, bare ground, glitchy pixels. It is the edge of the set, like the sea in The Truman Show.
- An army unit (code people, the scripted townsfolk, see the hierarchy below) goes out from its base in army trucks to clear the bugs. Behind them, workers in hard hats collect **pixels** from the cleared land: loose pixels of every colour lying in the half-drawn ground. Each colour builds a different part of the city (green for parks, grey and brown for streets and buildings, blue for water, gold for the special places), so a new district looks like the pixels it was made from.
- The Wild's creatures are **bugs**: glitch animals and blobs. Jump on one and it bursts into pixels; it comes back later. No blood, nothing realistic.
- **The hierarchy:** code people (locals, townspeople, soldiers and workers: scripted, no AI) → AI actors (the cast: memories, moods, they know it's a show) → Ishai (the only real mind, doesn't know). AI actors don't like the Wild: being near the edge makes them uneasy about what's real. Material for a later secret (an actor who went out there once).
- In town, the Wild is ordinary background: army trucks at dawn, dusty workers at the kiosk, the radio's "Wild report", a host line when an area is cleared ("The north ridge is open, folks, the city's growing!").
- The realistic-city rule stays: everything in town keeps real-world logic. The Wild is the only strange place, behind a fence, and only the army and the workers go there.

## Where the Wild is on the map
`story/city.json` is a 6 × 3 grid. The Wild is a ring of **wild areas** around it: squares outside the grid (north of row 0, south of row 2, east of column 5; the sea stays west). Each wild area has:
- `id`, `grid` [col, row], `name` ("The North Ridge"), `biome` (forest, rocks, marsh, dunes...), `need` (wins to clear, default 2), `wins` (so far), `cleared` (date or null), `pixels` (what the workers have collected since, by colour), `next` (which areas open once this one is cleared: you clear outward from the city).
- Only areas touching the city or a cleared area are open to play.
- Once `wins` reaches `need` the area is **cleared**. The workers then collect its pixels over the next days (no AI, a few points a tick, shown as a progress bar on the director page and in the radio's report). When they have enough of each colour the area needs, it becomes a new **district** in the city map (new entry with `room`, `fits`, `style` from its biome, and a `grow` edge from the nearest district). From then on `cityPick()` can put new places there, through the normal Growth flow (approval setting `places` / `blocks`).
- Kept in D1 (`wild_area`), not in `city.json`, because it changes at runtime; the worker merges cleared areas into its copy of the city like `world_gen` merges grown places.

## The border: where the city ends
`story/city.json` already knows the city limit: it is the outer edge of its 6 × 3 grid. The sea is the west edge (no Wild there). The Wild is everything past the other three edges.

| Edge | Districts on it | Built screens there today |
|---|---|---|
| North | The Old Port, Lake Park, The Hills | none |
| East | The Workshops | none (closest: University Hill, the campus) |
| South | South Beach, The Old City, The Zoo Road | none |

So **no screen touches the Wild yet**: every place where a walk ends today leads into city districts that aren't built, not into the Wild. Two kinds of sign follow from that:
- **Construction barrier** ("ROAD WORKS · CITY UNDER CONSTRUCTION"), page only, at screen edges that lead nowhere yet: the east end of Herzl Street (`east3`'s right edge) and the open sides of the market and the campus (bus-only today). It comes down by itself when Growth builds a block there.
- **The fence** ("DANGER · MILITARY ZONE · THE WILD · DO NOT CROSS", a guard post, barbed wire, the half-drawn land behind it): on the outer edge of a built screen in a district on the city limit, on the side that faces the Wild. The first one appears when Growth builds into one of those districts (its `grow` edges already point there: campus → the Workshops, promenade → the Old Port and South Beach, park → Lake Park, campus → the Hills, street → the Old City, market → the Zoo Road).
- **The army base**: the natural place is **The Workshops** (east, industrial, on the limit): a gate, a few army trucks, the workers' depot. Until it is built the trucks are only heard and mentioned ("the army trucks went out east at six").
- When an area is cleared and becomes a district, the limit moves: the fence moves out to the new edge and the old fence comes down.

## The game
Think *Lemmings* / *Pikmin* in a side-scrolling platformer. Drawn by the page with the show's own art, at the page's 108-pixel height, scrolling sideways. **No AI at all.**

### A run
- The viewer picks an open wild area and a free commander. The commander is marked busy (a D1 lock with an expiry, so an abandoned run frees them after ~10 minutes).
- The level comes from a **seed** the server hands out (area + date + run number): ground, gaps, ledges, bug nests and bugs. Same seed, same level, for everyone.
- Goal: get the squad to the far end and plant the **flag** at the area's marker. Bugs left alive behind the squad stay in the area, so the score also counts the nests destroyed on the way.
- **Win**: the flag is planted. **Retreat**: the commander turns back. **Lost**: everyone, commander too, is knocked out (the medics' truck picks them up).
- A run lasts about 3-6 minutes.

### The soldiers
- 4 soldiers follow the commander in a line, jump when they jump, stop when they stop.
- They **protect** the commander: when a bug comes within range, the nearest soldier steps in front and stomps it. A soldier who touches a bug from the side is **knocked out**: the others drag him back (he leaves the screen to the left) and the squad is one short for the rest of the run. He is back on duty tomorrow.
- A nest needs two soldiers at once (one holds, one stomps), so splitting and grouping matter.

### The commander
- **Auto mode** (default): a simple script, not an AI model. Walk right, jump gaps and ledges, wait for the squad, stop when bugs are near and let the soldiers deal with them, attack nests when the squad is full. How well it does this is the commander's hidden **strength**: reaction time, how often it misjudges a jump, how careful it is with nests.
- **Retreat**: when the soldiers left fall to the commander's hidden **retreat point** (e.g. 1 of 4 left for a cautious one, 0 for a brave one), the commander turns back. A retreat counts nothing toward clearing.
- **Direct control**: the viewer can take the commander at any time (arrows / on-screen buttons on phones) and give it back.

### Orders (the viewer's tools)
- **Group**: tight (safer, slower), spread (covers more, riskier), line.
- **Send**: tap a spot on screen; a chosen soldier or the group goes there (onto a ledge, at a nest, ahead to scout).
- **Split**: two groups, e.g. 2 hold a ledge while 2 take a nest.
- **Hold / advance / regroup**.
- **Retreat now** (the viewer may retreat earlier than the commander would).

### Skill and the 30 / 50 / 70 / 95 bands
The server never rolls a win. The result is whatever happens in the level. The bands are **design targets** we tune toward:
- A level's difficulty is set so that the commander alone (auto mode, mid strength) wins about **40%** of runs.
- Bad orders (sending soldiers into bugs, splitting badly) drag it down to about **30%**; no orders at all about **50%** with a good commander; sensible grouping and sending about **70%**; a player who splits, scouts and takes control at the hard jumps about **95%**.
- We check this in the sandbox with scripted test players before opening it (step 2).
- Viewers never see the numbers, only the outcome and the commander's rank.

### Commanders
- A roster of, to start, **8 commanders** (code people, never cast): name, look (from `LOOK`, in army uniform with a beret), voice gender, a short line or two (a catchphrase on setting out, one on retreating).
- Hidden: `strength` (0.3-0.9), `retreatAt` (0-2 soldiers left), `nerve` (how readily it attacks nests).
- Visible: **rank** (Recruit → Scout → Ranger → Captain → Veteran → Legend), from wins: 0, 3, 10, 25, 50, 100.
- A commander's stats never change with rank. Rank is reputation, so viewers learn which ones are actually good.
- **Busy**: one viewer at a time. With 8 commanders, at most 8 runs at once.
- The squad is drawn fresh each run (4 nameless code people in army fatigues and helmets).

### Fairness and cheating
The game runs in the viewer's browser, so the browser reports the result. The server:
- hands out the seed and a run id, and accepts one result per run id;
- checks it is possible: the run took at least the level's minimum time, nests destroyed are within what the seed's level holds, soldiers knocked out are 0-4;
- keeps a short **input log** (orders with timestamps, compact) so a result can be replayed later in the sandbox and checked if it looks wrong;
- limits runs per signed-in viewer per day (start: 5).
Good enough for a free show; nothing is worth cheating hard for.

## Data (D1, no KV writes, no AI)
- `wild_area` (id, grid, name, biome, need, wins, cleared, pixels, state).
- `wild_cmd` (id, name, look, gender, strength, retreatAt, greed, wins, runs, busyBy, busyUntil).
- `wild_run` (id, area, cmd, voter, seed, started, ended, result win|retreat|lost, nests, knockedOut, log).
- Director: a WILD box on the director page (areas with progress, the roster with hidden stats, recent runs, reset a commander's lock, set an area's `need`, clear an area by hand).
- `/api/health` → `wild` (open areas, runs today, busy commanders, last error).

## The hosts and the show
- After a cleared area: one host line in the next moment, and the hosts' fill can mention it later ("Remember when the north ridge was just glitch and fog?").
- Once a day the radio's "Wild report" reads the progress (from the D1 numbers, no AI).
- A commander reaching a new rank can get a host line ("Captain Reuven, folks, fifty wins").
- Ishai doesn't comment on the Wild unless the story wants him to. New streets appear through Growth as they do today.

## Build steps
0. **One level, auto only, director only.** The platformer engine in the page (`/?wild` test mode, like `/?casting`): scrolling ground from a seed, the commander and 4 soldiers following, bugs, nests, the flag, win / retreat / lost. Sandbox control to start a run with any seed.
1. **Orders and direct control.** Group, send, split, hold, retreat, take control; phone buttons.
2. **Balance.** Scripted test players (none / sensible / expert / bad) run many seeds in the sandbox; tune until the bands are close to 30 / 50 / 70 / 95.
3. **Roster and runs.** D1 tables, 8 commanders, busy locks, ranks, `/api/wild` (start a run, send a result), the checks above. Still director only.
4. **Areas, workers and the city.** `wild_area`, wins toward `need`, the workers collecting pixels (drawn as a small no-AI scene on the director page: hard hats, sacks of coloured pixels), a cleared area becomes a district in the worker's city map and Growth can build there. Host line and radio report.
5. **Open to signed-in viewers.** The 👤 menu or a WILD tab: pick an area, pick a free commander, play. Daily limit. Leaderboard of commanders by rank (and maybe viewers by wins).

## What it costs
- No AI calls. No KV writes. D1: a few rows per run.
- The page grows by the game's code (probably 30-60 KB). The worker grows a little (the API and checks). Watch the 3 MB limit.
