const PAGES = [
  { id: 'tiles', name: 'Tiles', href: '#lab' },
  { id: 'cards', name: 'Cards', href: '#lab/cards' },
  { id: 'aid', name: 'Player aid', href: '#lab/aid' },
  { id: 'maps', name: 'Maps', href: '#lab/maps' },
  { id: 'proof', name: 'Press test', href: '#lab/proof' },
  { id: 'manual', name: 'Manual', href: '#lab/manual' },
];

/** The Art Lab's top bar: page tabs and the way back (each page keeps its controls on the page). */
export function LabHeader({ page }: { page: string }) {
  return (
    <header className="lab-head">
      <h1>Art Lab</h1>
      <nav className="lab-tabs">
        {PAGES.map((p) => (
          <a key={p.id} href={p.href} className={p.id === page ? 'on' : ''}>
            {p.name}
          </a>
        ))}
      </nav>
      <a className="btn btn-ghost" href="#">
        Back to game
      </a>
    </header>
  );
}
