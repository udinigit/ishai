# Watching Ishai — guide for Claude

Live AI-written pixel-art reality feed on a free Cloudflare Worker. Pushing to `main` deploys automatically.
Owner (the director): udinigit. Read `docs/SCENE_GUIDELINES.md` before adding or changing any scenery, characters, props or animations.

## Repository
- `source/public/index.html` — the page (all drawing, animation, sound). `source/public/director.html` — director page. `source/public/sandbox.html` — test stage.
- `source/src/worker.template.js` — story engine (AI prompt, validation, director goals, plan merge, real-world data).
- `story/season.md`, `story/plan.json` — season arcs and the day's beats (written by the daily planner).
- `src/index.js` — generated. Build with `cd source && node build.mjs`. Never edit `src/index.js` by hand.
- Bump `VERSION` and commit with a clear message; Cloudflare deploys in ~30 s and open pages auto-reload.

## Non-negotiables
- Reality show of a real life ("The Truman Show"), not a sitcom: realistic people, physics and logistics. Ishai never knows he is filmed.
- No teleportation: every place is on the world map (see the guidelines) with real exits, entries and ways to get there.
- Follow `docs/SCENE_GUIDELINES.md` for anything visual.
- Fictional brands only (Cooola, HummusPrime, Wee Laddie Virgin Scotch, A Butcher Is Born, Tahini Tower Savings Bank, Yalla Yoga, FluffNap, Herzl Hardware, Kfar Kofi, Radio Herzl 88.2, ateBite (food delivery), Everything Else (store), Shuk Shalom (market), …). Never real brands or their look-alike trade dress.
- Narration (`text`) is dev-only; viewers see the picture, spoken lines and the hosts (Zohar, Oren).
- Keep the free tiers in mind: Workers AI ~10k neurons/day, KV 1k writes/day.

