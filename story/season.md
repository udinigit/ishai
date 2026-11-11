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
- **Drama (from Nov 12).** This is a drama now, still real life. Follow the season plan below:
  - Every story has a `secret` the viewers learn before Ishai. Write it on the arc in `plan.json` with `knows` (who is in on it, a list of names), `revealOn` (YYYY-MM-DD, the planned day Ishai learns it; from that day the engine stops hiding it) and `told` (true once the viewers should hear it plainly from the hosts; until then the hosts only hint). Remove `secret` from an arc once it is out.
  - Let the viewers in first: texture-pack lines (hosts, building chat, overheard, Lior's and Kobi's mutters) and messages seen on screen. Ishai learns a secret only on its planned day, from someone who would really know, never by coincidence.
  - One real setback per main story each week. No day where everything goes his way.
  - Each day is an episode: one beat for a main story, one for a side story, and the last beat before bed leaves a question open. Write it as `"hook": {"date": "<today>", "text": "the open question, max 25 words"}` in `plan.json`, and write `"previously": {"date": "<today>", "text": "yesterday's open question as it really ended, max 30 words"}` for the morning recap ("Previously on Watching Ishai...").
  - Real feelings are allowed: sick, hurt, sad, angry, jealous, embarrassed. No deaths, no crime, no violence, at most one lucky coincidence a week, and every problem has an ordinary cause (money, rent, a breakup, a cold).
  - Ishai's own story is his: viewers' polls and surveys only steer the other characters.

## Season 1, Part 2: "Yes, and" (Thu Nov 12 - Wed Dec 9)
Four weeks that end on a Hanukkah night at the Pump House. Three main stories close by the finale; side stories may stay open.
- **Week 1, Nov 12-18: Cracks.** Plant the secrets. Hints only; life still looks good.
- **Week 2, Nov 19-25: Pressure.** Every story gets worse at once. The first date, the first poker night. Midpoint Wed Nov 25: Ishai learns Dana's secret the wrong way.
- **Week 3, Nov 26-Dec 2: Fallout.** He pulls back, gets hurt, gets angry, and learns Noa's secret. The low point.
- **Week 4, Dec 3-9: Yes, and.** Hanukkah starts Friday Dec 4 (first candle that evening, with Shabbat). He finally says what he wants: to Gadi, to Noa, to Dana. Finale Wed Dec 9.
- **Quiet week, Dec 10-16:** ordinary life, no new turns, no new secrets; side stories simmer. Season 2 starts Thu Dec 17.

### Main stories
**1. Dana: "Haifa".** Secret: Dana has been offered a job running a new cafe in Haifa from January and must answer by Mon Dec 7. Knows: Dana, Lior (he overheard her phone call). revealOn 2026-11-25. Stakes: will Ishai say what he wants before she decides?
- Sat Nov 14: he finally sends the Moshe photo; she replies fast and warm. Hosts hint she is "thinking about the future".
- Sat Nov 21, after Shabbat: the first date, a walk to the park and falafel at Avi's. Awkward: he apologises eleven times. She almost tells him and doesn't.
- Wed Nov 25 (MIDPOINT, before the Pump House): at the cafe Lior lets it slip ("so we'll need a new barista..."). Ishai goes to the Pump House that night hurt and quiet.
- Week 3: he stops going to Cafe Nahat and makes bad coffee at home. Sad, not angry. Noa tells him he is apologising by disappearing.
- Sun Dec 6: improv pays off. He tells her plainly he wants her to stay, and that he'd take the train to Haifa if she goes.
- Mon Dec 7 (off camera): Cafe Nahat's owner matches Haifa with a big raise and the shift manager's job.
- Finale, Wed Dec 9: she comes to the Penguins can Fly Hanukkah concert with her answer: she stays. She tells Ishai the raise only made it possible; he is why she wanted to.

