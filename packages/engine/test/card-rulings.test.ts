import { describe, expect, it } from 'vitest';
import { apply, attackChance, attackFactors, attackOdds, die, legalActions, type GameState } from '../src';
import { arrange, quickStart } from './helpers';

/**
 * Regolith's cards, each by the Community card it started as (its `effect`): the current player's Wisp (a 6) at
 * (0,5) on Alpha Sector (hex), next to the other player's Tactician (a 3) at (0,6).
 */
function cardGame(skills: { me?: string[]; foe?: string[] } = {}): GameState {
  let s = quickStart(2, 42);
  const me = s.turn.player;
  const foe = 1 - me;
  s = arrange(s, {
    [`p${me}d0`]: [0, 5, 6],
    [`p${foe}d0`]: [0, 6, 3],
  });
  s.players[me].skills = (skills.me ?? []).map((id) => ({ id, active: true }));
  s.players[foe].skills = (skills.foe ?? []).map((id) => ({ id, active: true }));
  s.players[me].dominance = 3;
  s.players[foe].dominance = 3;
  s.players[me].research = 2;
  s.players[foe].research = 2;
  s.turn.actionsLeft = 3;
  return s;
}

describe('Curious (Prospectors; CE Option B)', () => {
  it('offers a peaceful move or research when actions reach 0 and neither attack nor conquer occurred', () => {
    let s = cardGame({ me: ['r-curious'] });
    const me = s.turn.player;
    // Spend 3 actions on peaceful reconfigures
    s = apply(s, { type: 'reconfigure', die: `p${me}d0` });
    s = apply(s, { type: 'reconfigure', die: `p${me}d0` });
    s = apply(s, { type: 'reconfigure', die: `p${me}d0` });
    expect(s.turn.actionsLeft).toBe(0);

    // With 0 actions, Curious allows research or peaceful move
    const legals = legalActions(s);
    expect(legals.some((a) => a.type === 'research')).toBe(true);
    expect(legals.some((a) => a.type === 'move')).toBe(true);
    expect(legals.some((a) => a.type === 'attack')).toBe(false);

    // Take the research action
    s = apply(s, { type: 'research' });
    expect(s.players[me].research).toBe(3);
    expect(s.turn.curiousUsed).toBe(true);

    // Now move and research are no longer offered via Curious
    const after = legalActions(s);
    expect(after.some((a) => a.type === 'research')).toBe(false);
    expect(after.some((a) => a.type === 'move')).toBe(false);
    expect(after).toEqual([{ type: 'endTurn' }]);

    // Engine rejects free ship abilities after Curious
    s.dice.find((d) => d.id === `p${me}d0`)!.value = 4;
    expect(() => apply(s, { type: 'change', die: `p${me}d0`, value: 3 })).toThrow('No actions allowed after using Prospectors');
  });

  it('does not offer curious actions if the player attacked during their turn', () => {
    let s = cardGame({ me: ['r-curious'] });
    const me = s.turn.player;
    s = apply(s, { type: 'attack', die: `p${me}d0`, target: `p${1 - me}d0` });
    // Resolve combat
    s = apply(s, { type: 'resolveCombat' });
    // Advance or not
    if (s.pending[0]?.kind === 'advance') s = apply(s, { type: 'advance', move: false });
    // Spend remaining actions
    while (s.turn.actionsLeft > 0) {
      s = apply(s, { type: 'reconfigure', die: `p${me}d0` });
    }
    expect(s.turn.actionsLeft).toBe(0);
    // Because attacked is true, no curious actions offered (a free ability, such as a Chameleon's change, still is)
    expect(legalActions(s).filter((a) => a.type !== 'change')).toEqual([{ type: 'endTurn' }]);
  });
});

