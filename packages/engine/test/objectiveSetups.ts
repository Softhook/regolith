/**
 * Setups for exploring hard objectives, 11 to 16: maps from data/maps.yaml with their middle objective (or a
 * symmetric pair) replaced by a **hub**, `H` in the layout, played at a chosen number, capacity and cube count.
 * scripts/objective-probe.ts plays them (`npm run selfplay:objectives`); objectiveSetups.test.ts checks that each
 * is symmetric, that its control is the map it is built on, and that it lays out and plays at every hub number.
 *
 * The game knows only 7–12 (`CAPACITY`, board.ts). A hub of another number, or of another capacity, is laid by
 * setting `CAPACITY` for the game being made (`hubMap`), and the map is added to `MAPS` under an id of its own, so
 * nothing in the engine changes.
 *
 * **Forcing.** An objective takes at most one cube from each player, so the cubes a table can place without the
 * hub are the other objectives' capacity. `slack` is that capacity less players × cubes: below 0, someone has to
 * place a cube on the hub (by a claim or Take Over) or go back to their own objective (+3 to the sum, and only
 * once every objective with room holds their cube, the hub included while it has room). Each setup has a
 * cube count where the hub is optional and one where it is forced.
 */
import { CAPACITY, MAPS, parseToken, type MapDef, type World } from '../src';

export interface ObjectiveSetup {
  id: string;
  name: string;
  players: number;
  /** The map in data/maps.yaml it is built on, which `H` = `control` lays out again; absent for a layout of its own. */
  base?: string;
  /** The hub's number on the base map, played as the control: 0 where the base map has an Alien Artefact there. */
  control: number;
  world: World;
  /** Rows of tile tokens, `H` for each hub. Tokens sit in the middle of their tiles (no drift), so turning the map keeps them. */
  layout: string[];
  /** Cube counts to play: one leaving the hub optional, one forcing it (see `slack`). */
  cubes: number[];
  note: string;
}

export const OBJECTIVE_SETUPS: ObjectiveSetup[] = [
  {
    id: 'duel-alpha',
    name: 'Alpha Sector',
    players: 2,
    base: 'alpha-hex',
    control: 8,
    world: 'phobos',
    layout: ['.  7*', '7  7', '7  H  7', '7  7', '.  7*'],
    cubes: [4, 5],
    note: 'Eight 7s round the hub: every 7 holds one cube, so the 7s are a race and the hub is the shared prize.',
  },
  {
    id: 'duel-thin',
    name: 'Thin Alpha',
    players: 2,
    control: 8,
    world: 'phobos',
    layout: ['.  7*', '-  7', '7  H  7', '7  -', '.  7*'],
    cubes: [3, 4],
    note: 'Alpha Sector with two 7s turned to open ground: six one-cube objectives, so 4 cubes already force the hub.',
  },
  {
    id: 'duel-canyon',
    name: 'Canyon Relay',
    players: 2,
    base: 'canyon-relay',
    control: 10,
    world: 'mars',
    layout: ['8* 7  9  7  H  7  9  7  8*'],
    cubes: [6, 8],
    note: 'A single lane: the hub sits across it, halfway between the homes, and every walk passes it.',
  },
  {
    id: 'duel-olympus',
    name: 'Olympus Mons',
    players: 2,
    base: 'olympus-mons',
    control: 10,
    world: 'mars',
    layout: ['.  8* 7  8', '7  0  -  -', '-  -  H  -  -', '-  -  0  7', '.  8  7  8*'],
    cubes: [5, 7],
    note: 'Open ground: the hub stands alone in the middle, with room to come at it from every side.',
  },
  {
    id: 'duel-pair',
    name: 'Valles Marineris',
    players: 2,
    base: 'valles-marineris',
    control: 10,
    world: 'mars',
    layout: ['.  -  8  -  H  -  7', '8* -  7  -  -  7  -  8*', '.  .  7  -  H  -  8  -'],
    cubes: [6, 7],
    note: 'Two hubs, one on each side of the canyon: each nearer one home.',
  },
  {
    id: 'trio-junction',
    name: 'Triple Junction',
    players: 3,
    base: 'triple-junction',
    control: 0,
    world: 'phobos',
    layout: ['9* 8  7  9*', '7  H  8', '.  8  7', '.  9*'],
    cubes: [5, 7],
    note: 'The Alien Artefact at the junction becomes the hub (Mare Trigonum is this map with an 11 there, and 6 cubes).',
  },
  {
    id: 'quad-gamma',
    name: 'Gamma Sector',
    players: 4,
    base: 'gamma-hex',
    control: 10,
    world: 'phobos',
    layout: ['.  9*', '9  8', '8* H  8*', '8  9', '.  9*'],
    cubes: [5, 6],
    note: 'A tight four: two homes touch the hub directly, so its perimeter is home ground for half the table.',
  },
  {
    id: 'quad-confluence',
    name: 'Fourfold Confluence, balanced',
    players: 4,
    control: 12,
    world: 'deimos',
    layout: ['.  .  8*', '.  .  8', '.  7  7', '8* 8  H  8  8*', '.  .  .  7  7', '.  .  8', '.  .  .  8*'],
    cubes: [5, 6],
    note:
      'Four arms meeting at the hub (a 12 holding 3). The real map does not turn onto itself (its lower 7s and ' +
      'its south start sit a place to the left of where a half turn puts them); here they are moved so it does.',
  },
];

/** The capacity each number has in the game itself, before any setup changes it. */
const GAME_CAPACITY: Readonly<Record<number, number>> = { ...CAPACITY };

