/**
 * Ship power value test: what a ship's once-a-turn power is worth, with nothing else changed (ab.ts).
 *
 * Side B never uses the power of its ships showing `ship` (Regolith's 6, the Wisp's Barrier, by
 * default): it sees the power as already used this turn, so this only works for powers that are once
 * a turn (canUseAbility); a power still offered after that stops the run. Several ships may be given,
 * each tested on its own: `ships=3,6`.
 *
 *   npm run selfplay:powers -- [games=400] [level=3] [mode=regolith] [ships=6] [jobs=fast cores] [margin=5] [seed=0] [breaks=off]
 *
 * `breaks=smash` or `breaks=attack` plays every game with breakable barriers (RuleSet.breakBarriers), for
 * what the Wisp's Barrier is worth when barriers don't stay for good.
 *
 * Any argument may be given by name instead, in any order: `--ships=6 --seed=1` (args.ts).
 */
import type { AiLevel } from '../packages/ai/src';
import { actor, die, legalActions, RULESETS, type GameState } from '../packages/engine/src';
import { runAb } from './ab';
import { args } from './args';
import { defaultJobs } from './pool';

const { games, level, mode, ships, jobs, margin, seed, breaks } = args({
  games: '400',
  level: '3',
  mode: 'regolith',
  ships: '6',
  jobs: defaultJobs,
  margin: '5',
  seed: '0',
  breaks: 'off',
});
if (breaks !== 'off' && breaks !== 'smash' && breaks !== 'attack') throw new Error(`breaks=${breaks}: off, smash or attack`);
for (const rules of Object.values(RULESETS)) rules.breakBarriers = breaks === 'off' ? undefined : breaks;

/** The state as side B sees it: its `ship`s' power already used this turn. */
function withoutPower(s: GameState, ship: number): GameState {
  if (s.phase !== 'play' || s.turn.player !== actor(s)) return s;
  const abilityUsed = { ...s.turn.abilityUsed };
  for (const d of s.dice) if (d.owner === s.turn.player && d.value === ship) abilityUsed[d.id] = true;
  // Cunning's second use too (it then counts as spent for that side's other ships as well, a small bias).
  const oncePerTurn = s.turn.oncePerTurn.includes('cunning') ? s.turn.oncePerTurn : [...s.turn.oncePerTurn, 'cunning' as const];
  const masked = { ...s, turn: { ...s.turn, abilityUsed, oncePerTurn } };
  if (legalActions(masked).some((a) => a.type === 'power' && die(s, a.die).value === ship))
    throw new Error(`ship ${ship}'s power isn't once a turn: it can't be held back this way`);
  return masked;
}

await runAb({
  script: import.meta.url,
  name: 'ship',
  variants: ships.split(','),
  games: Number(games),
  level: Number(level) as AiLevel,
  mode,
  jobs: Number(jobs),
  margin: Number(margin),
  seed: Number(seed),
  mapSeeds: 700,
  sideB: (s, ship) => withoutPower(s, Number(ship)),
});
