/**
 * Checks, in Chrome, looking back at a game from its log (GameScreen's review), which unit tests can't
 * render: the map and log following the review, the way back to the game, the log following play
 * again, a reload keeping the game's past, and the layout on a phone. Exits with 1 when something fails.
 *
 *   npm run replay:check                         # starts its own dev server
 *   npm run replay:check -- --url http://…/      # or checks a running dev server
 *
 * The games play themselves (every seat an AI, through the dev-only `window.__game.load`), so the app
 * must be a dev server. Screenshots go to test-results/replay/.
 */
import { mkdirSync } from 'node:fs';
import type { Page } from 'playwright';
import { appKey } from '../apps/web/src/appId';
import type { GameState } from '../packages/engine/src';
import { devServer, finish, launchChrome, MOTO_G55, playUrl, succeeds } from './mobile-common';

const OUT = 'test-results/replay';
mkdirSync(OUT, { recursive: true });

let problems = 0;
const fail = (what: string) => {
  problems++;
  console.log(`✗ ${what}`);
};
const check = (ok: boolean, what: string, otherwise: string) => (ok ? console.log(`✓ ${what}`) : fail(otherwise));

/** A dev game with every seat an AI, played until its log has `entries` entries. */
async function aiGame(page: Page, entries: number) {
  await page.goto(playUrl(base, { play: 'regolith', players: 2, seed: 5 }));
  await page.waitForFunction(() => '__game' in window);
  await page.evaluate(() => {
    const s = structuredClone(window.__game.state()) as GameState;
    s.players.forEach((p) => (p.ai = true));
    window.__game.load(s);
  });
  await page.waitForFunction((n) => window.__game.state().log.length >= n, entries, { timeout: 120000 });
}

/** How far the log list is from its newest entry, in pixels. */
/** Whether the log gets to its newest entry within 3 s: with entries coming fast, it may be part-way through a scroll to the last. */
const reachesNewest = (page: Page) =>
  succeeds(
    page.waitForFunction(
      () => {
        const l = document.querySelector('.log ol')!;
        return l.scrollHeight - l.scrollTop - l.clientHeight <= 12;
      },
      null,
      { timeout: 3000 },
    ),
  );

/** Whether the log shows the start of the move being looked back at. */
const moveInView = (page: Page) =>
  page.evaluate(() => {
    const list = document.querySelector('.log ol')!.getBoundingClientRect();
    const li = document.querySelector('.log li.picked')?.getBoundingClientRect();
    return !!li && li.top >= list.top - 1 && li.bottom <= list.bottom + 1;
  });

/** The map's size on screen (it refits when the space around it changes). */
const mapSize = (page: Page) =>
  page.evaluate(() => {
    const b = document.querySelector('.board')!.getBoundingClientRect();
    return `${Math.round(b.width)}×${Math.round(b.height)}`;
  });

/** Dice tumbling on the map now (Die3D's hop). */
const diceRolling = (page: Page) =>
  page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((a) => ((a.effect as KeyframeEffect | null)?.target as Element | null)?.classList.contains('die3d-hop')).length,
  );

