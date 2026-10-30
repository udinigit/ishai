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
| Street | right edge | Café | entrance (left) |
| Street | bus stop (128) | Off camera | — by bus (day) or taxi (night / rain) |
| Apartment | bathroom door (48) | Bathroom | door (9) |
| Bathroom | door (9) | Apartment | bathroom door (48) |
| Park | right edge | Street | left edge |
| Café | entrance (left) | Street | right edge |

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
  - Café: the entrance on the left.
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
