# Animal Wars — design notes

## Brief

Make a CrazyGames game called Animal Wars that plays largely like a classic lane battler (the owner shared footage of one), without copyright problems, fun and built for retention: many stages, many units, a great gacha, CrazyGames SDK integrated, in the pixel-art style of Pocket Singularity. Version 1.1 then asked for "massive improvements to all UI".

## What carries over from the genre (mechanics only)

- A horizontal lane: your base on the left, the enemy tower on the right.
- An income meter (the **acorn pouch**) that fills over time, can be levelled up during battle for faster income and a bigger cap, and is topped up when enemies fall.
- A deck of up to 10 units, each with a cost and a cooldown. Units walk until something is in reach, wind up, hit, and get knocked back as their health drops.
- A rally that charges over time instead of a base cannon (the **Battle Cry**: every hero on the field glows gold and gets stronger for a few seconds).
- Enemy traits that some units counter, bosses that shove your army back when they arrive, and stage magnification.
- Story chapters, harder replays of each chapter, a daily-event dungeon set and a capsule-style gacha.

## What is original

- **Theme and characters:** an army of animals (no cats at all) against the Gloom, a made-up faction of blobs, imps, ghosts, robots, aliens and so on. All 50 hero names, all 33 enemy names, the 8 lands, the 96 stage names and all text are original.
- **Art:** every sprite is drawn by code (`js/sprites.js`) in the Sweetie 16 palette of Pocket Singularity: shaded shapes with selective outlines, side-on chibi animals with walk, wind-up and strike frames, gear for second and third forms, and a rarity sparkle aura on third forms.
- **Audio:** chiptune effects and three original themes from a small Web Audio sequencer (`js/audio.js`). No audio files.
- **Names for systems:** acorns, pouch, Battle Cry, Royal Nest, Meadow Nest, Gold and Silver Eggs, Growth Seeds and Star Fruit, the Lab, Acorn Farm, Gloom Tower, Commander rank.
- **Rules:** our own trait rules (Armored takes 10% unless crit or countered, Spooky dodges 1 in 4 hits, Toxic poisons, Undead revive once unless slain by a Zombie Slayer, Cosmic takes half), 3-star goals per stage with region star chests, burrowing, survive-once, tower breakers, multi-hits.

## Battle

| Rule | Value |
|---|---|
| Tick | 30 per second, deterministic per seed (replays are identical) |
| Pouch | Lv 1: 12 acorns/s, cap 450. Each level +6/s, +330 cap; 8 levels; upgrade cost 40 × (level + 1) |
| Battle Cry | 30 s charge (Lab down to 12 s); for 8 s every hero on the field gets +50% attack (+5% per Lab level), +30% move speed and takes 30% less damage; heroes deployed later are not buffed |
| Knockback | at each health threshold (kb count) and from abilities; bosses move less |
| Caps | 30 heroes and 40 Gloom on the field |
| Boss entry | knocks every hero back |
| Defeat | rewarded Second Wind (once): burrow back to 60%, Gloom blown back, Battle Cry charged |

Hero stats scale with level (+20% of base per level to 20, then +12%), forms (×1.12, ×1.3 with a stronger ability) and the Lab's Training Grounds.

## Stages and balance

`stageDef` builds each stage from its region's pools: a constant trickle, support enemies from stage 2, heavies from stage 4, an air raid at stage 3, a brute mini-boss at stage 6, a rush when the tower drops below half at stage 8, a trait wave at stage 10, and the region boss at stage 12; every stage after the first few rallies once the tower is in trouble.

Then `tools/tune.js` tunes all 288 stages with a scripted player (`tools/sim.js`) that deploys like a decent human. For each stage it sets the tower's health so a fight takes about the target time, then binary-searches the strongest Gloom the player still beats every time within that time at the target hero level. The resulting multipliers live in `js/tune.js`.

