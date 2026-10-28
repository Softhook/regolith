/**
 * Advance cards: the market (taking, peeking, refilling), one-shot Tactic effects and
 * the decisions they open, and the skill limit.
 *
 * To add a Tactic: list its effect in TACTIC_EFFECT_IDS (effects.ts); the compiler then asks for
 * its entry in TACTIC_EFFECTS. Skills are listed in SKILL_EFFECTS (effects.ts).
 */
import { same } from './board';
import {
  addBarrier,
  destroyedEnemyShip,
  destroyShip,
  fail,
  gainDominance,
  headOf,
  log,
  note,
  logTo,
  name,
  requireActionPhase,
  roll,
  aShip,
  shipName,
  tally,
  type Handlers,
  type PendingOf,
} from './core';
import { cardName, card, cardKind, effectOf } from './data';
import type { TacticEffect } from './effects';
import { barrierAt, boardLoc, die, reserve, shipsOnBoard } from './lookups';
import {
  barrierSpaces,
  canHoldBarrier,
  canShunt,
  canPlayStoredTactic,
  canProfiteer,
  canTakeCard,
  deployTargets,
  shuntPaths,
  skillLimit,
} from './queries';
import { shuffle } from './rng';
import { rulesOf } from './rules';
import { anySkill, ruleOf } from './skillRules';
import type { DeckKind, GameState, PlayerId, PlayerState } from './types';

// ---------------------------------------------------------------------------
// Tactic effects

type TacticEffectFn = (s: GameState, p: PlayerId) => void;

/** What each Tactic does when taken. Effects that need a choice push a pending decision. */
const TACTIC_EFFECTS: Record<TacticEffect, TacticEffectFn> = {
  aggression: (s, p) => gainDominance(s, p, 2),
  'black-market': (s, p) => {
    s.players[p].missiles += 2;
  },
  'change-of-heart': (s, p) => {
    // Like a draw: an empty deck is first refilled from its discards.
    if (refill(s, 'skill').length) s.pending.unshift({ kind: 'changeOfHeart', player: p });
  },
  momentum: (s, p) => {
    s.players[p].bonusTurns.push(2);
    // Gambits resolve at once (designer, BGG thread 1068669): the bonus turn comes before any
    // picks still owed, which are taken in its card phase (as on Board Game Arena).
    // On the player's own turn, other players' off-turn picks still come after all of theirs
    // (designer, BGG thread 1087563), so they move to the bonus turn's card phase too. Taken on
    // someone else's turn, the bonus turn follows this one (see finishTurn) and only the player's
    // own picks move; the others go on as before.
    const ownTurn = p === s.turn.player;
    s.pending = s.pending.filter((x) => {
      if (x.kind !== 'takeCard' || (!ownTurn && x.player !== p)) return true;
      carryPicks(s.players[x.player], x);
      return false;
    });
  },
  'plan-ahead': (s, p) => {
    // "Until the end of your next turn": taken off-turn, that is the player's coming turn.
    s.players[p].planAhead = p === s.turn.player ? 2 : 1;
  },
  // Regolith's Sabotage: two actions, where the Community Edition's took one.
  'sabotage-double': (s, p) => {
    for (const o of s.players) if (o.id !== p) o.actionPenalty += 2;
  },
  'show-of-force': (s, p) => {
    if (shipsOnBoard(s).length) s.pending.unshift({ kind: 'showOfForce', player: p });
  },
  'unveil-the-fleet': (s, p) => {
    s.pending.unshift({ kind: 'unveil', player: p, rerolled: [] });
    for (const d of shipsOnBoard(s, p)) destroyShip(s, d);
  },
  'warp-gate': (s, p) => {
    s.pending.unshift({ kind: 'warpGate', player: p, placed: [] });
  },
  barrier: (s, p) => {
    if (barrierSpaces(s).length > 0) s.pending.unshift({ kind: 'placeBarrier', player: p, placed: [] });
  },
  'kinetic-shunt': (s, p) => {
    if (canShunt(s)) s.pending.unshift({ kind: 'kineticShunt', player: p });
  },
  expansion: (s, p) => {
    const res = reserve(s, p);
    if (!res.length) {
      log(s, `${s.players[p].name} has no reserve mechs left.`, p);
      return;
    }
    // Placed after the roll is final (a Clever choice comes first).
    s.pending.unshift({ kind: 'placeExpansion', player: p, die: res[0].id });
    roll(s, res[0]);
  },
};

// ---------------------------------------------------------------------------
// Market

