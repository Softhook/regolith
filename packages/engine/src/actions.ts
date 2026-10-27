/** The five phase-1 actions (Move/Attack, Deploy, Reconfigure, Research, Conquer) and ending the turn. */
import { cellIndex, same } from './board';
import { startCombat } from './combat';
import {
  fail,
  gainResearch,
  log,
  note,
  logTo,
  markAbility,
  markMoved,
  name,
  ownShip,
  placeCube,
  requireActionPhase,
  rerollNew,
  aShip,
  shipName,
  spend,
  spendPeaceful,
  tally,
  cubeLeft,
  type Handlers,
} from './core';
import { boardLoc, die } from './lookups';
import {
  attackLaunches,
  canGainResearch,
  canMoveDie,
  canReconfigure,
  conquerCheck,
  deployTargets,
  moveIndexes,
  moveOptions,
} from './queries';
import { rulesOf } from './rules';
import { endTurn } from './turn';

export const actionHandlers = {
  move(s, a) {
    requireActionPhase(s);
    const d = ownShip(s, a.die, 'board');
    if (!canMoveDie(s, d)) fail('This ship already moved this turn');
    const opt = moveIndexes(s, d).moves.get(cellIndex(s.board, a.to));
    if (!opt) fail('Out of range');
    spendPeaceful(s);
    if (opt.diagonal) markAbility(s, d); // Interceptor manoeuvre
    d.loc = boardLoc(a.to);
    markMoved(s, d);
    logTo(s, d.owner, `${name(s, d.owner)} moves their ${shipName(s, d)}`, a.to);
  },
  attack(s, a) {
    requireActionPhase(s);
    const d = ownShip(s, a.die, 'board');
    if (!canMoveDie(s, d)) fail('This ship already moved this turn');
    const opts = moveOptions(s, d.id);
    if (!opts.attacks.has(a.target)) fail('Target out of range');
    // Only the spaces offered (attackLaunches): a space with the same outcome as a nearer one isn't.
    const opt = a.from ? attackLaunches(s, d.id, a.target, opts).find((x) => same(x.from, a.from!)) : opts.attacks.get(a.target)!;
    if (!opt) fail('Cannot attack from there');
    spend(s, 1);
    if (opt.diagonal) markAbility(s, d);
    markMoved(s, d);
    startCombat(s, d, die(s, a.target), opt.from);
  },
  deploy(s, a) {
    const t = requireActionPhase(s);
    const d = ownShip(s, a.die, 'scrapyard');
    if (!deployTargets(s, t.player).some((p) => same(p, a.to))) fail('Deploy into orbit of a planet with your cube');
    if (t.freeDeploys > 0) t.freeDeploys--;
    else spend(s, 1);
    d.loc = boardLoc(a.to);
    logTo(s, d.owner, `${name(s, d.owner)} deploys ${aShip(s, d)}`, a.to);
  },
  reconfigure(s, a) {
    requireActionPhase(s);
    const d = ownShip(s, a.die);
    if (!canReconfigure(s, d)) fail('This ship cannot be reconfigured');
    spend(s, 1);
    const was = shipName(s, d);
    rerollNew(s, d);
    note(s, `${name(s, d.owner)} reconfigures their ${was} into ${aShip(s, d)}.`, d.owner);
  },
  research(s) {
    const t = requireActionPhase(s);
    if (!rulesOf(s).cards) fail('This mode has no research');
    const limit = rulesOf(s).researchLimit;
    if (s.players[t.player].research >= limit) fail(`Research is already at ${limit}`);
    if (!canGainResearch(s, t.player)) fail('You cannot gain research');
    spendPeaceful(s);
    gainResearch(s, t.player, 1);
  },
  conquer(s, a) {
    const t = requireActionPhase(s);
    const check = conquerCheck(s, t.player, a.planet, a.replace !== undefined);
    if (!check.ok) fail(check.reason ?? 'Cannot conquer');
    if (check.replace) {
      const owner = a.replace;
      if (owner === undefined || !check.replace.includes(owner)) fail('Choose which opponent cube to displace');
      const planet = s.board.planets[a.planet];
      planet.cubes.splice(planet.cubes.lastIndexOf(owner), 1);
      s.players[owner].cubesLeft++;
      cubeLeft(s, owner, a.planet);
      log(s, `${name(s, t.player)} displaces ${name(s, owner)}'s cube.`, t.player, 'conquer', [a.planet]);
    }
    spend(s, 2);
    t.conquered = (t.conquered ?? 0) + 1;
    // Science: the research that moved the sum onto the target.
    if (check.research) s.players[t.player].research -= check.research;
    const spent = check.research ? `, spending ${check.research} research` : '';
    log(s, `${name(s, t.player)} conquers planet ${s.board.planets[a.planet].number}${spent}.`, t.player, 'conquer', [a.planet]);
    tally(s, t.player, 'planetsTaken');
    placeCube(s, t.player, a.planet);
  },
  endTurn(s) {
    requireActionPhase(s, true);
    const pl = s.players[s.turn.player];
    if (!s.turn.acted && s.turn.actionsLeft > 0) pl.idleTurns = (pl.idleTurns ?? 0) + 1;
    else delete pl.idleTurns;
    endTurn(s);
  },
} satisfies Partial<Handlers>;
