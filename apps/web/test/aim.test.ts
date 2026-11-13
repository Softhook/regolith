/** Which cards an AI shows ahead of their effect on the map, so they're read and out of the way first (aim.ts). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apply, cellOf, legalActions, type GameState } from '@regolith/engine';
import { quickStart } from '../../../packages/engine/test/helpers';
import { toRow } from '../../../packages/engine/test/audit';
import { aimCard, heraldOf, READ_MS, reportScreen, showCard, untilRead, WAIT_MS } from '../src/game/aim';

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

describe('showCard and aimCard', () => {
  it('say each card once a game, and afresh in another', () => {
    const s = taking('r-invasion');
    const h = heraldOf(s, play)!;
    expect(showCard(s, h)).toBe(true);
    expect(showCard(s, h)).toBe(false);
    expect(aimCard(s, h)).toBe(true);
    expect(aimCard(s, h)).toBe(false);
    const other = { ...s, seed: s.seed + 1 };
    expect(showCard(other, h)).toBe(true);
  });
});

describe('untilRead: the AI waits for its card to come up and be read', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    reportScreen(undefined, []);
  });
  afterEach(() => {
    reportScreen(undefined, []);
    vi.useRealTimers();
  });

  it('waits behind another card, then for the read', () => {
    const done = vi.fn();
    reportScreen(1, [1]);
    untilRead(7, done);
    reportScreen(1, [1, 7]); // queued behind the card up
    vi.advanceTimersByTime(3000);
    expect(done).not.toHaveBeenCalled();
    reportScreen(7, [7]);
    vi.advanceTimersByTime(READ_MS - 1);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('waits only what is left of the read for a card already up', () => {
    const done = vi.fn();
    reportScreen(7, [7]);
    vi.advanceTimersByTime(READ_MS - 200);
    untilRead(7, done);
    vi.advanceTimersByTime(200);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('a card shown ahead counts as coming before it is queued', () => {
    const done = vi.fn();
    untilRead(7, done);
    reportScreen(undefined, []);
    expect(done).not.toHaveBeenCalled();
    reportScreen(7, [7]);
    vi.advanceTimersByTime(READ_MS);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('stops waiting for a card that is gone, or never comes', () => {
    const gone = vi.fn();
    untilRead(7, gone);
    reportScreen(1, [1, 7]);
    reportScreen(undefined, []); // the screen went (a remount)
    expect(gone).toHaveBeenCalledTimes(1);

    const never = vi.fn();
    untilRead(8, never);
    vi.advanceTimersByTime(WAIT_MS);
    expect(never).toHaveBeenCalledTimes(1);
  });

  it('a battle in front holds it, and a cancel stops it', () => {
    const done = vi.fn();
    const stop = untilRead(7, done);
    reportScreen(undefined, [7]); // queued, but held
    vi.advanceTimersByTime(READ_MS * 2);
    expect(done).not.toHaveBeenCalled();
    stop();
    reportScreen(7, [7]);
    vi.advanceTimersByTime(WAIT_MS);
    expect(done).not.toHaveBeenCalled();
  });
});
