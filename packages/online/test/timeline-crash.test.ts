/**
 * An engine bug met while replaying (anything but a RuleError) is not the poster's mistake: the
 * timeline reports it as a `crash`, not a desync, and logs it once. A file of its own, because it
 * swaps in an engine that fails on a marked move, or on battles once told to.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseAction } from '@regolith/ai';
import { actor, legalActions, type Action, type PlayerConfig } from '@regolith/engine';
import { Timeline, type Body } from '../src';
import { create, post, seat } from './helpers';

const engine = vi.hoisted(() => ({ failBattles: false }));

// The real engine, except that it fails (as a bug would) on an action marked `crash`, and on battles while `failBattles`.
vi.mock('@regolith/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('@regolith/engine')>();
  return {
    ...real,
    apply: (s: Parameters<typeof real.apply>[0], a: Action) => {
      if ((a as { crash?: boolean }).crash || (engine.failBattles && a.type === 'resolveCombat')) throw new TypeError('engine bug');
      return real.apply(s, a);
    },
  };
});

const crashing = (s: number): Body => ({ t: 'act', seat: s, action: { type: 'setupKeep', crash: true } as Action });

function game(players: PlayerConfig[], open: number[] = []) {
  const t = new Timeline();
  const g = create('alice', players, open);
  t.add(g);
  return { t, g };
}

describe('a move the engine crashes on', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    engine.failBattles = false;
  });

  it('stops the game as a crash, not as the poster’s mistake, and is logged once', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { t, g } = game([seat('Alice'), seat('Bob')], [1]);
    t.add(post('alice', crashing(0), g.id));
    expect(t.replay()!.steps).toHaveLength(1);
    expect(t.replay()!.crash).toEqual({ seat: 0 });
    expect(t.replay()!.desync).toBeNull();
    // Another post at the tip, and a claim that replays the game from the start: both pass the crash again.
    t.add(post('alice', { t: 'act', seat: 0, action: { type: 'warpDrive' } as unknown as Action }, g.id));
    t.add(post('bob', { t: 'claim', seat: 1, name: 'Bob' }));
    expect(t.replay()!.seats[1].owner).toBe('bob');
    expect(t.replay()!.crash).toEqual({ seat: 0 });
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith('[game] the engine failed on a move', expect.objectContaining({ error: expect.any(TypeError) }));
  });

  it('is reported for an AI seat too, where a refused move is not', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    /** Alice keeps her fleet; then it is the AI seat's turn to choose, and Alice's browser moves it. */
    const aiToMove = () => {
      const { t, g } = game([seat('Alice'), seat('Bot', true)]);
      const keep = post('alice', { t: 'act', seat: 0, action: { type: 'setupKeep' } }, g.id);
      t.add(keep);
      expect(actor(t.replay()!.steps.at(-1)!.state)).toBe(1);
      return { t, after: keep.id };
    };
    const refused = aiToMove();
    refused.t.add(post('alice', { t: 'act', seat: 1, action: { type: 'warpDrive' } as unknown as Action }, refused.after));
    expect(refused.t.replay()!.desync).toBeNull();
    expect(refused.t.replay()!.crash).toBeNull();

    const crashed = aiToMove();
    crashed.t.add(post('alice', crashing(1), crashed.after));
    expect(crashed.t.replay()!.crash).toEqual({ seat: 1 });
  });

  it('doesn’t stop the game when a rival post the engine takes comes next', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { t, g } = game([seat('Alice'), seat('Bot', true)]);
    t.add(post('alice', crashing(0), g.id));
    expect(t.replay()!.crash).toEqual({ seat: 0 });
    t.add(post('alice', { t: 'act', seat: 0, action: { type: 'setupKeep' } }, g.id));
    expect(t.replay()!.steps).toHaveLength(2);
    expect(t.replay()!.crash).toBeNull();
  });
});

describe('a battle the engine crashes on', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    engine.failBattles = false;
  });

  it('stops the game as a crash with no seat to blame, and is logged', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { t, g } = game([seat('Alice'), seat('Bot', true)]);
    let tip = g.id;
    // Basic has no missiles or cards, so a battle resolves as soon as it is declared.
    for (let i = 0; i < 2000 && !t.replay()!.crash; i++) {
      const s = t.replay()!.steps.at(-1)!.state;
      if (s.phase === 'over') break;
      const attack = legalActions(s).find((a) => a.type === 'attack');
      engine.failBattles = !!attack;
      const p = post('alice', { t: 'act', seat: actor(s), action: attack ?? chooseAction(s, { level: 1, samples: 1 })! }, tip);
      t.add(p);
      tip = t.replay()!.tip;
    }
    expect(t.replay()!.crash).toEqual({ seat: null });
    expect(t.replay()!.combat?.waitingOn).toEqual([]);
    expect(errors).toHaveBeenCalledWith('[game] a battle failed to resolve', expect.objectContaining({ error: expect.any(TypeError) }));
  });
});
