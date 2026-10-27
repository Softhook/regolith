/**
 * Card audit: AI games in which every card gets into play, checked at every step.
 *
 * Each game deals a slice of the mode's skills to the players at the start, so that across a small
 * set of games (modes × AI levels × maps × player counts) every skill is held. At every step:
 *
 * - the AI must find an action, the action must be one legalActions() offers, and the engine must
 *   accept it without crashing;
 * - the invariants must hold;
 * - at a card decision (a pick, Prideful, Ruthless, Calculating, ...), every option offered must be
 *   accepted ("sound");
 * - card oracles: each card's effect, written from the card text and rulings, is compared with what
 *   the engine did when the card applied (e.g. Plundering's first destroy of a turn gives exactly 3
 *   research, a Sabotaged player's next turn has one action less).
 *
 * Any failure is an anomaly. Coverage counts, per card, the turns it was held and the times it
 * fired, so a card that is held but never does anything stands out. The AI self-play benchmark
 * (scripts/selfplay-cards.ts) plays its games through `auditGame` too, without dealing skills.
 */
import type { AiLevel } from '../../ai/src';
import {
  activeSkills,
  actor,
  apply,
  card,
  checkInvariants,
  combatTotal,
  createGame,
  effectOf,
  expansionCard,
  EXPANSION,
  infamyTargets,
  isEmptySpace,
  legalActions,
  relocationOptions,
  reserve,
  RuleError,
  RULESETS,
  same,
  shipsOnBoard,
  shuntTargets,
  spaces,
  type Action,
  type CardDef,
  type GameMode,
  type GameState,
  type PlayerId,
} from '../src';
import { keyOf } from './decisions';
import { aiAction, players, seededRandom } from './helpers';

export interface AuditGame {
  mode: GameMode;
  /** The map (default: the mode's default for the player count). */
  mapId?: string;
  players: number;
  /** AI level per player. */
  levels: AiLevel[];
  seed: number;
  /** Where in the mode's skill list this game's dealt skills start; none: skills are only drafted. */
  deal?: number;
}

/** One step of an audited game, for `auditGame`'s `onStep`. */
export interface AuditStep {
  before: GameState;
  action: Action;
  after: GameState;
  /** The cards that took effect in this step (coverage's `fired`, one entry per firing). */
  fired: string[];
}

export interface Anomaly {
  game: string;
  step: number;
  card?: string;
  message: string;
  /** The action taken and the game log leading up to it, to see what happened. */
  context: string[];
}

interface Coverage {
  /** Turns the card was held, active, by the player whose turn it was. */
  heldTurns: number;
  /** Times the card took effect (an oracle applied, or the card was used or played). */
  fired: number;
}

export interface AuditResult {
  name: string;
  anomalies: Anomaly[];
  coverage: Map<string, Coverage>;
  steps: number;
  finished: boolean;
}

/** Cards whose effect an oracle below checks (the others are only exercised). */
export const CHECKED_EFFECTS = new Set([
  // tactics and gambits
  'aggression',
  'black-market',
  'momentum',
  'plan-ahead',
  'sabotage',
  'sabotage-original',
  'sabotage-double',
  'show-of-force',
  'warp-gate',
  'change-of-heart',
  'unveil-the-fleet',
  'reorganization',
  'relocation',
  'expansion',
  // skills
  'stubborn',
  'ravenous',
  'ravenous-original',
  'righteous',
  'righteous-original',
  'plundering',
  'plundering-original',
  'hostile',
  'ruthless',
  'prideful',
  'calculating',
  'arrogant',
  'conformist',
  'curious',
  'curious-original',
  'industrious',
  'brilliant',
  'precocious',
  'patient',
  'brutal',
  'dangerous',
  'clever',
  'clever-original',
  'ambitious',
  'profiteering',
]);

/** Every card of a card mode. */
export function modeCards(mode: GameMode): CardDef[] {
  const cards = RULESETS[mode].cards;
  return cards ? [...cards.skills, ...cards.tactics, cards.expansion ?? EXPANSION] : [];
}

/** The skills a game deals from, in a fixed order. */
function dealable(mode: GameMode): string[] {
  return (RULESETS[mode].cards?.skills ?? []).map((c) => c.id);
}

/**
 * The audited games. Each mode's skills are dealt in turn (`deal` steps by three per player), so
 * every skill is held in some game of each mode. `quick` games also run in `npm test`; `deep` ones
 * only with `npm run audit:cards -- --deep`. Level 2+ AIs are slow with many players, so the
 * bigger games use level 1.
 */
