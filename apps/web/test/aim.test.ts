/** Which cards an AI shows ahead of their effect on the map, so they're read and out of the way first (aim.ts). */
import { describe, expect, it } from 'vitest';
import { apply, cellOf, legalActions, type GameState } from '@regolith/engine';
import { quickStart } from '../../../packages/engine/test/helpers';
import { toRow } from '../../../packages/engine/test/audit';
import { heraldOf } from '../src/game/aim';

/** The player to move will take the Tactic `card` and play it at once. */
function taking(card: string): GameState {
  const s = quickStart(3, 1, 'regolith');
  toRow(s, 'tactic', card);
  s.pending.unshift({ kind: 'takeCard', player: s.turn.player, count: 1 });
  return s;
}
const play = { type: 'takeCard', deck: 'tactic', index: 0, store: false } as const;

describe('heraldOf', () => {
  it('shows a Tactic that hits the map as it is played ahead of the play (Invasion)', () => {
    const s = taking('r-invasion');
    const h = heraldOf(s, play)!;
    expect(h.fresh).toBe(true);
    expect(h.entry).toMatchObject({ card: 'r-invasion', event: 'cardPlayed', player: s.turn.player });
    expect(h.entry.id).toBeGreaterThan(s.log.at(-1)!.id);
    expect(h.cells.length).toBeGreaterThan(0);
  });

  it('says nothing ahead for a Tactic that waits for its target, then aims it at the target (Orbital Cannon)', () => {
    const s = taking('r-orbital-cannon');
    expect(heraldOf(s, play)).toBeUndefined();
    const t = apply(s, play);
    const shot = legalActions(t).find((a) => a.type === 'orbitalCannon')!;
    const h = heraldOf(t, shot)!;
    expect(h.fresh).toBe(false);
    expect(h.entry.card).toBe('r-orbital-cannon');
    const die = t.dice.find((d) => shot.type === 'orbitalCannon' && d.id === shot.die)!;
    expect(h.cells).toContainEqual(cellOf(die));
  });

  it('says nothing for a plain move, or an action the rules refuse', () => {
    const s = quickStart(3, 1, 'regolith');
    const move = legalActions(s).find((a) => a.type === 'move')!;
    expect(heraldOf(s, move)).toBeUndefined();
    expect(heraldOf(s, { type: 'orbitalCannon', die: 'nope' })).toBeUndefined();
  });
});
