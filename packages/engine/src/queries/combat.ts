/** Combat: a battle's totals and outcome, atomics, and the odds of an attack. */
import { card, cardName } from '../data';
import { cellOf } from '../lookups';
import { activeSkills, anySkill, ruleOf, skillRules, type CombatPart, type SkillRule } from '../skillRules';
import type { Cell, CombatPending, CombatRole, Die, GameState, PlayerId } from '../types';

export interface CombatTotal {
  roll: number;
  total: number;
  parts: CombatPart[];
}

/** The value a side's combat roll is set to, overriding the dice: an atomic, Kill Zone or Drill Sergeant (in that priority). */
function rollOverride(state: GameState, combat: CombatPending, side: CombatRole): CombatPart | undefined {
  const s = combat[side];
  if (s.atomic) return { kind: 'roll', set: true, label: 'Atomic', value: 1 };
  if (state.players[s.player].killZone > 0) return { kind: 'roll', set: true, label: cardName('kill-zone'), value: 1 };
  const fixed = activeSkills(state, s.player)
    .filter((a) => a.rule.combat?.roll !== undefined)
    .pop();
  return fixed && { kind: 'roll', set: true, label: card(fixed.card).name, value: fixed.rule.combat!.roll! };
}

/**
 * Combat roll pipeline (docs/RULES.md ruling 1):
 * roll (Paired Cannons: lower of two) → set effects (Drill Sergeant 3, Kill Zone 1) → atomic (1) → modifiers.
 */
export function combatTotal(state: GameState, combat: CombatPending, side: CombatRole): CombatTotal {
  const s = combat[side];
  const skills = activeSkills(state, s.player).filter((a) => a.rule.combat);
  const parts: CombatPart[] = [];
  const set = rollOverride(state, combat, side);
  const roll = set?.value ?? (s.dice.length > 1 ? Math.min(...s.dice) : s.dice[0]);
  parts.push(set ?? { kind: 'roll', label: s.dice.length > 1 ? `${cardName('paired-cannons')} roll` : 'Roll', value: roll });
  parts.push({ kind: 'mech', label: 'Mech', value: s.mech });
  for (const { card: id, rule } of skills) {
    const value = rule.combat!.modifier?.({ state, combat, side }) ?? 0;
    if (value) parts.push({ kind: 'modifier', label: card(id).name, value });
  }
  const total = parts.reduce((a, x) => a + x.value, 0);
  return { roll, total, parts };
}

export function combatOutcome(state: GameState, combat: CombatPending) {
  const a = combatTotal(state, combat, 'attacker');
  const d = combatTotal(state, combat, 'defender');
  const tie = a.total === d.total;
  const entrenchedDefence = anySkill(state, combat.defender.player, (r) => r.combat?.entrenched);
  const attackerWins = a.total < d.total || (tie && !entrenchedDefence);
  // Entrenched: when the defender wins (ties included), the attacker is destroyed.
  const entrenched = entrenchedDefence && !attackerWins;
  const winner: CombatRole = attackerWins ? 'attacker' : 'defender';
  // The mech the result destroys; none when the attack is only repelled.
  const destroyed: CombatRole | null = attackerWins ? 'defender' : entrenched ? 'attacker' : null;
  return { attacker: a, defender: d, attackerWins, entrenched, winner, destroyed };
}

export type CombatOutcome = ReturnType<typeof combatOutcome>;

/**
 * Whether `by` is offered an atomic on `side`'s combat roll. A combatant is only offered their own
 * roll (a lower roll for the opponent only helps them), and not while already winning. Players not
 * in the battle may not fire. A roll that is already 1 is never offered.
 */
export function atomicOffered(state: GameState, combat: CombatPending, by: PlayerId, side: CombatRole): boolean {
  return atomicRefusal(state, combat, by, side) === null;
}

/** Why `by` is not offered an atomic on `side`'s roll (see atomicOffered), or null if they are. */
export function atomicRefusal(state: GameState, combat: CombatPending, by: PlayerId, side: CombatRole): string | null {
  if (state.players[by].atomics <= 0) return 'No atomics left';
  if (combat[side].atomic || combatTotal(state, combat, side).roll === 1) return 'That combat roll is already 1';
  if (by !== combat.attacker.player && by !== combat.defender.player) return 'Only the attacker and defender may fire an atomic';
  if (combat[side].player !== by || combatOutcome(state, combat).attackerWins === (side === 'attacker'))
    return 'You may only fire an atomic on your own roll, while losing';
  const fired = { ...combat, [side]: { ...combat[side], atomic: true } };
  if (combatOutcome(state, fired).attackerWins !== (side === 'attacker')) return 'An atomic would not win this battle';
  return null;
}

