# 8-Bit Cinema Night: plan

Proposed on 2026-11-13. Not built yet. Open questions for the director are at the end.

## The idea
Once a month the Pump House shows a film: an old public-domain play retold as a short 8-bit film. One or two frames per scene show the scenery and the characters, and the characters' lines play as subtitles and voices. Ishai goes with a friend and sits in the audience. The hosts keep quiet during the film, the way they do in a lecture. Ishai remembers the film afterwards.

The writing is done the way the history course does it: a few Gemini calls a month from a free source, kept as a script and played as written. The film itself needs no live AI.

**Truman rule:** the film is a film, not a message to Ishai. Nothing in it is about him, and nobody in the audience knows he is filmed.

## Where the films come from
- **Project Gutenberg plays** (public domain): the characters, scenes and lines are already written. The worker finds a play's text file through **Gutendex** (`gutendex.com/books/<id>`, free JSON, no key) and downloads the plain text once (`gutenberg.org/cache/epub/<id>/pg<id>.txt`).
- **A hand-picked list, not open search:** `story/films.json` holds about 24 plays (two years of films), in the same spirit as `story/course.json`. Each entry has the Gutenberg id, the title, the author, the author's death year, the kind (comedy or drama) and a one-line pitch for the hosts and the poster. Starting list (Claude checks every id and text when building): *The Importance of Being Earnest*, *A Midsummer Night's Dream*, *Twelfth Night*, *Much Ado About Nothing*, *The Comedy of Errors*, *Pygmalion*, *The Inspector General*, *Cyrano de Bergerac*, *The Imaginary Invalid*, *The Rivals*, *She Stoops to Conquer*, *An Ideal Husband*, *The Cherry Orchard*, *The Seagull*, *Arms and the Man*, *The Tempest*.
- **Rights:** every author on the list died more than 70 years ago, so each play is public domain in Israel as well as the US. Gutenberg asks that its name and licence go only with unchanged copies. The worker strips their header and footer before writing, and the film never says "Project Gutenberg". Every film names its own fictional studio (see "On screen").
- **Not used:** real films from the Internet Archive (rights on each upload need checking by hand, and the show could not redraw them in its own style), and film subtitles (copyrighted for any recent film).

## Schedule
- **First Wednesday of the month, 20:00**, in the Pump House's weekly slot. That week's gallery night gives way, and a booked concert still wins: the film then moves to the next free Wednesday.
- Doors at 19:51 as on a gallery night. The film runs 25-35 minutes with a 5-minute intermission in the middle, then the walk out. About 45-50 minutes in all, like a gallery night.
- `filmTick()` in `tick()`, next to `arenaTick()`. Seven days before the night it picks the next play from the list (`s.cinema.queue`) and writes the film, one act per tick-day (see "AI budget"). The film has to be ready the day before. If it isn't, that Wednesday stays a gallery night and the film moves a week.
- `comingUp()` lists the night with its pitch, so the hosts tease it. The plaza's poster board and the hall's 64×24 screen carry the title from the Monday before (`publicState.arena`).

## Writing the film (Gemini, a few calls a month)
1. **Split:** the worker cuts the play into acts by its own headings (`ACT I`, `SCENE 2` and the like), with no AI. A play without clear acts is cut into 4-5 equal parts at scene breaks.
2. **One call per act** (`generateFilmAct()`, like `generateLecture()`): the act's text goes in, and 2-4 scenes come out as JSON:
   ```json
   {"cast": [{"id": "algernon", "name": "Algernon", "look": "young man, dark curly hair, green velvet jacket, cravat", "voice": "m"}],
    "scenes": [{"title": "Algernon's flat, morning", "set": {"kind": "room", "era": "1890s", "time": "day", "props": ["piano", "tea table", "tall window"], "palette": "warm"},
      "frames": [{"who": ["algernon", "lane"], "pose": {"algernon": "sit", "lane": "stand"}, "move": "pan-right"}],
      "lines": [{"who": "algernon", "say": "Did you hear what I was playing, Lane?", "frame": 0}]}],
    "recap": "one sentence of what happened in this act, for the next call"}
   ```
   - 6-16 lines a scene, each "say" at most 130 characters, condensed from the play. The lines are cut and modernised a little where the old wording is too hard to follow, but the plot, the characters and the best lines are kept.
   - The next act's call gets the cast list and the recaps so far, so names and looks stay the same.
   - `cleanFilm()` checks it like `cleanLecture()`: known `who`, lengths, at most 2 frames a scene, set kinds and props only from the library (below), anything unknown dropped.
3. **Stored once:** each act goes to its own KV key (`film:<YYYY-MM>:<act>`, about 5 writes a month). `s.cinema` keeps only the play, the date, how far the writing has got and any error. The state stays small.
4. **Memory:** a `note` (one sentence Ishai would repeat) and the friend's reaction go into `addLife()` after the night, like a gallery night.

## AI budget
- About 4-6 Gemini calls a month, one a day in the week before the night, each roughly 10-20k tokens in and 4-6k out. That is small next to the daily story.
- **Gemini only.** A film call never falls back to Cloudflare Workers AI: a whole act's output would cost thousands of neurons. If Gemini is paused or fails, `filmTick()` tries again the next day.
- 0 AI calls on the night. Host lines at the doors, the intermission and the walk out come from line pools (`F_HOSTS`, `FILM_TALK`), as on gallery nights.
- KV: about 5 writes a month for the acts, plus the usual state saves.

