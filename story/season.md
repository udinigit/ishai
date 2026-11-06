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
- 3-6 key beats per day, each with a time window. New props, places or animals need art first ("art" field).

## Arcs
1. **Dana and the basil cups** — Dana, the deadpan barista, draws basil leaves on Ishai's cups. Slow, shy romance. Stages: he notices → he asks → a real conversation → she visits Moshe → first date. *Now: stage 3; planned Thu Nov 5: she agrees to see Moshe after Shabbat (not verified, see Day 8).*
2. **Saving Moshe** — Moshe the basil is wilting. Ends with Moshe thriving. *Now: watered less, but leaves are drying and Ishai plucks them. Dana's house call is Sat Nov 7, after havdalah.*
3. **The chickpea** — Gadi's client wants the chickpea logo friendlier by Sunday morning; Ishai finally brings up his fee. Follows the earlier 'bigger but smaller' client, last seen when v7 was sent. Fri Nov 6: two pages of friendliness notes, still no fee number.
4. **Noa** — best friend, keeps telling him to raise his prices. Missed the cafe and the bar on Nov 4; apologises by phone and comes for Shabbat dinner Fri Nov 6.
5. **Falafel the dog** — adopted Nov 1, walks with Ishai and sleeps by the desk. The hosts adore him; Oren worries about Moshe.
6. **The wider circle** — Tomer, Kobi and his lottery system, Mr. Zelig, Mrs. Levi, Lior, the gym regulars. Use the whole cast over the week.
7. **Improv on Thursdays** — Noa paid for four beginners' lessons with Yael at the back of The Black Candle. He over-apologizes and can't hold a price; "yes, and" slowly helps him say what he wants, including to Gadi. Keep it a real class: he is awkward, never a polished comic. *Now: lesson 1 on Thu Nov 5; homework: once this week, don't say sorry to someone who should be saying it to you.*
Done: the TV (Nov 1) and Mrs. Levi's radio (Nov 3) both arrived.

## Already scheduled — plan around these, do not overlap or move them
- Sat Nov 7, after havdalah — Dana comes to see Moshe (promised on screen Nov 5; plan it Saturday).
- Every Thursday, 17:00 — improv class at The Black Candle (not during a holiday). Plan one beat: `startAt` 16:42, `sceneAt` 16:58 (the first moment then plays at 16:59 and the class starts at 17:00), `deadlineAt` 17:20, `location` bar, `forceWith` yael, and 5 `preview.moments` with Yael (about 30 minutes): the first 4 in the bar with action `improv` (Ishai and Yael stand on the cleared floor, the class watches from a half circle of chairs), the last one on the street with action `talking`, so the room is reset out of sight. Yael is the only other speaker. Keep 15:45-17:45 free of other beats.

## Day 1 — Friday, Oct 30 (planned by Claude, 14:30)
Cafe with Dana (he notices the basil cup) → invites Noa for Shabbat → Mrs. Levi's challah in the hallway → candle lighting at home → Shabbat dinner with Noa.

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
**Previously:** Not known. The live log, state and health could not be reached this run, so what actually happened on Thu Nov 5 is unverified. Thursday's plan was Gadi's fee call, Dana agreeing to see Moshe, Mr. Zelig, Mrs. Levi, improv lesson 1 and the bar with Tomer. Any of those goals still open were cancelled so they don't fire today. Correct this section from the log on the next run.
**Today:** Gadi's friendliness notes → Shabbat shopping at Shuk Shalom, Noa phones → Mrs. Levi's challah → candles → Shabbat dinner with Noa.
