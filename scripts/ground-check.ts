/**
 * Checks, in Chrome, that hex tiles on Phobos, Deimos and Mars print with smooth ground: no wiggly contour
 * lines or pixel noise in it (art regolith/core.ts `LIT`). Prints tiles through the app's own print path
 * (lab/pressSheets.ts `printableTile`, print/exports.ts `svgToPng`), at the hex tiles' dpi with their
 * bleed, and without markings so only ground and what stands on it is drawn. Measures the ground's fine
 * detail: how far each pixel is from the average of its neighbours, the median over blocks of the tile,
 * so the buildings' crisp edges don't count. For comparison it also draws each ground the way that falls
 * into contour lines, all at the print's resolution.
 * Exits with 1 when a tile's ground has more fine detail than `MAX_FINE`.
 *
 *   npm run ground:check                        # starts its own dev server
 *   npm run ground:check -- --url http://…/     # or checks a running dev server
 *
 * Crops of each tile go to test-results/ground/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { devServer, finish, launchChrome } from './mobile-common';

const OUT = 'test-results/ground';
mkdirSync(OUT, { recursive: true });

/** The most fine detail smooth ground has (mean grey levels off its neighbours): it has 2.4–3.8, and in contour lines 6–18. */
const MAX_FINE = 5;

const server = await devServer(5198);
const browser = await launchChrome();
let problems = 0;

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => {
    problems++;
    console.log(`  ✗ page error: ${e.message}`);
  });
  await page.goto(server.base);
  // The app's modules, from the dev server: a string, so vite-node doesn't rewrite the import for Node.
  await page.evaluate('window.loadModule = (url) => import(url)');
  const results = await page.evaluate(async (base) => {
    const load = <T>(url: string) => (window as unknown as { loadModule: (url: string) => Promise<T> }).loadModule(url);
    const { TILE_SET } = await load<typeof import('../packages/art/src')>(`${base}@id/@regolith/art`);
    const { printableTile } = await load<typeof import('../apps/web/src/lab/pressSheets')>(`${base}src/lab/pressSheets.ts`);
    const { PIECES, pieceSize } = await load<typeof import('../apps/web/src/print/pieces')>(`${base}src/print/pieces.ts`);
    const { svgToPng } = await load<typeof import('../apps/web/src/print/exports')>(`${base}src/print/exports.ts`);
    const piece = PIECES.hexTile;
    const { w, h } = pieceSize(piece, true);

    /** A PNG's grey levels, 0–255, and its width and height. */
    async function grey(png: Blob) {
      const img = await createImageBitmap(png);
      const c = new OffscreenCanvas(img.width, img.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, img.width, img.height);
      const g = new Float32Array(img.width * img.height);
      for (let i = 0; i < g.length; i++) g[i] = 0.299 * data[4 * i] + 0.587 * data[4 * i + 1] + 0.114 * data[4 * i + 2];
      return { g, width: img.width, height: img.height };
    }

    /** The median over 48 px blocks, inside the tile's middle (clear of its knocked-out corners), of how far each pixel is from its 3 × 3 average. */
    function fine({ g, width, height }: Awaited<ReturnType<typeof grey>>) {
      const B = 48;
      const blocks: number[] = [];
      for (let by = Math.round(height * 0.2); by + B < height * 0.8; by += B)
        for (let bx = Math.round(width * 0.2); bx + B < width * 0.8; bx += B) {
          let sum = 0;
          for (let y = by; y < by + B; y++)
            for (let x = bx; x < bx + B; x++) {
              let avg = 0;
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) avg += g[(y + dy) * width + x + dx];
              sum += Math.abs(g[y * width + x] - avg / 9);
            }
          blocks.push(sum / (B * B));
        }
      blocks.sort((a, b) => a - b);
      return blocks[Math.floor(blocks.length / 2)];
    }

    /** A crop of the tile's top-left quarter, to look at. */
    async function crop(png: Blob) {
      const img = await createImageBitmap(png);
      const s = Math.round(img.width * 0.35);
      const c = new OffscreenCanvas(s, s);
      c.getContext('2d')!.drawImage(img, img.width * 0.15, img.height * 0.15, s, s, 0, 0, s, s);
      const blob = await c.convertToBlob({ type: 'image/png' });
      return new Uint8Array(await blob.arrayBuffer()).reduce((t, b) => t + String.fromCharCode(b), '');
    }

    // A tile of each number, a Void among them, on each world.
    const tiles = [7, 8, 9, 10, 0].map((num) => TILE_SET.find((t) => t.number === num)!);
    const results = [];
    for (const look of ['phobos', 'deimos', 'mars'] as const)
      for (const t of tiles) {
        const item = printableTile(t, '', false, { look });
        const printed = await svgToPng(await item.print!(true), w, h, piece.dpi);
        const contoured = await svgToPng(item.svg(true), w, h, piece.dpi);
        results.push({
          name: item.name,
          printed: fine(await grey(printed)),
          contoured: fine(await grey(contoured)),
          crop: await crop(printed),
        });
      }
    return results;
  }, server.base);

  for (const r of results) {
    writeFileSync(`${OUT}/${r.name}.png`, Buffer.from(r.crop, 'binary'));
    const ok = r.printed <= MAX_FINE;
    if (!ok) problems++;
    console.log(
      `  ${ok ? '✓' : '✗'} ${r.name}: fine detail ${r.printed.toFixed(2)} (at most ${MAX_FINE}; in contour lines ${r.contoured.toFixed(2)})`,
    );
  }
} finally {
  await browser.close();
  await server.close();
}
finish(OUT, problems);
