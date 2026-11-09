/**
 * Leaderboards: today / this week / this month / all time (supabase/starchef-leaderboard.sql).
 *
 * Posting is opt-in from the results screen. One entry per player per board (their best),
 * shown under their restaurant name; names are unique, first come first served. The server
 * scores the menu itself from the dish ids, so a posted score can't be made up.
 *
 * Every call fails quietly: offline, blocked, or the SQL not yet run, the screens simply
 * render without a board. It never breaks the game.
 */
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './telemetry';

export type Period = 'day' | 'week' | 'month' | 'all';
export const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
];

export interface BoardRow {
  rank: number;
  name: string;
  score: number; // hundredths of a star
  you: boolean;
}

export interface BoardPeriod {
  total: number;
  top: BoardRow[];
  you: { rank: number; score: number } | null;
  /** Where the score asked about would land if posted now. */
  wouldRank: number | null;
  /** Epoch ms when this board resets (server clock); null for all time. */
  endsAt: number | null;
}

export interface Boards {
  periods: Record<Period, BoardPeriod>;
  /** This player's posted name, if they have posted before. */
  name: string | null;
}

export interface PostResult {
  score: number;
  ranks: Record<Period, number>;
  totals: Record<Period, number>;
}

const PLAYER_KEY = 'sc.board.player.v1';

/** One id per browser for the boards (separate from analytics, so opting out of analytics never blocks posting). */
export function boardPlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_KEY);
    if (existing) return existing;
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(PLAYER_KEY, id);
    return id;
  } catch {
    return 'anon';
  }
}

function env(): 'prod' | 'dev' {
  return /^(localhost|127\.|\[?::1)/.test(location.hostname) ? 'dev' : 'prod';
}

async function rpc<T>(name: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, message: err?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

interface RawPeriod {
  total: number;
  top: BoardRow[];
  you: { rank: number; score: number } | null;
  would_rank: number | null;
  seconds_left: number | null;
}

/** All four boards. `score` (hundredths) asks where an unposted result would land. */
export async function fetchBoards(score?: number): Promise<Boards | null> {
  const r = await rpc<Record<Period, RawPeriod> & { name: string | null }>('sc_board_get', {
    p_player_id: boardPlayerId(),
    p_score: score ?? null,
    p_env: env(),
  });
  if (!r.ok) return null;
  const now = Date.now();
  const periods = {} as Record<Period, BoardPeriod>;
  for (const { key } of PERIODS) {
    const p = r.data[key];
    if (!p) return null;
    periods[key] = {
      total: p.total ?? 0,
      top: p.top ?? [],
      you: p.you ?? null,
      wouldRank: p.would_rank ?? null,
      endsAt: p.seconds_left == null ? null : now + p.seconds_left * 1000,
    };
  }
  return { periods, name: r.data.name ?? null };
}

export type PostError = 'name taken' | 'name not allowed' | 'bad name' | 'bad menu' | 'network';

export async function postToBoards(name: string, dishIds: string[]): Promise<{ ok: true; result: PostResult } | { ok: false; error: PostError }> {
  const r = await rpc<PostResult>('sc_board_post', {
    p: { env: env(), player_id: boardPlayerId(), name: name.trim(), dish_ids: dishIds },
  });
  if (r.ok) return { ok: true, result: r.data };
  const known: PostError[] = ['name taken', 'name not allowed', 'bad name', 'bad menu'];
  return { ok: false, error: known.find((k) => r.message.includes(k)) ?? 'network' };
}

export function postErrorText(e: PostError): string {
  switch (e) {
    case 'name taken':
      return 'Another restaurant already uses that name. Try a different one.';
    case 'name not allowed':
      return 'That name can’t go on a public leaderboard. Try another.';
    case 'bad name':
      return 'Use 1 to 28 characters for your restaurant name.';
    case 'bad menu':
      return 'This menu couldn’t be verified, so it wasn’t posted.';
    default:
      return 'Couldn’t reach the leaderboard. Check your connection and try again.';
  }
}

/** "5h 12m", "2d 4h", "45m" */
export function timeLeft(endsAt: number): string {
  const s = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.max(1, Math.floor((s % 3600) / 60));
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
