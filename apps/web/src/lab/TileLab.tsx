import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WORLD_NAMES, dataUrl, editableTileSvg, tileSvg, type TileSpec, type World } from '@regolith/art';
import { blobToDataUrl, download } from '../files';
import { svgToPng } from '../print/exports';
import { PIECES, fileName, pieceSize } from '../print/pieces';
import { PrintPanel, Space } from '../print/PrintPanel';
import { tileFontCss } from '../art/cards';
import { useFontCss, useSvgUrl } from './hooks';
import { LabHeader } from './LabHeader';
import { printableTile, tileSheets, type TileKit } from './pressSheets';
import { kitKey, tileKit, tileSetPlayers, tileSide, type KitTile } from './tileSets';
import { groundDrawn, latestThumbnail, litGround, printedTileSvg, printedTileSvgNow, thumbnail, type TileView } from './tileDrawing';

/**
 * Art Lab, tiles page (#lab): every tile of the physical set, die-cut along its flower, on Phobos, Deimos or
 * Mars, with controls to explore seeds and to export print files: single tiles, the whole set, print sheets,
 * and each world's CMYK press sheets. See docs/GRAPHICS.md §3–4. The set can be shown with its objectives moved
 * off the middle, as maps place them (docs/HEX.md), cut down to the kit a player count needs, and made
 * two-sided, another world on the back.
 */

/** A thumbnail's size, px: its tile shown up to ~200 px across, at 2× device pixels. */
const THUMB_PX = 400;

type Override = Partial<Pick<TileSpec, 'seed'>>;

