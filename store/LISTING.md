# Animal Wars — CrazyGames listing

## Assets (all in this folder)

| Asset | File | Size |
|---|---|---|
| Landscape cover | `cover-landscape-1920x1080.png` | 1920×1080 |
| Portrait cover | `cover-portrait-800x1200.png` | 800×1200 |
| Square cover | `cover-square-800x800.png` | 800×800 |
| Landscape preview video | `preview-landscape-1920x1080.mp4` | 1920×1080, about 20 s, H.264, no audio |
| Portrait preview video | `preview-portrait-1080x1920.mp4` | 1080×1920, about 20 s, H.264, no audio |

Check these against the current requirements in the Developer Portal before uploading. Covers come from `npm run covers`, videos from `node tools/preview.js` (real gameplay, scaled up 2× with sharp pixels).

## Category

**Strategy** (secondary: Tower Defense)

## Tags

Tower Defense, Strategy, Pixel, Animals, Cute, Collect, Upgrade, Army, Battle, Mobile, 1 Player, Casual

## Title

Animal Wars

## Short description

Send an army of cute pixel animals to smash the Gloom! Deploy heroes, rally them with a Battle Cry, hatch rare animals and free 8 lands.

## Description

The Gloom has taken over the world, and only your animals can stop it!

Deploy heroes down the battlefield, keep your acorn pouch growing, and rally your army with a mighty Battle Cry. Smash their tower before they reach your burrow!

- **50 animal heroes** in five rarities, from brave Pip the hamster to Legendary dragons and griffins, each with 3 forms to evolve into
- **288 stages** across 8 lands (meadows, deserts, snowy peaks, swamps, volcanoes, robot cities, sky islands and the moon) on Normal, Hard and Nightmare
- **33 kinds of Gloom** with tricky traits: Winged, Armored, Spooky, Toxic, Undead and Cosmic, plus huge bosses
- **Hatch eggs** in the Royal Nest and Meadow Nest, with daily featured heroes and shown odds
- **Level up and evolve** your heroes, upgrade the Lab, and build your perfect lineup of 10
- **The Gloom Tower**: how high can you climb? Compete on the leaderboard
- **Daily rewards**: login gifts, quests, events, a free egg every few hours, and an Acorn Farm that earns while you are away
- Earn 3 stars on every stage to open star chests

Every gem and egg is earned by playing.

## Controls

- **Tap a hero card** (or **1-0**): deploy a hero
- **Tap the pouch** (or **E**): upgrade your acorn pouch
- **Tap Battle Cry** (or **R** / **Space**): every hero on the field glows gold and fights harder for 8 seconds
- **Drag or scroll**: look around the battlefield · **F**: speed ×2 · **P**: pause · **M**: mute
- Works with touch on phones and tablets (landscape)

## Before you submit

1. **Leaderboard:** create it in the Developer Portal, paste its encryption key into `leaderboardKey` in `js/platform.js`, and rebuild.
2. Run `npm run build` and upload `dist/animal-wars.zip`.
3. Test in the Developer Portal preview: loading, gameplay start and stop, mute, midgame ads after battles, the rewarded ads (double coins, Second Wind, double farm), data sync, and score submission.
