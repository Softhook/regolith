import {
  actor,
  apply,
  copyState,
  decisionCandidates,
  deployTargets,
  legalActions,
  mulberry32,
  scrapyard,
  tryApply,
  type Action,
  type GameState,
  type Pending,
  type PlayerId,
} from '@regolith/engine';
import { outcomes, type Outcome } from './chance';
import { shuffleUnseen } from './hidden';
import { candidates } from './candidates';
import { evaluate } from './evaluate';

/**
 * Levels 2 and up: expectimax search over the rest of the current turn.
 *
 * A node is a position in my own action phase. Its value is the best of ending the turn now
 * (the evaluation) and every action I could take next. Random actions branch into all their
 * outcomes, weighted by probability; decisions that follow (advance after a battle, card
 * picks) are answered by each player's best one-step choice. All candidates are tried one
 * step deep; only the `width` most promising are searched further, down to `depth`.
 *
 * With `replies`, the best few plans are also checked against the opponent's actual next
 * turn (played by the level-2 policy), which catches threats the evaluation misjudges.
 */

export interface SearchParams {
  /** Actions looked ahead within the turn (1 = greedy). */
  depth: number;
  /** Candidates searched beyond one step at the root, and at deeper nodes. */
  width: number;
  innerWidth: number;
  /**
   * Positions evaluated per decision before the search stops deepening. A count rather than a
   * time limit, so that games replay identically.
   */
  budget: number;
  /** Samples for card draws and other random effects that are not enumerated. */
  samples: number;
  /** Include every Flagship transport (many options). */
  carry: boolean;
  /** How many of the best plans to test against the opponent's next turn (0 = none). */
  replies: number;
  /** The policy that plays the opponent's next turn for those tests (default: level 2's). */
  reply?: SearchParams;
  /**
   * Replies played per plan, averaged, each with its own dice; the same dice for every plan, so they
   * are compared fairly. Without it, one reply with the search's own randomness.
   */
  replySamples?: number;
}

interface Line {
  value: number;
  /** Where the best line ends: the position the evaluation scored (most likely outcome). */
  end: GameState;
}

/** A candidate scored one step deep, with its outcomes kept for deepening (null for ending the turn). */
interface Scored {
  a: Action;
  outs: Outcome[] | null;
  line: Line;
}

const byValue = (x: { line: Line }, y: { line: Line }) => y.line.value - x.line.value;

export class Search {
  private readonly tt = new Map<string, Line>();
  private readonly seeds: number[];
  private evaluations = 0;

  constructor(
    private readonly me: PlayerId,
    private readonly params: SearchParams,
    private readonly random: () => number,
    /**
     * Evaluations by player and position: deepening a line scores its positions again, and the
     * reply checks play out the same positions. Shared with the searches that play the replies.
     */
    private readonly evals = new Map<string, number>(),
  ) {
    this.seeds = Array.from({ length: params.samples }, () => seed(random));
  }

  choose(state: GameState): Action | null {
    const head = state.pending[0];
    if (head?.kind === 'combat') return { type: 'resolveCombat' };
    let options = candidates(state, { includeCarry: this.params.carry });
    // Anti-stalemate: after IDLE_LIMIT turns in a row without an action, don't pass again while
    // there is anything else to do (two players who both see no progress would pass forever).
    if (!head && (state.players[this.me].idleTurns ?? 0) >= IDLE_LIMIT && !state.turn.acted) {
      const active = options.filter((a) => a.type !== 'endTurn');
      if (active.length) options = active;
    }
    if (options.length <= 1) return options[0] ?? null;

    const root = hideUnknowns(state, this.random);
    const depth = this.params.depth;
    const scored = this.scoreAll(root, options);
    if (!scored.length) return options[0];

    // Deepen the most promising candidates. Ending the turn needs no deepening.
    if (depth > 1) {
      for (const x of withFreePower(root, scored, this.params.width)) {
        if (this.exhausted()) break;
        if (x.outs) x.line = this.action(x.outs, depth - 1);
      }
      scored.sort(byValue);
    }
    if (this.params.replies > 0 && !head) {
      // Scores after the reply are on a different scale, so choose among the checked plans only.
      const checked = scored.slice(0, this.params.replies);
      const samples = this.params.replySamples;
      const seeds = samples ? Array.from({ length: samples }, () => seed(this.random)) : [];
      const reply = (end: GameState) =>
        samples ? seeds.reduce((sum, x) => sum + this.afterReply(end, mulberry32(x)), 0) / samples : this.afterReply(end, this.random);
      const after = checked.map((x) => ({ a: x.a, value: 0.5 * x.line.value + 0.5 * reply(x.line.end) }));
      return after.reduce((b, x) => (x.value > b.value ? x : b)).a;
    }
    return scored[0].a;
  }

