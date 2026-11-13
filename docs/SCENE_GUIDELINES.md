# Scene & character guidelines

These rules apply to every existing and future scene, character, prop and animation in Watching Ishai.
The goal: it should feel like watching a real place through a real camera — nothing pops, floats or teleports.
Inspiration: "The Truman Show". A real man's real life, watched through hidden cameras. Not a sitcom, not fully scripted; realistic to a point.

## 0. Realism first
- People and places are functional and bound to real-life physics: walking takes time, doors are used, vehicles stop to let people on and off, things stay where they were put.
- Characters behave like real people with their own routines, jobs and moods; they arrive and leave for reasons.
- Ishai never acknowledges the cameras. Only the hosts (Zohar, Oren) talk to the audience.

## 1b. The world map — no teleportation
Every exit leads to a specific entry in a specific place. The map lives in one file, `story/world.json`; the build (`source/world.mjs`) turns it into `MAP` and `LOCATIONS` in the page and `NEXT`, `PLACES`, `LOCATIONS` and `WALK` in the worker, and refuses to build a broken map. Current map:

| From | Exit (x) | Leads to | Entry there |
|---|---|---|---|
| Apartment | front door (135) | Corridor | apt 4 door (40) |
| Corridor | apt 4 door (40) | Apartment | front door (135) |
| Corridor | stairs (178) | Street | building entrance (26) |
| Street | building entrance (26) | Corridor | stairs (178) |
| Street | left edge | Herzl St. west (three blocks, CAM-14 to 16) | right edge |
| Herzl St. west | left edge | Park | right edge |
| Street | right edge | Shops (Herzl St. east) | left edge |
| Shops | left edge | Street | right edge |
| Shops | Cafe Nahat's door (186, the café corner) | Café | entrance (left) |
| Street | bus stop (128) | Market (Shuk Shalom) | its own bus stop (128) — by bus (day) or taxi (night / rain) |
| Market | bus stop (128) | Street | bus stop (128) |
| Market | Everything Else door (4, left) | Store | door (4, left) |
| Store | door (4) | Market | Everything Else door (4) |
| Street | bus stop (128) | Off camera | — by bus (day) or taxi (night / rain) |
| Street, Market | bus stop (128) | Bus (CAM-12) or Taxi (CAM-13) | seated, after the camera switch |
| Bus, Taxi | a stop | Street, Market (bus stop 128) or Off camera | the vehicle pulls in and he steps off |
| Street | bus stop (128) | University courtyard | its own bus stop (128) — by bus (day) or taxi (night / rain) |
| University courtyard | bus stop (128) | Street | bus stop (128) |
| University courtyard | lecture building doors (60) | Lecture room | door (right edge) |
| Lecture room | door (right edge) | University courtyard | lecture building doors (60) |
| Street | Herzl Gym door (64, blue building) | Gym | door (4, left) |
| Gym | door (4) | Street | Herzl Gym door (64) |
| Street | The Black Candle door (101, next to the bench) | Bar | door (4, left) |
| Bar | door (4) | Street | The Black Candle door (101) |
| Apartment | bathroom door (48) | Bathroom | door (9) |
| Bathroom | door (9) | Apartment | bathroom door (48) |
| Park | right edge | Herzl St. west | left edge |
| Herzl St. west | right edge | Street | left edge |
| Café | entrance (left) | Shops | Cafe Nahat's door (186) |
| Corridor | stairs (178) | First-floor landing (CAM-21, page only, only on the way to apt 2) | stairs up (178) |
| First-floor landing | stairs down (8) | Street | building entrance (26) |
| First-floor landing | apt 2 door (92) | Apartment 2 (CAM-22, Boaz) | door (4) |
| Apartment 2 | door (4) | First-floor landing | apt 2 door (92) |
| Park | left edge | Pump House plaza (CAM-19) | right edge |
| Pump House plaza | right edge | Park | left edge |
| Pump House plaza | double doors (60) | Pump House hall (CAM-20) | door (right edge) |
| Pump House hall | door (right edge) | Pump House plaza | double doors (60) |
| Shops | right edge | Herzl east 1 (CAM-26, page only: the square, Stanley Cubrick) | left edge |
| Herzl east 1 | right edge | Herzl east 2 (CAM-27, page only: the mural, the kiosk) | left edge |
| Herzl east 2 | right edge | Herzl east 3 (CAM-28, page only: the fountain) | left edge |
| Herzl east 2 | the kiosk counter (140) | Shmulik's kiosk (CAM-29) | left edge (from the sidewalk) |
| Shmulik's kiosk | left edge | Herzl east 2 | the kiosk counter (140) |
| Pump House plaza | left edge | Promenade east (CAM-23, page only) | right edge |
| Promenade east | left edge | The promenade (CAM-24) | right edge |
| The promenade | left edge | Promenade west (CAM-25, page only; The Big S) | right edge |
| The promenade | bus stop (128) | Street | bus stop (128) — by bus (day) or taxi (night / rain) |
| Promenade west | The Big S's glass doors (52) | The Big S, floor 1 west (CAM-30) | the glass doors (20) |
| The Big S floor 1 | edges (CAM-30 ↔ 31 ↔ 32) | the next screen of the floor | the facing edge |
| The Big S floor 1 middle (CAM-31) | the escalator's foot (166) | Floor 2 middle (CAM-34) | the escalator's top (40) |
| The Big S floor 2 | edges (CAM-33 ↔ 34 ↔ 35) | the next screen of the floor | the facing edge |
| The Big S floor 2 middle (CAM-34) | the escalator's foot (166) | Food court west (CAM-36) | the escalator's top (40) |
| The Big S food court | edges (CAM-36 ↔ 37) | the other food court screen | the facing edge |
| The Big S food court east (CAM-37) | right edge (the PixelPlex doorway) | The PixelPlex (CAM-38) | its door (8) |
| The PixelPlex | its door (8) | Food court east | right edge |
| Street | bus stop (128) | The promenade | its own bus stop (128) |

