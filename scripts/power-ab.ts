/**
 * Ship power value test: what a ship's once-a-turn power is worth, with nothing else changed (ab.ts).
 *
 * Side B never uses the power of its ships showing `ship` (Regolith's 6, the Wisp's Barrier, by
 * default): it sees the power as already used this turn, so this only works for powers that are once
 * a turn (canUseAbility); a power still offered after that stops the run. Several ships may be given,
 * each tested on its own: `ships=3,6`.
 *
 *   npm run selfplay:powers -- [games=400] [level=3] [mode=regolith] [ships=6] [jobs=fast cores] [margin=5] [seed=0] [breaks=off] [aim=any]
 *
 * `breaks=smash` or `breaks=attack` plays every game with breakable barriers (RuleSet.breakBarriers), for
 * what the Wisp's Barrier is worth when barriers don't stay for good. `aim=strict` lets side A fire a barrier
 * only where it takes more of the spaces the opponent's mechs can move to than of its own.
 *
 * Any argument may be given by name instead, in any order: `--ships=6 --seed=1` (args.ts).
 */
import type { AiLevel } from '../packages/ai/src';
import {
  actor,
  apply,
  die,
  legalActions,
  moveOptions,
  RULESETS,
  shipsOnBoard,
  type Action,
  type GameState,
  type PlayerId,
} from '../packages/engine/src';
import { runAb } from './ab';
import { args } from './args';
import { defaultJobs } from './pool';

const { games, level, mode, ships, jobs, margin, seed, breaks, aim } = args({
  games: '400',
  level: '3',
  mode: 'regolith',
  ships: '6',
  jobs: defaultJobs,
  margin: '5',
  seed: '0',
  breaks: 'off',
  aim: 'any',
});
if (aim !== 'any' && aim !== 'strict') throw new Error(`aim=${aim}: any or strict`);
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

/** Spaces `p`'s mechs can move to, all told. */
const reach = (s: GameState, p: PlayerId) => shipsOnBoard(s, p).reduce((n, d) => n + moveOptions(s, d.id).moves.size, 0);

/** With aim=strict: a barrier that takes as much of side A's own movement as of the opponents'. */
function badBarrier(s: GameState, action: Action): boolean {
  if (aim !== 'strict' || action.type !== 'power' || !action.to) return false;
  const { value, owner: me } = die(s, action.die);
  if (value !== 6) return false;
  const next = apply(s, action);
  const lost = (p: PlayerId) => reach(s, p) - reach(next, p);
  const theirs = s.players.filter((p) => p.id !== me).reduce((n, p) => n + lost(p.id), 0);
  return theirs <= lost(me);
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
  veto: (s, _, action) => badBarrier(s, action),
});
