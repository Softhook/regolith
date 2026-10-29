import { useState } from 'react';
import { remember, stored } from '../../storage';
import { appKey } from '../../appId';

/** A dismissed hint, remembered between visits. */
const LEARN_HINT_KEY = appKey('learnHint');

/**
 * A little box above the new game offering the demo (tutorial/Tutorial.tsx), until it is dismissed with its cross.
 * The "Watch the demo" button at the bottom of the lobby stays, to find it again.
 */
export function LearnHint({ onOpen }: { onOpen: () => void }) {
  const [shown, setShown] = useState(() => !stored(LEARN_HINT_KEY));
  if (!shown) return null;
  const dismiss = () => {
    remember(LEARN_HINT_KEY, 'dismissed');
    setShown(false);
  };
  return (
    <div className="home-hint learn-hint" role="note">
      <div className="home-hint-body">
        <strong>New to Regolith?</strong>
        <span>A two-minute animated demo teaches you how to play.</span>
      </div>
      <button className="btn btn-primary" onClick={onOpen}>
        Learn to play
      </button>
      <button className="icon-btn" aria-label="Dismiss" title="Dismiss" onClick={dismiss}>
        <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M3 3l8 8M11 3l-8 8" />
        </svg>
      </button>
    </div>
  );
}
