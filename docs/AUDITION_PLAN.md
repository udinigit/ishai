# Auditions: viewers' own characters join the show (plan)

Proposed 2026-11-16 from the director's idea, updated the same day with the director's answers (see "Decisions"). Nothing built yet. It builds on `docs/CAST_PLAN.md` (cards, notes and pairs in D1, the scene keeper, Claude's reviews), which is built (v252), so this can start from its own step 1.

## The idea
A signed-in viewer makes an avatar. They can ask for an Audition once a month. If the director agrees, they get one long interview about a character of their own: name, past, family, work, hobbies, personality, how they talk, what they want and fear.

From the answers the AI writes a full character card, and Claude suggests how the character fits into Ishai's world (works at the café, studies at the university, an old friend of Tomer's...). Claude reviews the card, and the director approves it by hand.

The viewer is told when and how their character will first appear and accepts. From then on the character is an actor like any other: the show writes them, the viewer watches. They can quit; the character then gets a last appearance within 7 days, and the viewer may audition again 30 days later.

## Decisions (the director, 2026-11-16)
- **No email.** Notifications are web push and the inbox only; we keep storing no addresses.
- **Yes to a "from the audience" tag** on a member character's Cast card.
- **No arcs or secrets** for member characters for now.
- **Follow-up questions:** every specific answer about hobbies, education, work and the like opens follow-up questions about it, so no two characters come out the same (see "Follow-ups").

## The button (one per account, in the 👤 dialog and on the Cast tab)
The button's state is kept in D1 (`member.state`) and moves in this order:

| State | Button | What happens |
|---|---|---|
| `none` | **Request an Audition** | Allowed when the last request was more than 30 days ago (`AUD_EVERY_D`), the account has an avatar, and the 18+ box is ticked. |
| `requested` | **Audition requested** (disabled) | The request waits on the director page. A decision is pushed to the viewer. |
| `declined` | **Request an Audition** (disabled until the 30 days are up, showing the date) | The director's short reason is shown, if they gave one. |
| `approved` | **Audition** | Opens the Audition page. The approval lasts 14 days; unused, it goes back to `none` (the month still counts). |
| `interview` | **Continue your Audition** | Answers are saved one by one. Open for 7 days from the start. |
| `submitted` | **In review** (disabled) | The card is being written, reviewed by Claude, then approved by the director. |
| `offered` | **See your role** | The role and the first appearance. **Accept** or **Decline** within 7 days. |
| `on` | **Quit show** | The character is in the show. |
| `leaving` | **Leaving the show** (disabled) | The last appearance is booked within 7 days, with its time. |
| `left` | **Request an Audition** (disabled until 30 days after leaving) | |

Ending the interview unfinished, rejection at review, or declining the role all count as that month's Audition.

## The avatar (every signed-in viewer)
- Made from the show's own looks (`LOOK_OPTS`: hair, colours, skin, top, bottoms, hat, extras), so only safe, known options exist. **Random** fills it in. **From a photo** uses `lookFromPhoto()` in the viewer's own browser; the photo never leaves it.
- Kept in D1 as part of the member's row and shown in the 👤 dialog. It is the starting look of their Audition character (they can change it there).
- One avatar per account.

