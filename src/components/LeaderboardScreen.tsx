import { useEffect, useRef } from 'react';
import { Leaderboard } from './Leaderboard';

interface Props {
  onBack: () => void;
  /** A finished, postable menu (when opened from the results screen). */
  entry?: { score: number; dishIds: string[]; restaurantName: string; onRestaurantName: (s: string) => void };
  refreshKey: string;
}

/** The leaderboards as their own screen (#leaderboard), reached from the top bar, the
 *  results screen and the title screen. The phone's back button closes it. */
export function LeaderboardScreen({ onBack, entry, refreshKey }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus();
  }, []);

  return (
    <div className="board-screen">
      <header className="topbar board-topbar">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to the game">
          <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 ref={headingRef} tabIndex={-1}>
          Leaderboards
        </h1>
      </header>
      <main className="board-main">
        <Leaderboard entry={entry} refreshKey={refreshKey} />
        <button type="button" className="link-btn board-back" onClick={onBack}>
          Back to the game
        </button>
      </main>
    </div>
  );
}
