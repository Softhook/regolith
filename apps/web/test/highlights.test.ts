/** Board highlights: everything lit up is a legal action, and every legal move or attack is lit up. */
import { describe, expect, it } from 'vitest';
import { actor, apply, conquerCheck, createGame, key, legalActions, MODES, orbitals, type GameState } from '@regolith/engine';
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
  s.turn = { ...s.turn, player: 0, phase: 'actions', actionsLeft: 3, moved: {}, abilityUsed: {}, conquests: 0, oncePerTurn: [] };
  return s;
}

describe('highlightsFor', () => {
  it('marks a planet blocked when its orbit makes the sum but an enemy ship is in it (contested orbit), and says why', () => {
    const base = quickStart(2, 1, 'regolith', 'alpha-hex');
    const planet = base.board.planets.find((q) => !q.start && !q.cubes.length)!;
    const [a, b, c] = orbitals(base.board, planet);
    const sum = { p0d0: [a.r, a.c, 6], p0d1: [b.r, b.c, planet.number - 6] } as Record<string, [number, number, number]>;
    const s = myTurn(arrange(base, { ...sum, p1d0: [c.r, c.c, 3] }));
    expect(lit(s, { kind: 'none' }).planets.get(planet.id)).toEqual({ tone: 'blocked', label: 'Blocked' });
    expect(legalFor(s).of('conquer')).toEqual([]);
    // In Regolith's words (RuleSet.words).
    expect(hintFor(s, { kind: 'none' })).toMatch(`objective ${planet.number}, but enemy mechs on the perimeter block the claim`);
    const clear = myTurn(arrange(base, sum));
    expect(lit(clear, { kind: 'none' }).planets.get(planet.id)?.tone).toBe('conquer');
    expect(hintFor(clear, { kind: 'none' })).toBe('Select a mech');
  });

  it('lights the starting planets during setup', () => {
    let g = createGame({ players: players(2), seed: 1, mode: 'basic' });
    while (g.pending[0]?.kind !== 'placeStart') g = apply(g, legalActions(g)[0]);
    const h = lit(g, { kind: 'none' }, false);
    expect([...h.planets.values()].every((p) => p.tone === 'start')).toBe(true);
    expect([...h.planets.keys()].sort()).toEqual(
      legalFor(g)
        .of('placeStart')
        .map((a) => a.planet)
        .sort(),
    );
  });

  it('lights a selected ship’s moves and attacks', () => {
    // A Tactician (3) next to an enemy Tactician.
    const s = myTurn(arrange(quickStart(2, 1, 'basic'), { p0d0: [7, 2, 3], p1d0: [7, 3, 3] }));
    const h = lit(s, { kind: 'ship', die: 'p0d0' });
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
    const h = lit(s, { kind: 'ship', die: 'p0d0' }, false);
    expect(h.cells.size + h.dice.size + h.planets.size).toBe(0);
  });

  it('lights deploy spaces for a ship in the scrapyard', () => {
    const s = myTurn(arrange(quickStart(2, 1, 'basic'), { p0d0: [7, 2, 3] }));
    const scrap = s.dice.find((d) => d.owner === 0 && d.loc.zone === 'scrapyard')!;
    expect(cellKeys(s, { kind: 'scrap', die: scrap.id })).toEqual(
      legalFor(s)
        .of('deploy', (a) => a.die === scrap.id)
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
            const h = highlightsFor(s, { kind: 'ship', die: d.id }, legal, true);
            const moves = legal.of('move', (a) => a.die === d.id).map((a) => key(a.to));
            const attacks = legal.of('attack', (a) => a.die === d.id).map((a) => a.target);
            expect([...h.cells.keys()].sort()).toEqual([...new Set(moves)].sort());
            expect([...h.dice.keys()].sort()).toEqual([...new Set(attacks)].sort());
            const conquerable = [...h.planets.entries()].filter(([, v]) => v.tone === 'conquer').map(([k]) => k);
            expect(conquerable.sort()).toEqual([...new Set(legal.of('conquer').map((a) => a.planet))].sort());
            const blocked = [...h.planets.entries()].filter(([, v]) => v.tone === 'blocked').map(([k]) => k);
            for (const p of blocked) expect(conquerCheck(s, s.turn.player, p).blocked).toBe(true);
            checked++;
          }
        },
      });
    }
    expect(checked).toBeGreaterThan(100);
  });
});
