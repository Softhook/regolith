/**
 * Draws artwork (tiles, cards) to images: off the main thread where the browser allows, so the lobby backdrop keeps
 * animating while a map's tiles are drawn and a game's mechs keep gliding while its cards are, and on it (one at a
 * time, when the page is idle) where it doesn't.
 *
 * Workers can't decode SVG (createImageBitmap rejects it, and there's no Image), so the page decodes the SVG
 * documents to bitmaps and a worker composites and encodes them: encoding on the page took a card ~160 ms of main
 * thread on a mid-range phone, in the middle of the moves. The decoding stays on the page (laying out and painting an
 * SVG is the main thread's, if not all of its rasterising), which is what the decodes at once are capped for (`decode`).
 */

import { rasterise, rasteriseWithCutout, withSvg } from '../files';
import { COARSE } from '../game/useMediaQuery';
import { idle } from './imageStore';
import type { RasterJob, RasterRequest, RasterResponse } from './rasterWorker';

/**
 * SVGs decoded at once (across tiles and cards), and jobs each lane has in flight: a tile's SVG takes ~0.6 s to rasterise (on the CPU, off the page), so a few at a time
 * fill a map in about the time one would take on the main thread. Two on a touch screen: a phone's cores are few
 * and slow, shared with the page, and each job in flight holds the filters' buffers in memory (in the lobby,
 * emulated, two took 2.5 s against four's 2.1 s, with fewer dropped frames).
 */
const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia(COARSE).matches;
const AT_ONCE = Math.max(1, Math.min(COARSE_POINTER ? 2 : 4, (navigator.hardwareConcurrency || 2) - 1));
/** A job that takes longer than this has hung the browser's drawing: the worker is dropped. */
const TIMEOUT_MS = 30_000;

interface Job {
  resolve: (blobs: Blob[]) => void;
  reject: (error: Error) => void;
}

/** A job that couldn't be made on the page (its SVG didn't decode): its own failure, not the worker's. */
class Unmade extends Error {}

/**
 * `svg` as a `w` × `h` bitmap. An SVG that won't decode is `Unmade` (that one job's fault); one that decodes but won't
 * become a bitmap is the browser's (Safari's createImageBitmap with SVG), which would fail every job alike.
 */
async function bitmap(svg: string, w: number, h: number): Promise<ImageBitmap> {
  let decoded = false;
  try {
    return await withSvg(svg, (img) => {
      decoded = true;
      return createImageBitmap(img, { resizeWidth: w, resizeHeight: h });
    });
  } catch (error) {
    if (decoded) throw error;
    throw new Unmade(error instanceof Error ? error.message : String(error));
  }
}

/** Bitmaps decoded together: all of them, or none (any that were made are closed). */
async function bitmaps(...made: Promise<ImageBitmap>[]): Promise<ImageBitmap[]> {
  const settled = await Promise.allSettled(made);
  const failed = settled.find((s) => s.status === 'rejected');
  if (!failed) return settled.map((s) => (s as PromiseFulfilledResult<ImageBitmap>).value);
  for (const s of settled) if (s.status === 'fulfilled') s.value.close();
  throw failed.reason;
}

/**
 * SVG documents being decoded on the page, across both lanes: the decoding is the main thread's work and holds the
 * filters' buffers, so it's capped as a whole (AT_ONCE), not per lane. A card may take one more: it's one someone
 * opened, and waiting for a tile's decode to finish (~0.6 s) doubled the first pop-up's time.
 */
let decoding = 0;
const decodeQueue: Record<'card' | 'tile', (() => void)[]> = { card: [], tile: [] };
const decodeCap = (lane: 'card' | 'tile') => (lane === 'card' ? AT_ONCE + 1 : AT_ONCE);
function startWaiting() {
  for (const lane of ['card', 'tile'] as const) {
    while (decodeQueue[lane].length && decoding < decodeCap(lane)) {
      decoding++;
      decodeQueue[lane].shift()!();
    }
  }
}
async function decode<T>(lane: 'card' | 'tile', make: () => Promise<T>): Promise<T> {
  if (decodeQueue[lane].length || decoding >= decodeCap(lane)) await new Promise<void>((resolve) => decodeQueue[lane].push(resolve));
  else decoding++;
  try {
    return await make();
  } finally {
    decoding--;
    startWaiting();
  }
}

/**
 * A worker and the jobs queued for it. Tiles and cards have one each: a worker does one job at a time, and a card
 * opened as a game starts would otherwise wait behind every tile of its map.
 */
