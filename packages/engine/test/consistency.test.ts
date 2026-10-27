/**
 * Cross-checks between the engine's parts, over every state of seeded AI-vs-AI games:
 *
 * - sound:    every action legalActions() offers is accepted by apply().
 * - complete: every action apply() accepts is offered by legalActions(), checked by brute force:
 *             answers to every decision over all players, sides, cards, planets and cells
 *             (decisions.ts), and phase-1 actions over all dice × cells × targets on a sample of
 *             states (DEEP=1: all states).
 * - invariants hold after every action, and the checker itself notices broken states.
 * - the AI's shortcuts agree with what they stand for: shipReach with moveIndexes, and
 *   decisionCandidates with legalActions.
 *
 * The UI and the AI only offer what legalActions() returns, so a failure here is a move a
 * player could not make, or one the engine would refuse.
 */
import { describe, expect, it } from 'vitest';
import {
  adjacent,
  cellOf,
  checkInvariants,
  decisionCandidates,
  distance,
  legalActions,
  moveIndexes,
  moveOptions,
  MODES,
  movePath,
  shipReach,
  shipsByIndex,
  shipsOnBoard,
  spaces,
  stepNeighbours,
  tryApply,
  type Action,
  type GameMode,
  type GameState,
} from '../src';
import { bruteForceDecision, keyOf } from './decisions';
import { playAiGame, quickStart } from './helpers';
import { registerOffsetMaps } from './offsetMaps';

registerOffsetMaps();

const DEEP = !!process.env.DEEP;

describe('action comparison', () => {
  it('distinguishes moves to different nested cells', () => {
    expect(keyOf({ type: 'move', die: 'p0d0', to: { r: 1, c: 2 } })).not.toBe(keyOf({ type: 'move', die: 'p0d0', to: { r: 1, c: 3 } }));
  });
});

/** Every phase-1 action worth trying in this state, legal or not. */
function bruteForce(s: GameState, withCarry: boolean): Action[] {
  const me = s.turn.player;
  const cells = spaces(s.board);
  const mine = s.dice.filter((d) => d.owner === me);
  const onBoard = s.dice.filter((d) => d.loc.zone === 'board');
  const out: Action[] = [{ type: 'endTurn' }, { type: 'research' }, { type: 'composed' }, { type: 'ambitious' }];
  for (const p of s.board.planets) {
    out.push({ type: 'conquer', planet: p.id });
    for (const pl of s.players) if (pl.id !== me) out.push({ type: 'conquer', planet: p.id, replace: pl.id });
  }
  for (const card of s.players[me].storedTactics ?? []) out.push({ type: 'playStoredTactic', card });
  for (const d of mine) {
    out.push(
      { type: 'reconfigure', die: d.id },
      { type: 'change', die: d.id, value: 3 },
      { type: 'change', die: d.id, value: 5 },
      { type: 'flexible', die: d.id, delta: 1 },
      { type: 'flexible', die: d.id, delta: -1 },
      { type: 'resourceful', die: d.id },
    );
    for (const to of cells)
      out.push(
        { type: 'move', die: d.id, to },
        { type: 'deploy', die: d.id, to },
        { type: 'tactical', die: d.id, to },
        { type: 'power', die: d.id, to },
      );
    for (const o of onBoard) {
      out.push({ type: 'power', die: d.id, target: o.id });
      if (o.owner === me) out.push({ type: 'swap', die: d.id, other: o.id });
      else
        out.push(
          { type: 'attack', die: d.id, target: o.id },
          // Next to the target, or on a Warp Gate: an attack through the gate goes in from the other end.
          ...[...stepNeighbours(s, cellOf(o)!), ...s.gates].map((from) => ({
            type: 'attack' as const,
            die: d.id,
            target: o.id,
            from,
          })),
          { type: 'freeAttack', die: d.id, target: o.id },
          { type: 'tactical', die: d.id, target: o.id },
        );
    }
    const at = d.loc;
    if (withCarry && d.value === 2 && at.zone === 'board') {
      // Only spaces within reach can be destinations or drops (range 2, +1 for Agile, +1 to drop).
      const near = cells.filter((c) => distance(c, at) <= 4);
      for (const p of mine) {
        if (p.id === d.id || p.loc.zone !== 'board') continue;
        for (const to of near)
          for (const drop of adjacent(s.board, to)) {
            out.push({ type: 'carry', die: d.id, passenger: p.id, to, drop });
            out.push({ type: 'tactical', die: d.id, passenger: p.id, to, drop });
          }
      }
    }
  }
  return out;
}

