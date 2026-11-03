/** States share their log entries (copyState), which is safe only while no step changes an entry written before it. */
import { describe, expect, it } from 'vitest';
import { apply, legalActions, MODES } from '../src';
import { playAiGame, quickStart } from './helpers';

describe('log sharing', () => {
  it('a step keeps the entries before it, as the same objects', () => {
    const s = quickStart(2, 1, 'regolith');
    const next = apply(s, legalActions(s)[0]);
    expect(next.log).not.toBe(s.log);
    s.log.forEach((e, i) => expect(next.log[i]).toBe(e));
  });

  for (const { id: mode } of MODES)
    it(`no step of a ${mode} game writes to an entry from an earlier step`, () => {
      // Writing to a frozen object throws in a module, which fails the game.
      const { state } = playAiGame({ mode, players: 3, seed: 21, aiSeed: 77, after: (s) => s.log.forEach(Object.freeze) });
      expect(state.phase).toBe('over');
    });
});
