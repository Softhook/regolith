/**
 * What the timing scripts (perf-probe, zoom-probe) share: a run fails, with exit code 1, when a step did nothing it
 * was meant to (a timing of nothing looks like a very good timing) or goes over its budget. The budgets are for an
 * Apple M4 at CPU ×4, and scale with `--cpu`.
 */
import type { CDPSession } from 'playwright';
import { arg } from './mobile-common';

export const THROTTLE = Number(arg('--cpu') ?? 4);

/** A Mac's screen: the desktop's pixels cost four times what a device pixel ratio of 1 would. */
export const DESKTOP = { viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 };

let problems = 0;

export function problem(what: string) {
  problems++;
  console.log(`  ✗ ${what}`);
}

/** Notes a time over its budget. */
export function budget(what: string, ms: number, most: number) {
  const limit = (most * THROTTLE) / 4;
  if (ms > limit) problem(`${what}: ${ms.toFixed(0)} ms, over its ${limit.toFixed(0)} ms`);
}

/** The page's main-thread time so far, in ms. */
export const busy = async (cdp: CDPSession) =>
  (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')!.value * 1000;

/** Runs a script: anything it throws is a problem too, and any problem fails the run. */
export function runProbe(main: () => Promise<void>) {
  main()
    .catch((e: unknown) => problem(e instanceof Error ? e.message : String(e)))
    .finally(() => {
      if (problems) console.log(`\n${problems} problem${problems > 1 ? 's' : ''}.`);
      process.exit(problems ? 1 : 0);
    });
}
