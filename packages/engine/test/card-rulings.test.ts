import { describe, expect, it } from 'vitest';
import { apply, attackChance, attackFactors, attackOdds, createGame, die, legalActions, type GameState } from '../src';
import { arrange, players, quickStart } from './helpers';

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
  s.players[me].power = 3;
  s.players[foe].power = 3;
  s.players[me].research = 2;
  s.players[foe].research = 2;
  s.turn.actionsLeft = 3;
  return s;
}

describe('Prospectors (Prospectors; CE Option B)', () => {
  it('offers a peaceful move or research when actions reach 0 and neither attack nor claim occurred', () => {
    let s = cardGame({ me: ['r-prospectors'] });
    const me = s.turn.player;
    // Spend 3 actions on peaceful refits
    s = apply(s, { type: 'refit', die: `p${me}d0` });
    s = apply(s, { type: 'refit', die: `p${me}d0` });
    s = apply(s, { type: 'refit', die: `p${me}d0` });
    expect(s.turn.actionsLeft).toBe(0);

    // With 0 actions, Prospectors allows research or peaceful move
    const legals = legalActions(s);
    expect(legals.some((a) => a.type === 'research')).toBe(true);
    expect(legals.some((a) => a.type === 'move')).toBe(true);
    expect(legals.some((a) => a.type === 'attack')).toBe(false);

    // Take the research action
    s = apply(s, { type: 'research' });
    expect(s.players[me].research).toBe(3);
    expect(s.turn.prospectorsUsed).toBe(true);

    // Now move and research are no longer offered via Prospectors
    const after = legalActions(s);
    expect(after.some((a) => a.type === 'research')).toBe(false);
    expect(after.some((a) => a.type === 'move')).toBe(false);
    expect(after).toEqual([{ type: 'endTurn' }]);

    // Engine rejects free mech abilities after Prospectors
    s.dice.find((d) => d.id === `p${me}d0`)!.value = 4;
    expect(() => apply(s, { type: 'change', die: `p${me}d0`, value: 3 })).toThrow('No actions allowed after using Prospectors');
  });

  it('does not offer Prospectors actions if the player attacked during their turn', () => {
    let s = cardGame({ me: ['r-prospectors'] });
    const me = s.turn.player;
    s = apply(s, { type: 'attack', die: `p${me}d0`, target: `p${1 - me}d0` });
    // Resolve combat
    s = apply(s, { type: 'resolveCombat' });
    // Advance or not
    if (s.pending[0]?.kind === 'advance') s = apply(s, { type: 'advance', move: false });
    // Spend remaining actions
    while (s.turn.actionsLeft > 0) {
      s = apply(s, { type: 'refit', die: `p${me}d0` });
    }
    expect(s.turn.actionsLeft).toBe(0);
    // Because attacked is true, no Prospectors actions offered (a free ability, such as a Chameleon's change, still is)
    expect(legalActions(s).filter((a) => a.type !== 'change')).toEqual([{ type: 'endTurn' }]);
  });
});

describe('Remodel', () => {
  it('lets the player choose any number when a mech is placed in the salvage yard', () => {
    let s = cardGame({ foe: ['r-remodel'] });
    const me = s.turn.player;
    const foe = 1 - me;
    // Force attacker win in combat to destroy foe's mech
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
    // Remodel triggers an Engineering prompt for foe on the destroyed mech with source = 'r-remodel'
    expect(s.pending[0]).toMatchObject({ kind: 'engineering', player: foe, die: `p${foe}d0`, source: 'remodel' });
    s = apply(s, { type: 'engineering', value: 1 });
    const destroyed = s.dice.find((d) => d.id === `p${foe}d0`)!;
    expect(destroyed.value).toBe(1);
    expect(destroyed.loc.zone).toBe('salvageYard');
  });
});

