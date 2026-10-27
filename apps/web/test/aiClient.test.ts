import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseAction, chooseCombatResponse, DEFAULT_AI_LEVEL } from '@regolith/ai';
import { createGame, legalActions } from '@regolith/engine';
import { aiLevelOf, combatResponse, think } from '../src/game/aiClient';

// The real AI, with a way to make it fail: an engine bug the AI runs into.
vi.mock('@regolith/ai', async (importOriginal) => {
  const real = await importOriginal<typeof import('@regolith/ai')>();
  return { ...real, chooseAction: vi.fn(real.chooseAction), chooseCombatResponse: vi.fn(real.chooseCombatResponse) };
});

describe('aiLevelOf', () => {
  it('keeps supported AI levels', () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(aiLevelOf({ name: 'AI', color: '#fff', ai: true, aiLevel: level })).toBe(level);
    }
  });

  it('uses the default for missing or unsupported levels', () => {
    expect(aiLevelOf({ name: 'AI', color: '#fff', ai: true })).toBe(DEFAULT_AI_LEVEL);
    for (const aiLevel of [0, 2.5, 6, Number.NaN]) {
      expect(aiLevelOf({ name: 'AI', color: '#fff', ai: true, aiLevel })).toBe(DEFAULT_AI_LEVEL);
    }
  });
});

// Without Worker (as in Node), think() runs the AI on the main thread, the path a failed worker falls back to.
describe('when the AI fails', () => {
  const game = () => createGame({ players: [0, 1].map((i) => ({ name: `AI ${i}`, color: '#fff', ai: true })), seed: 3 });
  const boom = () => {
    throw new TypeError('boom');
  };
  afterEach(() => vi.restoreAllMocks());

  it('think() plays the AI’s move when nothing fails', async () => {
    const s = game();
    const move = await think(s, 1);
    expect(move.error).toBeUndefined();
    expect(legalActions(s)).toContainEqual(move.action);
  });

  it('think() never rejects: the first legal move stands in, and the error is reported', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(chooseAction).mockImplementationOnce(boom);
    const s = game();
    const move = await think(s, 3);
    expect(move.action).toEqual(legalActions(s)[0]);
    expect(move.error).toMatch(/Engine error in the AI: boom/);
    expect(console.error).toHaveBeenCalled();
  });

  it('think() has no stand-in when the engine fails too, and still settles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(chooseAction).mockImplementationOnce(boom);
    const broken = { ...game(), dice: null } as never;
    await expect(think(broken, 3)).resolves.toMatchObject({ action: null, error: expect.stringMatching(/boom/) });
  });

  it('combatResponse() passes, and reports the error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(chooseCombatResponse).mockImplementationOnce(boom);
    const move = combatResponse(game(), 0, 3);
    expect(move.action).toBeNull();
    expect(move.error).toMatch(/boom/);
  });
});
