# Watching Ishai — Season 1

The daily planner reads this file and `plan.json`, then plans the next 24 hours.
You (the director) can edit anything here; changes go live with the next deploy.

## Rules of the show
- A reality show of a real life, in the spirit of "The Truman Show" — not a sitcom, not fully scripted. Ishai and the people around him behave like real people; Ishai never knows he is filmed.
- Beats are gentle nudges of real life (an errand, a visit, a call, a decision), never staged gags or impossible coincidences. Humor comes from life itself and from the hosts.
- Everything follows real-world logic: travel takes time and uses the map (walk / bus / taxi), people have their own schedules, weather and time of day matter.
- Real weather and the Jewish calendar are real.
- Ishai celebrates Shabbat at home in a warm, traditional-but-relaxed way.
- About a third of each day stays unplanned so the live AI can improvise.
- Write a `texture` pack in `plan.json` every day: 50-100 small lines about THAT day that fill the quiet, with no live AI. The page uses it only on its `date`. All lines are short (under 110 characters), match what is planned or was just remembered, never give away a coming twist, and repeat nothing from earlier days.
  ```json
  "texture": {
    "date": "2026-11-07",
    "hosts": ["20-30 lines for Zohar or Oren, either voice"],
    "radio": ["10-15 lines of DJ patter; no real brands"],
    "mutter": { "zelig": ["3-5 lines"], "michal": [], "sivan": [], "lior": [], "kobi": [] },
    "overheard": { "street": ["3-5 half sentences starting with ...; passers-by, never plot"], "market": [], "park": [], "cafe": [] },
    "chat": [{ "at": "09:40", "who": "Mrs. Levi", "say": "6-10 messages in the building group chat through the day; who is Mrs. Levi, Committee or Apt 1/2/7. None on Shabbat." }]
  }
  ```
- Every planned scene with a person ends with `"update": {"memory": "what they now remember about Ishai, max 25 words, keep what still matters", "mood": -1, 0 or 1}` on its last moment with them. Without it, the scene changes nothing in their memory.
- 3-6 key beats per day, each with a time window. New props, places or animals need art first ("art" field).

