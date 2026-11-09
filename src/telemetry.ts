/**
 * Play log: one row per GAME in public.sc_games, one row per arrival in
 * public.sc_loads (see supabase/starchef-telemetry.sql). Modelled on Chasing
 * P1's telemetry, keeping the rules that one learned the hard way:
 *
 *  1. Never break or delay the game. Every call is fire-and-forget and silent
 *     on failure (offline, blocked, table missing).
 *  2. No personal data. No IP, no location lookup from the browser (Google Safe
 *     Browsing once flagged Chasing P1 as deceptive for exactly that). Country
 *     is derived server-side from the request. Nothing the player types is sent.
 *  3. Nothing is written for a game until the visitor actually does something,
 *     which keeps crawlers out of the games data. Arrivals are counted
 *     separately in sc_loads so bounces stay measurable.
 *  4. Our own testing is excluded at the source: open the site once with
 *     ?dev=1 in any browser you test with (and ?dev=0 to undo).
 *  5. The last update of a game goes out with `keepalive` on page hide, the
 *     only thing that reliably survives a mobile browser being backgrounded.
 */

const SUPABASE_URL = 'https://hmvxanqkorcfxwsdusuj.supabase.co';
// Public anon key (same shared project as the other games); safe by design.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdnhhbnFrb3JjZnh3c2R1c3VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjI4OTgsImV4cCI6MjA5NTI5ODg5OH0.7o7OnhikQdgApqPTEIbhjOZ-YcKDU1fBFpcLXPXtEtA';
const GAME_RPC = `${SUPABASE_URL}/rest/v1/rpc/sc_log_game`;
const LOAD_RPC = `${SUPABASE_URL}/rest/v1/rpc/sc_log_load`;

declare const __APP_VERSION__: string;

const DEV_KEY = 'sc.dev';
const VISIT_KEY = 'sc.visit.v1';
const PLAYER_KEY = 'sc.player.v1';
const VISIT_IDLE_MS = 30 * 60 * 1000;

