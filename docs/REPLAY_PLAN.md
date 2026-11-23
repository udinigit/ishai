# 8bitTV+ replays — the Studio plays the real moments, like a recording

Today the studio screen draws a *memory* of a chapter (`drawMemory()`: the place, a pose, who was there, one clip line from
`dayHighlights()`). The goal: play the moment itself, exactly as viewers saw it live: the same walk, the same lines with the
same timing, the same body language, people coming and going.

No video is recorded. The live page already works out every frame from the moments and the clock (`NOW()`, `TL`, fixed
33 ms steps, `SIM`, `joinMoment()`), and the picture never uses `Math.random` (only sounds and TV static do). Keep the
inputs and run the same page on an earlier clock, and the picture comes out the same.

## Step 1 — keep every moment (worker) — done, v292
- Today a moment is lost: `s.events` keeps the last 40 (`KEEP_EVENTS`), and `day:<date>` keeps text log lines only.
- New D1 table `tape` (date, id, t, len, json; `tapeTables()`). In `tick()`, right after `s.events.push`, insert the same
  public object `publicState()` sends for an event (lines, commentary, then, feel, ride, delivery, art, unlocks, len), plus a
  small snapshot of what else the picture reads then: weather, moods, the cast's looks, `worldV`, `townV`, media / on-air.
- Quiet moments (sleep, `quietMedia()`) are kept too, they're tiny.
- Cost: no AI, no KV writes; about 200-400 rows and ~1 MB a day (D1 free tier: 100k row writes a day, 5 GB).
- Keep 60 days in full (`TAPE_KEEP_D`); after that only the moments a daily or weekly episode uses (`tapeSweep()`, once a day).
- A grown place or townsperson taken off later keeps its record in D1 (`world_gen` / `town` rows go `off`, never deleted),
  so its old moments still draw.

## Step 2 — the API — done, v292
- `/api/tape?date=YYYY-MM-DD&from=<ms>&to=<ms>` → the moments that overlap the window, plus the two before (the one still running
  and where he was before it, as `joinMoment()` needs), and the snapshots. Public, cached 5 minutes for past days.
- Today's tape reads the same table (rows are written as moments are made).

## Step 3 — replay mode in the page — done, v293
- `/?replay=<date>&at=<ms>[&to=<ms>]`: a mode of index.html, like `/?sandbox` and `/?casting`, loaded in an iframe on the
  studio screen (`#stvLive`), so it never touches the live page's globals (no swapping like `drawMemory()`).
- The clock: `NOW()` = the replay time (`REPLAY.at + (performance.now() - REPLAY.t0) * REPLAY.speed`); `seek(ms)` restarts
  from that time with `joinMoment()`.
- The data: `poll()` reads `/api/tape` instead of `/api/state` and applies each moment's snapshot (weather, moods, looks)
  as the clock reaches it; `growLoad()` / `townFetch()` with the snapshot's versions, including records now `off`.
- Off in replay: ads, PiP, the TV guide card, callers, the auto Studio break, pushes, polls, the hosts' booth.
- Sound: today everything checks `!SIM`; a separate `REPLAY` flag lets voices and sounds play (the door buzzer, bike bell,
  commercial jingles stay off). The parent page controls the volume (`postMessage`). HD voices prefetch from the tape.
- Quiet stretches are skipped like `joinMoment()` does (a ride, a settled scene apart from its last seconds), so a long
  moment can play in a minute or two.
- The REC / CAM HUD shows `REPLAY · <date> <time>` instead of LIVE.

## Step 4 — episodes play the tape
- A chapter keeps `from` / `to` (moment ids, or the clip's moment and the next) besides its clip line. `writeDayEpisode()`,
  `basicDayEpisode()` and the weekly episode fill them in; older episodes get them from the tape by time and place.
- In `playEpisode()` (`epItems()`): the host line before → the studio screen switches to the replay of that stretch → the
  hosts react after. The clip is the moment playing, not one line read out.
- ⏭ MOMENT seeks to the next chapter's `from`; ← BACK and ✕ LIVE close the iframe.
- The 30-minute highlights of yesterday: the episode's chapters played back to back with the quiet parts skipped.

## Step 5 — "Today (so far)" from the 📺 STUDIO button shows what the hosts talk about
Only when the viewer opens it from the button (the channel's Today card or `playEpisode('today')`), **not** the studio
recaps that play by themselves during live watching (`playShow()`, the PiP and the full break keep the live picture).
- Today the intro of Today (so far) is the hourly recap show (`s.show`), and while it plays the studio screen shows Ishai live.
  Instead, every host line shows the moment it talks about, on the replay; a line about nothing in particular (the sponsor,
  a hello, yesterday) shows the day's first moment or the sponsor's card, never the live feed.
- The hourly recap writer (`studioRecap()`) already gets each moment with its time (`fmt()`: "HH:MM place/action"); it
  also returns `at` ("HH:MM") on every show line that talks about one of them. `studioClean` keeps `at` only when it matches a
  moment in the list. The no-AI `basicRecap()` sets `at` from the moment it reads out.
- `todayEpisode()` turns each `at` into a moment id (`tapeAt(date, at)`), so the intro plays like chapters: the line, with
  that moment playing behind the hosts. Lines in a row about the same moment keep it playing on; a new moment seeks.
- The chapters after the intro (today's highlights) play their stretch of the tape, as in step 4.
- The live feed under it keeps running, as now; its sounds stay hushed while the channel is open.

## Caveats
- A replay uses today's drawing code: after a redesign, old days show in the new art (like a game's saved demo).
- Ambient sounds (`Math.random` in the sound engine) differ slightly; lines, voices and timing match.
- Moments from before step 1 have no tape: their chapters keep the old `drawMemory()` picture.

## Defaults (change any time)
Keep 60 days in full; replay speed 1×; skip quiet stretches over 20 s; Today (so far)'s general lines show the day's first moment.
