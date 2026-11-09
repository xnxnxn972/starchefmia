import { useEffect, useReducer, useRef, useState } from 'react';
import { catalog, COURSE_SHORT, getDish } from './engine/catalog';
import {
  finishReveal,
  finishServing,
  formatMoney,
  isLegal,
  newRun,
  purchase,
  remainingCents,
  RunState,
  type Offer,
} from './engine/engine';
import { loadPrefs, loadRun, Prefs, saveRun, savePrefs, loadBest, type PersonalBest } from './engine/persist';
import { freshSeed } from './engine/rng';
import { trackExtra, trackGameEnd, trackGameStart, trackPick } from './telemetry';
import { playRevealSound, unlockAudio } from './sound';
import { Table } from './components/Table';
import { Inspiration } from './components/Inspiration';
import { Offers } from './components/Offers';
import { Results } from './components/Results';
import { HelpDialog, SettingsDialog } from './components/Dialogs';
import { LeaderboardScreen } from './components/LeaderboardScreen';
import { CHEF_NAME, TIMING } from './config';
import { inspirationAnnouncement, miaFor } from './copy';
import { formatStars, scoreHundredths } from './engine/engine';

interface State {
  run: RunState | null;
  selected: string | null;
  lastServed: string | null;
  announce: string;
  /** The turn just served. Its labels stay on screen while the food is placed; the next
   *  turn's offer is already drawn (and saved) but must not show until its reveal. */
  prevOffer: Offer | null;
}

type Action =
  | { type: 'start'; seed: number }
  | { type: 'select'; id: string | null }
  | { type: 'commit'; id: string }
  | { type: 'servingDone' }
  | { type: 'revealDone'; turn: number }
  | { type: 'quit' };

function reducer(state: State, action: Action): State {
  const run = state.run;
  switch (action.type) {
    case 'start': {
      const r = newRun(action.seed);
      return { run: r, selected: null, lastServed: null, announce: '', prevOffer: null };
    }
    case 'select':
      if (!run || run.phase !== 'choosing') return state;
      if (action.id && !run.offer?.dishIds.includes(action.id)) return state;
      return { ...state, selected: action.id };
    case 'commit': {
      if (!run || run.phase !== 'choosing') return state; // stale / double confirm
      const res = purchase(run, action.id);
      if (!res.ok) return state;
      const d = getDish(action.id);
      return {
        run: res.run,
        selected: null,
        lastServed: action.id,
        prevOffer: run.offer,
        announce: `Served ${d.name} as ${COURSE_SHORT[d.course]}. ${formatMoney(remainingCents(res.run))} left.`,
      };
    }
    case 'servingDone': {
      if (!run || run.phase !== 'serving') return state;
      const next = finishServing(run);
      return {
        ...state,
        run: next,
        announce:
          next.phase === 'results'
            ? `Menu complete. ${formatStars(scoreHundredths(next.picks))} out of 5 stars.`
            : state.announce,
      };
    }
    case 'revealDone': {
      if (!run || run.phase !== 'revealing' || run.offer?.turn !== action.turn) return state;
      const next = finishReveal(run);
      return { ...state, run: next, announce: inspirationAnnouncement(next) };
    }
    case 'quit':
      return { run: null, selected: null, lastServed: null, announce: '', prevOffer: null };
  }
}

function initState(): State & { restoreFailed: boolean } {
  const r = loadRun();
  if (r.kind === 'ok') {
    return { run: r.run, selected: null, lastServed: r.run.picks[r.run.picks.length - 1] ?? null, announce: '', prevOffer: null, restoreFailed: false };
  }
  return { run: null, selected: null, lastServed: null, announce: '', prevOffer: null, restoreFailed: r.kind === 'invalid' };
}