describe('Stolen Flag', () => {
  it('triggers Take Over at power 4', () => {
    let s = cardGame({ me: ['r-stolen-flag'] });
    const me = s.turn.player;
    s.players[me].power = 3;
    // Win combat to gain power
    s = apply(s, { type: 'attack', die: `p${me}d0`, target: `p${1 - me}d0` });
    const combat = s.pending.find((p) => p.kind === 'combat')!;
    if (combat && combat.kind === 'combat') {
      combat.attacker.dice = [1];
      combat.defender.dice = [6];
    }
    s = apply(s, { type: 'resolveCombat' });
    if (s.pending[0]?.kind === 'advance') s = apply(s, { type: 'advance', move: false });

    // Power reached 4, which triggers Take Over
    expect(s.players[me].power).toBe(4);
    expect(s.pending.some((p) => p.kind === 'takeOver')).toBe(true);
  });

  it('allows the destroyer to take Stolen Flag when destroying its owner’s mech', () => {
    let s = cardGame({ foe: ['r-stolen-flag'] });
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

    // Winner gets Stolen Flag steal decision
    expect(s.pending[0]).toMatchObject({ kind: 'stolenFlag', player: me, victim: foe });
    s = apply(s, { type: 'stolenFlag', take: true });

    expect(s.players[me].skills.some((sk) => sk.id === 'r-stolen-flag')).toBe(true);
    expect(s.players[foe].skills.some((sk) => sk.id === 'r-stolen-flag')).toBe(false);
  });

  it('triggers Take Over when a Stolen Flag taken from the market takes effect at the end of the turn', () => {
    let s = cardGame();
    const me = s.turn.player;
    s.players[me].power = 5;
    s.market.skillRow[0] = 'r-stolen-flag';
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];
    s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    // Not in effect yet while the turn lasts.
    expect(s.pending.some((p) => p.kind === 'takeOver')).toBe(false);

    s = apply(s, { type: 'endTurn' });
    expect(s.turn.player).toBe(1 - me);
    expect(s.pending[0]).toMatchObject({ kind: 'takeOver', player: me });
  });

  it('triggers Take Over when a Stolen Flag disabled by Signal Jammer comes back', () => {
    let s = cardGame();
    const me = s.turn.player;
    const foe = 1 - me;
    s.players[foe].skills = [{ id: 'r-stolen-flag', active: false, disabledUntil: me }];
    s.players[foe].power = 4;
    s = apply(s, { type: 'endTurn' });
    expect(s.pending.some((p) => p.kind === 'takeOver')).toBe(false);
    s = apply(s, { type: 'endTurn' });
    expect(s.turn.player).toBe(me);
    expect(s.pending[0]).toMatchObject({ kind: 'takeOver', player: foe });
  });

  it('does not trigger Take Over at the start of a turn without a lowered threshold', () => {
    let s = cardGame();
    const me = s.turn.player;
    // Power 6 kept from an Take Over that had nowhere to go: no new Take Over until Power rises.
    s.players[me].power = 6;
    s = apply(s, { type: 'endTurn' });
    s = apply(s, { type: 'endTurn' });
    expect(s.turn.player).toBe(me);
    expect(s.pending.some((p) => p.kind === 'takeOver')).toBe(false);
  });
});