## On screen (the page, no AI)
- **The hall in cinema mode:** a white pull-down screen hangs from the truss in front of the stage, and a projector on a stand at the back throws a dusty beam over the crowd. Three rows of folding chairs face it (`CC_ROWS`, seated, backs to the camera). Ishai and the friend sit in the middle row and turn to each other only to whisper. The house lights go down when the film starts.
- **The film inside the screen:** drawn on its own small canvas at a coarser pixel (2× the world's), with a 16-colour palette per `palette`, then scaled onto the screen. The coarser pixel tells viewers it is a film within the show.
  - **Sets** come from a small library of drawing functions, written by hand once and following `SCENE_GUIDELINES.md`: `room`, `garden`, `street`, `forest`, `palace`, `shore`, `ship`, `tavern`, plus props (`piano`, `table`, `throne`, `tree`, `window`, `moon`, `boat`...). An era tints the furniture and clothes. The AI only combines these, as with the block kit in `WORLD_PLAN.md`.
  - **Characters** are drawn by the same person drawing the page uses for the cast, from a `look` read into hair, skin, clothes and colours (`lookOf()`), with simple poses (`stand`, `sit`, `kneel`, `bow`, `point`, `embrace`). Mouths move while they speak.
  - **Movement:** each frame has a slow camera move on the clock (`pan-left`, `pan-right`, `zoom-in`, `still`) and a hard cut or fade between frames and scenes.
  - **Text:** the scene title as a card at its start ("ACT II: The garden at the Manor House"), and the lines as subtitles at the bottom of the screen, coloured per character. They are not speech bubbles, which stay for people in the room.
  - **Titles:** a fictional studio card at the start (a gold "8-BIT PICTURES presents"), the play's title and author, and "THE END".
- **Voices:** film characters get voices like the band members (`EXTRA_SPK`), with a gentle "old speaker" filter. They are made ahead by the HD voices like any line the page knows.
- **The crowd:** murmurs before, laughs at the comedy's best lines (a `laugh` flag the writer may set on a line, at most 1 in 6), and claps at THE END (`Sound.sfx`).
- **Sync:** `filmNight()` lays out every scene's and line's start from the date alone, like `concertNight()`. Everything is drawn from the clock and the night's seed, never `Math.random()`. A late joiner lands mid-scene.

## The story around it
- The night is a goal with `fixed: true` (`scheduleFilm()`), and the friend is chosen from the date, as on a gallery night.
- Moments: the queue on the plaza, taking seats, the film (one moment per few scenes with action `film`, no host lines, as in `lecture`), the intermission (Ishai and the friend talk about it, from `FILM_TALK` with the act's recap), the second half, the walk out (the friend's memory `update`).
- `eventNote()` lets Ishai look forward to it and, in the days after, quote a line or bring the film up with someone.
- The live story can't put him in the hall (`validate()` as today), and the night is never in two places.

## Director page
A **Cinema** box next to the course controls (dev only):
- The next film: play, date, writing progress (acts done of acts), errors.
- "Pick another play" from the list, "Write it again", "Skip this month".
- "Preview": opens the sandbox on the night (`?loc=arena&film=<YYYY-MM>&at=<min>`).
- Later: a survey of the week "Which play next month?" with 3 from the list (`docs/SURVEY_PLAN.md`).

## Build order
1. `story/films.json`, Gutendex and the text download, act splitting, `generateFilmAct()`, `cleanFilm()`, the KV keys, `filmTick()`, `/api/film` (dev), health `cinema`. Check one whole film by reading its JSON.
2. The page: the screen, chairs and projector in the hall, the film canvas, the set and prop library, characters from `look`, subtitles, titles, camera moves. Sandbox button "Film night".
3. The night: `filmNight()`, `scheduleFilm()`, the moments, line pools, voices, crowd sounds, memories, teasers, the poster board.
4. Director controls.

## Test before pushing
No test suite: serve `source/public` and drive it with Playwright, as in `docs/BUILDER_PHASE2.md`.
- One film start to finish in the sandbox at high speed: every scene draws, no console errors, the subtitles fit, the timing adds up to 25-35 minutes.
- Day, rain (people come in wet), with and without a friend, a late join mid-scene, and the hall on a normal gallery Wednesday still the same.
- Then `cd source && node build.mjs`, bump `VERSION`, update `CLAUDE.md` (a "Cinema night" section) and `docs/SCENE_GUIDELINES.md` (the hall in cinema mode), commit and push to `main`.

## Open questions for the director
1. **Comedies only, or dramas too?** The show's rule that nobody dies is for Ishai's world. A film could still have a sad ending or a stage death (*Romeo and Juliet*), shown off-screen. Claude's default is comedies and gentle dramas, with no on-screen deaths.
2. **The Pump House now, or wait for the cinema at The Big S?** Claude's default is the Pump House now, moving to The Big S's Saturday cinema when that is built (`WORLD_PLAN.md`, "Later").
3. **Once a month on the first Wednesday,** or another rhythm?
