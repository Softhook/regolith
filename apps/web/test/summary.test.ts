/** How an online game stands for the lobby, and when it has just become the player's move. */
import { describe, expect, it } from 'vitest';
import { actor, type GameState } from '@regolith/engine';
import type { Post, Replay, Seat } from '@regolith/online';
import { quickStart } from '../../../packages/engine/test/helpers';
import { summary, yourMoveSince } from '../src/online/summary';

const base = quickStart(2, 1);
const next = actor(base);
const other = 1 - next;

const post = (author: string, seat = 0): Post => ({
  id: `${author}-post`,
  author,
  at: 0,
  prev: 'x',
  body: { t: 'act', seat, action: { type: 'research' } },
});

const seat = (id: number, patch: Partial<Seat> = {}): Seat => ({ id, name: `P${id}`, ai: false, open: false, ask: 'own', ...patch });

function replay(state: GameState, opts: { seats?: Seat[]; last?: Post | null } = {}): Replay {
  return {
    config: { mode: state.mode, mapId: state.board.mapId },
    seats: opts.seats ?? [seat(0, { owner: 'a' }), seat(1, { owner: 'b' })],
    steps: [{ state, post: opts.last ?? null }],
    tip: opts.last?.id ?? 'genesis',
    combat: null,
  } as unknown as Replay;
}

describe('online game summary', () => {
  it('says whose move it is and the turn', () => {
    expect(summary(replay(base), [next])).toMatchObject({ myTurn: true, over: false, status: `Turn ${base.turn.number}` });
    expect(summary(replay(base), [other]).myTurn).toBe(false);
  });

  it('counts the seats still open to friends', () => {
    const seats = [seat(0, { owner: 'a' }), seat(1, { open: true })];
    expect(summary(replay(base, { seats }), [0]).status).toBe('Waiting for 1 player to join');
  });

  it('names the winner of a finished game, which is nobody’s move', () => {
    const over = { ...structuredClone(base), phase: 'over', winner: other } as GameState;
    expect(summary(replay(over), [next])).toMatchObject({ over: true, myTurn: false, status: `${over.players[other].name} won` });
  });
});

describe('yourMoveSince', () => {
  const theirs = post('b', other);

  it('names the change once it becomes the player’s move', () => {
    const r = replay(base, { last: theirs });
    expect(yourMoveSince(r, [next], 'a', false)).toEqual({ myTurn: true, turn: `${theirs.id}|` });
  });

  it('names nothing when it already was, or isn’t known to have not been', () => {
    const r = replay(base, { last: theirs });
    expect(yourMoveSince(r, [next], 'a', true).turn).toBeNull();
    expect(yourMoveSince(r, [next], 'a', null).turn).toBeNull();
  });

  it('names nothing when the player’s own post made it so (an undo)', () => {
    const r = replay(base, { last: post('a', next) });
    expect(yourMoveSince(r, [next], 'a', false)).toEqual({ myTurn: true, turn: null });
  });
});
