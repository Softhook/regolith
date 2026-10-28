/**
 * Consistency checks for a game state. A state produced by `apply` must never violate one; a
 * violation is an engine bug. Tests run these after every action of full games, and the web app
 * runs them after every action in development builds.
 */
import { key } from './board';
import { effectOf, MAPS } from './data';
import { dealt } from './effects';
import { skillLimit } from './queries';
import { rulesOf } from './rules';
// Sets the rule sets that rulesOf reads: a test or tool may check a saved state with only this module loaded.
import './rulesets';
import type { GameState } from './types';

const DICE_PER_PLAYER = 5;

/** Returns a description of every violated invariant; empty when the state is consistent. */
export function checkInvariants(s: GameState): string[] {
  const errors: string[] = [];
  const check = (ok: boolean, message: string) => {
    if (!ok) errors.push(message);
  };
  const isPlayer = (p: number) => Number.isInteger(p) && p >= 0 && p < s.players.length;
  const researchLimit = rulesOf(s).researchLimit;

  // Players and tracks
  const map = MAPS.find((m) => m.id === s.board.mapId);
  check(!!map, `unknown map ${s.board.mapId}`);
  for (const p of s.players) {
    const name = `player ${p.id}`;
    check(p.dominance >= 1 && p.dominance <= 6, `${name}: power ${p.dominance} outside 1–6`);
    check(p.research >= 1 && p.research <= researchLimit, `${name}: research ${p.research} outside 1–${researchLimit}`);
    check(p.missiles >= 0, `${name}: ${p.missiles} atomics`);
    check(p.actionPenalty >= 0 && p.planAhead >= 0, `${name}: negative penalty or Kill Zone`);
    check(p.ambitionTokens >= 0 && p.ambitionTokens < 3, `${name}: ${p.ambitionTokens} ambition tokens`);
    const placed = s.board.planets.reduce((n, pl) => n + pl.cubes.filter((x) => x === p.id).length, 0);
    if (map) check(placed + p.cubesLeft === map.cubes, `${name}: ${placed} cubes placed + ${p.cubesLeft} left ≠ ${map.cubes}`);
  }

  // Planets
  for (const pl of s.board.planets) {
    check(pl.cubes.length <= pl.capacity, `objective ${pl.number}: ${pl.cubes.length} cubes, capacity ${pl.capacity}`);
    check(pl.cubes.every(isPlayer), `objective ${pl.number}: cube of an unknown player`);
  }

  // Dice
  const ids = new Set<string>();
  const occupied = new Set<string>();
  for (const d of s.dice) {
    check(!ids.has(d.id), `die ${d.id} appears twice`);
    ids.add(d.id);
    check(isPlayer(d.owner), `die ${d.id}: unknown owner ${d.owner}`);
    check(Number.isInteger(d.value) && d.value >= 1 && d.value <= 6, `die ${d.id}: value ${d.value}`);
    if (d.loc.zone !== 'board') continue;
    const k = key(d.loc);
    check(!occupied.has(k), `two mechs on ${k}`);
    occupied.add(k);
    check(s.board.cells[d.loc.r]?.[d.loc.c]?.kind === 'space', `die ${d.id} is on ${k}, which is not a space`);
  }
  for (const b of s.barriers ?? []) {
    const k = key(b);
    check(!occupied.has(k), `a barrier on ${k}, which is taken`);
    occupied.add(k);
    check(s.board.cells[b.r]?.[b.c]?.kind === 'space', `a barrier on ${k}, which is not a space`);
    check(isPlayer(b.owner), `barrier on ${k}: unknown owner ${b.owner}`);
    check(!s.gates.some((g) => key(g) === k), `a barrier on ${k}, which has an ice tunnel`);
  }
  for (const p of s.players) {
    check(s.dice.filter((d) => d.owner === p.id).length === DICE_PER_PLAYER, `player ${p.id} does not have ${DICE_PER_PLAYER} dice`);
  }

  // Cards: every card in the game is in exactly one place.
  const cards = rulesOf(s).cards;
  if (cards) {
    const expected = new Map<string, number>();
    for (const c of [...cards.skills, ...cards.tactics]) {
      if (dealt(effectOf(c.id))) expected.set(c.id, (expected.get(c.id) ?? 0) + c.count);
    }
    const actual = new Map<string, number>();
    const count = (id: string) => actual.set(id, (actual.get(id) ?? 0) + 1);
    const m = s.market;
    [m.skillDeck, m.skillRow, m.skillDiscard, m.tacticDeck, m.tacticRow, m.tacticDiscard].forEach((pile) => pile.forEach(count));
    for (const p of s.players) {
      p.skills.forEach((sk) => count(sk.id));
      p.storedTactics?.forEach(count);
    }
    for (const head of s.pending) if (head.kind === 'skillDraft') head.options.forEach(count);
    for (const p of s.players) {
      const discarding = s.pending.some((h) => h.kind === 'discardSkill' && h.player === p.id);
      check(discarding || p.skills.length <= skillLimit(s, p.id), `player ${p.id}: ${p.skills.length} skills, over the limit`);
    }
    for (const id of new Set([...expected.keys(), ...actual.keys()])) {
      const want = expected.get(id) ?? 0;
      const got = actual.get(id) ?? 0;
      check(want === got, `card ${id}: ${got} in play, expected ${want}`);
    }
    check(m.skillRow.length <= 3 && m.tacticRow.length <= 3, 'more than 3 face-up cards in a row');
    check(m.expansions >= 0, `${m.expansions} expansion cards`);
  } else {
    const m = s.market;
    const empty = [m.skillDeck, m.skillRow, m.skillDiscard, m.tacticDeck, m.tacticRow, m.tacticDiscard].every((x) => !x.length);
    check(empty && s.players.every((p) => !p.skills.length), 'cards in a mode without cards');
  }

  // Turn
  const t = s.turn;
  check(isPlayer(t.player), `turn of unknown player ${t.player}`);
  check(t.actionsLeft >= 0 && t.freeDeploys >= 0, 'negative action count');
  check(s.gates.length === 0 || s.gates.length === 2, `${s.gates.length} ice tunnels`);

  // Phase and decisions
  check((s.phase === 'over') === (s.winner !== null), `phase ${s.phase} with winner ${s.winner}`);
  if (s.phase === 'over') check(!s.pending.length, 'decisions pending after the game ended');
  for (const head of s.pending) {
    if (head.kind === 'combat') {
      for (const side of [head.attacker, head.defender]) {
        const d = s.dice.find((x) => x.id === side.die);
        check(!!d && d.loc.zone === 'board' && d.owner === side.player, `combat ${head.id}: ${side.die} is not on the map`);
        check(side.dice.length >= 1 && side.dice.every((v) => v >= 1 && v <= 6), `combat ${head.id}: bad combat dice`);
      }
    } else check(isPlayer(head.player), `${head.kind} decision for unknown player ${head.player}`);
  }
  if (s.phase === 'play' && t.phase === 'cards') {
    check(s.pending.length > 0, 'card phase with nothing pending (the turn should have passed)');
  }
  return errors;
}
