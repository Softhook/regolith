/** Skills / Command cards used as an action of their own. What every skill does is in skillRules.ts. */
import { transport } from './abilities';
import { same } from './board';
import { startCombat } from './combat';
import {
  destroyShip,
  fail,
  gainResearch,
  headOf,
  log,
  note,
  logTo,
  loseDominance,
  markAbility,
  markSeen,
  name,
  oncePerTurn,
  ownShip,
  requireActionPhase,
  requireSkill,
  aShip,
  shipName,
  type Handlers,
} from './core';
import { cardName, card } from './data';
import { boardLoc, cellOf, die } from './lookups';
import { canGainResearch, tacticalOptions } from './queries';
import { hasPower } from './rules';
import { ruleOf, skillCard, type SkillRule } from './skillRules';
import type { Action, GameState, PlayerId } from './types';

export const skillHandlers = {
  composed(s) {
    const t = requireActionPhase(s);
    requireSkill(s, t.player, 'composed');
    if (s.players[t.player].dominance <= 1) fail('No power to lose');
    // Under Righteous both halves would do nothing (RULE-SUGGESTIONS #33).
    if (!canGainResearch(s, t.player)) fail('You cannot gain research');
    oncePerTurn(s, 'composed');
    loseDominance(s, t.player, 1);
    gainResearch(s, t.player, 3);
  },
  ambitious(s) {
    const t = requireActionPhase(s);
    requireSkill(s, t.player, 'ambitious');
    oncePerTurn(s, 'ambitious');
    const pl = s.players[t.player];
    t.actionsLeft++;
    pl.ambitionTokens++;
    if (pl.ambitionTokens >= 3) {
      // The card held, which another edition's or mode's deck may name differently.
      const id = skillCard(s, t.player, 'ambitious')!;
      pl.skills = pl.skills.filter((x) => x.id !== id);
      pl.ambitionTokens = 0;
      s.market.skillDiscard.push(id);
      log(s, `${pl.name}'s ${card(id).name} skill is exhausted.`, t.player);
    }
  },
  flexible(s, a) {
    const t = requireActionPhase(s);
    requireSkill(s, t.player, 'flexible');
    const d = ownShip(s, a.die, 'board');
    const v = d.value + a.delta;
    if (v < 1 || v > 6) fail('Mech numbers range from 1 to 6');
    oncePerTurn(s, 'flexible');
    const was = shipName(s, d);
    d.value = v;
    markSeen(s, d);
    note(s, `${name(s, d.owner)} adjusts their ${was} to ${aShip(s, d)} (${cardName('flexible')}).`, d.owner);
  },
  tactical(s, a) {
    const t = requireActionPhase(s);
    requireSkill(s, t.player, 'tactical');
    const d = ownShip(s, a.die, 'board');
    // Tactical moves the ship, and leaves it its own move for the turn.
    const use = () => oncePerTurn(s, 'tactical');
    if (a.passenger) {
      // Flagship Transport over the 1 space (forum consensus, BGG thread 1093051).
      if (!hasPower(s, d, 'transport')) fail('Only a mech with Carry & Move can transport');
      if (!a.to || !a.drop) fail('Invalid carry');
      const fly = transport(s, d, a.passenger, a.to, a.drop, 1);
      use();
      markAbility(s, d);
      fly();
      logTo(
        s,
        d.owner,
        `${name(s, d.owner)}'s ${shipName(s, d)} carries their ${shipName(s, die(s, a.passenger))} one space`,
        a.to,
        ` (${cardName('tactical')})`,
      );
      return;
    }
    const opts = tacticalOptions(s, d.id);
    if (a.target) {
      const opt = opts.attacks.find((x) => x.die.id === a.target);
      if (!opt) fail('Target must be adjacent');
      use();
      if (opt.diagonal) markAbility(s, d); // Interceptor manoeuvre
      startCombat(s, d, opt.die, cellOf(d)!);
      return;
    }
    const opt = a.to && opts.moves.find((x) => same(x.cell, a.to!));
    if (!opt) fail('Move one space to an empty space');
    use();
    if (opt.diagonal) markAbility(s, d);
    d.loc = boardLoc(opt.cell);
    logTo(s, d.owner, `${name(s, d.owner)} moves their ${shipName(s, d)} one space`, opt.cell, ` (${cardName('tactical')})`);
  },
  clever(s, a) {
    const head = headOf(s, 'clever', 'No mech number to choose');
    if (a.value < 1 || a.value > 6) fail('Mech numbers range from 1 to 6');
    if (head.options && !head.options.includes(a.value)) fail(`${cardName('clever')} changes the number by at most 1`);
    s.pending.shift();
    const d = die(s, head.die);
    d.value = a.value;
    markSeen(s, d);
    const skill = head.source === 'calculating' ? cardName('calculating') : cardName('clever');
    note(
      s,
      `${name(s, head.player)} makes ${d.loc.zone === 'board' ? 'it' : 'their scrapped mech'} ${aShip(s, d)} (${skill}).`,
      head.player,
    );
  },
  resourceful(s, a) {
    const t = requireActionPhase(s);
    requireSkill(s, t.player, 'resourceful');
    const d = ownShip(s, a.die, 'board');
    oncePerTurn(s, 'resourceful');
    note(s, `${name(s, d.owner)} scraps their ${shipName(s, d)} for an extra action (${cardName('resourceful')}).`, d.owner);
    destroyShip(s, d);
    t.actionsLeft++;
  },
} satisfies Partial<Handlers>;

/** CE Curious, when the step from `prev` to `s` spent its extra Move or Research. */
export function curiousUsed(prev: GameState, s: GameState): { player: PlayerId; card: string } | undefined {
  if (prev.turn.curiousUsed || !s.turn.curiousUsed) return undefined;
  const card = skillCard(prev, prev.turn.player, 'curious');
  return card ? { player: prev.turn.player, card } : undefined;
}

/**
 * The skill card `action` uses, and its owner, judged before the action (Ambitious may be gone after).
 * None for an action that declines a skill's offer, or that isn't a skill's at all.
 */
export function skillUsed(s: GameState, a: Action): { player: PlayerId; card: string } | undefined {
  const head = s.pending[0];
  const find = (player: PlayerId, test: (r: SkillRule) => unknown) => {
    const card = s.players[player].skills.find((sk) => sk.active && test(ruleOf(sk.id)))?.id;
    return card ? { player, card } : undefined;
  };
  switch (a.type) {
    case 'clever':
      return head?.kind === 'clever'
        ? find(head.player, (r) => (head.source === 'calculating' ? r.chooseScrapyardNumber : r.adjustReconfigure))
        : undefined;
    case 'dangerous':
      return a.destroy && head?.kind === 'dangerous' ? find(head.player, (r) => r.combat?.destroyBoth) : undefined;
    case 'ruthless':
      return a.skill && head?.kind === 'ruthless' ? find(head.player, (r) => r.disableSkillOnDestroy) : undefined;
    case 'profiteer':
      return head?.kind === 'takeCard' ? find(head.player, (r) => r.missileForConquest) : undefined;
    default:
      // Activated skills are actions of the player's own turn.
      return find(s.turn.player, (r) => r.activated === a.type);
  }
}
