import { useEffect, useMemo, useRef, useState } from 'react';
import { OFF_CENTRE, TILE_SET, TILE_SPOTS, WORLD_NAMES, dataUrl, editableTileSvg, tileSvg, type TileSpec, type World } from '@regolith/art';
import { blobToDataUrl, download } from '../files';
import { svgToPng } from '../print/exports';
import { PIECES, fileName, pieceSize } from '../print/pieces';
import { PrintPanel, Space } from '../print/PrintPanel';
import { tileFontCss, useFontCss, useSvgUrl } from './cards';
import { LabHeader } from './LabHeader';
import {
  TILE_SHEETS,
  groundDrawn,
  latestThumbnail,
  litGround,
  printableTile,
  printedTileSvg,
  printedTileSvgNow,
  thumbnail,
} from './pressSheets';

/**
 * Art Lab, tiles page (#lab): every tile of the physical set, die-cut along its flower, on Phobos, Deimos or
 * Mars, with controls to explore seeds and to export print files: single tiles, the whole set, print sheets,
 * and each world's CMYK press sheets. See docs/GRAPHICS.md §3–4. The set can be shown with its planets moved
 * off the middle, as maps place them (docs/HEX.md).
 */

/** A thumbnail's size, px: its tile shown up to ~200 px across, at 2× device pixels. */
const THUMB_PX = 400;

type Override = Partial<Pick<TileSpec, 'seed'>>;

