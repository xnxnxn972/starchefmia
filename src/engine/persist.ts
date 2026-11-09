import { RunState, sanitizeRestored } from './engine';

const RUN_KEY = 'fsc.run.v1';
const BEST_KEY = 'fsc.best.v1';
const PREFS_KEY = 'fsc.prefs.v1';

export interface PersonalBest {
  hundredths: number;
  savedCents: number;
  dishIds: string[];
  date: string;
}

export interface Prefs {
  reduceMotion: boolean;
  restaurantName: string;
  /** Reveal sound is on by default; this remembers a mute. */
  muted: boolean;
}

function read(key: string): unknown {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the game still plays, it just won't restore */
  }
}

export type RestoreResult = { kind: 'none' } | { kind: 'ok'; run: RunState } | { kind: 'invalid' };

export function loadRun(): RestoreResult {
  const raw = read(RUN_KEY);
  if (raw === null) return { kind: 'none' };
  const run = sanitizeRestored(raw);
  return run ? { kind: 'ok', run } : { kind: 'invalid' };
}

export function saveRun(run: RunState | null) {
  write(RUN_KEY, run);
}

export function loadBest(): PersonalBest | null {
  const b = read(BEST_KEY) as PersonalBest | null;
  return b && typeof b.hundredths === 'number' ? b : null;
}

/** Records the result if it beats the stored best (stars first, then money saved). Returns true if new best. */
export function recordBest(candidate: PersonalBest): boolean {
  const prev = loadBest();
  const better =
    !prev ||
    candidate.hundredths > prev.hundredths ||
    (candidate.hundredths === prev.hundredths && candidate.savedCents > prev.savedCents);
  if (better) write(BEST_KEY, candidate);
  return better;
}

export function loadPrefs(): Prefs {
  const p = (read(PREFS_KEY) as Partial<Prefs>) || {};
  return {
    reduceMotion: !!p.reduceMotion,
    restaurantName: typeof p.restaurantName === 'string' ? p.restaurantName : '',
    muted: !!p.muted,
  };
}

export function savePrefs(p: Prefs) {
  write(PREFS_KEY, p);
}
