/**
 * Regolith, our own rule set (docs/regolith/PROTOTYPING.md §9). Everything specific to the mode
 * lives in this folder: what the mode changes and which ship has which power here, each power in its own file in
 * powers/ (its rules text and its hooks).
 *
 * The engine reaches this folder in one place, RULESETS.regolith (rulesets.ts), and runs the powers only
 * through ShipHooks, so nothing here can change Basic, Original or Community. This folder in turn uses
 * the engine only through the prototype kit (../prototype.ts). test/regolith.test.ts checks both.
 *
 * To try a change: a setting, edit this file; how a power works or its text, its file in powers/; a
 * power on another ship, move it in REGOLITH_SHIPS; a new power, copy a file in powers/.
 */
import { CLASSIC_SHIPS, reword, type CardDef, type RuleSet, type ShipTable } from '../prototype';
import cardsJson from './cards.json';
import { barrier } from './powers/barrier';
import { picket } from './powers/picket';
import { shoot } from './powers/shoot';
import { REGOLITH_WORDS } from './words';

/**
 * Regolith's own decks (data/regolith.yaml, built into cards.json): each card started as a Community card
 * (`from`) and plays by its rules (`effect`) until it is reworked. Ingenious isn't among them: hexes have no corners.
 */
export const REGOLITH_DECKS: { skills: CardDef[]; tactics: CardDef[]; expansion: CardDef[] } = cardsJson;

/**
 * Over-conquest (PROTOTYPING.md §6.10): an orbit of exactly 12 displaces an opponent's cube. Off since
 * 2026-10-21, when contested orbit came in; flip it to try both together.
 */
export const REGOLITH_OVER_CONQUEST = false;

/**
 * Contested deploy (PROTOTYPING.md §6.8): no deploying into a planet's orbit while an opponent's ship is in
 * it, so a defender can't re-block a planet as fast as its blockers are destroyed. Since 2026-10-21.
 */
export const REGOLITH_CONTESTED_DEPLOY = true;

/** Home shipyard (PROTOTYPING.md §6.8): with contested deploy, a player may always deploy to their own home planet, so nobody is shut out. */
export const REGOLITH_HOME_SHIPYARD = true;

/** The most a ship's die value counts for movement; skill bonuses add to it (ruling 2026-10-08). */
const MAX_MOVEMENT = 3;

/**
 * Regolith's mechs (docs/regolith/REGOLITH-WORLD.md, *The six mechs*): the official powers under the mechs' names, except
 * the 5's, which strikes at range, and the 6's, which fires barriers.
 */
const SHIPS: ShipTable = {
  1: {
    ...CLASSIC_SHIPS[1],
    name: 'Breacher',
    ability: { name: 'Free Attack', text: 'Attack an adjacent enemy without using this mech’s move.' },
  },
  2: {
    ...CLASSIC_SHIPS[2],
    name: 'Behemoth',
    ability: { name: 'Carry & Move', text: 'Carry one of your nearby mechs as part of a move, then drop it next to you.' },
  },
  3: { ...CLASSIC_SHIPS[3], name: 'Tactician', ability: { name: 'Swap', text: 'Swap places with any of your other mechs.' } },
  4: { ...CLASSIC_SHIPS[4], name: 'Chameleon', ability: { name: 'Change to 3 or 5', text: 'Refit as a Tactician or a Sniper.' } },
  5: { name: 'Sniper', ...shoot },
  6: { name: 'Wisp', ...barrier },
};

/**
 * Zone of control, a mode rule rather than a power: every ship pickets the spaces next to it (4 on
 * squares, 6 on hexes; not diagonally), so an enemy ship moving in must stop there. Its rules text stays its own power's.
 */
const REGOLITH_SHIPS: ShipTable = Object.fromEntries(
  Object.entries(SHIPS).map(([v, ship]) => [v, { ...ship, hooks: { ...ship.hooks, ...picket.hooks } }]),
);

/** The words Regolith describes itself with in the lobby, after what each mode adds. */
const RULES_TEXT = `moves capped at 3, zones of control (a mech moving next to an enemy mech, not diagonally, stops there), a ranged Sniper, a Wisp that fires barriers and contested orbits (no conquering${REGOLITH_CONTESTED_DEPLOY ? ` or deploying${REGOLITH_HOME_SHIPYARD ? ', except to your home planet,' : ''}` : ''} while an enemy mech is in orbit)${REGOLITH_OVER_CONQUEST ? ' and over-conquest, displacing an opponent cube' : ''}`;

/**
 * Regolith (docs/regolith/REGOLITH.md): missiles, a starting skill drafted from its own decks (REGOLITH_DECKS) and
 * a card market with peeking. It plays the hex maps only, the hex, open-ground and off-centre (drift) ones, on
 * Phobos's, Deimos's and Mars's ground.
 */
export const REGOLITH: RuleSet = {
  id: 'regolith',
  name: 'Regolith',
  title: 'Regolith',
  summary: reword(REGOLITH_WORDS, `Mechs fight over the ice of Mars and its moons, on hex maps, with their own deck, ${RULES_TEXT}.`),
  actionsPerTurn: 3,
  researchLimit: 6,
  cards: {
    skills: REGOLITH_DECKS.skills,
    tactics: REGOLITH_DECKS.tactics,
    expansion: REGOLITH_DECKS.expansion[0],
    startingSkillDraft: true,
    peek: true,
    expansionPile: true,
    // Printed in screenprint (docs/regolith/REGOLITH.md §5).
    look: 'screenprint',
    terms: { skill: 'skill', skills: 'skills', skillDeck: 'Skills', tacticDeck: 'Tactics' },
  },
  startingMissiles: 1,
  reconfigure: 'unseen',
  mapGroups: ['hex', 'open', 'drift'],
  ships: REGOLITH_SHIPS,
  maxMovement: MAX_MOVEMENT,
  overConquest: REGOLITH_OVER_CONQUEST,
  contestedOrbit: true,
  contestedDeploy: REGOLITH_CONTESTED_DEPLOY,
  homeShipyard: REGOLITH_HOME_SHIPYARD,
  look: 'ground',
  words: REGOLITH_WORDS,
};

/**
 * Basic: Regolith without cards, for learning. The same mechs, powers, missiles, zones of control, contested
 * orbits and maps, with no research, market or starting skill, so what a player learns carries over unchanged.
 */
export const BASIC: RuleSet = {
  ...REGOLITH,
  id: 'basic',
  name: 'Basic',
  title: 'Basic',
  summary: reword(REGOLITH_WORDS, `Regolith without cards, for learning: ${RULES_TEXT}.`),
  cards: null,
};
