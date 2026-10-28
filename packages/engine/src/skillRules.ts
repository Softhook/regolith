/**
 * What every Skill card does, in one table.
 *
 * A skill is a set of hooks: plain values or pure functions that the rules read at fixed points
 * (movement, the conquer check, combat, start of turn, destroying a ship…). A rule asks
 * `skillRules(state, player)` for the player's active skills and combines their hooks; it never
 * names a skill. Skills that are an action of their own say so with `activated` and have a
 * handler in skillActions.ts.
 *
 * To add a skill: list its effect in SKILL_EFFECTS (effects.ts), then add its entry here (the
 * compiler asks for it). If no hook fits, add one to SkillRule and read it where the rule lives.
 */
import { linked } from './board';
import { effectOf } from './data';
import { SKILL_EFFECTS, type SkillEffect } from './effects';
import { dieAt } from './lookups';
import type { Action, Cell, CombatPending, CombatRole, Die, GameState, PlayerId } from './types';

export interface CombatPart {
  /** The roll (`set`: a missile or card set it, overriding the dice), the ship, or a card's modifier. */
  kind: 'roll' | 'ship' | 'modifier';
  label: string;
  value: number;
  set?: boolean;
}

interface ConquerContext {
  /** Sum of the player's ships in orbit. */
  sum: number;
  ships: Die[];
  dominance: number;
  research: number;
}

interface CombatContext {
  state: GameState;
  combat: CombatPending;
  side: CombatRole;
}

export interface TurnBonus {
  freeDeploys?: number;
  research?: number;
}

interface DestroyContext {
  /** The first enemy ship this player destroyed this turn. */
  first: boolean;
  /** It is this player's turn, in the action phase. */
  ownActionPhase: boolean;
}

interface DestroyBonus {
  research?: number;
  actions?: number;
  dominance?: number;
}

export interface SkillRule {
  /** Extra movement for every ship. */
  movement?: number;
  /** Ships may move more than once per turn. */
  moveRepeatedly?: boolean;
  /** One ship ability may be used a second time each turn. */
  abilityTwice?: boolean;
  /** How many skills the player may hold. */
  skillLimit?: number;
  /** Research needed for a breakthrough. */
  breakthroughAt?: number;
  /** Dominance needed for a Take Over cube (Prideful). */
  infamyAt?: number;
  /** When a ship is placed in your scrapyard, choose its number instead (Calculating). */
  chooseScrapyardNumber?: boolean;
  /** One more Move or Research once the actions are spent, on a turn without Attack or Conquer. */
  peacefulExtraAction?: boolean;
  /** Tactics may be stored when taken and one played at the end of the turn; taking the card stores one. */
  storeTactics?: boolean;
  /** On the first destroy of a turn, one of the victim's active skills is disabled. */
  disableSkillOnDestroy?: boolean;
  /** Whoever destroys a ship of the holder may take this card, even while it is not in effect. */
  stolenOnDestroy?: boolean;
  /** After reconfiguring, the player may raise or lower the ship's number by 1. */
  adjustReconfigure?: boolean;
  /** Normal moves may pass through enemy ships; those spaces cost no movement. */
  moveThroughEnemies?: boolean;
  /** A card pick earned by a Conquer action may be taken as 1 missile instead. */
  missileForConquest?: boolean;
  /** Ships may also deploy to any empty space with no ship next to it. */
  deployIsolated?: boolean;
  /** The player never gains research. */
  noResearch?: boolean;
  /** The player never loses dominance. */
  keepDominance?: boolean;
  conquer?: {
    /** The total may miss the target by this much. */
    tolerance?: number;
    /** Other totals the player may use instead of the plain sum. */
    sums?: (ctx: ConquerContext) => number[];
    /** Research above 1 may be spent to move the total up or down by that much. */
    spendResearch?: boolean;
  };
  combat?: {
    /** Roll this many dice and keep the lowest. */
    dice?: number;
    /** The combat roll is always this value. */
    roll?: number;
    /** A modifier added to the total, if it applies. */
    modifier?: (ctx: CombatContext) => number;
    /** When defending, ties go to the player, and winning destroys the attacker. */
    stubborn?: boolean;
    /** When defending, before the dice are rolled, the player may destroy both ships. */
    destroyBoth?: boolean;
  };
  /** Bonuses at the start of each of the player's turns. */
  startOfTurn?: (state: GameState, player: PlayerId) => TurnBonus;
  /** Bonuses when the player destroys an enemy ship in combat (on top of the dominance stakes). */
  onDestroy?: (ctx: DestroyContext) => DestroyBonus;
  /** Used with an action of its own (handler in skillActions.ts). */
  activated?: Action['type'];
}

/** Whether a friendly ship (other than `self`) is next to any of `spaces`. */
function supported(state: GameState, player: PlayerId, self: string, spaces: Cell[]): boolean {
  return spaces.some((sp) =>
    linked(state, sp).some((q) => {
      const d = dieAt(state, q);
      return !!d && d.owner === player && d.id !== self;
    }),
  );
}

