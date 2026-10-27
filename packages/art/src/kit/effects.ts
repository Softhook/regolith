import { hsl, n } from '../svg';
import { MISSILE_HUE } from '../tokens';

/** A missile, pointing along `angle` degrees: on the player aid and the game's missile icon. Sizes in mm. */
export const missile = (x: number, y: number, angle: number, scale = 1, hue = MISSILE_HUE) =>
  `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)}) scale(${n(scale)})">` +
  `<path d="M-3.4 -.6L-4.6 -1.7H-3.6L-2.2 -.6ZM-3.4 .6L-4.6 1.7H-3.6L-2.2 .6Z" fill="${hsl(hue, 80, 50)}" stroke="${hsl(220, 30, 20)}" stroke-width=".15"/>` +
  `<path d="M3.6 0C3 -.5 2.2 -.6 1.6 -.6H-3.6V.6H1.6C2.2 .6 3 .5 3.6 0Z" fill="${hsl(220, 15, 88)}" stroke="${hsl(220, 30, 20)}" stroke-width=".18"/>` +
  `<path d="M3.6 0C3 -.5 2.6 -.58 2.2 -.6V.6C2.6 .58 3 .5 3.6 0Z" fill="${hsl(hue, 100, 60)}"/>` +
  `<path d="M-3.6 -.45L-5 0L-3.6 .45Z" fill="${hsl(35, 100, 70)}"/></g>`;

/** A regular polygon path (hexagon by default), pointy-top. */
export function poly(cx: number, cy: number, r: number, sides = 6, rot = -90): string {
  let d = '';
  for (let i = 0; i < sides; i++) {
    const a = ((rot + (i * 360) / sides) * Math.PI) / 180;
    d += `${i ? 'L' : 'M'}${n(cx + Math.cos(a) * r)} ${n(cy + Math.sin(a) * r)}`;
  }
  return d + 'Z';
}
