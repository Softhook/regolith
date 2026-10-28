import { describe, expect, it } from 'vitest';
import {
  apply,
  barrierAt,
  legalActions,
  otherGate,
  buildBoard,
  cellAt,
  checkInvariants,
  createGame,
  key,
  linked,
  MAPS,
  mapStats,
  orbitals,
  spaces,
  STARTING_SHIPS,
} from '../src';
import { startingGround, startSpace } from '../src/board';
import { playAiGame, players, quickStart } from './helpers';

describe('maps', () => {
  for (const map of MAPS)
    it(`${map.name} (${map.players}p): stats match its layout`, () => {
      expect(mapStats(map)).toEqual(map.stats);
      expect(map.layout.flat().filter((t) => t.endsWith('*')).length).toBeGreaterThanOrEqual(map.players);
      expect(() => buildBoard(map)).not.toThrow();
    });
});

describe("prepared ground (a map's `start`)", () => {
  const prepared = MAPS.filter((m) => m.start);

  it('has maps with a tunnel and maps with barriers', () => {
    expect(prepared.some((m) => m.start?.tunnel)).toBe(true);
    expect(prepared.some((m) => m.start?.wormhole)).toBe(true);
    expect(prepared.some((m) => m.start?.barriers)).toBe(true);
  });

  for (const map of prepared) {
    describe(map.name, () => {
      const game = () => createGame({ players: players(map.players), seed: 1, mode: 'regolith', mapId: map.id });

      it('starts the game with its tunnel and barriers on spaces, owned by nobody', () => {
        const s = game();
        expect(s.gates).toHaveLength(map.start?.tunnel?.length ?? 0);
        expect(s.wormhole ?? []).toHaveLength(map.start?.wormhole?.length ?? 0);
        expect(s.barriers ?? []).toHaveLength(map.start?.barriers?.length ?? 0);
        for (const b of s.barriers ?? []) expect(b.owner).toBeNull();
        expect(checkInvariants(s)).toEqual([]);
      });

      it("leaves every start its ships' room", () => {
        const s = game();
        for (const p of s.board.planets.filter((x) => x.start))
          expect(orbitals(s.board, p).filter((c) => !barrierAt(s, c)).length, `objective ${p.number}`).toBeGreaterThanOrEqual(
            STARTING_SHIPS,
          );
      });

      it('lets every start reach every objective, through the tunnel if need be', () => {
        const s = game();
        for (const home of s.board.planets.filter((x) => x.start)) {
          const seen = new Set<string>();
          const queue = orbitals(s.board, home).filter((c) => !barrierAt(s, c));
          for (const c of queue) seen.add(key(c));
          for (let i = 0; i < queue.length; i++)
            for (const n of linked(s, queue[i])) {
              if (cellAt(s.board, n)?.kind !== 'space' || barrierAt(s, n) || seen.has(key(n))) continue;
              seen.add(key(n));
              queue.push(n);
            }
          for (const p of s.board.planets)
            expect(
              orbitals(s.board, p).some((c) => seen.has(key(c))),
              `objective ${p.number} from the start at ${home.id}`,
            ).toBe(true);
        }
      });

      it('plays out, with the card rules, to a winner', () => {
        const g = playAiGame({ mode: 'regolith', players: map.players, seed: 3, aiSeed: 3, mapId: map.id });
        expect(g.state.phase).toBe('over');
        expect(checkInvariants(g.state)).toEqual([]);
      });
    });
  }

  it("lets the Ice Tunnel tactic close the map's own tunnel and open another (RULES.md ruling 15)", () => {
    const s = quickStart(2, 1, 'regolith', 'ice-run');
    const was = s.gates.map(key);
    expect(was).toHaveLength(2);
    const [a, b] = spaces(s.board).filter((c) => !was.includes(key(c)) && !barrierAt(s, c));
    s.pending.unshift({ kind: 'warpGate', player: s.turn.player, placed: [] });
    const t = apply(apply(s, { type: 'warpGate', cell: a }), { type: 'warpGate', cell: b });
    expect(t.gates.map(key)).toEqual([key(a), key(b)]);
  });

  it("keeps a map's wormhole when the Ice Tunnel tactic opens a tunnel, and won't land on it", () => {
    const s = quickStart(2, 1, 'regolith', 'two-arcs');
    const hole = s.wormhole!.map(key);
    expect(hole).toHaveLength(2);
    expect(s.gates).toEqual([]);
    s.pending.unshift({ kind: 'warpGate', player: s.turn.player, placed: [] });
    expect(legalActions(s).some((a) => a.type === 'warpGate' && hole.includes(key(a.cell)))).toBe(false);
    expect(() => apply(s, { type: 'warpGate', cell: s.wormhole![0] })).toThrow(/wormhole/);
    const [a, b] = spaces(s.board).filter((c) => !hole.includes(key(c)) && !barrierAt(s, c));
    const t = apply(apply(s, { type: 'warpGate', cell: a }), { type: 'warpGate', cell: b });
    expect(t.wormhole!.map(key)).toEqual(hole);
    expect(otherGate(t, s.wormhole![0])).toEqual(s.wormhole![1]);
    expect(otherGate(t, a)).toEqual(b);
    expect(checkInvariants(t)).toEqual([]);
  });

  it("refuses a space that is a tile's objective, a tile that is not there, and an odd tunnel", () => {
    const alpha = MAPS.find((m) => m.id === 'alpha-hex')!;
    expect(() => startSpace(alpha, '0:1:m')).toThrow(/objective/);
    expect(() => startSpace(alpha, '9:9:n')).toThrow(/no tile/);
    expect(() => startSpace(alpha, 'nonsense')).toThrow(/row:col:side/);
    expect(() => startingGround({ ...alpha, start: { tunnel: ['0:1:n'] } })).toThrow(/pair/);
    expect(() => startingGround({ ...alpha, start: { tunnel: ['0:1:n', '4:1:s'], barriers: ['0:1:n'] } })).toThrow(/one space/);
  });
});
