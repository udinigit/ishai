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
1. **Dana and the basil cups** — Dana, the deadpan barista, draws basil leaves on Ishai's cups. Slow, shy romance. Stages: he notices → he asks → a real conversation → she visits Moshe → first date. *Now: stage 3 → 4; Thu Nov 5 she agreed to see Moshe (played as planned); Sat Nov 7 after havdalah she visits Moshe, he asks why she draws the basil, she puts her number in his phone (wants a Moshe photo in a week). Next: first date.*
2. **Saving Moshe** — Moshe the basil is wilting. Ends with Moshe thriving. *Now: Sat Nov 7 Dana's diagnosis: sunburn from the afternoon window and pinching the wrong leaves. Moved to morning light; pinch the tops.*
3. **The chickpea** — Gadi's client wants the chickpea logo friendlier by Sunday morning; Ishai finally brings up his fee. Follows the earlier 'bigger but smaller' client, last seen when v7 was sent. Fri Nov 6: two pages of friendliness notes. Sat Nov 7 after havdalah: Gadi texts for 9am Sunday and Ishai sends a fee: 4,500. Next: Gadi's answer on Sunday.
4. **Noa** — best friend, keeps telling him to raise his prices. Missed the cafe and the bar on Nov 4; apologises by phone and comes for Shabbat dinner Fri Nov 6 (planned, not verified). Will want a report on Dana.
5. **Falafel the dog** — adopted Nov 1, walks with Ishai and sleeps by the desk. The hosts adore him; Oren worries about Moshe.
6. **The wider circle** — Tomer (Sat Nov 7: cancelled the rain walk, brings his mother's meatballs; fixes the flickering hallway light Sunday evening Nov 8), Kobi and his lottery system, Mr. Zelig, Mrs. Levi, Lior, the gym regulars. Use the whole cast over the week.
7. **Improv on Thursdays** — Noa paid for four beginners' lessons with Yael at the back of The Black Candle. He over-apologizes and can't hold a price; "yes, and" slowly helps him say what he wants, including to Gadi. Keep it a real class: he is awkward, never a polished comic. *Now: lesson 1 on Thu Nov 5; homework: once this week, don't say sorry to someone who should be saying it to you.*
Done: the TV (Nov 1) and Mrs. Levi's radio (Nov 3) both arrived.

## Already scheduled — plan around these, do not overlap or move them
- Every Sunday, Tuesday and Wednesday, 11:00 — Ishai's history lecture at Tel Herzl University. The engine schedules it by itself: write NO beat for it, and keep him free from 10:25 to 11:50.
- Sun Nov 8, evening — Tomer comes with a ladder to fix the flickering hallway light (promised Sat Nov 7).
- Mon Nov 9 — Sigd (Ethiopian Jewish holiday); a mention at most.
- About Sat Nov 14 — Ishai texts Dana a photo of Moshe (she asked for one in a week).
- Every Thursday, 17:00 — improv class at The Black Candle (not during a holiday). Plan one beat: `startAt` 16:42, `sceneAt` 16:58 (the first moment then plays at 16:59 and the class starts at 17:00), `deadlineAt` 17:20, `location` bar, `forceWith` yael, and 5 `preview.moments` with Yael (about 30 minutes): the first 4 in the bar with action `improv` (Ishai and Yael stand on the cleared floor, the class watches from a half circle of chairs), the last one on the street with action `talking`, so the room is reset out of sight. Yael is the only other speaker. Keep 15:45-17:45 free of other beats.

## Day 2 — Saturday, Oct 31 (planned by Claude, 07:20)
**Previously:** Friday afternoon Ishai went to Avi's kiosk for falafel and walked to the park with Avi, who talked about Shabbat and "falafel without tahini". The planned Friday beats (cafe with Dana, Noa's invite, Mrs. Levi's challah, candles, dinner with Noa) never fired, so they're cancelled. Saturday dawn: Ishai is up early, digging through an empty fridge.
**Today:** Slow Shabbat — Moshe pep talk → the stray at Avi's kiosk → Dana in the park (he finally gets the basil cups) → havdalah → the client's "bigger but smaller" email.

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
