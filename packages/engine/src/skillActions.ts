/** Skills used as an action of their own. What every skill does is in skillRules.ts. */
import { carryMech } from './abilities';
import { same } from './board';
import { startCombat } from './combat';
import {
  destroyMech,
  fail,
  gainResearch,
  headOf,
  log,
  note,
  logTo,
  losePower,
  markAbility,
  markSeen,
  name,
  oncePerTurn,
  ownMech,
  requireActionPhase,
  requireSkill,
  aMech,
  mechName,
  type Handlers,
} from './core';
import { cardName, card } from './data';
import { boardLoc, cellOf, die } from './lookups';
import { canGainResearch, advanceSkillOptions } from './queries';
import { hasAbility } from './rules';
import { ruleOf, skillCard, type SkillRule } from './skillRules';
import type { Action, GameState, PlayerId } from './types';

export const skillHandlers = {
  standDown(s) {
    const t = requireActionPhase(s);
    requireSkill(s, t.player, 'stand-down');
    if (s.players[t.player].power <= 1) fail('No power to lose');
    // Under Fanatics both halves would do nothing (RULES.md ruling 12).
    if (!canGainResearch(s, t.player)) fail('You cannot gain research');
    oncePerTurn(s, 'stand-down');
    losePower(s, t.player, 1);
    gainResearch(s, t.player, 3);
  },
  finalPush(s) {
    const t = requireActionPhase(s);
    requireSkill(s, t.player, 'final-push');
    oncePerTurn(s, 'final-push');
    const pl = s.players[t.player];
    t.actionsLeft++;
    pl.finalPushTokens++;
    if (pl.finalPushTokens >= 3) {
      // The card held, which another edition's or mode's deck may name differently.
      const id = skillCard(s, t.player, 'final-push')!;
      pl.skills = pl.skills.filter((x) => x.id !== id);
      pl.finalPushTokens = 0;
      s.market.skillDiscard.push(id);
      log(s, `${pl.name}'s ${card(id).name} skill is exhausted.`, t.player);
    }
  },
  fieldRefit(s, a) {
    const t = requireActionPhase(s);
    requireSkill(s, t.player, 'field-refit');
    const d = ownMech(s, a.die, 'board');
    const v = d.value + a.delta;
    if (v < 1 || v > 6) fail('Mech numbers range from 1 to 6');
    oncePerTurn(s, 'field-refit');
    const was = mechName(s, d);
    d.value = v;
    markSeen(s, d);
    note(s, `${name(s, d.owner)} adjusts their ${was} to ${aMech(s, d)} (${cardName('field-refit')}).`, d.owner);
  },
  advanceSkill(s, a) {
    const t = requireActionPhase(s);
    requireSkill(s, t.player, 'advance');
    const d = ownMech(s, a.die, 'board');
    // Advance moves the mech, and leaves it its own move for the turn.
    const use = () => oncePerTurn(s, 'advance');
    if (a.passenger) {
      // Behemoth carry over the 1 space (forum consensus, BGG thread 1093051).
      if (!hasAbility(s, d, 'carry')) fail('Only a mech with Carry & Move can carry');
      if (!a.to || !a.setDown) fail('Invalid carry');
      const fly = carryMech(s, d, a.passenger, a.to, a.setDown, 1);
      use();
      markAbility(s, d);
      fly();
      logTo(
        s,
        d.owner,
        `${name(s, d.owner)}'s ${mechName(s, d)} carries their ${mechName(s, die(s, a.passenger))} one space`,
        a.to,
        ` (${cardName('advance')})`,
      );
      return;
    }
    const opts = advanceSkillOptions(s, d.id);
    if (a.target) {
      const opt = opts.attacks.find((x) => x.die.id === a.target);
      if (!opt) fail('Target must be adjacent');
      use();
      startCombat(s, d, opt.die, cellOf(d)!);
      return;
    }
    const opt = a.to && opts.moves.find((x) => same(x.cell, a.to!));
    if (!opt) fail('Move one space to an empty space');
    use();
    d.loc = boardLoc(opt.cell);
    logTo(s, d.owner, `${name(s, d.owner)} moves their ${mechName(s, d)} one space`, opt.cell, ` (${cardName('advance')})`);
  },
  engineering(s, a) {
    const head = headOf(s, 'engineering', 'No mech number to choose');
    if (a.value < 1 || a.value > 6) fail('Mech numbers range from 1 to 6');
    if (head.options && !head.options.includes(a.value)) fail(`${cardName('engineering')} changes the number by at most 1`);
    s.pending.shift();
    const d = die(s, head.die);
    d.value = a.value;
    markSeen(s, d);
    const skill = head.source === 'remodel' ? cardName('remodel') : cardName('engineering');
    note(
      s,
      `${name(s, head.player)} makes ${d.loc.zone === 'board' ? 'it' : 'their mech in the salvage yard'} ${aMech(s, d)} (${skill}).`,
      head.player,
    );
  },
  recycle(s, a) {
    const t = requireActionPhase(s);
    requireSkill(s, t.player, 'recycle');
    const d = ownMech(s, a.die, 'board');
    oncePerTurn(s, 'recycle');
    note(s, `${name(s, d.owner)} salvages their ${mechName(s, d)} for an extra action (${cardName('recycle')}).`, d.owner);
    destroyMech(s, d);
    t.actionsLeft++;
  },
} satisfies Partial<Handlers>;

/** CE Prospectors, when the step from `prev` to `s` spent its extra Move or Research. */
export function prospectorsUsed(prev: GameState, s: GameState): { player: PlayerId; card: string } | undefined {
  if (prev.turn.prospectorsUsed || !s.turn.prospectorsUsed) return undefined;
  const card = skillCard(prev, prev.turn.player, 'prospectors');
  return card ? { player: prev.turn.player, card } : undefined;
}

/**
 * The skill card `action` uses, and its owner, judged before the action (Final Push may be gone after).
 * None for an action that declines a skill's offer, or that isn't a skill's at all.
 */
export function skillUsed(s: GameState, a: Action): { player: PlayerId; card: string } | undefined {
  const head = s.pending[0];
  const find = (player: PlayerId, test: (r: SkillRule) => unknown) => {
    const card = s.players[player].skills.find((sk) => sk.active && test(ruleOf(sk.id)))?.id;
    return card ? { player, card } : undefined;
  };
  switch (a.type) {
    case 'engineering':
      return head?.kind === 'engineering'
        ? find(head.player, (r) => (head.source === 'remodel' ? r.chooseSalvageYardNumber : r.adjustRefit))
        : undefined;
    case 'unstableReactor':
      return a.destroy && head?.kind === 'unstableReactor' ? find(head.player, (r) => r.combat?.destroyBoth) : undefined;
    case 'signalJammer':
      return a.skill && head?.kind === 'signalJammer' ? find(head.player, (r) => r.disableSkillOnDestroy) : undefined;
    case 'armsDeal':
      return head?.kind === 'takeCard' ? find(head.player, (r) => r.atomicForClaim) : undefined;
    default:
      // Activated skills are actions of the player's own turn.
      return find(s.turn.player, (r) => r.activated === a.type);
  }
}
