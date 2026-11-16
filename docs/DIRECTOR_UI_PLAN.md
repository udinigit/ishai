# Director page: a better UI (plan)

Status: plan, not built. Page: `source/public/director.html` (567 lines, one file). Worker: `/api/director` (`directorView()`), `/api/cast/dir`.

## What's wrong today

- **One long column of 17 boxes in no particular order.** Voices (set once in a while) is second; Goals, the thing used most, is 15th, under Cast, Kitchen, Cinema and Course. On a phone that is a long scroll to reach anything.
- **No "what is happening now".** Current scene, the last moment, AI checks and the real world are four separate boxes far apart. Nothing from `/api/health` is shown: Gemini paused or failing, neurons today, the talk brake, `stuck`, auto-fixes, `comingUp`, outings. The page never refreshes by itself; it is a snapshot from when it opened or the last button.
- **Things that need you are hidden.** New bug reports, cast proposals waiting for review, goals that need art, an AI error: each sits in its own box with no count or badge.
- **Missing controls.** No box for trivia, poker, gallery/concert nights (only on `/events`), outings, history/episodes, or the quick fixes (end scene, director note, unstick), which today need `story/plan.json` or the token URL.
- **Heavy forms and text.** The goal form shows all 9 fields at once; every box opens with a paragraph of help. The Cast box uses `prompt()` / `alert()` pop-ups and a raw JSON card.
- **Links to the other tools are a sentence of text** near the top (sandbox, builder, events, map).

## The new layout

Same look (phosphor green, VT323, dark), same single file, same API. Five tabs on top, under an always-visible status bar. No live picture of the show on this page.

```
┌──────────────────────────────────────┐
│ DIRECTOR // ISHAI        14:02  ● LIVE│  ← sticky
│ 📍 Café Nahat · talking · with Dana  │
│ [Gemini ✓] [CF 38%] [talk ok] [⚠ 2]  │  ← chips, tap for detail
│ NOW   STORY  CAST•3  WEEK   MORE     │  ← tabs, on top everywhere
├──────────────────────────────────────┤
│                                      │
│          (the tab's content)         │
│                                      │
└──────────────────────────────────────┘
```

### Status bar (always on top)
- Story clock, where Ishai is, what he is doing, with whom (from the last moment).
- Chips, coloured green / amber / red: Gemini (ok, paused until …, failing), Cloudflare neurons % of the day, talk (normal / braked and why), stuck counter, last auto-fix. Tapping a chip opens its detail in MORE → Health.
- A ⚠ count of things waiting for you (see Inbox).
- Refreshes once a minute while the tab is visible, stops when hidden (`visibilitychange`). `GET /api/director` only reads, so this costs no KV writes.

### NOW (opens by default)
1. **Inbox**: one list of everything that needs you, each with its button right there: new bug reports (Mark fixed), cast proposals (Approve / Edit / Reject), goals that need art (Release), the last AI error, an auto-fix that just ran, a film not written 33 h before Saturday. Empty = "All quiet."
2. **The scene now**: the current scene card (with, why, wants, beats, ending, lines so far of ~target) and the last 5 moments with their spoken lines (narration greyed, dev-only).
3. **Quick actions**: Run next moment, End this scene, Give a note (text + minutes), Unstick. The last three use `applyFix()` through a new director action, so no token or plan.json edit is needed.
4. **Coming up**: the next 3 items of `comingUp()`.

### STORY
- **Goals**: active and waiting first, as cards; done ones folded under "Finished (n)".
- **New goal** as a short form: "What should happen", "Start in" and "Deadline" as chips (now, 1 h, 3 h, tonight, tomorrow), and a "More options" fold for with, conversation length, scene brief, if-the-deadline-passes, unlocks, needs art.
- **Today's plan**: the beats from `story/plan.json` with their times and teasers, today's hook and "previously", the arcs. Secrets stay off this page entirely: no text, no names of who knows, no reveal date, not even a "secret" marker (the worker strips `secret`, `knows`, `revealOn` and `told` before sending).
- **Missing graphics** (the wishlist), folded.

### CAST (badge = proposals waiting)
- **Review** on top, inline: Approve, Edit (opens an edit box in place, not `prompt()`), Reject, each with a one-line reason field.
- **People**: a grid of cards with each person's colour (`INK`) and a small portrait from the hidden `/?builder` frame (as `/map` and `/events` already do), mood now, warmth with Ishai. Tap → a person sheet with tabs: Card (form fields for the card; JSON as an "advanced" toggle), Notes (pin / drop / live again, add), Facts, Pairs.
- **Map of pairs** (the canvas), bigger, tap a line to edit that pair.
- Keeper queue, log and errors folded at the bottom.

