/**
 * Searches for symmetric start features that change how far the homes are from each other, for laying a
 * prepared map (data/maps.yaml `start`): greedy, a turn's worth of spaces at a time.
 *
 *   npm run map:design -- <map id> --spin=<2|3>@<row:col> [--mode=barriers|tunnel] [--count=3] [--keep=<spaces>] [--ban=<spaces>]
 *
 * `barriers`: adds the orbit of spaces (the space and its turns) that most lengthens the shortest walk between
 * the nearest pair of homes, `count` times, never walling a start in or cutting an objective off. `tunnel`: the
 * pair of spaces (a space and its half turn) that shortens the walks most evenly, so no pair of seats gets a
 * lane the others lack. `--keep` starts from some barriers.
 * Prints the spaces as `row:col:side`, and the walks before and after.
 */
import { MAPS, createGame, cellAt, key, linked, orbitals, spaces, type Cell, type GameState } from '../packages/engine/src';
import { startSpace } from '../packages/engine/src/board';
import { args } from './args';

const o = args({ map: 'alpha-hex', spin: '2@0:0', mode: 'barriers', count: '3', keep: '', ban: '' });
const map = MAPS.find((m) => m.id === o.map)!;
const base: GameState = createGame({
  players: Array.from({ length: map.players }, () => ({ name: 'p', color: '#fff', ai: false })),
  seed: 1,
  mapId: map.id,
});
const { board } = base;
const [fold, at] = o.spin.split('@');
const [tr, tc] = at.split(':').map(Number);
const tileCols = Math.max(...map.layout.map((r) => r.length));
const inTile = (r: number, c: number) =>
  board.cells[r]?.[c]?.kind !== undefined && board.cells[r][c].kind !== 'off' && board.cells[r][c].tile === tr * tileCols + tc;
const NB = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, 1],
  [1, -1],
];
let mid: number[] | undefined;
board.cells.forEach((row, r) => row.forEach((_, c) => inTile(r, c) && NB.every(([dr, dc]) => inTile(r + dr, c + dc)) && (mid = [r, c])));
if (!mid) throw new Error('no such tile');
const sixth = (p: Cell): Cell => ({ r: p.c - mid![1] + (p.r - mid![0]) + mid![0], c: -(p.r - mid![0]) + mid![1] });
const orbit = (p: Cell): Cell[] => {
  const out = [p];
  let cur = p;
  for (let i = 1; i < Number(fold); i++) {
    for (let k = 0; k < 6 / Number(fold); k++) cur = sixth(cur);
    out.push(cur);
  }
  return out;
};
const label = new Map<string, string>();
map.layout.forEach((row, rr) =>
  row.forEach((token, cc) => {
    if (token === '.') return;
    for (const side of ['m', 'n', 'ne', 'se', 's', 'sw', 'nw']) {
      try {
        const p = startSpace(map, `${rr}:${cc}:${side}`);
        label.set(key(p), `${rr}:${cc}:${side}`);
      } catch {
        // an objective
      }
    }
  }),
);

const homes = board.planets.filter((p) => p.start);
const barrierKeys = (cells: Cell[]) => new Set(cells.map(key));
/** The walks between each pair of homes (fewest steps from one's perimeter to the other's), or 99 when cut off. */
function walks(barriers: Cell[], gates: Cell[]): number[] {
  const s = { ...base, barriers: barriers.map((c) => ({ ...c, owner: null })), gates };
  const wall = barrierKeys(barriers);
  const out: number[] = [];
  for (let i = 0; i < homes.length; i++) {
    const d = new Map<string, number>();
    const q = orbitals(board, homes[i]).filter((c) => !wall.has(key(c)));
    q.forEach((c) => d.set(key(c), 0));
    for (let h = 0; h < q.length; h++)
      for (const n of linked(s, q[h])) {
        if (cellAt(board, n)?.kind !== 'space' || wall.has(key(n)) || d.has(key(n))) continue;
        d.set(key(n), d.get(key(q[h]))! + 1);
        q.push(n);
      }
    for (let j = i + 1; j < homes.length; j++) out.push(Math.min(99, ...orbitals(board, homes[j]).map((c) => d.get(key(c)) ?? 99)));
  }
  return out;
}
/** Whether every objective can still be reached from every home, and each home keeps its room. */
function sound(barriers: Cell[], gates: Cell[]): boolean {
  const s = { ...base, barriers: barriers.map((c) => ({ ...c, owner: null })), gates };
  const wall = barrierKeys(barriers);
  const startsPerim = new Set(homes.flatMap((h) => orbitals(board, h).map(key)));
  if (barriers.some((c) => startsPerim.has(key(c)))) return false;
  const seen = new Set<string>();
  const q = orbitals(board, homes[0]).filter((c) => !wall.has(key(c)));
  q.forEach((c) => seen.add(key(c)));
  for (let h = 0; h < q.length; h++)
    for (const n of linked(s, q[h])) {
      if (cellAt(board, n)?.kind !== 'space' || wall.has(key(n)) || seen.has(key(n))) continue;
      seen.add(key(n));
      q.push(n);
    }
  return board.planets.every((p) => orbitals(board, p).some((c) => seen.has(key(c))));
}

const cand = spaces(board).filter((c) => label.has(key(c)) && !o.ban.split(',').includes(label.get(key(c))!));
const fromLabel = (l: string) => startSpace(map, l);
const show = (cells: Cell[]) => cells.map((c) => `"${label.get(key(c)) ?? '?'}"`).join(', ');
const none = walks([], []);
console.log('walks between homes, open ground:', none.join(' '));

if (o.mode === 'barriers') {
  let bars: Cell[] = o.keep ? o.keep.split(',').map(fromLabel) : [];
  for (let step = 0; step < Number(o.count); step++) {
    let best: { cells: Cell[]; score: number } | undefined;
    for (const c of cand) {
      const cells = orbit(c);
      if (cells.some((x) => !label.has(key(x)) || cellAt(board, x)?.kind !== 'space' || bars.some((b) => key(b) === key(x)))) continue;
      const next = [...bars, ...cells];
      if (!sound(next, [])) continue;
      const w = walks(next, []);
      // The nearest pair of homes matters most, then the sum.
      const score = Math.min(...w) * 100 + w.reduce((a, b) => a + b, 0);
      if (!best || score > best.score) best = { cells, score };
    }
    if (!best) break;
    bars = [...bars, ...best.cells];
    console.log(`+ ${show(best.cells)}   walks now ${walks(bars, []).join(' ')}`);
  }
  console.log(`barriers: [${show(bars)}]`);
} else {
  let best: { pair: Cell[]; score: number; w: number[] } | undefined;
  for (const c of cand) {
    const pair = orbit(c);
    if (pair.length !== 2 || !label.has(key(pair[1])) || key(pair[0]) === key(pair[1])) continue;
    const w = walks([], pair);
    if (!sound([], pair)) continue;
    // Every pair of homes keeps at least a step of its own walk, and the longest walks shrink most evenly.
    const gain = w.map((x, i) => none[i] - x);
    const score = Math.min(...gain) * 100 - Math.max(...gain) * 10 + gain.reduce((a, b) => a + b, 0);
    if (!best || score > best.score) best = { pair, score, w };
  }
  if (best) console.log(`tunnel: [${show(best.pair)}]   walks now ${best.w.join(' ')}`);
}
