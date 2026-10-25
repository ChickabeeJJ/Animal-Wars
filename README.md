# Animal Wars

A pixel-art lane battler for CrazyGames. Command an army of cute animals against the Gloom: send heroes marching down the lane, upgrade your acorn pouch, rally them with a Battle Cry, and smash the Gloom tower before it flattens your burrow. Between battles, hatch rare heroes, level them up and evolve them, upgrade the Lab, and free 8 lands across 3 difficulties.

**Play locally:** open `index.html` in a browser, or serve the folder (`npx http-server .`). There is no build step needed to play.

## What's in the game

| | |
|---|---|
| **Heroes** | 150 animals in 5 rarities (25 Starter, 46 Rare, 38 Epic, 26 Mythic, 15 Legend), each with 3 forms, one of 10 elements and an attack animation of its own (a body motion, a hit effect and, for ranged heroes, a projectile; no two units share one). Abilities include area attacks, critical hits, knockback, freeze, slow, weaken, shockwaves, multi-hits, Tower Smashers, burrowing, Last Stand and Spirit Breaker. |
| **Gloom** | 73 enemies with 6 traits (Airborne, Ironclad, Phantom, Venomous, Restless, Starborn), each with its own rule, and an element each; 24 land bosses. |
| **Stages** | 3 chapters (The Green Kingdom, The Gloom Frontier, Heart of the Gloom) × 8 lands × 12 stages × 3 difficulties (Normal, Hard, Nightmare) = 864 story stages, plus the endless Gloom Tower and 3 daily events (Coin Cave, Seed Grove, Egg Hunt) with 5 levels each. Each stage has 3 star goals; stars open land chests. |
| **Hatchery** | Three nests: Royal Nest (gems or Gold Eggs: Rare 62% · Epic 28% · Mythic 9% · Legend 1%, daily rate-up heroes at half their rarity's chance, Mythic pity at 40 and Legend pity at 150), Elemental Nest (only heroes of the day's element, rotating through all 10) and Meadow Nest (Silver Eggs, one free every 4 hours). A ×10 always includes an Epic. Duplicates add bonus levels. All odds are shown in game. |
| **Elements** | Ember, Frost, Thorn, Storm, Shadow, Tide, Stone, Sun, Moon and Bloom. Each beats two elements (×1.5 damage) and is beaten by two (×0.75). Three heroes of one element in the lineup give them +10% health and attack, five give +20%. The stage window scouts each Gloom's element and suggests what to bring. |
| **Progression** | Hero levels 1-30 (+20 from duplicates), evolution at level 10 and 20, 9 Lab upgrades, 4 battle boosts, Commander rank. |
| **Coming back** | 7-day login calendar, 4 daily quests plus a completion bonus, Acorn Farm (coins while away, 8-hour cap), free Silver Egg timer, daily event entries, 14 medal series, tower leaderboard. |

Every gem and egg is earned by playing. There are no purchases.

## Controls

| Input | Action |
|---|---|
| Tap a hero card, or `1`-`0` | Deploy that hero |
| Tap the pouch, or `E` | Upgrade the acorn pouch (faster income, bigger pouch) |
| Tap Battle Cry, or `R` / `Space` | When charged, every hero on the field glows gold for 8 seconds: +50% attack (more with the Lab), +30% speed, 30% less damage taken |
| Drag, scroll or `←` `→` | Look around the battlefield (the camera follows the front line otherwise); tap the minimap to jump |
| `F` | Speed ×1 / ×2 |
| `P` / `Esc` | Pause |
| `M` | Mute |

## Project layout

```
index.html           page shell (loads the files below and the optional CrazyGames SDK)
css/style.css        pixel UI: frame utilities (.fx-*), home, battle HUD, dock, windows, modals, phone layouts
fonts/               Pixelify Sans + Silkscreen (SIL OFL, licences included)
js/content.js        content tables: heroes, Gloom, regions, difficulties, events, banners, Lab, items, missions, login, medals
js/tune.js           per-stage tuning written by tools/tune.js (do not edit by hand)
js/core.js           all rules: saves, hero stats, stage generator, battle simulation, hatchery, dailies, medals (no DOM; runs in Node)
js/assets.js         the painted tree-house base and region backgrounds as native-size pixel art (written by tools/assets.py)
js/sprites.js        palette, Painter (with a pixel-art clean-up pass), 50 hero and 33 Gloom painters (4 frames each), bases, eggs, hand-drawn icons, the UI frame kit and pixel-font titles
js/render.js         the battlefield: painted parallax regions, camera, units, Battle Cry glow, waves, particles, minimap, home parade, region art for menus
js/audio.js          chiptune sound effects (synthesized) and the music: audio/menu.mp3 at home, audio/battle.mp3 in battle (a synthesized fallback plays if they cannot load)
audio/               the menu and battle music tracks (re-encoded at 96 kbps)
js/platform.js       CrazyGames SDK v3 adapter + storage; every call is safe without the SDK
js/game.js           UI, input, battle loop, tutorial, results, windows, saving, platform hooks
tools/sim.js         campaign simulator: a scripted player plays the real rules and reports pacing
tools/calibrate.js   lowest hero level that beats each stage
tools/tune.js        writes js/tune.js so every stage is beatable at a target level in a target time
tools/assets.py      turns the painted art in assets/src into clean native-resolution pixel art (Pillow + NumPy) → assets/px and js/assets.js
tools/build.js       production build → dist/index.html (single file) + dist/animal-wars.zip + public/index.html
tools/keyart.html    store key art composed from the game's sprites and paintings
tools/covers.js      renders the key art into the three covers → store/
tools/preview.js     store preview videos (real gameplay) → store/
tools/spritesheet.html  every sprite enlarged, for art review
tests/core.test.js   rule tests (Node's built-in runner)
tests/browser.qa.js  browser QA in Chromium (desktop, 1920×1080, phone landscape, and the rotate prompt in phone portrait)
```