export function TileLab() {
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [selected, setSelected] = useState(TILE_SET[0].id);
  const [markings, setMarkings] = useState(true);
  const [bleed, setBleed] = useState(false);
  const [world, setWorld] = useState<World>('mars');
  // Where the planets sit, as a map's layout token says (`7ne`): '' for the middle.
  const [planetAt, setPlanetAt] = useState('');
  const view = useMemo(() => ({ world, planetAt }), [world, planetAt]);
  // The number font, embedded in the detail view and the print files (thumbnails use the system's).
  const fonts = useFontCss(tileFontCss);

  const specs = useMemo(() => TILE_SET.map((t) => ({ ...t, ...overrides[t.id] })), [overrides]);
  // Drawn live where there's no thumbnail as it prints yet (below), till its ground is drawn.
  const thumbs = useMemo(
    () =>
      specs.map((t) => ({
        spec: t,
        url: latestThumbnail(t, world) ? '' : dataUrl(tileSvg(t, { ...view, markings, rounded: true })),
      })),
    [specs, markings, view, world],
  );
  const spec = specs.find((t) => t.id === selected) ?? specs[0];

  // On a world's ground the light depends on the size it's drawn at (Chrome ignores `kernelUnitLength`), so a
  // tile drawn live at a thumbnail's or the detail's size isn't what prints. Each is shown as it prints, as the
  // PNGs are, from its ground drawn once (pressSheets `litGround`): the selected tile's first, then the rest's.
  // Counting them in redraws the page as each is ready.
  const [, setDrawn] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      // The detail's own ground, which the thumbnails may have drawn and let go since.
      await litGround(spec, view).catch(() => {});
      if (!live) return;
      setDrawn((n) => n + 1);
      for (const t of [spec, ...specs.filter((t) => t !== spec)]) {
        await thumbnail(t, { ...view, markings, rounded: true }, THUMB_PX).catch(() => {});
        if (!live) return;
        setDrawn((n) => n + 1);
      }
    })();
    return () => {
      live = false;
    };
  }, [spec, specs, view, markings]);

  // A tile is shown cut to its flower.
  const detailOptions = { ...view, markings, bleed, fontCss: fonts ?? '', rounded: true };
  // As it prints once its ground is drawn. Until then, so it doesn't flash the live drawing: the last drawing
  // of this tile on this world (a reroll, markings on or off), else its thumbnail (its ground let go since);
  // drawn live only before either is.
  const latest = useRef<{ id: string; world: World; svg: string }>(undefined);
  const ready = groundDrawn(spec, view);
  const { svg, live } = useMemo(() => {
    const printed = printedTileSvgNow(spec, detailOptions);
    if (printed) latest.current = { id: spec.id, world, svg: printed };
    else if (latest.current?.id === spec.id && latest.current.world === world) return { svg: latest.current.svg, live: false };
    return { svg: printed ?? tileSvg(spec, detailOptions), live: !printed };
    // `ready` stands for the drawn ground, which `printedTileSvgNow` reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, markings, bleed, fonts, view, ready]);
  const drawnDetail = useSvgUrl(svg);
  const detail = (live && latestThumbnail(spec, world)) || drawnDetail;
  const set = (o: Override) => setOverrides((all) => ({ ...all, [spec.id]: { ...all[spec.id], ...o } }));

  // Prints the set as shown: seeds being explored, the markings setting, the world and planet spot included.
  const printable = (t: TileSpec) => printableTile(t, fonts ?? '', markings, view);
  const piece = PIECES.tile;
  const cmyk = TILE_SHEETS[world];
  const item = printable(spec);

  /**
   * Illustrator can't render SVG filters, so the tile's raster layers go in as a 600 dpi bitmap, with the
   * layers over them as vectors (art `editableTileSvg`).
   */
  const exportEditable = async () => {
    const { w, h } = pieceSize(piece, bleed);
    const under = await printedTileSvg(spec, { ...view, raster: true, bleed, markings, fontCss: fonts ?? '' });
    const art = await blobToDataUrl(await svgToPng(under, w, h, 600));
    const name = fileName(piece, item, { bleed, ext: 'svg' }).replace(/\.svg$/, '-illustrator.svg');
    download(name, new Blob([editableTileSvg(spec, art, { ...view, bleed, markings })], { type: 'image/svg+xml' }));
  };

  return (
    <div className="lab">
      <LabHeader page="tiles">
        <label>
          <input type="checkbox" checked={markings} onChange={(e) => setMarkings(e.target.checked)} /> Print markings
        </label>
        <label>
          World
          <select value={world} onChange={(e) => setWorld(e.target.value as World)}>
            {Object.entries(WORLD_NAMES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label title="Where each objective sits on its tile, as a map's layout token says (7ne)">
          Objective
          <select value={planetAt} onChange={(e) => setPlanetAt(e.target.value)}>
            {Object.keys(TILE_SPOTS).map((d) => (
              <option key={d} value={d}>
                {d || 'middle'}
              </option>
            ))}
          </select>
        </label>
      </LabHeader>
      <div className="lab-body">
        <div className="lab-grid">
          {thumbs.map(({ spec: t, url }) => (
            <button data-lab-nav key={t.id} className={`lab-thumb ${t.id === selected ? 'on' : ''}`} onClick={() => setSelected(t.id)}>
              <img src={latestThumbnail(t, world) || url} alt={t.id} />
              <span>{t.id}</span>
            </button>
          ))}
        </div>
        <aside className="lab-detail">
          <img src={detail} alt={spec.id} />
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
          {planetAt && spec.number > 0 && !OFF_CENTRE.includes(spec.number) && (
            <p className="lab-warn">
              A map puts only {OFF_CENTRE.map((k) => `${k}s`).join(' and ')} off the middle of a tile: this one spills over its edge.
            </p>
          )}
          <p className="lab-note">Changes here are for exploring; to keep one, copy its settings:</p>
          <pre className="lab-spec">{JSON.stringify(spec)}</pre>
          <PrintPanel
            piece={piece}
            item={item}
            bleed={bleed}
            onBleed={setBleed}
            set={specs.map(printable)}
            notes={markings ? '' : 'Without print markings.\n'}
            sheets={() => specs.map((t) => ({ front: printable(t) }))}
            cmyk={cmyk}
            ready={fonts !== null}
            fontsMissing={fonts === ''}
            cmykDiffers={
              [
                Object.keys(overrides).length > 0 && 'seeds changed here',
                !markings && 'print markings off',
                planetAt && 'objectives moved off the middle',
              ]
                .filter(Boolean)
                .join(', ') || undefined
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