/** An empty deck is refilled by shuffling its discards (2013 rulebook p.9). Returns the deck. */
function refill(s: GameState, deck: DeckKind): string[] {
  const m = s.market;
  const d = deck === 'skill' ? m.skillDeck : m.tacticDeck;
  const discard = deck === 'skill' ? m.skillDiscard : m.tacticDiscard;
  if (!d.length && discard.length) {
    d.push(...shuffle(s, discard));
    discard.length = 0;
  }
  return d;
}

/** Draws from a deck, reshuffling its discards when it runs out. */
function draw(s: GameState, deck: DeckKind): string | undefined {
  return refill(s, deck).shift();
}

/** Takes a face-up card; the row slides away from the deck and a new card enters next to it. */
function takeFromRow(s: GameState, deck: DeckKind, index: number): string {
  const row = deck === 'skill' ? s.market.skillRow : s.market.tacticRow;
  if (index < 0 || index >= row.length) fail('No card there');
  const [taken] = row.splice(index, 1);
  const next = draw(s, deck);
  if (next) row.unshift(next);
  return taken;
}

function gainCard(s: GameState, p: PlayerId, id: string) {
  tally(s, p, 'cardsTaken');
  const def = card(id);
  const pl = s.players[p];
  if (cardKind(id) === 'skill') {
    pl.skills.push({ id, active: false });
    log(s, `${pl.name} takes the ${def.name} ${rulesOf(s).cards?.terms.skill ?? 'skill'}.`, p, 'cardTaken');
    s.log[s.log.length - 1].card = id;
    if (pl.skills.length > skillLimit(s, p)) s.pending.unshift({ kind: 'discardSkill', player: p, reason: 'limit' });
    // Resolved before any discard, so a Tactic stored now is lost if Patient itself is then discarded.
    if (ruleOf(id).storeTactics) s.pending.unshift({ kind: 'patientTactic', player: p });
  } else {
    playTactic(s, p, id, `${pl.name} plays ${def.name}.`);
  }
}

/** A Tactic is discarded and its effect resolves. */
function playTactic(s: GameState, p: PlayerId, id: string, message: string) {
  log(s, message, p, 'cardPlayed');
  s.log[s.log.length - 1].card = id;
  s.market.tacticDiscard.push(id);
  const effect = TACTIC_EFFECTS[effectOf(id) as TacticEffect] as TacticEffectFn | undefined;
  if (!effect) throw new Error(`Unhandled tactic ${id}`);
  effect(s, p);
}

/** Gains a card just taken, or with Patient stores the Tactic instead of playing it. */
function takeOrStore(s: GameState, p: PlayerId, id: string, store: boolean | undefined) {
  if (!store) return gainCard(s, p, id);
  const pl = s.players[p];
  tally(s, p, 'cardsTaken');
  (pl.storedTactics ??= []).push(id);
  log(s, `${pl.name} stores ${card(id).name} (${cardName('patient')}).`, p, 'cardTaken');
  s.log[s.log.length - 1].card = id;
}

/** Moves a player's remaining picks to the Momentum turn's card phase. */
function carryPicks(pl: PlayerState, x: PendingOf<'takeCard'>) {
  pl.carriedPicks = (pl.carriedPicks ?? 0) + x.count;
  if (x.conquer) pl.carriedConquerPicks = (pl.carriedConquerPicks ?? 0) + x.conquer;
}

/** Counts one card taken from the current takeCard decision. */
function consumeCardPick(s: GameState) {
  const head = s.pending[0];
  if (head?.kind !== 'takeCard') return;
  head.count--;
  // A card can come from any pick, so the picks a Profiteering missile can replace are used last.
  if (head.conquer) head.conquer = Math.min(head.conquer, head.count);
  if (head.count <= 0) s.pending.shift();
}

