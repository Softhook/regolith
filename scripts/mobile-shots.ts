/**
 * Opens a game on phone and tablet screen sizes, saves a screenshot of each and checks the layout.
 * See docs/MOBILE.md.
 *
 *   npm run mobile:shots                         # starts its own dev server
 *   npm run mobile:shots -- --url https://…/     # or checks a running one (e.g. the Pages deploy)
 *   npm run mobile:shots -- --webkit             # WebKit instead of Chrome (npx playwright install webkit)
 *
 * Uses the installed Google Chrome (launchChrome). Games start from the dev-only `?play=` link
 * (playUrl), so `--url` must be a dev server.
 * Screenshots go to test-results/mobile/ (the game, each setup popup as `-popupN`, and your first turn
 * with a ship selected as `-turn`). Exits with 1 when a layout is broken: the board wider or taller
 * than its stage, a page wider than the screen (the phone then zooms the page out), a setup popup
 * whose buttons or cards are off screen without scrolling, or something you'd have to scroll to (or
 * that is covered) while placing your ships or on your turn, or the turn bar over the board.
 * Then each device opens the in-game popups (`-combat`, `-changeOfHeart`, `-over`, `-rules`, see
 * POPUPS): the popup must fit the screen, and its buttons must be on screen without scrolling inside
 * it (Change of Heart and the rules scroll their content, so only their heading and × must show).
 * Each device also opens the lobby (`-lobby`): every control of the new-game form must be inside its card, its segmented control and on screen.
 * On touch screens it also pinches, pans and fits the map on your turn (checkZoom; Chrome only).
 */
import { mkdirSync } from 'node:fs';
import { devices, webkit, type BrowserContextOptions, type Page } from 'playwright';
import { PHONES, devServer, finish, launchChrome, playUrl, succeeds } from './mobile-common';

const DEVICES: Record<string, BrowserContextOptions> = {
  ...PHONES,
  'iphone-15': devices['iPhone 15'],
  'iphone-15-landscape': devices['iPhone 15 landscape'],
  'ipad-mini': devices['iPad Mini'],
  'ipad-mini-landscape': devices['iPad Mini landscape'],
};

/** A small, a wide (open ground, 8 tiles across), a typical 4-player and the largest map. */
const GAMES = [
  { play: 'basic', players: 2, map: 'alpha-hex' },
  { play: 'regolith', players: 2, map: 'valles-marineris' },
  { play: 'regolith', players: 4, map: 'nexus-hex' },
  { play: 'regolith', players: 4, map: 'utopia-planitia' },
];

/**
 * The in-game popups, opened through the dev link's `scene` (the rules from the topbar on your turn). `must` lists
 * what has to be on screen without scrolling inside the popup. A card pick isn't a popup: the market opens (on a
 * phone, in the bottom sheet) and every card you may take must be on screen, which a sideways scroll broke.
 */
const POPUPS: { name: string; play: string; scene: string; must: string; box?: string }[] = [
  { name: 'combat', play: 'regolith', scene: 'combat', must: '.combat-card h2, .combat-total, .combat-card button' },
  {
    name: 'changeOfHeart',
    play: 'regolith',
    scene: 'changeOfHeart',
    must: '.modal h2, .modal .skill-group:first-child .qcard:first-child',
  },
  { name: 'over', play: 'basic', scene: 'over', must: '.modal h2, .modal button' },
  { name: 'pick', play: 'regolith', scene: 'takeCard', must: '.market .takeable', box: '.market' },
  { name: 'rules', play: 'basic', scene: 'turn', must: '.dialog > h2, .dialog-close' },
];

const OUT = 'test-results/mobile';

/**
 * Lists the shown elements matching `sel` that are off screen or under something from outside their
 * panel (neighbouring 3D dice overlap a little, which doesn't count).
 */
function unreachable(page: Page, sel: string): Promise<string[]> {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)].flatMap((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return []; // not shown at this size
      const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim() || 'ship';
      if (r.top < -1 || r.left < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1) return [`"${label}" off screen`];
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit && (el.closest('.panel') ?? el).contains(hit) ? [] : [`"${label}" covered by ${hit?.className}`];
    });
  }, sel);
}

/**
 * Plays the human's setup (start planet, ship placement) and waits through the AI until it's the human's
 * turn, then selects a ship. Checks the ships to place and, at the turn, End turn and the ship's buttons.
 */
