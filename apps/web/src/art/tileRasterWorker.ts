/**
 * Composites and encodes tile bitmaps off the main thread. Workers can't decode SVG (createImageBitmap
 * rejects it, and there's no Image), so the page decodes both documents and sends them here.
 */
export interface TileRasterRequest {
  id: number;
  image: ImageBitmap;
  cutter: ImageBitmap;
  w: number;
  h: number;
  under: string;
  quality?: number;
}

export interface TileRasterResponse {
  id: number;
  blobs?: [Blob, Blob];
  error?: string;
}

/**
 * Some browsers (Safari, with its SVG filters) hand back an empty bitmap for SVG without an error. A ground
 * fills most of its image, so one that's nearly all clear wasn't drawn: fail, so it's drawn on the main thread.
 */
function assertDrawn(canvas: OffscreenCanvas) {
  const probe = new OffscreenCanvas(16, 16);
  const context = probe.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  context.drawImage(canvas, 0, 0, 16, 16);
  const { data } = context.getImageData(0, 0, 16, 16);
  let filled = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 16) filled++;
  if (filled < 16 * 16 * 0.2) throw new Error('the browser drew an empty tile');
}

async function rasterise(request: TileRasterRequest): Promise<[Blob, Blob]> {
  const { image, cutter, w, h, under, quality } = request;
  let canvas: OffscreenCanvas | undefined;
  let flat: OffscreenCanvas | undefined;
  try {
    canvas = new OffscreenCanvas(w, h);
    flat = new OffscreenCanvas(w, h);
    const context = canvas.getContext('2d');
    const flatContext = flat.getContext('2d');
    if (!context || !flatContext) throw new Error('2D canvas is unavailable in the tile raster worker');
    context.drawImage(image, 0, 0, w, h);
    assertDrawn(canvas);
    flatContext.fillStyle = under;
    flatContext.fillRect(0, 0, w, h);
    flatContext.drawImage(canvas, 0, 0);
    // The two encode side by side: the JPEG from its own canvas, while the cut-out is drawn and encoded.
    const whole = flat.convertToBlob({ type: 'image/jpeg', quality });
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(cutter, 0, 0, w, h);
    return await Promise.all([whole, canvas.convertToBlob({ type: 'image/png' })]);
  } finally {
    image.close();
    cutter.close();
    if (canvas) canvas.width = canvas.height = 0;
    if (flat) flat.width = flat.height = 0;
  }
}

self.onmessage = (event: MessageEvent<TileRasterRequest>) => {
  const request = event.data;
  void rasterise(request).then(
    (blobs) => self.postMessage({ id: request.id, blobs } satisfies TileRasterResponse),
    (error: unknown) =>
      self.postMessage({
        id: request.id,
        error: error instanceof Error ? error.message : String(error),
      } satisfies TileRasterResponse),
  );
};
