/**
 * Whether a value has the shape of an Action, with its players, planets and cells in range for this
 * game. Actions from other browsers (online play) are untrusted, so apply() checks this first: a
 * malformed action is refused with a RuleError and never reaches a handler. A check per field of every
 * action type, typed so that a new action or field doesn't compile without one.
 */
import type { Action, GameState } from './types';

type Check = (v: unknown, s: GameState) => boolean;
type Shape<K extends Action['type']> = { [F in Exclude<keyof Extract<Action, { type: K }>, 'type'>]-?: Check };

const int = (v: unknown): v is number => Number.isInteger(v);
const str: Check = (v) => typeof v === 'string';
const bool: Check = (v) => typeof v === 'boolean';
const index: Check = (v) => int(v) && v >= 0;
const player: Check = (v, s) => int(v) && v >= 0 && v < s.players.length;
const planet: Check = (v, s) => int(v) && v >= 0 && v < s.board.planets.length;
const cell: Check = (v, s) => {
  if (typeof v !== 'object' || v === null) return false;
  const { r, c } = v as Record<string, unknown>;
  return int(r) && int(c) && r >= 0 && r < s.board.rows && c >= 0 && c < s.board.cols;
};
const oneOf =
  (...values: unknown[]): Check =>
  (v) =>
    values.includes(v);
const opt =
  (check: Check): Check =>
  (v, s) =>
    v === undefined || check(v, s);
const side = oneOf('attacker', 'defender');

export const SHAPES: { [K in Action['type']]: Shape<K> } = {
  setupKeep: {},
  setupReroll: {},
  draftSkill: { skill: str },
  placeStart: { planet },
  placeShip: { die: str, to: cell },
  move: { die: str, to: cell },
  attack: { die: str, target: str, from: opt(cell) },
  power: { die: str, target: opt(str), to: opt(cell) },
  deploy: { die: str, to: cell },
  reconfigure: { die: str },
  research: {},
  conquer: { planet, replace: opt(player) },
  endTurn: {},
  freeAttack: { die: str, target: str },
  carry: { die: str, passenger: str, to: cell, drop: cell },
  swap: { die: str, other: str },
  change: { die: str, value: oneOf(3, 5) },
  freeReconfigure: { die: str },
  composed: {},
  ambitious: {},
  flexible: { die: str, delta: oneOf(1, -1) },
  resourceful: { die: str },
  tactical: { die: str, to: opt(cell), target: opt(str), passenger: opt(str), drop: opt(cell) },
  missile: { by: player, side },
  dangerous: { destroy: bool },
  clever: { value: int },
  resolveCombat: {},
  advance: { move: bool },
  infamy: { planet },
  takeCard: { deck: oneOf('skill', 'tactic', 'expansion'), index, store: opt(bool) },
  peekChoice: { takeTop: bool },
  profiteer: {},
  discardSkill: { skill: str },
  placeExpansion: { to: (v, s) => v === null || cell(v, s) },
  showOfForce: { die: str },
  warpGate: { cell },
  placeBarrier: { cell },
  kineticShunt: { die: str, to: cell },
  changeOfHeart: { skill: str },
  prideful: { take: bool },
  ruthless: { skill: opt(str) },
  playStoredTactic: { card: str },
  patientTactic: { index: opt(index) },
  unveilReroll: { die: str },
  unveilDeploy: { die: str, to: cell },
  unveilDone: {},
};

export function isWellFormed(s: GameState, a: unknown): a is Action {
  if (typeof a !== 'object' || a === null) return false;
  const fields = a as Record<string, unknown>;
  // Own keys only: an action from another browser may name anything, `constructor` included.
  if (typeof fields.type !== 'string' || !Object.hasOwn(SHAPES, fields.type)) return false;
  const shape: Record<string, Check> = SHAPES[fields.type as Action['type']];
  for (const k in shape) if (!shape[k](fields[k], s)) return false;
  return true;
}
