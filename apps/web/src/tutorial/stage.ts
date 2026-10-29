import { buildBoard, createGame, type Cell, type GameState, type MapDef, type TurnState } from '@regolith/engine';
import { PLAYER_COLORS } from '../theme';

/**
 * The training ground the demo plays on: two Habitats (7), one for each side, and a Refinery (8) below and
 * between them. Small enough to read at a glance, and it has everything the lessons need: a claim, a
 * fight, an objective to walk round. It is only ever shown: it isn't one of the lobby's maps.
 */
const TRAINING: MapDef = {
  id: 'training-ground',
  name: 'Training ground',
  players: 2,
  group: 'training',
  cubes: 5,
  stats: { slack: 0, shared: 0, planets: 3 },
  world: 'mars',
  layout: [['7*', '7*'], ['8']],
};

/** The objectives by id: both Habitats, then the Refinery. */
export const HOME = { you: 0, foe: 1 } as const;
export const REFINERY = 2;

export type Side = 'you' | 'foe';

/** A mech on the map: row, column, number. */
type Spot = readonly [r: number, c: number, v: number];

/** How a lesson begins. */
export interface Setup {
  /** Each side's mechs on the map, in order; the dice not listed wait in reserve. */
  you: readonly Spot[];
  foe?: readonly Spot[];
  /** Mechs waiting in the salvage yard, by number. */
  salvage?: Partial<Record<Side, readonly number[]>>;
  /** Cubes on the map besides the two home cubes: objective id → sides. */
  cubes?: Record<number, readonly Side[]>;
  /** Power track positions (1–6). */
  power?: Partial<Record<Side, number>>;
  /** Barriers already on the map. */
  barriers?: readonly Cell[];
  /** Whose turn it is, with how many actions left. */
  turn?: { side: Side; actions: number };
}

const index = (s: Side) => (s === 'you' ? 0 : 1);

const turnOf = (player: number, actionsLeft: number): TurnState => ({
  player,
  number: 1,
  phase: 'actions',
  actionsLeft,
  freeDeploys: 0,
  moved: {},
  abilityUsed: {},
  seen: {},
  conquests: 0,
  attacked: false,
  destroyedBy: [],
  oncePerTurn: [],
  bonus: false,
  curiousUsed: false,
  storedTacticPlayed: false,
});

/**
 * A game in progress, laid out as `setup` says on the training ground: Basic rules, setup over, each side's
 * cube on its Habitat. The seed decides every roll the lesson makes.
 */
export function stage(setup: Setup, seed: number): GameState {
  const s = createGame({
    players: [
      { name: 'You', color: PLAYER_COLORS[0], ai: false },
      { name: 'Rival', color: PLAYER_COLORS[1], ai: false },
    ],
    mode: 'basic',
    seed,
  });
  s.board = buildBoard(TRAINING);
  s.log = [];
  s.logCounter = 0;
  s.pending = [];
  s.phase = 'play';
  const placed = (planet: number) => s.board.planets[planet];
  for (const [id, sides] of Object.entries({ [HOME.you]: ['you'], [HOME.foe]: ['foe'], ...setup.cubes } as Record<
    number,
    readonly Side[]
  >)) {
    for (const side of sides) {
      placed(Number(id)).cubes.push(index(side));
      s.players[index(side)].cubesLeft--;
    }
  }
  s.players[0].home = HOME.you;
  s.players[1].home = HOME.foe;
  for (const side of ['you', 'foe'] as const) {
    const spots = setup[side] ?? [];
    const waiting = setup.salvage?.[side] ?? [];
    const dice = s.dice.filter((d) => d.owner === index(side));
    dice.forEach((d, i) => {
      if (i < spots.length) {
        const [r, c, v] = spots[i];
        d.loc = { zone: 'board', r, c };
        d.value = v;
      } else if (i - spots.length < waiting.length) {
        d.loc = { zone: 'scrapyard' };
        d.value = waiting[i - spots.length];
      } else d.loc = { zone: 'reserve' };
    });
  }
  for (const side of ['you', 'foe'] as const) {
    const p = s.players[index(side)];
    p.dominance = setup.power?.[side] ?? 1;
    p.missiles = 1;
  }
  if (setup.barriers?.length) s.barriers = setup.barriers.map((c) => ({ ...c, owner: null }));
  const { side, actions } = setup.turn ?? { side: 'you', actions: 3 };
  s.turn = turnOf(index(side), actions);
  for (const d of s.dice) if (d.owner === index(side)) s.turn.seen[d.id] = [d.value];
  return s;
}

/** The die ids of a side's mechs, in the order `Setup` lists them. */
export const mech = (side: Side, i: number) => `p${index(side)}d${i}`;
