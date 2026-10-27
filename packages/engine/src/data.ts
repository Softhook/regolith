import mapsJson from './data/maps.json';
import type { ShipHooks } from './prototype';
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
  /** Edges that join: leaving one edge of a row or column re-enters at its opposite edge. */
  wrap?: 'horizontal' | 'vertical' | 'both';
  /** Hex tiles (7-hex flowers) instead of 3×3 squares: data/maps.yaml says how a hex layout reads. */
  grid?: 'hex';
  /** A hex map's world, Phobos, Deimos or Mars: every hex map in data/maps.yaml names one (Mars for a test's map that doesn't). */
  world?: World;
  layout: string[][];
}

// build-data.mjs checks `wrap` is one of the allowed values.
export const MAPS: MapDef[] = mapsJson as MapDef[];

/** The basic map for a player count. */
export function defaultMap(players: number): MapDef | undefined {
  return MAPS.find((m) => m.players === players && m.group === 'basic') ?? MAPS.find((m) => m.players === players);
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

/** Skills are permanent; everything else is one-shot. */
export function cardKind(id: string): 'skill' | 'tactic' | 'expansion' {
  if (expansionIds.has(id)) return 'expansion';
  return skillIds.has(id) ? 'skill' : 'tactic';
}

/**
 * The official ships' powers, built into the engine: ship identity is "has power X", not a die value,
 * so a mode can give a value a different power (RuleSet.ships).
 */
export type ShipPower = 'strike' | 'transport' | 'warp' | 'modify' | 'manoeuvre' | 'freeReconfigure';

export interface ShipDef {
  name: string;
  /** A built-in power (the official ships). */
  power?: ShipPower;
  /** A prototype power, as hooks (prototype.ts). A ship with hooks and no `power` has no once-per-turn ability. */
  hooks?: ShipHooks;
  /** The power's name and rules text for the UI; `hint` guides a player using its action. */
  ability: { name: string; text: string; hint?: string };
}

/** A mode's ships by die value, 1 to 6. */
export type ShipTable = Record<number, ShipDef>;

export const CLASSIC_SHIPS: ShipTable = {
  1: {
    name: 'Battlestation',
    power: 'strike',
    ability: { name: 'Free Attack', text: 'Attack an adjacent enemy without using this ship’s move.' },
  },
  2: {
    name: 'Flagship',
    power: 'transport',
    ability: { name: 'Carry & Move', text: 'Carry one of your nearby ships as part of a move, then drop it next to you.' },
  },
  3: { name: 'Destroyer', power: 'warp', ability: { name: 'Swap', text: 'Swap places with any of your other ships.' } },
  4: { name: 'Frigate', power: 'modify', ability: { name: 'Change to 3 or 5', text: 'Turn into a Destroyer or an Interceptor.' } },
  5: {
    name: 'Interceptor',
    power: 'manoeuvre',
    ability: { name: 'Move Diagonally', text: 'May move and attack diagonally (used automatically when needed).' },
  },
  6: { name: 'Scout', power: 'freeReconfigure', ability: { name: 'Free Reconfigure', text: 'Re-roll this ship for free.' } },
};
