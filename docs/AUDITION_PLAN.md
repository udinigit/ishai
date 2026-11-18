# Auditions: viewers' own characters join the show (plan)

Proposed 2026-11-16 from the director's idea, updated the same day with the director's answers (see "Decisions"). Steps 1-3 built in v264-v266 (see "As built" at the end). It builds on `docs/CAST_PLAN.md` (cards, notes and pairs in D1, the scene keeper, Claude's reviews), which is built (v252), so this can start from its own step 1.

## The idea
A signed-in viewer makes an avatar. They can ask for an Audition once a month. If the director agrees, they get one long interview about a character of their own: name, past, family, work, hobbies, personality, how they talk, what they want and fear.

From the answers the AI writes a full character card, and Claude suggests how the character fits into Ishai's world (works at the café, studies at the university, an old friend of Tomer's...). Claude reviews the card, and the director approves it by hand.

The viewer is told when and how their character will first appear and accepts. From then on the character is an actor like any other: the show writes them, the viewer watches. They can quit; the character then gets a last appearance within 7 days, and the viewer may audition again 30 days later.

## Decisions (the director, 2026-11-16)
- **No email.** Notifications are web push and the inbox only; we keep storing no addresses.
- **Yes to a "from the audience" tag** on a member character's Cast card.
- **No arcs or secrets** for member characters for now.
- **Follow-up questions:** every specific answer about hobbies, education, work and the like opens follow-up questions about it, so no two characters come out the same (see "Follow-ups").
- **A table read before the debut:** after Accept, the viewer rehearses the first scene with a stand-in for Ishai, picking their character's lines from choices on a timer. It is only for fine-tuning: it never happens in the story (the character hasn't met Ishai), and every choice fits the interview's personality, differing by degree and kind (levels and types of sarcasm, say) (see "The table read").
- **At most 6 member characters at once** (`MEMBER_MAX` = 6) to start; approved Auditions past that wait in line.
- **One or two wild cards:** odd, random-feeling questions with many possible answers, which may be written by the AI, to give each character something nobody else has (see "Wild cards").
- **(2026-11-18) The table read is about the role.** It rehearses the character doing the job they were offered (a waiter takes orders, deals with a complaint, recommends a dish), and it tunes how they act in that role, built on the personality from the interview (see "The table read").
- **(2026-11-18) The director gives a final green light** after everything is set (the card, the role, the accepted offer, the table read and its tuning). Nothing goes on the show without it (see "The green light").
- **(2026-11-18) The director can test every step alone:** a test Audition of their own runs the real code from the request to the green light, and never reaches the show (see "Testing it yourself").

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
| `reading` | **Table read** | Accepted. The rehearsal of the role is ready (see "The table read"); open for 5 days. |
| `greenlight` | **Waiting for the green light** (disabled) | The tuned card waits for the director's final green light (see "The green light"). |
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
- **Form:** about 80 questions, one per screen, with a progress bar and the section name. All are choices (one, several, a scale, "pick the closest"); since v269 there is no "something else" either. **(2026-11-18, the director's choice) No written answers:** v268 turned the 8 written questions into choices.
- **The casting room (v268):** the interview happens in a room, not on a form. At the top of the Audition page the show's own art draws Ruti Kaspi, the casting director (fictional, never part of the story), at her table in the 8bitTV casting room, with a camera on a tripod and a tape mark; the character, in the look from THE LOOK, walks in through the door when the interview starts, and Ruti asks each question, listens, nods and writes after the answer, holds up a card for a wild card, and the character walks out after SEND.
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
- **The total stays about 80 questions** (about 50 main ones, about 30 follow-ups, plus 1-2 wild cards) and 30-40 minutes. The progress bar counts the follow-ups as they come, so it never jumps back.
- **In the card:** follow-up answers become the card's concrete details: a fact list (`cast_fact`: "plays the oud, badly, since 14"), habits, the sample lines, and a few starting notes (importance 3, in the character's own voice), so the scene keeper and the writer have real things to use from day one.
- **The bank:** each of the about 40 hobbies, 15 kinds of schooling, 25 kinds of work and the family / love / home answers gets a follow-up set of 4-8 questions. This adds about 200 follow-up questions to the bank's 320, all written by Claude in step 3.

