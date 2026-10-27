import type { CombatPending, GameState } from '@regolith/engine';
import { combatStage, type Post, type Step } from '@regolith/online';
import { shotWait } from '../game/strike';

/** How long a move by someone else stays on screen before the next one is shown. */
export const STEP_MS = 1500;
/** How long each stage of a battle (before a missile or re-roll changes it) stays on screen; for
 * other players' battles, also how long the decided battle does. */
export const COMBAT_MS = 3500;
/** Further behind than this, the screen skips ahead (to the next battle's result, or the present)
 * instead of replaying every move. */
export const MAX_BEHIND = 12;

export interface NextStep {
  step: Step;
  /** Wait this long before showing it. */
  delay: number;
  /** Whether to announce what it changed (toasts, sounds); not when skipping ahead. */
  announce: boolean;
  /** Whether it is another position than the one after `shown` (skipping moves, or `shown` lost), not the same one rebuilt. */
  jump: boolean;
}

/**
 * What the screen shows next, as it catches up with the game: the step after `shown`, after a
 * pause long enough to follow (none for this browser's own moves); or the last step at once if
 * `shown` is no longer in the game.
 *
 * Steps are matched by identity, or failing that by the post that made them (a replay from scratch
 * makes new steps for the same posts); not by their state: an undo makes a new step whose state is
 * an earlier step's.
 *
 * Far behind (a player back after a while), the screen skips the moves in between but still stops
 * at each battle's result, so none goes unseen.
 *
 * The player's own battle (`battle.mine`: they attack or defend) that ends after `shown` stays on
 * screen until they have dismissed it (`battle.dismissed`), so they can see how it went; other
 * players' battles move on after a pause.
 *
 * `elapsed`: how long `shown` has been on screen already.
 */
export function nextStep(
  steps: readonly Step[],
  shown: Step | null,
  own: (p: Post) => boolean,
  elapsed: number,
  battle = { mine: false, dismissed: false },
): NextStep | null {
  const last = steps.length - 1;
  const i = indexOf(steps, shown);
  // Lost, or at the last step but a replay from scratch (a claim, say) made a new one for it: show
  // that one, or the screen never counts as caught up.
  if (i < 0 || i === last) return steps[last] === shown ? null : { step: steps[last], delay: 0, announce: false, jump: i < 0 && !!shown };
  const fighting = battleOnScreen(shown!.state);
  const pause = fighting ? COMBAT_MS + shotWait(fighting) : STEP_MS;
  if (battleEnds(steps, i) && battle.mine && !battle.dismissed) return null;
  if (last - i > MAX_BEHIND) {
    let j = i + 1;
    while (j < last && !battleEnds(steps, j)) j++;
    // Moves that were never shown only get their pause if there is a battle on screen to see.
    return { step: steps[j], delay: fighting ? Math.max(0, pause - elapsed) : 0, announce: false, jump: j > i + 1 };
  }
  const next = steps[i + 1];
  if (battleEnds(steps, i) && battle.mine) return { step: next, delay: 0, announce: true, jump: false };
  const min = !fighting && next.post && own(next.post) ? 0 : pause;
  return { step: next, delay: Math.max(0, min - elapsed), announce: true, jump: false };
}

/** Where `s` is among `steps`: the same step, or else the last step made by the same post; -1 if neither. */
function indexOf(steps: readonly Step[], s: Step | null): number {
  if (!s) return -1;
  const i = steps.indexOf(s);
  if (i >= 0 || !s.post) return i;
  return resumeAt(steps, s.post.id);
}

/** The last step made by post `id`, to carry on from where the player left off; -1 if none. */
export function resumeAt(steps: readonly Step[], id: string | null): number {
  for (let i = steps.length - 1; id && i >= 0; i--) if (steps[i].post?.id === id) return i;
  return -1;
}

/** The post that made step `i`, or the last one before it (battles resolving by themselves make none). */
export function seenPost(steps: readonly Step[], i: number): string | null {
  for (; i >= 0; i--) if (steps[i].post) return steps[i].post!.id;
  return null;
}

/** Whether step `i` is a battle's result: the battle is gone, or another one is on, at the next step. */
function battleEnds(steps: readonly Step[], i: number): boolean {
  const c = battleOnScreen(steps[i].state);
  return !!c && i < steps.length - 1 && battleOnScreen(steps[i + 1].state)?.id !== c.id;
}

/** The battle on screen and how far it has got (each missile and re-roll changes it), if any. */
export function battleStage(s: GameState): string | null {
  const c = battleOnScreen(s);
  return c ? combatStage(c) : null;
}

/** Whether `p` attacks or defends in the battle on screen. */
export function inBattle(s: GameState, p: (id: number) => boolean): boolean {
  const c = battleOnScreen(s);
  return !!c && (p(c.attacker.player) || p(c.defender.player));
}

function battleOnScreen(s: GameState): CombatPending | null {
  const head = s.pending[0];
  return head?.kind === 'combat' ? head : null;
}
