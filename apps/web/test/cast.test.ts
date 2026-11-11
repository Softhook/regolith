/** Which card a step is the doing of (the card on screen casts it), and which start-of-turn bonuses are news. */
import { describe, expect, it } from 'vitest';
import { apply, type GameState, type LogEntry } from '@regolith/engine';
import { arrange, quickStart } from '../../../packages/engine/test/helpers';
import { castOf, landing, repeatsLastTurn } from '../src/game/cast';

/** Player `me` has taken a card after claiming and will take the first Tactic: `card`. */
function taking(card: string, skills: string[] = []): GameState {
  let s = quickStart(2, 42);
  const me = s.turn.player;
  s = arrange(s, { [`p${me}d0`]: [0, 5, 6], [`p${1 - me}d0`]: [0, 6, 3] });
  s.players[me].skills = skills.map((id) => ({ id, active: true }));
  s.market.tacticRow[0] = card;
  s.pending.unshift({ kind: 'takeCard', player: me, count: 1 });
  return s;
}

describe('castOf', () => {
  it('is the Tactic played in the step', () => {
    const s = taking('r-power-grab');
    const after = apply(s, { type: 'takeCard', deck: 'tactic', index: 0 });
    expect(castOf(s, after)?.card).toBe('r-power-grab');
  });

  it('is the Tactic whose target the step chooses, before a skill its blow sets off', () => {
    const s = apply(taking('r-orbital-cannon', ['r-exploit']), { type: 'takeCard', deck: 'tactic', index: 0 });
    const me = s.turn.player;
    const after = apply(s, { type: 'orbitalCannon', die: `p${1 - me}d0` });
    // Exploit fired too, on an entry of its own.
    expect(after.log.some((e) => e.card === 'r-exploit' && e.gains)).toBe(true);
    expect(castOf(s, after)?.card).toBe('r-orbital-cannon');
  });

  it('is nothing for a card taken, or for placing a CE Reinforcements mech after an earlier Tactic', () => {
    const s = quickStart(2, 42);
    s.pending.unshift({ kind: 'takeCard', player: s.turn.player, count: 1 });
    s.market.skillRow[0] = 'r-tune-up';
    const after = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    expect(castOf(s, after)).toBeUndefined();

    // Play a Tactic first, then take a Reinforcements card from the pile and place its mech.
    let g = taking('r-power-grab');
    g.pending[0] = { kind: 'takeCard', player: g.turn.player, count: 2 };
    g = apply(g, { type: 'takeCard', deck: 'tactic', index: 0 });
    g = apply(g, { type: 'takeCard', deck: 'reinforcement', index: 0 });
    const placed = apply(g, { type: 'reinforcements', to: null });
    expect(castOf(g, placed)).toBeUndefined();
  });

  it('still counts a Tactic as landing while Engineering or Remodel is resolved first', () => {
    const s = apply(taking('r-invasion', ['r-remodel']), { type: 'takeCard', deck: 'tactic', index: 0 });
    expect(s.pending[0]?.kind).toBe('engineering');
    expect(landing(s)).toBe(true);
  });
});

describe('repeatsLastTurn', () => {
  let id = 0;
  const heading = (player: number): LogEntry => ({ id: ++id, player, text: '', turn: true });
  const bonus = (player: number, card = 'o-arrogant'): LogEntry => ({ id: ++id, player, text: '', card, gains: { actions: 1 } });
  const other = (player: number): LogEntry => ({ id: ++id, player, text: '' });

  it('is news the first turn, not the turns after it repeats', () => {
    const first = bonus(0);
    const again = bonus(0);
    const log = [heading(0), first, other(0), heading(1), other(1), heading(0), again];
    expect(repeatsLastTurn(log, first)).toBe(false);
    expect(repeatsLastTurn(log, again)).toBe(true);
  });

  it('is news again after a turn without it', () => {
    const back = bonus(0);
    const log = [heading(0), bonus(0), heading(1), heading(0), other(0), heading(1), heading(0), back];
    expect(repeatsLastTurn(log, back)).toBe(false);
  });

  it('is always news for a bonus that is not a turn’s start (Exploit)', () => {
    const plunder = bonus(0, 'r-exploit');
    const log = [heading(0), bonus(0, 'r-exploit'), heading(1), heading(0), other(0), plunder];
    expect(repeatsLastTurn(log, plunder)).toBe(false);
  });
});