  /** Should `player` fire a missile into the current combat? The dice are known, so this is exact. */
  missile(state: GameState, player: PlayerId): Action | null {
    const head = state.pending[0];
    if (head?.kind !== 'combat' || state.players[player].missiles <= 0) return null;
    const root = hideUnknowns(state, this.random);
    const after = (s: GameState) => evaluate(this.settle(apply(s, { type: 'resolveCombat' })), player);
    let pick: Action | null = null;
    // The evaluation already counts a kept missile; a small margin avoids firing for nothing.
    let top = after(root) + 10;
    const legal = legalActions(root);
    for (const side of ['attacker', 'defender'] as const) {
      const a: Action = { type: 'missile', by: player, side };
      if (!legal.some((x) => x.type === 'missile' && x.by === player && x.side === side)) continue;
      const v = after(apply(root, a));
      if (v > top) {
        top = v;
        pick = a;
      }
    }
    return pick;
  }

  // -------------------------------------------------------------------------

  private myTurn(s: GameState): boolean {
    return s.phase === 'play' && !s.pending.length && s.turn.phase === 'actions' && s.turn.player === this.me;
  }

  /** `sig` is signature(s), passed in when the caller has it already. */
  private standPat(s: GameState, sig?: string): Line {
    // Counted even when cached: the budget measures the search's size, so that a faster search
    // makes the same choices.
    this.evaluations++;
    return { value: this.score(s, this.me, undefined, sig), end: s };
  }

  /** evaluate(s, who, mover), cached. The key adds phase and winner: it is used outside my turn too. */
  private score(s: GameState, who: PlayerId, mover?: PlayerId, sig = signature(s)): number {
    const k = `${who}|${mover ?? ''}|${s.phase}|${s.winner}|${sig}`;
    let value = this.evals.get(k);
    if (value === undefined) this.evals.set(k, (value = evaluate(s, who, mover)));
    return value;
  }

  private exhausted(): boolean {
    return this.evaluations >= this.params.budget;
  }

  /** The outcomes of `a` in `s`, with the decisions that follow settled; null if it is illegal. */
  private expand(s: GameState, a: Action): Outcome[] | null {
    const outs = outcomes(s, a, this.seeds);
    return outs && outs.map((o) => ({ state: this.settle(o.state), p: o.p }));
  }

  /** The legal ones of `actions` in `s`, scored one step deep, best first. Ending the turn scores `s` itself. */
  private scoreAll(s: GameState, actions: Action[]): Scored[] {
    return actions
      .flatMap<Scored>((a) => {
        if (a.type === 'endTurn') return [{ a, outs: null, line: this.standPat(s) }];
        const outs = this.expand(s, a);
        return outs ? [{ a, outs, line: this.action(outs, 0) }] : [];
      })
      .sort(byValue);
  }

  /** Expected value of an action, from its `expand`ed outcomes, searching `depth` further actions after it. */
  private action(outs: Outcome[], depth: number): Line {
    let value = 0;
    let end = outs[0].state;
    let likeliest = -1;
    for (const o of outs) {
      const line = this.node(o.state, depth);
      value += o.p * line.value;
      if (o.p > likeliest) {
        likeliest = o.p;
        end = line.end;
      }
    }
    return { value, end };
  }

