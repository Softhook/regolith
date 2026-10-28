/**
 * Shared building blocks for the rule modules: errors, the log, dice, actions and the
 * dominance / research / cube bookkeeping that many rules touch.
 */
import { diagonals, orbitedPlanets, same } from './board';
import { cardName, card, cardWithEffect } from './data';
import type { SkillEffect } from './effects';
import { die } from './lookups';
import { actionsClosed, canCurious, canGainResearch, canUseAbility, infamyAt, usedThisTurn } from './queries';
import { d6 } from './rng';
import { rulesOf, shipOf } from './rules';
import { activeSkills, anySkill, hasSkill, stealableSkill } from './skillRules';
import {
  RuleError,
  type Action,
  type Cell,
  type Die,
  type Gains,
  type GameState,
  type LogEntry,
  type LogEvent,
  type OncePerTurn,
  type Pending,
  type PlayerId,
  type PlayerStats,
  type TurnState,
} from './types';

/** Every action is logged, so this is several turns' worth: enough to look back on (the web app's review). */
const LOG_LIMIT = 240;

// ---------------------------------------------------------------------------
// Handler types

export type ActionOf<K extends Action['type']> = Extract<Action, { type: K }>;
export type PendingOf<K extends Pending['kind']> = Extract<Pending, { kind: K }>;

/** One handler per action type. Handlers mutate the (already cloned) state or throw a RuleError. */
export type Handlers = { [K in Action['type']]: (s: GameState, a: ActionOf<K>) => void };

// ---------------------------------------------------------------------------
// Errors, log, names

export function fail(msg: string): never {
  throw new RuleError(msg);
}

export function log(s: GameState, text: string, player?: PlayerId, event?: LogEvent, planets?: number[]) {
  const entry: LogEntry = { id: ++s.logCounter, text, player };
  if (event) entry.event = event;
  if (planets) entry.planets = planets;
  s.log.push(entry);
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
}

/** Adds to one of a player's game stats: none in a game saved before they were kept, which would only count part of it. */
export function tally(s: GameState, p: PlayerId, stat: keyof PlayerStats, n = 1) {
  const st = s.players[p].stats;
  if (st) st[stat] += n;
}

/** Logs a routine action (a move, a reconfigure…): no event, only the planets it names. */
export function note(s: GameState, text: string, player: PlayerId, planets?: number[]) {
  log(s, text, player, undefined, planets);
}

/**
 * Puts a barrier of `owner`'s on `p`, for good (GameState.barriers); the caller checks canHoldBarrier. A new list,
 * never the old one changed: queries cache what they work out from it (queries.ts barrierMask).
 */
export function addBarrier(s: GameState, p: Cell, owner: PlayerId) {
  s.barriers = [...(s.barriers ?? []), { r: p.r, c: p.c, owner }];
}

/**
 * Logs a ship arriving at `to`: `text` is followed by where that is, beside (or diagonal to) a planet,
 * named as `planet N` so the UI can show its name. `after` goes at the end, before the full stop.
 */
export function logTo(s: GameState, player: PlayerId, text: string, to: Cell, after = '') {
  // Every planet it orbits, where orbits overlap; else every one it's diagonal to.
  const orbited = orbitedPlanets(s.board, to);
  const planets = orbited.length ? orbited : s.board.planets.filter((p) => diagonals(s.board, p).some((q) => same(q, to)));
  const names = planets.map((p) => `objective ${p.number}`).join(' and ');
  if (planets.length)
    note(
      s,
      `${text} next to ${names}${after}.`,
      player,
      planets.map((p) => p.id),
    );
  else note(s, `${text} into deep space${after}.`, player);
}

export const name = (s: GameState, p: PlayerId) => s.players[p].name;
/** A ship's name in this game's rules, with its value: "Sniper (5)". */
export const shipName = (s: GameState, d: Die) => `${shipOf(s, d.value).name} (${d.value})`;
/** A ship's name with its article: "a Sniper (5)". */
export const aShip = (s: GameState, d: Die) => `${/^[AEIOU]/.test(shipOf(s, d.value).name) ? 'an' : 'a'} ${shipName(s, d)}`;

/** The pending decision at the head of the queue, if it is of the given kind. */
export function headOf<K extends Pending['kind']>(s: GameState, kind: K, message: string): PendingOf<K> {
  const head = s.pending[0];
  if (head?.kind !== kind) fail(message);
  return head as PendingOf<K>;
}

// ---------------------------------------------------------------------------
// Dice

/** Rolls a die: a ship at setup or during play (a destroyed ship, an expansion ship…). */
export function roll(s: GameState, d: Die) {
  d.value = d6(s);
  d.rolls++;
}

/** Records the die's current number among those it has shown this turn (for Reconfigure). */
export function markSeen(s: GameState, d: Die) {
  const seen = (s.turn.seen[d.id] ??= []);
  if (!seen.includes(d.value)) seen.push(d.value);
}

