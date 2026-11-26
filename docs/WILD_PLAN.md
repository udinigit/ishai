# The Wild: viewers clear the land the city grows into

Draft 2026-11-26. **Status: plan only, nothing built.** Builds on `docs/GROWTH_PLAN.md` (the city map `story/city.json`, `cityPick()`, grown places in D1 `world_gen`) and the town registry (code people). Read `CLAUDE.md` and `docs/SCENE_GUIDELINES.md` first.

## Open questions for the director (answer before step 1)
1. **Do soldiers really die?** Season rule: nobody on the show dies. Options: (a) soldiers are nameless code people, never cast, and they die only inside the game; (b) a fallen soldier "derezzes" and turns up back in town a day later, shaken (fits the Wild as unfinished, glitchy land); (c) they are "knocked out" and carried home. Plan below assumes (b) until decided.
2. **What do we call them?** Soldiers, rangers, a crew, clearers? Plan says *crew* and *commander* for now.
3. **How much clears an area?** Suggested start: an area needs 100 resource points; a good run brings 8-15, a retreat 0-4. About 10 good runs per area.
4. **Does Ishai ever go?** Suggested: not at first. He sees new streets appear and wonders where they come from (a slow mystery, maybe Season 3). Viewers never send him: he is not a commander.
5. **The skill bands (30 / 50 / 70 / 95 %).** Proposed meaning below: they are the win rates we tune the levels toward, not dice the server rolls. OK?

## Decided (2026-11-26)
- **A real Wild.** Past the last streets the map turns into unfinished land. The city grows only into land that has been cleared.
- **Viewers clear it** by playing. Clearing an area lets the city expand there (Growth takes it from there).
- **Viewers never send Ishai.** They pick a **commander** from a fixed roster. A commander in use by another viewer is **busy**: that limits how many people play at once.
- **A commander leads a crew of 4.** The crew follows the commander and protects them.
- **The commander plays by itself** (computer controlled) unless the viewer takes direct control.
- **Viewers give orders**: how to group the crew, where to send them on screen, when to advance, when to split.
- **The commander retreats** when the crew is lost. Each commander has their own hidden retreat point (around 20%, varies) and their own hidden strength. Viewers see only the **rank**, which rises with wins.
- **A good player makes a big difference**: about 30% wins for a bad player, 50% normal, 70% advanced, 95% the best.
- **Director only** to start.

## The story
- Beyond the city's edge is the Wild: half-drawn trees, bare ground, glitchy pixels. It is the edge of the set, like the sea in The Truman Show.
- Crews of code people (the scripted townsfolk, see the hierarchy below) go out at dawn in a truck and bring back resources: **wood, stone and colour** (colour is what finishes a place: without it a new building stays grey).
- The Wild's creatures are **bugs**: glitch animals and blobs. Jump on one and it bursts into pixels; it comes back later. No blood, nothing realistic.
- **The hierarchy:** code people (locals, townspeople, the crews: scripted, no AI) → AI actors (the cast: memories, moods, they know it's a show) → Ishai (the only real mind, doesn't know). AI actors don't like the Wild: being near the edge makes them uneasy about what's real. Material for a later secret (an actor who went out there once).
- In town, the Wild is ordinary background: the truck at dawn, dusty crews at the kiosk, the radio's "Wild report", a host line when an area is cleared ("The north ridge is open, folks, the city's growing!").
- The realistic-city rule stays: everything in town keeps real-world logic. The Wild is the only strange place, and it is reached only by the truck.

## Where the Wild is on the map
`story/city.json` is a 6 × 3 grid. The Wild is a ring of **wild areas** around it: squares outside the grid (north of row 0, south of row 2, east of column 5; the sea stays west). Each wild area has:
- `id`, `grid` [col, row], `name` ("The North Ridge"), `biome` (forest, rocks, marsh, dunes...), `need` (points to clear, default 100), `got` (points so far), `cleared` (date or null), `next` (which areas open once this one is cleared: you clear outward from the city).
- Only areas touching the city or a cleared area are open to play.
- Once `got` reaches `need`, the area becomes a new **district** in the city map (new entry with `room`, `fits`, `style` from its biome, and a `grow` edge from the nearest district). From then on `cityPick()` can put new places there, through the normal Growth flow (approval setting `places` / `blocks`).
- Kept in D1 (`wild_area`), not in `city.json`, because it changes at runtime; the worker merges cleared areas into its copy of the city like `world_gen` merges grown places.

## The game
Think *Lemmings* / *Pikmin* in a side-scrolling platformer. Drawn by the page with the show's own art, at the page's 108-pixel height, scrolling sideways. **No AI at all.**