function store<T>(key: string, value?: T): T | null {
  try {
    if (value === undefined) {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  } catch {
    return null;
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function query(): URLSearchParams {
  try {
    return new URLSearchParams(location.search);
  } catch {
    return new URLSearchParams();
  }
}

function isOptedOut(): boolean {
  try {
    const flag = query().get('dev');
    if (flag === '1') localStorage.setItem(DEV_KEY, '1');
    else if (flag === '0') localStorage.removeItem(DEV_KEY);
    return localStorage.getItem(DEV_KEY) === '1';
  } catch {
    return false;
  }
}

/** Bots, previews, local files and our own browsers are never logged. `?tel=force` overrides (for verifying the write path). */
function looksAutomated(): boolean {
  if (typeof navigator === 'undefined') return true;
  if (isOptedOut()) return true;
  if (query().get('tel') === 'force') return false;
  if (location.protocol !== 'https:' && location.protocol !== 'http:') return true;
  if ((navigator as Navigator & { webdriver?: boolean }).webdriver === true) return true;
  return /bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|selenium|lighthouse|scanner|curl\/|wget|python-requests|facebookexternalhit|bingpreview|preview/i.test(
    navigator.userAgent || '',
  );
}

/** iPadOS reports a Mac UA (only touch points give it away); Android tablets omit "Mobile". */
function detectDevice(): { device: string; platform: string } {
  const ua = navigator.userAgent || '';
  const touch = navigator.maxTouchPoints ?? 0;
  const isIPadOS = /Macintosh/.test(ua) && touch > 1;
  const isIOS = /iPhone|iPod|iPad/.test(ua) || isIPadOS;
  const isAndroid = /Android/.test(ua);
  const platform = isIOS
    ? 'iOS'
    : isAndroid
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /CrOS/.test(ua)
          ? 'ChromeOS'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'other';
  const device =
    /iPad/.test(ua) || isIPadOS || (isAndroid && !/Mobile/.test(ua))
      ? 'tablet'
      : isIOS || isAndroid || /Mobi/.test(ua)
        ? 'mobile'
        : 'desktop';
  return { device, platform };
}

/** Link tags survive being pasted into a chat, where document.referrer dies. */
function landingTags(): Record<string, string> {
  const tags: Record<string, string> = {};
  const q = query();
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 's', 'src', 'ref']) {
    const v = q.get(key);
    if (v) tags[key === 's' ? 'src' : key] = v.slice(0, 60);
  }
  if ((navigator as Navigator & { standalone?: boolean }).standalone || matchMedia?.('(display-mode: standalone)').matches)
    tags.display = 'standalone';
  return tags;
}

interface Visit {
  id: string;
  ts: number;
  games: number;
  /** The tagged source this sitting arrived through (src / utm_source), if any. */
  src?: string;
}

interface Player {
  id: string;
  visits: number;
  games: number;
  first_seen: string;
}

let suppressed = true;
let installed = false;
let visit: Visit = { id: '', ts: 0, games: 0 };
let player: Player | null = null;
let base: Record<string, unknown> = {};
let tags: Record<string, string> = {};

/** A sitting continues until 30 minutes pass without a write. */
function touchVisit(): void {
  if (Date.now() - visit.ts > VISIT_IDLE_MS) {
    visit = { id: newId(), ts: Date.now(), games: 0 };
    if (player) {
      player.visits += 1;
      store(PLAYER_KEY, player);
    }
  }
  visit.ts = Date.now();
  store(VISIT_KEY, visit);
}

/* ---- the game row in flight ---- */

interface GameRow {
  session_id: string;
  visit_id: string;
  game_index: number;
  started_at: string;
  picks: number;
  finished: boolean;
  score_hundredths: number | null;
  spent_cents: number;
  shared: boolean;
  share_result: string | null;
  meta: Record<string, unknown>;
}

let game: GameRow | null = null;
/** Flags noticed outside a game (e.g. the app was just installed), applied to the next game row. */
const pendingMeta: Record<string, unknown> = {};
let gameStartedMs = 0;
let activeMs = 0;
let visibleSince = 0;

function activeSeconds(): number {
  return Math.round((activeMs + (visibleSince ? Date.now() - visibleSince : 0)) / 1000);
}

function headers(): HeadersInit {
  return { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
}

function post(url: string, p: unknown, keepalive = false): void {
  try {
    void fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify({ p }), keepalive }).catch(() => {});
  } catch {
    /* never surfaces to the player */
  }
}

function pushGame(keepalive = false): void {
  if (suppressed || !game) return;
  touchVisit();
  post(
    GAME_RPC,
    {
      ...base,
      ...game,
      duration_s: Math.round((Date.now() - gameStartedMs) / 1000),
      meta: { ...game.meta, active_s: activeSeconds() },
    },
    keepalive,
  );
}

let pending: number | null = null;
function schedule(): void {
  if (suppressed || pending !== null) return;
  pending = window.setTimeout(() => {
    pending = null;
    pushGame();
  }, 400);
}

