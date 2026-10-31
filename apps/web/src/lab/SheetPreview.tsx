/**
 * A lab page's big preview of one sheet: the image at its own shape (bleed changes it), or while it renders
 * a placeholder of the piece's shape.
 */
export function SheetPreview({ src, alt, w, h }: { src: string; alt: string; w: number; h: number }) {
  return src ? (
    <img className="lab-sheet" src={src} alt={alt} />
  ) : (
    <span className="lab-sheet lab-sheet-ph" style={{ aspectRatio: `${w} / ${h}` }} />
  );
}
