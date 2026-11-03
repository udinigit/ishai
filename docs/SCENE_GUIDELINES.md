# Scene & character guidelines

These rules apply to every existing and future scene, character, prop and animation in Watching Ishai.
The goal: it should feel like watching a real place through a real camera — nothing pops, floats or teleports.
Inspiration: "The Truman Show". A real man's real life, watched through hidden cameras. Not a sitcom, not fully scripted; realistic to a point.

## 0. Realism first
- People and places are functional and bound to real-life physics: walking takes time, doors are used, vehicles stop to let people on and off, things stay where they were put.
- Characters behave like real people with their own routines, jobs and moods; they arrive and leave for reasons.
- Ishai never acknowledges the cameras. Only the hosts (Zohar, Oren) talk to the audience.

## 1b. The world map — no teleportation
Every exit leads to a specific entry in a specific place. Current map (`MAP` in `index.html`, `NEXT` in the worker):

| From | Exit (x) | Leads to | Entry there |
|---|---|---|---|
| Apartment | front door (135) | Corridor | apt 4 door (40) |
| Corridor | apt 4 door (40) | Apartment | front door (135) |
| Corridor | stairs (178) | Street | building entrance (26) |
| Street | building entrance (26) | Corridor | stairs (178) |
| Street | left edge | Park | right edge |
| Street | right edge | Shops (Herzl St. east) | left edge |
| Shops | left edge | Street | right edge |
| Shops | right edge (the café corner) | Café | entrance (left) |
| Street | bus stop (128) | Market (Shuk Shalom) | its own bus stop (128) — by bus (day) or taxi (night / rain) |
| Market | bus stop (128) | Street | bus stop (128) |
| Market | Everything Else door (4, left) | Store | door (4, left) |
| Store | door (4) | Market | Everything Else door (4) |
| Street | bus stop (128) | Off camera | — by bus (day) or taxi (night / rain) |
| Street, Market | bus stop (128) | Bus (CAM-12) or Taxi (CAM-13) | seated, after the camera switch |
| Bus, Taxi | a stop | Street, Market (bus stop 128) or Off camera | the vehicle pulls in and he steps off |
| Street | Herzl Gym door (64, blue building) | Gym | door (4, left) |
| Gym | door (4) | Street | Herzl Gym door (64) |
| Street | The Black Candle door (101, next to the bench) | Bar | door (4, left) |
| Bar | door (4) | Street | The Black Candle door (101) |
| Apartment | bathroom door (48) | Bathroom | door (9) |
| Bathroom | door (9) | Apartment | bathroom door (48) |
| Park | right edge | Street | left edge |
| Café | entrance (left) | Shops | right edge |

- Every link is the same door both ways: leaving X by door A into Y always arrives at Y's door B, and leaving Y by door B always arrives back at X's door A (`MAP[x][y].exit === MAP[x][y].entry`).
- A friend going somewhere with Ishai walks right behind him through the same doors, place after place, and arrives through the door he used (never from a random edge).
- If the story jumps several places at once, the page routes Ishai through every place in between (shortest path on the map).
- Far places are reached by bus or taxi from the street bus stop: the vehicle pulls in, stops, he gets on/off, it drives away.
- **Adding a place** (e.g. a restaurant): decide where it physically is, add its exits/entries to `MAP` (page) and `NEXT` + `PLACES` (worker) on both sides, draw its doors/edges, and say how you get there (walk from a neighbouring scene, or bus/taxi from a stop). A place without a connection must not ship.

