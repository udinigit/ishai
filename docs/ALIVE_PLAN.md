# More alive: more action, more talk, something always happening — plan

Proposed 2026-11-18, with the director's answers the same night and on 2026-11-19 (see "Decisions"). **Step 1 built in v276 (2026-11-19).**

## Why the show feels quiet (measured 2026-11-18)
- **Half of prime time had nobody talking.** Of the 25 moments from 20:11 to 22:35, 13 had no spoken lines (only hosts). From 21:59, six silent moments in a row: Noa fell asleep in the armchair and Ishai worked alone.
- **Talk is stretched on purpose.** A moment's 10-16 lines are spread over about 3 minutes (`convoGap()` up to 12 s a line, `livePlan()` beats up to `BEAT_MAX` 28 s), then the rest of the 6-minute moment is quiet (`tail`). Spoken at a natural pace those lines take 60-80 seconds. Long, even gaps are what make it sound like a reading instead of a conversation.
- **The nets didn't fire.** 0 outings and 0 drop-in visits that day. The prompt's "at least one moment in two involves another person" is a request the writer often ignores; the visit rule waits 30 minutes alone and then rolls 40%, 150 minutes apart.
- **Long waking day.** Awake 06:00/07:00-23:00 is 16-17 hours to fill with the same AI budget; the quiet hours (early morning, late evening alone) are the thinnest.

## The idea
A shorter, denser day. He sleeps longer (and naps on the weekend), so every waking hour can carry more. While he is awake: talk sounds like talk, he is never alone and silent for long, small things keep happening, and there are games, which give action and talk at almost no AI cost.

## Decisions (the director)
- **Sleep:** to bed between 23:00 and 23:30, up around 09:30.
- **Naps on Thursday, Friday and Saturday.**
- **Thursday is a night out:** he stays up late (after improv he goes out), to bed about 01:30-02:00, and sleeps in a little on Friday.
- Write the whole plan, then build it step by step.

## Step 1 — the day's shape: sleep, naps, Thursday night out (built, v276)
One table drives everything: `SLEEP` in the worker, read by `sleepOf(ms)` (the night that covers `ms`, or the one coming), `asleepAt(ms)`, `bedSoon(ms)` (from 30 minutes before bed until he wakes), `napOf(ms)` and `awakeFor(ms, minutesBeforeBed)`.

| Night | Bed | Up | Nap |
|---|---|---|---|
| Sun-Wed | 23:00-23:30 | 09:20-09:40 | none |
| Thu | 01:30-02:00 (Friday morning) | Fri 10:20-10:40 | Thu 14:30-15:30 (before the 17:00 improv) |
| Fri | 23:00-23:30 | Sat 09:20-09:40 | Fri: one hour ending 2.5 hours before the candles (12:30-13:30 without a candle time) |
| Sat | 23:00-23:30 | Sun 09:20-09:40 | Sat 14:00-15:30 (the Shabbat nap) |

