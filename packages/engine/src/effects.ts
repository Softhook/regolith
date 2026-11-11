/**
 * The card effects the engine implements. A card's effect is its id without the `r-` (data.ts, `effectOf`);
 * `from` in data/regolith.yaml keeps the card it started as. Cards whose effect is not
 * listed here are left out of the decks.
 *
 * Effect names are types, so `hasSkill(s, p, 'fanatcs')` is a compile error rather than a
 * skill that silently never applies.
 */

/** Skill effects. What each one does is its entry in SKILL_RULES (skillRules.ts). */
export const SKILL_EFFECTS = [
  'tune-up',
  'final-push',
  'science-survey',
  'paired-cannons',
  'engineering',
  'stand-down',
  'sneak',
  'armour-piercing',
  'field-refit',
  'breakthrough',
  'free-drop',
  'hacking',
  'exploit',
  'rush-research',
  'arms-deal',
  'drill-sergeant',
  'trophy-hunters',
  'recycle',
  'fanatics',
  'double-time',
  'infiltration',
  'close-protection',
  'entrenched',
  'veteran-crew',
  'martial-law',
  'boost',
  'advance',
  'remodel',
  'prospectors',
  'strategic-plan',
  'stolen-flag',
  'signal-jammer',
  // Regolith's own Science, in Pioneering's place
  'science',
  'unstable-reactor',
] as const;

export type SkillEffect = (typeof SKILL_EFFECTS)[number];

/** Tactic effects. Each has an entry in TACTIC_EFFECTS (cards.ts). */
export const TACTIC_EFFECT_IDS = [
  'power-grab',
  'contraband',
  'headhunter',
  'forced-march',
  'kill-zone',
  'orbital-cannon',
  'invasion',
  'ice-tunnel',
  'reinforcements',
  'sabotage',
  'barricade',
  'kinetic-shunt',
] as const;

export type TacticEffect = (typeof TACTIC_EFFECT_IDS)[number];

/** Card effects the engine implements. Only cards with these effects are shuffled into the decks. */
export const IMPLEMENTED_EFFECTS: ReadonlySet<string> = new Set<string>([...SKILL_EFFECTS, ...TACTIC_EFFECT_IDS]);

/** Whether cards with an effect are shuffled into the decks (setup.ts). */
export const dealt = (effect: string) => IMPLEMENTED_EFFECTS.has(effect);
