/** The players' game stats (PlayerState.stats): each event counted once, for the right players, and the totals agreeing. */
import { describe, expect, it } from 'vitest';
import { apply, MODES, type GameState, type PlayerStats } from '../src';
import { setSkills, toRow } from './audit';
import { arrange, playAiGame, quickStart } from './helpers';

const sum = (all: (PlayerStats | undefined)[], k: keyof PlayerStats) => all.reduce((n, st) => n + (st?.[k] ?? 0), 0);

/** What changed in each player's stats from `before` to `after`, leaving out what didn't. */
function gained(before: GameState, after: GameState) {
  return after.players.map((p, i) =>
    Object.fromEntries(
      Object.entries(p.stats!)
        .filter(([k, v]) => v !== before.players[i].stats![k as keyof PlayerStats])
        .map(([k, v]) => [k, v - before.players[i].stats![k as keyof PlayerStats]]),
    ),
  );
}

/** Player 0's ship p0d0 attacks player 1's p1d0 with fixed combat rolls (the lower total wins); `foe`: player 1's skills. */
function battle(attackerWins: boolean, foe: string[] = []) {
  const before = arrange(quickStart(2, 5), { p0d0: [7, 2, 3], p1d0: [7, 3, 3] });
  before.turn.player = 0;
  setSkills(before, 1, foe);
  let s = apply(before, { type: 'attack', die: 'p0d0', target: 'p1d0' });
  if (s.pending[0]?.kind === 'combat') {
    s.pending[0].attacker.dice = [attackerWins ? 1 : 6];
    s.pending[0].defender.dice = [attackerWins ? 6 : 1];
    s = apply(s, { type: 'resolveCombat' });
  }
  return { before, s };
}

describe('game stats', () => {
  it('start at zero for every player', () => {
    for (const p of quickStart(3, 1).players)
      expect(p.stats).toEqual({ battlesWon: 0, battlesLost: 0, shipsDestroyed: 0, shipsLost: 0, planetsTaken: 0, cardsTaken: 0 });
  });

  it('count a battle won by the attacker, and the ship it destroyed', () => {
    const { before, s } = battle(true);
    expect(gained(before, s)).toEqual([
      { battlesWon: 1, shipsDestroyed: 1 },
      { battlesLost: 1, shipsLost: 1 },
    ]);
  });

  it('count a repelled attack as a battle won by the defender, with no ship lost', () => {
    const { before, s } = battle(false);
    expect(gained(before, s)).toEqual([{ battlesLost: 1 }, { battlesWon: 1 }]);
  });

  it('count a Stubborn defender destroying the attacker', () => {
    const { before, s } = battle(false, ['r-stubborn']);
    expect(gained(before, s)).toEqual([
      { battlesLost: 1, shipsLost: 1 },
      { battlesWon: 1, shipsDestroyed: 1 },
    ]);
  });

  it('count Dangerous destroying both ships as no battle: only the enemy ship', () => {
    const { before } = battle(true, ['r-dangerous']);
    let s = apply(before, { type: 'attack', die: 'p0d0', target: 'p1d0' });
    expect(s.pending[0]?.kind).toBe('dangerous');
    s = apply(s, { type: 'dangerous', destroy: true });
    expect(gained(before, s)).toEqual([{ shipsLost: 1 }, { shipsDestroyed: 1 }]);
  });

  it('count a ship destroyed by Show of Force, but not your own', () => {
    const before = arrange(quickStart(2, 5), { p0d0: [7, 2, 3], p1d0: [7, 4, 3] });
    before.pending.unshift({ kind: 'showOfForce', player: 0 });
    const s = apply(before, { type: 'showOfForce', die: 'p1d0' });
    expect(gained(before, s)).toEqual([{ shipsDestroyed: 1 }, { shipsLost: 1 }]);
    before.pending[0] = { kind: 'showOfForce', player: 0 };
    expect(gained(before, apply(before, { type: 'showOfForce', die: 'p0d0' }))).toEqual([{}, {}]);
  });

  it('count a conquest and a planet seized through Infamy, but not a starting planet', () => {
    const base = quickStart(2, 1, 'basic');
    expect(base.players.map((p) => p.stats!.planetsTaken)).toEqual([0, 0]);
    // Planet 4 (an 8) between a 6 and a 2 (basic.test.ts's scenario).
    const before = arrange(base, { p0d0: [5, 4, 6], p0d1: [7, 4, 2] });
    for (const p of before.board.planets) p.cubes = p.cubes.filter((o) => o !== 0 || p.id === 2);
    before.players[0].cubesLeft = 4;
    before.turn = { ...before.turn, player: 0, phase: 'actions', actionsLeft: 3 };
    const s = apply(before, { type: 'conquer', planet: 4 });
    expect(gained(before, s)).toEqual([{ planetsTaken: 1 }, {}]);

    const free = s.board.planets.find((p) => !p.cubes.includes(1))!;
    s.pending.unshift({ kind: 'infamy', player: 1 });
    expect(gained(s, apply(s, { type: 'infamy', planet: free.id }))).toEqual([{}, { planetsTaken: 1 }]);
  });

  it('count every card gained: taken, stored with Patient, an Expansion, or drawn by Change of Heart', () => {
    let s = quickStart(2, 611);
    const p = s.turn.player;
    const taken = () => s.players[p].stats!.cardsTaken;
    s.players[p].skills = [{ id: 'r-patient', active: true }];
    toRow(s, 'tactic', 'r-aggression');
    s.pending.unshift({ kind: 'takeCard', player: p, count: 1 });
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 0, store: true });
    expect(taken()).toBe(1);

    s.pending.unshift({ kind: 'takeCard', player: p, count: 1 });
    s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    while (s.pending[0]?.kind === 'patientTactic') s = apply(s, { type: 'patientTactic' });
    expect(taken()).toBe(2);

    s.pending.unshift({ kind: 'changeOfHeart', player: p });
    s = apply(s, { type: 'changeOfHeart', skill: s.market.skillDeck[0] });
    expect(taken()).toBe(3);

    s.pending.unshift({ kind: 'takeCard', player: p, count: 1 });
    s = apply(s, { type: 'takeCard', deck: 'expansion', index: 0 });
    expect(taken()).toBe(4);
  });

  for (const { id: mode } of MODES)
    it(`add up over a whole ${mode} game`, () => {
      const { state } = playAiGame({ mode, players: 3, seed: 21, aiSeed: 21 * 7919 });
      const stats = state.players.map((p) => p.stats);
      expect(sum(stats, 'battlesWon')).toBeGreaterThan(0);
      // Every battle has one winner and one loser; every enemy ship destroyed was someone's loss.
      expect(sum(stats, 'battlesWon')).toBe(sum(stats, 'battlesLost'));
      expect(sum(stats, 'shipsDestroyed')).toBe(sum(stats, 'shipsLost'));
      expect(state.players[state.winner!].stats!.planetsTaken).toBeGreaterThan(0);
      if (mode !== 'basic') expect(sum(stats, 'cardsTaken')).toBeGreaterThan(0);
    }, 60_000);
});