## How moments are written (AI budget)
Two writers when the `GEMINI_API_KEY` secret is set (Cloudflare dashboard → Workers → ishai → Settings → Variables and Secrets): **Google Gemini (free tier, the newest stable Flash-Lite, or `GEMINI_MODEL`) writes the story** (blocks, live moments) and **Cloudflare Workers AI writes the hosts** (`addHosts()`: one call for a whole block's comments, plus the studio recaps and callers). Each is the other's backup (`runModel(env, messages, maxTokens, role)`); a Gemini 429 pauses it until its quota resets (midnight Pacific). The story prompt then leaves the hosts out (`HOSTS_APART`). Without the key everything runs on Cloudflare in one reply, as before. `/api/health` → `writersSetup` and `usage.gemini`.

Workers AI output costs ~6.5x input, so the engine avoids AI calls where it can (`tick()` in the worker, in this order):
- Night (asleep, 22:00-06:00): `nightEvent()` picks a sleep moment from a list. No AI.
- Planned beats: a beat's `preview.moments` (or `script`) are PLAYED AS WRITTEN once the beat starts (`scriptEvent()`): Ishai first walks there one place at a time (`travelEvent()`, no AI), then each moment plays in turn; the live AI then continues the scene and winds it down. The daily planner writes these moments as the finished scene.
- Live moments (one AI call each, spontaneous): radio/TV on (`liveCue()` + `onAirFor()`: a real headline, the real weather or the real station's genre is read by the DJ / Channel 9 and Ishai reacts; otherwise the AI writes the on-air line in `onAir`), and the moment the rain starts or stops. The on-air line is put first in `lines` with `who: "radio"` or `"tv"`; the page plays it (and keeps its own DJ quiet for 4 minutes). Between live radio/TV moments he just listens (`quietMedia()`, no AI).
- Everything else: blocks of up to 5 moments in one AI call (`askBlock()`, `s.queue`), shortened before the next planned beat. Each queued moment is validated when it plays; the block is dropped when anything else happens (a live moment, a beat starts, weather flips, a director note, stuck). A bad block falls back to one moment the old way.
- Places with music: the bar plays a real 24/7 rock station (Radio Paradise Rock Mix; backups from radio-browser in `s.world.barStations`), the café soft rock / pop at low volume (SomaFM Left Coast 70s, Radio Paradise Mellow Mix; backups `cafeStations`), the apartment radio as before. Every stream fades down quickly while anyone talks (`TALK_AT`, set by each typed character of speech) and comes back after; where the browser can't change the volume (iOS) it pauses and resumes instead.
- Rides: `bus` and `taxi` are real places. A story hop like street > market passes through one by itself on the page (`route()`, `rideKind()`), so the AI only uses them when something happens on board (one moment, at most two). `ride` on a public event tells the page which vehicle the text mentions.
- Shopping: Shuk Shalom market (food, CAM-10) and the Everything Else store next to it (everything except food, CAM-11) are a bus/taxi ride from the Herzl Street stop (`MAP.street.market` is a ride; the market has its own stop). Opening hours are enforced in `validate()`.
- ateBite food delivery: ordering is a moment on his phone/laptop; when the courier arrives the moment has `"delivery": true` (set by the AI, or detected from the text) and the page shows the orange-helmeted courier ringing, stepping in with the bag and leaving (`courierUpdate()`). Couriers also ride past on the roads now and then. Preview: `?loc=apartment&pose=idle&delivery=12`.
- The gym TV is live like the home TV: when Ishai is on the treadmill (`gym/exercising`) Channel 9 news/weather lines are written live and he reacts.
- `/api/health` shows `usage` (today's AI calls, tokens, estimated neurons, moments, no-AI moments, wasted block moments), `block`, `lastBlockDrop` and `writers` (who wrote the last 10 moments).

## Everyone sees the same thing (sync)
- The page never reads the device clock for timing: `NOW()` is the server's time (`/api/time`, `syncClock()`). Use `NOW()`, not `Date.now()`, and pass it to `new Date(...)`.
- `schedule()` works out each moment's start and each line's slot from the moments alone (`TL`, `talkPlan()`, `lineMs()`): a line's slot fits its typing and its voice, and a long talk pushes the next moment back. Playback waits for those times (`untilT()`) and never for a device's speech. A viewer who arrives late joins by the clock, mid-line, and gets a voice only from the next line.
- Studio recaps, the auto Studio break and callers start at times worked out from the moments, not from what one browser sees (`studioStart()`, `showStart()`, `callStart()`, `slotAfter()`). The picture-in-picture recap plays on even UTC hours, the full break on odd ones. Don't add `Math.random()` or per-browser checks to anything timed; the 📺 STUDIO button is the one personal exception.
- Movement runs in fixed 33 ms steps on that clock (`advance()`, `STEP`): anything that moves must take its time from `NOW()`, never `performance.now()` or `setTimeout`, because `NOW()` is the simulated time while steps run (`SIM`). A refresh or a returning tab replays the current moment fast and unseen (`joinMoment()`), starting 12 s before it. `update()` may not touch sound or anything a replay would repeat. Companions and the dog move during `render()`, so the replay renders every third step.
- Sound effects are picked from the 25 s clock slot, not at random.
- Can't match exactly: voices finishing, the room-sound loops, real radio streams. `?syncdebug` adds `window.__ishaiSync()` with the positions, and `window.__ishaiJoinMs` shows the last replay's time.

## Pop out (picture-in-picture)
`⧉ POP OUT` copies the scene into a hidden video (`POP`, `popDraw()`), with the last lines drawn in as captions because the HTML doesn't reach the small window. While the page is hidden a worker's timer calls `frame()`, and the page's sound runs through the video (`Sound.popAudio()`). Works from the button on Android Chrome; automatic opening on leaving didn't.

## Sandbox
`/sandbox` (`source/public/sandbox.html`, linked from the director page) is a test stage around the real page in `/?sandbox` mode (`startSandbox()`, `window.__sandbox`): no live feed, no AI, no writes. Moments go through `ingest()` like the story's. Saved moments and characters stay in the browser's `localStorage`. New places, actions and special events should get a control here too.

## Health check and quick fixes
- `GET /api/health` (public): recent moments, retry rate, recent rule problems, stuck counter, current scene, last AI error, art requests.
- Quick fixes without touching code: add to `story/plan.json` a `"fixes": [{"id": "fix-<date>-<hhmm>", "endScene": true, "note": "...", "minutes": 60}]` and bump `"version"`. `endScene` wraps up the running scene with a goodbye; `note` is a director note the story follows for `minutes`. Each fix id runs once.
- The health check can also apply a fix instantly without git: `GET /api/fix?token=<token>&endScene=1&note=...&minutes=45` (or `unstick=1`). The token is only in the scheduled task's prompt; the code holds its SHA-256 (`FIX_HASH`).
- Sleep moments may resemble each other (no repeat check while he sleeps); at night the prompt says it is dark and keeps him in bed.
- Preview of the planned day: `/?preview` plays `story/plan.json` beats in order (each beat's `preview.moments` with sample dialogue and host lines, or its force fields). `/api/plan` serves the plan. `&from=N` starts at moment N.
- Hourly (every rounded hour, 07:00+, not while he sleeps) one AI call writes: a text summary of today (`s.daySum`, shown in the SUMMARY tab with yesterday's `s.yesterdaySum`), the Studio recap show (`s.show`: sponsor intro, short yesterday, today focusing on the last hour, sponsor outro; the later in the day, the shorter yesterday) played on demand by the 📺 STUDIO button with Ishai live on the studio screen, and the short auto PiP recap (`s.studio`).
- Callers: every 30 minutes (08:00+, awake, no guest) `callIn()` makes one AI call: a random caller (name, town, mood: funny/angry/confused/superfan/conspiracy/grandma...) talks about the show, a random thing fetched from a free no-key API (joke, useless fact, random Wikipedia page, quote, advice, cat fact), or both; a host introduces them and answers. Stored as `s.call`; the page plays it when quiet in the 📞 ON THE LINE window (pixel phone), the hosts' column and full-screen captions.
