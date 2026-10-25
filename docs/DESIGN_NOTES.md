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

- **Theme and characters:** an army of animals (no cats at all) against the Gloom, a made-up faction of blobs, imps, ghosts, robots, aliens and so on. All 150 hero names, all 73 enemy names, the 24 lands, the 288 stage names and all text are original.
- **Art:** every sprite is drawn by code (`js/sprites.js`) in the Sweetie 16 palette of Pocket Singularity: shaded shapes with selective outlines, side-on chibi animals with walk, wind-up and strike frames, gear for second and third forms, and a rarity sparkle aura on third forms.
- **Audio:** chiptune effects and three original themes from a small Web Audio sequencer (`js/audio.js`). No audio files.
- **Names for systems:** acorns, pouch, Battle Cry, Royal Nest, Elemental Nest, Meadow Nest, Gold and Silver Eggs, Growth Seeds and Star Fruit, the Lab, Acorn Farm, Gloom Tower, Commander rank.
- **Rules:** our own trait rules (Ironclad takes 10% unless crit or countered, Phantom dodges 1 in 4 hits, Venomous poisons, Restless revive once unless slain by a Spirit Breaker, Starborn takes half), a 10-element wheel with lineup synergy, 3-star goals per stage with region star chests, burrowing, survive-once, tower breakers, multi-hits.

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

## Version 1.3.1: home, HUD and tutorial fixes

- **Home:** a logo lockup (shield emblem with a paw over crossed swords beside ANIMAL / WARS); left-column cards for the next battle (region art, stage, the Gloom you will meet) and today's rate-up heroes; side buttons rebuilt as an icon button with a separate name and status plate (nothing overlaps), with hand-drawn gift, barn, egg and tower icons and a lock badge inside the button. The nav labels all fit at full size ("Prizes" opens Rewards).
- **Battle HUD:** the Gloom tower health is a plate as tall as the speed and camera buttons, with the numbers inside the bar (base health numbers moved into the HUD bars). Speed and camera buttons turn gold and read ×2 / AUTO when on, dark with ×1 / FREE when off, and FREE now really stops the camera following.
- **Pause:** the keyboard hint line is gone.
- **Tutorial:** a spotlight dims everything except the target, rings it in gold, and a pixel hand taps on it under the hint bubble. Battle 1-1 now guides: deploy Pip, keep deploying (it points at whichever card is ready), upgrade the pouch, then the Battle Cry. At home it points at BATTLE until 1-3 and at the Lab the first time an upgrade is affordable.

## Version 1.3.2: music, harbour city, stage window, logo, cards

- **Music:** the owner's tracks play on the home screen (menu) and in battle (also for bosses), as looping <audio> elements that follow the music switch, mute, tab hiding and ads. The build ships them in `audio/` next to `index.html`; if they cannot load, the synthesized themes play instead.
- **Rustbolt City** uses the owner's harbour-city painting. **The lane adapts to each background:** `tools/assets.py` samples the lit terrain colour just above the painting's bottom band and the band itself, and the lane strip is drawn in those colours with a texture for the land (grass, sand, snow or paving).
- **Stage window:** a banner of the land's painting with the stage's Gloom standing on it (unknown ones as silhouettes) and difficulty / region / boss tags, star goals and rewards side by side, boosts as square chips (tooltip has the description), then the lineup.
- **Logo and game icon:** one composed pixel image (a gold-rimmed shield with Captain Pip inside, crossed swords and a star crest, a red ANIMAL ribbon and a big gold WARS), so nothing in it can drift out of line; the currency bar is centred over it. The emblem is also the page icon.
- **Deploy cards:** a pixel backdrop per rarity (stone, light beams, starry night, golden sunburst, aurora) with a lit floor under the hero; dimmed while unaffordable or cooling down.
- **Phones:** one row of five cards; a small page button beside them flips to the other five and shows how many heroes on the hidden page are ready.

## Version 1.4: Hatchery and difficulty

