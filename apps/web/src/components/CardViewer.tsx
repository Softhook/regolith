import type { ReactNode } from 'react';
import { card } from '@regolith/engine';
import { useCardImage } from '../art/useCardImages';
import { Dialog } from './Dialog';

/** A card as printed, with its illustration. */
export function CardArt({ id, size, badge }: { id: string; size: 'md' | 'lg'; badge?: string }) {
  const src = useCardImage(id);
  const def = { name: card(id).name, text: card(id).text };
  return (
    <div className={`card-art card-art-${size}`}>
      {src ? (
        <img src={src} alt={`${def.name}: ${def.text}`} title={`${def.name} — ${def.text}`} />
      ) : (
        <span className="card-art-ph" aria-label={def.name} />
      )}
      {badge && <span className="card-art-badge">{badge}</span>}
    </div>
  );
}

/** Shows a single card large, or a pile of cards grouped by name (so a deck's draw order stays hidden). */
export function CardViewer({
  title,
  subtitle,
  cards,
  single,
  onClose,
  action,
}: {
  title: string;
  subtitle?: string;
  cards: string[];
  single?: boolean;
  onClose: () => void;
  action?: ReactNode;
}) {
  const counts = new Map<string, number>();
  for (const id of cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  const ids = [...counts.keys()].sort((a, b) => card(a).name.localeCompare(card(b).name));

  return (
    <Dialog title={title} subtitle={subtitle} wide={!single} bare={single && !action} className="card-viewer" onClose={onClose}>
      <div className="card-choice wrap">
        {ids.map((id) => (
          <CardArt key={id} id={id} size={single ? 'lg' : 'md'} badge={counts.get(id)! > 1 ? `×${counts.get(id)}` : undefined} />
        ))}
      </div>
      {action && <div className="modal-actions card-viewer-action">{action}</div>}
    </Dialog>
  );
}
