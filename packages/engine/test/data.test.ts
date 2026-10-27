import { describe, expect, it } from 'vitest';
import { ALL_CARDS, IMPLEMENTED_EFFECTS, RULESETS, SKILL_RULES, type CardDef } from '../src';

const effect = (c: CardDef) => c.effect ?? c.id;

/** Cards left out of the decks because their effect is not written yet. Shrink this list. */
const NOT_YET_IMPLEMENTED: string[] = [];

describe('card data', () => {
  it('has unique card ids', () => {
    const ids = ALL_CARDS.map((c) => c.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('implements every effect except the known missing ones', () => {
    const missing = [...new Set(ALL_CARDS.map(effect).filter((e) => !IMPLEMENTED_EFFECTS.has(e)))].sort();
    expect(missing).toEqual([...NOT_YET_IMPLEMENTED].sort());
  });

  it('gives every skill at least one hook (an empty rule would do nothing)', () => {
    expect(
      Object.entries(SKILL_RULES)
        .filter(([, rule]) => !Object.keys(rule).length)
        .map(([e]) => e),
    ).toEqual([]);
  });

  it('uses every implemented effect (catches a misspelt effect name)', () => {
    const used = new Set(ALL_CARDS.map(effect));
    expect([...IMPLEMENTED_EFFECTS].filter((e) => !used.has(e))).toEqual([]);
  });

  it('has Regolith’s decks: 34 Skills, 1 of each; 11 Tactics, 2 of each; 6 Reinforcements', () => {
    const { skills, tactics, expansion } = RULESETS.regolith.cards!;
    expect(skills).toHaveLength(34);
    expect(skills.every((c) => c.count === 1)).toBe(true);
    expect(tactics).toHaveLength(11);
    expect(tactics.every((c) => c.count === 2)).toBe(true);
    expect([expansion.name, expansion.count]).toEqual(['Reinforcements', 6]);
    expect(RULESETS.basic.cards).toBeNull();
  });
});
