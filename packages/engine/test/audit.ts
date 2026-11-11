/**
 * Card audit: AI games in which every card gets into play, checked at every step.
 *
 * Each game deals a slice of the mode's skills to the players at the start, so that across a small
 * set of games (modes × AI levels × maps × player counts) every skill is held. At every step:
 *
 * - the AI must find an action, the action must be one legalActions() offers, and the engine must
 *   accept it without crashing;
 * - the invariants must hold;
 * - at a card decision (a pick, Stolen Flag, Signal Jammer, Remodel, ...), every option offered must be
 *   accepted ("sound");
 * - card oracles: each card's effect, written from the card text and rulings, is compared with what
 *   the engine did when the card applied (e.g. Exploit's first destroy of a turn gives exactly 3
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
  reinforcementCard,
  takeOverTargets,
  isEmptySpace,
  legalActions,
  reserve,
  RuleError,
  RULESETS,
  same,
  mechsOnBoard,
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
  // tactics
  'power-grab',
  'contraband',
  'forced-march',
  'kill-zone',
  'sabotage',
  'orbital-cannon',
  'ice-tunnel',
  'headhunter',
  'invasion',
  'reinforcements',
  // skills
  'entrenched',
  'trophy-hunters',
  'fanatics',
  'exploit',
  'breakthrough',
  'signal-jammer',
  'stolen-flag',
  'remodel',
  'prospectors',
  'free-drop',
  'science-survey',
  'rush-research',
  'strategic-plan',
  'paired-cannons',
  'unstable-reactor',
  'engineering',
  'final-push',
  'arms-deal',
]);

/** Every card of a card mode. */
export function modeCards(mode: GameMode): CardDef[] {
  const cards = RULESETS[mode].cards;
  return cards ? [...cards.skills, ...cards.tactics, cards.reinforcement] : [];
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
  { mode: 'regolith', mapId: 'lagado-planitia', players: 2, levels: [1, 1], seed: 101, deal: 0, quick: true },
  { mode: 'regolith', mapId: 'swift-crater', players: 3, levels: [1, 1, 1], seed: 102, deal: 6, quick: true },
  { mode: 'regolith', mapId: 'laputa-regio', players: 4, levels: [1, 1, 1, 1], seed: 103, deal: 15, quick: true },
  { mode: 'regolith', mapId: 'hall-crater', players: 2, levels: [3, 2], seed: 104, deal: 27 },
  { mode: 'regolith', mapId: 'nili-fossae', players: 2, levels: [2, 1], seed: 105, deal: 28, quick: true },
  // Deep: level 4, other maps and other deals.
  { mode: 'regolith', mapId: 'valles-marineris', players: 2, levels: [4, 3], seed: 111, deal: 3, deep: true },
  { mode: 'regolith', mapId: 'stickney-crater', players: 3, levels: [1, 1, 1], seed: 112, deal: 12, deep: true },
  { mode: 'regolith', mapId: 'utopia-planitia', players: 4, levels: [1, 2, 1, 1], seed: 113, deal: 21, deep: true },
  { mode: 'regolith', mapId: 'chryse-planitia', players: 2, levels: [2, 2], seed: 114, deal: 30, deep: true },
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
  attackedOrClaimed: boolean;
  prospectorsUsed: boolean;
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

/** A mech destroyed by `w`: Power, research and action bonuses, Signal Jammer and Stolen Flag. */
function destroyed(c: Step, w: PlayerId, v: PlayerId, inCombat: boolean) {
  const { before, after } = c;
  const first = !c.turn.destroyers.has(w);
  c.turn.destroyers.add(w);

  // Winner: Power +1 (+1 more with Trophy Hunters on the first destroy).
  const trophyHunters = first ? held(before, w, 'trophy-hunters') : undefined;
  const power = Math.min(6, before.players[w].power + 1 + (trophyHunters ? 1 : 0));
  if (after.players[w].power !== power) {
    c.fail(trophyHunters, `winner's Power ${before.players[w].power} → ${after.players[w].power}, expected ${power}`);
  } else c.fire(trophyHunters);

  // Loser (combat only, RULES.md ruling 14): Power −1, unless Fanatics.
  if (inCombat) {
    const keep = held(before, v, 'fanatics');
    const was = before.players[v].power;
    const expected = keep ? was : Math.max(1, was - 1);
    if (after.players[v].power !== expected) c.fail(keep, `loser's Power ${was} → ${after.players[v].power}, expected ${expected}`);
    else if (keep && was > 1) c.fire(keep);
  }

  const ownTurn = w === before.turn.player;
  // The winner's own next turn may have started in the same step (Science Survey, Alien Artefact tiles, ...).
  if (turnChanged(c) && after.turn.player === w) return;
  // Research: Exploit +3 on the first destroy of a turn; Fanatics gains none.
  const plunder = first ? held(before, w, 'exploit') : undefined;
  const research = held(before, w, 'fanatics') ? before.players[w].research : Math.min(6, before.players[w].research + (plunder ? 3 : 0));
  if (after.players[w].research !== research)
    c.fail(plunder, `winner's research ${before.players[w].research} → ${after.players[w].research}, expected ${research}`);
  else c.fire(plunder);

  // Actions: Breakthrough +1 on the first destroy in your own action phase.
  if (!turnChanged(c)) {
    const breakthrough = first && ownTurn && before.turn.phase === 'actions' ? held(before, w, 'breakthrough') : undefined;
    const actions = before.turn.actionsLeft + (breakthrough ? 1 : 0);
    if (after.turn.actionsLeft !== actions)
      c.fail(breakthrough, `actions ${before.turn.actionsLeft} → ${after.turn.actionsLeft}, expected ${actions}`);
    else c.fire(breakthrough);
  }

  // Signal Jammer: on the first destroy, a choice of the victim's active skills to disable.
  const signalJammer = first ? held(before, w, 'signal-jammer') : undefined;
  if (signalJammer && before.players[v].skills.some((sk) => sk.active)) {
    if (!after.pending.some((p) => p.kind === 'signalJammer' && p.player === w && p.victim === v))
      c.fail(signalJammer, 'no Signal Jammer decision after the first destroy');
    else c.fire(signalJammer);
  }
  // Stolen Flag: whoever destroys its owner's mech may take it.
  if (before.players[v].skills.some((sk) => effectOf(sk.id) === 'stolen-flag')) {
    if (!after.pending.some((p) => p.kind === 'stolenFlag' && p.player === w && p.victim === v))
      c.fail('stolen-flag', 'no Stolen Flag decision after destroying its owner’s mech');
  }
}

/**
 * The card taken in this step (from the market, a deck, a setup draft or Headhunter), by whom,
 * and whether it is played at once: a Tactic or Reinforcements that is not stored (Strategic Plan).
 */
export function cardTaken(before: GameState, action: Action, after: GameState): { id: string; p: PlayerId; played: boolean } | undefined {
  const head = before.pending[0];
  if (action.type === 'takeCard' && head?.kind === 'takeCard') {
    if (action.deck === 'reinforcement') return { id: reinforcementCard(before).id, p: head.player, played: true };
    // Taking the oldest card may only open a peek at the deck; the card is taken by the peekChoice.
    if (after.pending[0]?.kind === 'peek' && after.pending[0].player === head.player) return;
    const row = action.deck === 'skill' ? before.market.skillRow : before.market.tacticRow;
    return { id: row[action.index], p: head.player, played: action.deck === 'tactic' && !action.store };
  }
  if (action.type === 'peekChoice' && head?.kind === 'peek') {
    const row = head.deck === 'skill' ? before.market.skillRow : before.market.tacticRow;
    return { id: action.takeTop ? head.top : row[2], p: head.player, played: head.deck === 'tactic' && !head.store };
  }
  if (action.type === 'strategicPlanTactic' && head?.kind === 'strategicPlanTactic' && action.index !== undefined) {
    return { id: before.market.tacticRow[action.index], p: head.player, played: false };
  }
  if ((action.type === 'draftSkill' && head?.kind === 'skillDraft') || (action.type === 'headhunter' && head?.kind === 'headhunter')) {
    return { id: action.skill, p: head.player, played: false };
  }
}

/** The Tactic or Reinforcements played in this step, and by whom. */
function playedCard(c: Step): { id: string; p: PlayerId } | undefined {
  if (c.action.type === 'strategicPlanPlay') return { id: c.action.card, p: c.before.turn.player };
  const taken = cardTaken(c.before, c.action, c.after);
  if (taken?.played) return taken;
}

const ORACLES: ((c: Step) => void)[] = [
  // Combat: the lower total wins, ties go to the attacker, Entrenched defenders win ties and destroy the attacker.
  (c) => {
    const head = c.before.pending[0];
    if (c.action.type !== 'resolveCombat' || head?.kind !== 'combat') return;
    const a = combatTotal(c.before, head, 'attacker').total;
    const d = combatTotal(c.before, head, 'defender').total;
    const entrenched = held(c.before, head.defender.player, 'entrenched');
    const attackerWins = a < d || (a === d && !entrenched);
    const zone = (id: string) => c.after.dice.find((x) => x.id === id)!.loc.zone;
    if (attackerWins) {
      if (zone(head.defender.die) !== 'salvageYard') return c.fail(undefined, `attacker won ${a} vs ${d} but the defender survived`);
      destroyed(c, head.attacker.player, head.defender.player, true);
    } else if (entrenched) {
      if (zone(head.attacker.die) !== 'salvageYard') return c.fail(entrenched, 'Entrenched defender won but the attacker survived');
      c.fire(entrenched);
      destroyed(c, head.defender.player, head.attacker.player, true);
    } else if (zone(head.attacker.die) === 'salvageYard' || zone(head.defender.die) === 'salvageYard') {
      c.fail(undefined, `attack repelled ${a} vs ${d} but a mech was destroyed`);
    }
  },

  // Orbital Cannon: the chosen mech is destroyed; an enemy mech counts as destroyed by the chooser.
  (c) => {
    const head = c.before.pending[0];
    if (c.action.type !== 'orbitalCannon' || head?.kind !== 'orbitalCannon') return;
    const owner = c.before.dice.find((d) => d.id === (c.action as { die: string }).die)!.owner;
    if (owner === head.player) {
      const expected = Math.min(6, c.before.players[owner].power + 1);
      if (c.after.players[owner].power !== expected) c.fail('orbital-cannon', 'destroying your own mech should give 1 Power');
    } else destroyed(c, head.player, owner, false);
  },

  // Remodel: a mech placed in its owner's salvage yard lets the owner choose its number.
  (c) => {
    for (const d of c.after.dice) {
      const was = c.before.dice.find((x) => x.id === d.id)!;
      if (was.loc.zone !== 'board' || d.loc.zone !== 'salvageYard') continue;
      const calc = held(c.before, d.owner, 'remodel');
      if (!calc) continue;
      if (!c.after.pending.some((p) => p.kind === 'engineering' && p.die === d.id))
        c.fail(calc, `no number choice for ${d.id} sent to the salvage yard`);
      else c.fire(calc);
    }
  },

  // Fanatics (CE): never gains research; Power only drops through an Take Over reset.
  (c) => {
    for (const p of c.after.players) {
      const r = held(c.before, p.id, 'fanatics');
      if (!r || !held(c.after, p.id, 'fanatics')) continue;
      const was = c.before.players[p.id];
      if (p.research > was.research) c.fail(r, `research rose ${was.research} → ${p.research}`);
      const takeOver = c.action.type === 'takeOver' && decider(c.before) === p.id;
      if (p.power < was.power && !takeOver) c.fail(r, `Power fell ${was.power} → ${p.power}`);
    }
  },

  // A new turn: actions (3, minus Sabotage; 2 on a Forced March turn), Free Drop, Science Survey, skills coming
  // into effect, Signal Jammer expiring.
  (c) => {
    if (!turnChanged(c)) return;
    const { before, after } = c;
    const p = after.turn.player;
    // A Sabotage played in this same step, by another player, already applies to this turn.
    const played = playedCard(c);
    const sabotage = played && played.p !== p ? ({ sabotage: 2 } as Record<string, number>)[effectOf(played.id)] : 0;
    const penalty = before.players[p].actionPenalty + (sabotage ?? 0);
    const base = after.turn.bonus ? 2 : Math.max(0, 3 - penalty);
    if (after.turn.actionsLeft !== base)
      c.fail(penalty ? 'sabotage' : undefined, `turn starts with ${after.turn.actionsLeft} actions, expected ${base}`);
    const freeDrop = held(after, p, 'free-drop');
    if (after.turn.freeDrops !== (freeDrop ? 1 : 0)) c.fail(freeDrop, `${after.turn.freeDrops} free drops at the start of the turn`);
    else c.fire(freeDrop);
    const scienceSurvey = held(after, p, 'science-survey');
    if (scienceSurvey && !held(after, p, 'fanatics') && before.turn.player !== p) {
      if (after.players[p].research < Math.min(6, before.players[p].research + 2))
        c.fail(scienceSurvey, 'no research at the start of the turn');
      else c.fire(scienceSurvey);
    }
    for (const o of after.players)
      for (const sk of o.skills) {
        if (!sk.active && sk.disabledUntil === undefined) c.fail(sk.id, `${o.name}'s skill not in effect after the turn changed`);
        if (!after.turn.bonus && sk.disabledUntil === p)
          c.fail('signal-jammer', `${o.name}'s skill still disabled at the start of the Signal Jammer player's turn`);
      }
  },

  // A Discovery at the end of the turn: at 6, or 4 with Rush Research; research resets to 1.
  (c) => {
    if (c.action.type !== 'endTurn' || turnChanged(c)) return;
    const p = c.before.turn.player;
    const rushResearch = held(c.before, p, 'rush-research');
    const was = c.before.players[p].research;
    const expected = was >= (rushResearch ? 4 : 6) ? 1 : was;
    if (c.after.players[p].research !== expected)
      c.fail(rushResearch, `research ${was} → ${c.after.players[p].research} at the end of the turn, expected ${expected}`);
    else if (rushResearch && was >= 4 && was < 6) c.fire(rushResearch);
  },

  // Tactics and Reinforcements: the effect of the card played.
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
      case 'power-grab':
        if (now.power !== Math.min(6, was.power + 2)) bad(`Power ${was.power} → ${now.power}, expected +2`);
        break;
      case 'contraband':
        if (now.atomics !== was.atomics + 2) bad(`atomics ${was.atomics} → ${now.atomics}, expected +2`);
        break;
      case 'forced-march':
        if (now.bonusTurns.length !== was.bonusTurns.length + 1 && !(turnChanged(c) && after.turn.player === p && after.turn.bonus))
          bad('no bonus turn queued');
        break;
      case 'kill-zone':
        if (now.killZone < 1) bad('Kill Zone not in effect');
        break;
      case 'sabotage':
        for (const o of after.players) {
          if (o.id === p) continue;
          const started = turnChanged(c) && after.turn.player === o.id;
          if (o.actionPenalty !== before.players[o.id].actionPenalty + 2 && !started) bad(`${o.name} not sabotaged`);
        }
        break;
      case 'orbital-cannon':
        if (mechsOnBoard(before).length && !pending('orbitalCannon')) bad('no mech to choose');
        break;
      case 'ice-tunnel':
        if (!pending('iceTunnel')) bad('no tunnels to place');
        break;
      case 'barricade':
        if (spaces(before.board).some((c) => isEmptySpace(before, c) && !before.tunnels?.some((g) => same(g, c))) && !pending('barricade'))
          bad('no barrier to place');
        break;
      case 'kinetic-shunt':
        if (mechsOnBoard(before).some((d) => shuntTargets(before, d).length > 0) && !pending('kineticShunt')) bad('no mech to shunt');
        break;
      case 'headhunter':
        if ((before.market.skillDeck.length || before.market.skillDiscard.length) && !pending('headhunter')) bad('no skill to choose');
        break;
      case 'invasion':
        if (!pending('invasion')) bad('no mechs to re-roll and drop');
        break;
      case 'reinforcements':
        if (reserve(before, p).length && !pending('reinforcements')) bad('no new mech to place');
        break;
    }
  },

  // Strategic Plan: a Tactic may be stored when taken, and a stored one played in the action phase.
  (c) => {
    const { before, action, after, legal } = c;
    if ((action.type === 'takeCard' && action.store) || (action.type === 'strategicPlanTactic' && action.index !== undefined)) {
      const p = decider(before);
      const strategicPlan = held(before, p, 'strategic-plan');
      const stored = (s: GameState) => s.players[p].storedTactics?.length ?? 0;
      if (stored(after) !== stored(before) + 1 && after.pending[0]?.kind !== 'peek') c.fail(strategicPlan, 'tactic not stored');
      else c.fire(strategicPlan);
    }
    const head = before.pending[0];
    if (legal && head?.kind === 'takeCard' && held(before, head.player, 'strategic-plan') && before.market.tacticRow.length) {
      if (!legal.some((a) => a.type === 'takeCard' && a.store)) c.fail('strategic-plan', 'no option to store a Tactic');
    }
    const p = before.turn.player;
    if (
      legal &&
      !head &&
      before.turn.phase === 'actions' &&
      held(before, p, 'strategic-plan') &&
      before.players[p].storedTactics?.length &&
      !before.turn.storedTacticPlayed
    ) {
      if (!legal.some((a) => a.type === 'strategicPlanPlay')) c.fail('strategic-plan', 'stored Tactic not playable');
    }
  },

  // Prospectors (CE): with no actions left, no Attack and no Claim this turn, one more Move or Research; then nothing more.
  (c) => {
    const { before, action, legal } = c;
    const p = before.turn.player;
    const prospectors = held(before, p, 'prospectors');
    if (!prospectors || !legal || before.pending.length || before.turn.phase !== 'actions') return;
    if (c.turn.prospectorsUsed) {
      if (legal.some((a) => a.type !== 'endTurn' && a.type !== 'strategicPlanPlay'))
        c.fail(prospectors, 'more actions offered after the Prospectors action');
      return;
    }
    if (before.turn.actionsLeft > 0 || c.turn.attackedOrClaimed || before.turn.storedTacticPlayed) return;
    const canResearch = before.players[p].research < 6 && !held(before, p, 'fanatics');
    if (canResearch && !legal.some((a) => a.type === 'research')) c.fail(prospectors, 'no Prospectors Research offered');
    if (action.type === 'research' || action.type === 'move' || action.type === 'carry') {
      c.turn.prospectorsUsed = true;
      c.fire(prospectors);
    }
  },

  // A new battle: Paired Cannons rolls two dice; an attack on an Unstable Reactor defender first asks it.
  (c) => {
    const head = c.after.pending[0];
    const prev = c.before.pending.find((x) => x.kind === 'combat');
    if (head?.kind === 'combat' && (!prev || prev.kind !== 'combat' || prev.id !== head.id)) {
      for (const side of [head.attacker, head.defender]) {
        const pairedCannons = held(c.before, side.player, 'paired-cannons');
        if (side.dice.length !== (pairedCannons ? 2 : 1)) c.fail(pairedCannons, `${side.dice.length} combat dice`);
        else c.fire(pairedCannons);
      }
    }
    if (c.action.type === 'attack') {
      const target = c.before.dice.find((d) => d.id === (c.action as { target: string }).target)!;
      const unstableReactor = held(c.before, target.owner, 'unstable-reactor');
      if (unstableReactor && c.after.pending[0]?.kind !== 'unstableReactor')
        c.fail(unstableReactor, 'attacked without the Unstable Reactor choice');
    }
    if (c.action.type === 'unstableReactor' && c.action.destroy) c.fire(held(c.before, decider(c.before), 'unstable-reactor'));
  },

  // Engineering: after a Refit, keep or change by 1.
  (c) => {
    const a = c.action;
    if (a.type === 'engineering') {
      const head = c.before.pending[0];
      if (head?.kind === 'engineering') c.fire(head.source === 'remodel' ? undefined : held(c.before, head.player, 'engineering'));
    }
    if (a.type !== 'refit') return;
    const p = c.before.turn.player;
    const engineering = held(c.before, p, 'engineering');
    if (engineering && !c.after.pending.some((x) => x.kind === 'engineering' && x.die === a.die))
      c.fail(engineering, 'no number choice after a Refit');
  },

  // Take Over: Power reaching the threshold (6, or 4 with Stolen Flag) earns an Take Over decision.
  (c) => {
    for (const p of c.after.players) {
      const stolenFlag = held(c.after, p.id, 'stolen-flag');
      const at = stolenFlag ? 4 : 6;
      const wasAt = held(c.before, p.id, 'stolen-flag') ? 4 : 6;
      const crossed = p.power >= at && (p.power > c.before.players[p.id].power || at < wasAt);
      if (!crossed || !takeOverTargets(c.after, p.id).length) continue;
      if (!c.after.pending.some((x) => x.kind === 'takeOver' && x.player === p.id))
        c.fail(stolenFlag, `${p.name} at ${p.power} Power without Take Over`);
      else if (stolenFlag && p.power < 6) c.fire(stolenFlag);
    }
  },

  // Final Push is discarded with its third token; Arms Deal offers an atomic for a claim pick.
  (c) => {
    for (const p of c.after.players) {
      const finalPush = held(c.after, p.id, 'final-push');
      if (finalPush && p.finalPushTokens >= 3) c.fail(finalPush, 'still held with three tokens');
    }
    if (c.action.type === 'finalPush') c.fire(held(c.before, c.before.turn.player, 'final-push'));
    const head = c.before.pending[0];
    if (c.legal && head?.kind === 'takeCard' && head.claim) {
      const armsDeal = held(c.before, head.player, 'arms-deal');
      if (armsDeal && !c.legal.some((a) => a.type === 'armsDeal')) c.fail(armsDeal, 'no atomic offered for a claim pick');
    }
    if (c.action.type === 'armsDeal') c.fire(held(c.before, decider(c.before), 'arms-deal'));
  },
];

