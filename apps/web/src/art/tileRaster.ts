/**
 * Draws a tile's artwork to images: off the main thread where the browser allows, so the lobby backdrop keeps
 * animating while a map's tiles are drawn, and on it (one tile at a time, when the page is idle) where it doesn't.
 *
 * Workers can't decode SVG (createImageBitmap rejects it, and there's no Image), so the page decodes the two SVG
 * documents to bitmaps (the browser rasterises each on a thread of its own) and a worker composites and encodes them.
 */

import { loadSvg, rasteriseWithCutout } from '../files';
import { COARSE } from '../game/useMediaQuery';
import { idle } from './imageStore';
import type { TileRasterRequest, TileRasterResponse } from './tileRasterWorker';

/**
 * Tiles in flight at once: each SVG takes ~0.6 s to rasterise (on the CPU, off the page), so a few at a time
 * fill a map in about the time one would take on the main thread. Two on a touch screen: a phone's cores are few
 * and slow, shared with the page, and each tile in flight holds the filters' buffers in memory (in the lobby,
 * emulated, two took 2.5 s against four's 2.1 s, with fewer dropped frames).
 */
const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia(COARSE).matches;
const AT_ONCE = Math.max(1, Math.min(COARSE_POINTER ? 2 : 4, (navigator.hardwareConcurrency || 2) - 1));
/** A tile that takes longer than this has hung the browser's drawing: the worker is dropped. */
const TIMEOUT_MS = 30_000;

interface Job {
  resolve: (blobs: [Blob, Blob]) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null | undefined;
let nextJob = 0;
const jobs = new Map<number, Job>();
let inFlight = 0;
const waiting: (() => void)[] = [];

/** Gives up on the worker for good (a browser that can't draw with it): every tile it had fails, to be drawn on the main thread. */
function drop(failed: Worker, why: string) {
  if (worker === failed) worker = null;
  failed.terminate();
  console.error(`[art] tile raster worker dropped (${why}); drawing on the main thread`);
  for (const job of jobs.values()) job.reject(new Error(why));
  jobs.clear();
}

function tileWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const w = (worker = new Worker(new URL('./tileRasterWorker.ts', import.meta.url), { type: 'module' }));
    w.onmessage = ({ data }: MessageEvent<TileRasterResponse>) => {
      const job = jobs.get(data.id);
      if (!job) return;
      jobs.delete(data.id);
      if (data.blobs) job.resolve(data.blobs);
      else job.reject(new Error(data.error ?? 'tile raster worker returned no images'));
    };
    w.onerror = (event) => drop(w, event.message || 'worker error');
    w.onmessageerror = () => drop(w, 'message error');
  } catch (error) {
    console.warn('[art] tile raster worker unavailable; drawing on the main thread', error);
    worker = null;
  }
  return worker;
}

const bitmap = async (svg: string, size: number) => createImageBitmap(await loadSvg(svg), { resizeWidth: size, resizeHeight: size });

async function inWorker(svg: string, mask: string, size: number, under: string, quality: number): Promise<[Blob, Blob]> {
  if (inFlight >= AT_ONCE) await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight++;
  const id = ++nextJob;
  try {
    const w = tileWorker();
    if (!w) throw new Error('no tile raster worker');
    const [image, cutter] = await Promise.all([bitmap(svg, size), bitmap(mask, size)]);
    if (worker !== w) throw new Error('tile raster worker dropped');
    return await new Promise<[Blob, Blob]>((resolve, reject) => {
      const timer = setTimeout(() => drop(w, 'timed out'), TIMEOUT_MS);
      jobs.set(id, {
        resolve: (blobs) => (clearTimeout(timer), resolve(blobs)),
        reject: (error) => (clearTimeout(timer), reject(error)),
      });
      const request: TileRasterRequest = { id, image, cutter, w: size, h: size, under, quality };
      w.postMessage(request, [image, cutter]);
    });
  } catch (error) {
    jobs.delete(id);
    // A failure would fail every tile the same way: don't keep trying.
    if (worker) drop(worker, error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

/**
 * Drawn together as a game opens, tiles' filters took over 100 ms a frame, and during a pinch or pan they'd drop
 * its frames: so on the main thread they're drawn one at a time, each when the page is idle.
 */
let drawing: Promise<unknown> = Promise.resolve();
function onMainThread(svg: string, mask: string, size: number, under: string, quality: number): Promise<[Blob, Blob]> {
  const drawn = drawing.then(async () => {
    await idle();
    return rasteriseWithCutout(svg, mask, size, size, under, quality);
  });
  drawing = drawn.catch(() => {});
  return drawn;
}

/**
 * A square tile image of `svg` at `size` px over an opaque `under` colour (JPEG), and the same cut out by `mask`
 * (PNG, transparent): see `rasteriseWithCutout`.
 */
export function drawTile(svg: string, mask: string, size: number, under: string, quality = 0.92): Promise<[Blob, Blob]> {
  return worker === null
    ? onMainThread(svg, mask, size, under, quality)
    : inWorker(svg, mask, size, under, quality).catch(() => onMainThread(svg, mask, size, under, quality));
}