describe('Calculating', () => {
  it('lets the player choose any number when a ship is placed in the scrapyard', () => {
    let s = cardGame({ foe: ['r-calculating'] });
    const me = s.turn.player;
    const foe = 1 - me;
    // Force attacker win in combat to destroy foe's ship
    s = apply(s, { type: 'attack', die: `p${me}d0`, target: `p${foe}d0` });
    // Set combat dice so attacker wins
    const combat = s.pending.find((p) => p.kind === 'combat')!;
    if (combat && combat.kind === 'combat') {
      combat.attacker.dice = [1];
      combat.defender.dice = [6];
    }
    s = apply(s, { type: 'resolveCombat' });
    // Attacker advances
    if (s.pending[0]?.kind === 'advance') s = apply(s, { type: 'advance', move: false });
    // Calculating triggers a clever prompt for foe on the destroyed ship with source = 'r-calculating'
    expect(s.pending[0]).toMatchObject({ kind: 'clever', player: foe, die: `p${foe}d0`, source: 'calculating' });
    s = apply(s, { type: 'clever', value: 1 });
    const destroyed = s.dice.find((d) => d.id === `p${foe}d0`)!;
    expect(destroyed.value).toBe(1);
    expect(destroyed.loc.zone).toBe('scrapyard');
  });
});

describe('Prideful', () => {
  it('triggers Infamy at dominance 4', () => {
    let s = cardGame({ me: ['r-prideful'] });
    const me = s.turn.player;
    s.players[me].dominance = 3;
    // Win combat to gain dominance
    s = apply(s, { type: 'attack', die: `p${me}d0`, target: `p${1 - me}d0` });
    const combat = s.pending.find((p) => p.kind === 'combat')!;
    if (combat && combat.kind === 'combat') {
      combat.attacker.dice = [1];
      combat.defender.dice = [6];
    }
    s = apply(s, { type: 'resolveCombat' });
    if (s.pending[0]?.kind === 'advance') s = apply(s, { type: 'advance', move: false });

    // Dominance reached 4, which triggers Infamy
    expect(s.players[me].dominance).toBe(4);
    expect(s.pending.some((p) => p.kind === 'infamy')).toBe(true);
  });

  it('allows the destroyer to take Prideful when destroying its owner’s ship', () => {
    let s = cardGame({ foe: ['r-prideful'] });
    const me = s.turn.player;
    const foe = 1 - me;
    s = apply(s, { type: 'attack', die: `p${me}d0`, target: `p${foe}d0` });
    const combat = s.pending.find((p) => p.kind === 'combat')!;
    if (combat && combat.kind === 'combat') {
      combat.attacker.dice = [1];
      combat.defender.dice = [6];
    }
    s = apply(s, { type: 'resolveCombat' });
    if (s.pending[0]?.kind === 'advance') s = apply(s, { type: 'advance', move: false });

    // Winner gets prideful steal decision
    expect(s.pending[0]).toMatchObject({ kind: 'prideful', player: me, victim: foe });
    s = apply(s, { type: 'prideful', take: true });

    expect(s.players[me].skills.some((sk) => sk.id === 'r-prideful')).toBe(true);
    expect(s.players[foe].skills.some((sk) => sk.id === 'r-prideful')).toBe(false);
  });

  it('triggers Infamy when a Prideful taken from the market takes effect at the end of the turn', () => {
    let s = cardGame();
    const me = s.turn.player;
    s.players[me].dominance = 5;
    s.market.skillRow[0] = 'r-prideful';
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];
    s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    // Not in effect yet while the turn lasts.
    expect(s.pending.some((p) => p.kind === 'infamy')).toBe(false);

    s = apply(s, { type: 'endTurn' });
    expect(s.turn.player).toBe(1 - me);
    expect(s.pending[0]).toMatchObject({ kind: 'infamy', player: me });
  });

  it('triggers Infamy when a Prideful disabled by Ruthless comes back', () => {
    let s = cardGame();
    const me = s.turn.player;
    const foe = 1 - me;
    s.players[foe].skills = [{ id: 'r-prideful', active: false, disabledUntil: me }];
    s.players[foe].dominance = 4;
    s = apply(s, { type: 'endTurn' });
    expect(s.pending.some((p) => p.kind === 'infamy')).toBe(false);
    s = apply(s, { type: 'endTurn' });
    expect(s.turn.player).toBe(me);
    expect(s.pending[0]).toMatchObject({ kind: 'infamy', player: foe });
  });

  it('does not trigger Infamy at the start of a turn without a lowered threshold', () => {
    let s = cardGame();
    const me = s.turn.player;
    // Dominance 6 kept from an Infamy that had nowhere to go: no new Infamy until Dominance rises.
    s.players[me].dominance = 6;
    s = apply(s, { type: 'endTurn' });
    s = apply(s, { type: 'endTurn' });
    expect(s.turn.player).toBe(me);
    expect(s.pending.some((p) => p.kind === 'infamy')).toBe(false);
  });
});

