/* Animal Wars — content tables.
 * Heroes, Gloom enemies, regions, events, hatchery banners, missions and medals.
 * Pure data: no DOM, loads in Node and the browser.
 *
 * Stat keys (heroes and enemies, at level 1 / 100% magnification):
 *   hp, atk (damage per attack), rng (reach), spd (units per second), rate (seconds between attacks),
 *   fore (wind-up before the hit lands), kb (knockbacks over its whole health bar), area (hits everything in reach).
 * Hero-only: cost (acorns), cd (seconds before it can be deployed again).
 * Enemy-only: drop (acorns paid into your pouch when it falls), traits.
 * Abilities (ab): strong/massive/resist: [traits | 'all'], kb/crit/survive: chance, freeze/slow/weaken: [chance, seconds],
 *   wave: [chance, level], multi: hits per attack, base: damage multiplier against towers, burrow: distance,
 *   zkill: stops Undead from getting back up, immune: ['kb', 'freeze', 'slow', 'weaken'].
 */
(function (root) {
  'use strict';

  const RARITIES = [
    { id: 0, name: 'Starter', color: '#c3cfdb' },
    { id: 1, name: 'Rare', color: '#41a6f6' },
    { id: 2, name: 'Epic', color: '#a884f3' },
    { id: 3, name: 'Mythic', color: '#ffc23d' },
    { id: 4, name: 'Legend', color: '#ff6fd0' }
  ];

  const TRAITS = {
    winged: { name: 'Airborne', color: '#73eff7', desc: 'Flies over the field.' },
    armored: { name: 'Ironclad', color: '#94b0c2', desc: 'Takes only 10% damage. Critical hits and heroes strong against Ironclad ignore the plating.' },
    spooky: { name: 'Phantom', color: '#a884f3', desc: 'Dodges 1 in 4 hits unless the hero is strong against Phantom.' },
    toxic: { name: 'Venomous', color: '#a7f070', desc: 'Its hits poison heroes for 3 seconds.' },
    undead: { name: 'Restless', color: '#ef7d57', desc: 'Gets back up once at half health unless finished by a Spirit Breaker.' },
    cosmic: { name: 'Starborn', color: '#ff6fd0', desc: 'Takes half damage unless the hero is strong against Starborn.' }
  };

  // Look: sp = species painter, c = main colour, b = belly / second colour, a = accent, s = sprite size (px).
  // g = gear for forms 1, 2 and 3 (the painter adds it on top of the animal).
  const H = (id, names, rarity, look, st, ab, desc, unlock) => Object.assign({ id: id, names: names, rarity: rarity, look: look, ab: ab || {}, desc: desc, unlock: unlock || null }, st);
  const HEROES = [
    // Starters: unlocked by clearing story stages.
    H('pip', ['Pip', 'Captain Pip', 'Sir Pip the Bold'], 0, { sp: 'hamster', c: '#e8a35f', b: '#fff1d6', a: '#3b5dc9', s: 20, g: ['', 'helmet', 'knight'] },
      { hp: 110, atk: 9, rng: 20, spd: 16, rate: 1.2, fore: 0.25, kb: 3, cost: 50, cd: 2.0 }, null, 'Cheap, brave and always ready. Send lots of them to hold the line.'),
    H('shelly', ['Shelly', 'Bastion Shelly', 'Shelly the Rampart'], 0, { sp: 'turtle', c: '#5fb86b', b: '#c9a26b', a: '#94b0c2', s: 20, g: ['', 'helmet', 'spikes'] },
      { hp: 420, atk: 2, rng: 16, spd: 9, rate: 2.0, fore: 0.3, kb: 1, cost: 100, cd: 4.5 }, null, 'A walking wall. Barely hits, but almost nothing gets past her shell.'),
    H('spike', ['Spike', 'Spike Rider', 'Thornstorm Spike'], 0, { sp: 'hedgehog', c: '#9a6a4a', b: '#f3d9b5', a: '#ef7d57', s: 20, g: ['', 'scarf', 'flame'] },
      { hp: 180, atk: 22, rng: 22, spd: 13, rate: 1.4, fore: 0.3, kb: 3, cost: 150, cd: 5, area: true }, null, 'Rolls into crowds and pokes everything nearby.', [0, 1]),
    H('stretch', ['Stretch', 'Lancer Stretch', 'Skyneck Stretch'], 0, { sp: 'giraffe', c: '#f2c14e', b: '#a0612e', a: '#b13e53', s: 34, g: ['', 'lance', 'crown'] },
      { hp: 450, atk: 34, rng: 42, spd: 12, rate: 2.0, fore: 0.45, kb: 3, cost: 250, cd: 6.5 }, null, 'Long neck, long reach. Bonks enemies over the heads of your walls.', [0, 3]),
    H('dash', ['Dash', 'Dash Ninja', 'Blink Dash'], 0, { sp: 'rabbit', c: '#f4f4f4', b: '#ffa8c5', a: '#b13e53', s: 22, g: ['', 'headband', 'ninja'] },
      { hp: 200, atk: 16, rng: 18, spd: 36, rate: 0.5, fore: 0.1, kb: 4, cost: 300, cd: 7 }, null, 'Zooms in and lands a flurry of fast kicks.', [0, 5]),
    H('hoot', ['Hoot', 'Archer Hoot', 'Moonwing Hoot'], 0, { sp: 'owl', c: '#8a6a52', b: '#f0dcbc', a: '#38b764', s: 22, g: ['', 'bow', 'moon'] },
      { hp: 260, atk: 48, rng: 72, spd: 12, rate: 2.4, fore: 0.5, kb: 3, cost: 350, cd: 8 }, { strong: ['winged'] }, 'Keeps the skies clear. Strong against Airborne Gloom.', [0, 7]),
    H('croak', ['Croak', 'Croak Mortar', 'Thunder Croak'], 0, { sp: 'frog', c: '#6ccf5a', b: '#e8f5b0', a: '#ffcd75', s: 20, g: ['', 'cannon', 'storm'] },
      { hp: 160, atk: 80, rng: 120, spd: 8, rate: 3.6, fore: 0.6, kb: 3, cost: 500, cd: 12, area: true }, null, 'Lobs big bubbles from far behind the front line.', [0, 9]),
    H('bruno', ['Bruno', 'Grizzly Bruno', 'Titan Bruno'], 0, { sp: 'bear', c: '#8a5a3c', b: '#d9a874', a: '#ffcd75', s: 38, g: ['', 'helmet', 'crown'] },
      { hp: 1800, atk: 180, rng: 32, spd: 10, rate: 2.6, fore: 0.55, kb: 3, cost: 1000, cd: 22, area: true }, null, 'The big one. Smashes whole crowds with one swipe.', [0, 11]),
    H('gnasher', ['Gnasher', 'Gnasher Brute', 'Gnasher Rex'], 0, { sp: 'croc', c: '#3f8f52', b: '#d8e8a0', a: '#94b0c2', s: 26, g: ['', 'helmet', 'crown'] },
      { hp: 900, atk: 130, rng: 28, spd: 10, rate: 2.8, fore: 0.5, kb: 3, cost: 700, cd: 15 }, { crit: 0.1 }, 'Huge bite. Sometimes lands a critical chomp.', [1, 5]),

    // Rare
    H('nibbles', ['Nibbles', 'Acorn Ace Nibbles', 'Nutstorm Nibbles'], 1, { sp: 'squirrel', c: '#d0703a', b: '#ffe2bf', a: '#ffcd75', s: 20, g: ['', 'goggles', 'cape'] },
      { hp: 160, atk: 15, rng: 20, spd: 22, rate: 1.0, fore: 0.2, kb: 3, cost: 75, cd: 2.5 }, null, 'Even cheaper than Pip and twice as quick.'),
    H('baa', ['Baa', 'Woolwall Baa', 'Cloudfleece Baa'], 1, { sp: 'sheep', c: '#f4f4f4', b: '#4a3a4a', a: '#ffa8c5', s: 22, g: ['', 'bell', 'cloud'] },
      { hp: 820, atk: 4, rng: 16, spd: 10, rate: 2.0, fore: 0.3, kb: 2, cost: 150, cd: 5 }, { immune: ['kb'] }, 'So fluffy that knockback attacks just bounce off.'),
    H('sly', ['Sly', 'Ghostbane Sly', 'Spirit Fox Sly'], 1, { sp: 'fox', c: '#ef7d57', b: '#fff1e0', a: '#a884f3', s: 22, g: ['', 'charm', 'spirit'] },
      { hp: 350, atk: 42, rng: 26, spd: 16, rate: 1.6, fore: 0.3, kb: 3, cost: 300, cd: 7 }, { strong: ['spooky'] }, 'Sees through ghostly tricks. Strong against Phantom.'),
    H('honk', ['Honk', 'Honk Commander', 'Thunderhonk'], 1, { sp: 'goose', c: '#f4f4f4', b: '#d6dde6', a: '#ffa34d', s: 24, g: ['', 'helmet', 'storm'] },
      { hp: 320, atk: 36, rng: 24, spd: 18, rate: 1.5, fore: 0.3, kb: 3, cost: 280, cd: 7 }, { kb: 0.3 }, 'Its HONK knocks enemies back 30% of the time.'),
    H('billy', ['Billy', 'Battering Billy', 'Ram King Billy'], 1, { sp: 'goat', c: '#d8cbb5', b: '#f4f4f4', a: '#8a6a52', s: 24, g: ['', 'helmet', 'crown'] },
      { hp: 380, atk: 60, rng: 22, spd: 30, rate: 1.8, fore: 0.35, kb: 3, cost: 360, cd: 8 }, { base: 3 }, 'Charges straight for the Gloom tower and hits it 3× as hard.'),
    H('puff', ['Puff', 'Spiny Puff', 'Pufferstorm'], 1, { sp: 'puffer', c: '#ffcd75', b: '#fff1d6', a: '#41a6f6', s: 20, g: ['', 'spikes', 'bubble'] },
      { hp: 280, atk: 52, rng: 30, spd: 12, rate: 2.0, fore: 0.4, kb: 3, cost: 330, cd: 8, area: true }, { strong: ['toxic'] }, 'Puffs up and splashes crowds. Strong against Venomous.'),
    H('waddle', ['Waddle', 'Frost Waddle', 'Glacier Waddle'], 1, { sp: 'penguin', c: '#2b3352', b: '#f4f4f4', a: '#73eff7', s: 20, g: ['', 'scarf', 'ice'] },
      { hp: 300, atk: 30, rng: 26, spd: 14, rate: 1.6, fore: 0.3, kb: 3, cost: 320, cd: 8 }, { freeze: [0.2, 2] }, 'Slides in with a chilly slap that can freeze enemies for 2 seconds.'),
    H('dig', ['Dig', 'Tunnel Dig', 'Drillmaster Dig'], 1, { sp: 'mole', c: '#5a4a5e', b: '#ffa8c5', a: '#ffcd75', s: 20, g: ['', 'hardhat', 'drill'] },
      { hp: 300, atk: 60, rng: 22, spd: 16, rate: 1.8, fore: 0.3, kb: 3, cost: 380, cd: 9 }, { burrow: 90 }, 'Tunnels under the first enemy it meets and pops up behind the front line.'),
    H('drowsy', ['Drowsy', 'Dreamy Drowsy', 'Slumber Sage'], 1, { sp: 'sloth', c: '#a08a6a', b: '#e8d8b8', a: '#a884f3', s: 22, g: ['', 'nightcap', 'stars'] },
      { hp: 420, atk: 26, rng: 64, spd: 7, rate: 3.0, fore: 0.6, kb: 3, cost: 420, cd: 10, area: true }, { slow: [0.5, 3] }, 'Yawns so hard that enemies slow down for 3 seconds.'),
    H('polly', ['Polly', 'Sky Polly', 'Rainbow Polly'], 1, { sp: 'parrot', c: '#e04848', b: '#ffcd75', a: '#41a6f6', s: 22, g: ['', 'goggles', 'rainbow'] },
      { hp: 260, atk: 44, rng: 54, spd: 16, rate: 1.8, fore: 0.35, kb: 3, cost: 340, cd: 8 }, { strong: ['winged'] }, 'Chases flyers out of the sky. Strong against Airborne.'),
    H('chomp', ['Chomp', 'Lumber Chomp', 'Dam Breaker Chomp'], 1, { sp: 'beaver', c: '#8a5a3c', b: '#d9a874', a: '#ffcd75', s: 22, g: ['', 'hardhat', 'axe'] },
      { hp: 440, atk: 48, rng: 22, spd: 13, rate: 1.6, fore: 0.3, kb: 3, cost: 400, cd: 9 }, { base: 4 }, 'Gnaws through towers. Deals 4× damage to the Gloom tower.'),
    H('stinky', ['Stinky', 'Stink Bomber', 'Fumigator Stinky'], 1, { sp: 'skunk', c: '#2b2b3a', b: '#f4f4f4', a: '#a7f070', s: 22, g: ['', 'mask', 'cloud'] },
      { hp: 300, atk: 22, rng: 34, spd: 12, rate: 1.8, fore: 0.35, kb: 3, cost: 360, cd: 9, area: true }, { weaken: [0.4, 3], resist: ['toxic'] }, 'A stinky cloud weakens enemy attacks. Shrugs off Venomous hits.'),
    H('kiwi', ['Kiwi', 'Kiwi Blade', 'Kiwi Shogun'], 1, { sp: 'kiwi', c: '#8a6a3a', b: '#c8a070', a: '#94b0c2', s: 18, g: ['', 'sword', 'shogun'] },
      { hp: 220, atk: 40, rng: 20, spd: 28, rate: 1.0, fore: 0.15, kb: 3, cost: 320, cd: 7 }, { crit: 0.15 }, 'Tiny bird, sharp blade. 15% chance to land a critical hit.'),
    H('bonk', ['Bonk', 'Boxer Bonk', 'Champion Bonk'], 1, { sp: 'kangaroo', c: '#c8804a', b: '#f0d0a0', a: '#e04848', s: 28, g: ['', 'gloves', 'belt'] },
      { hp: 460, atk: 70, rng: 24, spd: 18, rate: 2.0, fore: 0.35, kb: 3, cost: 420, cd: 10 }, { kb: 0.4 }, 'A champion boxer. 40% chance to knock enemies flying.'),

    // Epic
    H('bamboo', ['Bamboo', 'Bamboo Monk', 'Grandmaster Bamboo'], 2, { sp: 'panda', c: '#f4f4f4', b: '#2b2b3a', a: '#38b764', s: 32, g: ['', 'staff', 'master'] },
      { hp: 1400, atk: 210, rng: 34, spd: 10, rate: 2.4, fore: 0.5, kb: 3, cost: 900, cd: 18, area: true }, { crit: 0.2 }, 'Staff spins that hit crowds, with a 20% critical chance.'),
    H('tusk', ['Tusk', 'Frostbite Tusk', 'Blizzard Tusk'], 2, { sp: 'walrus', c: '#a0705a', b: '#d8b090', a: '#73eff7', s: 30, g: ['', 'scarf', 'ice'] },
      { hp: 1700, atk: 110, rng: 28, spd: 9, rate: 2.6, fore: 0.5, kb: 3, cost: 1000, cd: 20, area: true }, { freeze: [0.3, 3] }, 'A belly flop that can freeze a whole crowd for 3 seconds.'),
    H('bolt', ['Bolt', 'Lightning Bolt', 'Bolt the Untouchable'], 2, { sp: 'greyhound', c: '#c8c8d8', b: '#f4f4f4', a: '#ffcd75', s: 26, g: ['', 'goggles', 'lightning'] },
      { hp: 600, atk: 150, rng: 26, spd: 56, rate: 1.0, fore: 0.15, kb: 3, cost: 800, cd: 12 }, null, 'The fastest hero on four legs.'),
    H('ronin', ['Ronin', 'Ronin Shiba', 'Shogun Shiba'], 2, { sp: 'shiba', c: '#e89a4a', b: '#fff1d6', a: '#b13e53', s: 26, g: ['', 'katana', 'shogun'] },
      { hp: 900, atk: 170, rng: 28, spd: 18, rate: 1.6, fore: 0.3, kb: 3, cost: 950, cd: 15 }, { crit: 0.3, massive: ['armored'] }, 'A clean cut through any plating. Bane of Ironclad.'),
    H('merlin', ['Merlin', 'Archmage Merlin', 'Merlin of Stars'], 2, { sp: 'raccoon', c: '#8a8a9a', b: '#d8d8e0', a: '#3b5dc9', s: 26, g: ['', 'wizard', 'archmage'] },
      { hp: 700, atk: 140, rng: 100, spd: 9, rate: 3.4, fore: 0.6, kb: 3, cost: 1100, cd: 20, area: true }, { wave: [1, 2] }, 'Every spell sends a magic wave rolling across the field.'),
    H('ramrod', ['Ramrod', 'Iron Ramrod', 'Siege Ramrod'], 2, { sp: 'rhino', c: '#8a94a8', b: '#c8d0dc', a: '#ffcd75', s: 34, g: ['', 'armor', 'siege'] },
      { hp: 3000, atk: 240, rng: 30, spd: 9, rate: 3.0, fore: 0.5, kb: 3, cost: 1300, cd: 25 }, { kb: 0.5 }, 'A living battering ram. Knocks enemies back half the time.'),
    H('nox', ['Nox', 'Night Hunter Nox', 'Count Nox'], 2, { sp: 'bat', c: '#4a3a6a', b: '#a884f3', a: '#b13e53', s: 24, g: ['', 'cape', 'count'] },
      { hp: 800, atk: 150, rng: 40, spd: 20, rate: 1.8, fore: 0.3, kb: 3, cost: 900, cd: 15 }, { strong: ['undead'], zkill: true }, 'Spirit Breaker: Restless foes it defeats stay down. Strong against Restless.'),
    H('shellbeard', ['Shellbeard', 'Captain Shellbeard', 'Admiral Shellbeard'], 2, { sp: 'crab', c: '#e04848', b: '#ffb08a', a: '#2b3352', s: 26, g: ['', 'pirate', 'admiral'] },
      { hp: 1200, atk: 180, rng: 80, spd: 8, rate: 3.2, fore: 0.6, kb: 3, cost: 1150, cd: 20, area: true }, { strong: ['cosmic'] }, 'Lobs boulders with its big claw. Strong against Starborn.'),
    H('hart', ['Hart', 'Stag Knight Hart', 'High King Hart'], 2, { sp: 'stag', c: '#a0603a', b: '#f0d0a0', a: '#94b0c2', s: 34, g: ['', 'knight', 'king'] },
      { hp: 2200, atk: 170, rng: 30, spd: 11, rate: 2.2, fore: 0.45, kb: 3, cost: 1150, cd: 20 }, { strong: ['armored'], resist: ['armored'] }, 'A knight in shell plate who fights Ironclad Gloom best.'),
    H('hanzo', ['Hanzo', 'Shadow Hanzo', 'Mirage Hanzo'], 2, { sp: 'chameleon', c: '#58c878', b: '#c8f0a0', a: '#2b2b3a', s: 22, g: ['', 'ninja', 'mirage'] },
      { hp: 700, atk: 180, rng: 48, spd: 18, rate: 2.0, fore: 0.3, kb: 3, cost: 950, cd: 15 }, { multi: 3, crit: 0.1 }, 'Throws three stars per attack, each able to crit.'),
    H('brawn', ['Brawn', 'Iron Brawn', 'Mountain Brawn'], 2, { sp: 'gorilla', c: '#4a4a5a', b: '#8a8a9a', a: '#e04848', s: 34, g: ['', 'gloves', 'crown'] },
      { hp: 2000, atk: 200, rng: 30, spd: 11, rate: 2.4, fore: 0.5, kb: 3, cost: 1400, cd: 25, area: true }, { strong: ['all'] }, 'Ground-pounds everything. Strong against every trait.'),
    H('trunk', ['Trunk', 'Rampart Trunk', 'Colossus Trunk'], 2, { sp: 'elephant', c: '#8a94b0', b: '#c8d0e0', a: '#ffa8c5', s: 38, g: ['', 'armor', 'howdah'] },
      { hp: 5200, atk: 80, rng: 26, spd: 8, rate: 2.6, fore: 0.5, kb: 1, cost: 1200, cd: 22 }, { immune: ['kb'] }, 'An unshakeable wall. Cannot be knocked back.'),

    // Mythic
    H('ember', ['Ember', 'Phoenix Ember', 'Solar Ember'], 3, { sp: 'phoenix', c: '#ef7d57', b: '#ffcd75', a: '#b13e53', s: 30, g: ['', 'flame', 'sun'] },
      { hp: 1800, atk: 300, rng: 60, spd: 18, rate: 2.4, fore: 0.4, kb: 3, cost: 1800, cd: 35, area: true }, { survive: 1, wave: [0.5, 3] }, 'Rises from its ashes once. Fire waves roll through the enemy.'),
    H('inky', ['Inky', 'Kraken Inky', 'Abyss Inky'], 3, { sp: 'octopus', c: '#a050b0', b: '#ffa8c5', a: '#41a6f6', s: 30, g: ['', 'pirate', 'abyss'] },
      { hp: 2500, atk: 260, rng: 150, spd: 7, rate: 3.8, fore: 0.7, kb: 3, cost: 2000, cd: 40, area: true }, { slow: [0.35, 3] }, 'Ink barrages from very far away that can slow enemies.'),
    H('storm', ['Storm', 'Thunderfang Storm', 'Tempest Storm'], 3, { sp: 'wolf', c: '#5a6a8a', b: '#c8d0e0', a: '#73eff7', s: 30, g: ['', 'lightning', 'tempest'] },
      { hp: 1600, atk: 280, rng: 32, spd: 30, rate: 1.4, fore: 0.25, kb: 3, cost: 1700, cd: 30 }, { wave: [0.4, 3], crit: 0.15 }, 'A howling streak of lightning that sends shock waves ahead.'),
    H('jade', ['Jade', 'Jade Serpent', 'Celestial Jade'], 3, { sp: 'serpent', c: '#38b764', b: '#c8f0a0', a: '#ffcd75', s: 30, g: ['', 'pearl', 'celestial'] },
      { hp: 2200, atk: 320, rng: 90, spd: 10, rate: 3.0, fore: 0.5, kb: 3, cost: 2000, cd: 40, area: true }, { wave: [1, 4], massive: ['cosmic'] }, 'Long jade waves on every attack. Bane of Starborn.'),
    H('nova', ['Nova', 'Star Whale Nova', 'Galaxy Nova'], 3, { sp: 'whale', c: '#3b5dc9', b: '#c8e0ff', a: '#ffcd75', s: 34, g: ['', 'stars', 'galaxy'] },
      { hp: 6000, atk: 300, rng: 60, spd: 6, rate: 3.6, fore: 0.6, kb: 3, cost: 2400, cd: 45, area: true }, { massive: ['cosmic'], resist: ['cosmic'] }, 'A whale that swims through space. Built to beat the Starborn.'),
    H('lumi', ['Lumi', 'Prism Lumi', 'Aurora Lumi'], 3, { sp: 'unicorn', c: '#f4f4f4', b: '#ffa8c5', a: '#a884f3', s: 32, g: ['', 'prism', 'aurora'] },
      { hp: 1800, atk: 360, rng: 40, spd: 20, rate: 2.0, fore: 0.35, kb: 3, cost: 1800, cd: 35 }, { massive: ['spooky', 'undead'], zkill: true }, 'Its light banishes ghosts and keeps the Restless down.'),
    H('thornhelm', ['Thornhelm', 'Warden Thornhelm', 'Ancient Thornhelm'], 3, { sp: 'moose', c: '#6a4a3a', b: '#c8a080', a: '#38b764', s: 38, g: ['', 'vines', 'ancient'] },
      { hp: 4000, atk: 260, rng: 36, spd: 10, rate: 2.6, fore: 0.5, kb: 3, cost: 2000, cd: 40, area: true }, { kb: 0.6 }, 'Mighty antlers fling enemies back 60% of the time.'),
    H('flutter', ['Flutter', 'Luna Flutter', 'Eclipse Flutter'], 3, { sp: 'moth', c: '#a884f3', b: '#73eff7', a: '#ffcd75', s: 28, g: ['', 'moon', 'eclipse'] },
      { hp: 1400, atk: 160, rng: 110, spd: 14, rate: 2.8, fore: 0.5, kb: 3, cost: 1700, cd: 35, area: true }, { slow: [1, 2] }, 'Glittering dust that always slows what it touches.'),
    H('frostmaw', ['Frostmaw', 'Glacier Frostmaw', 'Ice Age Frostmaw'], 3, { sp: 'mammoth', c: '#8a6a5a', b: '#e8f0ff', a: '#73eff7', s: 40, g: ['', 'ice', 'glacier'] },
      { hp: 7000, atk: 200, rng: 34, spd: 7, rate: 3.2, fore: 0.6, kb: 3, cost: 2200, cd: 45, area: true }, { freeze: [0.4, 2.5], immune: ['kb', 'freeze'] }, 'A frozen fortress that freezes crowds and never budges.'),
    H('lance', ['Lance', 'Narwhal Lance', 'Tidal Lance'], 3, { sp: 'narwhal', c: '#73a0d0', b: '#e8f0ff', a: '#ffcd75', s: 28, g: ['', 'knight', 'tidal'] },
      { hp: 2000, atk: 340, rng: 50, spd: 16, rate: 2.2, fore: 0.4, kb: 3, cost: 1900, cd: 35 }, { wave: [0.6, 3], crit: 0.2 }, 'A tusk lance that pierces with waves and critical hits.'),

    // Legend
    H('aerion', ['Aerion', 'Griffin Aerion', 'Sky Sovereign Aerion'], 4, { sp: 'griffin', c: '#e8b84a', b: '#f4f4f4', a: '#3b5dc9', s: 38, g: ['', 'crown', 'sovereign'] },
      { hp: 4000, atk: 500, rng: 60, spd: 20, rate: 2.2, fore: 0.4, kb: 3, cost: 3000, cd: 60, area: true }, { strong: ['all'], resist: ['winged'] }, 'Ruler of the skies. Strong against every trait.'),
    H('gaia', ['Gaia', 'World Shell Gaia', 'Primordial Gaia'], 4, { sp: 'bigturtle', c: '#4a8a5a', b: '#a08060', a: '#a7f070', s: 44, g: ['', 'forest', 'world'] },
      { hp: 15000, atk: 300, rng: 40, spd: 5, rate: 3.6, fore: 0.7, kb: 3, cost: 3200, cd: 70, area: true }, { immune: ['kb', 'freeze', 'slow', 'weaken'], resist: ['all'] }, 'Carries a forest on its shell. Nothing moves it.'),
    H('kitsu', ['Kitsu', 'Kitsune Kitsu', 'Ninefold Kitsu'], 4, { sp: 'kitsune', c: '#f4f4f4', b: '#ffa8c5', a: '#a884f3', s: 32, g: ['', 'charm', 'ninefold'] },
      { hp: 3000, atk: 300, rng: 120, spd: 16, rate: 2.6, fore: 0.4, kb: 3, cost: 3200, cd: 60, area: true }, { multi: 3, wave: [1, 5], crit: 0.2 }, 'Three fox-fire bursts and a long wave on every attack.'),
    H('raiju', ['Raiju', 'Storm Raiju', 'Heaven Raiju'], 4, { sp: 'thunderbird', c: '#3b5dc9', b: '#73eff7', a: '#ffcd75', s: 36, g: ['', 'lightning', 'heaven'] },
      { hp: 3500, atk: 650, rng: 70, spd: 24, rate: 2.0, fore: 0.35, kb: 3, cost: 3400, cd: 65, area: true }, { freeze: [0.3, 2], massive: ['winged'] }, 'A thunderbird whose lightning freezes foes. Bane of Airborne.'),
    H('drako', ['Drako', 'Dragon Lord Drako', 'Starfire Drako'], 4, { sp: 'dragon', c: '#b13e53', b: '#ffcd75', a: '#a884f3', s: 44, g: ['', 'crown', 'cosmic'] },
      { hp: 5000, atk: 800, rng: 100, spd: 12, rate: 3.4, fore: 0.6, kb: 3, cost: 3800, cd: 80, area: true }, { wave: [1, 6], strong: ['all'] }, 'Dragon fire that rolls across the whole field.')
  ];

  // Gloom enemies. look.sp names an enemy painter in sprites.js.
  const E = (id, name, traits, look, st, ab, desc) => Object.assign({ id: id, name: name, traits: traits, look: look, ab: ab || {}, desc: desc }, st);
  const ENEMIES = [
    E('gloop', 'Gloop', [], { sp: 'blob', c: '#7a6aa0', s: 16 }, { hp: 90, atk: 8, rng: 18, spd: 10, rate: 1.3, fore: 0.3, kb: 3, drop: 12 }, null, 'A grumpy puddle of gloom.'),
    E('grubby', 'Grubby', [], { sp: 'worm', c: '#a0708a', s: 16 }, { hp: 220, atk: 14, rng: 16, spd: 7, rate: 1.6, fore: 0.3, kb: 2, drop: 30 }, null, 'Slow, squishy and surprisingly tough.'),
    E('bonkle', 'Bonkle', [], { sp: 'imp', c: '#6a5aa0', s: 22 }, { hp: 320, atk: 34, rng: 22, spd: 13, rate: 1.7, fore: 0.35, kb: 3, drop: 55 }, null, 'An imp with a big club and a bad attitude.'),
    E('flapper', 'Flapper', ['winged'], { sp: 'batling', c: '#5a4a7a', s: 18 }, { hp: 200, atk: 20, rng: 26, spd: 18, rate: 1.2, fore: 0.25, kb: 3, drop: 45 }, null, 'Swoops in fast and pecks from above.'),
    E('grumbo', 'Grumbo', [], { sp: 'ogre', c: '#7a6a8a', s: 34 }, { hp: 1500, atk: 110, rng: 28, spd: 7, rate: 3.0, fore: 0.6, kb: 2, drop: 250, area: true }, null, 'A huge sulky brute that flattens anything in front of it.'),
    E('gloomking', 'Gloom King', [], { sp: 'king', c: '#5a3a8a', s: 44 }, { hp: 7000, atk: 240, rng: 40, spd: 6, rate: 3.2, fore: 0.7, kb: 4, drop: 900, area: true }, null, 'Ruler of the first Gloom tower. Its arrival shoves your army back.'),
    E('clank', 'Clank', ['armored'], { sp: 'beetle', c: '#8a94a8', s: 18 }, { hp: 120, atk: 22, rng: 20, spd: 9, rate: 1.5, fore: 0.3, kb: 1, drop: 300 }, null, 'A tin beetle. Tiny health, but its shell blocks 90% of damage.'),
    E('scorpo', 'Scorpo', [], { sp: 'scorpion', c: '#c0704a', s: 20 }, { hp: 450, atk: 50, rng: 26, spd: 20, rate: 1.4, fore: 0.3, kb: 3, drop: 90 }, null, 'Fast desert pincher.'),
    E('sandmaw', 'Sandmaw', [], { sp: 'sandworm', c: '#c09a5a', s: 48 }, { hp: 14000, atk: 350, rng: 46, spd: 5, rate: 3.4, fore: 0.7, kb: 3, drop: 1500, area: true }, null, 'A giant worm that swallows the dunes.'),
    E('boo', 'Boo', ['spooky'], { sp: 'ghost', c: '#c8c0f0', s: 20 }, { hp: 380, atk: 30, rng: 20, spd: 12, rate: 1.5, fore: 0.3, kb: 3, drop: 80 }, null, 'Hard to hit. Slips through one attack in four.'),
    E('wisp', 'Wisp', ['spooky', 'winged'], { sp: 'wisp', c: '#73eff7', s: 18 }, { hp: 300, atk: 40, rng: 56, spd: 15, rate: 2.0, fore: 0.4, kb: 3, drop: 90 }, null, 'A floating flame that zaps from range.'),
    E('snowgrump', 'Snowgrump', [], { sp: 'yeti', c: '#d8e0f0', s: 34 }, { hp: 3000, atk: 180, rng: 30, spd: 7, rate: 3.0, fore: 0.6, kb: 2, drop: 400, area: true }, null, 'A grumpy snow beast with heavy fists.'),
    E('yeti', 'Yeti Tyrant', ['spooky'], { sp: 'yetiboss', c: '#a8b8e0', s: 50 }, { hp: 22000, atk: 420, rng: 44, spd: 6, rate: 3.0, fore: 0.6, kb: 3, drop: 2000, area: true }, null, 'The tyrant of the peaks, half yeti and half blizzard.'),
    E('shroomy', 'Shroomy', ['toxic'], { sp: 'shroom', c: '#c04a6a', s: 20 }, { hp: 500, atk: 40, rng: 22, spd: 10, rate: 1.8, fore: 0.35, kb: 3, drop: 100 }, null, 'A toadstool with toxic spores.'),
    E('sludge', 'Sludgemound', ['toxic'], { sp: 'sludge', c: '#6a8a3a', s: 28 }, { hp: 2400, atk: 90, rng: 24, spd: 6, rate: 2.6, fore: 0.5, kb: 2, drop: 300, area: true }, null, 'A slow, bubbling hill of goo.'),
    E('toadlord', 'Toad Lord', ['toxic'], { sp: 'toad', c: '#5a7a3a', s: 34 }, { hp: 4000, atk: 260, rng: 90, spd: 6, rate: 3.6, fore: 0.7, kb: 2, drop: 600, area: true }, null, 'Spits toxic globs over your front line.'),
    E('baghag', 'Bog Hag', ['toxic', 'spooky'], { sp: 'hag', c: '#4a6a4a', s: 46 }, { hp: 30000, atk: 500, rng: 80, spd: 6, rate: 3.2, fore: 0.6, kb: 3, drop: 2500, area: true }, null, 'Stirs the swamp into a poisonous brew.'),
    E('cinder', 'Cinderbones', ['undead'], { sp: 'skeleton', c: '#e8dcc0', s: 22 }, { hp: 800, atk: 70, rng: 24, spd: 12, rate: 1.8, fore: 0.35, kb: 3, drop: 150 }, null, 'A smouldering skeleton that rattles back to its feet.'),
    E('ghoulie', 'Ghoulie', ['undead'], { sp: 'ghoul', c: '#7a9a7a', s: 20 }, { hp: 600, atk: 60, rng: 20, spd: 24, rate: 1.2, fore: 0.25, kb: 3, drop: 130 }, null, 'Shambles surprisingly quickly.'),
    E('magmite', 'Magmite', [], { sp: 'magma', c: '#ef7d57', s: 24 }, { hp: 1400, atk: 140, rng: 26, spd: 16, rate: 2.0, fore: 0.4, kb: 3, drop: 220, area: true }, null, 'A rolling lump of lava.'),
    E('lich', 'Cinder Lich', ['undead'], { sp: 'lich', c: '#5a3a5a', s: 50 }, { hp: 40000, atk: 650, rng: 90, spd: 5, rate: 3.4, fore: 0.7, kb: 3, drop: 3000, area: true }, null, 'Raises the bones of the caldera with fiery magic.'),
    E('ironslab', 'Iron Slab', ['armored'], { sp: 'golem', c: '#6a7488', s: 34 }, { hp: 600, atk: 150, rng: 28, spd: 6, rate: 3.0, fore: 0.6, kb: 1, drop: 900, area: true }, null, 'A walking wall of steel.'),
    E('buzzbot', 'Buzzbot', ['armored', 'winged'], { sp: 'drone', c: '#a0a8b8', s: 20 }, { hp: 180, atk: 70, rng: 40, spd: 16, rate: 1.6, fore: 0.3, kb: 2, drop: 500 }, null, 'A flying tin can with a zapper.'),
    E('mecha', 'Mecha Overlord', ['armored'], { sp: 'mecha', c: '#5a6478', s: 52 }, { hp: 3000, atk: 900, rng: 60, spd: 5, rate: 3.4, fore: 0.6, kb: 3, drop: 4000, area: true }, null, 'The machine that runs Rustbolt City.'),
    E('harpy', 'Harpy', ['winged'], { sp: 'harpy', c: '#8a6aa0', s: 24 }, { hp: 1200, atk: 120, rng: 30, spd: 22, rate: 1.4, fore: 0.3, kb: 3, drop: 200 }, null, 'Dives out of the clouds with sharp talons.'),
    E('thunderpuff', 'Thunderpuff', ['winged'], { sp: 'cloud', c: '#7a84a0', s: 28 }, { hp: 2000, atk: 200, rng: 100, spd: 8, rate: 3.6, fore: 0.6, kb: 2, drop: 350, area: true }, null, 'A storm cloud that rains lightning from far away.'),
    E('tempest', 'Tempest Queen', ['winged'], { sp: 'queen', c: '#6a5aa0', s: 50 }, { hp: 60000, atk: 900, rng: 70, spd: 8, rate: 2.8, fore: 0.5, kb: 4, drop: 5000, area: true }, null, 'Queen of the sky isles, crowned with lightning.'),
    E('zorp', 'Zorp', ['cosmic'], { sp: 'alien', c: '#7ad07a', s: 22 }, { hp: 2000, atk: 160, rng: 26, spd: 14, rate: 1.6, fore: 0.3, kb: 3, drop: 300 }, null, 'A little green invader with a big ray gun.'),
    E('starsquid', 'Star Squid', ['cosmic'], { sp: 'squid', c: '#d05aa0', s: 30 }, { hp: 4500, atk: 380, rng: 110, spd: 6, rate: 3.6, fore: 0.7, kb: 2, drop: 600, area: true }, null, 'Sprays star ink from far away.'),
    E('voideye', 'Void Eye', ['cosmic', 'winged'], { sp: 'eye', c: '#3a2a6a', s: 24 }, { hp: 3000, atk: 300, rng: 50, spd: 18, rate: 1.8, fore: 0.35, kb: 3, drop: 500 }, null, 'A floating eye that stares lasers.'),
    E('voidemp', 'Void Emperor', ['cosmic'], { sp: 'emperor', c: '#2a1a4a', s: 56 }, { hp: 90000, atk: 1400, rng: 80, spd: 5, rate: 3.0, fore: 0.6, kb: 4, drop: 8000, area: true }, null, 'The source of all Gloom. Beat it to save the world.'),
    E('goldie', 'Goldie', [], { sp: 'blob', c: '#ffc23d', s: 18 }, { hp: 600, atk: 10, rng: 18, spd: 8, rate: 1.5, fore: 0.3, kb: 1, drop: 200 }, { coins: 1 }, 'A shiny gloop stuffed with coins.'),
    E('seedling', 'Thornling', ['toxic'], { sp: 'shroom', c: '#5aa04a', s: 20 }, { hp: 900, atk: 60, rng: 22, spd: 10, rate: 1.8, fore: 0.35, kb: 3, drop: 120 }, null, 'Guards the seeds of the grove.')
  ];

  // Regions. pool.a = trickle, pool.b = support, pool.c = heavy; boss; lane length; coins at first and last stage.
  const REGIONS = [
    { id: 'meadow', name: 'Clover Meadow', theme: 0, lane: 560, pool: { a: ['gloop'], b: ['grubby', 'bonkle', 'flapper'], c: ['grumbo'] }, boss: 'gloomking', mag: [100, 260], baseHp: [500, 3000], coins: [200, 900],
      names: ['First Steps', 'Dandelion Drift', 'Buzzing Brook', 'Mossy Mile', 'Picnic Panic', 'Toadstool Ring', 'Windmill Way', 'Berry Bramble', 'Sunny Hollow', 'Petal Pass', 'Gloom Gate', 'King of Gloom'] },
    { id: 'dunes', name: 'Sunscorch Dunes', theme: 1, lane: 600, pool: { a: ['gloop', 'grubby'], b: ['scorpo', 'bonkle', 'clank'], c: ['grumbo'] }, boss: 'sandmaw', mag: [200, 420], baseHp: [3000, 7000], coins: [900, 1700],
      names: ['Hot Sands', 'Cactus Corner', 'Mirage Market', 'Scorpion Steps', 'Dune Surf', 'Oasis Ambush', 'Sandstorm Sprint', 'Tomb Doors', 'Bone Dry', 'Sunset Ridge', 'Quicksand Quarry', 'Maw of the Dunes'] },
    { id: 'peaks', name: 'Frostpine Peaks', theme: 2, lane: 640, pool: { a: ['bonkle', 'boo'], b: ['wisp', 'scorpo', 'flapper'], c: ['snowgrump'] }, boss: 'yeti', mag: [150, 300], baseHp: [6000, 12000], coins: [1500, 2800],
      names: ['Chilly Start', 'Pine Path', 'Snowball Fight', 'Frozen Falls', 'Icicle Alley', 'Avalanche!', 'Ghostly Grove', 'Glacier Gap', 'Blizzard Bend', 'Hollow Howls', 'Summit Siege', "Tyrant's Throne"] },
    { id: 'bog', name: 'Murkwood Bog', theme: 3, lane: 680, pool: { a: ['shroomy', 'boo'], b: ['sludge', 'wisp', 'scorpo'], c: ['toadlord'] }, boss: 'baghag', mag: [150, 300], baseHp: [10000, 18000], coins: [2800, 4800],
      names: ['Soggy Socks', 'Lily Pad Leap', 'Mushroom Maze', 'Fog Fen', 'Croaking Creek', 'Sludge Slide', 'Witchlight', 'Rotten Roots', 'Bubble Bog', "Hag's Hollow", 'Murk Heart', 'Brew of the Bog Hag'] },
    { id: 'caldera', name: 'Ember Caldera', theme: 4, lane: 720, pool: { a: ['cinder', 'ghoulie'], b: ['magmite', 'shroomy', 'boo'], c: ['sludge', 'snowgrump'] }, boss: 'lich', mag: [150, 300], baseHp: [16000, 26000], coins: [4800, 7600],
      names: ['Warm Welcome', 'Ash Fields', 'Lava Lane', 'Cinder Steps', 'Bonfire Bash', 'Crypt Gate', 'Magma Moat', 'Smoky Stair', 'Ember Graves', 'Fire Walk', 'Caldera Crown', "Lich's Furnace"] },
    { id: 'city', name: 'Rustbolt City', theme: 5, lane: 760, pool: { a: ['clank', 'ghoulie'], b: ['buzzbot', 'magmite', 'cinder'], c: ['ironslab', 'grumbo'] }, boss: 'mecha', mag: [200, 380], baseHp: [24000, 36000], coins: [7600, 11000],
      names: ['Scrap Street', 'Gear Grind', 'Neon Nights', 'Junk Yard', 'Bolt Boulevard', 'Factory Floor', 'Rust Rain', 'Clockwork Canal', 'Steel Plaza', 'Overdrive', 'Core Tower', 'Overlord Online'] },
    { id: 'sky', name: 'Skyreach Isles', theme: 6, lane: 800, pool: { a: ['harpy', 'flapper'], b: ['thunderpuff', 'buzzbot', 'wisp'], c: ['ironslab', 'snowgrump'] }, boss: 'tempest', mag: [200, 380], baseHp: [34000, 50000], coins: [11000, 15000],
      names: ['Cloud Hop', 'Feather Falls', 'Breezy Bridge', 'Thunder Drift', 'Sky Market', 'Kite Fight', 'Rainbow Run', 'Storm Front', 'Floating Fort', 'Eye of the Storm', 'Tempest Spire', 'Queen of Storms'] },
    { id: 'rift', name: 'Lunar Rift', theme: 7, lane: 840, pool: { a: ['zorp', 'harpy'], b: ['voideye', 'starsquid', 'cinder'], c: ['starsquid', 'ironslab'] }, boss: 'voidemp', mag: [200, 400], baseHp: [46000, 70000], coins: [15000, 22000],
      names: ['Moon Landing', 'Crater Hop', 'Zero-G Zone', 'Star Fields', 'Comet Tail', 'Void Cracks', 'Alien Outpost', 'Nebula Nest', 'Gravity Well', 'Eclipse', 'Rift Core', 'Emperor of the Void'] }
  ];

  const DIFFICULTIES = [
    { id: 0, name: 'Normal', mag: 1, rate: 1, coins: 1, gems: 1, color: '#a7f070' },
    { id: 1, name: 'Hard', mag: 2.6, rate: 1.15, coins: 2.2, gems: 1.5, color: '#ffcd75' },
    { id: 2, name: 'Nightmare', mag: 6.5, rate: 1.3, coins: 4.5, gems: 2, color: '#ff6fd0' }
  ];

  // Daily events: entries refill every day.
  const EVENTS = [
    { id: 'coins', name: 'Coin Cave', desc: 'Goldies stuffed with coins. Great for levelling up.', entries: 3, theme: 1, foes: ['goldie', 'gloop', 'clank'], reward: 'coins', unlock: 6 },
    { id: 'seeds', name: 'Seed Grove', desc: 'Win Growth Seeds and Star Fruit to evolve heroes to their third form.', entries: 2, theme: 3, foes: ['seedling', 'shroomy', 'sludge'], reward: 'seeds', unlock: 14 },
    { id: 'tickets', name: 'Egg Hunt', desc: 'Win Silver Eggs, and a Gold Egg on the hardest level.', entries: 2, theme: 0, foes: ['bonkle', 'flapper', 'grumbo'], reward: 'tickets', unlock: 10 }
  ];

  // Hatchery. Odds are shown in the game; pity guarantees a Mythic or better every 40 Royal hatches.
  const BANNERS = [
    { id: 'royal', name: 'Royal Nest', cost: 100, cost10: 900, ticket: 'gold', rates: [0, 62, 28, 9, 1], pity: { mythic: 40, legend: 150 }, desc: 'Every hero from Rare to Legend. A ×10 hatch always includes an Epic or better.' },
    { id: 'element', name: 'Elemental Nest', cost: 80, cost10: 720, ticket: 'gold', element: true, rates: [0, 60, 30, 9, 1], pity: null, desc: 'Only heroes of today\'s element, so you can build a full synergy team. A ×10 hatch always includes an Epic or better.' },
    { id: 'silver', name: 'Meadow Nest', cost: 0, ticket: 'silver', rates: [0, 80, 18, 2, 0], pity: null, desc: 'Rare, Epic and the odd Mythic, for Silver Eggs.' }
  ];

  // Lab: permanent upgrades bought with coins.
  const LAB = [
    { id: 'train', name: 'Training Grounds', desc: 'All heroes +3% health and attack', icon: 'train', max: 30, base: 300, per: 0.03 },
    { id: 'wrate', name: 'Acorn Hoarders', desc: 'Acorn income +6%', icon: 'acorn', max: 20, base: 200, per: 0.06 },
    { id: 'wcap', name: 'Bigger Pouch', desc: 'Pouch size +6%', icon: 'pouch', max: 20, base: 200, per: 0.06 },
    { id: 'base', name: 'Sturdy Burrow', desc: 'Burrow health +15%', icon: 'burrow', max: 20, base: 250, per: 0.15 },
    { id: 'rpow', name: 'Battle Cry Power', desc: 'Battle Cry attack boost +5%', icon: 'roar', max: 20, base: 250, per: 0.05 },
    { id: 'rchg', name: 'Cry Recharge', desc: 'Battle Cry charges 0.8 s faster', icon: 'charge', max: 20, base: 250, per: 0.8 },
    { id: 'cd', name: 'Quick Training', desc: 'Hero cooldowns -2%', icon: 'clock', max: 20, base: 300, per: 0.02 },
    { id: 'start', name: 'Head Start', desc: '+60 acorns when a battle starts', icon: 'start', max: 20, base: 150, per: 60 },
    { id: 'coin', name: 'Treasure Nose', desc: 'Coins from battles +6%', icon: 'coin', max: 20, base: 300, per: 0.06 }
  ];

  const ITEMS = [
    { id: 'rush', name: 'Acorn Rush', desc: 'Start with a Level 3 pouch and 600 acorns.', price: 1500 },
    { id: 'armor', name: 'Iron Burrow', desc: 'Your burrow has +60% health.', price: 1500 },
    { id: 'roar', name: 'Ready Cry', desc: 'Battle Cry starts charged and charges 30% faster.', price: 1200 },
    { id: 'charm', name: 'Lucky Clover', desc: 'Double coins from this battle.', price: 2500 }
  ];

  // Daily missions: 4 a day, chosen from this pool.
  const MISSIONS = [
    { id: 'win', text: 'Win {n} battles', stat: 'wins', n: 3, gems: 30 },
    { id: 'deploy', text: 'Deploy {n} heroes', stat: 'deploys', n: 60, gems: 20 },
    { id: 'kills', text: 'Defeat {n} Gloom', stat: 'kills', n: 150, gems: 25 },
    { id: 'roar', text: 'Use Battle Cry {n} times', stat: 'roars', n: 5, gems: 20 },
    { id: 'hatch', text: 'Hatch {n} egg', stat: 'hatches', n: 1, gems: 30 },
    { id: 'level', text: 'Level up heroes {n} times', stat: 'levelups', n: 3, gems: 25 },
    { id: 'pouch', text: 'Upgrade your pouch {n} times', stat: 'pouches', n: 10, gems: 20 },
    { id: 'event', text: 'Clear {n} event stage', stat: 'events', n: 1, gems: 30, needs: 6 },
    { id: 'boss', text: 'Defeat {n} boss', stat: 'bosses', n: 1, gems: 30 },
    { id: 'tower', text: 'Climb {n} tower floor', stat: 'towerWins', n: 1, gems: 30, needs: 12 },
    { id: 'stars', text: 'Win {n} battles with 3 stars', stat: 'perfects', n: 2, gems: 30 }
  ];

  // 7-day login calendar (repeats).
  const LOGIN = [
    { gems: 100 }, { silver: 2 }, { coins: 3000 }, { gems: 150 }, { items: 1 }, { silver: 3 }, { gold: 1, gems: 200 }
  ];

  // Medals: [stat, thresholds, name pattern, gems per tier]
  const MEDALS = [
    { stat: 'clears0', tiers: [5, 12, 24, 48, 96, 192, 288], name: 'Story Clears', text: 'Clear {n} Normal stages', gems: [30, 60, 100, 150, 300, 500, 800] },
    { stat: 'clears1', tiers: [6, 24, 48, 96, 192, 288], name: 'Hard Clears', text: 'Clear {n} Hard stages', gems: [60, 120, 200, 400, 600, 900] },
    { stat: 'clears2', tiers: [6, 24, 48, 96, 192, 288], name: 'Nightmare Clears', text: 'Clear {n} Nightmare stages', gems: [100, 200, 300, 600, 900, 1500] },
    { stat: 'stars', tiers: [30, 100, 250, 500, 1000, 2592], name: 'Star Collector', text: 'Earn {n} stars', gems: [30, 80, 150, 300, 800, 1500] },
    { stat: 'kills', tiers: [100, 1000, 5000, 20000, 100000], name: 'Gloom Buster', text: 'Defeat {n} Gloom', gems: [20, 50, 100, 200, 400] },
    { stat: 'bosses', tiers: [1, 5, 20, 50], name: 'Boss Breaker', text: 'Defeat {n} bosses', gems: [30, 80, 150, 300] },
    { stat: 'hatches', tiers: [10, 50, 150, 400], name: 'Egg Whisperer', text: 'Hatch {n} eggs', gems: [50, 100, 200, 400] },
    { stat: 'owned', tiers: [10, 20, 30, 50, 75, 100, 150], name: 'Menagerie', text: 'Own {n} heroes', gems: [40, 80, 150, 250, 400, 600, 1000] },
    { stat: 'maxLevel', tiers: [10, 20, 30, 40, 50], name: 'Drill Sergeant', text: 'Get a hero to level {n}', gems: [20, 60, 120, 200, 400] },
    { stat: 'form3', tiers: [1, 5, 15, 30], name: 'Final Form', text: 'Evolve {n} heroes to their third form', gems: [50, 100, 200, 400] },
    { stat: 'tower', tiers: [5, 15, 30, 50, 100], name: 'Tower Climber', text: 'Reach tower floor {n}', gems: [30, 80, 150, 250, 500] },
    { stat: 'roars', tiers: [10, 100, 500], name: 'Big Voice', text: 'Use Battle Cry {n} times', gems: [20, 60, 120] },
    { stat: 'deploys', tiers: [100, 1000, 10000], name: 'Recruiter', text: 'Deploy {n} heroes', gems: [20, 60, 150] },
    { stat: 'logins', tiers: [3, 7, 14, 30, 60], name: 'Regular', text: 'Log in on {n} days', gems: [30, 70, 120, 200, 400] }
  ];

  // ---------------------------------------------------------------------------
  // v1.5: Elements, 100 element heroes, new Gloom, chapters 2 and 3.
  // ---------------------------------------------------------------------------
  // Elements: every hero and every Gloom has one. Hitting an element you are strong against deals 1.5× damage;
  // hitting one that is strong against you deals 0.75×. Each element beats two and loses to two.
  // Lineups with 3 or more heroes of one element get a synergy bonus (see core.js).
  const ELEMENTS = {
    ember: { name: 'Ember', color: '#ff7a3a', strong: ['thorn', 'frost'], forms: ['Ember', 'Blaze', 'Inferno'], ab: 'Critical hits' },
    frost: { name: 'Frost', color: '#73d8ff', strong: ['storm', 'bloom'], forms: ['Frost', 'Glacier', 'Blizzard'], ab: 'Freezes foes' },
    thorn: { name: 'Thorn', color: '#5ac54f', strong: ['tide', 'stone'], forms: ['Thorn', 'Bramble', 'Wildwood'], ab: 'Weakens foes' },
    storm: { name: 'Storm', color: '#ffe066', strong: ['tide', 'shadow'], forms: ['Spark', 'Thunder', 'Tempest'], ab: 'Shock waves' },
    shadow: { name: 'Shadow', color: '#9a6ae0', strong: ['moon', 'bloom'], forms: ['Shade', 'Phantom', 'Eclipse'], ab: 'Breaks Restless spirits' },
    tide: { name: 'Tide', color: '#3b8ae0', strong: ['ember', 'stone'], forms: ['Tide', 'Torrent', 'Maelstrom'], ab: 'Knocks foes back' },
    stone: { name: 'Stone', color: '#a08a70', strong: ['storm', 'ember'], forms: ['Pebble', 'Boulder', 'Mountain'], ab: 'Cannot be knocked back' },
    sun: { name: 'Sun', color: '#ffc23d', strong: ['shadow', 'frost'], forms: ['Sunny', 'Radiant', 'Solar'], ab: 'Strong vs Phantom and Restless' },
    moon: { name: 'Moon', color: '#c9b3ff', strong: ['sun', 'thorn'], forms: ['Moon', 'Starlit', 'Celestial'], ab: 'Strong vs Starborn and Airborne' },
    bloom: { name: 'Bloom', color: '#ff8fd0', strong: ['sun', 'moon'], forms: ['Bloom', 'Blossom', 'Everbloom'], ab: 'May survive a fatal hit' }
  };
  const EL_KEYS = Object.keys(ELEMENTS);
  const HERO_EL = { pip: 'sun', shelly: 'tide', spike: 'thorn', stretch: 'sun', dash: 'storm', hoot: 'moon', croak: 'tide', bruno: 'stone', gnasher: 'tide',
    nibbles: 'thorn', baa: 'bloom', billy: 'stone', bonk: 'storm', chomp: 'thorn', dig: 'stone', drowsy: 'thorn', honk: 'sun', kiwi: 'storm', polly: 'bloom', puff: 'tide',
    sly: 'shadow', stinky: 'shadow', waddle: 'frost', bamboo: 'thorn', bolt: 'storm', brawn: 'stone', hanzo: 'shadow', hart: 'thorn', merlin: 'moon', nox: 'shadow',
    ramrod: 'stone', ronin: 'ember', shellbeard: 'tide', trunk: 'stone', tusk: 'frost', ember: 'ember', flutter: 'moon', frostmaw: 'frost', inky: 'tide', jade: 'thorn',
    lance: 'frost', lumi: 'bloom', nova: 'moon', storm: 'storm', thornhelm: 'thorn', aerion: 'sun', drako: 'ember', gaia: 'thorn', kitsu: 'ember', raiju: 'storm' };
  HEROES.forEach((h) => { h.el = HERO_EL[h.id] || 'sun'; });

  // 25 species × 4 elements. Roles set the stat shape; rarity scales it; the element adds its ability.
  const ROLES = {
    tank: { hp: 900, atk: 6, rng: 16, spd: 9, rate: 2.0, fore: 0.3, kb: 1, cost: 160, cd: 5, d: 'A sturdy wall that soaks up hits.' },
    swarm: { hp: 150, atk: 14, rng: 18, spd: 22, rate: 1.0, fore: 0.2, kb: 3, cost: 70, cd: 2.5, d: 'Cheap and quick: send lots of them.' },
    fighter: { hp: 380, atk: 45, rng: 22, spd: 16, rate: 1.6, fore: 0.3, kb: 3, cost: 330, cd: 8, d: 'A solid all-round fighter.' },
    runner: { hp: 360, atk: 60, rng: 22, spd: 34, rate: 1.2, fore: 0.2, kb: 3, cost: 380, cd: 9, d: 'Races to the front and strikes first.' },
    ranged: { hp: 260, atk: 46, rng: 70, spd: 12, rate: 2.4, fore: 0.5, kb: 3, cost: 360, cd: 9, d: 'Attacks from behind the front line.' },
    brawler: { hp: 1100, atk: 120, rng: 28, spd: 10, rate: 2.6, fore: 0.5, kb: 3, cost: 800, cd: 16, area: true, d: 'A heavy hitter that hits crowds.' }
  };
  const SPECIES = [
    ['otter', 'Otter', 'fighter', 22, '#8a5a3c', '#e8c8a0', '#e8c8a0'], ['capybara', 'Capybara', 'tank', 24, '#a0704a', '#d8b088', '#d8b088'],
    ['hippo', 'Hippo', 'brawler', 34, '#8a8aa8', '#e0b0c0', '#e0b0c0'], ['koala', 'Koala', 'tank', 22, '#9aa3b2', '#f0f0f0', '#f0f0f0'],
    ['duck', 'Duck', 'swarm', 18, '#f4f0e0', '#ffd36b', '#ffd36b'], ['flamingo', 'Flamingo', 'ranged', 28, '#ff8fb1', '#ffd0dc', '#ffd0dc'],
    ['pig', 'Pig', 'fighter', 22, '#ffb0b8', '#ffe0e4', '#ffe0e4'], ['bull', 'Bull', 'brawler', 32, '#6a4030', '#c09070', '#f4f0e0'],
    ['pony', 'Pony', 'runner', 28, '#c08a52', '#f0d8b0', '#5a3420'], ['llama', 'Llama', 'ranged', 28, '#f0e0c8', '#fff4e0', '#fff4e0'],
    ['zebra', 'Zebra', 'runner', 28, '#f4f4f4', '#2a2030', '#2a2030'], ['gecko', 'Gecko', 'fighter', 20, '#6ccf5a', '#e8f5b0', '#ffcd4d'],
    ['armadillo', 'Armadillo', 'tank', 22, '#b09080', '#c8a890', '#c8a890'], ['mouse', 'Mouse', 'swarm', 18, '#b8b8c8', '#f0e0e8', '#f0e0e8'],
    ['ferret', 'Ferret', 'runner', 22, '#d8c0a0', '#fff4e0', '#5a4030'], ['seal', 'Seal', 'tank', 26, '#8a9ab8', '#dfe6f2', '#dfe6f2'],
    ['shark', 'Shark', 'brawler', 30, '#6a8ab8', '#e8f0ff', '#e8f0ff'], ['toucan', 'Toucan', 'ranged', 22, '#2a2a3a', '#fff1d6', '#fff1d6'],
    ['ostrich', 'Ostrich', 'runner', 32, '#3a3040', '#f0d0c0', '#f4f0e8'], ['rooster', 'Rooster', 'fighter', 22, '#f4ece0', '#ffd36b', '#c83e4e'],
    ['bee', 'Bee', 'ranged', 20, '#ffcd4d', '#2a2030', '#2a2030'], ['ladybug', 'Ladybug', 'tank', 20, '#e04848', '#2a2030', '#2a2030'],
    ['snail', 'Snail', 'tank', 20, '#c8b090', '#e8a0c0', '#e8a0c0'], ['badger', 'Badger', 'brawler', 26, '#4a4a5a', '#a0a0b0', '#a0a0b0'],
    ['yak', 'Yak', 'brawler', 34, '#6a5040', '#a08870', '#e8e0d0']
  ];
  const EL_GEAR = { ember: ['scarf', 'flame'], frost: ['ice', 'glacier'], thorn: ['vines', 'forest'], storm: ['storm', 'lightning'], shadow: ['mask', 'eclipse'],
    tide: ['bubble', 'tidal'], stone: ['helmet', 'armor'], sun: ['crown', 'sun'], moon: ['nightcap', 'moon'], bloom: ['charm', 'rainbow'] };
  const POW = [2.2, 1, 2.8, 5, 9], COST = [2.1, 1, 2.6, 5.2, 8.5], CD = [1.6, 1, 1.9, 4, 7];
  function hexMix(a, b, t) { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); const c = (sh) => Math.round(((x >> sh) & 255) + ((((y >> sh) & 255) - ((x >> sh) & 255)) * t)); return '#' + [16, 8, 0].map((sh) => c(sh).toString(16).padStart(2, '0')).join(''); }
  function elementAb(el, r, role) {
    const t = r === 0 ? 2 : r;
    switch (el) {
      case 'ember': return { crit: +(0.08 + 0.04 * t).toFixed(2) };
      case 'frost': return { freeze: [+(0.12 + 0.04 * t).toFixed(2), +(1.2 + 0.3 * t).toFixed(1)] };
      case 'thorn': return { weaken: [+(0.2 + 0.05 * t).toFixed(2), +(2 + 0.4 * t).toFixed(1)] };
      case 'storm': return { wave: [+(0.2 + 0.08 * t).toFixed(2), 1 + t] };
      case 'shadow': return { crit: +(0.06 + 0.03 * t).toFixed(2), zkill: true };
      case 'tide': return { kb: +(0.15 + 0.07 * t).toFixed(2) };
      case 'stone': return { immune: ['kb'] };
      case 'sun': return { strong: ['spooky', 'undead'] };
      case 'moon': return { strong: ['cosmic', 'winged'] };
      default: return { survive: Math.min(1, +(0.2 + 0.1 * t).toFixed(2)) };
    }
  }
  // Rarities for the 100: 16 story recruits, 32 Rare, 26 Epic, 16 Mythic, 10 Legend, dealt out with a fixed shuffle.
  const RAR_DECK = [].concat(Array(16).fill(0), Array(32).fill(1), Array(26).fill(2), Array(16).fill(3), Array(10).fill(4));
  (function shuffle(a) { let x = 7; for (let i = a.length - 1; i > 0; i--) { x = (x * 16807) % 2147483647; const j = x % (i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } })(RAR_DECK);
  let recruit = 0;
  SPECIES.forEach((sp, si) => {
    const [spId, spName, role, size, col, belly, acc] = sp;
    const rars = RAR_DECK.slice(si * 4, si * 4 + 4).sort((a, b) => a - b);
    for (let j = 0; j < 4; j++) {
      const el = EL_KEYS[(si * 4 + j) % EL_KEYS.length], E = ELEMENTS[el], r = rars[j], ro = ROLES[role];
      const stoneMod = el === 'stone' ? [1.25, 0.85] : [1, 1];
      const st = {
        hp: Math.round(ro.hp * POW[r] * stoneMod[0] / 10) * 10, atk: Math.max(1, Math.round(ro.atk * POW[r] * stoneMod[1])), rng: ro.rng + (r >= 3 ? 10 : 0), spd: ro.spd, rate: ro.rate, fore: ro.fore,
        kb: ro.kb, cost: Math.round(ro.cost * COST[r] / 10) * 10, cd: +(ro.cd * CD[r]).toFixed(1), area: !!ro.area || (role === 'ranged' && r >= 3)
      };
      const unlock = r === 0 ? [8 + (recruit++ % 16), 5] : null;
      const look = { sp: spId, c: hexMix(col, E.color, 0.28), b: belly, a: E.color, s: size + (r >= 3 ? 4 : 0), g: [''].concat(EL_GEAR[el]) };
      const h = H(spId + '_' + el, [E.forms[0] + ' ' + spName, E.forms[1] + ' ' + spName, E.forms[2] + ' ' + spName], r, look, st, elementAb(el, r, role), ro.d + ' ' + E.name + ': ' + E.ab.toLowerCase() + '.', unlock);
      h.el = el;
      HEROES.push(h);
    }
  });

  // Balance pass: every hero gets the same value for its acorns within a rarity, with only a small premium for
  // higher rarities (they are bigger and dearer, not a better deal). Value is health × damage per second per
  // acorn², worth more for area attacks and reach. Health and attack are scaled together so each hero keeps its
  // shape (tank, glass cannon...), and abilities are untouched.
  const VALUE = (h) => h.hp * h.atk / h.rate / (h.cost * h.cost) * (h.area ? 1.4 : 1) * (1 + h.rng / 120);
  const PREMIUM = [1, 1, 1.05, 1.1, 1.15], BASE_VALUE = 0.072;
  HEROES.forEach((h) => {
    const k = Math.sqrt(BASE_VALUE * PREMIUM[h.rarity] / VALUE(h));
    h.hp = Math.max(40, Math.round(h.hp * k / 10) * 10);
    h.atk = Math.max(1, Math.round(h.atk * k));
  });

  // New Gloom: eight new kinds (two each), eight returning kinds in new colours, and sixteen bosses for chapters 2 and 3.
  const ENEMY_EL = { gloop: 'shadow', grubby: 'thorn', bonkle: 'shadow', flapper: 'storm', grumbo: 'stone', gloomking: 'shadow', clank: 'stone', scorpo: 'ember', sandmaw: 'stone',
    boo: 'moon', wisp: 'frost', snowgrump: 'frost', yeti: 'frost', shroomy: 'thorn', sludge: 'tide', toadlord: 'tide', baghag: 'thorn', cinder: 'ember', ghoulie: 'shadow',
    magmite: 'ember', lich: 'ember', ironslab: 'stone', buzzbot: 'storm', mecha: 'storm', harpy: 'storm', thunderpuff: 'storm', tempest: 'storm', zorp: 'moon',
    starsquid: 'moon', voideye: 'shadow', voidemp: 'shadow', goldie: 'sun', seedling: 'bloom' };
  ENEMIES.forEach((e) => { e.el = ENEMY_EL[e.id] || 'shadow'; });
  const NE = (id, name, el, traits, sp, c, s, st, ab, desc) => { const e = E(id, name, traits, { sp: sp, c: c, s: s }, st, ab, desc); e.el = el; ENEMIES.push(e); };
  NE('skitter', 'Skitter', 'shadow', [], 'spider', '#4a3a5a', 18, { hp: 700, atk: 60, rng: 20, spd: 26, rate: 1.0, fore: 0.2, kb: 3, drop: 120 }, null, 'A quick gloom spider that swarms the front line.');
  NE('webmaw', 'Webmaw', 'thorn', [], 'spider', '#3a5a3a', 30, { hp: 5000, atk: 320, rng: 90, spd: 6, rate: 3.4, fore: 0.6, kb: 2, drop: 700, area: true }, { slow: [0.5, 2] }, 'Spits sticky webs over your heroes.');
  NE('gloomguard', 'Gloomguard', 'stone', ['armored'], 'gknight', '#5a6478', 24, { hp: 900, atk: 160, rng: 24, spd: 10, rate: 2.0, fore: 0.4, kb: 2, drop: 800 }, null, 'A knight in gloom-forged plate.');
  NE('darkpaladin', 'Dark Paladin', 'shadow', ['armored'], 'gknight', '#3a2a5a', 32, { hp: 2400, atk: 420, rng: 30, spd: 8, rate: 2.6, fore: 0.5, kb: 2, drop: 1600, area: true }, null, 'Its great sword cleaves whole lines.');
  NE('shade', 'Shade', 'shadow', ['spooky'], 'wraith', '#5a4a7a', 22, { hp: 2200, atk: 180, rng: 60, spd: 14, rate: 2.0, fore: 0.4, kb: 3, drop: 300 }, null, 'A hooded phantom that hurls dark bolts.');
  NE('banshee', 'Banshee', 'moon', ['spooky', 'winged'], 'wraith', '#a8b8e0', 24, { hp: 3000, atk: 260, rng: 50, spd: 18, rate: 1.8, fore: 0.35, kb: 3, drop: 420 }, { weaken: [0.3, 3] }, 'Its wail weakens heroes.');
  NE('totem', 'Gloom Totem', 'stone', [], 'totem', '#8a6a4a', 28, { hp: 9000, atk: 140, rng: 40, spd: 4, rate: 3.0, fore: 0.6, kb: 1, drop: 600, area: true }, null, 'A stack of grumpy faces. Very hard to move.');
  NE('hextotem', 'Hex Totem', 'thorn', [], 'totem', '#4a7a5a', 30, { hp: 7000, atk: 220, rng: 110, spd: 4, rate: 3.6, fore: 0.7, kb: 1, drop: 700, area: true }, { weaken: [0.4, 3] }, 'Casts weakening hexes from afar.');
  NE('shardling', 'Shardling', 'moon', ['cosmic'], 'crystal', '#c08aff', 20, { hp: 2600, atk: 200, rng: 22, spd: 16, rate: 1.6, fore: 0.3, kb: 3, drop: 350 }, null, 'A living crystal shard.');
  NE('prismgolem', 'Prism Golem', 'sun', ['cosmic'], 'crystal', '#73eff7', 34, { hp: 12000, atk: 520, rng: 32, spd: 6, rate: 3.0, fore: 0.6, kb: 2, drop: 1200, area: true }, null, 'Bends starlight into crushing blows.');
  NE('ratling', 'Ratling', 'shadow', [], 'rat', '#7a6a7a', 16, { hp: 500, atk: 40, rng: 16, spd: 30, rate: 0.9, fore: 0.2, kb: 3, drop: 60 }, null, 'Comes in packs. Lots of packs.');
  NE('plaguerat', 'Plague Rat', 'thorn', ['toxic'], 'rat', '#6a8a4a', 22, { hp: 1800, atk: 120, rng: 20, spd: 22, rate: 1.4, fore: 0.3, kb: 3, drop: 250 }, null, 'Venomous bites from a very big rat.');
  NE('jellyfloat', 'Jellyfloat', 'tide', ['winged'], 'jelly', '#73b8ff', 22, { hp: 2400, atk: 200, rng: 70, spd: 10, rate: 2.4, fore: 0.5, kb: 3, drop: 320 }, { slow: [0.3, 2] }, 'Drifts over the field and stings from above.');
  NE('stormjelly', 'Storm Jelly', 'storm', ['winged'], 'jelly', '#ffe066', 28, { hp: 4000, atk: 360, rng: 90, spd: 8, rate: 3.0, fore: 0.6, kb: 2, drop: 600, area: true }, null, 'Crackles with lightning.');
  NE('boomer', 'Boomer', 'ember', [], 'bomber', '#3a3a4a', 20, { hp: 900, atk: 500, rng: 18, spd: 20, rate: 3.0, fore: 0.6, kb: 1, drop: 300, area: true }, null, 'Runs in and goes boom. Stop it early.');
  NE('megaboom', 'Megaboom', 'ember', ['armored'], 'bomber', '#5a4a3a', 30, { hp: 1500, atk: 1200, rng: 24, spd: 10, rate: 4.0, fore: 0.8, kb: 1, drop: 1500, area: true }, null, 'An armoured bomb on legs.');
  NE('tarblob', 'Tar Blob', 'thorn', [], 'blob', '#3a3a2a', 20, { hp: 1600, atk: 70, rng: 18, spd: 9, rate: 1.4, fore: 0.3, kb: 2, drop: 140 }, null, 'A sticky blob of tar.');
  NE('ironbonkle', 'Iron Bonkle', 'stone', ['armored'], 'imp', '#8a94a8', 24, { hp: 600, atk: 140, rng: 22, spd: 12, rate: 1.7, fore: 0.35, kb: 2, drop: 700 }, null, 'A bonkle in a tin suit.');
  NE('frostwisp', 'Frost Wisp', 'frost', ['spooky', 'winged'], 'wisp', '#dff6ff', 20, { hp: 1800, atk: 180, rng: 60, spd: 15, rate: 2.0, fore: 0.4, kb: 3, drop: 260 }, { freeze: [0.2, 1.5] }, 'Its cold flame freezes heroes.');
  NE('venomshroom', 'Venomshroom', 'thorn', ['toxic'], 'shroom', '#8a3aa0', 22, { hp: 2400, atk: 150, rng: 24, spd: 10, rate: 1.8, fore: 0.35, kb: 3, drop: 260 }, null, 'A deadly purple toadstool.');
  NE('rustdrone', 'Rust Drone', 'storm', ['armored', 'winged'], 'drone', '#b07a4a', 22, { hp: 500, atk: 220, rng: 44, spd: 16, rate: 1.6, fore: 0.3, kb: 2, drop: 900 }, null, 'An old drone with a new zapper.');
  NE('nightharpy', 'Night Harpy', 'shadow', ['winged'], 'harpy', '#3a2a4a', 26, { hp: 3600, atk: 300, rng: 30, spd: 22, rate: 1.4, fore: 0.3, kb: 3, drop: 450 }, null, 'Hunts by moonlight.');
  NE('graveghoul', 'Grave Ghoul', 'shadow', ['undead'], 'ghoul', '#5a6a5a', 22, { hp: 2600, atk: 220, rng: 20, spd: 24, rate: 1.2, fore: 0.25, kb: 3, drop: 380 }, null, 'Climbs out of every grave twice.');
  NE('lavaogre', 'Lava Ogre', 'ember', [], 'ogre', '#a04a2a', 36, { hp: 9000, atk: 520, rng: 30, spd: 7, rate: 3.0, fore: 0.6, kb: 2, drop: 1100, area: true }, null, 'An ogre with molten fists.');
  const BOSS = (id, name, el, traits, sp, c, s, hp, atk, rng, desc) => NE(id, name, el, traits, sp, c, s, { hp: hp, atk: atk, rng: rng, spd: 6, rate: 3.0, fore: 0.6, kb: 4, drop: 6000, area: true }, null, desc);
  BOSS('gloomqueen', 'Gloom Queen', 'shadow', [], 'king', '#7a2a6a', 48, 120000, 1500, 44, 'The Gloom King\'s older, angrier sister.');
  BOSS('dunetitan', 'Dune Titan', 'stone', [], 'sandworm', '#8a6a3a', 52, 160000, 1700, 50, 'A sandworm the size of a mountain.');
  BOSS('frostlord', 'Frost Lord', 'frost', ['spooky'], 'yetiboss', '#73b8e0', 54, 200000, 1900, 46, 'Lord of the howling glacier.');
  BOSS('mirewitch', 'Mire Witch', 'thorn', ['toxic', 'spooky'], 'hag', '#3a5a3a', 50, 240000, 2000, 84, 'Brews poison in the drowned marsh.');
  BOSS('bonelord', 'Bone Lord', 'ember', ['undead'], 'lich', '#8a3a3a', 54, 280000, 2300, 92, 'Commands the ashen dead.');
  BOSS('gigamecha', 'Giga Mecha', 'storm', ['armored'], 'mecha', '#7a6a4a', 56, 30000, 3200, 64, 'The citadel\'s walking fortress.');
  BOSS('stormmother', 'Storm Mother', 'storm', ['winged'], 'queen', '#4a6aa0', 54, 360000, 2800, 72, 'Mother of every thunderhead.');
  BOSS('voidking', 'Void King', 'shadow', ['cosmic'], 'emperor', '#4a1a3a', 58, 420000, 3200, 82, 'Rules the crater where the stars fell.');
  BOSS('broodmother', 'Broodmother', 'shadow', [], 'spider', '#2a1a3a', 52, 520000, 3600, 90, 'Every skitter in Gloomwood is her child.');
  BOSS('bonesandking', 'Bonesand King', 'stone', ['undead'], 'gknight', '#c8b890', 54, 600000, 4000, 40, 'A knight of bone buried in the desert.');
  BOSS('shiverfang', 'Shiverfang', 'frost', ['spooky'], 'wraith', '#a8d8ff', 56, 680000, 4300, 70, 'A frozen phantom that bites with frostbite.');
  BOSS('eldertotem', 'Elder Totem', 'thorn', [], 'totem', '#5a4a3a', 58, 760000, 4500, 110, 'The oldest totem in Witchmire, and the grumpiest.');
  BOSS('infernocolossus', 'Inferno Colossus', 'ember', ['cosmic'], 'crystal', '#ff7a3a', 60, 850000, 4900, 40, 'A crystal giant burning from within.');
  BOSS('ratemperor', 'Rat Emperor', 'shadow', ['toxic'], 'rat', '#5a3a5a', 54, 940000, 5200, 34, 'Ruler of the Iron Necropolis sewers.');
  BOSS('abyssjelly', 'Abyss Jelly', 'tide', ['winged', 'cosmic'], 'jelly', '#3a2a8a', 58, 1040000, 5600, 100, 'A jellyfish as big as a storm cloud.');
  BOSS('gloomheart', 'The Gloomheart', 'shadow', ['cosmic', 'spooky'], 'bomber', '#1a0a2a', 64, 1200000, 6400, 60, 'The beating heart of all Gloom. End it here.');

  // Chapters: eight lands each. Chapter 1 is the original campaign; 2 and 3 revisit the eight lands at dusk and in deep gloom.
  const CHAPTERS = [
    { id: 1, name: 'The Green Kingdom', desc: 'Push the Gloom out of the eight lands.', from: 0 },
    { id: 2, name: 'The Gloom Frontier', desc: 'The Gloom strikes back at dusk. Tougher foes, new recruits.', from: 8 },
    { id: 3, name: 'Heart of the Gloom', desc: 'Follow the Gloom to its source and end it.', from: 16 }
  ];
  const LAND = (id, name, theme, tint, lane, pool, boss, mag, hp, coins, words, last) => {
    const [adj, nouns] = words;
    const names = [];
    for (let i = 0; i < 11; i++) names.push(adj[i % adj.length] + ' ' + nouns[(i + Math.floor(i / adj.length)) % nouns.length]);
    names.push(last);
    REGIONS.push({ id: id, name: name, theme: theme, tint: tint, lane: lane, pool: pool, boss: boss, mag: mag, baseHp: hp, coins: coins, names: names });
  };
  LAND('twilight', 'Twilight Meadow', 0, 1, 860, { a: ['gloop', 'ratling'], b: ['skitter', 'bonkle', 'flapper'], c: ['grumbo', 'tarblob'] }, 'gloomqueen', [1540, 2940], [67000, 100500], [22000, 26000],
    [['Dusky', 'Fading', 'Long-Shadow', 'Last-Light'], ['Fields', 'Hedges', 'Haystacks', 'Lanes', 'Orchard', 'Brook']], 'Court of the Gloom Queen');
  LAND('wastes', 'Scorched Wastes', 1, 1, 880, { a: ['scorpo', 'ratling'], b: ['boomer', 'clank', 'skitter'], c: ['grumbo', 'lavaogre'] }, 'dunetitan', [750, 1400], [75000, 103000], [24000, 28000],
    [['Searing', 'Burnt', 'Red', 'Dry'], ['Mesa', 'Canyon', 'Flats', 'Gulch', 'Ruins', 'Spires']], 'Rise of the Dune Titan');
  LAND('glacier', 'Howling Glacier', 2, 1, 880, { a: ['boo', 'ratling'], b: ['frostwisp', 'wisp', 'skitter'], c: ['snowgrump', 'totem'] }, 'frostlord', [520, 990], [60500, 79000], [26000, 30000],
    [['Howling', 'Frozen', 'Bitter', 'Glassy'], ['Crevasse', 'Ridge', 'Icefall', 'Hollow', 'Drifts', 'Caves']], "Frost Lord's Throne");
  LAND('marsh', 'Drowned Marsh', 3, 1, 900, { a: ['tarblob', 'shroomy'], b: ['jellyfloat', 'venomshroom', 'plaguerat'], c: ['toadlord', 'webmaw'] }, 'mirewitch', [295, 550], [40500, 51000], [28000, 32000],
    [['Drowned', 'Sunken', 'Murky', 'Misty'], ['Reeds', 'Pools', 'Causeway', 'Willows', 'Shallows', 'Mire']], "The Mire Witch's Cauldron");
  LAND('crater', 'Ashen Crater', 4, 1, 900, { a: ['cinder', 'boomer'], b: ['magmite', 'graveghoul', 'shade'], c: ['lavaogre', 'darkpaladin'] }, 'bonelord', [210, 385], [38000, 46500], [30000, 34000],
    [['Ashen', 'Smouldering', 'Charred', 'Glowing'], ['Vents', 'Crypts', 'Slopes', 'Pits', 'Ossuary', 'Rim']], 'Hall of the Bone Lord');
  LAND('citadel', 'Clockwork Citadel', 5, 1, 920, { a: ['ironbonkle', 'clank'], b: ['rustdrone', 'buzzbot', 'gloomguard'], c: ['ironslab', 'megaboom'] }, 'gigamecha', [320, 600], [35500, 42500], [32000, 36000],
    [['Clockwork', 'Brass', 'Ticking', 'Iron'], ['Gates', 'Gears', 'Bridges', 'Foundry', 'Towers', 'Keep']], 'Giga Mecha Awakens');
  LAND('thunderhead', 'Thunderhead Isles', 6, 1, 920, { a: ['harpy', 'nightharpy'], b: ['stormjelly', 'thunderpuff', 'jellyfloat'], c: ['ironslab', 'totem'] }, 'stormmother', [165, 300], [33000, 38500], [34000, 38000],
    [['Thunder', 'Rolling', 'Rain-Lashed', 'Crackling'], ['Isles', 'Bluffs', 'Updrafts', 'Spires', 'Clouds', 'Squall']], 'Eye of the Storm Mother');
  LAND('starfall', 'Starfall Crater', 7, 1, 940, { a: ['zorp', 'shardling'], b: ['voideye', 'starsquid', 'banshee'], c: ['prismgolem', 'starsquid'] }, 'voidking', [105, 195], [30500, 37000], [36000, 40000],
    [['Starfall', 'Glittering', 'Silent', 'Shimmering'], ['Craters', 'Shards', 'Dunes', 'Hollows', 'Rings', 'Fields']], "The Void King's Crown");
  LAND('gloomwood', 'Gloomwood', 0, 2, 940, { a: ['ratling', 'skitter'], b: ['tarblob', 'shade', 'plaguerat'], c: ['webmaw', 'darkpaladin'] }, 'broodmother', [370, 685], [75500, 87500], [40000, 44000],
    [['Gloomy', 'Tangled', 'Whispering', 'Black'], ['Woods', 'Thicket', 'Webs', 'Roots', 'Den', 'Glade']], "Broodmother's Nest");
  LAND('bonesand', 'Bonesand Desert', 1, 2, 960, { a: ['boomer', 'graveghoul'], b: ['cinder', 'shade', 'gloomguard'], c: ['megaboom', 'lavaogre'] }, 'bonesandking', [235, 450], [51000, 58000], [44000, 48000],
    [['Bone-White', 'Haunted', 'Endless', 'Grave'], ['Sands', 'Tombs', 'Dunes', 'Pyramids', 'Oasis', 'Barrows']], "Tomb of the Bonesand King");
  LAND('shiverfang', 'Shiverfang Summit', 2, 2, 960, { a: ['frostwisp', 'banshee'], b: ['shade', 'skitter', 'totem'], c: ['prismgolem', 'webmaw'] }, 'shiverfang', [125, 235], [52000, 58500], [48000, 52000],
    [['Shivering', 'Frostbitten', 'Ghostly', 'Sheer'], ['Summit', 'Passes', 'Ledges', 'Glacier', 'Peaks', 'Cliffs']], 'Fangs of Shiverfang');
  LAND('witchmire', 'Witchmire', 3, 2, 980, { a: ['plaguerat', 'venomshroom'], b: ['hextotem', 'jellyfloat', 'webmaw'], c: ['totem', 'darkpaladin'] }, 'eldertotem', [95, 180], [56000, 62000], [52000, 56000],
    [['Cursed', 'Hexed', 'Rotting', 'Bubbling'], ['Bog', 'Totems', 'Swamp', 'Hollows', 'Pools', 'Circle']], "Elder Totem's Circle");
  LAND('inferno', 'Inferno Depths', 4, 2, 980, { a: ['boomer', 'shardling'], b: ['megaboom', 'magmite', 'graveghoul'], c: ['lavaogre', 'prismgolem'] }, 'infernocolossus', [125, 235], [65500, 72000], [56000, 60000],
    [['Infernal', 'Blazing', 'Molten', 'Deep'], ['Depths', 'Furnace', 'Rivers', 'Caverns', 'Forge', 'Core']], 'The Inferno Colossus');
  LAND('necropolis', 'Iron Necropolis', 5, 2, 1000, { a: ['ratling', 'ironbonkle'], b: ['plaguerat', 'rustdrone', 'gloomguard'], c: ['megaboom', 'darkpaladin'] }, 'ratemperor', [270, 510], [75500, 82500], [60000, 64000],
    [['Iron', 'Rusted', 'Silent', 'Sunken'], ['Streets', 'Sewers', 'Vaults', 'Works', 'Graves', 'Spires']], "The Rat Emperor's Sewer Throne");
  LAND('shattered', 'Shattered Sky', 6, 2, 1000, { a: ['nightharpy', 'banshee'], b: ['stormjelly', 'rustdrone', 'shade'], c: ['prismgolem', 'webmaw'] }, 'abyssjelly', [105, 195], [75000, 81000], [64000, 68000],
    [['Shattered', 'Falling', 'Broken', 'Howling'], ['Skies', 'Islands', 'Bridges', 'Winds', 'Rocks', 'Ruins']], 'From the Abyss Above');
  LAND('voidheart', 'Heart of the Void', 7, 2, 1040, { a: ['shardling', 'zorp'], b: ['voideye', 'banshee', 'stormjelly'], c: ['prismgolem', 'darkpaladin'] }, 'gloomheart', [65, 130], [80000, 90500], [70000, 80000],
    [['Endless', 'Hollow', 'Final', 'Dark'], ['Void', 'Rift', 'Stars', 'Abyss', 'Edge', 'Heart']], 'The Gloomheart');

  const AW_CONTENT = { RARITIES, TRAITS, HEROES, ENEMIES, REGIONS, DIFFICULTIES, EVENTS, BANNERS, LAB, ITEMS, MISSIONS, LOGIN, MEDALS, ELEMENTS, CHAPTERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = AW_CONTENT;
  root.AW_CONTENT = AW_CONTENT;
})(typeof globalThis !== 'undefined' ? globalThis : this);
