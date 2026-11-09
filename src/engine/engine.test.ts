import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import validation from '../data/catalog-validation.json';
import { catalog, COURSES, getDish, minCostByCourse, validateCatalog } from './catalog';
import {
  checkPurchase,
  finishReveal,
  finishServing,
  isLegal,
  newRun,
  purchase,
  remainingCents,
  RunState,
  sanitizeRestored,
  scoreHundredths,
} from './engine';
import { nextFloat } from './rng';

const ready = (run: RunState) => finishReveal(finishServing(run));

describe('catalog', () => {
  it('is valid and matches the counts in catalog-validation.json', () => {
    expect(validateCatalog()).toEqual([]);
    expect(catalog.catalogVersion).toBe(validation.catalogVersion);
    expect(catalog.dishes.length).toBe(validation.dishCount);
    expect(catalog.cuisines.length).toBe(validation.cuisineCount);
    expect(catalog.ingredients.length).toBe(validation.ingredientCount);
    expect(catalog.supportedPairs.length).toBe(validation.supportedPairCount);
    for (const c of COURSES) {
      expect(catalog.dishes.filter((d) => d.course === c).length).toBe(
        (validation.dishesPerCourse as Record<string, number>)[c],
      );
    }
    for (const [cuisine, n] of Object.entries(validation.dishesPerCuisine)) {
      expect(catalog.dishes.filter((d) => d.cuisine === cuisine).length).toBe(n);
    }
  });

  it('all 90 dishes have production art', () => {
    expect(catalog.dishes.filter((d) => d.imageSrc && d.artStatus === 'ready').length).toBe(catalog.dishes.length);
  });

  it('every imageSrc points at a real local asset', () => {
    for (const d of catalog.dishes) {
      if (d.imageSrc) {
        expect(existsSync(resolve(__dirname, '../../public', d.imageSrc)), d.imageSrc).toBe(true);
        // 256px variant used by srcset on small displays
        const small = d.imageSrc.replace('dishes/', 'dishes/sm/');
        expect(existsSync(resolve(__dirname, '../../public', small)), small).toBe(true);
        expect(d.artStatus).toBe('ready');
      }
    }
  });
});

describe('fixtures', () => {
  for (const key of ['sampleRun', 'perfectMenu'] as const) {
    it(`${key} matches exact sums`, () => {
      const f = validation[key];
      const dishes = f.dishIds.map(getDish);
      expect(dishes.reduce((s, d) => s + d.costCents, 0)).toBe(f.costCents);
      expect(scoreHundredths(f.dishIds)).toBe(Math.round(f.score * 100));
      expect(new Set(dishes.map((d) => d.course)).size).toBe(5);
    });
  }

  it('sample run is purchasable in the brief order under the reserve rule', () => {
    let run: RunState = { ...newRun(1), phase: 'choosing' };
    for (const id of validation.sampleRun.dishIds) {
      run = { ...run, offer: { ...run.offer!, dishIds: [id], turn: run.picks.length + 1 } };
      const r = purchase(run, id);
      expect(r.ok).toBe(true);
      run = ready(r.run);
    }
    expect(run.phase).toBe('results');
    expect(remainingCents(run)).toBe(400);
    expect(scoreHundredths(run.picks)).toBe(448);
  });
});

