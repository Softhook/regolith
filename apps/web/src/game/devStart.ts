import {
  apply,
  attackLaunches,
  canRespondToCombat,
  createGame,
  defaultMapFor,
  isEmptySpace,
  legalActions,
  MAPS,
  orbitals,
  MODES,
  tryApply,
  type GameState,
  type PlayerId,
} from '@regolith/engine';
import { DEFAULT_AI_LEVEL } from '@regolith/ai';
import { defaultSeat } from './seats';

/**
 * Dev server only: a link that skips the lobby, for checking a layout on a phone and for
 * scripts/mobile-shots.ts. `?play=regolith&players=4&map=tesseract-hex&seed=7` starts that game with
 * one human (Commander) and AI opponents. `play` is a mode's id or name; `map` defaults to the
 * basic map for the player count; `seed` makes the dice the same every time. Reloading starts the
 * game again. Like any game on this device, it replaces the saved game.
 * `scene=combat|advance|changeOfHeart|takeCard|over` opens on that popup instead, `scene=turn` on your first turn,
 * `scene=win` one conquest from winning (to see the victory show as it happens), `scene=lose` with an AI
 * opponent one conquest from winning on its turn (to hear the lament), and
 * `scene=attackFrom` with a ship that can attack from spaces with different outcomes (see `scene`).
 */
export function devStartGame(): GameState | null {
  if (!import.meta.env.DEV) return null;
  const q = new URLSearchParams(location.search);
  const play = q.get('play')?.toLowerCase();
  if (!play) return null;
  const rules = MODES.find((m) => m.id === play || m.name.toLowerCase() === play);
  const map = q.get('map') ? MAPS.find((m) => m.id === q.get('map')) : rules && defaultMapFor(rules, Number(q.get('players') ?? 2));
  const players = Number(q.get('players') ?? map?.players);
  const seed = Number(q.get('seed'));
  if (!rules || !map || map.players !== players || !rules.mapGroups.includes(map.group)) {
    console.warn(`?play: ${rules?.name ?? play} has no ${players}-player map "${q.get('map') ?? 'default'}"`);
    return null;
  }
  const game = createGame({
    players: Array.from({ length: players }, (_, i) => defaultSeat(i, i !== 0, DEFAULT_AI_LEVEL)),
    mapId: map.id,
    mode: rules.id,
    seed: Number.isFinite(seed) && q.has('seed') ? seed : undefined,
  });
  return q.get('scene') ? scene(game, q.get('scene')!) : game;
}

/**
 * Plays every seat's first choice through setup and on to the human's (player 0's) first turn, then
 * opens a popup: `combat` (the human's ship attacks and may answer, e.g. with a missile), `advance` (it has won and
 * chooses whether to advance), `changeOfHeart` (needs a mode with cards), `takeCard` (a card to pick from the market, likewise) or
 * `over` (the human has won). `win` leaves the human one cube to place, with ships orbiting a planet they can conquer;
 * `lose` stops at the next player's (an AI's) first turn instead, and leaves them so.
 * `turn`, or a scene that can't be set up, stops at that turn.
 */
