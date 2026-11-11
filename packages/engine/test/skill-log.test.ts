/**
 * Skills that fire by themselves name their card on a log entry, with what they really gave (`gains`),
 * so the web app can show the card and point at just that.
 */
import { describe, expect, it } from 'vitest';
import { apply, rulesOf, type GameState } from '../src';
import { arrange, quickStart } from './helpers';

function game(skills: string[]): GameState {
  let s = quickStart(2, 42);
  const me = s.turn.player;
  s = arrange(s, { [`p${me}d0`]: [0, 5, 6], [`p${1 - me}d0`]: [0, 6, 3] });
  s.players[me].skills = skills.map((id) => ({ id, active: true }));
  s.players[me].power = 3;
  s.players[me].research = 2;
  s.turn.actionsLeft = 3;
  return s;
}

const fresh = (before: GameState, after: GameState) => after.log.filter((e) => e.id > before.logCounter);

describe('skills firing by themselves', () => {
  it('Orbital Cannon names its own entry; Exploit adds one of its own, with its gains', () => {
    const s = game(['r-exploit']);
    const me = s.turn.player;
    s.pending.unshift({ kind: 'orbitalCannon', player: me });
    const after = apply(s, { type: 'orbitalCannon', die: `p${1 - me}d0` });
    const plunder = fresh(s, after).filter((e) => e.card);
    expect(plunder).toEqual([expect.objectContaining({ card: 'r-exploit', player: me, gains: { research: 3 } })]);
    expect(after.players[me].research).toBe(5);
  });

  it('logs what a bonus really gives at a track’s limit, and nothing once full', () => {
    const s = game(['r-exploit']);
    const me = s.turn.player;
    const limit = rulesOf(s).researchLimit;
    s.players[me].research = limit - 1;
    s.pending.unshift({ kind: 'orbitalCannon', player: me });
    const near = apply(s, { type: 'orbitalCannon', die: `p${1 - me}d0` });
    expect(fresh(s, near).find((e) => e.card)?.gains).toEqual({ research: 1 });

    s.players[me].research = limit;
    const full = apply(s, { type: 'orbitalCannon', die: `p${1 - me}d0` });
    expect(fresh(s, full).some((e) => e.card)).toBe(false);
  });

  it('Prospectors names its card on the Move or Research it pays for', () => {
    let s = game(['r-prospectors']);
    const me = s.turn.player;
    for (let i = 0; i < 3; i++) s = apply(s, { type: 'refit', die: `p${me}d0` });
    const after = apply(s, { type: 'research' });
    expect(fresh(s, after).find((e) => e.card)).toEqual(expect.objectContaining({ card: 'r-prospectors', player: me }));
    // An action paid the usual way doesn't.
    const usual = game(['r-prospectors']);
    expect(fresh(usual, apply(usual, { type: 'research' })).some((e) => e.card)).toBe(false);
  });
});
