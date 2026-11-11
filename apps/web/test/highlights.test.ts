/** Board highlights: everything lit up is a legal action, and every legal move or attack is lit up. */
import { describe, expect, it } from 'vitest';
import { actor, apply, claimCheck, createGame, key, legalActions, MODES, perimeterSpaces, type GameState } from '@regolith/engine';
import { arrange, playAiGame, players, quickStart } from '../../../packages/engine/test/helpers';
import { highlightsFor } from '../src/game/highlights';
import { hintFor } from '../src/game/hints';
import { legalFor } from '../src/game/legal';
import type { Sel } from '../src/game/controller';

const lit = (s: GameState, sel: Sel, actionPhase = true) => highlightsFor(s, sel, legalFor(s), actionPhase);
const cellKeys = (s: GameState, sel: Sel) => [...lit(s, sel).cells.keys()].sort();

/** Player 0 to act, with 3 fresh actions. */
function myTurn(s: GameState): GameState {
  s = structuredClone(s);
  s.turn = { ...s.turn, player: 0, phase: 'actions', actionsLeft: 3, moved: {}, abilityUsed: {}, claims: 0, oncePerTurn: [] };
  return s;
}

describe('highlightsFor', () => {
  it('marks an objective blocked when its perimeter makes the sum but an enemy mech is in it (contested perimeter), and says why', () => {
    const base = quickStart(2, 1, 'regolith', 'alpha-hex');
    const objective = base.board.objectives.find((q) => !q.start && !q.cubes.length)!;
    const [a, b, c] = perimeterSpaces(base.board, objective);
    const sum = { p0d0: [a.r, a.c, 6], p0d1: [b.r, b.c, objective.number - 6] } as Record<string, [number, number, number]>;
    const s = myTurn(arrange(base, { ...sum, p1d0: [c.r, c.c, 3] }));
    expect(lit(s, { kind: 'none' }).objectives.get(objective.id)).toEqual({ tone: 'blocked', label: 'Blocked' });
    expect(legalFor(s).of('claim')).toEqual([]);
    // In Regolith's words (RuleSet.words).
    expect(hintFor(s, { kind: 'none' })).toMatch(`objective ${objective.number}, but enemy mechs on the perimeter block the claim`);
    const clear = myTurn(arrange(base, sum));
    expect(lit(clear, { kind: 'none' }).objectives.get(objective.id)?.tone).toBe('claim');
    expect(hintFor(clear, { kind: 'none' })).toBe('Select a mech');
  });

  it('lights the starting objectives during setup', () => {
    let g = createGame({ players: players(2), seed: 1, mode: 'basic' });
    while (g.pending[0]?.kind !== 'placeStart') g = apply(g, legalActions(g)[0]);
    const h = lit(g, { kind: 'none' }, false);
    expect([...h.objectives.values()].every((p) => p.tone === 'start')).toBe(true);
    expect([...h.objectives.keys()].sort()).toEqual(
      legalFor(g)
        .of('placeStart')
        .map((a) => a.objective)
        .sort(),
    );
  });

  it('lights a selected mech’s moves and attacks', () => {
    // A Tactician (3) next to an enemy Tactician.
    const s = myTurn(arrange(quickStart(2, 1, 'basic'), { p0d0: [7, 2, 3], p1d0: [7, 3, 3] }));
    const h = lit(s, { kind: 'mech', die: 'p0d0' });
    expect(h.dice.get('p1d0')).toBe('attack');
    expect([...h.cells.keys()].sort()).toEqual(
      legalFor(s)
        .of('move', (a) => a.die === 'p0d0')
        .map((a) => key(a.to))
        .sort(),
    );
    expect(h.cells.size).toBeGreaterThan(0);
  });

  it('lights nothing for a human outside a decision or the action phase', () => {
    const s = myTurn(arrange(quickStart(2, 1, 'basic'), { p0d0: [7, 2, 3] }));
    const h = lit(s, { kind: 'mech', die: 'p0d0' }, false);
    expect(h.cells.size + h.dice.size + h.objectives.size).toBe(0);
  });

  it('lights drop spaces for a mech in the salvage yard', () => {
    const s = myTurn(arrange(quickStart(2, 1, 'basic'), { p0d0: [7, 2, 3] }));
    const salvage = s.dice.find((d) => d.owner === 0 && d.loc.zone === 'salvageYard')!;
    expect(cellKeys(s, { kind: 'salvage', die: salvage.id })).toEqual(
      legalFor(s)
        .of('drop', (a) => a.die === salvage.id)
        .map((a) => key(a.to))
        .sort(),
    );
  });

  it('highlights candidate mechs and allows switching during Kinetic Shunt', () => {
    const base = quickStart(2, 1, 'regolith', 'alpha-hex');
    const s = arrange(base, { p0d0: [4, 4, 3], p1d0: [4, 5, 2] });
    s.pending.unshift({ kind: 'kineticShunt', player: 0 });

    const unselected = lit(s, { kind: 'none' }, false);
    expect(unselected.dice.get('p0d0')).toBe('target');
    expect(unselected.dice.get('p1d0')).toBe('target');

    const selected = lit(s, { kind: 'kineticShunt', die: 'p1d0' }, false);
    expect(selected.dice.get('p1d0')).toBe('target');
    expect(selected.dice.get('p0d0')).toBe('target');
    expect(selected.cells.size).toBeGreaterThan(0);
  });

  it('matches the legal actions in every action-phase position of full AI games', () => {
    let checked = 0;
    for (const { id: mode } of MODES) {
      playAiGame({
        mode,
        players: 2,
        seed: 7,
        aiSeed: 7,
        before: (s) => {
          if (s.phase !== 'play' || s.pending.length || s.turn.phase !== 'actions') return;
          const legal = legalFor(s);
          for (const d of s.dice) {
            if (d.owner !== actor(s) || d.loc.zone !== 'board') continue;
            const h = highlightsFor(s, { kind: 'mech', die: d.id }, legal, true);
            const moves = legal.of('move', (a) => a.die === d.id).map((a) => key(a.to));
            const attacks = legal.of('attack', (a) => a.die === d.id).map((a) => a.target);
            expect([...h.cells.keys()].sort()).toEqual([...new Set(moves)].sort());
            expect([...h.dice.keys()].sort()).toEqual([...new Set(attacks)].sort());
            const claimable = [...h.objectives.entries()].filter(([, v]) => v.tone === 'claim').map(([k]) => k);
            expect(claimable.sort()).toEqual([...new Set(legal.of('claim').map((a) => a.objective))].sort());
            const blocked = [...h.objectives.entries()].filter(([, v]) => v.tone === 'blocked').map(([k]) => k);
            for (const p of blocked) expect(claimCheck(s, s.turn.player, p).blocked).toBe(true);
            checked++;
          }
        },
      });
    }
    expect(checked).toBeGreaterThan(100);
  });
});