describe('Patient', () => {
  it('allows storing a tactic and playing it at the end of the turn', () => {
    let s = cardGame({ me: ['r-patient'] });
    const me = s.turn.player;
    s.market.tacticRow = ['r-aggression'];
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];

    // Store tactic
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 0, store: true });
    expect(s.players[me].storedTactics).toEqual(['r-aggression']);
    expect(s.players[me].dominance).toBe(3); // Not played yet

    // Spend actions
    s.turn.actionsLeft = 0;
    // Legal actions now include playStoredTactic
    expect(legalActions(s).some((a) => a.type === 'playStoredTactic')).toBe(true);

    s = apply(s, { type: 'playStoredTactic', card: 'r-aggression' });
    expect(s.players[me].storedTactics).toEqual([]);
    expect(s.players[me].dominance).toBe(5); // Aggression gives +2 dominance
    expect(s.turn.storedTacticPlayed).toBe(true);
  });

  it('allows playing a stored tactic even if ending turn with unused actions', () => {
    let s = cardGame({ me: ['r-patient'] });
    const me = s.turn.player;
    s.players[me].storedTactics = ['r-aggression'];
    expect(s.turn.actionsLeft).toBe(3);

    // Allowed even with 3 actions left
    expect(legalActions(s).some((a) => a.type === 'playStoredTactic')).toBe(true);

    s = apply(s, { type: 'playStoredTactic', card: 'r-aggression' });
    expect(s.players[me].storedTactics).toEqual([]);
    expect(s.players[me].dominance).toBe(5);
    expect(s.turn.actionsLeft).toBe(0);
    expect(s.turn.storedTacticPlayed).toBe(true);
    expect(legalActions(s)).toEqual([{ type: 'endTurn' }]);

    // Attempting further actions/abilities fails
    s.dice.find((d) => d.id === `p${me}d0`)!.value = 4;
    expect(() => apply(s, { type: 'change', die: `p${me}d0`, value: 3 })).toThrow('No actions allowed after playing a stored tactic');
  });

  it('lets the player take and store a face-up tactic when taking Patient, without using a pick', () => {
    let s = cardGame();
    const me = s.turn.player;
    s.market.skillRow = ['r-patient'];
    s.market.tacticRow = ['r-aggression', 'r-sabotage'];
    s.market.tacticDeck = ['r-warp-gate'];
    s.pending = [{ kind: 'takeCard', player: me, count: 2 }];

    s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    expect(s.pending[0]).toEqual({ kind: 'patientTactic', player: me });
    expect(legalActions(s)).toEqual([{ type: 'patientTactic' }, { type: 'patientTactic', index: 0 }, { type: 'patientTactic', index: 1 }]);

    s = apply(s, { type: 'patientTactic', index: 1 });
    expect(s.players[me].storedTactics).toEqual(['r-sabotage']);
    expect(s.market.tacticRow).toEqual(['r-warp-gate', 'r-aggression']);
    expect(s.pending[0]).toMatchObject({ kind: 'takeCard', count: 1 });
  });

  it('may decline the tactic, and skips the choice when no tactic is face up', () => {
    let s = cardGame();
    const me = s.turn.player;
    s.market.skillRow = ['r-patient', 'r-agile'];
    s.market.tacticRow = ['r-aggression'];
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];
    s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    s = apply(s, { type: 'patientTactic' });
    expect(s.players[me].storedTactics ?? []).toEqual([]);
    expect(s.market.tacticRow).toEqual(['r-aggression']);

    let t = cardGame();
    t.market.skillRow = ['r-patient'];
    t.market.tacticRow = [];
    t.market.tacticDeck = [];
    t.pending = [{ kind: 'takeCard', player: t.turn.player, count: 2 }];
    t = apply(t, { type: 'takeCard', deck: 'skill', index: 0 });
    expect(t.pending[0]).toMatchObject({ kind: 'takeCard', count: 1 });
  });

  it('triggers when Patient is chosen with Change of Heart', () => {
    let s = cardGame();
    const me = s.turn.player;
    s.market.skillDeck = ['r-patient', 'r-agile'];
    s.market.tacticRow = ['r-aggression'];
    s.pending = [{ kind: 'changeOfHeart', player: me }];
    s = apply(s, { type: 'changeOfHeart', skill: 'r-patient' });
    expect(s.pending[0]).toEqual({ kind: 'patientTactic', player: me });
  });

  it('stores the tactic before a skill-limit discard; discarding Patient then loses it', () => {
    let s = cardGame({ me: ['r-agile', 'r-ferocious', 'r-brutal'] });
    const me = s.turn.player;
    s.market.skillRow = ['r-patient'];
    s.market.tacticRow = ['r-aggression'];
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];
    s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    expect(s.pending.map((p) => p.kind)).toEqual(['patientTactic', 'discardSkill']);
    s = apply(s, { type: 'patientTactic', index: 0 });
    s = apply(s, { type: 'discardSkill', skill: 'r-patient' });
    expect(s.players[me].storedTactics).toEqual([]);
    expect(s.market.tacticDiscard).toContain('r-aggression');
  });
});

