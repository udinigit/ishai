# The Pump House (arena): plan

Approved by the director on 2026-11-08. Read `CLAUDE.md` and `docs/SCENE_GUIDELINES.md` first. Nothing here is built yet. It shares the show timeline and the table/crowd-guests controller with `docs/POKER_PLAN.md`; build those once.

## The idea
The Pump House is a small venue next to the park: an old water-pump hall turned into a place for about 120 people. **Once a week** (default Wednesday, doors 19:30, show 20:00) there is one event, **20 to 90 minutes** long:
- **Concert**: a band or singer the director created and uploaded songs for.
- **Exhibition**: pixel-art pieces the director uploaded, each at its own scale, hung together and browsed.
- **Gallery night** (the fallback, automatic): when nothing new was added for the week, an exhibition of 8-bit pictures from picsum.photos, pixelated like the dream pictures.

Before each event, director-made **promotions** (posters, leaflets, TV and radio ads, with text, images and links) show up in Ishai's world and in a card for viewers, so people know the artists and bands in advance.

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
- **Exhibition and gallery mode:** the stage lights are off and the pixel screen shows the event title. The art hangs **together** on the back wall, on the stage's side walls and on freestanding panels on the floor: a whole set is visible at once, and Ishai and his friend browse it (see "Hanging the art"). A **front curtain** on a rail runs across the hall in front of the walls; it is used to change sets.
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

## Hanging the art (dynamic layout)
The hall has no fixed frames: each night's walls are laid out from the pieces themselves, so any number and any size of art works.

**Wall space.** The hall's walls are a set of hanging areas, in logical pixels:
- the back wall: about 150×40 px, above head height;
- two side walls, drawn in perspective: about 30×36 px each;
- up to three freestanding panels on the floor: about 28×30 px each.

Each area has a floor line, so nothing floats (rule 3), and nothing hangs where people stand in front of it (rule 3b).

**A set.** A set is the pieces on the walls at one time.
- `hangSet()` (in the worker when the event is saved, so every viewer gets the same layout) packs the pieces into the areas.
- It goes biggest first, keeps at least 4 px of wall between frames, centres each row, and puts a small caption card under each piece.
- It is a plain shelf-packing: it fits each row, then starts the next.
- If the pieces don't all fit, the rest go to the next set.

**Changing sets: the curtain.**
1. When a set has had its time, Hagit says a line ("Second room, same artist, different mood."). The front curtain drops across the hall (about 3 s, drawn falling from the rail).
2. One quiet moment follows behind it. The camera stays on the curtain with the people in front, who chat, get a drink or wait. Muffled sounds of hanging come from behind.
3. The curtain rises on the new set.

Nobody sees a frame appear in place: art only changes behind the curtain (rule 2). The director can also set a curtain change at a fixed time.

**One big main piece.** Any piece can be marked **main**. It then gets the whole back wall alone (up to about 150×56 px, lit by a spot), as its own set, usually last. The director can also make a night of a single big piece.

**Scale.**
- When the director uploads a piece, they set its **scale** in whole steps (×1, ×2, ×3) or a target wall size. The director page shows a live preview of the wall with the layout as it will look.
- Pixel art stays pixel-exact: only whole-number scaling, never smoothing.
- Upload limits: 256×144 px source, up to 20 pieces a night, PNG only, with the palette snapped on upload.

**Browsing.** Ishai and his friend move around the hall on a walking plan for the set, made from the layout and the seed:
- they walk to a piece, stand and look (2-6 s), talk, and move on;
- sometimes they split up and meet again;
- sometimes one calls the other over ("Ishai, come look at this one").

Muted visitors browse too, never blocking a piece being talked about.

**Close-up.** When they talk about a piece, the camera may cut to a **close-up** of it (the piece large, with its frame edge and caption card) for a few seconds, then back to the hall. Big pieces get a close-up more often than small ones, and the main piece always does.

**Length.**
- A set takes roughly 1.5-2 minutes per piece, plus the curtain moment.
- Pieces seen together share time: two people browsing a wall of 6 cover it faster than 6 pieces one by one.
- A 45-minute gallery night is about 3-4 sets of 5-8 pieces, or 2 sets plus a main piece.
- The director page shows the total, and warns outside 20-90 minutes.

