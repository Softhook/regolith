import {
  cellOf,
  effectOf,
  same,
  type Cell,
  type CombatOutcome,
  type CombatPending,
  type GameState,
  type LogEntry,
  type LogEvent,
  type PlayerId,
  type TacticEffect,
} from '@regolith/engine';
import { ARENA } from '../beats';
import { cardEffectsOf, type CardEffect } from '../components/board/CardEffects';
import { stagingOf } from '../components/board/staging';
import { sfx } from '../sound';
import { destroyedOf, shotOf, strikeOf } from './strike';
import { reducedMotion } from './useMediaQuery';
import { lost } from './view';

type Sound = keyof typeof sfx;

/** A card's own sound plays first, then its effects (ships, missiles) this much later, in ms. */
const CARD_THEN = 350;

/**
 * The sound for each logged event. Ships destroyed, moved or deployed, cubes placed or moved and tracks gained are
 * heard from the state instead (see `soundsFor`), and a battle's result as it shows (`battleSounds`).
 */
const EVENT_SOUNDS: Partial<Record<LogEvent, Sound>> = {
  victory: 'win',
  infamy: 'infamy',
  missile: 'atomic',
  cardTaken: 'card',
  expansion: 'launch',
  discard: 'discard',
  breakthrough: 'breakthrough',
};

/** Each Tactic or Gambit effect's signature sound; a card played that the log doesn't name sounds like a card. */
const TACTIC_SOUNDS: Record<TacticEffect, Sound> = {
  aggression: 'drums',
  'black-market': 'coins',
  'change-of-heart': 'shuffle',
  momentum: 'momentum',
  'plan-ahead': 'lockOn',
  'sabotage-double': 'powerDown',
  'show-of-force': 'alarm',
  'unveil-the-fleet': 'unveil',
  'warp-gate': 'portal',
  expansion: 'launch',
  barrier: 'barrier',
  'kinetic-shunt': 'shunt',
};

/** What a card's mark on the map sounds like, heard as seen (board/CardEffects). */
const EFFECT_SOUNDS: Partial<Record<CardEffect['kind'], Sound>> = { strike: 'lance', arc: 'arc', implode: 'implode', beam: 'portal' };

/**
 * What the step from `prev` to `next` sounds like. `fresh`: the log entries it added. `mine`: whom this screen
 * plays for, so a player who lost hears a lament rather than the winner's fanfare.
 */
export function soundsFor(
  prev: GameState,
  next: GameState,
  fresh: LogEntry[],
  mine: (p: PlayerId) => boolean = () => true,
): { first: Sound[]; then: Sound[]; destroyed: number; lands?: number } {
  const first = new Set<Sound>();
  const then = new Set<Sound>();
  const destroyed = destroyedOf(prev, next).length;

  // Cards played resolve first; their effects (ships, missiles) follow a beat later.
  for (const e of fresh) {
    if (e.event === 'cardPlayed') first.add(e.card ? TACTIC_SOUNDS[effectOf(e.card) as TacticEffect] : 'card');
  }
  for (const e of fresh) {
    const s = e.event && EVENT_SOUNDS[e.event];
    // A Take Over a kill earned follows the kill.
    if (s) (s === 'infamy' && destroyed ? then : first).add(s === 'win' && lost(next, mine) ? 'lose' : s);
  }
  // Cubes: placed, knocked off, or relocated (a planet's cubes changed with none placed or taken back). Heard as they drop.
  const placed = next.players.some((pl, i) => pl.cubesLeft < prev.players[i].cubesLeft);
  const displaced = next.players.some((pl, i) => pl.cubesLeft > prev.players[i].cubesLeft);
  if (placed) first.add('cube');
  if (displaced) first.add('displace');
  const cubesOf = (s: GameState) => s.board.planets.map((p) => [...p.cubes].sort().join()).join('|');
  if (!placed && !displaced && cubesOf(prev) !== cubesOf(next)) first.add('relocate');

  // With nothing to go first, the effects themselves do.
  const effects = first.size ? then : first;

  // Ships: flown, arrived, destroyed, swapped or renumbered.
  const before = new Map(prev.dice.map((d) => [d.id, d]));
  // A ship a card brings (Expansion, Nomadic) appears as its effect gets there (board/staging): heard landing
  // then, rather than flying or warping in on its own.
  const late = stagingOf(prev, next).late;
  let lands: number | undefined;
  const moved: { from: Cell; to: Cell }[] = [];
  for (const d of next.dice) {
    const p = before.get(d.id);
    if (!p) continue;
    const from = cellOf(p);
    const to = cellOf(d);
    const brought = late.get(d.id);
    if (to && brought !== undefined) lands = Math.max(lands ?? 0, brought);
    else if (from && to && !same(from, to)) moved.push({ from, to });
    else if (!from && to) effects.add('warpIn');
    // One that left the map was destroyed (counted above) or recalled.
    else if (from && !to) continue;
    else if (d.value !== p.value && d.rolls === p.rolls) effects.add('retune');
  }
  const swapped = moved.some((a) => moved.some((b) => a !== b && same(a.from, b.to) && same(a.to, b.from)));
  // Kinetic Shunt pushes a ship or a barrier: a shove, not an engine.
  if (prev.pending[0]?.kind === 'kineticShunt') effects.add('shunt');
  else if (swapped) effects.add('swap');
  else if (moved.length) effects.add('fly');
  // A gate closing is under the new pair's sound.
  for (const e of cardEffectsOf(prev, next)) {
    const s = EFFECT_SOUNDS[e.kind];
    if (s && (e.kind !== 'implode' || e.replaces)) effects.add(s);
  }
  if (destroyed) effects.add('explode');
  // A shot: the missile's launch, flight and impact (board/Shots).
  if (shotOf(prev, next)) effects.add('shot');

  if (next.players.some((pl, i) => pl.missiles > prev.players[i].missiles)) effects.add('missileLoad');
  if ((next.barriers?.length ?? 0) > (prev.barriers?.length ?? 0)) effects.add('barrier');

  // The tracks, unless a louder sound already says so: a breakthrough (research), Take Over or a kill (dominance).
  const rose = (k: 'research' | 'dominance') => next.players.some((pl, i) => pl[k] > prev.players[i][k]);
  if (rose('research') && !first.has('breakthrough')) effects.add('research');
  if (rose('dominance') && !destroyed && !first.has('infamy')) effects.add('dominance');

  // Once-per-turn skills used this step, or a skill disabled by Ruthless.
  const sameTurn = prev.turn.number === next.turn.number && prev.turn.player === next.turn.player;
  const disabledSkill = next.players.some((pl, i) =>
    pl.skills.some((s) => s.disabledUntil !== undefined && prev.players[i].skills.find((x) => x.id === s.id)?.disabledUntil === undefined),
  );
  // Resourceful's fold says so already.
  if (((sameTurn && next.turn.oncePerTurn.length > prev.turn.oncePerTurn.length) || disabledSkill) && !effects.has('implode'))
    effects.add('skill');

  return { first: [...first], then: [...then], destroyed, lands };
}

