# Ishai Cooks: plan

Proposed 2026-11-14, updated the same day with the director's answers (end of this file). **Step 1 built 2026-11-14 (v243)**: the pick, the time, the pantry, the slot, the shopping and cooking goals (written by the AI for now) and a guest every time; the director's Kitchen box. Two-day dishes (away over 5 hours) are skipped for now. **Step 2 built (v244)**: the kitchen art, the apron and recipe book, the cooking poses and sounds; the hob is set into the island (he cooks facing the camera) and the oven is in the wall counter behind him.

## The idea
Cooking is Ishai's hobby. About once a day he picks a recipe, checks what he has at home, takes the bus to Shuk Shalom for what's missing, carries the bags home, puts the shopping on the counter and cooks it, step by step. Then he eats it, sometimes with a friend.

The recipes come from a free recipe site, so every dish is a real one. The cooking runs without AI: the recipe's own steps are the script. Only the meal at the end, where he talks with someone about it, is written by the AI as usual.

## Where the recipes come from: TheMealDB
- **TheMealDB** (`themealdb.com/api/json/v1/1/`): free, no sign-up, about 300 recipes from 25+ cuisines. Each recipe has a name, a category (Chicken, Beef, Vegetarian, Dessert, Breakfast, Pasta, Seafood...), a cuisine, up to 20 ingredients with amounts, step-by-step instructions and a photo.
  - The endpoints we need are all free: `random.php`, `lookup.php?i=`, `filter.php?c=` (all the recipes in one category) and `categories.php`.
  - About the key: the shared test key `1` is meant for development and personal projects. TheMealDB asks public apps to become supporters (a one-time £10, which also removes the rate limit). The director chose the free test key. The code still reads an optional `MEALDB_KEY` secret and uses `1` without one, so upgrading later is just adding the secret.
  - Credit: the recipe card says "Recipe: TheMealDB" with a link to the recipe's page.
- **Why not the others:** Spoonacular and Edamam give cooking times, but both need an account and a key, and their free plans have small daily limits. TheMealDB is enough.
- **What TheMealDB doesn't give: the cooking time.** The worker works it out from the instructions without AI (see "How long it takes").
- **Cost:** 1 to 3 requests a day from the cron. No AI calls, and no KV writes: the day's recipe lives in the state (`s.kitchen`), like the trivia night's settings.

## What he picks (`story/kitchen.json`, edited by hand)
- **When the recipe is chosen:** `cookTick()` in `tick()` picks the day's recipe in the morning. It draws a category from a weighted list (more Vegetarian, Chicken, Pasta, Side and Breakfast; Dessert now and then), then a random recipe in it, with a seed from the date so it's the same for every isolate.
- **Not picked:**
  - anything in `kitchen.json`'s `banned` list: the Pork category and any recipe with pork, bacon, ham or shellfish (prawns, shrimp, mussels, clams, crab, lobster, scallops, squid, oysters). Meat with milk is allowed (the director's choice);
  - anything with more than 14 ingredients or an active time over 2½ hours;
  - anything cooked in the last 60 days (`s.kitchen.seen`);
  - any recipe whose ingredients the page can't draw, unless the generic jar or bag fits.
- **Ingredient words → pictures:** `kitchen.json` maps words in the ingredient names to about 40 grocery sprites: chicken, beef mince, fish fillet, eggs, milk, butter, cheese, yoghurt, cream, tomato, cucumber, onion, garlic, lemon, potato, carrot, bell pepper, courgette, aubergine, mushrooms, lettuce, herbs, chili, rice, pasta, flour, sugar, bread, tins, beans, lentils, olive oil, a spice jar, chocolate, apples, bananas... Anything else becomes a generic jar, tin or paper bag with the ingredient's name on the recipe card.
- **Pantry staples** he always has (`staples`): salt, pepper, oil, water, sugar, flour, spices he keeps, rice. `s.kitchen.pantry` remembers what he bought and when, so leftovers stay for a few days (milk 5, meat 2, vegetables 4, dry goods 60) and can save him a trip next time.

