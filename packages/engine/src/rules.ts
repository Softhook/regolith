import { addCards, defaultMap, MAPS, type CardDef, type GameMode, type MapDef, type ShipDef, type ShipPower, type ShipTable } from './data';
import type { ShipHooks } from './ships';
import type { Die, GameState } from './types';

/**
 * Everything that differs between rule sets lives here. The engine and the UI ask the rule set
 * ("does this mode have missiles?") instead of checking the mode's name, so adding a new
 * edition means adding one entry to RULESETS (rulesets.ts).
 */
export interface RuleSet {
  id: GameMode;
  /** Short name for menus. */
  name: string;
  /** Full name for the game log. */
  title: string;
  summary: string;
  /** Advance cards; null means the mode has no cards, and so no research either. */
  cards: CardRules | null;
  /** Actions available on each regular turn. */
  actionsPerTurn: number;
  /** Maximum value on the research track. */
  researchLimit: number;
  /** Map groups (data/maps.yaml) this mode can be played on. */
  mapGroups: string[];
  /** Each die value's ship: its name and power (built in, or hooks). */
  ships: ShipTable;
  /** A fully occupied planet can still be conquered by an orbit summing to 12, displacing an opponent's cube (PROTOTYPING.md §6.10). */
  overConquest?: boolean;
  /** Mechs may destroy barriers, on trial in self-play (breakBarriers.ts); off in every mode. */
  breakBarriers?: BarrierBreakRule;
}

/** How mechs break barriers (breakBarriers.ts): from where they stand, or like an attack. */
export type BarrierBreakRule = 'smash' | 'attack';

export interface CardRules {
  /** Permanent cards (Skill / Command). */
  skills: CardDef[];
  /** One-shot cards (Tactic / Gambit). */
  tactics: CardDef[];
  /** Each player drafts a starting skill: draw 2, keep 1. */
  startingSkillDraft: boolean;
  /** Taking the oldest face-up card lets you peek at the top of its deck instead. */
  peek: boolean;
  /** Expansion cards form a separate face-up pile of players + 1. */
  expansionPile: boolean;
  /** The card that pile is; see expansionCard. */
  expansion: CardDef;
  terms: {
    skill: string;
    skills: string;
    skillDeck: string;
    tacticDeck: string;
  };
}

/**
 * The rule sets by mode: rulesets.ts builds them (it needs the modes, which use the whole engine) and sets
 * them here. Importing rulesets.ts from this file would bring back an import cycle (rules → regolith →
 * the whole engine → rules) that crashed the engine when some modules were loaded first, so each module
 * that takes a state from outside (setup, engine, legal through engine, invariants) loads rulesets.ts
 * itself; load-order.test.ts checks each one alone.
 */
let ruleSets: Record<GameMode, RuleSet> | undefined;

export function defineRuleSets(table: Record<GameMode, RuleSet>) {
  ruleSets = table;
  // A mode's own decks become cards the engine knows, by id, like the editions' cards.
  for (const { cards } of Object.values(table)) {
    if (!cards) continue;
    addCards(cards.skills, 'skill');
    addCards(cards.tactics, 'tactic');
    addCards([cards.expansion], 'expansion');
  }
}

/** The Expansion card of this game's rules (Regolith's Reinforcements). */
export function expansionCard(state: GameState): CardDef {
  const cards = rulesOf(state).cards;
  if (!cards) throw new Error(`${rulesOf(state).name} has no cards`);
  return cards.expansion;
}

/** The rule set a game is played with. */
export function rulesOf(state: GameState): RuleSet {
  if (!ruleSets) throw new Error('No rule sets yet: load the engine through src/index.ts');
  if (!Object.hasOwn(ruleSets, state.mode)) throw new Error(`Unknown mode ${state.mode}`);
  return ruleSets[state.mode];
}

/** The ship a die value is in this game's rules. */
export function shipOf(state: GameState, value: number): ShipDef {
  return rulesOf(state).ships[value];
}

/** Whether a ship has this power in this game's rules. */
export function hasPower(state: GameState, d: Die, power: ShipPower): boolean {
  return rulesOf(state).ships[d.value]?.power === power;
}

/** A ship's power hooks in this game's rules (none for the 1 to 4's built-in powers). */
export function hooksOf(state: GameState, d: Die): ShipHooks | undefined {
  return rulesOf(state).ships[d.value]?.hooks;
}

/** The hooks each ship table's ships have, worked out once: the engine asks on every move search. */
const HOOKS = new WeakMap<ShipTable, Set<string>>();

/** Whether any ship in this game's rules has this hook (none in the official modes), so searches can skip it otherwise. */
export function modeHasHook(state: GameState, hook: keyof ShipHooks): boolean {
  const ships = rulesOf(state).ships;
  let hooks = HOOKS.get(ships);
  if (!hooks) {
    hooks = new Set(Object.values(ships).flatMap((s) => Object.keys(s.hooks ?? {}).filter((k) => s.hooks![k as keyof ShipHooks])));
    HOOKS.set(ships, hooks);
  }
  return hooks.has(hook);
}

/** The map a rule set starts on for a player count: the basic map, or its first map if it doesn't play that one. */
export function defaultMapFor(rules: RuleSet, players: number): MapDef | undefined {
  const basic = defaultMap(players);
  return basic && rules.mapGroups.includes(basic.group)
    ? basic
    : MAPS.find((m) => m.players === players && rules.mapGroups.includes(m.group));
}

/** Player counts a rule set has maps for. */
export function playerCounts(rules: RuleSet): number[] {
  return [...new Set(MAPS.filter((m) => rules.mapGroups.includes(m.group)).map((m) => m.players))].sort((a, b) => a - b);
}
