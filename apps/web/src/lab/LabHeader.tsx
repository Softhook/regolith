import type { ReactNode } from 'react';

const PAGES = [
  { id: 'tiles', name: 'Tiles', href: '#lab' },
  { id: 'cards', name: 'Cards', href: '#lab/cards' },
  { id: 'aid', name: 'Player aid', href: '#lab/aid' },
  { id: 'maps', name: 'Maps', href: '#lab/maps' },
  { id: 'proof', name: 'Press test', href: '#lab/proof' },
];

/** The Art Lab's top bar: page tabs, the page's own controls, and the way back. */
export function LabHeader({ page, children }: { page: string; children?: ReactNode }) {
  // The manual's "Back" returns here (Rulebook.tsx).
  const here = PAGES.find((p) => p.id === page)?.href ?? PAGES[0].href;
  return (
    <header className="lab-head">
      <h1>Art Lab</h1>
      <nav className="lab-tabs">
        {PAGES.map((p) => (
          <a key={p.id} href={p.href} className={p.id === page ? 'on' : ''}>
            {p.name}
          </a>
        ))}
        <a href={`#rulebook?from=${here.slice(1)}`}>Manual</a>
      </nav>
      <div className="lab-head-controls">{children}</div>
      <a className="btn btn-ghost" href="#">
        Back to game
      </a>
    </header>
  );
}
