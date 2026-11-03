import { cellOf, delta, drawing, type GameState } from '@regolith/engine';

/** Where each ship on the map is drawn, by id, in cell units from the map's top left (engine drawing). */
export type ShipSpots = Map<string, { r: number; c: number }>;

/**
 * Whether two drawn spots are next to each other on the map (diagonally too: an Interceptor's step), not a way
 * across a joined edge or through a Warp Gate. A hex's diagonal is √3 spaces away.
 */
export const touching = (p: { r: number; c: number }, q: { r: number; c: number }) => Math.hypot(p.r - q.r, p.c - q.c) < 1.8;

/** Where each ship on the map is drawn, in cell units (an attacker sits part-way into its target, unless it shot from where it is). */
export function shipSpots(game: GameState): ShipSpots {
  const head = game.pending[0];
  const combat = head?.kind === 'combat' ? head : null;
  const spots = new Map<string, { r: number; c: number }>();
  const { at: drawn } = drawing(game.board);
  for (const d of game.dice) {
    const at = cellOf(d);
    if (!at) continue;
    let { r, c } = at;
    if (combat && !combat.ranged && combat.attacker.die === d.id) {
      const d = delta(combat.from, combat.at);
      r += d.r * 0.42;
      c += d.c * 0.42;
    }
    spots.set(d.id, drawn({ r, c }));
  }
  return spots;
}
