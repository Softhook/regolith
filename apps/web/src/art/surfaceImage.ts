import { useEffect, useState } from 'react';
import { REGOLITH_SURFACE, hash, regolithSurfaceSvg, type World } from '@regolith/art';
import { drawSvg, encode } from '../files';
import { storeImage, storedImage } from './imageStore';

/**
 * The lobby's surface (art `regolithSurfaceSvg`) as an image that tiles edge to edge: drawn once per world and
 * kept in IndexedDB (imageStore), as tile images are. It's drawn a little past its square, right and down, and
 * that overlap is faded in over the left and top edges, so where one copy meets the next there's no seam.
 */

const surfaces = new Map<World, Promise<string>>();

/** Fades the `o` px past the square's right edge (or its bottom, `down`) in over its left (or top), from all of it at the edge to none. */
function blendEdge(canvas: HTMLCanvasElement, size: number, o: number, down: boolean) {
  const strip = document.createElement('canvas');
  [strip.width, strip.height] = down ? [canvas.width, o] : [o, canvas.height];
  const s = strip.getContext('2d')!;
  s.drawImage(canvas, down ? 0 : -size, down ? -size : 0);
  const fade = down ? s.createLinearGradient(0, 0, 0, o) : s.createLinearGradient(0, 0, o, 0);
  fade.addColorStop(0, '#000');
  fade.addColorStop(1, 'transparent');
  s.globalCompositeOperation = 'destination-in';
  s.fillStyle = fade;
  s.fillRect(0, 0, strip.width, strip.height);
  canvas.getContext('2d')!.drawImage(strip, 0, 0);
  strip.width = strip.height = 0;
}

async function drawSurface(svg: string): Promise<Blob> {
  const { px, overlap } = REGOLITH_SURFACE;
  const o = Math.round(px * overlap);
  const drawn = await drawSvg(svg, px + o, px + o);
  try {
    blendEdge(drawn, px, o, false);
    blendEdge(drawn, px, o, true);
    const square = document.createElement('canvas');
    square.width = square.height = px;
    square.getContext('2d')!.drawImage(drawn, 0, 0);
    // JPEG: the ground is opaque, and WebP takes ten times as long to encode it (over a second), at twice the size.
    return await encode(square, 'image/jpeg', 0.85);
  } finally {
    drawn.width = drawn.height = 0;
  }
}

/** The image URL of `world`'s surface, drawing and storing it the first time. */
export function surfaceImage(world: World): Promise<string> {
  let url = surfaces.get(world);
  if (!url) {
    const svg = regolithSurfaceSvg(world);
    const [id, key] = [`surface:${world}`, `${hash(svg)}:${REGOLITH_SURFACE.px}`];
    url = (async () => {
      const stored = await storedImage('tiles', id, key).catch(() => undefined);
      if (stored) return URL.createObjectURL(stored);
      const blob = await drawSurface(svg);
      storeImage('tiles', id, key, blob).catch(() => {});
      return URL.createObjectURL(blob);
    })();
    url.catch(() => surfaces.delete(world));
    surfaces.set(world, url);
  }
  return url;
}

/** `world`'s surface image URL once it's ready (`surfaceImage`), or none till then. */
export function useSurfaceImage(world: World): string | undefined {
  const [shown, setShown] = useState<{ world: World; url: string }>();
  useEffect(() => {
    let live = true;
    surfaceImage(world).then(
      (url) => live && setShown({ world, url }),
      (e: unknown) => console.error(e),
    );
    return () => {
      live = false;
    };
  }, [world]);
  return shown?.world === world ? shown.url : undefined;
}
