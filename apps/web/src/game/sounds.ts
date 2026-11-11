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
import { cardEffectsOf, type CardEffect } from './cardEffects';
import { sfx } from '../sound';
import { destroyedOf, shotOf, strikeOf } from './strike';
import { reducedMotion } from './useMediaQuery';
import { stagingOf } from './staging';
import { logSince } from './steps';
import { lost } from './view';

type Sound = keyof typeof sfx;

/** A card's own sound plays first, then its effects (mechs, atomics) this much later, in ms. */
const CARD_THEN = 350;

/**
 * The sound for each logged event. Mechs destroyed, moved or dropped, cubes placed or moved and tracks gained are
 * heard from the state instead (see `soundsFor`), and a battle's result as it shows (`battleSounds`).
 */
const EVENT_SOUNDS: Partial<Record<LogEvent, Sound>> = {
  victory: 'win',
  takeOver: 'takeOver',
  atomic: 'atomic',
  cardTaken: 'card',
  reinforcement: 'launch',
  discard: 'discard',
  discovery: 'discovery',
};

/** Each Tactic effect's signature sound; a card played that the log doesn't name sounds like a card. */
const TACTIC_SOUNDS: Record<TacticEffect, Sound> = {
  'power-grab': 'drums',
  contraband: 'coins',
  headhunter: 'shuffle',
  'forced-march': 'forcedMarch',
  'kill-zone': 'lockOn',
  sabotage: 'powerDown',
  'orbital-cannon': 'alarm',
  invasion: 'invasion',
  'ice-tunnel': 'portal',
  reinforcements: 'launch',
  barricade: 'barrier',
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

  // Cards played resolve first; their effects (mechs, atomics) follow a beat later.
  for (const e of fresh) {
    const s =
      e.event === 'cardPlayed' ? (e.card ? TACTIC_SOUNDS[effectOf(e.card) as TacticEffect] : 'card') : e.event && EVENT_SOUNDS[e.event];
    // A Take Over a kill earned follows the kill.
    if (s === 'takeOver' && destroyed) then.add(s);
    else if (s) first.add(s === 'win' && lost(next, mine) ? 'lose' : s);
  }
  // Cubes: placed, knocked off, or relocated (an objective's cubes changed with none placed or taken back). Heard as they drop.
  const placed = next.players.some((pl, i) => pl.cubesLeft < prev.players[i].cubesLeft);
  const displaced = next.players.some((pl, i) => pl.cubesLeft > prev.players[i].cubesLeft);
  if (placed) first.add('cube');
  if (displaced) first.add('displace');
  const cubesOf = (s: GameState) => s.board.objectives.map((p) => [...p.cubes].sort().join()).join('|');
  if (!placed && !displaced && cubesOf(prev) !== cubesOf(next)) first.add('relocate');

  // With nothing to go first, the effects themselves do.
  const effects = first.size ? then : first;

  // Mechs: flown, arrived, destroyed, swapped or renumbered.
  const before = new Map(prev.dice.map((d) => [d.id, d]));
  // A mech a card brings (Reinforcements, Nomadic) appears as its effect gets there (staging): heard landing
  // then, rather than flying or dropping in on its own.
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
    else if (!from && to) effects.add('arrive');
    // One that left the map was destroyed (counted above) or recalled.
    else if (from && !to) continue;
    else if (d.value !== p.value && d.rolls === p.rolls) effects.add('retune');
  }
  const swapped = moved.some((a) => moved.some((b) => a !== b && same(a.from, b.to) && same(a.to, b.from)));
  // Kinetic Shunt pushes a mech or a barrier: a shove, not an engine.
  if (prev.pending[0]?.kind === 'kineticShunt') effects.add('shunt');
  else if (swapped) effects.add('swap');
  else if (moved.length) effects.add('fly');
  // A tunnel closing is under the new pair's sound.
  for (const e of cardEffectsOf(prev, next)) {
    const s = EFFECT_SOUNDS[e.kind];
    if (s && (e.kind !== 'implode' || e.replaces)) effects.add(s);
  }
  if (destroyed) effects.add('explode');
  // A shot: the round's launch, flight and impact (board/Shots).
  if (shotOf(prev, next)) effects.add('shot');

  if (next.players.some((pl, i) => pl.atomics > prev.players[i].atomics)) effects.add('atomicLoad');
  if ((next.barriers?.length ?? 0) > (prev.barriers?.length ?? 0)) effects.add('barrier');

  // The tracks, unless a louder sound already says so: a Discovery (research), Take Over or a kill (power).
  const rose = (k: 'research' | 'power') => next.players.some((pl, i) => pl[k] > prev.players[i][k]);
  if (rose('research') && !first.has('discovery')) effects.add('research');
  if (rose('power') && !destroyed && !first.has('takeOver')) effects.add('power');

  // Once-per-turn skills used this step, or a skill disabled by Signal Jammer.
  const sameTurn = prev.turn.number === next.turn.number && prev.turn.player === next.turn.player;
  const disabledSkill = next.players.some((pl, i) =>
    pl.skills.some((s) => s.disabledUntil !== undefined && prev.players[i].skills.find((x) => x.id === s.id)?.disabledUntil === undefined),
  );
  // Recycle's fold says so already.
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
  const beaten = mine(combat[loser].player);
  const blow: Sound[] = !out.destroyed ? [] : won === beaten ? ['wreck'] : ['wreck', won ? 'triumph' : 'defeat'];
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
export function playSounds(prev: GameState, next: GameState, mine: (p: PlayerId) => boolean) {
  const { first, then, destroyed, lands } = soundsFor(prev, next, logSince(prev, next), mine);
  // Under reduced motion the staging has none of a card's effects wait: mechs go and come at once, heard so.
  const still = reducedMotion();
  // Mechs a card's blow destroys (Orbital Cannon, Unstable Reactor) blow up as it lands, heard as seen (Explosions).
  const strike = still ? 0 : strikeOf(prev);
  const timed: Partial<Record<Sound, () => void>> = {
    explode: () => sfx.explode(destroyed, strike),
    lance: () => sfx.lance(strike),
    arc: () => sfx.arc(strike),
    shot: () => sfx.shot(still ? 0 : undefined),
  };
  const play = (s: Sound) => (timed[s] ?? sfx[s])();
  first.forEach(play);
  // A mech a card brings lands as it appears, whatever the card's own sound.
  if (lands !== undefined) sfx.arrive(still ? undefined : lands);
  if (then.length) window.setTimeout(() => then.forEach(play), CARD_THEN);
}