## Exhibitions (the director's art)
- Upload PNG pixel art for each piece, with its **scale**, a title and a caption, and optionally **main**. Add the artist's name, a short bio and the artist's links (see Promotions).
- The director arranges sets by dragging pieces between them (or lets `hangSet()` decide), and previews each wall.
- The artist may be drawn as a guest standing by their work.
- **The talk:** Hagit reads the caption, Ishai and his friend react from pools, and the hosts get one line per set and per main piece.

## Gallery nights (the automatic fallback)
- **The pieces:**
  - Pictures from picsum.photos, as the dream already does. At scheduling time the worker turns each `picsum.photos/seed/arena-<date>-<n>` into the picture's fixed id, so every viewer sees the same pictures.
  - In the page they are drawn as 8-bit pixels in the same way as `dreamImg()`, at a larger size: 64×36 on the wall and 128×72 for the close-up.
  - A picture that fails to load shows an empty frame with the card "On loan".
- **The show around them:**
  - **A fictional pixel artist each week:** the name comes from name lists and a title for the night from word lists, both picked by the seed ("Noga Bar-Lev: *Small Weather*").
  - **The credit**, said honestly on a small wall card: "pixel translations after photographs from an open collection".
  - **Each piece's title** comes from word lists too ("Untitled (Blue Hour) #3").
- **The layout:** the pictures are hung together in sets exactly like uploaded art (see "Hanging the art"), each at a seeded size (small, medium or large), with a curtain change between sets. The last set may be one big main picture.
- **The length:** set by the number of sets. The default 45 minutes is about 3 sets of 6, plus a main piece.
- **Talking about a picture nobody has seen:** the lines may stay vague, as the director allows. Two levels, with no AI:
  1. **Picture facts:** while drawing the 8-bit version, the page measures a few things: how bright it is, the main colour, warm or cold, a bright top over a darker bottom (sky and land), mostly green (nature), and how busy it is. A picture always gives the same facts, so every viewer gets the same lines. Lines are written as templates with these facts: "All that blue at the top… I keep looking at the horizon." / "It's so dark. Is that night, or a mood?" / "Very green. I can almost hear it."
  2. **Vague lines,** when the picture didn't load or nothing stands out. These can fit any picture: "I don't know what it is, but I don't want to stop looking at it." / "She says it's about her father. I see a road." Hagit's lines work the same way: about the artist's process, the 8-bit translation, light and patience.
- **Optional, off by default:** one story-writer call the day before, which writes 2-3 lines per piece from the title and its facts. That's one call a week.

## Promotions: leaflets, posters and ads
The director can add promotions for any coming event, artist or band: **text, images and links**. They work on two levels at once:
- **In the world**, for Ishai: real objects he can see, pick up and talk about.
- **For the viewers**: the same material in a card they can open, with links to the artist's or band's real pages.

So viewers get to know the artists and bands in advance, and can follow the links if they like what they see.

**A promotion is:**
- a title, a short text, and an image (a poster, a photo, a cover; pixelated into the show's style for the world and kept as uploaded for the viewers' card);
- up to 3 links, each with a label ("Listen", "Instagram", "Website");
- the event it belongs to;
- from and until dates;
- where it shows (any of the forms below).

**In the world:**
- **Posters** on walls and boards:
  - the Pump House board (THIS WEEK / NEXT WEEK);
  - the street billboards (Herzl St. west already has billboard spots);
  - the corridor notice board;
  - the café wall, the bar's poster wall (next to Grave Tahini and Iron Falafel), and the campus notice board.
  - Drawn from the pixelated image with the title in the show's pixel font, on the surface they hang from.
- **Leaflets:**
  - one slipped under Ishai's door (a no-AI moment: he finds it, picks it up, reads it, puts it on the fridge where it stays until the event);
  - a stack on the café counter or the kiosk;
  - Hagit or the band handing them out in the park.
  - The story gets the promotion's text (`promoNote()`, like `cityNote()`), so the AI can have him mention it or invite a friend.
