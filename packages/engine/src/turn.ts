/** Turn structure: start of turn, the end-of-turn card phase, and passing the turn on. */
import { checkInfamy, emptyTurn, gainResearch, log, name, type PendingOf } from './core';
import { cellOf, scrapyard, shipsOnBoard } from './lookups';
import { breakthroughAt, canProfiteer, canShunt, canTakeAnyCard, infamyTargets, startSlots } from './queries';
import { rulesOf } from './rules';
import { activeSkills, ruleOf, stealableSkill, type TurnBonus } from './skillRules';
import type { GameState, OwnedSkill, Pending, PlayerId } from './types';

/** The start-of-turn bonuses of the player's skills, added up. */
function startOfTurnBonus(s: GameState, player: PlayerId): Required<TurnBonus> {
  const total = { freeDeploys: 0, research: 0 };
  for (const { rule } of activeSkills(s, player)) {
    const b = rule.startOfTurn?.(s, player) ?? {};
    total.freeDeploys += b.freeDeploys ?? 0;
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
  s.turn.freeDeploys = extra.freeDeploys;
  for (const d of s.dice) if (d.owner === player) s.turn.seen[d.id] = [d.value];

  // Skills a Ruthless player disabled come back at the start of that player's next regular turn,
  // not a Momentum turn, as with Sabotage (OPEN-QUESTIONS #66).
  if (!bonus) for (const o of s.players) activateSkills(s, o.id, (sk) => sk.disabledUntil === player);

  if (extra.research) gainResearch(s, player, extra.research);
  // Void tiles: +1 research per own ship on one.
  const onVoid = shipsOnBoard(s, player).filter((d) => {
    const c = cellOf(d)!;
    return s.board.cells[c.r][c.c].void;
  }).length;
  if (onVoid) gainResearch(s, player, onVoid);
  log(s, bonus ? `${pl.name} takes a bonus turn.` : `${pl.name}'s turn.`, player);
  s.log[s.log.length - 1].turn = true;
}

/** Setup is complete: the first player starts. */
export function beginPlay(s: GameState) {
  s.phase = 'play';
  s.turn.number = 0;
  startTurn(s, s.turn.player, rulesOf(s).actionsPerTurn, false);
}

/**
 * Queues a player's card picks for this card phase: `count` earned this turn (`conquer` of them by
 * Conquer actions) plus any carried over by Momentum (see carryPicks in cards.ts).
 */
function queuePicks(s: GameState, player: PlayerId, count: number, conquer: number) {
  const pl = s.players[player];
  count += pl.carriedPicks ?? 0;
  conquer += pl.carriedConquerPicks ?? 0;
  delete pl.carriedPicks;
  delete pl.carriedConquerPicks;
  if (count > 0) s.pending.push({ kind: 'takeCard', player, count, ...(conquer && { conquer }) });
}

/** Phase 2: one card per cube placed this turn, plus one for a research breakthrough. */
export function endTurn(s: GameState) {
  const p = s.turn.player;
  const pl = s.players[p];
  s.turn.phase = 'cards';
  if (!rulesOf(s).cards) return;
  let cards = s.turn.conquests;
  if (pl.research >= breakthroughAt(s, p)) {
    pl.research = 1;
    cards++;
    log(s, `${pl.name} makes a research breakthrough.`, p, 'breakthrough');
  }
  queuePicks(s, p, cards, s.turn.conquered ?? 0);
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
  if (pl.planAhead > 0) pl.planAhead--;
  // Momentum turns: the active player's first, then those earned on this turn by other players
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
 * Puts the player's inactive skills that pass `which` into effect. A Prideful taking effect can
 * make the player's Dominance already enough for Infamy (OPEN-QUESTIONS #32).
 */
function activateSkills(s: GameState, player: PlayerId, which: (sk: OwnedSkill) => boolean) {
  let threshold = false;
  for (const sk of s.players[player].skills) {
    if (sk.active || !which(sk)) continue;
    sk.active = true;
    delete sk.disabledUntil;
    if (ruleOf(sk.id).infamyAt) threshold = true;
  }
  if (threshold) checkInfamy(s, player);
}

/**
 * Decisions that resolve themselves when they come up: each returns true if it removed the
 * decision from the queue (usually because there is no legal choice).
 */
const AUTO_RESOLVE: { [K in Pending['kind']]?: (s: GameState, head: PendingOf<K>) => boolean } = {
  placeShips(s, head) {
    if (scrapyard(s, head.player).length && startSlots(s, head.planet).length) return false;
    log(s, `${name(s, head.player)} deploys around planet ${s.board.planets[head.planet].number}.`, head.player, 'startPlanet', [
      head.planet,
    ]);
    s.pending.shift();
    if (!s.pending.length) beginPlay(s);
    return true;
  },
  infamy(s, head) {
    if (infamyTargets(s, head.player).length) return false;
    log(s, `${name(s, head.player)} has nowhere to place an Infamy cube.`, head.player, 'infamy');
    s.pending.shift();
    return true;
  },
  showOfForce(s) {
    if (shipsOnBoard(s).length) return false;
    s.pending.shift();
    return true;
  },
  kineticShunt(s) {
    if (canShunt(s)) return false;
    s.pending.shift();
    return true;
  },
  takeCard(s, head) {
    if (canTakeAnyCard(s, head.player) || canProfiteer(s)) return false;
    s.pending.shift();
    return true;
  },
  patientTactic(s) {
    if (s.market.tacticRow.length) return false;
    s.pending.shift();
    return true;
  },
  ruthless(s, head) {
    if (s.players[head.victim].skills.some((sk) => sk.active)) return false;
    s.pending.shift();
    return true;
  },
  prideful(s, head) {
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
    if (!head && s.phase === 'play' && s.turn.phase === 'cards') {
      finishTurn(s);
      continue;
    }
    return;
  }
  // Not a RuleError: a loop here is an engine bug, and must surface as one rather than leave a half-settled state.
  throw new Error('settle() did not settle after 50 steps');
}
