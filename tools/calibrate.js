#!/usr/bin/env node
/* Difficulty calibration: for each story stage, the lowest uniform hero level at which the scripted player
 * wins within 4 minutes, using a lineup typical for that point of the game.
 *   node tools/calibrate.js [difficulty=0] [regions=8]
 * A smooth, slowly rising "level needed" column means a smooth difficulty curve.
 */
'use strict';
const AW = require('../js/core.js');
const { playBattle } = require('./sim.js');
const CT = AW.CT;

// A plausible collection for a player reaching region r (starters + a few hatched heroes).
function lineupFor(d, r, i) {
  const g = d * 8 + r + i / 12;  // rough progress
  const ids = ['pip', 'shelly'];
  for (const h of CT.HEROES) if (h.rarity === 0 && h.unlock && (h.unlock[0] < r || (h.unlock[0] === r && h.unlock[1] < i) || d > 0)) ids.push(h.id);
  const extra = [];
  if (g >= 0.25) extra.push('nibbles', 'honk', 'bonk', 'bamboo');
  if (g >= 1) extra.push('ronin', 'kiwi');
  if (g >= 3) extra.push('inky', 'merlin');
  if (g >= 5) extra.push('storm', 'hart', 'nox');
  if (g >= 7) extra.push('jade', 'thornhelm');
  if (g >= 10) extra.push('kitsu', 'nova', 'lumi');
  return ids.concat(extra);
}

function setup(d, r, i, lvl) {
  const s = AW.createState(0);
  for (let rr = 0; rr < CT.REGIONS.length; rr++) for (let dd = 0; dd < 3; dd++) {
    if (dd < d || (dd === d && rr < r)) s.clear[dd][rr] = 12;
    else if (dd === d && rr === r) s.clear[dd][rr] = i;
  }
  const ids = lineupFor(d, r, i);
  s.heroes = {};
  for (const id of ids) s.heroes[id] = { lvl: Math.min(30, lvl), plus: Math.max(0, lvl - 30), form: lvl >= 20 ? 2 : lvl >= 10 ? 1 : 0 };
  // Lab grows with progress too.
  const labLv = Math.min(20, Math.floor(lvl * 0.6));
  for (const l of CT.LAB) s.lab[l.id] = Math.min(l.max, labLv);
  // Lineup: two cheapest walls, then the strongest.
  const score = (id) => { const st = AW.heroStats(s, id); return st.hp * st.atk / st.rate / Math.max(50, st.cost); };
  const walls = ids.slice().sort((a, b) => AW.HERO[a].cost - AW.HERO[b].cost).slice(0, 2);
  const rest = ids.filter((x) => walls.indexOf(x) < 0).sort((a, b) => score(b) - score(a)).slice(0, 8);
  s.lineup = walls.concat(rest);
  while (s.lineup.length < 10) s.lineup.push(null);
  return s;
}

function needed(d, r, i) {
  const def = AW.stageDef(d, r, i);
  for (let lvl = 1; lvl <= 50; lvl++) {
    let wins = 0, t = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const s = setup(d, r, i, lvl);
      const b = playBattle(s, def, AW.mulberry32(seed * 77 + lvl));
      if (b.state === 'won' && b.t < 240) { wins++; t += b.t; }
    }
    if (wins >= 2) return { lvl: lvl, t: t / wins };
  }
  return { lvl: 99, t: 0 };
}

if (require.main === module) {
  const d = Number(process.argv[2]) || 0;
  const regions = Number(process.argv[3]) || 8;
  const only = process.argv[4] !== undefined ? Number(process.argv[4]) : -1;
  for (let r = 0; r < regions; r++) {
    if (only >= 0 && r !== only) continue;
    const row = [];
    for (let i = 0; i < 12; i++) { const n = needed(d, r, i); row.push(String(n.lvl).padStart(2) + '/' + String(Math.round(n.t)).padStart(3) + 's'); }
    console.log(CT.DIFFICULTIES[d].name.padEnd(9), (r + 1) + ' ' + CT.REGIONS[r].name.padEnd(16), row.join(' '));
  }
}
module.exports = { needed, setup };
