/** The five phase-1 actions (Move/Attack, Drop, Refit, Research, Claim) and ending the turn. */
import { cellIndex, same } from './board';
import { startCombat } from './combat';
import {
  fail,
  gainResearch,
  log,
  note,
  logTo,
  markMoved,
  name,
  ownMech,
  placeCube,
  requireActionPhase,
  rerollNew,
  aMech,
  mechName,
  spend,
  spendPeaceful,
  tally,
  cubeLeft,
  type Handlers,
} from './core';
import { boardLoc, die } from './lookups';
import { attackLaunches, canGainResearch, canMoveDie, canRefit, claimCheck, dropTargets, moveIndexes, moveOptions } from './queries';
import { rulesOf } from './rules';
import { endTurn } from './turn';

export const actionHandlers = {
  move(s, a) {
    requireActionPhase(s);
    const d = ownMech(s, a.die, 'board');
    if (!canMoveDie(s, d)) fail('This mech already moved this turn');
    const opt = moveIndexes(s, d).moves.get(cellIndex(s.board, a.to));
    if (!opt) fail('Out of range');
    spendPeaceful(s);
    d.loc = boardLoc(a.to);
    markMoved(s, d);
    logTo(s, d.owner, `${name(s, d.owner)} moves their ${mechName(s, d)}`, a.to);
  },
  attack(s, a) {
    requireActionPhase(s);
    const d = ownMech(s, a.die, 'board');
    if (!canMoveDie(s, d)) fail('This mech already moved this turn');
    const opts = moveOptions(s, d.id);
    if (!opts.attacks.has(a.target)) fail('Target out of range');
    // Only the spaces offered (attackLaunches): a space with the same outcome as a nearer one isn't.
    const opt = a.from ? attackLaunches(s, d.id, a.target, opts).find((x) => same(x.from, a.from!)) : opts.attacks.get(a.target)!;
    if (!opt) fail('Cannot attack from there');
    spend(s, 1);
    markMoved(s, d);
    startCombat(s, d, die(s, a.target), opt.from);
  },
  drop(s, a) {
    const t = requireActionPhase(s);
    const d = ownMech(s, a.die, 'salvageYard');
    if (!dropTargets(s, t.player).some((p) => same(p, a.to))) fail('Drop onto the perimeter of an objective with your cube');
    if (t.freeDrops > 0) t.freeDrops--;
    else spend(s, 1);
    d.loc = boardLoc(a.to);
    logTo(s, d.owner, `${name(s, d.owner)} drops ${aMech(s, d)}`, a.to);
  },
  refit(s, a) {
    requireActionPhase(s);
    const d = ownMech(s, a.die);
    if (!canRefit(s, d)) fail('This mech cannot be refitted');
    spend(s, 1);
    const was = mechName(s, d);
    rerollNew(s, d);
    note(s, `${name(s, d.owner)} refits their ${was} into ${aMech(s, d)}.`, d.owner);
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
  claim(s, a) {
    const t = requireActionPhase(s);
    const check = claimCheck(s, t.player, a.objective, a.replace !== undefined);
    if (!check.ok) fail(check.reason ?? 'Cannot claim');
    if (check.replace) {
      const owner = a.replace;
      if (owner === undefined || !check.replace.includes(owner)) fail('Choose which opponent cube to displace');
      const objective = s.board.objectives[a.objective];
      objective.cubes.splice(objective.cubes.lastIndexOf(owner), 1);
      s.players[owner].cubesLeft++;
      cubeLeft(s, owner, a.objective);
      log(s, `${name(s, t.player)} displaces ${name(s, owner)}'s cube.`, t.player, 'claim', [a.objective]);
    }
    spend(s, 2);
    t.claimed = (t.claimed ?? 0) + 1;
    // Science: the research that moved the sum onto the target.
    if (check.research) s.players[t.player].research -= check.research;
    const spent = check.research ? `, spending ${check.research} research` : '';
    log(s, `${name(s, t.player)} claims objective ${s.board.objectives[a.objective].number}${spent}.`, t.player, 'claim', [a.objective]);
    tally(s, t.player, 'objectivesTaken');
    placeCube(s, t.player, a.objective);
  },
  endTurn(s) {
    requireActionPhase(s, true);
    const pl = s.players[s.turn.player];
    if (!s.turn.acted && s.turn.actionsLeft > 0) pl.idleTurns = (pl.idleTurns ?? 0) + 1;
    else delete pl.idleTurns;
    endTurn(s);
  },
} satisfies Partial<Handlers>;
