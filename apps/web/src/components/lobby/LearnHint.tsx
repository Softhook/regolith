import { useState } from 'react';
import { remember, stored } from '../../storage';
import { appKey } from '../../appId';

/** A dismissed hint, remembered between visits. */
const LEARN_HINT_KEY = appKey('learnHint');

/** Whether the hint is still up, and how to dismiss it (remembered between visits). */
export function useLearnHint() {
  const [shown, setShown] = useState(() => !stored(LEARN_HINT_KEY));
  const dismiss = () => {
    remember(LEARN_HINT_KEY, 'dismissed');
    setShown(false);
  };
  return { shown, dismiss };
}

/**
 * A little box above the new game offering the demo (tutorial/Tutorial.tsx), until it is dismissed with its cross.
 * Once it is, a "Tutorial" button at the bottom of the lobby takes its place, to find it again.
 */
export function LearnHint({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  return (
    <div className="home-hint learn-hint" role="note">
      <div className="home-hint-body">
        <strong>New to Regolith?</strong>
        <span>A short animated tutorial teaches you how to play.</span>
      </div>
      <button className="btn btn-primary" onClick={onOpen}>
        Tutorial
      </button>
      <button className="icon-btn" aria-label="Dismiss" title="Dismiss" onClick={onDismiss}>
        <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M3 3l8 8M11 3l-8 8" />
        </svg>
      </button>
    </div>
  );
}
