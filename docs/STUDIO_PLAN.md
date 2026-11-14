# 8bitTV+ — the Studio as a streaming channel

The 📺 STUDIO button opens **8bitTV+**, a streaming-style channel of recap episodes:
**Today (so far)** first, then every daily and weekly recap, newest first.

## Episodes (worker) — step 1 (done, v237-v238)
- **Daily** (`day-<date>`): written once after the day is archived (`historyTick()` → `episodeTick()`), one hosts-writer AI call
  (`writeDayEpisode()`): a title, a 1-2 sentence description, 2-3 intro lines, 4-8 chapters and 1-2 outro lines.
  A chapter is one of the day's highlights (time, place, who, the spoken line = the "clip") with one host line before it
  and 1-2 after. Without AI (`basicDayEpisode()`): chapters from the highlights with template host lines.
  Saved inside `day:<date>` (`episode`); the history day gets `ep` (title, desc, chapter count, main place).
- **Weekly** (`week-<from>`): the Saturday call (`writeWeek()`) also writes a title, description and one chapter per day,
  the clip being that day's best highlight. Saved as `week:<from>` (one more KV write a week); the history week gets `ep`.
- **Today (so far)** (`today`): built live with no AI: the latest hourly recap show as the intro, today's highlights as chapters.
- Missing episodes (days archived before this) are written one per tick.
- API: `/api/episodes` → the list (Today first, then all episodes by date, newest first; a week is dated by its Saturday);
  `/api/episode?id=today|day-YYYY-MM-DD|week-YYYY-MM-DD` → the full script.
- Cost: about one extra AI call a day, no extra KV writes for days, one a week.

## The channel (page) — step 2 (done, v239)
- STUDIO opens the channel over the picture: a large Today (so far) card with ▶ PLAY, then one list of all episodes
  (filters ALL / DAYS / WEEKS), each tile with a pixel thumbnail of its main place, title, date and length.
- Tapping a tile opens the info panel: title, date, description, length, the chapter list (time · place · who), ▶ PLAY.
- Player: the hosts in the studio as now. Buttons: ← BACK (to the channel), ⏭ NEXT MOMENT (next chapter),
  ⏭⏭ NEXT EPISODE (next in the list), ✕ LIVE (back to the feed).
- Watching is personal (like the old STUDIO button); the live feed runs on underneath; the auto Studio break on odd hours is unchanged.

## Moments on the studio screen — step 3 (done, v240)
The screen behind the hosts replays each chapter: the place, Ishai and whoever was with him, the clip's line in a bubble.

## Polish — step 4
Next episode starts by itself after a 10 s countdown; resume where you stopped (localStorage); a Sandbox control; HD voices prefetch.

## Defaults (change any time)
Name 8bitTV+; daily about 4-6 minutes, weekly about 8-10; one list sorted by date.