describe('rules', () => {
  it('start produces exactly one offer, revealing, for pick 1', () => {
    const run = newRun(42);
    expect(run.phase).toBe('revealing');
    expect(run.offer?.turn).toBe(1);
    expect(run.picks).toEqual([]);
  });

  it('same seed and purchases reproduce the run', () => {
    const play = (seed: number) => {
      let run = ready(newRun(seed));
      const offers: string[] = [];
      while (run.phase !== 'results') {
        offers.push(`${run.offer!.cuisine}/${run.offer!.ingredient}`);
        const id = run.offer!.dishIds.find((x) => isLegal(run, x))!;
        run = ready((purchase(run, id) as { run: RunState }).run);
      }
      return offers;
    };
    expect(play(123)).toEqual(play(123));
  });

  it('rejects purchases outside choosing, duplicates and double confirms', () => {
    let run = newRun(7);
    const id = run.offer!.dishIds.find((x) => isLegal(run, x))!;
    expect(purchase(run, id).ok).toBe(false); // still revealing
    run = finishReveal(run);
    const r1 = purchase(run, id);
    expect(r1.ok).toBe(true);
    // stale double-click on the pre-purchase state is fine to evaluate but the UI holds only the new one:
    const r2 = purchase(r1.run, id);
    expect(r2.ok).toBe(false);
    expect(r1.run.spentCents).toBe(getDish(id).costCents);
  });

  it('main or dessert can be bought first', () => {
    for (const course of ['main', 'dessert'] as const) {
      let found = false;
      for (let seed = 1; seed < 500 && !found; seed++) {
        const run = finishReveal(newRun(seed));
        const id = run.offer!.dishIds.find((x) => getDish(x).course === course && isLegal(run, x));
        if (id) {
          expect(purchase(run, id).ok).toBe(true);
          found = true;
        }
      }
      expect(found).toBe(true);
    }
  });

  it('explains the completion reserve', () => {
    // Spend down to $18 with three courses left, then try a $24 main.
    // Appetizer + soup filled, $18 left, three courses open. An $18 main fits the cash
    // but would leave nothing for salad and dessert.
    const run: RunState = { ...newRun(1), phase: 'choosing', spentCents: 3200, picks: ['it-appetizer-03', 'fr-soup-03'] };
    const e = checkPurchase(run, 'it-main-02');
    expect(e.ok).toBe(false);
    if (!e.ok) {
      expect(e.reason).toBe('reserve');
      expect(e.reserveCents).toBe(minCostByCourse.salad + minCostByCourse.dessert);
      expect(e.coursesLeft).toBe(2);
    }
  });

  it('restore rejects tampered or mismatched state', () => {
    const run = newRun(9);
    expect(sanitizeRestored(JSON.parse(JSON.stringify(run)))).not.toBeNull();
    expect(sanitizeRestored({ ...run, catalogVersion: 'old' })).toBeNull();
    expect(sanitizeRestored({ ...run, spentCents: 100 })).toBeNull();
    expect(sanitizeRestored({ ...run, picks: ['nope'] })).toBeNull();
    expect(sanitizeRestored(null)).toBeNull();
  });
});

describe('simulation', () => {
  it('3,000 seeded runs with mixed strategies never dead-end or overspend', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let seed = 1; seed <= 3000; seed++) {
      let run = ready(newRun(seed * 2654435761));
      let pick = seed;
      const strategy = seed % 3;
      while (run.phase !== 'results') {
        const legal = run.offer!.dishIds.filter((x) => isLegal(run, x));
        expect(legal.length).toBeGreaterThan(0);
        let id: string;
        if (strategy === 0) {
          const [f] = nextFloat(pick++);
          id = legal[Math.floor(f * legal.length)];
        } else if (strategy === 1) {
          id = legal.reduce((a, b) => (getDish(b).ratingTenths > getDish(a).ratingTenths ? b : a));
        } else {
          id = legal.reduce((a, b) => (getDish(b).costCents < getDish(a).costCents ? b : a));
        }
        const r = purchase(run, id);
        expect(r.ok).toBe(true);
        run = ready(r.run);
        expect(remainingCents(run)).toBeGreaterThanOrEqual(0);
      }
      expect(new Set(run.picks.map((x) => getDish(x).course)).size).toBe(5);
      const s = scoreHundredths(run.picks);
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
    }
    expect(lo).toBeGreaterThanOrEqual(300);
    expect(hi).toBeLessThanOrEqual(500);
  }, 60_000);
});