async function playToMyTurn(page: Page) {
  const issues: string[] = [];
  let deployChecked = false;
  let myTurn = false;
  // The AI players' opening turns: about a minute here, but GitHub's runner shares 4 cores between every device's
  // browser and AI, so it gets four.
  const tries = process.env.CI ? 600 : 150;
  for (let i = 0; i < tries && !myTurn; i++) {
    await page.waitForTimeout(400);
    if (!deployChecked && (await page.locator('.turn-scrap .scrap-die.clickable').count())) {
      deployChecked = true;
      // The turn bar's scrapyard below 980px, the player list's on the desktop layout (the sidebar may scroll there).
      if (await page.locator('.turn-scrap').isVisible()) {
        issues.push(...(await unreachable(page, '.turn-scrap .scrap-die.clickable')).map((t) => `placing ships: ${t}`));
      }
    }
    const step = await page.evaluate(() => {
      const modal = document.querySelector('.overlay .modal');
      if (modal) {
        const keep = [...modal.querySelectorAll('button:not([disabled])')].find((b) => b.textContent!.includes('Keep'));
        ((keep ?? modal.querySelector('.qcard') ?? modal.querySelector('.btn-primary:not([disabled])')) as HTMLElement | null)?.click();
        return 'modal';
      }
      if (document.querySelector('.turn-actions .btn-primary:not([disabled])')) return 'mine';
      const target =
        document.querySelector('.planet-label')?.closest('.planet-hit') ??
        document.querySelector('.hl') ??
        document.querySelector('.turn-scrap .scrap-die.clickable');
      (target as HTMLElement | null)?.click();
      return 'wait';
    });
    myTurn = step === 'mine';
  }
  if (!myTurn) return { issues, deployChecked, myTurn };
  // Where the selected ship is a row in the turn panel (below 980px), each of your ships and its actions must fit
  // that one row, without wrapping or scrolling the buttons (the name may be cut short).
  const ownShips = await page.locator('.ship.own').count();
  for (let i = 0; i < ownShips; i++) {
    await page.evaluate((i) => (document.querySelectorAll('.ship.own')[i] as HTMLElement).click(), i);
    await page.waitForTimeout(250);
    const row = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.turn-panel .ship-panel');
      if (!panel || getComputedStyle(panel).display !== 'flex') return null;
      const name = panel.querySelector('.ship-name strong')?.textContent ?? 'ship';
      const tops = [...panel.querySelectorAll('.ship-panel-head > :not(.icon-btn), .turn-actions .btn')].flatMap((el) => {
        const r = el.getBoundingClientRect();
        return r.width ? [r.top + r.height / 2] : []; // not shown at this size
      });
      const actions = panel.querySelector('.turn-actions')!;
      return {
        name,
        wraps: Math.max(...tops) - Math.min(...tops) > 6,
        scrolls: actions.scrollWidth > actions.clientWidth + 1,
      };
    });
    if (row?.wraps) issues.push(`ship row: ${row.name} wraps`);
    if (row?.scrolls) issues.push(`ship row: ${row.name}'s buttons don't fit (they scroll)`);
    await page.evaluate(() => (document.querySelector('.turn-panel .ship-panel .icon-btn') as HTMLElement | null)?.click());
  }
  await page.evaluate(() => (document.querySelector('.ship.own') as HTMLElement | null)?.click());
  await page.waitForTimeout(500);
  issues.push(...(await unreachable(page, '.turn-actions .btn-primary, .turn-panel .ship-panel button')).map((t) => `your turn: ${t}`));
  const overlap = await page.evaluate(() => {
    const a = document.querySelector('.board')!.getBoundingClientRect();
    const b = document.querySelector('.turn-panel')!.getBoundingClientRect();
    return (
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) * (Math.min(a.right, b.right) > Math.max(a.left, b.left) ? 1 : 0)
    );
  });
  if (overlap > 2) issues.push(`your turn: turn bar covers ${Math.round(overlap)}px of the board`);
  return { issues, deployChecked, myTurn };
}

/**
 * On your turn, on a touch screen where the map zooms: pinches out on the map, pans it with one finger, then taps
 * *Whole map*. The spaces must grow, the pan must move the map without moving a ship or scrolling the page, and
 * *Whole map* must bring back the fitted size. Chrome only (the gestures are synthesised through the DevTools
 * protocol). Returns null where it doesn't apply.
 */
