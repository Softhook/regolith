/**
 * Cards taken on someone else's turn (an off-turn Take Over pick), and a few card edge cases:
 * Ice Tunnel placement, Headhunter with an empty deck, Final Push tokens on discard, and
 * when CE Science Survey asks.
 */
import { describe, expect, it } from 'vitest';
import { apply, createGame, legalActions, type GameState } from '../src';
import { players, quickStart } from './helpers';

/** The current turn's card phase, where only `picker` still has `count` picks to take. */
function offTurnPick(s: GameState, picker: number, count = 1): GameState {
  s.turn.phase = 'cards';
  s.pending = [{ kind: 'takeCard', player: picker, count }];
  return s;
}

function takeTactic(s: GameState, id: string): GameState {
  s.market.tacticRow[0] = id;
  return apply(s, { type: 'takeCard', deck: 'tactic', index: 0 });
}

describe('cards taken off-turn', () => {
  it('a skill works from the end of the turn it was taken on, not a turn later', () => {
    let s = quickStart();
    const foe = 1 - s.turn.player;
    s = offTurnPick(s, foe);
    s.market.skillRow[0] = 'r-science-survey';
    s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    expect(s.turn.player).toBe(foe);
    expect(s.players[foe].skills).toContainEqual({ id: 'r-science-survey', active: true });
  });

  it('Kill Zone lasts until the end of the player’s coming turn', () => {
    let s = quickStart();
    const foe = 1 - s.turn.player;
    s = takeTactic(offTurnPick(s, foe), 'r-kill-zone');
    expect(s.turn.player).toBe(foe);
    expect(s.players[foe].killZone).toBe(1);
    s = apply(s, { type: 'endTurn' });
    expect(s.players[foe].killZone).toBe(0);
  });

  it('Forced March: the bonus turn follows the current turn, then the turn order resumes', () => {
    let s = quickStart(3);
    const me = s.turn.player;
    const next = (me + 1) % 3;
    const last = (me + 2) % 3;
    s = takeTactic(offTurnPick(s, last, 2), 'r-forced-march');
    expect(s.turn).toMatchObject({ player: last, actionsLeft: 2, bonus: true, phase: 'actions' });
    s = apply(s, { type: 'endTurn' });
    expect(s.pending).toEqual([{ kind: 'takeCard', player: last, count: 1 }]); // the pick still owed
    s.market.skillRow[0] = 'r-science-survey';
    s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    expect(s.turn).toMatchObject({ player: next, actionsLeft: 3, bonus: false });
  });

  it('Forced March leaves later off-turn picks in this card phase', () => {
    let s = quickStart(3);
    const me = s.turn.player;
    const [b, c] = [(me + 1) % 3, (me + 2) % 3];
    s.turn.phase = 'cards';
    s.pending = [
      { kind: 'takeCard', player: b, count: 1 },
      { kind: 'takeCard', player: c, count: 1 },
    ];
    s = takeTactic(s, 'r-forced-march');
    expect(s.turn.player).toBe(me);
    expect(s.pending).toEqual([{ kind: 'takeCard', player: c, count: 1 }]);
  });
});

describe('card edge cases', () => {
  it('Ice Tunnel may go on an occupied space, but not on an objective', () => {
    let s = quickStart();
    const me = s.turn.player;
    s = takeTactic(offTurnPick(s, me), 'r-ice-tunnel');
    const mech = s.dice.find((d) => d.loc.zone === 'board')!;
    if (mech.loc.zone !== 'board') throw new Error('no mech on the map');
    const cell = { r: mech.loc.r, c: mech.loc.c };
    expect(legalActions(s)).toContainEqual({ type: 'iceTunnel', cell });
    s = apply(s, { type: 'iceTunnel', cell });
    expect(s.pending[0]).toMatchObject({ kind: 'iceTunnel', placed: [cell] });
    const objective = s.board.objectives[0];
    expect(() => apply(s, { type: 'iceTunnel', cell: { r: objective.r, c: objective.c } })).toThrow(/not objectives/);
  });

  it('Headhunter reshuffles the skill discards into an empty deck', () => {
    let s = quickStart();
    const me = s.turn.player;
    s.market.skillDiscard = [...s.market.skillDeck];
    s.market.skillDeck = [];
    s = takeTactic(offTurnPick(s, me), 'r-headhunter');
    expect(s.pending[0]).toMatchObject({ kind: 'headhunter', player: me });
    expect(s.market.skillDiscard).toEqual([]);
  });

  it('Final Push tokens are cleared when the card is discarded', () => {
    let s = quickStart();
    const me = s.turn.player;
    s.players[me].skills.push({ id: 'r-final-push', active: true });
    s.players[me].ambitionTokens = 2;
    s.pending = [{ kind: 'discardSkill', player: me, reason: 'limit' }];
    s = apply(s, { type: 'discardSkill', skill: 'r-final-push' });
    expect(s.players[me].ambitionTokens).toBe(0);
  });

  it('is played by 2 to 5 players, and 6 are refused', () => {
    for (const n of [2, 3, 4, 5]) expect(createGame({ players: players(n), seed: 1 }).players).toHaveLength(n);
    expect(() => createGame({ players: players(6), seed: 1 })).toThrow(/2–5 players/);
  });
});

describe('Science Survey (Science Survey): 2 Research at the start of your turn', () => {
  it('is gained without asking', () => {
    let s = quickStart();
    const foe = 1 - s.turn.player;
    s.players[foe].skills = [{ id: 'r-science-survey', active: true }];
    s.players[foe].research = 2;
    s = apply(s, { type: 'endTurn' });
    expect(s.pending).toEqual([]);
    expect(s.players[foe].research).toBe(4);
  });
});