## How long it takes (no AI)
`cookTime()` reads the instructions:
- each "N minutes" or "N hours" (also "1-2 hours", "half an hour") in a step counts as that step's time; a step with no time gets 3 minutes, plus 1 minute per ingredient for chopping and measuring;
- **active** steps (stir, fry, chop, knead, whisk...) need him at the counter;
- **passive** steps (bake, simmer, roast, boil for 40 minutes) need him at home but free: he does other home things and goes back now and then (a pan check, the oven light);
- **away** steps (chill, refrigerate, marinate, overnight, rest, rise, leave to set) only need the fridge or a covered bowl, so **he can go out**. That's the director's fridge rule.

The result is `{active, passive, away, total}` in minutes, kept with the recipe.

## When he cooks: the free window
`cookSlot()` looks for a slot like the polls do (`pollFree()`), from now to the end of the day:
- awake, 08:00-21:00, at home or able to get home, with no planned beat, lecture, fixed night, poll goal or visit overlapping;
- **the whole time free**: active + passive, plus the shopping trip if he needs one (the bus ride there and back, `WALK`, plus `stay[0]` at the market);
- the away steps may overlap anything, and an overnight step can cross into tomorrow (overnight oats, marinated chicken): the dish waits in the fridge and the last part is cooked the next day in another free slot;
- **not on Shabbat**: no cooking from Friday sunset until Saturday night. On Friday the slot must end an hour before the candles. That's a good place for the week's big dish: dinner for Shabbat, sometimes with a guest;
- **no slot today:** the recipe waits for tomorrow, and he doesn't cook. About 6 days in 7 is right for "about once a day".

The slot becomes a goal `cook-<date>` (`g.cook`), like the outings, and `pollFree()` and `outingTick()` keep clear of it.

## The shopping trip
- **Missing anything that isn't a staple:** he walks to the street stop and takes the bus to Shuk Shalom, using the outing code (`outingStep()`, no AI), within the market's hours (Sun-Thu 07:00-19:00, Fri until 14:00). A recipe that needs things from Everything Else (a new baking tin, foil) adds the store next door.
- **At the market** (planned moments, no AI): he checks a list on his phone, goes from stall to stall and buys. Vendors' lines come from line pools (`SHUK_SAY`), with the local vendor (`local-vendor`) shouting prices. Each ingredient the recipe names appears on the recipe card's list with a ✓ as it's bought.
- **Bags:** from the first purchase he carries a paper or net shopping bag in one hand (`carry: 'bag1'`). With more than 6 items he has a bag in each hand (`bag2`), with a leek or a baguette sticking out when the list has one. He carries them on the bus (on his lap), on the street, up the stairs, and the bags slow his walk a little.
- **Home:** he puts the bags on the kitchen counter and unpacks: each item appears on the counter in turn (chicken in its tray, the milk carton, tomatoes, the bread...), then the cold things go into the fridge (the fridge door opens), and the dry things go on the shelf. The ones for today stay out.