/** Reconfigure: re-roll until the die shows a number it hasn't shown this turn (Community Edition). */
export function rerollNew(s: GameState, d: Die) {
  const seen = (s.turn.seen[d.id] ??= [d.value]);
  if (seen.length >= 6) fail('This mech has already shown every value this turn');
  do d.value = d6(s);
  while (seen.includes(d.value));
  seen.push(d.value);
  d.rolls++;
  // CE Clever: the result may be shifted by 1, even onto a number already shown this turn; no wrap
  // between 1 and 6, as with Flexible (RULES.md ruling 6).
  if (anySkill(s, d.owner, (r) => r.adjustReconfigure)) {
    const options = [d.value - 1, d.value, d.value + 1].filter((v) => v >= 1 && v <= 6);
    s.pending.unshift({ kind: 'clever', player: d.owner, die: d.id, options, source: 'clever' });
  }
}

/** A destroyed ship is re-rolled and goes to its owner's scrapyard. */
export function destroyShip(s: GameState, d: Die) {
  d.loc = { zone: 'scrapyard' };
  roll(s, d);
  s.turn.seen[d.id] = [d.value];
  if (s.phase === 'play' && anySkill(s, d.owner, (r) => r.chooseScrapyardNumber)) {
    if (!s.pending.some((p) => p.kind === 'clever' && p.die === d.id)) {
      s.pending.unshift({ kind: 'clever', player: d.owner, die: d.id, source: 'calculating' });
    }
  }
}

// ---------------------------------------------------------------------------
// Turn bookkeeping

export function emptyTurn(player: PlayerId, number: number): TurnState {
  return {
    player,
    number,
    phase: 'actions',
    actionsLeft: 0,
    freeDeploys: 0,
    moved: {},
    abilityUsed: {},
    seen: {},
    conquests: 0,
    attacked: false,
    destroyedBy: [],
    oncePerTurn: [],
    bonus: false,
    curiousUsed: false,
    storedTacticPlayed: false,
  };
}

/**
 * Phase-1 actions need a game in progress, no open decision, and the action phase. Once it is
 * closed (Curious, Patient: `actionsClosed`) only the actions that end the turn pass `closing`.
 */
export function requireActionPhase(s: GameState, closing = false): TurnState {
  if (s.phase !== 'play') fail('The game has not started');
  if (s.pending.length) fail('Resolve the current decision first');
  if (s.turn.phase !== 'actions') fail('Not in the action phase');
  if (!closing && actionsClosed(s.turn)) {
    fail(s.turn.curiousUsed ? `No actions allowed after using ${cardName('curious')}` : 'No actions allowed after playing a stored tactic');
  }
  return s.turn;
}

export function spend(s: GameState, n: number) {
  if (s.turn.actionsLeft < n) fail(n === 1 ? 'No actions left' : `Needs ${n} actions`);
  s.turn.actionsLeft -= n;
  s.turn.acted = true;
}

/** Pays for a Move or Research: an action, or once they are spent the CE Curious extra action. */
export function spendPeaceful(s: GameState) {
  const t = s.turn;
  if (t.actionsLeft > 0) spend(s, 1);
  else if (canCurious(s, t.player)) t.curiousUsed = true;
  else fail('No actions left');
}

export function ownShip(s: GameState, id: string, zone?: Die['loc']['zone']): Die {
  const d = die(s, id);
  if (d.owner !== s.turn.player) fail('Not your mech');
  if (zone && d.loc.zone !== zone)
    fail(`Mech is not ${zone === 'board' ? 'on the map' : zone === 'scrapyard' ? 'in the salvage yard' : `in the ${zone}`}`);
  return d;
}

export function markMoved(s: GameState, d: Die) {
  s.turn.moved[d.id] = (s.turn.moved[d.id] ?? 0) + 1;
}

/** Uses a die's ability for this turn, falling back to Cunning for a second use. */
export function markAbility(s: GameState, d: Die) {
  if (!canUseAbility(s, d)) fail('This mech already used its ability this turn');
  if (s.turn.abilityUsed[d.id]) s.turn.oncePerTurn.push('cunning');
  s.turn.abilityUsed[d.id] = true;
}

export function oncePerTurn(s: GameState, tag: OncePerTurn) {
  if (usedThisTurn(s, tag)) fail('Already used this turn');
  s.turn.oncePerTurn.push(tag);
}

export function requireSkill(s: GameState, p: PlayerId, skill: SkillEffect) {
  if (!hasSkill(s, p, skill)) fail(`Requires the ${cardWithEffect(skill)?.name ?? skill} card`);
}

// ---------------------------------------------------------------------------
// Tracks and cubes

export function gainResearch(s: GameState, p: PlayerId, n: number) {
  if (!canGainResearch(s, p)) return;
  s.players[p].research = Math.min(rulesOf(s).researchLimit, s.players[p].research + n);
}

/**
 * Dominance reaching 6 triggers Infamy: place a cube (a pending decision), then reset to 1. With
 * nowhere to place it, dominance stays at 6 (2013 rulebook p.9: reset "after you have placed your
 * cube").
 */
