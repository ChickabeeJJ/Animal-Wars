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
    winged: { name: 'Winged', color: '#73eff7', desc: 'Flies over the field.' },
    armored: { name: 'Armored', color: '#94b0c2', desc: 'Takes only 10% damage. Critical hits and heroes strong against Armored ignore the plating.' },
    spooky: { name: 'Spooky', color: '#a884f3', desc: 'Dodges 1 in 4 hits unless the hero is strong against Spooky.' },
    toxic: { name: 'Toxic', color: '#a7f070', desc: 'Its hits poison heroes for 3 seconds.' },
    undead: { name: 'Undead', color: '#ef7d57', desc: 'Gets back up once at half health unless finished by a Zombie Slayer.' },
    cosmic: { name: 'Cosmic', color: '#ff6fd0', desc: 'Takes half damage unless the hero is strong against Cosmic.' }
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
      { hp: 260, atk: 48, rng: 72, spd: 12, rate: 2.4, fore: 0.5, kb: 3, cost: 350, cd: 8 }, { strong: ['winged'] }, 'Keeps the skies clear. Strong against Winged Gloom.', [0, 7]),
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
      { hp: 350, atk: 42, rng: 26, spd: 16, rate: 1.6, fore: 0.3, kb: 3, cost: 300, cd: 7 }, { strong: ['spooky'] }, 'Sees through ghostly tricks. Strong against Spooky.'),
    H('honk', ['Honk', 'Honk Commander', 'Thunderhonk'], 1, { sp: 'goose', c: '#f4f4f4', b: '#d6dde6', a: '#ffa34d', s: 24, g: ['', 'helmet', 'storm'] },
      { hp: 320, atk: 36, rng: 24, spd: 18, rate: 1.5, fore: 0.3, kb: 3, cost: 280, cd: 7 }, { kb: 0.3 }, 'Its HONK knocks enemies back 30% of the time.'),
    H('billy', ['Billy', 'Battering Billy', 'Ram King Billy'], 1, { sp: 'goat', c: '#d8cbb5', b: '#f4f4f4', a: '#8a6a52', s: 24, g: ['', 'helmet', 'crown'] },
      { hp: 380, atk: 60, rng: 22, spd: 30, rate: 1.8, fore: 0.35, kb: 3, cost: 360, cd: 8 }, { base: 3 }, 'Charges straight for the Gloom tower and hits it 3× as hard.'),
    H('puff', ['Puff', 'Spiny Puff', 'Pufferstorm'], 1, { sp: 'puffer', c: '#ffcd75', b: '#fff1d6', a: '#41a6f6', s: 20, g: ['', 'spikes', 'bubble'] },
      { hp: 280, atk: 52, rng: 30, spd: 12, rate: 2.0, fore: 0.4, kb: 3, cost: 330, cd: 8, area: true }, { strong: ['toxic'] }, 'Puffs up and splashes crowds. Strong against Toxic.'),
    H('waddle', ['Waddle', 'Frost Waddle', 'Glacier Waddle'], 1, { sp: 'penguin', c: '#2b3352', b: '#f4f4f4', a: '#73eff7', s: 20, g: ['', 'scarf', 'ice'] },
      { hp: 300, atk: 30, rng: 26, spd: 14, rate: 1.6, fore: 0.3, kb: 3, cost: 320, cd: 8 }, { freeze: [0.2, 2] }, 'Slides in with a chilly slap that can freeze enemies for 2 seconds.'),
    H('dig', ['Dig', 'Tunnel Dig', 'Drillmaster Dig'], 1, { sp: 'mole', c: '#5a4a5e', b: '#ffa8c5', a: '#ffcd75', s: 20, g: ['', 'hardhat', 'drill'] },
      { hp: 300, atk: 60, rng: 22, spd: 16, rate: 1.8, fore: 0.3, kb: 3, cost: 380, cd: 9 }, { burrow: 90 }, 'Tunnels under the first enemy it meets and pops up behind the front line.'),
    H('drowsy', ['Drowsy', 'Dreamy Drowsy', 'Slumber Sage'], 1, { sp: 'sloth', c: '#a08a6a', b: '#e8d8b8', a: '#a884f3', s: 22, g: ['', 'nightcap', 'stars'] },
      { hp: 420, atk: 26, rng: 64, spd: 7, rate: 3.0, fore: 0.6, kb: 3, cost: 420, cd: 10, area: true }, { slow: [0.5, 3] }, 'Yawns so hard that enemies slow down for 3 seconds.'),
    H('polly', ['Polly', 'Sky Polly', 'Rainbow Polly'], 1, { sp: 'parrot', c: '#e04848', b: '#ffcd75', a: '#41a6f6', s: 22, g: ['', 'goggles', 'rainbow'] },
      { hp: 260, atk: 44, rng: 54, spd: 16, rate: 1.8, fore: 0.35, kb: 3, cost: 340, cd: 8 }, { strong: ['winged'] }, 'Chases flyers out of the sky. Strong against Winged.'),
    H('chomp', ['Chomp', 'Lumber Chomp', 'Dam Breaker Chomp'], 1, { sp: 'beaver', c: '#8a5a3c', b: '#d9a874', a: '#ffcd75', s: 22, g: ['', 'hardhat', 'axe'] },
      { hp: 440, atk: 48, rng: 22, spd: 13, rate: 1.6, fore: 0.3, kb: 3, cost: 400, cd: 9 }, { base: 4 }, 'Gnaws through towers. Deals 4× damage to the Gloom tower.'),
    H('stinky', ['Stinky', 'Stink Bomber', 'Fumigator Stinky'], 1, { sp: 'skunk', c: '#2b2b3a', b: '#f4f4f4', a: '#a7f070', s: 22, g: ['', 'mask', 'cloud'] },
      { hp: 300, atk: 22, rng: 34, spd: 12, rate: 1.8, fore: 0.35, kb: 3, cost: 360, cd: 9, area: true }, { weaken: [0.4, 3], resist: ['toxic'] }, 'A stinky cloud weakens enemy attacks. Shrugs off Toxic hits.'),
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
      { hp: 900, atk: 170, rng: 28, spd: 18, rate: 1.6, fore: 0.3, kb: 3, cost: 950, cd: 15 }, { crit: 0.3, massive: ['armored'] }, 'A clean cut through any plating. Massive damage to Armored.'),
    H('merlin', ['Merlin', 'Archmage Merlin', 'Merlin of Stars'], 2, { sp: 'raccoon', c: '#8a8a9a', b: '#d8d8e0', a: '#3b5dc9', s: 26, g: ['', 'wizard', 'archmage'] },
      { hp: 700, atk: 140, rng: 100, spd: 9, rate: 3.4, fore: 0.6, kb: 3, cost: 1100, cd: 20, area: true }, { wave: [1, 2] }, 'Every spell sends a magic wave rolling across the field.'),
    H('ramrod', ['Ramrod', 'Iron Ramrod', 'Siege Ramrod'], 2, { sp: 'rhino', c: '#8a94a8', b: '#c8d0dc', a: '#ffcd75', s: 34, g: ['', 'armor', 'siege'] },
      { hp: 3000, atk: 240, rng: 30, spd: 9, rate: 3.0, fore: 0.5, kb: 3, cost: 1300, cd: 25 }, { kb: 0.5 }, 'A living battering ram. Knocks enemies back half the time.'),
    H('nox', ['Nox', 'Night Hunter Nox', 'Count Nox'], 2, { sp: 'bat', c: '#4a3a6a', b: '#a884f3', a: '#b13e53', s: 24, g: ['', 'cape', 'count'] },
      { hp: 800, atk: 150, rng: 40, spd: 20, rate: 1.8, fore: 0.3, kb: 3, cost: 900, cd: 15 }, { strong: ['undead'], zkill: true }, 'Zombie Slayer: Undead it defeats stay down. Strong against Undead.'),
    H('shellbeard', ['Shellbeard', 'Captain Shellbeard', 'Admiral Shellbeard'], 2, { sp: 'crab', c: '#e04848', b: '#ffb08a', a: '#2b3352', s: 26, g: ['', 'pirate', 'admiral'] },
      { hp: 1200, atk: 180, rng: 80, spd: 8, rate: 3.2, fore: 0.6, kb: 3, cost: 1150, cd: 20, area: true }, { strong: ['cosmic'] }, 'Fires a claw cannon. Strong against Cosmic.'),
    H('hart', ['Hart', 'Stag Knight Hart', 'High King Hart'], 2, { sp: 'stag', c: '#a0603a', b: '#f0d0a0', a: '#94b0c2', s: 34, g: ['', 'knight', 'king'] },
      { hp: 2200, atk: 170, rng: 30, spd: 11, rate: 2.2, fore: 0.45, kb: 3, cost: 1150, cd: 20 }, { strong: ['armored'], resist: ['armored'] }, 'An armored knight who fights Armored Gloom best.'),
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
      { hp: 2200, atk: 320, rng: 90, spd: 10, rate: 3.0, fore: 0.5, kb: 3, cost: 2000, cd: 40, area: true }, { wave: [1, 4], massive: ['cosmic'] }, 'Long jade waves on every attack. Massive damage to Cosmic.'),
    H('nova', ['Nova', 'Star Whale Nova', 'Galaxy Nova'], 3, { sp: 'whale', c: '#3b5dc9', b: '#c8e0ff', a: '#ffcd75', s: 34, g: ['', 'stars', 'galaxy'] },
      { hp: 6000, atk: 300, rng: 60, spd: 6, rate: 3.6, fore: 0.6, kb: 3, cost: 2400, cd: 45, area: true }, { massive: ['cosmic'], resist: ['cosmic'] }, 'A whale that swims through space. Built to beat the Cosmic.'),
    H('lumi', ['Lumi', 'Prism Lumi', 'Aurora Lumi'], 3, { sp: 'unicorn', c: '#f4f4f4', b: '#ffa8c5', a: '#a884f3', s: 32, g: ['', 'prism', 'aurora'] },
      { hp: 1800, atk: 360, rng: 40, spd: 20, rate: 2.0, fore: 0.35, kb: 3, cost: 1800, cd: 35 }, { massive: ['spooky', 'undead'], zkill: true }, 'Its light banishes ghosts and keeps the Undead down.'),
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
      { hp: 3500, atk: 650, rng: 70, spd: 24, rate: 2.0, fore: 0.35, kb: 3, cost: 3400, cd: 65, area: true }, { freeze: [0.3, 2], massive: ['winged'] }, 'A thunderbird whose lightning freezes foes. Massive damage to Winged.'),
    H('drako', ['Drako', 'Dragon Lord Drako', 'Cosmic Drako'], 4, { sp: 'dragon', c: '#b13e53', b: '#ffcd75', a: '#a884f3', s: 44, g: ['', 'crown', 'cosmic'] },
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
    { id: 'silver', name: 'Meadow Nest', cost: 0, ticket: 'silver', rates: [0, 80, 18, 2, 0], pity: null, desc: 'Rare, Epic and the odd Mythic, for Silver Eggs.' }
  ];

  // Lab: permanent upgrades bought with coins.
  const LAB = [
    { id: 'train', name: 'Training Grounds', desc: 'All heroes +3% health and attack', icon: 'train', max: 30, base: 300, per: 0.03 },
    { id: 'wrate', name: 'Acorn Hoarders', desc: 'Acorn income +6%', icon: 'acorn', max: 20, base: 200, per: 0.06 },
    { id: 'wcap', name: 'Bigger Pouch', desc: 'Pouch size +6%', icon: 'pouch', max: 20, base: 200, per: 0.06 },
    { id: 'base', name: 'Sturdy Burrow', desc: 'Burrow health +15%', icon: 'burrow', max: 20, base: 250, per: 0.15 },
    { id: 'rpow', name: 'Mega Roar Power', desc: 'Mega Roar damage +20%', icon: 'roar', max: 20, base: 250, per: 0.2 },
    { id: 'rchg', name: 'Roar Recharge', desc: 'Mega Roar charges 0.8 s faster', icon: 'charge', max: 20, base: 250, per: 0.8 },
    { id: 'cd', name: 'Quick Training', desc: 'Hero cooldowns -2%', icon: 'clock', max: 20, base: 300, per: 0.02 },
    { id: 'start', name: 'Head Start', desc: '+60 acorns when a battle starts', icon: 'start', max: 20, base: 150, per: 60 },
    { id: 'coin', name: 'Treasure Nose', desc: 'Coins from battles +6%', icon: 'coin', max: 20, base: 300, per: 0.06 }
  ];

  const ITEMS = [
    { id: 'rush', name: 'Acorn Rush', desc: 'Start with a Level 3 pouch and 600 acorns.', price: 1500 },
    { id: 'armor', name: 'Iron Burrow', desc: 'Your burrow has +60% health.', price: 1500 },
    { id: 'roar', name: 'Ready Roar', desc: 'Mega Roar starts charged and charges 30% faster.', price: 1200 },
    { id: 'charm', name: 'Lucky Clover', desc: 'Double coins from this battle.', price: 2500 }
  ];

  // Daily missions: 4 a day, chosen from this pool.
  const MISSIONS = [
    { id: 'win', text: 'Win {n} battles', stat: 'wins', n: 3, gems: 30 },
    { id: 'deploy', text: 'Deploy {n} heroes', stat: 'deploys', n: 60, gems: 20 },
    { id: 'kills', text: 'Defeat {n} Gloom', stat: 'kills', n: 150, gems: 25 },
    { id: 'roar', text: 'Use Mega Roar {n} times', stat: 'roars', n: 5, gems: 20 },
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
    { stat: 'clears0', tiers: [5, 12, 24, 48, 96], name: 'Story Clears', text: 'Clear {n} Normal stages', gems: [30, 60, 100, 150, 300] },
    { stat: 'clears1', tiers: [6, 24, 48, 96], name: 'Hard Clears', text: 'Clear {n} Hard stages', gems: [60, 120, 200, 400] },
    { stat: 'clears2', tiers: [6, 24, 48, 96], name: 'Nightmare Clears', text: 'Clear {n} Nightmare stages', gems: [100, 200, 300, 600] },
    { stat: 'stars', tiers: [30, 100, 250, 500, 864], name: 'Star Collector', text: 'Earn {n} stars', gems: [30, 80, 150, 300, 800] },
    { stat: 'kills', tiers: [100, 1000, 5000, 20000, 100000], name: 'Gloom Buster', text: 'Defeat {n} Gloom', gems: [20, 50, 100, 200, 400] },
    { stat: 'bosses', tiers: [1, 5, 20, 50], name: 'Boss Breaker', text: 'Defeat {n} bosses', gems: [30, 80, 150, 300] },
    { stat: 'hatches', tiers: [10, 50, 150, 400], name: 'Egg Whisperer', text: 'Hatch {n} eggs', gems: [50, 100, 200, 400] },
    { stat: 'owned', tiers: [10, 20, 30, 40, 50], name: 'Menagerie', text: 'Own {n} heroes', gems: [40, 80, 150, 250, 500] },
    { stat: 'maxLevel', tiers: [10, 20, 30, 40, 50], name: 'Drill Sergeant', text: 'Get a hero to level {n}', gems: [20, 60, 120, 200, 400] },
    { stat: 'form3', tiers: [1, 5, 15, 30], name: 'Final Form', text: 'Evolve {n} heroes to their third form', gems: [50, 100, 200, 400] },
    { stat: 'tower', tiers: [5, 15, 30, 50, 100], name: 'Tower Climber', text: 'Reach tower floor {n}', gems: [30, 80, 150, 250, 500] },
    { stat: 'roars', tiers: [10, 100, 500], name: 'Big Voice', text: 'Use Mega Roar {n} times', gems: [20, 60, 120] },
    { stat: 'deploys', tiers: [100, 1000, 10000], name: 'Recruiter', text: 'Deploy {n} heroes', gems: [20, 60, 150] },
    { stat: 'logins', tiers: [3, 7, 14, 30, 60], name: 'Regular', text: 'Log in on {n} days', gems: [30, 70, 120, 200, 400] }
  ];

  const AW_CONTENT = { RARITIES, TRAITS, HEROES, ENEMIES, REGIONS, DIFFICULTIES, EVENTS, BANNERS, LAB, ITEMS, MISSIONS, LOGIN, MEDALS };
  if (typeof module !== 'undefined' && module.exports) module.exports = AW_CONTENT;
  root.AW_CONTENT = AW_CONTENT;
})(typeof globalThis !== 'undefined' ? globalThis : this);
