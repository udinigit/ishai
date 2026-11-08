# The Pump House (arena): plan

Approved by the director on 2026-11-08. Read `CLAUDE.md` and `docs/SCENE_GUIDELINES.md` first. Nothing here is built yet. It shares the show timeline and the table/crowd-guests controller with `docs/POKER_PLAN.md`; build those once.

## The idea
The Pump House is a small venue next to the park: an old water-pump hall turned into a place for about 120 people. **Once a week** (default Wednesday, doors 19:30, show 20:00) there is one event, **20 to 90 minutes** long:
- **Concert**: a band or singer the director created and uploaded songs for.
- **Exhibition**: pixel-art pieces the director uploaded.
- **Gallery night** (the fallback, automatic): when nothing new was added for the week, an exhibition of 8-bit pictures from picsum.photos, pixelated like the dream pictures.

Everything is planned ahead and **played as a script by the clock**: no live AI during the event. Ishai goes every week, alone or with a friend the daily planner picks. The live AI picks up again for the walk out.

## Where (new places)
**Map:**
- **Page:** the park's left edge (today "further into the park", leading nowhere) leads to the Pump House plaza's right edge. The plaza's double doors (x 60) lead to the hall's door on the right edge.
- **Worker:** `park: ["street","plaza"]`, `plaza: ["park","arena"]`, `arena: ["plaza"]`.
- **Route:** on foot only. It runs street → Herzl St. west → park → plaza, about 4-5 minutes of walking, like the park now.

**Plaza (`plaza`, CAM-19, `THE PUMP HOUSE`).** The front of an old brick pump house: a tall chimney, arched windows, an iron sign on brackets. Around it:
- a box-office window with a lamp;
- a poster board showing THIS WEEK and NEXT WEEK (like the campus sign, from `publicState.arena`);
- rope lanes on posts, a bike rack, two benches, a lamp post;
- after dark, string lights over the door.

On event nights, the queue:
- **When it forms:** from 40 minutes before doors, muted bystanders arrive from the park edge and stand in the lanes. When and where each one arrives comes from the clock and the event seed, so every viewer sees the same line.
- **The doors:** at doors time a staff member at the door scans tickets and the line moves forward one by one.
- **Ishai** joins the end of the line, moves up with it (new action `queueing`) and gets scanned.
- **Talk:** overheard lines in the line ("...they said the drummer is new...") and a `FILL` entry. Mutters from the curator, Hagit, at the door.

**Hall (`arena`, CAM-20).** The door is on the right.
- **Stage:** at the back, raised. Behind it a 64×24 px pixel screen (the "LED wall"), a lighting truss hanging on chains, and speaker stacks standing on the floor.
- **Floor:** a merch table on the left, the sound desk at the back of the floor.
- **Crowd:** two or three rows of muted heads and shoulders in front of the stage, drawn through `zAdd()`. Ishai and his friend stand in the front row's gap so they stay in view.
- **Exhibition and gallery mode:** the stage lights are off, the pixel screen shows the event title, and three freestanding panels with framed pieces stand on the floor. Ishai walks from panel to panel; for each piece the camera cuts to a **close-up** (the piece filling most of the frame, with the frame edge and a caption card), then back.
- **Also needed:** `ERRANDS` (a drink from the bar crate, the merch table), `exitX()`, and day/night (indoors, always lit for events).

**New regular: Hagit** (`hagit`, Pump House curator and manager). She hosts every event: introduces the band, gives the gallery talk, says goodbye.
- **Who:** 50s, ex-sound engineer, dry and passionate, explains everything with her hands.
- **Look:** hair bun, red; skin fair; shirt black; pants black; glasses, scarf.
- **INK:** suggested teal-gray `#4f8a8b`; check it against `INK`.