describe('Ruthless', () => {
  it('disables an enemy skill until the start of the attacker’s next turn', () => {
    let s = cardGame({ me: ['r-ruthless'], foe: ['r-agile'] });
    const me = s.turn.player;
    const foe = 1 - me;
    s = apply(s, { type: 'attack', die: `p${me}d0`, target: `p${foe}d0` });
    const combat = s.pending.find((p) => p.kind === 'combat')!;
    if (combat && combat.kind === 'combat') {
      combat.attacker.dice = [1];
      combat.defender.dice = [6];
    }
    s = apply(s, { type: 'resolveCombat' });
    if (s.pending[0]?.kind === 'advance') s = apply(s, { type: 'advance', move: false });

    // Ruthless prompts to disable enemy's skill
    expect(s.pending[0]).toMatchObject({ kind: 'ruthless', player: me, victim: foe });
    s = apply(s, { type: 'ruthless', skill: 'r-agile' });

    const agileSkill = s.players[foe].skills.find((sk) => sk.id === 'r-agile')!;
    expect(agileSkill.active).toBe(false);
    expect(agileSkill.disabledUntil).toBe(me);

    // End turn of player 'me'
    s = apply(s, { type: 'endTurn' });
    // Still disabled during foe's turn!
    expect(s.turn.player).toBe(foe);
    expect(s.players[foe].skills.find((sk) => sk.id === 'r-agile')!.active).toBe(false);

    // End foe's turn -> back to 'me'
    s = apply(s, { type: 'endTurn' });
    expect(s.turn.player).toBe(me);
    // Re-enabled at start of 'me's turn!
    expect(s.players[foe].skills.find((sk) => sk.id === 'r-agile')!.active).toBe(true);
  });

  it('does not re-enable disabled skills on a Momentum bonus turn', () => {
    let s = cardGame({ me: ['r-ruthless'], foe: ['r-agile'] });
    const me = s.turn.player;
    const foe = 1 - me;
    s.players[me].bonusTurns = [2]; // Queued momentum turn
    s = apply(s, { type: 'attack', die: `p${me}d0`, target: `p${foe}d0` });
    const combat = s.pending.find((p) => p.kind === 'combat')!;
    if (combat && combat.kind === 'combat') {
      combat.attacker.dice = [1];
      combat.defender.dice = [6];
    }
    s = apply(s, { type: 'resolveCombat' });
    if (s.pending[0]?.kind === 'advance') s = apply(s, { type: 'advance', move: false });
    s = apply(s, { type: 'ruthless', skill: 'r-agile' });

    // End current turn -> enters Momentum bonus turn for 'me'
    s = apply(s, { type: 'endTurn' });
    expect(s.turn.player).toBe(me);
    expect(s.turn.bonus).toBe(true);
    // Should still be disabled!
    expect(s.players[foe].skills.find((sk) => sk.id === 'r-agile')!.active).toBe(false);
  });
});