function lane(name: 'card' | 'tile') {
  let worker: Worker | null | undefined;
  let nextJob = 0;
  const jobs = new Map<number, Job>();
  let inFlight = 0;
  const waiting: (() => void)[] = [];

  /** Gives up on the worker for good (a browser that can't draw with it): every job it had fails, to be drawn on the main thread. */
  const drop = (failed: Worker, why: string) => {
    if (worker === failed) worker = null;
    failed.terminate();
    console.error(`[art] ${name} raster worker dropped (${why}); drawing on the main thread`);
    for (const job of jobs.values()) job.reject(new Error(why));
    jobs.clear();
  };

  const start = (): Worker | null => {
    if (worker !== undefined) return worker;
    try {
      const w = (worker = new Worker(new URL('./rasterWorker.ts', import.meta.url), { type: 'module' }));
      w.onmessage = ({ data }: MessageEvent<RasterResponse>) => {
        const job = jobs.get(data.id);
        if (!job) return;
        jobs.delete(data.id);
        if (data.blobs) job.resolve(data.blobs);
        else job.reject(new Error(data.error ?? 'raster worker returned no images'));
      };
      w.onerror = (event) => drop(w, event.message || 'worker error');
      w.onmessageerror = () => drop(w, 'message error');
    } catch (error) {
      console.warn(`[art] ${name} raster worker unavailable; drawing on the main thread`, error);
      worker = null;
    }
    return worker;
  };

  /** Runs the job `make` builds (decoding its bitmaps first) in the worker, a few at a time. */
  const inWorker = async (make: () => Promise<RasterJob>): Promise<Blob[]> => {
    // A finished job hands its slot straight to the next waiting (it isn't let go and taken again), so a job asked for
    // in between can't take it too and run one over AT_ONCE.
    if (inFlight >= AT_ONCE || waiting.length) await new Promise<void>((resolve) => waiting.push(resolve));
    else inFlight++;
    const id = ++nextJob;
    try {
      const w = start();
      if (!w) throw new Error('no raster worker');
      const job = await decode(name, make);
      const bitmaps = job.kind === 'tile' ? [job.image, job.cutter] : [job.image];
      if (worker !== w) {
        bitmaps.forEach((b) => b.close());
        throw new Error('raster worker dropped');
      }
      return await new Promise<Blob[]>((resolve, reject) => {
        const timer = setTimeout(() => drop(w, 'timed out'), TIMEOUT_MS);
        jobs.set(id, {
          resolve: (blobs) => (clearTimeout(timer), resolve(blobs)),
          reject: (error) => (clearTimeout(timer), reject(error)),
        });
        w.postMessage({ ...job, id } satisfies RasterRequest, bitmaps);
      });
    } catch (error) {
      jobs.delete(id);
      // A failure of the worker would fail every job the same way: don't keep trying. One SVG that won't decode
      // only fails its own job (drawn on the main thread, where it likely fails again, alone).
      if (worker && !(error instanceof Unmade)) drop(worker, error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      const next = waiting.shift();
      if (next) next();
      else inFlight--;
    }
  };

  /** In the worker, or on the main thread when there is none (or it fails). */
  return <T>(job: () => Promise<RasterJob>, done: (blobs: Blob[]) => T, fallback: () => Promise<T>): Promise<T> =>
    worker === null ? onMainThread(fallback) : inWorker(job).then(done, () => onMainThread(fallback));
}

/**
 * Drawn together as a game opens, tiles' filters took over 100 ms a frame, and during a pinch or pan they'd drop
 * its frames: so on the main thread artwork is drawn one at a time, each when the page is idle.
 */
let drawing: Promise<unknown> = Promise.resolve();
function onMainThread<T>(draw: () => Promise<T>): Promise<T> {
  const drawn = drawing.then(async () => {
    await idle();
    return draw();
  });
  drawing = drawn.catch(() => {});
  return drawn;
}

const tiles = lane('tile');
const cards = lane('card');

/**
 * A square tile image of `svg` at `size` px over an opaque `under` colour (JPEG), and the same cut out by `mask`
 * (PNG, transparent): see `rasteriseWithCutout`.
 */
export function drawTile(svg: string, mask: string, size: number, under: string, quality = 0.92): Promise<[Blob, Blob]> {
  return tiles(
    async () => {
      const [image, cutter] = await bitmaps(bitmap(svg, size, size), bitmap(mask, size, size));
      return { kind: 'tile', image, cutter, w: size, h: size, under, quality };
    },
    ([whole, cutout]) => [whole, cutout] as [Blob, Blob],
    () => rasteriseWithCutout(svg, mask, size, size, under, quality),
  );
}

/** `svg` drawn at `w` × `h` px, encoded as `type` (a card: transparent round its corners). */
export function drawImage(svg: string, w: number, h: number, type: string, quality?: number): Promise<Blob> {
  return cards(
    async () => ({ kind: 'image', image: await bitmap(svg, w, h), w, h, type, quality }),
    ([blob]) => blob,
    () => rasterise(svg, w, h, type, quality),
  );
}
