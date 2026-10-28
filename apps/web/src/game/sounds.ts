import { cellOf, effectOf, same, type Cell, type GameState, type LogEntry, type LogEvent, type PlayerId } from '@regolith/engine';
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
 * heard from the state instead (see `soundsFor`).
 */
const EVENT_SOUNDS: Partial<Record<LogEvent, Sound>> = {
  victory: 'win',
  infamy: 'infamy',
  repelled: 'repel',
  missile: 'missile',
  cardTaken: 'card',
  expansion: 'launch',
  discard: 'discard',
  breakthrough: 'breakthrough',
};

/** Each Tactic or Gambit effect's signature sound; any other card played sounds like a card. */
const TACTIC_SOUNDS: Record<string, Sound> = {
  aggression: 'drums',
  'black-market': 'coins',
  'change-of-heart': 'shuffle',
  momentum: 'momentum',
  'plan-ahead': 'lockOn',
  sabotage: 'powerDown',
  'sabotage-original': 'powerDown',
  'sabotage-double': 'powerDown',
  'show-of-force': 'alarm',
  'unveil-the-fleet': 'unveil',
  reorganization: 'unveil',
  'warp-gate': 'portal',
  expansion: 'launch',
};

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

  // Cards played resolve first; their effects (ships, missiles) follow a beat later.
  const played = fresh.filter((e) => e.event === 'cardPlayed');
  const ids = played.length ? next.market.tacticDiscard.slice(-played.length) : [];
  played.forEach((e, i) => {
    const id = e.card ?? ids[i];
    first.add((id && TACTIC_SOUNDS[effectOf(id)]) || 'card');
  });
  for (const e of fresh) {
    const s = e.event && EVENT_SOUNDS[e.event];
    if (s) first.add(s === 'win' && lost(next, mine) ? 'lose' : s);
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
  const destroyed = destroyedOf(prev, next).length;
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
  if (swapped) effects.add('swap');
  else if (moved.length) effects.add('fly');
  if (destroyed) effects.add('explode');
  // A shot: the missile's launch, flight and impact (board/Shots).
  if (shotOf(prev, next)) effects.add('missile');

  if (next.players.some((pl, i) => pl.missiles > prev.players[i].missiles)) effects.add('missileLoad');
  if (next.gates.length > prev.gates.length) effects.add('portal');

  // The tracks, unless a louder sound already says so: a breakthrough (research), Take Over or a kill (dominance).
  const rose = (k: 'research' | 'dominance') => next.players.some((pl, i) => pl[k] > prev.players[i][k]);
  if (rose('research') && !first.has('breakthrough')) effects.add('research');
  if (rose('dominance') && !destroyed && !first.has('infamy')) effects.add('dominance');

  // Once-per-turn skills used this step, or a skill disabled by Ruthless.
  const sameTurn = prev.turn.number === next.turn.number && prev.turn.player === next.turn.player;
  const disabledSkill = next.players.some((pl, i) =>
    pl.skills.some((s) => s.disabledUntil !== undefined && prev.players[i].skills.find((x) => x.id === s.id)?.disabledUntil === undefined),
  );
  if ((sameTurn && next.turn.oncePerTurn.length > prev.turn.oncePerTurn.length) || disabledSkill) effects.add('skill');

  return { first: [...first], then: [...then], destroyed, lands };
}

/** Plays what the step from `prev` to `next` sounds like. */
export function playSounds(prev: GameState, next: GameState, fresh: LogEntry[], mine: (p: PlayerId) => boolean) {
  const { first, then, destroyed, lands } = soundsFor(prev, next, fresh, mine);
  // Under reduced motion the staging has none of a card's effects wait: ships go and come at once, heard so.
  const still = reducedMotion();
  // Ships a card's blow destroys (Show of Force, Dangerous) blow up as it lands, heard as seen (Explosions).
  const strike = still ? 0 : strikeOf(prev);
  const explode = () => sfx.explode(destroyed);
  const play = (s: Sound) => (s !== 'explode' ? sfx[s]() : strike ? window.setTimeout(explode, strike) : explode());
  first.forEach(play);
  // A ship a card brings lands as it appears, whatever the card's own sound.
  if (lands !== undefined) sfx.warpIn(still ? undefined : lands);
  if (then.length) window.setTimeout(() => then.forEach(play), CARD_THEN);
}