function scene(game: GameState, name: string): GameState {
  let s = game;
  const who = name === 'lose' ? 1 : 0;
  for (let i = 0; i < 500 && (s.phase === 'setup' || s.turn.player !== who || s.pending.length); i++) {
    const options = legalActions(s);
    s = apply(s, options.find((a) => a.type === 'endTurn') ?? options[0]);
  }
  s = structuredClone(s);
  if (name === 'over') return { ...s, phase: 'over', winner: 0 };
  if (name === 'changeOfHeart') {
    if (s.market.skillDeck.length) s.pending.unshift({ kind: 'changeOfHeart', player: 0 });
    return s;
  }
  if (name === 'takeCard') {
    if (s.market.skillRow.length) s.pending.unshift({ kind: 'takeCard', player: 0, count: 1 });
    return s;
  }
  if (name === 'attackFrom') return attackFrom(s);
  if (name === 'win' || name === 'lose') return oneFromWinning(s, who);
  if (name !== 'combat' && name !== 'advance') return s;
  // Two empty spaces side by side: one of the human's ships attacks one of the next player's, trying
  // ship values until the human can answer the roll (so the battle waits, with its buttons).
  const free = [...Array(s.board.rows * s.board.cols).keys()]
    .map((i) => ({ r: Math.floor(i / s.board.cols), c: i % s.board.cols }))
    .find(({ r, c }) => isEmptySpace(s, { r, c }) && isEmptySpace(s, { r, c: c + 1 }));
  if (!free) return s;
  let fallback: GameState | null = null;
  for (const a of [6, 5, 4, 3, 2, 1]) {
    for (const d of [1, 2, 3, 4, 5, 6]) {
      const t = structuredClone(s);
      const [mine, theirs] = [t.dice.find((x) => x.owner === 0)!, t.dice.find((x) => x.owner === 1)!];
      Object.assign(mine, { loc: { zone: 'board', ...free }, value: a });
      Object.assign(theirs, { loc: { zone: 'board', r: free.r, c: free.c + 1 }, value: d });
      t.turn.seen[mine.id] = [a];
      t.turn.seen[theirs.id] = [d];
      const attacked = tryApply(t, { type: 'attack', die: mine.id, target: theirs.id });
      const head = attacked?.pending[0];
      if (head?.kind !== 'combat') continue;
      if (name === 'advance') {
        const won = tryApply(attacked!, { type: 'resolveCombat' });
        if (won?.pending[0]?.kind === 'advance') return won;
        continue;
      }
      if (canRespondToCombat(attacked!, head, 0)) return attacked!;
      fallback ??= attacked;
    }
  }
  return fallback ?? s;
}

/** Player `p` with one cube left (the rest on other planets) and two ships orbiting an empty planet, numbered so they can conquer it. */
function oneFromWinning(s: GameState, p: PlayerId): GameState {
  for (const planet of s.board.planets) {
    const spots = orbitals(s.board, planet).filter((cell) => isEmptySpace(s, cell));
    if (planet.cubes.length || spots.length < 2) continue;
    for (let a = 1; a <= 6; a++)
      for (let b = 1; b <= 6; b++) {
        const t = structuredClone(s);
        const mine = t.dice.filter((x) => x.owner === p).slice(0, 2);
        if (mine.length < 2) return s;
        Object.assign(mine[0], { loc: { zone: 'board', ...spots[0] }, value: a });
        Object.assign(mine[1], { loc: { zone: 'board', ...spots[1] }, value: b });
        t.turn.seen[mine[0].id] = [a];
        t.turn.seen[mine[1].id] = [b];
        // The other cubes go on other planets, so the count stays true.
        for (const other of t.board.planets) {
          while (other.id !== planet.id && t.players[p].cubesLeft > 1 && other.cubes.length < other.capacity) {
            other.cubes.push(p);
            t.players[p].cubesLeft--;
          }
        }
        if (t.players[p].cubesLeft !== 1) return s;
        if (legalActions(t).some((x) => x.type === 'conquer' && x.planet === planet.id)) return t;
      }
  }
  return s;
}

/** One of the human's ships (a 3) diagonally next but one to an enemy 6 it can attack from spaces with different outcomes. */
function attackFrom(s: GameState): GameState {
  const { rows, cols } = s.board;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const t = structuredClone(s);
      const [mine, theirs] = [t.dice.find((x) => x.owner === 0)!, t.dice.find((x) => x.owner === 1)!];
      mine.loc = theirs.loc = { zone: 'scrapyard' };
      const near = { r: r + 1, c: c - 1 };
      if (!isEmptySpace(t, { r, c }) || !isEmptySpace(t, near)) continue;
      Object.assign(mine, { loc: { zone: 'board', ...near }, value: 3 });
      Object.assign(theirs, { loc: { zone: 'board', r, c }, value: 6 });
      t.turn.seen[mine.id] = [3];
      t.turn.seen[theirs.id] = [6];
      if (attackLaunches(t, mine.id, theirs.id).length >= 2) return t;
    }
  return s;
}
