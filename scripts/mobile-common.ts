/** What the phone scripts (mobile-shots, mobile-play, pwa-check) share: the test phone, flags, server and browser. */
import { chromium, devices, type BrowserContextOptions } from 'playwright';
import { createServer } from 'vite';
import type { GameHook } from '../apps/web/src/game/useGame';

/** The user's Moto G55: 1080×2400 at a device pixel ratio of 2.625, minus Chrome's and Android's bars. */
const g55 = { userAgent: devices['Pixel 7'].userAgent, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true };
export const MOTO_G55: BrowserContextOptions = { ...g55, viewport: { width: 412, height: 800 } };
export const MOTO_G55_LANDSCAPE: BrowserContextOptions = { ...g55, viewport: { width: 867, height: 340 } };

/** The phones every layout check runs on: the G55 both ways up, and a small iPhone. */
export const PHONES: Record<string, BrowserContextOptions> = {
  'moto-g55': MOTO_G55,
  'moto-g55-landscape': MOTO_G55_LANDSCAPE,
  'iphone-se': devices['iPhone SE'],
};

/** The value after `--name` on the command line. */
export const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};

/** The app to test: `--url`, or a dev server of our own on `port`, which a file saved mid-run doesn't reload. */
export async function devServer(port: number): Promise<{ base: string; close: () => Promise<void> }> {
  const url = arg('--url');
  if (url) return { base: url, close: async () => {} };
  const server = await createServer({ root: 'apps/web', server: { port, host: '127.0.0.1', watch: null, hmr: false } });
  await server.listen();
  return { base: server.resolvedUrls!.local[0], close: () => server.close() };
}

/**
 * The installed Google Chrome, so Playwright needs no browser download, in a window with `--headed`. `--no-proxy-server`
 * skips Chrome's proxy auto-detection, which otherwise costs 12 s on every page.
 */
export const launchChrome = () =>
  chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'], headless: !process.argv.includes('--headed') });

/** The dev-only link that starts a game straight away (apps/web/src/game/devStart.ts), so `base` must be a dev server. */
export function playUrl(base: string, game: { play: string; players: number; map?: string; seed?: number; scene?: string }): string {
  const q = new URLSearchParams({ play: game.play, players: String(game.players), seed: String(game.seed ?? 1) });
  if (game.map) q.set('map', game.map);
  if (game.scene) q.set('scene', game.scene);
  return `${base}?${q}`;
}

/** Ends a run: where the screenshots are, and exit code 1 when anything was found. */
export function finish(out: string, problems: number, what = 'problem') {
  console.log(`\nScreenshots in ${out}/`);
  if (!problems) return;
  console.log(`${problems} ${what}${problems > 1 ? 's' : ''}.`);
  process.exit(1);
}

/** Whether `p` settles without an error (a wait that may time out, as a yes or no). */
export const succeeds = (p: Promise<unknown>) =>
  p.then(
    () => true,
    () => false,
  );

declare global {
  /** In a dev server's page, once a local game is on screen (useGame.ts). */
  interface Window {
    __game: GameHook;
  }
}
