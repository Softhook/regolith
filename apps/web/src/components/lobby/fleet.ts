// The lobby backdrop's quiet game (Backdrop.tsx shows it): fleets around their home planets, a ship at a time
// re-rolling, moving space to space as in the game (along rows and columns, or hex to hex), or attacking an enemy in reach.

import { adjacent, distance, surrounding, type Board } from '@regolith/engine';
import { PLAYER_COLORS } from '../../theme';
import { pick } from '../../random';

/** How often a ship that acts re-rolls instead. */
const REROLL_CHANCE = 0.15;
/** How often a ship with an enemy in reach attacks it, rather than moving to an empty space. */
const ATTACK_CHANCE = 0.4;
/** How often a ship that moves heads for the nearest enemy, rather than anywhere. */
const HUNT_CHANCE = 0.5;

export type Spot = { r: number; c: number };

export interface Ship extends Spot {
  id: number;
  color: string;
  value: number;
  rolls: number;
  /** Its home planet, where it comes back after being destroyed. */
  home: Spot;
  /** Destroyed, waiting to come back. */
  down?: boolean;
  /** Where it's on its way to, while it moves. */
  to?: Spot;
  /** The easing for the space it's crossing: easing in at the start of a move and out at the end. */
  ease?: string;
}

/** A move: the spaces a ship crosses, in order, and the enemy it attacks at the end, if any. */
export interface Travel {
  id: number;
  path: Spot[];
  attack?: number;
}

export const roll = () => 1 + Math.floor(Math.random() * 6);
export const at = (s: Spot) => `${s.r},${s.c}`;
/** The open spaces touching a planet: the 8 around a square tile's, the 6 around a hex tile's. */
export const around = (board: Board, open: Set<string>, home: Spot) => surrounding(board, home).filter((s) => open.has(at(s)));
/** The spaces taken: where each ship (not destroyed) stands, and where each moving one is headed. */
export const taken = (ships: Ship[]) => new Set(ships.filter((s) => !s.down).flatMap((s) => (s.to ? [at(s), at(s.to)] : [at(s)])));

/**
 * The shortest routes from `from`, space to space over open spaces (around planets), up to `range`
 * spaces long, by the space each ends on. A route can end on a taken space (an enemy, to attack) but not
 * pass through one.
 */
function routes(board: Board, from: Spot, range: number, open: Set<string>, blocked: Set<string>): Map<string, Spot[]> {
  const paths = new Map<string, Spot[]>([[at(from), []]]);
  let frontier = [from];
  for (let d = 0; d < range; d++) {
    const next: Spot[] = [];
    for (const s of frontier)
      for (const n of adjacent(board, s)) {
        const k = at(n);
        if (!open.has(k) || paths.has(k)) continue;
        paths.set(k, [...paths.get(at(s))!, { r: n.r, c: n.c }]);
        if (!blocked.has(k)) next.push(n);
      }
    frontier = next;
  }
  paths.delete(at(from));
  return paths;
}

/** Spaces a ship can stand on: not off the map, not a planet. */
export function openSpaces(board: Board) {
  const out: Spot[] = [];
  board.cells.forEach((row, r) => row.forEach((x, c) => x.kind === 'space' && out.push({ r, c })));
  return out;
}

/** Each player's fleet around a starting planet (or any planet, on maps without marked starts). */
export function launch(board: Board, players: number, fleet: number): Ship[] {
  const starts = board.planets.filter((p) => p.start);
  const homes = (starts.length >= players ? starts : board.planets).slice(0, players);
  const ships: Ship[] = [];
  const open = new Set(openSpaces(board).map(at));
  homes.forEach((p, i) => {
    const home = { r: p.r, c: p.c };
    for (const s of around(board, open, home)
      .sort(() => Math.random() - 0.5)
      .slice(0, fleet)) {
      ships.push({ id: ships.length, color: PLAYER_COLORS[i], value: roll(), r: s.r, c: s.c, rolls: 0, home });
    }
  });
  return ships;
}

/**
 * One ship (not destroyed, moving or in a battle) acts: it re-rolls, attacks an enemy within reach, or moves
 * to a free space within reach, often the one nearest an enemy. Reach is the shortest route over the board's
 * spaces, as in the game. A move is returned as `travel`, for the ship to follow space by space.
 */
export function step(board: Board, ships: Ship[], open: Set<string>, busy: Set<number>): { ships: Ship[]; travel?: Travel } {
  const ready = ships.filter((s) => !s.down && !busy.has(s.id));
  if (!ready.length) return { ships };
  const ship = pick(ready);
  const update = (patch: Partial<Ship>) => ships.map((s) => (s.id === ship.id ? { ...s, ...patch } : s));
  if (Math.random() < REROLL_CHANCE) return { ships: update({ value: roll(), rolls: ship.rolls + 1 }) };
  const blocked = taken(ships);
  const paths = routes(board, ship, Math.min(ship.value, 3), open, blocked);
  const targets = ready.filter((s) => s.color !== ship.color && paths.has(at(s)));
  if (targets.length && Math.random() < ATTACK_CHANCE) {
    const target = pick(targets);
    const path = paths.get(at(target))!;
    return { ships: update({ to: path.at(-1) }), travel: { id: ship.id, path, attack: target.id } };
  }
  const reach = [...paths.values()].filter((path) => !blocked.has(at(path.at(-1)!)));
  if (!reach.length) return { ships };
  // Half the time it closes in on the nearest enemy, so the fleets meet; otherwise it wanders.
  const enemies = ships.filter((s) => !s.down && s.color !== ship.color);
  const gap = (path: Spot[]) => Math.min(...enemies.map((e) => distance(e, path.at(-1)!, board)));
  const path = enemies.length && Math.random() < HUNT_CHANCE ? reach.reduce((best, p) => (gap(p) < gap(best) ? p : best)) : pick(reach);
  return { ships: update({ to: path.at(-1) }), travel: { id: ship.id, path } };
}
