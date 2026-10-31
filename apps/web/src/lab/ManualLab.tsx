import { useRef } from 'react';
import { Manual } from '../rulebook/Manual';
import { ManualExports } from '../rulebook/Rulebook';
import css from '../rulebook/rulebook.css?raw';
import { LabPage } from './LabPage';

/**
 * Art Lab, manual page (#lab/manual): the printable manual (the same page as #rulebook) on the left, its
 * paper and exports on the side.
 */
export function ManualLab() {
  const page = useRef<HTMLDivElement>(null);

  return (
    <LabPage
      page="manual"
      className="lab-manual"
      sticky
      main={
        <div className="rb-page" ref={page}>
          <Manual />
        </div>
      }
    >
      <style>{css}</style>
      <div className="lab-controls">
        <ManualExports page={page} />
      </div>
    </LabPage>
  );
}
