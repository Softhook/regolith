/**
 * Times the paths that felt slow, in Chrome with its CPU slowed down (×4 by default, roughly a mid-range
 * phone such as the Moto G55), in a 4-player Regolith game:
 *
 * - a card pop-up: the first one, the same again, a whole deck, and the deck again after a reload (art
 *   kept in IndexedDB);
 * - a tap on a ship and on the space it moves to, until the next frame is painted;
 * - the page doing nothing: main-thread time per second with nothing selected, with a ship selected and
 *   with warp gates on the map (looping animations that repaint show up here).
 *
 *   npm run perf:probe                       # its own dev server
 *   npm run perf:probe -- --cpu 6            # slower still
 *   npm run perf:probe -- --url http://…/    # a running dev server (uses the dev-only ?play= link)
 */
import type { CDPSession, Page } from 'playwright';
import { arg, devServer, launchChrome, playUrl } from './mobile-common';

const THROTTLE = Number(arg('--cpu') ?? 4);

async function timeCards(page: Page, cdp: CDPSession) {
  const open = async (what: string, selector: string) => {
    const t0 = Date.now();
    await page.locator(selector).first().click();
    await page.waitForSelector('.card-art');
    const n = await page.locator('.card-art').count();
    await page.waitForFunction(
      (n) => [...document.querySelectorAll<HTMLImageElement>('.card-art img')].filter((i) => i.complete).length === n,
      n,
      { timeout: 120000 },
    );
    console.log(`${what.padEnd(28)} ${Date.now() - t0} ms${n > 1 ? ` (${n} cards)` : ''}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  };
  await open('card pop-up, first', '.market-skill .market-card');
  await open('card pop-up, again', '.market-skill .market-card');
  await open('deck pop-up', '.market-skill .deck');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.reload();
  await page.waitForSelector('.market-card');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await open('deck pop-up after a reload', '.market-skill .deck');
}

/** Taps each of the human's ships and then the first space it may move to, timing each tap to the next painted frame. */
async function timeTaps(page: Page) {
  const times: number[] = await page.evaluate(async () => {
    const q = window.__game;
    const out: number[] = [];
    const painted = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const tap = async (el: HTMLElement) => {
      const t = performance.now();
      el.click();
      await painted();
      out.push(performance.now() - t);
    };
    for (let i = 0; i < 6; i++) {
      const s = q.state();
      const die = s.dice.find((d) => d.owner === s.turn.player && d.loc.zone === 'board' && !(s.turn.moved[d.id] > 0));
      const ship = die?.loc.zone === 'board' && document.querySelector<HTMLElement>(`.ship[data-r="${die.loc.r}"][data-c="${die.loc.c}"]`);
      if (!ship) break;
      await tap(ship);
      const space = document.querySelector<HTMLElement>('.hl');
      if (!space) break;
      await tap(space);
      await new Promise((r) => setTimeout(r, 200));
    }
    return out;
  });
  console.log(`${'taps to painted frame'.padEnd(28)} ${times.map((t) => t.toFixed(0)).join(' ')} ms`);
}

async function idleCost(page: Page, cdp: CDPSession) {
  const busy = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')!.value;
  const measure = async (what: string) => {
    await page.waitForTimeout(1000);
    const a = await busy();
    await page.waitForTimeout(4000);
    console.log(`${`idle, ${what}`.padEnd(28)} ${((((await busy()) - a) * 1000) / 4).toFixed(0)} ms of main thread per s`);
  };
  await cdp.send('Performance.enable');
  await page.goto(page.url());
  await page.waitForSelector('.ship');
  await page.waitForTimeout(2000);
  await measure('nothing selected');
  await page.evaluate(() => {
    const s = window.__game.state();
    const d = s.dice.find((d) => d.owner === s.turn.player && d.loc.zone === 'board');
    if (d?.loc.zone !== 'board') throw new Error('no ship of the player to move on the board');
    document.querySelector<HTMLElement>(`.ship[data-r="${d.loc.r}"][data-c="${d.loc.c}"]`)!.click();
  });
  await measure('a ship selected');
  await page.evaluate(() => {
    const q = window.__game;
    const s = q.state();
    const spaces = s.board.cells.flatMap((row: { kind: string }[], r: number) =>
      row.flatMap((x, c) => (x.kind === 'space' ? [{ r, c }] : [])),
    );
    q.load({ ...s, gates: [spaces[0], spaces.at(-1)!] });
  });
  await measure('with warp gates');
}

async function main() {
  const server = await devServer(5191);
  const browser = await launchChrome();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const cdp = await page.context().newCDPSession(page);
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(playUrl(server.base, { play: 'regolith', players: 4, map: 'tesseract-hex', scene: 'turn' }));
  await page.waitForSelector('.market-card');
  await page.waitForTimeout(3000); // the tiles drawn, the dev server's modules loaded
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  console.log(`CPU ×${THROTTLE}`);
  await timeCards(page, cdp);
  await timeTaps(page);
  await idleCost(page, cdp);
  await browser.close();
  await server.close();
}

void main();
