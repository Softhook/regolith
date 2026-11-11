/**
 * Mech ability value test: what a mech's once-a-turn ability is worth, with nothing else changed (ab.ts).
 *
 * Side B never uses the ability of its mechs showing `mech` (Regolith's 6, the Wisp's Barrier, by
 * default): it sees the ability as already used this turn, so this only works for abilities that are once
 * a turn (canUseAbility); an ability still offered after that stops the run. Several mechs may be given,
 * each tested on its own: `mechs=3,6`.
 *
 *   npm run selfplay:abilities -- [games=400] [level=3] [mode=regolith] [mechs=6] [jobs=fast cores] [margin=5] [seed=0] [breaks=off] [aim=any]
 *
 * `breaks=smash` or `breaks=attack` plays every game with breakable barriers (RuleSet.breakBarriers), for
 * what the Wisp's Barrier is worth when barriers don't stay for good. `aim=strict` lets side A fire a barrier
 * only where it takes more of the spaces the opponent's mechs can move to than of its own.
 *
 * Any argument may be given by name instead, in any order: `--mechs=6 --seed=1` (args.ts).
 */
import type { AiLevel } from '../packages/ai/src';
import {
  actor,
  apply,
  die,
  legalActions,
  moveOptions,
  RULESETS,
  mechsOnBoard,
  type Action,
  type GameState,
  type PlayerId,
} from '../packages/engine/src';
import { runAb } from './ab';
import { args } from './args';
import { defaultJobs } from './pool';

const { games, level, mode, mechs, jobs, margin, seed, breaks, aim } = args({
  games: '400',
  level: '3',
  mode: 'regolith',
  mechs: '6',
  jobs: defaultJobs,
  margin: '5',
  seed: '0',
  breaks: 'off',
  aim: 'any',
});
if (aim !== 'any' && aim !== 'strict') throw new Error(`aim=${aim}: any or strict`);
if (breaks !== 'off' && breaks !== 'smash' && breaks !== 'attack') throw new Error(`breaks=${breaks}: off, smash or attack`);
for (const rules of Object.values(RULESETS)) rules.breakBarriers = breaks === 'off' ? undefined : breaks;

/** The state as side B sees it: its `mech`s' ability already used this turn. */
function withoutAbility(s: GameState, mech: number): GameState {
  if (s.phase !== 'play' || s.turn.player !== actor(s)) return s;
  const abilityUsed = { ...s.turn.abilityUsed };
  for (const d of s.dice) if (d.owner === s.turn.player && d.value === mech) abilityUsed[d.id] = true;
  // Boost's second use too (it then counts as spent for that side's other mechs as well, a small bias).
  const oncePerTurn = s.turn.oncePerTurn.includes('boost') ? s.turn.oncePerTurn : [...s.turn.oncePerTurn, 'boost' as const];
  const masked = { ...s, turn: { ...s.turn, abilityUsed, oncePerTurn } };
  if (legalActions(masked).some((a) => a.type === 'ability' && die(s, a.die).value === mech))
    throw new Error(`mech ${mech}'s ability isn't once a turn: it can't be held back this way`);
  return masked;
}

/** Spaces `p`'s mechs can move to, all told. */
const reach = (s: GameState, p: PlayerId) => mechsOnBoard(s, p).reduce((n, d) => n + moveOptions(s, d.id).moves.size, 0);

/** With aim=strict: a barrier that takes as much of side A's own movement as of the opponents'. */
function badBarrier(s: GameState, action: Action): boolean {
  if (aim !== 'strict' || action.type !== 'ability' || !action.to) return false;
  const { value, owner: me } = die(s, action.die);
  if (value !== 6) return false;
  const next = apply(s, action);
  const lost = (p: PlayerId) => reach(s, p) - reach(next, p);
  const theirs = s.players.filter((p) => p.id !== me).reduce((n, p) => n + lost(p.id), 0);
  return theirs <= lost(me);
}

await runAb({
  script: import.meta.url,
  name: 'mech',
  variants: mechs.split(','),
  games: Number(games),
  level: Number(level) as AiLevel,
  mode,
  jobs: Number(jobs),
  margin: Number(margin),
  seed: Number(seed),
  mapSeeds: 700,
  sideB: (s, mech) => withoutAbility(s, Number(mech)),
  veto: (s, _, action) => badBarrier(s, action),
});
