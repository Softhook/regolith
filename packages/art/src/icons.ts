import { n } from './svg';

/**
 * Icons on a 24-unit grid with a 2-unit stroke: one per card category (tokens.ts), and a few more for
 * the illustrations. The game UI draws the same markup (CategoryIcon), so screen and print match.
 */
export const ICONS: Record<string, string> = {
  movement: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  action: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  combat: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  claim: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  power: '<path d="M3 7l4.5 5L12 5l4.5 7L21 7l-2 11H5z"/><path d="M5 21h14"/>',
  research: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>',
  mech: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/>',
  card: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M3 7v12a2 2 0 0 0 2 2"/>',
  reinforcement: '<path d="M12 5v14M5 12h14"/>',
  atomic: '<path d="M5 19l3-3M14 4l6 0 0 6-9 9-6-6z"/><path d="M8 13l3 3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>',
};

export const icon = (name: string, cx: number, cy: number, size: number, colour: string, width = 2.2) =>
  `<g transform="translate(${n(cx - size / 2)} ${n(cy - size / 2)}) scale(${n(size / 24)})" fill="none" stroke="${colour}" color="${colour}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ICONS.action}</g>`;
