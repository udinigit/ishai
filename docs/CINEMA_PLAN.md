# Saturday Night at the PixelPlex: plan

Proposed 2026-11-13, updated the same day with the director's answers (end of this file). **Built 2026-11-13 (v223).** Differences from this plan:
- No Gutenberg ids in `story/films.json`: the worker finds each book through Gutendex by title and author at run time (and checks the author's death year there).
- A title Gutenberg doesn't have is dropped for the next in turn. Not ready by Friday noon: a repeat, or, with no older film yet, the week is skipped.
- The survey "Which film next Saturday?" and a promotion poster are not built yet.

## The idea
Every Saturday night the cinema at The Big S shows a film: an old public-domain play or story retold as a short 8-bit film. One or two frames per scene show the scenery and the characters, and the characters' lines play as subtitles and voices. Ishai goes, with a friend or alone, and sits in the audience. The hosts keep quiet during the film, the way they do in a lecture. Ishai remembers the film afterwards.

The writing is done the way the history course does it: a few Gemini calls a week from a free source, kept as a script and played as written. The film itself needs no live AI.

- **Name:** the **PixelPlex**, on floor 3 of The Big S, next to the food court. The films open on a gold "8-BIT PICTURES presents" card. Both names are fictional, and the director can rename either.
- **Genres:** comedy, drama and horror, everything. The show's rule that nobody dies is for Ishai's world, not the films: a play's deaths and a ghost story's horrors can happen on the screen. At 8-bit nothing is graphic. A death is shown by a fall or a fade, never blood.
- **Truman rule:** the film is a film, not a message to Ishai. Nothing in it is about him, and nobody in the audience knows he is filmed.

## When
- **Saturday at 21:00, every week**, after Shabbat. Shabbat in Tel Aviv ends by about 20:35 at the latest (midsummer), so 21:00 is always after it. The buses are running again then, and nobody breaks Shabbat to go. Holidays skip it, like the other fixed nights.
- **Length:** doors at 20:51, ads and trailers for the show's fictional brands, then the film for 25-35 minutes with a 5-minute intermission, then out. About 50 minutes in all.
- **Weekly is fine.** It costs about 4-6 Gemini calls a film (see "AI budget"), and it clashes with nothing: poker is on Monday, the Pump House on Wednesday and improv on Thursday. It becomes Ishai's Saturday-night habit, with a different friend most weeks, and some weeks alone.
- **Not going:** if Ishai is ill, away or something in the plan is bigger, he skips that week. The film still plays to an empty seat in his row, and the hosts say he missed a good one. The next film comes the next Saturday.

## Where: the PixelPlex at The Big S (a new place)
The Big S is built (v221). The food court's east screen (`mall3b`, CAM-37) has a free right edge, so the cinema goes there:
- **`mall3b`:** the cinema's entrance on its right side, with a lit marquee showing this week's title, a box office, a popcorn counter and a poster frame with the film's poster.
- **`cinema` (new story place, CAM-38):** the auditorium. The camera stands at the back:
  - the big screen at the top, a red curtain that opens, and the projector's dusty beam over the seats;
  - about six rows of red seats seen from behind, with the audience as heads and shoulders;
  - EXIT signs and dim aisle lights.

  Ishai and the friend sit in the middle of the third row from the back, so the screen is above them. They turn to each other only to whisper.
- **Saturday at The Big S:** the building's doors open on Saturday 20:30-23:30 for the cinema alone. The escalators run, and every store stays shuttered (`SHUT()`, as on Shabbat). On other days the PixelPlex front on `mall3b` is closed with the poster for Saturday.
- `story/world.json`: `mall3b` R ↔ `cinema` door. `story/places.json`: `cinema` is an `event` place, planned moments only, like the Pump House hall. `mall` and `foodcourt` get a Saturday-night exception, only on the walk to the cinema.
- A place needs `FILL` and `OVERHEARD` entries, a sandbox button and a builder entry, and it is checked against `SCENE_GUIDELINES.md` for night, rain (wet coats coming in) and companions.

## Where the films come from
- **A hand-picked list, not open search:** `story/films.json`, in the spirit of `story/course.json`, with about 60 titles (more than a year) in three strands that take turns: comedy, drama and horror or mystery. Each entry has:
  - the Gutenberg id, the title and the author, with the author's death year;
  - `kind`: `play` or `story`;
  - the genre;
  - a one-line pitch for the hosts, the poster and the TV guide.
- **Source text:** Project Gutenberg. The worker finds the file through **Gutendex** (`gutendex.com/books/<id>`, free JSON, no key) and downloads the plain text once (`gutenberg.org/cache/epub/<id>/pg<id>.txt`).
- **Plays** already have characters, scenes and lines:
  - comedy: Wilde, Shakespeare, Molière, Gogol, Shaw, Sheridan, Goldsmith;
  - drama: Chekhov, Ibsen, Shakespeare's tragedies, *Cyrano de Bergerac*.
- **Stories**, for horror above all, which has few old plays: Poe, Stoker, Mary Shelley, Le Fanu, M. R. James, W. W. Jacobs (*The Monkey's Paw*), Stevenson (*Jekyll and Hyde*), Wells and Conan Doyle. Here the writer pulls out the scenes and turns them into dialogue, which costs about the same.
- **Rights:** every author on the list died more than 70 years ago, so each work is public domain in Israel as well as the US. Claude checks each one when building the list. Gutenberg asks that its name and licence go only with unchanged copies, so the worker strips their header and footer before writing, and the film never says "Project Gutenberg".
- **Not used:** real films from the Internet Archive (the rights on each upload would need checking by hand, and the show could not redraw them in its own style) and film subtitles (copyrighted for any recent film).

## Writing the film (Gemini, a few calls a week)
1. **Split:** the worker cuts the text into 4-5 parts by its own headings (`ACT I`, `SCENE 2`, chapter numbers), with no AI. A text with no clear headings is cut into equal parts at paragraph breaks.
2. **One call per part** (`generateFilmPart()`, like `generateLecture()`): the part's text goes in, and 2-4 scenes come out as JSON:
   ```json
   {"cast": [{"id": "algernon", "name": "Algernon", "look": {"hair": "curly", "hairColor": "dark", "top": "jacket", "extras": ["tie"]}, "voice": "m"}],
    "scenes": [{"title": "Algernon's flat, morning", "set": {"kind": "room", "era": "1890s", "time": "day", "props": ["piano", "tea table", "tall window"], "palette": "warm"},
      "frames": [{"who": ["algernon", "lane"], "pose": {"algernon": "sit", "lane": "stand"}, "move": "pan-right"}],
      "lines": [{"who": "algernon", "say": "Did you hear what I was playing, Lane?", "frame": 0, "react": "laugh"}]}],
    "recap": "one sentence of what happened in this part, for the next call"}
   ```
   - 6-16 lines a scene, each "say" at most 130 characters. Lines are condensed from the source and modernised a little where the old wording is hard to follow, but the plot, the characters and the best lines are kept.
   - A `look` uses the show's own look options (`LOOK`), so the film's people are drawn by the cast's sprite code.
   - `react` on a line is optional (`laugh`, `gasp` or `scream`), at most 1 line in 6. The audience reacts there.
   - The next part's call gets the cast list and the recaps so far, so names and looks stay the same.
   - `cleanFilm()` checks it like `cleanLecture()`: a known `who`, lengths, at most 2 frames a scene, and set kinds, props and poses only from the library below. Anything unknown is dropped.
3. **Stored once:** each part goes to its own KV key, `film:<YYYY-MM-DD>:<part>` (about 5 writes a week). `s.cinema` keeps only the title, the date, how far the writing has got and any error, so the state stays small.
4. **Timing:** `filmTick()` in `tick()` picks the next title (`s.cinema.queue`, strands in turn) on Sunday and writes one part a day from Sunday to Thursday. The film has to be ready by Friday noon, before Shabbat. If it isn't, the week's showing is a repeat of an older film from KV: "a classic back by demand".
5. **Memory:** a `note` (one line Ishai would repeat, quoting the film or about it) and the friend's reaction go into `addLife()` after the night. `eventNote()` lets him look forward to the next one and bring the film up with someone in the days after.

## AI budget
- About 4-6 Gemini calls a week, one a day, each roughly 10-20k tokens in and 4-6k out. That is small next to the daily story.
- **Gemini only.** A film call never falls back to Cloudflare Workers AI, because a whole part's output would cost thousands of neurons. If Gemini is paused or fails, `filmTick()` tries again at the next day's slot, and Thursday has a second try.
- 0 AI calls on the night. Host lines at the doors, the intermission and the walk out come from line pools (`F_HOSTS`, `FILM_TALK`, by genre), as on gallery nights.
- KV: about 5 writes a week, plus the usual state saves.

## On screen (the page, no AI)
- **The film inside the screen** is drawn on its own small canvas at a coarser pixel (2× the world's), with a 16-colour palette per `palette`, then scaled onto the screen. The coarser pixel tells viewers it is a film within the show. Horror gets a cold, dark palette and a slow flicker.
- **Sets** come from a small library of drawing functions, written by hand once and following `SCENE_GUIDELINES.md`. The AI only combines them, as with the block kit.
  - Sets: `room`, `garden`, `street`, `forest`, `palace`, `shore`, `ship`, `tavern`, `castle`, `graveyard`, `moor`, `lab`.
  - Props: `piano`, `table`, `throne`, `tree`, `window`, `moon`, `boat`, `candle`, `coffin`, `portrait`, and more.
  - An `era` tints the furniture and clothes.
- **Characters** are drawn by the show's sprite code from their `look`, with simple poses (`stand`, `sit`, `kneel`, `bow`, `point`, `embrace`, `fall`, `cower`). Mouths move while they speak.
- **Movement:** each frame has a slow camera move on the clock (`pan-left`, `pan-right`, `zoom-in`, `still`), with a cut or fade between frames and scenes. Horror adds `lightning` (a white flash with a thunder sound).
- **Text:**
  - Scene cards at the start of each scene ("ACT II: The garden at the Manor House").
  - The lines as subtitles at the bottom of the screen, coloured per character. They are not speech bubbles, which stay for people in the room.
  - The 8-BIT PICTURES card at the start, the title and author, and THE END.
- **Before the film:** a short reel of ads for the show's fictional brands (Cooola, HummusPrime, ateBite) and the poster for next Saturday's film.
- **Voices:** film characters get voices like the band members (`EXTRA_SPK`) with a gentle cinema-speaker filter. The HD voices make them ahead like any line the page knows.
- **The audience:**
  - murmurs before the film;
  - laughs, gasps or a scream where a line has `react`;
  - claps at THE END;
  - a phone screen lights up now and then and is hushed.
- **Sync:** `filmNight()` lays out every scene's and line's start from the date alone, like `concertNight()`. Everything is drawn from the clock and the night's seed, never `Math.random()`, and a late joiner lands mid-scene.

## The story around it
- The night is a goal with `fixed: true` (`scheduleFilm()`), like a gallery night. The friend is chosen from the date, with nobody some weeks. The goal holds:
  - the trip there: a walk, or the bus to the promenade;
  - the box office and popcorn on `mall3b`;
  - the seats;
  - the film, one moment per few scenes with action `film` and no host lines, as in `lecture`;
  - the intermission: Ishai and the friend talk about it, from `FILM_TALK` with the part's recap;
  - the second half;
  - the walk out on the food court, where they argue about the ending, with the friend's memory `update`.
- **Viewers:**
  - `comingUp()`, the TV guide's THIS WEEK, the hosts' teasers and the PiP carry the title and pitch from Sunday;
  - a promotion poster can go on the 8bitTV billboard;
  - later, a survey of the week, "Which film next Saturday?", with three titles from the list (`docs/SURVEY_PLAN.md`).
- The live story can't put him in the cinema (`validate()`), and the night is never in two places.

## Director page
A **Cinema** box next to the course controls (dev only):
- the next film: title, genre, date and writing progress (parts done of parts), with any errors;
- buttons: "Pick another title", "Write it again", "Repeat an older film" and "Skip this week";
- "Preview": opens the sandbox on the night (`?loc=cinema&film=<date>&at=<min>`).

## Build order
1. **The place:** the PixelPlex front on `mall3b`, the `cinema` auditorium (CAM-38), and Saturday-night hours in `world.json` and `places.json`. Sandbox and builder entries. Checked in day, night and rain, with and without a friend.
2. **The writer:** `story/films.json`, Gutendex and the text download, splitting, `generateFilmPart()`, `cleanFilm()`, the KV keys, `filmTick()`, `/api/film` (dev), and health `cinema`. Check one whole film by reading its JSON.
3. **The film on the screen:** the film canvas, the set and prop library, characters from `look`, subtitles, cards, camera moves and the ad reel. Sandbox button "Film night".
4. **The night:** `filmNight()`, `scheduleFilm()`, the moments, line pools, voices, audience sounds, memories, teasers and the TV guide.
5. **Director controls**, and later the survey.

## Test before pushing
No test suite: serve `source/public` and drive it with Playwright, as in `docs/BUILDER_PHASE2.md`.
- Play one film of each genre from start to finish in the sandbox at high speed: every scene draws, there are no console errors, the subtitles fit, and the timing adds up to 25-35 minutes.
- Night, rain, with and without a friend, a late join mid-scene, a week he skips, and The Big S on a normal Saturday afternoon (shut) and on a weekday (open, cinema closed).
- Then `cd source && node build.mjs`, bump `VERSION`, update `CLAUDE.md` (a "Saturday cinema" section) and `docs/SCENE_GUIDELINES.md` (the map table and the new place), commit and push to `main`.

## Decided
- 2026-11-13:
  - **Genres:** all of them (comedy, drama, horror); at 8-bit nothing is graphic.
  - **Place:** the cinema at The Big S, not the Pump House.
  - **When:** on Saturday, once a week.
  - **By Claude:** 21:00 after Shabbat, the name PixelPlex, and the cinema on floor 3 off the food court. The director can change any of these.

## Open questions
None.
