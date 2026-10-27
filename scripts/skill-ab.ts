/**
 * Skill value test: what one skill is worth on its own, with nothing else changed.
 *
 * At the start of play one side holds the skill and the other none (both drafted starting skills
 * are removed); both keep drafting as usual. Seats swap every game and each pair of games shares a
 * map seed, so "none" (neither side holds a skill) should come out near 50%. Prints one JSON line
 * per skill with the wins of the side that held it. 200 games give a 95% margin of about ±7 points.
 *
 * Each skill stops early once it is clear whether its side wins `margin` percentage points more than
 * 50%, as much less, or neither ("verdict": better, worse or even; sprt.ts). With the defaults a
 * skill worth 10 points takes about 250 games, one worth 5 about 700 and one worth nothing about
 * 900; up to 2000 games find 19 in 20 skills worth the margin. A skill that runs out of games first
 * is undecided; a margin of 0 always plays them all. "games" is how many were played.
 *
 * Each skill tested has its own 2.5% chance of a "better" it doesn't deserve: over thirty skills,
 * expect one (a reminder goes to stderr). Check a surprise by playing that skill again with another
 * `seed`, which plays other games: the same seed plays the same games, with the same verdict.
 *
 *   npm run selfplay:skills -- [games=2000] [level=3] [mode=community] [skills=none,agile,...] [jobs=fast cores] [margin=5] [seed=0]
 *
 * Any argument may be given by name instead, in any order: `--skills=agile --seed=1` (args.ts).
 */
import type { AiLevel } from '../packages/ai/src';
import { setSkills } from '../packages/engine/test/audit';
import { runAb } from './ab';
import { args } from './args';
import { defaultJobs } from './pool';

const { games, level, mode, skills, jobs, margin, seed } = args({
  games: '2000',
  level: '3',
  mode: 'regolith',
  skills: 'none',
  jobs: defaultJobs,
  margin: '5',
  seed: '0',
});

await runAb({
  script: import.meta.url,
  name: 'skill',
  variants: skills.split(','),
  games: Number(games),
  level: Number(level) as AiLevel,
  mode,
  jobs: Number(jobs),
  margin: Number(margin),
  seed: Number(seed),
  mapSeeds: 9000,
  // Both drafted starting skills go; side A holds the one tested ("none": neither holds one).
  start: (s, skill, a) => {
    setSkills(s, 0, []);
    setSkills(s, 1, []);
    if (skill !== 'none') setSkills(s, a, [skill]);
  },
});