export const AUDIT_GAMES: (AuditGame & { quick?: boolean; deep?: boolean })[] = [
  { mode: 'regolith', mapId: 'alpha-hex', players: 2, levels: [1, 1], seed: 101, deal: 0, quick: true },
  { mode: 'regolith', mapId: 'beta-hex', players: 3, levels: [1, 1, 1], seed: 102, deal: 6, quick: true },
  { mode: 'regolith', mapId: 'gamma-hex', players: 4, levels: [1, 1, 1, 1], seed: 103, deal: 15, quick: true },
  { mode: 'regolith', mapId: 'circular-logic-hex', players: 2, levels: [3, 2], seed: 104, deal: 27 },
  { mode: 'regolith', mapId: 'terra-minor-hex', players: 2, levels: [2, 1], seed: 105, deal: 28, quick: true },
  // Deep: level 4, other maps and other deals.
  { mode: 'regolith', mapId: 'valles-marineris', players: 2, levels: [4, 3], seed: 111, deal: 3, deep: true },
  { mode: 'regolith', mapId: 'stickney-crater', players: 3, levels: [1, 1, 1], seed: 112, deal: 12, deep: true },
  { mode: 'regolith', mapId: 'utopia-planitia', players: 4, levels: [1, 2, 1, 1], seed: 113, deal: 21, deep: true },
  { mode: 'regolith', mapId: 'twin-drift', players: 2, levels: [2, 2], seed: 114, deal: 30, deep: true },
];

export const gameName = (g: AuditGame) => `${g.mode} ${g.players}p ${g.mapId ?? 'default map'} L${g.levels.join('/')}`;

// ---------------------------------------------------------------------------
// Card bookkeeping that keeps every card accounted for

/** Brings card `id` to the front of its market row, swapping places with the card there. */
export function toRow(s: GameState, deck: 'skill' | 'tactic', id: string) {
  const m = s.market;
  const row = deck === 'skill' ? m.skillRow : m.tacticRow;
  const piles = deck === 'skill' ? [m.skillRow, m.skillDeck, m.skillDiscard] : [m.tacticRow, m.tacticDeck, m.tacticDiscard];
  for (const pile of piles) {
    const i = pile.indexOf(id);
    if (i >= 0) return void ([pile[i], row[0]] = [row[0], pile[i]]);
  }
  throw new Error(`${id} is not in the market`);
}

/** Gives player `p` exactly these skills (active), moving cards to and from the market. */
export function setSkills(s: GameState, p: number, ids: string[]) {
  s.market.skillDiscard.push(...s.players[p].skills.map((sk) => sk.id));
  s.players[p].skills = ids.map((id) => {
    toRow(s, 'skill', id);
    s.market.skillRow[0] = s.market.skillDeck.shift()!;
    return { id, active: true };
  });
}

