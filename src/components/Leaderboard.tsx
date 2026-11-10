import { useEffect, useRef, useState } from 'react';
import { Boards, fetchBoards, Period, PERIODS, PostResult, postErrorText, postToBoards, timeLeft } from '../board';
import { formatStars } from '../engine/engine';
import { trackExtra } from '../telemetry';
import { metaTrack } from '../metaPixel';

interface Props {
  /** Results screen: the finished menu that can be posted. Omit to just browse. */
  entry?: { score: number; dishIds: string[]; restaurantName: string; onRestaurantName: (s: string) => void };
  /** Re-fetch when this changes (e.g. a new game finished). */
  refreshKey?: string;
}

const PERIOD_IN: Record<Period, string> = { day: 'today', week: 'this week', month: 'this month', all: 'all time' };

export function Leaderboard({ entry, refreshKey }: Props) {
  const [boards, setBoards] = useState<Boards | null | 'loading'>('loading');
  const [period, setPeriod] = useState<Period>('day');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [posted, setPosted] = useState<PostResult | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const score = entry?.score;
  useEffect(() => {
    let live = true;
    setBoards('loading');
    setPosted(null);
    setError('');
    fetchBoards(score).then((b) => {
      if (!live) return;
      setBoards(b);
      // A returning poster's name fills the (empty) restaurant name field.
      if (b?.name && entry && !entry.restaurantName.trim()) entry.onRestaurantName(b.name);
    });
    return () => {
      live = false;
    };
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The board is a bonus: if it can't be reached, the section simply isn't there.
  if (boards === null) return null;

  async function post() {
    if (!entry) return;
    const name = entry.restaurantName.trim();
    if (!name) {
      setError('Enter your restaurant name to post your menu.');
      nameRef.current?.focus();
      return;
    }
    setPosting(true);
    setError('');
    const r = await postToBoards(name, entry.dishIds);
    setPosting(false);
    if (!r.ok) {
      setError(postErrorText(r.error));
      return;
    }
    setPosted(r.result);
    trackExtra('board_posted', true);
    metaTrack('SubmitApplication');
    const fresh = await fetchBoards(entry.score);
    if (fresh) setBoards(fresh);
  }

  const p = boards === 'loading' ? null : boards.periods[period];

  return (
    <section className="board" aria-labelledby="board-title">
      <div className="board-head">
        <h2 id="board-title">Leaderboard</h2>
        {p?.endsAt && <span className="board-reset">Resets in {timeLeft(p.endsAt)}</span>}
      </div>

      <div className="board-tabs" role="group" aria-label="Leaderboard period">
        {PERIODS.map(({ key, label }) => (
          <button key={key} type="button" className={key === period ? 'active' : ''} aria-pressed={key === period} onClick={() => setPeriod(key)}>
            {label}
          </button>
        ))}
      </div>

      {entry && p && !posted && (
        <div className="board-post">
          <p>
            Your <strong>{formatStars(entry.score)}</strong>{' '}
            {p.wouldRank ? (
              <>
                would place <strong>#{p.wouldRank}</strong> {PERIOD_IN[period]}
              </>
            ) : (
              <>can go on the board</>
            )}
            .
          </p>
          <label className="board-name-field">
            <span>Restaurant name</span>
            <input
              ref={nameRef}
              type="text"
              maxLength={28}
              value={entry.restaurantName}
              placeholder="e.g. The Linen Table"
              onChange={(e) => entry.onRestaurantName(e.target.value)}
            />
          </label>
          <button type="button" className="btn primary" onClick={post} disabled={posting}>
            {posting ? 'Posting…' : 'Post my menu'}
          </button>
        </div>
      )}
      {posted && (
        <p className="board-posted" role="status">
          Posted! #{posted.ranks.day} today · #{posted.ranks.week} this week · #{posted.ranks.month} this month · #{posted.ranks.all} all time
        </p>
      )}
      {error && (
        <p className="board-error" role="alert">
          {error}
        </p>
      )}

      {boards === 'loading' ? (
        <p className="board-empty">Loading…</p>
      ) : p && p.top.length === 0 ? (
        <p className="board-empty">No one has posted {PERIOD_IN[period]} yet. Be the first.</p>
      ) : (
        p && (
          <ol className="board-list">
            {p.top.map((r) => (
              <li key={r.rank} className={r.you ? 'you' : ''}>
                <span className="board-rank">#{r.rank}</span>
                <span className="board-name">
                  {r.name}
                  {r.you && <span className="board-you"> (you)</span>}
                </span>
                <span className="board-score">★ {formatStars(r.score)}</span>
              </li>
            ))}
            {p.you && p.you.rank > 10 && (
              <li className="you board-gap">
                <span className="board-rank">#{p.you.rank}</span>
                <span className="board-name">
                  {(boards as Boards).name}
                  <span className="board-you"> (you)</span>
                </span>
                <span className="board-score">★ {formatStars(p.you.score)}</span>
              </li>
            )}
          </ol>
        )
      )}
      {p && p.total > 0 && (
        <p className="board-total">
          {p.total} restaurant{p.total === 1 ? '' : 's'} {PERIOD_IN[period]}. One entry each: their best menu.
        </p>
      )}
    </section>
  );
}
