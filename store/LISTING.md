# Animal Wars — CrazyGames listing

## Assets (all in this folder)

| Asset | File | Size |
|---|---|---|
| Landscape cover | `cover-landscape-1920x1080.png` | 1920×1080 |
| Portrait cover | `cover-portrait-800x1200.png` | 800×1200 |
| Square cover | `cover-square-800x800.png` | 800×800 |
| Landscape preview video | `preview-landscape-1920x1080.mp4` | 1920×1080, about 24 s, H.264, no audio |
| Portrait preview video | `preview-portrait-1080x1920.mp4` | 1080×1920, about 24 s, H.264, no audio |

Check these against the current requirements in the Developer Portal before uploading. The three covers carry no text or logo: key art composed from the game's own sprites and paintings on one pixel grid, with the hamster crest in place of the logo (`tools/keyart.html?logo=0`, rendered by `npm run covers`). The videos come from `node tools/preview.js`: a fast montage of hard cuts (no fades) through six lands, bosses and a Legend hatch, recorded from real gameplay with the interface drawn smaller and the colour graded for extra vibrance, closing on a short key-art beat; the portrait video frames the same montage inside the portrait key art (the game itself is landscape only on phones).

## Category

**Strategy** (secondary: Tower Defense)

## Tags

Tower Defense, Strategy, Pixel, Animals, Cute, Collect, Upgrade, Army, Battle, Mobile, 1 Player, Casual

## Title

Animal Wars

## Short description

Lead 150 pixel animals against the Gloom! Deploy heroes, master 10 elements, rally your army with a Battle Cry, hatch rare heroes and free 24 lands.

## Description

The Gloom has taken over the world, and only your animals can stop it!

Deploy heroes down the battlefield, keep your acorn pouch growing, and rally your army with a mighty Battle Cry. Smash their tower before they reach your burrow!

- **150 animal heroes** in five rarities, from brave Pip the hamster to Legendary dragons and griffins, each with 3 forms to evolve into and an attack all of its own
- **10 elements** (Ember, Frost, Thorn, Storm, Shadow, Tide, Stone, Sun, Moon, Bloom): bring the right ones for ×1.5 damage, and team up three or five of a kind for a synergy bonus
- **864 stages** in 3 chapters across 24 lands (meadows, deserts, snowy peaks, swamps, volcanoes, harbour cities, sky islands, the moon, and their Gloom-twisted twins) on Normal, Hard and Nightmare
- **73 kinds of Gloom** with tricky traits (Airborne, Ironclad, Phantom, Venomous, Restless, Starborn) and 24 huge bosses
- **Scouting reports** before each battle show the Gloom's elements and the heroes that counter them
- **Hatch eggs** in the Royal Nest, the daily Elemental Nest and the Meadow Nest, with a three-tap hatch, featured heroes and shown odds
- **Level up and evolve** your heroes, upgrade the Lab, and build your perfect lineup of 10
- **The Gloom Tower**: how high can you climb? Compete on the leaderboard
- **Daily rewards**: login gifts, quests, events, a free egg every few hours, and an Acorn Farm that earns while you are away
- Earn 3 stars on every stage to open star chests

Every gem and egg is earned by playing.

## Controls

- **Tap a hero card** (or **1-0**): deploy a hero
- **Tap the pouch** (or **E**): upgrade your acorn pouch
- **Tap Battle Cry** (or **R** / **Space**): every hero on the field glows gold and fights harder for 8 seconds
- **Drag or scroll**: look around the battlefield (and any sideways list in the menus) · **F**: speed ×2 · **P**: pause · **M**: mute
- Works with touch on phones and tablets (landscape)

## Before you submit

1. **Leaderboard:** create it in the Developer Portal, paste its encryption key into `leaderboardKey` in `js/platform.js`, and rebuild.
2. Run `npm run build` and upload `dist/animal-wars.zip`.
3. Test in the Developer Portal preview: loading, gameplay start and stop, mute, midgame ads after battles, the rewarded ads (double coins, Second Wind, double farm), data sync, and score submission.