describe('Prideful edge cases', () => {
  it('triggers Infamy when stolen by a player whose dominance is 4', () => {
    let s = cardGame({ foe: ['r-prideful'] });
    const me = s.turn.player;
    const foe = 1 - me;
    s.players[me].dominance = 3; // Destroying foe ship will bring it to 4

    s = apply(s, { type: 'attack', die: `p${me}d0`, target: `p${foe}d0` });
    const combat = s.pending.find((p) => p.kind === 'combat')!;
    if (combat && combat.kind === 'combat') {
      combat.attacker.dice = [1];
      combat.defender.dice = [6];
    }
    s = apply(s, { type: 'resolveCombat' });
    if (s.pending[0]?.kind === 'advance') s = apply(s, { type: 'advance', move: false });

    // At this moment dominance is 4, but threshold without prideful was 6, so no infamy yet
    expect(s.players[me].dominance).toBe(4);
    expect(s.pending.some((p) => p.kind === 'infamy')).toBe(false);

    // Steal Prideful
    s = apply(s, { type: 'prideful', take: true });
    // Infamy should now be queued!
    expect(s.pending.some((p) => p.kind === 'infamy' && p.player === me)).toBe(true);
  });
});

describe('Patient edge cases', () => {
  it('allows storing a tactic drawn via peek', () => {
    let s = cardGame({ me: ['r-patient'] });
    const me = s.turn.player;
    s.market.tacticRow = ['r-momentum', 'r-show-of-force', 'r-aggression'];
    s.market.tacticDeck = ['r-warp-gate'];
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];

    // Pick 3rd card with store: true -> triggers peek
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 2, store: true });
    expect(s.pending[0]).toMatchObject({ kind: 'peek', player: me, deck: 'tactic', store: true });

    // Choose top of deck
    s = apply(s, { type: 'peekChoice', takeTop: true });
    // It should be stored, not played!
    expect(s.players[me].storedTactics).toContain('r-warp-gate');
  });

  it('peeks after reshuffling the discards into an empty deck', () => {
    let s = cardGame();
    const me = s.turn.player;
    s.market.tacticRow = ['r-momentum', 'r-show-of-force', 'r-aggression'];
    s.market.tacticDeck = [];
    s.market.tacticDiscard = ['r-warp-gate'];
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 2 });
    expect(s.pending[0]).toMatchObject({ kind: 'peek', player: me, deck: 'tactic', top: 'r-warp-gate' });
    expect(s.market.tacticDiscard).toEqual([]);
  });

  it('refuses to store a card without Patient, or a Skill', () => {
    const s = cardGame({ me: ['r-patient'] });
    const me = s.turn.player;
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];
    expect(() => apply(s, { type: 'takeCard', deck: 'skill', index: 0, store: true })).toThrow('Only a Tactic can be stored');
    s.players[me].skills = [];
    expect(() => apply(s, { type: 'takeCard', deck: 'tactic', index: 0, store: true })).toThrow('Only a Tactic can be stored');
  });

  it('refuses to play a stored tactic while a decision is open', () => {
    let s = cardGame({ me: ['r-patient'] });
    const me = s.turn.player;
    s.players[me].storedTactics = ['r-sabotage'];
    s = apply(s, { type: 'attack', die: `p${me}d0`, target: `p${1 - me}d0` });
    expect(s.pending[0].kind).toBe('combat');
    expect(() => apply(s, { type: 'playStoredTactic', card: 'r-sabotage' })).toThrow('Resolve the current decision first');
  });

  it('discards stored tactics to the market discard pile if Patient is discarded', () => {
    let s = cardGame({ me: ['r-patient', 'r-agile', 'r-ferocious'] });
    const me = s.turn.player;
    s.players[me].storedTactics = ['r-aggression', 'r-warp-gate'];
    s.pending = [{ kind: 'discardSkill', player: me, reason: 'limit' }];

    s = apply(s, { type: 'discardSkill', skill: 'r-patient' });
    expect(s.players[me].storedTactics).toEqual([]);
    expect(s.market.tacticDiscard).toContain('r-aggression');
    expect(s.market.tacticDiscard).toContain('r-warp-gate');
  });
});

