/**
 * Checks, in Chrome, the screens a unit test can't render: choosing how to conquer a planet, and the
 * crash screen (components/ErrorBoundary.tsx). Exits with 1 when one of them doesn't work.
 *
 *   npm run ui:check                         # starts its own dev server
 *   npm run ui:check -- --url http://…/      # or checks a running dev server
 *
 * Positions are loaded through the dev-only `window.__game.load`, so the app must be a dev server.
 * Screenshots go to test-results/ui/.
 */
import { mkdirSync } from 'node:fs';
import type { Page } from 'playwright';
import { apply, legalActions, orbitals, RULESETS, type GameState } from '../packages/engine/src';
import { arrange, quickStart } from '../packages/engine/test/helpers';
import { devServer, finish, launchChrome, playUrl, succeeds } from './mobile-common';

const OUT = 'test-results/ui';
mkdirSync(OUT, { recursive: true });

const load = (page: Page, state: unknown) => page.evaluate((st) => window.__game.load(st as GameState), state);
const cubesOn = (page: Page, planet: number) => page.evaluate((id) => window.__game.state().board.planets[id].cubes, planet);

/** A Regolith position where the player to move can conquer a full planet by displacing either opponent's cube. */
function overConquest() {
  let s: GameState = quickStart(3, 1, 'regolith');
  const me = s.turn.player;
  const planet = s.board.planets.find((p) => !p.cubes.length && p.capacity >= 2)!;
  const [a, b] = orbitals(s.board, planet);
  s = arrange(s, { [`p${me}d0`]: [a.r, a.c, 6], [`p${me}d1`]: [b.r, b.c, 6] });
  const others = [0, 1, 2].filter((p) => p !== me);
  const target = s.board.planets[planet.id];
  for (let i = 0; i < target.capacity; i++) {
    target.cubes.push(others[i % 2]);
    s.players[others[i % 2]].cubesLeft--;
  }
  s.players.forEach((p) => (p.ai = false));
  s.turn.actionsLeft = 3;
  return { s, planet: target, me, victim: others[1] };
}

/** A Regolith hex position where the player to move has a free planet's sum in orbit, but an enemy ship in it too (contested orbit). */
function contested() {
  // 3 players, as the page and the other positions have.
  let s: GameState = quickStart(3, 1, 'regolith', 'beta-hex');
  const me = s.turn.player;
  const planet = s.board.planets.find((p) => !p.start && !p.cubes.length)!;
  const [a, b, c] = orbitals(s.board, planet);
  s = arrange(s, { [`p${me}d0`]: [a.r, a.c, 6], [`p${me}d1`]: [b.r, b.c, planet.number - 6], [`p${(me + 1) % 3}d0`]: [c.r, c.c, 3] });
  s.players.forEach((p) => (p.ai = false));
  s.turn.actionsLeft = 3;
  return { s, planet };
}

/**
 * A battle in which player `attacker` (an AI) attacks `defender`. Player 0 is the only human.
 * Nobody has atomics or skills, so nobody can respond and the battle only waits to be resolved.
 */
function battle(attacker: number, defender: number): GameState {
  let s: GameState = quickStart(3);
  s.players.forEach((p) => {
    p.ai = p.id !== 0;
    p.missiles = 0;
    p.skills = [];
  });
  s.turn.player = attacker;
  s = arrange(s, { [`p${attacker}d0`]: [4, 4, 2], [`p${defender}d0`]: [4, 5, 5] });
  s = apply(s, { type: 'attack', die: `p${attacker}d0`, target: `p${defender}d0` });
  if (s.pending[0]?.kind !== 'combat') throw new Error('no battle');
  return s;
}

let problems = 0;
const fail = (what: string) => {
  problems++;
  console.log(`✗ ${what}`);
};

