/** The Art Lab's pages, as their tabs: each at `#lab/<id>`, but the first, the tiles, at `#lab`. */
const LAB_PAGES = [
  { id: 'tiles', name: 'Tiles' },
  { id: 'cards', name: 'Cards' },
  { id: 'aid', name: 'Player aid' },
  { id: 'maps', name: 'Maps' },
  { id: 'proof', name: 'Press test' },
  { id: 'manual', name: 'Manual' },
] as const;

export type LabPageId = (typeof LAB_PAGES)[number]['id'];

/** The page a `#lab…` hash opens: the tiles for `#lab` and anything it doesn't know. */
export function labPageOf(hash: string): LabPageId {
  const id = hash.match(/^#lab\/([\w-]+)/)?.[1];
  return LAB_PAGES.find((p) => p.id === id)?.id ?? 'tiles';
}

const hrefOf = (id: LabPageId) => (id === 'tiles' ? '#lab' : `#lab/${id}`);

/** The Art Lab's top bar: page tabs and the way back (each page keeps its controls on the page). */
export function LabHeader({ page }: { page: LabPageId }) {
  return (
    <header className="lab-head">
      <h1>Art Lab</h1>
      <nav className="lab-tabs">
        {LAB_PAGES.map((p) => (
          <a key={p.id} href={hrefOf(p.id)} className={p.id === page ? 'on' : ''}>
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