- **Hatchery menu:** a collection strip (heroes found per rarity), and two nest banners: an animated stage with the egg in a woven nest under spinning rays, today's rate-up heroes on glowing pedestals, a featured list with rarity, a colour-segmented odds bar, Mythic and Legend pity trackers ("N left"), ×1 / ×10 buttons (the ×10 tagged "Epic+ inside · save 10%"), what you own, and the full rules folded away.
- **Hatch show:** pips across the top for every egg (each turns into the hero's face once revealed). An egg wobbles, and glows gold (Mythic) or rainbow (Legend) when something great is inside; a tap shakes and cracks it, it bursts in a flash of its rarity colour, and the hero pops out with rarity stars, a name ribbon, a NEW! stamp or the duplicate bonus, and its ability. Skip jumps to a summary grid (best hero highlighted, NEW / +1 LV tags, new vs duplicate count) with **Again ×10** when you can afford it.
- **Difficulty:** `CONFIG.challenge` raises Gloom strength by 22%, tower health by 20% and wave pace by 8% on top of the per-stage tuning, ramping in over stages 1-1 to 1-7 (Skyreach Isles gets a slightly smaller boost because it was already the steepest land). Events and the Gloom Tower get the strength boost too. Simulated Normal campaign: 390-480 minutes and 11-18 losses (seeds 1-2), up from about 312 minutes and 8 losses; no stage gets stuck.

## Version 1.5: elements, 150 heroes, chapters, menus and hatching

- **Tutorial:** battle 1-1 starts with enough acorns for Pip, and the pointer only asks for something you can do: while the pouch is short it points at the acorn counter ("Acorns fill up by themselves. Pip costs 50"), and the pouch and Battle Cry steps wait until they are affordable or charged.
- **Elements:** 10 elements on a wheel (each beats two for ×1.5 damage and is beaten by two for ×0.75), set on every hero and Gloom. Three heroes of one element in the lineup give them +10% health and attack, five give +20%. Element glyphs on deploy cards, lineup slots, roster tiles and the hero sheet (with "strong vs / weak vs"); an element filter in the Army.
- **100 new heroes** (150 in all): 25 new species (otter, capybara, hippo, koala, duck, flamingo, pig, bull, pony, llama, zebra, gecko, armadillo, mouse, ferret, seal, shark, toucan, ostrich, rooster, bee, ladybug, snail, badger, yak) in 4 elements each, with stats from their role (tank, swarm, fighter, runner, ranged, brawler), an ability from their element, and new painters in `js/sprites.js`. 25 of them are story recruits.
- **More Gloom:** 24 new enemies (spiders, Gloom knights, wraiths, totems, crystals, rats, jellies, bombers and more) and 16 new bosses.
- **Chapters:** 3 chapters of 8 lands. Chapters 2 and 3 reuse the 8 paintings with a dusk and a deep-gloom colour grade (lane and backgrounds), with new pools, bosses and generated stage names; 864 story stages. The World Map has chapter tabs (stars per chapter, locked until the chapter before is beaten) beside the difficulty switch. The new lands' base strength was rescaled so their tuning sits near 1, then the stages that the tuner could not make easy enough were re-tuned.
- **Difficulty:** the bigger roster and elements made chapter 1 too easy (the simulator cleared it in 266 minutes with 2 losses), so `CONFIG.challenge.mag` went from 1.22 to 1.4 (Clover Meadow ×0.9, Skyreach Isles ×0.92, Lunar Rift ×0.88): chapter 1 now takes the simulator about 400 minutes with 15-20 losses. The tuner had assumed hero levels 36-50 for chapters 2-3, but levels stop at 30 (+20 from duplicates), so the scripted player plateaus around 30-39 and got stuck at 9-8. Those chapters were recalibrated with the simulator in the loop (ease each stage where it keeps losing, check four seeds, ease boss stages and Starfall Crater a little more because lineups without Starborn counters hit a wall there). All four seeds now clear all 24 lands in 783-1057 minutes, 20-50 minutes a land after chapter 1. Hard and Nightmare in chapters 2-3 get the same shape with an extra ×0.75 / ×0.65; they are not simulated.
- **Stage window:** a scouting report of every Gloom kind (element, traits, boss tag) with the elements to bring, star goals and rewards, compact boosts, and the lineup with ▲ / ▼ marks for each hero's matchup against this stage and the synergy it gets.
- **Pause screen:** live star goals (burrow health now, time against the par), time, Gloom defeated, heroes sent, the Gloom tower's health, the Gloom of the stage with elements, the synergy, and the settings in one row.
- **Hatchery menu:** tabs for three nests (the new **Elemental Nest** hatches only heroes of the day's element), a showcase stage per nest (egg in a straw nest, heroes on glowing pedestals, drifting motes, a rate-up countdown), a side panel with odds, pity and the hatch buttons, and an "In this nest" strip of every hero it can hatch (owned in colour, the rest as silhouettes; tap for the hero sheet).
- **Hatch show:** each egg drops into the nest with a dust puff and takes three taps: a crack, a split with light leaking out, then a burst into two shell halves with a flash, shock rings and confetti. The glow climbs one rarity per tap until it reaches what is inside. The hero appears as a silhouette and fills with colour; Mythic and Legend get a screen shake, a MYTHIC! / LEGEND! callout, rainbow rays and confetti rain. The summary flips in its cards with a shine on Mythic and Legend. Particles are drawn on a canvas over the scene.
- **Further from the genre:** ability labels of our own (Hunter of, Bane of ×3, Hardy vs, shockwave, Tower Smasher, Last Stand, Spirit Breaker) and descriptions that use the game's trait names throughout.

## Version 1.5.1: coloured outlines

- **No more black outlines:** every hero and Gloom sprite now has a selective outline. Each edge pixel is a darker shade of the colour it borders, tinted toward a deep plum (heroes) or wine (Gloom) rather than black, and lit from the top left: top edges are lightest, then left, right and the bottom edge (darkest), with a slightly firmer edge on light colours so they read against bright skies. Third forms keep their rarity-tinted outline.
- **Closed outlines:** sprite canvases now get a 1-pixel margin before outlining, so feet on the ground line and weapons, ears or capes that reached the canvas edge are outlined all the way round.
