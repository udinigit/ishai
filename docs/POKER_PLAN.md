# Poker night: plan

Approved by the director on 2026-11-08. Built in v164 (see "Poker night" in `CLAUDE.md`); not yet: the two AI calls (fresh lines the day before, memories after; memories are written without AI for now), Falafel under the table.

## The idea
Every second Monday, Ishai plays poker downstairs in Boaz's flat (apartment 2, first floor) with Boaz and three of Boaz's people: five players, small money, for fun. Viewers see Ishai's two cards the whole time; nobody in the story does. It is **a script, not AI**: the whole game is simulated from a seed before it starts and the page plays it by the clock. AI writes only a few fresh lines the day before and the memories afterwards (2 calls a night).

Story reason: Ishai reads cards well but cannot bet his good hands and says sorry when he wins. It is the same problem as his fee with Gadi and his improv homework ("don't say sorry"). The night he finally raises with a big hand is a story beat. Ronit is the one who spots his tell.

## Where: apartment 2 (new scenery)
**The building:** street entrance (ground) → first floor (apts 1-3) → second floor (Ishai apt 4, Mrs. Levi apt 5) → apt 7 upstairs.

**First-floor landing (`hall1`, CAM-21, `1ST FLOOR HALL`), page only, a walk-through like Herzl St. west.**
- Same stairwell art as the corridor: a different floor number on the wall, the apt 1, 2 and 3 doors, the stair-light timer switch (Boaz complains about it in the chat), a bicycle chained to the rail, and a doormat at apt 2.
- Exits: stairs up (left), which lead to the corridor stairs (178), and stairs down (right), which lead to the street building entrance (26).
- Apt 2's door is at x 96.
- **Only trips to or from apt 2 pass through it.** Corridor ↔ street stays a direct camera switch, as now. The camera simply doesn't cover the landing on ordinary trips, so nothing else changes.

**Boaz's flat (`apt2`, CAM-22, `APARTMENT 2`).** The door is on the left (x 4). It's an older family flat, nothing like Ishai's:
- **Floor and walls:** patterned old floor tiles (balatot) and a back wall in faded green paint.
- **Against the back wall:**
  - a glass-front cabinet with wedding china and a framed photo of the kids;
  - a wall clock showing the real time;
  - a framed photo of a line 88 bus with Boaz waving from the driver's seat, and next to it the bus company's wall calendar;
  - a small fish tank with bubbles, on the cabinet.
