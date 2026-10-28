import { describe, expect, it } from 'vitest';
import {
  apply,
  canRespondToCombat,
  combatOutcome,
  conquerCheck,
  createGame,
  deployTargets,
  legalActions,
  isUndoable,
  moveOptions,
  type GameState,
  type CombatPending,
} from '../src';
import { arrange, players, quickStart } from './helpers';

/*
 * Regolith on Alpha Sector (hex), the 2-player map, in axial cells (docs/HEX.md): a space's sides are a row
 * or column away, or (-1, +1) and (+1, -1). The top start planet, a 7, is at (1,5), with the spaces (0,5) and
 * (0,6) above it; the middle 8 is at (6,4), orbited by (5,4), (5,5), (6,3), (6,5), (7,3) and (7,4); row 7 runs
 * clear from (7,2) to (7,6), and the far corner is (12,2) beside (12,3).
 */

describe('setup', () => {
  it('ends with every player on a starting planet with 3 ships', () => {
    const s = quickStart(3, 7);
    expect(s.phase).toBe('play');
    for (const p of s.players) {
      expect(s.board.planets.filter((pl) => pl.cubes.includes(p.id))).toHaveLength(1);
      expect(s.dice.filter((d) => d.owner === p.id && d.loc.zone === 'board')).toHaveLength(3);
      expect(p.skills).toHaveLength(1);
      expect(p.cubesLeft).toBe(4);
    }
    expect(s.market.skillRow).toHaveLength(3);
    expect(s.market.tacticRow).toHaveLength(3);
    expect(s.turn.actionsLeft).toBe(3);
  });

  it('is deterministic for a seed', () => {
    expect(quickStart(2, 42)).toEqual(quickStart(2, 42));
  });

  it('chooses the player with the lowest starting fleet total', () => {
    const game = createGame({ players: players(2), seed: 7, mode: 'basic' });
    for (const d of game.dice) if (d.loc.zone === 'scrapyard') d.value = d.owner === 0 ? 6 : 1;

    let state = game;
    while (state.phase === 'setup') state = apply(state, legalActions(state)[0]);

    expect(state.turn.player).toBe(1);
  });
});

describe('movement', () => {
  it('moves across sides up to the ship value, blocked by planets and ships', () => {
    // From (0,5), past the start planet at (1,5), with an own ship on (0,6).
    const s = arrange(quickStart(), { p0d0: [0, 5, 2], p0d1: [0, 6, 3] });
    const opts = moveOptions(s, 'p0d0');
    const keys = [...opts.moves.keys()].sort();
    expect(keys).toEqual(['1,4', '2,4'].sort());
  });

  it('finds attacks on adjacent enemies within range', () => {
    const s = arrange(quickStart(), { p0d0: [0, 5, 1], p1d0: [0, 6, 6] });
    expect(moveOptions(s, 'p0d0').attacks.has('p1d0')).toBe(true);
  });
});

describe('conquer', () => {
  it('needs orbital ships summing exactly to the planet number', () => {
    let s = quickStart();
    const centre = s.board.planets.find((p) => p.number === 8)!; // (6,4)
    s = arrange(s, { p0d0: [5, 4, 3], p0d1: [7, 4, 5] });
    expect(conquerCheck(s, 0, centre.id).ok).toBe(true);
    s = arrange(s, { p0d0: [5, 4, 3], p0d1: [7, 4, 4] });
    expect(conquerCheck(s, 0, centre.id).ok).toBe(false);
  });

  it('costs 2 actions and places a cube', () => {
    let s = quickStart();
    s.turn.player = 0;
    const centre = s.board.planets.find((p) => p.number === 8)!;
    s = arrange(s, { p0d0: [5, 4, 3], p0d1: [7, 4, 5] });
    s = apply(s, { type: 'conquer', planet: centre.id });
    expect(s.board.planets[centre.id].cubes).toContain(0);
    expect(s.turn.actionsLeft).toBe(1);
    expect(s.players[0].cubesLeft).toBe(3);
  });
});

