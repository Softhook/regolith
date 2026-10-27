import { effectOf } from '@regolith/engine';

/**
 * What holding each card is worth, in cube points, for the evaluation. A skill only takes effect
 * after the turn it is taken in, so the search can't see the difference between skills; with one
 * value for all of them the draft went to whichever came first in the row.
 *
 * Skills, by the Community card each started as (its effect): from the skill value test (docs/card-benchmark.md),
 * 3 points per percentage point a skill wins above holding none, around the old flat value. Skills whose worth
 * that test can't show (Talented, Patient, Prideful) keep the flat value.
 */
const SKILL = 110;

const SKILL_WIN_RATE: Record<string, number> = {
  tactical: 88.5,
  dangerous: 86.5,
  tyrannical: 83,
  stubborn: 79,
  brutal: 78.5,
  steadfast: 75.5,
  ferocious: 75,
  brilliant: 74.5,
  stealthy: 74.5,
  industrious: 73.5,
  intelligent: 71,
  flexible: 70,
  agile: 68,
  righteous: 68,
  ambitious: 66,
  hostile: 66,
  ravenous: 66,
  resourceful: 65.5,
  plundering: 61.5,
  rational: 61,
  cunning: 58,
  strategic: 58,
  composed: 56,
  clever: 55,
  devious: 53,
  curious: 52,
  ruthless: 51,
  // Regolith's Science, measured the same way on Regolith (2026-10-24)
  science: 54.5,
  precocious: 50.5,
  profiteering: 47.5,
  calculating: 44.5,
};
/** The mean of the table above: skills at the mean keep the flat value. */
const MEAN_WIN_RATE = 65;

export function skillValue(id: string): number {
  const rate = SKILL_WIN_RATE[effectOf(id)];
  return rate === undefined ? SKILL : Math.max(40, SKILL + 3 * (rate - MEAN_WIN_RATE));
}

/** A Tactic stored with Patient: worth keeping when playing it now would gain less. */
const STORED_TACTIC = 50;

/** Stored Tactics by how much self-play winners favoured them (docs/card-benchmark.md). */
const TACTIC_VALUE: Record<string, number> = {
  'show-of-force': 70,
  aggression: 65,
  'black-market': 65,
  momentum: 60,
  'change-of-heart': 55,
  'sabotage-double': 50,
  'warp-gate': 45,
  barrier: 45,
  'kinetic-shunt': 50,
  'plan-ahead': 45,
  'unveil-the-fleet': 40,
};

export function storedTacticValue(id: string): number {
  return TACTIC_VALUE[effectOf(id)] ?? STORED_TACTIC;
}