## Commands

Node 18+. The browser QA, covers and previews also need Playwright (`npm i -D playwright && npx playwright install chromium`) and the previews need ffmpeg.

```
npm test                    # rule tests
npm run qa                  # browser QA against the source files (pass a folder to save screenshots)
npm run build               # dist/index.html + dist/animal-wars.zip
npm run qa:dist             # the same QA against the production build
npm run covers              # store/cover-*.png
node tools/preview.js       # store/preview-*.mp4
npm run sim -- 8 1          # campaign pacing (regions, seed, --verbose)
node tools/calibrate.js 0   # level needed per stage (difficulty 0, 1, 2)
node tools/tune.js 0,1,2    # re-tune stages after changing heroes, Gloom or the stage generator (slow)
python3 tools/assets.py     # rebuild js/assets.js after changing anything in assets/src
```

Add `?debug` to the URL to show every menu from the start.

## Balance

Stages are generated from each region's Gloom pools (`stageDef` in `js/core.js`), tuned per stage by `tools/tune.js` (the strongest Gloom a scripted player beats every time within a target time at a target level), and then calibrated with the whole-campaign simulator in the loop (`tools/sim.js`). The scripted player plays like a good human: it keeps a stream of cheap heroes at the front whenever Gloom is on the field, sends big heroes as soon as they are ready, buys pouch levels early and levels its lineup. Every stage's strength was eased wherever that player hit a wall, across four random seeds, until each seed cleared all 24 lands. On top of the tuning, `CONFIG.challenge` makes every stage tougher (+40% Gloom strength, +20% tower health, +8% wave pace, eased in over the first six stages). Acorn income is 7.8 + 3.9 per pouch level per second, and every hero gives the same value for its acorns within its rarity (rarer heroes are bigger and dearer, with only a 5-15% premium), so a fresh hatch at level 1 cannot carry the campaign: a level-1 army stalls around 1-3 and a level-5 army around 1-6. The simulator clears chapter 1 in about 13 hours of battles with about 30 lost battles, and the full Normal campaign in 25-43 hours. Hard and Nightmare share Normal's per-stage shape; the simulator does not play them. If you change hero or Gloom stats, re-run `node tools/tune.js` and `npm test`.

## Deploying to CrazyGames

1. `npm run build`.
2. Upload `dist/animal-wars.zip` (`index.html` with everything inlined, plus the `audio/` folder with the two music tracks; about 4.5 MB).
3. Use `store/` for the listing: three covers, a landscape preview video, and the text in [`store/LISTING.md`](store/LISTING.md).
4. Category **Action** or **Strategy** (tower defense), mobile and touch supported. On phones and tablets the game is **landscape only**: in portrait a "turn your device sideways" screen covers it (and pauses a battle), and the game asks the browser to lock landscape where that is allowed.

`index.html` loads the CrazyGames SDK v3 from `sdk.crazygames.com`. The game starts without waiting for it and works the same if it fails to load. When it loads, the game:

- calls `loadingStart` / `loadingStop`, and `gameplayStart` / `gameplayStop` around battles (stopped on pause, results, menus and when the tab is hidden);
- calls `happytime` on boss and region wins, Mythic or Legend hatches, and evolutions;
- respects the platform mute setting and pauses audio during ads;
- shows a **midgame** ad when leaving a battle result (never before stage 1-3 is cleared, at most once every 3 minutes);
- offers **rewarded** ads only as optional bonuses: double battle coins, a Second Wind after a defeat, double Acorn Farm coins. They only appear in the `crazygames` environment when ads are available;
- mirrors saves into the SDK data module and adopts a synced save when it is further along;
- greets signed-in players by their CrazyGames username;
- submits the best **Gloom Tower floor** to the leaderboard with `SDK.user.submitScore({ encryptedScore, score })` (AES-GCM, as in Pocket Singularity).

**Leaderboard setup:** create the leaderboard in the developer portal and paste its encryption key into `leaderboardKey` in `js/platform.js`. Without a key nothing is submitted.

The SDK integration was written from the v3 API and has **not** been run against the live SDK, which this build environment cannot reach. Test it in the CrazyGames QA tool before submitting.

## Original work

Animal Wars is inspired by the lane-battler genre (send units down a lane, manage an income meter, fire a base weapon, destroy the enemy base), but all names, characters, art, music and text are original. There are no cats in the army, no copied characters, enemies, sprites, sounds or UI art, and the currencies, items and modes have their own names (acorns, Battle Cry, Royal Nest, Gloom Tower, and so on); there is no base cannon: the Battle Cry powers up your heroes instead. Systems with no counterpart in that genre: the 10-element wheel with lineup synergy, the scouting report, the daily Elemental Nest, the three-tap egg hatch, chapters of colour-graded lands, and the trait set with its own rules and names (Airborne, Ironclad, Phantom, Venomous, Restless, Starborn). Characters, towers, eggs and icons are drawn by code in `js/sprites.js`; the tree-house base and region backgrounds are the owner's painted art in `assets/src`, converted by `tools/assets.py`; sound effects are synthesized in `js/audio.js`; the music tracks in `audio/` were supplied by the owner.