export const cardHandlers = {
  takeCard(s, a) {
    const head = headOf(s, 'takeCard', 'Not taking a card');
    const p = head.player;
    if (a.store && (a.deck !== 'tactic' || !anySkill(s, p, (r) => r.storeTactics)))
      fail(`Only a Tactic can be stored, with ${cardName('patient')}`);
    if (a.deck === 'expansion') {
      if (a.index !== 0) fail(`The ${cardName('expansion')} pile has one face-up card`);
      const res = reserve(s, p);
      if (s.market.expansions <= 0) fail(`No ${cardName('expansion')} cards left`);
      if (!res.length) fail('Your reserve is empty');
      consumeCardPick(s);
      s.market.expansions--;
      s.pending.unshift({ kind: 'placeExpansion', player: p, die: res[0].id });
      roll(s, res[0]);
      log(s, `${name(s, p)} reinforces their mechs.`, p, 'expansion');
      tally(s, p, 'cardsTaken');
      return;
    }
    const row = a.deck === 'skill' ? s.market.skillRow : s.market.tacticRow;
    if (row[a.index] !== undefined && !canTakeCard(s, p, row[a.index])) fail('Your reserve is empty');
    // Peek: taking the oldest card lets you look at the top of the deck first. An empty deck is
    // refilled from its discards first, as for a draw (RULES.md ruling 5).
    if (rulesOf(s).cards?.peek && a.index === row.length - 1 && row.length === 3) {
      const deck = refill(s, a.deck);
      if (deck.length) {
        s.pending.unshift({ kind: 'peek', player: p, deck: a.deck, top: deck[0], store: a.store });
        return;
      }
    }
    consumeCardPick(s);
    takeOrStore(s, p, takeFromRow(s, a.deck, a.index), a.store);
  },
  peekChoice(s, a) {
    const head = headOf(s, 'peek', 'Not peeking');
    s.pending.shift();
    consumeCardPick(s);
    const id = a.takeTop ? (head.deck === 'skill' ? s.market.skillDeck : s.market.tacticDeck).shift()! : takeFromRow(s, head.deck, 2);
    takeOrStore(s, head.player, id, head.store);
  },
  /** Profiteering: a pick earned by a Conquer action (not by Infamy; RULES.md ruling 7) becomes 1 missile. */
  profiteer(s) {
    const head = headOf(s, 'takeCard', 'Not taking a card');
    if (!canProfiteer(s)) fail('No card for claiming to trade');
    head.conquer!--;
    s.players[head.player].missiles++;
    log(s, `${name(s, head.player)} takes an atomic instead of a card (${cardName('profiteering')}).`, head.player);
    consumeCardPick(s);
  },
  discardSkill(s, a) {
    const head = headOf(s, 'discardSkill', 'Not discarding');
    if (a.skill === head.cannotDiscard) fail(`Cannot discard ${card(a.skill).name}`);
    const pl = s.players[head.player];
    const i = pl.skills.findIndex((x) => x.id === a.skill);
    if (i < 0) fail('You do not have that skill');
    pl.skills.splice(i, 1);
    if (effectOf(a.skill) === 'ambitious') pl.ambitionTokens = 0;
    if (ruleOf(a.skill).storeTactics && pl.storedTactics?.length) {
      s.market.tacticDiscard.push(...pl.storedTactics);
      pl.storedTactics.length = 0;
    }
    s.market.skillDiscard.push(a.skill);
    s.pending.shift();
    log(s, `${pl.name} discards ${card(a.skill).name}.`, head.player, 'discard');
    if (pl.skills.length > skillLimit(s, head.player)) s.pending.unshift({ ...head, reason: 'limit' });
  },
  placeExpansion(s, a) {
    const head = headOf(s, 'placeExpansion', 'No expansion mech to place');
    const d = die(s, head.die);
    if (a.to) {
      if (!deployTargets(s, head.player).some((p) => same(p, a.to!))) fail('Place it on the perimeter of one of your objectives');
      d.loc = boardLoc(a.to);
      logTo(s, head.player, `${name(s, head.player)} places their new ${shipName(s, d)}`, a.to);
    } else {
      d.loc = { zone: 'scrapyard' };
      note(s, `${name(s, head.player)} keeps their new ${shipName(s, d)} in the salvage yard.`, head.player);
    }
    s.turn.seen[d.id] = [d.value];
    s.pending.shift();
  },
  showOfForce(s, a) {
    const head = headOf(s, 'showOfForce', `No ${cardName('show-of-force')} to resolve`);
    const d = die(s, a.die);
    if (d.loc.zone !== 'board') fail('Choose a mech on the map');
    s.pending.shift();
    log(s, `${name(s, head.player)} destroys ${name(s, d.owner)}'s ${shipName(s, d)}.`, head.player, 'shipDestroyed');
    destroyShip(s, d);
    // The victim loses no dominance: only the attack protocol or card text changes it (RULES.md ruling 10).
    if (d.owner === head.player) gainDominance(s, head.player, 1);
    else destroyedEnemyShip(s, head.player, 1, d.owner);
  },
  warpGate(s, a) {
    const head = headOf(s, 'warpGate', 'No Ice Tunnel to place');
    const cell = s.board.cells[a.cell.r]?.[a.cell.c];
    if (!cell || cell.kind !== 'space') fail('Gates go on spaces, not objectives');
    if (barrierAt(s, a.cell)) fail('Gates don’t go on barriers');
    if (head.placed.some((p) => same(p, a.cell))) fail('Choose a different space');
    head.placed.push({ r: a.cell.r, c: a.cell.c });
    if (head.placed.length === 2) {
      s.gates = head.placed;
      s.pending.shift();
      note(s, `${name(s, head.player)} opens a pair of ice tunnels.`, head.player);
    }
  },
  placeBarrier(s, a) {
    const head = headOf(s, 'placeBarrier', 'No barrier to place');
    const cell = s.board.cells[a.cell.r]?.[a.cell.c];
    if (!cell || cell.kind !== 'space') fail('Barriers go on spaces, not objectives');
    if (!canHoldBarrier(s, a.cell)) fail('Barriers go on empty spaces');
    head.placed.push({ r: a.cell.r, c: a.cell.c });
    addBarrier(s, a.cell, head.player);
    logTo(s, head.player, `${name(s, head.player)} places a barrier`, a.cell);
    if (head.placed.length === 2 || !barrierSpaces(s).length) s.pending.shift();
  },
  kineticShunt(s, a) {
    const head = headOf(s, 'kineticShunt', 'No Kinetic Shunt to resolve');
    const d = die(s, a.die);
    if (d.loc.zone !== 'board') fail('Choose a mech on the map');
    // Before the push: once there, the mech blocks the line it came along.
    const path = shuntPaths(s, d).find((p) => same(p.to, a.to));
    if (!path) fail('Not a valid push destination');
    s.pending.shift();
    d.loc = boardLoc(a.to);
    const targetName = head.player === d.owner ? `their ${shipName(s, d)}` : `${name(s, d.owner)}'s ${shipName(s, d)}`;
    logTo(s, head.player, `${name(s, head.player)} pushes ${targetName}${path.tunnel ? ' through an ice tunnel' : ''}`, a.to);
  },
  /** Patient: "When you take this Skill, you may take and store a Tactic." */
  patientTactic(s, a) {
    const head = headOf(s, 'patientTactic', 'Not storing a tactic');
    if (a.index === undefined) {
      s.pending.shift();
      log(s, `${name(s, head.player)} does not store a tactic.`, head.player);
      return;
    }
    const id = takeFromRow(s, 'tactic', a.index);
    s.pending.shift();
    takeOrStore(s, head.player, id, true);
  },
  changeOfHeart(s, a) {
    const head = headOf(s, 'changeOfHeart', 'Not choosing a skill');
    const i = s.market.skillDeck.indexOf(a.skill);
    if (i < 0) fail('That skill is not in the deck');
    s.market.skillDeck.splice(i, 1);
    s.market.skillDeck = shuffle(s, s.market.skillDeck);
    s.pending.shift();
    gainCard(s, head.player, a.skill);
  },
  unveilReroll(s, a) {
    const head = headOf(s, 'unveil', 'Not dropping');
    const d = die(s, a.die);
    if (d.owner !== head.player || d.loc.zone !== 'scrapyard') fail('Choose one of your mechs');
    if (head.rerolled.includes(d.id)) fail('Already re-rolled');
    head.rerolled.push(d.id);
    const was = shipName(s, d);
    roll(s, d);
    note(s, `${name(s, head.player)} re-rolls their ${was}: ${shipName(s, d)}.`, head.player);
  },
  unveilDeploy(s, a) {
    const head = headOf(s, 'unveil', 'Not dropping');
    const d = die(s, a.die);
    if (d.owner !== head.player || d.loc.zone !== 'scrapyard') fail('Choose a mech in your salvage yard');
    if (!deployTargets(s, head.player).some((p) => same(p, a.to))) fail('Not a drop space');
    d.loc = boardLoc(a.to);
    logTo(s, head.player, `${name(s, head.player)} drops ${aShip(s, d)}`, a.to);
  },
  unveilDone(s) {
    headOf(s, 'unveil', 'Not dropping');
    s.pending.shift();
  },
  /** Patient: ends the action phase by playing one stored Tactic; unused actions are forfeited (RULES.md ruling 4). */
  playStoredTactic(s, a) {
    const t = requireActionPhase(s, true);
    const p = t.player;
    if (!canPlayStoredTactic(s, p)) fail('Cannot play a stored tactic right now');
    const pl = s.players[p];
    const idx = pl.storedTactics?.indexOf(a.card) ?? -1;
    if (idx === -1) fail('Card not in stored tactics');
    pl.storedTactics!.splice(idx, 1);
    t.storedTacticPlayed = true;
    t.actionsLeft = 0;
    playTactic(s, p, a.card, `${pl.name} plays stored tactic ${card(a.card).name}.`);
  },
} satisfies Partial<Handlers>;
