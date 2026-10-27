/**
 * Cards taken on someone else's turn (an off-turn Infamy pick), and a few card edge cases:
 * Warp Gate placement, Change of Heart with an empty deck, Ambitious tokens on discard, and
 * when CE Brilliant asks.
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
    s.market.skillRow[0] = 'r-brilliant';
    s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    expect(s.turn.player).toBe(foe);
    expect(s.players[foe].skills).toContainEqual({ id: 'r-brilliant', active: true });
  });

  it('Plan Ahead lasts until the end of the player’s coming turn', () => {
    let s = quickStart();
    const foe = 1 - s.turn.player;
    s = takeTactic(offTurnPick(s, foe), 'r-plan-ahead');
    expect(s.turn.player).toBe(foe);
    expect(s.players[foe].planAhead).toBe(1);
    s = apply(s, { type: 'endTurn' });
    expect(s.players[foe].planAhead).toBe(0);
  });

  it('Momentum: the bonus turn follows the current turn, then the turn order resumes', () => {
    let s = quickStart(3);
    const me = s.turn.player;
    const next = (me + 1) % 3;
    const last = (me + 2) % 3;
    s = takeTactic(offTurnPick(s, last, 2), 'r-momentum');
    expect(s.turn).toMatchObject({ player: last, actionsLeft: 2, bonus: true, phase: 'actions' });
    s = apply(s, { type: 'endTurn' });
    expect(s.pending).toEqual([{ kind: 'takeCard', player: last, count: 1 }]); // the pick still owed
    s.market.skillRow[0] = 'r-brilliant';
    s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    expect(s.turn).toMatchObject({ player: next, actionsLeft: 3, bonus: false });
  });

  it('Momentum leaves later off-turn picks in this card phase', () => {
    let s = quickStart(3);
    const me = s.turn.player;
    const [b, c] = [(me + 1) % 3, (me + 2) % 3];
    s.turn.phase = 'cards';
    s.pending = [
      { kind: 'takeCard', player: b, count: 1 },
      { kind: 'takeCard', player: c, count: 1 },
    ];
    s = takeTactic(s, 'r-momentum');
    expect(s.turn.player).toBe(me);
    expect(s.pending).toEqual([{ kind: 'takeCard', player: c, count: 1 }]);
  });
});

describe('card edge cases', () => {
  it('Warp Gate may go on an occupied space, but not on a planet', () => {
    let s = quickStart();
    const me = s.turn.player;
    s = takeTactic(offTurnPick(s, me), 'r-warp-gate');
    const ship = s.dice.find((d) => d.loc.zone === 'board')!;
    if (ship.loc.zone !== 'board') throw new Error('no ship on the map');
    const cell = { r: ship.loc.r, c: ship.loc.c };
    expect(legalActions(s)).toContainEqual({ type: 'warpGate', cell });
    s = apply(s, { type: 'warpGate', cell });
    expect(s.pending[0]).toMatchObject({ kind: 'warpGate', placed: [cell] });
    const planet = s.board.planets[0];
    expect(() => apply(s, { type: 'warpGate', cell: { r: planet.r, c: planet.c } })).toThrow(/not planets/);
  });

  it('Change of Heart reshuffles the skill discards into an empty deck', () => {
    let s = quickStart();
    const me = s.turn.player;
    s.market.skillDiscard = [...s.market.skillDeck];
    s.market.skillDeck = [];
    s = takeTactic(offTurnPick(s, me), 'r-change-of-heart');
    expect(s.pending[0]).toMatchObject({ kind: 'changeOfHeart', player: me });
    expect(s.market.skillDiscard).toEqual([]);
  });

  it('Ambitious tokens are cleared when the card is discarded', () => {
    let s = quickStart();
    const me = s.turn.player;
    s.players[me].skills.push({ id: 'r-ambitious', active: true });
    s.players[me].ambitionTokens = 2;
    s.pending = [{ kind: 'discardSkill', player: me, reason: 'limit' }];
    s = apply(s, { type: 'discardSkill', skill: 'r-ambitious' });
    expect(s.players[me].ambitionTokens).toBe(0);
  });

  it('is played by 2 to 4 players: no map has room for 5, and 6 are refused', () => {
    expect(createGame({ players: players(4), seed: 1 }).players).toHaveLength(4);
    for (const mode of ['basic', 'regolith'] as const)
      expect(() => createGame({ players: players(5), seed: 1, mode })).toThrow(/No map for 5 players/);
    expect(() => createGame({ players: players(6), seed: 1 })).toThrow(/2–5 players/);
  });
});

describe('Brilliant (Science Survey): 2 Research at the start of your turn', () => {
  it('is gained without asking', () => {
    let s = quickStart();
    const foe = 1 - s.turn.player;
    s.players[foe].skills = [{ id: 'r-brilliant', active: true }];
    s.players[foe].research = 2;
    s = apply(s, { type: 'endTurn' });
    expect(s.pending).toEqual([]);
    expect(s.players[foe].research).toBe(4);
  });
});
