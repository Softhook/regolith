import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { buildBoard, type MapDef } from '@regolith/engine';
import { GROUND_BASE, RASTER_AREA, REGOLITH_SURFACE, TILE, tileSpec, type World } from '@regolith/art';
import { decodedTileImage } from '../../art/tileImages';
import { useSurfaceImage } from '../../art/surfaceImage';
import { tileArt, type TileArt } from '../../art/boardTiles';
import { PHONE, REDUCED_MOTION, useMediaQuery } from '../../game/useMediaQuery';

/**
 * Behind the lobby: a close look at the chosen map's world, its bare ground (art `regolithSurfaceSvg`) drifting
 * slowly past as if from a low orbit, the map's bases passing under it now and then, and a survey's readout over
 * it: a grid on the ground, the position, a scan line, and brackets that lock on to each base once it's well on
 * the screen. Purely decoration: hidden from screen readers, and still under reduced motion.
 *
 * Nothing stands on the ground at first: the first base comes in over an edge once the ground is drawn, and each
 * base's tile art is drawn only when it's on its way, so on a first visit the ground has the main thread to itself.
 *
 * Kept light for phones: the ground is one layer, a repeating background a tile larger than the screen that's
 * moved by less than a tile and back, and each base is one image; only transforms change from frame to frame.
 */

/** How large one copy of the ground is drawn, px: a space comes out some 140 px across (100 on a phone). */
const TILE_PX = 1330;
const PHONE_TILE_PX = 960;
/** How fast the ground drifts, px a second, and which way it seems to go (the camera goes the other way): up and to the left. */
const SPEED = 16;
const PHONE_SPEED = 11;
const HEADING = (215 * Math.PI) / 180;
/** How far the ground drifts between one base and the next, px: about a screen; and before the first, once the ground is drawn. */
const BASE_GAP = 900;
const FIRST_BASE = 160;
/** Milliseconds before the survey says it's still drawing the ground: on a visit after the first it's there sooner. */
const SLOW_MS = 400;
/** A base is locked on while it's further inside the screen than this share of its width and height. */
const LOCK = 0.1;
/** Degrees of latitude and longitude a pixel of drift is, and where the survey starts on each world. */
const DEGREES_PER_PX = 0.00004;
const START: Record<World, [lat: number, lon: number]> = { mars: [-4.59, 137.44], phobos: [-12.2, 41.6], deimos: [8.4, 302.1] };

interface Base {
  key: number;
  tile: TileArt;
  /** Where its building stands on the ground, px. */
  x: number;
  y: number;
}

/** Each tile with a base, in turn, for the bases passing under. */
const withBases = (tiles: TileArt[]) => tiles.filter((t) => tileSpec(t.id).number > 0);

/** The ground's position as the survey shows it: degrees north or south, east. */
function position(world: World, ox: number, oy: number) {
  const [lat0, lon0] = START[world];
  const lat = lat0 - oy * DEGREES_PER_PX;
  const lon = (((lon0 + ox * DEGREES_PER_PX) % 360) + 360) % 360;
  return `${Math.abs(lat).toFixed(4)}°${lat < 0 ? 'S' : 'N'}  ${lon.toFixed(4)}°E`;
}

