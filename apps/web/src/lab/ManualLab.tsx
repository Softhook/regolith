import { useRef } from 'react';
import { Manual } from '../rulebook/Manual';
import { ManualExports } from '../rulebook/Rulebook';
import css from '../rulebook/rulebook.css?raw';
import { LabHeader } from './LabHeader';

/**
 * Art Lab, manual page (#lab/manual): the printable manual (the same page as #rulebook) on the left, its
 * paper and exports on the side.
 */
export function ManualLab() {
  const page = useRef<HTMLDivElement>(null);

  return (
    <div className="lab lab-manual">
      <style>{css}</style>
      <LabHeader page="manual" />
      <div className="lab-page">
        <div className="rb-page" ref={page}>
          <Manual />
        </div>
        <div className="lab-side lab-detail">
          <div className="lab-controls">
            <ManualExports page={page} />
          </div>
        </div>
      </div>
    </div>
  );
}
