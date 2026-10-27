/** Which card a step is the doing of (the card on screen casts it), and which start-of-turn bonuses are news. */
import { describe, expect, it } from 'vitest';
import { apply, type GameState, type LogEntry } from '@regolith/engine';
import { arrange, quickStart } from '../../../packages/engine/test/helpers';
import { castOf, landing, repeatsLastTurn } from '../src/game/cast';

/** Player `me` has taken a card after conquering and will take the first Tactic: `card`. */
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
    const s = taking('r-aggression');
    const after = apply(s, { type: 'takeCard', deck: 'tactic', index: 0 });
    expect(castOf(s, after)?.card).toBe('r-aggression');
  });

  it('is the Tactic whose target the step chooses, before a skill its blow sets off', () => {
    const s = apply(taking('r-show-of-force', ['r-plundering']), { type: 'takeCard', deck: 'tactic', index: 0 });
    const me = s.turn.player;
    const after = apply(s, { type: 'showOfForce', die: `p${1 - me}d0` });
    // Plundering fired too, on an entry of its own.
    expect(after.log.some((e) => e.card === 'r-plundering' && e.gains)).toBe(true);
    expect(castOf(s, after)?.card).toBe('r-show-of-force');
  });

  it('is nothing for a card taken, or for placing a CE Expansion ship after an earlier Tactic', () => {
    const s = quickStart(2, 42);
    s.pending.unshift({ kind: 'takeCard', player: s.turn.player, count: 1 });
    s.market.skillRow[0] = 'r-agile';
    const after = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    expect(castOf(s, after)).toBeUndefined();

    // Play a Tactic first, then take an Expansion from the CE pile and place its ship.
    let g = taking('r-aggression');
    g.pending[0] = { kind: 'takeCard', player: g.turn.player, count: 2 };
    g = apply(g, { type: 'takeCard', deck: 'tactic', index: 0 });
    g = apply(g, { type: 'takeCard', deck: 'expansion', index: 0 });
    const placed = apply(g, { type: 'placeExpansion', to: null });
    expect(castOf(g, placed)).toBeUndefined();
  });

  it('still counts a Tactic as landing while Clever or Calculating is resolved first', () => {
    const s = apply(taking('r-unveil-the-fleet', ['r-calculating']), { type: 'takeCard', deck: 'tactic', index: 0 });
    expect(s.pending[0]?.kind).toBe('clever');
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

  it('is always news for a bonus that is not a turn’s start (Plundering)', () => {
    const plunder = bonus(0, 'r-plundering');
    const log = [heading(0), bonus(0, 'r-plundering'), heading(1), heading(0), other(0), plunder];
    expect(repeatsLastTurn(log, plunder)).toBe(false);
  });
});
