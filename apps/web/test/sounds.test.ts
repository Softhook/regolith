/** Sounds heard from a step: worked out from what changed, so AI and online moves sound like local ones. */
import { describe, expect, it, vi } from 'vitest';
import type { Cell, CombatOutcome, CombatPending, GameState, LogEntry } from '@regolith/engine';
import { arrange, quickStart } from '../../../packages/engine/test/helpers';
import { EXPANSION } from '../src/beats';

vi.mock('../src/sound', () => ({ sfx: {} }));
const { battleSounds, soundsFor } = await import('../src/game/sounds');

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
  it('hears a mech fly', () => {
    expect(step((s) => void (die(s, 'p0d0').loc = { zone: 'board', r: 1, c: 0 })).first).toEqual(['fly']);
  });

  it('hears a mech warp in from the reserve', () => {
    const { first, lands } = step(
      (s) => void (die(s, 'p0d1').loc = { zone: 'board', r: 2, c: 2 }),
      (s) => void (die(s, 'p0d1').loc = { zone: 'reserve' }),
    );
    expect(first).toEqual(['warpIn']);
    expect(lands).toBeUndefined();
  });

  it('hears an expansion mech land as its lance brings it', () => {
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

  it('hears two mechs trade places as a swap', () => {
    const { first } = step((s) => {
      die(s, 'p0d0').loc = { zone: 'board', r: 4, c: 4 };
      die(s, 'p0d1').loc = { zone: 'board', r: 0, c: 0 };
    });
    expect(first).toEqual(['swap']);
  });

  it('hears mechs destroyed, counting them', () => {
    const { first, destroyed } = step((s) => {
      die(s, 'p0d0').loc = { zone: 'salvageYard' };
      die(s, 'p1d0').loc = { zone: 'salvageYard' };
    });
    expect(first).toEqual(['explode']);
    expect(destroyed).toBe(2);
  });

  it('hears no explosion for a mech Unveil the Fleet or Resourceful takes off the map', () => {
    const unveil = step((s) => {
      die(s, 'p0d0').loc = { zone: 'salvageYard' };
      const e: LogEntry = { id: ++s.logCounter, player: 0, text: '', event: 'cardPlayed', card: 'r-unveil-the-fleet' };
      s.log.push(e);
      return [e];
    });
    expect(unveil.first).toEqual(['unveil']);
    expect(unveil.then).toEqual([]);
    expect(unveil.destroyed).toBe(0);

    const resourceful = step((s) => {
      die(s, 'p0d0').loc = { zone: 'salvageYard' };
      s.turn.oncePerTurn.push('resourceful');
      const e: LogEntry = { id: ++s.logCounter, player: 0, text: '', card: 'r-resourceful' };
      s.log.push(e);
      return [e];
    });
    expect(resourceful.first).toEqual(['implode']);
    expect(resourceful.destroyed).toBe(0);
  });

  it('hears a card played by the card its entry names', () => {
    expect(step((s) => [entry(s, 'cardPlayed')]).first).toEqual(['card']);
    expect(step((s) => [{ ...entry(s, 'cardPlayed'), card: 'r-change-of-heart' }]).first).toEqual(['shuffle']);
  });

  it('hears a barrier blown, and each card that blows or pushes one as its own', () => {
    const blown = (s: GameState) => void (s.barriers = [...(s.barriers ?? []), { r: 2, c: 2, owner: 0 }]);
    expect(step(blown).first).toEqual(['barrier']);
    expect(step((s) => [{ ...entry(s, 'cardPlayed'), card: 'r-barricade' }]).first).toEqual(['barrier']);
    expect(step((s) => [{ ...entry(s, 'cardPlayed'), card: 'r-kinetic-shunt' }]).first).toEqual(['shunt']);
  });

  it('hears Kinetic Shunt push a mech or a barrier as a shove rather than a flight', () => {
    const shunting = (s: GameState) => void s.pending.unshift({ kind: 'kineticShunt', player: 0 });
    expect(step((s) => void (die(s, 'p0d0').loc = { zone: 'board', r: 1, c: 0 }), shunting).first).toEqual(['shunt']);
    const barrier = step(
      (s) => void (s.barriers = [{ r: 3, c: 2, owner: 0 }]),
      (s) => {
        shunting(s);
        s.barriers = [{ r: 2, c: 2, owner: 0 }];
      },
    );
    expect(barrier.first).toEqual(['shunt']);
  });

  it('hears a new pair of tunnels, even one replacing the old pair, under which a tunnel closing is silent', () => {
    const tunnels =
      (...cells: Cell[]) =>
      (s: GameState) =>
        void (s.tunnels = cells);
    const open = tunnels({ r: 1, c: 1 }, { r: 3, c: 3 });
    expect(step(open).first).toEqual(['portal']);
    expect(step(tunnels({ r: 2, c: 2 }, { r: 3, c: 3 }), open).first).toEqual(['portal']);
    expect(step(() => {}, open).first).toEqual([]);
  });

  it('hears a card’s blow before the mechs it destroys', () => {
    const blow = (pending: Partial<GameState['pending'][number]>) =>
      step(
        (s) => {
          die(s, 'p0d0').loc = { zone: 'salvageYard' };
          die(s, 'p1d0').loc = { zone: 'salvageYard' };
        },
        (s) => void s.pending.unshift({ player: 0, ...pending } as GameState['pending'][number]),
      ).first;
    expect(blow({ kind: 'showOfForce' })).toEqual(['lance', 'explode']);
    expect(blow({ kind: 'dangerous', attacker: 'p0d0', defender: 'p1d0' })).toEqual(['arc', 'explode']);
  });

  it('hears a mech renumbered without a roll', () => {
    expect(step((s) => void (die(s, 'p0d0').value = 5)).first).toEqual(['retune']);
  });

  it('plays a Tactic’s own sound first, then its effect', () => {
    const { first, then } = step((s) => {
      s.players[0].atomics += 2;
      return [{ ...entry(s, 'cardPlayed'), card: 'r-black-market' }];
    });
    expect(first).toEqual(['coins']);
    expect(then).toEqual(['atomicLoad']);
  });

  it('hears a cube placed, from the state rather than the log', () => {
    expect(
      step((s) => {
        s.board.objectives[0].cubes.push(0);
        s.players[0].cubesLeft--;
      }).first,
    ).toEqual(['cube']);
  });

  it('hears a cube displaced as another takes its place', () => {
    const { first } = step(
      (s) => {
        s.board.objectives[0].cubes = [0];
        s.players[1].cubesLeft++;
        s.players[0].cubesLeft--;
      },
      (s) => {
        s.board.objectives[0].cubes = [1];
        s.players[1].cubesLeft--;
      },
    );
    expect(first).toEqual(['cube', 'displace']);
  });

  it('hears a cube relocated', () => {
    const { first } = step(
      (s) => {
        s.board.objectives[0].cubes = [];
        s.board.objectives[1].cubes.push(1);
      },
      (s) => void s.board.objectives[0].cubes.push(1),
    );
    expect(first).toEqual(['relocate']);
  });

  it('hears research and power gained', () => {
    const { first } = step((s) => {
      s.players[0].research++;
      s.players[0].power++;
    });
    expect(first).toEqual(['research', 'power']);
  });

  it('hears a Take Over after the kill that earned it', () => {
    const { first, then } = step((s) => {
      die(s, 'p1d0').loc = { zone: 'salvageYard' };
      s.players[0].power++;
      return [entry(s, 'infamy')];
    });
    expect(first).toEqual(['explode']);
    expect(then).toEqual(['infamy']);
    expect(step((s) => [entry(s, 'infamy')]).first).toEqual(['infamy']);
  });

  it('hears no power chime under a kill’s explosion', () => {
    const { first } = step((s) => {
      die(s, 'p1d0').loc = { zone: 'salvageYard' };
      s.players[0].power++;
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

  it('hears an atomic as an atomic, and a repelled battle only as its result showed', () => {
    expect(step((s) => [entry(s, 'atomic')]).first).toEqual(['atomic']);
    expect(step((s) => [entry(s, 'repelled')]).first).toEqual([]);
  });
});

describe('battleSounds', () => {
  const battle = (ranged?: true) => ({ attacker: { player: 0 }, defender: { player: 1 }, ranged }) as CombatPending;
  const won = { winner: 'attacker', destroyed: 'defender' } as CombatOutcome;
  const repelled = { winner: 'defender', destroyed: null } as CombatOutcome;
  const stubborn = { winner: 'defender', destroyed: 'attacker' } as CombatOutcome;
  const me = (p: number) => p === 0;

  it('hears a mech destroyed as a triumph for the winner and a defeat for the loser', () => {
    expect(battleSounds(battle(), won, me).now).toEqual(['wreck', 'triumph']);
    expect(battleSounds(battle(), won, (p) => p === 1).now).toEqual(['wreck', 'defeat']);
  });

  it('hears neither for a screen playing for both sides or for neither', () => {
    expect(battleSounds(battle(), won, () => true).now).toEqual(['wreck']);
    expect(battleSounds(battle(), won, () => false).now).toEqual(['wreck']);
  });

  it('hears a repelled attack alike on every screen', () => {
    for (const mine of [me, (p: number) => p === 1, () => false])
      expect(battleSounds(battle(), repelled, mine)).toEqual({ now: ['repel'], hit: [] });
  });

  it('hears a shot fired, then what it does as it reaches its target', () => {
    expect(battleSounds(battle(true), won, me)).toEqual({ now: ['gunshot'], hit: ['wreck', 'triumph'] });
    expect(battleSounds(battle(true), repelled, me)).toEqual({ now: ['gunshot', 'whizz'], hit: [] });
    expect(battleSounds(battle(true), stubborn, me)).toEqual({ now: ['gunshot', 'whizz'], hit: ['wreck', 'defeat'] });
  });
});