/** Whether `player` can still respond to the battle with an atomic. */
export function canRespondToCombat(state: GameState, combat: CombatPending, player: PlayerId): boolean {
  return (['attacker', 'defender'] as const).some((side) => atomicOffered(state, combat, player, side));
}

/** How many combat dice the player rolls (the lowest counts). */
export function combatDice(state: GameState, player: PlayerId): number {
  return Math.max(1, ...skillRules(state, player).map((r) => r.combat?.dice ?? 1));
}

/** Probability that an attacker mech of value `a` beats a defender of value `d` with plain dice. */
export function attackOdds(a: number, d: number): number {
  let wins = 0;
  for (let x = 1; x <= 6; x++) for (let y = 1; y <= 6; y++) if (a + x <= d + y) wins++;
  return wins / 36;
}

/** The battle `attacker` would start against `defender` from `from`, every die rolling a 6 (a placeholder). */
function previewCombat(attacker: Die, defender: Die, from: Cell): CombatPending {
  const side = (d: Die) => ({ player: d.owner, die: d.id, mech: d.value, dice: [6], atomic: false });
  return { kind: 'combat', id: 0, attacker: side(attacker), defender: side(defender), from, at: cellOf(defender)! };
}

/**
 * Probability that `attacker` beats `defender` if it attacks from `from` (by default, where it is
 * now), with both players' combat skills and Kill Zone (not re-rolls, atomics or Unstable Reactor).
 */
export function attackChance(state: GameState, attacker: Die, defender: Die, from: Cell = cellOf(attacker)!): number {
  const plain = (p: PlayerId) => !state.players[p].killZone && !activeSkills(state, p).some((a) => a.rule.combat);
  if (plain(attacker.owner) && plain(defender.owner)) return attackOdds(attacker.value, defender.value);
  const combat = previewCombat(attacker, defender, from);
  /** Chance of each total: the roll (a set value, or the lowest of n dice) plus what doesn't depend on it. */
  const totals = (role: CombatRole): Map<number, number> => {
    const t = combatTotal(state, combat, role);
    // A set roll (Drill Sergeant, Kill Zone): the 6 rolled was ignored.
    if (t.roll !== 6) return new Map([[t.total, 1]]);
    const n = combatDice(state, combat[role].player);
    // The lowest of n dice is r with chance ((7 - r)^n - (6 - r)^n) / 6^n.
    return new Map([1, 2, 3, 4, 5, 6].map((r) => [t.total - 6 + r, ((7 - r) ** n - (6 - r) ** n) / 6 ** n]));
  };
  const att = totals('attacker');
  const def = totals('defender');
  const entrenched = anySkill(state, defender.owner, (r) => r.combat?.entrenched);
  let wins = 0;
  for (const [a, pa] of att) for (const [d, pd] of def) if (a < d || (a === d && !entrenched)) wins += pa * pd;
  return wins;
}

/** The name of the player's active skill with this rule, as printed. */
function skillName(state: GameState, player: PlayerId, test: (r: SkillRule) => unknown): string | undefined {
  const held = state.players[player].skills.find((s) => s.active && test(ruleOf(s.id)));
  return held && card(held.id).name;
}

/**
 * What changes the odds of an attack (see attackChance) for each side, beyond the mechs and the
 * dice, by the cards' names: e.g. "Armour Piercing −1", "Drill Sergeant: rolls 3", "Paired Cannons: lowest
 * of 2 dice", "Entrenched: wins ties".
 */
export function attackFactors(
  state: GameState,
  attacker: Die,
  defender: Die,
  from: Cell = cellOf(attacker)!,
): Record<CombatRole, string[]> {
  const combat = previewCombat(attacker, defender, from);
  const factors = (role: CombatRole): string[] => {
    const parts = combatTotal(state, combat, role).parts;
    const set = parts.find((part) => part.kind === 'roll' && part.set);
    const out = set ? [`${set.label}: rolls ${set.value}`] : [];
    for (const part of parts) if (part.kind === 'modifier') out.push(`${part.label} ${signed(part.value)}`);
    const n = combatDice(state, combat[role].player);
    if (n > 1 && !set) out.push(`${skillName(state, combat[role].player, (r) => (r.combat?.dice ?? 1) > 1)!}: lowest of ${n} dice`);
    const entrenched = role === 'defender' && skillName(state, defender.owner, (r) => r.combat?.entrenched);
    if (entrenched) out.push(`${entrenched}: wins ties`);
    return out;
  };
  return { attacker: factors('attacker'), defender: factors('defender') };
}

/** A modifier with its sign: "+1", "−2" (a minus sign, not a hyphen). */
export function signed(n: number): string {
  return n < 0 ? `−${-n}` : `+${n}`;
}
