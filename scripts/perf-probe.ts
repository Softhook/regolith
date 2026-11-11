/**
 * Times the paths that felt slow, in Chrome with its CPU slowed down (×4 by default, roughly a mid-range
 * phone such as the Moto G55), in a 4-player Regolith game, and fails on one that does nothing or goes over budget
 * (perf-common):
 *
 * - a card pop-up: the first one on a device with nothing kept and nothing warmed yet, the same again, a whole deck,
 *   and the deck again after a reload (art kept in IndexedDB);
 * - a tap on a mech and on the space it moves to, until the next frame is painted;
 * - the page doing nothing: main-thread time per second with nothing selected, with a mech selected, with Ice
 *   Tunnels on the map (looping animations that repaint show up here), and once the victory show has burnt out.
 *
 * It runs on a dev server, for the dev-only ?play= link, so React's development build is in these times.
 *
 *   npm run perf:probe                       # its own dev server
 *   npm run perf:probe -- --cpu 6            # slower still
 *   npm run perf:probe -- --headed           # in a window
 *   npm run perf:probe -- --url http://…/    # a running dev server
 */
import type { CDPSession, Page } from 'playwright';
import { devServer, launchChrome, playUrl } from './mobile-common';
import { DESKTOP, THROTTLE, budget, busy, problem, runProbe } from './perf-common';

/** How long a tap may take to show (the usual limit for a response that feels immediate). */
const TAP_MS = 100;
/** Main-thread time per second a page doing nothing may use. */
const IDLE_MS = 20;
const POPUP_MS = { cold: 1500, again: 300, deck: 4000, kept: 1000 };
/** When the victory show has burnt out: its 40 s of rockets (fireworks/show.ts), and the last to fade. */
const SHOW_MS = 50000;

async function timeCards(page: Page, cdp: CDPSession) {
  const open = async (what: string, selector: string, most: number) => {
    const t0 = Date.now();
    await page.locator(selector).first().click();
    await page.waitForSelector('.card-art');
    const n = await page.locator('.card-art').count();
    await page.waitForFunction(
      (n) => [...document.querySelectorAll<HTMLImageElement>('.card-art img')].filter((i) => i.complete && i.naturalWidth).length === n,
      n,
      { timeout: 120000 },
    );
    const ms = Date.now() - t0;
    console.log(`${what.padEnd(28)} ${ms} ms${n > 1 ? ` (${n} cards)` : ''}`);
    budget(what, ms, most);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.card-art', { state: 'detached', timeout: 5000 });
    return n;
  };
  await open('card pop-up, cold', '.market-skill .market-card', POPUP_MS.cold);
  await open('card pop-up, again', '.market-skill .market-card', POPUP_MS.again);
  if ((await open('deck pop-up', '.market-skill .deck', POPUP_MS.deck)) < 2) problem('the deck pop-up showed one card');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.reload();
  await page.waitForSelector('.market-card');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await open('deck pop-up after a reload', '.market-skill .deck', POPUP_MS.kept);
}

/** Taps each of the human's mechs and then the first space it may move to, timing each tap to the next painted frame. */
async function timeTaps(page: Page) {
  const { times, moves } = await page.evaluate(async () => {
    const q = window.__game;
    const times: number[] = [];
    let moves = 0;
    const painted = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const tap = async (el: HTMLElement) => {
      const t = performance.now();
      el.click();
      await painted();
      times.push(performance.now() - t);
    };
    for (let i = 0; i < 6; i++) {
      const s = q.state();
      const die = s.dice.find((d) => d.owner === s.turn.player && d.loc.zone === 'board' && !(s.turn.moved[d.id] > 0));
      const mech = die && document.querySelector<HTMLElement>(`.mech[data-glide="${die.id}"]`);
      if (!mech) break;
      await tap(mech);
      const space = document.querySelector<HTMLElement>('.hl');
      if (!space) break;
      await tap(space);
      if (q.state().turn.moved[die.id] > 0) moves++;
      await new Promise((r) => setTimeout(r, 200));
    }
    return { times, moves };
  });
  console.log(`${'taps to painted frame'.padEnd(28)} ${times.map((t) => t.toFixed(0)).join(' ')} ms (${moves} moves)`);
  if (moves < 2) problem(`taps moved ${moves} mechs, not 2 or more`);
  budget('slowest tap', Math.max(0, ...times), TAP_MS);
}

async function idleCost(page: Page, cdp: CDPSession, over: string) {
  const measure = async (what: string) => {
    await page.waitForTimeout(1000);
    const a = await busy(cdp);
    await page.waitForTimeout(4000);
    const ms = ((await busy(cdp)) - a) / 4;
    console.log(`${`idle, ${what}`.padEnd(28)} ${ms.toFixed(0)} ms of main thread per s`);
    budget(`idle, ${what}`, ms, IDLE_MS);
  };
  await cdp.send('Performance.enable');
  await page.goto(page.url());
  await page.waitForSelector('.mech');
  await page.waitForTimeout(2000);
  await measure('nothing selected');
  await page.evaluate(() => {
    const s = window.__game.state();
    const d = s.dice.find((d) => d.owner === s.turn.player && d.loc.zone === 'board');
    if (d?.loc.zone !== 'board') throw new Error('no mech of the player to move on the board');
    document.querySelector<HTMLElement>(`.mech[data-glide="${d.id}"]`)!.click();
  });
  if (!(await page.locator('.hl').count())) problem('a selected mech lit up no space');
  await measure('a mech selected');
  await page.evaluate(() => {
    const q = window.__game;
    const s = q.state();
    const spaces = s.board.cells.flatMap((row: { kind: string }[], r: number) =>
      row.flatMap((x, c) => (x.kind === 'space' ? [{ r, c }] : [])),
    );
    q.load({ ...s, tunnels: [spaces[0], spaces.at(-1)!] });
  });
  if (!(await page.locator('.tunnel-spin').count())) problem('no Ice Tunnels on the map');
  await measure('with Ice Tunnels');
  await page.goto(over);
  await page.waitForSelector('.overlay.celebrate');
  await page.waitForTimeout(SHOW_MS);
  await measure('victory show over');
}

async function main() {
  const server = await devServer(5191);
  const browser = await launchChrome();
  const page = await browser.newPage(DESKTOP);
  const cdp = await page.context().newCDPSession(page);
  page.on('pageerror', (e) => problem(`page error: ${e.message}`));
  const game = { play: 'regolith', players: 4, map: 'tesseract-hex' };
  // Slowed from the start, and with the first pop-up as soon as the market shows: nothing kept, nothing warmed.
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  console.log(`CPU ×${THROTTLE}`);
  await page.goto(playUrl(server.base, { ...game, scene: 'turn' }));
  await page.waitForSelector('.market-card');
  await timeCards(page, cdp);
  await timeTaps(page);
  await idleCost(page, cdp, playUrl(server.base, { ...game, scene: 'over' }));
  await browser.close();
  await server.close();
}

runProbe(main);
