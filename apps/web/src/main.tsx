import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setBeatVars } from './beats';
import { ErrorBoundary } from './components/ErrorBoundary';
import { startServiceWorker } from './pwa';
import './styles.css';

// #lab opens the Art Lab and #rulebook the printable rules instead of the game; switching between
// them reloads the page.
const pageOf = (hash: string) => (hash.startsWith('#lab') ? 'lab' : hash.startsWith('#rulebook') ? 'rulebook' : 'game');
const page = pageOf(location.hash);
window.addEventListener('hashchange', () => {
  if (pageOf(location.hash) !== page) location.reload();
});

// The effects' timings, for their animations (beats.ts).
setBeatVars();

// Draw the map tiles in the background while the player is in the lobby.

// Production builds only: in dev it would cache what the dev server serves.
if (import.meta.env.PROD) startServiceWorker();

// The Art Lab and the printable rulebook are loaded only when opened, so the game starts without them.
const Lab = lazy(() => import('./lab/Lab').then((m) => ({ default: m.Lab })));
const Rulebook = lazy(() => import('./rulebook/Rulebook').then((m) => ({ default: m.Rulebook })));

// No StrictMode: its double-invoked effects would restart dice animations mid-tumble.
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <Suspense fallback={null}>{page === 'lab' ? <Lab /> : page === 'rulebook' ? <Rulebook /> : <App />}</Suspense>
  </ErrorBoundary>,
);
