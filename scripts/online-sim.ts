/**
 * Plays a 5-player online game in Chrome between five browsers, each its own identity, over the
 * real public relays, and checks that every screen keeps up and they all agree. Exits with 1 when
 * something fails.
 *
 *   npm run online:sim                            # starts its own dev server, plays for 5 minutes
 *   npm run online:sim -- --url http://…/         # or a running dev server
 *   npm run online:sim -- --play 60               # seconds of random play after everyone has joined
 *
 * The host creates the game and moves; friends then join at different moments: one after the host
 * has moved (a claim replays the game from scratch: the screen must still come back to the present),
 * one late, and two racing for the same seat (the loser is offered the join dialog again). Then
 * every browser plays random legal moves for its seats, answers its battles and dismisses them.
 *
 * Run it by hand, not before every deploy: each run posts a few hundred events to the relays.
 * Moves go through the dev-only `window.__gameOnline` hook, so the app must be a dev server.
 * Screenshots go to test-results/online-sim/.
 */
import { mkdirSync } from 'node:fs';
import type { Page } from 'playwright';
import type { Action, GameState } from '../packages/engine/src';
import type { GameView } from '../apps/web/src/game/view';
import { arg, devServer, finish, launchChrome } from './mobile-common';

const OUT = 'test-results/online-sim';
mkdirSync(OUT, { recursive: true });
const PLAY_MS = Number(arg('--play') ?? 300) * 1000;
const NAMES = ['Host', 'Ann', 'Ben', 'Cat', 'Dan'];

/** useOnlineGame's dev-only hook. */
interface OnlineHook {
  state(): GameState | null;
  view(): GameView | null;
  legal(): Action[];
  mySeats(): number[];
}
declare global {
  interface Window {
    __gameOnline?: OnlineHook;
  }
}

const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s`, ...a);
let problems = 0;
const check = (ok: boolean, what: string, otherwise = what) => {
  if (ok) log(`✓ ${what}`);
  else {
    problems++;
    log(`✗ ${otherwise}`);
  }
  return ok;
};
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

const { base, close } = await devServer(5199);
const browser = await launchChrome();
const errors: string[] = [];
const pages: Page[] = [];
for (const name of NAMES) {
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    // Relays coming and going are expected.
    if (m.type() === 'error' && !/WebSocket|wss:|net::/.test(m.text())) errors.push(`${name}: ${m.text().slice(0, 200)}`);
  });
  pages.push(page);
}
const [host, ann, ben, cat, dan] = pages;
const nameOf = (p: Page) => NAMES[pages.indexOf(p)];

/** What a browser shows: whether it has caught up (its seats are its to play), its seats, and the game. */
const info = (p: Page) =>
  p
    .evaluate(() => {
      const q = window.__gameOnline;
      const s = q?.state();
      const v = q?.view();
      if (!q || !s || !v) return null;
      const seats = q.mySeats();
      return {
        live: seats.length > 0 && v.mine(seats[0]),
        seats,
        game: JSON.stringify(s),
        turn: s.turn.number,
        at: `${s.phase}/${s.pending[0]?.kind ?? 'turn'}`,
        names: s.players.map((x) => x.name),
      };
    })
    .catch(() => null);

/** One move, battle answer or dismissal for this browser's seats; what it did, or 'idle'. */
const step = (p: Page) =>
  p.evaluate(() => {
    const q = window.__gameOnline;
    const v = q?.view();
    const s = q?.state();
    if (!q || !v || !s) return 'idle';
    const head = s.pending[0];
    const actor = !head ? s.turn.player : head.kind === 'combat' ? head.attacker.player : head.player;
    const mine = q.mySeats();
    const ok = q.legal().filter((a) => mine.includes(a.type === 'missile' ? a.by : actor));
    const pick = (as: Action[]) => as[Math.floor(Math.random() * as.length)];
    const responds = (a: Action) => a.type === 'missile';
    const responses = ok.filter(responds);
    if (v.combat?.mustAnswer) {
      if (responses.length && Math.random() < 0.3) {
        const a = pick(responses);
        return v.dispatch(a) ? a.type : 'refused';
      }
      v.combat.pass();
      return 'pass';
    }
    if (v.combat?.dismiss && !v.combat.waitingOn.length) {
      v.combat.dismiss();
      return 'dismiss';
    }
    if (v.combat) return 'idle';
    const moves = ok.filter((a) => !responds(a));
    if (!moves.length) return 'idle';
    const a = pick(moves);
    // Refused while the screen is still showing someone else's move.
    return v.dispatch(a) ? a.type : 'refused';
  });

/** Plays until no browser has had anything to do for 8 s, or for `ms` regardless. */
async function play(ps: Page[], ms: number, untilIdle = true) {
  const end = Date.now() + ms;
  let busy = Date.now();
  const done: Record<string, number> = {};
  while (Date.now() < end && !(untilIdle && Date.now() - busy > 8000)) {
    for (const p of ps) {
      const r = await step(p);
      if (r === 'idle') continue;
      done[r] = (done[r] ?? 0) + 1;
      if (r !== 'refused') busy = Date.now();
    }
    await sleep(400);
  }
  log('played', JSON.stringify(done));
}

/** Waits until every browser holds a seat, has caught up, and they all show the same game. */
async function settle(ps: Page[], what: string, ms = 45000) {
  const end = Date.now() + ms;
  let all: Awaited<ReturnType<typeof info>>[] = [];
  while (Date.now() < end) {
    all = await Promise.all(ps.map(info));
    const [first] = all;
    if (all.every((x) => x?.live && x.game === first?.game)) {
      return check(true, `${what}: ${ps.length} live and identical · turn ${first!.turn} ${first!.at} · ${first!.names.join(', ')}`);
    }
    await sleep(1000);
  }
  ps.forEach((p, i) =>
    log(`   ${nameOf(p)}: live ${all[i]?.live} · seats ${JSON.stringify(all[i]?.seats)} · same game ${all[i]?.game === all[0]?.game}`),
  );
  await Promise.all(ps.map((p) => p.screenshot({ path: `${OUT}/${what.replace(/\W+/g, '-')}-${nameOf(p)}.png` })));
  return check(false, what, `${what}: browsers didn't all catch up and agree`);
}