- **On the right:**
  - a sofa with a crocheted throw;
  - an old TV on a stand, playing 8bitTV sports with the sound off (its screen may show here; the faces-away rule is only for Ishai's own TV);
  - the kitchen hatch with snack bowls;
  - the balcony door with two pots.
- **The game table**, in front, across the frame:
  - a long dining table with a green felt cloth over it on game nights, and a lamp with a shade hanging low on its cord over the middle;
  - five chairs;
  - on the felt: chip stacks in 4 colours, the deck, the dealer button, a bowl of sunflower seeds and a bowl for the shells, unlabelled brown beer bottles and Cooola cans.
- **Lighting:** after dark the room dims and the lamp throws a pool of light on the felt, the classic card-room look. Draw it under the darkness overlay so it reads at night.
- **Seats** (rule: seated people face front, `seated:true`):
  - three behind the table facing the camera, **Ishai in the middle** so he is always in view;
  - one at each short end, turned three quarters inward.
  - Order from the left: Yossi (end), Ronit, Ishai, Boaz, Moti (end).
- **Other needs:** `ERRANDS` (Boaz to the kitchen hatch, someone to the toilet off camera through a door on the right, refilling the seeds), `FILL` and `OVERHEARD` entries, and `exitX()` for the door.
- **Falafel** comes along and lies under the table; at the break he begs by Moti, who feeds him a seed.

**Wiring:**
- **Worker:** `PLACES.apt2` = "Boaz's flat, apartment 2 on the first floor of Ishai's building…", `LOCATIONS.apt2` = `idle, talking, eating, drinking, phoning, poker`, and `NEXT`: `apt2: ["corridor","street"]` plus `apt2` added to both.
- **Page:** `MAP` links corridor ↔ hall1 ↔ street and hall1 ↔ apt2. `route()` takes hall1 only on the way to and from apt2.
- `poker` is a planned-only action like `improv` and `lecture`.

## The players (new cast)
They are drawn only from the look menu. Each gets an `INK` colour that no one else uses; check the hex codes against `INK` when building. Boaz and Moti are the building chat's existing "Apt 2" and "Committee", so the chat should start naming them.

| | Boaz Peretz (host) | Ronit Azulay | Moti Shalev | Yossi "Lucky" Ben-Ami |
|---|---|---|---|---|
| id | `boaz` | `ronit` | `moti` | `yossi` |
| Who | 47, apt 2, first floor. Drives the line 88 bus for a living (he may turn up as the driver on CAM-12). Divorced; his two teenagers stay with him some weekends. Has hosted "Poker Monday" for years. He is "Apt 2" in the building chat. | 47, Boaz's friend since high school: they sat together in 11th grade, she copied his chemistry and he copied her maths. Teaches maths at a high school. | 68, retired surveyor, apt 1, head of the building committee ("Committee" in the chat). | 31, Boaz's colleague at the bus depot, a mechanic. |
| Personality | Dry, orderly, keeps the bank, counts the chips twice, house rules on a card taped to the cabinet. Kind under the deadpan; invited Ishai because "we're one short and you're quiet". | Sharp, warm, teasing, reads everyone; a teacher who can't stop marking. | Chatty, generous, slightly deaf, runs committee business at the table. | Loud, superstitious, fast, big-hearted, terrible with money. |
| Speech | Few words and bus lines: "Last stop.", "Exact change.", "Doors closing." Calls Ishai "Upstairs". | Full names, classroom voice: "Wrong answer, Ishai Cohen. Sit down." Says out loud what she sees. | Long sentences that start in 1987 and end at the elevator vote; calls everyone "neighbour". | Numbers and omens: "I feel it.", "Suited means it's meant." Calls Ishai "professor". |
| Poker style | **The rock** (tight-passive): plays about 18% of hands, almost never bluffs, calls instead of raising, never tilts. | **The shark** (tight-aggressive): the best player. Bluffs at the right time and finds Ishai's tell (he says sorry before he bets a strong hand). | **The calling station** (loose-passive): plays about 60% of hands because "I paid for the cards", almost never raises, loses slowly and happily. | **The maniac** (loose-aggressive): raises any two suited cards, has a ritual (taps the deck twice, nobody touches his chips), tilts after a bad beat, usually rebuys. |
| Look | hair short, gray; skin tan; shirt navy; pants gray; mustache | hair long, black; skin brown; shirt red; pants black; glasses, earring | hair bald, white; skin fair; shirt white; pants brown; glasses, scarf | hair cap (his lucky cap), black; skin dark; shirt orange; pants black; beard |
| INK (suggested) | olive `#7d8f2a` | coral `#ff6f61` | dusty rose `#c47b9a` | lime `#9acd32` |
| Memory at start | "Invited Ishai from upstairs to fill the empty seat. Knows him from the stairs and from the bus." | "Boaz says the new one is quiet. Quiet ones bluff or apologise." | "Ishai still owes the committee for the stair light. Seems a good boy." | "Never met Ishai. Lucky cap is washed and ready." |

**Ishai at the table: the apologiser.**
- He reads hands well and folds the right hands.
- With a strong hand he checks or calls when he should raise. When he wins he says sorry, and he says sorry right before he bets big (the tell).
- Over the season his aggression slowly rises, a little each night he plays well. Ronit's tell-spotting makes him work on it.

## The game
- **Rules and money:**
  - Texas Hold'em, 50 ₪ buy-in (500 chips), blinds 5/10 chips (0.5/1 ₪), one rebuy of 50 ₪, no blind raises.
  - From 20:00 to about 22:30, with a 5-minute snack break at 21:15. It ends at the time limit or when only two players are left, and everyone cashes out.
- **Arrival:**
  - Boaz is home.
  - Moti comes down at 19:50.
  - Ishai and Falafel come down at 19:55.
  - Ronit buzzes at 20:00.
  - Yossi is late (20:08, "the bus broke down", and he is the mechanic).
  - Everyone walks in through the door (rule 2).
- **Pizza:** every poker night they order pizza through ateBite. Boaz orders on his phone at about 19:55, as people arrive (who wants what is a running joke: Moti wants olives, Yossi wants "anything, it's lucky", Ronit wants it on time). At about 20:40, between hands, the orange-helmeted courier rings at apt 2, steps in with the boxes and leaves (the existing `courierUpdate()`, with `delivery: true` on that moment, here at apt 2's door). The boxes then sit open on the kitchen hatch and slices appear on the table by the chips; Falafel gets interested. Lines from the pools: the order, the doorbell, arguing over the last slice, grease on the cards. The cost is split from the pot talk ("pizza money comes out before cash-out").
- **Leaving:** they go one by one through the door in the reverse logic: Yossi first if he is broke, Moti last, still talking.

### Engine (worker, no AI)
- **`pokerSim(seed, players)`** plays the whole night, using the seed `poker-<date>` with a fixed generator (mulberry32). It writes:
  - every deal, every action with its "thinking" time (2-6 s, longer for big decisions and for Moti), the flop, turn and river, showdowns, pot pushes, rebuys and the break;
  - for each hand, the start time of each street.
- It's about 45-60 hands, the number set by the clock. One KV write (`poker:<date>`, roughly 100 KB), served by `/api/poker?date=`.
- **Hand evaluator:** a small 7-card ranker, about 60 lines, kept in the worker.
- **Bots:** each player is a set of numbers plus a few quirks.
  - The numbers:
    - **hands played:** how many starting hands they play;
    - **raise first:** how often they raise instead of just calling;
    - **aggression:** how much they bet when they have something;
    - **bluffing:** how often they bet with nothing;
    - **calling down:** how stubbornly they call to the end;
    - **tilt:** how much a big loss makes them play wilder;
    - **skill:** how much noise there is in how they judge a hand.
  - **How they decide:**
    - Before the flop they score their two cards (Chen formula).
    - After the flop they estimate their chances by playing out 200 random endings, then compare that with the price of calling.
  - **The quirks:**
    - Yossi plays any suited hand;
    - Moti calls almost any bet up to a third of the pot;
    - Ronit adjusts to the others' habits (after enough hands she calls Yossi lighter and bluffs Moti less);
    - Ishai under-bets his strong hands.
- **Ishai's win %** on screen is worked out against random hands, not against the others' real cards, so the overlay never gives anything away.
- **Every 6-minute tick** during the game, the worker adds a no-AI moment: location `apt2`, action `poker`, with `party: ["boaz","ronit","moti","yossi"]`. Its text and a host line sum up that window's hands ("Ishai folded two queens to Ronit's raise and said sorry anyway."), so summaries, highlights and dreams know what happened.
- **Scheduling:**
  - Every second Monday at 19:40 a goal with `sceneAt` is created (first night: Monday 23 Nov; skip holidays). It goes under "Already scheduled" in `season.md`, and `pollFree()` and home visits keep clear of it.
  - A planned beat 2-4 days before has Boaz invite him on the stairs (first time) or text a reminder in the building chat (after that).

### Talk (script, pools)
- **Line pools in the worker**, per player, per trigger:
  - **during hands:** deal, fold, check, bet or raise, all-in, a big pot won, a big pot lost, a bad beat, showing a bluff, a rebuy;
  - **around them:** the break, small talk between hands (the building, the bus depot, school, the lottery, Ishai's dog).
  - About 15-25 lines each, roughly 500 in all.
- **Picking lines:**
  - Chosen by the seed.
  - At most one line every 25-30 s, never repeated in a night.
  - The others answer each other in short back-and-forths (two- or three-line threads, written as pairs).
- **Ishai's pool:** the apologies, quiet jokes, Falafel. Lines are tied to his real cards only where nobody else can tell ("Fold. Yeah. Fold.").
- **The hosts** (from the booth, not voiced over the table) know his cards: "Two kings, and he just said sorry." At most one host line every 2 minutes, keyed to his hand and the pot.
- **AI, 2 calls a night:**
  1. **The day before**, one story-writer call writes 6-10 fresh lines per player from their memories, the season's arcs and the news of the week. The lines are checked (length, no banned words, real names only from the cast) and added to the pools for that night.
  2. **After the game**, one call writes the memory update and mood for each player, and a summary line (who won, who rebought, Ishai's result in ₪).

### Page
- **Table guests:** a new controller that seats up to 5 named people at once (today the page has one `comp`). Each walks in from the door to a seat and later back out, with their own bubble, colour and voice. It lives next to `compUpdate()` and is reused by the arena.
- **TV overlay** (bottom of the picture, pixel style):
  - Ishai's two cards drawn large (pixel cards with 5×5 suits), the board, the pot;
  - each player's name tag in their colour, with stack and last action ("RAISE 40", "FOLD");
  - the dealer button, and Ishai's win %.
  - Other players' cards appear over their seats only at showdown.
  - It also shows in pop-out.
- **Everything is worked out from `NOW()`:** the state at any moment is the cues up to now, folded in order, so late joiners and replays land exactly. No randomness in the page.
- **Sounds:** a riffle shuffle, card flicks, chip clicks, the seeds cracking, Boaz's TV very low. No radio, no DJ, and the host fill and overheard lines are paused.
- **Sandbox:** a "Poker night" button with a hand number and fast-forward, plus `?loc=apt2&pose=poker&hand=12` and `?loc=hall1`. The builder gets `apt2`, `hall1` and the poker props.

## Order of work
1. `hall1` + `apt2` scenery, map links, the new cast in `SEED_CAST`, `INK` and `REG` (not regulars, but they need looks and voices).
2. The table-guests controller (multi-seat), tested in the sandbox.
3. `pokerSim()` + evaluator + bots, checked offline: 1,000 simulated nights, with expected results per style (Ronit wins most, Moti loses most, Yossi swings).
4. Cue timeline + `/api/poker` + overlay + sounds.
5. Line pools, host lines, the 2 AI calls, scheduling, invitation beat, `season.md`.
6. Build, test in a real browser (day/night, phone width, join mid-hand, pop-out), bump `VERSION`, update `CLAUDE.md`.