function useSystemReducedMotion() {
  const [v, setV] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const fn = () => setV(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return v;
}

export function App() {
  const [init] = useState(initState);
  const [state, dispatch] = useReducer(reducer, init);
  const [restoreFailed, setRestoreFailed] = useState(init.restoreFailed);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [helpOpen, setHelpOpen] = useState(false);

  // The leaderboards are their own screen at #leaderboard, so the phone's back button closes them.
  const [boardOpen, setBoardOpen] = useState(() => typeof location !== 'undefined' && location.hash === '#leaderboard');
  const boardPushed = useRef(false);
  useEffect(() => {
    const sync = () => setBoardOpen(location.hash === '#leaderboard');
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  function openBoard() {
    boardPushed.current = true;
    location.hash = 'leaderboard';
  }
  function closeBoard() {
    if (boardPushed.current) {
      boardPushed.current = false;
      history.back(); // undo our own history entry, same as the phone's back button
    } else {
      // Arrived straight on #leaderboard: drop the hash without leaving the site.
      history.replaceState(null, '', location.pathname + location.search);
      setBoardOpen(false);
    }
  }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const systemReduced = useSystemReducedMotion();
  const reduceMotion = systemReduced || prefs.reduceMotion;
  const { run, selected, lastServed } = state;

  // Persist every engine state change (offer is saved before its reveal animation plays).
  useEffect(() => {
    if (run) saveRun(run);
  }, [run]);

  useEffect(() => savePrefs(prefs), [prefs]);

  // Play log. Effects keyed on engine state, so the pure reducer stays pure and a
  // restored game updates its own row (the row id derives from the run's seed).
  const seed = run?.seed;
  useEffect(() => {
    if (!run) return;
    trackGameStart(run.seed, { resumed: true, picks: run.picks.length, spentCents: run.spentCents });
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickCount = run?.picks.length ?? 0;
  useEffect(() => {
    if (!run || pickCount === 0) return;
    trackPick(pickCount, run.spentCents, run.picks, run.picks.map((id) => getDish(id).course));
  }, [seed, pickCount]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (run?.phase === 'results') trackGameEnd(scoreHundredths(run.picks), run.spentCents);
  }, [seed, run?.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const named = prefs.restaurantName.trim().length > 0;
  useEffect(() => {
    if (run?.phase === 'results') trackExtra('named', named);
  }, [named, run?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Turn-transition timers. They only advance phases; offers are drawn in the reducer.
  const phase = run?.phase;
  const turn = run?.offer?.turn ?? 0;
  useEffect(() => {
    if (phase === 'serving') {
      const t = window.setTimeout(
        () => dispatch({ type: 'servingDone' }),
        reduceMotion ? TIMING.reducedMs : TIMING.serveMs + TIMING.servePauseMs,
      );
      return () => window.clearTimeout(t);
    }
    if (phase === 'revealing') {
      const t = window.setTimeout(() => dispatch({ type: 'revealDone', turn }), reduceMotion ? TIMING.reducedMs : TIMING.revealMs);
      return () => window.clearTimeout(t);
    }
  }, [phase, turn, reduceMotion]);

  // Reveal sound: only for reveals the player caused (Start cooking / Serve), never for a
  // game restored on load, and not with reduced motion (the labels don't roll then).
  const userActed = useRef(false);
  useEffect(() => {
    if (phase === 'revealing' && userActed.current && !prefs.muted && !reduceMotion) playRevealSound();
  }, [phase, turn]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleMute() {
    unlockAudio();
    setPrefs((p) => ({ ...p, muted: !p.muted }));
    trackExtra('sound_muted', !prefs.muted);
  }

  // Move focus to the offers once a reveal settles, so keyboard users land on the choices.
  const offersRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase === 'choosing') offersRef.current?.querySelector<HTMLButtonElement>('.offer:not(:disabled)')?.focus({ preventScroll: true });
  }, [phase, turn]);
  // Height of the dish list when Serve was tapped, held until the next list appears.
  const [holdHeight, setHoldHeight] = useState<number | null>(null);
  useEffect(() => {
    if (phase === 'choosing' || !phase) setHoldHeight(null);
  }, [phase, turn]);

  function start() {
    unlockAudio();
    userActed.current = true;
    setRestoreFailed(false);
    const s = freshSeed();
    trackGameStart(s);
    dispatch({ type: 'start', seed: s });
    window.scrollTo(0, 0);
  }

  const mia = miaFor(run, selected, lastServed);

  if (boardOpen) {
    return (
      <LeaderboardScreen
        onBack={closeBoard}
        refreshKey={run ? `${run.seed}-${run.phase}` : 'none'}
        entry={
          run?.phase === 'results'
            ? {
                score: scoreHundredths(run.picks),
                dishIds: run.picks,
                restaurantName: prefs.restaurantName,
                onRestaurantName: (s) => setPrefs((p) => ({ ...p, restaurantName: s })),
              }
            : undefined
        }
      />
    );
  }

  if (!run) {
    return (
      <Intro
        onBoard={openBoard}
        onStart={start}
        restoreFailed={restoreFailed}
        miaLine={mia.line}
        onHelp={() => setHelpOpen(true)}
        helpOpen={helpOpen}
        onCloseHelp={() => setHelpOpen(false)}
      />
    );
  }

  const remaining = remainingCents(run);
  const selDish = selected ? getDish(selected) : null;
  const selLegal = selected ? isLegal(run, selected) : false;
  const pickNo = Math.min(run.picks.length + (run.phase === 'serving' ? 0 : 1), catalog.config.picks);
  const servedCourse = run.phase === 'serving' && lastServed ? getDish(lastServed).course : null;
  // While the food is placed, keep the turn just played on screen; the next offer waits for its reveal.
  const shownOffer = run.phase === 'serving' ? state.prevOffer : run.offer;

  return (
    <div className={`app${reduceMotion ? ' reduce-motion' : ''}${run.phase === 'results' ? ' at-results' : ''}`}>
      <header className="topbar">
        <div className="pill budget" aria-label={`${formatMoney(remaining)} left`}>
          <WalletIcon /> <strong>{formatMoney(remaining)}</strong>
          <span className="pill-long">&nbsp;left</span>
        </div>
        <div className="pill progress" aria-label={run.phase === 'results' ? 'Menu complete' : `Pick ${pickNo} of 5`}>
          <ForkIcon />{' '}
          {run.phase === 'results' ? (
            <>
              <span className="pill-long">Complete</span>
              <span className="pill-short">5/5</span>
            </>
          ) : (
            <span>
              <span className="pill-long">Pick&nbsp;</span>
              {pickNo}
              <span className="pill-long">&nbsp;of 5</span>
              <span className="pill-short">/5</span>
            </span>
          )}
        </div>
        <div className="topbar-actions">
          <button type="button" className="icon-btn" onClick={openBoard} aria-label="Leaderboards" title="Leaderboards">
            <TrophyIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleMute}
            aria-pressed={prefs.muted}
            aria-label={prefs.muted ? 'Turn sound on' : 'Mute sound'}
            title={prefs.muted ? 'Turn sound on' : 'Mute sound'}
          >
            {prefs.muted ? <SoundOffIcon /> : <SoundOnIcon />}
          </button>
          <button type="button" className="icon-btn" onClick={() => setHelpOpen(true)} aria-label="How to play">
            ?
          </button>
          <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <GearIcon />
          </button>
        </div>
      </header>

      <main className="layout">
        <div className="scene">
          <SceneHead line={mia.line} mood={mia.mood} />
          <Table picks={run.picks} previewCourse={selDish?.course} servedCourse={servedCourse} />
        </div>

        <div className="play">
          {run.phase === 'results' ? (
            <Results
              run={run}
              restaurantName={prefs.restaurantName}
              onRestaurantName={(s) => setPrefs((p) => ({ ...p, restaurantName: s }))}
              onCookAgain={start}
              onOpenBoard={openBoard}
            />
          ) : shownOffer ? (
            <>
              <Inspiration offer={shownOffer} revealing={run.phase === 'revealing'} reduceMotion={reduceMotion} />
              {/* Dishes only while choosing: gone the moment Serve is tapped, back once the labels stop.
                  The wrapper keeps its height meanwhile so the page doesn't jump. */}
              <div ref={offersRef} className="offers-wrap" style={holdHeight ? { minHeight: holdHeight } : undefined}>
                {run.phase === 'choosing' && (
                  <Offers
                    run={run}
                    selected={selected}
                    disabled={run.phase !== 'choosing'}
                    onSelect={(id) => dispatch({ type: 'select', id })}
                  />
                )}
              </div>
            </>
          ) : null}
        </div>
      </main>

      {run.phase !== 'results' && (
        <footer className="actionbar">
          <p className="after-note">
            {selDish && selLegal ? `${formatMoney(remaining - selDish.costCents)} left after serving` : `${formatMoney(remaining)} to spend`}
          </p>
          <button
            type="button"
            className="btn primary serve"
            disabled={!selDish || !selLegal || run.phase !== 'choosing'}
            onClick={() => {
              if (!selected) return;
              setHoldHeight(offersRef.current?.offsetHeight ?? null);
              unlockAudio();
              userActed.current = true;
              dispatch({ type: 'commit', id: selected });
            }}
          >
            {run.phase === 'revealing'
              ? 'Finding inspiration…'
              : run.phase === 'serving'
                ? 'Serving…'
                : selDish
                  ? `Serve ${COURSE_SHORT[selDish.course]} · ${formatMoney(selDish.costCents)}`
                  : 'Choose a dish'}
          </button>
        </footer>
      )}

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {state.announce}
      </div>

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        reduceMotion={prefs.reduceMotion}
        systemReduced={systemReduced}
        onReduceMotion={(v) => setPrefs((p) => ({ ...p, reduceMotion: v }))}
        muted={prefs.muted}
        onToggleMute={toggleMute}
        onNewRun={() => {
          setSettingsOpen(false);
          start();
        }}
        onQuit={() => {
          setSettingsOpen(false);
          saveRun(null);
          dispatch({ type: 'quit' });
        }}
      />
    </div>
  );
}

export function Intro(props: {
  onStart: () => void;
  restoreFailed: boolean;
  miaLine: string;
  onHelp: () => void;
  onBoard: () => void;
  helpOpen: boolean;
  onCloseHelp: () => void;
}) {
  // Read after mount so the first render matches the pre-rendered HTML exactly (hydration).
  const [best, setBest] = useState<PersonalBest | null>(null);
  useEffect(() => setBest(loadBest()), []);
  const preview = ['in-main-02', 'fr-soup-02', 'it-appetizer-01', 'mx-salad-02', 'jp-dessert-02'];
  return (
    <main className="intro">
      <div className="scene intro-scene">
        <SceneHead line={props.miaLine} mood="welcome" />
        <div className="brand">
          <ToqueIcon />
          <h1>
            <span className="brand-name">5-Star Chef Restaurant</span>
          </h1>
          <p className="brand-studio">by {catalog.studio}</p>
        </div>
        <div className="intro-table" aria-hidden="true">
          <Table picks={preview} compact />
        </div>
      </div>
      {/* Beside the scene on wide screens (so Start is above the fold), below it on phones. */}
      <div className="intro-pitch">
        <p className="tagline">Five picks. Fifty dollars. Your five-star dinner.</p>
        <p className="intro-explain">Build five courses within $50. Your choices become your restaurant’s rating.</p>
        {props.restoreFailed && (
          <p className="notice" role="status">
            Your previous table couldn’t be restored, so let’s start a fresh one.
          </p>
        )}
        <button type="button" className="btn primary big" onClick={props.onStart}>
          Start cooking
        </button>
        <div className="intro-links">
          <button type="button" className="link-btn" onClick={props.onHelp}>
            How to play
          </button>
          <button type="button" className="link-btn" onClick={props.onBoard}>
            Leaderboard
          </button>
        </div>
        {best && <p className="best-line">Personal best: {formatStars(best.hundredths)} / 5</p>}
        <p className="fineprint">Prices and ratings are fictional game values.</p>
      </div>
      <AboutGame />
      <HelpDialog open={props.helpOpen} onClose={props.onCloseHelp} />
    </main>
  );
}

/**
 * Real, crawlable text about the game, below the Start button. It is part of the
 * pre-rendered HTML (tools/prerender.mjs), so search engines read it without
 * running any JavaScript. Keep it true to the game: every fact here is checkable.
 */
function AboutGame() {
  return (
    <section className="about" aria-labelledby="about-title">
      <h2 id="about-title">A free restaurant menu game you can play in your browser</h2>
      <p>
        You are opening a restaurant, and tonight is opening night. Chef Mia hands you a budget of $50 per guest. Your job is to
        build a five-course dinner (appetizer, soup, salad, main course and dessert) and see how many stars your menu earns.
      </p>
      <h3>How to play</h3>
      <ol>
        <li>Each turn, Chef Mia reveals today’s inspiration: a cuisine and an ingredient, such as Italian and lemon or Indian and mango.</li>
        <li>Pick one of the matching dishes. Every dish shows its course, its cost and its star rating.</li>
        <li>Serve it to fill that course. Courses can be filled in any order, but a served course is final.</li>
        <li>After five picks, your restaurant’s rating is the average of your five dishes, shown to two decimals.</li>
      </ol>
      <p>
        The game always keeps enough money aside to finish every course, so the strategy is choosing when to spend on a
        five-star dish and when to save. A perfect 5.00 menu exists, but you will need luck to be offered it.
      </p>
      <h3>What’s on the menu</h3>
      <p>
        90 illustrated dishes from six cuisines: Italian, French, Japanese, Indian, Mexican and American, built from 25
        ingredients, from butter chicken and beef bourguignon to tiramisu and strawberry daifuku. A game takes about a minute
        and a half, so it is easy to cook again and chase a better score.
      </p>
      <h3>Play anywhere</h3>
      <p>
        5-Star Chef Restaurant works on phones, tablets and computers with no download or sign-up. Add it to your home
        screen to play it like an app, even offline. When your dinner is done, share your menu and star rating with friends.
      </p>
      <p className="fineprint">Made by 5 Star Studios. Dish prices and ratings are fictional game values.</p>
    </section>
  );
}

/** Wall + Chef Mia come from the background image; only her speech bubble and name tag are live elements. */
function SceneHead({ line, mood }: { line: string; mood: string }) {
  return (
    <div className={`scene-head mood-${mood}`}>
      <p className="bubble" key={line} aria-hidden="true">
        {line}
      </p>
      <span className="mia-tag">{CHEF_NAME}</span>
    </div>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SoundOnIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function SoundOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
      <path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7zm0 0 11-3v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="16" cy="13.5" r="1.4" fill="currentColor" />
    </svg>
  );
}
function ForkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
      <path d="M7 3v7m-2-7v5a2 2 0 0 0 4 0V3M7 10v11M16 3c-2 1.5-2.5 5-2.5 7.5H16V21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function ToqueIcon() {
  return (
    <svg viewBox="0 0 64 56" className="toque" aria-hidden="true">
      <path
        d="M16 40c-8-2-12-9-9-16 3-6 10-8 15-5 2-7 8-11 15-10 7 1 11 6 12 12 6-3 13 1 14 8 1 7-4 12-11 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path d="M16 40v8h36v-8" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
    </svg>
  );
}
