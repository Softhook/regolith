/**
 * Plays whole games on phone screen sizes by tapping, the way a player would, and lists every moment
 * something you had to tap was off screen or under something else. Step 3's "done when" in
 * docs/MOBILE.md: a 2p Basic and a 3p Regolith game, setup to game over, without scrolling to act.
 *
 *   npm run mobile:play                          # every device × game below
 *   npm run mobile:play -- --device moto-g55     # one device
 *   npm run mobile:play -- --game regolith-3p    # one game
 *   npm run mobile:play -- --url https://…/      # a running dev server
 *
 * The human seat (Commander) plays a random but purposeful game: it takes every decision put to it
 * (popups, card picks, battles, advances), and on its turn selects its ships and taps a highlighted
 * target (preferring planets and attacks), then ends the turn. The AI plays everyone else. Each tap
 * is a real touch at the element's centre; when the element is off screen or covered, that is
 * reported and the script clicks it through the page so the game goes on. A game that stops moving,
 * a page error or an engine error is reported too. Screenshots go to test-results/mobile-play/: the
 * first time each kind of decision comes up (`-<kind>`), each problem (`-issueN`) and the end
 * (`-over`); a game that gets stuck also saves its state (`-stuck.json`). Exits with 1 when anything was found. Uses the dev-only `?play=` link and
 * `window.__game` hook, so `--url` must be a dev server.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { type Page } from 'playwright';
import { chooseAction } from '../packages/ai/src';
import { scrapyard, type Action, type Cell, type GameState } from '../packages/engine/src';
import { PHONES, arg, devServer, finish, launchChrome, playUrl } from './mobile-common';

const GAMES: Record<string, { play: string; players: number; map?: string }> = {
  'basic-2p': { play: 'basic', players: 2 },
  'regolith-3p': { play: 'regolith', players: 3 },
  'regolith-4p': { play: 'regolith', players: 4, map: 'tesseract-hex' },
};

/**
 * Rounds after which a game counts as not finishing (each player's turn is one turn, so a round is `players`
 * turns). Regolith's 4p games on tesseract-hex end in 12 to 32 rounds with this script's human.
 */
const MAX_ROUNDS = 50;
/** Taps of the human's on one turn before it ends the turn regardless (random targets can wander). */
const TAPS_PER_TURN = 14;
const OUT = 'test-results/mobile-play';

/** What the page shows: the game's state in brief, and the next thing the human would tap (marked `data-play`). */
interface Look {
  phase: string;
  turn: number;
  /** The kind of decision the table waits on, `turn` for the turn's player acting, `over` at the end. */
  kind: string;
  /** Whether the human (player 0) is the one to act. */
  mine: boolean;
  /** A fingerprint of the state, to tell whether a tap did anything. */
  sig: string;
  target: null | { label: string; x: number; y: number; problem: string | null };
  winner: string | null;
  /** A `want` was given but nothing on screen matches it. */
  missed: boolean;
  /** The `want` is a ship that is already selected (a tap would deselect it). */
  already: boolean;
}

/** One tap of a planned action: a ship, highlighted space or planet by its place on the map, a scrapyard ship, or a button. */
type Want = { ship: Cell } | { space: Cell } | { planet: Cell } | { scrap: number } | { button: string };

/**
 * Picks the human's next tap: `want` when given and on the page (outside popups), otherwise a random one.
 * `tapsThisTurn` and `tried` (ships already selected this turn) steer the random taps towards ending the turn.
 */
