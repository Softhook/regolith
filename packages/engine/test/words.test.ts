/** The game speaks Regolith's words (docs/regolith/REGOLITH-WORLD.md, *The words*): mechs, objectives, claims. */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, MODES } from '../src';
import { playAiGame } from './helpers';

const ORIGINAL_WORDS =
  /\b(ships?|planets?|orbits?|conquer\w*|deploy\w*|missiles?|scrap\w*|flagships?|destroyers?|frigates?|battlestations?|interceptors?|dominance|reconfigur\w*|warp gates?|voids?|gates?|infam\w*|ambition\w*|fleets?)\b/i;

/** Every message the engine's source writes to the log or refuses an action with, its `${…}` parts left out. */
function sourceMessages(): string[] {
  const dir = new URL('../src/', import.meta.url);
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
  const call = /\b(?:log\(\s*\w+,|logTo\(\s*\w+,\s*[\w.]+,|fail\()\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*')/g;
  return files.flatMap((f) => [...readFileSync(new URL(f, dir), 'utf8').matchAll(call)].map((m) => m[1].replace(/\$\{[^}]*\}/g, '…')));
}

describe("Regolith's words", () => {
  it('describe both modes in the lobby', () => {
    for (const { summary } of MODES) expect(summary).not.toMatch(ORIGINAL_WORDS);
  });

  it('are on every card: its name, subtitle and text', () => {
    const original = ALL_CARDS.flatMap((c) => [c.name, c.subtitle, c.text].filter((t) => ORIGINAL_WORDS.test(t)));
    expect(original).toEqual([]);
  });

  it("are in every log line and refusal the engine's source writes, played or not", () => {
    const messages = sourceMessages();
    // Enough to know the scan finds them: about 30 log lines and 80 refusals.
    expect(messages.length).toBeGreaterThan(100);
    expect(messages.filter((t) => ORIGINAL_WORDS.test(t))).toEqual([]);
  });

  for (const { id: mode } of MODES)
    it(`are the only ones a ${mode} game's log uses`, () => {
      const { state } = playAiGame({ mode, players: 3, seed: 12, aiSeed: 12 * 7919 });
      const original = state.log.map((e) => e.text).filter((t) => ORIGINAL_WORDS.test(t));
      expect(original).toEqual([]);
    }, 60_000);
});
