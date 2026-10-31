import { useEffect, useMemo, useState } from 'react';

/** Fonts from `cardFontCss` or `tileFontCss` for a lab page: null while loading, empty when they didn't load (retries once back online). */
export function useFontCss(load: () => Promise<string>): string | null {
  const [css, setCss] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const pull = () => void load().then((c) => live && setCss(c));
    pull();
    addEventListener('online', pull);
    return () => {
      live = false;
      removeEventListener('online', pull);
    };
  }, [load]);
  return css;
}

/** A blob URL for an SVG document: cheaper than a data URL when it carries embedded fonts. The caller revokes it. */
export const svgBlobUrl = (svg: string) => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));

/** `svgBlobUrl` for a lab page's preview, revoked when replaced; empty for no SVG. */
export function useSvgUrl(svg: string): string {
  const url = useMemo(() => (svg ? svgBlobUrl(svg) : ''), [svg]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  return url;
}