describe('combat', () => {
  it('attacker wins ties, gains dominance, defender goes to the scrapyard', () => {
    let s = quickStart();
    s.turn.player = 0;
    s = arrange(s, { p0d0: [0, 5, 2], p1d0: [0, 6, 2] });
    s = apply(s, { type: 'attack', die: 'p0d0', target: 'p1d0' });
    const combat = s.pending[0];
    expect(combat.kind).toBe('combat');
    if (combat.kind !== 'combat') return;
    combat.attacker.dice = [4];
    combat.defender.dice = [4];
    s = apply(s, { type: 'resolveCombat' });
    expect(s.dice.find((d) => d.id === 'p1d0')!.loc.zone).toBe('scrapyard');
    expect(s.players[0].dominance).toBe(2);
    expect(s.pending[0].kind).toBe('advance');
    s = apply(s, { type: 'advance', move: true });
    expect(s.dice.find((d) => d.id === 'p0d0')!.loc).toEqual({ zone: 'board', r: 0, c: 6 });
  });

  it('a missile sets a combat roll to 1', () => {
    let s = quickStart();
    s.turn.player = 0;
    s = arrange(s, { p0d0: [0, 5, 6], p1d0: [0, 6, 1] });
    s = apply(s, { type: 'attack', die: 'p0d0', target: 'p1d0' });
    if (s.pending[0].kind !== 'combat') throw new Error();
    s.pending[0].attacker.dice = [6];
    s.pending[0].defender.dice = [1];
    s = apply(s, { type: 'missile', by: 0, side: 'attacker' }); // 1+6=7 vs 1+1=2: still loses
    expect(s.players[0].missiles).toBe(0);
    s = apply(s, { type: 'resolveCombat' });
    expect(s.dice.find((d) => d.id === 'p0d0')!.loc).toEqual({ zone: 'board', r: 0, c: 5 });
  });
});

describe('missiles', () => {
  function battle(defender: { skills?: string[]; planAhead?: number }, rolls: [number, number], playerCount = 2) {
    let s = quickStart(playerCount);
    s.turn.player = 1;
    // (4,4) and (4,5) are spaces on the 2- and 3-player hex maps both.
    s = arrange(s, { p1d0: [4, 4, 2], p0d0: [4, 5, 5] });
    s.players[0].skills = (defender.skills ?? []).map((id) => ({ id, active: true }));
    s.players[0].planAhead = defender.planAhead ?? 0;
    s = apply(s, { type: 'attack', die: 'p1d0', target: 'p0d0' });
    if (s.pending[0].kind !== 'combat') throw new Error('no combat');
    s.pending[0].attacker.dice = [rolls[0]];
    s.pending[0].defender.dice = [rolls[1]];
    return s;
  }
  const totals = (s: GameState) => {
    const c = s.pending[0];
    if (c.kind !== 'combat') throw new Error('no combat');
    const o = combatOutcome(s, c);
    return [o.attacker.total, o.defender.total];
  };

  it('sets the roll to 1 before modifiers (the logged 3 vs 5 battle)', () => {
    const s = battle({ skills: ['r-ferocious'] }, [1, 4]);
    expect(totals(s)).toEqual([3, 8]);
    const fired = apply(s, { type: 'missile', by: 0, side: 'defender' });
    expect(totals(fired)).toEqual([3, 5]);
    expect(fired.players[0].missiles).toBe(0);
  });

  it('cannot be wasted on a roll that is already 1', () => {
    expect(() => apply(battle({ planAhead: 1 }, [1, 4]), { type: 'missile', by: 0, side: 'defender' })).toThrow(/already 1/);
    expect(() => apply(battle({}, [1, 1]), { type: 'missile', by: 0, side: 'defender' })).toThrow(/already 1/);
  });

  it('is offered to a combatant only on their own roll, and only while losing', () => {
    const missiles = (s: GameState) => legalActions(s).filter((a) => a.type === 'missile');
    // Attacker 3+2=5 vs defender 4+5=9: the attacker (player 1) is winning.
    expect(missiles(battle({}, [3, 4]))).toEqual([{ type: 'missile', by: 0, side: 'defender' }]);
    // Attacker 6+2=8 vs defender 1+5=6: the defender (player 0) is winning.
    expect(missiles(battle({}, [6, 1]))).toEqual([{ type: 'missile', by: 1, side: 'attacker' }]);
  });

  it('may not be fired by a player not in the battle', () => {
    // Attacker 6+2=8 vs defender 4+5=9: neither roll is 1 yet.
    const s = battle({}, [6, 4], 3);
    expect(s.players[2].missiles).toBeGreaterThan(0);
    expect(legalActions(s).filter((a) => a.type === 'missile' && a.by === 2)).toEqual([]);
    expect(canRespondToCombat(s, s.pending[0] as CombatPending, 2)).toBe(false);
    for (const side of ['attacker', 'defender'] as const)
      expect(() => apply(s, { type: 'missile', by: 2, side })).toThrow(/Only the attacker and defender/);
  });

  it('overrides Rational', () => {
    const s = battle({ skills: ['r-rational'] }, [1, 6]);
    expect(totals(s)).toEqual([3, 8]);
    expect(totals(apply(s, { type: 'missile', by: 0, side: 'defender' }))).toEqual([3, 6]);
  });
});

