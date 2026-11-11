/** Turn structure: start of turn, the end-of-turn card phase, and passing the turn on. */
import { checkTakeOver, emptyTurn, gainResearch, log, name, type PendingOf } from './core';
import { cellOf, salvageYard, mechsOnBoard } from './lookups';
import { discoveryAt, canArmsDeal, canShunt, canTakeAnyCard, takeOverTargets, startSlots } from './queries';
import { next } from './rng';
import { rulesOf } from './rules';
import { activeSkills, ruleOf, stealableSkill, type TurnBonus } from './skillRules';
import type { GameState, OwnedSkill, Pending, PlayerId } from './types';

/** The start-of-turn bonuses of the player's skills, added up. */
function startOfTurnBonus(s: GameState, player: PlayerId): Required<TurnBonus> {
  const total = { freeDrops: 0, research: 0 };
  for (const { rule } of activeSkills(s, player)) {
    const b = rule.startOfTurn?.(s, player) ?? {};
    total.freeDrops += b.freeDrops ?? 0;
    total.research += b.research ?? 0;
  }
  return total;
}

function startTurn(s: GameState, player: PlayerId, actions: number, bonus: boolean) {
  const pl = s.players[player];
  s.turn = emptyTurn(player, s.turn.number + 1);
  s.turn.bonus = bonus;
  let n = actions;
  if (!bonus) {
    n -= pl.actionPenalty;
    pl.actionPenalty = 0;
  }
  const extra = startOfTurnBonus(s, player);
  s.turn.actionsLeft = Math.max(0, n);
  s.turn.freeDrops = extra.freeDrops;
  for (const d of s.dice) if (d.owner === player) s.turn.seen[d.id] = [d.value];

  // Skills a Signal Jammer player disabled come back at the start of that player's next regular turn,
  // not a Forced March turn, as with Sabotage (RULES.md ruling 9).
  if (!bonus) for (const o of s.players) activateSkills(s, o.id, (sk) => sk.disabledUntil === player);

  if (extra.research) gainResearch(s, player, extra.research);
  // Alien Artefact tiles: +1 research per own mech on one.
  const onArtefact = mechsOnBoard(s, player).filter((d) => {
    const c = cellOf(d)!;
    return s.board.cells[c.r][c.c].artefact;
  }).length;
  if (onArtefact) gainResearch(s, player, onArtefact);
  log(s, bonus ? `${pl.name} takes a bonus turn.` : `${pl.name}'s turn.`, player);
  s.log[s.log.length - 1].turn = true;
}

/** Lowest mech total goes first (ties: random); then everyone picks a starting objective in turn order. */
function startDrop(s: GameState) {
  const sums = s.players.map((p) => salvageYard(s, p.id).reduce((a, d) => a + d.value, 0));
  const low = Math.min(...sums);
  const tied = s.players.filter((p) => sums[p.id] === low);
  const first = tied[Math.floor(next(s) * tied.length)].id;
  s.turn.player = first;
  log(s, `${name(s, first)} has the lowest mech total (${low}) and goes first.`, first);
  for (let i = 0; i < s.players.length; i++) {
    s.pending.push({ kind: 'placeStart', player: (first + i) % s.players.length });
  }
}

/** Setup is complete: the first player starts. */
export function beginPlay(s: GameState) {
  s.phase = 'play';
  s.turn.number = 0;
  startTurn(s, s.turn.player, rulesOf(s).actionsPerTurn, false);
}

/**
 * Queues a player's card picks for this card phase: `count` earned this turn (`claim` of them by
 * Claim actions) plus any carried over by Forced March (see carryPicks in cards.ts).
 */
function queuePicks(s: GameState, player: PlayerId, count: number, claim: number) {
  const pl = s.players[player];
  count += pl.carriedPicks ?? 0;
  claim += pl.carriedClaimPicks ?? 0;
  delete pl.carriedPicks;
  delete pl.carriedClaimPicks;
  if (count > 0) s.pending.push({ kind: 'takeCard', player, count, ...(claim && { claim }) });
}

/** Phase 2: one card per cube placed this turn, plus one for a Discovery (Research at 6, or 4 with Rush Research). */
export function endTurn(s: GameState) {
  const p = s.turn.player;
  const pl = s.players[p];
  s.turn.phase = 'cards';
  if (!rulesOf(s).cards) return;
  let cards = s.turn.claims;
  if (pl.research >= discoveryAt(s, p)) {
    pl.research = 1;
    cards++;
    log(s, `${pl.name} makes a Discovery.`, p, 'discovery');
  }
  queuePicks(s, p, cards, s.turn.claimed ?? 0);
  // A cube placed on someone else's turn earns its card in this card phase, after the active
  // player, in turn order (designer, BGG thread 1087563).
  const off = s.turn.offTurnCubes ?? [];
  for (let i = 1; i < s.players.length; i++) {
    const o = (p + i) % s.players.length;
    queuePicks(s, o, off.filter((x) => x === o).length, 0);
  }
}