describe('Strategic Plan', () => {
  it('allows storing a tactic and playing it at the end of the turn', () => {
    let s = cardGame({ me: ['r-strategic-plan'] });
    const me = s.turn.player;
    s.market.tacticRow = ['r-power-grab'];
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];

    // Store tactic
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 0, store: true });
    expect(s.players[me].storedTactics).toEqual(['r-power-grab']);
    expect(s.players[me].power).toBe(3); // Not played yet

    // Spend actions
    s.turn.actionsLeft = 0;
    // Legal actions now include strategicPlanPlay
    expect(legalActions(s).some((a) => a.type === 'strategicPlanPlay')).toBe(true);

    s = apply(s, { type: 'strategicPlanPlay', card: 'r-power-grab' });
    expect(s.players[me].storedTactics).toEqual([]);
    expect(s.players[me].power).toBe(5); // Power Grab gives +2 power
    expect(s.turn.storedTacticPlayed).toBe(true);
  });

  it('allows playing a stored tactic even if ending turn with unused actions', () => {
    let s = cardGame({ me: ['r-strategic-plan'] });
    const me = s.turn.player;
    s.players[me].storedTactics = ['r-power-grab'];
    expect(s.turn.actionsLeft).toBe(3);

    // Allowed even with 3 actions left
    expect(legalActions(s).some((a) => a.type === 'strategicPlanPlay')).toBe(true);

    s = apply(s, { type: 'strategicPlanPlay', card: 'r-power-grab' });
    expect(s.players[me].storedTactics).toEqual([]);
    expect(s.players[me].power).toBe(5);
    expect(s.turn.actionsLeft).toBe(0);
    expect(s.turn.storedTacticPlayed).toBe(true);
    expect(legalActions(s)).toEqual([{ type: 'endTurn' }]);

    // Attempting further actions/abilities fails
    s.dice.find((d) => d.id === `p${me}d0`)!.value = 4;
    expect(() => apply(s, { type: 'change', die: `p${me}d0`, value: 3 })).toThrow('No actions allowed after playing a stored tactic');
  });

  it('lets the player take and store a face-up tactic when taking Strategic Plan, without using a pick', () => {
    let s = cardGame();
    const me = s.turn.player;
    s.market.skillRow = ['r-strategic-plan'];
    s.market.tacticRow = ['r-power-grab', 'r-sabotage'];
    s.market.tacticDeck = ['r-ice-tunnel'];
    s.pending = [{ kind: 'takeCard', player: me, count: 2 }];

    s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    expect(s.pending[0]).toEqual({ kind: 'strategicPlanTactic', player: me });
    expect(legalActions(s)).toEqual([
      { type: 'strategicPlanTactic' },
      { type: 'strategicPlanTactic', index: 0 },
      { type: 'strategicPlanTactic', index: 1 },
    ]);

    s = apply(s, { type: 'strategicPlanTactic', index: 1 });
    expect(s.players[me].storedTactics).toEqual(['r-sabotage']);
    expect(s.market.tacticRow).toEqual(['r-ice-tunnel', 'r-power-grab']);
    expect(s.pending[0]).toMatchObject({ kind: 'takeCard', count: 1 });
  });

  it('may decline the tactic, and skips the choice when no tactic is face up', () => {
    let s = cardGame();
    const me = s.turn.player;
    s.market.skillRow = ['r-strategic-plan', 'r-tune-up'];
    s.market.tacticRow = ['r-power-grab'];
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];
    s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    s = apply(s, { type: 'strategicPlanTactic' });
    expect(s.players[me].storedTactics ?? []).toEqual([]);
    expect(s.market.tacticRow).toEqual(['r-power-grab']);

    let t = cardGame();
    t.market.skillRow = ['r-strategic-plan'];
    t.market.tacticRow = [];
    t.market.tacticDeck = [];
    t.pending = [{ kind: 'takeCard', player: t.turn.player, count: 2 }];
    t = apply(t, { type: 'takeCard', deck: 'skill', index: 0 });
    expect(t.pending[0]).toMatchObject({ kind: 'takeCard', count: 1 });
  });

  /** A new game with Strategic Plan among this seat's two starting skills, and every player before it through their draft. */
  function draftingStrategicPlan(seat: number) {
    let s = createGame({ players: players(2), seed: 1, mode: 'regolith' });
    const drafts = s.pending.flatMap((x) => (x.kind === 'skillDraft' ? [x] : []));
    const swapIn = (list: string[]) => {
      const i = list.indexOf('r-strategic-plan');
      if (i >= 0) [list[i], drafts[seat].options[0]] = [drafts[seat].options[0], list[i]];
    };
    swapIn(s.market.skillRow);
    swapIn(s.market.skillDeck);
    for (const d of drafts) if (d !== drafts[seat]) swapIn(d.options);
    for (let i = 0; i < seat; i++) {
      s = apply(s, { type: 'setupKeep' });
      s = apply(s, { type: 'draftSkill', skill: drafts[i].options[0] });
    }
    return apply(s, { type: 'setupKeep' });
  }

  it('triggers when Strategic Plan is the starting skill, then setup goes on', () => {
    let s = draftingStrategicPlan(0);
    s = apply(s, { type: 'draftSkill', skill: 'r-strategic-plan' });
    expect(s.pending[0]).toEqual({ kind: 'strategicPlanTactic', player: 0 });
    const tactic = s.market.tacticRow[0];
    s = apply(s, { type: 'strategicPlanTactic', index: 0 });
    expect(s.players[0].storedTactics).toEqual([tactic]);
    expect(s.pending[0]).toMatchObject({ kind: 'setupRoll', player: 1 });
  });

  it('starts drop once the last player to draft Strategic Plan has settled the tactic, taken or not', () => {
    for (const index of [0, undefined]) {
      let s = draftingStrategicPlan(1);
      s = apply(s, { type: 'draftSkill', skill: 'r-strategic-plan' });
      expect(s.pending).toEqual([{ kind: 'strategicPlanTactic', player: 1 }]);
      s = apply(s, { type: 'strategicPlanTactic', index });
      expect(s.pending.map((p) => p.kind)).toEqual(['placeStart', 'placeStart']);
    }
  });

  it('triggers when Strategic Plan is chosen with Headhunter', () => {
    let s = cardGame();
    const me = s.turn.player;
    s.market.skillDeck = ['r-strategic-plan', 'r-tune-up'];
    s.market.tacticRow = ['r-power-grab'];
    s.pending = [{ kind: 'headhunter', player: me }];
    s = apply(s, { type: 'headhunter', skill: 'r-strategic-plan' });
    expect(s.pending[0]).toEqual({ kind: 'strategicPlanTactic', player: me });
  });

  it('stores the tactic before a skill-limit discard; discarding Strategic Plan then loses it', () => {
    let s = cardGame({ me: ['r-tune-up', 'r-armour-piercing', 'r-paired-cannons'] });
    const me = s.turn.player;
    s.market.skillRow = ['r-strategic-plan'];
    s.market.tacticRow = ['r-power-grab'];
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];
    s = apply(s, { type: 'takeCard', deck: 'skill', index: 0 });
    expect(s.pending.map((p) => p.kind)).toEqual(['strategicPlanTactic', 'discardSkill']);
    s = apply(s, { type: 'strategicPlanTactic', index: 0 });
    s = apply(s, { type: 'discardSkill', skill: 'r-strategic-plan' });
    expect(s.players[me].storedTactics).toEqual([]);
    expect(s.market.tacticDiscard).toContain('r-power-grab');
  });
});