describe('plan ahead', () => {
  it('lasts until the end of the owner’s next turn', () => {
    let s = quickStart();
    const me = s.turn.player;
    s.players[me].planAhead = 2; // as if taken during this turn's card phase
    s = apply(s, { type: 'endTurn' }); // end of this turn
    expect(s.players[me].planAhead).toBe(1); // active through the opponent's turn
    s = apply(s, { type: 'endTurn' });
    expect(s.turn.player).toBe(me);
    expect(s.players[me].planAhead).toBe(1); // and my next turn
    s = apply(s, { type: 'endTurn' });
    expect(s.players[me].planAhead).toBe(0); // gone after it
  });
});

describe('modes', () => {
  it('basic: no cards or research, and the missiles, mechs and maps of Regolith', () => {
    const s = quickStart(2, 3, 'basic');
    expect(s.market.skillRow).toHaveLength(0);
    expect(s.market.tacticRow).toHaveLength(0);
    expect(s.market.expansions).toBe(0);
    expect(s.players.every((p) => p.missiles === 1 && p.skills.length === 0)).toBe(true);
    expect(() => apply(s, { type: 'research' })).toThrow(/no research/);
    expect(legalActions(s).some((a) => a.type === 'research')).toBe(false);
    expect(s.board.mapId).toBe(quickStart(2, 3, 'regolith').board.mapId);
  });
});

describe('void tiles (The Void maps; BGA rules help)', () => {
  // The Great Plan (hex): the void tile is the middle one, (7,5) and the six spaces round it.
  const VOID: [number, number][] = [
    [6, 5],
    [6, 6],
    [7, 4],
    [7, 5],
    [7, 6],
    [8, 4],
    [8, 5],
  ];
  const start = () => {
    const s = quickStart(2, 5, 'regolith', 'the-great-plan-hex');
    for (const p of s.players) p.skills = [];
    return s;
  };

  it('is a tile of empty spaces with no planet', () => {
    const s = start();
    for (const [r, c] of VOID) expect(s.board.cells[r][c]).toMatchObject({ kind: 'space', void: true });
    expect(s.board.planets.some((p) => VOID.some(([r, c]) => p.r === r && p.c === c))).toBe(false);
  });

  it('+1 research per own ship on it at the start of your turn', () => {
    const s0 = start();
    const me = s0.turn.player;
    const next = 1 - me;
    let s = arrange(s0, {
      [`p${next}d0`]: [6, 5, 4],
      [`p${next}d1`]: [8, 4, 4],
      [`p${next}d2`]: [9, 4, 4], // next to the void, not on it
      [`p${me}d0`]: [7, 5, 4],
    });
    s.players[me].research = 1;
    s.players[next].research = 1;
    s = apply(s, { type: 'endTurn' });
    expect(s.turn.player).toBe(next);
    expect(s.players[next].research).toBe(3);
    expect(s.players[me].research).toBe(1); // only gained at the start of your own turn
  });

  it('research gained this way is capped at 6', () => {
    const s0 = start();
    const me = s0.turn.player;
    const next = 1 - me;
    let s = arrange(s0, { [`p${next}d0`]: [6, 5, 4], [`p${next}d1`]: [8, 4, 4], [`p${me}d0`]: [9, 4, 4] });
    s.players[next].research = 5;
    s = apply(s, { type: 'endTurn' });
    expect(s.players[next].research).toBe(6);
  });
});

