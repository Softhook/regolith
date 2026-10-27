/** Catching up with an online game: the screen walks forward through the steps, never back. */
import { describe, expect, it } from 'vitest';
import type { Post, Step } from '@regolith/online';
import { quickStart } from '../../../packages/engine/test/helpers';
import type { CombatPending } from '@regolith/engine';
import { COMBAT_MS, MAX_BEHIND, nextStep, resumeAt, seenPost, STEP_MS } from '../src/online/playback';

const base = quickStart(2, 1);
const post = (author: string): Post => ({
  id: `${author}${Math.random()}`,
  author,
  at: 0,
  prev: 'x',
  body: { t: 'act', seat: 0, action: { type: 'research' } },
});
const step = (state = structuredClone(base), author = 'them'): Step => ({ state, post: post(author) });
const mine = (p: Post) => p.author === 'me';

/** Follows nextStep from `shown` until it has nothing more to show; the steps shown in order. */
function walk(steps: Step[], shown: Step | null, battle?: { mine: boolean; dismissed: boolean }): Step[] {
  const seen: Step[] = [];
  for (let n = 0; n < 100; n++) {
    const next = nextStep(steps, shown, mine, Infinity, battle);
    if (!next) return seen;
    seen.push(next.step);
    shown = next.step;
  }
  throw new Error('playback never settles');
}

const side = { player: 0, die: 'x', ship: 3, dice: [4], missile: false };
const battle = (missile: boolean, id = 7): CombatPending =>
  ({
    kind: 'combat',
    id,
    attacker: { ...side, missile },
    defender: { ...side, player: 1 },
    from: [0, 0],
    at: [0, 1],
    rerolls: [],
  }) as unknown as CombatPending;
const fighting = (missile: boolean, id = 7) => step({ ...structuredClone(base), pending: [battle(missile, id)] });

describe('online playback', () => {
  it('shows the next move after a pause, and own moves at once', () => {
    const steps = [step(), step(), step(undefined, 'me')];
    expect(nextStep(steps, steps[0], mine, 100)).toMatchObject({ step: steps[1], delay: STEP_MS - 100, announce: true });
    expect(nextStep(steps, steps[1], mine, 0)).toMatchObject({ step: steps[2], delay: 0 });
    expect(nextStep(steps, steps[2], mine, 0)).toBeNull();
  });

  it('settles on an undo instead of bouncing between the two positions', () => {
    // Before the move, the move, and the undo, which brings back the first step's state.
    const before = step();
    const moved = step();
    const undone: Step = { state: before.state, post: post('them') };
    const steps = [before, moved, undone];
    expect(walk(steps, moved)).toEqual([undone]);
    expect(walk(steps, before)).toEqual([moved, undone]);
  });

  it('jumps to the present when far behind or when the steps were rebuilt', () => {
    const steps = Array.from({ length: MAX_BEHIND + 3 }, () => step());
    expect(nextStep(steps, steps[0], mine, 0)).toMatchObject({ step: steps.at(-1), delay: 0, announce: false, jump: true });
    expect(nextStep(steps, step(), mine, 0)).toMatchObject({ step: steps.at(-1), announce: false, jump: true });
    expect(nextStep(steps, null, mine, 0)).toMatchObject({ step: steps.at(-1), announce: false, jump: false });
  });

  it('at the present, moves to its rebuilt step, so it still counts as caught up', () => {
    // A claim rebuilds the steps without adding one: the same posts, new step objects.
    const old = [step(), step()];
    const rebuilt = old.map((s) => ({ ...s }));
    expect(nextStep(rebuilt, old[1], mine, 0)).toMatchObject({ step: rebuilt[1], delay: 0, announce: false, jump: false });
    expect(walk(rebuilt, old[1])).toEqual([rebuilt[1]]);
  });

  it('keeps your own battle on screen until it is dismissed, but not each stage of it', () => {
    const steps = [fighting(false), fighting(true), step()];
    // A missile changes the battle: shown after the usual pause.
    expect(nextStep(steps, steps[0], mine, 0, { mine: true, dismissed: false })).toMatchObject({ step: steps[1], delay: COMBAT_MS });
    // The battle is over: held until the player dismisses it.
    expect(nextStep(steps, steps[1], mine, Infinity, { mine: true, dismissed: false })).toBeNull();
    expect(nextStep(steps, steps[1], mine, 0, { mine: true, dismissed: true })).toMatchObject({ step: steps[2], delay: 0, announce: true });
    // Other players' battles move on after a pause.
    expect(nextStep(steps, steps[1], mine, 1000)).toMatchObject({ step: steps[2], delay: COMBAT_MS - 1000 });
  });

  it('far behind, skips the moves in between but stops at every battle result', () => {
    const moves = (n: number) => Array.from({ length: n }, () => step());
    const first = [fighting(false, 1), fighting(true, 1)];
    const second = [fighting(false, 2)];
    const steps = [...moves(3), ...first, ...moves(MAX_BEHIND), ...second, ...moves(MAX_BEHIND), step()];
    // Results long past move on by themselves (`mine` is false once it is the player's turn).
    const seen = walk(steps, steps[0]);
    expect(seen.slice(0, 2)).toEqual([first[1], second[0]]);
    expect(seen.at(-1)).toBe(steps.at(-1));
    // Skipping on from a result still leaves it on screen for its pause; from a move, at once.
    expect(nextStep(steps, first[1], mine, 1000)).toMatchObject({ step: second[0], delay: COMBAT_MS - 1000, announce: false, jump: true });
    expect(nextStep(steps, steps[0], mine, 0)).toMatchObject({ step: first[1], delay: 0 });
    // A result right after the step on screen is just the next step, not a jump.
    expect(nextStep(steps, first[0], mine, Infinity)).toMatchObject({ step: first[1], jump: false });
    // The player's own battle that they still have to see is not skipped past.
    expect(nextStep(steps, first[1], mine, Infinity, { mine: true, dismissed: false })).toBeNull();
  });

  it('carries on from where the player left off, also in steps rebuilt for the same posts', () => {
    const steps = [step(), step(), { state: structuredClone(base), post: null }, step()];
    expect(seenPost(steps, 2)).toBe(steps[1].post!.id);
    expect(resumeAt(steps, steps[1].post!.id)).toBe(1);
    expect(resumeAt(steps, 'gone')).toBe(-1);
    const rebuilt = steps.map((s) => ({ ...s }));
    expect(nextStep(rebuilt, steps[1], mine, Infinity)).toMatchObject({ step: rebuilt[2], announce: true, jump: false });
  });
});
