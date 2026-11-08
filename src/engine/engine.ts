/**
 * Pure game engine. No DOM, no timers, no randomness outside the seeded RNG stored in state.
 * Every function returns a new state; callers persist whatever comes back.
 */
import { catalog, COURSES, Course, Dish, getDish, minCostByCourse, SupportedPair } from './catalog';
import { nextFloat } from './rng';

export type RunPhase =
  | 'serving' // purchase committed, food being placed; next offer already drawn and saved
  | 'revealing' // inspiration labels animating toward the saved offer
  | 'choosing' // waiting for the player (preview is UI-only state on top of this)
  | 'results';

export interface Offer {
  turn: number; // 1..5, the pick this offer is for
  cuisine: string;
  ingredient: string; // ingredient id
  /** All matching dishes for still-open courses, in display order (legal or not). */
  dishIds: string[];
}

export interface RunState {
  stateVersion: 1;
  catalogVersion: string;
  seed: number;
  rng: number; // RNG position (uint32 state)
  budgetCents: number;
  spentCents: number;
  /** Purchased dish ids in purchase order. */
  picks: string[];
  offer: Offer | null;
  phase: RunPhase;
}

export const PICKS = catalog.config.picks;

export function filledCourses(run: RunState): Set<Course> {
  return new Set(run.picks.map((id) => getDish(id).course));
}

export function openCourses(run: RunState): Course[] {
  const filled = filledCourses(run);
  return COURSES.filter((c) => !filled.has(c));
}

export function remainingCents(run: RunState): number {
  return run.budgetCents - run.spentCents;
}

export function dishInCourse(run: RunState, course: Course): Dish | undefined {
  for (const id of run.picks) {
    const d = getDish(id);
    if (d.course === course) return d;
  }
  return undefined;
}

/** Sum of cheapest catalog dish for each course still open after buying a dish in `course`. */
export function reserveAfter(run: RunState, course: Course): number {
  return openCourses(run)
    .filter((c) => c !== course)
    .reduce((sum, c) => sum + minCostByCourse[c], 0);
}

export type Eligibility =
  | { ok: true }
  | { ok: false; reason: 'filled' | 'owned' | 'cash' | 'reserve' | 'phase'; reserveCents?: number; coursesLeft?: number };

export function checkPurchase(run: RunState, dishId: string): Eligibility {
  const dish = getDish(dishId);
  if (run.picks.includes(dishId)) return { ok: false, reason: 'owned' };
  if (filledCourses(run).has(dish.course)) return { ok: false, reason: 'filled' };
  const remaining = remainingCents(run);
  if (dish.costCents > remaining) return { ok: false, reason: 'cash' };
  const reserve = reserveAfter(run, dish.course);
  if (dish.costCents + reserve > remaining) {
    return { ok: false, reason: 'reserve', reserveCents: reserve, coursesLeft: openCourses(run).length - 1 };
  }
  return { ok: true };
}

export function isLegal(run: RunState, dishId: string): boolean {
  return checkPurchase(run, dishId).ok;
}

/** Display order: one dish per open course first (cheapest first within a course), then the rest. */
function orderOfferDishes(ids: string[]): string[] {
  const dishes = ids.map(getDish);
  const rankInCourse = new Map<string, number>();
  for (const c of COURSES) {
    dishes
      .filter((d) => d.course === c)
      .sort((a, b) => a.costCents - b.costCents)
      .forEach((d, i) => rankInCourse.set(d.id, i));
  }
  return dishes
    .slice()
    .sort(
      (a, b) =>
        rankInCourse.get(a.id)! - rankInCourse.get(b.id)! ||
        COURSES.indexOf(a.course) - COURSES.indexOf(b.course),
    )
    .map((d) => d.id);
}

interface Candidate {
  pair: SupportedPair;
  matching: string[]; // dishes for open courses
  legal: string[];
}

export function candidatePairs(run: RunState): Candidate[] {
  const open = new Set(openCourses(run));
  return catalog.supportedPairs.map((pair) => {
    const matching = pair.dishIds.filter((id) => open.has(getDish(id).course) && !run.picks.includes(id));
    const legal = matching.filter((id) => isLegal(run, id));
    return { pair, matching, legal };
  });
}

/**
 * Pick the next inspiration pair. Tiers, best first:
 *  1. at least two legal dishes spanning at least two different open courses
 *  2. at least two legal dishes
 *  3. a single legal dish
 * Uniform choice within the best non-empty tier.
 */
