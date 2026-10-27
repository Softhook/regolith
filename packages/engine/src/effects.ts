/**
 * The card effects the engine implements. A card's effect is its `effect` field in
 * data/regolith.yaml: the Community Edition card it started as, or its own. Cards whose effect is not
 * listed here are left out of the decks.
 *
 * Effect names are types, so `hasSkill(s, p, 'rightous')` is a compile error rather than a
 * skill that silently never applies.
 */

/** Skill effects. What each one does is its entry in SKILL_RULES (skillRules.ts). */
export const SKILL_EFFECTS = [
  'agile',
  'ambitious',
  'brilliant',
  'brutal',
  'clever',
  'composed',
  'devious',
  'ferocious',
  'flexible',
  'hostile',
  'industrious',
  'intelligent',
  'plundering',
  'precocious',
  'profiteering',
  'rational',
  'ravenous',
  'resourceful',
  'righteous',
  'steadfast',
  'stealthy',
  'strategic',
  'stubborn',
  'talented',
  'tyrannical',
  'cunning',
  'tactical',
  'calculating',
  'curious',
  'patient',
  'prideful',
  'ruthless',
  // Regolith's own Science, in Pioneering's place
  'science',
  'dangerous',
] as const;

export type SkillEffect = (typeof SKILL_EFFECTS)[number];

/** Tactic effects. Each has an entry in TACTIC_EFFECTS (cards.ts). */
export const TACTIC_EFFECT_IDS = [
  'aggression',
  'black-market',
  'change-of-heart',
  'momentum',
  'plan-ahead',
  'show-of-force',
  'unveil-the-fleet',
  'warp-gate',
  'expansion',
  'sabotage-double',
  'barrier',
  'kinetic-shunt',
] as const;

export type TacticEffect = (typeof TACTIC_EFFECT_IDS)[number];

/** Card effects the engine implements. Only cards with these effects are shuffled into the decks. */
export const IMPLEMENTED_EFFECTS: ReadonlySet<string> = new Set<string>([...SKILL_EFFECTS, ...TACTIC_EFFECT_IDS]);

/** Whether cards with an effect are shuffled into the decks (setup.ts). */
export const dealt = (effect: string) => IMPLEMENTED_EFFECTS.has(effect);
