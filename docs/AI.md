# AI opponents

The AI comes in five levels. Each player seat in the lobby picks one; the default is 3.

| Level | Name | How it chooses | Thinking time per decision |
|:-:|---|---|---|
| 1 | **Cadet** | One action at a time. Scores the position after each legal action and takes the best. Random actions are sampled 3 times. | ~5 ms |
| 2 | **Sergeant** | One action at a time, with exact odds for re-rolls and combat and an evaluation that knows whose turn is next and which enemy ships can reach which of its ships. | ~5 ms |
| 3 | **Captain** | Plans the whole turn: searches combinations of up to 3 actions (plus free ship abilities) and the outcomes of every dice roll on the way. | ~10–20 ms, ≤ 0.1 s |
| 4 | **Colonel** | Wider turn search, includes Behemoth carries, and checks its best three plans against the opponent's actual next turn. | ~25–50 ms, ≤ 0.2 s |
| 5 | **General** | Deeper and wider turn search (4 actions, more samples), and checks its best four plans against three replies each, with the same dice for every plan, averaged. | ~65–100 ms, ≤ 0.5 s |

All levels choose among `legalActions(state)`, so they can only play legal moves. None of them
sees the game's RNG or the order of the decks. Before searching, the AI replaces the RNG seed with
its own and shuffles the unseen deck cards.

In the web app the AI runs in a Web Worker ([`apps/web/src/game/aiWorker.ts`](../apps/web/src/game/aiWorker.ts)),
so the board keeps animating while it thinks. Thinking time counts towards the pause the AI already
takes between actions so that humans can follow along.

## Strength

Self-play results, alternating seats, each pair of games on the same map seed (`npm run ai:match`), 2026-10-27,
each match stopped once the sequential test decided it (SPRT, 10-point margin):

| Match (games) | Basic | Regolith |
|---|---|---|
| Sergeant vs Cadet | 95% | 19 – 1 (20) |
| Captain vs Sergeant | 70.5% | 49 – 23 (72) |
| Colonel vs Captain | 124 – 85 (228, 19 unfinished) | 131 – 91 (222) |
| General vs Colonel | 54 – 29 (92, 9 unfinished) | 34 – 16 (50) |

Every level beats the one below on both modes. An unfinished game hit the step cap (3,000 actions) without a
winner; only Basic had any. The rest of this section was measured on Cubic's earlier modes, before the split:

General beat Colonel 118 – 82 over 200 games (59%, z = 2.55, p ≈ 0.01; 2026-10-09, before
the reply-scoring fix below), at about twice Colonel's thinking time. Settings that spend more time
on the reply check did not do better than General (200 games each, after the fix):

| General variant | Score vs General | Thinking time |
|---|---|---|
| Position after the reply scored with me to move (the fix, now shipped) | 104 – 96 (52%) | same |
| 6 plans checked, 6 replies each | 91 – 109 (45.5%) | 1.6× |
| Replies played by Captain instead of Sergeant | 106 – 94 (53%) | 4× |

Checking more plans against a noisy reply seems to pick the luckiest one; a stronger reply player
costs far more than it gains. Further strength more likely comes from the evaluation (see Next steps).

Card values (2026-10-09, measured in Community while Regolith was part of Cubic): with skills and stored
Tactics valued card by card instead of all alike, threats worked out with both players' combat
skills (`attackChance`), and Calculating choosing 4s, Captain beat the previous Captain
158 – 82 over 240 Community games (65.8%) at about the same thinking time.

The levels are clearly ordered. The top two steps are the smallest (58–59% each). Empty cells
haven't been measured yet.

To measure a change, run for example:

```sh
npm run ai:match -- 2 3 40            # Sergeant vs Captain, 40 basic games
npm run ai:match -- 3 4 20 community  # Captain vs Colonel, community rules
npm run ai:match -- 4 5 200 basic 2 4  # 200 games on 4 processes (default: one per CPU core)
npm run ai:match -- 3@HEAD~1 3 240 community # Captain as of the previous commit vs now
```

The games are handed out a pair at a time to one worker process per core, so the fast and slow
cores all stay busy until the end. Ctrl-C stops early and reports the games finished so far.

Twelve games can mislead: during development one version of Colonel went 7–5 against Captain
over 12 games, and 38–10 over 48. Use 40 or more before trusting a difference, and 200 or more for
a difference of a few percent (the script prints z; |z| > 2 is about p < 0.05).

## What was wrong with the original AI

The original AI is kept as level 1. Self-play showed it rarely fought (about one attack per Basic
game, with dominance often never leaving 1), re-rolled ships with no purpose, and in the Original
mode researched about 27 times a game. The causes were assumptions built into its design:

