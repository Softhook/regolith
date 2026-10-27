/** Combat: starting an attack, missiles, resolution, advancing, and Infamy. */
import {
  checkInfamy,
  destroyedEnemyShip,
  destroyShip,
  fail,
  headOf,
  log,
  logTo,
  loseDominance,
  name,
  placeCube,
  shipName,
  tally,
  type Handlers,
  type PendingOf,
} from './core';
import { cardName, card } from './data';
import { boardLoc, cellOf, die, dieAt } from './lookups';
import { combatDice, combatOutcome, infamyTargets, missileRefusal, skillLimit } from './queries';
import { d6 } from './rng';
import { rulesOf } from './rules';
import { anySkill, stealableSkill } from './skillRules';
import type { Cell, Die, GameState, PlayerId } from './types';

/**
 * The attacker has moved `from` next to the defender, or, `ranged` (a power), fires from there.
 * A defender with Dangerous may first destroy both ships; otherwise both combat dice are rolled now.
 */
export function startCombat(s: GameState, attacker: Die, defender: Die, from: Cell, ranged = false) {
  attacker.loc = boardLoc(from);
  s.turn.attacked = true;
  log(
    s,
    `${name(s, attacker.owner)}'s ${shipName(s, attacker)} attacks ${name(s, defender.owner)}'s ${shipName(s, defender)}.`,
    attacker.owner,
  );
  if (anySkill(s, defender.owner, (r) => r.combat?.destroyBoth)) {
    s.pending.unshift({
      kind: 'dangerous',
      player: defender.owner,
      attacker: attacker.id,
      defender: defender.id,
      from,
      ...(ranged && { ranged }),
    });
  } else rollCombat(s, attacker, defender, from, ranged);
}

function rollCombat(s: GameState, attacker: Die, defender: Die, from: Cell, ranged?: boolean) {
  const rollFor = (p: PlayerId) => Array.from({ length: combatDice(s, p) }, () => d6(s));
  s.pending.unshift({
    kind: 'combat',
    id: ++s.combatCounter,
    attacker: { player: attacker.owner, die: attacker.id, ship: attacker.value, dice: rollFor(attacker.owner), missile: false },
    defender: { player: defender.owner, die: defender.id, ship: defender.value, dice: rollFor(defender.owner), missile: false },
    from,
    at: cellOf(defender)!,
    ...(ranged && { ranged: true as const }),
  });
}

/** Effects of `winner` destroying one of `loser`'s ships in combat. */
function onDestroy(s: GameState, winner: PlayerId, loser: PlayerId) {
  loseDominance(s, loser, 1);
  destroyedEnemyShip(s, winner, 1, loser);
}

function resolveCombat(s: GameState, combat: PendingOf<'combat'>) {
  const out = combatOutcome(s, combat);
  s.pending.shift();
  const att = die(s, combat.attacker.die);
  const def = die(s, combat.defender.die);
  const A = combat.attacker.player;
  const D = combat.defender.player;
  if (out.attackerWins) {
    log(s, `${name(s, A)} wins the battle (${out.attacker.total} vs ${out.defender.total}).`, A, 'battleWon');
    tally(s, A, 'battlesWon');
    tally(s, D, 'battlesLost');
    destroyShip(s, def);
    if (!combat.ranged) s.pending.unshift({ kind: 'advance', player: A, die: att.id, to: combat.at });
    onDestroy(s, A, D);
  } else if (out.stubborn) {
    log(s, `${name(s, D)} holds firm and destroys the attacker (${out.defender.total} vs ${out.attacker.total}).`, D, 'battleWon');
    tally(s, D, 'battlesWon');
    tally(s, A, 'battlesLost');
    destroyShip(s, att);
    onDestroy(s, D, A);
  } else {
    // Repelled: the attacker is already back on the space it attacked from.
    log(s, `${name(s, D)} repels the attack (${out.defender.total} vs ${out.attacker.total}).`, D, 'repelled');
    tally(s, D, 'battlesWon');
    tally(s, A, 'battlesLost');
  }
}