describe('Calculating edge cases', () => {
  it('resolves ship numbers before unveiling in Unveil the Fleet', () => {
    let s = cardGame({ me: ['r-calculating'] });
    const me = s.turn.player;
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];
    s.market.tacticRow = ['r-unveil-the-fleet'];

    // Take Unveil the Fleet
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 0 });

    // The ship on board is destroyed, and Calculating choice should come BEFORE unveil
    expect(s.pending[0]).toMatchObject({ kind: 'clever', player: me });
    s = apply(s, { type: 'clever', value: 4 });

    // Now unveil is the active decision
    expect(s.pending[0]).toMatchObject({ kind: 'unveil', player: me });
  });
});

describe('attackChance', () => {
  // My 6 attacks the foe's 3 from the next space; with plain dice the attacker wins on 6 + x <= 3 + y.
  const odds = (skills: { me?: string[]; foe?: string[] }) => {
    const s = cardGame(skills);
    const me = s.turn.player;
    return attackChance(s, die(s, `p${me}d0`), die(s, `p${1 - me}d0`));
  };
  /** The attacker wins with total a (a roll plus 6) against the defender's 3 + y, ties included unless Stubborn. */
  const exact = (attackerRoll: (x: number) => number[], tieWins = true) => {
    let wins = 0;
    for (let x = 1; x <= 6; x++) {
      for (let y = 1; y <= 6; y++) {
        const rolls = attackerRoll(x);
        for (const r of rolls) if (6 + r < 3 + y || (tieWins && 6 + r === 3 + y)) wins += 1 / rolls.length;
      }
    }
    return wins / 36;
  };

  it('is the plain-dice odds without combat skills', () => {
    expect(odds({ me: ['r-agile'] })).toBeCloseTo(attackOdds(6, 3));
  });

  it('counts skills on both sides', () => {
    expect(odds({ me: ['r-rational'] })).toBeCloseTo(exact(() => [3]));
    expect(odds({ me: ['r-ferocious'] })).toBeCloseTo(exact((x) => [x - 1]));
    expect(odds({ foe: ['r-stubborn'] })).toBeCloseTo(exact((x) => [x], false));
    // Brutal: the lower of two dice, so a 1 is eleven times as likely as a 6.
    const brutal = odds({ me: ['r-brutal'] });
    expect(brutal).toBeGreaterThan(attackOdds(6, 3));
    expect(brutal).toBeCloseTo(exact((x) => Array.from({ length: 6 }, (_, k) => Math.min(x, k + 1))));
  });

  it('names what changes the odds, beyond the ships and dice', () => {
    const factors = (skills: { me?: string[]; foe?: string[] }) => {
      const s = cardGame(skills);
      const me = s.turn.player;
      return attackFactors(s, die(s, `p${me}d0`), die(s, `p${1 - me}d0`));
    };
    expect(factors({ me: ['r-agile'] })).toEqual({ attacker: [], defender: [] });
    expect(factors({ me: ['r-ferocious'], foe: ['r-stubborn'] })).toEqual({
      attacker: ['Armour Piercing −1'],
      defender: ['Entrenched: wins ties'],
    });
    expect(factors({ me: ['r-rational'] }).attacker).toEqual(['Drill Sergeant: rolls 3']);
    expect(factors({ me: ['r-brutal'] }).attacker).toEqual(['Paired Cannons: lowest of 2 dice']);
  });
});