describe('maps per rule set', () => {
  it('Basic and Regolith are played on the hex maps', () => {
    for (const mode of ['basic', 'regolith'] as const) {
      expect(createGame({ players: players(2), mode, mapId: 'arcadia-planitia' }).board.mapId).toBe('arcadia-planitia');
      expect(createGame({ players: players(2), mode, mapId: 'twin-drift' }).board.mapId).toBe('twin-drift');
    }
  });

  it('rejects a map for a different player count', () => {
    expect(() => createGame({ players: players(3), mapId: 'alpha-hex' })).toThrow(/2-player map/);
  });
});

describe('undo', () => {
  it('allows deterministic moves and forbids anything random', () => {
    let s = quickStart();
    const me = s.turn.player;
    s = arrange(s, { [`p${me}d0`]: [0, 5, 3], [`p${1 - me}d0`]: [0, 6, 6] });
    const moveTo = { r: 1, c: 4 };
    const moved = apply(s, { type: 'move', die: `p${me}d0`, to: moveTo });
    expect(isUndoable(s, { type: 'move', die: `p${me}d0`, to: moveTo }, moved)).toBe(true);

    const reroll = { type: 'reconfigure', die: `p${me}d0` } as const;
    expect(isUndoable(s, reroll, apply(s, reroll))).toBe(false);

    const attack = { type: 'attack', die: `p${me}d0`, target: `p${1 - me}d0` } as const;
    expect(isUndoable(s, attack, apply(s, attack))).toBe(false);

    const end = { type: 'endTurn' } as const;
    expect(isUndoable(s, end, apply(s, end))).toBe(false);
  });
});

describe('Stubborn (Entrenched; 2013 card text and CE card sheet)', () => {
  /** Player 0's Wisp attacks player 1's Breacher, which has Stubborn; the combat rolls are fixed. */
  function stubbornCombat(attackRoll: number, defenceRoll: number): GameState {
    let s = quickStart();
    s.turn.player = 0;
    s = arrange(s, { p0d0: [0, 5, 6], p1d0: [0, 6, 1] });
    s.players[1].skills = [{ id: 'r-stubborn', active: true }];
    s.players[0].dominance = 3;
    s.players[1].dominance = 3;
    s = apply(s, { type: 'attack', die: 'p0d0', target: 'p1d0' });
    if (s.pending[0].kind !== 'combat') throw new Error();
    s.pending[0].attacker.dice = [attackRoll];
    s.pending[0].defender.dice = [defenceRoll];
    return apply(s, { type: 'resolveCombat' });
  }

  it('destroys the attacker when the defender wins outright', () => {
    const s = stubbornCombat(6, 1); // 12 vs 2
    expect(s.dice.find((d) => d.id === 'p0d0')!.loc.zone).toBe('scrapyard');
    expect(s.players[1].dominance).toBe(4);
    expect(s.players[0].dominance).toBe(2);
  });

  it('wins ties and destroys the attacker', () => {
    const s = stubbornCombat(1, 6); // 7 vs 7
    expect(s.dice.find((d) => d.id === 'p0d0')!.loc.zone).toBe('scrapyard');
    expect(s.dice.find((d) => d.id === 'p1d0')!.loc.zone).toBe('board');
  });

  it('loses normally when the attacker has the lower total', () => {
    let s = quickStart();
    s.turn.player = 0;
    s = arrange(s, { p0d0: [0, 5, 1], p1d0: [0, 6, 6] });
    s.players[1].skills = [{ id: 'r-stubborn', active: true }];
    s = apply(s, { type: 'attack', die: 'p0d0', target: 'p1d0' });
    if (s.pending[0].kind !== 'combat') throw new Error();
    s.pending[0].attacker.dice = [1];
    s.pending[0].defender.dice = [1];
    s = apply(s, { type: 'resolveCombat' });
    expect(s.dice.find((d) => d.id === 'p1d0')!.loc.zone).toBe('scrapyard');
  });
});