**2. Gadi: "Unpaid".** Secret: Sababa Creative lost its biggest client in October; Gadi is paying every freelancer late and hides it behind "small change" cheer. Knows: Gadi. revealOn 2026-12-08 (Ishai suspects from week 3). Stakes: the 5,500 shekels (4,500 + 1,000 for the wink), invoice due Tue Dec 8, and whether Ishai can stand up for himself.
- Week 1: Gadi asks for "one more small thing" with no fee, "we'll settle it all together". Ishai does it.
- Week 2: Ruti, the client, calls Ishai directly: she loves his work and asks if he takes jobs without an agency. Loyalty versus money; he doesn't answer yet.
- Week 3: Gadi asks to move the payment to January. Ishai, short of money with taxis for his ankle, gets angry for the first time on the show.
- Tue Dec 8: Gadi pays half and admits the trouble. Ishai tells him openly he will take Ruti's app job himself, at his new price. Fair, not a betrayal.

**3. Noa: "Shir".** Secret: Noa's girlfriend of three years, Shir (Ishai knows her; a new character, phone only), moved out in October. Noa told nobody: it's why she is late, why she missed plans, why she pushes Ishai's love life so hard. Knows: Noa, Shir. revealOn 2026-11-28. Stakes: the friendship; he has been taking and never asked.
- Week 1: she cancels Thursday, then shows up late with too much energy. Viewers see Shir's name on her phone, unanswered.
- Week 2: she sleeps on his couch two nights "because of the plumbers". The viewers know there are no plumbers.
- Sat Nov 28 (after Shabbat): he finds out (a box of Shir's things in her car, or a call he overhears). She breaks down. For once, he takes care of her.
- Week 4: Tomer keeps showing up for her too. First candle at Ishai's on Fri Dec 4 with both of them. Noa is not fine yet, but not alone.

### Side stories (mostly off camera: Ishai catches pieces, the viewers put them together)
- **Ishai's ankle.** Tue Dec 1, morning walk: he twists it on the wet stairs. A week of limping: no gym, taxis he can't afford, Boaz carries his shopping. Walking again by the finale. (art: a limp and a bandaged ankle)
- **Mrs. Levi is sick.** Secret: she is lonely; her son Eli in Toronto hasn't visited in four years (she always says he's "busy"). Knows: Mrs. Levi, Moti. W1 a cough. W2 bronchitis: she stays home in her robe and Ishai feeds her street cats. W3 Ishai quietly messages Eli; Eli lands Mon Nov 30. W4 she lights the first candle with Eli. Will he stay? (open). (art: Mrs. Levi in a robe at her door; Eli joins the cast before Nov 30)
- **Avi's lease.** Secret: the landlord doubles the rent in January. Knows: Avi. W1 a tense phone call overheard at the kiosk. W2 Avi stops giving proverbs. W3 Ishai notices and asks. W4 a sufganiyot queue round the block. Open (a viewers' survey could decide).
- **Lior's novel.** Secret: the novel is about Ishai ("the man who apologises to his coffee"). Knows: Lior. revealOn 2026-11-29. Hints W1-W2; W3 Ishai reads chapter one for the cover and recognises himself: hurt, then flattered. He draws the cover.
- **Moshe.** W2 aphids, and after the midpoint he can't ask Dana. W3 he saves Moshe alone. Thriving by the finale; a new photo for Dana.
- **Tomer and Noa.** Secret: Tomer has liked Noa since school. Knows: Tomer. Hints at the bar; W3-W4 he is the one who keeps showing up for her. Open.
- **The poker table.** Secret: Yossi is broke. First night Mon Nov 23: Yossi borrows 200 from Ishai; Ronit reads Ishai ("you're hiding a girl"). Second night Mon Dec 7: Yossi pays him back in coins. (Poker is played by the engine: plant this in beats before and after, never inside.)
- **Improv.** Lessons 2-4 on Nov 12, 19, 26 (the last one Noa paid for). Lesson 4 is where he first says out loud what he wants. He pays for the next course himself.

