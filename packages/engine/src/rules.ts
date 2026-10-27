import {
  addCards,
  defaultMap,
  EXPANSION,
  MAPS,
  type CardDef,
  type GameMode,
  type MapDef,
  type ShipDef,
  type ShipPower,
  type ShipTable,
} from './data';
import type { ShipHooks } from './prototype';
import type { Die, GameState } from './types';
import { reword, type Words } from './words';

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
  /** Missiles each player starts with; 0 means the mode has no missiles. */
  startingMissiles: number;
  /**
   * Reconfigure re-rolls until the die shows `different` — any number other than its current one
   * (official rules) — or `unseen` — a number it has not shown this turn (Community Edition).
   */
  reconfigure: 'different' | 'unseen';
  /** Map groups (data/maps.yaml) this mode can be played on. */
  mapGroups: string[];
  /** Each die value's ship: its name and power (built in, or prototype hooks). */
  ships: ShipTable;
  /** The most a ship's die value counts for movement; skill bonuses add to it (PROTOTYPING.md §2). */
  maxMovement?: number;
  /** A fully occupied planet can still be conquered by an orbit summing to 12, displacing an opponent's cube (PROTOTYPING.md §6.10). */
  overConquest?: boolean;
  /** A planet can't be conquered while an opponent's ship is in one of its orbital positions (PROTOTYPING.md §6.8). */
  contestedOrbit?: boolean;
  /** No deploying into a planet's orbit while an opponent's ship is in it (PROTOTYPING.md §6.8, *Deploying to a contested planet*). */
  contestedDeploy?: boolean;
  /** With `contestedDeploy`: a player may still deploy to their own home planet (PROTOTYPING.md §6.8, *Home shipyard*). */
  homeShipyard?: boolean;
  /** How the game screen looks: absent, Quantum's deep space; `ground`, dust and basalt under a low sun (web styles.css, :root[data-look]). */
  look?: 'ground';
  /** The mode's own words for Quantum's, as the UI shows its text (words.ts); none: Quantum's. */
  words?: Words;
}

export interface CardRules {
  /** Permanent cards (Skill / Command). */
  skills: CardDef[];
  /** One-shot cards (Tactic / Gambit). */
  tactics: CardDef[];
  /** Each player drafts a starting skill: draw 2, keep 1. */
  startingSkillDraft: boolean;
  /** Taking the oldest face-up card lets you peek at the top of its deck instead. */
  peek: boolean;
  /** Expansion cards form a separate face-up pile of players + 1 (otherwise they are Gambit cards). */
  expansionPile: boolean;
  /** The card that pile is, when the mode has its own (default: the Community Expansion card); see expansionCard. */
  expansion?: CardDef;
  /** How the mode's cards are printed (the art package's `CardLook`): the holo cards when absent. */
  look?: 'holo' | 'screenprint';
  /** A card pick may be spent to discard every face-up card and deal new ones (2013 rulebook p.9). */
  refresh: boolean;
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
    if (cards.expansion) addCards([cards.expansion], 'expansion');
  }
}

/** The Expansion card of this game's rules: the mode's own, or the Community Edition's. */
export function expansionCard(state: GameState): CardDef {
  return rulesOf(state).cards?.expansion ?? EXPANSION;
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

/** A ship's prototype power hooks in this game's rules (none for the official ships). */
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

const CARD_NAMES = new WeakMap<RuleSet, readonly string[]>();

/** Every card name in this rule set, kept as written when rewording text for the UI. */
export function cardNamesOf(rules: RuleSet): readonly string[] {
  let names = CARD_NAMES.get(rules);
  if (!names) {
    const cards = rules.cards;
    names = cards
      ? [...cards.skills.map((c) => c.name), ...cards.tactics.map((c) => c.name), ...(cards.expansion ? [cards.expansion.name] : [])]
      : [];
    CARD_NAMES.set(rules, names);
  }
  return names;
}

/** `text` in this game's words (RuleSet.words), its players' and cards' names kept as they are. */
export function say(state: GameState, text: string, keep: readonly string[] = []): string {
  const rules = rulesOf(state);
  const { words } = rules;
  return words ? reword(words, text, [...state.players.map((p) => p.name), ...cardNamesOf(rules), ...keep]) : text;
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
