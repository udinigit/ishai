# Surveys of the week: plan

Draft, 2026-11-09. Not approved yet: see "Questions for the director" at the end.

## The idea
Next to the hourly vote (small, quick, it changes the next hour), a slower layer: a few **surveys that run all week**, with live results.
- Viewers sign in with Google to vote.
- The TV guide card (TODAY, THIS WEEK, merch, the next big night) gets survey cards: "vote now" and "results so far".
- When the thing a survey was about happens, the hosts say so and read out the result. Examples: poker night ends, the suggested character first walks on, Ishai first visits the suggested place.

**Truman rule:** nobody in the story knows about any survey. Only the hosts (and the studio recap) talk about them, just as with the hourly polls.

## The surveys
A week runs Sunday 06:00 to Saturday 21:00 (after Shabbat), Israel time. Results are announced on Saturday night, or at the event itself for the poker guess.

| Survey | Options | Closes | When the hosts talk about it |
|---|---|---|---|
| **Favourite character of the week** | everyone who appeared on camera this week (`scenes`/`lastSeen` this week), Ishai and Falafel too | Saturday 21:00 | Saturday night / Sunday morning: "Your favourite this week: Ronit, with 34%." |
| **Who wins the next poker night?** | Boaz, Ronit, Moti, Yossi, Ishai | poker night 20:00 (only in weeks with a poker night) | at the walk-home moment: "41% of you picked Ronit… and Ronit took it. Only 6% believed in Ishai." |
| **Favourite lecture of the week** | the week's lectures by title (up to 3; a two-part lecture counts as one) | Saturday 21:00 | Sunday, the first awake moment |
| **Who should join the show?** | free-text suggestions, then a vote among the director's shortlist (see below) | suggestions Sun-Wed, vote Thu-Sat | when the winner first appears on camera |
| **Where should [someone] take Ishai?** | free-text suggestions of a place, then a shortlist vote | suggestions Sun-Wed, vote Thu-Sat | when Ishai first goes there with that person |

**Who is "[someone]"?** Last week's favourite character, so the two surveys feed each other. Week one: Noa.

## Suggestions: two steps, the director in the middle
Free text from the public must never reach the picture or the hosts unchecked. So:
1. **Suggest (Sunday to Wednesday).** A short form, at most 2 suggestions per account per survey:
   - a character: name, who they are (one line), where Ishai would meet them;
   - a place: name and one line.

   Each suggestion has length limits and goes through the hourly polls' banned words (`POLL_BANNED`) plus a list of real brands. Suggestions are **never shown publicly**; the viewer sees only "Thanks, the director reads every one."
2. **Shortlist (director page).** A new Surveys tab lists the suggestions, with a count of near-duplicates. The director picks 3-5, edits the wording if needed and publishes the shortlist.
3. **Vote (Thursday to Saturday).** Viewers choose from the shortlist; results are live on the card.
4. **Make it real.** The winner is a build task, not something the AI invents on the spot:
   - a new character becomes a `SEED_CAST` entry (look, `INK`, hangouts);
   - a new place is new scenery under `docs/SCENE_GUIDELINES.md`, with a real map link (no teleporting).

   The director marks the survey "made it in" with the cast id or place id. That links the event to the survey, so the hosts can announce it when it happens.

   Until it is built, the results card says "Winner: … coming to the show soon".

## On screen
- **TV guide card.** One more card kind, `survey`, which takes a turn in the existing rotation and doesn't add slots.
  - The rotation becomes: a schedule, the merch, the other schedule / the next big night / **a survey**, the next big night or **a survey** or the first schedule.
  - The vote countdown still wins.
  - Two looks: **VOTE NOW** (the question and "tap to vote") and **RESULTS SO FAR** (the top 3 as small bars with percentages).
  - The card is tappable, like the merch card, so it gets the extra 8 s, and tapping opens the survey panel.
- **Survey panel.** A dialog like the notification settings, also reachable from a new **SURVEYS** tab next to SUMMARY/EVENTS.
  - It shows every open survey with its options and the live percentages.
  - Your own pick is marked, and you can change it until the survey closes.
  - Not signed in: the same Google button as the vote card.
  - Closed surveys show their final results for a week.
- **Results for everyone are the same.** Percentages are counted on the server and cached for 5 minutes per survey, so the database isn't counted on every page load.

## When the hosts mention it (no AI)
These are template lines added to `ev.commentary` in `tick()`, the same way `quietHosts()` and the poll result line work.
- **Poker:** the walk-home moment of the poker beat looks up the poker survey. The winner is the top of the night's `results`.

  The night is simulated days ahead, so the outcome exists before the vote closes. It stays hidden: it is never in `publicState` until the end moment, and the line is added only when that moment plays.
- **First appearance:** `alertText()` already detects a first appearance. If that cast id is linked to a survey, a host line is added, e.g. "Remember who you voted to join the show? That's Miri, 38% of your votes."
- **First visit:** the first moment at a linked place with the linked person.
- **Weekly results** (favourite character, favourite lecture): one host line on Saturday 21:00 or the first awake moment after it. The hourly studio recap also gets one sentence of results in its prompt, which costs no extra AI call.

## Storage and limits (free tier)
- **D1 (database `ishai-polls`).** No KV writes and no new AI calls. Tables are created by the worker like `push_remind`. One write per vote or suggestion; the D1 free plan allows 100k writes a day.
  - `surveys (id, week, kind, question, about, options, opensAt, closesAt, phase, result, linked)`;
  - `survey_votes (survey, voter, opt, at)`, primary key (survey, voter), so changing your pick replaces the row;
  - `suggestions (id, survey, voter, text, at, status)`.
- **Who votes.** The voter is the same signed-in Google id as the hourly vote (`voterOf()`). Surveys are hidden when `GOOGLE_CLIENT_ID` isn't set.
- **Writing the surveys.** The worker creates the week's surveys on Sunday 06:00 in `tick()`. A poker survey is added only in weeks with a poker night, and a lecture survey only when lectures took place.
- **API.**
  - `GET /api/surveys`: open and recent surveys with results;
  - `POST /api/survey/vote`;
  - `POST /api/survey/suggest`;
  - the director's shortlist, link and close actions in `/api/director`.

  `/api/health` → `surveys`.
- **Sandbox.** A "Survey card" button (vote now / results) and a "Survey result line" button, with pretend data.

## Build order
1. Tables, the weekly survey writer, the vote API and the panel, with favourite character and poker guess only.
2. The guide card kinds and the tab.
3. The hosts' lines: poker, then the weekly results.
4. Lecture survey.
5. Suggestions, the director's Surveys tab, the shortlist vote and the "made it in" links with their host lines.

## Questions for the director
1. **Suggestions.** Is the two-step flow (suggestions only you see, then a vote on your shortlist) right? The alternative is that you simply pick the winner from the suggestions.
2. **Effects.** Should any result change the story beyond the hosts? For example, the favourite character gets an extra drop-in visit next week, or the winning lecture's strand comes up next. As planned, nothing in the story changes.
3. **The place survey.** Should "[someone]" be last week's favourite character, or do you want to choose them each week?
4. **Changing votes.** May viewers change their pick until a survey closes, or is it one vote and final?
