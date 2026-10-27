import { useEffect, useMemo, useRef, useState } from 'react';
import {
  OFF_CENTRE,
  HEX_TILE_SET,
  TILE_SET,
  TILE_SPOTS,
  WORLD_NAMES,
  dataUrl,
  editableTileSvg,
  lookShape,
  lookWorld,
  tileSvg,
  type PlanetType,
  type TileLook,
  type TileSpec,
} from '@regolith/art';
import { blobToDataUrl, download } from '../files';
import { svgToPng } from '../print/exports';
import { fileName, pieceSize } from '../print/pieces';
import { PrintPanel, Space } from '../print/PrintPanel';
import { tileFontCss, useFontCss, useSvgUrl } from './cards';
import { LabHeader } from './LabHeader';
import {
  TILE_PRINT,
  groundDrawn,
  latestThumbnail,
  litGround,
  printableTile,
  printedTileSvg,
  printedTileSvgNow,
  thumbnail,
} from './pressSheets';

/**
 * Art Lab, tiles page (#lab): every tile of the physical set, with controls to explore seeds and
 * planet types and to export print files: single tiles, the whole set, print sheets, and the CMYK press
 * sheets the tiles share with the player aids. See docs/GRAPHICS.md §3–4. The set can be shown and
 * exported as hex tiles too (die-cut along the flower), in space or on Phobos, Deimos or Mars (the Regolith look), and with
 * its planets moved off the middle, as maps place them (docs/HEX.md).
 */

/** A thumbnail's size, px: its tile shown up to ~200 px across, at 2× device pixels. */
const THUMB_PX = 400;

const TYPES: PlanetType[] = ['gas', 'rocky', 'ice', 'lava', 'ocean'];

const LOOKS: Record<TileLook, string> = {
  square: 'Square',
  hex: 'Hex',
  phobos: `Hex, on ${WORLD_NAMES.phobos}`,
  deimos: `Hex, on ${WORLD_NAMES.deimos}`,
  mars: `Hex, on ${WORLD_NAMES.mars}`,
};

type Override = Partial<Pick<TileSpec, 'seed' | 'type' | 'rings'>>;

export function TileLab() {
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [selected, setSelected] = useState(TILE_SET[0].id);
  const [markings, setMarkings] = useState(true);
  const [bleed, setBleed] = useState(false);
  const [look, setLook] = useState<TileLook>('square');
  // Where the planets sit, as a map's layout token says (`7ne`): '' for the middle.
  const [planetAt, setPlanetAt] = useState('');
  const view = useMemo(() => ({ look, planetAt }), [look, planetAt]);
  const shape = lookShape(look);
  // The number and label fonts, embedded in the detail view and the print files (thumbnails use the system's).
  const fonts = useFontCss(tileFontCss);

  const world = lookWorld(look);

  // Hex tiles take the open-ground maps' blanks too; no square map has one.
  const specs = useMemo(() => (shape === 'hex' ? HEX_TILE_SET : TILE_SET).map((t) => ({ ...t, ...overrides[t.id] })), [overrides, shape]);
  // Drawn live where there's no thumbnail as it prints yet (below): in space, and on a world till it's drawn.
  const thumbs = useMemo(
    () =>
      specs.map((t) => ({
        spec: t,
        url: world && latestThumbnail(t, look) ? '' : dataUrl(tileSvg(t, { ...view, markings, rounded: true })),
      })),
    [specs, markings, view, world, look],
  );
  // A blank picked on a hex look isn't in the square set: show the first tile instead.
  const spec = specs.find((t) => t.id === selected) ?? specs[0];

  // On a world's ground the light depends on the size it's drawn at (Chrome ignores `kernelUnitLength`), so a
  // tile drawn live at a thumbnail's or the detail's size isn't what prints. Each is shown as it prints, as the
  // PNGs are, from its ground drawn once (pressSheets `litGround`): the selected tile's first, then the rest's.
  // Counting them in redraws the page as each is ready.
  const [, setDrawn] = useState(0);
  useEffect(() => {
    if (!world) return;
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
  }, [world, spec, specs, view, markings]);

  // A hex tile is shown cut to its flower; a square one as printed, with its bleed.
  const detailOptions = { ...view, markings, bleed, fontCss: fonts ?? '', rounded: shape === 'hex' };
  // As it prints once its ground is drawn. Until then, so it doesn't flash the live drawing: the last drawing
  // of this tile in this look (a reroll, markings on or off), else its thumbnail (its ground let go since);
  // drawn live only before either is.
  const latest = useRef<{ id: string; look: TileLook; svg: string }>(undefined);
  const ready = world && groundDrawn(spec, view);
  const { svg, live } = useMemo(() => {
    const printed = printedTileSvgNow(spec, detailOptions);
    if (printed) latest.current = { id: spec.id, look, svg: printed };
    else if (latest.current?.id === spec.id && latest.current.look === look) return { svg: latest.current.svg, live: false };
    return { svg: printed ?? tileSvg(spec, detailOptions), live: !printed };
    // `ready` stands for the drawn ground, which `printedTileSvgNow` reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, markings, bleed, fonts, view, shape, ready]);
  const drawnDetail = useSvgUrl(svg);
  const detail = (live && latestThumbnail(spec, look)) || drawnDetail;
  const set = (o: Override) => setOverrides((all) => ({ ...all, [spec.id]: { ...all[spec.id], ...o } }));

  // Prints the set as shown: seeds and types being explored, the markings setting, the shape and planet spot included.
  const printable = (t: TileSpec) => printableTile(t, fonts ?? '', markings, view);
  const { piece, cmyk } = TILE_PRINT[look];
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
          Shape
          <select
            value={look}
            onChange={(e) => {
              const next = e.target.value as TileLook;
              setLook(next);
              if (!(planetAt in TILE_SPOTS[lookShape(next)])) setPlanetAt('');
            }}
          >
            {Object.entries(LOOKS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label title="Where each objective sits on its tile, as a map's layout token says (7ne)">
          Objective
          <select value={planetAt} onChange={(e) => setPlanetAt(e.target.value)}>
            {Object.keys(TILE_SPOTS[shape]).map((d) => (
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
              <img src={(world && latestThumbnail(t, look)) || url} alt={t.id} />
              <span>
                {t.id}
                {t.type ? ` · ${t.type}` : ''}
              </span>
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
            {spec.number > 0 && (
              <>
                <label>
                  Type
                  <select value={spec.type} onChange={(e) => set({ type: e.target.value as PlanetType })}>
                    {TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Rings
                  <select
                    value={spec.rings === undefined ? 'auto' : String(spec.rings)}
                    onChange={(e) => set({ rings: e.target.value === 'auto' ? undefined : e.target.value === 'true' })}
                  >
                    <option value="auto">from seed</option>
                    <option value="true">on</option>
                    <option value="false">off</option>
                  </select>
                </label>
              </>
            )}
            {overrides[spec.id] && (
              <button className="btn btn-ghost" onClick={() => setOverrides(({ [spec.id]: _, ...rest }) => rest)}>
                Reset
              </button>
            )}
          </div>
          {shape === 'hex' && (
            <p className="lab-note">
              A hex tile is cut along its flower: the exports carry the cut line (cut.svg, a CutContour spot colour).
            </p>
          )}
          {planetAt && spec.number > 0 && !OFF_CENTRE[shape].includes(spec.number) && (
            <p className="lab-warn">
              A map puts only {OFF_CENTRE[shape].map((k) => `${k}s`).join(' and ')} off the middle of a {shape} tile: this one spills over
              its edge.
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
                Object.keys(overrides).length > 0 && 'seeds or types changed here',
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
