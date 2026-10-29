import { describe, expect, it } from 'vitest';
import { lessons } from '../src/tutorial/lessons';

describe('the learn-to-play lessons', () => {
  const all = lessons();

  it('play legally through the engine, fights going the way the captions say', () => {
    expect(all.map((l) => l.id)).toEqual(['goal', 'mechs', 'board', 'move', 'claim', 'fight', 'holding', 'powers', 'takeover']);
    for (const l of all) {
      expect(l.starts.length, l.id).toBeGreaterThan(0);
      expect(
        l.frames.every((f) => f.wait > 0),
        l.id,
      ).toBe(true);
    }
  });

  it('claim a cube, win a fight and take over where the lessons say', () => {
    const last = (id: string) => all.find((l) => l.id === id)!.frames.at(-1)!.game;
    expect(last('claim').board.planets[2].cubes).toEqual([0]);
    expect(last('fight').players[0].dominance).toBe(2);
    expect(last('powers').barriers).toHaveLength(1);
    expect(last('takeover').board.planets[2].cubes).toEqual([0]);
    expect(last('takeover').players[0].dominance).toBe(1);
  });
});