function look(page: Page, tapsThisTurn: number, tried: string[], want: Want | null): Promise<Look> {
  return page.evaluate(
    ({ tapsThisTurn, tried, TAPS_PER_TURN, want }) => {
      type S = {
        phase: string;
        winner?: number;
        players: { name: string; ai: boolean }[];
        pending: { kind: string; player?: number; attacker?: { player: number }; defender?: { player: number } }[];
        turn: { player: number; number: number; actionsLeft: number; moved: Record<string, number> };
        dice: { id: string; loc: unknown; value: number }[];
        cubes?: unknown;
      };
      const q = (window as unknown as { __game: { state(): S } }).__game;
      const s = q.state();
      const head = s.pending[0];
      const actor = head?.player ?? s.turn.player;
      const kind = s.phase === 'over' ? 'over' : head ? head.kind : s.phase === 'setup' ? 'setup' : 'turn';
      const sig = JSON.stringify([s.phase, s.turn, s.pending, s.dice.map((d) => [d.loc, d.value])]);
      document.querySelectorAll('[data-play]').forEach((el) => el.removeAttribute('data-play'));

      const shown = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      };
      const all = (sel: string) => [...document.querySelectorAll(sel)].filter(shown).filter((el) => !(el as HTMLButtonElement).disabled);
      const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

      let el: Element | undefined;
      let missed = false;
      const box = document.querySelector('.overlay .modal, .overlay .combat-card');
      if (want && !box && s.phase !== 'over') {
        // Ships, spaces and planets carry their place on the map as data-r / data-c.
        const at = (sel: string, { r, c }: { r: number; c: number }) => all(`${sel}[data-r="${r}"][data-c="${c}"]`)[0];
        if ('ship' in want) el = at('.ship', want.ship);
        else if ('space' in want) el = at('.hl', want.space);
        else if ('planet' in want) el = at('.planet-hit', want.planet);
        else if ('scrap' in want) el = all('.turn-scrap .scrap-die')[want.scrap];
        else el = all('.turn-panel button').find((b) => b.textContent!.includes(want.button));
        missed = !el;
      }
      const already = !!want && 'ship' in want && !!el?.classList.contains('selected');
      if (el) {
        // planned
      } else if (s.phase === 'over') {
        el = undefined;
      } else if (box) {
        // A popup: a card or choice if it offers one, else its main button, else any button.
        const choices = all('.overlay .qcard, .overlay .clever-choice');
        const primary = all('.overlay .btn-primary');
        const keep = primary.find((b) => b.textContent!.includes('Keep fleet'));
        el = keep ?? (choices.length ? pick(choices) : (primary[0] ?? all('.overlay button')[0]));
      } else {
        const takeable = all('.market.picking .takeable, .sheet.open .market .takeable');
        const decision = all('.turn-panel .turn-actions .btn').filter(
          (b) => !b.closest('.ship-panel') && !/End turn|Undo/.test(b.textContent!),
        );
        const planets = all('.planet-hit.planet-conquer, .planet-hit.planet-start, .planet-hit.planet-infamy');
        const attacks = all('.ship.ship-attack, .ship.ship-target, .ship.ship-swap, .ship.ship-passenger');
        const cells = all('.hl');
        const scrap = all('.turn-scrap .scrap-die.clickable');
        const endTurn = all('.turn-panel .turn-actions .btn-primary').find((b) => b.textContent!.includes('End turn'));
        const actionPhase = s.phase === 'play' && !head && !s.players[s.turn.player].ai;
        if (takeable.length) el = pick(takeable);
        else if (planets.length) el = pick(planets);
        else if (attacks.length && Math.random() < 0.7) el = pick(attacks);
        else if (head && decision.length) el = pick(decision);
        else if (scrap.length && !document.querySelector('.scrap-die.selected')) el = pick(scrap);
        else if (cells.length && (!actionPhase || tapsThisTurn < TAPS_PER_TURN)) el = pick(cells);
        else if (attacks.length) el = pick(attacks);
        else if (actionPhase && s.turn.actionsLeft > 0 && tapsThisTurn < TAPS_PER_TURN) {
          const own = all('.ship.own').filter((x) => !x.classList.contains('selected'));
          const fresh = own.filter((x) => !tried.includes(x.getAttribute('aria-label')!));
          el = fresh[0] ?? endTurn;
        } else el = endTurn;
      }

      let target: Look['target'] = null;
      if (el) {
        el.setAttribute('data-play', '1');
        // A card to take may be below the fold of the sheet or column, which the player scrolls up to (seven
        // cards don't fit a phone's height); off to the side is still a problem (mobile-shots' rule).
        if (el.closest('.market')) {
          const b = el.getBoundingClientRect();
          if (b.top < 0 || b.bottom > innerHeight) el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        }
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const label =
          (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) ||
          el.className.toString().split(' ')[0];
        let problem: string | null = null;
        if (r.top < -1 || r.left < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1) problem = 'off screen';
        else {
          // On the map the tap must reach the ship, space or planet itself (a neighbouring die once took taps
          // meant for a planet); panels take them anywhere inside; a popup's own dice may overlap a little.
          const hit = document.elementFromPoint(x, y);
          const home = el.closest('.overlay .modal, .combat-card, .panel, .sheet') ?? el;
          // A ship covers its own space to attack from, and a tap on it attacks from there (the controller's rule).
          const ship = hit?.closest('.ship.selected');
          const same = (a: Element, b: Element) =>
            a.getAttribute('data-r') === b.getAttribute('data-r') && a.getAttribute('data-c') === b.getAttribute('data-c');
          const onShip = !!ship && el.classList.contains('hl') && same(ship, el);
          if (!onShip && (!hit || !home.contains(hit))) problem = `covered by .${(hit?.getAttribute('class') ?? '').split(' ').join('.')}`;
        }
        target = { label, x, y, problem };
      }
      return {
        phase: s.phase,
        turn: s.turn.number,
        kind,
        // A battle between others still waits for you when you could fire a missile into it.
        mine: box ? !!el : !s.players[actor].ai,
        sig,
        target,
        winner: s.phase === 'over' && s.winner !== undefined ? s.players[s.winner].name : null,
        missed,
        already,
      };
    },
    { tapsThisTurn, tried, TAPS_PER_TURN, want },
  );
}

