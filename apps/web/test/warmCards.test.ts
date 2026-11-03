/** Warming cards in the background: lists share one queue, and a game with no cards to draw fetches nothing. */
import { describe, expect, it, vi } from 'vitest';

const drawn: string[] = [];
const cardFontCss = vi.fn(async () => '');
vi.mock('../src/files', () => ({ rasterise: vi.fn() }));
vi.mock('../src/art/imageStore', () => ({ idle: async () => {}, storeImage: vi.fn(), storedImage: vi.fn() }));
vi.mock('../src/art/cards', () => ({
  cardFontCss,
  cardFontsReady: async () => {},
  measure: vi.fn(),
  // The first thing a drawing does: enough to see which cards were drawn, and in what order.
  faceOf: (id: string) => {
    drawn.push(id);
    throw new Error('not drawn here');
  },
}));
const { warmCardImages } = await import('../src/art/cardImages');

const settled = () => new Promise((done) => setTimeout(done));

describe('warmCardImages', () => {
  it('fetches no fonts with nothing to draw', () => {
    warmCardImages([])();
    expect(cardFontCss).not.toHaveBeenCalled();
  });

  it('works through a new list first, and keeps the one it went ahead of', async () => {
    drawn.length = 0;
    warmCardImages(['a', 'b']);
    warmCardImages(['c']);
    await settled();
    expect(drawn).toEqual(['a', 'c', 'b']);
    expect(cardFontCss).toHaveBeenCalled();
  });

  it('stopping a list takes only its own cards off the queue', async () => {
    drawn.length = 0;
    const stop = warmCardImages(['d', 'e', 'f']);
    warmCardImages(['g']);
    stop();
    await settled();
    expect(drawn).toEqual(['d', 'g']);
  });

  it('stopping a list leaves a card another list still wants', async () => {
    drawn.length = 0;
    const stop = warmCardImages(['h', 'i']);
    warmCardImages(['j', 'i']);
    stop();
    await settled();
    expect(drawn).toEqual(['h', 'j', 'i']);
  });
});