const { base, close } = await devServer(5197);
const browser = await launchChrome();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await page.goto(playUrl(base, { play: 'regolith', players: 3 }));
  await page.waitForFunction(() => '__game' in window);

  // Over-conquest with two opponents' cubes: the player chooses whose to displace (only while Regolith plays it).
  if (RULESETS.regolith.overConquest) {
    const { s, planet, me, victim } = overConquest();
    if (legalActions(s).filter((x) => x.type === 'conquer' && x.planet === planet.id).length !== 2)
      fail('the position does not offer two over-conquests');
    await load(page, s);
    await page.click(`.planet-hit[data-r="${planet.r}"][data-c="${planet.c}"]`);
    const dialog = page.getByRole('dialog', { name: `Claim objective ${planet.number}` });
    await dialog.waitFor({ timeout: 5000 }).catch(() => fail('tapping the objective opens no "Claim objective" dialog'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/conquer-choice.png` });
    const name = s.players[victim].name;
    await dialog
      .getByRole('button', { name: `Displace ${name}’s cube` })
      .click({ timeout: 5000 })
      .catch(() => fail(`no "Displace ${name}’s cube" button`));
    await dialog.waitFor({ state: 'detached', timeout: 5000 }).catch(() => fail('the dialog stays open after choosing'));
    const after = await cubesOn(page, planet.id);
    const count = (cubes: number[], p: number) => cubes.filter((c) => c === p).length;
    if (count(after, victim) !== count(planet.cubes, victim) - 1 || count(after, me) !== 1) {
      fail(`displacing ${name}: the planet's cubes went from ${JSON.stringify(planet.cubes)} to ${JSON.stringify(after)}`);
    } else console.log(`✓ over-conquest: chose ${name}'s cube, and it was displaced`);
  } else console.log('- over-conquest: off in Regolith (RuleSet.overConquest), not checked');

  // Contested orbit: the planet is marked blocked, and tapping it says why instead of conquering.
  {
    const { s, planet } = contested();
    await load(page, s);
    const hit = page.locator(`.planet-hit.planet-blocked[data-r="${planet.r}"][data-c="${planet.c}"]`);
    if (!(await succeeds(hit.waitFor({ timeout: 5000 })))) fail('a blocked planet is not marked "Blocked"');
    else {
      await page.screenshot({ path: `${OUT}/contested-orbit.png` });
      await hit.click();
      const words = 'Contested perimeter';
      const info = page.locator('.info-pop', { hasText: words });
      if (!(await succeeds(info.waitFor({ timeout: 5000 })))) fail(`tapping a blocked planet shows no "${words}" info`);
      else if ((await cubesOn(page, planet.id)).length) fail('tapping a blocked planet conquered it');
      else {
        await page.screenshot({ path: `${OUT}/contested-orbit-info.png` });
        console.log('✓ contested orbit: the planet is marked blocked, and its info says why');
      }
    }
  }

  // Battles: one between two AIs resolves by itself while a human watches; a human's own waits for OK.
  const overlay = page.locator('.combat-overlay');
  const okButton = overlay.getByRole('button', { name: 'OK', exact: true });
  await load(page, battle(1, 2));
  await overlay.waitFor({ timeout: 5000 }).catch(() => fail('no battle on screen (AI against AI)'));
  if (await okButton.isVisible()) fail('a battle between two AIs asks the watching human for OK');
  if (await succeeds(overlay.waitFor({ state: 'detached', timeout: 8000 }))) console.log('✓ a battle between two AIs resolves by itself');
  else fail('a battle between two AIs stays on screen');
  await load(page, battle(1, 0));
  await okButton.waitFor({ timeout: 5000 }).catch(() => fail('a battle the human defends in has no OK'));
  await page.waitForTimeout(4000);
  if (!(await overlay.isVisible())) fail('a battle the human defends in resolved without OK');
  else {
    await okButton.click();
    await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => fail('OK leaves the battle on screen'));
    console.log('✓ a battle the human fights in waits for OK');
    // Closing a battle swallows clicks for a moment (CombatOverlay's close): let it pass.
    await page.waitForTimeout(500);
  }

  // A position the screen can't draw: the crash screen, not a blank page, and a way back to the lobby.
  await load(page, { ...quickStart(3, 1, 'regolith'), dice: null }).catch(() => {});
  const crash = page.locator('.crash');
  if (await succeeds(crash.waitFor({ timeout: 5000 }))) {
    await page.screenshot({ path: `${OUT}/crash.png` });
    console.log('✓ crash screen shown');
    await page.getByRole('button', { name: 'Back to the lobby' }).click();
    await page
      .locator('.lobby')
      .waitFor({ timeout: 10000 })
      .then(
        () => console.log('✓ "Back to the lobby" reaches the lobby'),
        () => fail('"Back to the lobby" does not reach the lobby'),
      );
  } else fail('a state that cannot be drawn leaves no crash screen');
} finally {
  await browser.close();
  await close();
}
finish(OUT, problems);