## Cooking at home
### The kitchen gets bigger (graphics; follows `SCENE_GUIDELINES.md`)
The apartment's kitchen corner (the counter at 151-176, the fridge at 177) gets:
- **a hob and an oven** in the counter: two burners that glow orange when on, an oven door with a window and a light inside, a red dot when it's on; steam and a small heat shimmer above whatever is cooking;
- **a wall shelf** over the counter with **his recipe book** (a fat red ring binder), a few spice jars, a salt cellar and an oil bottle;
- **a utensil rail** with a ladle, a whisk, a spatula and a sieve; a wooden **cutting board** and a **knife** come out when he chops;
- **in the closet** (`CLOSET_X`, as you suggested): his **apron** and the **oven glove** on hooks, and the big pot, a baking tray and a cake tin on the bottom shelf. He walks to the closet first, ties the apron on (no CENSORED bar: it's over his clothes) and takes what the recipe needs. Afterwards everything goes back washed;
- **the everyday pan and the small pot** hang by the hob.

### Cooking animations (new poses)
`chop` (knife up and down, bits falling), `stir` (spoon circling in the pot), `fry` (pan shake, with a jump of food now and then), `whisk`, `knead`, `pour`, `taste` (the spoon to the mouth, a pause, a nod or a face), `oven` (bending down, with the glove on, the door opening and the tray in or out), `wash` (already there), `plate`.

Which pose plays comes from each step's verbs (`STEP_POSE`: "chop/slice/dice" → chop, "fry/sauté/brown" → fry, "bake/roast" → oven...). The sounds: chopping knocks, sizzling (already there), bubbling, the oven door, the kitchen timer's ring at the end of a passive step.

### The food itself
- The dish changes in front of us: raw ingredients on the board → chopped little squares in their colours → in the pan or pot, changing colour as it cooks (`dishLook()`: raw, half-done, done, from the step) → plated.
- A salad is cut and mixed in a bowl; a cake goes into the oven as batter and comes out brown and risen; a soup turns from pale to its colour.
- The finished plate is drawn in the recipe's main colours, from the ingredient list (tomato red, herb green, pasta yellow...), on a plate at the island, where he eats it.

### How it plays (no AI)
`cookMoments()` turns the recipe into planned moments, played as written like the history course and the cinema:
1. getting ready: the apron, the pots, the recipe book open on the counter;
2. one moment per 1-2 steps: the pose, what's in the pan, and a line or two from Ishai reading the step half aloud, muttering at it or humming (from the step's own text, shortened, plus `COOK_SAY` pools: "Medium heat. What is medium, really?");
3. passive steps: he does other home things (`HOME` activities) and comes back when the timer rings;
4. plating and the first taste: a nod, a face, or now and then a small disaster (too salty, a little burnt, the cake sinking): `cookLuck()`, seeded by the date, maybe 1 time in 6. Nothing dangerous: a smoke alarm beeping at most;
5. **the meal**: the only moment the AI writes. It gets the dish's name, how it came out, the wine and who is there. A guest comes whenever there's food (see "Inviting someone over"); they eat at the island, and the guest's memory gets an `update` ("ate Ishai's shakshuka; it was good").

The hosts comment from line pools (`COOK_HOSTS`) and name the dish, and the page's silence fill gets a `FILL_DO.cooking` list that knows the recipe ("Step 4 of 7. The onions are winning.").

### Leftovers
A dish for 4 leaves leftovers in the fridge (`s.kitchen.leftovers`, 2 days). Leftovers are food too, so they bring a guest as well (see below): the next day he warms them up for whoever comes. A cake can also be taken to Mrs. Levi.

## Inviting someone over (the director's rule: whenever there's food)
- **Every cooked dish, and every round of leftovers, gets a guest.** He eats alone only when nobody can come.
- **Who:** a friend from a list in `kitchen.json` (Noa, Tomer, Avi, Mrs. Levi, Dana after work, Boaz...), weighted. Not anyone he saw in the last 4 hours (`pickPerson()`), not anyone at work then (`OUTING_AT_WORK`), and not the same guest twice in a row. Mrs. Levi gets more weight for cakes and soups; Shabbat dinner can have two guests.
- **The invitation (no AI):** when he starts cooking, or after the shopping, he phones or texts them (a short planned `phoning` moment or a `message` with `via: 'text'`, from line pools: "I'm making fajitas, too much for one person. Come at seven?"). A friend who can't come says so ("Can't tonight, next time!") and he asks the next one, at most 3 tries. All of it is decided by the seed, so every isolate gets the same.
- **The arrival:** the guest leaves from wherever they are in time to arrive as he plates, using the `WALK` times. They knock (`knock`, `knocklevi`), come in, and maybe bring something: a bottle of wine, bread, or a dessert.
- **The meal** is the AI's moment, as above. The guest stays for the meal and a drink, then leaves with the usual goodbye (v232). Someone who came also gets a memory and a little more friendship.
- `homeLifeTick()`'s drop-in visits leave a cooking day's evening alone, so no second visitor turns up in the middle.