/**
 * What a battle's result sounds like as it shows: `now`, and on a shot's reaching its target (`hit`). A mech destroyed
 * is a triumph or a defeat for a screen playing for only one of the two sides; for anyone else, just the blow.
 */
export function battleSounds(combat: CombatPending, out: CombatOutcome, mine: (p: PlayerId) => boolean): { now: Sound[]; hit: Sound[] } {
  const loser = out.winner === 'attacker' ? 'defender' : 'attacker';
  const won = mine(combat[out.winner].player);
  const lost = mine(combat[loser].player);
  const blow: Sound[] = !out.destroyed ? [] : won === lost ? ['wreck'] : ['wreck', won ? 'triumph' : 'defeat'];
  if (combat.ranged) return { now: out.winner === 'defender' ? ['gunshot', 'whizz'] : ['gunshot'], hit: blow };
  return { now: out.destroyed ? blow : ['repel'], hit: [] };
}

/** Plays a battle's result, as it shows. */
export function playBattleResult(combat: CombatPending, out: CombatOutcome, mine: (p: PlayerId) => boolean) {
  const { now, hit } = battleSounds(combat, out, mine);
  now.forEach((s) => sfx[s]());
  if (hit.length) window.setTimeout(() => hit.forEach((s) => sfx[s]()), ARENA.hit);
}

/** Plays what the step from `prev` to `next` sounds like. */
export function playSounds(prev: GameState, next: GameState, fresh: LogEntry[], mine: (p: PlayerId) => boolean) {
  const { first, then, destroyed, lands } = soundsFor(prev, next, fresh, mine);
  // Under reduced motion the staging has none of a card's effects wait: ships go and come at once, heard so.
  const still = reducedMotion();
  // Ships a card's blow destroys (Show of Force, Dangerous) blow up as it lands, heard as seen (Explosions).
  const strike = still ? 0 : strikeOf(prev);
  const timed: Partial<Record<Sound, () => void>> = {
    explode: () => sfx.explode(destroyed, strike),
    lance: () => sfx.lance(strike),
    arc: () => sfx.arc(strike),
  };
  const play = (s: Sound) => (timed[s] ?? sfx[s])();
  first.forEach(play);
  // A ship a card brings lands as it appears, whatever the card's own sound.
  if (lands !== undefined) sfx.warpIn(still ? undefined : lands);
  if (then.length) window.setTimeout(() => then.forEach(play), CARD_THEN);
}