1. **One action at a time.** It scored each action on its own and never planned how a turn's three
   actions work together. In this game the strong moves are combinations ("move A out, move B in,
   conquer").
2. **No idea of the opponent's next turn.** The score was a snapshot. It didn't know whose turn was
   next, and it ignored enemy threats like a conquest that will happen next turn. Its danger term
   measured straight-line distance through planets and ships.
3. **Sampling bias.** Re-rolls and attacks were scored from 3 random samples, and the best-looking
   action was chosen. Whichever random action got lucky in the samples won, which is why it
   reconfigured so often. With 1 sample it reconfigured 70% more.
4. **Weights out of scale.** Dominance 5 scored 150 points while Infamy is worth a cube (1000), so
   destroying ships hardly paid. Research scored a flat 14 per step. Every skill was worth the same.
5. **Reach ignored blocking**, and ignored whether a ship's value fits the planet's sum.

## How levels 2–5 work

| File | Contents |
|---|---|
| [`packages/ai/src/index.ts`](../packages/ai/src/index.ts) | Public API (`chooseAction`, `chooseCombatResponse`), the level table and each level's search settings |
| [`packages/ai/src/greedy.ts`](../packages/ai/src/greedy.ts) | Level 1, unchanged (the golden tests replay it) |
| [`packages/ai/src/evaluate.ts`](../packages/ai/src/evaluate.ts) | Position evaluation for levels 2+ |
| [`packages/ai/src/chance.ts`](../packages/ai/src/chance.ts) | The outcomes of an action, with probabilities |
| [`packages/ai/src/search.ts`](../packages/ai/src/search.ts) | Expectimax over the current turn, the opponent-reply check, missile decisions |

**Evaluation** (`evaluate.ts`) scores a position in *cube points* (one cube = 1000) as my value
minus the strongest rival's. A position in my own turn is scored as if I end the turn now; the
search decides whether to do more first. Each player's value adds up:

- cubes placed; dominance as progress towards Infamy (5 → 6 is worth about a cube); research as
  progress towards a card; skills, missiles, ships on the map and in the scrapyard;
- **conquest potential**: for the best three planets, how many actions a conquest is away (orbit
  already adds up; one ship of the right value can reach orbit; one orbiting ship can leave;
  a re-roll could fix the sum; two ships can fill the gap…), scaled by whether that player moves
  next. Reach uses real paths;
- **exposure**: for each ship, the chance an enemy ship that can actually reach it destroys it,
  times what that costs: the ship, a dominance step, and the attacker's gain, which is a cube if
  it gives them Infamy. Ships of the player who moves next are less exposed (they can react).

**Chance** (`chance.ts`): a re-roll branches into each value it can show, following the mode's
rule (a value not yet shown this turn). An attack branches into
win / repelled / attacker destroyed, with exact probabilities from every combination of combat
dice. Card draws and other random effects are sampled with the same seeds for every candidate.

**Search** (`search.ts`): every candidate is first tried one step deep, then the `width` best are
searched deeper, `innerWidth` at deeper nodes, to `depth` actions. A transposition table merges
positions reached in different orders. An evaluation budget caps the work per decision. It counts
positions rather than milliseconds, so games replay identically. Decisions that come up during the
search (advance after a battle, card picks) get each player's best one-step choice.

**Reply check** (Colonel): for the three best plans, the end-of-turn position is played on through
the opponent's next turn by the Sergeant policy, and each plan scores half its own value and half
the value after the reply. The position after the reply is scored with me to move (the evaluation
otherwise scores a position in my turn as if I end it now). General checks four plans, each against three replies with
different dice (`replySamples`), the same three for every plan, so that one lucky roll doesn't
decide between plans. `reply` can also set a stronger policy for the opponent's turn.

## Next steps

In rough order of value:

1. **Tune the evaluation by self-play.** The weights in `evaluate.ts` are hand-set. Adjusting them
   automatically (e.g. SPSA over many Sergeant-vs-Sergeant games) is the cheapest strength gain, and
   the same harness becomes the M5 balance lab.
2. **Value Regolith's cards on their own.** Each card is valued by the Community card it began as
   (`cardValues.ts`, through its `effect`); Regolith's own benchmark ([card-benchmark.md](card-benchmark.md))
   shows several are worth quite different amounts here.
3. **Missiles in the search.** The chance model assumes nobody fires a missile into a battle. The
   defender's possible missile should lower the attacker's odds.
4. **Faster engine for search.** Done (2026-10): states are copied by a plain recursive copy instead
   of `structuredClone`, the board's neighbours are cached per board, and movement (`reach`,
   `moveIndexes`) runs over cell indexes; the search reuses an action's outcomes when it deepens
   it and caches evaluations. Levels 3 and 4 got 3–4× faster with identical choices (88 fixed
   positions). A second round (2026-10-09) made levels 2–5 another 2–3.5× faster, again with
   identical choices: the evaluation's movement uses a plain breadth-first search over cell indexes
   (`shipReach`, checked against `moveIndexes` by the consistency tests), the skills' rules are
   cached by card set, a Move is validated without building string-keyed maps, the search settles
   decisions without first testing every answer (`decisionCandidates`), and the reply checks share
   the search's evaluation cache. Now about half the time is the evaluation and a sixth is copying
   states. Not counted in the evaluation budget: the reply checks (budget 15000 binds in 2–3% of
   General's decisions).
5. **Colonel beyond one reply.** Monte Carlo tree search across turns (with determinized decks),
   time-boxed in the worker, as originally planned in the roadmap.
6. **More than 2 players.** The evaluation subtracts the strongest rival and a quarter of the
   others; it doesn't model who attacks whom.
7. **Explain moves.** The evaluation's terms (conquest potential, exposure, dominance) can be shown
   as the reason for a move.
8. **Easier than Cadet.** Level 1's `noise` option already makes it weaker if beginners need it.