export const SKILL_RULES: Record<SkillEffect, SkillRule> = {
  // shared / community skills
  agile: { movement: 1 },
  ambitious: { activated: 'ambitious' },
  brilliant: { startOfTurn: () => ({ research: 2 }) },
  brutal: { combat: { dice: 2 } },
  clever: { adjustReconfigure: true },
  composed: { activated: 'composed' },
  devious: { moveThroughEnemies: true },
  ferocious: { combat: { modifier: () => -1 } },
  flexible: { activated: 'flexible' },
  hostile: { onDestroy: (c) => (c.first && c.ownActionPhase ? { actions: 1 } : {}) },
  industrious: { startOfTurn: () => ({ freeDeploys: 1 }) },
  intelligent: { conquer: { tolerance: 1 } },
  plundering: { onDestroy: (c) => (c.first ? { research: 3 } : {}) },
  precocious: { breakthroughAt: 4 },
  profiteering: { missileForConquest: true },
  rational: { combat: { roll: 3 } },
  ravenous: { onDestroy: (c) => (c.first ? { dominance: 1 } : {}) },
  resourceful: { activated: 'resourceful' },
  righteous: { noResearch: true, keepDominance: true },
  steadfast: { moveRepeatedly: true },
  stealthy: { deployIsolated: true },
  strategic: {
    combat: {
      // Supported by a friendly ship next to the battle (for the attacker: next to either space).
      modifier: ({ state, combat, side }) => {
        const s = combat[side];
        const spaces = side === 'attacker' ? [combat.from, combat.at] : [combat.at];
        return supported(state, s.player, s.die, spaces) ? -2 : 0;
      },
    },
  },
  stubborn: { combat: { stubborn: true } },
  talented: { skillLimit: 5 },
  tyrannical: { conquer: { sums: (c) => [c.sum + c.dominance] } },
  cunning: { abilityTwice: true },
  tactical: { activated: 'tactical' },
  calculating: { chooseScrapyardNumber: true },
  curious: { peacefulExtraAction: true },
  patient: { storeTactics: true },
  prideful: { infamyAt: 4, stolenOnDestroy: true },
  ruthless: { disableSkillOnDestroy: true },
  // Regolith's own Science, in Pioneering's place
  science: { conquer: { spendResearch: true } },
  dangerous: { combat: { destroyBoth: true } },
};

export interface ActiveSkill {
  effect: SkillEffect;
  /** The card that provides it, for naming it. */
  card: string;
  rule: SkillRule;
}

/** The player's active skills, in SKILL_EFFECTS order (so results don't depend on draw order). */
export function activeSkills(state: GameState, player: PlayerId): readonly ActiveSkill[] {
  return skillSet(state, player).active;
}

/** The rules of the player's active skills. */
export function skillRules(state: GameState, player: PlayerId): readonly SkillRule[] {
  return skillSet(state, player).rules;
}

interface SkillSet {
  active: readonly ActiveSkill[];
  rules: readonly SkillRule[];
}

const NO_SKILLS: SkillSet = { active: Object.freeze([]), rules: Object.freeze([]) };

/**
 * Active skills by the ids of the active cards, in order: movement, combat and the conquer check
 * ask for them for every ship, and the AI asks in every position it scores. Few sets occur in a
 * game, so the cache stays small. The lists are frozen, as every caller gets the same one.
 */
const SKILL_SETS = new Map<string, SkillSet>();

function skillSet(state: GameState, player: PlayerId): SkillSet {
  const skills = state.players[player].skills;
  let key = '';
  for (const s of skills) if (s.active) key += `${s.id},`;
  if (!key) return NO_SKILLS;
  let set = SKILL_SETS.get(key);
  if (set) return set;
  const owned = new Map<string, string>();
  for (const s of skills) if (s.active && !owned.has(effectOf(s.id))) owned.set(effectOf(s.id), s.id);
  const active = Object.freeze(
    SKILL_EFFECTS.filter((e) => owned.has(e)).map((effect) =>
      Object.freeze({ effect, card: owned.get(effect)!, rule: SKILL_RULES[effect] }),
    ),
  );
  set = { active, rules: Object.freeze(active.map((a) => a.rule)) };
  SKILL_SETS.set(key, set);
  return set;
}

/** The rule of a skill card, whether or not it is active yet. */
export function ruleOf(skillId: string): SkillRule {
  return SKILL_RULES[effectOf(skillId) as SkillEffect] ?? {};
}

/** Whether any of the player's active skills has this property. */
export function anySkill(state: GameState, player: PlayerId, test: (r: SkillRule) => unknown): boolean {
  // Called on hot paths (every roll, attack and combat total): no list is built.
  return state.players[player].skills.some((s) => s.active && test(ruleOf(s.id)));
}

/** The index in the player's skills of a card someone who destroys their ship may take (Prideful), active or not. */
export function stealableSkill(state: GameState, player: PlayerId): number {
  return state.players[player].skills.findIndex((s) => ruleOf(s.id).stolenOnDestroy);
}

/** True when the player owns an active skill with this effect (e.g. Cerebral has the 'composed' effect). */
export function hasSkill(state: GameState, player: PlayerId, effect: SkillEffect): boolean {
  return state.players[player].skills.some((s) => s.active && effectOf(s.id) === effect);
}

/** The id of the player's card that provides an effect, for showing its name. */
export function skillCard(state: GameState, player: PlayerId, effect: SkillEffect): string | undefined {
  return state.players[player].skills.find((s) => s.active && effectOf(s.id) === effect)?.id;
}
