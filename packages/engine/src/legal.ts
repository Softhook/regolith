/** Legal action enumeration, used by the AI and for UI hints. */
import { same, spaces } from './board';
import { barrierBreaks } from './breakBarriers';
import { tryApply } from './engine';
import type { PendingOf } from './core';
import { barrierAt, reserve, salvageYard, mechsOnBoard } from './lookups';
import {
  actionsClosed,
  attackLaunches,
  barrierSpaces,
  canCurious,
  canGainResearch,
  canMoveDie,
  canPlayStoredTactic,
  canRefit,
  canUseAbility,
  carryOptions,
  carryPassengers,
  claimCheck,
  dropTargets,
  freeAttackTargets,
  infamyTargets,
  atomicOffered,
  moveOptions,
  shuntTargets,
  barrierShuntTargets,
  startSlots,
  tacticalOptions,
  usedThisTurn,
} from './queries';
import { hasAbility, hooksOf, rulesOf } from './rules';
import { anySkill, hasSkill } from './skillRules';
import type { Action, Die, GameState, Pending } from './types';

/**
 * Candidate answers to each pending decision. Candidates may include illegal ones:
 * legalActions() keeps only those the engine accepts.
 */
const DECISION_CANDIDATES: { [K in Pending['kind']]: (s: GameState, head: PendingOf<K>) => Action[] } = {
  setupRoll: (_, head) => [{ type: 'setupKeep' }, ...(head.rerolled ? [] : [{ type: 'setupReroll' } as const])],
  skillDraft: (_, head) => head.options.map((skill) => ({ type: 'draftSkill', skill })),
  placeStart: (s) => s.board.objectives.filter((p) => p.start && !p.cubes.length).map((p) => ({ type: 'placeStart', objective: p.id })),
  placeMechs: (s, head) =>
    salvageYard(s, head.player).flatMap((d) => startSlots(s, head.objective).map((to) => ({ type: 'placeMech', die: d.id, to }) as const)),
  combat: (s, head) => {
    const out: Action[] = [{ type: 'resolveCombat' }];
    for (const pl of s.players) {
      for (const side of ['attacker', 'defender'] as const) {
        if (atomicOffered(s, head, pl.id, side)) out.push({ type: 'atomic', by: pl.id, side });
      }
    }
    return out;
  },
  dangerous: () => [
    { type: 'dangerous', destroy: false },
    { type: 'dangerous', destroy: true },
  ],
  clever: (_, head) => (head.options ?? [1, 2, 3, 4, 5, 6]).map((value) => ({ type: 'clever', value })),
  advance: () => [
    { type: 'advance', move: true },
    { type: 'advance', move: false },
  ],
  infamy: (s, head) => infamyTargets(s, head.player).map((p) => ({ type: 'infamy', objective: p.id })),
  takeCard: (s, head) => {
    const m = s.market;
    const out: Action[] = [];
    const patient = anySkill(s, head.player, (r) => r.storeTactics);
    m.skillRow.forEach((_, index) => out.push({ type: 'takeCard', deck: 'skill', index }));
    m.tacticRow.forEach((_, index) => {
      out.push({ type: 'takeCard', deck: 'tactic', index });
      if (patient) out.push({ type: 'takeCard', deck: 'tactic', index, store: true });
    });
    if (m.expansions > 0 && reserve(s, head.player).length) out.push({ type: 'takeCard', deck: 'expansion', index: 0 });
    out.push({ type: 'profiteer' });
    return out;
  },
  peek: () => [
    { type: 'peekChoice', takeTop: true },
    { type: 'peekChoice', takeTop: false },
  ],
  discardSkill: (s, head) =>
    s.players[head.player].skills.filter((sk) => sk.id !== head.cannotDiscard).map((sk) => ({ type: 'discardSkill', skill: sk.id })),
  placeExpansion: (s, head) => [
    { type: 'placeExpansion', to: null },
    ...dropTargets(s, head.player).map((to) => ({ type: 'placeExpansion', to }) as const),
  ],
  showOfForce: (s) => mechsOnBoard(s).map((d) => ({ type: 'showOfForce', die: d.id })),
  iceTunnel: (s, head) =>
    spaces(s.board)
      .filter((cell) => !head.placed.some((p) => same(p, cell)) && !barrierAt(s, cell) && !s.wormhole?.some((w) => same(w, cell)))
      .map((cell) => ({ type: 'iceTunnel', cell })),
  placeBarrier: (s) => barrierSpaces(s).map((cell) => ({ type: 'placeBarrier', cell })),
  kineticShunt: (s) => [
    ...mechsOnBoard(s).flatMap((d) => shuntTargets(s, d).map((to) => ({ type: 'kineticShunt', die: d.id, to }) as const)),
    ...(s.barriers ?? []).flatMap((b) =>
      barrierShuntTargets(s, b).map((to) => ({ type: 'shuntBarrier', from: { r: b.r, c: b.c }, to }) as const),
    ),
  ],
  changeOfHeart: (s) => [...new Set(s.market.skillDeck)].map((skill) => ({ type: 'changeOfHeart', skill })),
  patientTactic: (s) => [
    { type: 'patientTactic' } as const,
    ...s.market.tacticRow.map((_, index) => ({ type: 'patientTactic', index }) as const),
  ],
  prideful: () => [
    { type: 'prideful', take: true },
    { type: 'prideful', take: false },
  ],
  ruthless: (s, head) => [
    { type: 'ruthless' } as const,
    ...s.players[head.victim].skills.filter((sk) => sk.active).map((sk) => ({ type: 'ruthless', skill: sk.id }) as const),
  ],
  unveil: (s, head) => {
    const out: Action[] = [{ type: 'unveilDone' }];
    const targets = dropTargets(s, head.player);
    for (const d of salvageYard(s, head.player)) if (!head.rerolled.includes(d.id)) out.push({ type: 'unveilReroll', die: d.id });
    for (const d of salvageYard(s, head.player)) for (const to of targets) out.push({ type: 'unveilDrop', die: d.id, to });
    return out;
  },
};