export function gainDominance(s: GameState, p: PlayerId, n: number) {
  const pl = s.players[p];
  pl.dominance = Math.min(6, pl.dominance + n);
  checkInfamy(s, p);
}

/**
 * Infamy: Dominance at the player's threshold (6, or 4 with Prideful) earns an Infamy cube. Checked
 * when Dominance rises and when Prideful takes effect (RULES.md ruling 3).
 */
export function checkInfamy(s: GameState, p: PlayerId) {
  const pl = s.players[p];
  if (pl.dominance < infamyAt(s, p) || s.pending.some((x) => x.kind === 'infamy' && x.player === p)) return;
  log(s, `${pl.name} achieves Infamy!`, p, 'infamy');
  s.pending.push({ kind: 'infamy', player: p });
}

/**
 * A skill that fires by itself (Hostile, Plundering…) says what it gave, on an entry naming
 * its card and its gains so the UI can show it. Nothing for a bonus of nothing (a track already full).
 */
function logBonus(s: GameState, p: PlayerId, id: string, b: Gains) {
  const gains: Gains = {};
  const parts: string[] = [];
  for (const [k, what] of [
    ['actions', 'action'],
    ['research', 'research'],
    ['dominance', 'dominance'],
  ] as const) {
    const n = b[k];
    if (!n) continue;
    gains[k] = n;
    parts.push(`${n} ${what}${k === 'actions' && n > 1 ? 's' : ''}`);
  }
  if (!parts.length) return;
  log(s, `${name(s, p)} gains ${parts.join(' and ')} (${card(id).name}).`, p);
  Object.assign(s.log[s.log.length - 1], { card: id, gains });
}

/**
 * `winner` destroyed an enemy ship, in combat or with a card such as Show of Force: gains `dominance`
 * plus the bonuses of their "destroy" skills (Hostile, Plundering, Ravenous; RULES.md ruling 10).
 */
export function destroyedEnemyShip(s: GameState, winner: PlayerId, dominance: number, victim?: PlayerId) {
  tally(s, winner, 'shipsDestroyed');
  if (victim !== undefined) tally(s, victim, 'shipsLost');
  const first = !s.turn.destroyedBy.includes(winner);
  if (first) s.turn.destroyedBy.push(winner);
  const ownTurn = winner === s.turn.player;
  const ctx = { first, ownTurn, ownActionPhase: ownTurn && s.turn.phase === 'actions' };
  const pl = s.players[winner];
  const limit = rulesOf(s).researchLimit;
  // Where the tracks will stand, for logging what each skill really adds: the stakes come first.
  let res = pl.research;
  let dom = Math.min(6, pl.dominance + dominance);
  let research = 0;
  for (const { rule, card: id } of activeSkills(s, winner)) {
    const b = rule.onDestroy?.(ctx) ?? {};
    const got: Gains = {
      actions: b.actions,
      research: b.research && canGainResearch(s, winner) ? Math.min(limit, res + b.research) - res : 0,
      dominance: b.dominance ? Math.min(6, dom + b.dominance) - dom : 0,
    };
    res += got.research!;
    dom += got.dominance!;
    research += b.research ?? 0;
    s.turn.actionsLeft += b.actions ?? 0;
    dominance += b.dominance ?? 0;
    logBonus(s, winner, id, got);
  }
  if (research) gainResearch(s, winner, research);
  gainDominance(s, winner, dominance);
  if (victim !== undefined && victim !== winner) {
    if (stealableSkill(s, victim) >= 0) s.pending.push({ kind: 'prideful', player: winner, victim });
    if (first && anySkill(s, winner, (r) => r.disableSkillOnDestroy) && s.players[victim].skills.some((sk) => sk.active)) {
      s.pending.push({ kind: 'ruthless', player: winner, victim });
    }
  }
}

export function loseDominance(s: GameState, p: PlayerId, n: number) {
  if (anySkill(s, p, (r) => r.keepDominance)) return;
  const pl = s.players[p];
  pl.dominance = Math.max(1, pl.dominance - n);
}

/**
 * After `owner`'s cube left planet `from` (over-conquest): if that was their last cube on their home planet,
 * the home moves to their first other planet.
 */
export function cubeLeft(s: GameState, owner: PlayerId, from: number) {
  const pl = s.players[owner];
  if (pl.home !== from || s.board.planets[from].cubes.includes(owner)) return;
  pl.home = s.board.planets.find((p) => p.cubes.includes(owner))?.id;
}

/** Places a cube; the game ends the moment a player places their last one. */
export function placeCube(s: GameState, p: PlayerId, planetId: number) {
  const planet = s.board.planets[planetId];
  planet.cubes.push(p);
  const pl = s.players[p];
  pl.cubesLeft--;
  if (s.phase === 'play' && p === s.turn.player) s.turn.conquests++;
  if (pl.cubesLeft <= 0) {
    s.phase = 'over';
    s.winner = p;
    s.pending = [];
    log(s, `${pl.name} places their final cube and wins!`, p, 'victory');
  }
}