### WEEK (the schedule)
One agenda for the next 7 days, built like the TV guide (`guideDay()`): lectures, trivia, poker, cinema, gallery / concert nights, cooking and shopping, polls, plan beats, Shabbat. Each night opens into its own controls, so the separate boxes go away:
- Lecture → today's Course box (topic, write now, read before it airs, memory).
- Saturday → the Cinema box (pick, write, repeat, skip).
- Cooking day → the Kitchen box (recipe card, pick by name, skip).
- Tuesday → trivia: the questions and the result ahead of time (new; `/api/trivia` already exists), rebuild.
- Monday → poker: the night's summary (new; `/api/poker`).
- Wednesday → gallery or concert, with a link to `/events`.
- Outings planned today, read-only.

### MORE
- **Audience**: polls, surveys of the week, push alerts (test, how many devices).
- **Voices** (unchanged inside, moved here).
- **Health**: the useful parts of `/api/health` in plain words (usage, writers, drops, Gemini errors, cast, history, kitchen, cinema, trivia), the AI checks list, real world.
- **Tools**: big buttons for the live page, sandbox, builder, events, map.
- Sign out.

## The sub pages (sandbox, builder, events, map)

Today each is its own page with only a link back to `/director`, and the director page reaches them through a sentence of links.
- **One shared top bar on all five pages**: the director tabs and the tools in one row, `NOW · STORY · CAST · WEEK · MORE │ Sandbox · Builder · Events · Map`, the current one lit. On a tool page the director tabs open `/director#<tab>`. Written once and put into every page by the build at a marker, like `/*__VOICES_JS__*/` (`/*__DIR_BAR__*/`; the build fails without it).
- **The status line** (where Ishai is, the AI chips, the ⚠ count) shows on the tools too, from the same once-a-minute refresh.
- **Links from inside the director tabs**: a Wednesday on WEEK opens that night on `/events`; a place named on NOW or STORY opens its card on `/map`; the film, trivia and poker nights get "preview in sandbox".
- **The tools' insides stay as they are.** The sandbox and the builder are work screens best used on a computer; only fix what breaks on a phone. The events page may get the same treatment later, outside this plan.

## How to build it

All in `director.html`; nothing changes for viewers.
- Tabs with hash routing (`#now`, `#story`, `#cast`, `#week`, `#more`), so a link or a refresh opens the same tab. Only the visible tab renders.
- Keep the existing element ids and render functions (`renderCourse()`, `renderCinema()`, `renderKitchen()`, `renderPolls()`, `renderSurveys()`, `renderVoices()`, `cxLoad()`), just moved into the tabs; split today's big `render()` into `renderNow()`, `renderStory()` etc.
- Help paragraphs become an ⓘ that opens the text.
- Cast: replace `prompt()` / `alert()` with inline edit rows and a small toast for messages.
- CSS: the tab row sits on top on every screen and scrolls sideways if it doesn't fit; over 1000 px the content gets two columns.

Worker (small):
- `directorView()` adds `status` (where, action, with, story clock), `health` (the slices of `/api/health` above, read from the state already loaded), `recent` (last 5 moments), `comingUp`, `plan` (today's beats, hook, previously, arcs without any secret fields), `inbox` counts.
- New director actions: `fix` ({endScene, note, minutes, unstick}) through `applyFix()`; `triviaRebuild` (optional).
- No new KV writes, no AI calls.

## Steps
1. Shell: status bar, tabs on top, routing, the once-a-minute refresh, Tools, and the shared bar on the sandbox, builder, events and map pages; move the boxes into tabs unchanged.
2. NOW: inbox, scene + recent moments, quick actions (`fix`), coming up.
3. STORY: the short goal form, today's plan.
4. CAST: inline review, people grid with portraits, person sheet with a card form.
5. WEEK: the agenda, with the Course, Cinema and Kitchen boxes inside it, trivia and poker added.
6. MORE → Health in plain words.

Each step ships on its own (bump `VERSION`), and nothing is removed until its new place works.

## Decided (2026-11-16)
- Refresh once a minute (only while the page is visible).
- Tabs on top, on the phone too.
- No live picture on the director page.
- Plan secrets stay off the director page entirely.
- No extra quick actions on NOW for now: Run next moment, End this scene, Give a note, Unstick.
- The sub pages get the shared top bar and status line in step 1; their insides stay as they are.
- Every box opens and closes on a tap of its title and is closed when the page opens; on NOW the box stays open and its parts (waiting for you, the scene now, quick buttons, coming up) open and close, with counts in their titles.

## Built
- Step 2 (NOW): v253. Step 1 (the shell, the shared bar, refresh, collapsing): v254.
