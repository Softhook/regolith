/**
 * Plays a first move, in Chrome, on each map, including those with off-centre
 * planets (docs/HEX.md): starts a Regolith game, picks one of your ships, taps a space it can move to on the
 * map and checks the ship went there. Checks too that the map draws a well for each space, cross-hatched
 * where the engine has two orbits overlap.
 * Exits with 1 when a map doesn't draw, a tap misses or the page logs an error.
 *
 *   npm run hex:check                        # starts its own dev server
 *   npm run hex:check -- --url http://…/     # or checks a running dev server
 *
 * Screenshots go to test-results/hex/.
 */
import { mkdirSync } from 'node:fs';
import { cellOf, MAPS, orbitedPlanets, spaces, type GameState } from '../packages/engine/src';
import { devServer, finish, launchChrome, playUrl } from './mobile-common';

const OUT = 'test-results/hex';
mkdirSync(OUT, { recursive: true });

const server = await devServer(5197);
const browser = await launchChrome();
let problems = 0;
const problem = (what: string) => {
  problems++;
  console.log(`  ✗ ${what}`);
};

// Every map, with Regolith's rules.
for (const map of MAPS) {
  console.log(`${map.name}`);
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  page.on('pageerror', (e) => problem(`page error: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problem(`console: ${m.text()}`));
  await page.goto(
    playUrl(server.base, {
      play: 'regolith',
      players: map.players,
      map: map.id,
      seed: 5,
      scene: 'turn',
    }),
  );
  await page.locator('.board').waitFor();
  await page.waitForTimeout(1500);
  const state = () => page.evaluate(() => window.__game.state()) as Promise<GameState>;
  const before = await state();
  if (before.board.mapId !== map.id) problem(`playing ${before.board.mapId}`);
  await page.screenshot({ path: `${OUT}/${map.id}.png` });

  // The spaces as drawn (MapTiles), against the engine's.
  const board = before.board;
  const shared = spaces(board).filter((p) => orbitedPlanets(board, p).length > 1).length;
  const drawn = await page.locator('.board-svg .well').count();
  const drawnShared = await page.locator('.board-svg .well[data-role^="shared"]').count();
  if (drawn !== spaces(board).length) problem(`${drawn} wells drawn for ${spaces(board).length} spaces`);
  if (drawnShared !== shared) problem(`${drawnShared} shared wells drawn, the engine has ${shared}`);

  // One of your ships, then a space it can move to, tapped where it is drawn. The tap goes near the
  // hex's top right side, in the corner of its square box that the hex up and right of it reaches over: a space
  // whose neighbour there is highlighted too, if there is one, so a tap on the wrong one would show.
  const ship = page.locator('.ship.own').first();
  await ship.click();
  const spots = await page
    .locator('.hl')
    .evaluateAll((els) => els.map((e) => ({ r: Number(e.getAttribute('data-r')), c: Number(e.getAttribute('data-c')) })));
  if (!spots.length) {
    problem('no space to move to');
    await page.close();
    continue;
  }
  const { r, c } = spots.find((p) => spots.some((q) => q.r === p.r - 1 && q.c === p.c + 1)) ?? spots[0];
  const box = (await page.locator(`.hl[data-r="${r}"][data-c="${c}"]`).boundingBox())!;
  await page.screenshot({ path: `${OUT}/${map.id}-reach.png` });
  // About as far from the hex's side as from the edges of the next hex's box (0.075 spaces), so rounding can't tip it.
  const [dx, dy] = [0.44, -0.08];
  await page.mouse.click(box.x + box.width * (0.5 + dx), box.y + box.height * (0.5 + dy));
  await page.waitForTimeout(800);
  const after = await state();
  const arrived = after.dice.some((d) => d.owner === 0 && cellOf(d)?.r === r && cellOf(d)?.c === c);
  if (!arrived) problem(`tapped ${r},${c}: no ship of yours there`);
  else console.log(`  ✓ moved to ${r},${c}`);
  await page.screenshot({ path: `${OUT}/${map.id}-moved.png` });
  await page.close();
}

await browser.close();
await server.close();
finish(OUT, problems);