### Wild cards: one or two questions out of nowhere
Every interview gets 1 or 2 questions that feel random, with many answers to pick from. Their only job is to give the character one odd, specific thing of their own. They come at a surprising point (one in the first half, one near the end), never two in a row, and are marked with a small 🃏.

- **Where they come from:**
  - **AI-written, per interview:** when the interview starts, one small Gemini call writes 2 fresh wild cards (question plus 10-14 answers each). It sees only the character's age band and first section answers, never the free text, so it can lean on what's there ("a 60-year-old ex-sailor: what does he keep in his left pocket?"). The bank's wild cards are the fallback when Gemini is busy or a question fails the check.
  - **The bank:** about 60 wild cards written by Claude, each with 12-16 answers, so even without AI they rarely repeat (`s.audWild` remembers the last 200 used).
- **Examples** (each with many answers, plus "something else" with a short line):
  - What's always in their left pocket? (a guitar pick, a bus ticket from 2009, a single dice, a lemon sweet, their grandmother's ring, a folded receipt they never throw away, a tiny screwdriver, nothing, it has a hole...)
  - If they had to be a smell, which one? (fresh bread, rain on asphalt, a new book, a hospital, sunscreen, an old cinema, fried onions, cut grass...)
  - What would they save first from a fire after the people? (a box of letters, the cat's bowl, a cassette, a plant called Ezra, a ruined sweater...)
  - Which animal do strangers say they look like? · What did they collect at age 10? · The song they'd want playing in a lift with Ishai? · What do they do with the last bite of anything? · A thing they believe that has no proof?
- **Safety:** the AI's questions and answers go through the same check as the card's text: short, no real people or brands, nothing sexual, political or about the viewer, and only from the allowed answer types (one, many, "something else"). A failed one is swapped for a bank wild card. The free-text "something else" answer is cleaned like any other.
- **In the card:** the answer becomes a quirk, a fact (`cast_fact`, e.g. "left pocket" → "a bus ticket from 2009") and, where it fits, a small `tell` or a sample line. Claude's review checks it stays charming, not silly.
- **Cost:** at most 1 extra small Gemini call per Audition.

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
- **On Accept** the table read opens (next section); the button reads **Table read**. Nothing joins the cast yet.
- **After the table read** (or once its 5 days pass) and Claude's review of the tuning, the character waits for the director's **green light** (see below). Only then does the character join the cast (`cast_card` with `owner` = the member, plus `SEED_CAST`-like hangouts, voice gender from the answers, an `INK` colour from `INK_MORE`) and the first scene get booked as a goal (`aud-<id>`, like a survey winner's `surveyGoal()`, in the next free gap within 14 days). The viewer gets the exact time the day before and again 10 minutes before (push).

## The table read (after Accept, before the green light)
A rehearsal of the character **in the role they were offered**, on the real set where they'll work, with a stand-in playing Ishai. It tunes two things: who they are (the personality dials below) and **how they do this job**, built on that personality. A waiter character rehearses being a waiter: greeting a table, taking an order, recommending something, handling a complaint, a quiet moment with a colleague. A shy, warm character is offered shy, warm ways of being a waiter; a sarcastic one, kinds of sarcastic waiter. The tuned result is the card's `atWork` part, which the writer gets whenever the character is at their post.

### The role's situations (`story/audition.json` → `roles`)
Each way in has a role kind, and each role kind has a small set of work situations the script draws 4-5 from, the dials of how the job is done, and its `uniform` (what the character wears there, from the show's look options):

| Role kind | Situations (examples) | How they do it (role dials) |
|---|---|---|
| **Waiter / barista** (Café Nahat, the food court, The Black Candle) | greeting a table, taking an order, the regular's usual, recommending, a wrong order, the bill, a rush hour, a slow afternoon with the boss | service style (formal · friendly · chatty · brisk), pace, how they recommend, how they take a complaint, small talk |
| **Market vendor / stall** (Shuk Shalom) | calling out to passers-by, haggling, a regular, a tourist, a bad batch, closing time | selling style (shouting · charming · honest · pushy), haggling, regulars |
| **Shop clerk** (Everything Else, The Big S, the little shops) | helping someone find a thing, a return, a long queue, a shoplifting suspicion, a slow hour | helpfulness, patience, rules vs. bending them |
| **Kiosk night clerk** | a late customer, a regular, backgammon, a drunk, the lottery | night manner, chattiness, toughness |
| **Gym staff / trainer** (Herzl Gym) | a first-timer, someone doing it wrong, a regular, closing the gym | coaching style (strict · cheerful · technical · lazy) |
| **Student** (Tel Herzl University) | before the lecture, a group project, asking a question in class, the courtyard break | how they study, speak up, help others |
| **Neighbour** (Ishai's building) | the stairs, borrowing something, a noise, the building committee | how neighbourly, nosy, helpful |
| **Bar regular** (The Black Candle) | ordering, the football on TV, a stranger at the bar, last call | how they hold the bar, how social |

The bank also lists, per role kind, the jargon and props the show can draw (an order pad, a coffee machine, a scale at the stall). A role kind not in the list (a new job the director builds) gets its own row first. It is **not something that happens to the character**: in the story she hasn't met Ishai yet, and nothing from the table read becomes a memory, a note or a plan for the first scene. Its job is to **fine-tune the character**: the viewer picks their character's lines, and every choice they're offered already fits the personality from the interview, differing only by a little (how much, and what kind). The picks set where on each scale the character really sits.

- **When:** from Accept, for 5 days (`reading`). Once only, about 5-8 minutes; the page says so before it starts, and that it can't be repeated.
- **What gets tuned (the dials):** from the card **and the role**, one Gemini call picks 3-4 personality dials (the traits that most define this character and are still vague) and 3-4 role dials (from the role kind's list above), and turns each into a dial with 3-4 settings, every setting inside the personality from the interview.
  - **Sarcastic:** a dry aside · a playful tease · a sharp jab · sarcasm at their own expense.
  - **Warm:** quietly kind · openly friendly · fussing over people.
  - **Nervous:** a short, careful answer · talks too much · a joke to cover it.
  - **Blunt, curious, proud, shy, a talker…:** the same idea, levels and kinds.

  Never a choice that breaks the interview's personality: a shy character never gets a loud, bold line, only kinds and degrees of shy.
- **The script:** the same call writes the rehearsal around the dials.
  - It gets the card, Ishai's card, the chosen way in, the role kind's situations and the place.
  - It writes a short working shift of 4-5 of the role's situations, about 8-10 turns. The stand-in plays Ishai as a customer (or classmate, neighbour, fellow regular) in some of them, and the other parts (another customer, the boss) are nameless extras. Each of the character's 6-8 turns tests one dial, with **3-4 choices**: lines (and sometimes a small action, "hands him the menu") that say the same thing at that dial's different settings.
  - After each choice the stand-in has his own short answer to it, and the scene then comes back to the same next beat, so the script stays one small tree.
  - The script is checked like the card (`cleanCard()` rules: short, in the world, no real people or brands, and each choice inside the trait it tests).
- **The stage:** the real place where the character will work (the café for a barista, the stall at Shuk Shalom for a vendor...), drawn by the show's own code in a private rehearsal view (`/?read`, only for that member; no live feed, nothing saved to the show; built on the sandbox's `ingest()`).
  - **In character (2026-11-18):** the character wears what they will wear in the role, from the role kind's `uniform` in the bank (a barista's apron, a vendor's apron and cap, the gym's staff polo, the kiosk's night jacket, a student's backpack...), over the look from the Audition, and stands at the role's post (behind the counter, at the stall). The card keeps this as the character's `workLook`, used on the show whenever they are at their post.
  - A **TABLE READ** banner and a director's chair in the corner, so it reads as a rehearsal, not the show.
  - The stand-in looks like Ishai but in a grey hoodie with a **STAND-IN** tag over his head, so nobody mistakes him for Ishai.
  - The scene plays with the live-talk timing, body language and device voices.
- **Choosing:** at the character's turn the choices appear under the picture with a countdown, **20 seconds** (`READ_SEC`).
  - The picked line is said in the character's voice, with the matching body language.
  - **No pick in time: the character chooses for themselves:** the setting the card already points to (`self`). It is shown as "MAYA CHOSE", and that dial stays where the card had it.
  - The viewer can't go back; there is a ⏸ pause (once, up to 2 minutes).
- **Fine-tuning:** at the end, one Gemini call turns the picks into small card changes:
  - the dial settings, kept on the card as `dials` (e.g. `sarcasm: {level: 2, kind: "dry"}`), which the writer gets with the card;
  - the card's **`atWork`**: how they do this job (service style, pace, how they handle a complaint, a line they say to every customer, a small work habit), which the writer gets whenever the character is at their post;
  - sample lines in the picked style, replacing the most generic ones;
  - the mood `say` lines touched by a dial (angry and sarcastic: "goes dry and very polite").

  The changes go to `cast_pending` and through Claude's review like any growth. Claude checks every change stays inside the interview's personality. The director isn't asked again, but sees them in the Auditions box. A viewer who lets every turn time out tunes nothing: the card stays as approved.
- **Not part of the story:** no notes, facts, memories, moods or plans come from the table read. The real debut is written live, as always, from the tuned card alone. Ishai is the real Ishai, and they meet for the first time there.
- **Skipped** (the viewer never opens it in the 5 days): the card goes to the green light as approved, with an `atWork` written from the card and the role alone. The inbox says the table read was missed.
- **Afterwards:** the viewer can replay their table read (read only) from the role page. After the debut, a link to how the real first meeting went in 8bitTV+.

## The green light (the director's last word)
After everything is set, nothing goes on the show until the director says so.
- **When:** once the table read's tuning has passed Claude's review (or the table read was skipped), the member's state is `greenlight` and the Auditions box shows the character under **Ready for the green light**.
- **What the director sees:** the final card (with `dials` and `atWork`), the look, the role and way in, Claude's notes, the table read (replayable), and the proposed first scene with the free slots for it.
- **GREEN LIGHT:** the character joins the cast, the first scene is booked (the director may pick the slot), and the viewer is told the time (inbox and push).
- **Not yet:** back with a note (for example "redo the tuning", "different first scene"); or **Stop**, with an optional reason for the viewer, which ends the Audition (it counts as that month's).

## Testing it yourself (the director's test Audition)
- The Auditions box has **🧪 Try an Audition yourself**: it makes (or resets) a test member, already approved, and opens `/audition?test=1` in a new tab. Built in v266 for the interview; every later step keeps this path working.
- The test runs the real code and tables under the member id `t-director`, so what the director sees is what a viewer gets; the page carries a TEST AUDITION banner. It needs no Google sign-in (the director's cookie is enough) and never counts in `MEMBER_MAX`, the request rules or the viewers' lists.
- **In the later steps** the test goes on the same way: the director's test gets its card, Claude's review, the offer on its role page (`?test=1`), the table read (`/?read&test=1`) and the green light. A test character **never joins the cast**: at the green light the box shows what would be booked, and stops there.
- Starting a fresh test deletes the old one with its answers.

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
- `aud_read (aud INTEGER PRIMARY KEY, script TEXT, picks TEXT, started INTEGER, done INTEGER, tuned INTEGER)`: the table read's script, each pick ({turn, choice, ms, self}) and whether the tune was proposed.

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
- **Per Audition:** 1 Gemini call (the card and the three ways in), at most 1 small one for the wild cards, 2 for the table read (the script and the tune), and two items in Claude's review.
- **Writing the bank:** done once at build time; no running cost.
- **On the show:** member characters cost what any cast member costs (their scenes go through the scene keeper of `CAST_PLAN.md`). `MEMBER_MAX` keeps the total small.
- **Push:** uses the existing system and its per-run batch.

## Steps
0. **Done:** the deeper characters of `CAST_PLAN.md` (v252): cards and notes in D1, the scene keeper, what the writer gets, full cards with Claude's review.
1. **Done (v264): Members and avatars:** the `member` table, the avatar editor in the 👤 dialog, the inbox, the 18+ box.
2. **Done (v264): Requests:** the button and its states, the 30-day rule, the director's Requests box, the pushes.
3. **Done (v265): The interview:** `story/audition.json` (the bank, its follow-up sets and the wild cards, written by Claude), the AI wild cards, naming, the start screen, the interview page with saving, branching and the 7-day window.
4. **Done (v270): The character:** the card and three ways in from one Gemini call, Claude's review, the director's To approve box.
5. **Done (v270): The offer:** the role page, Accept/Decline (joining the cast and the booking move to the green light, 5c).
5b. **Done (v271): The table read:** the role kinds and their situations in the bank, the dials and script call (personality and role dials), the `/?read` stage at the role's place with the stand-in, the timed choices and "chose for themselves", the tune call (`dials`, `atWork`, sample lines, mood lines) through Claude's review, the replay.
5c. **Done (v271): The green light:** the Ready box, GREEN LIGHT / Not yet / Stop, joining the cast and booking the first scene only then, the viewer's notice.
- **Every step:** the director's test path (`?test=1`) through that step, never joining the cast.
6. **Done (v272): On the show and quitting:** regular appearances, ★ MY CHARACTER, "on now" pushes, Quit show, the goodbye scene, archiving, deleting answers, the 30-day rule, the director's end and ban.

## Open questions
- None for now.

## As built (v264, steps 1-2)
- **Worker** (the "Auditions" section at the end of `worker.template.js`): D1 tables `member` (as planned, with `left_at` for `left`, which SQL reserves, and `note` for the director's reason), `member_inbox` (plus `push`: whether the message was pushed) and `member_dev` (member ↔ push device, at most 8 per member; a device belongs to the last account linked on it), made by `memberTables()`. A member row is made the first time the viewer saves something.
- **`/api/member`** (signed in only): GET → `member` (state, avatar, 18+, `canAsk` / `why`, `nextAt`, `approvedUntil`), `inbox` (last 40), `unread`. POST actions: `avatar` (`cleanLook()`), `adult`, `request` (`memberCan()`: not banned, avatar, 18+, 30 days since the last request and since leaving), `read`, `dev` (links the device's push subscription; the bell must be on), `delete` (avatar, messages and device links; only the request / leaving dates and a ban stay, for the rules).
- **Lapse:** an approval unused for 14 days (`AUD_APPROVE_D`) goes back to `none` when the member is next read, with an inbox message (`memberLapse()`).
- **`/api/member/dir`** (director): requests, the last 30 decided, banned accounts; POST `approve`, `decline` (optional reason the viewer sees), `ban`, `unban`. A decision writes an inbox message and pushes it straight away to the member's linked devices (`memberPush()`); `/api/alert` adds pushed inbox messages from the last 20 minutes for that device (`memberAlertItems()`). `dirStatus()` counts waiting requests (`waiting.auditions`, also on the CAST tab badge).
- **Page:** in the 👤 dialog when signed in (`memFill()`, state in `MBR`): the avatar (drawn by `portrait()`), selects for every look field, extras, 🎲 RANDOM, 📷 FROM A PHOTO (`lookFromPhoto()`, in the browser only), SAVE AVATAR; the 18+ box; the Audition button with each state's label and text; 🔔 NOTIFY ME ON THIS DEVICE (links the device); the INBOX (unread count as a dot on the 👤 button, checked every 10 minutes); DELETE MY AVATAR AND MESSAGES. The Cast tab has the same 🎭 button, which opens the dialog.
- **Director page:** the Auditions box at the top of the CAST tab (avatar, member since, dates, Approve / Decline / Ban in place), and requests in the NOW inbox.
- **Until step 3:** an approved viewer's AUDITION button only says the page is being built; the approval lapses after 14 days, so don't approve before step 3 ships.
- `/privacy` has an "Avatar and Auditions" paragraph.

## As built (v265, step 3: the interview)
- **The bank** (`story/audition.json`, built into the worker as `AUD_BANK`; since v266 written from `story/audition-src/*.txt` by `build_bank.py`, which also checks it): 329 main questions in the 12 sections (v265 had 120; 22 always asked) (each section's `n` = how many an interview draws; `req` ones always), 105 follow-up sets with 100 specific questions plus 28 generic templates per family (`generic.hob`, `place`, `edu`, `work`, `love`, `fam`, `music`, `food`; `{x}` is the set's `name`), 58 wild cards with 12-16 answers each, 60 + 60 first names, 18 nicknames, 60 surnames, blocked words and famous names. `$cast` in options becomes the cast's names at run time; the neighbourhood's places are written into the options. Each interview draws ~52; two interviews share about half of them. To change the bank, edit the .txt files and run `python3 story/audition-src/build_bank.py` (don't hand-edit the JSON).
- **Tables:** `aud` (one per approval: `state` naming → interview → submitted, or lapsed / expired; `name` {first, nick, gender, own, sur}; `picked` = the interview's list; `wild`; `shuffles`) and `aud_answer` (one row per answer, `q` = the item's key). `audTables()`.
- **`/api/aud`** (signed in): the page opens → an `aud` row in `naming`; `names` (three for the chosen gender, `audNames()`, never a cast name; Shuffle up to 10, counted), `check` (a typed name: `audNameWhy()`: 2-14 Latin or Hebrew letters, no blocked or famous names, not in the cast), `start` (once: the name, a surname from the list, the draw `audPick()`: per section the required plus a weighted draw, `if` sources added, in bank order; wild card 1 at 40%, 2 at 85%; member → `interview`), `answer` (checked against the options; "Something else" with a short line; text cleaned by `audClean()`: 200 characters, no links, emails or phone numbers, blocked words → …), Back (`?k=` an answered item in the same section), `submit` (member → `submitted`, an inbox message). Expired after 7 days (`audExpire()`: member back to `none`, the month counts).
- **Branching:** `audApplies()`: a main question with `if` [source, is, values] is asked only when it fits; follow-ups only while their parent's answer still names them. Changing an answer after Back replaces its follow-ups (and deletes their answers).
- **Follow-ups** (`audFollow()`): right after the answer, per named option (two hobbies each get theirs), the set's own questions first, then the family's templates; how many from what's left of `total` (80) after every question still planned, shared with the answers still to come that may open follow-ups, more for the answers that count most (`AUD_FU_PRIO`: hobbies, work, schooling, love, where they grew up, family); a template at most twice an interview; at most `AUD_TEXT_MAX` (10) written answers. A test run: 51 main, 22 follow-ups, 2 wild cards, 75 in all.
- **Wild cards:** two from the bank at the start, never one used in the last 100 Auditions (`audBankWild()`); when Basics is done, one Gemini call (`audAiWild()`, `AUD_WILD_SYS`, 9 s at most, only the Basics choices, never the written answers) may replace both, if neither has been answered and both pass `audWildOk()` (ends with ?, 10-14 answers under 45 characters, no "you", links, blocked or famous names); otherwise the bank's stay.
- **The page** `/audition` (`source/public/audition.html`, built in as `AUDITION_HTML`): BEFORE YOU START (time, 7 days, only once, about the character not you, what happens next), NAME YOUR CHARACTER (a woman / a man, three names with nicknames, Shuffle, or type your own with a live check), START with a confirmation; then one question per screen with the section, a progress bar (answered of about 80, it never goes back), the date it closes, the answer buttons (one, up to N, a 1-5 scale with its two ends, or a text box with a counter), "Something else" with a line, ← BACK within a section, NEXT (Enter works); the end screen (SEND ✓) and SENT. The 👤 dialog's button opens it (AUDITION / CONTINUE YOUR AUDITION with "n of about 80 answered, open until …").
- **Director:** the Auditions box lists the interviews (name, a typed name flagged for checking, viewer, answering or SENT, how many answered, open until) with their answers by section on tap (`/api/member/dir?aud=n`, follow-ups indented, wild cards marked, AI ones tagged). Writing the card from the answers is step 4. v266 adds the director's test Audition (see "Testing it yourself").
- **The look (v267):** the naming screen's THE LOOK card starts from the avatar and can change every part (with random and back to the avatar); it is saved with the name (`name.look`) and shown small during the questions and in the director's interview rows. Drawn by the show's own art through a hidden `/?looks` frame.
- **v269:** Ruti's hello (or welcome back), each question typed under the room, thank you at the end and "we'll let you know" after SEND; choices only, no "something else"; follow-up sets with `nogeneric` (every love status, dropping out, a teacher, between jobs, retired) get only their own questions, so a single is never asked how it began; the character stands still facing the camera on the mark; director page: the portrait no longer stretches, the Auditions box refreshes on CAST too, and a sent Audition waits in the NOW inbox.
- **v268:** no written answers (every question is choices, "something else" up to 60 characters, `AUD_OTHER_LEN`); the casting room at the top of the page (`/?casting`, see "The casting room"); hats hide the hair that would stick out (`hairUnder()`, for every character); looks being chosen are drawn on a mid grey (`LOOK_BG`) so black and white both show.
- **Deleting:** the 👤 dialog's delete removes Auditions that never started, lapsed or expired, with their answers. Deleting answers 30 days after a character leaves comes with step 6.

## As built (v270, steps 4-5: the character and the offer)
- **Role kinds** are in `story/audition-src/roles.json` (copied into the bank as `roles` by `build_bank.py`, which checks every place against `story/world.json` and every uniform against the look options): waiter / barista (café, food court, bar), market vendor, shop clerk (store, The Big S, the little shops), kiosk night clerk, gym staff, student, neighbour, bar regular; each with its job title per place, uniform, props, situations and dials (the last three for the table read), and the link words ("cousin", "old friend"...).
- **The card** (`audCardTick()` in the tick, or **Write it now** / **Write again** in the Auditions box): one AI call (Gemini first; it waits while Gemini is paused for the day) with the answers as data, the role kinds and the cast; the card goes through `castCardClean()` (no secrets: the director's decision), is refused when it mentions the show or cameras or a blocked or famous name, and comes with up to three ways in (role kind, place, a link to a drawn cast member, never Ishai, the first scene, how often). Three tries, then it waits for the director.
- **Claude's review** is part of the weekly cast review: `/api/cast/pending` lists `auditions` with the card, the ways and the answers; `/api/cast/review` takes `auditions` verdicts with the recommended way (and a corrected card or ways for an edit). It is advice: the director decides, and may decide before it.
- **The director's To approve** (Auditions box): the card, Claude's verdict and way (★), the name (first, nickname, surname), the three ways with the first scene and the frequency editable, the card as JSON; **Approve and offer** (one way), **Write again**, **Reject** (with a reason the viewer sees; it counts as the month's Audition). A sent Audition also sits in the NOW inbox.
- **The offer:** the inbox message and push; the 👤 button SEE YOUR ROLE opens `/audition`, where Ruti gives the news in the casting room and the page shows the role, the link, the first scene, how often, who the character is (the card's public side), what the viewer doesn't control and what comes next; ACCEPT / DECLINE with a confirmation, within 7 days (then it lapses). Accept: member `reading`, the button TABLE READ says it opens soon; decline or lapse: back to `none` (the month counts).
- **The test path** runs all of it (`/audition?test=1`, the 🧪 test member's card, review, offer and accept).
- **Not yet:** the table read (5b), the green light and joining the cast (5c), the show and quitting (6).

## As built (v271, steps 5b-5c: the table read and the green light)
- **Writing it:** after Accept the next tick writes the table read (Gemini only): 4-8 dials (personality and role) with 3-4 settings each, all inside the card's personality, and the card's own setting (`self`); 5-8 turns from the role's situations, each with one choice per setting and the stand-in's (or an extra's) answer to each. The viewer gets a message and a push; it stays open 5 days. **Write the table read now** in the Auditions box does it at once.
- **Playing it** (`/audition`, once): the intro says what it is and that it can't be repeated; then turn by turn the setup, the lines said to the character (shown under the stage and spoken with the device's voices, 🔊 on/off), the choices with a 20-second bar (no pick: the character chooses, the card's own setting), the picked line, the answer. One pause of up to 2 minutes. A reload goes on from the next turn. The stage is the show's own art in the page's `/?read` mode: the role's place drawn empty, the character in work clothes (the role's uniform over their look), a STAND IN for Ishai in a grey hoodie with a tag, an extra while they speak, a TABLE READ / NOT ON AIR banner and the director's chair.
- **Tuning:** when the last turn is picked (or after 5 days, with whatever was picked; none: from the card and the role), one Gemini call turns the picks into the card's `dials`, `atWork` (style, pace, complaints, a line, a habit), sample lines and mood lines. Claude reviews it with the weekly cast review (advice). The viewer's button reads WAITING FOR THE GREEN LIGHT.
- **The green light** (the Auditions box, READY FOR THE GREEN LIGHT): the final card, Claude's verdict, the table read turn by turn, whether to apply the tuning, and when the first scene is (empty = the next free 90 minutes at the place, awake, not on Shabbat, within 14 days). **GREEN LIGHT** adds the character to the cast (`from: audience`, the id from the first name, the card with `atWork` and `workLook`) and books the first scene (goal `aud-<n>`: Ishai meets them for the first time at the place, as the way in's scene); the viewer gets the time. **Not yet** sends a note (or asks for a new table read); **Stop** ends it with a reason. The test stops here and shows what would be booked.
- **Not yet (step 6):** the character at their post as a regular between scenes, ★ MY CHARACTER and the FROM THE AUDIENCE tag, the reminders the day before and 10 minutes before, "on now" pushes, Quit show and the goodbye, the replay of the table read, deleting answers after leaving.

## As built (v272, step 6: on the show and leaving)
- **At work:** each role kind has its `hours` per place in `story/audition-src/roles.json` (a barista at the café 8-17, a bartender 18-01, a vendor 7-18, the kiosk night clerk 18-05...). In those hours the character stands at their post in work clothes, like the regulars, with a day off now and then.
- **Before they meet:** until their first scene the story writer doesn't know them (and the polls don't use them); a moment with them is refused unless it's their own booked scene. The first scene sets `met`.
- **With Ishai:** a booked scene every 4-7 days at their post (goal `mem-<id>-<mmdd>`), on top of whatever the story does with them once they've met.
- **The owner:** reminders the day before and 10 minutes before the first scene, "on now" pushes at most twice a day, ★ MY CHARACTER on the Cast tab (everyone sees FROM THE AUDIENCE), and on `/audition` the character's status and their table read to look back on.
- **Leaving:** Quit show (the 👤 button) or the director's End (with a goodbye, now, or now and ban) books a goodbye within 7 days that fits the role (a job in another city, studying abroad, moving near family; never a death). After it the character leaves the cast; the card stays in the show's history marked `left`, the answers are deleted 30 days later, and a new Audition can be asked for 30 days after leaving. A character who never met Ishai leaves at once.
