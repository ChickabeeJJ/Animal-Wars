#!/usr/bin/env node
/* Campaign simulator: plays the real rules with a scripted player and reports pacing.
 *   node tools/sim.js [regions=8] [seed=1] [--verbose]
 * The scripted player deploys like a good human (a steady stream of cheap walls whenever Gloom is on the field, big
 * heroes as soon as they are ready, saving up for one that is nearly ready), upgrades the
 * pouch early, uses the Battle Cry when the army is engaged, grinds the best cleared stage after a loss, spends coins on the lineup and the
 * Lab, hatches whenever it can afford 10 eggs, and plays one "day" of dailies per 30 minutes of play.
 */
'use strict';
const AW = require('../js/core.js');
const CT = AW.CT;

function playBattle(state, def, rng, opts) {
  opts = opts || {};
  const b = AW.createBattle(state, def, { seed: Math.floor(rng() * 1e9), items: opts.items || {} });
  const dt = AW.CONFIG.tick;
  let think = 0;
  const order = b.slots.map((s, i) => i).filter((i) => b.slots[i]).sort((x, y) => b.slots[y].st.cost - b.slots[x].st.cost);
  while (b.state === 'play' && b.t < 600) {
    AW.step(b, dt, null);
    think += dt;
    if (think < 0.25) continue;
    think = 0;
    // Battle Cry when a good part of the army is on the field and fighting, or in an emergency.
    if (AW.canRoar(b)) {
      let heroes = 0, front = 0, foe = b.L, close = false, boss = false;
      for (const e of b.ents) {
        if (e.state === 'dead') continue;
        if (e.side === 0) { heroes++; front = Math.max(front, e.x); } else { foe = Math.min(foe, e.x); if (e.x < 150) close = true; if (e.boss) boss = true; }
      }
      if ((heroes >= 4 && foe - front < 60) || close || (boss && heroes >= 2 && foe - front < 80)) AW.roar(b, null);
    }
    let front = 0, foe = b.L, allies = 0, foes = 0;
    for (const e of b.ents) {
      if (e.state === 'dead') continue;
      if (e.side === 0) { allies++; front = Math.max(front, e.x); } else { foes++; foe = Math.min(foe, e.x); }
    }
    const danger = foe - front < 110 || allies < 2;
    // Big heroes first (most expensive that is ready and affordable).
    let deployed = false;
    for (const i of order) {
      const sl = b.slots[i];
      if (sl.st.cost <= 160) continue;
      if (AW.canDeploy(b, i)) { AW.deploy(b, i, null); deployed = true; break; }
    }
    // Is a big hero almost ready? Then save up for it.
    let saving = false;
    for (const i of order) {
      const sl = b.slots[i];
      if (sl.st.cost > 160 && sl.cd < 3 && sl.st.cost > b.pouch.acorns && sl.st.cost <= b.pouch.max) saving = true;
    }
    // Walls when the Gloom is close.
    for (const i of order) {
      const sl = b.slots[i];
      if (sl.st.cost > 160) continue;
      // A steady stream of cheap heroes holds the front while the big ones work (what good players do).
      if (danger || (foes && !saving) || (!saving && b.pouch.acorns > b.pouch.max * 0.6)) AW.deploy(b, i, null);
    }
    // Pouch early, or when nothing better to buy.
    if (!deployed && AW.canPouch(b) && (b.pouch.lvl < 3 || b.pouch.acorns >= b.pouch.max * 0.9 || !danger)) AW.upgradePouch(b, null);
  }
  return b;
}

function bestLineup(state) {
  const ids = Object.keys(state.heroes);
  const score = (id) => { const st = AW.heroStats(state, id); return st.hp * st.atk / st.rate / Math.max(50, st.cost); };
  // Two cheapest walls + the strongest others.
  const walls = ids.slice().sort((a, b) => AW.HERO[a].cost - AW.HERO[b].cost).slice(0, 2);
  const rest = ids.filter((id) => walls.indexOf(id) < 0).sort((a, b) => score(b) - score(a)).slice(0, 8);
  const line = walls.concat(rest);
  while (line.length < 10) line.push(null);
  state.lineup = line;
}

function shop(state) {
  for (let guard = 0; guard < 500; guard++) {
    const opts = [];
    for (const id of state.lineup) {
      if (!id) continue;
      const h = state.heroes[id];
      if (AW.canEvolve(state, id)) opts.push({ c: AW.evolveNeed(id, h.form).coins * 0.5, f: () => AW.evolve(state, id) });
      if (h.lvl < AW.CONFIG.maxLevel) opts.push({ c: AW.levelCost(id, h.lvl), f: () => AW.levelUp(state, id) });
    }
    for (const l of ['train', 'wrate', 'base', 'wcap', 'rpow', 'rchg', 'cd', 'coin', 'start']) {
      if (state.lab[l] < AW.LABS[l].max) opts.push({ c: AW.labCost(l, state.lab[l]) * (l === 'train' || l === 'wrate' ? 0.7 : 1.3), f: () => AW.buyLab(state, l) });
    }
    opts.sort((a, b) => a.c - b.c);
    if (!opts.length || !opts[0].f()) break;
  }
}

