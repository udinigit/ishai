# Watching Ishai — guide for Claude

Live AI-written pixel-art reality feed on a free Cloudflare Worker. Pushing to `main` deploys automatically.
Owner (the director): udinigit. Read `docs/SCENE_GUIDELINES.md` before adding or changing any scenery, characters, props or animations.

## Repository
- `source/public/index.html` — the page (all drawing, animation, sound). `source/public/director.html` — director page.
- `source/src/worker.template.js` — story engine (AI prompt, validation, director goals, plan merge, real-world data).
- `story/season.md`, `story/plan.json` — season arcs and the day's beats (written by the daily planner).
- `src/index.js` — generated. Build with `cd source && node build.mjs`. Never edit `src/index.js` by hand.
- Bump `VERSION` and commit with a clear message; Cloudflare deploys in ~30 s and open pages auto-reload.

## Non-negotiables
- Reality show of a real life ("The Truman Show"), not a sitcom: realistic people, physics and logistics. Ishai never knows he is filmed.
- No teleportation: every place is on the world map (see the guidelines) with real exits, entries and ways to get there.
- Follow `docs/SCENE_GUIDELINES.md` for anything visual.
- Fictional brands only (Cooola, HummusPrime, Wee Laddie Virgin Scotch, A Butcher Is Born, Tahini Tower Savings Bank, Yalla Yoga, FluffNap, Herzl Hardware, Kfar Kofi, Radio Herzl 88.2, …). Never real brands or their look-alike trade dress.
- Narration (`text`) is dev-only; viewers see the picture, spoken lines and the hosts (Zohar, Oren).
- Keep the free tiers in mind: Workers AI ~10k neurons/day, KV 1k writes/day.

## Health check and quick fixes
- `GET /api/health` (public): recent moments, retry rate, recent rule problems, stuck counter, current scene, last AI error, art requests.
- Quick fixes without touching code: add to `story/plan.json` a `"fixes": [{"id": "fix-<date>-<hhmm>", "endScene": true, "note": "...", "minutes": 60}]` and bump `"version"`. `endScene` wraps up the running scene with a goodbye; `note` is a director note the story follows for `minutes`. Each fix id runs once.