  /** The best line from `s`: end the turn now, or take up to `depth` more actions. */
  private node(s: GameState, depth: number): Line {
    if (!this.myTurn(s)) return this.standPat(s);
    const sig = signature(s);
    const k = `${depth}|${sig}`;
    const hit = this.tt.get(k);
    if (hit) return hit;

    let best = this.standPat(s, sig);
    if (depth > 0 && !this.exhausted()) {
      // Ending the turn is `best` already.
      const scored = this.scoreAll(
        s,
        candidates(s, { includeCarry: this.params.carry }).filter((a) => a.type !== 'endTurn'),
      );
      for (const x of scored) if (x.line.value > best.value) best = x.line;
      if (depth > 1) {
        for (const x of withFreePower(s, scored, this.params.innerWidth)) {
          if (this.exhausted()) break;
          if (!x.outs) continue;
          const line = this.action(x.outs, depth - 1);
          if (line.value > best.value) best = line;
        }
      }
    }
    this.tt.set(k, best);
    return best;
  }

  /** Answers pending decisions (other than mine at the start of a turn) with one-step choices. */
  private settle(state: GameState): GameState {
    let s = state;
    for (let i = 0; i < 20 && s.pending.length && s.phase !== 'over'; i++) {
      const head = s.pending[0];
      if (head.kind === 'setupRoll' || head.kind === 'skillDraft' || head.kind === 'placeStart' || head.kind === 'placeShips') break;
      if (head.kind === 'combat') {
        s = apply(s, { type: 'resolveCombat' });
        continue;
      }
      const who = actor(s);
      let pick: GameState | null = null;
      let top = -Infinity;
      // Candidates are tried here, which is all legalActions would do to them first.
      for (const a of head.kind === 'unveil' ? unveilPlacements(s) : decisionCandidates(s)) {
        const outs = outcomes(s, a, this.seeds.slice(0, 1));
        if (!outs) continue;
        // Nested decisions are settled with the first option, to keep this cheap.
        const v = outs.reduce((sum, o) => sum + o.p * this.score(quickSettle(o.state), who), 0);
        if (v > top) {
          top = v;
          pick = outs.reduce((best, o) => (o.p > best.p ? o : best)).state;
        }
      }
      if (!pick) break;
      s = pick;
    }
    return s;
  }

  /** The value of `end` after I finish my turn and the next player plays theirs (`reply` policy). */
  private afterReply(end: GameState, random: () => number): number {
    const captain = new Search(this.me, LEVEL_2_REPLY, random, this.evals);
    let s = end;
    if (this.myTurn(s)) s = captain.settle(apply(s, { type: 'endTurn' }));
    const them = s.turn.player;
    // A turn of mine is scored as if I end it now (see evaluate.ts nextMover), but here it has
    // only just started: I move next.
    if (them === this.me) return this.score(s, this.me, this.me);
    const opponent = new Search(them, this.params.reply ?? LEVEL_2_REPLY, random, this.evals);
    for (let i = 0; i < 12 && s.phase !== 'over' && s.turn.player === them; i++) {
      // Decisions that fall to anyone else during their turn are answered by `captain`.
      const a = (s.pending[0] && actor(s) !== them ? captain : opponent).choose(s);
      if (!a) break;
      // The opponent's rolls are sampled: this is a check of the plan, not a full average.
      s = captain.settle(apply({ ...s, rng: seed(random) }, a));
    }
    return this.score(s, this.me, s.turn.player === this.me ? this.me : undefined);
  }
}

/**
 * The first `width` of `scored` (best first), and the best free prototype power beyond them: one that
 * spends no action (Regolith's Barrier). Alone it may score below a paid action, yet it can come first
 * and leave that action to follow, a line the search would otherwise never try.
 */
function withFreePower(s: GameState, scored: Scored[], width: number): Scored[] {
  const top = scored.slice(0, width);
  const free = scored
    .slice(width)
    .find(
      (x) =>
        x.a.type === 'power' &&
        x.outs?.every((o) => o.state.turn.player === s.turn.player && o.state.turn.actionsLeft >= s.turn.actionsLeft),
    );
  return free ? [...top, free] : top;
}