function run(opts) {
  const regions = opts.regions || 8;
  const rng = AW.mulberry32(opts.seed || 1);
  const state = AW.createState(0);
  let clock = 0, day = 0, dayClock = 0;
  const log = [];
  let wins = 0, losses = 0;
  function daily() {
    day++;
    state.gems += 100 + 125 + 60;      // login average, missions + bonus, a medal now and then
    state.tickets.silver += 1 + 3;     // mission bonus + free eggs
    state.coins += AW.farmRate(state) * 8;
    for (let k = 0; k < 3; k++) {       // Coin Cave
      let lvl = 0;
      for (let l = 4; l >= 0; l--) if (AW.eventOpen(state, 'coins', l)) { lvl = l; break; }
      if (AW.eventOpen(state, 'coins', 0)) {
        const b = playBattle(state, AW.eventDef('coins', lvl), rng);
        clock += b.t; AW.finishBattle(state, b, rng);
      }
    }
    for (let k = 0; k < 2; k++) {
      if (!AW.eventOpen(state, 'seeds', 0)) break;
      let lvl = 0;
      for (let l = 4; l >= 0; l--) if (AW.eventOpen(state, 'seeds', l)) { lvl = l; break; }
      const b = playBattle(state, AW.eventDef('seeds', lvl), rng);
      clock += b.t; AW.finishBattle(state, b, rng);
    }
  }
  function hatchAll() {
    if (AW.welcomeReady(state)) AW.claimWelcome(state, rng, day);
    while (state.gems >= 900) AW.hatch(state, 'royal', 10, rng, day);
    while (state.tickets.silver > 0) AW.hatch(state, 'silver', 1, rng, day);
    bestLineup(state);
  }
  for (let r = 0; r < regions; r++) {
    const t0 = clock;
    let regionLosses = 0;
    for (let i = 0; i < 12; i++) {
      let tries = 0;
      for (;;) {
        tries++;
        hatchAll(); shop(state);
        const def = AW.stageDef(0, r, i);
        const b = playBattle(state, def, rng);
        clock += b.t + 15; dayClock += b.t + 15;
        const res = AW.finishBattle(state, b, rng);
        if (dayClock > 1800) { dayClock = 0; daily(); }
        if (res.won) { wins++; if (opts.verbose) log.push(`  ${r + 1}-${i + 1} ${def.name.padEnd(20)} won in ${b.t.toFixed(0)}s, tries ${tries}, stars ${AW.starCount(res.stars)}, coins ${res.coins}`); break; }
        losses++; regionLosses++;
        if (opts.verbose) log.push(`  ${r + 1}-${i + 1} lost at ${b.t.toFixed(0)}s (tower ${Math.round(100 * b.enemy.hp / b.enemy.max)}%)`);
        // Grind the best cleared stage (or Hard of an earlier region) a few times, then retry.
        for (let g = 0; g < 2; g++) {
          let gd = AW.stageDef(0, r, Math.max(0, i - 1));
          if (r > 0 && state.clear[0][r - 1] >= 12 && AW.regionOpen(state, 1, r - 1)) gd = AW.stageDef(1, r - 1, Math.min(11, state.clear[1][r - 1]));
          const gb = playBattle(state, gd, rng);
          clock += gb.t + 15; dayClock += gb.t + 15;
          AW.finishBattle(state, gb, rng);
          if (dayClock > 1800) { dayClock = 0; daily(); }
          hatchAll(); shop(state);
        }
        if (tries > 40) { log.push(`STUCK at ${r + 1}-${i + 1}`); return { log, stuck: true, state }; }
      }
    }
    const lv = state.lineup.filter(Boolean).map((id) => state.heroes[id].lvl + state.heroes[id].plus);
    log.push(`Region ${r + 1} ${CT.REGIONS[r].name.padEnd(16)} cleared at ${(clock / 60).toFixed(0)} min (+${((clock - t0) / 60).toFixed(0)}), day ${day}, losses ${regionLosses}, heroes ${AW.ownedCount(state)}, lineup lv ${Math.min(...lv)}-${Math.max(...lv)}, lab train ${state.lab.train}, pulls ${state.gacha.pulls}`);
  }
  log.push(`Total ${(clock / 60).toFixed(0)} min, ${wins} wins, ${losses} losses, ${day} days`);
  return { log, state, clock };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const res = run({ regions: Number(args[0]) || 8, seed: Number(args[1]) || 1, verbose: args.includes('--verbose') });
  console.log(res.log.join('\n'));
}
module.exports = { run, playBattle };
