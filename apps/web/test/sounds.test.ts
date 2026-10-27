/** Sounds heard from a step: worked out from what changed, so AI and online moves sound like local ones. */
import { describe, expect, it, vi } from 'vitest';
import type { GameState, LogEntry } from '@regolith/engine';
import { arrange, quickStart } from '../../../packages/engine/test/helpers';
import { EXPANSION } from '../src/beats';

vi.mock('../src/sound', () => ({ sfx: {} }));
const { soundsFor } = await import('../src/game/sounds');

const start = () => arrange(quickStart(2, 1, 'basic'), { p0d0: [0, 0, 6], p0d1: [4, 4, 2], p1d0: [0, 1, 3] });
const die = (s: GameState, id: string) => s.dice.find((d) => d.id === id)!;
const entry = (s: GameState, event: LogEntry['event']): LogEntry => ({ id: s.logCounter + 1, text: '', event });

/** `change` turns the step's start (after `setup`) into its end. */
function step(change: (s: GameState) => LogEntry[] | void, setup?: (s: GameState) => void, mine?: (p: number) => boolean) {
  const prev = start();
  setup?.(prev);
  const next = structuredClone(prev);
  const fresh = change(next) ?? [];
  return soundsFor(prev, next, fresh, mine);
}

/** Player 1 wins. */
const victory = (s: GameState) => {
  s.phase = 'over';
  s.winner = 1;
  return [entry(s, 'victory')];
};

describe('soundsFor', () => {
  it('hears a ship fly', () => {
    expect(step((s) => void (die(s, 'p0d0').loc = { zone: 'board', r: 1, c: 0 })).first).toEqual(['fly']);
  });

  it('hears a ship warp in from the reserve', () => {
    const { first, lands } = step(
      (s) => void (die(s, 'p0d1').loc = { zone: 'board', r: 2, c: 2 }),
      (s) => void (die(s, 'p0d1').loc = { zone: 'reserve' }),
    );
    expect(first).toEqual(['warpIn']);
    expect(lands).toBeUndefined();
  });

  it('hears an expansion ship land as its lance brings it', () => {
    const { first, lands } = step(
      (s) => void (die(s, 'p0d1').loc = { zone: 'board', r: 2, c: 2 }),
      (s) => {
        die(s, 'p0d1').loc = { zone: 'reserve' };
        s.pending.unshift({ kind: 'placeExpansion', player: 0, die: 'p0d1' });
      },
    );
    expect(first).toEqual([]);
    expect(lands).toBe(EXPANSION.strike);
  });

  it('hears two ships trade places as a swap', () => {
    const { first } = step((s) => {
      die(s, 'p0d0').loc = { zone: 'board', r: 4, c: 4 };
      die(s, 'p0d1').loc = { zone: 'board', r: 0, c: 0 };
    });
    expect(first).toEqual(['swap']);
  });

  it('hears ships destroyed, counting them', () => {
    const { first, destroyed } = step((s) => {
      die(s, 'p0d0').loc = { zone: 'scrapyard' };
      die(s, 'p1d0').loc = { zone: 'scrapyard' };
    });
    expect(first).toEqual(['explode']);
    expect(destroyed).toBe(2);
  });

  it('hears no explosion for a ship Unveil the Fleet or Resourceful takes off the map', () => {
    const unveil = step((s) => {
      die(s, 'p0d0').loc = { zone: 'scrapyard' };
      const e: LogEntry = { id: ++s.logCounter, player: 0, text: '', event: 'cardPlayed', card: 'r-unveil-the-fleet' };
      s.log.push(e);
      return [e];
    });
    expect(unveil.first).toEqual(['unveil']);
    expect(unveil.then).toEqual([]);
    expect(unveil.destroyed).toBe(0);

    const resourceful = step((s) => {
      die(s, 'p0d0').loc = { zone: 'scrapyard' };
      s.turn.oncePerTurn.push('resourceful');
      const e: LogEntry = { id: ++s.logCounter, player: 0, text: '', card: 'r-resourceful' };
      s.log.push(e);
      return [e];
    });
    expect(resourceful.first).toEqual(['skill']);
    expect(resourceful.destroyed).toBe(0);
  });

  it('still hears a card played when its discards were shuffled back into the deck', () => {
    expect(step((s) => [entry(s, 'cardPlayed')]).first).toEqual(['card']);
    expect(step((s) => [{ ...entry(s, 'cardPlayed'), card: 'r-change-of-heart' }]).first).toEqual(['shuffle']);
  });

  it('hears a ship renumbered without a roll', () => {
    expect(step((s) => void (die(s, 'p0d0').value = 5)).first).toEqual(['retune']);
  });

  it('plays a Tactic’s own sound first, then its effect', () => {
    const { first, then } = step((s) => {
      s.market.tacticDiscard.push('r-black-market');
      s.players[0].missiles += 2;
      return [entry(s, 'cardPlayed')];
    });
    expect(first).toEqual(['coins']);
    expect(then).toEqual(['missileLoad']);
  });

  it('hears a cube placed, from the state rather than the log', () => {
    expect(
      step((s) => {
        s.board.planets[0].cubes.push(0);
        s.players[0].cubesLeft--;
      }).first,
    ).toEqual(['cube']);
  });

  it('hears a cube displaced as another takes its place', () => {
    const { first } = step(
      (s) => {
        s.board.planets[0].cubes = [0];
        s.players[1].cubesLeft++;
        s.players[0].cubesLeft--;
      },
      (s) => {
        s.board.planets[0].cubes = [1];
        s.players[1].cubesLeft--;
      },
    );
    expect(first).toEqual(['cube', 'displace']);
  });

  it('hears a cube relocated', () => {
    const { first } = step(
      (s) => {
        s.board.planets[0].cubes = [];
        s.board.planets[1].cubes.push(1);
      },
      (s) => void s.board.planets[0].cubes.push(1),
    );
    expect(first).toEqual(['relocate']);
  });

  it('hears research and dominance gained', () => {
    const { first } = step((s) => {
      s.players[0].research++;
      s.players[0].dominance++;
    });
    expect(first).toEqual(['research', 'dominance']);
  });

  it('hears no dominance chime under a kill’s explosion', () => {
    const { first } = step((s) => {
      die(s, 'p1d0').loc = { zone: 'scrapyard' };
      s.players[0].dominance++;
    });
    expect(first).toEqual(['explode']);
  });

  it('plays the fanfare for the winner, and for a screen that plays for nobody (an onlooker)', () => {
    expect(step(victory, undefined, (p) => p === 1).first).toEqual(['win']);
    expect(step(victory, undefined, () => false).first).toEqual(['win']);
  });

  it('plays the lament for a screen whose players all lost', () => {
    expect(step(victory, undefined, (p) => p === 0).first).toEqual(['lose']);
  });
});
