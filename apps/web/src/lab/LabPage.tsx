import type { ReactNode } from 'react';
import { LabHeader, type LabPageId } from './LabHeader';

/**
 * A one-sheet Art Lab page: the top bar, the sheet (`main`) on the left and its options and exports (the
 * children) on the side. `sticky` keeps the side in view while a long sheet scrolls.
 */
export function LabPage({
  page,
  main,
  className,
  sticky,
  children,
}: {
  page: LabPageId;
  main: ReactNode;
  className?: string;
  sticky?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={className ? `lab ${className}` : 'lab'}>
      <LabHeader page={page} />
      <div className="lab-page">
        {main}
        <div className={sticky ? 'lab-side lab-detail' : 'lab-side'}>{children}</div>
      </div>
    </div>
  );
}