describe('Signal Jammer', () => {
  it('disables an enemy skill until the start of the attacker’s next turn', () => {
    let s = cardGame({ me: ['r-signal-jammer'], foe: ['r-tune-up'] });
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

    // Signal Jammer prompts to disable enemy's skill
    expect(s.pending[0]).toMatchObject({ kind: 'signalJammer', player: me, victim: foe });
    s = apply(s, { type: 'signalJammer', skill: 'r-tune-up' });

    const tuneUpSkill = s.players[foe].skills.find((sk) => sk.id === 'r-tune-up')!;
    expect(tuneUpSkill.active).toBe(false);
    expect(tuneUpSkill.disabledUntil).toBe(me);

    // End turn of player 'me'
    s = apply(s, { type: 'endTurn' });
    // Still disabled during foe's turn!
    expect(s.turn.player).toBe(foe);
    expect(s.players[foe].skills.find((sk) => sk.id === 'r-tune-up')!.active).toBe(false);

    // End foe's turn -> back to 'me'
    s = apply(s, { type: 'endTurn' });
    expect(s.turn.player).toBe(me);
    // Re-enabled at start of 'me's turn!
    expect(s.players[foe].skills.find((sk) => sk.id === 'r-tune-up')!.active).toBe(true);
  });

  it('does not re-enable disabled skills on a Forced March bonus turn', () => {
    let s = cardGame({ me: ['r-signal-jammer'], foe: ['r-tune-up'] });
    const me = s.turn.player;
    const foe = 1 - me;
    s.players[me].bonusTurns = [2]; // Queued Forced March turn
    s = apply(s, { type: 'attack', die: `p${me}d0`, target: `p${foe}d0` });
    const combat = s.pending.find((p) => p.kind === 'combat')!;
    if (combat && combat.kind === 'combat') {
      combat.attacker.dice = [1];
      combat.defender.dice = [6];
    }
    s = apply(s, { type: 'resolveCombat' });
    if (s.pending[0]?.kind === 'advance') s = apply(s, { type: 'advance', move: false });
    s = apply(s, { type: 'signalJammer', skill: 'r-tune-up' });

    // End current turn -> enters Forced March bonus turn for 'me'
    s = apply(s, { type: 'endTurn' });
    expect(s.turn.player).toBe(me);
    expect(s.turn.bonus).toBe(true);
    // Should still be disabled!
    expect(s.players[foe].skills.find((sk) => sk.id === 'r-tune-up')!.active).toBe(false);
  });
});