## Events and the week
- **The plan:**
  - The director page gets an **Events** tab: a calendar of the coming weeks, each with its type, title, start time and length.
  - `arenaTick()` in the worker checks this Wednesday's slot on Monday at 12:00. If no event was added, it makes a gallery night by itself.
  - Either way it becomes a goal with `sceneAt` (Ishai leaves home about 19:00, queues, goes in), and goes under "Already scheduled" in `season.md`. `pollFree()` and home visits keep clear of it.
- **Length:** 20-90 minutes, checked when the event is saved.
  - A concert = its songs plus banter, so the director page shows the total and warns outside 20-90.
  - A gallery night picks its own length (default 45 minutes).
- **Stored:** each event is one KV key `arena:<date>` (its cue list) plus files in R2 (below). It is served by `/api/arena?date=`.
- **Story:** each 6-minute tick during the event, the worker adds a no-AI moment: location `arena`, action `concert` or `gallery`. Its text and a host line sum up that window ("Song 3, the slow one. Ishai's friend has her phone up.") for summaries, highlights and dreams. After the event, the story prompt gets a short `afterShow` note (the band, the best moment) so the walk home can talk about it.

## Concerts
**Band creation (director page):**
- The band's or singer's name.
- Each member: name, instrument (vocals, guitar, bass, drums, keys) and a look from the look menu, with an `INK` colour for the singer.
- The singer's voice: the synthesised speech pitch and rate, used for banter only.
- A poster: built in the builder or uploaded.

**Songs:**
- Upload MP3 or OGG files to R2: a bucket `ishai-arena`, binding `ARENA`, free up to 10 GB. They go through a director-only `/api/arena/upload`, and `/arena/<file>` serves them back with range requests.
- The music must be the director's own or licensed for public play: the page is public.

**Script per concert:**
- an opening line from Hagit;
- 1-3 banter lines from the singer after each song ("This one's about my grandmother's car.") and a few small ones on stage ("You're great tonight!");
- an encore and a goodbye.

Only these lines are spoken during the show. Ishai gets a line every few songs from a short pool ("I know this one!"), and so does his friend. The hosts are silent during songs and say one line between songs, from a pool keyed to the setlist ("Song four. The drummer dropped a stick and found it again.").

**Playback:**
- The page loads the next song during the banter and starts it at `NOW() - songStart`, so a viewer who joins late hears it mid-song.
- Every 2 s it checks how far off it is and seeks back if it's over about 150 ms.
- iOS needs one tap (TAP FOR SOUND, like the voices button).
- Radio, DJ, host fill, sound effects and overheard lines are all paused during the event.

### Syncing the picture to the music
1. **The setlist: exact, nearly free.** Songs start and end, lights go up and down, banter and cheers all come from the clock.
2. **The beat: the main layer.**
   - **The analysis.** When a song is uploaded, the director's browser analyses it once with `OfflineAudioContext`. It finds the tempo and the time of each beat, the loud and quiet sections, and loudness every 100 ms in three bands (low for kick and bass, mid for vocals and guitar, high for cymbals). This is saved as a small JSON file next to the song.
   - **The page reads that file, not the sound.** That gives:
     - drum hits on the kicks;
     - the crowd bouncing on the beat;
     - lights flashing on strong beats and colour changes per section;
     - the singer's mouth opening when the mids are loud;
     - phones up in the quiet parts;
     - confetti on the loudest passage;
     - the pixel screen pulsing.
   - **Why it fits:** it's the same for every viewer, works with the sound off, in replays and in pop-out.
   - **Accuracy:** about ±50 ms on one device and about ±150 ms between devices, which reads as in sync at this pixel size.
3. **Hand-placed cues: for the highlights.** A tap-along editor on the director page plays the song while the director marks moments: "solo 1:32", "drop", "singer jumps", "lights out". These land exactly.
- **Optional, later:** separate stems (vocals, drums, bass), so each musician moves to their own part.
- **Not done:**
  - live analysis in each browser (it breaks "everyone sees the same thing" and fails when muted or on iOS);
  - word-by-word lip sync.