/** Deals each player three consecutive skills of the mode's list, starting at `offset`. */
function deal(s: GameState, offset: number) {
  const list = dealable(s.mode);
  for (const p of s.players) setSkills(s, p.id, []);
  s.players.forEach((p, i) =>
    setSkills(
      s,
      p.id,
      [0, 1, 2].map((k) => list[(offset + 3 * i + k) % list.length]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Oracles

/** What the audit remembers about the current turn, independently of the engine's own bookkeeping. */
interface TurnLog {
  number: number;
  attackedOrConquered: boolean;
  curiousUsed: boolean;
  destroyers: Set<PlayerId>;
}

interface Step {
  before: GameState;
  action: Action;
  after: GameState;
  /** legalActions(before), or null in a combat (responses are offered to whoever may react). */
  legal: Action[] | null;
  turn: TurnLog;
  fail: (card: string | undefined, message: string) => void;
  fire: (card: string | undefined) => void;
}

/** The active skill `p` holds in `s` with one of these engine effects, if any. */
function held(s: GameState, p: PlayerId, ...effects: string[]): string | undefined {
  return s.players[p].skills.find((sk) => sk.active && effects.includes(effectOf(sk.id)))?.id;
}

/** The player deciding the open decision in `s` (combat has no single one). */
function decider(s: GameState): PlayerId {
  const head = s.pending[0];
  if (!head || head.kind === 'combat') return s.turn.player;
  return head.player;
}

const turnChanged = (c: Step) => c.after.turn.number !== c.before.turn.number;

/** A ship destroyed by `w`: Dominance, research and action bonuses, Ruthless and Prideful. */
function destroyed(c: Step, w: PlayerId, v: PlayerId, inCombat: boolean) {
  const { before, after } = c;
  const first = !c.turn.destroyers.has(w);
  c.turn.destroyers.add(w);
  const stakes = (p: PlayerId) => (inCombat && held(before, p, 'ravenous-original') ? 2 : 1);

  // Winner: Dominance +1 (+2 with Original Ravenous; +1 more with Ravenous on the first destroy).
  const ravenous = first ? held(before, w, 'ravenous') : undefined;
  const ravenousO = inCombat ? held(before, w, 'ravenous-original') : undefined;
  const dominance = Math.min(6, before.players[w].dominance + stakes(w) + (ravenous ? 1 : 0));
  if (after.players[w].dominance !== dominance) {
    c.fail(
      ravenous ?? ravenousO,
      `winner's Dominance ${before.players[w].dominance} → ${after.players[w].dominance}, expected ${dominance}`,
    );
  } else c.fire(ravenous ?? ravenousO);

  // Loser (combat only, RULE-SUGGESTIONS #26): Dominance −1 (−2 with Original Ravenous), unless Righteous.
  if (inCombat) {
    const keep = held(before, v, 'righteous', 'righteous-original');
    const was = before.players[v].dominance;
    const expected = keep ? was : Math.max(1, was - stakes(v));
    if (after.players[v].dominance !== expected)
      c.fail(keep, `loser's Dominance ${was} → ${after.players[v].dominance}, expected ${expected}`);
    else if (keep && was > 1) c.fire(keep);
  }

  const ownTurn = w === before.turn.player;
  // The winner's own next turn may have started in the same step (Brilliant, Void tiles, ...).
  if (turnChanged(c) && after.turn.player === w) return;
  // Research: Plundering +3 on the first destroy of a turn (Original: on your own turn); Righteous gains none.
  const plunder = first ? (held(before, w, 'plundering') ?? (ownTurn ? held(before, w, 'plundering-original') : undefined)) : undefined;
  const research = held(before, w, 'righteous') ? before.players[w].research : Math.min(6, before.players[w].research + (plunder ? 3 : 0));
  if (after.players[w].research !== research)
    c.fail(plunder, `winner's research ${before.players[w].research} → ${after.players[w].research}, expected ${research}`);
  else c.fire(plunder);

  // Actions: Hostile / Warlike +1 on the first destroy in your own action phase.
  if (!turnChanged(c)) {
    const hostile = first && ownTurn && before.turn.phase === 'actions' ? held(before, w, 'hostile') : undefined;
    const actions = before.turn.actionsLeft + (hostile ? 1 : 0);
    if (after.turn.actionsLeft !== actions)
      c.fail(hostile, `actions ${before.turn.actionsLeft} → ${after.turn.actionsLeft}, expected ${actions}`);
    else c.fire(hostile);
  }

  // Ruthless: on the first destroy, a choice of the victim's active skills to disable.
  const ruthless = first ? held(before, w, 'ruthless') : undefined;
  if (ruthless && before.players[v].skills.some((sk) => sk.active)) {
    if (!after.pending.some((p) => p.kind === 'ruthless' && p.player === w && p.victim === v))
      c.fail(ruthless, 'no Ruthless decision after the first destroy');
    else c.fire(ruthless);
  }
  // Prideful: whoever destroys its owner's ship may take it.
  if (before.players[v].skills.some((sk) => effectOf(sk.id) === 'prideful')) {
    if (!after.pending.some((p) => p.kind === 'prideful' && p.player === w && p.victim === v))
      c.fail('prideful', 'no Prideful decision after destroying its owner’s ship');
  }
}

/**
 * The card taken in this step (from the market, a deck, a setup draft or Change of Heart), by whom,
 * and whether it is played at once: a Tactic or Expansion that is not stored (Patient).
 */
export function cardTaken(before: GameState, action: Action, after: GameState): { id: string; p: PlayerId; played: boolean } | undefined {
  const head = before.pending[0];
  if (action.type === 'takeCard' && head?.kind === 'takeCard') {
    if (action.deck === 'expansion') return { id: expansionCard(before).id, p: head.player, played: true };
    // Taking the oldest card may only open a peek at the deck; the card is taken by the peekChoice.
    if (after.pending[0]?.kind === 'peek' && after.pending[0].player === head.player) return;
    const row = action.deck === 'skill' ? before.market.skillRow : before.market.tacticRow;
    return { id: row[action.index], p: head.player, played: action.deck === 'tactic' && !action.store };
  }
  if (action.type === 'peekChoice' && head?.kind === 'peek') {
    const row = head.deck === 'skill' ? before.market.skillRow : before.market.tacticRow;
    return { id: action.takeTop ? head.top : row[2], p: head.player, played: head.deck === 'tactic' && !head.store };
  }
  if (action.type === 'patientTactic' && head?.kind === 'patientTactic' && action.index !== undefined) {
    return { id: before.market.tacticRow[action.index], p: head.player, played: false };
  }
  if (
    (action.type === 'draftSkill' && head?.kind === 'skillDraft') ||
    (action.type === 'changeOfHeart' && head?.kind === 'changeOfHeart')
  ) {
    return { id: action.skill, p: head.player, played: false };
  }
}

/** The Tactic, Gambit or Expansion played in this step, and by whom. */
function playedCard(c: Step): { id: string; p: PlayerId } | undefined {
  if (c.action.type === 'playStoredTactic') return { id: c.action.card, p: c.before.turn.player };
  const taken = cardTaken(c.before, c.action, c.after);
  if (taken?.played) return taken;
}

const ORACLES: ((c: Step) => void)[] = [
  // Combat: the lower total wins, ties go to the attacker, Stubborn defenders win ties and destroy the attacker.
  (c) => {
    const head = c.before.pending[0];
    if (c.action.type !== 'resolveCombat' || head?.kind !== 'combat') return;
    const a = combatTotal(c.before, head, 'attacker').total;
    const d = combatTotal(c.before, head, 'defender').total;
    const stubborn = held(c.before, head.defender.player, 'stubborn');
    const attackerWins = a < d || (a === d && !stubborn);
    const zone = (id: string) => c.after.dice.find((x) => x.id === id)!.loc.zone;
    if (attackerWins) {
      if (zone(head.defender.die) !== 'scrapyard') return c.fail(undefined, `attacker won ${a} vs ${d} but the defender survived`);
      destroyed(c, head.attacker.player, head.defender.player, true);
    } else if (stubborn) {
      if (zone(head.attacker.die) !== 'scrapyard') return c.fail(stubborn, 'Stubborn defender won but the attacker survived');
      c.fire(stubborn);
      destroyed(c, head.defender.player, head.attacker.player, true);
    } else if (zone(head.attacker.die) === 'scrapyard' || zone(head.defender.die) === 'scrapyard') {
      c.fail(undefined, `attack repelled ${a} vs ${d} but a ship was destroyed`);
    }
  },

  // Show of Force: the chosen ship is destroyed; an enemy ship counts as destroyed by the chooser.
  (c) => {
    const head = c.before.pending[0];
    if (c.action.type !== 'showOfForce' || head?.kind !== 'showOfForce') return;
    const owner = c.before.dice.find((d) => d.id === (c.action as { die: string }).die)!.owner;
    if (owner === head.player) {
      const expected = Math.min(6, c.before.players[owner].dominance + 1);
      if (c.after.players[owner].dominance !== expected) c.fail('show-of-force', 'destroying your own ship should give 1 Dominance');
    } else destroyed(c, head.player, owner, false);
  },

  // Calculating: a ship placed in its owner's scrapyard lets the owner choose its number.
  (c) => {
    for (const d of c.after.dice) {
      const was = c.before.dice.find((x) => x.id === d.id)!;
      if (was.loc.zone !== 'board' || d.loc.zone !== 'scrapyard') continue;
      const calc = held(c.before, d.owner, 'calculating');
      if (!calc) continue;
      if (!c.after.pending.some((p) => p.kind === 'clever' && p.die === d.id))
        c.fail(calc, `no number choice for ${d.id} sent to the scrapyard`);
      else c.fire(calc);
    }
  },

  // Righteous (CE): never gains research; Dominance only drops through an Infamy reset.
  (c) => {
    for (const p of c.after.players) {
      const r = held(c.before, p.id, 'righteous');
      if (!r || !held(c.after, p.id, 'righteous')) continue;
      const was = c.before.players[p.id];
      if (p.research > was.research) c.fail(r, `research rose ${was.research} → ${p.research}`);
      const infamy = c.action.type === 'infamy' && decider(c.before) === p.id;
      if (p.dominance < was.dominance && !infamy) c.fail(r, `Dominance fell ${was.dominance} → ${p.dominance}`);
    }
  },

  // A new turn: actions (3, minus Sabotage; 2 on a Momentum turn; +1 each for Arrogant and Conformist),
  // Industrious and Original Curious, Brilliant, skills coming into effect, Ruthless expiring.
  (c) => {
    if (!turnChanged(c)) return;
    const { before, after } = c;
    const p = after.turn.player;
    // A Sabotage played in this same step, by another player, already applies to this turn.
    const played = playedCard(c);
    const sabotage = played && played.p !== p ? ({ sabotage: 1, 'sabotage-double': 2 } as Record<string, number>)[effectOf(played.id)] : 0;
    const penalty = before.players[p].actionPenalty + (sabotage ?? 0);
    const base = after.turn.bonus ? 2 : Math.max(0, 3 - penalty);
    const mine = shipsOnBoard(after, p);
    const arrogant =
      held(after, p, 'arrogant') && after.players.every((o) => o.id === p || shipsOnBoard(after, o.id).length < mine.length)
        ? held(after, p, 'arrogant')
        : undefined;
    const conformist =
      held(after, p, 'conformist') && new Set(mine.map((d) => d.value)).size < mine.length ? held(after, p, 'conformist') : undefined;
    const actions = base + (arrogant ? 1 : 0) + (conformist ? 1 : 0);
    const label = penalty ? 'sabotage' : (arrogant ?? conformist);
    if (after.turn.actionsLeft !== actions) c.fail(label, `turn starts with ${after.turn.actionsLeft} actions, expected ${actions}`);
    else {
      c.fire(arrogant);
      c.fire(conformist);
    }
    const industrious = held(after, p, 'industrious');
    if (after.turn.freeDeploys !== (industrious ? 1 : 0))
      c.fail(industrious, `${after.turn.freeDeploys} free deploys at the start of the turn`);
    else c.fire(industrious);
    const curious = held(after, p, 'curious-original');
    if (after.turn.freeMoves !== (curious ? 1 : 0)) c.fail(curious, `${after.turn.freeMoves} free moves at the start of the turn`);
    else c.fire(curious);
    const brilliant = held(after, p, 'brilliant');
    if (brilliant && !held(after, p, 'righteous') && before.turn.player !== p && !after.pending.some((x) => x.kind === 'brilliant')) {
      if (after.players[p].research < Math.min(6, before.players[p].research + 2))
        c.fail(brilliant, 'no research at the start of the turn');
      else c.fire(brilliant);
    }
    for (const o of after.players)
      for (const sk of o.skills) {
        if (!sk.active && sk.disabledUntil === undefined) c.fail(sk.id, `${o.name}'s skill not in effect after the turn changed`);
        if (!after.turn.bonus && sk.disabledUntil === p)
          c.fail('ruthless', `${o.name}'s skill still disabled at the start of the Ruthless player's turn`);
      }
  },

  // Research breakthrough at the end of the turn: at 6, or 4 with Precocious; research resets to 1.
  (c) => {
    if (c.action.type !== 'endTurn' || turnChanged(c)) return;
    const p = c.before.turn.player;
    const precocious = held(c.before, p, 'precocious');
    const was = c.before.players[p].research;
    const expected = was >= (precocious ? 4 : 6) ? 1 : was;
    if (c.after.players[p].research !== expected)
      c.fail(precocious, `research ${was} → ${c.after.players[p].research} at the end of the turn, expected ${expected}`);
    else if (precocious && was >= 4 && was < 6) c.fire(precocious);
  },

  // Tactics, Gambits and Expansions: the effect of the card played.
  (c) => {
    const { before, after } = c;
    const played = playedCard(c);
    if (!played) return;
    const { id, p } = played;
    c.fire(id);
    const was = before.players[p];
    const now = after.players[p];
    const pending = (kind: string) => after.pending.some((x) => x.kind === kind && x.kind !== 'combat' && x.player === p);
    const bad = (message: string) => c.fail(id, message);
    switch (effectOf(id)) {
      case 'aggression':
        if (now.dominance !== Math.min(6, was.dominance + 2)) bad(`Dominance ${was.dominance} → ${now.dominance}, expected +2`);
        break;
      case 'black-market':
        if (now.missiles !== was.missiles + 2) bad(`missiles ${was.missiles} → ${now.missiles}, expected +2`);
        break;
      case 'momentum':
        if (now.bonusTurns.length !== was.bonusTurns.length + 1 && !(turnChanged(c) && after.turn.player === p && after.turn.bonus))
          bad('no bonus turn queued');
        break;
      case 'plan-ahead':
        if (now.planAhead < 1) bad('Plan Ahead not in effect');
        break;
      case 'sabotage':
      case 'sabotage-double':
        for (const o of after.players) {
          if (o.id === p) continue;
          const started = turnChanged(c) && after.turn.player === o.id;
          const lost = effectOf(id) === 'sabotage' ? 1 : 2;
          if (o.actionPenalty !== before.players[o.id].actionPenalty + lost && !started) bad(`${o.name} not sabotaged`);
        }
        break;
      case 'sabotage-original':
        for (const o of before.players) {
          if (o.id !== p && o.skills.length && !after.pending.some((x) => x.kind === 'discardSkill' && x.player === o.id))
            bad(`${o.name} does not discard a skill`);
        }
        break;
      case 'show-of-force':
        if (shipsOnBoard(before).length && !pending('showOfForce')) bad('no ship to choose');
        break;
      case 'warp-gate':
        if (!pending('warpGate')) bad('no gates to place');
        break;
      case 'barrier':
        if (spaces(before.board).some((c) => isEmptySpace(before, c) && !before.gates?.some((g) => same(g, c))) && !pending('placeBarrier'))
          bad('no barrier to place');
        break;
      case 'kinetic-shunt':
        if (shipsOnBoard(before).some((d) => shuntTargets(before, d).length > 0) && !pending('kineticShunt')) bad('no mech to shunt');
        break;
      case 'change-of-heart':
        if ((before.market.skillDeck.length || before.market.skillDiscard.length) && !pending('changeOfHeart')) bad('no skill to choose');
        break;
      case 'unveil-the-fleet':
      case 'reorganization':
        if (!pending('unveil')) bad('no ships to re-roll and deploy');
        break;
      case 'relocation':
        if (relocationOptions(before, p).length && !pending('relocation')) bad('no cube to relocate');
        break;
      case 'expansion':
        if (reserve(before, p).length && !pending('placeExpansion')) bad('no new ship to place');
        break;
    }
  },

  // Patient: a Tactic may be stored when taken, and a stored one played in the action phase.
  (c) => {
    const { before, action, after, legal } = c;
    if ((action.type === 'takeCard' && action.store) || (action.type === 'patientTactic' && action.index !== undefined)) {
      const p = decider(before);
      const patient = held(before, p, 'patient');
      const stored = (s: GameState) => s.players[p].storedTactics?.length ?? 0;
      if (stored(after) !== stored(before) + 1 && after.pending[0]?.kind !== 'peek') c.fail(patient, 'tactic not stored');
      else c.fire(patient);
    }
    const head = before.pending[0];
    if (legal && head?.kind === 'takeCard' && held(before, head.player, 'patient') && before.market.tacticRow.length) {
      if (!legal.some((a) => a.type === 'takeCard' && a.store)) c.fail('patient', 'no option to store a Tactic');
    }
    const p = before.turn.player;
    if (
      legal &&
      !head &&
      before.turn.phase === 'actions' &&
      held(before, p, 'patient') &&
      before.players[p].storedTactics?.length &&
      !before.turn.storedTacticPlayed
    ) {
      if (!legal.some((a) => a.type === 'playStoredTactic')) c.fail('patient', 'stored Tactic not playable');
    }
  },

  // Curious (CE): with no actions left, no Attack and no Conquer this turn, one more Move or Research; then nothing more.
  (c) => {
    const { before, action, legal } = c;
    const p = before.turn.player;
    const curious = held(before, p, 'curious');
    if (!curious || !legal || before.pending.length || before.turn.phase !== 'actions') return;
    if (c.turn.curiousUsed) {
      if (legal.some((a) => a.type !== 'endTurn' && a.type !== 'playStoredTactic'))
        c.fail(curious, 'more actions offered after the Curious action');
      return;
    }
    if (before.turn.actionsLeft > 0 || c.turn.attackedOrConquered || before.turn.storedTacticPlayed) return;
    const canResearch = before.players[p].research < 6 && !held(before, p, 'righteous');
    if (canResearch && !legal.some((a) => a.type === 'research')) c.fail(curious, 'no Curious Research offered');
    if (action.type === 'research' || ((action.type === 'move' || action.type === 'carry') && before.turn.freeMoves === 0)) {
      c.turn.curiousUsed = true;
      c.fire(curious);
    }
  },

  // A new battle: Brutal rolls two dice; an attack on a Dangerous defender first asks it.
  (c) => {
    const head = c.after.pending[0];
    const prev = c.before.pending.find((x) => x.kind === 'combat');
    if (head?.kind === 'combat' && (!prev || prev.kind !== 'combat' || prev.id !== head.id)) {
      for (const side of [head.attacker, head.defender]) {
        const brutal = held(c.before, side.player, 'brutal');
        if (side.dice.length !== (brutal ? 2 : 1)) c.fail(brutal, `${side.dice.length} combat dice`);
        else c.fire(brutal);
      }
    }
    if (c.action.type === 'attack') {
      const target = c.before.dice.find((d) => d.id === (c.action as { target: string }).target)!;
      const dangerous = held(c.before, target.owner, 'dangerous');
      if (dangerous && c.after.pending[0]?.kind !== 'dangerous') c.fail(dangerous, 'attacked without the Dangerous choice');
    }
    if (c.action.type === 'dangerous' && c.action.destroy) c.fire(held(c.before, decider(c.before), 'dangerous'));
  },

  // Clever: CE after a Reconfigure, keep or change by 1; Original, choose any ship number rolled.
  (c) => {
    const a = c.action;
    if (a.type === 'clever') {
      const head = c.before.pending[0];
      if (head?.kind === 'clever')
        c.fire(head.source === 'calculating' ? undefined : held(c.before, head.player, 'clever', 'clever-original'));
    }
    if (a.type !== 'reconfigure' && a.type !== 'freeReconfigure') return;
    const p = c.before.turn.player;
    const clever = held(c.before, p, 'clever', 'clever-original');
    if (clever && !c.after.pending.some((x) => x.kind === 'clever' && x.die === a.die))
      c.fail(clever, 'no number choice after a Reconfigure');
  },

  // Infamy: Dominance reaching the threshold (6, or 4 with Prideful) earns an Infamy decision.
  (c) => {
    for (const p of c.after.players) {
      const prideful = held(c.after, p.id, 'prideful');
      const at = prideful ? 4 : 6;
      const wasAt = held(c.before, p.id, 'prideful') ? 4 : 6;
      const crossed = p.dominance >= at && (p.dominance > c.before.players[p.id].dominance || at < wasAt);
      if (!crossed || !infamyTargets(c.after, p.id).length) continue;
      if (!c.after.pending.some((x) => x.kind === 'infamy' && x.player === p.id))
        c.fail(prideful, `${p.name} at ${p.dominance} Dominance without Infamy`);
      else if (prideful && p.dominance < 6) c.fire(prideful);
    }
  },

  // Ambitious is discarded with its third token; Profiteering offers a missile for a conquest pick.
  (c) => {
    for (const p of c.after.players) {
      const ambitious = held(c.after, p.id, 'ambitious');
      if (ambitious && p.ambitionTokens >= 3) c.fail(ambitious, 'still held with three tokens');
    }
    if (c.action.type === 'ambitious') c.fire(held(c.before, c.before.turn.player, 'ambitious'));
    const head = c.before.pending[0];
    if (c.legal && head?.kind === 'takeCard' && head.conquer) {
      const profiteering = held(c.before, head.player, 'profiteering');
      if (profiteering && !c.legal.some((a) => a.type === 'profiteer')) c.fail(profiteering, 'no missile offered for a conquest pick');
    }
    if (c.action.type === 'profiteer') c.fire(held(c.before, decider(c.before), 'profiteering'));
  },
];

/** Activated skills and ship-number choices without a dedicated oracle: each use counts as firing. */
const USES: Partial<Record<Action['type'], string[]>> = {
  composed: ['composed'],
  flexible: ['flexible'],
  resourceful: ['resourceful'],
  tactical: ['tactical', 'tactical-original'],
  nomadic: ['nomadic'],
  tyrannical: ['tyrannical-original'],
  scrappy: ['scrappy'],
  ruthless: ['ruthless'],
};
/** Passive skills: the actions they can change count as firing (their effect is checked by the card scenarios). */
const PASSIVE: Partial<Record<Action['type'], string[]>> = {
  move: ['agile', 'devious', 'steadfast'],
  carry: ['agile', 'steadfast'],
  deploy: ['stealthy', 'eager'],
  conquer: ['ingenious', 'intelligent', 'pioneering', 'science', 'tyrannical'],
};
/** Re-roll skills: each re-roll counts as firing. */
const REROLL = ['cruel', 'relentless', 'scrappy'];

/** The other firings without an oracle: combat skills that changed a roll or total, Cunning, Talented. */
function otherFirings(c: Step): (string | undefined)[] {
  const { before, action, after } = c;
  const who = actor(before);
  const head = before.pending[0];
  const out: (string | undefined)[] = [];
  for (const table of [USES, PASSIVE]) {
    const effects = table[action.type];
    if (effects) out.push(held(before, who, ...effects));
  }
  if (action.type === 'prideful' && action.take && head?.kind === 'prideful') {
    out.push(before.players[head.victim].skills.find((sk) => effectOf(sk.id) === 'prideful')?.id);
  }
  if (action.type === 'reroll') out.push(held(before, action.by, ...REROLL));
  if (action.type === 'resolveCombat' && head?.kind === 'combat') {
    for (const side of ['attacker', 'defender'] as const) {
      const { parts } = combatTotal(before, head, side);
      // A part labelled with the card's name: a set roll (Rational) or a modifier (Ferocious, Strategic). Brutal has its oracle.
      for (const a of activeSkills(before, head[side].player)) if (parts.some((x) => x.label === card(a.card).name)) out.push(a.card);
    }
  }
  if (!before.turn.oncePerTurn.includes('cunning') && after.turn.oncePerTurn.includes('cunning')) out.push(held(before, who, 'cunning'));
  for (const p of after.players) {
    if (p.skills.length > 3 && before.players[p.id].skills.length <= 3) out.push(held(after, p.id, 'talented'));
  }
  return out;
}

// ---------------------------------------------------------------------------

/** Plays one audited game; `onStep` sees every step the engine accepted. */
export function auditGame(g: AuditGame, opts: { maxSteps?: number; onStep?: (step: AuditStep) => void } = {}): AuditResult {
  const { maxSteps = 3000, onStep } = opts;
  const name = gameName(g);
  const anomalies: Anomaly[] = [];
  const coverage = new Map(modeCards(g.mode).map((c) => [c.id, { heldTurns: 0, fired: 0 }]));
  let s = createGame({ players: players(g.players), seed: g.seed, mode: g.mode, mapId: g.mapId });
  const random = seededRandom(g.seed * 7919);
  let turn: TurnLog = { number: -1, attackedOrConquered: false, curiousUsed: false, destroyers: new Set() };
  let step = 0;
  let dealt = false;
  let action: Action | null = null;
  let after: GameState | undefined;
  const flag = (card: string | undefined, message: string) => {
    const log = (after ?? s).log.slice(-8).map((l) => `  ${l.text}`);
    anomalies.push({ game: name, step, card, message, context: [`action: ${action ? keyOf(action) : 'none'}`, ...log] });
  };

  for (; s.phase !== 'over' && step < maxSteps; step++) {
    if (s.phase === 'play' && !dealt) {
      if (g.deal !== undefined) deal(s, g.deal);
      dealt = true;
    }
    if (s.turn.number !== turn.number)
      turn = { number: s.turn.number, attackedOrConquered: false, curiousUsed: false, destroyers: new Set() };

    action = null;
    after = undefined;
    try {
      action = aiAction(s, g.levels, random);
    } catch (e) {
      flag(undefined, `AI crashed: ${(e as Error).message}`);
      break;
    }
    if (!action) {
      flag(undefined, `AI found no action (decision: ${s.pending[0]?.kind ?? 'none'})`);
      break;
    }

    // Flagship carries are only listed on request (they are many); the higher AI levels use them.
    const legal = s.pending[0]?.kind === 'combat' ? null : legalActions(s, { includeCarry: 'passenger' in action });
    const key = keyOf(action);
    if (legal && !legal.some((a) => keyOf(a) === key)) flag(undefined, `AI chose an action legalActions() doesn't offer: ${key}`);

    try {
      after = apply(s, action);
    } catch (e) {
      flag(
        undefined,
        e instanceof RuleError
          ? `engine refused ${keyOf(action)}: ${e.message}`
          : `engine crashed on ${keyOf(action)}: ${(e as Error).stack}`,
      );
      break;
    }

    for (const error of checkInvariants(after)) flag(undefined, `invariant: ${error} (after ${keyOf(action)})`);

    // Soundness at card decisions: every option offered is accepted.
    const head = s.pending[0];
    if (legal && s.phase === 'play' && (head || legal.some((a) => a.type === 'playStoredTactic'))) {
      for (const option of legal) {
        if (!head && option.type !== 'playStoredTactic') continue;
        try {
          apply(s, option);
        } catch (e) {
          flag(undefined, `offered at ${head?.kind ?? 'action phase'} but refused: ${keyOf(option)}: ${(e as Error).message}`);
        }
      }
    }

    const fired: string[] = [];
    if (s.phase === 'play' && after.phase === 'play') {
      const fire = (card: string | undefined) => {
        const entry = card ? coverage.get(card) : undefined;
        if (!entry) return;
        entry.fired++;
        fired.push(card!);
      };
      const c: Step = { before: s, action, after, legal, turn, fail: flag, fire };
      for (const oracle of ORACLES) oracle(c);
      otherFirings(c).forEach(fire);
      if (
        action.type === 'attack' ||
        action.type === 'freeAttack' ||
        action.type === 'conquer' ||
        (action.type === 'tactical' && 'target' in action)
      ) {
        turn.attackedOrConquered = true;
      }
      if (turnChanged(c)) {
        for (const sk of s.players[s.turn.player].skills) if (sk.active && coverage.has(sk.id)) coverage.get(sk.id)!.heldTurns++;
      }
    }
    onStep?.({ before: s, action, after, fired });
    s = after;
  }
  if (s.phase !== 'over') flag(undefined, `no winner after ${step} steps`);
  return { name, anomalies, coverage, steps: step, finished: s.phase === 'over' };
}

/** Cards held for some turns that never fired, and cards never held or played, over several games. */
export function coverageGaps(results: AuditResult[], mode: GameMode): { neverInPlay: string[]; heldNeverFired: string[] } {
  const total = new Map<string, Coverage>();
  for (const r of results) {
    if (r.name.split(' ')[0] !== mode) continue;
    for (const [id, c] of r.coverage) {
      const t = total.get(id) ?? { heldTurns: 0, fired: 0 };
      total.set(id, { heldTurns: t.heldTurns + c.heldTurns, fired: t.fired + c.fired });
    }
  }
  const all = [...total.entries()];
  return {
    neverInPlay: all.filter(([, c]) => !c.heldTurns && !c.fired).map(([id]) => id),
    heldNeverFired: all.filter(([, c]) => c.heldTurns && !c.fired).map(([id]) => id),
  };
}
