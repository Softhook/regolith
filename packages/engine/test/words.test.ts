/** The game speaks Regolith's words (docs/regolith/REGOLITH-WORLD.md, *The words*): mechs, objectives, claims. */
import { describe, expect, it } from 'vitest';
import { MODES } from '../src';
import { playAiGame } from './helpers';

const ORIGINAL_WORDS =
  /\b(ships?|planets?|orbits?|orbital|conquer\w*|deploy\w*|missiles?|scrapyards?|dominance|reconfigur\w*|warp gates?)\b/i;

describe("Regolith's words", () => {
  it('describe both modes in the lobby', () => {
    for (const { summary } of MODES) expect(summary).not.toMatch(ORIGINAL_WORDS);
  });

  for (const { id: mode } of MODES)
    it(`are the only ones a ${mode} game's log uses`, () => {
      const { state } = playAiGame({ mode, players: 3, seed: 12, aiSeed: 12 * 7919 });
      const original = state.log.map((e) => e.text).filter((t) => ORIGINAL_WORDS.test(t));
      expect(original).toEqual([]);
    }, 60_000);
});