## Exhibitions (the director's art)
- Upload PNG pixel art (suggested up to 128×72) for each piece, with a title and a caption, plus the artist's name and a short bio.
- When it is uploaded, the art is snapped to the show's palette and fitted to the frame.
- The artist may be drawn as a guest standing by the panels.
- **The talk:** Hagit reads the caption, Ishai and his friend react from pools, and the hosts get one line per piece.

## Gallery nights (the automatic fallback)
- **The pieces:**
  - Pictures from picsum.photos, as the dream already does. At scheduling time the worker turns each `picsum.photos/seed/arena-<date>-<n>` into the picture's fixed id, so every viewer sees the same pictures.
  - In the page they are drawn as 8-bit pixels in the same way as `dreamImg()`, at a larger size: 64×36 on the wall and 128×72 for the close-up.
  - A picture that fails to load shows an empty frame with the card "On loan".
- **The show around them:**
  - **A fictional pixel artist each week:** the name comes from name lists and a title for the night from word lists, both picked by the seed ("Noga Bar-Lev: *Small Weather*").
  - **The credit**, said honestly on a small wall card: "pixel translations after photographs from an open collection".
  - **Each piece's title** comes from word lists too ("Untitled (Blue Hour) #3").
- **The length:** about 4.5 minutes per piece (walk to it, close-up, talk, a quiet look). A 45-minute night is about 10 pieces; 20 minutes is 5; 90 minutes is 20.
- **Talking about a picture nobody has seen:** the lines may stay vague, as the director allows. Two levels, with no AI:
  1. **Picture facts:** while drawing the 8-bit version, the page measures a few things: how bright it is, the main colour, warm or cold, a bright top over a darker bottom (sky and land), mostly green (nature), and how busy it is. A picture always gives the same facts, so every viewer gets the same lines. Lines are written as templates with these facts: "All that blue at the top… I keep looking at the horizon." / "It's so dark. Is that night, or a mood?" / "Very green. I can almost hear it."
  2. **Vague lines,** when the picture didn't load or nothing stands out. These can fit any picture: "I don't know what it is, but I don't want to stop looking at it." / "She says it's about her father. I see a road." Hagit's lines work the same way: about the artist's process, the 8-bit translation, light and patience.
- **Optional, off by default:** one story-writer call the day before, which writes 2-3 lines per piece from the title and its facts. That's one call a week.

## Page work
- **The plaza and the hall scenery**, the queue, and the crowd that comes and goes with the event (all from the clock and seed).
- **The show-timeline player:** cues → state at `NOW()`. It's shared with poker.
- **The guests controller:** the band on stage is on it, the friend in the crowd, and the artist by the panels.
- **The audio player** for songs (sync and drift fix), and the beat-map reader that drives the animations.
- **The close-up view** for pieces, the 8-bit drawing of gallery pictures, and the picture facts.
- **Sandbox:** "Arena: concert", "Arena: gallery night" and "Queue" buttons, plus `?loc=plaza`, `?loc=arena&event=<date>&at=<min>`. The builder gets both places and the stage props.

## Director page work
- **The Events tab:**
  - the calendar, and creating a band, a concert or an exhibition;
  - uploads with the analysis in the browser, and the tap-along cue editor;
  - the total length and the 20-90 check;
  - "Replace with gallery night" and "Skip this week".

## Order of work
1. The plaza, the hall and Hagit, the map links, `PLACES`, `LOCATIONS`, `FILL`, `OVERHEARD`, `ERRANDS`.
2. The show timeline and the guests controller (shared with poker; build once).
3. Gallery nights end to end (no uploads needed): scheduling, the queue, panels, close-ups, picture facts and the line pools.
4. Exhibitions from uploaded art (R2, the Events tab).
5. Concerts: bands, song upload and analysis, synced playback, beat-driven animation, the cue editor.
6. Build, test in a real browser (day and night, phone width, joining mid-song, pop-out, iOS tap), bump `VERSION`, update `CLAUDE.md` and the guidelines' map table.
