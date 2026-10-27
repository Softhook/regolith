/**
 * Checks full screen (apps/web/src/fullscreen.ts) in Chrome: the app installed on a computer, a computer's
 * browser tab, and a phone. Exits with 1 when something doesn't behave.
 *
 *   npm run fullscreen:check                         # starts its own dev server
 *   npm run fullscreen:check -- --url http://…/      # or checks a running dev server
 *
 * The installed app is played by answering `(display-mode: standalone)`. Headless Chrome doesn't resize the
 * window for full screen, so the title's re-centring is checked with a resize of its own; what it can't check
 * is the real window going full screen, nor Esc kept by Keyboard Lock.
 */
import type { BrowserContextOptions, Page } from 'playwright';
import { MOTO_G55, devServer, launchChrome } from './mobile-common';

const { base, close } = await devServer(5198);
const browser = await launchChrome();
let problems = 0;

function check(what: string, ok: boolean, seen?: unknown) {
  console.log(`${ok ? '✓' : '✗'} ${what}${ok || seen === undefined ? '' : ` (saw ${JSON.stringify(seen)})`}`);
  if (!ok) problems++;
}

const installed = () => {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (q: string) =>
    q.includes('display-mode: standalone') ? ({ ...real(q), matches: true, media: q } as MediaQueryList) : real(q);
};
const fullscreen = (page: Page) => page.evaluate(() => !!document.fullscreenElement);
const phase = (page: Page) => page.evaluate(() => document.querySelector('.lobby')!.className.replace('lobby', '').trim());
/** How far the title's centre is from the middle of the screen, in pixels. */
const offCentre = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector('.lobby-hero h1')!.getBoundingClientRect();
    return Math.round(r.top + r.height / 2 - innerHeight / 2);
  });
const leave = async (page: Page) => {
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForTimeout(200);
};

async function open(name: string, options: BrowserContextOptions, asInstalled: boolean) {
  console.log(`\n${name}`);
  const context = await browser.newContext(options);
  const page = await context.newPage();
  // The browser's own dialogs leave full screen: the app asks with its own.
  page.on('dialog', (d) => {
    check(`no browser dialog (${d.message()})`, false);
    void d.dismiss();
  });
  if (asInstalled) await page.addInitScript(installed);
  await page.goto(base);
  await page.waitForSelector('.lobby');
  return { page, done: () => context.close() };
}

const computer: BrowserContextOptions = { viewport: { width: 1200, height: 700 } };

try {
  {
    const { page, done } = await open('Installed on a computer: the opening', computer, true);
    await page.waitForTimeout(4500);
    check('not full screen before a click', !(await fullscreen(page)));
    check('the title waits for a click', (await phase(page)) === 'intro-title', await phase(page));
    check('asking for one', await page.isVisible('.intro-prompt:text("Click to start")'));
    await page.mouse.click(600, 350);
    // The window growing as it goes full screen, which headless Chrome doesn't do.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(40);
    check('a click goes full screen', await fullscreen(page));
    check('the title holds while the window grows', (await phase(page)) === 'intro-title', await phase(page));
    check('and stays centred in it', Math.abs(await offCentre(page)) <= 1, await offCentre(page));
    await page.waitForTimeout(600);
    check('then it rises', (await phase(page)) === 'intro-rise', await phase(page));
    await done();
  }
  {
    const { page, done } = await open('Installed on a computer: keys, leaving, the button', computer, true);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Meta+KeyA');
    await page.keyboard.press('F11');
    await page.mouse.click(600, 350, { button: 'right' });
    await page.waitForTimeout(200);
    check('Esc, shortcuts, F11 and a right click don’t go full screen', !(await fullscreen(page)));
    await page.keyboard.press('KeyA');
    await page.waitForTimeout(200);
    check('a key does', await fullscreen(page));
    await page.waitForSelector('.lobby:not([class*=intro])');
    await leave(page);
    await page.mouse.click(5, 690);
    await page.waitForTimeout(200);
    check('left on purpose, it stays left', !(await fullscreen(page)));
    await page.click('.lobby-corner [data-fullscreen-toggle]');
    await page.waitForTimeout(200);
    check('the lobby’s button goes back', await fullscreen(page));
    await leave(page);
    await page.reload();
    await page.waitForSelector('.lobby');
    await page.mouse.click(600, 350);
    await page.waitForTimeout(200);
    check('the next launch goes full screen again', await fullscreen(page));
    await done();
  }
  {
    const { page, done } = await open('A computer’s browser tab', computer, false);
    check('the opening doesn’t wait for a click', await page.isHidden('.intro-prompt'));
    await page.mouse.click(600, 350);
    await page.waitForTimeout(200);
    check('a click doesn’t go full screen', !(await fullscreen(page)));
    await page.waitForSelector('.lobby:not([class*=intro])');
    await page.click('.lobby-corner [data-fullscreen-toggle]');
    await page.waitForTimeout(200);
    check('the button does', await fullscreen(page));
    await done();
  }
  {
    const { page, done } = await open('A phone', MOTO_G55, false);
    await page.waitForTimeout(400);
    await page.touchscreen.tap(206, 400);
    await page.waitForTimeout(30);
    check('a tap in the opening goes full screen', await fullscreen(page));
    check('the title holds while the screen settles', (await phase(page)) === 'intro-title', await phase(page));
    await page.waitForSelector('.lobby:not([class*=intro])', { timeout: 6000 });
    await leave(page);
    await page.tap('.lobby-card h2');
    await page.waitForTimeout(200);
    check('dropped by the phone, the next tap brings it back', await fullscreen(page));
    await page.tap('.lobby-corner [data-fullscreen-toggle]');
    await page.waitForTimeout(200);
    await page.tap('.lobby-card h2');
    await page.waitForTimeout(200);
    check('left with the button, it stays left', !(await fullscreen(page)));
    await page.tap('text=Deploy your mechs');
    await page.waitForSelector('.topbar-actions');
    await page.waitForTimeout(200);
    check('… into a game too', !(await fullscreen(page)));
    await done();
  }
  {
    const { page: first, done } = await open('The lobby asks in its own dialogs', computer, false);
    await first.waitForSelector('.lobby:not([class*=intro])', { timeout: 6000 });
    await first.click('text=Deploy your mechs');
    await first.waitForSelector('.topbar-actions');
    // Another tab opens the lobby, with that game saved.
    const page = await first.context().newPage();
    page.on('dialog', (d) => {
      check(`no browser dialog (${d.message()})`, false);
      void d.dismiss();
    });
    await page.goto(base);
    await page.waitForSelector('.lobby:not([class*=intro])', { timeout: 6000 });
    await page.click('text=Deploy your mechs');
    check('a new game over the saved one asks first', await page.isVisible('[role=dialog] >> text=Start a new game?'));
    await page.click('[role=dialog] >> text=Cancel');
    check('Cancel keeps the lobby', await page.isVisible('.lobby'));
    await page.click('.your-games [aria-label="Discard this game"]');
    check('discarding asks first', await page.isVisible('[role=dialog] >> text=Discard this game?'));
    await page.click('[role=dialog] button:text-is("Discard")');
    check('Discard removes it', !(await page.isVisible('.your-games')));
    await done();
  }
} finally {
  await browser.close();
  await close();
}
if (problems) {
  console.log(`\n${problems} problem${problems > 1 ? 's' : ''}.`);
  process.exit(1);
}
