import { useState, type ReactNode } from 'react';
import { exportCmykFiles, exportCmykSheets, exportPng, exportZip, printSheets, type PressSheets } from './exports';
import { sizeNote, type Piece, type Printable } from './pieces';
import { PRESS } from './press';
import { PAPER, type Paper } from './sheets';
import { remember, stored } from '../storage';
import { useExport, type Run } from './useExport';
import { appKey } from '../appId';

interface Props {
  piece: Piece;
  /** The face in the detail view, for the single export. */
  item: Printable;
  bleed: boolean;
  onBleed: (bleed: boolean) => void;
  /** Every face of the set as shown, for the ZIP. */
  set: Printable[];
  /** Names which part of the set is shown, in the heading and the ZIP's name: "Community". */
  part?: string;
  /** More lines for the PNG ZIP's README. */
  notes?: string;
  /** The faces to print on sheets, with all copies or one of each. */
  sheets: (copies: boolean) => { front: Printable; back?: Printable }[];
  /** The CMYK export for the press: a PDF per front (`'files'`, cards), or press sheets shared with other pieces. */
  cmyk: 'files' | PressSheets;
  /** Offer the "All copies" and "Backs (duplex)" options on the print sheets. */
  copies?: boolean;
  backs?: boolean;
  /**
   * The faces' fonts, as `useFontCss` has them: null while loading (the faces can't be drawn yet), empty when
   * they didn't load (offline), when exports are off so no print file falls back to system fonts.
   */
  fonts: string | null;
  /** Why the press sheets aren't the faces as shown, when they aren't: they print the set as it ships. */
  cmykDiffers?: string;
  /** More single-face exports, beside the standard one. */
  extra?: (run: Run, busy: boolean) => ReactNode;
}

/** Which colour space an export's files are in, as a tag on its button, so an RGB file is never taken for the press's CMYK. */
export function Space({ of }: { of: 'rgb' | 'cmyk' }) {
  return <span className={`space-tag ${of}`}>{of === 'rgb' ? 'RGB' : 'CMYK'}</span>;
}

const DEEP_BLACK_KEY = appKey('lab.deepBlack');

/** Whether the CMYK exports print the deep black (press.ts `toCmyk`): off by default, and remembered across lab pages. */
export function useDeepBlack(): [boolean, (on: boolean) => void] {
  const [deep, setDeep] = useState(() => stored(DEEP_BLACK_KEY) === '1');
  return [
    deep,
    (on) => {
      setDeep(on);
      remember(DEEP_BLACK_KEY, on ? '1' : '0');
    },
  ];
}

/** The deep black's tick box, beside a CMYK export. */
export function DeepBlack({ deep, onDeep }: { deep: boolean; onDeep: (on: boolean) => void }) {
  return (
    <label title="The darkest tones (the space background and below) as a 100 % K rich black, deeper than the profile's own black. Try it on a proof first.">
      <input type="checkbox" checked={deep} onChange={(e) => onDeep(e.target.checked)} /> Deep black
    </label>
  );
}

/** The note under a CMYK export with the deep black on. */
export const DEEP_NOTE =
  'Deep black: the space background and anything darker print as a 100 % K rich black (about L* 11.7 against the profile’s 13.7), still within 300 % ink; the files are tagged “-deep”. Check it on a proof, and that the printer prints the CMYK as it is.';

/** An export's progress while it runs (useExport), or why it failed. */
export function ExportStatus({ progress, error }: { progress: string | null; error: string | null }) {
  return (
    <>
      {error && <p className="lab-error">Export failed: {error}</p>}
      {progress && (
        <p className="lab-progress">
          <span className="spinner" /> {progress}
        </p>
      )}
    </>
  );
}

