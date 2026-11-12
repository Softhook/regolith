import { mkdirSync } from 'node:fs';
import type { GameState } from '../packages/engine/src';
import { quickStart } from '../packages/engine/test/helpers';
import { toRow } from '../packages/engine/test/audit';
import { devServer, launchChrome, playUrl } from './mobile-common';

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const card = process.argv[3] ?? 'r-orbital-cannon';
const vp = process.argv.includes('--phone') ? { width: 412, height: 800 } : { width: 1280, height: 860 };

const s: GameState = quickStart(3, 1, 'regolith');
s.players.forEach((p) => (p.ai = p.id !== 0));
s.turn.player = 1;
s.turn.actionsLeft = 3;
const reinf = card === 'r-reinforcements';
if (!reinf) toRow(s, 'tactic', card);
const byAi = process.argv.includes('--ai');
if (byAi) {
  s.market.tacticDiscard.push(...s.market.tacticRow.slice(1), ...s.market.skillRow);
  s.market.tacticRow = s.market.tacticRow.slice(0, 1);
  s.market.skillRow = [];
  s.market.reinforcements = 0;
}
s.pending.unshift({ kind: 'takeCard', player: 1, count: 1 });

const { base, close } = await devServer(5199);
const browser = await launchChrome();
try {
  const ctx = await browser.newContext({ viewport: vp, recordVideo: { dir: OUT, size: vp } });
  const page = await ctx.newPage();
  await page.goto(playUrl(base, { play: 'regolith', players: 3 }));
  await page.waitForFunction(() => '__game' in window);
  await page.evaluate((st) => window.__game.load(st as GameState), s);
  if (!byAi) await page.waitForTimeout(800);
  const t0 = Date.now();
  const ok =
    byAi ||
    (await page.evaluate(
      (r) =>
        window.__game.dispatch(
          r ? { type: 'takeCard', deck: 'reinforcement', index: 0 } : { type: 'takeCard', deck: 'tactic', index: 0, store: false },
        ),
      reinf,
    ));
  console.log('played', ok);
  for (let i = 0; Date.now() - t0 < (byAi ? 7000 : 5000); i++) {
    await page.screenshot({ path: `${OUT}/f${String(i).padStart(2, '0')}-${Date.now() - t0}ms.png` });
    await page.waitForTimeout(250);
  }
  await ctx.close();
} finally {
  await browser.close();
  await close();
}