export function drawOffer(run: RunState): { offer: Offer; rng: number } | null {
  const cands = candidatePairs(run).filter((c) => c.legal.length > 0);
  const distinctCourses = (c: Candidate) => new Set(c.legal.map((id) => getDish(id).course)).size;
  const tiers = [
    cands.filter((c) => c.legal.length >= 2 && distinctCourses(c) >= 2),
    cands.filter((c) => c.legal.length >= 2),
    cands,
  ];
  const tier = tiers.find((t) => t.length > 0);
  if (!tier) return null;
  const [f, rng] = nextFloat(run.rng);
  const chosen = tier[Math.floor(f * tier.length)];
  return {
    offer: {
      turn: run.picks.length + 1,
      cuisine: chosen.pair.cuisine,
      ingredient: chosen.pair.ingredient,
      dishIds: orderOfferDishes(chosen.matching),
    },
    rng,
  };
}

export function newRun(seed: number): RunState {
  const base: RunState = {
    stateVersion: 1,
    catalogVersion: catalog.catalogVersion,
    seed: seed >>> 0,
    rng: seed >>> 0,
    budgetCents: catalog.config.budgetCents,
    spentCents: 0,
    picks: [],
    offer: null,
    phase: 'revealing',
  };
  const drawn = drawOffer(base);
  if (!drawn) throw new Error('Catalog produced no opening offer');
  return { ...base, offer: drawn.offer, rng: drawn.rng };
}

export type PurchaseResult = { ok: true; run: RunState } | { ok: false; run: RunState; reason: string };

/**
 * Commit a purchase. Only valid while choosing, for a dish in the current offer.
 * On success the next offer (if any) is drawn immediately so it can be saved before animation.
 */
export function purchase(run: RunState, dishId: string): PurchaseResult {
  if (run.phase !== 'choosing') return { ok: false, run, reason: 'phase' };
  if (!run.offer || !run.offer.dishIds.includes(dishId)) return { ok: false, run, reason: 'not-offered' };
  const elig = checkPurchase(run, dishId);
  if (!elig.ok) return { ok: false, run, reason: elig.reason };

  const dish = getDish(dishId);
  const after: RunState = {
    ...run,
    spentCents: run.spentCents + dish.costCents,
    picks: [...run.picks, dishId],
    offer: null,
    phase: 'serving',
  };
  if (after.picks.length >= PICKS) return { ok: true, run: after };

  const drawn = drawOffer(after);
  if (!drawn) {
    // Should be impossible with the reserve rule; keep the saved offer and do not advance.
    console.error('[engine] no eligible pair after purchase', { seed: run.seed, picks: after.picks });
    return { ok: false, run, reason: 'no-offer' };
  }
  return { ok: true, run: { ...after, offer: drawn.offer, rng: drawn.rng } };
}

/** serving → revealing (or results after the fifth pick). Idempotent for other phases. */
export function finishServing(run: RunState): RunState {
  if (run.phase !== 'serving') return run;
  return { ...run, phase: run.picks.length >= PICKS ? 'results' : 'revealing' };
}

/** revealing → choosing. Idempotent for other phases. */
export function finishReveal(run: RunState): RunState {
  if (run.phase !== 'revealing') return run;
  return { ...run, phase: 'choosing' };
}

export function totalRatingTenths(dishIds: string[]): number {
  return dishIds.reduce((s, id) => s + getDish(id).ratingTenths, 0);
}

/** Restaurant stars in hundredths (448 = 4.48). sum(tenths)/50 stars == sum(tenths)*2 hundredths. */
export function scoreHundredths(dishIds: string[]): number {
  return totalRatingTenths(dishIds) * 2;
}

export function formatStars(hundredths: number): string {
  return (hundredths / 100).toFixed(2);
}

export function formatMoney(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export function formatRating(tenths: number): string {
  return (tenths / 10).toFixed(1);
}

/** Checks a restored state against the catalog. Returns null if it cannot be trusted. */
export function sanitizeRestored(value: unknown): RunState | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as RunState;
  if (r.stateVersion !== 1 || r.catalogVersion !== catalog.catalogVersion) return null;
  if (!Array.isArray(r.picks) || r.picks.length > PICKS) return null;
  if (!['serving', 'revealing', 'choosing', 'results'].includes(r.phase)) return null;
  try {
    const courses = new Set<Course>();
    let spent = 0;
    for (const id of r.picks) {
      const d = getDish(id);
      if (courses.has(d.course)) return null;
      courses.add(d.course);
      spent += d.costCents;
    }
    if (spent !== r.spentCents || r.budgetCents !== catalog.config.budgetCents || spent > r.budgetCents) return null;
    if (r.picks.length < PICKS) {
      if (r.phase === 'results') return null;
      if (!r.offer || r.offer.turn !== r.picks.length + 1) return null;
      for (const id of r.offer.dishIds) {
        const d = getDish(id);
        if (courses.has(d.course)) return null;
      }
      if (!r.offer.dishIds.some((id) => isLegal(r, id))) return null;
    } else if (r.phase === 'choosing' || r.phase === 'revealing') {
      return null;
    }
  } catch {
    return null;
  }
  return r;
}
