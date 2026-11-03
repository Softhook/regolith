// Chance for what's only for show (sounds, fireworks, the lobby's backdrop): not the game's, which is seeded in
// its state.

/** A number between `lo` and `hi`. */
export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** One of `xs`. */
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** `xs` in a random order, each order as likely as any other. */
export function shuffled<T>(xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