function playChecked(mode: GameMode, players: number, seed: number, mapId?: string) {
  playAiGame({
    mode,
    players,
    seed,
    mapId,
    aiSeed: seed * 31,
    before: (s, step) => {
      const where = `step ${step}`;
      const legal = legalActions(s, { includeCarry: true });
      for (const a of legal) expect(tryApply(s, a), `${where}: legal but refused: ${keyOf(a)}`).not.toBeNull();

      const tried = decisionCandidates(s).filter((a) => tryApply(s, a));
      expect(tried.map(keyOf), `${where}: decisionCandidates`).toEqual(legalActions(s).map(keyOf));
      const at = shipsByIndex(s);
      for (const d of shipsOnBoard(s)) {
        const { moves, attacks } = moveIndexes(s, d.id);
        const fast = shipReach(s, d, at);
        const marked = [...fast.moves.keys()].filter((i) => fast.moves[i]);
        expect(marked, `${where}: shipReach moves of ${d.id}`).toEqual([...moves.keys()].sort((a, b) => a - b));
        expect(fast.count).toBe(moves.size);
        expect(fast.attacks.map((x) => x.id).sort(), `${where}: shipReach attacks of ${d.id}`).toEqual([...attacks.keys()].sort());
        // The board draws the way to every space an attack goes in from (movePath): it must find one.
        // Moves too, which ask the same search. Sampled, like the brute force below.
        if (!DEEP && step % 4) continue;
        const opts = moveOptions(s, d.id);
        const ends = [...opts.moves.values()].map((m) => m.cell);
        for (const x of opts.attacks.values()) for (const l of x.launches) ends.push(l.from);
        for (const to of ends) expect(movePath(s, d.id, to).length, `${where}: movePath of ${d.id} to ${to.r},${to.c}`).toBeGreaterThan(0);
      }

      // Decisions are cheap to brute-force, so every one is. Phase-1 actions are slow, so their states
      // are sampled (`DEEP=1 npx vitest run consistency` checks every state of more games).
      const actionPhase = s.phase === 'play' && !s.pending.length && s.turn.phase === 'actions';
      const deciding = s.phase !== 'over' && s.pending.length > 0;
      if (deciding || (actionPhase && (DEEP || step % 4 === 0))) {
        const offered = new Set(legal.map(keyOf));
        for (const a of deciding ? bruteForceDecision(s) : bruteForce(s, DEEP || step % 20 === 0)) {
          if (offered.has(keyOf(a))) continue;
          // An attack without `from` is shorthand for the nearest space: accepted exactly when one is offered.
          if (a.type === 'attack' && !a.from) {
            const any = legal.some((x) => x.type === 'attack' && x.die === a.die && x.target === a.target);
            expect(tryApply(s, a) !== null, `${where}: attack shorthand: ${keyOf(a)}`).toBe(any);
            continue;
          }
          expect(tryApply(s, a), `${where}: accepted but not offered: ${keyOf(a)}`).toBeNull();
        }
      }
    },
    after: (s, action, step) => expect(checkInvariants(s), `step ${step}: after ${keyOf(action)}`).toEqual([]),
  });
}

describe('legal actions agree with the engine', () => {
  for (const { id: mode } of MODES)
    for (const [players, seed] of DEEP
      ? [
          [2, 21],
          [3, 22],
          [4, 23],
        ]
      : [[3, 22]])
      it(`${mode}, ${players} players, seed ${seed}`, () => playChecked(mode, players, seed), DEEP ? 600_000 : 60_000);
  // The open-ground and off-centre maps: blank tiles, and orbits that overlap, cross tiles and lose spaces at the edge.
  for (const { id: mode } of MODES)
    for (const [players, mapId] of DEEP
      ? ([
          [2, 'arcadia-planitia'],
          [3, 'stickney-crater'],
          [2, 'twin-drift'],
          [2, 'offset-hex'],
        ] as const)
      : ([[2, 'offset-hex']] as const))
      it(`${mode} on ${mapId}, seed 22`, () => playChecked(mode, players, 22, mapId), DEEP ? 600_000 : 60_000);
});

describe('invariant checker', () => {
  const fresh = () => quickStart(2, 5);

  it('accepts a fresh game', () => {
    expect(checkInvariants(fresh())).toEqual([]);
  });

  it('notices two ships on one space', () => {
    const s = fresh();
    const [a, b] = s.dice.filter((d) => d.loc.zone === 'board');
    b.loc = { ...a.loc };
    expect(checkInvariants(s).join()).toMatch(/two mechs/);
  });

  it('notices a lost card', () => {
    const s = fresh();
    s.market.skillRow.pop();
    expect(checkInvariants(s).join()).toMatch(/card .* expected/);
  });

  it('notices a cube appearing from nowhere', () => {
    const s = fresh();
    s.players[0].cubesLeft++;
    expect(checkInvariants(s).join()).toMatch(/cubes placed/);
  });
});