- The exact minutes come from the date (`seed()`), so every isolate agrees and it differs a little night to night.
- **Night (no AI):** `nightEvent()` keeps him asleep from bed to wake-up (was 22:00-06:00). A planned beat or lecture that starts before he is up wakes him (an early appointment is real life), so the daily planner must plan nothing before 10:00 (11:00 on Friday) unless it means to wake him.
- **Bedtime:** from 30 minutes before bed the prompt winds him down (guests leave, bathroom, water, bed); from bed time he must be in bed when at home (was "after 01:00"); out, he heads home. Scenes end at bed time (`sceneOverdue()`).
- **Naps (no AI):** `napEvent()`: in the nap window, at home, alone and free (no goal), he lies down and sleeps until it ends; 30 minutes before, the prompt asks to be home and alone by then. Out, with company or busy: no nap that day (real life). Visits, outings and polls keep clear of the nap.
- **Thursday night out:** `nightOutTick()` books an outing to The Black Candle (`night-MMDD`) at 21:00 with a friend (Tomer, Noa or Kobi, by the bar's `people`), 150 minutes, unless the plan already has something from 20:00. From there he may wander on (`chainTick()`) until an hour before bed.
- **Everything that ran on the old hours now follows the table:** the budget skip at night, the dog's morning walk (from wake-up to 2 hours after), visits (from an hour after wake-up to 2 hours before bed), outings and wandering on, the pacing notes, polls' effects (`POLL_AWAKE` from 10:00), the auto-fix note, the backup push, sick days and the fallback lines, the cooking's earliest start (10:00).
- **The planner** (`story/season.md`): no beats before 10:00 (11:00 on Friday) unless he is woken on purpose; Thursday night is a night out; nap times stay free.
- Health: `/api/health` → `sleep` (tonight's bed and wake, the next nap, whether he is asleep now, the night out).

## Step 2 — talk that sounds like talk
- **Natural pace.** `livePlan()` keeps its quick turns and cut-ins but drops the long beats (at most 3-4 s, only after a laugh or big news), and `convoGap()` no longer stretches a talk to 3 minutes: 14 lines take about 70-90 s.
- **No more quiet tail: more talk instead.** Each moment with someone carries two bursts: 14-22 lines, with a `then` (an action change in the same place) between them, so they talk, do something, talk again. `TALK` goes to 14-22 (braked: 10-14). The page plays the second burst from ~3 minutes in.
- **Talk while doing.** The story prompt asks for talk over an activity (cooking together, setting the table, walking the dog, waiting for the bus) instead of talking still.
- **Conversation rules in the prompt:** mostly short lines (3-10 words), questions get answered (or dodged on purpose), people cut in, change the subject, bring up earlier scenes and today's plan, disagree a little; no speeches; at most two lines in a row from one person.
- **Groups of 3-4.** Allow a second friend to join a scene (`with2`), like trivia night: more voices, more back-and-forth.
- Cost: about +40% output tokens on talking moments (Gemini; the director says its limit isn't tight). The hosts' lines stay as they are.

## Step 3 — never alone and silent for long
- **The 12-minute rule.** When he has been alone for 2 ticks (awake, not on the way to a beat, not cooking, not at a lecture), the next moment must bring someone in. `aloneTick()` picks, in turn: a phone call or a video call from a friend (no walking needed), a text he answers out loud, a knock (a drop-in visit), or going out. The writer gets it as a direction, like a goal.
- **Looser nets:** visits up to 6 a day, 75 minutes apart, after 12 minutes alone, no 40% roll; outings 40 minutes apart (`gapMin`), and only 30 minutes free needed ahead instead of 90.
- **Guest fell asleep?** (as on Nov 18) The writer may wake them, or Ishai calls someone quietly / goes out on the balcony for a call.

## Step 4 — even alone, he isn't silent
- **Thinking aloud.** Alone moments carry 3-6 lines from Ishai: muttering at the logo, talking to Falafel and Moshe the basil, answering the radio DJ, practising what he'll say to Dana. (`TALK_SOLO` in the prompt; `validate()` stops rejecting lines without a `with`.)
- **Voice notes and video calls.** `phoning` with `video: true`: the page shows the friend's face on his phone screen in a small frame, so a call is a real two-way conversation with a picture.
- **Falafel and Moshe react** (a head tilt, a bark at the right line) from `lineMood()`, no AI.

## Step 5 — something happens every 15-20 minutes (no AI)
- **Small incidents** from a table (`INCIDENTS` in the worker), one per 15-20-minute clock slot while he is awake, picked by the slot, the place and the weather: Falafel steals a sock, a wrong-door knock (a courier for apt 7), the coffee spills, the phone dies mid-call, the laundry on the balcony in the rain, the power flickers, a pigeon on the windowsill, Mrs. Levi's TV too loud, the neighbour's drill, a parking argument in the street, a balloon stuck on the lamp post. The page draws and plays the ones it can (sound, a small animation); the next moment's writer gets it ("JUST HAPPENED: ...") and reacts.
- **Background talk.** The daily texture pack gets `scenes`: 3-6 short two-person exchanges a day (two regulars at the café, the couple next door arguing about the dishwasher, kids in the street, the bus driver and a passenger), played on the clock where he is, quieter than the story's talk, with bubbles over the extras.

## Step 6 — games
Games give action and talk cheaply: the play (dice, shots, scores) is worked out from the clock with no AI, like poker and trivia; only the trash talk needs lines, from word lists or the texture pack.
- **Backgammon (shesh-besh) with Shmulik at the kiosk.** The board is already there. A real game: dice rolled on the clock, checkers moving, a score, "shesh-besh!" shouts, Shmulik's lines; Ishai loses more than he wins. Any weekday afternoon when he passes, and a standing Sunday 17:00 game.
- **Video games with Tomer at home.** An 8-bit console (fictional brand, e.g. "PIXELBOX") under the TV; the TV shows the game (a racing or football game drawn in the show's art), both shout at it. Monday or Wednesday evening when there's no poker or gallery.
- **Matkot on the promenade** (beach paddles; the classic Israeli beach game) with Noa or Tomer on fine weekend days: the ball's "tok... tok", counting the rally.
- **Basketball in the park** (a hoop on the park's edge; NBA talk is allowed by the director's trivia rule): shooting around, H-O-R-S-E against a local.
- **Pool and darts at The Black Candle** on the Thursday night out.
- **Rummikub with Mrs. Levi** when he visits her (her tiles, her rules, she always wins).
- **Fetch with Falafel** in the park.
- **For viewers:** before each game a quick "Who wins?" prediction (signed in, like the polls), points for a right call and a weekly leaderboard on the TV guide card; and now and then viewers pick tonight's game. Built on the poll and survey tables, no AI.

## What it costs
- Step 1 saves AI: about 2.5 more hours a day of sleep and naps run with no AI.
- Steps 3, 5 and 6 need no AI calls (clock tables, word lists), only a little more prompt text.
- Step 2 and 4 add output tokens on Gemini (longer talks, lines while alone): roughly +30-40% of the story's output tokens. Workers AI and KV don't change.

## Order
1. The day's shape (sleep, naps, Thursday night out). **Done.**
2. Talk pace and two bursts per moment.
3. The 12-minute rule and the looser nets.
4. Talking alone, video calls.
5. Incidents and background talk.
6. Games, one at a time (backgammon first: the board exists), then viewer predictions.