/**
 * The taps that carry out `a` on the human's turn, or null for actions this script doesn't know how to tap (it
 * then taps at random).
 */
function tapsFor(s: GameState, a: Action): Want[] | null {
  const shipAt = (id: string): Want | null => {
    const loc = s.dice.find((d) => d.id === id)!.loc;
    return loc.zone === 'board' ? { ship: { r: loc.r, c: loc.c } } : null;
  };
  const steps = (...xs: (Want | null)[]) => (xs.every(Boolean) ? (xs as Want[]) : null);
  switch (a.type) {
    case 'move':
      return steps(shipAt(a.die), { space: a.to });
    case 'deploy':
      return steps({ scrap: scrapyard(s, s.turn.player).findIndex((d) => d.id === a.die) }, { space: a.to });
    case 'attack':
      return steps(shipAt(a.die), shipAt(a.target));
    case 'reconfigure':
      return steps(shipAt(a.die), { button: 'Reconfigure' });
    case 'conquer': {
      const p = s.board.planets[a.planet];
      return [{ planet: { r: p.r, c: p.c } }];
    }
    case 'research':
      return [{ button: 'Research' }];
    case 'endTurn':
      return [{ button: 'End turn' }];
  }
  return null;
}

async function playGame(page: Page, name: string, players: number): Promise<{ issues: string[]; summary: string }> {
  const issues: string[] = [];
  const shots = new Set<string>();
  const report = async (key: string, text: string) => {
    if (shots.has(`issue:${key}`)) return;
    shots.add(`issue:${key}`);
    issues.push(text);
    await page.screenshot({ path: `${OUT}/${name}-issue${issues.length}.png` });
  };
  page.on('pageerror', (e) => void report(`pageerror:${e.message}`, `page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()))
      void report(`console:${m.text().slice(0, 80)}`, `console: ${m.text().slice(0, 200)}`);
  });

  let lastSig = '';
  let still = 0;
  let turnKey = '';
  let tapsThisTurn = 0;
  let tried: string[] = [];
  /** The rest of the planned action's taps, and the position it was planned for. */
  let plan: Want[] = [];
  let plannedAt = '';
  const taps = new Map<string, number>();
  const tally = () => [...taps].map(([k, n]) => `${k} ${n}`).join(', ');
  const start = Date.now();
  for (;;) {
    const l = await look(page, tapsThisTurn, tried, plan[0] ?? null);
    // On the human's turn, the AI (level 1, fast) chooses the action and the script taps it out, so that the human
    // conquers, researches and takes cards like a player would. Unknown actions and missed taps fall back to random.
    if (l.mine && l.kind === 'turn' && !plan.length && plannedAt !== l.sig && !process.argv.includes('--random')) {
      plannedAt = l.sig;
      const state = await page.evaluate(() => window.__game.state());
      try {
        const a = chooseAction(state, { level: 1 });
        plan = (a && tapsFor(state, a)) ?? [];
      } catch (e) {
        writeFileSync(`${OUT}/${name}-ai-error.json`, JSON.stringify(state));
        await report(
          `ai:${String(e).slice(0, 60)}`,
          `AI error on the human's turn ${l.turn}: ${String((e as Error).message ?? e).slice(0, 200)}`,
        );
        plan = [];
      }
      if (plan.length) continue;
    }
    if (l.missed || (plan.length && l.kind !== 'turn')) plan = [];
    if (l.already) {
      plan.shift();
      continue;
    }
    if (l.phase === 'over') {
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/${name}-over.png` });
      const over = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('.overlay .modal button')];
        return btns.flatMap((b) => {
          const r = b.getBoundingClientRect();
          return r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.top < -1 ? [b.textContent!.trim()] : [];
        });
      });
      for (const b of over) await report(`over:${b}`, `game over: "${b}" off screen`);
      return {
        issues,
        summary: `${l.winner ?? '?'} won on turn ${l.turn}, ${Math.round((Date.now() - start) / 1000)} s; taps: ${tally()}`,
      };
    }
    if (l.turn > MAX_ROUNDS * players)
      return { issues: [...issues, `still going after ${MAX_ROUNDS} rounds`], summary: `stopped at turn ${l.turn}` };

    // A new turn of the human's: forget the ships tried.
    const key = `${l.turn}:${l.kind === 'turn'}`;
    if (key !== turnKey) {
      turnKey = key;
      tapsThisTurn = 0;
      tried = [];
    }
    if (l.sig === lastSig) still++;
    else {
      still = 0;
      lastSig = l.sig;
    }
    // AI turns move every second or so; a battle waits for OK, which the script taps.
    if (still > 60) {
      // The state, to replay with window.__game.load or the engine.
      writeFileSync(`${OUT}/${name}-stuck.json`, await page.evaluate(() => JSON.stringify(window.__game.state())));
      await report(
        `stuck:${l.kind}`,
        `stuck at "${l.kind}" on turn ${l.turn}${l.mine && l.target ? ` (tapping "${l.target.label}" does nothing)` : ''}`,
      );
      return { issues, summary: `stuck on turn ${l.turn}` };
    }

    if (!l.mine || !l.target) {
      await page.waitForTimeout(300);
      continue;
    }
    if (!shots.has(l.kind)) {
      shots.add(l.kind);
      await page.waitForTimeout(700); // let popups and the sheet finish arriving
      await page.screenshot({ path: `${OUT}/${name}-${l.kind}.png` });
      continue; // look again: things may have moved
    }
    const t = l.target;
    if (t.problem) {
      await report(`${l.kind}:${t.label}:${t.problem}`, `${l.kind} (turn ${l.turn}): "${t.label}" ${t.problem}`);
      await page.evaluate(() => (document.querySelector('[data-play]') as HTMLElement | null)?.click());
    } else await page.touchscreen.tap(t.x, t.y);
    if (plan.length && !l.missed) plan.shift();
    const what = l.kind !== 'turn' ? l.kind : /'s /.test(t.label) ? 'ship' : t.label === 'End turn' ? 'end turn' : t.label;
    taps.set(what, (taps.get(what) ?? 0) + 1);
    if (l.kind === 'turn') {
      tapsThisTurn++;
      if (/'s /.test(t.label)) tried.push(t.label);
    }
    // A tap that leaves the state as it was (selecting a ship) is fine; repeated ones are caught as stuck.
    await page.waitForTimeout(350);
  }
}

async function main() {
  const server = await devServer(5181);
  const { base } = server;
  const browser = await launchChrome();
  mkdirSync(OUT, { recursive: true });
  const devicesRun = Object.entries(PHONES).filter(([d]) => !arg('--device') || d === arg('--device'));
  const gamesRun = Object.entries(GAMES).filter(([g]) => !arg('--game') || g === arg('--game'));

  let problems = 0;
  try {
    const runs = devicesRun.flatMap(([device, options]) => gamesRun.map(([game, g]) => ({ device, options, game, g })));
    const lines = await Promise.all(
      runs.map(async ({ device, options, game, g }) => {
        const ctx = await browser.newContext({ ...options, reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        await page.goto(playUrl(base, { ...g, seed: Number(arg('--seed') ?? 1) }));
        await page.waitForSelector('.board');
        await page.waitForFunction(() => '__game' in window);
        const name = `${device}-${game}`;
        const { issues, summary } = await playGame(page, name, g.players);
        problems += issues.length;
        await ctx.close();
        return `${name.padEnd(32)} ${issues.length ? '✗' : '✓'} ${summary}${issues.length ? '\n    ' + issues.join('\n    ') : ''}`;
      }),
    );
    console.log(lines.join('\n'));
  } finally {
    await browser.close();
    await server.close();
  }
  finish(OUT, problems);
}

void main();