const joinButton = (p: Page) => p.getByRole('button', { name: 'Join', exact: true });
async function join(p: Page, seat?: string) {
  await joinButton(p).waitFor({ timeout: 30000 });
  await p.getByPlaceholder('Commander').fill(nameOf(p));
  if (seat) await p.locator('.segmented button', { hasText: seat }).click();
}

try {
  // The host creates a 5-player game and moves first.
  await host.goto(base);
  await host.getByText('Online with friends').click();
  await host.locator('.field', { hasText: 'Players' }).getByRole('button', { name: '5', exact: true }).click();
  await host.getByRole('button', { name: 'Create online game' }).click();
  await host.waitForFunction(() => !!window.__gameOnline?.state(), null, { timeout: 30000 });
  const link = host.url();
  log('created', link);
  await play([host], 30000);
  await settle([host], 'host alone');

  // Ann joins after the host has moved: her claim replays the game from scratch.
  await ann.goto(link);
  await join(ann);
  await joinButton(ann).click();
  await settle([host, ann], 'Ann joined after the host moved');
  await play([host, ann], 30000);
  await settle([host, ann], 'Ann moved');

  // Ben joins late.
  await ben.goto(link);
  await join(ben);
  await joinButton(ben).click();
  await settle([host, ann, ben], 'Ben joined late');
  await play([host, ann, ben], 30000);

  // Cat and Dan race for Player 4: one gets it, the other is offered the join dialog again.
  await Promise.all([cat.goto(link), dan.goto(link)]);
  await Promise.all([join(cat, 'Player 4'), join(dan, 'Player 4')]);
  await Promise.all([joinButton(cat).click(), joinButton(dan).click()]);
  await sleep(8000);
  const loser = (await info(cat))?.seats.length ? dan : cat;
  if (check(await joinButton(loser).isVisible(), `${nameOf(loser)} lost the race for Player 4 and is offered the join dialog again`)) {
    await join(loser);
    await joinButton(loser).click();
  }
  await settle(pages, 'all five seated');
  const seats = (await Promise.all(pages.map(info))).flatMap((x) => x?.seats ?? []).sort();
  check(JSON.stringify(seats) === '[0,1,2,3,4]', 'one seat each', `seats held: ${JSON.stringify(seats)}`);

  // Everyone plays.
  log(`playing for ${PLAY_MS / 1000} s`);
  await play(pages, PLAY_MS, false);
  await settle(pages, 'after play', 60000);
  const banners = await Promise.all(pages.map((p) => p.locator('body').innerText()));
  const stuck = banners.flatMap((t, i) => (/Out of sync|Stopped|Engine error/.test(t) ? [NAMES[i]] : []));
  check(!stuck.length, 'no Out of sync or error banners', `banners on: ${stuck.join(', ')}`);
  check(!errors.length, 'no page errors', `page errors:\n  ${errors.slice(0, 10).join('\n  ')}`);
  await host.screenshot({ path: `${OUT}/final.png` });
} catch (e) {
  check(false, '', `run stopped: ${(e as Error).message.split('\n')[0]}`);
  await Promise.all(pages.map((p) => p.screenshot({ path: `${OUT}/stopped-${nameOf(p)}.png` }).catch(() => {})));
} finally {
  await browser.close();
  await close();
}
finish(OUT, problems);
