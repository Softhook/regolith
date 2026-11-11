/**
 * Times the map's zoom and pan (useBoardZoom), in Chrome with its CPU slowed down (×4 by default, roughly a
 * mid-range phone such as the Moto G55), in a 4-player Regolith game: frame gaps while a gesture is under
 * way, and the longest frame once it ends (when the new zoom is drawn crisp), with main-thread time for each, and
 * the raster and GPU time that the slowdown doesn't touch (this machine's own, so compare it only with itself), from one
 * more run under a trace, as tracing costs time of its own. Fails on a gesture that doesn't move the map as it should,
 * or that goes over budget (perf-common).
 *
 * The budgets are on requestAnimationFrame's gaps, so they catch the main thread stalling, not jank on the compositor
 * or in raster, which a Mac's GPU hides anyway: a pass doesn't say the map is smooth on a phone. Try the G55 for that.
 *
 * - desktop (mouse): wheel notches, a drag, the zoom buttons;
 * - phone (touch, the G55): a pinch out, a one-finger pan and fling, a pinch back in.
 *
 *   npm run perf:zoom                       # its own dev server
 *   npm run perf:zoom -- --cpu 6            # slower still
 *   npm run perf:zoom -- --runs 5           # more runs of each (the median is shown)
 *   npm run perf:zoom -- --headed           # in a window, on this machine's real compositor
 */
import type { Browser, CDPSession, Page } from 'playwright';
import { MOTO_G55, arg, devServer, launchChrome, playUrl } from './mobile-common';
import { DESKTOP, THROTTLE, budget, busy, problem, runProbe } from './perf-common';

/** The slowest a gesture's frames may run, at the 95th percentile: a frame missed now and then, no more. */
const DURING_MS = 34;
/** The longest frame of a whole run: a phone's new zoom is drawn crisp as the fingers lift, a mouse's a little after. */
const LONGEST_MS = 100;
/** What a gesture must do to the map, for it to have been timed at all: its size, or how far it moves. */
type Does = 'in' | 'out' | 'pans';
/** How far (px) a pan must carry the map. */
const PAN_PX = 20;
const RUNS = Number(arg('--runs') ?? 3);

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** Records every frame's length (requestAnimationFrame to requestAnimationFrame) until `stop`. */
async function record(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __rec: boolean; __mark: number };
    w.__frames = [];
    w.__rec = true;
    w.__mark = -1;
    let last = performance.now();
    const tick = (t: number) => {
      w.__frames.push(t - last);
      last = t;
      if (w.__rec) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
/** Marks the end of the gesture: frames after this are its settling. */
const mark = (page: Page) =>
  page.evaluate(
    () =>
      ((window as unknown as { __mark: number; __frames: number[] }).__mark = (
        window as unknown as { __frames: number[] }
      ).__frames.length),
  );
async function stop(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __rec: boolean; __mark: number };
    w.__rec = false;
    return { frames: w.__frames.slice(1), mark: w.__mark - 1 };
  });
}

interface Result {
  during: number[]; // frame lengths while the gesture runs
  settle: number; // the longest frame after it
  busy: number; // main-thread ms over the whole run
}

/** The map's size and place on screen. */
const mapView = (page: Page) =>
  page.evaluate(() => {
    const { width, x, y } = document.querySelector('.board')!.getBoundingClientRect();
    return { width, x, y };
  });

/** Raster and GPU time in a trace, in ms. */
function rasterAndGpu(trace: Buffer) {
  const { traceEvents } = JSON.parse(trace.toString()) as { traceEvents: { name: string; ph: string; dur?: number }[] };
  return traceEvents.reduce(
    (ms, e) => (e.ph === 'X' && (e.name === 'RasterTask' || e.name === 'GPUTask') ? ms + (e.dur ?? 0) / 1000 : ms),
    0,
  );
}

/** The raster and GPU time, in ms, of what `work` does. */
async function rasterAndGpuOf(page: Page, work: () => Promise<unknown>) {
  const browser = page.context().browser() as Browser;
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'cc', 'viz', 'gpu'] });
  await work();
  return rasterAndGpu(await browser.stopTracing());
}

async function run(page: Page, cdp: CDPSession, what: string, does: Does, gesture: () => Promise<void>, settleMs = 700): Promise<Result> {
  await pause(page, 300);
  const before = await mapView(page);
  const b0 = await busy(cdp);
  await record(page);
  await gesture();
  await mark(page);
  await pause(page, settleMs);
  const { frames, mark: m } = await stop(page);
  const b1 = await busy(cdp);
  const after = await mapView(page);
  const grew = after.width / before.width;
  const moved = Math.hypot(after.x - before.x, after.y - before.y);
  if (does === 'in' && grew < 1.2) problem(`${what}: the map didn't zoom in (×${grew.toFixed(2)})`);
  if (does === 'out' && grew > 1 / 1.2) problem(`${what}: the map didn't zoom out (×${grew.toFixed(2)})`);
  if (does === 'pans' && moved < PAN_PX) problem(`${what}: the map moved ${moved.toFixed(0)} px`);
  return {
    during: frames.slice(0, Math.max(0, m)),
    settle: Math.max(0, ...frames.slice(Math.max(0, m))),
    busy: b1 - b0,
  };
}

