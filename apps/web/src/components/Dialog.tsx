import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A modal that must be answered: no × button, and Escape or a backdrop click do nothing. `pc` is the
 * player colour its accents take. `aria-modal` also tells the global shortcuts to stand down.
 */
export function Modal({
  title,
  subtitle,
  pc,
  wide,
  className = '',
  children,
}: {
  title: string;
  subtitle?: string;
  pc?: string;
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <div className="overlay">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal ${wide ? 'wide' : ''} ${className}`}
        style={{ '--pc': pc ?? 'var(--accent)' } as CSSProperties}
      >
        <h2 id={titleId}>{title}</h2>
        {subtitle && <p className="modal-sub">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

/** A yes-or-no question before something that can't be undone; Escape, the backdrop or × say no. */
export function Confirm({
  title,
  message,
  yes,
  onYes,
  onNo,
}: {
  title: string;
  message: string;
  yes: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <Dialog title={title} subtitle={message} onClose={onNo}>
      <div className="modal-actions">
        <button className="btn" onClick={onNo}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={onYes}>
          {yes}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * A dismissable modal: closes on Escape, a backdrop click or the × button, and returns focus to
 * whatever opened it. Portalled to <body> so ancestors with backdrop-filter (e.g. .panel) can't
 * trap the fixed overlay. `aria-modal` also tells the global undo shortcut to stand down.
 * A `bare` dialog shows only its content over the backdrop (no box, heading or × button), and any
 * click closes it.
 */
export function Dialog({
  title,
  subtitle,
  wide,
  bare,
  className = '',
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  wide?: boolean;
  bare?: boolean;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const bareRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    (closeRef.current ?? bareRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, []);

  if (bare) {
    return createPortal(
      <div className="overlay" onClick={onClose}>
        <div
          ref={bareRef}
          role="dialog"
          aria-modal="true"
          aria-label={subtitle ? `${title}: ${subtitle}` : title}
          tabIndex={-1}
          className={`dialog-bare ${className}`}
        >
          {children}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal dialog ${wide ? 'wide' : ''} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} className="icon-btn dialog-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id={titleId}>{title}</h2>
        {subtitle && <p className="modal-sub">{subtitle}</p>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
