import { CAPACITY, parseToken } from './board';
import type { MapDef } from './data';

export interface MapStats {
  /** Cube locations left over if every player placed all their cubes. */
  slack: number;
  /** Objectives with an empty cube location after setup. */
  objectives: number;
  /**
   * The fewest of those objectives that must end up shared if every player placed all their cubes;
   * null when the map has too few cube locations for everyone to do so.
   */
  shared: number | null;
}

/**
 * Computes a map's stats (the CE booklet's definitions) from its layout, assuming each player
 * starts on a different starting objective in order.
 *
 * `shared` is the smallest set of objectives that, opened to several players, lets everyone place
 * their remaining cubes (one per objective each). Objectives of the same capacity are interchangeable,
 * as are other players' starting objectives, so we try every count of each kind of objective, smallest
 * total first, and check each with a max-flow.
 */
export function mapStats(map: MapDef): MapStats {
  const objectives = map.layout
    .flat()
    .filter((t) => t !== '.')
    .map(parseToken)
    .filter((t) => t.number > 0)
    .map((t) => ({ cap: CAPACITY[t.number], start: t.start }));
  const owner = objectives.map(() => -1);
  objectives
    .map((p, i) => (p.start ? i : -1))
    .filter((i) => i >= 0)
    .slice(0, map.players)
    .forEach((i, player) => (owner[i] = player));
  const slack = objectives.reduce((a, p) => a + p.cap, 0) - map.players * map.cubes;
  const open = objectives.filter((p, i) => p.cap > (owner[i] >= 0 ? 1 : 0)).length;

  // Kinds of objective: free objectives by capacity, and owned starting objectives by capacity.
  const kinds = new Map<string, number[]>();
  objectives.forEach((p, i) => {
    const k = `${owner[i] >= 0 ? 's' : 'f'}${p.cap}`;
    kinds.set(k, [...(kinds.get(k) ?? []), i]);
  });
  const groups = [...kinds.values()];

  const feasible = (shared: Set<number>) =>
    maxFlow(
      map.players,
      objectives.length,
      map.cubes - 1,
      (pl, i) => owner[i] !== pl,
      (i) => {
        const used = owner[i] >= 0 ? 1 : 0;
        return shared.has(i) ? objectives[i].cap - used : Math.max(0, 1 - used);
      },
    ) ===
    map.players * (map.cubes - 1);

  // Every way to pick `k` objectives, as counts per kind.
  const picks = (g: number, k: number): number[][] =>
    g === groups.length
      ? k === 0
        ? [[]]
        : []
      : Array.from({ length: Math.min(k, groups[g].length) + 1 }, (_, n) => picks(g + 1, k - n).map((rest) => [n, ...rest])).flat();

  let shared: number | null = null;
  for (let k = 0; k <= objectives.length && shared === null; k++)
    for (const counts of picks(0, k))
      if (feasible(new Set(counts.flatMap((n, g) => groups[g].slice(0, n))))) {
        shared = k;
        break;
      }
  return { slack, objectives: open, shared };
}

/** Max flow from players (each supplying `need`) to objectives (each taking `cap(i)`), one cube per player per objective. */
function maxFlow(
  players: number,
  objectives: number,
  need: number,
  allowed: (player: number, objective: number) => boolean,
  cap: (objective: number) => number,
): number {
  // Nodes: 0 source, 1..players, then objectives, then sink.
  const n = players + objectives + 2;
  const sink = n - 1;
  const c = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let p = 0; p < players; p++) {
    c[0][1 + p] = need;
    for (let i = 0; i < objectives; i++) if (allowed(p, i)) c[1 + p][1 + players + i] = 1;
  }
  for (let i = 0; i < objectives; i++) c[1 + players + i][sink] = cap(i);

  let flow = 0;
  for (;;) {
    const prev = new Array<number>(n).fill(-1);
    prev[0] = 0;
    const queue = [0];
    while (queue.length && prev[sink] < 0) {
      const u = queue.shift()!;
      for (let v = 0; v < n; v++)
        if (prev[v] < 0 && c[u][v] > 0) {
          prev[v] = u;
          queue.push(v);
        }
    }
    if (prev[sink] < 0) return flow;
    let add = Infinity;
    for (let v = sink; v !== 0; v = prev[v]) add = Math.min(add, c[prev[v]][v]);
    for (let v = sink; v !== 0; v = prev[v]) {
      c[prev[v]][v] -= add;
      c[v][prev[v]] += add;
    }
    flow += add;
  }
}