describe('Composed (Stand Down)', () => {
  it('needs dominance to lose ("reduce your dominance by 1")', () => {
    const s = quickStart(2, 3);
    const me = s.turn.player;
    s.players[me].skills = [{ id: 'r-composed', active: true }];
    s.players[me].dominance = 1;
    expect(legalActions(s).some((a) => a.type === 'composed')).toBe(false);
    expect(() => apply(s, { type: 'composed' })).toThrow('No power to lose');
  });
});

describe('card market', () => {
  function picking(): GameState {
    let s = quickStart(2, 3);
    s = apply(s, { type: 'endTurn' });
    s.pending = [{ kind: 'takeCard', player: s.turn.player, count: 2 }];
    return s;
  }

  it('an Expansion cannot be taken once both expansion ships are in the game', () => {
    const s = picking();
    for (const d of s.dice) if (d.owner === s.turn.player && d.loc.zone === 'reserve') d.loc = { zone: 'scrapyard' };
    expect(legalActions(s).some((a) => a.type === 'takeCard' && a.deck === 'expansion')).toBe(false);
    expect(() => apply(s, { type: 'takeCard', deck: 'expansion', index: 0 })).toThrow('Your reserve is empty');
  });
});

describe('RULES.md rulings 10–13', () => {
  it('13: a held Talented raises the skill limit at once, so taking it as a 4th skill forces no discard', () => {
    for (const [taken, discard] of [
      ['r-talented', false],
      ['r-stealthy', true],
    ] as const) {
      let s = quickStart(2, 3);
      s = apply(s, { type: 'endTurn' });
      const me = s.turn.player;
      s.players[me].skills = ['r-agile', 'r-ferocious', 'r-brutal'].map((id) => ({ id, active: true }));
      s.market.skillRow[0] = taken;
      s.pending = [{ kind: 'takeCard', player: me, count: 1 }];
      s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
      expect(s.players[me].skills).toHaveLength(4);
      expect(s.pending[0]?.kind === 'discardSkill').toBe(discard);
    }
  });

  it('13: discarding Talented while over 3 skills asks for another discard', () => {
    let s = quickStart(2, 3);
    const me = s.turn.player;
    s.players[me].skills = ['r-agile', 'r-ferocious', 'r-brutal', 'r-stealthy', 'r-talented'].map((id) => ({ id, active: true }));
    s.pending = [{ kind: 'discardSkill', player: me, reason: 'limit' }];
    s = apply(s, { type: 'discardSkill', skill: 'r-talented' });
    expect(s.pending[0]).toMatchObject({ kind: 'discardSkill', player: me });
  });

  it('11: the two Warp Gate spaces are adjacent for Strategic support', () => {
    const attackerTotal = (gates: boolean) => {
      let s = quickStart();
      s.turn.player = 0;
      // The supporting ship sits on the far gate, adjacent to the attacker's space only through the link.
      s = arrange(s, { p0d0: [0, 5, 3], p1d0: [0, 6, 3], p0d1: [12, 2, 2] });
      s.players[0].skills = [{ id: 'r-strategic', active: true }];
      s.gates = gates
        ? [
            { r: 0, c: 5 },
            { r: 12, c: 2 },
          ]
        : [];
      s = apply(s, { type: 'attack', die: 'p0d0', target: 'p1d0' });
      if (s.pending[0].kind !== 'combat') throw new Error();
      s.pending[0].attacker.dice = [4];
      s.pending[0].defender.dice = [4];
      return combatOutcome(s, s.pending[0]).attacker.total;
    };
    expect(attackerTotal(true)).toBe(attackerTotal(false) - 2);
  });

  it('11: the two Warp Gate spaces are adjacent for Stealthy deploys', () => {
    const isolated = (gates: boolean) => {
      let s = quickStart();
      s = arrange(s, { p1d0: [12, 2, 3] });
      s.players[0].skills = [{ id: 'r-stealthy', active: true }];
      s.gates = gates
        ? [
            { r: 5, c: 4 },
            { r: 12, c: 2 },
          ]
        : [];
      return deployTargets(s, 0).some((c) => c.r === 5 && c.c === 4);
    };
    expect(isolated(false)).toBe(true);
    expect(isolated(true)).toBe(false);
  });

  it('12: Composed is not offered under Righteous, where it could do nothing', () => {
    const s = quickStart(2, 3);
    const me = s.turn.player;
    s.players[me].skills = ['r-composed', 'r-righteous'].map((id) => ({ id, active: true }));
    s.players[me].dominance = 3;
    expect(legalActions(s).some((a) => a.type === 'composed')).toBe(false);
    expect(() => apply(s, { type: 'composed' })).toThrow('You cannot gain research');
  });

  describe('10: Show of Force fires "destroy" skills, with no dominance loss for the victim', () => {
    function showOfForce(target: 'enemy' | 'own'): { s: GameState; me: number; foe: number } {
      let s = quickStart(2, 3);
      const me = s.turn.player;
      const foe = 1 - me;
      s = arrange(s, { [`p${me}d0`]: [0, 5, 3], [`p${foe}d0`]: [12, 2, 3] });
      s.players[me].skills = ['r-plundering', 'r-ravenous'].map((id) => ({ id, active: true }));
      s.players[me].dominance = 3;
      s.players[me].research = 1;
      s.players[foe].dominance = 3;
      s.pending = [{ kind: 'showOfForce', player: me }];
      s = apply(s, { type: 'showOfForce', die: target === 'enemy' ? `p${foe}d0` : `p${me}d0` });
      return { s, me, foe };
    }

    it('on an enemy ship: Plundering and Ravenous trigger; the victim keeps their dominance', () => {
      const { s, me, foe } = showOfForce('enemy');
      expect(s.players[me].research).toBe(4);
      expect(s.players[me].dominance).toBe(5); // +1 card text, +1 Ravenous
      expect(s.players[foe].dominance).toBe(3);
    });

    it('on your own ship: only the card text applies', () => {
      const { s, me } = showOfForce('own');
      expect(s.players[me].research).toBe(1);
      expect(s.players[me].dominance).toBe(4);
    });
  });
});