- **Ads:**
  - a short spot on 8bitTV or RGBeat (the image, the title and a line, between programmes on the gym screens and when he watches TV);
  - a DJ mention on Radio Herzl 88.2 (`djLine()` gets the text);
  - the hosts plugging it ("This Wednesday at the Pump House: …").
- **How often:** a few times a day per promotion, from clock slots (the same for everyone). More in the last days before the event, never during Shabbat.
- **On the night:** in the plaza, posters and the merch table show the same art.

**For the viewers:**
- **A "COMING UP" card under the picture:** the image, the text and the link buttons. It is open:
  - while a poster, leaflet or ad of that promotion is on screen (a small "ⓘ" over the poster opens it);
  - and from a new **EVENTS** tab next to CAST and SUMMARY, which lists the coming events with their promotions.
- **During and after the event:** the card stays on (the band's or artist's links) until the promotion's end date.
- **Alerts:** the bell's key-moment alerts may announce an event the day before. This counts against the daily alert limit.

**Links are kept safe:**
- Only the director can add them.
- Only `https://` addresses; the domain is shown on each button.
- They open in a new tab with `rel="noopener noreferrer nofollow"`.
- No scripts or HTML in promotion text: it is shown as plain text.

**Rules:**
- Promotions are for the fictional world's events, with real links only to the real artists or bands who perform or exhibit there.
- Nothing in the world uses real brands' look.
- Ishai never sees the viewers' card: he only knows the leaflet, the poster and the ad.

**Stored:** promotions live in D1 (table `promos`), the images in R2. `/api/promos` serves the active ones, and the director page's Events tab edits them.

## Page work
- **The plaza and the hall scenery**, the queue, and the crowd that comes and goes with the event (all from the clock and seed).
- **The show-timeline player:** cues → state at `NOW()`. It's shared with poker.
- **The guests controller:** the band on stage is on it, the friend in the crowd, and the artist by the panels.
- **The audio player** for songs (sync and drift fix), and the beat-map reader that drives the animations.
- **The art walls:** drawing a set from its layout at any size and scale, the curtain drop and rise, the main-piece spot, the browsing walks, the close-up view, the 8-bit drawing of gallery pictures and the picture facts.
- **Promotions:** posters drawn on their walls and boards, the leaflet under the door and on the fridge, the TV ad spots, the "ⓘ" over a poster, the COMING UP card and the EVENTS tab.
- **Sandbox:** "Arena: concert", "Arena: gallery night" and "Queue" buttons, plus `?loc=plaza`, `?loc=arena&event=<date>&at=<min>`. The builder gets both places and the stage props.

## Director page work
- **The Events tab:**
  - the calendar, and creating a band, a concert or an exhibition;
  - uploads with the analysis in the browser, and the tap-along cue editor;
  - uploading art with its scale and title, marking the main piece, arranging sets by dragging, and a live preview of each wall;
  - the total length and the 20-90 check;
  - promotions: text, image, links, dates and where each one shows, with a preview of the poster, the leaflet and the viewers' card;
  - "Replace with gallery night" and "Skip this week".

## Progress
- v162: the plaza, the hall, Hagit, the map links.
- v163: gallery nights end to end (scheduling, layout, curtain, main piece, browsing, close-ups, queue, line pools, sandbox button). Not yet: picture facts in the lines, the director's Events tab, uploads, promotions, concerts, the poker night's shared table-guests controller.

## Order of work
1. The plaza, the hall and Hagit, the map links, `PLACES`, `LOCATIONS`, `FILL`, `OVERHEARD`, `ERRANDS`.
2. The show timeline and the guests controller (shared with poker; build once).
3. Gallery nights end to end (no uploads needed): scheduling, the queue, `hangSet()` and the art walls, the curtain, browsing, close-ups, picture facts and the line pools.
4. Exhibitions from uploaded art with scale and sets (R2, the Events tab).
5. Promotions: posters, leaflets, ads, the COMING UP card and EVENTS tab, links.
6. Concerts: bands, song upload and analysis, synced playback, beat-driven animation, the cue editor.
7. Build, test in a real browser (day and night, phone width, joining mid-song, pop-out, iOS tap), bump `VERSION`, update `CLAUDE.md` and the guidelines' map table.