/** Every Behemoth carry by `d`: passenger, destination and where it is set down. `range` 1 is Tactical's step. */
function carries(s: GameState, d: Die, range?: number) {
  return carryPassengers(s, d.id).flatMap((p) =>
    [...carryOptions(s, d.id, p.id, range).values()].flatMap((dest) =>
      dest.setDowns.map((setDown) => ({ passenger: p.id, to: dest.cell, setDown })),
    ),
  );
}

/** Phase-1 options for the current player. `includeCarry` adds every Behemoth carry (many). */
function actionPhaseOptions(s: GameState, opts: { includeCarry?: boolean }): Action[] {
  const me = s.turn.player;
  const t = s.turn;
  const pl = s.players[me];
  const out: Action[] = [{ type: 'endTurn' }];

  if (canPlayStoredTactic(s, me)) {
    for (const c of pl.storedTactics ?? []) out.push({ type: 'playStoredTactic', card: c });
  }

  if (actionsClosed(t)) return out;

  const actions = t.actionsLeft;
  // A move is paid with an action, or Curious's extra action (spendPeaceful).
  const curious = actions === 0 && canCurious(s, me);
  const canPayMove = actions > 0 || curious;
  const canAttack = (cost: number) => actions >= cost;

  for (const d of mechsOnBoard(s, me)) {
    if (canPayMove && canMoveDie(s, d)) {
      const moves = moveOptions(s, d.id);
      for (const m of moves.moves.values()) out.push({ type: 'move', die: d.id, to: m.cell });
      if (canAttack(1)) {
        for (const target of moves.attacks.keys()) {
          for (const { from } of attackLaunches(s, d.id, target, moves)) out.push({ type: 'attack', die: d.id, target, from });
        }
      }
    }
    for (const { cell } of barrierBreaks(s, d)) out.push({ type: 'breakBarrier', die: d.id, cell });
    const action = hooksOf(s, d)?.action;
    if (action) for (const c of action.options(s, d)) out.push({ type: 'ability', die: d.id, ...c });
    if (actions > 0 && canRefit(s, d)) out.push({ type: 'refit', die: d.id });
    if (hasSkill(s, me, 'tactical') && !usedThisTurn(s, 'tactical')) {
      const tac = tacticalOptions(s, d.id);
      for (const m of tac.moves) out.push({ type: 'tactical', die: d.id, to: m.cell });
      if (canAttack(0)) for (const x of tac.attacks) out.push({ type: 'tactical', die: d.id, target: x.die.id });
      if (hasAbility(s, d, 'carry') && opts.includeCarry && canUseAbility(s, d)) {
        for (const c of carries(s, d, 1)) out.push({ type: 'tactical', die: d.id, ...c });
      }
    }
    if (canUseAbility(s, d)) {
      if (hasAbility(s, d, 'freeAttack') && canAttack(0))
        for (const x of freeAttackTargets(s, d.id)) out.push({ type: 'freeAttack', die: d.id, target: x.id });
      if (hasAbility(s, d, 'swap'))
        for (const o of mechsOnBoard(s, me)) if (o.id !== d.id) out.push({ type: 'swap', die: d.id, other: o.id });
      if (hasAbility(s, d, 'change')) out.push({ type: 'change', die: d.id, value: 3 }, { type: 'change', die: d.id, value: 5 });
      if (hasAbility(s, d, 'carry') && opts.includeCarry && canPayMove && canMoveDie(s, d)) {
        for (const c of carries(s, d)) out.push({ type: 'carry', die: d.id, ...c });
      }
    }
    if (hasSkill(s, me, 'flexible') && !usedThisTurn(s, 'flexible')) {
      if (d.value < 6) out.push({ type: 'flexible', die: d.id, delta: 1 });
      if (d.value > 1) out.push({ type: 'flexible', die: d.id, delta: -1 });
    }
    if (hasSkill(s, me, 'resourceful') && !usedThisTurn(s, 'resourceful')) {
      out.push({ type: 'resourceful', die: d.id });
    }
  }
  const targets = dropTargets(s, me);
  for (const d of salvageYard(s, me)) {
    if (actions > 0 || t.freeDrops > 0) for (const to of targets) out.push({ type: 'drop', die: d.id, to });
    if (actions > 0 && canRefit(s, d)) out.push({ type: 'refit', die: d.id });
  }
  if (rulesOf(s).cards && (actions > 0 || curious) && pl.research < rulesOf(s).researchLimit && canGainResearch(s, me))
    out.push({ type: 'research' });
  if (actions >= 2)
    for (const p of s.board.objectives) {
      const c = claimCheck(s, me, p.id);
      if (c.ok && !c.replace) out.push({ type: 'claim', objective: p.id });
      // Over-claim: on a full objective it is the only way, on one with room it is a choice.
      const o = c.replace ? c : rulesOf(s).overClaim ? claimCheck(s, me, p.id, true) : c;
      if (o.ok && o.replace) for (const replace of o.replace) out.push({ type: 'claim', objective: p.id, replace });
    }
  if (hasSkill(s, me, 'composed') && !usedThisTurn(s, 'composed') && pl.power > 1 && canGainResearch(s, me)) out.push({ type: 'composed' });
  if (hasSkill(s, me, 'ambitious') && !usedThisTurn(s, 'ambitious')) out.push({ type: 'ambitious' });
  return out;
}

export function legalActions(s: GameState, opts: { includeCarry?: boolean } = {}): Action[] {
  if (s.phase === 'over') return [];
  const head = s.pending[0];
  if (head) return answers(s, head).filter((a) => tryApply(s, a) !== null);
  if (s.phase === 'play' && s.turn.phase === 'actions') return actionPhaseOptions(s, opts);
  return [];
}

/** The answers DECISION_CANDIDATES lists for a pending decision, not yet tried. */
function answers(s: GameState, head: Pending): Action[] {
  return (DECISION_CANDIDATES[head.kind] as (s: GameState, h: Pending) => Action[])(s, head);
}

/**
 * The answers to the pending decision that may be legal, in legalActions' order but not yet tried:
 * for the AI, which tries each anyway (legalActions applies every one to test it, and the AI would
 * copy the state twice for each). Without a decision, legalActions.
 */
export function decisionCandidates(s: GameState): Action[] {
  const head = s.pending[0];
  if (!head || s.phase === 'over') return legalActions(s);
  return answers(s, head);
}
