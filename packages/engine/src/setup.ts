/** Game creation and the setup decisions: mech roll, starting skill, starting objective and mechs. */
import { buildBoard, same, startingGround, STARTING_MECHS } from './board';
import { dealt } from './effects';
import { aMech, emptyTurn, fail, headOf, log, note, logTo, name, placeCube, roll, type Handlers } from './core';
import { defaultMapFor } from './rules';
import { effectOf, MAPS, type CardDef, type GameMode } from './data';
import { boardLoc, die, salvageYard } from './lookups';
import { startSlots } from './queries';
import { shuffle } from './rng';
import { DEFAULT_MODE, RULESETS } from './rulesets';
import { ruleOf } from './skillRules';
import type { Die, GameState, PlayerConfig } from './types';

/** Atomics each player starts with (Community Edition). */
const STARTING_ATOMICS = 1;

export interface NewGameOptions {
  players: PlayerConfig[];
  mapId?: string;
  seed?: number;
  /** Defaults to the lobby's first mode. */
  mode?: GameMode;
}

export function createGame(opts: NewGameOptions): GameState {
  const n = opts.players.length;
  // 5 players only on the CE print booklet's 5-player maps, which the mode's map groups decide.
  if (n < 2 || n > 5) throw new Error('A game needs 2–5 players');
  const mode = opts.mode ?? DEFAULT_MODE;
  if (!Object.hasOwn(RULESETS, mode)) throw new Error(`Unknown mode ${mode}`);
  const rules = RULESETS[mode];
  const map = opts.mapId ? MAPS.find((m) => m.id === opts.mapId) : defaultMapFor(rules, n);
  if (!map) throw new Error(opts.mapId ? `Unknown map ${opts.mapId}` : `No map for ${n} players`);
  if (map.players !== n) throw new Error(`${map.name} is a ${map.players}-player map`);
  if (!rules.mapGroups.includes(map.group)) throw new Error(`${map.name} isn't played with the ${rules.name} rules`);
  const seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
  const ground = startingGround(map);

  const state: GameState = {
    version: 1,
    mode,
    seed,
    rng: seed,
    board: buildBoard(map),
    players: opts.players.map((p, id) => ({
      ...p,
      id,
      power: 1,
      research: 1,
      atomics: STARTING_ATOMICS,
      cubesLeft: map.cubes,
      skills: [],
      finalPushTokens: 0,
      actionPenalty: 0,
      killZone: 0,
      bonusTurns: [],
      storedTactics: [],
      stats: { battlesWon: 0, battlesLost: 0, mechsDestroyed: 0, mechsLost: 0, objectivesTaken: 0, cardsTaken: 0 },
    })),
    dice: [],
    market: {
      skillDeck: [],
      skillRow: [],
      skillDiscard: [],
      tacticDeck: [],
      tacticRow: [],
      tacticDiscard: [],
      reinforcements: rules.cards?.reinforcementPile ? n + 1 : 0,
    },
    tunnels: ground.tunnels,
    ...(ground.wormhole.length && { wormhole: ground.wormhole }),
    ...(ground.barriers.length && { barriers: ground.barriers.map((c) => ({ ...c, owner: null })) }),
    turn: emptyTurn(0, 0),
    pending: [],
    phase: 'setup',
    winner: null,
    combatCounter: 0,
    log: [],
    logCounter: 0,
  };

  const m = state.market;
  if (rules.cards) {
    // Only cards whose effect is implemented are shuffled in, so every card drawn works; on a hex map, none about corners.
    const deck = (defs: CardDef[]) =>
      shuffle(
        state,
        defs.filter((c) => dealt(effectOf(c.id))).flatMap((c) => Array.from({ length: c.count }, () => c.id)),
      );
    m.skillDeck = deck(rules.cards.skills);
    m.tacticDeck = deck(rules.cards.tactics);
    for (let i = 0; i < 3; i++) {
      m.skillRow.push(m.skillDeck.shift()!);
      m.tacticRow.push(m.tacticDeck.shift()!);
    }
  }

  // 7 dice per player: STARTING_MECHS (3) starting mechs, 2 mechs in reserve (2 more are trackers).
  for (const p of state.players) {
    for (let i = 0; i < 5; i++) {
      const d: Die = {
        id: `p${p.id}d${i}`,
        owner: p.id,
        value: 1,
        loc: i < STARTING_MECHS ? { zone: 'salvageYard' } : { zone: 'reserve' },
        rolls: 0,
      };
      if (i < STARTING_MECHS) roll(state, d);
      state.dice.push(d);
    }
    state.pending.push({ kind: 'setupRoll', player: p.id, rerolled: false });
    if (rules.cards?.startingSkillDraft) {
      state.pending.push({ kind: 'skillDraft', player: p.id, options: [m.skillDeck.shift()!, m.skillDeck.shift()!] });
    }
  }
  log(state, `New ${rules.title} game on ${map.name}.`);
  const nBarriers = ground.barriers.length;
  if (ground.tunnels.length || ground.wormhole.length || nBarriers)
    log(
      state,
      `The ground starts with ${[ground.tunnels.length && 'a pair of ice tunnels', ground.wormhole.length && 'a wormhole', nBarriers && `${nBarriers} barriers`].filter(Boolean).join(' and ')}.`,
    );
  return state;
}

