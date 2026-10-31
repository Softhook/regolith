import { useRef, useState, type RefObject } from 'react';
import { download } from '../files';
import { GAME_NAME, gameFile } from '../appId';
import { PAPER, type Paper } from '../print/sheets';
import { Manual } from './Manual';
import css from './rulebook.css?raw';

/**
 * The printable manual (#rulebook): the same <Manual> as the in-game "How to play" dialog, on paper.
 * "Save as PDF" prints the page; "Download HTML" saves it as one self-contained file. The Art Lab shows
 * it too (#lab/manual: ManualLab).
 */

/** The game's colour variables (styles.css :root) the manual uses, read off its stylesheet; the downloaded file gets a copy. */
const GAME_VARS = [...new Set(css.match(/var\(--(?!mn-)[\w-]+/g)!.map((v) => v.slice(4)))];

function gameColours() {
  const root = getComputedStyle(document.documentElement);
  return `:root{${GAME_VARS.map((v) => `${v}:${root.getPropertyValue(v).trim()}`).join(';')}}`;
}

/**
 * The manual's paper, "Download HTML" and "Save as PDF", for the manual rendered in `page`. Its page size goes
 * in a stylesheet of its own, which must come after rulebook.css so that it replaces the stylesheet's A4.
 */
export function ManualExports({ page }: { page: RefObject<HTMLElement | null> }) {
  const [paper, setPaper] = useState<Paper>('a4');
  const pageCss = `@media print { @page { size: ${PAPER[paper].w}mm ${PAPER[paper].h}mm; } }`;

  const downloadHtml = () => {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${GAME_NAME} — Manual</title><style>${gameColours()}${css}${pageCss}</style></head><body class="rb-standalone">${page.current!.outerHTML}</body></html>`;
    download(gameFile('manual.html'), new Blob([html], { type: 'text/html' }));
  };

  return (
    <>
      <style>{pageCss}</style>
      <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)} aria-label="Paper">
        {Object.entries(PAPER).map(([id, p]) => (
          <option key={id} value={id}>
            {p.name}
          </option>
        ))}
      </select>
      <button className="btn" onClick={downloadHtml}>
        Download HTML
      </button>
      <button className="btn btn-primary" onClick={() => window.print()}>
        Save as PDF
      </button>
    </>
  );
}

export function Rulebook() {
  const page = useRef<HTMLDivElement>(null);

  return (
    <div className="rb-screen">
      <style>{css}</style>
      <div className="rb-toolbar">
        <a className="btn btn-ghost" href="#">
          ← Back to game
        </a>
        <span className="rb-spacer" />
        <ManualExports page={page} />
      </div>

      <div className="rb-page" ref={page}>
        <Manual />
      </div>
    </div>
  );
}