## 1. Every scene has clear exit points
- Each camera location defines where people enter and leave, and they are visible in the art:
  - Apartment: front door (people), bathroom door (Ishai only).
  - Bathroom (page-only room, CAM-06): its door. The story still says apartment + bathroom/showering; the page moves him there.
    Privacy: the toilet is inside a stall (only his shoes show under it, occupied light red), the shower is behind frosted glass (only a soft blur). Never show more.
  - Corridor: Ishai's door (apt 4), Mrs. Levi's door (apt 5), the stairs/exit, the elevator.
  - Street: Ishai's building entrance, left edge, right edge.
  - Park: right edge (path to the street), left edge (further into the park).
  - Shops (CAM-09, Herzl St. east): left edge (back to Ishai's block), right edge (the café corner). Herzl Hardware, Tahini Tower Savings Bank + ATM, a flower shop, a pedestrian crossing with lights, Kfar Kofi billboard.
  - Café: the entrance on the left.
  - Bus (CAM-12, line 88) and Taxi (CAM-13): no doors of their own; he boards at a stop on the street camera and the switch finds him seated. Every ride between places shows here for `RIDE_MS` (75 s), or longer when the story puts a moment on board. Taxi at night, in the rain and on Shabbat. No `ERRANDS`: he stays in his seat. The city outside (`cityDrive()`) is currently the only route; it runs on the real clock with a red light every 52 s, and handles any hour and weather.
  - Market (CAM-10, Shuk Shalom): the bus stop (128) and the Everything Else door (left). Food stalls with striped awnings, vendors, a banner and string lights; open 07:00-19:00, Fri until 14:00, closed Shabbat.
  - Store (CAM-11, Everything Else): its door on the left. A wall of TVs, shelves of home goods, a clothes rack, a cashier; everything except food; open 09:00-21:00, Fri until 14:00, closed Shabbat.
  - Gym (CAM-07, Herzl Gym): the glass door on the left. Treadmills under a wall TV (Channel 9, sound on); "exercising" = on the treadmill. Open 06:00-23:00.
  - Bar (CAM-08, The Black Candle): the heavy door on the left. Dark rock bar: black brick, red neon, candles, fictional band posters (Grave Tahini, Iron Falafel). Opens 17:00, closes 02:00.
- A new scene must define its exit points in `MAP` (Ishai's routes) and `exitX()` (companions) before it ships.

## 2. Nobody appears or disappears in place
- Main characters always **walk in** from an exit point to their spot, and **walk out** to an exit point when they leave — even from a seat (table, bench, counter). Use the companion controller (`wantComp` / `compUpdate`); never draw a companion directly at their spot without it.
- Ishai walks to an exit before every camera switch, and walks in from the matching entry after it.
- Hiding is only allowed behind something real: the bathroom door, the camera switch, or off-camera locations ("CAM-??").
- Background people who sit or stand still may **fade** in/out (never blink); walking bystanders enter and leave off the screen edges.

## 3. Nothing floats
- Every prop sits on a surface or hangs from something visible (signs on wires/brackets, posters on walls, cans on counters).
- People stand on the floor line of their scene (`walkY`), sit on actual seats, and never overlap water, walls or furniture tops.
- Signs and lights may flicker, but never vanish completely.

## 4. Focus: main characters vs. bystanders
- Ishai and the cast: full saturation, thin dark outline (`outlined()`), speech bubbles.
- Bystanders: muted palette (`muted:true`), slightly faded (alpha 0.6–0.85), no outline, no dialogue, never block the main action.
- New cast members are drawn only from the look menu (hair, colors, extras) so they stay consistent forever.

## 5. Same picture for every viewer
- Animations, bystanders, traffic and sponsored camera switches are driven by the real clock (`Date.now()`), not by page load.
- A viewer who tunes in mid-moment joins it where it is (typing, conversations), not from the start.

## 6. Pixel style
- Canvas 192×108 logical pixels, scaled up with `image-rendering: pixelated`. Figures are 10×22 px.
- Use `R(x,y,w,h,color)`; no anti-aliasing, gradients or images.
- Lighting follows the real Tel Aviv clock and weather: night darkening, lit windows, streetlights, rain, clouds.
- Respect the darkness overlay: anything drawn after it must look right at night too.

## 7. Brands and placement
- Only fictional brands, with their own visual identity (Cooola = purple + lime, blocky letters, lightning bolt). Never imitate a real brand's colors/logo.
- Product placement must sit naturally in the world (billboards, kiosk banners, buses, vending machines, cans on counters, neon in windows).

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

## 10. Fidgets and idle life
- Seated activities (working, gaming, reading, watching) never pop up for an errand: small breaks happen in the seat (`seatFid()`: a yawning stretch, a sip, rubbing eyes). Errands are for standing/idle moments only.
- Standing or listening characters fidget every few seconds (`fid()`): foot tap, stomp, weight shift, stretch, look around, scratch head, turn around, cross arms, check phone. Talking adds gestures, nods and shrugs. Seated people nod, gesture and look around.
- Standing friends take a couple of steps and come back now and then (`wander()`), never while it is their turn to speak.
- Ishai does small routines inside long moments (`ERRANDS`): every place has its own list, each with a weight alone and a weight with company (e.g. alone he grabs a drink; with a guest he brings drinks for both or shows something on his phone; the guest waits in place). `ERR_CHANCE` sets how often, alone vs. with company. The same routine never runs twice in a row, and a fridge trip before a drink happens at most every 6 minutes.
- New places must get their own `ERRANDS` entry. All of it runs on the real clock so every viewer sees the same thing. Portraits and dreams stay still.
