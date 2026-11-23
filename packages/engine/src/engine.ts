/**
 * The rules engine's public API: a game is a pure `(state, action) → state` function.
 *
 * Every action type has exactly one handler (the Handlers type makes the compiler enforce it), in the module of
 * its topic:
 *
 *   setup.ts          game creation, mech roll, starting skill, starting objective and mechs
 *   actions.ts        Move/Attack, Drop, Refit, Research, Claim, end turn
 *   abilities/        mech abilities 1–6: the 1 to 4 in index.ts, Shoot and Barrier a file each
 *   breakBarriers.ts  breaking a barrier, a rule on trial (RuleSet.breakBarriers)
 *   combat.ts         attacks, atomics, advancing, Take Over
 *   cards.ts          the card market, Tactic effects and their decisions
 *   skillActions.ts   skills used as an action of their own
 *
 * After each action, settle() (turn.ts) resolves what needs no one's choice and moves the turn on. Every other
 * module, and how they fit together, is in docs/ARCHITECTURE.md.
 */
// Sets the rule sets that rulesOf reads, for a state that didn't come from createGame (a saved game, a test).
import './rulesets';
import { abilityHandlers } from './abilities';
import { isWellFormed } from './actionShape';
import { actionHandlers } from './actions';
import { barrierBreakHandlers } from './breakBarriers';
import { cardHandlers } from './cards';
import { combatHandlers } from './combat';
import { log, name, type Handlers } from './core';
import { card } from './data';
import { setupHandlers } from './setup';
import { prospectorsUsed, skillHandlers, skillUsed } from './skillActions';
import { settle } from './turn';
import { RuleError, type Action, type GameState, type PlayerId } from './types';

const HANDLERS: Handlers = {
  ...setupHandlers,
  ...actionHandlers,
  ...barrierBreakHandlers,
  ...abilityHandlers,
  ...combatHandlers,
  ...cardHandlers,
  ...skillHandlers,
};

/** Applies an action and returns the new state. Throws RuleError if the action is illegal. */
export function apply(prev: GameState, action: Action): GameState {
  if (prev.phase === 'over') throw new RuleError('The game is over');
  // Online, actions come from other browsers: check the shape before any handler sees it.
  if (!isWellFormed(prev, action)) throw new RuleError(`Malformed action ${JSON.stringify(action)?.slice(0, 200)}`);
  const handler = HANDLERS[action.type] as (s: GameState, a: Action) => void;
  const s = copyState(prev);
  handler(s, action);
  const used = skillUsed(prev, action) ?? prospectorsUsed(prev, s);
  if (used) showSkill(s, prev.logCounter, used.player, used.card);
  settle(s);
  return s;
}

/**
 * Names the skill card an action used on the first entry its owner logged, so the UI can show the
 * card; an action that logged nothing for them (Stand Down…) logs that they used it.
 */
function showSkill(s: GameState, before: number, player: PlayerId, id: string) {
  const entry = s.log.find((e) => e.id > before && e.player === player && !e.card && e.event !== 'takeOver');
  if (entry) entry.card = id;
  else {
    log(s, `${name(s, player)} uses ${card(id).name}.`, player);
    s.log[s.log.length - 1].card = id;
  }
}

/**
 * A deep copy of a state, or any part of one. States are plain data (they travel as JSON between
 * browsers), so a plain recursive copy does what structuredClone does, about three times faster:
 * the AI copies a state for every position it searches.
 */
export function cloneState<T>(x: T): T {
  if (typeof x !== 'object' || x === null) return x;
  if (Array.isArray(x)) {
    const out = new Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = cloneState(x[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const k in x) out[k] = cloneState(x[k]);
  return out as T;
}

/**
 * A copy of a state to change. The board's cells never change after the board is built, so states
 * share them: copying them was most of the AI's time (an Invasion with five mechs to place took minutes). A log
 * entry doesn't change once the step that wrote it is over either, so they share those too: with a position kept
 * for every move of a game (web past.ts), copying them was most of its memory.
 */
export function copyState(prev: GameState): GameState {
  const s: GameState = cloneState({ ...prev, board: { ...prev.board, cells: [] }, log: [] });
  s.board.cells = prev.board.cells;
  s.log = [...prev.log];
  return s;
}

/** Like apply, but returns null instead of throwing for an illegal action. */
export function tryApply(prev: GameState, action: Action): GameState | null {
  try {
    return apply(prev, action);
  } catch (e) {
    if (e instanceof RuleError) return null;
    throw e;
  }
}

/**
 * Whether the player in `seat` may send `action` (online play, where every action names its seat).
 * Atomics and combat re-rolls belong to the player named in them, who may be anyone at the table;
 * resolving a battle is never a player's action (the table resolves it once everyone has passed);
 * everything else belongs to `actor(state)`. Whether the action is legal is still `apply`'s call.
 */
export function mayAct(state: GameState, seat: PlayerId, action: Action): boolean {
  switch (action.type) {
    case 'resolveCombat':
      return false;
    case 'atomic':
      return action.by === seat;
    default:
      return actor(state) === seat;
  }
}

/** The player who must act next (for combat: the attacker, who resolves it). */
export function actor(state: GameState): PlayerId {
  const head = state.pending[0];
  if (!head) return state.turn.player;
  if (head.kind === 'combat') return head.attacker.player;
  return head.player;
}