- Every link is the same door both ways: leaving X by door A into Y always arrives at Y's door B, and leaving Y by door B always arrives back at X's door A (`MAP[x][y].exit === MAP[x][y].entry`).
- A friend going somewhere with Ishai walks right behind him through the same doors, place after place, and arrives through the door he used (never from a random edge).
- If the story jumps several places at once, the page routes Ishai through every place in between (shortest path on the map).
- Far places are reached by bus or taxi from the street bus stop: the vehicle pulls in, stops, he gets on/off, it drives away.
- **Adding a place** (e.g. a restaurant): decide where it physically is, add it to `story/world.json` (`kind`, its `links` on both sides, and for a story place `desc` and `actions`), its hours and visits to `story/places.json`, draw its doors/edges, and say how you get there (walk from a neighbouring scene, or bus/taxi from a stop). The build checks that every link has a way back, every place can be reached, and `places.json` only names places on the map. A place without a connection must not ship.

## 1. Every scene has clear exit points
- Each camera location defines where people enter and leave, and they are visible in the art:
  - Apartment: front door (people), bathroom door (Ishai only).
  - Bathroom (page-only room, CAM-06): its door. The story still says apartment + bathroom/showering; the page moves him there.
    Privacy: the toilet is inside a stall (only his shoes show under it, occupied light red), the shower is behind frosted glass (only a soft blur). Never show more.
  - Corridor: Ishai's door (apt 4), Mrs. Levi's door (apt 5), the stairs/exit, the elevator.
  - Street: Ishai's building entrance, left edge, right edge.
  - Herzl St. west (CAM-14 to 16, `west1`-`west3`, page only): left and right edges. Walk-through blocks between the street and the park (`westBlock()`): PicSell, a pharmacy, the Soap Opera launderette, a barber, a makolet, a bakery, a bookshop, a bicycle shop, with RGBeat, Boolify and 8bitTV billboards. The story never stops here: it still goes street > park and `route()` walks him through, about 9 s a block, so they cost no AI and no prompt space.
  - Park: right edge (path to Herzl St. west), left edge (across the park to the Pump House).
  - Pump House plaza (CAM-19): the park path (right edge), the hall's double doors (60). Ticket window, poster board, rope lanes for queues.
  - Pump House hall (CAM-20): its door on the right. Stage, pixel screen, merch table. Open only for events.
  - Herzl east 1-3 (block kit, page only): `east1` (CAM-26) the little square with Stanley Cubrick, a brick man with a cube head on a plinth (spelled with a C on purpose; pigeons on the cube, flowers on Fridays); `east2` (CAM-27) the mural of the Earth as a cube, and Shmulik's kiosk with its plastic table (the counter at 140 leads in); `east3` (CAM-28) a fountain with benches (water 06:00-23:00) and Falafel Two. Only the left edge of east 3 is a way out.
  - The Big S (CAM-30 to 37, block kit `ground: 'indoor'`, `mallScene()` / `mallStore()`): the story names `mall` (floors 1-2) or `foodcourt` (floor 3) and the page picks the screen (`screenFor()`: the store the moment names, else its 20-minute slot) and walks him there. The same floor on every screen; stores differ by sign and window (`store`), or by their front (`open`, `big`, `boarded`, food `food` counters); shutters on Shabbat. Escalators: up at 166 (CAM-31, CAM-34), arriving from below at 40 (CAM-34, CAM-36). Floors 2-3 show the glass balustrade; the food court has a glass roof (`glass`) with the real sky and rain, tables, and he sits at one to eat.
  - The PixelPlex (CAM-38): the auditorium from the back row: the screen (32-160, 5-57) with its red curtain, EXIT signs, the door on the left (8), six rows of red seats with the audience's backs; Ishai and his friend in the 4th row, middle. Only on Saturday nights, planned moments only. The film inside the screen is drawn at its own coarser pixel.
  - Shmulik's kiosk (CAM-29): close on the counter: shelves, the drinks fridge, seeds, the radio, the MAZAL lottery stand, the newspaper rack; the plastic table on the sidewalk (he sits there to eat, drink or read). Shmulik behind the counter 06:00-18:00 (POST), a nameless night clerk otherwise. A backgammon board on the counter when Ishai stands there with Shmulik.
  - The promenade (block kit, `ground: 'promenade'`): `prom1` (CAM-23) right edge to the plaza, left edge on; `promenade` (CAM-24) both edges and its bus stop (128); `prom3` (CAM-25) right edge only (The Big S closes the west end). Sea, sand, a white railing, the wave-tiled walk, the red bike lane, the seafront road.
  - Shops (CAM-09, Herzl St. east): left edge (back to Ishai's block), Cafe Nahat's door (186, on the corner), right edge (on to Herzl east 1). Herzl Hardware, Tahini Tower Savings Bank + ATM, a flower shop, a pedestrian crossing with lights, Kfar Kofi billboard.
  - Café: the entrance on the left.
  - Bus (CAM-12, line 88) and Taxi (CAM-13): no doors of their own; he boards at a stop on the street camera and the switch finds him seated. Every ride between places shows here for `RIDE_MS` (2.5 minutes, the city keeps looping past), or longer when the story puts a moment on board. Dialogue in a moment that arrives by ride waits until he is there, and a viewer who tunes in mid-ride joins him on board. Taxi at night, in the rain and on Shabbat. No `ERRANDS`: he stays in his seat. The city outside (`cityDrive()`) is currently the only route; it runs on the real clock with a red light every 52 s, and handles any hour and weather.
  - Market (CAM-10, Shuk Shalom): the bus stop (128) and the Everything Else door (left). Food stalls with striped awnings, vendors, a banner and string lights; open 07:00-19:00, Fri until 14:00, closed Shabbat.
  - Store (CAM-11, Everything Else): its door on the left. A wall of TVs, shelves of home goods, a clothes rack, a cashier; everything except food; open 09:00-21:00, Fri until 14:00, closed Shabbat.
  - Gym (CAM-07, Herzl Gym): the glass door on the left. Treadmills under two wall screens (Channel 9 with sound on, and 8bitTV, NESflicks or RGBeat); "exercising" = on the treadmill. Open 06:00-23:00.
  - Bar (CAM-08, The Black Candle): the heavy door on the left. Dark rock bar: black brick, red neon, candles, fictional band posters (Grave Tahini, Iron Falafel). Opens 17:00, closes 02:00.
- A new scene must define its exit points in `MAP` (Ishai's routes) and `exitX()` (companions) before it ships.

## 2. Nobody appears or disappears in place
- Main characters always **walk in** from an exit point to their spot, and **walk out** to an exit point when they leave — even from a seat (table, bench, counter). Use the companion controller (`wantComp` / `compUpdate`); never draw a companion directly at their spot without it.
- Ishai walks to an exit before every camera switch, and walks in from the matching entry after it.
- Hiding is only allowed behind something real: the bathroom door, the camera switch, or off-camera locations ("CAM-??").
- Nobody fades. Background people who come for a while walk in from an exit and walk out again (`crowdVisit()`, `visitAt()`); walking bystanders enter and leave off the screen edges.

## 3. Nothing floats
- Every prop sits on a surface or hangs from something visible (signs on wires/brackets, posters on walls, cans on counters).
- People stand on the floor line of their scene (`walkY`), sit on actual seats, and never overlap water, walls or furniture tops.
- Signs and lights may flicker, but never vanish completely.

## 3b. Depth
- What stands closer to the camera covers what stands behind it. In a scene, anything that can overlap goes through `zAdd(baseY, fn)` between `zOn()` and `zFlush()`, where `baseY` is where it meets the ground; the queue draws back to front. `drawFloor`, `liveLayer`, `crowdWalk`, `crowdStill` and `regular` do this by themselves. Add new props, street furniture and vehicles the same way.
- Never hide a person (or thing) because Ishai or someone else comes close to it. When two figures meet, both stay drawn and the closer one covers the other. If a spot must stay free (Ishai's place in the concert crowd), keep the gap from where he will stand, decided once, never from where he is right now.
- Tables stand nearer the camera than the walking line (`walkY + 22`): people walk behind them, and behind whoever sits at them. Standing spots in `stand` stay clear of tables, so conversations aren't hidden.

## 4. Focus: main characters vs. bystanders
- Ishai and the cast: full saturation, thin dark outline (`outlined()`), speech bubbles.
- Bystanders: muted palette (`muted:true`), solid (never see-through), no outline, no speech bubbles or voices, never block the main action.
- Overheard (`overhear()`, `OVERHEARD`): now and then, about one 4-minute slot in three while he is alone in a place with people, a passer-by's half sentence shows for 6.5 s as a small grey caption marked OVERHEARD. It has no name, bubble or voice, never enters the chat, and starts with "...", so it can't be taken for the cast. Never plot.
- New cast members are drawn only from the look menu (hair, colors, extras) so they stay consistent forever.

## 4b. Regulars
- Regulars (`REG` in the page, `regular` in the worker's cast) are in-between: muted like bystanders, but with a name, a place, hours and a spot. Michal and Sivan at the gym, Mr. Zelig in the park, Kobi at the bar (drunker with the hour), Lior at the café. Each takes the spot of the usual crowd when present and misses a day now and then.
- They say short lines to themselves or the room on the clock (`MUTTER`, no AI), and the story can talk to them with `with`: they walk over from their spot and go back to it.
- Gadi is never drawn: he only phones, texts or emails.

## 5. Same picture for every viewer
- Animations, bystanders, traffic and sponsored camera switches are driven by the shared clock (`NOW()`), not by page load or the device clock, and movement advances in fixed steps on it.
- A viewer who tunes in mid-moment joins it where it is: conversations, and people mid-walk or on a ride (`joinMoment()` replays the moment unseen).

## 6. Pixel style
- Canvas 192×108 logical pixels, scaled up with `image-rendering: pixelated`. Figures are 10×22 px.
- Use `R(x,y,w,h,color)`; no anti-aliasing, gradients or images.
- Lighting follows the real Tel Aviv clock and weather: night darkening, lit windows, streetlights, rain, clouds.
- Respect the darkness overlay: anything drawn after it must look right at night too.

## 7. Brands and placement
- Only fictional brands, with their own visual identity (Cooola = purple + lime, blocky letters, lightning bolt). Never imitate a real brand's colors/logo.
- Product placement must sit naturally in the world (billboards, kiosk banners, buses, vending machines, cans on counters, neon in windows).

- NESflicks is grey and gold like an old game box, never red on black. Boolify is pink, with no round green logo. 8bitTV is bright pixel colours. RGBeat (Channel 6, music clips) is red, green and blue on near-black. PicSell is yellow and charcoal. The home TV faces away from the camera and its screen is never shown: Ishai names the channel and comments on what he sees. The gym has two wall screens: Channel 9, and next to it 8bitTV, NESflicks or RGBeat (`ev.media`, otherwise the clock).

## 8. New art workflow
- If the story needs something that cannot be drawn yet, it goes on the missing-art list or into a director goal with `art` — the beat waits until the art is live.
- Before pushing new art: preview it with the page's `?loc=…&pose=…&with=…&hour=…` parameters, check day and night, and check it against every rule above.

## 9. Dreams
- While Ishai sleeps, a thought bubble above his bed replays the day's highlights (`DREAM`, from the worker's `s.hl`: moments with a person, a new place, a goal or an unlock), 7 s each, zoomed on the people.
- Dream pictures are drawn off screen with `DREAMING = true`, so they never touch live state (companions, the dog, speech-bubble heads). Any new scene must draw correctly with a fake, hidden actor.

- Sleep phases: first 10 minutes just sleeping, then zzz, after 15 minutes the dream bubble. Every ~100 s the dream takes a 14 s counting-sheep break; twice per cycle it shows a random picsum.photos picture turned into 8-bit pixels (seeded by the clock, same for everyone; skipped if it fails to load). Preview with `?loc=apartment&pose=sleeping&sleptMin=20`.

## 9b. Clothes
- Outfits change automatically (`outfitOf()` in the page, no AI): pajamas for Ishai in bed / at home late at night without guests, sportswear at the gym, a jacket over the shirt outside in rain or at 15°C and below, a white shirt at home on Shabbat evening. Cast members get the same rules (their own jacket/sport colours); bystanders keep their look. Portraits and dreams use the normal look.

## 9c. Park life
- The park has street cats (one asleep under the tree, one by the vending machine that comes over when he eats on the bench, one strolling the far lawn), pigeons on the path that flutter off when someone comes close (and peck crumbs by the bench), crows on the lamp and in the tree (one flies over now and then), and joggers.

## 9d. Improv class
- The action `improv` (planned beats only) sets The Black Candle up for the class (`barLesson()`, `improvRoom()`): the table against the wall, six muted classmates on folding chairs in a half circle, Ishai and Yael standing on the cleared floor. The chairs stay until he has left, and the last moment plays outside, so nobody sees the room change. Preview: `?loc=bar&pose=improv&with=yael`.

## 9e. University
- Tel Herzl University (CAM-17, `campus`): stone building, doors at 60, the moving sign with the next lectures, a notice board, the Cooola vending machine (the break happens here), a bench, its own bus stop at 128. Open Sunday to Thursday 08:00-20:00.
- The lecture room (CAM-18, `classroom`, door on the right): the blackboard shows TODAY and NEXT from `COURSE`, Dr. Sasson stands by it, and ten muted classmates sit in two rows, `student1`-`student8` with speech bubbles. Ishai's seat is in the front row (`SEAT`). The action `lecture` comes from planned moments only, and the class stays seated through the break (`classOn()`). Preview: `?loc=classroom&pose=lecture&with=sasson`.

## 10. Fidgets and idle life
- Seated activities (working, gaming, reading, watching) never pop up for an errand: small breaks happen in the seat (`seatFid()`: a yawning stretch, a sip, rubbing eyes). Errands are for standing/idle moments only.
- Standing or listening characters fidget every few seconds (`fid()`): foot tap, stomp, weight shift, stretch, look around, scratch head, turn around, cross arms, check phone. Talking adds gestures, nods and shrugs. Seated people nod, gesture and look around.
- Standing friends take a couple of steps and come back now and then (`wander()`), never while it is their turn to speak.
- Ishai does small routines inside long moments (`ERRANDS`): every place has its own list, each with a weight alone and a weight with company (e.g. alone he grabs a drink; with a guest he brings drinks for both or shows something on his phone; the guest waits in place). `ERR_CHANCE` sets how often, alone vs. with company. The same routine never runs twice in a row, and a fridge trip before a drink happens at most every 6 minutes.
- New places must get their own `ERRANDS` entry. All of it runs on the real clock so every viewer sees the same thing. Portraits and dreams stay still.