## Signing in and contact
- **Sign-in** is the Google sign-in we already have. The member row is keyed by the same hashed account number as the votes (`voterOf()`).
- **Notifications** use the web push we already have (the bell), plus an inbox in the 👤 dialog that shows every message (request decided, role offered, first appearance, character on screen now, last appearance).
- **No email** (the director's decision): we keep storing no addresses, as `/privacy` says today.

## Naming the character (safe)
Recommended: **pick one of three, or type your own for the director to check.**
- **Pick one of three:** three first names that fit the show (a list of Israeli and international first names in `story/audition.json`), each with an optional nickname. **Shuffle** gives three more, up to 10 times. Never the same as a cast member, past cast member or local.
- **Type your own:** first name only, plus an optional nickname, no surname. 2-14 letters, Latin or Hebrew, no digits or links.
  - It is checked against a list of blocked words, the cast and a short list of famous names.
  - It is always shown to the director, who may change it at approval.
- **Not from the email.** It would tie the character to the person and could reveal who they are.
- **The surname** is given by the show at approval, from the same name list.

## The interview
- **Before it starts,** a screen says:
  - it takes about 30-40 minutes;
  - it can be paused and continued for 7 days;
  - **it can be taken only once** for this Audition, and the answers can't be restarted;
  - the questions are about the character, not about you, so please don't use real details about yourself or anyone you know;
  - what happens next (Claude's review, the director's approval, the offer).

  **Start** asks once more.
- **Form:** about 80 questions, one per screen, with a progress bar and the section name. About 70 are choices (one, several, a scale, "pick the closest") and about 10 are short written answers (up to 200 characters each).
  - Back is allowed within a section.
  - Each answer is saved at once (`aud_answer`), so a closed tab or a new phone carries on where it left off.
- **Branching:** answers open or skip questions. Age decides school vs. work-life questions. "Has children" opens the children questions. "Moved to Tel Aviv" asks from where and why.
- **Follow-ups:** the specific answers get their own questions. They are what make a character feel like a real person and not a list of types (see "Follow-ups").
- **Never asked:** politics, sexual content, real addresses, real names, the user's own health, anything about real people. Religion only as lightly as the show already has it (Shabbat, holidays).

### The question bank (`story/audition.json`, about 320 questions)
Each question has: `id`, `section`, `type` (`one`, `many`, `scale`, `text`), `q`, `options`, `if` (when to ask it), `to` (which card field it feeds) and `weight` (how often it's drawn). Every interview draws about 80 from the sections below, with the required ones always in.

| Section | Example questions | About |
|---|---|---|
| **Basics** | age (20-75, in bands), how they'd describe themselves in three words, where they grew up, how long in Tel Aviv | 15 |
| **Family and childhood** | siblings and their place among them, a childhood memory that shaped them, parents now, a family tradition | 30 |
| **Education** | how far they went, what they studied, a teacher who mattered, would they go back | 20 |
| **Work and money** | what kind of work they'd like (a hint for Claude's role), work style, spender or saver, a work story they tell | 30 |
| **Love and status** | single / together / married / divorced / widowed, how they met, what they look for, how they handle a break-up | 25 |
| **Home and routine** | morning or night person, how their place looks, what's in the fridge, a weekly ritual | 25 |
| **Hobbies and taste** | hobbies, music, food, sport (watching or doing), the place in town they'd love (from the map) | 35 |
| **Personality** | scales for openness, order, sociability, warmth, worry; plus 15 small situations ("a friend cancels an hour before...", "you find a wallet...", "someone cuts in line...") | 50 |
| **Moods** | what makes them angry, sad, nervous or happy, and how they show it (feeds the card's `moods`) | 25 |
| **Talk** | how they speak (fast, slow, formal, jokes, swears mildly...), a phrase they say a lot, topics they love and avoid | 20 |
| **Inside** | what they want this year and in life, their biggest fear, what they're proud of, a small secret (fictional) | 25 |
| **The world** | how they might know someone in the show (picked from the cast: "never met anyone", "a neighbour of", "studied with"...; a wish for Claude, not a promise), what they'd think of Ishai at first sight | 20 |

### Follow-ups: the details that make a character their own
A general answer ("hobbies: music") makes a general character. So every answer that names something specific opens 2-4 follow-up questions about **that thing**. They are drawn from a follow-up set for it in the bank (`follow` on the option, e.g. `music → [fu.music.*]`), and the most telling are shown first.

| The answer | Follow-ups (examples) |
|---|---|
| **A hobby** (music, cooking, running, chess, gardening, photography, gaming, sewing, birdwatching...) | How did it start, and who got them into it? How good are they, honestly? What exactly (an instrument and a style; a dish they're known for; a distance and a best time; a favourite opening)? Where and when do they do it in town? A thing they own for it that matters to them? A small embarrassing moment with it? |
| **Education** (a degree, a trade school, the army, self-taught, dropped out) | Which subject, and why that one? A teacher, a classmate or a moment they still think about? Did they finish? What did they really learn there? Would they go back? |
| **Work and the job they want** | What did they do before? Their worst job ever, and what happened? What they're secretly good at? Who they look up to at work? What they'd do if money didn't matter? |
| **Family** | Brothers and sisters: names (fictional, chosen from a list), ages, close or not? A parent they're like, and in what? A family saying or dish? An old argument that never got settled? |
| **Love and status** | How long? How did it begin or end? What do friends say about it? Something they'd never forgive? |
| **Where they grew up** | Their street or village? The smell or sound of it? A friend from there they still call? Why they left? |
| **Moods** | The last time they were really angry, at what? What calms them? Who sees them cry? |
| **Talk** | The phrase they say a lot: when, and to whom? A word they overuse? Topics they could talk about for hours? |
| **Inside** | Why that fear? What would make them proud? The small secret: who almost found out? |
| **The world** | Which place in town and why? What would they order at Café Nahat? Their first impression of Ishai, and what would change it? |

- **Mixing:** with two hobbies, each gets at least one follow-up. Then the "chooser" picks the rest by `weight` and by what is still thin in the answers, so every interview differs.
- **Choices first:** most follow-ups are choices, plus a "something else" with a short line. About a third of the 10 written answers are spent here, where they count most.
- **The total stays about 80 questions** (about 50 main ones, about 30 follow-ups) and 30-40 minutes. The progress bar counts the follow-ups as they come, so it never jumps back.
- **In the card:** follow-up answers become the card's concrete details: a fact list (`cast_fact`: "plays the oud, badly, since 14"), habits, the sample lines, and a few starting notes (importance 3, in the character's own voice), so the scene keeper and the writer have real things to use from day one.
- **The bank:** each of the about 40 hobbies, 15 kinds of schooling, 25 kinds of work and the family / love / home answers gets a follow-up set of 4-8 questions. This adds about 200 follow-up questions to the bank's 320, all written by Claude in step 3.

The bank is written once by Claude in the build step. The director can edit it, and Claude reviews any change.

## From answers to a character
- **One Gemini call** (story model, strict JSON) gets the answers, wrapped as data, never as instructions, with the free-text answers cleaned first: links stripped, length capped, blocked words removed. It writes:
  - a **full card** in `CAST_PLAN.md`'s format (backstory, inside, habits, talk with sample lines, moods with `say` and `body`, a fictional secret), with the avatar's look and the chosen name;
  - **three ways in:** each one a role (works at an existing place: the café, the market, the gym, the kiosk at night, The Big S's stores; a student at the university; a new neighbour in Ishai's building; a regular at the bar) and a link (friend of, cousin of, studied with, neighbour of an existing character). Each comes with the first scene ("Dana introduces her cousin, who's covering Fridays at the café") and how often they'd appear.
- `cleanCard()` keeps only known fields and values (`LOOK`, the place list, cast ids). The world never changes for them: a new place or a new job type is the director's to build.
- **Claude's review:** the same weekly-or-sooner scheduled session as the cast growth (`/api/cast/pending`) checks the card and the three ways in against:
  - the answers (nothing made up against them);
  - the show's rules (realistic, no real brands, no real people, drama limits);
  - the cast (no copy of an existing character).

  It approves, edits or rejects with a reason, and marks the way in it recommends.
- **The director** (Auditions box) reads the answers, the card, Claude's review and the three ways in. They pick one way in, may edit anything (name included), and **approve** or **reject** with an optional reason for the viewer.

## The offer and the first appearance
- **On the director's approval** the viewer gets a push and an inbox message: "Your character **Maya Levinson** is joining Watching Ishai as a barista at Café Nahat, a cousin of Dana's. First appearance: a Friday morning in the next two weeks."
  - The role page shows the card's public side and the look.
  - It also explains what they don't control: what happens, who the character becomes, when they appear. The show writes all of it and Claude reviews any growth.
  - **Accept** / **Decline** within 7 days.
- **On Accept** the character joins the cast (`cast_card` with `owner` = the member, plus `SEED_CAST`-like hangouts, voice gender from the answers, an `INK` colour from `INK_MORE`). The first scene is booked as a goal (`aud-<id>`, like a survey winner's `surveyGoal()`, in the next free gap within 14 days). The viewer gets the exact time the day before and again 10 minutes before (push).

## On the show
- **How often:** a member character is a regular in their place and appears like any regular, plus a booked scene with Ishai about every 4-7 days. `MEMBER_MAX` (start with 6) member characters at once; past it, approved Auditions wait in line, and the viewer sees their place.
- **The owner sees** their character's card and its "With Ishai" history in the Cast tab (like everyone), plus a ★ MY CHARACTER badge. An optional push says "Maya is on now", at most twice a day.
- **The owner can't steer it.** No editing, no lines, no requests. Growth goes through Claude's weekly review like everyone's.
- **Viewers** see the character like any cast member, with a small **FROM THE AUDIENCE** tag on their Cast card (never who the viewer is).
- **No arcs or secrets** for member characters for now: the planner and the arcs leave them out, and they are never named in an arc's `knows`.

## Quitting
- **Quit show** asks for confirmation, then books a last appearance within 7 days: a goodbye fitting the role (a job in another city, studying abroad, moving in with family; never a death, by the drama limits). The viewer gets its time.
- **After it** the character leaves the cast. Its card is archived (`state: left`), so old episodes, notes and other people's memories of them still make sense. The others may mention them now and then.
- **The interview answers are deleted** 30 days after leaving. The archived card stays, as part of the show's history.
- **Again:** a new Audition can be requested 30 days after the last appearance.
- **The director** can also end a member character at any time: the same goodbye, or straight away for abuse, with a ban on new Auditions (`member.banned`).

## What we keep (D1)
- `member (id PRIMARY KEY, avatar TEXT, state TEXT, asked INTEGER, decided INTEGER, started INTEGER, left INTEGER, banned INTEGER, adult INTEGER, at INTEGER)`: `id` is the hashed account number from `voterOf()`.
- `aud (n INTEGER PRIMARY KEY, member TEXT, state TEXT, name TEXT, bank_v INTEGER, picked TEXT, card TEXT, ways TEXT, review TEXT, director TEXT, cast_id TEXT, at INTEGER)`: one per Audition.
- `aud_answer (aud INTEGER, q TEXT, a TEXT, at INTEGER, PRIMARY KEY (aud, q))`.
- `member_inbox (n INTEGER PRIMARY KEY, member TEXT, at INTEGER, kind TEXT, text TEXT, read INTEGER)`.

No KV writes. A whole interview is about 80 small D1 writes.

## Safety and privacy
- **Age:** a box saying "I'm 18 or older" is needed to request an Audition. The interview is long, personal in style, and its answers go to an AI.
- **About the character, not the person:** every question says "your character". The start screen asks for no real details about yourself or anyone you know.
- **Free text:** short, cleaned, and never followed as instructions: the generator prompt says the answers are a viewer's description to draw from. The card is checked field by field (`cleanCard()`), reviewed by Claude and approved by the director before anyone sees it.
- **No contact between viewers:** nobody sees who owns a character.
- **`/privacy`** gets a section on what an Audition keeps (the hashed account, the avatar, the answers until 30 days after leaving, the card in the show's history) and how to ask for deletion.
- **Limits:** one character per account, one Audition request a month, `MEMBER_MAX` at once, a queue for approved ones.

## Director page (the Auditions box, under the new tabs)
- **Requests:** avatar, account age, past Auditions; approve or decline, with an optional reason.
- **In interview:** progress and days left.
- **To approve:** the answers, the card, Claude's review, the three ways in; edit, pick, approve or reject.
- **Offered:** waiting for the viewer, days left.
- **On the show:** each member character, the next booked scene, end it.
- **Leaving:** the last appearance's time.
- **Banned accounts.**

## Cost
- **Per Audition:** 1 Gemini call (the card and the three ways in) and one item in Claude's review.
- **Writing the bank:** done once at build time; no running cost.
- **On the show:** member characters cost what any cast member costs (their scenes go through the scene keeper of `CAST_PLAN.md`). `MEMBER_MAX` keeps the total small.
- **Push:** uses the existing system and its per-run batch.

## Steps
0. **Done:** the deeper characters of `CAST_PLAN.md` (v252): cards and notes in D1, the scene keeper, what the writer gets, full cards with Claude's review.
1. **Members and avatars:** the `member` table, the avatar editor in the 👤 dialog, the inbox, the 18+ box.
2. **Requests:** the button and its states, the 30-day rule, the director's Requests box, the pushes.
3. **The interview:** `story/audition.json` (the bank and its follow-up sets, written by Claude), naming, the start screen, the interview page with saving, branching and the 7-day window.
4. **The character:** the card and three ways in from one Gemini call, Claude's review, the director's To approve box.
5. **The offer and the debut:** the role page, Accept/Decline, joining the cast, the booked first scene, the reminders.
6. **On the show and quitting:** regular appearances, ★ MY CHARACTER, "on now" pushes, Quit show, the goodbye scene, archiving, deleting answers, the 30-day rule, the director's end and ban.

## Open questions
- `MEMBER_MAX`: 6 at once to start?