describe('Clever (CE): after reconfiguring, ±1 (RULES.md ruling 6)', () => {
  function reconfigured(start: number): GameState {
    let s = quickStart(2, 3);
    const me = s.turn.player;
    s = arrange(s, { [`p${me}d0`]: [0, 5, start] });
    s.players[me].skills = [{ id: 'r-clever', active: true }];
    s.turn.actionsLeft = 3;
    return apply(s, { type: 'reconfigure', die: `p${me}d0` });
  }

  it('offers the new number and its neighbours, without wrapping, even a number already shown', () => {
    for (let start = 1; start <= 6; start++) {
      const s = reconfigured(start);
      const head = s.pending[0];
      if (head?.kind !== 'clever') throw new Error('no Clever prompt');
      const v = s.dice.find((d) => d.id === head.die)!.value;
      expect(head.options).toEqual([v - 1, v, v + 1].filter((x) => x >= 1 && x <= 6));
      expect(legalActions(s).map((a) => (a.type === 'clever' ? a.value : null))).toEqual(head.options);
      if (Math.abs(v - start) === 1)
        expect(apply(s, { type: 'clever', value: start }).dice.find((d) => d.id === head.die)!.value).toBe(start);
    }
  });

  it('refuses a change of more than 1', () => {
    const s = reconfigured(3);
    const head = s.pending[0];
    if (head?.kind !== 'clever') throw new Error();
    const v = s.dice.find((d) => d.id === head.die)!.value;
    const far = v <= 3 ? v + 2 : v - 2;
    expect(() => apply(s, { type: 'clever', value: far })).toThrow('at most 1');
  });
});