## Arcs (where each stood on Nov 10; they continue inside the season above)
1. **Dana and the basil cups** — Dana, the deadpan barista, draws basil leaves on Ishai's cups. Slow, shy romance. Stages: he notices → he asks → a real conversation → she visits Moshe → first date. *Now: stage 4. Sat Nov 7 she came to see Moshe, answered why she draws the basil (he once told his cup to have a nice day), put her number in his phone (wants a Moshe photo in a week) and later brought a spare sprout. Sun Nov 8: two leaves on his cup and 'drive the presentation home'; that night he took a photo of Moshe and the sprout and did NOT send it. Mon Nov 9 she drew a running dog on his foam. Tue Nov 10: a winking basil leaf on the house; she reminds him of the photo (he has two reminders). Next: the photo about Sat Nov 14, then a first date.*
2. **Saving Moshe** — Moshe the basil is wilting. Ends with Moshe thriving. *Now: stage 2/3. Sunburn diagnosed Sat Nov 7; Moshe lives on the kitchen counter by the sink now, tops pinched, recovering, with Dana's small unnamed sprout ('Moshe's roommate') beside him; a fresh leaf Mon Nov 9.*
3. **The chickpea** — Gadi's client wants the chickpea logo friendlier by Sunday morning; Ishai finally brings up his fee. Follows the earlier 'bigger but smaller' client. Sat Nov 7: Gadi accepted 4,500 (grumbling about the font). Sun Nov 8: the client loves it; Ishai sent the invoice at thirty days (Gadi wanted sixty). Mon Nov 9 10:00: the video presentation; the client (Ruti) asks for a winking chickpea for the app and Ishai sells it with 'yes, and' for 1,000 extra. Main logo files sent Mon afternoon. Tue Nov 10: the left eye, same price ('a blink is another job'), Mr. Zelig's 'make it slower', and a rough preview Gadi 'didn't like' (= good). Next: the final wink files Wed Nov 11 night before the concert, then getting paid.
4. **Noa** — best friend, keeps telling him to raise his prices. Missed the cafe and the bar on Nov 4, apologised, came to Shabbat dinner Fri Nov 6. Sun Nov 8 evening she came over, got the Dana report and coached him for Monday (blue shirt). Mon Nov 9 she texted and phoned all day for the result and said she'll celebrate with him at the Pump House on Wednesday.
5. **Falafel the dog** — adopted Nov 1, walks with Ishai and sleeps by the desk. The hosts adore him; Oren worries about Moshe.
6. **The wider circle** — Tomer (Sat Nov 7 brought his mother's meatballs; Sun Nov 8 fixes the hallway light, Ishai owes him a beer Thursday after improv), Kobi and his lottery system, Mr. Zelig, Mrs. Levi, Lior (Sun Nov 8: spills Ishai's coffee, wants a book cover for 2,000 'when it's finished'), the gym regulars (Mon Nov 9: first real talk with Sivan on the next treadmill; Michal invites him to her Friday 7:00 run club, which she never attends herself). Mon Nov 9: Tomer borrowed the drill, Avi brought leftover falafel at night, Hagit at the ticket window. Tue Nov 10: Lior is asked for half up front; Mr. Zelig: 'a wink is a secret between two people'; Moti collects the committee fees, agrees the committee buys Tomer one beer (receipt!) and mentions Boaz calls Ishai 'the quiet one'. Use the whole cast over the week.
7. **Improv on Thursdays** — Noa paid for four beginners' lessons with Yael at the back of The Black Candle. He over-apologizes and can't hold a price; "yes, and" slowly helps him say what he wants, including to Gadi. Keep it a real class: he is awkward, never a polished comic. *Now: lesson 1 on Thu Nov 5; homework (don't say sorry when it isn't yours) done Sun Nov 8 with Lior; he also held thirty days with Gadi. Mon Nov 9 'yes, and' works for real on the client call. Tue Nov 10 it leaks everywhere (Gadi, Lior, Moti). Next: lesson 2, Thu Nov 12.*
Done: the TV (Nov 1) and Mrs. Levi's radio (Nov 3) both arrived.

## Already scheduled — plan around these, do not overlap or move them
- Wed Dec 9, 20:00 — the season finale at the Pump House: Penguins can Fly's Hanukkah concert (the director books it on the Events page). Ishai goes with Noa and Tomer; Dana comes too. As every Wednesday, no beat inside the hall; the answers happen on the plaza before and after.
- Hanukkah, Fri Dec 4 evening to Sat Dec 12: Ishai lights candles every evening at home (the first night with Noa and Tomer, together with Shabbat).
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