export function initTelemetry(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  if (looksAutomated()) return;
  suppressed = false;

  tags = landingTags();
  const arrivalSrc = tags.src || tags.utm_source || '';
  const saved = store<Visit>(VISIT_KEY);
  const live = saved && typeof saved.id === 'string' && Date.now() - saved.ts <= VISIT_IDLE_MS;
  // Arriving through a differently tagged link (home-screen app ?s=pwa, a shared menu, a
  // campaign) starts a new visit, as analytics tools do. Otherwise the arrival row, which is
  // written once per visit, would keep the earlier untagged source and the tag would be lost.
  const newSource = !!arrivalSrc && (saved?.src ?? '') !== arrivalSrc;
  visit = live && !newSource ? saved! : { id: newId(), ts: Date.now(), games: 0, ...(arrivalSrc ? { src: arrivalSrc } : {}) };
  const isNewVisit = !saved || saved.id !== visit.id;

  const p = store<Player>(PLAYER_KEY);
  player =
    p && typeof p.id === 'string'
      ? { ...p, visits: p.visits + (isNewVisit ? 1 : 0) }
      : { id: newId(), visits: 1, games: 0, first_seen: new Date().toISOString().slice(0, 10) };
  store(PLAYER_KEY, player);

  base = {
    env: /^(localhost|127\.|\[?::1)/.test(location.hostname) ? 'dev' : 'prod',
    referrer: document.referrer.slice(0, 300) || null,
    screen: `${screen?.width ?? 0}x${screen?.height ?? 0}`,
    app_version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null,
    ...detectDevice(),
  };

  // Arrival, a second after load so an instant close costs nothing.
  window.setTimeout(() => {
    touchVisit();
    post(
      LOAD_RPC,
      { ...base, visit_id: visit.id, webdriver: navigator.webdriver === true, meta: { ...tags, host: location.hostname } },
      true,
    );
  }, 1000);

  visibleSince = document.visibilityState === 'visible' ? Date.now() : 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (visibleSince) activeMs += Date.now() - visibleSince;
      visibleSince = 0;
      pushGame(true);
    } else if (!visibleSince) {
      visibleSince = Date.now();
    }
  });
  window.addEventListener('pagehide', () => pushGame(true));

  // Installed to the home screen from this page (Chrome/Edge/Android fire this; iOS does not).
  window.addEventListener('appinstalled', () => {
    if (game) trackExtra('installed', true);
    else pendingMeta.installed = true;
  });
}

/**
 * A game begins (Start cooking / Cook again), or a saved game resumes after a refresh.
 * The row id is derived from the run's seed so a resumed game updates its own row
 * instead of counting twice.
 */
export function trackGameStart(seed: number, opts: { resumed?: boolean; picks?: number; spentCents?: number } = {}): void {
  if (suppressed || !player) return;
  const sessionId = `${player.id}:${seed >>> 0}`;
  if (game?.session_id === sessionId) return; // double-fire (StrictMode, re-render)
  if (game) pushGame(); // flush the game that just ended
  touchVisit();
  if (!opts.resumed) {
    visit.games += 1;
    player.games += 1;
    store(VISIT_KEY, visit);
    store(PLAYER_KEY, player);
  }
  game = {
    session_id: sessionId,
    visit_id: visit.id,
    game_index: Math.max(visit.games, 1),
    started_at: new Date().toISOString(),
    picks: opts.picks ?? 0,
    finished: false,
    score_hundredths: null,
    spent_cents: opts.spentCents ?? 0,
    shared: false,
    share_result: null,
    meta: {
      ...tags,
      player_id: player.id,
      player_visits: player.visits,
      player_games: player.games,
      first_seen: player.first_seen,
      ...(opts.resumed ? { resumed: true } : {}),
      ...pendingMeta,
    },
  };
  for (const k of Object.keys(pendingMeta)) delete pendingMeta[k];
  gameStartedMs = Date.now();
  activeMs = 0;
  visibleSince = document.visibilityState === 'visible' ? Date.now() : 0;
  schedule();
}

/** A course was served. `order` lists dish ids in purchase order. */
export function trackPick(picks: number, spentCents: number, order: string[], courseOrder: string[]): void {
  if (suppressed || !game) return;
  if (picks <= game.picks) return;
  game.picks = picks;
  game.spent_cents = spentCents;
  game.meta.dishes = order;
  game.meta.course_order = courseOrder;
  schedule();
}

export function trackGameEnd(scoreHundredths: number, spentCents: number): void {
  if (suppressed || !game || game.finished) return;
  game.finished = true;
  game.picks = 5;
  game.score_hundredths = scoreHundredths;
  game.spent_cents = spentCents;
  schedule();
}

/** shared | cancelled | unsupported | copied | downloaded */
export function trackShare(result: string): void {
  if (suppressed || !game) return;
  game.shared = true;
  game.share_result = result;
  game.meta[`share_${result}`] = true;
  schedule();
}

export function trackExtra(key: string, value: unknown): void {
  if (suppressed || !game) return;
  game.meta[key] = value;
  schedule();
}