/** The print exports for a piece, the same on every Art Lab page: this face, then the whole set. */
export function PrintPanel({
  piece,
  item,
  bleed,
  onBleed,
  set,
  part,
  notes,
  sheets,
  cmyk,
  copies,
  backs,
  fonts,
  cmykDiffers,
  extra,
}: Props) {
  const [allCopies, setAllCopies] = useState(true);
  const [withBacks, setWithBacks] = useState(false);
  const [paper, setPaper] = useState<Paper>('a4');
  const [deep, setDeep] = useDeepBlack();
  const { run, progress, error } = useExport();
  const fontsMissing = fonts === '';
  const busy = progress !== null || fonts === null || fontsMissing;

  return (
    <>
      <div className="lab-controls">
        <label>
          <input type="checkbox" checked={bleed} onChange={(e) => onBleed(e.target.checked)} /> Bleed
        </label>
        <button className="btn" disabled={busy} onClick={() => run(() => exportPng(piece, item, bleed))}>
          <Space of="rgb" /> PNG {piece.dpi} dpi
        </button>
        {extra?.(run, busy)}
      </div>
      <p className="lab-note">
        {sizeNote(piece, bleed)}
        {bleed ? ', as print services want it' : ''}. PNGs are RGB: opaque, tagged sRGB and carry their dpi. Bleed is for the PNGs; the CMYK
        files always have it, the print sheets never.
      </p>
      {fontsMissing && <p className="lab-note">The fonts didn’t load (offline?), so exports are off: they would print in system fonts.</p>}

      <h3 className="lab-sub">Whole set{part && ` (${part})`}</h3>
      <div className="lab-controls">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => run((p) => exportZip(piece, set, { bleed, part: part?.toLowerCase(), notes }, p))}
        >
          <Space of="rgb" /> All {piece.plural} · PNG ZIP
        </button>
        <span className="lab-note">
          RGB, for print services that convert it themselves: {set.length === 1 ? 'one PNG' : `${set.length} PNGs`} at {piece.dpi} dpi
          {bleed ? ', with bleed' : ''}.
        </span>
      </div>
      {cmyk === 'files' ? (
        <div className="lab-controls">
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => run((p) => exportCmykFiles(piece, sheets(true), { part: part?.toLowerCase(), deep }, p))}
          >
            <Space of="cmyk" /> PDFs · {PRESS.condition} · ZIP
          </button>
          <DeepBlack deep={deep} onDeep={setDeep} />
          <span className="lab-note">
            For print services that want CMYK and a file per {piece.id}: one PDF each with {piece.bleed} mm bleed, no crop marks,{' '}
            {piece.dpi} dpi{backs ? ', its back as page 2' : ''}, and how many to order of each in order.csv. Converted for{' '}
            {PRESS.described}.
          </span>
        </div>
      ) : (
        <div className="lab-controls">
          <button className="btn btn-primary" disabled={busy} onClick={() => run((p) => exportCmykSheets(cmyk, deep, p))}>
            <Space of="cmyk" /> {cmyk.label} · PDF · {PRESS.condition}
          </button>
          <DeepBlack deep={deep} onDeep={setDeep} />
          <span className="lab-note">
            The press file: A4 sheets with {cmyk.contents}, butted with crop marks and bleed round each block. The set as it ships, with
            print markings. Converted for {PRESS.described}.
          </span>
        </div>
      )}
      {deep && <p className="lab-note">{DEEP_NOTE}</p>}
      {cmyk !== 'files' && cmykDiffers && <p className="lab-warn">Not as shown: {cmykDiffers}. The CMYK file has the set as it ships.</p>}
      <div className="lab-controls">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => run((p) => printSheets(piece, sheets(allCopies), { withBacks, paper }, p))}
        >
          <Space of="rgb" /> Print sheets
        </button>
        <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)} aria-label="Paper">
          {Object.entries(PAPER).map(([id, p]) => (
            <option key={id} value={id}>
              {p.name}
            </option>
          ))}
        </select>
        {copies && (
          <label>
            <input type="checkbox" checked={allCopies} onChange={(e) => setAllCopies(e.target.checked)} /> All copies
          </label>
        )}
        {backs && (
          <label>
            <input type="checkbox" checked={withBacks} onChange={(e) => setWithBacks(e.target.checked)} /> Backs (duplex)
          </label>
        )}
      </div>
      <p className="lab-note">
        For a home printer, not a press: {piece.cols * piece.rows} per page at trim size with crop marks, through the browser’s print
        dialog, so a “Save as PDF” is RGB. Print at 100 % (no fit to page).
        {backs && withBacks && ' Backs follow each page, mirrored for long-edge duplex.'}
      </p>
      <ExportStatus progress={progress} error={error} />
    </>
  );
}
