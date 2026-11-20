# Pacing: moments of different lengths instead of one every 6 minutes — plan

Proposed 2026-11-20. Steps 1-2 built in v279 (2026-11-20). Step 3 (tuning) and step 4 (optional) still to do.

## Why
Every moment of the show lasted exactly 6 minutes. The cron ran `*/6 * * * *`, `tick()` made exactly one moment per run, and `INTERVAL_MIN = 6` was assumed all over the worker:
- the story prompt asked for talk "that fills these 6 minutes" and for blocks "about 6 minutes apart" (`askBlock()`, the block's story times);
- the "then" switch landed about 3 minutes in (`THEN_MS`, `talkPlan().thenAt`);
- planned nights are cut into 6-minute moments: poker (`pokerMoments()`), trivia, films, the arena, the lecture;
- `sceneAt` and the daily plan's beat times landed on the 6-minute marks.

So a walk to the door, a quiet hour of reading and a big fight with Dana all got the same 6 minutes. TV doesn't work like that: quick cuts while he's on the move, long scenes when something matters, slow stretches when nothing does.

## The idea
The cron runs more often, and each moment gets its own length. A run whose current moment isn't over yet stops after one cheap check.

| Kind of moment | Length | Who decides |
|---|---|---|
| On the move: walking, the bus or taxi, arriving somewhere alone | 2-4 min | default by action (`walking`, a ride: 4, arriving: 4, a hop on the way: 2) |
| Ordinary scene: eating, cooking, small talk, a thin conversation | 6 min (as before) | default |
| A real conversation (16+ lines) | 8-12 min | the writer picks inside the range (`len` in its reply); never longer than its lines allow (about 1.8 lines a minute) |
| Alone and calm: reading, TV, radio, gaming, work at the desk | 10-20 min | the writer picks (`len`), else 12; the hosts and the life between moments fill it |
| Asleep, the nap | 6 min (the night skip stays) | — |
| Planned scenes and fixed nights: lecture, poker, trivia, film, arena, cooking scripts, beats | 6 min, as before | `scriptEvent()` (`lenFixed`) |
| Waiting for a fixed start (`sceneAt`) | 2 min | `scriptEvent()` |

## As built (v279)

### The cron and the cheap check
- `crons = ["*/2 * * * *"]` (`CRON_MIN` 2; 720 runs a day instead of 240).
- Each event has `len` (minutes, a multiple of 2) and `lenKind` (move, scene, talk, calm, planned). At the top of `tick()`, `pacingWait()`: while `now < last.created + last.len` (40 s of slack for the cron's jitter) the run makes no moment, unless a goal became due since the last moment (e.g. one the director just added) or a fix / director note came in. Moments from before v279 have no `len`: the first run makes a new one.
- A run that makes no moment usually writes nothing. It writes only for timed work that can't wait (`sideDue()` → `sideTick()`): writing the hour's poll (hh:12-hh:17 when no moment did it), its reminder (from hh:13:30), counting its result (after hh:30; the hosts say it in the next moment through `s.pollSay`), and vote pushes or a key-moment alert still being sent. At most `SIDE_MAX` (120) a day.
- **Storage**: `state` is written once per moment plus those few moment-less runs: about 250-350 writes a day of the 1,000 allowed.
- **CPU**: a waiting run reads the state and stops.
- **Requests**: 720 cron runs a day, well under the free 100,000.

### Lengths
- `lenKind()`, `baseLen()` (the writer's `len` within the kind's range, else the kind's default), `momentLen()`: the length is set last in `tick()`, once this run's outings, visits and polls are booked, and is cut short so the moment never runs past `nextDue()`: a waiting goal's start, an active goal's deadline, winding down, bed, waking up, the nap's start and end.
- The story prompt: "len" with the ranges (`lenRule()`); a conversation has about 2.5-3.5 lines a minute (`talkFor()`: 6 minutes 14-22, 10 minutes 23-37, 12 minutes 28-44). Up to `TALK_KEEP` (44) lines are kept. While the talk is braked a conversation stays 6 minutes.
- Blocks: the prompt says each moment starts when the one before ends; `BLOCK_N` stays 3, so the AI calls per block stay the same. Up to 2,200 output tokens a moment (was 1,400). A queued block now lasts up to 75 minutes (was 45).
- `RUN_CAP` and `sameRun()` count in 6-minute units, so a 12-minute reading moment counts twice.
- The hosts' call (`addHosts()`): each moment's story time and length from `guessLen()`; a quiet moment of 10+ minutes always gets the later exchange, 14+ minutes a third one (`"later": 2`), a 2-4 minute one none.

### The page
- `lenMs(ev)` (6 minutes without `len`): the talk spreads over half the moment (`convoGap()`), the second half of a long talk starts 2:30-3:20 into a 6-minute moment and proportionally later in a longer one (`livePlan()`), the "then" switch lands halfway (`thenTick()`), the later host exchanges at about 40% (one) or 33% and 68% (two), and the bus ride's stops cover the ride moment (`busPlan()`).
- The page already played each moment at its story time and held it until the next one, so gaps of any length just work.

### AI budget
- About the same number of moments a day, so about the same number of story calls: busy stretches (on the move) cost a little more, quiet ones a little less. Longer conversations cost more output tokens on Gemini.
- `/api/health` → `pacing`: today's moments, average, shortest and longest length, moments by kind, moment-less runs and why, an estimate of the waiting runs, and the last 8 moments with their length.

## Steps
1. ~~**Lengths.**~~ Done in v279, together with step 2.
2. ~~**The 2-minute cron.**~~ Done in v279.
3. **Tuning.** A week of `/api/health` `pacing` numbers and a look at the Gemini usage; adjust the ranges.
4. **Later, optional:** the fixed nights on their own pacing (e.g. poker hands as they happen, a trivia question every 2 minutes).

## The open questions (answered with the plan's defaults when it was built; change any of them)
- The ranges: 2-4 / 6 / 8-12 / 10-20, as proposed. Quiet time alone may run 20 minutes (the hosts get up to three exchanges in it, and the page's silence fill runs as before). To cap it at 12, change `MOMENT_LEN.calm`.
- The writer may pick a conversation's length (8-12), checked against its lines.
- The cron runs `*/2`.
- The fixed nights (poker, trivia, films, lecture, Pump House, cooking scripts) stay at 6 minutes.
