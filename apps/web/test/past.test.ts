/** A game's past on this device: played, taken back, kept short, saved and rebuilt. */
import { describe, expect, it } from 'vitest';
import { createGame, isUndoable, apply, legalActions, type GameState } from '@regolith/engine';
import { playAiGame, players, quickStart } from '../../../packages/engine/test/helpers';
import { begin, play, restore, saved, takeBack, type Past } from '../src/game/past';
import { logPositions } from '../src/game/review';

const json = (p: Past) => JSON.stringify(p.positions);
/** Through JSON and back, as the save is. */
const stored = (p: Past) => JSON.parse(JSON.stringify(saved(p)));

/** A started game whose players are all people (who can undo). */
function people(): GameState {
  const s = structuredClone(quickStart(2, 1));
  for (const p of s.players) p.ai = false;
  return s;
}

describe('past', () => {
  it('rebuilds a whole game from its start and moves, kept to what the log can show', () => {
    // Long enough (274 entries) for the log to drop its oldest.
    const opts = { mode: 'regolith', players: 4, seed: 4, aiSeed: 4 } as const;
    const { actions } = playAiGame(opts);
    let past = begin(createGame({ players: players(4), seed: opts.seed, mode: opts.mode }));
    for (const a of actions) past = play(past, a);
    expect(past.positions.length).toBeLessThan(actions.length);
    const game = past.positions.at(-1)!;
    // Everything still in the log can be looked back at.
    const at = logPositions(past.positions, past.after);
    for (const e of game.log) expect(at.has(e.id)).toBe(true);
    const back = restore(game, stored(past));
    expect(json(back)).toBe(json(past));
    expect(back.after).toBe(0);
  });

  it('rebuilds an undo, and what is left to undo', () => {
    let past = begin(people());
    const s = past.positions[0];
    const undoable = (g: GameState) => legalActions(g).find((a) => a.type === 'move' && isUndoable(g, a, apply(g, a)))!;
    past = play(past, undoable(s));
    past = play(past, undoable(past.positions.at(-1)!));
    expect(past.undo).toHaveLength(2);
    past = takeBack(past)!;
    // The undo goes back to the very position it came from.
    expect(past.positions.at(-1)).toBe(past.positions.at(-3));
    const back = restore(past.positions.at(-1)!, stored(past));
    expect(json(back)).toBe(json(past));
    expect(back.undo).toHaveLength(1);
    expect(JSON.stringify(takeBack(back)!.positions.at(-1))).toBe(JSON.stringify(s));
  });

  it('picks the game up with no past when the saved one leads elsewhere', () => {
    const past = play(begin(people()), legalActions(people())[0]);
    const other = quickStart(2, 2);
    for (const from of [stored(past), null]) {
      const back = restore(other, from);
      expect(back.positions).toEqual([other]);
      expect(back.after).toBe(other.logCounter);
    }
  });
});
