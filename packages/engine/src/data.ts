import mapsJson from './data/maps.json';
import type { ShipHooks } from './ships';
import type { World } from './types';

export interface CardDef {
  id: string;
  name: string;
  subtitle: string;
  text: string;
  /** Sets the card's accent colour and icon (data/regolith.yaml). */
  category: string;
  count: number;
  notes?: string;
  /** The rules it plays by (effects.ts): the Community Edition card it started as, or its own; defaults to its id. */
  effect?: string;
  /** Notes of where it came from: the Community card it started as, and how far it has moved (community, renamed, reworked, new). */
  from?: string;
  status?: string;
  /** The brief its art is drawn from (data/regolith.yaml). */
  art?: { title: string; brief: string };
}

export type GameMode = 'basic' | 'regolith';

export interface MapDef {
  id: string;
  name: string;
  players: number;
  group: string;
  cubes: number;
  stats: { slack: number; shared: number | null; planets: number };
  /** The map's world, Phobos, Deimos or Mars: every map in data/maps.yaml names one (Mars for a test's map that doesn't). */
  world?: World;
  /** How long a game on it runs, by AI self-play (data/maps.yaml); the lobby lists maps by it. Absent on a test's map. */
  length?: 'short' | 'medium' | 'long';
  layout: string[][];
  /** What the map starts with on the ground (data/maps.yaml): spaces as `row:col:side`, see board.ts `startSpace`. */
  start?: { tunnel?: string[]; wormhole?: string[]; barriers?: string[] };
}

export const MAPS: MapDef[] = mapsJson as MapDef[];

/** The basic map for a player count: the first in data/maps.yaml, a basic map on hex tiles. */
export function defaultMap(players: number): MapDef | undefined {
  return MAPS.find((m) => m.players === players);
}

/** Every card of every deck, once the rule sets are defined (addCards). */
export const ALL_CARDS: CardDef[] = [];

const byId = new Map<string, CardDef>();
const skillIds = new Set<string>();
const expansionIds = new Set<string>();

/** Adds a mode's decks to the cards `card` knows (rules.ts, as the rule sets are defined); cards already known are skipped. */
export function addCards(defs: readonly CardDef[], kind: 'skill' | 'tactic' | 'expansion') {
  for (const c of defs) {
    if (byId.has(c.id)) continue;
    byId.set(c.id, c);
    ALL_CARDS.push(c);
    if (kind === 'skill') skillIds.add(c.id);
    if (kind === 'expansion') expansionIds.add(c.id);
  }
}

export function card(id: string): CardDef {
  const c = byId.get(id);
  if (!c) throw new Error(`Unknown card ${id}`);
  return c;
}

export function effectOf(id: string): string {
  return card(id).effect ?? id;
}

/** A card with this effect, for naming it. */
export function cardWithEffect(effect: string): CardDef | undefined {
  return byId.get(effect) ?? [...byId.values()].find((c) => c.effect === effect);
}

/** The name of the card with this effect, as printed (Profiteering's is Arms Deal). */
export const cardName = (effect: string): string => cardWithEffect(effect)?.name ?? effect;

/** Skills are permanent; everything else is one-shot. */
export function cardKind(id: string): 'skill' | 'tactic' | 'expansion' {
  if (expansionIds.has(id)) return 'expansion';
  return skillIds.has(id) ? 'skill' : 'tactic';
}

/**
 * The ship powers the 1 to 4 keep, built into the engine: ship identity is "has power X", not a die value,
 * so a die value could be given a different power (RuleSet.ships).
 */
export type ShipPower = 'strike' | 'transport' | 'warp' | 'modify';

export interface ShipDef {
  name: string;
  /** A built-in power. */
  power?: ShipPower;
  /** A power as hooks (ships.ts). A ship with hooks and no `power` has no once-per-turn ability. */
  hooks?: ShipHooks;
  /** The power's name and rules text for the UI; `hint` guides a player using its action. */
  ability: { name: string; text: string; hint?: string };
}

/** A mode's ships by die value, 1 to 6. */
export type ShipTable = Record<number, ShipDef>;
