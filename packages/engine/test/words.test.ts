/** The game speaks Regolith's words (docs/regolith/REGOLITH-WORLD.md, *The words*): mechs, objectives, claims. */
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, MODES } from '../src';
import { playAiGame } from './helpers';

const ORIGINAL_WORDS =
  /\b(ships?|planets?|orbits?|conquer\w*|deploy\w*|missiles?|scrap\w*|flagships?|destroyers?|frigates?|battlestations?|interceptors?|dominance|reconfigur\w*|warp gates?|voids?|gates?)\b/i;

describe("Regolith's words", () => {
  it('describe both modes in the lobby', () => {
    for (const { summary } of MODES) expect(summary).not.toMatch(ORIGINAL_WORDS);
  });

  it('are on every card: its name, subtitle and text', () => {
    const original = ALL_CARDS.flatMap((c) => [c.name, c.subtitle, c.text].filter((t) => ORIGINAL_WORDS.test(t)));
    expect(original).toEqual([]);
  });

  for (const { id: mode } of MODES)
    it(`are the only ones a ${mode} game's log uses`, () => {
      const { state } = playAiGame({ mode, players: 3, seed: 12, aiSeed: 12 * 7919 });
      const original = state.log.map((e) => e.text).filter((t) => ORIGINAL_WORDS.test(t));
      expect(original).toEqual([]);
    }, 60_000);
});