const { base, close } = await devServer(5198);
const browser = await launchChrome();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  const bar = page.locator('.review-bar');
  const entries = page.locator('.log li button');

  // A new game from the lobby: what its creation logged can be looked back at.
  await page.goto(base);
  await page.evaluate((logOpen) => {
    localStorage.clear();
    localStorage.setItem(logOpen, '1');
  }, appKey('logOpen'));
  await page.reload();
  await page.getByRole('button', { name: 'Deploy your mechs' }).click();
  await page.waitForFunction(() => '__game' in window);
  check(
    (await page.locator('.log li').first().locator('button').count()) === 1,
    'a new game’s first log entry can be looked back at',
    'a new game’s first log entry can’t be looked back at',
  );

  // Looking back: the bar, the map above it, the log on the move; nothing rolls meanwhile.
  await aiGame(page, 40);
  await entries.nth(3).click();
  await bar.waitFor({ timeout: 3000 }).catch(() => fail('a log entry opens no review bar'));
  const [barBox, boardBox] = [await bar.boundingBox(), await page.locator('.board-wrap').boundingBox()];
  check(
    !!barBox && !!boardBox && barBox.y + barBox.height <= boardBox.y,
    'the review bar is above the map',
    'the review bar covers the map',
  );
  await page.screenshot({ path: `${OUT}/review.png` });
  const sizes = new Set([await mapSize(page)]);
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    sizes.add(await mapSize(page));
  }
  check(sizes.size === 1, 'the map keeps its size from step to step', `the map changes size as → steps on: ${[...sizes].join(', ')}`);
  await page.waitForTimeout(400);
  check(await moveInView(page), '→ steps through the game, and the log keeps the move in view', 'the log loses the move as → steps on');
  const rolls = await page.evaluate(() =>
    window.__game
      .state()
      .dice.map((d) => d.rolls)
      .join(),
  );
  if (
    await succeeds(
      page.waitForFunction(
        (r) =>
          window.__game
            .state()
            .dice.map((d) => d.rolls)
            .join() !== r,
        rolls,
        { timeout: 60000 },
      ),
    )
  ) {
    await page.waitForTimeout(300);
    check(
      (await diceRolling(page)) === 0,
      'dice rolled in the game meanwhile don’t roll on the map looked at',
      'dice roll on the map looked at',
    );
  } else fail('no dice rolled in the game within a minute');

  // Back: what happened meanwhile rolls, and the log is on the newest entry and follows play again.
  await page.keyboard.press('Escape');
  // Only a die still on the map can roll there: one that rolled meanwhile may have been destroyed since.
  const onMap = await page.evaluate((r) => {
    const before = r.split(',');
    return window.__game.state().dice.some((d, i) => d.loc.zone === 'board' && String(d.rolls) !== before[i]);
  }, rolls);
  // Up to 3 s, as a loaded machine (CI) may take a while to get back.
  let rolling = 0;
  for (let i = 0; i < 40 && onMap && !rolling; i++) {
    rolling = await diceRolling(page);
    await page.waitForTimeout(80);
  }
  check((await bar.count()) === 0, 'Esc goes back to the game', 'Esc leaves the review bar up');
  check(!onMap || rolling > 0, 'back in the game, the dice rolled meanwhile roll', 'back in the game, nothing that rolled meanwhile rolls');
  const counter = await page.evaluate(() => window.__game.state().logCounter);
  await page.waitForFunction((n) => window.__game.state().logCounter > n + 1, counter, { timeout: 30000 });
  await page.waitForTimeout(900);
  check(await reachesNewest(page), 'back in the game, the log follows play', 'back in the game, the log doesn’t follow play');

  // Scrolled up by hand, the log stays; scrolled back down, it follows again.
  await page.evaluate(() => {
    const l = document.querySelector('.log ol')!;
    l.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -400 }));
    l.scrollTop = 0;
  });
  const up = await page.evaluate(() => window.__game.state().logCounter);
  await page.waitForFunction((n) => window.__game.state().logCounter > n, up, { timeout: 30000 });
  await page.waitForTimeout(900);
  check(
    // Near the top: entries coming and going above can shift it a few pixels.
    (await page.evaluate(() => document.querySelector('.log ol')!.scrollTop)) <= 20,
    'scrolled up, the log stays',
    'scrolled up, the log jumps back to the newest',
  );
  await page.evaluate(() => {
    const l = document.querySelector('.log ol')!;
    l.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 5000 }));
    l.scrollTop = l.scrollHeight;
  });
  const down = await page.evaluate(() => window.__game.state().logCounter);
  await page.waitForFunction((n) => window.__game.state().logCounter > n, down, { timeout: 30000 });
  await page.waitForTimeout(900);
  check(await reachesNewest(page), 'scrolled back down, the log follows again', 'scrolled back down, the log doesn’t follow');

  // → after the last move goes back to the game.
  await entries.last().click();
  for (let i = 0; i < 5 && (await bar.count()); i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  check((await bar.count()) === 0, '→ after the last move goes back to the game', '→ after the last move stays in the review');

  // A reload brings the game back with its past.
  const before = await page.evaluate(() => window.__game.state().log.length);
  await page.goto(base);
  await page.waitForFunction(() => '__game' in window, null, { timeout: 20000 });
  const reviewable = await entries.count();
  // The dev loader starts the past after what was logged before it: one entry.
  check(
    reviewable >= before - 1,
    `after a reload, ${reviewable} entries can be looked back at`,
    `after a reload, only ${reviewable} of ${before} entries can be looked back at`,
  );
  await entries.nth(5).click();
  check(
    await succeeds(bar.waitFor({ timeout: 3000 })),
    'after a reload, looking back works',
    'after a reload, a log entry opens no review',
  );
  await page.close();

  // On a phone: picking an entry closes the sheet; the bar is above the map.
  const phone = await browser.newContext(MOTO_G55);
  const p = await phone.newPage();
  p.on('pageerror', (e) => fail(`page error (phone): ${e.message}`));
  await aiGame(p, 30);
  await p.tap('.sheet-handle');
  await p.waitForTimeout(500);
  // A new browser: the log starts collapsed.
  if (await p.locator('.log-toggle[aria-expanded="false"]').count()) await p.tap('.log-toggle');
  const entry = p.locator('.log li button').nth(10);
  await entry.scrollIntoViewIfNeeded();
  await entry.tap();
  await p.waitForTimeout(700);
  check(
    (await p.locator('.sheet.open').count()) === 0,
    'on a phone, picking an entry closes the sheet',
    'on a phone, the sheet stays open over the map',
  );
  const [pBar, pBoard] = [await p.locator('.review-bar').boundingBox(), await p.locator('.board-wrap').boundingBox()];
  check(
    !!pBar && !!pBoard && pBar.y + pBar.height <= pBoard.y,
    'on a phone, the review bar is above the map',
    'on a phone, the review bar covers the map',
  );
  await p.screenshot({ path: `${OUT}/phone.png` });
  const phoneSizes = new Set([await mapSize(p)]);
  for (let i = 0; i < 12; i++) {
    await p.locator('.review-step').nth(1).tap();
    await p.waitForTimeout(250);
    phoneSizes.add(await mapSize(p));
  }
  check(
    phoneSizes.size === 1,
    'on a phone, the map keeps its size from step to step',
    `on a phone, the map changes size as it steps on: ${[...phoneSizes].join(', ')}`,
  );
  await phone.close();
} finally {
  await browser.close();
  await close();
}
finish(OUT, problems);
