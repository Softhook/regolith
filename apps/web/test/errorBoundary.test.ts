import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

/** What the boundary shows once `thrown` has been thrown below it. */
function shown(thrown: unknown): string {
  const b = new ErrorBoundary({ children: 'the game' });
  b.state = ErrorBoundary.getDerivedStateFromError(thrown);
  return renderToStaticMarkup(b.render());
}

describe('the crash screen', () => {
  it('shows the app until something throws', () => {
    expect(new ErrorBoundary({ children: 'the game' }).render()).toBe('the game');
  });

  // Any value can be thrown: a falsy one must not bring back the app that just threw it.
  for (const thrown of [null, undefined, '', 0, false]) {
    it(`replaces the app when ${JSON.stringify(thrown) ?? 'undefined'} is thrown`, () => {
      expect(shown(thrown)).toContain('Something went wrong');
      expect(shown(thrown)).not.toContain('the game');
    });
  }

  it('says what was thrown, an Error or not', () => {
    expect(shown(new Error('no such mech'))).toContain('no such mech');
    expect(shown('no such objective')).toContain('no such objective');
  });
});