async function checkZoom(page: Page): Promise<{ issues: string[]; cells: number[] } | null> {
  if (!(await page.locator('.zoom-controls').count())) return null;
  const cdp = await page.context().newCDPSession(page);
  const state = () =>
    page.evaluate(() => {
      const board = document.querySelector('.board') as HTMLElement;
      const cell = parseFloat(board.style.getPropertyValue('--cell'));
      // In spaces, so a zoom doesn't count as a move.
      const ships = [...document.querySelectorAll<HTMLElement>('.ship')].map((s) => `${s.dataset.r},${s.dataset.c}`);
      return { cell, left: board.offsetLeft, top: board.offsetTop, ships: ships.sort().join(' '), scrollY: window.scrollY };
    });
  type State = Awaited<ReturnType<typeof state>>;
  // CI runners are slow: polls until the gesture has landed and the board has stopped changing, rather than
  // trusting a fixed wait.
  const settle = async (done: (s: State) => boolean): Promise<State> => {
    let prev = await state();
    for (let waited = 0; waited < 3000; waited += 200) {
      await page.waitForTimeout(200);
      const s = await state();
      if (done(s) && JSON.stringify(s) === JSON.stringify(prev)) return s;
      prev = s;
    }
    return prev;
  };
  const wrap = (await page.locator('.board-wrap').boundingBox())!;
  const mid = { x: Math.round(wrap.x + wrap.width / 2), y: Math.round(wrap.y + wrap.height / 2) };
  const issues: string[] = [];

  const fitted = await state();
  await cdp.send('Input.synthesizePinchGesture', { ...mid, scaleFactor: 2.5, relativeSpeed: 600, gestureSourceType: 'touch' });
  // The gesture's transform is committed as the new cell size.
  const pinched = await settle((s) => s.cell >= fitted.cell * 1.3);
  if (pinched.cell < fitted.cell * 1.3) issues.push(`pinch: spaces ${fitted.cell}px → ${pinched.cell}px`);

  // A slow drag, so it doesn't fling, starting off-centre so it doesn't begin on the ship just selected.
  // Sent a second time if the first is lost on a slow runner; a broken pan fails both.
  const moved = (s: State) => s.left !== pinched.left || s.top !== pinched.top;
  let panned = pinched;
  for (let attempt = 0; attempt < 2 && !moved(panned); attempt++) {
    await cdp.send('Input.synthesizeScrollGesture', {
      x: mid.x - 30,
      y: mid.y - 30,
      xDistance: 60,
      yDistance: 60,
      speed: 300,
      gestureSourceType: 'touch',
      preventFling: true,
    });
    panned = await settle(moved);
  }
  if (panned.left === pinched.left && panned.top === pinched.top) issues.push("pan: the map didn't move");
  if (panned.ships !== fitted.ships) issues.push('pan: a ship moved');
  if (panned.scrollY !== fitted.scrollY) issues.push(`pan: the page scrolled ${panned.scrollY - fitted.scrollY}px`);

  const whole = page.locator('.zoom-controls button[aria-label="Whole map"]');
  if (await whole.isVisible()) {
    await page.waitForTimeout(500); // a click within DRAG_CLICK (400ms) of the drag is the drag's, and ignored
    await whole.tap();
    const back = await settle((s) => s.cell === fitted.cell);
    if (back.cell !== fitted.cell) issues.push(`whole map: spaces ${back.cell}px, fitted ${fitted.cell}px`);
  } else issues.push('zoomed in but no Whole map button');
  await cdp.detach();
  return { issues: issues.map((i) => `zoom ${i}`), cells: [fitted.cell, pinched.cell] };
}