function finishTurn(s: GameState) {
  const p = s.turn.player;
  const n = s.players.length;
  const resume = s.turn.resume ?? (p + 1) % n;
  // Skills taken this turn, by anyone (off-turn picks too), work from now on, unless disabled.
  for (const o of s.players) activateSkills(s, o.id, (sk) => sk.disabledUntil === undefined);
  const pl = s.players[p];
  if (pl.killZone > 0) pl.killZone--;
  // Forced March turns: the active player's first, then those earned on this turn by other players
  // (taken off-turn, so "immediately" means right after this turn), in turn order. Then the
  // regular turn order picks up where it left off.
  for (let i = 0; i < n; i++) {
    const o = (p + i) % n;
    const bonus = s.players[o].bonusTurns.shift();
    if (bonus === undefined) continue;
    startTurn(s, o, bonus, true);
    s.turn.resume = resume;
    return;
  }
  startTurn(s, resume, rulesOf(s).actionsPerTurn, false);
}

/**
 * Puts the player's inactive skills that pass `which` into effect. A Stolen Flag taking effect can
 * make the player's Power already enough for Take Over (RULES.md ruling 3).
 */
function activateSkills(s: GameState, player: PlayerId, which: (sk: OwnedSkill) => boolean) {
  let threshold = false;
  for (const sk of s.players[player].skills) {
    if (sk.active || !which(sk)) continue;
    sk.active = true;
    delete sk.disabledUntil;
    if (ruleOf(sk.id).takeOverAt) threshold = true;
  }
  if (threshold) checkTakeOver(s, player);
}

/**
 * Decisions that resolve themselves when they come up: each returns true if it removed the
 * decision from the queue (usually because there is no legal choice).
 */
const AUTO_RESOLVE: { [K in Pending['kind']]?: (s: GameState, head: PendingOf<K>) => boolean } = {
  placeMechs(s, head) {
    if (salvageYard(s, head.player).length && startSlots(s, head.objective).length) return false;
    log(s, `${name(s, head.player)} drops around objective ${s.board.objectives[head.objective].number}.`, head.player, 'startObjective', [
      head.objective,
    ]);
    s.pending.shift();
    if (!s.pending.length) beginPlay(s);
    return true;
  },
  takeOver(s, head) {
    if (takeOverTargets(s, head.player).length) return false;
    log(s, `${name(s, head.player)} has nowhere to place a Take Over cube.`, head.player, 'takeOver');
    s.pending.shift();
    return true;
  },
  orbitalCannon(s) {
    if (mechsOnBoard(s).length) return false;
    s.pending.shift();
    return true;
  },
  kineticShunt(s) {
    if (canShunt(s)) return false;
    s.pending.shift();
    return true;
  },
  takeCard(s, head) {
    if (canTakeAnyCard(s, head.player) || canArmsDeal(s)) return false;
    s.pending.shift();
    return true;
  },
  strategicPlanTactic(s) {
    if (s.market.tacticRow.length) return false;
    s.pending.shift();
    return true;
  },
  signalJammer(s, head) {
    if (s.players[head.victim].skills.some((sk) => sk.active)) return false;
    s.pending.shift();
    return true;
  },
  stolenFlag(s, head) {
    if (stealableSkill(s, head.victim) >= 0) return false;
    s.pending.shift();
    return true;
  },
};

/** Runs after every action: auto-resolves decisions and advances the turn when nothing is pending. */
export function settle(s: GameState) {
  for (let guard = 0; guard < 50; guard++) {
    if (s.phase === 'over') return;
    const head = s.pending[0];
    const auto = head && (AUTO_RESOLVE[head.kind] as ((s: GameState, h: Pending) => boolean) | undefined);
    if (auto?.(s, head)) continue;
    if (!head && s.phase === 'setup') {
      startDrop(s);
      continue;
    }
    if (!head && s.phase === 'play' && s.turn.phase === 'cards') {
      finishTurn(s);
      continue;
    }
    return;
  }
  // Not a RuleError: a loop here is an engine bug, and must surface as one rather than leave a half-settled state.
  throw new Error('settle() did not settle after 50 steps');
}