Pacing from `npm run sim`: Clover Meadow takes about 40 minutes of battles for a new player (more with grinding), and the Normal campaign about 6 hours. Hard and Nightmare need well-levelled, evolved Mythic and Legend heroes.

## Retention

- **First minute:** no menus; a new player starts in battle 1-1 with a pointer tutorial (deploy, upgrade the pouch, Battle Cry). The Hatchery opens after 1-3 with a free ×10 Royal hatch that always includes an Epic.
- **Every session:** a visible next goal on the home screen (next recruit, next boss), daily quests, Commander rank, stars and region chests, badges on everything claimable.
- **Every day:** login calendar (Gold Egg on day 7), quests plus a bonus, event entries that refill at midnight, a free Silver Egg every 4 hours, the Acorn Farm (coins while away, capped at 8 hours) and a welcome-back screen.
- **Long term:** 50 heroes × 3 forms, duplicate levels, 288 stages × 3 stars, an endless tower with a leaderboard, 14 medal series.
- **Fair gacha:** odds, featured rates and pity counters are shown; all premium currency is earned by playing; ads are optional bonuses only.

## Version 1.1: UI overhaul

The owner asked for massive improvements to all UI. Everything was rebuilt around a pixel UI kit that the game generates at boot:

- **Frames:** 9-slice pixel images (wooden windows with parchment, lifted cards, insets, HUD plaques, ribbons, rarity frames with corner gems, and 3D buttons with pressed states in 9 colours), applied as crisp CSS border-images through `.fx-*` classes.
- **Pixel-font titles:** text rendered with Silkscreen into a small canvas, alpha-thresholded so every pixel is crisp, filled with a gradient, outlined and given a drop shadow (logo, window ribbons, VICTORY/DEFEAT, callouts, hatch reveals, buttons).
- **Home:** commander plaque with rank bar and lead hero, currency pills with shortcuts, a daily-quest tracker, side buttons with live timers (Daily Gift, Acorn Farm, Free Egg, Tower), the logo over the meadow parade, a next-goal ribbon, a big BATTLE button flanked by World Map and Hatch, and a wooden nav bar with badges.
- **Battle:** stage plaque, acorn counter plaque, round pouch and Mega Roar buttons with charge rings, rarity-framed hero cards with cooldown sweeps and a pop when ready, health labels above both bases, a boss bar and pixel callouts.
- **Windows:** framed parchment windows with ribbon titles. The World Map draws each land's art with a winding road of stage nodes (bosses shown on their node), region cards with art thumbnails and star chests with progress. The Hatchery has animated banners with featured heroes and a pity bar; the hatch show has rays, sparkles and pixel-font reveals. Army cards use rarity frames; the hero sheet has a pedestal, level bar, form strip, icon stat bars and ability chips. Lab, Rewards, Events, Tower, Medals and Book were redone in the same style.
- **Results:** rotating rays, a VICTORY title, popping stars and reward tiles.
- **Phones:** portrait gets a wide battlefield band with big cards beneath and a sideways-scrolling map; short landscape screens shrink the logo and keep result buttons on screen.

## Version 1.2: buttons

The owner asked to drastically improve button layout and design.

- **New button art:** glossy pixel buttons with rounded corners, a banded face that keeps its proportions at any size, an inner rim, a sparkle and a deep 3D lip. Pressing drops the face onto a shallow lip. 11 colours, with hover brightening and a clear disabled state.
- **Pixel-font labels everywhere:** `pixelize()` turns the text in every button into crisp pixel-font labels (the words stay in a screen-reader span), so menus, dialogs and the hatch show all match.
- **Home action bar:** one wooden strip along the bottom with a raised BATTLE button (crossed swords, title, next stage) and four colour-coded buttons on each side: Map, Army, Lab, Book | Hatch, Rewards, Events, Medals. Locked features are greyed out with a tooltip instead of disappearing, so the layout never shifts. On phones BATTLE spans the top row and the eight buttons form a grid.
- **Segmented tabs** for difficulty, rarity filters and the Book; the selected option is raised in gold.
- **Dialogs:** the last action is the primary button, larger and on the right; an AD tag marks rewarded-ad buttons.
- **HUD:** bigger square controls for pause, speed and camera; colour-coded sound and settings buttons.