/** Opens each of POPUPS on a new page and lists what doesn't fit. */
async function checkPopups(newPage: () => Promise<Page>, base: string, device: string): Promise<string[]> {
  const issues: string[] = [];
  for (const pop of POPUPS) {
    const page = await newPage();
    await page.goto(playUrl(base, { play: pop.play, players: 2, scene: pop.scene }));
    await page.waitForSelector('.board', { timeout: 120000 });
    if (pop.name === 'rules') await page.locator('.topbar button', { hasText: 'Rules' }).evaluate((b: HTMLElement) => b.click());
    const box = page.locator(pop.box ?? '.overlay .modal, .overlay .combat-card').first();
    if (!(await succeeds(box.waitFor({ timeout: 15000 })))) {
      issues.push(`${pop.name}: never opened`);
      await page.context().close();
      continue;
    }
    await page.waitForTimeout(2000); // the battle reveals its totals and buttons after 1.25 s
    await page.screenshot({ path: `${OUT}/${device}-${pop.name}.png` });
    const found = await box.evaluate((el, must) => {
      const b = el.getBoundingClientRect();
      const out: string[] = [];
      // The market isn't a popup: it may run past the screen's foot, and Community's seven cards don't fit a phone's
      // height at a readable size. Its cards must never be off to the side (a sideways scroll hid the third card of
      // a row); above or below the screen is fine when the panel or page they're in scrolls up and down.
      const popup = !el.matches('.market');
      const scrollsUpDown = (t: Element) => {
        for (let a = t.parentElement; a; a = a.parentElement) {
          const y = getComputedStyle(a).overflowY;
          if ((y === 'auto' || y === 'scroll') && a.scrollHeight > a.clientHeight + 1) return true;
        }
        return document.scrollingElement!.scrollHeight > innerHeight + 1;
      };
      if (popup && (b.top < -1 || b.left < -1 || b.bottom > innerHeight + 1 || b.right > innerWidth + 1))
        out.push(`${Math.round(b.width)}×${Math.round(b.height)} box, larger than the screen`);
      const top = Math.max(0, b.top),
        bottom = Math.min(innerHeight, b.bottom),
        left = Math.max(0, b.left),
        right = Math.min(innerWidth, b.right);
      const items = [...el.querySelectorAll(must)];
      if (!items.length) out.push(`nothing matches ${must}`);
      for (const t of items) {
        const r = t.getBoundingClientRect();
        const sideways = r.left < left - 1 || r.right > right + 1;
        const upDown = r.top < top - 1 || r.bottom > bottom + 1;
        if (sideways || (upDown && (popup || !scrollsUpDown(t)))) {
          out.push(`"${(t.getAttribute('aria-label') ?? t.textContent ?? '').trim().slice(0, 30)}" off screen`);
        }
      }
      return out;
    }, pop.must);
    issues.push(...found.map((t) => `${pop.name}: ${t}`));
    await page.context().close();
  }
  return issues;
}

/**
 * The new-game form, played here and online: every control in the card is inside it and on screen (the four rule
 * sets once ran off the card of a 320px phone, without widening the page, and later out of their own control). Screenshot `-lobby`.
 */
async function checkLobby(page: Page, device: string, base: string): Promise<string[]> {
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const issues: string[] = [];
  for (const play of ['On this device', 'Online with friends']) {
    await page.locator('.lobby-card button', { hasText: play }).click();
    await page.waitForTimeout(300);
    if (play === 'On this device') await page.screenshot({ path: `${OUT}/${device}-lobby.png`, fullPage: true });
    const outside = await page.evaluate(() => {
      const card = document.querySelector('.lobby-card')!.getBoundingClientRect();
      return [...document.querySelectorAll('.lobby-card :is(button, select, input)')].flatMap((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width) return [];
        // Inside the card and on screen, inside its segmented control, and its text inside it.
        // (The text by its own box: a button's enlarged tap area, ::after, widens its scrollWidth.)
        const box = el.closest('.segmented')?.getBoundingClientRect() ?? card;
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getBoundingClientRect();
        const out =
          r.left < Math.max(card.left, box.left, 0) - 1 ||
          r.right > Math.min(card.right, box.right, innerWidth) + 1 ||
          (text.width > 0 && (text.left < r.left - 1 || text.right > r.right + 1));
        return out ? [`"${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`] : [];
      });
    });
    if (outside.length) issues.push(`lobby (${play}): ${outside.join(', ')} outside the card`);
  }
  return issues;
}