/** A hub's capacity as asked for: a number, `P` (one per player), or `game` (the game's own, 11 → 2 and 12 → 3). */
export function hubCapacity(cap: string, hub: number, players: number): number | undefined {
  if (cap === 'P') return players;
  if (cap === 'game') return GAME_CAPACITY[hub];
  const n = Number(cap);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Bad capacity "${cap}": a number, P or game`);
  return n;
}

const tokens = (layout: string[]) => layout.map((row) => row.trim().split(/\s+/));
const capacityOf = (token: string, hub: number, hubCap: number) => {
  if (token === '.' || token === '-' || token === '0') return 0;
  if (token === 'H') return hub ? hubCap : 0;
  return GAME_CAPACITY[parseToken(token).number];
};

/**
 * The cube places on a setup's objectives less the cubes to place: everything, and without the hub. Below 0
 * without the hub, the table can only place all its cubes by using the hub (or going back to its own).
 */
export function slack(setup: ObjectiveSetup, hub: number, hubCap: number, cubes: number) {
  const caps = tokens(setup.layout).flat();
  const all = caps.reduce((n, t) => n + capacityOf(t, hub, hubCap), 0);
  const hubs = caps.filter((t) => t === 'H').length * (hub ? hubCap : 0);
  return { all: all - setup.players * cubes, withoutHub: all - hubs - setup.players * cubes };
}

/** The setup's layout with each `H` replaced by `hub` (0 for an Alien Artefact), as data/maps.yaml tokens. */
export function hubLayout(setup: ObjectiveSetup, hub: number): string[][] {
  return tokens(setup.layout).map((row) => row.map((t) => (t === 'H' ? String(hub) : t)));
}

/** The map ids a setup is played under, one per hub number, capacity and cube count. */
const hubMapId = (setup: ObjectiveSetup, hub: number, cap: number, cubes: number) => `objective:${setup.id}:${hub}x${cap}:${cubes}`;

/**
 * The map of a setup at a hub number, capacity and cube count, added to `MAPS` the first time. Call it right
 * before `createGame`: it sets `CAPACITY[hub]` (as games are laid one at a time, the last setting is the one
 * the board takes). An 11 is laid on Phobos and a 12 on Deimos, the
 * worlds they stand on; any other number on the setup's world.
 */
export function hubMap(setup: ObjectiveSetup, hub: number, cap: number, cubes: number): MapDef {
  if (hub > 0 && cap !== GAME_CAPACITY[hub]) {
    // Other objectives of the hub's number would change with it.
    if (
      tokens(setup.layout)
        .flat()
        .some((t) => t !== 'H' && /^\d/.test(t) && parseToken(t).number === hub)
    )
      throw new Error(`${setup.id}: a hub of ${hub} can't hold ${cap}, as the map's other ${hub}s hold ${GAME_CAPACITY[hub]}`);
  }
  if (hub > 0) CAPACITY[hub] = cap;
  const id = hubMapId(setup, hub, cap, cubes);
  const known = MAPS.find((m) => m.id === id);
  if (known) return known;
  const world: World = hub === 11 ? 'phobos' : hub === 12 ? 'deimos' : setup.world;
  const map: MapDef = {
    id,
    name: `${setup.name}, hub ${hub || 'none'} (${cap})`,
    players: setup.players,
    group: 'hex',
    world,
    cubes,
    stats: { slack: 0, shared: null, objectives: 0 },
    layout: hubLayout(setup, hub),
  };
  MAPS.push(map);
  return map;
}

/** Layout place (row, place in the row counting gaps) of each `H`, as board.ts numbers tiles (row × widest row + place). */
export function hubTiles(setup: ObjectiveSetup): number[] {
  const rows = tokens(setup.layout);
  const cols = Math.max(...rows.map((r) => r.length));
  return rows.flatMap((row, r) => row.flatMap((t, c) => (t === 'H' ? [r * cols + c] : [])));
}

/**
 * Whether the layout turns onto itself, token for token, by a half turn (2 or 4 players) or a third of a turn
 * (3 players), as data/maps.yaml's maps do so that the seats match. Odd rows sit half a tile right ("odd-r");
 * the centre may be a tile, the middle of two tiles' shared side (half turn) or the corner of three (third).
 */
export function isSymmetric(setup: ObjectiveSetup): boolean {
  const rows = tokens(setup.layout);
  // Cube coordinates, times 6 so that every centre tried (a middle of two, a centre of three) is a whole point.
  const tiles = rows.flatMap((row, r) =>
    row.flatMap((t, c) => {
      if (t === '.') return [];
      const q = c - (r - (r & 1)) / 2;
      return [{ t, x: 6 * q, z: 6 * r, y: -6 * q - 6 * r }];
    }),
  );
  const at = new Map(tiles.map((p) => [`${p.x},${p.z}`, p.t]));
  const turns = setup.players === 3 ? 3 : 2;
  const fits = (cx: number, cy: number, cz: number) =>
    tiles.every((p) => {
      const [dx, dy, dz] = [p.x - cx, p.y - cy, p.z - cz];
      // A half turn is (x, y, z) → (−x, −y, −z); a third of a turn (x, y, z) → (z, x, y).
      const [rx, , rz] = turns === 2 ? [-dx, -dy, -dz] : [dz, dx, dy];
      return at.get(`${cx + rx},${cz + rz}`) === p.t;
    });
  for (const a of tiles)
    for (const b of tiles) {
      if (turns === 2 && fits((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)) return true;
      if (turns === 3) {
        if (fits(a.x, a.y, a.z)) return true;
        // The centre of three tiles: the corner where they meet, when they touch.
        for (const c of tiles) if (fits((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3)) return true;
      }
    }
  return false;
}