### A run
- The viewer picks an open wild area and a free commander. The commander is marked busy (a D1 lock with an expiry, so an abandoned run frees them after ~10 minutes).
- The level comes from a **seed** the server hands out (area + date + run number): ground, gaps, ledges, bugs, and resource spots (trees to chop, rocks, colour crystals). Same seed, same level, for everyone.
- Goal: reach the far end (the area's "marker") with resources. Each resource carried back is points. Reaching the marker doubles what was carried.
- A run lasts about 3-6 minutes.

### The crew
- 4 crew members follow the commander in a line, jump when they jump, stop when they stop.
- They **protect** the commander: when a bug comes within range, the nearest crew member steps in front and bounces it. A crew member who touches a bug from the side is lost (option b: derezzes).
- Crew carry resources (1 each, commander 1). Lose a carrier, lose what they carried.

### The commander
- **Auto mode** (default): a simple AI script, not an AI model. Walk right, jump gaps and ledges, wait for the crew, stop when bugs are near and let the crew deal with them, chop/mine resource spots it passes. How well it does this is the commander's hidden **strength**: reaction time, how often it misjudges a jump, how greedy it is for resources.
- **Retreat**: when the crew left falls to the commander's hidden **retreat point** (e.g. 1 of 4 left for a cautious one, 0 for a brave one), the commander turns back. A retreat keeps half of what is carried.
- **Direct control**: the viewer can take the commander at any time (arrows / on-screen buttons on phones) and give it back.

### Orders (the viewer's tools)
- **Group**: tight (safer, slower), spread (covers more, riskier), line.
- **Send**: tap a spot on screen; a chosen crew member or the group goes there (to a resource spot, onto a ledge, ahead to scout).
- **Split**: two groups, e.g. 2 hold a ledge while 2 go for a resource.
- **Hold / advance / regroup**.
- **Retreat now** (the viewer may retreat earlier than the commander would).

### Skill and the 30 / 50 / 70 / 95 bands
The server never rolls a win. The result is whatever happens in the level. The bands are **design targets** we tune toward:
- A level's difficulty is set so that the commander alone (auto mode, mid strength) wins about **40%** of runs.
- Bad orders (sending the crew into bugs, splitting badly) drag it down to about **30%**; no orders at all about **50%** with a good commander; sensible grouping and sending about **70%**; a player who splits, scouts and takes control at the hard jumps about **95%**.
- We check this in the sandbox with scripted test players before opening it (step 2).
- Viewers never see the numbers, only the outcome and the commander's rank.

### Commanders
- A roster of, to start, **8 commanders** (code people, never cast): name, look (from `LOOK`, with a work uniform: hard hat, vest, boots), voice gender, a short line or two (a catchphrase on setting out, one on retreating).
- Hidden: `strength` (0.3-0.9), `retreatAt` (0-2 crew left), `greed` (how much it stops for resources).
- Visible: **rank** (Recruit → Scout → Ranger → Captain → Veteran → Legend), from wins: 0, 3, 10, 25, 50, 100.
- A commander's stats never change with rank. Rank is reputation, so viewers learn which ones are actually good.
- **Busy**: one viewer at a time. With 8 commanders, at most 8 runs at once.
- A crew is drawn fresh each run (4 code people in work clothes, nameless).

### Fairness and cheating
The game runs in the viewer's browser, so the browser reports the result. The server:
- hands out the seed and a run id, and accepts one result per run id;
- checks it is possible: the run took at least the level's minimum time, points are within what the seed's resource spots allow, crew lost is 0-4;
- keeps a short **input log** (orders with timestamps, compact) so a result can be replayed later in the sandbox and checked if it looks wrong;
- limits runs per signed-in viewer per day (start: 5).
Good enough for a free show; nothing is worth cheating hard for.

## Data (D1, no KV writes, no AI)
- `wild_area` (id, grid, name, biome, need, got, cleared, state).
- `wild_cmd` (id, name, look, gender, strength, retreatAt, greed, wins, runs, busyBy, busyUntil).
- `wild_run` (id, area, cmd, voter, seed, started, ended, result win|retreat|lost, points, crewLost, log).
- Director: a WILD box on the director page (areas with progress, the roster with hidden stats, recent runs, reset a commander's lock, set an area's `need`, clear an area by hand).
- `/api/health` → `wild` (open areas, runs today, busy commanders, last error).

## The hosts and the show
- After a cleared area: one host line in the next moment, and the hosts' fill can mention it later ("Remember when the north ridge was just glitch and fog?").
- Once a day the radio's "Wild report" reads the progress (from the D1 numbers, no AI).
- A commander reaching a new rank can get a host line ("Captain Reuven, folks, fifty wins").
- Ishai doesn't comment on the Wild unless the story wants him to. New streets appear through Growth as they do today.

## Build steps
0. **One level, auto only, director only.** The platformer engine in the page (`/?wild` test mode, like `/?casting`): scrolling ground from a seed, the commander and 4 crew following, bugs, resource spots, win / retreat / lost. Sandbox control to start a run with any seed.
1. **Orders and direct control.** Group, send, split, hold, retreat, take control; phone buttons.
2. **Balance.** Scripted test players (none / sensible / expert / bad) run many seeds in the sandbox; tune until the bands are close to 30 / 50 / 70 / 95.
3. **Roster and runs.** D1 tables, 8 commanders, busy locks, ranks, `/api/wild` (start a run, send a result), the checks above. Still director only.
4. **Areas and the city.** `wild_area`, points toward `need`, a cleared area becomes a district in the worker's city map and Growth can build there. Host line and radio report.
5. **Open to signed-in viewers.** The 👤 menu or a WILD tab: pick an area, pick a free commander, play. Daily limit. Leaderboard of commanders by rank (and maybe viewers by points).

## What it costs
- No AI calls. No KV writes. D1: a few rows per run.
- The page grows by the game's code (probably 30-60 KB). The worker grows a little (the API and checks). Watch the 3 MB limit.