async function main() {
  const server = await devServer(5180);
  const { base } = server;
  const webkitRun = process.argv.includes('--webkit');
  const browser = webkitRun ? await webkit.launch() : await launchChrome();
  mkdirSync(OUT, { recursive: true });

  const problems: string[] = [];
  try {
    // Devices run side by side (each plays its games in turn); results print in the usual order.
    const results = await Promise.all(
      Object.entries(DEVICES).map(async ([device, options]) => {
        const lines: string[] = [];
        for (const g of GAMES) {
          // dev:https is self-signed. Reduced motion: the start-of-game zoom demo shows only its tip, so the
          // board is measured at rest.
          const ctx = await browser.newContext({ ...options, ignoreHTTPSErrors: true, reducedMotion: 'reduce' });
          const page = await ctx.newPage();
          await page.goto(playUrl(base, g));
          // Generous: on CI every device opens the cold dev server at once, and the grounds draw first.
          await page.waitForSelector('.board', { timeout: 120000 });
          const name = `${device}-${g.map}`;
          const screen = options.viewport!;
          const issues: string[] = [];

          // Setup popups (fleet roll, starting skill): screenshot and check each, then take the first
          // choice. Clicks go through the page, so a popup that is partly off screen still advances.
          for (let n = 1; n <= 4; n++) {
            const modal = page.locator('.overlay .modal').first();
            if (!(await succeeds(modal.waitFor({ timeout: 4000 })))) break;
            const keep = modal.locator('button', { hasText: 'Keep fleet' });
            if (await keep.count())
              await page
                .locator('.overlay button:not([disabled])', { hasText: 'Keep fleet' })
                .waitFor({ timeout: 5000 })
                .catch(() => {});
            await page.waitForTimeout(600); // let cards and dice finish arriving
            const title = (await modal.locator('h2').textContent())?.trim() ?? `popup ${n}`;
            const pop = await modal.evaluate((el) => {
              const r = el.getBoundingClientRect();
              const hidden = [...el.querySelectorAll('button, .qcard')].filter((t) => {
                const b = t.getBoundingClientRect();
                return b.bottom > innerHeight + 1 || b.right > innerWidth + 1 || b.top < -1 || b.left < -1;
              });
              const label = (t: Element) =>
                t.matches('.qcard') ? `card ${t.querySelector('h3, .qcard-name')?.textContent ?? ''}`.trim() : t.textContent!.trim();
              return { wide: r.right > innerWidth + 1 || r.left < -1, hidden: hidden.map(label) };
            });
            await page.screenshot({ path: `${OUT}/${name}-popup${n}.png` });
            if (pop.wide) issues.push(`"${title}" wider than the screen`);
            if (pop.hidden.length) issues.push(`"${title}": ${pop.hidden.map((t) => `"${t}"`).join(', ')} off screen`);
            await modal.evaluate((el) => {
              const keepBtn = [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Keep fleet'));
              (keepBtn ?? (el.querySelector('.qcard') as HTMLElement | null))?.click();
            });
            await page.waitForTimeout(800);
          }
          await page.waitForTimeout(700);
          await page.screenshot({ path: `${OUT}/${name}.png` });

          const m = await page.evaluate(() => {
            const rect = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
            const board = rect('.board');
            const stage = rect('.stage');
            return {
              cell: parseFloat((document.querySelector('.board') as HTMLElement).style.getPropertyValue('--cell')),
              pageWidth: window.innerWidth,
              pageHeight: document.scrollingElement!.scrollHeight,
              overflowsStage: board.width > stage.width + 1 || board.height > stage.height + 1,
            };
          });
          if (m.pageWidth > screen.width) issues.push(`page ${m.pageWidth}px wide on a ${screen.width}px screen`);
          if (m.overflowsStage) issues.push('board overflows its stage');

          // Play on to your first turn: you never scroll to act. Placing your ships, then with a ship
          // selected, everything you tap is on screen and not under anything, and the turn bar doesn't
          // cover the board.
          const turn = await playToMyTurn(page);
          if (!turn.deployChecked) issues.push('never had ships to place');
          if (!turn.myTurn) issues.push('never reached your turn');
          issues.push(...turn.issues);
          await page.screenshot({ path: `${OUT}/${name}-turn.png` });
          const zoom = turn.myTurn && options.hasTouch && !webkitRun ? await checkZoom(page) : null;
          if (zoom) issues.push(...zoom.issues);
          const pinch = zoom ? `  pinch → ${Math.round(zoom.cells[1])}px` : '';
          lines.push(
            `${name.padEnd(36)} cell ${String(m.cell).padStart(3)}px  page ${m.pageWidth}×${m.pageHeight}${pinch}  ${issues.length ? '✗ ' + issues.join('; ') : '✓'}`,
          );
          problems.push(...issues.map((i) => `${name}: ${i}`));
          await ctx.close();
        }
        // Reduced motion skips the opening, which on a phone waits for a tap with the title over the card.
        const lobbyPage = await (await browser.newContext({ ...options, ignoreHTTPSErrors: true, reducedMotion: 'reduce' })).newPage();
        const lobbyIssues = await checkLobby(lobbyPage, device, base);
        await lobbyPage.context().close();
        lines.push(`${`${device} lobby`.padEnd(36)} ${lobbyIssues.length ? '✗ ' + lobbyIssues.join('; ') : '✓'}`);
        problems.push(...lobbyIssues.map((i) => `${device}: ${i}`));
        const popIssues = await checkPopups(
          async () => (await browser.newContext({ ...options, ignoreHTTPSErrors: true })).newPage(),
          base,
          device,
        );
        lines.push(
          `${`${device} popups`.padEnd(36)} ${POPUPS.map((p) => p.name).join(', ')}  ${popIssues.length ? '✗ ' + popIssues.join('; ') : '✓'}`,
        );
        problems.push(...popIssues.map((i) => `${device}: ${i}`));
        return lines;
      }),
    );
    console.log(results.flat().join('\n'));
  } finally {
    await browser.close();
    await server.close();
  }

  finish(OUT, problems.length, 'layout problem');
}

void main();
