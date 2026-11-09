import { useEffect, useRef, useState } from 'react';
import { catalog, COURSE_LABEL, COURSES, getDish } from '../engine/catalog';
import { formatMoney, formatRating, formatStars, remainingCents, RunState, scoreHundredths } from '../engine/engine';
import { loadBest, PersonalBest, recordBest } from '../engine/persist';
import { Table } from './Table';
import { StarIcon } from '../art/icons';
import { copyText, downloadBlob, nativeShare, shareImage, shareText } from '../share';
import { trackShare } from '../telemetry';

interface Props {
  run: RunState;
  restaurantName: string;
  onRestaurantName: (s: string) => void;
  onCookAgain: () => void;
  onOpenBoard: () => void;
}

function StarRow({ hundredths }: { hundredths: number }) {
  return (
    <span className="star-row" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, hundredths / 100 - i));
        return (
          <span className="star-cell" key={i}>
            <StarIcon className="star empty" />
            <span className="star-fill" style={{ width: `${fill * 100}%` }}>
              <StarIcon className="star full" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function Results({ run, restaurantName, onRestaurantName, onCookAgain, onOpenBoard }: Props) {
  const hundredths = scoreHundredths(run.picks);
  const saved = remainingCents(run);
  const dishes = COURSES.map((c) => run.picks.map(getDish).find((d) => d.course === c)!);

  // Read the previous best once, before this run is recorded.
  const [prevBest] = useState<PersonalBest | null>(() => loadBest());
  const isSameRecord = prevBest?.dishIds.join() === run.picks.join() && prevBest?.hundredths === hundredths;
  const isBest =
    !prevBest ||
    isSameRecord ||
    hundredths > prevBest.hundredths ||
    (hundredths === prevBest.hundredths && saved > prevBest.savedCents);

  useEffect(() => {
    recordBest({ hundredths, savedCents: saved, dishIds: run.picks, date: new Date().toISOString().slice(0, 10) });
  }, [run.seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const [shareStatus, setShareStatus] = useState<string>('');
  const [fallback, setFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);


  async function onShare() {
    setBusy(true);
    setShareStatus('');
    const text = shareText(run.picks, restaurantName);
    const image = await shareImage(run.picks, restaurantName);
    const outcome = await nativeShare(text, image);
    setBusy(false);
    trackShare(outcome);
    if (outcome === 'unsupported') {
      setFallback(true);
      setShareStatus('Sharing isn’t available here. Copy the text or save the image instead.');
    } else if (outcome === 'shared') setShareStatus('Shared.');
  }

  async function onCopy() {
    const ok = await copyText(shareText(run.picks, restaurantName));
    if (ok) trackShare('copied');
    setShareStatus(ok ? 'Menu copied to clipboard.' : 'Copy failed. Select the text below instead.');
  }

  async function onDownload() {
    const image = await shareImage(run.picks, restaurantName);
    if (image) {
      downloadBlob(image, 'my-opening-night-menu.png');
      trackShare('downloaded');
      setShareStatus('Image saved.');
    } else setShareStatus('Could not create the image on this device.');
  }

  return (
    <section className="results" aria-labelledby="results-title">
      <h1 id="results-title" className="results-title" tabIndex={-1} ref={headingRef}>
        {restaurantName.trim() || 'Opening night'}
      </h1>

      <div className="score-block">
        <p className="score">
          <span className="score-num">{formatStars(hundredths)}</span>
          <span className="score-of"> / 5</span>
          <span className="sr-only"> stars</span>
        </p>
        <StarRow hundredths={hundredths} />
        <p className="score-sub">
          Spent {formatMoney(catalog.config.budgetCents - saved)} · {formatMoney(saved)} saved
        </p>
        <p className="best-line">
          {isBest ? (
            <strong>Personal best!</strong>
          ) : (
            <>Personal best: {formatStars(prevBest!.hundredths)}</>
          )}
        </p>
      </div>

      {/* Actions right under the score, so Cook again is above the fold; menu details follow. */}
      <label className="name-field">
        <span>Name your restaurant (optional, for sharing)</span>
        <input
          type="text"
          maxLength={40}
          value={restaurantName}
          placeholder="e.g. The Linen Table"
          onChange={(e) => onRestaurantName(e.target.value)}
        />
      </label>

      <div className="results-actions">
        <button type="button" className="btn primary" onClick={onCookAgain}>
          Cook again
        </button>
        <button type="button" className="btn secondary" onClick={onShare} disabled={busy}>
          {busy ? 'Preparing…' : 'Share menu'}
        </button>
        <button type="button" className="btn secondary" onClick={onOpenBoard}>
          Post to leaderboard
        </button>
      </div>

      {fallback && (
        <div className="share-fallback">
          <button type="button" className="btn secondary" onClick={onCopy}>
            Copy text
          </button>
          <button type="button" className="btn secondary" onClick={onDownload}>
            Download image
          </button>
          <textarea readOnly rows={5} value={shareText(run.picks, restaurantName)} aria-label="Share text" />
        </div>
      )}
      <p className="share-status" role="status">
        {shareStatus}
      </p>
      <Table picks={run.picks} compact />

      <table className="menu-card">
        <caption>Your five-course menu</caption>
        <thead>
          <tr>
            <th scope="col">Course</th>
            <th scope="col">Dish</th>
            <th scope="col" className="num">Cost</th>
            <th scope="col" className="num">Stars</th>
          </tr>
        </thead>
        <tbody>
          {dishes.map((d) => (
            <tr key={d.id}>
              <th scope="row">{COURSE_LABEL[d.course]}</th>
              <td>
                {d.name}
                <span className="menu-cuisine"> · {d.cuisine}</span>
              </td>
              <td className="num">{formatMoney(d.costCents)}</td>
              <td className="num">{formatRating(d.ratingTenths)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td>Average of five courses</td>
            <td className="num">{formatMoney(catalog.config.budgetCents - saved)}</td>
            <td className="num">{formatStars(hundredths)}</td>
          </tr>
        </tfoot>
      </table>

    </section>
  );
}