describe('Stolen Flag edge cases', () => {
  it('triggers Take Over when stolen by a player whose power is 4', () => {
    let s = cardGame({ foe: ['r-stolen-flag'] });
    const me = s.turn.player;
    const foe = 1 - me;
    s.players[me].power = 3; // Destroying foe mech will bring it to 4

    s = apply(s, { type: 'attack', die: `p${me}d0`, target: `p${foe}d0` });
    const combat = s.pending.find((p) => p.kind === 'combat')!;
    if (combat && combat.kind === 'combat') {
      combat.attacker.dice = [1];
      combat.defender.dice = [6];
    }
    s = apply(s, { type: 'resolveCombat' });
    if (s.pending[0]?.kind === 'advance') s = apply(s, { type: 'advance', move: false });

    // At this moment power is 4, but threshold without Stolen Flag was 6, so no Take Over yet
    expect(s.players[me].power).toBe(4);
    expect(s.pending.some((p) => p.kind === 'takeOver')).toBe(false);

    // Steal Stolen Flag
    s = apply(s, { type: 'stolenFlag', take: true });
    // Take Over should now be queued!
    expect(s.pending.some((p) => p.kind === 'takeOver' && p.player === me)).toBe(true);
  });
});

describe('Strategic Plan edge cases', () => {
  it('allows storing a tactic drawn via peek', () => {
    let s = cardGame({ me: ['r-strategic-plan'] });
    const me = s.turn.player;
    s.market.tacticRow = ['r-forced-march', 'r-orbital-cannon', 'r-power-grab'];
    s.market.tacticDeck = ['r-ice-tunnel'];
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];

    // Pick 3rd card with store: true -> triggers peek
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 2, store: true });
    expect(s.pending[0]).toMatchObject({ kind: 'peek', player: me, deck: 'tactic', store: true });

    // Choose top of deck
    s = apply(s, { type: 'peekChoice', takeTop: true });
    // It should be stored, not played!
    expect(s.players[me].storedTactics).toContain('r-ice-tunnel');
  });

  it('peeks after reshuffling the discards into an empty deck', () => {
    let s = cardGame();
    const me = s.turn.player;
    s.market.tacticRow = ['r-forced-march', 'r-orbital-cannon', 'r-power-grab'];
    s.market.tacticDeck = [];
    s.market.tacticDiscard = ['r-ice-tunnel'];
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 2 });
    expect(s.pending[0]).toMatchObject({ kind: 'peek', player: me, deck: 'tactic', top: 'r-ice-tunnel' });
    expect(s.market.tacticDiscard).toEqual([]);
  });

  it('refuses to store a card without Strategic Plan, or a Skill', () => {
    const s = cardGame({ me: ['r-strategic-plan'] });
    const me = s.turn.player;
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];
    expect(() => apply(s, { type: 'takeCard', deck: 'skill', index: 0, store: true })).toThrow('Only a Tactic can be stored');
    s.players[me].skills = [];
    expect(() => apply(s, { type: 'takeCard', deck: 'tactic', index: 0, store: true })).toThrow('Only a Tactic can be stored');
  });

  it('refuses to play a stored tactic while a decision is open', () => {
    let s = cardGame({ me: ['r-strategic-plan'] });
    const me = s.turn.player;
    s.players[me].storedTactics = ['r-sabotage'];
    s = apply(s, { type: 'attack', die: `p${me}d0`, target: `p${1 - me}d0` });
    expect(s.pending[0].kind).toBe('combat');
    expect(() => apply(s, { type: 'strategicPlanPlay', card: 'r-sabotage' })).toThrow('Resolve the current decision first');
  });

  it('discards stored tactics to the market discard pile if Strategic Plan is discarded', () => {
    let s = cardGame({ me: ['r-strategic-plan', 'r-tune-up', 'r-armour-piercing'] });
    const me = s.turn.player;
    s.players[me].storedTactics = ['r-power-grab', 'r-ice-tunnel'];
    s.pending = [{ kind: 'discardSkill', player: me, reason: 'limit' }];

    s = apply(s, { type: 'discardSkill', skill: 'r-strategic-plan' });
    expect(s.players[me].storedTactics).toEqual([]);
    expect(s.market.tacticDiscard).toContain('r-power-grab');
    expect(s.market.tacticDiscard).toContain('r-ice-tunnel');
  });
});