## Drinks: red wine, white wine and glasses
- **Wine at home:** a small **wine rack** on the kitchen shelf holds bottles of red (dark bottle, red label), with the white in the fridge door (pale bottle, cream label). Fictional brands only: **Herzl Hills Red** and **Herzl Hills White**, with **Kfar Kofi** cold coffee and **Cooola** for anyone who doesn't drink. **Wine glasses** hang upside down under the shelf.
- **Buying:** a wine stall at Shuk Shalom (the bottles go in the bag, sticking out of the top), or a guest brings one. `s.kitchen.pantry` counts the bottles; when they run out, the next shopping list adds one.
- **Which wine:** from the recipe's category (`WINE`): red with beef, lamb and goat; white with fish, chicken, pasta and vegetarian dishes; none with breakfast. Cooola or juice for desserts and for a guest who doesn't drink (`kitchen.json`: `noWine`). On Friday the kiddush cup (already drawn) comes first, then the wine with dinner.
- **Glasses animations (new poses and props):**
  - `pour`: he takes the bottle, the cork comes out with a small pop (`Sound.sfx('cork')`), then the wine pours in a thin stream and the glass fills up with a red or pale yellow level (`glassFill()`), first the guest's, then his own (`glug`);
  - `cheers`: both lift their glasses and they touch over the island, with a small sparkle and the `clink` sound ("L'chaim!");
  - `sip`: the glass to the mouth and the level drops a pixel each time; the glass stays on the island between sips, with the bottle beside it;
  - a white wine glass shows a little condensation; a red one leaves a drop at the rim;
  - after the meal the empty glasses and the bottle stay on the island until he washes up (`dishes`, already there), then the glasses go back on the rail.
- **How much:** one or two glasses each, and never drunk. The story writer is told it's wine with dinner, nothing more.
- The hosts get a few lines about it (`COOK_HOSTS.wine`: "Red with the beef. Someone has read a magazine."), and the recipe card shows the wine under the dish.


## What viewers see: the recipe card
A card under the picture like the trivia card (`#recipe`), from the moment he picks it until he eats:
- the dish's name, cuisine and category, and TheMealDB's photo pixelated to 4 levels a colour, like the gallery pictures (`artImg()`): "how it should look";
- the time (active / waiting / in the fridge), and the ingredients with ✓ for what he has, 🛒 for what he's buying and ✓ again once bought;
- the steps, with the current step lit as he cooks;
- "Recipe: TheMealDB" with a link to the full recipe, so viewers can cook it too.

Also: the TV guide's TODAY lists "Ishai cooks: Chicken Fajitas, 18:30" (`guideDay()`), the PiP can tease it, and the SUMMARY tab and the 8bitTV+ episodes get the dish as a highlight.

## Story and memory
- `eventNote()` tells the story writer what he's cooking today, and the moments around it can mention it ("I still need coriander").
- `addLife()` keeps "made a ratatouille, a bit burnt" as an evening memory, so he can bring it up later.
- **The Truman rule:** nobody in the world knows the recipe came from "the show"; it's his own book and his own choice.

## Budget
- **AI:** none for the pick, the time, the shopping or the cooking; the meal moment replaces a live moment that would happen anyway. Overall the AI calls go down a little.
- **KV:** no new writes; everything lives in the state.
- **Outside requests:** 1-3 to TheMealDB a day, plus the photo, which the viewers' browsers load directly.
- **Worker size:** the line pools and `kitchen.json` are a few KB, and the art is code, not images.

## Building it, in steps
1. **The worker:** `kitchen.json`, `cookTick()` (the pick and the filters), `cookTime()`, `cookSlot()`, the goal, `/api/kitchen` and `/api/health` → `kitchen`, plus a director box to pick, swap or skip today's recipe.
2. **The kitchen art:** the hob, the oven, the shelf, the recipe book, the rail, the board, the closet's apron, glove and pots, and the new poses. Sandbox: a "Kitchen" menu with every pose and the dish in each state.
3. **Shopping:** the trip, the market moments, the bags (one or two hands, on the bus, on the stairs) and unpacking at home onto the counter and into the fridge.
4. **The cooking moments, the recipe card and the meal**, plus the leftovers, the hosts, the TV guide, the episodes and memories.
5. **Guests and wine:** the invitation, the arrival, the wine rack, the glasses and the pour, cheers and sip animations.

## The director's answers (2026-11-14)
1. **Kosher:** only no pork and no shellfish. Meat with milk is fine.
2. **Recipe key:** the free test key `1`. An optional `MEALDB_KEY` secret can replace it later.
3. **How often:** about 6 days in 7. On Friday it's the Shabbat dinner, finished an hour before the candles.
4. **Storage:** the apron, the oven glove and the big pots go in the bedroom closet.

5. **Guests:** he invites someone whenever there's food, for a cooked dish or the leftovers.
6. **Drinks:** red and white wine (fictional brands), with glasses, pouring, cheers and sipping animations.

Still open, with the plan's default until the director says otherwise: about 1 dish in 6 comes out wrong (burnt, too salty, sunk).
