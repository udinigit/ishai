# Deeper characters: plan

Proposed 2026-11-16 with the director's answers (see "Decisions"). **Built in v252 (all six steps), 2026-11-16.**

### As built (differences from the plan)
- `cast_note` has two more columns: `upd` (last change, for deleting gone notes 30 days after they went) and `pin` (the director's pin: never expires or archived).
- The scene keeper, the card drafts and the weekly growth call Gemini directly (`runGemini()`), never Cloudflare. Card drafts: one a tick, at most 6 a day, only while the keeper queue is empty.
- The keeper's "edit"/"drop" only works on notes it was shown (by `n`); "others" need an exact quote from the scene's lines; anything that mentions cameras, viewers or the show, or shares most long words of a live arc secret (`castLeaks()`), is dropped. Every drop is logged (`s.castLog`, the director's Cast box).
- The hosts' setup (`pre`) comes from the hosts' call (`addHosts()`), so it is written only while Gemini writes the story (`HOSTS_APART`). Without a Gemini key the story writes its own host lines, as before, with no setup.
- The verdict waits for the next moment with room (not a planned night, not asleep), at most 40 minutes. If the keeper hasn't answered by then, a no-AI line is built from the scene's `update.mood` sum.
- Voice by mood: device voices only (HD voices are cached by text and speed, so they keep the director's settings).
- With the cast store on, `c.memory` and `c.relationship` (the old one-line memory and closeness) follow it: the newest note about Ishai, and the pair's warmth.
- The review token: only its SHA-256 is in the code (`CAST_HASH`); the token is in the scheduled review task's prompt.

## The idea
Today each person has a fixed one-line personality, one memory sentence (at most 180 characters, overwritten after every scene) and one closeness number (-5 to +5, most friends already at 5). Ishai has no card, and nothing records how the other characters feel about each other. The long story lives only in the plan's arcs and the daily summaries.

The plan: keep a lot more about every person and every pair, change it after each scene, and give the story writer only what the moment needs (who is in the scene, who they talk about, what the talk touches). The characters grow week by week, and Claude reviews every change first. Viewers see the important history and feelings in the Cast tab.

## Decisions (the director, 2026-11-16)
- **Growth** (new wants, changed habits, a trait that shifts) is proposed weekly and **reviewed and approved by Claude** (a scheduled Claude session) before it changes a card.
- **Body language** keeps the gesture names the page already has (they are only code labels). A mood picks among them, with a few new drawings. No per-mood names are saved anywhere.
- **One AI call after each scene** (the scene keeper) instead of piggybacking everything on the story call.
- **Memory can be added to, edited and removed from.** Unimportant notes expire. Important old ones are archived and fetched again when the talk makes them relevant.
- **More updates per scene**: feelings, mood, facts, open threads, and links between other characters.
- **Viewers see it in the Cast tab, never as a card over the picture.** Ishai's own card shows to the developer only (`DEV`) for now.
- **The hosts set up and wrap up each scene** with what they know of the history (see "The hosts before and after a scene").
- **Gemini's limit isn't tight** for this project: no second project, no separate model for the keeper for now.

## What we keep (D1, the `ishai-polls` database, binding `DB`)
KV stays as it is (1,000 writes a day). D1's free daily write limit is far higher, and the main state (`s`) stays small. Tables are made with `CREATE TABLE IF NOT EXISTS` on first use, like `pushTables()`.

- `cast_card (id PRIMARY KEY, card TEXT, v INTEGER, at INTEGER)`: the full card as JSON (see "The card"); `v` counts approved versions.
- `cast_note (n INTEGER PRIMARY KEY, who TEXT, about TEXT, at INTEGER, imp INTEGER, text TEXT, tags TEXT, state TEXT)`: one note per line.
  - `who` is whose memory it is.
  - `about` is the other person (or null).
  - `imp` is the importance, 1-5.
  - `tags` holds people, places and topics, for the archive search.
  - `state` is `live`, `archived` or `gone`.
- `cast_fact (who TEXT, k TEXT, v TEXT, at INTEGER, PRIMARY KEY (who, k))`: concrete things ("owes Ishai" → "40 ₪", "sister" → "Ruti", "cough" → "since October, won't see a doctor").
- `cast_pair (a TEXT, b TEXT, warmth INTEGER, trust INTEGER, tension INTEGER, label TEXT, history TEXT, thread TEXT, at INTEGER, PRIMARY KEY (a, b))`: one row per pair, `a < b`, Ishai included.
  - `warmth`, `trust` and `tension` each run from -5 to +5.
  - `label`: old friends, friends, crush, exes, rivals, family, neighbours, colleagues, strangers...
  - `history`: one paragraph, rewritten weekly.
  - `thread`: what's open between them now.
- `cast_mood (who TEXT PRIMARY KEY, mood TEXT, why TEXT, since INTEGER, until INTEGER)`: how they feel now and why. It fades at `until`.
- `cast_pending (n INTEGER PRIMARY KEY, who TEXT, kind TEXT, change TEXT, why TEXT, at INTEGER, state TEXT, review TEXT)`: proposed growth, waiting for Claude's review.
- `cast_queue (n INTEGER PRIMARY KEY, scene TEXT, at INTEGER, tries INTEGER)`: scenes waiting for the scene keeper (see "Gemini's limits").

Start-up: the seeded cards from `SEED_CAST`, each person's current `memory` as its first note (importance 3), and a first `cast_pair` row for each person with Ishai. Warmth starts from today's `relationship`, but the maxed-out 5s become 3. Trust is 2 for friends and 0 for others. Tension starts at 0.

## The card (each person, and Ishai)
- **Who:** name, age, role, where they live and work, `hangouts`, look (as now).
- **Backstory:** 3-5 sentences: family, where they come from, the big things that happened to them.
- **Inside:** what they want (long-term and this week), what they fear, what they are proud or ashamed of.
- **Habits and quirks:** 3-6 short items.
- **Talk:** how they speak, 3-4 sample lines, topics they love and topics they avoid.
- **Moods:** how they act in each mood: `angry`, `sad`, `happy`, `nervous`, `tired`, `tipsy`, `embarrassed`. Each has:
  - `say`: one line for the writer ("goes quiet and very polite, calls you by your full name");
  - `body`: gesture names for the page (see "Body language");
  - optional `tell`: one small personal sign, e.g. Mrs. Levi fixes her glasses.
- **Secrets:** their own, with who knows. Arc secrets stay in the plan as now.
- **Ishai's card** is the same kind of card, but only Claude's review may change it, and only in small ways. The non-negotiables say he never knows he is filmed.

The first full cards: one AI call per person (Gemini) from what we have (the seed card, the notes, the arcs, the last week's summaries). Each one goes to `cast_pending` like any growth and is approved by the Claude review. The director can edit any card on the director page.

## The scene keeper (one call after each scene)
- **A scene:** a run of moments with the same person (`s.scene`, as the worker already tracks it). When that person leaves Ishai, or the run ends (he sleeps, a planned night starts), the scene is queued (`cast_queue`).
- **One call per queued scene** (Gemini, the story writer's model, small and strict JSON), from `castKeeperTick()` in `tick()`: at most 2 a tick, oldest first.
- **It gets:**
  - the scene's lines and narration;
  - both cards (short form);
  - each side's live notes about the other (up to 15) and their facts;
  - the pair row, both moods;
  - the names of other people the scene mentioned, with their pair rows to these two.
- **It returns changes, not a new text:**
  - `notes`: `add` {who, about, imp, text, tags}, `edit` {n, text, imp}, `drop` {n}. Each side remembers in their own voice, and Ishai gets notes too.
  - `facts`: set or clear {who, k, v}.
  - `pair`: warmth / trust / tension moves (-2..+2 each, with a reason), a new `label` only with a reason, and `thread`.
  - `mood`: {who, mood, why, hours}.
  - `others`: changes between other characters the scene revealed (e.g. Tomer↔Noa: warmth +1, thread "he admitted he likes her"), only with a quote from the lines.
- `castApply()` checks every change (known ids, sizes, ranges, no secret told early, nothing about cameras or viewers) and writes them.
  - A bad reply is retried once, then the scene is dropped with a note in `/api/health`.
  - The old `update.memory` / `update.mood` of planned moments (lectures, nights, cooking) become notes and pair moves through the same `castApply()`, with no AI.

## Memory: what stays, what goes
- **Live notes:** what goes into prompts.
- **Expiry by importance:**
  - Importance 1 goes after 3 days, importance 2 after 14 days (`state` → `gone`).
  - 3 and up never expire. They are archived when a person has more than 30 live notes (oldest and least important first) or after 60 days.
- **The archive** is searched by tags and words (see the next section) and brought back into a prompt when relevant. An archived note that comes up again in a scene can be made live again by the keeper (`edit`).
- **Gone notes** are deleted after 30 days.

## What the story writer gets (no extra AI: `castContext()` in `buildMessages()`)
Built fresh for each prompt, in this order, until the size cap:
1. **People in the scene** (`with`, a guest waiting, anyone planned in): the card in short form, the mood now with its `say` line, 5-8 live notes about each other (most important and newest first), the facts, and the pair row (feelings, label, history, thread).
2. **People mentioned:** the worker looks for names and the words people use for them (`aliases` on the card: "Levi", "Mrs. Levi", "the neighbour", "Ronit's husband"...) in:
   - the last 2 moments' lines;
   - the goal or director note;
   - today's hook and the arcs touching these people;
   - the queued block's text.

   Each person found adds: their role, their pair rows with the people in the scene, their mood, their 3 newest notes and their thread with Ishai. If Noa and Tomer talk about Dana, Dana's line explains what each of them knows and feels about her.
3. **Topics:** words in the same text matched against `cast_fact` keys and note tags (Haifa, the cough, the scooter, the invoice...). These bring in matching facts and archived notes (at most 3).
4. **The rest of the known people:** names only, as now.

Size: about 600-1,000 extra tokens, capped by `CAST_CTX_MAX`. While the talk is braked (`talkLevel()`: on the backup writer, Gemini paused, or Cloudflare past 6,000 neurons) the cap is halved and only 1 and 2 go in.

The story writer may also set a mood mid-scene with a new field on a moment, `feel: {who, mood, why}` (no extra call), so a fight changes the body language at once. The scene keeper then confirms or drops it.

The hosts' call gets the pair row (label, feelings, thread) for the people on screen, so they can mention it.

## Body language (page, no AI)
- `publicState.moods` (who → mood, with the card's `body` and `tell`) and the moment's `feel` reach the page.
- `body()` (v250) picks gestures by mood as well as by the line:
  - `angry`: crossed arms, short sharp gestures, no nods, a frown;
  - `sad`: eyes down, slow, hands still;
  - `happy`: more open hands, laughs easily;
  - `nervous`: fidgets, looks away, touches the neck;
  - `tired`: slower, yawns;
  - `tipsy`: a sway;
  - `embarrassed`: looks down, a hand to the face.
- New drawings: a frown, a hand on the neck, a yawn, turning a little away. Names like `cross` stay the code labels they are.
- The person's `tell` is drawn now and then while that mood lasts.
- Voices: a small rate and pitch change per mood (angry a little faster and flatter, sad slower and lower), on top of the director's voice settings.

## Growth: proposed weekly, approved by Claude
- **Saturday:** `writeWeek()` already makes one call. It (or a second call right after it) gets each person's week of notes, pair moves and moods, and proposes:
  - each pair's new `history` paragraph;
  - per person, at most one change: a new want, a habit gained or lost, a fear eased, a backstory detail that came out in a scene, a mood tendency.

  Everything goes to `cast_pending` with a reason.
- **The review:** a weekly scheduled Claude session (like the health check) reads `/api/cast/pending?token=…` (its own token; the code holds the SHA-256, like `FIX_HASH`) and checks each proposal against the card, the notes, the season plan, the non-negotiables and the drama limits (nobody dies). It answers through `/api/cast/review` with `approve`, `edit` (its own wording) or `reject`, and a one-line reason.
- **Approved changes** update `cast_card` (`v` + 1). The director page shows every review with its reason and can undo one.
- **Nothing is applied without a review.** Proposals not reviewed in 7 days expire.

## Viewers: the Cast tab (not over the picture)
- **Each person's card** (`renderCast()`) gets:
  - **With Ishai:** the label ("close friends", "neighbours"), small bars for warmth / trust / tension, the one-paragraph history, what's open between them (`thread`), and their mood now with a word of why ("annoyed: the invoice").
  - **Close to:** the 2-3 strongest links with other characters (e.g. "Tomer ♥ Noa"), only where the label or feelings are strong.
  - **Lately:** the 3 newest important notes (importance ≥ 3), in plain words. Low-importance notes are never shown.
- **When both of a pair are on camera,** both cards are already open at the top (`settledOnCamera()`). Their shared section is shown first, highlighted.
- **Never shown:** secrets, anything an arc keeps hidden until `revealOn`, Ishai's own private notes.
- **Ishai's card** (his card, notes, moods) is shown only with `DEV` for now.
- `/api/cast` (public, cached a minute) serves this.

## The hosts before and after a scene
Like a reality show's narrator: the hosts tell viewers what's at stake before two people meet, and what it meant after.
- **Before (the setup):** when a moment starts a scene (someone joins Ishai, or he walks in on them), the hosts' call for that block gets a short scene brief from `castContext()`: the pair's label, feelings and `thread`, both moods with their reasons, the last important notes between them, and any open arc that touches them. It writes one or two `pre` host lines that play **before** the first spoken line ("Dana's still hurt about the missed birthday. First time they've met since. Let's see if he brings it up."). This adds no AI call; it only makes the hosts' prompt bigger.
  - Page: `talkPlan()` puts `pre` host lines first in the moment (after the arrival, before the talk) instead of after it; the talk starts once they are said.
  - The setup asks a question and never answers it. The hosts' call already sees the whole block, so the prompt says plainly not to give away what happens next. They never say an unrevealed secret (`secretsNow()` rules as now).
- **After (the verdict):** the scene keeper (one call after each scene) also returns 1-2 host lines, `wrap`, on what changed between them ("Well, that went better than expected. I think she'll forgive him now that he's apologised."), from the pair moves it just made. They play in the next moment that has room, before its other host lines. This adds no extra call either.
  - If the keeper is late (Gemini busy), a no-AI line is built from the pair moves instead ("Warmer between those two now." / "That didn't help."), so the scene never ends without a word.
  - Not after a planned night that has its own ending (lecture, film, trivia, concert, poker), nor after a scene of fewer than 2 moments.
- The setup and the verdict are saved with the moment like other host lines, so 8bitTV+ episodes and the studio recaps can use them.

## Director page
A Cast box with:
- each person's card (editable);
- the note timeline (live, archived; drop or pin a note);
- the facts;
- the pair table with a small map of who is close to whom;
- moods now;
- the pending and reviewed growth;
- the keeper queue and its last errors.

The sandbox gets a "pretend scene" button that runs `castApply()` on sample changes, with no AI.

## Gemini's limits
- **Today:** the story writer used 27 Gemini calls by 10:00 on 2026-11-16, so a full day is a few hundred.
- **The limit:** Google no longer publishes the free tier's per-model daily limits; the director's AI Studio page shows the real number for gemini-3.5-flash-lite.
- **The keeper:** about 20-30 more calls a day (one per scene with someone).
- **The weekly growth:** 1-2 calls on Saturday.
- **The first cards:** about 21 calls, once, spread over a few days.
- **Overloads:** Gemini answers 503 ("high demand") several times a day. Keeper calls wait in `cast_queue` and retry on a later tick (at most 4 tries).
  - They never fall back to Cloudflare, whose free daily AI allowance is the tighter one.
  - When Gemini is paused for the day (429), the queue waits for the reset; the story never waits for the keeper.

## Steps
1. **Storage and notes:** the D1 tables, the start-up from `SEED_CAST` and today's memories, the queue, and the scene keeper writing notes and facts. Old notes expire and get archived. The worker still feeds the old `memory` line until step 2.
2. **What the writer gets:** `castContext()` (people in the scene, people mentioned, topics, the archive), the size cap and the brake.
3. **Pairs and moods:** the pair table and its moves (other pairs included), `cast_mood`, the `feel` field, mood in the hosts' call, body language and voice by mood on the page, and the hosts' setup before a scene and verdict after it.
4. **Full cards:** the AI drafts, Claude's review of them, the director's card editor.
5. **Growth:** the weekly history and growth proposals, the review link and token, the scheduled Claude review, undo on the director page.
6. **Viewers:** the Cast tab sections and `/api/cast`.

## Open questions
- None for now. If Gemini's daily limit ever gets close, the keeper runs only for scenes of 3 moments or more.