export const setupHandlers = {
  setupKeep(s) {
    headOf(s, 'setupRoll', 'Not rolling mechs');
    s.pending.shift();
  },
  setupReroll(s) {
    const head = headOf(s, 'setupRoll', 'Not rolling mechs');
    if (head.rerolled) fail('You may only re-roll once');
    head.rerolled = true;
    const mechs = salvageYard(s, head.player);
    for (const d of mechs) roll(s, d);
    note(s, `${name(s, head.player)} re-rolls their mechs: ${mechs.map((d) => d.value).join(', ')}.`, head.player);
  },
  draftSkill(s, a) {
    const head = headOf(s, 'skillDraft', 'Not drafting');
    if (!head.options.includes(a.skill)) fail('Not one of your options');
    s.players[head.player].skills.push({ id: a.skill, active: true });
    for (const o of head.options) if (o !== a.skill) s.market.skillDeck.push(o);
    log(s, `${name(s, head.player)} chooses a starting skill.`, head.player);
    s.pending.shift();
    // As for a skill taken later: "Get a free Tactic with this card."
    if (ruleOf(a.skill).storeTactics) s.pending.unshift({ kind: 'strategicPlanTactic', player: head.player });
  },
  placeStart(s, a) {
    const head = headOf(s, 'placeStart', 'Not placing a starting objective');
    const objective = s.board.objectives[a.objective];
    if (!objective?.start) fail('Choose a starting objective');
    if (objective.cubes.length) fail('That starting objective is taken');
    placeCube(s, head.player, objective.id);
    s.players[head.player].home = objective.id;
    log(s, `${name(s, head.player)} starts at objective ${objective.number}.`, head.player, undefined, [objective.id]);
    s.pending.shift();
    // Rulebook p.3: every player places a cube first, then mechs are placed in player order.
    s.pending.push({ kind: 'placeMechs', player: head.player, objective: objective.id });
  },
  placeMech(s, a) {
    const head = headOf(s, 'placeMechs', 'Not placing starting mechs');
    const d = die(s, a.die);
    if (d.owner !== head.player || d.loc.zone !== 'salvageYard') fail('Choose one of your starting mechs');
    if (!startSlots(s, head.objective).some((p) => same(p, a.to))) fail('Place it in an empty perimeter space of your starting objective');
    d.loc = boardLoc(a.to);
    logTo(s, head.player, `${name(s, head.player)} places ${aMech(s, d)}`, a.to);
    // When the last mech is placed, settle() moves on (turn.ts AUTO_RESOLVE.placeMechs).
  },
} satisfies Partial<Handlers>;