function report(what: string, results: Result[], gpu: number) {
  const during = results.flatMap((r) => r.during);
  const sorted = [...during].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const janky = during.filter((f) => f > DURING_MS).length;
  const settle = median(results.map((r) => r.settle));
  console.log(
    `${what.padEnd(26)} during: p95 ${p95.toFixed(0).padStart(3)} ms, max ${Math.max(0, ...during)
      .toFixed(0)
      .padStart(3)} ms, ${String(janky).padStart(2)}/${during.length} frames >${DURING_MS} ms` +
      ` · settle ${settle.toFixed(0).padStart(3)} ms · main thread ${median(results.map((r) => r.busy))
        .toFixed(0)
        .padStart(4)} ms · raster+GPU ${gpu.toFixed(0).padStart(4)} ms`,
  );
  budget(`${what}, frames`, p95, DURING_MS);
  budget(`${what}, longest frame`, median(results.map((r) => Math.max(r.settle, ...r.during))), LONGEST_MS);
}

/** Runs a gesture `RUNS` times from where `setup` leaves the map, and once more for its raster and GPU time, and reports. */
const timer =
  (page: Page, cdp: CDPSession) =>
  async (what: string, does: Does, setup: () => Promise<unknown>, gesture: () => Promise<void>, settleMs?: number) => {
    const ready = async () => {
      await setup();
      await pause(page, 500);
    };
    const once = () => run(page, cdp, what, does, gesture, settleMs);
    const out: Result[] = [];
    for (let i = 0; i < RUNS; i++) {
      await ready();
      out.push(await once());
    }
    await ready();
    report(what, out, await rasterAndGpuOf(page, once));
  };

/** The board wrap's centre, in page pixels. */
async function centre(page: Page) {
  const box = (await page.locator('.board-wrap').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

async function desktop(page: Page, cdp: CDPSession) {
  const { x, y } = await centre(page);
  const fit = () => page.evaluate(() => document.querySelector<HTMLButtonElement>('.zoom-controls [aria-label="Whole map"]')?.click());
  const times = timer(page, cdp);
  await page.mouse.move(x, y);
  await times('wheel in (notches)', 'in', fit, async () => {
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -100);
      await pause(page, 60);
    }
  });
  await times('trackpad pinch (ctrl)', 'in', fit, async () => {
    await page.keyboard.down('Control');
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, -4);
      await pause(page, 16);
    }
    await page.keyboard.up('Control');
  });
  const zoomIn = async () => {
    await fit();
    await pause(page, 400);
    await page.locator('.zoom-controls [aria-label="Zoom in"]').click();
    await pause(page, 600);
  };
  await times('drag pan', 'pans', zoomIn, async () => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) {
      await page.mouse.move(x - i * 8, y - i * 5);
      await pause(page, 16);
    }
    await pause(page, 80); // stopped before letting go: no fling
    await page.mouse.up();
  });
  await times('button zoom in', 'in', fit, async () => {
    await page.locator('.zoom-controls [aria-label="Zoom in"]').click();
    await pause(page, 300);
  });
  await times('button whole map', 'out', zoomIn, async () => {
    await page.locator('.zoom-controls [aria-label="Whole map"]').click();
    await pause(page, 300);
  });
}

async function phone(page: Page, cdp: CDPSession) {
  const { x, y } = await centre(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ ...p, id })) });
  const pinch = async (from: number, to: number, steps = 20) => {
    const at = (d: number) => [
      { x: x - d, y },
      { x: x + d, y },
    ];
    await touch('touchStart', at(from));
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', at(from + ((to - from) * i) / steps));
      await pause(page, 16);
    }
    await touch('touchEnd', []);
  };
  const fit = () => page.evaluate(() => document.querySelector<HTMLButtonElement>('.zoom-controls [aria-label="Whole map"]')?.click());
  const times = timer(page, cdp);
  const zoomedIn = async () => {
    await fit();
    await pause(page, 400);
    await pinch(30, 110);
    await pause(page, 700);
  };
  await times('pinch out', 'in', fit, () => pinch(30, 110));
  await times('pan, stopped', 'pans', zoomedIn, async () => {
    await touch('touchStart', [{ x, y }]);
    for (let i = 1; i <= 25; i++) {
      await touch('touchMove', [{ x: x - i * 6, y: y - i * 4 }]);
      await pause(page, 16);
    }
    await pause(page, 80);
    await touch('touchEnd', []);
  });
  await times(
    'pan and fling',
    'pans',
    zoomedIn,
    async () => {
      await touch('touchStart', [{ x, y }]);
      for (let i = 1; i <= 10; i++) {
        await touch('touchMove', [{ x: x - i * 14, y: y - i * 6 }]);
        await pause(page, 16);
      }
      await touch('touchEnd', []);
      await pause(page, 900); // the fling
    },
    700,
  );
  await times('pinch in', 'out', zoomedIn, () => pinch(110, 30));
}

async function main() {
  const server = await devServer(5192);
  const browser = await launchChrome();
  const url = playUrl(server.base, { play: 'regolith', players: 4, map: 'voltaire-crater', scene: 'turn' });
  for (const [name, options] of [
    ['desktop 1400×900', DESKTOP],
    ['Moto G55', MOTO_G55],
  ] as const) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    page.on('pageerror', (e) => problem(`page error: ${e.message}`));
    await page.goto(url);
    await page.waitForSelector('.mech');
    await page.waitForTimeout(3000); // the tiles drawn, the dev server's modules loaded
    if (!(await page.locator('.zoom-controls').count())) {
      problem(`${name}: the map doesn't zoom at this size`);
      continue;
    }
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    console.log(`\n${name}, CPU ×${THROTTLE}`);
    await (name.startsWith('desktop') ? desktop(page, cdp) : phone(page, cdp));
    await context.close();
  }
  await browser.close();
  await server.close();
}

runProbe(main);
