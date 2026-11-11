import { effectOf } from '@regolith/engine';

/**
 * What holding each card is worth, in cube points, for the evaluation. A skill only takes effect
 * after the turn it is taken in, so the search can't see the difference between skills; with one
 * value for all of them the draft went to whichever came first in the row.
 *
 * Skills, by the Community card each started as (its effect): from the skill value test (docs/card-benchmark.md),
 * 3 points per percentage point a skill wins above holding none, around the old flat value. Skills whose worth
 * that test can't show (Veteran Crew, Strategic Plan, Stolen Flag) keep the flat value.
 */
const SKILL = 110;

const SKILL_WIN_RATE: Record<string, number> = {
  advance: 88.5,
  'unstable-reactor': 86.5,
  'martial-law': 83,
  entrenched: 79,
  'paired-cannons': 78.5,
  'double-time': 75.5,
  'armour-piercing': 75,
  'science-survey': 74.5,
  infiltration: 74.5,
  'free-drop': 73.5,
  hacking: 71,
  'field-refit': 70,
  'tune-up': 68,
  fanatics: 68,
  'final-push': 66,
  breakthrough: 66,
  'trophy-hunters': 66,
  recycle: 65.5,
  exploit: 61.5,
  'drill-sergeant': 61,
  boost: 58,
  'close-protection': 58,
  'stand-down': 56,
  engineering: 55,
  sneak: 53,
  prospectors: 52,
  'signal-jammer': 51,
  // Regolith's Science, measured the same way on Regolith (2026-10-24)
  science: 54.5,
  'rush-research': 50.5,
  'arms-deal': 47.5,
  remodel: 44.5,
};
/** The mean of the table above: skills at the mean keep the flat value. */
const MEAN_WIN_RATE = 65;

export function skillValue(id: string): number {
  const rate = SKILL_WIN_RATE[effectOf(id)];
  return rate === undefined ? SKILL : Math.max(40, SKILL + 3 * (rate - MEAN_WIN_RATE));
}

/** A Tactic stored with Strategic Plan: worth keeping when playing it now would gain less. */
const STORED_TACTIC = 50;

/** Stored Tactics by how much self-play winners favoured them (docs/card-benchmark.md). */
const TACTIC_VALUE: Record<string, number> = {
  'orbital-cannon': 70,
  'power-grab': 65,
  contraband: 65,
  'forced-march': 60,
  headhunter: 55,
  sabotage: 50,
  'ice-tunnel': 45,
  barricade: 45,
  'kinetic-shunt': 50,
  'kill-zone': 45,
  invasion: 40,
};

export function storedTacticValue(id: string): number {
  return TACTIC_VALUE[effectOf(id)] ?? STORED_TACTIC;
}