export function TileLab() {
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [selected, setSelected] = useState('');
  const [markings, setMarkings] = useState(true);
  const [bleed, setBleed] = useState(false);
  const [world, setWorld] = useState<World>('mars');
  const [playerChoice, setPlayers] = useState<number | 'all'>('all');
  // The world on the tiles' backs, '' for one-sided; and whether the page shows the backs.
  const [backChoice, setBack] = useState<World | ''>('');
  const [flipped, setFlipped] = useState(false);
  const back = backChoice && backChoice !== world ? backChoice : undefined;
  const worlds = useMemo<World[]>(() => (back ? [world, back] : [world]), [world, back]);
  // Only the player counts these worlds have maps for; a count they haven't falls back to every map.
  const playerCounts = useMemo(() => tileSetPlayers(worlds), [worlds]);
  const players = playerChoice !== 'all' && playerCounts.includes(playerChoice) ? playerChoice : undefined;
  // The side shown: its world.
  const shown = flipped && back ? back : world;
  const kit: TileKit = { world, back, players };
  // The number font, embedded in the detail view and the print files (thumbnails use the system's).
  const fonts = useFontCss(tileFontCss);

  const tiles = useMemo(
    () => tileKit(worlds, players).map((k) => ({ ...k, tile: { ...k.tile, ...overrides[k.tile.id] } })),
    [overrides, players, worlds],
  );
  /** How a kit tile is shown on a world. */
  const viewOf = useCallback((_: KitTile, on: World): TileView => ({ world: on }), []);
  // Drawn live where there's no thumbnail as it prints yet (below), till its ground is drawn.
  const thumbs = useMemo(
    () =>
      tiles.map((k) => {
        const face = tileSide(k.tile, shown);
        const view = viewOf(k, shown);
        return {
          k,
          key: kitKey(k),
          face,
          view,
          url: latestThumbnail(face, view) ? '' : dataUrl(tileSvg(face, { ...view, markings, rounded: true })),
        };
      }),
    [tiles, markings, viewOf, shown],
  );
  const current = thumbs.find((t) => t.key === selected) ?? thumbs[0];
  const spec = current.k.tile;
  // The selected tile's side shown, which is drawn: open ground where its objective can't stand (`tileSide`).
  const { face, view } = current;

  // On a world's ground the light depends on the size it's drawn at (Chrome ignores `kernelUnitLength`), so a
  // tile drawn live at a thumbnail's or the detail's size isn't what prints. Each is shown as it prints, as the
  // PNGs are, from its ground drawn once (pressSheets `litGround`): the selected tile's first, then the rest's.
  // Counting them in redraws the page as each is ready.
  const [, setDrawn] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      // The detail's own ground, which the thumbnails may have drawn and let go since.
      await litGround(current.face, current.view).catch(() => {});
      if (!live) return;
      setDrawn((n) => n + 1);
      for (const t of [current, ...thumbs.filter((t) => t !== current)]) {
        await thumbnail(t.face, { ...t.view, markings, rounded: true }, THUMB_PX).catch(() => {});
        if (!live) return;
        setDrawn((n) => n + 1);
      }
    })();
    return () => {
      live = false;
    };
  }, [current, thumbs, markings]);

  // A tile is shown cut to its flower.
  const detailOptions = { ...view, markings, bleed, fontCss: fonts ?? '', rounded: true };
  // As it prints once its ground is drawn. Until then, so it doesn't flash the live drawing: the last drawing
  // of this tile on this world (a reroll, markings on or off), else its thumbnail (its ground let go since);
  // drawn live only before either is.
  const latest = useRef<{ key: string; world: World; svg: string }>(undefined);
  const ready = groundDrawn(face, view);
  const { svg, live } = useMemo(() => {
    const printed = printedTileSvgNow(face, detailOptions);
    const key = face.id;
    if (printed) latest.current = { key, world: shown, svg: printed };
    else if (latest.current?.key === key && latest.current.world === shown) return { svg: latest.current.svg, live: false };
    return { svg: printed ?? tileSvg(face, detailOptions), live: !printed };
    // `ready` stands for the drawn ground, which `printedTileSvgNow` reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face, markings, bleed, fonts, view, ready]);
  const drawnDetail = useSvgUrl(svg);
  const detail = (live && latestThumbnail(face, view)) || drawnDetail;
  const set = (o: Override) => setOverrides((all) => ({ ...all, [spec.id]: { ...all[spec.id], ...o } }));

  // Prints the set as shown: seeds being explored, the markings setting, and each side's world.
  const printable = (k: KitTile, side: World) => printableTile(tileSide(k.tile, side), fonts ?? '', markings, viewOf(k, side));
  const piece = PIECES.tile;
  const cmyk = tileSheets(kit);
  const item = printable(current.k, shown);
  // The ZIP's name and heading: its worlds and player count.
  const part = [WORLD_NAMES[world], back && WORLD_NAMES[back], players && `${players}p`].filter(Boolean).join('-');
  const fronts = tiles.map((k) => printable(k, world));
  const backs = back ? tiles.map((k) => printable(k, back)) : [];
  // Each front's back, by file: names carry their world, and a side that can't hold its objective is a blank.
  const pairs = back ? fronts.map((f, i) => `  ${f.name}.png  →  ${backs[i].name}.png\n`).join('') : '';

  /**
   * Illustrator can't render SVG filters, so the tile's raster layers go in as a 600 dpi bitmap, with the
   * layers over them as vectors (art `editableTileSvg`).
   */
  const exportEditable = async () => {
    const { w, h } = pieceSize(piece, bleed);
    const under = await printedTileSvg(face, { ...view, raster: true, bleed, markings, fontCss: fonts ?? '' });
    const art = await blobToDataUrl(await svgToPng(under, w, h, 600));
    const name = fileName(piece, item, { bleed, ext: 'svg' }).replace(/\.svg$/, '-illustrator.svg');
    download(name, new Blob([editableTileSvg(face, art, { ...view, bleed, markings })], { type: 'image/svg+xml' }));
  };

  return (
    <div className="lab">
      <LabHeader page="tiles" />
      <div className="lab-body">
        <div className="lab-grid">
          {thumbs.map(({ key, face: f, view: v, url }) => (
            <button data-lab-nav key={key} className={`lab-thumb ${key === current.key ? 'on' : ''}`} onClick={() => setSelected(key)}>
              <img src={latestThumbnail(f, v) || url} alt={key} />
              <span>{key}</span>
            </button>
          ))}
        </div>
        <aside className="lab-detail">
          <img src={detail} alt={current.key} />
          <div className="lab-controls">
            <label>
              <input type="checkbox" checked={markings} onChange={(e) => setMarkings(e.target.checked)} /> Print markings
            </label>
            <label>
              World
              <select
                value={world}
                onChange={(e) => {
                  const next = e.target.value as World;
                  setWorld(next);
                  // A back can't be the front's world: that choice is dropped, not kept for later.
                  if (backChoice === next) setBack('');
                }}
              >
                {Object.entries(WORLD_NAMES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label title="A two-sided kit: this world on the back, for its maps too">
              Back
              <select value={back ?? ''} onChange={(e) => setBack(e.target.value as World | '')}>
                <option value="">None</option>
                {Object.entries(WORLD_NAMES)
                  .filter(([value]) => value !== world)
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            {back && (
              <label>
                <input type="checkbox" checked={flipped} onChange={(e) => setFlipped(e.target.checked)} /> Show backs
              </label>
            )}
            <label>
              Players
              <select value={players ?? 'all'} onChange={(e) => setPlayers(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                <option value="all">All maps</option>
                {playerCounts.map((n) => (
                  <option key={n} value={n}>
                    {n} players
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="lab-controls">
            <label>
              Seed
              <input type="number" value={spec.seed} onChange={(e) => set({ seed: Number(e.target.value) >>> 0 })} />
            </label>
            <button className="btn" onClick={() => set({ seed: Math.floor(Math.random() * 2 ** 32) })}>
              Reroll
            </button>
            {overrides[spec.id] && (
              <button className="btn btn-ghost" onClick={() => setOverrides(({ [spec.id]: _, ...rest }) => rest)}>
                Reset
              </button>
            )}
          </div>
          <p className="lab-note">A tile is cut along its flower: the exports carry the cut line (cut.svg, a CutContour spot colour).</p>
          <p className="lab-note">Changes here are for exploring; to keep one, copy its settings:</p>
          <pre className="lab-spec">{JSON.stringify(spec)}</pre>
          <PrintPanel
            piece={piece}
            item={item}
            bleed={bleed}
            onBleed={setBleed}
            set={[...fronts, ...backs]}
            part={part}
            notes={
              (markings ? '' : 'Without print markings.\n') +
              (back
                ? `Two-sided, ${WORLD_NAMES[world]} on the front and ${WORLD_NAMES[back]} on the back. Each front's back:\n${pairs}`
                : '')
            }
            sheets={() => fronts.map((front, i) => ({ front, ...(back && { back: backs[i] }) }))}
            backs={!!back}
            cmyk={cmyk}
            fonts={fonts}
            cmykDiffers={
              [Object.keys(overrides).length > 0 && 'seeds changed here', !markings && 'print markings off'].filter(Boolean).join(', ') ||
              undefined
            }
            extra={(run, busy) => (
              <button
                className="btn"
                disabled={busy}
                onClick={() => run(exportEditable)}
                title="Art as a 600 dpi RGB image, markings as editable vectors"
              >
                <Space of="rgb" /> SVG for Illustrator
              </button>
            )}
          />
        </aside>
      </div>
    </div>
  );
}
