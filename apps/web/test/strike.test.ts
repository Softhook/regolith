/** How long a battle waits for its shot to cross the map. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CombatPending } from '@regolith/engine';
import { SHOT } from '../src/beats';
import { shotWait } from '../src/game/strike';

const side = { player: 0, die: 'd', ship: 5, dice: [3], missile: false };
const shot = { kind: 'combat', id: 1, attacker: side, defender: side, ranged: true } as unknown as CombatPending;
const motion = (reduced: boolean) => vi.stubGlobal('matchMedia', () => ({ matches: reduced }));

describe('shotWait', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('waits for the flight of a shot as it opens', () => {
    motion(false);
    expect(shotWait(shot)).toBe(SHOT.flight);
  });

  it('waits for nothing under reduced motion, where no missile flies', () => {
    motion(true);
    expect(shotWait(shot)).toBe(0);
  });

  it('waits for nothing once a missile has changed the battle, or in a battle hand to hand', () => {
    motion(false);
    expect(shotWait({ ...shot, attacker: { ...side, missile: true } })).toBe(0);
    expect(shotWait({ ...shot, ranged: undefined })).toBe(0);
  });
});