describe('Devious: through enemy ships, normal moves only (RULES.md ruling 8)', () => {
  function devious(skill: boolean, blockers: 'enemy' | 'own' = 'enemy'): GameState {
    let s = quickStart();
    s.turn.player = 0;
    const b = blockers === 'enemy' ? 'p1' : 'p0';
    s = arrange(s, { p0d0: [7, 2, 1], [`${b}d1`]: [7, 3, 4], [`${b}d2`]: [7, 4, 4] });
    s.players[0].skills = skill ? [{ id: 'r-devious', active: true }] : [];
    return s;
  }

  it('passes through enemy ships at no cost, but can’t stop on them', () => {
    const moves = moveOptions(devious(true), 'p0d0').moves;
    expect(moves.has('7,5')).toBe(true); // 2 enemy spaces free + 1 step
    expect(moves.has('7,3')).toBe(false);
    expect(moves.has('7,4')).toBe(false);
    expect(moveOptions(devious(false), 'p0d0').moves.has('7,5')).toBe(false);
  });

  it('does not pass through your own ships', () => {
    expect(moveOptions(devious(true, 'own'), 'p0d0').moves.has('7,5')).toBe(false);
  });

  it('can attack an enemy beyond the ones it passes through', () => {
    let s = devious(true);
    s = arrange(s, { p0d0: [7, 2, 2], p1d1: [7, 3, 4], p1d2: [7, 4, 4], p1d0: [7, 6, 4] });
    s.players[0].skills = [{ id: 'r-devious', active: true }];
    expect(moveOptions(s, 'p0d0').attacks.get('p1d0')?.from).toEqual({ r: 7, c: 5 });
    expect(moveOptions(s, 'p0d0').attacks.has('p1d1')).toBe(true); // still attackable directly
  });
});

describe('Profiteering: a card for a Conquer action may be 1 missile (RULES.md ruling 7)', () => {
  /** Ends a turn with `conquered` Conquer actions and `infamy` Take Over cubes; `breakthrough` adds a research pick. */
  function cardPhase(opts: { conquered: number; infamy?: number; breakthrough?: boolean; skill?: boolean }): GameState {
    const s = quickStart(2, 3);
    const me = s.turn.player;
    s.players[me].skills = opts.skill === false ? [] : [{ id: 'r-profiteering', active: true }];
    s.turn.conquered = opts.conquered;
    s.turn.conquests = opts.conquered + (opts.infamy ?? 0);
    if (opts.breakthrough) s.players[me].research = 6;
    return apply(s, { type: 'endTurn' });
  }
  const offered = (s: GameState) => legalActions(s).some((a) => a.type === 'profiteer');

  it('trades a conquest pick for a missile', () => {
    const s = cardPhase({ conquered: 1 });
    const me = s.turn.player;
    expect(offered(s)).toBe(true);
    const next = apply(s, { type: 'profiteer' });
    expect(next.players[me].missiles).toBe(s.players[me].missiles + 1);
    expect(next.pending.some((x) => x.kind === 'takeCard' && x.player === me)).toBe(false);
  });

  it('not for an Take Over cube, or without the skill', () => {
    expect(offered(cardPhase({ conquered: 0, infamy: 1 }))).toBe(false);
    expect(offered(cardPhase({ conquered: 1, skill: false }))).toBe(false);
  });

  it('a card taken first uses the breakthrough pick, keeping the conquest pick tradeable', () => {
    let s = cardPhase({ conquered: 1, breakthrough: true });
    expect(s.pending[0]).toMatchObject({ kind: 'takeCard', count: 2, conquer: 1 });
    s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    expect(s.pending[0]).toMatchObject({ kind: 'takeCard', count: 1, conquer: 1 });
    expect(offered(s)).toBe(true);
    s = apply(s, { type: 'profiteer' });
    expect(offered(s)).toBe(false);
  });
});
