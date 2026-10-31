/**
 * A map as text, for laying out its `start` features (data/maps.yaml): every space labelled `row:col:side`, as
 * a start list names it, objectives as [number], Alien Artefacts with ~, and what the map starts with marked: tunnel
 * ends as (T), barriers as #.
 *
 *   npm run map:show -- <map id> [--labels=1]
 *
 * With --labels=0 the spaces show only their kind (. open, ~ Alien Artefact), for judging a layout at a glance.
 *
 * To lay a symmetric start list, give --spin=<fold>@<row:col> (2, 3 or 6, round the middle of that tile) and
 * --pick=<space>,<space>…: it prints each space and its turns, ready for maps.yaml.
 *
 * --ring=<row:col>@<distance> lists the spaces that far from the middle of that tile.
 *
 * --line=<k> lists the spaces of a straight wall across the drawing: those at line k of the printout (spaces at line k
 * in the columns of k's parity, at k - 1 in the others), left to right, with each one's column and line.
 */
import { MAPS, createGame } from '../packages/engine/src';
import { startSpace } from '../packages/engine/src/board';
import { args } from './args';

const o = args({ map: 'alpha-hex', labels: '1', spin: '', pick: '', ring: '', line: '' });
const map = MAPS.find((m) => m.id === o.map);
if (!map) throw new Error(`No map ${o.map}: ${MAPS.map((m) => m.id).join(', ')}`);

const s = createGame({
  players: Array.from({ length: map.players }, (_, i) => ({ name: `P${i}`, color: '#fff', ai: false })),
  seed: 1,
  mapId: map.id,
});
const { board } = s;

// Each space's label, by finding which tile and side reaches it.
const label = new Map<string, string>();
map.layout.forEach((row, tr) =>
  row.forEach((token, tc) => {
    if (token === '.') return;
    for (const side of ['m', 'n', 'ne', 'se', 's', 'sw', 'nw']) {
      try {
        const at = startSpace(map, `${tr}:${tc}:${side}`);
        label.set(`${at.r},${at.c}`, `${tr}:${tc}:${side}`);
      } catch {
        // The tile's objective is no space.
      }
    }
  }),
);

const lines = new Map<number, string[]>();
const W = o.labels === '1' ? 6 : 3;
const put = (l: number, x: number, text: string) => {
  const row = lines.get(l) ?? [];
  while (row.length < x) row.push(' ');
  for (let i = 0; i < text.length; i++) row[x + i] = text[i];
  lines.set(l, row);
};
const tunnel = [...s.gates, ...(s.wormhole ?? [])].map((g) => `${g.r},${g.c}`);
const wall = (s.barriers ?? []).map((b) => `${b.r},${b.c}`);
board.cells.forEach((row, r) =>
  row.forEach((cell, c) => {
    if (cell.kind === 'off') return;
    const k = `${r},${c}`;
    let text: string;
    if (cell.kind === 'planet') {
      const p = board.planets[cell.planet!];
      text = `[${p.number}${p.start ? '*' : ''}]`;
    } else if (tunnel.includes(k)) text = o.labels === '1' ? `(T)${label.get(k)}` : '(T)';
    else if (wall.includes(k)) text = o.labels === '1' ? `###${label.get(k)}` : '#';
    else if (o.labels === '1') text = `${cell.void ? '~' : ''}${label.get(k) ?? '?'}`;
    else text = cell.void ? '~' : '.';
    put(2 * r + c, c * (W + 1), text);
  }),
);
console.log(`${map.name} (${map.players} players, ${map.cubes} cubes)`);
for (const l of [...lines.keys()].sort((a, b) => a - b)) console.log(lines.get(l)!.join('').trimEnd());

if (o.spin) {
  const [fold, at] = o.spin.split('@');
  const cellOf = new Map([...label].map(([k, v]) => [v, k.split(',').map(Number)]));
  const [tr, tc] = at.split(':').map(Number);
  const tileCols = Math.max(...map.layout.map((r) => r.length));
  // The tile's middle space: the one of its cells whose six neighbours are all in the tile.
  const tile = tr * tileCols + tc;
  const inTile = (r: number, c: number) =>
    board.cells[r]?.[c]?.kind !== undefined && board.cells[r][c].kind !== 'off' && board.cells[r][c].tile === tile;
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
  if (!mid) throw new Error(`No tile ${at}`);
  /** A sixth of a turn about the middle, in cube coordinates (x = c, z = r): (x, y, z) -> (-z, -x, -y). */
  const sixth = (p: { r: number; c: number }) => {
    const x = p.c - mid![1];
    const z = p.r - mid![0];
    return { r: x + z + mid![0], c: -z + mid![1] };
  };
  for (const spec of o.pick.split(',')) {
    const [r, c] = cellOf.get(spec) ?? [];
    if (r === undefined) throw new Error(`No space ${spec}`);
    const out = [spec];
    let cur = { r, c };
    for (let i = 1; i < Number(fold); i++) {
      for (let k = 0; k < 6 / Number(fold); k++) cur = sixth(cur);
      out.push(label.get(`${cur.r},${cur.c}`) ?? `off(${cur.r},${cur.c})`);
    }
    console.log(out.map((x) => `"${x}"`).join(', '));
  }
}

if (o.ring) {
  const [at, dist] = o.ring.split('@');
  const [tr, tc] = at.split(':').map(Number);
  const tileCols = Math.max(...map.layout.map((r) => r.length));
  const cells: [number, number][] = [];
  board.cells.forEach((row, r) => row.forEach((x, c) => x.kind !== 'off' && x.tile === tr * tileCols + tc && cells.push([r, c])));
  const hexDist = (a: number[], b: number[]) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;
  // The tile's middle is the one cell of the tile whose neighbours are all in it.
  const mid = cells.find(([r, c]) => cells.filter(([r2, c2]) => hexDist([r, c], [r2, c2]) === 1).length === 6)!;
  const out: string[] = [];
  board.cells.forEach((row, r) =>
    row.forEach((x, c) => x.kind === 'space' && hexDist(mid, [r, c]) === Number(dist) && out.push(label.get(`${r},${c}`) ?? `?${r},${c}`)),
  );
  console.log(out.map((x) => `"${x}"`).join(', '));
}

if (o.line) {
  const k = Number(o.line);
  const out: string[] = [];
  const cols = [...new Set(board.cells.flatMap((row) => row.map((x, c) => (x.kind === 'off' ? -1 : c))))]
    .filter((c) => c >= 0)
    .sort((a, b) => a - b);
  for (const c of cols)
    board.cells.forEach((row, r) => {
      const want = c % 2 === k % 2 ? k : k - 1;
      if (row[c].kind === 'space' && 2 * r + c === want) out.push(`"${label.get(`${r},${c}`)}"`);
    });
  console.log(out.join(', '));
}
