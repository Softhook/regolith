import { Manual } from '../rulebook/Manual';
import css from '../rulebook/rulebook.css?raw';
import { Dialog } from './Dialog';

/** "How to play": the manual itself, the same one #rulebook prints. */
export function Rules({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="How to play" wide className="manual-dialog" onClose={onClose}>
      <style>{css}</style>
      <Manual dark drawMapsWhenNear />
    </Dialog>
  );
}
