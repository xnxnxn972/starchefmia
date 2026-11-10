import { COURSE_LABEL, COURSE_SHORT, Course, COURSES, getDish, ingredientLabel, minCostByCourse } from './engine/catalog';
import { checkPurchase, formatMoney, openCourses, remainingCents, RunState } from './engine/engine';
export type MiaMood = 'welcome' | 'curious' | 'thoughtful' | 'serving' | 'celebrate';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'];

export function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** How a course reads mid-sentence: "appetizer", "soup", "salad", "main course", "dessert". */
const COURSE_IN_SENTENCE: Record<Course, string> = {
  appetizer: 'appetizer',
  soup: 'soup',
  salad: 'salad',
  main: 'main course',
  dessert: 'dessert',
};
/** "the cheapest main is $10" */
const COURSE_SINGULAR: Record<Course, string> = {
  appetizer: 'appetizer',
  soup: 'soup',
  salad: 'salad',
  main: 'main',
  dessert: 'dessert',
};

/** "soup", "soup and salad", "soup, salad and dessert" */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The courses still to buy after this dish, in menu order. */
function coursesAfter(run: RunState, dishId: string): Course[] {
  const course = getDish(dishId).course;
  return COURSES.filter((c) => c !== course && openCourses(run).includes(c));
}

/**
 * Why a dish is blocked by the completion reserve, naming the course(s) the money is held for
 * and what each costs at the least, so it matches the situation:
 *   "Keep $10 for your main course (the cheapest main is $10)."
 *   "Keep $18 for your salad (from $4) and main course (from $10)."
 */
export function reserveMessage(courses: Course[]): string {
  const total = courses.reduce((sum, c) => sum + minCostByCourse[c], 0);
  if (courses.length === 1) {
    const c = courses[0];
    return `Keep ${formatMoney(total)} for your ${COURSE_IN_SENTENCE[c]} (the cheapest ${COURSE_SINGULAR[c]} is ${formatMoney(minCostByCourse[c])}).`;
  }
  const parts = courses.map((c) => `${COURSE_IN_SENTENCE[c]} (from ${formatMoney(minCostByCourse[c])})`);
  return `Keep ${formatMoney(total)} for your ${listJoin(parts)}.`;
}

export function ineligibleNote(run: RunState, dishId: string): string | null {
  const e = checkPurchase(run, dishId);
  if (e.ok) return null;
  if (e.reason === 'reserve') return reserveMessage(coursesAfter(run, dishId));
  if (e.reason === 'cash') return `Costs more than your ${formatMoney(remainingCents(run))} left.`;
  return 'Course already served.';
}

export function leavesLine(run: RunState, dishId: string): string {
  const d = getDish(dishId);
  const left = remainingCents(run) - d.costCents;
  const rest = coursesAfter(run, dishId);
  if (rest.length === 0) return `That completes your menu with ${formatMoney(left)} to spare.`;
  return `That leaves ${formatMoney(left)} for your ${listJoin(rest.map((c) => COURSE_IN_SENTENCE[c]))}.`;
}

export interface MiaState {
  mood: MiaMood;
  line: string;
}

/** Brief, state-derived comments. They never hint at hidden scoring or judge the player. */
export function miaFor(run: RunState | null, selected: string | null, lastServed: string | null): MiaState {
  if (!run) return { mood: 'welcome', line: "Let's build your opening-night menu." };
  switch (run.phase) {
    case 'revealing':
      return { mood: 'curious', line: run.picks.length === 0 ? "Here is today's inspiration." : 'Next inspiration…' };
    case 'serving': {
      const d = lastServed ? getDish(lastServed) : null;
      return { mood: 'serving', line: d ? `${COURSE_LABEL[d.course]}, ready.` : 'Serving…' };
    }
    case 'results':
      return { mood: 'celebrate', line: 'Your opening-night menu is complete.' };
    case 'choosing': {
      if (selected) {
        const note = ineligibleNote(run, selected);
        return { mood: 'thoughtful', line: note ?? leavesLine(run, selected) };
      }
      const open = openCourses(run);
      if (run.picks.length === 0) return { mood: 'welcome', line: "Let's build your opening-night menu." };
      if (open.length === 1) return { mood: 'welcome', line: `Last one: the ${COURSE_SHORT[open[0]]}.` };
      return { mood: 'welcome', line: `${cap(countWord(open.length))} courses to go.` };
    }
  }
}

export function inspirationAnnouncement(run: RunState): string {
  if (!run.offer) return '';
  const n = run.offer.dishIds.length;
  return `Today's inspiration: ${run.offer.cuisine} and ${ingredientLabel.get(run.offer.ingredient)}. ${n} matching dish${n === 1 ? '' : 'es'}.`;
}