function Survey({ map, tilePx, speed, still }: { map: MapDef; tilePx: number; speed: number; still: boolean }) {
  const board = useMemo(() => buildBoard(map), [map]);
  const tiles = useMemo(() => withBases(tileArt(board)), [board]);
  const world = board.world;
  const ground = useSurfaceImage(world);
  const ready = useRef(false);
  ready.current = !!ground;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, []);
  /** Pixels per mm of tile art, at the ground's scale. */
  const k = tilePx / REGOLITH_SURFACE.mm;

  const drift = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const logged = useRef<HTMLSpanElement>(null);
  const els = useRef(new Map<string, HTMLDivElement>());
  const [bases, setBases] = useState<Base[]>([]);
  const current = useRef(bases);
  current.current = bases;
  // The map can change under the survey without its world changing: the next bases are the new map's.
  const siteTiles = useRef(tiles);
  siteTiles.current = tiles;

  useEffect(() => {
    const [vx, vy] = [speed * Math.cos(HEADING + Math.PI), speed * Math.sin(HEADING + Math.PI)];
    // A base's image, px across, and how far past the screen's edge one comes in from.
    const reach = (RASTER_AREA.ground.w * k) / 2;
    let [ox, oy] = [0, 0];
    let next = 0;
    let since = BASE_GAP - FIRST_BASE;
    let count = 0;
    const locked = new Set<number>();
    let last = performance.now();
    let shown = 0;
    let frame = 0;

    /** A base coming in over the edges the ground comes in from; and the next one's art drawn, ready for it. */
    const arrive = () => {
      const tiles = siteTiles.current;
      if (!tiles.length) return;
      const [W, H] = [innerWidth, innerHeight];
      const [sx, sy] = Math.random() < (H * vx) / (H * vx + W * vy) ? [W + reach, H * Math.random()] : [W * Math.random(), H + reach];
      const base = { key: next++, tile: tiles[count++ % tiles.length], x: sx + ox, y: sy + oy };
      setBases((b) => [...b, base]);
      decodedTileImage(tiles[count % tiles.length], world, 'standing').catch(() => {});
    };

    const place = () => {
      const [W, H] = [innerWidth, innerHeight];
      if (drift.current) drift.current.style.transform = `translate3d(${-(ox % tilePx)}px, ${-(oy % tilePx)}px, 0)`;
      const gone: number[] = [];
      for (const b of current.current) {
        const [art, lock] = [els.current.get(`art${b.key}`), els.current.get(`lock${b.key}`)];
        const [sx, sy] = [b.x - ox, b.y - oy];
        if (sx < -reach * 1.2 || sy < -reach * 1.2) gone.push(b.key);
        if (!art || !lock) continue;
        art.style.transform = lock.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
        const near = sx > W * LOCK && sx < W * (1 - LOCK) && sy > H * LOCK && sy < H * (1 - LOCK);
        lock.classList.toggle('locked', near);
        if (near && !locked.has(b.key)) {
          locked.add(b.key);
          if (logged.current) logged.current.textContent = String(locked.size).padStart(3, '0');
        }
      }
      if (gone.length) setBases((list) => list.filter((b) => !gone.includes(b.key)));
    };

    const tick = (now: number) => {
      // Not catching up after the tab was away.
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      ox += vx * dt;
      oy += vy * dt;
      // Counting towards the first base from when the ground is drawn.
      if (ready.current) since += speed * dt;
      if (since >= BASE_GAP) {
        since = 0;
        arrive();
      }
      place();
      if (now - shown > 200 && readout.current) {
        shown = now;
        readout.current.textContent = position(world, ox, oy);
      }
      frame = requestAnimationFrame(tick);
    };

    if (readout.current) readout.current.textContent = position(world, 0, 0);
    // Under reduced motion, the ground stays put and no base comes.
    if (!still) frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      setBases([]);
    };
  }, [world, tilePx, speed, k, still]);

  const size = RASTER_AREA.ground.w * k;
  const space = TILE.cell * k;
  /** A base's element, under the shade (its art) or over it (its brackets): moved to where it is each frame. */
  const keep = (key: string) => (el: HTMLDivElement | null) => {
    if (el) els.current.set(key, el);
    else els.current.delete(key);
  };
  return (
    <>
      <div
        ref={drift}
        className={`survey-ground${ground ? ' ready' : ''}`}
        style={{ '--tile': `${tilePx}px`, backgroundImage: ground && `url(${ground})` } as CSSProperties}
      />
      {bases.map((b) => (
        <div key={b.key} ref={keep(`art${b.key}`)} className="survey-base">
          <SiteArt tile={b.tile} world={world} size={size} space={space} />
        </div>
      ))}
      {/* Over the ground and what stands on it alike; the survey's marks stay crisp over it. */}
      <div className="backdrop-shade" />
      {bases.map((b) => (
        <div key={b.key} ref={keep(`lock${b.key}`)} className="survey-base" style={{ '--space': `${space}px` } as CSSProperties}>
          <span className="survey-lock">
            <span className="survey-label">
              Site {String(b.key + 1).padStart(2, '0')} · P{tileSpec(b.tile.id).number}
            </span>
          </span>
        </div>
      ))}
      <div className="survey-scan" />
      <div className="survey-frame">
        <span className="survey-corner tl" />
        <span className="survey-corner tr" />
        <span className="survey-corner bl" />
        <span className="survey-corner br" />
        <span className="survey-text bottom-left">
          Survey · {world}
          {'\n'}
          {ground || !slow ? (
            <span ref={readout} />
          ) : (
            <span className="survey-acquiring">
              <span className="survey-spinner" />
              Acquiring surface
            </span>
          )}
        </span>
        <span className="survey-text bottom-right">
          Sites <span ref={logged}>000</span>
        </span>
      </div>
    </>
  );
}

/** A base's tile art (what stands on it), drawn when the base is on its way, round its building's place. */
function SiteArt({ tile, world, size, space }: { tile: TileArt; world: World; size: number; space: number }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let live = true;
    decodedTileImage(tile, world, 'standing').then(
      (u) => live && setUrl(u),
      (e: unknown) => console.error(e),
    );
    return () => {
      live = false;
    };
  }, [tile, world]);
  return (
    url && (
      <img
        src={url}
        alt=""
        style={
          {
            '--space': `${space}px`,
            width: size,
            height: size,
            left: -size / 2 - tile.at.x * space,
            top: -size / 2 - tile.at.y * space,
          } as CSSProperties
        }
      />
    )
  );
}

export function LobbyBackdrop({ map }: { map: MapDef }) {
  const still = useMediaQuery(REDUCED_MOTION);
  const phone = useMediaQuery(PHONE);
  const world = useMemo(() => buildBoard(map).world, [map]);
  return (
    <div className="lobby-backdrop" style={{ background: GROUND_BASE[world] }} aria-hidden="true">
      {/* Keyed by world: a new world's ground fades in with fresh bases. */}
      <Survey
        key={`${world}:${phone}:${still}`}
        map={map}
        tilePx={phone ? PHONE_TILE_PX : TILE_PX}
        speed={phone ? PHONE_SPEED : SPEED}
        still={still}
      />
    </div>
  );
}
