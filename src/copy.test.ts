import { describe, expect, it } from 'vitest';
import { getDish } from './engine/catalog';
import { checkPurchase, finishReveal, finishServing, formatMoney, isLegal, newRun, purchase, RunState } from './engine/engine';
import { ineligibleNote, leavesLine, listJoin, reserveMessage } from './copy';

/** A choosing state with these dishes already served. */
function stateWith(picks: string[]): RunState {
  const spent = picks.reduce((s, id) => s + getDish(id).costCents, 0);
  return { ...newRun(1), phase: 'choosing', picks, spentCents: spent };
}

describe('reserve and leftover messages name the right courses', () => {
  it('the reported case: $19 left, main and dessert open', () => {
    // Mushroom Arancini $12, Corn Chowder $7, Chicken Black Bean Salad $12 -> $19 left
    const run = stateWith(['it-appetizer-03', 'us-soup-02', 'mx-salad-03']);
    // Brownie Sundae ($13, dessert) would leave $6, but the cheapest main is $10.
    expect(ineligibleNote(run, 'us-dessert-03')).toBe('Keep $10 for your main course (the cheapest main is $10).');
    // Mac and Cheese ($11, main) is allowed: the open dessert can cost as little as $4.
    expect(isLegal(run, 'us-main-01')).toBe(true);
    expect(leavesLine(run, 'us-main-01')).toBe('That leaves $8 for your dessert.');
  });

  it('several open courses are listed with their starting prices, in menu order', () => {
    // Only appetizer + soup served, $15 left: a $12 dessert leaves salad and main open.
    const run = { ...stateWith(['it-appetizer-03', 'fr-soup-03']), spentCents: 3500 };
    expect(ineligibleNote(run, 'it-dessert-03')).toBe('Keep $14 for your salad (from $4) and main course (from $10).');
    expect(leavesLine(run, 'jp-salad-01')).toBe('That leaves $11 for your main course and dessert.');
  });

  it('formats one to four courses', () => {
    expect(reserveMessage(['dessert'])).toBe('Keep $4 for your dessert (the cheapest dessert is $4).');
    expect(reserveMessage(['soup', 'salad', 'main', 'dessert'])).toBe(
      'Keep $22 for your soup (from $4), salad (from $4), main course (from $10) and dessert (from $4).',
    );
    expect(listJoin(['a'])).toBe('a');
    expect(listJoin(['a', 'b'])).toBe('a and b');
    expect(listJoin(['a', 'b', 'c'])).toBe('a, b and c');
  });

  it('the amount in every blocked-dish message is exactly what the rules hold back', () => {
    let checked = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      let run = finishReveal(newRun(seed * 7919));
      while (run.phase !== 'results') {
        for (const id of run.offer!.dishIds) {
          const e = checkPurchase(run, id);
          if (!e.ok && e.reason === 'reserve') {
            expect(ineligibleNote(run, id)!.startsWith(`Keep ${formatMoney(e.reserveCents!)} for your `)).toBe(true);
            checked++;
          }
        }
        const legal = run.offer!.dishIds.filter((x) => isLegal(run, x));
        const pick = legal.reduce((a, b) => (getDish(b).costCents > getDish(a).costCents ? b : a)); // spend big to hit the reserve often
        run = finishReveal(finishServing((purchase(run, pick) as { run: RunState }).run));
      }
    }
    expect(checked).toBeGreaterThan(50);
  }, 60_000);
});