/** Activated skills and mech-number choices without a dedicated oracle: each use counts as firing. */
const USES: Partial<Record<Action['type'], string[]>> = {
  standDown: ['stand-down'],
  fieldRefit: ['field-refit'],
  recycle: ['recycle'],
  advanceSkill: ['advance'],
  signalJammer: ['signal-jammer'],
};
/** Passive skills: the actions they can change count as firing (their effect is checked by the card scenarios). */
const PASSIVE: Partial<Record<Action['type'], string[]>> = {
  move: ['tune-up', 'sneak', 'double-time'],
  carry: ['tune-up', 'double-time'],
  drop: ['infiltration'],
  claim: ['hacking', 'science', 'martial-law'],
};

/** The other firings without an oracle: combat skills that changed a roll or total, Boost, Veteran Crew. */
function otherFirings(c: Step): (string | undefined)[] {
  const { before, action, after } = c;
  const who = actor(before);
  const head = before.pending[0];
  const out: (string | undefined)[] = [];
  for (const table of [USES, PASSIVE]) {
    const effects = table[action.type];
    if (effects) out.push(held(before, who, ...effects));
  }
  if (action.type === 'stolenFlag' && action.take && head?.kind === 'stolenFlag') {
    out.push(before.players[head.victim].skills.find((sk) => effectOf(sk.id) === 'stolen-flag')?.id);
  }
  if (action.type === 'resolveCombat' && head?.kind === 'combat') {
    for (const side of ['attacker', 'defender'] as const) {
      const { parts } = combatTotal(before, head, side);
      // A part labelled with the card's name: a set roll (Drill Sergeant) or a modifier (Armour Piercing, Close Protection). Paired Cannons has its oracle.
      for (const a of activeSkills(before, head[side].player)) if (parts.some((x) => x.label === card(a.card).name)) out.push(a.card);
    }
  }
  if (!before.turn.oncePerTurn.includes('boost') && after.turn.oncePerTurn.includes('boost')) out.push(held(before, who, 'boost'));
  for (const p of after.players) {
    if (p.skills.length > 3 && before.players[p.id].skills.length <= 3) out.push(held(after, p.id, 'veteran-crew'));
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
  let turn: TurnLog = { number: -1, attackedOrClaimed: false, prospectorsUsed: false, destroyers: new Set() };
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
      turn = { number: s.turn.number, attackedOrClaimed: false, prospectorsUsed: false, destroyers: new Set() };

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

    // Behemoth carries are only listed on request (they are many); the higher AI levels use them.
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
    if (legal && s.phase === 'play' && (head || legal.some((a) => a.type === 'strategicPlanPlay'))) {
      for (const option of legal) {
        if (!head && option.type !== 'strategicPlanPlay') continue;
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
        action.type === 'claim' ||
        (action.type === 'advanceSkill' && 'target' in action)
      ) {
        turn.attackedOrClaimed = true;
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