/** Turns in a row a player may end without spending an action before the AI must act. */
const IDLE_LIMIT = 2;

/** The level-2 policy, used to play out the opponent's reply. */
const LEVEL_2_REPLY: SearchParams = { depth: 1, width: 0, innerWidth: 0, samples: 1, carry: false, replies: 0, budget: Infinity };

/** Settles pending decisions with the first legal answer. */
function quickSettle(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < 6 && s.pending.length && s.phase !== 'over'; i++) {
    const head = s.pending[0];
    // Unveil's first option is always Done; asking legalActions would test every placement first.
    if (head.kind === 'combat' || head.kind === 'unveil') {
      s = apply(s, { type: head.kind === 'combat' ? 'resolveCombat' : 'unveilDone' });
      continue;
    }
    // legalActions(s)[0], without trying the answers after it.
    let next: GameState | null = null;
    for (const a of decisionCandidates(s)) if ((next = tryApply(s, a))) break;
    if (!next) break;
    s = next;
  }
  return s;
}

/**
 * Settling Unveil the Fleet (and Reorganization): the next ship onto the first space it may take, or Done when
 * none is left, so every option at the root is played out alike and cheaply. Unveil is many steps, each with up to
 * a hundred spaces (a skill that deploys anywhere isolated): trying them all at each step made one AI decision
 * take minutes. Where each ship goes is still chosen properly, one ship per decision, at the root (`choose`).
 */
function unveilPlacements(s: GameState): Action[] {
  // Built directly: legalActions would build and test every placement to take the first.
  const head = s.pending[0] as Extract<Pending, { kind: 'unveil' }>;
  const targets = deployTargets(s, head.player);
  if (!targets.length) return [{ type: 'unveilDone' }];
  const die = scrapyard(s, head.player).find((d) => !head.reorganize || head.rerolled.includes(d.id));
  if (die) return [{ type: 'unveilDeploy', die: die.id, to: targets[0] }];
  const unrerolled = head.reorganize ? scrapyard(s, head.player).find((d) => !head.rerolled.includes(d.id)) : undefined;
  return [unrerolled ? { type: 'unveilReroll', die: unrerolled.id } : { type: 'unveilDone' }];
}

function seed(random: () => number): number {
  return Math.floor(random() * 2 ** 32) >>> 0;
}

/**
 * The AI's view of the game: the log dropped (it is never needed, and copying it is slow),
 * a random seed of its own instead of the game's RNG, and the unseen deck cards shuffled.
 */
function hideUnknowns(state: GameState, random: () => number): GameState {
  const s = copyState({ ...state, log: [] });
  s.rng = seed(random);
  shuffleUnseen(s, random);
  return s;
}

const sortedEntries = <T>(rec: Record<string, T>) =>
  Object.keys(rec)
    .sort()
    .map((k) => [k, rec[k]]);

/**
 * Identifies a position, for the transposition table and the evaluation cache. The turn and the
 * players go in whole, less what never changes during a game, so a field added to either can't be
 * left out by mistake. Dice are reduced to number and place; the decks to their size, since the AI
 * plays on its own shuffle of them (hideUnknowns).
 */
function signature(s: GameState): string {
  const m = s.market;
  const { moved, abilityUsed, seen, ...turn } = s.turn;
  return JSON.stringify([
    s.dice.map((d) => [d.value, d.loc.zone === 'board' ? d.loc.r * 100 + d.loc.c : d.loc.zone]),
    [turn, sortedEntries(moved), sortedEntries(abilityUsed), sortedEntries(seen)],
    s.players.map(({ id: _id, name: _name, color: _color, ai: _ai, aiLevel: _aiLevel, stats: _stats, ...changing }) => changing),
    [m.skillRow, m.tacticRow, m.skillDeck.length, m.tacticDeck.length, m.skillDiscard.length, m.tacticDiscard.length, m.expansions],
    s.board.planets.map((p) => p.cubes),
    s.gates,
    s.barriers ?? [],
    s.pending,
  ]);
}
