import { describe, expect, it } from 'vitest';
import {
  apply,
  canRespondToCombat,
  combatOutcome,
  claimCheck,
  createGame,
  dropTargets,
  legalActions,
  isUndoable,
  moveOptions,
  type GameState,
  type CombatPending,
} from '../src';
import { arrange, players, quickStart } from './helpers';

/*
 * Regolith on Alpha Sector (hex), the 2-player map, in axial cells (docs/HEX.md): a space's sides are a row
 * or column away, or (-1, +1) and (+1, -1). The top start objective, a 7, is at (1,5), with the spaces (0,5) and
 * (0,6) above it; the middle 8 is at (6,4), ringed by (5,4), (5,5), (6,3), (6,5), (7,3) and (7,4); row 7 runs
 * clear from (7,2) to (7,6), and the far corner is (12,2) beside (12,3).
 */

describe('setup', () => {
  it('ends with every player on a starting objective with 3 mechs', () => {
    const s = quickStart(3, 7);
    expect(s.phase).toBe('play');
    for (const p of s.players) {
      expect(s.board.objectives.filter((pl) => pl.cubes.includes(p.id))).toHaveLength(1);
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
    for (const d of game.dice) if (d.loc.zone === 'salvageYard') d.value = d.owner === 0 ? 6 : 1;

    let state = game;
    while (state.phase === 'setup') state = apply(state, legalActions(state)[0]);

    expect(state.turn.player).toBe(1);
  });
});

describe('movement', () => {
  it('moves across sides up to the mech value, blocked by objectives and mechs', () => {
    // From (0,5), past the start objective at (1,5), with an own mech on (0,6).
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

describe('claim', () => {
  it('needs perimeter mechs summing exactly to the objective number', () => {
    let s = quickStart();
    const centre = s.board.objectives.find((p) => p.number === 8)!; // (6,4)
    s = arrange(s, { p0d0: [5, 4, 3], p0d1: [7, 4, 5] });
    expect(claimCheck(s, 0, centre.id).ok).toBe(true);
    s = arrange(s, { p0d0: [5, 4, 3], p0d1: [7, 4, 4] });
    expect(claimCheck(s, 0, centre.id).ok).toBe(false);
  });

  it('costs 2 actions and places a cube', () => {
    let s = quickStart();
    s.turn.player = 0;
    const centre = s.board.objectives.find((p) => p.number === 8)!;
    s = arrange(s, { p0d0: [5, 4, 3], p0d1: [7, 4, 5] });
    s = apply(s, { type: 'claim', objective: centre.id });
    expect(s.board.objectives[centre.id].cubes).toContain(0);
    expect(s.turn.actionsLeft).toBe(1);
    expect(s.players[0].cubesLeft).toBe(3);
  });
});

describe('combat', () => {
  it('attacker wins ties, gains power, defender goes to the salvage yard', () => {
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
    expect(s.dice.find((d) => d.id === 'p1d0')!.loc.zone).toBe('salvageYard');
    expect(s.players[0].power).toBe(2);
    expect(s.pending[0].kind).toBe('advance');
    s = apply(s, { type: 'advance', move: true });
    expect(s.dice.find((d) => d.id === 'p0d0')!.loc).toEqual({ zone: 'board', r: 0, c: 6 });
  });

  it('an atomic sets a combat roll to 1', () => {
    let s = quickStart();
    s.turn.player = 0;
    s = arrange(s, { p0d0: [0, 5, 2], p1d0: [0, 6, 6] });
    s = apply(s, { type: 'attack', die: 'p0d0', target: 'p1d0' });
    if (s.pending[0].kind !== 'combat') throw new Error();
    s.pending[0].attacker.dice = [6];
    s.pending[0].defender.dice = [1];
    s = apply(s, { type: 'atomic', by: 0, side: 'attacker' }); // 2+1=3 vs 6+1=7: turns a loss (8 vs 7) into a win
    expect(s.players[0].atomics).toBe(0);
    s = apply(s, { type: 'resolveCombat' });
    expect(s.dice.find((d) => d.id === 'p1d0')!.loc.zone).toBe('salvageYard');
  });
});

describe('atomics', () => {
  function battle(defender: { skills?: string[]; killZone?: number }, rolls: [number, number], playerCount = 2) {
    let s = quickStart(playerCount);
    s.turn.player = 1;
    // (4,4) and (4,5) are spaces on the 2- and 3-player hex maps both.
    s = arrange(s, { p1d0: [4, 4, 2], p0d0: [4, 5, 5] });
    s.players[0].skills = (defender.skills ?? []).map((id) => ({ id, active: true }));
    s.players[0].killZone = defender.killZone ?? 0;
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

  it('sets the roll to 1 before modifiers (the logged 8 vs 5 battle)', () => {
    const s = battle({ skills: ['r-armour-piercing'] }, [6, 4]);
    expect(totals(s)).toEqual([8, 8]);
    const fired = apply(s, { type: 'atomic', by: 0, side: 'defender' });
    expect(totals(fired)).toEqual([8, 5]);
    expect(fired.players[0].atomics).toBe(0);
  });

  it('cannot be wasted on a roll that is already 1', () => {
    expect(() => apply(battle({ killZone: 1 }, [1, 4]), { type: 'atomic', by: 0, side: 'defender' })).toThrow(/already 1/);
    expect(() => apply(battle({}, [1, 1]), { type: 'atomic', by: 0, side: 'defender' })).toThrow(/already 1/);
  });

  it('is offered to a combatant only on their own roll, and only while losing', () => {
    const atomics = (s: GameState) => legalActions(s).filter((a) => a.type === 'atomic');
    // Attacker 6+2=8 vs defender 4+5=9: the attacker (player 1) is winning.
    expect(atomics(battle({}, [6, 4]))).toEqual([{ type: 'atomic', by: 0, side: 'defender' }]);
    // Attacker 6+2=8 vs defender 1+5=6: the defender (player 0) is winning.
    expect(atomics(battle({}, [6, 1]))).toEqual([{ type: 'atomic', by: 1, side: 'attacker' }]);
  });

  it('may not be fired by a player not in the battle', () => {
    // Attacker 6+2=8 vs defender 4+5=9: neither roll is 1 yet.
    const s = battle({}, [6, 4], 3);
    expect(s.players[2].atomics).toBeGreaterThan(0);
    expect(legalActions(s).filter((a) => a.type === 'atomic' && a.by === 2)).toEqual([]);
    expect(canRespondToCombat(s, s.pending[0] as CombatPending, 2)).toBe(false);
    for (const side of ['attacker', 'defender'] as const)
      expect(() => apply(s, { type: 'atomic', by: 2, side })).toThrow(/Only the attacker and defender/);
  });

  it('overrides Drill Sergeant', () => {
    const s = battle({ skills: ['r-drill-sergeant'] }, [6, 6]);
    expect(totals(s)).toEqual([8, 8]);
    expect(totals(apply(s, { type: 'atomic', by: 0, side: 'defender' }))).toEqual([8, 6]);
  });
});

describe('Kill Zone', () => {
  it('lasts until the end of the owner’s next turn', () => {
    let s = quickStart();
    const me = s.turn.player;
    s.players[me].killZone = 2; // as if taken during this turn's card phase
    s = apply(s, { type: 'endTurn' }); // end of this turn
    expect(s.players[me].killZone).toBe(1); // active through the opponent's turn
    s = apply(s, { type: 'endTurn' });
    expect(s.turn.player).toBe(me);
    expect(s.players[me].killZone).toBe(1); // and my next turn
    s = apply(s, { type: 'endTurn' });
    expect(s.players[me].killZone).toBe(0); // gone after it
  });
});

describe('modes', () => {
  it('basic: no cards or research, and the atomics, mechs and maps of Regolith', () => {
    const s = quickStart(2, 3, 'basic');
    expect(s.market.skillRow).toHaveLength(0);
    expect(s.market.tacticRow).toHaveLength(0);
    expect(s.market.reinforcements).toBe(0);
    expect(s.players.every((p) => p.atomics === 1 && p.skills.length === 0)).toBe(true);
    expect(() => apply(s, { type: 'research' })).toThrow(/no research/);
    expect(legalActions(s).some((a) => a.type === 'research')).toBe(false);
    expect(s.board.mapId).toBe(quickStart(2, 3, 'regolith').board.mapId);
  });
});

describe('void tiles (The Alien Artefact maps; BGA rules help)', () => {
  // The Great Plan (hex): the Alien Artefacts tile is the middle one, (7,5) and the six spaces round it.
  const ARTEFACT: [number, number][] = [
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

  it('is a tile of empty spaces with no objective', () => {
    const s = start();
    for (const [r, c] of ARTEFACT) expect(s.board.cells[r][c]).toMatchObject({ kind: 'space', artefact: true });
    expect(s.board.objectives.some((p) => ARTEFACT.some(([r, c]) => p.r === r && p.c === c))).toBe(false);
  });

  it('+1 research per own mech on it at the start of your turn', () => {
    const s0 = start();
    const me = s0.turn.player;
    const next = 1 - me;
    let s = arrange(s0, {
      [`p${next}d0`]: [6, 5, 4],
      [`p${next}d1`]: [8, 4, 4],
      [`p${next}d2`]: [9, 4, 4], // next to the Alien Artefacts, not on it
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

    const reroll = { type: 'refit', die: `p${me}d0` } as const;
    expect(isUndoable(s, reroll, apply(s, reroll))).toBe(false);

    const attack = { type: 'attack', die: `p${me}d0`, target: `p${1 - me}d0` } as const;
    expect(isUndoable(s, attack, apply(s, attack))).toBe(false);

    const end = { type: 'endTurn' } as const;
    expect(isUndoable(s, end, apply(s, end))).toBe(false);
  });
});

describe('Entrenched (Entrenched; 2013 card text and CE card sheet)', () => {
  /** Player 0's Wisp attacks player 1's Breacher, which has Entrenched; the combat rolls are fixed. */
  function entrenchedCombat(attackRoll: number, defenceRoll: number): GameState {
    let s = quickStart();
    s.turn.player = 0;
    s = arrange(s, { p0d0: [0, 5, 6], p1d0: [0, 6, 1] });
    s.players[1].skills = [{ id: 'r-entrenched', active: true }];
    s.players[0].power = 3;
    s.players[1].power = 3;
    s = apply(s, { type: 'attack', die: 'p0d0', target: 'p1d0' });
    if (s.pending[0].kind !== 'combat') throw new Error();
    s.pending[0].attacker.dice = [attackRoll];
    s.pending[0].defender.dice = [defenceRoll];
    return apply(s, { type: 'resolveCombat' });
  }

  it('destroys the attacker when the defender wins outright', () => {
    const s = entrenchedCombat(6, 1); // 12 vs 2
    expect(s.dice.find((d) => d.id === 'p0d0')!.loc.zone).toBe('salvageYard');
    expect(s.players[1].power).toBe(4);
    expect(s.players[0].power).toBe(2);
  });

  it('wins ties and destroys the attacker', () => {
    const s = entrenchedCombat(1, 6); // 7 vs 7
    expect(s.dice.find((d) => d.id === 'p0d0')!.loc.zone).toBe('salvageYard');
    expect(s.dice.find((d) => d.id === 'p1d0')!.loc.zone).toBe('board');
  });

  it('loses normally when the attacker has the lower total', () => {
    let s = quickStart();
    s.turn.player = 0;
    s = arrange(s, { p0d0: [0, 5, 1], p1d0: [0, 6, 6] });
    s.players[1].skills = [{ id: 'r-entrenched', active: true }];
    s = apply(s, { type: 'attack', die: 'p0d0', target: 'p1d0' });
    if (s.pending[0].kind !== 'combat') throw new Error();
    s.pending[0].attacker.dice = [1];
    s.pending[0].defender.dice = [1];
    s = apply(s, { type: 'resolveCombat' });
    expect(s.dice.find((d) => d.id === 'p1d0')!.loc.zone).toBe('salvageYard');
  });
});

describe('Stand Down (Stand Down)', () => {
  it('needs power to lose ("reduce your power by 1")', () => {
    const s = quickStart(2, 3);
    const me = s.turn.player;
    s.players[me].skills = [{ id: 'r-stand-down', active: true }];
    s.players[me].power = 1;
    expect(legalActions(s).some((a) => a.type === 'standDown')).toBe(false);
    expect(() => apply(s, { type: 'standDown' })).toThrow('No power to lose');
  });
});

describe('card market', () => {
  function picking(): GameState {
    let s = quickStart(2, 3);
    s = apply(s, { type: 'endTurn' });
    s.pending = [{ kind: 'takeCard', player: s.turn.player, count: 2 }];
    return s;
  }

  it('a Reinforcements card cannot be taken once both reserve mechs are in the game', () => {
    const s = picking();
    for (const d of s.dice) if (d.owner === s.turn.player && d.loc.zone === 'reserve') d.loc = { zone: 'salvageYard' };
    expect(legalActions(s).some((a) => a.type === 'takeCard' && a.deck === 'reinforcement')).toBe(false);
    expect(() => apply(s, { type: 'takeCard', deck: 'reinforcement', index: 0 })).toThrow('Your reserve is empty');
  });
});

describe('RULES.md rulings 10–13', () => {
  it('13: a held Veteran Crew raises the skill limit at once, so taking it as a 4th skill forces no discard', () => {
    for (const [taken, discard] of [
      ['r-veteran-crew', false],
      ['r-infiltration', true],
    ] as const) {
      let s = quickStart(2, 3);
      s = apply(s, { type: 'endTurn' });
      const me = s.turn.player;
      s.players[me].skills = ['r-tune-up', 'r-armour-piercing', 'r-paired-cannons'].map((id) => ({ id, active: true }));
      s.market.skillRow[0] = taken;
      s.pending = [{ kind: 'takeCard', player: me, count: 1 }];
      s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
      expect(s.players[me].skills).toHaveLength(4);
      expect(s.pending[0]?.kind === 'discardSkill').toBe(discard);
    }
  });

  it('13: discarding Veteran Crew while over 3 skills asks for another discard', () => {
    let s = quickStart(2, 3);
    const me = s.turn.player;
    s.players[me].skills = ['r-tune-up', 'r-armour-piercing', 'r-paired-cannons', 'r-infiltration', 'r-veteran-crew'].map((id) => ({
      id,
      active: true,
    }));
    s.pending = [{ kind: 'discardSkill', player: me, reason: 'limit' }];
    s = apply(s, { type: 'discardSkill', skill: 'r-veteran-crew' });
    expect(s.pending[0]).toMatchObject({ kind: 'discardSkill', player: me });
  });

  it('11: the two Ice Tunnel spaces are adjacent for Close Protection support', () => {
    const attackerTotal = (tunnels: boolean) => {
      let s = quickStart();
      s.turn.player = 0;
      // The supporting mech sits on the far tunnel, adjacent to the attacker's space only through the link.
      s = arrange(s, { p0d0: [0, 5, 3], p1d0: [0, 6, 3], p0d1: [12, 2, 2] });
      s.players[0].skills = [{ id: 'r-close-protection', active: true }];
      s.tunnels = tunnels
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

  it('11: the two Ice Tunnel spaces are adjacent for Infiltration drops', () => {
    const isolated = (tunnels: boolean) => {
      let s = quickStart();
      s = arrange(s, { p1d0: [12, 2, 3] });
      s.players[0].skills = [{ id: 'r-infiltration', active: true }];
      s.tunnels = tunnels
        ? [
            { r: 5, c: 4 },
            { r: 12, c: 2 },
          ]
        : [];
      return dropTargets(s, 0).some((c) => c.r === 5 && c.c === 4);
    };
    expect(isolated(false)).toBe(true);
    expect(isolated(true)).toBe(false);
  });

  it('12: Stand Down is not offered under Fanatics, where it could do nothing', () => {
    const s = quickStart(2, 3);
    const me = s.turn.player;
    s.players[me].skills = ['r-stand-down', 'r-fanatics'].map((id) => ({ id, active: true }));
    s.players[me].power = 3;
    expect(legalActions(s).some((a) => a.type === 'standDown')).toBe(false);
    expect(() => apply(s, { type: 'standDown' })).toThrow('You cannot gain research');
  });

  describe('10: Orbital Cannon fires "destroy" skills, with no power loss for the victim', () => {
    function orbitalCannon(target: 'enemy' | 'own'): { s: GameState; me: number; foe: number } {
      let s = quickStart(2, 3);
      const me = s.turn.player;
      const foe = 1 - me;
      s = arrange(s, { [`p${me}d0`]: [0, 5, 3], [`p${foe}d0`]: [12, 2, 3] });
      s.players[me].skills = ['r-exploit', 'r-trophy-hunters'].map((id) => ({ id, active: true }));
      s.players[me].power = 3;
      s.players[me].research = 1;
      s.players[foe].power = 3;
      s.pending = [{ kind: 'orbitalCannon', player: me }];
      s = apply(s, { type: 'orbitalCannon', die: target === 'enemy' ? `p${foe}d0` : `p${me}d0` });
      return { s, me, foe };
    }

    it('on an enemy mech: Exploit and Trophy Hunters trigger; the victim keeps their power', () => {
      const { s, me, foe } = orbitalCannon('enemy');
      expect(s.players[me].research).toBe(4);
      expect(s.players[me].power).toBe(5); // +1 card text, +1 Trophy Hunters
      expect(s.players[foe].power).toBe(3);
    });

    it('on your own mech: only the card text applies', () => {
      const { s, me } = orbitalCannon('own');
      expect(s.players[me].research).toBe(1);
      expect(s.players[me].power).toBe(4);
    });
  });
});

describe('Engineering (CE): after refitting, ±1 (RULES.md ruling 6)', () => {
  function refitted(start: number): GameState {
    let s = quickStart(2, 3);
    const me = s.turn.player;
    s = arrange(s, { [`p${me}d0`]: [0, 5, start] });
    s.players[me].skills = [{ id: 'r-engineering', active: true }];
    s.turn.actionsLeft = 3;
    return apply(s, { type: 'refit', die: `p${me}d0` });
  }

  it('offers the new number and its neighbours, without wrapping, even a number already shown', () => {
    for (let start = 1; start <= 6; start++) {
      const s = refitted(start);
      const head = s.pending[0];
      if (head?.kind !== 'engineering') throw new Error('no Engineering prompt');
      const v = s.dice.find((d) => d.id === head.die)!.value;
      expect(head.options).toEqual([v - 1, v, v + 1].filter((x) => x >= 1 && x <= 6));
      expect(legalActions(s).map((a) => (a.type === 'engineering' ? a.value : null))).toEqual(head.options);
      if (Math.abs(v - start) === 1)
        expect(apply(s, { type: 'engineering', value: start }).dice.find((d) => d.id === head.die)!.value).toBe(start);
    }
  });

  it('refuses a change of more than 1', () => {
    const s = refitted(3);
    const head = s.pending[0];
    if (head?.kind !== 'engineering') throw new Error();
    const v = s.dice.find((d) => d.id === head.die)!.value;
    const far = v <= 3 ? v + 2 : v - 2;
    expect(() => apply(s, { type: 'engineering', value: far })).toThrow('at most 1');
  });
});

describe('Sneak: through enemy mechs, normal moves only (RULES.md ruling 8)', () => {
  function sneak(skill: boolean, blockers: 'enemy' | 'own' = 'enemy'): GameState {
    let s = quickStart();
    s.turn.player = 0;
    const b = blockers === 'enemy' ? 'p1' : 'p0';
    s = arrange(s, { p0d0: [7, 2, 1], [`${b}d1`]: [7, 3, 4], [`${b}d2`]: [7, 4, 4] });
    s.players[0].skills = skill ? [{ id: 'r-sneak', active: true }] : [];
    return s;
  }

  it('passes through enemy mechs at no cost, but can’t stop on them', () => {
    const moves = moveOptions(sneak(true), 'p0d0').moves;
    expect(moves.has('7,5')).toBe(true); // 2 enemy spaces free + 1 step
    expect(moves.has('7,3')).toBe(false);
    expect(moves.has('7,4')).toBe(false);
    expect(moveOptions(sneak(false), 'p0d0').moves.has('7,5')).toBe(false);
  });

  it('does not pass through your own mechs', () => {
    expect(moveOptions(sneak(true, 'own'), 'p0d0').moves.has('7,5')).toBe(false);
  });

  it('can attack an enemy beyond the ones it passes through', () => {
    let s = sneak(true);
    s = arrange(s, { p0d0: [7, 2, 2], p1d1: [7, 3, 4], p1d2: [7, 4, 4], p1d0: [7, 6, 4] });
    s.players[0].skills = [{ id: 'r-sneak', active: true }];
    expect(moveOptions(s, 'p0d0').attacks.get('p1d0')?.from).toEqual({ r: 7, c: 5 });
    expect(moveOptions(s, 'p0d0').attacks.has('p1d1')).toBe(true); // still attackable directly
  });
});

describe('Arms Deal: a card for a Claim action may be 1 atomic (RULES.md ruling 7)', () => {
  /** Ends a turn with `claimed` Claim actions and `infamy` Take Over cubes; `breakthrough` adds a research pick. */
  function cardPhase(opts: { claimed: number; infamy?: number; breakthrough?: boolean; skill?: boolean }): GameState {
    const s = quickStart(2, 3);
    const me = s.turn.player;
    s.players[me].skills = opts.skill === false ? [] : [{ id: 'r-arms-deal', active: true }];
    s.turn.claimed = opts.claimed;
    s.turn.claims = opts.claimed + (opts.infamy ?? 0);
    if (opts.breakthrough) s.players[me].research = 6;
    return apply(s, { type: 'endTurn' });
  }
  const offered = (s: GameState) => legalActions(s).some((a) => a.type === 'armsDeal');

  it('trades a claim pick for an atomic', () => {
    const s = cardPhase({ claimed: 1 });
    const me = s.turn.player;
    expect(offered(s)).toBe(true);
    const next = apply(s, { type: 'armsDeal' });
    expect(next.players[me].atomics).toBe(s.players[me].atomics + 1);
    expect(next.pending.some((x) => x.kind === 'takeCard' && x.player === me)).toBe(false);
  });

  it('not for an Take Over cube, or without the skill', () => {
    expect(offered(cardPhase({ claimed: 0, infamy: 1 }))).toBe(false);
    expect(offered(cardPhase({ claimed: 1, skill: false }))).toBe(false);
  });

  it('a card taken first uses the breakthrough pick, keeping the claim pick tradeable', () => {
    let s = cardPhase({ claimed: 1, breakthrough: true });
    expect(s.pending[0]).toMatchObject({ kind: 'takeCard', count: 2, claim: 1 });
    s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    expect(s.pending[0]).toMatchObject({ kind: 'takeCard', count: 1, claim: 1 });
    expect(offered(s)).toBe(true);
    s = apply(s, { type: 'armsDeal' });
    expect(offered(s)).toBe(false);
  });
});