describe('Remodel edge cases', () => {
  it('resolves mech numbers before invading in Invasion', () => {
    let s = cardGame({ me: ['r-remodel'] });
    const me = s.turn.player;
    s.pending = [{ kind: 'takeCard', player: me, count: 1 }];
    s.market.tacticRow = ['r-invasion'];

    // Take Invasion
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 0 });

    // The mech on board is destroyed, and Remodel choice should come BEFORE Invasion
    expect(s.pending[0]).toMatchObject({ kind: 'engineering', player: me });
    s = apply(s, { type: 'engineering', value: 4 });

    // Now Invasion is the active decision
    expect(s.pending[0]).toMatchObject({ kind: 'invasion', player: me });
  });
});

describe('attackChance', () => {
  // My 6 attacks the foe's 3 from the next space; with plain dice the attacker wins on 6 + x <= 3 + y.
  const odds = (skills: { me?: string[]; foe?: string[] }) => {
    const s = cardGame(skills);
    const me = s.turn.player;
    return attackChance(s, die(s, `p${me}d0`), die(s, `p${1 - me}d0`));
  };
  /** The attacker wins with total a (a roll plus 6) against the defender's 3 + y, ties included unless Entrenched. */
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
    expect(odds({ me: ['r-tune-up'] })).toBeCloseTo(attackOdds(6, 3));
  });

  it('counts skills on both sides', () => {
    expect(odds({ me: ['r-drill-sergeant'] })).toBeCloseTo(exact(() => [3]));
    expect(odds({ me: ['r-armour-piercing'] })).toBeCloseTo(exact((x) => [x - 1]));
    expect(odds({ foe: ['r-entrenched'] })).toBeCloseTo(exact((x) => [x], false));
    // Paired Cannons: the lower of two dice, so a 1 is eleven times as likely as a 6.
    const pairedCannons = odds({ me: ['r-paired-cannons'] });
    expect(pairedCannons).toBeGreaterThan(attackOdds(6, 3));
    expect(pairedCannons).toBeCloseTo(exact((x) => Array.from({ length: 6 }, (_, k) => Math.min(x, k + 1))));
  });

  it('names what changes the odds, beyond the mechs and dice', () => {
    const factors = (skills: { me?: string[]; foe?: string[] }) => {
      const s = cardGame(skills);
      const me = s.turn.player;
      return attackFactors(s, die(s, `p${me}d0`), die(s, `p${1 - me}d0`));
    };
    expect(factors({ me: ['r-tune-up'] })).toEqual({ attacker: [], defender: [] });
    expect(factors({ me: ['r-armour-piercing'], foe: ['r-entrenched'] })).toEqual({
      attacker: ['Armour Piercing −1'],
      defender: ['Entrenched: wins ties'],
    });
    expect(factors({ me: ['r-drill-sergeant'] }).attacker).toEqual(['Drill Sergeant: rolls 3']);
    expect(factors({ me: ['r-paired-cannons'] }).attacker).toEqual(['Paired Cannons: lowest of 2 dice']);
  });
});