## Arcs
1. **Dana and the basil cups** — Dana, the deadpan barista, draws basil leaves on Ishai's cups. Slow, shy romance. Stages: he notices → he asks → a real conversation → she visits Moshe → first date. *Now: stage 4. Sat Nov 7 she came to see Moshe, answered why she draws the basil (he once told his cup to have a nice day), put her number in his phone (wants a Moshe photo in a week) and later brought a spare sprout. Sun Nov 8: two leaves on his cup and 'drive the presentation home'; that night he took a photo of Moshe and the sprout and did NOT send it. Mon Nov 9 she drew a running dog on his foam. Tue Nov 10: a winking basil leaf on the house; she reminds him of the photo (he has two reminders). Next: the photo about Sat Nov 14, then a first date.*
2. **Saving Moshe** — Moshe the basil is wilting. Ends with Moshe thriving. *Now: stage 2/3. Sunburn diagnosed Sat Nov 7; Moshe lives on the kitchen counter by the sink now, tops pinched, recovering, with Dana's small unnamed sprout ('Moshe's roommate') beside him; a fresh leaf Mon Nov 9.*
3. **The chickpea** — Gadi's client wants the chickpea logo friendlier by Sunday morning; Ishai finally brings up his fee. Follows the earlier 'bigger but smaller' client. Sat Nov 7: Gadi accepted 4,500 (grumbling about the font). Sun Nov 8: the client loves it; Ishai sent the invoice at thirty days (Gadi wanted sixty). Mon Nov 9 10:00: the video presentation; the client (Ruti) asks for a winking chickpea for the app and Ishai sells it with 'yes, and' for 1,000 extra. Main logo files sent Mon afternoon. Tue Nov 10: the left eye, same price ('a blink is another job'), Mr. Zelig's 'make it slower', and a rough preview Gadi 'didn't like' (= good). Next: the final wink files Wed Nov 11 night before the concert, then getting paid.
4. **Noa** — best friend, keeps telling him to raise his prices. Missed the cafe and the bar on Nov 4, apologised, came to Shabbat dinner Fri Nov 6. Sun Nov 8 evening she came over, got the Dana report and coached him for Monday (blue shirt). Mon Nov 9 she texted and phoned all day for the result and said she'll celebrate with him at the Pump House on Wednesday.
5. **Falafel the dog** — adopted Nov 1, walks with Ishai and sleeps by the desk. The hosts adore him; Oren worries about Moshe.
6. **The wider circle** — Tomer (Sat Nov 7 brought his mother's meatballs; Sun Nov 8 fixes the hallway light, Ishai owes him a beer Thursday after improv), Kobi and his lottery system, Mr. Zelig, Mrs. Levi, Lior (Sun Nov 8: spills Ishai's coffee, wants a book cover for 2,000 'when it's finished'), the gym regulars (Mon Nov 9: first real talk with Sivan on the next treadmill; Michal invites him to her Friday 7:00 run club, which she never attends herself). Mon Nov 9: Tomer borrowed the drill, Avi brought leftover falafel at night, Hagit at the ticket window. Tue Nov 10: Lior is asked for half up front; Mr. Zelig: 'a wink is a secret between two people'; Moti collects the committee fees, agrees the committee buys Tomer one beer (receipt!) and mentions Boaz calls Ishai 'the quiet one'. Use the whole cast over the week.
7. **Improv on Thursdays** — Noa paid for four beginners' lessons with Yael at the back of The Black Candle. He over-apologizes and can't hold a price; "yes, and" slowly helps him say what he wants, including to Gadi. Keep it a real class: he is awkward, never a polished comic. *Now: lesson 1 on Thu Nov 5; homework (don't say sorry when it isn't yours) done Sun Nov 8 with Lior; he also held thirty days with Gadi. Mon Nov 9 'yes, and' works for real on the client call. Tue Nov 10 it leaks everywhere (Gadi, Lior, Moti). Next: lesson 2, Thu Nov 12.*
Done: the TV (Nov 1) and Mrs. Levi's radio (Nov 3) both arrived.

## Already scheduled — plan around these, do not overlap or move them
- Every second Monday, 20:00 — poker night at Boaz's, apartment 2 on the first floor (first one: Mon Nov 23). The engine schedules and plays it by itself: write NO beat for it and keep him free from 19:25 to 22:45. The players: Boaz (Apt 2, the 88 bus driver, host), Ronit (Boaz's friend since high school, a maths teacher), Moti (Apt 1, head of the building committee) and Yossi (a mechanic at the bus depot, lucky cap). Before the FIRST night write one beat, on Nov 19, 20 or 21: Boaz meets Ishai on the stairs or the street and invites him ("we're one short, and you're quiet"); Ishai says yes. After each night Ishai remembers how it went (it shows up in the story prompt), and he may bring it up.
- Every Wednesday, 20:00 — a night at the Pump House, the old pump hall across the park that Hagit runs (first one: Wed Nov 11 — a concert: Penguins can Fly, the director's band; Tomer saw the poster Mon Nov 9 and said 'ask me Wednesday'). The engine schedules it by itself (a gallery night unless the director adds an event): write NO beat for it, keep him free from 19:05 to 21:10, and never put a beat inside the hall (`arena`). Ishai goes every week, sometimes alone, sometimes with Noa or Tomer (the engine picks). Before it you may let him notice the poster board, mention it, or invite someone; after it, people may talk about it.
- Viewers' polls: goals named `poll-…` are what viewers voted for (small things other people do to Ishai). Keep them: do not cancel, move or overlap them, and do not write beats about votes.
- Every Sunday, Tuesday and Wednesday, 11:00 — Ishai's history lecture at Tel Herzl University. The engine schedules it by itself: write NO beat for it, and keep him free from 10:25 to 11:50.
- Wed Nov 11 — the winking-chickpea files are due to Gadi that night (before or after the Pump House concert; Gadi said Wednesday night, Ishai offered Thursday morning).
- Thu Nov 12 — after improv, Ishai buys Tomer a beer at The Black Candle (promised Sun Nov 8; the building committee pays for one, Moti wants a receipt Tomer signs).
- About Sat Nov 14 — Ishai texts Dana a photo of Moshe (she asked for one in a week).
- Every Thursday, 17:00 — improv class at The Black Candle (not during a holiday). Plan one beat: `startAt` 16:42, `sceneAt` 16:58 (the first moment then plays at 16:59 and the class starts at 17:00), `deadlineAt` 17:20, `location` bar, `forceWith` yael, and 5 `preview.moments` with Yael (about 30 minutes): the first 4 in the bar with action `improv` (Ishai and Yael stand on the cleared floor, the class watches from a half circle of chairs), the last one on the street with action `talking`, so the room is reset out of sight. Yael is the only other speaker. Keep 15:45-17:45 free of other beats.

## Day 3 — Sunday, Nov 1 (planned by Claude, 05:20; updated 07:20 with live data)
**Previously:** Noa left around midnight; Ishai slept badly, partly on the bathroom floor. Shabbat: Mrs. Levi scolded him in the corridor about noise, he gave Moshe a pep talk while watering him, and he went for falafel at Avi's kiosk, where Avi mentioned a stray dog that's been hanging around. In the park Dana told him to stop overwatering Moshe. After havdalah he worked on the "bigger but smaller" logo, then called Noa and they agreed to meet Sunday. Several of yesterday's beats were forced by the engine.
**Today:** Cafe with Dana (he asks how she knows plants) → TV from Avi's cousin → adopting Falafel → Noa meets Falafel → logo v7 with Falafel on his feet.

## Day 7 — Thursday, Nov 5 (planned by Claude, 07:20; no plans were written for Nov 2-4)
**Previously:** Wednesday Ishai worked on Gadi's chickpea logo and a bakery logo between walks with Falafel. Noa promised noon at Cafe Nahat but never came; he got ice water from Dana instead. Noa then dropped by the apartment with pastries and bourekas and made him promise the bar at nine, but at The Black Candle he ended up with a tipsy Kobi. He also bussed to Shuk Shalom and bought a red frying pan at Everything Else, then watched TV until midnight. /api/state returned stale data this run, so cast memories and weather came from the log.
**Today:** Gadi calls about the chickpea and the fee → real talk with Dana, who agrees to see Moshe → Mr. Zelig's accidental logo advice → Mrs. Levi's soup in the corridor → first improv lesson at 17:00 → the bar with Tomer, Noa's apology text, Kobi.

## Day 8 — Friday, Nov 6 (planned by Claude, 05:30; WITHOUT live data)
**Previously:** (Corrected Nov 7 from the log.) Every Thursday beat played as written: Gadi's fee call, Dana agreeing to see Moshe, Mr. Zelig, Mrs. Levi's soup, improv lesson 1 with Yael, and the bar with Tomer.
**Today:** Gadi's friendliness notes → Shabbat shopping at Shuk Shalom, Noa phones → Mrs. Levi's challah → candles → Shabbat dinner with Noa.

## Day 9 — Saturday, Nov 7 (planned by Claude, 05:30; corrected 08:45 with live data)
**Previously:** Friday Ishai finished the chickpea logo for Gadi, had falafel at Avi's, and met Noa at Cafe Nahat, where Dana drew a chickpea on his napkin. At Shuk Shalom Noa phoned and apologised for Wednesday; he took a taxi home in the rain, ordered borekas by ateBite, and Mrs. Levi gave him a challah. Gadi called: fee 'sorted Sunday morning', vectors by Sunday, a meeting Monday. He lit candles; Noa came late through the storm for Shabbat dinner and he called to check she got home. Saturday dawn brought a thunderstorm; Tomer called off their walk and Ishai and Falafel went out in the rain alone.
**Today:** Rainy Shabbat morning tidy → Mrs. Levi and the muddy paw prints (one question, make tea) → Tomer arrives soaked with meatballs, sees the hallway light → havdalah and the fee to Gadi (4,500) → Dana's house call for Moshe.

## Day 10 — Sunday, Nov 8 (planned by Claude, 05:30)
**Previously:** Rainy Shabbat: early walks with Falafel in the thunderstorm, Mrs. Levi and the muddy paw prints (a crust for Falafel anyway), Tomer on the street with his mother's meatballs, promising to fix the hallway light. After havdalah Ishai sent Gadi his fee and Gadi accepted 4,500, grumbling about the font. Dana came to see Moshe: sunburn, pinch the tops, and she explained the basil on his cups and put her number in his phone (a photo in a week). The live story then brought her back later with a spare sprout; Moshe now lives by the sink. He told Tomer everything by phone at 22:35.
**Today:** Gadi: the client loves it, Monday he presents, thirty-day invoice → history lecture (engine) → Cafe Nahat: two leaves from Dana, Lior spills his coffee (homework done) → free afternoon → Tomer fixes the hallway light, Mrs. Levi's rugelach → Noa gets the Dana report.

## Day 11 — Monday, Nov 9 (planned by Claude, 05:40)
**Previously:** Sunday Gadi called at 08:23 and Ishai sent the invoice at thirty days. He took a taxi through the rain to his first Strange But True lecture (the London beer flood and Boston's molasses), then Cafe Nahat: two basil leaves from Dana, Lior spilled his coffee and asked for a book cover; Dana wished him luck. Mrs. Levi brought lentil soup, Tomer fixed the hallway light (1990 tape) with Levi's rugelach, Noa came over to coach him for the presentation. At 21:05 he photographed Moshe and the sprout and didn't send it; he rehearsed the slides till 23:30.
**Today:** 10:00 the chickpea presentation (the client wants a wink, he says 'yes, and' and 1,000) → falafel at Avi's and Noa's text → the gym with Sivan and Michal → Tomer's call about the Penguins can Fly poster.

## Day 12 — Tuesday, Nov 10 (planned by Claude, 05:35)
**Previously:** Monday's beats all played. At 10:00 Ishai presented in the blue shirt and pyjama trousers; Ruti asked for a winking chickpea, he said 'yes, and', made it a separate job and settled at 1,000 (asked 1,200); Gadi said 'good job' first, files due Wednesday night. Falafel at Avi's (three exclamation marks to Noa), the main logo files sent after lunch, Tomer borrowed the drill. Walking Falafel he read the Pump House board and Hagit told him 'eight sharp'; Dana drew a running dog on his foam; Sivan raced him on the treadmill and Michal chatted by the mirror. Avi dropped off leftover falafel, Tomer phoned about the Penguins poster, and Noa said she'll celebrate with him Wednesday.
**Today:** Gadi asks which eye winks → history lecture (engine) → Cafe Nahat: Dana's winking leaf, Lior asked for half up front → Mr. Zelig: a wink is a secret → Moti and the committee fees (a beer for Tomer) → the first wink preview to Gadi.