export const combatHandlers = {
  missile(s, a) {
    const head = headOf(s, 'combat', 'No combat to target');
    // A combatant fires only on their own roll, and only while losing (RULES.md ruling 2).
    const refusal = missileRefusal(s, head, a.by, a.side);
    if (refusal) fail(refusal);
    const pl = s.players[a.by];
    const side = head[a.side];
    pl.missiles--;
    side.missile = true;
    log(s, `${pl.name} fires an atomic: ${name(s, side.player)}'s combat roll becomes 1.`, a.by, 'missile');
  },
  /** Dangerous: destroy both ships (no dominance change, no "when you destroy" effects), or fight. */
  dangerous(s, a) {
    const head = headOf(s, 'dangerous', `No ${cardName('dangerous')} decision`);
    s.pending.shift();
    const att = die(s, head.attacker);
    const def = die(s, head.defender);
    if (!a.destroy) return rollCombat(s, att, def, head.from, head.ranged);
    log(s, `${name(s, head.player)} is ${cardName('dangerous')}: both mechs are destroyed.`, head.player, 'shipDestroyed');
    // No "destroy" effects (destroyedEnemyShip), but the losses count.
    for (const d of [att, def]) {
      if (d.owner === head.player) continue;
      tally(s, head.player, 'shipsDestroyed');
      tally(s, d.owner, 'shipsLost');
    }
    destroyShip(s, def);
    destroyShip(s, att);
  },
  resolveCombat(s) {
    resolveCombat(s, headOf(s, 'combat', 'No combat to resolve'));
  },
  advance(s, a) {
    const head = headOf(s, 'advance', 'Nothing to advance');
    s.pending.shift();
    const d = die(s, head.die);
    if (a.move && !dieAt(s, head.to)) {
      d.loc = boardLoc(head.to);
      logTo(s, head.player, `${name(s, head.player)}'s ${shipName(s, d)} advances`, head.to);
    }
  },
  infamy(s, a) {
    const head = headOf(s, 'infamy', 'No Infamy to resolve');
    if (!infamyTargets(s, head.player).some((p) => p.id === a.planet)) fail('Choose an objective without your cube');
    s.pending.shift();
    s.players[head.player].dominance = 1;
    log(s, `${name(s, head.player)} seizes objective ${s.board.planets[a.planet].number} through Infamy.`, head.player, 'seize', [
      a.planet,
    ]);
    tally(s, head.player, 'planetsTaken');
    placeCube(s, head.player, a.planet);
    if (s.phase !== 'play' || !rulesOf(s).cards) return;
    const ownTurn = head.player === s.turn.player;
    if (s.turn.phase === 'cards') {
      // Infamy during the card phase still earns a card for the cube: at once on the player's own
      // turn, otherwise after the active player's picks (designer, BGG thread 1087563).
      const pick: PendingOf<'takeCard'> = { kind: 'takeCard', player: head.player, count: 1 };
      if (ownTurn) s.pending.unshift(pick);
      else s.pending.push(pick);
    } else if (!ownTurn) {
      // In the action phase the active player's cube counts in turn.conquests; another player's
      // is remembered for this turn's card phase (see endTurn).
      (s.turn.offTurnCubes ??= []).push(head.player);
    }
  },
  prideful(s, a) {
    const head = headOf(s, 'prideful', `No ${cardName('prideful')} decision`);
    s.pending.shift();
    if (!a.take) {
      log(s, `${name(s, head.player)} declines to take ${cardName('prideful')}.`, head.player);
      return;
    }
    const victimPl = s.players[head.victim];
    const winnerPl = s.players[head.player];
    const idx = stealableSkill(s, head.victim);
    if (idx !== -1) {
      // A stolen Prideful works at once, even if a Ruthless player had disabled it (RULES.md ruling 3).
      const [stolen] = victimPl.skills.splice(idx, 1);
      winnerPl.skills.push({ id: stolen.id, active: true });
      log(s, `${winnerPl.name} takes ${cardName('prideful')} from ${victimPl.name}!`, head.player, 'cardTaken');
      s.log[s.log.length - 1].card = stolen.id;
      if (winnerPl.skills.length > skillLimit(s, head.player)) {
        s.pending.unshift({ kind: 'discardSkill', player: head.player, reason: 'limit', cannotDiscard: stolen.id });
      }
      checkInfamy(s, head.player);
    }
  },
  ruthless(s, a) {
    const head = headOf(s, 'ruthless', `No ${cardName('ruthless')} decision`);
    s.pending.shift();
    if (!a.skill) {
      log(s, `${name(s, head.player)} declines to disable a skill.`, head.player);
      return;
    }
    const victimPl = s.players[head.victim];
    const sk = victimPl.skills.find((x) => x.id === a.skill && x.active);
    if (!sk) fail('Skill is not active or not owned by enemy');
    sk.active = false;
    sk.disabledUntil = head.player;
    log(s, `${name(s, head.player)} disables ${victimPl.name}'s ${card(sk.id).name} (${cardName('ruthless')}).`, head.player);
  },
} satisfies Partial<Handlers>;