## Version 1.3: landscape, painted art, Battle Cry and polish

The owner asked for landscape-only play on mobile, a AAA-standard UI pass, better sprites with no stray pixels or jaggies, their painted tree house as the home base and painted backgrounds for the maps, a better star, a buff glow instead of a cannon, a struck-out mute button and popups for locked features.

- **Painted art at the game's pixel size:** `tools/assets.py` resamples the owner's paintings (each art pixel was ~5 screen pixels with soft, noisy edges) onto the game grid (backgrounds 320×180, the base 90×94), cuts them to a 36-40 colour palette without dithering, merges lone low-contrast pixels, fills pinholes and removes spurs, and gives the base a 1-pixel coloured outline. The four paintings give Clover Meadow, Sunscorch Dunes, Frostpine Peaks and Lunar Rift; colour grades of them give Murkwood Bog (misty dusk), Ember Caldera (volcanic red), Rustbolt City (cold night, plus a skyline layer) and Skyreach Isles (golden morning, plus floating islands). Backgrounds repeat with every other copy mirrored so the seams match, and menus zoom them by whole numbers only.
- **Battle Cry replaces the cannon (Mega Roar):** see the table above. Buffed heroes get a 2-pixel gold aura that hugs their silhouette, pulses, sheds sparkles and blinks for the last 1.5 s; the cry plays a war-horn call and shows a callout. The scripted player uses it when four or more heroes are fighting (or in an emergency); the campaign simulation still clears every stage without getting stuck (Normal in about 5 hours) so the stage tuning was kept.
- **Sprite clean-up for every painted sprite** (`Painter.clean`, run before the outline): pinholes filled, stray pixels and one-pixel nubs removed (thin deliberate lines such as staffs and whiskers kept), specks under 5 pixels removed, lone low-contrast shading pixels merged (high-contrast glints and diagonal lines kept). Third forms got a rarity-tinted outline instead of floating sparkles. Hand-drawn pixel icons for the star, empty star, coin, lock, speaker, struck-out speaker and the Battle Cry horn. A new Gloom tower: staggered brick courses, battlements, a crystal spire, a lidded eye, a portcullis and side thorns, with cracks and knocked-out bricks as it is damaged.
- **No uneven pixels:** icons are only shown at whole multiples of their size, and portraits (deploy cards, army, lineup, hero sheet, book, hatch reveals) are cropped to their visible pixels and drawn at the largest whole-number scale that fits.
- **Landscape only on phones and tablets:** a rotate prompt covers the game in portrait on touch screens and pauses a battle; the game also requests a landscape lock.
- **UI polish:** an 8/12/16 spacing rhythm, more line height and paragraph spacing in menus, window headers that keep their currency pills inside the frame, roomier buttons with labels that are redrawn smaller if they would overflow, new Lab and Medal cards (name and level, description, progress bar, current ▶ next value, price), boost shop cards, event level tiles with readable locked text, region cards with number and star badges, dark deploy cards with rarity glow, a top-down cooldown veil and a full-width cost strip, a single row of ten tall cards on short phone screens, base health shown in the lane, and a gold "active" state for the Battle Cry button.
- **Locked features explain themselves:** tapping a locked nav button, difficulty, region, stage, chest, event level, boost or upcoming side feature (Free Egg, Tower) shows a small popover anchored to it saying exactly what unlocks it (for example "Clear stage 1-3 to unlock Hatchery").
- **Mute:** the speaker is struck through and the button turns red while muted; the choice is saved.

## Not yet verified

- The CrazyGames SDK calls (ads, data sync, leaderboard) have not been run against the live SDK.
- Hard and Nightmare tuning relies on the scripted player; real players may find specific late stages easier or harder.
