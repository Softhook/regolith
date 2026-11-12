/**
 * Composites and encodes artwork bitmaps off the main thread (raster.ts): a tile's, or a card's. Workers can't decode
 * SVG (createImageBitmap rejects it, and there's no Image), so the page decodes the documents and sends them here.
 */

/** A tile: its bitmap over an opaque `under` colour (JPEG), and cut out by `cutter` (PNG). */
interface TileJob {
  kind: 'tile';
  image: ImageBitmap;
  cutter: ImageBitmap;
  w: number;
  h: number;
  under: string;
  quality?: number;
}

/** A bitmap encoded as `type`, as it is (a card's, with its transparent corners). */
interface ImageJob {
  kind: 'image';
  image: ImageBitmap;
  w: number;
  h: number;
  type: string;
  quality?: number;
}

export type RasterJob = TileJob | ImageJob;
export type RasterRequest = RasterJob & { id: number };

export interface RasterResponse {
  id: number;
  blobs?: Blob[];
  error?: string;
}

/**
 * Some browsers (Safari, with its SVG filters) hand back an empty bitmap for SVG without an error. A tile's ground or a
 * card fills most of its image, so one that's nearly all clear wasn't drawn: fail, so it's drawn on the main thread.
 */
function assertDrawn(canvas: OffscreenCanvas | ImageBitmap) {
  const probe = new OffscreenCanvas(16, 16);
  const context = probe.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  context.drawImage(canvas, 0, 0, 16, 16);
  const { data } = context.getImageData(0, 0, 16, 16);
  let filled = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 16) filled++;
  if (filled < 16 * 16 * 0.2) throw new Error('the browser drew an empty image');
}

/** A `w` × `h` canvas with `image` drawn on it, checked to be drawn. */
function drawn(image: ImageBitmap, w: number, h: number) {
  const canvas = new OffscreenCanvas(w, h);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable in the raster worker');
  context.drawImage(image, 0, 0, w, h);
  assertDrawn(canvas);
  return { canvas, context };
}

async function tile({ image, cutter, w, h, under, quality }: TileJob): Promise<Blob[]> {
  const { canvas, context } = drawn(image, w, h);
  const flat = new OffscreenCanvas(w, h);
  try {
    const flatContext = flat.getContext('2d');
    if (!flatContext) throw new Error('2D canvas is unavailable in the raster worker');
    flatContext.fillStyle = under;
    flatContext.fillRect(0, 0, w, h);
    flatContext.drawImage(canvas, 0, 0);
    // The two encode side by side: the JPEG from its own canvas, while the cut-out is drawn and encoded.
    const whole = flat.convertToBlob({ type: 'image/jpeg', quality });
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(cutter, 0, 0, w, h);
    return await Promise.all([whole, canvas.convertToBlob({ type: 'image/png' })]);
  } finally {
    canvas.width = canvas.height = flat.width = flat.height = 0;
  }
}

/**
 * The bitmap encoded as it is: handed to a canvas (`bitmaprenderer`, no copy) rather than drawn on one, which with the
 * check read back from it took a card's full-size pixels through the 2D canvas twice.
 */
async function encoded({ image, w, h, type, quality }: ImageJob): Promise<Blob[]> {
  assertDrawn(image);
  const canvas = new OffscreenCanvas(w, h);
  const context = canvas.getContext('bitmaprenderer');
  if (!context) throw new Error('bitmaprenderer canvas is unavailable in the raster worker');
  context.transferFromImageBitmap(image);
  try {
    return [await canvas.convertToBlob({ type, quality })];
  } finally {
    canvas.width = canvas.height = 0;
  }
}

self.onmessage = (event: MessageEvent<RasterRequest>) => {
  const request = event.data;
  const job = request.kind === 'tile' ? tile(request) : encoded(request);
  void job
    .then(
      (blobs) => self.postMessage({ id: request.id, blobs } satisfies RasterResponse),
      (error: unknown) =>
        self.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) } satisfies RasterResponse),
    )
    .finally(() => {
      request.image.close();
      if (request.kind === 'tile') request.cutter.close();
    });
};
