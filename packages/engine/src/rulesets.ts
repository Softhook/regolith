/**
 * The rule sets, by mode: Regolith (docs/regolith/PROTOTYPING.md, REGOLITH.md), and Basic, Regolith without its
 * cards. Kept apart from rules.ts because building them needs the mechs' powers (ships.ts), which use the whole
 * engine: engine modules ask rulesOf (rules.ts), which imports none of this, so the engine loads the same
 * whichever of its modules is imported first.
 */
import cardsJson from './data/cards.json';
import type { CardDef, GameMode } from './data';
import { defineRuleSets, type RuleSet } from './rules';
import { SHIPS } from './ships';

/**
 * Regolith's decks (data/regolith.yaml, built into data/cards.json): each card started as a Community card
 * (`from`) and plays by its rules (`effect`) until it is reworked. Ingenious isn't among them: hexes have no corners.
 */
export const REGOLITH_DECKS: { skills: CardDef[]; tactics: CardDef[]; expansion: CardDef[] } = cardsJson;

/**
 * Over-conquest (PROTOTYPING.md §6.10): an orbit of exactly 12 displaces an opponent's cube. Off since
 * 2026-10-21, when contested orbit came in; flip it to try both together.
 */
export const REGOLITH_OVER_CONQUEST = false;

/** The words Regolith describes itself with in the lobby, after what each mode adds. */
const RULES_TEXT = `moves capped at 3, zones of control (a mech moving next to an enemy mech, not diagonally, stops there), a ranged Sniper, a Wisp that fires barriers and contested perimeters (no claiming or dropping, except to your home objective, while an enemy mech is on the perimeter)${REGOLITH_OVER_CONQUEST ? ' and over-claiming, displacing an opponent cube' : ''}`;

/**
 * Regolith (docs/regolith/REGOLITH.md): missiles, a starting skill drafted from its own decks (REGOLITH_DECKS) and
 * a card market with peeking. It plays the hex maps only, the hex, open-ground and off-centre (drift) ones, on
 * Phobos's, Deimos's and Mars's ground.
 */
const REGOLITH: RuleSet = {
  id: 'regolith',
  name: 'Regolith',
  title: 'Regolith',
  summary: `Mechs fight over the ice of Mars and its moons, on hex maps, with their own deck, ${RULES_TEXT}.`,
  actionsPerTurn: 3,
  researchLimit: 6,
  cards: {
    skills: REGOLITH_DECKS.skills,
    tactics: REGOLITH_DECKS.tactics,
    expansion: REGOLITH_DECKS.expansion[0],
    startingSkillDraft: true,
    peek: true,
    expansionPile: true,
    terms: { skill: 'skill', skills: 'skills', skillDeck: 'Skills', tacticDeck: 'Tactics' },
  },
  mapGroups: ['hex', 'open', 'drift'],
  ships: SHIPS,
  overConquest: REGOLITH_OVER_CONQUEST,
};

/**
 * Basic: Regolith without cards, for learning. The same mechs, powers, missiles, zones of control, contested
 * orbits and maps, with no research, market or starting skill, so what a player learns carries over unchanged.
 */
const BASIC: RuleSet = {
  ...REGOLITH,
  id: 'basic',
  name: 'Basic',
  title: 'Basic',
  summary: `Regolith without cards, for learning: ${RULES_TEXT}.`,
  cards: null,
};

export const RULESETS: Record<GameMode, RuleSet> = { basic: BASIC, regolith: REGOLITH };

defineRuleSets(RULESETS);

/** The mode the lobby offers first, before a player has picked one. */
export const DEFAULT_MODE: GameMode = 'regolith';

/** Rule sets in menu order: Basic first, as the learning game. */
export const MODES: RuleSet[] = [RULESETS.basic, RULESETS.regolith];
