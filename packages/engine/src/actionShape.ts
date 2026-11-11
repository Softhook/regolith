/**
 * Whether a value has the shape of an Action, with its players, objectives and cells in range for this
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
const objective: Check = (v, s) => int(v) && v >= 0 && v < s.board.objectives.length;
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
  placeStart: { objective },
  placeMech: { die: str, to: cell },
  move: { die: str, to: cell },
  attack: { die: str, target: str, from: opt(cell) },
  breakBarrier: { die: str, cell },
  ability: { die: str, target: opt(str), to: opt(cell) },
  drop: { die: str, to: cell },
  refit: { die: str },
  research: {},
  claim: { objective, replace: opt(player) },
  endTurn: {},
  freeAttack: { die: str, target: str },
  carry: { die: str, passenger: str, to: cell, setDown: cell },
  swap: { die: str, other: str },
  change: { die: str, value: oneOf(3, 5) },
  standDown: {},
  finalPush: {},
  fieldRefit: { die: str, delta: oneOf(1, -1) },
  recycle: { die: str },
  advanceSkill: { die: str, to: opt(cell), target: opt(str), passenger: opt(str), setDown: opt(cell) },
  atomic: { by: player, side },
  unstableReactor: { destroy: bool },
  engineering: { value: int },
  resolveCombat: {},
  advance: { move: bool },
  infamy: { objective },
  takeCard: { deck: oneOf('skill', 'tactic', 'reinforcement'), index, store: opt(bool) },
  peekChoice: { takeTop: bool },
  armsDeal: {},
  discardSkill: { skill: str },
  reinforcements: { to: (v, s) => v === null || cell(v, s) },
  orbitalCannon: { die: str },
  iceTunnel: { cell },
  barricade: { cell },
  kineticShunt: { die: str, to: cell },
  kineticShuntBarrier: { from: cell, to: cell },
  headhunter: { skill: str },
  stolenFlag: { take: bool },
  signalJammer: { skill: opt(str) },
  strategicPlanPlay: { card: str },
  strategicPlanTactic: { index: opt(index) },
  invasionReroll: { die: str },
  invasionDrop: { die: str, to: cell },
  invasionDone: {},
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
